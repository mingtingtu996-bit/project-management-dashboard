import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  ensureDashboardProjectSummaryContract: vi.fn((summary: any) => summary),
  getAllProjectExecutionSummaries: vi.fn(),
  getDashboardProjectExecutionSummary: vi.fn(),
  getProjectExecutionSummary: vi.fn(),
  getVisibleProjectIds: vi.fn(async () => ['project-a', 'project-b', 'project-c']),
  databaseQuery: vi.fn(),
  executeSQL: vi.fn(),
  projectDailySnapshotRows: [] as Array<Record<string, unknown>>,
  supabaseFrom: vi.fn(),
  visibleProjectIds: ['project-a', 'project-b', 'project-c'] as string[] | null,
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}))

vi.mock('../middleware/auth.js', () => ({
  authenticate: vi.fn((req: any, _res: any, next: () => void) => {
    req.user = { id: 'user-1', globalRole: 'company_admin' }
    next()
  }),
  requireProjectMember: vi.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()),
}))

vi.mock('../services/projectExecutionSummaryService.js', () => ({
  ensureDashboardProjectSummaryContract: mocks.ensureDashboardProjectSummaryContract,
  getAllProjectExecutionSummaries: mocks.getAllProjectExecutionSummaries,
  getDashboardProjectExecutionSummary: mocks.getDashboardProjectExecutionSummary,
  getProjectExecutionSummary: mocks.getProjectExecutionSummary,
}))

vi.mock('../services/dbService.js', () => ({
  executeSQL: mocks.executeSQL,
  getTasks: vi.fn(),
  getRisks: vi.fn(),
  getMilestones: vi.fn(),
  supabase: {
    from: mocks.supabaseFrom,
  },
}))

vi.mock('../database.js', () => ({
  query: mocks.databaseQuery,
}))

vi.mock('../middleware/logger.js', () => ({
  logger: mocks.logger,
}))

vi.mock('../auth/access.js', () => ({
  getVisibleProjectIds: mocks.getVisibleProjectIds,
}))

vi.mock('../auth/companyContext.js', () => ({
  getRequestCompanyId: vi.fn(() => 'dc34b6b3-5887-4399-a645-ef8faf990cc6'),
}))

function buildApp(router: express.Router) {
  const app = express()
  app.use(express.json())
  app.use('/api/company/dashboard', router)
  return app
}

function formatMonthKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

function getPreviousMonthKey(date = new Date()) {
  return formatMonthKey(new Date(date.getFullYear(), date.getMonth() - 1, 1))
}

describe('dashboard company-summary route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.projectDailySnapshotRows.splice(0, mocks.projectDailySnapshotRows.length)
    mocks.visibleProjectIds = ['project-a', 'project-b', 'project-c']
    mocks.getVisibleProjectIds.mockImplementation(async () => mocks.visibleProjectIds)
    mocks.databaseQuery.mockResolvedValue({
      rows: [{ id: 'project-a' }, { id: 'project-b' }, { id: 'project-c' }],
      rowCount: 3,
    })

    mocks.supabaseFrom.mockImplementation((table: string) => {
      if (table !== 'project_daily_snapshot') {
        return { select: vi.fn() }
      }

      const filters: Array<(row: Record<string, unknown>) => boolean> = []
      const query = {
        select: vi.fn(() => query),
        gte: vi.fn((column: string, value: unknown) => {
          filters.push((row) => String(row[column] ?? '') >= String(value ?? ''))
          return query
        }),
        lt: vi.fn((column: string, value: unknown) => {
          filters.push((row) => String(row[column] ?? '') < String(value ?? ''))
          return query
        }),
        in: vi.fn((column: string, values: unknown[]) => {
          const set = new Set(values.map((value) => String(value ?? '')))
          filters.push((row) => set.has(String(row[column] ?? '')))
          return query
        }),
        order: vi.fn(() => query),
        range: vi.fn((from: number, to: number) => {
          const rows = mocks.projectDailySnapshotRows
            .filter((row) => filters.every((filter) => filter(row)))
            .slice(from, to + 1)
          return Promise.resolve({ data: rows, error: null })
        }),
        then: (resolve: (value: { data: Array<Record<string, unknown>>; error: null }) => unknown) => {
          const rows = mocks.projectDailySnapshotRows.filter((row) => filters.every((filter) => filter(row)))
          return Promise.resolve(resolve({ data: rows, error: null }))
        },
      }

      return query
    })

    mocks.getAllProjectExecutionSummaries.mockResolvedValue([
      {
        id: 'project-b',
        name: '项目B',
        businessHealthScore: 45,
        overallProgress: 35,
        attentionRequired: true,
        activeDelayedTasks: 4,
        unreadWarningCount: 5,
        milestoneOverview: { stats: { overdue: 2 } },
      },
      {
        id: 'project-c',
        name: '项目C',
        businessHealthScore: 45,
        overallProgress: 60,
        attentionRequired: false,
        activeDelayedTasks: 2,
        unreadWarningCount: 7,
        milestoneOverview: { stats: { overdue: 0 } },
      },
      {
        id: 'project-a',
        name: '项目A',
        businessHealthScore: 90,
        overallProgress: 82,
        attentionRequired: false,
        activeDelayedTasks: 1,
        unreadWarningCount: 3,
        milestoneOverview: { stats: { overdue: 0 } },
      },
    ] as never)

    const thisMonth = formatMonthKey()
    const lastMonth = getPreviousMonthKey()
    mocks.projectDailySnapshotRows.push(
      { project_id: 'project-a', snapshot_date: `${lastMonth}-25`, health_score: 60 },
      { project_id: 'project-b', snapshot_date: `${lastMonth}-20`, health_score: 40 },
      { project_id: 'project-a', snapshot_date: `${thisMonth}-20`, health_score: 80 },
      { project_id: 'project-b', snapshot_date: `${thisMonth}-18`, health_score: 60 },
      { project_id: 'project-c', snapshot_date: `${thisMonth}-05`, health_score: 20 },
      { project_id: 'project-c', snapshot_date: `${thisMonth}-26`, health_score: 40 },
    )
  })

  it('returns company aggregates, history, and ranking from shared summaries', async () => {
    const { companyDashboardRouter: router, clearDashboardRouteCachesForTest } = await import('../routes/dashboard.js')
    clearDashboardRouteCachesForTest()
    const response = await request(buildApp(router)).get('/api/company/dashboard/company-summary')

    expect(response.status).toBe(200)
    expect(response.body.success).toBe(true)
    expect(mocks.getAllProjectExecutionSummaries).toHaveBeenCalledTimes(1)
    expect(mocks.getAllProjectExecutionSummaries).toHaveBeenCalledWith({
      projectIds: ['project-a', 'project-b', 'project-c'],
      mode: 'company_overview',
    })
    expect(response.body.data).toMatchObject({
      projectCount: 3,
      statusCounts: {
        total: 3,
        inProgress: 0,
        completed: 0,
        paused: 0,
        notStarted: 3,
      },
      averageHealth: 60,
      averageProgress: 59,
      attentionProjectCount: 2,
      totalUnreadWarningCount: 15,
      totalDelayedTaskCount: 7,
      lowHealthProjectCount: 2,
      overdueMilestoneProjectCount: 1,
      healthHistory: {
        thisMonth: 60,
        lastMonth: 50,
        change: 10,
        thisMonthPeriod: formatMonthKey(),
        lastMonthPeriod: getPreviousMonthKey(),
      },
    })
    expect(response.body.data.ranking.map((item: { id: string }) => item.id)).toEqual([
      'project-b',
      'project-c',
      'project-a',
    ])
    expect(mocks.supabaseFrom).toHaveBeenCalledWith('project_daily_snapshot')
    expect(mocks.executeSQL).not.toHaveBeenCalled()
  })

  it('paginates company health history instead of relying on a single Supabase max-rows response', async () => {
    mocks.getAllProjectExecutionSummaries.mockResolvedValue(
      Array.from({ length: 1001 }, (_, index) => ({
        id: `project-${index}`,
        name: `project-${index}`,
        businessHealthScore: index === 1000 ? 100 : 50,
        overallProgress: 50,
        attentionRequired: false,
        milestoneOverview: { stats: { overdue: 0 } },
      })) as never,
    )
    mocks.visibleProjectIds = Array.from({ length: 1001 }, (_, index) => `project-${index}`)
    mocks.projectDailySnapshotRows.splice(0, mocks.projectDailySnapshotRows.length)
    const thisMonth = formatMonthKey()
    for (let index = 0; index < 1001; index += 1) {
      mocks.projectDailySnapshotRows.push({
        project_id: `project-${index}`,
        snapshot_date: `${thisMonth}-20`,
        health_score: index === 1000 ? 100 : 50,
      })
    }

    const { companyDashboardRouter: router, clearDashboardRouteCachesForTest } = await import('../routes/dashboard.js')
    clearDashboardRouteCachesForTest()
    const response = await request(buildApp(router)).get('/api/company/dashboard/company-summary')

    expect(response.status).toBe(200)
    expect(response.body.data.healthHistory.thisMonth).toBe(50)
    const projectSnapshotQuery = mocks.supabaseFrom.mock.results.find((result) => result.value?.range)?.value
    expect(projectSnapshotQuery.range).toHaveBeenCalledWith(0, 999)
    expect(projectSnapshotQuery.range).toHaveBeenCalledWith(1000, 1999)
  })

  it('serves repeated company-summary reads from a scoped short TTL cache', async () => {
    const { companyDashboardRouter: router, clearDashboardRouteCachesForTest } = await import('../routes/dashboard.js')
    clearDashboardRouteCachesForTest()
    const app = buildApp(router)

    const first = await request(app).get('/api/company/dashboard/company-summary')
    const second = await request(app).get('/api/company/dashboard/company-summary')

    expect(first.status).toBe(200)
    expect(second.status).toBe(200)
    expect(second.body.data).toEqual(first.body.data)
    expect(mocks.getVisibleProjectIds).toHaveBeenCalledTimes(1)
    expect(mocks.getAllProjectExecutionSummaries).toHaveBeenCalledTimes(1)
    expect(mocks.supabaseFrom).toHaveBeenCalledTimes(1)
  })

  it('keeps unrestricted visible-project scope cacheable when access returns null', async () => {
    mocks.visibleProjectIds = null
    const { companyDashboardRouter: router, clearDashboardRouteCachesForTest } = await import('../routes/dashboard.js')
    clearDashboardRouteCachesForTest()
    const app = buildApp(router)

    const first = await request(app).get('/api/company/dashboard/company-summary')
    const second = await request(app).get('/api/company/dashboard/company-summary')

    expect(first.status).toBe(200)
    expect(second.status).toBe(200)
    expect(second.body.data).toEqual(first.body.data)
    expect(mocks.getVisibleProjectIds).toHaveBeenCalledTimes(1)
    expect(mocks.getAllProjectExecutionSummaries).toHaveBeenCalledTimes(1)
    expect(mocks.databaseQuery).toHaveBeenCalledTimes(1)
    expect(mocks.databaseQuery).toHaveBeenCalledWith(
      'SELECT id FROM projects WHERE company_id = $1',
      ['dc34b6b3-5887-4399-a645-ef8faf990cc6'],
    )
    expect(mocks.getAllProjectExecutionSummaries).toHaveBeenCalledWith({
      projectIds: ['project-a', 'project-b', 'project-c'],
      mode: 'company_overview',
    })
    expect(mocks.supabaseFrom).toHaveBeenCalledTimes(1)
    const snapshotQuery = mocks.supabaseFrom.mock.results.find((result) => result.value?.in)?.value
    expect(snapshotQuery.in).toHaveBeenCalledWith('project_id', ['project-a', 'project-b', 'project-c'])
  })

  it('keeps 500-project company-summary repeated reads behind the scoped cache', async () => {
    const projectIds = Array.from({ length: 500 }, (_, index) => `project-${index}`)
    mocks.visibleProjectIds = projectIds
    mocks.getAllProjectExecutionSummaries.mockResolvedValue(
      projectIds.map((id, index) => ({
        id,
        name: id,
        businessHealthScore: 50 + (index % 10),
        overallProgress: 40 + (index % 20),
        attentionRequired: index % 25 === 0,
        milestoneOverview: { stats: { overdue: index % 40 === 0 ? 1 : 0 } },
      })) as never,
    )
    mocks.projectDailySnapshotRows.splice(0, mocks.projectDailySnapshotRows.length)
    const thisMonth = formatMonthKey()
    for (const [index, id] of projectIds.entries()) {
      mocks.projectDailySnapshotRows.push({
        project_id: id,
        snapshot_date: `${thisMonth}-20`,
        health_score: 50 + (index % 10),
      })
    }

    const { companyDashboardRouter: router, clearDashboardRouteCachesForTest } = await import('../routes/dashboard.js')
    clearDashboardRouteCachesForTest()
    const app = buildApp(router)

    const first = await request(app).get('/api/company/dashboard/company-summary')
    const second = await request(app).get('/api/company/dashboard/company-summary')

    expect(first.status).toBe(200)
    expect(second.status).toBe(200)
    expect(second.body.data.projectCount).toBe(500)
    expect(second.body.data).toEqual(first.body.data)
    expect(mocks.getVisibleProjectIds).toHaveBeenCalledTimes(1)
    expect(mocks.getAllProjectExecutionSummaries).toHaveBeenCalledTimes(1)
    expect(mocks.supabaseFrom).toHaveBeenCalledTimes(1)
  })
})
