import { logger } from '../middleware/logger.js'
import {
  drainTaskWriteFinalizationOutbox,
  type DrainTaskWriteFinalizationOutboxResult,
} from '../services/taskWriteFinalizationOutboxService.js'
import { finalizeTaskWriteFromLegacyMutation } from '../services/taskWriteChainService.js'
import { runJobWithRetry, runWithJobLease } from '../services/jobRuntime.js'
import { PersistentWallClockJobTimer } from '../services/persistentJobScheduleService.js'

export const TASK_WRITE_FINALIZATION_OUTBOX_DRAIN_JOB_NAME =
  'taskWriteFinalizationOutboxDrainJob'
export const TASK_WRITE_FINALIZATION_OUTBOX_DRAIN_INTERVAL_MINUTES = 5

const DEFAULT_LIMIT = 50
const DEFAULT_MAX_BATCHES = 4
const DEFAULT_BACKLOG_AGE_GATE_MS = 15 * 60 * 1_000

type DrainTimer = {
  start(): boolean
  stop(): boolean
  getStatus(): { isScheduled: boolean; nextRun: Date | null }
}

type DrainTimerOptions = {
  jobName: string
  schedule: { kind: 'minute_interval'; intervalMinutes: number }
  execute: () => Promise<unknown>
  onScheduled: (details: { nextRun: Date; delayMs: number }) => void
  onError: (error: unknown) => void
}

type TaskWriteFinalizationOutboxDrainJobOptions = {
  drain?: typeof drainTaskWriteFinalizationOutbox
  leaseRunner?: typeof runWithJobLease
  retryRunner?: typeof runJobWithRetry
  timerFactory?: (options: DrainTimerOptions) => DrainTimer
  ownerId?: string
  now?: () => string
  limit?: number
  maxBatches?: number
  backlogAgeGateMs?: number
}

function createJobId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

type TaskWriteFinalizationOutboxDrainFailureReason =
  | 'processor_failures'
  | 'ready_backlog_remaining'
  | 'expired_processing_remaining'
  | 'backlog_age_exceeded'

export class TaskWriteFinalizationOutboxDrainIncompleteError extends Error {
  readonly details: {
    failureReasons: TaskWriteFinalizationOutboxDrainFailureReason[]
    result: DrainTaskWriteFinalizationOutboxResult
  }

  constructor(
    result: DrainTaskWriteFinalizationOutboxResult,
    failureReasons: TaskWriteFinalizationOutboxDrainFailureReason[],
  ) {
    super(`task_write_finalization_outbox_drain_incomplete:${failureReasons.join(',')}`)
    this.name = 'TaskWriteFinalizationOutboxDrainIncompleteError'
    this.details = { failureReasons, result }
  }
}

function assertDrainComplete(
  result: DrainTaskWriteFinalizationOutboxResult,
): DrainTaskWriteFinalizationOutboxResult {
  const failureReasons: TaskWriteFinalizationOutboxDrainFailureReason[] = []
  if (result.failed > 0 || result.failureIds.length > 0) failureReasons.push('processor_failures')
  if (result.readyBacklogCount > 0) failureReasons.push('ready_backlog_remaining')
  if (result.expiredProcessingCount > 0) failureReasons.push('expired_processing_remaining')
  if (result.backlogAgeExceeded) failureReasons.push('backlog_age_exceeded')
  if (failureReasons.length > 0) {
    throw new TaskWriteFinalizationOutboxDrainIncompleteError(result, failureReasons)
  }
  return result
}

export class TaskWriteFinalizationOutboxDrainJob {
  private isRunning = false
  private activeLeaseCallbackCount = 0
  private lastRun: Date | null = null
  private nextRun: Date | null = null
  private readonly wallClockTimer: DrainTimer

  constructor(private readonly options: TaskWriteFinalizationOutboxDrainJobOptions = {}) {
    const timerFactory = options.timerFactory
      ?? ((timerOptions: DrainTimerOptions) => new PersistentWallClockJobTimer(timerOptions))
    this.wallClockTimer = timerFactory({
      jobName: TASK_WRITE_FINALIZATION_OUTBOX_DRAIN_JOB_NAME,
      schedule: {
        kind: 'minute_interval',
        intervalMinutes: TASK_WRITE_FINALIZATION_OUTBOX_DRAIN_INTERVAL_MINUTES,
      },
      execute: () => this.execute('scheduler'),
      onScheduled: ({ nextRun, delayMs }) => {
        this.nextRun = nextRun
        logger.info('taskWriteFinalizationOutboxDrainJob scheduled', {
          nextRun: nextRun.toISOString(),
          trigger: 'every_5_minutes',
          initialDelay: delayMs,
        })
      },
      onError: (error) => logger.error('taskWriteFinalizationOutboxDrainJob scheduler failed', {
        error: error instanceof Error ? error.message : String(error),
      }),
    })
  }

  start() {
    if (!this.wallClockTimer.start()) {
      logger.warn('taskWriteFinalizationOutboxDrainJob is already scheduled')
    }
  }

  stop() {
    this.wallClockTimer.stop()
    this.nextRun = null
    logger.info('taskWriteFinalizationOutboxDrainJob stopped')
  }

  getStatus() {
    const timerStatus = this.wallClockTimer.getStatus()
    const nextRun = this.nextRun ?? timerStatus.nextRun
    return {
      isRunning: this.isRunning || this.activeLeaseCallbackCount > 0,
      isScheduled: timerStatus.isScheduled,
      lastRun: this.lastRun ? this.lastRun.toISOString() : null,
      nextRun: nextRun ? nextRun.toISOString() : null,
    }
  }

  async executeNow() {
    return this.execute('manual')
  }

  private async execute(triggeredBy: 'scheduler' | 'manual') {
    if (this.isRunning) {
      logger.warn('taskWriteFinalizationOutboxDrainJob is already running, skip tick', {
        triggeredBy,
        reason: 'already_running',
      })
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
          jobName: TASK_WRITE_FINALIZATION_OUTBOX_DRAIN_JOB_NAME,
          triggeredBy,
          jobId,
          maxAttempts: 1,
        },
        async (_attempt, attemptContext) => leaseRunner(
          {
            jobName: TASK_WRITE_FINALIZATION_OUTBOX_DRAIN_JOB_NAME,
            jobId,
          },
          async (lease) => {
            this.activeLeaseCallbackCount += 1
            try {
              lease.assertActive()
              const now = this.options.now?.() ?? new Date().toISOString()
              const ownerId = this.options.ownerId?.trim()
                || `${TASK_WRITE_FINALIZATION_OUTBOX_DRAIN_JOB_NAME}:${process.env.HOSTNAME ?? 'local'}:${process.pid}:${jobId}`
              const result = await drain({
                ownerId,
                now,
                limit: this.options.limit ?? DEFAULT_LIMIT,
                maxBatches: this.options.maxBatches ?? DEFAULT_MAX_BATCHES,
                backlogAgeGateMs: this.options.backlogAgeGateMs ?? DEFAULT_BACKLOG_AGE_GATE_MS,
                finalize: finalizeTaskWriteFromLegacyMutation,
                signal: AbortSignal.any([attemptContext.signal, lease.signal]),
              })
              lease.assertActive()
              return assertDrainComplete(result)
            } finally {
              this.activeLeaseCallbackCount = Math.max(0, this.activeLeaseCallbackCount - 1)
            }
          },
        ),
      )

      const lease = execution.value
      if (!lease.acquired) {
        logger.warn('taskWriteFinalizationOutboxDrainJob skipped because distributed lease was not acquired', {
          triggeredBy,
          jobId,
          reason: 'lease_not_acquired',
        })
        return { status: 'skipped' as const, reason: 'lease_not_acquired' as const }
      }

      return {
        status: 'completed' as const,
        attempts: execution.attempts,
        ...lease.value,
      }
    } catch (error) {
      logger.error('taskWriteFinalizationOutboxDrainJob failed', {
        triggeredBy,
        jobId,
        error: error instanceof Error ? error.message : String(error),
      })
      throw error
    } finally {
      this.isRunning = false
    }
  }
}

export const taskWriteFinalizationOutboxDrainJob =
  new TaskWriteFinalizationOutboxDrainJob()
