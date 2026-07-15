import { logger } from '../middleware/logger.js'
import { runJobWithRetry } from '../services/jobRuntime.js'
import { PersistentWallClockJobTimer } from '../services/persistentJobScheduleService.js'
import {
  hasCurrentOfficialWorkCalendarForYear,
  hasCurrentForecastWorkCalendarForYear,
  importForecastWorkCalendar,
  refreshOfficialWorkCalendarFromNotice,
  resolveOfficialHolidayNoticeSourceUrl,
} from '../services/officialHolidayCalendarService.js'

export type OfficialHolidayCalendarJobResult = {
  checkedYears: number[]
  importedYears: number[]
  forecastYears: number[]
  skippedYears: Array<{
    year: number
    reason: 'already_current' | 'forecast_current'
  }>
  failedYears: Array<{
    year: number
    reason: string
  }>
}

function createJobId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function buildDefaultYears(now = new Date()) {
  const currentYear = now.getFullYear()
  return [currentYear, currentYear + 1]
}

export class OfficialHolidayCalendarJob {
  private isRunning = false
  private lastRun: Date | null = null
  private nextRun: Date | null = null
  private wallClockTimer = new PersistentWallClockJobTimer({
    jobName: 'officialHolidayCalendarJob',
    schedule: { kind: 'daily', hour: 4, minute: 45 },
    execute: () => this.execute('scheduler'),
    onScheduled: ({ nextRun, delayMs }) => {
      this.nextRun = nextRun
      logger.info('officialHolidayCalendarJob scheduled', {
        nextRun: nextRun.toISOString(),
        trigger: 'daily_04_45',
        initialDelay: delayMs,
      })
    },
    onError: (error) => logger.error('officialHolidayCalendarJob scheduler failed', {
      error: error instanceof Error ? error.message : String(error),
    }),
  })

  start() {
    if (!this.wallClockTimer.start()) {
      logger.warn('officialHolidayCalendarJob is already running')
    }
  }

  stop() {
    this.wallClockTimer.stop()
    this.nextRun = null
    logger.info('officialHolidayCalendarJob stopped')
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      isScheduled: this.wallClockTimer.getStatus().isScheduled,
      lastRun: this.lastRun ? this.lastRun.toISOString() : null,
      nextRun: this.nextRun ? this.nextRun.toISOString() : null,
    }
  }

  async executeNow(years?: number[] | null) {
    return this.execute('manual', years)
  }

  private async execute(triggeredBy: 'scheduler' | 'manual', years?: number[] | null) {
    if (this.isRunning) {
      logger.warn('officialHolidayCalendarJob is already running, skip tick', { triggeredBy })
      return null
    }

    this.isRunning = true
    const jobId = createJobId()
    const checkedYears = Array.from(new Set((Array.isArray(years) && years.length > 0 ? years : buildDefaultYears())
      .map((year) => Number(year))
      .filter((year) => Number.isInteger(year) && year >= 2026 && year <= 2100)))

    try {
      this.lastRun = new Date()
      const { attempts, value } = await runJobWithRetry(
        {
          jobName: 'officialHolidayCalendarJob',
          triggeredBy,
          jobId,
        },
        async () => this.refreshMissingYears(checkedYears),
      )

      logger.info('officialHolidayCalendarJob completed', {
        triggeredBy,
        jobId,
        attempts,
        ...value,
      })
      return value
    } catch (error) {
      logger.error('officialHolidayCalendarJob failed', {
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

  private async refreshMissingYears(years: number[]): Promise<OfficialHolidayCalendarJobResult> {
    const result: OfficialHolidayCalendarJobResult = {
      checkedYears: years,
      importedYears: [],
      forecastYears: [],
      skippedYears: [],
      failedYears: [],
    }

    for (const year of years) {
      try {
        const sourceUrl = resolveOfficialHolidayNoticeSourceUrl(year)
        if (sourceUrl) {
          if (await hasCurrentOfficialWorkCalendarForYear(year)) {
            result.skippedYears.push({ year, reason: 'already_current' })
            continue
          }
          await refreshOfficialWorkCalendarFromNotice({ year, sourceUrl })
          result.importedYears.push(year)
          continue
        }

        if (await hasCurrentForecastWorkCalendarForYear(year)) {
          result.skippedYears.push({ year, reason: 'forecast_current' })
          continue
        }
        await importForecastWorkCalendar(year)
        result.forecastYears.push(year)
      } catch (error) {
        result.failedYears.push({
          year,
          reason: error instanceof Error ? error.message : String(error),
        })
      }
    }

    return result
  }
}

export const officialHolidayCalendarJob = new OfficialHolidayCalendarJob()
