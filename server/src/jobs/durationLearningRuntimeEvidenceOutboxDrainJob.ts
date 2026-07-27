import { logger } from '../middleware/logger.js'
import { executeSQL } from '../services/dbService.js'
import {
  drainDurationLearningRuntimeEvidenceOutbox,
  type DrainDurationLearningRuntimeEvidenceOutboxResult,
} from '../services/durationLearningRuntimeEvidenceOutboxService.js'
import {
  runJobWithRetry,
  runWithJobLease,
} from '../services/jobRuntime.js'
import { PersistentWallClockJobTimer } from '../services/persistentJobScheduleService.js'

export const DURATION_LEARNING_RUNTIME_EVIDENCE_OUTBOX_DRAIN_JOB_NAME =
  'durationLearningRuntimeEvidenceOutboxDrainJob'
export const DURATION_LEARNING_RUNTIME_EVIDENCE_OUTBOX_DRAIN_INTERVAL_MINUTES = 5

const DEFAULT_LIMIT = 50
const DEFAULT_MAX_BATCHES = 4
const DEFAULT_BACKLOG_AGE_GATE_MS = 15 * 60 * 1_000

const defaultLeaseRunner: typeof runWithJobLease = (options, runner) => runWithJobLease(options, runner)
const defaultRetryRunner: typeof runJobWithRetry = (options, runner) => runJobWithRetry(options, runner)

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

type DurationLearningRuntimeEvidenceOutboxDrainJobOptions = {
  queryExec?: Parameters<typeof drainDurationLearningRuntimeEvidenceOutbox>[0]['queryExec']
  drain?: typeof drainDurationLearningRuntimeEvidenceOutbox
  leaseRunner?: typeof runWithJobLease
  retryRunner?: typeof runJobWithRetry
  timerFactory?: (options: DrainTimerOptions) => DrainTimer
  ownerId?: string
  now?: () => string
  limit?: number
  maxBatches?: number
  backlogAgeGateMs?: number
}

type DurationLearningRuntimeEvidenceOutboxDrainFailureReason =
  | 'processor_failures'
  | 'ready_backlog_remaining'
  | 'expired_processing_remaining'
  | 'backlog_age_exceeded'

export class DurationLearningRuntimeEvidenceOutboxDrainIncompleteError extends Error {
  readonly details: {
    failureReasons: DurationLearningRuntimeEvidenceOutboxDrainFailureReason[]
    result: DrainDurationLearningRuntimeEvidenceOutboxResult
  }

  constructor(
    result: DrainDurationLearningRuntimeEvidenceOutboxResult,
    failureReasons: DurationLearningRuntimeEvidenceOutboxDrainFailureReason[],
  ) {
    super(`duration_learning_runtime_evidence_outbox_drain_incomplete:${failureReasons.join(',')}`)
    this.name = 'DurationLearningRuntimeEvidenceOutboxDrainIncompleteError'
    this.details = { failureReasons, result }
  }
}

function createJobId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function failureReasonsFor(result: DrainDurationLearningRuntimeEvidenceOutboxResult) {
  const reasons: DurationLearningRuntimeEvidenceOutboxDrainFailureReason[] = []
  if (result.failed > 0 || result.failureKeys.length > 0) reasons.push('processor_failures')
  if (result.readyBacklogCount > 0) reasons.push('ready_backlog_remaining')
  if (result.expiredProcessingCount > 0) reasons.push('expired_processing_remaining')
  if (result.backlogAgeExceeded) reasons.push('backlog_age_exceeded')
  return reasons
}

function assertDrainComplete(result: DrainDurationLearningRuntimeEvidenceOutboxResult) {
  const failureReasons = failureReasonsFor(result)
  if (failureReasons.length > 0) {
    throw new DurationLearningRuntimeEvidenceOutboxDrainIncompleteError(result, failureReasons)
  }
  return result
}

export class DurationLearningRuntimeEvidenceOutboxDrainJob {
  private isRunning = false
  private activeLeaseCallbackCount = 0
  private lastRun: Date | null = null
  private nextRun: Date | null = null
  private readonly wallClockTimer: DrainTimer

  constructor(private readonly options: DurationLearningRuntimeEvidenceOutboxDrainJobOptions = {}) {
    const timerFactory = options.timerFactory
      ?? ((timerOptions: DrainTimerOptions) => new PersistentWallClockJobTimer(timerOptions))
    this.wallClockTimer = timerFactory({
      jobName: DURATION_LEARNING_RUNTIME_EVIDENCE_OUTBOX_DRAIN_JOB_NAME,
      schedule: { kind: 'minute_interval', intervalMinutes: DURATION_LEARNING_RUNTIME_EVIDENCE_OUTBOX_DRAIN_INTERVAL_MINUTES },
      execute: () => this.execute('scheduler'),
      onScheduled: ({ nextRun, delayMs }) => {
        this.nextRun = nextRun
        logger.info('durationLearningRuntimeEvidenceOutboxDrainJob scheduled', {
          nextRun: nextRun.toISOString(),
          trigger: 'every_5_minutes',
          initialDelay: delayMs,
        })
      },
      onError: (error) => logger.error('durationLearningRuntimeEvidenceOutboxDrainJob scheduler failed', {
        error: error instanceof Error ? error.message : String(error),
      }),
    })
  }

  start() {
    if (!this.wallClockTimer.start()) {
      logger.warn('durationLearningRuntimeEvidenceOutboxDrainJob is already scheduled')
    }
  }

  stop() {
    this.wallClockTimer.stop()
    this.nextRun = null
    logger.info('durationLearningRuntimeEvidenceOutboxDrainJob stopped')
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
      logger.warn('durationLearningRuntimeEvidenceOutboxDrainJob is already running, skip tick', {
        triggeredBy,
        reason: 'already_running',
      })
      return { status: 'skipped' as const, reason: 'already_running' as const }
    }

    this.isRunning = true
    this.lastRun = new Date()
    const jobId = createJobId()
    const leaseRunner = this.options.leaseRunner ?? defaultLeaseRunner
    const retryRunner = this.options.retryRunner ?? defaultRetryRunner
    const drain = this.options.drain ?? drainDurationLearningRuntimeEvidenceOutbox
    try {
      const execution = await retryRunner(
        {
          jobName: DURATION_LEARNING_RUNTIME_EVIDENCE_OUTBOX_DRAIN_JOB_NAME,
          triggeredBy,
          jobId,
          maxAttempts: 1,
        },
        async (_attempt, attemptContext) => leaseRunner(
          {
            jobName: DURATION_LEARNING_RUNTIME_EVIDENCE_OUTBOX_DRAIN_JOB_NAME,
            jobId,
          },
          async (lease) => {
            this.activeLeaseCallbackCount += 1
            try {
              lease.assertActive()
              const now = this.options.now?.() ?? new Date().toISOString()
              const ownerId = this.options.ownerId?.trim()
                || `${DURATION_LEARNING_RUNTIME_EVIDENCE_OUTBOX_DRAIN_JOB_NAME}:${process.env.HOSTNAME ?? 'local'}:${process.pid}:${jobId}`
              const result = await drain({
                queryExec: this.options.queryExec ?? executeSQL,
                ownerId,
                now,
                limit: this.options.limit ?? DEFAULT_LIMIT,
                maxBatches: this.options.maxBatches ?? DEFAULT_MAX_BATCHES,
                backlogAgeGateMs: this.options.backlogAgeGateMs ?? DEFAULT_BACKLOG_AGE_GATE_MS,
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
        logger.warn('durationLearningRuntimeEvidenceOutboxDrainJob skipped because distributed lease was not acquired', {
          triggeredBy,
          jobId,
          reason: 'lease_not_acquired',
        })
        return { status: 'skipped' as const, reason: 'lease_not_acquired' as const }
      }

      const { attempts } = execution
      const { value } = lease
      logger.info('durationLearningRuntimeEvidenceOutboxDrainJob completed', {
        triggeredBy,
        jobId,
        attempts,
        ...value,
      })
      return { status: 'completed' as const, attempts, ...value }
    } catch (error) {
      logger.error('durationLearningRuntimeEvidenceOutboxDrainJob failed', {
        triggeredBy,
        jobId,
        error: error instanceof Error ? error.message : String(error),
        details: error instanceof DurationLearningRuntimeEvidenceOutboxDrainIncompleteError
          ? error.details
          : null,
      })
      throw error
    } finally {
      this.isRunning = false
    }
  }
}

export const durationLearningRuntimeEvidenceOutboxDrainJob =
  new DurationLearningRuntimeEvidenceOutboxDrainJob()
