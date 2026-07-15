import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  membership: { companyId: 'company-1', role: 'company_admin' as const },
  approveCalls: [] as any[],
  batchApproveCalls: [] as any[],
  rejectCalls: [] as any[],
  rollbackCalls: [] as any[],
  selectorCalls: [] as any[],
  shadowReplayCalls: [] as any[],
  activationGateCalls: [] as any[],
  trialReleasePlanCalls: [] as any[],
  coldStartLearningPlanCalls: [] as any[],
}))

vi.mock('../auth/access.js', async () => {
  const actual = await vi.importActual<typeof import('../auth/access.js')>('../auth/access.js')
  return {
    ...actual,
    getCurrentCompanyMembership: vi.fn(() => Promise.resolve(mocks.membership)),
    isCompanyAdminRole: vi.fn(() => false),
  }
})

vi.mock('../services/durationContextPolicyCanaryApprovalService.js', () => ({
  approveDurationContextPolicyCanaryCandidate: vi.fn(async (input: any) => {
    mocks.approveCalls.push(input)
    return {
      approvalCode: 'duration_context_policy_canary_approval',
      runtimeMutationPolicy: 'none_approval_record_only',
      candidateStatus: 'approved_for_canary',
      versionStatus: 'canary',
      runtimeAutoPublishEligible: false,
    }
  }),
  approveDurationContextPolicyCanaryCandidateBatch: vi.fn(async (input: any) => {
    mocks.batchApproveCalls.push(input)
    return {
      approvalCode: 'duration_context_policy_canary_batch_approval',
      humanReviewMode: 'weekly_batch_single_click',
      runtimeMutationPolicy: 'none_batch_approval_record_only',
      batchId: input.batchId,
      approvedCount: input.items?.length ?? 0,
      failedCount: 0,
      approvals: [],
      failures: [],
    }
  }),
  rejectDurationContextPolicyCanaryCandidate: vi.fn(async (input: any) => {
    mocks.rejectCalls.push(input)
    return {
      approvalCode: 'duration_context_policy_canary_rejection',
      runtimeMutationPolicy: 'none_rejection_record_only',
      candidateStatus: 'rejected',
      runtimeAutoPublishEligible: false,
    }
  }),
  rollbackDurationContextPolicyVersion: vi.fn(async (input: any) => {
    mocks.rollbackCalls.push(input)
    return {
      rollbackCode: 'duration_context_policy_version_rollback',
      runtimeMutationPolicy: 'none_version_registry_only',
      versionStatus: 'rolled_back',
    }
  }),
}))

vi.mock('../services/durationContextPolicySelectorService.js', () => ({
  previewDurationContextPolicySelection: vi.fn(async (input: any) => {
    mocks.selectorCalls.push(input)
    return {
      selectorCode: 'duration_context_policy_readonly_selector',
      runtimeMutationPolicy: 'none_selector_explain_only',
      wouldApply: true,
      wouldApplyPolicyVersion: { id: 'version-1', status: 'canary' },
      explain: { runtimePChanged: false, selectionMode: 'preview_only' },
    }
  }),
}))

vi.mock('../services/durationContextPolicyShadowReplayService.js', () => ({
  runDurationContextApprovedCanaryShadowReplay: vi.fn(async (input: any) => {
    mocks.shadowReplayCalls.push(input)
    return {
      replayCode: 'duration_context_approved_canary_shadow_replay',
      runtimeMutationPolicy: 'none_shadow_replay_only',
      evaluatedDecisionCount: 10,
      matchedCanaryCaseCount: 4,
      blockedCaseCount: 6,
      summary: { projectedRewardDelta: 0.08, runtimePChanged: false },
      cases: [],
    }
  }),
}))

vi.mock('../services/durationContextPolicyActivationGateService.js', () => ({
  evaluateDurationContextCanaryActivationReadiness: vi.fn(async (input: any) => {
    mocks.activationGateCalls.push(input)
    return {
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
  }),
}))

vi.mock('../services/durationContextPolicyTrialReleasePlanService.js', () => ({
  buildDurationContextCanaryTrialReleasePlan: vi.fn(async (input: any) => {
    mocks.trialReleasePlanCalls.push(input)
    return {
      planCode: 'duration_context_canary_controlled_trial_release_plan',
      frontendExposurePolicy: 'backend_admin_api_only',
      runtimeMutationPolicy: 'none_trial_release_plan_only',
      releaseMode: 'controlled_runtime_trial_review_request',
      summary: {
        readyForReleaseRequest: true,
        releaseReadiness: 'draft_release_plan_ready_for_admin_review',
        runtimePChanged: false,
        durationContextFactorsChanged: false,
      },
      releasePlan: {
        status: 'draft_review_required',
        approvalRequired: true,
        runtimeActivationPolicy: 'manual_release_required',
      },
      blockers: [],
    }
  }),
}))

vi.mock('../services/durationContextColdStartLearningPlanService.js', () => ({
  buildDurationContextColdStartLearningPlan: vi.fn(async (input: any) => {
    mocks.coldStartLearningPlanCalls.push(input)
    return {
      planCode: 'duration_context_cold_start_learning_plan',
      frontendExposurePolicy: 'backend_admin_api_only',
      runtimeMutationPolicy: 'none_maturity_gate_report_only',
      allowedAutomationLevel: 'candidate_parameter_learning',
      summary: {
        projectCount: 1,
        readyForCandidateLearningCount: 1,
        readyForOfflineReplayCount: 0,
        readyForTrialReviewCount: 0,
        runtimePChanged: false,
        durationContextFactorsChanged: false,
      },
      projectPlans: [],
    }
  }),
}))

const { default: router } = await import('../routes/duration-context-governance.js')

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/admin/duration-context-governance', router)
  return app
}

describe('duration context canary approval governance routes', () => {
  beforeEach(() => {
    mocks.membership = { companyId: 'company-1', role: 'company_admin' }
    mocks.approveCalls = []
    mocks.batchApproveCalls = []
    mocks.rejectCalls = []
    mocks.rollbackCalls = []
    mocks.selectorCalls = []
    mocks.shadowReplayCalls = []
    mocks.activationGateCalls = []
    mocks.trialReleasePlanCalls = []
    mocks.coldStartLearningPlanCalls = []
  })

  it('approves a canary candidate through a backend admin endpoint without runtime auto-publish', async () => {
    const response = await request(buildApp())
      .post('/api/admin/duration-context-governance/canary-candidates/candidate-1/approve')
      .send({
        scope: {
          projectIds: ['project-1'],
          startDate: '2026-06-01',
          endDate: '2026-06-30',
          trafficPercent: 10,
        },
        reason: 'stable low-risk replay result',
        expiresAt: '2026-07-01T00:00:00.000Z',
      })
      .expect(200)

    expect(response.body.success).toBe(true)
    expect(response.body.data).toEqual(expect.objectContaining({
      approvalCode: 'duration_context_policy_canary_approval',
      runtimeMutationPolicy: 'none_approval_record_only',
      runtimeAutoPublishEligible: false,
    }))
    expect(mocks.approveCalls).toEqual([
      expect.objectContaining({
        companyId: 'company-1',
        candidateId: 'candidate-1',
        approvedBy: expect.any(String),
        scope: expect.objectContaining({ trafficPercent: 10 }),
      }),
    ])
  })

  it('batch-approves canary candidates through one backend admin workbench action', async () => {
    const response = await request(buildApp())
      .post('/api/admin/duration-context-governance/canary-candidates/batch-approve')
      .send({
        batchId: 'weekly-2026-06-21',
        reason: 'weekly governance batch',
        items: [
          { candidateId: 'candidate-1', scope: { projectIds: ['project-1'], trafficPercent: 5 } },
          { candidateId: 'candidate-2', scope: { projectIds: ['project-2'], trafficPercent: 5 } },
        ],
      })
      .expect(200)

    expect(response.body.success).toBe(true)
    expect(response.body.data).toEqual(expect.objectContaining({
      approvalCode: 'duration_context_policy_canary_batch_approval',
      humanReviewMode: 'weekly_batch_single_click',
      runtimeMutationPolicy: 'none_batch_approval_record_only',
      approvedCount: 2,
      failedCount: 0,
    }))
    expect(mocks.batchApproveCalls).toEqual([
      expect.objectContaining({
        companyId: 'company-1',
        batchId: 'weekly-2026-06-21',
        approvedBy: expect.any(String),
        reason: 'weekly governance batch',
        items: expect.arrayContaining([
          expect.objectContaining({ candidateId: 'candidate-1' }),
          expect.objectContaining({ candidateId: 'candidate-2' }),
        ]),
      }),
    ])
  })

  it('rejects canary candidates and rolls back policy versions through backend admin endpoints', async () => {
    await request(buildApp())
      .post('/api/admin/duration-context-governance/canary-candidates/candidate-2/reject')
      .send({ reason: 'insufficient guardrail evidence' })
      .expect(200)

    await request(buildApp())
      .post('/api/admin/duration-context-governance/policy-versions/version-1/rollback')
      .send({ reason: 'canary monitor drift' })
      .expect(200)

    expect(mocks.rejectCalls).toEqual([
      expect.objectContaining({
        companyId: 'company-1',
        candidateId: 'candidate-2',
        rejectedBy: expect.any(String),
        reason: 'insufficient guardrail evidence',
      }),
    ])
    expect(mocks.rollbackCalls).toEqual([
      expect.objectContaining({
        companyId: 'company-1',
        versionId: 'version-1',
        rolledBackBy: expect.any(String),
        reason: 'canary monitor drift',
      }),
    ])
  })

  it('previews approved canary policy selection through a backend admin explain-only endpoint', async () => {
    const response = await request(buildApp())
      .post('/api/admin/duration-context-governance/policy-versions/preview-selection')
      .send({
        projectId: 'project-1',
        stateBucket: 'mature_90d|risk:low|schedule:accelerating|hard:0',
        asOfDate: '2026-06-15',
      })
      .expect(200)

    expect(response.body.success).toBe(true)
    expect(response.body.data).toEqual(expect.objectContaining({
      selectorCode: 'duration_context_policy_readonly_selector',
      runtimeMutationPolicy: 'none_selector_explain_only',
      wouldApply: true,
    }))
    expect(response.body.data.explain).toEqual(expect.objectContaining({
      runtimePChanged: false,
      selectionMode: 'preview_only',
    }))
    expect(mocks.selectorCalls).toEqual([
      expect.objectContaining({
        projectId: 'project-1',
        stateBucket: 'mature_90d|risk:low|schedule:accelerating|hard:0',
        asOfDate: '2026-06-15',
      }),
    ])
  })

  it('runs approved-canary shadow replay through a backend admin endpoint without runtime mutation', async () => {
    const response = await request(buildApp())
      .post('/api/admin/duration-context-governance/policy-versions/shadow-replay')
      .send({
        projectIds: ['project-1'],
        asOfDate: '2026-06-30',
      })
      .expect(200)

    expect(response.body.success).toBe(true)
    expect(response.body.data).toEqual(expect.objectContaining({
      replayCode: 'duration_context_approved_canary_shadow_replay',
      runtimeMutationPolicy: 'none_shadow_replay_only',
      matchedCanaryCaseCount: 4,
    }))
    expect(response.body.data.summary).toEqual(expect.objectContaining({
      runtimePChanged: false,
    }))
    expect(mocks.shadowReplayCalls).toEqual([
      expect.objectContaining({
        projectIds: ['project-1'],
        asOfDate: '2026-06-30',
      }),
    ])
  })

  it('evaluates canary activation readiness through a backend admin report-only endpoint', async () => {
    const response = await request(buildApp())
      .post('/api/admin/duration-context-governance/policy-versions/activation-readiness')
      .send({
        projectIds: ['project-1'],
        asOfDate: '2026-06-30',
        minMatchedCases: 5,
      })
      .expect(200)

    expect(response.body.success).toBe(true)
    expect(response.body.data).toEqual(expect.objectContaining({
      gateCode: 'duration_context_canary_activation_readiness_gate',
      runtimeMutationPolicy: 'none_activation_readiness_report_only',
    }))
    expect(response.body.data.summary).toEqual(expect.objectContaining({
      readyForControlledRuntimeTrial: true,
      runtimePChanged: false,
      durationContextFactorsChanged: false,
    }))
    expect(mocks.activationGateCalls).toEqual([
      expect.objectContaining({
        projectIds: ['project-1'],
        asOfDate: '2026-06-30',
        minMatchedCases: 5,
      }),
    ])
  })

  it('builds a controlled trial release plan through a backend admin review-only endpoint', async () => {
    const response = await request(buildApp())
      .post('/api/admin/duration-context-governance/policy-versions/trial-release-plan')
      .send({
        projectIds: ['project-1'],
        asOfDate: '2026-07-01',
        requestedTrafficPercent: 12,
        trialDays: 14,
      })
      .expect(200)

    expect(response.body.success).toBe(true)
    expect(response.body.data).toEqual(expect.objectContaining({
      planCode: 'duration_context_canary_controlled_trial_release_plan',
      runtimeMutationPolicy: 'none_trial_release_plan_only',
      releaseMode: 'controlled_runtime_trial_review_request',
    }))
    expect(response.body.data.summary).toEqual(expect.objectContaining({
      readyForReleaseRequest: true,
      runtimePChanged: false,
      durationContextFactorsChanged: false,
    }))
    expect(mocks.trialReleasePlanCalls).toEqual([
      expect.objectContaining({
        projectIds: ['project-1'],
        asOfDate: '2026-07-01',
        requestedTrafficPercent: 12,
        trialDays: 14,
      }),
    ])
  })

  it('reports cold-start learning maturity through a backend admin endpoint without runtime mutation', async () => {
    const response = await request(buildApp())
      .post('/api/admin/duration-context-governance/policy-learning/cold-start-plan')
      .send({
        projectIds: ['project-1'],
        asOfDate: '2026-05-31',
      })
      .expect(200)

    expect(response.body.success).toBe(true)
    expect(response.body.data).toEqual(expect.objectContaining({
      planCode: 'duration_context_cold_start_learning_plan',
      runtimeMutationPolicy: 'none_maturity_gate_report_only',
      allowedAutomationLevel: 'candidate_parameter_learning',
    }))
    expect(response.body.data.summary).toEqual(expect.objectContaining({
      runtimePChanged: false,
      durationContextFactorsChanged: false,
    }))
    expect(mocks.coldStartLearningPlanCalls).toEqual([
      expect.objectContaining({
        projectIds: ['project-1'],
        asOfDate: '2026-05-31',
      }),
    ])
  })
})
