import { createClient, type SupabaseClient } from '@supabase/supabase-js'

import { logger } from '../middleware/logger.js'
import { runJobWithRetry } from '../services/jobRuntime.js'
import { riskStatisticsService } from '../services/riskStatisticsService.js'
import { isProjectActiveStatus } from '../utils/projectStatus.js'

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

class RiskStatisticsJob {
  private isRunning = false
  private intervalTimer: NodeJS.Timeout | null = null
  private startTimer: NodeJS.Timeout | null = null
  private lastRun: Date | null = null
  private nextRun: Date | null = null

  start(schedule = '0 2 * * *') {
    if (this.intervalTimer || this.startTimer) {
      logger.warn('riskStatisticsJob is already running')
      return
    }

    this.nextRun = this.getNextRunTime(schedule)
    const delay = Math.max(this.nextRun.getTime() - Date.now(), 0)

    logger.info('riskStatisticsJob scheduled', {
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
    logger.info('riskStatisticsJob stopped')
  }

  async executeNow(): Promise<{ success: number; failed: number; total: number }> {
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
      logger.warn('riskStatisticsJob is already running, skip tick', { triggeredBy })
      return { success: 0, failed: 0, total: 0 }
    }

    this.isRunning = true
    const startedAt = new Date()
    const startedAtMs = Date.now()
    const jobId = createJobId()

    try {
      logger.info('riskStatisticsJob started', { triggeredBy, jobId })

      const { attempts, value } = await runJobWithRetry(
        {
          jobName: 'riskStatisticsJob',
          triggeredBy,
          jobId,
        },
        async () => this.generateSnapshotsForAllProjects(),
      )

      const durationMs = Date.now() - startedAtMs
      this.lastRun = startedAt

      if (triggeredBy === 'scheduler') {
        this.nextRun = new Date(startedAt.getTime() + DAY_IN_MS)
      }

      logger.info('riskStatisticsJob completed', {
        triggeredBy,
        jobId,
        attempts,
        durationMs,
        ...value,
      })

      await this.logExecution({
        jobName: 'riskStatisticsJob',
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

      logger.error('riskStatisticsJob failed', {
        triggeredBy,
        jobId,
        durationMs,
        error: errorMessage,
      })

      await this.logExecution({
        jobName: 'riskStatisticsJob',
        status: 'error',
        startedAt,
        completedAt: new Date(),
        durationMs,
        result: { success: 0, failed: 0, total: 0 },
        errorMessage,
        triggeredBy,
        jobId,
      })

      return { success: 0, failed: 0, total: 0 }
    } finally {
      this.isRunning = false
    }
  }

  private async generateSnapshotsForAllProjects() {
    const supabase = createSupabaseClient()
    const { data: projects, error } = await supabase
      .from('projects')
      .select('id, name, status')

    if (error) {
      throw error
    }

    const activeProjects = ((projects ?? []) as Array<{ id: string; name?: string | null; status?: string | null }>).filter(
      (project) => isProjectActiveStatus(project.status),
    )

    if (activeProjects.length === 0) {
      logger.info('riskStatisticsJob skipped because there are no active projects')
      return { success: 0, failed: 0, total: 0 }
    }

    let success = 0
    let failed = 0
    const snapshotDate = new Date().toISOString().split('T')[0]

    for (const project of activeProjects) {
      try {
        const result = await riskStatisticsService.generateDailySnapshot(project.id, snapshotDate)
        if (result) {
          success += 1
        } else {
          failed += 1
        }
      } catch (error) {
        failed += 1
        logger.error('riskStatisticsJob project snapshot failed', {
          projectId: project.id,
          projectName: project.name,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }

    return {
      success,
      failed,
      total: activeProjects.length,
    }
  }

  private getNextRunTime(_schedule: string) {
    const now = new Date()
    const next = new Date(now)
    next.setHours(2, 0, 0, 0)

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
      logger.error('riskStatisticsJob failed to persist execution log', {
        jobId: params.jobId,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }
}

export const riskStatisticsJob = new RiskStatisticsJob()
