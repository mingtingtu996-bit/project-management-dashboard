import { query } from '../database.js'
import { logger } from '../middleware/logger.js'

export type JobTriggerSource = 'scheduler' | 'manual' | 'api'

export interface JobRetryOptions {
  jobName: string
  triggeredBy: JobTriggerSource
  jobId?: string
  maxAttempts?: number
  baseDelayMs?: number
}

export interface JobRetryResult<T> {
  attempts: number
  value: T
}

const DEFAULT_MAX_ATTEMPTS = 3
const DEFAULT_BASE_DELAY_MS = 1_000
const DEFAULT_FAILURE_RETENTION_DAYS = 30

let jobFailuresTableEnsured = false

function nowIso() {
  return new Date().toISOString()
}

function getRetryDelayMs(attempt: number, baseDelayMs: number) {
  return baseDelayMs * Math.pow(2, Math.max(0, attempt - 1))
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms))
}

async function ensureJobFailuresTable() {
  if (jobFailuresTableEnsured) return

  await query(`
    CREATE TABLE IF NOT EXISTS public.job_failures (
      id BIGSERIAL PRIMARY KEY,
      job_name TEXT NOT NULL,
      job_id TEXT,
      triggered_by TEXT NOT NULL,
      attempt_count INTEGER NOT NULL DEFAULT 1,
      error_message TEXT NOT NULL,
      metadata JSONB DEFAULT '{}'::jsonb,
      failed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `)
  await query(`CREATE INDEX IF NOT EXISTS idx_job_failures_job_name ON public.job_failures(job_name);`)
  await query(`CREATE INDEX IF NOT EXISTS idx_job_failures_failed_at ON public.job_failures(failed_at DESC);`)

  jobFailuresTableEnsured = true
}

export async function recordJobFailure(params: {
  jobName: string
  triggeredBy: JobTriggerSource
  jobId?: string
  attemptCount: number
  errorMessage: string
  metadata?: Record<string, unknown>
}) {
  try {
    await ensureJobFailuresTable()
    await query(
      `INSERT INTO public.job_failures
        (job_name, job_id, triggered_by, attempt_count, error_message, metadata, failed_at, created_at)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8)`,
      [
        params.jobName,
        params.jobId ?? null,
        params.triggeredBy,
        params.attemptCount,
        params.errorMessage,
        JSON.stringify(params.metadata ?? {}),
        nowIso(),
        nowIso(),
      ],
    )
  } catch (error) {
    logger.error('failed to persist job failure record', {
      jobName: params.jobName,
      jobId: params.jobId ?? null,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

export async function cleanupJobFailures(retentionDays = DEFAULT_FAILURE_RETENTION_DAYS) {
  await ensureJobFailuresTable()
  const result = await query(
    `DELETE FROM public.job_failures
      WHERE failed_at < NOW() - ($1 * INTERVAL '1 day')`,
    [retentionDays],
  )
  return result.rowCount ?? 0
}

export async function runJobWithRetry<T>(
  options: JobRetryOptions,
  runner: (attempt: number) => Promise<T>,
): Promise<JobRetryResult<T>> {
  const maxAttempts = options.maxAttempts ?? Number(process.env.JOB_RETRY_MAX_ATTEMPTS || DEFAULT_MAX_ATTEMPTS)
  const baseDelayMs = options.baseDelayMs ?? Number(process.env.JOB_RETRY_BASE_DELAY_MS || DEFAULT_BASE_DELAY_MS)
  let lastError: unknown = null

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const value = await runner(attempt)

      if (attempt > 1) {
        logger.warn('job recovered after retry', {
          jobName: options.jobName,
          jobId: options.jobId ?? null,
          triggeredBy: options.triggeredBy,
          attempts: attempt,
        })
      }

      return { attempts: attempt, value }
    } catch (error) {
      lastError = error
      const errorMessage = error instanceof Error ? error.message : String(error)

      logger.warn('job attempt failed', {
        jobName: options.jobName,
        jobId: options.jobId ?? null,
        triggeredBy: options.triggeredBy,
        attempt,
        maxAttempts,
        error: errorMessage,
      })

      if (attempt >= maxAttempts) {
        await recordJobFailure({
          jobName: options.jobName,
          jobId: options.jobId,
          triggeredBy: options.triggeredBy,
          attemptCount: attempt,
          errorMessage,
        })
        throw error
      }

      await sleep(getRetryDelayMs(attempt, baseDelayMs))
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError))
}
