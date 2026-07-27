import { describe, expect, it } from 'vitest'

import {
  buildConstructionOrganizationCloseoutWorkbenchOperationSuggestions,
} from '../services/constructionOrganizationCloseoutWorkbenchOperationSuggestionService.js'
import {
  buildConstructionOrganizationPlanNetworkDraftFromReviewPackageItem,
} from '../services/constructionOrganizationPlanNetworkDraftService.js'
import type {
  ConstructionOrganizationProductOutcomeEvidenceWorkPackage,
} from '../services/constructionOrganizationProductOutcomeCloseoutMatrixService.js'

function workPackage(overrides: Partial<ConstructionOrganizationProductOutcomeEvidenceWorkPackage> = {}): ConstructionOrganizationProductOutcomeEvidenceWorkPackage {
  return {
    source: 'construction_organization_product_outcome_evidence_work_package',
    workPackageKey: 'construction_organization_product_outcome:hospital',
    businessType: 'hospital',
    status: 'evidence_work_package_open',
    runtimeEvidenceProjectIds: ['project-hospital'],
    runtimeEvidenceDraftNetworkKeys: ['draft-hospital-recommended'],
    runtimeEvidenceOptionIds: ['option-hospital-recommended'],
    runtimeEvidencePublicationKeys: ['publication-hospital-recommended'],
    runtimeClaimMissingReasons: [
      'runtime_consumer_observation_linked_for_every_draft',
      'impact_monitoring_passed_for_every_draft',
      'rollback_execution_verified_for_every_draft',
      'saved_network_outcome_linked_for_every_draft',
      'true_per_option_E1_E3_E5_runtime_evidence_linked_for_every_draft',
      'site_adoption_of_runtime_recommended_option_linked',
    ],
    missingReasons: ['runtime_closeout_claim_by_business_type_required'],
    nextEvidenceActions: ['collect_runtime_closeout_claim_for_business_type'],
    operationActions: ['runtime_engine_evidence'],
    executionPlanItems: [],
    executionSteps: [],
    executionPlanItemCount: 0,
    prefillableExecutionStepCount: 1,
    blockedExecutionStepCount: 0,
    executionReadinessStatus: 'ready_for_controlled_prefill',
    missingRuntimeAnchorReasons: [],
    totalDeficit: 6,
    useCases: ['newProjectPlanning', 'startingLineOnboarding', 'accelerationRecovery'],
    requiredAttributionDimensions: ['businessType', 'draftNetworkKey', 'publicationKey'],
    mutationBoundary: {
      writesTaskDependencies: false,
      writesPlanDates: false,
      writesSeed: false,
      writesBaseline: false,
      writesCriticalPathFacts: false,
      writesAccelerationDraft: false,
    },
    boundaryPolicy: ['work_package_does_not_write_runtime_or_plan_data'],
    ...overrides,
  }
}

function planNetworkDraft() {
  return buildConstructionOrganizationPlanNetworkDraftFromReviewPackageItem({
    candidateEventId: 'event-conflict',
    assetKey: 'construction_organization.plan_option.option-conflict',
    sourceModule: 'constructionOrganizationScenarioGovernanceService',
    companyId: 'company-1',
    projectId: 'project-conflict',
    eventStatus: 'review_required',
    runtimeEffect: 'candidate_only',
    createdAt: '2026-06-21T12:00:00.000Z',
    updatedAt: '2026-06-21T12:00:00.000Z',
    optionId: 'option-conflict',
    selectedScenarioIds: ['pile_before_excavation'],
    reviewPackage: {
      source: 'construction_organization_candidate_materialization_review_package',
      packageBasis: 'manual_review_package_from_generated_row_preview_edges',
      optionId: 'option-conflict',
      status: 'ready_for_manual_review',
      allowManualReview: true,
      proposedDependencyEdgeCount: 1,
      blockedReasons: [
        'candidate_network_conflicts_with_current_generated_row_dates',
        'requires_manual_conflict_review_before_replay',
      ],
      proposedDependencyEdges: [{
        fromGeneratedRowId: 'row-pile',
        toGeneratedRowId: 'row-excavation',
        dependencyType: 'FS',
        lagDays: 0,
        intent: 'pile_before_earthwork_bulk_excavation',
        operation: 'propose_create_dependency',
        writesTaskDependencies: false,
      }],
      reviewRequired: true,
      writesTaskDependencies: false,
      writesPlanDates: false,
      writesCriticalPathFacts: false,
    },
    candidateDependencyPreview: {
      source: 'construction_organization_candidate_dependency_preview',
      materializationReadiness: {
        readiness: 'blocked_by_violations',
      },
      previewEdgeCount: 1,
      unresolvedEdgeCount: 0,
      writesTaskDependencies: false,
      writesPlanDates: false,
      writesCriticalPathFacts: false,
    },
    materializationDecision: {
      decision: 'blocked_pending_manual_review',
      allowManualMaterialization: false,
    },
    engineEvaluationSummary: {
      e1: { selectedWorkPackageCount: 1 },
      e3: { projectDurationDays: 38, criticalNodeCount: 1, edgeCount: 1 },
      e5: { recoveryFactorHint: 1.08, recoverableSpanDays: 5 },
    },
    generatedRowNetworkEvaluation: {
      projectedNetworkSpanDays: 38,
      previewEdgeCount: 1,
      unresolvedEdgeCount: 0,
      criticalGeneratedRowIds: ['row-pile'],
      materializationStatus: 'fully_mapped_read_only',
    },
    generatedRowReferenceDurationEvidence: {
      matchedReferenceRowCount: 2,
      totalPlanReferenceDays: 21,
    },
    useCaseEvaluations: {
      accelerationRecovery: {
        optionScore: 82,
        recoveryFactorHint: 1.08,
        e5RecoverableSpanDays: 5,
        actionability: 'actionable_candidate',
      },
    },
    mutationBoundary: {
      writesTaskDependencies: false,
      writesPlanDates: false,
      writesSeed: false,
      writesBaseline: false,
      writesCriticalPathFacts: false,
    },
  })
}

describe('constructionOrganizationCloseoutWorkbenchOperationSuggestionService', () => {
  it('prefills controlled runtime evidence operations when a publication anchor is available', () => {
    const report = buildConstructionOrganizationCloseoutWorkbenchOperationSuggestions({
      companyId: 'company-1',
      workPackages: [workPackage()],
      runtimeAnchorCandidateSummaries: [{
        source: 'construction_organization_closeout_runtime_anchor_candidate_summary',
        businessType: 'hospital',
        status: 'runtime_publication_anchor_available',
        candidateCount: 1,
        candidateProjectIds: ['project-hospital'],
        candidateDraftNetworkKeys: ['draft-hospital-recommended'],
        candidateOptionIds: ['option-hospital-recommended'],
        candidatePublicationKeys: ['publication-hospital-recommended'],
        nextAnchorActions: ['collect_runtime_closeout_evidence_for_publication'],
        candidates: [{
          source: 'construction_organization_closeout_runtime_anchor_candidate',
          businessType: 'hospital',
          projectId: 'project-hospital',
          draftNetworkKey: 'draft-hospital-recommended',
          optionId: 'option-hospital-recommended',
          publicationKey: 'publication-hospital-recommended',
          readiness: 'ready_for_replay',
          evaluationStatus: 'evaluation_ready',
          hasReleaseExitHandoff: true,
          hasRuntimePublication: true,
          hasRuntimeEngineEvidence: false,
          hasRecommendationDecision: false,
          missingAnchorReasons: [],
          nextAnchorAction: 'collect_runtime_closeout_evidence_for_publication',
        }],
        boundaryPolicy: ['candidate_anchor_presence_does_not_claim_runtime_closeout'],
      }],
    })

    expect(report.status).toBe('controlled_operation_suggestions_available')
    expect(report.bridgeMutationBoundary).toEqual({
      writesTaskDependencies: false,
      writesPlanDates: false,
      writesSeed: false,
      writesBaseline: false,
      writesCriticalPathFacts: false,
      writesAccelerationDraft: false,
    })
    expect(report.suggestions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        action: 'runtime_consumer_observation',
        canSubmitControlledOperation: true,
        operationPayload: expect.objectContaining({
          action: 'runtime_consumer_observation',
          assetType: 'construction_organization_plan_network',
          evidenceAction: 'record_runtime_consumer_observation_for_business_type',
          domainWriterKey: 'durationRuntimeConsumerObservationAdapterService.recordScheduleAccelerationRuntimeConsumedArtifacts',
          companyId: 'company-1',
          projectId: 'project-hospital',
          businessType: 'hospital',
          sourcePublicationKey: 'publication-hospital-recommended',
          draftNetworkKey: 'draft-hospital-recommended',
          optionId: 'option-hospital-recommended',
        }),
      }),
      expect.objectContaining({
        action: 'runtime_saved_outcome',
        canSubmitControlledOperation: true,
        operationPayload: expect.objectContaining({
          action: 'runtime_saved_outcome',
          evidenceAction: 'record_saved_network_outcome_for_business_type',
          releaseRecordTarget: 'draft-hospital-recommended',
        }),
      }),
      expect.objectContaining({
        action: 'runtime_recommendation_adopt',
        canSubmitControlledOperation: true,
        operationPayload: expect.objectContaining({
          action: 'runtime_recommendation_adopt',
          evidenceAction: 'record_site_adoption_for_business_type',
          releaseRecordTarget: 'option-hospital-recommended',
          rollbackTarget: 'draft-hospital-recommended',
        }),
      }),
    ]))
    expect(report.suggestions.filter((suggestion) => suggestion.action === 'runtime_engine_evidence')).toHaveLength(3)
    expect(report.suggestions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        action: 'runtime_engine_evidence',
        engineCode: 'standard_duration_reference',
        canSubmitControlledOperation: false,
        missingRequiredFields: expect.arrayContaining([
          'predictedDurationDays',
          'actualDurationDays',
        ]),
      }),
      expect.objectContaining({
        action: 'runtime_engine_evidence',
        engineCode: 'critical_path_cpm',
      }),
      expect.objectContaining({
        action: 'runtime_engine_evidence',
        engineCode: 'schedule_acceleration_target',
      }),
    ]))
  })

  it('does not suggest runtime evidence operations before the publication anchor exists', () => {
    const report = buildConstructionOrganizationCloseoutWorkbenchOperationSuggestions({
      companyId: 'company-1',
      workPackages: [workPackage({
        runtimeEvidencePublicationKeys: [],
        executionReadinessStatus: 'blocked_missing_runtime_anchors',
        missingRuntimeAnchorReasons: ['publicationKey_anchor_required'],
      })],
      runtimeAnchorCandidateSummaries: [{
        source: 'construction_organization_closeout_runtime_anchor_candidate_summary',
        businessType: 'hospital',
        status: 'project_draft_anchor_available',
        candidateCount: 1,
        candidateProjectIds: ['project-hospital'],
        candidateDraftNetworkKeys: ['draft-hospital-recommended'],
        candidateOptionIds: ['option-hospital-recommended'],
        candidatePublicationKeys: [],
        nextAnchorActions: ['run_domain_writer_runtime_publication_for_candidate'],
        candidates: [{
          source: 'construction_organization_closeout_runtime_anchor_candidate',
          businessType: 'hospital',
          projectId: 'project-hospital',
          draftNetworkKey: 'draft-hospital-recommended',
          optionId: 'option-hospital-recommended',
          publicationKey: null,
          readiness: 'ready_for_replay',
          evaluationStatus: 'evaluation_ready',
          hasReleaseExitHandoff: true,
          hasRuntimePublication: false,
          hasRuntimeEngineEvidence: false,
          hasRecommendationDecision: false,
          missingAnchorReasons: ['publicationKey_anchor_required'],
          nextAnchorAction: 'run_domain_writer_runtime_publication_for_candidate',
        }],
        boundaryPolicy: ['candidate_anchor_presence_does_not_claim_runtime_closeout'],
      }],
    })

    expect(report.status).toBe('blocked_until_runtime_publication_anchor')
    expect(report.suggestions.map((suggestion) => suggestion.action)).toContain('runtime_apply')
    expect(report.suggestions.map((suggestion) => suggestion.action)).not.toContain('runtime_engine_evidence')
    expect(report.suggestions.map((suggestion) => suggestion.action)).not.toContain('runtime_consumer_observation')
    expect(report.suggestions.find((suggestion) => suggestion.action === 'runtime_apply')).toEqual(expect.objectContaining({
      canSubmitControlledOperation: false,
      missingRequiredFields: expect.arrayContaining(['constructionOrganizationPlanNetworkDraft']),
      operationPayload: expect.objectContaining({
        action: 'runtime_apply',
        assetType: 'construction_organization_plan_network',
        domainWriterKey: 'constructionOrganizationPlanNetworkDomainWriter.applyApprovedDraft',
        projectId: 'project-hospital',
        draftNetworkKey: 'draft-hospital-recommended',
        optionId: 'option-hospital-recommended',
      }),
    }))
    expect(report.boundaryPolicy).toEqual(expect.arrayContaining([
      'operation_suggestions_do_not_execute_workbench_operations',
      'publication_anchor_required_before_runtime_evidence_payloads',
    ]))
  })

  it('prefills conflict-review manual-review handoff when the read-only draft snapshot is present', () => {
    const draft = planNetworkDraft()
    const report = buildConstructionOrganizationCloseoutWorkbenchOperationSuggestions({
      companyId: 'company-1',
      requestedByUserId: 'user-1',
      workPackages: [workPackage({
        businessType: 'general_civil',
        workPackageKey: 'construction_organization_product_outcome:general_civil',
        runtimeEvidenceProjectIds: ['project-conflict'],
        runtimeEvidenceDraftNetworkKeys: ['draft-conflict'],
        runtimeEvidenceOptionIds: ['option-conflict'],
        runtimeEvidencePublicationKeys: [],
        executionReadinessStatus: 'blocked_missing_runtime_anchors',
        missingRuntimeAnchorReasons: ['publicationKey_anchor_required'],
      })],
      runtimeAnchorCandidateSummaries: [{
        source: 'construction_organization_closeout_runtime_anchor_candidate_summary',
        businessType: 'general_civil',
        status: 'project_draft_anchor_available',
        candidateCount: 1,
        candidateProjectIds: ['project-conflict'],
        candidateDraftNetworkKeys: ['draft-conflict'],
        candidateOptionIds: ['option-conflict'],
        candidatePublicationKeys: [],
        nextAnchorActions: ['submit_manual_review_handoff_for_candidate'],
        candidates: [{
          source: 'construction_organization_closeout_runtime_anchor_candidate',
          businessType: 'general_civil',
          projectId: 'project-conflict',
          draftNetworkKey: 'draft-conflict',
          optionId: 'option-conflict',
          publicationKey: null,
          readiness: 'conflict_review_required',
          evaluationStatus: 'evaluation_ready',
          hasReleaseExitHandoff: false,
          hasRuntimePublication: false,
          hasRuntimeEngineEvidence: false,
          hasRecommendationDecision: false,
          missingAnchorReasons: ['publicationKey_anchor_required'],
          nextAnchorAction: 'submit_manual_review_handoff_for_candidate',
          constructionOrganizationPlanNetworkDraft: draft,
        } as any],
        boundaryPolicy: ['candidate_anchor_presence_does_not_claim_runtime_closeout'],
      }],
    })

    expect(report.status).toBe('blocked_until_runtime_publication_anchor')
    expect(report.suggestions).toEqual([
      expect.objectContaining({
        action: 'manual_review_handoff',
        canSubmitControlledOperation: true,
        missingRequiredFields: [],
        operationPayload: expect.objectContaining({
          action: 'manual_review_handoff',
          assetType: 'construction_organization_plan_network',
          evidenceAction: 'submit_manual_review_handoff_for_candidate',
          domainWriterKey: 'constructionOrganizationPlanNetworkDraftService.manualReviewHandoff',
          constructionOrganizationPlanNetworkDraft: draft,
        }),
      }),
    ])
  })

  it('does not repeat manual-review handoff after a handoff event has been recorded for a conflict-review draft', () => {
    const draft = {
      ...planNetworkDraft(),
      manualReviewHandoff: {
        source: 'construction_organization_plan_network_manual_review_handoff_projection',
        candidateEventId: 'handoff-event-1',
        assetKey: 'construction_organization.plan_network_handoff.draft-conflict',
        sourceModule: 'constructionOrganizationPlanNetworkDraftService.manualReviewHandoff',
        eventStatus: 'review_required',
        runtimeEffect: 'candidate_only',
        createdAt: '2026-06-25T10:00:00.000Z',
        updatedAt: '2026-06-25T10:00:00.000Z',
        draftNetworkKey: 'draft-conflict',
        originalCandidateEventId: 'event-conflict',
        optionId: 'option-conflict',
        selectedScenarioIds: ['pile_before_excavation'],
        requestedByUserId: 'user-1',
        executedAt: '2026-06-25T10:00:00.000Z',
        reviewOperation: 'manual_review_dependency_proposal',
        proposedDependencyEdgeCount: 1,
        writesTaskDependencies: false,
        writesPlanDates: false,
        writesSeed: false,
        writesBaseline: false,
        writesCriticalPathFacts: false,
        writesAccelerationDraft: false,
      },
    } as any
    const report = buildConstructionOrganizationCloseoutWorkbenchOperationSuggestions({
      companyId: 'company-1',
      requestedByUserId: 'user-1',
      workPackages: [workPackage({
        businessType: 'general_civil',
        workPackageKey: 'construction_organization_product_outcome:general_civil',
        runtimeEvidenceProjectIds: ['project-conflict'],
        runtimeEvidenceDraftNetworkKeys: ['draft-conflict'],
        runtimeEvidenceOptionIds: ['option-conflict'],
        runtimeEvidencePublicationKeys: [],
        executionReadinessStatus: 'blocked_missing_runtime_anchors',
        missingRuntimeAnchorReasons: ['publicationKey_anchor_required'],
      })],
      runtimeAnchorCandidateSummaries: [{
        source: 'construction_organization_closeout_runtime_anchor_candidate_summary',
        businessType: 'general_civil',
        status: 'project_draft_anchor_available',
        candidateCount: 1,
        candidateProjectIds: ['project-conflict'],
        candidateDraftNetworkKeys: ['draft-conflict'],
        candidateOptionIds: ['option-conflict'],
        candidatePublicationKeys: [],
        nextAnchorActions: [
          'complete_manual_conflict_review_before_manual_review_approval',
          'submit_manual_review_handoff_for_candidate',
        ],
        candidates: [{
          source: 'construction_organization_closeout_runtime_anchor_candidate',
          businessType: 'general_civil',
          projectId: 'project-conflict',
          draftNetworkKey: 'draft-conflict',
          optionId: 'option-conflict',
          publicationKey: null,
          readiness: 'conflict_review_required',
          evaluationStatus: 'evaluation_ready',
          hasReleaseExitHandoff: false,
          hasRuntimePublication: false,
          hasRuntimeEngineEvidence: false,
          hasRecommendationDecision: false,
          missingAnchorReasons: ['publicationKey_anchor_required'],
          nextAnchorAction: 'complete_manual_conflict_review_before_manual_review_approval',
          constructionOrganizationPlanNetworkDraft: draft,
        } as any],
        boundaryPolicy: ['candidate_anchor_presence_does_not_claim_runtime_closeout'],
      }],
    })

    expect(report.status).toBe('blocked_until_runtime_publication_anchor')
    expect(report.suggestions).toEqual([
      expect.objectContaining({
        action: 'manual_conflict_review',
        canSubmitControlledOperation: false,
        missingRequiredFields: expect.arrayContaining([
          'manualConflictReviewDecision',
        ]),
        operationPayload: expect.objectContaining({
          action: 'manual_conflict_review',
          evidenceAction: 'complete_manual_conflict_review_before_manual_review_approval',
          domainWriterKey: 'constructionOrganizationPlanNetworkDraftService.manualConflictReview',
          constructionOrganizationPlanNetworkDraft: draft,
        }),
      }),
    ])
    expect(report.suggestions.map((suggestion) => suggestion.action)).not.toContain('manual_review_handoff')
  })

  it('selects a project-scoped conflict candidate from the full anchor pool instead of mixing it with displayed company candidates', () => {
    const draft = planNetworkDraft()
    const report = buildConstructionOrganizationCloseoutWorkbenchOperationSuggestions({
      companyId: 'company-1',
      requestedByUserId: 'user-1',
      workPackages: [workPackage({
        businessType: 'general_civil',
        workPackageKey: 'construction_organization_product_outcome:general_civil',
        runtimeEvidenceProjectIds: ['project-conflict'],
        runtimeEvidenceDraftNetworkKeys: ['draft-conflict'],
        runtimeEvidenceOptionIds: ['option-conflict'],
        runtimeEvidencePublicationKeys: [],
        executionReadinessStatus: 'blocked_missing_runtime_anchors',
        missingRuntimeAnchorReasons: ['publicationKey_anchor_required'],
      })],
      runtimeAnchorCandidateSummaries: [{
        source: 'construction_organization_closeout_runtime_anchor_candidate_summary',
        businessType: 'general_civil',
        status: 'project_draft_anchor_available',
        candidateCount: 4,
        candidateProjectIds: ['project-conflict'],
        candidateDraftNetworkKeys: ['company-draft-a', 'company-draft-b', 'company-draft-c', 'draft-conflict'],
        candidateOptionIds: ['company-option-a', 'company-option-b', 'company-option-c', 'option-conflict'],
        candidatePublicationKeys: [],
        nextAnchorActions: [
          'attach_project_anchor_to_plan_network_candidate',
          'complete_manual_conflict_review_before_manual_review_approval',
        ],
        candidates: [
          {
            source: 'construction_organization_closeout_runtime_anchor_candidate',
            businessType: 'general_civil',
            projectId: null,
            draftNetworkKey: 'company-draft-a',
            optionId: 'company-option-a',
            publicationKey: null,
            readiness: 'ready_for_replay',
            evaluationStatus: 'evaluation_ready',
            hasReleaseExitHandoff: false,
            hasRuntimePublication: false,
            hasRuntimeEngineEvidence: false,
            hasRecommendationDecision: false,
            missingAnchorReasons: ['projectId_anchor_required', 'publicationKey_anchor_required'],
            nextAnchorAction: 'attach_project_anchor_to_plan_network_candidate',
          },
          {
            source: 'construction_organization_closeout_runtime_anchor_candidate',
            businessType: 'general_civil',
            projectId: null,
            draftNetworkKey: 'company-draft-b',
            optionId: 'company-option-b',
            publicationKey: null,
            readiness: 'ready_for_replay',
            evaluationStatus: 'evaluation_ready',
            hasReleaseExitHandoff: false,
            hasRuntimePublication: false,
            hasRuntimeEngineEvidence: false,
            hasRecommendationDecision: false,
            missingAnchorReasons: ['projectId_anchor_required', 'publicationKey_anchor_required'],
            nextAnchorAction: 'attach_project_anchor_to_plan_network_candidate',
          },
          {
            source: 'construction_organization_closeout_runtime_anchor_candidate',
            businessType: 'general_civil',
            projectId: null,
            draftNetworkKey: 'company-draft-c',
            optionId: 'company-option-c',
            publicationKey: null,
            readiness: 'ready_for_replay',
            evaluationStatus: 'evaluation_ready',
            hasReleaseExitHandoff: false,
            hasRuntimePublication: false,
            hasRuntimeEngineEvidence: false,
            hasRecommendationDecision: false,
            missingAnchorReasons: ['projectId_anchor_required', 'publicationKey_anchor_required'],
            nextAnchorAction: 'attach_project_anchor_to_plan_network_candidate',
          },
        ],
        boundaryPolicy: ['candidate_anchor_presence_does_not_claim_runtime_closeout'],
      }],
      runtimeAnchorCandidates: [{
        source: 'construction_organization_closeout_runtime_anchor_candidate',
        businessType: 'general_civil',
        projectId: 'project-conflict',
        draftNetworkKey: 'draft-conflict',
        optionId: 'option-conflict',
        publicationKey: null,
        readiness: 'conflict_review_required',
        evaluationStatus: 'evaluation_ready',
        hasReleaseExitHandoff: false,
        hasRuntimePublication: false,
        hasRuntimeEngineEvidence: false,
        hasRecommendationDecision: false,
        missingAnchorReasons: ['publicationKey_anchor_required'],
        nextAnchorAction: 'complete_manual_conflict_review_before_manual_review_approval',
        constructionOrganizationPlanNetworkDraft: draft,
      }],
    } as any)

    expect(report.status).toBe('blocked_until_runtime_publication_anchor')
    expect(report.suggestions).toEqual([
      expect.objectContaining({
        action: 'manual_conflict_review',
        canSubmitControlledOperation: false,
        missingRequiredFields: expect.arrayContaining(['manualConflictReviewDecision']),
        operationPayload: expect.objectContaining({
          action: 'manual_conflict_review',
          projectId: 'project-conflict',
          draftNetworkKey: 'draft-conflict',
          optionId: 'option-conflict',
          constructionOrganizationPlanNetworkDraft: draft,
        }),
      }),
    ])
    expect(report.suggestions.map((suggestion) => suggestion.action)).not.toContain('runtime_apply')
    expect(report.suggestions[0]?.operationPayload.draftNetworkKey).not.toBe('company-draft-a')
  })
})
