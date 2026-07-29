import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const resolveV1474BuildingPatternMatch = vi.fn(async (..._args: any[]) => ({
    record: null,
    patternCode: null,
    matchScore: 0,
    confidenceScore: 0,
    confidenceLevel: 'low',
    matchedSignals: [],
    missingSignals: [],
    actionPolicy: 'candidate_only',
  }))
  const resolveV1474BuildingPatternMatches = vi.fn(async (...args: any[]) => {
    const match = await resolveV1474BuildingPatternMatch(...args)
    return match?.record ? [match] : []
  })

  return {
    supabaseFrom: vi.fn(),
    forecastBatchTasks: vi.fn(async () => []),
    buildProjectProductivityCompensation: vi.fn(async (input: any) => ({
    projectId: input.projectId ?? null,
    baseProductivity: Number(input.baseProductivity ?? 1),
    adjustedProductivity: Number(input.baseProductivity ?? 1),
    productivityUplift: 0,
    productivityMultiplier: 1,
    durationMultiplier: 1,
    actionPolicy: 'confidence_only',
    confidenceLevel: 'unavailable',
    maturityTier: 'cold_start',
    maturityScoreDays: 0,
    compensationCap: 0,
    capApplied: false,
    sourceBreakdown: [],
    notAppliedReason: 'test_default_no_compensation',
    dataDependencies: [],
    metadata: {},
    })),
    readPlanningReplayCalibrationReadback: vi.fn(async () => ({
      status: 'unavailable',
      coarseProcessKey: null,
      evidenceRefs: [],
      writePolicy: 'candidate_overlay_only_no_fact_mutation',
      acceptedSampleCount: 0,
      originalMae: null,
      replayMae: null,
      maeImprovement: null,
      overcompensationRate: null,
      e1DurationAdjustmentDays: null,
      e2ResidualCorrectionDays: null,
      capacityBudgetFactor: null,
      priorityWeightAdjustment: null,
      e2TargetDiscountFactor: null,
      rejectedEvidence: [],
    })),
    resolveAlgorithmSeedRecords: vi.fn(async (_assetType?: string) => []),
    resolveV1474SeasonalProductivity: vi.fn(async () => null),
    getProjectCriticalPathSnapshot: vi.fn(async (): Promise<any> => ({
      calculationStatus: 'fresh',
      tasks: [],
      displayTaskIds: [],
      autoTaskIds: [],
    })),
    resolveV1474BuildingPatternMatch,
    resolveV1474BuildingPatternMatches,
  }
})

vi.mock('../services/dbService.js', () => ({
  supabase: {
    from: mocks.supabaseFrom,
  },
}))

vi.mock('../middleware/logger.js', () => ({
  logger: {
    debug: vi.fn(),
    warn: vi.fn(),
  },
}))

vi.mock('../services/criticalPathHelpers.js', () => ({
  getCriticalPathTaskIds: vi.fn(async () => new Set<string>()),
}))

vi.mock('../services/projectCriticalPathService.js', () => ({
  getProjectCriticalPathSnapshot: mocks.getProjectCriticalPathSnapshot,
}))

function freshCpmMetric(value: number, overrides: Record<string, unknown> = {}) {
  return {
    value,
    unit: 'construction_production_day',
    calendarRef: 'work_calendar',
    calendarVersion: 'calendar-v1',
    timezone: 'Asia/Shanghai',
    asOf: '2026-05-01',
    availability: 'available',
    unavailableReason: null,
    ...overrides,
  }
}

vi.mock('../services/taskDurationForecastService.js', () => ({
  forecastBatchTasks: vi.fn(async (...args: any[]) => {
    const forecasts = await (mocks.forecastBatchTasks as (...values: any[]) => Promise<any[]>)(...args)
    return forecasts.map((forecast: any) => {
      const availableMetric = (value: unknown) => ({
        value: Number.isFinite(Number(value)) ? Number(value) : null,
        unit: 'construction_production_day',
        calendarRef: 'work_calendar',
        calendarVersion: 'calendar-v1',
        timezone: 'Asia/Shanghai',
        asOf: '2026-05-01',
        availability: Number.isFinite(Number(value)) ? 'available' : 'unavailable',
        unavailableReason: Number.isFinite(Number(value)) ? null : 'duration_value_missing',
      })
      return {
        ...forecast,
        remainingDuration: forecast.remainingDuration ?? availableMetric(forecast.remainingDurationDays),
        forecastDelay: forecast.forecastDelay ?? availableMetric(forecast.forecastDelayDays),
      }
    })
  }),
}))

vi.mock('../services/projectProductivityCompensationService.js', () => ({
  buildProjectProductivityCompensation: mocks.buildProjectProductivityCompensation,
}))

vi.mock('../services/algorithmSeedResolver.js', () => ({
  hasV1474WorkCalendarForYear: vi.fn(async () => false),
  resolveAlgorithmSeedRecords: mocks.resolveAlgorithmSeedRecords,
  resolveV1474BuildingPatternMatch: mocks.resolveV1474BuildingPatternMatch,
  resolveV1474BuildingPatternMatches: mocks.resolveV1474BuildingPatternMatches,
  resolveV1474HolidayWindow: vi.fn(async () => null),
  resolveV1474SeasonalProductivity: mocks.resolveV1474SeasonalProductivity,
}))

vi.mock('../services/projectClimateResolver.js', () => ({
  resolveProjectClimateRegion: vi.fn(async () => ({ regionCode: 'default' })),
}))

vi.mock('../services/planningReplayCalibrationService.js', () => ({
  readPlanningReplayCalibrationReadback: mocks.readPlanningReplayCalibrationReadback,
}))

const {
  applyManualOverrideFields,
  mergeMonthlyPlanCandidates,
  resolveMonthlyPlanGenerationSourceV1474,
} = await import('../services/monthlyPlanGenerationService.js')

describe('monthlyPlanGenerationService v1.4.7 manual overrides and metadata', () => {
  function mockSupabaseRows(rowsByTable: Record<string, any[]>) {
    mocks.supabaseFrom.mockImplementation((table: string) => {
      const state = {
        rows: rowsByTable[table] ?? [],
        filters: [] as Array<{ column: string; value: unknown; operator: 'eq' | 'in' }>,
        limitCount: null as number | null,
      }
      const builder = {
        select: () => builder,
        eq: (column: string, value: unknown) => {
          state.filters.push({ column, value, operator: 'eq' })
          return builder
        },
        in: (column: string, value: unknown[]) => {
          state.filters.push({ column, value, operator: 'in' })
          return builder
        },
        order: () => builder,
        limit: (count: number) => {
          state.limitCount = count
          return builder
        },
        maybeSingle: () => Promise.resolve({ data: resolveRows()[0] ?? null, error: null }),
        then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
          Promise.resolve({ data: resolveRows(), error: null }).then(resolve, reject),
      }

      function resolveRows() {
        let rows = state.rows.filter((row) => state.filters.every((filter) => {
          if (filter.operator === 'in') {
            return Array.isArray(filter.value) && filter.value.includes(row[filter.column])
          }
          return row[filter.column] === filter.value
        }))
        if (state.limitCount != null) rows = rows.slice(0, state.limitCount)
        return rows
      }

      return builder
    })
  }

  beforeEach(() => {
    mocks.supabaseFrom.mockReset()
    mocks.forecastBatchTasks.mockReset()
    mocks.readPlanningReplayCalibrationReadback.mockReset()
    mocks.readPlanningReplayCalibrationReadback.mockResolvedValue({
      status: 'unavailable',
      coarseProcessKey: null,
      evidenceRefs: [],
      writePolicy: 'candidate_overlay_only_no_fact_mutation',
      acceptedSampleCount: 0,
      originalMae: null,
      replayMae: null,
      maeImprovement: null,
      overcompensationRate: null,
      e1DurationAdjustmentDays: null,
      e2ResidualCorrectionDays: null,
      capacityBudgetFactor: null,
      priorityWeightAdjustment: null,
      e2TargetDiscountFactor: null,
      rejectedEvidence: [],
    })
    mocks.forecastBatchTasks.mockResolvedValue([])
    mocks.buildProjectProductivityCompensation.mockReset()
    mocks.buildProjectProductivityCompensation.mockImplementation(async (input: any) => ({
      projectId: input.projectId ?? null,
      baseProductivity: Number(input.baseProductivity ?? 1),
      adjustedProductivity: Number(input.baseProductivity ?? 1),
      productivityUplift: 0,
      productivityMultiplier: 1,
      durationMultiplier: 1,
      actionPolicy: 'confidence_only',
      confidenceLevel: 'unavailable',
      maturityTier: 'cold_start',
      maturityScoreDays: 0,
      compensationCap: 0,
      capApplied: false,
      sourceBreakdown: [],
      notAppliedReason: 'test_default_no_compensation',
      dataDependencies: [],
      metadata: {},
    }))
    mocks.resolveV1474BuildingPatternMatch.mockReset()
    mocks.resolveV1474SeasonalProductivity.mockReset()
    mocks.resolveV1474SeasonalProductivity.mockResolvedValue(null)
    mocks.resolveAlgorithmSeedRecords.mockReset()
    mocks.resolveAlgorithmSeedRecords.mockResolvedValue([])
    mocks.getProjectCriticalPathSnapshot.mockReset()
    mocks.getProjectCriticalPathSnapshot.mockResolvedValue({
      calculationStatus: 'fresh',
      tasks: [],
      displayTaskIds: [],
      autoTaskIds: [],
    })
    mocks.resolveV1474BuildingPatternMatch.mockResolvedValue({
      record: null,
      patternCode: null,
      matchScore: 0,
      confidenceScore: 0,
      confidenceLevel: 'low',
      matchedSignals: [],
      missingSignals: [],
      actionPolicy: 'candidate_only',
    })
  })

  it('preserves flagged fields from the previous editable monthly draft', () => {
    const generated = applyManualOverrideFields([
      {
        source_task_id: 'task-1',
        baseline_item_id: 'baseline-item-1',
        carryover_from_item_id: null,
        title: 'structure work',
        planned_start_date: '2026-05-01',
        planned_end_date: '2026-05-10',
        target_progress: 80,
        current_progress: 20,
        sort_order: 1,
        is_milestone: false,
        is_critical: true,
        commitment_status: 'planned',
        notes: 'system note',
      } as any,
    ], [
      {
        id: 'monthly-item-1',
        project_id: 'project-1',
        monthly_plan_version_id: 'plan-draft',
        source_task_id: 'task-1',
        title: 'structure work',
        planned_start_date: '2026-05-03',
        planned_end_date: '2026-05-11',
        target_progress: 65,
        current_progress: 20,
        sort_order: 1,
        notes: 'manual note',
        manual_override_fields: {
          planned_start_date: true,
          target_progress: true,
          notes: true,
        },
        last_generated_at: '2026-05-01T00:00:00.000Z',
        created_at: '2026-05-01T00:00:00.000Z',
        updated_at: '2026-05-01T00:00:00.000Z',
      } as any,
    ])

    expect(generated[0]).toMatchObject({
      planned_start_date: '2026-05-03',
      planned_end_date: '2026-05-10',
      target_progress: 65,
      notes: 'manual note',
      manual_override_fields: {
        planned_start_date: true,
        target_progress: true,
        notes: true,
      },
      generation_metadata: expect.objectContaining({
        target_progress_method: 'manual_override',
        merged_sources: expect.arrayContaining(['manual_override']),
        generation_reasons: expect.arrayContaining(['manual_override_preserved']),
      }),
    })
  })

  it('keeps manual-only rows when regeneration no longer produces the candidate', () => {
    const generated = applyManualOverrideFields([], [
      {
        id: 'manual-only-item',
        project_id: 'project-1',
        monthly_plan_version_id: 'plan-draft',
        title: 'temporary access road',
        planned_start_date: '2026-05-15',
        planned_end_date: '2026-05-20',
        target_progress: 100,
        current_progress: 0,
        sort_order: 3,
        notes: 'keep for site coordination',
        manual_override_fields: {
          planned_start_date: true,
          planned_end_date: true,
          target_progress: true,
          notes: true,
        },
        created_at: '2026-05-01T00:00:00.000Z',
        updated_at: '2026-05-01T00:00:00.000Z',
      } as any,
    ])

    expect(generated).toHaveLength(1)
    expect(generated[0]).toMatchObject({
      title: 'temporary access road',
      planned_start_date: '2026-05-15',
      target_progress: 100,
      generation_metadata: expect.objectContaining({
        merged_sources: expect.arrayContaining(['manual_override']),
        blocking_factors: expect.arrayContaining(['mapping_attention']),
      }),
    })
  })

  it('deduplicates candidates and records merged sources in generation metadata', () => {
    const merged = mergeMonthlyPlanCandidates([
      {
        source_task_id: 'task-1',
        baseline_item_id: 'baseline-item-1',
        title: 'structure work',
        planned_start_date: '2026-05-01',
        planned_end_date: '2026-05-10',
        target_progress: 60,
        current_progress: 10,
        sort_order: 1,
        is_milestone: false,
        is_critical: true,
        source_chip: 'baseline',
        generation_metadata: { merged_sources: ['baseline'] },
      } as any,
    ], [
      {
        source_task_id: 'task-1',
        carryover_from_item_id: 'previous-item-1',
        title: 'structure work',
        planned_start_date: '2026-05-02',
        planned_end_date: '2026-05-09',
        target_progress: 70,
        current_progress: 30,
        sort_order: 2,
        is_milestone: false,
        is_critical: false,
        source_chip: 'rolling_in',
        generation_metadata: { merged_sources: ['carryover'] },
      } as any,
    ])

    expect(merged).toHaveLength(1)
    expect(merged[0]).toMatchObject({
      source_task_id: 'task-1',
      carryover_from_item_id: 'previous-item-1',
      current_progress: 30,
      generation_metadata: expect.objectContaining({
        merged_sources: expect.arrayContaining(['baseline', 'carryover']),
        generation_reasons: expect.arrayContaining(['candidate_sources_merged']),
      }),
    })
  })

  it('uses controlled project productivity compensation when deriving monthly target progress', async () => {
    const { deriveMonthlyTargetProgress } = await import('../services/monthlyPlanGenerationService.js')
    mocks.resolveV1474SeasonalProductivity.mockResolvedValue({
      productivity: 0.71,
      confidence: 'high',
      __resolverSource: 'test_seasonal_seed',
    })
    mocks.buildProjectProductivityCompensation.mockImplementation(async (input: any) => ({
      projectId: input.projectId,
      baseProductivity: input.baseProductivity,
      adjustedProductivity: 0.84,
      productivityUplift: 0.13,
      productivityMultiplier: 1.183,
      durationMultiplier: 0.845,
      actionPolicy: 'auto_apply',
      confidenceLevel: 'high',
      maturityTier: 'mature_90d',
      maturityScoreDays: 100,
      compensationCap: 0.18,
      capApplied: false,
      sourceBreakdown: [{ key: 'crew_learning', contribution: 0.08, reason: 'test' }],
      notAppliedReason: null,
      dataDependencies: ['duration_experience_samples'],
      metadata: {},
    }))

    const target = await deriveMonthlyTargetProgress({
      projectId: 'project-1',
      plannedStart: '2026-05-01',
      plannedEnd: '2026-05-30',
      currentProgress: 0,
      isMilestone: false,
      monthWindow: {
        year: 2026,
        month: 5,
        start: new Date('2026-05-01T00:00:00.000Z'),
        end: new Date('2026-05-15T00:00:00.000Z'),
      },
    })

    expect(target).toBe(42)
    expect(mocks.buildProjectProductivityCompensation).toHaveBeenCalledWith(expect.objectContaining({
      projectId: 'project-1',
      baseProductivity: 0.71,
      year: 2026,
      month: 5,
      appliedFactorKeys: ['seasonal_productivity'],
    }))
  })

  it('feeds execution fact inputs into monthly plan generation summary and row metadata', async () => {
    mocks.resolveV1474BuildingPatternMatch.mockResolvedValue({
      record: {
        patternCode: 'high_rise_core_and_floor_cycle',
        patternRole: 'phase_mode',
        patternPriority: 74,
        controlChains: [{ chainCode: 'core_wall_floor_cycle' }],
        durationCurveProfile: { curveCode: 'standard_floor_cycle', tailUnitBias: 'higher' },
      },
      patternCode: 'high_rise_core_and_floor_cycle',
      matchScore: 180,
      confidenceScore: 82,
      confidenceLevel: 'high',
      matchedSignals: ['control_chain', 'duration_curve_profile'],
      missingSignals: [],
      actionPolicy: 'backend_consume',
    })
    mockSupabaseRows({
      task_baselines: [
        { id: 'baseline-1', project_id: 'project-1', version: 2, status: 'confirmed', confirmed_at: '2026-05-01T00:00:00.000Z' },
      ],
      task_baseline_items: [
        {
          id: 'baseline-item-1',
          baseline_version_id: 'baseline-1',
          source_task_id: 'task-1',
          title: 'Concrete pour',
          planned_start_date: '2026-05-05',
          planned_end_date: '2026-05-10',
          target_progress: 80,
          sort_order: 1,
          is_critical: true,
          is_executable: true,
          standard_work_code: '02-01-03-P04',
          wbs_snapshot: {
            projectGenerationFacts: {
              businessType: 'residential',
              structureTypeCode: 'shear_wall',
              methodVariantCodes: ['aluminum_formwork'],
              buildingPatternCodes: ['high_rise_core_and_floor_cycle'],
            },
          },
          standard_work_name: '混凝土浇筑',
          scope_snapshot: {
            dimensions: {
              building: { id: 'building-1' },
              floor: { id: 'floor-3' },
            },
          },
        },
      ],
      monthly_plans: [],
      monthly_plan_items: [],
      task_dependencies: [
        { id: 'dep-1', project_id: 'project-1', task_id: 'task-1', dependency_task_id: 'task-0', dependency_type: 'FS', required_for_start: true, status: 'active' },
      ],
      task_conditions: [
        { id: 'condition-1', project_id: 'project-1', task_id: 'task-1', is_satisfied: false, blocking_level: 'blocked', status: 'pending' },
      ],
      task_obstacles: [
        { id: 'obstacle-1', project_id: 'project-1', task_id: 'task-1', status: 'active', severity: 'critical', blocking_level: 'blocked' },
      ],
      project_key_node_snapshots: [
        { id: 'key-node-1', project_id: 'project-1', source_task_ids: ['task-1'], status: 'active' },
      ],
      project_entity_links: [
        { id: 'link-drawing', project_id: 'project-1', source_entity_type: 'construction_drawing', source_entity_id: 'drawing-1', target_entity_type: 'task', target_entity_id: 'task-1', status: 'active' },
        { id: 'link-material', project_id: 'project-1', source_entity_type: 'project_material', source_entity_id: 'material-1', target_entity_type: 'task', target_entity_id: 'task-1', status: 'active' },
      ],
      project_materials: [
        { id: 'material-1', project_id: 'project-1', requires_sample_confirmation: true, sample_confirmed: false, requires_inspection: false, expected_arrival_date: '2026-01-01' },
      ],
      acceptance_plans: [
        { id: 'acceptance-1', project_id: 'project-1', task_id: 'task-1', status: 'submitted' },
      ],
      risks: [
        { id: 'risk-1', project_id: 'project-1', task_id: 'task-1', status: 'identified', level: 'high' },
      ],
      issues: [
        { id: 'issue-1', project_id: 'project-1', task_id: 'task-1', status: 'open', severity: 'critical' },
      ],
      notifications: [
        {
          id: 'warning-1',
          project_id: 'project-1',
          task_id: 'task-1',
          source_entity_type: 'warning',
          type: 'critical_path_delay',
          category: 'critical_path_delay',
          severity: 'critical',
          title: 'Critical path delay',
          content: 'Task is delayed on the critical path',
          warning_lifecycle_status: 'active',
          status: 'active',
          first_seen_at: '2026-05-17T00:00:00.000Z',
          created_at: '2026-05-17T00:00:00.000Z',
        },
      ],
      project_daily_snapshot: [
        { project_id: 'project-1', snapshot_date: '2026-05-17', business_health_score: 60, deviation_summary: { delayed_tasks: 1 }, health_confidence_flag: 'high' },
      ],
      projects: [
        { id: 'project-1', health_score: 60, health_status: 'warning', overall_progress: 40 },
      ],
    })

    const source = await resolveMonthlyPlanGenerationSourceV1474('project-1', '2026-05')

    expect(source.generationSummary).toMatchObject({
      keyNodeSnapshotCount: 1,
      keyNodeImpactedTaskCount: 1,
      dependencyEdgeCount: 1,
      requiredDependencyCount: 1,
      unsatisfiedConditionCount: 1,
      blockingConditionCount: 1,
      activeObstacleCount: 1,
      blockingObstacleCount: 1,
      drawingLinkCount: 1,
      materialLinkCount: 1,
      materialAttentionCount: 1,
      acceptancePendingCount: 1,
      openRiskCount: 1,
      openIssueCount: 1,
      activeWarningCount: 1,
      criticalExternalSignalCount: 3,
      healthRiskSignalCount: 2,
      buildingPatternSeedMatchCount: 1,
      buildingPatternHighConfidenceCount: 1,
      buildingPatternControlChainCount: 1,
      buildingPatternDurationCurveProfileCount: 1,
      buildingPatternPriorityAvg: 74,
      constructionRhythmExpansionCandidateCount: 1,
      constructionRhythmWorkfaceCandidateCount: 1,
      constructionRhythmStrategyCount: 0,
      constructionRhythmArbitrationSignalCount: 3,
      constructionRhythmCandidateDependencySignalCount: 1,
      constructionRhythmCandidateEarliestStartSignalCount: 1,
      constructionRhythmCandidateDurationContextSignalCount: 1,
      constructionRhythmCoordinationSignalCount: 7,
      constructionRhythmDependencyCoordinationSignalCount: 2,
      constructionRhythmEarliestStartCoordinationSignalCount: 1,
      constructionRhythmDurationContextCoordinationSignalCount: 4,
    })
    expect(source.generationSummary.reasons.map((reason) => reason.code)).toEqual(
      expect.arrayContaining([
        'monthly_execution_constraints',
        'monthly_health_deviation_signal',
        'construction_rhythm_expansion',
        'construction_rhythm_arbitration',
        'construction_rhythm_coordination',
        'monthly_building_pattern_context',
      ]),
    )
    expect(source.items[0].generation_metadata).toMatchObject({
      blocking_factors: expect.arrayContaining([
        'predecessor_unfinished',
        'condition_unmet',
        'active_obstacle',
        'mapping_attention',
      ]),
      generation_reasons: expect.arrayContaining(['execution_fact_attention', 'building_pattern_context']),
      algorithm_context: expect.objectContaining({
        building_pattern_code: 'high_rise_core_and_floor_cycle',
        building_pattern_confidence: 82,
        building_pattern_control_chain_count: 1,
      }),
    })
    expect(mocks.resolveV1474BuildingPatternMatch).toHaveBeenCalledWith(
      expect.stringContaining('Concrete pour'),
      expect.objectContaining({
        standardWorkCode: '02-01-03-P04',
        projectTypeCode: 'residential',
        structureTypeCode: 'shear_wall',
        methodVariantCodes: ['aluminum_formwork'],
        scopeDimensions: expect.arrayContaining(['building', 'floor']),
        rhythmDrivers: expect.arrayContaining(['floor_count', 'building_count']),
        primaryWorkfaceType: 'standard_floor',
        phaseWindow: 'superstructure',
        expansionStrategy: 'floor_ordered',
      }),
    )
    expect(mocks.supabaseFrom).not.toHaveBeenCalledWith('warnings')
    expect(mocks.supabaseFrom).toHaveBeenCalledWith('notifications')
  })

  it('carries over only actual remaining progress when the previous monthly target is missing', async () => {
    mockSupabaseRows({
      task_baselines: [],
      tasks: [],
      monthly_plans: [
        { id: 'previous-plan', project_id: 'project-1', month: '2026-04', version: 1, status: 'confirmed' },
      ],
      monthly_plan_items: [
        {
          id: 'previous-item-1',
          project_id: 'project-1',
          monthly_plan_version_id: 'previous-plan',
          source_task_id: 'task-1',
          title: 'Structure carryover',
          planned_start_date: '2026-04-10',
          planned_end_date: '2026-04-30',
          target_progress: null,
          current_progress: 45,
          sort_order: 1,
          commitment_status: 'planned',
          manual_override_fields: {},
          generation_metadata: {},
        },
      ],
    })

    const source = await resolveMonthlyPlanGenerationSourceV1474('project-1', '2026-05')

    expect(source.items).toHaveLength(1)
    expect(source.items[0]).toMatchObject({
      carryover_from_item_id: 'previous-item-1',
      current_progress: 45,
      target_progress: 45,
      commitment_status: 'carried_over',
    })
    expect(source.items[0].generation_metadata).toEqual(expect.objectContaining({
      generation_reasons: expect.arrayContaining(['carryover_unfinished']),
      target_progress_method: 'actual_remaining',
    }))
  })

  it('uses E2 duration forecasts to prevent over-committed monthly draft targets across carryover and new work', async () => {
    mocks.forecastBatchTasks.mockResolvedValue([
      {
        taskId: 'carryover-task',
        remainingDurationDays: 24,
        forecastFinishDate: '2026-05-24',
        forecastDelayDays: 4,
        confidenceLevel: 'medium',
        confidenceScore: 72,
        recommendedDurationDays: null,
        conservativeDurationDays: null,
        forecastSource: 'test',
        businessReason: null,
      },
      {
        taskId: 'new-task',
        remainingDurationDays: 20,
        forecastFinishDate: '2026-05-30',
        forecastDelayDays: 6,
        confidenceLevel: 'medium',
        confidenceScore: 70,
        recommendedDurationDays: null,
        conservativeDurationDays: null,
        forecastSource: 'test',
        businessReason: null,
      },
    ])

    mockSupabaseRows({
      task_baselines: [
        { id: 'baseline-1', project_id: 'project-1', version: 1, status: 'confirmed', confirmed_at: '2026-05-01T00:00:00.000Z' },
      ],
      task_baseline_items: [
        {
          id: 'baseline-item-new',
          baseline_version_id: 'baseline-1',
          source_task_id: 'new-task',
          title: 'New facade work',
          planned_start_date: '2026-05-01',
          planned_end_date: '2026-05-31',
          target_progress: 100,
          sort_order: 2,
          is_critical: false,
          is_milestone: false,
          manual_override_fields: {},
        },
      ],
      monthly_plans: [
        { id: 'previous-plan', project_id: 'project-1', month: '2026-04', version: 1, status: 'confirmed' },
      ],
      monthly_plan_items: [
        {
          id: 'previous-carryover',
          project_id: 'project-1',
          monthly_plan_version_id: 'previous-plan',
          source_task_id: 'carryover-task',
          title: 'Carryover structure',
          planned_start_date: '2026-04-01',
          planned_end_date: '2026-04-30',
          target_progress: 90,
          current_progress: 30,
          sort_order: 1,
          is_critical: true,
          commitment_status: 'planned',
          manual_override_fields: {},
          generation_metadata: {},
        },
      ],
    })

    const source = await resolveMonthlyPlanGenerationSourceV1474('project-1', '2026-05')
    const carryover = source.items.find((item) => item.source_task_id === 'carryover-task')
    const newWork = source.items.find((item) => item.source_task_id === 'new-task')

    expect(mocks.forecastBatchTasks).toHaveBeenCalledWith(
      expect.arrayContaining(['carryover-task', 'new-task']),
      expect.objectContaining({ triggerContext: 'monthly_plan_regeneration' }),
    )
    expect(source.generationSummary).toMatchObject({
      capacityBudgetDays: 21,
      capacityDemandDays: 44,
      capacityOverCommitted: true,
      capacityRebalancedItemCount: 2,
    })
    expect(carryover?.generation_metadata).toEqual(expect.objectContaining({
      algorithm_context: expect.objectContaining({
        e2_remaining_forecast_days: 24,
        e2_forecast_finish_date: '2026-05-24',
        monthly_capacity_budget_days: 21,
        monthly_capacity_budget_basis: 'workday_default_capacity_with_calendar_factor_ceiling',
        monthly_capacity_real_capacity_policy: 'default_capacity_not_real_field_capacity',
        monthly_capacity_workdays: 21,
        monthly_capacity_default_crew_factor: 1,
        monthly_capacity_calendar_factor: 1,
        monthly_capacity_effective_factor: 1,
        monthly_capacity_priority: 'carryover',
        monthly_readiness_pool: 'committable',
      }),
    }))
    expect(newWork?.target_progress).toBeLessThan(100)
    expect(newWork?.generation_metadata).toEqual(expect.objectContaining({
      generation_reasons: expect.arrayContaining(['monthly_capacity_rebalanced']),
      target_progress_method: 'e2_capacity_min',
      algorithm_context: expect.objectContaining({
        e2_remaining_forecast_days: 20,
        monthly_capacity_budget_days: 21,
        monthly_capacity_allocated_days: 0,
        monthly_capacity_status: 'rebalanced',
        target_progress_formula: 'min(linear_target,e2_completable_target,capacity_allocatable_target)',
        target_progress_linear_target: 100,
        target_progress_e2_completable_target: 100,
        target_progress_capacity_allocatable_target: 0,
        monthly_readiness_pool: 'committable',
      }),
    }))
  })

  it('uses E2 remaining duration to cap a monthly target that planned dates would overstate', async () => {
    mocks.forecastBatchTasks.mockResolvedValue([
      {
        taskId: 'slow-task',
        remainingDurationDays: 45,
        forecastFinishDate: '2026-06-14',
        forecastDelayDays: 14,
        confidenceLevel: 'medium',
        confidenceScore: 70,
        recommendedDurationDays: null,
        conservativeDurationDays: null,
        forecastSource: 'test',
        businessReason: null,
      },
    ])

    mockSupabaseRows({
      task_baselines: [
        { id: 'baseline-1', project_id: 'project-1', version: 1, status: 'confirmed', confirmed_at: '2026-05-01T00:00:00.000Z' },
      ],
      task_baseline_items: [
        {
          id: 'baseline-item-slow',
          baseline_version_id: 'baseline-1',
          source_task_id: 'slow-task',
          title: 'Slow finishing work',
          planned_start_date: '2026-05-01',
          planned_end_date: '2026-05-20',
          target_progress: 100,
          sort_order: 1,
          is_critical: false,
          is_milestone: false,
          manual_override_fields: {},
        },
      ],
      monthly_plans: [],
      monthly_plan_items: [],
    })

    const source = await resolveMonthlyPlanGenerationSourceV1474('project-1', '2026-05')
    const item = source.items.find((candidate) => candidate.source_task_id === 'slow-task')

    expect(item?.target_progress).toBe(47)
    expect(item?.generation_metadata).toEqual(expect.objectContaining({
      target_progress_method: 'e2_capacity_min',
      generation_reasons: expect.arrayContaining(['monthly_capacity_rebalanced']),
      algorithm_context: expect.objectContaining({
        e2_remaining_forecast_days: 45,
        monthly_capacity_budget_days: 21,
        monthly_capacity_allocated_days: 21,
        monthly_capacity_status: 'rebalanced',
        target_progress_formula: 'min(linear_target,e2_completable_target,capacity_allocatable_target)',
        target_progress_linear_target: 100,
        target_progress_e2_completable_target: 47,
        target_progress_capacity_allocatable_target: 47,
      }),
    }))
  })

  it('does not use naked E2 values when typed production-day facts are unavailable', async () => {
    const unavailableMetric = {
      value: null,
      unit: 'construction_production_day',
      calendarRef: null,
      calendarVersion: null,
      timezone: 'Asia/Shanghai',
      asOf: '2026-05-01',
      availability: 'unavailable',
      unavailableReason: 'construction_calendar_identity_missing',
    }
    mocks.forecastBatchTasks.mockResolvedValue([{
      taskId: 'unavailable-task',
      remainingDurationDays: 45,
      remainingDuration: unavailableMetric,
      forecastFinishDate: '2026-06-14',
      forecastDelayDays: 14,
      forecastDelay: unavailableMetric,
      confidenceLevel: 'unavailable',
    }])
    mockSupabaseRows({
      task_baselines: [
        { id: 'baseline-1', project_id: 'project-1', version: 1, status: 'confirmed', confirmed_at: '2026-05-01T00:00:00.000Z' },
      ],
      task_baseline_items: [{
        id: 'baseline-item-unavailable',
        baseline_version_id: 'baseline-1',
        source_task_id: 'unavailable-task',
        title: 'Unavailable forecast work',
        planned_start_date: '2026-05-01',
        planned_end_date: '2026-05-20',
        target_progress: 100,
        sort_order: 1,
        is_critical: false,
        is_milestone: false,
        manual_override_fields: {},
      }],
      monthly_plans: [],
      monthly_plan_items: [],
    })

    const source = await resolveMonthlyPlanGenerationSourceV1474('project-1', '2026-05')
    const item = source.items.find((candidate) => candidate.source_task_id === 'unavailable-task')

    expect(source.generationSummary).toMatchObject({
      forecastDelayedCount: 0,
      maxForecastDelayDays: 0,
    })
    expect(item?.target_progress).toBe(21)
    expect(item?.target_progress).not.toBe(47)
    expect(item?.generation_metadata?.algorithm_context?.e2_remaining_forecast_days).toBeNull()
    expect(item?.generation_metadata?.algorithm_context?.e2_forecast_delay_days).toBeNull()
  })

  it.each([
    {
      label: 'missing calendar identity',
      remainingDuration: {
        value: 45,
        unit: 'construction_production_day',
        calendarRef: null,
        calendarVersion: null,
        timezone: 'Asia/Shanghai',
        asOf: '2026-05-01',
        availability: 'available',
        unavailableReason: null,
      },
      forecastDelay: {
        value: 14,
        unit: 'construction_production_day',
        calendarRef: null,
        calendarVersion: null,
        timezone: 'Asia/Shanghai',
        asOf: '2026-05-01',
        availability: 'available',
        unavailableReason: null,
      },
    },
    {
      label: 'negative production-day values',
      remainingDuration: freshCpmMetric(-5),
      forecastDelay: freshCpmMetric(-2),
    },
  ])('fails closed for E2 metrics with $label despite raw aliases and finish date', async ({ remainingDuration, forecastDelay }) => {
    mocks.forecastBatchTasks.mockResolvedValue([{
      taskId: 'invalid-e2-task',
      remainingDurationDays: 45,
      remainingDuration,
      forecastFinishDate: '2026-06-14',
      forecastDelayDays: 14,
      forecastDelay,
      confidenceLevel: 'medium',
    }])
    mockSupabaseRows({
      task_baselines: [
        { id: 'baseline-1', project_id: 'project-1', version: 1, status: 'confirmed', confirmed_at: '2026-05-01T00:00:00.000Z' },
      ],
      task_baseline_items: [{
        id: 'baseline-item-invalid-e2',
        baseline_version_id: 'baseline-1',
        source_task_id: 'invalid-e2-task',
        title: 'Invalid E2 task',
        planned_start_date: '2026-05-01',
        planned_end_date: '2026-05-20',
        target_progress: 100,
        sort_order: 1,
        is_critical: false,
        is_milestone: false,
        manual_override_fields: {},
      }],
      monthly_plans: [],
      monthly_plan_items: [],
    })

    const source = await resolveMonthlyPlanGenerationSourceV1474('project-1', '2026-05')
    const item = source.items.find((candidate) => candidate.source_task_id === 'invalid-e2-task')

    expect(source.generationSummary).toMatchObject({
      forecastDelayedCount: 0,
      maxForecastDelayDays: 0,
    })
    expect(item?.generation_metadata?.algorithm_context).toEqual(expect.objectContaining({
      e2_remaining_forecast_days: null,
      e2_forecast_delay_days: null,
      e2_forecast_finish_date: null,
    }))
  })

  it('deducts construction calendar shutdown windows from monthly capacity workdays', async () => {
    mocks.resolveAlgorithmSeedRecords.mockImplementation(async (assetType: string) => {
      if (assetType !== 'work_calendar') return []
      return [{
        holidayCode: 'project_shutdown_2026_05',
        holidayName: 'Project shutdown in May',
        startDate: '2026-05-06',
        endDate: '2026-05-08',
        counts_as_construction_shutdown: true,
        __resolverVersionId: 'calendar-v1',
      }]
    })
    mocks.forecastBatchTasks.mockResolvedValue([
      { taskId: 'shutdown-task', remainingDurationDays: 21, forecastFinishDate: '2026-05-31', forecastDelayDays: 0, confidenceLevel: 'medium' },
    ])

    mockSupabaseRows({
      task_baselines: [
        { id: 'baseline-1', project_id: 'project-1', version: 1, status: 'confirmed', confirmed_at: '2026-05-01T00:00:00.000Z' },
      ],
      task_baseline_items: [
        {
          id: 'shutdown-item',
          baseline_version_id: 'baseline-1',
          source_task_id: 'shutdown-task',
          title: 'Shutdown sensitive work',
          planned_start_date: '2026-05-01',
          planned_end_date: '2026-05-31',
          target_progress: 100,
          sort_order: 1,
          is_critical: false,
          is_milestone: false,
          manual_override_fields: {},
        },
      ],
      monthly_plans: [],
      monthly_plan_items: [],
    })

    const source = await resolveMonthlyPlanGenerationSourceV1474('project-1', '2026-05')
    const item = source.items.find((candidate) => candidate.source_task_id === 'shutdown-task')

    expect(source.generationSummary).toMatchObject({
      capacityBudgetDays: 18,
      capacityDemandDays: 21,
      capacityAllocatedDays: 18,
      capacityOverCommitted: true,
    })
    expect(item?.generation_metadata.algorithm_context).toEqual(expect.objectContaining({
      monthly_capacity_workdays: 18,
      monthly_capacity_calendar_basis: 'official_construction_calendar_seed',
      monthly_capacity_calendar_shutdown_deducted_days: 3,
      monthly_capacity_calendar_source: 'resolveConstructionCalendarContext',
    }))
  })

  it('keeps E2-first target below linear when the E2 finish date is outside the month even in a light month', async () => {
    mocks.forecastBatchTasks.mockResolvedValue([
      {
        taskId: 'light-but-late-task',
        remainingDurationDays: 10,
        forecastFinishDate: '2026-06-10',
        forecastDelayDays: 10,
        confidenceLevel: 'medium',
      },
    ])

    mockSupabaseRows({
      task_baselines: [
        { id: 'baseline-1', project_id: 'project-1', version: 1, status: 'confirmed', confirmed_at: '2026-05-01T00:00:00.000Z' },
      ],
      task_baseline_items: [
        {
          id: 'baseline-item-light-late',
          baseline_version_id: 'baseline-1',
          source_task_id: 'light-but-late-task',
          title: 'Light but late work',
          planned_start_date: '2026-05-01',
          planned_end_date: '2026-05-31',
          target_progress: 100,
          sort_order: 1,
          is_critical: false,
          is_milestone: false,
          manual_override_fields: {},
        },
      ],
      monthly_plans: [],
      monthly_plan_items: [],
    })

    const source = await resolveMonthlyPlanGenerationSourceV1474('project-1', '2026-05')
    const item = source.items.find((candidate) => candidate.source_task_id === 'light-but-late-task')

    expect(item?.target_progress).toBeLessThan(100)
    expect(item?.generation_metadata).toEqual(expect.objectContaining({
      target_progress_method: 'e2_capacity_min',
      algorithm_context: expect.objectContaining({
        e2_remaining_forecast_days: 10,
        e2_forecast_finish_date: '2026-06-10',
        target_progress_formula: 'min(linear_target,e2_completable_target,capacity_allocatable_target)',
      }),
    }))
  })

  it('includes not-started baseline work when E2 forecasts completion inside the generated month', async () => {
    mocks.forecastBatchTasks.mockResolvedValue([
      {
        taskId: 'forecast-june-task',
        remainingDurationDays: 8,
        forecastFinishDate: '2026-06-10',
        forecastDelayDays: 21,
        confidenceLevel: 'medium',
      },
    ])

    mockSupabaseRows({
      task_baselines: [
        { id: 'baseline-1', project_id: 'project-1', version: 1, status: 'confirmed', confirmed_at: '2026-05-01T00:00:00.000Z' },
      ],
      task_baseline_items: [
        {
          id: 'baseline-item-forecast-june',
          baseline_version_id: 'baseline-1',
          source_task_id: 'forecast-june-task',
          title: 'Forecasted June finish work',
          planned_start_date: '2026-05-01',
          planned_end_date: '2026-05-20',
          target_progress: 100,
          sort_order: 1,
          is_critical: false,
          is_milestone: false,
          manual_override_fields: {},
        },
      ],
      monthly_plans: [],
      monthly_plan_items: [],
    })

    const source = await resolveMonthlyPlanGenerationSourceV1474('project-1', '2026-06')
    const item = source.items.find((candidate) => candidate.source_task_id === 'forecast-june-task')

    expect(item).toBeDefined()
    expect(item?.generation_metadata).toEqual(expect.objectContaining({
      generation_reasons: expect.arrayContaining(['e2_forecast_month_overlap']),
      algorithm_context: expect.objectContaining({
        e2_forecast_inclusion: true,
        e2_forecast_finish_date: '2026-06-10',
        e2_remaining_forecast_days: 8,
      }),
    }))
  })

  it('includes not-started schedule work when E2 forecasts completion inside the generated month', async () => {
    mocks.forecastBatchTasks.mockResolvedValue([
      {
        taskId: 'forecast-june-schedule-task',
        remainingDurationDays: 6,
        forecastFinishDate: '2026-06-12',
        forecastDelayDays: 15,
        confidenceLevel: 'medium',
      },
    ])

    mockSupabaseRows({
      task_baselines: [
        { id: 'baseline-1', project_id: 'project-1', version: 1, status: 'draft', confirmed_at: null },
      ],
      tasks: [
        {
          id: 'forecast-june-schedule-task',
          project_id: 'project-1',
          title: 'Forecasted June schedule work',
          planned_start_date: '2026-05-01',
          planned_end_date: '2026-05-18',
          start_date: '2026-05-01',
          end_date: '2026-05-18',
          progress: 0,
          status: 'planned',
          sort_order: 1,
          is_critical: false,
          is_milestone: false,
        },
      ],
      monthly_plans: [],
      monthly_plan_items: [],
    })

    const source = await resolveMonthlyPlanGenerationSourceV1474('project-1', '2026-06')
    const item = source.items.find((candidate) => candidate.source_task_id === 'forecast-june-schedule-task')

    expect(item).toBeDefined()
    expect(item?.generation_metadata).toEqual(expect.objectContaining({
      generation_reasons: expect.arrayContaining(['e2_forecast_month_overlap']),
      algorithm_context: expect.objectContaining({
        e2_forecast_inclusion: true,
        monthly_planned_window_overlap: false,
        e2_forecast_finish_date: '2026-06-12',
        e2_remaining_forecast_days: 6,
      }),
    }))
  })

  it('reuses E2 inclusion forecasts instead of re-forecasting the same admitted task twice', async () => {
    mocks.forecastBatchTasks.mockResolvedValue([
      {
        taskId: 'forecast-reuse-task',
        remainingDurationDays: 6,
        forecastFinishDate: '2026-06-12',
        forecastDelayDays: 15,
        confidenceLevel: 'medium',
      },
    ])

    mockSupabaseRows({
      task_baselines: [
        { id: 'baseline-1', project_id: 'project-1', version: 1, status: 'confirmed', confirmed_at: '2026-05-01T00:00:00.000Z' },
      ],
      task_baseline_items: [
        {
          id: 'baseline-item-forecast-reuse',
          baseline_version_id: 'baseline-1',
          source_task_id: 'forecast-reuse-task',
          title: 'Forecast reuse work',
          planned_start_date: '2026-05-01',
          planned_end_date: '2026-05-18',
          target_progress: 100,
          sort_order: 1,
          is_critical: false,
          is_milestone: false,
          manual_override_fields: {},
        },
      ],
      monthly_plans: [],
      monthly_plan_items: [],
    })

    const source = await resolveMonthlyPlanGenerationSourceV1474('project-1', '2026-06')
    const item = source.items.find((candidate) => candidate.source_task_id === 'forecast-reuse-task')

    expect(item).toBeDefined()
    expect(mocks.forecastBatchTasks).toHaveBeenCalledTimes(1)
    expect(mocks.forecastBatchTasks).toHaveBeenCalledWith(
      ['forecast-reuse-task'],
      expect.objectContaining({ triggerContext: 'monthly_plan_regeneration' }),
    )
  })

  it('does not pre-scan future-month tasks for E2 inclusion', async () => {
    mockSupabaseRows({
      task_baselines: [
        { id: 'baseline-1', project_id: 'project-1', version: 1, status: 'confirmed', confirmed_at: '2026-05-01T00:00:00.000Z' },
      ],
      task_baseline_items: [
        {
          id: 'baseline-item-future',
          baseline_version_id: 'baseline-1',
          source_task_id: 'future-task',
          title: 'Future work',
          planned_start_date: '2026-07-01',
          planned_end_date: '2026-07-18',
          target_progress: 100,
          sort_order: 1,
          is_critical: false,
          is_milestone: false,
          manual_override_fields: {},
        },
      ],
      monthly_plans: [],
      monthly_plan_items: [],
    })

    const source = await resolveMonthlyPlanGenerationSourceV1474('project-1', '2026-06')

    expect(source.items.find((candidate) => candidate.source_task_id === 'future-task')).toBeUndefined()
    expect(mocks.forecastBatchTasks).not.toHaveBeenCalled()
  })

  it('consumes bounded planning replay readback for monthly capacity and E2 target discount metadata', async () => {
    mocks.readPlanningReplayCalibrationReadback.mockResolvedValue({
      status: 'ready',
      coarseProcessKey: 'standard_work:STD-STRUCT-001',
      evidenceRefs: ['algorithm_asset_candidate_events:candidate-ok', 'algorithm_asset_replay_runs:run-ok'],
      writePolicy: 'candidate_overlay_only_no_fact_mutation',
      acceptedSampleCount: 8,
      originalMae: 4,
      replayMae: 2,
      maeImprovement: 2,
      overcompensationRate: 0.1,
      e1DurationAdjustmentDays: null,
      e2ResidualCorrectionDays: null,
      capacityBudgetFactor: 0.9,
      priorityWeightAdjustment: 0.1,
      e2TargetDiscountFactor: 0.9,
      rejectedEvidence: [],
    })
    mocks.forecastBatchTasks.mockResolvedValue([
      {
        taskId: 'replay-monthly-task',
        remainingDurationDays: 21,
        forecastFinishDate: '2026-05-31',
        forecastDelayDays: 0,
        confidenceLevel: 'medium',
      },
    ])

    mockSupabaseRows({
      task_baselines: [
        { id: 'baseline-1', project_id: 'project-1', version: 1, status: 'confirmed', confirmed_at: '2026-05-01T00:00:00.000Z' },
      ],
      task_baseline_items: [
        {
          id: 'baseline-item-replay-monthly',
          baseline_version_id: 'baseline-1',
          source_task_id: 'replay-monthly-task',
          title: 'Replay calibrated monthly work',
          planned_start_date: '2026-05-01',
          planned_end_date: '2026-05-31',
          target_progress: 100,
          sort_order: 1,
          is_critical: false,
          is_milestone: false,
          standard_work_code: 'STD-STRUCT-001',
          manual_override_fields: {},
        },
      ],
      monthly_plans: [],
      monthly_plan_items: [],
    })

    const source = await resolveMonthlyPlanGenerationSourceV1474('project-1', '2026-05')
    const item = source.items.find((candidate) => candidate.source_task_id === 'replay-monthly-task')

    expect(mocks.readPlanningReplayCalibrationReadback).toHaveBeenCalledWith(expect.objectContaining({
      projectId: 'project-1',
      standardWorkCode: 'STD-STRUCT-001',
    }))
    expect(item?.target_progress).toBe(77)
    expect(item?.generation_metadata).toEqual(expect.objectContaining({
      target_progress_method: 'e2_capacity_min',
      generation_reasons: expect.arrayContaining(['planning_replay_calibration_readback']),
      algorithm_context: expect.objectContaining({
        planning_replay_calibration_status: 'ready',
        planning_replay_calibration_write_policy: 'candidate_overlay_only_no_fact_mutation',
        planning_replay_calibration_evidence_refs: ['algorithm_asset_candidate_events:candidate-ok', 'algorithm_asset_replay_runs:run-ok'],
        monthly_capacity_budget_days: 18,
        monthly_capacity_raw_budget_days: 21,
        monthly_capacity_calibration_factor: 0.9,
        target_progress_e2_discount_factor: 0.9,
        target_progress_e2_raw_completable_target: 86,
        target_progress_e2_completable_target: 77,
        target_progress_capacity_allocatable_target: 86,
      }),
    }))
  })

  it('uses fresh near-critical float tier in capacity allocation priority instead of metadata only', async () => {
    mocks.getProjectCriticalPathSnapshot.mockResolvedValue({
      calculationStatus: 'fresh',
      calculatedAt: '2026-05-01T08:00:00.000Z',
      projectDuration: freshCpmMetric(30),
      tasks: [
        { taskId: 'pseudo-task', floatDays: 8, float: freshCpmMetric(8), isAutoCritical: false, isManualAttention: false, isManualInserted: false, durationDays: 21, title: 'Pseudo critical' },
        { taskId: 'near-task', floatDays: 2, float: freshCpmMetric(2), isAutoCritical: false, isManualAttention: false, isManualInserted: false, durationDays: 21, title: 'Near critical' },
      ],
      displayTaskIds: [],
      autoTaskIds: [],
    })
    mocks.forecastBatchTasks.mockResolvedValue([
      { taskId: 'pseudo-task', remainingDurationDays: 21, forecastFinishDate: '2026-05-31', forecastDelayDays: 0, confidenceLevel: 'medium' },
      { taskId: 'near-task', remainingDurationDays: 21, forecastFinishDate: '2026-05-31', forecastDelayDays: 0, confidenceLevel: 'medium' },
    ])

    mockSupabaseRows({
      task_baselines: [
        { id: 'baseline-1', project_id: 'project-1', version: 1, status: 'confirmed', confirmed_at: '2026-05-01T00:00:00.000Z' },
      ],
      task_baseline_items: [
        {
          id: 'pseudo-item',
          baseline_version_id: 'baseline-1',
          source_task_id: 'pseudo-task',
          title: 'Pseudo critical',
          planned_start_date: '2026-05-01',
          planned_end_date: '2026-05-31',
          sort_order: 1,
          is_critical: false,
          generation_metadata: {
            resource_class: 'civil_crew',
            scope_keys: { building: 'A', floor: '1F', zone: 'east', workface: 'wf-1' },
          },
        },
        {
          id: 'near-item',
          baseline_version_id: 'baseline-1',
          source_task_id: 'near-task',
          title: 'Near critical',
          planned_start_date: '2026-05-01',
          planned_end_date: '2026-05-31',
          sort_order: 2,
          is_critical: false,
          generation_metadata: {
            resource_class: 'civil_crew',
            scope_keys: { building: 'A', floor: '1F', zone: 'east', workface: 'wf-1' },
          },
        },
      ],
      monthly_plans: [],
      monthly_plan_items: [],
    })

    const source = await resolveMonthlyPlanGenerationSourceV1474('project-1', '2026-05')
    const pseudo = source.items.find((item) => item.source_task_id === 'pseudo-task')
    const near = source.items.find((item) => item.source_task_id === 'near-task')

    expect(near?.generation_metadata.algorithm_context).toEqual(expect.objectContaining({
      critical_float_tier: 'near_critical',
      monthly_capacity_priority: 'near_critical',
      monthly_capacity_allocated_days: 21,
    }))
    expect(pseudo?.generation_metadata.algorithm_context).toEqual(expect.objectContaining({
      critical_float_tier: 'pseudo_critical',
      monthly_capacity_priority: 'new_work',
      monthly_capacity_allocated_days: 0,
      monthly_capacity_status: 'rebalanced',
    }))
  })

  it('does not derive a critical tier from a legacy raw float when typed float is unavailable', async () => {
    mocks.getProjectCriticalPathSnapshot.mockResolvedValue({
      calculationStatus: 'fresh',
      tasks: [{
        taskId: 'unavailable-float-task',
        floatDays: 0,
        float: {
          value: null,
          unit: 'construction_production_day',
          availability: 'unavailable',
          unavailableReason: 'construction_calendar_identity_missing',
        },
        isAutoCritical: false,
        isManualAttention: false,
        isManualInserted: false,
        durationDays: 21,
        title: 'Unavailable float',
      }],
      displayTaskIds: [],
      autoTaskIds: [],
    })
    mocks.forecastBatchTasks.mockResolvedValue([
      { taskId: 'unavailable-float-task', remainingDurationDays: 21, forecastFinishDate: '2026-05-31', forecastDelayDays: 0, confidenceLevel: 'medium' },
    ])

    mockSupabaseRows({
      task_baselines: [
        { id: 'baseline-1', project_id: 'project-1', version: 1, status: 'confirmed', confirmed_at: '2026-05-01T00:00:00.000Z' },
      ],
      task_baseline_items: [{
        id: 'unavailable-float-item',
        baseline_version_id: 'baseline-1',
        source_task_id: 'unavailable-float-task',
        title: 'Unavailable float',
        planned_start_date: '2026-05-01',
        planned_end_date: '2026-05-31',
        sort_order: 1,
        is_critical: true,
        generation_metadata: {
          resource_class: 'civil_crew',
          scope_keys: { building: 'A', floor: '1F', zone: 'east', workface: 'wf-1' },
          algorithm_context: { critical_float_tier: 'true_critical' },
        },
      }],
      monthly_plans: [],
      monthly_plan_items: [],
    })

    const source = await resolveMonthlyPlanGenerationSourceV1474('project-1', '2026-05')
    const item = source.items.find((candidate) => candidate.source_task_id === 'unavailable-float-task')

    expect(item?.generation_metadata.algorithm_context).toEqual(expect.objectContaining({
      fresh_float_days: null,
      monthly_capacity_priority: 'new_work',
    }))
    expect(item?.generation_metadata.algorithm_context?.critical_float_tier).toBeNull()
  })

  it('does not use a cached-after-failure critical path snapshot for monthly capacity priority', async () => {
    mocks.getProjectCriticalPathSnapshot.mockResolvedValue({
      calculationStatus: 'cached_after_failure',
      tasks: [{
        taskId: 'stale-snapshot-task',
        floatDays: 0,
        float: { value: 0, unit: 'construction_production_day', availability: 'available' },
        isAutoCritical: true,
        isManualAttention: false,
        isManualInserted: false,
        durationDays: 21,
        title: 'Stale snapshot critical task',
      }],
      displayTaskIds: ['stale-snapshot-task'],
      autoTaskIds: ['stale-snapshot-task'],
    })
    mocks.forecastBatchTasks.mockResolvedValue([
      { taskId: 'stale-snapshot-task', remainingDurationDays: 21, forecastFinishDate: '2026-05-31', forecastDelayDays: 0, confidenceLevel: 'medium' },
    ])

    mockSupabaseRows({
      task_baselines: [
        { id: 'baseline-1', project_id: 'project-1', version: 1, status: 'confirmed', confirmed_at: '2026-05-01T00:00:00.000Z' },
      ],
      task_baseline_items: [{
        id: 'stale-snapshot-item',
        baseline_version_id: 'baseline-1',
        source_task_id: 'stale-snapshot-task',
        title: 'Stale snapshot critical task',
        planned_start_date: '2026-05-01',
        planned_end_date: '2026-05-31',
        sort_order: 1,
        is_critical: true,
        generation_metadata: {
          resource_class: 'civil_crew',
          scope_keys: { building: 'A', floor: '1F', zone: 'east', workface: 'wf-1' },
          algorithm_context: { critical_float_tier: 'true_critical' },
        },
      }],
      monthly_plans: [],
      monthly_plan_items: [],
    })

    const source = await resolveMonthlyPlanGenerationSourceV1474('project-1', '2026-05')
    const item = source.items.find((candidate) => candidate.source_task_id === 'stale-snapshot-task')

    expect(item?.generation_metadata.algorithm_context).toEqual(expect.objectContaining({
      fresh_float_days: null,
      fresh_float_snapshot_status: 'cached_after_failure',
      monthly_capacity_priority: 'new_work',
    }))
    expect(item?.generation_metadata.algorithm_context?.critical_float_tier).toBeNull()
  })

  it('clears stale critical metadata when every monthly item lacks a source task id', async () => {
    mocks.getProjectCriticalPathSnapshot.mockResolvedValue({
      calculationStatus: 'cached_after_failure',
      tasks: [],
      displayTaskIds: [],
      autoTaskIds: [],
    })
    mockSupabaseRows({
      task_baselines: [
        { id: 'baseline-1', project_id: 'project-1', version: 1, status: 'confirmed', confirmed_at: '2026-05-01T00:00:00.000Z' },
      ],
      task_baseline_items: [{
        id: 'orphan-critical-item',
        baseline_version_id: 'baseline-1',
        source_task_id: null,
        title: 'Orphan critical item',
        planned_start_date: '2026-05-01',
        planned_end_date: '2026-05-31',
        sort_order: 1,
        is_critical: true,
        generation_metadata: {
          algorithm_context: { critical_float_tier: 'true_critical' },
        },
      }],
      monthly_plans: [],
      monthly_plan_items: [],
    })

    const source = await resolveMonthlyPlanGenerationSourceV1474('project-1', '2026-05')
    const item = source.items.find((candidate) => candidate.title === 'Orphan critical item')

    expect(item?.generation_metadata.algorithm_context).toEqual(expect.objectContaining({
      fresh_float_days: null,
      fresh_float_authority_checked: true,
      fresh_float_snapshot_status: 'cached_after_failure',
      critical_float_tier: null,
      monthly_capacity_priority: 'new_work',
    }))
  })

  it.each([
    { calculatedAt: '2026-02-30T08:00:00.000Z', asOf: '2026-03-02' },
    { calculatedAt: '2025-02-29T08:00:00.000Z', asOf: '2025-03-01' },
  ])('rejects a fresh CPM float with nonexistent Gregorian calculatedAt $calculatedAt', async ({ calculatedAt, asOf }) => {
    mocks.getProjectCriticalPathSnapshot.mockResolvedValue({
      calculationStatus: 'fresh',
      calculatedAt,
      projectDuration: freshCpmMetric(30, { asOf }),
      tasks: [{
        taskId: 'invalid-calculated-at-task',
        floatDays: 0,
        float: freshCpmMetric(0, { asOf }),
        isAutoCritical: true,
        isManualAttention: false,
        isManualInserted: false,
        durationDays: 21,
        title: 'Invalid calculatedAt task',
      }],
      displayTaskIds: ['invalid-calculated-at-task'],
      autoTaskIds: ['invalid-calculated-at-task'],
    })
    mocks.forecastBatchTasks.mockResolvedValue([
      { taskId: 'invalid-calculated-at-task', remainingDurationDays: 21, forecastFinishDate: '2026-05-31', forecastDelayDays: 0, confidenceLevel: 'medium' },
    ])
    mockSupabaseRows({
      task_baselines: [
        { id: 'baseline-1', project_id: 'project-1', version: 1, status: 'confirmed', confirmed_at: '2026-05-01T00:00:00.000Z' },
      ],
      task_baseline_items: [{
        id: 'invalid-calculated-at-item',
        baseline_version_id: 'baseline-1',
        source_task_id: 'invalid-calculated-at-task',
        title: 'Invalid calculatedAt task',
        planned_start_date: '2026-05-01',
        planned_end_date: '2026-05-31',
        sort_order: 1,
        is_critical: true,
        generation_metadata: {
          algorithm_context: { critical_float_tier: 'true_critical' },
        },
      }],
      monthly_plans: [],
      monthly_plan_items: [],
    })

    const source = await resolveMonthlyPlanGenerationSourceV1474('project-1', '2026-05')
    const item = source.items.find((candidate) => candidate.source_task_id === 'invalid-calculated-at-task')

    expect(item?.generation_metadata.algorithm_context).toEqual(expect.objectContaining({
      fresh_float_days: null,
      critical_float_tier: null,
      monthly_capacity_priority: 'new_work',
    }))
  })

  it('accepts a valid cross-timezone CPM calculatedAt when its business date matches the metric asOf', async () => {
    mocks.getProjectCriticalPathSnapshot.mockResolvedValue({
      calculationStatus: 'fresh',
      calculatedAt: '2026-04-30T16:30:00.000Z',
      projectDuration: freshCpmMetric(30),
      tasks: [{
        taskId: 'valid-cross-timezone-task',
        floatDays: 0,
        float: freshCpmMetric(0),
        isAutoCritical: true,
        isManualAttention: false,
        isManualInserted: false,
        durationDays: 21,
        title: 'Valid cross-timezone task',
      }],
      displayTaskIds: ['valid-cross-timezone-task'],
      autoTaskIds: ['valid-cross-timezone-task'],
    })
    mocks.forecastBatchTasks.mockResolvedValue([
      { taskId: 'valid-cross-timezone-task', remainingDurationDays: 21, forecastFinishDate: '2026-05-31', forecastDelayDays: 0, confidenceLevel: 'medium' },
    ])
    mockSupabaseRows({
      task_baselines: [
        { id: 'baseline-1', project_id: 'project-1', version: 1, status: 'confirmed', confirmed_at: '2026-05-01T00:00:00.000Z' },
      ],
      task_baseline_items: [{
        id: 'valid-cross-timezone-item',
        baseline_version_id: 'baseline-1',
        source_task_id: 'valid-cross-timezone-task',
        title: 'Valid cross-timezone task',
        planned_start_date: '2026-05-01',
        planned_end_date: '2026-05-31',
        sort_order: 1,
        is_critical: false,
        generation_metadata: {},
      }],
      monthly_plans: [],
      monthly_plan_items: [],
    })

    const source = await resolveMonthlyPlanGenerationSourceV1474('project-1', '2026-05')
    const item = source.items.find((candidate) => candidate.source_task_id === 'valid-cross-timezone-task')

    expect(item?.generation_metadata.algorithm_context).toEqual(expect.objectContaining({
      fresh_float_days: 0,
      critical_float_tier: 'true_critical',
      monthly_capacity_priority: 'critical',
    }))
  })

  it('rejects a fresh CPM float whose calendar identity differs from the project snapshot', async () => {
    const projectMetric = {
      value: 30,
      unit: 'construction_production_day',
      calendarRef: 'work_calendar',
      calendarVersion: 'calendar-v1',
      timezone: 'Asia/Shanghai',
      asOf: '2026-05-01',
      availability: 'available',
      unavailableReason: null,
    }
    mocks.getProjectCriticalPathSnapshot.mockResolvedValue({
      calculationStatus: 'fresh',
      calculatedAt: '2026-05-01T08:00:00.000Z',
      projectDuration: projectMetric,
      tasks: [{
        taskId: 'mismatched-float-task',
        floatDays: 0,
        float: {
          ...projectMetric,
          value: 0,
          calendarVersion: 'calendar-v0',
        },
        isAutoCritical: true,
        isManualAttention: false,
        isManualInserted: false,
        durationDays: 21,
        title: 'Mismatched float identity',
      }],
      displayTaskIds: ['mismatched-float-task'],
      autoTaskIds: ['mismatched-float-task'],
    })
    mocks.forecastBatchTasks.mockResolvedValue([
      { taskId: 'mismatched-float-task', remainingDurationDays: 21, forecastFinishDate: '2026-05-31', forecastDelayDays: 0, confidenceLevel: 'medium' },
    ])

    mockSupabaseRows({
      task_baselines: [
        { id: 'baseline-1', project_id: 'project-1', version: 1, status: 'confirmed', confirmed_at: '2026-05-01T00:00:00.000Z' },
      ],
      task_baseline_items: [{
        id: 'mismatched-float-item',
        baseline_version_id: 'baseline-1',
        source_task_id: 'mismatched-float-task',
        title: 'Mismatched float identity',
        planned_start_date: '2026-05-01',
        planned_end_date: '2026-05-31',
        sort_order: 1,
        is_critical: false,
        generation_metadata: {
          resource_class: 'civil_crew',
          scope_keys: { building: 'A', floor: '1F', zone: 'east', workface: 'wf-1' },
        },
      }],
      monthly_plans: [],
      monthly_plan_items: [],
    })

    const source = await resolveMonthlyPlanGenerationSourceV1474('project-1', '2026-05')
    const item = source.items.find((candidate) => candidate.source_task_id === 'mismatched-float-task')

    expect(item?.generation_metadata.algorithm_context).toEqual(expect.objectContaining({
      fresh_float_days: null,
      critical_float_tier: null,
      monthly_capacity_priority: 'new_work',
    }))
  })

  it('uses fresh pseudo-critical float tier over stale baseline critical flags when allocating capacity', async () => {
    mocks.getProjectCriticalPathSnapshot.mockResolvedValue({
      calculationStatus: 'fresh',
      calculatedAt: '2026-05-01T08:00:00.000Z',
      projectDuration: freshCpmMetric(30),
      tasks: [
        { taskId: 'stale-critical-task', floatDays: 8, float: freshCpmMetric(8), isAutoCritical: false, isManualAttention: false, isManualInserted: false, durationDays: 21, title: 'Stale critical' },
        { taskId: 'near-task', floatDays: 2, float: freshCpmMetric(2), isAutoCritical: false, isManualAttention: false, isManualInserted: false, durationDays: 21, title: 'Near critical' },
      ],
      displayTaskIds: [],
      autoTaskIds: [],
    })
    mocks.forecastBatchTasks.mockResolvedValue([
      { taskId: 'stale-critical-task', remainingDurationDays: 21, forecastFinishDate: '2026-05-31', forecastDelayDays: 0, confidenceLevel: 'medium' },
      { taskId: 'near-task', remainingDurationDays: 21, forecastFinishDate: '2026-05-31', forecastDelayDays: 0, confidenceLevel: 'medium' },
    ])

    mockSupabaseRows({
      task_baselines: [
        { id: 'baseline-1', project_id: 'project-1', version: 1, status: 'confirmed', confirmed_at: '2026-05-01T00:00:00.000Z' },
      ],
      task_baseline_items: [
        {
          id: 'stale-critical-item',
          baseline_version_id: 'baseline-1',
          source_task_id: 'stale-critical-task',
          title: 'Stale critical',
          planned_start_date: '2026-05-01',
          planned_end_date: '2026-05-31',
          sort_order: 1,
          is_critical: true,
          generation_metadata: {
            resource_class: 'civil_crew',
            scope_keys: { building: 'A', floor: '1F', zone: 'east', workface: 'wf-1' },
          },
        },
        {
          id: 'near-item',
          baseline_version_id: 'baseline-1',
          source_task_id: 'near-task',
          title: 'Near critical',
          planned_start_date: '2026-05-01',
          planned_end_date: '2026-05-31',
          sort_order: 2,
          is_critical: false,
          generation_metadata: {
            resource_class: 'civil_crew',
            scope_keys: { building: 'A', floor: '1F', zone: 'east', workface: 'wf-1' },
          },
        },
      ],
      monthly_plans: [],
      monthly_plan_items: [],
    })

    const source = await resolveMonthlyPlanGenerationSourceV1474('project-1', '2026-05')
    const staleCritical = source.items.find((item) => item.source_task_id === 'stale-critical-task')
    const near = source.items.find((item) => item.source_task_id === 'near-task')

    expect(near?.generation_metadata.algorithm_context).toEqual(expect.objectContaining({
      critical_float_tier: 'near_critical',
      monthly_capacity_priority: 'near_critical',
      monthly_capacity_allocated_days: 21,
    }))
    expect(staleCritical?.generation_metadata.algorithm_context).toEqual(expect.objectContaining({
      critical_float_tier: 'pseudo_critical',
      monthly_capacity_priority: 'new_work',
      monthly_capacity_allocated_days: 0,
      monthly_capacity_status: 'rebalanced',
    }))
  })

  it('does not multiply the default monthly capacity ceiling by independent capacity pools', async () => {
    mocks.forecastBatchTasks.mockResolvedValue([
      { taskId: 'civil-task', remainingDurationDays: 21, forecastFinishDate: '2026-05-31', forecastDelayDays: 0, confidenceLevel: 'medium' },
      { taskId: 'mep-task', remainingDurationDays: 21, forecastFinishDate: '2026-05-31', forecastDelayDays: 0, confidenceLevel: 'medium' },
    ])

    mockSupabaseRows({
      task_baselines: [
        { id: 'baseline-1', project_id: 'project-1', version: 1, status: 'confirmed', confirmed_at: '2026-05-01T00:00:00.000Z' },
      ],
      task_baseline_items: [
        {
          id: 'civil-item',
          baseline_version_id: 'baseline-1',
          source_task_id: 'civil-task',
          title: 'Civil work',
          planned_start_date: '2026-05-01',
          planned_end_date: '2026-05-31',
          sort_order: 1,
          is_critical: false,
          generation_metadata: {
            resource_class: 'civil_crew',
            scope_keys: { building: 'A', floor: '1F', zone: 'east', workface: 'wf-1' },
          },
        },
        {
          id: 'mep-item',
          baseline_version_id: 'baseline-1',
          source_task_id: 'mep-task',
          title: 'MEP work',
          planned_start_date: '2026-05-01',
          planned_end_date: '2026-05-31',
          sort_order: 2,
          is_critical: false,
          generation_metadata: {
            resource_class: 'mep_crew',
            scope_keys: { building: 'B', floor: '2F', zone: 'west', workface: 'wf-2' },
          },
        },
      ],
      monthly_plans: [],
      monthly_plan_items: [],
    })

    const source = await resolveMonthlyPlanGenerationSourceV1474('project-1', '2026-05')
    const allocatedDays = source.items.reduce((total, item) => (
      total + Number(item.generation_metadata.algorithm_context?.monthly_capacity_allocated_days ?? 0)
    ), 0)

    expect(source.generationSummary).toMatchObject({
      capacityBudgetDays: 21,
      capacityDemandDays: 42,
      capacityAllocatedDays: 21,
      capacityOverCommitted: true,
      capacityRebalancedItemCount: 1,
    })
    expect(allocatedDays).toBeLessThanOrEqual(21)
  })

  it('prefers canonical E3 RCPSP capacity pool keys over rebuilt metadata scope keys', async () => {
    mocks.forecastBatchTasks.mockResolvedValue([
      { taskId: 'canonical-task', remainingDurationDays: 8, forecastFinishDate: '2026-05-12', forecastDelayDays: 0, confidenceLevel: 'high' },
    ])

    mockSupabaseRows({
      task_baselines: [
        { id: 'baseline-1', project_id: 'project-1', version: 1, status: 'confirmed', confirmed_at: '2026-05-01T00:00:00.000Z' },
      ],
      task_baseline_items: [
        {
          id: 'canonical-item',
          baseline_version_id: 'baseline-1',
          source_task_id: 'canonical-task',
          title: 'Canonical RCPSP scoped work',
          planned_start_date: '2026-05-01',
          planned_end_date: '2026-05-12',
          sort_order: 1,
          is_critical: false,
          generation_metadata: {
            resource_class: 'metadata_crew',
            scope_keys: { building: 'metadata-building', floor: 'metadata-floor', zone: 'metadata-zone', workface: 'metadata-workface' },
            algorithm_context: {
              rcpsp_capacity_pool_key: 'rcpsp|resource:civil_crew|building:A|floor:1F|zone:east',
              rcpsp_capacity_pool_key_source: 'projectCriticalPathService.resource_constraint_scope',
            },
          },
        },
      ],
      monthly_plans: [],
      monthly_plan_items: [],
    })

    const source = await resolveMonthlyPlanGenerationSourceV1474('project-1', '2026-05')
    const item = source.items.find((candidate) => candidate.source_task_id === 'canonical-task')

    expect(item?.generation_metadata.algorithm_context).toEqual(expect.objectContaining({
      monthly_capacity_pool_key: 'rcpsp|resource:civil_crew|building:A|floor:1F|zone:east',
      monthly_capacity_pool_key_source: 'projectCriticalPathService.resource_constraint_scope',
    }))
  })

  it('discounts conditional and backup monthly targets even when their own pools have enough budget', async () => {
    mocks.forecastBatchTasks.mockResolvedValue([
      { taskId: 'conditional-only-task', remainingDurationDays: 10, forecastFinishDate: '2026-05-20', forecastDelayDays: 0, confidenceLevel: 'medium' },
      { taskId: 'backup-only-task', remainingDurationDays: 10, forecastFinishDate: '2026-05-20', forecastDelayDays: 0, confidenceLevel: 'medium' },
    ])

    mockSupabaseRows({
      task_baselines: [
        { id: 'baseline-1', project_id: 'project-1', version: 1, status: 'confirmed', confirmed_at: '2026-05-01T00:00:00.000Z' },
      ],
      task_baseline_items: [
        {
          id: 'conditional-only-item',
          baseline_version_id: 'baseline-1',
          source_task_id: 'conditional-only-task',
          title: 'Conditional work',
          planned_start_date: '2026-05-01',
          planned_end_date: '2026-05-31',
          sort_order: 1,
          is_critical: false,
        },
        {
          id: 'backup-only-item',
          baseline_version_id: 'baseline-1',
          source_task_id: 'backup-only-task',
          title: 'Backup work',
          planned_start_date: '2026-05-01',
          planned_end_date: '2026-05-31',
          sort_order: 2,
          is_critical: false,
        },
      ],
      task_dependencies: [
        { id: 'dep-1', project_id: 'project-1', task_id: 'conditional-only-task', dependency_task_id: 'pre-task', required_for_start: true, status: 'active' },
      ],
      task_conditions: [
        { id: 'condition-1', project_id: 'project-1', task_id: 'backup-only-task', is_satisfied: false, status: 'pending', blocking_level: 'blocked' },
      ],
      task_obstacles: [],
      project_key_node_snapshots: [],
      project_entity_links: [],
      acceptance_plans: [],
      project_materials: [],
      risks: [],
      issues: [],
      notifications: [],
      monthly_plans: [],
      monthly_plan_items: [],
    })

    const source = await resolveMonthlyPlanGenerationSourceV1474('project-1', '2026-05')
    const conditional = source.items.find((item) => item.source_task_id === 'conditional-only-task')
    const backup = source.items.find((item) => item.source_task_id === 'backup-only-task')

    expect(conditional?.target_progress).toBeLessThan(100)
    expect(backup?.target_progress).toBeLessThan(conditional?.target_progress ?? 100)
    expect(conditional?.generation_metadata.algorithm_context).toEqual(expect.objectContaining({
      monthly_readiness_pool: 'conditional',
      monthly_readiness_target_factor: expect.any(Number),
    }))
    expect(backup?.generation_metadata.algorithm_context).toEqual(expect.objectContaining({
      monthly_readiness_pool: 'backup',
      monthly_readiness_target_factor: expect.any(Number),
    }))
  })

  it('splits capacity pools by readiness state, scope, resource class, and fresh float tiers', async () => {
    mocks.getProjectCriticalPathSnapshot.mockResolvedValue({
      calculationStatus: 'fresh',
      calculatedAt: '2026-05-01T08:00:00.000Z',
      projectDuration: freshCpmMetric(30),
      tasks: [
        { taskId: 'ready-task', floatDays: 0, float: freshCpmMetric(0), isAutoCritical: true, isManualAttention: false, isManualInserted: false, durationDays: 10, title: 'Ready critical' },
        { taskId: 'conditional-task', floatDays: 2, float: freshCpmMetric(2), isAutoCritical: false, isManualAttention: false, isManualInserted: false, durationDays: 10, title: 'Conditional near critical' },
        { taskId: 'backup-task', floatDays: 8, float: freshCpmMetric(8), isAutoCritical: false, isManualAttention: false, isManualInserted: false, durationDays: 10, title: 'Backup pseudo critical' },
      ],
      displayTaskIds: ['ready-task'],
      autoTaskIds: ['ready-task'],
    })
    mocks.forecastBatchTasks.mockResolvedValue([
      { taskId: 'ready-task', remainingDurationDays: 10, forecastFinishDate: '2026-05-10', forecastDelayDays: 0, confidenceLevel: 'high' },
      { taskId: 'conditional-task', remainingDurationDays: 10, forecastFinishDate: '2026-05-20', forecastDelayDays: 0, confidenceLevel: 'medium' },
      { taskId: 'backup-task', remainingDurationDays: 10, forecastFinishDate: '2026-05-25', forecastDelayDays: 0, confidenceLevel: 'medium' },
    ])

    mockSupabaseRows({
      task_baselines: [
        { id: 'baseline-1', project_id: 'project-1', version: 1, status: 'confirmed', confirmed_at: '2026-05-01T00:00:00.000Z' },
      ],
      task_baseline_items: [
        {
          id: 'ready-item',
          baseline_version_id: 'baseline-1',
          source_task_id: 'ready-task',
          title: 'Ready critical',
          planned_start_date: '2026-05-01',
          planned_end_date: '2026-05-31',
          sort_order: 1,
          is_critical: false,
          generation_metadata: {
            resource_class: 'civil_crew',
            scope_keys: { building: 'A', floor: '1F', zone: 'east', workface: 'wf-1' },
          },
        },
        {
          id: 'conditional-item',
          baseline_version_id: 'baseline-1',
          source_task_id: 'conditional-task',
          title: 'Conditional near critical',
          planned_start_date: '2026-05-01',
          planned_end_date: '2026-05-31',
          sort_order: 2,
          is_critical: false,
          generation_metadata: {
            resource_class: 'civil_crew',
            scope_keys: { building: 'A', floor: '1F', zone: 'east', workface: 'wf-1' },
          },
        },
        {
          id: 'backup-item',
          baseline_version_id: 'baseline-1',
          source_task_id: 'backup-task',
          title: 'Backup pseudo critical',
          planned_start_date: '2026-05-01',
          planned_end_date: '2026-05-31',
          sort_order: 3,
          is_critical: false,
          generation_metadata: {
            resource_class: 'mep_crew',
            scope_keys: { building: 'B', floor: '2F', zone: 'west', workface: 'wf-2' },
          },
        },
      ],
      task_dependencies: [
        { id: 'dep-1', project_id: 'project-1', task_id: 'conditional-task', dependency_task_id: 'ready-task', required_for_start: true, status: 'active' },
      ],
      task_conditions: [
        { id: 'condition-1', project_id: 'project-1', task_id: 'backup-task', is_satisfied: false, status: 'pending', blocking_level: 'blocked' },
      ],
      task_obstacles: [],
      project_key_node_snapshots: [],
      project_entity_links: [],
      acceptance_plans: [],
      project_materials: [],
      risks: [],
      issues: [],
      notifications: [],
      monthly_plans: [],
      monthly_plan_items: [],
    })

    const source = await resolveMonthlyPlanGenerationSourceV1474('project-1', '2026-05')
    const ready = source.items.find((item) => item.source_task_id === 'ready-task')
    const conditional = source.items.find((item) => item.source_task_id === 'conditional-task')
    const backup = source.items.find((item) => item.source_task_id === 'backup-task')

    expect(ready?.generation_metadata.algorithm_context).toEqual(expect.objectContaining({
      monthly_readiness_pool: 'committable',
      critical_float_tier: 'true_critical',
      fresh_float_days: 0,
      monthly_capacity_pool_key: 'civil_crew|building:A|floor:1F|zone:east|workface:wf-1',
      monthly_capacity_priority: 'critical',
    }))
    expect(conditional?.generation_metadata.algorithm_context).toEqual(expect.objectContaining({
      monthly_readiness_pool: 'conditional',
      critical_float_tier: 'near_critical',
      fresh_float_days: 2,
      monthly_capacity_pool_key: 'civil_crew|building:A|floor:1F|zone:east|workface:wf-1',
      monthly_capacity_priority: 'near_critical',
    }))
    expect(backup?.generation_metadata.algorithm_context).toEqual(expect.objectContaining({
      monthly_readiness_pool: 'backup',
      critical_float_tier: 'pseudo_critical',
      fresh_float_days: 8,
      monthly_capacity_pool_key: 'mep_crew|building:B|floor:2F|zone:west|workface:wf-2',
      monthly_capacity_priority: 'new_work',
    }))
  })

  it('downgrades unresolved aging carryovers to conditional management attention', async () => {
    mocks.forecastBatchTasks.mockResolvedValue([
      { taskId: 'aging-task', remainingDurationDays: 8, forecastFinishDate: '2026-05-16', forecastDelayDays: 0, confidenceLevel: 'medium' },
    ])

    mockSupabaseRows({
      task_baselines: [],
      tasks: [],
      monthly_plans: [
        { id: 'previous-plan', project_id: 'project-1', month: '2026-04', version: 1, status: 'confirmed' },
      ],
      monthly_plan_items: [
        {
          id: 'aging-item',
          project_id: 'project-1',
          monthly_plan_version_id: 'previous-plan',
          source_task_id: 'aging-task',
          title: 'Aging carryover',
          planned_start_date: '2026-04-01',
          planned_end_date: '2026-04-30',
          target_progress: 80,
          current_progress: 35,
          sort_order: 1,
          commitment_status: 'planned',
          manual_override_fields: {},
          generation_metadata: {
            algorithm_context: {
              consecutive_carryover_count: 3,
              last_month_actual_completion_rate: 0.25,
              responsible_response_status: 'no_response',
              unresolved_blocker_count: 2,
            },
          },
        },
      ],
      task_obstacles: [
        { id: 'obstacle-1', project_id: 'project-1', task_id: 'aging-task', status: 'active', severity: 'critical', blocking_level: 'blocked' },
      ],
      task_dependencies: [],
      task_conditions: [],
      project_key_node_snapshots: [],
      project_entity_links: [],
      acceptance_plans: [],
      project_materials: [],
      risks: [],
      issues: [],
      notifications: [],
    })

    const source = await resolveMonthlyPlanGenerationSourceV1474('project-1', '2026-05')
    const item = source.items.find((candidate) => candidate.source_task_id === 'aging-task')

    expect(item?.commitment_status).toBe('carried_over')
    expect(item?.generation_metadata.generation_reasons).toEqual(expect.arrayContaining([
      'carryover_aging_penalty',
      'management_attention_required',
    ]))
    expect(item?.generation_metadata.algorithm_context).toEqual(expect.objectContaining({
      consecutive_carryover_count: 4,
      carryover_aging_penalty_applied: true,
      monthly_readiness_pool: 'conditional',
    }))
  })

  it('derives carryover aging penalty from previous target actual progress and unresolved fact-bus blockers', async () => {
    mocks.forecastBatchTasks.mockResolvedValue([
      { taskId: 'aging-fact-task', remainingDurationDays: 8, forecastFinishDate: '2026-05-16', forecastDelayDays: 0, confidenceLevel: 'medium' },
    ])

    mockSupabaseRows({
      task_baselines: [],
      tasks: [],
      monthly_plans: [
        { id: 'previous-plan', project_id: 'project-1', month: '2026-04', version: 1, status: 'confirmed' },
      ],
      monthly_plan_items: [
        {
          id: 'aging-fact-item',
          project_id: 'project-1',
          monthly_plan_version_id: 'previous-plan',
          source_task_id: 'aging-fact-task',
          title: 'Aging carryover from facts',
          planned_start_date: '2026-04-01',
          planned_end_date: '2026-04-30',
          target_progress: 80,
          current_progress: 40,
          sort_order: 1,
          commitment_status: 'planned',
          manual_override_fields: {},
          generation_metadata: {
            algorithm_context: {
              consecutive_carryover_count: 2,
            },
          },
        },
      ],
      task_obstacles: [
        { id: 'obstacle-1', project_id: 'project-1', task_id: 'aging-fact-task', status: 'active', severity: 'critical', blocking_level: 'blocked' },
      ],
      task_dependencies: [],
      task_conditions: [],
      project_key_node_snapshots: [],
      project_entity_links: [],
      acceptance_plans: [],
      project_materials: [],
      risks: [],
      issues: [],
      notifications: [],
    })

    const source = await resolveMonthlyPlanGenerationSourceV1474('project-1', '2026-05')
    const item = source.items.find((candidate) => candidate.source_task_id === 'aging-fact-task')

    expect(item?.generation_metadata.generation_reasons).toEqual(expect.arrayContaining([
      'carryover_aging_penalty',
      'management_attention_required',
    ]))
    expect(item?.generation_metadata.algorithm_context).toEqual(expect.objectContaining({
      consecutive_carryover_count: 3,
      last_month_actual_completion_rate: 0.5,
      unresolved_blocker_count: 1,
      carryover_aging_penalty_applied: true,
      monthly_readiness_pool: 'conditional',
    }))
  })
})
