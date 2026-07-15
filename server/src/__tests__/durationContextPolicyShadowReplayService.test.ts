import { beforeEach, describe, expect, it, vi } from 'vitest'

type Row = Record<string, any>

const mocks = vi.hoisted(() => {
  const state = {
    decisions: [] as Row[],
    selectorCalls: [] as any[],
    selectorByDecision: new Map<string, any>(),
  }

  function createBuilder(table: string) {
    const rows = table === 'duration_context_policy_decisions' ? state.decisions : []
    const filters: Array<{ column: string; value: unknown }> = []
    const builder: any = {
      select: vi.fn(() => builder),
      eq: vi.fn((column: string, value: unknown) => {
        filters.push({ column, value })
        return builder
      }),
      order: vi.fn(() => builder),
      limit: vi.fn(() => builder),
      then: undefined,
    }
    builder.then = (resolve: any) => {
      const data = rows.filter((row) => filters.every((filter) => row[filter.column] === filter.value))
      return Promise.resolve({ data, error: null }).then(resolve)
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

vi.mock('../services/durationContextPolicySelectorService.js', () => ({
  previewDurationContextPolicySelection: vi.fn(async (input: any) => {
    mocks.state.selectorCalls.push(input)
    return mocks.state.selectorByDecision.get(input.decisionId) ?? {
      selectorCode: 'duration_context_policy_readonly_selector',
      runtimeMutationPolicy: 'none_selector_explain_only',
      wouldApply: false,
      wouldApplyPolicyVersion: null,
      blockedReasons: ['no_matching_canary_version'],
      explain: { runtimePChanged: false, selectionMode: 'preview_only' },
    }
  }),
}))

const { runDurationContextApprovedCanaryShadowReplay } = await import('../services/durationContextPolicyShadowReplayService.js')

function action(actionKey: string, expectedReward: number) {
  return {
    actionKey,
    expectedReward,
    reward: { totalReward: expectedReward },
  }
}

describe('durationContextPolicyShadowReplayService', () => {
  beforeEach(() => {
    mocks.state.selectorCalls = []
    mocks.state.selectorByDecision = new Map()
    mocks.state.decisions = [
      {
        id: 'decision-1',
        project_id: 'project-1',
        model_family: 'contextual_bandit_v1',
        decision_date: '2026-06-15',
        state_vector: {
          maturityTier: 'mature_90d',
          highRiskFactorCount: 0,
          mediumRiskFactorCount: 0,
          lowRiskFactorCount: 1,
          hardConstraintActive: false,
          scheduleState: 'accelerating',
        },
        candidate_actions: [
          action('keep_rule_baseline', 0.1),
          action('publish_low_risk_calibration_threshold', 0.22),
        ],
        reward_payload: { totalReward: 0.1 },
        reward_status: 'evaluated',
      },
      {
        id: 'decision-2',
        project_id: 'project-1',
        model_family: 'contextual_bandit_v1',
        decision_date: '2026-06-20',
        state_vector: {
          maturityTier: 'mature_90d',
          highRiskFactorCount: 0,
          mediumRiskFactorCount: 0,
          lowRiskFactorCount: 1,
          hardConstraintActive: false,
          scheduleState: 'accelerating',
        },
        candidate_actions: [
          action('keep_rule_baseline', 0.2),
          action('publish_low_risk_calibration_threshold', 0.28),
        ],
        reward_payload: { totalReward: 0.2 },
        reward_status: 'evaluated',
      },
      {
        id: 'decision-3',
        project_id: 'project-2',
        model_family: 'contextual_bandit_v1',
        decision_date: '2026-06-20',
        state_vector: {
          maturityTier: 'mature_90d',
          highRiskFactorCount: 1,
          mediumRiskFactorCount: 0,
          lowRiskFactorCount: 0,
          hardConstraintActive: true,
          scheduleState: 'blocked',
        },
        candidate_actions: [
          action('keep_rule_baseline', -0.1),
          action('hold_high_risk_candidate_for_review', 0.4),
        ],
        reward_payload: { totalReward: -0.1 },
        reward_status: 'evaluated',
      },
    ]
    mocks.state.selectorByDecision.set('decision-1', {
      selectorCode: 'duration_context_policy_readonly_selector',
      runtimeMutationPolicy: 'none_selector_explain_only',
      wouldApply: true,
      wouldApplyPolicyVersion: {
        id: 'version-1',
        actionKey: 'publish_low_risk_calibration_threshold',
        status: 'canary',
        runtimeAutoPublishEligible: false,
      },
      blockedReasons: [],
      explain: { runtimePChanged: false, selectionMode: 'preview_only' },
    })
    mocks.state.selectorByDecision.set('decision-2', {
      selectorCode: 'duration_context_policy_readonly_selector',
      runtimeMutationPolicy: 'none_selector_explain_only',
      wouldApply: true,
      wouldApplyPolicyVersion: {
        id: 'version-1',
        actionKey: 'publish_low_risk_calibration_threshold',
        status: 'canary',
        runtimeAutoPublishEligible: false,
      },
      blockedReasons: [],
      explain: { runtimePChanged: false, selectionMode: 'preview_only' },
    })
    mocks.state.selectorByDecision.set('decision-3', {
      selectorCode: 'duration_context_policy_readonly_selector',
      runtimeMutationPolicy: 'none_selector_explain_only',
      wouldApply: false,
      wouldApplyPolicyVersion: null,
      blockedReasons: ['manual_runtime_promotion_required'],
      explain: { runtimePChanged: false, selectionMode: 'preview_only' },
    })
    mocks.from.mockClear()
  })

  it('replays approved canary versions against evaluated decisions without runtime mutation', async () => {
    const result = await runDurationContextApprovedCanaryShadowReplay({
      projectIds: ['project-1', 'project-2'],
      asOfDate: '2026-06-30',
    })

    expect(result).toEqual(expect.objectContaining({
      replayCode: 'duration_context_approved_canary_shadow_replay',
      runtimeMutationPolicy: 'none_shadow_replay_only',
      evaluatedDecisionCount: 3,
      matchedCanaryCaseCount: 2,
      blockedCaseCount: 1,
    }))
    expect(result.summary).toEqual(expect.objectContaining({
      averageBaselineReward: 0.067,
      averageCanaryReward: 0.25,
      projectedRewardDelta: 0.183,
      runtimePChanged: false,
      readiness: 'shadow_replay_positive_review_required',
    }))
    expect(result.cases).toEqual(expect.arrayContaining([
      expect.objectContaining({
        decisionId: 'decision-1',
        canaryVersionId: 'version-1',
        baselineReward: 0.1,
        canaryProjectedReward: 0.22,
        projectedRewardDelta: 0.12,
        runtimeMutationPolicy: 'none_shadow_replay_only',
      }),
      expect.objectContaining({
        decisionId: 'decision-3',
        blockedBy: expect.arrayContaining(['manual_runtime_promotion_required']),
        canaryVersionId: null,
      }),
    ]))
    expect(mocks.state.selectorCalls).toEqual(expect.arrayContaining([
      expect.objectContaining({
        decisionId: 'decision-1',
        projectId: 'project-1',
        asOfDate: '2026-06-30',
      }),
    ]))
  })
})
