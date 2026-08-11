import { randomUUID } from 'node:crypto'

import { getClient, query } from '../database.js'
import { logger } from '../middleware/logger.js'
import { runWithJobLeaseFenceContext } from './jobLeaseFenceContext.js'
import { runWithRuntimeAbortSignal } from './runtimeAbortContext.js'
import { isScopedBatchOperationError } from './scopedBatchRunner.js'

export type JobTriggerSource = 'scheduler' | 'manual' | 'api'

export interface JobRetryOptions {
  jobName: string
  triggeredBy: JobTriggerSource
  jobId?: string
  maxAttempts?: number
  baseDelayMs?: number
  timeoutMs?: number
}

export interface JobAttemptContext {
  attempt: number
  signal: AbortSignal
  deadlineAt: string
}

export interface JobRetryResult<T> {
  attempts: number
  value: T
}

export interface JobLeaseOptions {
  jobName: string
  jobId?: string
}

export interface JobLeaseContext {
  jobName: string
  fenceToken: string
  generation: number
  signal: AbortSignal
  assertActive: () => void
}

export type JobLeaseResult<T> =
  | { acquired: true; value: T }
  | { acquired: false; reason: 'lease_not_acquired' }

const DEFAULT_MAX_ATTEMPTS = 3
const DEFAULT_BASE_DELAY_MS = 1_000
const DEFAULT_FAILURE_RETENTION_DAYS = 30
const DEFAULT_JOB_TIMEOUT_MS = 10 * 60 * 1_000

type JobRuntimeFailureCode = 'JOB_ATTEMPT_TIMEOUT' | 'JOB_RUNTIME_SHUTTING_DOWN' | 'JOB_LEASE_LOST'

type ActiveJobAttempt = {
  token: string
  jobName: string
  jobId: string | null
  attempt: number
  startedAt: string
  deadlineAt: string
  controller: AbortController
  completion: Promise<unknown>
}

export type JobRuntimeHealth = {
  healthy: boolean
  acceptingJobs: boolean
  activeAttemptCount: number
  timedOutAttemptCount: number
  lastFailureCode: JobRuntimeFailureCode | null
}

export class JobRuntimeError extends Error {
  constructor(
    public readonly code: JobRuntimeFailureCode,
    message: string,
  ) {
    super(message)
    this.name = 'JobRuntimeError'
  }
}

let acceptingJobs = true
let timedOutAttemptCount = 0
let lastFailureCode: JobRuntimeFailureCode | null = null
let attemptSequence = 0
const activeJobAttempts = new Map<string, ActiveJobAttempt>()
const fatalRuntimeListeners = new Set<(error: JobRuntimeError) => void>()

function nowIso() {
  return new Date().toISOString()
}

function normalizeDatabaseTimestampText(value: unknown) {
  const timestamp = typeof value === 'string' ? value.trim() : ''
  return timestamp && Number.isFinite(new Date(timestamp).getTime()) ? timestamp : ''
}

function getRetryDelayMs(attempt: number, baseDelayMs: number) {
  return baseDelayMs * Math.pow(2, Math.max(0, attempt - 1))
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms))
}

function readPositiveInteger(value: unknown, fallback: number) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback
}

function resolveJobTimeoutMs(options: JobRetryOptions) {
  const normalizedJobName = options.jobName.replace(/[^a-z0-9]+/gi, '_').toUpperCase()
  return readPositiveInteger(
    options.timeoutMs
      ?? process.env[`JOB_TIMEOUT_${normalizedJobName}_MS`]
      ?? process.env.JOB_TIMEOUT_MS,
    DEFAULT_JOB_TIMEOUT_MS,
  )
}

function createRuntimeError(code: JobRuntimeFailureCode, jobName: string) {
  const message = code === 'JOB_ATTEMPT_TIMEOUT'
    ? `Job attempt exceeded its hard deadline: ${jobName}`
    : code === 'JOB_LEASE_LOST'
      ? `Job lease connection was lost: ${jobName}`
      : `Job runtime is shutting down: ${jobName}`
  return new JobRuntimeError(
    code,
    message,
  )
}

function notifyFatalRuntime(error: JobRuntimeError) {
  acceptingJobs = false
  lastFailureCode = error.code
  for (const attempt of activeJobAttempts.values()) {
    attempt.controller.abort(error)
  }
  for (const listener of fatalRuntimeListeners) {
    try {
      listener(error)
    } catch (listenerError) {
      logger.error('job runtime fatal listener failed', {
        code: error.code,
        error: listenerError instanceof Error ? listenerError.message : String(listenerError),
      })
    }
  }
}

async function runAttemptWithDeadline<T>(
  options: JobRetryOptions,
  attempt: number,
  runner: (attempt: number, context: JobAttemptContext) => Promise<T>,
) {
  if (!acceptingJobs) {
    throw createRuntimeError('JOB_RUNTIME_SHUTTING_DOWN', options.jobName)
  }

  const timeoutMs = resolveJobTimeoutMs(options)
  const controller = new AbortController()
  const startedAt = new Date()
  const deadlineAt = new Date(startedAt.getTime() + timeoutMs)
  const token = `${options.jobName}:${options.jobId ?? 'none'}:${attempt}:${++attemptSequence}`
  const operation = runWithRuntimeAbortSignal(
    controller.signal,
    () => Promise.resolve().then(() => runner(attempt, {
      attempt,
      signal: controller.signal,
      deadlineAt: deadlineAt.toISOString(),
    })),
  )
  const completion = operation.finally(() => {
    activeJobAttempts.delete(token)
  })
  completion.catch(() => undefined)
  activeJobAttempts.set(token, {
    token,
    jobName: options.jobName,
    jobId: options.jobId ?? null,
    attempt,
    startedAt: startedAt.toISOString(),
    deadlineAt: deadlineAt.toISOString(),
    controller,
    completion,
  })

  let timeout: ReturnType<typeof setTimeout> | null = null
  let abortListener: (() => void) | null = null
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_resolve, reject) => {
        abortListener = () => reject(
          controller.signal.reason instanceof Error
            ? controller.signal.reason
            : createRuntimeError('JOB_RUNTIME_SHUTTING_DOWN', options.jobName),
        )
        if (controller.signal.aborted) {
          abortListener()
          return
        }
        controller.signal.addEventListener('abort', abortListener, { once: true })
      }),
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => {
          const error = createRuntimeError('JOB_ATTEMPT_TIMEOUT', options.jobName)
          timedOutAttemptCount += 1
          lastFailureCode = error.code
          controller.abort(error)
          for (const listener of fatalRuntimeListeners) {
            try {
              listener(error)
            } catch (listenerError) {
              logger.error('job runtime fatal listener failed', {
                jobName: options.jobName,
                error: listenerError instanceof Error ? listenerError.message : String(listenerError),
              })
            }
          }
          reject(error)
        }, timeoutMs)
        timeout.unref?.()
      }),
    ])
  } finally {
    if (timeout) clearTimeout(timeout)
    if (abortListener) controller.signal.removeEventListener('abort', abortListener)
  }
}

export function getJobRuntimeHealth(): JobRuntimeHealth {
  return {
    healthy: acceptingJobs && lastFailureCode === null,
    acceptingJobs,
    activeAttemptCount: activeJobAttempts.size,
    timedOutAttemptCount,
    lastFailureCode,
  }
}

export function beginJobRuntimeShutdown() {
  if (!acceptingJobs) return
  acceptingJobs = false
  lastFailureCode = 'JOB_RUNTIME_SHUTTING_DOWN'
  for (const attempt of activeJobAttempts.values()) {
    attempt.controller.abort(createRuntimeError('JOB_RUNTIME_SHUTTING_DOWN', attempt.jobName))
  }
}

export function onJobRuntimeFatal(listener: (error: JobRuntimeError) => void) {
  fatalRuntimeListeners.add(listener)
  return () => fatalRuntimeListeners.delete(listener)
}

export async function waitForActiveJobsToDrain(timeoutMs: number) {
  if (activeJobAttempts.size === 0) return true
  const boundedTimeoutMs = readPositiveInteger(timeoutMs, 30_000)
  let timeout: ReturnType<typeof setTimeout> | null = null
  try {
    return await Promise.race([
      Promise.allSettled([...activeJobAttempts.values()].map((attempt) => attempt.completion))
        .then(() => activeJobAttempts.size === 0),
      new Promise<false>((resolve) => {
        timeout = setTimeout(() => resolve(false), boundedTimeoutMs)
        timeout.unref?.()
      }),
    ])
  } finally {
    if (timeout) clearTimeout(timeout)
  }
}

export function resetJobRuntimeStateForTests() {
  for (const attempt of activeJobAttempts.values()) {
    attempt.controller.abort(createRuntimeError('JOB_RUNTIME_SHUTTING_DOWN', attempt.jobName))
  }
  activeJobAttempts.clear()
  acceptingJobs = true
  timedOutAttemptCount = 0
  lastFailureCode = null
  attemptSequence = 0
  fatalRuntimeListeners.clear()
}

export async function runWithJobLease<T>(
  options: JobLeaseOptions,
  runner: (context: JobLeaseContext) => Promise<T>,
): Promise<JobLeaseResult<T>> {
  const client = await getClient()
  let acquired = false
  let leaseLost = false
  let leaseLossError: JobRuntimeError | null = null
  let fenceToken: string | null = null
  let fenceGeneration: number | null = null
  const controller = new AbortController()

  const assertActive = () => {
    if (leaseLossError) throw leaseLossError
    if (controller.signal.aborted) {
      throw controller.signal.reason instanceof Error
        ? controller.signal.reason
        : createRuntimeError('JOB_LEASE_LOST', options.jobName)
    }
  }

  const reportLeaseLost = (cause?: unknown) => {
    if (!acquired || leaseLost) return
    leaseLost = true
    leaseLossError = createRuntimeError('JOB_LEASE_LOST', options.jobName)
    controller.abort(leaseLossError)
    logger.error('job lease connection lost', {
      jobName: options.jobName,
      jobId: options.jobId ?? null,
      error: cause instanceof Error ? cause.message : String(cause ?? 'database connection ended'),
    })
    notifyFatalRuntime(leaseLossError)
  }

  try {
    const lockResult = await client.query(
      `SELECT pg_try_advisory_lock(hashtext($1), hashtext($2)) AS acquired`,
      ['workbuddy_job_lease', options.jobName],
    )
    acquired = Boolean(lockResult.rows?.[0]?.acquired)

    if (!acquired) {
      logger.warn('job lease already held, skipping execution', {
        jobName: options.jobName,
        jobId: options.jobId ?? null,
      })
      return { acquired: false, reason: 'lease_not_acquired' }
    }

    client.on('error', reportLeaseLost)
    client.on('end', reportLeaseLost)

    const backendResult = await client.query(
      `SELECT pg_backend_pid() AS backend_pid,
              backend_start::text AS backend_start
         FROM pg_catalog.pg_stat_activity
        WHERE pid = pg_backend_pid()`,
    )
    const backendPid = Number(backendResult.rows?.[0]?.backend_pid)
    const backendStartedAt = normalizeDatabaseTimestampText(backendResult.rows?.[0]?.backend_start)
    if (!Number.isInteger(backendPid) || backendPid <= 0 || !backendStartedAt) {
      throw new Error(`Unable to resolve lease backend PID: ${options.jobName}`)
    }

    const candidateFenceToken = randomUUID()
    const fenceResult = await client.query(
      `INSERT INTO public.job_lease_fences (
         job_name,
         generation,
         active_token,
         lease_backend_pid,
         lease_backend_started_at,
         activated_at,
         updated_at
       ) VALUES ($1, 1, $2, $3, $4, NOW(), NOW())
       ON CONFLICT (job_name) DO UPDATE
         SET generation = public.job_lease_fences.generation + 1,
             active_token = EXCLUDED.active_token,
             lease_backend_pid = EXCLUDED.lease_backend_pid,
             lease_backend_started_at = EXCLUDED.lease_backend_started_at,
             activated_at = NOW(),
             updated_at = NOW()
       RETURNING generation`,
      [options.jobName, candidateFenceToken, backendPid, backendStartedAt],
    )
    fenceGeneration = Number(fenceResult.rows?.[0]?.generation)
    if (!Number.isSafeInteger(fenceGeneration) || fenceGeneration <= 0) {
      throw new Error(`Unable to establish job lease fence generation: ${options.jobName}`)
    }
    fenceToken = candidateFenceToken

    const leaseContext: JobLeaseContext = {
      jobName: options.jobName,
      fenceToken,
      generation: fenceGeneration,
      signal: controller.signal,
      assertActive,
    }
    const operation = runWithJobLeaseFenceContext(
      leaseContext,
      () => Promise.resolve().then(() => runner(leaseContext)),
    )
    const leaseLoss = new Promise<never>((_resolve, reject) => {
      const rejectOnAbort = () => reject(
        controller.signal.reason instanceof Error
          ? controller.signal.reason
          : createRuntimeError('JOB_LEASE_LOST', options.jobName),
      )
      if (controller.signal.aborted) {
        rejectOnAbort()
        return
      }
      controller.signal.addEventListener('abort', rejectOnAbort, { once: true })
    })
    const value = await Promise.race([operation, leaseLoss])
    assertActive()
    return { acquired: true, value }
  } finally {
    let unlockError: JobRuntimeError | null = null
    if (acquired && !leaseLost) {
      try {
        if (fenceToken) {
          const fenceRelease = await client.query(
            `UPDATE public.job_lease_fences
                SET active_token = NULL,
                    lease_backend_pid = NULL,
                    lease_backend_started_at = NULL,
                    updated_at = NOW()
              WHERE job_name = $1
                AND active_token = $2`,
            [options.jobName, fenceToken],
          )
          if (fenceRelease.rowCount !== 1) {
            throw new Error('job lease fence token was no longer active during release')
          }
        }
        const result = await client.query(
          `SELECT pg_advisory_unlock(hashtext($1), hashtext($2)) AS released`,
          ['workbuddy_job_lease', options.jobName],
        )
        if (result.rows?.[0]?.released !== true) {
          reportLeaseLost(new Error('job lease unlock reported that the lock was not held'))
          unlockError = leaseLossError
        }
      } catch (error) {
        reportLeaseLost(error)
        unlockError = leaseLossError
      }
    }
    client.removeListener('error', reportLeaseLost)
    client.removeListener('end', reportLeaseLost)
    client.release(leaseLossError ?? unlockError ?? undefined)
    if (unlockError) throw unlockError
  }
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
  const result = await query(
    `DELETE FROM public.job_failures
      WHERE failed_at < NOW() - ($1 * INTERVAL '1 day')`,
    [retentionDays],
  )
  return result.rowCount ?? 0
}

export async function runJobWithRetry<T>(
  options: JobRetryOptions,
  runner: (attempt: number, context: JobAttemptContext) => Promise<T>,
): Promise<JobRetryResult<T>> {
  if (!acceptingJobs) {
    throw createRuntimeError('JOB_RUNTIME_SHUTTING_DOWN', options.jobName)
  }

  const maxAttempts = readPositiveInteger(
    options.maxAttempts ?? process.env.JOB_RETRY_MAX_ATTEMPTS,
    DEFAULT_MAX_ATTEMPTS,
  )
  const baseDelayMs = Math.max(0, Number(
    options.baseDelayMs ?? process.env.JOB_RETRY_BASE_DELAY_MS ?? DEFAULT_BASE_DELAY_MS,
  ) || 0)
  let lastError: unknown = null

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const value = await runAttemptWithDeadline(options, attempt, runner)

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
      const fatalRuntimeError = error instanceof JobRuntimeError || isScopedBatchOperationError(error)

      logger.warn('job attempt failed', {
        jobName: options.jobName,
        jobId: options.jobId ?? null,
        triggeredBy: options.triggeredBy,
        attempt,
        maxAttempts,
        error: errorMessage,
      })

      if (error instanceof JobRuntimeError && error.code === 'JOB_RUNTIME_SHUTTING_DOWN') {
        throw error
      }

      if (fatalRuntimeError || attempt >= maxAttempts) {
        await recordJobFailure({
          jobName: options.jobName,
          jobId: options.jobId,
          triggeredBy: options.triggeredBy,
          attemptCount: attempt,
          errorMessage,
          metadata: isScopedBatchOperationError(error)
            ? {
                failedScopes: error.failures,
                successfulScopeIds: error.successfulScopeIds,
              }
            : undefined,
        })
        throw error
      }

      await sleep(getRetryDelayMs(attempt, baseDelayMs))
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError))
}
