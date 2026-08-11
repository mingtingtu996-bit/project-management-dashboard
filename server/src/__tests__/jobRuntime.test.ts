import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  getClient: vi.fn(),
  clientQuery: vi.fn(),
  release: vi.fn(),
  on: vi.fn(),
  removeListener: vi.fn(),
  listeners: new Map<string, (error?: Error) => void>(),
}))

vi.mock('../database.js', () => ({
  query: mocks.query,
  getClient: mocks.getClient,
}))

describe('jobRuntime', () => {
  beforeEach(async () => {
    vi.resetModules()
    mocks.query.mockReset()
    mocks.getClient.mockReset()
    mocks.clientQuery.mockReset()
    mocks.release.mockReset()
    mocks.on.mockReset()
    mocks.removeListener.mockReset()
    mocks.listeners.clear()
    mocks.on.mockImplementation((event: string, listener: (error?: Error) => void) => {
      mocks.listeners.set(event, listener)
    })
    mocks.removeListener.mockImplementation((event: string, listener: (error?: Error) => void) => {
      if (mocks.listeners.get(event) === listener) mocks.listeners.delete(event)
    })
    mocks.query.mockResolvedValue({ rowCount: 1 })
    mocks.clientQuery.mockImplementation(async (sql: unknown) => {
      const statement = String(sql)
      if (statement.includes('pg_try_advisory_lock')) {
        return { rows: [{ acquired: true }], rowCount: 1 }
      }
      if (statement.includes('pg_backend_pid')) {
        return { rows: [{ backend_pid: 4242, backend_start: '2026-07-12 00:00:00.123456+00' }], rowCount: 1 }
      }
      if (statement.includes('INSERT INTO public.job_lease_fences')) {
        return { rows: [{ generation: '7' }], rowCount: 1 }
      }
      if (statement.includes('pg_advisory_unlock')) {
        return { rows: [{ released: true }], rowCount: 1 }
      }
      return { rows: [], rowCount: 1 }
    })
    mocks.getClient.mockResolvedValue({
      query: mocks.clientQuery,
      release: mocks.release,
      on: mocks.on,
      removeListener: mocks.removeListener,
    })
    const { resetJobRuntimeStateForTests } = await import('../services/jobRuntime.js')
    resetJobRuntimeStateForTests()
  })

  it('times out a hung attempt, aborts it, and does not start a concurrent retry', async () => {
    const {
      getJobRuntimeHealth,
      resetJobRuntimeStateForTests,
      runJobWithRetry,
    } = await import('../services/jobRuntime.js')
    resetJobRuntimeStateForTests()
    const runner = vi.fn(async (_attempt: number, context: { signal: AbortSignal }) => {
      await new Promise<never>((_resolve, reject) => {
        context.signal.addEventListener('abort', () => reject(context.signal.reason), { once: true })
      })
    })

    await expect(runJobWithRetry(
      {
        jobName: 'hungJob',
        triggeredBy: 'scheduler',
        maxAttempts: 3,
        baseDelayMs: 0,
        timeoutMs: 20,
      },
      runner,
    )).rejects.toMatchObject({ code: 'JOB_ATTEMPT_TIMEOUT' })

    expect(runner).toHaveBeenCalledOnce()
    expect(getJobRuntimeHealth()).toMatchObject({
      healthy: false,
      activeAttemptCount: 0,
      lastFailureCode: 'JOB_ATTEMPT_TIMEOUT',
    })
  })

  it('notifies the runtime owner when a hard timeout requires worker shutdown', async () => {
    const {
      onJobRuntimeFatal,
      runJobWithRetry,
    } = await import('../services/jobRuntime.js')
    const fatal = vi.fn()
    const unsubscribe = onJobRuntimeFatal(fatal)

    try {
      await expect(runJobWithRetry({
        jobName: 'fatalTimeoutJob',
        triggeredBy: 'scheduler',
        maxAttempts: 3,
        timeoutMs: 20,
      }, async (_attempt, context) => {
        await new Promise<never>((_resolve, reject) => {
          context.signal.addEventListener('abort', () => reject(context.signal.reason), { once: true })
        })
      })).rejects.toMatchObject({ code: 'JOB_ATTEMPT_TIMEOUT' })
    } finally {
      unsubscribe()
    }

    expect(fatal).toHaveBeenCalledOnce()
    expect(fatal.mock.calls[0]?.[0]).toMatchObject({ code: 'JOB_ATTEMPT_TIMEOUT' })
  })

  it('propagates a hard timeout to Supabase fetches so the active attempt can drain', async () => {
    const {
      getJobRuntimeHealth,
      runJobWithRetry,
      waitForActiveJobsToDrain,
    } = await import('../services/jobRuntime.js')
    const { createJobLeaseFencedFetch } = await import('../services/jobLeaseFenceContext.js')
    let requestSignal: AbortSignal | null = null
    const baseFetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      requestSignal = init?.signal ?? null
      return new Promise<Response>((_resolve, reject) => {
        requestSignal?.addEventListener('abort', () => reject(requestSignal?.reason), { once: true })
      })
    })
    const runtimeFetch = createJobLeaseFencedFetch(baseFetch as typeof fetch)

    await expect(runJobWithRetry({
      jobName: 'supabaseTimeoutJob',
      triggeredBy: 'scheduler',
      maxAttempts: 1,
      timeoutMs: 20,
    }, async () => runtimeFetch('https://example.test/rest/v1/tasks')))
      .rejects.toMatchObject({ code: 'JOB_ATTEMPT_TIMEOUT' })

    expect(requestSignal).not.toBeNull()
    expect(requestSignal?.aborted).toBe(true)
    await expect(waitForActiveJobsToDrain(100)).resolves.toBe(true)
    expect(getJobRuntimeHealth().activeAttemptCount).toBe(0)
  })

  it('stops accepting work during shutdown and drains an abort-aware active attempt', async () => {
    const {
      beginJobRuntimeShutdown,
      getJobRuntimeHealth,
      resetJobRuntimeStateForTests,
      runJobWithRetry,
      waitForActiveJobsToDrain,
    } = await import('../services/jobRuntime.js')
    resetJobRuntimeStateForTests()
    const runner = vi.fn(async (_attempt: number, context: { signal: AbortSignal }) => {
      await new Promise<never>((_resolve, reject) => {
        context.signal.addEventListener('abort', () => reject(context.signal.reason), { once: true })
      })
    })

    const activeRun = runJobWithRetry({
      jobName: 'drainingJob',
      triggeredBy: 'scheduler',
      maxAttempts: 1,
      timeoutMs: 10_000,
    }, runner)
    await vi.waitFor(() => expect(getJobRuntimeHealth().activeAttemptCount).toBe(1))

    beginJobRuntimeShutdown()

    await expect(activeRun).rejects.toMatchObject({ code: 'JOB_RUNTIME_SHUTTING_DOWN' })
    await expect(waitForActiveJobsToDrain(100)).resolves.toBe(true)
    await expect(runJobWithRetry({
      jobName: 'rejectedDuringShutdown',
      triggeredBy: 'scheduler',
      maxAttempts: 1,
    }, vi.fn(async () => undefined))).rejects.toMatchObject({ code: 'JOB_RUNTIME_SHUTTING_DOWN' })
  })

  it('reports shutdown immediately but keeps a non-cancellable attempt tracked until it settles', async () => {
    const {
      beginJobRuntimeShutdown,
      getJobRuntimeHealth,
      runJobWithRetry,
      waitForActiveJobsToDrain,
    } = await import('../services/jobRuntime.js')
    let releaseAttempt!: () => void
    const runner = vi.fn(async () => {
      await new Promise<void>((resolve) => {
        releaseAttempt = resolve
      })
    })

    const activeRun = runJobWithRetry({
      jobName: 'nonCancellableJob',
      triggeredBy: 'scheduler',
      maxAttempts: 1,
      timeoutMs: 5_000,
    }, runner)
    await vi.waitFor(() => expect(getJobRuntimeHealth().activeAttemptCount).toBe(1))

    beginJobRuntimeShutdown()
    const shutdownResult = await Promise.race([
      activeRun.catch((error) => error),
      new Promise<'still_waiting'>((resolve) => setTimeout(() => resolve('still_waiting'), 30)),
    ])

    expect(shutdownResult).toMatchObject({ code: 'JOB_RUNTIME_SHUTTING_DOWN' })
    expect(getJobRuntimeHealth().activeAttemptCount).toBe(1)
    await expect(waitForActiveJobsToDrain(20)).resolves.toBe(false)

    releaseAttempt()
    await expect(waitForActiveJobsToDrain(100)).resolves.toBe(true)
  })

  it('retries a failed job and returns the recovered result', async () => {
    const { runJobWithRetry } = await import('../services/jobRuntime.js')
    const runner = vi
      .fn()
      .mockRejectedValueOnce(new Error('temporary'))
      .mockResolvedValueOnce({ ok: true })

    const result = await runJobWithRetry(
      {
        jobName: 'demoJob',
        triggeredBy: 'scheduler',
        maxAttempts: 3,
        baseDelayMs: 0,
      },
      runner,
    )

    expect(result).toEqual({
      attempts: 2,
      value: { ok: true },
    })
    expect(runner).toHaveBeenCalledTimes(2)
    expect(mocks.query).not.toHaveBeenCalled()
  })

  it('records a failure row after exhausting retries', async () => {
    const { runJobWithRetry } = await import('../services/jobRuntime.js')
    const runner = vi.fn().mockRejectedValue(new Error('boom'))

    await expect(
      runJobWithRetry(
        {
          jobName: 'demoJob',
          triggeredBy: 'manual',
          jobId: 'job-1',
          maxAttempts: 3,
          baseDelayMs: 0,
        },
        runner,
      ),
    ).rejects.toThrow('boom')

    expect(runner).toHaveBeenCalledTimes(3)
    expect(mocks.query).toHaveBeenCalled()
    expect(mocks.query.mock.calls.at(-1)?.[0]).toContain('INSERT INTO public.job_failures')
    expect(mocks.query.mock.calls.at(-1)?.[1]?.slice(0, 5)).toEqual([
      'demoJob',
      'job-1',
      'manual',
      3,
      'boom',
    ])
  })

  it('runs a job while holding a PostgreSQL advisory lease on the same client', async () => {
    const { runWithJobLease } = await import('../services/jobRuntime.js')
    const runner = vi.fn(async (lease: {
      jobName: string
      fenceToken: string
      generation: number
    }) => ({
      ok: true,
      jobName: lease.jobName,
      fenceToken: lease.fenceToken,
      generation: lease.generation,
    }))

    const result = await runWithJobLease(
      {
        jobName: 'conditionAlertJob',
        jobId: 'job-1',
      },
      runner,
    )

    expect(result).toEqual({
      acquired: true,
      value: {
        ok: true,
        jobName: 'conditionAlertJob',
        fenceToken: expect.stringMatching(/^[0-9a-f-]{36}$/),
        generation: 7,
      },
    })
    expect(mocks.getClient).toHaveBeenCalledTimes(1)
    expect(mocks.clientQuery.mock.calls[0]?.[0]).toContain('pg_try_advisory_lock')
    expect(mocks.clientQuery.mock.calls[0]?.[1]).toEqual(['workbuddy_job_lease', 'conditionAlertJob'])
    expect(mocks.clientQuery.mock.calls.some((call) => String(call[0]).includes('pg_backend_pid'))).toBe(true)
    const fenceInsert = mocks.clientQuery.mock.calls.find((call) => String(call[0]).includes('INSERT INTO public.job_lease_fences'))
    expect(fenceInsert).toBeDefined()
    expect(mocks.clientQuery.mock.calls.find((call) => String(call[0]).includes('backend_start::text'))).toBeDefined()
    expect(fenceInsert?.[1]?.[3]).toBe('2026-07-12 00:00:00.123456+00')
    expect(runner).toHaveBeenCalledTimes(1)
    expect(mocks.clientQuery.mock.calls.some((call) => String(call[0]).includes('active_token = NULL'))).toBe(true)
    expect(mocks.clientQuery.mock.calls.at(-1)?.[0]).toContain('pg_advisory_unlock')
    expect(mocks.release).toHaveBeenCalledTimes(1)
  })

  it('skips a job when another process already holds the advisory lease', async () => {
    mocks.clientQuery.mockResolvedValueOnce({ rows: [{ acquired: false }], rowCount: 1 })
    const { runWithJobLease } = await import('../services/jobRuntime.js')
    const runner = vi.fn()

    const result = await runWithJobLease(
      {
        jobName: 'conditionAlertJob',
        jobId: 'job-1',
      },
      runner,
    )

    expect(result).toEqual({ acquired: false, reason: 'lease_not_acquired' })
    expect(runner).not.toHaveBeenCalled()
    expect(mocks.clientQuery.mock.calls.some((call) => String(call[0]).includes('pg_advisory_unlock'))).toBe(false)
    expect(mocks.release).toHaveBeenCalledTimes(1)
  })

  it('fails closed and aborts the active runner when the lease connection is lost', async () => {
    const {
      getJobRuntimeHealth,
      onJobRuntimeFatal,
      runWithJobLease,
    } = await import('../services/jobRuntime.js')
    const fatalListener = vi.fn()
    onJobRuntimeFatal(fatalListener)
    let observedSignal: AbortSignal | null = null

    const activeRun = runWithJobLease(
      {
        jobName: 'conditionAlertJob',
        jobId: 'job-lease-lost',
      },
      async ({ signal }) => {
        observedSignal = signal
        await new Promise<never>((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(signal.reason), { once: true })
        })
      },
    )

    await vi.waitFor(() => {
      expect(observedSignal).not.toBeNull()
      expect(mocks.listeners.has('error')).toBe(true)
    })

    mocks.listeners.get('error')?.(new Error('lease socket lost'))

    await expect(activeRun).rejects.toMatchObject({
      code: 'JOB_LEASE_LOST',
      message: expect.stringContaining('conditionAlertJob'),
    })
    expect(observedSignal?.aborted).toBe(true)
    expect(fatalListener).toHaveBeenCalledWith(expect.objectContaining({ code: 'JOB_LEASE_LOST' }))
    expect(getJobRuntimeHealth()).toMatchObject({
      healthy: false,
      acceptingJobs: false,
      lastFailureCode: 'JOB_LEASE_LOST',
    })
    expect(mocks.clientQuery.mock.calls.some((call) => String(call[0]).includes('pg_advisory_unlock'))).toBe(false)
    expect(mocks.release).toHaveBeenCalledTimes(1)
  })
})
