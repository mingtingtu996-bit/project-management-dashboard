import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it, vi } from 'vitest'

import type { Task } from '../types/db.js'
import {
  drainTaskWriteFinalizationOutbox,
  processTaskWriteFinalizationOutbox,
  type TaskWriteFinalizationOutboxItem,
  type TaskWriteFinalizationOutboxStore,
} from '../services/taskWriteFinalizationOutboxService.js'

const serverRoot = process.cwd().endsWith('server')
  ? process.cwd()
  : resolve(process.cwd(), 'server')

describe('task write finalization outbox service contract', () => {
  it('exposes a database store, a single-batch processor, and a bounded drain', () => {
    const servicePath = resolve(serverRoot, 'src', 'services', 'taskWriteFinalizationOutboxService.ts')
    const source = existsSync(servicePath) ? readFileSync(servicePath, 'utf8') : ''

    expect(source).toContain('createDatabaseTaskWriteFinalizationOutboxStore')
    expect(source).toContain('processTaskWriteFinalizationOutbox')
    expect(source).toContain('drainTaskWriteFinalizationOutbox')
    expect(source).toContain('for update skip locked')
    expect(source).toContain('older.processing_status <> \'completed\'')
    expect(source).toContain('lease_expires_at')
  })

  const previousTask = {
    id: '11111111-1111-4111-8111-111111111111',
    project_id: '22222222-2222-4222-8222-222222222222',
    status: 'in_progress',
    progress: 80,
  } as Task
  const nextTask = {
    ...previousTask,
    status: 'completed',
    progress: 100,
    actual_end_date: '2026-07-26',
  } as Task

  function item(overrides: Partial<TaskWriteFinalizationOutboxItem> = {}): TaskWriteFinalizationOutboxItem {
    return {
      id: '33333333-3333-4333-8333-333333333333',
      companyId: '44444444-4444-4444-8444-444444444444',
      projectId: String(nextTask.project_id),
      taskId: String(nextTask.id),
      actorId: '55555555-5555-4555-8555-555555555555',
      previousTask,
      nextTask,
      attemptCount: 1,
      createdAt: '2026-07-26T00:00:00.000Z',
      ...overrides,
    }
  }

  function store(overrides: Partial<TaskWriteFinalizationOutboxStore> = {}): TaskWriteFinalizationOutboxStore {
    return {
      claim: vi.fn(async () => []),
      complete: vi.fn(async () => true),
      fail: vi.fn(async () => true),
      backlog: vi.fn(async () => ({
        backlogCount: 0,
        readyBacklogCount: 0,
        failedBacklogCount: 0,
        expiredProcessingCount: 0,
        oldestPendingAt: null,
      })),
      ...overrides,
    }
  }

  it('completes the exact claimed event after canonical finalization succeeds', async () => {
    const claimed = item()
    const outboxStore = store({ claim: vi.fn(async () => [claimed]) })
    const finalize = vi.fn(async () => undefined)

    const result = await processTaskWriteFinalizationOutbox({
      store: outboxStore,
      ownerId: 'worker-1',
      now: '2026-07-26T01:00:00.000Z',
      limit: 10,
      finalize,
    })

    expect(finalize).toHaveBeenCalledWith(nextTask, previousTask, claimed.actorId)
    expect(outboxStore.complete).toHaveBeenCalledWith({
      id: claimed.id,
      ownerId: 'worker-1',
      now: '2026-07-26T01:00:00.000Z',
    })
    expect(outboxStore.fail).not.toHaveBeenCalled()
    expect(result).toEqual({
      claimed: 1,
      completed: 1,
      failed: 0,
      failureIds: [],
    })
  })

  it('keeps a processor failure retryable with a bounded backoff', async () => {
    const claimed = item({ attemptCount: 2 })
    const outboxStore = store({ claim: vi.fn(async () => [claimed]) })

    const result = await processTaskWriteFinalizationOutbox({
      store: outboxStore,
      ownerId: 'worker-1',
      now: '2026-07-26T01:00:00.000Z',
      finalize: vi.fn(async () => {
        throw new Error('warning evaluator unavailable')
      }),
    })

    expect(outboxStore.complete).not.toHaveBeenCalled()
    expect(outboxStore.fail).toHaveBeenCalledWith(expect.objectContaining({
      id: claimed.id,
      ownerId: 'worker-1',
      now: '2026-07-26T01:00:00.000Z',
      nextAttemptAt: '2026-07-26T01:02:00.000Z',
      error: 'warning evaluator unavailable',
    }))
    expect(result).toEqual({
      claimed: 1,
      completed: 0,
      failed: 1,
      failureIds: [claimed.id],
    })
  })

  it('recovers a failed event after a process restart', async () => {
    const claimed = item()
    let state: 'ready' | 'leased' | 'failed' | 'completed' = 'ready'
    const outboxStore = store({
      claim: vi.fn(async () => {
        if (state !== 'ready' && state !== 'failed') return []
        state = 'leased'
        return [{ ...claimed, attemptCount: state === 'leased' ? 1 : 2 }]
      }),
      fail: vi.fn(async () => {
        state = 'failed'
        return true
      }),
      complete: vi.fn(async () => {
        state = 'completed'
        return true
      }),
    })

    const first = await processTaskWriteFinalizationOutbox({
      store: outboxStore,
      ownerId: 'worker-before-restart',
      now: '2026-07-26T01:00:00.000Z',
      finalize: vi.fn(async () => {
        throw new Error('process terminated')
      }),
    })
    const recoveredFinalize = vi.fn(async () => undefined)
    const second = await processTaskWriteFinalizationOutbox({
      store: outboxStore,
      ownerId: 'worker-after-restart',
      now: '2026-07-26T01:05:00.000Z',
      finalize: recoveredFinalize,
    })

    expect(first.failed).toBe(1)
    expect(second.completed).toBe(1)
    expect(recoveredFinalize).toHaveBeenCalledOnce()
    expect(state).toBe('completed')
  })

  it('does not claim work after the attempt signal is aborted', async () => {
    const controller = new AbortController()
    controller.abort(new Error('deadline exceeded'))
    const outboxStore = store()

    await expect(processTaskWriteFinalizationOutbox({
      store: outboxStore,
      ownerId: 'worker-1',
      finalize: vi.fn(async () => undefined),
      signal: controller.signal,
    })).rejects.toThrow('deadline exceeded')
    expect(outboxStore.claim).not.toHaveBeenCalled()
  })

  it('stops at max batches and exposes ready or stale backlog', async () => {
    let nextId = 0
    const outboxStore = store({
      claim: vi.fn(async () => [item({ id: `event-${++nextId}` })]),
      backlog: vi.fn(async () => ({
        backlogCount: 3,
        readyBacklogCount: 1,
        failedBacklogCount: 0,
        expiredProcessingCount: 0,
        oldestPendingAt: '2026-07-26T00:00:00.000Z',
      })),
    })

    const result = await drainTaskWriteFinalizationOutbox({
      store: outboxStore,
      ownerId: 'worker-1',
      now: '2026-07-26T01:00:00.000Z',
      limit: 1,
      maxBatches: 2,
      backlogAgeGateMs: 15 * 60 * 1_000,
      finalize: vi.fn(async () => undefined),
    })

    expect(outboxStore.claim).toHaveBeenCalledTimes(2)
    expect(result).toEqual(expect.objectContaining({
      claimed: 2,
      completed: 2,
      failed: 0,
      batches: 2,
      maxBatches: 2,
      backlogCount: 3,
      readyBacklogCount: 1,
      oldestPendingAgeSeconds: 3600,
      backlogAgeExceeded: true,
    }))
  })
})
