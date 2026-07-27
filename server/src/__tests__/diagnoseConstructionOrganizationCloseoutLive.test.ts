import { describe, expect, it, vi } from 'vitest'

import {
  buildConstructionOrganizationCloseoutLiveDiagnosticReport,
  runConstructionOrganizationCloseoutLiveDiagnosticCli,
  type ConstructionOrganizationCloseoutArtifacts,
} from '../scripts/diagnose-construction-organization-closeout-live.js'

describe('diagnose-construction-organization-closeout-live', () => {
  it('blocks without company id and does not query runtime evidence', async () => {
    const listDrafts = vi.fn()

    const report = await buildConstructionOrganizationCloseoutLiveDiagnosticReport({
      companyId: '',
      listDrafts,
      now: new Date('2026-06-24T10:00:00.000Z'),
    })

    expect(report.status).toBe('blocked')
    expect(report.runtimeEvidenceGap.missingCompanyId).toBe(true)
    expect(report.checks.productOutcomeCloseout.status).toBe('blocked')
    expect(listDrafts).not.toHaveBeenCalled()
  })

  it('summarizes product closeout progress from the current plan-network read model without writing runtime data', async () => {
    const listDrafts = vi.fn().mockResolvedValue({
      source: 'construction_organization_plan_network_draft_read_model',
      companyId: 'company-1',
      projectId: null,
      totalDraftCount: 3,
      optionComparisonPackage: {
        options: [],
      },
      items: [{
        businessType: 'school',
        projectId: 'project-1',
        draftNetworkKey: 'draft-1',
        optionId: 'option-1',
        readiness: 'ready_for_replay',
        evaluationEvidence: {
          evaluationStatus: 'evaluation_ready',
        },
        releaseExitHandoff: {
          candidateEventId: 'release-exit-1',
        },
        runtimeEngineEvidence: {
          publicationKey: null,
          canClaimTruePerOptionRuntimeEvaluation: false,
        },
        recommendationDecision: null,
      }],
    })
    const artifacts: ConstructionOrganizationCloseoutArtifacts = {
      matrix: {
        source: 'construction_organization_product_outcome_closeout_matrix',
        status: 'product_outcome_closeout_incomplete',
        canDeclareConstructionOrganizationProductOutcomeCloseout: false,
        supportedBusinessTypeCount: 11,
        precisionReplayReadyBusinessTypeCount: 11,
        runtimeOutcomeReadyBusinessTypeCount: 2,
        rows: [],
        missingReasons: ['hospital:runtime_closeout_claim_by_business_type_required'],
        nextEvidenceActions: ['collect_runtime_closeout_claim_for_business_type'],
        nextEvidenceOperations: [],
        nextEvidenceWorkItems: [],
        nextEvidenceExecutionPlan: [],
        nextEvidenceWorkPackages: [
          {
            source: 'construction_organization_product_outcome_evidence_work_package',
            workPackageKey: 'construction_organization_product_outcome:school',
            businessType: 'school',
            status: 'evidence_work_package_open',
            runtimeEvidenceProjectIds: ['project-1'],
            runtimeEvidenceDraftNetworkKeys: ['draft-1'],
            runtimeEvidenceOptionIds: ['option-1'],
            runtimeEvidencePublicationKeys: [],
            runtimeClaimMissingReasons: ['site_adoption_of_runtime_recommended_option_required'],
            missingReasons: ['runtime_closeout_claim_by_business_type_required'],
            nextEvidenceActions: ['collect_runtime_closeout_claim_for_business_type'],
            operationActions: ['collect_runtime_closeout_claim_for_business_type'],
            executionPlanItems: [],
            executionSteps: [],
            executionPlanItemCount: 1,
            prefillableExecutionStepCount: 0,
            blockedExecutionStepCount: 1,
            executionReadinessStatus: 'blocked_missing_runtime_anchors',
            missingRuntimeAnchorReasons: ['publicationKey'],
            totalDeficit: 1,
            useCases: ['newProjectPlanning'],
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
          },
        ],
        mutationBoundary: {
          writesTaskDependencies: false,
          writesPlanDates: false,
          writesSeed: false,
          writesBaseline: false,
          writesCriticalPathFacts: false,
          writesAccelerationDraft: false,
        },
        boundaryPolicy: ['product_outcome_closeout_does_not_grant_auto_materialization'],
      } as any,
      progress: {
        source: 'construction_organization_product_outcome_closeout_progress',
        status: 'product_outcome_closeout_incomplete',
        canDeclareConstructionOrganizationProductOutcomeCloseout: false,
        supportedBusinessTypeCount: 11,
        precisionReplayReadyBusinessTypeCount: 11,
        runtimeOutcomeReadyBusinessTypeCount: 2,
        readyBusinessTypes: ['general_civil', 'hospital'],
        missingBusinessTypes: ['school'],
        topMissingReasons: ['hospital:runtime_closeout_claim_by_business_type_required'],
        nextEvidenceActions: ['collect_runtime_closeout_claim_for_business_type'],
        nextEvidenceWorkItemCount: 1,
        nextEvidenceWorkPackageCount: 1,
        prefillableWorkPackageCount: 1,
        blockedWorkPackageCount: 0,
        useCaseCoverage: {
          newProjectPlanning: { readyBusinessTypeCount: 2, missingBusinessTypes: ['school'] },
          startingLineOnboarding: { readyBusinessTypeCount: 1, missingBusinessTypes: ['school'] },
          accelerationRecovery: { readyBusinessTypeCount: 0, missingBusinessTypes: ['school'] },
        },
        mutationBoundary: {
          writesTaskDependencies: false,
          writesPlanDates: false,
          writesSeed: false,
          writesBaseline: false,
          writesCriticalPathFacts: false,
          writesAccelerationDraft: false,
        },
        boundaryPolicy: ['progress_projection_is_read_only'],
      } as any,
    }

    const report = await buildConstructionOrganizationCloseoutLiveDiagnosticReport({
      companyId: 'company-1',
      listDrafts,
      buildCloseoutArtifacts: () => artifacts,
      now: new Date('2026-06-24T10:00:00.000Z'),
    })

    expect(listDrafts).toHaveBeenCalledWith(expect.objectContaining({
      companyId: 'company-1',
      projectId: null,
    }))
    expect(report.status).toBe('blocked')
    expect(report.checks.productOutcomeCloseout.runtimeOutcomeReadyBusinessTypeCount).toBe(2)
    expect(report.checks.productOutcomeCloseout.nextEvidenceActions).toEqual([
      'collect_runtime_closeout_claim_for_business_type',
    ])
    expect(report.nextEvidenceWorkPackages).toEqual([
      expect.objectContaining({
        workPackageKey: 'construction_organization_product_outcome:school',
        businessType: 'school',
        executionReadinessStatus: 'blocked_missing_runtime_anchors',
        totalDeficit: 1,
        missingRuntimeAnchorReasons: ['publicationKey'],
        runtimeClaimMissingReasons: ['site_adoption_of_runtime_recommended_option_required'],
      }),
    ])
    expect(report.runtimeAnchorCandidateSummaries).toEqual([
      expect.objectContaining({
        source: 'construction_organization_closeout_runtime_anchor_candidate_summary',
        businessType: 'school',
        status: 'project_draft_anchor_available',
        candidateCount: 1,
        candidateProjectIds: ['project-1'],
        candidateDraftNetworkKeys: ['draft-1'],
        candidatePublicationKeys: [],
        nextAnchorActions: ['run_domain_writer_runtime_publication_for_candidate'],
        candidates: [
          expect.objectContaining({
            source: 'construction_organization_closeout_runtime_anchor_candidate',
            businessType: 'school',
            projectId: 'project-1',
            draftNetworkKey: 'draft-1',
            optionId: 'option-1',
            publicationKey: null,
            hasReleaseExitHandoff: true,
            hasRuntimePublication: false,
            missingAnchorReasons: ['publicationKey_anchor_required'],
            nextAnchorAction: 'run_domain_writer_runtime_publication_for_candidate',
          }),
        ],
        boundaryPolicy: expect.arrayContaining([
          'candidate_anchor_presence_does_not_claim_runtime_closeout',
        ]),
      }),
    ])
    expect(report.workbenchOperationSuggestionReport).toEqual(expect.objectContaining({
      source: 'construction_organization_closeout_workbench_operation_suggestion_report',
      status: 'blocked_until_runtime_publication_anchor',
      suggestionCount: 1,
      suggestions: [
        expect.objectContaining({
          source: 'construction_organization_closeout_workbench_operation_suggestion',
          action: 'runtime_apply',
          canSubmitControlledOperation: false,
          missingRequiredFields: expect.arrayContaining([
            'constructionOrganizationPlanNetworkDraft',
          ]),
          operationPayload: expect.objectContaining({
            action: 'runtime_apply',
            assetType: 'construction_organization_plan_network',
            businessType: 'school',
            companyId: 'company-1',
            projectId: 'project-1',
            draftNetworkKey: 'draft-1',
            optionId: 'option-1',
            domainWriterKey: 'constructionOrganizationPlanNetworkDomainWriter.applyApprovedDraft',
          }),
          bridgeMutationBoundary: expect.objectContaining({
            writesTaskDependencies: false,
            writesPlanDates: false,
          }),
        }),
      ],
      boundaryPolicy: expect.arrayContaining([
        'operation_suggestions_do_not_execute_workbench_operations',
        'publication_anchor_required_before_runtime_evidence_payloads',
      ]),
    }))
    expect(report.boundaryPolicy).toEqual(expect.arrayContaining([
      'diagnostic_is_read_only',
      'diagnostic_does_not_write_task_dependencies_or_plan_dates',
    ]))
  })

  it('routes conflict-review drafts to manual review handoff before release-exit or runtime publication', async () => {
    const listDrafts = vi.fn().mockResolvedValue({
      source: 'construction_organization_plan_network_draft_read_model',
      companyId: 'company-1',
      projectId: 'project-1',
      totalDraftCount: 1,
      optionComparisonPackage: {
        options: [],
      },
      items: [{
        businessType: 'general_civil',
        projectId: 'project-1',
        draftNetworkKey: 'draft-conflict',
        optionId: 'option-conflict',
        readiness: 'conflict_review_required',
        edgeCount: 2,
        blockedReasons: [
          'unresolved_virtual_dependency_edges',
          'candidate_preview_edges_unresolved',
          'candidate_network_conflicts_with_current_generated_row_dates',
          'requires_manual_conflict_review_before_replay',
        ],
        evaluationEvidence: {
          evaluationStatus: 'evaluation_ready',
        },
        releaseExitAssessment: {
          status: 'manual_review_handoff_required',
        },
        releaseExitHandoff: null,
        manualReviewHandoff: null,
        runtimeEngineEvidence: {
          publicationKey: null,
          canClaimTruePerOptionRuntimeEvaluation: false,
        },
        recommendationDecision: null,
      }],
    })
    const artifacts: ConstructionOrganizationCloseoutArtifacts = {
      matrix: {
        source: 'construction_organization_product_outcome_closeout_matrix',
        status: 'product_outcome_closeout_incomplete',
        canDeclareConstructionOrganizationProductOutcomeCloseout: false,
        supportedBusinessTypeCount: 11,
        precisionReplayReadyBusinessTypeCount: 11,
        runtimeOutcomeReadyBusinessTypeCount: 0,
        rows: [],
        missingReasons: ['general_civil:runtime_closeout_claim_by_business_type_required'],
        nextEvidenceActions: ['collect_runtime_closeout_claim_for_business_type'],
        nextEvidenceOperations: [],
        nextEvidenceWorkItems: [],
        nextEvidenceExecutionPlan: [],
        nextEvidenceWorkPackages: [
          {
            source: 'construction_organization_product_outcome_evidence_work_package',
            workPackageKey: 'construction_organization_product_outcome:general_civil',
            businessType: 'general_civil',
            status: 'evidence_work_package_open',
            runtimeEvidenceProjectIds: ['project-1'],
            runtimeEvidenceDraftNetworkKeys: ['draft-conflict'],
            runtimeEvidenceOptionIds: ['option-conflict'],
            runtimeEvidencePublicationKeys: [],
            runtimeClaimMissingReasons: [],
            missingReasons: ['runtime_closeout_claim_by_business_type_required'],
            nextEvidenceActions: ['collect_runtime_closeout_claim_for_business_type'],
            operationActions: ['collect_runtime_closeout_claim_for_business_type'],
            executionPlanItems: [],
            executionSteps: [],
            executionPlanItemCount: 1,
            prefillableExecutionStepCount: 0,
            blockedExecutionStepCount: 1,
            executionReadinessStatus: 'blocked_missing_runtime_anchors',
            missingRuntimeAnchorReasons: ['publicationKey'],
            totalDeficit: 1,
            useCases: ['newProjectPlanning'],
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
          },
        ],
        mutationBoundary: {
          writesTaskDependencies: false,
          writesPlanDates: false,
          writesSeed: false,
          writesBaseline: false,
          writesCriticalPathFacts: false,
          writesAccelerationDraft: false,
        },
        boundaryPolicy: ['product_outcome_closeout_does_not_grant_auto_materialization'],
      } as any,
      progress: {
        source: 'construction_organization_product_outcome_closeout_progress',
        status: 'product_outcome_closeout_incomplete',
        canDeclareConstructionOrganizationProductOutcomeCloseout: false,
        supportedBusinessTypeCount: 11,
        precisionReplayReadyBusinessTypeCount: 11,
        runtimeOutcomeReadyBusinessTypeCount: 0,
        readyBusinessTypes: [],
        missingBusinessTypes: ['general_civil'],
        topMissingReasons: ['general_civil:runtime_closeout_claim_by_business_type_required'],
        nextEvidenceActions: ['collect_runtime_closeout_claim_for_business_type'],
        nextEvidenceWorkItemCount: 1,
        nextEvidenceWorkPackageCount: 1,
        prefillableWorkPackageCount: 0,
        blockedWorkPackageCount: 1,
        useCaseCoverage: {
          newProjectPlanning: { readyBusinessTypeCount: 0, missingBusinessTypes: ['general_civil'] },
          startingLineOnboarding: { readyBusinessTypeCount: 0, missingBusinessTypes: ['general_civil'] },
          accelerationRecovery: { readyBusinessTypeCount: 0, missingBusinessTypes: ['general_civil'] },
        },
        mutationBoundary: {
          writesTaskDependencies: false,
          writesPlanDates: false,
          writesSeed: false,
          writesBaseline: false,
          writesCriticalPathFacts: false,
          writesAccelerationDraft: false,
        },
        boundaryPolicy: ['progress_projection_is_read_only'],
      } as any,
    }

    const report = await buildConstructionOrganizationCloseoutLiveDiagnosticReport({
      companyId: 'company-1',
      projectId: 'project-1',
      listDrafts,
      buildCloseoutArtifacts: () => artifacts,
      now: new Date('2026-06-25T10:00:00.000Z'),
    })

    expect(report.runtimeAnchorCandidateSummaries).toEqual([
      expect.objectContaining({
        businessType: 'general_civil',
        status: 'project_draft_anchor_available',
        nextAnchorActions: ['resolve_candidate_network_unresolved_edges_before_manual_review_handoff'],
        candidates: [
          expect.objectContaining({
            readiness: 'conflict_review_required',
            hasReleaseExitHandoff: false,
            hasRuntimePublication: false,
            nextAnchorAction: 'resolve_candidate_network_unresolved_edges_before_manual_review_handoff',
          }),
        ],
      }),
    ])
    expect(report.workbenchOperationSuggestionReport).toEqual(expect.objectContaining({
      status: 'blocked_until_runtime_publication_anchor',
      suggestions: [
        expect.objectContaining({
          action: 'manual_review_handoff',
          canSubmitControlledOperation: false,
          missingRequiredFields: expect.arrayContaining([
            'constructionOrganizationPlanNetworkDraft',
            'candidateNetworkUnresolvedEdges',
          ]),
          operationPayload: expect.objectContaining({
            action: 'manual_review_handoff',
            evidenceAction: 'resolve_candidate_network_unresolved_edges_before_manual_review_handoff',
            domainWriterKey: 'constructionOrganizationPlanNetworkDraftService.manualReviewHandoff',
            projectId: 'project-1',
            draftNetworkKey: 'draft-conflict',
            optionId: 'option-conflict',
          }),
        }),
      ],
    }))
  })

  it('does not repeat manual-review handoff after the handoff candidate event is read back', async () => {
    const listDrafts = vi.fn().mockResolvedValue({
      source: 'construction_organization_plan_network_draft_read_model',
      companyId: 'company-1',
      projectId: 'project-1',
      totalDraftCount: 1,
      optionComparisonPackage: {
        options: [],
      },
      items: [{
        businessType: 'general_civil',
        projectId: 'project-1',
        draftNetworkKey: 'draft-conflict',
        optionId: 'option-conflict',
        readiness: 'conflict_review_required',
        edgeCount: 2,
        blockedReasons: [
          'candidate_network_conflicts_with_current_generated_row_dates',
          'requires_manual_conflict_review_before_replay',
        ],
        evaluationEvidence: {
          evaluationStatus: 'evaluation_ready',
        },
        releaseExitAssessment: {
          status: 'release_exit_blocked',
        },
        releaseExitHandoff: null,
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
          proposedDependencyEdgeCount: 2,
          writesTaskDependencies: false,
          writesPlanDates: false,
          writesSeed: false,
          writesBaseline: false,
          writesCriticalPathFacts: false,
          writesAccelerationDraft: false,
        },
        manualConflictReviewPackage: {
          source: 'construction_organization_plan_network_manual_conflict_review_package',
          status: 'manual_conflict_review_required',
          reviewPrompt: '候选施工组织关系与当前生成计划日期存在冲突，需要人工确认是接受候选关系进入回放，还是退回调整计划日期。',
          reviewChecklist: [
            '核对候选依赖是否符合当前施工组织方案和现场业务顺序。',
            '核对当前计划日期冲突是否应由计划日期调整解决。',
          ],
          conflictReasonCodes: [
            'candidate_network_conflicts_with_current_generated_row_dates',
            'requires_manual_conflict_review_before_replay',
          ],
          proposedDependencyEdgeCount: 2,
          sampleProposedDependencyEdges: [],
          conflictEvidenceCount: 1,
          sampleConflictEvidence: [{
            edgeId: 'conflict-edge-1',
            fromGeneratedRowId: 'row-foundation',
            toGeneratedRowId: 'row-earthwork',
            dependencyType: 'FS',
            lagDays: 0,
            intent: 'pile_before_earthwork_bulk_excavation',
            fromVirtualNodeId: 'foundation_pile',
            toVirtualNodeId: 'foundation_earthwork',
            reason: 'fs_predecessor_finishes_after_successor_start',
            fromWindow: {
              startDay: 10,
              finishDay: 20,
              plannedStartDate: '2026-01-10',
              plannedEndDate: '2026-01-20',
            },
            toWindow: {
              startDay: 12,
              finishDay: 18,
              plannedStartDate: '2026-01-12',
              plannedEndDate: '2026-01-18',
            },
            writesTaskDependencies: false,
            writesPlanDates: false,
          }],
          allowedDecisions: [
            'approved_ready_for_replay',
            'rejected_needs_plan_date_adjustment',
          ],
          recommendedNextAction: 'complete_manual_conflict_review_before_manual_review_approval',
          writesTaskDependencies: false,
          writesPlanDates: false,
          writesSeed: false,
          writesBaseline: false,
          writesCriticalPathFacts: false,
          writesAccelerationDraft: false,
          boundaryPolicy: [
            'manual_conflict_review_package_is_read_only',
          ],
        },
        manualReviewApproval: null,
        runtimeEngineEvidence: {
          publicationKey: null,
          canClaimTruePerOptionRuntimeEvaluation: false,
        },
        recommendationDecision: null,
      }],
    })
    const artifacts: ConstructionOrganizationCloseoutArtifacts = {
      matrix: {
        source: 'construction_organization_product_outcome_closeout_matrix',
        status: 'product_outcome_closeout_incomplete',
        canDeclareConstructionOrganizationProductOutcomeCloseout: false,
        supportedBusinessTypeCount: 11,
        precisionReplayReadyBusinessTypeCount: 11,
        runtimeOutcomeReadyBusinessTypeCount: 0,
        rows: [],
        missingReasons: ['general_civil:runtime_closeout_claim_by_business_type_required'],
        nextEvidenceActions: ['collect_runtime_closeout_claim_for_business_type'],
        nextEvidenceOperations: [],
        nextEvidenceWorkItems: [],
        nextEvidenceExecutionPlan: [],
        nextEvidenceWorkPackages: [
          {
            source: 'construction_organization_product_outcome_evidence_work_package',
            workPackageKey: 'construction_organization_product_outcome:general_civil',
            businessType: 'general_civil',
            status: 'evidence_work_package_open',
            runtimeEvidenceProjectIds: ['project-1'],
            runtimeEvidenceDraftNetworkKeys: ['draft-conflict'],
            runtimeEvidenceOptionIds: ['option-conflict'],
            runtimeEvidencePublicationKeys: [],
            runtimeClaimMissingReasons: [],
            missingReasons: ['runtime_closeout_claim_by_business_type_required'],
            nextEvidenceActions: ['collect_runtime_closeout_claim_for_business_type'],
            operationActions: ['collect_runtime_closeout_claim_for_business_type'],
            executionPlanItems: [],
            executionSteps: [],
            executionPlanItemCount: 1,
            prefillableExecutionStepCount: 0,
            blockedExecutionStepCount: 1,
            executionReadinessStatus: 'blocked_missing_runtime_anchors',
            missingRuntimeAnchorReasons: ['publicationKey'],
            totalDeficit: 1,
            useCases: ['newProjectPlanning'],
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
          },
        ],
        mutationBoundary: {
          writesTaskDependencies: false,
          writesPlanDates: false,
          writesSeed: false,
          writesBaseline: false,
          writesCriticalPathFacts: false,
          writesAccelerationDraft: false,
        },
        boundaryPolicy: ['product_outcome_closeout_does_not_grant_auto_materialization'],
      } as any,
      progress: {
        source: 'construction_organization_product_outcome_closeout_progress',
        status: 'product_outcome_closeout_incomplete',
        canDeclareConstructionOrganizationProductOutcomeCloseout: false,
        supportedBusinessTypeCount: 11,
        precisionReplayReadyBusinessTypeCount: 11,
        runtimeOutcomeReadyBusinessTypeCount: 0,
        readyBusinessTypes: [],
        missingBusinessTypes: ['general_civil'],
        topMissingReasons: ['general_civil:runtime_closeout_claim_by_business_type_required'],
        nextEvidenceActions: ['collect_runtime_closeout_claim_for_business_type'],
        nextEvidenceWorkItemCount: 1,
        nextEvidenceWorkPackageCount: 1,
        prefillableWorkPackageCount: 0,
        blockedWorkPackageCount: 1,
        useCaseCoverage: {
          newProjectPlanning: { readyBusinessTypeCount: 0, missingBusinessTypes: ['general_civil'] },
          startingLineOnboarding: { readyBusinessTypeCount: 0, missingBusinessTypes: ['general_civil'] },
          accelerationRecovery: { readyBusinessTypeCount: 0, missingBusinessTypes: ['general_civil'] },
        },
        mutationBoundary: {
          writesTaskDependencies: false,
          writesPlanDates: false,
          writesSeed: false,
          writesBaseline: false,
          writesCriticalPathFacts: false,
          writesAccelerationDraft: false,
        },
        boundaryPolicy: ['progress_projection_is_read_only'],
      } as any,
    }

    const report = await buildConstructionOrganizationCloseoutLiveDiagnosticReport({
      companyId: 'company-1',
      projectId: 'project-1',
      listDrafts,
      buildCloseoutArtifacts: () => artifacts,
      now: new Date('2026-06-25T10:00:00.000Z'),
    })

    expect(report.runtimeAnchorCandidateSummaries).toEqual([
      expect.objectContaining({
        businessType: 'general_civil',
        status: 'project_draft_anchor_available',
        nextAnchorActions: ['complete_manual_conflict_review_before_manual_review_approval'],
        candidates: [
          expect.objectContaining({
            readiness: 'conflict_review_required',
            hasReleaseExitHandoff: false,
            hasRuntimePublication: false,
            nextAnchorAction: 'complete_manual_conflict_review_before_manual_review_approval',
          }),
        ],
      }),
    ])
    expect(report.manualConflictReviewWorkItems).toEqual([
      expect.objectContaining({
        source: 'construction_organization_manual_conflict_review_work_item',
        businessType: 'general_civil',
        projectId: 'project-1',
        draftNetworkKey: 'draft-conflict',
        optionId: 'option-conflict',
        status: 'manual_conflict_review_required',
        readiness: 'conflict_review_required',
        evaluationStatus: 'evaluation_ready',
        reviewPrompt: expect.any(String),
        conflictReasonCodes: expect.arrayContaining([
          'candidate_network_conflicts_with_current_generated_row_dates',
          'requires_manual_conflict_review_before_replay',
        ]),
        proposedDependencyEdgeCount: expect.any(Number),
        conflictEvidenceCount: expect.any(Number),
        sampleConflictEvidence: expect.arrayContaining([
          expect.objectContaining({
            fromGeneratedRowId: 'row-foundation',
            toGeneratedRowId: 'row-earthwork',
            reason: 'fs_predecessor_finishes_after_successor_start',
          }),
        ]),
        allowedDecisions: [
          'approved_ready_for_replay',
          'rejected_needs_plan_date_adjustment',
        ],
        recommendedNextAction: 'complete_manual_conflict_review_before_manual_review_approval',
        canSubmitControlledOperation: false,
        missingRequiredFields: ['manualConflictReviewDecision'],
        operationPayload: expect.objectContaining({
          action: 'manual_conflict_review',
          businessType: 'general_civil',
          projectId: 'project-1',
          draftNetworkKey: 'draft-conflict',
          optionId: 'option-conflict',
          evidenceAction: 'complete_manual_conflict_review_before_manual_review_approval',
        }),
        mutationBoundary: expect.objectContaining({
          writesTaskDependencies: false,
          writesPlanDates: false,
        }),
        boundaryPolicy: expect.arrayContaining([
          'manual_conflict_review_work_item_is_read_only',
          'manual_conflict_review_work_item_does_not_auto_approve_candidate',
        ]),
      }),
    ])
    expect(report.workbenchOperationSuggestionReport).toEqual(expect.objectContaining({
      status: 'blocked_until_runtime_publication_anchor',
      suggestions: [
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
            projectId: 'project-1',
            draftNetworkKey: 'draft-conflict',
            optionId: 'option-conflict',
          }),
        }),
      ],
    }))
  })

  it('keeps project manual conflict review visible when company-scoped precision candidates occupy the displayed top candidates', async () => {
    const companyScopedCandidates = Array.from({ length: 3 }, (_, index) => ({
      businessType: 'general_civil',
      projectId: null,
      draftNetworkKey: `general_civil:precision-replay-${index + 1}`,
      optionId: `general_civil:precision-option-${index + 1}`,
      readiness: 'ready_for_replay',
      evaluationEvidence: {
        evaluationStatus: 'evaluation_ready',
      },
      releaseExitHandoff: null,
      runtimeEngineEvidence: {
        publicationKey: null,
        canClaimTruePerOptionRuntimeEvaluation: false,
      },
      recommendationDecision: null,
    }))
    const listDrafts = vi.fn().mockResolvedValue({
      source: 'construction_organization_plan_network_draft_read_model',
      companyId: 'company-1',
      projectId: null,
      totalDraftCount: 4,
      optionComparisonPackage: {
        options: [],
      },
      items: [
        ...companyScopedCandidates,
        {
          businessType: 'general_civil',
          projectId: 'project-1',
          draftNetworkKey: 'draft-conflict-hidden-by-top-candidates',
          optionId: 'option-conflict',
          readiness: 'conflict_review_required',
          evaluationEvidence: {
            evaluationStatus: 'evaluation_ready',
          },
          releaseExitHandoff: null,
          manualReviewHandoff: {
            candidateEventId: 'handoff-event-hidden-conflict',
          },
          manualReviewApproval: null,
          manualConflictReviewPackage: {
            source: 'construction_organization_plan_network_manual_conflict_review_package',
            status: 'manual_conflict_review_required',
            reviewPrompt: '需要人工确认候选依赖与当前计划日期冲突。',
            reviewChecklist: ['核对候选依赖是否符合现场业务顺序。'],
            conflictReasonCodes: [
              'candidate_network_conflicts_with_current_generated_row_dates',
              'requires_manual_conflict_review_before_replay',
            ],
            proposedDependencyEdgeCount: 2,
            sampleProposedDependencyEdges: [],
            conflictEvidenceCount: 1,
            sampleConflictEvidence: [{
              edgeId: 'conflict-edge-hidden',
              fromGeneratedRowId: 'row-a',
              toGeneratedRowId: 'row-b',
              dependencyType: 'FS',
              lagDays: 0,
              intent: 'pile_before_earthwork_bulk_excavation',
              fromVirtualNodeId: 'foundation_pile',
              toVirtualNodeId: 'foundation_earthwork',
              reason: 'fs_predecessor_finishes_after_successor_start',
              fromWindow: {
                startDay: 10,
                finishDay: 20,
                plannedStartDate: '2026-01-10',
                plannedEndDate: '2026-01-20',
              },
              toWindow: {
                startDay: 12,
                finishDay: 18,
                plannedStartDate: '2026-01-12',
                plannedEndDate: '2026-01-18',
              },
              writesTaskDependencies: false,
              writesPlanDates: false,
            }],
            allowedDecisions: [
              'approved_ready_for_replay',
              'rejected_needs_plan_date_adjustment',
            ],
            recommendedNextAction: 'complete_manual_conflict_review_before_manual_review_approval',
            writesTaskDependencies: false,
            writesPlanDates: false,
            writesSeed: false,
            writesBaseline: false,
            writesCriticalPathFacts: false,
            writesAccelerationDraft: false,
            boundaryPolicy: ['manual_conflict_review_package_is_read_only'],
          },
          runtimeEngineEvidence: {
            publicationKey: null,
            canClaimTruePerOptionRuntimeEvaluation: false,
          },
          recommendationDecision: null,
        },
      ],
    })
    const artifacts: ConstructionOrganizationCloseoutArtifacts = {
      matrix: {
        source: 'construction_organization_product_outcome_closeout_matrix',
        status: 'product_outcome_closeout_incomplete',
        canDeclareConstructionOrganizationProductOutcomeCloseout: false,
        supportedBusinessTypeCount: 11,
        precisionReplayReadyBusinessTypeCount: 11,
        runtimeOutcomeReadyBusinessTypeCount: 0,
        rows: [],
        missingReasons: ['general_civil:runtime_closeout_claim_by_business_type_required'],
        nextEvidenceActions: ['collect_runtime_closeout_claim_for_business_type'],
        nextEvidenceOperations: [],
        nextEvidenceWorkItems: [],
        nextEvidenceExecutionPlan: [],
        nextEvidenceWorkPackages: [],
        mutationBoundary: {
          writesTaskDependencies: false,
          writesPlanDates: false,
          writesSeed: false,
          writesBaseline: false,
          writesCriticalPathFacts: false,
          writesAccelerationDraft: false,
        },
        boundaryPolicy: ['product_outcome_closeout_does_not_grant_auto_materialization'],
      } as any,
      progress: {
        source: 'construction_organization_product_outcome_closeout_progress',
        status: 'product_outcome_closeout_incomplete',
        canDeclareConstructionOrganizationProductOutcomeCloseout: false,
        supportedBusinessTypeCount: 11,
        precisionReplayReadyBusinessTypeCount: 11,
        runtimeOutcomeReadyBusinessTypeCount: 0,
        readyBusinessTypes: [],
        missingBusinessTypes: ['general_civil'],
        topMissingReasons: ['general_civil:runtime_closeout_claim_by_business_type_required'],
        nextEvidenceActions: ['collect_runtime_closeout_claim_for_business_type'],
        nextEvidenceWorkItemCount: 1,
        nextEvidenceWorkPackageCount: 1,
        prefillableWorkPackageCount: 0,
        blockedWorkPackageCount: 1,
        useCaseCoverage: {
          newProjectPlanning: { readyBusinessTypeCount: 0, missingBusinessTypes: ['general_civil'] },
          startingLineOnboarding: { readyBusinessTypeCount: 0, missingBusinessTypes: ['general_civil'] },
          accelerationRecovery: { readyBusinessTypeCount: 0, missingBusinessTypes: ['general_civil'] },
        },
        mutationBoundary: {
          writesTaskDependencies: false,
          writesPlanDates: false,
          writesSeed: false,
          writesBaseline: false,
          writesCriticalPathFacts: false,
          writesAccelerationDraft: false,
        },
        boundaryPolicy: ['progress_projection_is_read_only'],
      } as any,
    }

    const report = await buildConstructionOrganizationCloseoutLiveDiagnosticReport({
      companyId: 'company-1',
      listDrafts,
      buildCloseoutArtifacts: () => artifacts,
      now: new Date('2026-06-25T10:00:00.000Z'),
    })

    expect(report.runtimeAnchorCandidateSummaries[0]?.candidates).toHaveLength(3)
    expect(report.runtimeAnchorCandidateSummaries[0]?.candidates).not.toEqual(expect.arrayContaining([
      expect.objectContaining({
        draftNetworkKey: 'draft-conflict-hidden-by-top-candidates',
      }),
    ]))
    expect(report.runtimeAnchorCandidateSummaries[0]?.nextAnchorActions).toEqual(expect.arrayContaining([
      'attach_project_anchor_to_plan_network_candidate',
      'complete_manual_conflict_review_before_manual_review_approval',
    ]))
    expect(report.manualConflictReviewWorkItems).toEqual([
      expect.objectContaining({
        businessType: 'general_civil',
        projectId: 'project-1',
        draftNetworkKey: 'draft-conflict-hidden-by-top-candidates',
        status: 'manual_conflict_review_required',
        missingRequiredFields: ['manualConflictReviewDecision'],
        mutationBoundary: expect.objectContaining({
          writesTaskDependencies: false,
          writesPlanDates: false,
        }),
      }),
    ])
  })

  it('does not turn company-scoped precision replay conflict packages into manual site-review work items', async () => {
    const listDrafts = vi.fn().mockResolvedValue({
      source: 'construction_organization_plan_network_draft_read_model',
      companyId: 'company-1',
      projectId: null,
      totalDraftCount: 1,
      optionComparisonPackage: {
        options: [],
      },
      items: [{
        businessType: 'renovation',
        projectId: null,
        draftNetworkKey: 'renovation:precision-conflict',
        optionId: 'renovation:precision-option',
        readiness: 'conflict_review_required',
        evaluationEvidence: {
          evaluationStatus: 'evaluation_ready',
        },
        manualConflictReviewPackage: {
          source: 'construction_organization_plan_network_manual_conflict_review_package',
          status: 'manual_conflict_review_required',
          reviewPrompt: '公司级候选不应直接进入现场人工复核。',
          reviewChecklist: ['等待绑定真实项目计划网络后再复核。'],
          conflictReasonCodes: [
            'candidate_network_conflicts_with_current_generated_row_dates',
            'requires_manual_conflict_review_before_replay',
          ],
          proposedDependencyEdgeCount: 1,
          sampleProposedDependencyEdges: [],
          conflictEvidenceCount: 1,
          sampleConflictEvidence: [],
          allowedDecisions: [
            'approved_ready_for_replay',
            'rejected_needs_plan_date_adjustment',
          ],
          recommendedNextAction: 'complete_manual_conflict_review_before_manual_review_approval',
          writesTaskDependencies: false,
          writesPlanDates: false,
          writesSeed: false,
          writesBaseline: false,
          writesCriticalPathFacts: false,
          writesAccelerationDraft: false,
          boundaryPolicy: ['manual_conflict_review_package_is_read_only'],
        },
        runtimeEngineEvidence: {
          publicationKey: null,
          canClaimTruePerOptionRuntimeEvaluation: false,
        },
        recommendationDecision: null,
      }],
    })
    const artifacts: ConstructionOrganizationCloseoutArtifacts = {
      matrix: {
        source: 'construction_organization_product_outcome_closeout_matrix',
        status: 'product_outcome_closeout_incomplete',
        canDeclareConstructionOrganizationProductOutcomeCloseout: false,
        supportedBusinessTypeCount: 11,
        precisionReplayReadyBusinessTypeCount: 11,
        runtimeOutcomeReadyBusinessTypeCount: 0,
        rows: [],
        missingReasons: ['renovation:runtime_closeout_claim_by_business_type_required'],
        nextEvidenceActions: ['collect_runtime_closeout_claim_for_business_type'],
        nextEvidenceOperations: [],
        nextEvidenceWorkItems: [],
        nextEvidenceExecutionPlan: [],
        nextEvidenceWorkPackages: [],
        mutationBoundary: {
          writesTaskDependencies: false,
          writesPlanDates: false,
          writesSeed: false,
          writesBaseline: false,
          writesCriticalPathFacts: false,
          writesAccelerationDraft: false,
        },
        boundaryPolicy: ['product_outcome_closeout_does_not_grant_auto_materialization'],
      } as any,
      progress: {
        source: 'construction_organization_product_outcome_closeout_progress',
        status: 'product_outcome_closeout_incomplete',
        canDeclareConstructionOrganizationProductOutcomeCloseout: false,
        supportedBusinessTypeCount: 11,
        precisionReplayReadyBusinessTypeCount: 11,
        runtimeOutcomeReadyBusinessTypeCount: 0,
        readyBusinessTypes: [],
        missingBusinessTypes: ['renovation'],
        topMissingReasons: ['renovation:runtime_closeout_claim_by_business_type_required'],
        nextEvidenceActions: ['collect_runtime_closeout_claim_for_business_type'],
        nextEvidenceWorkItemCount: 1,
        nextEvidenceWorkPackageCount: 1,
        prefillableWorkPackageCount: 0,
        blockedWorkPackageCount: 1,
        useCaseCoverage: {
          newProjectPlanning: { readyBusinessTypeCount: 0, missingBusinessTypes: ['renovation'] },
          startingLineOnboarding: { readyBusinessTypeCount: 0, missingBusinessTypes: ['renovation'] },
          accelerationRecovery: { readyBusinessTypeCount: 0, missingBusinessTypes: ['renovation'] },
        },
        mutationBoundary: {
          writesTaskDependencies: false,
          writesPlanDates: false,
          writesSeed: false,
          writesBaseline: false,
          writesCriticalPathFacts: false,
          writesAccelerationDraft: false,
        },
        boundaryPolicy: ['progress_projection_is_read_only'],
      } as any,
    }

    const report = await buildConstructionOrganizationCloseoutLiveDiagnosticReport({
      companyId: 'company-1',
      listDrafts,
      buildCloseoutArtifacts: () => artifacts,
      now: new Date('2026-06-25T10:00:00.000Z'),
    })

    expect(report.runtimeAnchorCandidateSummaries).toEqual([
      expect.objectContaining({
        businessType: 'renovation',
        status: 'candidate_anchor_incomplete',
        nextAnchorActions: ['attach_project_anchor_to_plan_network_candidate'],
      }),
    ])
    expect(report.manualConflictReviewWorkItems).toEqual([])
  })

  it('marks live query failures as data-source failures instead of product evidence gaps', async () => {
    const error = new Error('(ENOTFOUND) tenant/user workbuddy_runtime_login.wwdrkjnbvcbfytwnnyvs not found') as Error & {
      code?: string
    }
    error.code = 'XX000'
    const listDrafts = vi.fn().mockRejectedValue(error)

    const report = await buildConstructionOrganizationCloseoutLiveDiagnosticReport({
      companyId: 'company-1',
      listDrafts,
      now: new Date('2026-06-24T10:00:00.000Z'),
    })

    expect(report.status).toBe('fail')
    expect(report.runtimeEvidenceGap).toEqual(expect.objectContaining({
      dataSourceStatus: 'query_failed',
      dataSourceErrorCode: 'XX000',
      missingRuntimeCloseoutEvidence: null,
    }))
    expect(report.checks.productOutcomeCloseout.topMissingReasons).toEqual([
      'live_construction_organization_closeout_diagnostic_query_failed',
    ])
    expect(report.workbenchOperationSuggestionReport).toBeNull()
    expect(report.dataSourceDiagnostic).toEqual(expect.objectContaining({
      source: 'construction_organization_closeout_data_source_diagnostic',
      status: 'query_failed',
      failureCategory: 'runtime_database_role_missing',
      canUseAsProductCloseoutEvidence: false,
      operatorActions: expect.arrayContaining([
        'fix_runtime_database_role_or_db_connection_string',
        'rerun_live_construction_organization_closeout_diagnostic',
      ]),
      boundaryPolicy: expect.arrayContaining([
        'data_source_diagnostic_is_not_runtime_closeout_evidence',
      ]),
    }))
    expect(report.errorMessage).toContain('tenant/user')
  })

  it('classifies live query read timeout as a temporary database availability failure', async () => {
    const listDrafts = vi.fn().mockRejectedValue(new Error('Query read timeout'))

    const report = await buildConstructionOrganizationCloseoutLiveDiagnosticReport({
      companyId: 'company-1',
      listDrafts,
      now: new Date('2026-06-25T10:00:00.000Z'),
    })

    expect(report.status).toBe('fail')
    expect(report.dataSourceDiagnostic).toEqual(expect.objectContaining({
      status: 'query_failed',
      failureCategory: 'database_temporarily_unavailable',
      operatorActions: expect.arrayContaining([
        'verify_supabase_database_availability',
        'rerun_live_construction_organization_closeout_diagnostic',
      ]),
    }))
    expect(report.nextEvidenceWorkPackages).toEqual([])
    expect(report.runtimeAnchorCandidateSummaries).toEqual([])
    expect(report.manualConflictReviewWorkItems).toEqual([])
  })

  it('classifies nested DNS lookup failures as network failures instead of unknown query failures', async () => {
    const cause = Object.assign(new Error('getaddrinfo ENOTFOUND db.wwdrkjnbvcbfytwnnyvs.supabase.co'), {
      code: 'ENOTFOUND',
      hostname: 'db.wwdrkjnbvcbfytwnnyvs.supabase.co',
    })
    const error = new Error('Connection terminated due to connection timeout') as Error & { cause?: unknown }
    error.cause = cause
    const listDrafts = vi.fn().mockRejectedValue(error)

    const report = await buildConstructionOrganizationCloseoutLiveDiagnosticReport({
      companyId: 'company-1',
      listDrafts,
      now: new Date('2026-06-25T11:35:00.000Z'),
    })

    expect(report.status).toBe('fail')
    expect(report.dataSourceDiagnostic).toEqual(expect.objectContaining({
      status: 'query_failed',
      failureCategory: 'network_or_dns_failure',
      operatorActions: expect.arrayContaining([
        'verify_network_dns_and_pooler_endpoint',
        'rerun_live_construction_organization_closeout_diagnostic',
      ]),
    }))
    expect(report.nextEvidenceWorkPackages).toEqual([])
    expect(report.runtimeAnchorCandidateSummaries).toEqual([])
    expect(report.manualConflictReviewWorkItems).toEqual([])
  })

  it('closes the database pool after CLI execution so live diagnostics do not hang', async () => {
    const closeDatabasePool = vi.fn().mockResolvedValue(undefined)
    const writeOutput = vi.fn()
    const buildReport = vi.fn().mockResolvedValue({
      reportCode: 'construction_organization_closeout_live_diagnostic',
      status: 'blocked',
      companyId: 'company-1',
      projectId: null,
      checks: {
        productOutcomeCloseout: {
          supportedBusinessTypeCount: 11,
          runtimeOutcomeReadyBusinessTypeCount: 0,
          missingBusinessTypes: ['general_civil'],
          topMissingReasons: ['general_civil:runtime_closeout_claim_by_business_type_required'],
          nextEvidenceActions: ['collect_runtime_closeout_claim_for_business_type'],
        },
      },
      nextEvidenceWorkPackages: [],
      runtimeAnchorCandidateSummaries: [],
      manualConflictReviewWorkItems: [{
        source: 'construction_organization_manual_conflict_review_work_item',
        businessType: 'general_civil',
        projectId: 'project-1',
        draftNetworkKey: 'draft-conflict',
        optionId: 'option-conflict',
        status: 'manual_conflict_review_required',
        readiness: 'conflict_review_required',
        evaluationStatus: 'evaluation_ready',
        reviewPrompt: 'review prompt',
        reviewChecklist: ['review checklist'],
        conflictReasonCodes: ['candidate_network_conflicts_with_current_generated_row_dates'],
        proposedDependencyEdgeCount: 16,
        sampleProposedDependencyEdges: [],
        allowedDecisions: ['approved_ready_for_replay', 'rejected_needs_plan_date_adjustment'],
        recommendedNextAction: 'complete_manual_conflict_review_before_manual_review_approval',
        canSubmitControlledOperation: false,
        missingRequiredFields: ['manualConflictReviewDecision'],
        operationPayload: {
          action: 'manual_conflict_review',
          assetType: 'construction_organization_plan_network',
          evidenceAction: 'complete_manual_conflict_review_before_manual_review_approval',
          businessType: 'general_civil',
          companyId: 'company-1',
          projectId: 'project-1',
          draftNetworkKey: 'draft-conflict',
          optionId: 'option-conflict',
        },
        mutationBoundary: {
          writesTaskDependencies: false,
          writesPlanDates: false,
          writesSeed: false,
          writesBaseline: false,
          writesCriticalPathFacts: false,
          writesAccelerationDraft: false,
        },
        boundaryPolicy: ['manual_conflict_review_work_item_is_read_only'],
      }],
      workbenchOperationSuggestionReport: null,
      dataSourceDiagnostic: {
        source: 'construction_organization_closeout_data_source_diagnostic',
        status: 'query_failed',
        failureCategory: 'runtime_database_role_missing',
        canUseAsProductCloseoutEvidence: false,
        operatorActions: [
          'fix_runtime_database_role_or_db_connection_string',
          'rerun_live_construction_organization_closeout_diagnostic',
        ],
        boundaryPolicy: [
          'data_source_diagnostic_is_not_runtime_closeout_evidence',
        ],
      },
      outputFile: null,
    })

    await runConstructionOrganizationCloseoutLiveDiagnosticCli([
      '--company-id',
      'company-1',
    ], {
      buildReport,
      closeDatabasePool,
      writeOutput,
    })

    expect(buildReport).toHaveBeenCalledWith(expect.objectContaining({
      companyId: 'company-1',
    }))
    expect(closeDatabasePool).toHaveBeenCalledTimes(1)
    expect(writeOutput).toHaveBeenCalledWith(expect.stringContaining('"reportCode"'))
    expect(writeOutput).toHaveBeenCalledWith(expect.stringContaining('"dataSourceDiagnostic"'))
    expect(writeOutput).toHaveBeenCalledWith(expect.stringContaining('"runtime_database_role_missing"'))
    expect(writeOutput).toHaveBeenCalledWith(expect.stringContaining('"manualConflictReviewWorkItemCount": 1'))
    expect(writeOutput).toHaveBeenCalledWith(expect.stringContaining('"proposedDependencyEdgeCount": 16'))
    expect(writeOutput).not.toHaveBeenCalledWith(expect.stringContaining('"operationPayload"'))
    expect(writeOutput).not.toHaveBeenCalledWith(expect.stringContaining('"reviewChecklist"'))
  })
})
