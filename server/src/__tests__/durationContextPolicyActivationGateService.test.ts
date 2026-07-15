import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  shadowReplayCalls: [] as any[],
  shadowReplayResult: {
    replayCode: 'duration_context_approved_canary_shadow_replay',
    frontendExposurePolicy: 'backend_admin_api_only',
    runtimeMutationPolicy: 'none_shadow_replay_only',
    evaluatedDecisionCount: 40,
    matchedCanaryCaseCount: 12,
    blockedCaseCount: 2,
    summary: {
      averageBaselineReward: 0.1,
      averageCanaryReward: 0.18,
      projectedRewardDelta: 0.08,
      runtimePChanged: false,
      readiness: 'shadow_replay_positive_review_required',
    },
    cases: [
      {
        decisionId: 'decision-1',
        canaryVersionId: 'version-1',
        projectedRewardDelta: 0.08,
        blockedBy: [],
        runtimeMutationPolicy: 'none_shadow_replay_only',
      },
      {
        decisionId: 'decision-2',
        canaryVersionId: 'version-1',
        projectedRewardDelta: 0.05,
        blockedBy: [],
        runtimeMutationPolicy: 'none_shadow_replay_only',
      },
      {
        decisionId: 'decision-3',
        canaryVersionId: null,
        projectedRewardDelta: 0,
        blockedBy: ['project_scope_mismatch'],
        runtimeMutationPolicy: 'none_shadow_replay_only',
      },
    ],
  },
}))

vi.mock('../services/durationContextPolicyShadowReplayService.js', () => ({
  runDurationContextApprovedCanaryShadowReplay: vi.fn(async (input: any) => {
    mocks.shadowReplayCalls.push(input)
    return mocks.shadowReplayResult
  }),
}))

const { evaluateDurationContextCanaryActivationReadiness } = await import('../services/durationContextPolicyActivationGateService.js')

describe('durationContextPolicyActivationGateService', () => {
  beforeEach(() => {
    mocks.shadowReplayCalls = []
    mocks.shadowReplayResult = {
      replayCode: 'duration_context_approved_canary_shadow_replay',
      frontendExposurePolicy: 'backend_admin_api_only',
      runtimeMutationPolicy: 'none_shadow_replay_only',
      evaluatedDecisionCount: 40,
      matchedCanaryCaseCount: 12,
      blockedCaseCount: 2,
      summary: {
        averageBaselineReward: 0.1,
        averageCanaryReward: 0.18,
        projectedRewardDelta: 0.08,
        runtimePChanged: false,
        readiness: 'shadow_replay_positive_review_required',
      },
      cases: [
        {
          decisionId: 'decision-1',
          canaryVersionId: 'version-1',
          projectedRewardDelta: 0.08,
          blockedBy: [],
          runtimeMutationPolicy: 'none_shadow_replay_only',
        },
        {
          decisionId: 'decision-2',
          canaryVersionId: 'version-1',
          projectedRewardDelta: 0.05,
          blockedBy: [],
          runtimeMutationPolicy: 'none_shadow_replay_only',
        },
        {
          decisionId: 'decision-3',
          canaryVersionId: null,
          projectedRewardDelta: 0,
          blockedBy: ['project_scope_mismatch'],
          runtimeMutationPolicy: 'none_shadow_replay_only',
        },
      ],
    }
  })

  it('marks approved canary shadow replay as ready for controlled runtime trial review when guardrails pass', async () => {
    const result = await evaluateDurationContextCanaryActivationReadiness({
      projectIds: ['project-1'],
      asOfDate: '2026-06-30',
      minMatchedCases: 2,
      minProjectedRewardDelta: 0.02,
      maxBlockedCaseRatio: 0.25,
    })

    expect(result).toEqual(expect.objectContaining({
      gateCode: 'duration_context_canary_activation_readiness_gate',
      frontendExposurePolicy: 'backend_admin_api_only',
      runtimeMutationPolicy: 'none_activation_readiness_report_only',
      activationMode: 'controlled_runtime_trial_candidate',
    }))
    expect(result.summary).toEqual(expect.objectContaining({
      readyForControlledRuntimeTrial: true,
      readiness: 'ready_for_controlled_runtime_trial_review',
      matchedCanaryCaseCount: 12,
      projectedRewardDelta: 0.08,
      guardrailViolationCount: 0,
      runtimePChanged: false,
      durationContextFactorsChanged: false,
    }))
    expect(result.blockers).toEqual([])
    expect(mocks.shadowReplayCalls).toEqual([
      expect.objectContaining({
        projectIds: ['project-1'],
        asOfDate: '2026-06-30',
      }),
    ])
  })

  it('blocks activation readiness when replay has hard or high-risk guardrail violations', async () => {
    mocks.shadowReplayResult = {
      ...mocks.shadowReplayResult,
      matchedCanaryCaseCount: 9,
      blockedCaseCount: 3,
      summary: {
        ...mocks.shadowReplayResult.summary,
        projectedRewardDelta: 0.09,
      },
      cases: [
        {
          decisionId: 'decision-hard',
          canaryVersionId: null,
          projectedRewardDelta: 0,
          blockedBy: ['manual_runtime_promotion_required', 'hard_constraint_active'],
          runtimeMutationPolicy: 'none_shadow_replay_only',
        },
      ],
    }

    const result = await evaluateDurationContextCanaryActivationReadiness({
      minMatchedCases: 2,
      minProjectedRewardDelta: 0.02,
    })

    expect(result.summary).toEqual(expect.objectContaining({
      readyForControlledRuntimeTrial: false,
      readiness: 'blocked_by_guardrail_violations',
      guardrailViolationCount: 1,
    }))
    expect(result.blockers).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'guardrail_violation_detected',
        severity: 'P0',
      }),
    ]))
  })
})
