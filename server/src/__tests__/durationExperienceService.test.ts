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
    resolveAlgorithmSeedRecords: vi.fn(),
    backtestEarliestPendingDurationAccuracyPrediction: vi.fn(),
    listCurrentExecutionFacts: vi.fn(),
    structuredCauseRows: [] as Record<string, unknown>[],
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
  resolveAlgorithmSeedRecords: mocks.resolveAlgorithmSeedRecords,
}))

vi.mock('../services/durationAlgorithmAccuracyService.js', () => ({
  backtestEarliestPendingDurationAccuracyPrediction: mocks.backtestEarliestPendingDurationAccuracyPrediction,
}))

vi.mock('../services/executionFactGovernanceService.js', () => ({
  listCurrentExecutionFacts: mocks.listCurrentExecutionFacts,
}))

const {
  collectDurationExperienceSampleFromTask,
  retireDurationExperienceSampleForTask,
} = await import('../services/durationExperienceService.js')

function completedTask(overrides: Record<string, unknown> = {}) {
  return {
    id: 'task-cause-snapshot',
    project_id: 'project-1',
    title: 'structured cause duration task',
    status: 'completed',
    priority: 'medium',
    progress: 100,
    actual_start_date: '2026-05-01T00:00:00.000Z',
    actual_end_date: '2026-05-05T00:00:00.000Z',
    planned_start_date: '2026-05-01T00:00:00.000Z',
    planned_end_date: '2026-05-06T00:00:00.000Z',
    template_node_id: 'template-node-cause-snapshot',
    wbs_node_type: 'process',
    standard_work_code: '01-02-03',
    standard_work_name: 'structured cause work',
    engineering_category_id: 'category-1',
    standard_task_metadata: {},
    created_at: '2026-04-30T00:00:00.000Z',
    updated_at: '2026-05-05T08:00:00.000Z',
    version: 1,
    ...overrides,
  } as any
}

function structuredCauseRow(overrides: Record<string, unknown> = {}) {
  const status = String(overrides.status ?? 'confirmed')
  return {
    id: '00000000-0000-4000-8000-000000000001',
    company_id: 'company-1',
    project_id: 'project-1',
    subject_type: 'task',
    subject_id: 'task-cause-snapshot',
    event_type: 'completion',
    status,
    cause_code: 'material_shortage',
    cause_role: 'primary',
    taxonomy_version: 'v1.0.0',
    confirmation_source: status === 'candidate' ? 'candidate' : 'user_confirmed',
    confirmed_at: status === 'candidate' ? null : '2026-05-05T07:00:00.000Z',
    ...overrides,
  }
}

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
    mocks.structuredCauseRows = []
    mocks.rawQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM public.structured_cause_attributions')) {
        return { rows: mocks.structuredCauseRows }
      }
      return []
    })
    mocks.backtestEarliestPendingDurationAccuracyPrediction.mockResolvedValue(null)
    mocks.listCurrentExecutionFacts.mockResolvedValue([])
    mocks.resolveAlgorithmSeedRecords.mockResolvedValue([{
      stableCode: 'authoritative-calendar-identity',
      calendarKind: 'authority_marker',
      countsAsConstructionShutdown: false,
      __resolverVersionId: 'work-calendar-version-1',
      sourceVersion: '2026',
      startDate: '2026-12-31',
      endDate: '2026-12-31',
    }])
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

  it('copies duration publication lineage from the trusted consumption table instead of editable task metadata', async () => {
    mocks.rawQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM public.structured_cause_attributions')) return { rows: [] }
      if (sql.includes('from public.duration_learning_runtime_consumptions')) {
        return { rows: [{
          company_id: 'company-1',
          project_id: 'project-1',
          task_id: 'task-cause-snapshot',
          consumption_key: 'trusted-consumption-1',
          publication_key: 'duration_learning_runtime:wbs_reference_days:trusted-v3',
          asset_key: 'wbs_reference_days',
          artifact_key: 'china-facade-curtain-wall',
          consumer_key: 'projectWizard',
          consumer_surface: 'project_wizard_commit',
          duration_day_basis: 'construction_production_day',
          applied_duration_days: 99,
          generation_batch_id: 'batch-trusted',
          template_id: 'china-facade-curtain-wall',
          source_evidence_refs: [
            'duration_learning_runtime_publications:duration_learning_runtime:wbs_reference_days:trusted-v3',
          ],
          consumption_context: {
            authoritySource: 'runtime_resolver_publication_set',
            scopeLevel: 'project',
            generationBatchId: 'batch-trusted',
            inputTaskIds: ['task-cause-snapshot'],
          },
          publication_stage: 'canary',
          monitoring_status: 'passed',
          publication_scope_level: 'project',
          publication_company_id: 'company-1',
          publication_project_id: 'project-1',
          publication_industry_key: null,
          consumed_at: '2026-05-01T00:00:00.000Z',
        }] }
      }
      return { rows: [] }
    })

    await collectDurationExperienceSampleFromTask(completedTask({
      standard_task_metadata: {
        durationLearningPublicationKey: 'duration_learning_runtime:wbs_reference_days:forged',
        durationLearningAssetKey: 'wbs_reference_days',
      },
    }))

    const metadata = mocks.insert.mock.calls.at(-1)?.[0].metadata
    expect(metadata.duration_learning_runtime_consumptions).toEqual([
      expect.objectContaining({
        consumptionKey: 'trusted-consumption-1',
        publicationKey: 'duration_learning_runtime:wbs_reference_days:trusted-v3',
        assetKey: 'wbs_reference_days',
        durationDayBasis: 'construction_production_day',
      }),
    ])
    expect(JSON.stringify(metadata.duration_learning_runtime_consumptions)).not.toContain('forged')
    expect(mocks.backtestEarliestPendingDurationAccuracyPrediction).toHaveBeenCalledWith(expect.objectContaining({
      engineCode: 'standard_duration_reference',
      actualContext: expect.objectContaining({
        durationLearningRuntimeConsumptions: [expect.objectContaining({
          consumptionKey: 'trusted-consumption-1',
          publicationKey: 'duration_learning_runtime:wbs_reference_days:trusted-v3',
          assetKey: 'wbs_reference_days',
          artifactKey: 'china-facade-curtain-wall',
        })],
      }),
    }))
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

  it('stores an empty structured cause snapshot when the task has no attribution', async () => {
    const collected = await collectDurationExperienceSampleFromTask(completedTask(), { actorId: 'user-1' } as any)

    expect(collected).toBe(true)
    const payload = mocks.insert.mock.calls.at(-1)?.[0]
    expect(payload.metadata.structured_cause_snapshot).toEqual({
      schema_version: 'structured_cause_snapshot/v1',
      confirmed_count: 0,
      candidate_count: 0,
      confirmed_causes: [],
    })
    const causeQuery = mocks.rawQuery.mock.calls.find(([sql]) =>
      String(sql).includes('FROM public.structured_cause_attributions'),
    )
    expect(causeQuery?.[0]).toContain('WHERE subject_id = $1')
    expect(causeQuery?.[1]).toEqual(['task-cause-snapshot'])
  })

  it('keeps a manual cause candidate out of benchmarks until confirmation', async () => {
    mocks.structuredCauseRows = [structuredCauseRow({
      id: '00000000-0000-4000-8000-000000000011',
      status: 'candidate',
      cause_code: 'other',
    })]

    await collectDurationExperienceSampleFromTask(completedTask(), { actorId: 'user-1' } as any)

    const payload = mocks.insert.mock.calls.at(-1)?.[0]
    expect(payload.included_in_benchmark).toBe(false)
    expect(payload.metadata).toEqual(expect.objectContaining({
      structuredCauseAvailability: 'review_required',
      structuredCauseCode: 'other',
      structuredCauseTaxonomyVersion: 'v1.0.0',
    }))
  })

  it('does not let another confirmed cause bypass a manual review candidate', async () => {
    mocks.structuredCauseRows = [
      structuredCauseRow({
        id: '00000000-0000-4000-8000-000000000021',
        cause_code: 'material_shortage',
        cause_role: 'contributing',
      }),
      structuredCauseRow({
        id: '00000000-0000-4000-8000-000000000022',
        status: 'candidate',
        cause_code: 'other',
        review_reason_codes: ['manual_text_requires_user_confirmation'],
      }),
    ]

    await collectDurationExperienceSampleFromTask(completedTask(), { actorId: 'user-1' } as any)

    const payload = mocks.insert.mock.calls.at(-1)?.[0]
    expect(payload.included_in_benchmark).toBe(false)
    expect(payload.metadata).toEqual(expect.objectContaining({
      structuredCauseAvailability: 'review_required',
      structuredCauseCode: 'other',
      structuredCauseTaxonomyVersion: 'v1.0.0',
    }))
  })

  it('requires a confirmed canonical cause before cause-linked evidence is benchmark eligible', async () => {
    mocks.structuredCauseRows = [structuredCauseRow({
      id: '00000000-0000-4000-8000-000000000031',
      cause_code: 'legacy_weather_delay',
      taxonomy_version: 'legacy/v1',
    })]

    await collectDurationExperienceSampleFromTask(completedTask(), { actorId: 'user-1' } as any)

    const payload = mocks.insert.mock.calls.at(-1)?.[0]
    expect(payload.included_in_benchmark).toBe(false)
    expect(payload.metadata).toEqual(expect.objectContaining({
      structuredCauseAvailability: 'review_required',
      structuredCauseCode: null,
      structuredCauseTaxonomyVersion: 'v1.0.0',
    }))
    expect(JSON.stringify(payload.metadata.structured_cause_snapshot)).not.toContain('legacy_weather_delay')
  })

  it('fails benchmark eligibility closed when structured causes cannot be read', async () => {
    mocks.rawQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM public.structured_cause_attributions')) {
        throw new Error('structured cause read unavailable')
      }
      return []
    })

    await collectDurationExperienceSampleFromTask(completedTask(), { actorId: 'user-1' } as any)

    const payload = mocks.insert.mock.calls.at(-1)?.[0]
    expect(payload.included_in_benchmark).toBe(false)
    expect(payload.metadata).toEqual(expect.objectContaining({
      structuredCauseAvailability: 'unavailable',
      structuredCauseCode: null,
      structuredCauseTaxonomyVersion: 'v1.0.0',
    }))
  })

  it('marks confirmed canonical cause evidence available for benchmark use', async () => {
    mocks.structuredCauseRows = [structuredCauseRow({
      id: '00000000-0000-4000-8000-000000000041',
      cause_code: 'weather_impact',
    })]

    await collectDurationExperienceSampleFromTask(completedTask(), { actorId: 'user-1' } as any)

    const payload = mocks.insert.mock.calls.at(-1)?.[0]
    expect(payload.included_in_benchmark).toBe(true)
    expect(payload.metadata).toEqual(expect.objectContaining({
      structuredCauseAvailability: 'available',
      structuredCauseCode: 'weather_impact',
      structuredCauseTaxonomyVersion: 'v1.0.0',
    }))
  })

  it('stores only confirmed cause fields and keeps responsibility as user-confirmed context', async () => {
    mocks.structuredCauseRows = [structuredCauseRow({
      id: '00000000-0000-4000-8000-000000000051',
      responsibility_class: 'contractor_attributable',
      raw_text: 'must not enter duration metadata',
      confidence: 0.99,
    })]

    await collectDurationExperienceSampleFromTask(completedTask(), { actorId: 'user-1' } as any)

    const snapshot = mocks.insert.mock.calls.at(-1)?.[0].metadata.structured_cause_snapshot
    expect(snapshot).toEqual({
      schema_version: 'structured_cause_snapshot/v1',
      confirmed_count: 1,
      candidate_count: 0,
      confirmed_causes: [{
        attribution_id: '00000000-0000-4000-8000-000000000051',
        cause_code: 'material_shortage',
        cause_role: 'primary',
        taxonomy_version: 'v1.0.0',
        event_type: 'completion',
        confirmation_source: 'user_confirmed',
        confirmed_at: '2026-05-05T07:00:00.000Z',
        user_confirmed_context: {
          responsibility_class: 'contractor_attributable',
        },
      }],
    })
    expect(JSON.stringify(snapshot)).not.toContain('must not enter duration metadata')
    expect(JSON.stringify(snapshot)).not.toContain('0.99')
  })

  it('keeps multiple confirmed causes deterministic while candidate causes remain count-only', async () => {
    mocks.structuredCauseRows = [
      structuredCauseRow({
        id: '00000000-0000-4000-8000-000000000061',
        status: 'candidate',
        cause_code: 'other',
      }),
      structuredCauseRow({
        id: '00000000-0000-4000-8000-000000000062',
        cause_code: 'weather_impact',
        cause_role: 'contributing',
        confirmation_source: 'deterministic_policy',
        responsibility_class: 'owner_attributable',
      }),
      structuredCauseRow({
        id: '00000000-0000-4000-8000-000000000063',
      }),
    ]

    await collectDurationExperienceSampleFromTask(completedTask(), { actorId: 'user-1' } as any)

    const metadata = mocks.insert.mock.calls.at(-1)?.[0].metadata
    expect(metadata.structured_cause_snapshot).toMatchObject({
      confirmed_count: 2,
      candidate_count: 1,
      confirmed_causes: [
        { attribution_id: '00000000-0000-4000-8000-000000000063', cause_code: 'material_shortage', cause_role: 'primary' },
        { attribution_id: '00000000-0000-4000-8000-000000000062', cause_code: 'weather_impact', cause_role: 'contributing' },
      ],
    })
    expect(JSON.stringify(metadata.structured_cause_snapshot)).not.toContain('"other"')
    expect(metadata.benchmark_context_key).not.toContain('cause=')
    expect(JSON.stringify(metadata.structured_cause_snapshot)).not.toContain('owner_attributable')
    expect(metadata).toEqual(expect.objectContaining({
      structuredCauseAvailability: 'review_required',
      structuredCauseCode: 'material_shortage',
      structuredCauseTaxonomyVersion: 'v1.0.0',
    }))
    expect(mocks.insert.mock.calls.at(-1)?.[0].included_in_benchmark).toBe(false)
  })

  it('defensively excludes structured causes returned from another company or project', async () => {
    mocks.structuredCauseRows = [
      structuredCauseRow({
        id: '00000000-0000-4000-8000-000000000071',
        company_id: 'company-1',
        project_id: 'project-2',
        cause_code: 'weather_impact',
      }),
      structuredCauseRow({
        id: '00000000-0000-4000-8000-000000000072',
        company_id: 'company-2',
        status: 'candidate',
        cause_code: 'other',
      }),
      structuredCauseRow({
        id: '00000000-0000-4000-8000-000000000073',
        cause_code: 'quality_rework',
      }),
    ]

    await collectDurationExperienceSampleFromTask(completedTask(), { actorId: 'user-1' } as any)

    const snapshot = mocks.insert.mock.calls.at(-1)?.[0].metadata.structured_cause_snapshot
    expect(snapshot.confirmed_count).toBe(1)
    expect(snapshot.candidate_count).toBe(0)
    expect(snapshot.confirmed_causes).toEqual([
      expect.objectContaining({ attribution_id: '00000000-0000-4000-8000-000000000073', cause_code: 'quality_rework' }),
    ])
    expect(JSON.stringify(snapshot)).not.toContain('weather_impact')
    expect(JSON.stringify(snapshot)).not.toContain('"other"')
  })

  it('collects an actual-end completion fact even when status and progress synchronization lag', async () => {
    const collected = await collectDurationExperienceSampleFromTask({
      id: 'task-actual-end-completion',
      project_id: 'project-1',
      title: 'actual end completion task',
      status: 'in_progress',
      priority: 'medium',
      progress: 99,
      actual_start_date: '2026-05-01T00:00:00.000Z',
      actual_end_date: '2026-05-05T00:00:00.000Z',
      planned_start_date: '2026-05-01T00:00:00.000Z',
      planned_end_date: '2026-05-06T00:00:00.000Z',
      template_node_id: 'template-node-actual-end-completion',
      wbs_node_type: 'process',
      standard_work_code: '01-02-03',
      standard_work_name: 'actual end completion work',
      engineering_category_id: 'category-1',
      standard_task_metadata: {},
      created_at: '2026-04-30T00:00:00.000Z',
      updated_at: '2026-05-05T08:00:00.000Z',
      version: 1,
    }, { actorId: 'user-1' } as any)

    expect(collected).toBe(true)
    expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({
      task_id: 'task-actual-end-completion',
      actual_duration: 5,
      sample_strength: 'strong',
      included_in_benchmark: true,
    }))
  })

  it('uses current execution facts before deciding whether a completion sample is eligible', async () => {
    mocks.listCurrentExecutionFacts.mockResolvedValue([
      {
        entityId: 'task-execution-fact-completion',
        entityType: 'task',
        factType: 'task.actual_start_date',
        value: '2026-05-02T00:00:00.000Z',
      },
      {
        entityId: 'task-execution-fact-completion',
        entityType: 'task',
        factType: 'task.actual_end_date',
        value: '2026-05-04T00:00:00.000Z',
      },
      {
        entityId: 'task-execution-fact-completion',
        entityType: 'task',
        factType: 'task.progress',
        value: 100,
      },
      {
        entityId: 'task-execution-fact-completion',
        entityType: 'task',
        factType: 'task.status',
        value: 'completed',
      },
    ])

    const collected = await collectDurationExperienceSampleFromTask(completedTask({
      id: 'task-execution-fact-completion',
      status: 'todo',
      progress: 0,
      actual_start_date: null,
      actual_end_date: null,
    }), { actorId: 'user-1' } as any)

    expect(collected).toBe(true)
    expect(mocks.listCurrentExecutionFacts).toHaveBeenCalledWith(expect.objectContaining({
      projectId: 'project-1',
      entityType: 'task',
      entityIds: ['task-execution-fact-completion'],
      factTypes: expect.arrayContaining([
        'task.actual_start_date',
        'task.actual_end_date',
        'task.first_progress_at',
        'task.progress',
        'task.status',
      ]),
    }))
    expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({
      task_id: 'task-execution-fact-completion',
      actual_duration: 3,
      completed_at: '2026-05-04T00:00:00.000Z',
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

  it('keeps samples without authoritative calendar identity out of production-day benchmarks', async () => {
    mocks.resolveAlgorithmSeedRecords.mockResolvedValueOnce([])

    const collected = await collectDurationExperienceSampleFromTask(completedTask({
      id: 'task-calendar-identity-missing',
    }), { actorId: 'user-1' } as any)

    expect(collected).toBe(true)
    expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({
      task_id: 'task-calendar-identity-missing',
      duration_day_basis: 'calendar_day',
      actual_duration: 5,
      planned_duration: 6,
      actual_duration_calendar_days: 5,
      planned_duration_calendar_days: 6,
      actual_duration_production_days: null,
      planned_duration_production_days: null,
      construction_calendar_basis: 'calendar_day',
      sample_strength: 'unusable',
      confidence_level: 'low',
      confidence_score: 15,
      included_in_benchmark: false,
      source_lineage: expect.objectContaining({
        durationDayBasis: 'calendar_day',
        constructionCalendarAvailability: 'unavailable',
        constructionCalendarUnavailableReason: 'construction_calendar_identity_missing',
      }),
      metadata: expect.objectContaining({
        duration_day_basis: 'calendar_day',
        actual_duration_production_days: null,
        planned_duration_production_days: null,
        construction_calendar_availability: 'unavailable',
        construction_calendar_unavailable_reason: 'construction_calendar_identity_missing',
      }),
    }))
    expect(mocks.backtestEarliestPendingDurationAccuracyPrediction).not.toHaveBeenCalled()
  })

  it('fails closed to an unusable calendar-day sample when calendar resolution throws', async () => {
    mocks.resolveAlgorithmSeedRecords.mockRejectedValueOnce(new Error('calendar resolver unavailable'))

    const collected = await collectDurationExperienceSampleFromTask(completedTask({
      id: 'task-calendar-resolver-error',
    }), { actorId: 'user-1' } as any)

    expect(collected).toBe(true)
    expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({
      task_id: 'task-calendar-resolver-error',
      duration_day_basis: 'calendar_day',
      actual_duration_production_days: null,
      planned_duration_production_days: null,
      sample_strength: 'unusable',
      included_in_benchmark: false,
      metadata: expect.objectContaining({
        construction_calendar_availability: 'unavailable',
        construction_calendar_unavailable_reason: 'construction_calendar_unavailable',
      }),
    }))
    expect(mocks.backtestEarliestPendingDurationAccuracyPrediction).not.toHaveBeenCalled()
  })

  it('stores calendar-day and construction-production-day durations and consumes the production basis', async () => {
    mocks.resolveAlgorithmSeedRecords.mockResolvedValueOnce([{
      stableCode: 'spring-shutdown-2026',
      startDate: '2026-05-02',
      endDate: '2026-05-03',
      countsAsConstructionShutdown: true,
      __resolverVersionId: 'work-calendar-shutdown-version-1',
      sourceVersion: '2026',
    }])

    const collected = await collectDurationExperienceSampleFromTask({
      id: 'task-production-day-basis',
      project_id: 'project-1',
      title: 'production day basis task',
      status: 'completed',
      priority: 'medium',
      progress: 100,
      actual_start_date: '2026-05-01T00:00:00.000Z',
      actual_end_date: '2026-05-05T00:00:00.000Z',
      planned_start_date: '2026-05-01T00:00:00.000Z',
      planned_end_date: '2026-05-06T00:00:00.000Z',
      template_node_id: 'template-node-production-day-basis',
      wbs_node_type: 'process',
      standard_work_code: '01-02-03',
      standard_work_name: 'production day basis work',
      engineering_category_id: 'category-1',
      standard_task_metadata: {},
      created_at: '2026-04-30T00:00:00.000Z',
      updated_at: '2026-05-05T08:00:00.000Z',
      version: 1,
    }, { actorId: 'user-1' } as any)

    expect(collected).toBe(true)
    expect(mocks.resolveAlgorithmSeedRecords).toHaveBeenCalledWith('work_calendar', expect.objectContaining({
      projectId: 'project-1',
      standardWorkCode: '01-02-03',
      templateNodeId: 'template-node-production-day-basis',
    }))
    expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({
      task_id: 'task-production-day-basis',
      actual_duration: 3,
      planned_duration: 4,
      metadata: expect.objectContaining({
        duration_day_basis: 'construction_production_day',
        actual_duration_calendar_days: 5,
        actual_duration_production_days: 3,
        planned_duration_calendar_days: 6,
        planned_duration_production_days: 4,
        construction_calendar_basis: 'official_construction_calendar_seed',
        construction_calendar_window_count: 1,
      }),
    }))
  })

  it('quarantines a completed sample when the resolved calendar has no identity', async () => {
    mocks.resolveAlgorithmSeedRecords.mockResolvedValueOnce([])

    const collected = await collectDurationExperienceSampleFromTask(completedTask({
      id: 'task-calendar-identity-missing',
    }), { actorId: 'user-1' } as any)

    expect(collected).toBe(true)
    expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({
      task_id: 'task-calendar-identity-missing',
      duration_day_basis: 'calendar_day',
      actual_duration: 5,
      planned_duration: 6,
      actual_duration_production_days: null,
      planned_duration_production_days: null,
      sample_strength: 'unusable',
      confidence_level: 'low',
      confidence_score: 15,
      included_in_benchmark: false,
      metadata: expect.objectContaining({
        duration_day_basis: 'calendar_day',
        construction_calendar_availability: 'unavailable',
        construction_calendar_ref: null,
        construction_calendar_version: null,
        construction_calendar_as_of: '2026-05-05',
      }),
      source_lineage: expect.objectContaining({
        durationDayBasis: 'calendar_day',
        constructionCalendarAvailability: 'unavailable',
        constructionCalendarRef: null,
        constructionCalendarVersion: null,
        constructionCalendarAsOf: '2026-05-05',
      }),
    }))
  })

  it('quarantines a completed sample when calendar resolution fails', async () => {
    mocks.resolveAlgorithmSeedRecords.mockRejectedValueOnce(new Error('calendar resolver unavailable'))

    const collected = await collectDurationExperienceSampleFromTask(completedTask({
      id: 'task-calendar-resolution-failed',
    }), { actorId: 'user-1' } as any)

    expect(collected).toBe(true)
    expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({
      task_id: 'task-calendar-resolution-failed',
      duration_day_basis: 'calendar_day',
      actual_duration_production_days: null,
      planned_duration_production_days: null,
      sample_strength: 'unusable',
      included_in_benchmark: false,
      metadata: expect.objectContaining({
        construction_calendar_availability: 'unavailable',
        construction_calendar_ref: null,
        construction_calendar_version: null,
      }),
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
