import { readFileSync, readdirSync } from 'node:fs'
import { resolve, sep } from 'node:path'

import { beforeEach, describe, expect, it, vi } from 'vitest'

type Row = Record<string, any>

const workspaceRoot = process.cwd().endsWith(`${sep}server`)
  ? resolve(process.cwd(), '..')
  : process.cwd()

const mocks = vi.hoisted(() => {
  const state = {
    canaryCandidates: [] as Row[],
    replayReport: {
      reportCode: 'duration_context_learned_policy_replay',
      runtimeMutationPolicy: 'none_replay_report_only',
      evaluatedDecisionCount: 4,
      matchedParameterCaseCount: 4,
      canaryEligibleCaseCount: 3,
      summary: {
        projectedRewardDelta: 0.12,
        canaryReadiness: 'candidate_ready_for_low_risk_canary_review',
      },
      cases: [] as Row[],
    },
  }

  function rowsFor(table: string) {
    if (table === 'duration_context_policy_canary_candidates') return state.canaryCandidates
    return []
  }

  function createBuilder(table: string) {
    const persist = (payload: Row | Row[], idempotent: boolean) => {
      const rows = rowsFor(table)
      const payloadRows = Array.isArray(payload) ? payload : [payload]
      const inserted = payloadRows.map((item) => {
        const existing = idempotent && item.id ? rows.find((row) => row.id === item.id) : null
        if (existing) return existing
        const row = { id: item.id ?? `${table}-${rows.length + 1}`, ...item }
        rows.push(row)
        return row
      })
      return {
        select: vi.fn(() => Promise.resolve({ data: inserted, error: null })),
      }
    }
    const builder: any = {
      insert: vi.fn((payload: Row | Row[]) => persist(payload, false)),
      upsert: vi.fn((payload: Row | Row[]) => persist(payload, true)),
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

vi.mock('../services/durationContextLearnedPolicyReplayService.js', () => ({
  runDurationContextLearnedPolicyReplay: vi.fn(async () => mocks.state.replayReport),
}))

const { generateDurationContextPolicyCanaryCandidates } = await import('../services/durationContextPolicyCanaryGateService.js')

function replayCase(input: {
  id: string
  companyId?: string | null
  projectId?: string
  stateBucket: string
  learnedActionKey: string
  delta: number
  canaryEligible?: boolean
  blockedBy?: string[]
  autoPublishEvidence?: Record<string, unknown>
}) {
  return {
    decisionId: input.id,
    companyId: input.companyId ?? 'company-1',
    projectId: input.projectId ?? 'project-1',
    stateBucket: input.stateBucket,
    baselineActionKey: 'keep_rule_baseline',
    baselineReward: 0.02,
    learnedActionKey: input.learnedActionKey,
    learnedProjectedReward: 0.02 + input.delta,
    projectedRewardDelta: input.delta,
    matchedParameter: true,
    canaryEligible: input.canaryEligible ?? true,
    blockedBy: input.blockedBy ?? [],
    autoPublishEvidence: input.autoPublishEvidence,
    runtimeMutationPolicy: 'none_replay_report_only',
  }
}

describe('durationContextPolicyCanaryGateService', () => {
  beforeEach(() => {
    mocks.state.canaryCandidates = []
    mocks.state.replayReport = {
      reportCode: 'duration_context_learned_policy_replay',
      runtimeMutationPolicy: 'none_replay_report_only',
      evaluatedDecisionCount: 4,
      matchedParameterCaseCount: 4,
      canaryEligibleCaseCount: 3,
      summary: {
        projectedRewardDelta: 0.12,
        canaryReadiness: 'candidate_ready_for_low_risk_canary_review',
      },
      cases: [
        replayCase({
          id: 'd1',
          stateBucket: 'mature_90d|risk:low|schedule:accelerating|hard:0',
          learnedActionKey: 'publish_low_risk_calibration_threshold',
          delta: 0.12,
        }),
        replayCase({
          id: 'd2',
          stateBucket: 'mature_90d|risk:low|schedule:accelerating|hard:0',
          learnedActionKey: 'publish_low_risk_calibration_threshold',
          delta: 0.11,
        }),
        replayCase({
          id: 'd3',
          stateBucket: 'mature_90d|risk:low|schedule:accelerating|hard:0',
          learnedActionKey: 'publish_low_risk_calibration_threshold',
          delta: 0.1,
        }),
        replayCase({
          id: 'd4',
          stateBucket: 'mature_90d|risk:high|schedule:accelerating|hard:0',
          learnedActionKey: 'hold_high_risk_candidate_for_review',
          delta: 0.4,
          canaryEligible: false,
          blockedBy: ['manual_runtime_promotion_required'],
        }),
      ],
    }
    mocks.from.mockClear()
  })

  it('creates low-risk canary candidates from replay-ready learned policy evidence without runtime publication', async () => {
    const result = await generateDurationContextPolicyCanaryCandidates({
      minReplayCases: 3,
      minProjectedRewardDelta: 0.05,
      persist: true,
    })

    expect(result).toEqual(expect.objectContaining({
      gateCode: 'duration_context_policy_canary_gate',
      frontendExposurePolicy: 'backend_admin_api_only',
      runtimeMutationPolicy: 'none_canary_candidate_only',
      replayCaseCount: 4,
      candidateCount: 1,
      persistedCandidateCount: 1,
      blockedCount: 1,
    }))
    expect(result.candidates[0]).toEqual(expect.objectContaining({
      experienceTier: 'T3',
      experienceAssetType: 'project_efficiency_model',
      reuseScope: 'project',
      factSource: 'replay',
      projectIds: ['project-1'],
      stateBucket: 'mature_90d|risk:low|schedule:accelerating|hard:0',
      actionKey: 'publish_low_risk_calibration_threshold',
      status: 'candidate',
      requiresReview: false,
      runtimeAutoPublishEligible: false,
      replayCaseCount: 3,
      averageProjectedRewardDelta: 0.11,
    }))
    expect(mocks.state.canaryCandidates).toHaveLength(1)
    expect(mocks.state.canaryCandidates[0]).toEqual(expect.objectContaining({
      model_family: 'contextual_bandit_v1',
      candidate_status: 'candidate',
      runtime_mutation_policy: 'none_canary_candidate_only',
      requires_review: false,
      project_id: 'project-1',
      state_bucket: 'mature_90d|risk:low|schedule:accelerating|hard:0',
      review_metadata: expect.objectContaining({
        assetIdentity: {
          experienceTier: 'T3',
          experienceAssetType: 'project_efficiency_model',
          reuseScope: 'project',
          factSource: 'replay',
        },
      }),
    }))
  })

  it('uses operation and stage as a deterministic candidate persistence key', async () => {
    const input = {
      minReplayCases: 3,
      minProjectedRewardDelta: 0.05,
      persist: true,
      operationId: 'duration-context-policy-learning:2026-07-11:abc',
      idempotencyStage: 'candidate_persistence',
    }

    await generateDurationContextPolicyCanaryCandidates(input)
    await generateDurationContextPolicyCanaryCandidates(input)

    expect(mocks.state.canaryCandidates).toHaveLength(1)
    expect(mocks.state.canaryCandidates[0]).toEqual(expect.objectContaining({
      id: expect.stringMatching(/^[0-9a-f-]{36}$/),
      review_metadata: expect.objectContaining({
        learningOperationId: input.operationId,
        learningStageKey: input.idempotencyStage,
      }),
    }))
  })

  it('carries replay scope and MAE evidence into auto-publish candidates', async () => {
    const autoPublishEvidence = {
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
    }
    mocks.state.replayReport.cases = [
      replayCase({
        id: 'd1',
        stateBucket: 'mature_90d|risk:low|schedule:accelerating|hard:0',
        learnedActionKey: 'publish_low_risk_calibration_threshold',
        delta: 0.12,
        autoPublishEvidence,
      }),
      replayCase({
        id: 'd2',
        stateBucket: 'mature_90d|risk:low|schedule:accelerating|hard:0',
        learnedActionKey: 'publish_low_risk_calibration_threshold',
        delta: 0.1,
        autoPublishEvidence,
      }),
    ]

    const result = await generateDurationContextPolicyCanaryCandidates({
      minReplayCases: 2,
      minProjectedRewardDelta: 0.05,
      persist: true,
    })

    expect(result.candidates[0].autoPublishEvidence).toEqual(expect.objectContaining(autoPublishEvidence))
    expect(result.candidates[0].runtimeParameterProposals).toEqual([
      expect.objectContaining({
        parameterKey: 'duration.benchmark_blend_weight',
        currentValue: 0.55,
        proposedValue: expect.any(Number),
        changeKind: 'duration',
        sourceDecisionIds: ['d1', 'd2'],
        evidence: expect.objectContaining({
          sampleCount: 80,
          maeBefore: 0.18,
          maeAfter: 0.11,
          replayPassed: true,
          rollbackTarget: 'duration.benchmark_blend_weight.default',
        }),
      }),
      expect.objectContaining({
        parameterKey: 'duration.project_progress_velocity_multiplier',
        currentValue: 1,
        proposedValue: 0.85,
        projectId: 'project-1',
        reuseScope: 'project',
        changeKind: 'duration',
        evidence: expect.objectContaining({
          rollbackTarget: 'duration.project_progress_velocity_multiplier.default',
        }),
      }),
    ])
    expect(result.candidates[0].runtimeParameterProposals![0].proposedValue).toBeGreaterThan(0.55)
    expect(result.candidates[0].runtimeParameterProposals![0].proposedValue).toBeLessThanOrEqual(0.65)
    expect(mocks.state.canaryCandidates[0].review_metadata).toEqual(expect.objectContaining({
      autoPublishEvidence: expect.objectContaining(autoPublishEvidence),
      runtimeParameterProposals: result.candidates[0].runtimeParameterProposals,
    }))
  })

  it('deduplicates repeated calibration evidence before counting auto-publish samples', async () => {
    const calibrationEvidence = {
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
    }
    mocks.state.replayReport.cases = [
      replayCase({
        id: 'd1',
        stateBucket: 'mature_90d|risk:low|schedule:accelerating|hard:0',
        learnedActionKey: 'publish_low_risk_calibration_threshold',
        delta: 0.12,
        autoPublishEvidence: calibrationEvidence,
      }),
      replayCase({
        id: 'd2',
        stateBucket: 'mature_90d|risk:low|schedule:accelerating|hard:0',
        learnedActionKey: 'publish_low_risk_calibration_threshold',
        delta: 0.1,
        autoPublishEvidence: {
          ...calibrationEvidence,
          evidenceRefs: [
            'duration_context_policy_decisions:d2',
            'project_productivity_compensation_calibrations:calibration-1',
          ],
        },
      }),
    ]

    const result = await generateDurationContextPolicyCanaryCandidates({
      minReplayCases: 2,
      minProjectedRewardDelta: 0.05,
    })

    expect(result.candidates[0].autoPublishEvidence).toEqual(expect.objectContaining({
      sampleCount: 80,
      scopeSampleCounts: {
        global: 80,
        industry: 40,
        company: 12,
        project: 6,
      },
    }))
  })

  it('keeps canary candidates separated by company and project even when state bucket and action match', async () => {
    mocks.state.replayReport.cases = [
      replayCase({
        id: 'company-a-d1',
        companyId: 'company-a',
        projectId: 'project-a',
        stateBucket: 'mature_90d|risk:low|schedule:accelerating|hard:0',
        learnedActionKey: 'publish_low_risk_calibration_threshold',
        delta: 0.12,
      }),
      replayCase({
        id: 'company-a-d2',
        companyId: 'company-a',
        projectId: 'project-a',
        stateBucket: 'mature_90d|risk:low|schedule:accelerating|hard:0',
        learnedActionKey: 'publish_low_risk_calibration_threshold',
        delta: 0.1,
      }),
      replayCase({
        id: 'company-b-d1',
        companyId: 'company-b',
        projectId: 'project-b',
        stateBucket: 'mature_90d|risk:low|schedule:accelerating|hard:0',
        learnedActionKey: 'publish_low_risk_calibration_threshold',
        delta: 0.22,
      }),
      replayCase({
        id: 'company-b-d2',
        companyId: 'company-b',
        projectId: 'project-b',
        stateBucket: 'mature_90d|risk:low|schedule:accelerating|hard:0',
        learnedActionKey: 'publish_low_risk_calibration_threshold',
        delta: 0.2,
      }),
    ]

    const result = await generateDurationContextPolicyCanaryCandidates({
      minReplayCases: 2,
      minProjectedRewardDelta: 0.05,
      persist: true,
    })

    expect(result.candidateCount).toBe(2)
    expect(result.candidates).toEqual(expect.arrayContaining([
      expect.objectContaining({
        companyId: 'company-a',
        projectIds: ['project-a'],
        sourceDecisionIds: ['company-a-d1', 'company-a-d2'],
      }),
      expect.objectContaining({
        companyId: 'company-b',
        projectIds: ['project-b'],
        sourceDecisionIds: ['company-b-d1', 'company-b-d2'],
      }),
    ]))
    expect(mocks.state.canaryCandidates).toEqual(expect.arrayContaining([
      expect.objectContaining({
        company_id: 'company-a',
        project_id: 'project-a',
        replay_case_count: 2,
      }),
      expect.objectContaining({
        company_id: 'company-b',
        project_id: 'project-b',
        replay_case_count: 2,
      }),
    ]))
  })

  it('blocks canary candidates when replay evidence is high-risk or below threshold', async () => {
    mocks.state.replayReport.cases = [
      replayCase({
        id: 'd1',
        stateBucket: 'mature_90d|risk:high|schedule:accelerating|hard:0',
        learnedActionKey: 'hold_high_risk_candidate_for_review',
        delta: 0.4,
        canaryEligible: false,
        blockedBy: ['manual_runtime_promotion_required'],
      }),
      replayCase({
        id: 'd2',
        stateBucket: 'mature_90d|risk:low|schedule:accelerating|hard:0',
        learnedActionKey: 'publish_low_risk_calibration_threshold',
        delta: 0.01,
      }),
    ]

    const result = await generateDurationContextPolicyCanaryCandidates({
      minReplayCases: 2,
      minProjectedRewardDelta: 0.05,
      persist: true,
    })

    expect(result.candidateCount).toBe(0)
    expect(result.persistedCandidateCount).toBe(0)
    expect(result.blockedCount).toBe(2)
    expect(mocks.state.canaryCandidates).toHaveLength(0)
  })

  it('ships a canary candidate company-scope migration matching the replay grouping identity', () => {
    const matchingMigrations = readdirSync(resolve(workspaceRoot, 'server', 'migrations'))
      .filter((filename) => /v14232c_duration_context_canary_company_scope\.sql$/.test(filename))
    expect(matchingMigrations).toEqual(['243_v14232c_duration_context_canary_company_scope.sql'])

    const migration = readFileSync(
      resolve(workspaceRoot, 'server', 'migrations', matchingMigrations[0]),
      'utf8',
    )

    expect(migration).toContain('ADD COLUMN IF NOT EXISTS company_id')
    expect(migration).toContain('duration_context_policy_canary_candidates c')
    expect(migration).toContain('CREATE INDEX IF NOT EXISTS idx_duration_context_policy_canary_candidates_company')
    expect(migration).toContain('public.is_active_company_member(duration_context_policy_canary_candidates.company_id')
  })
})
