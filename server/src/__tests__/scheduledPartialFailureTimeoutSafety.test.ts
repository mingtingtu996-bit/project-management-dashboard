import { EventEmitter } from 'node:events'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  executeSQL: vi.fn(async () => []),
  getClient: vi.fn(),
  query: vi.fn(async () => ({ rows: [], rowCount: 1 })),
}))

vi.mock('../database.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../database.js')>()
  return {
    ...actual,
    getClient: mocks.getClient,
    query: mocks.query,
  }
})

vi.mock('../services/dbService.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/dbService.js')>()
  return {
    ...actual,
    executeSQL: mocks.executeSQL,
    getClient: mocks.getClient,
  }
})

vi.mock('../middleware/logger.js', () => ({
  logger: {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}))

const { runWithDatabaseTransactionClient } = await import('../database.js')
const {
  ConstructionOrganizationPlanNetworkRuntimeEvidenceJob,
} = await import('../jobs/constructionOrganizationPlanNetworkRuntimeEvidenceJob.js')
const { PlanningReplayCalibrationJob } = await import('../jobs/planningReplayCalibrationJob.js')
const { resetJobRuntimeStateForTests } = await import('../services/jobRuntime.js')

type Deferred<T> = {
  promise: Promise<T>
  resolve: (value: T) => void
}

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

function createTransactionClient(events: string[]) {
  return {
    query: vi.fn(async (sql: string) => {
      events.push(String(sql).trim())
      return { rows: [], rowCount: 1 }
    }),
    release: vi.fn(() => events.push('RELEASE')),
  }
}

function completePlanningResult() {
  return {
    scannedProjects: 1,
    completedReports: 1,
    failedReports: 0,
    sampleCount: 2,
    readyGroupCount: 1,
    blockedGroupCount: 0,
    rejectedSampleCount: 0,
    persistedGroupCount: 1,
    persistedReplayResultCount: 2,
    persistenceFailedGroupCount: 0,
    factWritesBlocked: 1,
    seedWritesBlocked: 1,
  }
}

function completeConstructionResult() {
  return {
    source: 'construction_organization_plan_network_runtime_evidence_job' as const,
    total: 1,
    monitored: 1,
    impactMonitoringRecorded: 1,
    rollbackVerificationRecorded: 1,
    runtimeEngineEvidenceRecorded: 1,
    skipped: 0,
    failed: 0,
  }
}

function createLeaseClient(lockState: { held: boolean; generation: number }) {
  const client = new EventEmitter() as EventEmitter & {
    query: ReturnType<typeof vi.fn>
    release: ReturnType<typeof vi.fn>
  }
  client.query = vi.fn(async (sql: string) => {
    const normalized = String(sql)
    if (normalized.includes('pg_try_advisory_lock')) {
      const acquired = !lockState.held
      if (acquired) lockState.held = true
      return { rows: [{ acquired }], rowCount: 1 }
    }
    if (normalized.includes('pg_stat_activity')) {
      return {
        rows: [{ backend_pid: 4242, backend_start: '2026-07-21 00:00:00+00' }],
        rowCount: 1,
      }
    }
    if (normalized.includes('INSERT INTO public.job_lease_fences')) {
      lockState.generation += 1
      return { rows: [{ generation: lockState.generation }], rowCount: 1 }
    }
    if (normalized.includes('UPDATE public.job_lease_fences')) {
      return { rows: [], rowCount: 1 }
    }
    if (normalized.includes('pg_advisory_unlock')) {
      const released = lockState.held
      lockState.held = false
      return { rows: [{ released }], rowCount: 1 }
    }
    return { rows: [], rowCount: 1 }
  })
  client.release = vi.fn()
  return client
}

const previousTimeoutMs = process.env.JOB_TIMEOUT_MS
const previousRetryMaxAttempts = process.env.JOB_RETRY_MAX_ATTEMPTS

describe('scheduled partial-failure timeout safety', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetJobRuntimeStateForTests()
    process.env.JOB_TIMEOUT_MS = '20'
    process.env.JOB_RETRY_MAX_ATTEMPTS = '1'
  })

  afterEach(() => {
    resetJobRuntimeStateForTests()
    if (previousTimeoutMs === undefined) delete process.env.JOB_TIMEOUT_MS
    else process.env.JOB_TIMEOUT_MS = previousTimeoutMs
    if (previousRetryMaxAttempts === undefined) delete process.env.JOB_RETRY_MAX_ATTEMPTS
    else process.env.JOB_RETRY_MAX_ATTEMPTS = previousRetryMaxAttempts
  })

  it('keeps planning overlap blocked and rolls back when a timed-out sweep settles late', async () => {
    const transactionEvents: string[] = []
    const transactionClient = createTransactionClient(transactionEvents)
    const deferredSweep = createDeferred<ReturnType<typeof completePlanningResult>>()
    const sweep = vi.fn(async (_input?: { signal?: AbortSignal }) => deferredSweep.promise)
    const withTransaction = async <T>(
      work: () => Promise<T>,
      options?: { signal?: AbortSignal },
    ) => runWithDatabaseTransactionClient(transactionClient, work, options)
    const job = new PlanningReplayCalibrationJob({ sweep, withTransaction })

    const firstExecution = job.executeNow(['project-1']).then(
      (value) => ({ value }),
      (error) => ({ error }),
    )
    await vi.waitFor(() => expect(sweep).toHaveBeenCalledTimes(1))
    await expect(firstExecution).resolves.toEqual({
      error: expect.objectContaining({ code: 'JOB_ATTEMPT_TIMEOUT' }),
    })

    expect(sweep.mock.calls[0]?.[0]?.signal).toMatchObject({ aborted: true })
    expect(job.getStatus().isRunning).toBe(true)
    const secondOutcome = await job.executeNow(['project-1']).then(
      (value) => ({ value }),
      (error) => ({ error }),
    )

    deferredSweep.resolve(completePlanningResult())
    await vi.waitFor(() => expect(transactionEvents).toContain('ROLLBACK'))

    expect(secondOutcome).toEqual({ value: null })
    expect(sweep).toHaveBeenCalledTimes(1)
    expect(transactionEvents).not.toContain('COMMIT')
    await vi.waitFor(() => expect(job.getStatus().isRunning).toBe(false))
  })

  it('holds the construction lease and rolls back until a timed-out sweep actually settles', async () => {
    const lockState = { held: false, generation: 0 }
    mocks.getClient.mockImplementation(async () => createLeaseClient(lockState) as never)
    const transactionEvents: string[] = []
    const transactionClient = createTransactionClient(transactionEvents)
    const deferredSweep = createDeferred<ReturnType<typeof completeConstructionResult>>()
    const sweep = vi.fn(async (_input?: { signal?: AbortSignal }) => deferredSweep.promise)
    const withTransaction = async <T>(
      work: () => Promise<T>,
      options?: { signal?: AbortSignal },
    ) => runWithDatabaseTransactionClient(transactionClient, work, options)
    const job = new ConstructionOrganizationPlanNetworkRuntimeEvidenceJob({ sweep, withTransaction })

    const firstExecution = job.executeNow().then(
      (value) => ({ value }),
      (error) => ({ error }),
    )
    await vi.waitFor(() => expect(sweep).toHaveBeenCalledTimes(1))
    await expect(firstExecution).resolves.toEqual({
      error: expect.objectContaining({ code: 'JOB_ATTEMPT_TIMEOUT' }),
    })

    expect(sweep.mock.calls[0]?.[0]?.signal).toMatchObject({ aborted: true })
    expect(lockState.held).toBe(true)
    expect(job.getStatus().isRunning).toBe(true)
    const secondOutcome = await job.executeNow().then(
      (value) => ({ value }),
      (error) => ({ error }),
    )

    deferredSweep.resolve(completeConstructionResult())
    await vi.waitFor(() => expect(transactionEvents).toContain('ROLLBACK'))
    await vi.waitFor(() => expect(lockState.held).toBe(false))

    expect(secondOutcome).toEqual({
      value: expect.objectContaining({ total: 0, failed: 0 }),
    })
    expect(mocks.getClient).toHaveBeenCalledTimes(1)
    expect(sweep).toHaveBeenCalledTimes(1)
    expect(transactionEvents).not.toContain('COMMIT')
    await vi.waitFor(() => expect(job.getStatus().isRunning).toBe(false))
  })
})
