import { logger } from '../middleware/logger.js'
import {
  executeSQL,
  finalizeTaskWriteWithRegisteredAdapter,
} from '../services/dbService.js'
import {
  drainTaskWriteFinalizationOutbox,
  type DrainTaskWriteFinalizationOutboxResult,
} from '../services/taskWriteFinalizationOutboxService.js'
import { runJobWithRetry, runWithJobLease } from '../services/jobRuntime.js'
import { PersistentWallClockJobTimer } from '../services/persistentJobScheduleService.js'

export const TASK_WRITE_FINALIZATION_OUTBOX_JOB_NAME = 'taskWriteFinalizationOutboxJob'
export const TASK_WRITE_FINALIZATION_OUTBOX_INTERVAL_MINUTES = 1

const DEFAULT_LIMIT = 50
const DEFAULT_MAX_BATCHES = 4
const DEFAULT_BACKLOG_AGE_GATE_MS = 5 * 60 * 1_000

type Timer = Pick<PersistentWallClockJobTimer, 'start' | 'stop' | 'getStatus'>
type TimerOptions = ConstructorParameters<typeof PersistentWallClockJobTimer>[0]

type JobOptions = {
  queryExec?: Parameters<typeof drainTaskWriteFinalizationOutbox>[0]['queryExec']
  finalize?: Parameters<typeof drainTaskWriteFinalizationOutbox>[0]['finalize']
  drain?: typeof drainTaskWriteFinalizationOutbox
  leaseRunner?: typeof runWithJobLease
  retryRunner?: typeof runJobWithRetry
  timerFactory?: (options: TimerOptions) => Timer
  ownerId?: string
  now?: () => string
  limit?: number
  maxBatches?: number
  backlogAgeGateMs?: number
}

type FailureReason =
  | 'processor_failures'
  | 'ready_backlog_remaining'
  | 'expired_processing_remaining'
  | 'backlog_age_exceeded'

export class TaskWriteFinalizationOutboxIncompleteError extends Error {
  readonly details: { failureReasons: FailureReason[]; result: DrainTaskWriteFinalizationOutboxResult }

  constructor(result: DrainTaskWriteFinalizationOutboxResult, failureReasons: FailureReason[]) {
    super(`task_write_finalization_outbox_incomplete:${failureReasons.join(',')}`)
    this.name = 'TaskWriteFinalizationOutboxIncompleteError'
    this.details = { failureReasons, result }
  }
}

function assertComplete(result: DrainTaskWriteFinalizationOutboxResult) {
  const failureReasons: FailureReason[] = []
  if (result.failed > 0 || result.failureIds.length > 0) failureReasons.push('processor_failures')
  if (result.readyBacklogCount > 0) failureReasons.push('ready_backlog_remaining')
  if (result.expiredProcessingCount > 0) failureReasons.push('expired_processing_remaining')
  if (result.backlogAgeExceeded) failureReasons.push('backlog_age_exceeded')
  if (failureReasons.length > 0) {
    throw new TaskWriteFinalizationOutboxIncompleteError(result, failureReasons)
  }
  return result
}

function createJobId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

export class TaskWriteFinalizationOutboxJob {
  private isRunning = false
  private activeLeaseCallbackCount = 0
  private lastRun: Date | null = null
  private nextRun: Date | null = null
  private readonly timer: Timer

  constructor(private readonly options: JobOptions = {}) {
    const timerFactory = options.timerFactory
      ?? ((timerOptions: TimerOptions) => new PersistentWallClockJobTimer(timerOptions))
    this.timer = timerFactory({
      jobName: TASK_WRITE_FINALIZATION_OUTBOX_JOB_NAME,
      schedule: { kind: 'minute_interval', intervalMinutes: TASK_WRITE_FINALIZATION_OUTBOX_INTERVAL_MINUTES },
      execute: () => this.execute('scheduler'),
      onScheduled: ({ nextRun }) => { this.nextRun = nextRun },
      onError: (error) => logger.error('taskWriteFinalizationOutboxJob scheduler failed', {
        error: error instanceof Error ? error.message : String(error),
      }),
    })
  }

  start() {
    this.timer.start()
  }

  stop() {
    this.timer.stop()
    this.nextRun = null
  }

  getStatus() {
    const timerStatus = this.timer.getStatus()
    const nextRun = this.nextRun ?? timerStatus.nextRun
    return {
      isRunning: this.isRunning || this.activeLeaseCallbackCount > 0,
      isScheduled: timerStatus.isScheduled,
      lastRun: this.lastRun?.toISOString() ?? null,
      nextRun: nextRun?.toISOString() ?? null,
    }
  }

  executeNow() {
    return this.execute('manual')
  }

  private async execute(triggeredBy: 'scheduler' | 'manual') {
    if (this.isRunning || this.activeLeaseCallbackCount > 0) {
      return { status: 'skipped' as const, reason: 'already_running' as const }
    }
    this.isRunning = true
    this.lastRun = new Date()
    const jobId = createJobId()
    const retryRunner = this.options.retryRunner ?? runJobWithRetry
    const leaseRunner = this.options.leaseRunner ?? runWithJobLease
    const drain = this.options.drain ?? drainTaskWriteFinalizationOutbox
    try {
      const execution = await retryRunner(
        {
          jobName: TASK_WRITE_FINALIZATION_OUTBOX_JOB_NAME,
          triggeredBy,
          jobId,
          maxAttempts: 1,
        },
        async (_attempt, attemptContext) => leaseRunner(
          { jobName: TASK_WRITE_FINALIZATION_OUTBOX_JOB_NAME, jobId },
          async (lease) => {
            this.activeLeaseCallbackCount += 1
            try {
              lease.assertActive()
              const result = await drain({
                queryExec: this.options.queryExec ?? executeSQL,
                finalize: this.options.finalize ?? finalizeTaskWriteWithRegisteredAdapter,
                ownerId: this.options.ownerId?.trim()
                  || `${TASK_WRITE_FINALIZATION_OUTBOX_JOB_NAME}:${process.env.HOSTNAME ?? 'local'}:${process.pid}:${jobId}`,
                now: this.options.now?.() ?? new Date().toISOString(),
                limit: this.options.limit ?? DEFAULT_LIMIT,
                maxBatches: this.options.maxBatches ?? DEFAULT_MAX_BATCHES,
                backlogAgeGateMs: this.options.backlogAgeGateMs ?? DEFAULT_BACKLOG_AGE_GATE_MS,
                signal: AbortSignal.any([attemptContext.signal, lease.signal]),
              })
              lease.assertActive()
              return assertComplete(result)
            } finally {
              this.activeLeaseCallbackCount = Math.max(0, this.activeLeaseCallbackCount - 1)
            }
          },
        ),
      )
      if (!execution.value.acquired) {
        return { status: 'skipped' as const, reason: 'lease_not_acquired' as const }
      }
      return { status: 'completed' as const, attempts: execution.attempts, ...execution.value.value }
    } catch (error) {
      logger.error('taskWriteFinalizationOutboxJob failed', {
        jobId,
        triggeredBy,
        error: error instanceof Error ? error.message : String(error),
      })
      throw error
    } finally {
      this.isRunning = false
    }
  }
}

export const taskWriteFinalizationOutboxJob = new TaskWriteFinalizationOutboxJob()
