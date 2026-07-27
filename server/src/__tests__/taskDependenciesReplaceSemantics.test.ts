import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getClient: vi.fn(),
  supabaseFrom: vi.fn(),
  evaluateTaskConstraint: vi.fn(),
  recordLineageInTransaction: vi.fn(),
  createLineageBatchInTransaction: vi.fn(),
  clearCriticalPathCache: vi.fn(),
  clearProjectCriticalPathSnapshotCache: vi.fn(),
  isDatabaseTransactionActive: vi.fn(),
  registerDatabasePostCommitEffect: vi.fn(),
}))

vi.mock('../database.js', () => ({
  getClient: mocks.getClient,
  isDatabaseTransactionActive: mocks.isDatabaseTransactionActive,
  registerDatabasePostCommitEffect: mocks.registerDatabasePostCommitEffect,
}))

vi.mock('../services/dbService.js', () => ({
  supabase: {
    from: mocks.supabaseFrom,
  },
}))

vi.mock('../services/taskConstraintGovernanceService.js', () => ({
  evaluateTaskConstraint: mocks.evaluateTaskConstraint,
}))

vi.mock('../services/dataLineageService.js', () => ({
  createLineageBatchInTransaction: mocks.createLineageBatchInTransaction,
  recordLineageInTransaction: mocks.recordLineageInTransaction,
}))

vi.mock('../services/criticalPathHelpers.js', () => ({
  clearCriticalPathCache: mocks.clearCriticalPathCache,
}))

vi.mock('../services/projectCriticalPathService.js', () => ({
  clearProjectCriticalPathSnapshotCache: mocks.clearProjectCriticalPathSnapshotCache,
}))

function mockTaskLookup(projectId = 'project-1') {
  const projectEq = vi.fn(() => ({
    maybeSingle: vi.fn(async () => ({ data: { project_id: projectId }, error: null })),
  }))
  mocks.supabaseFrom.mockImplementation((table: string) => {
    if (table !== 'tasks') {
      throw new Error(`unexpected table ${table}`)
    }
    return {
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: projectEq,
          maybeSingle: vi.fn(async () => ({ data: { project_id: projectId }, error: null })),
        })),
      })),
    }
  })
  return { projectEq }
}

function makeClient(activeRows: Array<Record<string, unknown>>) {
  const queries: Array<{ sql: string; params?: unknown[] }> = []
  const client = {
    query: vi.fn(async (sql: string, params?: unknown[]) => {
      queries.push({ sql, params })
      if (sql.includes('SELECT id, dependency_task_id, source_type')) {
        return { rows: activeRows, rowCount: activeRows.length }
      }
      return { rows: [], rowCount: 1 }
    }),
    release: vi.fn(),
  }
  return { client, queries }
}

describe('task dependency replacement semantics', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.isDatabaseTransactionActive.mockReturnValue(false)
    mocks.registerDatabasePostCommitEffect.mockImplementation(async (_label: string, effect: () => Promise<void>) => effect())
    mockTaskLookup()
    mocks.evaluateTaskConstraint.mockResolvedValue(undefined)
  })

  it('clears active dependency rows when a user route explicitly replaces with an empty list', async () => {
    const { client, queries } = makeClient([
      { id: 'dependency-1', dependency_task_id: 'predecessor-1', source_type: 'manual' },
    ])
    mocks.getClient.mockResolvedValue(client)
    const { replaceTaskDependencies } = await import('../services/taskStandardModelService.js')

    const { projectEq } = mockTaskLookup()
    const result = await replaceTaskDependencies('task-1', [], {
      projectId: 'project-1',
      preserveCurrentTaskFacts: false,
    } as any)

    expect(result).toEqual([])
    expect(projectEq).toHaveBeenCalledWith('project_id', 'project-1')
    expect(queries.some((entry) => (
      entry.sql.includes("UPDATE task_dependencies SET status = 'inactive'")
        && entry.params?.[0] === 'task-1'
        && entry.params?.[1] === 'project-1'
    ))).toBe(true)
    expect(queries.some((entry) => entry.sql.includes('UPDATE data_lineage_links'))).toBe(true)
    expect(mocks.clearCriticalPathCache).toHaveBeenCalledWith('project-1')
    expect(mocks.clearProjectCriticalPathSnapshotCache).toHaveBeenCalledWith('project-1')
    expect(mocks.evaluateTaskConstraint).toHaveBeenCalledWith('task-1', {
      projectId: 'project-1',
      sourceEventType: 'task_dependencies_replaced',
    })
    expect(client.release).toHaveBeenCalled()
  })

  it('keeps non-explicit generated writes in preserve mode by default', async () => {
    const { queries } = makeClient([
      { id: 'dependency-1', dependency_task_id: 'predecessor-1', source_type: 'template_generated' },
    ])
    mocks.getClient.mockResolvedValue({ query: vi.fn(async (sql: string, params?: unknown[]) => {
      queries.push({ sql, params })
      if (sql.includes('SELECT id, dependency_task_id, source_type')) {
        return { rows: [{ id: 'dependency-1', dependency_task_id: 'predecessor-1', source_type: 'template_generated' }], rowCount: 1 }
      }
      return { rows: [], rowCount: 1 }
    }), release: vi.fn() })
    const { replaceTaskDependencies } = await import('../services/taskStandardModelService.js')

    await replaceTaskDependencies('task-1', [], { projectId: 'project-1' } as any)

    expect(queries.some((entry) => entry.sql.includes("UPDATE task_dependencies SET status = 'inactive'"))).toBe(false)
  })

  it('validates dependency tasks through the active transaction instead of Supabase REST', async () => {
    mocks.isDatabaseTransactionActive.mockReturnValue(true)
    mocks.supabaseFrom.mockImplementation(() => {
      throw new Error('Supabase REST must not run inside the commit transaction')
    })
    const { client, queries } = makeClient([])
    client.query.mockImplementation(async (sql: string, params?: unknown[]) => {
      queries.push({ sql, params })
      if (sql.includes('SELECT project_id FROM tasks WHERE id = $1')) {
        return { rows: [{ project_id: 'project-1' }], rowCount: 1 }
      }
      if (sql.includes('SELECT id, project_id FROM tasks WHERE project_id = $1 AND id = ANY')) {
        return { rows: [{ id: 'predecessor-1', project_id: 'project-1' }], rowCount: 1 }
      }
      if (sql.includes('SELECT dependency_task_id FROM task_dependencies')) {
        return { rows: [], rowCount: 0 }
      }
      if (sql.includes('SELECT id, dependency_task_id, source_type')) {
        return { rows: [], rowCount: 0 }
      }
      if (sql.includes('SELECT * FROM task_dependencies')) {
        return { rows: [{ id: 'dependency-1', dependency_task_id: 'predecessor-1' }], rowCount: 1 }
      }
      return { rows: [], rowCount: 1 }
    })
    mocks.getClient.mockResolvedValue(client)
    const { replaceTaskDependencies } = await import('../services/taskStandardModelService.js')

    await expect(replaceTaskDependencies('task-1', [{
      dependencyTaskId: 'predecessor-1',
      dependencyType: 'FS',
      lagDays: 0,
      sourceType: 'manual',
    }], { projectId: 'project-1' } as any)).resolves.toBeDefined()

    expect(queries.some((entry) => (
      entry.sql.includes('SELECT project_id FROM tasks')
      && entry.sql.includes('project_id = $2')
      && entry.params?.[1] === 'project-1'
    ))).toBe(true)
  })

  it('persists accepted target-compression provenance without normalizing it to manual', async () => {
    mocks.isDatabaseTransactionActive.mockReturnValue(true)
    const { client, queries } = makeClient([])
    client.query.mockImplementation(async (sql: string, params?: unknown[]) => {
      queries.push({ sql, params })
      if (sql.includes('SELECT project_id FROM tasks WHERE id = $1')) {
        return { rows: [{ project_id: 'project-1' }], rowCount: 1 }
      }
      if (sql.includes('SELECT id, project_id FROM tasks WHERE project_id = $1 AND id = ANY')) {
        return { rows: [{ id: 'predecessor-1', project_id: 'project-1' }], rowCount: 1 }
      }
      if (sql.includes('SELECT dependency_task_id FROM task_dependencies')) return { rows: [], rowCount: 0 }
      if (sql.includes('SELECT id, dependency_task_id, source_type')) return { rows: [], rowCount: 0 }
      if (sql.includes('SELECT * FROM task_dependencies')) {
        return { rows: [{ id: 'dependency-1', dependency_task_id: 'predecessor-1' }], rowCount: 1 }
      }
      return { rows: [], rowCount: 1 }
    })
    mocks.getClient.mockResolvedValue(client)
    const { replaceTaskDependencies } = await import('../services/taskStandardModelService.js')

    await replaceTaskDependencies('task-1', [{
      dependencyTaskId: 'predecessor-1',
      dependencyType: 'SS',
      lagDays: 1,
      sourceType: 'target_end_compression',
      metadata: { source: 'target_end_compression' },
    }], { projectId: 'project-1', preserveCurrentTaskFacts: false })

    const insert = queries.find((entry) => entry.sql.includes('INSERT INTO task_dependencies'))
    expect(insert?.params?.[7]).toBe('target_end_compression')
    expect(insert?.params?.[8]).toEqual(expect.objectContaining({ source: 'target_end_compression' }))
  })
})
