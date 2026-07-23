import { describe, expect, it, vi } from 'vitest'

import {
  executeAlgorithmAssetGovernanceWorkbenchOperation,
} from '../services/algorithmAssetGovernanceWorkbenchOperationService.js'
import {
  buildAlgorithmAssetLearnableParameterSuggestionRelease,
} from '../services/algorithmAssetLearnableParameterSuggestionService.js'
import type {
  AlgorithmAssetLearnableParameterPublicationResult,
  AlgorithmAssetLearnableParameterRuntimeRollbackResult,
} from '../services/algorithmAssetLearnableParameterReleaseExecutionService.js'
import type {
  RollbackAlgorithmAssetForecastResidualOverlayRuntimePublicationResult,
} from '../services/algorithmAssetGovernancePersistenceService.js'
import type {
  RollbackAlgorithmAssetColdStartBaselineRuntimePublicationResult,
} from '../services/algorithmAssetGovernancePersistenceService.js'
import type {
  ApplyConstructionOrganizationPlanNetworkApprovedDraftResult,
} from '../services/constructionOrganizationPlanNetworkDomainWriter.js'
import type {
  DurationRuntimeConsumerFacadeArtifactsResult,
} from '../services/durationRuntimeConsumerObservationAdapterService.js'
import type {
  DurationLearningRuntimePublicationQueryExec,
} from '../services/durationLearningRuntimePublicationService.js'
import type {
  RecordConstructionOrganizationPlanNetworkRecommendationDecisionResult,
  RecordConstructionOrganizationPlanNetworkRuntimeEngineEvidenceResult,
  RecordConstructionOrganizationPlanNetworkSavedOutcomeResult,
  RecordConstructionOrganizationPlanNetworkRuntimeEventResult,
} from '../services/constructionOrganizationPlanNetworkRuntimeEvidenceService.js'
import {
  buildConstructionOrganizationPlanNetworkDraftFromReviewPackageItem,
  type ConstructionOrganizationPlanNetworkManualConflictReviewDecisionResult,
  type ConstructionOrganizationPlanNetworkManualReviewApprovalResult,
  type ConstructionOrganizationPlanNetworkManualReviewHandoffResult,
  type ConstructionOrganizationPlanNetworkReleaseExitHandoffResult,
} from '../services/constructionOrganizationPlanNetworkDraftService.js'

function readyLearnableParameterReleaseExit() {
  return buildAlgorithmAssetLearnableParameterSuggestionRelease({
    parameterKey: 'duration.benchmark_blend_weight',
    sourceSystem: 'durationContextPolicyParameterLearningService',
    companyId: 'company-a',
    currentValue: 0.55,
    proposedValue: 0.58,
    evidence: {
      sampleCount: 80,
      replayPassed: true,
      conflictFree: true,
      rollbackTarget: 'duration-blend-v1',
      maeImprovement: 1.2,
      overcompensationRate: 0.05,
    },
    conflictResult: 'supersede_with_rollback_target',
    replaySummary: {
      replayPassed: true,
      runtimeImpact: 'publish_gate_evidence',
    },
    releaseAdapter: {
      adapterKey: 'learnableParameterCompanyOverrideReleaseAdapter',
      targetSurface: 'company_override',
      supportsRollback: true,
    },
    platformPolicy: {
      impactMonitoringReady: true,
    },
  }).releaseExit
}

function publicationResult(): AlgorithmAssetLearnableParameterPublicationResult {
  return {
    status: 'runtime_parameter_published',
    canPersist: true,
    writesParameterRuntime: true,
    writesSeedRuntimeDirectly: false,
    publicationStatus: 'published',
    publicationKey: 'learnable-parameter-runtime:event-1:company_override',
    rollbackTarget: 'duration-blend-v1',
    reasons: [],
    runtimePublication: null,
  }
}

function rollbackResult(): AlgorithmAssetLearnableParameterRuntimeRollbackResult {
  return {
    status: 'rollback_executed',
    sourcePublicationKey: 'learnable-parameter-runtime:event-1:company_override',
    rollbackTarget: 'duration-blend-v1',
    restoredRuntimePolicy: 'previous_parameter_value_retained',
    writesParameterRuntime: true,
    writesSeedRuntimeDirectly: false,
    reasons: [],
  }
}

function forecastOverlayRollbackResult(): RollbackAlgorithmAssetForecastResidualOverlayRuntimePublicationResult {
  return {
    status: 'rollback_executed',
    overlayKey: 'forecast-residual-overlay:v2',
    rollbackTarget: 'forecast-residual-overlay:v1',
    writesRuntimeOverlay: true,
    writesBaseDurationSeed: false,
    reasons: [],
  }
}

function coldStartBaselineRollbackResult(): RollbackAlgorithmAssetColdStartBaselineRuntimePublicationResult {
  return {
    status: 'rollback_executed',
    baselineKey: 'standard_work_duration:wall-plaster',
    segmentKey: 'residential:interior:wall-plaster',
    rollbackTarget: 'cold-start-baseline:v1',
    writesSharedBaseline: true,
    writesCompanyOverride: false,
    writesBaseDurationSeed: false,
    reasons: [],
  }
}

function durationLearningRuntimeRollbackResult() {
  return {
    status: 'rollback_executed' as const,
    restoredPublicationKey: 'duration_learning_runtime:special_work_duration_seed:previous',
    reasons: [],
  }
}

function durationLearningRuntimePublicationRow(input: {
  publicationKey: string
  assetKey: string
  artifactKey: string
  companyId: string
  projectId: string | null
  industryKey?: string | null
  publicationStage?: string
}) {
  return {
    publication_key: input.publicationKey,
    asset_key: input.assetKey,
    artifact_key: input.artifactKey,
    scope_level: input.projectId ? 'project' : 'company',
    company_id: input.companyId,
    project_id: input.projectId,
    industry_key: input.industryKey ?? null,
    publication_stage: input.publicationStage ?? 'stable',
    runtime_payload: {},
    source_candidate_refs: ['candidate:rollback'],
    source_evidence_refs: ['evidence:rollback'],
    automation_decision: {},
    previous_publication_key: null,
    traffic_percent: 100,
    monitoring_window_hours: 72,
    monitoring_status: 'passed',
    published_at: '2026-06-15T00:00:00.000Z',
  }
}

function durationLearningRuntimeRollbackQuery(
  rows: Record<string, unknown>[],
): DurationLearningRuntimePublicationQueryExec {
  return async <T = Record<string, unknown>>(_sql: string, params: unknown[] = []) => {
    const key = String(params[0] ?? '')
    return rows.filter((row) => row.publication_key === key) as T[]
  }
}

function constructionOrganizationPlanNetworkDraft() {
  return buildConstructionOrganizationPlanNetworkDraftFromReviewPackageItem({
    candidateEventId: 'event-ready',
    assetKey: 'construction_organization.plan_option.option-ready',
    sourceModule: 'constructionOrganizationScenarioGovernanceService',
    companyId: 'company-a',
    projectId: 'project-a',
    eventStatus: 'review_required',
    runtimeEffect: 'candidate_only',
    createdAt: '2026-06-21T12:00:00.000Z',
    updatedAt: '2026-06-21T12:00:00.000Z',
    optionId: 'option-ready',
    selectedScenarioIds: ['pile_before_excavation'],
    reviewPackage: {
      source: 'construction_organization_candidate_materialization_review_package',
      packageBasis: 'manual_review_package_from_generated_row_preview_edges',
      optionId: 'option-ready',
      status: 'ready_for_manual_review',
      allowManualReview: true,
      proposedDependencyEdgeCount: 1,
      blockedReasons: [],
      proposedDependencyEdges: [{
        fromGeneratedRowId: 'row-foundation',
        toGeneratedRowId: 'row-earthwork',
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
    materializationDecision: {
      decision: 'ready_for_manual_materialization',
      allowManualMaterialization: true,
    },
    candidateDependencyPreview: {
      source: 'construction_organization_candidate_dependency_preview',
      materializationReadiness: {
        readiness: 'ready_for_manual_materialization_preview',
      },
      previewEdgeCount: 1,
      unresolvedEdgeCount: 0,
      writesTaskDependencies: false,
      writesPlanDates: false,
      writesCriticalPathFacts: false,
    },
    engineEvaluationSummary: {
      e1: { selectedWorkPackageCount: 1 },
      e3: { projectDurationDays: 38, criticalNodeCount: 1, edgeCount: 1 },
      e5: { recoveryFactorHint: 1.08, recoverableSpanDays: 5 },
    },
    generatedRowReferenceDurationEvidence: {
      matchedReferenceRowCount: 2,
      totalPlanReferenceDays: 21,
    },
    generatedRowNetworkEvaluation: {
      projectedNetworkSpanDays: 38,
      previewEdgeCount: 1,
      unresolvedEdgeCount: 0,
      criticalGeneratedRowIds: ['row-foundation'],
      materializationStatus: 'fully_mapped_read_only',
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

function constructionOrganizationManualReviewHandoffResult(): ConstructionOrganizationPlanNetworkManualReviewHandoffResult {
  const draft = constructionOrganizationPlanNetworkDraft()
  return {
    source: 'construction_organization_plan_network_manual_review_handoff',
    status: 'manual_review_handoff_ready',
    draftNetworkKey: draft.draftNetworkKey,
    candidateEventId: draft.candidateEventId,
    optionId: draft.optionId,
    selectedScenarioIds: draft.selectedScenarioIds,
    requestedByUserId: 'user-1',
    executedAt: '2026-06-21T13:00:00.000Z',
    proposedDependencyEdgeCount: draft.edgeCount,
    reviewPackage: {
      source: 'construction_organization_plan_network_manual_review_handoff',
      reviewOperation: 'manual_review_dependency_proposal',
      reviewRequired: true,
      proposedDependencyEdges: draft.edges,
      writesTaskDependencies: false,
      writesPlanDates: false,
      writesCriticalPathFacts: false,
    },
    reasons: [],
    writesTaskDependencies: false,
    writesPlanDates: false,
    writesSeed: false,
    writesBaseline: false,
    writesCriticalPathFacts: false,
    writesAccelerationDraft: false,
    boundaryPolicy: ['manual_review_handoff_is_not_runtime_materialization'],
  }
}

function constructionOrganizationManualReviewApprovalResult(): ConstructionOrganizationPlanNetworkManualReviewApprovalResult {
  const draft = constructionOrganizationPlanNetworkDraft()
  return {
    source: 'construction_organization_plan_network_manual_review_approval',
    status: 'manual_review_approval_ready',
    draftNetworkKey: draft.draftNetworkKey,
    handoffCandidateEventId: 'handoff-event-ready',
    approvedByUserId: 'approver-1',
    approvedAt: '2026-06-21T15:00:00.000Z',
    approvalDecision: 'approved_for_release_exit_preparation',
    reasons: [],
    writesTaskDependencies: false,
    writesPlanDates: false,
    writesSeed: false,
    writesBaseline: false,
    writesCriticalPathFacts: false,
    writesAccelerationDraft: false,
    boundaryPolicy: ['manual_review_approval_is_not_runtime_materialization'],
  }
}

function constructionOrganizationManualConflictReviewResult(): ConstructionOrganizationPlanNetworkManualConflictReviewDecisionResult {
  const draft = constructionOrganizationPlanNetworkDraftWithHandoff()
  return {
    source: 'construction_organization_plan_network_manual_conflict_review',
    status: 'manual_conflict_review_ready',
    draftNetworkKey: draft.draftNetworkKey,
    handoffCandidateEventId: 'handoff-event-ready',
    decision: 'approved_ready_for_replay',
    resultingReadiness: 'ready_for_replay',
    reviewedByUserId: 'reviewer-1',
    reviewedAt: '2026-06-21T14:30:00.000Z',
    decisionNotes: 'manual conflict review approved for replay',
    reasons: [],
    writesTaskDependencies: false,
    writesPlanDates: false,
    writesSeed: false,
    writesBaseline: false,
    writesCriticalPathFacts: false,
    writesAccelerationDraft: false,
    boundaryPolicy: ['manual_conflict_review_is_candidate_only'],
  }
}

function constructionOrganizationPlanNetworkDraftWithHandoff() {
  const draft = constructionOrganizationPlanNetworkDraft()
  return {
    ...draft,
    manualReviewHandoff: {
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
      handoffCandidateEventId: 'handoff-event-ready',
      approvalCandidateEventId: 'approval-event-ready',
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
    },
  }
}

function constructionOrganizationPlanNetworkDraftPreparedForReleaseExit() {
  const draft = constructionOrganizationPlanNetworkDraftWithHandoff()
  return {
    ...draft,
    manualReviewApproval: {
      source: 'construction_organization_plan_network_manual_review_approval_projection' as const,
      candidateEventId: 'approval-event-ready',
      assetKey: 'construction_organization.plan_network_approval.ready',
      sourceModule: 'constructionOrganizationPlanNetworkDraftService.manualReviewApproval',
      eventStatus: 'approved',
      runtimeEffect: 'candidate_only',
      createdAt: '2026-06-21T15:00:00.000Z',
      updatedAt: '2026-06-21T15:00:00.000Z',
      draftNetworkKey: draft.draftNetworkKey,
      handoffCandidateEventId: 'handoff-event-ready',
      approvedByUserId: 'approver-1',
      approvedAt: '2026-06-21T15:00:00.000Z',
      approvalDecision: 'approved_for_release_exit_preparation' as const,
      writesTaskDependencies: false as const,
      writesPlanDates: false as const,
      writesSeed: false as const,
      writesBaseline: false as const,
      writesCriticalPathFacts: false as const,
      writesAccelerationDraft: false as const,
    },
    releaseExitPreparation: {
      source: 'construction_organization_plan_network_release_exit_preparation' as const,
      status: 'ready_for_domain_writer_release_exit_package' as const,
      canMaterializeRuntime: false as const,
      draftNetworkKey: draft.draftNetworkKey,
      candidateEventId: draft.candidateEventId,
      handoffCandidateEventId: 'handoff-event-ready',
      approvalCandidateEventId: 'approval-event-ready',
      optionId: draft.optionId,
      selectedScenarioIds: draft.selectedScenarioIds,
      domainWriterKey: 'constructionOrganizationPlanNetworkDomainWriter.applyApprovedDraft' as const,
      proposedDependencyEdgeCount: draft.edgeCount,
      nodeCount: draft.nodeCount,
      edgeCount: draft.edgeCount,
      proposedDependencyEdges: draft.edges,
      evaluationEvidence: draft.evaluationEvidence,
      useCaseEvaluationEvidence: draft.useCaseEvaluationEvidence,
      requiredBeforeRuntime: [
        'domain_writer_release_exit_required',
        'runtime_consumer_verification_required',
        'impact_monitoring_required',
        'release_record_required',
        'rollback_target_required',
      ],
      packageArtifacts: [
        'approved_plan_network_draft',
        'manual_review_handoff_event',
        'manual_review_approval_event',
        'proposed_dependency_edges',
      ],
      mutationBoundary: {
        writesTaskDependencies: false as const,
        writesPlanDates: false as const,
        writesSeed: false as const,
        writesBaseline: false as const,
        writesCriticalPathFacts: false as const,
        writesAccelerationDraft: false as const,
      },
      boundaryPolicy: ['release_exit_preparation_is_candidate_only'],
    },
    domainWriterReleaseExitReadiness: {
      source: 'construction_organization_plan_network_domain_writer_release_exit_readiness' as const,
      status: 'blocked_pending_release_exit_evidence' as const,
      canMaterializeRuntime: false as const,
      draftNetworkKey: draft.draftNetworkKey,
      candidateEventId: draft.candidateEventId,
      handoffCandidateEventId: 'handoff-event-ready',
      approvalCandidateEventId: 'approval-event-ready',
      optionId: draft.optionId,
      selectedScenarioIds: draft.selectedScenarioIds,
      domainWriterKey: 'constructionOrganizationPlanNetworkDomainWriter.applyApprovedDraft' as const,
      releaseExitPreparationStatus: 'ready_for_domain_writer_release_exit_package' as const,
      proposedDependencyEdgeCount: draft.edgeCount,
      nodeCount: draft.nodeCount,
      edgeCount: draft.edgeCount,
      requiredEvidenceBeforeDomainWriter: [
        'domain_writer_release_exit_evidence_required',
        'runtime_consumer_verification_ref_required',
        'impact_monitoring_ref_required',
        'release_record_target_required',
        'rollback_target_required',
      ],
      packageArtifacts: [
        'approved_plan_network_draft',
        'manual_review_handoff_event',
        'manual_review_approval_event',
        'proposed_dependency_edges',
      ],
      mutationBoundary: {
        writesTaskDependencies: false as const,
        writesPlanDates: false as const,
        writesSeed: false as const,
        writesBaseline: false as const,
        writesCriticalPathFacts: false as const,
        writesAccelerationDraft: false as const,
      },
      boundaryPolicy: ['domain_writer_release_exit_readiness_is_read_only'],
    },
  }
}

function constructionOrganizationPlanNetworkDraftReadyForRuntimeApply() {
  const draft = constructionOrganizationPlanNetworkDraftPreparedForReleaseExit()
  return {
    ...draft,
    releaseExitHandoff: {
      source: 'construction_organization_plan_network_release_exit_handoff_projection' as const,
      candidateEventId: 'release-exit-handoff-event-ready',
      assetKey: 'construction_organization.plan_network_release_exit_handoff.ready',
      sourceModule: 'constructionOrganizationPlanNetworkDraftService.releaseExitHandoff',
      eventStatus: 'release_exit_handoff_ready',
      runtimeEffect: 'candidate_only',
      createdAt: '2026-06-22T01:50:00.000Z',
      updatedAt: '2026-06-22T01:50:00.000Z',
      draftNetworkKey: draft.draftNetworkKey,
      originalCandidateEventId: draft.candidateEventId,
      handoffCandidateEventId: 'handoff-event-ready',
      approvalCandidateEventId: 'approval-event-ready',
      optionId: draft.optionId,
      selectedScenarioIds: draft.selectedScenarioIds,
      requestedByUserId: 'release-manager-1',
      executedAt: '2026-06-22T01:50:00.000Z',
      releaseRecordTarget: 'construction-org-plan-network-release-record:v1',
      rollbackTarget: 'construction-org-plan-network:previous',
      consumerVerificationRefs: [
        'ConstructionOrganizationScenarioSummary.planNetworkDraftRecommendations',
        'constructionOrganizationPlanNetworkDraftService.releaseExitPreparation',
      ],
      impactMonitoringRefs: [
        'constructionOrganizationPlanNetworkImpactMonitoringJob',
      ],
      rollbackWriterRefs: [
        'constructionOrganizationPlanNetworkDomainWriter.rollbackApprovedDraft',
      ],
      proposedDependencyEdgeCount: draft.edgeCount,
      writesTaskDependencies: false as const,
      writesPlanDates: false as const,
      writesSeed: false as const,
      writesBaseline: false as const,
      writesCriticalPathFacts: false as const,
      writesAccelerationDraft: false as const,
    },
  }
}

function constructionOrganizationPlanNetworkRuntimeApplyResult(): ApplyConstructionOrganizationPlanNetworkApprovedDraftResult {
  return {
    source: 'construction_organization_plan_network_domain_writer',
    status: 'runtime_apply_ready',
    canMaterializeRuntime: true,
    draftNetworkKey: constructionOrganizationPlanNetworkDraft().draftNetworkKey,
    releaseHandoffCandidateEventId: 'release-exit-handoff-event-ready',
    releaseRecordTarget: 'construction-org-plan-network-release-record:v1',
    rollbackTarget: 'construction-org-plan-network:previous',
    insertedDependencyCount: 1,
    skippedDependencyCount: 0,
    appliedDependencies: [{
      edgeId: 'edge-1',
      taskId: 'task-earthwork',
      dependencyTaskId: 'task-foundation',
      dependencyType: 'FS',
      lagDays: 0,
      sourceType: 'construction_organization_plan_network',
      sourceRefId: null,
      sourceEventId: 'release-exit-handoff-event-ready',
      intent: 'pile_before_earthwork_bulk_excavation',
    }],
    releaseRecordPersisted: true,
    writesTaskDependencies: true,
    writesPlanDates: false,
    writesSeed: false,
    writesBaseline: false,
    writesCriticalPathFacts: false,
    writesAccelerationDraft: false,
    reasons: [],
    boundaryPolicy: ['domain_writer_appends_only_construction_organization_source_dependencies'],
  }
}

function constructionOrganizationPlanNetworkRuntimeEventResult(
  eventType: 'impact_monitoring' | 'rollback_execution',
  eventStatus: 'monitoring_passed' | 'rollback_executed',
): RecordConstructionOrganizationPlanNetworkRuntimeEventResult {
  return {
    source: 'construction_organization_plan_network_runtime_evidence_service',
    status: 'runtime_event_recorded',
    eventType,
    eventStatus,
    sourcePublicationKey: 'construction-org-plan-network-release-record:v1',
    eventPersisted: true,
    writesTaskDependencies: false,
    writesPlanDates: false,
    writesSeed: false,
    writesBaseline: false,
    writesCriticalPathFacts: false,
    writesAccelerationDraft: false,
    reasons: [],
    boundaryPolicy: ['runtime_evidence_service_records_observation_followup_only'],
  }
}

describe('algorithmAssetGovernanceWorkbenchOperationService', () => {
  it('blocks incomplete workbench operation requests without granting publish rights', async () => {
    const result = await executeAlgorithmAssetGovernanceWorkbenchOperation({
      action: null,
      assetType: null,
      evidenceToken: '',
    })

    expect(result).toEqual(expect.objectContaining({
      status: 'operation_blocked',
      operationAction: null,
      assetType: null,
      writesRuntimeDirectly: false,
      workbenchDoesNotGrantPublishRights: true,
      delegatedToDomainWriter: false,
    }))
    expect(result.reasons).toEqual(expect.arrayContaining([
      'operation_action_required',
      'asset_type_required',
      'evidence_token_required',
    ]))
  })

  it('blocks release handoff when domain writer, consumer, monitoring, or rollback evidence is missing', async () => {
    const result = await executeAlgorithmAssetGovernanceWorkbenchOperation({
      action: 'release_exit_handoff',
      assetType: 'learnable_parameter',
      evidenceToken: 'manual-admin-evidence-1',
      releaseExit: readyLearnableParameterReleaseExit(),
    })

    expect(result).toEqual(expect.objectContaining({
      status: 'operation_blocked',
      writesRuntimeDirectly: false,
      delegatedToDomainWriter: false,
      domainWriterKey: null,
      workbenchDoesNotGrantPublishRights: true,
    }))
    expect(result.reasons).toEqual(expect.arrayContaining([
      'domain_writer_required',
      'consumer_verification_required',
      'impact_monitoring_required',
      'rollback_writer_required',
    ]))
  })

  it('delegates a ready learnable-parameter release package only to the explicit parameter runtime writer', async () => {
    const persistLearnableParameterRuntimePublication = vi.fn(async () => publicationResult())

    const result = await executeAlgorithmAssetGovernanceWorkbenchOperation({
      action: 'release_exit_handoff',
      assetType: 'learnable_parameter',
      evidenceToken: 'manual-admin-evidence-1',
      domainWriterKey: 'algorithmAssetLearnableParameterReleaseExecutionService',
      releaseExit: readyLearnableParameterReleaseExit(),
      consumerVerificationRefs: [
        'algorithmAssetLearnableParameterRuntimeConsumptionService',
        'durationSuggestionService.duration.benchmark_blend_weight',
      ],
      impactMonitoringRefs: [
        'algorithmAssetLearnableParameterImpactMonitoringJob',
      ],
      rollbackWriterRefs: [
        'algorithmAssetLearnableParameterReleaseExecutionService.executeRuntimeRollback',
      ],
      executedAt: '2026-06-15T01:00:00.000Z',
      dependencies: {
        persistLearnableParameterRuntimePublication,
      },
    })

    expect(result).toEqual(expect.objectContaining({
      status: 'operation_delegated',
      operationAction: 'release_exit_handoff',
      assetType: 'learnable_parameter',
      writesRuntimeDirectly: false,
      workbenchDoesNotGrantPublishRights: true,
      delegatedToDomainWriter: true,
      domainWriterKey: 'algorithmAssetLearnableParameterReleaseExecutionService',
    }))
    expect(result.domainResult).toEqual(expect.objectContaining({
      status: 'runtime_parameter_published',
      writesParameterRuntime: true,
      writesSeedRuntimeDirectly: false,
    }))
    expect(persistLearnableParameterRuntimePublication).toHaveBeenCalledWith(expect.objectContaining({
      releaseExit: expect.objectContaining({
        canHandoffToRuntimeAdapter: true,
      }),
      executedAt: '2026-06-15T01:00:00.000Z',
    }))
  })

  it('blocks rollback when source publication or rollback target is missing', async () => {
    const result = await executeAlgorithmAssetGovernanceWorkbenchOperation({
      action: 'runtime_rollback',
      assetType: 'learnable_parameter',
      evidenceToken: 'rollback-evidence-1',
      domainWriterKey: 'algorithmAssetLearnableParameterReleaseExecutionService',
      consumerVerificationRefs: ['algorithmAssetLearnableParameterRuntimeConsumptionService'],
      rollbackWriterRefs: ['algorithmAssetLearnableParameterReleaseExecutionService.executeRuntimeRollback'],
    })

    expect(result).toEqual(expect.objectContaining({
      status: 'operation_blocked',
      writesRuntimeDirectly: false,
      delegatedToDomainWriter: false,
      workbenchDoesNotGrantPublishRights: true,
    }))
    expect(result.reasons).toEqual(expect.arrayContaining([
      'source_publication_key_required',
      'rollback_target_required',
    ]))
  })

  it('delegates learnable-parameter rollback to the explicit parameter rollback writer', async () => {
    const executeLearnableParameterRuntimeRollback = vi.fn(async () => rollbackResult())

    const result = await executeAlgorithmAssetGovernanceWorkbenchOperation({
      action: 'runtime_rollback',
      assetType: 'learnable_parameter',
      evidenceToken: 'rollback-evidence-1',
      domainWriterKey: 'algorithmAssetLearnableParameterReleaseExecutionService',
      sourcePublicationKey: 'learnable-parameter-runtime:event-1:company_override',
      rollbackTarget: 'duration-blend-v1',
      rollbackReason: 'impact_monitoring_failed',
      consumerVerificationRefs: ['algorithmAssetLearnableParameterRuntimeConsumptionService'],
      rollbackWriterRefs: ['algorithmAssetLearnableParameterReleaseExecutionService.executeRuntimeRollback'],
      executedAt: '2026-06-15T02:00:00.000Z',
      dependencies: {
        executeLearnableParameterRuntimeRollback,
      },
    })

    expect(result).toEqual(expect.objectContaining({
      status: 'operation_delegated',
      operationAction: 'runtime_rollback',
      assetType: 'learnable_parameter',
      writesRuntimeDirectly: false,
      delegatedToDomainWriter: true,
      domainWriterKey: 'algorithmAssetLearnableParameterReleaseExecutionService',
    }))
    expect(result.domainResult).toEqual(expect.objectContaining({
      status: 'rollback_executed',
      writesParameterRuntime: true,
      writesSeedRuntimeDirectly: false,
    }))
    expect(executeLearnableParameterRuntimeRollback).toHaveBeenCalledWith(expect.objectContaining({
      sourcePublicationKey: 'learnable-parameter-runtime:event-1:company_override',
      rollbackTarget: 'duration-blend-v1',
      reason: 'impact_monitoring_failed',
      executedAt: '2026-06-15T02:00:00.000Z',
    }))
  })

  it('delegates forecast residual overlay rollback only to the explicit overlay rollback writer', async () => {
    const executeForecastResidualOverlayRuntimeRollback = vi.fn(async () => forecastOverlayRollbackResult())

    const result = await executeAlgorithmAssetGovernanceWorkbenchOperation({
      action: 'runtime_rollback',
      assetType: 'forecast_residual_overlay',
      evidenceToken: 'overlay-rollback-evidence-1',
      domainWriterKey: 'algorithmAssetForecastResidualOverlayService.rollbackRuntimePublication',
      overlayKey: 'forecast-residual-overlay:v2',
      rollbackTarget: 'forecast-residual-overlay:v1',
      rollbackReason: 'impact_monitoring_regression',
      consumerVerificationRefs: ['taskDurationForecastService.excludes_runtime_rolled_back_overlays'],
      rollbackWriterRefs: ['rollbackAlgorithmAssetForecastResidualOverlayRuntimePublication'],
      dependencies: {
        executeForecastResidualOverlayRuntimeRollback,
      },
    })

    expect(result).toEqual(expect.objectContaining({
      status: 'operation_delegated',
      operationAction: 'runtime_rollback',
      assetType: 'forecast_residual_overlay',
      writesRuntimeDirectly: false,
      workbenchDoesNotGrantPublishRights: true,
      delegatedToDomainWriter: true,
      domainWriterKey: 'algorithmAssetForecastResidualOverlayService.rollbackRuntimePublication',
    }))
    expect(result.domainResult).toEqual(expect.objectContaining({
      status: 'rollback_executed',
      writesRuntimeOverlay: true,
      writesBaseDurationSeed: false,
    }))
    expect(executeForecastResidualOverlayRuntimeRollback).toHaveBeenCalledWith(expect.objectContaining({
      overlayKey: 'forecast-residual-overlay:v2',
      rollbackTarget: 'forecast-residual-overlay:v1',
      reason: 'impact_monitoring_regression',
    }))
  })

  it('delegates cold-start baseline rollback only to the explicit shared-baseline rollback writer', async () => {
    const executeColdStartBaselineRuntimeRollback = vi.fn(async () => coldStartBaselineRollbackResult())

    const result = await executeAlgorithmAssetGovernanceWorkbenchOperation({
      action: 'runtime_rollback',
      assetType: 'cold_start_baseline',
      evidenceToken: 'cold-start-rollback-evidence-1',
      domainWriterKey: 'algorithmAssetColdStartBaselineService.rollbackRuntimePublication',
      baselineKey: 'standard_work_duration:wall-plaster',
      segmentKey: 'residential:interior:wall-plaster',
      rollbackTarget: 'cold-start-baseline:v1',
      rollbackReason: 'impact_monitoring_regression',
      consumerVerificationRefs: ['durationSuggestionService.excludes_runtime_rolled_back_baselines'],
      rollbackWriterRefs: ['rollbackAlgorithmAssetColdStartBaselineRuntimePublicationRecord'],
      dependencies: {
        executeColdStartBaselineRuntimeRollback,
      },
    })

    expect(result).toEqual(expect.objectContaining({
      status: 'operation_delegated',
      operationAction: 'runtime_rollback',
      assetType: 'cold_start_baseline',
      writesRuntimeDirectly: false,
      workbenchDoesNotGrantPublishRights: true,
      delegatedToDomainWriter: true,
      domainWriterKey: 'algorithmAssetColdStartBaselineService.rollbackRuntimePublication',
    }))
    expect(result.domainResult).toEqual(expect.objectContaining({
      status: 'rollback_executed',
      writesSharedBaseline: true,
      writesCompanyOverride: false,
      writesBaseDurationSeed: false,
    }))
    expect(executeColdStartBaselineRuntimeRollback).toHaveBeenCalledWith(expect.objectContaining({
      baselineKey: 'standard_work_duration:wall-plaster',
      segmentKey: 'residential:interior:wall-plaster',
      rollbackTarget: 'cold-start-baseline:v1',
      reason: 'impact_monitoring_regression',
    }))
  })

  it('blocks WBS template runtime rollback when scope, writer, consumer, or rollback target is missing', async () => {
    const result = await executeAlgorithmAssetGovernanceWorkbenchOperation({
      action: 'runtime_rollback',
      assetType: 'template_seed',
      evidenceToken: 'wbs-template-rollback-evidence-1',
      sourcePublicationKey: 'duration_learning_runtime:special_work_duration_seed:v2',
      rollbackReason: 'impact_monitoring_regression',
    })

    expect(result).toEqual(expect.objectContaining({
      status: 'operation_blocked',
      operationAction: 'runtime_rollback',
      assetType: 'template_seed',
      writesRuntimeDirectly: false,
      workbenchDoesNotGrantPublishRights: true,
      delegatedToDomainWriter: false,
      domainWriterKey: null,
    }))
    expect(result.reasons).toEqual(expect.arrayContaining([
      'domain_writer_required',
      'consumer_verification_required',
      'rollback_writer_required',
      'rollback_target_required',
      'company_scope_required',
    ]))
  })

  it('delegates template seed rollback only to the canonical duration-learning writer', async () => {
    const rollbackDurationLearningRuntimePublication = vi.fn(async () => durationLearningRuntimeRollbackResult())
    const queryExec = durationLearningRuntimeRollbackQuery([
      durationLearningRuntimePublicationRow({
        publicationKey: 'duration_learning_runtime:special_work_duration_seed:v2',
        assetKey: 'special_work_duration_seed',
        artifactKey: 'artifact-special-work',
        companyId: 'company-a',
        projectId: 'project-a',
      }),
      durationLearningRuntimePublicationRow({
        publicationKey: 'duration_learning_runtime:special_work_duration_seed:previous',
        assetKey: 'special_work_duration_seed',
        artifactKey: 'artifact-special-work',
        companyId: 'company-a',
        projectId: 'project-a',
        publicationStage: 'superseded',
      }),
    ])

    const result = await executeAlgorithmAssetGovernanceWorkbenchOperation({
      action: 'runtime_rollback',
      assetType: 'template_seed',
      evidenceToken: 'wbs-template-rollback-evidence-1',
      companyId: 'company-a',
      projectId: 'project-a',
      domainWriterKey: 'durationLearningRuntimePublicationService.rollbackDurationLearningRuntimePublication',
      sourcePublicationKey: 'duration_learning_runtime:special_work_duration_seed:v2',
      rollbackTarget: 'duration_learning_runtime:special_work_duration_seed:previous',
      rollbackReason: 'impact_monitoring_regression',
      consumerVerificationRefs: ['resolveDurationLearningRuntimePublication.excludes_rolled_back'],
      rollbackWriterRefs: ['rollbackDurationLearningRuntimePublication'],
      executedAt: '2026-06-15T03:00:00.000Z',
      queryExec,
      dependencies: {
        rollbackDurationLearningRuntimePublication,
      },
    })

    expect(result).toEqual(expect.objectContaining({
      status: 'operation_delegated',
      operationAction: 'runtime_rollback',
      assetType: 'template_seed',
      writesRuntimeDirectly: false,
      workbenchDoesNotGrantPublishRights: true,
      delegatedToDomainWriter: true,
      domainWriterKey: 'durationLearningRuntimePublicationService.rollbackDurationLearningRuntimePublication',
    }))
    expect(result.domainResult).toEqual(expect.objectContaining({
      status: 'rollback_executed',
      restoredPublicationKey: 'duration_learning_runtime:special_work_duration_seed:previous',
    }))
    expect(rollbackDurationLearningRuntimePublication).toHaveBeenCalledWith(expect.objectContaining({
      publicationKey: 'duration_learning_runtime:special_work_duration_seed:v2',
      expectedPreviousPublicationKey: 'duration_learning_runtime:special_work_duration_seed:previous',
      assetKey: 'special_work_duration_seed',
      artifactKey: 'artifact-special-work',
      scope: { level: 'project', companyId: 'company-a', projectId: 'project-a' },
      reason: 'impact_monitoring_regression',
      rolledBackAt: '2026-06-15T03:00:00.000Z',
    }))
  })

  it('blocks template seed rollback for a legacy or cross-family publication key', async () => {
    const rollbackDurationLearningRuntimePublication = vi.fn(async () => durationLearningRuntimeRollbackResult())

    for (const sourcePublicationKey of [
      'wbs-template-runtime:special-work:v2',
      'duration_learning_runtime:dependency_rule_candidate:v2',
    ]) {
      const result = await executeAlgorithmAssetGovernanceWorkbenchOperation({
        action: 'runtime_rollback',
        assetType: 'template_seed',
        evidenceToken: 'wbs-template-rollback-evidence-1',
        companyId: 'company-a',
        domainWriterKey: 'durationLearningRuntimePublicationService.rollbackDurationLearningRuntimePublication',
        sourcePublicationKey,
        rollbackTarget: 'duration_learning_runtime:special_work_duration_seed:previous',
        rollbackReason: 'impact_monitoring_regression',
        consumerVerificationRefs: ['resolveDurationLearningRuntimePublication.excludes_rolled_back'],
        rollbackWriterRefs: ['rollbackDurationLearningRuntimePublication'],
        dependencies: { rollbackDurationLearningRuntimePublication },
      })

      expect(result).toEqual(expect.objectContaining({
        status: 'operation_blocked',
        reasons: expect.arrayContaining(['template_seed_runtime_publication_key_required']),
      }))
    }
    expect(rollbackDurationLearningRuntimePublication).not.toHaveBeenCalled()
  })

  it('blocks dependency rule runtime rollback when writer, consumer, or rollback target is missing', async () => {
    const result = await executeAlgorithmAssetGovernanceWorkbenchOperation({
      action: 'runtime_rollback',
      assetType: 'dependency_rule',
      evidenceToken: 'dependency-rule-rollback-evidence-1',
      sourcePublicationKey: 'dependency-rule-runtime:sequence:v2',
      rollbackReason: 'impact_monitoring_regression',
    })

    expect(result).toEqual(expect.objectContaining({
      status: 'operation_blocked',
      operationAction: 'runtime_rollback',
      assetType: 'dependency_rule',
      writesRuntimeDirectly: false,
      workbenchDoesNotGrantPublishRights: true,
      delegatedToDomainWriter: false,
      domainWriterKey: null,
    }))
    expect(result.reasons).toEqual(expect.arrayContaining([
      'domain_writer_required',
      'consumer_verification_required',
      'rollback_writer_required',
      'rollback_target_required',
    ]))
  })

  it('delegates dependency rule rollback only to the canonical duration-learning writer', async () => {
    const rollbackDurationLearningRuntimePublication = vi.fn(async () => ({
      ...durationLearningRuntimeRollbackResult(),
      restoredPublicationKey: 'duration_learning_runtime:dependency_rule_candidate:previous',
    }))
    const queryExec = durationLearningRuntimeRollbackQuery([
      durationLearningRuntimePublicationRow({
        publicationKey: 'duration_learning_runtime:dependency_rule_candidate:v2',
        assetKey: 'dependency_rule_candidate',
        artifactKey: 'artifact-dependency-rule',
        companyId: 'company-a',
        projectId: 'project-a',
      }),
      durationLearningRuntimePublicationRow({
        publicationKey: 'duration_learning_runtime:dependency_rule_candidate:previous',
        assetKey: 'dependency_rule_candidate',
        artifactKey: 'artifact-dependency-rule',
        companyId: 'company-a',
        projectId: 'project-a',
        publicationStage: 'superseded',
      }),
    ])

    const result = await executeAlgorithmAssetGovernanceWorkbenchOperation({
      action: 'runtime_rollback',
      assetType: 'dependency_rule',
      evidenceToken: 'dependency-rule-rollback-evidence-1',
      domainWriterKey: 'durationLearningRuntimePublicationService.rollbackDurationLearningRuntimePublication',
      sourcePublicationKey: 'duration_learning_runtime:dependency_rule_candidate:v2',
      rollbackTarget: 'duration_learning_runtime:dependency_rule_candidate:previous',
      rollbackReason: 'impact_monitoring_regression',
      consumerVerificationRefs: ['resolveDurationLearningRuntimePublication.excludes_rolled_back'],
      rollbackWriterRefs: ['rollbackDurationLearningRuntimePublication'],
      executedAt: '2026-06-15T03:30:00.000Z',
      companyId: 'company-a',
      projectId: 'project-a',
      queryExec,
      dependencies: {
        rollbackDurationLearningRuntimePublication,
      },
    })

    expect(result).toEqual(expect.objectContaining({
      status: 'operation_delegated',
      operationAction: 'runtime_rollback',
      assetType: 'dependency_rule',
      writesRuntimeDirectly: false,
      workbenchDoesNotGrantPublishRights: true,
      delegatedToDomainWriter: true,
      domainWriterKey: 'durationLearningRuntimePublicationService.rollbackDurationLearningRuntimePublication',
    }))
    expect(result.domainResult).toEqual(expect.objectContaining({
      status: 'rollback_executed',
      restoredPublicationKey: 'duration_learning_runtime:dependency_rule_candidate:previous',
    }))
    expect(rollbackDurationLearningRuntimePublication).toHaveBeenCalledWith(expect.objectContaining({
      publicationKey: 'duration_learning_runtime:dependency_rule_candidate:v2',
      expectedPreviousPublicationKey: 'duration_learning_runtime:dependency_rule_candidate:previous',
      assetKey: 'dependency_rule_candidate',
      artifactKey: 'artifact-dependency-rule',
      scope: { level: 'project', companyId: 'company-a', projectId: 'project-a' },
      reason: 'impact_monitoring_regression',
      rolledBackAt: '2026-06-15T03:30:00.000Z',
    }))
  })

  it('blocks dependency rule rollback for a legacy or cross-family publication key', async () => {
    const rollbackDurationLearningRuntimePublication = vi.fn(async () => durationLearningRuntimeRollbackResult())

    for (const sourcePublicationKey of [
      'dependency-rule-runtime:sequence:v2',
      'duration_learning_runtime:wbs_reference_days:v2',
    ]) {
      const result = await executeAlgorithmAssetGovernanceWorkbenchOperation({
        action: 'runtime_rollback',
        assetType: 'dependency_rule',
        evidenceToken: 'dependency-rule-rollback-evidence-1',
        domainWriterKey: 'durationLearningRuntimePublicationService.rollbackDurationLearningRuntimePublication',
        sourcePublicationKey,
        rollbackTarget: 'duration_learning_runtime:dependency_rule_candidate:previous',
        rollbackReason: 'impact_monitoring_regression',
        consumerVerificationRefs: ['resolveDurationLearningRuntimePublication.excludes_rolled_back'],
        rollbackWriterRefs: ['rollbackDurationLearningRuntimePublication'],
        dependencies: { rollbackDurationLearningRuntimePublication },
      })

      expect(result).toEqual(expect.objectContaining({
        status: 'operation_blocked',
        reasons: expect.arrayContaining(['dependency_rule_runtime_publication_key_required']),
      }))
    }
    expect(rollbackDurationLearningRuntimePublication).not.toHaveBeenCalled()
  })

  it('rejects a template rollback when the canonical source publication belongs to another company', async () => {
    const rollbackDurationLearningRuntimePublication = vi.fn(async () => durationLearningRuntimeRollbackResult())
    const queryExec = durationLearningRuntimeRollbackQuery([
      durationLearningRuntimePublicationRow({
        publicationKey: 'duration_learning_runtime:special_work_duration_seed:foreign',
        assetKey: 'special_work_duration_seed',
        artifactKey: 'artifact-foreign',
        companyId: 'company-b',
        projectId: 'project-b',
      }),
      durationLearningRuntimePublicationRow({
        publicationKey: 'duration_learning_runtime:special_work_duration_seed:foreign-previous',
        assetKey: 'special_work_duration_seed',
        artifactKey: 'artifact-foreign',
        companyId: 'company-b',
        projectId: 'project-b',
        publicationStage: 'superseded',
      }),
    ])

    const result = await executeAlgorithmAssetGovernanceWorkbenchOperation({
      action: 'runtime_rollback',
      assetType: 'template_seed',
      evidenceToken: 'wbs-template-rollback-cross-company',
      companyId: 'company-a',
      projectId: 'project-a',
      domainWriterKey: 'durationLearningRuntimePublicationService.rollbackDurationLearningRuntimePublication',
      sourcePublicationKey: 'duration_learning_runtime:special_work_duration_seed:foreign',
      rollbackTarget: 'duration_learning_runtime:special_work_duration_seed:foreign-previous',
      rollbackReason: 'cross_company_attempt',
      consumerVerificationRefs: ['resolveDurationLearningRuntimePublication.excludes_rolled_back'],
      rollbackWriterRefs: ['rollbackDurationLearningRuntimePublication'],
      queryExec,
      dependencies: { rollbackDurationLearningRuntimePublication },
    })

    expect(result.status).toBe('operation_blocked')
    expect(result.reasons).toContain('rollback_company_scope_mismatch')
    expect(rollbackDurationLearningRuntimePublication).not.toHaveBeenCalled()
  })

  it('rejects a rollback target whose canonical identity differs from the source publication', async () => {
    const rollbackDurationLearningRuntimePublication = vi.fn(async () => durationLearningRuntimeRollbackResult())
    const queryExec = durationLearningRuntimeRollbackQuery([
      durationLearningRuntimePublicationRow({
        publicationKey: 'duration_learning_runtime:special_work_duration_seed:source',
        assetKey: 'special_work_duration_seed',
        artifactKey: 'artifact-source',
        companyId: 'company-a',
        projectId: 'project-a',
      }),
      durationLearningRuntimePublicationRow({
        publicationKey: 'duration_learning_runtime:special_work_duration_seed:wrong-target',
        assetKey: 'wbs_reference_days',
        artifactKey: 'artifact-other',
        companyId: 'company-a',
        projectId: 'project-a',
        publicationStage: 'superseded',
      }),
    ])

    const result = await executeAlgorithmAssetGovernanceWorkbenchOperation({
      action: 'runtime_rollback',
      assetType: 'template_seed',
      evidenceToken: 'wbs-template-rollback-cross-asset',
      companyId: 'company-a',
      projectId: 'project-a',
      domainWriterKey: 'durationLearningRuntimePublicationService.rollbackDurationLearningRuntimePublication',
      sourcePublicationKey: 'duration_learning_runtime:special_work_duration_seed:source',
      rollbackTarget: 'duration_learning_runtime:special_work_duration_seed:wrong-target',
      rollbackReason: 'cross_asset_attempt',
      consumerVerificationRefs: ['resolveDurationLearningRuntimePublication.excludes_rolled_back'],
      rollbackWriterRefs: ['rollbackDurationLearningRuntimePublication'],
      queryExec,
      dependencies: { rollbackDurationLearningRuntimePublication },
    })

    expect(result.status).toBe('operation_blocked')
    expect(result.reasons).toContain('rollback_target_identity_mismatch')
    expect(rollbackDurationLearningRuntimePublication).not.toHaveBeenCalled()
  })

  it('requires a company scope for dependency and critical-path runtime rollback', async () => {
    const rollbackDurationLearningRuntimePublication = vi.fn(async () => durationLearningRuntimeRollbackResult())

    const result = await executeAlgorithmAssetGovernanceWorkbenchOperation({
      action: 'runtime_rollback',
      assetType: 'dependency_rule',
      evidenceToken: 'dependency-rule-rollback-without-company',
      domainWriterKey: 'durationLearningRuntimePublicationService.rollbackDurationLearningRuntimePublication',
      sourcePublicationKey: 'duration_learning_runtime:critical_path_rule_candidate:v2',
      rollbackTarget: 'duration_learning_runtime:critical_path_rule_candidate:previous',
      rollbackReason: 'missing_company_scope',
      consumerVerificationRefs: ['resolveDurationLearningRuntimePublication.excludes_rolled_back'],
      rollbackWriterRefs: ['rollbackDurationLearningRuntimePublication'],
      dependencies: { rollbackDurationLearningRuntimePublication },
    })

    expect(result.status).toBe('operation_blocked')
    expect(result.reasons).toContain('company_scope_required')
    expect(rollbackDurationLearningRuntimePublication).not.toHaveBeenCalled()
  })

  it('blocks construction organization draft handoff when writer, consumer, or draft evidence is missing', async () => {
    const result = await executeAlgorithmAssetGovernanceWorkbenchOperation({
      action: 'manual_review_handoff',
      assetType: 'construction_organization_plan_network',
      evidenceToken: 'construction-organization-handoff-evidence-1',
    })

    expect(result).toEqual(expect.objectContaining({
      status: 'operation_blocked',
      operationAction: 'manual_review_handoff',
      assetType: 'construction_organization_plan_network',
      writesRuntimeDirectly: false,
      workbenchDoesNotGrantPublishRights: true,
      delegatedToDomainWriter: false,
    }))
    expect(result.reasons).toEqual(expect.arrayContaining([
      'domain_writer_required',
      'consumer_verification_required',
      'draft_network_required',
    ]))
  })

  it('delegates construction organization plan-network drafts only to the explicit manual-review handoff writer', async () => {
    const executeConstructionOrganizationPlanNetworkManualReviewHandoff = vi.fn(async () =>
      constructionOrganizationManualReviewHandoffResult())
    const draft = constructionOrganizationPlanNetworkDraft()

    const result = await executeAlgorithmAssetGovernanceWorkbenchOperation({
      action: 'manual_review_handoff',
      assetType: 'construction_organization_plan_network',
      evidenceToken: 'construction-organization-handoff-evidence-1',
      requestedByUserId: 'user-1',
      domainWriterKey: 'constructionOrganizationPlanNetworkDraftService.manualReviewHandoff',
      constructionOrganizationPlanNetworkDraft: draft,
      consumerVerificationRefs: [
        'ConstructionOrganizationScenarioSummary.planNetworkDraftRecommendations',
        'constructionOrganizationPlanNetworkDraftService.evaluationEvidence',
      ],
      executedAt: '2026-06-21T13:00:00.000Z',
      dependencies: {
        executeConstructionOrganizationPlanNetworkManualReviewHandoff,
      },
    })

    expect(result).toEqual(expect.objectContaining({
      status: 'operation_delegated',
      operationAction: 'manual_review_handoff',
      assetType: 'construction_organization_plan_network',
      writesRuntimeDirectly: false,
      workbenchDoesNotGrantPublishRights: true,
      delegatedToDomainWriter: true,
      domainWriterKey: 'constructionOrganizationPlanNetworkDraftService.manualReviewHandoff',
    }))
    expect(result.domainResult).toEqual(expect.objectContaining({
      status: 'manual_review_handoff_ready',
      writesTaskDependencies: false,
      writesPlanDates: false,
      writesCriticalPathFacts: false,
    }))
    expect(executeConstructionOrganizationPlanNetworkManualReviewHandoff).toHaveBeenCalledWith(expect.objectContaining({
      draft,
      companyId: null,
      projectId: null,
      requestedByUserId: 'user-1',
      executedAt: '2026-06-21T13:00:00.000Z',
    }))
  })

  it('allows conflict-review-required construction organization drafts to enter manual-review handoff without granting runtime gates', async () => {
    const executeConstructionOrganizationPlanNetworkManualReviewHandoff = vi.fn(async () =>
      constructionOrganizationManualReviewHandoffResult())
    const draft = {
      ...constructionOrganizationPlanNetworkDraft(),
      readiness: 'conflict_review_required' as const,
      blockedReasons: [
        'candidate_preview_edges_violate_generated_row_dates',
        'requires_manual_conflict_review_before_replay',
      ],
    }

    const handoffResult = await executeAlgorithmAssetGovernanceWorkbenchOperation({
      action: 'manual_review_handoff',
      assetType: 'construction_organization_plan_network',
      evidenceToken: 'construction-organization-conflict-handoff-evidence-1',
      requestedByUserId: 'user-1',
      domainWriterKey: 'constructionOrganizationPlanNetworkDraftService.manualReviewHandoff',
      constructionOrganizationPlanNetworkDraft: draft,
      consumerVerificationRefs: [
        'ConstructionOrganizationScenarioSummary.planNetworkDraftRecommendations',
        'constructionOrganizationPlanNetworkDraftService.evaluationEvidence',
      ],
      executedAt: '2026-06-21T13:00:00.000Z',
      dependencies: {
        executeConstructionOrganizationPlanNetworkManualReviewHandoff,
      },
    })

    expect(handoffResult).toEqual(expect.objectContaining({
      status: 'operation_delegated',
      operationAction: 'manual_review_handoff',
      assetType: 'construction_organization_plan_network',
      writesRuntimeDirectly: false,
      workbenchDoesNotGrantPublishRights: true,
      delegatedToDomainWriter: true,
      domainWriterKey: 'constructionOrganizationPlanNetworkDraftService.manualReviewHandoff',
      reasons: [],
    }))
    expect(executeConstructionOrganizationPlanNetworkManualReviewHandoff).toHaveBeenCalledWith(expect.objectContaining({
      draft,
      requestedByUserId: 'user-1',
    }))

    const releaseResult = await executeAlgorithmAssetGovernanceWorkbenchOperation({
      action: 'release_exit_handoff',
      assetType: 'construction_organization_plan_network',
      evidenceToken: 'construction-organization-conflict-release-evidence-1',
      requestedByUserId: 'user-1',
      domainWriterKey: 'constructionOrganizationPlanNetworkDraftService.releaseExitHandoff',
      constructionOrganizationPlanNetworkDraft: draft,
      consumerVerificationRefs: ['ConstructionOrganizationScenarioSummary.planNetworkDraftRecommendations'],
      impactMonitoringRefs: ['constructionOrganizationPlanNetworkRuntimeEvidenceService'],
      rollbackWriterRefs: ['constructionOrganizationPlanNetworkDomainWriter.rollback'],
      releaseRecordTarget: 'construction-organization-release-record',
      rollbackTarget: 'construction-organization-rollback-target',
    })

    expect(releaseResult).toEqual(expect.objectContaining({
      status: 'operation_blocked',
      operationAction: 'release_exit_handoff',
      writesRuntimeDirectly: false,
      workbenchDoesNotGrantPublishRights: true,
      delegatedToDomainWriter: false,
    }))
    expect(releaseResult.reasons).toEqual(expect.arrayContaining([
      'manual_review_handoff_required',
      'manual_review_approval_required',
      'draft_not_ready_for_replay',
    ]))
  })

  it('delegates construction organization manual conflict review only to the explicit conflict-review writer', async () => {
    const executeConstructionOrganizationPlanNetworkManualConflictReview = vi.fn(async () =>
      constructionOrganizationManualConflictReviewResult())
    const draft = {
      ...constructionOrganizationPlanNetworkDraftWithHandoff(),
      readiness: 'conflict_review_required' as const,
      blockedReasons: [
        'candidate_preview_edges_violate_generated_row_dates',
        'requires_manual_conflict_review_before_replay',
      ],
    }

    const missingDecision = await executeAlgorithmAssetGovernanceWorkbenchOperation({
      action: 'manual_conflict_review',
      assetType: 'construction_organization_plan_network',
      evidenceToken: 'construction-organization-conflict-review-evidence-0',
      requestedByUserId: 'reviewer-1',
      domainWriterKey: 'constructionOrganizationPlanNetworkDraftService.manualConflictReview',
      constructionOrganizationPlanNetworkDraft: draft,
      consumerVerificationRefs: [
        'ConstructionOrganizationScenarioSummary.planNetworkDraftRecommendations',
        'constructionOrganizationPlanNetworkDraftService.evaluationEvidence',
      ],
      executedAt: '2026-06-21T14:30:00.000Z',
      dependencies: {
        executeConstructionOrganizationPlanNetworkManualConflictReview,
      },
    })
    expect(missingDecision).toEqual(expect.objectContaining({
      status: 'operation_blocked',
      operationAction: 'manual_conflict_review',
      reasons: expect.arrayContaining(['manual_conflict_review_decision_required']),
      writesRuntimeDirectly: false,
    }))
    expect(executeConstructionOrganizationPlanNetworkManualConflictReview).not.toHaveBeenCalled()

    const result = await executeAlgorithmAssetGovernanceWorkbenchOperation({
      action: 'manual_conflict_review',
      assetType: 'construction_organization_plan_network',
      evidenceToken: 'construction-organization-conflict-review-evidence-1',
      requestedByUserId: 'reviewer-1',
      domainWriterKey: 'constructionOrganizationPlanNetworkDraftService.manualConflictReview',
      constructionOrganizationPlanNetworkDraft: draft,
      manualConflictReviewDecision: 'approved_ready_for_replay',
      decisionNotes: 'manual conflict review approved for replay',
      consumerVerificationRefs: [
        'ConstructionOrganizationScenarioSummary.planNetworkDraftRecommendations',
        'constructionOrganizationPlanNetworkDraftService.evaluationEvidence',
      ],
      executedAt: '2026-06-21T14:30:00.000Z',
      dependencies: {
        executeConstructionOrganizationPlanNetworkManualConflictReview,
      },
    })

    expect(result).toEqual(expect.objectContaining({
      status: 'operation_delegated',
      operationAction: 'manual_conflict_review',
      assetType: 'construction_organization_plan_network',
      writesRuntimeDirectly: false,
      workbenchDoesNotGrantPublishRights: true,
      delegatedToDomainWriter: true,
      domainWriterKey: 'constructionOrganizationPlanNetworkDraftService.manualConflictReview',
      reasons: [],
    }))
    expect(result.domainResult).toEqual(expect.objectContaining({
      status: 'manual_conflict_review_ready',
      decision: 'approved_ready_for_replay',
      resultingReadiness: 'ready_for_replay',
      writesTaskDependencies: false,
      writesPlanDates: false,
      writesCriticalPathFacts: false,
    }))
    expect(executeConstructionOrganizationPlanNetworkManualConflictReview).toHaveBeenCalledWith(expect.objectContaining({
      draft,
      companyId: null,
      projectId: null,
      decision: 'approved_ready_for_replay',
      reviewedByUserId: 'reviewer-1',
      reviewedAt: '2026-06-21T14:30:00.000Z',
      decisionNotes: 'manual conflict review approved for replay',
    }))
  })

  it('uses the default construction organization handoff writer to persist a candidate event when queryExec is available', async () => {
    const draft = constructionOrganizationPlanNetworkDraft()
    const calls: Array<{ sql: string, params: unknown[] }> = []
    const queryExec = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> => {
      calls.push({ sql, params })
      return [{ id: 'operation-handoff-candidate-id' }] as T[]
    }

    const result = await executeAlgorithmAssetGovernanceWorkbenchOperation({
      action: 'manual_review_handoff',
      assetType: 'construction_organization_plan_network',
      evidenceToken: 'construction-organization-handoff-evidence-1',
      companyId: '10000000-0000-4000-8000-000000000001',
      projectId: '00000000-0000-4000-8000-000000000001',
      requestedByUserId: 'user-1',
      domainWriterKey: 'constructionOrganizationPlanNetworkDraftService.manualReviewHandoff',
      constructionOrganizationPlanNetworkDraft: draft,
      consumerVerificationRefs: [
        'ConstructionOrganizationScenarioSummary.planNetworkDraftRecommendations',
        'constructionOrganizationPlanNetworkDraftService.evaluationEvidence',
      ],
      executedAt: '2026-06-21T13:00:00.000Z',
      queryExec,
    })

    expect(result).toEqual(expect.objectContaining({
      status: 'operation_delegated',
      delegatedToDomainWriter: true,
      writesRuntimeDirectly: false,
      domainWriterKey: 'constructionOrganizationPlanNetworkDraftService.manualReviewHandoff',
    }))
    expect(result.domainResult).toEqual(expect.objectContaining({
      status: 'manual_review_handoff_ready',
      governancePersistence: expect.objectContaining({
        candidateEventId: 'operation-handoff-candidate-id',
      }),
      writesTaskDependencies: false,
      writesPlanDates: false,
    }))
    const sqlText = calls.map((call) => call.sql.toLowerCase()).join('\n')
    expect(sqlText).toContain('insert into public.algorithm_asset_candidate_events')
    expect(sqlText).not.toContain('task_dependencies')
  })

  it('delegates construction organization plan-network approval only to the explicit manual-review approval writer', async () => {
    const executeConstructionOrganizationPlanNetworkManualReviewApproval = vi.fn(async () =>
      constructionOrganizationManualReviewApprovalResult())
    const draft = constructionOrganizationPlanNetworkDraftWithHandoff()

    const result = await executeAlgorithmAssetGovernanceWorkbenchOperation({
      action: 'manual_review_approval',
      assetType: 'construction_organization_plan_network',
      evidenceToken: 'construction-organization-approval-evidence-1',
      requestedByUserId: 'user-2',
      domainWriterKey: 'constructionOrganizationPlanNetworkDraftService.manualReviewApproval',
      constructionOrganizationPlanNetworkDraft: draft,
      consumerVerificationRefs: [
        'ConstructionOrganizationScenarioSummary.planNetworkDraftRecommendations',
        'constructionOrganizationPlanNetworkDraftService.evaluationEvidence',
      ],
      executedAt: '2026-06-21T15:00:00.000Z',
      dependencies: {
        executeConstructionOrganizationPlanNetworkManualReviewApproval,
      },
    })

    expect(result).toEqual(expect.objectContaining({
      status: 'operation_delegated',
      operationAction: 'manual_review_approval',
      assetType: 'construction_organization_plan_network',
      writesRuntimeDirectly: false,
      workbenchDoesNotGrantPublishRights: true,
      delegatedToDomainWriter: true,
      domainWriterKey: 'constructionOrganizationPlanNetworkDraftService.manualReviewApproval',
    }))
    expect(result.domainResult).toEqual(expect.objectContaining({
      status: 'manual_review_approval_ready',
      writesTaskDependencies: false,
      writesPlanDates: false,
      writesCriticalPathFacts: false,
    }))
    expect(executeConstructionOrganizationPlanNetworkManualReviewApproval).toHaveBeenCalledWith(expect.objectContaining({
      draft,
      companyId: null,
      projectId: null,
      approvedByUserId: 'user-2',
      approvedAt: '2026-06-21T15:00:00.000Z',
    }))
  })

  it('uses the default construction organization approval writer to persist a candidate event when queryExec is available', async () => {
    const draft = constructionOrganizationPlanNetworkDraftWithHandoff()
    const calls: Array<{ sql: string, params: unknown[] }> = []
    const queryExec = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> => {
      calls.push({ sql, params })
      return [{ id: 'approval-candidate-event-id' }] as T[]
    }

    const result = await executeAlgorithmAssetGovernanceWorkbenchOperation({
      action: 'manual_review_approval',
      assetType: 'construction_organization_plan_network',
      evidenceToken: 'construction-organization-approval-evidence-1',
      companyId: '10000000-0000-4000-8000-000000000001',
      projectId: '00000000-0000-4000-8000-000000000001',
      requestedByUserId: 'user-2',
      domainWriterKey: 'constructionOrganizationPlanNetworkDraftService.manualReviewApproval',
      constructionOrganizationPlanNetworkDraft: draft,
      consumerVerificationRefs: [
        'ConstructionOrganizationScenarioSummary.planNetworkDraftRecommendations',
        'constructionOrganizationPlanNetworkDraftService.evaluationEvidence',
      ],
      executedAt: '2026-06-21T15:00:00.000Z',
      queryExec,
    })

    expect(result).toEqual(expect.objectContaining({
      status: 'operation_delegated',
      delegatedToDomainWriter: true,
      writesRuntimeDirectly: false,
      domainWriterKey: 'constructionOrganizationPlanNetworkDraftService.manualReviewApproval',
    }))
    expect(result.domainResult).toEqual(expect.objectContaining({
      status: 'manual_review_approval_ready',
      governancePersistence: expect.objectContaining({
        candidateEventId: 'approval-candidate-event-id',
      }),
      writesTaskDependencies: false,
      writesPlanDates: false,
    }))
    const sqlText = calls.map((call) => call.sql.toLowerCase()).join('\n')
    expect(sqlText).toContain('insert into public.algorithm_asset_candidate_events')
    expect(sqlText).not.toContain('task_dependencies')
  })

  it('blocks construction organization release-exit handoff when writer, evidence, or prepared draft package is missing', async () => {
    const result = await executeAlgorithmAssetGovernanceWorkbenchOperation({
      action: 'release_exit_handoff',
      assetType: 'construction_organization_plan_network',
      evidenceToken: 'construction-organization-release-exit-evidence-1',
    })

    expect(result).toEqual(expect.objectContaining({
      status: 'operation_blocked',
      operationAction: 'release_exit_handoff',
      assetType: 'construction_organization_plan_network',
      writesRuntimeDirectly: false,
      workbenchDoesNotGrantPublishRights: true,
      delegatedToDomainWriter: false,
    }))
    expect(result.reasons).toEqual(expect.arrayContaining([
      'domain_writer_required',
      'consumer_verification_required',
      'impact_monitoring_required',
      'rollback_writer_required',
      'rollback_target_required',
      'release_record_target_required',
      'draft_network_required',
    ]))
  })

  it('delegates construction organization release-exit handoff only to the explicit candidate-only handoff writer', async () => {
    const draft = constructionOrganizationPlanNetworkDraftPreparedForReleaseExit()
    const consumerVerificationRefs = [
      'ConstructionOrganizationScenarioSummary.planNetworkDraftRecommendations',
      'constructionOrganizationPlanNetworkDraftService.releaseExitPreparation',
    ]
    const impactMonitoringRefs = [
      'constructionOrganizationPlanNetworkImpactMonitoringJob',
    ]
    const rollbackWriterRefs = [
      'constructionOrganizationPlanNetworkDomainWriter.rollbackApprovedDraft',
    ]
    const executeConstructionOrganizationPlanNetworkReleaseExitHandoff = vi.fn(async (): Promise<ConstructionOrganizationPlanNetworkReleaseExitHandoffResult> => ({
      source: 'construction_organization_plan_network_release_exit_handoff',
      status: 'release_exit_handoff_ready',
      canMaterializeRuntime: false,
      draftNetworkKey: draft.draftNetworkKey,
      candidateEventId: draft.candidateEventId,
      handoffCandidateEventId: 'handoff-event-ready',
      approvalCandidateEventId: 'approval-event-ready',
      optionId: draft.optionId,
      selectedScenarioIds: draft.selectedScenarioIds,
      requestedByUserId: 'release-manager-1',
      executedAt: '2026-06-22T01:50:00.000Z',
      releaseRecordTarget: 'construction-org-plan-network-release-record:v1',
      rollbackTarget: 'construction-org-plan-network:previous',
      consumerVerificationRefs,
      impactMonitoringRefs,
      rollbackWriterRefs,
      proposedDependencyEdgeCount: draft.edgeCount,
      proposedDependencyEdges: draft.edges,
      packageArtifacts: draft.releaseExitPreparation?.packageArtifacts ?? [],
      reasons: [],
      writesTaskDependencies: false as const,
      writesPlanDates: false as const,
      writesSeed: false as const,
      writesBaseline: false as const,
      writesCriticalPathFacts: false as const,
      writesAccelerationDraft: false as const,
      boundaryPolicy: ['release_exit_handoff_is_candidate_only'],
    }))

    const result = await executeAlgorithmAssetGovernanceWorkbenchOperation({
      action: 'release_exit_handoff',
      assetType: 'construction_organization_plan_network',
      evidenceToken: 'construction-organization-release-exit-evidence-1',
      requestedByUserId: 'release-manager-1',
      domainWriterKey: 'constructionOrganizationPlanNetworkDraftService.releaseExitHandoff',
      constructionOrganizationPlanNetworkDraft: draft,
      consumerVerificationRefs,
      impactMonitoringRefs,
      rollbackWriterRefs,
      rollbackTarget: 'construction-org-plan-network:previous',
      releaseRecordTarget: 'construction-org-plan-network-release-record:v1',
      executedAt: '2026-06-22T01:50:00.000Z',
      dependencies: {
        executeConstructionOrganizationPlanNetworkReleaseExitHandoff,
      },
    })

    expect(result).toEqual(expect.objectContaining({
      status: 'operation_delegated',
      operationAction: 'release_exit_handoff',
      assetType: 'construction_organization_plan_network',
      writesRuntimeDirectly: false,
      workbenchDoesNotGrantPublishRights: true,
      delegatedToDomainWriter: true,
      domainWriterKey: 'constructionOrganizationPlanNetworkDraftService.releaseExitHandoff',
    }))
    expect(result.domainResult).toEqual(expect.objectContaining({
      status: 'release_exit_handoff_ready',
      canMaterializeRuntime: false,
      writesTaskDependencies: false,
      writesPlanDates: false,
      writesCriticalPathFacts: false,
    }))
    expect(executeConstructionOrganizationPlanNetworkReleaseExitHandoff).toHaveBeenCalledWith(expect.objectContaining({
      draft,
      requestedByUserId: 'release-manager-1',
      executedAt: '2026-06-22T01:50:00.000Z',
      consumerVerificationRefs,
      impactMonitoringRefs,
      rollbackWriterRefs,
      rollbackTarget: 'construction-org-plan-network:previous',
      releaseRecordTarget: 'construction-org-plan-network-release-record:v1',
    }))
  })

  it('uses the default construction organization release-exit handoff writer to persist a candidate event only', async () => {
    const draft = constructionOrganizationPlanNetworkDraftPreparedForReleaseExit()
    const calls: Array<{ sql: string, params: unknown[] }> = []
    const queryExec = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> => {
      calls.push({ sql, params })
      return [{ id: 'release-exit-handoff-candidate-event-id' }] as T[]
    }

    const result = await executeAlgorithmAssetGovernanceWorkbenchOperation({
      action: 'release_exit_handoff',
      assetType: 'construction_organization_plan_network',
      evidenceToken: 'construction-organization-release-exit-evidence-1',
      companyId: '10000000-0000-4000-8000-000000000001',
      projectId: '00000000-0000-4000-8000-000000000001',
      requestedByUserId: 'release-manager-1',
      domainWriterKey: 'constructionOrganizationPlanNetworkDraftService.releaseExitHandoff',
      constructionOrganizationPlanNetworkDraft: draft,
      consumerVerificationRefs: [
        'ConstructionOrganizationScenarioSummary.planNetworkDraftRecommendations',
        'constructionOrganizationPlanNetworkDraftService.releaseExitPreparation',
      ],
      impactMonitoringRefs: [
        'constructionOrganizationPlanNetworkImpactMonitoringJob',
      ],
      rollbackWriterRefs: [
        'constructionOrganizationPlanNetworkDomainWriter.rollbackApprovedDraft',
      ],
      rollbackTarget: 'construction-org-plan-network:previous',
      releaseRecordTarget: 'construction-org-plan-network-release-record:v1',
      executedAt: '2026-06-22T01:50:00.000Z',
      queryExec,
    })

    expect(result).toEqual(expect.objectContaining({
      status: 'operation_delegated',
      delegatedToDomainWriter: true,
      writesRuntimeDirectly: false,
      domainWriterKey: 'constructionOrganizationPlanNetworkDraftService.releaseExitHandoff',
    }))
    expect(result.domainResult).toEqual(expect.objectContaining({
      status: 'release_exit_handoff_ready',
      governancePersistence: expect.objectContaining({
        candidateEventId: 'release-exit-handoff-candidate-event-id',
      }),
      canMaterializeRuntime: false,
      writesTaskDependencies: false,
      writesPlanDates: false,
    }))
    const sqlText = calls.map((call) => call.sql.toLowerCase()).join('\n')
    expect(sqlText).toContain('insert into public.algorithm_asset_candidate_events')
    expect(sqlText).not.toContain('task_dependencies')
    const serializedParams = JSON.stringify(calls.map((call) => call.params))
    expect(serializedParams).toContain('construction_organization.plan_network_release_exit_handoff')
    expect(serializedParams).toContain('release_exit_handoff_event_does_not_materialize_dependencies')
  })

  it('blocks construction organization runtime apply when release evidence or domain writer is missing', async () => {
    const result = await executeAlgorithmAssetGovernanceWorkbenchOperation({
      action: 'runtime_apply',
      assetType: 'construction_organization_plan_network',
      evidenceToken: 'construction-organization-runtime-apply-evidence-1',
      constructionOrganizationPlanNetworkDraft: constructionOrganizationPlanNetworkDraftPreparedForReleaseExit(),
    })

    expect(result).toEqual(expect.objectContaining({
      status: 'operation_blocked',
      operationAction: 'runtime_apply',
      assetType: 'construction_organization_plan_network',
      writesRuntimeDirectly: false,
      workbenchDoesNotGrantPublishRights: true,
      delegatedToDomainWriter: false,
    }))
    expect(result.reasons).toEqual(expect.arrayContaining([
      'domain_writer_required',
      'release_exit_handoff_required',
      'release_record_target_required',
      'rollback_target_required',
    ]))
  })

  it('delegates construction organization runtime apply only to the approved draft domain writer', async () => {
    const draft = constructionOrganizationPlanNetworkDraftReadyForRuntimeApply()
    const applyConstructionOrganizationPlanNetworkApprovedDraft = vi.fn(async () =>
      constructionOrganizationPlanNetworkRuntimeApplyResult())

    const result = await executeAlgorithmAssetGovernanceWorkbenchOperation({
      action: 'runtime_apply',
      assetType: 'construction_organization_plan_network',
      evidenceToken: 'construction-organization-runtime-apply-evidence-1',
      companyId: '10000000-0000-4000-8000-000000000001',
      projectId: '00000000-0000-4000-8000-000000000001',
      requestedByUserId: 'release-manager-1',
      domainWriterKey: 'constructionOrganizationPlanNetworkDomainWriter.applyApprovedDraft',
      constructionOrganizationPlanNetworkDraft: draft,
      consumerVerificationRefs: [
        'ConstructionOrganizationScenarioSummary.planNetworkDraftRecommendations',
        'scheduleAccelerationRuntimeService.constructionOrganizationPlanNetworkPublicationLineage',
      ],
      impactMonitoringRefs: [
        'constructionOrganizationPlanNetworkImpactMonitoringJob',
      ],
      rollbackWriterRefs: [
        'constructionOrganizationPlanNetworkDomainWriter.rollbackApprovedDraft',
      ],
      releaseRecordTarget: 'construction-org-plan-network-release-record:v1',
      rollbackTarget: 'construction-org-plan-network:previous',
      executedAt: '2026-06-22T02:30:00.000Z',
      dependencies: {
        applyConstructionOrganizationPlanNetworkApprovedDraft,
      },
    })

    expect(result).toEqual(expect.objectContaining({
      status: 'operation_delegated',
      operationAction: 'runtime_apply',
      assetType: 'construction_organization_plan_network',
      writesRuntimeDirectly: false,
      workbenchDoesNotGrantPublishRights: true,
      delegatedToDomainWriter: true,
      domainWriterKey: 'constructionOrganizationPlanNetworkDomainWriter.applyApprovedDraft',
    }))
    expect(result.domainResult).toEqual(expect.objectContaining({
      status: 'runtime_apply_ready',
      canMaterializeRuntime: true,
      writesTaskDependencies: true,
      writesPlanDates: false,
      writesCriticalPathFacts: false,
    }))
    expect(applyConstructionOrganizationPlanNetworkApprovedDraft).toHaveBeenCalledWith(expect.objectContaining({
      draft,
      companyId: '10000000-0000-4000-8000-000000000001',
      projectId: '00000000-0000-4000-8000-000000000001',
      executedByUserId: 'release-manager-1',
      executedAt: '2026-06-22T02:30:00.000Z',
    }))
  })

  it('uses the default construction organization runtime apply writer to upsert dependencies and publication records', async () => {
    const draft = constructionOrganizationPlanNetworkDraftReadyForRuntimeApply()
    const calls: Array<{ sql: string, params: unknown[] }> = []
    const queryExec = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> => {
      calls.push({ sql, params })
      if (sql.includes('FROM public.tasks')) {
        return [
          {
            id: 'task-foundation',
            standard_task_metadata: { rowCarrierClientRowId: 'row-foundation' },
          },
          {
            id: 'task-earthwork',
            standard_task_metadata: { rowCarrierClientRowId: 'row-earthwork' },
          },
        ] as T[]
      }
      return [{ id: 'persisted-row-id' }] as T[]
    }

    const result = await executeAlgorithmAssetGovernanceWorkbenchOperation({
      action: 'runtime_apply',
      assetType: 'construction_organization_plan_network',
      evidenceToken: 'construction-organization-runtime-apply-evidence-1',
      companyId: '10000000-0000-4000-8000-000000000001',
      projectId: '00000000-0000-4000-8000-000000000001',
      requestedByUserId: 'release-manager-1',
      domainWriterKey: 'constructionOrganizationPlanNetworkDomainWriter.applyApprovedDraft',
      constructionOrganizationPlanNetworkDraft: draft,
      consumerVerificationRefs: [
        'ConstructionOrganizationScenarioSummary.planNetworkDraftRecommendations',
        'scheduleAccelerationRuntimeService.constructionOrganizationPlanNetworkPublicationLineage',
      ],
      impactMonitoringRefs: [
        'constructionOrganizationPlanNetworkImpactMonitoringJob',
      ],
      rollbackWriterRefs: [
        'constructionOrganizationPlanNetworkDomainWriter.rollbackApprovedDraft',
      ],
      releaseRecordTarget: 'construction-org-plan-network-release-record:v1',
      rollbackTarget: 'construction-org-plan-network:previous',
      executedAt: '2026-06-22T02:30:00.000Z',
      queryExec,
    })

    expect(result).toEqual(expect.objectContaining({
      status: 'operation_delegated',
      delegatedToDomainWriter: true,
      writesRuntimeDirectly: false,
      domainWriterKey: 'constructionOrganizationPlanNetworkDomainWriter.applyApprovedDraft',
    }))
    expect(result.domainResult).toEqual(expect.objectContaining({
      source: 'construction_organization_plan_network_domain_writer',
      status: 'runtime_apply_ready',
      canMaterializeRuntime: true,
      insertedDependencyCount: 1,
      releaseRecordPersisted: true,
      writesTaskDependencies: true,
      writesPlanDates: false,
      writesSeed: false,
      writesCriticalPathFacts: false,
    }))
    const sqlText = calls.map((call) => call.sql.toLowerCase()).join('\n')
    expect(sqlText).toContain('from public.tasks')
    expect(sqlText).toContain('insert into public.task_dependencies')
    expect(sqlText).toContain('insert into public.construction_organization_plan_network_runtime_publications')
  })

  it('delegates construction organization impact monitoring only to the runtime evidence service', async () => {
    const recordConstructionOrganizationPlanNetworkRuntimeEvent = vi.fn(async () =>
      constructionOrganizationPlanNetworkRuntimeEventResult('impact_monitoring', 'monitoring_passed'))

    const result = await executeAlgorithmAssetGovernanceWorkbenchOperation({
      action: 'runtime_impact_monitoring',
      assetType: 'construction_organization_plan_network',
      evidenceToken: 'construction-organization-impact-monitoring-evidence-1',
      workPackageKey: 'construction_organization_product_outcome:hospital',
      useCase: 'accelerationRecovery',
      evidenceAction: 'record_impact_monitoring_for_business_type',
      sourcePublicationKey: 'construction-org-plan-network-release-record:v1',
      domainWriterKey: 'constructionOrganizationPlanNetworkRuntimeEvidenceService.recordRuntimeEvent',
      businessType: 'hospital',
      consumerVerificationRefs: [
        'scheduleAccelerationRuntimeService.constructionOrganizationPlanNetworkPublicationLineage',
      ],
      impactMonitoringRefs: [
        'constructionOrganizationPlanNetworkImpactMonitoringJob',
      ],
      executedAt: '2026-06-22T03:00:00.000Z',
      dependencies: {
        recordConstructionOrganizationPlanNetworkRuntimeEvent,
      },
    })

    expect(result).toEqual(expect.objectContaining({
      status: 'operation_delegated',
      operationAction: 'runtime_impact_monitoring',
      assetType: 'construction_organization_plan_network',
      writesRuntimeDirectly: false,
      workbenchDoesNotGrantPublishRights: true,
      delegatedToDomainWriter: true,
      domainWriterKey: 'constructionOrganizationPlanNetworkRuntimeEvidenceService.recordRuntimeEvent',
    }))
    expect(result.domainResult).toEqual(expect.objectContaining({
      status: 'runtime_event_recorded',
      eventType: 'impact_monitoring',
      eventStatus: 'monitoring_passed',
      writesTaskDependencies: false,
      writesPlanDates: false,
      writesCriticalPathFacts: false,
    }))
    expect(recordConstructionOrganizationPlanNetworkRuntimeEvent).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'impact_monitoring',
      eventStatus: 'monitoring_passed',
      publicationKey: 'construction-org-plan-network-release-record:v1',
      executedAt: '2026-06-22T03:00:00.000Z',
      eventPayload: expect.objectContaining({
        evidenceToken: 'construction-organization-impact-monitoring-evidence-1',
        workPackageKey: 'construction_organization_product_outcome:hospital',
        useCase: 'accelerationRecovery',
        evidenceAction: 'record_impact_monitoring_for_business_type',
        businessType: 'hospital',
        consumerVerificationRefs: [
          'scheduleAccelerationRuntimeService.constructionOrganizationPlanNetworkPublicationLineage',
        ],
        impactMonitoringRefs: [
          'constructionOrganizationPlanNetworkImpactMonitoringJob',
        ],
      }),
    }))
  })

  it.each([
    {
      action: 'runtime_consumer_observation' as const,
      domainWriterKey: 'durationRuntimeConsumerObservationService.recordScheduleAccelerationRuntimeConsumedArtifacts',
    },
    {
      action: 'runtime_impact_monitoring' as const,
      domainWriterKey: 'constructionOrganizationPlanNetworkRuntimeEvidenceService.recordRuntimeEvent',
    },
    {
      action: 'runtime_rollback_execution' as const,
      domainWriterKey: 'constructionOrganizationPlanNetworkRuntimeEvidenceService.recordRuntimeEvent',
    },
    {
      action: 'runtime_saved_outcome' as const,
      domainWriterKey: 'constructionOrganizationPlanNetworkRuntimeEvidenceService.recordSavedOutcome',
    },
    {
      action: 'runtime_engine_evidence' as const,
      domainWriterKey: 'constructionOrganizationPlanNetworkRuntimeEvidenceService.recordRuntimeEngineEvidence',
    },
    {
      action: 'runtime_recommendation_adopt' as const,
      domainWriterKey: 'constructionOrganizationPlanNetworkRuntimeEvidenceService.recordRecommendationDecision',
    },
    {
      action: 'runtime_recommendation_decline' as const,
      domainWriterKey: 'constructionOrganizationPlanNetworkRuntimeEvidenceService.recordRecommendationDecision',
    },
  ])('blocks construction organization $action without structured business type attribution', async ({ action, domainWriterKey }) => {
    const recordConstructionOrganizationPlanNetworkRuntimeEvent = vi.fn(async () =>
      constructionOrganizationPlanNetworkRuntimeEventResult('impact_monitoring', 'monitoring_passed'))
    const recordConstructionOrganizationPlanNetworkSavedOutcome = vi.fn()
    const recordConstructionOrganizationPlanNetworkRuntimeEngineEvidence = vi.fn()
    const recordConstructionOrganizationPlanNetworkRecommendationDecision = vi.fn()

    const result = await executeAlgorithmAssetGovernanceWorkbenchOperation({
      action,
      assetType: 'construction_organization_plan_network',
      evidenceToken: `construction-organization-${action}-evidence`,
      sourcePublicationKey: 'construction-org-plan-network-release-record:v1',
      releaseRecordTarget: 'option-ready',
      rollbackTarget: 'draft-ready',
      rollbackReason: 'impact_monitoring_regression',
      engineCode: 'critical_path_cpm',
      predictedDurationDays: 180,
      actualDurationDays: 184,
      domainWriterKey,
      companyId: 'company-1',
      projectId: 'project-1',
      businessType: '',
      consumerVerificationRefs: ['scheduleAccelerationRuntimeService.constructionOrganizationPlanNetworkPublicationLineage'],
      impactMonitoringRefs: ['constructionOrganizationPlanNetworkImpactMonitoringJob'],
      rollbackWriterRefs: ['constructionOrganizationPlanNetworkDomainWriter.rollbackApprovedDraft'],
      dependencies: {
        recordConstructionOrganizationPlanNetworkRuntimeEvent,
        recordConstructionOrganizationPlanNetworkSavedOutcome,
        recordConstructionOrganizationPlanNetworkRuntimeEngineEvidence,
        recordConstructionOrganizationPlanNetworkRecommendationDecision,
      },
    })

    expect(result).toEqual(expect.objectContaining({
      status: 'operation_blocked',
      operationAction: action,
      assetType: 'construction_organization_plan_network',
      writesRuntimeDirectly: false,
      delegatedToDomainWriter: false,
      reasons: expect.arrayContaining(['business_type_required']),
    }))
    expect(recordConstructionOrganizationPlanNetworkRuntimeEvent).not.toHaveBeenCalled()
    expect(recordConstructionOrganizationPlanNetworkSavedOutcome).not.toHaveBeenCalled()
    expect(recordConstructionOrganizationPlanNetworkRuntimeEngineEvidence).not.toHaveBeenCalled()
    expect(recordConstructionOrganizationPlanNetworkRecommendationDecision).not.toHaveBeenCalled()
  })

  it('delegates construction organization rollback execution evidence only to the runtime evidence service', async () => {
    const recordConstructionOrganizationPlanNetworkRuntimeEvent = vi.fn(async () =>
      constructionOrganizationPlanNetworkRuntimeEventResult('rollback_execution', 'rollback_executed'))

    const result = await executeAlgorithmAssetGovernanceWorkbenchOperation({
      action: 'runtime_rollback_execution',
      assetType: 'construction_organization_plan_network',
      evidenceToken: 'construction-organization-rollback-execution-evidence-1',
      workPackageKey: 'construction_organization_product_outcome:hospital',
      useCase: 'accelerationRecovery',
      evidenceAction: 'record_rollback_evidence_for_business_type',
      sourcePublicationKey: 'construction-org-plan-network-release-record:v1',
      rollbackTarget: 'construction-organization-plan-network-rollback:option-ready',
      rollbackReason: 'impact_monitoring_regression',
      domainWriterKey: 'constructionOrganizationPlanNetworkRuntimeEvidenceService.recordRuntimeEvent',
      businessType: 'hospital',
      rollbackWriterRefs: [
        'constructionOrganizationPlanNetworkDomainWriter.rollbackApprovedDraft',
      ],
      executedAt: '2026-06-22T03:30:00.000Z',
      dependencies: {
        recordConstructionOrganizationPlanNetworkRuntimeEvent,
      },
    })

    expect(result).toEqual(expect.objectContaining({
      status: 'operation_delegated',
      operationAction: 'runtime_rollback_execution',
      assetType: 'construction_organization_plan_network',
      writesRuntimeDirectly: false,
      workbenchDoesNotGrantPublishRights: true,
      delegatedToDomainWriter: true,
      domainWriterKey: 'constructionOrganizationPlanNetworkRuntimeEvidenceService.recordRuntimeEvent',
    }))
    expect(result.domainResult).toEqual(expect.objectContaining({
      status: 'runtime_event_recorded',
      eventType: 'rollback_execution',
      eventStatus: 'rollback_executed',
      writesTaskDependencies: false,
      writesPlanDates: false,
      writesCriticalPathFacts: false,
    }))
    expect(recordConstructionOrganizationPlanNetworkRuntimeEvent).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'rollback_execution',
      eventStatus: 'rollback_executed',
      publicationKey: 'construction-org-plan-network-release-record:v1',
      executedAt: '2026-06-22T03:30:00.000Z',
      eventPayload: expect.objectContaining({
        evidenceToken: 'construction-organization-rollback-execution-evidence-1',
        workPackageKey: 'construction_organization_product_outcome:hospital',
        useCase: 'accelerationRecovery',
        evidenceAction: 'record_rollback_evidence_for_business_type',
        businessType: 'hospital',
        rollbackTarget: 'construction-organization-plan-network-rollback:option-ready',
        rollbackReason: 'impact_monitoring_regression',
        rollbackWriterRefs: [
          'constructionOrganizationPlanNetworkDomainWriter.rollbackApprovedDraft',
        ],
      }),
    }))
  })

  it('delegates construction organization saved network outcome only to the runtime evidence service', async () => {
    const recordConstructionOrganizationPlanNetworkSavedOutcome = vi.fn(async (): Promise<RecordConstructionOrganizationPlanNetworkSavedOutcomeResult> => ({
      source: 'construction_organization_plan_network_runtime_evidence_service' as const,
      status: 'saved_network_outcome_recorded' as const,
      publicationKey: 'construction-org-plan-network-release-record:v1',
      outcomeStatus: 'accepted',
      outcomePersisted: true,
      writesTaskDependencies: false,
      writesPlanDates: false,
      writesSeed: false,
      writesBaseline: false,
      writesCriticalPathFacts: false,
      writesAccelerationDraft: false,
      reasons: [],
      boundaryPolicy: ['does_not_write_task_dependencies_or_plan_dates'],
    }))

    const result = await executeAlgorithmAssetGovernanceWorkbenchOperation({
      action: 'runtime_saved_outcome',
      assetType: 'construction_organization_plan_network',
      evidenceToken: 'construction-organization-saved-outcome-evidence-1',
      workPackageKey: 'construction_organization_product_outcome:hospital',
      useCase: 'newProjectPlanning',
      evidenceAction: 'record_saved_network_outcome_for_business_type',
      sourcePublicationKey: 'construction-org-plan-network-release-record:v1',
      releaseRecordTarget: 'construction-organization-plan-network-outcome:option-ready',
      domainWriterKey: 'constructionOrganizationPlanNetworkRuntimeEvidenceService.recordSavedOutcome',
      companyId: 'company-1',
      projectId: 'project-1',
      businessType: 'hospital',
      executedAt: '2026-06-22T04:00:00.000Z',
      dependencies: {
        recordConstructionOrganizationPlanNetworkSavedOutcome,
      },
    })

    expect(result).toEqual(expect.objectContaining({
      status: 'operation_delegated',
      operationAction: 'runtime_saved_outcome',
      assetType: 'construction_organization_plan_network',
      writesRuntimeDirectly: false,
      workbenchDoesNotGrantPublishRights: true,
      delegatedToDomainWriter: true,
      domainWriterKey: 'constructionOrganizationPlanNetworkRuntimeEvidenceService.recordSavedOutcome',
    }))
    expect(result.domainResult).toEqual(expect.objectContaining({
      status: 'saved_network_outcome_recorded',
      outcomeStatus: 'accepted',
      writesTaskDependencies: false,
      writesPlanDates: false,
      writesCriticalPathFacts: false,
    }))
    expect(recordConstructionOrganizationPlanNetworkSavedOutcome).toHaveBeenCalledWith(expect.objectContaining({
      publicationKey: 'construction-org-plan-network-release-record:v1',
      outcomeStatus: 'accepted',
      outcomeRef: 'construction-organization-plan-network-outcome:option-ready',
      companyId: 'company-1',
      projectId: 'project-1',
      observedAt: '2026-06-22T04:00:00.000Z',
      metadata: expect.objectContaining({
        evidenceToken: 'construction-organization-saved-outcome-evidence-1',
        workPackageKey: 'construction_organization_product_outcome:hospital',
        useCase: 'newProjectPlanning',
        evidenceAction: 'record_saved_network_outcome_for_business_type',
        businessType: 'hospital',
        requestedByUserId: null,
      }),
    }))
  })

  it('delegates construction organization runtime engine evidence only to the runtime evidence service', async () => {
    const recordConstructionOrganizationPlanNetworkRuntimeEngineEvidence = vi.fn(async (): Promise<RecordConstructionOrganizationPlanNetworkRuntimeEngineEvidenceResult> => ({
      source: 'construction_organization_plan_network_runtime_evidence_service' as const,
      status: 'runtime_engine_evidence_recorded' as const,
      publicationKey: 'construction-org-plan-network-release-record:v1',
      engineCode: 'critical_path_cpm',
      evidencePersisted: true,
      writesTaskDependencies: false,
      writesPlanDates: false,
      writesSeed: false,
      writesBaseline: false,
      writesCriticalPathFacts: false,
      writesAccelerationDraft: false,
      reasons: [],
      boundaryPolicy: ['does_not_write_task_dependencies_or_plan_dates'],
    }))

    const result = await executeAlgorithmAssetGovernanceWorkbenchOperation({
      action: 'runtime_engine_evidence',
      assetType: 'construction_organization_plan_network',
      evidenceToken: 'construction-organization-runtime-engine-evidence-1',
      workPackageKey: 'construction_organization_product_outcome:hospital',
      useCase: 'newProjectPlanning',
      evidenceAction: 'collect_runtime_ready_use_case_option_evidence_for_business_type',
      sourcePublicationKey: 'construction-org-plan-network-release-record:v1',
      engineCode: 'critical_path_cpm',
      predictedDurationDays: 180,
      actualDurationDays: 184,
      domainWriterKey: 'constructionOrganizationPlanNetworkRuntimeEvidenceService.recordRuntimeEngineEvidence',
      companyId: 'company-1',
      projectId: 'project-1',
      businessType: 'hospital',
      executedAt: '2026-06-22T05:00:00.000Z',
      dependencies: {
        recordConstructionOrganizationPlanNetworkRuntimeEngineEvidence,
      },
    })

    expect(result).toEqual(expect.objectContaining({
      status: 'operation_delegated',
      operationAction: 'runtime_engine_evidence',
      assetType: 'construction_organization_plan_network',
      writesRuntimeDirectly: false,
      workbenchDoesNotGrantPublishRights: true,
      delegatedToDomainWriter: true,
      domainWriterKey: 'constructionOrganizationPlanNetworkRuntimeEvidenceService.recordRuntimeEngineEvidence',
    }))
    expect(result.domainResult).toEqual(expect.objectContaining({
      status: 'runtime_engine_evidence_recorded',
      engineCode: 'critical_path_cpm',
      writesTaskDependencies: false,
      writesPlanDates: false,
      writesCriticalPathFacts: false,
    }))
    expect(recordConstructionOrganizationPlanNetworkRuntimeEngineEvidence).toHaveBeenCalledWith(expect.objectContaining({
      publicationKey: 'construction-org-plan-network-release-record:v1',
      engineCode: 'critical_path_cpm',
      projectId: 'project-1',
      predictedDurationDays: 180,
      actualDurationDays: 184,
      observedAt: '2026-06-22T05:00:00.000Z',
      metadata: expect.objectContaining({
        evidenceToken: 'construction-organization-runtime-engine-evidence-1',
        workPackageKey: 'construction_organization_product_outcome:hospital',
        useCase: 'newProjectPlanning',
        evidenceAction: 'collect_runtime_ready_use_case_option_evidence_for_business_type',
        businessType: 'hospital',
        requestedByUserId: null,
      }),
    }))
  })

  it('delegates construction organization runtime consumer observation only to the runtime consumer observation facade', async () => {
    const recordConstructionOrganizationPlanNetworkRuntimeConsumerObservation = vi.fn(
      async (): Promise<DurationRuntimeConsumerFacadeArtifactsResult> => ({
        status: 'runtime_consumer_observations_recorded',
        recordedCount: 1,
        blockedCount: 0,
        results: [{
          status: 'runtime_consumer_observation_recorded',
          canPersist: true,
          observation: {
            assetKey: 'construction_organization_plan_network',
            publicationKey: 'construction-org-plan-network-release-record:v1',
            consumerKey: 'scheduleAccelerationRuntimeService',
            consumerSurface: 'schedule_acceleration_runtime',
            observationStatus: 'observed',
            observationContext: {
              businessType: 'hospital',
            },
            sourceEvidenceRefs: ['duration_plan_network_outcomes:construction-org-plan-network-release-record:v1'],
            writesRuntimeDirectly: false,
            writesFactDirectly: false,
            observedAt: '2026-06-22T05:30:00.000Z',
          },
          writesRuntimeDirectly: false,
          writesFactDirectly: false,
          reasons: [],
        }],
        runtimeCallResult: {
          status: 'runtime_consumer_runtime_call_recorded',
          canPersist: true,
          runtimeCall: {
            consumerKey: 'scheduleAccelerationRuntimeService',
            runtimeEntryRef: 'scheduleAccelerationRuntimeService:recordScheduleAccelerationRecommendationAdoption',
            callStatus: 'called',
            callContext: {
              businessType: 'hospital',
            },
            sourceEvidenceRefs: ['duration_plan_network_outcomes:construction-org-plan-network-release-record:v1'],
            writesRuntimeDirectly: false,
            writesFactDirectly: false,
            calledAt: '2026-06-22T05:30:00.000Z',
          },
          writesRuntimeDirectly: false,
          writesFactDirectly: false,
          reasons: [],
        },
        writesRuntimeDirectly: false,
        writesFactDirectly: false,
        reasons: [],
      }),
    )

    const result = await executeAlgorithmAssetGovernanceWorkbenchOperation({
      action: 'runtime_consumer_observation',
      assetType: 'construction_organization_plan_network',
      evidenceToken: 'construction-organization-runtime-consumer-observation-1',
      workPackageKey: 'construction_organization_product_outcome:hospital',
      useCase: 'accelerationRecovery',
      evidenceAction: 'record_runtime_consumer_observation_for_business_type',
      sourcePublicationKey: 'construction-org-plan-network-release-record:v1',
      releaseRecordTarget: 'duration_plan_network_outcomes:construction-org-plan-network-release-record:v1',
      domainWriterKey: 'durationRuntimeConsumerObservationAdapterService.recordScheduleAccelerationRuntimeConsumedArtifacts',
      companyId: 'company-1',
      projectId: 'project-1',
      businessType: 'hospital',
      requestedByUserId: 'user-1',
      executedAt: '2026-06-22T05:30:00.000Z',
      consumerVerificationRefs: ['duration_plan_network_outcomes:construction-org-plan-network-release-record:v1'],
      dependencies: {
        recordConstructionOrganizationPlanNetworkRuntimeConsumerObservation,
      },
    })

    expect(result).toEqual(expect.objectContaining({
      status: 'operation_delegated',
      operationAction: 'runtime_consumer_observation',
      assetType: 'construction_organization_plan_network',
      writesRuntimeDirectly: false,
      workbenchDoesNotGrantPublishRights: true,
      delegatedToDomainWriter: true,
      domainWriterKey: 'durationRuntimeConsumerObservationAdapterService.recordScheduleAccelerationRuntimeConsumedArtifacts',
    }))
    expect(result.domainResult).toEqual(expect.objectContaining({
      status: 'runtime_consumer_observations_recorded',
      recordedCount: 1,
      runtimeCallResult: expect.objectContaining({
        status: 'runtime_consumer_runtime_call_recorded',
      }),
      writesRuntimeDirectly: false,
      writesFactDirectly: false,
    }))
    expect(recordConstructionOrganizationPlanNetworkRuntimeConsumerObservation).toHaveBeenCalledWith(expect.objectContaining({
      observedAt: '2026-06-22T05:30:00.000Z',
      calledAt: '2026-06-22T05:30:00.000Z',
      runtimeEntryRef: 'scheduleAccelerationRuntimeService:recordScheduleAccelerationRecommendationAdoption',
      sourceEvidenceRefs: expect.arrayContaining([
        'duration_plan_network_outcomes:construction-org-plan-network-release-record:v1',
        'construction-organization-runtime-consumer-observation-1',
      ]),
      callContext: expect.objectContaining({
        projectId: 'project-1',
        businessType: 'hospital',
        evidenceAction: 'record_runtime_consumer_observation_for_business_type',
      }),
      artifacts: [expect.objectContaining({
        assetKey: 'construction_organization_plan_network',
        publicationKey: 'construction-org-plan-network-release-record:v1',
        publicationStatus: 'runtime_published',
        observationContext: expect.objectContaining({
          projectId: 'project-1',
          businessType: 'hospital',
          workPackageKey: 'construction_organization_product_outcome:hospital',
          useCase: 'accelerationRecovery',
          evidenceAction: 'record_runtime_consumer_observation_for_business_type',
        }),
      })],
    }))
  })

  it('blocks recommendation adoption when the evidence action is a closeout projection gap', async () => {
    const recordConstructionOrganizationPlanNetworkRecommendationDecision = vi.fn(
      async (): Promise<RecordConstructionOrganizationPlanNetworkRecommendationDecisionResult> => ({
        source: 'construction_organization_plan_network_runtime_evidence_service',
        status: 'recommendation_decision_recorded',
        recommendationKind: 'construction_organization_plan_network',
        recommendationKey: 'construction_organization_plan_network:option-ready',
        actionType: 'adopted',
        decisionPersisted: true,
        writesTaskDependencies: false,
        writesPlanDates: false,
        writesSeed: false,
        writesBaseline: false,
        writesCriticalPathFacts: false,
        writesAccelerationDraft: false,
        reasons: [],
        boundaryPolicy: ['does_not_write_task_dependencies_or_plan_dates'],
      }),
    )

    const result = await executeAlgorithmAssetGovernanceWorkbenchOperation({
      action: 'runtime_recommendation_adopt',
      assetType: 'construction_organization_plan_network',
      evidenceToken: 'construction-organization-recommendation-decision-1',
      workPackageKey: 'construction_organization_product_outcome:hospital',
      useCase: 'startingLineOnboarding',
      evidenceAction: 'collect_runtime_ready_use_case_option_closeout_claim_evidence_for_business_type',
      sourcePublicationKey: 'construction-org-plan-network-release-record:v1',
      releaseRecordTarget: 'option-ready',
      rollbackTarget: 'draft-ready',
      domainWriterKey: 'constructionOrganizationPlanNetworkRuntimeEvidenceService.recordRecommendationDecision',
      companyId: 'company-1',
      projectId: 'project-1',
      businessType: 'hospital',
      requestedByUserId: 'user-1',
      executedAt: '2026-06-22T06:00:00.000Z',
      dependencies: {
        recordConstructionOrganizationPlanNetworkRecommendationDecision,
      },
    })

    expect(result).toEqual(expect.objectContaining({
      status: 'operation_blocked',
      operationAction: 'runtime_recommendation_adopt',
      assetType: 'construction_organization_plan_network',
      writesRuntimeDirectly: false,
      workbenchDoesNotGrantPublishRights: true,
      delegatedToDomainWriter: false,
      domainWriterKey: 'constructionOrganizationPlanNetworkRuntimeEvidenceService.recordRecommendationDecision',
      reasons: expect.arrayContaining(['recommendation_decision_evidence_action_must_be_site_adoption']),
    }))
    expect(result.domainResult).toBeNull()
    expect(recordConstructionOrganizationPlanNetworkRecommendationDecision).not.toHaveBeenCalled()
  })

  it('blocks construction organization site adoption when no draft or option identity is supplied', async () => {
    const recordConstructionOrganizationPlanNetworkRecommendationDecision = vi.fn(
      async (): Promise<RecordConstructionOrganizationPlanNetworkRecommendationDecisionResult> => ({
        source: 'construction_organization_plan_network_runtime_evidence_service',
        status: 'recommendation_decision_recorded',
        recommendationKind: 'construction_organization_plan_network',
        recommendationKey: 'construction_organization_plan_network:publication-only',
        actionType: 'adopted',
        decisionPersisted: true,
        writesTaskDependencies: false,
        writesPlanDates: false,
        writesSeed: false,
        writesBaseline: false,
        writesCriticalPathFacts: false,
        writesAccelerationDraft: false,
        reasons: [],
        boundaryPolicy: ['does_not_write_task_dependencies_or_plan_dates'],
      }),
    )

    const result = await executeAlgorithmAssetGovernanceWorkbenchOperation({
      action: 'runtime_recommendation_adopt',
      assetType: 'construction_organization_plan_network',
      evidenceToken: 'construction-organization-recommendation-decision-publication-only',
      workPackageKey: 'construction_organization_product_outcome:hospital',
      useCase: 'startingLineOnboarding',
      evidenceAction: 'record_site_adoption_for_business_type',
      sourcePublicationKey: 'construction-org-plan-network-release-record:v1',
      domainWriterKey: 'constructionOrganizationPlanNetworkRuntimeEvidenceService.recordRecommendationDecision',
      companyId: 'company-1',
      projectId: 'project-1',
      businessType: 'hospital',
      requestedByUserId: 'user-1',
      executedAt: '2026-06-22T06:00:00.000Z',
      dependencies: {
        recordConstructionOrganizationPlanNetworkRecommendationDecision,
      },
    })

    expect(result).toEqual(expect.objectContaining({
      status: 'operation_blocked',
      operationAction: 'runtime_recommendation_adopt',
      assetType: 'construction_organization_plan_network',
      delegatedToDomainWriter: false,
      reasons: expect.arrayContaining(['recommendation_option_identity_required']),
    }))
    expect(result.domainResult).toBeNull()
    expect(recordConstructionOrganizationPlanNetworkRecommendationDecision).not.toHaveBeenCalled()
  })

  it.each([
    {
      action: 'runtime_engine_evidence' as const,
      domainWriterKey: 'constructionOrganizationPlanNetworkRuntimeEvidenceService.recordRuntimeEngineEvidence',
      evidenceAction: 'collect_runtime_ready_option_closeout_claim_evidence_for_business_type',
    },
    {
      action: 'runtime_saved_outcome' as const,
      domainWriterKey: 'constructionOrganizationPlanNetworkRuntimeEvidenceService.recordSavedOutcome',
      evidenceAction: 'collect_runtime_closeout_claim_for_business_type',
    },
    {
      action: 'runtime_impact_monitoring' as const,
      domainWriterKey: 'constructionOrganizationPlanNetworkRuntimeEvidenceService.recordRuntimeEvent',
      evidenceAction: 'resolve_runtime_business_type_attribution_for_business_type',
    },
    {
      action: 'runtime_rollback_execution' as const,
      domainWriterKey: 'constructionOrganizationPlanNetworkRuntimeEvidenceService.recordRuntimeEvent',
      evidenceAction: 'resolve_runtime_business_type_conflict_for_business_type',
    },
  ])('blocks construction organization $action when the evidence action is projection-only', async ({
    action,
    domainWriterKey,
    evidenceAction,
  }) => {
    const recordConstructionOrganizationPlanNetworkRuntimeEvent = vi.fn(async () =>
      constructionOrganizationPlanNetworkRuntimeEventResult('impact_monitoring', 'monitoring_passed'))
    const recordConstructionOrganizationPlanNetworkSavedOutcome = vi.fn()
    const recordConstructionOrganizationPlanNetworkRuntimeEngineEvidence = vi.fn()

    const result = await executeAlgorithmAssetGovernanceWorkbenchOperation({
      action,
      assetType: 'construction_organization_plan_network',
      evidenceToken: `construction-organization-${action}-projection-gap`,
      workPackageKey: 'construction_organization_product_outcome:hospital',
      useCase: 'newProjectPlanning',
      evidenceAction,
      sourcePublicationKey: 'construction-org-plan-network-release-record:v1',
      releaseRecordTarget: 'option-ready',
      rollbackTarget: 'draft-ready',
      rollbackReason: 'projection_gap_must_not_be_runtime_evidence',
      engineCode: 'critical_path_cpm',
      predictedDurationDays: 180,
      actualDurationDays: 184,
      domainWriterKey,
      companyId: 'company-1',
      projectId: 'project-1',
      businessType: 'hospital',
      executedAt: '2026-06-22T06:30:00.000Z',
      dependencies: {
        recordConstructionOrganizationPlanNetworkRuntimeEvent,
        recordConstructionOrganizationPlanNetworkSavedOutcome,
        recordConstructionOrganizationPlanNetworkRuntimeEngineEvidence,
      },
    })

    expect(result).toEqual(expect.objectContaining({
      status: 'operation_blocked',
      operationAction: action,
      assetType: 'construction_organization_plan_network',
      writesRuntimeDirectly: false,
      workbenchDoesNotGrantPublishRights: true,
      delegatedToDomainWriter: false,
      domainWriterKey,
      reasons: expect.arrayContaining(['product_outcome_projection_evidence_action_must_not_write_runtime_evidence']),
    }))
    expect(recordConstructionOrganizationPlanNetworkRuntimeEvent).not.toHaveBeenCalled()
    expect(recordConstructionOrganizationPlanNetworkSavedOutcome).not.toHaveBeenCalled()
    expect(recordConstructionOrganizationPlanNetworkRuntimeEngineEvidence).not.toHaveBeenCalled()
  })

  it('delegates construction organization recommendation adoption decisions only to the runtime evidence service', async () => {
    const recordConstructionOrganizationPlanNetworkRecommendationDecision = vi.fn(
      async (): Promise<RecordConstructionOrganizationPlanNetworkRecommendationDecisionResult> => ({
        source: 'construction_organization_plan_network_runtime_evidence_service',
        status: 'recommendation_decision_recorded',
        recommendationKind: 'construction_organization_plan_network',
        recommendationKey: 'construction_organization_plan_network:option-ready',
        actionType: 'adopted',
        decisionPersisted: true,
        writesTaskDependencies: false,
        writesPlanDates: false,
        writesSeed: false,
        writesBaseline: false,
        writesCriticalPathFacts: false,
        writesAccelerationDraft: false,
        reasons: [],
        boundaryPolicy: ['does_not_write_task_dependencies_or_plan_dates'],
      }),
    )

    const result = await executeAlgorithmAssetGovernanceWorkbenchOperation({
      action: 'runtime_recommendation_adopt',
      assetType: 'construction_organization_plan_network',
      evidenceToken: 'construction-organization-recommendation-decision-1',
      workPackageKey: 'construction_organization_product_outcome:hospital',
      useCase: 'startingLineOnboarding',
      evidenceAction: 'record_site_adoption_for_business_type',
      sourcePublicationKey: 'construction-org-plan-network-release-record:v1',
      releaseRecordTarget: 'option-ready',
      rollbackTarget: 'draft-ready',
      domainWriterKey: 'constructionOrganizationPlanNetworkRuntimeEvidenceService.recordRecommendationDecision',
      companyId: 'company-1',
      projectId: 'project-1',
      businessType: 'hospital',
      requestedByUserId: 'user-1',
      executedAt: '2026-06-22T06:00:00.000Z',
      dependencies: {
        recordConstructionOrganizationPlanNetworkRecommendationDecision,
      },
    })

    expect(result).toEqual(expect.objectContaining({
      status: 'operation_delegated',
      operationAction: 'runtime_recommendation_adopt',
      assetType: 'construction_organization_plan_network',
      writesRuntimeDirectly: false,
      workbenchDoesNotGrantPublishRights: true,
      delegatedToDomainWriter: true,
      domainWriterKey: 'constructionOrganizationPlanNetworkRuntimeEvidenceService.recordRecommendationDecision',
    }))
    expect(result.domainResult).toEqual(expect.objectContaining({
      status: 'recommendation_decision_recorded',
      recommendationKind: 'construction_organization_plan_network',
      actionType: 'adopted',
      writesTaskDependencies: false,
      writesPlanDates: false,
      writesSeed: false,
      writesBaseline: false,
      writesCriticalPathFacts: false,
      writesAccelerationDraft: false,
    }))
    expect(recordConstructionOrganizationPlanNetworkRecommendationDecision).toHaveBeenCalledWith(expect.objectContaining({
      actionType: 'adopted',
      optionId: 'option-ready',
      draftNetworkKey: 'draft-ready',
      publicationKey: 'construction-org-plan-network-release-record:v1',
      companyId: 'company-1',
      projectId: 'project-1',
      decidedBy: 'user-1',
      decidedAt: '2026-06-22T06:00:00.000Z',
      decisionContext: expect.objectContaining({
        evidenceToken: 'construction-organization-recommendation-decision-1',
        workPackageKey: 'construction_organization_product_outcome:hospital',
        useCase: 'startingLineOnboarding',
        evidenceAction: 'record_site_adoption_for_business_type',
        businessType: 'hospital',
        sourcePublicationKey: 'construction-org-plan-network-release-record:v1',
        releaseRecordTarget: 'option-ready',
        rollbackTarget: 'draft-ready',
      }),
    }))
  })

  it('delegates construction organization recommendation decline decisions without runtime apply', async () => {
    const recordConstructionOrganizationPlanNetworkRecommendationDecision = vi.fn(
      async (): Promise<RecordConstructionOrganizationPlanNetworkRecommendationDecisionResult> => ({
        source: 'construction_organization_plan_network_runtime_evidence_service',
        status: 'recommendation_decision_recorded',
        recommendationKind: 'construction_organization_plan_network',
        recommendationKey: 'construction_organization_plan_network:option-ready',
        actionType: 'declined',
        decisionPersisted: true,
        writesTaskDependencies: false,
        writesPlanDates: false,
        writesSeed: false,
        writesBaseline: false,
        writesCriticalPathFacts: false,
        writesAccelerationDraft: false,
        reasons: [],
        boundaryPolicy: ['does_not_write_task_dependencies_or_plan_dates'],
      }),
    )

    const result = await executeAlgorithmAssetGovernanceWorkbenchOperation({
      action: 'runtime_recommendation_decline',
      assetType: 'construction_organization_plan_network',
      evidenceToken: 'construction-organization-recommendation-decision-2',
      sourcePublicationKey: 'construction-org-plan-network-release-record:v1',
      releaseRecordTarget: 'option-ready',
      rollbackTarget: 'draft-ready',
      domainWriterKey: 'constructionOrganizationPlanNetworkRuntimeEvidenceService.recordRecommendationDecision',
      companyId: 'company-1',
      projectId: 'project-1',
      businessType: 'hospital',
      requestedByUserId: 'user-1',
      executedAt: '2026-06-22T06:30:00.000Z',
      dependencies: {
        recordConstructionOrganizationPlanNetworkRecommendationDecision,
      },
    })

    expect(result).toEqual(expect.objectContaining({
      status: 'operation_delegated',
      operationAction: 'runtime_recommendation_decline',
      assetType: 'construction_organization_plan_network',
      writesRuntimeDirectly: false,
      workbenchDoesNotGrantPublishRights: true,
      delegatedToDomainWriter: true,
      domainWriterKey: 'constructionOrganizationPlanNetworkRuntimeEvidenceService.recordRecommendationDecision',
    }))
    expect(result.domainResult).toEqual(expect.objectContaining({
      status: 'recommendation_decision_recorded',
      actionType: 'declined',
      writesTaskDependencies: false,
      writesPlanDates: false,
      writesCriticalPathFacts: false,
      writesAccelerationDraft: false,
    }))
    expect(recordConstructionOrganizationPlanNetworkRecommendationDecision).toHaveBeenCalledWith(expect.objectContaining({
      actionType: 'declined',
      optionId: 'option-ready',
      draftNetworkKey: 'draft-ready',
      publicationKey: 'construction-org-plan-network-release-record:v1',
      projectId: 'project-1',
      decidedBy: 'user-1',
      decidedAt: '2026-06-22T06:30:00.000Z',
    }))
  })

  it('prefers explicit construction organization recommendation identity over legacy target fields', async () => {
    const recordConstructionOrganizationPlanNetworkRecommendationDecision = vi.fn(
      async (): Promise<RecordConstructionOrganizationPlanNetworkRecommendationDecisionResult> => ({
        source: 'construction_organization_plan_network_runtime_evidence_service',
        status: 'recommendation_decision_recorded',
        recommendationKind: 'construction_organization_plan_network',
        recommendationKey: 'construction_organization_plan_network:option-explicit',
        actionType: 'adopted',
        decisionPersisted: true,
        writesTaskDependencies: false,
        writesPlanDates: false,
        writesSeed: false,
        writesBaseline: false,
        writesCriticalPathFacts: false,
        writesAccelerationDraft: false,
        reasons: [],
        boundaryPolicy: ['does_not_write_task_dependencies_or_plan_dates'],
      }),
    )

    await executeAlgorithmAssetGovernanceWorkbenchOperation({
      action: 'runtime_recommendation_adopt',
      assetType: 'construction_organization_plan_network',
      evidenceToken: 'construction-organization-recommendation-decision-explicit',
      sourcePublicationKey: 'construction-org-plan-network-release-record:v1',
      optionId: 'option-explicit',
      draftNetworkKey: 'draft-explicit',
      releaseRecordTarget: 'legacy-option-target',
      rollbackTarget: 'legacy-draft-target',
      domainWriterKey: 'constructionOrganizationPlanNetworkRuntimeEvidenceService.recordRecommendationDecision',
      companyId: 'company-1',
      projectId: 'project-1',
      businessType: 'hospital',
      dependencies: {
        recordConstructionOrganizationPlanNetworkRecommendationDecision,
      },
    })

    expect(recordConstructionOrganizationPlanNetworkRecommendationDecision).toHaveBeenCalledWith(expect.objectContaining({
      optionId: 'option-explicit',
      draftNetworkKey: 'draft-explicit',
      publicationKey: 'construction-org-plan-network-release-record:v1',
      decisionContext: expect.objectContaining({
        optionId: 'option-explicit',
        draftNetworkKey: 'draft-explicit',
        releaseRecordTarget: 'legacy-option-target',
        rollbackTarget: 'legacy-draft-target',
      }),
    }))
  })

  it('delegates approved standard duration candidates to the registered seed override writer', async () => {
    const publishAlgorithmSeedOverride = vi.fn(async () => ({
      status: 'algorithm_seed_override_published' as const,
      seedType: 'standard_work_duration' as const,
      stableCode: 'process_duration:02-01-03-P07',
      scopeType: 'project' as const,
      projectId: 'project-1',
      companyId: 'company-1',
      sourceCandidateId: 'candidate-1',
      overrideId: 'override-1',
      writesSeedOverrideRuntime: true,
      writesSystemSeedRuntimeDirectly: false as const,
      writesTasksOrBaselinesDirectly: false as const,
      reasons: [],
    }))

    const result = await executeAlgorithmAssetGovernanceWorkbenchOperation({
      action: 'runtime_apply',
      assetType: 'algorithm_seed',
      evidenceToken: 'standard-duration-release-token-1',
      sourcePublicationKey: 'algorithm_seed_upgrade_candidates:11111111-1111-4111-8111-111111111111',
      releaseRecordTarget: 'algorithm_seed_overrides:release-record-1',
      rollbackTarget: 'algorithm_seed_versions:previous-version-1',
      consumerVerificationRefs: ['wizard-preview-and-commit:verified'],
      impactMonitoringRefs: ['duration-accuracy-monitoring:armed'],
      rollbackWriterRefs: ['algorithmSeedLearningService.rollbackAlgorithmSeedOverrideRuntimePublication'],
      domainWriterKey: 'algorithmSeedOverrideReleaseExecutionService.publishApprovedAlgorithmSeedOverride',
      companyId: 'company-1',
      projectId: 'project-1',
      requestedByUserId: 'user-1',
      dependencies: {
        publishAlgorithmSeedOverride,
      },
    })

    expect(result).toEqual(expect.objectContaining({
      status: 'operation_delegated',
      operationAction: 'runtime_apply',
      assetType: 'algorithm_seed',
      writesRuntimeDirectly: false,
      workbenchDoesNotGrantPublishRights: true,
      delegatedToDomainWriter: true,
      domainWriterKey: 'algorithmSeedOverrideReleaseExecutionService.publishApprovedAlgorithmSeedOverride',
      domainResult: expect.objectContaining({
        status: 'algorithm_seed_override_published',
        writesSeedOverrideRuntime: true,
        writesSystemSeedRuntimeDirectly: false,
      }),
    }))
    expect(publishAlgorithmSeedOverride).toHaveBeenCalledWith(expect.objectContaining({
      sourcePublicationKey: 'algorithm_seed_upgrade_candidates:11111111-1111-4111-8111-111111111111',
      companyId: 'company-1',
      projectId: 'project-1',
      publishedBy: 'user-1',
      evidenceToken: 'standard-duration-release-token-1',
      releaseRecordTarget: 'algorithm_seed_overrides:release-record-1',
      rollbackTarget: 'algorithm_seed_versions:previous-version-1',
    }))
  })

  it('blocks seed override runtime apply without the exact writer and release evidence', async () => {
    const publishAlgorithmSeedOverride = vi.fn()

    const result = await executeAlgorithmAssetGovernanceWorkbenchOperation({
      action: 'runtime_apply',
      assetType: 'algorithm_seed',
      evidenceToken: 'standard-duration-release-token-2',
      sourcePublicationKey: 'algorithm_seed_upgrade_candidates:11111111-1111-4111-8111-111111111111',
      domainWriterKey: 'unregisteredSeedWriter',
      companyId: 'company-1',
      projectId: 'project-1',
      requestedByUserId: 'user-1',
      dependencies: {
        publishAlgorithmSeedOverride,
      },
    })

    expect(result.status).toBe('operation_blocked')
    expect(result.reasons).toEqual(expect.arrayContaining([
      'domain_writer_not_registered_for_asset_type',
      'release_record_target_required',
      'consumer_verification_required',
      'impact_monitoring_required',
      'rollback_writer_required',
      'rollback_target_required',
    ]))
    expect(publishAlgorithmSeedOverride).not.toHaveBeenCalled()
  })

  it('delegates duration asset review decisions exactly once with server authority and no direct runtime write', async () => {
    const decideDurationAssetReviewItem = vi.fn(async (): Promise<any> => ({
      status: 'rejected',
      reviewItemId: 'review-1',
      publicationKey: null,
      idempotent: false,
    }))
    const queryExec = vi.fn(async () => [])

    const result = await executeAlgorithmAssetGovernanceWorkbenchOperation({
      action: 'duration_asset_review_decision',
      assetType: 'duration_learning_runtime',
      evidenceToken: 'duration-review-decision-1',
      domainWriterKey: 'duration_asset_review_decision_service',
      reviewItemId: 'review-1',
      reviewDecision: 'reject',
      decisionNotes: 'evidence conflict remains unresolved',
      companyId: 'company-1',
      requestedByUserId: 'user-1',
      authorizedProjectIds: ['project-1'],
      authority: {
        kind: 'operator',
        companyId: 'company-attacker',
        authorizedProjectIds: ['project-attacker'],
        reviewerUserId: 'operator-attacker',
      },
      visibleProjectIds: ['project-attacker'],
      queryExec,
      dependencies: {
        decideDurationAssetReviewItem,
      },
    } as any)

    expect(decideDurationAssetReviewItem).toHaveBeenCalledTimes(1)
    expect(decideDurationAssetReviewItem).toHaveBeenCalledWith({
      reviewItemId: 'review-1',
      decision: 'reject',
      decisionReason: 'evidence conflict remains unresolved',
      authority: {
        kind: 'company_admin',
        companyId: 'company-1',
        authorizedProjectIds: ['project-1'],
        reviewerUserId: 'user-1',
      },
      queryExec,
      observedAt: undefined,
    })
    expect(result).toEqual(expect.objectContaining({
      status: 'operation_delegated',
      operationAction: 'duration_asset_review_decision',
      assetType: 'duration_learning_runtime',
      writesRuntimeDirectly: false,
      workbenchDoesNotGrantPublishRights: true,
      delegatedToDomainWriter: true,
      domainWriterKey: 'duration_asset_review_decision_service',
      domainResult: expect.objectContaining({ status: 'rejected' }),
    }))
  })

  it('blocks duration review decisions without the exact writer and governed decision fields', async () => {
    const decideDurationAssetReviewItem = vi.fn()

    const result = await executeAlgorithmAssetGovernanceWorkbenchOperation({
      action: 'duration_asset_review_decision',
      assetType: 'duration_learning_runtime',
      evidenceToken: 'duration-review-decision-2',
      domainWriterKey: 'operator_duration_review_writer',
      reviewDecision: 'approve',
      companyId: 'company-1',
      requestedByUserId: 'user-1',
      authorizedProjectIds: ['project-1'],
      dependencies: {
        decideDurationAssetReviewItem,
      },
    })

    expect(result).toEqual(expect.objectContaining({
      status: 'operation_blocked',
      writesRuntimeDirectly: false,
      workbenchDoesNotGrantPublishRights: true,
      delegatedToDomainWriter: false,
      reasons: expect.arrayContaining([
        'domain_writer_not_registered_for_asset_type',
        'review_item_id_required',
        'decision_notes_required',
      ]),
    }))
    expect(decideDurationAssetReviewItem).not.toHaveBeenCalled()
  })
})
