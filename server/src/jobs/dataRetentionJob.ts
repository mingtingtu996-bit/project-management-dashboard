import { logger } from '../middleware/logger.js'
import { DataRetentionService } from '../services/dataRetentionService.js'
import { runJobWithRetry } from '../services/jobRuntime.js'
import { PersistentWallClockJobTimer } from '../services/persistentJobScheduleService.js'

export class DataRetentionJob {
  private isRunning = false
  private nextRun: Date | null = null
  private lastRun: Date | null = null
  private service = new DataRetentionService()
  private wallClockTimer = new PersistentWallClockJobTimer({
    jobName: 'dataRetentionJob',
    schedule: { kind: 'monthly', dayOfMonth: 1, hour: 4, minute: 15 },
    catchUp: { limit: 1, maxAgeMs: 35 * 24 * 60 * 60 * 1_000 },
    execute: () => this.execute('scheduler'),
    onScheduled: ({ nextRun, delayMs }) => {
      this.nextRun = nextRun
      logger.info('dataRetentionJob scheduled', {
        nextRun: nextRun.toISOString(),
        trigger: 'monthly_day_1_04_15',
        remainingMs: delayMs,
      })
    },
    onError: (error) => logger.error('dataRetentionJob scheduler failed', {
      error: error instanceof Error ? error.message : String(error),
    }),
  })

  start() {
    if (!this.wallClockTimer.start()) {
      logger.warn('dataRetentionJob is already running')
    }
  }

  stop() {
    if (this.wallClockTimer.stop()) {
      logger.info('dataRetentionJob stopped')
    }
    this.nextRun = null
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      isScheduled: this.wallClockTimer.getStatus().isScheduled,
      lastRun: this.lastRun ? this.lastRun.toISOString() : null,
      nextRun: this.nextRun ? this.nextRun.toISOString() : null,
    }
  }

  async executeNow(projectIds?: string[] | null) {
    return this.execute('manual', projectIds)
  }

  private async execute(triggeredBy: 'scheduler' | 'manual', projectIds?: string[] | null) {
    if (this.isRunning) {
      logger.warn('dataRetentionJob is already running, skip tick')
      return null
    }

    this.isRunning = true
    const jobId = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`

    try {
      this.lastRun = new Date()
      const { attempts, value } = await runJobWithRetry(
        {
          jobName: 'dataRetentionJob',
          triggeredBy,
          jobId,
        },
        async () => this.service.runRetentionPolicy(projectIds),
      )

      logger.info('dataRetentionJob completed', {
        triggeredBy,
        jobId,
        attempts,
        ...value,
      })

      return value
    } catch (error) {
      logger.error('dataRetentionJob failed', {
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

export const dataRetentionJob = new DataRetentionJob()
