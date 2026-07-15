import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  activationCalls: [] as any[],
  activationResult: {
    gateCode: 'duration_context_canary_activation_readiness_gate',
    frontendExposurePolicy: 'backend_admin_api_only',
    runtimeMutationPolicy: 'none_activation_readiness_report_only',
    activationMode: 'controlled_runtime_trial_candidate',
    summary: {
      readyForControlledRuntimeTrial: true,
      readiness: 'ready_for_controlled_runtime_trial_review',
      evaluatedDecisionCount: 40,
      matchedCanaryCaseCount: 18,
      blockedCaseCount: 2,
      blockedCaseRatio: 0.05,
      projectedRewardDelta: 0.08,
      guardrailViolationCount: 0,
      runtimePChanged: false,
      durationContextFactorsChanged: false,
    },
    blockers: [] as any[],
  },
}))

vi.mock('../services/durationContextPolicyActivationGateService.js', () => ({
  evaluateDurationContextCanaryActivationReadiness: vi.fn(async (input: any) => {
    mocks.activationCalls.push(input)
    return mocks.activationResult
  }),
}))

const { buildDurationContextCanaryTrialReleasePlan } = await import('../services/durationContextPolicyTrialReleasePlanService.js')

describe('durationContextPolicyTrialReleasePlanService', () => {
  beforeEach(() => {
    mocks.activationCalls = []
    mocks.activationResult = {
      gateCode: 'duration_context_canary_activation_readiness_gate',
      frontendExposurePolicy: 'backend_admin_api_only',
      runtimeMutationPolicy: 'none_activation_readiness_report_only',
      activationMode: 'controlled_runtime_trial_candidate',
      summary: {
        readyForControlledRuntimeTrial: true,
        readiness: 'ready_for_controlled_runtime_trial_review',
        evaluatedDecisionCount: 40,
        matchedCanaryCaseCount: 18,
        blockedCaseCount: 2,
        blockedCaseRatio: 0.05,
        projectedRewardDelta: 0.08,
        guardrailViolationCount: 0,
        runtimePChanged: false,
        durationContextFactorsChanged: false,
      },
      blockers: [],
    }
  })

  it('creates a review-required controlled trial release plan from a ready activation gate without runtime mutation', async () => {
    const result = await buildDurationContextCanaryTrialReleasePlan({
      projectIds: ['project-1'],
      asOfDate: '2026-07-01',
      requestedTrafficPercent: 15,
      trialDays: 10,
      requestedBy: 'admin-1',
    })

    expect(result).toEqual(expect.objectContaining({
      planCode: 'duration_context_canary_controlled_trial_release_plan',
      frontendExposurePolicy: 'backend_admin_api_only',
      runtimeMutationPolicy: 'none_trial_release_plan_only',
      releaseMode: 'controlled_runtime_trial_review_request',
    }))
    expect(result.summary).toEqual(expect.objectContaining({
      readyForReleaseRequest: true,
      releaseReadiness: 'draft_release_plan_ready_for_admin_review',
      runtimePChanged: false,
      durationContextFactorsChanged: false,
      requestedTrafficPercent: 10,
      rollbackRequired: true,
    }))
    expect(result.releasePlan).toEqual(expect.objectContaining({
      status: 'draft_review_required',
      approvalRequired: true,
      runtimeActivationPolicy: 'manual_release_required',
      trafficPercent: 10,
      requestedBy: 'admin-1',
    }))
    expect(result.releasePlan?.scope).toEqual(expect.objectContaining({
      projectIds: ['project-1'],
      startDate: '2026-07-01',
      endDate: '2026-07-11',
    }))
    expect(result.releasePlan?.rollbackTriggers).toEqual(expect.arrayContaining([
      'negative_reward_delta',
      'overcompensation_rate_increase',
      'hard_constraint_or_high_risk_signal',
    ]))
    expect(mocks.activationCalls).toEqual([
      expect.objectContaining({
        projectIds: ['project-1'],
        asOfDate: '2026-07-01',
      }),
    ])
  })

  it('blocks trial release planning when activation readiness is not ready', async () => {
    mocks.activationResult = {
      ...mocks.activationResult,
      summary: {
        ...mocks.activationResult.summary,
        readyForControlledRuntimeTrial: false,
        readiness: 'blocked_by_guardrail_violations',
        guardrailViolationCount: 1,
      },
      blockers: [
        {
          code: 'guardrail_violation_detected',
          severity: 'P0',
          message: 'hard risk remains',
        },
      ],
    }

    const result = await buildDurationContextCanaryTrialReleasePlan({
      projectIds: ['project-1'],
      asOfDate: '2026-07-01',
    })

    expect(result.summary).toEqual(expect.objectContaining({
      readyForReleaseRequest: false,
      releaseReadiness: 'blocked_by_activation_readiness_gate',
      runtimePChanged: false,
      durationContextFactorsChanged: false,
    }))
    expect(result.releasePlan).toBeNull()
    expect(result.blockers).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'activation_readiness_not_ready',
        severity: 'P0',
      }),
    ]))
  })
})
