import { query } from '../database.js'
import type { ProjectHealthRefreshQueueStatus } from '../types/runtimeHealth.js'
import { getJobRuntimeHealth, type JobRuntimeHealth } from './jobRuntime.js'
import { evaluatePersistentJobScheduleHealth } from './persistentJobScheduleService.js'

type PersistentJobScheduleHealth = Awaited<ReturnType<typeof evaluatePersistentJobScheduleHealth>>

type RuntimeHealthEnv = Record<string, string | undefined>

type RuntimeReadinessOptions = {
  databaseProbe?: () => Promise<unknown>
  schedulerExpected?: boolean
  schedulerReady?: boolean
  schedulerRuntimeHealth?: JobRuntimeHealth
  schedulerPersistentHealthProbe?: () => Promise<PersistentJobScheduleHealth>
  projectHealthRefreshQueueStatus?: ProjectHealthRefreshQueueStatus
  timeoutMs?: number
  env?: RuntimeHealthEnv
}

let runtimeSchedulerReady = false

export function markRuntimeSchedulerReady(ready = true) {
  runtimeSchedulerReady = ready
}

export function resolveBuildIdentity(env: RuntimeHealthEnv = process.env) {
  return {
    releaseSha: env.RELEASE_SHA?.trim() || env.BUILD_SHA?.trim() || env.GITHUB_SHA?.trim() || 'unknown',
    imageDigest: env.IMAGE_DIGEST?.trim() || null,
  }
}

export function buildLivenessPayload(env: RuntimeHealthEnv = process.env) {
  return {
    status: 'live' as const,
    timestamp: new Date().toISOString(),
    build: resolveBuildIdentity(env),
  }
}

async function runWithDeadline<T>(operation: Promise<T>, timeoutMs: number) {
  let timeout: NodeJS.Timeout | null = null
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => reject(new Error('readiness probe timed out')), timeoutMs)
        timeout.unref?.()
      }),
    ])
  } finally {
    if (timeout) clearTimeout(timeout)
  }
}

export async function evaluateRuntimeReadiness(options: RuntimeReadinessOptions = {}) {
  const timeoutMs = Number.isFinite(options.timeoutMs) && Number(options.timeoutMs) > 0
    ? Number(options.timeoutMs)
    : 2_000
  const schedulerExpected = options.schedulerExpected ?? false
  const schedulerReady = options.schedulerReady ?? runtimeSchedulerReady
  const schedulerRuntimeHealth = options.schedulerRuntimeHealth ?? getJobRuntimeHealth()
  const schedulerPersistentHealthProbe = options.schedulerPersistentHealthProbe
    ?? (() => evaluatePersistentJobScheduleHealth())
  const databaseProbe = options.databaseProbe ?? (() => query('SELECT 1 AS ready'))

  let databaseCheck: { status: 'ready' } | { status: 'not_ready'; reason: string }
  try {
    await runWithDeadline(Promise.resolve().then(databaseProbe), timeoutMs)
    databaseCheck = { status: 'ready' }
  } catch {
    databaseCheck = { status: 'not_ready', reason: 'database_unavailable' }
  }

  let schedulerCheck:
    | { status: 'disabled' }
    | { status: 'ready'; registeredJobCount: number; catchUp: PersistentJobScheduleHealth['catchUp'] }
    | ({ status: 'not_ready'; reason: string } & Record<string, unknown>)
  if (!schedulerExpected) {
    schedulerCheck = { status: 'disabled' }
  } else if (!schedulerReady) {
    schedulerCheck = { status: 'not_ready', reason: 'scheduler_not_started' }
  } else if (!schedulerRuntimeHealth.healthy) {
    schedulerCheck = {
      status: 'not_ready',
      reason: 'scheduler_runtime_unhealthy',
      activeAttemptCount: schedulerRuntimeHealth.activeAttemptCount,
      timedOutAttemptCount: schedulerRuntimeHealth.timedOutAttemptCount,
      lastFailureCode: schedulerRuntimeHealth.lastFailureCode,
    }
  } else {
    try {
      const persistentHealth = await runWithDeadline(
        Promise.resolve().then(schedulerPersistentHealthProbe),
        timeoutMs,
      )
      schedulerCheck = persistentHealth.healthy
        ? {
            status: 'ready',
            registeredJobCount: persistentHealth.registeredJobCount,
            catchUp: persistentHealth.catchUp,
          }
        : {
            status: 'not_ready',
            reason: 'scheduler_persistent_jobs_unhealthy',
            registeredJobCount: persistentHealth.registeredJobCount,
            latestFailedJobs: persistentHealth.latestFailedJobs,
            staleRunningJobs: persistentHealth.staleRunningJobs,
            catchUp: persistentHealth.catchUp,
          }
    } catch {
      schedulerCheck = {
        status: 'not_ready',
        reason: 'scheduler_persistent_ledger_unavailable',
      }
    }
  }
  const projectHealthRefreshStatus = options.projectHealthRefreshQueueStatus
  const projectHealthRefreshCheck = !projectHealthRefreshStatus
    ? { status: 'disabled' as const }
    : projectHealthRefreshStatus.healthy
      ? {
          status: 'ready' as const,
          activeProjectId: projectHealthRefreshStatus.activeProjectId,
          queuedProjectCount: projectHealthRefreshStatus.queuedProjectCount,
          failedProjectCount: projectHealthRefreshStatus.failedProjectCount,
        }
      : {
          status: 'not_ready' as const,
          reason: 'project_health_refresh_failed' as const,
          activeProjectId: projectHealthRefreshStatus.activeProjectId,
          queuedProjectCount: projectHealthRefreshStatus.queuedProjectCount,
          failedProjectCount: projectHealthRefreshStatus.failedProjectCount,
          lastFailedProjectId: projectHealthRefreshStatus.lastFailure?.projectId ?? null,
          lastFailureAt: projectHealthRefreshStatus.lastFailure?.failedAt ?? null,
        }
  const ready = databaseCheck.status === 'ready'
    && schedulerCheck.status !== 'not_ready'
    && projectHealthRefreshCheck.status !== 'not_ready'

  return {
    status: ready ? 'ready' as const : 'not_ready' as const,
    timestamp: new Date().toISOString(),
    build: resolveBuildIdentity(options.env ?? process.env),
    checks: {
      database: databaseCheck,
      scheduler: schedulerCheck,
      projectHealthRefresh: projectHealthRefreshCheck,
    },
  }
}
