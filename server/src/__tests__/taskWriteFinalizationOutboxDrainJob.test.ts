import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  TaskWriteFinalizationOutboxDrainIncompleteError,
  TaskWriteFinalizationOutboxDrainJob,
} from '../jobs/taskWriteFinalizationOutboxDrainJob.js'
import { resetJobRuntimeStateForTests, runJobWithRetry } from '../services/jobRuntime.js'

const runtimeMocks = vi.hoisted(() => ({
  query: vi.fn(async () => ({ rows: [], rowCount: 1 })),
}))

vi.mock('../database.js', () => ({
  query: runtimeMocks.query,
}))

const serverRoot = process.cwd().endsWith('server')
  ? process.cwd()
  : resolve(process.cwd(), 'server')
const JOB_NAME = 'taskWriteFinalizationOutboxDrainJob'

function successfulDrain(overrides: Record<string, unknown> = {}) {
  return {
    claimed: 2,
    completed: 2,
    failed: 0,
    failureIds: [],
    batches: 1,
    maxBatches: 4,
    backlogCount: 0,
    readyBacklogCount: 0,
    failedBacklogCount: 0,
    expiredProcessingCount: 0,
    oldestPendingAt: null,
    oldestPendingAgeSeconds: null,
    backlogAgeExceeded: false,
    ...overrides,
  }
}

function createLeaseContext() {
  return {
    jobName: JOB_NAME,
    fenceToken: 'fence-token',
    generation: 1,
    signal: new AbortController().signal,
    assertActive: vi.fn(),
  }
}

function createSuccessfulLeaseRunner() {
  return vi.fn(async (_options, runner) => ({
    acquired: true as const,
    value: await runner(createLeaseContext()),
  }))
}

function createSingleAttemptRetryRunner() {
  return vi.fn(async (_options, runner) => ({
    attempts: 1,
    value: await runner(1, {
      attempt: 1,
      signal: new AbortController().signal,
      deadlineAt: '2026-07-26T01:10:00.000Z',
    }),
  }))
}

afterEach(() => {
  resetJobRuntimeStateForTests()
})

describe('task write finalization outbox drain job contract', () => {
  it('uses an independent persistent schedule and lease for only the bounded finalization drain', () => {
    const jobPath = resolve(serverRoot, 'src', 'jobs', 'taskWriteFinalizationOutboxDrainJob.ts')
    const source = existsSync(jobPath) ? readFileSync(jobPath, 'utf8') : ''

    expect(source).toContain("'taskWriteFinalizationOutboxDrainJob'")
    expect(source).toMatch(/schedule:\s*{\s*kind:\s*'minute_interval',\s*intervalMinutes/)
    expect(source).toContain('PersistentWallClockJobTimer')
    expect(source).toContain('runJobWithRetry')
    expect(source).toContain('runWithJobLease')
    expect(source).toContain('=> leaseRunner(')
    expect(source).toContain('AbortSignal.any([attemptContext.signal, lease.signal])')
    expect(source).toContain('drainTaskWriteFinalizationOutbox')
    expect(source).not.toContain('durationLearningRuntimeLifecycle')
    expect(source).not.toContain('autoPublish')
  })

  it('drains with injectable owner, time, and bounded batch inputs under its own lease', async () => {
    const drain = vi.fn(async () => successfulDrain())
    const leaseRunner = createSuccessfulLeaseRunner()
    const retryRunner = createSingleAttemptRetryRunner()
    const job = new TaskWriteFinalizationOutboxDrainJob({
      drain: drain as any,
      leaseRunner: leaseRunner as any,
      retryRunner: retryRunner as any,
      ownerId: 'task-finalization-owner',
      now: () => '2026-07-26T01:00:00.000Z',
      limit: 25,
      maxBatches: 3,
      backlogAgeGateMs: 15 * 60 * 1_000,
    })

    const result = await job.executeNow()

    expect(leaseRunner).toHaveBeenCalledWith(
      expect.objectContaining({ jobName: JOB_NAME }),
      expect.any(Function),
    )
    expect(retryRunner).toHaveBeenCalledWith(
      expect.objectContaining({ jobName: JOB_NAME, triggeredBy: 'manual', maxAttempts: 1 }),
      expect.any(Function),
    )
    expect(drain).toHaveBeenCalledWith(expect.objectContaining({
      ownerId: 'task-finalization-owner',
      now: '2026-07-26T01:00:00.000Z',
      limit: 25,
      maxBatches: 3,
      backlogAgeGateMs: 15 * 60 * 1_000,
      signal: expect.anything(),
    }))
    expect(result).toEqual(expect.objectContaining({
      status: 'completed',
      attempts: 1,
      claimed: 2,
      completed: 2,
    }))
  })

  it('reports distributed lease contention as an observable skip without draining', async () => {
    const drain = vi.fn(async () => successfulDrain())
    const job = new TaskWriteFinalizationOutboxDrainJob({
      drain: drain as any,
      leaseRunner: vi.fn(async () => ({
        acquired: false as const,
        reason: 'lease_not_acquired' as const,
      })) as any,
      retryRunner: createSingleAttemptRetryRunner() as any,
    })

    await expect(job.executeNow()).resolves.toEqual({
      status: 'skipped',
      reason: 'lease_not_acquired',
    })
    expect(drain).not.toHaveBeenCalled()
  })

  it('uses a local overlap guard while a drain is still running', async () => {
    let releaseDrain: (() => void) | undefined
    const drain = vi.fn(() => new Promise<ReturnType<typeof successfulDrain>>((resolveDrain) => {
      releaseDrain = () => resolveDrain(successfulDrain())
    }))
    const job = new TaskWriteFinalizationOutboxDrainJob({
      drain: drain as any,
      leaseRunner: createSuccessfulLeaseRunner() as any,
      retryRunner: createSingleAttemptRetryRunner() as any,
    })

    const first = job.executeNow()
    await vi.waitFor(() => expect(drain).toHaveBeenCalledTimes(1))
    await expect(job.executeNow()).resolves.toEqual({
      status: 'skipped',
      reason: 'already_running',
    })
    releaseDrain?.()
    await expect(first).resolves.toEqual(expect.objectContaining({ status: 'completed' }))
  })

  it('keeps its lease and running status until a timed-out non-abort-aware drain settles', async () => {
    let leaseHeld = false
    let releaseDrain: (() => void) | undefined
    let observedSignal: AbortSignal | undefined
    const drain = vi.fn((input: { signal?: AbortSignal }) => {
      observedSignal = input.signal
      return new Promise<ReturnType<typeof successfulDrain>>((resolveDrain) => {
        releaseDrain = () => resolveDrain(successfulDrain())
      })
    })
    const leaseRunner = vi.fn(async (_options, runner) => {
      if (leaseHeld) return { acquired: false as const, reason: 'lease_not_acquired' as const }
      leaseHeld = true
      try {
        return { acquired: true as const, value: await runner(createLeaseContext()) }
      } finally {
        leaseHeld = false
      }
    })
    const retryRunner: typeof runJobWithRetry = (options, runner) =>
      runJobWithRetry({ ...options, timeoutMs: 20 }, runner)
    const job = new TaskWriteFinalizationOutboxDrainJob({
      drain: drain as any,
      leaseRunner: leaseRunner as any,
      retryRunner,
    })

    const first = job.executeNow().then(
      (value) => ({ value, error: null }),
      (error: unknown) => ({ value: null, error }),
    )
    await vi.waitFor(() => expect(drain).toHaveBeenCalledTimes(1))

    try {
      const outcome = await first
      expect(outcome.error).toMatchObject({ code: 'JOB_ATTEMPT_TIMEOUT' })
      expect(observedSignal?.aborted).toBe(true)
      expect(leaseHeld).toBe(true)
      expect(job.getStatus().isRunning).toBe(true)
      await expect(job.executeNow()).resolves.toEqual({
        status: 'skipped',
        reason: 'lease_not_acquired',
      })
      expect(drain).toHaveBeenCalledTimes(1)
    } finally {
      releaseDrain?.()
      await vi.waitFor(() => expect(leaseHeld).toBe(false))
      await vi.waitFor(() => expect(job.getStatus().isRunning).toBe(false))
    }
  })

  it('fails the slot on processor failures, ready backlog, expired work, or stale backlog', async () => {
    const cases = [
      successfulDrain({ failed: 1, failureIds: ['event-1'] }),
      successfulDrain({ backlogCount: 1, readyBacklogCount: 1 }),
      successfulDrain({ expiredProcessingCount: 1 }),
      successfulDrain({
        backlogCount: 1,
        oldestPendingAt: '2026-07-26T00:00:00.000Z',
        oldestPendingAgeSeconds: 3600,
        backlogAgeExceeded: true,
      }),
    ]

    for (const drainResult of cases) {
      const job = new TaskWriteFinalizationOutboxDrainJob({
        drain: vi.fn(async () => drainResult) as any,
        leaseRunner: createSuccessfulLeaseRunner() as any,
        retryRunner: createSingleAttemptRetryRunner() as any,
      })
      await expect(job.executeNow()).rejects.toBeInstanceOf(
        TaskWriteFinalizationOutboxDrainIncompleteError,
      )
    }
  })

  it('starts and stops its persistent timer', () => {
    const timer = {
      start: vi.fn(() => true),
      stop: vi.fn(() => true),
      getStatus: vi.fn(() => ({ isScheduled: false, nextRun: null })),
    }
    const timerFactory = vi.fn(() => timer)
    const job = new TaskWriteFinalizationOutboxDrainJob({ timerFactory })

    job.start()
    job.stop()

    expect(timerFactory).toHaveBeenCalledWith(expect.objectContaining({
      jobName: JOB_NAME,
      schedule: { kind: 'minute_interval', intervalMinutes: 5 },
    }))
    expect(timer.start).toHaveBeenCalledOnce()
    expect(timer.stop).toHaveBeenCalledOnce()
  })
})
