import express from 'express'
import request from 'supertest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  tables: {
    tasks: [] as Array<Record<string, unknown>>,
    risks: [] as Array<Record<string, unknown>>,
    task_conditions: [] as Array<Record<string, unknown>>,
    task_obstacles: [] as Array<Record<string, unknown>>,
    change_logs: [] as Array<Record<string, unknown>>,
    task_progress_snapshots: [] as Array<Record<string, unknown>>,
  },
  supabaseFrom: vi.fn(),
  rawQuery: vi.fn(),
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}))

vi.mock('../middleware/auth.js', () => ({
  authenticate: vi.fn((req: any, _res: unknown, next: () => void) => {
    req.user = { id: 'user-1', globalRole: 'company_admin' }
    next()
  }),
  requireProjectMember: vi.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()),
}))

vi.mock('../middleware/logger.js', () => ({
  logger: state.logger,
}))

vi.mock('../services/dbService.js', () => ({
  getTasks: vi.fn(),
  getRisks: vi.fn(),
  getMilestones: vi.fn(),
  supabase: {
    from: state.supabaseFrom,
  },
}))

vi.mock('../database.js', () => ({
  query: state.rawQuery,
}))

vi.mock('../services/projectExecutionSummaryService.js', () => ({
  ensureDashboardProjectSummaryContract: vi.fn((summary: any) => ({
    ...summary,
    plannedProgress: summary.plannedProgress ?? null,
    progressDeviation: summary.progressDeviation ?? null,
    progressGap: summary.progressGap ?? null,
    summaryAsOf: summary.summaryAsOf || '2026-04-29T12:00:00.000Z',
    plannedEndDate: summary.plannedEndDate ?? null,
  })),
  getAllProjectExecutionSummaries: vi.fn(async () => []),
  getDashboardProjectExecutionSummary: vi.fn(async () => null),
  getProjectExecutionSummary: vi.fn(async () => null),
}))

vi.mock('../services/todoTouchpointService.js', () => ({
  buildAttentionSummary: vi.fn(async () => ({
    totalAttentionCount: 0,
    unreadNotificationCount: 0,
    todayTodoCount: 0,
    notificationTodayTodoCount: 0,
    criticalCount: 0,
    warningCount: 0,
    attentionWarningCount: 0,
    workspacePendingCount: 0,
    byTouchpointType: {},
  })),
}))

vi.mock('../services/projectHealthService.js', () => ({
  calculateProjectHealth: vi.fn(() => ({ score: 0 })),
}))

vi.mock('../auth/access.js', () => ({
  getVisibleProjectIds: vi.fn(async () => null),
  isUuidLike: vi.fn((value?: string | null) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(value ?? '').trim())),
}))

vi.mock('../services/companySummaryService.js', () => ({
  buildCompanySummaryResponse: vi.fn(() => ({})),
  loadCompanyHealthHistoryRows: vi.fn(async () => []),
}))

vi.mock('../services/constructionCalendar.js', () => ({
  isAuthoritativeConstructionCalendar: vi.fn(() => false),
  resolveConstructionCalendarContext: vi.fn(async () => ({ basis: 'calendar_day', windows: [] })),
}))

const { default: dashboardRouter, clearDashboardRouteCachesForTest } = await import('../routes/dashboard.js')
const projectExecutionSummaryService = await import('../services/projectExecutionSummaryService.js')
const todoTouchpointService = await import('../services/todoTouchpointService.js')

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/projects/:projectId/dashboard', dashboardRouter)
  app.use((_req, res) => {
    res.status(404).json({ success: false, error: { code: 'NOT_FOUND' } })
  })
  return app
}

function rowsFor(table: string) {
  if (table in state.tables) {
    return state.tables[table as keyof typeof state.tables]
  }
  return []
}

function makeQuery(table: string) {
  const filters: Array<{ column: string; values: unknown[]; mode: 'eq' | 'in' }> = []
  const applyFilters = () => filters.reduce((rows, filter) => {
    if (filter.mode === 'eq') {
      const expected = String(filter.values[0] ?? '')
      return rows.filter((row) => String(row[filter.column] ?? '') === expected)
    }
    const expectedValues = filter.values.map((value) => String(value ?? ''))
    return rows.filter((row) => expectedValues.includes(String(row[filter.column] ?? '')))
  }, rowsFor(table))
  const result = () => Promise.resolve({
    data: applyFilters(),
    error: null,
  })
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn((column: string, value: unknown) => {
      filters.push({ column, values: [value], mode: 'eq' })
      return query
    }),
    in: vi.fn((column: string, values: unknown[]) => {
      filters.push({ column, values, mode: 'in' })
      return query
    }),
    maybeSingle: vi.fn(async () => {
      const { data, error } = await result()
      return { data: data[0] ?? null, error }
    }),
    then: (onFulfilled: (value: { data: Record<string, unknown>[]; error: null }) => unknown, onRejected?: (reason: unknown) => unknown) => (
      result().then(onFulfilled, onRejected)
    ),
  }

  return query
}

function parseTableFromSql(sql: string): keyof typeof state.tables | null {
  const match = sql.match(/public\.([a-z_]+)/)
  const table = match?.[1]
  return table && table in state.tables ? table as keyof typeof state.tables : null
}

function routeDateKey() {
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  return start.toISOString().slice(0, 10)
}

function routeIsoAt(hour: number) {
  const date = new Date()
  date.setHours(hour, 0, 0, 0)
  return date.toISOString()
}

describe('dashboard today-live route', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-29T12:00:00.000Z'))
    vi.clearAllMocks()

    for (const rows of Object.values(state.tables)) {
      rows.splice(0, rows.length)
    }
    clearDashboardRouteCachesForTest()

    state.supabaseFrom.mockImplementation((table: string) => makeQuery(table))
    state.rawQuery.mockImplementation(async (sql: string, params: unknown[] = []) => {
      const table = parseTableFromSql(sql)
      if (!table) return { rows: [] }
      if (table === 'task_progress_snapshots') {
        const taskIds = Array.isArray(params[0]) ? params[0].map((value) => String(value ?? '')) : []
        return { rows: state.tables.task_progress_snapshots.filter((row) => taskIds.includes(String(row.task_id ?? ''))) }
      }
      if (table === 'change_logs') {
        const projectId = String(params[0] ?? '')
        const taskIds = Array.isArray(params[1]) ? params[1].map((value) => String(value ?? '')) : []
        const startTime = params[2] ? new Date(String(params[2])).getTime() : Number.NEGATIVE_INFINITY
        const endTime = params[3] ? new Date(String(params[3])).getTime() : Number.POSITIVE_INFINITY
        return {
          rows: state.tables.change_logs.filter((row) => {
            const changedAt = new Date(String(row.changed_at ?? 0)).getTime()
            return String(row.project_id ?? '') === projectId
              && String(row.entity_type ?? '') === 'task'
              && String(row.field_name ?? '') === 'progress'
              && taskIds.includes(String(row.entity_id ?? ''))
              && changedAt >= startTime
              && changedAt < endTime
          }),
        }
      }
      const projectId = String(params[0] ?? '')
      return { rows: rowsFor(table).filter((row) => String(row.project_id ?? '') === projectId) }
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('does not register the legacy today-live dashboard route', async () => {
    const response = await request(buildApp()).get('/api/dashboard/today-live?projectId=project-1')

    expect(response.status).toBe(404)
    expect(state.rawQuery).not.toHaveBeenCalled()
    expect(state.supabaseFrom).not.toHaveBeenCalled()
  })

  it('does not register legacy dashboard detail routes that bypass unified summaries', async () => {
    const legacyPaths = [
      '/api/dashboard/health-score?projectId=project-1',
      '/api/dashboard/progress-details?projectId=project-1',
      '/api/dashboard/top-risks?projectId=project-1',
      '/api/dashboard/milestones-summary?projectId=project-1',
    ]

    for (const path of legacyPaths) {
      const response = await request(buildApp()).get(path)
      expect(response.status).toBe(404)
    }
    expect(state.rawQuery).not.toHaveBeenCalled()
    expect(state.supabaseFrom).not.toHaveBeenCalled()
  })

  it('keeps project summary fixed to post-access scope', async () => {
    vi.mocked(projectExecutionSummaryService.getDashboardProjectExecutionSummary).mockResolvedValueOnce(
      {
        id: 'project-1',
        name: '示例项目',
        overallProgress: 40,
        plannedProgress: 52,
        progressDeviation: -12,
        progressGap: 12,
        summaryAsOf: '2026-04-29T12:00:00.000Z',
        plannedEndDate: '2026-08-31',
      } as never,
    )

    const response = await request(buildApp()).get('/api/projects/project-1/dashboard/project-summary')

    expect(response.status).toBe(200)
    expect(projectExecutionSummaryService.getDashboardProjectExecutionSummary).toHaveBeenCalledWith('project-1')
    expect(projectExecutionSummaryService.getAllProjectExecutionSummaries).not.toHaveBeenCalled()
    expect(response.body.data).toMatchObject({
      plannedProgress: 52,
      progressDeviation: -12,
      progressGap: 12,
      summaryAsOf: '2026-04-29T12:00:00.000Z',
      plannedEndDate: '2026-08-31',
    })
  })

  it('uses the attention summary count on the dashboard project summary response', async () => {
    vi.mocked(projectExecutionSummaryService.getDashboardProjectExecutionSummary).mockResolvedValueOnce(
      {
        id: 'project-1',
        name: '示例项目',
        overallProgress: 40,
        plannedProgress: null,
        progressDeviation: null,
        progressGap: null,
        summaryAsOf: '2026-04-29T12:00:00.000Z',
        plannedEndDate: null,
        todayTodoCount: 99,
        projectTodayActionCount: 99,
      } as never,
    )
    vi.mocked(todoTouchpointService.buildAttentionSummary).mockResolvedValueOnce({
      totalAttentionCount: 2,
      unreadNotificationCount: 1,
      todayTodoCount: 3,
      notificationTodayTodoCount: 3,
      criticalCount: 0,
      warningCount: 1,
      attentionWarningCount: 1,
      workspacePendingCount: 0,
      byTouchpointType: { dashboard_todo: 3 },
    })

    const response = await request(buildApp()).get('/api/projects/project-1/dashboard/project-summary')

    expect(response.status).toBe(200)
    expect(todoTouchpointService.buildAttentionSummary).toHaveBeenCalledWith('project-1', null, 'user-1')
    expect(response.body.data.todayTodoCount).toBe(3)
    expect(response.body.data.projectTodayActionCount).toBe(3)
    expect(response.body.data.plannedProgress).toBeNull()
    expect(response.body.data.progressDeviation).toBeNull()
    expect(response.body.data.progressGap).toBeNull()
    expect(response.body.data.summaryAsOf).toBe('2026-04-29T12:00:00.000Z')
    expect(response.body.data.plannedEndDate).toBeNull()
  })

  it('returns today progress changes grouped by task', async () => {
    const today = routeDateKey()
    const previous = new Date(`${today}T00:00:00.000Z`)
    previous.setUTCDate(previous.getUTCDate() - 1)
    const previousDay = previous.toISOString().slice(0, 10)

    state.tables.tasks.push(
      {
        id: 'task-progress',
        project_id: 'project-1',
        title: '地下室结构施工',
        status: 'in_progress',
        progress: 55,
      },
      {
        id: 'task-no-change',
        project_id: 'project-1',
        title: '无变化任务',
        status: 'in_progress',
        progress: 30,
      },
    )

    state.tables.change_logs.push(
      {
        id: 'progress-1',
        project_id: 'project-1',
        entity_type: 'task',
        entity_id: 'task-progress',
        field_name: 'progress',
        old_value: '20',
        new_value: '45',
        changed_at: routeIsoAt(9),
      },
      {
        id: 'progress-2',
        project_id: 'project-1',
        entity_type: 'task',
        entity_id: 'task-progress',
        field_name: 'progress',
        old_value: '45',
        new_value: '55',
        changed_at: routeIsoAt(11),
      },
      {
        id: 'progress-same',
        project_id: 'project-1',
        entity_type: 'task',
        entity_id: 'task-no-change',
        field_name: 'progress',
        old_value: '30',
        new_value: '30',
        changed_at: routeIsoAt(10),
      },
      {
        id: 'progress-other-field',
        project_id: 'project-1',
        entity_type: 'task',
        entity_id: 'task-progress',
        field_name: 'status',
        old_value: 'todo',
        new_value: 'in_progress',
        changed_at: routeIsoAt(10),
      },
    )
    state.tables.task_progress_snapshots.push(
      {
        id: 'snapshot-yesterday',
        task_id: 'task-progress',
        progress: 18,
        snapshot_date: previousDay,
        created_at: `${previousDay}T18:00:00.000Z`,
      },
      {
        id: 'snapshot-today',
        task_id: 'task-progress',
        progress: 55,
        snapshot_date: today,
        created_at: routeIsoAt(11),
      },
    )

    const response = await request(buildApp()).get('/api/projects/project-1/dashboard/today-progress')

    expect(response.status).toBe(200)
    expect(response.body.success).toBe(true)
    expect(response.body.data).toEqual([
      expect.objectContaining({
        id: 'today-progress-task-progress',
        taskId: 'task-progress',
        title: '地下室结构施工',
        previousProgress: 18,
        currentProgress: 55,
        delta: 37,
      }),
    ])
    expect(state.rawQuery).toHaveBeenCalledWith('SELECT * FROM public.tasks WHERE project_id = $1', ['project-1'])
    expect(state.rawQuery).toHaveBeenCalledWith(
      'SELECT * FROM public.task_progress_snapshots WHERE task_id = ANY($1::uuid[])',
      [['task-progress', 'task-no-change']],
    )
    expect(state.supabaseFrom).not.toHaveBeenCalled()
    expect(state.supabaseFrom).not.toHaveBeenCalledWith('change_logs')
  })

  it('falls back to today progress change logs when snapshot rows are missing', async () => {
    state.tables.tasks.push(
      {
        id: 'task-log-progress',
        project_id: 'project-1',
        title: '砌体工程',
        status: 'in_progress',
        progress: 40,
      },
      {
        id: 'task-log-same',
        project_id: 'project-1',
        title: '无变化工程',
        status: 'in_progress',
        progress: 30,
      },
    )

    state.tables.change_logs.push(
      {
        id: 'progress-log-1',
        project_id: 'project-1',
        entity_type: 'task',
        entity_id: 'task-log-progress',
        field_name: 'progress',
        old_value: '10',
        new_value: '25',
        changed_at: routeIsoAt(8),
      },
      {
        id: 'progress-log-2',
        project_id: 'project-1',
        entity_type: 'task',
        entity_id: 'task-log-progress',
        field_name: 'progress',
        old_value: '25',
        new_value: '40',
        changed_at: routeIsoAt(13),
      },
      {
        id: 'progress-log-same',
        project_id: 'project-1',
        entity_type: 'task',
        entity_id: 'task-log-same',
        field_name: 'progress',
        old_value: '30',
        new_value: '30',
        changed_at: routeIsoAt(10),
      },
    )

    const response = await request(buildApp()).get('/api/projects/project-1/dashboard/today-progress')

    expect(response.status).toBe(200)
    expect(response.body.success).toBe(true)
    expect(response.body.data).toEqual([
      expect.objectContaining({
        id: 'today-progress-task-log-progress',
        taskId: 'task-log-progress',
        title: '砌体工程',
        previousProgress: 10,
        currentProgress: 40,
        delta: 30,
        changedAt: routeIsoAt(13),
      }),
    ])
    expect(state.rawQuery.mock.calls.some(([sql]) => String(sql).includes('public.change_logs'))).toBe(true)
    expect(state.supabaseFrom).not.toHaveBeenCalledWith('change_logs')
  })

  it('falls back to progress change logs when the previous snapshot is missing', async () => {
    const today = routeDateKey()

    state.tables.tasks.push({
      id: 'task-partial-snapshot',
      project_id: 'project-1',
      title: '幕墙安装',
      status: 'in_progress',
      progress: 70,
    })
    state.tables.task_progress_snapshots.push({
      id: 'snapshot-today-only',
      task_id: 'task-partial-snapshot',
      progress: 70,
      snapshot_date: today,
      created_at: routeIsoAt(12),
    })
    state.tables.change_logs.push(
      {
        id: 'partial-progress-log-1',
        project_id: 'project-1',
        entity_type: 'task',
        entity_id: 'task-partial-snapshot',
        field_name: 'progress',
        old_value: '40',
        new_value: '55',
        changed_at: routeIsoAt(9),
      },
      {
        id: 'partial-progress-log-2',
        project_id: 'project-1',
        entity_type: 'task',
        entity_id: 'task-partial-snapshot',
        field_name: 'progress',
        old_value: '55',
        new_value: '70',
        changed_at: routeIsoAt(12),
      },
    )

    const response = await request(buildApp()).get('/api/projects/project-1/dashboard/today-progress')

    expect(response.status).toBe(200)
    expect(response.body.success).toBe(true)
    expect(response.body.data).toEqual([
      expect.objectContaining({
        taskId: 'task-partial-snapshot',
        title: '幕墙安装',
        previousProgress: 40,
        currentProgress: 70,
        delta: 30,
      }),
    ])
  })

  it('keeps historical tasks out of today progress items', async () => {
    const today = routeDateKey()
    const previous = new Date(`${today}T00:00:00.000Z`)
    previous.setUTCDate(previous.getUTCDate() - 1)
    const previousDay = previous.toISOString().slice(0, 10)

    state.tables.tasks.push({
      id: 'task-history-progress',
      project_id: 'project-1',
      title: '历史阶段任务',
      status: 'completed',
      progress: 100,
      standard_task_metadata: { is_historical: true },
    })
    state.tables.task_progress_snapshots.push(
      {
        id: 'snapshot-history-yesterday',
        task_id: 'task-history-progress',
        progress: 20,
        snapshot_date: previousDay,
        created_at: `${previousDay}T18:00:00.000Z`,
      },
      {
        id: 'snapshot-history-today',
        task_id: 'task-history-progress',
        progress: 100,
        snapshot_date: today,
        created_at: routeIsoAt(11),
      },
    )

    const response = await request(buildApp()).get('/api/projects/project-1/dashboard/today-progress')

    expect(response.status).toBe(200)
    expect(response.body.success).toBe(true)
    expect(response.body.data).toEqual([])
  })

  it('rejects today progress requests without a project id using the documented error code', async () => {
    const response = await request(buildApp()).get('/api/projects/%20/dashboard/today-progress')

    expect(response.status).toBe(400)
    expect(response.body.success).toBe(false)
    expect(response.body.error.code).toBe('MISSING_PROJECT_ID')
  })

  it('returns backend-owned focus task buckets without local fallback data', async () => {
    state.tables.tasks.push(
      {
        id: 'task-overdue',
        project_id: 'project-1',
        title: 'Overdue task',
        planned_end_date: '2026-04-28',
        status: 'in_progress',
        progress: 40,
        assignee_name: 'A',
      },
      {
        id: 'task-today',
        project_id: 'project-1',
        title: 'Due today',
        planned_end_date: '2026-04-29',
        status: 'pending',
        progress: 0,
        assignee_name: 'B',
      },
      {
        id: 'task-week',
        project_id: 'project-1',
        title: 'Due this week',
        planned_end_date: '2026-05-04',
        status: 'pending',
        progress: 10,
      },
      {
        id: 'task-normal',
        project_id: 'project-1',
        title: 'Later task',
        planned_end_date: '2026-05-20',
        status: 'pending',
        progress: 0,
      },
      {
        id: 'task-completed',
        project_id: 'project-1',
        title: 'Completed task',
        planned_end_date: '2026-04-29',
        status: 'completed',
        progress: 100,
      },
    )

    const response = await request(buildApp()).get('/api/projects/project-1/dashboard/focus-tasks?filter=urgent')

    expect(response.status).toBe(200)
    expect(response.body.success).toBe(true)
    expect(response.body.data.filter).toBe('urgent')
    expect(response.body.data.stats).toMatchObject({
      total: 4,
      overdue: 1,
      urgent: 1,
      approaching: 1,
      normal: 1,
    })
    expect(response.body.data.totalCount).toBe(2)
    expect(response.body.data.items.map((item: { id: string }) => item.id)).toEqual(['task-overdue', 'task-today'])
    expect(response.body.data.items.map((item: { dueStatus: string }) => item.dueStatus)).toEqual(['overdue', 'urgent'])
  })

  it('keeps historical tasks out of focus task buckets', async () => {
    state.tables.tasks.push(
      {
        id: 'task-history-overdue',
        project_id: 'project-1',
        title: 'Historical overdue task',
        planned_end_date: '2026-04-01',
        status: 'in_progress',
        progress: 40,
        standard_task_metadata: { is_historical: true },
      },
      {
        id: 'task-current-overdue',
        project_id: 'project-1',
        title: 'Current overdue task',
        planned_end_date: '2026-04-28',
        status: 'in_progress',
        progress: 20,
      },
    )

    const response = await request(buildApp()).get('/api/projects/project-1/dashboard/focus-tasks?filter=urgent')

    expect(response.status).toBe(200)
    expect(response.body.success).toBe(true)
    expect(response.body.data.stats).toMatchObject({
      total: 1,
      overdue: 1,
    })
    expect(response.body.data.items.map((item: { id: string }) => item.id)).toEqual(['task-current-overdue'])
  })

  it('uses unified due status semantics for focus tasks while keeping cancelled tasks out of the focus pool', async () => {
    state.tables.tasks.push(
      {
        id: 'task-cancelled-old',
        project_id: 'project-1',
        title: 'Cancelled old task',
        planned_end_date: '2026-04-01',
        status: 'cancelled',
        progress: 20,
      },
      {
        id: 'task-active-old',
        project_id: 'project-1',
        title: 'Active old task',
        planned_end_date: '2026-04-28',
        status: 'in_progress',
        progress: 20,
      },
    )

    const response = await request(buildApp()).get('/api/projects/project-1/dashboard/focus-tasks?filter=urgent')

    expect(response.status).toBe(200)
    expect(response.body.success).toBe(true)
    expect(response.body.data.stats).toMatchObject({
      total: 1,
      overdue: 1,
      normal: 0,
    })
    expect(response.body.data.items.map((item: { id: string }) => item.id)).toEqual(['task-active-old'])
  })

  it('passes row-level due policy fields into focus task due bucketing', async () => {
    state.tables.tasks.push(
      {
        id: 'task-policy-urgent',
        project_id: 'project-1',
        title: 'Policy urgent task',
        planned_end_date: '2026-05-04',
        status: 'pending',
        progress: 0,
        due_urgent_days: 5,
        due_approaching_days: 10,
      },
      {
        id: 'task-default-approaching',
        project_id: 'project-1',
        title: 'Default approaching task',
        planned_end_date: '2026-05-04',
        status: 'pending',
        progress: 0,
      },
    )

    const response = await request(buildApp()).get('/api/projects/project-1/dashboard/focus-tasks?filter=urgent')

    expect(response.status).toBe(200)
    expect(response.body.success).toBe(true)
    expect(response.body.data.stats).toMatchObject({
      total: 2,
      urgent: 1,
      approaching: 1,
    })
    expect(response.body.data.totalCount).toBe(1)
    expect(response.body.data.items).toEqual([
      expect.objectContaining({
        id: 'task-policy-urgent',
        daysUntilDue: 5,
        dueStatus: 'urgent',
      }),
    ])
  })

  it('rejects focus task requests without a project id using the documented error code', async () => {
    const response = await request(buildApp()).get('/api/projects/%20/dashboard/focus-tasks')

    expect(response.status).toBe(400)
    expect(response.body.success).toBe(false)
    expect(response.body.error.code).toBe('MISSING_PROJECT_ID')
  })
})
