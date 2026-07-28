import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it, vi } from 'vitest'

import {
  TaskWriteFinalizationOutboxIncompleteError,
  TaskWriteFinalizationOutboxJob,
} from '../jobs/taskWriteFinalizationOutboxJob.js'

const serverRoot = process.cwd().replace(/\\/g, '/').endsWith('/server')
  ? process.cwd()
  : resolve(process.cwd(), 'server')

function successfulDrain(overrides: Record<string, unknown> = {}) {
  return {
    claimed: 1,
    completed: 1,
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

describe('task write finalization outbox job', () => {
  it('uses an independent one-minute persistent schedule and is fully registered', () => {
    const source = readFileSync(resolve(serverRoot, 'src/jobs/taskWriteFinalizationOutboxJob.ts'), 'utf8')
    const scheduler = readFileSync(resolve(serverRoot, 'src/scheduler.ts'), 'utf8')
    const schedules = readFileSync(resolve(serverRoot, 'src/services/persistentJobScheduleService.ts'), 'utf8')
    const jobsRoute = readFileSync(resolve(serverRoot, 'src/routes/jobs.ts'), 'utf8')
    const dbService = readFileSync(resolve(serverRoot, 'src/services/dbService.ts'), 'utf8')
    const registry = readFileSync(resolve(serverRoot, 'src/registry/system-domain-registry.json'), 'utf8')

    expect(source).toContain("TASK_WRITE_FINALIZATION_OUTBOX_JOB_NAME = 'taskWriteFinalizationOutboxJob'")
    expect(source).toContain('TASK_WRITE_FINALIZATION_OUTBOX_INTERVAL_MINUTES = 1')
    expect(scheduler).toContain('taskWriteFinalizationOutboxJob.start()')
    expect(scheduler).toContain('taskWriteFinalizationOutboxJob.stop()')
    expect(schedules).toContain("'taskWriteFinalizationOutboxJob'")
    expect(jobsRoute).toContain("name: 'taskWriteFinalizationOutboxJob'")
    expect(jobsRoute).not.toContain("case 'taskWriteFinalizationOutboxJob':")
    expect(dbService).not.toContain('processTaskWriteFinalizationOutboxForMutation')
    expect(registry).toContain('"id": "taskWriteFinalizationOutboxJob"')
  })

  it('runs the bounded drain under retry and distributed lease', async () => {
    const drain = vi.fn(async () => successfulDrain())
    const leaseRunner = vi.fn(async (_options, runner) => ({
      acquired: true as const,
      value: await runner({
        signal: new AbortController().signal,
        assertActive: vi.fn(),
      }),
    }))
    const retryRunner = vi.fn(async (_options, runner) => ({
      attempts: 1,
      value: await runner(1, { signal: new AbortController().signal }),
    }))
    const timer = { start: vi.fn(() => true), stop: vi.fn(() => true), getStatus: vi.fn(() => ({ isScheduled: false, nextRun: null })) }
    const job = new TaskWriteFinalizationOutboxJob({
      drain,
      leaseRunner: leaseRunner as any,
      retryRunner: retryRunner as any,
      timerFactory: vi.fn(() => timer),
      queryExec: vi.fn(),
      finalize: vi.fn(),
      ownerId: 'worker-1',
      now: () => '2026-07-25T02:01:00.000Z',
    })

    await expect(job.executeNow()).resolves.toEqual(expect.objectContaining({ status: 'completed', completed: 1 }))
    expect(leaseRunner).toHaveBeenCalledWith(expect.objectContaining({ jobName: 'taskWriteFinalizationOutboxJob' }), expect.any(Function))
    expect(drain).toHaveBeenCalledWith(expect.objectContaining({ ownerId: 'worker-1', limit: expect.any(Number), signal: expect.anything() }))
  })

  it('uses a local overlap guard while the lease callback is still active', async () => {
    let releaseDrain: (() => void) | undefined
    const drain = vi.fn(() => new Promise<ReturnType<typeof successfulDrain>>((resolve) => {
      releaseDrain = () => resolve(successfulDrain())
    }))
    const leaseRunner = vi.fn(async (_options, runner) => ({
      acquired: true as const,
      value: await runner({ signal: new AbortController().signal, assertActive: vi.fn() }),
    }))
    const retryRunner = vi.fn(async (_options, runner) => ({
      attempts: 1,
      value: await runner(1, { signal: new AbortController().signal }),
    }))
    const job = new TaskWriteFinalizationOutboxJob({ drain, leaseRunner: leaseRunner as any, retryRunner: retryRunner as any })

    const first = job.executeNow()
    await vi.waitFor(() => expect(drain).toHaveBeenCalledTimes(1))
    await expect(job.executeNow()).resolves.toEqual({ status: 'skipped', reason: 'already_running' })
    expect(leaseRunner).toHaveBeenCalledTimes(1)
    releaseDrain?.()
    await expect(first).resolves.toEqual(expect.objectContaining({ status: 'completed' }))
  })

  it('keeps the lease callback active after deadline rejection until a non-abort-aware drain settles', async () => {
    let releaseDrain: (() => void) | undefined
    let leaseHeld = false
    const timeoutError = Object.assign(new Error('deadline reached'), { code: 'JOB_ATTEMPT_TIMEOUT' })
    const drain = vi.fn(() => new Promise<ReturnType<typeof successfulDrain>>((resolve) => {
      releaseDrain = () => resolve(successfulDrain())
    }))
    const leaseRunner = vi.fn(async (_options, runner) => {
      leaseHeld = true
      try {
        return {
          acquired: true as const,
          value: await runner({ signal: new AbortController().signal, assertActive: vi.fn() }),
        }
      } finally {
        leaseHeld = false
      }
    })
    const retryRunner = vi.fn(async (_options, runner) => {
      const controller = new AbortController()
      const operation = runner(1, { signal: controller.signal })
      operation.catch(() => undefined)
      await Promise.resolve()
      controller.abort(timeoutError)
      throw timeoutError
    })
    const job = new TaskWriteFinalizationOutboxJob({
      drain,
      leaseRunner: leaseRunner as any,
      retryRunner: retryRunner as any,
    })

    await expect(job.executeNow()).rejects.toBe(timeoutError)
    expect(leaseHeld).toBe(true)
    expect(job.getStatus().isRunning).toBe(true)
    await expect(job.executeNow()).resolves.toEqual({ status: 'skipped', reason: 'already_running' })
    expect(leaseRunner).toHaveBeenCalledTimes(1)

    releaseDrain?.()
    await vi.waitFor(() => expect(leaseHeld).toBe(false))
    await vi.waitFor(() => expect(job.getStatus().isRunning).toBe(false))
  })

  it.each([
    [successfulDrain({ failed: 1, failureIds: ['row-1'], backlogCount: 1 }), 'processor_failures'],
    [successfulDrain({ backlogCount: 2, readyBacklogCount: 2 }), 'ready_backlog_remaining'],
    [successfulDrain({ backlogCount: 1, backlogAgeExceeded: true }), 'backlog_age_exceeded'],
  ])('fails the persistent slot for an incomplete drain %#', async (drainResult, reason) => {
    const leaseRunner = vi.fn(async (_options, runner) => ({
      acquired: true as const,
      value: await runner({ signal: new AbortController().signal, assertActive: vi.fn() }),
    }))
    const retryRunner = vi.fn(async (_options, runner) => ({
      attempts: 1,
      value: await runner(1, { signal: new AbortController().signal }),
    }))
    const job = new TaskWriteFinalizationOutboxJob({
      drain: vi.fn(async () => drainResult as any),
      leaseRunner: leaseRunner as any,
      retryRunner: retryRunner as any,
    })

    const execution = job.executeNow()
    await expect(execution).rejects.toBeInstanceOf(TaskWriteFinalizationOutboxIncompleteError)
    await expect(execution).rejects.toMatchObject({
      details: expect.objectContaining({ failureReasons: expect.arrayContaining([reason]) }),
    })
  })
})
