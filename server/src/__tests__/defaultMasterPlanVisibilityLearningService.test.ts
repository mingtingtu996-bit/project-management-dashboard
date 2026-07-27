import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createCandidate: vi.fn(async (input: unknown) => ({ event: input, persistence: { persisted: true } })),
}))

vi.mock('../services/algorithmAssetCandidateEventAdapterService.js', () => ({
  createAndPersistAlgorithmAssetCandidateEvent: mocks.createCandidate,
}))

import {
  aggregateDefaultMasterPlanVisibilityPolicyCandidates,
  runDefaultMasterPlanVisibilityLearningSweep,
} from '../services/defaultMasterPlanVisibilityLearningService.js'
import type { AlgorithmAssetGovernanceQueryExec } from '../services/algorithmAssetGovernancePersistenceService.js'

function event(input: {
  companyId: string
  projectId: string
  code: string
  decision: 'keep' | 'hide' | 'promote'
  protected?: boolean
}) {
  return {
    id: `${input.companyId}:${input.projectId}:${input.code}:${input.decision}`,
    company_id: input.companyId,
    project_id: input.projectId,
    asset_key: 'default_master_plan_visibility_feedback.general_civil',
    source_module: 'defaultMasterPlanVisibilityFeedbackService',
    event_status: 'candidate',
    candidate_payload: {
      businessType: 'general_civil',
      observations: [{
        stableCode: input.code,
        pmDecision: input.decision,
        desiredVisibleOnMasterPlan: input.decision !== 'hide',
        protectedFromAutoHide: input.protected === true,
        systemVisibilityClass: input.decision === 'promote' ? 'internal_network_constraint' : 'primary_control',
      }],
    },
  }
}

describe('defaultMasterPlanVisibilityLearningService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('requires three independent projects and 75 percent agreement within one company scope', () => {
    const candidates = aggregateDefaultMasterPlanVisibilityPolicyCandidates([
      event({ companyId: 'company-1', projectId: 'p1', code: 'RMP-03-02', decision: 'hide' }),
      event({ companyId: 'company-1', projectId: 'p2', code: 'RMP-03-02', decision: 'hide' }),
      event({ companyId: 'company-1', projectId: 'p3', code: 'RMP-03-02', decision: 'hide' }),
      event({ companyId: 'company-1', projectId: 'p1', code: 'RMP-05-01', decision: 'hide' }),
      event({ companyId: 'company-1', projectId: 'p2', code: 'RMP-05-01', decision: 'hide' }),
      event({ companyId: 'company-1', projectId: 'p3', code: 'RMP-05-01', decision: 'keep' }),
      event({ companyId: 'company-2', projectId: 'p4', code: 'RMP-03-02', decision: 'keep' }),
      event({ companyId: 'company-1', projectId: 'p1', code: 'RMP-13-03', decision: 'hide', protected: true }),
      event({ companyId: 'company-1', projectId: 'p2', code: 'RMP-13-03', decision: 'hide', protected: true }),
      event({ companyId: 'company-1', projectId: 'p3', code: 'RMP-13-03', decision: 'hide', protected: true }),
    ])

    expect(candidates).toHaveLength(1)
    expect(candidates[0]).toEqual(expect.objectContaining({
      companyId: 'company-1',
      businessType: 'general_civil',
      stableCode: 'RMP-03-02',
      independentProjectCount: 3,
      agreementRate: 1,
      policyRecord: expect.objectContaining({
        businessTypes: ['general_civil'],
        targetStableCodePatterns: ['^RMP\\-03\\-02$'],
        visibleOnMasterPlan: false,
        visibilityClass: 'detail_plan_only',
        source: 'pm_feedback_governed_override',
      }),
    }))
  })

  it('automatically emits governed policy candidates without publishing runtime policy', async () => {
    const rows = [
      event({ companyId: 'company-1', projectId: 'p1', code: 'RMP-03-02', decision: 'hide' }),
      event({ companyId: 'company-1', projectId: 'p2', code: 'RMP-03-02', decision: 'hide' }),
      event({ companyId: 'company-1', projectId: 'p3', code: 'RMP-03-02', decision: 'hide' }),
    ]
    const queryExec = vi.fn(async () => rows) as unknown as AlgorithmAssetGovernanceQueryExec

    const result = await runDefaultMasterPlanVisibilityLearningSweep({ queryExec })

    expect(result).toEqual(expect.objectContaining({
      status: 'visibility_policy_candidates_generated',
      feedbackEventCount: 3,
      policyCandidateCount: 1,
      persistedCandidateCount: 1,
      writesRuntimePolicy: false,
      writesTasksOrDependencies: false,
    }))
    expect(mocks.createCandidate).toHaveBeenCalledWith(expect.objectContaining({
      assetKey: 'default_master_plan_visibility_policy.general_civil.RMP-03-02',
      companyId: 'company-1',
      projectId: null,
      assetType: 'rule',
      publishAnchor: 'manual_governance_required',
      automationMaturity: 'auto_shadow',
      requestedRuntimeEffect: 'candidate_only',
      candidatePayload: expect.objectContaining({
        seedType: 'master_plan_visibility_policy',
        writesRuntimePolicy: false,
        policyRecord: expect.objectContaining({ visibleOnMasterPlan: false }),
      }),
    }))
  })

  it('does not emit the same governed candidate again when its evidence set is unchanged', async () => {
    const feedbackRows = [
      event({ companyId: 'company-1', projectId: 'p1', code: 'RMP-03-02', decision: 'hide' }),
      event({ companyId: 'company-1', projectId: 'p2', code: 'RMP-03-02', decision: 'hide' }),
      event({ companyId: 'company-1', projectId: 'p3', code: 'RMP-03-02', decision: 'hide' }),
    ]
    const rows = [
      ...feedbackRows,
      {
        id: 'existing-policy-candidate',
        company_id: 'company-1',
        project_id: null,
        asset_key: 'default_master_plan_visibility_policy.general_civil.RMP-03-02',
        source_module: 'defaultMasterPlanVisibilityLearningService',
        event_status: 'review_required',
        candidate_payload: {
          policyRecord: { visibleOnMasterPlan: false },
          evidence: { sourceEventIds: feedbackRows.map((row) => row.id) },
        },
      },
    ]
    const queryExec = vi.fn(async () => rows) as unknown as AlgorithmAssetGovernanceQueryExec

    const result = await runDefaultMasterPlanVisibilityLearningSweep({ queryExec })

    expect(result).toEqual(expect.objectContaining({
      policyCandidateCount: 1,
      persistedCandidateCount: 0,
      duplicateCandidateCount: 1,
    }))
    expect(mocks.createCandidate).not.toHaveBeenCalled()
  })
})
