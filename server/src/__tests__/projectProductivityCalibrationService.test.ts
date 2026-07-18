import { beforeEach, describe, expect, it, vi } from 'vitest'

type Row = Record<string, any>
type Filter = { op: 'eq' | 'in' | 'not'; column: string; value: any }

const mocks = vi.hoisted(() => {
  const state = {
    durationExperienceSamples: [] as Row[],
    projectDailySnapshot: [] as Row[],
    projectScheduleStates: [] as Row[],
    projectProductivityCalibrations: [] as Row[],
    durationContextPolicyDecisions: [] as Row[],
  }

  function rowsFor(table: string) {
    if (table === 'duration_experience_samples') return state.durationExperienceSamples
    if (table === 'project_daily_snapshot') return state.projectDailySnapshot
    if (table === 'project_schedule_states') return state.projectScheduleStates
    if (table === 'project_productivity_compensation_calibrations') return state.projectProductivityCalibrations
    if (table === 'duration_context_policy_decisions') return state.durationContextPolicyDecisions
    return []
  }

  function setRows(table: string, rows: Row[]) {
    if (table === 'project_productivity_compensation_calibrations') {
      state.projectProductivityCalibrations = rows
    }
    if (table === 'duration_context_policy_decisions') {
      state.durationContextPolicyDecisions = rows
    }
  }

  function applyFilters(rows: Row[], filters: Filter[]) {
    return filters.reduce((result, filter) => {
      if (filter.op === 'eq') return result.filter((row) => row[filter.column] === filter.value)
      if (filter.op === 'in') return result.filter((row) => filter.value.includes(row[filter.column]))
      if (filter.op === 'not' && filter.value === null) return result.filter((row) => row[filter.column] != null)
      return result
    }, rows)
  }

  function createBuilder(table: string) {
    const filters: Filter[] = []
    let pendingUpdate: Row | null = null
    const builder: any = {
      select: vi.fn(() => builder),
      eq: vi.fn((column: string, value: unknown) => {
        filters.push({ op: 'eq', column, value })
        return builder
      }),
      in: vi.fn((column: string, values: unknown[]) => {
        filters.push({ op: 'in', column, value: values })
        return builder
      }),
      not: vi.fn((column: string, _operator: string, value: unknown) => {
        filters.push({ op: 'not', column, value })
        return builder
      }),
      order: vi.fn(() => builder),
      limit: vi.fn(() => builder),
      update: vi.fn((payload: Row) => {
        pendingUpdate = payload
        return builder
      }),
      insert: vi.fn((payload: Row) => {
        const rows = rowsFor(table)
        const row = { id: payload.id ?? `calibration-${rows.length + 1}`, ...payload }
        rows.push(row)
        return {
          select: vi.fn(() => ({
            single: vi.fn(() => Promise.resolve({ data: row, error: null })),
          })),
        }
      }),
      maybeSingle: vi.fn(() => Promise.resolve({
        data: applyFilters(rowsFor(table), filters)[0] ?? null,
        error: null,
      })),
      single: vi.fn(() => Promise.resolve({
        data: applyFilters(rowsFor(table), filters)[0] ?? null,
        error: null,
      })),
      then: vi.fn((resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => {
        if (pendingUpdate) {
          const nextRows = rowsFor(table).map((row) => (
            applyFilters([row], filters).length > 0 ? { ...row, ...pendingUpdate } : row
          ))
          setRows(table, nextRows)
          return Promise.resolve({ data: nextRows, error: null }).then(resolve, reject)
        }
        return Promise.resolve({
          data: applyFilters(rowsFor(table), filters),
          error: null,
        }).then(resolve, reject)
      }),
    }
    return builder
  }

  return {
    state,
    from: vi.fn((table: string) => createBuilder(table)),
    rawQuery: vi.fn(),
    getProjectCompanyId: vi.fn(),
    replaceCalibration: vi.fn(),
    rollbackCalibration: vi.fn(),
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
}))

vi.mock('../services/durationLearningAssetAtomicStoreService.js', () => ({
  replaceProjectProductivityCalibrationAtomically: mocks.replaceCalibration,
  rollbackProjectProductivityCalibrationAtomically: mocks.rollbackCalibration,
}))

const {
  buildProjectProductivityCalibration,
  runProjectProductivityCalibration,
  rollbackPublishedProjectProductivityCalibration,
} = await import('../services/projectProductivityCalibrationService.js')

function makeDurationSamples(count: number, actualDuration = 8) {
  return Array.from({ length: count }, (_, index) => ({
    id: `sample-${index + 1}`,
    company_id: '10000000-0000-4000-8000-000000000001',
    project_id: 'project-1',
    task_id: `task-${index + 1}`,
    planned_duration: 10,
    actual_duration: actualDuration,
    duration_day_basis: 'construction_production_day',
    sample_status: 'active',
    included_in_benchmark: true,
    completed_at: new Date(Date.UTC(2026, 0, index + 1)).toISOString().slice(0, 10),
    sample_strength: 'strong',
    confidence_level: 'high',
    experience_tier: 'T1',
    reuse_scope: 'project',
    fact_source: 'actual_outcome',
    evidence_fingerprint: `sha256:sample-${index + 1}`,
    source_lineage: { sourceType: 'task_actual_dates' },
  }))
}

function makeSnapshots(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    project_id: 'project-1',
    snapshot_date: new Date(Date.UTC(2026, 0, index + 1)).toISOString().slice(0, 10),
    overall_progress: index,
    task_progress: index,
    delay_days: Math.max(0, 40 - index),
    active_obstacle_count: Math.max(0, 8 - Math.floor(index / 10)),
    pending_condition_count: Math.max(0, 4 - Math.floor(index / 15)),
    active_risk_count: Math.max(0, 4 - Math.floor(index / 20)),
    shifted_milestone_count: 0,
    critical_path_affected_tasks: 0,
    attention_required: false,
  }))
}

describe('projectProductivityCalibrationService', () => {
  beforeEach(() => {
    mocks.state.durationExperienceSamples = []
    mocks.state.projectDailySnapshot = []
    mocks.state.projectScheduleStates = []
    mocks.state.projectProductivityCalibrations = []
    mocks.state.durationContextPolicyDecisions = []
    mocks.from.mockClear()
    mocks.rawQuery.mockReset()
    mocks.rawQuery.mockResolvedValue({ rows: [{ id: 'algorithm-policy-candidate-1' }] })
    mocks.getProjectCompanyId.mockReset()
    mocks.getProjectCompanyId.mockResolvedValue('10000000-0000-4000-8000-000000000001')
    mocks.replaceCalibration.mockReset()
    mocks.replaceCalibration.mockImplementation(async (payload: Row) => {
      const previous = payload.status === 'published'
        ? mocks.state.projectProductivityCalibrations.find((row) => (
          row.project_id === payload.project_id
          && row.calibration_key === payload.calibration_key
          && row.status === 'published'
        ))
        : null
      if (previous) previous.status = 'superseded'
      const row = { id: `calibration-${mocks.state.projectProductivityCalibrations.length + 1}`, ...payload }
      mocks.state.projectProductivityCalibrations.push(row)
      if (previous) previous.superseded_by = row.id
      return row
    })
    mocks.rollbackCalibration.mockReset()
    mocks.rollbackCalibration.mockImplementation(async ({ projectId, reason }: { projectId: string; reason: string }) => {
      const current = mocks.state.projectProductivityCalibrations.find((row) => (
        row.project_id === projectId
        && row.calibration_key === 'productivity_compensation'
        && row.status === 'published'
      ))
      if (!current) return null
      const previous = mocks.state.projectProductivityCalibrations.find((row) => (
        row.superseded_by === current.id && row.status === 'superseded'
      ))
      current.status = 'rolled_back'
      current.rollback_of = previous?.id ?? null
      current.evidence_summary = {
        ...(current.evidence_summary ?? {}),
        rollbackReason: reason,
        rolledBackAt: new Date().toISOString(),
      }
      if (previous) {
        previous.status = 'published'
        previous.superseded_by = null
      }
      return {
        id: current.id,
        status: 'rolled_back',
        restoredCalibrationId: previous?.id ?? null,
      }
    })
  })

  it('keeps a 30 day shadow run as evidence only without publishing runtime parameters', async () => {
    mocks.state.durationExperienceSamples = makeDurationSamples(30)
    mocks.state.projectDailySnapshot = makeSnapshots(30)

    const result = await buildProjectProductivityCalibration({
      projectId: 'project-1',
      windowEndDate: '2026-01-30',
      windowDays: 30,
      baseProductivity: 0.71,
      observedProductivity: 0.83,
      actionPolicy: 'shadow_run',
    })

    expect(result).toEqual(expect.objectContaining({
      projectId: 'project-1',
      status: 'shadow',
      actionPolicy: 'shadow_run',
      windowDays: 30,
      observedProductivity: 0.83,
    }))
    expect(result?.evidenceSummary).toEqual(expect.objectContaining({
      shadowRunPolicy: 'compare_base_adjusted_to_observed_without_runtime_mutation',
      governancePolicy: 'published_rows_only_are_consumed_by_runtime_compensation',
    }))
  })

  it('consumes benchmark-eligible samples after governance accepts them', async () => {
    mocks.state.durationExperienceSamples = makeDurationSamples(12).map((sample) => ({
      ...sample,
      sample_status: 'accepted',
    }))

    const result = await buildProjectProductivityCalibration({
      projectId: 'project-1',
      windowEndDate: '2026-01-31',
      windowDays: 31,
      baseProductivity: 0.71,
      actionPolicy: 'shadow_run',
    })

    expect(result).toEqual(expect.objectContaining({
      sampleCount: 12,
      observedProductivity: 1.25,
    }))
  })

  it('does not treat controlled staging outcomes as real calibration samples', async () => {
    mocks.state.durationExperienceSamples = makeDurationSamples(12).map((sample) => ({
      ...sample,
      sample_status: 'accepted',
      metadata: {
        stagingControlledReplay: true,
        notRealProductionOutcome: true,
      },
    }))

    const result = await buildProjectProductivityCalibration({
      projectId: 'project-1',
      windowEndDate: '2026-01-31',
      windowDays: 31,
      baseProductivity: 0.71,
      actionPolicy: 'shadow_run',
    })

    expect(result).toEqual(expect.objectContaining({
      sampleCount: 0,
      observedProductivity: null,
    }))
  })

  it('keeps mature calibration output as a candidate for the unified canary and stable publication chain', async () => {
    mocks.state.durationExperienceSamples = makeDurationSamples(90)
    mocks.state.projectDailySnapshot = makeSnapshots(90)

    const result = await runProjectProductivityCalibration({
      projectId: 'project-1',
      windowEndDate: '2026-03-31',
      windowDays: 90,
      baseProductivity: 0.71,
      observedProductivity: 0.82,
      actionPolicy: 'auto_publish',
    })

    expect(result).toEqual(expect.objectContaining({
      status: 'candidate',
      actionPolicy: 'auto_publish',
      maturityDays: 90,
    }))
    expect(result?.maeAfter ?? 1).toBeLessThan(result?.maeBefore ?? 0)
    expect(mocks.state.projectProductivityCalibrations).toHaveLength(1)
    expect(mocks.state.projectProductivityCalibrations[0]).toEqual(expect.objectContaining({
      status: 'candidate',
      calibration_key: 'productivity_compensation',
      project_id: 'project-1',
    }))
    expect(mocks.replaceCalibration).toHaveBeenCalledOnce()
    expect(mocks.from).not.toHaveBeenCalledWith('project_productivity_compensation_calibrations')
    expect(mocks.state.projectProductivityCalibrations[0].parameter_payload).toEqual(expect.objectContaining({
      calibrationVersion: 'project_productivity_compensation_v1',
      guardrails: expect.objectContaining({
        publishedOnlyRuntimeConsumption: true,
      }),
    }))
  })

  it('persists a contextual-bandit decision log when a calibration run is persisted', async () => {
    mocks.state.durationExperienceSamples = makeDurationSamples(90)
    mocks.state.projectDailySnapshot = makeSnapshots(90)

    const result = await runProjectProductivityCalibration({
      projectId: 'project-1',
      windowEndDate: '2026-03-31',
      windowDays: 90,
      baseProductivity: 0.71,
      observedProductivity: 0.82,
      actionPolicy: 'auto_publish',
    })

    expect(result?.parameterPayload.policyLearningRecommendation).toEqual(expect.objectContaining({
      modelFamily: 'contextual_bandit_v1',
    }))
    expect(mocks.state.durationContextPolicyDecisions).toHaveLength(1)
    expect(mocks.state.durationContextPolicyDecisions[0]).toEqual(expect.objectContaining({
      project_id: 'project-1',
      model_family: 'contextual_bandit_v1',
      decision_status: 'auto_publish_eligible',
      reward_status: 'pending',
      runtime_mutation_policy: 'none_decision_log_only',
      source_calibration_id: 'calibration-1',
    }))
    expect(mocks.state.durationContextPolicyDecisions[0].recommended_action).toEqual(
      (result?.parameterPayload.policyLearningRecommendation as any).recommendedAction,
    )
  })

  it('bridges persisted productivity calibration policy learning into unified governance candidate events', async () => {
    mocks.state.durationExperienceSamples = makeDurationSamples(90)
    mocks.state.projectDailySnapshot = makeSnapshots(90)

    const result = await runProjectProductivityCalibration({
      projectId: 'project-1',
      windowEndDate: '2026-03-31',
      windowDays: 90,
      baseProductivity: 0.71,
      observedProductivity: 0.82,
      actionPolicy: 'auto_publish',
    })

    expect(result?.parameterPayload.policyLearningRecommendation).toEqual(expect.objectContaining({
      modelFamily: 'contextual_bandit_v1',
    }))
    expect(mocks.getProjectCompanyId).toHaveBeenCalledWith('project-1')

    const candidateInsert = mocks.rawQuery.mock.calls.find((call) =>
      String(call[0]).toLowerCase().includes('insert into public.algorithm_asset_candidate_events'),
    )
    expect(candidateInsert).toBeTruthy()
    expect(candidateInsert?.[1]).toEqual(expect.arrayContaining([
      'duration.context.policy.contextual_bandit_v1.project-1',
      'durationContextPolicyLearningService',
      'project',
      '10000000-0000-4000-8000-000000000001',
      'project-1',
      'candidate_weight',
      'governed_candidate',
      'manual_governance_required',
      'auto_review_package',
      'review_required',
      'candidate_only',
    ]))
    expect(candidateInsert?.[1]).toEqual(expect.arrayContaining([
      expect.objectContaining({
        originalProjectId: 'project-1',
        modelFamily: 'contextual_bandit_v1',
        recommendedAction: expect.objectContaining({
          runtimePolicy: 'auto_publish_eligible',
        }),
      }),
    ]))
  })

  it('keeps low-bias project calibration from overcompensating beyond observed productivity', async () => {
    mocks.state.durationExperienceSamples = makeDurationSamples(90, 8)
    mocks.state.projectDailySnapshot = makeSnapshots(90)

    const result = await buildProjectProductivityCalibration({
      projectId: 'project-1',
      windowEndDate: '2026-03-31',
      windowDays: 90,
      baseProductivity: 0.74,
      observedProductivity: 0.81,
      actionPolicy: 'candidate_only',
    })

    expect(result).toEqual(expect.objectContaining({
      status: 'candidate',
      biasBefore: -0.07,
    }))
    expect(result?.maeAfter ?? 1).toBeLessThan(result?.maeBefore ?? 0)
    expect(result?.adjustedProductivity ?? 0).toBeLessThan(0.81)
    expect(result?.recommendedMinUplift).toBe(0)
    expect(result?.recommendedCap ?? 1).toBeLessThanOrEqual(0.056)
  })

  it('still improves high-bias project calibration without reverting to observation-only', async () => {
    mocks.state.durationExperienceSamples = makeDurationSamples(90, 8)
    mocks.state.projectDailySnapshot = makeSnapshots(90)

    const result = await buildProjectProductivityCalibration({
      projectId: 'project-1',
      windowEndDate: '2026-03-31',
      windowDays: 90,
      baseProductivity: 0.72,
      observedProductivity: 0.86,
      actionPolicy: 'candidate_only',
    })

    expect(result).toEqual(expect.objectContaining({
      status: 'candidate',
      biasBefore: -0.14,
    }))
    expect(result?.maeAfter ?? 1).toBeLessThan(result?.maeBefore ?? 0)
    expect(result?.adjustedProductivity ?? 0).toBeGreaterThan(0.8)
    expect(result?.adjustedProductivity ?? 1).toBeLessThan(0.86)
    expect(result?.recommendedCap ?? 0).toBeGreaterThan(0.09)
  })

  it('embeds backend audit replay evidence in every calibration result', async () => {
    mocks.state.durationExperienceSamples = makeDurationSamples(30)
    mocks.state.projectDailySnapshot = makeSnapshots(30)

    const result = await buildProjectProductivityCalibration({
      projectId: 'project-1',
      windowEndDate: '2026-01-30',
      windowDays: 30,
      baseProductivity: 0.71,
      observedProductivity: 0.83,
      actionPolicy: 'shadow_run',
    })

    expect(result?.evidenceSummary.auditReplay).toEqual(expect.objectContaining({
      replayCode: 'project_productivity_calibration_audit_replay',
      frontendExposurePolicy: 'backend_admin_api_only',
      attribution: expect.objectContaining({
        reportCode: 'duration_context_factor_attribution',
        status: 'insufficient_observed_cases',
      }),
      combinationMatrix: expect.objectContaining({
        matrixCode: 'duration_context_combination_regression_matrix',
        scenarioCount: expect.any(Number),
        regressionStatus: 'active',
      }),
      jsonContractValidation: expect.objectContaining({
        validator: 'validateDurationContextSummaryContract',
        status: 'not_run_no_factor_summary_payload',
      }),
    }))
  })

  it('adds a candidate-only threshold evolution package for mature safe calibration evidence', async () => {
    mocks.state.durationExperienceSamples = makeDurationSamples(90, 8)
    mocks.state.projectDailySnapshot = makeSnapshots(90)

    const result = await buildProjectProductivityCalibration({
      projectId: 'project-1',
      windowEndDate: '2026-03-31',
      windowDays: 90,
      baseProductivity: 0.72,
      observedProductivity: 0.86,
      actionPolicy: 'candidate_only',
    })

    expect(result?.parameterPayload.thresholdEvolutionCandidate).toEqual(expect.objectContaining({
      status: 'candidate',
      runtimeEffect: 'candidate_only_until_published',
      proposedCompensationCap: result?.recommendedCap,
      proposedMinAppliedUplift: result?.recommendedMinUplift,
      automationPolicy: expect.objectContaining({
        factorKey: 'productivity_compensation',
        riskTier: 'low',
        runtimeAutoPublishEligible: true,
        runtimeActivationBoundary: 'published_only_runtime_consumption',
        allowedAutomationStages: expect.arrayContaining(['shadow_run', 'audit_replay', 'threshold_evolution_candidate']),
      }),
      evidenceThresholds: expect.objectContaining({
        sampleCount: 90,
        snapshotCount: 90,
        maturityDays: 90,
        maeImprovement: expect.any(Number),
        overcompensationRate: 0,
      }),
    }))
    expect(result?.evidenceSummary.thresholdEvolutionCandidate).toEqual(expect.objectContaining({
      status: 'candidate',
      publicationGate: 'requires_candidate_review_or_auto_publish_guardrails',
      automationPolicy: expect.objectContaining({
        runtimeAutoPublishEligible: true,
        rollbackRequired: true,
      }),
    }))
    expect(result?.parameterPayload.automationPolicy).toEqual(expect.objectContaining({
      factorKey: 'productivity_compensation',
      riskTier: 'low',
      runtimeActivationBoundary: 'published_only_runtime_consumption',
    }))
    expect(result?.parameterPayload.policyLearningRecommendation).toEqual(expect.objectContaining({
      modelFamily: 'contextual_bandit_v1',
      governance: expect.objectContaining({
        policyLayerRole: 'strategy_candidate_layer_only',
      }),
      recommendedAction: expect.objectContaining({
        actionKey: 'publish_low_risk_calibration_threshold',
        runtimePolicy: 'auto_publish_eligible',
      }),
    }))
  })

  it('attaches T3 productivity state bucket evidence to calibration payloads and persisted decision logs', async () => {
    mocks.state.durationExperienceSamples = makeDurationSamples(90, 8)
    mocks.state.projectDailySnapshot = makeSnapshots(90)

    const result = await runProjectProductivityCalibration({
      projectId: 'project-1',
      windowEndDate: '2026-03-31',
      windowDays: 90,
      baseProductivity: 0.72,
      observedProductivity: 0.86,
      actionPolicy: 'candidate_only',
    })

    expect(result?.evidenceSummary.productivityLearningBucket).toEqual(expect.objectContaining({
      stateBucket: 'mature_90d|risk:low|schedule:none|hard:0|experience:T3',
      experienceTier: 'T3',
      validation: expect.objectContaining({
        isValid: true,
        reasonCodes: [],
      }),
      driftDetected: false,
    }))
    expect(result?.parameterPayload.productivityLearningBucket).toEqual(result?.evidenceSummary.productivityLearningBucket)
    expect(result?.parameterPayload.policyLearningRecommendation).toEqual(expect.objectContaining({
      stateVector: expect.objectContaining({
        stateBucket: 'mature_90d|risk:low|schedule:none|hard:0|experience:T3',
        experienceTier: 'T3',
      }),
    }))
    expect(mocks.state.projectProductivityCalibrations[0].parameter_payload.productivityLearningBucket).toEqual(
      result?.evidenceSummary.productivityLearningBucket,
    )
    expect(mocks.state.durationContextPolicyDecisions[0].state_vector).toEqual(expect.objectContaining({
      stateBucket: 'mature_90d|risk:low|schedule:none|hard:0|experience:T3',
      experienceTier: 'T3',
    }))
    expect(mocks.state.durationContextPolicyDecisions[0].metadata.productivityLearningBucket).toEqual(
      result?.evidenceSummary.productivityLearningBucket,
    )
  })

  it('marks non-T3 productivity learning buckets as drift and falls back to a generated T3 bucket', async () => {
    mocks.state.durationExperienceSamples = makeDurationSamples(90, 8)
    mocks.state.projectDailySnapshot = makeSnapshots(90)

    const result = await buildProjectProductivityCalibration({
      projectId: 'project-1',
      windowEndDate: '2026-03-31',
      windowDays: 90,
      baseProductivity: 0.72,
      observedProductivity: 0.86,
      actionPolicy: 'candidate_only',
      shadowEvidence: {
        source: 'local-test',
        productivityLearning: {
          scheduleState: 'accelerating',
          stateBucket: 'mature_90d|risk:low|schedule:accelerating|hard:0|experience:T1',
        },
      },
    })

    expect(result?.evidenceSummary.productivityLearningBucket).toEqual(expect.objectContaining({
      stateBucket: 'mature_90d|risk:low|schedule:accelerating|hard:0|experience:T3',
      sourceStateBucket: 'mature_90d|risk:low|schedule:accelerating|hard:0|experience:T1',
      experienceTier: 'T3',
      validationPolicy: 'duration_context_policy_state_bucket_T3_only',
      driftDetected: true,
      driftReasonCodes: ['experience_tier_mismatch'],
    }))
    const productivityLearningBucket = result?.evidenceSummary.productivityLearningBucket as Record<string, any>
    expect(productivityLearningBucket.validation).toEqual(expect.objectContaining({
      isValid: true,
      reasonCodes: [],
    }))
    expect(result?.parameterPayload.policyLearningRecommendation).toEqual(expect.objectContaining({
      stateVector: expect.objectContaining({
        stateBucket: 'mature_90d|risk:low|schedule:accelerating|hard:0|experience:T3',
        experienceTier: 'T3',
      }),
    }))
  })

  it('atomically rolls back the current calibration and restores the predecessor without touching shadow evidence', async () => {
    mocks.state.projectProductivityCalibrations = [
      {
        id: 'published-0',
        project_id: 'project-1',
        calibration_key: 'productivity_compensation',
        status: 'superseded',
        superseded_by: 'published-1',
        published_at: '2026-03-01T00:00:00.000Z',
      },
      {
        id: 'published-1',
        project_id: 'project-1',
        calibration_key: 'productivity_compensation',
        status: 'published',
        published_at: '2026-04-01T00:00:00.000Z',
        parameter_payload: { compensationCap: 0.06 },
        evidence_summary: { windowDays: 90 },
      },
      {
        id: 'shadow-1',
        project_id: 'project-1',
        calibration_key: 'productivity_compensation',
        status: 'shadow',
        evidence_summary: { windowDays: 30 },
      },
    ]

    const result = await rollbackPublishedProjectProductivityCalibration('project-1', 'shadow_run_regression')

    expect(result).toEqual({
      id: 'published-1',
      status: 'rolled_back',
      restoredCalibrationId: 'published-0',
    })
    expect(mocks.state.projectProductivityCalibrations.find((row) => row.id === 'published-1')).toEqual(expect.objectContaining({
      status: 'rolled_back',
      evidence_summary: expect.objectContaining({
        rollbackReason: 'shadow_run_regression',
        rolledBackAt: expect.any(String),
      }),
    }))
    expect(mocks.state.projectProductivityCalibrations.find((row) => row.id === 'published-0')).toEqual(expect.objectContaining({
      status: 'published',
      superseded_by: null,
    }))
    expect(mocks.state.projectProductivityCalibrations.find((row) => row.id === 'shadow-1')?.status).toBe('shadow')
    expect(mocks.rollbackCalibration).toHaveBeenCalledWith({
      companyId: '10000000-0000-4000-8000-000000000001',
      projectId: 'project-1',
      reason: 'shadow_run_regression',
    })
  })
})
