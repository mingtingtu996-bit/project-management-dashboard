import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  let currentTable = ''
  const state = {
    engineeringObjectsData: [] as any[],
    projectsData: [] as any[],
    taskRows: [] as any[],
    coldStartBaselinesData: [] as any[],
    insertCalls: [] as Array<{ table: string; row: Record<string, unknown> }>,
    currentFilters: [] as Array<{ op: 'eq' | 'is'; key: string; value: unknown }>,
    queryFilters: [] as Array<{ table: string; op: 'eq' | 'is'; key: string; value: unknown }>,
  }
  const query: any = {
    select: vi.fn(() => query),
    eq: vi.fn((key: string, value: unknown) => {
      state.currentFilters.push({ op: 'eq', key, value })
      state.queryFilters.push({ table: currentTable, op: 'eq', key, value })
      return query
    }),
    is: vi.fn((key: string, value: unknown) => {
      state.currentFilters.push({ op: 'is', key, value })
      state.queryFilters.push({ table: currentTable, op: 'is', key, value })
      return query
    }),
    in: vi.fn(() => query),
    not: vi.fn(() => query),
    maybeSingle: vi.fn(async () => ({
      data: currentTable === 'projects'
        ? state.projectsData[0] ?? null
        : null,
      error: null,
    })),
    insert: vi.fn(async (row: Record<string, unknown>) => {
      state.insertCalls.push({ table: currentTable, row })
      return { data: [row], error: null }
    }),
    then: vi.fn((resolve: (value: unknown) => unknown) => Promise.resolve({
      data: currentTable === 'engineering_objects'
        ? state.engineeringObjectsData
        : currentTable === 'tasks'
          ? state.taskRows
          : currentTable === 'algorithm_cold_start_baselines'
            ? state.coldStartBaselinesData
          : [],
      error: null,
    }).then(resolve)),
  }
  return {
    state,
    query,
    from: vi.fn((tableName: string) => {
      currentTable = tableName
      state.currentFilters = []
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
    inferTitleWeakScaleSignalFromResolver: vi.fn(async (text: string) => {
      if (/1\s*#.*3\s*#/.test(text)) {
        return { factor: 1.15, reason: '标题显示覆盖约 3 栋楼', source: 'title', confidence: 'low', signals: ['buildingRange=3'] }
      }
      return { factor: 1, reason: null, source: 'title', confidence: 'low', signals: [] }
    }),
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
    recordDurationAccuracyPrediction: vi.fn(),
    loadAlgorithmAssetLearnableParameterRuntimeValue: vi.fn(),
    readPlanningReplayCalibrationReadback: vi.fn(),
    loadCurrentCauseSegment: vi.fn(),
    rawQuery: vi.fn(async () => ({ rows: [] })),
    executeSQL: vi.fn(async () => []),
    getTask: vi.fn(),
  }
})

vi.mock('../database.js', () => ({
  query: mocks.rawQuery,
}))

vi.mock('../services/dbService.js', () => ({
  supabase: {
    from: mocks.from,
  },
  getTask: mocks.getTask,
  executeSQL: mocks.executeSQL,
}))

vi.mock('../auth/access.js', () => ({
  getProjectCompanyId: mocks.getProjectCompanyId,
}))

vi.mock('../middleware/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

vi.mock('../services/durationContextService.js', async () => {
  const actual = await vi.importActual<typeof import('../services/durationContextService.js')>('../services/durationContextService.js')
  return {
    ...actual,
    buildDurationContext: mocks.buildDurationContext,
  }
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

vi.mock('../services/durationAlgorithmAccuracyService.js', () => ({
  recordDurationAccuracyPrediction: mocks.recordDurationAccuracyPrediction,
}))

vi.mock('../services/algorithmAssetLearnableParameterRuntimeConsumptionService.js', () => ({
  loadAlgorithmAssetLearnableParameterRuntimeValue: mocks.loadAlgorithmAssetLearnableParameterRuntimeValue,
}))

vi.mock('../services/planningReplayCalibrationService.js', () => ({
  readPlanningReplayCalibrationReadback: mocks.readPlanningReplayCalibrationReadback,
}))

vi.mock('../services/durationBenchmarkCauseSegmentService.js', () => ({
  loadCurrentCauseSegment: mocks.loadCurrentCauseSegment,
}))

const {
  buildDurationBenchmarkRowFromRuntimePublication,
  getTaskDurationSuggestion,
  recordCommittedDurationSuggestionPredictionEvidence,
  recordDurationSuggestionRuntimeConsumption,
  selectCauseAwareBenchmarkCandidates,
} = await import('../services/durationSuggestionService.js')

function createRecordingQueryExec() {
  const calls: Array<{ sql: string, params: unknown[] }> = []
  const queryExec = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> => {
    calls.push({ sql, params })
    return [] as T[]
  }
  return { calls, queryExec }
}

describe('committed duration suggestion prediction evidence', () => {
  it('records exact task and runtime publication lineage and fails closed when persistence does not return a row', async () => {
    expect(recordCommittedDurationSuggestionPredictionEvidence).toBeTypeOf('function')
    if (typeof recordCommittedDurationSuggestionPredictionEvidence !== 'function') return

    const input = {
      companyId: '10000000-0000-4000-8000-000000000001',
      projectId: '00000000-0000-4000-8000-000000000001',
      taskId: '20000000-0000-4000-8000-000000000001',
      generationBatchId: 'generation-batch-1',
      standardWorkCode: 'SW-CONCRETE',
      plannedStartDate: '2026-07-01',
      plannedEndDate: '2026-07-08',
      recommendedDurationDays: 8,
      forecastSource: 'duration_learning_project',
      confidenceLevel: 'high',
      confidenceScore: 88,
      runtimeApplications: [{
        assetKey: 'base_duration_benchmark',
        publicationKey: 'duration_learning_runtime:base_duration_benchmark:project-1',
        artifactKey: 'SW-CONCRETE:process:all',
        scopeLevel: 'project',
        industryKey: null,
        inputTaskIds: ['20000000-0000-4000-8000-000000000001'],
      }],
    } as const
    mocks.recordDurationAccuracyPrediction.mockResolvedValueOnce({ id: 'prediction-1' })

    await expect(recordCommittedDurationSuggestionPredictionEvidence(input)).resolves.toEqual(
      expect.objectContaining({ id: 'prediction-1' }),
    )
    expect(mocks.recordDurationAccuracyPrediction).toHaveBeenCalledWith(expect.objectContaining({
      engineCode: 'standard_duration_reference',
      projectId: input.projectId,
      taskId: input.taskId,
      predictedDurationDays: 8,
      predictionContext: expect.objectContaining({
        companyId: input.companyId,
        generationBatchId: input.generationBatchId,
        runtimePublicationKeys: ['duration_learning_runtime:base_duration_benchmark:project-1'],
        runtimeApplications: input.runtimeApplications,
      }),
    }))

    await expect(recordCommittedDurationSuggestionPredictionEvidence({
      ...input,
      runtimeApplications: input.runtimeApplications.map(({ scopeLevel: _scopeLevel, ...application }) => application),
    } as never)).rejects.toThrow('committed_duration_prediction_lineage_invalid')

    await expect(recordCommittedDurationSuggestionPredictionEvidence({
      ...input,
      runtimeApplications: [
        ...input.runtimeApplications,
        { ...input.runtimeApplications[0], scopeLevel: 'industry', industryKey: null },
      ],
    })).rejects.toThrow('committed_duration_prediction_lineage_invalid')

    mocks.recordDurationAccuracyPrediction.mockResolvedValueOnce(null)
    await expect(recordCommittedDurationSuggestionPredictionEvidence(input)).rejects.toThrow(
      'duration_accuracy_prediction_not_persisted',
    )
  })
})

function callsForTable(calls: Array<{ sql: string, params: unknown[] }>, tableName: string) {
  return calls.filter((call) => call.sql.toLowerCase().includes(tableName))
}

function emptyContext() {
  return {
    contextVersion: 'v1.4.7.4',
    multiplier: 1,
    extraDays: 0,
    confidenceDelta: 0,
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

function hasCurrentFilter(key: string, value: unknown, op: 'eq' | 'is' = 'eq') {
  return mocks.state.currentFilters.some((filter) => filter.op === op && filter.key === key && filter.value === value)
}

function currentBenchmarkKey() {
  return mocks.state.currentFilters.find((filter) => filter.op === 'eq' && filter.key === 'benchmark_key')?.value
}

function isDurationBenchmarkQuery() {
  return mocks.from.mock.calls.at(-1)?.[0] === 'duration_benchmarks'
}

function isProjectBenchmarkScope(projectId = 'project-1') {
  return isDurationBenchmarkQuery() && hasCurrentFilter('project_id', projectId)
}

function isCompanyBenchmarkScope(companyId = 'company-1') {
  return isDurationBenchmarkQuery()
    && hasCurrentFilter('company_id', companyId)
    && hasCurrentFilter('project_id', null, 'is')
}

function isGlobalBenchmarkScope() {
  return isDurationBenchmarkQuery()
    && hasCurrentFilter('company_id', null, 'is')
    && hasCurrentFilter('project_id', null, 'is')
}

function completePersistedBenchmark(overrides: Record<string, unknown> = {}) {
  return {
    id: 'benchmark-1',
    benchmark_version: 'v7',
    company_id: 'company-1',
    project_id: null,
    duration_day_basis: 'construction_production_day',
    p50_days: 6,
    p75_days: 8,
    p80_days: 10,
    mean_days: 7,
    variance: 0.2,
    coefficient_of_variation: 0.063888,
    sample_count: 24,
    confidence_level: 'high',
    confidence_score: 88,
    generated_at: '2026-07-01T08:00:00.000Z',
    source_window_start: '2026-04-01T00:00:00.000Z',
    source_as_of: '2026-06-30T23:59:59.000Z',
    metadata: { calendar_ref: 'calendar-1', calendar_version: 'calendar-v3' },
    ...overrides,
  }
}

function completeRuntimeBenchmarkPayload(overrides: Record<string, unknown> = {}) {
  return {
    benchmarkId: 'runtime-benchmark-1',
    benchmarkVersion: 'runtime-v7',
    p50Days: 6,
    p75Days: 8,
    p80Days: 10,
    meanDays: 7,
    variance: 0.2,
    coefficientOfVariation: 0.063888,
    sampleCount: 24,
    confidenceLevel: 'high',
    confidenceScore: 88,
    durationDayBasis: 'construction_production_day',
    generatedAt: '2026-07-01T08:00:00.000Z',
    sourceWindowStart: '2026-04-01T00:00:00.000Z',
    sourceAsOf: '2026-06-30T23:59:59.000Z',
    calendarRef: 'calendar-1',
    calendarVersion: 'calendar-v3',
    ...overrides,
  }
}

const serviceSourcePath = fileURLToPath(new URL('../services/durationSuggestionService.ts', import.meta.url))

describe('durationSuggestionService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.query.select.mockImplementation(() => mocks.query)
    mocks.query.maybeSingle.mockImplementation(async () => ({
      data: mocks.from.mock.calls.at(-1)?.[0] === 'projects'
        ? mocks.state.projectsData[0] ?? null
        : null,
      error: null,
    }))
    mocks.state.engineeringObjectsData = []
    mocks.state.projectsData = []
    mocks.state.taskRows = []
    mocks.state.coldStartBaselinesData = []
    mocks.state.insertCalls = []
    mocks.state.queryFilters = []
    mocks.buildDurationContext.mockResolvedValue(emptyContext())
    mocks.expandTitleWeakStandardWorkSearchTextFromResolver.mockImplementation(async (text: string) => text)
    mocks.inferTitleWeakScaleSignalFromResolver.mockImplementation(async (text: string) => {
      if (/1\s*#.*3\s*#/.test(text)) {
        return { factor: 1.15, reason: '标题显示覆盖约 3 栋楼', source: 'title', confidence: 'low', signals: ['buildingRange=3'] }
      }
      return { factor: 1, reason: null, source: 'title', confidence: 'low', signals: [] }
    })
    mocks.inferTitleWeakStandardWorkCodesFromResolver.mockResolvedValue([])
    mocks.resolveStandardWorkDurationSeed.mockResolvedValue(null)
    mocks.loadPublishedProgressVelocityRuntime.mockResolvedValue(null)
    mocks.buildProjectHealthDeviationSummary.mockResolvedValue({
      projectId: 'project-1',
      healthScore: null,
      healthStatus: null,
      businessHealthScore: null,
      healthConfidenceScore: null,
      healthConfidenceFlag: 'unavailable',
      healthBasis: {},
      deviationSummary: {},
      caliberVersion: 'legacy',
      generatedAt: '2026-05-17T00:00:00.000Z',
    })
    mocks.loadAlgorithmAssetLearnableParameterRuntimeValue.mockResolvedValue({
      status: 'runtime_parameter_not_found',
      runtimeConsumable: false,
      parameterKey: 'duration.benchmark_blend_weight',
      runtimeValue: null,
      publicationKey: null,
      publicationStatus: null,
      scopeLevel: null,
      companyId: null,
      projectId: null,
      rollbackTarget: null,
      reasons: ['runtime_parameter_publication_not_found'],
      writesSeedRuntimeDirectly: false,
    })
    mocks.readPlanningReplayCalibrationReadback.mockResolvedValue(null)
    mocks.loadCurrentCauseSegment.mockResolvedValue(null)
    mocks.getProjectCompanyId.mockResolvedValue(null)
    mocks.getTask.mockResolvedValue(null)
  })

  it('keeps runtime consumer evidence production persistence on a fixed SQL executor', () => {
    const source = readFileSync(serviceSourcePath, 'utf8')

    expect(source).not.toContain('buildDurationRuntimeConsumerObservationQueryExec')
    expect(source).not.toContain("import { query as rawQuery } from '../database.js'")
    expect(source).toContain('createDurationRuntimeConsumerObservationQueryExec')
  })

  it('returns unavailable instead of a default 7-day guess when core classification is missing', async () => {
    const suggestion = await getTaskDurationSuggestion({
      projectId: 'project-1',
      taskTitle: '临时任务',
    })

    expect(suggestion.recommendedDurationDays).toBeNull()
    expect(suggestion.confidenceLevel).toBe('unavailable')
    expect(suggestion.durationProvenance).toBe('unavailable')
    expect(suggestion.displaySummary).toContain('暂无参考工期')
    expect(suggestion.dataMaturity).toBe('L0')
    expect(mocks.resolveStandardWorkDurationSeed).not.toHaveBeenCalled()
  })

  it('returns data_pending instead of using legacy fallback duration for new task reference', async () => {
    const suggestion = await getTaskDurationSuggestion({
      projectId: 'project-1',
      standardWorkCode: 'plastering_wall_ceiling',
      taskTitle: '外墙抹灰',
      wbsNodeType: 'process',
    })

    expect(suggestion.recommendedDurationDays).toBeNull()
    expect(suggestion.confidenceLevel).toBe('data_pending')
    expect(suggestion.businessReasonCode).toBe('CATEGORY_HAS_NO_SEED')
    expect(suggestion.durationProvenance).toBe('unavailable')
  })

  it('routes new task references through the shared algorithm fact context as static-dominant', async () => {
    const suggestion = await getTaskDurationSuggestion({
      suggestionPurpose: 'new_task_reference',
      projectId: 'project-1',
      standardWorkCode: '02-01-03-P04',
      taskTitle: 'main structure package',
      wbsNodeType: 'process',
      projectTypeCode: 'residential',
      structureTypeCode: 'cast_in_place',
      methodVariantCodes: ['cast_in_place'],
      projectGenerationFacts: {
        businessType: 'residential',
        deliveryStandard: 'rough_finish',
        totalAreaM2: 180000,
        basementAreaM2: 42000,
        highestBuildingFloorCount: 26,
        basementLevelCount: 2,
        foundationDepthM: 11,
        buildingPatternCodes: ['high_rise_core_and_floor_cycle'],
        externalInterfaceCodes: ['permanent_power'],
      },
      progress: 45,
    })

    expect(suggestion.calculationContext?.algorithm_fact_context).toEqual(expect.objectContaining({
      phase: 'new_task_reference',
      primaryLayer: 'projectGenerationFacts',
      projectFactsRole: 'primary',
      runtimeFactsRole: 'background',
    }))
    expect(suggestion.calculationContext?.algorithm_fact_context).toEqual(expect.objectContaining({
      projectGenerationFactKeys: expect.arrayContaining([
        'businessType',
        'deliveryStandard',
        'totalAreaM2',
        'basementAreaM2',
        'highestBuildingFloorCount',
        'basementLevelCount',
        'foundationDepthM',
        'buildingPatternCodes',
        'externalInterfaceCodes',
        'structureTypeCode',
        'methodVariantCodes',
      ]),
    }))
    expect(suggestion.durationOutputCode).toBe('contextual_reference')
    expect(suggestion.contextualReferenceDays).toBe(suggestion.recommendedDurationDays)
  })

  it('blocks summary-level tasks from receiving a process seed duration', async () => {
    const suggestion = await getTaskDurationSuggestion({
      projectId: 'project-1',
      standardWorkCode: '02-01-03-P04',
      taskTitle: 'main structure package',
      wbsNodeType: 'summary',
    })

    expect(suggestion.recommendedDurationDays).toBeNull()
    expect(suggestion.confidenceLevel).toBe('data_pending')
    expect(suggestion.businessReasonCode).toBe('TASK_GRANULARITY_TOO_COARSE')
    expect(suggestion.factorAvailability?.task_granularity_guard).toBe(true)
    expect(mocks.resolveStandardWorkDurationSeed).not.toHaveBeenCalled()
  })

  it('does not guess base days when title weak recognition returns multiple standard works', async () => {
    mocks.inferTitleWeakStandardWorkCodesFromResolver.mockResolvedValue(['03-02-01-P02', '03-03-01-P04'])

    const suggestion = await getTaskDurationSuggestion({
      projectId: 'project-1',
      engineeringCategoryId: 'category-1',
      taskTitle: 'wall waterproof and plastering',
      wbsNodeType: 'process',
    })

    expect(suggestion.recommendedDurationDays).toBeNull()
    expect(suggestion.confidenceLevel).toBe('data_pending')
    expect(suggestion.businessReasonCode).toBe('STANDARD_WORK_MATCH_UNCERTAIN')
    expect(suggestion.factorAvailability?.standard_work_match_guard).toBe(true)
    expect(mocks.resolveStandardWorkDurationSeed).not.toHaveBeenCalled()
  })

  it('blocks a duration seed when it conflicts with the explicit standard work code', async () => {
    mocks.resolveStandardWorkDurationSeed.mockResolvedValue({
      __stableCode: 'process_duration:03-03-01-P04',
      stableCode: 'process_duration:03-03-01-P04',
      standardWorkCodes: ['03-03-01-P04'],
      defaultDaysP50: 4,
      defaultDaysP80: 6,
      fixedDays: 1,
      variableDays: 3,
      confidence: 'high',
      benchmarkBasis: 'Exterior waterproof baseline.',
    })

    const suggestion = await getTaskDurationSuggestion({
      projectId: 'project-1',
      standardWorkCode: '03-02-01-P02',
      taskTitle: 'wall plastering',
      wbsNodeType: 'process',
    })

    expect(suggestion.recommendedDurationDays).toBeNull()
    expect(suggestion.confidenceLevel).toBe('data_pending')
    expect(suggestion.businessReasonCode).toBe('STANDARD_WORK_CODE_CONFLICT')
    expect(suggestion.businessReasonParams?.standardWorkCode).toBe('03-02-01-P02')
    expect(suggestion.factorAvailability?.standard_work_conflict_guard).toBe(true)
  })

  it('uses the standard work duration seed and keeps title-only scale proxy low-confidence', async () => {
    mocks.resolveStandardWorkDurationSeed.mockResolvedValue({
      __stableCode: 'plastering_wall_ceiling',
      stableCode: 'plastering_wall_ceiling',
      defaultDaysP50: 8,
      defaultDaysP80: 14,
      fixedDays: 1,
      variableDays: 7,
      confidence: 'medium',
      benchmarkBasis: 'Plastering default per work face.',
    })

    const suggestion = await getTaskDurationSuggestion({
      projectId: 'project-1',
      standardWorkCode: 'plastering_wall_ceiling',
      taskTitle: '1#楼-3#楼 外墙抹灰',
      wbsNodeType: 'process',
    })

    expect(suggestion.durationCalibrationSource).toBe('standard_work_duration_seed')
    expect(suggestion.durationProvenance).toBe('standard_work_duration_seed')
    expect(suggestion.recommendedDurationDays).toBe(11)
    expect(suggestion.conservativeDurationDays).toBe(17)
    expect(suggestion.businessReason).toContain('规模修正')
    expect(suggestion.displaySummary).toContain('参考 11 天')
    expect(suggestion.factorAvailability?.task_scale_proxy).toBe(true)
    expect(suggestion.factorSummary?.scaleFactor).toBeCloseTo(1.075, 3)
    expect(suggestion.factorSummary?.scaleBasis).toBe('title')
    expect(suggestion.factorSummary?.scaleConfidence).toBe('low')
    expect(suggestion.factorSummary?.scaleReason).toBe('标题显示覆盖约 3 栋楼')
    expect(suggestion.factorSummary?.scaleSignals).toContain('buildingRange=3')
    expect(suggestion.factorSummary?.scaleSignals).toContain('rawScaleFactor=1.15')
    expect(suggestion.factorSummary?.scaleSignals).toContain('scaleConfidenceWeight=0.5')
  })

  it('records a v1.4.22.4 prediction event for standard seed new-task reference durations', async () => {
    mocks.resolveStandardWorkDurationSeed.mockResolvedValue({
      __stableCode: 'plastering_wall_ceiling',
      __resolverSource: 'ts_seed_fallback',
      __seedVersion: 'v1.4.22-standard-duration-seed',
      stableCode: 'plastering_wall_ceiling',
      standardWorkCodes: ['plastering_wall_ceiling'],
      defaultDaysP50: 8,
      defaultDaysP80: 14,
      fixedDays: 1,
      variableDays: 7,
      confidence: 'medium',
      benchmarkBasis: 'Plastering default per work face.',
    })

    const suggestion = await getTaskDurationSuggestion({
      projectId: 'project-1',
      taskId: 'task-1',
      standardWorkCode: 'plastering_wall_ceiling',
      taskTitle: '外墙抹灰',
      wbsNodeType: 'process',
      templateNodeId: 'template-node-1',
      runtimeEvidenceMode: 'record',
    })

    expect(suggestion.recommendedDurationDays).toBe(10)
    expect(mocks.recordDurationAccuracyPrediction).toHaveBeenCalledWith(expect.objectContaining({
      engineCode: 'standard_duration_reference',
      outputKind: 'new_task_reference_duration',
      projectId: 'project-1',
      taskId: 'task-1',
      predictedDurationDays: 10,
      runtimeConsumptionState: 'seed_only',
      seedLineage: expect.objectContaining({
        standardWorkDurationSeedVersion: 'v1.4.22-standard-duration-seed',
        standardWorkCodeSource: 'explicit_standard_work_code',
      }),
      networkLineage: expect.objectContaining({
        wbsTemplateVersion: 'template-node:template-node-1',
      }),
      predictionContext: expect.objectContaining({
        sourceService: 'durationSuggestionService',
        forecastSource: expect.stringContaining('standard_work_duration_seed'),
      }),
    }))
  })

  it('scopes persisted task context reads to the requested project', async () => {
    await getTaskDurationSuggestion({
      projectId: 'project-1',
      taskId: 'task-1',
      standardWorkCode: '02-01-03-P04',
      taskTitle: 'main structure package',
      wbsNodeType: 'process',
    })

    expect(mocks.state.queryFilters).toContainEqual({
      table: 'tasks',
      op: 'eq',
      key: 'project_id',
      value: 'project-1',
    })
  })

  it('hydrates persisted task identity through the environment-aware task reader when REST has no row', async () => {
    mocks.getTask.mockResolvedValue({
      id: 'task-1',
      project_id: 'project-1',
      title: 'active standard task',
      status: 'in_progress',
      progress: 30,
      wbs_node_type: 'process',
      standard_work_code: '02-01-03-P04',
      standard_work_name: 'main structure',
    })
    mocks.resolveStandardWorkDurationSeed.mockResolvedValue({
      __stableCode: 'process_duration:02-01-03-P04',
      __resolverSource: 'ts_seed_fallback',
      __seedVersion: 'v1.4.22-standard-duration-seed',
      stableCode: 'process_duration:02-01-03-P04',
      standardWorkCodes: ['02-01-03-P04'],
      defaultDaysP50: 8,
      defaultDaysP80: 12,
      fixedDays: 1,
      variableDays: 7,
      confidence: 'medium',
      benchmarkBasis: 'Main structure baseline.',
    })

    const suggestion = await getTaskDurationSuggestion({
      projectId: 'project-1',
      taskId: 'task-1',
      suggestionPurpose: 'new_task_reference',
      runtimeEvidenceMode: 'no_write',
    })

    expect(mocks.getTask).toHaveBeenCalledWith('task-1')
    expect(mocks.resolveStandardWorkDurationSeed).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        standardWorkCode: '02-01-03-P04',
      }),
    )
    expect(suggestion.durationCalibrationSource).toBe('standard_work_duration_seed')
    expect(suggestion.recommendedDurationDays).toBeGreaterThan(0)
  })

  it('keeps baseline impact recalculation no-write by suppressing prediction and runtime evidence writes', async () => {
    const { calls, queryExec } = createRecordingQueryExec()
    mocks.resolveStandardWorkDurationSeed.mockResolvedValue({
      __stableCode: 'plastering_wall_ceiling',
      __resolverSource: 'ts_seed_fallback',
      __seedVersion: 'v1.4.22-standard-duration-seed',
      stableCode: 'plastering_wall_ceiling',
      standardWorkCodes: ['plastering_wall_ceiling'],
      defaultDaysP50: 8,
      defaultDaysP80: 14,
      fixedDays: 1,
      variableDays: 7,
      confidence: 'medium',
      benchmarkBasis: 'Plastering default per work face.',
    })

    const suggestion = await getTaskDurationSuggestion({
      projectId: 'project-1',
      taskId: 'task-1',
      standardWorkCode: 'plastering_wall_ceiling',
      taskTitle: 'plastering',
      wbsNodeType: 'process',
      runtimeEvidenceMode: 'no_write',
      runtimeConsumerObservationQueryExec: queryExec,
    })

    expect(suggestion.recommendedDurationDays).toBe(10)
    expect(mocks.recordDurationAccuracyPrediction).not.toHaveBeenCalled()
    expect(calls.some((call) => /\b(insert|update|delete)\b/i.test(call.sql))).toBe(false)
  })

  it('records construction organization plan-network publication lineage on E1 reference prediction events', async () => {
    mocks.resolveStandardWorkDurationSeed.mockResolvedValue({
      __stableCode: 'plastering_wall_ceiling',
      __resolverSource: 'ts_seed_fallback',
      __seedVersion: 'v1.4.22-standard-duration-seed',
      stableCode: 'plastering_wall_ceiling',
      standardWorkCodes: ['plastering_wall_ceiling'],
      defaultDaysP50: 8,
      defaultDaysP80: 14,
      fixedDays: 1,
      variableDays: 7,
      confidence: 'medium',
      benchmarkBasis: 'Plastering default per work face.',
    })

    await getTaskDurationSuggestion({
      projectId: 'project-1',
      taskId: 'task-1',
      standardWorkCode: 'plastering_wall_ceiling',
      taskTitle: '外墙抹灰',
      wbsNodeType: 'process',
      templateNodeId: 'template-node-1',
      runtimeEvidenceMode: 'record',
      projectGenerationFacts: {
        businessType: 'residential',
        constructionOrganizationScenario: {
          source: 'construction_organization_scenario_selector',
          planNetworkPublication: {
            assetKey: 'construction_organization_plan_network',
            publicationKey: 'construction-org-plan-network-release:project-1',
          },
        },
      },
    })

    expect(mocks.recordDurationAccuracyPrediction).toHaveBeenCalledWith(expect.objectContaining({
      engineCode: 'standard_duration_reference',
      predictionContext: expect.objectContaining({
        assetKey: 'construction_organization_plan_network',
        publicationKey: 'construction-org-plan-network-release:project-1',
        runtimePublicationKey: 'construction-org-plan-network-release:project-1',
        constructionOrganizationPlanNetwork: expect.objectContaining({
          assetKey: 'construction_organization_plan_network',
          publicationKey: 'construction-org-plan-network-release:project-1',
        }),
      }),
      networkLineage: expect.objectContaining({
        assetKey: 'construction_organization_plan_network',
        publicationKey: 'construction-org-plan-network-release:project-1',
      }),
    }))
  })

  it('records project-metadata construction organization lineage for ordinary task-scoped E1 references', async () => {
    mocks.state.projectsData = [{
      id: 'project-1',
      metadata: {
        projectGenerationFacts: {
          businessType: 'residential',
          structureTypeCode: 'shear_wall',
        },
        constructionOrganizationScenario: {
          source: 'construction_organization_scenario_selector',
          planNetworkPublication: {
            assetKey: 'construction_organization_plan_network',
            publicationKey: 'construction-org-plan-network-release:project-1',
          },
        },
      },
    }]
    mocks.resolveStandardWorkDurationSeed.mockResolvedValue({
      __stableCode: 'plastering_wall_ceiling',
      __resolverSource: 'ts_seed_fallback',
      __seedVersion: 'v1.4.22-standard-duration-seed',
      stableCode: 'plastering_wall_ceiling',
      standardWorkCodes: ['plastering_wall_ceiling'],
      defaultDaysP50: 8,
      defaultDaysP80: 14,
      fixedDays: 1,
      variableDays: 7,
      confidence: 'medium',
      benchmarkBasis: 'Plastering default per work face.',
    })

    await getTaskDurationSuggestion({
      projectId: 'project-1',
      taskId: 'task-1',
      standardWorkCode: 'plastering_wall_ceiling',
      taskTitle: '外墙抹灰',
      wbsNodeType: 'process',
      templateNodeId: 'template-node-1',
      runtimeEvidenceMode: 'record',
    })

    expect(mocks.recordDurationAccuracyPrediction).toHaveBeenCalledWith(expect.objectContaining({
      engineCode: 'standard_duration_reference',
      predictionContext: expect.objectContaining({
        assetKey: 'construction_organization_plan_network',
        publicationKey: 'construction-org-plan-network-release:project-1',
        runtimePublicationKey: 'construction-org-plan-network-release:project-1',
        businessType: 'residential',
      }),
      networkLineage: expect.objectContaining({
        assetKey: 'construction_organization_plan_network',
        publicationKey: 'construction-org-plan-network-release:project-1',
        businessType: 'residential',
      }),
    }))
  })

  it('applies planning replay calibration readback to E1 reference durations as candidate-only overlay', async () => {
    mocks.resolveStandardWorkDurationSeed.mockResolvedValue({
      __stableCode: 'plastering_wall_ceiling',
      stableCode: 'plastering_wall_ceiling',
      standardWorkCodes: ['plastering_wall_ceiling'],
      defaultDaysP50: 8,
      defaultDaysP80: 12,
      fixedDays: 1,
      variableDays: 7,
      confidence: 'medium',
      benchmarkBasis: 'Plastering default per work face.',
    })
    mocks.readPlanningReplayCalibrationReadback.mockResolvedValue({
      status: 'ready',
      coarseProcessKey: 'plastering_wall_ceiling',
      evidenceRefs: ['planning_replay_calibration_events:event-1'],
      writePolicy: 'candidate_overlay_only_no_fact_mutation',
      acceptedSampleCount: 18,
      originalMae: 5.2,
      replayMae: 3.7,
      maeImprovement: 1.5,
      overcompensationRate: 0.08,
      e1DurationAdjustmentDays: 3,
      e2ResidualCorrectionDays: null,
      capacityBudgetFactor: null,
      priorityWeightAdjustment: null,
      e2TargetDiscountFactor: null,
      rejectedEvidence: [],
    })

    const suggestion = await getTaskDurationSuggestion({
      suggestionPurpose: 'new_task_reference',
      projectId: 'project-1',
      taskId: 'task-1',
      standardWorkCode: 'plastering_wall_ceiling',
      standardWorkName: '墙顶抹灰',
      taskTitle: '墙顶抹灰',
      wbsNodeType: 'process',
    })

    expect(mocks.readPlanningReplayCalibrationReadback).toHaveBeenCalledWith(expect.objectContaining({
      projectId: 'project-1',
      standardWorkCode: 'plastering_wall_ceiling',
      standardWorkName: '墙顶抹灰',
    }))
    expect(suggestion.recommendedDurationDays).toBe(13)
    expect(suggestion.conservativeDurationDays).toBe(16)
    expect(suggestion.forecastSource).toContain('planning_replay_calibration')
    expect(suggestion.factorAvailability?.planning_replay_calibration_readback).toBe(true)
    expect(suggestion.businessReasonParams).toMatchObject({
      planningReplayCalibrationAdjustmentDays: 3,
      planningReplayCalibrationWritePolicy: 'candidate_overlay_only_no_fact_mutation',
      planningReplayCalibrationEvidenceRefs: ['planning_replay_calibration_events:event-1'],
    })
    expect((suggestion.factorSummary?.calculationContext as any)?.planning_replay_calibration_readback).toMatchObject({
      applied: true,
      e1DurationAdjustmentDays: 3,
      writePolicy: 'candidate_overlay_only_no_fact_mutation',
      acceptedSampleCount: 18,
    })
  })

  it('defaults undeclared fixed days to a preparation slice before scale proxy', async () => {
    mocks.resolveStandardWorkDurationSeed.mockResolvedValue({
      __stableCode: 'large_area_finishing',
      stableCode: 'large_area_finishing',
      defaultDaysP50: 30,
      defaultDaysP80: 42,
      confidence: 'medium',
      benchmarkBasis: 'Large area finishing default.',
    })

    const suggestion = await getTaskDurationSuggestion({
      standardWorkCode: 'large_area_finishing',
      taskTitle: 'large area finishing',
      coveredBuildingIds: ['b1', 'b2', 'b3', 'b4', 'b5', 'b6', 'b7'],
      wbsNodeType: 'process',
    })

    expect(suggestion.recommendedDurationDays).toBe(63)
    expect(suggestion.factorSummary?.scaleFactor).toBeCloseTo(2.02, 2)
    expect(suggestion.factorSummary?.scaleBasis).toBe('coverage')
    expect(suggestion.factorSummary?.scaleSignals).toContain('rawScaleFactor=2.2')
    expect(suggestion.factorSummary?.scaleSignals).toContain('scaleConfidenceWeight=0.85')
  })

  it('does not return independent base days for non-duration-bearing standard work', async () => {
    mocks.resolveStandardWorkDurationSeed.mockResolvedValue({
      __stableCode: 'process_duration:survey-layout',
      stableCode: 'process_duration:survey-layout',
      defaultDaysP50: 1,
      defaultDaysP80: 2,
      fixedDays: 1,
      variableDays: 0,
      confidence: 'medium',
      durationContributionMode: 'embedded_check',
      benchmarkBasis: 'Survey layout is embedded in the parent process.',
    })

    const suggestion = await getTaskDurationSuggestion({
      projectId: 'project-1',
      standardWorkCode: 'survey-layout',
      taskTitle: '测量放线与标高复核',
      wbsNodeType: 'process',
    })

    expect(suggestion.recommendedDurationDays).toBeNull()
    expect(suggestion.conservativeDurationDays).toBeNull()
    expect(suggestion.businessReasonCode).toBe('NON_DURATION_BEARING_STANDARD_WORK')
    expect(suggestion.durationContributionMode).toBe('embedded_check')
    expect(suggestion.durationCalibrationSource).toBe('standard_work_duration_seed')
    expect(suggestion.durationProvenance).toBe('unavailable')
    expect(suggestion.displaySummary).toContain('暂无参考工期')
  })

  it('keeps ordinary aggregate parents from overriding standalone child process durations', async () => {
    mocks.resolveStandardWorkDurationSeed.mockResolvedValue({
      __stableCode: 'cast_in_place_concrete',
      stableCode: 'cast_in_place_concrete',
      standardWorkCodes: ['02-01-03'],
      defaultDaysP50: 4,
      defaultDaysP80: 7,
      fixedDays: 1,
      variableDays: 3,
      confidence: 'medium',
      benchmarkBasis: 'Concrete placement, vibration, finishing and test block baseline.',
      durationContributionMode: 'duration_bearing',
    })

    const suggestion = await getTaskDurationSuggestion({
      projectId: 'project-1',
      standardWorkCode: '02-01-03',
      taskTitle: '混凝土浇筑振捣和收面养护',
      wbsNodeType: 'process',
      parentStandardWorkCode: 'BDT-04-01-01',
      parentTaskTitle: '标准层主体结构流水施工',
      parentDurationBoundaryPolicy: 'aggregate_package_window',
      parentDurationPolicySource: 'template_itempack',
      parentReferenceDurationDays: 6,
    })

    expect(suggestion.recommendedDurationDays).toBe(5)
    expect(suggestion.businessReasonCodes).toEqual(expect.arrayContaining(['STANDARD_SEED_REFERENCE']))
    expect(suggestion.businessReasonCodes).not.toEqual(expect.arrayContaining(['PACKAGE_CHILD_DURATION_WINDOW']))
    expect(suggestion.businessReasonParams).not.toEqual(expect.objectContaining({
      parentStandardWorkCode: 'BDT-04-01-01',
      parentTaskTitle: '标准层主体结构流水施工',
      parentDurationBoundaryPolicy: 'aggregate_package_window',
      nonAdditiveWithParentDuration: true,
    }))
    expect(suggestion.factorAvailability).toEqual(expect.objectContaining({
      standard_work_duration_seed: true,
    }))
    expect(suggestion.factorAvailability?.parent_duration_boundary).not.toBe(true)
    expect(suggestion.durationBoundaryRole).not.toBe('package_child_window')
    expect(suggestion.planDurationTruthSource ?? null).toBeNull()
    expect(suggestion.displaySummary).toContain('5')
  })

  it('withholds standalone child duration when a hard parent package window has no child rhythm allocation', async () => {
    mocks.resolveStandardWorkDurationSeed.mockResolvedValue({
      __stableCode: 'cast_in_place_concrete',
      stableCode: 'cast_in_place_concrete',
      standardWorkCodes: ['02-01-03'],
      defaultDaysP50: 4,
      defaultDaysP80: 7,
      fixedDays: 1,
      variableDays: 3,
      confidence: 'medium',
      benchmarkBasis: 'Concrete placement, vibration, finishing and test block baseline.',
      durationContributionMode: 'duration_bearing',
    })

    const suggestion = await getTaskDurationSuggestion({
      projectId: 'project-1',
      standardWorkCode: '02-01-03',
      taskTitle: 'concrete pour',
      wbsNodeType: 'process',
      parentStandardWorkCode: 'SYS-STRUCTURE-PACK',
      parentTaskTitle: 'structure system package',
      parentDurationBoundaryPolicy: 'system_package_window',
      parentDurationPolicySource: 'template_duration_truth_asset',
      parentReferenceDurationDays: 6,
    })

    expect(suggestion.recommendedDurationDays).toBeNull()
    expect(suggestion.conservativeDurationDays).toBeNull()
    expect(suggestion.businessReasonCode).toBe('PACKAGE_CHILD_DURATION_WINDOW')
    expect(suggestion.independentReferenceDurationDays).toBe(5)
    expect(suggestion.packageChildPlanDurationDays).toBeNull()
    expect(suggestion.planDurationTruthSource).toBe('parent_package_window_pending_rhythm_allocation')
    expect(suggestion.businessReasonParams).toEqual(expect.objectContaining({
      parentDurationBoundaryPolicy: 'system_package_window',
      parentWindowApplied: true,
      noRhythmAllocation: true,
      independentReferenceDurationDays: 5,
      packageChildPlanDurationDays: null,
      nonAdditiveWithParentDuration: true,
    }))
    expect(suggestion.factorAvailability).toEqual(expect.objectContaining({
      parent_duration_boundary: true,
      package_child_duration_window: true,
      parent_package_window_plan_truth: true,
      package_child_rhythm_window_pending: true,
    }))
  })

  it('does not infer a parent package duration boundary from legacy floorRhythm metadata alone', async () => {
    mocks.query.maybeSingle
      .mockResolvedValueOnce({
        data: {
          id: 'task-1',
          project_id: 'project-1',
          title: 'concrete pour',
          wbs_node_type: 'process',
          standard_work_code: 'BDT-04-01-01-P07',
          standard_work_name: 'concrete pour',
          parent_id: 'parent-1',
          standard_task_metadata: {},
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: {
          id: 'parent-1',
          project_id: 'project-1',
          title: 'standard floor structure rhythm package',
          wbs_node_type: 'item_work',
          standard_work_code: 'BDT-04-01-01',
          standard_work_name: 'standard floor structure rhythm package',
          planned_start_date: '2026-06-01',
          planned_end_date: '2026-06-06',
          standard_task_metadata: {
            floorRhythm: {
              totalRhythmDurationDays: 6,
              rhythmPatternCode: 'legacy_floor_rhythm_only',
            },
          },
        },
        error: null,
      })
      .mockResolvedValue({ data: null, error: null })
    mocks.resolveStandardWorkDurationSeed.mockResolvedValue({
      __stableCode: 'standard_floor_concrete_pour',
      stableCode: 'standard_floor_concrete_pour',
      standardWorkCodes: ['BDT-04-01-01-P07'],
      defaultDaysP50: 4,
      defaultDaysP80: 7,
      fixedDays: 1,
      variableDays: 3,
      confidence: 'medium',
      benchmarkBasis: 'Concrete pour baseline.',
      durationContributionMode: 'duration_bearing',
    })

    const suggestion = await getTaskDurationSuggestion({ projectId: 'project-1', taskId: 'task-1' })

    expect(suggestion.recommendedDurationDays).toBe(5)
    expect(suggestion.businessReasonCodes).toEqual(expect.arrayContaining(['STANDARD_SEED_REFERENCE']))
    expect(suggestion.businessReasonCodes).not.toEqual(expect.arrayContaining(['PACKAGE_CHILD_DURATION_WINDOW']))
    expect(suggestion.parentDurationBoundaryPolicy ?? null).toBeNull()
    expect(suggestion.planDurationTruthSource ?? null).toBeNull()
    expect(suggestion.durationBoundaryRole).not.toBe('package_child_window')
    expect(suggestion.factorAvailability?.parent_duration_boundary).not.toBe(true)
  })

  it('restores package child window context from saved task metadata', async () => {
    mocks.query.maybeSingle
      .mockResolvedValueOnce({
        data: {
          id: 'task-1',
          project_id: 'project-1',
          title: '混凝土浇筑振捣和收面养护',
          wbs_node_type: 'process',
          standard_work_code: '02-01-03',
          standard_work_name: '混凝土浇筑',
          parent_id: 'parent-1',
          standard_task_metadata: {
            durationSuggestion: {
              businessReasonParams: {
                parentStandardWorkCode: 'BDT-04-01-01',
                parentTaskTitle: '标准层主体结构流水施工',
                parentDurationBoundaryPolicy: 'rhythm_package_window',
                parentDurationPolicySource: 'template_duration_truth_asset',
                parentReferenceDurationDays: 6,
                nonAdditiveWithParentDuration: true,
                packageChildPlanDurationDays: 1,
                rhythmWindowStartDay: 6,
                rhythmWindowEndDay: 6,
                rhythmWindowRole: 'concrete_pour',
              },
            },
          },
        },
        error: null,
      })
      .mockResolvedValue({ data: null, error: null })
    mocks.resolveStandardWorkDurationSeed.mockResolvedValue({
      __stableCode: 'cast_in_place_concrete',
      stableCode: 'cast_in_place_concrete',
      standardWorkCodes: ['02-01-03'],
      defaultDaysP50: 4,
      defaultDaysP80: 7,
      fixedDays: 1,
      variableDays: 3,
      confidence: 'medium',
      durationContributionMode: 'duration_bearing',
    })

    const suggestion = await getTaskDurationSuggestion({ projectId: 'project-1', taskId: 'task-1' })

    expect(suggestion.businessReasonCode).toBe('PACKAGE_CHILD_DURATION_WINDOW')
    expect(suggestion.businessReasonParams).toEqual(expect.objectContaining({
      parentDurationBoundaryPolicy: 'rhythm_package_window',
      parentDurationPolicySource: 'template_duration_truth_asset',
      nonAdditiveWithParentDuration: true,
    }))
    expect(suggestion.displaySummary).toContain('参考工期')
  })

  it('does not restore legacy saved parent-window context without a trusted asset source', async () => {
    mocks.query.maybeSingle
      .mockResolvedValueOnce({
        data: {
          id: 'task-1',
          project_id: 'project-1',
          title: 'concrete pour',
          wbs_node_type: 'process',
          standard_work_code: 'BDT-04-01-01-P07',
          standard_work_name: 'concrete pour',
          parent_id: 'parent-1',
          standard_task_metadata: {
            durationSuggestion: {
              businessReasonParams: {
                parentStandardWorkCode: 'BDT-04-01-01',
                parentTaskTitle: 'standard floor structure rhythm package',
                parentDurationBoundaryPolicy: 'rhythm_package_window',
                parentDurationPolicySource: 'legacy_untrusted_duration_source',
                parentReferenceDurationDays: 6,
                rhythmWindowStartDay: 6,
                rhythmWindowEndDay: 6,
                rhythmWindowRole: 'concrete_pour',
              },
            },
          },
        },
        error: null,
      })
      .mockResolvedValue({ data: null, error: null })
    mocks.resolveStandardWorkDurationSeed.mockResolvedValue({
      __stableCode: 'standard_floor_concrete_pour',
      stableCode: 'standard_floor_concrete_pour',
      standardWorkCodes: ['BDT-04-01-01-P07'],
      defaultDaysP50: 4,
      defaultDaysP80: 7,
      fixedDays: 1,
      variableDays: 3,
      confidence: 'medium',
      benchmarkBasis: 'Concrete pour baseline.',
      durationContributionMode: 'duration_bearing',
    })

    const suggestion = await getTaskDurationSuggestion({ projectId: 'project-1', taskId: 'task-1' })

    expect(suggestion.recommendedDurationDays).toBe(5)
    expect(suggestion.businessReasonCode).not.toBe('PACKAGE_CHILD_DURATION_WINDOW')
    expect(suggestion.parentDurationBoundaryPolicy ?? null).toBeNull()
    expect(suggestion.planDurationTruthSource ?? null).toBeNull()
    expect(suggestion.durationBoundaryRole).not.toBe('package_child_window')
  })

  it('uses package-child rhythm windows as the child display truth inside the parent package window', async () => {
    mocks.resolveStandardWorkDurationSeed.mockResolvedValue({
      __stableCode: 'standard_floor_rebar_binding',
      stableCode: 'standard_floor_rebar_binding',
      standardWorkCodes: ['03-02-01-P02'],
      defaultDaysP50: 7,
      defaultDaysP80: 10,
      fixedDays: 1,
      variableDays: 6,
      confidence: 'medium',
      benchmarkBasis: 'Standard floor rebar binding baseline.',
      durationContributionMode: 'duration_bearing',
    })

    const suggestion = await getTaskDurationSuggestion({
      projectId: 'project-1',
      standardWorkCode: '03-02-01-P02',
      taskTitle: 'standard floor rebar binding',
      wbsNodeType: 'process',
      parentStandardWorkCode: 'STD-FLOOR-STRUCTURE-PACK',
      parentTaskTitle: 'standard floor structure rhythm package',
      parentDurationBoundaryPolicy: 'rhythm_package_window',
      parentDurationPolicySource: 'template_duration_truth_asset',
      parentReferenceDurationDays: 6,
      packageChildRhythmWindowStartDay: 1,
      packageChildRhythmWindowEndDay: 2,
      packageChildRhythmWindowDurationDays: 2,
      packageChildRhythmWindowRole: 'wall_column_rebar',
    })

    expect(suggestion.recommendedDurationDays).toBe(2)
    expect(suggestion.conservativeDurationDays).toBe(2)
    expect(suggestion.durationBoundaryRole).toBe('package_child_window')
    expect(suggestion.businessReasonCode).toBe('PACKAGE_CHILD_DURATION_WINDOW')
    expect(suggestion.businessReasonParams).toEqual(expect.objectContaining({
      parentReferenceDurationDays: 6,
      independentReferenceDurationDays: 8,
      independentConservativeDurationDays: 11,
      packageChildPlanDurationDays: 2,
      parentWindowApplied: true,
      planDurationTruthSource: 'parent_package_rhythm_window',
      nonAdditiveWithParentDuration: true,
      rhythmWindowStartDay: 1,
      rhythmWindowEndDay: 2,
      rhythmWindowRole: 'wall_column_rebar',
    }))
    expect(suggestion.factorAvailability).toEqual(expect.objectContaining({
      parent_duration_boundary: true,
      package_child_duration_window: true,
      parent_package_window_plan_truth: true,
      package_child_rhythm_window: true,
    }))
  })

  it('surfaces T2 rhythm schedule candidate packages as read-only explanation context without overriding E1 days', async () => {
    mocks.state.projectsData = [{
      id: 'project-1',
      metadata: {
        projectGenerationFacts: {
          businessType: 'residential',
          structureTypeCode: 'shear_wall',
          buildingCount: 2,
        },
        t2RhythmScheduleCandidatePackage: {
          source: 't2_division_rhythm_schedule_candidate_package',
          tier: 'T2',
          status: 'schedulable_candidate',
          selectedTemplateIds: ['t2-residential-standard-floor-structure-rhythm-v1'],
          templateCount: 1,
          durationBearingWindowCount: 4,
          candidateDependencyEdgeCount: 6,
          hardGateCount: 2,
          durationContextCandidates: [{
            sourceTemplateId: 't2-residential-standard-floor-structure-rhythm-v1',
            windowCode: 'wall_column_rebar',
            recommendedDurationDays: 2,
            planReferenceDays: 2,
            planDurationTruthSource: 'parent_package_rhythm_window',
            tier: 'T2',
            governanceStatus: 'candidate_seeded',
            sourceType: 'system_standard_library',
            autoApply: false,
          }],
          dependencyCandidates: [{
            fromWindowCode: 'wall_column_rebar',
            toWindowCode: 'wall_column_formwork',
            relation: 'FS',
            lagDays: 0,
            sourceTemplateId: 't2-residential-standard-floor-structure-rhythm-v1',
            tier: 'T2',
            autoApply: false,
          }],
          hardGates: [{
            gateCode: 'floor_handover_checked',
            description: 'Floor handover checked.',
            requiredBeforeWindowCode: 'wall_column_rebar',
            sourceTemplateId: 't2-residential-standard-floor-structure-rhythm-v1',
            tier: 'T2',
            autoApply: false,
          }],
          scheduleTrustSummaries: [{
            sourceTemplateId: 't2-residential-standard-floor-structure-rhythm-v1',
            criticalPathRoles: ['wall_column_rebar', 'wall_column_formwork'],
            durationDrivers: ['aluminum_formwork', 'workface_unit:floor', 'overlap_policy:sequential_with_controlled_overlap'],
            workfaceReadinessSignals: ['hasOrderedFloors', 'hasBasementHandover'],
            assemblyRiskTags: ['tower_first_without_basement_handover', 'scope_dimension:floor'],
            replayAdmission: {
              minimumComparableWorkfaceWindows: 12,
              p80CaptureThreshold: 0.72,
              maxMedianAbsoluteErrorDays: 2,
            },
          }],
          compatibility: {
            compatible: true,
            status: 'compatible_candidate',
            conflicts: [],
            templateIds: ['t2-residential-standard-floor-structure-rhythm-v1'],
            priorityAdjudication: {
              selectedTemplateId: 't2-residential-standard-floor-structure-rhythm-v1',
              selectedBy: 'project_experience',
              priorityRank: ['project_experience', 'system_standard_library', 'external_knowledge_candidate'],
              assemblyFeasibilityRequired: true,
              priorityOverrideBlocked: false,
            },
          },
          scheduleTrustPolicy: {
            autoApply: false,
            writesTaskDependencies: false,
            writesPlanDates: false,
            writesSeed: false,
            writesBaseline: false,
            requiresAssemblyCompatibility: true,
            requiresL5Publication: true,
            downstreamConsumer: 'DurationInputAssembler_or_C19_13_phase1_candidate_network',
          },
        },
      },
    }]
    mocks.resolveStandardWorkDurationSeed.mockResolvedValue({
      __stableCode: 'standard_floor_rebar_binding',
      stableCode: 'standard_floor_rebar_binding',
      standardWorkCodes: ['03-02-01-P02'],
      defaultDaysP50: 7,
      defaultDaysP80: 10,
      fixedDays: 1,
      variableDays: 6,
      confidence: 'medium',
      benchmarkBasis: 'Standard floor rebar binding baseline.',
      durationContributionMode: 'duration_bearing',
    })

    const suggestion = await getTaskDurationSuggestion({
      suggestionPurpose: 'execution_reference',
      projectId: 'project-1',
      standardWorkCode: '03-02-01-P02',
      taskTitle: 'standard floor rebar binding',
      wbsNodeType: 'process',
    })

    expect(suggestion.recommendedDurationDays).toBe(8)
    expect(suggestion.conservativeDurationDays).toBe(10)
    expect(suggestion.businessReasonCode).not.toBe('PACKAGE_CHILD_DURATION_WINDOW')
    expect(suggestion.planDurationTruthSource ?? null).toBeNull()
    expect(suggestion.factorAvailability).toEqual(expect.objectContaining({
      t2_rhythm_schedule_candidate_package: true,
    }))
    expect((suggestion.calculationContext as any)?.t2RhythmScheduleCandidatePackage).toEqual(expect.objectContaining({
      source: 't2_division_rhythm_schedule_candidate_package',
      tier: 'T2',
      status: 'schedulable_candidate',
      selectedTemplateIds: ['t2-residential-standard-floor-structure-rhythm-v1'],
      durationContextCandidateCount: 1,
      dependencyCandidateCount: 1,
      hardGateCount: 2,
      compatibility: expect.objectContaining({
        status: 'compatible_candidate',
        compatible: true,
        conflictCount: 0,
        priorityOverrideBlocked: false,
      }),
      scheduleTrustPolicy: expect.objectContaining({
        autoApply: false,
        writesTaskDependencies: false,
        writesPlanDates: false,
        requiresAssemblyCompatibility: true,
        requiresL5Publication: true,
      }),
      scheduleTrustSummaries: [
        expect.objectContaining({
          sourceTemplateId: 't2-residential-standard-floor-structure-rhythm-v1',
          criticalPathRoles: ['wall_column_rebar', 'wall_column_formwork'],
          replayAdmission: expect.objectContaining({
            minimumComparableWorkfaceWindows: 12,
            p80CaptureThreshold: 0.72,
          }),
        }),
      ],
    }))
    expect((suggestion.calculationContext as any)?.t2RhythmScheduleCandidatePackage?.durationContextCandidates).toEqual([
      expect.objectContaining({
        sourceTemplateId: 't2-residential-standard-floor-structure-rhythm-v1',
        windowCode: 'wall_column_rebar',
        recommendedDurationDays: 2,
        planDurationTruthSource: 'parent_package_rhythm_window',
        autoApply: false,
      }),
    ])
    expect((suggestion.factorSummary?.calculationContext as any)?.t2RhythmScheduleCandidatePackage).toEqual(
      (suggestion.calculationContext as any)?.t2RhythmScheduleCandidatePackage,
    )
  })

  it('surfaces T2 phase-1 network evaluation as read-only explanation context without selecting or writing schedule facts', async () => {
    mocks.state.projectsData = [{
      id: 'project-1',
      metadata: {
        projectGenerationFacts: {
          businessType: 'residential',
          structureTypeCode: 'shear_wall',
          buildingCount: 2,
        },
        t2RhythmScheduleCandidateNetworkEvaluation: {
          source: 't2_rhythm_schedule_candidate_network_phase1_evaluation',
          candidateId: 'c19-13-t2-standard-floor-option',
          tier: 'T2',
          status: 'phase1_readonly_evaluation_ready',
          canEnterC1913Phase1Selection: true,
          networkSpanDays: 18,
          topologicalOrder: ['node-a', 'node-b', 'node-c'],
          criticalNodeIds: ['node-a', 'node-b'],
          criticalWindowCodes: [
            'wall_column_rebar',
            'wall_column_formwork',
            'slab_rebar_mep_embed',
          ],
          selectionReceipts: [{
            templateId: 't2-residential-standard-floor-structure-rhythm-v1',
            selectionStatus: 'selected_explicit_match',
            rank: 1,
            selectorScore: 100,
            selectionBasis: 'explicit_selector_match_and_score_rank',
            requestedDimensions: {
              businessTypeCode: 'residential',
              phaseWindow: 'superstructure',
              divisionFamily: 'superstructure',
              subdivisionFamily: 'standard_floor_handover',
              methodVariantCodes: ['aluminum_formwork'],
              structureTypeCodes: [],
              scopeDimensions: ['building', 'floor'],
            },
            matchedDimensions: {
              businessTypeCode: 'residential',
              phaseWindow: 'superstructure',
              divisionFamily: 'superstructure',
              subdivisionFamily: 'standard_floor_handover',
              methodVariantCodes: ['aluminum_formwork'],
              structureTypeCodes: [],
              scopeDimensions: ['building', 'floor'],
            },
            unmatchedExplicitDimensions: [],
            selectorPurity: {
              allExplicitDimensionsMatched: true,
              noT1T3Leakage: true,
              exactPhaseWindowMatch: true,
              exactDivisionFamilyMatch: true,
              exactSubdivisionFamilyMatch: true,
            },
            mutationBoundary: {
              writesTaskDependencies: false,
              writesPlanDates: false,
              writesCriticalPathFacts: false,
              writesSeed: false,
              writesBaseline: false,
              writesRuntimePublications: false,
            },
          }],
          nodeEvaluations: [
            {
              nodeId: 'node-a',
              windowCode: 'wall_column_rebar',
              role: 'wall_column_rebar',
              earliestStartDay: 1,
              earliestFinishDay: 2,
              latestStartDay: 1,
              latestFinishDay: 2,
              totalFloatDays: 0,
              isCritical: true,
            },
            {
              nodeId: 'node-b',
              windowCode: 'wall_column_formwork',
              role: 'wall_column_formwork',
              earliestStartDay: 3,
              earliestFinishDay: 4,
              latestStartDay: 3,
              latestFinishDay: 4,
              totalFloatDays: 0,
              isCritical: true,
            },
          ],
          conflictSummary: {
            conflictCount: 0,
            conflictCodes: [],
            priorityOverrideBlocked: false,
          },
          scheduleTrustEvidence: {
            selectedTemplateIds: ['t2-residential-standard-floor-structure-rhythm-v1'],
            durationBearingNodeCount: 4,
            dependencyEdgeCount: 6,
            hardGateCount: 2,
            compatibilityStatus: 'compatible_candidate',
            replayRequiredBeforePublish: true,
            standardLibraryReadinessStatus: 'shadow_candidate_ready_not_publishable',
            standardLibraryPrecisionStatus: 'ready',
            standardLibraryBreadthStatus: 'ready',
            standardLibraryDepthStatus: 'ready',
            standardLibraryTrustGateStatus: 'shadow_replay_ready_not_publishable',
            standardLibraryTrustBoundary: 'archived_live_shadow_replay_only',
            canTrustForRealScheduleCalibration: true,
            standardLibraryTrustGateReleaseBlockers: [
              'l5_canary_publish_rollback_required',
              'c19_13_phase1_multinetwork_selection_required',
              'manual_publication_approval_required',
            ],
            selectionReceiptCount: 1,
            selectorReceiptAuditStatus: 'ready',
            releaseBlockers: [
              'l5_canary_publish_rollback_required',
              'c19_13_phase1_multinetwork_selection_required',
              'manual_publication_approval_required',
            ],
            topologyEvaluated: true,
            floatCalculated: true,
            writesTaskDependencies: false,
            writesPlanDates: false,
          },
          standardLibraryReadiness: {
            status: 'shadow_candidate_ready_not_publishable',
            precisionStatus: 'ready',
            breadthStatus: 'ready',
            depthStatus: 'ready',
            canEnterC1913Phase1Selection: true,
            canAutoMaterializeTaskDependencies: false,
            canAutoPublishRuntimeExperience: false,
            liveReplayTrustGate: {
              source: 't2_rhythm_standard_library_live_replay_trust_gate',
              status: 'shadow_replay_ready_not_publishable',
              canTrustForRealScheduleCalibration: true,
              canEnterC1913Phase1Selection: true,
              canAutoMaterializeTaskDependencies: false,
              canAutoPublishRuntimeExperience: false,
              trustBoundary: 'archived_live_shadow_replay_only',
              passedGateCodes: [
                'archived_json_present',
                'live_evidence_metadata_present',
                'readiness_pass',
                't2_replay_sample_available',
                'duration_bearing_window_replay_coverage_passed',
                'shadow_replay_acceptance_passed',
              ],
              blockingReasons: [],
              releaseBlockers: [
                'l5_canary_publish_rollback_required',
                'c19_13_phase1_multinetwork_selection_required',
                'manual_publication_approval_required',
              ],
              mutationBoundary: {
                writesTaskDependencies: false,
                writesPlanDates: false,
                writesCriticalPathFacts: false,
                writesSeed: false,
                writesBaseline: false,
                writesRuntimePublications: false,
              },
            },
            releaseBlockers: [
              'l5_canary_publish_rollback_required',
              'c19_13_phase1_multinetwork_selection_required',
              'manual_publication_approval_required',
            ],
          },
          phase1PublicationGate: {
            status: 'blocked_pending_release_evidence',
            canPublishRuntimeExperience: false,
            canMaterializeTaskDependencies: false,
            releaseBlockers: [
              'l5_canary_publish_rollback_required',
              'c19_13_phase1_multinetwork_selection_required',
              'manual_publication_approval_required',
            ],
          },
          mutationBoundary: {
            writesTaskDependencies: false,
            writesPlanDates: false,
            writesCriticalPathFacts: false,
            writesSeed: false,
            writesBaseline: false,
          },
        },
      },
    }]
    mocks.resolveStandardWorkDurationSeed.mockResolvedValue({
      __stableCode: 'standard_floor_rebar_binding',
      stableCode: 'standard_floor_rebar_binding',
      standardWorkCodes: ['03-02-01-P02'],
      defaultDaysP50: 7,
      defaultDaysP80: 10,
      fixedDays: 1,
      variableDays: 6,
      confidence: 'medium',
      benchmarkBasis: 'Standard floor rebar binding baseline.',
      durationContributionMode: 'duration_bearing',
    })

    const suggestion = await getTaskDurationSuggestion({
      suggestionPurpose: 'execution_reference',
      projectId: 'project-1',
      standardWorkCode: '03-02-01-P02',
      taskTitle: 'standard floor rebar binding',
      wbsNodeType: 'process',
    })

    expect(suggestion.recommendedDurationDays).toBe(8)
    expect(suggestion.conservativeDurationDays).toBe(10)
    expect(suggestion.planDurationTruthSource ?? null).toBeNull()
    expect(suggestion.factorAvailability).toEqual(expect.objectContaining({
      t2_rhythm_schedule_candidate_network_phase1_evaluation: true,
    }))
    expect((suggestion.calculationContext as any)?.t2RhythmScheduleCandidateNetworkEvaluation).toEqual(expect.objectContaining({
      source: 't2_rhythm_schedule_candidate_network_phase1_evaluation',
      tier: 'T2',
      status: 'phase1_readonly_evaluation_ready',
      candidateId: 'c19-13-t2-standard-floor-option',
      canEnterC1913Phase1Selection: true,
      networkSpanDays: 18,
      criticalWindowCodes: [
        'wall_column_rebar',
        'wall_column_formwork',
        'slab_rebar_mep_embed',
      ],
      criticalNodeCount: 2,
      nodeEvaluationCount: 2,
      scheduleTrustEvidence: expect.objectContaining({
        selectedTemplateIds: ['t2-residential-standard-floor-structure-rhythm-v1'],
        selectionReceiptCount: 1,
        selectorReceiptAuditStatus: 'ready',
        standardLibraryReadinessStatus: 'shadow_candidate_ready_not_publishable',
        standardLibraryPrecisionStatus: 'ready',
        standardLibraryBreadthStatus: 'ready',
        standardLibraryDepthStatus: 'ready',
        standardLibraryTrustGateStatus: 'shadow_replay_ready_not_publishable',
        standardLibraryTrustBoundary: 'archived_live_shadow_replay_only',
        canTrustForRealScheduleCalibration: true,
        standardLibraryTrustGateReleaseBlockers: expect.arrayContaining([
          'l5_canary_publish_rollback_required',
          'c19_13_phase1_multinetwork_selection_required',
          'manual_publication_approval_required',
        ]),
        releaseBlockers: expect.arrayContaining([
          'l5_canary_publish_rollback_required',
          'c19_13_phase1_multinetwork_selection_required',
          'manual_publication_approval_required',
        ]),
        topologyEvaluated: true,
        floatCalculated: true,
        writesTaskDependencies: false,
        writesPlanDates: false,
      }),
      selectionReceipts: [expect.objectContaining({
        templateId: 't2-residential-standard-floor-structure-rhythm-v1',
        selectionStatus: 'selected_explicit_match',
        rank: 1,
        selectorScore: 100,
        selectorPurity: expect.objectContaining({
          allExplicitDimensionsMatched: true,
          noT1T3Leakage: true,
        }),
      })],
      standardLibraryReadiness: expect.objectContaining({
        status: 'shadow_candidate_ready_not_publishable',
        precisionStatus: 'ready',
        breadthStatus: 'ready',
        depthStatus: 'ready',
        liveReplayTrustGate: expect.objectContaining({
          status: 'shadow_replay_ready_not_publishable',
          trustBoundary: 'archived_live_shadow_replay_only',
          canTrustForRealScheduleCalibration: true,
        }),
      }),
      phase1PublicationGate: expect.objectContaining({
        status: 'blocked_pending_release_evidence',
        canPublishRuntimeExperience: false,
        canMaterializeTaskDependencies: false,
        releaseBlockers: expect.arrayContaining([
          'l5_canary_publish_rollback_required',
          'c19_13_phase1_multinetwork_selection_required',
          'manual_publication_approval_required',
        ]),
      }),
      mutationBoundary: expect.objectContaining({
        writesTaskDependencies: false,
        writesPlanDates: false,
        writesCriticalPathFacts: false,
        writesSeed: false,
        writesBaseline: false,
      }),
    }))
    expect((suggestion.factorSummary?.calculationContext as any)?.t2RhythmScheduleCandidateNetworkEvaluation).toEqual(
      (suggestion.calculationContext as any)?.t2RhythmScheduleCandidateNetworkEvaluation,
    )
    expect(suggestion.businessReasonParams).toEqual(expect.objectContaining({
      t2RhythmScheduleCandidateNetworkEvaluationStatus: 'phase1_readonly_evaluation_ready',
      t2RhythmScheduleCandidateNetworkCanEnterC1913Phase1Selection: true,
      t2RhythmScheduleCandidateNetworkWritesTaskDependencies: false,
      t2RhythmScheduleCandidateNetworkWritesPlanDates: false,
      t2RhythmScheduleCandidateNetworkSelectionReceiptCount: 1,
      t2RhythmScheduleCandidateNetworkSelectorReceiptAuditStatus: 'ready',
      t2RhythmScheduleCandidateNetworkStandardLibraryReadinessStatus: 'shadow_candidate_ready_not_publishable',
      t2RhythmScheduleCandidateNetworkStandardLibraryTrustGateStatus: 'shadow_replay_ready_not_publishable',
      t2RhythmScheduleCandidateNetworkStandardLibraryTrustBoundary: 'archived_live_shadow_replay_only',
      t2RhythmScheduleCandidateNetworkCanTrustForRealScheduleCalibration: true,
      t2RhythmScheduleCandidateNetworkStandardLibraryTrustGateReleaseBlockers: expect.arrayContaining([
        'l5_canary_publish_rollback_required',
        'c19_13_phase1_multinetwork_selection_required',
        'manual_publication_approval_required',
      ]),
      t2RhythmScheduleCandidateNetworkPhase1PublicationGateStatus: 'blocked_pending_release_evidence',
      t2RhythmScheduleCandidateNetworkCanPublishRuntimeExperience: false,
      t2RhythmScheduleCandidateNetworkCanMaterializeTaskDependencies: false,
      t2RhythmScheduleCandidateNetworkReleaseBlockers: expect.arrayContaining([
        'l5_canary_publish_rollback_required',
        'c19_13_phase1_multinetwork_selection_required',
        'manual_publication_approval_required',
      ]),
    }))
  })

  it('surfaces C-19.13 T2 phase-1 selection as read-only explanation context without mutating duration outputs', async () => {
    mocks.state.projectsData = [{
      id: 'project-1',
      metadata: {
        projectGenerationFacts: {
          businessType: 'residential',
          structureTypeCode: 'shear_wall',
          buildingCount: 2,
        },
        t2RhythmSchedulePhase1Selection: {
          source: 't2_rhythm_schedule_phase1_selection',
          selectionId: 'c19-13-phase1-residential-options',
          status: 'phase1_selection_ready',
          selectedCandidateId: 'c19-13-t2-standard-floor-option',
          eligibleCandidateIds: ['c19-13-t2-standard-floor-option'],
          rejectedCandidates: [{
            candidateId: 'tower-first-high-priority-conflict',
            status: 'candidate_conflict',
            reasonCodes: ['template_assembly_conflict', 'priority_override_blocked'],
            conflictCodes: ['t2_candidate_conflict'],
            priorityOverrideBlocked: true,
          }],
          combinationConsistencyGate: {
            receiptRequired: true,
            status: 'pass_with_manual_review_rejections',
            rejectedConflictCandidateCount: 1,
            rejectedMissingReceiptCandidateCount: 0,
          },
          selectionBasis: {
            strategy: 'assembly_compatible_then_shorter_span',
            assemblyFeasibilityRequired: true,
            linearPriorityCanOverrideAssemblyConflict: false,
            rankSignals: [
              'template_assembly_compatibility_receipt',
              'can_enter_c19_13_phase1_selection',
              'network_span_days',
            ],
          },
          mutationBoundary: {
            writesTaskDependencies: false,
            writesPlanDates: false,
            writesCriticalPathFacts: false,
            writesSeed: false,
            writesBaseline: false,
            writesRuntimePublications: false,
          },
        },
      },
    }]
    mocks.resolveStandardWorkDurationSeed.mockResolvedValue({
      __stableCode: 'standard_floor_rebar_binding',
      stableCode: 'standard_floor_rebar_binding',
      standardWorkCodes: ['03-02-01-P02'],
      defaultDaysP50: 7,
      defaultDaysP80: 10,
      fixedDays: 1,
      variableDays: 6,
      confidence: 'medium',
      benchmarkBasis: 'Standard floor rebar binding baseline.',
      durationContributionMode: 'duration_bearing',
    })

    const suggestion = await getTaskDurationSuggestion({
      suggestionPurpose: 'execution_reference',
      projectId: 'project-1',
      standardWorkCode: '03-02-01-P02',
      taskTitle: 'standard floor rebar binding',
      wbsNodeType: 'process',
    })

    expect(suggestion.recommendedDurationDays).toBe(8)
    expect(suggestion.conservativeDurationDays).toBe(10)
    expect(suggestion.planDurationTruthSource ?? null).toBeNull()
    expect(suggestion.factorAvailability).toEqual(expect.objectContaining({
      t2_rhythm_schedule_phase1_selection: true,
    }))
    expect((suggestion.calculationContext as any)?.t2RhythmSchedulePhase1Selection).toEqual(expect.objectContaining({
      source: 't2_rhythm_schedule_phase1_selection',
      selectionId: 'c19-13-phase1-residential-options',
      status: 'phase1_selection_ready',
      selectedCandidateId: 'c19-13-t2-standard-floor-option',
      eligibleCandidateIds: ['c19-13-t2-standard-floor-option'],
      rejectedCandidateCount: 1,
      rejectedCandidates: [expect.objectContaining({
        candidateId: 'tower-first-high-priority-conflict',
        reasonCodes: ['template_assembly_conflict', 'priority_override_blocked'],
      })],
      combinationConsistencyGate: expect.objectContaining({
        receiptRequired: true,
        status: 'pass_with_manual_review_rejections',
        rejectedConflictCandidateCount: 1,
      }),
      selectionBasis: expect.objectContaining({
        strategy: 'assembly_compatible_then_shorter_span',
        assemblyFeasibilityRequired: true,
        linearPriorityCanOverrideAssemblyConflict: false,
      }),
      mutationBoundary: expect.objectContaining({
        writesTaskDependencies: false,
        writesPlanDates: false,
        writesCriticalPathFacts: false,
        writesSeed: false,
        writesBaseline: false,
        writesRuntimePublications: false,
      }),
    }))
    expect((suggestion.factorSummary?.calculationContext as any)?.t2RhythmSchedulePhase1Selection).toEqual(
      (suggestion.calculationContext as any)?.t2RhythmSchedulePhase1Selection,
    )
    expect(suggestion.businessReasonParams).toEqual(expect.objectContaining({
      t2RhythmSchedulePhase1SelectionStatus: 'phase1_selection_ready',
      t2RhythmSchedulePhase1SelectedCandidateId: 'c19-13-t2-standard-floor-option',
      t2RhythmSchedulePhase1RejectedCandidateCount: 1,
      t2RhythmSchedulePhase1WritesTaskDependencies: false,
      t2RhythmSchedulePhase1WritesPlanDates: false,
      t2RhythmSchedulePhase1LinearPriorityCanOverrideAssemblyConflict: false,
    }))
  })

  it('surfaces the L3 duration input assembly gate without letting T2 candidates mutate E1 duration outputs', async () => {
    mocks.state.projectsData = [{
      id: 'project-1',
      metadata: {
        projectGenerationFacts: {
          businessType: 'residential',
          structureTypeCode: 'shear_wall',
          buildingCount: 2,
        },
        t2RhythmScheduleCandidatePackage: {
          source: 't2_division_rhythm_schedule_candidate_package',
          tier: 'T2',
          status: 'schedulable_candidate',
          selectedTemplateIds: ['t2-residential-standard-floor-structure-rhythm-v1'],
          templateCount: 1,
          durationBearingWindowCount: 4,
          candidateDependencyEdgeCount: 6,
          hardGateCount: 2,
          durationContextCandidates: [],
          dependencyCandidates: [],
          hardGates: [],
          scheduleTrustSummaries: [],
          compatibility: {
            compatible: true,
            status: 'compatible_candidate',
            conflicts: [],
            templateIds: ['t2-residential-standard-floor-structure-rhythm-v1'],
          },
          scheduleTrustPolicy: {
            autoApply: false,
            writesTaskDependencies: false,
            writesPlanDates: false,
            writesSeed: false,
            writesBaseline: false,
            requiresAssemblyCompatibility: true,
            requiresL5Publication: true,
            downstreamConsumer: 'DurationInputAssembler_or_C19_13_phase1_candidate_network',
          },
        },
        t2RhythmScheduleCandidateNetwork: {
          source: 't2_rhythm_schedule_candidate_network',
          candidateId: 'c19-13-t2-standard-floor-option',
          tier: 'T2',
          status: 'candidate_conflict',
          canEnterC1913Phase1Selection: false,
          requiresManualReview: true,
          selectedTemplateIds: ['t2-residential-standard-floor-structure-rhythm-v1'],
          nodes: [],
          edges: [],
          gates: [],
          assemblyCompatibility: {
            candidateId: 'c19-13-t2-standard-floor-option',
            status: 'candidate_conflict',
            canEnterAutomaticSelection: false,
            canWriteTaskDependencies: false,
            canWritePlanDates: false,
            priorityOverrideBlocked: true,
            conflicts: [{
              conflictCode: 'construction_organization_t2_assumption_conflict',
              source: 'construction_organization',
              templateId: 't2-residential-standard-floor-structure-rhythm-v1',
              detail: 'Tower-first organization conflicts with selected T2 rhythm.',
            }],
          },
          conflictSummary: {
            conflictCount: 1,
            conflictCodes: ['construction_organization_t2_assumption_conflict'],
            priorityOverrideBlocked: true,
          },
          scheduleTrustEvidence: {
            selectedTemplateIds: ['t2-residential-standard-floor-structure-rhythm-v1'],
            durationBearingNodeCount: 4,
            dependencyEdgeCount: 6,
            hardGateCount: 2,
            compatibilityStatus: 'candidate_conflict',
            replayRequiredBeforePublish: true,
          },
          mutationBoundary: {
            writesTaskDependencies: false,
            writesPlanDates: false,
            writesCriticalPathFacts: false,
            writesSeed: false,
            writesBaseline: false,
          },
        },
        t2RhythmScheduleCandidateNetworkEvaluation: {
          source: 't2_rhythm_schedule_candidate_network_phase1_evaluation',
          candidateId: 'c19-13-t2-standard-floor-option',
          tier: 'T2',
          status: 'candidate_conflict',
          canEnterC1913Phase1Selection: false,
          networkSpanDays: 0,
          topologicalOrder: [],
          criticalNodeIds: [],
          criticalWindowCodes: [],
          nodeEvaluations: [],
          conflictSummary: {
            conflictCount: 1,
            conflictCodes: ['construction_organization_t2_assumption_conflict'],
            priorityOverrideBlocked: true,
          },
          scheduleTrustEvidence: {
            selectedTemplateIds: ['t2-residential-standard-floor-structure-rhythm-v1'],
            durationBearingNodeCount: 4,
            dependencyEdgeCount: 6,
            hardGateCount: 2,
            compatibilityStatus: 'candidate_conflict',
            replayRequiredBeforePublish: true,
            topologyEvaluated: false,
            floatCalculated: false,
            writesTaskDependencies: false,
            writesPlanDates: false,
          },
          mutationBoundary: {
            writesTaskDependencies: false,
            writesPlanDates: false,
            writesCriticalPathFacts: false,
            writesSeed: false,
            writesBaseline: false,
          },
        },
      },
    }]
    mocks.resolveStandardWorkDurationSeed.mockResolvedValue({
      __stableCode: 'standard_floor_rebar_binding',
      stableCode: 'standard_floor_rebar_binding',
      standardWorkCodes: ['03-02-01-P02'],
      defaultDaysP50: 7,
      defaultDaysP80: 10,
      fixedDays: 1,
      variableDays: 6,
      confidence: 'medium',
      benchmarkBasis: 'Standard floor rebar binding baseline.',
      durationContributionMode: 'duration_bearing',
    })

    const suggestion = await getTaskDurationSuggestion({
      suggestionPurpose: 'execution_reference',
      projectId: 'project-1',
      standardWorkCode: '03-02-01-P02',
      taskTitle: 'standard floor rebar binding',
      wbsNodeType: 'process',
    })

    expect(suggestion.recommendedDurationDays).toBe(8)
    expect(suggestion.conservativeDurationDays).toBe(10)
    expect(suggestion.planDurationTruthSource ?? null).toBeNull()
    expect(suggestion.factorAvailability).toEqual(expect.objectContaining({
      duration_input_assembler: true,
    }))
    expect((suggestion.calculationContext as any)?.durationInputAssembly).toEqual(expect.objectContaining({
      source: 'DurationInputAssembler',
      assemblyGate: expect.objectContaining({
        status: 'candidate_conflict',
        canEnterC1913Phase1Selection: false,
        requiresManualReview: true,
        priorityOverrideBlocked: true,
        conflictCodes: [
          'construction_organization_t2_assumption_conflict',
          'production_capacity_evidence_missing',
          't2_standard_library_live_replay_trust_gate_missing',
        ],
        productionCapacityEvidenceStatus: null,
        productionCapacityMissingEvidenceCodes: ['production_capacity_evidence_missing'],
        standardLibraryTrustGateStatus: 'missing',
        standardLibraryTrustBoundary: 'blocked_live_replay_evidence',
        standardLibraryTrustBlockingReasons: [
          't2_standard_library_live_replay_trust_gate_missing',
          'archived_live_replay_required',
        ],
      }),
      mutationBoundary: expect.objectContaining({
        writesTaskDependencies: false,
        writesPlanDates: false,
        writesCriticalPathFacts: false,
        writesSeed: false,
        writesBaseline: false,
        writesRuntimePublications: false,
      }),
    }))
    expect((suggestion.calculationContext as any)?.durationInputAssembly?.sourceLineage).toEqual(expect.arrayContaining([
      expect.objectContaining({
        channel: 't2RhythmScheduleCandidateNetwork',
        source: 'project_metadata',
        status: 'candidate_conflict',
      }),
      expect.objectContaining({
        channel: 't2RhythmScheduleCandidateNetworkEvaluation',
        source: 'project_metadata',
        status: 'candidate_conflict',
      }),
    ]))
    expect(suggestion.businessReasonParams).toEqual(expect.objectContaining({
      durationInputAssemblyGateStatus: 'candidate_conflict',
      durationInputAssemblyCanEnterC1913Phase1Selection: false,
      durationInputAssemblyConflictCodes: [
        'construction_organization_t2_assumption_conflict',
        'production_capacity_evidence_missing',
        't2_standard_library_live_replay_trust_gate_missing',
      ],
      durationInputAssemblyWritesTaskDependencies: false,
      durationInputAssemblyWritesPlanDates: false,
    }))
  })

  it('does not infer package-child windows from standard-floor title or code without an explicit child asset', async () => {
    mocks.resolveStandardWorkDurationSeed.mockResolvedValue({
      __stableCode: 'standard_floor_rebar_binding',
      stableCode: 'standard_floor_rebar_binding',
      standardWorkCodes: ['03-02-01-P02'],
      defaultDaysP50: 7,
      defaultDaysP80: 10,
      fixedDays: 1,
      variableDays: 6,
      confidence: 'medium',
      benchmarkBasis: 'Standard floor rebar binding baseline.',
      durationContributionMode: 'duration_bearing',
    })

    const suggestion = await getTaskDurationSuggestion({
      projectId: 'project-1',
      standardWorkCode: '03-02-01-P02',
      taskTitle: 'standard floor rebar binding',
      wbsNodeType: 'process',
      parentStandardWorkCode: 'STD-FLOOR-STRUCTURE-PACK',
      parentTaskTitle: 'standard floor structure rhythm package',
      parentDurationBoundaryPolicy: 'rhythm_package_window',
      parentDurationPolicySource: 'template_duration_truth_asset',
      parentReferenceDurationDays: 6,
    })

    expect(suggestion.recommendedDurationDays ?? null).toBeNull()
    expect(suggestion.packageChildPlanDurationDays ?? null).toBeNull()
    expect(suggestion.planDurationTruthSource).toBe('parent_package_window_pending_rhythm_allocation')
    expect(suggestion.businessReasonParams).toEqual(expect.objectContaining({
      packageChildRhythmWindowApplied: false,
      noRhythmAllocation: true,
      rhythmWindowStartDay: null,
      rhythmWindowEndDay: null,
      planDurationTruthSource: 'parent_package_window_pending_rhythm_allocation',
    }))
    expect(suggestion.factorAvailability).toEqual(expect.objectContaining({
      parent_duration_boundary: true,
      package_child_rhythm_window: false,
      package_child_rhythm_window_pending: true,
    }))
  })

  it('ignores direct parent-window input when it does not carry a trusted template or rule asset source', async () => {
    mocks.resolveStandardWorkDurationSeed.mockResolvedValue({
      __stableCode: 'standard_floor_rebar_binding',
      stableCode: 'standard_floor_rebar_binding',
      standardWorkCodes: ['03-02-01-P02'],
      defaultDaysP50: 7,
      defaultDaysP80: 10,
      fixedDays: 1,
      variableDays: 6,
      confidence: 'medium',
      benchmarkBasis: 'Standard floor rebar binding baseline.',
      durationContributionMode: 'duration_bearing',
    })

    const suggestion = await getTaskDurationSuggestion({
      projectId: 'project-1',
      standardWorkCode: '03-02-01-P02',
      taskTitle: 'standard floor rebar binding',
      wbsNodeType: 'process',
      parentStandardWorkCode: 'STD-FLOOR-STRUCTURE-PACK',
      parentTaskTitle: 'standard floor structure rhythm package',
      parentDurationBoundaryPolicy: 'rhythm_package_window',
      parentReferenceDurationDays: 6,
      packageChildRhythmWindowStartDay: 1,
      packageChildRhythmWindowEndDay: 2,
      packageChildRhythmWindowDurationDays: 2,
      packageChildRhythmWindowRole: 'wall_column_rebar',
    })

    expect(suggestion.recommendedDurationDays).toBe(8)
    expect(suggestion.businessReasonCode).not.toBe('PACKAGE_CHILD_DURATION_WINDOW')
    expect(suggestion.durationBoundaryRole ?? null).toBeNull()
    expect(suggestion.planDurationTruthSource ?? null).toBeNull()
    expect(suggestion.factorAvailability?.parent_duration_boundary).not.toBe(true)
  })

  it('uses pending parent-window wording when a package child boundary has no parent duration yet', async () => {
    mocks.resolveStandardWorkDurationSeed.mockResolvedValue({
      __stableCode: 'standard_floor_rebar_binding',
      stableCode: 'standard_floor_rebar_binding',
      standardWorkCodes: ['03-02-01-P02'],
      defaultDaysP50: 7,
      defaultDaysP80: 10,
      fixedDays: 1,
      variableDays: 6,
      confidence: 'medium',
      benchmarkBasis: 'Standard floor rebar binding baseline.',
      durationContributionMode: 'duration_bearing',
    })

    const suggestion = await getTaskDurationSuggestion({
      projectId: 'project-1',
      standardWorkCode: '03-02-01-P02',
      taskTitle: 'standard floor rebar binding',
      wbsNodeType: 'process',
      parentStandardWorkCode: 'STD-FLOOR-STRUCTURE-PACK',
      parentTaskTitle: 'standard floor structure rhythm package',
      parentDurationBoundaryPolicy: 'rhythm_package_window',
      parentDurationPolicySource: 'template_duration_truth_asset',
    })

    expect(suggestion.recommendedDurationDays).toBe(8)
    expect(suggestion.businessReasonCode).toBe('PACKAGE_CHILD_DURATION_WINDOW')
    expect(suggestion.businessReasonParams).toEqual(expect.objectContaining({
      parentWindowApplied: false,
      planDurationTruthSource: 'package_child_duration_reference',
      nonAdditiveWithParentDuration: true,
    }))
    expect(suggestion.displaySummary).toContain('参考工期')
    expect(suggestion.displaySummary).toContain('父级包窗口')
    expect(suggestion.displaySummary).not.toContain('不与父级')
    expect(suggestion.businessReason).not.toContain('不与父级')
  })

  it('blends company benchmark into new task reference without replacing the standard seed', async () => {
    mocks.getProjectCompanyId.mockResolvedValue('company-1')
    mocks.query.maybeSingle.mockImplementation(async () => {
      if (isCompanyBenchmarkScope('company-1')) {
        return {
          data: completePersistedBenchmark({ p50_days: 4, p75_days: 6, p80_days: 8 }),
          error: null,
        }
      }
      return { data: null, error: null }
    })
    mocks.resolveStandardWorkDurationSeed.mockResolvedValue({
      __stableCode: 'plastering_wall_ceiling',
      __resolverSource: 'active_seed',
      stableCode: 'plastering_wall_ceiling',
      defaultDaysP50: 8,
      defaultDaysP80: 12,
      fixedDays: 1,
      variableDays: 7,
      confidence: 'medium',
      benchmarkBasis: 'Plastering default per work face.',
    })

    const suggestion = await getTaskDurationSuggestion({
      companyId: 'company-1',
      standardWorkCode: 'plastering_wall_ceiling',
      taskTitle: 'wall plastering',
      wbsNodeType: 'process',
    })

    expect(suggestion.recommendedDurationDays).toBe(6)
    expect(suggestion.conservativeDurationDays).toBe(10)
    expect(suggestion.forecastSource).toBe('standard_work_duration_seed')
    expect(suggestion.durationProvenance).toBe('standard_work_duration_seed')
    expect(suggestion.businessReasonParams).toEqual(expect.objectContaining({
      companyBenchmarkBlendWeight: 0.7,
      companyBenchmarkP50: 4,
      companyBenchmarkSampleCount: 24,
    }))
    expect(suggestion).toMatchObject({
      benchmarkGeneratedAt: '2026-07-01T08:00:00.000Z',
      benchmarkAsOf: '2026-06-30T23:59:59.000Z',
      benchmarkWindowStart: '2026-04-01T00:00:00.000Z',
      benchmarkVersion: 'v7',
      benchmarkSampleCount: 24,
      benchmarkDayBasis: 'construction_production_day',
      benchmarkScope: 'company',
      benchmarkProvenanceAvailability: 'available',
      benchmarkProvenanceReasonCodes: [],
      benchmarkProvenance: {
        mode: 'single',
        entries: [expect.objectContaining({
          source: 'persisted_benchmark',
          benchmarkId: 'benchmark-1',
          publicationKey: null,
          benchmarkVersion: 'v7',
          scope: 'company',
          generatedAt: '2026-07-01T08:00:00.000Z',
          sourceAsOf: '2026-06-30T23:59:59.000Z',
          sourceWindowStart: '2026-04-01T00:00:00.000Z',
          sampleCount: 24,
          dayBasis: 'construction_production_day',
          calendarRef: 'calendar-1',
          calendarVersion: 'calendar-v3',
          aggregateCalendarIdentities: [],
          causeSegment: null,
          blendWeight: null,
          availability: 'available',
          reasonCodes: [],
        })],
      },
    })
  })

  it.each([
    {
      label: 'version',
      overrides: { benchmark_version: null },
      reason: 'benchmark_version_missing',
      missingField: 'benchmarkVersion',
    },
    {
      label: 'source window',
      overrides: { source_window_start: null },
      reason: 'benchmark_source_window_start_missing',
      missingField: 'sourceWindowStart',
    },
    {
      label: 'calendar identity',
      overrides: { metadata: { calendar_ref: null, calendar_version: 'calendar-v3' } },
      reason: 'benchmark_calendar_identity_missing',
      missingField: 'calendarRef',
    },
  ])('fails closed for persisted benchmark provenance with missing $label', async ({ overrides, reason, missingField }) => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2035-01-02T03:04:05.000Z'))
    try {
      mocks.getProjectCompanyId.mockResolvedValue('company-1')
      mocks.query.maybeSingle.mockImplementation(async () => (
        isCompanyBenchmarkScope('company-1')
          ? { data: completePersistedBenchmark(overrides), error: null }
          : { data: null, error: null }
      ))
      mocks.resolveStandardWorkDurationSeed.mockResolvedValue({
        __stableCode: 'plastering_wall_ceiling',
        stableCode: 'plastering_wall_ceiling',
        defaultDaysP50: 8,
        defaultDaysP80: 12,
        confidence: 'medium',
      })

      const suggestion = await getTaskDurationSuggestion({
        suggestionPurpose: 'execution_reference',
        projectId: 'project-1',
        companyId: 'company-1',
        standardWorkCode: 'plastering_wall_ceiling',
        taskTitle: 'wall plastering',
        wbsNodeType: 'process',
      })

      expect(suggestion).toMatchObject({
        benchmarkGeneratedAt: null,
        benchmarkAsOf: null,
        benchmarkWindowStart: null,
        benchmarkVersion: null,
        benchmarkSampleCount: null,
        benchmarkDayBasis: null,
        benchmarkScope: null,
        benchmarkProvenanceAvailability: 'unavailable',
        benchmarkProvenanceReasonCodes: [reason],
        benchmarkProvenanceUnavailableReason: reason,
        benchmarkProvenance: {
          mode: 'single',
          entries: [expect.objectContaining({
            availability: 'unavailable',
            reasonCodes: [reason],
          })],
        },
      })
      const entry = suggestion.benchmarkProvenance?.entries[0] as unknown as Record<string, unknown>
      expect(entry[missingField]).toBeNull()
      expect(JSON.stringify(suggestion.benchmarkProvenance)).not.toContain('2035-01-02T03:04:05.000Z')
    } finally {
      now.mockRestore()
    }
  })

  it.each([
    { label: 'missing version', overrides: { benchmarkVersion: null } },
    { label: 'missing source window', overrides: { sourceWindowStart: null } },
    { label: 'wrong day basis', overrides: { durationDayBasis: 'calendar_day' } },
    { label: 'missing calendar identity', overrides: { calendarRef: null } },
  ])('rejects a runtime benchmark with $label instead of substituting request time', ({ overrides }) => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2035-01-02T03:04:05.000Z'))
    try {
      const benchmark = buildDurationBenchmarkRowFromRuntimePublication({
        publicationKey: 'runtime-publication-1',
        selectionBasis: 'company_stable',
        publication: {
          runtimePayload: completeRuntimeBenchmarkPayload(overrides),
          companyId: 'company-1',
          projectId: null,
          publicationStage: 'stable',
          scopeLevel: 'company',
        },
      })

      expect(benchmark).toBeNull()
      expect(JSON.stringify(benchmark)).not.toContain('2035-01-02T03:04:05.000Z')
    } finally {
      now.mockRestore()
    }
  })

  it('preserves an industry runtime benchmark as industry provenance', async () => {
    const queryExec = async <T = Record<string, unknown>>(sql: string): Promise<T[]> => {
      if (!sql.includes('from public.duration_learning_runtime_publications')) return [] as T[]
      return [{
        publication_key: 'runtime-industry-1',
        asset_key: 'base_duration_benchmark',
        artifact_key: 'plastering_wall_ceiling:process:all',
        scope_level: 'industry',
        company_id: null,
        project_id: null,
        industry_key: 'general_civil',
        publication_stage: 'stable',
        runtime_payload: {
          ...completeRuntimeBenchmarkPayload({
            benchmarkId: undefined,
            benchmarkVersion: 'aggregate:industry:0123456789abcdef',
            sampleCount: 100,
          }),
          benchmarkKind: 'aggregate_all_cause',
          causeApplicability: 'all_cause',
          calendarRef: undefined,
          calendarVersion: undefined,
          aggregateProvenance: {
            schemaVersion: 'duration-benchmark-aggregate/v1',
            scopeLevel: 'industry',
            sourceBenchmarkIds: ['benchmark-industry-source-1'],
            sourceBenchmarkVersions: ['v6'],
            sourceProjectIds: ['project-source-1'],
            sourceCompanyIds: ['company-source-1'],
            sourceIndustryKeys: ['general_civil'],
            calendarIdentities: [{ calendarRef: 'calendar-1', calendarVersion: 'calendar-v3' }],
          },
        },
        previous_publication_key: null,
        traffic_percent: 100,
        monitoring_status: 'passed',
        published_at: '2026-07-01T08:00:00.000Z',
      }] as T[]
    }
    mocks.resolveStandardWorkDurationSeed.mockResolvedValue({
      __stableCode: 'plastering_wall_ceiling',
      stableCode: 'plastering_wall_ceiling',
      defaultDaysP50: 10,
      defaultDaysP80: 14,
      confidence: 'medium',
    })

    const suggestion = await getTaskDurationSuggestion({
      suggestionPurpose: 'execution_reference',
      projectId: 'project-1',
      standardWorkCode: 'plastering_wall_ceiling',
      taskTitle: 'wall plastering',
      projectTypeCode: 'general_civil',
      progress: 10,
      wbsNodeType: 'process',
      runtimeConsumerObservationQueryExec: queryExec,
    })

    expect(suggestion.durationCalibrationSource).toBe('standard_work_duration_seed+industry_history_sample')
    expect(suggestion).toMatchObject({
      benchmarkVersion: 'aggregate:industry:0123456789abcdef',
      benchmarkSampleCount: 100,
      benchmarkScope: 'industry',
      benchmarkProvenanceAvailability: 'available',
      benchmarkProvenance: {
        mode: 'single',
        entries: [expect.objectContaining({
          source: 'runtime_publication',
          publicationKey: 'runtime-industry-1',
          benchmarkVersion: 'aggregate:industry:0123456789abcdef',
          scope: 'industry',
          aggregateCalendarIdentities: [{ calendarRef: 'calendar-1', calendarVersion: 'calendar-v3' }],
          blendWeight: null,
          availability: 'available',
        })],
      },
    })
  })

  it('does not mix a legacy calendar-day benchmark into production-day duration prediction', async () => {
    mocks.getProjectCompanyId.mockResolvedValue('company-1')
    mocks.query.maybeSingle.mockImplementation(async () => {
      if (isCompanyBenchmarkScope('company-1')) {
        return {
          data: {
            duration_day_basis: 'calendar_day',
            p50_days: 4,
            p75_days: 6,
            sample_count: 30,
            company_id: 'company-1',
          },
          error: null,
        }
      }
      return { data: null, error: null }
    })
    mocks.resolveStandardWorkDurationSeed.mockResolvedValue({
      __stableCode: 'plastering_wall_ceiling',
      stableCode: 'plastering_wall_ceiling',
      defaultDaysP50: 8,
      defaultDaysP80: 12,
      fixedDays: 1,
      variableDays: 7,
      confidence: 'medium',
    })

    const suggestion = await getTaskDurationSuggestion({
      companyId: 'company-1',
      standardWorkCode: 'plastering_wall_ceiling',
      taskTitle: 'wall plastering',
      wbsNodeType: 'process',
    })

    expect(suggestion.businessReasonParams?.companyBenchmarkBlendWeight).toBeUndefined()
    expect(suggestion.durationCalibrationSource).toBe('standard_work_duration_seed')
  })

  it('uses a published learnable parameter runtime weight for company benchmark blending', async () => {
    mocks.getProjectCompanyId.mockResolvedValue('company-1')
    mocks.loadAlgorithmAssetLearnableParameterRuntimeValue.mockImplementation(async (input: any) => (
      input.parameterKey === 'duration.benchmark_blend_weight' && input.consumptionMode === 'stable'
        ? {
            status: 'runtime_parameter_consumable',
            runtimeConsumable: true,
            parameterKey: 'duration.benchmark_blend_weight',
            runtimeValue: 0.6,
            consumptionMode: 'stable',
            publicationKey: 'learnable-parameter-runtime:duration-blend:company_override',
            publicationStatus: 'published',
            scopeLevel: 'company',
            companyId: 'company-1',
            projectId: null,
            rollbackTarget: 'duration.benchmark_blend_weight.default',
            reasons: [],
            writesSeedRuntimeDirectly: false,
          }
        : {
            status: 'runtime_parameter_not_found',
            runtimeConsumable: false,
            parameterKey: input.parameterKey,
            runtimeValue: null,
            consumptionMode: input.consumptionMode ?? 'stable',
            publicationKey: null,
            publicationStatus: null,
            scopeLevel: null,
            companyId: null,
            projectId: null,
            rollbackTarget: null,
            reasons: ['runtime_parameter_publication_not_found'],
            writesSeedRuntimeDirectly: false,
          }
    ))
    mocks.query.maybeSingle.mockImplementation(async () => {
      if (isCompanyBenchmarkScope('company-1')) {
        return {
          data: {
          duration_day_basis: 'construction_production_day',
          p50_days: 7,
          p75_days: 9,
          sample_count: 30,
          confidence_level: 'high',
          confidence_score: 88,
            company_id: 'company-1',
          },
          error: null,
        }
      }
      return { data: null, error: null }
    })
    mocks.resolveStandardWorkDurationSeed.mockResolvedValue({
      __stableCode: 'plastering_wall_ceiling',
      __resolverSource: 'active_seed',
      stableCode: 'plastering_wall_ceiling',
      defaultDaysP50: 10,
      defaultDaysP80: 14,
      fixedDays: 1,
      variableDays: 9,
      confidence: 'medium',
      benchmarkBasis: 'Plastering default per work face.',
    })

    const suggestion = await getTaskDurationSuggestion({
      companyId: 'company-1',
      projectId: 'project-1',
      standardWorkCode: 'plastering_wall_ceiling',
      taskTitle: 'wall plastering',
      wbsNodeType: 'process',
    })

    expect(mocks.loadAlgorithmAssetLearnableParameterRuntimeValue).toHaveBeenCalledWith(expect.objectContaining({
      parameterKey: 'duration.benchmark_blend_weight',
      companyId: 'company-1',
      projectId: 'project-1',
      consumptionMode: 'stable',
    }))
    expect(suggestion.recommendedDurationDays).toBe(9)
    expect(suggestion.businessReasonParams).toEqual(expect.objectContaining({
      companyBenchmarkBlendWeight: 0.6,
      companyBenchmarkBlendWeightSource: 'parameter_runtime_publication',
      companyBenchmarkBlendWeightPublicationKey: 'learnable-parameter-runtime:duration-blend:company_override',
      companyBenchmarkSampleCount: 30,
    }))
  })

  it('uses a canary P50/P75 blend ratio only through the explicit benchmark runtime boundary', async () => {
    mocks.getProjectCompanyId.mockResolvedValue('company-1')
    mocks.loadAlgorithmAssetLearnableParameterRuntimeValue.mockImplementation(async (input: any) => {
      if (input.parameterKey === 'duration.benchmark_blend_weight') {
        if (input.consumptionMode === 'canary') {
          return {
            status: 'runtime_parameter_not_found',
            runtimeConsumable: false,
            parameterKey: input.parameterKey,
            runtimeValue: null,
            consumptionMode: 'canary',
            publicationKey: null,
            publicationStatus: null,
            scopeLevel: null,
            companyId: null,
            projectId: null,
            rollbackTarget: null,
            reasons: ['runtime_parameter_publication_not_found'],
            writesSeedRuntimeDirectly: false,
          }
        }
        return {
          status: 'runtime_parameter_consumable',
          runtimeConsumable: true,
          parameterKey: 'duration.benchmark_blend_weight',
          runtimeValue: 0.5,
          consumptionMode: 'stable',
          publicationKey: 'learnable-parameter-runtime:duration-blend:company_override',
          publicationStatus: 'published',
          scopeLevel: 'company',
          companyId: 'company-1',
          projectId: null,
          rollbackTarget: 'duration.benchmark_blend_weight.default',
          reasons: [],
          writesSeedRuntimeDirectly: false,
        }
      }
      if (input.parameterKey === 'duration.p50_p75_blend_ratio') {
        return {
          status: 'runtime_parameter_consumable',
          runtimeConsumable: true,
          parameterKey: 'duration.p50_p75_blend_ratio',
          runtimeValue: 0.5,
          consumptionMode: 'canary',
          publicationKey: 'learnable-parameter-runtime:p50-p75-blend:company_canary',
          publicationStatus: 'canary',
          scopeLevel: 'company',
          companyId: 'company-1',
          projectId: null,
          rollbackTarget: 'duration.p50_p75_blend_ratio.default',
          reasons: [],
          writesSeedRuntimeDirectly: false,
        }
      }
      return {
        status: 'runtime_parameter_not_found',
        runtimeConsumable: false,
        parameterKey: input.parameterKey,
        runtimeValue: null,
        publicationKey: null,
        publicationStatus: null,
        scopeLevel: null,
        companyId: null,
        projectId: null,
        rollbackTarget: null,
        reasons: ['runtime_parameter_publication_not_found'],
        writesSeedRuntimeDirectly: false,
      }
    })
    mocks.query.maybeSingle.mockImplementation(async () => {
      if (isCompanyBenchmarkScope('company-1')) {
        return {
          data: {
          duration_day_basis: 'construction_production_day',
          p50_days: 8,
          p75_days: 14,
          sample_count: 30,
          confidence_level: 'high',
          confidence_score: 88,
            company_id: 'company-1',
          },
          error: null,
        }
      }
      return { data: null, error: null }
    })
    mocks.resolveStandardWorkDurationSeed.mockResolvedValue({
      __stableCode: 'plastering_wall_ceiling',
      __resolverSource: 'active_seed',
      stableCode: 'plastering_wall_ceiling',
      defaultDaysP50: 12,
      defaultDaysP80: 16,
      fixedDays: 1,
      variableDays: 11,
      confidence: 'medium',
      benchmarkBasis: 'Plastering default per work face.',
    })

    const suggestion = await getTaskDurationSuggestion({
      companyId: 'company-1',
      projectId: 'project-1',
      standardWorkCode: 'plastering_wall_ceiling',
      taskTitle: 'wall plastering',
      wbsNodeType: 'process',
    })

    expect(mocks.loadAlgorithmAssetLearnableParameterRuntimeValue).toHaveBeenCalledWith({
      parameterKey: 'duration.p50_p75_blend_ratio',
      companyId: 'company-1',
      projectId: 'project-1',
      consumptionMode: 'canary',
      canaryRuntimeBoundary: {
        consumerKey: 'durationSuggestionService.company_benchmark_p50_p75_blend',
        scopeBoundary: 'company',
        stopConditionKeys: [
          'duration_p50_p75_overcompensation_rate',
          'duration_p50_p75_mae_regression',
        ],
        monitoringWindowHours: 72,
      },
    })
    expect(suggestion.recommendedDurationDays).toBe(13)
    expect(suggestion.businessReasonParams).toEqual(expect.objectContaining({
      companyBenchmarkBlendWeight: 0.5,
      companyBenchmarkP50: 8,
      companyBenchmarkP75: 14,
      companyBenchmarkReferenceDays: 11,
      companyBenchmarkReferenceSource: 'p50_p75_runtime_publication',
      companyBenchmarkP50P75BlendRatio: 0.5,
      companyBenchmarkP50P75BlendRatioSource: 'parameter_runtime_publication',
      companyBenchmarkP50P75BlendRatioPublicationKey: 'learnable-parameter-runtime:p50-p75-blend:company_canary',
      companyBenchmarkP50P75BlendRatioAppliedTo: 'company_benchmark_runtime_reference_only',
    }))
  })

  it('uses an eligible anonymized cold-start baseline before company samples mature', async () => {
    mocks.getProjectCompanyId.mockResolvedValue('company-1')
    mocks.state.coldStartBaselinesData = [{
      id: 'baseline-segment-plastering',
      baseline_key: 'standard_work_duration:plastering_wall_ceiling',
      segment_key: 'residential:cast_in_place',
      scope_level: 'segment_baseline',
      anonymization_policy: 'anonymized_multi_company_aggregation',
      minimum_company_count: 3,
      minimum_project_count: 10,
      max_single_company_share: 0.4,
      baseline_value: { p50Days: 10 },
      evidence_summary: {
        applicableScenarioKeys: ['residential', 'cast_in_place'],
        contributingCompanyCount: 5,
        contributingProjectCount: 18,
        singleCompanyShare: 0.25,
        sourceAggregation: 'aggregate_summary_only',
      },
      rollback_target: { ref: 'cold-start-baseline:v1' },
    }]
    mocks.resolveStandardWorkDurationSeed.mockResolvedValue({
      __stableCode: 'plastering_wall_ceiling',
      __resolverSource: 'active_seed',
      stableCode: 'plastering_wall_ceiling',
      defaultDaysP50: 12,
      defaultDaysP80: 18,
      fixedDays: 1,
      variableDays: 11,
      confidence: 'medium',
      benchmarkBasis: 'Plastering default per work face.',
    })

    const suggestion = await getTaskDurationSuggestion({
      projectId: 'project-1',
      standardWorkCode: 'plastering_wall_ceiling',
      taskTitle: 'wall plastering',
      projectTypeCode: 'residential',
      structureTypeCode: 'cast_in_place',
      wbsNodeType: 'process',
      runtimeEvidenceMode: 'record',
    })

    expect(suggestion.recommendedDurationDays).toBe(10)
    expect(suggestion.forecastSource).toContain('cold_start_baseline')
    expect(suggestion.durationCalibrationSource).toBe('cold_start_baseline')
    expect(suggestion.businessReasonParams).toEqual(expect.objectContaining({
      coldStartBaselineStatus: 'shared_baseline_reference',
      coldStartBaselineId: 'baseline-segment-plastering',
      coldStartBaselineScope: 'segment_baseline',
      coldStartBaselineRuntimeValue: 10,
    }))
    expect(mocks.recordDurationAccuracyPrediction).toHaveBeenCalledWith(expect.objectContaining({
      runtimeConsumptionState: 'cold_start_baseline',
      seedLineage: expect.objectContaining({
        durationCalibrationSource: 'cold_start_baseline',
      }),
    }))
  })

  it('does not consume rolled-back cold-start baselines for new task references', async () => {
    mocks.getProjectCompanyId.mockResolvedValue('company-1')
    mocks.state.coldStartBaselinesData = [{
      id: 'rolled-back-baseline-segment-plastering',
      baseline_key: 'standard_work_duration:plastering_wall_ceiling',
      segment_key: 'residential:cast_in_place',
      scope_level: 'segment_baseline',
      runtime_publication_status: 'runtime_rolled_back',
      anonymization_policy: 'anonymized_multi_company_aggregation',
      minimum_company_count: 3,
      minimum_project_count: 10,
      max_single_company_share: 0.4,
      baseline_value: { p50Days: 10 },
      evidence_summary: {
        applicableScenarioKeys: ['residential', 'cast_in_place'],
        contributingCompanyCount: 5,
        contributingProjectCount: 18,
        singleCompanyShare: 0.25,
        sourceAggregation: 'aggregate_summary_only',
      },
      rollback_target: { ref: 'cold-start-baseline:v1' },
      rollback_execution: {
        status: 'cold_start_baseline_runtime_rolled_back',
        reason: 'impact_monitoring_regression',
      },
    }]
    mocks.resolveStandardWorkDurationSeed.mockResolvedValue({
      __stableCode: 'plastering_wall_ceiling',
      __resolverSource: 'active_seed',
      stableCode: 'plastering_wall_ceiling',
      defaultDaysP50: 12,
      defaultDaysP80: 18,
      fixedDays: 1,
      variableDays: 11,
      confidence: 'medium',
      benchmarkBasis: 'Plastering default per work face.',
    })

    const suggestion = await getTaskDurationSuggestion({
      projectId: 'project-1',
      standardWorkCode: 'plastering_wall_ceiling',
      taskTitle: 'wall plastering',
      projectTypeCode: 'residential',
      structureTypeCode: 'cast_in_place',
      wbsNodeType: 'process',
      runtimeEvidenceMode: 'record',
    })

    expect(suggestion.recommendedDurationDays).not.toBe(10)
    expect(suggestion.forecastSource).not.toContain('cold_start_baseline')
    expect(suggestion.durationCalibrationSource).not.toBe('cold_start_baseline')
    expect(suggestion.businessReasonParams).toEqual(expect.objectContaining({
      coldStartBaselineStatus: 'cold_start_review_required',
      coldStartBaselineId: null,
      coldStartBaselineRuntimeValue: null,
    }))
    expect(mocks.recordDurationAccuracyPrediction).toHaveBeenCalledWith(expect.objectContaining({
      runtimeConsumptionState: 'seed_only',
      seedLineage: expect.objectContaining({
        durationCalibrationSource: 'standard_work_duration_seed',
      }),
    }))
  })

  it('does not use broad global all-context benchmark unless the sample is very mature', async () => {
    mocks.query.maybeSingle.mockImplementation(async () => {
      if (isGlobalBenchmarkScope() && String(currentBenchmarkKey()).endsWith(':all')) {
        return {
          data: {
          duration_day_basis: 'construction_production_day',
          p50_days: 20,
          p75_days: 24,
          sample_count: 80,
          confidence_level: 'high',
          confidence_score: 82,
          },
          error: null,
        }
      }
      return { data: null, error: null }
    })
    mocks.resolveStandardWorkDurationSeed.mockResolvedValue({
      __stableCode: 'plastering_wall_ceiling',
      stableCode: 'plastering_wall_ceiling',
      defaultDaysP50: 8,
      defaultDaysP80: 12,
      fixedDays: 1,
      variableDays: 7,
      confidence: 'medium',
      benchmarkBasis: 'Plastering default per work face.',
    })

    const suggestion = await getTaskDurationSuggestion({
      suggestionPurpose: 'execution_reference',
      projectId: 'project-1',
      standardWorkCode: 'plastering_wall_ceiling',
      taskTitle: 'wall plastering',
      projectTypeCode: 'commercial',
      wbsNodeType: 'process',
    })

    expect(suggestion.recommendedDurationDays).toBe(10)
    expect(suggestion.durationProvenance).toBe('standard_work_duration_seed')
    expect(suggestion.businessReasonParams?.benchmarkGeneralizationSkipped).toBe(true)
  })

  it('blends E1 seed and company benchmark candidates for execution reference instead of replacing one with the other', async () => {
    mocks.query.maybeSingle.mockImplementation(async () => {
      if (isCompanyBenchmarkScope('company-1')) {
        return {
          data: {
          duration_day_basis: 'construction_production_day',
          p50_days: 6,
          p75_days: 8,
          p80_days: 10,
          sample_count: 30,
          confidence_level: 'high',
          confidence_score: 88,
            company_id: 'company-1',
          },
          error: null,
        }
      }
      return { data: null, error: null }
    })
    mocks.resolveStandardWorkDurationSeed.mockResolvedValue({
      __stableCode: 'plastering_wall_ceiling',
      stableCode: 'plastering_wall_ceiling',
      defaultDaysP50: 10,
      defaultDaysP80: 14,
      fixedDays: 2,
      variableDays: 8,
      confidence: 'medium',
      benchmarkBasis: 'Seed reference.',
    })

    const suggestion = await getTaskDurationSuggestion({
      suggestionPurpose: 'execution_reference',
      projectId: 'project-1',
      companyId: 'company-1',
      standardWorkCode: 'plastering_wall_ceiling',
      taskTitle: 'wall plastering',
      progress: 10,
      wbsNodeType: 'process',
    })

    expect(suggestion.recommendedDurationDays).toBe(8)
    expect(suggestion.conservativeDurationDays).toBe(12)
    expect(suggestion.businessReasonParams?.companyBenchmarkBlendWeight).toBe(0.7)
    expect(suggestion.businessReasonParams?.benchmarkCauseSelection).toBe('no_confirmed_cause')
    expect(suggestion.durationCalibrationSource).toBe('standard_work_duration_seed+company_history_sample')
  })

  it.each([
    { label: 'non-zero variance', variance: 0.15, coefficientOfVariation: Math.sqrt(0.15) / 4.5 },
    { label: 'zero variance', variance: 0, coefficientOfVariation: 0 },
  ])('prefers an exact confirmed cause segment and preserves $label in its DTO', async ({ variance, coefficientOfVariation }) => {
    const benchmarkSelects: string[] = []
    mocks.query.select.mockImplementation((columns?: string) => {
      if (isDurationBenchmarkQuery() && typeof columns === 'string') benchmarkSelects.push(columns)
      return mocks.query
    })
    mocks.query.maybeSingle.mockImplementation(async () => {
      if (!isCompanyBenchmarkScope('company-1')) return { data: null, error: null }
      return {
        data: {
          id: 'benchmark-company-1',
          benchmark_version: 'v7',
          company_id: 'company-1',
          project_id: null,
          duration_day_basis: 'construction_production_day',
          p50_days: 8,
          p75_days: 9,
          p80_days: 11,
          sample_count: 30,
          confidence_level: 'high',
          confidence_score: 88,
          generated_at: '2026-07-21T00:00:00.000Z',
          source_window_start: '2026-07-01T00:00:00.000Z',
          source_as_of: '2026-07-20T00:00:00.000Z',
          metadata: { calendar_ref: 'parent-calendar', calendar_version: 'parent-v1' },
        },
        error: null,
      }
    })
    mocks.loadCurrentCauseSegment.mockResolvedValue({
      id: 'segment-material-1',
      benchmarkId: 'benchmark-company-1',
      companyId: 'company-1',
      projectId: null,
      causeCode: 'material_shortage',
      taxonomyVersion: 'v1.0.0',
      sampleCount: 6,
      p50Days: 4,
      p75Days: 5,
      p80Days: 6,
      meanDays: 4.5,
      variance,
      generatedAt: '2026-07-21T00:00:00.000Z',
      sourceWindowStart: '2026-07-01T00:00:00.000Z',
      sourceAsOf: '2026-07-20T00:00:00.000Z',
      durationDayBasis: 'construction_production_day',
      calendarRef: 'cn-work-calendar',
      calendarVersion: '2026.07',
    })
    mocks.resolveStandardWorkDurationSeed.mockResolvedValue({
      __stableCode: 'plastering_wall_ceiling',
      stableCode: 'plastering_wall_ceiling',
      defaultDaysP50: 10,
      defaultDaysP80: 14,
      fixedDays: 2,
      variableDays: 8,
      confidence: 'medium',
      benchmarkBasis: 'Seed reference.',
    })

    const suggestion = await getTaskDurationSuggestion({
      suggestionPurpose: 'execution_reference',
      projectId: 'project-1',
      companyId: 'company-1',
      standardWorkCode: 'plastering_wall_ceiling',
      taskTitle: 'wall plastering delayed by materials',
      wbsNodeType: 'process',
      confirmedCauseCode: 'material_shortage',
    })

    expect(mocks.loadCurrentCauseSegment).toHaveBeenCalledWith({
      benchmarkId: 'benchmark-company-1',
      causeCode: 'material_shortage',
      companyId: 'company-1',
      projectId: null,
    }, expect.any(Function))
    expect(suggestion.benchmarkCauseSegment).toEqual(expect.objectContaining({
      causeCode: 'material_shortage',
      taxonomyVersion: 'v1.0.0',
      generatedAt: '2026-07-21T00:00:00.000Z',
      sourceAsOf: '2026-07-20T00:00:00.000Z',
      sampleCount: 6,
    }))
    expect(suggestion).toMatchObject({
      benchmarkGeneratedAt: '2026-07-21T00:00:00.000Z',
      benchmarkAsOf: '2026-07-20T00:00:00.000Z',
      benchmarkWindowStart: '2026-07-01T00:00:00.000Z',
      benchmarkVersion: 'v7',
      benchmarkSampleCount: 6,
      benchmarkDayBasis: 'construction_production_day',
      benchmarkScope: 'company',
      benchmarkProvenanceAvailability: 'available',
      benchmarkProvenance: {
        mode: 'single',
        entries: [expect.objectContaining({
          source: 'cause_segment',
          benchmarkId: 'benchmark-company-1',
          benchmarkVersion: 'v7',
          scope: 'company',
          generatedAt: '2026-07-21T00:00:00.000Z',
          sourceAsOf: '2026-07-20T00:00:00.000Z',
          sourceWindowStart: '2026-07-01T00:00:00.000Z',
          sampleCount: 6,
          dayBasis: 'construction_production_day',
          calendarRef: 'cn-work-calendar',
          calendarVersion: '2026.07',
          causeSegment: { causeCode: 'material_shortage', taxonomyVersion: 'v1.0.0' },
          availability: 'available',
        })],
      },
    })
    expect(suggestion.businessReasonParams).toEqual(expect.objectContaining({
      benchmarkP50: 4,
      benchmarkCauseFallback: null,
      benchmarkCauseSelection: 'exact_cause',
    }))
    expect(suggestion.recommendedDurationDays).toBe(10)
    expect(suggestion.conservativeDurationDays).toBe(12)
    expect(suggestion.calculationContext).toEqual(expect.objectContaining({
      durationDistribution: expect.objectContaining({
        variance,
        coefficientOfVariation: expect.closeTo(coefficientOfVariation, 6),
      }),
    }))
    expect(benchmarkSelects.some((columns) => columns.includes('id'))).toBe(true)
    expect(benchmarkSelects.some((columns) => columns.includes('project_id'))).toBe(true)
    expect(benchmarkSelects.some((columns) => columns.includes('generated_at'))).toBe(true)
    expect(benchmarkSelects.some((columns) => columns.includes('source_window_start'))).toBe(true)
    expect(benchmarkSelects.some((columns) => columns.includes('source_as_of'))).toBe(true)
  })

  it('keeps the all-cause benchmark and marks fallback when the confirmed cause has no exact segment', async () => {
    mocks.query.maybeSingle.mockImplementation(async () => {
      if (!isCompanyBenchmarkScope('company-1')) return { data: null, error: null }
      return {
        data: {
          id: 'benchmark-company-1',
          company_id: 'company-1',
          project_id: null,
          duration_day_basis: 'construction_production_day',
          p50_days: 8,
          p75_days: 9,
          p80_days: 11,
          sample_count: 30,
          confidence_level: 'high',
          confidence_score: 88,
          generated_at: '2026-07-21T00:00:00.000Z',
          source_window_start: '2026-07-01T00:00:00.000Z',
          source_as_of: '2026-07-20T00:00:00.000Z',
        },
        error: null,
      }
    })
    mocks.resolveStandardWorkDurationSeed.mockResolvedValue({
      __stableCode: 'plastering_wall_ceiling',
      stableCode: 'plastering_wall_ceiling',
      defaultDaysP50: 10,
      defaultDaysP80: 14,
      fixedDays: 2,
      variableDays: 8,
      confidence: 'medium',
      benchmarkBasis: 'Seed reference.',
    })

    const suggestion = await getTaskDurationSuggestion({
      suggestionPurpose: 'execution_reference',
      projectId: 'project-1',
      companyId: 'company-1',
      standardWorkCode: 'plastering_wall_ceiling',
      taskTitle: 'wall plastering delayed by quality rework',
      wbsNodeType: 'process',
      confirmedCauseCode: 'quality_rework',
    })

    expect(suggestion.benchmarkCauseSegment).toBeNull()
    expect(suggestion.businessReasonParams?.benchmarkCauseFallback).toBe('all_cause')
    expect(suggestion.businessReasonParams?.benchmarkCauseSelection).toBe('all_cause_fallback')
    expect(suggestion.businessReasonParams?.benchmarkP50).toBe(8)
  })

  it.each([
    {
      authority: { state: 'confirmed', causeCode: 'material_shortage', taxonomyVersion: 'v1.0.0', reasonCodes: [] },
      selection: 'all_cause_fallback', candidateCount: 1, segmentReads: 1,
    },
    {
      authority: { state: 'no_cause', causeCode: null, taxonomyVersion: 'v1.0.0', reasonCodes: [] },
      selection: 'no_confirmed_cause', candidateCount: 1, segmentReads: 0,
    },
    {
      authority: { state: 'review_required', causeCode: 'quality_rework', taxonomyVersion: 'v1.0.0', reasonCodes: ['manual_review'] },
      selection: 'cause_authority_review_required', candidateCount: 0, segmentReads: 0,
    },
    {
      authority: { state: 'unavailable', causeCode: null, taxonomyVersion: 'v1.0.0', reasonCodes: ['structured_cause_read_failed'] },
      selection: 'cause_authority_unavailable', candidateCount: 0, segmentReads: 0,
    },
  ])('applies the $authority.state authority state without converting it to no-cause history', async ({
    authority,
    selection,
    candidateCount,
    segmentReads,
  }) => {
    mocks.loadCurrentCauseSegment.mockResolvedValue(null)
    const candidate = {
      benchmark: {
        id: 'benchmark-company-1', company_id: 'company-1', project_id: null,
        p50_days: 8, p75_days: 9, p80_days: 11, mean_days: 8.5, sample_count: 30,
        variance: 2.25, coefficient_of_variation: 0.176471,
        duration_day_basis: 'construction_production_day' as const,
      },
      scope: 'company' as const,
      benchKey: 'SW-1:process:all',
      contextKey: 'all',
      sampleSize: 30,
      specificity: 'all' as const,
    }

    const result = await selectCauseAwareBenchmarkCandidates([candidate], authority as any)

    expect(result.selection).toBe(selection)
    expect(result.candidates).toHaveLength(candidateCount)
    expect(mocks.loadCurrentCauseSegment).toHaveBeenCalledTimes(segmentReads)
    if (authority.state === 'review_required' || authority.state === 'unavailable') {
      expect(result.fallback).toBeNull()
    }
  })

  it('fails closed without all-cause blending when exact cause segment reading fails', async () => {
    mocks.query.maybeSingle.mockImplementation(async () => {
      if (!isCompanyBenchmarkScope('company-1')) return { data: null, error: null }
      return {
        data: {
          id: 'benchmark-company-1',
          company_id: 'company-1',
          project_id: null,
          duration_day_basis: 'construction_production_day',
          p50_days: 8,
          p75_days: 9,
          p80_days: 11,
          sample_count: 30,
          confidence_level: 'high',
          confidence_score: 88,
          generated_at: '2026-07-21T00:00:00.000Z',
          source_window_start: '2026-07-01T00:00:00.000Z',
          source_as_of: '2026-07-20T00:00:00.000Z',
        },
        error: null,
      }
    })
    mocks.loadCurrentCauseSegment.mockRejectedValue(new Error('segment read denied'))
    mocks.resolveStandardWorkDurationSeed.mockResolvedValue({
      __stableCode: 'plastering_wall_ceiling',
      stableCode: 'plastering_wall_ceiling',
      defaultDaysP50: 10,
      defaultDaysP80: 14,
      fixedDays: 2,
      variableDays: 8,
      confidence: 'medium',
      benchmarkBasis: 'Seed reference.',
    })

    const suggestion = await getTaskDurationSuggestion({
      suggestionPurpose: 'execution_reference',
      projectId: 'project-1',
      companyId: 'company-1',
      standardWorkCode: 'plastering_wall_ceiling',
      taskTitle: 'wall plastering delayed by materials',
      wbsNodeType: 'process',
      confirmedCauseCode: 'material_shortage',
    })

    expect(suggestion.benchmarkCauseSegment).toBeNull()
    expect(suggestion.businessReasonParams).toEqual(expect.objectContaining({
      benchmarkCauseFallback: null,
      benchmarkCauseSelection: 'cause_segment_read_failed',
    }))
    expect(suggestion.businessReasonParams?.benchmarkP50).toBeUndefined()
    expect(suggestion.businessReasonParams?.companyBenchmarkBlendWeight).toBeUndefined()
  })

  it.each([1, 4])('falls back to all-cause duration outputs when an exact cause segment has only %i samples', async (sampleCount) => {
    mocks.query.maybeSingle.mockImplementation(async () => {
      if (!isCompanyBenchmarkScope('company-1')) return { data: null, error: null }
      return {
        data: {
          id: 'benchmark-company-1',
          company_id: 'company-1',
          project_id: null,
          duration_day_basis: 'construction_production_day',
          p50_days: 8,
          p75_days: 9,
          p80_days: 11,
          sample_count: 30,
          confidence_level: 'high',
          confidence_score: 88,
          generated_at: '2026-07-21T00:00:00.000Z',
          source_window_start: '2026-07-01T00:00:00.000Z',
          source_as_of: '2026-07-20T00:00:00.000Z',
        },
        error: null,
      }
    })
    mocks.loadCurrentCauseSegment.mockResolvedValue({
      id: `segment-thin-${sampleCount}`,
      benchmarkId: 'benchmark-company-1',
      companyId: 'company-1',
      projectId: null,
      causeCode: 'material_shortage',
      taxonomyVersion: 'v1.0.0',
      sampleCount,
      p50Days: 4,
      p75Days: 5,
      p80Days: 6,
      meanDays: 4.5,
      variance: 0.15,
      generatedAt: '2026-07-21T00:00:00.000Z',
      sourceWindowStart: '2026-07-01T00:00:00.000Z',
      sourceAsOf: '2026-07-20T00:00:00.000Z',
      durationDayBasis: 'construction_production_day',
      calendarRef: 'cn-work-calendar',
      calendarVersion: '2026.07',
    })
    mocks.resolveStandardWorkDurationSeed.mockResolvedValue({
      __stableCode: 'plastering_wall_ceiling',
      stableCode: 'plastering_wall_ceiling',
      defaultDaysP50: 10,
      defaultDaysP80: 14,
      fixedDays: 2,
      variableDays: 8,
      confidence: 'medium',
      benchmarkBasis: 'Seed reference.',
    })

    const suggestion = await getTaskDurationSuggestion({
      suggestionPurpose: 'execution_reference',
      projectId: 'project-1',
      companyId: 'company-1',
      standardWorkCode: 'plastering_wall_ceiling',
      taskTitle: 'wall plastering delayed by materials',
      wbsNodeType: 'process',
      confirmedCauseCode: 'material_shortage',
    })

    expect(suggestion.recommendedDurationDays).toBe(10)
    expect(suggestion.conservativeDurationDays).toBe(13)
    expect(suggestion.benchmarkCauseSegment).toBeNull()
    expect(suggestion.businessReasonParams).toEqual(expect.objectContaining({
      benchmarkCauseFallback: 'all_cause',
      benchmarkCauseSelection: 'all_cause_fallback',
      benchmarkP50: 8,
      benchmarkBlendWeight: 0.7,
    }))
  })

  it('blends E1 seed and mature global benchmark candidates for execution reference instead of replacing the seed', async () => {
    mocks.query.maybeSingle.mockImplementation(async () => {
      if (isGlobalBenchmarkScope()) {
        return {
          data: {
          duration_day_basis: 'construction_production_day',
          p50_days: 6,
          p75_days: 8,
          p80_days: 10,
          sample_count: 60,
          confidence_level: 'high',
          confidence_score: 86,
          },
          error: null,
        }
      }
      return { data: null, error: null }
    })
    mocks.resolveStandardWorkDurationSeed.mockResolvedValue({
      __stableCode: 'plastering_wall_ceiling',
      stableCode: 'plastering_wall_ceiling',
      defaultDaysP50: 10,
      defaultDaysP80: 14,
      fixedDays: 2,
      variableDays: 8,
      confidence: 'medium',
      benchmarkBasis: 'Seed reference.',
    })

    const suggestion = await getTaskDurationSuggestion({
      suggestionPurpose: 'execution_reference',
      projectId: 'project-1',
      standardWorkCode: 'plastering_wall_ceiling',
      taskTitle: 'wall plastering',
      projectTypeCode: 'commercial',
      progress: 10,
      wbsNodeType: 'process',
    })

    expect(suggestion.recommendedDurationDays).toBe(8)
    expect(suggestion.conservativeDurationDays).toBe(12)
    expect(suggestion.durationProvenance).toBe('standard_work_duration_seed')
    expect(suggestion.durationCalibrationSource).toBe('standard_work_duration_seed+global_history_sample')
    expect(suggestion.businessReasonParams).toEqual(expect.objectContaining({
      benchmarkBlendScope: 'global',
      benchmarkBlendWeight: 0.7,
      benchmarkSampleCount: 60,
    }))
  })

  it('blends project, company and global benchmark candidates together for execution reference', async () => {
    mocks.query.maybeSingle.mockImplementation(async () => {
      if (mocks.from.mock.calls.at(-1)?.[0] !== 'duration_benchmarks') {
        return { data: null, error: null }
      }
      if (isProjectBenchmarkScope('project-1')) {
        return {
          data: {
            duration_day_basis: 'construction_production_day',
            p50_days: 7,
            p75_days: 7,
            p80_days: 9,
            sample_count: 8,
            confidence_level: 'medium',
            confidence_score: 72,
            project_id: 'project-1',
          },
          error: null,
        }
      }
      if (isCompanyBenchmarkScope('company-1')) {
        return {
          data: {
            duration_day_basis: 'construction_production_day',
            p50_days: 6,
            p75_days: 6,
            p80_days: 8,
            sample_count: 20,
            confidence_level: 'high',
            confidence_score: 88,
            company_id: 'company-1',
          },
          error: null,
        }
      }
      if (isGlobalBenchmarkScope()) {
        return {
          data: {
            duration_day_basis: 'construction_production_day',
            p50_days: 12,
            p75_days: 12,
            p80_days: 14,
            sample_count: 120,
            confidence_level: 'high',
            confidence_score: 84,
          },
          error: null,
        }
      }
      return { data: null, error: null }
    })
    mocks.resolveStandardWorkDurationSeed.mockResolvedValue({
      __stableCode: 'plastering_wall_ceiling',
      stableCode: 'plastering_wall_ceiling',
      defaultDaysP50: 10,
      defaultDaysP80: 14,
      fixedDays: 2,
      variableDays: 8,
      confidence: 'medium',
      benchmarkBasis: 'Seed reference.',
    })

    const suggestion = await getTaskDurationSuggestion({
      suggestionPurpose: 'execution_reference',
      projectId: 'project-1',
      companyId: 'company-1',
      standardWorkCode: 'plastering_wall_ceiling',
      taskTitle: 'wall plastering',
      progress: 10,
      wbsNodeType: 'process',
    })

    expect(suggestion.recommendedDurationDays).toBe(10)
    expect(suggestion.durationCalibrationSource).toBe('standard_work_duration_seed+mixed_history_sample')
    expect(suggestion.businessReasonParams).toEqual(expect.objectContaining({
      benchmarkBlendScopes: ['project', 'company', 'global'],
      benchmarkBlendCandidateCount: 3,
    }))
  })

  it('publishes complete normalized provenance for a project and industry mixed blend', async () => {
    mocks.getProjectCompanyId.mockResolvedValue('company-1')
    mocks.query.maybeSingle.mockImplementation(async () => {
      if (isProjectBenchmarkScope('project-1')) {
        return {
          data: completePersistedBenchmark({
            id: 'benchmark-project-1',
            benchmark_version: 'project-v3',
            company_id: 'company-1',
            project_id: 'project-1',
            sample_count: 20,
            generated_at: '2026-07-01T08:00:00.000Z',
            source_window_start: '2026-05-01T00:00:00.000Z',
            source_as_of: '2026-06-29T23:59:59.000Z',
            metadata: { calendar_ref: 'project-calendar', calendar_version: 'project-v2' },
          }),
          error: null,
        }
      }
      return { data: null, error: null }
    })
    const queryExec = async <T = Record<string, unknown>>(sql: string): Promise<T[]> => {
      if (!sql.includes('from public.duration_learning_runtime_publications')) return [] as T[]
      return [{
        publication_key: 'runtime-industry-mixed',
        asset_key: 'base_duration_benchmark',
        artifact_key: 'plastering_wall_ceiling:process:all',
        scope_level: 'industry',
        company_id: null,
        project_id: null,
        industry_key: 'general_civil',
        publication_stage: 'stable',
        runtime_payload: {
          ...completeRuntimeBenchmarkPayload({
            benchmarkId: undefined,
            benchmarkVersion: 'aggregate:industry:fedcba9876543210',
            sampleCount: 100,
            generatedAt: '2026-07-03T08:00:00.000Z',
          }),
          benchmarkKind: 'aggregate_all_cause',
          causeApplicability: 'all_cause',
          calendarRef: undefined,
          calendarVersion: undefined,
          aggregateProvenance: {
            schemaVersion: 'duration-benchmark-aggregate/v1',
            scopeLevel: 'industry',
            sourceBenchmarkIds: ['benchmark-industry-source-1'],
            sourceBenchmarkVersions: ['industry-v2'],
            sourceProjectIds: ['industry-project-1'],
            sourceCompanyIds: ['industry-company-1'],
            sourceIndustryKeys: ['general_civil'],
            calendarIdentities: [{ calendarRef: 'industry-calendar', calendarVersion: 'industry-v4' }],
          },
        },
        previous_publication_key: null,
        traffic_percent: 100,
        monitoring_status: 'passed',
        published_at: '2026-07-03T08:00:00.000Z',
      }] as T[]
    }
    mocks.resolveStandardWorkDurationSeed.mockResolvedValue({
      __stableCode: 'plastering_wall_ceiling',
      stableCode: 'plastering_wall_ceiling',
      defaultDaysP50: 10,
      defaultDaysP80: 14,
      confidence: 'medium',
    })

    const suggestion = await getTaskDurationSuggestion({
      suggestionPurpose: 'execution_reference',
      projectId: 'project-1',
      companyId: 'company-1',
      standardWorkCode: 'plastering_wall_ceiling',
      taskTitle: 'wall plastering',
      projectTypeCode: 'general_civil',
      progress: 10,
      wbsNodeType: 'process',
      runtimeConsumerObservationQueryExec: queryExec,
    })

    expect(suggestion).toMatchObject({
      benchmarkGeneratedAt: '2026-07-03T08:00:00.000Z',
      benchmarkAsOf: '2026-06-29T23:59:59.000Z',
      benchmarkWindowStart: '2026-04-01T00:00:00.000Z',
      benchmarkVersion: null,
      benchmarkSampleCount: 120,
      benchmarkDayBasis: 'construction_production_day',
      benchmarkScope: 'mixed',
      benchmarkProvenanceAvailability: 'available',
      benchmarkProvenanceReasonCodes: [],
      benchmarkProvenance: {
        mode: 'blended',
        entries: [
          expect.objectContaining({
            source: 'persisted_benchmark',
            benchmarkId: 'benchmark-project-1',
            benchmarkVersion: 'project-v3',
            scope: 'project',
            blendWeight: 0.5,
          }),
          expect.objectContaining({
            source: 'runtime_publication',
            publicationKey: 'runtime-industry-mixed',
            benchmarkVersion: 'aggregate:industry:fedcba9876543210',
            scope: 'industry',
            blendWeight: 0.5,
          }),
        ],
      },
    })
    expect(suggestion.benchmarkProvenance?.entries).toHaveLength(2)
    expect(suggestion.benchmarkProvenance?.entries.map((entry) => entry.scope)).toEqual(['project', 'industry'])
  })

  it('derives conservative P80 from benchmark variance when explicit benchmark P80 is unavailable', async () => {
    const benchmarkSelects: string[] = []
    mocks.query.select.mockImplementation((columns?: string) => {
      if (isDurationBenchmarkQuery() && typeof columns === 'string') benchmarkSelects.push(columns)
      return mocks.query
    })
    mocks.query.maybeSingle.mockImplementation(async () => {
      if (isCompanyBenchmarkScope('company-1')) {
        return {
          data: {
          duration_day_basis: 'construction_production_day',
          p50_days: 8,
          p75_days: 9,
          sample_count: 24,
          variance: 0.32,
          confidence_level: 'high',
          confidence_score: 86,
            company_id: 'company-1',
          },
          error: null,
        }
      }
      return { data: null, error: null }
    })
    mocks.resolveStandardWorkDurationSeed.mockResolvedValue({
      __stableCode: 'plastering_wall_ceiling',
      stableCode: 'plastering_wall_ceiling',
      defaultDaysP50: 10,
      defaultDaysP80: 12,
      fixedDays: 2,
      variableDays: 8,
      confidence: 'medium',
      benchmarkBasis: 'Seed reference.',
    })

    const suggestion = await getTaskDurationSuggestion({
      companyId: 'company-1',
      standardWorkCode: 'plastering_wall_ceiling',
      taskTitle: 'wall plastering',
      wbsNodeType: 'process',
    })

    expect(suggestion.recommendedDurationDays).toBe(9)
    expect(suggestion.conservativeDurationDays).toBe(15)
    expect(suggestion.businessReasonParams?.companyBenchmarkP80).toBe(18)
    expect(suggestion.businessReasonParams?.companyBenchmarkP80Source).toBe('variance_derived')
    expect(suggestion.businessReasonParams).toEqual(expect.objectContaining({
      benchmarkVariance: 0.32,
      companyBenchmarkVariance: 0.32,
    }))
    expect(suggestion.calculationContext).toEqual(expect.objectContaining({
      durationDistribution: expect.objectContaining({
        p50: 8,
        p80: 18,
        variance: 0.32,
        source: 'duration_benchmarks',
      }),
    }))
    expect(benchmarkSelects.some((columns) => columns.includes('variance'))).toBe(true)
    expect(benchmarkSelects.some((columns) => columns.includes('coefficient_of_variation'))).toBe(true)
  })

  it('does not cap explicit quantity scaling at 3x for very large scoped work', async () => {
    mocks.resolveStandardWorkDurationSeed.mockResolvedValue({
      __stableCode: 'large_installation_points',
      stableCode: 'large_installation_points',
      defaultDaysP50: 10,
      defaultDaysP80: 14,
      defaultQuantity: 100,
      quantityUnit: 'point',
      quantityScaleExponent: 1,
      fixedDays: 2,
      variableDays: 8,
      confidence: 'medium',
      benchmarkBasis: 'Installation point baseline.',
    })

    const suggestion = await getTaskDurationSuggestion({
      standardWorkCode: 'large_installation_points',
      taskTitle: 'large installation points',
      wbsNodeType: 'process',
      taskQuantity: 600,
      taskQuantityUnit: 'point',
    })

    expect(suggestion.recommendedDurationDays).toBe(62)
    expect(suggestion.businessReasonParams?.scaleFactor).toBe(6)
  })

  it('keeps high-CV benchmark variance in conservative P80 derivation instead of clipping at 0.4', async () => {
    mocks.query.maybeSingle.mockImplementation(async () => {
      if (isCompanyBenchmarkScope('company-1')) {
        return {
          data: {
            duration_day_basis: 'construction_production_day',
            p50_days: 8,
            p75_days: 10,
            sample_count: 18,
            metadata: {
              variance: 0.55,
              coefficientOfVariation: 0.55,
            },
            confidence_level: 'medium',
            confidence_score: 70,
            company_id: 'company-1',
          },
          error: null,
        }
      }
      return { data: null, error: null }
    })
    mocks.resolveStandardWorkDurationSeed.mockResolvedValue({
      __stableCode: 'demolition_high_variance',
      stableCode: 'demolition_high_variance',
      defaultDaysP50: 10,
      defaultDaysP80: 14,
      fixedDays: 2,
      variableDays: 8,
      confidence: 'medium',
      benchmarkBasis: 'High variance demolition baseline.',
    })

    const suggestion = await getTaskDurationSuggestion({
      companyId: 'company-1',
      standardWorkCode: 'demolition_high_variance',
      taskTitle: 'demolition high variance',
      wbsNodeType: 'process',
    })

    expect(suggestion.businessReasonParams?.companyBenchmarkP80).toBe(25)
    expect(suggestion.businessReasonParams?.companyBenchmarkP80Source).toBe('variance_derived')
    expect(suggestion.calculationContext).toEqual(expect.objectContaining({
      durationDistribution: expect.objectContaining({
        p80: 25,
        variance: 0.55,
      }),
    }))
  })

  it('anchors standard seed recommendation on declared mean or P50/P80 pair instead of bare P50', async () => {
    mocks.resolveStandardWorkDurationSeed.mockResolvedValue({
      __stableCode: 'earthwork_bulk_excavation',
      stableCode: 'earthwork_bulk_excavation',
      defaultDaysP50: 10,
      defaultDaysP80: 18,
      meanDays: 13,
      fixedDays: 2,
      variableDays: 11,
      confidence: 'medium',
      benchmarkBasis: 'Earthwork high-variance baseline.',
    })

    const suggestion = await getTaskDurationSuggestion({
      standardWorkCode: 'earthwork_bulk_excavation',
      taskTitle: 'earthwork bulk excavation',
      wbsNodeType: 'process',
    })

    expect(suggestion.recommendedDurationDays).toBe(13)
    expect(suggestion.conservativeDurationDays).toBe(18)
    expect(suggestion.businessReasonParams?.seedReferenceAnchor).toBe('mean')
  })

  it('uses the P50/P80 pair as the standard seed recommendation when mean is unavailable', async () => {
    mocks.resolveStandardWorkDurationSeed.mockResolvedValue({
      __stableCode: 'wide_variance_seed',
      stableCode: 'wide_variance_seed',
      defaultDaysP50: 10,
      defaultDaysP80: 18,
      fixedDays: 2,
      variableDays: 8,
      confidence: 'medium',
      benchmarkBasis: 'Wide variance seed.',
    })

    const suggestion = await getTaskDurationSuggestion({
      standardWorkCode: 'wide_variance_seed',
      taskTitle: 'wide variance process',
      wbsNodeType: 'process',
    })

    expect(suggestion.recommendedDurationDays).toBe(13)
    expect(suggestion.conservativeDurationDays).toBe(18)
    expect(suggestion.businessReasonParams?.seedReferenceAnchor).toBe('p50_p80')
  })

  it('marks company-governed standard seed as L2 without adding a runtime company multiplier', async () => {
    mocks.resolveStandardWorkDurationSeed.mockResolvedValue({
      __stableCode: 'plastering_wall_ceiling',
      __resolverSource: 'company_override',
      stableCode: 'plastering_wall_ceiling',
      defaultDaysP50: 6,
      defaultDaysP80: 9,
      fixedDays: 1,
      variableDays: 5,
      confidence: 'high',
      benchmarkBasis: 'Company-governed duration seed.',
      sampleCount: 22,
      durationCaliberVersion: 'company-v3',
    })

    const suggestion = await getTaskDurationSuggestion({
      projectId: 'project-1',
      standardWorkCode: 'plastering_wall_ceiling',
      taskTitle: 'wall plastering',
      wbsNodeType: 'process',
    })

    expect(suggestion.recommendedDurationDays).toBe(7)
    expect(suggestion.conservativeDurationDays).toBe(10)
    expect(suggestion.dataMaturity).toBe('L2')
    expect(suggestion.factorAvailability?.company_governed_seed).toBe(true)
    expect(suggestion.forecastSource).toBe('standard_work_duration_seed+project_execution_context')
  })

  it('caps abnormal seed P80 ratio and lowers confidence instead of exposing a confusing conservative duration', async () => {
    mocks.resolveStandardWorkDurationSeed.mockResolvedValue({
      __stableCode: 'wide_variance_seed',
      stableCode: 'wide_variance_seed',
      defaultDaysP50: 7,
      defaultDaysP80: 30,
      fixedDays: 1,
      variableDays: 6,
      confidence: 'medium',
      benchmarkBasis: 'Wide variance seed.',
    })

    const suggestion = await getTaskDurationSuggestion({
      standardWorkCode: 'wide_variance_seed',
      taskTitle: 'wide variance process',
      wbsNodeType: 'process',
    })

    expect(suggestion.recommendedDurationDays).toBe(14)
    expect(suggestion.conservativeDurationDays).toBe(18)
    expect(suggestion.confidenceScore).toBe(50)
    expect(suggestion.businessReasonParams).toEqual(expect.objectContaining({
      seedP80RatioCapped: true,
      seedP80Ratio: expect.closeTo(4.286, 3),
    }))
  })

  it('keeps conservative P80 at least as high as the recommended P50 when seed percentiles are inverted', async () => {
    mocks.resolveStandardWorkDurationSeed.mockResolvedValue({
      __stableCode: 'inverted_percentile_seed',
      stableCode: 'inverted_percentile_seed',
      defaultDaysP50: 10,
      defaultDaysP80: 8,
      fixedDays: 2,
      variableDays: 8,
      confidence: 'medium',
      benchmarkBasis: 'Inverted percentile seed.',
    })

    const suggestion = await getTaskDurationSuggestion({
      standardWorkCode: 'inverted_percentile_seed',
      taskTitle: 'inverted percentile process',
      wbsNodeType: 'process',
    })

    expect(suggestion.recommendedDurationDays).toBe(10)
    expect(suggestion.conservativeDurationDays).toBe(14)
    expect(suggestion.businessReasonParams).toEqual(expect.objectContaining({
      seedP80RatioRaised: true,
      originalSeedP80: 8,
      raisedSeedP80: 14,
    }))
  })

  it('surfaces curing plausibility warnings without overwriting approved early-strength E1 reference durations', async () => {
    mocks.resolveStandardWorkDurationSeed.mockResolvedValue({
      __stableCode: 'concrete_curing_normal_minimum',
      stableCode: 'concrete_curing_normal_minimum',
      defaultDaysP50: 5,
      defaultDaysP80: 6,
      confidence: 'medium',
      benchmarkBasis: 'Approved early-strength curing reference.',
    })

    const suggestion = await getTaskDurationSuggestion({
      standardWorkCode: 'concrete_curing_normal_minimum',
      standardWorkName: 'concrete curing',
      taskTitle: 'concrete curing and test block retention',
      wbsNodeType: 'process',
    })

    expect(suggestion.recommendedDurationDays).toBe(6)
    expect(suggestion.conservativeDurationDays).toBe(6)
    expect(suggestion.recommendedDurationDays).toBeLessThan(7)
    expect((suggestion.calculationContext as any).durationPlausibilityWarnings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        ruleId: 'duration.min.concrete_curing_normal',
        severity: 'warning',
        originalDays: 6,
        adjustedDays: 6,
      }),
    ]))
  })

  it('uses manual override P50 and P80 symmetrically when both are governed', async () => {
    mocks.query.maybeSingle.mockImplementation(async () => {
      const tableName = mocks.from.mock.calls.at(-1)?.[0]
      if (tableName === 'duration_suggestion_overrides') {
        return {
          data: {
            recommended_duration_days: 9,
            conservative_duration_days: 13,
            reason: 'Approved local override.',
          },
          error: null,
        }
      }
      return {
        data: tableName === 'projects'
          ? mocks.state.projectsData[0] ?? null
          : null,
        error: null,
      }
    })

    const suggestion = await getTaskDurationSuggestion({
      templateNodeId: 'template-node-1',
      projectId: 'project-1',
      standardWorkCode: 'manual_override_seed',
      taskTitle: 'manual override process',
      wbsNodeType: 'process',
    })

    expect(suggestion.recommendedDurationDays).toBe(9)
    expect(suggestion.conservativeDurationDays).toBe(13)
    expect(suggestion.durationProvenance).toBe('manual_override')
    expect(suggestion.businessReasonParams).toEqual(expect.objectContaining({
      source: 'manual_override',
      conservativeSource: 'manual_override',
    }))
  })

  it('does not apply execution-only context factors to new task reference duration', async () => {
    mocks.buildDurationContext.mockResolvedValueOnce({
      ...emptyContext(),
      multiplier: 2,
      extraDays: 5,
      confidenceDelta: -20,
      adjustedBy: ['progress_velocity', 'external_readiness'],
      factors: [
        {
          key: 'progress_velocity',
          label: 'progress velocity',
          multiplier: 2,
          extraDays: 0,
          confidenceDelta: -10,
          actionPolicy: 'candidate_only',
          reason: 'execution progress is slow',
          source: 'project_history',
        },
        {
          key: 'external_readiness',
          label: 'external readiness',
          multiplier: 1,
          extraDays: 5,
          confidenceDelta: -10,
          actionPolicy: 'candidate_only',
          reason: 'open site readiness signals',
          source: 'external_readiness',
        },
      ],
      businessReasons: ['execution progress is slow', 'open site readiness signals'],
      hasLowConfidenceSignal: true,
      calculationContext: {
        duration_source: 'standard',
        adjusted_by: ['progress_velocity', 'external_readiness'],
        confidence_level: 'low',
        factor_summary_available: true,
      },
    })
    mocks.resolveStandardWorkDurationSeed.mockResolvedValue({
      __stableCode: 'plastering_wall_ceiling',
      stableCode: 'plastering_wall_ceiling',
      defaultDaysP50: 8,
      defaultDaysP80: 12,
      fixedDays: 1,
      variableDays: 7,
      confidence: 'medium',
      benchmarkBasis: 'Plastering default per work face.',
    })

    const suggestion = await getTaskDurationSuggestion({
      projectId: 'project-1',
      standardWorkCode: 'plastering_wall_ceiling',
      taskTitle: 'wall plastering',
      progress: 40,
      wbsNodeType: 'process',
    })

    expect(suggestion.recommendedDurationDays).toBe(10)
    expect(suggestion.conservativeDurationDays).toBe(13)
    expect(suggestion.forecastSource).toBe('standard_work_duration_seed+project_execution_context')
    expect(suggestion.factorSummary?.adjustedBy).toEqual([])
    expect(suggestion.factorAvailability?.new_task_reference).toBe(true)
    expect(suggestion.factorAvailability?.execution_learning).toBe(false)
  })

  it('applies site capacity pressure to new task reference when the project already has schedule context', async () => {
    mocks.buildDurationContext.mockResolvedValueOnce({
      ...emptyContext(),
      multiplier: 1.2,
      extraDays: 0,
      confidenceDelta: -6,
      adjustedBy: ['resource_conflict'],
      factors: [
        {
          key: 'resource_conflict',
          label: 'site capacity pressure',
          multiplier: 1.2,
          extraDays: 0,
          confidenceDelta: -6,
          actionPolicy: 'candidate_only',
          reason: 'same responsible unit and workface overlap in the planned window',
          source: 'task_fact',
          dataDependencies: ['tasks'],
        },
      ],
      businessReasons: ['same responsible unit and workface overlap in the planned window'],
      hasLowConfidenceSignal: false,
      calculationContext: {
        duration_source: 'standard',
        adjusted_by: ['resource_conflict'],
        confidence_level: 'medium',
        factor_summary_available: true,
      },
    })
    mocks.resolveStandardWorkDurationSeed.mockResolvedValue({
      __stableCode: 'plastering_wall_ceiling',
      stableCode: 'plastering_wall_ceiling',
      defaultDaysP50: 8,
      defaultDaysP80: 12,
      fixedDays: 1,
      variableDays: 7,
      confidence: 'medium',
      benchmarkBasis: 'Plastering default per work face.',
    })

    const suggestion = await getTaskDurationSuggestion({
      projectId: 'project-1',
      standardWorkCode: 'plastering_wall_ceiling',
      taskTitle: 'wall plastering',
      plannedStartDate: '2026-05-20',
      plannedEndDate: '2026-05-28',
      buildingObjectId: 'building-1',
      responsibleUnitId: 'unit-1',
      wbsNodeType: 'process',
    })

    expect(suggestion.recommendedDurationDays).toBe(12)
    expect(suggestion.conservativeDurationDays).toBe(17)
    expect(suggestion.factorSummary?.adjustedBy).toEqual(['resource_conflict'])
    expect(suggestion.factorSummary?.businessReasons).toContain('same responsible unit and workface overlap in the planned window')
    expect(suggestion.factorAvailability?.new_task_reference).toBe(true)
  })

  it('estimates a temporary end date so new-task resource conflict can run from a start date only', async () => {
    mocks.buildDurationContext
      .mockResolvedValueOnce(emptyContext())
      .mockImplementationOnce(async (input: any) => ({
        ...emptyContext(),
        multiplier: 1.1,
        extraDays: 0,
        confidenceDelta: -8,
        adjustedBy: ['resource_conflict'],
        factors: [{
          key: 'resource_conflict',
          label: '现场承载压力',
          multiplier: 1.1,
          extraDays: 0,
          confidenceDelta: -8,
          actionPolicy: 'candidate_only',
          source: 'task_fact',
          dataDependencies: ['tasks'],
          reason: `resource window ${input.plannedStartDate}~${input.plannedEndDate}`,
          metadata: {
            estimatedEndFromBaseDuration: input.plannedEndDate,
          },
        }],
        businessReasons: [`resource window ${input.plannedStartDate}~${input.plannedEndDate}`],
        calculationContext: {
          duration_source: 'standard',
          adjusted_by: ['resource_conflict'],
          confidence_level: 'medium',
          factor_summary_available: true,
          factor_contribution_ledger: [{
            key: 'resource_conflict',
            multiplier: 1.1,
            extraDays: 0,
            contributionMode: 'primary',
          }],
        },
      }))
    mocks.resolveStandardWorkDurationSeed.mockResolvedValue({
      __stableCode: 'plastering_wall_ceiling',
      stableCode: 'plastering_wall_ceiling',
      defaultDaysP50: 10,
      defaultDaysP80: 12,
      fixedDays: 1,
      variableDays: 9,
      confidence: 'medium',
      benchmarkBasis: 'Plastering default per work face.',
    })

    const suggestion = await getTaskDurationSuggestion({
      projectId: 'project-1',
      engineeringCategoryId: 'cat-1',
      standardWorkCode: 'plastering_wall_ceiling',
      taskTitle: 'wall plastering',
      plannedStartDate: '2026-06-01',
      plannedEndDate: null,
      wbsNodeType: 'process',
    })

    expect(mocks.buildDurationContext).toHaveBeenLastCalledWith(expect.objectContaining({
      plannedStartDate: '2026-06-01',
      plannedEndDate: '2026-06-11',
    }))
    expect(suggestion.recommendedDurationDays).toBe(13)
    expect(suggestion.factorSummary?.adjustedBy).toEqual(['resource_conflict'])
    expect(suggestion.factorSummary?.businessReasons).toContain('resource window 2026-06-01~2026-06-11')
  })

  it('rebuilds filtered new-task context from the effective contribution ledger instead of raw factors', async () => {
    mocks.buildDurationContext.mockResolvedValueOnce({
      ...emptyContext(),
      multiplier: 1.4,
      extraDays: 5,
      confidenceDelta: -14,
      rawConfidenceDelta: -14,
      adjustedBy: ['resource_conflict', 'external_readiness'],
      factors: [
        {
          key: 'resource_conflict',
          label: 'site capacity pressure',
          multiplier: 1.2,
          extraDays: 0,
          confidenceDelta: -6,
          actionPolicy: 'candidate_only',
          reason: 'same workface pressure',
          source: 'task_fact',
          dataDependencies: ['tasks'],
        },
        {
          key: 'external_readiness',
          label: 'external readiness',
          multiplier: 1.1,
          extraDays: 5,
          confidenceDelta: -8,
          actionPolicy: 'candidate_only',
          reason: 'blocked by drawing package',
          source: 'external_readiness',
          dataDependencies: ['task_conditions'],
        },
      ],
      businessReasons: ['same workface pressure', 'blocked by drawing package'],
      hasLowConfidenceSignal: true,
      calculationContext: {
        duration_source: 'standard',
        adjusted_by: ['resource_conflict', 'external_readiness'],
        confidence_level: 'medium',
        factor_summary_available: true,
        factor_contribution_ledger: [
          {
            key: 'resource_conflict',
            label: 'site capacity pressure',
            multiplier: 1,
            originalMultiplier: 1.2,
            extraDays: 0,
            confidenceDelta: -3,
            originalConfidenceDelta: -6,
            actionPolicy: 'candidate_only',
            source: 'task_fact',
            contributionMode: 'deduped_secondary',
            scopeFingerprint: 'project-1:task-ledger',
            sourceEntityKeys: ['drawing_package:drawing-1'],
            dedupeKey: 'resource_conflict:drawing_package:drawing-1',
            dataDependencies: ['tasks'],
            reason: 'same workface pressure',
            suppressedByFactorKey: 'external_readiness',
          },
          {
            key: 'external_readiness',
            label: 'external readiness',
            multiplier: 1.1,
            extraDays: 5,
            confidenceDelta: -8,
            actionPolicy: 'candidate_only',
            source: 'external_readiness',
            contributionMode: 'extra_days_and_multiplier',
            scopeFingerprint: 'project-1:task-ledger',
            sourceEntityKeys: ['drawing_package:drawing-1'],
            dedupeKey: 'external_readiness:drawing_package:drawing-1',
            dataDependencies: ['task_conditions'],
            reason: 'blocked by drawing package',
          },
        ],
      },
    })
    mocks.resolveStandardWorkDurationSeed.mockResolvedValue({
      __stableCode: 'plastering_wall_ceiling',
      stableCode: 'plastering_wall_ceiling',
      defaultDaysP50: 10,
      defaultDaysP80: 12,
      fixedDays: 1,
      variableDays: 9,
      confidence: 'medium',
      benchmarkBasis: 'Plastering default per work face.',
    })

    const suggestion = await getTaskDurationSuggestion({
      projectId: 'project-1',
      standardWorkCode: 'plastering_wall_ceiling',
      taskTitle: 'wall plastering',
      plannedStartDate: '2026-05-20',
      plannedEndDate: '2026-05-28',
      wbsNodeType: 'process',
    })

    expect(suggestion.recommendedDurationDays).toBe(11)
    expect(suggestion.factorSummary?.adjustedBy).toEqual(['resource_conflict'])
    expect(suggestion.factorSummary?.multiplier).toBe(1)
    expect(suggestion.factorSummary?.extraDays).toBe(0)
    expect(suggestion.factorSummary?.rawConfidenceDelta).toBe(-3)
    expect(suggestion.factorSummary?.calculationContext.factor_contribution_ledger).toEqual([
      expect.objectContaining({
        key: 'resource_conflict',
        multiplier: 1,
        contributionMode: 'deduped_secondary',
        suppressedByFactorKey: 'external_readiness',
      }),
    ])
  })

  it('uses project-level completed-task rhythm as L1 context for new task reference duration', async () => {
    mocks.resolveStandardWorkDurationSeed.mockResolvedValue({
      __stableCode: 'plastering_wall_ceiling',
      stableCode: 'plastering_wall_ceiling',
      defaultDaysP50: 8,
      defaultDaysP80: 12,
      fixedDays: 1,
      variableDays: 7,
      confidence: 'medium',
      benchmarkBasis: 'Plastering default per work face.',
    })
    mocks.loadPublishedProgressVelocityRuntime.mockResolvedValue({
      durationRatio: 1.25,
      multiplier: 1.25,
      confidenceLevel: 'medium',
      confidenceScore: 62,
      actionPolicy: 'candidate_only',
      sampleCount: 4,
      variance: 0.12,
      groupKey: 'category:cat-1',
      excludedAnomalyTaskCount: 0,
      reason: 'Project history shows this work group is slower than planned.',
      metadata: {},
    })

    const suggestion = await getTaskDurationSuggestion({
      projectId: 'project-1',
      engineeringCategoryId: 'cat-1',
      standardWorkCode: 'plastering_wall_ceiling',
      taskTitle: 'wall plastering',
      wbsNodeType: 'process',
    })

    expect(suggestion.recommendedDurationDays).toBe(10)
    expect(suggestion.conservativeDurationDays).toBe(16)
    expect(suggestion.forecastSource).toBe('standard_work_duration_seed+project_execution_context')
    expect(suggestion.dataMaturity).toBe('L1')
    expect(suggestion.factorAvailability?.project_execution_context).toBe(true)
    expect(suggestion.factorSummary?.factorAvailability?.project_execution_context).toBe(true)
  })

  it('dampens project environment buffer when similar-task rhythm already captures local slowness', async () => {
    mocks.resolveStandardWorkDurationSeed.mockResolvedValue({
      __stableCode: 'plastering_wall_ceiling',
      stableCode: 'plastering_wall_ceiling',
      defaultDaysP50: 10,
      defaultDaysP80: 12,
      fixedDays: 1,
      variableDays: 9,
      confidence: 'medium',
      benchmarkBasis: 'Plastering default per work face.',
    })
    mocks.loadPublishedProgressVelocityRuntime.mockResolvedValue({
      durationRatio: 1.25,
      multiplier: 1.25,
      confidenceLevel: 'high',
      confidenceScore: 82,
      actionPolicy: 'auto_apply',
      sampleCount: 8,
      variance: 0.08,
      groupKey: 'category:cat-1',
      excludedAnomalyTaskCount: 0,
      reason: 'Project history shows this work group is slower than planned.',
      metadata: {},
    })
    mocks.state.taskRows = Array.from({ length: 6 }, (_, index) => ({
      id: `completed-env-${index + 1}`,
      project_id: 'project-1',
      planned_start_date: '2026-01-01',
      planned_end_date: '2026-01-10',
      actual_start_date: '2026-01-01',
      actual_end_date: '2026-01-13',
      progress: 100,
      status: 'completed',
    }))

    const suggestion = await getTaskDurationSuggestion({
      projectId: 'project-1',
      engineeringCategoryId: 'cat-1',
      standardWorkCode: 'plastering_wall_ceiling',
      taskTitle: 'wall plastering',
      wbsNodeType: 'process',
    })

    expect(suggestion.recommendedDurationDays).toBe(14)
    expect(suggestion.conservativeDurationDays).toBe(20)
    expect(suggestion.businessReasonParams).toEqual(expect.objectContaining({
      environmentMultiplier: 1.2,
      effectiveEnvironmentMultiplier: 1.08,
      environmentDampenedBySimilarTaskRhythm: true,
    }))
  })

  it('dampens project environment buffer when baseline calibration already carries project slowness', async () => {
    mocks.buildDurationContext.mockResolvedValueOnce({
      ...emptyContext(),
      multiplier: 1.15,
      extraDays: 0,
      confidenceDelta: 2,
      adjustedBy: ['project_baseline_calibration'],
      factors: [
        {
          key: 'project_baseline_calibration',
          label: 'project baseline calibration',
          multiplier: 1.15,
          extraDays: 0,
          confidenceDelta: 2,
          actionPolicy: 'auto_apply',
          reason: 'project baseline already shows slower delivery',
          source: 'project_history',
        },
      ],
      calculationContext: {
        duration_source: 'standard',
        adjusted_by: ['project_baseline_calibration'],
        confidence_level: 'high',
        factor_summary_available: true,
        project_baseline_calibration_applied: true,
      },
    })
    mocks.resolveStandardWorkDurationSeed.mockResolvedValue({
      __stableCode: 'plastering_wall_ceiling',
      stableCode: 'plastering_wall_ceiling',
      defaultDaysP50: 10,
      defaultDaysP80: 12,
      fixedDays: 1,
      variableDays: 9,
      confidence: 'medium',
      benchmarkBasis: 'Plastering default per work face.',
    })
    mocks.state.taskRows = Array.from({ length: 6 }, (_, index) => ({
      id: `baseline-env-${index + 1}`,
      project_id: 'project-1',
      planned_start_date: '2026-01-01',
      planned_end_date: '2026-01-10',
      actual_start_date: '2026-01-01',
      actual_end_date: '2026-01-13',
      progress: 100,
      status: 'completed',
    }))

    const suggestion = await getTaskDurationSuggestion({
      projectId: 'project-1',
      engineeringCategoryId: 'cat-1',
      standardWorkCode: 'plastering_wall_ceiling',
      taskTitle: 'wall plastering',
      wbsNodeType: 'process',
    })

    expect(suggestion.recommendedDurationDays).toBe(13)
    expect(suggestion.conservativeDurationDays).toBe(16)
    expect(suggestion.businessReasonParams).toEqual(expect.objectContaining({
      environmentMultiplier: 1.2,
      effectiveEnvironmentMultiplier: 1.08,
      environmentDampenedByPriorProjectRhythm: true,
    }))
  })

  it('keeps duration context extra days outside the project velocity multiplier', async () => {
    mocks.buildDurationContext.mockResolvedValueOnce({
      ...emptyContext(),
      multiplier: 1.1,
      extraDays: 3,
      confidenceDelta: -5,
      adjustedBy: ['resource_conflict'],
      factors: [
        {
          key: 'resource_conflict',
          label: 'site capacity pressure',
          multiplier: 1.1,
          extraDays: 3,
          confidenceDelta: -5,
          actionPolicy: 'candidate_only',
          reason: 'workface pressure adds a fixed buffer',
          source: 'task_fact',
        },
      ],
      businessReasons: ['workface pressure adds a fixed buffer'],
      hasLowConfidenceSignal: false,
      calculationContext: {
        duration_source: 'standard',
        adjusted_by: ['resource_conflict'],
        confidence_level: 'medium',
        factor_summary_available: true,
      },
    })
    mocks.resolveStandardWorkDurationSeed.mockResolvedValue({
      __stableCode: 'large_area_finishing',
      stableCode: 'large_area_finishing',
      defaultDaysP50: 30,
      defaultDaysP80: 36,
      fixedDays: 6,
      variableDays: 24,
      confidence: 'medium',
      benchmarkBasis: 'Large area finishing default.',
    })
    mocks.loadPublishedProgressVelocityRuntime.mockResolvedValue({
      durationRatio: 1.2,
      multiplier: 1.2,
      confidenceLevel: 'high',
      confidenceScore: 82,
      actionPolicy: 'auto_apply',
      sampleCount: 8,
      variance: 0.08,
      groupKey: 'category:cat-1',
      excludedAnomalyTaskCount: 0,
      reason: 'Project history shows this work group is slower than planned.',
      metadata: {},
    })

    const suggestion = await getTaskDurationSuggestion({
      projectId: 'project-1',
      engineeringCategoryId: 'cat-1',
      standardWorkCode: 'large_area_finishing',
      taskTitle: 'large area finishing',
      wbsNodeType: 'process',
    })

    expect(suggestion.recommendedDurationDays).toBe(47)
    expect(suggestion.factorSummary?.extraDays).toBe(3)
    expect((suggestion.factorSummary as any)?.projectExecutionContext).toEqual(expect.objectContaining({
      similarTaskRhythm: expect.objectContaining({ multiplier: 1.2 }),
    }))
  })

  it('uses broader project environment buffer when non-similar completed tasks show slower delivery', async () => {
    mocks.resolveStandardWorkDurationSeed.mockResolvedValue({
      __stableCode: 'plastering_wall_ceiling',
      stableCode: 'plastering_wall_ceiling',
      defaultDaysP50: 8,
      defaultDaysP80: 12,
      fixedDays: 1,
      variableDays: 7,
      confidence: 'medium',
      benchmarkBasis: 'Plastering default per work face.',
    })
    mocks.state.taskRows = Array.from({ length: 6 }, (_, index) => ({
      id: `completed-${index + 1}`,
      project_id: 'project-1',
      planned_start_date: '2026-01-01',
      planned_end_date: '2026-01-10',
      actual_start_date: '2026-01-01',
      actual_end_date: '2026-01-13',
      progress: 100,
      status: 'completed',
    }))

    const suggestion = await getTaskDurationSuggestion({
      projectId: 'project-1',
      engineeringCategoryId: 'cat-1',
      standardWorkCode: 'plastering_wall_ceiling',
      taskTitle: 'wall plastering',
      wbsNodeType: 'process',
    })

    expect(suggestion.recommendedDurationDays).toBe(11)
    expect(suggestion.conservativeDurationDays).toBe(15)
    expect(suggestion.forecastSource).toBe('standard_work_duration_seed+project_execution_context')
    expect(suggestion.dataMaturity).toBe('L1')
    expect(suggestion.factorAvailability?.project_environment_buffer).toBe(true)
    expect(suggestion.factorAvailability?.similar_task_rhythm).toBeUndefined()
    expect(suggestion.factorSummary?.factorAvailability?.project_environment_buffer).toBe(true)
  })

  it('skips ambiguous start_date fallback when building project environment ratios', async () => {
    mocks.resolveStandardWorkDurationSeed.mockResolvedValue({
      __stableCode: 'plastering_wall_ceiling',
      stableCode: 'plastering_wall_ceiling',
      defaultDaysP50: 10,
      defaultDaysP80: 12,
      fixedDays: 1,
      variableDays: 9,
      confidence: 'medium',
      benchmarkBasis: 'Plastering default per work face.',
    })
    mocks.state.taskRows = Array.from({ length: 6 }, (_, index) => ({
      id: `ambiguous-env-${index + 1}`,
      project_id: 'project-1',
      start_date: '2026-01-01',
      end_date: '2026-01-05',
      actual_start_date: '2026-01-01',
      actual_end_date: '2026-01-20',
      progress: 100,
      status: 'completed',
    }))

    const suggestion = await getTaskDurationSuggestion({
      projectId: 'project-1',
      engineeringCategoryId: 'cat-1',
      standardWorkCode: 'plastering_wall_ceiling',
      taskTitle: 'wall plastering',
      wbsNodeType: 'process',
    })

    expect(suggestion.recommendedDurationDays).toBe(11)
    expect(suggestion.conservativeDurationDays).toBe(13)
    expect(suggestion.businessReasonParams?.bufferKind).toBe('cold_start')
    expect(suggestion.businessReasonParams?.sampleCount).toBe(0)
  })

  it('partially applies medium-confidence similar-task rhythm to recommended duration', async () => {
    mocks.resolveStandardWorkDurationSeed.mockResolvedValue({
      __stableCode: 'plastering_wall_ceiling',
      stableCode: 'plastering_wall_ceiling',
      defaultDaysP50: 10,
      defaultDaysP80: 12,
      fixedDays: 1,
      variableDays: 9,
      confidence: 'medium',
      benchmarkBasis: 'Plastering default per work face.',
    })
    mocks.loadPublishedProgressVelocityRuntime.mockResolvedValue({
      durationRatio: 1.24,
      multiplier: 1.24,
      confidenceLevel: 'medium',
      confidenceScore: 68,
      actionPolicy: 'candidate_only',
      sampleCount: 6,
      variance: 0.1,
      groupKey: 'standard_work:plastering_wall_ceiling',
      excludedAnomalyTaskCount: 0,
      reason: 'Project history shows this work group is slower than planned.',
      metadata: { learningScope: 'project_plus_company' },
    })

    const suggestion = await getTaskDurationSuggestion({
      projectId: 'project-1',
      companyId: 'company-1',
      engineeringCategoryId: 'cat-1',
      standardWorkCode: 'plastering_wall_ceiling',
      taskTitle: 'wall plastering',
      wbsNodeType: 'process',
    })

    expect(suggestion.recommendedDurationDays).toBe(13)
    expect(suggestion.conservativeDurationDays).toBe(18)
    expect(suggestion.businessReasonParams).toEqual(expect.objectContaining({
      similarTaskRecommendedAdjusted: true,
      similarTaskRecommendedAdjustmentMode: 'partial',
      similarTaskRecommendedMultiplier: 1.12,
    }))
    expect((suggestion.factorSummary as any)?.projectExecutionContext?.similarTaskRhythm).toEqual(expect.objectContaining({
      sampleCount: 6,
      learningScope: 'project_plus_company',
    }))
  })

  it('does not let a single thin similar-task rhythm sample change reference duration values', async () => {
    mocks.resolveStandardWorkDurationSeed.mockResolvedValue({
      __stableCode: 'plastering_wall_ceiling',
      stableCode: 'plastering_wall_ceiling',
      defaultDaysP50: 10,
      defaultDaysP80: 12,
      fixedDays: 1,
      variableDays: 9,
      confidence: 'medium',
      benchmarkBasis: 'Plastering default per work face.',
    })
    mocks.loadPublishedProgressVelocityRuntime.mockResolvedValue(null)

    const baseline = await getTaskDurationSuggestion({
      projectId: 'project-1',
      companyId: 'company-1',
      engineeringCategoryId: 'cat-1',
      standardWorkCode: 'plastering_wall_ceiling',
      taskTitle: 'wall plastering',
      wbsNodeType: 'process',
    })

    mocks.loadPublishedProgressVelocityRuntime.mockResolvedValue({
      durationRatio: 1.8,
      multiplier: 1.8,
      confidenceLevel: 'low',
      confidenceScore: 32,
      actionPolicy: 'observe_only',
      sampleCount: 1,
      variance: 0.4,
      groupKey: 'template:thin-sample',
      excludedAnomalyTaskCount: 0,
      reason: 'Only one completed similar-task sample is available.',
      metadata: { learningScope: 'project' },
    })

    const suggestion = await getTaskDurationSuggestion({
      projectId: 'project-1',
      companyId: 'company-1',
      engineeringCategoryId: 'cat-1',
      standardWorkCode: 'plastering_wall_ceiling',
      taskTitle: 'wall plastering',
      wbsNodeType: 'process',
    })

    expect(suggestion.recommendedDurationDays).toBe(baseline.recommendedDurationDays)
    expect(suggestion.conservativeDurationDays).toBe(baseline.conservativeDurationDays)
    expect(suggestion.businessReasonParams).toEqual(expect.objectContaining({
      similarTaskRecommendedAdjusted: false,
      similarTaskRecommendedAdjustmentMode: 'none',
      similarTaskRecommendedMultiplier: 1,
    }))
    expect((suggestion.factorSummary as any)?.projectExecutionContext?.similarTaskRhythm).toEqual(expect.objectContaining({
      sampleCount: 1,
      actionPolicy: 'observe_only',
      learningScope: 'project',
    }))
  })

  it.each([
    { healthScore: 55, expectedMultiplier: 1.3, expectedConservative: 16 },
    { healthScore: 70, expectedMultiplier: 1.15, expectedConservative: 14 },
    { healthScore: 86, expectedMultiplier: 1, expectedConservative: 12 },
  ])('uses project health band $healthScore only as conservative duration floor', async ({ healthScore, expectedMultiplier, expectedConservative }) => {
    mocks.resolveStandardWorkDurationSeed.mockResolvedValue({
      __stableCode: 'plastering_wall_ceiling',
      stableCode: 'plastering_wall_ceiling',
      defaultDaysP50: 10,
      defaultDaysP80: 12,
      fixedDays: 1,
      variableDays: 9,
      confidence: 'medium',
      benchmarkBasis: 'Plastering default per work face.',
    })
    mocks.buildProjectHealthDeviationSummary.mockResolvedValue({
      projectId: 'project-1',
      healthScore,
      healthStatus: null,
      businessHealthScore: healthScore,
      healthConfidenceScore: 80,
      healthConfidenceFlag: 'high',
      healthBasis: {},
      deviationSummary: {},
      caliberVersion: 'v1.4.19',
      generatedAt: '2026-05-17T00:00:00.000Z',
    })

    const suggestion = await getTaskDurationSuggestion({
      projectId: 'project-1',
      engineeringCategoryId: 'cat-1',
      standardWorkCode: 'plastering_wall_ceiling',
      taskTitle: 'wall plastering',
      wbsNodeType: 'process',
    })

    expect(suggestion.recommendedDurationDays).toBe(11)
    expect(suggestion.conservativeDurationDays).toBe(expectedConservative)
    expect(suggestion.factorAvailability?.project_environment_buffer).toBe(true)
    expect(suggestion.businessReasonParams?.healthBandMultiplier).toBe(expectedMultiplier)
    expect(suggestion.businessReasonParams?.healthBandSource).toBe('project_daily_snapshot')
  })

  it('uses cold-start conservative buffer without treating legacy default health as health evidence', async () => {
    mocks.resolveStandardWorkDurationSeed.mockResolvedValue({
      __stableCode: 'plastering_wall_ceiling',
      stableCode: 'plastering_wall_ceiling',
      defaultDaysP50: 10,
      defaultDaysP80: 12,
      fixedDays: 1,
      variableDays: 9,
      confidence: 'medium',
      benchmarkBasis: 'Plastering default per work face.',
    })
    mocks.buildProjectHealthDeviationSummary.mockResolvedValue({
      projectId: 'project-1',
      healthScore: 50,
      healthStatus: null,
      businessHealthScore: null,
      healthConfidenceScore: null,
      healthConfidenceFlag: 'medium',
      healthBasis: {},
      deviationSummary: {},
      caliberVersion: 'legacy',
      generatedAt: '2026-05-17T00:00:00.000Z',
    })

    const suggestion = await getTaskDurationSuggestion({
      projectId: 'project-1',
      engineeringCategoryId: 'cat-1',
      standardWorkCode: 'plastering_wall_ceiling',
      taskTitle: 'wall plastering',
      wbsNodeType: 'process',
    })

    expect(suggestion.recommendedDurationDays).toBe(11)
    expect(suggestion.conservativeDurationDays).toBe(13)
    expect(suggestion.factorAvailability?.project_environment_buffer).toBe(true)
    expect(suggestion.businessReasonParams?.healthBandMultiplier).toBeNull()
    expect(suggestion.businessReasonParams?.multiplier).toBe(1.08)
  })

  it('keeps execution context factors when the suggestion is used as an execution reference', async () => {
    mocks.buildDurationContext.mockResolvedValueOnce({
      ...emptyContext(),
      multiplier: 2,
      extraDays: 5,
      confidenceDelta: -10,
      adjustedBy: ['progress_velocity'],
      factors: [
        {
          key: 'progress_velocity',
          label: 'progress velocity',
          multiplier: 2,
          extraDays: 5,
          confidenceDelta: -10,
          actionPolicy: 'candidate_only',
          reason: 'execution progress is slow',
          source: 'project_history',
        },
      ],
      businessReasons: ['execution progress is slow'],
      hasLowConfidenceSignal: true,
      calculationContext: {
        duration_source: 'standard',
        adjusted_by: ['progress_velocity'],
        confidence_level: 'medium',
        factor_summary_available: true,
      },
    })
    mocks.resolveStandardWorkDurationSeed.mockResolvedValue({
      __stableCode: 'plastering_wall_ceiling',
      stableCode: 'plastering_wall_ceiling',
      defaultDaysP50: 8,
      defaultDaysP80: 12,
      fixedDays: 1,
      variableDays: 7,
      confidence: 'medium',
      benchmarkBasis: 'Plastering default per work face.',
    })

    const suggestion = await getTaskDurationSuggestion({
      suggestionPurpose: 'execution_reference',
      taskId: 'task-1',
      projectId: 'project-1',
      standardWorkCode: 'plastering_wall_ceiling',
      taskTitle: 'wall plastering',
      progress: 40,
      wbsNodeType: 'process',
    })

    expect(suggestion.recommendedDurationDays).toBe(25)
    expect(suggestion.conservativeDurationDays).toBe(24)
    expect(suggestion.forecastSource).toBe('standard_work_duration_seed+v1474_context')
    expect(suggestion.factorSummary?.adjustedBy).toEqual(['progress_velocity'])
    expect(suggestion.factorAvailability?.execution_learning).toBe(true)
  })

  it('applies project rhythm and health environment to execution reference suggestions', async () => {
    mocks.buildDurationContext.mockResolvedValueOnce(emptyContext())
    mocks.loadPublishedProgressVelocityRuntime.mockResolvedValueOnce({
      projectId: 'project-1',
      groupKey: 'standard_work:plastering_wall_ceiling',
      multiplier: 1.2,
      confidenceLevel: 'high',
      confidenceScore: 82,
      actionPolicy: 'auto_apply',
      sampleCount: 8,
      variance: 0.04,
      metadata: {
        matchLevel: 'standard_work',
        learningScope: 'project',
      },
    })
    mocks.buildProjectHealthDeviationSummary.mockResolvedValueOnce({
      projectId: 'project-1',
      healthScore: null,
      healthStatus: null,
      businessHealthScore: 55,
      healthConfidenceScore: 80,
      healthConfidenceFlag: 'high',
      healthBasis: {},
      deviationSummary: {},
      caliberVersion: 'project_daily_snapshot_v1',
      generatedAt: '2026-05-17T00:00:00.000Z',
    })
    mocks.resolveStandardWorkDurationSeed.mockResolvedValue({
      __stableCode: 'plastering_wall_ceiling',
      stableCode: 'plastering_wall_ceiling',
      defaultDaysP50: 10,
      defaultDaysP80: 12,
      fixedDays: 1,
      variableDays: 9,
      confidence: 'medium',
      benchmarkBasis: 'Plastering default per work face.',
    })

    const suggestion = await getTaskDurationSuggestion({
      suggestionPurpose: 'execution_reference',
      taskId: 'task-1',
      projectId: 'project-1',
      standardWorkCode: 'plastering_wall_ceiling',
      taskTitle: 'wall plastering',
      progress: 40,
      wbsNodeType: 'process',
    })

    expect(suggestion.recommendedDurationDays).toBe(14)
    expect(suggestion.conservativeDurationDays).toBeGreaterThanOrEqual(18)
    expect(suggestion.forecastSource).toBe('standard_work_duration_seed+project_execution_context')
    expect(suggestion.factorAvailability?.similar_task_rhythm).toBe(true)
    expect(suggestion.factorAvailability?.project_environment_buffer).toBe(true)
    expect(suggestion.businessReasonParams?.healthBandMultiplier).toBe(1.3)
  })

  it('uses exact quantity scaling only when quantity units are compatible', async () => {
    mocks.resolveStandardWorkDurationSeed.mockResolvedValue({
      __stableCode: 'plastering_wall_ceiling',
      stableCode: 'plastering_wall_ceiling',
      defaultDaysP50: 10,
      defaultDaysP80: 15,
      fixedDays: 2,
      variableDays: 8,
      defaultQuantity: 100,
      defaultQuantityUnit: 'm²',
      confidence: 'medium',
      benchmarkBasis: 'Plastering default per work face.',
    })

    const scaled = await getTaskDurationSuggestion({
      projectId: 'project-1',
      standardWorkCode: 'plastering_wall_ceiling',
      taskTitle: '外墙抹灰',
      taskQuantity: 400,
      taskQuantityUnit: 'm2',
      wbsNodeType: 'process',
    })

    expect(scaled.recommendedDurationDays).toBe(29)
    expect(scaled.businessReason).toContain('工程量')
    expect(scaled.factorSummary?.scaleBasis).toBe('quantity')
    expect(scaled.factorSummary?.scaleConfidence).toBe('high')
    expect(scaled.quantitySource).toBe('explicit_task_quantity')
    expect(scaled.quantityConfidence).toBe('high')
    expect(scaled.businessReasonParams?.quantitySource).toBe('explicit_task_quantity')
    expect(scaled.factorAvailability?.explicit_quantity).toBe(true)

    const notScaled = await getTaskDurationSuggestion({
      projectId: 'project-1',
      standardWorkCode: 'plastering_wall_ceiling',
      taskTitle: '外墙抹灰',
      taskQuantity: 400,
      taskQuantityUnit: 't',
      wbsNodeType: 'process',
    })

    expect(notScaled.recommendedDurationDays).toBe(12)
    expect(notScaled.quantitySource).toBe('seed_default_quantity')
    expect(notScaled.quantityConfidence).toBe('low')
    expect(notScaled.factorAvailability?.seed_default_quantity).toBe(true)
    expect(notScaled.businessReason).not.toContain('工程量')
  })

  it('honors seed-specific quantity scale exponent when explicit quantity is available', async () => {
    mocks.resolveStandardWorkDurationSeed.mockResolvedValue({
      __stableCode: 'point_installation',
      stableCode: 'point_installation',
      defaultDaysP50: 10,
      defaultDaysP80: 15,
      fixedDays: 2,
      variableDays: 8,
      defaultQuantity: 100,
      defaultQuantityUnit: 'point',
      quantityScaleExponent: 1,
      confidence: 'medium',
      benchmarkBasis: 'Point installation default per standard batch.',
    })

    const suggestion = await getTaskDurationSuggestion({
      projectId: 'project-1',
      standardWorkCode: 'point_installation',
      taskTitle: 'point installation',
      taskQuantity: 400,
      taskQuantityUnit: 'point',
      wbsNodeType: 'process',
    })

    expect(suggestion.recommendedDurationDays).toBe(42)
    expect(suggestion.factorSummary?.scaleBasis).toBe('quantity')
    expect(suggestion.factorSummary?.scaleSignals).toContain('quantityScaleExponent=1')
  })

  it('uses governed batch capacity for explicit quantities when seed declares batch construction', async () => {
    mocks.resolveStandardWorkDurationSeed.mockResolvedValue({
      __stableCode: 'concrete_pour_batch',
      stableCode: 'concrete_pour_batch',
      defaultDaysP50: 6,
      defaultDaysP80: 8,
      fixedDays: 1,
      variableDays: 5,
      defaultQuantity: 100,
      defaultQuantityUnit: 'm3',
      batchCapacity: 100,
      interBatchRatio: 0.2,
      confidence: 'medium',
      benchmarkBasis: 'Concrete pour default per governed batch.',
    })

    const suggestion = await getTaskDurationSuggestion({
      projectId: 'project-1',
      standardWorkCode: 'concrete_pour_batch',
      taskTitle: 'concrete pour',
      taskQuantity: 320,
      taskQuantityUnit: 'm3',
      coveredBuildingIds: ['b1', 'b2'],
      wbsNodeType: 'process',
    })

    expect(suggestion.recommendedDurationDays).toBe(25)
    expect(suggestion.factorSummary?.scaleBasis).toBe('quantity')
    expect(suggestion.factorSummary?.scaleSignals).toEqual(expect.arrayContaining([
      'batchCapacity=100',
      'batchCount=4',
      'interBatchRatio=0.2',
    ]))
  })

  it('keeps seed default quantity as the baseline when no project quantity exists', async () => {
    mocks.resolveStandardWorkDurationSeed.mockResolvedValue({
      __stableCode: 'steel_rebar_installation',
      stableCode: 'steel_rebar_installation',
      defaultDaysP50: 5,
      defaultDaysP80: 7,
      fixedDays: 1,
      variableDays: 4,
      defaultQuantity: 20,
      defaultQuantityUnit: 't',
      confidence: 'high',
      benchmarkBasis: 'Rebar baseline by standard workface quantity.',
    })

    const suggestion = await getTaskDurationSuggestion({
      projectId: 'project-1',
      standardWorkCode: 'steel_rebar_installation',
      taskTitle: 'rebar installation',
      wbsNodeType: 'process',
    })

    expect(suggestion.recommendedDurationDays).toBe(6)
    expect(suggestion.forecastSource).toBe('standard_work_duration_seed+project_execution_context')
    expect(suggestion.quantitySource).toBe('seed_default_quantity')
    expect(suggestion.quantityConfidence).toBe('low')
    expect(suggestion.businessReasonParams?.quantitySource).toBe('seed_default_quantity')
    expect(suggestion.factorAvailability?.seed_default_quantity).toBe(true)
  })

  it('uses engineering object coverage as a medium-confidence quantity proxy', async () => {
    mocks.resolveStandardWorkDurationSeed.mockResolvedValue({
      __stableCode: 'floor_finish_system',
      stableCode: 'floor_finish_system',
      defaultDaysP50: 6,
      defaultDaysP80: 9,
      fixedDays: 1,
      variableDays: 5,
      defaultQuantity: 100,
      defaultQuantityUnit: 'm2',
      confidence: 'high',
      benchmarkBasis: 'Floor finish baseline by standard workface quantity.',
    })

    const suggestion = await getTaskDurationSuggestion({
      projectId: 'project-1',
      standardWorkCode: 'floor_finish_system',
      taskTitle: 'floor finish',
      coveredFloorIds: ['f1', 'f2', 'f3', 'f4'],
      wbsNodeType: 'process',
    })

    expect(suggestion.recommendedDurationDays).toBeGreaterThan(6)
    expect(suggestion.forecastSource).toBe('standard_work_duration_seed+scale_proxy+project_execution_context')
    expect(suggestion.quantitySource).toBe('engineering_object_proxy')
    expect(suggestion.quantityConfidence).toBe('medium')
    expect(suggestion.businessReasonParams?.quantitySource).toBe('engineering_object_proxy')
    expect(suggestion.factorAvailability?.engineering_object_quantity_proxy).toBe(true)
  })

  it('mildly combines coverage and child-task scale proxies when both are present', async () => {
    mocks.resolveStandardWorkDurationSeed.mockResolvedValue({
      __stableCode: 'multi_building_fitout',
      stableCode: 'multi_building_fitout',
      defaultDaysP50: 10,
      defaultDaysP80: 14,
      fixedDays: 2,
      variableDays: 8,
      confidence: 'medium',
      benchmarkBasis: 'Multi-building fitout default.',
    })

    const suggestion = await getTaskDurationSuggestion({
      projectId: 'project-1',
      standardWorkCode: 'multi_building_fitout',
      taskTitle: 'multi-building fitout',
      coveredBuildingIds: ['b1', 'b2', 'b3', 'b4'],
      childTaskCount: 8,
      wbsNodeType: 'process',
    })

    expect(suggestion.recommendedDurationDays).toBe(21)
    expect(suggestion.factorSummary?.scaleFactor).toBeCloseTo(1.82, 2)
    expect(suggestion.factorSummary?.scaleSignals?.some((signal) => signal.startsWith('rawScaleFactor=1.97'))).toBe(true)
    expect(suggestion.factorSummary?.scaleSignals).toContain('scaleConfidenceWeight=0.85')
    expect(suggestion.factorSummary?.scaleSignals).toEqual(expect.arrayContaining([
      '覆盖 4 栋楼',
      '包含 8 个子任务',
    ]))
  })

  it('dampens multi-building coverage scaling when workflow context says buildings can run in parallel', async () => {
    mocks.buildDurationContext.mockResolvedValue({
      ...emptyContext(),
      factors: [
        {
          key: 'workflow_sequence',
          label: 'workflow sequence',
          multiplier: 1,
          extraDays: 0,
          confidenceDelta: 2,
          actionPolicy: 'confidence_only',
          reason: 'multi-building parallel pattern',
          source: 'v1.4.7.4_seed',
          metadata: {
            buildingPatternCode: 'multi_building_parallel_flow',
            buildingPatternMergedStaggerRules: [
              { ruleCode: 'same-process-cross-building-parallel', lagValue: 0 },
            ],
          },
        },
      ],
      calculationContext: {
        ...emptyContext().calculationContext,
        factor_summary_available: true,
      },
    })
    mocks.resolveStandardWorkDurationSeed.mockResolvedValue({
      __stableCode: 'multi_building_fitout',
      stableCode: 'multi_building_fitout',
      defaultDaysP50: 10,
      defaultDaysP80: 14,
      fixedDays: 2,
      variableDays: 8,
      confidence: 'medium',
      benchmarkBasis: 'Multi-building fitout default.',
    })

    const suggestion = await getTaskDurationSuggestion({
      projectId: 'project-1',
      standardWorkCode: 'multi_building_fitout',
      taskTitle: 'multi-building fitout',
      coveredBuildingIds: ['b1', 'b2', 'b3', 'b4'],
      wbsNodeType: 'process',
    })

    expect(suggestion.recommendedDurationDays).toBe(16)
    expect(suggestion.factorSummary?.scaleFactor).toBeCloseTo(1.38, 2)
    expect(suggestion.factorSummary?.scaleSignals).toContain('coverageExecutionMode=parallel')
    expect(suggestion.factorSummary?.scaleSignals).toContain('coverageExecutionModeSource=workflow_sequence.building_pattern')
    expect(suggestion.factorSummary?.scaleSignals).toContain('rawScaleFactor=1.45')
    expect(suggestion.factorSummary?.scaleSignals).toContain('scaleConfidenceWeight=0.85')
  })

  it('raises multi-building coverage scaling when seed declares sequential building execution', async () => {
    mocks.resolveStandardWorkDurationSeed.mockResolvedValue({
      __stableCode: 'multi_building_fitout',
      stableCode: 'multi_building_fitout',
      defaultDaysP50: 10,
      defaultDaysP80: 14,
      fixedDays: 2,
      variableDays: 8,
      coverageExecutionMode: 'sequential',
      confidence: 'medium',
      benchmarkBasis: 'Multi-building fitout default.',
    })

    const suggestion = await getTaskDurationSuggestion({
      projectId: 'project-1',
      standardWorkCode: 'multi_building_fitout',
      taskTitle: 'multi-building fitout',
      coveredBuildingIds: ['b1', 'b2', 'b3', 'b4'],
      wbsNodeType: 'process',
    })

    expect(suggestion.recommendedDurationDays).toBe(30)
    expect(suggestion.factorSummary?.scaleFactor).toBeCloseTo(2.785, 3)
    expect(suggestion.factorSummary?.scaleSignals).toContain('coverageExecutionMode=sequential')
    expect(suggestion.factorSummary?.scaleSignals).toContain('coverageExecutionModeSource=seed')
    expect(suggestion.factorSummary?.scaleSignals).toContain('rawScaleFactor=3.1')
    expect(suggestion.factorSummary?.scaleSignals).toContain('scaleConfidenceWeight=0.85')
  })

  it('uses engineering object feature profile when task project facts are incomplete', async () => {
    mocks.query.maybeSingle
      .mockResolvedValueOnce({
        data: {
          id: 'task-1',
          project_id: 'project-1',
          title: 'Steel beam installation',
          standard_work_code: 'steel_structure_installation',
          wbs_node_type: 'process',
          building_object_id: 'building-1',
          standard_task_metadata: {},
        },
        error: null,
      })
      .mockResolvedValue({ data: null, error: null })
    mocks.state.engineeringObjectsData = [{
      id: 'building-1',
      object_type: 'building',
      object_code: 'B1',
      object_name: 'Main Hall',
      metadata: {
        featureProfile: {
          projectTypeCode: 'commercial',
          structureTypeCode: 'steel_structure',
          methodVariantCodes: ['steel_frame'],
          elementVariantCodes: ['large_span'],
        },
      },
    }]
    mocks.resolveStandardWorkDurationSeed.mockResolvedValue({
      __stableCode: 'steel_structure_installation',
      stableCode: 'steel_structure_installation',
      defaultDaysP50: 12,
      defaultDaysP80: 18,
      fixedDays: 0,
      variableDays: 12,
      confidence: 'medium',
      benchmarkBasis: 'Steel structure installation default.',
    })

    const suggestion = await getTaskDurationSuggestion({ projectId: 'project-1', taskId: 'task-1' })

    expect(suggestion.recommendedDurationDays).toBe(14)
    expect(mocks.resolveStandardWorkDurationSeed).toHaveBeenCalledWith(
      expect.stringContaining('steel_structure'),
      expect.objectContaining({
        projectId: 'project-1',
        standardWorkCode: 'steel_structure_installation',
        methodVariantCodes: ['steel_frame'],
      }),
    )
  })

  it('uses projectGenerationFacts snapshot as duration seed context input', async () => {
    mocks.query.maybeSingle
      .mockResolvedValueOnce({
        data: {
          id: 'task-1',
          project_id: 'project-1',
          title: 'Hospital cleanroom commissioning',
          standard_work_code: 'cleanroom_hvac_commissioning',
          wbs_node_type: 'process',
          standard_task_metadata: {
            projectGenerationFacts: {
              businessType: 'hospital',
              structureTypeCode: 'shear_wall',
              methodVariantCodes: ['cleanroom'],
              elementVariantCodes: ['laminar_flow'],
              buildingCount: 6,
              totalAreaM2: 180000,
              aboveGroundAreaM2: 138000,
              basementAreaM2: 42000,
              siteAreaM2: 56000,
              standardFloorCount: 24,
              highestBuildingFloorCount: 33,
              basementLevelCount: 3,
              foundationDepthM: 14,
              prefabRate: 0.35,
              maxSpanM: 28,
              supportHeightM: 9.2,
              hasCivilDefense: true,
              towerCraneCount: 5,
              constructionHoistCount: 6,
              buildingPatternCodes: ['highrise_cast_in_place'],
              functionalUsageCodes: ['hospital'],
              floorUsageCodes: ['mechanical'],
              functionalCategoryCodes: ['cleanroom'],
              specialRoomTypeCodes: ['operating_room'],
              physicalZoneTypeCodes: ['medical_tower'],
              externalInterfaceCodes: ['metro_adjacent'],
              hardConstraintCodes: ['occupied_operation_boundary'],
              locationFacts: {
                city: 'guangzhou',
                climateSignals: ['summer_heat', 'rainy_season'],
              },
            },
          },
        },
        error: null,
      })
      .mockResolvedValue({ data: null, error: null })
    mocks.resolveStandardWorkDurationSeed.mockResolvedValue({
      __stableCode: 'cleanroom_hvac_commissioning',
      stableCode: 'cleanroom_hvac_commissioning',
      defaultDaysP50: 18,
      defaultDaysP80: 24,
      fixedDays: 0,
      variableDays: 18,
      confidence: 'medium',
      benchmarkBasis: 'Cleanroom HVAC commissioning default.',
    })

    const suggestion = await getTaskDurationSuggestion({ projectId: 'project-1', taskId: 'task-1' })

    expect(suggestion.recommendedDurationDays).toBe(20)
    expect(mocks.resolveStandardWorkDurationSeed).toHaveBeenCalledWith(
      expect.stringContaining('cleanroom_hvac_commissioning'),
      expect.objectContaining({
        projectId: 'project-1',
        standardWorkCode: 'cleanroom_hvac_commissioning',
        projectTypeCode: 'hospital',
        structureTypeCode: 'shear_wall',
        methodVariantCodes: ['cleanroom'],
        featureProfile: expect.objectContaining({
          projectTypeCode: 'hospital',
          structureTypeCode: 'shear_wall',
          methodVariantCodes: ['cleanroom'],
          elementVariantCodes: ['laminar_flow'],
          buildingCount: 6,
          totalAreaM2: 180000,
          aboveGroundAreaM2: 138000,
          basementAreaM2: 42000,
          siteAreaM2: 56000,
          standardFloorCount: 24,
          highestBuildingFloorCount: 33,
          basementLevelCount: 3,
          foundationDepthM: 14,
          prefabRate: 0.35,
          maxSpanM: 28,
          supportHeightM: 9.2,
          hasCivilDefense: true,
          towerCraneCount: 5,
          constructionHoistCount: 6,
          buildingPatternCodes: ['highrise_cast_in_place'],
          functionalUsageCodes: ['hospital'],
          floorUsageCodes: ['mechanical'],
          functionalCategoryCodes: ['cleanroom'],
          specialRoomTypeCodes: ['operating_room'],
          physicalZoneTypeCodes: ['medical_tower'],
          externalInterfaceCodes: ['metro_adjacent'],
          hardConstraintCodes: ['occupied_operation_boundary'],
          locationFacts: expect.objectContaining({
            city: 'guangzhou',
            climateSignals: ['summer_heat', 'rainy_season'],
          }),
        }),
      }),
    )
    expect(mocks.buildDurationContext).toHaveBeenCalledWith(expect.objectContaining({
      projectGenerationFacts: expect.objectContaining({
        businessType: 'hospital',
        structureTypeCode: 'shear_wall',
        methodVariantCodes: ['cleanroom'],
        elementVariantCodes: ['laminar_flow'],
        buildingCount: 6,
        totalAreaM2: 180000,
        aboveGroundAreaM2: 138000,
        basementAreaM2: 42000,
        siteAreaM2: 56000,
        standardFloorCount: 24,
        highestBuildingFloorCount: 33,
        basementLevelCount: 3,
        foundationDepthM: 14,
        prefabRate: 0.35,
        maxSpanM: 28,
        supportHeightM: 9.2,
        hasCivilDefense: true,
        towerCraneCount: 5,
        constructionHoistCount: 6,
        buildingPatternCodes: ['highrise_cast_in_place'],
        functionalUsageCodes: ['hospital'],
        floorUsageCodes: ['mechanical'],
        functionalCategoryCodes: ['cleanroom'],
        specialRoomTypeCodes: ['operating_room'],
        physicalZoneTypeCodes: ['medical_tower'],
        externalInterfaceCodes: ['metro_adjacent'],
        hardConstraintCodes: ['occupied_operation_boundary'],
        locationFacts: expect.objectContaining({
          city: 'guangzhou',
          climateSignals: ['summer_heat', 'rainy_season'],
        }),
      }),
    }))
  })

  it('hydrates unsaved new task references from project-level ProjectGenerationFacts when only projectId is provided', async () => {
    mocks.state.projectsData = [{
      id: 'project-1',
      metadata: {
        projectGenerationFacts: {
          businessType: 'general_civil',
          businessSubtype: 'civil_residential',
          structureTypeCode: 'shear_wall',
          methodVariantCodes: ['cast_in_situ'],
          elementVariantCodes: ['standard_floor'],
          buildingCount: 3,
          totalAreaM2: 180000,
          basementAreaM2: 42000,
          highestBuildingFloorCount: 33,
          basementLevelCount: 2,
          foundationDepthM: 9,
          buildingPatternCodes: ['high_rise_cast_in_situ_shear_wall'],
        },
      },
    }]
    mocks.resolveStandardWorkDurationSeed.mockResolvedValue({
      __stableCode: 'standard_floor_rebar_installation',
      stableCode: 'standard_floor_rebar_installation',
      standardWorkCodes: ['BDT-04-01-01-P05'],
      defaultDaysP50: 6,
      defaultDaysP80: 9,
      fixedDays: 1,
      variableDays: 5,
      confidence: 'medium',
      benchmarkBasis: 'Standard floor rebar installation default.',
    })

    const suggestion = await getTaskDurationSuggestion({
      suggestionPurpose: 'new_task_reference',
      projectId: 'project-1',
      standardWorkCode: 'BDT-04-01-01-P05',
      taskTitle: 'standard floor rebar installation',
      wbsNodeType: 'process',
    })

    expect(suggestion.recommendedDurationDays).toBe(7)
    expect(suggestion.durationOutputCode).toBe('contextual_reference')
    expect(suggestion.contextualReferenceDays).toBe(7)
    expect(suggestion.calculationContext).not.toHaveProperty('duration_output_contract')
    expect(suggestion.calculationContext?.durationOutputContract).toEqual(expect.objectContaining({
      code: 'contextual_reference',
      semanticFieldName: 'contextualReferenceDays',
    }))
    expect(mocks.resolveStandardWorkDurationSeed).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        projectId: 'project-1',
        projectTypeCode: 'general_civil',
        structureTypeCode: 'shear_wall',
        methodVariantCodes: ['cast_in_situ'],
        featureProfile: expect.objectContaining({
          projectTypeCode: 'general_civil',
          businessSubtype: 'civil_residential',
          buildingCount: 3,
          totalAreaM2: 180000,
          basementAreaM2: 42000,
          highestBuildingFloorCount: 33,
          basementLevelCount: 2,
          foundationDepthM: 9,
          buildingPatternCodes: ['high_rise_cast_in_situ_shear_wall'],
        }),
      }),
    )
    expect(mocks.buildDurationContext).toHaveBeenCalledWith(expect.objectContaining({
      projectGenerationFacts: expect.objectContaining({
        businessType: 'general_civil',
        businessSubtype: 'civil_residential',
        structureTypeCode: 'shear_wall',
        methodVariantCodes: ['cast_in_situ'],
        buildingCount: 3,
        totalAreaM2: 180000,
        basementAreaM2: 42000,
        highestBuildingFloorCount: 33,
        basementLevelCount: 2,
        foundationDepthM: 9,
        buildingPatternCodes: ['high_rise_cast_in_situ_shear_wall'],
      }),
    }))
  })

  it('uses ProjectGenerationFacts scale data through the shared duration scale resolver', async () => {
    mocks.state.projectsData = [{
      id: 'project-1',
      metadata: {
        projectGenerationFacts: {
          businessType: 'general_civil',
          structureTypeCode: 'shear_wall',
          methodVariantCodes: ['cast_in_situ'],
          buildingCount: 3,
          totalAreaM2: 180000,
          highestBuildingFloorCount: 33,
          buildingPatternCodes: ['high_rise_cast_in_situ_shear_wall'],
        },
      },
    }]
    mocks.resolveStandardWorkDurationSeed.mockResolvedValue({
      __stableCode: 'standard_floor_finish_area',
      stableCode: 'standard_floor_finish_area',
      standardWorkCodes: ['standard_floor_finish_area'],
      defaultDaysP50: 10,
      defaultDaysP80: 14,
      fixedDays: 2,
      variableDays: 8,
      scaleBasis: 'area',
      confidence: 'high',
      benchmarkBasis: 'Area based standard floor finish seed.',
    })

    const suggestion = await getTaskDurationSuggestion({
      suggestionPurpose: 'new_task_reference',
      projectId: 'project-1',
      standardWorkCode: 'standard_floor_finish_area',
      taskTitle: 'standard floor finish area',
      wbsNodeType: 'process',
    })

    expect(suggestion.recommendedDurationDays).toBe(14)
    expect(suggestion.factorSummary?.scaleFactor).toBeCloseTo(1.15, 2)
    expect(suggestion.quantitySource).toBe('engineering_object_proxy')
    expect(suggestion.businessReasonParams?.scaleBasis).toBe('project_fact_scale_proxy')
    expect(suggestion.businessReasonParams?.quantitySource).toBe('engineering_object_proxy')
    expect(suggestion.businessReasonParams?.scaleSignals).toEqual(expect.arrayContaining([
      'quantitySource=engineering_object_proxy',
      'scaleBasis=area',
      'projectScaleRatio=1.544',
      'rawScaleFactor=1.173',
      'scaleConfidenceWeight=0.85',
    ]))
  })

  it('does not use row-name-suggestion variants as strong duration seed context', async () => {
    mocks.resolveStandardWorkDurationSeed.mockResolvedValue({
      __stableCode: 'rebar_installation',
      stableCode: 'rebar_installation',
      defaultDaysP50: 6,
      defaultDaysP80: 9,
      fixedDays: 1,
      variableDays: 5,
      confidence: 'medium',
      benchmarkBasis: 'Rebar installation default per work face.',
    })

    const suggestion = await getTaskDurationSuggestion({
      projectId: 'project-1',
      standardWorkCode: 'rebar_installation',
      taskTitle: '梁钢筋绑扎',
      wbsNodeType: 'process',
      methodVariantCodes: ['mass_concrete'],
      methodVariantSource: 'row_name_suggestion',
      elementVariantCodes: ['beam'],
      elementVariantSource: 'row_name_suggestion',
    })

    expect(suggestion.recommendedDurationDays).toBe(7)
    expect(mocks.resolveStandardWorkDurationSeed).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        standardWorkCode: 'rebar_installation',
        methodVariantCodes: [],
      }),
    )
  })

  it('penalizes confidence when trusted method or element variants fall back to a generic duration seed', async () => {
    mocks.resolveStandardWorkDurationSeed.mockResolvedValue({
      __stableCode: 'rebar_installation',
      stableCode: 'rebar_installation',
      standardWorkCodes: ['rebar_installation'],
      defaultDaysP50: 10,
      defaultDaysP80: 14,
      fixedDays: 1,
      variableDays: 9,
      confidence: 'high',
      benchmarkBasis: 'Generic rebar installation default per work face.',
    })

    const suggestion = await getTaskDurationSuggestion({
      projectId: 'project-1',
      standardWorkCode: 'rebar_installation',
      taskTitle: 'rebar installation',
      wbsNodeType: 'process',
      methodVariantCodes: ['prefabricated_rebar'],
      methodVariantSource: 'template',
      elementVariantCodes: ['large_span'],
      elementVariantSource: 'engineering_feature',
    })

    expect(suggestion.recommendedDurationDays).toBe(12)
    expect(suggestion.confidenceScore).toBe(59)
    expect(suggestion.confidenceLevel).toBe('medium')
    expect(suggestion.businessReason).toContain('未匹配到对应施工方法/构件变体的专项 seed')
    expect(suggestion.businessReasonParams).toEqual(expect.objectContaining({
      seedVariantFallback: true,
      seedVariantFallbackPenalty: 12,
      requestedMethodVariantCodes: ['prefabricated_rebar'],
      requestedElementVariantCodes: ['large_span'],
    }))
    expect(suggestion.factorAvailability?.seed_variant_specific_match).toBe(false)
  })

  it('uses effective construction days for monthly commitment windows', async () => {
    mocks.resolveStandardWorkDurationSeed.mockResolvedValue({
      __stableCode: 'rebar_installation',
      stableCode: 'rebar_installation',
      defaultDaysP50: 10,
      defaultDaysP80: 14,
      fixedDays: 1,
      variableDays: 9,
      confidence: 'medium',
      benchmarkBasis: 'Rebar installation default per work face.',
    })

    const suggestion = await getTaskDurationSuggestion({
      suggestionPurpose: 'monthly_commitment_window',
      projectId: 'project-1',
      standardWorkCode: 'rebar_installation',
      taskTitle: 'rebar installation',
      wbsNodeType: 'process',
      currentProgress: 0,
      targetProgress: 50,
      plannedStartDate: '2026-05-29',
      plannedEndDate: '2026-05-31',
      workCalendar: {
        basis: 'official_construction_calendar_seed',
        windows: [{
          holidayCode: 'project_shutdown_2026',
          holidayName: 'Project shutdown',
          startDate: '2026-05-30',
          endDate: '2026-05-31',
          counts_as_construction_shutdown: true,
        }],
      },
    })

    const window = suggestion.businessReasonParams?.monthlyCommitmentWindow as Record<string, unknown>
    expect(window.windowProductionDays).toBe(1)
    expect(window.windowWorkdays).toBe(1)
    expect(suggestion.displaySummary).toContain('1 个有效施工日')
    expect(suggestion.displaySummary).not.toContain('工作日')
    expect((suggestion.calculationContext as Record<string, unknown> | null | undefined)?.duration_calendar).toEqual(expect.objectContaining({
      basis: 'official_construction_calendar_seed',
      windowCount: 1,
    }))
  })

  it('records runtime consumer evidence from getTaskDurationSuggestion when published artifacts are consumed', async () => {
    const { calls, queryExec } = createRecordingQueryExec()
    mocks.query.maybeSingle.mockImplementation(async () => {
      if (isCompanyBenchmarkScope('company-1')) {
        return {
          data: {
            duration_day_basis: 'construction_production_day',
            p50_days: 8,
            p75_days: 10,
            p80_days: 12,
            sample_count: 24,
            confidence_level: 'high',
            confidence_score: 86,
            company_id: 'company-1',
          },
          error: null,
        }
      }
      return { data: null, error: null }
    })
    mocks.state.coldStartBaselinesData = [{
      id: 'segment-v1',
      baseline_key: 'standard_work_duration:rebar_installation',
      scope_level: 'segment_baseline',
      publication_key: 'cold_start_baseline_runtime:segment-v1',
      runtime_publication_status: 'published',
      rollback_target: 'cold_start_baseline_runtime:segment-v0',
      baseline_value: { p50Days: 9 },
      evidence_summary: {
        minCompanyCount: 3,
        contributingCompanyCount: 5,
        minProjectCount: 10,
        contributingProjectCount: 16,
        singleCompanyShare: 0.24,
        maxSingleCompanyShare: 0.4,
        applicableScenarioKeys: ['residential'],
      },
    }]
    mocks.resolveStandardWorkDurationSeed.mockResolvedValue({
      __resolverSource: 'active_seed',
      __seedVersion: 'standard-v1',
      __stableCode: 'rebar_installation',
      stableCode: 'rebar_installation',
      defaultDaysP50: 10,
      defaultDaysP80: 14,
      fixedDays: 1,
      variableDays: 9,
      confidence: 'medium',
      benchmarkBasis: 'Rebar installation default per work face.',
    })
    mocks.loadAlgorithmAssetLearnableParameterRuntimeValue
      .mockResolvedValueOnce({
        status: 'runtime_parameter_not_found',
        runtimeConsumable: false,
        parameterKey: 'duration.benchmark_blend_weight',
        runtimeValue: null,
        consumptionMode: 'canary',
        publicationKey: null,
        publicationStatus: null,
        scopeLevel: null,
        companyId: null,
        projectId: null,
        rollbackTarget: null,
        reasons: ['runtime_parameter_publication_not_found'],
        writesSeedRuntimeDirectly: false,
      })
      .mockResolvedValueOnce({
        status: 'runtime_parameter_consumable',
        runtimeConsumable: true,
        parameterKey: 'duration.benchmark_blend_weight',
        runtimeValue: 0.5,
        consumptionMode: 'stable',
        publicationKey: 'duration_benchmark_runtime:benchmark-blend-v2',
        publicationStatus: 'published',
        scopeLevel: 'company',
        companyId: 'company-1',
        projectId: null,
        rollbackTarget: 'duration_benchmark_runtime:benchmark-blend-v1',
        reasons: [],
        writesSeedRuntimeDirectly: false,
      })
      .mockResolvedValueOnce({
        status: 'runtime_parameter_not_found',
        runtimeConsumable: false,
        parameterKey: 'duration.p50_p75_blend_ratio',
        runtimeValue: null,
        publicationKey: null,
        publicationStatus: null,
        scopeLevel: null,
        companyId: null,
        projectId: null,
        rollbackTarget: null,
        reasons: ['runtime_parameter_publication_not_found'],
        writesSeedRuntimeDirectly: false,
      })

    const suggestion = await getTaskDurationSuggestion({
      projectId: 'project-1',
      companyId: 'company-1',
      standardWorkCode: 'rebar_installation',
      taskTitle: 'rebar installation',
      projectTypeCode: 'residential',
      wbsNodeType: 'process',
      runtimeConsumerObservationQueryExec: queryExec,
      runtimeEvidenceMode: 'record',
    } as any)

    expect(suggestion.durationCalibrationSource).toBe('standard_work_duration_seed+company_history_sample')
    expect(callsForTable(calls, 'runtime_consumer_runtime_calls')).toHaveLength(1)
    expect(callsForTable(calls, 'runtime_consumer_observations').map((call) => call.params.slice(0, 4))).toEqual([
      [
        'base_duration_benchmark',
        'duration_benchmark_runtime:benchmark-blend-v2',
        'durationSuggestionService',
        'duration_suggestion',
      ],
      [
        'standard_work_duration_seed',
        'algorithm_seed_versions:standard-v1',
        'durationSuggestionService',
        'duration_suggestion',
      ],
    ])
  })

  it('consumes a scoped learned standard-duration publication instead of leaving the learned seed idle', async () => {
    const calls: Array<{ sql: string, params: unknown[] }> = []
    const queryExec = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> => {
      calls.push({ sql, params })
      if (sql.includes('from public.duration_learning_runtime_publications')) {
        return [{
          publication_key: 'duration_learning_runtime:standard_work_duration_seed:rebar-company-canary',
          asset_key: 'standard_work_duration_seed',
          artifact_key: 'rebar_installation',
          scope_level: 'company',
          company_id: 'company-1',
          project_id: null,
          industry_key: null,
          publication_stage: 'canary',
          runtime_payload: {
            stableCode: 'rebar_installation',
            defaultDaysP20: 6,
            defaultDaysP50: 7,
            defaultDaysP80: 9,
            durationDayBasis: 'construction_production_day',
          },
          previous_publication_key: 'algorithm_seed_versions:standard-v1',
          traffic_percent: 100,
          monitoring_status: 'collecting',
          published_at: '2026-07-17T00:00:00.000Z',
        }] as T[]
      }
      return [] as T[]
    }
    mocks.resolveStandardWorkDurationSeed.mockResolvedValue({
      __resolverSource: 'active_seed',
      __seedVersion: 'standard-v1',
      __stableCode: 'rebar_installation',
      stableCode: 'rebar_installation',
      defaultDaysP20: 8,
      defaultDaysP50: 10,
      defaultDaysP80: 14,
      fixedDays: 1,
      variableDays: 9,
      confidence: 'medium',
      benchmarkBasis: 'System cold-start seed.',
    })

    const suggestion = await getTaskDurationSuggestion({
      projectId: 'project-1',
      companyId: 'company-1',
      standardWorkCode: 'rebar_installation',
      taskTitle: 'rebar installation',
      projectTypeCode: 'residential',
      wbsNodeType: 'process',
      runtimeConsumerObservationQueryExec: queryExec,
      runtimeEvidenceMode: 'record',
    } as any)

    expect(suggestion.recommendedDurationDays).toBe(8)
    expect(suggestion.businessReasonParams).toEqual(expect.objectContaining({
      seedSource: 'duration_learning_company_canary',
      seedVersion: 'duration_learning_runtime:standard_work_duration_seed:rebar-company-canary',
    }))
    expect(callsForTable(calls, 'runtime_consumer_observations').map((call) => call.params.slice(0, 4))).toContainEqual([
      'standard_work_duration_seed',
      'duration_learning_runtime:standard_work_duration_seed:rebar-company-canary',
      'durationSuggestionService',
      'duration_suggestion',
    ])
  })

  it('consumes a production-day learned benchmark publication and records its exact lineage', async () => {
    const calls: Array<{ sql: string, params: unknown[] }> = []
    const queryExec = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> => {
      calls.push({ sql, params })
      if (
        sql.includes('from public.duration_learning_runtime_publications')
        && params[0] === 'base_duration_benchmark'
      ) {
        return [{
          publication_key: 'duration_learning_runtime:base_duration_benchmark:rebar-company-canary',
          asset_key: 'base_duration_benchmark',
          artifact_key: 'rebar_installation:process:all',
          scope_level: 'company',
          company_id: 'company-1',
          project_id: null,
          industry_key: null,
          publication_stage: 'canary',
          runtime_payload: {
            benchmarkId: '44444444-4444-4444-8444-444444444444',
            benchmarkVersion: 'runtime-company-v2',
            p50Days: 6,
            p75Days: 8,
            p80Days: 9,
            meanDays: 7,
            sampleCount: 50,
            variance: 0.2,
            coefficientOfVariation: 0.063888,
            confidenceLevel: 'high',
            confidenceScore: 92,
            durationDayBasis: 'construction_production_day',
            calendarRef: 'cn-work-calendar',
            calendarVersion: '2026.07',
            generatedAt: '2026-07-17T00:00:00.000Z',
            sourceWindowStart: '2026-07-01T00:00:00.000Z',
            sourceAsOf: '2026-07-16T23:59:59.000Z',
          },
          previous_publication_key: 'duration_benchmarks:company-v1',
          traffic_percent: 100,
          monitoring_status: 'collecting',
          published_at: '2026-07-17T00:00:00.000Z',
        }] as T[]
      }
      return [] as T[]
    }
    mocks.resolveStandardWorkDurationSeed.mockResolvedValue({
      __resolverSource: 'active_seed',
      __seedVersion: 'standard-v1',
      __stableCode: 'rebar_installation',
      stableCode: 'rebar_installation',
      defaultDaysP50: 10,
      defaultDaysP80: 14,
      confidence: 'medium',
    })
    mocks.loadCurrentCauseSegment.mockResolvedValue({
      id: 'segment-material-runtime',
      benchmarkId: '44444444-4444-4444-8444-444444444444',
      companyId: 'company-1',
      projectId: null,
      causeCode: 'material_shortage',
      taxonomyVersion: 'v1.0.0',
      sampleCount: 6,
      p50Days: 4,
      p75Days: 5,
      p80Days: 6,
      meanDays: 4.5,
      variance: 0.15,
      generatedAt: '2026-07-17T00:00:00.000Z',
      sourceWindowStart: '2026-07-01T00:00:00.000Z',
      sourceAsOf: '2026-07-16T23:59:59.000Z',
      durationDayBasis: 'construction_production_day',
      calendarRef: 'cn-work-calendar',
      calendarVersion: '2026.07',
    })

    const suggestion = await getTaskDurationSuggestion({
      projectId: 'project-1',
      companyId: 'company-1',
      standardWorkCode: 'rebar_installation',
      taskTitle: 'rebar installation',
      projectTypeCode: 'residential',
      wbsNodeType: 'process',
      runtimeConsumerObservationQueryExec: queryExec,
      runtimeEvidenceMode: 'record',
      confirmedCauseCode: 'material_shortage',
    } as any)

    expect(suggestion.recommendedDurationDays).toBeLessThan(12)
    expect(suggestion.businessReasonParams).toEqual(expect.objectContaining({
      benchmarkP50: 4,
      benchmarkDurationDayBasis: 'construction_production_day',
      benchmarkCauseSelection: 'exact_cause',
    }))
    expect(suggestion).toMatchObject({
      benchmarkVersion: 'runtime-company-v2',
      benchmarkScope: 'company',
      benchmarkProvenanceAvailability: 'available',
      benchmarkProvenance: {
        mode: 'single',
        entries: [expect.objectContaining({
          source: 'cause_segment',
          publicationKey: 'duration_learning_runtime:base_duration_benchmark:rebar-company-canary',
          benchmarkVersion: 'runtime-company-v2',
          scope: 'company',
          causeSegment: { causeCode: 'material_shortage', taxonomyVersion: 'v1.0.0' },
          calendarRef: 'cn-work-calendar',
          calendarVersion: '2026.07',
          availability: 'available',
        })],
      },
    })
    expect(mocks.loadCurrentCauseSegment).toHaveBeenCalledWith(expect.objectContaining({
      benchmarkId: '44444444-4444-4444-8444-444444444444',
      causeCode: 'material_shortage',
    }), expect.any(Function))
    expect(callsForTable(calls, 'runtime_consumer_observations').map((call) => call.params.slice(0, 4))).toContainEqual([
      'base_duration_benchmark',
      'duration_learning_runtime:base_duration_benchmark:rebar-company-canary',
      'durationSuggestionService',
      'duration_suggestion',
    ])
  })

  it('keeps implicit runtime consumer evidence writes out of test runs without an injected writer', async () => {
    mocks.resolveStandardWorkDurationSeed.mockResolvedValue({
      __resolverSource: 'company_override',
      __seedVersion: 'company-override-v1',
      __stableCode: 'rebar_installation',
      stableCode: 'rebar_installation',
      defaultDaysP50: 10,
      defaultDaysP80: 14,
      fixedDays: 1,
      variableDays: 9,
      confidence: 'medium',
      benchmarkBasis: 'Company override reference.',
    })

    await getTaskDurationSuggestion({
      projectId: 'project-1',
      companyId: 'company-1',
      standardWorkCode: 'rebar_installation',
      taskTitle: 'rebar installation',
      wbsNodeType: 'process',
    } as any)

    expect(mocks.rawQuery).not.toHaveBeenCalled()
  })

  it('defaults to no-write even when a runtime resolver query executor is injected', async () => {
    const { calls, queryExec } = createRecordingQueryExec()
    mocks.resolveStandardWorkDurationSeed.mockResolvedValue({
      __resolverSource: 'company_override',
      __seedVersion: 'company-override-v1',
      __stableCode: 'rebar_installation',
      stableCode: 'rebar_installation',
      defaultDaysP50: 10,
      defaultDaysP80: 14,
      fixedDays: 1,
      variableDays: 9,
      confidence: 'medium',
      benchmarkBasis: 'Company override reference.',
    })

    await getTaskDurationSuggestion({
      projectId: 'project-1',
      companyId: 'company-1',
      standardWorkCode: 'rebar_installation',
      taskTitle: 'rebar installation',
      wbsNodeType: 'process',
      runtimeConsumerObservationQueryExec: queryExec,
    } as any)

    expect(callsForTable(calls, 'runtime_consumer_runtime_calls')).toHaveLength(0)
    expect(callsForTable(calls, 'runtime_consumer_observations')).toHaveLength(0)
    expect(mocks.recordDurationAccuracyPrediction).not.toHaveBeenCalled()
  })

  it('allows an explicit record mode to exercise the default runtime evidence writer in tests', async () => {
    mocks.resolveStandardWorkDurationSeed.mockResolvedValue({
      __resolverSource: 'company_override',
      __seedVersion: 'company-override-v1',
      __stableCode: 'rebar_installation',
      stableCode: 'rebar_installation',
      defaultDaysP50: 10,
      defaultDaysP80: 14,
      fixedDays: 1,
      variableDays: 9,
      confidence: 'medium',
      benchmarkBasis: 'Company override reference.',
    })

    await getTaskDurationSuggestion({
      projectId: 'project-1',
      companyId: 'company-1',
      standardWorkCode: 'rebar_installation',
      taskTitle: 'rebar installation',
      wbsNodeType: 'process',
      runtimeEvidenceMode: 'record',
    } as any)

    expect(mocks.rawQuery).toHaveBeenCalledTimes(1)
  })

  it('records runtime consumer evidence for shared cold-start baselines consumed by getTaskDurationSuggestion', async () => {
    const { calls, queryExec } = createRecordingQueryExec()
    mocks.state.coldStartBaselinesData = [{
      id: 'segment-v1',
      baseline_key: 'standard_work_duration:rebar_installation',
      scope_level: 'segment_baseline',
      publication_key: 'cold_start_baseline_runtime:segment-v1',
      runtime_publication_status: 'published',
      rollback_target: 'cold_start_baseline_runtime:segment-v0',
      baseline_value: { p50Days: 9 },
      evidence_summary: {
        minCompanyCount: 3,
        contributingCompanyCount: 5,
        minProjectCount: 10,
        contributingProjectCount: 16,
        singleCompanyShare: 0.24,
        maxSingleCompanyShare: 0.4,
        applicableScenarioKeys: ['residential'],
      },
    }]
    mocks.resolveStandardWorkDurationSeed.mockResolvedValue({
      __resolverSource: 'active_seed',
      __seedVersion: 'standard-v1',
      __stableCode: 'rebar_installation',
      stableCode: 'rebar_installation',
      defaultDaysP50: 10,
      defaultDaysP80: 14,
      fixedDays: 1,
      variableDays: 9,
      confidence: 'medium',
      benchmarkBasis: 'Rebar installation default per work face.',
    })

    const suggestion = await getTaskDurationSuggestion({
      projectId: 'project-1',
      companyId: 'company-1',
      standardWorkCode: 'rebar_installation',
      taskTitle: 'rebar installation',
      projectTypeCode: 'residential',
      wbsNodeType: 'process',
      runtimeConsumerObservationQueryExec: queryExec,
      runtimeEvidenceMode: 'record',
    } as any)

    expect(suggestion.durationCalibrationSource).toBe('cold_start_baseline')
    expect(callsForTable(calls, 'runtime_consumer_runtime_calls')).toHaveLength(1)
    expect(callsForTable(calls, 'runtime_consumer_observations').map((call) => call.params.slice(0, 4))).toEqual([
      [
        'duration_cold_start_baseline',
        'cold_start_baseline_runtime:segment-v1',
        'durationSuggestionService',
        'duration_suggestion',
      ],
      [
        'standard_work_duration_seed',
        'algorithm_seed_versions:standard-v1',
        'durationSuggestionService',
        'duration_suggestion',
      ],
    ])
  })

  it('records a call but does not treat company override seeds as algorithm seed runtime publications', async () => {
    const { calls, queryExec } = createRecordingQueryExec()
    mocks.resolveStandardWorkDurationSeed.mockResolvedValue({
      __resolverSource: 'company_override',
      __seedVersion: 'company-override-v1',
      __stableCode: 'rebar_installation',
      stableCode: 'rebar_installation',
      defaultDaysP50: 10,
      defaultDaysP80: 14,
      fixedDays: 1,
      variableDays: 9,
      confidence: 'medium',
      benchmarkBasis: 'Company override reference.',
    })

    const suggestion = await getTaskDurationSuggestion({
      projectId: 'project-1',
      companyId: 'company-1',
      standardWorkCode: 'rebar_installation',
      taskTitle: 'rebar installation',
      wbsNodeType: 'process',
      runtimeConsumerObservationQueryExec: queryExec,
      runtimeEvidenceMode: 'record',
    } as any)

    expect(suggestion.durationCalibrationSource).toBe('standard_work_duration_seed')
    expect(callsForTable(calls, 'runtime_consumer_runtime_calls')).toHaveLength(1)
    expect(callsForTable(calls, 'runtime_consumer_observations')).toHaveLength(0)
    const runtimeCall = callsForTable(calls, 'runtime_consumer_runtime_calls')[0]
    expect(runtimeCall?.sql).toContain('$4::jsonb')
    expect(JSON.parse(String(runtimeCall?.params[3]))).toEqual(expect.objectContaining({
      runtimeAssetMode: 'no_published_artifact',
      runtimeArtifactCount: 0,
    }))
  })

  it('records v1.4.22.5 runtime consumer evidence for duration suggestion artifacts', async () => {
    const { calls, queryExec } = createRecordingQueryExec()

    const result = await recordDurationSuggestionRuntimeConsumption({
      queryExec,
      projectId: 'project-1',
      taskId: 'task-1',
      standardWorkCode: 'rebar_installation',
      observedAt: '2026-06-15T10:00:00.000Z',
      runtimeArtifactPublications: [
        {
          assetKey: 'base_duration_benchmark',
          publicationKey: 'duration_benchmark_runtime:base-v1',
          publicationStatus: 'published',
          sourceEvidenceRefs: ['duration_benchmarks:base-v1'],
        },
        {
          assetKey: 'duration_cold_start_baseline',
          publicationKey: 'cold_start_baseline_runtime:segment-v1',
          publicationStatus: 'canary',
          sourceEvidenceRefs: ['algorithm_cold_start_baselines:segment-v1'],
        },
        {
          assetKey: 'standard_work_duration_seed',
          publicationKey: 'algorithm_seed_versions:standard-v1',
          publicationStatus: 'runtime_published',
          sourceEvidenceRefs: ['algorithm_seed_versions:standard-v1'],
        },
        {
          assetKey: 'special_work_duration_seed',
          publicationKey: 'duration_learning_runtime:special_work_duration_seed:special-v1',
          publicationStatus: 'published',
          sourceEvidenceRefs: ['duration_learning_runtime:special_work_duration_seed:special-v1'],
        },
        {
          assetKey: 'forecast_residual_overlay',
          publicationKey: 'forecast_residual_overlay_runtime:overlay-v1',
          publicationStatus: 'published',
        },
      ],
    })

    expect(result).toEqual(expect.objectContaining({
      status: 'runtime_consumer_observations_recorded',
      recordedCount: 4,
      blockedCount: 0,
      reasons: [],
    }))
    expect(result.runtimeCallResult).toEqual(expect.objectContaining({
      status: 'runtime_consumer_runtime_call_recorded',
      canPersist: true,
    }))
    expect(callsForTable(calls, 'runtime_consumer_runtime_calls')).toHaveLength(1)
    expect(callsForTable(calls, 'runtime_consumer_observations').map((call) => call.params.slice(0, 4))).toEqual([
      [
        'base_duration_benchmark',
        'duration_benchmark_runtime:base-v1',
        'durationSuggestionService',
        'duration_suggestion',
      ],
      [
        'duration_cold_start_baseline',
        'cold_start_baseline_runtime:segment-v1',
        'durationSuggestionService',
        'duration_suggestion',
      ],
      [
        'standard_work_duration_seed',
        'algorithm_seed_versions:standard-v1',
        'durationSuggestionService',
        'duration_suggestion',
      ],
      [
        'special_work_duration_seed',
        'duration_learning_runtime:special_work_duration_seed:special-v1',
        'durationSuggestionService',
        'duration_suggestion',
      ],
    ])
  })

  it('records duration suggestion runtime consumption through the fixed runtime consumer tables', async () => {
    const { calls, queryExec } = createRecordingQueryExec()

    const result = await recordDurationSuggestionRuntimeConsumption({
      queryExec,
      projectId: 'project-1',
      taskId: 'task-1',
      standardWorkCode: 'rebar_installation',
      observedAt: '2026-06-15T10:00:00.000Z',
      runtimeArtifactPublications: [
        {
          assetKey: 'base_duration_benchmark',
          publicationKey: 'duration_benchmark_runtime:base-v1',
          publicationStatus: 'published',
          sourceEvidenceRefs: ['duration_benchmarks:base-v1'],
        },
      ],
    })

    expect(result.status).toBe('runtime_consumer_observations_recorded')
    expect(callsForTable(calls, 'runtime_consumer_runtime_calls')).toHaveLength(1)
    expect(callsForTable(calls, 'runtime_consumer_observations')).toHaveLength(1)
    expect(callsForTable(calls, 'runtime_consumer_runtime_calls')[0].sql).toContain('insert into public.runtime_consumer_runtime_calls')
    expect(callsForTable(calls, 'runtime_consumer_observations')[0].sql).toContain('insert into public.runtime_consumer_observations')
  })
})
