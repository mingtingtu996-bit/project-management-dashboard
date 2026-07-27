import { describe, expect, it, vi } from 'vitest'

import {
  buildLivenessPayload,
  evaluateRuntimeReadiness,
  resolveBuildIdentity,
} from '../services/runtimeHealthService.js'

describe('runtime health service', () => {
  it('keeps liveness independent from database readiness and exposes build identity', () => {
    expect(buildLivenessPayload({
      RELEASE_SHA: 'abc123',
      DEPLOY_TARGET: 'staging',
      SUPABASE_URL: 'https://staging-ref.supabase.co',
      DB_CONNECTION_STRING: 'postgresql://workbuddy_runtime_login.staging-ref:secret@aws-1.pooler.supabase.com:5432/postgres',
    })).toMatchObject({
      status: 'live',
      build: {
        releaseSha: 'abc123',
        deployTarget: 'staging',
        supabaseProjectRef: 'staging-ref',
        databaseProjectRef: 'staging-ref',
      },
    })
    expect(resolveBuildIdentity({})).toEqual({
      releaseSha: 'unknown',
      imageDigest: null,
      deployTarget: null,
      supabaseProjectRef: null,
      databaseProjectRef: null,
    })
    expect(resolveBuildIdentity({
      SUPABASE_URL: 'https://staging-ref.supabase.co',
      DB_CONNECTION_STRING: 'postgresql://workbuddy_runtime_login.production-ref:secret@aws-1.pooler.supabase.com:5432/postgres',
    })).toMatchObject({
      supabaseProjectRef: 'staging-ref',
      databaseProjectRef: 'production-ref',
    })
  })

  it('reports ready only when the database probe succeeds', async () => {
    const result = await evaluateRuntimeReadiness({
      databaseProbe: vi.fn(async () => undefined),
      schedulerExpected: false,
      env: { RELEASE_SHA: 'release-1' },
    })

    expect(result).toMatchObject({
      status: 'ready',
      build: { releaseSha: 'release-1' },
      checks: {
        database: { status: 'ready' },
        scheduler: { status: 'disabled' },
      },
    })
  })

  it('fails readiness closed when the database probe fails', async () => {
    const result = await evaluateRuntimeReadiness({
      databaseProbe: vi.fn(async () => { throw new Error('database unavailable') }),
      schedulerExpected: false,
      env: {},
    })

    expect(result.status).toBe('not_ready')
    expect(result.checks.database).toEqual({ status: 'not_ready', reason: 'database_unavailable' })
  })

  it('fails readiness when an expected scheduler has not completed startup', async () => {
    const result = await evaluateRuntimeReadiness({
      databaseProbe: vi.fn(async () => undefined),
      schedulerExpected: true,
      schedulerReady: false,
      env: {},
    })

    expect(result.status).toBe('not_ready')
    expect(result.checks.scheduler).toEqual({ status: 'not_ready', reason: 'scheduler_not_started' })
  })

  it('fails readiness when the scheduler runtime reports a timed out or unhealthy attempt', async () => {
    const result = await evaluateRuntimeReadiness({
      databaseProbe: vi.fn(async () => undefined),
      schedulerExpected: true,
      schedulerReady: true,
      schedulerRuntimeHealth: {
        healthy: false,
        acceptingJobs: true,
        activeAttemptCount: 1,
        timedOutAttemptCount: 1,
        lastFailureCode: 'JOB_ATTEMPT_TIMEOUT',
      },
      env: {},
    })

    expect(result.status).toBe('not_ready')
    expect(result.checks.scheduler).toEqual({
      status: 'not_ready',
      reason: 'scheduler_runtime_unhealthy',
      activeAttemptCount: 1,
      timedOutAttemptCount: 1,
      lastFailureCode: 'JOB_ATTEMPT_TIMEOUT',
    })
  })

  it('fails readiness when a registered persistent job has failed or gone stale', async () => {
    const result = await evaluateRuntimeReadiness({
      databaseProbe: vi.fn(async () => undefined),
      schedulerExpected: true,
      schedulerReady: true,
      schedulerRuntimeHealth: {
        healthy: true,
        acceptingJobs: true,
        activeAttemptCount: 0,
        timedOutAttemptCount: 0,
        lastFailureCode: null,
      },
      schedulerPersistentHealthProbe: vi.fn(async () => ({
        healthy: false,
        registeredJobCount: 3,
        latestFailedJobs: ['dataQualityJob'],
        staleRunningJobs: ['projectDailySnapshotJob'],
        catchUp: { concurrency: 2, active: 1, queued: 4 },
      })),
      env: {},
    })

    expect(result.status).toBe('not_ready')
    expect(result.checks.scheduler).toEqual({
      status: 'not_ready',
      reason: 'scheduler_persistent_jobs_unhealthy',
      registeredJobCount: 3,
      latestFailedJobs: ['dataQualityJob'],
      staleRunningJobs: ['projectDailySnapshotJob'],
      catchUp: { concurrency: 2, active: 1, queued: 4 },
    })
  })

  it('fails readiness closed when the persistent scheduler ledger cannot be inspected', async () => {
    const result = await evaluateRuntimeReadiness({
      databaseProbe: vi.fn(async () => undefined),
      schedulerExpected: true,
      schedulerReady: true,
      schedulerRuntimeHealth: {
        healthy: true,
        acceptingJobs: true,
        activeAttemptCount: 0,
        timedOutAttemptCount: 0,
        lastFailureCode: null,
      },
      schedulerPersistentHealthProbe: vi.fn(async () => {
        throw new Error('ledger unavailable')
      }),
      env: {},
    })

    expect(result.status).toBe('not_ready')
    expect(result.checks.scheduler).toEqual({
      status: 'not_ready',
      reason: 'scheduler_persistent_ledger_unavailable',
    })
  })

  it('fails readiness when the local project health refresh queue has a terminal failure', async () => {
    const result = await evaluateRuntimeReadiness({
      databaseProbe: vi.fn(async () => undefined),
      schedulerExpected: false,
      projectHealthRefreshQueueStatus: {
        healthy: false,
        activeProjectId: null,
        queuedProjectCount: 0,
        failedProjectCount: 1,
        lastFailure: {
          projectId: 'project-1',
          trigger: 'planning_governance_notification',
          attempts: 3,
          failedAt: '2026-07-14T00:00:00.000Z',
          error: 'sensitive database detail',
        },
      },
      env: {},
    })

    expect(result.status).toBe('not_ready')
    expect(result.checks.projectHealthRefresh).toEqual({
      status: 'not_ready',
      reason: 'project_health_refresh_failed',
      activeProjectId: null,
      queuedProjectCount: 0,
      failedProjectCount: 1,
      lastFailedProjectId: 'project-1',
      lastFailureAt: '2026-07-14T00:00:00.000Z',
    })
    expect(JSON.stringify(result)).not.toContain('sensitive database detail')
  })
})
