import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type Row = Record<string, any>

const mocks = vi.hoisted(() => {
  const state = {
    tasks: [] as Row[],
    conditions: [] as Row[],
    obstacles: [] as Row[],
    materials: [] as Row[],
    acceptancePlans: [] as Row[],
    progressSnapshots: [] as Row[],
    durationExperienceSamples: [] as Row[],
    projectDailySnapshot: [] as Row[],
    dataQualityFindings: [] as Row[],
    projectScheduleStates: [] as Row[],
    projectProductivityCalibrations: [] as Row[],
    resourceRecords: [] as Row[],
    standardDurationSeed: null as Row | null,
    weakStandardWorkMatches: [] as Row[],
    resolvedResource: null as Row | null,
  }

  function rowsFor(table: string) {
    if (table === 'tasks') return state.tasks
    if (table === 'task_conditions') return state.conditions
    if (table === 'task_obstacles') return state.obstacles
    if (table === 'project_materials') return state.materials
    if (table === 'acceptance_plans') return state.acceptancePlans
    if (table === 'task_progress_snapshots') return state.progressSnapshots
    if (table === 'duration_experience_samples') return state.durationExperienceSamples
    if (table === 'project_daily_snapshot') return state.projectDailySnapshot
    if (table === 'data_quality_findings') return state.dataQualityFindings
    if (table === 'project_schedule_states') return state.projectScheduleStates
    if (table === 'project_productivity_compensation_calibrations') return state.projectProductivityCalibrations
    return []
  }

  function applyFilters(rows: Row[], filters: Row[]) {
    return filters.reduce((result, filter) => {
      if (filter.type === 'eq') return result.filter((row) => row[filter.column] === filter.value)
      if (filter.type === 'in') return result.filter((row) => Array.isArray(filter.value) && filter.value.includes(row[filter.column]))
      if (filter.type === 'is') return result.filter((row) => row[filter.column] === filter.value)
      if (filter.type === 'not_eq') return result.filter((row) => row[filter.column] !== filter.value)
      if (filter.type === 'not_in') {
        const values = String(filter.value ?? '')
          .replace(/[()]/g, '')
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean)
        return result.filter((row) => !values.includes(String(row[filter.column] ?? '')))
      }
      return result
    }, rows)
  }

  function createBuilder(table: string) {
    const filters: Row[] = []
    const builder: any = {
      select: vi.fn(() => builder),
      eq: vi.fn((column: string, value: unknown) => {
        filters.push({ type: 'eq', column, value })
        return builder
      }),
      in: vi.fn((column: string, value: unknown[]) => {
        filters.push({ type: 'in', column, value })
        return builder
      }),
      is: vi.fn((column: string, value: unknown) => {
        filters.push({ type: 'is', column, value })
        return builder
      }),
      order: vi.fn(() => builder),
      limit: vi.fn(() => builder),
      not: vi.fn((column: string, operator: string, value: unknown) => {
        filters.push({ type: operator === 'in' ? 'not_in' : 'not_eq', column, value })
        return builder
      }),
      maybeSingle: vi.fn(async () => ({
        data: applyFilters(rowsFor(table), filters)[0] ?? null,
        error: null,
      })),
      then: vi.fn((resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => {
        return Promise.resolve({
          data: applyFilters(rowsFor(table), filters),
          error: null,
        }).then(resolve, reject)
      }),
    }
    return builder
  }

  const resolveV1474BuildingPatternMatch = vi.fn(async (..._args: any[]) => ({
    patternCode: null,
    record: null,
    matchScore: 0,
    confidenceScore: 0,
    confidenceLevel: 'low',
    matchedSignals: [],
    missingSignals: [],
    actionPolicy: 'confidence_only',
  }))
  const resolveV1474BuildingPatternMatches = vi.fn(async (...args: any[]): Promise<any[]> => {
    const match = await resolveV1474BuildingPatternMatch(...args)
    return match?.record ? [match] : []
  })

  return {
    state,
    from: vi.fn((table: string) => createBuilder(table)),
    resolveAlgorithmSeedRecords: vi.fn(async () => state.resourceRecords),
    resolveV1474ResourceClass: vi.fn(async () => state.resolvedResource),
    resolveStandardWorkDurationSeed: vi.fn(async () => state.standardDurationSeed),
    inferTitleWeakStandardWorkMatchesFromResolver: vi.fn(async () => state.weakStandardWorkMatches),
    resolveV1474HolidayWindow: vi.fn(async () => null),
    resolveV1474ProcessConstraint: vi.fn(async () => null),
    resolveV1474ProcessSeasonalSensitivity: vi.fn(async () => null),
    resolveV1474SeasonalProductivity: vi.fn(async () => null),
    resolveV1474WorkflowDictionary: vi.fn(async () => null),
    resolveWorkflowSequenceSignal: vi.fn(async () => null),
    resolveV1475CrossItemWorkflow: vi.fn(async () => null),
    resolveV1474BuildingPatternMatch,
    resolveV1474BuildingPatternMatches,
    hasV1474WorkCalendarForYear: vi.fn(async () => true),
    resolveProjectClimateRegion: vi.fn(async () => ({})),
    loadProjectWeatherImpactSignals: vi.fn(async () => []),
    loadProjectWeatherImpactSignalsWithDiagnostics: vi.fn(async (): Promise<any> => ({
      signals: [] as Row[],
      sourceStatus: 'not_configured_or_no_forecast',
      confidenceReason: undefined as string | undefined,
    })),
    getProjectCompanyId: vi.fn(async () => null),
    loadAlgorithmAssetLearnableParameterRuntimeValue: vi.fn(async (): Promise<any> => ({
      status: 'runtime_parameter_not_found',
      runtimeConsumable: false,
      parameterKey: 'duration.context.weather_multiplier',
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
    })),
    detectProgressAnomalySignals: vi.fn(() => []),
    buildProjectProgressVelocityLearning: vi.fn(async () => null),
    loadPublishedProgressVelocityRuntime: vi.fn(async (_input: { consumerKey?: string }) => null as any),
  }
})

vi.mock('../services/dbService.js', () => ({
  supabase: {
    from: mocks.from,
  },
}))

vi.mock('../middleware/logger.js', () => ({
  logger: {
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
  },
}))

vi.mock('../services/algorithmSeedResolver.js', async () => {
  const actual = await vi.importActual<typeof import('../services/algorithmSeedResolver.js')>('../services/algorithmSeedResolver.js')
  return {
    ...actual,
    resolveAlgorithmSeedRecords: mocks.resolveAlgorithmSeedRecords,
    hasV1474WorkCalendarForYear: mocks.hasV1474WorkCalendarForYear,
    resolveV1474HolidayWindow: mocks.resolveV1474HolidayWindow,
    resolveV1474ProcessConstraint: mocks.resolveV1474ProcessConstraint,
    resolveV1474ProcessSeasonalSensitivity: mocks.resolveV1474ProcessSeasonalSensitivity,
    resolveV1474ResourceClass: mocks.resolveV1474ResourceClass,
    resolveV1474SeasonalProductivity: mocks.resolveV1474SeasonalProductivity,
    resolveV1474WorkflowDictionary: mocks.resolveV1474WorkflowDictionary,
    resolveWorkflowSequenceSignal: mocks.resolveWorkflowSequenceSignal,
    resolveV1475CrossItemWorkflow: mocks.resolveV1475CrossItemWorkflow,
    resolveV1474BuildingPatternMatch: mocks.resolveV1474BuildingPatternMatch,
    resolveV1474BuildingPatternMatches: mocks.resolveV1474BuildingPatternMatches,
    resolveStandardWorkDurationSeed: mocks.resolveStandardWorkDurationSeed,
    inferTitleWeakStandardWorkMatchesFromResolver: mocks.inferTitleWeakStandardWorkMatchesFromResolver,
  }
})

vi.mock('../services/projectClimateRegionReadModelService.js', () => ({
  resolveProjectClimateRegion: mocks.resolveProjectClimateRegion,
}))

vi.mock('../services/progressAnomalyService.js', () => ({
  detectProgressAnomalySignals: mocks.detectProgressAnomalySignals,
}))

vi.mock('../services/progressVelocityLearningService.js', () => ({
  buildProjectProgressVelocityLearning: mocks.buildProjectProgressVelocityLearning,
}))

vi.mock('../services/progressVelocityRuntimePublicationService.js', () => ({
  loadPublishedProgressVelocityRuntime: mocks.loadPublishedProgressVelocityRuntime,
}))

vi.mock('../services/weatherImpactSignalReadModelService.js', () => ({
  loadProjectWeatherImpactSignals: mocks.loadProjectWeatherImpactSignals,
  loadProjectWeatherImpactSignalsWithDiagnostics: mocks.loadProjectWeatherImpactSignalsWithDiagnostics,
}))

vi.mock('../auth/access.js', () => ({
  getProjectCompanyId: mocks.getProjectCompanyId,
}))

vi.mock('../services/algorithmAssetLearnableParameterRuntimeConsumptionService.js', () => ({
  loadAlgorithmAssetLearnableParameterRuntimeValue: mocks.loadAlgorithmAssetLearnableParameterRuntimeValue,
}))

const { buildDurationContext } = await import('../services/durationContextService.js')

describe('durationContextService resource pressure', () => {
  function candidateScenario(context: any) {
    return context.calculationContext.candidate_duration_context as Record<string, any>
  }

  function publishedVelocity(multiplier = 0.8, overrides: Record<string, unknown> = {}) {
    return {
      durationRatio: multiplier,
      multiplier,
      confidenceLevel: 'high',
      confidenceScore: 90,
      confidenceDelta: 4,
      actionPolicy: 'auto_apply',
      sampleCount: 50,
      variance: 0,
      groupKey: 'runtime_publication:project',
      excludedAnomalyTaskCount: 0,
      reason: 'A governed stable project velocity publication is active for this project.',
      metadata: {
        publicationKey: 'velocity-stable-1',
        publicationStatus: 'published',
        consumptionMode: 'stable',
        runtimeAuthority: 'published_parameter_only',
        rawSampleConsumption: false,
      },
      ...overrides,
    }
  }

  function seedMatureRecoverySamples(_projectId: string) {
    mocks.loadPublishedProgressVelocityRuntime.mockImplementation(async (input: { consumerKey?: string }) => (
      input.consumerKey === 'durationContextPmRecoveryCompensationFactorService.published_velocity'
        ? publishedVelocity()
        : null
    ))
  }

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-20T08:00:00.000Z'))
    mocks.state.tasks = []
    mocks.state.conditions = []
    mocks.state.obstacles = []
    mocks.state.materials = []
    mocks.state.acceptancePlans = []
    mocks.state.progressSnapshots = []
    mocks.state.durationExperienceSamples = []
    mocks.state.projectDailySnapshot = []
    mocks.state.dataQualityFindings = []
    mocks.state.projectScheduleStates = []
    mocks.state.projectProductivityCalibrations = []
    mocks.state.resourceRecords = [{
      stableCode: 'default_site_capacity_pressure_policy',
      isActive: true,
      weights: {
        sameResponsibleUnit: 1,
        sameBuilding: 1,
        sameFloor: 1.35,
        sameZone: 1.6,
        sameResourceClass: 1,
        lowParallelCapacity: 1.35,
        highParallelCapacity: 0.65,
        progressPressure: 5,
        resourceCondition: 1,
        resourceObstacle: 2,
        overdueMaterial: 1,
        severeObstacle: 2,
        longTermSignal: 2,
        veryLongTermBonus: 2,
        verticalTransportLimited: 1.2,
        seasonWindowEmphasis: 1.15,
      },
      thresholds: {
        longTermSignalDays: 7,
        veryLongTermSignalDays: 14,
        mediumScore: 6,
        highScore: 13,
        complexityLevel: {
          normal: { multiplierMax: 1.2 },
          complex: { multiplierMax: 1.35 },
          high_complex: { multiplierMax: 1.5 },
        },
      },
      caps: {
        multiplierMin: 1.03,
        multiplierMax: 1.35,
        multiplierStep: 0.018,
        maxExtraDays: 21,
        maxMaterialExtraDays: 3,
        maxConfidencePenalty: 25,
      },
      effectPolicy: {
        coldStartPolicy: 'observation_only',
        actionPolicy: 'candidate_only',
        canAffectNewTaskReference: true,
        canAffectRemainingForecast: true,
        canExplainDeviation: true,
        canCreateRiskIssue: false,
      },
      __stableCode: 'default_site_capacity_pressure_policy',
      __resolverSource: 'ts_seed_fallback',
    }]
    mocks.state.standardDurationSeed = null
    mocks.state.weakStandardWorkMatches = []
    mocks.state.resolvedResource = null
    vi.clearAllMocks()
    mocks.resolveAlgorithmSeedRecords.mockImplementation(async () => mocks.state.resourceRecords)
    mocks.resolveStandardWorkDurationSeed.mockImplementation(async () => mocks.state.standardDurationSeed)
    mocks.inferTitleWeakStandardWorkMatchesFromResolver.mockImplementation(async () => mocks.state.weakStandardWorkMatches)
    mocks.resolveV1474HolidayWindow.mockResolvedValue(null)
    mocks.resolveV1474ProcessConstraint.mockResolvedValue(null)
    mocks.resolveV1474ProcessSeasonalSensitivity.mockResolvedValue(null)
    mocks.resolveV1474ResourceClass.mockImplementation(async () => mocks.state.resolvedResource)
    mocks.resolveV1474SeasonalProductivity.mockResolvedValue(null)
    mocks.resolveV1474WorkflowDictionary.mockResolvedValue(null)
    mocks.resolveV1474BuildingPatternMatch.mockResolvedValue({
      patternCode: null,
      record: null,
      matchScore: 0,
      confidenceScore: 0,
      confidenceLevel: 'low',
      matchedSignals: [],
      missingSignals: [],
      actionPolicy: 'confidence_only',
    })
    mocks.resolveV1474BuildingPatternMatches.mockImplementation(async (...args: any[]) => {
      const match = await mocks.resolveV1474BuildingPatternMatch(...args)
      return match?.record ? [match] : []
    })
    mocks.hasV1474WorkCalendarForYear.mockResolvedValue(true)
    mocks.resolveProjectClimateRegion.mockResolvedValue({})
    mocks.loadProjectWeatherImpactSignals.mockResolvedValue([])
    mocks.loadProjectWeatherImpactSignalsWithDiagnostics.mockResolvedValue({ signals: [], sourceStatus: 'ok' })
    mocks.loadProjectWeatherImpactSignalsWithDiagnostics.mockResolvedValue({ signals: [], sourceStatus: 'not_configured_or_no_forecast' })
    mocks.getProjectCompanyId.mockResolvedValue(null)
    mocks.loadAlgorithmAssetLearnableParameterRuntimeValue.mockResolvedValue({
      status: 'runtime_parameter_not_found',
      runtimeConsumable: false,
      parameterKey: 'duration.context.weather_multiplier',
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
    mocks.detectProgressAnomalySignals.mockReturnValue([])
    mocks.loadPublishedProgressVelocityRuntime.mockResolvedValue(null)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('does not select the retired task_obstacles expected_resolution_date column from Supabase', async () => {
    mocks.state.tasks = [{
      id: 'task-schema-safe',
      project_id: 'project-1',
      title: 'schema safe obstacle task',
      planned_start_date: '2026-05-01',
      planned_end_date: '2026-05-10',
      progress: 20,
      status: 'in_progress',
    }]
    mocks.state.obstacles = [{
      id: 'obstacle-schema-safe',
      project_id: 'project-1',
      task_id: 'task-schema-safe',
      obstacle_type: 'equipment',
      status: 'open',
      severity: 'critical',
      estimated_resolve_date: '2026-05-05',
      created_at: '2026-05-01T00:00:00.000Z',
    }]

    await buildDurationContext({ taskId: 'task-schema-safe' })

    const obstacleSelects = mocks.from.mock.results
      .map((result: { value?: { select?: { mock?: { calls: unknown[][] } } } }) => result.value)
      .flatMap((builder) => builder?.select?.mock?.calls ?? [])
      .map((call) => String(call[0] ?? ''))
      .filter((selectClause) => selectClause.includes('obstacle_type'))

    expect(obstacleSelects.length).toBeGreaterThan(0)
    for (const selectClause of obstacleSelects) {
      expect(selectClause).toContain('estimated_resolve_date')
      expect(selectClause).not.toContain('expected_resolution_date')
    }
  })

  it('routes process constraint timing to duration seed without adding days', async () => {
    mocks.resolveV1474ProcessConstraint.mockResolvedValue({
      stableCode: 'concrete_curing_normal_minimum',
      constraintType: 'curing_wait',
      applicationMode: 'edge_lag',
      impactMode: 'duration_lookup',
      runtimeActionPolicy: 'confidence_only',
      timeSourcePolicy: 'standard_work_duration_seed_only',
      durationLookupPolicy: 'route_to_standard_work_duration_seed',
      durationLookupKeys: ['concrete_curing_reference'],
      carrierProcessHints: ['concrete curing'],
      durationAuthorityPolicy: 'no_duration_values_in_process_constraint',
      startAfterPercent: 100,
      scopeGranularity: 'zone',
      gateRequired: false,
      relationInputPolicy: 'requires_existing_relation',
      dependencyCreationPolicy: 'never_create_dependency',
      parallelAllowedPolicy: 'parallel_allowed_is_no_edge_not_overlap',
      supportedRelationKinds: ['hard_sequence', 'soft_sequence', 'acceptance_gate', 'dependency_intent', 'explicit_task_dependency'],
      explicitCarrierPolicy: 'skip_duration_add_when_explicit_carrier_process_exists',
      durationDoubleCountPolicy: 'standard_work_duration_owns_all_day_values_process_constraint_owns_edge_routing',
      relationshipScope: 'same_parent_or_cross_scope_edge',
      confidence: 'high',
      __resolverSource: 'ts_seed_fallback',
    })

    const pouringContext = await buildDurationContext({
      projectId: 'project-1',
      taskTitle: 'concrete pouring',
      standardWorkName: 'concrete pouring',
    })
    const pouringFactor = pouringContext.factors.find((factor) => factor.key === 'process_constraint')

    expect(pouringFactor).toEqual(expect.objectContaining({
      actionPolicy: 'confidence_only',
      extraDays: 0,
    }))
    expect(pouringFactor?.metadata).toMatchObject({
      explicitCarrierDetected: false,
      timeSourcePolicy: 'standard_work_duration_seed_only',
      durationLookupPolicy: 'route_to_standard_work_duration_seed',
      durationLookupKeys: ['concrete_curing_reference'],
      durationAuthorityPolicy: 'no_duration_values_in_process_constraint',
      relationshipScope: 'same_parent_or_cross_scope_edge',
      relationInputPolicy: 'requires_existing_relation',
      dependencyCreationPolicy: 'never_create_dependency',
      parallelAllowedPolicy: 'parallel_allowed_is_no_edge_not_overlap',
      startAfterPercent: 100,
      scopeGranularity: 'zone',
    })
    expect(pouringContext.extraDays).toBe(0)

    const carrierContext = await buildDurationContext({
      projectId: 'project-1',
      taskTitle: 'concrete curing',
      standardWorkName: 'concrete curing',
    })
    const carrierFactor = carrierContext.factors.find((factor) => factor.key === 'process_constraint')

    expect(carrierFactor).toEqual(expect.objectContaining({
      actionPolicy: 'confidence_only',
      extraDays: 0,
    }))
    expect(carrierFactor?.metadata).toMatchObject({
      explicitCarrierDetected: true,
      durationDoubleCountPolicy: 'standard_work_duration_owns_all_day_values_process_constraint_owns_edge_routing',
    })
    expect(carrierContext.extraDays).toBe(0)
  })

  it('uses real task quantity before standard duration quantity proxy for overlap release gates', async () => {
    mocks.resolveV1474ProcessConstraint.mockResolvedValue({
      stableCode: 'electrical_tray_to_cable_laying_zone_overlap',
      constraintType: 'overlap_allowed',
      applicationMode: 'edge_overlap',
      impactMode: 'overlap_ratio',
      runtimeActionPolicy: 'candidate_only',
      timeSourcePolicy: 'standard_work_duration_seed_only',
      durationLookupPolicy: 'route_to_standard_work_duration_seed',
      durationLookupKeys: ['cable_tray_installation', 'cable_laying'],
      carrierProcessHints: ['桥架安装', '电缆敷设'],
      durationAuthorityPolicy: 'no_duration_values_in_process_constraint',
      releaseQuantityPolicy: 'real_task_quantity_then_standard_duration_quantity_proxy_then_scope_proxy',
      minReleaseQuantityPercent: 70,
      quantitySourcePriority: ['task_planned_completed_quantity', 'standard_work_duration_default_quantity', 'scope_granularity_proxy'],
      insufficientQuantityPolicy: 'candidate_only_until_real_quantity_or_scope_release',
      quantityDoubleCountPolicy: 'standard_work_duration_owns_default_quantity_process_constraint_owns_release_threshold',
      partialOverlapRatio: 0.55,
      startAfterPercent: 45,
      scopeGranularity: 'zone',
      gateRequired: false,
      relationInputPolicy: 'requires_existing_relation',
      dependencyCreationPolicy: 'never_create_dependency',
      parallelAllowedPolicy: 'parallel_allowed_is_no_edge_not_overlap',
      supportedRelationKinds: ['hard_sequence', 'soft_sequence', 'acceptance_gate', 'dependency_intent', 'explicit_task_dependency'],
      explicitCarrierPolicy: 'skip_duration_add_when_explicit_carrier_process_exists',
      durationDoubleCountPolicy: 'standard_work_duration_owns_all_day_values_process_constraint_owns_edge_routing',
      relationshipScope: 'same_parent_or_cross_scope_edge',
      confidence: 'medium',
      __resolverSource: 'ts_seed_fallback',
    })

    const blockedContext = await buildDurationContext({
      projectId: 'project-1',
      taskTitle: 'cable tray installed before cable laying',
      standardWorkName: '桥架安装',
      plannedQuantity: 100,
      completedQuantity: 10,
      quantityUnit: 'm',
    })
    const blockedFactor = blockedContext.factors.find((factor) => factor.key === 'process_constraint')
    expect(blockedFactor).toEqual(expect.objectContaining({
      actionPolicy: 'confidence_only',
      extraDays: 0,
    }))
    expect(blockedFactor?.metadata?.releaseGate).toMatchObject({
      releaseDecision: 'real_quantity_not_satisfied',
      minReleaseQuantityPercent: 70,
      actualReleasePercent: 10,
    })

    const releasedContext = await buildDurationContext({
      projectId: 'project-1',
      taskTitle: 'cable tray installed before cable laying',
      standardWorkName: '桥架安装',
      plannedQuantity: 100,
      completedQuantity: 80,
      quantityUnit: 'm',
    })
    const releasedFactor = releasedContext.factors.find((factor) => factor.key === 'process_constraint')
    expect(releasedFactor).toEqual(expect.objectContaining({
      actionPolicy: 'candidate_only',
      extraDays: 0,
    }))
    expect(releasedFactor?.metadata?.releaseGate).toMatchObject({
      releaseDecision: 'real_quantity_satisfied',
      actualReleasePercent: 80,
    })

    mocks.state.standardDurationSeed = {
      stableCode: 'process_duration:cable_tray_installation',
      defaultQuantity: 120,
      defaultQuantityUnit: 'm',
      __stableCode: 'process_duration:cable_tray_installation',
      __resolverSource: 'ts_seed_fallback',
    }
    const proxyContext = await buildDurationContext({
      projectId: 'project-1',
      taskTitle: 'cable tray installed before cable laying',
      standardWorkName: '桥架安装',
      quantityUnit: 'm',
    })
    const proxyFactor = proxyContext.factors.find((factor) => factor.key === 'process_constraint')
    expect(proxyFactor?.metadata?.releaseGate).toMatchObject({
      releaseDecision: 'standard_duration_quantity_proxy',
      defaultQuantity: 120,
      proxyReleaseQuantity: 84,
      proxyConfidence: 'low',
    })
  })

  it('applies process constraint conditional effects as runtime gates without adding days', async () => {
    mocks.resolveV1474ProcessConstraint.mockResolvedValue({
      stableCode: 'cleanroom_envelope_to_hvac_commissioning_room_overlap',
      constraintType: 'overlap_allowed',
      applicationMode: 'edge_overlap',
      impactMode: 'overlap_ratio',
      runtimeActionPolicy: 'candidate_only',
      timeSourcePolicy: 'standard_work_duration_seed_only',
      durationLookupPolicy: 'route_to_standard_work_duration_seed',
      durationLookupKeys: ['cleanroom_envelope_sealing', 'clean_hvac_commissioning'],
      carrierProcessHints: ['洁净围护密封', '净化空调调试'],
      durationAuthorityPolicy: 'no_duration_values_in_process_constraint',
      releaseQuantityPolicy: 'real_task_quantity_then_standard_duration_quantity_proxy_then_scope_proxy',
      minReleaseQuantityPercent: 90,
      quantitySourcePriority: ['task_planned_completed_quantity', 'standard_work_duration_default_quantity', 'scope_granularity_proxy'],
      quantityEvidenceRequirement: 'real_or_default_quantity_proxy_allowed',
      quantityProxyRiskLevel: 'medium',
      insufficientQuantityPolicy: 'candidate_only_until_real_quantity_or_scope_release',
      quantityDoubleCountPolicy: 'standard_work_duration_owns_default_quantity_process_constraint_owns_release_threshold',
      partialOverlapRatio: 0.2,
      startAfterPercent: 80,
      scopeGranularity: 'room',
      gateRequired: false,
      relationInputPolicy: 'requires_existing_relation',
      dependencyCreationPolicy: 'never_create_dependency',
      parallelAllowedPolicy: 'parallel_allowed_is_no_edge_not_overlap',
      supportedRelationKinds: ['hard_sequence', 'soft_sequence', 'acceptance_gate', 'dependency_intent', 'explicit_task_dependency'],
      explicitCarrierPolicy: 'skip_duration_add_when_explicit_carrier_process_exists',
      durationDoubleCountPolicy: 'standard_work_duration_owns_all_day_values_process_constraint_owns_edge_routing',
      relationshipScope: 'same_parent_or_cross_scope_edge',
      conditionalEffects: [{
        id: 'cleanroom-high-grade-project-fact-gate',
        when: [{ field: 'space_cleanliness_grade', operator: 'includes_any', values: ['iso5', 'iso6'] }],
        effect: 'require_project_fact_gate',
        quantityEvidenceRequirement: 'real_quantity_required_for_auto_release',
        quantityProxyRiskLevel: 'high',
        curationBasis: 'high-grade cleanroom needs project fact gate',
        businessReasonTemplate: '高等级洁净区域需确认围护闭合和压差边界后再作为净化空调调试穿插候选。',
      }],
      confidence: 'medium',
      __resolverSource: 'ts_seed_fallback',
    })
    mocks.state.standardDurationSeed = {
      stableCode: 'process_duration:cleanroom_envelope_sealing',
      defaultQuantity: 40,
      defaultQuantityUnit: 'room',
      __stableCode: 'process_duration:cleanroom_envelope_sealing',
      __resolverSource: 'ts_seed_fallback',
    }

    const context = await buildDurationContext({
      projectId: 'project-1',
      taskTitle: 'cleanroom envelope before hvac commissioning',
      standardWorkName: '洁净围护密封',
      plannedStartDate: '2026-05-22',
      standardTaskMetadata: {
        spaceCleanlinessGrade: 'iso5',
      },
    })
    const factor = context.factors.find((item) => item.key === 'process_constraint')

    expect(factor).toEqual(expect.objectContaining({
      actionPolicy: 'confidence_only',
      extraDays: 0,
    }))
    expect(context.extraDays).toBe(0)
    expect(factor?.metadata).toMatchObject({
      stableCode: 'cleanroom_envelope_to_hvac_commissioning_room_overlap',
      gateRequired: true,
      timeSourcePolicy: 'project_fact_then_standard_work_duration',
      quantityEvidenceRequirement: 'real_quantity_required_for_auto_release',
      quantityProxyRiskLevel: 'high',
      conditionalEffectCount: 1,
      releaseGate: {
        releaseDecision: 'real_quantity_required_missing',
        releaseActionPolicy: 'confidence_only',
        quantityEvidenceRequirement: 'real_quantity_required_for_auto_release',
      },
      conditionContext: {
        spaceCleanlinessGrade: ['iso5'],
      },
    })
    expect(factor?.metadata?.conditionalEffectsApplied).toEqual([
      expect.objectContaining({
        id: 'cleanroom-high-grade-project-fact-gate',
        effect: 'require_project_fact_gate',
        adjustments: expect.arrayContaining([
          'gateRequired=true',
          'timeSourcePolicy=project_fact_then_standard_work_duration',
          'quantityEvidenceRequirement=real_quantity_required_for_auto_release',
          'quantityProxyRiskLevel=high',
        ]),
      }),
    ])
  })

  it('applies element variant process constraint effects as tighter overlap gates without adding days', async () => {
    mocks.resolveV1474ProcessConstraint.mockResolvedValue({
      stableCode: 'electrical_tray_to_cable_laying_zone_overlap',
      constraintType: 'overlap_allowed',
      applicationMode: 'edge_overlap',
      impactMode: 'overlap_ratio',
      runtimeActionPolicy: 'candidate_only',
      timeSourcePolicy: 'standard_work_duration_seed_only',
      durationLookupPolicy: 'route_to_standard_work_duration_seed',
      durationLookupKeys: ['cable_tray_installation', 'cable_laying'],
      carrierProcessHints: ['cable tray installation', 'cable laying'],
      durationAuthorityPolicy: 'no_duration_values_in_process_constraint',
      releaseQuantityPolicy: 'real_task_quantity_then_standard_duration_quantity_proxy_then_scope_proxy',
      minReleaseQuantityPercent: 70,
      quantitySourcePriority: ['task_planned_completed_quantity', 'standard_work_duration_default_quantity', 'scope_granularity_proxy'],
      quantityEvidenceRequirement: 'real_or_default_quantity_proxy_allowed',
      quantityProxyRiskLevel: 'medium',
      insufficientQuantityPolicy: 'candidate_only_until_real_quantity_or_scope_release',
      quantityDoubleCountPolicy: 'standard_work_duration_owns_default_quantity_process_constraint_owns_release_threshold',
      partialOverlapRatio: 0.55,
      startAfterPercent: 45,
      scopeGranularity: 'zone',
      gateRequired: false,
      relationInputPolicy: 'requires_existing_relation',
      dependencyCreationPolicy: 'never_create_dependency',
      parallelAllowedPolicy: 'parallel_allowed_is_no_edge_not_overlap',
      supportedRelationKinds: ['hard_sequence', 'soft_sequence', 'acceptance_gate', 'dependency_intent', 'explicit_task_dependency'],
      explicitCarrierPolicy: 'skip_duration_add_when_explicit_carrier_process_exists',
      durationDoubleCountPolicy: 'standard_work_duration_owns_all_day_values_process_constraint_owns_edge_routing',
      relationshipScope: 'same_parent_or_cross_scope_edge',
      conditionalEffects: [{
        id: 'cable-tray-data-center-tighten-release',
        when: [{ field: 'element_variant_code', operator: 'includes_any', values: ['data_center'] }],
        effect: 'tighten_overlap_release',
        minReleaseQuantityPercentDelta: 10,
        partialOverlapRatioMultiplier: 0.75,
        quantityEvidenceRequirement: 'real_quantity_required_for_auto_release',
        quantityProxyRiskLevel: 'high',
        curationBasis: 'data center cable work needs stricter release evidence',
        businessReasonTemplate: 'Data center tray-to-cable overlap needs real quantity evidence before auto release.',
      }],
      confidence: 'medium',
      __resolverSource: 'ts_seed_fallback',
    })

    const context = await buildDurationContext({
      projectId: 'project-1',
      taskTitle: 'cable tray before cable laying',
      standardWorkName: 'cable tray installation',
      plannedStartDate: '2026-05-22',
      plannedQuantity: 100,
      completedQuantity: 65,
      quantityUnit: 'm',
      standardTaskMetadata: {
        elementVariantCode: 'data_center',
      },
    })
    const factor = context.factors.find((item) => item.key === 'process_constraint')

    expect(factor).toEqual(expect.objectContaining({
      actionPolicy: 'confidence_only',
      extraDays: 0,
      confidenceDelta: -2,
    }))
    expect(context.extraDays).toBe(0)
    expect(factor?.metadata).toMatchObject({
      stableCode: 'electrical_tray_to_cable_laying_zone_overlap',
      quantityEvidenceRequirement: 'real_quantity_required_for_auto_release',
      quantityProxyRiskLevel: 'high',
      minReleaseQuantityPercent: 80,
      startAfterPercent: 59,
      conditionalEffectCount: 1,
      releaseGate: {
        releaseDecision: 'real_quantity_not_satisfied',
        releaseActionPolicy: 'confidence_only',
        minReleaseQuantityPercent: 80,
        actualReleasePercent: 65,
        plannedQuantity: 100,
        completedQuantity: 65,
        quantityUnit: 'm',
      },
      conditionContext: {
        elementVariantCode: ['data_center'],
      },
    })
    expect(factor?.metadata?.partialOverlapRatio).toBeCloseTo(0.4125)
    expect(factor?.metadata?.conditionalEffectsApplied).toEqual([
      expect.objectContaining({
        id: 'cable-tray-data-center-tighten-release',
        effect: 'tighten_overlap_release',
        adjustments: expect.arrayContaining([
          'startAfterPercent=59',
          'minReleaseQuantityPercent=80',
          'quantityEvidenceRequirement=real_quantity_required_for_auto_release',
          'quantityProxyRiskLevel=high',
        ]),
      }),
    ])
  })

  it('applies Yangtze Delta rainy-season macro factor and roof waterproofing process sensitivity through climate profile', async () => {
    mocks.resolveProjectClimateRegion.mockResolvedValue({
      regionCode: 'hot_summer_cold_winter',
      thermalZone: 'hot_summer_cold_winter',
      climateTags: ['plum_rain', 'hot_humid_summer'],
      location: 'Shanghai Pudong',
      source: 'city_consensus',
      confidence: 'high',
      reason: 'matched Shanghai city climate rule',
      rainySeasonMonths: [5, 6, 7],
      floodSeasonMonths: [6, 7, 8, 9],
      highTempMonths: [7, 8],
      coldWeatherMonths: [12, 1, 2],
      typhoonRiskLevel: 'medium',
      winterShutdownRiskLevel: 'low',
      softSoilLevel: 2,
      mountainTerrain: false,
      terrainDifficultyLevel: 0,
      seismicIntensity: 7,
    })
    mocks.resolveV1474SeasonalProductivity.mockResolvedValue({
      productivity: 0.94,
      climateSignal: 'rainy_season',
      confidence: 'medium',
      __resolverSource: 'ts_seed_fallback',
    })
    mocks.resolveV1474ProcessSeasonalSensitivity.mockImplementation(async (...args: any[]) => {
      const [, month, context] = args as [string, number, Row]
      if (
        month === 6
        && context.monthlyClimateSignal === 'rainy_season'
        && Array.isArray(context.standardWorkCodes)
        && context.standardWorkCodes.includes('roof_membrane_waterproof')
      ) {
        return {
          stableCode: 'roof_membrane_waterproof_rain_window',
          productivityMultiplier: 0.88,
          sensitivityReason: 'rainy_season',
          impactBand: 'rain_blocks_work',
          confidence: 'medium',
          __resolverSource: 'ts_seed_fallback',
        }
      }
      return null
    })

    const context = await buildDurationContext({
      projectId: 'project-shanghai',
      taskTitle: '屋面卷材防水施工',
      standardWorkCode: 'roof_membrane_waterproof',
      standardWorkName: '屋面卷材防水',
      plannedStartDate: '2026-06-12',
      plannedEndDate: '2026-06-20',
    })

    const seasonalFactor = context.factors.find((factor) => factor.key === 'seasonal_productivity')
    const processFactor = context.factors.find((factor) => factor.key === 'process_seasonal_sensitivity')

    expect(mocks.resolveV1474SeasonalProductivity).toHaveBeenCalledWith(
      'hot_summer_cold_winter_yangtze_delta',
      6,
      expect.objectContaining({ projectId: 'project-shanghai' }),
    )
    expect(seasonalFactor).toEqual(expect.objectContaining({
      actionPolicy: 'auto_apply',
      multiplier: expect.closeTo(1 / 0.94, 3),
    }))
    expect(seasonalFactor?.metadata).toEqual(expect.objectContaining({
      seasonalProductivityRegion: 'hot_summer_cold_winter_yangtze_delta',
      climateRegionSource: 'city_consensus',
    }))
    expect(processFactor).toEqual(expect.objectContaining({
      actionPolicy: 'auto_apply',
      multiplier: expect.closeTo(1 / 0.88, 3),
    }))
    expect(processFactor?.metadata).toEqual(expect.objectContaining({
      stableCode: 'roof_membrane_waterproof_rain_window',
      seasonalProductivityRegion: 'hot_summer_cold_winter_yangtze_delta',
      monthlyClimateSignal: 'rainy_season',
      standardWorkSource: 'explicit',
      standardWorkCode: 'roof_membrane_waterproof',
      typhoonRiskLevel: 'medium',
      floodSeasonMonths: [6, 7, 8, 9],
      softSoilLevel: 2,
      seismicIntensity: 7,
      climateCouplingSignals: expect.objectContaining({
        monthlyClimateSignal: 'rainy_season',
        processSensitivityReason: 'rainy_season',
        typhoonRiskLevel: 'medium',
        softSoilLevel: 2,
      }),
    }))
    expect(context.multiplier).toBeGreaterThan(1.1)
    expect(context.calculationContext.climate_applied_factor_count).toBe(1)
    expect(context.calculationContext.pm_recovery_applied).toBe(false)
    expect(context.factors.find((factor) => factor.key === 'pm_recovery_compensation')).toBeUndefined()
  })

  it('does not reduce duration when project climate falls back to low-confidence default', async () => {
    mocks.resolveProjectClimateRegion.mockResolvedValue({
      regionCode: 'default',
      thermalZone: 'default',
      climateTags: [],
      location: null,
      source: 'default_fallback',
      confidence: 'low',
      reason: 'project location is missing',
    })
    mocks.resolveV1474SeasonalProductivity.mockResolvedValue({
      productivity: 1,
      climateSignal: 'normal',
      confidence: 'medium',
      __resolverSource: 'ts_seed_fallback',
    })

    const context = await buildDurationContext({
      projectId: 'project-no-location',
      taskTitle: '室内隔墙施工',
      standardWorkCode: 'indoor_partition',
      plannedStartDate: '2026-05-12',
      plannedEndDate: '2026-05-20',
    })

    const seasonalFactor = context.factors.find((factor) => factor.key === 'seasonal_productivity')

    expect(seasonalFactor).toEqual(expect.objectContaining({
      label: '地区气候画像置信度不足',
      actionPolicy: 'confidence_only',
      multiplier: 1,
      confidenceDelta: -5,
    }))
    expect(seasonalFactor?.metadata).toEqual(expect.objectContaining({
      seasonalProductivityRegion: 'default',
      climateRegionSource: 'default_fallback',
    }))
    expect(context.multiplier).toBe(1)
    expect(context.hasLowConfidenceSignal).toBe(true)
  })

  it('keeps South China summer heat as macro productivity instead of a static process sensitivity rule', async () => {
    mocks.resolveProjectClimateRegion.mockResolvedValue({
      regionCode: 'hot_summer_warm_winter',
      thermalZone: 'hot_summer_warm_winter',
      climateTags: ['hot_humid_summer', 'long_rainy_season'],
      location: 'Guangzhou',
      source: 'city_consensus',
      confidence: 'high',
      reason: 'matched Guangzhou city climate rule',
      rainySeasonMonths: [4, 5, 6, 7, 8],
      highTempMonths: [6, 7, 8, 9],
      coldWeatherMonths: [],
    })
    mocks.resolveV1474SeasonalProductivity.mockResolvedValue({
      productivity: 0.95,
      climateSignal: 'summer_heat',
      confidence: 'medium',
      __resolverSource: 'ts_seed_fallback',
    })

    const context = await buildDurationContext({
      projectId: 'project-guangzhou',
      taskTitle: '室内腻子施工',
      standardWorkCode: 'interior_putty',
      plannedStartDate: '2026-07-15',
      plannedEndDate: '2026-07-25',
    })

    const seasonalFactor = context.factors.find((factor) => factor.key === 'seasonal_productivity')
    const processFactor = context.factors.find((factor) => factor.key === 'process_seasonal_sensitivity')

    expect(mocks.resolveV1474SeasonalProductivity).toHaveBeenCalledWith(
      'hot_summer_warm_winter_south_coast',
      7,
      expect.objectContaining({ projectId: 'project-guangzhou' }),
    )
    expect(mocks.resolveV1474ProcessSeasonalSensitivity).toHaveBeenCalledWith(
      expect.any(String),
      7,
      expect.objectContaining({
        monthlyClimateSignal: 'summer_heat',
        highTempMonths: [6, 7, 8, 9],
      }),
    )
    expect(seasonalFactor).toEqual(expect.objectContaining({
      actionPolicy: 'auto_apply',
      multiplier: expect.closeTo(1 / 0.95, 3),
    }))
    expect(seasonalFactor?.metadata).toEqual(expect.objectContaining({
      seasonalProductivityRegion: 'hot_summer_warm_winter_south_coast',
    }))
    expect(processFactor).toBeUndefined()
    expect(context.multiplier).toBeCloseTo(1 / 0.95, 3)
  })

  it('keeps heavy rain forecast as candidate-only weather impact until plan revision is confirmed', async () => {
    const signals = [{
      impactType: 'heavy_rain',
      climateSignal: 'rainy_season',
      severity: 'medium',
      actionPolicy: 'candidate_only',
      multiplier: 1.08,
      confidenceDelta: -12,
      reason: 'Heavy rain is forecast in the upcoming work window.',
      evidence: {
        provider: 'cma_public_weather',
        weatherSourceReliability: 'mainland_public_weather',
        weatherSourceReliabilityScore: 0.86,
      },
    }]
    mocks.loadProjectWeatherImpactSignals.mockResolvedValue(signals)
    mocks.loadProjectWeatherImpactSignalsWithDiagnostics.mockResolvedValue({ signals, sourceStatus: 'ok' })
    mocks.resolveV1474ProcessSeasonalSensitivity.mockResolvedValue({
      stableCode: 'exterior_coating_plaster_rain_window',
      productivityMultiplier: 0.88,
      sensitivityReason: 'rainy_season',
      impactBand: 'rain_blocks_work',
      weatherWindowRecoveryPolicy: {
        dryWindowRequiredHours: 48,
        maxRelativeHumidityPercent: 80,
        appliesToImpactBands: ['rain_blocks_work'],
        actionPolicy: 'candidate_gate',
      },
      confidence: 'medium',
      __resolverSource: 'ts_seed_fallback',
    })

    const context = await buildDurationContext({
      projectId: 'project-rain',
      taskTitle: '外墙涂料施工',
      standardWorkCode: 'exterior_coating',
      plannedStartDate: '2026-06-18',
      plannedEndDate: '2026-06-22',
    })

    const weatherFactor = context.factors.find((factor) => factor.key === 'weather_forecast_impact')

    expect(weatherFactor).toEqual(expect.objectContaining({
      actionPolicy: 'candidate_only',
      multiplier: expect.closeTo(1.02, 3),
      confidenceDelta: -12,
      source: 'weather_fact',
    }))
    expect(weatherFactor?.metadata).toEqual(expect.objectContaining({
      impactType: 'heavy_rain',
      processSensitive: true,
      processSeasonalStableCode: 'exterior_coating_plaster_rain_window',
      weatherWindowRecoveryPolicy: expect.objectContaining({
        dryWindowRequiredHours: 48,
        maxRelativeHumidityPercent: 80,
      }),
      actionBoundary: 'candidate_only_until_user_confirmed_plan_revision',
      weatherStaticCoupling: expect.objectContaining({
        climateSignalCoupled: true,
        overlapPolicy: 'medium_weather_fact_dampened_because_static_season_already_counted',
      }),
      weatherSourceStatus: 'ok',
    }))
    expect(weatherFactor?.metadata?.evidence).toEqual(expect.objectContaining({
      provider: 'cma_public_weather',
      weatherSourceReliability: 'mainland_public_weather',
    }))
  })

  it('applies canary weather multiplier publications only through the explicit weather runtime boundary', async () => {
    const signals = [{
      impactType: 'heavy_rain',
      climateSignal: 'rainy_season',
      severity: 'medium',
      actionPolicy: 'candidate_only',
      multiplier: 1.08,
      confidenceDelta: -10,
      reason: 'Heavy rain is forecast in the upcoming work window.',
      evidence: {
        provider: 'cma_public_weather',
      },
    }]
    mocks.getProjectCompanyId.mockResolvedValue('10000000-0000-4000-8000-000000000001')
    mocks.loadProjectWeatherImpactSignalsWithDiagnostics.mockResolvedValue({ signals, sourceStatus: 'ok' })
    mocks.loadAlgorithmAssetLearnableParameterRuntimeValue.mockResolvedValue({
      status: 'runtime_parameter_consumable',
      runtimeConsumable: true,
      parameterKey: 'duration.context.weather_multiplier',
      runtimeValue: 1.12,
      consumptionMode: 'canary',
      publicationKey: 'learnable-parameter-runtime:weather-multiplier:company_canary',
      publicationStatus: 'canary',
      scopeLevel: 'company',
      companyId: '10000000-0000-4000-8000-000000000001',
      projectId: null,
      rollbackTarget: 'duration.context.weather_multiplier.default',
      reasons: [],
      writesSeedRuntimeDirectly: false,
    })

    const context = await buildDurationContext({
      projectId: 'project-rain-canary',
      taskTitle: '屋面防水施工',
      standardWorkCode: 'roof_waterproof',
      plannedStartDate: '2026-06-18',
      plannedEndDate: '2026-06-22',
    })

    const weatherFactor = context.factors.find((factor) => factor.key === 'weather_forecast_impact')

    expect(mocks.loadAlgorithmAssetLearnableParameterRuntimeValue).toHaveBeenCalledWith({
      parameterKey: 'duration.context.weather_multiplier',
      companyId: '10000000-0000-4000-8000-000000000001',
      projectId: 'project-rain-canary',
      consumptionMode: 'canary',
      canaryRuntimeBoundary: {
        consumerKey: 'durationContextService.weather_forecast_impact',
        scopeBoundary: 'company',
        stopConditionKeys: [
          'weather_context_overcompensation_rate',
          'weather_context_mae_regression',
        ],
        monitoringWindowHours: 72,
      },
    })
    expect(weatherFactor).toEqual(expect.objectContaining({
      actionPolicy: 'candidate_only',
      multiplier: expect.closeTo(1.12, 3),
      confidenceDelta: -10,
    }))
    expect(weatherFactor?.dataDependencies).toEqual(expect.arrayContaining([
      'algorithm_learnable_parameter_runtime_publications',
    ]))
    expect(weatherFactor?.metadata).toEqual(expect.objectContaining({
      learnableParameterRuntime: expect.objectContaining({
        parameterKey: 'duration.context.weather_multiplier',
        consumptionMode: 'canary',
        publicationStatus: 'canary',
        publicationKey: 'learnable-parameter-runtime:weather-multiplier:company_canary',
        originalWeatherMultiplier: 1.08,
        runtimeMultiplier: 1.12,
        appliedTo: 'new_weather_forecast_impact_factor_only',
      }),
      actionBoundary: 'candidate_only_until_user_confirmed_plan_revision',
    }))
  })

  it('records weather-source load failures as a confidence-only user tip instead of silently ignoring forecast gaps', async () => {
    mocks.loadProjectWeatherImpactSignals.mockResolvedValue([])
    mocks.loadProjectWeatherImpactSignalsWithDiagnostics.mockResolvedValue({
      signals: [],
      sourceStatus: 'load_failed',
      confidenceReason: 'weather_forecast_load_failed',
    })

    const context = await buildDurationContext({
      projectId: 'project-no-weather',
      taskTitle: 'roof waterproof',
      standardWorkCode: 'roof_membrane_waterproof',
      plannedStartDate: '2026-06-18',
      plannedEndDate: '2026-06-22',
    })

    const weatherFactor = context.factors.find((factor) => factor.key === 'weather_forecast_impact')
    expect(weatherFactor).toEqual(expect.objectContaining({
      actionPolicy: 'confidence_only',
      multiplier: 1,
      confidenceDelta: -3,
    }))
    expect(weatherFactor?.metadata).toEqual(expect.objectContaining({
      weatherSourceStatus: 'load_failed',
      weatherSourceConfidenceReason: 'weather_forecast_load_failed',
      userTip: expect.stringContaining('project_weather_forecasts'),
    }))
    expect(context.hasLowConfidenceSignal).toBe(true)
  })

  it('uses site shutdown weather events as explicit extra days without process multiplier stacking', async () => {
    const signals = [{
      impactType: 'site_shutdown_event',
      climateSignal: 'wind_warning',
      severity: 'high',
      actionPolicy: 'candidate_only',
      multiplier: 1,
      confidenceDelta: -15,
      reason: 'Red typhoon and rainstorm require site shutdown.',
      siteShutdownEvent: {
        eventType: 'compound_red_weather',
        eventDate: '2026-08-18',
        shutdownDays: 1,
        status: 'candidate',
      },
      evidence: { provider: 'cma_public_weather', shutdownModel: 'site_shutdown_event' },
    }]
    mocks.loadProjectWeatherImpactSignals.mockResolvedValue(signals)
    mocks.loadProjectWeatherImpactSignalsWithDiagnostics.mockResolvedValue({ signals, sourceStatus: 'ok' })

    const context = await buildDurationContext({
      projectId: 'project-shutdown',
      taskTitle: 'tower crane lifting',
      standardWorkCode: 'tower_crane_lifting',
      plannedStartDate: '2026-08-18',
      plannedEndDate: '2026-08-18',
    })

    const weatherFactor = context.factors.find((factor) => factor.key === 'weather_forecast_impact')
    expect(weatherFactor).toEqual(expect.objectContaining({
      actionPolicy: 'candidate_only',
      multiplier: 1,
      extraDays: 1,
      confidenceDelta: -15,
    }))
    expect(weatherFactor?.dataDependencies).toEqual(expect.arrayContaining(['site_shutdown_events']))
    expect(weatherFactor?.metadata).toEqual(expect.objectContaining({
      impactType: 'site_shutdown_event',
      siteShutdownEvent: expect.objectContaining({
        eventType: 'compound_red_weather',
        shutdownDays: 1,
      }),
    }))
    const processSeasonalCalls = mocks.resolveV1474ProcessSeasonalSensitivity.mock.calls as any[][]
    const weatherDrivenProcessCalls = processSeasonalCalls.filter((call) => (
      call[2]?.monthlyClimateSignal === 'wind_warning'
        || call[2]?.monthlyClimateSignal === 'rainy_season'
    ))
    expect(weatherDrivenProcessCalls).toEqual([])
  })

  it('keeps thunderstorm forecasts as confidence-only safety signals when no process revision multiplier exists', async () => {
    const signals = [{
      impactType: 'thunderstorm',
      climateSignal: 'thunderstorm',
      severity: 'medium',
      actionPolicy: 'confidence_only',
      multiplier: 1,
      confidenceDelta: -5,
      reason: 'Thunderstorm safety signal.',
      evidence: { provider: 'cma_public_weather' },
    }]
    mocks.loadProjectWeatherImpactSignals.mockResolvedValue(signals)
    mocks.loadProjectWeatherImpactSignalsWithDiagnostics.mockResolvedValue({ signals, sourceStatus: 'ok' })
    mocks.resolveV1474ProcessSeasonalSensitivity.mockResolvedValue({
      stableCode: 'high_place_lifting_thunderstorm_safety',
      productivityMultiplier: 1,
      sensitivityReason: 'thunderstorm',
      impactBand: 'thunderstorm_safety',
      confidence: 'low',
      __resolverSource: 'ts_seed_fallback',
    })

    const context = await buildDurationContext({
      projectId: 'project-thunder',
      taskTitle: 'tower crane lifting',
      standardWorkCode: 'tower_crane_lifting',
      plannedStartDate: '2026-08-18',
      plannedEndDate: '2026-08-18',
    })

    const weatherFactor = context.factors.find((factor) => factor.key === 'weather_forecast_impact')
    expect(weatherFactor).toEqual(expect.objectContaining({
      actionPolicy: 'confidence_only',
      multiplier: 1,
      confidenceDelta: -5,
    }))
    expect(weatherFactor?.metadata).toEqual(expect.objectContaining({
      impactType: 'thunderstorm',
      processSeasonalStableCode: 'high_place_lifting_thunderstorm_safety',
      weatherStaticCoupling: expect.objectContaining({ climateSignalCoupled: true }),
    }))
  })

  it('caps combined climate multipliers so season, process and severe weather cannot over-penalize productivity', async () => {
    mocks.resolveProjectClimateRegion.mockResolvedValue({
      regionCode: 'hot_summer_cold_winter',
      thermalZone: 'hot_summer_cold_winter',
      climateTags: ['plum_rain'],
      location: 'Hangzhou',
      source: 'city_consensus',
      confidence: 'high',
      reason: 'matched Hangzhou city climate rule',
      rainySeasonMonths: [5, 6, 7, 8, 9],
      floodSeasonMonths: [6, 7, 8, 9],
      highTempMonths: [7, 8],
      coldWeatherMonths: [11, 12, 1, 2],
      typhoonRiskLevel: 'medium',
      winterShutdownRiskLevel: 'low',
      softSoilLevel: 2,
      mountainTerrain: false,
      terrainDifficultyLevel: 0,
      seismicIntensity: 7,
    })
    mocks.resolveV1474SeasonalProductivity.mockResolvedValue({
      productivity: 0.7,
      climateSignal: 'rainy_season',
      confidence: 'medium',
      __resolverSource: 'ts_seed_fallback',
    })
    mocks.resolveV1474ProcessSeasonalSensitivity.mockResolvedValue({
      stableCode: 'roof_membrane_waterproof_rain_window',
      productivityMultiplier: 0.72,
      sensitivityReason: 'rainy_season',
      impactBand: 'rain_blocks_work',
      confidence: 'medium',
      __resolverSource: 'ts_seed_fallback',
    })
    const signals = [{
      impactType: 'heavy_rain',
      climateSignal: 'rainy_season',
      severity: 'high',
      actionPolicy: 'candidate_only',
      multiplier: 1.35,
      confidenceDelta: -12,
      reason: 'Severe rain forecast.',
      evidence: { provider: 'cma_public_weather' },
    }]
    mocks.loadProjectWeatherImpactSignals.mockResolvedValue(signals)
    mocks.loadProjectWeatherImpactSignalsWithDiagnostics.mockResolvedValue({ signals, sourceStatus: 'ok' })
    seedMatureRecoverySamples('project-cap')

    const context = await buildDurationContext({
      projectId: 'project-cap',
      taskTitle: 'roof waterproof',
      standardWorkCode: 'roof_membrane_waterproof',
      plannedStartDate: '2026-06-18',
      plannedEndDate: '2026-06-22',
    })

    expect(candidateScenario(context).rawMultiplier).toBeGreaterThan(1)
    expect(candidateScenario(context).rawMultiplier).toBeLessThan(1.82)
    expect(candidateScenario(context).multiplier).toBeGreaterThanOrEqual(candidateScenario(context).rawMultiplier)
    expect(candidateScenario(context).multiplier).toBeLessThan(1.82)
    expect(context.calculationContext.raw_multiplier).toBeGreaterThan(1)
    expect(context.calculationContext).toEqual(expect.objectContaining({
      climate_productivity_floor: undefined,
      climate_productivity_floor_policy: 'none_observe_raw_climate_productivity',
      climate_applied_factor_count: 1,
      climate_cap_applied: false,
      pm_recovery_factor: 0.95,
      pm_recovery_applied: true,
    }))
    const recoveryFactor = context.factors.find((factor) => factor.key === 'pm_recovery_compensation')
    expect(recoveryFactor).toEqual(expect.objectContaining({
      actionPolicy: 'candidate_only',
      multiplier: 0.95,
    }))
    expect(recoveryFactor?.metadata?.recoveryLevers).toEqual(expect.arrayContaining([
      'shift_weather_exposed_work_to_indoor_or_dry_workfaces',
    ]))
  })

  it('allows spring-festival restart productivity to fall below the old floor instead of masking shutdown intensity', async () => {
    mocks.resolveProjectClimateRegion.mockResolvedValue({
      regionCode: 'cold_north',
      thermalZone: 'severe_cold',
      confidence: 'high',
      rainySeasonMonths: [],
      floodSeasonMonths: [],
      highTempMonths: [],
      coldWeatherMonths: [11, 12, 1, 2],
      winterShutdownRiskLevel: 'high',
    })
    mocks.resolveV1474HolidayWindow.mockResolvedValue({
      holidayCode: 'spring_festival_2027_restart_window',
      productivity: 0.4,
      __resolverSource: 'ts_seed_fallback',
    })
    mocks.resolveV1474SeasonalProductivity.mockResolvedValue({
      productivity: 0.45,
      climateSignal: 'winter_low_temp',
      confidence: 'medium',
      __resolverSource: 'ts_seed_fallback',
    })
    mocks.resolveV1474ProcessSeasonalSensitivity.mockResolvedValue({
      stableCode: 'concrete_winter_low_temperature',
      productivityMultiplier: 0.38,
      sensitivityReason: 'winter_low_temp',
      impactBand: 'winter_wet_trade',
      confidence: 'medium',
      __resolverSource: 'ts_seed_fallback',
    })
    const signals = [{
      impactType: 'snow_ice',
      climateSignal: 'snow_ice',
      severity: 'high',
      actionPolicy: 'candidate_only',
      multiplier: 1.35,
      confidenceDelta: -12,
      reason: 'Snow and cold-wave forecast during restart window.',
      evidence: { provider: 'cma_public_weather' },
    }]
    mocks.loadProjectWeatherImpactSignals.mockResolvedValue(signals)
    mocks.loadProjectWeatherImpactSignalsWithDiagnostics.mockResolvedValue({ signals, sourceStatus: 'ok' })

    const context = await buildDurationContext({
      projectId: 'project-spring',
      taskTitle: 'winter concrete works',
      standardWorkCode: 'concrete_casting',
      plannedStartDate: '2027-02-10',
      plannedEndDate: '2027-02-12',
    })

    expect(context.calculationContext.raw_multiplier).toBe(2.5)
    expect(context.multiplier).toBe(2.5)
    expect(candidateScenario(context).multiplier).toBe(2.5)
    expect(context.calculationContext).toEqual(expect.objectContaining({
      climate_productivity_floor: undefined,
      climate_productivity_floor_policy: 'none_observe_raw_climate_productivity',
      climate_cap_applied: true,
    }))
    expect(context.factors.find((factor) => factor.key === 'pm_recovery_compensation')).toBeUndefined()
  })

  it('keeps spring-festival remobilization metadata observable without turning it into a lower-bound cap', async () => {
    mocks.resolveProjectClimateRegion.mockResolvedValue({
      regionCode: 'cold_north',
      thermalZone: 'severe_cold',
      confidence: 'high',
      rainySeasonMonths: [],
      floodSeasonMonths: [],
      highTempMonths: [],
      coldWeatherMonths: [11, 12, 1, 2],
      winterShutdownRiskLevel: 'high',
    })
    mocks.resolveV1474HolidayWindow.mockResolvedValue({
      holidayCode: 'restart_after_holiday_2027',
      calendarKind: 'spring_festival_remobilization',
      productivity: 0.42,
      __resolverSource: 'ts_seed_fallback',
    })
    mocks.resolveV1474SeasonalProductivity.mockResolvedValue({
      productivity: 0.45,
      climateSignal: 'winter_low_temp',
      confidence: 'medium',
      __resolverSource: 'ts_seed_fallback',
    })
    mocks.resolveV1474ProcessSeasonalSensitivity.mockResolvedValue({
      stableCode: 'concrete_winter_low_temperature',
      productivityMultiplier: 0.38,
      sensitivityReason: 'winter_low_temp',
      impactBand: 'winter_wet_trade',
      confidence: 'medium',
      __resolverSource: 'ts_seed_fallback',
    })

    const context = await buildDurationContext({
      projectId: 'project-spring-kind',
      taskTitle: 'winter concrete works',
      standardWorkCode: 'concrete_casting',
      plannedStartDate: '2027-02-22',
      plannedEndDate: '2027-02-24',
    })

    expect(context.calculationContext).toEqual(expect.objectContaining({
      climate_productivity_floor: undefined,
      climate_productivity_floor_policy: 'none_observe_raw_climate_productivity',
      climate_cap_applied: false,
    }))
  })

  it('keeps dust-storm intensity raw and uses candidate recovery for short dust windows', async () => {
    mocks.resolveProjectClimateRegion.mockResolvedValue({
      regionCode: 'northwest_dry',
      thermalZone: 'cold',
      confidence: 'high',
      rainySeasonMonths: [],
      floodSeasonMonths: [],
      highTempMonths: [],
      coldWeatherMonths: [],
      winterShutdownRiskLevel: 'low',
    })
    mocks.resolveV1474SeasonalProductivity.mockResolvedValue({
      productivity: 0.82,
      climateSignal: 'dust_storm',
      confidence: 'medium',
      __resolverSource: 'ts_seed_fallback',
    })
    mocks.resolveV1474ProcessSeasonalSensitivity.mockResolvedValue({
      stableCode: 'earthwork_dust_storm_visibility_control',
      productivityMultiplier: 0.74,
      sensitivityReason: 'dust_storm',
      impactBand: 'dust_storm_partial',
      confidence: 'medium',
      __resolverSource: 'ts_seed_fallback',
    })
    const signals = [{
      impactType: 'dust_storm',
      climateSignal: 'dust_storm',
      severity: 'medium',
      actionPolicy: 'candidate_only',
      multiplier: 1.35,
      confidenceDelta: -10,
      reason: 'Dust storm forecast.',
      evidence: { provider: 'cma_public_weather' },
    }]
    mocks.loadProjectWeatherImpactSignals.mockResolvedValue(signals)
    mocks.loadProjectWeatherImpactSignalsWithDiagnostics.mockResolvedValue({ signals, sourceStatus: 'ok' })
    seedMatureRecoverySamples('project-dust')

    const context = await buildDurationContext({
      projectId: 'project-dust',
      taskTitle: 'earthwork and external road work',
      standardWorkCode: 'earthwork_excavation',
      plannedStartDate: '2026-04-12',
      plannedEndDate: '2026-04-20',
    })

    expect(candidateScenario(context).multiplier).toBeGreaterThan(1)
    expect(candidateScenario(context).multiplier).toBeLessThan(1 / 0.65)
    expect(context.multiplier).toBeGreaterThan(1)
    expect(context.calculationContext).toEqual(expect.objectContaining({
      climate_productivity_floor: undefined,
      climate_productivity_floor_policy: 'none_observe_raw_climate_productivity',
      climate_cap_applied: false,
      pm_recovery_factor: 0.92,
      pm_recovery_applied: true,
    }))
  })

  it('uses long-running resource readiness facts as site capacity pressure without confirmed resource quantities', async () => {
    mocks.state.resourceRecords[0].effectPolicy = {
      ...mocks.state.resourceRecords[0].effectPolicy,
      minSamplesForActiveMode: 0,
    }
    mocks.state.tasks = [{
      id: 'task-1',
      project_id: 'project-1',
      title: '1F wall plastering',
      planned_start_date: '2026-05-01',
      planned_end_date: '2026-05-10',
      progress: 20,
      status: 'in_progress',
    }]
    mocks.state.conditions = [{
      id: 'condition-1',
      project_id: 'project-1',
      task_id: 'task-1',
      condition_type: 'personnel',
      status: 'pending',
      is_satisfied: false,
      target_date: '2026-04-01',
      created_at: '2026-04-01T00:00:00.000Z',
    }, {
      id: 'condition-material-1',
      project_id: 'project-1',
      task_id: 'task-1',
      condition_type: 'project_material',
      source_type: 'project_material',
      source_ref_id: 'material-1',
      status: 'pending',
      is_satisfied: false,
      required_for_start: false,
      blocking_level: 'soft',
    }]
    mocks.state.obstacles = [{
      id: 'obstacle-1',
      project_id: 'project-1',
      task_id: 'task-1',
      obstacle_type: 'equipment',
      status: 'open',
      severity: 'high',
      estimated_resolve_date: '2026-04-03',
      created_at: '2026-04-02T00:00:00.000Z',
    }]
    mocks.state.materials = [{
      id: 'material-1',
      project_id: 'project-1',
      expected_arrival_date: '2026-04-05',
      actual_arrival_date: null,
      record_status: 'active',
      lifecycle_status: 'active',
    }]
    mocks.state.progressSnapshots = [
      { task_id: 'task-1', progress: 18, snapshot_date: '2026-05-10', created_at: '2026-05-10T08:00:00.000Z' },
      { task_id: 'task-1', progress: 20, snapshot_date: '2026-05-20', created_at: '2026-05-20T08:00:00.000Z' },
    ]

    const context = await buildDurationContext({ taskId: 'task-1' })
    const resourceFactor = context.factors.find((factor) => factor.key === 'resource_conflict')

    expect(resourceFactor).toBeTruthy()
    expect(resourceFactor?.actionPolicy).toBe('candidate_only')
    expect(resourceFactor?.extraDays).toBeGreaterThan(0)
    expect(resourceFactor?.multiplier).toBeGreaterThan(1)
    expect(resourceFactor?.reason).toContain('人员/设备/材料')
    expect(resourceFactor?.reason).toContain('不等同于已确认的人材机资源冲突')
    expect(resourceFactor?.metadata).toMatchObject({
      signalType: 'site_capacity_pressure',
      pressureLevel: 'high',
      policyStableCode: 'default_site_capacity_pressure_policy',
      executionProgressIsPrimaryEvidence: true,
      currentTaskProgressPressure: true,
      progressPressureCount: 1,
      progressScore: 5,
      pressureDimensionScores: expect.objectContaining({
        labor: expect.any(Number),
        material: expect.any(Number),
        equipment: expect.any(Number),
        workface: expect.any(Number),
      }),
      dominantPressureDimensions: expect.arrayContaining(['labor']),
      resourceConditionCount: 1,
      resourceObstacleCount: 1,
      overdueMaterialCount: 1,
      severeObstacleCount: 1,
    })
    expect(resourceFactor?.dataDependencies).toEqual(expect.arrayContaining([
      'task_conditions',
      'task_obstacles',
      'project_materials',
    ]))
  })

  it('keeps site capacity pressure observation-only during cold start when policy requires it', async () => {
    mocks.state.tasks = [{
      id: 'task-cold-start',
      project_id: 'project-1',
      title: '1F wall plastering',
      planned_start_date: '2026-05-01',
      planned_end_date: '2026-05-10',
      progress: 20,
      status: 'in_progress',
    }]
    mocks.state.conditions = [{
      id: 'condition-cold-start',
      project_id: 'project-1',
      task_id: 'task-cold-start',
      condition_type: 'personnel',
      status: 'pending',
      is_satisfied: false,
      target_date: '2026-04-01',
      created_at: '2026-04-01T00:00:00.000Z',
    }]
    mocks.state.obstacles = [{
      id: 'obstacle-cold-start',
      project_id: 'project-1',
      task_id: 'task-cold-start',
      obstacle_type: 'equipment',
      status: 'open',
      severity: 'high',
      expected_resolution_date: '2026-04-03',
      created_at: '2026-04-02T00:00:00.000Z',
    }]

    const context = await buildDurationContext({ taskId: 'task-cold-start' })
    const resourceFactor = context.factors.find((factor) => factor.key === 'resource_conflict')

    expect(resourceFactor).toEqual(expect.objectContaining({
      actionPolicy: 'confidence_only',
      multiplier: 1,
      extraDays: 0,
    }))
    expect(resourceFactor?.metadata).toEqual(expect.objectContaining({
      coldStartPolicy: 'observation_only',
      coldStartObservationOnly: true,
      coldStartHistoricalSampleCount: 0,
      coldStartTrendSampleCount: 0,
      coldStartMinSamplesForActiveMode: 30,
    }))
  })

  it('keeps site capacity pressure observation-only until governed cold-start sample threshold is reached', async () => {
    mocks.state.tasks = [
      {
        id: 'task-threshold-current',
        project_id: 'project-1',
        title: 'current plaster work',
        planned_start_date: '2026-05-01',
        planned_end_date: '2026-05-10',
        progress: 20,
        status: 'in_progress',
        participant_unit_id: 'unit-a',
      },
      ...Array.from({ length: 25 }, (_, index) => ({
        id: `task-threshold-sample-${index}`,
        project_id: 'project-1',
        title: `sample work ${index}`,
        planned_start_date: '2026-05-01',
        planned_end_date: '2026-05-10',
        progress: 15,
        status: 'in_progress',
        participant_unit_id: 'unit-a',
      })),
    ]
    mocks.state.conditions = [{
      id: 'condition-threshold',
      project_id: 'project-1',
      task_id: 'task-threshold-current',
      condition_type: 'personnel',
      status: 'pending',
      is_satisfied: false,
      target_date: '2026-04-01',
      created_at: '2026-04-01T00:00:00.000Z',
    }]

    const context = await buildDurationContext({ taskId: 'task-threshold-current' })
    const resourceFactor = context.factors.find((factor) => factor.key === 'resource_conflict')

    expect(resourceFactor).toEqual(expect.objectContaining({
      actionPolicy: 'confidence_only',
      multiplier: 1,
      extraDays: 0,
    }))
    expect(resourceFactor?.metadata).toEqual(expect.objectContaining({
      coldStartObservationOnly: true,
      coldStartMinSamplesForActiveMode: 30,
    }))
    expect(Number(resourceFactor?.metadata?.coldStartTotalSampleCount)).toBeLessThan(30)
  })

  it('uses governed site capacity pressure policy parameters from algorithm seeds', async () => {
    mocks.state.resourceRecords = [{
      stableCode: 'company_site_capacity_pressure_policy',
      isActive: true,
      weights: {
        sameResponsibleUnit: 1,
        sameBuilding: 1,
        sameResourceClass: 1,
        progressPressure: 1,
        resourceCondition: 1,
        resourceObstacle: 8,
        overdueMaterial: 1,
        severeObstacle: 4,
        longTermSignal: 4,
        veryLongTermBonus: 3,
        verticalTransportLimited: 1.2,
        seasonWindowEmphasis: 1.15,
      },
      thresholds: {
        longTermSignalDays: 3,
        veryLongTermSignalDays: 5,
        mediumScore: 4,
        highScore: 8,
        complexityLevel: {
          normal: { multiplierMax: 1.2 },
          complex: { multiplierMax: 1.35 },
          high_complex: { multiplierMax: 1.5 },
        },
      },
      caps: {
        multiplierMin: 1.02,
        multiplierMax: 1.5,
        multiplierStep: 0.03,
        maxExtraDays: 30,
        maxMaterialExtraDays: 1,
        maxConfidencePenalty: 30,
      },
      effectPolicy: {
        coldStartPolicy: 'candidate_only',
        actionPolicy: 'candidate_only',
        canAffectNewTaskReference: true,
        canAffectRemainingForecast: true,
        canExplainDeviation: true,
        canCreateRiskIssue: false,
      },
      __stableCode: 'company_site_capacity_pressure_policy',
      __resolverSource: 'company_override',
    }]
    mocks.state.tasks = [{
      id: 'task-1',
      project_id: 'project-1',
      title: '1F wall plastering',
      planned_start_date: '2026-05-01',
      planned_end_date: '2026-05-10',
      progress: 20,
      status: 'in_progress',
    }]
    mocks.state.obstacles = [{
      id: 'obstacle-1',
      project_id: 'project-1',
      task_id: 'task-1',
      obstacle_type: 'equipment',
      status: 'resolving',
      severity: 'critical',
      expected_resolution_date: '2026-05-01',
      created_at: '2026-05-01T00:00:00.000Z',
    }]
    mocks.state.progressSnapshots = [
      { task_id: 'task-1', progress: 10, snapshot_date: '2026-05-10', created_at: '2026-05-10T08:00:00.000Z' },
      { task_id: 'task-1', progress: 12, snapshot_date: '2026-05-20', created_at: '2026-05-20T08:00:00.000Z' },
    ]

    const context = await buildDurationContext({ taskId: 'task-1' })
    const resourceFactor = context.factors.find((factor) => factor.key === 'resource_conflict')

    expect(resourceFactor?.metadata).toMatchObject({
      policyStableCode: 'company_site_capacity_pressure_policy',
      policyResolverSource: 'company_override',
      pressureLevel: 'high',
      executionProgressIsPrimaryEvidence: true,
      currentTaskProgressPressure: true,
      progressPressureCount: 1,
      resourceObstacleCount: 1,
      severeObstacleCount: 1,
      resourceComplexityLevel: 'normal',
      complexityMultiplierMax: 1.2,
    })
    expect(resourceFactor?.multiplier).toBeGreaterThanOrEqual(1.2)
    expect(resourceFactor?.extraDays).toBeGreaterThan(0)
  })

  it('applies canary site pressure multiplier publications only through the explicit resource conflict runtime boundary', async () => {
    mocks.getProjectCompanyId.mockResolvedValue('10000000-0000-4000-8000-000000000001')
    mocks.loadAlgorithmAssetLearnableParameterRuntimeValue.mockResolvedValue({
      status: 'runtime_parameter_consumable',
      runtimeConsumable: true,
      parameterKey: 'duration.context.site_pressure_multiplier',
      runtimeValue: 1.12,
      consumptionMode: 'canary',
      publicationKey: 'learnable-parameter-runtime:site-pressure-multiplier:company_canary',
      publicationStatus: 'canary',
      scopeLevel: 'company',
      companyId: '10000000-0000-4000-8000-000000000001',
      projectId: null,
      rollbackTarget: 'duration.context.site_pressure_multiplier.default',
      reasons: [],
      writesSeedRuntimeDirectly: false,
    })
    mocks.state.resourceRecords = [{
      stableCode: 'company_site_capacity_pressure_policy',
      isActive: true,
      weights: {
        sameResponsibleUnit: 1,
        sameBuilding: 1,
        sameResourceClass: 1,
        progressPressure: 1,
        resourceCondition: 1,
        resourceObstacle: 8,
        overdueMaterial: 1,
        severeObstacle: 4,
        longTermSignal: 4,
        veryLongTermBonus: 3,
        verticalTransportLimited: 1.2,
        seasonWindowEmphasis: 1.15,
      },
      thresholds: {
        longTermSignalDays: 3,
        veryLongTermSignalDays: 5,
        mediumScore: 4,
        highScore: 8,
        complexityLevel: {
          normal: { multiplierMax: 1.2 },
          complex: { multiplierMax: 1.35 },
          high_complex: { multiplierMax: 1.5 },
        },
      },
      caps: {
        multiplierMin: 1.02,
        multiplierMax: 1.5,
        multiplierStep: 0.03,
        maxExtraDays: 30,
        maxMaterialExtraDays: 1,
        maxConfidencePenalty: 30,
      },
      effectPolicy: {
        coldStartPolicy: 'candidate_only',
        actionPolicy: 'candidate_only',
        canAffectNewTaskReference: true,
        canAffectRemainingForecast: true,
        canExplainDeviation: true,
        canCreateRiskIssue: false,
      },
      __stableCode: 'company_site_capacity_pressure_policy',
      __resolverSource: 'company_override',
    }]
    mocks.state.tasks = [{
      id: 'task-1',
      project_id: 'project-1',
      title: '1F wall plastering',
      planned_start_date: '2026-05-01',
      planned_end_date: '2026-05-10',
      progress: 20,
      status: 'in_progress',
    }]
    mocks.state.obstacles = [{
      id: 'obstacle-1',
      project_id: 'project-1',
      task_id: 'task-1',
      obstacle_type: 'equipment',
      status: 'resolving',
      severity: 'critical',
      expected_resolution_date: '2026-05-01',
      created_at: '2026-05-01T00:00:00.000Z',
    }]
    mocks.state.progressSnapshots = [
      { task_id: 'task-1', progress: 10, snapshot_date: '2026-05-10', created_at: '2026-05-10T08:00:00.000Z' },
      { task_id: 'task-1', progress: 12, snapshot_date: '2026-05-20', created_at: '2026-05-20T08:00:00.000Z' },
    ]

    const context = await buildDurationContext({ taskId: 'task-1' })
    const resourceFactor = context.factors.find((factor) => factor.key === 'resource_conflict')

    expect(mocks.loadAlgorithmAssetLearnableParameterRuntimeValue).toHaveBeenCalledWith({
      parameterKey: 'duration.context.site_pressure_multiplier',
      companyId: '10000000-0000-4000-8000-000000000001',
      projectId: 'project-1',
      consumptionMode: 'canary',
      canaryRuntimeBoundary: {
        consumerKey: 'durationContextService.resource_conflict',
        scopeBoundary: 'company',
        stopConditionKeys: [
          'site_pressure_overcompensation_rate',
          'site_pressure_mae_regression',
        ],
        monitoringWindowHours: 72,
      },
    })
    expect(resourceFactor).toEqual(expect.objectContaining({
      actionPolicy: 'candidate_only',
      multiplier: expect.closeTo(1.12, 3),
    }))
    expect(resourceFactor?.dataDependencies).toEqual(expect.arrayContaining([
      'algorithm_learnable_parameter_runtime_publications',
    ]))
    expect(resourceFactor?.metadata).toEqual(expect.objectContaining({
      learnableParameterRuntime: expect.objectContaining({
        parameterKey: 'duration.context.site_pressure_multiplier',
        consumptionMode: 'canary',
        publicationStatus: 'canary',
        publicationKey: 'learnable-parameter-runtime:site-pressure-multiplier:company_canary',
        originalSitePressureMultiplier: expect.any(Number),
        runtimeMultiplier: 1.12,
        appliedTo: 'new_resource_conflict_factor_only',
        consumerKey: 'durationContextService.resource_conflict',
      }),
    }))
    expect(resourceFactor?.metadata?.learnableParameterRuntime).toEqual(expect.objectContaining({
      rollbackTarget: 'duration.context.site_pressure_multiplier.default',
    }))
  })

  it('captures a real finishing-stage site pressure scenario from existing project facts', async () => {
    mocks.state.resourceRecords = [
      ...mocks.state.resourceRecords,
      {
        stableCode: 'resource_class:interior_finishing',
        isActive: true,
        resourceClass: 'interior_finishing',
        keywords: ['ceiling', 'partition', 'tile', 'putty', 'fitout'],
      },
    ]
    mocks.state.resolvedResource = {
      stableCode: 'resource_class:interior_finishing',
      resourceClass: 'interior_finishing',
    }
    mocks.state.resourceRecords[0].effectPolicy = {
      coldStartPolicy: 'candidate_only',
      actionPolicy: 'candidate_only',
      canAffectNewTaskReference: true,
      canAffectRemainingForecast: true,
      canExplainDeviation: true,
      canCreateRiskIssue: false,
    }
    mocks.state.tasks = [
      {
        id: 'task-current',
        project_id: 'project-1',
        title: '1# building 2F ceiling board installation',
        standard_work_name: '吊顶封板',
        building_object_id: 'building-1',
        participant_unit_id: 'unit-fitout',
        planned_start_date: '2026-05-15',
        planned_end_date: '2026-05-25',
        progress: 10,
        status: 'in_progress',
      },
      {
        id: 'task-tile',
        project_id: 'project-1',
        title: '1#2层墙地砖铺贴',
        standard_work_name: 'tile paving',
        building_object_id: 'building-1',
        participant_unit_id: 'unit-fitout',
        planned_start_date: '2026-05-14',
        planned_end_date: '2026-05-24',
        progress: 5,
        status: 'in_progress',
      },
      {
        id: 'task-putty',
        project_id: 'project-1',
        title: '1# building 2F putty works',
        standard_work_name: '腻子施工',
        building_object_id: 'building-1',
        participant_unit_id: 'unit-fitout',
        planned_start_date: '2026-05-16',
        planned_end_date: '2026-05-23',
        progress: 0,
        status: 'not_started',
      },
      {
        id: 'task-ceiling-other-building',
        project_id: 'project-1',
        title: '2# building 2F ceiling frame installation',
        standard_work_name: '吊顶龙骨安装',
        building_object_id: 'building-2',
        participant_unit_id: 'unit-fitout-2',
        planned_start_date: '2026-05-13',
        planned_end_date: '2026-05-21',
        progress: 20,
        status: 'in_progress',
      },
    ]
    mocks.state.conditions = [
      {
        id: 'condition-personnel',
        project_id: 'project-1',
        task_id: 'task-current',
        condition_type: 'personnel',
        status: 'pending',
        is_satisfied: false,
        target_date: '2026-05-05',
        created_at: '2026-05-05T00:00:00.000Z',
      },
      {
        id: 'condition-equipment',
        project_id: 'project-1',
        task_id: 'task-tile',
        condition_type: 'equipment',
        status: 'pending',
        is_satisfied: false,
        target_date: '2026-05-06',
        created_at: '2026-05-06T00:00:00.000Z',
      },
      {
        id: 'condition-material-board',
        project_id: 'project-1',
        task_id: 'task-current',
        condition_type: 'project_material',
        source_type: 'project_material',
        source_ref_id: 'material-board',
        status: 'pending',
        is_satisfied: false,
        required_for_start: false,
        blocking_level: 'soft',
      },
      {
        id: 'condition-material-tile',
        project_id: 'project-1',
        task_id: 'task-tile',
        condition_type: 'project_material',
        source_type: 'project_material',
        source_ref_id: 'material-tile',
        status: 'pending',
        is_satisfied: false,
        required_for_start: false,
        blocking_level: 'soft',
      },
    ]
    mocks.state.obstacles = [
      {
        id: 'obstacle-labor',
        project_id: 'project-1',
        task_id: 'task-current',
        obstacle_type: 'personnel',
        status: 'open',
        severity: 'high',
        estimated_resolve_date: '2026-05-07',
        created_at: '2026-05-07T00:00:00.000Z',
      },
      {
        id: 'obstacle-equipment',
        project_id: 'project-1',
        task_id: 'task-putty',
        obstacle_type: 'equipment',
        status: 'resolving',
        severity: 'critical',
        estimated_resolve_date: '2026-05-08',
        created_at: '2026-05-08T00:00:00.000Z',
      },
    ]
    mocks.state.materials = [
      {
        id: 'material-board',
        project_id: 'project-1',
        expected_arrival_date: '2026-05-09',
        actual_arrival_date: null,
        record_status: 'active',
        lifecycle_status: 'active',
      },
      {
        id: 'material-tile',
        project_id: 'project-1',
        expected_arrival_date: '2026-05-10',
        actual_arrival_date: null,
        record_status: 'active',
        lifecycle_status: 'active',
      },
    ]

    const context = await buildDurationContext({ taskId: 'task-current' })
    const resourceFactor = context.factors.find((factor) => factor.key === 'resource_conflict')

    expect(resourceFactor).toBeTruthy()
    expect(resourceFactor?.actionPolicy).toBe('candidate_only')
    expect(resourceFactor?.label).toBe('现场承载压力')
    expect(resourceFactor?.metadata).toMatchObject({
      signalType: 'site_capacity_pressure',
      pressureLevel: 'high',
      executionProgressIsPrimaryEvidence: true,
      sameResponsibleUnitCount: 2,
      sameBuildingCount: 2,
      sameResourceClassCount: 3,
      progressPressureCount: 4,
      overlapProgressPressureCount: 3,
      currentTaskProgressPressure: true,
      resourceConditionCount: 2,
      resourceObstacleCount: 2,
      overdueMaterialCount: 2,
      severeObstacleCount: 2,
    })
    expect(resourceFactor?.metadata?.progressScore).toBeCloseTo(18.1818, 3)
    expect(resourceFactor?.reason).toContain('同责任单位任务排期重叠')
    expect(resourceFactor?.reason).toContain('同楼栋任务排期重叠')
    expect(resourceFactor?.reason).toContain('同类施工资源任务排期重叠')
    expect(resourceFactor?.reason).toContain('人员/设备/材料')
    expect(resourceFactor?.reason).toContain('关联材料预计到货已逾期')
    expect(resourceFactor?.reason).toContain('不等同于已确认的人材机资源冲突')
    expect(resourceFactor?.multiplier).toBeGreaterThanOrEqual(1.2)
    expect(resourceFactor?.extraDays).toBeGreaterThanOrEqual(5)
    expect(resourceFactor?.confidenceDelta).toBeLessThanOrEqual(-20)
  })

  it('keeps pure schedule overlap as low pressure when execution progress is normal', async () => {
    mocks.state.tasks = [
      {
        id: 'task-current',
        project_id: 'project-1',
        title: '1# building 2F ceiling board installation',
        building_object_id: 'building-1',
        participant_unit_id: 'unit-fitout',
        planned_start_date: '2026-05-15',
        planned_end_date: '2026-05-25',
        progress: 95,
        status: 'in_progress',
      },
      {
        id: 'task-overlap',
        project_id: 'project-1',
        title: '1# building 2F light fixture installation',
        building_object_id: 'building-1',
        participant_unit_id: 'unit-fitout',
        planned_start_date: '2026-05-16',
        planned_end_date: '2026-05-22',
        progress: 95,
        status: 'in_progress',
      },
    ]

    const context = await buildDurationContext({ taskId: 'task-current' })
    const resourceFactor = context.factors.find((factor) => factor.key === 'resource_conflict')

    expect(resourceFactor).toBeTruthy()
    expect(resourceFactor?.metadata).toMatchObject({
      pressureLevel: 'low',
      executionProgressIsPrimaryEvidence: false,
      sameResponsibleUnitCount: 1,
      sameBuildingCount: 1,
      progressPressureCount: 0,
      readinessScore: 0,
    })
    expect(resourceFactor?.multiplier).toBeLessThanOrEqual(1.04)
    expect(resourceFactor?.confidenceDelta).toBeLessThanOrEqual(-3)
    expect(resourceFactor?.confidenceDelta).toBeGreaterThan(-10)
  })

  it('weights spatial overlap by overlap days, floor and zone instead of only counting rows', async () => {
    mocks.state.tasks = [
      {
        id: 'task-current',
        project_id: 'project-1',
        title: '1F interior finishing',
        building_object_id: 'building-1',
        floor_object_id: 'floor-1',
        physical_zone_object_id: 'zone-a',
        participant_unit_id: 'unit-a',
        planned_start_date: '2026-05-15',
        planned_end_date: '2026-05-24',
        progress: 70,
        status: 'in_progress',
      },
      {
        id: 'task-same-zone-half',
        project_id: 'project-1',
        title: '1F zone A lighting',
        building_object_id: 'building-1',
        floor_object_id: 'floor-1',
        physical_zone_object_id: 'zone-a',
        participant_unit_id: 'unit-b',
        planned_start_date: '2026-05-15',
        planned_end_date: '2026-05-19',
        progress: 95,
        status: 'in_progress',
      },
      {
        id: 'task-same-floor-full',
        project_id: 'project-1',
        title: '1F zone B ceiling',
        building_object_id: 'building-1',
        floor_object_id: 'floor-1',
        physical_zone_object_id: 'zone-b',
        participant_unit_id: 'unit-c',
        planned_start_date: '2026-05-15',
        planned_end_date: '2026-05-24',
        progress: 95,
        status: 'in_progress',
      },
      {
        id: 'task-same-building-short',
        project_id: 'project-1',
        title: '2F corridor painting',
        building_object_id: 'building-1',
        floor_object_id: 'floor-2',
        physical_zone_object_id: 'zone-c',
        participant_unit_id: 'unit-d',
        planned_start_date: '2026-05-22',
        planned_end_date: '2026-05-24',
        progress: 80,
        status: 'in_progress',
      },
    ]

    const context = await buildDurationContext({ taskId: 'task-current' })
    const resourceFactor = context.factors.find((factor) => factor.key === 'resource_conflict')

    expect(resourceFactor).toBeTruthy()
    expect(resourceFactor?.metadata).toMatchObject({
      pressureLevel: 'low',
      executionProgressIsPrimaryEvidence: false,
      sameZoneCount: 1,
      sameFloorCount: 2,
      sameBuildingCount: 3,
      progressPressureCount: 0,
    })
    expect(resourceFactor?.metadata?.overlapStrength).toBeCloseTo(1.8)
    expect(resourceFactor?.metadata?.maxOverlapRatio).toBeCloseTo(1)
    expect(resourceFactor?.metadata?.spatialScore).toBeCloseTo((1.6 * 0.5) + (1.35 * 1) + (1 * 0.3))
    expect(resourceFactor?.metadata?.overlapWorkContextSummary).toEqual(expect.arrayContaining([
      expect.objectContaining({ taskId: 'task-same-zone-half', overlapDays: 5, overlapRatio: 0.5, sameZone: true }),
      expect.objectContaining({ taskId: 'task-same-floor-full', overlapDays: 10, overlapRatio: 1, sameFloor: true, sameZone: false }),
      expect.objectContaining({ taskId: 'task-same-building-short', overlapDays: 3, overlapRatio: 0.3, sameBuilding: true, sameFloor: false }),
    ]))
  })

  it('uses resource parallel capacity to amplify low-capacity overlaps and soften high-capacity overlaps', async () => {
    mocks.state.tasks = [
      {
        id: 'task-current-low',
        project_id: 'project-1',
        title: 'tower crane hoisting',
        planned_start_date: '2026-05-01',
        planned_end_date: '2026-05-10',
        progress: 80,
        status: 'in_progress',
      },
      {
        id: 'task-overlap-low',
        project_id: 'project-1',
        title: 'tower crane steel hoisting',
        planned_start_date: '2026-05-01',
        planned_end_date: '2026-05-10',
        progress: 85,
        status: 'in_progress',
      },
    ]
    mocks.resolveV1474ResourceClass.mockResolvedValue({
      stableCode: 'resource_class:tower_crane',
      resourceClass: 'tower_crane',
      parallelCapacity: 'low',
    })

    const lowContext = await buildDurationContext({ taskId: 'task-current-low' })
    const lowFactor = lowContext.factors.find((factor) => factor.key === 'resource_conflict')

    expect(lowFactor).toBeTruthy()
    expect(lowFactor?.metadata).toMatchObject({
      sameResourceClassCount: 1,
      resourceClassScore: 1.62,
      resourceParallelCapacity: 'low',
    })
    expect(lowFactor?.metadata?.overlapWorkContextSummary).toEqual(expect.arrayContaining([
      expect.objectContaining({
        taskId: 'task-overlap-low',
        parallelCapacity: 'low',
        parallelCapacityWeight: 1.62,
        verticalTransportLimited: true,
        verticalTransportMultiplier: 1.2,
      }),
    ]))

    mocks.state.tasks = [
      {
        id: 'task-current-high',
        project_id: 'project-1',
        title: 'electrical cable installation',
        planned_start_date: '2026-05-01',
        planned_end_date: '2026-05-10',
        progress: 80,
        status: 'in_progress',
      },
      {
        id: 'task-overlap-high',
        project_id: 'project-1',
        title: 'electrical lighting installation',
        planned_start_date: '2026-05-01',
        planned_end_date: '2026-05-10',
        progress: 85,
        status: 'in_progress',
      },
    ]
    mocks.resolveV1474ResourceClass.mockResolvedValue({
      stableCode: 'resource_class:electrical',
      resourceClass: 'electrical',
      parallelCapacity: 'high',
    })

    const highContext = await buildDurationContext({ taskId: 'task-current-high' })
    const highFactor = highContext.factors.find((factor) => factor.key === 'resource_conflict')

    expect(highFactor).toBeTruthy()
    expect(highFactor?.metadata).toMatchObject({
      sameResourceClassCount: 1,
      resourceClassScore: 0.65,
      resourceParallelCapacity: 'high',
    })
    expect(highFactor?.metadata?.overlapWorkContextSummary).toEqual(expect.arrayContaining([
      expect.objectContaining({ taskId: 'task-overlap-high', parallelCapacity: 'high', parallelCapacityWeight: 0.65 }),
    ]))
    expect(Number(lowFactor?.metadata?.resourceClassScore ?? 0)).toBeGreaterThan(Number(highFactor?.metadata?.resourceClassScore ?? 0))
  })

  it('uses resource complexity and transport emphasis to avoid flattening high-complex pressure at the default cap', async () => {
    mocks.state.resourceRecords[0].effectPolicy = {
      coldStartPolicy: 'candidate_only',
      actionPolicy: 'candidate_only',
      canAffectNewTaskReference: true,
      canAffectRemainingForecast: true,
      canExplainDeviation: true,
      canCreateRiskIssue: false,
    }
    mocks.state.tasks = [
      {
        id: 'task-current-pfb',
        project_id: 'project-pfb',
        title: 'PFB precast component hoisting current',
        standard_work_code: 'PFB-00-01',
        standard_work_name: 'precast hoisting',
        participant_unit_id: 'unit-pc',
        building_object_id: 'building-1',
        floor_object_id: 'floor-2',
        planned_start_date: '2026-05-01',
        planned_end_date: '2026-05-20',
        actual_start_date: '2026-05-01',
        progress: 5,
        status: 'in_progress',
      },
      {
        id: 'task-overlap-pfb-a',
        project_id: 'project-pfb',
        title: 'PFB precast component hoisting A',
        standard_work_code: 'PFB-00-02',
        standard_work_name: 'precast hoisting',
        participant_unit_id: 'unit-pc',
        building_object_id: 'building-1',
        floor_object_id: 'floor-2',
        planned_start_date: '2026-05-01',
        planned_end_date: '2026-05-20',
        actual_start_date: '2026-05-01',
        progress: 5,
        status: 'in_progress',
      },
      {
        id: 'task-overlap-pfb-b',
        project_id: 'project-pfb',
        title: 'PFB precast component hoisting B',
        standard_work_code: 'PFB-00-03',
        standard_work_name: 'precast hoisting',
        participant_unit_id: 'unit-pc',
        building_object_id: 'building-1',
        floor_object_id: 'floor-2',
        planned_start_date: '2026-05-01',
        planned_end_date: '2026-05-20',
        actual_start_date: '2026-05-01',
        progress: 5,
        status: 'in_progress',
      },
    ]
    mocks.resolveV1474ResourceClass.mockResolvedValue({
      stableCode: 'resource_precast_hoisting',
      resourceClass: 'precast_hoisting',
      parallelCapacity: 'low',
      resourceOperationType: 'transport',
      resourceOperationConfidence: 'high',
      pressureDimensions: ['equipment', 'workface'],
      sameBuildingDailyLimit: 1,
      sameUnitDailyLimit: 1,
      sameFloorDailyLimit: 1,
      sameSystemDailyLimit: 1,
    })
    mocks.state.progressSnapshots = [
      { task_id: 'task-current-pfb', progress: 4, snapshot_date: '2026-05-12', created_at: '2026-05-12T08:00:00Z' },
      { task_id: 'task-current-pfb', progress: 5, snapshot_date: '2026-05-20', created_at: '2026-05-20T08:00:00Z' },
    ]

    const context = await buildDurationContext({ taskId: 'task-current-pfb' })
    const resourceFactor = context.factors.find((factor) => factor.key === 'resource_conflict')

    expect(resourceFactor).toEqual(expect.objectContaining({
      actionPolicy: 'candidate_only',
    }))
    expect(resourceFactor?.metadata).toEqual(expect.objectContaining({
      resourceClass: 'precast_hoisting',
      resourceComplexityLevel: 'high_complex',
      complexityMultiplierMax: 1.5,
      verticalTransportLimitedApplied: true,
      verticalTransportWeight: 1.2,
      sameResourceSystemCount: 2,
    }))
    expect(resourceFactor?.metadata?.overlapWorkContextSummary).toEqual(expect.arrayContaining([
      expect.objectContaining({
        verticalTransportLimited: true,
        verticalTransportMultiplier: 1.2,
      }),
    ]))
    expect(resourceFactor?.multiplier).toBeGreaterThan(1.35)
    expect(resourceFactor?.multiplier).toBeLessThanOrEqual(1.5)
  })

  it('uses resource operation semantics to distinguish short-term strong occupancy from background use', async () => {
    mocks.state.tasks = [
      {
        id: 'task-current-operation',
        project_id: 'project-1',
        title: 'construction hoist mast-section addition',
        planned_start_date: '2026-05-01',
        planned_end_date: '2026-05-10',
        progress: 80,
        status: 'in_progress',
      },
      {
        id: 'task-overlap-operation',
        project_id: 'project-1',
        title: 'construction hoist vertical transport',
        planned_start_date: '2026-05-01',
        planned_end_date: '2026-05-10',
        progress: 85,
        status: 'in_progress',
      },
    ]
    mocks.resolveV1474ResourceClass
      .mockResolvedValueOnce({
        stableCode: 'resource_class:construction_hoist',
        resourceClass: 'construction_hoist',
        parallelCapacity: 'low',
        resourceOperationType: 'add_section',
        resourceOperationConfidence: 'high',
      })
      .mockResolvedValueOnce({
        stableCode: 'resource_class:construction_hoist',
        resourceClass: 'construction_hoist',
        parallelCapacity: 'low',
        resourceOperationType: 'use',
        resourceOperationConfidence: 'medium',
      })

    const context = await buildDurationContext({ taskId: 'task-current-operation' })
    const resourceFactor = context.factors.find((factor) => factor.key === 'resource_conflict')

    expect(resourceFactor).toBeTruthy()
    expect(resourceFactor?.metadata).toMatchObject({
      resourceClass: 'construction_hoist',
      currentResourcePressureDimensions: ['equipment', 'workface'],
      resourceOperationType: 'add_section',
      resourceOperationPressureRole: 'short_term_strong_occupancy',
      resourceOperationPressureMultiplier: 1.15,
    })
    expect(resourceFactor?.metadata?.overlapWorkContextSummary).toEqual(expect.arrayContaining([
      expect.objectContaining({
        taskId: 'task-overlap-operation',
        currentResourceOperationType: 'add_section',
        resourceOperationType: 'use',
        operationPressureRole: 'short_term_strong_occupancy',
        operationPressureMultiplier: 1.15,
        resourcePressureDimensions: ['equipment', 'workface'],
        parallelCapacityWeight: 1.863,
        verticalTransportLimited: true,
        verticalTransportMultiplier: 1.2,
        seasonWindowSensitive: false,
        seasonWindowMultiplier: 1,
      }),
    ]))
  })

  it('treats resource operation semantics as window impact only until execution evidence exists', async () => {
    mocks.state.tasks = [
      {
        id: 'task-current-window-only',
        project_id: 'project-1',
        title: 'construction hoist mast-section addition',
        planned_start_date: '2026-05-20',
        planned_end_date: '2026-05-30',
        progress: 0,
        status: 'not_started',
      },
      {
        id: 'task-overlap-window-only',
        project_id: 'project-1',
        title: 'construction hoist vertical transport',
        planned_start_date: '2026-05-20',
        planned_end_date: '2026-05-30',
        progress: 0,
        status: 'not_started',
      },
    ]
    mocks.resolveV1474ResourceClass
      .mockResolvedValueOnce({
        stableCode: 'resource_class:construction_hoist',
        resourceClass: 'construction_hoist',
        parallelCapacity: 'low',
        resourceOperationType: 'add_section',
        resourceOperationConfidence: 'high',
      })
      .mockResolvedValueOnce({
        stableCode: 'resource_class:construction_hoist',
        resourceClass: 'construction_hoist',
        parallelCapacity: 'low',
        resourceOperationType: 'use',
        resourceOperationConfidence: 'medium',
      })

    const context = await buildDurationContext({ taskId: 'task-current-window-only' })
    const resourceFactor = context.factors.find((factor) => factor.key === 'resource_conflict')

    expect(resourceFactor).toBeTruthy()
    expect(resourceFactor?.actionPolicy).toBe('confidence_only')
    expect(resourceFactor?.multiplier).toBe(1)
    expect(resourceFactor?.extraDays).toBe(0)
    expect(resourceFactor?.metadata).toMatchObject({
      resourceClass: 'construction_hoist',
      resourceOperationType: 'add_section',
      resourceOperationPressureRole: 'short_term_strong_occupancy',
      resourceOperationWindowImpactMode: 'resource_window_impact',
      resourceOperationDirectDurationImpactAllowed: false,
      durationImpactMode: 'resource_window_impact_only',
      hasResourceWindowDurationEvidence: false,
    })
  })

  it('uses resource daily limits so low-parallel resources are not treated like ordinary overlaps', async () => {
    mocks.resolveV1474ResourceClass.mockResolvedValue({
      stableCode: 'resource_class:tower_crane',
      resourceClass: 'tower_crane',
      parallelCapacity: 'low',
      sameBuildingDailyLimit: 1,
      sameUnitDailyLimit: 1,
      sameFloorDailyLimit: 1,
    })
    mocks.state.tasks = [
      {
        id: 'task-current',
        project_id: 'project-1',
        title: 'tower crane hoisting',
        building_object_id: 'building-1',
        floor_object_id: 'floor-1',
        participant_unit_id: 'unit-steel',
        planned_start_date: '2026-05-15',
        planned_end_date: '2026-05-24',
        progress: 95,
        status: 'in_progress',
      },
      {
        id: 'task-overlap-a',
        project_id: 'project-1',
        title: 'steel hoisting A',
        building_object_id: 'building-1',
        floor_object_id: 'floor-1',
        participant_unit_id: 'unit-steel',
        planned_start_date: '2026-05-15',
        planned_end_date: '2026-05-24',
        progress: 95,
        status: 'in_progress',
      },
      {
        id: 'task-overlap-b',
        project_id: 'project-1',
        title: 'steel hoisting B',
        building_object_id: 'building-1',
        floor_object_id: 'floor-1',
        participant_unit_id: 'unit-steel',
        planned_start_date: '2026-05-15',
        planned_end_date: '2026-05-24',
        progress: 95,
        status: 'in_progress',
      },
    ]

    const context = await buildDurationContext({ taskId: 'task-current' })
    const resourceFactor = context.factors.find((factor) => factor.key === 'resource_conflict')

    expect(resourceFactor).toBeTruthy()
    expect(resourceFactor?.metadata).toMatchObject({
      pressureLevel: 'low',
      executionProgressIsPrimaryEvidence: false,
      sameResourceClassCount: 2,
      sameResourceBuildingCount: 2,
      sameResourceUnitCount: 2,
      sameResourceFloorCount: 2,
      hasResourceWindowDurationEvidence: false,
      durationImpactMode: 'resource_window_impact_only',
    })
    expect(resourceFactor?.metadata?.capacityLimitScore).toBeCloseTo(9.6, 5)
    expect(resourceFactor?.metadata?.capacityLimitSignal).toEqual(expect.objectContaining({
      buildingExcess: 2,
      unitExcess: 2,
      floorExcess: 2,
      systemExcess: 2,
      excessScore: 8,
    }))
    expect(resourceFactor?.multiplier).toBe(1)
    expect(resourceFactor?.actionPolicy).toBe('confidence_only')
    expect(resourceFactor?.reason).toContain('同类资源并行数量超过经验承载上限')
  })

  it('raises pressure from recent progress snapshots and responsible-unit history without extra user-entered resource quantities', async () => {
    mocks.state.tasks = [
      {
        id: 'task-current',
        project_id: 'project-1',
        title: '1F plastering',
        building_object_id: 'building-1',
        participant_unit_id: 'unit-plaster',
        planned_start_date: '2026-05-01',
        planned_end_date: '2026-05-20',
        progress: 20,
        status: 'in_progress',
      },
      {
        id: 'task-completed-1',
        project_id: 'project-1',
        title: 'completed plastering A',
        participant_unit_id: 'unit-plaster',
        planned_start_date: '2026-04-01',
        planned_end_date: '2026-04-05',
        actual_start_date: '2026-04-01',
        actual_end_date: '2026-04-10',
        progress: 100,
        status: 'completed',
      },
      {
        id: 'task-completed-2',
        project_id: 'project-1',
        title: 'completed plastering B',
        participant_unit_id: 'unit-plaster',
        planned_start_date: '2026-04-11',
        planned_end_date: '2026-04-15',
        actual_start_date: '2026-04-11',
        actual_end_date: '2026-04-20',
        progress: 100,
        status: 'completed',
      },
    ]
    mocks.state.progressSnapshots = [
      { task_id: 'task-current', progress: 20, snapshot_date: '2026-05-12' },
      { task_id: 'task-current', progress: 21, snapshot_date: '2026-05-19' },
    ]

    const context = await buildDurationContext({ taskId: 'task-current' })
    const resourceFactor = context.factors.find((factor) => factor.key === 'resource_conflict')

    expect(resourceFactor).toBeTruthy()
    expect(resourceFactor?.metadata).toMatchObject({
      executionProgressIsPrimaryEvidence: true,
      currentTaskProgressPressureOnly: false,
      progressPressureCount: 1,
      trendScore: 2.4,
      responsibleUnitHistoryScore: 3,
    })
    expect(resourceFactor?.metadata?.progressTrendPressure).toEqual(expect.objectContaining({
      stagnantTaskCount: 1,
      trendPressureWeight: 1.2,
    }))
    expect(resourceFactor?.metadata?.responsibleUnitHistoryPressure).toEqual(expect.objectContaining({
      sampleCount: 2,
      averageDurationRatio: 2,
    }))
    expect(resourceFactor?.reason).toContain('推进停滞')
    expect(resourceFactor?.reason).toContain('该责任单位历史任务实际工期偏长')
  })

  it('does not use planned starts as actual starts for responsible-unit history pressure', async () => {
    mocks.state.tasks = [
      {
        id: 'task-current',
        project_id: 'project-1',
        title: '1F plastering',
        building_object_id: 'building-1',
        participant_unit_id: 'unit-plaster',
        planned_start_date: '2026-05-01',
        planned_end_date: '2026-05-20',
        progress: 20,
        status: 'in_progress',
      },
      {
        id: 'task-completed-1',
        project_id: 'project-1',
        title: 'completed plastering A',
        participant_unit_id: 'unit-plaster',
        planned_start_date: '2026-04-01',
        planned_end_date: '2026-04-05',
        actual_start_date: null,
        actual_end_date: '2026-04-10',
        progress: 100,
        status: 'completed',
      },
      {
        id: 'task-completed-2',
        project_id: 'project-1',
        title: 'completed plastering B',
        participant_unit_id: 'unit-plaster',
        planned_start_date: '2026-04-11',
        planned_end_date: '2026-04-15',
        actual_start_date: null,
        actual_end_date: '2026-04-20',
        progress: 100,
        status: 'completed',
      },
    ]
    mocks.state.progressSnapshots = [
      { task_id: 'task-current', progress: 20, snapshot_date: '2026-05-12' },
      { task_id: 'task-current', progress: 21, snapshot_date: '2026-05-19' },
    ]

    const context = await buildDurationContext({ taskId: 'task-current' })
    const resourceFactor = context.factors.find((factor) => factor.key === 'resource_conflict')

    expect(resourceFactor?.metadata?.responsibleUnitHistoryPressure).toEqual(expect.objectContaining({
      sampleCount: 0,
      averageDurationRatio: null,
    }))
    expect(resourceFactor?.metadata?.responsibleUnitHistoryScore).toBe(0)
  })

  it('does not treat acceptance or curing style back-heavy progress as site pressure too early', async () => {
    mocks.state.standardDurationSeed = {
      stableCode: 'acceptance-hold-seed',
      standardWorkCode: 'fire_acceptance_hold',
      durationContributionMode: 'external_wait',
      executionNature: 'quality_gate',
      progressCurve: 'hold',
      __stableCode: 'acceptance-hold-seed',
      __resolverSource: 'test_seed',
    }
    mocks.state.tasks = [
      {
        id: 'task-current',
        project_id: 'project-1',
        title: '1# building fire acceptance timeline item',
        standard_work_code: 'fire_acceptance_hold',
        standard_work_name: 'fire acceptance',
        building_object_id: 'building-1',
        participant_unit_id: 'unit-fire',
        planned_start_date: '2026-05-01',
        planned_end_date: '2026-05-30',
        progress: 30,
        status: 'in_progress',
      },
      {
        id: 'task-overlap',
        project_id: 'project-1',
        title: '1# building fire linkage commissioning acceptance',
        standard_work_name: '消防联动调试验收',
        building_object_id: 'building-1',
        participant_unit_id: 'unit-fire',
        planned_start_date: '2026-05-05',
        planned_end_date: '2026-05-28',
        progress: 35,
        status: 'in_progress',
      },
    ]

    const context = await buildDurationContext({ taskId: 'task-current' })
    const resourceFactor = context.factors.find((factor) => factor.key === 'resource_conflict')

    expect(resourceFactor).toBeTruthy()
    expect(resourceFactor?.metadata).toMatchObject({
      pressureLevel: 'low',
      executionProgressIsPrimaryEvidence: false,
      progressPressureCount: 0,
      currentTaskProgressPressure: false,
      currentTaskProgressCurve: 'hold',
      currentTaskProgressPressureProfile: 'non_duration_external_wait',
    })
    expect(resourceFactor?.multiplier).toBeLessThanOrEqual(1.04)
  })

  it('uses title weak recognition only as low-confidence fallback for resource pressure context', async () => {
    mocks.state.weakStandardWorkMatches = [{
      standardWorkCode: 'STD-REBAR-BINDING',
      score: 0.74,
      ruleId: 'weak_rebar_binding',
    }]
    mocks.state.standardDurationSeed = {
      stableCode: 'process_duration:STD-REBAR-BINDING',
      standardWorkCodes: ['STD-REBAR-BINDING'],
      keywords: ['rebar', 'binding'],
      durationContributionMode: 'duration_bearing',
      executionNature: 'physical_work',
      __resolverSource: 'ts_seed_fallback',
    }
    mocks.state.tasks = [{
      id: 'task-current',
      project_id: 'project-1',
      title: '1F rebar binding',
      planned_start_date: '2026-05-01',
      planned_end_date: '2026-05-10',
      progress: 0,
      status: 'in_progress',
    }]

    const context = await buildDurationContext({ taskId: 'task-current' })
    const resourceFactor = context.factors.find((factor) => factor.key === 'resource_conflict')

    expect(resourceFactor).toBeTruthy()
    expect(resourceFactor?.metadata).toMatchObject({
      currentTaskStandardWorkSource: 'title_weak_fallback',
      currentTaskStandardWorkCode: 'STD-REBAR-BINDING',
      currentTaskTitleWeakScore: 0.74,
      currentTaskTitleWeakRuleId: 'weak_rebar_binding',
      currentTaskDurationContributionMode: 'duration_bearing',
      currentTaskExecutionNature: 'physical_work',
      currentTaskResourcePressureEligibility: 'weak_fallback',
      currentTaskResourcePressureWeight: 0.65,
      currentTaskProgressPressure: true,
      executionProgressIsPrimaryEvidence: true,
    })
    expect(resourceFactor?.metadata).toMatchObject({
      currentTaskProgressPressureOnly: true,
      currentProgressPressureWeight: 0.22749999999999998,
    })
    expect(resourceFactor?.metadata?.progressScore).toBeCloseTo(1.1375)
    expect(resourceFactor?.multiplier).toBeLessThan(1.1)
  })

  it('lets title weak standard work bridge process constraints while preserving weak confidence metadata', async () => {
    mocks.state.weakStandardWorkMatches = [{
      standardWorkCode: 'electrical_feeder_busway',
      score: 0.74,
      ruleId: 'alias_cable_tray',
    }]
    mocks.state.standardDurationSeed = {
      stableCode: 'electrical_feeder_busway',
      standardWorkCodes: ['electrical_feeder_busway'],
      standardCatalogCodePrefixes: ['07-03'],
      durationContributionMode: 'duration_bearing',
      executionNature: 'physical_work',
      __stableCode: 'electrical_feeder_busway',
      __resolverSource: 'ts_seed_fallback',
    }
    mocks.resolveV1474ProcessConstraint.mockResolvedValue({
      stableCode: 'electrical_tray_to_cable_laying_zone_overlap',
      constraintType: 'overlap_allowed',
      applicationMode: 'edge_overlap',
      impactMode: 'overlap_ratio',
      runtimeActionPolicy: 'candidate_only',
      timeSourcePolicy: 'standard_work_duration_seed_only',
      durationLookupPolicy: 'route_to_standard_work_duration_seed',
      durationLookupKeys: ['cable_tray_installation', 'cable_laying'],
      carrierProcessHints: ['桥架安装', '电缆敷设'],
      durationAuthorityPolicy: 'no_duration_values_in_process_constraint',
      releaseQuantityPolicy: 'real_task_quantity_then_standard_duration_quantity_proxy_then_scope_proxy',
      minReleaseQuantityPercent: 70,
      quantitySourcePriority: ['task_planned_completed_quantity', 'standard_work_duration_default_quantity', 'scope_granularity_proxy'],
      insufficientQuantityPolicy: 'candidate_only_until_real_quantity_or_scope_release',
      quantityDoubleCountPolicy: 'standard_work_duration_owns_default_quantity_process_constraint_owns_release_threshold',
      partialOverlapRatio: 0.55,
      startAfterPercent: 45,
      scopeGranularity: 'zone',
      gateRequired: false,
      relationInputPolicy: 'requires_existing_relation',
      dependencyCreationPolicy: 'never_create_dependency',
      parallelAllowedPolicy: 'parallel_allowed_is_no_edge_not_overlap',
      supportedRelationKinds: ['hard_sequence', 'soft_sequence', 'acceptance_gate', 'dependency_intent', 'explicit_task_dependency'],
      explicitCarrierPolicy: 'skip_duration_add_when_explicit_carrier_process_exists',
      durationDoubleCountPolicy: 'standard_work_duration_owns_all_day_values_process_constraint_owns_edge_routing',
      relationshipScope: 'same_parent_or_cross_scope_edge',
      confidence: 'medium',
      processConstraintMatchSource: 'structured_prefix',
      processConstraintKeywordMatched: true,
      processConstraintTitleWeakBridged: true,
      __resolverSource: 'ts_seed_fallback',
    })
    mocks.state.tasks = [{
      id: 'task-current',
      project_id: 'project-1',
      title: '3F cable tray installation before cable laying',
      planned_start_date: '2026-05-01',
      planned_end_date: '2026-05-10',
      progress: 1,
      status: 'todo',
    }]

    const context = await buildDurationContext({ taskId: 'task-current' })
    const factor = context.factors.find((item) => item.key === 'process_constraint')

    expect(mocks.resolveV1474ProcessConstraint).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        standardWorkCode: 'electrical_feeder_busway',
        standardWorkCodes: ['electrical_feeder_busway'],
        standardCatalogCodePrefixes: ['07-03'],
        standardWorkSource: 'title_weak_fallback',
        titleWeakScore: 0.74,
        titleWeakRuleId: 'alias_cable_tray',
      }),
    )
    expect(factor).toEqual(expect.objectContaining({
      actionPolicy: 'candidate_only',
      extraDays: 0,
    }))
    expect(factor?.confidenceDelta).toBe(-3)
    expect(factor?.metadata).toMatchObject({
      standardWorkSource: 'title_weak_fallback',
      standardWorkCode: 'electrical_feeder_busway',
      standardCatalogCodePrefixes: ['07-03'],
      titleWeakScore: 0.74,
      titleWeakRuleId: 'alias_cable_tray',
      matchSource: 'structured_prefix',
      keywordMatched: true,
      titleWeakBridged: true,
    })
  })

  it('passes task metadata method, element, project and structure codes into process constraint seed context', async () => {
    mocks.resolveV1474ProcessConstraint.mockResolvedValue({
      stableCode: 'metadata_driven_process_constraint',
      constraintType: 'technical_gate',
      applicationMode: 'edge_overlap',
      impactMode: 'multiplier',
      multiplier: 1.18,
      runtimeActionPolicy: 'candidate_only',
      timeSourcePolicy: 'standard_work_duration_seed_only',
      durationLookupPolicy: 'route_to_standard_work_duration_seed',
      durationLookupKeys: ['prefab_grouting_cold_weather'],
      carrierProcessHints: ['sleeve grouting'],
      durationAuthorityPolicy: 'no_duration_values_in_process_constraint',
      partialOverlapRatio: 0.35,
      startAfterPercent: 65,
      scopeGranularity: 'floor',
      gateRequired: true,
      relationInputPolicy: 'requires_existing_relation',
      dependencyCreationPolicy: 'never_create_dependency',
      parallelAllowedPolicy: 'parallel_allowed_is_no_edge_not_overlap',
      supportedRelationKinds: ['hard_sequence'],
      durationDoubleCountPolicy: 'standard_work_duration_owns_all_day_values_process_constraint_owns_edge_routing',
      relationshipScope: 'same_parent_or_cross_scope_edge',
      confidence: 'high',
      __resolverSource: 'test_seed',
    })
    mocks.state.tasks = [{
      id: 'task-metadata-process-context',
      project_id: 'project-metadata-process-context',
      title: 'Y9# prefab sleeve grouting below 5c',
      standard_work_name: 'prefab sleeve grouting',
      standard_work_code: 'PFB-01-01-02',
      planned_start_date: '2027-01-12',
      planned_end_date: '2027-01-18',
      progress: 0,
      standard_task_metadata: {
        projectTypeCode: 'residential',
        structureTypeCode: 'prefabricated_concrete',
        methodVariantCodes: ['prefab_grouting'],
        elementVariantCodes: ['prefab_grouting'],
        dangerControlLevel: 'critical',
      },
    }]

    const context = await buildDurationContext({ taskId: 'task-metadata-process-context' })
    const processFactor = context.factors.find((factor) => factor.key === 'process_constraint')

    expect(mocks.resolveV1474ProcessConstraint).toHaveBeenCalledWith(
      expect.stringContaining('prefab_grouting'),
      expect.objectContaining({
        projectTypeCode: 'residential',
        structureTypeCode: 'prefabricated_concrete',
        methodVariantCodes: ['prefab_grouting'],
        elementVariantCodes: ['prefab_grouting'],
      }),
    )
    expect(processFactor?.metadata.conditionContext).toEqual(expect.objectContaining({
      projectTypeCode: ['residential'],
      structureTypeCode: ['prefabricated_concrete'],
      methodVariantCode: ['prefab_grouting'],
      elementVariantCode: ['prefab_grouting'],
      dangerControlLevel: ['critical'],
    }))
  })

  it('caps non-duration standard work so inspection facts do not become strong resource pressure', async () => {
    mocks.state.standardDurationSeed = {
      stableCode: 'process_duration:STD-ACCEPTANCE-GATE',
      standardWorkCodes: ['STD-ACCEPTANCE-GATE'],
      keywords: ['acceptance', 'inspection'],
      durationContributionMode: 'quality_gate',
      executionNature: 'inspection_test',
      __resolverSource: 'ts_seed_fallback',
    }
    mocks.state.tasks = [{
      id: 'task-current',
      project_id: 'project-1',
      title: 'acceptance inspection',
      standard_work_code: 'STD-ACCEPTANCE-GATE',
      standard_work_name: 'acceptance inspection',
      planned_start_date: '2026-05-01',
      planned_end_date: '2026-05-10',
      progress: 0,
      status: 'in_progress',
    }]

    const context = await buildDurationContext({ taskId: 'task-current' })
    const resourceFactor = context.factors.find((factor) => factor.key === 'resource_conflict')

    expect(resourceFactor).toBeTruthy()
    expect(resourceFactor?.metadata).toMatchObject({
      currentTaskStandardWorkSource: 'explicit',
      currentTaskStandardWorkCode: 'STD-ACCEPTANCE-GATE',
      currentTaskDurationContributionMode: 'quality_gate',
      currentTaskExecutionNature: 'inspection_test',
      currentTaskResourcePressureEligibility: 'non_duration',
      currentTaskResourcePressureWeight: 0.25,
      currentTaskProgressPressure: true,
      executionProgressIsPrimaryEvidence: true,
    })
    expect(resourceFactor?.metadata).toMatchObject({
      currentTaskProgressPressureOnly: true,
      currentProgressPressureWeight: 0.0875,
    })
    expect(resourceFactor?.metadata?.progressScore).toBeCloseTo(0.4375)
    expect(resourceFactor?.multiplier).toBeLessThanOrEqual(1.04)
  })

  it('uses process curves for progress velocity instead of linear elapsed progress', async () => {
    const holdContext = await buildDurationContext({
      projectId: 'project-1',
      taskTitle: 'fire acceptance waiting',
      standardWorkName: 'fire acceptance',
      plannedStartDate: '2026-05-01',
      plannedEndDate: '2026-06-30',
      actualStartDate: '2026-05-01',
      progress: 5,
    })

    expect(holdContext.factors.find((factor) => factor.key === 'progress_velocity')).toBeUndefined()

    const frontHeavyContext = await buildDurationContext({
      projectId: 'project-1',
      taskTitle: 'rebar binding',
      standardWorkName: 'rebar binding',
      plannedStartDate: '2026-05-01',
      plannedEndDate: '2026-06-10',
      actualStartDate: '2026-05-01',
      progress: 10,
    })
    const velocityFactor = frontHeavyContext.factors.find((factor) => factor.key === 'progress_velocity')

    expect(velocityFactor).toEqual(expect.objectContaining({
      source: 'task_fact',
      actionPolicy: 'candidate_only',
    }))
    expect(velocityFactor?.metadata).toEqual(expect.objectContaining({
      curve: 'front_heavy',
      profileReason: 'front_heavy_process',
    }))
    expect(velocityFactor?.multiplier).toBeGreaterThan(1.05)
  })

  it('downgrades stale readiness facts when the task is already progressing normally', async () => {
    mocks.state.tasks = [{
      id: 'task-ready-normal',
      project_id: 'project-1',
      title: 'linear installation',
      planned_start_date: '2026-05-01',
      planned_end_date: '2026-06-30',
      actual_start_date: '2026-05-01',
      progress: 40,
      status: 'in_progress',
    }]
    mocks.state.conditions = [{
      id: 'condition-1',
      task_id: 'task-ready-normal',
      status: 'pending',
      is_satisfied: false,
      blocking_level: 'hard',
      required_for_start: true,
      condition_type: 'personnel',
    }]
    mocks.state.obstacles = [{
      id: 'obstacle-1',
      task_id: 'task-ready-normal',
      status: 'active',
      progress_impact_level: 'blocked',
      severity: 'critical',
      obstacle_type: 'coordination',
    }]
    mocks.state.materials = [{
      id: 'material-1',
      linked_task_id: 'task-ready-normal',
      expected_arrival_date: '2026-05-25',
      actual_arrival_date: null,
      record_status: 'active',
    }]

    const context = await buildDurationContext({ taskId: 'task-ready-normal' })
    const readinessFactor = context.factors.find((factor) => factor.key === 'external_readiness')

    expect(readinessFactor).toEqual(expect.objectContaining({
      actionPolicy: 'confidence_only',
      multiplier: 1,
      extraDays: 0,
    }))
    expect(readinessFactor?.metadata).toEqual(expect.objectContaining({
      progressLooksNormal: true,
      hardConditionCount: 0,
      staleConditionDowngradedCount: 1,
      recoveredObstacleCount: 1,
    }))
  })

  it('uses dated material readiness facts to delay earliest start without inventing days for undated materials', async () => {
    mocks.state.tasks = [{
      id: 'task-material-wait',
      project_id: 'project-1',
      title: 'ceiling installation',
      planned_start_date: '2026-05-20',
      planned_end_date: '2026-05-30',
      progress: 0,
      status: 'todo',
    }]
    mocks.state.conditions = [
      {
        id: 'condition-material-dated',
        task_id: 'task-material-wait',
        condition_type: 'project_material',
        source_type: 'project_material',
        source_ref_id: 'material-dated',
        status: 'pending',
        is_satisfied: false,
        required_for_start: false,
        blocking_level: 'soft',
      },
      {
        id: 'condition-material-undated',
        task_id: 'task-material-wait',
        condition_type: 'project_material',
        source_type: 'project_material',
        source_ref_id: 'material-undated',
        status: 'pending',
        is_satisfied: false,
        required_for_start: false,
        blocking_level: 'soft',
      },
    ]
    mocks.state.materials = [
      {
        id: 'material-dated',
        expected_arrival_date: '2026-05-25',
        actual_arrival_date: null,
        record_status: 'active',
      },
      {
        id: 'material-undated',
        expected_arrival_date: null,
        actual_arrival_date: null,
        record_status: 'active',
      },
    ]

    const context = await buildDurationContext({ taskId: 'task-material-wait' })
    const readinessFactor = context.factors.find((factor) => factor.key === 'external_readiness')

    expect(readinessFactor).toEqual(expect.objectContaining({
      actionPolicy: 'candidate_only',
      extraDays: 5,
    }))
    expect(readinessFactor?.metadata).toEqual(expect.objectContaining({
      materialPendingWithDateCount: 1,
      materialPendingWithoutDateCount: 1,
      materialStartDelayDays: 5,
      maxMaterialExpectedArrivalDate: '2026-05-25',
    }))
  })

  it('uses differentiated readiness weights and higher material delay cap for severe external blockers', async () => {
    mocks.state.tasks = [{
      id: 'task-readiness-severe',
      project_id: 'project-1',
      title: 'finish readiness task',
      planned_start_date: '2026-05-01',
      planned_end_date: '2026-05-10',
      actual_start_date: '2026-05-01',
      progress: 50,
      status: 'in_progress',
    }]
    mocks.state.conditions = [
      {
        id: 'condition-finish',
        task_id: 'task-readiness-severe',
        status: 'pending',
        is_satisfied: false,
        blocking_level: 'hard',
        condition_type: 'acceptance',
        title: 'finish acceptance hold point',
      },
      {
        id: 'condition-drawing',
        task_id: 'task-readiness-severe',
        status: 'pending',
        is_satisfied: false,
        blocking_level: 'hard',
        condition_type: 'drawing',
        required_for_start: true,
        title: 'shop drawing approval',
      },
      {
        id: 'condition-start-extra',
        task_id: 'task-readiness-severe',
        status: 'pending',
        is_satisfied: false,
        blocking_level: 'hard',
        condition_type: 'personnel',
        required_for_start: true,
        title: 'crew readiness',
      },
      {
        id: 'condition-material-delay',
        task_id: 'task-readiness-severe',
        status: 'pending',
        is_satisfied: false,
        blocking_level: 'soft',
        required_for_start: false,
        condition_type: 'project_material',
        source_type: 'project_material',
        source_ref_id: 'material-delay',
      },
    ]
    mocks.state.obstacles = [{
      id: 'obstacle-severe',
      task_id: 'task-readiness-severe',
      status: 'active',
      progress_impact_level: 'blocked',
      severity: 'critical',
      obstacle_type: 'coordination',
    }]
    mocks.state.materials = [{
      id: 'material-delay',
      expected_arrival_date: '2026-05-22',
      actual_arrival_date: null,
      record_status: 'active',
    }]

    const context = await buildDurationContext({ taskId: 'task-readiness-severe' })
    const readinessFactor = context.factors.find((factor) => factor.key === 'external_readiness')

    expect(readinessFactor).toEqual(expect.objectContaining({
      actionPolicy: 'candidate_only',
      extraDays: 21,
    }))
    expect(context.extraDays).toBe(0)
    expect(candidateScenario(context).extraDays).toBe(7)
    expect(context.calculationContext).toEqual(expect.objectContaining({
      raw_extra_days: expect.any(Number),
      extra_days_cap: 7,
      extra_days_cap_policy: 'planned_duration_dynamic_segment_cap',
      extra_days_cap_applied: false,
    }))
    expect(Number(context.calculationContext.raw_extra_days)).toBe(0)
    expect(Number(candidateScenario(context).rawExtraDays)).toBeGreaterThan(7)
    expect(readinessFactor?.confidenceDelta).toBeLessThan(-25)
    expect(readinessFactor?.multiplier).toBeGreaterThan(1.25)
    expect(readinessFactor?.metadata).toEqual(expect.objectContaining({
      finishConditionTimingWeight: 0.6,
      materialExtraDaysCap: 21,
      confidencePenalty: 35,
      impactScore: expect.any(Number),
    }))
  })

  it('uses first positive progress snapshot as actual start fallback for progress velocity', async () => {
    mocks.state.tasks = [{
      id: 'task-snapshot-start',
      project_id: 'project-1',
      title: 'linear work',
      planned_start_date: '2026-05-01',
      planned_end_date: '2026-06-30',
      actual_start_date: null,
      progress: 10,
      status: 'in_progress',
    }]
    mocks.state.progressSnapshots = [
      { task_id: 'task-snapshot-start', progress: 0, snapshot_date: '2026-05-01', created_at: '2026-05-01T08:00:00Z' },
      { task_id: 'task-snapshot-start', progress: 5, snapshot_date: '2026-05-15', created_at: '2026-05-15T08:00:00Z' },
      { task_id: 'task-snapshot-start', progress: 10, snapshot_date: '2026-05-20', created_at: '2026-05-20T08:00:00Z' },
    ]

    const context = await buildDurationContext({ taskId: 'task-snapshot-start' })
    const velocityFactor = context.factors.find((factor) => factor.key === 'progress_velocity')

    expect(velocityFactor).toBeUndefined()
  })

  it('marks zero-progress tasks as velocity-skipped metadata instead of silently dropping the factor chain', async () => {
    mocks.state.tasks = [{
      id: 'task-zero-progress',
      project_id: 'project-1',
      title: 'unstarted facade task',
      planned_start_date: '2026-05-01',
      planned_end_date: '2026-05-12',
      actual_start_date: null,
      progress: 0,
      status: 'not_started',
    }]

    const context = await buildDurationContext({ taskId: 'task-zero-progress' })

    expect(context.factors.find((factor) => factor.key === 'progress_velocity')).toBeUndefined()
    expect(context.calculationContext).toEqual(expect.objectContaining({
      velocity_skipped_due_to_zero_progress: true,
      velocity_skip_reason: 'zero_progress_has_no_execution_velocity_sample',
    }))
  })

  it('uses explicit progress curve from duration seed before keyword fallback', async () => {
    mocks.state.standardDurationSeed = {
      stableCode: 'std-rebar-hold',
      progressCurve: 'hold',
      __resolverSource: 'test_seed',
    }

    const context = await buildDurationContext({
      projectId: 'project-1',
      taskTitle: 'rebar binding waiting check',
      standardWorkCode: 'STD-REBAR-HOLD',
      standardWorkName: 'rebar binding',
      plannedStartDate: '2026-05-01',
      plannedEndDate: '2026-06-30',
      actualStartDate: '2026-05-01',
      progress: 5,
    })

    expect(context.factors.find((factor) => factor.key === 'progress_velocity')).toBeUndefined()
  })

  it('prefers explicit material condition linkage over linked task material fallback', async () => {
    mocks.state.tasks = [{
      id: 'task-explicit-material',
      project_id: 'project-1',
      title: 'ceiling installation',
      planned_start_date: '2026-05-20',
      planned_end_date: '2026-05-30',
      progress: 0,
      status: 'todo',
    }]
    mocks.state.conditions = [{
      id: 'condition-material',
      task_id: 'task-explicit-material',
      status: 'pending',
      is_satisfied: false,
      condition_type: 'material',
      source_type: 'project_material',
      source_ref_id: 'material-explicit',
      required_for_start: true,
      blocking_level: 'hard',
    }]
    mocks.state.materials = [
      {
        id: 'material-explicit',
        linked_task_id: null,
        expected_arrival_date: '2026-05-25',
        actual_arrival_date: null,
        record_status: 'active',
      },
      {
        id: 'material-fallback',
        linked_task_id: 'task-explicit-material',
        expected_arrival_date: '2026-06-10',
        actual_arrival_date: null,
        record_status: 'active',
      },
    ]

    const context = await buildDurationContext({ taskId: 'task-explicit-material' })
    const readinessFactor = context.factors.find((factor) => factor.key === 'external_readiness')

    expect(readinessFactor).toEqual(expect.objectContaining({
      extraDays: 5,
    }))
    expect(readinessFactor?.metadata).toEqual(expect.objectContaining({
      explicitMaterialLinkCount: 1,
      fallbackMaterialLinkCount: 0,
      materialLinkagePolicy: 'explicit_condition_first',
      primaryBusinessReasonType: 'material',
    }))
  })

  it('downgrades obstacle readiness when recent progress snapshots show recovery', async () => {
    mocks.state.tasks = [{
      id: 'task-recovered-obstacle',
      project_id: 'project-1',
      title: 'linear work',
      planned_start_date: '2026-05-01',
      planned_end_date: '2026-06-30',
      actual_start_date: '2026-05-01',
      progress: 40,
      status: 'in_progress',
    }]
    mocks.state.obstacles = [{
      id: 'obstacle-recovered',
      task_id: 'task-recovered-obstacle',
      status: 'active',
      progress_impact_level: 'blocked',
      severity: 'critical',
      obstacle_type: 'coordination',
    }]
    mocks.state.progressSnapshots = [
      { task_id: 'task-recovered-obstacle', progress: 20, snapshot_date: '2026-05-12', created_at: '2026-05-12T08:00:00Z' },
      { task_id: 'task-recovered-obstacle', progress: 30, snapshot_date: '2026-05-17', created_at: '2026-05-17T08:00:00Z' },
      { task_id: 'task-recovered-obstacle', progress: 40, snapshot_date: '2026-05-20', created_at: '2026-05-20T08:00:00Z' },
    ]

    const context = await buildDurationContext({ taskId: 'task-recovered-obstacle' })
    const readinessFactor = context.factors.find((factor) => factor.key === 'external_readiness')

    expect(readinessFactor).toEqual(expect.objectContaining({
      actionPolicy: 'confidence_only',
      multiplier: 1,
    }))
    expect(readinessFactor?.metadata).toEqual(expect.objectContaining({
      recoveredObstacleCount: 1,
      progressRecoveredByTrend: true,
    }))
  })

  it('classifies finishing stagnation business reason from closeout readiness facts', async () => {
    mocks.state.tasks = [{
      id: 'task-finishing-rectification',
      project_id: 'project-1',
      title: 'finishing closeout',
      planned_start_date: '2026-05-01',
      planned_end_date: '2026-05-10',
      actual_start_date: '2026-05-01',
      progress: 95,
      status: 'in_progress',
    }]
    mocks.state.obstacles = [{
      id: 'obstacle-rectification',
      task_id: 'task-finishing-rectification',
      status: 'active',
      obstacle_type: 'rectification',
      description: 'rectification punch items',
      progress_impact_level: 'blocked',
    }]

    const context = await buildDurationContext({ taskId: 'task-finishing-rectification' })
    const velocityFactor = context.factors.find((factor) => factor.key === 'progress_velocity')

    expect(velocityFactor).toEqual(expect.objectContaining({
      actionPolicy: 'candidate_only',
    }))
    expect(velocityFactor?.metadata).toEqual(expect.objectContaining({
      finishingStagnation: true,
      finishingStagnationReason: 'rectification',
    }))
  })

  it('regression: resource pressure is led by execution evidence, not overlap alone', async () => {
    mocks.state.resourceRecords[0].effectPolicy = {
      ...mocks.state.resourceRecords[0].effectPolicy,
      minSamplesForActiveMode: 0,
    }
    mocks.state.resolvedResource = {
      resourceClass: 'concrete_pour',
      parallelCapacity: 'low',
      __resolverSource: 'test_resource_seed',
    }
    mocks.state.tasks = [
      {
        id: 'task-resource-current',
        project_id: 'project-resource',
        title: '2F concrete pour',
        standard_work_name: 'concrete pour',
        participant_unit_id: 'unit-concrete',
        building_object_id: 'building-1',
        floor_object_id: 'floor-2',
        planned_start_date: '2026-05-01',
        planned_end_date: '2026-05-20',
        actual_start_date: '2026-05-01',
        progress: 20,
        status: 'in_progress',
      },
      {
        id: 'task-resource-overlap',
        project_id: 'project-resource',
        title: '3F concrete pour',
        standard_work_name: 'concrete pour',
        participant_unit_id: 'unit-concrete',
        building_object_id: 'building-1',
        floor_object_id: 'floor-3',
        planned_start_date: '2026-05-01',
        planned_end_date: '2026-05-20',
        actual_start_date: '2026-05-01',
        progress: 15,
        status: 'in_progress',
      },
    ]
    mocks.state.progressSnapshots = [
      { task_id: 'task-resource-current', progress: 18, snapshot_date: '2026-05-12', created_at: '2026-05-12T08:00:00Z' },
      { task_id: 'task-resource-current', progress: 19, snapshot_date: '2026-05-16', created_at: '2026-05-16T08:00:00Z' },
      { task_id: 'task-resource-current', progress: 20, snapshot_date: '2026-05-20', created_at: '2026-05-20T08:00:00Z' },
      { task_id: 'task-resource-overlap', progress: 14, snapshot_date: '2026-05-12', created_at: '2026-05-12T08:00:00Z' },
      { task_id: 'task-resource-overlap', progress: 15, snapshot_date: '2026-05-20', created_at: '2026-05-20T08:00:00Z' },
    ]

    const context = await buildDurationContext({ taskId: 'task-resource-current' })
    const resourceFactor = context.factors.find((factor) => factor.key === 'resource_conflict')

    expect(resourceFactor).toEqual(expect.objectContaining({
      actionPolicy: 'candidate_only',
      source: 'task_fact',
    }))
    expect(resourceFactor?.metadata).toEqual(expect.objectContaining({
      pressureLevel: 'high',
      executionProgressIsPrimaryEvidence: true,
      currentTaskProgressPressure: true,
      sameResponsibleUnitCount: 1,
      sameResourceClassCount: 1,
      resourceClass: 'concrete_pour',
    }))
    expect(resourceFactor?.metadata?.currentTaskProgressCurve).toBeTruthy()
    expect(Number(resourceFactor?.metadata?.progressScore ?? 0)).toBeGreaterThan(0)
    expect(resourceFactor?.multiplier).toBeGreaterThan(1.1)
  })

  it('consumes project schedule state to relax organized acceleration resource pressure', async () => {
    mocks.state.resourceRecords[0].effectPolicy = {
      ...mocks.state.resourceRecords[0].effectPolicy,
      minSamplesForActiveMode: 0,
    }
    mocks.state.resolvedResource = {
      resourceClass: 'concrete_pour',
      parallelCapacity: 'low',
      __resolverSource: 'test_resource_seed',
    }
    mocks.state.projectScheduleStates = [{
      project_id: 'project-resource',
      scope_type: 'building',
      scope_id: 'building-1',
      state: 'accelerating',
      confidence_score: 0.86,
      window_days: 14,
      window_end_date: '2026-05-20',
      local_acceleration_factor: 0.94,
      throughput_ratio: 1.6,
      parallel_density_ratio: 1.45,
      deviation_recovery_days: 5,
      evidence: [{ code: 'completion_throughput_up', label: 'throughput up', weight: 1 }],
      downstream_policy: {
        canAdjustRemainingDuration: true,
        canExplainDeviation: true,
        canRelaxResourceConflictPenalty: true,
        velocityFactorSupersedes: true,
        resourceConflictPenaltyMultiplier: 0.65,
        localAccelerationFactor: 0.94,
        maxForwardDays: 14,
        confidenceOnly: false,
        actionPolicy: 'candidate_only',
      },
      metrics: {},
    }]
    mocks.state.tasks = [
      {
        id: 'task-resource-current',
        project_id: 'project-resource',
        title: '2F concrete pour',
        standard_work_name: 'concrete pour',
        participant_unit_id: 'unit-concrete',
        building_object_id: 'building-1',
        floor_object_id: 'floor-2',
        planned_start_date: '2026-05-01',
        planned_end_date: '2026-05-20',
        actual_start_date: '2026-05-01',
        progress: 20,
        status: 'in_progress',
      },
      {
        id: 'task-resource-overlap',
        project_id: 'project-resource',
        title: '3F concrete pour',
        standard_work_name: 'concrete pour',
        participant_unit_id: 'unit-concrete',
        building_object_id: 'building-1',
        floor_object_id: 'floor-3',
        planned_start_date: '2026-05-01',
        planned_end_date: '2026-05-20',
        actual_start_date: '2026-05-01',
        progress: 15,
        status: 'in_progress',
      },
    ]
    mocks.state.progressSnapshots = [
      { task_id: 'task-resource-current', progress: 18, snapshot_date: '2026-05-12', created_at: '2026-05-12T08:00:00Z' },
      { task_id: 'task-resource-current', progress: 19, snapshot_date: '2026-05-16', created_at: '2026-05-16T08:00:00Z' },
      { task_id: 'task-resource-current', progress: 20, snapshot_date: '2026-05-20', created_at: '2026-05-20T08:00:00Z' },
      { task_id: 'task-resource-overlap', progress: 14, snapshot_date: '2026-05-12', created_at: '2026-05-12T08:00:00Z' },
      { task_id: 'task-resource-overlap', progress: 15, snapshot_date: '2026-05-20', created_at: '2026-05-20T08:00:00Z' },
    ]

    const context = await buildDurationContext({ taskId: 'task-resource-current' })
    const stateFactor = context.factors.find((factor) => factor.key === 'project_schedule_state')
    const resourceFactor = context.factors.find((factor) => factor.key === 'resource_conflict')

    expect(stateFactor).toEqual(expect.objectContaining({
      source: 'project_schedule_state',
      actionPolicy: 'candidate_only',
      multiplier: 0.94,
    }))
    expect(resourceFactor?.metadata).toEqual(expect.objectContaining({
      projectScheduleStatePolicyApplied: true,
      projectScheduleState: 'accelerating',
      resourceConflictPenaltyMultiplier: 0.65,
    }))
    expect(context.calculationContext).toEqual(expect.objectContaining({
      project_schedule_state: 'accelerating',
      project_schedule_state_factor: 0.94,
      project_schedule_state_resource_relaxation: true,
    }))
  })

  it('keeps ahead-of-curve velocity as confidence-only when project schedule state already carries acceleration', async () => {
    mocks.state.projectScheduleStates = [{
      project_id: 'project-1',
      scope_type: 'project',
      scope_id: 'project',
      state: 'accelerating',
      confidence_score: 0.84,
      window_days: 14,
      window_end_date: '2026-05-20',
      local_acceleration_factor: 0.95,
      throughput_ratio: 1.5,
      parallel_density_ratio: 1.2,
      deviation_recovery_days: 3,
      evidence: [],
      downstream_policy: {
        canAdjustRemainingDuration: true,
        canExplainDeviation: true,
        canRelaxResourceConflictPenalty: true,
        velocityFactorSupersedes: true,
        resourceConflictPenaltyMultiplier: 0.65,
        localAccelerationFactor: 0.95,
        maxForwardDays: 14,
        confidenceOnly: false,
        actionPolicy: 'candidate_only',
      },
      metrics: {},
    }]

    const context = await buildDurationContext({
      projectId: 'project-1',
      taskTitle: 'rebar binding',
      standardWorkName: 'rebar binding',
      plannedStartDate: '2026-05-01',
      plannedEndDate: '2026-06-30',
      actualStartDate: '2026-05-01',
      progress: 70,
    })
    const velocityFactor = context.factors.find((factor) => factor.key === 'progress_velocity')

    expect(velocityFactor).toEqual(expect.objectContaining({
      actionPolicy: 'confidence_only',
      multiplier: 1,
    }))
    expect(velocityFactor?.metadata).toEqual(expect.objectContaining({
      supersededByProjectScheduleState: true,
      originalMultiplier: 0.95,
    }))
    expect(context.calculationContext.project_schedule_state_velocity_superseded).toBe(true)
  })

  it('preserves applicable schedule-state combinations and blocks local acceleration when a matching specialty is blocked', async () => {
    mocks.state.projectScheduleStates = [
      {
        project_id: 'project-1',
        scope_type: 'project',
        scope_id: 'project',
        state: 'normal',
        confidence_score: 0.7,
        window_days: 14,
        window_end_date: '2026-05-20',
        local_acceleration_factor: null,
        throughput_ratio: 1.05,
        parallel_density_ratio: 1,
        deviation_recovery_days: 0,
        evidence: [],
        downstream_policy: {
          canAdjustRemainingDuration: false,
          canExplainDeviation: true,
          canRelaxResourceConflictPenalty: false,
          velocityFactorSupersedes: false,
          resourceConflictPenaltyMultiplier: 1,
          localAccelerationFactor: null,
          maxForwardDays: 0,
          confidenceOnly: true,
          actionPolicy: 'confidence_only',
        },
        metrics: {},
      },
      {
        project_id: 'project-1',
        scope_type: 'building',
        scope_id: 'building-2',
        state: 'accelerating',
        confidence_score: 0.86,
        window_days: 14,
        window_end_date: '2026-05-20',
        local_acceleration_factor: 0.94,
        throughput_ratio: 1.5,
        parallel_density_ratio: 1.2,
        deviation_recovery_days: 4,
        evidence: [],
        downstream_policy: {
          canAdjustRemainingDuration: true,
          canExplainDeviation: true,
          canRelaxResourceConflictPenalty: true,
          velocityFactorSupersedes: true,
          resourceConflictPenaltyMultiplier: 0.65,
          localAccelerationFactor: 0.94,
          maxForwardDays: 14,
          confidenceOnly: false,
          actionPolicy: 'candidate_only',
        },
        metrics: { criticalPathThroughputRatio: 1.5 },
      },
      {
        project_id: 'project-1',
        scope_type: 'specialty',
        scope_id: 'mep',
        state: 'blocked',
        confidence_score: 0.78,
        window_days: 14,
        window_end_date: '2026-05-20',
        local_acceleration_factor: null,
        throughput_ratio: 0.6,
        parallel_density_ratio: 1.2,
        deviation_recovery_days: -4,
        evidence: [],
        downstream_policy: {
          canAdjustRemainingDuration: false,
          canExplainDeviation: true,
          canRelaxResourceConflictPenalty: false,
          velocityFactorSupersedes: false,
          resourceConflictPenaltyMultiplier: 1,
          localAccelerationFactor: null,
          maxForwardDays: 0,
          confidenceOnly: false,
          actionPolicy: 'candidate_only',
        },
        metrics: { milestoneThroughputRatio: 0.6 },
      },
    ]

    const context = await buildDurationContext({
      projectId: 'project-1',
      taskTitle: 'MEP rough-in',
      standardWorkName: 'MEP rough-in',
      buildingObjectId: 'building-2',
      standardWorkCode: 'mep',
      plannedStartDate: '2026-05-01',
      plannedEndDate: '2026-06-30',
      actualStartDate: '2026-05-01',
      progress: 40,
    })

    const stateFactor = context.factors.find((factor) => factor.key === 'project_schedule_state')
    const metadata = stateFactor?.metadata as Record<string, any>

    expect(stateFactor).toEqual(expect.objectContaining({
      actionPolicy: 'confidence_only',
      multiplier: 1,
    }))
    expect(metadata.blockingStateScope).toBe('specialty:mep')
    expect(metadata.applicableStates.map((item: any) => `${item.scopeType}:${item.scopeId}:${item.state}`)).toEqual(expect.arrayContaining([
      'project:project:normal',
      'building:building-2:accelerating',
      'specialty:mep:blocked',
    ]))
    expect(metadata.positiveStateScopes).toEqual(['building:building-2'])
    expect(metadata.downstreamPolicy.canAdjustRemainingDuration).toBe(false)
  })

  it('regression: progress velocity is downgraded when external readiness is the likely primary cause', async () => {
    mocks.state.tasks = [{
      id: 'task-velocity-external',
      project_id: 'project-1',
      title: 'rebar binding',
      standard_work_name: 'rebar binding',
      planned_start_date: '2026-05-01',
      planned_end_date: '2026-06-10',
      actual_start_date: '2026-05-01',
      progress: 10,
      status: 'in_progress',
    }]
    mocks.state.conditions = [{
      id: 'condition-drawing',
      task_id: 'task-velocity-external',
      status: 'pending',
      is_satisfied: false,
      condition_type: 'drawing',
      source_type: 'drawing',
      required_for_start: true,
      blocking_level: 'hard',
    }]

    const context = await buildDurationContext({ taskId: 'task-velocity-external' })
    const velocityFactor = context.factors.find((factor) => factor.key === 'progress_velocity')
    const readinessFactor = context.factors.find((factor) => factor.key === 'external_readiness')

    expect(velocityFactor).toEqual(expect.objectContaining({
      actionPolicy: 'candidate_only',
    }))
    expect(velocityFactor?.metadata).toEqual(expect.objectContaining({
      curve: 'front_heavy',
      externalReadinessLikelyPrimaryCause: true,
      externalReadinessPrimaryReasonType: 'drawing',
    }))
    expect(velocityFactor?.multiplier).toBeLessThanOrEqual(1.12)
    expect(readinessFactor?.metadata).toEqual(expect.objectContaining({
      drawingHardConditionCount: 1,
      primaryBusinessReasonType: 'drawing',
    }))
  })

  it('does not downgrade progress velocity for mixed causes when internal progress deficit is severe', async () => {
    mocks.state.tasks = [{
      id: 'task-velocity-mixed-severe',
      project_id: 'project-1',
      title: 'rebar binding',
      standard_work_name: 'rebar binding',
      planned_start_date: '2026-04-01',
      planned_end_date: '2026-06-10',
      actual_start_date: '2026-04-01',
      progress: 1,
      status: 'in_progress',
    }]
    mocks.state.conditions = [{
      id: 'condition-drawing-severe',
      task_id: 'task-velocity-mixed-severe',
      status: 'pending',
      is_satisfied: false,
      condition_type: 'drawing',
      source_type: 'drawing',
      required_for_start: true,
      blocking_level: 'hard',
    }]

    const context = await buildDurationContext({ taskId: 'task-velocity-mixed-severe' })
    const velocityFactor = context.factors.find((factor) => factor.key === 'progress_velocity')

    expect(velocityFactor).toEqual(expect.objectContaining({
      actionPolicy: 'candidate_only',
    }))
    expect(velocityFactor?.metadata).toEqual(expect.objectContaining({
      curve: 'front_heavy',
      externalTimingCauseDetected: true,
      externalReadinessLikelyPrimaryCause: false,
      mixedCauseDowngradeSuppressed: true,
      severeInternalProgressDeficit: true,
    }))
    expect(velocityFactor?.multiplier).toBeGreaterThan(1.12)
  })

  it('does not treat repeated recovery-then-stall oscillation as recovered progress velocity', async () => {
    mocks.state.tasks = [{
      id: 'task-velocity-oscillation',
      project_id: 'project-1',
      title: 'rebar binding',
      standard_work_name: 'rebar binding',
      planned_start_date: '2026-04-01',
      planned_end_date: '2026-06-10',
      actual_start_date: '2026-04-01',
      progress: 36,
      status: 'in_progress',
    }]
    mocks.state.progressSnapshots = [
      { task_id: 'task-velocity-oscillation', progress: 2, snapshot_date: '2026-04-10', created_at: '2026-04-10T08:00:00Z' },
      { task_id: 'task-velocity-oscillation', progress: 18, snapshot_date: '2026-04-14', created_at: '2026-04-14T08:00:00Z' },
      { task_id: 'task-velocity-oscillation', progress: 18, snapshot_date: '2026-04-23', created_at: '2026-04-23T08:00:00Z' },
      { task_id: 'task-velocity-oscillation', progress: 28, snapshot_date: '2026-05-12', created_at: '2026-05-12T08:00:00Z' },
      { task_id: 'task-velocity-oscillation', progress: 36, snapshot_date: '2026-05-20', created_at: '2026-05-20T08:00:00Z' },
    ]

    const context = await buildDurationContext({ taskId: 'task-velocity-oscillation' })
    const velocityFactor = context.factors.find((factor) => factor.key === 'progress_velocity')

    expect(velocityFactor).toEqual(expect.objectContaining({
      actionPolicy: 'candidate_only',
    }))
    expect(velocityFactor?.metadata).toEqual(expect.objectContaining({
      recentRecoveredByTrend: true,
      recoveredByTrend: false,
      stagnantByTrend: true,
      progressOscillationByTrend: true,
      stagnantOrRegressionSegmentCount: 1,
    }))
    expect(Number(velocityFactor?.metadata?.recoverySegmentCount ?? 0)).toBeGreaterThanOrEqual(2)
    expect(velocityFactor?.multiplier).toBeGreaterThan(1.12)
  })

  it('raises finishing stagnation cap when severe internal progress pressure coexists', async () => {
    mocks.state.tasks = [{
      id: 'task-finishing-severe',
      project_id: 'project-1',
      title: 'linear commissioning closeout',
      planned_start_date: '2026-04-01',
      planned_end_date: '2026-05-01',
      actual_start_date: '2026-04-01',
      progress: 90,
      status: 'in_progress',
    }]

    const context = await buildDurationContext({ taskId: 'task-finishing-severe' })
    const velocityFactor = context.factors.find((factor) => factor.key === 'progress_velocity')

    expect(velocityFactor).toEqual(expect.objectContaining({
      actionPolicy: 'candidate_only',
    }))
    expect(velocityFactor?.metadata).toEqual(expect.objectContaining({
      finishingStagnation: true,
      severeInternalProgressDeficit: true,
      finishingMultiplierMax: 1.35,
      finishingExtraDaysCap: 14,
    }))
    expect(velocityFactor?.multiplier).toBeGreaterThan(1.25)
    expect(velocityFactor?.extraDays).toBeGreaterThan(7)
    expect(velocityFactor?.extraDays).toBeLessThanOrEqual(14)
  })

  it('regression: external readiness separates dated material delay from undated confidence signals', async () => {
    mocks.state.tasks = [{
      id: 'task-readiness-regression',
      project_id: 'project-1',
      title: 'ceiling installation',
      planned_start_date: '2026-05-20',
      planned_end_date: '2026-05-30',
      progress: 0,
      status: 'todo',
    }]
    mocks.state.conditions = [
      {
        id: 'condition-material',
        task_id: 'task-readiness-regression',
        status: 'pending',
        is_satisfied: false,
        condition_type: 'material',
        source_type: 'project_material',
        source_ref_id: 'material-dated',
        required_for_start: true,
        blocking_level: 'hard',
      },
      {
        id: 'condition-finish',
        task_id: 'task-readiness-regression',
        status: 'pending',
        is_satisfied: false,
        condition_type: 'acceptance',
        required_for_start: false,
        blocking_level: 'hard',
      },
    ]
    mocks.state.materials = [
      {
        id: 'material-dated',
        expected_arrival_date: '2026-05-25',
        actual_arrival_date: null,
        record_status: 'active',
      },
      {
        id: 'material-undated-linked-fallback',
        linked_task_id: 'task-readiness-regression',
        expected_arrival_date: null,
        actual_arrival_date: null,
        record_status: 'active',
      },
    ]

    const context = await buildDurationContext({ taskId: 'task-readiness-regression' })
    const readinessFactor = context.factors.find((factor) => factor.key === 'external_readiness')

    expect(readinessFactor).toEqual(expect.objectContaining({
      actionPolicy: 'candidate_only',
      extraDays: 5,
    }))
    expect(readinessFactor?.metadata).toEqual(expect.objectContaining({
      explicitMaterialLinkCount: 1,
      fallbackMaterialLinkCount: 0,
      startHardConditionCount: 1,
      finishHardConditionCount: 1,
      materialPendingWithDateCount: 1,
      materialPendingWithoutDateCount: 0,
      materialStartDelayDays: 5,
      primaryBusinessReasonType: 'material',
    }))
  })

  it('links progress quality to severity-based confidence instead of fixed penalty', async () => {
    mocks.detectProgressAnomalySignals.mockReturnValue([{
      code: 'progress_jump',
      severity: 'critical',
      summary: 'Progress jumped sharply.',
      confidenceAction: 'confidence_only',
      excludedFromVelocityLearning: true,
      acknowledged: false,
      metadata: { progress_delta: 80 },
    }])
    mocks.state.tasks = [{
      id: 'task-progress-quality',
      project_id: 'project-1',
      title: 'progress quality task',
      planned_start_date: '2026-05-01',
      planned_end_date: '2026-05-30',
      progress: 80,
      status: 'in_progress',
    }]
    mocks.state.progressSnapshots = [
      { task_id: 'task-progress-quality', progress: 5, snapshot_date: '2026-05-18', created_at: '2026-05-18T08:00:00Z' },
      { task_id: 'task-progress-quality', progress: 85, snapshot_date: '2026-05-20', created_at: '2026-05-20T08:00:00Z' },
    ]

    const context = await buildDurationContext({ taskId: 'task-progress-quality' })
    const qualityFactor = context.factors.find((factor) => factor.key === 'progress_quality')

    expect(qualityFactor).toEqual(expect.objectContaining({
      actionPolicy: 'confidence_only',
      multiplier: 1,
      extraDays: 0,
      confidenceDelta: -18,
    }))
    expect(qualityFactor?.metadata).toEqual(expect.objectContaining({
      anomalyCodes: ['progress_jump'],
      confidencePenalty: 18,
      excludedFromVelocityLearning: true,
      planReferenceFallbackRecommended: true,
      planReferenceFallbackPolicy: 'plan_reference_ratio_only',
    }))
  })

  it('does not keep penalizing progress quality when related data quality finding is resolved or ignored', async () => {
    mocks.detectProgressAnomalySignals.mockReturnValue([{
      code: 'progress_jump',
      severity: 'critical',
      summary: 'Progress jumped sharply.',
      confidenceAction: 'confidence_only',
      excludedFromVelocityLearning: true,
      acknowledged: false,
      metadata: { progress_delta: 80 },
    }])
    mocks.state.tasks = [{
      id: 'task-progress-quality-resolved',
      project_id: 'project-1',
      title: 'resolved progress quality task',
      planned_start_date: '2026-05-01',
      planned_end_date: '2026-05-30',
      progress: 80,
      status: 'in_progress',
    }]
    mocks.state.progressSnapshots = [
      { task_id: 'task-progress-quality-resolved', progress: 5, snapshot_date: '2026-05-18', created_at: '2026-05-18T08:00:00Z' },
      { task_id: 'task-progress-quality-resolved', progress: 85, snapshot_date: '2026-05-20', created_at: '2026-05-20T08:00:00Z' },
    ]
    mocks.state.dataQualityFindings = [{
      id: 'finding-1',
      task_id: 'task-progress-quality-resolved',
      rule_code: 'PROGRESS_JUMP',
      status: 'ignored',
      resolved_at: '2026-05-20T09:00:00Z',
    }]

    const context = await buildDurationContext({ taskId: 'task-progress-quality-resolved' })
    const qualityFactor = context.factors.find((factor) => factor.key === 'progress_quality')

    expect(qualityFactor).toBeUndefined()
  })

  it('adds stale progress snapshot as progress quality confidence signal', async () => {
    mocks.state.tasks = [{
      id: 'task-progress-gap',
      project_id: 'project-1',
      title: 'stale progress task',
      planned_start_date: '2026-05-01',
      planned_end_date: '2026-05-30',
      progress: 45,
      status: 'in_progress',
    }]
    mocks.state.progressSnapshots = [
      { task_id: 'task-progress-gap', progress: 45, snapshot_date: '2026-05-10', created_at: '2026-05-10T08:00:00Z' },
    ]

    const context = await buildDurationContext({ taskId: 'task-progress-gap' })
    const qualityFactor = context.factors.find((factor) => factor.key === 'progress_quality')

    expect(qualityFactor).toEqual(expect.objectContaining({
      actionPolicy: 'confidence_only',
      confidenceDelta: -18,
    }))
    expect(qualityFactor?.metadata).toEqual(expect.objectContaining({
      anomalyCodes: ['snapshot_gap'],
      dataQualityRuleCodes: ['SNAPSHOT_GAP'],
    }))
  })

  it('uses process curve to avoid over-penalizing hold-style progress snapshot gaps', async () => {
    mocks.state.standardDurationSeed = {
      stableCode: 'acceptance-hold-seed',
      standardWorkCode: 'ACCEPTANCE-HOLD',
      progressCurve: 'hold',
      durationContributionMode: 'external_wait',
      executionNature: 'technical_wait',
      __resolverSource: 'test_seed',
    }
    mocks.state.tasks = [{
      id: 'task-progress-gap-hold',
      project_id: 'project-1',
      title: 'hold progress task',
      standard_work_code: 'ACCEPTANCE-HOLD',
      planned_start_date: '2026-05-01',
      planned_end_date: '2026-05-30',
      progress: 45,
      status: 'in_progress',
    }]
    mocks.state.progressSnapshots = [
      { task_id: 'task-progress-gap-hold', progress: 45, snapshot_date: '2026-05-12', created_at: '2026-05-12T08:00:00Z' },
    ]

    const context = await buildDurationContext({ taskId: 'task-progress-gap-hold' })
    const qualityFactor = context.factors.find((factor) => factor.key === 'progress_quality')

    expect(qualityFactor).toBeUndefined()
  })

  it('lowers progress quality confidence when snapshots mostly come from low-confidence batch sources', async () => {
    mocks.state.tasks = [{
      id: 'task-progress-low-source',
      project_id: 'project-1',
      title: 'low source progress task',
      planned_start_date: '2026-05-01',
      planned_end_date: '2026-05-30',
      progress: 60,
      status: 'in_progress',
    }]
    mocks.state.progressSnapshots = [
      { task_id: 'task-progress-low-source', progress: 20, snapshot_date: '2026-05-10', created_at: '2026-05-10T08:00:00Z', event_source: 'excel_import' },
      { task_id: 'task-progress-low-source', progress: 40, snapshot_date: '2026-05-15', created_at: '2026-05-15T08:00:00Z', event_source: 'bulk_update' },
      { task_id: 'task-progress-low-source', progress: 60, snapshot_date: '2026-05-20', created_at: '2026-05-20T08:00:00Z', event_source: 'excel_import' },
    ]

    const context = await buildDurationContext({ taskId: 'task-progress-low-source' })
    const qualityFactor = context.factors.find((factor) => factor.key === 'progress_quality')

    expect(qualityFactor).toEqual(expect.objectContaining({
      actionPolicy: 'confidence_only',
      confidenceDelta: -10,
    }))
    expect(qualityFactor?.metadata).toEqual(expect.objectContaining({
      anomalyCodes: ['source_low_confidence'],
      dataQualityRuleCodes: ['PROGRESS_SOURCE_LOW_CONFIDENCE'],
      excludedFromVelocityLearning: true,
    }))
    expect(qualityFactor?.metadata?.primaryMetadata).toEqual(expect.objectContaining({
      low_source_ratio: 1,
    }))
  })

  it('detects progress rollback corrections as progress quality evidence', async () => {
    mocks.state.tasks = [{
      id: 'task-progress-rollback',
      project_id: 'project-1',
      title: 'rollback progress task',
      planned_start_date: '2026-05-01',
      planned_end_date: '2026-05-30',
      progress: 45,
      status: 'in_progress',
    }]
    mocks.state.progressSnapshots = [
      { task_id: 'task-progress-rollback', progress: 85, snapshot_date: '2026-05-18', created_at: '2026-05-18T08:00:00Z', event_source: 'manual' },
      { task_id: 'task-progress-rollback', progress: 45, snapshot_date: '2026-05-20', created_at: '2026-05-20T08:00:00Z', event_source: 'manual' },
    ]

    const context = await buildDurationContext({ taskId: 'task-progress-rollback' })
    const qualityFactor = context.factors.find((factor) => factor.key === 'progress_quality')

    expect(qualityFactor).toEqual(expect.objectContaining({
      actionPolicy: 'confidence_only',
      confidenceDelta: -18,
    }))
    expect(qualityFactor?.metadata).toEqual(expect.objectContaining({
      anomalyCodes: ['progress_rollback'],
      dataQualityRuleCodes: ['PROGRESS_ROLLBACK'],
    }))
    expect(qualityFactor?.metadata?.learningObservation).toEqual(expect.objectContaining({
      sampleEligibility: 'exclude_duration_learning',
    }))
  })

  it('detects repeated same progress fills without changing business dates', async () => {
    mocks.state.tasks = [{
      id: 'task-progress-duplicate',
      project_id: 'project-1',
      title: 'duplicate progress task',
      planned_start_date: '2026-05-01',
      planned_end_date: '2026-05-30',
      progress: 35,
      status: 'in_progress',
    }]
    mocks.state.progressSnapshots = [
      { task_id: 'task-progress-duplicate', progress: 35, snapshot_date: '2026-05-15', created_at: '2026-05-15T08:00:00Z', event_source: 'manual' },
      { task_id: 'task-progress-duplicate', progress: 35, snapshot_date: '2026-05-18', created_at: '2026-05-18T08:00:00Z', event_source: 'manual' },
      { task_id: 'task-progress-duplicate', progress: 35, snapshot_date: '2026-05-20', created_at: '2026-05-20T08:00:00Z', event_source: 'manual' },
    ]

    const context = await buildDurationContext({ taskId: 'task-progress-duplicate' })
    const qualityFactor = context.factors.find((factor) => factor.key === 'progress_quality')

    expect(qualityFactor).toEqual(expect.objectContaining({
      actionPolicy: 'confidence_only',
      multiplier: 1,
      extraDays: 0,
      confidenceDelta: -10,
    }))
    expect(qualityFactor?.metadata).toEqual(expect.objectContaining({
      anomalyCodes: ['duplicate_progress_fill'],
      dataQualityRuleCodes: ['PROGRESS_DUPLICATE_FILL'],
    }))
  })

  it('downgrades stuck finishing progress quality when closeout facts explain the stagnation', async () => {
    mocks.detectProgressAnomalySignals.mockReturnValue([{
      code: 'stuck_finishing',
      severity: 'critical',
      summary: 'Progress stayed near completion.',
      confidenceAction: 'confidence_only',
      excludedFromVelocityLearning: true,
      acknowledged: false,
      metadata: { stuck_days: 30 },
    }])
    mocks.state.tasks = [{
      id: 'task-quality-closeout',
      project_id: 'project-1',
      title: 'closeout task',
      planned_start_date: '2026-04-01',
      planned_end_date: '2026-05-10',
      progress: 95,
      status: 'in_progress',
    }]
    mocks.state.progressSnapshots = [
      { task_id: 'task-quality-closeout', progress: 95, snapshot_date: '2026-05-01', created_at: '2026-05-01T08:00:00Z' },
      { task_id: 'task-quality-closeout', progress: 95, snapshot_date: '2026-05-20', created_at: '2026-05-20T08:00:00Z' },
    ]
    mocks.state.obstacles = [{
      id: 'obstacle-acceptance',
      task_id: 'task-quality-closeout',
      status: 'active',
      obstacle_type: 'acceptance',
      description: 'waiting for acceptance inspection',
    }]

    const context = await buildDurationContext({ taskId: 'task-quality-closeout' })
    const qualityFactor = context.factors.find((factor) => factor.key === 'progress_quality')

    expect(qualityFactor).toEqual(expect.objectContaining({
      actionPolicy: 'confidence_only',
      confidenceDelta: -5,
    }))
    expect(qualityFactor?.metadata).toEqual(expect.objectContaining({
      anomalyCodes: ['stuck_finishing'],
      businessSupportedCloseout: true,
      finishingStagnationReason: 'acceptance_wait',
    }))
  })

  it('regression: dense scheduling with normal progress stays confidence-only for site capacity pressure', async () => {
    mocks.state.resolvedResource = {
      resourceClass: 'tower_crane',
      parallelCapacity: 'low',
      sameBuildingDailyLimit: 1,
      sameUnitDailyLimit: 1,
      sameFloorDailyLimit: 1,
      __resolverSource: 'test_resource_seed',
    }
    mocks.state.tasks = [
      {
        id: 'task-dense-current',
        project_id: 'project-dense',
        title: 'tower crane lifting current',
        standard_work_name: 'tower crane lifting',
        participant_unit_id: 'unit-hoist',
        building_object_id: 'building-1',
        floor_object_id: 'floor-1',
        planned_start_date: '2026-05-10',
        planned_end_date: '2026-05-24',
        actual_start_date: '2026-05-10',
        progress: 85,
        status: 'in_progress',
      },
      {
        id: 'task-dense-overlap-a',
        project_id: 'project-dense',
        title: 'tower crane lifting overlap A',
        standard_work_name: 'tower crane lifting',
        participant_unit_id: 'unit-hoist',
        building_object_id: 'building-1',
        floor_object_id: 'floor-1',
        planned_start_date: '2026-05-10',
        planned_end_date: '2026-05-24',
        actual_start_date: '2026-05-10',
        progress: 88,
        status: 'in_progress',
      },
      {
        id: 'task-dense-overlap-b',
        project_id: 'project-dense',
        title: 'tower crane lifting overlap B',
        standard_work_name: 'tower crane lifting',
        participant_unit_id: 'unit-hoist',
        building_object_id: 'building-1',
        floor_object_id: 'floor-1',
        planned_start_date: '2026-05-10',
        planned_end_date: '2026-05-24',
        actual_start_date: '2026-05-10',
        progress: 90,
        status: 'in_progress',
      },
    ]

    const context = await buildDurationContext({ taskId: 'task-dense-current' })
    const resourceFactor = context.factors.find((factor) => factor.key === 'resource_conflict')

    expect(resourceFactor).toEqual(expect.objectContaining({
      actionPolicy: 'confidence_only',
      multiplier: 1,
      extraDays: 0,
    }))
    expect(resourceFactor?.metadata).toEqual(expect.objectContaining({
      pressureLevel: 'low',
      executionProgressIsPrimaryEvidence: false,
      hasOverlapOrCapacityContext: true,
      hasReadinessDurationEvidence: false,
      hasResourceWindowDurationEvidence: false,
      durationImpactMode: 'resource_window_impact_only',
      sameResponsibleUnitCount: 2,
      sameResourceClassCount: 2,
      progressPressureCount: 0,
    }))
    expect(Number(resourceFactor?.metadata?.capacityLimitScore ?? 0)).toBeGreaterThan(0)
  })

  it('regression: stalled responsible unit with unresolved readiness becomes candidate site pressure', async () => {
    mocks.state.resourceRecords[0].effectPolicy = {
      ...mocks.state.resourceRecords[0].effectPolicy,
      minSamplesForActiveMode: 0,
    }
    mocks.state.resolvedResource = {
      resourceClass: 'plastering_crew',
      parallelCapacity: 'medium',
      pressureDimensions: ['labor', 'workface'],
      __resolverSource: 'test_resource_seed',
    }
    mocks.state.tasks = [
      {
        id: 'task-stalled-current',
        project_id: 'project-stalled',
        title: '1F plastering current',
        standard_work_name: 'plastering',
        participant_unit_id: 'unit-plaster',
        building_object_id: 'building-1',
        floor_object_id: 'floor-1',
        planned_start_date: '2026-05-01',
        planned_end_date: '2026-05-20',
        actual_start_date: '2026-05-01',
        progress: 15,
        status: 'in_progress',
      },
      {
        id: 'task-stalled-overlap',
        project_id: 'project-stalled',
        title: '2F plastering overlap',
        standard_work_name: 'plastering',
        participant_unit_id: 'unit-plaster',
        building_object_id: 'building-1',
        floor_object_id: 'floor-2',
        planned_start_date: '2026-05-01',
        planned_end_date: '2026-05-20',
        actual_start_date: '2026-05-01',
        progress: 12,
        status: 'in_progress',
      },
    ]
    mocks.state.progressSnapshots = [
      { task_id: 'task-stalled-current', progress: 14, snapshot_date: '2026-05-12', created_at: '2026-05-12T08:00:00Z' },
      { task_id: 'task-stalled-current', progress: 15, snapshot_date: '2026-05-20', created_at: '2026-05-20T08:00:00Z' },
      { task_id: 'task-stalled-overlap', progress: 11, snapshot_date: '2026-05-12', created_at: '2026-05-12T08:00:00Z' },
      { task_id: 'task-stalled-overlap', progress: 12, snapshot_date: '2026-05-20', created_at: '2026-05-20T08:00:00Z' },
    ]
    mocks.state.conditions = [{
      id: 'condition-stalled-labor',
      project_id: 'project-stalled',
      task_id: 'task-stalled-current',
      condition_type: 'personnel',
      status: 'pending',
      is_satisfied: false,
      target_date: '2026-05-01',
      created_at: '2026-05-01T00:00:00.000Z',
    }]
    mocks.state.obstacles = [{
      id: 'obstacle-stalled-equipment',
      project_id: 'project-stalled',
      task_id: 'task-stalled-overlap',
      obstacle_type: 'equipment',
      status: 'open',
      severity: 'critical',
      expected_resolution_date: '2026-05-05',
      created_at: '2026-05-05T00:00:00.000Z',
    }]

    const context = await buildDurationContext({ taskId: 'task-stalled-current' })
    const resourceFactor = context.factors.find((factor) => factor.key === 'resource_conflict')

    expect(resourceFactor).toEqual(expect.objectContaining({
      actionPolicy: 'candidate_only',
      source: 'task_fact',
    }))
    expect(resourceFactor?.metadata).toEqual(expect.objectContaining({
      pressureLevel: 'high',
      executionProgressIsPrimaryEvidence: true,
      hasOverlapOrCapacityContext: true,
      hasLongTermReadinessEvidence: true,
      hasReadinessDurationEvidence: true,
      hasResourceWindowDurationEvidence: true,
      durationImpactMode: 'conditional_duration_candidate',
      currentTaskProgressPressure: true,
      progressPressureCount: 2,
      resourceConditionCount: 1,
      resourceObstacleCount: 1,
      severeObstacleCount: 1,
    }))
    expect(Number(resourceFactor?.metadata?.progressScore ?? 0)).toBeGreaterThan(8)
    expect(resourceFactor?.multiplier).toBeGreaterThan(1.15)
    expect(resourceFactor?.extraDays).toBeGreaterThan(0)
  })

  it('emits a factor contribution ledger and scope fingerprint for backend diagnostics', async () => {
    mocks.state.tasks = [{
      id: 'task-ledger',
      project_id: 'project-ledger',
      title: 'B2 12F exterior curtain wall install',
      planned_start_date: '2026-05-01',
      planned_end_date: '2026-05-20',
      actual_start_date: null,
      progress: 0,
      status: 'not_started',
      building_object_id: 'B2',
      floor_object_id: '12F',
      physical_zone_object_id: 'east',
      participant_unit_id: 'curtain-wall-team',
    }]
    mocks.state.conditions = [{
      id: 'condition-drawing',
      task_id: 'task-ledger',
      project_id: 'project-ledger',
      status: 'pending',
      is_satisfied: false,
      condition_type: 'drawing',
      blocking_level: 'hard',
      required_for_start: true,
      source_entity_type: 'drawing_package',
      source_entity_id: 'drawing-package-1',
      target_date: '2026-05-25',
      title: 'Curtain wall shop drawing approval',
    }]

    const context = await buildDurationContext({ taskId: 'task-ledger' })

    expect(context.calculationContext.scope_context).toEqual(expect.objectContaining({
      projectId: 'project-ledger',
      taskId: 'task-ledger',
      buildingObjectId: 'B2',
      floorObjectId: '12F',
      zoneObjectId: 'east',
      responsibleUnitId: 'curtain-wall-team',
    }))
    expect(context.calculationContext.factor_contribution_ledger).toEqual(expect.arrayContaining([
      expect.objectContaining({
        key: 'external_readiness',
        extraDays: expect.any(Number),
        actionPolicy: 'candidate_only',
        scopeFingerprint: expect.stringContaining('project-ledger'),
        contributionMode: 'multiplier',
        sourceEntityKeys: expect.arrayContaining(['drawing_package:drawing-package-1']),
      }),
    ]))
    expect(context.calculationContext.factor_contribution_ledger?.some((entry: any) => (
      entry.dedupeKey === 'external_readiness:drawing_package:drawing-package-1'
    ))).toBe(true)
    expect(context.calculationContext.input_coverage).toEqual(expect.objectContaining({
      task_conditions: true,
      drawing_package_schedule_impact: true,
    }))
    expect(context.calculationContext.readiness_graph).toEqual(expect.objectContaining({
      primaryFactorKey: 'external_readiness',
      rootCauseEntityKeys: expect.arrayContaining(['drawing_package:drawing-package-1']),
      scopeFingerprint: expect.stringContaining('project-ledger'),
    }))
    expect(context.calculationContext.causal_dedupe).toEqual(expect.objectContaining({
      policy: 'source_entity_scope_primary_cause',
      duplicateSourceEntityCount: 0,
    }))
  })

  it('regression: hold-style acceptance and curing tasks do not create progress velocity from low early progress', async () => {
    const acceptanceContext = await buildDurationContext({
      projectId: 'project-velocity-hold',
      taskTitle: 'fire acceptance waiting',
      standardWorkName: 'fire acceptance waiting',
      plannedStartDate: '2026-05-01',
      plannedEndDate: '2026-06-30',
      actualStartDate: '2026-05-01',
      progress: 20,
    })
    const curingContext = await buildDurationContext({
      projectId: 'project-velocity-hold',
      taskTitle: 'concrete curing wait',
      standardWorkName: 'curing wait',
      plannedStartDate: '2026-05-01',
      plannedEndDate: '2026-06-30',
      actualStartDate: '2026-05-01',
      progress: 18,
    })

    expect(acceptanceContext.factors.find((factor) => factor.key === 'progress_velocity')).toBeUndefined()
    expect(curingContext.factors.find((factor) => factor.key === 'progress_velocity')).toBeUndefined()
  })

  it('regression: slow front-heavy physical work still creates progress velocity pressure', async () => {
    const context = await buildDurationContext({
      projectId: 'project-velocity-front-heavy',
      taskTitle: '1F rebar binding',
      standardWorkName: 'rebar binding',
      plannedStartDate: '2026-05-01',
      plannedEndDate: '2026-06-10',
      actualStartDate: '2026-05-01',
      progress: 8,
    })
    const velocityFactor = context.factors.find((factor) => factor.key === 'progress_velocity')

    expect(velocityFactor).toEqual(expect.objectContaining({
      key: 'progress_velocity',
      actionPolicy: 'candidate_only',
      source: 'task_fact',
    }))
    expect(velocityFactor?.metadata).toEqual(expect.objectContaining({
      curve: 'front_heavy',
      profileReason: 'front_heavy_process',
    }))
    expect(Number(velocityFactor?.metadata?.progressDeficit ?? 0)).toBeGreaterThan(25)
    expect(velocityFactor?.multiplier).toBeGreaterThan(1.08)
  })

  it('regression: a single slow task without overlap stays low pressure for site capacity', async () => {
    mocks.state.resourceRecords[0].effectPolicy = {
      coldStartPolicy: 'candidate_only',
      actionPolicy: 'candidate_only',
      canAffectNewTaskReference: true,
      canAffectRemainingForecast: true,
      canExplainDeviation: true,
      canCreateRiskIssue: false,
    }
    mocks.state.tasks = [{
      id: 'task-single-slow',
      project_id: 'project-single-slow',
      title: '1F rebar binding',
      standard_work_name: 'rebar binding',
      planned_start_date: '2026-05-01',
      planned_end_date: '2026-05-20',
      actual_start_date: '2026-05-01',
      progress: 0,
      status: 'in_progress',
    }]

    const context = await buildDurationContext({ taskId: 'task-single-slow' })
    const resourceFactor = context.factors.find((factor) => factor.key === 'resource_conflict')

    expect(resourceFactor).toEqual(expect.objectContaining({
      actionPolicy: 'candidate_only',
      source: 'task_fact',
    }))
    expect(resourceFactor?.metadata).toEqual(expect.objectContaining({
      pressureLevel: 'low',
      executionProgressIsPrimaryEvidence: true,
      currentTaskProgressPressureOnly: true,
      hasOverlapOrCapacityContext: false,
      hasReadinessDurationEvidence: false,
      progressPressureCount: 1,
      sameResponsibleUnitCount: 0,
      sameResourceClassCount: 0,
    }))
    expect(resourceFactor?.multiplier).toBeLessThanOrEqual(1.04)
    expect(resourceFactor?.extraDays).toBe(0)
  })

  it('regression: unresolved resource readiness alone does not become duration impact without overlap or execution pressure', async () => {
    mocks.state.tasks = [{
      id: 'task-readiness-alone',
      project_id: 'project-readiness-alone',
      title: 'equipment readiness check',
      planned_start_date: '2026-05-10',
      planned_end_date: '2026-05-24',
      actual_start_date: '2026-05-10',
      progress: 85,
      status: 'in_progress',
    }]
    mocks.state.conditions = [{
      id: 'condition-readiness-alone',
      project_id: 'project-readiness-alone',
      task_id: 'task-readiness-alone',
      condition_type: 'equipment',
      status: 'pending',
      is_satisfied: false,
      target_date: '2026-05-01',
      created_at: '2026-05-01T00:00:00.000Z',
    }]

    const context = await buildDurationContext({ taskId: 'task-readiness-alone' })
    const resourceFactor = context.factors.find((factor) => factor.key === 'resource_conflict')

    expect(resourceFactor).toEqual(expect.objectContaining({
      actionPolicy: 'confidence_only',
      multiplier: 1,
      extraDays: 0,
    }))
    expect(resourceFactor?.metadata).toEqual(expect.objectContaining({
      pressureLevel: 'low',
      executionProgressIsPrimaryEvidence: false,
      hasOverlapOrCapacityContext: false,
      hasLongTermReadinessEvidence: true,
      hasReadinessDurationEvidence: false,
      hasResourceWindowDurationEvidence: false,
      durationImpactMode: 'resource_window_impact_only',
      resourceConditionCount: 1,
      progressPressureCount: 0,
    }))
  })

  it('regression: long-running readiness with overlap is bounded candidate pressure, not high pressure without execution evidence', async () => {
    mocks.state.resourceRecords[0].effectPolicy = {
      coldStartPolicy: 'candidate_only',
      actionPolicy: 'candidate_only',
      canAffectNewTaskReference: true,
      canAffectRemainingForecast: true,
      canExplainDeviation: true,
      canCreateRiskIssue: false,
    }
    mocks.state.resolvedResource = {
      resourceClass: 'general_crew',
      parallelCapacity: 'high',
      pressureDimensions: ['labor', 'workface'],
      __resolverSource: 'test_resource_seed',
    }
    mocks.state.tasks = [
      {
        id: 'task-readiness-overlap',
        project_id: 'project-readiness-overlap',
        title: '1F general installation current',
        standard_work_name: 'installation',
        participant_unit_id: 'unit-install',
        building_object_id: 'building-1',
        floor_object_id: 'floor-1',
        planned_start_date: '2026-05-10',
        planned_end_date: '2026-05-24',
        actual_start_date: '2026-05-10',
        progress: 85,
        status: 'in_progress',
      },
      {
        id: 'task-readiness-overlap-other',
        project_id: 'project-readiness-overlap',
        title: '1F general installation overlap',
        standard_work_name: 'installation',
        participant_unit_id: 'unit-install',
        building_object_id: 'building-1',
        floor_object_id: 'floor-1',
        planned_start_date: '2026-05-10',
        planned_end_date: '2026-05-24',
        actual_start_date: '2026-05-10',
        progress: 90,
        status: 'in_progress',
      },
    ]
    mocks.state.conditions = [{
      id: 'condition-readiness-overlap',
      project_id: 'project-readiness-overlap',
      task_id: 'task-readiness-overlap',
      condition_type: 'personnel',
      status: 'pending',
      is_satisfied: false,
      target_date: '2026-05-01',
      created_at: '2026-05-01T00:00:00.000Z',
    }]

    const context = await buildDurationContext({ taskId: 'task-readiness-overlap' })
    const resourceFactor = context.factors.find((factor) => factor.key === 'resource_conflict')

    expect(resourceFactor).toEqual(expect.objectContaining({
      actionPolicy: 'candidate_only',
      source: 'task_fact',
    }))
    expect(resourceFactor?.metadata).toEqual(expect.objectContaining({
      pressureLevel: 'medium',
      executionProgressIsPrimaryEvidence: false,
      hasOverlapOrCapacityContext: true,
      hasLongTermReadinessEvidence: true,
      hasReadinessDurationEvidence: true,
      hasResourceWindowDurationEvidence: true,
      durationImpactMode: 'conditional_duration_candidate',
      sameResponsibleUnitCount: 1,
      resourceConditionCount: 1,
      progressPressureCount: 0,
    }))
    expect(resourceFactor?.multiplier).toBeLessThanOrEqual(1.12)
    expect(resourceFactor?.extraDays).toBeGreaterThan(0)
  })

  it('regression: s-curve installation progress near the expected curve does not create velocity pressure', async () => {
    const context = await buildDurationContext({
      projectId: 'project-velocity-s-curve',
      taskTitle: 'ceiling installation',
      standardWorkName: 'ceiling installation',
      plannedStartDate: '2026-05-01',
      plannedEndDate: '2026-06-10',
      actualStartDate: '2026-05-01',
      progress: 45,
    })

    expect(context.factors.find((factor) => factor.key === 'progress_velocity')).toBeUndefined()
  })

  it('regression: s-curve installation that is truly slow still creates velocity pressure', async () => {
    const context = await buildDurationContext({
      projectId: 'project-velocity-s-curve',
      taskTitle: 'ceiling installation',
      standardWorkName: 'ceiling installation',
      plannedStartDate: '2026-05-01',
      plannedEndDate: '2026-06-10',
      actualStartDate: '2026-05-01',
      progress: 12,
    })
    const velocityFactor = context.factors.find((factor) => factor.key === 'progress_velocity')

    expect(velocityFactor).toEqual(expect.objectContaining({
      key: 'progress_velocity',
      actionPolicy: 'candidate_only',
      source: 'task_fact',
    }))
    expect(velocityFactor?.metadata).toEqual(expect.objectContaining({
      curve: 's_curve',
      profileReason: 's_curve_installation_or_fitout',
    }))
    expect(Number(velocityFactor?.metadata?.progressDeficit ?? 0)).toBeGreaterThan(25)
    expect(velocityFactor?.multiplier).toBeGreaterThan(1.08)
  })

  it('prefers task metadata cross-item workflow facts over workflow dictionary fallback', async () => {
    mocks.state.tasks = [{
      id: 'task-cross-item',
      project_id: 'project-1',
      title: 'masonry plaster follow-up',
      planned_start_date: '2026-05-20',
      planned_end_date: '2026-05-20',
      standard_work_code: 'masonry_infill_wall',
      standard_work_name: 'masonry infill wall',
      standard_task_metadata: {
        crossItemWorkflow: [
          {
            ruleCode: 'masonry_to_plaster_finish',
            dependencyType: 'FS',
            lagDays: 3,
            scopeRule: 'same_floor',
          },
        ],
      },
      progress: 20,
      is_executable: true,
      is_wbs_summary: false,
    }]
    mocks.resolveV1474WorkflowDictionary.mockResolvedValue({
      stableCode: 'masonry_to_plaster',
      dependencyType: 'FS',
      scopeHint: 'floor',
      confidence: 'medium',
      __resolverSource: 'ts_seed_fallback',
    })

    const context = await buildDurationContext({ taskId: 'task-cross-item' })
    const factor = context.factors.find((item) => item.key === 'workflow_sequence')

    expect(factor).toEqual(expect.objectContaining({
      source: 'task_fact',
      extraDays: 3,
      actionPolicy: 'auto_apply',
    }))
    expect(factor?.metadata).toMatchObject({
      stableCode: 'masonry_to_plaster_finish',
      dependencyType: 'FS',
      scopeHint: 'same_floor',
      workflowEvidenceSource: 'cross_item_workflow',
      resolverSource: 'task_metadata',
    })
    expect(mocks.resolveV1474WorkflowDictionary).toHaveBeenCalledTimes(0)
  })

  it('keeps workflow dictionary fallback out of runtime duration factors', async () => {
    mocks.state.tasks = [{
      id: 'task-workflow-dictionary',
      project_id: 'project-1',
      title: 'masonry plaster fallback',
      planned_start_date: '2026-05-20',
      planned_end_date: '2026-05-20',
      standard_work_code: 'masonry_infill_wall',
      standard_work_name: 'masonry infill wall',
      progress: 20,
      is_executable: true,
      is_wbs_summary: false,
    }]
    mocks.resolveWorkflowSequenceSignal.mockResolvedValue({
      stableCode: 'masonry_to_plaster',
      dependencyType: 'FS',
      scopeHint: 'floor',
      confidence: 'medium',
      runtimeRole: 'recognition_signal',
      governanceTarget: 'workflow_dictionary',
      keywordFallbackOnly: true,
      canCreateDependencies: false,
      defaultLagDays: 4,
      lagDays: 4,
      __resolverSource: 'ts_seed_fallback',
    })

    const context = await buildDurationContext({ taskId: 'task-workflow-dictionary' })
    const factor = context.factors.find((item) => item.key === 'workflow_sequence')

    expect(factor).toBeUndefined()
    expect(mocks.resolveV1475CrossItemWorkflow).toHaveBeenCalledTimes(1)
    expect(mocks.resolveWorkflowSequenceSignal).toHaveBeenCalledTimes(0)
    expect(mocks.resolveV1474WorkflowDictionary).toHaveBeenCalledTimes(0)
  })

  it('uses building pattern depth as workflow sequencing context', async () => {
    mocks.resolveV1474BuildingPatternMatch.mockResolvedValue({
      patternCode: 'high_rise_core_and_floor_cycle',
      record: {
        patternCode: 'high_rise_core_and_floor_cycle',
        patternRole: 'phase_mode',
        patternPriority: 74,
        controlChains: [
          {
            chainCode: 'core_wall_floor_cycle',
            steps: ['core wall', 'slab formwork', 'rebar', 'concrete', 'curing'],
            gates: ['floor_readiness'],
            resultSignal: 'duration_context',
          },
        ],
        durationCurveProfile: {
          curveCode: 'standard_floor_cycle',
          positionBasis: 'floor',
          tailUnitBias: 'higher',
        },
      },
      matchScore: 180,
      confidenceScore: 82,
      confidenceLevel: 'high',
      matchedSignals: ['control_chain', 'duration_curve_profile'],
      missingSignals: [],
      actionPolicy: 'backend_consume',
    })

    const context = await buildDurationContext({
      projectId: 'project-1',
      taskTitle: '2#楼标准层混凝土浇筑',
      buildingObjectId: 'building-2',
      floorObjectId: 'floor-12',
      standardWorkCode: '02-01-03-P04',
      standardWorkName: '混凝土浇筑',
    })
    const factor = context.factors.find((item) => item.key === 'workflow_sequence')

    expect(factor).toEqual(expect.objectContaining({
      source: 'v1.4.7.4_seed',
      extraDays: 1,
      actionPolicy: 'auto_apply',
    }))
    expect(factor?.metadata).toMatchObject({
      buildingPatternCode: 'high_rise_core_and_floor_cycle',
      buildingPatternConfidence: 82,
      buildingPatternActionPolicy: 'backend_consume',
      buildingPatternRole: 'phase_mode',
      buildingPatternPriority: 74,
      controlChainCount: 1,
      durationCurveProfile: expect.objectContaining({
        curveCode: 'standard_floor_cycle',
        tailUnitBias: 'higher',
      }),
    })
    expect(mocks.resolveV1474BuildingPatternMatch).toHaveBeenCalledWith(
      expect.stringContaining('2#楼标准层混凝土浇筑'),
      expect.objectContaining({
        standardWorkCode: '02-01-03-P04',
        standardWorkCodes: ['02-01-03-P04'],
        scopeDimensions: expect.arrayContaining(['building', 'floor']),
        rhythmDrivers: expect.arrayContaining(['floor_count', 'building_count']),
        primaryWorkfaceType: 'standard_floor',
        phaseWindow: 'superstructure',
        expansionStrategy: 'floor_ordered',
      }),
    )
  })

  it('applies project baseline_factor only from a governed runtime publication', async () => {
    mocks.loadPublishedProgressVelocityRuntime.mockImplementation(async (input: { consumerKey?: string }) => (
      input.consumerKey === 'durationContextProjectBaselineCalibrationFactorService.published_velocity'
        ? publishedVelocity(1.067)
        : null
    ))

    const context = await buildDurationContext({
      projectId: 'project-baseline',
      taskId: 'task-current',
      taskTitle: 'interior fitout',
      plannedStartDate: '2026-05-21',
      plannedEndDate: '2026-05-30',
    })
    const factor = context.factors.find((item) => item.key === 'project_baseline_calibration')

    expect(factor).toEqual(expect.objectContaining({
      key: 'project_baseline_calibration',
      source: 'project_history',
      actionPolicy: 'auto_apply',
      multiplier: 1.067,
      dataDependencies: ['algorithm_learnable_parameter_runtime_publications'],
    }))
    expect(factor?.metadata).toEqual(expect.objectContaining({
      baselineFactor: 1.067,
      sampleCount: 50,
      targetAccuracy: '+/-5%',
      calibrationLayer: 'published_project_baseline_factor',
      runtimeAuthority: 'published_parameter_only',
      rawSampleConsumption: false,
    }))
    expect(context.calculationContext).toEqual(expect.objectContaining({
      project_baseline_factor: 1.067,
      project_baseline_calibration_applied: true,
    }))
  })

  it('applies controlled productivity compensation from mature project evidence to reduce systemic low-P bias', async () => {
    mocks.resolveV1474SeasonalProductivity.mockResolvedValue({
      productivity: 0.8,
      confidence: 'high',
      __resolverSource: 'test_seasonal_seed',
    })
    mocks.state.durationExperienceSamples = Array.from({ length: 60 }, (_, index) => ({
      id: `sample-fast-${index + 1}`,
      project_id: 'project-compensation',
      task_id: `finished-fast-${index + 1}`,
      planned_duration: 10,
      actual_duration: 8,
      sample_status: 'active',
      included_in_benchmark: true,
      sample_strength: 'strong',
      confidence_level: 'high',
      duration_calibration_source: 'project_history_sample',
      completed_at: `2026-03-${String((index % 28) + 1).padStart(2, '0')}T00:00:00.000Z`,
      metadata: {},
    }))
    mocks.state.projectDailySnapshot = Array.from({ length: 100 }, (_, index) => ({
      project_id: 'project-compensation',
      snapshot_date: new Date(Date.UTC(2026, 0, index + 1)).toISOString().slice(0, 10),
      overall_progress: index,
      delay_days: Math.max(0, 45 - index),
      active_obstacle_count: Math.max(0, 8 - Math.floor(index / 10)),
      pending_condition_count: Math.max(0, 6 - Math.floor(index / 12)),
      active_risk_count: Math.max(0, 5 - Math.floor(index / 20)),
    }))

    const context = await buildDurationContext({
      projectId: 'project-compensation',
      taskId: 'task-compensation',
      taskTitle: 'facade work',
      plannedStartDate: '2026-05-21',
      plannedEndDate: '2026-05-30',
    })
    const factor = context.factors.find((item) => item.key === 'productivity_compensation')

    expect(factor).toEqual(expect.objectContaining({
      key: 'productivity_compensation',
      source: 'project_history',
      actionPolicy: 'auto_apply',
    }))
    expect(factor?.multiplier).toBeLessThan(1)
    expect(factor?.metadata).toEqual(expect.objectContaining({
      maturityTier: 'mature_90d',
      productivityUplift: expect.any(Number),
      adjustedProductivity: expect.any(Number),
    }))
    expect(context.calculationContext).toEqual(expect.objectContaining({
      productivity_compensation_applied: true,
      productivity_compensation_factor: factor?.multiplier,
    }))
  })

  describe('cross-rule synthesis contracts', () => {
    it('keeps a single seasonal productivity hit as the baseline multiplier contract', async () => {
      mocks.resolveProjectClimateRegion.mockResolvedValue({
        regionCode: 'hot_summer_cold_winter',
        thermalZone: 'hot_summer_cold_winter',
        confidence: 'high',
        rainySeasonMonths: [5, 6, 7],
        floodSeasonMonths: [5, 6, 7],
      })
      mocks.resolveV1474SeasonalProductivity.mockResolvedValue({
        productivity: 0.93,
        climateSignal: 'rainy_season',
        confidence: 'high',
        __resolverSource: 'test_seasonal_seed',
      })
      mocks.loadProjectWeatherImpactSignalsWithDiagnostics.mockResolvedValue({ signals: [], sourceStatus: 'ok' })

      const context = await buildDurationContext({
        projectId: 'project-seasonal-only',
        taskTitle: 'site general works',
        plannedStartDate: '2026-06-10',
        plannedEndDate: '2026-06-19',
      })
      const factor = context.factors.find((item) => item.key === 'seasonal_productivity')

      expect(factor).toEqual(expect.objectContaining({
        multiplier: expect.closeTo(1 / 0.93, 3),
        actionPolicy: 'auto_apply',
      }))
      const applied = context.factors.filter((item) => item.actionPolicy !== 'confidence_only')
      const expectedRawMultiplier = Number(applied
        .reduce((value, item) => value * Math.max(0.4, Math.min(5, item.multiplier || 1)), 1)
        .toFixed(3))

      expect(context.factors.map((item) => item.key)).toEqual(['seasonal_productivity', 'productivity_compensation'])
      expect(context.calculationContext.raw_multiplier).toBeCloseTo(expectedRawMultiplier, 3)
      expect(context.multiplier).toBeCloseTo(expectedRawMultiplier, 3)
      expect(context.extraDays).toBe(0)
    })

    it('multiplies seasonal and process factors without weather contribution in the two-rule baseline', async () => {
      mocks.resolveProjectClimateRegion.mockResolvedValue({
        regionCode: 'hot_summer_cold_winter',
        thermalZone: 'hot_summer_cold_winter',
        confidence: 'high',
        rainySeasonMonths: [5, 6, 7],
      })
      mocks.resolveV1474SeasonalProductivity.mockResolvedValue({
        productivity: 0.93,
        climateSignal: 'rainy_season',
        confidence: 'high',
        __resolverSource: 'test_seasonal_seed',
      })
      mocks.resolveV1474ProcessSeasonalSensitivity.mockResolvedValue({
        stableCode: 'external_insulation_rain_window',
        productivityMultiplier: 0.9,
        sensitivityReason: 'rainy_season',
        impactBand: 'rain_blocks_work',
        confidence: 'high',
        __resolverSource: 'test_process_seed',
      })
      mocks.loadProjectWeatherImpactSignalsWithDiagnostics.mockResolvedValue({ signals: [], sourceStatus: 'ok' })

      const context = await buildDurationContext({
        projectId: 'project-seasonal-process',
        taskTitle: 'external insulation',
        standardWorkCode: 'external_insulation',
        plannedStartDate: '2026-06-10',
        plannedEndDate: '2026-06-19',
      })
      const byKey = Object.fromEntries(context.factors.map((factor) => [factor.key, factor]))
      const expectedRawMultiplier = Number((1 / 0.9).toFixed(3))

      expect(byKey.seasonal_productivity?.multiplier).toBeCloseTo(1 / 0.93, 3)
      expect(byKey.process_seasonal_sensitivity?.multiplier).toBeCloseTo(1 / 0.9, 3)
      expect(byKey.weather_forecast_impact).toBeUndefined()
      expect(byKey.pm_recovery_compensation).toBeUndefined()
      expect(context.calculationContext.raw_multiplier).toBeCloseTo(expectedRawMultiplier, 3)
      expect(context.multiplier).toBeCloseTo(expectedRawMultiplier, 3)
    })

    it('accounts for seasonal, process and medium weather overlap once instead of double-counting the rain signal', async () => {
      mocks.resolveProjectClimateRegion.mockResolvedValue({
        regionCode: 'hot_summer_cold_winter',
        thermalZone: 'hot_summer_cold_winter',
        confidence: 'high',
        rainySeasonMonths: [5, 6, 7, 8, 9],
        floodSeasonMonths: [6, 7, 8, 9],
        highTempMonths: [7, 8],
        coldWeatherMonths: [11, 12, 1, 2],
      })
      mocks.resolveV1474SeasonalProductivity.mockResolvedValue({
        productivity: 0.93,
        climateSignal: 'rainy_season',
        confidence: 'high',
        __resolverSource: 'test_seasonal_seed',
      })
      mocks.resolveV1474ProcessSeasonalSensitivity.mockResolvedValue({
        stableCode: 'exterior_rain_window',
        productivityMultiplier: 0.9,
        sensitivityReason: 'rainy_season',
        impactBand: 'rain_blocks_work',
        confidence: 'high',
        __resolverSource: 'test_process_seed',
      })
      const signals = [{
        impactType: 'heavy_rain',
        climateSignal: 'rainy_season',
        severity: 'medium',
        actionPolicy: 'candidate_only',
        multiplier: 1.08,
        confidenceDelta: -8,
        reason: 'Medium rain overlaps the static rainy-season process rule.',
        evidence: { provider: 'test_weather' },
      }]
      mocks.loadProjectWeatherImpactSignalsWithDiagnostics.mockResolvedValue({ signals, sourceStatus: 'ok' })

      const context = await buildDurationContext({
        projectId: 'project-cross-rain-medium',
        taskTitle: 'external insulation coating',
        standardWorkCode: 'external_insulation',
        standardWorkName: 'external insulation coating',
        plannedStartDate: '2026-06-18',
        plannedEndDate: '2026-06-27',
      })

      const factors = Object.fromEntries(context.factors.map((factor) => [factor.key, factor]))
      expect(factors.seasonal_productivity?.multiplier).toBeCloseTo(1 / 0.93, 3)
      expect(factors.process_seasonal_sensitivity?.multiplier).toBeCloseTo(1 / 0.9, 3)
      expect(factors.weather_forecast_impact).toEqual(expect.objectContaining({
        actionPolicy: 'candidate_only',
        multiplier: expect.closeTo(1.02, 3),
      }))
      expect(factors.weather_forecast_impact?.metadata).toEqual(expect.objectContaining({
        weatherStaticCoupling: expect.objectContaining({
          overlapPolicy: 'medium_weather_fact_dampened_because_static_season_already_counted',
          rawWeatherMultiplier: expect.closeTo(1.111, 3),
          dampenedWeatherMultiplier: expect.closeTo(1.02, 3),
        }),
      }))

      const expectedCommittedMultiplier = Number((1 / 0.9).toFixed(3))
      const expectedCandidateMultiplier = Number((1 / 0.9).toFixed(3))
      expect(context.calculationContext.raw_multiplier).toBeCloseTo(expectedCommittedMultiplier, 3)
      expect(context.multiplier).toBeCloseTo(expectedCommittedMultiplier, 3)
      expect(candidateScenario(context).rawMultiplier).toBeCloseTo(expectedCandidateMultiplier, 3)
      expect(context.calculationContext).toEqual(expect.objectContaining({
      climate_applied_factor_count: 1,
        climate_cap_applied: false,
        pm_recovery_applied: false,
      }))
    })

    it('keeps seasonal, process and high weather factors mutually exclusive in duration synthesis', async () => {
      mocks.resolveProjectClimateRegion.mockResolvedValue({
        regionCode: 'hot_summer_cold_winter',
        thermalZone: 'hot_summer_cold_winter',
        confidence: 'high',
        rainySeasonMonths: [5, 6, 7, 8, 9],
        floodSeasonMonths: [6, 7, 8, 9],
        highTempMonths: [7, 8],
        coldWeatherMonths: [11, 12, 1, 2],
      })
      mocks.resolveV1474SeasonalProductivity.mockResolvedValue({
        productivity: 0.95,
        climateSignal: 'rainy_season',
        confidence: 'high',
        __resolverSource: 'test_seasonal_seed',
      })
      mocks.resolveV1474ProcessSeasonalSensitivity.mockResolvedValue({
        stableCode: 'roof_waterproof_rain_high',
        productivityMultiplier: 0.85,
        sensitivityReason: 'rainy_season',
        impactBand: 'rain_blocks_work',
        confidence: 'high',
        __resolverSource: 'test_process_seed',
      })
      const signals = [{
        impactType: 'heavy_rain',
        climateSignal: 'rainy_season',
        severity: 'high',
        actionPolicy: 'candidate_only',
        multiplier: 1.14,
        confidenceDelta: -12,
        reason: 'High rain is forecast in the work window.',
        evidence: { provider: 'test_weather' },
      }]
      mocks.loadProjectWeatherImpactSignalsWithDiagnostics.mockResolvedValue({ signals, sourceStatus: 'ok' })

      const context = await buildDurationContext({
        projectId: 'project-cross-rain-high',
        taskTitle: 'roof waterproof',
        standardWorkCode: 'roof_waterproof',
        plannedStartDate: '2026-06-18',
        plannedEndDate: '2026-06-27',
      })

      const factors = Object.fromEntries(context.factors.map((factor) => [factor.key, factor]))
      expect(factors.weather_forecast_impact).toEqual(expect.objectContaining({
        actionPolicy: 'candidate_only',
        multiplier: expect.closeTo(1.176, 3),
      }))
      expect(factors.weather_forecast_impact?.metadata).toEqual(expect.objectContaining({
        weatherStaticCoupling: expect.objectContaining({
          overlapPolicy: 'no_static_weather_dampening',
        }),
      }))

      const expectedCommittedMultiplier = Number((1 / 0.85).toFixed(3))
      const expectedCandidateMultiplier = Number((1 / 0.85).toFixed(3))
      expect(context.calculationContext.raw_multiplier).toBeCloseTo(expectedCommittedMultiplier, 3)
      expect(context.multiplier).toBeCloseTo(expectedCommittedMultiplier, 3)
      expect(candidateScenario(context).rawMultiplier).toBeCloseTo(expectedCandidateMultiplier, 3)
      expect(context.calculationContext).toEqual(expect.objectContaining({
        climate_applied_factor_count: 1,
        climate_cap_applied: false,
        pm_recovery_applied: false,
      }))
    })

    it('multiplies winter seasonal, process and high cold-weather factors without PM recovery', async () => {
      mocks.resolveProjectClimateRegion.mockResolvedValue({
        regionCode: 'cold_winter',
        thermalZone: 'cold_winter',
        confidence: 'high',
        coldWeatherMonths: [12, 1, 2],
      })
      mocks.resolveV1474SeasonalProductivity.mockResolvedValue({
        productivity: 0.97,
        climateSignal: 'winter_low_temp',
        confidence: 'high',
        __resolverSource: 'test_seasonal_seed',
      })
      mocks.resolveV1474ProcessSeasonalSensitivity.mockResolvedValue({
        stableCode: 'winter_concrete_low_temp',
        productivityMultiplier: 0.92,
        sensitivityReason: 'winter_low_temp',
        impactBand: 'cold_weather_work',
        confidence: 'high',
        __resolverSource: 'test_process_seed',
      })
      const signals = [{
        impactType: 'cold_wave',
        climateSignal: 'winter_low_temp',
        severity: 'high',
        actionPolicy: 'candidate_only',
        multiplier: 1.1,
        confidenceDelta: -8,
        reason: 'High cold-weather signal is active.',
        evidence: { provider: 'test_weather' },
      }]
      mocks.loadProjectWeatherImpactSignalsWithDiagnostics.mockResolvedValue({ signals, sourceStatus: 'ok' })

      const context = await buildDurationContext({
        projectId: 'project-winter-cold',
        taskTitle: 'winter concrete works',
        standardWorkCode: 'winter_concrete',
        plannedStartDate: '2026-01-10',
        plannedEndDate: '2026-01-19',
      })
      const byKey = Object.fromEntries(context.factors.map((factor) => [factor.key, factor]))
      const expectedCommittedMultiplier = Number((1 / 0.92).toFixed(3))
      const expectedCandidateMultiplier = 1.1

      expect(byKey.seasonal_productivity?.multiplier).toBeCloseTo(1 / 0.97, 3)
      expect(byKey.process_seasonal_sensitivity?.multiplier).toBeCloseTo(1 / 0.92, 3)
      expect(byKey.weather_forecast_impact?.multiplier).toBeCloseTo(1.1, 3)
      expect(byKey.pm_recovery_compensation).toBeUndefined()
      expect(context.calculationContext.raw_multiplier).toBeCloseTo(expectedCommittedMultiplier, 3)
      expect(context.multiplier).toBeCloseTo(expectedCommittedMultiplier, 3)
      expect(candidateScenario(context).rawMultiplier).toBeCloseTo(expectedCandidateMultiplier, 3)
    })

    it('does not compensate Spring Festival shutdown when calendar, process and cold weather stack', async () => {
      mocks.resolveProjectClimateRegion.mockResolvedValue({
        regionCode: 'cold_winter',
        thermalZone: 'cold_winter',
        confidence: 'high',
        coldWeatherMonths: [1, 2],
      })
      mocks.resolveV1474SeasonalProductivity.mockResolvedValue({
        productivity: 0.97,
        climateSignal: 'winter_low_temp',
        confidence: 'high',
        __resolverSource: 'test_seasonal_seed',
      })
      mocks.resolveV1474HolidayWindow.mockResolvedValue({
        holidayCode: 'spring_festival_2026',
        holidayName: 'Spring Festival',
        calendarKind: 'spring_festival_remobilization',
        productivity: 0.42,
        __resolverSource: 'test_calendar_seed',
      })
      mocks.resolveV1474ProcessSeasonalSensitivity.mockResolvedValue({
        stableCode: 'winter_process_after_festival',
        productivityMultiplier: 0.92,
        sensitivityReason: 'winter_low_temp',
        impactBand: 'cold_weather_work',
        confidence: 'high',
        __resolverSource: 'test_process_seed',
      })
      const signals = [{
        impactType: 'cold_wave',
        climateSignal: 'winter_low_temp',
        severity: 'high',
        actionPolicy: 'candidate_only',
        multiplier: 1.1,
        confidenceDelta: -8,
        reason: 'Cold wave during restart window.',
        evidence: { provider: 'test_weather' },
      }]
      mocks.loadProjectWeatherImpactSignalsWithDiagnostics.mockResolvedValue({ signals, sourceStatus: 'ok' })

      const context = await buildDurationContext({
        projectId: 'project-spring-festival-stack',
        taskTitle: 'post festival restart concrete works',
        standardWorkCode: 'winter_concrete',
        plannedStartDate: '2026-02-18',
        plannedEndDate: '2026-02-27',
      })
      const byKey = Object.fromEntries(context.factors.map((factor) => [factor.key, factor]))
      const expectedCommittedMultiplier = Number((1 / 0.42).toFixed(3))
      const expectedCandidateMultiplier = Number((1 / 0.42).toFixed(3))

      expect(byKey.seasonal_productivity).toEqual(expect.objectContaining({
        actionPolicy: 'auto_apply',
        multiplier: expect.closeTo(1 / 0.42, 3),
      }))
      expect(byKey.seasonal_productivity?.metadata).toEqual(expect.objectContaining({
        holidayCode: 'spring_festival_2026',
        calendarKind: 'spring_festival_remobilization',
      }))
      expect(byKey.process_seasonal_sensitivity?.multiplier).toBeCloseTo(1 / 0.92, 3)
      expect(byKey.weather_forecast_impact?.multiplier).toBeCloseTo(1.1, 3)
      expect(byKey.pm_recovery_compensation).toBeUndefined()
      expect(context.calculationContext.raw_multiplier).toBeCloseTo(expectedCommittedMultiplier, 3)
      expect(context.multiplier).toBeCloseTo(expectedCommittedMultiplier, 3)
      expect(candidateScenario(context).rawMultiplier).toBeCloseTo(expectedCandidateMultiplier, 3)
      expect(candidateScenario(context).multiplier).toBeCloseTo(expectedCandidateMultiplier, 3)
    })

    it('sums multi-rule extraDays first and then applies the planned-duration cap once', async () => {
      mocks.state.resourceRecords[0].effectPolicy = {
        coldStartPolicy: 'candidate_only',
        actionPolicy: 'candidate_only',
        minSamplesForActiveMode: 0,
        canAffectNewTaskReference: true,
        canAffectRemainingForecast: true,
        canExplainDeviation: true,
        canCreateRiskIssue: false,
      }
      mocks.state.tasks = [
        {
          id: 'task-extra-days-cap',
          project_id: 'project-extra-days-cap',
          title: '1F wall plastering',
          standard_work_name: 'wall plastering',
          participant_unit_id: 'unit-fitout',
          building_object_id: 'building-1',
          floor_object_id: 'floor-1',
          planned_start_date: '2026-05-01',
          planned_end_date: '2026-05-10',
          actual_start_date: '2026-05-01',
          progress: 1,
          status: 'in_progress',
        },
        {
          id: 'task-extra-days-overlap',
          project_id: 'project-extra-days-cap',
          title: '1F wall plastering overlap',
          standard_work_name: 'wall plastering',
          participant_unit_id: 'unit-fitout',
          building_object_id: 'building-1',
          floor_object_id: 'floor-1',
          planned_start_date: '2026-05-01',
          planned_end_date: '2026-05-10',
          actual_start_date: '2026-05-01',
          progress: 8,
          status: 'in_progress',
        },
      ]
      mocks.state.conditions = [{
        id: 'condition-material-delay',
        project_id: 'project-extra-days-cap',
        task_id: 'task-extra-days-cap',
        condition_type: 'material',
        source_type: 'project_material',
        source_ref_id: 'material-delay',
        required_for_start: true,
        blocking_level: 'hard',
        status: 'pending',
        is_satisfied: false,
        target_date: '2026-05-01',
        created_at: '2026-05-01T00:00:00.000Z',
      }]
      mocks.state.materials = [{
        id: 'material-delay',
        project_id: 'project-extra-days-cap',
        expected_arrival_date: '2026-05-30',
        actual_arrival_date: null,
        record_status: 'active',
      }]
      const weatherSignals = [{
        impactType: 'site_shutdown_event',
        climateSignal: 'red_rainstorm',
        severity: 'high',
        actionPolicy: 'candidate_only',
        multiplier: 1,
        confidenceDelta: -15,
        reason: 'Site shutdown event.',
        siteShutdownEvent: { shutdownDays: 5, eventType: 'red_rainstorm' },
        evidence: { provider: 'test_weather' },
      }]
      mocks.loadProjectWeatherImpactSignalsWithDiagnostics.mockResolvedValue({ signals: weatherSignals, sourceStatus: 'ok' })
      mocks.resolveV1474BuildingPatternMatches.mockResolvedValue([{
        patternCode: 'high_rise_core_and_floor_cycle',
        record: {
          patternCode: 'high_rise_core_and_floor_cycle',
          patternRole: 'phase_mode',
          durationCurveProfile: { tailUnitBias: 'higher' },
        },
        matchScore: 180,
        confidenceScore: 86,
        confidenceLevel: 'high',
        matchedSignals: ['duration_curve_profile'],
        missingSignals: [],
        actionPolicy: 'backend_consume',
      }])

      const context = await buildDurationContext({ taskId: 'task-extra-days-cap' })
      const byKey = Object.fromEntries(context.factors.map((factor) => [factor.key, factor]))

      expect(byKey.weather_forecast_impact?.extraDays).toBe(5)
      expect(byKey.external_readiness?.extraDays).toBeGreaterThan(0)
      expect(byKey.resource_conflict?.extraDays).toBeGreaterThan(0)
      expect(byKey.workflow_sequence?.extraDays).toBe(1)
      expect(context.calculationContext.raw_extra_days).toBe(1)
      expect(context.extraDays).toBe(1)
      expect(candidateScenario(context).rawExtraDays).toBeGreaterThan(7)
      expect(candidateScenario(context).extraDays).toBe(7)
      expect(context.calculationContext).toEqual(expect.objectContaining({
        extra_days_cap: 7,
        extra_days_cap_policy: 'planned_duration_dynamic_segment_cap',
        extra_days_cap_applied: false,
      }))
    })

    it('adds progress finishing drag and external readiness extraDays before applying the cap', async () => {
      mocks.state.tasks = [{
        id: 'task-progress-external-extra',
        project_id: 'project-progress-external-extra',
        title: 'finishing closeout',
        planned_start_date: '2026-04-01',
        planned_end_date: '2026-05-10',
        actual_start_date: '2026-04-01',
        progress: 92,
        status: 'in_progress',
      }]
      mocks.state.conditions = [{
        id: 'condition-material-late',
        project_id: 'project-progress-external-extra',
        task_id: 'task-progress-external-extra',
        condition_type: 'project_material',
        source_type: 'project_material',
        source_ref_id: 'material-late',
        status: 'pending',
        is_satisfied: false,
        required_for_start: false,
        blocking_level: 'soft',
      }]
      mocks.state.materials = [{
        id: 'material-late',
        project_id: 'project-progress-external-extra',
        expected_arrival_date: '2026-05-25',
        actual_arrival_date: null,
        record_status: 'active',
      }]

      const context = await buildDurationContext({ taskId: 'task-progress-external-extra' })
      const byKey = Object.fromEntries(context.factors.map((factor) => [factor.key, factor]))
      const rawExtraDays = (context.calculationContext.factor_contribution_ledger ?? [])
        .filter((factor: any) => factor.actionPolicy !== 'confidence_only')
        .reduce((sum: number, factor: any) => sum + Math.max(0, Number(factor.extraDays ?? 0)), 0)

      expect(byKey.progress_velocity).toEqual(expect.objectContaining({
        actionPolicy: 'candidate_only',
        extraDays: 7,
      }))
      expect(byKey.external_readiness).toEqual(expect.objectContaining({
        actionPolicy: 'candidate_only',
        extraDays: 21,
      }))
      expect(candidateScenario(context).rawExtraDays).toBe(rawExtraDays)
      expect(rawExtraDays).toBeGreaterThanOrEqual(21)
      expect(context.calculationContext.raw_extra_days).toBe(0)
      expect(context.extraDays).toBe(0)
      expect(candidateScenario(context).extraDays).toBe(21)
      expect(context.calculationContext).toEqual(expect.objectContaining({
        extra_days_cap: 28,
        extra_days_cap_policy: 'planned_duration_dynamic_segment_cap',
        extra_days_cap_applied: false,
      }))
    })

    it('keeps material earliest-start calendar days in the same extraDays ledger before cap', async () => {
      mocks.state.tasks = [{
        id: 'task-material-unit-mix',
        project_id: 'project-material-unit-mix',
        title: 'ceiling installation',
        planned_start_date: '2026-05-01',
        planned_end_date: '2026-05-10',
        progress: 0,
        status: 'todo',
      }]
      mocks.state.conditions = [{
        id: 'condition-material-far',
        project_id: 'project-material-unit-mix',
        task_id: 'task-material-unit-mix',
        condition_type: 'project_material',
        source_type: 'project_material',
        source_ref_id: 'material-far',
        status: 'pending',
        is_satisfied: false,
        required_for_start: false,
        blocking_level: 'soft',
      }]
      mocks.state.materials = [{
        id: 'material-far',
        project_id: 'project-material-unit-mix',
        expected_arrival_date: '2026-05-31',
        actual_arrival_date: null,
        record_status: 'active',
      }]

      const context = await buildDurationContext({ taskId: 'task-material-unit-mix' })
      const readinessFactor = context.factors.find((factor) => factor.key === 'external_readiness')
      const rawExtraDays = context.factors.reduce((sum, factor) => sum + Math.max(0, factor.extraDays), 0)

      expect(readinessFactor).toEqual(expect.objectContaining({
        actionPolicy: 'candidate_only',
        extraDays: 21,
      }))
      expect(readinessFactor?.metadata).toEqual(expect.objectContaining({
        materialStartDelayDays: 30,
        materialExtraDaysCap: 21,
      }))
      expect(candidateScenario(context).rawExtraDays).toBe(rawExtraDays)
      expect(rawExtraDays).toBeGreaterThanOrEqual(21)
      expect(context.calculationContext.raw_extra_days).toBe(0)
      expect(context.extraDays).toBe(0)
      expect(candidateScenario(context).extraDays).toBe(7)
      expect(context.calculationContext).toEqual(expect.objectContaining({
        extra_days_cap: 7,
        extra_days_cap_policy: 'planned_duration_dynamic_segment_cap',
        extra_days_cap_applied: false,
      }))
    })

    it('caps summary confidenceDelta while preserving raw additive confidence evidence', async () => {
      mocks.detectProgressAnomalySignals.mockReturnValue([
        {
          code: 'progress_jump',
          severity: 'critical',
          summary: 'Progress jumped sharply.',
          confidenceAction: 'confidence_only',
          excludedFromVelocityLearning: true,
          acknowledged: false,
          metadata: { progress_delta: 80 },
        },
        {
          code: 'snapshot_gap',
          severity: 'high',
          summary: 'Progress snapshot is stale.',
          confidenceAction: 'confidence_only',
          excludedFromVelocityLearning: true,
          acknowledged: false,
          metadata: { days_since_last_snapshot: 20 },
        },
      ])
      mocks.state.tasks = [{
        id: 'task-confidence-stack',
        project_id: 'project-confidence-stack',
        title: 'progress quality task',
        planned_start_date: '2026-05-01',
        planned_end_date: '2026-05-20',
        progress: 80,
        status: 'in_progress',
      }]
      mocks.state.progressSnapshots = [
        { task_id: 'task-confidence-stack', progress: 5, snapshot_date: '2026-05-18', created_at: '2026-05-18T08:00:00Z' },
        { task_id: 'task-confidence-stack', progress: 80, snapshot_date: '2026-05-20', created_at: '2026-05-20T08:00:00Z' },
      ]
      mocks.state.conditions = [{
        id: 'condition-soft',
        project_id: 'project-confidence-stack',
        task_id: 'task-confidence-stack',
        condition_type: 'coordination',
        blocking_level: 'soft',
        status: 'pending',
        is_satisfied: false,
        created_at: '2026-05-01T00:00:00.000Z',
      }]
      const weatherSignals = [{
        impactType: 'thunderstorm',
        climateSignal: 'thunderstorm',
        severity: 'medium',
        actionPolicy: 'confidence_only',
        multiplier: 1,
        confidenceDelta: -12,
        reason: 'Thunderstorm safety signal.',
        evidence: { provider: 'test_weather' },
      }]
      mocks.loadProjectWeatherImpactSignalsWithDiagnostics.mockResolvedValue({ signals: weatherSignals, sourceStatus: 'ok' })
      mocks.resolveV1474ProcessSeasonalSensitivity.mockResolvedValue({
        stableCode: 'thunderstorm_safety_signal',
        productivityMultiplier: 1,
        sensitivityReason: 'thunderstorm',
        impactBand: 'thunderstorm_safety',
        confidence: 'high',
        __resolverSource: 'test_process_seed',
      })

      const context = await buildDurationContext({ taskId: 'task-confidence-stack' })
      const byKey = Object.fromEntries(context.factors.map((factor) => [factor.key, factor]))

      expect(byKey.progress_quality).toEqual(expect.objectContaining({
        actionPolicy: 'confidence_only',
        confidenceDelta: -20,
      }))
      expect(byKey.external_readiness).toEqual(expect.objectContaining({
        actionPolicy: 'confidence_only',
        confidenceDelta: -3,
      }))
      expect(byKey.weather_forecast_impact).toEqual(expect.objectContaining({
        actionPolicy: 'confidence_only',
        confidenceDelta: -12,
      }))
      const rawConfidenceDelta = context.factors.reduce((sum, factor) => sum + factor.confidenceDelta, 0)

      expect(rawConfidenceDelta).toBeLessThan(-25)
      expect(context.rawConfidenceDelta).toBe(rawConfidenceDelta)
      expect(context.confidenceDelta).toBe(-30)
      expect(context.calculationContext.raw_confidence_delta).toBe(rawConfidenceDelta)
      expect(context.calculationContext.confidence_delta_cap).toEqual(expect.objectContaining({
        min: -30,
        max: 20,
      }))
      expect(context.calculationContext.confidence_delta_cap_applied).toBe(true)
      expect(context.hasLowConfidenceSignal).toBe(true)
      expect(context.multiplier).toBe(1)
      expect(context.calculationContext.raw_extra_days).toBe(context.extraDays)
    })

    it('preserves per-factor action policies so downstream consumers can apply policy-specific rules', async () => {
      mocks.state.resourceRecords[0].effectPolicy = {
        coldStartPolicy: 'observation_only',
        actionPolicy: 'candidate_only',
        minSamplesForActiveMode: 99,
        canAffectNewTaskReference: true,
        canAffectRemainingForecast: true,
        canExplainDeviation: true,
        canCreateRiskIssue: false,
      }
      mocks.state.tasks = [{
        id: 'task-policy-stack',
        project_id: 'project-policy-stack',
        title: 'fitout coordination',
        standard_work_name: 'fitout',
        planned_start_date: '2026-05-01',
        planned_end_date: '2026-05-20',
        actual_start_date: '2026-05-01',
        progress: 2,
        status: 'in_progress',
      }]
      mocks.state.conditions = [{
        id: 'condition-drawing',
        project_id: 'project-policy-stack',
        task_id: 'task-policy-stack',
        condition_type: 'drawing',
        source_type: 'drawing',
        required_for_start: true,
        blocking_level: 'hard',
        status: 'pending',
        is_satisfied: false,
        created_at: '2026-05-01T00:00:00.000Z',
      }]
      mocks.state.obstacles = [{
        id: 'obstacle-equipment',
        project_id: 'project-policy-stack',
        task_id: 'task-policy-stack',
        obstacle_type: 'equipment',
        status: 'open',
        severity: 'high',
        created_at: '2026-05-01T00:00:00.000Z',
      }]
      const weatherSignals = [{
        impactType: 'heavy_rain',
        climateSignal: 'rainy_season',
        severity: 'high',
        actionPolicy: 'candidate_only',
        multiplier: 1.14,
        confidenceDelta: -12,
        reason: 'High rain is forecast.',
        evidence: { provider: 'test_weather' },
      }]
      mocks.loadProjectWeatherImpactSignalsWithDiagnostics.mockResolvedValue({ signals: weatherSignals, sourceStatus: 'ok' })

      const context = await buildDurationContext({ taskId: 'task-policy-stack' })
      const policies = Object.fromEntries(context.factors.map((factor) => [factor.key, factor.actionPolicy]))

      expect(policies.external_readiness).toBe('candidate_only')
      expect(policies.progress_velocity).toBe('candidate_only')
      expect(policies.weather_forecast_impact).toBe('candidate_only')
      expect(policies.resource_conflict).toBe('confidence_only')
      expect(context.factors.find((factor) => factor.key === 'resource_conflict')).toEqual(expect.objectContaining({
        multiplier: 1,
        extraDays: 0,
      }))
      expect(context.adjustedBy).toEqual([])
      expect(context.multiplier).toBe(1)
      expect(context.extraDays).toBe(0)
      expect(context.calculationContext.committed_duration_context).toEqual(expect.objectContaining({
        policy: 'auto_apply_only',
        multiplier: 1,
        extraDays: 0,
        adjustedBy: [],
      }))
      expect(context.calculationContext.candidate_duration_context).toEqual(expect.objectContaining({
        policy: 'auto_apply_plus_candidate_only',
        factorKeys: expect.arrayContaining(['external_readiness', 'weather_forecast_impact', 'progress_velocity']),
      }))
      expect(Number((context.calculationContext.candidate_duration_context as any).multiplier)).toBeGreaterThan(1)
    })

    it('keeps online task progress velocity separate from raw-sample learning in the request path', async () => {
      mocks.buildProjectProgressVelocityLearning.mockResolvedValueOnce({
        durationRatio: 1.22,
        multiplier: 1.22,
        confidenceLevel: 'high',
        confidenceScore: 86,
        confidenceDelta: 4,
        actionPolicy: 'auto_apply',
        sampleCount: 9,
        variance: 0.06,
        groupKey: 'standard_work:wall_plastering',
        excludedAnomalyTaskCount: 0,
        reason: 'Similar completed tasks are slower than planned.',
        metadata: { matchLevel: 'standard_work' },
      })
      mocks.state.tasks = [{
        id: 'task-history-velocity-boundary',
        project_id: 'project-history-velocity-boundary',
        title: 'wall plastering',
        standard_work_code: 'wall_plastering',
        engineering_category_id: 'cat-finishing',
        planned_start_date: '2026-05-01',
        planned_end_date: '2026-05-10',
        actual_start_date: '2026-05-01',
        progress: 35,
        status: 'in_progress',
      }]

      const context = await buildDurationContext({ taskId: 'task-history-velocity-boundary' })
      const velocityFactor = context.factors.find((factor) => factor.key === 'progress_velocity')

      expect(velocityFactor).toEqual(expect.objectContaining({
        source: 'task_fact',
        actionPolicy: 'candidate_only',
        metadata: expect.objectContaining({
          actualStartSource: 'actual_start_date',
          progress: 35,
        }),
      }))
      expect(mocks.buildProjectProgressVelocityLearning).not.toHaveBeenCalled()
      expect(context.adjustedBy).toEqual([])
      expect(context.multiplier).toBe(1)
      expect(context.calculationContext.committed_duration_context).toEqual(expect.objectContaining({
        policy: 'auto_apply_only',
        multiplier: 1,
        adjustedBy: [],
      }))
      expect(context.calculationContext.candidate_duration_context).toEqual(expect.objectContaining({
        policy: 'auto_apply_plus_candidate_only',
        factorKeys: expect.arrayContaining(['progress_velocity']),
      }))
      expect(Number((context.calculationContext.candidate_duration_context as any).multiplier)).toBeGreaterThan(1.2)
    })

    it('keeps weather, seasonal and process policies explicit when candidate factors mix with auto-applied process rules', async () => {
      mocks.resolveProjectClimateRegion.mockResolvedValue({
        regionCode: 'cold_winter',
        thermalZone: 'cold_winter',
        confidence: 'high',
        coldWeatherMonths: [1, 2],
      })
      mocks.resolveV1474SeasonalProductivity.mockResolvedValue({
        productivity: 0.98,
        climateSignal: 'winter_low_temp',
        confidence: 'high',
        __resolverSource: 'test_seasonal_seed',
      })
      mocks.resolveV1474HolidayWindow.mockResolvedValue({
        holidayCode: 'spring_festival_2026',
        holidayName: 'Spring Festival',
        calendarKind: 'spring_festival_remobilization',
        productivity: 0.7,
        __resolverSource: 'test_calendar_seed',
      })
      mocks.resolveV1474ProcessSeasonalSensitivity.mockResolvedValue({
        stableCode: 'winter_candidate_process',
        productivityMultiplier: 0.92,
        sensitivityReason: 'winter_low_temp',
        impactBand: 'cold_weather_work',
        confidence: 'high',
        __resolverSource: 'test_process_seed',
      })
      const signals = [{
        impactType: 'cold_wave',
        climateSignal: 'winter_low_temp',
        severity: 'high',
        actionPolicy: 'candidate_only',
        multiplier: 1.1,
        confidenceDelta: -8,
        reason: 'Cold weather candidate.',
        evidence: { provider: 'test_weather' },
      }]
      mocks.loadProjectWeatherImpactSignalsWithDiagnostics.mockResolvedValue({ signals, sourceStatus: 'ok' })

      const context = await buildDurationContext({
        projectId: 'project-candidate-tier',
        taskTitle: 'restart facade work',
        standardWorkCode: 'winter_facade',
        plannedStartDate: '2026-02-18',
        plannedEndDate: '2026-02-27',
      })
      const policies = Object.fromEntries(context.factors.map((factor) => [factor.key, factor.actionPolicy]))

      expect(policies.seasonal_productivity).toBe('auto_apply')
      expect(policies.process_seasonal_sensitivity).toBe('auto_apply')
      expect(policies.weather_forecast_impact).toBe('candidate_only')
      expect(context.calculationContext.raw_multiplier).toBeCloseTo(context.multiplier, 3)
      expect(context.adjustedBy).toEqual(['seasonal_productivity', 'process_seasonal_sensitivity'])
      expect(context.calculationContext.candidate_duration_context).toEqual(expect.objectContaining({
        factorKeys: ['seasonal_productivity'],
      }))
    })

    it('applies productivity compensation against weather penalties while preserving progress pressure', async () => {
      mocks.resolveProjectClimateRegion.mockResolvedValue({
        regionCode: 'hot_summer_cold_winter',
        thermalZone: 'hot_summer_cold_winter',
        confidence: 'high',
        rainySeasonMonths: [6, 7],
      })
      mocks.resolveV1474SeasonalProductivity.mockResolvedValue({
        productivity: 0.86,
        climateSignal: 'rainy_season',
        confidence: 'high',
        __resolverSource: 'test_seasonal_seed',
      })
      mocks.state.tasks = [{
        id: 'task-compensation-progress',
        project_id: 'project-compensation-progress',
        title: 'facade installation',
        standard_work_name: 'facade installation',
        planned_start_date: '2026-04-01',
        planned_end_date: '2026-06-30',
        actual_start_date: '2026-04-01',
        progress: 5,
        status: 'in_progress',
      }]
      mocks.state.durationExperienceSamples = Array.from({ length: 60 }, (_, index) => ({
        id: `sample-comp-${index + 1}`,
        project_id: 'project-compensation-progress',
        task_id: `finished-comp-${index + 1}`,
        planned_duration: 10,
        actual_duration: 8,
        sample_status: 'active',
        included_in_benchmark: true,
        sample_strength: 'strong',
        confidence_level: 'high',
        completed_at: `2026-03-${String((index % 28) + 1).padStart(2, '0')}T00:00:00.000Z`,
      }))
      mocks.state.projectDailySnapshot = Array.from({ length: 100 }, (_, index) => ({
        project_id: 'project-compensation-progress',
        snapshot_date: new Date(Date.UTC(2026, 0, index + 1)).toISOString().slice(0, 10),
        overall_progress: index,
        delay_days: Math.max(0, 50 - index),
        active_obstacle_count: Math.max(0, 10 - Math.floor(index / 10)),
        pending_condition_count: Math.max(0, 8 - Math.floor(index / 12)),
        active_risk_count: Math.max(0, 4 - Math.floor(index / 20)),
      }))

      const context = await buildDurationContext({ taskId: 'task-compensation-progress' })
      const byKey = Object.fromEntries(context.factors.map((factor) => [factor.key, factor]))

      expect(byKey.seasonal_productivity?.multiplier).toBeCloseTo(1 / 0.86, 3)
      expect(byKey.progress_velocity).toEqual(expect.objectContaining({
        actionPolicy: 'candidate_only',
      }))
      expect(byKey.progress_velocity?.multiplier).toBeGreaterThan(1)
      expect(byKey.productivity_compensation).toEqual(expect.objectContaining({
        actionPolicy: 'auto_apply',
      }))
      expect(byKey.productivity_compensation?.multiplier).toBeLessThan(1)
      expect(context.calculationContext.raw_multiplier).toBeCloseTo(
        Number(context.factors
          .filter((factor) => factor.actionPolicy === 'auto_apply')
          .reduce((value, factor) => value * Math.max(0.4, Math.min(5, factor.multiplier || 1)), 1)
          .toFixed(3)),
        3,
      )
    })

    it('limits auto productivity compensation while an active plum-rain work window is still present', async () => {
      mocks.resolveProjectClimateRegion.mockResolvedValue({
        regionCode: 'hot_summer_cold_winter',
        thermalZone: 'hot_summer_cold_winter',
        confidence: 'high',
        rainySeasonMonths: [5, 6, 7],
        floodSeasonMonths: [6, 7, 8],
      })
      mocks.resolveV1474SeasonalProductivity.mockResolvedValue({
        productivity: 0.8,
        climateSignal: 'rainy_season',
        confidence: 'high',
        __resolverSource: 'test_seasonal_seed',
      })
      mocks.resolveV1474ProcessSeasonalSensitivity.mockResolvedValue(null)
      mocks.loadProjectWeatherImpactSignalsWithDiagnostics.mockResolvedValue({ sourceStatus: 'ok', signals: [] })
      mocks.state.tasks = [{
        id: 'task-active-plum-rain-compensation',
        project_id: 'project-active-plum-rain-compensation',
        title: 'exterior coating plum rain persistent humidity',
        standard_work_code: 'exterior_coating',
        standard_work_name: 'exterior coating',
        planned_start_date: '2026-06-10',
        planned_end_date: '2026-06-24',
        actual_start_date: '2026-06-10',
        progress: 55,
        status: 'in_progress',
      }]
      mocks.state.durationExperienceSamples = Array.from({ length: 90 }, (_, index) => ({
        id: `sample-plum-rain-${index + 1}`,
        project_id: 'project-active-plum-rain-compensation',
        task_id: `historical-plum-rain-${index + 1}`,
        planned_duration: 10,
        actual_duration: 8,
        sample_status: 'active',
        included_in_benchmark: true,
        sample_strength: 'strong',
        confidence_level: 'high',
        completed_at: `2026-03-${String((index % 28) + 1).padStart(2, '0')}T00:00:00.000Z`,
      }))
      mocks.state.projectDailySnapshot = Array.from({ length: 100 }, (_, index) => ({
        project_id: 'project-active-plum-rain-compensation',
        snapshot_date: new Date(Date.UTC(2026, 0, index + 1)).toISOString().slice(0, 10),
        overall_progress: index,
        delay_days: Math.max(0, 55 - index),
        active_obstacle_count: Math.max(0, 10 - Math.floor(index / 10)),
        pending_condition_count: Math.max(0, 8 - Math.floor(index / 12)),
        active_risk_count: Math.max(0, 4 - Math.floor(index / 20)),
      }))

      const context = await buildDurationContext({ taskId: 'task-active-plum-rain-compensation' })
      const compensation = context.factors.find((factor) => factor.key === 'productivity_compensation')

      expect(compensation).toEqual(expect.objectContaining({
        actionPolicy: 'auto_apply',
        metadata: expect.objectContaining({
          weatherWindowCompensationGuard: expect.objectContaining({
            reason: 'active_rain_window_compensation_limited',
            maxAdjustedProductivity: 0.82,
          }),
        }),
      }))
      expect(context.multiplier).toBeGreaterThanOrEqual(1 / 0.82)
    })

    it('keeps candidate-only duration pressure out of committed synthesis while exposing a candidate scenario', async () => {
      mocks.resolveV1474SeasonalProductivity.mockResolvedValue({
        productivity: 0.9,
        climateSignal: 'rainy_season',
        confidence: 'high',
        __resolverSource: 'test_seasonal_seed',
      })
      mocks.state.tasks = [{
        id: 'task-candidate-boundary',
        project_id: 'project-candidate-boundary',
        title: 'facade work candidate boundary',
        planned_start_date: '2026-05-01',
        planned_end_date: '2026-05-10',
        actual_start_date: '2026-05-01',
        progress: 5,
        status: 'in_progress',
      }]
      mocks.state.conditions = [{
        id: 'condition-candidate-boundary',
        project_id: 'project-candidate-boundary',
        task_id: 'task-candidate-boundary',
        condition_type: 'drawing',
        source_entity_type: 'drawing_package',
        source_entity_id: 'drawing-boundary',
        required_for_start: true,
        blocking_level: 'hard',
        status: 'pending',
        is_satisfied: false,
        target_date: '2026-05-20',
      }]

      const context = await buildDurationContext({ taskId: 'task-candidate-boundary' })

      expect(context.factors.find((factor) => factor.key === 'external_readiness')).toEqual(expect.objectContaining({
        actionPolicy: 'candidate_only',
        extraDays: expect.any(Number),
      }))
      expect(context.multiplier).toBeCloseTo(1 / 0.9, 3)
      expect(context.extraDays).toBe(0)
      expect(context.adjustedBy).toEqual(['seasonal_productivity'])
      expect(context.calculationContext.committed_duration_context).toEqual(expect.objectContaining({
        policy: 'auto_apply_only',
        multiplier: context.multiplier,
        extraDays: 0,
        factorKeys: ['seasonal_productivity'],
      }))
      expect(context.calculationContext.candidate_duration_context).toEqual(expect.objectContaining({
        policy: 'auto_apply_plus_candidate_only',
        factorKeys: expect.arrayContaining(['seasonal_productivity', 'external_readiness', 'progress_velocity']),
      }))
      expect(Number((context.calculationContext.candidate_duration_context as any).multiplier)).toBeGreaterThan(context.multiplier)
    })

    it('suppresses productivity compensation when PM recovery compensation is present in the candidate scenario', async () => {
      mocks.resolveV1474SeasonalProductivity.mockResolvedValue({
        productivity: 0.88,
        climateSignal: 'rainy_season',
        confidence: 'high',
        __resolverSource: 'test_seasonal_seed',
      })
      mocks.loadProjectWeatherImpactSignalsWithDiagnostics.mockResolvedValue({
        sourceStatus: 'ok',
        signals: [{
          impactType: 'heavy_rain',
          climateSignal: 'rainy_season',
          severity: 'medium',
          actionPolicy: 'candidate_only',
          multiplier: 1.08,
          confidenceDelta: -8,
          reason: 'Rain pressure.',
        }],
      })
      mocks.state.tasks = [{
        id: 'task-compensation-mutex',
        project_id: 'project-compensation-mutex',
        title: 'rainy facade mature catchup',
        planned_start_date: '2026-05-01',
        planned_end_date: '2026-05-20',
        actual_start_date: '2026-05-01',
        progress: 5,
        status: 'in_progress',
      }]
      mocks.state.conditions = [{
        id: 'condition-compensation-mutex',
        project_id: 'project-compensation-mutex',
        task_id: 'task-compensation-mutex',
        condition_type: 'drawing',
        blocking_level: 'hard',
        status: 'pending',
        is_satisfied: false,
        created_at: '2026-05-01T00:00:00.000Z',
      }]
      mocks.state.durationExperienceSamples = Array.from({ length: 60 }, (_, index) => ({
        id: `sample-compensation-mutex-${index}`,
        project_id: 'project-compensation-mutex',
        task_id: `historical-compensation-mutex-${index}`,
        planned_duration: 10,
        actual_duration: 8,
        sample_status: 'active',
        included_in_benchmark: true,
        completed_at: `2026-04-${String(Math.min(index + 1, 28)).padStart(2, '0')}`,
        sample_strength: 'strong',
        confidence_level: 'high',
      }))
      mocks.state.projectDailySnapshot = Array.from({ length: 90 }, (_, index) => ({
        project_id: 'project-compensation-mutex',
        snapshot_date: new Date(Date.UTC(2026, 0, index + 1)).toISOString().slice(0, 10),
        overall_progress: index,
        delay_days: Math.max(0, 60 - index),
        active_obstacle_count: Math.max(0, 10 - Math.floor(index / 8)),
        pending_condition_count: Math.max(0, 8 - Math.floor(index / 10)),
      }))
      mocks.loadPublishedProgressVelocityRuntime.mockImplementation(async (input: { consumerKey?: string }) => (
        input.consumerKey === 'durationContextPmRecoveryCompensationFactorService.published_velocity'
          ? publishedVelocity()
          : null
      ))

      const context = await buildDurationContext({ taskId: 'task-compensation-mutex' })
      const byKey = Object.fromEntries(context.factors.map((factor) => [factor.key, factor]))

      expect(byKey.pm_recovery_compensation).toEqual(expect.objectContaining({
        actionPolicy: 'candidate_only',
      }))
      expect(byKey.productivity_compensation).toEqual(expect.objectContaining({
        actionPolicy: 'confidence_only',
        multiplier: 1,
        metadata: expect.objectContaining({
          suppressedByCompensationMutex: 'pm_recovery_compensation',
          compensationMutexPolicy: 'pm_recovery_candidate_owns_local_recovery_candidate_path',
        }),
      }))
      expect(context.calculationContext.compensation_mutex).toEqual(expect.objectContaining({
        applied: true,
        suppressedFactorKey: 'productivity_compensation',
        primaryFactorKey: 'pm_recovery_compensation',
      }))
    })

    it('exposes building-pattern weighted cycle context alongside schedule-state acceleration without stacking duplicate delays', async () => {
      mocks.state.tasks = [{
        id: 'task-building-schedule-stack',
        project_id: 'project-building-schedule-stack',
        title: '12F standard floor concrete casting',
        standard_work_code: '02-01-03-P04',
        standard_work_name: 'concrete casting',
        building_object_id: 'building-2',
        floor_object_id: 'floor-12',
        planned_start_date: '2026-05-01',
        planned_end_date: '2026-05-10',
        progress: 0,
        status: 'not_started',
      }]
      mocks.state.projectScheduleStates = [{
        project_id: 'project-building-schedule-stack',
        scope_type: 'floor_group',
        scope_id: 'floor-12',
        state: 'accelerating',
        confidence_score: 0.82,
        window_days: 14,
        window_start_date: '2026-05-01',
        window_end_date: '2026-05-14',
        local_acceleration_factor: 0.9,
        throughput_ratio: 1.25,
        parallel_density_ratio: 0.95,
        deviation_recovery_days: 2,
        evidence: [{ code: 'standard_floor_rhythm_throughput_up', label: 'standard floor rhythm up', weight: 2 }],
        downstream_policy: {
          canAdjustRemainingDuration: true,
          canExplainDeviation: true,
          canRelaxResourceConflictPenalty: true,
          velocityFactorSupersedes: false,
          resourceConflictPenaltyMultiplier: 0.6,
          localAccelerationFactor: 0.9,
          maxForwardDays: 7,
          confidenceOnly: false,
          actionPolicy: 'candidate_only',
        },
        metrics: {
          standardFloorThroughputRatio: 1.25,
          criticalPathThroughputRatio: 1,
          milestoneThroughputRatio: 1,
        },
      }]
      mocks.resolveV1474BuildingPatternMatches.mockResolvedValue([{
        patternCode: 'high_rise_core_and_floor_cycle',
        record: {
          patternCode: 'high_rise_core_and_floor_cycle',
          patternRole: 'phase_mode',
          patternPriority: 74,
          durationCurveProfile: {
            curveCode: 'standard_floor_cycle',
            positionBasis: 'floor',
            tailUnitBias: 'higher',
          },
        },
        matchScore: 180,
        confidenceScore: 88,
        confidenceLevel: 'high',
        matchedSignals: ['duration_curve_profile'],
        missingSignals: [],
        actionPolicy: 'backend_consume',
        weightedTypicalCycleDays: {
          firstFloor: 9,
          midFloors: 7.5,
          lastFloors: 8.5,
        },
        durationProfileContributions: [{ patternCode: 'high_rise_core_and_floor_cycle', weight: 1 }],
      } as any])

      const context = await buildDurationContext({ taskId: 'task-building-schedule-stack' })
      const workflowFactor = context.factors.find((factor) => factor.key === 'workflow_sequence')
      const scheduleFactor = context.factors.find((factor) => factor.key === 'project_schedule_state')

      expect(workflowFactor).toEqual(expect.objectContaining({
        extraDays: 1,
        actionPolicy: 'auto_apply',
      }))
      expect(scheduleFactor).toEqual(expect.objectContaining({
        multiplier: 0.9,
        actionPolicy: 'candidate_only',
        confidenceDelta: 2,
      }))
      expect(context.calculationContext).toEqual(expect.objectContaining({
        building_pattern_weighted_mid_floor_days: 7.5,
        project_schedule_state: 'accelerating',
        project_schedule_state_factor: 0.9,
        raw_extra_days: 1,
        extra_days_cap_applied: false,
      }))
      expect(context.calculationContext.building_pattern_weighted_cycle_days).toEqual(expect.objectContaining({
        firstFloor: 9,
        midFloors: 7.5,
        lastFloors: 8.5,
      }))
      expect(context.multiplier).toBeCloseTo(context.calculationContext.raw_multiplier as number, 3)
      expect(context.extraDays).toBe(1)
    })

    it('keeps ledgers explainable when all major rule families contribute together', async () => {
      mocks.state.resourceRecords[0].effectPolicy = {
        coldStartPolicy: 'candidate_only',
        actionPolicy: 'candidate_only',
        minSamplesForActiveMode: 0,
        canAffectNewTaskReference: true,
        canAffectRemainingForecast: true,
        canExplainDeviation: true,
        canCreateRiskIssue: false,
      }
      mocks.resolveProjectClimateRegion.mockResolvedValue({
        regionCode: 'hot_summer_cold_winter',
        thermalZone: 'hot_summer_cold_winter',
        confidence: 'high',
        rainySeasonMonths: [5, 6, 7],
      })
      mocks.resolveV1474SeasonalProductivity.mockResolvedValue({
        productivity: 0.9,
        climateSignal: 'rainy_season',
        confidence: 'high',
        __resolverSource: 'test_seasonal_seed',
      })
      mocks.resolveV1474ProcessSeasonalSensitivity.mockResolvedValue({
        stableCode: 'extreme_rain_process',
        productivityMultiplier: 0.88,
        sensitivityReason: 'rainy_season',
        impactBand: 'rain_blocks_work',
        confidence: 'high',
        __resolverSource: 'test_process_seed',
      })
      mocks.resolveV1474ProcessConstraint.mockResolvedValue({
        stableCode: 'extreme_process_constraint',
        constraintType: 'curing_wait',
        applicationMode: 'edge_lag',
        impactMode: 'duration_lookup',
        runtimeActionPolicy: 'confidence_only',
        timeSourcePolicy: 'standard_work_duration_seed_only',
        durationLookupPolicy: 'route_to_standard_work_duration_seed',
        durationLookupKeys: ['curing_wait_reference'],
        carrierProcessHints: ['curing wait'],
        durationAuthorityPolicy: 'no_duration_values_in_process_constraint',
        startAfterPercent: 100,
        scopeGranularity: 'zone',
        gateRequired: false,
        relationInputPolicy: 'requires_existing_relation',
        dependencyCreationPolicy: 'never_create_dependency',
        parallelAllowedPolicy: 'parallel_allowed_is_no_edge_not_overlap',
        supportedRelationKinds: ['hard_sequence', 'soft_sequence', 'acceptance_gate', 'dependency_intent', 'explicit_task_dependency'],
        durationDoubleCountPolicy: 'standard_work_duration_owns_all_day_values_process_constraint_owns_edge_routing',
        relationshipScope: 'same_parent_or_cross_scope_edge',
        confidence: 'high',
        __resolverSource: 'test_constraint_seed',
      })
      mocks.detectProgressAnomalySignals.mockReturnValue([{
        code: 'snapshot_gap',
        severity: 'critical',
        summary: 'Snapshot stale.',
        confidenceAction: 'confidence_only',
        excludedFromVelocityLearning: true,
        acknowledged: false,
        metadata: {},
      }])
      const weatherSignals = [{
        impactType: 'site_shutdown_event',
        climateSignal: 'red_rainstorm',
        severity: 'high',
        actionPolicy: 'candidate_only',
        multiplier: 1,
        confidenceDelta: -15,
        reason: 'Red rainstorm shutdown.',
        siteShutdownEvent: { shutdownDays: 5, eventType: 'red_rainstorm' },
        evidence: { provider: 'test_weather' },
      }]
      mocks.loadProjectWeatherImpactSignalsWithDiagnostics.mockResolvedValue({ signals: weatherSignals, sourceStatus: 'ok' })
      mocks.state.tasks = [
        {
          id: 'task-extreme-stack',
          project_id: 'project-extreme-stack',
          title: 'external facade finishing',
          standard_work_name: 'facade finishing',
          standard_work_code: 'facade_finish',
          building_object_id: 'building-1',
          floor_object_id: 'floor-8',
          physical_zone_object_id: 'zone-east',
          participant_unit_id: 'unit-facade',
          planned_start_date: '2026-05-01',
          planned_end_date: '2026-05-10',
          actual_start_date: '2026-05-01',
          progress: 91,
          status: 'in_progress',
        },
        {
          id: 'task-extreme-overlap',
          project_id: 'project-extreme-stack',
          title: 'external facade overlap',
          standard_work_name: 'facade finishing',
          standard_work_code: 'facade_finish',
          building_object_id: 'building-1',
          floor_object_id: 'floor-8',
          physical_zone_object_id: 'zone-east',
          participant_unit_id: 'unit-facade',
          planned_start_date: '2026-05-01',
          planned_end_date: '2026-05-10',
          actual_start_date: '2026-05-01',
          progress: 5,
          status: 'in_progress',
        },
      ]
      mocks.state.conditions = [{
        id: 'condition-extreme',
        project_id: 'project-extreme-stack',
        task_id: 'task-extreme-stack',
        condition_type: 'drawing',
        source_type: 'drawing',
        required_for_start: true,
        blocking_level: 'hard',
        status: 'pending',
        is_satisfied: false,
        created_at: '2026-05-01T00:00:00.000Z',
      }]
      mocks.state.obstacles = [{
        id: 'obstacle-extreme',
        project_id: 'project-extreme-stack',
        task_id: 'task-extreme-stack',
        obstacle_type: 'equipment',
        status: 'open',
        severity: 'critical',
        created_at: '2026-05-01T00:00:00.000Z',
      }]
      mocks.state.materials = [{
        id: 'material-extreme',
        project_id: 'project-extreme-stack',
        linked_task_id: 'task-extreme-stack',
        expected_arrival_date: '2026-06-30',
        actual_arrival_date: null,
        record_status: 'active',
      }]
      mocks.state.progressSnapshots = [
        { task_id: 'task-extreme-stack', progress: 5, snapshot_date: '2026-05-01', created_at: '2026-05-01T08:00:00Z' },
        { task_id: 'task-extreme-stack', progress: 91, snapshot_date: '2026-05-20', created_at: '2026-05-20T08:00:00Z' },
      ]
      mocks.resolveV1474BuildingPatternMatches.mockResolvedValue([{
        patternCode: 'high_rise_core_and_floor_cycle',
        record: {
          patternCode: 'high_rise_core_and_floor_cycle',
          patternRole: 'phase_mode',
          durationCurveProfile: { tailUnitBias: 'higher' },
        },
        matchScore: 180,
        confidenceScore: 88,
        confidenceLevel: 'high',
        matchedSignals: ['duration_curve_profile'],
        missingSignals: [],
        actionPolicy: 'backend_consume',
        weightedTypicalCycleDays: { firstFloor: 9, midFloors: 7.5, lastFloors: 8.5 },
        durationProfileContributions: [{ patternCode: 'high_rise_core_and_floor_cycle', weight: 1 }],
      } as any])

      const context = await buildDurationContext({ taskId: 'task-extreme-stack' })
      const keys = new Set<string>(context.factors.map((factor) => factor.key))
      const effectiveLedger = context.calculationContext.factor_contribution_ledger ?? []
      const committedApplied = effectiveLedger.filter((factor: any) => factor.actionPolicy === 'auto_apply')
      const expectedRawMultiplier = Number((context.calculationContext.committed_duration_context as any)?.rawMultiplier ?? 1)
      const expectedRawExtraDays = committedApplied.reduce((sum: number, factor: any) => sum + Math.max(0, factor.extraDays), 0)
      const expectedRawConfidenceDelta = effectiveLedger.reduce((sum: number, factor: any) => sum + factor.confidenceDelta, 0)

      ;[
        'seasonal_productivity',
        'process_seasonal_sensitivity',
        'weather_forecast_impact',
        'process_constraint',
        'external_readiness',
        'resource_conflict',
        'progress_velocity',
        'progress_quality',
        'workflow_sequence',
      ].forEach((key) => {
        expect(keys.has(key), key).toBe(true)
      })
      expect(context.calculationContext.raw_multiplier).toBeCloseTo(expectedRawMultiplier, 3)
      expect(context.multiplier).toBeCloseTo(expectedRawMultiplier, 3)
      expect(context.calculationContext.raw_extra_days).toBe(expectedRawExtraDays)
      expect(candidateScenario(context).rawExtraDays).toBeGreaterThanOrEqual(expectedRawExtraDays)
      expect(context.extraDays).toBe(1)
      expect(candidateScenario(context).extraDays).toBe(candidateScenario(context).rawExtraDays)
      expect(context.calculationContext.extra_days_cap_applied).toBe(expectedRawExtraDays > context.extraDays)
      expect(context.rawConfidenceDelta).toBe(expectedRawConfidenceDelta)
      expect(context.confidenceDelta).toBe(-30)
      expect(context.calculationContext.confidence_delta_cap_applied).toBe(true)
      expect(context.adjustedBy).toEqual(committedApplied
        .filter((factor: any) => !['deduped_secondary', 'interference_secondary'].includes(factor.contributionMode))
        .slice(0, 3)
        .map((factor: any) => factor.key))
      expect(context.businessReasons).toEqual(context.factors.slice(0, 3).map((factor) => factor.reason))
    })

    it('applies causal dedupe to synthesis while preserving secondary factors for explainability', async () => {
      mocks.state.resourceRecords[0].effectPolicy = {
        coldStartPolicy: 'candidate_only',
        actionPolicy: 'candidate_only',
        minSamplesForActiveMode: 0,
        canAffectNewTaskReference: true,
        canAffectRemainingForecast: true,
        canExplainDeviation: true,
        canCreateRiskIssue: false,
      }
      mocks.state.tasks = [{
        id: 'task-dedupe-current',
        project_id: 'project-dedupe',
        title: 'facade panel installation',
        standard_work_name: 'facade panel installation',
        planned_start_date: '2026-05-01',
        planned_end_date: '2026-05-10',
        actual_start_date: '2026-05-01',
        progress: 5,
        status: 'in_progress',
      }]
      mocks.state.conditions = [{
        id: 'condition-material-dedupe',
        project_id: 'project-dedupe',
        task_id: 'task-dedupe-current',
        condition_type: 'material',
        source_entity_type: 'project_material',
        source_entity_id: 'material-dedupe-1',
        source_ref_id: 'material-dedupe-1',
        required_for_start: true,
        blocking_level: 'hard',
        status: 'pending',
        is_satisfied: false,
        target_date: '2026-05-30',
        created_at: '2026-05-01T00:00:00.000Z',
      }]
      mocks.state.materials = [{
        id: 'material-dedupe-1',
        project_id: 'project-dedupe',
        linked_task_id: 'task-dedupe-current',
        expected_arrival_date: '2026-05-30',
        actual_arrival_date: null,
        record_status: 'active',
      }]

      const context = await buildDurationContext({ taskId: 'task-dedupe-current' })
      const readiness = context.factors.find((factor) => factor.key === 'external_readiness')
      const resource = context.factors.find((factor) => factor.key === 'resource_conflict')
      const fullRawExtraDays = context.factors
        .filter((factor) => factor.actionPolicy !== 'confidence_only')
        .reduce((sum, factor) => sum + Math.max(0, factor.extraDays), 0)

      expect(readiness?.extraDays).toBeGreaterThan(0)
      expect(resource?.extraDays).toBeGreaterThan(0)
      expect(context.calculationContext.causal_dedupe).toEqual(expect.objectContaining({
        appliedToSynthesis: true,
        duplicateSourceEntityKeys: expect.arrayContaining(['project_material:material-dedupe-1']),
        suppressedFactorKeys: expect.arrayContaining(['resource_conflict']),
      }))
      expect(context.calculationContext.factor_contribution_ledger).toEqual(expect.arrayContaining([
        expect.objectContaining({
          key: 'resource_conflict',
          contributionMode: 'interference_secondary',
          suppressedByFactorKey: 'external_readiness',
          interferenceRelation: 'causal',
        }),
      ]))
      expect(candidateScenario(context).rawExtraDays).toBeLessThan(fullRawExtraDays)
      const effectiveResource = context.calculationContext.factor_contribution_ledger
        ?.find((entry: any) => entry.key === 'resource_conflict')
      expect(effectiveResource?.extraDays).toBe(0)
      expect(candidateScenario(context).rawExtraDays).toBeGreaterThanOrEqual(readiness?.extraDays ?? 0)
      expect(context.calculationContext.raw_extra_days).toBe(0)
      expect(context.extraDays).toBe(0)
      expect(candidateScenario(context).extraDays).toBe(candidateScenario(context).extraDaysCap)
    })

    it('exposes weighted schedule-state composition instead of only the effective scope', async () => {
      mocks.state.projectScheduleStates = [
        {
          project_id: 'project-compose',
          scope_type: 'project',
          scope_id: 'project',
          state: 'normal',
          confidence_score: 0.72,
          window_days: 14,
          window_end_date: '2026-05-20',
          throughput_ratio: 1.02,
          parallel_density_ratio: 1,
          deviation_recovery_days: 0,
          evidence: [],
          downstream_policy: {
            canAdjustRemainingDuration: false,
            canExplainDeviation: true,
            canRelaxResourceConflictPenalty: false,
            velocityFactorSupersedes: false,
            resourceConflictPenaltyMultiplier: 1,
            localAccelerationFactor: null,
            maxForwardDays: 0,
            confidenceOnly: true,
            actionPolicy: 'confidence_only',
          },
          metrics: {},
        },
        {
          project_id: 'project-compose',
          scope_type: 'building',
          scope_id: 'building-2',
          state: 'accelerating',
          confidence_score: 0.86,
          window_days: 14,
          window_end_date: '2026-05-20',
          local_acceleration_factor: 0.92,
          throughput_ratio: 1.6,
          parallel_density_ratio: 1.15,
          deviation_recovery_days: 4,
          evidence: [{ code: 'standard_floor_rhythm_throughput_up', label: 'floor rhythm up', weight: 1 }],
          downstream_policy: {
            canAdjustRemainingDuration: true,
            canExplainDeviation: true,
            canRelaxResourceConflictPenalty: true,
            velocityFactorSupersedes: true,
            resourceConflictPenaltyMultiplier: 0.6,
            localAccelerationFactor: 0.92,
            maxForwardDays: 10,
            confidenceOnly: false,
            actionPolicy: 'candidate_only',
          },
          metrics: { standardFloorThroughputRatio: 1.35 },
        },
        {
          project_id: 'project-compose',
          scope_type: 'specialty',
          scope_id: 'mep',
          state: 'blocked',
          confidence_score: 0.8,
          window_days: 14,
          window_end_date: '2026-05-20',
          throughput_ratio: 0.7,
          parallel_density_ratio: 1.2,
          deviation_recovery_days: -3,
          evidence: [{ code: 'hard_blocker_present', label: 'hard blocker', weight: 1 }],
          downstream_policy: {
            canAdjustRemainingDuration: false,
            canExplainDeviation: true,
            canRelaxResourceConflictPenalty: false,
            velocityFactorSupersedes: false,
            resourceConflictPenaltyMultiplier: 1,
            localAccelerationFactor: null,
            maxForwardDays: 0,
            confidenceOnly: false,
            actionPolicy: 'candidate_only',
          },
          metrics: { milestoneThroughputRatio: 0.7 },
        },
      ]

      const context = await buildDurationContext({
        projectId: 'project-compose',
        taskTitle: 'MEP rough-in',
        standardWorkCode: 'mep',
        buildingObjectId: 'building-2',
        plannedStartDate: '2026-05-01',
        plannedEndDate: '2026-05-20',
        actualStartDate: '2026-05-01',
        progress: 35,
      })

      expect(context.calculationContext.project_schedule_state_composition).toEqual(expect.objectContaining({
        policy: 'scope_weighted_composition_blocking_scope_overrides_local_acceleration',
        effectiveState: 'blocked',
        weightedMultiplier: 1,
        acceleratingScopes: expect.arrayContaining(['building:building-2']),
        blockingScopes: expect.arrayContaining(['specialty:mep']),
        states: expect.arrayContaining([
          expect.objectContaining({ scopeKey: 'building:building-2', state: 'accelerating', weight: expect.any(Number) }),
          expect.objectContaining({ scopeKey: 'specialty:mep', state: 'blocked', weight: expect.any(Number) }),
        ]),
      }))
      expect(context.calculationContext.explain_package).toEqual(expect.objectContaining({
        scopeComposition: expect.objectContaining({
          blockingScopes: expect.arrayContaining(['specialty:mep']),
        }),
      }))
    })

    it('uses only published calibration overlays to scale external_readiness scoring', async () => {
      mocks.state.tasks = [{
        id: 'task-readiness-calibration',
        project_id: 'project-readiness-calibration',
        title: 'material gated start',
        planned_start_date: '2026-05-01',
        planned_end_date: '2026-05-10',
        actual_start_date: null,
        progress: 0,
        status: 'not_started',
      }]
      mocks.state.conditions = [{
        id: 'condition-material-calibration',
        project_id: 'project-readiness-calibration',
        task_id: 'task-readiness-calibration',
        condition_type: 'material',
        source_entity_type: 'project_material',
        source_entity_id: 'material-calibration-1',
        source_ref_id: 'material-calibration-1',
        required_for_start: true,
        blocking_level: 'hard',
        status: 'pending',
        is_satisfied: false,
        target_date: '2026-05-20',
        created_at: '2026-05-01T00:00:00.000Z',
      }]
      mocks.state.materials = [{
        id: 'material-calibration-1',
        project_id: 'project-readiness-calibration',
        linked_task_id: 'task-readiness-calibration',
        expected_arrival_date: '2026-05-20',
        actual_arrival_date: null,
        record_status: 'active',
      }]

      mocks.state.projectProductivityCalibrations = [{
        id: 'candidate-calibration',
        project_id: 'project-readiness-calibration',
        calibration_key: 'productivity_compensation',
        status: 'candidate',
        parameter_payload: {
          externalReadinessWeightScale: { impactScore: 0.5, extraDays: 0.5 },
        },
      }]
      const candidateContext = await buildDurationContext({ taskId: 'task-readiness-calibration' })
      const candidateReadiness = candidateContext.factors.find((factor) => factor.key === 'external_readiness')
      expect(candidateReadiness?.metadata?.externalReadinessCalibration).toEqual(expect.objectContaining({
        applied: false,
        source: 'default_policy_no_published_overlay',
      }))

      mocks.state.projectProductivityCalibrations = [{
        id: 'published-calibration',
        project_id: 'project-readiness-calibration',
        calibration_key: 'productivity_compensation',
        status: 'published',
        published_at: '2026-05-10T00:00:00.000Z',
        parameter_payload: {
          externalReadinessWeightScale: { impactScore: 0.5, extraDays: 0.5, confidencePenalty: 0.5 },
        },
      }]
      const publishedContext = await buildDurationContext({ taskId: 'task-readiness-calibration' })
      const publishedReadiness = publishedContext.factors.find((factor) => factor.key === 'external_readiness')

      expect(publishedReadiness?.metadata?.externalReadinessCalibration).toEqual(expect.objectContaining({
        applied: true,
        calibrationId: 'published-calibration',
        source: 'published_project_productivity_calibration',
      }))
      expect(publishedReadiness?.extraDays).toBeLessThan(candidateReadiness?.extraDays ?? 0)
      expect(publishedContext.calculationContext.external_readiness_calibration).toEqual(expect.objectContaining({
        applied: true,
        calibrationId: 'published-calibration',
      }))
    })

    it('publishes a standardized backend explain package with primary, companion and suppressed signals', async () => {
      mocks.resolveV1474SeasonalProductivity.mockResolvedValue({
        productivity: 0.9,
        climateSignal: 'rainy_season',
        confidence: 'high',
        __resolverSource: 'test_seasonal_seed',
      })
      mocks.state.tasks = [{
        id: 'task-explain',
        project_id: 'project-explain',
        title: 'facade work',
        planned_start_date: '2026-05-01',
        planned_end_date: '2026-05-10',
        progress: 0,
        status: 'not_started',
      }]
      mocks.state.conditions = [{
        id: 'condition-explain',
        project_id: 'project-explain',
        task_id: 'task-explain',
        condition_type: 'drawing',
        source_entity_type: 'drawing_package',
        source_entity_id: 'drawing-explain-1',
        required_for_start: true,
        blocking_level: 'hard',
        status: 'pending',
        is_satisfied: false,
        target_date: '2026-05-20',
      }]

      const context = await buildDurationContext({ taskId: 'task-explain' })

      expect(context.calculationContext.explain_package).toEqual(expect.objectContaining({
        version: 'duration_context_explain_v1',
        metadataPolicy: expect.objectContaining({
          mode: 'compact_backend_admin_payload',
          maxPrimaryDrivers: 5,
          maxCompanionSignals: 8,
        }),
        synthesisOrderPolicy: expect.objectContaining({
          policy: 'base_then_pm_recovery_then_schedule_state_then_productivity_compensation',
          orderedStages: expect.arrayContaining([
            'base_factors',
            'pm_recovery_compensation',
            'project_schedule_state_policy',
            'productivity_compensation',
          ]),
        }),
        pSemantics: expect.objectContaining({
          rangePolicy: 'p_can_exceed_1_when_acceleration_or_compensation_is_real',
        }),
        primaryDrivers: expect.arrayContaining([
          expect.objectContaining({ key: 'external_readiness' }),
        ]),
        companionSignals: expect.any(Array),
        suppressedSignals: expect.any(Array),
        inputCoverage: expect.objectContaining({ task_conditions: true }),
        runtimeCache: expect.objectContaining({
          scope: 'single_build_duration_context_request',
          activeReadinessRowsCached: expect.any(Number),
          progressSnapshotFactsCached: expect.any(Number),
        }),
      }))
      const suppressed = (context.calculationContext.explain_package as any).suppressedSignals as Array<Record<string, unknown>>
      expect(suppressed.every((entry) => !('originalMultiplier' in entry))).toBe(true)
      expect(context.calculationContext.explain_package).toEqual(expect.objectContaining({
        diagnosticSuppressedSignals: expect.any(Array),
      }))
    })

    it('caches repeated readiness and progress input loads inside one duration context build', async () => {
      mocks.state.tasks = [{
        id: 'task-cache',
        project_id: 'project-cache',
        title: 'rebar binding',
        standard_work_name: 'rebar binding',
        planned_start_date: '2026-05-01',
        planned_end_date: '2026-06-10',
        actual_start_date: '2026-05-01',
        progress: 10,
        status: 'in_progress',
      }]
      mocks.state.conditions = [{
        id: 'condition-cache',
        project_id: 'project-cache',
        task_id: 'task-cache',
        condition_type: 'drawing',
        source_type: 'drawing',
        required_for_start: true,
        blocking_level: 'hard',
        status: 'pending',
        is_satisfied: false,
        target_date: '2026-05-20',
      }, {
        id: 'condition-cache-material',
        project_id: 'project-cache',
        task_id: 'task-cache',
        condition_type: 'project_material',
        source_type: 'project_material',
        source_ref_id: 'material-cache',
        required_for_start: false,
        blocking_level: 'soft',
        status: 'pending',
        is_satisfied: false,
      }]
      mocks.state.obstacles = [{
        id: 'obstacle-cache',
        project_id: 'project-cache',
        task_id: 'task-cache',
        obstacle_type: 'equipment',
        status: 'open',
        severity: 'high',
        estimated_resolve_date: '2026-05-25',
      }]
      mocks.state.materials = [{
        id: 'material-cache',
        project_id: 'project-cache',
        expected_arrival_date: '2026-05-01',
        actual_arrival_date: '2026-05-01',
        record_status: 'active',
      }]
      mocks.state.progressSnapshots = [
        { task_id: 'task-cache', progress: 2, snapshot_date: '2026-05-02', created_at: '2026-05-02T08:00:00Z' },
        { task_id: 'task-cache', progress: 6, snapshot_date: '2026-05-10', created_at: '2026-05-10T08:00:00Z' },
        { task_id: 'task-cache', progress: 10, snapshot_date: '2026-05-20', created_at: '2026-05-20T08:00:00Z' },
      ]

      await buildDurationContext({ taskId: 'task-cache' })

      const queriedTables = mocks.from.mock.calls.map(([table]) => table)
      expect(queriedTables.filter((table) => table === 'task_conditions')).toHaveLength(1)
      expect(queriedTables.filter((table) => table === 'task_obstacles')).toHaveLength(1)
      expect(queriedTables.filter((table) => table === 'project_materials')).toHaveLength(1)
      expect(queriedTables.filter((table) => table === 'task_progress_snapshots')).toHaveLength(2)
    })

    it('dampens medium rain static coupling even when weather impact type casing differs', async () => {
      mocks.resolveV1474ProcessSeasonalSensitivity.mockResolvedValue({
        productivityMultiplier: 0.9,
        sensitivityReason: 'rainy_season',
        impactBand: 'rain_partial_work',
        confidence: 'high',
        __resolverSource: 'test_process_seed',
      })
      mocks.loadProjectWeatherImpactSignalsWithDiagnostics.mockResolvedValue({
        sourceStatus: 'ok',
        signals: [{
          impactType: 'HEAVY_RAIN',
          climateSignal: 'rainy_season',
          severity: 'Medium',
          actionPolicy: 'candidate_only',
          multiplier: 1.18,
          confidenceDelta: -8,
          reason: 'Medium heavy rain with uppercase impact type.',
        }],
      })

      const context = await buildDurationContext({
        projectId: 'project-rain-case',
        taskTitle: 'facade coating rainy season',
        plannedStartDate: '2026-06-01',
        plannedEndDate: '2026-06-10',
      })
      const weather = context.factors.find((factor) => factor.key === 'weather_forecast_impact')

      expect(weather?.multiplier).toBe(1.02)
      expect(weather?.metadata?.weatherStaticCoupling).toEqual(expect.objectContaining({
        overlapPolicy: 'medium_weather_fact_dampened_because_static_season_already_counted',
        rawWeatherMultiplier: 1.18,
        dampenedWeatherMultiplier: 1.02,
      }))
    })

    it('exposes calendar_missing as an explicit forecast-only subrule diagnostic', async () => {
      mocks.hasV1474WorkCalendarForYear.mockResolvedValue(false)
      mocks.resolveV1474SeasonalProductivity.mockResolvedValue({
        productivity: 0.99,
        climateSignal: 'normal',
        confidence: 'high',
        __resolverSource: 'test_seasonal_seed',
      })

      const context = await buildDurationContext({
        projectId: 'project-calendar-missing',
        taskTitle: 'normal work with missing calendar',
        plannedStartDate: '2028-05-01',
        plannedEndDate: '2028-05-10',
      })
      const calendar = context.factors.find((factor) => factor.key === 'calendar_missing')

      expect(calendar).toEqual(expect.objectContaining({
        actionPolicy: 'confidence_only',
        metadata: expect.objectContaining({
          embeddedUnderFactor: 'seasonal_productivity',
          forecastOnlySubRule: 'calendar_missing',
          runtimeAuthority: 'confidence_only',
        }),
      }))
      expect(context.calculationContext.calendar_missing_subrule).toEqual(expect.objectContaining({
        parentFactorKey: 'seasonal_productivity',
        runtimeAuthority: 'confidence_only',
      }))
    })

    it('does not infer seasonal productivity from today when planned start is missing', async () => {
      mocks.resolveProjectClimateRegion.mockResolvedValue({
        regionCode: 'warm_region',
        thermalZone: 'hot_summer_cold_winter',
        confidence: 'high',
      })
      mocks.resolveV1474SeasonalProductivity.mockResolvedValue({
        productivity: 0.8,
        climateSignal: 'summer_heat',
        confidence: 'high',
        __resolverSource: 'test_seasonal_seed',
      })

      const context = await buildDurationContext({
        projectId: 'project-no-planned-date',
        taskTitle: 'future task without planned date',
      })

      expect(context.factors.find((factor) => factor.key === 'seasonal_productivity')).toBeUndefined()
      expect(context.factors.find((factor) => factor.key === 'process_seasonal_sensitivity')).toBeUndefined()
      expect(context.calculationContext.adjusted_by).not.toContain('seasonal_productivity')
      expect(mocks.resolveV1474SeasonalProductivity).not.toHaveBeenCalled()
    })

    it('uses an explicit interference matrix so statutory calendar pressure outranks readiness duplicates', async () => {
      mocks.resolveV1474HolidayWindow.mockResolvedValue({
        holidayCode: 'spring_festival_2026',
        holidayName: 'Spring Festival',
        calendarKind: 'spring_festival',
        productivity: 0.4,
        __resolverSource: 'test_calendar_seed',
      })
      mocks.resolveV1474SeasonalProductivity.mockResolvedValue({
        productivity: 0.95,
        climateSignal: 'normal',
        confidence: 'high',
        __resolverSource: 'test_seasonal_seed',
      })
      mocks.state.tasks = [{
        id: 'task-interference-calendar',
        project_id: 'project-interference',
        title: 'spring festival material wait',
        planned_start_date: '2026-02-17',
        planned_end_date: '2026-02-26',
        progress: 0,
        status: 'not_started',
      }]
      mocks.state.conditions = [{
        id: 'condition-festival-material',
        project_id: 'project-interference',
        task_id: 'task-interference-calendar',
        condition_type: 'material',
        source_entity_type: 'holiday_window',
        source_entity_id: 'spring_festival_2026',
        required_for_start: true,
        blocking_level: 'hard',
        status: 'pending',
        is_satisfied: false,
        target_date: '2026-02-26',
      }]

      const context = await buildDurationContext({ taskId: 'task-interference-calendar' })
      const externalEntry = context.calculationContext.factor_contribution_ledger
        ?.find((entry: any) => entry.key === 'external_readiness')

      expect(context.calculationContext.factor_interference_matrix).toEqual(expect.objectContaining({
        policy: 'explicit_duration_context_interference_matrix',
        appliedRelationCount: expect.any(Number),
      }))
      expect(context.calculationContext.factor_interference_matrix?.appliedRelations).toEqual(expect.arrayContaining([
        expect.objectContaining({
          relation: 'causal',
          primaryFactorKey: 'seasonal_productivity',
          secondaryFactorKey: 'external_readiness',
        }),
      ]))
      expect(externalEntry).toEqual(expect.objectContaining({
        contributionMode: 'interference_secondary',
        suppressedByFactorKey: 'seasonal_productivity',
        multiplier: 1,
        extraDays: 0,
      }))
    })

    it('keeps weather as the primary factor over external readiness for shared red-weather source entities', async () => {
      mocks.state.tasks = [{
        id: 'task-interference-weather',
        project_id: 'project-interference-weather',
        title: 'red rain material wait',
        planned_start_date: '2026-05-01',
        planned_end_date: '2026-05-10',
        progress: 0,
        status: 'not_started',
      }]
      mocks.state.conditions = [{
        id: 'condition-red-rain',
        project_id: 'project-interference-weather',
        task_id: 'task-interference-weather',
        condition_type: 'material',
        source_entity_type: 'weather_event',
        source_entity_id: 'red-rain-1',
        required_for_start: true,
        blocking_level: 'hard',
        status: 'pending',
        is_satisfied: false,
        target_date: '2026-05-10',
      }]
      mocks.loadProjectWeatherImpactSignalsWithDiagnostics.mockResolvedValue({
        sourceStatus: 'ok',
        signals: [{
          impactType: 'site_shutdown_event',
          climateSignal: 'red_rainstorm',
          severity: 'high',
          actionPolicy: 'candidate_only',
          multiplier: 1,
          confidenceDelta: -15,
          reason: 'Red rainstorm shutdown.',
          siteShutdownEvent: { shutdownDays: 3, eventType: 'red_rainstorm' },
          evidence: {
            sourceEntityKeys: ['weather_event:red-rain-1'],
          },
        }],
      })

      const context = await buildDurationContext({ taskId: 'task-interference-weather' })
      const readinessEntry = context.calculationContext.factor_contribution_ledger
        ?.find((entry: any) => entry.key === 'external_readiness')

      expect(context.calculationContext.factor_interference_matrix?.appliedRelations).toEqual(expect.arrayContaining([
        expect.objectContaining({
          relation: 'causal',
          primaryFactorKey: 'weather_forecast_impact',
          secondaryFactorKey: 'external_readiness',
        }),
      ]))
      expect(readinessEntry).toEqual(expect.objectContaining({
        contributionMode: 'interference_secondary',
        suppressedByFactorKey: 'weather_forecast_impact',
        extraDays: 0,
      }))
    })

    it('normalizes process constraint multiplier caps and reports factor cap policy', async () => {
      mocks.resolveV1474ProcessConstraint.mockResolvedValue({
        stableCode: 'process-high-multiplier',
        runtimeActionPolicy: 'candidate_only',
        applicationMode: 'edge_overlap',
        impactMode: 'multiplier',
        partialOverlapRatio: 0.2,
        multiplier: 2.4,
        confidence: 'high',
      })

      const context = await buildDurationContext({
        projectId: 'project-process-cap',
        taskTitle: 'process constrained work',
        plannedStartDate: '2026-05-01',
        plannedEndDate: '2026-05-20',
      })
      const processFactor = context.factors.find((factor) => factor.key === 'process_constraint')

      expect(processFactor).toEqual(expect.objectContaining({
        multiplier: 1.3,
        actionPolicy: 'candidate_only',
      }))
      expect(processFactor?.metadata).toEqual(expect.objectContaining({
        factorCapPolicy: expect.objectContaining({
          multiplierMax: 1.3,
          originalMultiplier: 2.4,
          capApplied: true,
        }),
      }))
      expect(context.calculationContext.factor_cap_policy).toEqual(expect.objectContaining({
        synthesisMultiplierSafetyMax: expect.any(Number),
      }))
    })

    it('allows stable project baseline calibration above 1.2 when variance is very low', async () => {
      mocks.loadPublishedProgressVelocityRuntime.mockImplementation(async (input: { consumerKey?: string }) => (
        input.consumerKey === 'durationContextProjectBaselineCalibrationFactorService.published_velocity'
          ? publishedVelocity(1.24)
          : null
      ))

      const context = await buildDurationContext({
        projectId: 'project-stable-baseline-slow',
        taskTitle: 'stable slow project work',
        plannedStartDate: '2026-05-21',
        plannedEndDate: '2026-05-30',
      })
      const factor = context.factors.find((item) => item.key === 'project_baseline_calibration')

      expect(factor).toEqual(expect.objectContaining({
        actionPolicy: 'auto_apply',
        multiplier: 1.24,
      }))
      expect(factor?.metadata).toEqual(expect.objectContaining({
        publicationKey: 'velocity-stable-1',
        runtimeAuthority: 'published_parameter_only',
        rawSampleConsumption: false,
      }))
    })

    it('dampens overlapping seasonal and resource multipliers when high-confidence baseline calibration is applied', async () => {
      mocks.state.resourceRecords[0].effectPolicy = {
        ...mocks.state.resourceRecords[0].effectPolicy,
        minSamplesForActiveMode: 0,
      }
      mocks.resolveProjectClimateRegion.mockResolvedValue({
        regionCode: 'warm_region',
        thermalZone: 'hot_summer_cold_winter',
        confidence: 'high',
      })
      mocks.resolveV1474SeasonalProductivity.mockResolvedValue({
        productivity: 0.8,
        climateSignal: 'summer_heat',
        confidence: 'high',
        __resolverSource: 'test_seasonal_seed',
      })
      mocks.loadPublishedProgressVelocityRuntime.mockImplementation(async (input: { consumerKey?: string }) => (
        input.consumerKey === 'durationContextProjectBaselineCalibrationFactorService.published_velocity'
          ? publishedVelocity(1.1)
          : null
      ))
      mocks.state.tasks = [
        {
          id: 'task-baseline-overlap-current',
          project_id: 'project-baseline-overlap',
          title: 'summer fitout current',
          participant_unit_id: 'unit-fitout',
          building_object_id: 'building-1',
          planned_start_date: '2026-05-01',
          planned_end_date: '2026-05-31',
          actual_start_date: '2026-05-01',
          progress: 5,
          status: 'in_progress',
        },
        {
          id: 'task-baseline-overlap-peer',
          project_id: 'project-baseline-overlap',
          title: 'summer fitout peer',
          participant_unit_id: 'unit-fitout',
          building_object_id: 'building-1',
          planned_start_date: '2026-05-01',
          planned_end_date: '2026-05-31',
          actual_start_date: '2026-05-01',
          progress: 10,
          status: 'in_progress',
        },
      ]

      const context = await buildDurationContext({ taskId: 'task-baseline-overlap-current' })
      const seasonalEntry = context.calculationContext.factor_contribution_ledger
        ?.find((entry: any) => entry.key === 'seasonal_productivity')
      const resourceEntry = context.calculationContext.factor_contribution_ledger
        ?.find((entry: any) => entry.key === 'resource_conflict')

      expect(context.factors.find((factor) => factor.key === 'project_baseline_calibration')).toEqual(expect.objectContaining({
        multiplier: 1.1,
        actionPolicy: 'auto_apply',
      }))
      expect(seasonalEntry).toEqual(expect.objectContaining({
        contributionMode: 'baseline_overlap_secondary',
        multiplier: 1.15,
        suppressedByFactorKey: 'project_baseline_calibration',
      }))
      expect(resourceEntry).toEqual(expect.objectContaining({
        actionPolicy: 'candidate_only',
        contributionMode: 'baseline_overlap_secondary',
        suppressedByFactorKey: 'project_baseline_calibration',
      }))
      const originalResourceMultiplier = Number(resourceEntry?.diagnosticOriginalMultiplier ?? 1)
      expect(originalResourceMultiplier).toBeGreaterThan(Number(resourceEntry?.multiplier ?? 1))
      expect(Number(resourceEntry?.multiplier)).toBeCloseTo(
        1 + (originalResourceMultiplier - 1) * 0.6,
        3,
      )
      expect(Number(context.calculationContext.raw_multiplier)).toBeLessThan(1.1 * 1.25 * 1.1)
      const candidateMultiplierWithoutBaselineOverlap = Number((context.calculationContext.factor_contribution_ledger ?? [])
        .filter((entry: any) => ['auto_apply', 'candidate_only'].includes(entry.actionPolicy))
        .reduce((value: number, entry: any) => {
          const multiplier = entry.contributionMode === 'baseline_overlap_secondary'
            ? Number(entry.diagnosticOriginalMultiplier ?? entry.multiplier ?? 1)
            : Number(entry.multiplier ?? 1)
          return value * multiplier
        }, 1)
        .toFixed(3))
      expect(candidateScenario(context).rawMultiplier).toBeLessThan(candidateMultiplierWithoutBaselineOverlap)
    })

    it('uses dynamic extraDays caps for missing, short and long planned durations', async () => {
      mocks.state.tasks = [{
        id: 'task-dynamic-cap-long',
        project_id: 'project-dynamic-cap',
        title: 'large foundation stage',
        planned_start_date: '2026-01-01',
        planned_end_date: '2026-07-19',
        progress: 0,
        status: 'not_started',
      }]
      mocks.state.materials = [{
        id: 'material-long-delay',
        project_id: 'project-dynamic-cap',
        linked_task_id: 'task-dynamic-cap-long',
        expected_arrival_date: '2026-07-30',
        actual_arrival_date: null,
        record_status: 'active',
      }]
      const longContext = await buildDurationContext({ taskId: 'task-dynamic-cap-long' })

      expect(longContext.calculationContext.extra_days_cap).toBe(90)
      expect(longContext.calculationContext.extra_days_cap_policy).toBe('planned_duration_dynamic_segment_cap')

      const missingContext = await buildDurationContext({
        projectId: 'project-dynamic-cap',
        taskTitle: 'missing plan material wait',
        progress: 0,
      })
      expect(missingContext.calculationContext.extra_days_cap).toBe(7)
      expect(missingContext.calculationContext.extra_days_cap_policy).toBe('missing_planned_duration_conservative_cap_7')
    })

    it('requires business recovery evidence before creating PM recovery compensation', async () => {
      mocks.resolveV1474SeasonalProductivity.mockResolvedValue({
        productivity: 0.88,
        climateSignal: 'rainy_season',
        confidence: 'high',
        __resolverSource: 'test_seasonal_seed',
      })
      mocks.loadProjectWeatherImpactSignalsWithDiagnostics.mockResolvedValue({
        sourceStatus: 'ok',
        signals: [{
          impactType: 'heavy_rain',
          climateSignal: 'rainy_season',
          severity: 'medium',
          actionPolicy: 'candidate_only',
          multiplier: 1.08,
          confidenceDelta: -8,
          reason: 'Rain pressure.',
        }],
      })
      mocks.state.tasks = [{
        id: 'task-pm-recovery-gated',
        project_id: 'project-pm-recovery-gated',
        title: 'rainy facade catchup',
        planned_start_date: '2026-05-01',
        planned_end_date: '2026-05-20',
        actual_start_date: '2026-05-01',
        progress: 5,
        status: 'in_progress',
      }]
      mocks.state.conditions = [{
        id: 'condition-rain-gated',
        project_id: 'project-pm-recovery-gated',
        task_id: 'task-pm-recovery-gated',
        condition_type: 'drawing',
        blocking_level: 'hard',
        status: 'pending',
        is_satisfied: false,
        created_at: '2026-05-01T00:00:00.000Z',
      }]

      const coldContext = await buildDurationContext({ taskId: 'task-pm-recovery-gated' })
      expect(coldContext.factors.find((factor) => factor.key === 'pm_recovery_compensation')).toBeUndefined()

      mocks.loadPublishedProgressVelocityRuntime.mockImplementation(async (input: { consumerKey?: string }) => (
        input.consumerKey === 'durationContextPmRecoveryCompensationFactorService.published_velocity'
          ? publishedVelocity()
          : null
      ))
      const matureContext = await buildDurationContext({ taskId: 'task-pm-recovery-gated' })
      expect(matureContext.factors.find((factor) => factor.key === 'pm_recovery_compensation')).toEqual(expect.objectContaining({
        actionPolicy: 'candidate_only',
        metadata: expect.objectContaining({
          eligibilityScenario: expect.any(String),
        }),
      }))
    })

    it('widens confidence caps and records the positive cap when evidence stacks high', async () => {
      mocks.buildProjectProgressVelocityLearning.mockResolvedValue({
        multiplier: 0.95,
        confidenceDelta: 8,
        sampleSize: 80,
        confidence: 'high',
      })
      mocks.state.tasks = [{
        id: 'task-positive-confidence',
        project_id: 'project-positive-confidence',
        title: 'stable repeated work',
        planned_start_date: '2026-05-01',
        planned_end_date: '2026-05-20',
        progress: 55,
        status: 'in_progress',
      }]
      mocks.state.durationExperienceSamples = Array.from({ length: 80 }, (_, index) => ({
        id: `sample-positive-${index}`,
        project_id: 'project-positive-confidence',
        task_id: `historical-positive-${index}`,
        planned_duration: 10,
        actual_duration: 8,
        sample_status: 'active',
        included_in_benchmark: true,
        completed_at: '2026-05-01',
        sample_strength: 'strong',
        confidence_level: 'high',
      }))

      const context = await buildDurationContext({ taskId: 'task-positive-confidence' })

      expect(context.calculationContext.confidence_delta_cap).toEqual(expect.objectContaining({
        min: -30,
        max: 20,
      }))
      expect(context.confidenceDelta).toBeLessThanOrEqual(20)
    })

    it('reuses project-level resource readiness cache for overlapping task scopes', async () => {
      mocks.state.tasks = [
        {
          id: 'task-cache-a',
          project_id: 'project-scope-cache',
          title: 'scope cache A',
          planned_start_date: '2026-05-01',
          planned_end_date: '2026-05-20',
          progress: 5,
          status: 'in_progress',
        },
        {
          id: 'task-cache-b',
          project_id: 'project-scope-cache',
          title: 'scope cache B',
          building_object_id: 'building-cache',
          planned_start_date: '2026-05-01',
          planned_end_date: '2026-05-20',
          progress: 5,
          status: 'in_progress',
        },
        {
          id: 'task-cache-c',
          project_id: 'project-scope-cache',
          title: 'scope cache C',
          building_object_id: 'building-cache',
          planned_start_date: '2026-05-01',
          planned_end_date: '2026-05-20',
          progress: 5,
          status: 'in_progress',
        },
      ]
      mocks.state.conditions = [
        {
          id: 'condition-cache-a',
          project_id: 'project-scope-cache',
          task_id: 'task-cache-a',
          condition_type: 'equipment',
          status: 'pending',
          is_satisfied: false,
          created_at: '2026-05-01T00:00:00.000Z',
        },
        {
          id: 'condition-cache-b',
          project_id: 'project-scope-cache',
          task_id: 'task-cache-b',
          condition_type: 'equipment',
          status: 'pending',
          is_satisfied: false,
          created_at: '2026-05-01T00:00:00.000Z',
        },
        {
          id: 'condition-cache-c',
          project_id: 'project-scope-cache',
          task_id: 'task-cache-c',
          condition_type: 'equipment',
          status: 'pending',
          is_satisfied: false,
          created_at: '2026-05-01T00:00:00.000Z',
        },
      ]

      await buildDurationContext({
        projectId: 'project-scope-cache',
        taskId: 'task-cache-a',
        buildingObjectId: 'building-cache',
        plannedStartDate: '2026-05-01',
        plannedEndDate: '2026-05-20',
      } as any)
      await buildDurationContext({
        projectId: 'project-scope-cache',
        taskId: 'task-cache-b',
        buildingObjectId: 'building-cache',
        plannedStartDate: '2026-05-01',
        plannedEndDate: '2026-05-20',
      } as any)

      const queriedTables = mocks.from.mock.calls.map(([table]) => table)
      expect(queriedTables.filter((table) => table === 'task_conditions').length).toBeLessThanOrEqual(4)
    })

    it('exposes building_pattern as a separate contribution inside workflow_sequence metadata and context', async () => {
      mocks.resolveV1474BuildingPatternMatches.mockResolvedValue([{
        patternCode: 'prefabricated_concrete_floor_cycle',
        record: {
          patternCode: 'prefabricated_concrete_floor_cycle',
          patternRole: 'primary_project_mode',
          durationCurveProfile: { tailUnitBias: 'higher' },
        },
        matchScore: 190,
        confidenceScore: 90,
        confidenceLevel: 'high',
        matchedSignals: ['pc_floor_cycle'],
        missingSignals: [],
        actionPolicy: 'backend_consume',
        weightedTypicalCycleDays: { firstFloor: 8, midFloors: 5.5, lastFloors: 6 },
        durationProfileContributions: [{ patternCode: 'prefabricated_concrete_floor_cycle', weight: 1 }],
      } as any])

      const context = await buildDurationContext({
        projectId: 'project-building-pattern-observable',
        taskTitle: 'A1# PC laminated slab lifting',
        plannedStartDate: '2026-05-01',
        plannedEndDate: '2026-05-10',
      })
      const workflow = context.factors.find((factor) => factor.key === 'workflow_sequence')

      expect(workflow?.metadata).toEqual(expect.objectContaining({
        buildingPatternContribution: expect.objectContaining({
          factorKey: 'building_pattern',
          patternCodes: expect.arrayContaining(['prefabricated_concrete_floor_cycle']),
          weightedTypicalCycleDays: expect.objectContaining({ midFloors: 5.5 }),
        }),
      }))
      expect(context.calculationContext.building_pattern_contribution).toEqual(expect.objectContaining({
        factorKey: 'building_pattern',
        patternCodes: expect.arrayContaining(['prefabricated_concrete_floor_cycle']),
      }))
    })
  })
})
