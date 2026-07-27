/**
 * Duration suggestion end-to-end simulation test.
 *
 * Simulates realistic construction project scenarios and calls the actual
 * algorithm through mocked database layers to verify output accuracy.
 *
 * Two scenarios:
 *   A) Project not yet started — new tasks created during planning phase
 *   B) Project already running — new tasks added mid-execution
 */

import { beforeAll, describe, expect, it, vi } from 'vitest'

// ─── Mock infrastructure ───────────────────────────────────────────────────────

const mocks = vi.hoisted(() => {
  let currentTable = ''

  const state = {
    engineeringObjectsData: [] as any[],
    taskRows: [] as any[],
    benchmarkRows: [] as any[],
    overrideRows: [] as any[],
  }

  const filters: Array<{ field: string; op: string; value: any }> = []

  const query: any = {
    select: vi.fn(() => query),
    eq: vi.fn((field: string, value: any) => { filters.push({ field, op: 'eq', value }); return query }),
    is: vi.fn((field: string, value: any) => { filters.push({ field, op: 'is', value }); return query }),
    in: vi.fn((field: string, value: any) => { filters.push({ field, op: 'in', value }); return query }),
    not: vi.fn((field: string, op: string, value: any) => { filters.push({ field, op: `not_${op}`, value }); return query }),
    gte: vi.fn(() => query),
    lte: vi.fn(() => query),
    order: vi.fn(() => query),
    limit: vi.fn(() => query),
    maybeSingle: vi.fn(async () => {
      if (currentTable === 'duration_benchmarks') {
        const row = state.benchmarkRows[0] ?? null
        return { data: row, error: null }
      }
      if (currentTable === 'duration_suggestion_overrides') {
        return { data: state.overrideRows[0] ?? null, error: null }
      }
      return { data: null, error: null }
    }),
    then: vi.fn((resolve: (value: unknown) => unknown) => {
      let data: any[] = []
      if (currentTable === 'engineering_objects') data = state.engineeringObjectsData
      else if (currentTable === 'tasks') data = state.taskRows
      return Promise.resolve({ data, error: null }).then(resolve)
    }),
  }

  return {
    state,
    filters,
    query,
    from: vi.fn((tableName: string) => {
      currentTable = tableName
      filters.length = 0
      return query
    }),
    buildDurationContext: vi.fn(),
    expandTitleWeakStandardWorkSearchTextFromResolver: vi.fn(async (text: string) => text),
    describeDurationContributionModeFromResolver: vi.fn((mode: string) => {
      const labels: Record<string, string> = {
        embedded_check: '内嵌检查项，不单独承载施工工期',
        quality_gate: '质量门禁项，不按普通施工工期排期',
        external_wait: '外部等待项，等待周期由约束或验收规则处理',
        record_only: '资料记录项，不独立贡献计划工期',
        handover_marker: '移交节点项，作为节点或条件而非普通工期',
        duration_bearing: '施工承载工序，参与参考工期计算',
      }
      return labels[mode] ?? labels.duration_bearing
    }),
    inferTitleWeakScaleSignalFromResolver: vi.fn(async () => ({
      factor: 1,
      reason: null,
      source: 'title',
      confidence: 'low',
      signals: [],
    })),
    inferTitleWeakStandardWorkCodesFromResolver: vi.fn(async () => []),
    isDurationBearingContributionModeFromResolver: vi.fn((value: unknown) => {
      const normalized = String(value ?? '').trim().toLowerCase()
      return !normalized || normalized === 'duration_bearing'
    }),
    resolveDurationContributionModeFromResolver: vi.fn((value: unknown) => {
      const normalized = String(value ?? '').trim().toLowerCase()
      return [
        'duration_bearing',
        'embedded_check',
        'quality_gate',
        'external_wait',
        'record_only',
        'handover_marker',
      ].includes(normalized) ? normalized : null
    }),
    resolveStandardWorkDurationSeed: vi.fn(),
    loadPublishedProgressVelocityRuntime: vi.fn(),
    buildProjectHealthDeviationSummary: vi.fn(),
    getProjectCompanyId: vi.fn(),
    readPlanningReplayCalibrationReadback: vi.fn(),
  }
})

vi.mock('../services/dbService.js', () => ({ supabase: { from: mocks.from } }))
vi.mock('../auth/access.js', () => ({ getProjectCompanyId: mocks.getProjectCompanyId }))
vi.mock('../middleware/logger.js', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))
vi.mock('../services/durationContextService.js', async () => {
  const actual = await vi.importActual<typeof import('../services/durationContextService.js')>('../services/durationContextService.js')
  return { ...actual, buildDurationContext: mocks.buildDurationContext }
})
vi.mock('../services/algorithmSeedResolver.js', () => ({
  expandTitleWeakStandardWorkSearchTextFromResolver: mocks.expandTitleWeakStandardWorkSearchTextFromResolver,
  describeDurationContributionModeFromResolver: mocks.describeDurationContributionModeFromResolver,
  inferTitleWeakScaleSignalFromResolver: mocks.inferTitleWeakScaleSignalFromResolver,
  inferTitleWeakStandardWorkCodesFromResolver: mocks.inferTitleWeakStandardWorkCodesFromResolver,
  isDurationBearingContributionModeFromResolver: mocks.isDurationBearingContributionModeFromResolver,
  resolveDurationContributionModeFromResolver: mocks.resolveDurationContributionModeFromResolver,
  resolveStandardWorkDurationSeed: mocks.resolveStandardWorkDurationSeed,
}))
vi.mock('../services/progressVelocityRuntimePublicationService.js', () => ({
  loadPublishedProgressVelocityRuntime: mocks.loadPublishedProgressVelocityRuntime,
}))
vi.mock('../services/projectHealthDeviationSummaryService.js', () => ({
  buildProjectHealthDeviationSummary: mocks.buildProjectHealthDeviationSummary,
}))
vi.mock('../services/planningReplayCalibrationService.js', () => ({
  readPlanningReplayCalibrationReadback: mocks.readPlanningReplayCalibrationReadback,
}))

const { getTaskDurationSuggestion } = await import('../services/durationSuggestionService.js')

// ─── Helpers ───────────────────────────────────────────────────────────────────

function emptyContext() {
  return {
    contextVersion: 'v1.4.7.4',
    multiplier: 1,
    extraDays: 0,
    confidenceDelta: 0,
    rawConfidenceDelta: 0,
    adjustedBy: [],
    factors: [],
    businessReasons: [],
    hasLowConfidenceSignal: false,
    calculationContext: {
      duration_source: 'standard',
      adjusted_by: [],
      confidence_level: 'medium',
      factor_summary_available: false,
    },
  }
}

function seasonalContext(multiplier: number, reason: string) {
  return {
    ...emptyContext(),
    multiplier,
    extraDays: 0,
    confidenceDelta: -3,
    adjustedBy: ['seasonal_productivity'],
    factors: [{
      key: 'seasonal_productivity',
      label: '季节产能',
      multiplier,
      extraDays: 0,
      confidenceDelta: -3,
      actionPolicy: 'auto_apply',
      reason,
      source: 'v1.4.7.4_seed',
    }],
    businessReasons: [reason],
    calculationContext: {
      duration_source: 'standard',
      adjusted_by: ['seasonal_productivity'],
      confidence_level: 'medium',
      factor_summary_available: true,
    },
  }
}

function resetMocks() {
  vi.clearAllMocks()
  mocks.state.engineeringObjectsData = []
  mocks.state.taskRows = []
  mocks.state.benchmarkRows = []
  mocks.state.overrideRows = []
  mocks.query.maybeSingle.mockImplementation(async () => ({ data: null, error: null }))
  mocks.buildDurationContext.mockResolvedValue(emptyContext())
  mocks.expandTitleWeakStandardWorkSearchTextFromResolver.mockImplementation(async (t: string) => t)
  mocks.readPlanningReplayCalibrationReadback.mockResolvedValue(null)
  mocks.inferTitleWeakStandardWorkCodesFromResolver.mockResolvedValue([])
  mocks.resolveStandardWorkDurationSeed.mockResolvedValue(null)
  mocks.loadPublishedProgressVelocityRuntime.mockResolvedValue(null)
  mocks.buildProjectHealthDeviationSummary.mockResolvedValue({
    projectId: 'proj-1', healthScore: null, healthStatus: null,
    businessHealthScore: null, healthConfidenceScore: null,
    healthConfidenceFlag: 'unavailable', healthBasis: {},
    deviationSummary: {}, caliberVersion: 'legacy',
    generatedAt: '2026-06-01T00:00:00.000Z',
  })
  mocks.getProjectCompanyId.mockResolvedValue(null)
}

// ─── Scenario A: Project not yet started ───────────────────────────────────────

describe('Scenario A: Project not yet started — new tasks during planning', () => {
  beforeAll(() => resetMocks())

  it('A1: 标准抹灰工序，单栋楼，无特殊因素 → 应输出 seed P50', async () => {
    resetMocks()
    mocks.resolveStandardWorkDurationSeed.mockResolvedValue({
      __stableCode: 'plastering_interior', stableCode: 'plastering_interior',
      defaultDaysP50: 12, defaultDaysP80: 16, fixedDays: 2, variableDays: 10,
      confidence: 'medium', benchmarkBasis: '室内抹灰标准工面默认工期',
    })

    const r = await getTaskDurationSuggestion({
      projectId: 'proj-new-1', standardWorkCode: 'plastering_interior',
      taskTitle: '1#楼室内抹灰', wbsNodeType: 'process',
    })

    console.log(`A1 | 室内抹灰(单栋) | recommended=${r.recommendedDurationDays} conservative=${r.conservativeDurationDays} confidence=${r.confidenceLevel}(${r.confidenceScore}) source=${r.forecastSource}`)
    // Current E1 applies the cold-start/project execution context buffer to recommended days too.
    expect(r.recommendedDurationDays).toBe(14)
    // conservative = seed P80(16) + cold-start buffer(1.08x) → ceil(16*1.08)=18
    expect(r.conservativeDurationDays).toBe(18)
  })

  it('A2: 抹灰工序覆盖 4 栋楼 → 应做 coverage scale', async () => {
    resetMocks()
    mocks.resolveStandardWorkDurationSeed.mockResolvedValue({
      __stableCode: 'plastering_interior', stableCode: 'plastering_interior',
      defaultDaysP50: 12, defaultDaysP80: 16, fixedDays: 2, variableDays: 10,
      confidence: 'medium', benchmarkBasis: '室内抹灰标准工面默认工期',
    })

    const r = await getTaskDurationSuggestion({
      projectId: 'proj-new-1', standardWorkCode: 'plastering_interior',
      taskTitle: '1-4#楼室内抹灰', coveredBuildingIds: ['b1','b2','b3','b4'],
      wbsNodeType: 'process',
    })

    console.log(`A2 | 室内抹灰(4栋) | recommended=${r.recommendedDurationDays} conservative=${r.conservativeDurationDays} scaleFactor=${r.factorSummary?.scaleFactor} scaleBasis=${r.factorSummary?.scaleBasis}`)
    expect(r.recommendedDurationDays).toBeGreaterThan(12)
    expect(r.factorSummary?.scaleBasis).toBe('coverage')
  })

  it('A3: 混凝土浇筑(真实seed P50=4天)，标准层单次浇筑 → 应输出约4天', async () => {
    resetMocks()
    // 真实 seed: cast_in_place_concrete, P50=4, P80=7, fixed=1, variable=3
    mocks.resolveStandardWorkDurationSeed.mockResolvedValue({
      __stableCode: 'cast_in_place_concrete', stableCode: 'cast_in_place_concrete',
      defaultDaysP50: 4, defaultDaysP80: 7, fixedDays: 1, variableDays: 3,
      confidence: 'medium', benchmarkBasis: 'Concrete placement, vibration, finishing and test block baseline.',
    })

    const r = await getTaskDurationSuggestion({
      projectId: 'proj-new-1', standardWorkCode: 'cast_in_place_concrete',
      taskTitle: '3#楼5层混凝土浇筑', wbsNodeType: 'process',
    })

    // 单次标准层浇筑无规模放大，但当前 E1 仍叠加冷启动/项目执行上下文缓冲。
    console.log(`A3 | 混凝土浇筑(标准层) | recommended=${r.recommendedDurationDays} conservative=${r.conservativeDurationDays} confidence=${r.confidenceLevel}`)
    expect(r.recommendedDurationDays).toBe(5)
  })

  it('A4: 混凝土浇筑覆盖3栋楼 → coverage scale 后约5-6天', async () => {
    resetMocks()
    mocks.resolveStandardWorkDurationSeed.mockResolvedValue({
      __stableCode: 'cast_in_place_concrete', stableCode: 'cast_in_place_concrete',
      defaultDaysP50: 4, defaultDaysP80: 7, fixedDays: 1, variableDays: 3,
      confidence: 'medium', benchmarkBasis: 'Concrete placement, vibration, finishing and test block baseline.',
    })

    const r = await getTaskDurationSuggestion({
      projectId: 'proj-new-1', standardWorkCode: 'cast_in_place_concrete',
      taskTitle: '1-3#楼标准层混凝土浇筑', coveredBuildingIds: ['b1','b2','b3'],
      wbsNodeType: 'process',
    })

    // 3栋楼 → coverage factor 后再叠加冷启动/项目执行上下文缓冲。
    console.log(`A4 | 混凝土浇筑(3栋) | recommended=${r.recommendedDurationDays} conservative=${r.conservativeDurationDays} scaleFactor=${r.factorSummary?.scaleFactor}`)
    expect(r.recommendedDurationDays).toBeGreaterThanOrEqual(5)
    expect(r.recommendedDurationDays).toBeLessThanOrEqual(7)
  })

  it('A5: 梅雨季开工的防水工序 → 应叠加季节因子', async () => {
    resetMocks()
    mocks.resolveStandardWorkDurationSeed.mockResolvedValue({
      __stableCode: 'waterproof_roof', stableCode: 'waterproof_roof',
      defaultDaysP50: 8, defaultDaysP80: 11, fixedDays: 1, variableDays: 7,
      confidence: 'medium', benchmarkBasis: '屋面防水标准工面',
    })
    mocks.buildDurationContext.mockResolvedValue(seasonalContext(1.4, '计划日期命中梅雨季，按有效工日折算产能'))

    const r = await getTaskDurationSuggestion({
      projectId: 'proj-new-1', standardWorkCode: 'waterproof_roof',
      taskTitle: '屋面防水施工', plannedStartDate: '2026-06-15',
      wbsNodeType: 'process',
    })

    // base 8 * seasonal 1.4 plus current cold-start/project execution context buffer.
    console.log(`A5 | 屋面防水(梅雨季) | recommended=${r.recommendedDurationDays} conservative=${r.conservativeDurationDays} contextMultiplier=1.4`)
    expect(r.recommendedDurationDays).toBeGreaterThanOrEqual(11)
    expect(r.recommendedDurationDays).toBeLessThanOrEqual(13)
  })

  it('A6: 无分类信息的任务 → 应返回 unavailable', async () => {
    resetMocks()
    const r = await getTaskDurationSuggestion({
      projectId: 'proj-new-1', taskTitle: '临时协调工作',
    })

    console.log(`A6 | 无分类 | recommended=${r.recommendedDurationDays} confidence=${r.confidenceLevel} reason=${r.businessReasonCode}`)
    expect(r.recommendedDurationDays).toBeNull()
    expect(r.confidenceLevel).toBe('unavailable')
  })
})

// ─── Scenario B: Project already running ───────────────────────────────────────

describe('Scenario B: Project running 3 months — adding new tasks', () => {
  it('B1: 项目执行节奏偏慢(1.25x)，高置信度 → 推荐工期应上调', async () => {
    resetMocks()
    mocks.resolveStandardWorkDurationSeed.mockResolvedValue({
      __stableCode: 'rebar_installation', stableCode: 'rebar_installation',
      defaultDaysP50: 10, defaultDaysP80: 14, fixedDays: 2, variableDays: 8,
      confidence: 'medium', benchmarkBasis: '钢筋绑扎标准工面',
    })
    mocks.loadPublishedProgressVelocityRuntime.mockResolvedValue({
      durationRatio: 1.25, multiplier: 1.25,
      confidenceLevel: 'high', confidenceScore: 82,
      actionPolicy: 'auto_apply', sampleCount: 12, variance: 0.06,
      groupKey: 'standard_work:rebar_installation',
      excludedAnomalyTaskCount: 0,
      reason: '本项目同类钢筋工序平均超期 25%',
      metadata: { matchLevel: 'standard_work' },
    })

    const r = await getTaskDurationSuggestion({
      projectId: 'proj-running-1', engineeringCategoryId: 'cat-structure',
      standardWorkCode: 'rebar_installation', taskTitle: '3#楼标准层钢筋绑扎',
      wbsNodeType: 'process',
    })

    // high confidence auto_apply plus current cold-start/project execution context buffer.
    console.log(`B1 | 钢筋(节奏1.25x高置信) | recommended=${r.recommendedDurationDays} conservative=${r.conservativeDurationDays} source=${r.forecastSource}`)
    expect(r.recommendedDurationDays).toBe(15)
    expect(r.conservativeDurationDays).toBeGreaterThanOrEqual(16)
    expect(mocks.loadPublishedProgressVelocityRuntime).toHaveBeenCalledWith(expect.objectContaining({
      projectId: 'proj-running-1',
      consumerKey: 'durationSuggestionService.similar_task_rhythm',
    }))
  })

  it('B2: 项目执行节奏偏慢(1.2x)，中等置信度 → 推荐工期应部分上调', async () => {
    resetMocks()
    mocks.resolveStandardWorkDurationSeed.mockResolvedValue({
      __stableCode: 'formwork_standard', stableCode: 'formwork_standard',
      defaultDaysP50: 8, defaultDaysP80: 11, fixedDays: 1, variableDays: 7,
      confidence: 'medium', benchmarkBasis: '模板标准工面',
    })
    mocks.loadPublishedProgressVelocityRuntime.mockResolvedValue({
      durationRatio: 1.2, multiplier: 1.2,
      confidenceLevel: 'medium', confidenceScore: 65,
      actionPolicy: 'auto_apply', sampleCount: 6, variance: 0.12,
      groupKey: 'standard_work:formwork_standard',
      excludedAnomalyTaskCount: 0,
      reason: '本项目同类模板工序平均超期 20%',
      metadata: { matchLevel: 'standard_work', learningScope: 'project_plus_company' },
    })

    const r = await getTaskDurationSuggestion({
      projectId: 'proj-running-1', engineeringCategoryId: 'cat-structure',
      standardWorkCode: 'formwork_standard', taskTitle: '5#楼标准层模板',
      wbsNodeType: 'process',
    })

    // medium confidence partial: recommended = 8 * (1 + (1.2-1)*0.5) = 8 * 1.1 = 8.8 → 9
    console.log(`B2 | 模板(节奏1.2x中置信) | recommended=${r.recommendedDurationDays} conservative=${r.conservativeDurationDays} partialMultiplier=${r.businessReasonParams?.similarTaskRecommendedMultiplier}`)
    expect(r.recommendedDurationDays).toBeGreaterThanOrEqual(9)
    expect(r.recommendedDurationDays).toBeLessThanOrEqual(10)
  })

  it('B3: 项目有 6 条已完成任务平均超期 30%，无同类 velocity → 环境缓冲生效', async () => {
    resetMocks()
    mocks.resolveStandardWorkDurationSeed.mockResolvedValue({
      __stableCode: 'masonry_wall', stableCode: 'masonry_wall',
      defaultDaysP50: 14, defaultDaysP80: 18, fixedDays: 2, variableDays: 12,
      confidence: 'medium', benchmarkBasis: '砌体标准工面',
    })
    // 6 tasks: planned 10 days each, actual 13 days each → ratio 1.3
    mocks.state.taskRows = Array.from({ length: 6 }, (_, i) => ({
      id: `done-${i}`, project_id: 'proj-running-1',
      planned_start_date: '2026-03-01', planned_end_date: '2026-03-10',
      actual_start_date: '2026-03-01', actual_end_date: '2026-03-13',
      progress: 100, status: 'completed',
    }))

    const r = await getTaskDurationSuggestion({
      projectId: 'proj-running-1', engineeringCategoryId: 'cat-masonry',
      standardWorkCode: 'masonry_wall', taskTitle: '2#楼填充墙砌筑',
      wbsNodeType: 'process',
    })

    // ratio=1.3, rhythmMultiplier=clamp(1.3, 1, 1.2)=1.2, extraDays=min(5, ceil(14*(1.2-1)*0.65))=min(5,2)=2
    // recommended should be adjusted upward, conservative should include buffer
    console.log(`B3 | 砌体(环境缓冲) | recommended=${r.recommendedDurationDays} conservative=${r.conservativeDurationDays} envMultiplier=${r.businessReasonParams?.multiplier} envExtraDays=${r.businessReasonParams?.extraDays}`)
    expect(r.recommendedDurationDays).toBeGreaterThanOrEqual(14)
    expect(r.conservativeDurationDays).toBeGreaterThan(18)
  })

  it('B4: 项目健康度 55 分 → 保守工期应按高风险预留', async () => {
    resetMocks()
    mocks.resolveStandardWorkDurationSeed.mockResolvedValue({
      __stableCode: 'mep_rough_in', stableCode: 'mep_rough_in',
      defaultDaysP50: 15, defaultDaysP80: 20, fixedDays: 3, variableDays: 12,
      confidence: 'medium', benchmarkBasis: '机电粗装标准工面',
    })
    mocks.buildProjectHealthDeviationSummary.mockResolvedValue({
      projectId: 'proj-running-1', healthScore: 55, healthStatus: 'at_risk',
      businessHealthScore: 55, healthConfidenceScore: 78,
      healthConfidenceFlag: 'medium', healthBasis: {},
      deviationSummary: {}, caliberVersion: 'v1.4.19',
      generatedAt: '2026-06-01T00:00:00.000Z',
    })

    const r = await getTaskDurationSuggestion({
      projectId: 'proj-running-1', engineeringCategoryId: 'cat-mep',
      standardWorkCode: 'mep_rough_in', taskTitle: '6#楼机电预埋',
      wbsNodeType: 'process',
    })

    // health < 60 → multiplier 1.3, extraDays = min(5, ceil(15*(1.3-1)*0.65)) = min(5, 3) = 3
    // conservative = max(20, ceil(20*1.3), 20+3) = max(20, 26, 23) = 26
    console.log(`B4 | 机电(健康度55) | recommended=${r.recommendedDurationDays} conservative=${r.conservativeDurationDays} healthMultiplier=${r.businessReasonParams?.healthBandMultiplier}`)
    expect(r.recommendedDurationDays).toBe(17)
    expect(r.conservativeDurationDays).toBeGreaterThanOrEqual(23)
    expect(r.businessReasonParams?.healthBandMultiplier).toBe(1.3)
  })

  it('B5: 已发布节奏参数 + 环境缓冲同时存在 → 环境缓冲应被衰减', async () => {
    resetMocks()
    mocks.resolveStandardWorkDurationSeed.mockResolvedValue({
      __stableCode: 'plastering_exterior', stableCode: 'plastering_exterior',
      defaultDaysP50: 10, defaultDaysP80: 14, fixedDays: 2, variableDays: 8,
      confidence: 'medium', benchmarkBasis: '外墙抹灰标准工面',
    })
    mocks.loadPublishedProgressVelocityRuntime.mockResolvedValue({
      durationRatio: 1.2, multiplier: 1.2,
      confidenceLevel: 'high', confidenceScore: 80,
      actionPolicy: 'auto_apply', sampleCount: 10, variance: 0.07,
      groupKey: 'standard_work:plastering_exterior',
      excludedAnomalyTaskCount: 0,
      reason: '本项目同类外墙抹灰工序平均超期 20%',
      metadata: { matchLevel: 'standard_work' },
    })
    // Environment: 8 tasks, ratio 1.25 each
    mocks.state.taskRows = Array.from({ length: 8 }, (_, i) => ({
      id: `env-${i}`, project_id: 'proj-running-1',
      planned_start_date: '2026-02-01', planned_end_date: '2026-02-08',
      actual_start_date: '2026-02-01', actual_end_date: '2026-02-10',
      progress: 100, status: 'completed',
    }))

    const r = await getTaskDurationSuggestion({
      projectId: 'proj-running-1', engineeringCategoryId: 'cat-finishing',
      standardWorkCode: 'plastering_exterior', taskTitle: '1#楼外墙抹灰',
      wbsNodeType: 'process',
    })

    console.log(`B5 | 外墙抹灰(velocity+环境) | recommended=${r.recommendedDurationDays} conservative=${r.conservativeDurationDays} envDampened=${r.businessReasonParams?.environmentDampenedBySimilarTaskRhythm} effectiveEnvMult=${r.businessReasonParams?.effectiveEnvironmentMultiplier}`)
    // Velocity is applied and environment stays dampened because velocity already captures the slowness.
    expect(r.recommendedDurationDays).toBe(15)
    expect(r.businessReasonParams?.environmentDampenedBySimilarTaskRhythm).toBe(true)
  })

  it('B6: 有公司级 benchmark 30 条样本 → 应融合到推荐工期', async () => {
    resetMocks()
    mocks.getProjectCompanyId.mockResolvedValue('company-1')
    mocks.query.maybeSingle.mockResolvedValue({
      data: {
        id: 'benchmark-company-plastering',
        benchmark_version: 'simulation-v1',
        company_id: 'company-1',
        project_id: null,
        duration_day_basis: 'construction_production_day',
        p50_days: 6,
        p75_days: 9,
        p80_days: 11,
        mean_days: 7,
        sample_count: 30,
        confidence_level: 'high',
        confidence_score: 85,
        generated_at: '2026-07-01T08:00:00.000Z',
        source_window_start: '2026-04-01T00:00:00.000Z',
        source_as_of: '2026-06-30T23:59:59.000Z',
        metadata: { calendar_ref: 'calendar-1', calendar_version: 'calendar-v1' },
      },
      error: null,
    })
    mocks.resolveStandardWorkDurationSeed.mockResolvedValue({
      __stableCode: 'plastering_exterior', __resolverSource: 'active_seed',
      stableCode: 'plastering_exterior',
      defaultDaysP50: 10, defaultDaysP80: 14, fixedDays: 2, variableDays: 8,
      confidence: 'medium', benchmarkBasis: '外墙抹灰标准工面',
    })

    const r = await getTaskDurationSuggestion({
      projectId: 'proj-running-1', standardWorkCode: 'plastering_exterior',
      taskTitle: '外墙抹灰', wbsNodeType: 'process',
    })

    // benchmark p50=6, seed p50=10, blend weight ~0.7 for 30 samples → blended ≈ 6*0.7 + 10*0.3 = 7.2 → 8
    console.log(`B6 | 外墙抹灰(公司benchmark) | recommended=${r.recommendedDurationDays} conservative=${r.conservativeDurationDays} blendWeight=${r.businessReasonParams?.companyBenchmarkBlendWeight}`)
    expect(r.recommendedDurationDays).toBeLessThan(10)
    expect(r.businessReasonParams?.companyBenchmarkBlendWeight).toBeGreaterThan(0)
  })
})

// ─── Scenario C: 普通基坑工程完整工序链 ────────────────────────────────────────

describe('Scenario C: 普通基坑工程（灌注桩支护+土方开挖）各工序参考工期', () => {
  it('C1-C7: 基坑工程主要工序参考工期一览', async () => {
    const seeds: Record<string, any> = {
      foundation_pit_bored_pile_support: {
        __stableCode: 'foundation_pit_bored_pile_support', stableCode: 'foundation_pit_bored_pile_support',
        defaultDaysP50: 22, defaultDaysP80: 36, fixedDays: 3, variableDays: 19,
        confidence: 'medium', benchmarkBasis: '灌注桩支护+冠梁+桩间处理+检测+监测移交',
      },
      foundation_pit_internal_strut: {
        __stableCode: 'foundation_pit_internal_strut', stableCode: 'foundation_pit_internal_strut',
        defaultDaysP50: 16, defaultDaysP80: 28, fixedDays: 3, variableDays: 13,
        confidence: 'medium', benchmarkBasis: '内支撑安装+预应力+监测',
      },
      deep_foundation_support_dewatering: {
        __stableCode: 'deep_foundation_support_dewatering', stableCode: 'deep_foundation_support_dewatering',
        defaultDaysP50: 24, defaultDaysP80: 36, fixedDays: 3, variableDays: 21,
        confidence: 'medium', benchmarkBasis: '降水井施工+抽水+水位观测',
      },
      earthwork_excavation_transport: {
        __stableCode: 'earthwork_excavation_transport', stableCode: 'earthwork_excavation_transport',
        defaultDaysP50: 14, defaultDaysP80: 22, fixedDays: 1, variableDays: 13,
        confidence: 'medium', benchmarkBasis: '土方开挖+外运',
      },
      cast_in_place_concrete: {
        __stableCode: 'cast_in_place_concrete', stableCode: 'cast_in_place_concrete',
        defaultDaysP50: 4, defaultDaysP80: 7, fixedDays: 1, variableDays: 3,
        confidence: 'medium', benchmarkBasis: '混凝土浇筑+振捣+收面+试块',
      },
      concrete_curing_wait: {
        __stableCode: 'concrete_curing_wait', stableCode: 'concrete_curing_wait',
        defaultDaysP50: 7, defaultDaysP80: 14, fixedDays: 7, variableDays: 0,
        confidence: 'medium', benchmarkBasis: '混凝土养护+等强+试块送检',
      },
      cast_in_place_rebar: {
        __stableCode: 'cast_in_place_rebar', stableCode: 'cast_in_place_rebar',
        defaultDaysP50: 6, defaultDaysP80: 10, fixedDays: 1, variableDays: 5,
        confidence: 'medium', benchmarkBasis: '钢筋加工+绑扎+验收',
      },
    }

    const cases = [
      { code: 'foundation_pit_bored_pile_support', title: '灌注桩围护施工', desc: '围护桩' },
      { code: 'foundation_pit_internal_strut', title: '第一道混凝土支撑', desc: '内支撑' },
      { code: 'deep_foundation_support_dewatering', title: '基坑降水', desc: '降水' },
      { code: 'earthwork_excavation_transport', title: '基坑土方开挖', desc: '土方' },
      { code: 'cast_in_place_rebar', title: '底板钢筋绑扎', desc: '底板钢筋' },
      { code: 'cast_in_place_concrete', title: '底板混凝土浇筑', desc: '底板浇筑' },
      { code: 'concrete_curing_wait', title: '底板混凝土养护', desc: '养护等强' },
    ]

    console.log('\n=== 普通基坑工程（灌注桩支护）各工序参考工期 ===\n')
    console.log('工序'.padEnd(16) + '推荐(天)'.padEnd(10) + '保守(天)'.padEnd(10) + '置信度'.padEnd(10) + 'seed P50'.padEnd(10) + '说明')
    console.log('-'.repeat(80))

    let totalRecommended = 0
    let totalConservative = 0

    for (const c of cases) {
      resetMocks()
      mocks.resolveStandardWorkDurationSeed.mockResolvedValue(seeds[c.code])

      const r = await getTaskDurationSuggestion({
        projectId: 'proj-pit-1', standardWorkCode: c.code,
        taskTitle: c.title, wbsNodeType: 'process',
      })

      const seedP50 = seeds[c.code].defaultDaysP50
      totalRecommended += r.recommendedDurationDays ?? 0
      totalConservative += r.conservativeDurationDays ?? 0

      console.log(
        c.desc.padEnd(16) +
        String(r.recommendedDurationDays ?? '-').padEnd(10) +
        String(r.conservativeDurationDays ?? '-').padEnd(10) +
        `${r.confidenceLevel}(${r.confidenceScore})`.padEnd(10) +
        String(seedP50).padEnd(10) +
        (r.recommendedDurationDays !== seedP50 ? `(含冷启动缓冲)` : '')
      )

      // 基本合理性检查
      expect(r.recommendedDurationDays).toBeGreaterThanOrEqual(seedP50)
      expect(r.conservativeDurationDays).toBeGreaterThanOrEqual(r.recommendedDurationDays!)
    }

    console.log('-'.repeat(80))
    console.log(
      '合计(串行)'.padEnd(16) +
      String(totalRecommended).padEnd(10) +
      String(totalConservative).padEnd(10) +
      ''.padEnd(10) +
      ''.padEnd(10) +
      '注：实际有并行，总工期应短于串行之和'
    )
    console.log('\n实际工程参考：普通灌注桩基坑(深度8-12m)总工期约60-90天')
    console.log(`算法串行合计：推荐${totalRecommended}天 / 保守${totalConservative}天`)
    console.log('考虑降水与土方并行、钢筋与模板搭接，实际关键路径约70-80%串行合计\n')
  })
})
