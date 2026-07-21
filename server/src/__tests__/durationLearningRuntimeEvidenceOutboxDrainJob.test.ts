import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

const runtimeMocks = vi.hoisted(() => ({
  query: vi.fn(async () => ({ rows: [], rowCount: 1 })),
}))

vi.mock('../database.js', () => ({
  query: runtimeMocks.query,
}))

const JOB_NAME = 'durationLearningRuntimeEvidenceOutboxDrainJob'
const jobSourcePath = resolve(process.cwd(), 'src/jobs/durationLearningRuntimeEvidenceOutboxDrainJob.ts')
const recoveryRunbookPath = resolve(
  process.cwd(),
  '../docs/runbooks/duration-learning-runtime-evidence-outbox-recovery.md',
)

function successfulDrain(overrides: Record<string, unknown> = {}) {
  return {
    claimed: 2,
    completed: 2,
    failed: 0,
    failureKeys: [],
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

type JobModule = typeof import('../jobs/durationLearningRuntimeEvidenceOutboxDrainJob.js')
type JobRuntimeModule = typeof import('../services/jobRuntime.js')
let jobModule: JobModule
let jobRuntimeModule: JobRuntimeModule

beforeAll(async () => {
  expect(existsSync(jobSourcePath), `${JOB_NAME} source must exist`).toBe(true)
  ;[jobModule, jobRuntimeModule] = await Promise.all([
    import('../jobs/durationLearningRuntimeEvidenceOutboxDrainJob.js'),
    import('../services/jobRuntime.js'),
  ])
}, 60_000)

afterEach(() => {
  jobRuntimeModule.resetJobRuntimeStateForTests()
})

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
      deadlineAt: '2026-07-21T04:10:00.000Z',
    }),
  }))
}

describe('durationLearningRuntimeEvidenceOutboxDrainJob', () => {
  it('uses a unique five-minute persistent schedule without invoking the publication lifecycle', async () => {
    const source = readFileSync(jobSourcePath, 'utf8')
    const schedulerSource = readFileSync(resolve(process.cwd(), 'src/scheduler.ts'), 'utf8')
    const persistentScheduleSource = readFileSync(
      resolve(process.cwd(), 'src/services/persistentJobScheduleService.ts'),
      'utf8',
    )
    const jobsRouteSource = readFileSync(resolve(process.cwd(), 'src/routes/jobs.ts'), 'utf8')
    const serverPackage = JSON.parse(readFileSync(resolve(process.cwd(), 'package.json'), 'utf8')) as {
      scripts?: Record<string, string>
    }
    const registry = JSON.parse(readFileSync(
      resolve(process.cwd(), 'src/registry/system-domain-registry.json'),
      'utf8',
    )) as { entries?: Array<{ kind?: string; id?: string }> }

    expect(source).toContain(`DURATION_LEARNING_RUNTIME_EVIDENCE_OUTBOX_DRAIN_JOB_NAME =`)
    expect(source).toContain('DURATION_LEARNING_RUNTIME_EVIDENCE_OUTBOX_DRAIN_INTERVAL_MINUTES = 5')
    expect(source).toContain("schedule: { kind: 'minute_interval', intervalMinutes: DURATION_LEARNING_RUNTIME_EVIDENCE_OUTBOX_DRAIN_INTERVAL_MINUTES }")
    expect(source).toContain('drainDurationLearningRuntimeEvidenceOutbox')
    expect(source).not.toContain('runDurationLearningRuntimeLifecycleSweep')
    expect(source).not.toContain('promoteDurationLearningRuntimeCanary')
    expect(schedulerSource).toContain("import { durationLearningRuntimeEvidenceOutboxDrainJob } from './jobs/durationLearningRuntimeEvidenceOutboxDrainJob.js'")
    expect(schedulerSource).toContain('durationLearningRuntimeEvidenceOutboxDrainJob.start()')
    expect(schedulerSource).toContain('durationLearningRuntimeEvidenceOutboxDrainJob.stop()')
    expect(persistentScheduleSource).toContain(`'${JOB_NAME}'`)
    expect(registry.entries).toContainEqual(expect.objectContaining({ kind: 'job', id: JOB_NAME }))
    expect(jobsRouteSource).toContain("import { durationLearningRuntimeEvidenceOutboxDrainJob } from '../jobs/durationLearningRuntimeEvidenceOutboxDrainJob.js'")
    expect(jobsRouteSource).toContain('const durationLearningRuntimeEvidenceOutboxDrainStatus = durationLearningRuntimeEvidenceOutboxDrainJob.getStatus()')
    expect(jobsRouteSource).toContain(`name: '${JOB_NAME}'`)
    expect(jobsRouteSource).not.toContain(`case '${JOB_NAME}':`)
    expect(jobsRouteSource).not.toContain("/operator/duration-learning-runtime-evidence-outbox-drain")
    expect(serverPackage.scripts?.['recover:duration-learning-runtime-evidence-outbox']).toBe(
      'tsx -r dotenv/config src/scripts/recover-duration-learning-runtime-evidence-outbox.ts',
    )
    expect(existsSync(recoveryRunbookPath)).toBe(true)
    const recoveryRunbook = readFileSync(recoveryRunbookPath, 'utf8')
    expect(recoveryRunbook).toContain('No HTTP manual-execution endpoint')
    expect(recoveryRunbook).toContain('five-minute persistent schedule')
  })

  it('drains with injectable authority, time and bounded batch inputs under its own lease', async () => {
    const drain = vi.fn(async () => successfulDrain())
    const queryExec = vi.fn()
    const leaseRunner = createSuccessfulLeaseRunner()
    const retryRunner = createSingleAttemptRetryRunner()
    const job = new jobModule.DurationLearningRuntimeEvidenceOutboxDrainJob({
      drain,
      queryExec,
      leaseRunner,
      retryRunner,
      ownerId: 'outbox-owner',
      now: () => '2026-07-21T04:00:00.000Z',
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
      queryExec,
      ownerId: 'outbox-owner',
      now: '2026-07-21T04:00:00.000Z',
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
    const leaseRunner = vi.fn(async () => ({
      acquired: false as const,
      reason: 'lease_not_acquired' as const,
    }))
    const job = new jobModule.DurationLearningRuntimeEvidenceOutboxDrainJob({
      drain,
      queryExec: vi.fn(),
      leaseRunner,
      retryRunner: createSingleAttemptRetryRunner(),
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
    const job = new jobModule.DurationLearningRuntimeEvidenceOutboxDrainJob({
      drain,
      queryExec: vi.fn(),
      leaseRunner: createSuccessfulLeaseRunner(),
      retryRunner: createSingleAttemptRetryRunner(),
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

  it('keeps the distributed lease until a non-abort-aware timed-out drain actually settles', async () => {
    let leaseHeld = false
    let releaseDrain: (() => void) | undefined
    let attemptSignal: AbortSignal | undefined
    let drainCallCount = 0
    const drain = vi.fn((input: { signal?: AbortSignal }) => {
      drainCallCount += 1
      attemptSignal = input.signal
      if (drainCallCount > 1) return Promise.resolve(successfulDrain())
      return new Promise<ReturnType<typeof successfulDrain>>((resolveDrain) => {
        releaseDrain = () => resolveDrain(successfulDrain())
      })
    })
    const leaseRunner = vi.fn(async (_options, runner) => {
      if (leaseHeld) {
        return { acquired: false as const, reason: 'lease_not_acquired' as const }
      }
      leaseHeld = true
      try {
        return { acquired: true as const, value: await runner(createLeaseContext()) }
      } finally {
        leaseHeld = false
      }
    })
    const retryRunner: typeof jobRuntimeModule.runJobWithRetry = (options, runner) =>
      jobRuntimeModule.runJobWithRetry({ ...options, timeoutMs: 20 }, runner)
    const job = new jobModule.DurationLearningRuntimeEvidenceOutboxDrainJob({
      drain: drain as any,
      queryExec: vi.fn(),
      leaseRunner,
      retryRunner,
    })

    const first = job.executeNow().then(
      (value) => ({ value, error: null }),
      (error: unknown) => ({ value: null, error }),
    )
    await vi.waitFor(() => expect(drain).toHaveBeenCalledTimes(1))

    try {
      const firstOutcome = await first
      expect(firstOutcome.error).toMatchObject({ code: 'JOB_ATTEMPT_TIMEOUT' })
      expect(attemptSignal?.aborted).toBe(true)
      expect(leaseHeld).toBe(true)

      await expect(job.executeNow()).resolves.toEqual({
        status: 'skipped',
        reason: 'lease_not_acquired',
      })
      expect(drain).toHaveBeenCalledTimes(1)
    } finally {
      releaseDrain?.()
      await vi.waitFor(() => expect(leaseHeld).toBe(false))
    }
  })

  it('propagates processor and lease failures so the persistent slot can retry', async () => {
    const processorError = new Error('outbox processor unavailable')
    const processorJob = new jobModule.DurationLearningRuntimeEvidenceOutboxDrainJob({
      drain: vi.fn(async () => { throw processorError }),
      queryExec: vi.fn(),
      leaseRunner: createSuccessfulLeaseRunner(),
      retryRunner: createSingleAttemptRetryRunner(),
    })

    await expect(processorJob.executeNow()).rejects.toBe(processorError)

    const leaseError = new Error('lease lost')
    const leaseRunner = vi.fn(async (_options, runner) => {
      const context = createLeaseContext()
      context.assertActive = vi.fn(() => { throw leaseError })
      return { acquired: true as const, value: await runner(context) }
    })
    const leaseJob = new jobModule.DurationLearningRuntimeEvidenceOutboxDrainJob({
      drain: vi.fn(async () => successfulDrain()),
      queryExec: vi.fn(),
      leaseRunner,
      retryRunner: createSingleAttemptRetryRunner(),
    })

    await expect(leaseJob.executeNow()).rejects.toBe(leaseError)
  })

  it.each([
    ['ready backlog remains after the bounded batch limit', successfulDrain({
      batches: 4,
      maxBatches: 4,
      backlogCount: 3,
      readyBacklogCount: 3,
    }), 'ready_backlog_remaining'],
    ['the oldest pending event exceeds the freshness gate', successfulDrain({
      backlogCount: 1,
      oldestPendingAt: '2026-07-21T02:00:00.000Z',
      oldestPendingAgeSeconds: 7200,
      backlogAgeExceeded: true,
    }), 'backlog_age_exceeded'],
  ])('fails when %s', async (_label, drainResult, expectedReason) => {
    const job = new jobModule.DurationLearningRuntimeEvidenceOutboxDrainJob({
      drain: vi.fn(async () => drainResult),
      queryExec: vi.fn(),
      leaseRunner: createSuccessfulLeaseRunner(),
      retryRunner: createSingleAttemptRetryRunner(),
    })

    const execution = job.executeNow()
    await expect(execution).rejects.toBeInstanceOf(
      jobModule.DurationLearningRuntimeEvidenceOutboxDrainIncompleteError,
    )
    await expect(execution).rejects.toMatchObject({
      details: expect.objectContaining({ failureReasons: expect.arrayContaining([expectedReason]) }),
    })
  })

  it('starts and stops its persistent timer without starting the daily lifecycle job', async () => {
    const timer = {
      start: vi.fn(() => true),
      stop: vi.fn(() => true),
      getStatus: vi.fn(() => ({ isScheduled: false, nextRun: null })),
    }
    const timerFactory = vi.fn(() => timer)
    const job = new jobModule.DurationLearningRuntimeEvidenceOutboxDrainJob({
      timerFactory,
      drain: vi.fn(async () => successfulDrain()),
      queryExec: vi.fn(),
      leaseRunner: createSuccessfulLeaseRunner(),
      retryRunner: createSingleAttemptRetryRunner(),
    })

    job.start()
    job.stop()

    expect(timerFactory).toHaveBeenCalledWith(expect.objectContaining({
      jobName: JOB_NAME,
      schedule: { kind: 'minute_interval', intervalMinutes: 5 },
    }))
    expect(timer.start).toHaveBeenCalledTimes(1)
    expect(timer.stop).toHaveBeenCalledTimes(1)
  })
})
