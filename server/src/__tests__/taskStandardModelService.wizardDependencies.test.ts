import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => {
  const client = {
    query: vi.fn(async (sql: string, params: unknown[] = []) => ({
      rows: [],
      rowCount: String(sql).includes('INSERT INTO task_dependencies')
        ? Array.isArray(params) ? params.length / 8 : 0
        : 0,
    })),
    release: vi.fn(),
  }

  const taskIn = vi.fn(async (_column: string, taskIds: string[]) => ({
    data: taskIds.map((id) => ({ id, project_id: 'project-1' })),
    error: null,
  }))
  const taskProjectEq = vi.fn(() => ({ in: taskIn }))
  const taskSelect = vi.fn(() => ({ eq: taskProjectEq, in: taskIn }))

  const dependencySecondEq = vi.fn(async () => ({ data: [], error: null }))
  const dependencyFirstEq = vi.fn(() => ({ eq: dependencySecondEq }))
  const dependencySelect = vi.fn(() => ({ eq: dependencyFirstEq }))

  const from = vi.fn((table: string) => {
    if (table === 'tasks') return { select: taskSelect }
    if (table === 'task_dependencies') return { select: dependencySelect }
    throw new Error(`unexpected table: ${table}`)
  })

  return {
    client,
    getClient: vi.fn(async () => client),
    createLineageBatchInTransaction: vi.fn(async () => ({ batchId: 'lineage-batch-1', linkCount: 2 })),
    supabase: { from },
    from,
    taskIn,
    taskProjectEq,
    dependencySecondEq,
  }
})

vi.mock('../database.js', () => ({
  getClient: state.getClient,
}))

vi.mock('../services/dbService.js', () => ({
  supabase: state.supabase,
}))

vi.mock('../services/dataLineageService.js', () => ({
  createLineageBatchInTransaction: state.createLineageBatchInTransaction,
  recordLineageInTransaction: vi.fn(),
}))

vi.mock('../services/taskConstraintGovernanceService.js', () => ({
  evaluateTaskConstraint: vi.fn(),
}))

const { replaceWizardGeneratedTaskDependenciesBatch } = await import('../services/taskStandardModelService.js')

describe('taskStandardModelService wizard dependency batch', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.client.query.mockClear()
    state.client.release.mockClear()
  })

  it('writes wizard-generated task dependencies in one batch with one lineage batch', async () => {
    const rows = await replaceWizardGeneratedTaskDependenciesBatch({
      projectId: 'project-1',
      actorId: 'user-1',
      dependencies: [
        {
          taskId: 'task-2',
          dependencyTaskId: 'task-1',
          dependencyType: 'FS',
          sourceType: 'template_internal_flow',
        },
        {
          taskId: 'task-3',
          dependencyTaskId: 'task-2',
          dependencyType: 'SS',
          lagDays: 1,
          sourceType: 'template_cross_item_workflow',
        },
      ],
    })

    expect(rows).toHaveLength(2)
    expect(state.taskProjectEq).toHaveBeenCalledWith('project_id', 'project-1')
    expect(state.taskIn).toHaveBeenCalledTimes(1)
    expect(state.taskIn).toHaveBeenCalledWith('id', ['task-2', 'task-1', 'task-3'])
    expect(state.dependencySecondEq).toHaveBeenCalledWith('status', 'active')

    const insertCalls = state.client.query.mock.calls.filter(([sql]) => String(sql).includes('INSERT INTO task_dependencies'))
    expect(insertCalls).toHaveLength(1)
    expect(insertCalls[0][1]).toHaveLength(16)
    expect(String(insertCalls[0][0])).not.toContain('ON CONFLICT DO NOTHING')

    expect(state.createLineageBatchInTransaction).toHaveBeenCalledTimes(1)
    expect(state.createLineageBatchInTransaction).toHaveBeenCalledWith(
      state.client,
      'project-1',
      'wizard_task_dependency_generation',
      expect.arrayContaining([
        expect.objectContaining({
          sourceEntityType: 'task_dependency',
          relationType: 'depends_on',
          targetEntityType: 'task',
          targetEntityId: 'task-1',
          metadata: expect.objectContaining({ taskId: 'task-2', wizardBatch: true }),
        }),
      ]),
      'user-1',
    )
    expect(state.client.query.mock.calls.map(([sql]) => String(sql).trim())).toEqual(expect.arrayContaining([
      'BEGIN',
      'COMMIT',
    ]))
    expect(state.client.release).toHaveBeenCalledTimes(1)
  })

  it('deduplicates wizard dependencies by active unique key while keeping the higher-priority source', async () => {
    const rows = await replaceWizardGeneratedTaskDependenciesBatch({
      projectId: 'project-1',
      actorId: 'user-1',
      dependencies: [
        {
          taskId: 'task-2',
          dependencyTaskId: 'task-1',
          dependencyType: 'FS',
          lagDays: 0,
          sourceType: 'template_cross_item_workflow',
        },
        {
          taskId: 'task-2',
          dependencyTaskId: 'task-1',
          dependencyType: 'FS',
          lagDays: 0,
          sourceType: 'template_internal_flow',
        },
      ],
    })

    expect(rows).toHaveLength(1)
    const insertCalls = state.client.query.mock.calls.filter(([sql]) => String(sql).includes('INSERT INTO task_dependencies'))
    expect(insertCalls).toHaveLength(1)
    expect(insertCalls[0][1]).toHaveLength(8)
    expect(insertCalls[0][1]).toEqual(expect.arrayContaining(['template_internal_flow']))
    expect(insertCalls[0][1]).not.toEqual(expect.arrayContaining(['template_cross_item_workflow']))
  })

  it('rejects a cycle before opening a write transaction', async () => {
    await expect(replaceWizardGeneratedTaskDependenciesBatch({
      projectId: 'project-1',
      dependencies: [
        { taskId: 'task-2', dependencyTaskId: 'task-1', sourceType: 'template_internal_flow' },
        { taskId: 'task-1', dependencyTaskId: 'task-2', sourceType: 'template_internal_flow' },
      ],
    })).rejects.toMatchObject({ code: 'TASK_DEPENDENCY_CYCLE' })

    expect(state.getClient).not.toHaveBeenCalled()
  })
})
