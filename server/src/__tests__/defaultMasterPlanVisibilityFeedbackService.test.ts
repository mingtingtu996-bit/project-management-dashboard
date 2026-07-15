import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createCandidate: vi.fn(async (input: unknown) => ({ event: input, persistence: { persisted: true } })),
}))

vi.mock('../services/algorithmAssetCandidateEventAdapterService.js', () => ({
  createAndPersistAlgorithmAssetCandidateEvent: mocks.createCandidate,
}))

import {
  buildDefaultMasterPlanVisibilityFeedback,
  buildDefaultMasterPlanVisibilityTaskAdjustmentFeedback,
  persistDefaultMasterPlanVisibilityFeedbackCandidate,
} from '../services/defaultMasterPlanVisibilityFeedbackService.js'
import type { DefaultMasterPlanVisibilityRow } from '../services/defaultMasterPlanVisibilityService.js'

function reviewedRow(input: {
  id: string
  code: string
  visible: boolean
  protected?: boolean
  visibilityClass?: string
}): DefaultMasterPlanVisibilityRow {
  const mode = input.visible ? 'schedule_row' : 'linked_projection'
  return {
    clientRowId: input.id,
    parentClientRowId: null,
    sortOrder: 0,
    rowProjectionMode: mode,
    executionPhase: 'startup_site_setup',
    planItemKind: input.protected ? 'milestone' : 'work_task',
    predecessorClientRowIds: [],
    predecessorDependencies: [],
    values: {
      title: input.code,
      standard_work_code: input.code,
      row_projection_mode: mode,
      execution_phase: 'startup_site_setup',
      plan_item_kind: input.protected ? 'milestone' : 'work_task',
      standard_task_metadata: {
        stableCode: input.code,
        masterPlanVisibilityDecision: {
          policyVersion: 'v1.4.23.1-master-plan-visibility-v1',
          visibilityClass: input.visibilityClass ?? (input.visible ? 'primary_control' : 'detail_plan_only'),
          visibleOnMasterPlan: input.visible,
          protectedFromAutoHide: input.protected === true,
          policyStableCode: 'test-policy',
          policySource: 'system_visibility_seed',
          policyResolverSource: null,
          policySeedVersionId: null,
          reasons: ['test'],
          mutationBoundary: 'classification_only_no_db_write',
        },
      },
    },
  }
}

describe('defaultMasterPlanVisibilityFeedbackService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('records only explicit PM keep, hide, and promote decisions without treating unseen hidden rows as rejection', () => {
    const rows = [
      reviewedRow({ id: 'kept', code: 'RMP-02-03', visible: true }),
      reviewedRow({ id: 'hidden-by-pm', code: 'RMP-03-02', visible: true }),
      reviewedRow({ id: 'unseen-hidden', code: 'RMP-01-05', visible: false, visibilityClass: 'internal_network_constraint' }),
      reviewedRow({ id: 'promoted-by-pm', code: 'RMP-10-01', visible: false, visibilityClass: 'internal_network_constraint' }),
      reviewedRow({ id: 'protected', code: 'RMP-13-03', visible: true, protected: true }),
    ]

    const feedback = buildDefaultMasterPlanVisibilityFeedback({
      projectId: 'project-1',
      companyId: 'company-1',
      businessType: 'general_civil',
      generationBatchId: 'batch-1',
      explicitReview: true,
      generatedRows: rows,
      retainedClientRowIds: ['kept', 'promoted-by-pm'],
      actorId: 'pm-1',
    })

    expect(feedback.status).toBe('feedback_candidate_ready')
    expect(feedback.observations).toEqual([
      expect.objectContaining({ stableCode: 'RMP-02-03', pmDecision: 'keep', desiredVisibleOnMasterPlan: true }),
      expect.objectContaining({ stableCode: 'RMP-03-02', pmDecision: 'hide', desiredVisibleOnMasterPlan: false }),
      expect.objectContaining({ stableCode: 'RMP-10-01', pmDecision: 'promote', desiredVisibleOnMasterPlan: true }),
    ])
    expect(feedback.observations.some((item) => item.stableCode === 'RMP-01-05')).toBe(false)
    expect(feedback.protectedDecisionRejectedCount).toBe(1)
    expect(feedback.mutationBoundary).toBe('candidate_only_no_runtime_or_task_mutation')
  })

  it('does not infer PM feedback when preview rows were not explicitly reviewed', () => {
    const feedback = buildDefaultMasterPlanVisibilityFeedback({
      projectId: 'project-1',
      companyId: 'company-1',
      businessType: 'general_civil',
      explicitReview: false,
      generatedRows: [reviewedRow({ id: 'row-1', code: 'RMP-02-03', visible: true })],
      retainedClientRowIds: [],
    })

    expect(feedback.status).toBe('no_explicit_review')
    expect(feedback.observations).toEqual([])
  })

  it('persists feedback through unified governance as candidate-only data', async () => {
    const feedback = buildDefaultMasterPlanVisibilityFeedback({
      projectId: 'project-1',
      companyId: 'company-1',
      businessType: 'general_civil',
      explicitReview: true,
      generatedRows: [reviewedRow({ id: 'row-1', code: 'RMP-02-03', visible: true })],
      retainedClientRowIds: [],
    })

    const result = await persistDefaultMasterPlanVisibilityFeedbackCandidate(feedback)

    expect(result.persisted).toBe(true)
    expect(mocks.createCandidate).toHaveBeenCalledWith(expect.objectContaining({
      assetKey: 'default_master_plan_visibility_feedback.general_civil',
      sourceSystem: 'defaultMasterPlanVisibilityFeedbackService',
      assetType: 'signal',
      companyId: 'company-1',
      projectId: 'project-1',
      publishAnchor: 'candidate_only',
      automationMaturity: 'auto_shadow',
      learningMaturity: 'governed_candidate',
      learningTarget: 'template_structure',
      requestedRuntimeEffect: 'candidate_only',
      candidatePayload: expect.objectContaining({
        observations: expect.arrayContaining([
          expect.objectContaining({ stableCode: 'RMP-02-03', pmDecision: 'hide' }),
        ]),
        writesTasks: false,
        writesTaskDependencies: false,
        writesRuntimePolicy: false,
      }),
    }))
  })

  it('turns deletion of a generated visible row into candidate feedback but rejects protected-row deletion feedback', () => {
    const normal = buildDefaultMasterPlanVisibilityTaskAdjustmentFeedback({
      task: {
        id: 'task-1',
        project_id: 'project-1',
        standard_task_metadata: reviewedRow({ id: 'row-1', code: 'RMP-02-03', visible: true }).values.standard_task_metadata,
      },
      companyId: 'company-1',
      businessType: 'general_civil',
      actorId: 'pm-1',
      adjustment: 'hide',
    })
    const protectedRow = buildDefaultMasterPlanVisibilityTaskAdjustmentFeedback({
      task: {
        id: 'task-2',
        project_id: 'project-1',
        standard_task_metadata: reviewedRow({ id: 'row-2', code: 'RMP-13-03', visible: true, protected: true }).values.standard_task_metadata,
      },
      companyId: 'company-1',
      businessType: 'general_civil',
      actorId: 'pm-1',
      adjustment: 'hide',
    })

    expect(normal.observations).toEqual([
      expect.objectContaining({ stableCode: 'RMP-02-03', pmDecision: 'hide' }),
    ])
    expect(protectedRow.observations).toEqual([])
    expect(protectedRow.protectedDecisionRejectedCount).toBe(1)
  })
})
