import { createClient, type SupabaseClient } from '@supabase/supabase-js'

import { logger } from '../middleware/logger.js'
import { runJobWithRetry } from '../services/jobRuntime.js'
import { responsibilityInsightService } from '../services/responsibilityInsightService.js'

const DAY_IN_MS = 24 * 60 * 60 * 1000

function createSupabaseClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_ANON_KEY

  if (!url || !key) {
    throw new Error('Supabase configuration missing. Please ensure SUPABASE_URL and SUPABASE_ANON_KEY are set.')
  }

  return createClient(url, key)
}

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
  private intervalTimer: NodeJS.Timeout | null = null
  private startTimer: NodeJS.Timeout | null = null
  private lastRun: Date | null = null
  private nextRun: Date | null = null

  start(schedule = '15 8 * * *') {
    if (this.intervalTimer || this.startTimer) {
      logger.warn('responsibilityAlertJob is already running')
      return
    }

    this.nextRun = this.getNextRunTime(schedule)
    const delay = Math.max(this.nextRun.getTime() - Date.now(), 0)

    logger.info('responsibilityAlertJob scheduled', {
      schedule,
      nextRun: this.nextRun.toISOString(),
      delay,
    })

    this.startTimer = setTimeout(() => {
      this.startTimer = null
      void this.execute('scheduler')
      this.intervalTimer = setInterval(() => {
        void this.execute('scheduler')
      }, DAY_IN_MS)
    }, delay)
  }

  stop() {
    if (this.startTimer) {
      clearTimeout(this.startTimer)
      this.startTimer = null
    }

    if (this.intervalTimer) {
      clearInterval(this.intervalTimer)
      this.intervalTimer = null
    }

    this.nextRun = null
    logger.info('responsibilityAlertJob stopped')
  }

  async executeNow(): Promise<ResponsibilityAlertJobResult> {
    return this.execute('manual')
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      isScheduled: this.startTimer !== null || this.intervalTimer !== null,
      lastRun: this.lastRun ? this.lastRun.toISOString() : null,
      nextRun: this.nextRun ? this.nextRun.toISOString() : null,
    }
  }

  private async execute(triggeredBy: 'scheduler' | 'manual' = 'scheduler') {
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
        async () => responsibilityInsightService.syncAllProjects(),
      )

      const durationMs = Date.now() - startedAtMs
      this.lastRun = startedAt

      if (triggeredBy === 'scheduler') {
        this.nextRun = new Date(startedAt.getTime() + DAY_IN_MS)
      }

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

      return { scanned: 0, failed: 0, total: 0, abnormalSubjects: 0, watchedSubjects: 0, recoveryPending: 0 }
    } finally {
      this.isRunning = false
    }
  }

  private getNextRunTime(_schedule: string) {
    const now = new Date()
    const next = new Date(now)
    next.setHours(8, 15, 0, 0)

    if (next <= now) {
      next.setDate(next.getDate() + 1)
    }

    return next
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
      const supabase = createSupabaseClient()
      await supabase.from('job_execution_logs').insert({
        job_name: params.jobName,
        status: params.status,
        started_at: params.startedAt.toISOString(),
        completed_at: params.completedAt.toISOString(),
        duration_ms: params.durationMs,
        result: params.result,
        error_message: params.errorMessage ?? null,
        job_id: params.jobId,
        triggered_by: params.triggeredBy,
      })
    } catch (error) {
      logger.error('responsibilityAlertJob failed to persist execution log', {
        jobId: params.jobId,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }
}

export const responsibilityAlertJob = new ResponsibilityAlertJob()
