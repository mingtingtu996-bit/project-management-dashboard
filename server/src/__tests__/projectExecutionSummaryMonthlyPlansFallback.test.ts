import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  executeSQL: vi.fn(),
  getProject: vi.fn(),
  getTasks: vi.fn(),
  getRisks: vi.fn(),
  getIssues: vi.fn(),
  rawQuery: vi.fn(),
  resolveConstructionCalendarContext: vi.fn(),
  getCriticalPathTaskIds: vi.fn(),
  buildAttentionSummary: vi.fn(),
  getMonthlyPlanStatusSummary: vi.fn(),
  getMonthlyPlanFulfillmentTrend: vi.fn(),
  attachCurrentBaselineProjectionToTasks: vi.fn(),
  logger: {
    warn: vi.fn(),
  },
}))

vi.mock('../services/dbService.js', () => ({
  executeSQL: mocks.executeSQL,
  getProject: mocks.getProject,
  getTasks: mocks.getTasks,
  getRisks: mocks.getRisks,
  getIssues: mocks.getIssues,
}))

vi.mock('../database.js', () => ({
  query: mocks.rawQuery,
}))

vi.mock('../services/projectHealthService.js', () => ({
  calculateProjectHealth: vi.fn(),
}))

vi.mock('../services/constructionCalendar.js', () => ({
  resolveConstructionCalendarContext: mocks.resolveConstructionCalendarContext,
}))

vi.mock('../services/criticalPathHelpers.js', () => ({
  getCriticalPathTaskIds: mocks.getCriticalPathTaskIds,
}))

vi.mock('../services/todoTouchpointService.js', () => ({
  buildAttentionSummary: mocks.buildAttentionSummary,
}))

vi.mock('../services/monthlyPlanSummaryService.js', () => ({
  getMonthlyPlanStatusSummary: mocks.getMonthlyPlanStatusSummary,
  getMonthlyPlanFulfillmentTrend: mocks.getMonthlyPlanFulfillmentTrend,
}))

vi.mock('../services/taskBaselineProjectionService.js', () => ({
  attachCurrentBaselineProjectionToTasks: mocks.attachCurrentBaselineProjectionToTasks,
}))

vi.mock('../middleware/logger.js', () => ({
  logger: mocks.logger,
}))

const { getAllProjectExecutionSummaries } = await import('../services/projectExecutionSummaryService.js')

describe('projectExecutionSummaryService monthly plan schema contract', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    const project = {
      id: 'project-1',
      name: 'Project One',
      company_id: 'company-1',
      status: 'active',
      planned_start_date: null,
      planned_end_date: null,
      start_date: null,
      end_date: null,
      health_score: 82,
      health_status: '健康',
    }
    const monthlyPlan = {
      id: 'monthly-plan-1',
      project_id: 'project-1',
      status: 'confirmed',
      month: '2026-06',
      closeout_at: null,
      created_at: '2026-06-01T00:00:00.000Z',
      updated_at: '2026-06-01T00:00:00.000Z',
      baseline_version_id: null,
      source_mode: 'schedule',
      temporary_without_baseline: false,
      pending_closeout_count: 0,
    }

    mocks.executeSQL.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM monthly_plans')) return [monthlyPlan]
      if (sql.includes('FROM projects')) return [project]
      if (sql.includes('FROM project_daily_snapshot')) return []
      if (sql.includes('FROM planning_governance_states')) return []
      if (sql.includes('FROM task_baselines')) return []
      if (sql.includes('FROM task_baseline_items')) return []
      return []
    })
    mocks.getProject.mockResolvedValue(project)
    mocks.getTasks.mockResolvedValue([])
    mocks.getRisks.mockResolvedValue([])
    mocks.getIssues.mockResolvedValue([])
    mocks.resolveConstructionCalendarContext.mockResolvedValue({ basis: 'test', windows: [] })
    mocks.getCriticalPathTaskIds.mockResolvedValue(new Set<string>())
    mocks.buildAttentionSummary.mockResolvedValue({ todayTodoCount: 0 })
    mocks.getMonthlyPlanStatusSummary.mockResolvedValue({
      confirmedCount: 1,
      closedCount: 0,
      pendingCloseoutCount: 0,
      temporaryWithoutBaselineCount: 0,
    })
    mocks.getMonthlyPlanFulfillmentTrend.mockResolvedValue([])
    mocks.attachCurrentBaselineProjectionToTasks.mockImplementation((rows) => rows)
  })

  it('fails closed instead of silently dropping the canonical pending closeout count column', async () => {
    const canonicalQuery = mocks.executeSQL.getMockImplementation() as (...args: any[]) => Promise<any>
    mocks.executeSQL.mockImplementation(async (...args: any[]) => {
      const sql = String(args[0] ?? '')
      if (sql.includes('pending_closeout_count FROM monthly_plans')) {
        throw new Error('column "pending_closeout_count" does not exist')
      }
      return canonicalQuery(...args)
    })

    await expect(getAllProjectExecutionSummaries({
      asOf: '2026-06-18T00:00:00.000Z',
      systemJob: true,
    })).rejects.toThrow('pending_closeout_count')

    expect(mocks.executeSQL).toHaveBeenCalledWith(expect.stringContaining('pending_closeout_count FROM monthly_plans'))
    expect(mocks.executeSQL.mock.calls.some(([sql]) => (
      String(sql).includes('temporary_without_baseline FROM monthly_plans')
      && !String(sql).includes('pending_closeout_count')
    ))).toBe(false)
  })

  it('limits company overview summary query fan-out so local dashboard reads do not exhaust the database pool', async () => {
    const project = {
      id: 'project-1',
      name: 'Project One',
      company_id: 'company-1',
      status: 'active',
      planned_start_date: null,
      planned_end_date: null,
      start_date: null,
      end_date: null,
      health_score: 82,
      health_status: '健康',
    }
    let activeQueries = 0
    let maxActiveQueries = 0

    mocks.executeSQL.mockImplementation(async (sql: string) => {
      activeQueries += 1
      maxActiveQueries = Math.max(maxActiveQueries, activeQueries)
      try {
        await new Promise((resolve) => setTimeout(resolve, 5))
        if (sql.includes('FROM projects')) return [project]
        return []
      } finally {
        activeQueries -= 1
      }
    })

    const summaries = await getAllProjectExecutionSummaries({
      asOf: '2026-06-18T00:00:00.000Z',
      mode: 'company_overview',
      systemJob: true,
    })

    expect(summaries).toHaveLength(1)
    expect(maxActiveQueries).toBeLessThanOrEqual(4)
  })

  it('pushes visible project ids into every company overview tenant query', async () => {
    await getAllProjectExecutionSummaries({
      projectIds: ['project-1'],
      asOf: '2026-06-18T00:00:00.000Z',
      mode: 'company_overview',
    })

    const tenantCalls = mocks.executeSQL.mock.calls
      .map(([sql, params]) => ({ sql: String(sql).replace(/\s+/g, ' ').trim(), params }))
      .filter(({ sql }) => /FROM (projects|tasks|risks|issues|task_conditions|task_dependencies|task_obstacles|monthly_plans|notifications|pre_milestones|acceptance_plans|construction_drawings)/i.test(sql))

    expect(tenantCalls.length).toBeGreaterThan(0)
    for (const call of tenantCalls) {
      expect(call.sql).toMatch(/WHERE (?:id|project_id) = ANY\(\?::uuid\[\]\)/i)
      expect(call.params).toEqual([['project-1']])
    }
  })

  it('rejects an unscoped all-project summary unless a system job opts in', async () => {
    await expect(getAllProjectExecutionSummaries({
      asOf: '2026-06-18T00:00:00.000Z',
    })).rejects.toThrow('projectIds are required outside an explicit system job')
  })
})
