import express from 'express'
import { readFileSync } from 'node:fs'
import { resolve, sep } from 'node:path'
import request from 'supertest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getProjectExecutionSummary: vi.fn(),
  tables: {
    projects: [] as Array<Record<string, unknown>>,
    project_daily_snapshot: [] as Array<Record<string, unknown>>,
  },
  supabaseFrom: vi.fn(),
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}))

const workspaceRoot = process.cwd().endsWith(`${sep}server`)
  ? resolve(process.cwd(), '..')
  : process.cwd()

vi.mock('../middleware/auth.js', () => ({
  authenticate: vi.fn((req: any, _res: any, next: () => void) => {
    req.user = { id: 'user-1', globalRole: 'company_admin' }
    next()
  }),
  requireProjectMember: vi.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()),
}))

vi.mock('../services/projectExecutionSummaryService.js', () => ({
  getProjectExecutionSummary: mocks.getProjectExecutionSummary,
}))

vi.mock('../services/dbService.js', () => ({
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
  app.use('/api/projects/:projectId/reports', router)
  return app
}

function makeQuery(table: keyof typeof mocks.tables) {
  const filters: Array<(row: Record<string, unknown>) => boolean> = []
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn((column: string, value: unknown) => {
      filters.push((row) => String(row[column] ?? '') === String(value ?? ''))
      return query
    }),
    gte: vi.fn((column: string, value: unknown) => {
      filters.push((row) => String(row[column] ?? '') >= String(value ?? ''))
      return query
    }),
    lte: vi.fn((column: string, value: unknown) => {
      filters.push((row) => String(row[column] ?? '') <= String(value ?? ''))
      return query
    }),
    order: vi.fn(() => query),
    limit: vi.fn(() => query),
    then: (resolve: (value: { data: Array<Record<string, unknown>>; error: null }) => unknown) => {
      const rows = mocks.tables[table].filter((row) => filters.every((filter) => filter(row)))
      return Promise.resolve(resolve({ data: rows, error: null }))
    },
  }

  return query
}

describe('reports routes', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-05T12:00:00.000Z'))
    vi.clearAllMocks()
    mocks.tables.projects.splice(0, mocks.tables.projects.length)
    mocks.tables.project_daily_snapshot.splice(0, mocks.tables.project_daily_snapshot.length)

    mocks.supabaseFrom.mockImplementation((table: keyof typeof mocks.tables) => {
      if (table === 'projects' || table === 'project_daily_snapshot') {
        return makeQuery(table)
      }
      return makeQuery('projects')
    })

    mocks.tables.projects.push({
      id: 'project-1',
      planned_start_date: '2026-04-01',
      planned_end_date: '2026-04-05',
    })
    mocks.tables.project_daily_snapshot.push(
      { project_id: 'project-1', snapshot_date: '2026-04-01', overall_progress: 0 },
      { project_id: 'project-1', snapshot_date: '2026-04-03', overall_progress: 40 },
    )
    mocks.getProjectExecutionSummary.mockResolvedValue({
      id: 'project-1',
      overallProgress: 80,
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns daily planned and actual cumulative S-curve points for a project', async () => {
    const { default: router } = await import('../routes/reports.js')
    const response = await request(buildApp(router)).get('/api/projects/project-1/reports/s-curve')

    expect(response.status).toBe(200)
    expect(response.body.success).toBe(true)
    expect(response.body.data).toEqual([
      { date: '2026-04-01', planned_cumulative: 0, actual_cumulative: 0 },
      { date: '2026-04-02', planned_cumulative: 25, actual_cumulative: 0 },
      { date: '2026-04-03', planned_cumulative: 50, actual_cumulative: 40 },
      { date: '2026-04-04', planned_cumulative: 75, actual_cumulative: 40 },
      { date: '2026-04-05', planned_cumulative: 100, actual_cumulative: 80 },
    ])
    expect(mocks.supabaseFrom).toHaveBeenCalledWith('project_daily_snapshot')
    expect(mocks.getProjectExecutionSummary).toHaveBeenCalledWith('project-1')
  })

  it('returns 404 when the project is missing', async () => {
    mocks.tables.projects.splice(0, mocks.tables.projects.length)

    const { default: router } = await import('../routes/reports.js')
    const response = await request(buildApp(router)).get('/api/projects/project-1/reports/s-curve')

    expect(response.status).toBe(404)
    expect(response.body.error.code).toBe('PROJECT_NOT_FOUND')
  })

  it('keeps Reports module keys aligned with the UIUX four-module contract', () => {
    const reportsSource = readFileSync(resolve(workspaceRoot, 'client', 'src', 'pages', 'Reports.tsx'), 'utf8')

    expect(reportsSource).toContain("type AnalysisView = 'progress' | 'progress_deviation' | 'risk' | 'change_log'")
    expect(reportsSource).toContain("{ key: 'progress' as const")
    expect(reportsSource).toContain("{ key: 'progress_deviation' as const")
    expect(reportsSource).toContain("{ key: 'risk' as const")
    expect(reportsSource).toContain("{ key: 'change_log' as const")
    expect(reportsSource).toContain('/reports/s-curve')
  })
})
