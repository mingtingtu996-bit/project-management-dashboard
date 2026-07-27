import { beforeEach, describe, expect, it, vi } from 'vitest'

type Row = Record<string, any>
type Filter = { op: 'eq' | 'in'; column: string; value: any }

const mocks = vi.hoisted(() => {
  const state = {
    policyDecisions: [] as Row[],
    policyParameters: [] as Row[],
    projectProductivityCalibrations: [] as Row[],
  }

  function rowsFor(table: string) {
    if (table === 'duration_context_policy_decisions') return state.policyDecisions
    if (table === 'duration_context_policy_parameters') return state.policyParameters
    if (table === 'project_productivity_compensation_calibrations') return state.projectProductivityCalibrations
    return []
  }

  function applyFilters(rows: Row[], filters: Filter[]) {
    return filters.reduce((result, filter) => {
      if (filter.op === 'eq') return result.filter((row) => row[filter.column] === filter.value)
      if (filter.op === 'in') return result.filter((row) => Array.isArray(filter.value) && filter.value.includes(row[filter.column]))
      return result
    }, rows)
  }

  function createBuilder(table: string) {
    const filters: Filter[] = []
    let limitCount: number | null = null
    const builder: any = {
      select: vi.fn(() => builder),
      eq: vi.fn((column: string, value: unknown) => {
        filters.push({ op: 'eq', column, value })
        return builder
      }),
      in: vi.fn((column: string, value: unknown[]) => {
        filters.push({ op: 'in', column, value })
        return builder
      }),
      order: vi.fn(() => builder),
      limit: vi.fn((count: number) => {
        limitCount = count
        return builder
      }),
      then: vi.fn((resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => {
        const rows = applyFilters(rowsFor(table), filters)
        return Promise.resolve({
          data: limitCount == null ? rows : rows.slice(0, limitCount),
          error: null,
        }).then(resolve, reject)
      }),
    }
    return builder
  }

  return {
    state,
    from: vi.fn((table: string) => createBuilder(table)),
  }
})

vi.mock('../services/dbService.js', () => ({
  supabase: {
    from: mocks.from,
  },
}))

const { runDurationContextLearnedPolicyReplay } = await import('../services/durationContextLearnedPolicyReplayService.js')

function decisionRow(input: {
  id: string
  companyId?: string | null
  projectId?: string
  baselineReward: number
  maturityTier?: string
  scheduleState?: string | null
  highRiskFactorCount?: number
  hardConstraintActive?: boolean
}) {
  return {
    id: input.id,
    company_id: input.companyId ?? 'company-1',
    project_id: input.projectId ?? 'project-1',
    model_family: 'contextual_bandit_v1',
    model_version: 'contextual_bandit_v1',
    reward_status: 'evaluated',
    decision_status: 'reward_evaluated',
    state_vector: {
      maturityTier: input.maturityTier ?? 'mature_90d',
      scheduleState: input.scheduleState ?? 'accelerating',
      highRiskFactorCount: input.highRiskFactorCount ?? 0,
      mediumRiskFactorCount: 0,
      lowRiskFactorCount: (input.highRiskFactorCount ?? 0) > 0 ? 0 : 1,
      hardConstraintActive: input.hardConstraintActive ?? false,
    },
    candidate_actions: [
      {
        actionKey: 'keep_rule_baseline',
        runtimePolicy: 'shadow_run',
        expectedReward: input.baselineReward,
        reward: { totalReward: input.baselineReward },
      },
    ],
    reward_payload: { totalReward: input.baselineReward },
  }
}

function parameterRow(input: {
  id: string
  companyId?: string | null
  projectId?: string | null
  stateBucket: string
  actionKey: string
  weight: number
  runtimeAutoPublishEligible?: boolean
  guardrails?: string[]
}) {
  return {
    id: input.id,
    model_family: 'contextual_bandit_v1',
    model_version: 'contextual_bandit_v1',
    company_id: input.companyId ?? 'company-1',
    project_id: input.projectId ?? 'project-1',
    parameter_status: 'candidate',
    runtime_mutation_policy: 'none_candidate_parameters_only',
    runtime_auto_publish_eligible: input.runtimeAutoPublishEligible ?? false,
    state_bucket: input.stateBucket,
    action_key: input.actionKey,
    learned_weight: input.weight,
    sample_count: 12,
    reward_summary: {
      guardrails: input.guardrails ?? ['offline_candidate_parameter_only'],
    },
  }
}

describe('durationContextLearnedPolicyReplayService', () => {
  beforeEach(() => {
    mocks.state.policyDecisions = []
    mocks.state.policyParameters = []
    mocks.state.projectProductivityCalibrations = []
    mocks.from.mockClear()
  })

  it('compares learned policy action weights against rule baseline rewards without runtime mutation', async () => {
    const lowRiskBucket = 'mature_90d|risk:low|schedule:accelerating|hard:0'
    const currentLowRiskBucket = `${lowRiskBucket}|experience:T3`
    mocks.state.policyParameters = [
      parameterRow({
        id: 'p1',
        stateBucket: lowRiskBucket,
        actionKey: 'publish_low_risk_calibration_threshold',
        weight: 0.21,
      }),
    ]
    mocks.state.policyDecisions = [
      decisionRow({ id: 'd1', baselineReward: 0.02 }),
      decisionRow({ id: 'd2', baselineReward: 0.04 }),
      decisionRow({ id: 'd3', baselineReward: 0.01 }),
    ]

    const report = await runDurationContextLearnedPolicyReplay({
      minReplayCases: 2,
    })

    expect(report).toEqual(expect.objectContaining({
      reportCode: 'duration_context_learned_policy_replay',
      frontendExposurePolicy: 'backend_admin_api_only',
      runtimeMutationPolicy: 'none_replay_report_only',
      evaluatedDecisionCount: 3,
      matchedParameterCaseCount: 3,
      canaryEligibleCaseCount: 3,
    }))
    expect(report.summary.projectedRewardDelta).toBeGreaterThan(0)
    expect(report.summary.canaryReadiness).toBe('candidate_ready_for_low_risk_canary_review')
    expect(report.cases[0]).toEqual(expect.objectContaining({
      baselineActionKey: 'keep_rule_baseline',
      learnedActionKey: 'publish_low_risk_calibration_threshold',
      stateBucket: currentLowRiskBucket,
      canaryEligible: true,
      runtimeMutationPolicy: 'none_replay_report_only',
    }))
  })

  it('blocks high-risk learned policy wins from canary eligibility', async () => {
    const highRiskBucket = 'mature_90d|risk:high|schedule:accelerating|hard:0'
    mocks.state.policyParameters = [
      parameterRow({
        id: 'p1',
        stateBucket: highRiskBucket,
        actionKey: 'hold_high_risk_candidate_for_review',
        weight: 0.45,
        guardrails: ['manual_runtime_promotion_required'],
      }),
    ]
    mocks.state.policyDecisions = [
      decisionRow({ id: 'd1', baselineReward: 0.01, highRiskFactorCount: 2 }),
      decisionRow({ id: 'd2', baselineReward: 0.02, highRiskFactorCount: 2 }),
    ]

    const report = await runDurationContextLearnedPolicyReplay({
      minReplayCases: 2,
    })

    expect(report.summary.projectedRewardDelta).toBeGreaterThan(0)
    expect(report.summary.canaryReadiness).toBe('blocked_by_guardrails')
    expect(report.canaryEligibleCaseCount).toBe(0)
    expect(report.cases[0]).toEqual(expect.objectContaining({
      canaryEligible: false,
      blockedBy: expect.arrayContaining(['manual_runtime_promotion_required']),
    }))
  })

  it('attaches calibration MAE and scope evidence to replay cases for the auto-publish gate', async () => {
    const lowRiskBucket = 'mature_90d|risk:low|schedule:accelerating|hard:0'
    mocks.state.policyParameters = [
      parameterRow({
        id: 'p1',
        stateBucket: lowRiskBucket,
        actionKey: 'publish_low_risk_calibration_threshold',
        weight: 0.21,
      }),
    ]
    mocks.state.policyDecisions = [
      {
        ...decisionRow({ id: 'd1', baselineReward: 0.02 }),
        reward_source_calibration_id: 'calibration-1',
      },
    ]
    mocks.state.projectProductivityCalibrations = [
      {
        id: 'calibration-1',
        project_id: 'project-1',
        sample_count: 80,
        snapshot_count: 40,
        mae_before: 0.18,
        mae_after: 0.11,
        overcompensation_rate: 0.03,
        parameter_payload: {
          durationRatio: 0.82,
        },
        evidence_summary: {
          enabledLearningScopes: ['global', 'industry_baseline', 'company', 'project'],
          scopeSampleCounts: {
            global: 80,
            industry: 40,
            company: 12,
            project: 6,
          },
        },
      },
    ]

    const report = await runDurationContextLearnedPolicyReplay({
      minReplayCases: 1,
    })

    expect(report.cases[0].autoPublishEvidence).toEqual({
      evidenceRefs: [
        'duration_context_policy_decisions:d1',
        'project_productivity_compensation_calibrations:calibration-1',
      ],
      enabledLearningScopes: ['global', 'industry_baseline', 'company', 'project'],
      scopeSampleCounts: {
        global: 80,
        industry: 40,
        company: 12,
        project: 6,
      },
      sampleCount: 80,
      maeBefore: 0.18,
      maeAfter: 0.11,
      overcompensationRate: 0.03,
      durationRatio: 0.82,
    })
  })

  it('matches learned parameters by company and project before falling back to broader scopes', async () => {
    const lowRiskBucket = 'mature_90d|risk:low|schedule:accelerating|hard:0'
    mocks.state.policyParameters = [
      parameterRow({
        id: 'company-a-project-parameter',
        companyId: 'company-a',
        projectId: 'project-a',
        stateBucket: lowRiskBucket,
        actionKey: 'publish_low_risk_calibration_threshold',
        weight: 0.31,
      }),
      parameterRow({
        id: 'company-b-project-parameter',
        companyId: 'company-b',
        projectId: 'project-b',
        stateBucket: lowRiskBucket,
        actionKey: 'recommend_resequence_workfaces',
        weight: 0.28,
      }),
    ]
    mocks.state.policyDecisions = [
      decisionRow({
        id: 'company-a-d1',
        companyId: 'company-a',
        projectId: 'project-a',
        baselineReward: 0.05,
      }),
      decisionRow({
        id: 'company-b-d1',
        companyId: 'company-b',
        projectId: 'project-b',
        baselineReward: 0.04,
      }),
    ]

    const report = await runDurationContextLearnedPolicyReplay({
      minReplayCases: 1,
    })

    expect(report.cases).toEqual(expect.arrayContaining([
      expect.objectContaining({
        decisionId: 'company-a-d1',
        companyId: 'company-a',
        projectId: 'project-a',
        learnedActionKey: 'publish_low_risk_calibration_threshold',
        learnedParameterScope: expect.objectContaining({
          companyId: 'company-a',
          projectId: 'project-a',
        }),
      }),
      expect.objectContaining({
        decisionId: 'company-b-d1',
        companyId: 'company-b',
        projectId: 'project-b',
        learnedActionKey: 'recommend_resequence_workfaces',
        learnedParameterScope: expect.objectContaining({
          companyId: 'company-b',
          projectId: 'project-b',
        }),
      }),
    ]))
  })
})
