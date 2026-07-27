import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  executeSQL: vi.fn(),
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}))

vi.mock('../services/dbService.js', () => ({
  executeSQL: mocks.executeSQL,
  getProject: vi.fn(),
  getTasks: vi.fn(),
  getRisks: vi.fn(),
  getIssues: vi.fn(),
  supabase: {
    from: vi.fn(),
  },
}))

vi.mock('../database.js', () => ({
  query: vi.fn(),
}))

vi.mock('../middleware/logger.js', () => ({
  logger: mocks.logger,
}))

const { getDashboardProjectExecutionSummary } = await import('../services/projectExecutionSummaryService.js')

function rowsForSql(sql: string) {
  if (sql.includes('FROM projects')) {
    return [{
      id: 'project-1',
      name: '示例项目',
      company_id: 'company-1',
      status: 'active',
      planned_start_date: '2026-04-01',
      planned_end_date: '2026-05-10',
      start_date: null,
      end_date: null,
      health_score: 72,
      health_status: '健康',
    }]
  }
  if (sql.includes('FROM tasks')) {
    return [
      {
        id: 'task-1',
        project_id: 'project-1',
        parent_id: null,
        title: '结构施工',
        status: 'in_progress',
        progress: 20,
        is_milestone: false,
        planned_start_date: '2026-04-01',
        planned_end_date: '2026-04-30',
        start_date: null,
        end_date: null,
        actual_end_date: null,
        is_wbs_summary: false,
        is_executable: true,
        created_at: '2026-04-01T00:00:00.000Z',
        updated_at: '2026-04-15T00:00:00.000Z',
      },
      {
        id: 'task-2',
        project_id: 'project-1',
        parent_id: null,
        title: '机电施工',
        status: 'in_progress',
        progress: 60,
        is_milestone: false,
        planned_start_date: '2026-04-01',
        planned_end_date: '2026-04-30',
        start_date: null,
        end_date: null,
        actual_end_date: null,
        is_wbs_summary: false,
        is_executable: true,
        created_at: '2026-04-01T00:00:00.000Z',
        updated_at: '2026-04-15T00:00:00.000Z',
      },
    ]
  }
  if (sql.includes('FROM risks')) {
    return [{ id: 'risk-1', project_id: 'project-1', status: 'open' }]
  }
  return []
}

describe('getDashboardProjectExecutionSummary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.executeSQL.mockImplementation(async (sql: string) => rowsForSql(sql))
  })

  it('returns Dashboard contract fields from the summary service fast path', async () => {
    const summary = await getDashboardProjectExecutionSummary('project-1', {
      asOf: '2026-04-15T00:00:00.000Z',
    })

    expect(summary).toMatchObject({
      id: 'project-1',
      overallProgress: 40,
      plannedProgress: 48,
      progressDeviation: -8,
      progressGap: 8,
      summaryAsOf: '2026-04-15T00:00:00.000Z',
      plannedEndDate: '2026-05-10',
      riskCount: 1,
    })
  })

  it('returns explicit null plan fields when task plan dates are unavailable', async () => {
    mocks.executeSQL.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM tasks')) {
        return rowsForSql(sql).map((row) => ({
          ...row,
          planned_start_date: null,
          planned_end_date: null,
        }))
      }
      return rowsForSql(sql)
    })

    const summary = await getDashboardProjectExecutionSummary('project-1', {
      asOf: '2026-04-15T00:00:00.000Z',
    })

    expect(summary).toMatchObject({
      plannedProgress: null,
      progressDeviation: null,
      progressGap: null,
      summaryAsOf: '2026-04-15T00:00:00.000Z',
      plannedEndDate: '2026-05-10',
    })
  })
})
