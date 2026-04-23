import { logger } from '../middleware/logger.js'
import { DataRetentionService } from '../services/dataRetentionService.js'
import { runJobWithRetry } from '../services/jobRuntime.js'

const MAX_TIMEOUT_MS = 2_147_483_647

export class DataRetentionJob {
  private timer: NodeJS.Timeout | null = null
  private isRunning = false
  private nextRun: Date | null = null
  private lastRun: Date | null = null
  private service = new DataRetentionService()

  start() {
    if (this.timer) {
      logger.warn('dataRetentionJob is already running')
      return
    }

    this.scheduleNextRun()
  }

  stop() {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
      this.nextRun = null
      logger.info('dataRetentionJob stopped')
    }
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      isScheduled: this.timer !== null,
      lastRun: this.lastRun ? this.lastRun.toISOString() : null,
      nextRun: this.nextRun ? this.nextRun.toISOString() : null,
    }
  }

  async executeNow() {
    return this.execute('manual')
  }

  private scheduleNextRun() {
    const now = new Date()
    const nextRun = new Date(now.getFullYear(), now.getMonth(), 1, 4, 15, 0, 0)
    if (nextRun <= now) {
      nextRun.setMonth(nextRun.getMonth() + 1)
    }

    this.scheduleForDate(nextRun)
  }

  private scheduleForDate(targetDate: Date) {
    const delay = Math.max(targetDate.getTime() - Date.now(), 0)
    this.nextRun = targetDate

    logger.info('dataRetentionJob scheduled', {
      nextRun: targetDate.toISOString(),
      remainingMs: delay,
    })

    if (delay > MAX_TIMEOUT_MS) {
      this.timer = setTimeout(() => {
        this.timer = null
        this.scheduleForDate(targetDate)
      }, MAX_TIMEOUT_MS)
      return
    }

    this.timer = setTimeout(async () => {
      this.timer = null
      await this.execute('scheduler')
      this.scheduleNextRun()
    }, delay)
  }

  private async execute(triggeredBy: 'scheduler' | 'manual') {
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
        async () => this.service.runRetentionPolicy(),
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
      return null
    } finally {
      this.isRunning = false
    }
  }
}

export const dataRetentionJob = new DataRetentionJob()
