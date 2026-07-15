import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const lookupQuery: any = {
    select: vi.fn(() => lookupQuery),
    eq: vi.fn(() => lookupQuery),
    maybeSingle: vi.fn(),
  }
  const updateQuery: any = {
    eq: vi.fn(() => updateQuery),
    then: (resolve: (value: unknown) => unknown, reject: (reason?: unknown) => unknown) => Promise.resolve({ error: null }).then(resolve, reject),
  }
  const forecastQuery: any = {
    select: vi.fn(() => forecastQuery),
    eq: vi.fn(() => forecastQuery),
    order: vi.fn(() => forecastQuery),
    limit: vi.fn(() => forecastQuery),
    maybeSingle: vi.fn(),
    then: (resolve: (value: unknown) => unknown, reject: (reason?: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(resolve, reject),
  }
  return {
    from: vi.fn(),
    rawQuery: vi.fn(),
    lookupQuery,
    forecastQuery,
    insert: vi.fn(),
    update: vi.fn(() => updateQuery),
    updateQuery,
    getProjectCompanyId: vi.fn(),
    buildDurationContext: vi.fn(),
    resolveV1474BuildingPatternMatch: vi.fn(),
    backtestEarliestPendingDurationAccuracyPrediction: vi.fn(),
  }
})

vi.mock('../services/dbService.js', () => ({
  supabase: {
    from: mocks.from,
  },
}))

vi.mock('../database.js', () => ({
  query: mocks.rawQuery,
}))

vi.mock('../auth/access.js', () => ({
  getProjectCompanyId: mocks.getProjectCompanyId,
  isUuidLike: vi.fn(() => false),
}))

vi.mock('../middleware/logger.js', () => ({
  logger: {
    warn: vi.fn(),
  },
}))

vi.mock('../services/durationContextService.js', () => ({
  buildDurationContext: mocks.buildDurationContext,
}))

vi.mock('../services/algorithmSeedResolver.js', () => ({
  resolveV1474BuildingPatternMatch: mocks.resolveV1474BuildingPatternMatch,
}))

vi.mock('../services/durationAlgorithmAccuracyService.js', () => ({
  backtestEarliestPendingDurationAccuracyPrediction: mocks.backtestEarliestPendingDurationAccuracyPrediction,
}))

const {
  collectDurationExperienceSampleFromTask,
  retireDurationExperienceSampleForTask,
} = await import('../services/durationExperienceService.js')

describe('durationExperienceService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getProjectCompanyId.mockResolvedValue('company-1')
    mocks.buildDurationContext.mockResolvedValue({
      confidenceDelta: 0,
      factors: [],
      calculationContext: { confidence_level: 'high' },
    })
    mocks.lookupQuery.maybeSingle.mockResolvedValue({ data: null, error: null })
    mocks.forecastQuery.maybeSingle.mockResolvedValue({ data: null, error: null })
    mocks.insert.mockResolvedValue({ error: null })
    mocks.rawQuery.mockResolvedValue([])
    mocks.backtestEarliestPendingDurationAccuracyPrediction.mockResolvedValue(null)
    mocks.resolveV1474BuildingPatternMatch.mockResolvedValue({
      record: null,
      patternCode: null,
      matchScore: 0,
      confidenceScore: 0,
      confidenceLevel: 'none',
      matchedSignals: [],
      missingSignals: [],
      actionPolicy: 'candidate_only',
    })
    mocks.from.mockImplementation((tableName: string) => {
      if (tableName === 'duration_experience_samples') {
        return {
          select: mocks.lookupQuery.select,
          insert: mocks.insert,
          update: mocks.update,
        }
      }
      if (tableName === 'task_duration_forecasts') {
        return mocks.forecastQuery
      }
      return {}
    })
  })

  it('collects completed task duration samples with context for benchmark governance', async () => {
    const taskTitle = '主体结构钢筋绑扎'

    const collected = await collectDurationExperienceSampleFromTask({
      id: 'task-1',
      project_id: 'project-1',
      title: taskTitle,
      status: 'completed',
      priority: 'medium',
      progress: 100,
      actual_start_date: '2026-05-01T00:00:00.000Z',
      actual_end_date: '2026-05-05T00:00:00.000Z',
      planned_start_date: '2026-05-01T00:00:00.000Z',
      planned_end_date: '2026-05-06T00:00:00.000Z',
      template_node_id: 'template-node-1',
      wbs_node_type: 'process',
      standard_work_code: '01-02-03',
      standard_work_name: '钢筋绑扎',
      engineering_category_id: 'category-1',
      participant_unit_id: 'unit-1',
      standard_task_metadata: {
        backendStandardMapping: {
          source: 'algorithm_seed_rule',
          seedCode: 'cast_in_place_rebar',
          confidence: 'medium',
          matchScore: 0.72,
          matchQuality: 'keyword_phrase',
          matchRuleId: 'alias_rebar_binding',
        },
        projectGenerationFacts: {
          businessType: 'residential',
          structureTypeCode: 'shear_wall',
          methodVariantCodes: ['aluminum_formwork'],
          elementVariantCodes: ['beam'],
        },
        elementVariant: {
          code: 'beam',
          label: '梁',
        },
      },
      created_at: '2026-04-30T00:00:00.000Z',
      updated_at: '2026-05-05T08:00:00.000Z',
      version: 1,
    }, { actorId: 'user-1' } as any)

    expect(collected).toBe(true)
    expect(mocks.getProjectCompanyId).toHaveBeenCalledWith('project-1')
    expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({
      company_id: 'company-1',
      project_id: 'project-1',
      task_id: 'task-1',
      template_node_id: 'template-node-1',
      wbs_node_type: 'process',
      standard_work_code: '01-02-03',
      planned_duration: 6,
      actual_duration: 5,
      source_type: 'task_completion',
      experience_tier: 'T1',
      reuse_scope: 'project',
      fact_source: 'actual_outcome',
      evidence_fingerprint: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
      source_lineage: expect.objectContaining({
        sourceService: 'durationExperienceService',
        sourceType: 'task_completion',
        companyId: 'company-1',
        projectId: 'project-1',
        taskId: 'task-1',
        actualStartSource: 'actual_start_date',
        actualEndSource: 'actual_end_date',
      }),
      sample_strength: 'strong',
      confidence_level: 'high',
      confidence_score: 85,
      included_in_benchmark: true,
      metadata: expect.objectContaining({
        company_id: 'company-1',
        collected_by: 'user-1',
        project_type_code: 'residential',
        structure_type_code: 'shear_wall',
        method_variant_codes: ['aluminum_formwork'],
        element_variant_codes: ['beam'],
        participant_unit_id: 'unit-1',
        benchmark_context_key: 'project=residential|structure=shear_wall|method=aluminum_formwork|element=beam|unit=unit-1',
        raw_task_title: taskTitle,
        title_weak_alias: taskTitle,
        title_standard_mapping_source: 'algorithm_seed_rule',
        title_standard_mapping_seed_code: 'cast_in_place_rebar',
        title_standard_mapping_confidence: 'medium',
        title_standard_mapping_match_score: 0.72,
        title_standard_mapping_match_quality: 'keyword_phrase',
        title_standard_mapping_rule_id: 'alias_rebar_binding',
      }),
    }))
  })

  it('writes completion samples with shared date-only inclusive duration semantics', async () => {
    const collected = await collectDurationExperienceSampleFromTask({
      id: 'task-date-boundary',
      project_id: 'project-1',
      title: 'date boundary task',
      status: 'completed',
      priority: 'medium',
      progress: 100,
      actual_start_date: '2026-05-01T23:30:00+08:00',
      actual_end_date: '2026-05-03T00:30:00+08:00',
      planned_start_date: '2026-05-01T23:30:00+08:00',
      planned_end_date: '2026-05-03T00:30:00+08:00',
      template_node_id: 'template-node-date-boundary',
      wbs_node_type: 'process',
      standard_work_code: '01-02-03',
      standard_work_name: 'date boundary work',
      engineering_category_id: 'category-1',
      standard_task_metadata: {},
      created_at: '2026-04-30T00:00:00.000Z',
      updated_at: '2026-05-03T08:00:00.000Z',
      version: 1,
    }, { actorId: 'user-1' } as any)

    expect(collected).toBe(true)
    expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({
      task_id: 'task-date-boundary',
      planned_duration: 3,
      actual_duration: 3,
    }))
  })

  it('persists completed task samples into unified sample health governance events', async () => {
    const collected = await collectDurationExperienceSampleFromTask({
      id: 'task-sample-health',
      project_id: 'project-1',
      title: 'sample health task',
      status: 'completed',
      priority: 'medium',
      progress: 100,
      actual_start_date: '2026-05-01T00:00:00.000Z',
      actual_end_date: '2026-05-05T00:00:00.000Z',
      planned_start_date: '2026-05-01T00:00:00.000Z',
      planned_end_date: '2026-05-06T00:00:00.000Z',
      template_node_id: 'template-node-sample-health',
      wbs_node_type: 'process',
      standard_work_code: '01-02-03',
      standard_work_name: 'sample health work',
      engineering_category_id: 'category-1',
      standard_task_metadata: {},
      created_at: '2026-04-30T00:00:00.000Z',
      updated_at: '2026-05-05T08:00:00.000Z',
      version: 1,
    }, { actorId: 'user-1' } as any)

    expect(collected).toBe(true)
    const sampleHealthInsert = mocks.rawQuery.mock.calls.find((call) =>
      String(call[0]).toLowerCase().includes('insert into public.algorithm_sample_health_events'),
    )
    expect(sampleHealthInsert).toBeTruthy()
    expect(sampleHealthInsert?.[1]).toEqual(expect.arrayContaining([
      'duration_experience:task-sample-health:task_completion',
      'duration_experience.task_completion',
      'durationExperienceService',
      'project',
      'company-1',
      'project-1',
      'base_duration',
      'guarded_live_tuning',
      'accepted',
    ]))
  })

  it('stores forecast-ratio observations as active velocity learning inputs', async () => {
    mocks.forecastQuery.maybeSingle.mockResolvedValue({
      data: {
        id: 'forecast-1',
        generated_at: '2026-05-01T00:00:00.000Z',
        forecast_finish_date: '2026-05-04',
        remaining_duration_days: 4,
        execution_reference_days: 4,
        forecast_error_days: 1,
        model_version: 'remaining_duration_forecast_v1.1',
        forecast_source: 'remaining_duration_forecast',
        duration_calibration_source: 'runtime_forecast',
      },
      error: null,
    })

    const collected = await collectDurationExperienceSampleFromTask({
      id: 'task-with-forecast',
      project_id: 'project-1',
      title: 'forecast learned task',
      status: 'completed',
      priority: 'medium',
      progress: 100,
      actual_start_date: '2026-05-01T00:00:00.000Z',
      actual_end_date: '2026-05-05T00:00:00.000Z',
      planned_start_date: '2026-05-01T00:00:00.000Z',
      planned_end_date: '2026-05-06T00:00:00.000Z',
      template_node_id: 'template-node-forecast',
      wbs_node_type: 'process',
      standard_work_code: '01-02-03',
      standard_work_name: 'forecast work',
      engineering_category_id: 'category-1',
      standard_task_metadata: {},
      created_at: '2026-04-30T00:00:00.000Z',
      updated_at: '2026-05-05T08:00:00.000Z',
      version: 1,
    }, { actorId: 'user-1' } as any)

    expect(collected).toBe(true)
    expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({
      task_id: 'task-with-forecast',
      planned_duration: 6,
      actual_duration: 5,
      metadata: expect.objectContaining({
        forecast_learning_observation: expect.objectContaining({
          learning_target: 'forecast_ratio_velocity_multiplier',
          production_consumption_policy: 'active_velocity_multiplier_input',
          forecast_id: 'forecast-1',
          forecast_duration_days: 4,
          forecast_duration_source: 'execution_reference_days',
          forecast_ratio: 1.25,
          plan_ratio: expect.closeTo(0.833, 3),
        }),
      }),
    }))
  })

  it('backtests the matching task remaining forecast prediction when completion outcome is accepted', async () => {
    const collected = await collectDurationExperienceSampleFromTask({
      id: 'task-backtest',
      project_id: 'project-1',
      title: 'backtest task',
      status: 'completed',
      priority: 'medium',
      progress: 100,
      actual_start_date: '2026-05-01T00:00:00.000Z',
      actual_end_date: '2026-05-05T00:00:00.000Z',
      planned_start_date: '2026-05-01T00:00:00.000Z',
      planned_end_date: '2026-05-06T00:00:00.000Z',
      template_node_id: 'template-node-backtest',
      wbs_node_type: 'process',
      standard_work_code: '01-02-03',
      standard_work_name: 'backtest work',
      engineering_category_id: 'category-1',
      standard_task_metadata: {},
      created_at: '2026-04-30T00:00:00.000Z',
      updated_at: '2026-05-05T08:00:00.000Z',
      version: 1,
    }, { actorId: 'user-1' } as any)

    expect(collected).toBe(true)
    expect(mocks.backtestEarliestPendingDurationAccuracyPrediction).toHaveBeenCalledWith(expect.objectContaining({
      projectId: 'project-1',
      taskId: 'task-backtest',
      engineCode: 'task_remaining_forecast',
      actualStartDate: expect.any(Date),
      actualFinishDate: expect.any(Date),
      actualDurationDays: 5,
      baselineAbsoluteErrorDays: 1,
      actualContext: expect.objectContaining({
        sourceService: 'durationExperienceService',
        sampleStrength: 'strong',
        sampleHealthStatus: 'accepted',
        standardWorkCode: '01-02-03',
      }),
    }))
  })

  it('backtests the matching standard duration reference prediction with construction organization lineage', async () => {
    const collected = await collectDurationExperienceSampleFromTask({
      id: 'task-standard-reference-backtest',
      project_id: 'project-1',
      title: 'standard reference backtest task',
      status: 'completed',
      priority: 'medium',
      progress: 100,
      actual_start_date: '2026-05-01T00:00:00.000Z',
      actual_end_date: '2026-05-05T00:00:00.000Z',
      planned_start_date: '2026-05-01T00:00:00.000Z',
      planned_end_date: '2026-05-06T00:00:00.000Z',
      template_node_id: 'template-node-standard-reference',
      wbs_node_type: 'process',
      standard_work_code: '01-02-03',
      standard_work_name: 'standard reference work',
      engineering_category_id: 'category-1',
      standard_task_metadata: {
        recommendedPlanOption: {
          publicationKey: 'construction-org-plan-network:pub-1',
          businessType: 'residential_general_contracting',
          draftNetworkKey: 'draft-network-1',
          optionId: 'option-a',
        },
      },
      created_at: '2026-04-30T00:00:00.000Z',
      updated_at: '2026-05-05T08:00:00.000Z',
      version: 1,
    }, { actorId: 'user-1' } as any)

    expect(collected).toBe(true)
    expect(mocks.backtestEarliestPendingDurationAccuracyPrediction).toHaveBeenCalledWith(expect.objectContaining({
      projectId: 'project-1',
      taskId: 'task-standard-reference-backtest',
      engineCode: 'standard_duration_reference',
      actualStartDate: expect.any(Date),
      actualFinishDate: expect.any(Date),
      actualDurationDays: 5,
      baselineAbsoluteErrorDays: 1,
      actualContext: expect.objectContaining({
        sourceService: 'durationExperienceService',
        sourceType: 'task_completion',
        sampleStrength: 'strong',
        sampleHealthStatus: 'accepted',
        assetKey: 'construction_organization_plan_network',
        publicationKey: 'construction-org-plan-network:pub-1',
        runtimePublicationKey: 'construction-org-plan-network:pub-1',
        businessType: 'residential_general_contracting',
        draftNetworkKey: 'draft-network-1',
        optionId: 'option-a',
      }),
    }))
  })

  it('backtests standard reference predictions from wizard projectOrganization scenario metadata', async () => {
    const collected = await collectDurationExperienceSampleFromTask({
      id: 'task-wizard-standard-reference-backtest',
      project_id: 'project-1',
      title: 'wizard standard reference backtest task',
      status: 'completed',
      priority: 'medium',
      progress: 100,
      actual_start_date: '2026-05-01T00:00:00.000Z',
      actual_end_date: '2026-05-05T00:00:00.000Z',
      planned_start_date: '2026-05-01T00:00:00.000Z',
      planned_end_date: '2026-05-06T00:00:00.000Z',
      template_node_id: 'template-node-wizard-standard-reference',
      wbs_node_type: 'process',
      standard_work_code: '01-02-03',
      standard_work_name: 'wizard standard reference work',
      engineering_category_id: 'category-1',
      standard_task_metadata: {
        projectOrganization: {
          scenarioSelection: {
            recommendedPlanOption: {
              publicationKey: 'construction-org-plan-network:pub-wizard',
              businessType: 'hospital',
              draftNetworkKey: 'draft-network-wizard',
              optionId: 'option-wizard',
            },
          },
        },
      },
      created_at: '2026-04-30T00:00:00.000Z',
      updated_at: '2026-05-05T08:00:00.000Z',
      version: 1,
    }, { actorId: 'user-1' } as any)

    expect(collected).toBe(true)
    expect(mocks.backtestEarliestPendingDurationAccuracyPrediction).toHaveBeenCalledWith(expect.objectContaining({
      projectId: 'project-1',
      taskId: 'task-wizard-standard-reference-backtest',
      engineCode: 'standard_duration_reference',
      actualContext: expect.objectContaining({
        assetKey: 'construction_organization_plan_network',
        publicationKey: 'construction-org-plan-network:pub-wizard',
        runtimePublicationKey: 'construction-org-plan-network:pub-wizard',
        businessType: 'hospital',
        draftNetworkKey: 'draft-network-wizard',
        optionId: 'option-wizard',
      }),
    }))
  })

  it('rescues completed tasks without an actual finish date as weak samples', async () => {
    mocks.forecastQuery.maybeSingle.mockResolvedValue({
      data: {
        id: 'forecast-weak-actual',
        generated_at: '2026-05-02T00:00:00.000Z',
        forecast_finish_date: '2026-05-04',
        remaining_duration_days: 3,
        execution_reference_days: 4,
        forecast_error_days: 1,
        model_version: 'v1',
        forecast_source: 'task_remaining_forecast',
        duration_calibration_source: 'baseline',
      },
      error: null,
    })

    const collected = await collectDurationExperienceSampleFromTask({
      id: 'task-missing-actual-finish',
      project_id: 'project-1',
      title: 'missing actual finish task',
      status: 'completed',
      priority: 'medium',
      progress: 100,
      actual_start_date: '2026-05-01T00:00:00.000Z',
      actual_end_date: null,
      planned_start_date: '2026-05-01T00:00:00.000Z',
      planned_end_date: '2026-05-06T00:00:00.000Z',
      template_node_id: 'template-node-missing-actual-finish',
      wbs_node_type: 'process',
      standard_work_code: '01-02-03',
      standard_work_name: 'missing actual finish work',
      engineering_category_id: 'category-1',
      standard_task_metadata: {},
      created_at: '2026-04-30T00:00:00.000Z',
      updated_at: '2026-05-05T08:00:00.000Z',
      version: 1,
    }, { actorId: 'user-1' } as any)

    expect(collected).toBe(true)
    expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({
      task_id: 'task-missing-actual-finish',
      actual_duration: 5,
      completed_at: '2026-05-05T00:00:00.000Z',
      sample_strength: 'weak',
      confidence_level: 'low',
      confidence_score: 45,
      included_in_benchmark: false,
      metadata: expect.objectContaining({
        actual_start_source: 'actual_start_date',
        actual_end_source: 'updated_at_completion_event',
        forecast_learning_observation: null,
      }),
    }))
    const sampleHealthInsert = mocks.rawQuery.mock.calls.find((call) =>
      String(call[0]).toLowerCase().includes('insert into public.algorithm_sample_health_events'),
    )
    expect(sampleHealthInsert).toBeTruthy()
    expect(sampleHealthInsert?.[1]).toEqual(expect.arrayContaining([
      'duration_experience:task-missing-actual-finish:task_completion',
      'weak',
    ]))
    expect(mocks.backtestEarliestPendingDurationAccuracyPrediction).not.toHaveBeenCalled()
  })

  it('excludes completed duration sample from benchmark when progress quality is not reliable', async () => {
    mocks.buildDurationContext.mockResolvedValue({
      confidenceDelta: -18,
      factors: [{
        key: 'progress_quality',
        confidenceDelta: -18,
        actionPolicy: 'confidence_only',
        metadata: {
          anomalyCodes: ['progress_rollback'],
          dataQualityRuleCodes: ['PROGRESS_ROLLBACK'],
          excludedFromVelocityLearning: true,
          learningObservation: {
            observationType: 'progress_quality_pattern',
            candidateKey: 'progress_rollback',
            sampleEligibility: 'exclude_duration_learning',
          },
        },
      }],
      calculationContext: { confidence_level: 'low' },
    })

    const collected = await collectDurationExperienceSampleFromTask({
      id: 'task-low-quality',
      project_id: 'project-1',
      title: 'progress rollback task',
      status: 'completed',
      priority: 'medium',
      progress: 100,
      actual_start_date: '2026-05-01T00:00:00.000Z',
      actual_end_date: '2026-05-05T00:00:00.000Z',
      planned_start_date: '2026-05-01T00:00:00.000Z',
      planned_end_date: '2026-05-06T00:00:00.000Z',
      template_node_id: 'template-node-1',
      wbs_node_type: 'process',
      standard_work_code: '01-02-03',
      standard_work_name: 'rebar binding',
      engineering_category_id: 'category-1',
      created_at: '2026-04-30T00:00:00.000Z',
      updated_at: '2026-05-05T08:00:00.000Z',
      version: 1,
    }, { actorId: 'user-1' } as any)

    expect(collected).toBe(true)
    expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({
      task_id: 'task-low-quality',
      sample_strength: 'unusable',
      confidence_level: 'low',
      confidence_score: 15,
      included_in_benchmark: false,
      metadata: expect.objectContaining({
        progress_quality: expect.objectContaining({
          confidence_delta: -18,
          data_quality_rule_codes: ['PROGRESS_ROLLBACK'],
          sample_eligibility: 'exclude_duration_learning',
          learning_observation: expect.objectContaining({
            candidateKey: 'progress_rollback',
          }),
        }),
      }),
    }))
  })

  it('retires active completion samples when a task is reopened', async () => {
    const retired = await retireDurationExperienceSampleForTask('task-1', { actorId: 'user-1' })

    expect(retired).toBe(true)
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({
      sample_status: 'superseded',
      included_in_benchmark: false,
      metadata: expect.objectContaining({
        retired_by: 'user-1',
        retired_trigger: 'task_reopened',
      }),
    }))
    expect(mocks.updateQuery.eq).toHaveBeenCalledWith('task_id', 'task-1')
    expect(mocks.updateQuery.eq).toHaveBeenCalledWith('source_type', 'task_completion')
    expect(mocks.updateQuery.eq).toHaveBeenCalledWith('sample_status', 'active')
  })
})
