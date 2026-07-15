import { logger } from '../middleware/logger.js'
import { runJobWithRetry } from '../services/jobRuntime.js'
import { PersistentWallClockJobTimer } from '../services/persistentJobScheduleService.js'
import { syncAllProjectWeatherForecasts } from '../services/projectClimateProfileService.js'

function createJobId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

export class ProjectWeatherForecastJob {
  private isRunning = false
  private lastRun: Date | null = null
  private nextRun: Date | null = null
  private readonly intervalHours = Math.max(1, Math.trunc(Number(process.env.PROJECT_WEATHER_SYNC_INTERVAL_HOURS) || 3))
  private wallClockTimer = new PersistentWallClockJobTimer({
    jobName: 'projectWeatherForecastJob',
    schedule: { kind: 'hourly_interval', intervalHours: this.intervalHours, minute: 20 },
    execute: () => this.execute('scheduler'),
    onScheduled: ({ nextRun, delayMs }) => {
      this.nextRun = nextRun
      logger.info('projectWeatherForecastJob scheduled', {
        nextRun: nextRun.toISOString(),
        trigger: `every_${this.intervalHours}_hours`,
        initialDelay: delayMs,
      })
    },
    onError: (error) => logger.error('projectWeatherForecastJob scheduler failed', {
      error: error instanceof Error ? error.message : String(error),
    }),
  })

  start() {
    if (!this.wallClockTimer.start()) {
      logger.warn('projectWeatherForecastJob is already running')
    }
  }

  stop() {
    this.wallClockTimer.stop()
    this.nextRun = null
    logger.info('projectWeatherForecastJob stopped')
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      isScheduled: this.wallClockTimer.getStatus().isScheduled,
      lastRun: this.lastRun ? this.lastRun.toISOString() : null,
      nextRun: this.nextRun ? this.nextRun.toISOString() : null,
      intervalHours: this.intervalHours,
    }
  }

  async executeNow(projectIds?: string[] | null) {
    return this.execute('manual', projectIds)
  }

  private async execute(triggeredBy: 'scheduler' | 'manual', projectIds?: string[] | null) {
    if (this.isRunning) {
      logger.warn('projectWeatherForecastJob is already running, skip tick', { triggeredBy })
      return null
    }

    this.isRunning = true
    const jobId = createJobId()
    try {
      this.lastRun = new Date()
      const { attempts, value } = await runJobWithRetry(
        {
          jobName: 'projectWeatherForecastJob',
          triggeredBy,
          jobId,
        },
        async (_attempt, context) => syncAllProjectWeatherForecasts(projectIds, { signal: context.signal }),
      )

      logger.info('projectWeatherForecastJob completed', {
        triggeredBy,
        jobId,
        attempts,
        projects: value.length,
        failures: value.filter((item) => item.error).length,
      })
      return value
    } catch (error) {
      logger.error('projectWeatherForecastJob failed', {
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

export const projectWeatherForecastJob = new ProjectWeatherForecastJob()
