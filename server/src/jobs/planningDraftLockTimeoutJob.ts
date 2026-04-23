import { logger } from '../middleware/logger.js'
import { PlanningDraftLockService } from '../services/planningDraftLockService.js'
import { runJobWithRetry } from '../services/jobRuntime.js'

export class PlanningDraftLockTimeoutJob {
  private timer: NodeJS.Timeout | null = null
  private isRunning = false
  private service = new PlanningDraftLockService()
  private lastRun: Date | null = null

  start(intervalMs = 60_000) {
    if (this.timer) {
      logger.warn('planningDraftLockTimeoutJob is already running')
      return
    }

    this.execute('scheduler')
    this.timer = setInterval(() => {
      this.execute('scheduler')
    }, intervalMs)
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
      logger.info('planningDraftLockTimeoutJob stopped')
    }
  }

  async executeNow() {
    return this.execute('manual')
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      isScheduled: this.timer !== null,
      lastRun: this.lastRun ? this.lastRun.toISOString() : null,
      nextRun: null,
    }
  }

  private async execute(triggeredBy: 'scheduler' | 'manual') {
    if (this.isRunning) {
      logger.warn('planningDraftLockTimeoutJob is already running, skip this tick')
      return
    }

    this.isRunning = true
    const jobId = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
    try {
      this.lastRun = new Date()
      logger.info('planningDraftLockTimeoutJob scanning draft locks', { triggeredBy, jobId })
      const { attempts, value } = await runJobWithRetry(
        {
          jobName: 'planningDraftLockTimeoutJob',
          triggeredBy,
          jobId,
        },
        async () => this.service.sweepTimedOutLocks(),
      )
      logger.info('planningDraftLockTimeoutJob completed', { triggeredBy, jobId, attempts, ...value })
    } catch (error) {
      logger.error('planningDraftLockTimeoutJob failed', {
        triggeredBy,
        jobId,
        error: error instanceof Error ? error.message : String(error),
      })
    } finally {
      this.isRunning = false
    }
  }
}

export const planningDraftLockTimeoutJob = new PlanningDraftLockTimeoutJob()
