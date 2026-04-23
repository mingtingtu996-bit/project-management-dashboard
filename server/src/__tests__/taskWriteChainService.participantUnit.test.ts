import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => {
  const participantUnitRow = {
    id: 'unit-1',
    unit_name: '责任单位',
    project_id: 'project-1',
  }

  const taskUpdateEq = vi.fn(async () => ({ error: null }))
  const taskUpdate = vi.fn(() => ({ eq: taskUpdateEq }))
  const participantUnitSingle = vi.fn(async () => ({ data: participantUnitRow, error: null }))
  const participantUnitEq = vi.fn(() => ({ single: participantUnitSingle }))
  const participantUnitSelect = vi.fn(() => ({ eq: participantUnitEq }))
  const from = vi.fn((table: string) => {
    if (table === 'participant_units') {
      return { select: participantUnitSelect }
    }
    if (table === 'tasks') {
      return { update: taskUpdate }
    }
    throw new Error(`unexpected table: ${table}`)
  })

  return {
    createTask: vi.fn(async () => ({
      id: 'task-1',
      project_id: 'project-1',
      title: '带责任单位的任务',
      status: 'in_progress',
      progress: 20,
      is_milestone: false,
    })),
    executeSQL: vi.fn(async () => []),
    getMembers: vi.fn(async () => []),
    getTask: vi.fn(async () => null),
    recordTaskProgressSnapshot: vi.fn(async () => undefined),
    reopenTask: vi.fn(async () => null),
    updateTask: vi.fn(async () => null),
    databaseQuery: vi.fn(async () => ({ rows: [], rowCount: 0 })),
    supabase: { from },
    from,
    participantUnitSelect,
    participantUnitEq,
    participantUnitSingle,
    taskUpdate,
    taskUpdateEq,
  }
})

vi.mock('../middleware/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}))

vi.mock('../services/systemAnomalyService.js', () => ({
  SystemAnomalyService: class {
    enqueuePassiveReorderDetection = vi.fn(async () => undefined)
  },
}))

vi.mock('../services/warningService.js', () => ({
  WarningService: class {},
}))

vi.mock('../services/warningChainService.js', () => ({
  persistNotification: vi.fn(async () => null),
}))

vi.mock('../services/dbService.js', () => ({
  createTask: state.createTask,
  executeSQL: state.executeSQL,
  getMembers: state.getMembers,
  getTask: state.getTask,
  recordTaskProgressSnapshot: state.recordTaskProgressSnapshot,
  reopenTask: state.reopenTask,
  supabase: state.supabase,
  updateTask: state.updateTask,
}))

vi.mock('../database.js', () => ({
  query: state.databaseQuery,
}))

describe('taskWriteChainService participant unit lookup', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('creates tasks with participant_unit_id without using unsupported OR SQL filters', async () => {
    const { createTaskInMainChain } = await import('../services/taskWriteChainService.js')

    const result = await createTaskInMainChain({
      project_id: 'project-1',
      title: '带责任单位的任务',
      status: 'in_progress',
      priority: 'medium',
      progress: 20,
      participant_unit_id: 'unit-1',
      responsible_unit: '责任单位',
    }, 'user-1')

    expect(result?.participantUnit).toEqual({
      id: 'unit-1',
      unit_name: '责任单位',
    })
    expect(state.executeSQL).not.toHaveBeenCalled()
    expect(state.from).toHaveBeenCalledWith('participant_units')
    expect(state.from).toHaveBeenCalledWith('tasks')
    expect(state.taskUpdate).toHaveBeenCalledWith({
      participant_unit_id: 'unit-1',
      updated_by: 'user-1',
    })
    expect(state.taskUpdateEq).toHaveBeenCalledWith('id', 'task-1')
  })
})
