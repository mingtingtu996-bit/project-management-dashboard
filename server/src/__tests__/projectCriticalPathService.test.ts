import { beforeEach, describe, expect, it, vi } from 'vitest'

type Row = Record<string, any>

const mocks = vi.hoisted(() => {
  const tables: Record<string, Row[]> = {
    tasks: [
      {
        id: 'task-a',
        project_id: 'project-1',
        title: 'A',
        start_date: '2026-04-01',
        end_date: '2026-04-03',
        planned_end_date: '2026-04-03',
        dependencies: [],
        is_critical: true,
      },
      {
        id: 'task-b',
        project_id: 'project-1',
        title: 'B',
        start_date: '2026-04-01',
        end_date: '2026-04-08',
        planned_end_date: '2026-04-08',
        dependencies: [],
        is_critical: false,
      },
      {
        id: 'task-c',
        project_id: 'project-1',
        title: 'C',
        start_date: '2026-04-04',
        end_date: '2026-04-06',
        planned_end_date: '2026-04-06',
        dependencies: ['task-a'],
        is_critical: false,
      },
    ],
    task_critical_overrides: [],
  }

  const executeSQL = vi.fn(async (query: string, params: any[] = []) => {
    const sql = query.toLowerCase()

    if (sql.startsWith('select') && sql.includes('from tasks')) {
      const projectId = params[0]
      return tables.tasks.filter((row) => row.project_id === projectId).map((row) => ({ ...row }))
    }

    if (sql.startsWith('select') && sql.includes('from task_critical_overrides')) {
      const projectId = params[0]
      return tables.task_critical_overrides
        .filter((row) => row.project_id === projectId)
        .map((row) => ({ ...row }))
    }

    if (sql.startsWith('delete from task_critical_overrides') && sql.includes('where id = ? and project_id = ?')) {
      const [overrideId, projectId] = params
      tables.task_critical_overrides = tables.task_critical_overrides.filter(
        (row) => !(row.id === overrideId && row.project_id === projectId),
      )
      return []
    }

    if (sql.startsWith('delete from task_critical_overrides') && sql.includes('where project_id = ? and task_id = ? and mode = ?')) {
      const [projectId, taskId, mode] = params
      tables.task_critical_overrides = tables.task_critical_overrides.filter(
        (row) => !(row.project_id === projectId && row.task_id === taskId && row.mode === mode),
      )
      return []
    }

    if (sql.startsWith('insert into task_critical_overrides')) {
      const [id, projectId, taskId, mode, anchorType, leftTaskId, rightTaskId, reason, createdBy, createdAt, updatedAt] = params
      tables.task_critical_overrides.push({
        id,
        project_id: projectId,
        task_id: taskId,
        mode,
        anchor_type: anchorType,
        left_task_id: leftTaskId,
        right_task_id: rightTaskId,
        reason,
        created_by: createdBy,
        created_at: createdAt,
        updated_at: updatedAt,
      })
      return []
    }

    return []
  })

  return {
    tables,
    executeSQL,
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    },
  }
})

vi.mock('../services/dbService.js', () => ({
  executeSQL: mocks.executeSQL,
}))

vi.mock('../middleware/logger.js', () => ({
  logger: mocks.logger,
  requestLogger: (_req: unknown, _res: unknown, next: () => void) => next(),
}))

const {
  createCriticalPathOverride,
  deleteCriticalPathOverride,
  getProjectCriticalPathSnapshot,
  listCriticalPathOverrides,
  recalculateProjectCriticalPath,
} = await import('../services/projectCriticalPathService.js')

describe('project critical path service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.tables.tasks = [
      {
        id: 'task-a',
        project_id: 'project-1',
        title: 'A',
        start_date: '2026-04-01',
        end_date: '2026-04-03',
        planned_end_date: '2026-04-03',
        dependencies: [],
        is_critical: true,
      },
      {
        id: 'task-b',
        project_id: 'project-1',
        title: 'B',
        start_date: '2026-04-01',
        end_date: '2026-04-08',
        planned_end_date: '2026-04-08',
        dependencies: [],
        is_critical: false,
      },
      {
        id: 'task-c',
        project_id: 'project-1',
        title: 'C',
        start_date: '2026-04-04',
        end_date: '2026-04-06',
        planned_end_date: '2026-04-06',
        dependencies: ['task-a'],
        is_critical: false,
      },
    ]
    mocks.tables.task_critical_overrides = []
  })

  it('recomputes critical tasks from CPM without reading legacy task flags', async () => {
    const result = await recalculateProjectCriticalPath('project-1')

    expect(result.projectId).toBe('project-1')
    expect(result.criticalTaskIds).toEqual(['task-b'])
    expect(result.projectDuration).toBe(8)
    expect(result.snapshot.autoTaskIds).toEqual(['task-b'])
  })

  it('keeps create, delete, and refresh chained to override rows only', async () => {
    const initialSnapshot = await getProjectCriticalPathSnapshot('project-1')
    expect(initialSnapshot.manualAttentionTaskIds).toEqual([])
    expect(initialSnapshot.displayTaskIds).toEqual(['task-b'])
    expect(initialSnapshot.tasks.some((task) => task.taskId === 'task-a')).toBe(false)

    const created = await createCriticalPathOverride('project-1', {
      task_id: 'task-a',
      mode: 'manual_attention',
      reason: '手动关注',
      created_by: 'user-1',
    })

    const refreshedAfterCreate = await recalculateProjectCriticalPath('project-1')
    expect(refreshedAfterCreate.snapshot.manualAttentionTaskIds).toEqual(['task-a'])
    expect(refreshedAfterCreate.snapshot.watchedTaskIds).toEqual(['task-a'])
    expect(refreshedAfterCreate.snapshot.displayTaskIds).toEqual(['task-b'])
    expect(refreshedAfterCreate.snapshot.tasks.some((task) => task.taskId === 'task-a')).toBe(false)

    await deleteCriticalPathOverride('project-1', created.id)

    const refreshedAfterDelete = await recalculateProjectCriticalPath('project-1')
    expect(refreshedAfterDelete.snapshot.manualAttentionTaskIds).toEqual([])
    expect(refreshedAfterDelete.snapshot.displayTaskIds).toEqual(['task-b'])
    expect(refreshedAfterDelete.snapshot.tasks.some((task) => task.taskId === 'task-a')).toBe(false)
  })

  it('builds a unified snapshot from auto and manual override rows', async () => {
    await createCriticalPathOverride('project-1', {
      task_id: 'task-a',
      mode: 'manual_attention',
      reason: '手动关注',
      created_by: 'user-1',
    })

    await createCriticalPathOverride('project-1', {
      task_id: 'task-c',
      mode: 'manual_insert',
      anchor_type: 'after',
      left_task_id: 'task-a',
      reason: '插在 A 后面',
      created_by: 'user-1',
    })

    const snapshot = await getProjectCriticalPathSnapshot('project-1')

    expect(snapshot.projectId).toBe('project-1')
    expect(snapshot.autoTaskIds).toEqual(['task-b'])
    expect(snapshot.manualAttentionTaskIds).toContain('task-a')
    expect(snapshot.manualInsertedTaskIds).toEqual(['task-c'])
    expect(snapshot.primaryChain).not.toBeNull()
    expect(snapshot.watchedTaskIds).toEqual(['task-a'])
    expect(snapshot.displayTaskIds).toEqual(['task-b', 'task-c'])
    expect(snapshot.tasks.some((task) => task.taskId === 'task-a')).toBe(false)
    expect(snapshot.edges.some((edge) => edge.source === 'manual_link')).toBe(true)

    const overrides = await listCriticalPathOverrides('project-1')
    expect(overrides).toHaveLength(2)
    expect(overrides.map((override) => override.mode)).toEqual(['manual_attention', 'manual_insert'])
  })

  it('returns an empty failure snapshot when CPM fails before any successful cache exists', async () => {
    mocks.tables.tasks = [
      {
        id: 'cycle-a',
        project_id: 'project-empty-failure',
        title: 'Cycle A',
        start_date: '2026-04-01',
        end_date: '2026-04-02',
        planned_end_date: '2026-04-02',
        dependencies: ['cycle-b'],
        is_critical: false,
      },
      {
        id: 'cycle-b',
        project_id: 'project-empty-failure',
        title: 'Cycle B',
        start_date: '2026-04-01',
        end_date: '2026-04-02',
        planned_end_date: '2026-04-02',
        dependencies: ['cycle-a'],
        is_critical: false,
      },
    ]

    const snapshot = await getProjectCriticalPathSnapshot('project-empty-failure')

    expect(snapshot.calculationStatus).toBe('empty_after_failure')
    expect(snapshot.displayTaskIds).toEqual([])
    expect(snapshot.tasks).toEqual([])
    expect(snapshot.projectDurationDays).toBe(0)
    expect(snapshot.calculationFailureMessage).toContain('CRITICAL_PATH_CYCLE_DETECTED')
  })

  it('falls back to the last successful snapshot when a later recalculation fails', async () => {
    mocks.tables.tasks = [
      {
        id: 'task-a',
        project_id: 'project-cache-failure',
        title: 'A',
        start_date: '2026-04-01',
        end_date: '2026-04-03',
        planned_end_date: '2026-04-03',
        dependencies: [],
        is_critical: true,
      },
      {
        id: 'task-b',
        project_id: 'project-cache-failure',
        title: 'B',
        start_date: '2026-04-01',
        end_date: '2026-04-08',
        planned_end_date: '2026-04-08',
        dependencies: [],
        is_critical: false,
      },
    ]

    const successSnapshot = await getProjectCriticalPathSnapshot('project-cache-failure')
    expect(successSnapshot.displayTaskIds).toEqual(['task-b'])
    expect(successSnapshot.calculatedAt).toBeTruthy()

    mocks.tables.tasks = [
      {
        id: 'cycle-a',
        project_id: 'project-cache-failure',
        title: 'Cycle A',
        start_date: '2026-04-01',
        end_date: '2026-04-02',
        planned_end_date: '2026-04-02',
        dependencies: ['cycle-b'],
        is_critical: false,
      },
      {
        id: 'cycle-b',
        project_id: 'project-cache-failure',
        title: 'Cycle B',
        start_date: '2026-04-01',
        end_date: '2026-04-02',
        planned_end_date: '2026-04-02',
        dependencies: ['cycle-a'],
        is_critical: false,
      },
    ]

    const failedSnapshot = await getProjectCriticalPathSnapshot('project-cache-failure')

    expect(failedSnapshot.calculationStatus).toBe('cached_after_failure')
    expect(failedSnapshot.displayTaskIds).toEqual(successSnapshot.displayTaskIds)
    expect(failedSnapshot.calculatedAt).toBe(successSnapshot.calculatedAt)
    expect(failedSnapshot.calculationFailureMessage).toContain('CRITICAL_PATH_CYCLE_DETECTED')
  })

  it('rejects manual insert overrides without any anchor', async () => {
    await expect(createCriticalPathOverride('project-1', {
      task_id: 'task-c',
      mode: 'manual_insert',
      reason: 'missing anchors',
    })).rejects.toMatchObject({
      code: 'MANUAL_INSERT_REQUIRES_ANCHOR',
      statusCode: 422,
    })
  })

  it('rejects manual insert overrides without anchor type before hitting the database', async () => {
    await expect(createCriticalPathOverride('project-1', {
      task_id: 'task-c',
      mode: 'manual_insert',
      left_task_id: 'task-a',
      reason: 'missing anchor type',
    })).rejects.toMatchObject({
      code: 'MANUAL_INSERT_REQUIRES_ANCHOR_TYPE',
      statusCode: 422,
    })
  })

  it('prefers the chain with more level-one milestones when durations are tied', async () => {
    mocks.tables.tasks = [
      {
        id: 'task-a',
        project_id: 'project-1',
        title: 'A',
        start_date: '2026-04-01',
        end_date: '2026-04-02',
        planned_end_date: '2026-04-02',
        dependencies: [],
        is_milestone: true,
        milestone_level: 1,
      },
      {
        id: 'task-c',
        project_id: 'project-1',
        title: 'C',
        start_date: '2026-04-03',
        end_date: '2026-04-06',
        planned_end_date: '2026-04-06',
        dependencies: ['task-a'],
      },
      {
        id: 'task-b',
        project_id: 'project-1',
        title: 'B',
        start_date: '2026-04-01',
        end_date: '2026-04-05',
        planned_end_date: '2026-04-05',
        dependencies: [],
      },
    ]

    const snapshot = await getProjectCriticalPathSnapshot('project-1')

    expect(snapshot.primaryChain?.taskIds).toEqual(['task-a', 'task-c'])
    expect(snapshot.alternateChains[0]?.taskIds).toEqual(['task-b'])
    expect(snapshot.autoTaskIds).toEqual(['task-a', 'task-c', 'task-b'])
  })

  it('ranks auto parallel chains before manual inserts and breaks ties by latest finish date', async () => {
    mocks.tables.tasks = [
      {
        id: 'task-a',
        project_id: 'project-1',
        title: 'A',
        start_date: '2026-04-01',
        end_date: '2026-04-02',
        planned_end_date: '2026-04-02',
        dependencies: [],
      },
      {
        id: 'task-c',
        project_id: 'project-1',
        title: 'C',
        start_date: '2026-04-03',
        end_date: '2026-04-07',
        planned_end_date: '2026-04-07',
        dependencies: ['task-a'],
      },
      {
        id: 'task-b',
        project_id: 'project-1',
        title: 'B',
        start_date: '2026-04-03',
        end_date: '2026-04-08',
        planned_end_date: '2026-04-08',
        dependencies: [],
      },
      {
        id: 'task-d',
        project_id: 'project-1',
        title: 'D',
        start_date: '2026-04-04',
        end_date: '2026-04-04',
        planned_end_date: '2026-04-04',
        dependencies: [],
      },
    ]

    await createCriticalPathOverride('project-1', {
      task_id: 'task-d',
      mode: 'manual_insert',
      anchor_type: 'after',
      left_task_id: 'task-b',
      reason: '插在 B 后面',
      created_by: 'user-1',
    })

    const snapshot = await getProjectCriticalPathSnapshot('project-1')

    expect(snapshot.primaryChain?.taskIds).toEqual(['task-b'])
    expect(snapshot.alternateChains.map((chain) => ({ source: chain.source, taskIds: chain.taskIds }))).toEqual([
      { source: 'auto', taskIds: ['task-a', 'task-c'] },
      { source: 'manual_insert', taskIds: ['task-b', 'task-d'] },
    ])
  })
})
