import { logger } from '../middleware/logger.js'
import { runJobWithRetry } from '../services/jobRuntime.js'
import { PersistentWallClockJobTimer } from '../services/persistentJobScheduleService.js'
import { syncAllProjectClimateProfiles } from '../services/projectClimateProfileService.js'

function createJobId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

export class ProjectClimateProfileJob {
  private isRunning = false
  private lastRun: Date | null = null
  private nextRun: Date | null = null
  private wallClockTimer = new PersistentWallClockJobTimer({
    jobName: 'projectClimateProfileJob',
    schedule: { kind: 'daily', hour: 5, minute: 10 },
    execute: () => this.execute('scheduler'),
    onScheduled: ({ nextRun, delayMs }) => {
      this.nextRun = nextRun
      logger.info('projectClimateProfileJob scheduled', {
        nextRun: nextRun.toISOString(),
        trigger: 'daily_05_10',
        initialDelay: delayMs,
      })
    },
    onError: (error) => logger.error('projectClimateProfileJob scheduler failed', {
      error: error instanceof Error ? error.message : String(error),
    }),
  })

  start() {
    if (!this.wallClockTimer.start()) {
      logger.warn('projectClimateProfileJob is already running')
    }
  }

  stop() {
    this.wallClockTimer.stop()
    this.nextRun = null
    logger.info('projectClimateProfileJob stopped')
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
      logger.warn('projectClimateProfileJob is already running, skip tick', { triggeredBy })
      return null
    }

    this.isRunning = true
    const jobId = createJobId()
    try {
      this.lastRun = new Date()
      const { attempts, value } = await runJobWithRetry(
        {
          jobName: 'projectClimateProfileJob',
          triggeredBy,
          jobId,
        },
        async (_attempt, context) => {
          const results = await syncAllProjectClimateProfiles(projectIds, { signal: context.signal })
          const failedCount = results.filter((item) => {
            const weatherStatus = item.weather && typeof item.weather === 'object'
              ? String((item.weather as { status?: unknown }).status ?? '')
              : ''
            return Boolean(item.error) || weatherStatus === 'failed'
          }).length
          if (failedCount > 0) {
            throw Object.assign(
              new Error(`PROJECT_CLIMATE_PROFILE_SYNC_PARTIAL_FAILURE:${failedCount}/${results.length}`),
              { code: 'PROJECT_CLIMATE_PROFILE_SYNC_PARTIAL_FAILURE', failedCount },
            )
          }
          return results
        },
      )

      logger.info('projectClimateProfileJob completed', {
        triggeredBy,
        jobId,
        attempts,
        projects: value.length,
        failures: value.filter((item) => item.error).length,
      })
      return value
    } catch (error) {
      logger.error('projectClimateProfileJob failed', {
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

export const projectClimateProfileJob = new ProjectClimateProfileJob()
