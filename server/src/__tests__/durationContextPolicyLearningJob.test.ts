import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  activeProjectIds: ['project-1', 'project-2'] as string[],
  backfillResult: { scanned: 2, evaluated: 1, skipped: 1, failed: 0 },
  replayResult: {
    replayCode: 'duration_context_policy_offline_replay',
    scanned: 2,
    recommendationCount: 2,
    persistedDecisionCount: 0,
  },
  parameterLearningResult: {
    modelFamily: 'contextual_bandit_v1',
    learningMode: 'offline_parameter_candidate_only',
    runtimeMutationPolicy: 'none_candidate_parameters_only',
    evaluatedDecisionCount: 20,
    candidateParameterCount: 3,
    persistedParameterCount: 0,
    parameters: [],
  },
  learnedPolicyReplayResult: {
    reportCode: 'duration_context_learned_policy_replay',
    runtimeMutationPolicy: 'none_replay_report_only',
    evaluatedDecisionCount: 20,
    matchedParameterCaseCount: 12,
    canaryEligibleCaseCount: 8,
    summary: { projectedRewardDelta: 0.12, canaryReadiness: 'candidate_ready_for_low_risk_canary_review' },
    cases: [],
  },
  canaryGateResult: {
    gateCode: 'duration_context_policy_canary_gate',
    runtimeMutationPolicy: 'none_canary_candidate_only',
    replayCaseCount: 20,
    candidateCount: 2,
    persistedCandidateCount: 0,
    blockedCount: 4,
    candidates: [],
  },
  shadowReplayResult: {
    replayCode: 'duration_context_approved_canary_shadow_replay',
    runtimeMutationPolicy: 'none_shadow_replay_only',
    evaluatedDecisionCount: 20,
    matchedCanaryCaseCount: 6,
    blockedCaseCount: 14,
    summary: { projectedRewardDelta: 0.08, runtimePChanged: false },
    cases: [],
  },
  activationGateResult: {
    gateCode: 'duration_context_canary_activation_readiness_gate',
    runtimeMutationPolicy: 'none_activation_readiness_report_only',
    activationMode: 'controlled_runtime_trial_candidate',
    summary: {
      readyForControlledRuntimeTrial: true,
      readiness: 'ready_for_controlled_runtime_trial_review',
      runtimePChanged: false,
      durationContextFactorsChanged: false,
    },
    blockers: [],
  },
  trialReleasePlanResult: {
    planCode: 'duration_context_canary_controlled_trial_release_plan',
    runtimeMutationPolicy: 'none_trial_release_plan_only',
    releaseMode: 'controlled_runtime_trial_review_request',
    summary: {
      readyForReleaseRequest: true,
      releaseReadiness: 'draft_release_plan_ready_for_admin_review',
      runtimePChanged: false,
      durationContextFactorsChanged: false,
    },
    releasePlan: { status: 'draft_review_required', approvalRequired: true },
    blockers: [],
  },
  coldStartLearningPlanResult: {
    planCode: 'duration_context_cold_start_learning_plan',
    runtimeMutationPolicy: 'none_maturity_gate_report_only',
    allowedAutomationLevel: 'controlled_trial_review_eligible',
    summary: {
      projectCount: 2,
      readyForCandidateLearningCount: 2,
      readyForOfflineReplayCount: 2,
      readyForTrialReviewCount: 1,
      runtimePChanged: false,
      durationContextFactorsChanged: false,
    },
    projectPlans: [],
  },
  backfillCalls: [] as any[],
  replayCalls: [] as any[],
  parameterLearningCalls: [] as any[],
  learnedPolicyReplayCalls: [] as any[],
  canaryGateCalls: [] as any[],
  shadowReplayCalls: [] as any[],
  activationGateCalls: [] as any[],
  trialReleasePlanCalls: [] as any[],
  coldStartLearningPlanCalls: [] as any[],
}))

vi.mock('../middleware/logger.js', () => ({
  logger: {
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}))

vi.mock('../services/activeProjectService.js', () => ({
  listActiveProjectIds: vi.fn(async (projectIds?: string[] | null) => {
    if (Array.isArray(projectIds)) return mocks.activeProjectIds.filter((projectId) => projectIds.includes(projectId))
    return mocks.activeProjectIds
  }),
}))

vi.mock('../services/durationContextPolicyLearningLogService.js', () => ({
  backfillDurationContextPolicyRewards: vi.fn(async (input: any) => {
    mocks.backfillCalls.push(input)
    return mocks.backfillResult
  }),
  runDurationContextPolicyOfflineReplay: vi.fn(async (input: any) => {
    mocks.replayCalls.push(input)
    return mocks.replayResult
  }),
}))

vi.mock('../services/durationContextPolicyParameterLearningService.js', () => ({
  learnDurationContextPolicyParameters: vi.fn(async (input: any) => {
    mocks.parameterLearningCalls.push(input)
    return mocks.parameterLearningResult
  }),
}))

vi.mock('../services/durationContextLearnedPolicyReplayService.js', () => ({
  runDurationContextLearnedPolicyReplay: vi.fn(async (input: any) => {
    mocks.learnedPolicyReplayCalls.push(input)
    return mocks.learnedPolicyReplayResult
  }),
}))

vi.mock('../services/durationContextPolicyCanaryGateService.js', () => ({
  generateDurationContextPolicyCanaryCandidates: vi.fn(async (input: any) => {
    mocks.canaryGateCalls.push(input)
    return mocks.canaryGateResult
  }),
}))

vi.mock('../services/durationContextPolicyShadowReplayService.js', () => ({
  runDurationContextApprovedCanaryShadowReplay: vi.fn(async (input: any) => {
    mocks.shadowReplayCalls.push(input)
    return mocks.shadowReplayResult
  }),
}))

vi.mock('../services/durationContextPolicyActivationGateService.js', () => ({
  evaluateDurationContextCanaryActivationReadiness: vi.fn(async (input: any) => {
    mocks.activationGateCalls.push(input)
    return mocks.activationGateResult
  }),
}))

vi.mock('../services/durationContextPolicyTrialReleasePlanService.js', () => ({
  buildDurationContextCanaryTrialReleasePlan: vi.fn(async (input: any) => {
    mocks.trialReleasePlanCalls.push(input)
    return mocks.trialReleasePlanResult
  }),
}))

vi.mock('../services/durationContextColdStartLearningPlanService.js', () => ({
  buildDurationContextColdStartLearningPlan: vi.fn(async (input: any) => {
    mocks.coldStartLearningPlanCalls.push(input)
    return mocks.coldStartLearningPlanResult
  }),
}))

const { runDurationContextPolicyLearningSweep } = await import('../jobs/durationContextPolicyLearningJob.js')

describe('durationContextPolicyLearningJob', () => {
  beforeEach(() => {
    mocks.activeProjectIds = ['project-1', 'project-2']
    mocks.backfillResult = { scanned: 2, evaluated: 1, skipped: 1, failed: 0 }
    mocks.replayResult = {
      replayCode: 'duration_context_policy_offline_replay',
      scanned: 2,
      recommendationCount: 2,
      persistedDecisionCount: 0,
    }
    mocks.parameterLearningResult = {
      modelFamily: 'contextual_bandit_v1',
      learningMode: 'offline_parameter_candidate_only',
      runtimeMutationPolicy: 'none_candidate_parameters_only',
      evaluatedDecisionCount: 20,
      candidateParameterCount: 3,
      persistedParameterCount: 0,
      parameters: [],
    }
    mocks.learnedPolicyReplayResult = {
      reportCode: 'duration_context_learned_policy_replay',
      runtimeMutationPolicy: 'none_replay_report_only',
      evaluatedDecisionCount: 20,
      matchedParameterCaseCount: 12,
      canaryEligibleCaseCount: 8,
      summary: { projectedRewardDelta: 0.12, canaryReadiness: 'candidate_ready_for_low_risk_canary_review' },
      cases: [],
    }
    mocks.canaryGateResult = {
      gateCode: 'duration_context_policy_canary_gate',
      runtimeMutationPolicy: 'none_canary_candidate_only',
      replayCaseCount: 20,
      candidateCount: 2,
      persistedCandidateCount: 0,
      blockedCount: 4,
      candidates: [],
    }
    mocks.shadowReplayResult = {
      replayCode: 'duration_context_approved_canary_shadow_replay',
      runtimeMutationPolicy: 'none_shadow_replay_only',
      evaluatedDecisionCount: 20,
      matchedCanaryCaseCount: 6,
      blockedCaseCount: 14,
      summary: { projectedRewardDelta: 0.08, runtimePChanged: false },
      cases: [],
    }
    mocks.activationGateResult = {
      gateCode: 'duration_context_canary_activation_readiness_gate',
      runtimeMutationPolicy: 'none_activation_readiness_report_only',
      activationMode: 'controlled_runtime_trial_candidate',
      summary: {
        readyForControlledRuntimeTrial: true,
        readiness: 'ready_for_controlled_runtime_trial_review',
        runtimePChanged: false,
        durationContextFactorsChanged: false,
      },
      blockers: [],
    }
    mocks.trialReleasePlanResult = {
      planCode: 'duration_context_canary_controlled_trial_release_plan',
      runtimeMutationPolicy: 'none_trial_release_plan_only',
      releaseMode: 'controlled_runtime_trial_review_request',
      summary: {
        readyForReleaseRequest: true,
        releaseReadiness: 'draft_release_plan_ready_for_admin_review',
        runtimePChanged: false,
        durationContextFactorsChanged: false,
      },
      releasePlan: { status: 'draft_review_required', approvalRequired: true },
      blockers: [],
    }
    mocks.coldStartLearningPlanResult = {
      planCode: 'duration_context_cold_start_learning_plan',
      runtimeMutationPolicy: 'none_maturity_gate_report_only',
      allowedAutomationLevel: 'controlled_trial_review_eligible',
      summary: {
        projectCount: 2,
        readyForCandidateLearningCount: 2,
        readyForOfflineReplayCount: 2,
        readyForTrialReviewCount: 1,
        runtimePChanged: false,
        durationContextFactorsChanged: false,
      },
      projectPlans: [],
    }
    mocks.backfillCalls = []
    mocks.replayCalls = []
    mocks.parameterLearningCalls = []
    mocks.learnedPolicyReplayCalls = []
    mocks.canaryGateCalls = []
    mocks.shadowReplayCalls = []
    mocks.activationGateCalls = []
    mocks.trialReleasePlanCalls = []
    mocks.coldStartLearningPlanCalls = []
  })

  it('runs reward backfill and offline replay for active projects without runtime mutation', async () => {
    const result = await runDurationContextPolicyLearningSweep({
      projectIds: ['project-1'],
      asOfDate: '2026-05-31',
    })

    expect(result).toEqual(expect.objectContaining({
      scannedProjects: 1,
      rewardBackfill: mocks.backfillResult,
      offlineReplay: mocks.replayResult,
      parameterLearning: mocks.parameterLearningResult,
      learnedPolicyReplay: mocks.learnedPolicyReplayResult,
      canaryGate: mocks.canaryGateResult,
      approvedCanaryShadowReplay: mocks.shadowReplayResult,
      canaryActivationReadiness: mocks.activationGateResult,
      canaryTrialReleasePlan: mocks.trialReleasePlanResult,
      coldStartLearningPlan: mocks.coldStartLearningPlanResult,
      canaryApprovalPolicy: 'manual_backend_admin_endpoint_only',
      policyVersionRegistryPolicy: 'not_mutated_by_learning_sweep',
      runtimeMutationPolicy: 'none_candidate_report_only',
    }))
    expect(mocks.coldStartLearningPlanCalls).toEqual([
      expect.objectContaining({
        projectIds: ['project-1'],
        asOfDate: '2026-05-31',
      }),
    ])
    expect(mocks.backfillCalls).toEqual([
      expect.objectContaining({
        projectIds: ['project-1'],
        asOfDate: '2026-05-31',
      }),
    ])
    expect(mocks.replayCalls).toEqual([
      expect.objectContaining({
        projectIds: ['project-1'],
        windowEndDate: '2026-05-31',
        persistDecisions: false,
      }),
    ])
    expect(mocks.parameterLearningCalls).toEqual([
      expect.objectContaining({
        projectIds: ['project-1'],
        persist: false,
      }),
    ])
    expect(mocks.learnedPolicyReplayCalls).toEqual([
      expect.objectContaining({
        projectIds: ['project-1'],
      }),
    ])
    expect(mocks.canaryGateCalls).toEqual([
      expect.objectContaining({
        projectIds: ['project-1'],
        persist: false,
      }),
    ])
    expect(mocks.shadowReplayCalls).toEqual([
      expect.objectContaining({
        projectIds: ['project-1'],
        asOfDate: '2026-05-31',
      }),
    ])
    expect(mocks.activationGateCalls).toEqual([
      expect.objectContaining({
        projectIds: ['project-1'],
        asOfDate: '2026-05-31',
      }),
    ])
    expect(mocks.trialReleasePlanCalls).toEqual([
      expect.objectContaining({
        projectIds: ['project-1'],
        asOfDate: '2026-05-31',
      }),
    ])
  })
})
