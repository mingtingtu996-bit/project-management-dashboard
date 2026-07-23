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
  rebuildDurationExperienceSampleForTask,
} = await import('../services/durationExperienceReconciliationService.js')
const { recordUserConfirmedStructuredCauseAttribution } = await import('../services/structuredCauseAttributionService.js')

const generationTokenA = '2026-07-23 08:00:00.000001+00'
const generationTokenB = '2026-07-23 08:00:00.000002+00'

function deferred<T = void>() {
  let resolvePromise!: (value: T | PromiseLike<T>) => void
  let rejectPromise!: (reason?: unknown) => void
  const promise = new Promise<T>((resolve, reject) => {
    resolvePromise = resolve
    rejectPromise = reject
  })
  return { promise, resolve: resolvePromise, reject: rejectPromise }
}

function createAsyncMutex() {
  let locked = false
  const waiters: Array<() => void> = []
  return {
    async acquire() {
      if (locked) {
        await new Promise<void>((resolve) => waiters.push(resolve))
      } else {
        locked = true
      }
      let released = false
      return () => {
        if (released) return
        released = true
        const next = waiters.shift()
        if (next) next()
        else locked = false
      }
    },
  }
}

function createTaskTransactionHarness(input: {
  label: string
  mutex: ReturnType<typeof createAsyncMutex>
  task: () => Record<string, unknown>
  onTaskLockAttempt?: () => void
  onTaskLockAcquired?: () => void
  query?: (sql: string, params: unknown[]) => Promise<{ rows: unknown[]; rowCount: number }> | { rows: unknown[]; rowCount: number }
}) {
  const events: string[] = []
  let releases: Array<() => void> | null = null
  const withTransaction = async <T>(work: () => Promise<T>): Promise<T> => {
    if (releases) throw new Error(`${input.label} nested transaction is not supported by this harness`)
    releases = []
    events.push(`${input.label}:begin`)
    try {
      const result = await work()
      events.push(`${input.label}:commit`)
      return result
    } catch (error) {
      events.push(`${input.label}:rollback`)
      throw error
    } finally {
      const heldReleases = releases
      releases = null
      for (const release of heldReleases.reverse()) release()
      events.push(`${input.label}:release`)
    }
  }
  const queryExec = async (sql: string, params: unknown[] = []) => {
    const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase()
    if (normalized.includes('from public.tasks') && normalized.includes('for update')) {
      if (!releases) throw new Error(`${input.label} task lock was attempted outside a transaction`)
      input.onTaskLockAttempt?.()
      const release = await input.mutex.acquire()
      releases.push(release)
      input.onTaskLockAcquired?.()
    }
    if (normalized.includes('from public.tasks')) {
      return { rows: [input.task()], rowCount: 1 }
    }
    if (input.query) return input.query(sql, params)
    return { rows: [], rowCount: 0 }
  }
  return { events, queryExec, withTransaction }
}

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

function taskLockDependencies(items: DurationExperienceReconciliationQueueItem[]) {
  const tasks = new Map(items.map((item) => [item.taskId, item.task]))
  return {
    withTransaction: async <T>(work: () => Promise<T>) => work(),
    queryExec: async (_sql: string, params: unknown[] = []) => ({
      rows: tasks.has(String(params[0])) ? [tasks.get(String(params[0]))] : [],
      rowCount: tasks.has(String(params[0])) ? 1 : 0,
    }),
  }
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

  it('serializes a paused rebuild against task-primary confirmation and leaves the final sample at authority B', async () => {
    const mutex = createAsyncMutex()
    const aCollectorStarted = deferred()
    const releaseACollector = deferred()
    const bTaskLockAttempted = deferred()
    let bTaskLockAcquired = false
    let authority = 'A'
    let finalSampleAuthority: string | null = null
    const queueEvents: string[] = []
    const postCommitEffects: Array<() => Promise<void>> = []
    const currentTask = () => ({
      id: 'task-1',
      project_id: 'project-1',
      status: 'completed',
      progress: 100,
      actual_start_date: '2026-07-01',
      actual_end_date: '2026-07-10',
    })
    const aTransaction = createTaskTransactionHarness({
      label: 'A',
      mutex,
      task: currentTask,
    })
    const bConfirmationTransaction = createTaskTransactionHarness({
      label: 'B-confirm',
      mutex,
      task: currentTask,
      onTaskLockAttempt: () => bTaskLockAttempted.resolve(),
      onTaskLockAcquired: () => { bTaskLockAcquired = true },
      query: async (sql) => {
        const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase()
        if (normalized.includes('from public.projects')) {
          return { rows: [{ company_id: 'company-1' }], rowCount: 1 }
        }
        if (normalized.includes('insert into public.structured_cause_attributions')) {
          authority = 'B'
          return {
            rows: [{ id: 'attribution-b', status: 'confirmed', cause_code: 'material_shortage' }],
            rowCount: 1,
          }
        }
        return { rows: [], rowCount: 0 }
      },
    })
    const bRebuildTransaction = createTaskTransactionHarness({
      label: 'B-rebuild',
      mutex,
      task: currentTask,
    })
    const bWithPostCommit = async <T>(work: () => Promise<T>) => {
      const result = await bConfirmationTransaction.withTransaction(work)
      for (const effect of postCommitEffects.splice(0)) await effect()
      return result
    }

    const rebuildA = rebuildDurationExperienceSampleForTask({
      companyId: 'company-1',
      projectId: 'project-1',
      taskId: 'task-1',
      actorId: 'actor-a',
      trigger: 'structured_cause_user_confirmation',
    }, {
      queryExec: aTransaction.queryExec,
      withTransaction: aTransaction.withTransaction,
      collectSample: async () => {
        const capturedAuthority = authority
        aCollectorStarted.resolve()
        await releaseACollector.promise
        finalSampleAuthority = capturedAuthority
        return true
      },
    } as any)

    await aCollectorStarted.promise
    const confirmB = recordUserConfirmedStructuredCauseAttribution({
      companyId: 'company-1',
      projectId: 'project-1',
      subjectType: 'task',
      subjectId: 'task-1',
      eventType: 'completion',
      causeCode: 'material_shortage',
      causeRole: 'primary',
      rawText: 'Authority B confirmed after A began rebuilding.',
      actorId: 'actor-b',
    }, {
      queryExec: bConfirmationTransaction.queryExec,
      withTransaction: bWithPostCommit,
      enqueueDurationExperienceRebuild: async () => {
        queueEvents.push('B:enqueued')
        return { id: 'queue-b', generationToken: generationTokenB }
      },
      completeDurationExperienceRebuild: async () => {
        queueEvents.push('B:completed')
        return true
      },
      registerPostCommitEffect: async (_label, effect) => { postCommitEffects.push(effect) },
      rebuildTaskDurationExperienceSample: (input) => rebuildDurationExperienceSampleForTask(input, {
        queryExec: bRebuildTransaction.queryExec,
        withTransaction: bRebuildTransaction.withTransaction,
        collectSample: async () => {
          finalSampleAuthority = authority
          return true
        },
      } as any),
    })

    await bTaskLockAttempted.promise
    await new Promise((resolve) => setTimeout(resolve, 0))
    const bWasBlockedWhileACollected = !bTaskLockAcquired
    const authorityBeforeASettled = authority
    const queueEventsBeforeASettled = [...queueEvents]
    releaseACollector.resolve()
    await Promise.all([rebuildA, confirmB])

    expect(bWasBlockedWhileACollected).toBe(true)
    expect(authorityBeforeASettled).toBe('A')
    expect(queueEventsBeforeASettled).toEqual([])
    expect(finalSampleAuthority).toBe('B')
    expect(queueEvents).toEqual(['B:enqueued', 'B:completed'])
    expect(aTransaction.events).toEqual(['A:begin', 'A:commit', 'A:release'])
  })

  it('re-reads current task authority under lock for both reconciliation queue sources', async () => {
    const items = [
      queueItem({ id: 'task-completion-queue', taskId: 'task-1', actorId: null, attemptCount: 0, maxAttempts: 3 }),
      queueItem({
        id: 'confirmation-queue', taskId: 'task-2', actorId: 'actor-b', attemptCount: 0, maxAttempts: 3,
        sourceType: 'structured_cause_confirmation', trigger: 'structured_cause_user_confirmation',
      }),
    ]
    ;(items[0].task as any).authority = 'A'
    ;(items[1].task as any).authority = 'A'
    const store = createStore(items)
    store.registerMissingCompletedTasks.mockResolvedValue(0)
    const currentTasks = new Map([
      ['task-1', { ...items[0].task, authority: 'B' }],
      ['task-2', { ...items[1].task, authority: 'B' }],
    ])
    const observedAuthorities: string[] = []
    const queryExec = vi.fn(async (_sql: string, params: unknown[] = []) => ({
      rows: [currentTasks.get(String(params[0]))],
      rowCount: 1,
    }))

    const result = await reconcileDurationExperienceSamples({ projectIds: ['project-1'] }, {
      store,
      withTransaction: async (work) => work(),
      queryExec,
      collectSample: async (task) => {
        observedAuthorities.push(String((task as any).authority))
        return true
      },
    } as any)

    expect(result).toEqual(expect.objectContaining({ scanned: 2, recovered: 2 }))
    expect(observedAuthorities).toEqual(['B', 'B'])
    expect(queryExec).toHaveBeenCalledTimes(2)
    for (const [sql] of queryExec.mock.calls) {
      expect(String(sql).replace(/\s+/g, ' ')).toContain('FOR UPDATE OF task')
    }
    expect(queryExec.mock.calls.map(([, params]) => params)).toEqual([
      ['task-1', 'project-1', 'company-1'],
      ['task-2', 'project-1', 'company-1'],
    ])
  })

  it('keeps a newer enqueue pending when it lands after mutation-lock release and before stale completion', async () => {
    const item = queueItem({
      id: 'queue-1', taskId: 'task-1', actorId: 'actor-a', attemptCount: 0, maxAttempts: 3,
      sourceType: 'structured_cause_confirmation', trigger: 'structured_cause_user_confirmation',
    })
    let currentGeneration = generationTokenA
    let queueStatus: 'retrying' | 'pending' | 'completed' = 'retrying'
    const store = createStore([item])
    store.registerMissingCompletedTasks.mockResolvedValue(0)
    ;(store.markCompleted as any).mockImplementation(async (_id: string, transition: {
      generationToken: string
      expectedStatus: 'pending' | 'retrying'
    }) => {
      if (transition.generationToken !== currentGeneration || transition.expectedStatus !== queueStatus) return false
      queueStatus = 'completed'
      return true
    })

    const result = await reconcileDurationExperienceSamples({ projectIds: ['project-1'] }, {
      store,
      queryExec: async () => ({ rows: [item.task], rowCount: 1 }),
      withTransaction: async (work) => {
        try {
          return await work()
        } finally {
          currentGeneration = generationTokenB
          queueStatus = 'pending'
        }
      },
      collectSample: async () => true,
    } as any)

    expect(result.recovered).toBe(0)
    expect(currentGeneration).toBe(generationTokenB)
    expect(queueStatus).toBe('pending')
    expect(store.markCompleted).toHaveBeenCalledWith('queue-1', {
      generationToken: generationTokenA,
      expectedStatus: 'retrying',
    })
  })

  it('commits and releases the task lock before deferring a non-collectable sample', async () => {
    const item = queueItem({ id: 'queue-1', taskId: 'task-1', actorId: null, attemptCount: 0, maxAttempts: 3 })
    const store = createStore([item])
    const transaction = createTaskTransactionHarness({
      label: 'false-collector',
      mutex: createAsyncMutex(),
      task: () => item.task as unknown as Record<string, unknown>,
    })

    const result = await reconcileDurationExperienceSamples({ projectIds: ['project-1'] }, {
      store,
      queryExec: transaction.queryExec,
      withTransaction: transaction.withTransaction,
      collectSample: async () => false,
    } as any)

    expect(result.deferred).toBe(1)
    expect(transaction.events).toEqual([
      'false-collector:begin',
      'false-collector:commit',
      'false-collector:release',
    ])
    expect(store.markDeferred).toHaveBeenCalledOnce()
  })

  it('rolls back and releases the task lock before preserving retry policy on collector error', async () => {
    const item = queueItem({ id: 'queue-1', taskId: 'task-1', actorId: null, attemptCount: 0, maxAttempts: 3 })
    const store = createStore([item])
    const transaction = createTaskTransactionHarness({
      label: 'throwing-collector',
      mutex: createAsyncMutex(),
      task: () => item.task as unknown as Record<string, unknown>,
    })

    const result = await reconcileDurationExperienceSamples({ projectIds: ['project-1'] }, {
      store,
      queryExec: transaction.queryExec,
      withTransaction: transaction.withTransaction,
      collectSample: async () => { throw new Error('collector failed under lock') },
    } as any)

    expect(result.retrying).toBe(1)
    expect(transaction.events).toEqual([
      'throwing-collector:begin',
      'throwing-collector:rollback',
      'throwing-collector:release',
    ])
    expect(store.markFailed).toHaveBeenCalledWith('queue-1', expect.objectContaining({
      generationToken: generationTokenA,
      expectedStatus: 'retrying',
      attemptCount: 1,
      deadLetter: false,
    }))
  })

  it('defers a stale completed queue item when the locked current task has been reopened', async () => {
    const item = queueItem({ id: 'queue-1', taskId: 'task-1', actorId: null, attemptCount: 0, maxAttempts: 3 })
    const store = createStore([item])
    const reopenedTask = {
      ...item.task,
      status: 'in_progress',
      progress: 60,
      actual_end_date: null,
    }
    let activeSampleWrites = 0

    const result = await reconcileDurationExperienceSamples({ projectIds: ['project-1'] }, {
      store,
      withTransaction: async (work) => work(),
      queryExec: async () => ({ rows: [reopenedTask], rowCount: 1 }),
      collectSample: async (task) => {
        if (task.status === 'completed') {
          activeSampleWrites += 1
          return true
        }
        return false
      },
    } as any)

    expect(result).toEqual(expect.objectContaining({ recovered: 0, deferred: 1 }))
    expect(activeSampleWrites).toBe(0)
    expect(store.markCompleted).not.toHaveBeenCalled()
    expect(store.markDeferred).toHaveBeenCalledOnce()
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
    }, { store, collectSample, ...taskLockDependencies(items) })

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
      ...taskLockDependencies([item]),
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
    const items = [
      queueItem({ id: 'queue-1', taskId: 'task-1', actorId: null, attemptCount: 0, maxAttempts: 3 }),
    ]
    const store = createStore(items)

    const result = await reconcileDurationExperienceSamples({ projectIds: ['project-1'] }, {
      store,
      collectSample: async () => false,
      ...taskLockDependencies(items),
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
    const items = [
      queueItem({ id: 'retry', taskId: 'task-1', actorId: null, attemptCount: 1, maxAttempts: 3 }),
      queueItem({ id: 'dead', taskId: 'task-2', actorId: null, attemptCount: 2, maxAttempts: 3 }),
    ]
    const store = createStore(items)

    const result = await reconcileDurationExperienceSamples({ projectIds: ['project-1'], maxAttempts: 3 }, {
      store,
      collectSample: async () => { throw new Error('database unavailable') },
      ...taskLockDependencies(items),
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
    const items = [
      queueItem({ id: 'success', taskId: 'success', actorId: null, attemptCount: 0, maxAttempts: 3 }),
      queueItem({ id: 'defer', taskId: 'defer', actorId: null, attemptCount: 0, maxAttempts: 3 }),
      queueItem({ id: 'retry', taskId: 'retry', actorId: null, attemptCount: 0, maxAttempts: 3 }),
      queueItem({ id: 'dead', taskId: 'dead', actorId: null, attemptCount: 0, maxAttempts: 1 }),
    ]
    const store = createStore(items)
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
      ...taskLockDependencies(items),
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

  it('keeps every production raw collector call behind the shared task-lock coordinator', () => {
    const reconciliationSource = readFileSync(
      resolve(process.cwd(), 'src/services/durationExperienceReconciliationService.ts'),
      'utf8',
    )
    const taskWriteSource = readFileSync(resolve(process.cwd(), 'src/services/taskWriteChainService.ts'), 'utf8')

    expect(reconciliationSource).toContain('collectDurationExperienceSampleWithTaskLock')
    expect(reconciliationSource).toContain('dependencies.collectSample ?? collectDurationExperienceSampleFromTask')
    expect(reconciliationSource.match(/collectDurationExperienceSampleFromTask\(/g) ?? []).toHaveLength(0)
    expect(taskWriteSource).toContain('collectDurationExperienceSampleWithTaskLock')
    expect(taskWriteSource).not.toContain('collectDurationExperienceSampleFromTask')
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
