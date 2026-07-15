import { logger } from '../middleware/logger.js'
import { expirePendingRetentionDecisions } from '../services/deletionRetentionGovernanceService.js'
import { runJobWithRetry } from '../services/jobRuntime.js'
import { PersistentWallClockJobTimer } from '../services/persistentJobScheduleService.js'

export class DeletionRetentionCleanupJob {
  private isRunning = false
  private wallClockTimer = new PersistentWallClockJobTimer({
    jobName: 'deletionRetentionCleanupJob',
    schedule: { kind: 'daily', hour: 3, minute: 45 },
    execute: () => this.execute('scheduler'),
    onScheduled: ({ nextRun, delayMs }) => logger.info('Deletion retention cleanup job scheduled', {
      nextRun: nextRun.toISOString(),
      trigger: 'daily_03_45',
      initialDelay: delayMs,
    }),
    onError: (error) => logger.error('Deletion retention cleanup scheduler failed', {
      error: error instanceof Error ? error.message : String(error),
    }),
  })

  start() {
    if (!this.wallClockTimer.start()) {
      logger.warn('Deletion retention cleanup job is already running')
    }
  }

  stop() {
    if (this.wallClockTimer.stop()) {
      logger.info('Deletion retention cleanup job stopped')
    }
  }

  async executeNow() {
    return this.execute('manual')
  }

  private async execute(triggeredBy: 'scheduler' | 'manual' = 'scheduler') {
    if (this.isRunning) {
      logger.warn('Deletion retention cleanup job is already running, skip tick')
      return null
    }

    this.isRunning = true
    const jobId = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`

    try {
      const { attempts, value } = await runJobWithRetry(
        {
          jobName: 'deletionRetentionCleanupJob',
          triggeredBy,
          jobId,
        },
        async () => expirePendingRetentionDecisions(),
      )

      logger.info('Deletion retention cleanup job completed', {
        triggeredBy,
        jobId,
        attempts,
        ...value,
      })

      return value
    } catch (error) {
      logger.error('Deletion retention cleanup job failed', {
        triggeredBy,
        jobId,
        error: error instanceof Error ? error.message : String(error),
      })
      if (triggeredBy === 'scheduler') throw error
      return null
    } finally {
      this.isRunning = false
    }
  }
}

export const deletionRetentionCleanupJob = new DeletionRetentionCleanupJob()
