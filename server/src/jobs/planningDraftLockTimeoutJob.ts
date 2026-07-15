import { logger } from '../middleware/logger.js'
import { PlanningDraftLockService } from '../services/planningDraftLockService.js'
import { runJobWithRetry } from '../services/jobRuntime.js'
import { PersistentWallClockJobTimer } from '../services/persistentJobScheduleService.js'

export class PlanningDraftLockTimeoutJob {
  private wallClockTimer: PersistentWallClockJobTimer | null = null
  private isRunning = false
  private service = new PlanningDraftLockService()
  private lastRun: Date | null = null

  start(intervalMs = 60_000) {
    if (this.wallClockTimer?.getStatus().isScheduled) {
      logger.warn('planningDraftLockTimeoutJob is already running')
      return
    }

    const intervalMinutes = Math.min(60, Math.max(1, Math.ceil(intervalMs / 60_000)))
    this.wallClockTimer = new PersistentWallClockJobTimer({
      jobName: 'planningDraftLockTimeoutJob',
      schedule: { kind: 'minute_interval', intervalMinutes },
      catchUp: { limit: 1, maxAgeMs: intervalMinutes * 2 * 60_000 },
      execute: () => this.execute('scheduler'),
      onScheduled: ({ nextRun, delayMs }) => logger.info('planningDraftLockTimeoutJob scheduled', {
        nextRun: nextRun.toISOString(),
        intervalMinutes,
        initialDelay: delayMs,
      }),
      onError: (error) => logger.error('planningDraftLockTimeoutJob scheduler failed', {
        error: error instanceof Error ? error.message : String(error),
      }),
    })
    this.wallClockTimer.start()
  }

  stop() {
    if (this.wallClockTimer?.stop()) {
      logger.info('planningDraftLockTimeoutJob stopped')
    }
    this.wallClockTimer = null
  }

  async executeNow(projectIds?: string[] | null) {
    return this.execute('manual', projectIds)
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      isScheduled: this.wallClockTimer?.getStatus().isScheduled ?? false,
      lastRun: this.lastRun ? this.lastRun.toISOString() : null,
      nextRun: this.wallClockTimer?.getStatus().nextRun?.toISOString() ?? null,
    }
  }

  private async execute(triggeredBy: 'scheduler' | 'manual', projectIds?: string[] | null) {
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
        async () => this.service.sweepTimedOutLocks(new Date(), projectIds),
      )
      logger.info('planningDraftLockTimeoutJob completed', { triggeredBy, jobId, attempts, ...value })
    } catch (error) {
      logger.error('planningDraftLockTimeoutJob failed', {
        triggeredBy,
        jobId,
        error: error instanceof Error ? error.message : String(error),
      })
      if (triggeredBy === 'scheduler') throw error
    } finally {
      this.isRunning = false
    }
  }
}

export const planningDraftLockTimeoutJob = new PlanningDraftLockTimeoutJob()
