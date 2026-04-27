import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getAllProjectExecutionSummaries: vi.fn(),
  getProjectExecutionSummary: vi.fn(),
  executeSQL: vi.fn(),
  projectDailySnapshotRows: [] as Array<Record<string, unknown>>,
  supabaseFrom: vi.fn(),
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
  getAllProjectExecutionSummaries: mocks.getAllProjectExecutionSummaries,
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

vi.mock('../middleware/logger.js', () => ({
  logger: mocks.logger,
}))

function buildApp(router: express.Router) {
  const app = express()
  app.use(express.json())
  app.use('/api/dashboard', router)
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
        order: vi.fn(() => query),
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
        healthScore: 45,
        overallProgress: 35,
        attentionRequired: true,
        milestoneOverview: { stats: { overdue: 2 } },
      },
      {
        id: 'project-c',
        name: '项目C',
        healthScore: 45,
        overallProgress: 60,
        attentionRequired: false,
        milestoneOverview: { stats: { overdue: 0 } },
      },
      {
        id: 'project-a',
        name: '项目A',
        healthScore: 90,
        overallProgress: 82,
        attentionRequired: false,
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
    const { default: router } = await import('../routes/dashboard.js')
    const response = await request(buildApp(router)).get('/api/dashboard/company-summary')

    expect(response.status).toBe(200)
    expect(response.body.success).toBe(true)
    expect(mocks.getAllProjectExecutionSummaries).toHaveBeenCalledTimes(1)
    expect(response.body.data).toMatchObject({
      projectCount: 3,
      averageHealth: 60,
      averageProgress: 59,
      attentionProjectCount: 2,
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
})
