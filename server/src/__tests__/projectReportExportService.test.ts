import { describe, expect, it, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => ({
  getProjectExecutionSummary: vi.fn(),
  getProgressDeviationAnalysisOrThrow: vi.fn(),
  query: vi.fn(),
}))

vi.mock('../services/projectExecutionSummaryService.js', () => ({
  getProjectExecutionSummary: mocks.getProjectExecutionSummary,
}))

vi.mock('../services/progressDeviationService.js', () => ({
  getProgressDeviationAnalysisOrThrow: mocks.getProgressDeviationAnalysisOrThrow,
}))

vi.mock('../database.js', () => ({
  query: mocks.query,
}))

function makeSummary(overrides: Record<string, unknown> = {}) {
  return {
    id: 'project-1',
    name: '外立面改造项目',
    statusLabel: '进行中',
    plannedStartDate: '2026-04-01',
    plannedEndDate: '2026-04-30',
    overallProgress: 64,
    businessHealthScore: 82,
    healthStatus: 'healthy',
    delayedTaskCount: 3,
    delayDays: 7,
    activeRiskCount: 4,
    activeIssueCount: 1,
    pendingConditionCount: 2,
    activeObstacleCount: 1,
    totalMilestones: 5,
    completedMilestones: 2,
    milestoneProgress: 40,
    monthlyPlanFulfillmentRate: 78,
    monthlyPlanConfirmedCount: 2,
    monthlyPlanClosedCount: 1,
    monthlyPlanPendingCloseoutCount: 1,
    closeoutOverdueDays: 0,
    criticalPathAffectedTasks: 2,
    responsibilityCoverageRate: 91,
    keyNodeSummary: {
      total: 8,
      milestoneCount: 5,
      criticalPathCount: 2,
      dueSoonCount: 1,
      blockedCount: 2,
      highRiskCount: 1,
    },
    milestoneOverview: {
      stats: {
        total: 5,
        completed: 2,
        pending: 3,
        overdue: 1,
        upcomingSoon: 1,
        completionRate: 40,
      },
      items: [
        {
          id: 'm-1',
          name: '幕墙样板验收',
          statusLabel: '逾期',
          progress: 30,
          targetDate: '2026-04-15',
          current_planned_date: '2026-04-16',
          actual_date: null,
        },
      ],
    },
    planningGovernance: {
      phase: 'formal_execution',
      phaseLabel: '正式执行',
      signals: [],
    },
    kpiComparisons: {
      weekly: {
        progress: { current: 64, previous: 60, delta: 4, periodLabel: '较上周', status: 'ready' },
        deviation: { current: 7, previous: 5, delta: 2, periodLabel: '较上周', status: 'ready' },
        risks: { current: 4, previous: 3, delta: 1, periodLabel: '较上周', status: 'ready' },
        todos: { current: 6, previous: 8, delta: -2, periodLabel: '较上周', status: 'ready' },
      },
    },
    ...overrides,
  }
}

function makeDeviation() {
  return {
    project_id: 'project-1',
    baseline_version_id: 'baseline-1',
    monthly_plan_version_id: 'monthly-1',
    summary: {
      total_items: 3,
      deviated_items: 2,
      carryover_items: 1,
      unresolved_items: 1,
      baseline_items: 1,
      monthly_plan_items: 1,
      execution_items: 1,
    },
    top_deviation_causes: [
      { reason: '上游任务未完成影响后续开工', count: 1, impact_days: 4, confidence: 92 },
    ],
    responsibility_contribution: [
      {
        owner: '总包单位A',
        owner_id: 'unit-a',
        count: 1,
        percentage: 50,
        impact_days: 4,
        priority_score: 8,
        basis: 'upstream_dependency',
        responsibility_role: 'accountable_subject',
        evidence_sources: ['task_duration_forecasts.metadata.forecastSources.dependencyPropagation'],
      },
      {
        owner: '专业分包B',
        owner_id: 'unit-b',
        count: 1,
        percentage: 50,
        impact_days: 2,
        priority_score: 2,
        basis: 'owner_scope',
        responsibility_role: 'execution_owner',
        evidence_sources: ['task_duration_forecasts.factor_summary'],
      },
    ],
    mainlines: [
      {
        key: 'execution',
        label: '执行偏差链路',
        summary: { total_items: 1, deviated_items: 1, delayed_items: 1, unresolved_items: 0 },
        rows: [
          {
            id: 'row-1',
            title: '外立面龙骨安装',
            status: 'delayed',
            deviation_days: 4,
            deviation_rate: 12,
            reason: '上游任务未完成影响后续开工',
            actual_date: '2026-04-20',
            attribution: {
              cause_chain: [
                {
                  cause_type: 'dependency_wait',
                  affected_task_id: 'task-b',
                  upstream_task_id: 'task-a',
                  impacted_owner: '专业分包B',
                  accountable_owner: '总包单位A',
                  responsibility_basis: 'upstream_dependency',
                  impact_days: 4,
                  confidence: 'high',
                  evidence_source: 'task_dependencies; task_duration_forecasts',
                },
              ],
            },
          },
        ],
      },
    ],
    rows: [],
  }
}

describe('projectReportExportService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getProjectExecutionSummary.mockResolvedValue(makeSummary())
    mocks.getProgressDeviationAnalysisOrThrow.mockResolvedValue(makeDeviation())
    mocks.query.mockResolvedValue({
      rows: [
        { id: 'baseline-1', version: 3, title: '执行基线 v3', status: 'confirmed', updated_at: '2026-04-01T00:00:00.000Z' },
      ],
    })
  })

  it('builds a real owner monthly XLSX workbook with summary and accountability sheets', async () => {
    const XLSX = await import('@e965/xlsx')
    const { buildOwnerMonthlyReportExport } = await import('../services/projectReportExportService.js')

    const result = await buildOwnerMonthlyReportExport({
      projectId: 'project-1',
      format: 'xlsx',
      period: '2026-04',
    })

    expect(result.contentType).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    expect(result.fileName).toContain('业主月报')
    expect(result.fileName).toContain('2026-04')
    expect(result.buffer.subarray(0, 2).toString('utf8')).toBe('PK')

    const workbook = XLSX.read(result.buffer, { type: 'buffer' })
    expect(workbook.SheetNames).toEqual(expect.arrayContaining(['业主月报概览', '偏差与归责']))
    const overviewRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets['业主月报概览'])
    const accountabilityRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets['偏差与归责'])
    expect(JSON.stringify(overviewRows)).toContain('外立面改造项目')
    expect(JSON.stringify(accountabilityRows)).toContain('总包单位A')
    expect(JSON.stringify(accountabilityRows)).toContain('upstream_dependency')
  })

  it('builds a real current report XLSX workbook for the selected report view', async () => {
    const XLSX = await import('@e965/xlsx')
    const { buildProjectReportExport } = await import('../services/projectReportExportService.js')

    const result = await buildProjectReportExport({
      projectId: 'project-1',
      format: 'xlsx',
      view: 'progress_deviation',
    })

    expect(result.contentType).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    expect(result.fileName).toContain('偏差分析')
    expect(result.buffer.subarray(0, 2).toString('utf8')).toBe('PK')

    const workbook = XLSX.read(result.buffer, { type: 'buffer' })
    expect(workbook.SheetNames).toEqual(expect.arrayContaining(['报表概览', '偏差与归责', '原因链证据']))
    const overviewRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets['报表概览'])
    const causeChainRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets['原因链证据'])
    expect(JSON.stringify(overviewRows)).toContain('外立面改造项目')
    expect(JSON.stringify(causeChainRows)).toContain('总包单位A')
    expect(JSON.stringify(causeChainRows)).toContain('task_dependencies; task_duration_forecasts')
  })

  it('builds a real current report PDF attachment', async () => {
    const { buildProjectReportExport } = await import('../services/projectReportExportService.js')

    const result = await buildProjectReportExport({
      projectId: 'project-1',
      format: 'pdf',
      view: 'progress_deviation',
    })

    expect(result.contentType).toBe('application/pdf')
    expect(result.fileName).toContain('偏差分析')
    expect(result.buffer.subarray(0, 5).toString('utf8')).toBe('%PDF-')
    expect(result.buffer.length).toBeGreaterThan(1000)
  }, 60_000)

  it('builds a real owner monthly PDF attachment', async () => {
    const { buildOwnerMonthlyReportExport } = await import('../services/projectReportExportService.js')

    const result = await buildOwnerMonthlyReportExport({
      projectId: 'project-1',
      format: 'pdf',
      period: '2026-04',
    })

    expect(result.contentType).toBe('application/pdf')
    expect(result.fileName).toContain('业主月报')
    expect(result.fileName).toContain('2026-04')
    expect(result.buffer.subarray(0, 5).toString('utf8')).toBe('%PDF-')
    expect(result.buffer.length).toBeGreaterThan(1000)
  }, 60_000)

  it('rejects unsupported export formats', async () => {
    const { normalizeReportExportFormat } = await import('../services/projectReportExportService.js')

    expect(() => normalizeReportExportFormat('json')).toThrow(/unsupported/i)
  })
})
