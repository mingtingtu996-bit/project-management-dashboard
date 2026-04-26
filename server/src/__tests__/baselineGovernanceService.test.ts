import { beforeEach, describe, expect, it, vi } from 'vitest'

type Row = Record<string, any>

const mocks = vi.hoisted(() => {
  const tables: Record<string, Row[]> = {
    task_baselines: [],
    task_baseline_items: [],
    tasks: [],
    milestones: [],
  }

  const buildQuery = (table: string) => {
    let mode: 'select' | 'update' = 'select'
    let payload: any = null
    const filters: Array<{ kind: 'eq' | 'in'; column: string; value: any }> = []

    const matches = (row: Row) =>
      filters.every((filter) => {
        if (filter.kind === 'eq') return row[filter.column] === filter.value
        return Array.isArray(filter.value) ? filter.value.includes(row[filter.column]) : false
      })

    const builder: any = {
      select: () => builder,
      update: (value: any) => {
        mode = 'update'
        payload = value
        return builder
      },
      eq: (column: string, value: any) => {
        filters.push({ kind: 'eq', column, value })
        return builder
      },
      in: (column: string, value: any[]) => {
        filters.push({ kind: 'in', column, value })
        return builder
      },
      order: () => builder,
      limit: () => builder,
      then: (resolve: (value: any) => void, reject: (reason?: any) => void) =>
        Promise.resolve(run()).then(resolve, reject),
    }

    async function run() {
      const rows = tables[table] ?? []
      if (mode === 'update') {
        const updatedRows: Row[] = []
        tables[table] = rows.map((row) => {
          if (!matches(row)) return row
          const next = { ...row, ...payload }
          updatedRows.push(next)
          return next
        })
        return { data: updatedRows, error: null }
      }

      return {
        data: rows.filter(matches).map((row) => ({ ...row })),
        error: null,
      }
    }

    return builder
  }

  return {
    tables,
    supabase: {
      from: (table: string) => buildQuery(table),
    },
    executeSQL: vi.fn(async (sql: string, params: any[] = []) => {
      if (sql.includes('SELECT id FROM monthly_plans')) {
        return []
      }
      return []
    }),
    writeLog: vi.fn(async () => undefined),
    listActiveProjectIds: vi.fn(async () => ['project-1']),
    evaluateProjectBaselineValidity: vi.fn(),
    getProjectCriticalPathSnapshot: vi.fn(async () => ({
      displayTaskIds: [],
      allTaskIds: [],
      manualTaskIds: [],
      insertedTaskIds: [],
      pathTaskIds: [],
      startTaskIds: [],
      endTaskIds: [],
      segmentCount: 0,
      totalFloatDays: 0,
      summary: null,
    })),
  }
})

vi.mock('../services/dbService.js', () => ({
  supabase: mocks.supabase,
  executeSQL: mocks.executeSQL,
}))

vi.mock('../services/changeLogs.js', () => ({
  writeLog: mocks.writeLog,
}))

vi.mock('../services/activeProjectService.js', () => ({
  listActiveProjectIds: mocks.listActiveProjectIds,
}))

vi.mock('../services/planningRevisionPoolService.js', () => ({
  evaluateProjectBaselineValidity: mocks.evaluateProjectBaselineValidity,
}))

vi.mock('../services/projectCriticalPathService.js', () => ({
  getProjectCriticalPathSnapshot: mocks.getProjectCriticalPathSnapshot,
}))

const {
  annotateBaselineCriticalItems,
  resolveMonthlyPlanGenerationSource,
  scanProjectBaselineValidity,
  scanAllProjectBaselineValidity,
  syncBaselineCriticalFlagsToTasks,
} = await import('../services/baselineGovernanceService.js')

describe('baseline governance service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.tables.task_baselines = []
    mocks.tables.task_baseline_items = []
    mocks.tables.tasks = []
    mocks.tables.milestones = []
    mocks.evaluateProjectBaselineValidity.mockReturnValue({
      comparedTaskCount: 0,
      deviatedTaskCount: 0,
      deviatedTaskRatio: 0,
      shiftedMilestoneCount: 0,
      averageMilestoneShiftDays: 0,
      totalDurationDeviationRatio: 0,
      triggeredRules: [],
      state: 'valid',
      isValid: true,
    })
    mocks.getProjectCriticalPathSnapshot.mockResolvedValue({
      displayTaskIds: [],
      allTaskIds: [],
      manualTaskIds: [],
      insertedTaskIds: [],
      pathTaskIds: [],
      startTaskIds: [],
      endTaskIds: [],
      segmentCount: 0,
      totalFloatDays: 0,
      summary: null,
    })
  })

  it('uses the confirmed baseline as the monthly plan source when available', async () => {
    mocks.tables.task_baselines.push({
      id: 'baseline-1',
      project_id: 'project-1',
      version: 6,
      status: 'confirmed',
    })
    mocks.tables.task_baseline_items.push({
      id: 'baseline-item-1',
      project_id: 'project-1',
      baseline_version_id: 'baseline-1',
      source_task_id: 'task-1',
      title: '主体结构',
      planned_start_date: '2026-04-01',
      planned_end_date: '2026-04-10',
      sort_order: 1,
      is_milestone: false,
      is_critical: true,
      notes: null,
    })

    const source = await resolveMonthlyPlanGenerationSource('project-1')

    expect(source.mode).toBe('baseline')
    expect(source.baselineVersionId).toBe('baseline-1')
    expect(source.sourceVersionLabel).toBe('基线 v6')
    expect(source.items[0]).toMatchObject({
      baseline_item_id: 'baseline-item-1',
      source_task_id: 'task-1',
      is_critical: true,
    })
  })

  it('auto switches monthly plan generation to schedule when baseline needs realignment', async () => {
    mocks.tables.task_baselines.push({
      id: 'baseline-2',
      project_id: 'project-1',
      version: 7,
      status: 'pending_realign',
    })
    mocks.getProjectCriticalPathSnapshot.mockResolvedValue({
      displayTaskIds: ['task-live-1'],
      allTaskIds: ['task-live-1'],
      manualTaskIds: [],
      insertedTaskIds: [],
      pathTaskIds: ['task-live-1'],
      startTaskIds: ['task-live-1'],
      endTaskIds: ['task-live-1'],
      segmentCount: 1,
      totalFloatDays: 0,
      summary: null,
    })
    mocks.tables.tasks.push({
      id: 'task-live-1',
      project_id: 'project-1',
      title: '现场修正任务',
      planned_start_date: '2026-04-20',
      planned_end_date: '2026-04-28',
      progress: 35,
      sort_order: 1,
      is_milestone: false,
      is_critical: true,
      status: '进行中',
    })

    const source = await resolveMonthlyPlanGenerationSource('project-1')

    expect(source.mode).toBe('schedule')
    expect(source.autoSwitched).toBe(true)
    expect(source.baselineVersionId).toBeNull()
    expect(source.sourceVersionLabel).toContain('自动切换')
    expect(source.items[0]).toMatchObject({
      source_task_id: 'task-live-1',
      is_critical: true,
    })
  })

  it('syncs confirmed baseline critical flags back to task truth', async () => {
    mocks.tables.tasks.push(
      {
        id: 'task-1',
        project_id: 'project-1',
        is_critical: false,
      },
      {
        id: 'task-2',
        project_id: 'project-1',
        is_critical: true,
      },
    )

    const updated = await syncBaselineCriticalFlagsToTasks('project-1', [
      {
        id: 'item-1',
        project_id: 'project-1',
        baseline_version_id: 'baseline-1',
        source_task_id: 'task-1',
        title: '主体结构',
        sort_order: 1,
        is_critical: true,
        created_at: '2026-04-18T00:00:00.000Z',
        updated_at: '2026-04-18T00:00:00.000Z',
      } as any,
    ], 'user-1')

    expect(updated).toBe(1)
    expect(mocks.tables.tasks.find((row) => row.id === 'task-1')?.is_critical).toBe(true)
    expect(mocks.writeLog).toHaveBeenCalledWith(expect.objectContaining({
      entity_type: 'task',
      entity_id: 'task-1',
      field_name: 'is_critical',
      new_value: true,
    }))
  })

  it('freezes current critical path membership into baseline items on confirmation', async () => {
    mocks.tables.task_baseline_items.push(
      {
        id: 'baseline-item-1',
        project_id: 'project-1',
        baseline_version_id: 'baseline-1',
        source_task_id: 'task-1',
        title: '主体结构',
        sort_order: 1,
        is_critical: true,
        is_baseline_critical: false,
        created_at: '2026-04-18T00:00:00.000Z',
        updated_at: '2026-04-18T00:00:00.000Z',
      },
      {
        id: 'baseline-item-2',
        project_id: 'project-1',
        baseline_version_id: 'baseline-1',
        source_task_id: 'task-2',
        title: '机电安装',
        sort_order: 2,
        is_critical: false,
        is_baseline_critical: true,
        created_at: '2026-04-18T00:00:00.000Z',
        updated_at: '2026-04-18T00:00:00.000Z',
      },
    )
    mocks.getProjectCriticalPathSnapshot.mockResolvedValue({
      displayTaskIds: ['task-1'],
      allTaskIds: ['task-1', 'task-2'],
      manualTaskIds: [],
      insertedTaskIds: [],
      pathTaskIds: ['task-1'],
      startTaskIds: ['task-1'],
      endTaskIds: ['task-1'],
      segmentCount: 1,
      totalFloatDays: 0,
      summary: null,
    })

    const items = await annotateBaselineCriticalItems(
      {
        id: 'baseline-1',
        project_id: 'project-1',
        source_type: 'current_schedule',
      } as any,
      mocks.tables.task_baseline_items as any,
    )

    expect(mocks.getProjectCriticalPathSnapshot).toHaveBeenCalledWith('project-1')
    expect(items.map((item) => ({ id: item.id, is_baseline_critical: item.is_baseline_critical }))).toEqual([
      { id: 'baseline-item-1', is_baseline_critical: true },
      { id: 'baseline-item-2', is_baseline_critical: false },
    ])
    expect(mocks.tables.task_baseline_items.find((row) => row.id === 'baseline-item-1')?.is_baseline_critical).toBe(true)
    expect(mocks.tables.task_baseline_items.find((row) => row.id === 'baseline-item-2')?.is_baseline_critical).toBe(false)
  })

  it('queues the latest confirmed baseline into pending realign during scheduled scans', async () => {
    mocks.tables.task_baselines.push({
      id: 'baseline-3',
      project_id: 'project-1',
      version: 8,
      status: 'confirmed',
      updated_at: '2026-04-18T00:00:00.000Z',
    })
    mocks.tables.task_baseline_items.push({
      id: 'item-2',
      project_id: 'project-1',
      baseline_version_id: 'baseline-3',
      source_task_id: 'task-1',
      title: '主体结构',
      planned_end_date: '2026-04-10',
      sort_order: 1,
      created_at: '2026-04-18T00:00:00.000Z',
      updated_at: '2026-04-18T00:00:00.000Z',
    })
    mocks.tables.tasks.push({
      id: 'task-1',
      project_id: 'project-1',
      planned_end_date: '2026-05-20',
    })
    mocks.tables.milestones.push({
      id: 'milestone-1',
      project_id: 'project-1',
    })
    mocks.evaluateProjectBaselineValidity.mockReturnValue({
      comparedTaskCount: 1,
      deviatedTaskCount: 1,
      deviatedTaskRatio: 1,
      shiftedMilestoneCount: 0,
      averageMilestoneShiftDays: 0,
      totalDurationDeviationRatio: 0.4,
      triggeredRules: ['task_deviation_ratio'],
      state: 'needs_realign',
      isValid: false,
    })

    const report = await scanProjectBaselineValidity('project-1')

    expect(report.action).toBe('queued_realign')
    expect(mocks.tables.task_baselines.find((row) => row.id === 'baseline-3')?.status).toBe('pending_realign')
    expect(mocks.writeLog).toHaveBeenCalledWith(expect.objectContaining({
      entity_type: 'baseline',
      entity_id: 'baseline-3',
      new_value: 'pending_realign',
      change_source: 'system_auto',
    }))
  })

  it('scans all active projects through the scheduler entry', async () => {
    mocks.tables.task_baselines.push({
      id: 'baseline-4',
      project_id: 'project-1',
      version: 9,
      status: 'pending_realign',
    })

    const reports = await scanAllProjectBaselineValidity()

    expect(reports).toHaveLength(1)
    expect(mocks.listActiveProjectIds).toHaveBeenCalled()
  })
})
