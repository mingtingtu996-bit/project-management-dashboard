import { query as rawQuery } from '../database.js'
import { logger } from '../middleware/logger.js'
import { runJobWithRetry } from '../services/jobRuntime.js'
import { PersistentWallClockJobTimer } from '../services/persistentJobScheduleService.js'
import { responsibilityInsightService } from '../services/responsibilityInsightService.js'

const DEFAULT_SCHEDULE = '15 8 * * *'

function createJobId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

type ResponsibilityAlertJobResult = {
  scanned: number
  failed: number
  total: number
  abnormalSubjects: number
  watchedSubjects: number
  recoveryPending: number
}

class ResponsibilityAlertJob {
  private isRunning = false
  private lastRun: Date | null = null
  private nextRun: Date | null = null
  private wallClockTimer = new PersistentWallClockJobTimer({
    jobName: 'responsibilityAlertJob',
    schedule: { kind: 'daily', hour: 8, minute: 15 },
    execute: () => this.execute('scheduler'),
    onScheduled: ({ nextRun, delayMs }) => {
      this.nextRun = nextRun
      logger.info('responsibilityAlertJob scheduled', {
        schedule: DEFAULT_SCHEDULE,
        nextRun: nextRun.toISOString(),
        delay: delayMs,
      })
    },
    onError: (error) => logger.error('responsibilityAlertJob scheduler failed', {
      error: error instanceof Error ? error.message : String(error),
    }),
  })

  start(schedule = DEFAULT_SCHEDULE) {
    if (schedule !== DEFAULT_SCHEDULE) {
      logger.warn('responsibilityAlertJob ignores unsupported custom schedule', {
        requestedSchedule: schedule,
        effectiveSchedule: DEFAULT_SCHEDULE,
      })
    }
    if (!this.wallClockTimer.start()) {
      logger.warn('responsibilityAlertJob is already running')
    }
  }

  stop() {
    this.wallClockTimer.stop()
    this.nextRun = null
    logger.info('responsibilityAlertJob stopped')
  }

  async executeNow(projectIds?: string[] | null): Promise<ResponsibilityAlertJobResult> {
    return this.execute('manual', projectIds)
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      isScheduled: this.wallClockTimer.getStatus().isScheduled,
      lastRun: this.lastRun ? this.lastRun.toISOString() : null,
      nextRun: this.nextRun ? this.nextRun.toISOString() : null,
    }
  }

  private async execute(triggeredBy: 'scheduler' | 'manual' = 'scheduler', projectIds?: string[] | null) {
    if (this.isRunning) {
      logger.warn('responsibilityAlertJob is already running, skip tick', { triggeredBy })
      return { scanned: 0, failed: 0, total: 0, abnormalSubjects: 0, watchedSubjects: 0, recoveryPending: 0 }
    }

    this.isRunning = true
    const startedAt = new Date()
    const startedAtMs = Date.now()
    const jobId = createJobId()

    try {
      logger.info('responsibilityAlertJob started', { triggeredBy, jobId })

      const { attempts, value } = await runJobWithRetry(
        {
          jobName: 'responsibilityAlertJob',
          triggeredBy,
          jobId,
        },
        async () => responsibilityInsightService.syncAllProjects(projectIds),
      )

      const durationMs = Date.now() - startedAtMs
      this.lastRun = startedAt

      logger.info('responsibilityAlertJob completed', {
        triggeredBy,
        jobId,
        attempts,
        durationMs,
        ...value,
      })

      await this.logExecution({
        jobName: 'responsibilityAlertJob',
        status: 'success',
        startedAt,
        completedAt: new Date(),
        durationMs,
        result: value,
        triggeredBy,
        jobId,
      })

      return value
    } catch (error) {
      const durationMs = Date.now() - startedAtMs
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'

      logger.error('responsibilityAlertJob failed', {
        triggeredBy,
        jobId,
        durationMs,
        error: errorMessage,
      })

      await this.logExecution({
        jobName: 'responsibilityAlertJob',
        status: 'error',
        startedAt,
        completedAt: new Date(),
        durationMs,
        result: { scanned: 0, failed: 0, total: 0, abnormalSubjects: 0, watchedSubjects: 0, recoveryPending: 0 },
        errorMessage,
        triggeredBy,
        jobId,
      })

      if (triggeredBy === 'scheduler') throw error
      return { scanned: 0, failed: 0, total: 0, abnormalSubjects: 0, watchedSubjects: 0, recoveryPending: 0 }
    } finally {
      this.isRunning = false
    }
  }

  private async logExecution(params: {
    jobName: string
    status: 'success' | 'error' | 'timeout'
    startedAt: Date
    completedAt: Date
    durationMs: number
    result: unknown
    triggeredBy: 'scheduler' | 'manual' | 'api'
    jobId: string
    errorMessage?: string
  }) {
    try {
      await rawQuery(
        `INSERT INTO public.job_execution_logs (
           job_name,
           status,
           started_at,
           completed_at,
           duration_ms,
           result,
           error_message,
           job_id,
           triggered_by
         ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9)`,
        [
          params.jobName,
          params.status,
          params.startedAt.toISOString(),
          params.completedAt.toISOString(),
          params.durationMs,
          JSON.stringify(params.result),
          params.errorMessage ?? null,
          params.jobId,
          params.triggeredBy,
        ],
      )
    } catch (error) {
      logger.error('responsibilityAlertJob failed to persist execution log', {
        jobId: params.jobId,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }
}

export const responsibilityAlertJob = new ResponsibilityAlertJob()
