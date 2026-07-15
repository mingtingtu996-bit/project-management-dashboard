import { describe, expect, it } from 'vitest'
import {
  buildConstructionOrganizationPlanNetworkDraftFromReviewPackageItem,
  buildConstructionOrganizationPlanNetworkManualConflictReviewDecision,
  buildConstructionOrganizationPlanNetworkManualReviewHandoff,
  buildConstructionOrganizationPlanNetworkManualReviewApproval,
  canSubmitConstructionOrganizationPlanNetworkManualReviewHandoff,
  listConstructionOrganizationPlanNetworkDrafts,
  persistConstructionOrganizationPlanNetworkManualConflictReviewDecision,
  persistConstructionOrganizationPlanNetworkManualReviewApproval,
  persistConstructionOrganizationPlanNetworkManualReviewHandoff,
} from '../services/constructionOrganizationPlanNetworkDraftService.js'
import type { ConstructionOrganizationMaterializationReviewPackageItem } from '../services/constructionOrganizationMaterializationReviewPackageService.js'

function buildReviewPackageItem(overrides: Partial<ConstructionOrganizationMaterializationReviewPackageItem> = {}): ConstructionOrganizationMaterializationReviewPackageItem {
  return {
    candidateEventId: 'event-ready',
    assetKey: 'construction_organization.plan_option.option-ready',
    sourceModule: 'constructionOrganizationScenarioGovernanceService',
    companyId: '10000000-0000-4000-8000-000000000001',
    projectId: '00000000-0000-4000-8000-000000000001',
    eventStatus: 'review_required',
    runtimeEffect: 'candidate_only',
    createdAt: '2026-06-21T12:00:00.000Z',
    updatedAt: '2026-06-21T12:00:00.000Z',
    optionId: 'option-ready',
    selectedScenarioIds: ['pile_before_excavation', 'shared_basement_first_then_tower'],
    reviewPackage: {
      source: 'construction_organization_candidate_materialization_review_package',
      packageBasis: 'manual_review_package_from_generated_row_preview_edges',
      optionId: 'option-ready',
      status: 'ready_for_manual_review',
      allowManualReview: true,
      proposedDependencyEdgeCount: 2,
      blockedReasons: [],
      proposedDependencyEdges: [
        {
          fromGeneratedRowId: 'row-foundation',
          toGeneratedRowId: 'row-earthwork',
          dependencyType: 'FS',
          lagDays: 0,
          intent: 'pile_before_earthwork_bulk_excavation',
          fromVirtualNodeId: 'foundation-work',
          toVirtualNodeId: 'earthwork-work',
          operation: 'propose_create_dependency',
          writesTaskDependencies: false,
        },
        {
          fromGeneratedRowId: 'row-basement',
          toGeneratedRowId: 'row-tower',
          dependencyType: 'SS',
          lagDays: 7,
          intent: 'tower_lane_staggered_release',
          fromVirtualNodeId: 'basement-core',
          toVirtualNodeId: 'tower-lane',
          operation: 'propose_create_dependency',
          writesTaskDependencies: false,
        },
      ],
      reviewRequired: true,
      writesTaskDependencies: false,
      writesPlanDates: false,
      writesCriticalPathFacts: false,
    },
    materializationDecision: {
      decision: 'ready_for_manual_materialization',
      allowManualMaterialization: true,
    },
    candidateDependencyPreview: {
      source: 'construction_organization_candidate_dependency_preview',
      materializationReadiness: {
        readiness: 'ready_for_manual_materialization_preview',
      },
      previewEdgeCount: 2,
      unresolvedEdgeCount: 0,
      writesTaskDependencies: false,
      writesPlanDates: false,
      writesCriticalPathFacts: false,
    },
    engineEvaluationSummary: {
      source: 'construction_organization_plan_option_engine_evaluation_summary',
      e1: {
        output: 'generated_row_reference_duration_projection',
        selectedWorkPackageCount: 2,
      },
      e3: {
        projectDurationDays: 38,
        criticalNodeCount: 2,
        edgeCount: 2,
      },
      e5: {
        recoveryFactorHint: 1.08,
        recoverableSpanDays: 5,
      },
    },
    generatedRowReferenceDurationEvidence: {
      source: 'generated_wbs_row_reference_duration_projection',
      matchedReferenceRowCount: 4,
      totalPlanReferenceDays: 42,
      totalContextualReferenceDays: 45,
      totalRecommendedDurationDays: 44,
      writesReferenceDuration: false,
      writesPlanDates: false,
      writesSeed: false,
    },
    generatedRowNetworkEvaluation: {
      source: 'generated_wbs_row_candidate_network_cpm',
      projectedNetworkSpanDays: 38,
      previewEdgeCount: 2,
      unresolvedEdgeCount: 0,
      criticalGeneratedRowIds: ['row-foundation', 'row-earthwork'],
      materializationStatus: 'fully_mapped_read_only',
      writesTaskDependencies: false,
      writesPlanDates: false,
      writesCriticalPathFacts: false,
    },
    useCaseEvaluations: {
      newProjectPlanning: {
        useCase: 'new_project_planning',
        optionScore: 76,
        actionability: 'actionable_candidate',
        rankBasis: ['generated_row_projection_alignment'],
        writesTaskDependencies: false,
        writesPlanDates: false,
        writesSeed: false,
      },
      startingLineOnboarding: {
        useCase: 'starting_line_onboarding',
        optionScore: 64,
        actionability: 'evidence_only',
        rankBasis: ['starting_line_decision_locked'],
        writesTaskDependencies: false,
        writesPlanDates: false,
        writesSeed: false,
      },
      accelerationRecovery: {
        useCase: 'acceleration_recovery',
        optionScore: 82,
        recoveryFactorHint: 1.08,
        e5RecoverableSpanDays: 5,
        actionability: 'actionable_candidate',
        writesTaskDependencies: false,
        writesPlanDates: false,
        writesSeed: false,
      },
    },
    factBasis: {
      businessType: 'hospital',
    },
    mutationBoundary: {
      writesTaskDependencies: false,
      writesPlanDates: false,
      writesSeed: false,
      writesBaseline: false,
      writesCriticalPathFacts: false,
    },
    ...overrides,
  }
}

const PRODUCT_ENTRY_USE_CASES = ['newProjectPlanning', 'startingLineOnboarding', 'accelerationRecovery'] as const
const RUNTIME_ENGINE_CODES = ['standard_duration_reference', 'critical_path_cpm', 'schedule_acceleration_target'] as const

function readConstructionOrganizationAssetPattern(queryParams: unknown[]) {
  return queryParams
    .map((param) => String(param ?? ''))
    .find((param) => param.startsWith('construction_organization.')) ?? ''
}

function buildFullRuntimeEvidenceQueryExec(params: {
  readyItem: ConstructionOrganizationMaterializationReviewPackageItem
  readyDraft: ReturnType<typeof buildConstructionOrganizationPlanNetworkDraftFromReviewPackageItem>
  publicationKey: string
}) {
  const { readyItem, readyDraft, publicationKey } = params
  const identityForUseCase = (useCase: typeof PRODUCT_ENTRY_USE_CASES[number]) => ({
    projectId: '00000000-0000-4000-8000-000000000001',
    businessType: 'hospital',
    draftNetworkKey: readyDraft.draftNetworkKey,
    optionId: 'option-ready',
    publicationKey,
    useCase,
  })
  return async <T = Record<string, unknown>>(sql: string, queryParams: unknown[] = []): Promise<T[]> => {
    const assetPattern = readConstructionOrganizationAssetPattern(queryParams)
    if (assetPattern.startsWith('construction_organization.plan_network_handoff.')) {
      return [{
        id: 'handoff-event-ready',
        asset_key: 'construction_organization.plan_network_handoff.ready',
        source_module: 'constructionOrganizationPlanNetworkDraftService.manualReviewHandoff',
        event_status: 'review_required',
        runtime_effect: 'candidate_only',
        created_at: '2026-06-21T14:00:00.000Z',
        updated_at: '2026-06-21T14:00:00.000Z',
        candidate_payload: {
          draftNetworkKey: readyDraft.draftNetworkKey,
          originalCandidateEventId: 'event-ready',
          optionId: 'option-ready',
          selectedScenarioIds: readyItem.selectedScenarioIds,
          reviewPackage: {
            reviewOperation: 'manual_review_dependency_proposal',
            proposedDependencyEdges: readyItem.reviewPackage.proposedDependencyEdges,
            writesTaskDependencies: false,
            writesPlanDates: false,
            writesCriticalPathFacts: false,
          },
          runtimeMutationBoundary: {
            writesTaskDependencies: false,
            writesPlanDates: false,
            writesSeed: false,
            writesBaseline: false,
            writesCriticalPathFacts: false,
            writesAccelerationDraft: false,
          },
        },
      }] as T[]
    }
    if (assetPattern.startsWith('construction_organization.plan_network_approval.')) {
      return [{
        id: 'approval-event-ready',
        asset_key: 'construction_organization.plan_network_approval.ready',
        source_module: 'constructionOrganizationPlanNetworkDraftService.manualReviewApproval',
        event_status: 'approved',
        runtime_effect: 'candidate_only',
        created_at: '2026-06-21T15:00:00.000Z',
        updated_at: '2026-06-21T15:00:00.000Z',
        candidate_payload: {
          draftNetworkKey: readyDraft.draftNetworkKey,
          handoffCandidateEventId: 'handoff-event-ready',
          approvalDecision: 'approved_for_release_exit_preparation',
          runtimeMutationBoundary: {
            writesTaskDependencies: false,
            writesPlanDates: false,
            writesSeed: false,
            writesBaseline: false,
            writesCriticalPathFacts: false,
            writesAccelerationDraft: false,
          },
        },
      }] as T[]
    }
    if (assetPattern.startsWith('construction_organization.plan_network_release_exit_handoff.')) {
      return [{
        id: 'release-exit-handoff-event-ready',
        asset_key: 'construction_organization.plan_network_release_exit_handoff.ready',
        source_module: 'constructionOrganizationPlanNetworkDraftService.releaseExitHandoff',
        event_status: 'review_required',
        runtime_effect: 'candidate_only',
        created_at: '2026-06-21T16:00:00.000Z',
        updated_at: '2026-06-21T16:00:00.000Z',
        candidate_payload: {
          draftNetworkKey: readyDraft.draftNetworkKey,
          originalCandidateEventId: 'event-ready',
          handoffCandidateEventId: 'handoff-event-ready',
          approvalCandidateEventId: 'approval-event-ready',
          optionId: 'option-ready',
          selectedScenarioIds: readyItem.selectedScenarioIds,
          releaseRecordTarget: publicationKey,
          rollbackTarget: 'construction-org-plan-network-rollback:project-1',
          consumerVerificationRefs: ['gantt.taskDependencyReadModel'],
          impactMonitoringRefs: ['constructionOrganizationPlanNetworkImpactMonitor'],
          rollbackWriterRefs: ['constructionOrganizationPlanNetworkDomainWriter.rollback'],
          proposedDependencyEdges: readyItem.reviewPackage.proposedDependencyEdges,
          runtimeMutationBoundary: {
            writesTaskDependencies: false,
            writesPlanDates: false,
            writesSeed: false,
            writesBaseline: false,
            writesCriticalPathFacts: false,
            writesAccelerationDraft: false,
          },
        },
      }] as T[]
    }
    if (String(sql).includes('FROM public.construction_organization_plan_network_runtime_publications')) {
      return [{
        publication_key: publicationKey,
        project_id: '00000000-0000-4000-8000-000000000001',
        draft_network_key: readyDraft.draftNetworkKey,
        release_handoff_candidate_event_id: 'release-exit-handoff-event-ready',
        runtime_publication_status: 'runtime_published',
        applied_dependency_count: 2,
        rollback_target: 'construction-org-plan-network-rollback:project-1',
        published_at: '2026-06-22T02:00:00.000Z',
      }] as T[]
    }
    if (String(sql).includes('FROM public.runtime_consumer_observations')) {
      return PRODUCT_ENTRY_USE_CASES.map((useCase, index) => ({
        asset_key: 'construction_organization_plan_network',
        publication_key: publicationKey,
        consumer_key: useCase === 'accelerationRecovery' ? 'scheduleAccelerationRuntimeService' : 'projectWizard',
        consumer_surface: useCase === 'accelerationRecovery' ? 'schedule_acceleration_runtime' : 'project_wizard_commit',
        observation_status: 'observed',
        observation_context: identityForUseCase(useCase),
        observed_at: `2026-06-22T02:0${index + 5}:00.000Z`,
      })) as T[]
    }
    if (String(sql).includes('FROM public.construction_organization_plan_network_runtime_events')) {
      return PRODUCT_ENTRY_USE_CASES.flatMap((useCase, index) => [{
        event_type: 'impact_monitoring',
        event_status: 'monitoring_passed',
        source_publication_key: publicationKey,
        event_payload: identityForUseCase(useCase),
        executed_at: `2026-06-22T03:${String(index).padStart(2, '0')}:00.000Z`,
      }, {
        event_type: 'rollback_execution',
        event_status: 'rollback_executed',
        source_publication_key: publicationKey,
        event_payload: identityForUseCase(useCase),
        executed_at: `2026-06-22T03:${String(index + 10).padStart(2, '0')}:00.000Z`,
      }]) as T[]
    }
    if (String(sql).includes('FROM public.duration_plan_network_outcomes')) {
      return PRODUCT_ENTRY_USE_CASES.map((useCase) => ({
        asset_key: 'construction_organization_plan_network',
        publication_key: publicationKey,
        outcome_status: 'accepted',
        outcome_ref: `network_outcomes:${publicationKey}:${useCase}`,
        learning_scope: 'project',
        metadata: identityForUseCase(useCase),
        observed_at: '2026-06-22T03:20:00.000Z',
      })) as T[]
    }
    if (String(sql).includes('FROM public.duration_algorithm_accuracy_events')) {
      return PRODUCT_ENTRY_USE_CASES.flatMap((useCase) => RUNTIME_ENGINE_CODES.map((engineCode, index) => ({
        id: `accuracy-${engineCode}-${useCase}`,
        engine_code: engineCode,
        backtest_status: 'backtested',
        absolute_error_days: index,
        prediction_context: {
          assetKey: 'construction_organization_plan_network',
          ...identityForUseCase(useCase),
        },
        actual_context: {
          assetKey: 'construction_organization_plan_network',
          ...identityForUseCase(useCase),
        },
        backtested_at: `2026-06-22T04:0${index}:00.000Z`,
      }))) as T[]
    }
    if (String(sql).includes('FROM public.recommendation_actions')) {
      return [{
        project_id: '00000000-0000-4000-8000-000000000001',
        recommendation_kind: 'construction_organization_plan_network',
        recommendation_key: `construction_organization_plan_network:${publicationKey}:${readyDraft.draftNetworkKey}:option-ready:newProjectPlanning`,
        action_type: 'adopted',
        adopted_at: '2026-06-22T06:00:00.000Z',
        adopted_by: 'user-1',
        action_context: {
          ...identityForUseCase('newProjectPlanning'),
          selectedScenarioIds: readyItem.selectedScenarioIds,
          decisionAction: 'adopted',
          writesRuntimeDirectly: false,
          writesFactDirectly: false,
          writesTaskDependencies: false,
          writesPlanDates: false,
          writesSeed: false,
          writesBaseline: false,
          writesCriticalPathFacts: false,
          writesAccelerationDraft: false,
        },
      }] as T[]
    }
    if (assetPattern.startsWith('construction_organization.plan_option.')) {
      return [{
        id: 'event-ready',
        asset_key: 'construction_organization.plan_option.option-ready',
        source_module: 'constructionOrganizationScenarioGovernanceService',
        company_id: '10000000-0000-4000-8000-000000000001',
        project_id: '00000000-0000-4000-8000-000000000001',
        event_status: 'review_required',
        runtime_effect: 'candidate_only',
        candidate_payload: {
          factBasis: readyItem.factBasis,
          option: {
            optionId: 'option-ready',
            selectedScenarioIds: readyItem.selectedScenarioIds,
            engineEvaluationSummary: readyItem.engineEvaluationSummary,
            useCaseEvaluations: readyItem.useCaseEvaluations,
            generatedRowProjection: {
              materializationReviewPackage: readyItem.reviewPackage,
              generatedRowReferenceDurationEvidence: readyItem.generatedRowReferenceDurationEvidence,
              generatedRowNetworkEvaluation: readyItem.generatedRowNetworkEvaluation,
            },
          },
        },
      }] as T[]
    }
    return [] as T[]
  }
}

describe('constructionOrganizationPlanNetworkDraftService', () => {
  it('builds a deterministic read-only draft network from ready review package edges', () => {
    const item = buildReviewPackageItem()
    const draft = buildConstructionOrganizationPlanNetworkDraftFromReviewPackageItem(item)
    const rerun = buildConstructionOrganizationPlanNetworkDraftFromReviewPackageItem(item)

    expect(draft).toEqual(expect.objectContaining({
      source: 'construction_organization_plan_network_draft',
      optionId: 'option-ready',
      businessType: 'hospital',
      candidateEventId: 'event-ready',
      readiness: 'ready_for_replay',
      edgeCount: 2,
      nodeCount: 4,
      draftNetworkKey: rerun.draftNetworkKey,
    }))
    expect(draft.nodes.map((node) => node.generatedRowId).sort()).toEqual([
      'row-basement',
      'row-earthwork',
      'row-foundation',
      'row-tower',
    ])
    expect(draft.edges).toEqual([
      expect.objectContaining({
        fromGeneratedRowId: 'row-foundation',
        toGeneratedRowId: 'row-earthwork',
        dependencyType: 'FS',
        lagDays: 0,
        writesTaskDependencies: false,
      }),
      expect.objectContaining({
        fromGeneratedRowId: 'row-basement',
        toGeneratedRowId: 'row-tower',
        dependencyType: 'SS',
        lagDays: 7,
        writesTaskDependencies: false,
      }),
    ])
    expect(draft.mutationBoundary).toEqual({
      writesTaskDependencies: false,
      writesPlanDates: false,
      writesSeed: false,
      writesBaseline: false,
      writesCriticalPathFacts: false,
      writesAccelerationDraft: false,
    })
    expect(draft.replayRequirements).toEqual(expect.arrayContaining([
      'replay_e1_reference_duration_against_draft_nodes',
      'replay_e3_cpm_against_draft_edges',
      'replay_e5_recovery_against_draft_network_before_any_materialization',
    ]))
    expect(draft.evaluationEvidence).toEqual(expect.objectContaining({
      source: 'construction_organization_plan_network_draft_evaluation_evidence',
      evaluationStatus: 'evaluation_ready',
      e1: expect.objectContaining({
        matchedReferenceRowCount: 4,
        totalPlanReferenceDays: 42,
        writesReferenceDuration: false,
      }),
      e3: expect.objectContaining({
        projectedNetworkSpanDays: 38,
        previewEdgeCount: 2,
        unresolvedEdgeCount: 0,
        writesCriticalPathFacts: false,
      }),
      e5: expect.objectContaining({
        optionScore: 82,
        recoveryFactorHint: 1.08,
        e5RecoverableSpanDays: 5,
        writesAccelerationDraft: false,
      }),
    }))
    expect(draft.useCaseEvaluationEvidence).toEqual(expect.objectContaining({
      newProjectPlanning: expect.objectContaining({
        optionScore: 76,
        actionability: 'actionable_candidate',
      }),
      startingLineOnboarding: expect.objectContaining({
        optionScore: 64,
        actionability: 'evidence_only',
      }),
      accelerationRecovery: expect.objectContaining({
        optionScore: 82,
        e5RecoverableSpanDays: 5,
      }),
    }))
  })

  it('keeps evidence-only packages blocked from replayable draft materialization', () => {
    const draft = buildConstructionOrganizationPlanNetworkDraftFromReviewPackageItem(buildReviewPackageItem({
      candidateEventId: 'event-evidence',
      optionId: 'option-evidence',
      reviewPackage: {
        source: 'construction_organization_candidate_materialization_review_package',
        packageBasis: 'manual_review_package_from_generated_row_preview_edges',
        optionId: 'option-evidence',
        status: 'evidence_only',
        allowManualReview: false,
        proposedDependencyEdgeCount: 0,
        blockedReasons: ['evidence_only_candidate'],
        proposedDependencyEdges: [],
        reviewRequired: true,
        writesTaskDependencies: false,
        writesPlanDates: false,
        writesCriticalPathFacts: false,
      },
    }))

    expect(draft).toEqual(expect.objectContaining({
      readiness: 'evidence_only',
      edgeCount: 0,
      nodeCount: 0,
      blockedReasons: expect.arrayContaining(['evidence_only_candidate', 'review_package_not_ready_for_manual_review']),
    }))
    expect(draft.mutationBoundary.writesTaskDependencies).toBe(false)
  })

  it('surfaces violation-blocked packages as conflict review drafts without making them replay-ready', () => {
    const draft = buildConstructionOrganizationPlanNetworkDraftFromReviewPackageItem(buildReviewPackageItem({
      candidateEventId: 'event-conflict',
      optionId: 'option-conflict',
      reviewPackage: {
        source: 'construction_organization_candidate_materialization_review_package',
        packageBasis: 'manual_review_package_from_generated_row_preview_edges',
        optionId: 'option-conflict',
        status: 'blocked_by_violations',
        allowManualReview: false,
        proposedDependencyEdgeCount: 2,
        blockedReasons: ['candidate_preview_edges_violate_generated_row_dates'],
        proposedDependencyEdges: [
          {
            fromGeneratedRowId: 'row-foundation',
            toGeneratedRowId: 'row-earthwork',
            dependencyType: 'FS',
            lagDays: 0,
            intent: 'pile_before_earthwork_bulk_excavation',
            fromVirtualNodeId: 'foundation-work',
            toVirtualNodeId: 'earthwork-work',
            operation: 'propose_create_dependency',
            writesTaskDependencies: false,
          },
          {
            fromGeneratedRowId: 'row-earthwork',
            toGeneratedRowId: 'row-basement',
            dependencyType: 'FS',
            lagDays: 0,
            intent: 'pit_bottom_release_before_basement',
            fromVirtualNodeId: 'earthwork-work',
            toVirtualNodeId: 'basement-core',
            operation: 'propose_create_dependency',
            writesTaskDependencies: false,
          },
        ],
        conflictEvidence: [
          {
            edgeId: 'conflict-edge-1',
            fromGeneratedRowId: 'row-foundation',
            toGeneratedRowId: 'row-earthwork',
            dependencyType: 'FS',
            lagDays: 0,
            intent: 'pile_before_earthwork_bulk_excavation',
            fromVirtualNodeId: 'foundation-work',
            toVirtualNodeId: 'earthwork-work',
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
          },
        ],
        reviewRequired: true,
        writesTaskDependencies: false,
        writesPlanDates: false,
        writesCriticalPathFacts: false,
      },
    }))

    expect(draft).toEqual(expect.objectContaining({
      readiness: 'conflict_review_required',
      edgeCount: 2,
      reviewPackageStatus: 'blocked_by_violations',
      blockedReasons: expect.arrayContaining([
        'candidate_preview_edges_violate_generated_row_dates',
        'candidate_network_conflicts_with_current_generated_row_dates',
        'requires_manual_conflict_review_before_replay',
      ]),
    }))
    expect(draft.manualConflictReviewPackage).toEqual(expect.objectContaining({
      source: 'construction_organization_plan_network_manual_conflict_review_package',
      status: 'manual_conflict_review_required',
      proposedDependencyEdgeCount: 2,
      recommendedNextAction: 'complete_manual_conflict_review_before_manual_review_approval',
      conflictReasonCodes: expect.arrayContaining([
        'candidate_preview_edges_violate_generated_row_dates',
        'candidate_network_conflicts_with_current_generated_row_dates',
        'requires_manual_conflict_review_before_replay',
      ]),
      sampleProposedDependencyEdges: expect.arrayContaining([
        expect.objectContaining({
          fromGeneratedRowId: 'row-foundation',
          toGeneratedRowId: 'row-earthwork',
          writesTaskDependencies: false,
        }),
      ]),
      conflictEvidenceCount: 1,
      sampleConflictEvidence: [
        expect.objectContaining({
          fromGeneratedRowId: 'row-foundation',
          toGeneratedRowId: 'row-earthwork',
          dependencyType: 'FS',
          reason: 'fs_predecessor_finishes_after_successor_start',
          fromWindow: expect.objectContaining({
            plannedEndDate: '2026-01-20',
          }),
          toWindow: expect.objectContaining({
            plannedStartDate: '2026-01-12',
          }),
          writesTaskDependencies: false,
          writesPlanDates: false,
        }),
      ],
      writesTaskDependencies: false,
      writesPlanDates: false,
    }))
    expect(draft.manualConflictReviewPackage.boundaryPolicy).toEqual(expect.arrayContaining([
      'manual_conflict_review_package_is_read_only',
      'manual_conflict_review_package_does_not_auto_approve_candidate',
    ]))

    const handoff = buildConstructionOrganizationPlanNetworkManualReviewHandoff({ draft })
    expect(handoff).toEqual(expect.objectContaining({
      status: 'manual_review_handoff_ready',
      proposedDependencyEdgeCount: 2,
      writesTaskDependencies: false,
      writesPlanDates: false,
    }))
    expect(handoff.boundaryPolicy).toEqual(expect.arrayContaining([
      'manual_review_handoff_is_not_runtime_materialization',
    ]))

    const approval = buildConstructionOrganizationPlanNetworkManualReviewApproval({
      draft: {
        ...draft,
        manualReviewHandoff: {
          source: 'construction_organization_plan_network_manual_review_handoff_projection',
          candidateEventId: 'handoff-conflict',
          assetKey: 'construction_organization.plan_network_handoff.handoff-conflict',
          sourceModule: 'constructionOrganizationPlanNetworkDraftService.manualReviewHandoff',
          eventStatus: 'review_required',
          runtimeEffect: 'candidate_only',
          createdAt: '2026-06-21T13:00:00.000Z',
          updatedAt: '2026-06-21T13:00:00.000Z',
          draftNetworkKey: draft.draftNetworkKey,
          originalCandidateEventId: draft.candidateEventId,
          optionId: draft.optionId,
          selectedScenarioIds: draft.selectedScenarioIds,
          requestedByUserId: 'user-1',
          executedAt: '2026-06-21T13:00:00.000Z',
          reviewOperation: 'manual_review_dependency_proposal',
          proposedDependencyEdgeCount: draft.edgeCount,
          writesTaskDependencies: false,
          writesPlanDates: false,
          writesSeed: false,
          writesBaseline: false,
          writesCriticalPathFacts: false,
          writesAccelerationDraft: false,
        },
      },
    })
    expect(approval.status).toBe('manual_review_approval_blocked')
    expect(approval.reasons).toEqual(expect.arrayContaining([
      'draft_not_ready_for_replay',
      'candidate_network_conflicts_with_current_generated_row_dates',
    ]))
  })

  it('does not treat generated-row-carrier readiness evidence as a manual-review handoff blocker', () => {
    expect(canSubmitConstructionOrganizationPlanNetworkManualReviewHandoff({
      readiness: 'conflict_review_required',
      blockedReasons: [
        'all_virtual_dependency_edges_have_generated_row_carriers',
        'candidate_preview_edges_violate_generated_row_dates',
        'candidate_network_conflicts_with_current_generated_row_dates',
        'requires_manual_conflict_review_before_replay',
      ],
    })).toBe(true)

    expect(canSubmitConstructionOrganizationPlanNetworkManualReviewHandoff({
      readiness: 'conflict_review_required',
      blockedReasons: [
        'all_virtual_dependency_edges_have_generated_row_carriers',
        'unresolved_virtual_dependency_edges',
      ],
    })).toBe(false)
  })

  it('persists a conflict-review manual handoff when generated-row-carrier evidence is present', async () => {
    const draft = buildConstructionOrganizationPlanNetworkDraftFromReviewPackageItem(buildReviewPackageItem({
      reviewPackage: {
        source: 'construction_organization_candidate_materialization_review_package',
        packageBasis: 'manual_review_package_from_generated_row_preview_edges',
        optionId: 'option-conflict-ready',
        status: 'blocked_by_violations',
        allowManualReview: true,
        proposedDependencyEdgeCount: 1,
        blockedReasons: [
          'all_virtual_dependency_edges_have_generated_row_carriers',
          'candidate_preview_edges_violate_generated_row_dates',
          'candidate_network_conflicts_with_current_generated_row_dates',
          'requires_manual_conflict_review_before_replay',
        ],
        proposedDependencyEdges: [
          {
            fromGeneratedRowId: 'row-foundation',
            toGeneratedRowId: 'row-earthwork',
            dependencyType: 'FS',
            lagDays: 0,
            intent: 'pile_before_earthwork_bulk_excavation',
            fromVirtualNodeId: 'foundation-work',
            toVirtualNodeId: 'earthwork-work',
            operation: 'propose_create_dependency',
            writesTaskDependencies: false,
          },
        ],
        reviewRequired: true,
        writesTaskDependencies: false,
        writesPlanDates: false,
        writesCriticalPathFacts: false,
      },
    }))
    const calls: Array<{ sql: string, params: unknown[] }> = []
    const queryExec = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> => {
      calls.push({ sql, params })
      return [{ id: 'handoff-conflict-candidate-event-id' }] as T[]
    }

    const handoff = await persistConstructionOrganizationPlanNetworkManualReviewHandoff({
      draft,
      companyId: '10000000-0000-4000-8000-000000000001',
      projectId: '00000000-0000-4000-8000-000000000001',
      requestedByUserId: 'user-1',
      executedAt: '2026-06-21T13:00:00.000Z',
      queryExec,
    })

    expect(handoff).toEqual(expect.objectContaining({
      status: 'manual_review_handoff_ready',
      proposedDependencyEdgeCount: 1,
      writesTaskDependencies: false,
      writesPlanDates: false,
      governancePersistence: expect.objectContaining({
        persisted: true,
        candidateEventId: 'handoff-conflict-candidate-event-id',
      }),
    }))
    expect(handoff.reasons).toEqual([])
    expect(calls.map((call) => call.sql.toLowerCase()).join('\n')).toContain('insert into public.algorithm_asset_candidate_events')
  })

  it('records manual conflict review as candidate-only evidence and unlocks approval only after ready-for-replay decision', async () => {
    const conflictDraft = buildConstructionOrganizationPlanNetworkDraftFromReviewPackageItem(buildReviewPackageItem({
      reviewPackage: {
        source: 'construction_organization_candidate_materialization_review_package',
        packageBasis: 'manual_review_package_from_generated_row_preview_edges',
        optionId: 'option-conflict-ready',
        status: 'blocked_by_violations',
        allowManualReview: true,
        proposedDependencyEdgeCount: 1,
        blockedReasons: [
          'all_virtual_dependency_edges_have_generated_row_carriers',
          'candidate_preview_edges_violate_generated_row_dates',
          'candidate_network_conflicts_with_current_generated_row_dates',
          'requires_manual_conflict_review_before_replay',
        ],
        proposedDependencyEdges: [
          {
            fromGeneratedRowId: 'row-foundation',
            toGeneratedRowId: 'row-earthwork',
            dependencyType: 'FS',
            lagDays: 0,
            intent: 'pile_before_earthwork_bulk_excavation',
            fromVirtualNodeId: 'foundation-work',
            toVirtualNodeId: 'earthwork-work',
            operation: 'propose_create_dependency',
            writesTaskDependencies: false,
          },
        ],
        reviewRequired: true,
        writesTaskDependencies: false,
        writesPlanDates: false,
        writesCriticalPathFacts: false,
      },
    }))
    const handoff = {
      source: 'construction_organization_plan_network_manual_review_handoff_projection' as const,
      candidateEventId: 'handoff-conflict-event-id',
      assetKey: 'construction_organization.plan_network_handoff.conflict',
      sourceModule: 'constructionOrganizationPlanNetworkDraftService.manualReviewHandoff',
      eventStatus: 'review_required',
      runtimeEffect: 'candidate_only',
      createdAt: '2026-06-25T02:36:06.000Z',
      updatedAt: '2026-06-25T02:36:06.000Z',
      draftNetworkKey: conflictDraft.draftNetworkKey,
      originalCandidateEventId: conflictDraft.candidateEventId,
      optionId: conflictDraft.optionId,
      selectedScenarioIds: conflictDraft.selectedScenarioIds,
      requestedByUserId: 'user-1',
      executedAt: '2026-06-25T02:36:06.000Z',
      reviewOperation: 'manual_review_dependency_proposal' as const,
      proposedDependencyEdgeCount: conflictDraft.edgeCount,
      writesTaskDependencies: false as const,
      writesPlanDates: false as const,
      writesSeed: false as const,
      writesBaseline: false as const,
      writesCriticalPathFacts: false as const,
      writesAccelerationDraft: false as const,
    }

    const blockedDecision = buildConstructionOrganizationPlanNetworkManualConflictReviewDecision({
      draft: conflictDraft,
      manualReviewHandoff: handoff,
      decision: 'rejected_needs_plan_date_adjustment',
      reviewedByUserId: 'reviewer-1',
      reviewedAt: '2026-06-25T03:00:00.000Z',
    })
    expect(blockedDecision).toEqual(expect.objectContaining({
      status: 'manual_conflict_review_blocked',
      resultingReadiness: 'conflict_review_required',
      writesTaskDependencies: false,
      writesPlanDates: false,
    }))

    const approvedDecision = buildConstructionOrganizationPlanNetworkManualConflictReviewDecision({
      draft: conflictDraft,
      manualReviewHandoff: handoff,
      decision: 'approved_ready_for_replay',
      reviewedByUserId: 'reviewer-1',
      reviewedAt: '2026-06-25T03:00:00.000Z',
      decisionNotes: '已确认依赖关系覆盖当前计划冲突，可进入回放审批。',
    })
    expect(approvedDecision).toEqual(expect.objectContaining({
      status: 'manual_conflict_review_ready',
      resultingReadiness: 'ready_for_replay',
      handoffCandidateEventId: 'handoff-conflict-event-id',
      writesTaskDependencies: false,
      writesPlanDates: false,
      writesCriticalPathFacts: false,
    }))

    const calls: Array<{ sql: string, params: unknown[] }> = []
    const queryExec = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> => {
      calls.push({ sql, params })
      return [{ id: 'manual-conflict-review-event-id' }] as T[]
    }
    const persisted = await persistConstructionOrganizationPlanNetworkManualConflictReviewDecision({
      draft: conflictDraft,
      manualReviewHandoff: handoff,
      decision: 'approved_ready_for_replay',
      decisionNotes: '已确认依赖关系覆盖当前计划冲突，可进入回放审批。',
      companyId: '10000000-0000-4000-8000-000000000001',
      projectId: '00000000-0000-4000-8000-000000000001',
      reviewedByUserId: 'reviewer-1',
      reviewedAt: '2026-06-25T03:00:00.000Z',
      queryExec,
    })
    expect(persisted).toEqual(expect.objectContaining({
      status: 'manual_conflict_review_ready',
      governancePersistence: expect.objectContaining({
        persisted: true,
        candidateEventId: 'manual-conflict-review-event-id',
      }),
      writesTaskDependencies: false,
      writesPlanDates: false,
    }))
    const sqlText = calls.map((call) => call.sql.toLowerCase()).join('\n')
    expect(sqlText).toContain('insert into public.algorithm_asset_candidate_events')
    expect(sqlText).not.toContain('task_dependencies')
    const insertPayload = calls[0]?.params[11] as Record<string, unknown>
    expect(insertPayload).toEqual(expect.objectContaining({
      source: 'construction_organization_plan_network_manual_conflict_review_candidate',
      draftNetworkKey: conflictDraft.draftNetworkKey,
      handoffCandidateEventId: 'handoff-conflict-event-id',
      decision: 'approved_ready_for_replay',
      resultingReadiness: 'ready_for_replay',
      runtimeMutationBoundary: expect.objectContaining({
        writesTaskDependencies: false,
        writesPlanDates: false,
      }),
    }))
  })

  it('builds a manual-review handoff package without writing task dependencies', () => {
    const draft = buildConstructionOrganizationPlanNetworkDraftFromReviewPackageItem(buildReviewPackageItem())
    const handoff = buildConstructionOrganizationPlanNetworkManualReviewHandoff({
      draft,
      requestedByUserId: 'user-1',
      executedAt: '2026-06-21T13:00:00.000Z',
    })

    expect(handoff).toEqual(expect.objectContaining({
      status: 'manual_review_handoff_ready',
      draftNetworkKey: draft.draftNetworkKey,
      optionId: 'option-ready',
      requestedByUserId: 'user-1',
      proposedDependencyEdgeCount: 2,
      writesTaskDependencies: false,
      writesPlanDates: false,
      writesSeed: false,
      writesCriticalPathFacts: false,
      writesAccelerationDraft: false,
    }))
    expect(handoff.reviewPackage).toEqual(expect.objectContaining({
      source: 'construction_organization_plan_network_manual_review_handoff',
      reviewOperation: 'manual_review_dependency_proposal',
      reviewRequired: true,
      proposedDependencyEdges: expect.arrayContaining([
        expect.objectContaining({
          fromGeneratedRowId: 'row-foundation',
          toGeneratedRowId: 'row-earthwork',
          operation: 'propose_create_dependency',
          writesTaskDependencies: false,
        }),
      ]),
    }))
    expect(handoff.boundaryPolicy).toEqual(expect.arrayContaining([
      'manual_review_handoff_is_not_runtime_materialization',
      'domain_writer_does_not_write_task_dependencies',
      'release_exit_still_required_before_any_runtime_write',
    ]))
  })

  it('persists ready manual-review handoff as a governed candidate event without runtime writes', async () => {
    const draft = buildConstructionOrganizationPlanNetworkDraftFromReviewPackageItem(buildReviewPackageItem())
    const calls: Array<{ sql: string, params: unknown[] }> = []
    const queryExec = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> => {
      calls.push({ sql, params })
      return [{ id: 'handoff-candidate-event-id' }] as T[]
    }

    const handoff = await persistConstructionOrganizationPlanNetworkManualReviewHandoff({
      draft,
      companyId: '10000000-0000-4000-8000-000000000001',
      projectId: '00000000-0000-4000-8000-000000000001',
      requestedByUserId: 'user-1',
      executedAt: '2026-06-21T13:00:00.000Z',
      queryExec,
    })

    expect(handoff).toEqual(expect.objectContaining({
      status: 'manual_review_handoff_ready',
      writesTaskDependencies: false,
      governanceCandidateEvent: expect.objectContaining({
        sourceSystem: 'constructionOrganizationPlanNetworkDraftService.manualReviewHandoff',
        assetType: 'rule',
        publishAnchor: 'manual_governance_required',
        automationMaturity: 'auto_review_package',
        learningTarget: 'dependency_order',
        runtimeEffectPolicy: 'candidate_only',
      }),
      governancePersistence: expect.objectContaining({
        persisted: true,
        candidateEventId: 'handoff-candidate-event-id',
      }),
    }))

    const sqlText = calls.map((call) => call.sql.toLowerCase()).join('\n')
    expect(sqlText).toContain('insert into public.algorithm_asset_candidate_events')
    expect(sqlText).not.toContain('task_dependencies')
    const insertPayload = calls[0]?.params[11] as Record<string, unknown>
    expect(insertPayload).toEqual(expect.objectContaining({
      source: 'construction_organization_plan_network_manual_review_handoff_candidate',
      reviewPackage: expect.objectContaining({
        reviewOperation: 'manual_review_dependency_proposal',
        writesTaskDependencies: false,
      }),
      runtimeMutationBoundary: expect.objectContaining({
        writesTaskDependencies: false,
        writesPlanDates: false,
      }),
    }))
  })

  it('blocks manual-review handoff when the draft is not replay-ready or evaluation-ready', () => {
    const draft = buildConstructionOrganizationPlanNetworkDraftFromReviewPackageItem(buildReviewPackageItem({
      reviewPackage: {
        source: 'construction_organization_candidate_materialization_review_package',
        packageBasis: 'manual_review_package_from_generated_row_preview_edges',
        optionId: 'option-evidence',
        status: 'evidence_only',
        allowManualReview: false,
        proposedDependencyEdgeCount: 0,
        blockedReasons: ['evidence_only_candidate'],
        proposedDependencyEdges: [],
        reviewRequired: true,
        writesTaskDependencies: false,
        writesPlanDates: false,
        writesCriticalPathFacts: false,
      },
      generatedRowNetworkEvaluation: null,
    }))

    const handoff = buildConstructionOrganizationPlanNetworkManualReviewHandoff({
      draft,
      requestedByUserId: 'user-1',
    })

    expect(handoff).toEqual(expect.objectContaining({
      status: 'manual_review_handoff_blocked',
      proposedDependencyEdgeCount: 0,
      writesTaskDependencies: false,
    }))
    expect(handoff.reasons).toEqual(expect.arrayContaining([
      'draft_not_ready_for_replay',
      'draft_evaluation_not_ready',
      'draft_has_no_edges',
    ]))
  })

  it('lists draft networks through the review package read model without SQL writes', async () => {
    const reportReadyDraftKey = buildConstructionOrganizationPlanNetworkDraftFromReviewPackageItem(buildReviewPackageItem()).draftNetworkKey
    const calls: Array<{ sql: string, params: unknown[] }> = []
    const queryExec = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> => {
      calls.push({ sql, params })
      if (!sql.includes('FROM public.algorithm_asset_candidate_events')) return [] as T[]
      if (readConstructionOrganizationAssetPattern(params).startsWith('construction_organization.plan_network_handoff.')) {
        return [{
          id: 'handoff-event-ready',
          asset_key: 'construction_organization.plan_network_handoff.ready',
          source_module: 'constructionOrganizationPlanNetworkDraftService.manualReviewHandoff',
          event_status: 'candidate',
          runtime_effect: 'candidate_only',
          created_at: '2026-06-21T13:00:00.000Z',
          updated_at: '2026-06-21T13:00:00.000Z',
          candidate_payload: {
            draftNetworkKey: reportReadyDraftKey,
            originalCandidateEventId: 'event-ready',
            optionId: 'option-ready',
            selectedScenarioIds: buildReviewPackageItem().selectedScenarioIds,
            requestedByUserId: 'user-1',
            executedAt: '2026-06-21T13:00:00.000Z',
            reviewPackage: {
              proposedDependencyEdges: buildReviewPackageItem().reviewPackage.proposedDependencyEdges,
            },
            runtimeMutationBoundary: {
              writesTaskDependencies: false,
              writesPlanDates: false,
              writesSeed: false,
              writesBaseline: false,
              writesCriticalPathFacts: false,
              writesAccelerationDraft: false,
            },
          },
        }] as T[]
      }
      const lowItem = buildReviewPackageItem({
        candidateEventId: 'event-low',
        assetKey: 'construction_organization.plan_option.option-low',
        optionId: 'option-low',
        useCaseEvaluations: {
          newProjectPlanning: {
            useCase: 'new_project_planning',
            optionScore: 41,
            actionability: 'actionable_candidate',
          },
          startingLineOnboarding: {
            useCase: 'starting_line_onboarding',
            optionScore: 38,
            actionability: 'evidence_only',
          },
          accelerationRecovery: {
            useCase: 'acceleration_recovery',
            optionScore: 39,
            recoveryFactorHint: 1.01,
            e5RecoverableSpanDays: 1,
            actionability: 'actionable_candidate',
          },
        },
        reviewPackage: {
          ...buildReviewPackageItem().reviewPackage,
          optionId: 'option-low',
        },
      })
      return [{
        id: 'event-low',
        asset_key: 'construction_organization.plan_option.option-low',
        source_module: 'constructionOrganizationScenarioGovernanceService',
        company_id: '10000000-0000-4000-8000-000000000001',
        project_id: '00000000-0000-4000-8000-000000000001',
        event_status: 'review_required',
        runtime_effect: 'candidate_only',
        candidate_payload: {
          option: {
            optionId: 'option-low',
            selectedScenarioIds: ['excavation_before_pile'],
            engineEvaluationSummary: lowItem.engineEvaluationSummary,
            useCaseEvaluations: lowItem.useCaseEvaluations,
            generatedRowProjection: {
              materializationReviewPackage: lowItem.reviewPackage,
              generatedRowReferenceDurationEvidence: lowItem.generatedRowReferenceDurationEvidence,
              generatedRowNetworkEvaluation: lowItem.generatedRowNetworkEvaluation,
            },
          },
        },
      }, {
        id: 'event-ready',
        asset_key: 'construction_organization.plan_option.option-ready',
        source_module: 'constructionOrganizationScenarioGovernanceService',
        company_id: '10000000-0000-4000-8000-000000000001',
        project_id: '00000000-0000-4000-8000-000000000001',
        event_status: 'review_required',
        runtime_effect: 'candidate_only',
        candidate_payload: {
          option: {
            optionId: 'option-ready',
            selectedScenarioIds: buildReviewPackageItem().selectedScenarioIds,
            engineEvaluationSummary: buildReviewPackageItem().engineEvaluationSummary,
            useCaseEvaluations: buildReviewPackageItem().useCaseEvaluations,
            generatedRowProjection: {
              materializationReviewPackage: buildReviewPackageItem().reviewPackage,
              generatedRowReferenceDurationEvidence: buildReviewPackageItem().generatedRowReferenceDurationEvidence,
              generatedRowNetworkEvaluation: buildReviewPackageItem().generatedRowNetworkEvaluation,
            },
          },
        },
      }] as T[]
    }

    const report = await listConstructionOrganizationPlanNetworkDrafts({
      companyId: '10000000-0000-4000-8000-000000000001',
      projectId: '00000000-0000-4000-8000-000000000001',
      queryExec,
    })

    expect(report).toEqual(expect.objectContaining({
      source: 'construction_organization_plan_network_draft_read_model',
      totalDraftCount: 2,
      readyForReplayCount: 2,
      evaluationReadyCount: 2,
      totalEdgeCount: 4,
      totalManualReviewHandoffCount: 1,
      linkedManualReviewHandoffCount: 1,
    }))
    expect(report.recommendedDrafts).toEqual(expect.objectContaining({
      newProjectPlanning: expect.objectContaining({
        optionId: 'option-ready',
        optionScore: 76,
        selectedScenarioIds: buildReviewPackageItem().selectedScenarioIds,
        runtimeEngineEvidenceStatus: 'missing_runtime_engine_evidence',
        missingRuntimeEngineCodes: ['E1', 'E3', 'E5'],
      }),
      startingLineOnboarding: expect.objectContaining({
        optionId: 'option-ready',
        optionScore: 64,
        runtimeEngineEvidenceStatus: 'missing_runtime_engine_evidence',
        missingRuntimeEngineCodes: ['E1', 'E3', 'E5'],
      }),
      accelerationRecovery: expect.objectContaining({
        optionId: 'option-ready',
        optionScore: 82,
        e5RecoverableSpanDays: 5,
        runtimeEngineEvidenceStatus: 'missing_runtime_engine_evidence',
        missingRuntimeEngineCodes: ['E1', 'E3', 'E5'],
      }),
    }))
    expect(report.optionComparisonPackage).toEqual(expect.objectContaining({
      source: 'construction_organization_plan_network_option_comparison_package',
      totalOptionCount: 2,
      comparisonBasis: expect.arrayContaining([
        'read_only_plan_network_draft_use_case_evidence',
        'runtime_engine_evidence_gap_by_draft',
      ]),
      canAutoMaterializeSelectedOption: false,
    }))
    expect(report.optionComparisonPackage.options).toEqual(expect.arrayContaining([
      expect.objectContaining({
        draftNetworkKey: expect.any(String),
        optionId: 'option-ready',
        isRecommendedFor: ['newProjectPlanning', 'startingLineOnboarding', 'accelerationRecovery'],
        useCaseScores: expect.objectContaining({
          newProjectPlanning: expect.objectContaining({
            rank: 1,
            optionScore: 76,
            actionability: 'actionable_candidate',
          }),
          accelerationRecovery: expect.objectContaining({
            rank: 1,
            optionScore: 82,
            e5RecoverableSpanDays: 5,
          }),
        }),
        readiness: 'ready_for_replay',
        evaluationStatus: 'evaluation_ready',
        runtimeEngineEvidenceStatus: 'missing_runtime_engine_evidence',
        missingRuntimeEngineCodes: ['E1', 'E3', 'E5'],
        nextGovernanceAction: 'manual_review_approval',
        writesTaskDependencies: false,
        writesPlanDates: false,
      }),
    ]))
    expect(report.items[0]).toEqual(expect.objectContaining({
      readiness: 'ready_for_replay',
      mutationBoundary: expect.objectContaining({ writesTaskDependencies: false }),
      runtimeEngineEvidence: expect.objectContaining({
        status: 'missing_runtime_engine_evidence',
        presentEngineCodes: [],
        missingEngineCodes: ['E1', 'E3', 'E5'],
        canClaimTruePerOptionRuntimeEvaluation: false,
      }),
    }))
    expect(report.items.some((item) => item.manualReviewHandoff?.candidateEventId === 'handoff-event-ready')).toBe(true)
    const sqlText = calls.map((call) => call.sql.toLowerCase()).join('\n')
    expect(sqlText).toContain('from public.algorithm_asset_candidate_events')
    expect(sqlText).not.toContain('or project_id')
    expect(sqlText).not.toContain('or company_id')
    expect(sqlText).not.toMatch(/\b(insert\s+into|update\s+|delete\s+from)\b/)
    expect(sqlText).not.toContain('task_dependencies')
  })

  it('projects approved manual conflict review as ready for replay so manual approval can proceed', async () => {
    const conflictItem = buildReviewPackageItem({
      candidateEventId: 'event-conflict',
      assetKey: 'construction_organization.plan_option.option-conflict',
      optionId: 'option-conflict',
      reviewPackage: {
        source: 'construction_organization_candidate_materialization_review_package',
        packageBasis: 'manual_review_package_from_generated_row_preview_edges',
        optionId: 'option-conflict',
        status: 'blocked_by_violations',
        allowManualReview: true,
        proposedDependencyEdgeCount: 1,
        blockedReasons: [
          'all_virtual_dependency_edges_have_generated_row_carriers',
          'candidate_preview_edges_violate_generated_row_dates',
          'candidate_network_conflicts_with_current_generated_row_dates',
          'requires_manual_conflict_review_before_replay',
        ],
        proposedDependencyEdges: [buildReviewPackageItem().reviewPackage.proposedDependencyEdges[0]],
        reviewRequired: true,
        writesTaskDependencies: false,
        writesPlanDates: false,
        writesCriticalPathFacts: false,
      },
    })
    const conflictDraft = buildConstructionOrganizationPlanNetworkDraftFromReviewPackageItem(conflictItem)
    const calls: Array<{ sql: string, params: unknown[] }> = []
    const queryExec = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> => {
      calls.push({ sql, params })
      const assetPattern = readConstructionOrganizationAssetPattern(params)
      if (!sql.includes('FROM public.algorithm_asset_candidate_events')) return [] as T[]
      if (assetPattern.startsWith('construction_organization.plan_network_handoff.')) {
        return [{
          id: 'handoff-conflict-event-id',
          asset_key: 'construction_organization.plan_network_handoff.conflict',
          source_module: 'constructionOrganizationPlanNetworkDraftService.manualReviewHandoff',
          event_status: 'review_required',
          runtime_effect: 'candidate_only',
          created_at: '2026-06-25T02:36:06.000Z',
          updated_at: '2026-06-25T02:36:06.000Z',
          candidate_payload: {
            draftNetworkKey: conflictDraft.draftNetworkKey,
            originalCandidateEventId: 'event-conflict',
            optionId: 'option-conflict',
            selectedScenarioIds: conflictItem.selectedScenarioIds,
            requestedByUserId: 'user-1',
            executedAt: '2026-06-25T02:36:06.000Z',
            reviewPackage: {
              reviewOperation: 'manual_review_dependency_proposal',
              proposedDependencyEdges: conflictItem.reviewPackage.proposedDependencyEdges,
              writesTaskDependencies: false,
              writesPlanDates: false,
              writesCriticalPathFacts: false,
            },
            runtimeMutationBoundary: {
              writesTaskDependencies: false,
              writesPlanDates: false,
              writesSeed: false,
              writesBaseline: false,
              writesCriticalPathFacts: false,
              writesAccelerationDraft: false,
            },
          },
        }] as T[]
      }
      if (assetPattern.startsWith('construction_organization.plan_network_conflict_review.')) {
        return [{
          id: 'manual-conflict-review-event-id',
          asset_key: 'construction_organization.plan_network_conflict_review.conflict',
          source_module: 'constructionOrganizationPlanNetworkDraftService.manualConflictReview',
          event_status: 'review_required',
          runtime_effect: 'candidate_only',
          created_at: '2026-06-25T03:00:00.000Z',
          updated_at: '2026-06-25T03:00:00.000Z',
          candidate_payload: {
            draftNetworkKey: conflictDraft.draftNetworkKey,
            handoffCandidateEventId: 'handoff-conflict-event-id',
            decision: 'approved_ready_for_replay',
            resultingReadiness: 'ready_for_replay',
            reviewedByUserId: 'reviewer-1',
            reviewedAt: '2026-06-25T03:00:00.000Z',
            runtimeMutationBoundary: {
              writesTaskDependencies: false,
              writesPlanDates: false,
              writesSeed: false,
              writesBaseline: false,
              writesCriticalPathFacts: false,
              writesAccelerationDraft: false,
            },
          },
        }] as T[]
      }
      if (assetPattern.startsWith('construction_organization.plan_option.')) {
        return [{
          id: 'event-conflict',
          asset_key: 'construction_organization.plan_option.option-conflict',
          source_module: 'constructionOrganizationScenarioGovernanceService',
          company_id: '10000000-0000-4000-8000-000000000001',
          project_id: '00000000-0000-4000-8000-000000000001',
          event_status: 'review_required',
          runtime_effect: 'candidate_only',
          candidate_payload: {
            option: {
              optionId: 'option-conflict',
              selectedScenarioIds: conflictItem.selectedScenarioIds,
              engineEvaluationSummary: conflictItem.engineEvaluationSummary,
              useCaseEvaluations: conflictItem.useCaseEvaluations,
              generatedRowProjection: {
                materializationReviewPackage: conflictItem.reviewPackage,
                generatedRowReferenceDurationEvidence: conflictItem.generatedRowReferenceDurationEvidence,
                generatedRowNetworkEvaluation: conflictItem.generatedRowNetworkEvaluation,
              },
            },
          },
        }] as T[]
      }
      return [] as T[]
    }

    const report = await listConstructionOrganizationPlanNetworkDrafts({
      companyId: '10000000-0000-4000-8000-000000000001',
      projectId: '00000000-0000-4000-8000-000000000001',
      queryExec,
    })

    expect(report.readyForReplayCount).toBe(1)
    expect(report.items[0]).toEqual(expect.objectContaining({
      readiness: 'ready_for_replay',
      blockedReasons: expect.not.arrayContaining([
        'candidate_network_conflicts_with_current_generated_row_dates',
        'requires_manual_conflict_review_before_replay',
      ]),
      manualConflictReviewDecision: expect.objectContaining({
        source: 'construction_organization_plan_network_manual_conflict_review_projection',
        candidateEventId: 'manual-conflict-review-event-id',
        decision: 'approved_ready_for_replay',
        resultingReadiness: 'ready_for_replay',
        writesTaskDependencies: false,
        writesPlanDates: false,
      }),
    }))

    const approval = buildConstructionOrganizationPlanNetworkManualReviewApproval({
      draft: report.items[0],
      approvedByUserId: 'approver-1',
      approvedAt: '2026-06-25T03:05:00.000Z',
    })
    expect(approval.status).toBe('manual_review_approval_ready')
  })

  it('links persisted manual-review handoff candidate events back to draft rows', async () => {
    const readyItem = buildReviewPackageItem()
    const readyDraft = buildConstructionOrganizationPlanNetworkDraftFromReviewPackageItem(readyItem)
    const calls: Array<{ sql: string, params: unknown[] }> = []
    const queryExec = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> => {
      calls.push({ sql, params })
      const assetPattern = readConstructionOrganizationAssetPattern(params)
      if (assetPattern.startsWith('construction_organization.plan_network_handoff.')) {
        return [{
          id: 'handoff-event-ready',
          asset_key: 'construction_organization.plan_network_handoff.ready',
          source_module: 'constructionOrganizationPlanNetworkDraftService.manualReviewHandoff',
          event_status: 'review_required',
          runtime_effect: 'candidate_only',
          created_at: '2026-06-21T14:00:00.000Z',
          updated_at: '2026-06-21T14:00:00.000Z',
          candidate_payload: {
            source: 'construction_organization_plan_network_manual_review_handoff_candidate',
            draftNetworkKey: readyDraft.draftNetworkKey,
            originalCandidateEventId: 'event-ready',
            optionId: 'option-ready',
            selectedScenarioIds: readyItem.selectedScenarioIds,
            requestedByUserId: 'user-1',
            executedAt: '2026-06-21T13:00:00.000Z',
            reviewPackage: {
              reviewOperation: 'manual_review_dependency_proposal',
              proposedDependencyEdges: readyItem.reviewPackage.proposedDependencyEdges,
              writesTaskDependencies: false,
              writesPlanDates: false,
              writesCriticalPathFacts: false,
            },
            runtimeMutationBoundary: {
              writesTaskDependencies: false,
              writesPlanDates: false,
              writesSeed: false,
              writesBaseline: false,
              writesCriticalPathFacts: false,
              writesAccelerationDraft: false,
            },
          },
        }] as T[]
      }
      if (assetPattern.startsWith('construction_organization.plan_option.')) {
        return [{
          id: 'event-ready',
          asset_key: 'construction_organization.plan_option.option-ready',
          source_module: 'constructionOrganizationScenarioGovernanceService',
          company_id: '10000000-0000-4000-8000-000000000001',
          project_id: '00000000-0000-4000-8000-000000000001',
          event_status: 'review_required',
          runtime_effect: 'candidate_only',
          candidate_payload: {
            option: {
              optionId: 'option-ready',
              selectedScenarioIds: readyItem.selectedScenarioIds,
              engineEvaluationSummary: readyItem.engineEvaluationSummary,
              useCaseEvaluations: readyItem.useCaseEvaluations,
              generatedRowProjection: {
                materializationReviewPackage: readyItem.reviewPackage,
                generatedRowReferenceDurationEvidence: readyItem.generatedRowReferenceDurationEvidence,
                generatedRowNetworkEvaluation: readyItem.generatedRowNetworkEvaluation,
              },
            },
          },
        }] as T[]
      }
      return [] as T[]
    }

    const report = await listConstructionOrganizationPlanNetworkDrafts({
      companyId: '10000000-0000-4000-8000-000000000001',
      projectId: '00000000-0000-4000-8000-000000000001',
      queryExec,
    })

    expect(report).toEqual(expect.objectContaining({
      totalDraftCount: 1,
      totalManualReviewHandoffCount: 1,
      linkedManualReviewHandoffCount: 1,
    }))
    expect(report.items[0]).toEqual(expect.objectContaining({
      draftNetworkKey: readyDraft.draftNetworkKey,
      manualReviewHandoff: expect.objectContaining({
        source: 'construction_organization_plan_network_manual_review_handoff_projection',
        candidateEventId: 'handoff-event-ready',
        draftNetworkKey: readyDraft.draftNetworkKey,
        originalCandidateEventId: 'event-ready',
        reviewOperation: 'manual_review_dependency_proposal',
        proposedDependencyEdgeCount: 2,
        writesTaskDependencies: false,
        writesPlanDates: false,
      }),
      releaseExitAssessment: expect.objectContaining({
        source: 'construction_organization_plan_network_release_exit_assessment',
        status: 'release_exit_blocked',
        canMaterializeRuntime: false,
        handoffCandidateEventId: 'handoff-event-ready',
        draftNetworkKey: readyDraft.draftNetworkKey,
        requiredBeforeRuntime: expect.arrayContaining([
          'manual_review_approval_required',
          'domain_writer_release_exit_required',
          'runtime_consumer_verification_required',
          'impact_monitoring_required',
          'rollback_target_required',
        ]),
        writesTaskDependencies: false,
        writesPlanDates: false,
        writesCriticalPathFacts: false,
      }),
    }))
    const sqlText = calls.map((call) => call.sql.toLowerCase()).join('\n')
    const assetPatterns = calls.map((call) => readConstructionOrganizationAssetPattern(call.params))
    expect(assetPatterns).toContain('construction_organization.plan_option.%')
    expect(assetPatterns).toContain('construction_organization.plan_network_handoff.%')
    expect(sqlText).not.toContain('task_dependencies')
  })

  it('links manual-review approval events and narrows release-exit blockers without runtime writes', async () => {
    const readyItem = buildReviewPackageItem()
    const readyDraft = buildConstructionOrganizationPlanNetworkDraftFromReviewPackageItem(readyItem)
    const calls: Array<{ sql: string, params: unknown[] }> = []
    const queryExec = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> => {
      calls.push({ sql, params })
      const assetPattern = readConstructionOrganizationAssetPattern(params)
      if (assetPattern.startsWith('construction_organization.plan_network_handoff.')) {
        return [{
          id: 'handoff-event-ready',
          asset_key: 'construction_organization.plan_network_handoff.ready',
          source_module: 'constructionOrganizationPlanNetworkDraftService.manualReviewHandoff',
          event_status: 'review_required',
          runtime_effect: 'candidate_only',
          created_at: '2026-06-21T14:00:00.000Z',
          updated_at: '2026-06-21T14:00:00.000Z',
          candidate_payload: {
            source: 'construction_organization_plan_network_manual_review_handoff_candidate',
            draftNetworkKey: readyDraft.draftNetworkKey,
            originalCandidateEventId: 'event-ready',
            optionId: 'option-ready',
            selectedScenarioIds: readyItem.selectedScenarioIds,
            reviewPackage: {
              reviewOperation: 'manual_review_dependency_proposal',
              proposedDependencyEdges: readyItem.reviewPackage.proposedDependencyEdges,
              writesTaskDependencies: false,
              writesPlanDates: false,
              writesCriticalPathFacts: false,
            },
            runtimeMutationBoundary: {
              writesTaskDependencies: false,
              writesPlanDates: false,
              writesSeed: false,
              writesBaseline: false,
              writesCriticalPathFacts: false,
              writesAccelerationDraft: false,
            },
          },
        }] as T[]
      }
      if (assetPattern.startsWith('construction_organization.plan_network_approval.')) {
        return [{
          id: 'approval-event-ready',
          asset_key: 'construction_organization.plan_network_approval.ready',
          source_module: 'constructionOrganizationPlanNetworkDraftService.manualReviewApproval',
          event_status: 'approved',
          runtime_effect: 'candidate_only',
          created_at: '2026-06-21T15:00:00.000Z',
          updated_at: '2026-06-21T15:00:00.000Z',
          candidate_payload: {
            source: 'construction_organization_plan_network_manual_review_approval_candidate',
            draftNetworkKey: readyDraft.draftNetworkKey,
            handoffCandidateEventId: 'handoff-event-ready',
            approvedByUserId: 'approver-1',
            approvedAt: '2026-06-21T15:00:00.000Z',
            approvalDecision: 'approved_for_release_exit_preparation',
            runtimeMutationBoundary: {
              writesTaskDependencies: false,
              writesPlanDates: false,
              writesSeed: false,
              writesBaseline: false,
              writesCriticalPathFacts: false,
              writesAccelerationDraft: false,
            },
          },
        }] as T[]
      }
      if (assetPattern.startsWith('construction_organization.plan_option.')) {
        return [{
          id: 'event-ready',
          asset_key: 'construction_organization.plan_option.option-ready',
          source_module: 'constructionOrganizationScenarioGovernanceService',
          company_id: '10000000-0000-4000-8000-000000000001',
          project_id: '00000000-0000-4000-8000-000000000001',
          event_status: 'review_required',
          runtime_effect: 'candidate_only',
          candidate_payload: {
            option: {
              optionId: 'option-ready',
              selectedScenarioIds: readyItem.selectedScenarioIds,
              engineEvaluationSummary: readyItem.engineEvaluationSummary,
              useCaseEvaluations: readyItem.useCaseEvaluations,
              generatedRowProjection: {
                materializationReviewPackage: readyItem.reviewPackage,
                generatedRowReferenceDurationEvidence: readyItem.generatedRowReferenceDurationEvidence,
                generatedRowNetworkEvaluation: readyItem.generatedRowNetworkEvaluation,
              },
            },
          },
        }] as T[]
      }
      return [] as T[]
    }

    const report = await listConstructionOrganizationPlanNetworkDrafts({
      companyId: '10000000-0000-4000-8000-000000000001',
      projectId: '00000000-0000-4000-8000-000000000001',
      queryExec,
    })

    expect(report).toEqual(expect.objectContaining({
      totalManualReviewApprovalCount: 1,
      linkedManualReviewApprovalCount: 1,
    }))
    expect(report.items[0]).toEqual(expect.objectContaining({
      manualReviewApproval: expect.objectContaining({
        source: 'construction_organization_plan_network_manual_review_approval_projection',
        candidateEventId: 'approval-event-ready',
        handoffCandidateEventId: 'handoff-event-ready',
        approvedByUserId: 'approver-1',
        approvalDecision: 'approved_for_release_exit_preparation',
        writesTaskDependencies: false,
        writesPlanDates: false,
      }),
      releaseExitAssessment: expect.objectContaining({
        status: 'release_exit_blocked',
        handoffCandidateEventId: 'handoff-event-ready',
        approvalCandidateEventId: 'approval-event-ready',
        requiredBeforeRuntime: expect.not.arrayContaining(['manual_review_approval_required']),
        reasons: expect.not.arrayContaining(['manual_review_approval_required']),
        canMaterializeRuntime: false,
      }),
    }))
    expect(report.items[0].releaseExitAssessment.requiredBeforeRuntime).toEqual(expect.arrayContaining([
      'domain_writer_release_exit_required',
      'runtime_consumer_verification_required',
      'impact_monitoring_required',
      'release_record_required',
      'rollback_target_required',
    ]))
    const approvedDraft = report.items[0] as any
    expect(approvedDraft.releaseExitPreparation).toEqual(expect.objectContaining({
      source: 'construction_organization_plan_network_release_exit_preparation',
      status: 'ready_for_domain_writer_release_exit_package',
      canMaterializeRuntime: false,
      draftNetworkKey: readyDraft.draftNetworkKey,
      handoffCandidateEventId: 'handoff-event-ready',
      approvalCandidateEventId: 'approval-event-ready',
      domainWriterKey: 'constructionOrganizationPlanNetworkDomainWriter.applyApprovedDraft',
      proposedDependencyEdgeCount: 2,
      nodeCount: 4,
      evaluationEvidence: expect.objectContaining({
        e1: expect.objectContaining({ matchedReferenceRowCount: 4 }),
        e3: expect.objectContaining({ projectedNetworkSpanDays: 38 }),
        e5: expect.objectContaining({ e5RecoverableSpanDays: 5 }),
      }),
      mutationBoundary: {
        writesTaskDependencies: false,
        writesPlanDates: false,
        writesSeed: false,
        writesBaseline: false,
        writesCriticalPathFacts: false,
        writesAccelerationDraft: false,
      },
    }))
    expect(approvedDraft.releaseExitPreparation.requiredBeforeRuntime).toEqual([
      'domain_writer_release_exit_required',
      'runtime_consumer_verification_required',
      'impact_monitoring_required',
      'release_record_required',
      'rollback_target_required',
    ])
    expect(approvedDraft.releaseExitPreparation.packageArtifacts).toEqual(expect.arrayContaining([
      'approved_plan_network_draft',
      'manual_review_handoff_event',
      'manual_review_approval_event',
      'proposed_dependency_edges',
      'e1_generated_row_reference_duration_evidence',
      'e3_generated_row_candidate_network_evidence',
      'e5_acceleration_recovery_evidence',
    ]))
    expect(approvedDraft.domainWriterReleaseExitReadiness).toEqual(expect.objectContaining({
      source: 'construction_organization_plan_network_domain_writer_release_exit_readiness',
      status: 'blocked_pending_release_exit_evidence',
      canMaterializeRuntime: false,
      draftNetworkKey: readyDraft.draftNetworkKey,
      domainWriterKey: 'constructionOrganizationPlanNetworkDomainWriter.applyApprovedDraft',
      proposedDependencyEdgeCount: 2,
      releaseExitPreparationStatus: 'ready_for_domain_writer_release_exit_package',
      requiredEvidenceBeforeDomainWriter: [
        'domain_writer_release_exit_evidence_required',
        'runtime_consumer_verification_ref_required',
        'impact_monitoring_ref_required',
        'release_record_target_required',
        'rollback_target_required',
      ],
      mutationBoundary: {
        writesTaskDependencies: false,
        writesPlanDates: false,
        writesSeed: false,
        writesBaseline: false,
        writesCriticalPathFacts: false,
        writesAccelerationDraft: false,
      },
    }))
    expect(approvedDraft.domainWriterReleaseExitReadiness.packageArtifacts).toEqual(expect.arrayContaining([
      'approved_plan_network_draft',
      'manual_review_handoff_event',
      'manual_review_approval_event',
      'proposed_dependency_edges',
    ]))
    expect(calls.map((call) => readConstructionOrganizationAssetPattern(call.params))).toContain('construction_organization.plan_network_approval.%')
    expect(calls.map((call) => call.sql.toLowerCase()).join('\n')).not.toContain('task_dependencies')
  })

  it('persists manual-review approval as a governed candidate event without materializing dependencies', async () => {
    const draft = buildConstructionOrganizationPlanNetworkDraftFromReviewPackageItem(buildReviewPackageItem())
    const handoff = {
      source: 'construction_organization_plan_network_manual_review_handoff_projection' as const,
      candidateEventId: 'handoff-event-ready',
      assetKey: 'construction_organization.plan_network_handoff.ready',
      sourceModule: 'constructionOrganizationPlanNetworkDraftService.manualReviewHandoff',
      eventStatus: 'review_required',
      runtimeEffect: 'candidate_only',
      createdAt: '2026-06-21T14:00:00.000Z',
      updatedAt: '2026-06-21T14:00:00.000Z',
      draftNetworkKey: draft.draftNetworkKey,
      originalCandidateEventId: draft.candidateEventId,
      optionId: draft.optionId,
      selectedScenarioIds: draft.selectedScenarioIds,
      requestedByUserId: 'user-1',
      executedAt: '2026-06-21T13:00:00.000Z',
      reviewOperation: 'manual_review_dependency_proposal' as const,
      proposedDependencyEdgeCount: draft.edgeCount,
      writesTaskDependencies: false as const,
      writesPlanDates: false as const,
      writesSeed: false as const,
      writesBaseline: false as const,
      writesCriticalPathFacts: false as const,
      writesAccelerationDraft: false as const,
    }
    const approval = buildConstructionOrganizationPlanNetworkManualReviewApproval({
      draft: { ...draft, manualReviewHandoff: handoff },
      approvedByUserId: 'approver-1',
      approvedAt: '2026-06-21T15:00:00.000Z',
    })
    expect(approval).toEqual(expect.objectContaining({
      status: 'manual_review_approval_ready',
      handoffCandidateEventId: 'handoff-event-ready',
      approvedByUserId: 'approver-1',
      writesTaskDependencies: false,
      writesPlanDates: false,
      writesCriticalPathFacts: false,
    }))

    const calls: Array<{ sql: string, params: unknown[] }> = []
    const queryExec = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> => {
      calls.push({ sql, params })
      return [{ id: 'approval-candidate-event-id' }] as T[]
    }

    const persisted = await persistConstructionOrganizationPlanNetworkManualReviewApproval({
      draft: { ...draft, manualReviewHandoff: handoff },
      companyId: '10000000-0000-4000-8000-000000000001',
      projectId: '00000000-0000-4000-8000-000000000001',
      approvedByUserId: 'approver-1',
      approvedAt: '2026-06-21T15:00:00.000Z',
      queryExec,
    })

    expect(persisted).toEqual(expect.objectContaining({
      status: 'manual_review_approval_ready',
      governancePersistence: expect.objectContaining({
        persisted: true,
        candidateEventId: 'approval-candidate-event-id',
      }),
      writesTaskDependencies: false,
      writesPlanDates: false,
    }))
    const insertPayload = calls[0]?.params[11] as Record<string, unknown>
    expect(insertPayload).toEqual(expect.objectContaining({
      source: 'construction_organization_plan_network_manual_review_approval_candidate',
      draftNetworkKey: draft.draftNetworkKey,
      handoffCandidateEventId: 'handoff-event-ready',
      approvalDecision: 'approved_for_release_exit_preparation',
      runtimeMutationBoundary: expect.objectContaining({
        writesTaskDependencies: false,
        writesPlanDates: false,
      }),
    }))
    expect(calls.map((call) => call.sql.toLowerCase()).join('\n')).not.toContain('task_dependencies')
  })

  it('links release-exit handoff candidate events and summarizes remaining runtime materialization blockers', async () => {
    const readyItem = buildReviewPackageItem()
    const readyDraft = buildConstructionOrganizationPlanNetworkDraftFromReviewPackageItem(readyItem)
    const calls: Array<{ sql: string, params: unknown[] }> = []
    const queryExec = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> => {
      calls.push({ sql, params })
      const assetPattern = readConstructionOrganizationAssetPattern(params)
      if (assetPattern.startsWith('construction_organization.plan_network_handoff.')) {
        return [{
          id: 'handoff-event-ready',
          asset_key: 'construction_organization.plan_network_handoff.ready',
          source_module: 'constructionOrganizationPlanNetworkDraftService.manualReviewHandoff',
          event_status: 'review_required',
          runtime_effect: 'candidate_only',
          created_at: '2026-06-21T14:00:00.000Z',
          updated_at: '2026-06-21T14:00:00.000Z',
          candidate_payload: {
            source: 'construction_organization_plan_network_manual_review_handoff_candidate',
            draftNetworkKey: readyDraft.draftNetworkKey,
            originalCandidateEventId: 'event-ready',
            optionId: 'option-ready',
            selectedScenarioIds: readyItem.selectedScenarioIds,
            reviewPackage: {
              reviewOperation: 'manual_review_dependency_proposal',
              proposedDependencyEdges: readyItem.reviewPackage.proposedDependencyEdges,
              writesTaskDependencies: false,
              writesPlanDates: false,
              writesCriticalPathFacts: false,
            },
            runtimeMutationBoundary: {
              writesTaskDependencies: false,
              writesPlanDates: false,
              writesSeed: false,
              writesBaseline: false,
              writesCriticalPathFacts: false,
              writesAccelerationDraft: false,
            },
          },
        }] as T[]
      }
      if (assetPattern.startsWith('construction_organization.plan_network_approval.')) {
        return [{
          id: 'approval-event-ready',
          asset_key: 'construction_organization.plan_network_approval.ready',
          source_module: 'constructionOrganizationPlanNetworkDraftService.manualReviewApproval',
          event_status: 'approved',
          runtime_effect: 'candidate_only',
          created_at: '2026-06-21T15:00:00.000Z',
          updated_at: '2026-06-21T15:00:00.000Z',
          candidate_payload: {
            source: 'construction_organization_plan_network_manual_review_approval_candidate',
            draftNetworkKey: readyDraft.draftNetworkKey,
            handoffCandidateEventId: 'handoff-event-ready',
            approvedByUserId: 'approver-1',
            approvedAt: '2026-06-21T15:00:00.000Z',
            approvalDecision: 'approved_for_release_exit_preparation',
            runtimeMutationBoundary: {
              writesTaskDependencies: false,
              writesPlanDates: false,
              writesSeed: false,
              writesBaseline: false,
              writesCriticalPathFacts: false,
              writesAccelerationDraft: false,
            },
          },
        }] as T[]
      }
      if (assetPattern.startsWith('construction_organization.plan_network_release_exit_handoff.')) {
        return [{
          id: 'release-exit-handoff-event-ready',
          asset_key: 'construction_organization.plan_network_release_exit_handoff.ready',
          source_module: 'constructionOrganizationPlanNetworkDraftService.releaseExitHandoff',
          event_status: 'review_required',
          runtime_effect: 'candidate_only',
          created_at: '2026-06-21T16:00:00.000Z',
          updated_at: '2026-06-21T16:00:00.000Z',
          candidate_payload: {
            source: 'construction_organization_plan_network_release_exit_handoff_candidate',
            draftNetworkKey: readyDraft.draftNetworkKey,
            originalCandidateEventId: 'event-ready',
            handoffCandidateEventId: 'handoff-event-ready',
            approvalCandidateEventId: 'approval-event-ready',
            optionId: 'option-ready',
            selectedScenarioIds: readyItem.selectedScenarioIds,
            requestedByUserId: 'release-user-1',
            executedAt: '2026-06-21T16:00:00.000Z',
            releaseRecordTarget: 'construction-organization-release-record:project-1',
            rollbackTarget: 'construction-organization-rollback:project-1',
            consumerVerificationRefs: ['gantt.taskDependencyReadModel'],
            impactMonitoringRefs: ['constructionOrganizationPlanNetworkImpactMonitor'],
            rollbackWriterRefs: ['constructionOrganizationPlanNetworkDomainWriter.rollback'],
            proposedDependencyEdges: readyItem.reviewPackage.proposedDependencyEdges,
            runtimeMutationBoundary: {
              writesTaskDependencies: false,
              writesPlanDates: false,
              writesSeed: false,
              writesBaseline: false,
              writesCriticalPathFacts: false,
              writesAccelerationDraft: false,
            },
          },
        }] as T[]
      }
      if (assetPattern.startsWith('construction_organization.plan_option.')) {
        return [{
          id: 'event-ready',
          asset_key: 'construction_organization.plan_option.option-ready',
          source_module: 'constructionOrganizationScenarioGovernanceService',
          company_id: '10000000-0000-4000-8000-000000000001',
          project_id: '00000000-0000-4000-8000-000000000001',
          event_status: 'review_required',
          runtime_effect: 'candidate_only',
          candidate_payload: {
            option: {
              optionId: 'option-ready',
              selectedScenarioIds: readyItem.selectedScenarioIds,
              engineEvaluationSummary: readyItem.engineEvaluationSummary,
              useCaseEvaluations: readyItem.useCaseEvaluations,
              generatedRowProjection: {
                materializationReviewPackage: readyItem.reviewPackage,
                generatedRowReferenceDurationEvidence: readyItem.generatedRowReferenceDurationEvidence,
                generatedRowNetworkEvaluation: readyItem.generatedRowNetworkEvaluation,
              },
            },
          },
        }] as T[]
      }
      return [] as T[]
    }

    const report = await listConstructionOrganizationPlanNetworkDrafts({
      companyId: '10000000-0000-4000-8000-000000000001',
      projectId: '00000000-0000-4000-8000-000000000001',
      queryExec,
    })

    expect(report).toEqual(expect.objectContaining({
      totalReleaseExitHandoffCount: 1,
      linkedReleaseExitHandoffCount: 1,
      runtimeMaterializationReadiness: expect.objectContaining({
        source: 'construction_organization_plan_network_runtime_materialization_readiness',
        status: 'blocked_candidate_only_after_release_exit_handoff',
        canMaterializeRuntime: false,
        releaseExitHandoffCandidateCount: 1,
        domainWriterRuntimeExecutionCount: 0,
        readyForDomainWriterExecutionCount: 0,
        missingBeforeRuntime: expect.arrayContaining([
          'domain_writer_runtime_execution_required',
          'runtime_consumer_observation_required',
          'post_materialization_impact_monitoring_result_required',
          'runtime_release_record_persistence_required',
          'rollback_execution_verification_required',
        ]),
      }),
    }))
    expect(report.items[0]).toEqual(expect.objectContaining({
      releaseExitHandoff: expect.objectContaining({
        source: 'construction_organization_plan_network_release_exit_handoff_projection',
        candidateEventId: 'release-exit-handoff-event-ready',
        draftNetworkKey: readyDraft.draftNetworkKey,
        handoffCandidateEventId: 'handoff-event-ready',
        approvalCandidateEventId: 'approval-event-ready',
        releaseRecordTarget: 'construction-organization-release-record:project-1',
        rollbackTarget: 'construction-organization-rollback:project-1',
        consumerVerificationRefs: ['gantt.taskDependencyReadModel'],
        impactMonitoringRefs: ['constructionOrganizationPlanNetworkImpactMonitor'],
        rollbackWriterRefs: ['constructionOrganizationPlanNetworkDomainWriter.rollback'],
        writesTaskDependencies: false,
        writesPlanDates: false,
      }),
      domainWriterReleaseExitReadiness: expect.objectContaining({
        status: 'blocked_pending_release_exit_evidence',
        canMaterializeRuntime: false,
      }),
    }))
    expect(report.runtimeMaterializationReadiness.mutationBoundary).toEqual({
      writesTaskDependencies: false,
      writesPlanDates: false,
      writesSeed: false,
      writesBaseline: false,
      writesCriticalPathFacts: false,
      writesAccelerationDraft: false,
    })
    const assetPatterns = calls.map((call) => readConstructionOrganizationAssetPattern(call.params))
    expect(assetPatterns).toContain('construction_organization.plan_network_release_exit_handoff.%')
    expect(calls.map((call) => call.sql.toLowerCase()).join('\n')).not.toContain('task_dependencies')
  })

  it('reads domain-writer runtime publication records and removes the execution blocker without granting completion', async () => {
    const readyItem = buildReviewPackageItem()
    const readyDraft = buildConstructionOrganizationPlanNetworkDraftFromReviewPackageItem(readyItem)
    const calls: Array<{ sql: string, params: unknown[] }> = []
    const queryExec = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> => {
      calls.push({ sql, params })
      const assetPattern = readConstructionOrganizationAssetPattern(params)
      if (assetPattern.startsWith('construction_organization.plan_network_handoff.')) {
        return [{
          id: 'handoff-event-ready',
          asset_key: 'construction_organization.plan_network_handoff.ready',
          source_module: 'constructionOrganizationPlanNetworkDraftService.manualReviewHandoff',
          event_status: 'review_required',
          runtime_effect: 'candidate_only',
          created_at: '2026-06-21T14:00:00.000Z',
          updated_at: '2026-06-21T14:00:00.000Z',
          candidate_payload: {
            draftNetworkKey: readyDraft.draftNetworkKey,
            originalCandidateEventId: 'event-ready',
            optionId: 'option-ready',
            selectedScenarioIds: readyItem.selectedScenarioIds,
            reviewPackage: {
              reviewOperation: 'manual_review_dependency_proposal',
              proposedDependencyEdges: readyItem.reviewPackage.proposedDependencyEdges,
              writesTaskDependencies: false,
              writesPlanDates: false,
              writesCriticalPathFacts: false,
            },
            runtimeMutationBoundary: {
              writesTaskDependencies: false,
              writesPlanDates: false,
              writesSeed: false,
              writesBaseline: false,
              writesCriticalPathFacts: false,
              writesAccelerationDraft: false,
            },
          },
        }] as T[]
      }
      if (assetPattern.startsWith('construction_organization.plan_network_approval.')) {
        return [{
          id: 'approval-event-ready',
          asset_key: 'construction_organization.plan_network_approval.ready',
          source_module: 'constructionOrganizationPlanNetworkDraftService.manualReviewApproval',
          event_status: 'approved',
          runtime_effect: 'candidate_only',
          created_at: '2026-06-21T15:00:00.000Z',
          updated_at: '2026-06-21T15:00:00.000Z',
          candidate_payload: {
            draftNetworkKey: readyDraft.draftNetworkKey,
            handoffCandidateEventId: 'handoff-event-ready',
            approvalDecision: 'approved_for_release_exit_preparation',
            runtimeMutationBoundary: {
              writesTaskDependencies: false,
              writesPlanDates: false,
              writesSeed: false,
              writesBaseline: false,
              writesCriticalPathFacts: false,
              writesAccelerationDraft: false,
            },
          },
        }] as T[]
      }
      if (assetPattern.startsWith('construction_organization.plan_network_release_exit_handoff.')) {
        return [{
          id: 'release-exit-handoff-event-ready',
          asset_key: 'construction_organization.plan_network_release_exit_handoff.ready',
          source_module: 'constructionOrganizationPlanNetworkDraftService.releaseExitHandoff',
          event_status: 'review_required',
          runtime_effect: 'candidate_only',
          created_at: '2026-06-21T16:00:00.000Z',
          updated_at: '2026-06-21T16:00:00.000Z',
          candidate_payload: {
            draftNetworkKey: readyDraft.draftNetworkKey,
            originalCandidateEventId: 'event-ready',
            handoffCandidateEventId: 'handoff-event-ready',
            approvalCandidateEventId: 'approval-event-ready',
            optionId: 'option-ready',
            selectedScenarioIds: readyItem.selectedScenarioIds,
            releaseRecordTarget: 'construction-org-plan-network-release:project-1',
            rollbackTarget: 'construction-org-plan-network-rollback:project-1',
            consumerVerificationRefs: ['gantt.taskDependencyReadModel'],
            impactMonitoringRefs: ['constructionOrganizationPlanNetworkImpactMonitor'],
            rollbackWriterRefs: ['constructionOrganizationPlanNetworkDomainWriter.rollback'],
            proposedDependencyEdges: readyItem.reviewPackage.proposedDependencyEdges,
            runtimeMutationBoundary: {
              writesTaskDependencies: false,
              writesPlanDates: false,
              writesSeed: false,
              writesBaseline: false,
              writesCriticalPathFacts: false,
              writesAccelerationDraft: false,
            },
          },
        }] as T[]
      }
      if (String(sql).includes('FROM public.construction_organization_plan_network_runtime_publications')) {
        return [{
          id: 'runtime-publication-1',
          publication_key: 'construction-org-plan-network-release:project-1',
          project_id: '00000000-0000-4000-8000-000000000001',
          draft_network_key: readyDraft.draftNetworkKey,
          release_handoff_candidate_event_id: 'release-exit-handoff-event-ready',
          runtime_publication_status: 'runtime_published',
          applied_dependency_count: 2,
          rollback_target: 'construction-org-plan-network-rollback:project-1',
          published_at: '2026-06-22T02:00:00.000Z',
        }] as T[]
      }
      if (assetPattern.startsWith('construction_organization.plan_option.')) {
        return [{
          id: 'event-ready',
          asset_key: 'construction_organization.plan_option.option-ready',
          source_module: 'constructionOrganizationScenarioGovernanceService',
          company_id: '10000000-0000-4000-8000-000000000001',
          project_id: '00000000-0000-4000-8000-000000000001',
          event_status: 'review_required',
          runtime_effect: 'candidate_only',
          candidate_payload: {
            option: {
              optionId: 'option-ready',
              selectedScenarioIds: readyItem.selectedScenarioIds,
              engineEvaluationSummary: readyItem.engineEvaluationSummary,
              useCaseEvaluations: readyItem.useCaseEvaluations,
              generatedRowProjection: {
                materializationReviewPackage: readyItem.reviewPackage,
                generatedRowReferenceDurationEvidence: readyItem.generatedRowReferenceDurationEvidence,
                generatedRowNetworkEvaluation: readyItem.generatedRowNetworkEvaluation,
              },
            },
          },
        }] as T[]
      }
      return [] as T[]
    }

    const report = await listConstructionOrganizationPlanNetworkDrafts({
      companyId: '10000000-0000-4000-8000-000000000001',
      projectId: '00000000-0000-4000-8000-000000000001',
      queryExec,
    })

    expect(report.runtimeMaterializationReadiness).toEqual(expect.objectContaining({
      source: 'construction_organization_plan_network_runtime_materialization_readiness',
      canMaterializeRuntime: false,
      domainWriterRuntimeExecutionCount: 1,
      readyForDomainWriterExecutionCount: 1,
      missingBeforeRuntime: expect.not.arrayContaining([
        'domain_writer_runtime_execution_required',
      ]),
    }))
    expect(report.runtimeMaterializationReadiness.missingBeforeRuntime).toEqual(expect.arrayContaining([
      'runtime_consumer_observation_required',
      'post_materialization_impact_monitoring_result_required',
      'rollback_execution_verification_required',
    ]))
    expect(calls.map((call) => call.sql).join('\n')).toContain('FROM public.construction_organization_plan_network_runtime_publications')

    const queryExecWithConflictingPublication = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> => {
      if (String(sql).includes('FROM public.construction_organization_plan_network_runtime_publications')) {
        return [{
          id: 'runtime-publication-conflict',
          publication_key: 'construction-org-plan-network-release:project-1',
          project_id: '00000000-0000-4000-8000-000000000001',
          draft_network_key: `${readyDraft.draftNetworkKey}:conflict`,
          release_handoff_candidate_event_id: 'release-exit-handoff-event-ready',
          runtime_publication_status: 'runtime_published',
          applied_dependency_count: 2,
          rollback_target: 'construction-org-plan-network-rollback:project-1',
          published_at: '2026-06-22T02:00:00.000Z',
        }] as T[]
      }
      return queryExec(sql, params)
    }

    const conflictingPublicationReport = await listConstructionOrganizationPlanNetworkDrafts({
      companyId: '10000000-0000-4000-8000-000000000001',
      projectId: '00000000-0000-4000-8000-000000000001',
      queryExec: queryExecWithConflictingPublication,
    })

    expect(conflictingPublicationReport.runtimeMaterializationReadiness).toEqual(expect.objectContaining({
      source: 'construction_organization_plan_network_runtime_materialization_readiness',
      canMaterializeRuntime: false,
      domainWriterRuntimeExecutionCount: 1,
      readyForDomainWriterExecutionCount: 0,
      missingBeforeRuntime: expect.arrayContaining([
        'domain_writer_runtime_execution_required',
        'runtime_release_record_persistence_required',
      ]),
    }))
  })

  it('reads runtime consumer observations for published plan networks without granting materialization completion', async () => {
    const readyItem = buildReviewPackageItem()
    const readyDraft = buildConstructionOrganizationPlanNetworkDraftFromReviewPackageItem(readyItem)
    const calls: Array<{ sql: string, params: unknown[] }> = []
    const queryExec = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> => {
      calls.push({ sql, params })
      const assetPattern = readConstructionOrganizationAssetPattern(params)
      if (assetPattern.startsWith('construction_organization.plan_network_handoff.')) {
        return [{
          id: 'handoff-event-ready',
          asset_key: 'construction_organization.plan_network_handoff.ready',
          source_module: 'constructionOrganizationPlanNetworkDraftService.manualReviewHandoff',
          event_status: 'review_required',
          runtime_effect: 'candidate_only',
          created_at: '2026-06-21T14:00:00.000Z',
          updated_at: '2026-06-21T14:00:00.000Z',
          candidate_payload: {
            draftNetworkKey: readyDraft.draftNetworkKey,
            originalCandidateEventId: 'event-ready',
            optionId: 'option-ready',
            selectedScenarioIds: readyItem.selectedScenarioIds,
            reviewPackage: {
              reviewOperation: 'manual_review_dependency_proposal',
              proposedDependencyEdges: readyItem.reviewPackage.proposedDependencyEdges,
              writesTaskDependencies: false,
              writesPlanDates: false,
              writesCriticalPathFacts: false,
            },
            runtimeMutationBoundary: {
              writesTaskDependencies: false,
              writesPlanDates: false,
              writesSeed: false,
              writesBaseline: false,
              writesCriticalPathFacts: false,
              writesAccelerationDraft: false,
            },
          },
        }] as T[]
      }
      if (assetPattern.startsWith('construction_organization.plan_network_approval.')) {
        return [{
          id: 'approval-event-ready',
          asset_key: 'construction_organization.plan_network_approval.ready',
          source_module: 'constructionOrganizationPlanNetworkDraftService.manualReviewApproval',
          event_status: 'approved',
          runtime_effect: 'candidate_only',
          created_at: '2026-06-21T15:00:00.000Z',
          updated_at: '2026-06-21T15:00:00.000Z',
          candidate_payload: {
            draftNetworkKey: readyDraft.draftNetworkKey,
            handoffCandidateEventId: 'handoff-event-ready',
            approvalDecision: 'approved_for_release_exit_preparation',
            runtimeMutationBoundary: {
              writesTaskDependencies: false,
              writesPlanDates: false,
              writesSeed: false,
              writesBaseline: false,
              writesCriticalPathFacts: false,
              writesAccelerationDraft: false,
            },
          },
        }] as T[]
      }
      if (assetPattern.startsWith('construction_organization.plan_network_release_exit_handoff.')) {
        return [{
          id: 'release-exit-handoff-event-ready',
          asset_key: 'construction_organization.plan_network_release_exit_handoff.ready',
          source_module: 'constructionOrganizationPlanNetworkDraftService.releaseExitHandoff',
          event_status: 'review_required',
          runtime_effect: 'candidate_only',
          created_at: '2026-06-21T16:00:00.000Z',
          updated_at: '2026-06-21T16:00:00.000Z',
          candidate_payload: {
            draftNetworkKey: readyDraft.draftNetworkKey,
            originalCandidateEventId: 'event-ready',
            handoffCandidateEventId: 'handoff-event-ready',
            approvalCandidateEventId: 'approval-event-ready',
            optionId: 'option-ready',
            selectedScenarioIds: readyItem.selectedScenarioIds,
            releaseRecordTarget: 'construction-org-plan-network-release:project-1',
            rollbackTarget: 'construction-org-plan-network-rollback:project-1',
            consumerVerificationRefs: ['gantt.taskDependencyReadModel'],
            impactMonitoringRefs: ['constructionOrganizationPlanNetworkImpactMonitor'],
            rollbackWriterRefs: ['constructionOrganizationPlanNetworkDomainWriter.rollback'],
            proposedDependencyEdges: readyItem.reviewPackage.proposedDependencyEdges,
            runtimeMutationBoundary: {
              writesTaskDependencies: false,
              writesPlanDates: false,
              writesSeed: false,
              writesBaseline: false,
              writesCriticalPathFacts: false,
              writesAccelerationDraft: false,
            },
          },
        }] as T[]
      }
      if (String(sql).includes('FROM public.construction_organization_plan_network_runtime_publications')) {
        return [{
          id: 'runtime-publication-1',
          publication_key: 'construction-org-plan-network-release:project-1',
          project_id: '00000000-0000-4000-8000-000000000001',
          draft_network_key: readyDraft.draftNetworkKey,
          release_handoff_candidate_event_id: 'release-exit-handoff-event-ready',
          runtime_publication_status: 'runtime_published',
          applied_dependency_count: 2,
          rollback_target: 'construction-org-plan-network-rollback:project-1',
          published_at: '2026-06-22T02:00:00.000Z',
        }] as T[]
      }
      if (String(sql).includes('FROM public.runtime_consumer_observations')) {
        return [{
          asset_key: 'construction_organization_plan_network',
          publication_key: 'construction-org-plan-network-release:project-1',
          consumer_key: 'gantt.taskDependencyReadModel',
          consumer_surface: 'task_dependency_gantt_read_model',
          observation_status: 'observed',
          observation_context: {
            projectId: '00000000-0000-4000-8000-000000000001',
            businessType: 'general_civil',
            draftNetworkKey: readyDraft.draftNetworkKey,
            optionId: 'option-ready',
          },
          observed_at: '2026-06-22T02:05:00.000Z',
        }] as T[]
      }
      if (assetPattern.startsWith('construction_organization.plan_option.')) {
        return [{
          id: 'event-ready',
          asset_key: 'construction_organization.plan_option.option-ready',
          source_module: 'constructionOrganizationScenarioGovernanceService',
          company_id: '10000000-0000-4000-8000-000000000001',
          project_id: '00000000-0000-4000-8000-000000000001',
          event_status: 'review_required',
          runtime_effect: 'candidate_only',
          candidate_payload: {
            option: {
              optionId: 'option-ready',
              selectedScenarioIds: readyItem.selectedScenarioIds,
              engineEvaluationSummary: readyItem.engineEvaluationSummary,
              useCaseEvaluations: readyItem.useCaseEvaluations,
              generatedRowProjection: {
                materializationReviewPackage: readyItem.reviewPackage,
                generatedRowReferenceDurationEvidence: readyItem.generatedRowReferenceDurationEvidence,
                generatedRowNetworkEvaluation: readyItem.generatedRowNetworkEvaluation,
              },
            },
          },
        }] as T[]
      }
      return [] as T[]
    }

    const report = await listConstructionOrganizationPlanNetworkDrafts({
      companyId: '10000000-0000-4000-8000-000000000001',
      projectId: '00000000-0000-4000-8000-000000000001',
      queryExec,
    })

    expect(report.runtimeMaterializationReadiness).toEqual(expect.objectContaining({
      source: 'construction_organization_plan_network_runtime_materialization_readiness',
      canMaterializeRuntime: false,
      domainWriterRuntimeExecutionCount: 1,
      readyForDomainWriterExecutionCount: 1,
      runtimeConsumerObservationCount: 1,
      readyForRuntimeConsumerObservationCount: 1,
      missingBeforeRuntime: expect.not.arrayContaining([
        'domain_writer_runtime_execution_required',
        'runtime_consumer_observation_required',
      ]),
    }))
    expect(report.runtimeMaterializationReadiness.missingBeforeRuntime).toEqual(expect.arrayContaining([
      'post_materialization_impact_monitoring_result_required',
      'rollback_execution_verification_required',
    ]))
    const sqlText = calls.map((call) => call.sql).join('\n')
    expect(sqlText).toContain('FROM public.construction_organization_plan_network_runtime_publications')
    expect(sqlText).toContain('FROM public.runtime_consumer_observations')
  })

  it('does not count legacy runtime consumer observations that lack project and option network anchors', async () => {
    const readyItem = buildReviewPackageItem()
    const readyDraft = buildConstructionOrganizationPlanNetworkDraftFromReviewPackageItem(readyItem)
    const queryExec = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> => {
      const assetPattern = readConstructionOrganizationAssetPattern(params)
      if (assetPattern.startsWith('construction_organization.plan_network_handoff.')) {
        return [{
          id: 'handoff-event-ready',
          asset_key: 'construction_organization.plan_network_handoff.ready',
          source_module: 'constructionOrganizationPlanNetworkDraftService.manualReviewHandoff',
          event_status: 'review_required',
          runtime_effect: 'candidate_only',
          created_at: '2026-06-21T14:00:00.000Z',
          updated_at: '2026-06-21T14:00:00.000Z',
          candidate_payload: {
            draftNetworkKey: readyDraft.draftNetworkKey,
            originalCandidateEventId: 'event-ready',
            optionId: 'option-ready',
            selectedScenarioIds: readyItem.selectedScenarioIds,
            reviewPackage: {
              reviewOperation: 'manual_review_dependency_proposal',
              proposedDependencyEdges: readyItem.reviewPackage.proposedDependencyEdges,
              writesTaskDependencies: false,
              writesPlanDates: false,
              writesCriticalPathFacts: false,
            },
            runtimeMutationBoundary: {
              writesTaskDependencies: false,
              writesPlanDates: false,
              writesSeed: false,
              writesBaseline: false,
              writesCriticalPathFacts: false,
              writesAccelerationDraft: false,
            },
          },
        }] as T[]
      }
      if (assetPattern.startsWith('construction_organization.plan_network_approval.')) {
        return [{
          id: 'approval-event-ready',
          asset_key: 'construction_organization.plan_network_approval.ready',
          source_module: 'constructionOrganizationPlanNetworkDraftService.manualReviewApproval',
          event_status: 'approved',
          runtime_effect: 'candidate_only',
          created_at: '2026-06-21T15:00:00.000Z',
          updated_at: '2026-06-21T15:00:00.000Z',
          candidate_payload: {
            draftNetworkKey: readyDraft.draftNetworkKey,
            handoffCandidateEventId: 'handoff-event-ready',
            approvalDecision: 'approved_for_release_exit_preparation',
            runtimeMutationBoundary: {
              writesTaskDependencies: false,
              writesPlanDates: false,
              writesSeed: false,
              writesBaseline: false,
              writesCriticalPathFacts: false,
              writesAccelerationDraft: false,
            },
          },
        }] as T[]
      }
      if (assetPattern.startsWith('construction_organization.plan_network_release_exit_handoff.')) {
        return [{
          id: 'release-exit-handoff-event-ready',
          asset_key: 'construction_organization.plan_network_release_exit_handoff.ready',
          source_module: 'constructionOrganizationPlanNetworkDraftService.releaseExitHandoff',
          event_status: 'review_required',
          runtime_effect: 'candidate_only',
          created_at: '2026-06-21T16:00:00.000Z',
          updated_at: '2026-06-21T16:00:00.000Z',
          candidate_payload: {
            draftNetworkKey: readyDraft.draftNetworkKey,
            originalCandidateEventId: 'event-ready',
            handoffCandidateEventId: 'handoff-event-ready',
            approvalCandidateEventId: 'approval-event-ready',
            optionId: 'option-ready',
            selectedScenarioIds: readyItem.selectedScenarioIds,
            releaseRecordTarget: 'construction-org-plan-network-release:project-1',
            rollbackTarget: 'construction-org-plan-network-rollback:project-1',
            consumerVerificationRefs: ['gantt.taskDependencyReadModel'],
            impactMonitoringRefs: ['constructionOrganizationPlanNetworkImpactMonitor'],
            rollbackWriterRefs: ['constructionOrganizationPlanNetworkDomainWriter.rollback'],
            proposedDependencyEdges: readyItem.reviewPackage.proposedDependencyEdges,
            runtimeMutationBoundary: {
              writesTaskDependencies: false,
              writesPlanDates: false,
              writesSeed: false,
              writesBaseline: false,
              writesCriticalPathFacts: false,
              writesAccelerationDraft: false,
            },
          },
        }] as T[]
      }
      if (String(sql).includes('FROM public.construction_organization_plan_network_runtime_publications')) {
        return [{
          id: 'runtime-publication-1',
          publication_key: 'construction-org-plan-network-release:project-1',
          project_id: '00000000-0000-4000-8000-000000000001',
          draft_network_key: readyDraft.draftNetworkKey,
          release_handoff_candidate_event_id: 'release-exit-handoff-event-ready',
          runtime_publication_status: 'runtime_published',
          applied_dependency_count: 2,
          rollback_target: 'construction-org-plan-network-rollback:project-1',
          published_at: '2026-06-22T02:00:00.000Z',
        }] as T[]
      }
      if (String(sql).includes('FROM public.runtime_consumer_observations')) {
        return [{
          asset_key: 'construction_organization_plan_network',
          publication_key: 'construction-org-plan-network-release:project-1',
          consumer_key: 'scheduleAccelerationRuntimeService',
          consumer_surface: 'schedule_acceleration_runtime',
          observation_status: 'observed',
          observation_context: {
            businessType: 'general_civil',
          },
          observed_at: '2026-06-22T02:05:00.000Z',
        }] as T[]
      }
      if (assetPattern.startsWith('construction_organization.plan_option.')) {
        return [{
          id: 'event-ready',
          asset_key: 'construction_organization.plan_option.option-ready',
          source_module: 'constructionOrganizationScenarioGovernanceService',
          company_id: '10000000-0000-4000-8000-000000000001',
          project_id: '00000000-0000-4000-8000-000000000001',
          event_status: 'review_required',
          runtime_effect: 'candidate_only',
          candidate_payload: {
            option: {
              optionId: 'option-ready',
              selectedScenarioIds: readyItem.selectedScenarioIds,
              engineEvaluationSummary: readyItem.engineEvaluationSummary,
              useCaseEvaluations: readyItem.useCaseEvaluations,
              generatedRowProjection: {
                materializationReviewPackage: readyItem.reviewPackage,
                generatedRowReferenceDurationEvidence: readyItem.generatedRowReferenceDurationEvidence,
                generatedRowNetworkEvaluation: readyItem.generatedRowNetworkEvaluation,
              },
            },
          },
        }] as T[]
      }
      return [] as T[]
    }

    const report = await listConstructionOrganizationPlanNetworkDrafts({
      companyId: '10000000-0000-4000-8000-000000000001',
      projectId: '00000000-0000-4000-8000-000000000001',
      queryExec,
    })

    expect(report.runtimeMaterializationReadiness).toEqual(expect.objectContaining({
      runtimeConsumerObservationCount: 0,
      readyForRuntimeConsumerObservationCount: 0,
      missingBeforeRuntime: expect.arrayContaining([
        'runtime_consumer_observation_required',
      ]),
    }))
  })

  it('reads impact monitoring and rollback runtime events without granting materialization completion', async () => {
    const readyItem = buildReviewPackageItem()
    const readyDraft = buildConstructionOrganizationPlanNetworkDraftFromReviewPackageItem(readyItem)
    const calls: Array<{ sql: string, params: unknown[] }> = []
    const queryExec = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> => {
      calls.push({ sql, params })
      const assetPattern = readConstructionOrganizationAssetPattern(params)
      if (assetPattern.startsWith('construction_organization.plan_network_handoff.')) {
        return [{
          id: 'handoff-event-ready',
          asset_key: 'construction_organization.plan_network_handoff.ready',
          source_module: 'constructionOrganizationPlanNetworkDraftService.manualReviewHandoff',
          event_status: 'review_required',
          runtime_effect: 'candidate_only',
          created_at: '2026-06-21T14:00:00.000Z',
          updated_at: '2026-06-21T14:00:00.000Z',
          candidate_payload: {
            draftNetworkKey: readyDraft.draftNetworkKey,
            originalCandidateEventId: 'event-ready',
            optionId: 'option-ready',
            selectedScenarioIds: readyItem.selectedScenarioIds,
            reviewPackage: {
              reviewOperation: 'manual_review_dependency_proposal',
              proposedDependencyEdges: readyItem.reviewPackage.proposedDependencyEdges,
              writesTaskDependencies: false,
              writesPlanDates: false,
              writesCriticalPathFacts: false,
            },
            runtimeMutationBoundary: {
              writesTaskDependencies: false,
              writesPlanDates: false,
              writesSeed: false,
              writesBaseline: false,
              writesCriticalPathFacts: false,
              writesAccelerationDraft: false,
            },
          },
        }] as T[]
      }
      if (assetPattern.startsWith('construction_organization.plan_network_approval.')) {
        return [{
          id: 'approval-event-ready',
          asset_key: 'construction_organization.plan_network_approval.ready',
          source_module: 'constructionOrganizationPlanNetworkDraftService.manualReviewApproval',
          event_status: 'approved',
          runtime_effect: 'candidate_only',
          created_at: '2026-06-21T15:00:00.000Z',
          updated_at: '2026-06-21T15:00:00.000Z',
          candidate_payload: {
            draftNetworkKey: readyDraft.draftNetworkKey,
            handoffCandidateEventId: 'handoff-event-ready',
            approvalDecision: 'approved_for_release_exit_preparation',
            runtimeMutationBoundary: {
              writesTaskDependencies: false,
              writesPlanDates: false,
              writesSeed: false,
              writesBaseline: false,
              writesCriticalPathFacts: false,
              writesAccelerationDraft: false,
            },
          },
        }] as T[]
      }
      if (assetPattern.startsWith('construction_organization.plan_network_release_exit_handoff.')) {
        return [{
          id: 'release-exit-handoff-event-ready',
          asset_key: 'construction_organization.plan_network_release_exit_handoff.ready',
          source_module: 'constructionOrganizationPlanNetworkDraftService.releaseExitHandoff',
          event_status: 'review_required',
          runtime_effect: 'candidate_only',
          created_at: '2026-06-21T16:00:00.000Z',
          updated_at: '2026-06-21T16:00:00.000Z',
          candidate_payload: {
            draftNetworkKey: readyDraft.draftNetworkKey,
            originalCandidateEventId: 'event-ready',
            handoffCandidateEventId: 'handoff-event-ready',
            approvalCandidateEventId: 'approval-event-ready',
            optionId: 'option-ready',
            selectedScenarioIds: readyItem.selectedScenarioIds,
            releaseRecordTarget: 'construction-org-plan-network-release:project-1',
            rollbackTarget: 'construction-org-plan-network-rollback:project-1',
            consumerVerificationRefs: ['gantt.taskDependencyReadModel'],
            impactMonitoringRefs: ['constructionOrganizationPlanNetworkImpactMonitor'],
            rollbackWriterRefs: ['constructionOrganizationPlanNetworkDomainWriter.rollback'],
            proposedDependencyEdges: readyItem.reviewPackage.proposedDependencyEdges,
            runtimeMutationBoundary: {
              writesTaskDependencies: false,
              writesPlanDates: false,
              writesSeed: false,
              writesBaseline: false,
              writesCriticalPathFacts: false,
              writesAccelerationDraft: false,
            },
          },
        }] as T[]
      }
      if (String(sql).includes('FROM public.construction_organization_plan_network_runtime_publications')) {
        return [{
          id: 'runtime-publication-1',
          publication_key: 'construction-org-plan-network-release:project-1',
          project_id: '00000000-0000-4000-8000-000000000001',
          draft_network_key: readyDraft.draftNetworkKey,
          release_handoff_candidate_event_id: 'release-exit-handoff-event-ready',
          runtime_publication_status: 'runtime_published',
          applied_dependency_count: 2,
          rollback_target: 'construction-org-plan-network-rollback:project-1',
          published_at: '2026-06-22T02:00:00.000Z',
        }] as T[]
      }
      if (String(sql).includes('FROM public.runtime_consumer_observations')) {
        return [{
          asset_key: 'construction_organization_plan_network',
          publication_key: 'construction-org-plan-network-release:project-1',
          consumer_key: 'gantt.taskDependencyReadModel',
          consumer_surface: 'task_dependency_gantt_read_model',
          observation_status: 'observed',
          observation_context: {
            projectId: '00000000-0000-4000-8000-000000000001',
            businessType: 'general_civil',
            draftNetworkKey: readyDraft.draftNetworkKey,
            optionId: 'option-ready',
          },
          observed_at: '2026-06-22T02:05:00.000Z',
        }] as T[]
      }
      if (String(sql).includes('FROM public.construction_organization_plan_network_runtime_events')) {
        return [{
          event_type: 'impact_monitoring',
          event_status: 'monitoring_passed',
          source_publication_key: 'construction-org-plan-network-release:project-1',
          event_payload: {
            projectId: '00000000-0000-4000-8000-000000000001',
            businessType: 'general_civil',
            draftNetworkKey: readyDraft.draftNetworkKey,
            optionId: 'option-ready',
          },
          executed_at: '2026-06-22T03:00:00.000Z',
        }, {
          event_type: 'rollback_execution',
          event_status: 'rollback_executed',
          source_publication_key: 'construction-org-plan-network-release:project-1',
          event_payload: {
            projectId: '00000000-0000-4000-8000-000000000001',
            businessType: 'general_civil',
            draftNetworkKey: readyDraft.draftNetworkKey,
            optionId: 'option-ready',
          },
          executed_at: '2026-06-22T03:05:00.000Z',
        }] as T[]
      }
      if (String(sql).includes('FROM public.duration_plan_network_outcomes')) {
        return [] as T[]
      }
      if (assetPattern.startsWith('construction_organization.plan_option.')) {
        return [{
          id: 'event-ready',
          asset_key: 'construction_organization.plan_option.option-ready',
          source_module: 'constructionOrganizationScenarioGovernanceService',
          company_id: '10000000-0000-4000-8000-000000000001',
          project_id: '00000000-0000-4000-8000-000000000001',
          event_status: 'review_required',
          runtime_effect: 'candidate_only',
          candidate_payload: {
            option: {
              optionId: 'option-ready',
              selectedScenarioIds: readyItem.selectedScenarioIds,
              engineEvaluationSummary: readyItem.engineEvaluationSummary,
              useCaseEvaluations: readyItem.useCaseEvaluations,
              generatedRowProjection: {
                materializationReviewPackage: readyItem.reviewPackage,
                generatedRowReferenceDurationEvidence: readyItem.generatedRowReferenceDurationEvidence,
                generatedRowNetworkEvaluation: readyItem.generatedRowNetworkEvaluation,
              },
            },
          },
        }] as T[]
      }
      return [] as T[]
    }

    const report = await listConstructionOrganizationPlanNetworkDrafts({
      companyId: '10000000-0000-4000-8000-000000000001',
      projectId: '00000000-0000-4000-8000-000000000001',
      queryExec,
    })

    expect(report.runtimeMaterializationReadiness).toEqual(expect.objectContaining({
      source: 'construction_organization_plan_network_runtime_materialization_readiness',
      canMaterializeRuntime: false,
      runtimeImpactMonitoringResultCount: 1,
      readyForRuntimeImpactMonitoringResultCount: 1,
      rollbackExecutionVerificationCount: 1,
      readyForRollbackExecutionVerificationCount: 1,
      missingBeforeRuntime: expect.not.arrayContaining([
        'domain_writer_runtime_execution_required',
        'runtime_consumer_observation_required',
        'post_materialization_impact_monitoring_result_required',
        'rollback_execution_verification_required',
      ]),
    }))
    expect(report.runtimeMaterializationReadiness.missingBeforeRuntime).toEqual([
      'saved_network_outcome_required',
      'true_per_option_runtime_e1_e3_e5_evidence_required',
    ])
    const sqlText = calls.map((call) => call.sql).join('\n')
    expect(sqlText).toContain('FROM public.construction_organization_plan_network_runtime_events')
    expect(sqlText).toContain('FROM public.duration_plan_network_outcomes')
  })

  it('reads saved plan-network outcomes from the canonical outcome table without granting materialization completion', async () => {
    const readyItem = buildReviewPackageItem()
    const readyDraft = buildConstructionOrganizationPlanNetworkDraftFromReviewPackageItem(readyItem)
    const calls: Array<{ sql: string, params: unknown[] }> = []
    const queryExec = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> => {
      calls.push({ sql, params })
      const assetPattern = readConstructionOrganizationAssetPattern(params)
      if (assetPattern.startsWith('construction_organization.plan_network_handoff.')) {
        return [{
          id: 'handoff-event-ready',
          asset_key: 'construction_organization.plan_network_handoff.ready',
          source_module: 'constructionOrganizationPlanNetworkDraftService.manualReviewHandoff',
          event_status: 'review_required',
          runtime_effect: 'candidate_only',
          created_at: '2026-06-21T14:00:00.000Z',
          updated_at: '2026-06-21T14:00:00.000Z',
          candidate_payload: {
            draftNetworkKey: readyDraft.draftNetworkKey,
            originalCandidateEventId: 'event-ready',
            optionId: 'option-ready',
            selectedScenarioIds: readyItem.selectedScenarioIds,
            reviewPackage: {
              reviewOperation: 'manual_review_dependency_proposal',
              proposedDependencyEdges: readyItem.reviewPackage.proposedDependencyEdges,
              writesTaskDependencies: false,
              writesPlanDates: false,
              writesCriticalPathFacts: false,
            },
            runtimeMutationBoundary: {
              writesTaskDependencies: false,
              writesPlanDates: false,
              writesSeed: false,
              writesBaseline: false,
              writesCriticalPathFacts: false,
              writesAccelerationDraft: false,
            },
          },
        }] as T[]
      }
      if (assetPattern.startsWith('construction_organization.plan_network_approval.')) {
        return [{
          id: 'approval-event-ready',
          asset_key: 'construction_organization.plan_network_approval.ready',
          source_module: 'constructionOrganizationPlanNetworkDraftService.manualReviewApproval',
          event_status: 'approved',
          runtime_effect: 'candidate_only',
          created_at: '2026-06-21T15:00:00.000Z',
          updated_at: '2026-06-21T15:00:00.000Z',
          candidate_payload: {
            draftNetworkKey: readyDraft.draftNetworkKey,
            handoffCandidateEventId: 'handoff-event-ready',
            approvalDecision: 'approved_for_release_exit_preparation',
            runtimeMutationBoundary: {
              writesTaskDependencies: false,
              writesPlanDates: false,
              writesSeed: false,
              writesBaseline: false,
              writesCriticalPathFacts: false,
              writesAccelerationDraft: false,
            },
          },
        }] as T[]
      }
      if (assetPattern.startsWith('construction_organization.plan_network_release_exit_handoff.')) {
        return [{
          id: 'release-exit-handoff-event-ready',
          asset_key: 'construction_organization.plan_network_release_exit_handoff.ready',
          source_module: 'constructionOrganizationPlanNetworkDraftService.releaseExitHandoff',
          event_status: 'review_required',
          runtime_effect: 'candidate_only',
          created_at: '2026-06-21T16:00:00.000Z',
          updated_at: '2026-06-21T16:00:00.000Z',
          candidate_payload: {
            draftNetworkKey: readyDraft.draftNetworkKey,
            originalCandidateEventId: 'event-ready',
            handoffCandidateEventId: 'handoff-event-ready',
            approvalCandidateEventId: 'approval-event-ready',
            optionId: 'option-ready',
            selectedScenarioIds: readyItem.selectedScenarioIds,
            releaseRecordTarget: 'construction-org-plan-network-release:project-1',
            rollbackTarget: 'construction-org-plan-network-rollback:project-1',
            consumerVerificationRefs: ['gantt.taskDependencyReadModel'],
            impactMonitoringRefs: ['constructionOrganizationPlanNetworkImpactMonitor'],
            rollbackWriterRefs: ['constructionOrganizationPlanNetworkDomainWriter.rollback'],
            proposedDependencyEdges: readyItem.reviewPackage.proposedDependencyEdges,
            runtimeMutationBoundary: {
              writesTaskDependencies: false,
              writesPlanDates: false,
              writesSeed: false,
              writesBaseline: false,
              writesCriticalPathFacts: false,
              writesAccelerationDraft: false,
            },
          },
        }] as T[]
      }
      if (String(sql).includes('FROM public.construction_organization_plan_network_runtime_publications')) {
        return [{
          id: 'runtime-publication-1',
          publication_key: 'construction-org-plan-network-release:project-1',
          project_id: '00000000-0000-4000-8000-000000000001',
          draft_network_key: readyDraft.draftNetworkKey,
          release_handoff_candidate_event_id: 'release-exit-handoff-event-ready',
          runtime_publication_status: 'runtime_published',
          applied_dependency_count: 2,
          rollback_target: 'construction-org-plan-network-rollback:project-1',
          published_at: '2026-06-22T02:00:00.000Z',
        }] as T[]
      }
      if (String(sql).includes('FROM public.runtime_consumer_observations')) {
        return [{
          asset_key: 'construction_organization_plan_network',
          publication_key: 'construction-org-plan-network-release:project-1',
          consumer_key: 'gantt.taskDependencyReadModel',
          consumer_surface: 'task_dependency_gantt_read_model',
          observation_status: 'observed',
          observation_context: {
            projectId: '00000000-0000-4000-8000-000000000001',
            businessType: 'general_civil',
            draftNetworkKey: readyDraft.draftNetworkKey,
            optionId: 'option-ready',
          },
          observed_at: '2026-06-22T02:05:00.000Z',
        }] as T[]
      }
      if (String(sql).includes('FROM public.construction_organization_plan_network_runtime_events')) {
        return [{
          event_type: 'impact_monitoring',
          event_status: 'monitoring_passed',
          source_publication_key: 'construction-org-plan-network-release:project-1',
          event_payload: {
            projectId: '00000000-0000-4000-8000-000000000001',
            businessType: 'general_civil',
            draftNetworkKey: readyDraft.draftNetworkKey,
            optionId: 'option-ready',
          },
          executed_at: '2026-06-22T03:00:00.000Z',
        }, {
          event_type: 'rollback_execution',
          event_status: 'rollback_executed',
          source_publication_key: 'construction-org-plan-network-release:project-1',
          event_payload: {
            projectId: '00000000-0000-4000-8000-000000000001',
            businessType: 'general_civil',
            draftNetworkKey: readyDraft.draftNetworkKey,
            optionId: 'option-ready',
          },
          executed_at: '2026-06-22T03:05:00.000Z',
        }] as T[]
      }
      if (String(sql).includes('FROM public.duration_plan_network_outcomes')) {
        return [{
          asset_key: 'construction_organization_plan_network',
          publication_key: 'construction-org-plan-network-release:project-1',
          outcome_status: 'accepted',
          outcome_ref: 'network_outcomes:construction-org-plan-network-release:project-1',
          learning_scope: 'project',
          metadata: {
            projectId: '00000000-0000-4000-8000-000000000001',
            businessType: 'general_civil',
            draftNetworkKey: readyDraft.draftNetworkKey,
            optionId: 'option-ready',
          },
          observed_at: '2026-06-22T03:10:00.000Z',
        }] as T[]
      }
      if (assetPattern.startsWith('construction_organization.plan_option.')) {
        return [{
          id: 'event-ready',
          asset_key: 'construction_organization.plan_option.option-ready',
          source_module: 'constructionOrganizationScenarioGovernanceService',
          company_id: '10000000-0000-4000-8000-000000000001',
          project_id: '00000000-0000-4000-8000-000000000001',
          event_status: 'review_required',
          runtime_effect: 'candidate_only',
          candidate_payload: {
            option: {
              optionId: 'option-ready',
              selectedScenarioIds: readyItem.selectedScenarioIds,
              engineEvaluationSummary: readyItem.engineEvaluationSummary,
              useCaseEvaluations: readyItem.useCaseEvaluations,
              generatedRowProjection: {
                materializationReviewPackage: readyItem.reviewPackage,
                generatedRowReferenceDurationEvidence: readyItem.generatedRowReferenceDurationEvidence,
                generatedRowNetworkEvaluation: readyItem.generatedRowNetworkEvaluation,
              },
            },
          },
        }] as T[]
      }
      return [] as T[]
    }

    const report = await listConstructionOrganizationPlanNetworkDrafts({
      companyId: '10000000-0000-4000-8000-000000000001',
      projectId: '00000000-0000-4000-8000-000000000001',
      queryExec,
    })

    expect(report.runtimeMaterializationReadiness).toEqual(expect.objectContaining({
      source: 'construction_organization_plan_network_runtime_materialization_readiness',
      canMaterializeRuntime: false,
      savedNetworkOutcomeCount: 1,
      readyForSavedNetworkOutcomeCount: 1,
      missingBeforeRuntime: expect.not.arrayContaining([
        'saved_network_outcome_required',
      ]),
    }))
    expect(report.runtimeMaterializationReadiness.missingBeforeRuntime).toEqual([
      'true_per_option_runtime_e1_e3_e5_evidence_required',
    ])
    const sqlText = calls.map((call) => call.sql).join('\n')
    expect(sqlText).toContain('FROM public.duration_plan_network_outcomes')
  })

  it('clears the per-option runtime engine blocker only when E1 E3 and E5 accuracy evidence exists for the saved publication', async () => {
    const readyItem = buildReviewPackageItem()
    const readyDraft = buildConstructionOrganizationPlanNetworkDraftFromReviewPackageItem(readyItem)
    const publicationKey = 'construction-org-plan-network-release:project-1'
    const calls: Array<{ sql: string, params: unknown[] }> = []
    const queryExec = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> => {
      calls.push({ sql, params })
      const assetPattern = readConstructionOrganizationAssetPattern(params)
      if (assetPattern.startsWith('construction_organization.plan_network_handoff.')) {
        return [{
          id: 'handoff-event-ready',
          asset_key: 'construction_organization.plan_network_handoff.ready',
          source_module: 'constructionOrganizationPlanNetworkDraftService.manualReviewHandoff',
          event_status: 'review_required',
          runtime_effect: 'candidate_only',
          created_at: '2026-06-21T14:00:00.000Z',
          updated_at: '2026-06-21T14:00:00.000Z',
          candidate_payload: {
            draftNetworkKey: readyDraft.draftNetworkKey,
            originalCandidateEventId: 'event-ready',
            optionId: 'option-ready',
            selectedScenarioIds: readyItem.selectedScenarioIds,
            reviewPackage: {
              reviewOperation: 'manual_review_dependency_proposal',
              proposedDependencyEdges: readyItem.reviewPackage.proposedDependencyEdges,
              writesTaskDependencies: false,
              writesPlanDates: false,
              writesCriticalPathFacts: false,
            },
            runtimeMutationBoundary: {
              writesTaskDependencies: false,
              writesPlanDates: false,
              writesSeed: false,
              writesBaseline: false,
              writesCriticalPathFacts: false,
              writesAccelerationDraft: false,
            },
          },
        }] as T[]
      }
      if (assetPattern.startsWith('construction_organization.plan_network_approval.')) {
        return [{
          id: 'approval-event-ready',
          asset_key: 'construction_organization.plan_network_approval.ready',
          source_module: 'constructionOrganizationPlanNetworkDraftService.manualReviewApproval',
          event_status: 'approved',
          runtime_effect: 'candidate_only',
          created_at: '2026-06-21T15:00:00.000Z',
          updated_at: '2026-06-21T15:00:00.000Z',
          candidate_payload: {
            draftNetworkKey: readyDraft.draftNetworkKey,
            handoffCandidateEventId: 'handoff-event-ready',
            approvalDecision: 'approved_for_release_exit_preparation',
            runtimeMutationBoundary: {
              writesTaskDependencies: false,
              writesPlanDates: false,
              writesSeed: false,
              writesBaseline: false,
              writesCriticalPathFacts: false,
              writesAccelerationDraft: false,
            },
          },
        }] as T[]
      }
      if (assetPattern.startsWith('construction_organization.plan_network_release_exit_handoff.')) {
        return [{
          id: 'release-exit-handoff-event-ready',
          asset_key: 'construction_organization.plan_network_release_exit_handoff.ready',
          source_module: 'constructionOrganizationPlanNetworkDraftService.releaseExitHandoff',
          event_status: 'review_required',
          runtime_effect: 'candidate_only',
          created_at: '2026-06-21T16:00:00.000Z',
          updated_at: '2026-06-21T16:00:00.000Z',
          candidate_payload: {
            draftNetworkKey: readyDraft.draftNetworkKey,
            originalCandidateEventId: 'event-ready',
            handoffCandidateEventId: 'handoff-event-ready',
            approvalCandidateEventId: 'approval-event-ready',
            optionId: 'option-ready',
            selectedScenarioIds: readyItem.selectedScenarioIds,
            releaseRecordTarget: publicationKey,
            rollbackTarget: 'construction-org-plan-network-rollback:project-1',
            consumerVerificationRefs: ['gantt.taskDependencyReadModel'],
            impactMonitoringRefs: ['constructionOrganizationPlanNetworkImpactMonitor'],
            rollbackWriterRefs: ['constructionOrganizationPlanNetworkDomainWriter.rollback'],
            proposedDependencyEdges: readyItem.reviewPackage.proposedDependencyEdges,
            runtimeMutationBoundary: {
              writesTaskDependencies: false,
              writesPlanDates: false,
              writesSeed: false,
              writesBaseline: false,
              writesCriticalPathFacts: false,
              writesAccelerationDraft: false,
            },
          },
        }] as T[]
      }
      if (String(sql).includes('FROM public.construction_organization_plan_network_runtime_publications')) {
        return [{
          publication_key: publicationKey,
          project_id: '00000000-0000-4000-8000-000000000001',
          draft_network_key: readyDraft.draftNetworkKey,
          release_handoff_candidate_event_id: 'release-exit-handoff-event-ready',
          runtime_publication_status: 'runtime_published',
          applied_dependency_count: 2,
          rollback_target: 'construction-org-plan-network-rollback:project-1',
          published_at: '2026-06-22T02:00:00.000Z',
        }] as T[]
      }
      if (String(sql).includes('FROM public.runtime_consumer_observations')) {
        return [{
          asset_key: 'construction_organization_plan_network',
          publication_key: publicationKey,
          consumer_key: 'gantt.taskDependencyReadModel',
          consumer_surface: 'task_dependency_gantt_read_model',
          observation_status: 'observed',
          observation_context: {
            projectId: '00000000-0000-4000-8000-000000000001',
            businessType: 'hospital',
            draftNetworkKey: readyDraft.draftNetworkKey,
            optionId: 'option-ready',
          },
          observed_at: '2026-06-22T02:05:00.000Z',
        }] as T[]
      }
      if (String(sql).includes('FROM public.construction_organization_plan_network_runtime_events')) {
        return [{
          event_type: 'impact_monitoring',
          event_status: 'monitoring_passed',
          source_publication_key: publicationKey,
          event_payload: {
            projectId: '00000000-0000-4000-8000-000000000001',
            businessType: 'hospital',
            draftNetworkKey: readyDraft.draftNetworkKey,
            optionId: 'option-ready',
          },
          executed_at: '2026-06-22T03:00:00.000Z',
        }, {
          event_type: 'rollback_execution',
          event_status: 'rollback_executed',
          source_publication_key: publicationKey,
          event_payload: {
            projectId: '00000000-0000-4000-8000-000000000001',
            businessType: 'hospital',
            draftNetworkKey: readyDraft.draftNetworkKey,
            optionId: 'option-ready',
          },
          executed_at: '2026-06-22T03:05:00.000Z',
        }] as T[]
      }
      if (String(sql).includes('FROM public.duration_plan_network_outcomes')) {
        return [{
          asset_key: 'construction_organization_plan_network',
          publication_key: publicationKey,
          outcome_status: 'accepted',
          outcome_ref: `network_outcomes:${publicationKey}`,
          learning_scope: 'project',
          metadata: {
            projectId: '00000000-0000-4000-8000-000000000001',
            businessType: 'hospital',
            draftNetworkKey: readyDraft.draftNetworkKey,
            optionId: 'option-ready',
          },
          observed_at: '2026-06-22T03:10:00.000Z',
        }] as T[]
      }
      if (String(sql).includes('FROM public.duration_algorithm_accuracy_events')) {
        return [
          {
            id: 'accuracy-e1',
            engine_code: 'standard_duration_reference',
            backtest_status: 'backtested',
            absolute_error_days: 1,
            prediction_context: {
              assetKey: 'construction_organization_plan_network',
              publicationKey,
              businessType: 'hospital',
              projectId: '00000000-0000-4000-8000-000000000001',
              draftNetworkKey: readyDraft.draftNetworkKey,
              optionId: 'option-ready',
            },
            actual_context: {
              assetKey: 'construction_organization_plan_network',
              publicationKey,
              businessType: 'hospital',
              projectId: '00000000-0000-4000-8000-000000000001',
              draftNetworkKey: readyDraft.draftNetworkKey,
              optionId: 'option-ready',
            },
            backtested_at: '2026-06-22T04:00:00.000Z',
          },
          {
            id: 'accuracy-e3',
            engine_code: 'critical_path_cpm',
            backtest_status: 'backtested',
            absolute_error_days: 2,
            prediction_context: {
              assetKey: 'construction_organization_plan_network',
              runtimePublicationKey: publicationKey,
              businessType: 'hospital',
              projectId: '00000000-0000-4000-8000-000000000001',
              draftNetworkKey: readyDraft.draftNetworkKey,
              optionId: 'option-ready',
            },
            actual_context: {
              assetKey: 'construction_organization_plan_network',
              runtimePublicationKey: publicationKey,
              businessType: 'hospital',
              projectId: '00000000-0000-4000-8000-000000000001',
              draftNetworkKey: readyDraft.draftNetworkKey,
              optionId: 'option-ready',
            },
            backtested_at: '2026-06-22T04:05:00.000Z',
          },
          {
            id: 'accuracy-e5',
            engine_code: 'schedule_acceleration_target',
            backtest_status: 'backtested',
            absolute_error_days: 0,
            prediction_context: {
              assetKey: 'construction_organization_plan_network',
              publicationKey,
              businessType: 'hospital',
              projectId: '00000000-0000-4000-8000-000000000001',
              draftNetworkKey: readyDraft.draftNetworkKey,
              optionId: 'option-ready',
            },
            actual_context: {
              assetKey: 'construction_organization_plan_network',
              publicationKey,
              businessType: 'hospital',
              projectId: '00000000-0000-4000-8000-000000000001',
              draftNetworkKey: readyDraft.draftNetworkKey,
              optionId: 'option-ready',
            },
            backtested_at: '2026-06-22T04:10:00.000Z',
          },
        ] as T[]
      }
      if (assetPattern.startsWith('construction_organization.plan_option.')) {
        return [{
          id: 'event-ready',
          asset_key: 'construction_organization.plan_option.option-ready',
          source_module: 'constructionOrganizationScenarioGovernanceService',
          company_id: '10000000-0000-4000-8000-000000000001',
          project_id: '00000000-0000-4000-8000-000000000001',
          event_status: 'review_required',
          runtime_effect: 'candidate_only',
          candidate_payload: {
            factBasis: readyItem.factBasis,
            option: {
              optionId: 'option-ready',
              selectedScenarioIds: readyItem.selectedScenarioIds,
              engineEvaluationSummary: readyItem.engineEvaluationSummary,
              useCaseEvaluations: readyItem.useCaseEvaluations,
              generatedRowProjection: {
                materializationReviewPackage: readyItem.reviewPackage,
                generatedRowReferenceDurationEvidence: readyItem.generatedRowReferenceDurationEvidence,
                generatedRowNetworkEvaluation: readyItem.generatedRowNetworkEvaluation,
              },
            },
          },
        }] as T[]
      }
      return [] as T[]
    }

    const report = await listConstructionOrganizationPlanNetworkDrafts({
      companyId: '10000000-0000-4000-8000-000000000001',
      projectId: '00000000-0000-4000-8000-000000000001',
      queryExec,
    })

    expect(report.runtimeMaterializationReadiness).toEqual(expect.objectContaining({
      status: 'runtime_materialization_evidence_ready',
      canMaterializeRuntime: false,
      perOptionRuntimeEngineEvidenceCount: 3,
      readyForPerOptionRuntimeEngineEvidenceCount: 1,
      missingBeforeRuntime: expect.not.arrayContaining([
        'true_per_option_runtime_e1_e3_e5_evidence_required',
      ]),
    }))
    expect(report.runtimeMaterializationReadiness.missingBeforeRuntime).toEqual([])
    expect(report.runtimeCloseoutClaim).toEqual(expect.objectContaining({
      source: 'construction_organization_plan_network_runtime_closeout_claim',
      status: 'runtime_closeout_claim_blocked',
      canClaimRuntimeCloseout: false,
      canMaterializeRuntime: false,
      claimBasis: [],
      missingBeforeClaim: expect.arrayContaining([
        'runtime_use_case_coverage_required:newProjectPlanning',
        'runtime_use_case_coverage_required:startingLineOnboarding',
        'runtime_use_case_coverage_required:accelerationRecovery',
        'site_adoption_of_runtime_recommended_option_required',
      ]),
      mutationBoundary: {
        writesTaskDependencies: false,
        writesPlanDates: false,
        writesSeed: false,
        writesBaseline: false,
        writesCriticalPathFacts: false,
        writesAccelerationDraft: false,
      },
    }))
    expect(report.runtimeRecommendedOption).toEqual(expect.objectContaining({
      source: 'construction_organization_plan_network_runtime_recommended_option',
      status: 'runtime_recommended_option_ready',
      optionId: 'option-ready',
      siteDecision: null,
      siteDecisionMatchesRuntimeRecommendation: null,
      boundaryPolicy: expect.arrayContaining([
      'runtime_recommended_option_does_not_auto_adopt_site_plan',
      ]),
    }))

    const queryExecWithUntypedSiteAdoption = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> => {
      if (String(sql).includes('FROM public.recommendation_actions')) {
        return [{
          project_id: '00000000-0000-4000-8000-000000000001',
          recommendation_kind: 'construction_organization_plan_network',
          recommendation_key: 'construction_organization_plan_network:option-ready',
          action_type: 'adopted',
          adopted_at: '2026-06-22T06:00:00.000Z',
          adopted_by: 'user-1',
          action_context: {
            optionId: 'option-ready',
            draftNetworkKey: readyDraft.draftNetworkKey,
            publicationKey,
            selectedScenarioIds: readyItem.selectedScenarioIds,
            decisionAction: 'adopted',
            writesRuntimeDirectly: false,
            writesFactDirectly: false,
            writesTaskDependencies: false,
            writesPlanDates: false,
            writesSeed: false,
            writesBaseline: false,
            writesCriticalPathFacts: false,
            writesAccelerationDraft: false,
          },
        }] as T[]
      }
      return queryExec(sql, params)
    }

    const untypedAdoptedReport = await listConstructionOrganizationPlanNetworkDrafts({
      companyId: '10000000-0000-4000-8000-000000000001',
      projectId: '00000000-0000-4000-8000-000000000001',
      queryExec: queryExecWithUntypedSiteAdoption,
    })

    expect(untypedAdoptedReport.runtimeRecommendedOption).toEqual(expect.objectContaining({
      source: 'construction_organization_plan_network_runtime_recommended_option',
      status: 'runtime_recommended_option_ready',
      optionId: 'option-ready',
      siteDecision: expect.objectContaining({
        actionType: 'adopted',
        optionId: 'option-ready',
        draftNetworkKey: readyDraft.draftNetworkKey,
        publicationKey,
      }),
      siteDecisionMatchesRuntimeRecommendation: false,
    }))
    expect(untypedAdoptedReport.runtimeCloseoutClaim).toEqual(expect.objectContaining({
      source: 'construction_organization_plan_network_runtime_closeout_claim',
      status: 'runtime_closeout_claim_blocked',
      canClaimRuntimeCloseout: false,
      canMaterializeRuntime: false,
      claimBasis: [],
      missingBeforeClaim: expect.arrayContaining([
        'runtime_business_type_attribution_required',
        'site_adoption_of_runtime_recommended_option_required',
      ]),
    }))

    const queryExecWithConflictingSiteAdoption = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> => {
      if (String(sql).includes('FROM public.recommendation_actions')) {
        return [{
          project_id: '00000000-0000-4000-8000-000000000001',
          recommendation_kind: 'construction_organization_plan_network',
          recommendation_key: 'construction_organization_plan_network:option-ready',
          action_type: 'adopted',
          adopted_at: '2026-06-22T06:00:00.000Z',
          adopted_by: 'user-1',
          action_context: {
            businessType: 'hospital',
            optionId: 'option-conflict',
            publicationKey,
            selectedScenarioIds: readyItem.selectedScenarioIds,
            decisionAction: 'adopted',
            writesRuntimeDirectly: false,
            writesFactDirectly: false,
            writesTaskDependencies: false,
            writesPlanDates: false,
            writesSeed: false,
            writesBaseline: false,
            writesCriticalPathFacts: false,
            writesAccelerationDraft: false,
          },
        }] as T[]
      }
      return queryExec(sql, params)
    }

    const conflictingAdoptedReport = await listConstructionOrganizationPlanNetworkDrafts({
      companyId: '10000000-0000-4000-8000-000000000001',
      projectId: '00000000-0000-4000-8000-000000000001',
      queryExec: queryExecWithConflictingSiteAdoption,
    })

    expect(conflictingAdoptedReport.runtimeRecommendedOption).toEqual(expect.objectContaining({
      source: 'construction_organization_plan_network_runtime_recommended_option',
      status: 'runtime_recommended_option_ready',
      optionId: 'option-ready',
      siteDecision: expect.objectContaining({
        actionType: 'adopted',
        optionId: 'option-conflict',
        publicationKey,
      }),
      siteDecisionMatchesRuntimeRecommendation: false,
    }))
    expect(conflictingAdoptedReport.runtimeCloseoutClaim).toEqual(expect.objectContaining({
      source: 'construction_organization_plan_network_runtime_closeout_claim',
      status: 'runtime_closeout_claim_blocked',
      canClaimRuntimeCloseout: false,
      claimBasis: [],
      missingBeforeClaim: expect.arrayContaining([
        'site_adoption_of_runtime_recommended_option_required',
      ]),
    }))

    const queryExecWithSiteAdoption = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> => {
      if (String(sql).includes('FROM public.recommendation_actions')) {
        return [{
          project_id: '00000000-0000-4000-8000-000000000001',
          recommendation_kind: 'construction_organization_plan_network',
          recommendation_key: 'construction_organization_plan_network:option-ready',
          action_type: 'adopted',
          adopted_at: '2026-06-22T06:00:00.000Z',
          adopted_by: 'user-1',
          action_context: {
            businessType: 'hospital',
            optionId: 'option-ready',
            draftNetworkKey: readyDraft.draftNetworkKey,
            publicationKey,
            selectedScenarioIds: readyItem.selectedScenarioIds,
            decisionAction: 'adopted',
            writesRuntimeDirectly: false,
            writesFactDirectly: false,
            writesTaskDependencies: false,
            writesPlanDates: false,
            writesSeed: false,
            writesBaseline: false,
            writesCriticalPathFacts: false,
            writesAccelerationDraft: false,
          },
        }] as T[]
      }
      return queryExec(sql, params)
    }

    const adoptedReport = await listConstructionOrganizationPlanNetworkDrafts({
      companyId: '10000000-0000-4000-8000-000000000001',
      projectId: '00000000-0000-4000-8000-000000000001',
      queryExec: queryExecWithSiteAdoption,
    })

    expect(adoptedReport.runtimeCloseoutClaim).toEqual(expect.objectContaining({
      source: 'construction_organization_plan_network_runtime_closeout_claim',
      status: 'runtime_closeout_claim_blocked',
      canClaimRuntimeCloseout: false,
      canMaterializeRuntime: false,
      claimBasis: [],
      missingBeforeClaim: expect.arrayContaining([
        'runtime_use_case_coverage_required:newProjectPlanning',
        'runtime_use_case_coverage_required:startingLineOnboarding',
        'runtime_use_case_coverage_required:accelerationRecovery',
      ]),
    }))
    const companyWideReport = await listConstructionOrganizationPlanNetworkDrafts({
      companyId: '10000000-0000-4000-8000-000000000001',
      projectId: null,
      queryExec: queryExecWithSiteAdoption,
    })

    expect(companyWideReport.runtimeCloseoutClaimsByProject?.['00000000-0000-4000-8000-000000000001'])
      .toEqual(expect.objectContaining({
        status: 'runtime_closeout_claim_blocked',
        canClaimRuntimeCloseout: false,
        missingBeforeClaim: expect.arrayContaining([
          'runtime_use_case_coverage_required:newProjectPlanning',
          'runtime_use_case_coverage_required:startingLineOnboarding',
          'runtime_use_case_coverage_required:accelerationRecovery',
        ]),
      }))

    const queryExecWithUntypedRuntimeEvidence = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> => {
      const rows = await queryExecWithSiteAdoption<T>(sql, params)
      if (String(sql).includes('FROM public.runtime_consumer_observations')) {
        return (rows as any[]).map((row) => ({
          ...row,
          observation_context: {},
        })) as T[]
      }
      if (String(sql).includes('FROM public.construction_organization_plan_network_runtime_events')) {
        return (rows as any[]).map((row) => ({
          ...row,
          event_payload: {},
        })) as T[]
      }
      if (String(sql).includes('FROM public.duration_plan_network_outcomes')) {
        return (rows as any[]).map((row) => ({
          ...row,
          metadata: {},
        })) as T[]
      }
      if (String(sql).includes('FROM public.duration_algorithm_accuracy_events')) {
        return (rows as any[]).map((row) => ({
          ...row,
          prediction_context: {
            ...row.prediction_context,
            businessType: undefined,
          },
          actual_context: {
            ...row.actual_context,
            businessType: undefined,
          },
        })) as T[]
      }
      return rows
    }
    const untypedRuntimeEvidenceReport = await listConstructionOrganizationPlanNetworkDrafts({
      companyId: '10000000-0000-4000-8000-000000000001',
      projectId: null,
      queryExec: queryExecWithUntypedRuntimeEvidence,
    })

    expect(untypedRuntimeEvidenceReport.runtimeCloseoutClaimsByProject?.['00000000-0000-4000-8000-000000000001'])
      .toEqual(expect.objectContaining({
        status: 'runtime_closeout_claim_blocked',
        canClaimRuntimeCloseout: false,
        missingBeforeClaim: expect.arrayContaining([
          'runtime_business_type_attribution_required',
        ]),
      }))
    expect(report.optionComparisonPackage.options[0]).toEqual(expect.objectContaining({
      runtimeEngineEvidenceStatus: 'runtime_engine_evidence_ready',
      presentRuntimeEngineCodes: ['E1', 'E3', 'E5'],
      missingRuntimeEngineCodes: [],
      canClaimTruePerOptionRuntimeEvaluation: true,
      nextGovernanceAction: 'runtime_engine_evidence_ready',
      nextGovernanceReasons: expect.arrayContaining([
        'true_per_option_runtime_e1_e3_e5_evidence_ready',
        'runtime_materialization_boundary_remains_read_only',
      ]),
    }))
    const sqlText = calls.map((call) => call.sql).join('\n')
    expect(sqlText).toContain('FROM public.duration_algorithm_accuracy_events')
    expect(sqlText).not.toMatch(/\b(insert\s+into|update\s+|delete\s+from)\b/)
  })

  it('does not count pre-publication runtime evidence in report-level materialization readiness', async () => {
    const readyItem = buildReviewPackageItem()
    const readyDraft = buildConstructionOrganizationPlanNetworkDraftFromReviewPackageItem(readyItem)
    const publicationKey = 'construction-org-plan-network-release:project-1'
    const prePublicationAt = '2026-06-22T01:30:00.000Z'
    const queryExec = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> => {
      const assetPattern = readConstructionOrganizationAssetPattern(params)
      if (assetPattern.startsWith('construction_organization.plan_network_handoff.')) {
        return [{
          id: 'handoff-event-ready',
          asset_key: 'construction_organization.plan_network_handoff.ready',
          source_module: 'constructionOrganizationPlanNetworkDraftService.manualReviewHandoff',
          event_status: 'review_required',
          runtime_effect: 'candidate_only',
          created_at: '2026-06-21T14:00:00.000Z',
          updated_at: '2026-06-21T14:00:00.000Z',
          candidate_payload: {
            draftNetworkKey: readyDraft.draftNetworkKey,
            originalCandidateEventId: 'event-ready',
            optionId: 'option-ready',
            selectedScenarioIds: readyItem.selectedScenarioIds,
            reviewPackage: { proposedDependencyEdges: readyItem.reviewPackage.proposedDependencyEdges },
            runtimeMutationBoundary: {
              writesTaskDependencies: false,
              writesPlanDates: false,
              writesSeed: false,
              writesBaseline: false,
              writesCriticalPathFacts: false,
              writesAccelerationDraft: false,
            },
          },
        }] as T[]
      }
      if (assetPattern.startsWith('construction_organization.plan_network_approval.')) {
        return [{
          id: 'approval-event-ready',
          asset_key: 'construction_organization.plan_network_approval.ready',
          source_module: 'constructionOrganizationPlanNetworkDraftService.manualReviewApproval',
          event_status: 'approved',
          runtime_effect: 'candidate_only',
          created_at: '2026-06-21T15:00:00.000Z',
          updated_at: '2026-06-21T15:00:00.000Z',
          candidate_payload: {
            draftNetworkKey: readyDraft.draftNetworkKey,
            handoffCandidateEventId: 'handoff-event-ready',
            approvalDecision: 'approved_for_release_exit_preparation',
            runtimeMutationBoundary: {
              writesTaskDependencies: false,
              writesPlanDates: false,
              writesSeed: false,
              writesBaseline: false,
              writesCriticalPathFacts: false,
              writesAccelerationDraft: false,
            },
          },
        }] as T[]
      }
      if (assetPattern.startsWith('construction_organization.plan_network_release_exit_handoff.')) {
        return [{
          id: 'release-exit-handoff-event-ready',
          asset_key: 'construction_organization.plan_network_release_exit_handoff.ready',
          source_module: 'constructionOrganizationPlanNetworkDraftService.releaseExitHandoff',
          event_status: 'review_required',
          runtime_effect: 'candidate_only',
          created_at: '2026-06-21T16:00:00.000Z',
          updated_at: '2026-06-21T16:00:00.000Z',
          candidate_payload: {
            draftNetworkKey: readyDraft.draftNetworkKey,
            originalCandidateEventId: 'event-ready',
            handoffCandidateEventId: 'handoff-event-ready',
            approvalCandidateEventId: 'approval-event-ready',
            optionId: 'option-ready',
            selectedScenarioIds: readyItem.selectedScenarioIds,
            releaseRecordTarget: publicationKey,
            rollbackTarget: 'construction-org-plan-network-rollback:project-1',
            consumerVerificationRefs: ['gantt.taskDependencyReadModel'],
            impactMonitoringRefs: ['constructionOrganizationPlanNetworkImpactMonitor'],
            rollbackWriterRefs: ['constructionOrganizationPlanNetworkDomainWriter.rollback'],
            proposedDependencyEdges: readyItem.reviewPackage.proposedDependencyEdges,
            runtimeMutationBoundary: {
              writesTaskDependencies: false,
              writesPlanDates: false,
              writesSeed: false,
              writesBaseline: false,
              writesCriticalPathFacts: false,
              writesAccelerationDraft: false,
            },
          },
        }] as T[]
      }
      if (String(sql).includes('FROM public.construction_organization_plan_network_runtime_publications')) {
        return [{
          publication_key: publicationKey,
          project_id: '00000000-0000-4000-8000-000000000001',
          draft_network_key: readyDraft.draftNetworkKey,
          release_handoff_candidate_event_id: 'release-exit-handoff-event-ready',
          runtime_publication_status: 'runtime_published',
          applied_dependency_count: 2,
          rollback_target: 'construction-org-plan-network-rollback:project-1',
          published_at: '2026-06-22T02:00:00.000Z',
        }] as T[]
      }
      if (String(sql).includes('FROM public.runtime_consumer_observations')) {
        return [{
          asset_key: 'construction_organization_plan_network',
          publication_key: publicationKey,
          consumer_key: 'gantt.taskDependencyReadModel',
          consumer_surface: 'task_dependency_gantt_read_model',
          observation_status: 'observed',
          observation_context: {
            projectId: '00000000-0000-4000-8000-000000000001',
            businessType: 'hospital',
            draftNetworkKey: readyDraft.draftNetworkKey,
            optionId: 'option-ready',
          },
          observed_at: prePublicationAt,
        }] as T[]
      }
      if (String(sql).includes('FROM public.construction_organization_plan_network_runtime_events')) {
        return [{
          event_type: 'impact_monitoring',
          event_status: 'monitoring_passed',
          source_publication_key: publicationKey,
          event_payload: {
            projectId: '00000000-0000-4000-8000-000000000001',
            businessType: 'hospital',
            draftNetworkKey: readyDraft.draftNetworkKey,
            optionId: 'option-ready',
          },
          executed_at: prePublicationAt,
        }, {
          event_type: 'rollback_execution',
          event_status: 'rollback_executed',
          source_publication_key: publicationKey,
          event_payload: {
            projectId: '00000000-0000-4000-8000-000000000001',
            businessType: 'hospital',
            draftNetworkKey: readyDraft.draftNetworkKey,
            optionId: 'option-ready',
          },
          executed_at: prePublicationAt,
        }] as T[]
      }
      if (String(sql).includes('FROM public.duration_plan_network_outcomes')) {
        return [{
          asset_key: 'construction_organization_plan_network',
          publication_key: publicationKey,
          outcome_status: 'accepted',
          outcome_ref: `network_outcomes:${publicationKey}`,
          learning_scope: 'project',
          metadata: {
            projectId: '00000000-0000-4000-8000-000000000001',
            businessType: 'hospital',
            draftNetworkKey: readyDraft.draftNetworkKey,
            optionId: 'option-ready',
          },
          observed_at: prePublicationAt,
        }] as T[]
      }
      if (String(sql).includes('FROM public.duration_algorithm_accuracy_events')) {
        return [
          {
            id: 'accuracy-e1',
            engine_code: 'standard_duration_reference',
            backtest_status: 'backtested',
            absolute_error_days: 1,
            prediction_context: {
              assetKey: 'construction_organization_plan_network',
              publicationKey,
              businessType: 'hospital',
              projectId: '00000000-0000-4000-8000-000000000001',
              draftNetworkKey: readyDraft.draftNetworkKey,
              optionId: 'option-ready',
            },
            actual_context: {
              assetKey: 'construction_organization_plan_network',
              publicationKey,
              businessType: 'hospital',
              projectId: '00000000-0000-4000-8000-000000000001',
              draftNetworkKey: readyDraft.draftNetworkKey,
              optionId: 'option-ready',
            },
            backtested_at: prePublicationAt,
          },
          {
            id: 'accuracy-e3',
            engine_code: 'critical_path_cpm',
            backtest_status: 'backtested',
            absolute_error_days: 2,
            prediction_context: {
              assetKey: 'construction_organization_plan_network',
              runtimePublicationKey: publicationKey,
              businessType: 'hospital',
              projectId: '00000000-0000-4000-8000-000000000001',
              draftNetworkKey: readyDraft.draftNetworkKey,
              optionId: 'option-ready',
            },
            actual_context: {
              assetKey: 'construction_organization_plan_network',
              runtimePublicationKey: publicationKey,
              businessType: 'hospital',
              projectId: '00000000-0000-4000-8000-000000000001',
              draftNetworkKey: readyDraft.draftNetworkKey,
              optionId: 'option-ready',
            },
            backtested_at: prePublicationAt,
          },
          {
            id: 'accuracy-e5',
            engine_code: 'schedule_acceleration_target',
            backtest_status: 'backtested',
            absolute_error_days: 0,
            prediction_context: {
              assetKey: 'construction_organization_plan_network',
              publicationKey,
              businessType: 'hospital',
              projectId: '00000000-0000-4000-8000-000000000001',
              draftNetworkKey: readyDraft.draftNetworkKey,
              optionId: 'option-ready',
            },
            actual_context: {
              assetKey: 'construction_organization_plan_network',
              publicationKey,
              businessType: 'hospital',
              projectId: '00000000-0000-4000-8000-000000000001',
              draftNetworkKey: readyDraft.draftNetworkKey,
              optionId: 'option-ready',
            },
            backtested_at: prePublicationAt,
          },
        ] as T[]
      }
      if (assetPattern.startsWith('construction_organization.plan_option.')) {
        return [{
          id: 'event-ready',
          asset_key: 'construction_organization.plan_option.option-ready',
          source_module: 'constructionOrganizationScenarioGovernanceService',
          company_id: '10000000-0000-4000-8000-000000000001',
          project_id: '00000000-0000-4000-8000-000000000001',
          event_status: 'review_required',
          runtime_effect: 'candidate_only',
          candidate_payload: {
            factBasis: readyItem.factBasis,
            option: {
              optionId: 'option-ready',
              selectedScenarioIds: readyItem.selectedScenarioIds,
              engineEvaluationSummary: readyItem.engineEvaluationSummary,
              useCaseEvaluations: readyItem.useCaseEvaluations,
              generatedRowProjection: {
                materializationReviewPackage: readyItem.reviewPackage,
                generatedRowReferenceDurationEvidence: readyItem.generatedRowReferenceDurationEvidence,
                generatedRowNetworkEvaluation: readyItem.generatedRowNetworkEvaluation,
              },
            },
          },
        }] as T[]
      }
      return [] as T[]
    }

    const report = await listConstructionOrganizationPlanNetworkDrafts({
      companyId: '10000000-0000-4000-8000-000000000001',
      projectId: '00000000-0000-4000-8000-000000000001',
      queryExec,
    })

    expect(report.runtimeMaterializationReadiness).toEqual(expect.objectContaining({
      status: 'blocked_candidate_only_after_release_exit_handoff',
      runtimeConsumerObservationCount: 1,
      readyForRuntimeConsumerObservationCount: 0,
      runtimeImpactMonitoringResultCount: 1,
      readyForRuntimeImpactMonitoringResultCount: 0,
      rollbackExecutionVerificationCount: 1,
      readyForRollbackExecutionVerificationCount: 0,
      savedNetworkOutcomeCount: 1,
      readyForSavedNetworkOutcomeCount: 0,
      perOptionRuntimeEngineEvidenceCount: 3,
      readyForPerOptionRuntimeEngineEvidenceCount: 0,
      missingBeforeRuntime: expect.arrayContaining([
        'runtime_consumer_observation_before_publication',
        'post_materialization_impact_monitoring_before_publication',
        'rollback_execution_before_publication',
        'saved_network_outcome_before_publication',
        'runtime_engine_evidence_before_publication',
      ]),
    }))
    expect(report.runtimeMaterializationReadiness.missingBeforeRuntime).toEqual(expect.arrayContaining([
      'runtime_consumer_observation_required',
      'post_materialization_impact_monitoring_result_required',
      'rollback_execution_verification_required',
      'saved_network_outcome_required',
      'true_per_option_runtime_e1_e3_e5_evidence_required',
    ]))
    expect(report.runtimeCloseoutClaim).toEqual(expect.objectContaining({
      status: 'runtime_closeout_claim_blocked',
      canClaimRuntimeCloseout: false,
      missingBeforeClaim: expect.arrayContaining([
        'runtime_consumer_observation_before_publication',
        'post_materialization_impact_monitoring_before_publication',
        'rollback_execution_before_publication',
        'saved_network_outcome_before_publication',
        'runtime_engine_evidence_before_publication',
      ]),
    }))
  })

  it('keeps runtime materialization blocked when only one published option has consumer monitoring rollback and outcome evidence', async () => {
    const readyItem = buildReviewPackageItem()
    const alternateItem = buildReviewPackageItem({
      candidateEventId: 'event-alternate',
      assetKey: 'construction_organization.plan_option.option-alternate',
      optionId: 'option-alternate',
      selectedScenarioIds: ['excavation_before_pile', 'tower_lane_early_release_after_core_basement'],
      reviewPackage: {
        ...buildReviewPackageItem().reviewPackage,
        optionId: 'option-alternate',
      },
      useCaseEvaluations: {
        newProjectPlanning: {
          useCase: 'new_project_planning',
          optionScore: 71,
          actionability: 'actionable_candidate',
          rankBasis: ['generated_row_projection_alignment'],
          writesTaskDependencies: false,
          writesPlanDates: false,
          writesSeed: false,
        },
        startingLineOnboarding: {
          useCase: 'starting_line_onboarding',
          optionScore: 59,
          actionability: 'evidence_only',
          rankBasis: ['starting_line_decision_locked'],
          writesTaskDependencies: false,
          writesPlanDates: false,
          writesSeed: false,
        },
        accelerationRecovery: {
          useCase: 'acceleration_recovery',
          optionScore: 73,
          recoveryFactorHint: 1.04,
          e5RecoverableSpanDays: 3,
          actionability: 'actionable_candidate',
          writesTaskDependencies: false,
          writesPlanDates: false,
          writesSeed: false,
        },
      },
    })
    const readyDraft = buildConstructionOrganizationPlanNetworkDraftFromReviewPackageItem(readyItem)
    const alternateDraft = buildConstructionOrganizationPlanNetworkDraftFromReviewPackageItem(alternateItem)
    const readyPublicationKey = 'construction-org-plan-network-release:project-1:ready'
    const alternatePublicationKey = 'construction-org-plan-network-release:project-1:alternate'
    const calls: Array<{ sql: string, params: unknown[] }> = []
    const accuracyRowsFor = (
      publicationKey: string,
      suffix: string,
      draftNetworkKey: string,
      optionId: string,
    ) => [
      {
        id: `accuracy-e1-${suffix}`,
        engine_code: 'standard_duration_reference',
        backtest_status: 'backtested',
        absolute_error_days: 1,
        prediction_context: {
          assetKey: 'construction_organization_plan_network',
          publicationKey,
          projectId: '00000000-0000-4000-8000-000000000001',
          businessType: 'general_civil',
          draftNetworkKey,
          optionId,
        },
        actual_context: {
          assetKey: 'construction_organization_plan_network',
          publicationKey,
          projectId: '00000000-0000-4000-8000-000000000001',
          businessType: 'general_civil',
          draftNetworkKey,
          optionId,
        },
        backtested_at: '2026-06-22T04:00:00.000Z',
      },
      {
        id: `accuracy-e3-${suffix}`,
        engine_code: 'critical_path_cpm',
        backtest_status: 'backtested',
        absolute_error_days: 2,
        prediction_context: {
          assetKey: 'construction_organization_plan_network',
          runtimePublicationKey: publicationKey,
          projectId: '00000000-0000-4000-8000-000000000001',
          businessType: 'general_civil',
          draftNetworkKey,
          optionId,
        },
        actual_context: {
          assetKey: 'construction_organization_plan_network',
          runtimePublicationKey: publicationKey,
          projectId: '00000000-0000-4000-8000-000000000001',
          businessType: 'general_civil',
          draftNetworkKey,
          optionId,
        },
        backtested_at: '2026-06-22T04:05:00.000Z',
      },
      {
        id: `accuracy-e5-${suffix}`,
        engine_code: 'schedule_acceleration_target',
        backtest_status: 'backtested',
        absolute_error_days: 0,
        prediction_context: {
          assetKey: 'construction_organization_plan_network',
          publicationKey,
          projectId: '00000000-0000-4000-8000-000000000001',
          businessType: 'general_civil',
          draftNetworkKey,
          optionId,
        },
        actual_context: {
          assetKey: 'construction_organization_plan_network',
          publicationKey,
          projectId: '00000000-0000-4000-8000-000000000001',
          businessType: 'general_civil',
          draftNetworkKey,
          optionId,
        },
        backtested_at: '2026-06-22T04:10:00.000Z',
      },
    ]
    const queryExec = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> => {
      calls.push({ sql, params })
      const assetPattern = readConstructionOrganizationAssetPattern(params)
      if (assetPattern.startsWith('construction_organization.plan_network_handoff.')) {
        return [
          {
            id: 'handoff-event-ready',
            asset_key: 'construction_organization.plan_network_handoff.ready',
            source_module: 'constructionOrganizationPlanNetworkDraftService.manualReviewHandoff',
            event_status: 'review_required',
            runtime_effect: 'candidate_only',
            created_at: '2026-06-21T14:00:00.000Z',
            updated_at: '2026-06-21T14:00:00.000Z',
            candidate_payload: {
              draftNetworkKey: readyDraft.draftNetworkKey,
              originalCandidateEventId: 'event-ready',
              optionId: 'option-ready',
              selectedScenarioIds: readyItem.selectedScenarioIds,
              reviewPackage: { proposedDependencyEdges: readyItem.reviewPackage.proposedDependencyEdges },
              runtimeMutationBoundary: {
                writesTaskDependencies: false,
                writesPlanDates: false,
                writesSeed: false,
                writesBaseline: false,
                writesCriticalPathFacts: false,
                writesAccelerationDraft: false,
              },
            },
          },
          {
            id: 'handoff-event-alternate',
            asset_key: 'construction_organization.plan_network_handoff.alternate',
            source_module: 'constructionOrganizationPlanNetworkDraftService.manualReviewHandoff',
            event_status: 'review_required',
            runtime_effect: 'candidate_only',
            created_at: '2026-06-21T14:01:00.000Z',
            updated_at: '2026-06-21T14:01:00.000Z',
            candidate_payload: {
              draftNetworkKey: alternateDraft.draftNetworkKey,
              originalCandidateEventId: 'event-alternate',
              optionId: 'option-alternate',
              selectedScenarioIds: alternateItem.selectedScenarioIds,
              reviewPackage: { proposedDependencyEdges: alternateItem.reviewPackage.proposedDependencyEdges },
              runtimeMutationBoundary: {
                writesTaskDependencies: false,
                writesPlanDates: false,
                writesSeed: false,
                writesBaseline: false,
                writesCriticalPathFacts: false,
                writesAccelerationDraft: false,
              },
            },
          },
        ] as T[]
      }
      if (assetPattern.startsWith('construction_organization.plan_network_approval.')) {
        return [
          {
            id: 'approval-event-ready',
            asset_key: 'construction_organization.plan_network_approval.ready',
            source_module: 'constructionOrganizationPlanNetworkDraftService.manualReviewApproval',
            event_status: 'approved',
            runtime_effect: 'candidate_only',
            created_at: '2026-06-21T15:00:00.000Z',
            updated_at: '2026-06-21T15:00:00.000Z',
            candidate_payload: {
              draftNetworkKey: readyDraft.draftNetworkKey,
              handoffCandidateEventId: 'handoff-event-ready',
              approvalDecision: 'approved_for_release_exit_preparation',
              runtimeMutationBoundary: {
                writesTaskDependencies: false,
                writesPlanDates: false,
                writesSeed: false,
                writesBaseline: false,
                writesCriticalPathFacts: false,
                writesAccelerationDraft: false,
              },
            },
          },
          {
            id: 'approval-event-alternate',
            asset_key: 'construction_organization.plan_network_approval.alternate',
            source_module: 'constructionOrganizationPlanNetworkDraftService.manualReviewApproval',
            event_status: 'approved',
            runtime_effect: 'candidate_only',
            created_at: '2026-06-21T15:01:00.000Z',
            updated_at: '2026-06-21T15:01:00.000Z',
            candidate_payload: {
              draftNetworkKey: alternateDraft.draftNetworkKey,
              handoffCandidateEventId: 'handoff-event-alternate',
              approvalDecision: 'approved_for_release_exit_preparation',
              runtimeMutationBoundary: {
                writesTaskDependencies: false,
                writesPlanDates: false,
                writesSeed: false,
                writesBaseline: false,
                writesCriticalPathFacts: false,
                writesAccelerationDraft: false,
              },
            },
          },
        ] as T[]
      }
      if (assetPattern.startsWith('construction_organization.plan_network_release_exit_handoff.')) {
        return [
          {
            id: 'release-exit-handoff-event-ready',
            asset_key: 'construction_organization.plan_network_release_exit_handoff.ready',
            source_module: 'constructionOrganizationPlanNetworkDraftService.releaseExitHandoff',
            event_status: 'review_required',
            runtime_effect: 'candidate_only',
            created_at: '2026-06-21T16:00:00.000Z',
            updated_at: '2026-06-21T16:00:00.000Z',
            candidate_payload: {
              draftNetworkKey: readyDraft.draftNetworkKey,
              originalCandidateEventId: 'event-ready',
              handoffCandidateEventId: 'handoff-event-ready',
              approvalCandidateEventId: 'approval-event-ready',
              optionId: 'option-ready',
              selectedScenarioIds: readyItem.selectedScenarioIds,
              releaseRecordTarget: readyPublicationKey,
              rollbackTarget: 'construction-org-plan-network-rollback:project-1:ready',
              consumerVerificationRefs: ['gantt.taskDependencyReadModel'],
              impactMonitoringRefs: ['constructionOrganizationPlanNetworkImpactMonitor'],
              rollbackWriterRefs: ['constructionOrganizationPlanNetworkDomainWriter.rollback'],
              proposedDependencyEdges: readyItem.reviewPackage.proposedDependencyEdges,
              runtimeMutationBoundary: {
                writesTaskDependencies: false,
                writesPlanDates: false,
                writesSeed: false,
                writesBaseline: false,
                writesCriticalPathFacts: false,
                writesAccelerationDraft: false,
              },
            },
          },
          {
            id: 'release-exit-handoff-event-alternate',
            asset_key: 'construction_organization.plan_network_release_exit_handoff.alternate',
            source_module: 'constructionOrganizationPlanNetworkDraftService.releaseExitHandoff',
            event_status: 'review_required',
            runtime_effect: 'candidate_only',
            created_at: '2026-06-21T16:01:00.000Z',
            updated_at: '2026-06-21T16:01:00.000Z',
            candidate_payload: {
              draftNetworkKey: alternateDraft.draftNetworkKey,
              originalCandidateEventId: 'event-alternate',
              handoffCandidateEventId: 'handoff-event-alternate',
              approvalCandidateEventId: 'approval-event-alternate',
              optionId: 'option-alternate',
              selectedScenarioIds: alternateItem.selectedScenarioIds,
              releaseRecordTarget: alternatePublicationKey,
              rollbackTarget: 'construction-org-plan-network-rollback:project-1:alternate',
              consumerVerificationRefs: ['gantt.taskDependencyReadModel'],
              impactMonitoringRefs: ['constructionOrganizationPlanNetworkImpactMonitor'],
              rollbackWriterRefs: ['constructionOrganizationPlanNetworkDomainWriter.rollback'],
              proposedDependencyEdges: alternateItem.reviewPackage.proposedDependencyEdges,
              runtimeMutationBoundary: {
                writesTaskDependencies: false,
                writesPlanDates: false,
                writesSeed: false,
                writesBaseline: false,
                writesCriticalPathFacts: false,
                writesAccelerationDraft: false,
              },
            },
          },
        ] as T[]
      }
      if (String(sql).includes('FROM public.construction_organization_plan_network_runtime_publications')) {
        return [
          {
            publication_key: readyPublicationKey,
            project_id: '00000000-0000-4000-8000-000000000001',
            draft_network_key: readyDraft.draftNetworkKey,
            release_handoff_candidate_event_id: 'release-exit-handoff-event-ready',
            runtime_publication_status: 'runtime_published',
            applied_dependency_count: 2,
            rollback_target: 'construction-org-plan-network-rollback:project-1:ready',
            published_at: '2026-06-22T02:00:00.000Z',
          },
          {
            publication_key: alternatePublicationKey,
            project_id: '00000000-0000-4000-8000-000000000001',
            draft_network_key: alternateDraft.draftNetworkKey,
            release_handoff_candidate_event_id: 'release-exit-handoff-event-alternate',
            runtime_publication_status: 'runtime_published',
            applied_dependency_count: 2,
            rollback_target: 'construction-org-plan-network-rollback:project-1:alternate',
            published_at: '2026-06-22T02:01:00.000Z',
          },
        ] as T[]
      }
      if (String(sql).includes('FROM public.runtime_consumer_observations')) {
        return [{
          asset_key: 'construction_organization_plan_network',
          publication_key: readyPublicationKey,
          consumer_key: 'gantt.taskDependencyReadModel',
          consumer_surface: 'task_dependency_gantt_read_model',
          observation_status: 'observed',
          observation_context: {
            projectId: '00000000-0000-4000-8000-000000000001',
            businessType: 'general_civil',
            draftNetworkKey: readyDraft.draftNetworkKey,
            optionId: 'option-ready',
          },
          observed_at: '2026-06-22T02:05:00.000Z',
        }] as T[]
      }
      if (String(sql).includes('FROM public.construction_organization_plan_network_runtime_events')) {
        return [
          {
            event_type: 'impact_monitoring',
            event_status: 'monitoring_passed',
            source_publication_key: readyPublicationKey,
            event_payload: {
              projectId: '00000000-0000-4000-8000-000000000001',
              businessType: 'general_civil',
              draftNetworkKey: readyDraft.draftNetworkKey,
              optionId: 'option-ready',
            },
            executed_at: '2026-06-22T03:00:00.000Z',
          },
          {
            event_type: 'rollback_execution',
            event_status: 'rollback_executed',
            source_publication_key: readyPublicationKey,
            event_payload: {
              projectId: '00000000-0000-4000-8000-000000000001',
              businessType: 'general_civil',
              draftNetworkKey: readyDraft.draftNetworkKey,
              optionId: 'option-ready',
            },
            executed_at: '2026-06-22T03:05:00.000Z',
          },
        ] as T[]
      }
      if (String(sql).includes('FROM public.duration_plan_network_outcomes')) {
        return [{
          asset_key: 'construction_organization_plan_network',
          publication_key: readyPublicationKey,
          outcome_status: 'accepted',
          outcome_ref: `network_outcomes:${readyPublicationKey}`,
          learning_scope: 'project',
          metadata: {
            projectId: '00000000-0000-4000-8000-000000000001',
            businessType: 'general_civil',
            draftNetworkKey: readyDraft.draftNetworkKey,
            optionId: 'option-ready',
          },
          observed_at: '2026-06-22T03:10:00.000Z',
        }] as T[]
      }
      if (String(sql).includes('FROM public.duration_algorithm_accuracy_events')) {
        return [
          ...accuracyRowsFor(readyPublicationKey, 'ready', readyDraft.draftNetworkKey, 'option-ready'),
          ...accuracyRowsFor(alternatePublicationKey, 'alternate', alternateDraft.draftNetworkKey, 'option-alternate'),
        ] as T[]
      }
      if (String(sql).includes('FROM public.recommendation_actions')) {
        return [{
          project_id: '00000000-0000-4000-8000-000000000001',
          recommendation_kind: 'construction_organization_plan_network',
          recommendation_key: 'construction_organization_plan_network:option-ready',
          action_type: 'adopted',
          adopted_at: '2026-06-22T06:00:00.000Z',
          adopted_by: 'user-1',
          action_context: {
            optionId: 'option-ready',
            draftNetworkKey: readyDraft.draftNetworkKey,
            publicationKey: readyPublicationKey,
            selectedScenarioIds: readyItem.selectedScenarioIds,
            decisionAction: 'adopted',
            writesRuntimeDirectly: false,
            writesFactDirectly: false,
            writesTaskDependencies: false,
            writesPlanDates: false,
            writesSeed: false,
            writesBaseline: false,
            writesCriticalPathFacts: false,
            writesAccelerationDraft: false,
          },
        }] as T[]
      }
      if (assetPattern.startsWith('construction_organization.plan_option.')) {
        return [
          {
            id: 'event-ready',
            asset_key: 'construction_organization.plan_option.option-ready',
            source_module: 'constructionOrganizationScenarioGovernanceService',
            company_id: '10000000-0000-4000-8000-000000000001',
            project_id: '00000000-0000-4000-8000-000000000001',
            event_status: 'review_required',
            runtime_effect: 'candidate_only',
            candidate_payload: {
              option: {
                optionId: 'option-ready',
                selectedScenarioIds: readyItem.selectedScenarioIds,
                engineEvaluationSummary: readyItem.engineEvaluationSummary,
                useCaseEvaluations: readyItem.useCaseEvaluations,
                generatedRowProjection: {
                  materializationReviewPackage: readyItem.reviewPackage,
                  generatedRowReferenceDurationEvidence: readyItem.generatedRowReferenceDurationEvidence,
                  generatedRowNetworkEvaluation: readyItem.generatedRowNetworkEvaluation,
                },
              },
            },
          },
          {
            id: 'event-alternate',
            asset_key: 'construction_organization.plan_option.option-alternate',
            source_module: 'constructionOrganizationScenarioGovernanceService',
            company_id: '10000000-0000-4000-8000-000000000001',
            project_id: '00000000-0000-4000-8000-000000000001',
            event_status: 'review_required',
            runtime_effect: 'candidate_only',
            candidate_payload: {
              option: {
                optionId: 'option-alternate',
                selectedScenarioIds: alternateItem.selectedScenarioIds,
                engineEvaluationSummary: alternateItem.engineEvaluationSummary,
                useCaseEvaluations: alternateItem.useCaseEvaluations,
                generatedRowProjection: {
                  materializationReviewPackage: alternateItem.reviewPackage,
                  generatedRowReferenceDurationEvidence: alternateItem.generatedRowReferenceDurationEvidence,
                  generatedRowNetworkEvaluation: alternateItem.generatedRowNetworkEvaluation,
                },
              },
            },
          },
        ] as T[]
      }
      return [] as T[]
    }

    const report = await listConstructionOrganizationPlanNetworkDrafts({
      companyId: '10000000-0000-4000-8000-000000000001',
      projectId: '00000000-0000-4000-8000-000000000001',
      queryExec,
    })

    expect(report.runtimeMaterializationReadiness).toEqual(expect.objectContaining({
      status: 'blocked_candidate_only_after_release_exit_handoff',
      totalDraftCount: 2,
      domainWriterRuntimeExecutionCount: 2,
      readyForDomainWriterExecutionCount: 2,
      runtimeConsumerObservationCount: 1,
      readyForRuntimeConsumerObservationCount: 1,
      runtimeImpactMonitoringResultCount: 1,
      readyForRuntimeImpactMonitoringResultCount: 1,
      rollbackExecutionVerificationCount: 1,
      readyForRollbackExecutionVerificationCount: 1,
      savedNetworkOutcomeCount: 1,
      readyForSavedNetworkOutcomeCount: 1,
      perOptionRuntimeEngineEvidenceCount: 6,
      readyForPerOptionRuntimeEngineEvidenceCount: 2,
    }))
    expect(report.runtimeMaterializationReadiness.missingBeforeRuntime).toEqual(expect.arrayContaining([
      'runtime_consumer_observation_required',
      'post_materialization_impact_monitoring_result_required',
      'rollback_execution_verification_required',
      'saved_network_outcome_required',
    ]))
    expect(report.runtimeMaterializationReadiness.missingBeforeRuntime).not.toContain(
      'true_per_option_runtime_e1_e3_e5_evidence_required',
    )
    expect(report.runtimeRecommendedOption).toEqual(expect.objectContaining({
      source: 'construction_organization_plan_network_runtime_recommended_option',
      status: 'runtime_recommended_option_ready',
      optionId: 'option-ready',
      draftNetworkKey: readyDraft.draftNetworkKey,
      publicationKey: readyPublicationKey,
      canAutoAdoptRuntimeOption: false,
      siteDecision: expect.objectContaining({
        source: 'construction_organization_plan_network_recommendation_decision_projection',
        actionType: 'adopted',
        optionId: 'option-ready',
        draftNetworkKey: readyDraft.draftNetworkKey,
        publicationKey: readyPublicationKey,
        decidedAt: '2026-06-22T06:00:00.000Z',
        decidedBy: 'user-1',
        writesTaskDependencies: false,
        writesPlanDates: false,
        writesSeed: false,
        writesBaseline: false,
        writesCriticalPathFacts: false,
        writesAccelerationDraft: false,
      }),
      siteDecisionMatchesRuntimeRecommendation: true,
      recommendationBasis: expect.arrayContaining([
        'runtime_materialization_evidence_ready_for_option',
        'saved_network_outcome:accepted',
        'ranked_by_acceleration_recovery_score_after_runtime_evidence_gate',
      ]),
      rejectedOptionIds: ['option-alternate'],
      rejectedReasonsByOptionId: {
        'option-alternate': expect.arrayContaining([
          'runtime_consumer_observation_required',
          'post_materialization_impact_monitoring_result_required',
          'rollback_execution_verification_required',
          'saved_network_outcome_required',
        ]),
      },
      mutationBoundary: {
        writesTaskDependencies: false,
        writesPlanDates: false,
        writesSeed: false,
        writesBaseline: false,
        writesCriticalPathFacts: false,
        writesAccelerationDraft: false,
      },
    }))
    expect(report.optionComparisonPackage.options).toEqual(expect.arrayContaining([
      expect.objectContaining({
        optionId: 'option-ready',
        recommendationDecision: expect.objectContaining({
          actionType: 'adopted',
          recommendationKey: 'construction_organization_plan_network:option-ready',
        }),
      }),
      expect.objectContaining({
        optionId: 'option-alternate',
        runtimeEngineEvidenceStatus: 'runtime_engine_evidence_ready',
        runtimeMaterializationEvidence: expect.objectContaining({
          source: 'construction_organization_plan_network_option_runtime_materialization_evidence',
          status: 'missing_runtime_evidence',
          publicationKey: alternatePublicationKey,
          missingBeforeRuntime: expect.arrayContaining([
            'runtime_consumer_observation_required',
            'post_materialization_impact_monitoring_result_required',
            'rollback_execution_verification_required',
            'saved_network_outcome_required',
          ]),
        }),
        nextGovernanceAction: 'runtime_materialization_evidence_required',
        nextGovernanceReasons: expect.arrayContaining([
          'runtime_consumer_observation_required',
          'post_materialization_impact_monitoring_result_required',
          'rollback_execution_verification_required',
          'saved_network_outcome_required',
        ]),
      }),
    ]))
    const sqlText = calls.map((call) => call.sql).join('\n')
    expect(sqlText).toContain('FROM public.duration_algorithm_accuracy_events')
    expect(sqlText).toContain('FROM public.recommendation_actions')
    expect(sqlText).not.toMatch(/\b(insert\s+into|update\s+|delete\s+from)\b/)
  })

  it('derives runtime use cases only from full-chain same-use-case runtime evidence', async () => {
    const readyItem = buildReviewPackageItem()
    const readyDraft = buildConstructionOrganizationPlanNetworkDraftFromReviewPackageItem(readyItem)
    const publicationKey = 'construction-org-plan-network-release:project-1'
    const queryExec = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> => {
      const assetPattern = readConstructionOrganizationAssetPattern(params)
      if (assetPattern.startsWith('construction_organization.plan_network_handoff.')) {
        return [{
          id: 'handoff-event-ready',
          asset_key: 'construction_organization.plan_network_handoff.ready',
          source_module: 'constructionOrganizationPlanNetworkDraftService.manualReviewHandoff',
          event_status: 'review_required',
          runtime_effect: 'candidate_only',
          created_at: '2026-06-21T14:00:00.000Z',
          updated_at: '2026-06-21T14:00:00.000Z',
          candidate_payload: {
            draftNetworkKey: readyDraft.draftNetworkKey,
            originalCandidateEventId: 'event-ready',
            optionId: 'option-ready',
            selectedScenarioIds: readyItem.selectedScenarioIds,
            reviewPackage: {
              reviewOperation: 'manual_review_dependency_proposal',
              proposedDependencyEdges: readyItem.reviewPackage.proposedDependencyEdges,
              writesTaskDependencies: false,
              writesPlanDates: false,
              writesCriticalPathFacts: false,
            },
            runtimeMutationBoundary: {
              writesTaskDependencies: false,
              writesPlanDates: false,
              writesSeed: false,
              writesBaseline: false,
              writesCriticalPathFacts: false,
              writesAccelerationDraft: false,
            },
          },
        }] as T[]
      }
      if (assetPattern.startsWith('construction_organization.plan_network_approval.')) {
        return [{
          id: 'approval-event-ready',
          asset_key: 'construction_organization.plan_network_approval.ready',
          source_module: 'constructionOrganizationPlanNetworkDraftService.manualReviewApproval',
          event_status: 'approved',
          runtime_effect: 'candidate_only',
          created_at: '2026-06-21T15:00:00.000Z',
          updated_at: '2026-06-21T15:00:00.000Z',
          candidate_payload: {
            draftNetworkKey: readyDraft.draftNetworkKey,
            handoffCandidateEventId: 'handoff-event-ready',
            approvalDecision: 'approved_for_release_exit_preparation',
            runtimeMutationBoundary: {
              writesTaskDependencies: false,
              writesPlanDates: false,
              writesSeed: false,
              writesBaseline: false,
              writesCriticalPathFacts: false,
              writesAccelerationDraft: false,
            },
          },
        }] as T[]
      }
      if (assetPattern.startsWith('construction_organization.plan_network_release_exit_handoff.')) {
        return [{
          id: 'release-exit-handoff-event-ready',
          asset_key: 'construction_organization.plan_network_release_exit_handoff.ready',
          source_module: 'constructionOrganizationPlanNetworkDraftService.releaseExitHandoff',
          event_status: 'review_required',
          runtime_effect: 'candidate_only',
          created_at: '2026-06-21T16:00:00.000Z',
          updated_at: '2026-06-21T16:00:00.000Z',
          candidate_payload: {
            draftNetworkKey: readyDraft.draftNetworkKey,
            originalCandidateEventId: 'event-ready',
            handoffCandidateEventId: 'handoff-event-ready',
            approvalCandidateEventId: 'approval-event-ready',
            optionId: 'option-ready',
            selectedScenarioIds: readyItem.selectedScenarioIds,
            releaseRecordTarget: publicationKey,
            rollbackTarget: 'construction-org-plan-network-rollback:project-1',
            consumerVerificationRefs: ['gantt.taskDependencyReadModel'],
            impactMonitoringRefs: ['constructionOrganizationPlanNetworkImpactMonitor'],
            rollbackWriterRefs: ['constructionOrganizationPlanNetworkDomainWriter.rollback'],
            proposedDependencyEdges: readyItem.reviewPackage.proposedDependencyEdges,
            runtimeMutationBoundary: {
              writesTaskDependencies: false,
              writesPlanDates: false,
              writesSeed: false,
              writesBaseline: false,
              writesCriticalPathFacts: false,
              writesAccelerationDraft: false,
            },
          },
        }] as T[]
      }
      if (String(sql).includes('FROM public.construction_organization_plan_network_runtime_publications')) {
        return [{
          publication_key: publicationKey,
          project_id: '00000000-0000-4000-8000-000000000001',
          draft_network_key: readyDraft.draftNetworkKey,
          release_handoff_candidate_event_id: 'release-exit-handoff-event-ready',
          runtime_publication_status: 'runtime_published',
          applied_dependency_count: 2,
          rollback_target: 'construction-org-plan-network-rollback:project-1',
          published_at: '2026-06-22T02:00:00.000Z',
        }] as T[]
      }
      if (String(sql).includes('FROM public.runtime_consumer_observations')) {
        return [{
          asset_key: 'construction_organization_plan_network',
          publication_key: publicationKey,
          consumer_key: 'gantt.taskDependencyReadModel',
          consumer_surface: 'task_dependency_gantt_read_model',
          observation_status: 'observed',
          observation_context: {
            projectId: '00000000-0000-4000-8000-000000000001',
            businessType: 'hospital',
            draftNetworkKey: readyDraft.draftNetworkKey,
            optionId: 'option-ready',
            useCase: 'accelerationRecovery',
          },
          observed_at: '2026-06-22T02:05:00.000Z',
        }] as T[]
      }
      if (String(sql).includes('FROM public.construction_organization_plan_network_runtime_events')) {
        return [{
          event_type: 'impact_monitoring',
          event_status: 'monitoring_passed',
          source_publication_key: publicationKey,
          event_payload: {
            projectId: '00000000-0000-4000-8000-000000000001',
            businessType: 'hospital',
            draftNetworkKey: readyDraft.draftNetworkKey,
            optionId: 'option-ready',
            useCase: 'accelerationRecovery',
          },
          executed_at: '2026-06-22T03:00:00.000Z',
        }, {
          event_type: 'rollback_execution',
          event_status: 'rollback_executed',
          source_publication_key: publicationKey,
          event_payload: {
            projectId: '00000000-0000-4000-8000-000000000001',
            businessType: 'hospital',
            draftNetworkKey: readyDraft.draftNetworkKey,
            optionId: 'option-ready',
            useCase: 'accelerationRecovery',
          },
          executed_at: '2026-06-22T03:05:00.000Z',
        }] as T[]
      }
      if (String(sql).includes('FROM public.duration_plan_network_outcomes')) {
        return [{
          asset_key: 'construction_organization_plan_network',
          publication_key: publicationKey,
          outcome_status: 'accepted',
          outcome_ref: `network_outcomes:${publicationKey}`,
          learning_scope: 'project',
          metadata: {
            projectId: '00000000-0000-4000-8000-000000000001',
            businessType: 'hospital',
            draftNetworkKey: readyDraft.draftNetworkKey,
            optionId: 'option-ready',
            useCase: 'accelerationRecovery',
          },
          observed_at: '2026-06-22T03:10:00.000Z',
        }] as T[]
      }
      if (String(sql).includes('FROM public.duration_algorithm_accuracy_events')) {
        return [{
          id: 'accuracy-e1',
          engine_code: 'standard_duration_reference',
          backtest_status: 'backtested',
          absolute_error_days: 1,
          prediction_context: {
            assetKey: 'construction_organization_plan_network',
            publicationKey,
            projectId: '00000000-0000-4000-8000-000000000001',
            businessType: 'hospital',
            draftNetworkKey: readyDraft.draftNetworkKey,
            optionId: 'option-ready',
            useCase: 'accelerationRecovery',
          },
          actual_context: {
            assetKey: 'construction_organization_plan_network',
            publicationKey,
            projectId: '00000000-0000-4000-8000-000000000001',
            businessType: 'hospital',
            draftNetworkKey: readyDraft.draftNetworkKey,
            optionId: 'option-ready',
            useCase: 'accelerationRecovery',
          },
          backtested_at: '2026-06-22T04:00:00.000Z',
        }, {
          id: 'accuracy-e3',
          engine_code: 'critical_path_cpm',
          backtest_status: 'backtested',
          absolute_error_days: 2,
          prediction_context: {
            assetKey: 'construction_organization_plan_network',
            runtimePublicationKey: publicationKey,
            projectId: '00000000-0000-4000-8000-000000000001',
            businessType: 'hospital',
            draftNetworkKey: readyDraft.draftNetworkKey,
            optionId: 'option-ready',
            useCase: 'accelerationRecovery',
          },
          actual_context: {
            assetKey: 'construction_organization_plan_network',
            runtimePublicationKey: publicationKey,
            projectId: '00000000-0000-4000-8000-000000000001',
            businessType: 'hospital',
            draftNetworkKey: readyDraft.draftNetworkKey,
            optionId: 'option-ready',
            useCase: 'accelerationRecovery',
          },
          backtested_at: '2026-06-22T04:05:00.000Z',
        }] as T[]
      }
      if (assetPattern.startsWith('construction_organization.plan_option.')) {
        return [{
          id: 'event-ready',
          asset_key: 'construction_organization.plan_option.option-ready',
          source_module: 'constructionOrganizationScenarioGovernanceService',
          company_id: '10000000-0000-4000-8000-000000000001',
          project_id: '00000000-0000-4000-8000-000000000001',
          event_status: 'review_required',
          runtime_effect: 'candidate_only',
          candidate_payload: {
            factBasis: readyItem.factBasis,
            option: {
              optionId: 'option-ready',
              selectedScenarioIds: readyItem.selectedScenarioIds,
              engineEvaluationSummary: readyItem.engineEvaluationSummary,
              useCaseEvaluations: readyItem.useCaseEvaluations,
              generatedRowProjection: {
                materializationReviewPackage: readyItem.reviewPackage,
                generatedRowReferenceDurationEvidence: readyItem.generatedRowReferenceDurationEvidence,
                generatedRowNetworkEvaluation: readyItem.generatedRowNetworkEvaluation,
              },
            },
          },
        }] as T[]
      }
      return [] as T[]
    }

    const report = await listConstructionOrganizationPlanNetworkDrafts({
      companyId: '10000000-0000-4000-8000-000000000001',
      projectId: '00000000-0000-4000-8000-000000000001',
      queryExec,
    })
    const option = report.optionComparisonPackage.options.find((item) => item.optionId === 'option-ready')

    expect(option?.runtimeMaterializationEvidence.runtimeUseCases).not.toContain('accelerationRecovery')
    expect(option?.runtimeMaterializationEvidence.runtimeUseCaseCoverage?.accelerationRecovery).toEqual(expect.objectContaining({
      hasRuntimeConsumerObservation: true,
      hasImpactMonitoringResult: true,
      hasRollbackExecutionVerification: true,
      hasSavedNetworkOutcome: true,
      hasRuntimeEngineEvidence: false,
      canClaimRuntimeUseCaseEvidence: false,
    }))
  })

  it('blocks runtime closeout claim when a product entry lacks full-chain runtime evidence even if aggregate evidence and site adoption are ready', async () => {
    const readyItem = buildReviewPackageItem()
    const readyDraft = buildConstructionOrganizationPlanNetworkDraftFromReviewPackageItem(readyItem)
    const publicationKey = 'construction-org-plan-network-release:project-1'
    const queryExec = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> => {
      const assetPattern = readConstructionOrganizationAssetPattern(params)
      if (assetPattern.startsWith('construction_organization.plan_network_handoff.')) {
        return [{
          id: 'handoff-event-ready',
          asset_key: 'construction_organization.plan_network_handoff.ready',
          source_module: 'constructionOrganizationPlanNetworkDraftService.manualReviewHandoff',
          event_status: 'review_required',
          runtime_effect: 'candidate_only',
          created_at: '2026-06-21T14:00:00.000Z',
          updated_at: '2026-06-21T14:00:00.000Z',
          candidate_payload: {
            draftNetworkKey: readyDraft.draftNetworkKey,
            originalCandidateEventId: 'event-ready',
            optionId: 'option-ready',
            selectedScenarioIds: readyItem.selectedScenarioIds,
            reviewPackage: {
              reviewOperation: 'manual_review_dependency_proposal',
              proposedDependencyEdges: readyItem.reviewPackage.proposedDependencyEdges,
              writesTaskDependencies: false,
              writesPlanDates: false,
              writesCriticalPathFacts: false,
            },
            runtimeMutationBoundary: {
              writesTaskDependencies: false,
              writesPlanDates: false,
              writesSeed: false,
              writesBaseline: false,
              writesCriticalPathFacts: false,
              writesAccelerationDraft: false,
            },
          },
        }] as T[]
      }
      if (assetPattern.startsWith('construction_organization.plan_network_approval.')) {
        return [{
          id: 'approval-event-ready',
          asset_key: 'construction_organization.plan_network_approval.ready',
          source_module: 'constructionOrganizationPlanNetworkDraftService.manualReviewApproval',
          event_status: 'approved',
          runtime_effect: 'candidate_only',
          created_at: '2026-06-21T15:00:00.000Z',
          updated_at: '2026-06-21T15:00:00.000Z',
          candidate_payload: {
            draftNetworkKey: readyDraft.draftNetworkKey,
            handoffCandidateEventId: 'handoff-event-ready',
            approvalDecision: 'approved_for_release_exit_preparation',
            runtimeMutationBoundary: {
              writesTaskDependencies: false,
              writesPlanDates: false,
              writesSeed: false,
              writesBaseline: false,
              writesCriticalPathFacts: false,
              writesAccelerationDraft: false,
            },
          },
        }] as T[]
      }
      if (assetPattern.startsWith('construction_organization.plan_network_release_exit_handoff.')) {
        return [{
          id: 'release-exit-handoff-event-ready',
          asset_key: 'construction_organization.plan_network_release_exit_handoff.ready',
          source_module: 'constructionOrganizationPlanNetworkDraftService.releaseExitHandoff',
          event_status: 'review_required',
          runtime_effect: 'candidate_only',
          created_at: '2026-06-21T16:00:00.000Z',
          updated_at: '2026-06-21T16:00:00.000Z',
          candidate_payload: {
            draftNetworkKey: readyDraft.draftNetworkKey,
            originalCandidateEventId: 'event-ready',
            handoffCandidateEventId: 'handoff-event-ready',
            approvalCandidateEventId: 'approval-event-ready',
            optionId: 'option-ready',
            selectedScenarioIds: readyItem.selectedScenarioIds,
            releaseRecordTarget: publicationKey,
            rollbackTarget: 'construction-org-plan-network-rollback:project-1',
            consumerVerificationRefs: ['gantt.taskDependencyReadModel'],
            impactMonitoringRefs: ['constructionOrganizationPlanNetworkImpactMonitor'],
            rollbackWriterRefs: ['constructionOrganizationPlanNetworkDomainWriter.rollback'],
            proposedDependencyEdges: readyItem.reviewPackage.proposedDependencyEdges,
            runtimeMutationBoundary: {
              writesTaskDependencies: false,
              writesPlanDates: false,
              writesSeed: false,
              writesBaseline: false,
              writesCriticalPathFacts: false,
              writesAccelerationDraft: false,
            },
          },
        }] as T[]
      }
      if (String(sql).includes('FROM public.construction_organization_plan_network_runtime_publications')) {
        return [{
          publication_key: publicationKey,
          project_id: '00000000-0000-4000-8000-000000000001',
          draft_network_key: readyDraft.draftNetworkKey,
          release_handoff_candidate_event_id: 'release-exit-handoff-event-ready',
          runtime_publication_status: 'runtime_published',
          applied_dependency_count: 2,
          rollback_target: 'construction-org-plan-network-rollback:project-1',
          published_at: '2026-06-22T02:00:00.000Z',
        }] as T[]
      }
      if (String(sql).includes('FROM public.runtime_consumer_observations')) {
        return [{
          asset_key: 'construction_organization_plan_network',
          publication_key: publicationKey,
          consumer_key: 'gantt.taskDependencyReadModel',
          consumer_surface: 'task_dependency_gantt_read_model',
          observation_status: 'observed',
          observation_context: {
            projectId: '00000000-0000-4000-8000-000000000001',
            businessType: 'hospital',
            draftNetworkKey: readyDraft.draftNetworkKey,
            optionId: 'option-ready',
            useCase: 'accelerationRecovery',
          },
          observed_at: '2026-06-22T02:05:00.000Z',
        }] as T[]
      }
      if (String(sql).includes('FROM public.construction_organization_plan_network_runtime_events')) {
        return [{
          event_type: 'impact_monitoring',
          event_status: 'monitoring_passed',
          source_publication_key: publicationKey,
          event_payload: {
            projectId: '00000000-0000-4000-8000-000000000001',
            businessType: 'hospital',
            draftNetworkKey: readyDraft.draftNetworkKey,
            optionId: 'option-ready',
            useCase: 'accelerationRecovery',
          },
          executed_at: '2026-06-22T03:00:00.000Z',
        }, {
          event_type: 'rollback_execution',
          event_status: 'rollback_executed',
          source_publication_key: publicationKey,
          event_payload: {
            projectId: '00000000-0000-4000-8000-000000000001',
            businessType: 'hospital',
            draftNetworkKey: readyDraft.draftNetworkKey,
            optionId: 'option-ready',
            useCase: 'accelerationRecovery',
          },
          executed_at: '2026-06-22T03:05:00.000Z',
        }] as T[]
      }
      if (String(sql).includes('FROM public.duration_plan_network_outcomes')) {
        return [{
          asset_key: 'construction_organization_plan_network',
          publication_key: publicationKey,
          outcome_status: 'accepted',
          outcome_ref: `network_outcomes:${publicationKey}`,
          learning_scope: 'project',
          metadata: {
            projectId: '00000000-0000-4000-8000-000000000001',
            businessType: 'hospital',
            draftNetworkKey: readyDraft.draftNetworkKey,
            optionId: 'option-ready',
            useCase: 'accelerationRecovery',
          },
          observed_at: '2026-06-22T03:10:00.000Z',
        }] as T[]
      }
      if (String(sql).includes('FROM public.duration_algorithm_accuracy_events')) {
        return [
          {
            id: 'accuracy-e1',
            engine_code: 'standard_duration_reference',
            backtest_status: 'backtested',
            absolute_error_days: 1,
            prediction_context: {
              assetKey: 'construction_organization_plan_network',
              publicationKey,
              projectId: '00000000-0000-4000-8000-000000000001',
              businessType: 'hospital',
              draftNetworkKey: readyDraft.draftNetworkKey,
              optionId: 'option-ready',
              useCase: 'accelerationRecovery',
            },
            actual_context: {
              assetKey: 'construction_organization_plan_network',
              publicationKey,
              projectId: '00000000-0000-4000-8000-000000000001',
              businessType: 'hospital',
              draftNetworkKey: readyDraft.draftNetworkKey,
              optionId: 'option-ready',
              useCase: 'accelerationRecovery',
            },
            backtested_at: '2026-06-22T04:00:00.000Z',
          },
          {
            id: 'accuracy-e3',
            engine_code: 'critical_path_cpm',
            backtest_status: 'backtested',
            absolute_error_days: 2,
            prediction_context: {
              assetKey: 'construction_organization_plan_network',
              runtimePublicationKey: publicationKey,
              projectId: '00000000-0000-4000-8000-000000000001',
              businessType: 'hospital',
              draftNetworkKey: readyDraft.draftNetworkKey,
              optionId: 'option-ready',
              useCase: 'accelerationRecovery',
            },
            actual_context: {
              assetKey: 'construction_organization_plan_network',
              runtimePublicationKey: publicationKey,
              projectId: '00000000-0000-4000-8000-000000000001',
              businessType: 'hospital',
              draftNetworkKey: readyDraft.draftNetworkKey,
              optionId: 'option-ready',
              useCase: 'accelerationRecovery',
            },
            backtested_at: '2026-06-22T04:05:00.000Z',
          },
          {
            id: 'accuracy-e5-aggregate-only',
            engine_code: 'schedule_acceleration_target',
            backtest_status: 'backtested',
            absolute_error_days: 0,
            prediction_context: {
              assetKey: 'construction_organization_plan_network',
              publicationKey,
              projectId: '00000000-0000-4000-8000-000000000001',
              businessType: 'hospital',
              draftNetworkKey: readyDraft.draftNetworkKey,
              optionId: 'option-ready',
              useCase: 'newProjectPlanning',
            },
            actual_context: {
              assetKey: 'construction_organization_plan_network',
              publicationKey,
              projectId: '00000000-0000-4000-8000-000000000001',
              businessType: 'hospital',
              draftNetworkKey: readyDraft.draftNetworkKey,
              optionId: 'option-ready',
              useCase: 'newProjectPlanning',
            },
            backtested_at: '2026-06-22T04:10:00.000Z',
          },
        ] as T[]
      }
      if (String(sql).includes('FROM public.recommendation_actions')) {
        return [{
          project_id: '00000000-0000-4000-8000-000000000001',
          recommendation_kind: 'construction_organization_plan_network',
          recommendation_key: 'construction_organization_plan_network:option-ready',
          action_type: 'adopted',
          adopted_at: '2026-06-22T06:00:00.000Z',
          adopted_by: 'user-1',
          action_context: {
            businessType: 'hospital',
            optionId: 'option-ready',
            draftNetworkKey: readyDraft.draftNetworkKey,
            publicationKey,
            selectedScenarioIds: readyItem.selectedScenarioIds,
            decisionAction: 'adopted',
            writesRuntimeDirectly: false,
            writesFactDirectly: false,
            writesTaskDependencies: false,
            writesPlanDates: false,
            writesSeed: false,
            writesBaseline: false,
            writesCriticalPathFacts: false,
            writesAccelerationDraft: false,
          },
        }] as T[]
      }
      if (assetPattern.startsWith('construction_organization.plan_option.')) {
        return [{
          id: 'event-ready',
          asset_key: 'construction_organization.plan_option.option-ready',
          source_module: 'constructionOrganizationScenarioGovernanceService',
          company_id: '10000000-0000-4000-8000-000000000001',
          project_id: '00000000-0000-4000-8000-000000000001',
          event_status: 'review_required',
          runtime_effect: 'candidate_only',
          candidate_payload: {
            factBasis: readyItem.factBasis,
            option: {
              optionId: 'option-ready',
              selectedScenarioIds: readyItem.selectedScenarioIds,
              engineEvaluationSummary: readyItem.engineEvaluationSummary,
              useCaseEvaluations: readyItem.useCaseEvaluations,
              generatedRowProjection: {
                materializationReviewPackage: readyItem.reviewPackage,
                generatedRowReferenceDurationEvidence: readyItem.generatedRowReferenceDurationEvidence,
                generatedRowNetworkEvaluation: readyItem.generatedRowNetworkEvaluation,
              },
            },
          },
        }] as T[]
      }
      return [] as T[]
    }

    const report = await listConstructionOrganizationPlanNetworkDrafts({
      companyId: '10000000-0000-4000-8000-000000000001',
      projectId: '00000000-0000-4000-8000-000000000001',
      queryExec,
    })
    const option = report.optionComparisonPackage.options.find((item) => item.optionId === 'option-ready')

    expect(option?.runtimeMaterializationEvidence.canClaimRuntimeMaterializationEvidence).toBe(true)
    expect(option?.runtimeMaterializationEvidence.runtimeUseCaseCoverage?.accelerationRecovery).toEqual(expect.objectContaining({
      hasRuntimeEngineEvidence: false,
      canClaimRuntimeUseCaseEvidence: false,
    }))
    expect(report.runtimeCloseoutClaim).toEqual(expect.objectContaining({
      status: 'runtime_closeout_claim_blocked',
      canClaimRuntimeCloseout: false,
      claimBasis: [],
      missingBeforeClaim: expect.arrayContaining([
        'runtime_use_case_coverage_required:accelerationRecovery',
      ]),
    }))
  })

  it('claims runtime closeout when one published option has full-chain runtime evidence for all product entries', async () => {
    const readyItem = buildReviewPackageItem()
    const readyDraft = buildConstructionOrganizationPlanNetworkDraftFromReviewPackageItem(readyItem)
    const publicationKey = 'construction-org-plan-network-release:project-1'
    const report = await listConstructionOrganizationPlanNetworkDrafts({
      companyId: '10000000-0000-4000-8000-000000000001',
      projectId: '00000000-0000-4000-8000-000000000001',
      queryExec: buildFullRuntimeEvidenceQueryExec({ readyItem, readyDraft, publicationKey }),
    })
    const option = report.optionComparisonPackage.options.find((item) => item.optionId === 'option-ready')

    expect(option?.runtimeMaterializationEvidence.status).toBe('runtime_evidence_ready')
    expect(option?.runtimeMaterializationEvidence.runtimeUseCases).toEqual(expect.arrayContaining([
      'newProjectPlanning',
      'startingLineOnboarding',
      'accelerationRecovery',
    ]))
    for (const useCase of PRODUCT_ENTRY_USE_CASES) {
      expect(option?.runtimeMaterializationEvidence.runtimeUseCaseCoverage?.[useCase]).toEqual(expect.objectContaining({
        hasRuntimeConsumerObservation: true,
        hasImpactMonitoringResult: true,
        hasRollbackExecutionVerification: true,
        hasSavedNetworkOutcome: true,
        hasRuntimeEngineEvidence: true,
        canClaimRuntimeUseCaseEvidence: true,
      }))
    }
    expect(report.runtimeCloseoutClaim).toEqual(expect.objectContaining({
      status: 'runtime_closeout_claim_ready',
      canClaimRuntimeCloseout: true,
      missingBeforeClaim: [],
    }))
  })

  it('does not count runtime event, outcome, or engine evidence without project and option network anchors', async () => {
    const readyItem = buildReviewPackageItem()
    const readyDraft = buildConstructionOrganizationPlanNetworkDraftFromReviewPackageItem(readyItem)
    const publicationKey = 'construction-org-plan-network-release:project-1'
    const calls: Array<{ sql: string, params: unknown[] }> = []
    const queryExec = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> => {
      calls.push({ sql, params })
      const assetPattern = readConstructionOrganizationAssetPattern(params)
      if (assetPattern.startsWith('construction_organization.plan_network_handoff.')) {
        return [{
          id: 'handoff-event-ready',
          asset_key: 'construction_organization.plan_network_handoff.ready',
          source_module: 'constructionOrganizationPlanNetworkDraftService.manualReviewHandoff',
          event_status: 'review_required',
          runtime_effect: 'candidate_only',
          created_at: '2026-06-21T14:00:00.000Z',
          updated_at: '2026-06-21T14:00:00.000Z',
          candidate_payload: {
            draftNetworkKey: readyDraft.draftNetworkKey,
            originalCandidateEventId: 'event-ready',
            optionId: 'option-ready',
            selectedScenarioIds: readyItem.selectedScenarioIds,
            reviewPackage: {
              reviewOperation: 'manual_review_dependency_proposal',
              proposedDependencyEdges: readyItem.reviewPackage.proposedDependencyEdges,
              writesTaskDependencies: false,
              writesPlanDates: false,
              writesCriticalPathFacts: false,
            },
            runtimeMutationBoundary: {
              writesTaskDependencies: false,
              writesPlanDates: false,
              writesSeed: false,
              writesBaseline: false,
              writesCriticalPathFacts: false,
              writesAccelerationDraft: false,
            },
          },
        }] as T[]
      }
      if (assetPattern.startsWith('construction_organization.plan_network_approval.')) {
        return [{
          id: 'approval-event-ready',
          asset_key: 'construction_organization.plan_network_approval.ready',
          source_module: 'constructionOrganizationPlanNetworkDraftService.manualReviewApproval',
          event_status: 'approved',
          runtime_effect: 'candidate_only',
          created_at: '2026-06-21T15:00:00.000Z',
          updated_at: '2026-06-21T15:00:00.000Z',
          candidate_payload: {
            draftNetworkKey: readyDraft.draftNetworkKey,
            handoffCandidateEventId: 'handoff-event-ready',
            approvalDecision: 'approved_for_release_exit_preparation',
            runtimeMutationBoundary: {
              writesTaskDependencies: false,
              writesPlanDates: false,
              writesSeed: false,
              writesBaseline: false,
              writesCriticalPathFacts: false,
              writesAccelerationDraft: false,
            },
          },
        }] as T[]
      }
      if (assetPattern.startsWith('construction_organization.plan_network_release_exit_handoff.')) {
        return [{
          id: 'release-exit-handoff-event-ready',
          asset_key: 'construction_organization.plan_network_release_exit_handoff.ready',
          source_module: 'constructionOrganizationPlanNetworkDraftService.releaseExitHandoff',
          event_status: 'review_required',
          runtime_effect: 'candidate_only',
          created_at: '2026-06-21T16:00:00.000Z',
          updated_at: '2026-06-21T16:00:00.000Z',
          candidate_payload: {
            draftNetworkKey: readyDraft.draftNetworkKey,
            originalCandidateEventId: 'event-ready',
            handoffCandidateEventId: 'handoff-event-ready',
            approvalCandidateEventId: 'approval-event-ready',
            optionId: 'option-ready',
            selectedScenarioIds: readyItem.selectedScenarioIds,
            releaseRecordTarget: publicationKey,
            rollbackTarget: 'construction-org-plan-network-rollback:project-1',
            consumerVerificationRefs: ['gantt.taskDependencyReadModel'],
            impactMonitoringRefs: ['constructionOrganizationPlanNetworkImpactMonitor'],
            rollbackWriterRefs: ['constructionOrganizationPlanNetworkDomainWriter.rollback'],
            proposedDependencyEdges: readyItem.reviewPackage.proposedDependencyEdges,
            runtimeMutationBoundary: {
              writesTaskDependencies: false,
              writesPlanDates: false,
              writesSeed: false,
              writesBaseline: false,
              writesCriticalPathFacts: false,
              writesAccelerationDraft: false,
            },
          },
        }] as T[]
      }
      if (String(sql).includes('FROM public.construction_organization_plan_network_runtime_publications')) {
        return [{
          publication_key: publicationKey,
          project_id: '00000000-0000-4000-8000-000000000001',
          draft_network_key: readyDraft.draftNetworkKey,
          release_handoff_candidate_event_id: 'release-exit-handoff-event-ready',
          runtime_publication_status: 'runtime_published',
          applied_dependency_count: 2,
          rollback_target: 'construction-org-plan-network-rollback:project-1',
          published_at: '2026-06-22T02:00:00.000Z',
        }] as T[]
      }
      if (String(sql).includes('FROM public.runtime_consumer_observations')) {
        return [{
          asset_key: 'construction_organization_plan_network',
          publication_key: publicationKey,
          consumer_key: 'gantt.taskDependencyReadModel',
          consumer_surface: 'task_dependency_gantt_read_model',
          observation_status: 'observed',
          observation_context: {
            projectId: '00000000-0000-4000-8000-000000000001',
            businessType: 'hospital',
            draftNetworkKey: readyDraft.draftNetworkKey,
            optionId: 'option-ready',
          },
          observed_at: '2026-06-22T02:05:00.000Z',
        }] as T[]
      }
      if (String(sql).includes('FROM public.construction_organization_plan_network_runtime_events')) {
        return [{
          event_type: 'impact_monitoring',
          event_status: 'monitoring_passed',
          source_publication_key: publicationKey,
          event_payload: {
            businessType: 'hospital',
          },
          executed_at: '2026-06-22T03:00:00.000Z',
        }, {
          event_type: 'rollback_execution',
          event_status: 'rollback_executed',
          source_publication_key: publicationKey,
          event_payload: {
            businessType: 'hospital',
          },
          executed_at: '2026-06-22T03:05:00.000Z',
        }] as T[]
      }
      if (String(sql).includes('FROM public.duration_plan_network_outcomes')) {
        return [{
          asset_key: 'construction_organization_plan_network',
          publication_key: publicationKey,
          outcome_status: 'accepted',
          outcome_ref: `network_outcomes:${publicationKey}`,
          learning_scope: 'project',
          metadata: {
            businessType: 'hospital',
          },
          observed_at: '2026-06-22T03:10:00.000Z',
        }] as T[]
      }
      if (String(sql).includes('FROM public.duration_algorithm_accuracy_events')) {
        return ['standard_duration_reference', 'critical_path_cpm', 'schedule_acceleration_target'].map((engineCode) => ({
          id: `accuracy-${engineCode}`,
          engine_code: engineCode,
          backtest_status: 'backtested',
          absolute_error_days: 1,
          prediction_context: {
            assetKey: 'construction_organization_plan_network',
            publicationKey,
            businessType: 'hospital',
          },
          actual_context: {
            assetKey: 'construction_organization_plan_network',
            publicationKey,
            businessType: 'hospital',
          },
          backtested_at: '2026-06-22T04:00:00.000Z',
        })) as T[]
      }
      if (assetPattern.startsWith('construction_organization.plan_option.')) {
        return [{
          id: 'event-ready',
          asset_key: 'construction_organization.plan_option.option-ready',
          source_module: 'constructionOrganizationScenarioGovernanceService',
          company_id: '10000000-0000-4000-8000-000000000001',
          project_id: '00000000-0000-4000-8000-000000000001',
          event_status: 'review_required',
          runtime_effect: 'candidate_only',
          candidate_payload: {
            factBasis: readyItem.factBasis,
            option: {
              optionId: 'option-ready',
              selectedScenarioIds: readyItem.selectedScenarioIds,
              engineEvaluationSummary: readyItem.engineEvaluationSummary,
              useCaseEvaluations: readyItem.useCaseEvaluations,
              generatedRowProjection: {
                materializationReviewPackage: readyItem.reviewPackage,
                generatedRowReferenceDurationEvidence: readyItem.generatedRowReferenceDurationEvidence,
                generatedRowNetworkEvaluation: readyItem.generatedRowNetworkEvaluation,
              },
            },
          },
        }] as T[]
      }
      return [] as T[]
    }

    const report = await listConstructionOrganizationPlanNetworkDrafts({
      companyId: '10000000-0000-4000-8000-000000000001',
      projectId: '00000000-0000-4000-8000-000000000001',
      queryExec,
    })

    expect(report.runtimeMaterializationReadiness).toEqual(expect.objectContaining({
      runtimeImpactMonitoringResultCount: 0,
      readyForRuntimeImpactMonitoringResultCount: 0,
      rollbackExecutionVerificationCount: 0,
      readyForRollbackExecutionVerificationCount: 0,
      savedNetworkOutcomeCount: 0,
      readyForSavedNetworkOutcomeCount: 0,
      perOptionRuntimeEngineEvidenceCount: 0,
      readyForPerOptionRuntimeEngineEvidenceCount: 0,
    }))
    expect(report.runtimeMaterializationReadiness.missingBeforeRuntime).toEqual(expect.arrayContaining([
      'post_materialization_impact_monitoring_result_required',
      'rollback_execution_verification_required',
      'saved_network_outcome_required',
      'true_per_option_runtime_e1_e3_e5_evidence_required',
    ]))
    const sqlText = calls.map((call) => call.sql).join('\n')
    expect(sqlText).toContain('FROM public.construction_organization_plan_network_runtime_events')
    expect(sqlText).toContain('FROM public.duration_plan_network_outcomes')
    expect(sqlText).toContain('FROM public.duration_algorithm_accuracy_events')
  })

  it('rejects runtime evidence that carries a conflicting draftNetworkKey even when optionId matches', async () => {
    const readyItem = buildReviewPackageItem()
    const readyDraft = buildConstructionOrganizationPlanNetworkDraftFromReviewPackageItem(readyItem)
    const publicationKey = 'construction-org-plan-network-release:project-1'
    const calls: Array<{ sql: string, params: unknown[] }> = []
    const conflictingDraftNetworkKey = `${readyDraft.draftNetworkKey}:conflict`
    const queryExec = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> => {
      calls.push({ sql, params })
      const assetPattern = readConstructionOrganizationAssetPattern(params)
      if (assetPattern.startsWith('construction_organization.plan_network_handoff.')) {
        return [{
          id: 'handoff-event-ready',
          asset_key: 'construction_organization.plan_network_handoff.ready',
          source_module: 'constructionOrganizationPlanNetworkDraftService.manualReviewHandoff',
          event_status: 'review_required',
          runtime_effect: 'candidate_only',
          created_at: '2026-06-21T14:00:00.000Z',
          updated_at: '2026-06-21T14:00:00.000Z',
          candidate_payload: {
            draftNetworkKey: readyDraft.draftNetworkKey,
            originalCandidateEventId: 'event-ready',
            optionId: 'option-ready',
            selectedScenarioIds: readyItem.selectedScenarioIds,
            reviewPackage: {
              reviewOperation: 'manual_review_dependency_proposal',
              proposedDependencyEdges: readyItem.reviewPackage.proposedDependencyEdges,
              writesTaskDependencies: false,
              writesPlanDates: false,
              writesCriticalPathFacts: false,
            },
            runtimeMutationBoundary: {
              writesTaskDependencies: false,
              writesPlanDates: false,
              writesSeed: false,
              writesBaseline: false,
              writesCriticalPathFacts: false,
              writesAccelerationDraft: false,
            },
          },
        }] as T[]
      }
      if (assetPattern.startsWith('construction_organization.plan_network_approval.')) {
        return [{
          id: 'approval-event-ready',
          asset_key: 'construction_organization.plan_network_approval.ready',
          source_module: 'constructionOrganizationPlanNetworkDraftService.manualReviewApproval',
          event_status: 'approved',
          runtime_effect: 'candidate_only',
          created_at: '2026-06-21T15:00:00.000Z',
          updated_at: '2026-06-21T15:00:00.000Z',
          candidate_payload: {
            draftNetworkKey: readyDraft.draftNetworkKey,
            handoffCandidateEventId: 'handoff-event-ready',
            approvalDecision: 'approved_for_release_exit_preparation',
            runtimeMutationBoundary: {
              writesTaskDependencies: false,
              writesPlanDates: false,
              writesSeed: false,
              writesBaseline: false,
              writesCriticalPathFacts: false,
              writesAccelerationDraft: false,
            },
          },
        }] as T[]
      }
      if (assetPattern.startsWith('construction_organization.plan_network_release_exit_handoff.')) {
        return [{
          id: 'release-exit-handoff-event-ready',
          asset_key: 'construction_organization.plan_network_release_exit_handoff.ready',
          source_module: 'constructionOrganizationPlanNetworkDraftService.releaseExitHandoff',
          event_status: 'review_required',
          runtime_effect: 'candidate_only',
          created_at: '2026-06-21T16:00:00.000Z',
          updated_at: '2026-06-21T16:00:00.000Z',
          candidate_payload: {
            draftNetworkKey: readyDraft.draftNetworkKey,
            originalCandidateEventId: 'event-ready',
            handoffCandidateEventId: 'handoff-event-ready',
            approvalCandidateEventId: 'approval-event-ready',
            optionId: 'option-ready',
            selectedScenarioIds: readyItem.selectedScenarioIds,
            releaseRecordTarget: publicationKey,
            rollbackTarget: 'construction-org-plan-network-rollback:project-1',
            consumerVerificationRefs: ['gantt.taskDependencyReadModel'],
            impactMonitoringRefs: ['constructionOrganizationPlanNetworkImpactMonitor'],
            rollbackWriterRefs: ['constructionOrganizationPlanNetworkDomainWriter.rollback'],
            proposedDependencyEdges: readyItem.reviewPackage.proposedDependencyEdges,
            runtimeMutationBoundary: {
              writesTaskDependencies: false,
              writesPlanDates: false,
              writesSeed: false,
              writesBaseline: false,
              writesCriticalPathFacts: false,
              writesAccelerationDraft: false,
            },
          },
        }] as T[]
      }
      if (String(sql).includes('FROM public.construction_organization_plan_network_runtime_publications')) {
        return [{
          publication_key: publicationKey,
          project_id: '00000000-0000-4000-8000-000000000001',
          draft_network_key: readyDraft.draftNetworkKey,
          release_handoff_candidate_event_id: 'release-exit-handoff-event-ready',
          runtime_publication_status: 'runtime_published',
          applied_dependency_count: 2,
          rollback_target: 'construction-org-plan-network-rollback:project-1',
          published_at: '2026-06-22T02:00:00.000Z',
        }] as T[]
      }
      if (String(sql).includes('FROM public.runtime_consumer_observations')) {
        return [{
          asset_key: 'construction_organization_plan_network',
          publication_key: publicationKey,
          consumer_key: 'gantt.taskDependencyReadModel',
          consumer_surface: 'task_dependency_gantt_read_model',
          observation_status: 'observed',
          observation_context: {
            projectId: '00000000-0000-4000-8000-000000000001',
            businessType: 'hospital',
            draftNetworkKey: conflictingDraftNetworkKey,
            optionId: 'option-ready',
          },
          observed_at: '2026-06-22T02:05:00.000Z',
        }] as T[]
      }
      if (String(sql).includes('FROM public.construction_organization_plan_network_runtime_events')) {
        return [{
          event_type: 'impact_monitoring',
          event_status: 'monitoring_passed',
          source_publication_key: publicationKey,
          event_payload: {
            projectId: '00000000-0000-4000-8000-000000000001',
            businessType: 'hospital',
            draftNetworkKey: conflictingDraftNetworkKey,
            optionId: 'option-ready',
          },
          executed_at: '2026-06-22T03:00:00.000Z',
        }, {
          event_type: 'rollback_execution',
          event_status: 'rollback_executed',
          source_publication_key: publicationKey,
          event_payload: {
            projectId: '00000000-0000-4000-8000-000000000001',
            businessType: 'hospital',
            draftNetworkKey: conflictingDraftNetworkKey,
            optionId: 'option-ready',
          },
          executed_at: '2026-06-22T03:05:00.000Z',
        }] as T[]
      }
      if (String(sql).includes('FROM public.duration_plan_network_outcomes')) {
        return [{
          asset_key: 'construction_organization_plan_network',
          publication_key: publicationKey,
          outcome_status: 'accepted',
          outcome_ref: `network_outcomes:${publicationKey}`,
          learning_scope: 'project',
          metadata: {
            projectId: '00000000-0000-4000-8000-000000000001',
            businessType: 'hospital',
            draftNetworkKey: conflictingDraftNetworkKey,
            optionId: 'option-ready',
          },
          observed_at: '2026-06-22T03:10:00.000Z',
        }] as T[]
      }
      if (String(sql).includes('FROM public.duration_algorithm_accuracy_events')) {
        return ['standard_duration_reference', 'critical_path_cpm', 'schedule_acceleration_target'].map((engineCode) => ({
          id: `accuracy-${engineCode}`,
          engine_code: engineCode,
          backtest_status: 'backtested',
          absolute_error_days: 1,
          prediction_context: {
            assetKey: 'construction_organization_plan_network',
            publicationKey,
            businessType: 'hospital',
            draftNetworkKey: conflictingDraftNetworkKey,
            optionId: 'option-ready',
          },
          actual_context: {
            assetKey: 'construction_organization_plan_network',
            publicationKey,
            businessType: 'hospital',
            draftNetworkKey: conflictingDraftNetworkKey,
            optionId: 'option-ready',
          },
          backtested_at: '2026-06-22T04:00:00.000Z',
        })) as T[]
      }
      if (String(sql).includes('FROM public.recommendation_actions')) {
        return [{
          project_id: '00000000-0000-4000-8000-000000000001',
          recommendation_kind: 'construction_organization_plan_network',
          recommendation_key: 'construction_organization_plan_network:option-ready',
          action_type: 'adopted',
          adopted_at: '2026-06-22T06:00:00.000Z',
          adopted_by: 'user-1',
          action_context: {
            businessType: 'hospital',
            optionId: 'option-ready',
            publicationKey,
            selectedScenarioIds: readyItem.selectedScenarioIds,
            decisionAction: 'adopted',
            writesRuntimeDirectly: false,
            writesFactDirectly: false,
            writesTaskDependencies: false,
            writesPlanDates: false,
            writesSeed: false,
            writesBaseline: false,
            writesCriticalPathFacts: false,
            writesAccelerationDraft: false,
          },
        }] as T[]
      }
      if (assetPattern.startsWith('construction_organization.plan_option.')) {
        return [{
          id: 'event-ready',
          asset_key: 'construction_organization.plan_option.option-ready',
          source_module: 'constructionOrganizationScenarioGovernanceService',
          company_id: '10000000-0000-4000-8000-000000000001',
          project_id: '00000000-0000-4000-8000-000000000001',
          event_status: 'review_required',
          runtime_effect: 'candidate_only',
          candidate_payload: {
            factBasis: readyItem.factBasis,
            option: {
              optionId: 'option-ready',
              selectedScenarioIds: readyItem.selectedScenarioIds,
              engineEvaluationSummary: readyItem.engineEvaluationSummary,
              useCaseEvaluations: readyItem.useCaseEvaluations,
              generatedRowProjection: {
                materializationReviewPackage: readyItem.reviewPackage,
                generatedRowReferenceDurationEvidence: readyItem.generatedRowReferenceDurationEvidence,
                generatedRowNetworkEvaluation: readyItem.generatedRowNetworkEvaluation,
              },
            },
          },
        }] as T[]
      }
      return [] as T[]
    }

    const report = await listConstructionOrganizationPlanNetworkDrafts({
      companyId: '10000000-0000-4000-8000-000000000001',
      projectId: '00000000-0000-4000-8000-000000000001',
      queryExec,
    })

    expect(report.runtimeMaterializationReadiness).toEqual(expect.objectContaining({
      runtimeConsumerObservationCount: 0,
      runtimeImpactMonitoringResultCount: 0,
      rollbackExecutionVerificationCount: 0,
      savedNetworkOutcomeCount: 0,
      perOptionRuntimeEngineEvidenceCount: 0,
      missingBeforeRuntime: expect.arrayContaining([
        'runtime_consumer_observation_required',
        'post_materialization_impact_monitoring_result_required',
        'rollback_execution_verification_required',
        'saved_network_outcome_required',
        'true_per_option_runtime_e1_e3_e5_evidence_required',
      ]),
    }))
    expect(report.runtimeCloseoutClaim).toEqual(expect.objectContaining({
      status: 'runtime_closeout_claim_blocked',
      canClaimRuntimeCloseout: false,
      missingBeforeClaim: expect.arrayContaining([
        'runtime_consumer_observation_required',
        'post_materialization_impact_monitoring_result_required',
        'rollback_execution_verification_required',
        'saved_network_outcome_required',
        'true_per_option_runtime_e1_e3_e5_evidence_required',
      ]),
    }))
    const sqlText = calls.map((call) => call.sql).join('\n')
    expect(sqlText).toContain('FROM public.runtime_consumer_observations')
    expect(sqlText).toContain('FROM public.construction_organization_plan_network_runtime_events')
    expect(sqlText).toContain('FROM public.duration_plan_network_outcomes')
    expect(sqlText).toContain('FROM public.duration_algorithm_accuracy_events')
  })
})
