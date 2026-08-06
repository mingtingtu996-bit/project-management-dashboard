import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => {
  const queries: Array<{ sql: string; params: unknown[]; queryTimeout?: number }> = []
  const currentTaskRow = {
    id: 'task-1',
    project_id: 'project-1',
    title: 'before',
    progress: 10,
    status: 'in_progress',
    version: 3,
    task_code: 'WB-T001',
    task_code_version: 'v1',
    task_code_rule_id: 'rule-1',
    standard_task_metadata: {},
    building_object_id: 'building-1',
    actual_end_date: null,
  } as Record<string, unknown>
  const client = {
    query: vi.fn(async (sqlOrConfig: string | { text?: string; values?: unknown[]; query_timeout?: number }, params: unknown[] = []) => {
      const sql = typeof sqlOrConfig === 'string' ? sqlOrConfig : String(sqlOrConfig.text ?? '')
      const queryParams = typeof sqlOrConfig === 'string'
        ? params
        : Array.isArray(sqlOrConfig.values) ? sqlOrConfig.values : []
      const queryTimeout = typeof sqlOrConfig === 'string' ? undefined : sqlOrConfig.query_timeout
      queries.push({ sql, params: queryParams, queryTimeout })
      const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase()
      if (['begin', 'commit', 'rollback'].includes(normalized)) return { rows: [], rowCount: 0 }
      if (normalized.startsWith('select * from tasks')) {
        if (normalized.includes('where id = any')) {
          const ids = Array.isArray(params[0]) ? params[0] as string[] : []
          return {
            rows: ids.map((id, index) => ({
              id,
              project_id: 'project-1',
              title: index === 0 ? 'batch root' : 'batch child',
              task_code: `PRJ001-BLD1-WORK-${String(index + 1).padStart(3, '0')}`,
              standard_task_metadata: { taskStructureGovernance: { taskCodeFinalized: true } },
            })),
            rowCount: ids.length,
          }
        }
        return {
          rows: [{ ...currentTaskRow }],
          rowCount: 1,
        }
      }
      if (normalized.startsWith('select project_code from projects')) {
        return { rows: [{ project_code: 'PRJ001' }], rowCount: 1 }
      }
      if (normalized.startsWith('select id, object_code from engineering_objects')) {
        return { rows: [{ id: 'building-1', object_code: 'BLD1' }], rowCount: 1 }
      }
      if (normalized.startsWith('insert into task_code_sequences')) return { rows: [], rowCount: 1 }
      if (normalized.startsWith('select sequence_key, current_value from task_code_sequences')) {
        const keys = Array.isArray(params[2]) ? params[2] as string[] : []
        return { rows: keys.map((sequence_key) => ({ sequence_key, current_value: 0 })), rowCount: keys.length }
      }
      if (normalized.startsWith('select current_value from task_code_sequences')) return { rows: [{ current_value: 0 }], rowCount: 1 }
      if (normalized.startsWith('update task_code_sequences')) return { rows: [], rowCount: 1 }
      if (normalized.startsWith('insert into task_code_history')) return { rows: [], rowCount: 1 }
      if (normalized.startsWith('insert into tasks')) return { rows: [], rowCount: 2 }
      if (normalized.startsWith('update tasks set')) return { rows: [], rowCount: 1 }
      return { rows: [], rowCount: 0 }
    }),
    release: vi.fn(),
  }
  const recordChangedExecutionFacts = vi.fn(async (
    _input: Record<string, unknown>,
    dependencies: { queryExec?: (sql: string, params?: unknown[]) => Promise<unknown[]> },
  ) => {
    await dependencies.queryExec?.('SELECT execution_fact_writer_marker', [])
    return []
  })
  const buildChangedExecutionFactInputs = vi.fn((input: Record<string, any>) => (
    (input.changes ?? []).map((change: Record<string, unknown>) => ({
      projectId: input.projectId,
      entityType: input.entityType,
      entityId: input.entityId,
      factType: change.factType,
      value: change.nextValue,
      effectiveAt: change.effectiveAt ?? input.observedAt,
      observedAt: input.observedAt,
      sourceModule: input.sourceModule,
      sourceEventId: `${input.sourceMutationId}:${change.factType}`,
      actorUserId: input.actorUserId ?? null,
      evidenceRefs: change.evidenceRefs ?? [],
      confidence: change.confidence ?? 1,
      idempotencyKey: `${input.sourceMutationId}:${change.factType}`,
    }))
  ))
  const recordInitialExecutionFactsBatch = vi.fn(async (
    _inputs: Array<Record<string, unknown>>,
    dependencies: { queryExec?: (sql: string, params?: unknown[]) => Promise<unknown[]> },
  ) => {
    await dependencies.queryExec?.('SELECT execution_fact_batch_writer_marker', [])
    return []
  })
  return {
    client,
    queries,
    getClient: vi.fn(async () => client),
    invalidateTaskReadCache: vi.fn(),
    recordLineageInTransaction: vi.fn(),
    createLineageBatchInTransaction: vi.fn(async () => ({ batchId: 'lineage-batch-1', linkCount: 0 })),
    shouldRegenerateTaskCode: vi.fn(() => false),
    buildChangedExecutionFactInputs,
    recordChangedExecutionFacts,
    recordInitialExecutionFactsBatch,
    currentTaskRow,
  }
})

vi.mock('../database.js', () => ({
  getClient: state.getClient,
}))

vi.mock('../services/dbService.js', () => ({
  invalidateTaskReadCache: state.invalidateTaskReadCache,
}))

vi.mock('../services/taskCodeGenerationService.js', () => ({
  ensureProjectCodeInTransaction: vi.fn(async () => 'PRJ001'),
  generateTaskCodeInTransaction: vi.fn(async () => 'WB-T001'),
  buildSequenceKey: vi.fn((input: Record<string, unknown>, ruleId: string) => [
    `project=${input.projectId}`,
    `rule=${ruleId}`,
    `building=${input.buildingObjectId ?? ''}`,
    `work=${input.standardWorkCode ?? input.engineeringCategoryId ?? ''}`,
  ].join('|')),
  shouldRegenerateTaskCode: state.shouldRegenerateTaskCode,
}))

vi.mock('../services/taskCodeRuleService.js', () => ({
  bootstrapTaskCodeRuleInTransaction: vi.fn(async () => ({
    id: 'rule-1',
    rule_version: 'v1',
    delimiter: '-',
    sequence_length: 3,
    include_project: true,
    include_phase: false,
    include_section: false,
    include_building: true,
    include_floor: false,
    include_zone: false,
    include_work_code: true,
  })),
}))

vi.mock('../services/engineeringObjectService.js', () => ({
  hasAnyScopeObjectId: vi.fn(() => true),
}))

vi.mock('../services/dataLineageService.js', () => ({
  recordLineageInTransaction: state.recordLineageInTransaction,
  createLineageBatchInTransaction: state.createLineageBatchInTransaction,
}))

vi.mock('../services/wbsTaskStructureGovernancePipelineService.js', () => ({
  mergeWbsTaskStructureGovernanceMetadata: vi.fn((_existing, patch) => patch),
}))

vi.mock('../services/executionFactGovernanceService.js', () => ({
  buildChangedExecutionFactInputs: state.buildChangedExecutionFactInputs,
  recordChangedExecutionFacts: state.recordChangedExecutionFacts,
  recordInitialExecutionFactsBatch: state.recordInitialExecutionFactsBatch,
}))

describe('task code transaction optimistic locking', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.queries.splice(0, state.queries.length)
    state.client.query.mockClear()
    state.client.release.mockClear()
    state.getClient.mockResolvedValue(state.client)
    state.recordLineageInTransaction.mockClear()
    state.createLineageBatchInTransaction.mockClear()
    state.createLineageBatchInTransaction.mockResolvedValue({ batchId: 'lineage-batch-1', linkCount: 0 })
    state.shouldRegenerateTaskCode.mockReturnValue(false)
    state.buildChangedExecutionFactInputs.mockClear()
    state.recordChangedExecutionFacts.mockImplementation(async (
      _input: Record<string, unknown>,
      dependencies: { queryExec?: (sql: string, params?: unknown[]) => Promise<unknown[]> },
    ) => {
      await dependencies.queryExec?.('SELECT execution_fact_writer_marker', [])
      return []
    })
    state.recordInitialExecutionFactsBatch.mockImplementation(async (
      _inputs: Array<Record<string, unknown>>,
      dependencies: { queryExec?: (sql: string, params?: unknown[]) => Promise<unknown[]> },
    ) => {
      await dependencies.queryExec?.('SELECT execution_fact_batch_writer_marker', [])
      return []
    })
    Object.assign(state.currentTaskRow, {
      id: 'task-1',
      project_id: 'project-1',
      title: 'before',
      progress: 10,
      status: 'in_progress',
      version: 3,
      task_code: 'WB-T001',
      task_code_version: 'v1',
      task_code_rule_id: 'rule-1',
      standard_task_metadata: {},
      building_object_id: 'building-1',
      actual_start_date: null,
      actual_end_date: null,
      first_progress_at: null,
    })
  })

  it('uses the expected task version in the transactional update and increments the stored version', async () => {
    const { updateTaskWithCodeInTransaction } = await import('../services/taskCodeTransactionService.js')

    await updateTaskWithCodeInTransaction(
      'task-1',
      { title: 'after' },
      3,
      'user-1',
      'project-1',
    )

    const update = state.queries.find((entry) => entry.sql.replace(/\s+/g, ' ').trim().toLowerCase().startsWith('update tasks set'))
    expect(update?.sql).toMatch(/version\s*=\s*version\s*\+\s*1/i)
    expect(update?.sql).toMatch(/where\s+id\s*=\s*\$\d+\s+and\s+project_id\s*=\s*\$\d+\s+and\s+version\s*=\s*\$\d+/i)
    expect(update?.params).toContain(3)
    expect(state.queries).not.toContainEqual(expect.objectContaining({
      sql: "SELECT set_config('workbuddy.task_finalization_outbox_mode', 'canonical_inline', TRUE)",
    }))
  })

  it('rejects stale expected versions before applying task changes', async () => {
    const { updateTaskWithCodeInTransaction } = await import('../services/taskCodeTransactionService.js')

    await expect(updateTaskWithCodeInTransaction(
      'task-1',
      { title: 'stale' },
      2,
      'user-1',
      'project-1',
    )).rejects.toMatchObject({
      message: expect.stringContaining('VERSION_MISMATCH'),
      statusCode: 409,
      code: 'VERSION_MISMATCH',
    })

    expect(state.queries.some((entry) => entry.sql.replace(/\s+/g, ' ').trim().toLowerCase().startsWith('update tasks set'))).toBe(false)
    expect(state.queries.map((entry) => entry.sql)).toContain('ROLLBACK')
  })

  it('writes task field changes to change_logs inside the same transaction', async () => {
    const { updateTaskWithCodeInTransaction } = await import('../services/taskCodeTransactionService.js')

    await updateTaskWithCodeInTransaction(
      'task-1',
      { title: 'after', progress: 20 },
      3,
      'user-1',
      'project-1',
    )

    const changeLogInserts = state.queries.filter((entry) => /insert\s+into\s+change_logs/i.test(entry.sql))
    expect(changeLogInserts).toHaveLength(2)
    expect(changeLogInserts.map((entry) => entry.params)).toEqual(expect.arrayContaining([
      expect.arrayContaining(['project-1', 'task', 'task-1', 'title', 'before', 'after', 'user-1']),
      expect.arrayContaining(['project-1', 'task', 'task-1', 'progress', 10, 20, 'user-1']),
    ]))
    expect(changeLogInserts.every((entry) => entry.sql.includes('task_update'))).toBe(true)
  })

  it('records changed task execution facts through the same client before commit', async () => {
    const { updateTaskWithCodeInTransaction } = await import('../services/taskCodeTransactionService.js')

    await updateTaskWithCodeInTransaction(
      'task-1',
      { progress: 20, actual_start_date: '2026-06-01' },
      3,
      'user-1',
      'project-1',
    )

    expect(state.recordChangedExecutionFacts).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: 'project-1',
        entityType: 'task',
        entityId: 'task-1',
        sourceModule: 'taskCodeTransactionService',
        sourceMutationId: 'task:task-1:version:4',
        actorUserId: 'user-1',
        changes: expect.arrayContaining([
          expect.objectContaining({
            factType: 'task.actual_start_date',
            previousValue: null,
            nextValue: '2026-06-01',
            effectiveAt: '2026-06-01T00:00:00.000Z',
          }),
          expect.objectContaining({
            factType: 'task.progress',
            previousValue: 10,
            nextValue: 20,
          }),
        ]),
      }),
      expect.objectContaining({
        queryExec: expect.any(Function),
        isTransactionActive: expect.any(Function),
      }),
    )
    const sql = state.queries.map((entry) => entry.sql)
    expect(sql.indexOf('SELECT execution_fact_writer_marker')).toBeGreaterThan(sql.indexOf('BEGIN'))
    expect(sql.indexOf('SELECT execution_fact_writer_marker')).toBeLessThan(sql.indexOf('COMMIT'))
  })

  it('rolls back the task projection when execution fact persistence fails', async () => {
    const { updateTaskWithCodeInTransaction } = await import('../services/taskCodeTransactionService.js')
    state.recordChangedExecutionFacts.mockRejectedValueOnce(new Error('execution fact persistence failed'))

    await expect(updateTaskWithCodeInTransaction(
      'task-1',
      { progress: 20 },
      3,
      'user-1',
      'project-1',
    )).rejects.toThrow('execution fact persistence failed')

    expect(state.queries.map((entry) => entry.sql)).toContain('ROLLBACK')
    expect(state.queries.map((entry) => entry.sql)).not.toContain('COMMIT')
    expect(state.invalidateTaskReadCache).not.toHaveBeenCalled()
  })

  it('passes an actual-time correction reason to changed execution facts', async () => {
    const { updateTaskWithCodeInTransaction } = await import('../services/taskCodeTransactionService.js')

    await updateTaskWithCodeInTransaction(
      'task-1',
      { actual_end_date: '2026-06-03' },
      3,
      'user-1',
      'project-1',
      { correctionReason: 'Verified against signed site record' },
    )

    expect(state.recordChangedExecutionFacts).toHaveBeenCalledWith(
      expect.objectContaining({
        correctionReason: 'Verified against signed site record',
      }),
      expect.anything(),
    )
  })

  it('rejects invalid progress before writing through the transaction service', async () => {
    const { updateTaskWithCodeInTransaction } = await import('../services/taskCodeTransactionService.js')

    await expect(updateTaskWithCodeInTransaction(
      'task-1',
      { progress: 150 },
      3,
      'user-1',
      'project-1',
    )).rejects.toMatchObject({
      statusCode: 400,
      code: 'TASK_PROGRESS_OUT_OF_RANGE',
    })

    expect(state.queries.some((entry) => entry.sql.replace(/\s+/g, ' ').trim().toLowerCase().startsWith('update tasks set'))).toBe(false)
  })

  it('persists governed actual execution fact columns during task creation', async () => {
    const { createTaskWithCodeInTransaction } = await import('../services/taskCodeTransactionService.js')

    await createTaskWithCodeInTransaction({
      project_id: 'project-1',
      title: 'completed from modeling',
      progress: 100,
      status: 'completed',
      building_object_id: 'building-1',
      actual_start_date: '2026-06-01',
      actual_end_date: '2026-06-03',
      first_progress_at: '2026-06-01T08:00:00.000Z',
    } as any, 'user-1')

    const insert = state.queries.find((entry) => /insert\s+into\s+tasks/i.test(entry.sql))
    expect(insert?.sql).toContain('actual_start_date')
    expect(insert?.sql).toContain('actual_end_date')
    expect(insert?.sql).toContain('first_progress_at')
    expect(insert?.params).toEqual(expect.arrayContaining([
      '2026-06-01',
      '2026-06-03',
      '2026-06-01T08:00:00.000Z',
    ]))
  })

  it('records five forced initial execution facts before committing a created task', async () => {
    const { createTaskWithCodeInTransaction } = await import('../services/taskCodeTransactionService.js')

    await createTaskWithCodeInTransaction({
      id: 'task-created',
      project_id: 'project-1',
      title: 'initial governed facts',
      building_object_id: 'building-1',
    } as any, 'user-1')

    expect(state.recordChangedExecutionFacts).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: 'project-1',
        entityType: 'task',
        entityId: 'task-created',
        sourceMutationId: 'task:task-created:version:1',
        changes: expect.arrayContaining([
          expect.objectContaining({ factType: 'task.actual_start_date', nextValue: null, force: true }),
          expect.objectContaining({ factType: 'task.actual_end_date', nextValue: null, force: true }),
          expect.objectContaining({ factType: 'task.first_progress_at', nextValue: null, force: true }),
          expect.objectContaining({ factType: 'task.progress', nextValue: 0, force: true }),
          expect.objectContaining({ factType: 'task.status', nextValue: 'todo', force: true }),
        ]),
      }),
      expect.anything(),
    )
    const sql = state.queries.map((entry) => entry.sql)
    expect(sql.indexOf('SELECT execution_fact_writer_marker')).toBeLessThan(sql.indexOf('COMMIT'))
  })

  it('rejects implicit reopen writes on completed tasks inside the transactional update path', async () => {
    const { updateTaskWithCodeInTransaction } = await import('../services/taskCodeTransactionService.js')
    Object.assign(state.currentTaskRow, {
      progress: 100,
      status: 'completed',
      actual_end_date: '2026-06-05',
    })

    await expect(updateTaskWithCodeInTransaction(
      'task-1',
      { progress: 80 },
      3,
      'user-1',
      'project-1',
    )).rejects.toMatchObject({
      code: 'TASK_REOPEN_REQUIRED',
      statusCode: 422,
    })

    expect(state.queries.some((entry) => /update\s+tasks\s+set/i.test(entry.sql))).toBe(false)
  })

  it('rejects invalid progress before creating a task through the transaction service', async () => {
    const { createTaskWithCodeInTransaction } = await import('../services/taskCodeTransactionService.js')

    await expect(createTaskWithCodeInTransaction({
      project_id: 'project-1',
      title: 'bad progress',
      progress: -1,
      building_object_id: 'building-1',
    } as any, 'user-1')).rejects.toMatchObject({
      statusCode: 400,
      code: 'TASK_PROGRESS_OUT_OF_RANGE',
    })

    expect(state.queries.some((entry) => entry.sql.replace(/\s+/g, ' ').trim().toLowerCase().startsWith('insert into tasks'))).toBe(false)
  })

  it('creates wizard batch tasks in one transaction with cached rule and contiguous task codes', async () => {
    const { createTasksWithCodeInWizardBatchTransaction } = await import('../services/taskCodeTransactionService.js')

    const result = await createTasksWithCodeInWizardBatchTransaction([
      {
        id: 'batch-task-1',
        project_id: 'project-1',
        title: 'batch root',
        progress: 0,
        building_object_id: 'building-1',
        standard_work_code: 'WORK',
        wbs_node_type: 'division',
        wbs_code: '1',
        wbs_path: '/batch-task-1',
      } as any,
      {
        id: 'batch-task-2',
        project_id: 'project-1',
        title: 'batch child',
        progress: 0,
        parent_id: 'batch-task-1',
        building_object_id: 'building-1',
        standard_work_code: 'WORK',
        wbs_node_type: 'process',
        wbs_code: '1.1',
        wbs_path: '/batch-task-1/batch-task-2',
      } as any,
    ], 'user-1')

    expect(result.map((entry) => entry.task.id)).toEqual(['batch-task-1', 'batch-task-2'])
    expect(state.queries.filter((entry) => entry.sql === 'BEGIN')).toHaveLength(1)
    expect(state.queries.filter((entry) => entry.sql === 'COMMIT')).toHaveLength(1)
    expect(state.queries.filter((entry) => /insert\s+into\s+tasks/i.test(entry.sql))).toHaveLength(1)
    expect(state.queries.filter((entry) => /select\s+sequence_key,\s*current_value\s+from\s+task_code_sequences/i.test(entry.sql))).toHaveLength(1)
    const sequenceUpdate = state.queries.find((entry) => /update\s+task_code_sequences/i.test(entry.sql))
    expect(sequenceUpdate?.params[1]).toEqual([2])
    const historyInsert = state.queries.find((entry) => /insert\s+into\s+task_code_history/i.test(entry.sql))
    expect(historyInsert?.sql).toMatch(
      /VALUES\s*\(\$\d+::uuid,\s*\$\d+::uuid,\s*\$\d+::uuid,\s*\$\d+::text,\s*\$\d+::text,\s*\$\d+::text,\s*\$\d+::uuid,\s*\$\d+::timestamptz,\s*\$\d+::jsonb\)/i,
    )
  })

  it('records all forced initial wizard facts through one batch before the single commit', async () => {
    const { createTasksWithCodeInWizardBatchTransaction } = await import('../services/taskCodeTransactionService.js')

    await createTasksWithCodeInWizardBatchTransaction([
      {
        id: 'batch-task-1', project_id: 'project-1', title: 'batch root', progress: 0,
        status: 'todo', building_object_id: 'building-1', standard_work_code: 'WORK',
      } as any,
      {
        id: 'batch-task-2', project_id: 'project-1', title: 'batch child', progress: 0,
        status: 'todo', building_object_id: 'building-1', standard_work_code: 'WORK',
      } as any,
    ], 'user-1')

    expect(state.recordChangedExecutionFacts).not.toHaveBeenCalled()
    expect(state.recordInitialExecutionFactsBatch).toHaveBeenCalledTimes(1)
    const facts = state.recordInitialExecutionFactsBatch.mock.calls[0]?.[0] ?? []
    expect(facts).toHaveLength(10)
    for (const taskId of ['batch-task-1', 'batch-task-2']) {
      expect(facts.filter((fact: Record<string, unknown>) => fact.entityId === taskId)).toEqual(expect.arrayContaining([
        expect.objectContaining({ factType: 'task.actual_start_date' }),
        expect.objectContaining({ factType: 'task.actual_end_date' }),
        expect.objectContaining({ factType: 'task.first_progress_at' }),
        expect.objectContaining({ factType: 'task.progress' }),
        expect.objectContaining({ factType: 'task.status' }),
      ]))
    }
    expect(state.queries.filter((entry) => entry.sql === 'COMMIT')).toHaveLength(1)
    const sql = state.queries.map((entry) => entry.sql)
    expect(sql.indexOf('SELECT execution_fact_batch_writer_marker')).toBeLessThan(sql.indexOf('COMMIT'))
  })

  it('records reopen execution facts atomically before commit', async () => {
    const { reopenTaskWithCodeInTransaction } = await import('../services/taskCodeTransactionService.js')
    Object.assign(state.currentTaskRow, {
      progress: 100,
      status: 'completed',
      actual_end_date: '2026-06-05',
    })

    await reopenTaskWithCodeInTransaction('task-1', 80, 3, 'user-1', 'project-1')

    expect(state.recordChangedExecutionFacts).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceMutationId: 'task:task-1:version:4',
        changes: expect.arrayContaining([
          expect.objectContaining({ factType: 'task.progress', previousValue: 100, nextValue: 80 }),
          expect.objectContaining({ factType: 'task.status', previousValue: 'completed', nextValue: 'in_progress' }),
          expect.objectContaining({ factType: 'task.actual_end_date', previousValue: '2026-06-05', nextValue: null }),
        ]),
      }),
      expect.anything(),
    )
    const sql = state.queries.map((entry) => entry.sql)
    expect(sql.indexOf('SELECT execution_fact_writer_marker')).toBeLessThan(sql.indexOf('COMMIT'))
    expect(state.queries).not.toContainEqual(expect.objectContaining({
      sql: "SELECT set_config('workbuddy.task_finalization_outbox_mode', 'canonical_inline', TRUE)",
    }))
  })

  it('reserves multiple wizard task code sequence keys with one lock query and one update query', async () => {
    const { createTasksWithCodeInWizardBatchTransaction } = await import('../services/taskCodeTransactionService.js')

    await createTasksWithCodeInWizardBatchTransaction([
      {
        id: 'batch-task-1',
        project_id: 'project-1',
        title: 'batch root',
        progress: 0,
        building_object_id: 'building-1',
        standard_work_code: 'WORK-A',
        wbs_node_type: 'division',
        wbs_code: '1',
        wbs_path: '/batch-task-1',
      } as any,
      {
        id: 'batch-task-2',
        project_id: 'project-1',
        title: 'batch sibling',
        progress: 0,
        building_object_id: 'building-1',
        standard_work_code: 'WORK-B',
        wbs_node_type: 'process',
        wbs_code: '2',
        wbs_path: '/batch-task-2',
      } as any,
    ], 'user-1')

    expect(state.queries.filter((entry) => /insert\s+into\s+task_code_sequences/i.test(entry.sql))).toHaveLength(1)
    expect(state.queries.filter((entry) => /select\s+sequence_key,\s*current_value\s+from\s+task_code_sequences/i.test(entry.sql))).toHaveLength(1)
    expect(state.queries.filter((entry) => /update\s+task_code_sequences/i.test(entry.sql))).toHaveLength(1)
    const lockQuery = state.queries.find((entry) => /select\s+sequence_key,\s*current_value\s+from\s+task_code_sequences/i.test(entry.sql))
    expect(lockQuery?.params[2]).toHaveLength(2)
  })

  it('chunks large wizard batch task and history inserts while reserving sequences once', async () => {
    const { createTasksWithCodeInWizardBatchTransaction } = await import('../services/taskCodeTransactionService.js')

    const inputs = Array.from({ length: 450 }, (_, index) => ({
      id: `batch-task-${index + 1}`,
      project_id: 'project-1',
      title: `batch task ${index + 1}`,
      progress: 0,
      building_object_id: 'building-1',
      standard_work_code: 'WORK',
      wbs_node_type: 'process',
      wbs_code: `${index + 1}`,
      wbs_path: `/batch-task-${index + 1}`,
    } as any))

    const result = await createTasksWithCodeInWizardBatchTransaction(inputs, 'user-1')

    expect(result).toHaveLength(450)
    const taskInserts = state.queries.filter((entry) => /insert\s+into\s+tasks\s*\(/i.test(entry.sql))
    const historyInserts = state.queries.filter((entry) => /insert\s+into\s+task_code_history/i.test(entry.sql))
    expect(taskInserts.length).toBeGreaterThan(1)
    expect(historyInserts.length).toBeGreaterThan(1)
    expect(Math.max(...taskInserts.map((entry) => entry.params.length))).toBeLessThanOrEqual(275)
    expect(taskInserts.every((entry) => Number(entry.queryTimeout ?? 0) > 4_000)).toBe(true)
    expect(state.queries.some((entry) => /set\s+local\s+statement_timeout/i.test(entry.sql))).toBe(true)
    expect(Math.max(...historyInserts.map((entry) => entry.params.length))).toBeLessThanOrEqual(225)
    expect(state.queries.filter((entry) => /select\s+sequence_key,\s*current_value\s+from\s+task_code_sequences/i.test(entry.sql))).toHaveLength(1)
    expect(state.queries.filter((entry) => /update\s+task_code_sequences/i.test(entry.sql))).toHaveLength(1)
  })

  it('records wizard template lineage through one transaction batch', async () => {
    const { createTasksWithCodeInWizardBatchTransaction } = await import('../services/taskCodeTransactionService.js')

    await createTasksWithCodeInWizardBatchTransaction([
      {
        id: 'batch-task-1',
        project_id: 'project-1',
        title: 'batch root',
        progress: 0,
        building_object_id: 'building-1',
        standard_work_code: 'WORK',
        wbs_node_type: 'division',
        wbs_code: '1',
        wbs_path: '/batch-task-1',
        template_id: 'template-1',
        template_node_id: 'node-1',
      } as any,
      {
        id: 'batch-task-2',
        project_id: 'project-1',
        title: 'batch child',
        progress: 0,
        building_object_id: 'building-1',
        standard_work_code: 'WORK',
        wbs_node_type: 'process',
        wbs_code: '1.1',
        wbs_path: '/batch-task-1/batch-task-2',
        template_id: 'template-1',
        template_node_id: 'node-2',
      } as any,
    ], 'user-1')

    expect(state.recordLineageInTransaction).not.toHaveBeenCalled()
    expect(state.createLineageBatchInTransaction).toHaveBeenCalledTimes(1)
    expect(state.createLineageBatchInTransaction).toHaveBeenCalledWith(
      expect.anything(),
      'project-1',
      'wizard_task_generation',
      expect.arrayContaining([
        expect.objectContaining({
          sourceEntityType: 'wbs_template_node',
          sourceEntityId: 'node-1',
          relationType: 'generates',
          targetEntityType: 'task',
          targetEntityId: 'batch-task-1',
          metadata: expect.objectContaining({ templateId: 'template-1', wizardBatch: true }),
        }),
        expect.objectContaining({
          sourceEntityType: 'wbs_template_node',
          sourceEntityId: 'node-2',
          targetEntityId: 'batch-task-2',
        }),
      ]),
      'user-1',
    )
  })
})
