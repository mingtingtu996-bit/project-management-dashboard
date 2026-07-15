import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  project: null as any,
  tasks: [] as any[],
  risks: [] as any[],
  issues: [] as any[],
  tableRows: {} as Record<string, any[]>,
  criticalTaskIds: new Set<string>(),
  dataQualitySummary: { confidence: { score: 0 } } as any,
  calendarMode: 'ready' as 'ready' | 'pending',
  taskReadMode: 'ready' as 'ready' | 'pending' | 'reject',
  riskReadMode: 'ready' as 'ready' | 'reject',
  issueReadMode: 'ready' as 'ready' | 'reject',
  projectListScopes: [] as Array<{ column: string; values: unknown[] }>,
}))

vi.mock('../services/dbService.js', () => ({
  getProject: vi.fn(async () => state.project),
  getTasks: vi.fn(async () => {
    if (state.taskReadMode === 'pending') return new Promise(() => {})
    if (state.taskReadMode === 'reject') throw new Error('dbService.getTasks direct query timed out after 12000ms')
    return state.tasks
  }),
  getRisks: vi.fn(async () => {
    if (state.riskReadMode === 'reject') throw new Error('dbService.getRisks read timed out')
    return state.risks
  }),
  getIssues: vi.fn(async () => {
    if (state.issueReadMode === 'reject') throw new Error('dbService.getIssues read timed out')
    return state.issues
  }),
  supabase: {
    from: vi.fn((table: string) => {
      const builder = {
        select: vi.fn(() => builder),
        eq: vi.fn(async () => ({ data: state.tableRows[table] ?? [], error: null })),
        in: vi.fn((column: string, values: unknown[]) => {
          state.projectListScopes.push({ column, values })
          return Promise.resolve({
            data: (state.tableRows[table] ?? []).filter((row) => values.includes(row[column])),
            error: null,
          })
        }),
        update: vi.fn(() => builder),
        then: (resolve: (value: { data: any[]; error: null }) => unknown) => (
          Promise.resolve(resolve({ data: state.tableRows[table] ?? [], error: null }))
        ),
      }
      return builder
    }),
  },
}))

vi.mock('../services/criticalPathHelpers.js', () => ({
  getCriticalPathTaskIds: vi.fn(async () => state.criticalTaskIds),
}))

vi.mock('../services/constructionCalendar.js', () => ({
  resolveConstructionCalendarContext: vi.fn(async () => {
    if (state.calendarMode === 'pending') return new Promise(() => {})
    return {
      basis: 'calendar_day',
      windows: [],
    }
  }),
}))

vi.mock('../services/dataQualityService.js', () => ({
  dataQualityService: {
    buildProjectSummary: vi.fn(async () => state.dataQualitySummary),
  },
}))

vi.mock('../middleware/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}))

describe('projectHealthService', () => {
  beforeEach(() => {
    state.project = {
      id: 'project-1',
      planned_start_date: null,
      planned_end_date: null,
      start_date: null,
      end_date: null,
    }
    state.tasks = []
    state.risks = []
    state.issues = []
    state.tableRows = {
      task_conditions: [],
      task_obstacles: [],
      project_materials: [],
      pre_milestones: [],
      acceptance_plans: [],
      construction_drawings: [],
      algorithm_seed_upgrade_candidates: [],
    }
    state.criticalTaskIds = new Set<string>()
    state.dataQualitySummary = { confidence: { score: 0 } }
    state.calendarMode = 'ready'
    state.taskReadMode = 'ready'
    state.riskReadMode = 'ready'
    state.issueReadMode = 'ready'
    state.projectListScopes = []
    process.env.PROJECT_HEALTH_OPTIONAL_READ_TIMEOUT_MS = '5'
  })

  it('limits batch health refresh to the caller-visible project ids', async () => {
    state.tableRows.projects = [
      { id: 'project-1' },
      { id: 'project-2' },
    ]
    const { updateAllProjectsHealth } = await import('../services/projectHealthService.js')

    const updatedCount = await updateAllProjectsHealth(['project-1'])

    expect(updatedCount).toBe(1)
    expect(state.projectListScopes).toContainEqual({
      column: 'id',
      values: ['project-1'],
    })
  })

  it('does not mint high health metric scores when no project execution data exists', async () => {
    const { calculateProjectHealth } = await import('../services/projectHealthService.js')

    const result = await calculateProjectHealth('project-1')

    expect(result.score).toBe(0)
    expect(result.details).toMatchObject({
      progressDeliveryScore: 0,
      taskExecutionScore: 0,
      milestoneDeliveryScore: 0,
      riskControlScore: 0,
      dataTrustScore: 0,
      metricAvailability: {
        progressDeliveryScore: false,
        taskExecutionScore: false,
        milestoneDeliveryScore: false,
        riskControlScore: false,
        dataTrustScore: true,
      },
    })
    expect(result.details.capReasons).toEqual(expect.arrayContaining([
      '缺少可评估任务',
      '缺少里程碑或专项目标',
      '缺少任务或风险异常信号',
    ]))
  })

  it('returns consumable health details when construction calendar resolution hangs', async () => {
    state.calendarMode = 'pending'
    state.tasks = [
      {
        id: 'task-1',
        project_id: 'project-1',
        title: 'foundation work',
        status: 'in_progress',
        progress: 50,
        is_milestone: false,
        planned_start_date: '2026-06-01',
        planned_end_date: '2026-06-20',
      },
    ]
    state.dataQualitySummary = { confidence: { score: 50 } }
    const { calculateProjectHealth } = await import('../services/projectHealthService.js')

    const result = await Promise.race([
      calculateProjectHealth('project-1'),
      new Promise<'timed-out'>((resolve) => setTimeout(() => resolve('timed-out'), 80)),
    ])

    expect(result).not.toBe('timed-out')
    expect(result).toEqual(expect.objectContaining({
      score: expect.any(Number),
      details: expect.objectContaining({
        businessHealthScore: expect.any(Number),
        metricAvailability: expect.any(Object),
        capReasons: expect.arrayContaining([
          expect.stringContaining('施工日历'),
        ]),
      }),
    }))
  })

  it('returns degraded low-confidence health details when main task reads hang', async () => {
    state.taskReadMode = 'pending'
    state.dataQualitySummary = { confidence: { score: 10 } }
    const { calculateProjectHealth } = await import('../services/projectHealthService.js')

    const result = await Promise.race([
      calculateProjectHealth('project-1'),
      new Promise<'timed-out'>((resolve) => setTimeout(() => resolve('timed-out'), 80)),
    ])

    expect(result).not.toBe('timed-out')
    expect(result).toEqual(expect.objectContaining({
      score: expect.any(Number),
      details: expect.objectContaining({
        businessHealthScore: expect.any(Number),
        capReasons: expect.arrayContaining([
          expect.stringContaining('任务'),
        ]),
      }),
    }))
    expect((result as Awaited<ReturnType<typeof calculateProjectHealth>>).score).toBeLessThanOrEqual(40)
    expect((result as Awaited<ReturnType<typeof calculateProjectHealth>>).details).not.toBeNull()
  })

  it('marks progress and milestone metrics unavailable instead of using default high scores', async () => {
    state.tasks = [
      {
        id: 'task-1',
        project_id: 'project-1',
        title: '主体结构',
        status: 'in_progress',
        progress: 10,
        is_milestone: false,
        assignee_name: '张工',
      },
    ]
    state.dataQualitySummary = { confidence: { score: 25 } }
    const { calculateProjectHealth } = await import('../services/projectHealthService.js')

    const result = await calculateProjectHealth('project-1')

    expect(result.details.progressDeliveryScore).toBe(0)
    expect(result.details.milestoneDeliveryScore).toBe(0)
    expect(result.details.taskExecutionScore).toBe(90)
    expect(result.details.riskControlScore).toBe(100)
    expect(result.details.metricAvailability).toMatchObject({
      progressDeliveryScore: false,
      taskExecutionScore: true,
      milestoneDeliveryScore: false,
      riskControlScore: true,
    })
  })

  it('normalizes health weights over available metrics so missing factors are not scored as zero before caps', async () => {
    state.tasks = [
      {
        id: 'task-1',
        project_id: 'project-1',
        title: 'in-progress task without schedule window or milestone target',
        status: 'in_progress',
        progress: 10,
        is_milestone: false,
        assignee_name: 'legacy owner',
      },
    ]
    state.dataQualitySummary = { confidence: { score: 25 } }
    const { calculateProjectHealth } = await import('../services/projectHealthService.js')

    const result = await calculateProjectHealth('project-1')

    expect(result.details.metricAvailability).toMatchObject({
      progressDeliveryScore: false,
      executionStabilityScore: true,
      criticalTargetScore: false,
      businessExceptionScore: true,
      planGovernanceScore: true,
    })
    expect(result.details.scoreBeforeCaps).toBe(85)
    expect(result.score).toBe(65)
    expect(result.status).toBe(result.details.healthStatus)
  })

  it('caps planned but unstarted projects so no bad events are not treated as healthy progress', async () => {
    state.tasks = [
      {
        id: 'task-1',
        project_id: 'project-1',
        title: '未来启动任务',
        status: 'todo',
        progress: 0,
        planned_start_date: '2099-04-01',
        planned_end_date: '2099-04-30',
        is_milestone: false,
        participant_unit_id: 'unit-1',
      },
      {
        id: 'milestone-1',
        project_id: 'project-1',
        title: '未来控制节点',
        status: 'todo',
        progress: 0,
        planned_start_date: '2099-04-01',
        planned_end_date: '2099-04-30',
        is_milestone: true,
        participant_unit_id: 'unit-1',
      },
    ]
    state.dataQualitySummary = { confidence: { score: 90 } }
    const { calculateProjectHealth } = await import('../services/projectHealthService.js')

    const result = await calculateProjectHealth('project-1')

    expect(result.details.overallProgress).toBe(0)
    expect(result.details.plannedProgress).toBe(0)
    expect(result.details.scoreBeforeCaps).toBeGreaterThanOrEqual(80)
    expect(result.score).toBeLessThanOrEqual(60)
    expect(result.details.businessHealthScore).toBe(result.score)
    expect(result.details.capReasons).toEqual(expect.arrayContaining([
      '项目未开始，暂无实际推进证据',
    ]))
    expect(result.details.summary).toContain('暂无实际推进证据')
  })

  it('counts only stable responsibility ids as owner coverage in task execution health', async () => {
    state.tasks = [
      {
        id: 'task-1',
        project_id: 'project-1',
        title: 'stable unit task',
        status: 'in_progress',
        progress: 10,
        is_milestone: false,
        participant_unit_id: 'unit-1',
      },
      {
        id: 'task-2',
        project_id: 'project-1',
        title: 'legacy text only task',
        status: 'in_progress',
        progress: 10,
        is_milestone: false,
        assignee_name: 'legacy owner',
        assignee_unit: 'legacy unit',
      },
    ]
    state.dataQualitySummary = { confidence: { score: 80 } }
    const { calculateProjectHealth } = await import('../services/projectHealthService.js')

    const result = await calculateProjectHealth('project-1')

    expect(result.details.taskExecutionScore).toBe(95)
  })

  it('marks data trust unavailable instead of using a local health fallback when data quality is missing', async () => {
    state.dataQualitySummary = null
    state.tasks = [
      {
        id: 'task-1',
        project_id: 'project-1',
        title: '主体结构',
        status: 'in_progress',
        progress: 60,
        planned_start_date: '2026-04-01',
        planned_end_date: '2026-05-01',
        is_milestone: false,
        assignee_name: '张工',
      },
    ]
    const { calculateProjectHealth } = await import('../services/projectHealthService.js')

    const result = await calculateProjectHealth('project-1')

    expect(result.details.dataTrustScore).toBe(0)
    expect(result.details.metricAvailability.dataTrustScore).toBe(false)
    expect(result.details.metricUnavailableReasons.dataTrustScore).toBe('数据质量服务暂不可用')
  })

  it('includes specialty readiness signals in health details, penalties, and caps', async () => {
    const overdueDate = '2026-04-01'
    const futureDate = '2099-04-01'
    state.tasks = [
      {
        id: 'task-1',
        project_id: 'project-1',
        title: '主体结构',
        status: 'in_progress',
        progress: 50,
        planned_start_date: '2026-01-01',
        planned_end_date: futureDate,
        is_milestone: false,
        assignee_name: '张工',
      },
      {
        id: 'milestone-1',
        project_id: 'project-1',
        title: '主体封顶',
        status: 'todo',
        progress: 0,
        planned_start_date: '2026-01-01',
        planned_end_date: futureDate,
        is_milestone: true,
        assignee_name: '张工',
      },
    ]
    state.tableRows.project_materials = [{
      id: 'material-1',
      expected_arrival_date: overdueDate,
      actual_arrival_date: null,
      record_status: 'active',
      lifecycle_status: 'pending',
    }]
    state.tableRows.pre_milestones = [{
      id: 'pre-1',
      status: 'pending',
      planned_finish_date: overdueDate,
      is_blocked: true,
    }]
    state.tableRows.acceptance_plans = [{
      id: 'acceptance-1',
      status: 'rectifying',
      planned_date: overdueDate,
    }]
    state.tableRows.construction_drawings = [{
      id: 'drawing-1',
      status: 'rejected',
      planned_pass_date: overdueDate,
      is_ready_for_construction: false,
    }]
    state.dataQualitySummary = { confidence: { score: 90 } }

    const { calculateProjectHealth } = await import('../services/projectHealthService.js')

    const result = await calculateProjectHealth('project-1')

    expect(result.details).toMatchObject({
      overdueMaterialCount: 1,
      blockedPreMilestoneCount: 1,
      failedAcceptancePlanCount: 1,
      drawingReworkCount: 1,
      externalReadinessSignalCount: 4,
    })
    expect(result.details.taskExecutionScore).toBeLessThan(100)
    expect(result.details.riskControlScore).toBeLessThan(100)
    expect(result.details.capReasons).toEqual(expect.arrayContaining([
      '1 项材料到货或验收逾期',
      '1 项前期证照受阻或逾期',
      '1 项验收未通过或受阻',
      '1 项图纸需返工或逾期',
    ]))
    expect(result.score).toBeLessThanOrEqual(75)
    expect(result.status).toBe(result.details.healthStatus)
  })

  it('surfaces candidate-only algorithm seed findings as explain-only signals without changing the health score', async () => {
    const futureDate = '2099-04-01'
    state.tasks = [
      {
        id: 'task-1',
        project_id: 'project-1',
        title: '主体结构',
        status: 'in_progress',
        progress: 50,
        planned_start_date: '2026-01-01',
        planned_end_date: futureDate,
        is_milestone: false,
        assignee_name: '张工',
      },
      {
        id: 'milestone-1',
        project_id: 'project-1',
        title: '主体封顶',
        status: 'todo',
        progress: 0,
        planned_start_date: '2026-01-01',
        planned_end_date: futureDate,
        is_milestone: true,
        assignee_name: '张工',
      },
    ]
    state.dataQualitySummary = { confidence: { score: 90 } }

    const { calculateProjectHealth } = await import('../services/projectHealthService.js')
    const baseline = await calculateProjectHealth('project-1')

    state.tableRows.algorithm_seed_upgrade_candidates = [{
      id: 'candidate-1',
      seed_type: 'site_capacity_pressure',
      stable_code: 'learned:site_capacity_pressure:project-1',
      status: 'candidate_only',
      action_policy: 'candidate_only',
      confidence_level: 'medium',
      candidate_payload: {
        actionPolicy: 'candidate_only',
        confidenceScore: 0.7,
        effectPolicy: {
          scoreEffect: 'none_until_curated',
        },
      },
      evidence_summary: {
        source: 'task_schedule_overlap',
      },
    }, {
      id: 'candidate-2',
      seed_type: 'regional_weather_pressure',
      stable_code: 'learned:regional_weather_pressure:project-1',
      status: 'pending_review',
      action_policy: 'manual_review',
      confidence_level: 'low',
      candidate_payload: {
        confidence_score: '0.42',
        effectPolicy: {
          scoreEffect: 'none_until_curated',
        },
      },
      evidence_summary: {
        source: 'regional_climate_seed',
      },
    }]

    const withCandidate = await calculateProjectHealth('project-1')

    expect(withCandidate.score).toBe(baseline.score)
    expect(withCandidate.details.algorithmSignals).toEqual([
      expect.objectContaining({
        source: 'algorithm_seed_upgrade_candidates',
        signalType: 'site_capacity_pressure',
        stableCode: 'learned:site_capacity_pressure:project-1',
        runtimePolicy: 'candidate_only',
        scoreImpact: 0,
        scorePolicy: 'explain_only_no_score_effect',
      }),
      expect.objectContaining({
        source: 'algorithm_seed_upgrade_candidates',
        signalType: 'regional_weather_pressure',
        stableCode: 'learned:regional_weather_pressure:project-1',
        runtimePolicy: 'manual_review',
        scoreImpact: 0,
        scorePolicy: 'explain_only_no_score_effect',
        confidenceScore: 0.42,
      }),
    ])
  })
})
