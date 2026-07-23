import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it, vi } from 'vitest'
import type {
  DurationExperienceReconciliationQueueItem,
  DurationExperienceReconciliationStore,
} from '../services/durationExperienceReconciliationService.js'

const {
  createDatabaseDurationExperienceReconciliationStore,
  enqueueDurationExperienceCollectionFailure,
  reconcileDurationExperienceSamples,
} = await import('../services/durationExperienceReconciliationService.js')

function queueItem(input: {
  id: string
  taskId: string
  actorId: string | null
  attemptCount: number
  maxAttempts: number
  sourceType?: 'task_completion' | 'structured_cause_confirmation'
  trigger?: string
}): DurationExperienceReconciliationQueueItem {
  return {
    ...input,
    companyId: 'company-1',
    projectId: 'project-1',
    trigger: input.trigger ?? 'task_completion',
    sourceType: input.sourceType ?? 'task_completion',
    task: {
      id: input.taskId,
      project_id: 'project-1',
      status: 'completed',
    } as DurationExperienceReconciliationQueueItem['task'],
  }
}

function createStore(items: DurationExperienceReconciliationQueueItem[] = []) {
  return {
    enqueue: vi.fn(async (record) => ({ id: 'queue-1', ...record })),
    registerMissingCompletedTasks: vi.fn(async () => 1),
    listDue: vi.fn(async (): Promise<DurationExperienceReconciliationQueueItem[]> => items),
    markCompleted: vi.fn(async () => undefined),
    markDeferred: vi.fn(async () => undefined),
    markFailed: vi.fn(async () => undefined),
  } satisfies DurationExperienceReconciliationStore
}

describe('durationExperienceReconciliationService', () => {
  it('enqueues a task-completion collection failure with resolved tenant ownership', async () => {
    const store = createStore()

    const result = await enqueueDurationExperienceCollectionFailure({
      projectId: 'project-1',
      taskId: 'task-1',
      actorId: 'user-1',
      trigger: 'task_completion',
      error: new Error('sample insert unavailable'),
    }, {
      store,
      resolveCompanyId: async () => 'company-1',
    })

    expect(result).toEqual(expect.objectContaining({ companyId: 'company-1', taskId: 'task-1' }))
    expect(store.enqueue).toHaveBeenCalledWith(expect.objectContaining({
      companyId: 'company-1',
      projectId: 'project-1',
      taskId: 'task-1',
      sourceType: 'task_completion',
      lastError: 'sample insert unavailable',
    }))
  })

  it('fails closed instead of creating a tenantless retry record', async () => {
    const store = createStore()

    await expect(enqueueDurationExperienceCollectionFailure({
      projectId: 'project-1',
      taskId: 'task-1',
      error: new Error('failed'),
    }, {
      store,
      resolveCompanyId: async () => null,
    })).rejects.toThrow('tenant ownership')
    expect(store.enqueue).not.toHaveBeenCalled()
  })

  it('discovers missing completed-task samples and closes recovered queue items idempotently', async () => {
    const items = [
      queueItem({ id: 'queue-1', taskId: 'task-1', actorId: null, attemptCount: 0, maxAttempts: 3 }),
      queueItem({ id: 'queue-2', taskId: 'task-2', actorId: 'user-2', attemptCount: 1, maxAttempts: 3 }),
    ]
    const store = createStore(items)
    const collectSample = vi.fn(async () => true)

    const result = await reconcileDurationExperienceSamples({
      projectIds: ['project-1'],
      limit: 20,
      maxAttempts: 3,
    }, { store, collectSample })

    expect(result).toEqual({
      discovered: 1,
      scanned: 2,
      recovered: 2,
      deferred: 0,
      retrying: 0,
      deadLettered: 0,
    })
    expect(collectSample).toHaveBeenCalledTimes(2)
    expect(store.markCompleted).toHaveBeenCalledTimes(2)
  })

  it('recovers a durable structured-cause rebuild after worker restart using stored actor and trigger', async () => {
    const item = queueItem({
      id: 'queue-confirmation-1', taskId: 'task-1', actorId: 'user-confirmed-1',
      attemptCount: 1, maxAttempts: 5, sourceType: 'structured_cause_confirmation',
      trigger: 'structured_cause_user_confirmation',
    })
    const store = createStore([item])
    store.registerMissingCompletedTasks.mockResolvedValue(0)
    const collectSample = vi.fn(async () => true)

    const result = await reconcileDurationExperienceSamples({ projectIds: ['project-1'] }, {
      store,
      collectSample,
    })

    expect(result).toEqual(expect.objectContaining({ discovered: 0, scanned: 1, recovered: 1 }))
    expect(collectSample).toHaveBeenCalledWith(item.task, {
      actorId: 'user-confirmed-1',
      trigger: 'structured_cause_user_confirmation',
    })
    expect(store.markCompleted).toHaveBeenCalledWith('queue-confirmation-1')
  })

  it('upserts repeated structured-cause confirmations to one durable task/source row', async () => {
    const queryExec = vi.fn(async (_sql: string, params: unknown[] = []) => ({
      rows: [{ id: 'queue-confirmation-1', source_type: params[5] }],
      rowCount: 1,
    }))
    const store = createDatabaseDurationExperienceReconciliationStore(queryExec)
    const record = {
      companyId: 'company-1', projectId: 'project-1', taskId: 'task-1', actorId: 'user-1',
      trigger: 'structured_cause_user_confirmation', sourceType: 'structured_cause_confirmation' as const,
      lastError: null, maxAttempts: 5,
    }

    await expect(Promise.all([store.enqueue(record), store.enqueue(record)]))
      .resolves.toEqual([
        expect.objectContaining({ id: 'queue-confirmation-1' }),
        expect.objectContaining({ id: 'queue-confirmation-1' }),
      ])
    expect(queryExec).toHaveBeenCalledTimes(2)
    expect(queryExec.mock.calls.every(([, params]) => params?.[5] === 'structured_cause_confirmation')).toBe(true)
    expect(queryExec.mock.calls[0]?.[0]).toContain('on conflict (company_id, task_id, source_type) do update')
  })

  it('defers completed tasks whose actual-date facts are not yet collectable without burning retry budget', async () => {
    const store = createStore([
      queueItem({ id: 'queue-1', taskId: 'task-1', actorId: null, attemptCount: 0, maxAttempts: 3 }),
    ])

    const result = await reconcileDurationExperienceSamples({ projectIds: ['project-1'] }, {
      store,
      collectSample: async () => false,
    })

    expect(result.deferred).toBe(1)
    expect(store.markDeferred).toHaveBeenCalledWith('queue-1', expect.objectContaining({
      reason: 'completed_task_duration_facts_not_collectable',
    }))
    expect(store.markFailed).not.toHaveBeenCalled()
  })

  it('retries transient failures and dead-letters items that exhaust their configured budget', async () => {
    const store = createStore([
      queueItem({ id: 'retry', taskId: 'task-1', actorId: null, attemptCount: 1, maxAttempts: 3 }),
      queueItem({ id: 'dead', taskId: 'task-2', actorId: null, attemptCount: 2, maxAttempts: 3 }),
    ])

    const result = await reconcileDurationExperienceSamples({ projectIds: ['project-1'], maxAttempts: 3 }, {
      store,
      collectSample: async () => { throw new Error('database unavailable') },
    })

    expect(result.retrying).toBe(1)
    expect(result.deadLettered).toBe(1)
    expect(store.markFailed).toHaveBeenNthCalledWith(1, 'retry', expect.objectContaining({
      attemptCount: 2,
      deadLetter: false,
    }))
    expect(store.markFailed).toHaveBeenNthCalledWith(2, 'dead', expect.objectContaining({
      attemptCount: 3,
      deadLetter: true,
    }))
  })

  it('keeps task completion non-blocking while recording collection failures for reconciliation', () => {
    const servicePath = resolve(process.cwd(), 'src/services/taskWriteChainService.ts')
    const source = readFileSync(servicePath, 'utf8')

    expect(source).toContain('enqueueDurationExperienceCollectionFailure')
    expect(source).toContain("trigger: 'task_completion'")
    expect(source).toContain('Failed to enqueue duration experience sample reconciliation')
  })

  it('reopens legacy queue rows with a null retry timestamp instead of leaving them permanently invisible', () => {
    const servicePath = resolve(process.cwd(), 'src/services/durationExperienceReconciliationService.ts')
    const source = readFileSync(servicePath, 'utf8')

    expect(source).toContain('least(coalesce(duration_experience_collection_queue.next_attempt_at, now()), now())')
  })

  it('claims due queue items atomically so concurrent workers cannot collect the same sample', () => {
    const servicePath = resolve(process.cwd(), 'src/services/durationExperienceReconciliationService.ts')
    const source = readFileSync(servicePath, 'utf8')

    expect(source).toContain('for update skip locked')
    expect(source).toContain("next_attempt_at = now() + interval '15 minutes'")
    expect(source).toContain("coalesce(t.status, '') in (U&'\\\\5DF2\\\\5B8C\\\\6210', U&'\\\\5DF2\\\\5173\\\\95ED')")
    expect(source).toContain('q.source_type')
    expect(source).toContain("'structured_cause_confirmation'")
  })

  it('uses the duration-day domain helper for retry and deferred day offsets', () => {
    const servicePath = resolve(process.cwd(), 'src/services/durationExperienceReconciliationService.ts')
    const source = readFileSync(servicePath, 'utf8')

    expect(source).toContain("import { calendarDaysToMilliseconds } from '../utils/durationDays.js'")
    expect(source.match(/calendarDaysToMilliseconds\(1\)/g)).toHaveLength(2)
    expect(source).not.toMatch(/24\s*\*\s*60\s*\*\s*60\s*\*\s*1000/)
  })
})
