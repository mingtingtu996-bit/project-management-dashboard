import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createInMemoryDurationContextPolicyLearningCheckpointStore } from '../services/durationContextPolicyLearningCheckpointService.js'
import { runDurationContextPolicyRuntimePublicationBridge } from '../services/durationContextPolicyRuntimePublicationBridgeService.js'

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
  autoPublishGateResult: {
    gateCode: 'duration_context_policy_auto_publish_gate',
    humanReviewPolicy: 'zero_human_review_when_gate_passes',
    runtimeMutationPolicy: 'canary_version_registry_only_when_gate_passes',
    candidateCount: 2,
    autoPublishedVersionCount: 1,
    manualReviewCandidateCount: 1,
    blockedCandidateCount: 0,
    decisions: [],
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
  autoPublishGateCalls: [] as any[],
  shadowReplayCalls: [] as any[],
  shadowReplayErrors: [] as Error[],
  activationGateCalls: [] as any[],
  trialReleasePlanCalls: [] as any[],
  coldStartLearningPlanCalls: [] as any[],
  runJobWithRetryCalls: [] as any[],
  runJobWithRetryError: null as Error | null,
  sampleReconciliationResult: {
    discovered: 1,
    scanned: 1,
    recovered: 1,
    deferred: 0,
    retrying: 0,
    deadLettered: 0,
  },
  sampleReconciliationCalls: [] as any[],
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

vi.mock('../services/jobRuntime.js', () => ({
  runJobWithRetry: vi.fn(async (options: any, runner: (attempt: number) => Promise<unknown>) => {
    mocks.runJobWithRetryCalls.push(options)
    if (mocks.runJobWithRetryError) throw mocks.runJobWithRetryError
    const value = await runner(1)
    return { attempts: 1, value }
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

vi.mock('../services/durationContextPolicyAutoPublishGateService.js', () => ({
  autoPublishDurationContextPolicyCandidates: vi.fn(async (input: any) => {
    mocks.autoPublishGateCalls.push(input)
    return mocks.autoPublishGateResult
  }),
}))

vi.mock('../services/durationContextPolicyShadowReplayService.js', () => ({
  runDurationContextApprovedCanaryShadowReplay: vi.fn(async (input: any) => {
    mocks.shadowReplayCalls.push(input)
    const error = mocks.shadowReplayErrors.shift()
    if (error) throw error
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

vi.mock('../services/durationExperienceReconciliationService.js', () => ({
  reconcileDurationExperienceSamples: vi.fn(async (input: any) => {
    mocks.sampleReconciliationCalls.push(input)
    return mocks.sampleReconciliationResult
  }),
}))

const { DurationContextPolicyLearningJob, runDurationContextPolicyLearningSweep } = await import('../jobs/durationContextPolicyLearningJob.js')

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
    mocks.autoPublishGateResult = {
      gateCode: 'duration_context_policy_auto_publish_gate',
      humanReviewPolicy: 'zero_human_review_when_gate_passes',
      runtimeMutationPolicy: 'canary_version_registry_only_when_gate_passes',
      candidateCount: 2,
      autoPublishedVersionCount: 1,
      manualReviewCandidateCount: 1,
      blockedCandidateCount: 0,
      decisions: [],
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
    mocks.autoPublishGateCalls = []
    mocks.shadowReplayCalls = []
    mocks.shadowReplayErrors = []
    mocks.activationGateCalls = []
    mocks.trialReleasePlanCalls = []
    mocks.coldStartLearningPlanCalls = []
    mocks.runJobWithRetryCalls = []
    mocks.runJobWithRetryError = null
    mocks.sampleReconciliationCalls = []
  })

  it('runs reward backfill and offline replay for active projects without runtime mutation', async () => {
    const result = await runDurationContextPolicyLearningSweep({
      projectIds: ['project-1'],
      asOfDate: '2026-05-31',
      inputFactDigest: 'test-facts-v1',
    }, {
      checkpointStore: createInMemoryDurationContextPolicyLearningCheckpointStore(),
    })

    expect(result).toEqual(expect.objectContaining({
      scannedProjects: 1,
      sampleReconciliation: mocks.sampleReconciliationResult,
      rewardBackfill: mocks.backfillResult,
      offlineReplay: mocks.replayResult,
      parameterLearning: mocks.parameterLearningResult,
      learnedPolicyReplay: mocks.learnedPolicyReplayResult,
      canaryGate: mocks.canaryGateResult,
      autoPublishGate: mocks.autoPublishGateResult,
      approvedCanaryShadowReplay: mocks.shadowReplayResult,
      canaryActivationReadiness: mocks.activationGateResult,
      canaryTrialReleasePlan: mocks.trialReleasePlanResult,
      coldStartLearningPlan: mocks.coldStartLearningPlanResult,
      canaryApprovalPolicy: 'low_risk_automated_gate; medium_bounded_canary; high_risk_professional_approval',
      policyVersionRegistryPolicy: 'registry_candidate_plus_runtime_parameter_publication_bridge',
      runtimeMutationPolicy: 'none_runtime_or_fact_mutation_canary_registry_only',
      operation: expect.objectContaining({
        operationId: expect.stringMatching(/^duration-context-policy-learning:2026-05-31:/),
        inputFactDigest: 'test-facts-v1',
      }),
      runtimePublicationBridge: expect.objectContaining({ proposalCount: 0 }),
    }))
    expect(mocks.sampleReconciliationCalls).toEqual([{
      projectIds: ['project-1'],
    }])
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
        persist: true,
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
        persist: true,
      }),
    ])
    expect(mocks.autoPublishGateCalls).toEqual([
      expect.objectContaining({
        asOfDate: '2026-05-31',
        candidates: mocks.canaryGateResult.candidates,
        persist: true,
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

  it('returns a local failure audit contract when the scheduled sweep exhausts retry handling', async () => {
    mocks.runJobWithRetryError = new Error('policy learning failed after retries')
    const job = new DurationContextPolicyLearningJob({
      inputFactDigestProvider: async () => 'test-facts-v1',
      checkpointStore: createInMemoryDurationContextPolicyLearningCheckpointStore(),
    })

    const result = await job.executeNow(['project-1'])

    expect(mocks.runJobWithRetryCalls).toEqual([
      expect.objectContaining({
        jobName: 'durationContextPolicyLearningJob',
        triggeredBy: 'manual',
        jobId: expect.any(String),
      }),
    ])
    expect(result).toEqual(expect.objectContaining({
      jobCode: 'duration_context_policy_learning_sweep',
      frontendExposurePolicy: 'backend_admin_api_only',
      runtimeMutationPolicy: 'none_failure_audit_only',
      sweepResult: 'job_failed_local_audit_recorded',
      failureAuditPolicy: 'jobRuntime_records_exhausted_retry_failures_in_job_failures_table',
      monitoringBoundary: 'local_failure_audit_only_not_production_monitoring_or_rollback',
      errorMessage: 'policy learning failed after retries',
    }))
  })

  it('resumes after the failed stage without repeating committed candidate or decision writes', async () => {
    const checkpointStore = createInMemoryDurationContextPolicyLearningCheckpointStore()
    mocks.shadowReplayErrors = [new Error('shadow replay temporarily unavailable')]
    const params = {
      projectIds: ['project-1'],
      asOfDate: '2026-05-31',
      inputFactDigest: 'test-facts-retry-v1',
    }

    await expect(runDurationContextPolicyLearningSweep(params, {
      checkpointStore,
      checkpointOwnerId: 'process-a',
    })).rejects.toThrow('shadow replay temporarily unavailable')

    const result = await runDurationContextPolicyLearningSweep(params, {
      checkpointStore,
      checkpointOwnerId: 'process-b',
    })

    expect(mocks.backfillCalls).toHaveLength(1)
    expect(mocks.replayCalls).toHaveLength(1)
    expect(mocks.parameterLearningCalls).toHaveLength(1)
    expect(mocks.learnedPolicyReplayCalls).toHaveLength(1)
    expect(mocks.canaryGateCalls).toHaveLength(1)
    expect(mocks.autoPublishGateCalls).toHaveLength(1)
    expect(mocks.shadowReplayCalls).toHaveLength(2)
    expect(mocks.activationGateCalls).toHaveLength(1)
    expect(mocks.trialReleasePlanCalls).toHaveLength(1)
    expect(mocks.coldStartLearningPlanCalls).toHaveLength(1)
    expect(result.stageCheckpoints).toEqual(expect.arrayContaining([
      expect.objectContaining({ stage: 'candidate_persistence', status: 'succeeded', attemptCount: 1 }),
      expect.objectContaining({ stage: 'decision_persistence', status: 'succeeded', attemptCount: 1 }),
      expect.objectContaining({ stage: 'approved_canary_shadow_replay', status: 'succeeded', attemptCount: 2 }),
    ]))
  })

  it('passes approved numeric proposals into the runtime bridge and reports the real mutation boundary', async () => {
    const runtimeParameterProposal = {
      proposalId: 'duration-benchmark-blend:company-1|project-1|bucket-1',
      parameterKey: 'duration.benchmark_blend_weight',
      companyId: 'company-1',
      projectId: 'project-1',
      currentValue: 0.55,
      proposedValue: 0.58,
      changeKind: 'duration' as const,
      sourceDecisionIds: ['decision-1'],
      evidence: {
        sampleCount: 80,
        replayPassed: true,
        conflictFree: true,
        rollbackTarget: 'duration.benchmark_blend_weight.default',
        maeBefore: 12,
        maeAfter: 10,
        overcompensationRate: 0.03,
      },
    }
    const candidate = {
      modelFamily: 'contextual_bandit_v1',
      status: 'candidate',
      sourceDecisionIds: ['decision-1'],
      runtimeParameterProposals: [runtimeParameterProposal],
    }
    mocks.canaryGateResult = {
      ...mocks.canaryGateResult,
      candidates: [candidate],
      candidateCount: 1,
    } as any
    mocks.autoPublishGateResult = {
      ...mocks.autoPublishGateResult,
      decisions: [{ promotionDecision: 'auto_publish_canary', candidate }],
      candidateCount: 1,
      autoPublishedVersionCount: 1,
    } as any
    const runtimePublicationBridge = vi.fn(async (input: any) => ({
      bridgeCode: 'duration_context_policy_runtime_publication_bridge',
      operationId: input.operationId,
      proposalCount: input.proposals.length,
      stablePublishedCount: 0,
      canaryPublishedCount: 1,
      rollbackCount: 0,
      manualApprovalCount: 0,
      blockedCount: 0,
      writesSeedRuntimeDirectly: false,
      results: [{ status: 'canary_published' }],
    }))

    const result = await runDurationContextPolicyLearningSweep({
      projectIds: ['project-1'],
      asOfDate: '2026-05-31',
      inputFactDigest: 'test-facts-runtime-bridge-v1',
    }, {
      checkpointStore: createInMemoryDurationContextPolicyLearningCheckpointStore(),
      runtimePublicationBridge: runtimePublicationBridge as any,
    })

    expect(runtimePublicationBridge).toHaveBeenCalledWith(expect.objectContaining({
      operationId: result.operation.operationId,
      proposals: [expect.objectContaining(runtimeParameterProposal)],
      autoPublishGate: mocks.autoPublishGateResult,
      activationReadiness: mocks.activationGateResult,
      trialReleasePlan: mocks.trialReleasePlanResult,
    }))
    expect(result.runtimeMutationPolicy).toBe('bounded_canary_parameter_runtime_publication_with_explicit_boundary')
  })

  it('does not duplicate a committed runtime publication when its first response is lost before checkpoint completion', async () => {
    const runtimeParameterProposal = {
      proposalId: 'duration-benchmark-blend:company-1|project-1|bucket-1',
      parameterKey: 'duration.benchmark_blend_weight',
      companyId: 'company-1',
      projectId: 'project-1',
      currentValue: 0.6,
      proposedValue: 0.62,
      changeKind: 'confidence' as const,
      sourceDecisionIds: ['decision-publication-1'],
      evidence: {
        sampleCount: 80,
        replayPassed: true,
        conflictFree: true,
        rollbackTarget: 'duration.benchmark_blend_weight.default',
        maeBefore: 12,
        maeAfter: 10,
        overcompensationRate: 0.03,
      },
    }
    const candidate = {
      modelFamily: 'contextual_bandit_v1',
      status: 'candidate',
      sourceDecisionIds: ['decision-publication-1'],
      runtimeParameterProposals: [runtimeParameterProposal],
    }
    mocks.canaryGateResult = {
      ...mocks.canaryGateResult,
      candidates: [candidate],
      candidateCount: 1,
    } as any
    mocks.autoPublishGateResult = {
      ...mocks.autoPublishGateResult,
      decisions: [{ promotionDecision: 'auto_publish_canary', candidate }],
      candidateCount: 1,
      autoPublishedVersionCount: 1,
    } as any
    mocks.trialReleasePlanResult = {
      ...mocks.trialReleasePlanResult,
      releasePlan: {
        status: 'draft_review_required',
        approvalRequired: false,
        rollbackRequired: true,
        trafficPercent: 5,
        trialDays: 14,
        scope: { projectIds: ['project-1'] },
      },
    } as any

    let committedPublication: any = null
    const persistPublication = vi.fn(async (input: any) => {
      committedPublication = {
        status: 'runtime_parameter_published',
        canPersist: true,
        writesParameterRuntime: true,
        writesSeedRuntimeDirectly: false,
        publicationStatus: 'published',
        publicationKey: 'stable-publication-response-lost-1',
        rollbackTarget: input.releaseExit.releasePackage.rollbackTarget,
        reasons: [],
        runtimePublication: null,
      }
      throw new Error('publication response lost after commit')
    })
    const loadRuntimeValue = vi.fn(async (input: any) => committedPublication
      ? {
          status: 'runtime_parameter_consumable',
          runtimeConsumable: true,
          parameterKey: runtimeParameterProposal.parameterKey,
          runtimeValue: runtimeParameterProposal.proposedValue,
          consumptionMode: input.consumptionMode ?? 'stable',
          publicationKey: committedPublication.publicationKey,
          publicationStatus: committedPublication.publicationStatus,
          scopeLevel: 'project',
          companyId: runtimeParameterProposal.companyId,
          projectId: runtimeParameterProposal.projectId,
          rollbackTarget: committedPublication.rollbackTarget,
          reasons: [],
          writesSeedRuntimeDirectly: false,
        }
      : {
          status: 'runtime_parameter_not_found',
          runtimeConsumable: false,
          parameterKey: runtimeParameterProposal.parameterKey,
          runtimeValue: null,
          consumptionMode: input.consumptionMode ?? 'stable',
          publicationKey: null,
          publicationStatus: null,
          scopeLevel: null,
          companyId: null,
          projectId: null,
          rollbackTarget: null,
          reasons: ['runtime_parameter_publication_not_found'],
          writesSeedRuntimeDirectly: false,
        })
    const runtimePublicationBridge = (input: any) => runDurationContextPolicyRuntimePublicationBridge({
      ...input,
      queryExec: async () => [],
      adapters: {
        loadRuntimeValue,
        persistPublication,
        recordMonitoring: vi.fn(),
        executeRollback: vi.fn(),
      },
    })
    const checkpointStore = createInMemoryDurationContextPolicyLearningCheckpointStore()
    const params = {
      projectIds: ['project-1'],
      asOfDate: '2026-05-31',
      inputFactDigest: 'test-facts-publication-response-loss-v1',
    }

    await expect(runDurationContextPolicyLearningSweep(params, {
      checkpointStore,
      checkpointOwnerId: 'publication-process-a',
      runtimePublicationBridge,
    })).rejects.toThrow('publication response lost after commit')

    const result = await runDurationContextPolicyLearningSweep(params, {
      checkpointStore,
      checkpointOwnerId: 'publication-process-b',
      runtimePublicationBridge,
    })

    expect(mocks.canaryGateCalls).toHaveLength(1)
    expect(mocks.autoPublishGateCalls).toHaveLength(1)
    expect(persistPublication).toHaveBeenCalledTimes(1)
    expect(loadRuntimeValue).toHaveBeenCalledTimes(3)
    expect(result.runtimePublicationBridge.results).toEqual([
      expect.objectContaining({
        status: 'stable_already_active',
        publicationKey: 'stable-publication-response-lost-1',
      }),
    ])
    expect(result.stageCheckpoints).toEqual(expect.arrayContaining([
      expect.objectContaining({ stage: 'candidate_persistence', status: 'succeeded', attemptCount: 1 }),
      expect.objectContaining({ stage: 'decision_persistence', status: 'succeeded', attemptCount: 1 }),
      expect.objectContaining({ stage: 'runtime_publication', status: 'succeeded', attemptCount: 2 }),
    ]))
  })
})
