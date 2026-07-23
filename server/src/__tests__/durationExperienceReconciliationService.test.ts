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

const generationTokenA = '2026-07-23 08:00:00.000001+00'
const generationTokenB = '2026-07-23 08:00:00.000002+00'

function queueItem(input: {
  id: string
  taskId: string
  actorId: string | null
  attemptCount: number
  maxAttempts: number
  sourceType?: 'task_completion' | 'structured_cause_confirmation'
  trigger?: string
  generationToken?: string
}): DurationExperienceReconciliationQueueItem {
  return {
    ...input,
    companyId: 'company-1',
    projectId: 'project-1',
    trigger: input.trigger ?? 'task_completion',
    sourceType: input.sourceType ?? 'task_completion',
    generationToken: input.generationToken ?? generationTokenA,
    task: {
      id: input.taskId,
      project_id: 'project-1',
      status: 'completed',
    } as DurationExperienceReconciliationQueueItem['task'],
  }
}

function createStore(items: DurationExperienceReconciliationQueueItem[] = []) {
  return {
    enqueue: vi.fn(async (record) => ({ id: 'queue-1', generationToken: generationTokenA, ...record })),
    registerMissingCompletedTasks: vi.fn(async () => 1),
    listDue: vi.fn(async (): Promise<DurationExperienceReconciliationQueueItem[]> => items),
    markCompleted: vi.fn(async () => true),
    markDeferred: vi.fn(async () => true),
    markFailed: vi.fn(async () => true),
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
    expect(store.markCompleted).toHaveBeenCalledWith('queue-confirmation-1', {
      generationToken: generationTokenA,
      expectedStatus: 'retrying',
    })
  })

  it('upserts repeated structured-cause confirmations to one durable task/source row', async () => {
    let generationIndex = 0
    const queryExec = vi.fn(async (_sql: string, params: unknown[] = []) => ({
      rows: [{
        id: 'queue-confirmation-1', source_type: params[5],
        generation_token: generationIndex++ === 0 ? generationTokenA : generationTokenB,
      }],
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
        { id: 'queue-confirmation-1', generationToken: generationTokenA },
        { id: 'queue-confirmation-1', generationToken: generationTokenB },
      ])
    expect(queryExec).toHaveBeenCalledTimes(2)
    expect(queryExec.mock.calls.every(([, params]) => params?.[5] === 'structured_cause_confirmation')).toBe(true)
    expect(queryExec.mock.calls[0]?.[0]).toContain('on conflict (company_id, task_id, source_type) do update')
  })

  it('rearms every structured-cause generation while preserving task-completion dead letters', async () => {
    const queryExec = vi.fn(async (_sql: string, _params: unknown[] = []) => ({
      rows: [{ id: 'queue-confirmation-1', generation_token: generationTokenB }],
      rowCount: 1,
    }))
    const store = createDatabaseDurationExperienceReconciliationStore(queryExec)

    const queued = await store.enqueue({
      companyId: 'company-1', projectId: 'project-1', taskId: 'task-1', actorId: 'user-1',
      trigger: 'structured_cause_user_confirmation', sourceType: 'structured_cause_confirmation',
      lastError: null, maxAttempts: 7,
    })

    expect(queued).toEqual(expect.objectContaining({
      id: 'queue-confirmation-1', generationToken: generationTokenB,
    }))
    const sql = String(queryExec.mock.calls[0]?.[0]).replace(/\s+/g, ' ').toLowerCase()
    expect(sql).toContain("when excluded.source_type = 'structured_cause_confirmation' then 'pending'")
    expect(sql).toContain("when duration_experience_collection_queue.status = 'dead_letter' then 'dead_letter'")
    expect(sql).toContain("attempt_count = case when excluded.source_type = 'structured_cause_confirmation' then 0")
    expect(sql).toContain("max_attempts = case when excluded.source_type = 'structured_cause_confirmation' then excluded.max_attempts")
    expect(sql).toContain("last_error = case when excluded.source_type = 'structured_cause_confirmation' then null")
    expect(sql).toContain("completed_at = case when excluded.source_type = 'structured_cause_confirmation' then null")
    expect(sql).toContain("dead_lettered_at = case when excluded.source_type = 'structured_cause_confirmation' then null")
    expect(sql).toMatch(/greatest\(\s*clock_timestamp\(\),\s*duration_experience_collection_queue\.updated_at \+ interval '1 microsecond'\s*\)/)
    expect(sql).toContain('updated_at::text as generation_token')
    expect(queryExec.mock.calls[0]?.[1]?.[6]).toBe(7)
  })

  it('prevents stale completion from consuming a newer enqueue generation', async () => {
    const queryExec = vi.fn()
      .mockResolvedValueOnce({ rows: [{ id: 'queue-1', generation_token: generationTokenA }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ id: 'queue-1', generation_token: generationTokenB }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [{ id: 'queue-1' }], rowCount: 1 })
    const store = createDatabaseDurationExperienceReconciliationStore(queryExec)
    const record = {
      companyId: 'company-1', projectId: 'project-1', taskId: 'task-1', actorId: 'user-1',
      trigger: 'structured_cause_user_confirmation', sourceType: 'structured_cause_confirmation' as const,
      lastError: null, maxAttempts: 5,
    }

    const generationA = await store.enqueue(record) as Record<string, unknown>
    const generationB = await store.enqueue(record) as Record<string, unknown>
    const staleApplied = await (store.markCompleted as any)('queue-1', {
      generationToken: generationA.generationToken,
      expectedStatus: 'pending',
    })
    const currentApplied = await (store.markCompleted as any)('queue-1', {
      generationToken: generationB.generationToken,
      expectedStatus: 'pending',
    })

    expect(staleApplied).toBe(false)
    expect(currentApplied).toBe(true)
    for (const call of queryExec.mock.calls.slice(2)) {
      const sql = String(call[0]).replace(/\s+/g, ' ').toLowerCase()
      expect(sql).toContain('updated_at = $2::timestamptz')
      expect(sql).toContain('status = $3')
      expect(sql).toContain('returning id')
    }
    expect(queryExec.mock.calls[2]?.[1]).toEqual(['queue-1', generationTokenA, 'pending'])
    expect(queryExec.mock.calls[3]?.[1]).toEqual(['queue-1', generationTokenB, 'pending'])
  })

  it('makes stale defer and failure transitions no-ops after a newer generation exists', async () => {
    const queryExec = vi.fn()
      .mockResolvedValueOnce({ rows: [{ id: 'queue-1', generation_token: generationTokenA }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ id: 'queue-1', generation_token: generationTokenB }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
    const store = createDatabaseDurationExperienceReconciliationStore(queryExec)
    const record = {
      companyId: 'company-1', projectId: 'project-1', taskId: 'task-1', actorId: 'user-1',
      trigger: 'structured_cause_user_confirmation', sourceType: 'structured_cause_confirmation' as const,
      lastError: null, maxAttempts: 5,
    }
    const generationA = await store.enqueue(record) as Record<string, unknown>
    await store.enqueue(record)

    await expect((store.markDeferred as any)('queue-1', {
      generationToken: generationA.generationToken,
      expectedStatus: 'retrying',
      reason: 'facts unavailable',
      nextAttemptAt: '2026-07-24T00:00:00.000Z',
    })).resolves.toBe(false)
    await expect((store.markFailed as any)('queue-1', {
      generationToken: generationA.generationToken,
      expectedStatus: 'retrying',
      error: 'rebuild failed', attemptCount: 2, deadLetter: false,
      nextAttemptAt: '2026-07-23T08:05:00.000Z',
    })).resolves.toBe(false)
    expect(queryExec.mock.calls[2]?.[1]?.slice(0, 3)).toEqual(['queue-1', generationTokenA, 'retrying'])
    expect(queryExec.mock.calls[3]?.[1]?.slice(0, 3)).toEqual(['queue-1', generationTokenA, 'retrying'])
  })

  it('maps the exact PostgreSQL claim token without converting away microseconds', async () => {
    const queryExec = vi.fn(async (_sql: string, _params: unknown[] = []) => ({
      rows: [{
        id: 'queue-1', company_id: 'company-1', project_id: 'project-1', task_id: 'task-1',
        actor_id: 'user-1', trigger: 'structured_cause_user_confirmation',
        source_type: 'structured_cause_confirmation', generation_token: generationTokenB,
        attempt_count: 0, max_attempts: 5,
        task: { id: 'task-1', project_id: 'project-1', status: 'completed' },
      }],
      rowCount: 1,
    }))
    const store = createDatabaseDurationExperienceReconciliationStore(queryExec)

    await expect(store.listDue({ projectIds: ['project-1'], limit: 1 })).resolves.toEqual([
      expect.objectContaining({ id: 'queue-1', generationToken: generationTokenB }),
    ])
    const sql = String(queryExec.mock.calls[0]?.[0]).replace(/\s+/g, ' ').toLowerCase()
    expect(sql).toContain("greatest(clock_timestamp(), q.updated_at + interval '1 microsecond')")
    expect(sql).toContain('q.updated_at::text as generation_token')
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
      generationToken: generationTokenA,
      expectedStatus: 'retrying',
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
      generationToken: generationTokenA,
      expectedStatus: 'retrying',
      attemptCount: 2,
      deadLetter: false,
    }))
    expect(store.markFailed).toHaveBeenNthCalledWith(2, 'dead', expect.objectContaining({
      generationToken: generationTokenA,
      expectedStatus: 'retrying',
      attemptCount: 3,
      deadLetter: true,
    }))
  })

  it('does not report stale claimed transitions as recovery, defer, retry, or dead letter', async () => {
    const store = createStore([
      queueItem({ id: 'success', taskId: 'success', actorId: null, attemptCount: 0, maxAttempts: 3 }),
      queueItem({ id: 'defer', taskId: 'defer', actorId: null, attemptCount: 0, maxAttempts: 3 }),
      queueItem({ id: 'retry', taskId: 'retry', actorId: null, attemptCount: 0, maxAttempts: 3 }),
      queueItem({ id: 'dead', taskId: 'dead', actorId: null, attemptCount: 0, maxAttempts: 1 }),
    ])
    store.registerMissingCompletedTasks.mockResolvedValue(0)
    store.markCompleted.mockResolvedValue(false)
    store.markDeferred.mockResolvedValue(false)
    store.markFailed.mockResolvedValue(false)

    const result = await reconcileDurationExperienceSamples({ projectIds: ['project-1'] }, {
      store,
      collectSample: async (task) => {
        if (task.id === 'defer') return false
        if (task.id === 'retry' || task.id === 'dead') throw new Error('stale worker failure')
        return true
      },
    })

    expect(result).toEqual({
      discovered: 0, scanned: 4, recovered: 0, deferred: 0, retrying: 0, deadLettered: 0,
    })
    expect(store.markCompleted).toHaveBeenCalledWith('success', {
      generationToken: generationTokenA, expectedStatus: 'retrying',
    })
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
    expect(source).toContain("GREATEST(clock_timestamp(), q.updated_at + interval '1 microsecond')")
    expect(source).toContain('q.updated_at::text AS generation_token')
  })

  it('uses the duration-day domain helper for retry and deferred day offsets', () => {
    const servicePath = resolve(process.cwd(), 'src/services/durationExperienceReconciliationService.ts')
    const source = readFileSync(servicePath, 'utf8')

    expect(source).toContain("import { calendarDaysToMilliseconds } from '../utils/durationDays.js'")
    expect(source.match(/calendarDaysToMilliseconds\(1\)/g)).toHaveLength(2)
    expect(source).not.toMatch(/24\s*\*\s*60\s*\*\s*60\s*\*\s*1000/)
  })
})
