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
  },
  supabaseFrom: vi.fn(),
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

vi.mock('../services/projectExecutionSummaryService.js', () => ({
  getAllProjectExecutionSummaries: vi.fn(async () => []),
  getProjectExecutionSummary: vi.fn(async () => null),
}))

vi.mock('../services/projectHealthService.js', () => ({
  calculateProjectHealth: vi.fn(() => ({ score: 0 })),
}))

vi.mock('../auth/access.js', () => ({
  getVisibleProjectIds: vi.fn(async () => null),
}))

vi.mock('../services/companySummaryService.js', () => ({
  buildCompanySummaryResponse: vi.fn(() => ({})),
  loadCompanyHealthHistoryRows: vi.fn(async () => []),
}))

const { default: dashboardRouter } = await import('../routes/dashboard.js')

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/dashboard', dashboardRouter)
  return app
}

function rowsFor(table: string) {
  if (table in state.tables) {
    return state.tables[table as keyof typeof state.tables]
  }
  return []
}

function makeQuery(table: string) {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn((column: string, value: unknown) => Promise.resolve({
      data: rowsFor(table).filter((row) => String(row[column] ?? '') === String(value ?? '')),
      error: null,
    })),
  }

  return query
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

    state.supabaseFrom.mockImplementation((table: string) => makeQuery(table))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns an empty stable response when no project activity exists', async () => {
    const response = await request(buildApp()).get('/api/dashboard/today-live?projectId=project-1')

    expect(response.status).toBe(200)
    expect(response.body.success).toBe(true)
    expect(response.body.data).toEqual([])
    expect(state.supabaseFrom).toHaveBeenCalledWith('tasks')
    expect(state.supabaseFrom).toHaveBeenCalledWith('risks')
    expect(state.supabaseFrom).toHaveBeenCalledWith('task_conditions')
    expect(state.supabaseFrom).toHaveBeenCalledWith('task_obstacles')
    expect(state.supabaseFrom).toHaveBeenCalledWith('change_logs')
  })

  it('merges today activity into the frontend TodayLive contract ordered by priority', async () => {
    const today = routeDateKey()

    state.tables.tasks.push(
      {
        id: 'task-due',
        project_id: 'project-1',
        title: '主体结构封顶',
        planned_end_date: today,
        assignee_name: '张工',
        status: 'in_progress',
      },
      {
        id: 'task-done',
        project_id: 'project-1',
        title: '已完成任务',
        planned_end_date: today,
        status: 'completed',
      },
    )

    state.tables.risks.push(
      {
        id: 'risk-new',
        project_id: 'project-1',
        title: '高支模风险',
        level: 'critical',
        status: 'identified',
        created_at: routeIsoAt(9),
      },
      {
        id: 'risk-closed',
        project_id: 'project-1',
        title: '关闭风险',
        status: 'closed',
        created_at: routeIsoAt(10),
      },
    )

    state.tables.task_conditions.push({
      id: 'condition-open',
      project_id: 'project-1',
      condition_name: '塔吊验收',
      is_satisfied: false,
      created_at: routeIsoAt(11),
    })

    state.tables.task_obstacles.push({
      id: 'obstacle-open',
      project_id: 'project-1',
      title: '材料未到场',
      is_resolved: false,
      status: 'open',
      expected_resolution_date: today,
      updated_at: routeIsoAt(8),
    })

    state.tables.change_logs.push({
      id: 'change-today',
      project_id: 'project-1',
      entity_title: '月计划调整',
      action: 'updated',
      changed_at: routeIsoAt(10),
    })

    const response = await request(buildApp()).get('/api/dashboard/today-live?projectId=project-1')

    expect(response.status).toBe(200)
    expect(response.body.success).toBe(true)
    expect(response.body.data).toHaveLength(5)
    expect(response.body.data.map((item: { priority: number }) => item.priority)).toEqual([1, 1, 2, 3, 4])
    expect(response.body.data.map((item: { type: string }) => item.type)).toEqual([
      'warning',
      'warning',
      'due_task',
      'change',
      'new_risk',
    ])
    expect(response.body.data[0]).toMatchObject({
      type: 'warning',
      title: '开工条件预警：塔吊验收',
      detail: '开工条件仍未满足',
    })
    expect(response.body.data[2]).toMatchObject({
      type: 'due_task',
      title: '今日到期：主体结构封顶',
      detail: '张工',
    })
  })

  it('rejects requests without a project id using the documented error code', async () => {
    const response = await request(buildApp()).get('/api/dashboard/today-live')

    expect(response.status).toBe(400)
    expect(response.body.success).toBe(false)
    expect(response.body.error.code).toBe('MISSING_PROJECT_ID')
  })
})
