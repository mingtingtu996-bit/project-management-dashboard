import { createHash } from 'node:crypto'
import { query as rawQuery } from '../database.js'
import {
  createAndPersistAlgorithmAssetCandidateEvent,
  type CreateAndPersistAlgorithmAssetCandidateEventResult,
} from './algorithmAssetCandidateEventAdapterService.js'
import type {
  AlgorithmAssetGovernanceQueryExec,
} from './algorithmAssetGovernancePersistenceService.js'
import {
  listConstructionOrganizationMaterializationReviewPackages,
  type ConstructionOrganizationMaterializationReviewPackageItem,
  type ListConstructionOrganizationMaterializationReviewPackagesInput,
} from './constructionOrganizationMaterializationReviewPackageService.js'
import type { TaskBaseline, TaskBaselineItem } from '../types/db.js'

export type ConstructionOrganizationPlanNetworkDraftReadiness =
  | 'ready_for_replay'
  | 'conflict_review_required'
  | 'evidence_only'
  | 'blocked'

const CONSTRUCTION_ORGANIZATION_CONFLICT_REVIEW_HANDOFF_REASONS = new Set([
  'all_virtual_dependency_edges_have_generated_row_carriers',
  'candidate_preview_edges_violate_generated_row_dates',
  'candidate_network_conflicts_with_current_generated_row_dates',
  'requires_manual_conflict_review_before_replay',
])

export function isConstructionOrganizationConflictReviewHandoffReason(reason: string) {
  return CONSTRUCTION_ORGANIZATION_CONFLICT_REVIEW_HANDOFF_REASONS.has(reason)
}

export function canSubmitConstructionOrganizationPlanNetworkManualReviewHandoff(
  draft: {
    readiness?: ConstructionOrganizationPlanNetworkDraftReadiness | string | null
    blockedReasons?: string[] | null
  } | null | undefined,
) {
  if (!draft) return false
  if (draft.readiness === 'ready_for_replay') return true
  if (draft.readiness !== 'conflict_review_required') return false
  const blockedReasons = Array.isArray(draft.blockedReasons) ? draft.blockedReasons : []
  return blockedReasons.every((reason) => isConstructionOrganizationConflictReviewHandoffReason(reason))
}

export type ConstructionOrganizationPlanNetworkDraftEdge = {
  edgeId: string
  fromGeneratedRowId: string
  toGeneratedRowId: string
  dependencyType: 'FS' | 'SS' | 'FF' | 'SF'
  lagDays: number
  intent: string | null
  fromVirtualNodeId: string | null
  toVirtualNodeId: string | null
  operation: 'propose_create_dependency'
  writesTaskDependencies: false
}

export type ConstructionOrganizationPlanNetworkManualConflictEvidence = {
  edgeId: string
  fromGeneratedRowId: string
  toGeneratedRowId: string
  dependencyType: ConstructionOrganizationPlanNetworkDraftEdge['dependencyType']
  lagDays: number
  intent: string | null
  fromVirtualNodeId: string | null
  toVirtualNodeId: string | null
  reason: string
  fromWindow: {
    startDay: number | null
    finishDay: number | null
    plannedStartDate: string | null
    plannedEndDate: string | null
  }
  toWindow: {
    startDay: number | null
    finishDay: number | null
    plannedStartDate: string | null
    plannedEndDate: string | null
  }
  writesTaskDependencies: false
  writesPlanDates: false
}

export type ConstructionOrganizationPlanNetworkManualConflictReviewPackage = {
  source: 'construction_organization_plan_network_manual_conflict_review_package'
  status: 'manual_conflict_review_required' | 'not_required'
  reviewPrompt: string | null
  reviewChecklist: string[]
  conflictReasonCodes: string[]
  proposedDependencyEdgeCount: number
  sampleProposedDependencyEdges: ConstructionOrganizationPlanNetworkDraftEdge[]
  conflictEvidenceCount: number
  sampleConflictEvidence: ConstructionOrganizationPlanNetworkManualConflictEvidence[]
  allowedDecisions: Array<'approved_ready_for_replay' | 'rejected_needs_plan_date_adjustment'>
  recommendedNextAction: 'complete_manual_conflict_review_before_manual_review_approval' | 'continue_standard_governance_flow'
  writesTaskDependencies: false
  writesPlanDates: false
  writesSeed: false
  writesBaseline: false
  writesCriticalPathFacts: false
  writesAccelerationDraft: false
  boundaryPolicy: string[]
}

export type ConstructionOrganizationPlanNetworkDraftNode = {
  generatedRowId: string
  virtualNodeIds: string[]
  roles: Array<'from' | 'to'>
}

export type ConstructionOrganizationPlanNetworkDraftEvaluationEvidence = {
  source: 'construction_organization_plan_network_draft_evaluation_evidence'
  evaluationStatus: 'evaluation_ready' | 'partial_evidence' | 'missing_evaluation_evidence'
  e1: {
    sourceEvidence: 'generated_row_reference_duration_evidence'
    matchedReferenceRowCount: number
    totalPlanReferenceDays: number | null
    totalContextualReferenceDays: number | null
    totalRecommendedDurationDays: number | null
    writesReferenceDuration: false
    writesPlanDates: false
    writesSeed: false
  } | null
  e3: {
    sourceEvidence: 'generated_row_network_evaluation'
    projectedNetworkSpanDays: number | null
    previewEdgeCount: number
    unresolvedEdgeCount: number
    criticalGeneratedRowIds: string[]
    materializationStatus: string | null
    writesTaskDependencies: false
    writesPlanDates: false
    writesCriticalPathFacts: false
  } | null
  e5: {
    sourceEvidence: 'acceleration_recovery_use_case_evaluation'
    optionScore: number | null
    recoveryFactorHint: number | null
    e5RecoverableSpanDays: number | null
    actionability: string | null
    writesTaskDependencies: false
    writesPlanDates: false
    writesSeed: false
    writesAccelerationDraft: false
  } | null
  engineEvaluationSummary: Record<string, unknown> | null
  evidenceGaps: string[]
  boundaryPolicy: string[]
}

export type ConstructionOrganizationPlanNetworkDraftUseCaseEvidence = {
  source: 'construction_organization_plan_network_draft_use_case_evaluation'
  useCase: string | null
  optionScore: number | null
  actionability: string | null
  rankBasis: string[]
  recoveryFactorHint: number | null
  e5RecoverableSpanDays: number | null
  writesTaskDependencies: false
  writesPlanDates: false
  writesSeed: false
} | null

export type ConstructionOrganizationPlanNetworkManualReviewHandoffProjection = {
  source: 'construction_organization_plan_network_manual_review_handoff_projection'
  candidateEventId: string | null
  assetKey: string
  sourceModule: string
  eventStatus: string
  runtimeEffect: string
  createdAt: string | null
  updatedAt: string | null
  draftNetworkKey: string
  originalCandidateEventId: string | null
  optionId: string | null
  selectedScenarioIds: string[]
  requestedByUserId: string | null
  executedAt: string | null
  reviewOperation: 'manual_review_dependency_proposal'
  proposedDependencyEdgeCount: number
  writesTaskDependencies: false
  writesPlanDates: false
  writesSeed: false
  writesBaseline: false
  writesCriticalPathFacts: false
  writesAccelerationDraft: false
}

export type ConstructionOrganizationPlanNetworkManualReviewApprovalProjection = {
  source: 'construction_organization_plan_network_manual_review_approval_projection'
  candidateEventId: string | null
  assetKey: string
  sourceModule: string
  eventStatus: string
  runtimeEffect: string
  createdAt: string | null
  updatedAt: string | null
  draftNetworkKey: string
  handoffCandidateEventId: string | null
  approvedByUserId: string | null
  approvedAt: string | null
  approvalDecision: 'approved_for_release_exit_preparation'
  writesTaskDependencies: false
  writesPlanDates: false
  writesSeed: false
  writesBaseline: false
  writesCriticalPathFacts: false
  writesAccelerationDraft: false
}

export type ConstructionOrganizationPlanNetworkManualConflictReviewProjection = {
  source: 'construction_organization_plan_network_manual_conflict_review_projection'
  candidateEventId: string | null
  assetKey: string
  sourceModule: string
  eventStatus: string
  runtimeEffect: string
  createdAt: string | null
  updatedAt: string | null
  draftNetworkKey: string
  handoffCandidateEventId: string | null
  decision: 'approved_ready_for_replay' | 'rejected_needs_plan_date_adjustment'
  resultingReadiness: ConstructionOrganizationPlanNetworkDraftReadiness
  reviewedByUserId: string | null
  reviewedAt: string | null
  decisionNotes: string | null
  writesTaskDependencies: false
  writesPlanDates: false
  writesSeed: false
  writesBaseline: false
  writesCriticalPathFacts: false
  writesAccelerationDraft: false
}

export type ConstructionOrganizationPlanNetworkReleaseExitHandoffProjection = {
  source: 'construction_organization_plan_network_release_exit_handoff_projection'
  candidateEventId: string | null
  assetKey: string
  sourceModule: string
  eventStatus: string
  runtimeEffect: string
  createdAt: string | null
  updatedAt: string | null
  draftNetworkKey: string
  originalCandidateEventId: string | null
  handoffCandidateEventId: string | null
  approvalCandidateEventId: string | null
  optionId: string | null
  selectedScenarioIds: string[]
  requestedByUserId: string | null
  executedAt: string | null
  releaseRecordTarget: string | null
  rollbackTarget: string | null
  consumerVerificationRefs: string[]
  impactMonitoringRefs: string[]
  rollbackWriterRefs: string[]
  proposedDependencyEdgeCount: number
  writesTaskDependencies: false
  writesPlanDates: false
  writesSeed: false
  writesBaseline: false
  writesCriticalPathFacts: false
  writesAccelerationDraft: false
}

export type ConstructionOrganizationPlanNetworkRuntimePublicationProjection = {
  source: 'construction_organization_plan_network_runtime_publication_projection'
  publicationKey: string
  projectId: string
  draftNetworkKey: string
  releaseHandoffCandidateEventId: string
  runtimePublicationStatus: 'runtime_published'
  appliedDependencyCount: number
  rollbackTarget: string | null
  publishedAt: string | null
}

export type ConstructionOrganizationPlanNetworkRuntimeConsumerObservationProjection = {
  source: 'construction_organization_plan_network_runtime_consumer_observation_projection'
  assetKey: 'construction_organization_plan_network'
  publicationKey: string
  consumerKey: string
  consumerSurface: string
  observationStatus: 'observed'
  workPackageKey: string | null
  useCase: string | null
  evidenceAction: string | null
  businessType: string | null
  projectId: string | null
  draftNetworkKey: string | null
  optionId: string | null
  observedAt: string | null
}

export type ConstructionOrganizationPlanNetworkRuntimeEventProjection = {
  source: 'construction_organization_plan_network_runtime_event_projection'
  eventType: 'impact_monitoring' | 'rollback_execution'
  eventStatus: 'monitoring_passed' | 'rollback_executed'
  sourcePublicationKey: string
  workPackageKey: string | null
  useCase: string | null
  evidenceAction: string | null
  businessType: string | null
  projectId: string | null
  draftNetworkKey: string | null
  optionId: string | null
  executedAt: string | null
}

export type ConstructionOrganizationPlanNetworkOutcomeProjection = {
  source: 'construction_organization_plan_network_outcome_projection'
  assetKey: typeof CONSTRUCTION_ORGANIZATION_PLAN_NETWORK_RUNTIME_ASSET_KEY
  publicationKey: string
  outcomeStatus: 'accepted' | 'weak'
  outcomeRef: string | null
  learningScope: string
  workPackageKey: string | null
  useCase: string | null
  evidenceAction: string | null
  businessType: string | null
  projectId: string | null
  draftNetworkKey: string | null
  optionId: string | null
  observedAt: string | null
}

export type ConstructionOrganizationPlanNetworkRuntimeEngineEvidenceProjection = {
  source: 'construction_organization_plan_network_runtime_engine_evidence_projection'
  assetKey: typeof CONSTRUCTION_ORGANIZATION_PLAN_NETWORK_RUNTIME_ASSET_KEY
  publicationKey: string
  evidenceId: string
  engineCode: typeof CONSTRUCTION_ORGANIZATION_PLAN_NETWORK_REQUIRED_ENGINE_CODES[number]
  backtestStatus: 'backtested' | 'actual_recorded_without_error'
  absoluteErrorDays: number
  workPackageKey: string | null
  useCase: string | null
  evidenceAction: string | null
  businessType: string | null
  projectId: string | null
  draftNetworkKey: string | null
  optionId: string | null
  backtestedAt: string | null
}

export type ConstructionOrganizationPlanNetworkRecommendationDecisionProjection = {
  source: 'construction_organization_plan_network_recommendation_decision_projection'
  projectId: string | null
  recommendationKind: typeof CONSTRUCTION_ORGANIZATION_PLAN_NETWORK_RUNTIME_ASSET_KEY
  recommendationKey: string
  actionType: 'adopted' | 'declined'
  optionId: string | null
  draftNetworkKey: string | null
  publicationKey: string | null
  workPackageKey: string | null
  useCase: string | null
  evidenceAction: string | null
  businessType: string | null
  selectedScenarioIds: string[]
  decidedAt: string | null
  decidedBy: string | null
  siteDecisionMatchesRuntimeRecommendation: boolean | null
  writesTaskDependencies: false
  writesPlanDates: false
  writesSeed: false
  writesBaseline: false
  writesCriticalPathFacts: false
  writesAccelerationDraft: false
  boundaryPolicy: string[]
}

export type ConstructionOrganizationPlanNetworkReleaseExitAssessment = {
  source: 'construction_organization_plan_network_release_exit_assessment'
  status: 'manual_review_handoff_required' | 'release_exit_blocked'
  canMaterializeRuntime: false
  draftNetworkKey: string
  handoffCandidateEventId: string | null
  approvalCandidateEventId: string | null
  requiredBeforeRuntime: string[]
  reasons: string[]
  writesTaskDependencies: false
  writesPlanDates: false
  writesSeed: false
  writesBaseline: false
  writesCriticalPathFacts: false
  writesAccelerationDraft: false
  boundaryPolicy: string[]
}

export type ConstructionOrganizationPlanNetworkReleaseExitPreparation = {
  source: 'construction_organization_plan_network_release_exit_preparation'
  status: 'ready_for_domain_writer_release_exit_package'
  canMaterializeRuntime: false
  draftNetworkKey: string
  candidateEventId: string | null
  handoffCandidateEventId: string
  approvalCandidateEventId: string
  optionId: string | null
  selectedScenarioIds: string[]
  domainWriterKey: 'constructionOrganizationPlanNetworkDomainWriter.applyApprovedDraft'
  proposedDependencyEdgeCount: number
  nodeCount: number
  edgeCount: number
  proposedDependencyEdges: ConstructionOrganizationPlanNetworkDraftEdge[]
  evaluationEvidence: ConstructionOrganizationPlanNetworkDraftEvaluationEvidence
  useCaseEvaluationEvidence: ConstructionOrganizationPlanNetworkDraft['useCaseEvaluationEvidence']
  requiredBeforeRuntime: string[]
  packageArtifacts: string[]
  mutationBoundary: {
    writesTaskDependencies: false
    writesPlanDates: false
    writesSeed: false
    writesBaseline: false
    writesCriticalPathFacts: false
    writesAccelerationDraft: false
  }
  boundaryPolicy: string[]
}

export type ConstructionOrganizationPlanNetworkDomainWriterReleaseExitReadiness = {
  source: 'construction_organization_plan_network_domain_writer_release_exit_readiness'
  status: 'blocked_pending_release_exit_evidence'
  canMaterializeRuntime: false
  draftNetworkKey: string
  candidateEventId: string | null
  handoffCandidateEventId: string
  approvalCandidateEventId: string
  optionId: string | null
  selectedScenarioIds: string[]
  domainWriterKey: 'constructionOrganizationPlanNetworkDomainWriter.applyApprovedDraft'
  releaseExitPreparationStatus: ConstructionOrganizationPlanNetworkReleaseExitPreparation['status']
  proposedDependencyEdgeCount: number
  nodeCount: number
  edgeCount: number
  requiredEvidenceBeforeDomainWriter: string[]
  packageArtifacts: string[]
  mutationBoundary: {
    writesTaskDependencies: false
    writesPlanDates: false
    writesSeed: false
    writesBaseline: false
    writesCriticalPathFacts: false
    writesAccelerationDraft: false
  }
  boundaryPolicy: string[]
}

export type ConstructionOrganizationPlanNetworkRuntimeMaterializationReadiness = {
  source: 'construction_organization_plan_network_runtime_materialization_readiness'
  status:
    | 'blocked_pending_release_exit_handoff'
    | 'blocked_candidate_only_after_release_exit_handoff'
    | 'runtime_materialization_evidence_ready'
  canMaterializeRuntime: false
  totalDraftCount: number
  releaseExitPreparationCount: number
  domainWriterReleaseExitReadinessCount: number
  releaseExitHandoffCandidateCount: number
  linkedReleaseExitHandoffCount: number
  domainWriterRuntimeExecutionCount: number
  readyForDomainWriterExecutionCount: number
  runtimeConsumerObservationCount: number
  readyForRuntimeConsumerObservationCount: number
  runtimeImpactMonitoringResultCount: number
  readyForRuntimeImpactMonitoringResultCount: number
  rollbackExecutionVerificationCount: number
  readyForRollbackExecutionVerificationCount: number
  savedNetworkOutcomeCount: number
  readyForSavedNetworkOutcomeCount: number
  perOptionRuntimeEngineEvidenceCount: number
  readyForPerOptionRuntimeEngineEvidenceCount: number
  missingBeforeRuntime: string[]
  mutationBoundary: {
    writesTaskDependencies: false
    writesPlanDates: false
    writesSeed: false
    writesBaseline: false
    writesCriticalPathFacts: false
    writesAccelerationDraft: false
  }
  boundaryPolicy: string[]
}

export type ConstructionOrganizationPlanNetworkRuntimeCloseoutClaim = {
  source: 'construction_organization_plan_network_runtime_closeout_claim'
  status: 'runtime_closeout_claim_ready' | 'runtime_closeout_claim_blocked'
  canClaimRuntimeCloseout: boolean
  canMaterializeRuntime: false
  totalDraftCount: number
  claimBasis: string[]
  missingBeforeClaim: string[]
  mutationBoundary: {
    writesTaskDependencies: false
    writesPlanDates: false
    writesSeed: false
    writesBaseline: false
    writesCriticalPathFacts: false
    writesAccelerationDraft: false
  }
  boundaryPolicy: string[]
}

export type ConstructionOrganizationPlanNetworkOptionRuntimeMaterializationEvidence = {
  source: 'construction_organization_plan_network_option_runtime_materialization_evidence'
  status: 'runtime_evidence_ready' | 'missing_runtime_evidence'
  publicationKey: string | null
  runtimeUseCases: ConstructionOrganizationPlanNetworkUseCaseKey[]
  runtimeUseCaseCoverage: Record<ConstructionOrganizationPlanNetworkUseCaseKey, {
    hasRuntimeConsumerObservation: boolean
    hasImpactMonitoringResult: boolean
    hasRollbackExecutionVerification: boolean
    hasSavedNetworkOutcome: boolean
    hasRuntimeEngineEvidence: boolean
    canClaimRuntimeUseCaseEvidence: boolean
  }>
  missingBeforeRuntime: string[]
  hasReleaseExitHandoff: boolean
  hasRuntimePublication: boolean
  hasRuntimeConsumerObservation: boolean
  hasImpactMonitoringResult: boolean
  hasRollbackExecutionVerification: boolean
  hasSavedNetworkOutcome: boolean
  hasRuntimeEngineEvidence: boolean
  canClaimRuntimeMaterializationEvidence: boolean
  boundaryPolicy: string[]
}

export type ConstructionOrganizationPlanNetworkDraftRecommendation = {
  useCase: ConstructionOrganizationPlanNetworkUseCaseKey
  draftNetworkKey: string
  candidateEventId: string | null
  optionId: string | null
  selectedScenarioIds: string[]
  readiness: ConstructionOrganizationPlanNetworkDraftReadiness
  evaluationStatus: ConstructionOrganizationPlanNetworkDraftEvaluationEvidence['evaluationStatus']
  optionScore: number | null
  actionability: string | null
  e5RecoverableSpanDays: number | null
  runtimeEngineEvidenceStatus: ConstructionOrganizationPlanNetworkRuntimeEngineEvidenceStatus
  presentRuntimeEngineCodes: Array<'E1' | 'E3' | 'E5'>
  missingRuntimeEngineCodes: Array<'E1' | 'E3' | 'E5'>
  canClaimTruePerOptionRuntimeEvaluation: boolean
  recommendationBasis: string[]
  writesTaskDependencies: false
  writesPlanDates: false
  writesSeed: false
  writesAccelerationDraft: false
} | null

export type ConstructionOrganizationPlanNetworkOptionComparisonScore = {
  rank: number | null
  optionScore: number | null
  actionability: string | null
  e5RecoverableSpanDays: number | null
  rankBasis: string[]
}

export type ConstructionOrganizationPlanNetworkOptionComparisonItem = {
  source: 'construction_organization_plan_network_option_comparison_item'
  draftNetworkKey: string
  candidateEventId: string | null
  optionId: string | null
  selectedScenarioIds: string[]
  isRecommendedFor: ConstructionOrganizationPlanNetworkUseCaseKey[]
  readiness: ConstructionOrganizationPlanNetworkDraftReadiness
  evaluationStatus: ConstructionOrganizationPlanNetworkDraftEvaluationEvidence['evaluationStatus']
  runtimeEngineEvidenceStatus: ConstructionOrganizationPlanNetworkRuntimeEngineEvidenceStatus
  presentRuntimeEngineCodes: Array<'E1' | 'E3' | 'E5'>
  missingRuntimeEngineCodes: Array<'E1' | 'E3' | 'E5'>
  canClaimTruePerOptionRuntimeEvaluation: boolean
  useCaseScores: Record<ConstructionOrganizationPlanNetworkUseCaseKey, ConstructionOrganizationPlanNetworkOptionComparisonScore | null>
  proposedDependencyEdgeCount: number
  nextGovernanceAction:
    | 'manual_review_handoff'
    | 'manual_review_approval'
    | 'release_exit_handoff'
    | 'runtime_engine_evidence_required'
    | 'runtime_engine_evidence_ready'
    | 'runtime_materialization_evidence_required'
    | 'blocked'
  nextGovernanceReasons: string[]
  runtimeMaterializationEvidence: ConstructionOrganizationPlanNetworkOptionRuntimeMaterializationEvidence
  recommendationDecision: ConstructionOrganizationPlanNetworkRecommendationDecisionProjection | null
  writesTaskDependencies: false
  writesPlanDates: false
  writesSeed: false
  writesAccelerationDraft: false
}

export type ConstructionOrganizationPlanNetworkOptionComparisonPackage = {
  source: 'construction_organization_plan_network_option_comparison_package'
  totalOptionCount: number
  recommendedOptionIdsByUseCase: Record<ConstructionOrganizationPlanNetworkUseCaseKey, string | null>
  canAutoMaterializeSelectedOption: false
  comparisonBasis: string[]
  options: ConstructionOrganizationPlanNetworkOptionComparisonItem[]
  boundaryPolicy: string[]
}

export type ConstructionOrganizationPlanNetworkRuntimeRecommendedOption = {
  source: 'construction_organization_plan_network_runtime_recommended_option'
  status: 'runtime_recommended_option_ready' | 'runtime_recommended_option_blocked'
  optionId: string | null
  draftNetworkKey: string | null
  publicationKey: string | null
  selectedScenarioIds: string[]
  canAutoAdoptRuntimeOption: false
  siteDecision: ConstructionOrganizationPlanNetworkRecommendationDecisionProjection | null
  siteDecisionMatchesRuntimeRecommendation: boolean | null
  siteDecisionAttributionGap: string | null
  siteDecisionBusinessTypeConflict: string | null
  siteDecisionTimingGap: string | null
  recommendationBasis: string[]
  rejectedOptionIds: string[]
  rejectedReasonsByOptionId: Record<string, string[]>
  mutationBoundary: {
    writesTaskDependencies: false
    writesPlanDates: false
    writesSeed: false
    writesBaseline: false
    writesCriticalPathFacts: false
    writesAccelerationDraft: false
  }
  boundaryPolicy: string[]
}

export type ConstructionOrganizationPlanNetworkDraft = {
    source: 'construction_organization_plan_network_draft'
    draftNetworkKey: string
    candidateEventId: string | null
    assetKey: string
    projectId?: string | null
    optionId: string | null
    businessType?: string | null
    workPackageKey?: string | null
    useCase?: string | null
    evidenceAction?: string | null
    selectedScenarioIds: string[]
  readiness: ConstructionOrganizationPlanNetworkDraftReadiness
  nodeCount: number
  edgeCount: number
  blockedReasons: string[]
  nodes: ConstructionOrganizationPlanNetworkDraftNode[]
  edges: ConstructionOrganizationPlanNetworkDraftEdge[]
  evaluationEvidence: ConstructionOrganizationPlanNetworkDraftEvaluationEvidence
  useCaseEvaluationEvidence: {
    newProjectPlanning: ConstructionOrganizationPlanNetworkDraftUseCaseEvidence
    startingLineOnboarding: ConstructionOrganizationPlanNetworkDraftUseCaseEvidence
    accelerationRecovery: ConstructionOrganizationPlanNetworkDraftUseCaseEvidence
  }
  reviewPackageStatus: string | null
  reviewRequired: boolean
  manualConflictReviewPackage: ConstructionOrganizationPlanNetworkManualConflictReviewPackage
    manualReviewHandoff: ConstructionOrganizationPlanNetworkManualReviewHandoffProjection | null
  manualConflictReviewDecision: ConstructionOrganizationPlanNetworkManualConflictReviewProjection | null
  manualReviewApproval: ConstructionOrganizationPlanNetworkManualReviewApprovalProjection | null
  releaseExitHandoff: ConstructionOrganizationPlanNetworkReleaseExitHandoffProjection | null
  releaseExitAssessment: ConstructionOrganizationPlanNetworkReleaseExitAssessment
  releaseExitPreparation: ConstructionOrganizationPlanNetworkReleaseExitPreparation | null
  domainWriterReleaseExitReadiness: ConstructionOrganizationPlanNetworkDomainWriterReleaseExitReadiness | null
    runtimeEngineEvidence: ConstructionOrganizationPlanNetworkRuntimeEngineEvidenceSummary
    recommendationDecision: ConstructionOrganizationPlanNetworkRecommendationDecisionProjection | null
    runtimeEvidenceLineage: {
      workPackageKey: string | null
      useCase: string | null
      evidenceAction: string | null
    }
    mutationBoundary: {
    writesTaskDependencies: false
    writesPlanDates: false
    writesSeed: false
    writesBaseline: false
    writesCriticalPathFacts: false
    writesAccelerationDraft: false
  }
  replayRequirements: string[]
  evaluationRequirements: string[]
  boundaryPolicy: string[]
}

export type ConstructionOrganizationPlanNetworkDraftReport = {
  source: 'construction_organization_plan_network_draft_read_model'
  companyId: string
  projectId: string | null
  totalReviewPackageItems: number
  totalDraftCount: number
  readyForReplayCount: number
  evaluationReadyCount: number
  partialEvaluationCount: number
  evidenceOnlyCount: number
  blockedCount: number
  totalEdgeCount: number
  totalManualReviewHandoffCount: number
  linkedManualReviewHandoffCount: number
  totalManualReviewApprovalCount: number
  linkedManualReviewApprovalCount: number
  totalReleaseExitHandoffCount: number
  linkedReleaseExitHandoffCount: number
  runtimeMaterializationReadiness: ConstructionOrganizationPlanNetworkRuntimeMaterializationReadiness
  runtimeCloseoutClaim: ConstructionOrganizationPlanNetworkRuntimeCloseoutClaim
  runtimeCloseoutClaimLineage: {
    workPackageKey: string | null
    useCase: string | null
    evidenceAction: string | null
  }
  runtimeCloseoutClaimsByProject: Record<string, ConstructionOrganizationPlanNetworkRuntimeCloseoutClaim>
  runtimeCloseoutClaimsByDraftNetworkKey: Record<string, ConstructionOrganizationPlanNetworkRuntimeCloseoutClaim>
  runtimeCloseoutClaimsByProjectDraftNetworkKey?: Record<string, ConstructionOrganizationPlanNetworkRuntimeCloseoutClaim>
  runtimeRecommendedOption: ConstructionOrganizationPlanNetworkRuntimeRecommendedOption
  recommendedDrafts: {
    newProjectPlanning: ConstructionOrganizationPlanNetworkDraftRecommendation
    startingLineOnboarding: ConstructionOrganizationPlanNetworkDraftRecommendation
    accelerationRecovery: ConstructionOrganizationPlanNetworkDraftRecommendation
  }
  optionComparisonPackage: ConstructionOrganizationPlanNetworkOptionComparisonPackage
  items: ConstructionOrganizationPlanNetworkDraft[]
  boundaryPolicy: string[]
}

export type ConstructionOrganizationPlanNetworkManualReviewHandoffResult = {
  source: 'construction_organization_plan_network_manual_review_handoff'
  status: 'manual_review_handoff_ready' | 'manual_review_handoff_blocked'
  draftNetworkKey: string | null
  candidateEventId: string | null
  optionId: string | null
  selectedScenarioIds: string[]
  requestedByUserId: string | null
  executedAt: string | null
  proposedDependencyEdgeCount: number
  reviewPackage: {
    source: 'construction_organization_plan_network_manual_review_handoff'
    reviewOperation: 'manual_review_dependency_proposal'
    reviewRequired: true
    proposedDependencyEdges: ConstructionOrganizationPlanNetworkDraftEdge[]
    writesTaskDependencies: false
    writesPlanDates: false
    writesCriticalPathFacts: false
  }
  reasons: string[]
  writesTaskDependencies: false
  writesPlanDates: false
  writesSeed: false
  writesBaseline: false
  writesCriticalPathFacts: false
  writesAccelerationDraft: false
  boundaryPolicy: string[]
}

export type PersistConstructionOrganizationPlanNetworkManualReviewHandoffResult =
  ConstructionOrganizationPlanNetworkManualReviewHandoffResult & {
    governanceCandidateEvent: CreateAndPersistAlgorithmAssetCandidateEventResult['event'] | null
    governancePersistence: CreateAndPersistAlgorithmAssetCandidateEventResult['persistence'] | null
  }

export type ConstructionOrganizationPlanNetworkManualConflictReviewDecisionResult = {
  source: 'construction_organization_plan_network_manual_conflict_review'
  status: 'manual_conflict_review_ready' | 'manual_conflict_review_blocked'
  draftNetworkKey: string | null
  handoffCandidateEventId: string | null
  decision: 'approved_ready_for_replay' | 'rejected_needs_plan_date_adjustment'
  resultingReadiness: ConstructionOrganizationPlanNetworkDraftReadiness
  reviewedByUserId: string | null
  reviewedAt: string | null
  decisionNotes: string | null
  reasons: string[]
  writesTaskDependencies: false
  writesPlanDates: false
  writesSeed: false
  writesBaseline: false
  writesCriticalPathFacts: false
  writesAccelerationDraft: false
  boundaryPolicy: string[]
}

export type PersistConstructionOrganizationPlanNetworkManualConflictReviewDecisionResult =
  ConstructionOrganizationPlanNetworkManualConflictReviewDecisionResult & {
    governanceCandidateEvent: CreateAndPersistAlgorithmAssetCandidateEventResult['event'] | null
    governancePersistence: CreateAndPersistAlgorithmAssetCandidateEventResult['persistence'] | null
  }

export type ConstructionOrganizationPlanNetworkManualReviewApprovalResult = {
  source: 'construction_organization_plan_network_manual_review_approval'
  status: 'manual_review_approval_ready' | 'manual_review_approval_blocked'
  draftNetworkKey: string | null
  handoffCandidateEventId: string | null
  approvedByUserId: string | null
  approvedAt: string | null
  approvalDecision: 'approved_for_release_exit_preparation'
  reasons: string[]
  writesTaskDependencies: false
  writesPlanDates: false
  writesSeed: false
  writesBaseline: false
  writesCriticalPathFacts: false
  writesAccelerationDraft: false
  boundaryPolicy: string[]
}

export type PersistConstructionOrganizationPlanNetworkManualReviewApprovalResult =
  ConstructionOrganizationPlanNetworkManualReviewApprovalResult & {
    governanceCandidateEvent: CreateAndPersistAlgorithmAssetCandidateEventResult['event'] | null
    governancePersistence: CreateAndPersistAlgorithmAssetCandidateEventResult['persistence'] | null
  }

export type ConstructionOrganizationPlanNetworkReleaseExitHandoffResult = {
  source: 'construction_organization_plan_network_release_exit_handoff'
  status: 'release_exit_handoff_ready' | 'release_exit_handoff_blocked'
  canMaterializeRuntime: false
  draftNetworkKey: string | null
  candidateEventId: string | null
  handoffCandidateEventId: string | null
  approvalCandidateEventId: string | null
  optionId: string | null
  selectedScenarioIds: string[]
  requestedByUserId: string | null
  executedAt: string | null
  releaseRecordTarget: string | null
  rollbackTarget: string | null
  consumerVerificationRefs: string[]
  impactMonitoringRefs: string[]
  rollbackWriterRefs: string[]
  proposedDependencyEdgeCount: number
  proposedDependencyEdges: ConstructionOrganizationPlanNetworkDraftEdge[]
  packageArtifacts: string[]
  reasons: string[]
  writesTaskDependencies: false
  writesPlanDates: false
  writesSeed: false
  writesBaseline: false
  writesCriticalPathFacts: false
  writesAccelerationDraft: false
  boundaryPolicy: string[]
}

export type PersistConstructionOrganizationPlanNetworkReleaseExitHandoffResult =
  ConstructionOrganizationPlanNetworkReleaseExitHandoffResult & {
    governanceCandidateEvent: CreateAndPersistAlgorithmAssetCandidateEventResult['event'] | null
    governancePersistence: CreateAndPersistAlgorithmAssetCandidateEventResult['persistence'] | null
  }

function normalizeText(value: unknown) {
  const text = String(value ?? '').trim()
  return text || null
}

function safeAssetKeySegment(value: string | null | undefined) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_.:+-]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function normalizeDependencyType(value: unknown): ConstructionOrganizationPlanNetworkDraftEdge['dependencyType'] {
  const text = String(value ?? '').trim().toUpperCase()
  if (text === 'SS' || text === 'FF' || text === 'SF') return text
  return 'FS'
}

function normalizeLagDays(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.trunc(parsed) : 0
}

function readRecord(value: unknown): Record<string, unknown> {
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      return readRecord(parsed)
    } catch {
      return {}
    }
  }
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function readArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function readNumber(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function readStringArray(value: unknown): string[] {
  const rawValues = Array.isArray(value) ? value : [value]
  return [...new Set(rawValues.map(normalizeText).filter((item): item is string => Boolean(item)))]
}

function readBusinessTypeFromRecord(record: Record<string, unknown>) {
  return normalizeText(record.businessType ?? record.business_type)
}

function readProjectIdFromRecord(record: Record<string, unknown>) {
  return normalizeText(record.projectId ?? record.project_id)
}

function readDraftNetworkKeyFromRecord(record: Record<string, unknown>) {
  return normalizeText(record.draftNetworkKey ?? record.draft_network_key)
}

function readOptionIdFromRecord(record: Record<string, unknown>) {
  return normalizeText(record.optionId ?? record.option_id)
}

function readWorkPackageKeyFromRecord(record: Record<string, unknown>) {
  return normalizeText(record.workPackageKey ?? record.work_package_key)
}

function readUseCaseFromRecord(record: Record<string, unknown>) {
  return normalizeText(record.useCase ?? record.use_case)
}

function readEvidenceActionFromRecord(record: Record<string, unknown>) {
  return normalizeText(record.evidenceAction ?? record.evidence_action)
}

type ManualReviewHandoffEventRow = {
  id?: unknown
  asset_key?: unknown
  source_module?: unknown
  event_status?: unknown
  runtime_effect?: unknown
  candidate_payload?: unknown
  created_at?: unknown
  updated_at?: unknown
}

type RuntimePublicationRow = {
  publication_key?: unknown
  project_id?: unknown
  draft_network_key?: unknown
  release_handoff_candidate_event_id?: unknown
  runtime_publication_status?: unknown
  applied_dependency_count?: unknown
  rollback_target?: unknown
  published_at?: unknown
}

type RuntimeConsumerObservationRow = {
  asset_key?: unknown
  publication_key?: unknown
  consumer_key?: unknown
  consumer_surface?: unknown
  observation_status?: unknown
  observation_context?: unknown
  observed_at?: unknown
}

type RuntimeEventRow = {
  event_type?: unknown
  event_status?: unknown
  source_publication_key?: unknown
  event_payload?: unknown
  executed_at?: unknown
}

type PlanNetworkOutcomeRow = {
  asset_key?: unknown
  publication_key?: unknown
  outcome_status?: unknown
  outcome_ref?: unknown
  learning_scope?: unknown
  metadata?: unknown
  observed_at?: unknown
}

type RuntimeEngineEvidenceRow = {
  id?: unknown
  engine_code?: unknown
  backtest_status?: unknown
  absolute_error_days?: unknown
  prediction_context?: unknown
  actual_context?: unknown
  backtested_at?: unknown
}

type RecommendationDecisionRow = {
  project_id?: unknown
  recommendation_kind?: unknown
  recommendation_key?: unknown
  action_type?: unknown
  adopted_at?: unknown
  adopted_by?: unknown
  action_context?: unknown
}

const CONSTRUCTION_ORGANIZATION_PLAN_NETWORK_HANDOFF_ASSET_PREFIX = 'construction_organization.plan_network_handoff.'
const CONSTRUCTION_ORGANIZATION_PLAN_NETWORK_HANDOFF_SOURCE_MODULE = 'constructionOrganizationPlanNetworkDraftService.manualReviewHandoff'
const CONSTRUCTION_ORGANIZATION_PLAN_NETWORK_CONFLICT_REVIEW_ASSET_PREFIX = 'construction_organization.plan_network_conflict_review.'
const CONSTRUCTION_ORGANIZATION_PLAN_NETWORK_CONFLICT_REVIEW_SOURCE_MODULE = 'constructionOrganizationPlanNetworkDraftService.manualConflictReview'
const CONSTRUCTION_ORGANIZATION_PLAN_NETWORK_APPROVAL_ASSET_PREFIX = 'construction_organization.plan_network_approval.'
const CONSTRUCTION_ORGANIZATION_PLAN_NETWORK_APPROVAL_SOURCE_MODULE = 'constructionOrganizationPlanNetworkDraftService.manualReviewApproval'
const CONSTRUCTION_ORGANIZATION_PLAN_NETWORK_RELEASE_EXIT_HANDOFF_ASSET_PREFIX = 'construction_organization.plan_network_release_exit_handoff.'
const CONSTRUCTION_ORGANIZATION_PLAN_NETWORK_RELEASE_EXIT_HANDOFF_SOURCE_MODULE = 'constructionOrganizationPlanNetworkDraftService.releaseExitHandoff'
const CONSTRUCTION_ORGANIZATION_PLAN_NETWORK_RUNTIME_ASSET_KEY = 'construction_organization_plan_network' as const
const CONSTRUCTION_ORGANIZATION_PLAN_NETWORK_REQUIRED_ENGINE_CODES = [
  'standard_duration_reference',
  'critical_path_cpm',
  'schedule_acceleration_target',
] as const

const CONSTRUCTION_ORGANIZATION_PLAN_NETWORK_ENGINE_LABELS: Record<
  typeof CONSTRUCTION_ORGANIZATION_PLAN_NETWORK_REQUIRED_ENGINE_CODES[number],
  'E1' | 'E3' | 'E5'
> = {
  standard_duration_reference: 'E1',
  critical_path_cpm: 'E3',
  schedule_acceleration_target: 'E5',
}

type ConstructionOrganizationPlanNetworkRuntimeEngineEvidenceStatus =
  | 'runtime_engine_evidence_ready'
  | 'partial_runtime_engine_evidence'
  | 'missing_runtime_engine_evidence'

type ConstructionOrganizationPlanNetworkRuntimeEngineEvidenceSummary = {
  source: 'construction_organization_plan_network_runtime_engine_evidence_summary'
  status: ConstructionOrganizationPlanNetworkRuntimeEngineEvidenceStatus
  publicationKey: string | null
  presentEngineCodes: Array<'E1' | 'E3' | 'E5'>
  missingEngineCodes: Array<'E1' | 'E3' | 'E5'>
  evidenceCount: number
  canClaimTruePerOptionRuntimeEvaluation: boolean
  boundaryPolicy: string[]
}

type ConstructionOrganizationPlanNetworkUseCaseKey =
  | 'newProjectPlanning'
  | 'startingLineOnboarding'
  | 'accelerationRecovery'

const CONSTRUCTION_ORGANIZATION_PLAN_NETWORK_REQUIRED_USE_CASES: ConstructionOrganizationPlanNetworkUseCaseKey[] = [
  'newProjectPlanning',
  'startingLineOnboarding',
  'accelerationRecovery',
]

const DEFAULT_PLAN_NETWORK_ADMIN_LIMIT = 200
const DEFAULT_PLAN_NETWORK_MAX_LIMIT = 200

function normalizePlanNetworkMaxLimit(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0
    ? Math.max(1, Math.floor(parsed))
    : DEFAULT_PLAN_NETWORK_MAX_LIMIT
}

function clampHandoffLimit(value: unknown, maxLimit: unknown = DEFAULT_PLAN_NETWORK_MAX_LIMIT) {
  const parsed = Number(value)
  const max = normalizePlanNetworkMaxLimit(maxLimit)
  return Number.isFinite(parsed) && parsed > 0
    ? Math.max(1, Math.min(max, Math.floor(parsed)))
    : Math.min(DEFAULT_PLAN_NETWORK_ADMIN_LIMIT, max)
}

function buildCandidateEventReadQuery(params: {
  companyId: string
  projectId: string | null
  assetPrefix: string
  sourceModule: string
  limit: number
}) {
  const baseSelect = `
    SELECT
      id,
      asset_key,
      source_module,
      event_status,
      runtime_effect,
      candidate_payload,
      created_at,
      updated_at
    FROM public.algorithm_asset_candidate_events
  `

  if (params.projectId) {
    return {
      sql: `${baseSelect}
    WHERE company_id = $1::uuid
      AND project_id = $2::uuid
      AND asset_key LIKE $3
      AND source_module = $4
    ORDER BY created_at DESC
    LIMIT $5
  `,
      queryParams: [
        params.companyId,
        params.projectId,
        `${params.assetPrefix}%`,
        params.sourceModule,
        params.limit,
      ],
    }
  }

  return {
    sql: `${baseSelect}
    WHERE company_id = $1::uuid
      AND asset_key LIKE $2
      AND source_module = $3
    ORDER BY created_at DESC
    LIMIT $4
  `,
    queryParams: [
      params.companyId,
      `${params.assetPrefix}%`,
      params.sourceModule,
      params.limit,
    ],
  }
}

async function queryPlanNetworkCandidateEventRows<T = ManualReviewHandoffEventRow>(params: {
  companyId: string
  projectId: string | null
  assetPrefix: string
  sourceModule: string
  limit?: number | null
  maxLimit?: number | null
  queryExec?: AlgorithmAssetGovernanceQueryExec
}) {
  const { sql, queryParams } = buildCandidateEventReadQuery({
    companyId: params.companyId,
    projectId: params.projectId,
    assetPrefix: params.assetPrefix,
    sourceModule: params.sourceModule,
    limit: clampHandoffLimit(params.limit, params.maxLimit),
  })

  if (params.queryExec) return params.queryExec<T>(sql, queryParams)
  // database-query-dynamic-approved: local static SELECT; all runtime values are bound parameters.
  const result = await rawQuery(sql, queryParams as any[])
  return (result.rows ?? []) as T[]
}

async function queryManualReviewHandoffRows(params: {
  companyId: string
  projectId: string | null
  limit?: number | null
  maxLimit?: number | null
  queryExec?: AlgorithmAssetGovernanceQueryExec
}) {
  return queryPlanNetworkCandidateEventRows<ManualReviewHandoffEventRow>({
    ...params,
    assetPrefix: CONSTRUCTION_ORGANIZATION_PLAN_NETWORK_HANDOFF_ASSET_PREFIX,
    sourceModule: CONSTRUCTION_ORGANIZATION_PLAN_NETWORK_HANDOFF_SOURCE_MODULE,
  })
}

async function queryManualReviewApprovalRows(params: {
  companyId: string
  projectId: string | null
  limit?: number | null
  maxLimit?: number | null
  queryExec?: AlgorithmAssetGovernanceQueryExec
}) {
  return queryPlanNetworkCandidateEventRows<ManualReviewHandoffEventRow>({
    ...params,
    assetPrefix: CONSTRUCTION_ORGANIZATION_PLAN_NETWORK_APPROVAL_ASSET_PREFIX,
    sourceModule: CONSTRUCTION_ORGANIZATION_PLAN_NETWORK_APPROVAL_SOURCE_MODULE,
  })
}

async function queryManualConflictReviewRows(params: {
  companyId: string
  projectId: string | null
  limit?: number | null
  maxLimit?: number | null
  queryExec?: AlgorithmAssetGovernanceQueryExec
}) {
  return queryPlanNetworkCandidateEventRows<ManualReviewHandoffEventRow>({
    ...params,
    assetPrefix: CONSTRUCTION_ORGANIZATION_PLAN_NETWORK_CONFLICT_REVIEW_ASSET_PREFIX,
    sourceModule: CONSTRUCTION_ORGANIZATION_PLAN_NETWORK_CONFLICT_REVIEW_SOURCE_MODULE,
  })
}

async function queryReleaseExitHandoffRows(params: {
  companyId: string
  projectId: string | null
  limit?: number | null
  maxLimit?: number | null
  queryExec?: AlgorithmAssetGovernanceQueryExec
}) {
  return queryPlanNetworkCandidateEventRows<ManualReviewHandoffEventRow>({
    ...params,
    assetPrefix: CONSTRUCTION_ORGANIZATION_PLAN_NETWORK_RELEASE_EXIT_HANDOFF_ASSET_PREFIX,
    sourceModule: CONSTRUCTION_ORGANIZATION_PLAN_NETWORK_RELEASE_EXIT_HANDOFF_SOURCE_MODULE,
  })
}

async function queryRuntimePublicationRows(params: {
  companyId: string
  projectId: string | null
  limit?: number | null
  maxLimit?: number | null
  queryExec?: AlgorithmAssetGovernanceQueryExec
}) {
  const baseSelect = `
    SELECT
      publication_key,
      project_id,
      draft_network_key,
      release_handoff_candidate_event_id,
      runtime_publication_status,
      applied_dependency_count,
      rollback_target,
      published_at
    FROM public.construction_organization_plan_network_runtime_publications
  `
  const limit = clampHandoffLimit(params.limit, params.maxLimit)
  const sql = params.projectId
    ? `${baseSelect}
    WHERE company_id = $1::uuid
      AND project_id = $2::uuid
      AND runtime_publication_status = 'runtime_published'
    ORDER BY published_at DESC
    LIMIT $3
  `
    : `${baseSelect}
    WHERE company_id = $1::uuid
      AND runtime_publication_status = 'runtime_published'
    ORDER BY published_at DESC
    LIMIT $2
  `
  const queryParams = params.projectId
    ? [params.companyId, params.projectId, limit]
    : [params.companyId, limit]

  if (params.queryExec) return params.queryExec<RuntimePublicationRow>(sql, queryParams)
  // database-query-dynamic-approved: local static SELECT; all runtime values are bound parameters.
  const result = await rawQuery(sql, queryParams as any[])
  return (result.rows ?? []) as RuntimePublicationRow[]
}

async function queryRuntimeConsumerObservationRows(params: {
  publicationKeys: string[]
  limit?: number | null
  maxLimit?: number | null
  queryExec?: AlgorithmAssetGovernanceQueryExec
}) {
  const publicationKeys = Array.from(new Set(params.publicationKeys
    .map((item) => normalizeText(item))
    .filter((item): item is string => Boolean(item))))
  if (publicationKeys.length === 0) return []

  const sql = `
    SELECT
      asset_key,
      publication_key,
      consumer_key,
      consumer_surface,
      observation_status,
      observation_context,
      observed_at
    FROM public.runtime_consumer_observations
    WHERE asset_key = $1
      AND publication_key = ANY($2::text[])
      AND observation_status = 'observed'
      AND writes_runtime_directly = false
      AND writes_fact_directly = false
    ORDER BY observed_at DESC
    LIMIT $3
  `
  const queryParams = [
    CONSTRUCTION_ORGANIZATION_PLAN_NETWORK_RUNTIME_ASSET_KEY,
    publicationKeys,
    clampHandoffLimit(params.limit, params.maxLimit),
  ]

  if (params.queryExec) return params.queryExec<RuntimeConsumerObservationRow>(sql, queryParams)
  // database-query-dynamic-approved: local static SELECT; all runtime values are bound parameters.
  const result = await rawQuery(sql, queryParams as any[])
  return (result.rows ?? []) as RuntimeConsumerObservationRow[]
}

async function queryRuntimeEventRows(params: {
  publicationKeys: string[]
  limit?: number | null
  maxLimit?: number | null
  queryExec?: AlgorithmAssetGovernanceQueryExec
}) {
  const publicationKeys = Array.from(new Set(params.publicationKeys
    .map((item) => normalizeText(item))
    .filter((item): item is string => Boolean(item))))
  if (publicationKeys.length === 0) return []

  const sql = `
    SELECT
      event_type,
      event_status,
      source_publication_key,
      event_payload,
      executed_at
    FROM public.construction_organization_plan_network_runtime_events
    WHERE source_publication_key = ANY($1::text[])
      AND (
        (event_type = 'impact_monitoring' AND event_status = 'monitoring_passed')
        OR (event_type = 'rollback_execution' AND event_status = 'rollback_executed')
      )
    ORDER BY executed_at DESC
    LIMIT $2
  `
  const queryParams = [
    publicationKeys,
    clampHandoffLimit(params.limit, params.maxLimit),
  ]

  if (params.queryExec) return params.queryExec<RuntimeEventRow>(sql, queryParams)
  // database-query-dynamic-approved: local static SELECT; all runtime values are bound parameters.
  const result = await rawQuery(sql, queryParams as any[])
  return (result.rows ?? []) as RuntimeEventRow[]
}

async function queryPlanNetworkOutcomeRows(params: {
  publicationKeys: string[]
  limit?: number | null
  maxLimit?: number | null
  queryExec?: AlgorithmAssetGovernanceQueryExec
}) {
  const publicationKeys = Array.from(new Set(params.publicationKeys
    .map((item) => normalizeText(item))
    .filter((item): item is string => Boolean(item))))
  if (publicationKeys.length === 0) return []

  const sql = `
    SELECT
      asset_key,
      publication_key,
      outcome_status,
      outcome_ref,
      learning_scope,
      metadata,
      observed_at
    FROM public.duration_plan_network_outcomes
    WHERE asset_key = $1
      AND publication_key = ANY($2::text[])
      AND outcome_status IN ('accepted', 'weak')
      AND writes_runtime_directly = false
      AND writes_fact_directly = false
    ORDER BY observed_at DESC
    LIMIT $3
  `
  const queryParams = [
    CONSTRUCTION_ORGANIZATION_PLAN_NETWORK_RUNTIME_ASSET_KEY,
    publicationKeys,
    clampHandoffLimit(params.limit, params.maxLimit),
  ]

  if (params.queryExec) return params.queryExec<PlanNetworkOutcomeRow>(sql, queryParams)
  // database-query-dynamic-approved: local static SELECT; all runtime values are bound parameters.
  const result = await rawQuery(sql, queryParams as any[])
  return (result.rows ?? []) as PlanNetworkOutcomeRow[]
}

async function queryRuntimeEngineEvidenceRows(params: {
  publicationKeys: string[]
  limit?: number | null
  maxLimit?: number | null
  queryExec?: AlgorithmAssetGovernanceQueryExec
}) {
  const publicationKeys = Array.from(new Set(params.publicationKeys
    .map((item) => normalizeText(item))
    .filter((item): item is string => Boolean(item))))
  if (publicationKeys.length === 0) return []

  const sql = `
    SELECT
      id,
      engine_code,
      backtest_status,
      absolute_error_days,
      prediction_context,
      actual_context,
      backtested_at
    FROM public.duration_algorithm_accuracy_events
    WHERE engine_code = ANY($1::text[])
      AND absolute_error_days IS NOT NULL
      AND backtest_status IN ('backtested', 'actual_recorded_without_error')
      AND (
        (
          prediction_context->>'assetKey' = $2
          AND COALESCE(
            prediction_context->>'publicationKey',
            prediction_context->>'runtimePublicationKey'
          ) = ANY($3::text[])
        )
        OR (
          actual_context->>'assetKey' = $2
          AND COALESCE(
            actual_context->>'publicationKey',
            actual_context->>'runtimePublicationKey'
          ) = ANY($3::text[])
        )
      )
    ORDER BY backtested_at DESC NULLS LAST
    LIMIT $4
  `
  const queryParams = [
    [...CONSTRUCTION_ORGANIZATION_PLAN_NETWORK_REQUIRED_ENGINE_CODES],
    CONSTRUCTION_ORGANIZATION_PLAN_NETWORK_RUNTIME_ASSET_KEY,
    publicationKeys,
    clampHandoffLimit(params.limit, params.maxLimit),
  ]

  if (params.queryExec) return params.queryExec<RuntimeEngineEvidenceRow>(sql, queryParams)
  // database-query-dynamic-approved: local static SELECT; all runtime values are bound parameters.
  const result = await rawQuery(sql, queryParams as any[])
  return (result.rows ?? []) as RuntimeEngineEvidenceRow[]
}

async function queryRecommendationDecisionRows(params: {
  projectId: string | null
  projectIds?: string[]
  recommendationKeys: string[]
  limit?: number | null
  maxLimit?: number | null
  queryExec?: AlgorithmAssetGovernanceQueryExec
}) {
  const recommendationKeys = Array.from(new Set(params.recommendationKeys
    .map((item) => normalizeText(item))
    .filter((item): item is string => Boolean(item))))
  const projectIds = params.projectId
    ? [params.projectId]
    : Array.from(new Set((params.projectIds ?? [])
        .map((item) => normalizeText(item))
        .filter((item): item is string => Boolean(item))))
  if (projectIds.length === 0 || recommendationKeys.length === 0) return []

  const sql = `
    SELECT
      project_id,
      recommendation_kind,
      recommendation_key,
      action_type,
      adopted_at,
      adopted_by,
      action_context
    FROM public.recommendation_actions
    WHERE project_id = ANY($1::uuid[])
      AND recommendation_kind = $2
      AND recommendation_key = ANY($3::text[])
      AND action_type IN ('adopted', 'declined')
    ORDER BY adopted_at DESC
    LIMIT $4
  `
  const queryParams = [
    projectIds,
    CONSTRUCTION_ORGANIZATION_PLAN_NETWORK_RUNTIME_ASSET_KEY,
    recommendationKeys,
    clampHandoffLimit(params.limit, params.maxLimit),
  ]

  if (params.queryExec) return params.queryExec<RecommendationDecisionRow>(sql, queryParams)
  // database-query-dynamic-approved: local static SELECT; all runtime values are bound parameters.
  const result = await rawQuery(sql, queryParams as any[])
  return (result.rows ?? []) as RecommendationDecisionRow[]
}

function buildManualReviewHandoffProjection(row: ManualReviewHandoffEventRow): ConstructionOrganizationPlanNetworkManualReviewHandoffProjection | null {
  const payload = readRecord(row.candidate_payload)
  const draftNetworkKey = normalizeText(payload.draftNetworkKey)
  if (!draftNetworkKey) return null
  const reviewPackage = readRecord(payload.reviewPackage)
  const proposedDependencyEdges = readArray(reviewPackage.proposedDependencyEdges)
  const runtimeMutationBoundary = readRecord(payload.runtimeMutationBoundary ?? payload.mutationBoundary)

  return {
    source: 'construction_organization_plan_network_manual_review_handoff_projection',
    candidateEventId: normalizeText(row.id),
    assetKey: normalizeText(row.asset_key) ?? '',
    sourceModule: normalizeText(row.source_module) ?? '',
    eventStatus: normalizeText(row.event_status) ?? '',
    runtimeEffect: normalizeText(row.runtime_effect) ?? '',
    createdAt: normalizeText(row.created_at),
    updatedAt: normalizeText(row.updated_at),
    draftNetworkKey,
    originalCandidateEventId: normalizeText(payload.originalCandidateEventId),
    optionId: normalizeText(payload.optionId),
    selectedScenarioIds: readStringArray(payload.selectedScenarioIds),
    requestedByUserId: normalizeText(payload.requestedByUserId),
    executedAt: normalizeText(payload.executedAt),
    reviewOperation: 'manual_review_dependency_proposal',
    proposedDependencyEdgeCount: proposedDependencyEdges.length,
    writesTaskDependencies: runtimeMutationBoundary.writesTaskDependencies === false ? false : false,
    writesPlanDates: runtimeMutationBoundary.writesPlanDates === false ? false : false,
    writesSeed: runtimeMutationBoundary.writesSeed === false ? false : false,
    writesBaseline: runtimeMutationBoundary.writesBaseline === false ? false : false,
    writesCriticalPathFacts: runtimeMutationBoundary.writesCriticalPathFacts === false ? false : false,
    writesAccelerationDraft: runtimeMutationBoundary.writesAccelerationDraft === false ? false : false,
  }
}

function buildManualReviewApprovalProjection(row: ManualReviewHandoffEventRow): ConstructionOrganizationPlanNetworkManualReviewApprovalProjection | null {
  const payload = readRecord(row.candidate_payload)
  const draftNetworkKey = normalizeText(payload.draftNetworkKey)
  if (!draftNetworkKey) return null
  const approvalDecision = normalizeText(payload.approvalDecision)
  const normalizedDecision = approvalDecision === 'approved_for_release_exit_preparation'
    ? 'approved_for_release_exit_preparation'
    : null
  if (!normalizedDecision) return null

  return {
    source: 'construction_organization_plan_network_manual_review_approval_projection',
    candidateEventId: normalizeText(row.id),
    assetKey: normalizeText(row.asset_key) ?? '',
    sourceModule: normalizeText(row.source_module) ?? '',
    eventStatus: normalizeText(row.event_status) ?? '',
    runtimeEffect: normalizeText(row.runtime_effect) ?? '',
    createdAt: normalizeText(row.created_at),
    updatedAt: normalizeText(row.updated_at),
    draftNetworkKey,
    handoffCandidateEventId: normalizeText(payload.handoffCandidateEventId),
    approvedByUserId: normalizeText(payload.approvedByUserId),
    approvedAt: normalizeText(payload.approvedAt),
    approvalDecision: normalizedDecision,
    writesTaskDependencies: false,
    writesPlanDates: false,
    writesSeed: false,
    writesBaseline: false,
    writesCriticalPathFacts: false,
    writesAccelerationDraft: false,
  }
}

function buildManualConflictReviewProjection(row: ManualReviewHandoffEventRow): ConstructionOrganizationPlanNetworkManualConflictReviewProjection | null {
  const payload = readRecord(row.candidate_payload)
  const draftNetworkKey = normalizeText(payload.draftNetworkKey)
  if (!draftNetworkKey) return null
  const decision = normalizeText(payload.decision)
  if (decision !== 'approved_ready_for_replay' && decision !== 'rejected_needs_plan_date_adjustment') return null
  const resultingReadiness = normalizeText(payload.resultingReadiness)
  const normalizedResultingReadiness: ConstructionOrganizationPlanNetworkDraftReadiness = decision === 'approved_ready_for_replay'
    ? 'ready_for_replay'
    : 'conflict_review_required'
  if (resultingReadiness && resultingReadiness !== normalizedResultingReadiness) return null
  const runtimeMutationBoundary = readRecord(payload.runtimeMutationBoundary ?? payload.mutationBoundary)

  return {
    source: 'construction_organization_plan_network_manual_conflict_review_projection',
    candidateEventId: normalizeText(row.id),
    assetKey: normalizeText(row.asset_key) ?? '',
    sourceModule: normalizeText(row.source_module) ?? '',
    eventStatus: normalizeText(row.event_status) ?? '',
    runtimeEffect: normalizeText(row.runtime_effect) ?? '',
    createdAt: normalizeText(row.created_at),
    updatedAt: normalizeText(row.updated_at),
    draftNetworkKey,
    handoffCandidateEventId: normalizeText(payload.handoffCandidateEventId),
    decision,
    resultingReadiness: normalizedResultingReadiness,
    reviewedByUserId: normalizeText(payload.reviewedByUserId),
    reviewedAt: normalizeText(payload.reviewedAt),
    decisionNotes: normalizeText(payload.decisionNotes),
    writesTaskDependencies: runtimeMutationBoundary.writesTaskDependencies === false ? false : false,
    writesPlanDates: runtimeMutationBoundary.writesPlanDates === false ? false : false,
    writesSeed: runtimeMutationBoundary.writesSeed === false ? false : false,
    writesBaseline: runtimeMutationBoundary.writesBaseline === false ? false : false,
    writesCriticalPathFacts: runtimeMutationBoundary.writesCriticalPathFacts === false ? false : false,
    writesAccelerationDraft: runtimeMutationBoundary.writesAccelerationDraft === false ? false : false,
  }
}

function buildReleaseExitHandoffProjection(row: ManualReviewHandoffEventRow): ConstructionOrganizationPlanNetworkReleaseExitHandoffProjection | null {
  const payload = readRecord(row.candidate_payload)
  const draftNetworkKey = normalizeText(payload.draftNetworkKey)
  if (!draftNetworkKey) return null
  const runtimeMutationBoundary = readRecord(payload.runtimeMutationBoundary ?? payload.mutationBoundary)
  const proposedDependencyEdges = readArray(payload.proposedDependencyEdges)

  return {
    source: 'construction_organization_plan_network_release_exit_handoff_projection',
    candidateEventId: normalizeText(row.id),
    assetKey: normalizeText(row.asset_key) ?? '',
    sourceModule: normalizeText(row.source_module) ?? '',
    eventStatus: normalizeText(row.event_status) ?? '',
    runtimeEffect: normalizeText(row.runtime_effect) ?? '',
    createdAt: normalizeText(row.created_at),
    updatedAt: normalizeText(row.updated_at),
    draftNetworkKey,
    originalCandidateEventId: normalizeText(payload.originalCandidateEventId),
    handoffCandidateEventId: normalizeText(payload.handoffCandidateEventId),
    approvalCandidateEventId: normalizeText(payload.approvalCandidateEventId),
    optionId: normalizeText(payload.optionId),
    selectedScenarioIds: readStringArray(payload.selectedScenarioIds),
    requestedByUserId: normalizeText(payload.requestedByUserId),
    executedAt: normalizeText(payload.executedAt),
    releaseRecordTarget: normalizeText(payload.releaseRecordTarget),
    rollbackTarget: normalizeText(payload.rollbackTarget),
    consumerVerificationRefs: readStringArray(payload.consumerVerificationRefs),
    impactMonitoringRefs: readStringArray(payload.impactMonitoringRefs),
    rollbackWriterRefs: readStringArray(payload.rollbackWriterRefs),
    proposedDependencyEdgeCount: proposedDependencyEdges.length,
    writesTaskDependencies: runtimeMutationBoundary.writesTaskDependencies === false ? false : false,
    writesPlanDates: runtimeMutationBoundary.writesPlanDates === false ? false : false,
    writesSeed: runtimeMutationBoundary.writesSeed === false ? false : false,
    writesBaseline: runtimeMutationBoundary.writesBaseline === false ? false : false,
    writesCriticalPathFacts: runtimeMutationBoundary.writesCriticalPathFacts === false ? false : false,
    writesAccelerationDraft: runtimeMutationBoundary.writesAccelerationDraft === false ? false : false,
  }
}

function buildRuntimePublicationProjection(row: RuntimePublicationRow): ConstructionOrganizationPlanNetworkRuntimePublicationProjection | null {
  const draftNetworkKey = normalizeText(row.draft_network_key)
  const releaseHandoffCandidateEventId = normalizeText(row.release_handoff_candidate_event_id)
  const publicationKey = normalizeText(row.publication_key)
  const projectId = normalizeText(row.project_id)
  const runtimePublicationStatus = normalizeText(row.runtime_publication_status)
  if (!draftNetworkKey || !releaseHandoffCandidateEventId || !publicationKey || !projectId) return null
  if (runtimePublicationStatus !== 'runtime_published') return null

  return {
    source: 'construction_organization_plan_network_runtime_publication_projection',
    publicationKey,
    projectId,
    draftNetworkKey,
    releaseHandoffCandidateEventId,
    runtimePublicationStatus: 'runtime_published',
    appliedDependencyCount: Math.max(0, Math.trunc(readNumber(row.applied_dependency_count) ?? 0)),
    rollbackTarget: normalizeText(row.rollback_target),
    publishedAt: normalizeText(row.published_at),
  }
}

function buildRuntimeConsumerObservationProjection(
  row: RuntimeConsumerObservationRow,
): ConstructionOrganizationPlanNetworkRuntimeConsumerObservationProjection | null {
  const assetKey = normalizeText(row.asset_key)
  const publicationKey = normalizeText(row.publication_key)
  const consumerKey = normalizeText(row.consumer_key)
  const consumerSurface = normalizeText(row.consumer_surface)
  const observationStatus = normalizeText(row.observation_status)
  const observationContext = readRecord(row.observation_context)
  if (assetKey !== CONSTRUCTION_ORGANIZATION_PLAN_NETWORK_RUNTIME_ASSET_KEY) return null
  if (!publicationKey || !consumerKey || !consumerSurface) return null
  if (observationStatus !== 'observed') return null

  return {
    source: 'construction_organization_plan_network_runtime_consumer_observation_projection',
    assetKey: CONSTRUCTION_ORGANIZATION_PLAN_NETWORK_RUNTIME_ASSET_KEY,
    publicationKey,
    consumerKey,
    consumerSurface,
    observationStatus: 'observed',
    workPackageKey: readWorkPackageKeyFromRecord(observationContext),
    useCase: readUseCaseFromRecord(observationContext),
    evidenceAction: readEvidenceActionFromRecord(observationContext),
    businessType: readBusinessTypeFromRecord(observationContext),
    projectId: readProjectIdFromRecord(observationContext),
    draftNetworkKey: readDraftNetworkKeyFromRecord(observationContext),
    optionId: readOptionIdFromRecord(observationContext),
    observedAt: normalizeText(row.observed_at),
  }
}

function buildRuntimeEventProjection(row: RuntimeEventRow): ConstructionOrganizationPlanNetworkRuntimeEventProjection | null {
  const eventType = normalizeText(row.event_type)
  const eventStatus = normalizeText(row.event_status)
  const sourcePublicationKey = normalizeText(row.source_publication_key)
  const eventPayload = readRecord(row.event_payload)
  const businessType = readBusinessTypeFromRecord(eventPayload)
  if (!sourcePublicationKey) return null
  if (eventType === 'impact_monitoring' && eventStatus === 'monitoring_passed') {
  return {
    source: 'construction_organization_plan_network_runtime_event_projection',
    eventType,
    eventStatus,
    sourcePublicationKey,
    workPackageKey: readWorkPackageKeyFromRecord(eventPayload),
    useCase: readUseCaseFromRecord(eventPayload),
    evidenceAction: readEvidenceActionFromRecord(eventPayload),
    businessType,
    projectId: readProjectIdFromRecord(eventPayload),
    draftNetworkKey: readDraftNetworkKeyFromRecord(eventPayload),
    optionId: readOptionIdFromRecord(eventPayload),
    executedAt: normalizeText(row.executed_at),
  }
  }
  if (eventType === 'rollback_execution' && eventStatus === 'rollback_executed') {
    return {
      source: 'construction_organization_plan_network_runtime_event_projection',
      eventType,
      eventStatus,
      sourcePublicationKey,
      workPackageKey: readWorkPackageKeyFromRecord(eventPayload),
      useCase: readUseCaseFromRecord(eventPayload),
      evidenceAction: readEvidenceActionFromRecord(eventPayload),
      businessType,
      projectId: readProjectIdFromRecord(eventPayload),
      draftNetworkKey: readDraftNetworkKeyFromRecord(eventPayload),
      optionId: readOptionIdFromRecord(eventPayload),
      executedAt: normalizeText(row.executed_at),
    }
  }
  return null
}

function buildPlanNetworkOutcomeProjection(row: PlanNetworkOutcomeRow): ConstructionOrganizationPlanNetworkOutcomeProjection | null {
  const assetKey = normalizeText(row.asset_key)
  const publicationKey = normalizeText(row.publication_key)
  const outcomeStatus = normalizeText(row.outcome_status)
  const metadata = readRecord(row.metadata)
  if (assetKey !== CONSTRUCTION_ORGANIZATION_PLAN_NETWORK_RUNTIME_ASSET_KEY) return null
  if (!publicationKey) return null
  if (outcomeStatus !== 'accepted' && outcomeStatus !== 'weak') return null

  return {
    source: 'construction_organization_plan_network_outcome_projection',
    assetKey: CONSTRUCTION_ORGANIZATION_PLAN_NETWORK_RUNTIME_ASSET_KEY,
    publicationKey,
    outcomeStatus,
    outcomeRef: normalizeText(row.outcome_ref),
    learningScope: normalizeText(row.learning_scope) ?? 'project',
    workPackageKey: readWorkPackageKeyFromRecord(metadata),
    useCase: readUseCaseFromRecord(metadata),
    evidenceAction: readEvidenceActionFromRecord(metadata),
    businessType: readBusinessTypeFromRecord(metadata),
    projectId: readProjectIdFromRecord(metadata),
    draftNetworkKey: readDraftNetworkKeyFromRecord(metadata),
    optionId: readOptionIdFromRecord(metadata),
    observedAt: normalizeText(row.observed_at),
  }
}

function normalizeRuntimeEngineCode(
  value: unknown,
): ConstructionOrganizationPlanNetworkRuntimeEngineEvidenceProjection['engineCode'] | null {
  const engineCode = normalizeText(value)
  return CONSTRUCTION_ORGANIZATION_PLAN_NETWORK_REQUIRED_ENGINE_CODES.includes(engineCode as any)
    ? engineCode as ConstructionOrganizationPlanNetworkRuntimeEngineEvidenceProjection['engineCode']
    : null
}

function normalizePlanNetworkUseCase(value: unknown): ConstructionOrganizationPlanNetworkUseCaseKey | null {
  const useCase = normalizeText(value)
  return useCase === 'newProjectPlanning'
    || useCase === 'startingLineOnboarding'
    || useCase === 'accelerationRecovery'
    ? useCase
    : null
}

function readRuntimeEngineEvidencePublicationKey(row: RuntimeEngineEvidenceRow) {
  const predictionContext = readRecord(row.prediction_context)
  const actualContext = readRecord(row.actual_context)
  const predictionAssetKey = normalizeText(predictionContext.assetKey)
  const actualAssetKey = normalizeText(actualContext.assetKey)
  const predictionPublicationKey = normalizeText(
    predictionContext.publicationKey ?? predictionContext.runtimePublicationKey,
  )
  const actualPublicationKey = normalizeText(
    actualContext.publicationKey ?? actualContext.runtimePublicationKey,
  )
  if (predictionAssetKey === CONSTRUCTION_ORGANIZATION_PLAN_NETWORK_RUNTIME_ASSET_KEY && predictionPublicationKey) {
    return predictionPublicationKey
  }
  if (actualAssetKey === CONSTRUCTION_ORGANIZATION_PLAN_NETWORK_RUNTIME_ASSET_KEY && actualPublicationKey) {
    return actualPublicationKey
  }
  return null
}

function buildRuntimeEngineEvidenceProjection(
  row: RuntimeEngineEvidenceRow,
): ConstructionOrganizationPlanNetworkRuntimeEngineEvidenceProjection | null {
  const engineCode = normalizeRuntimeEngineCode(row.engine_code)
  const backtestStatus = normalizeText(row.backtest_status)
  const publicationKey = readRuntimeEngineEvidencePublicationKey(row)
  const absoluteErrorDays = readNumber(row.absolute_error_days)
  const predictionContext = readRecord(row.prediction_context)
  const actualContext = readRecord(row.actual_context)
  const businessType = readBusinessTypeFromRecord(predictionContext) ?? readBusinessTypeFromRecord(actualContext)
  const projectId = readProjectIdFromRecord(predictionContext) ?? readProjectIdFromRecord(actualContext)
  const draftNetworkKey = readDraftNetworkKeyFromRecord(predictionContext) ?? readDraftNetworkKeyFromRecord(actualContext)
  const optionId = readOptionIdFromRecord(predictionContext) ?? readOptionIdFromRecord(actualContext)
  if (!engineCode || !publicationKey || absoluteErrorDays == null || absoluteErrorDays < 0) return null
  if (backtestStatus !== 'backtested' && backtestStatus !== 'actual_recorded_without_error') return null

  return {
    source: 'construction_organization_plan_network_runtime_engine_evidence_projection',
    assetKey: CONSTRUCTION_ORGANIZATION_PLAN_NETWORK_RUNTIME_ASSET_KEY,
    publicationKey,
    evidenceId: normalizeText(row.id) ?? '',
    engineCode,
    backtestStatus,
    absoluteErrorDays,
    workPackageKey: readWorkPackageKeyFromRecord(predictionContext) ?? readWorkPackageKeyFromRecord(actualContext),
    useCase: readUseCaseFromRecord(predictionContext) ?? readUseCaseFromRecord(actualContext),
    evidenceAction: readEvidenceActionFromRecord(predictionContext) ?? readEvidenceActionFromRecord(actualContext),
    businessType,
    projectId,
    draftNetworkKey,
    optionId,
    backtestedAt: normalizeText(row.backtested_at),
  }
}

function buildRecommendationDecisionProjection(
  row: RecommendationDecisionRow,
): ConstructionOrganizationPlanNetworkRecommendationDecisionProjection | null {
  const recommendationKind = normalizeText(row.recommendation_kind)
  const recommendationKey = normalizeText(row.recommendation_key)
  const actionType = normalizeText(row.action_type)
  if (recommendationKind !== CONSTRUCTION_ORGANIZATION_PLAN_NETWORK_RUNTIME_ASSET_KEY) return null
  if (!recommendationKey) return null
  if (actionType !== 'adopted' && actionType !== 'declined') return null
  const actionContext = readRecord(row.action_context)

  return {
    source: 'construction_organization_plan_network_recommendation_decision_projection',
    projectId: normalizeText(row.project_id),
    recommendationKind: CONSTRUCTION_ORGANIZATION_PLAN_NETWORK_RUNTIME_ASSET_KEY,
    recommendationKey,
    actionType,
    optionId: normalizeText(actionContext.optionId),
    draftNetworkKey: normalizeText(actionContext.draftNetworkKey),
    publicationKey: normalizeText(actionContext.publicationKey),
    workPackageKey: readWorkPackageKeyFromRecord(actionContext),
    useCase: readUseCaseFromRecord(actionContext),
    evidenceAction: readEvidenceActionFromRecord(actionContext),
    businessType: readBusinessTypeFromRecord(actionContext),
    selectedScenarioIds: readStringArray(actionContext.selectedScenarioIds),
    decidedAt: normalizeText(actionContext.decidedAt) ?? normalizeText(row.adopted_at),
    decidedBy: normalizeText(actionContext.decidedBy) ?? normalizeText(row.adopted_by),
    siteDecisionMatchesRuntimeRecommendation: null,
    writesTaskDependencies: false,
    writesPlanDates: false,
    writesSeed: false,
    writesBaseline: false,
    writesCriticalPathFacts: false,
    writesAccelerationDraft: false,
    boundaryPolicy: [
      'recommendation_decision_is_site_decision_fact',
      'does_not_trigger_runtime_apply',
      'does_not_write_task_dependencies_or_plan_dates',
      'does_not_write_seed_baseline_task_facts_acceleration_drafts_or_critical_path_facts',
    ],
  }
}

function indexManualReviewHandoffs(
  handoffs: ConstructionOrganizationPlanNetworkManualReviewHandoffProjection[],
) {
  const handoffByDraftKey = new Map<string, ConstructionOrganizationPlanNetworkManualReviewHandoffProjection>()
  for (const handoff of handoffs) {
    if (!handoffByDraftKey.has(handoff.draftNetworkKey)) {
      handoffByDraftKey.set(handoff.draftNetworkKey, handoff)
    }
  }
  return handoffByDraftKey
}

function indexManualReviewApprovals(
  approvals: ConstructionOrganizationPlanNetworkManualReviewApprovalProjection[],
) {
  const approvalByDraftKey = new Map<string, ConstructionOrganizationPlanNetworkManualReviewApprovalProjection>()
  for (const approval of approvals) {
    if (!approvalByDraftKey.has(approval.draftNetworkKey)) {
      approvalByDraftKey.set(approval.draftNetworkKey, approval)
    }
  }
  return approvalByDraftKey
}

function indexManualConflictReviews(
  conflictReviews: ConstructionOrganizationPlanNetworkManualConflictReviewProjection[],
) {
  const reviewByDraftKey = new Map<string, ConstructionOrganizationPlanNetworkManualConflictReviewProjection>()
  for (const review of conflictReviews) {
    if (!reviewByDraftKey.has(review.draftNetworkKey)) {
      reviewByDraftKey.set(review.draftNetworkKey, review)
    }
  }
  return reviewByDraftKey
}

function applyManualConflictReviewProjection(
  draft: ConstructionOrganizationPlanNetworkDraft,
  manualConflictReviewDecision: ConstructionOrganizationPlanNetworkManualConflictReviewProjection | null,
): ConstructionOrganizationPlanNetworkDraft {
  if (!manualConflictReviewDecision) return draft
  if (
    manualConflictReviewDecision.decision !== 'approved_ready_for_replay'
    || manualConflictReviewDecision.resultingReadiness !== 'ready_for_replay'
  ) {
    return {
      ...draft,
      manualConflictReviewDecision,
    }
  }

  return {
    ...draft,
    readiness: 'ready_for_replay',
    blockedReasons: draft.blockedReasons.filter((reason) => !isConstructionOrganizationConflictReviewHandoffReason(reason)),
    manualConflictReviewDecision,
  }
}

function indexReleaseExitHandoffs(
  handoffs: ConstructionOrganizationPlanNetworkReleaseExitHandoffProjection[],
) {
  const handoffByDraftKey = new Map<string, ConstructionOrganizationPlanNetworkReleaseExitHandoffProjection>()
  for (const handoff of handoffs) {
    if (!handoffByDraftKey.has(handoff.draftNetworkKey)) {
      handoffByDraftKey.set(handoff.draftNetworkKey, handoff)
    }
  }
  return handoffByDraftKey
}

function indexRuntimePublications(
  publications: ConstructionOrganizationPlanNetworkRuntimePublicationProjection[],
) {
  const publicationByDraftKey = new Map<string, ConstructionOrganizationPlanNetworkRuntimePublicationProjection>()
  const publicationByReleaseHandoffEventId = new Map<string, ConstructionOrganizationPlanNetworkRuntimePublicationProjection>()
  for (const publication of publications) {
    if (!publicationByDraftKey.has(publication.draftNetworkKey)) {
      publicationByDraftKey.set(publication.draftNetworkKey, publication)
    }
    if (!publicationByReleaseHandoffEventId.has(publication.releaseHandoffCandidateEventId)) {
      publicationByReleaseHandoffEventId.set(publication.releaseHandoffCandidateEventId, publication)
    }
  }
  return { publicationByDraftKey, publicationByReleaseHandoffEventId }
}

function runtimePublicationMatchesDraft(
  item: Pick<ConstructionOrganizationPlanNetworkDraft, 'projectId' | 'draftNetworkKey'>,
  publication: ConstructionOrganizationPlanNetworkRuntimePublicationProjection | null | undefined,
) {
  if (!publication) return false
  const projectId = normalizeText(item.projectId)
  const publicationProjectId = normalizeText(publication.projectId)
  const draftNetworkKey = normalizeText(item.draftNetworkKey)
  const publicationDraftNetworkKey = normalizeText(publication.draftNetworkKey)
  return Boolean(
    projectId
      && publicationProjectId === projectId
      && draftNetworkKey
      && publicationDraftNetworkKey === draftNetworkKey,
  )
}

function indexRuntimeConsumerObservations(
  observations: ConstructionOrganizationPlanNetworkRuntimeConsumerObservationProjection[],
) {
  const observationsByPublicationKey = new Map<string, ConstructionOrganizationPlanNetworkRuntimeConsumerObservationProjection[]>()
  for (const observation of observations) {
    const existing = observationsByPublicationKey.get(observation.publicationKey) ?? []
    existing.push(observation)
    observationsByPublicationKey.set(observation.publicationKey, existing)
  }
  return { observationsByPublicationKey }
}

function indexRuntimeEvents(
  events: ConstructionOrganizationPlanNetworkRuntimeEventProjection[],
) {
  const impactMonitoringByPublicationKey = new Map<string, ConstructionOrganizationPlanNetworkRuntimeEventProjection[]>()
  const rollbackExecutionByPublicationKey = new Map<string, ConstructionOrganizationPlanNetworkRuntimeEventProjection[]>()
  for (const event of events) {
    const target = event.eventType === 'impact_monitoring'
      ? impactMonitoringByPublicationKey
      : rollbackExecutionByPublicationKey
    const existing = target.get(event.sourcePublicationKey) ?? []
    existing.push(event)
    target.set(event.sourcePublicationKey, existing)
  }
  return { impactMonitoringByPublicationKey, rollbackExecutionByPublicationKey }
}

function indexPlanNetworkOutcomes(
  outcomes: ConstructionOrganizationPlanNetworkOutcomeProjection[],
) {
  const outcomesByPublicationKey = new Map<string, ConstructionOrganizationPlanNetworkOutcomeProjection[]>()
  for (const outcome of outcomes) {
    const existing = outcomesByPublicationKey.get(outcome.publicationKey) ?? []
    existing.push(outcome)
    outcomesByPublicationKey.set(outcome.publicationKey, existing)
  }
  return { outcomesByPublicationKey }
}

function indexRuntimeEngineEvidence(
  evidence: ConstructionOrganizationPlanNetworkRuntimeEngineEvidenceProjection[],
) {
  const engineCodesByPublicationKey = new Map<string, Set<ConstructionOrganizationPlanNetworkRuntimeEngineEvidenceProjection['engineCode']>>()
  for (const item of evidence) {
    const engineCodes = engineCodesByPublicationKey.get(item.publicationKey) ?? new Set<ConstructionOrganizationPlanNetworkRuntimeEngineEvidenceProjection['engineCode']>()
    engineCodes.add(item.engineCode)
    engineCodesByPublicationKey.set(item.publicationKey, engineCodes)
  }
  const hasAllRequiredEngines = (publicationKey: string) => {
    const engineCodes = engineCodesByPublicationKey.get(publicationKey)
    return Boolean(engineCodes && CONSTRUCTION_ORGANIZATION_PLAN_NETWORK_REQUIRED_ENGINE_CODES.every((engineCode) => engineCodes.has(engineCode)))
  }
  const buildSummary = (publicationKey: string | null | undefined): ConstructionOrganizationPlanNetworkRuntimeEngineEvidenceSummary => {
    const engineCodes = publicationKey ? engineCodesByPublicationKey.get(publicationKey) : undefined
    const presentEngineCodes = CONSTRUCTION_ORGANIZATION_PLAN_NETWORK_REQUIRED_ENGINE_CODES
      .filter((engineCode) => engineCodes?.has(engineCode))
      .map((engineCode) => CONSTRUCTION_ORGANIZATION_PLAN_NETWORK_ENGINE_LABELS[engineCode])
    const missingEngineCodes = CONSTRUCTION_ORGANIZATION_PLAN_NETWORK_REQUIRED_ENGINE_CODES
      .filter((engineCode) => !engineCodes?.has(engineCode))
      .map((engineCode) => CONSTRUCTION_ORGANIZATION_PLAN_NETWORK_ENGINE_LABELS[engineCode])
    const canClaimTruePerOptionRuntimeEvaluation = missingEngineCodes.length === 0
    return {
      source: 'construction_organization_plan_network_runtime_engine_evidence_summary',
      status: canClaimTruePerOptionRuntimeEvaluation
        ? 'runtime_engine_evidence_ready'
        : presentEngineCodes.length > 0
          ? 'partial_runtime_engine_evidence'
          : 'missing_runtime_engine_evidence',
      publicationKey: publicationKey ?? null,
      presentEngineCodes,
      missingEngineCodes,
      evidenceCount: presentEngineCodes.length,
      canClaimTruePerOptionRuntimeEvaluation,
      boundaryPolicy: [
        'runtime_engine_evidence_is_read_only',
        'e1_e3_e5_required_before_true_per_option_runtime_claim',
        'does_not_write_task_dependencies_or_plan_dates',
      ],
    }
  }
  return { engineCodesByPublicationKey, hasAllRequiredEngines, buildSummary }
}

function collectRuntimeBusinessTypesForPublication(input: {
  publicationKey: string
  observationsByPublicationKey: Map<string, ConstructionOrganizationPlanNetworkRuntimeConsumerObservationProjection[]>
  impactMonitoringByPublicationKey: Map<string, ConstructionOrganizationPlanNetworkRuntimeEventProjection[]>
  rollbackExecutionByPublicationKey: Map<string, ConstructionOrganizationPlanNetworkRuntimeEventProjection[]>
  outcomesByPublicationKey: Map<string, ConstructionOrganizationPlanNetworkOutcomeProjection[]>
  engineEvidenceByPublicationKey: Map<string, ConstructionOrganizationPlanNetworkRuntimeEngineEvidenceProjection[]>
}) {
  return [
    ...(input.observationsByPublicationKey.get(input.publicationKey) ?? []).map((item) => item.businessType),
    ...(input.impactMonitoringByPublicationKey.get(input.publicationKey) ?? []).map((item) => item.businessType),
    ...(input.rollbackExecutionByPublicationKey.get(input.publicationKey) ?? []).map((item) => item.businessType),
    ...(input.outcomesByPublicationKey.get(input.publicationKey) ?? []).map((item) => item.businessType),
    ...(input.engineEvidenceByPublicationKey.get(input.publicationKey) ?? []).map((item) => item.businessType),
  ]
    .map(normalizeText)
    .filter((item): item is string => Boolean(item))
}

function hasMissingRuntimeBusinessTypeAttribution(input: {
  publicationKey: string
  observationsByPublicationKey: Map<string, ConstructionOrganizationPlanNetworkRuntimeConsumerObservationProjection[]>
  impactMonitoringByPublicationKey: Map<string, ConstructionOrganizationPlanNetworkRuntimeEventProjection[]>
  rollbackExecutionByPublicationKey: Map<string, ConstructionOrganizationPlanNetworkRuntimeEventProjection[]>
  outcomesByPublicationKey: Map<string, ConstructionOrganizationPlanNetworkOutcomeProjection[]>
  engineEvidenceByPublicationKey: Map<string, ConstructionOrganizationPlanNetworkRuntimeEngineEvidenceProjection[]>
}) {
  const runtimeEvidence = [
    ...(input.observationsByPublicationKey.get(input.publicationKey) ?? []),
    ...(input.impactMonitoringByPublicationKey.get(input.publicationKey) ?? []),
    ...(input.rollbackExecutionByPublicationKey.get(input.publicationKey) ?? []),
    ...(input.outcomesByPublicationKey.get(input.publicationKey) ?? []),
    ...(input.engineEvidenceByPublicationKey.get(input.publicationKey) ?? []),
  ]
  return runtimeEvidence.some((item) => !normalizeText(item.businessType))
}

function buildConstructionOrganizationRecommendationKey(input: {
  optionId?: string | null
  draftNetworkKey?: string | null
  publicationKey?: string | null
  useCase?: ConstructionOrganizationPlanNetworkUseCaseKey | string | null
}) {
  const scopedIdentity = [
    normalizeText(input.publicationKey),
    normalizeText(input.draftNetworkKey),
    normalizeText(input.optionId),
    normalizeText(input.useCase),
  ].filter(Boolean).join(':')
  const identity = scopedIdentity
    || normalizeText(input.optionId)
    || normalizeText(input.draftNetworkKey)
    || normalizeText(input.publicationKey)
  return identity ? `${CONSTRUCTION_ORGANIZATION_PLAN_NETWORK_RUNTIME_ASSET_KEY}:${identity}` : null
}

function buildRecommendationKeysForDraft(
  item: ConstructionOrganizationPlanNetworkDraft,
  publication?: ConstructionOrganizationPlanNetworkRuntimePublicationProjection | null,
) {
  return [
    ...CONSTRUCTION_ORGANIZATION_PLAN_NETWORK_REQUIRED_USE_CASES.map((useCase) => buildConstructionOrganizationRecommendationKey({
      publicationKey: publication?.publicationKey,
      draftNetworkKey: item.draftNetworkKey,
      optionId: item.optionId,
      useCase,
    })),
    buildConstructionOrganizationRecommendationKey({ optionId: item.optionId }),
    buildConstructionOrganizationRecommendationKey({ draftNetworkKey: item.draftNetworkKey }),
    buildConstructionOrganizationRecommendationKey({ publicationKey: publication?.publicationKey }),
  ].filter((key): key is string => Boolean(key))
}

function buildPreciseRecommendationKeysForDraft(
  item: ConstructionOrganizationPlanNetworkDraft,
  publication?: ConstructionOrganizationPlanNetworkRuntimePublicationProjection | null,
) {
  return [
    ...CONSTRUCTION_ORGANIZATION_PLAN_NETWORK_REQUIRED_USE_CASES.map((useCase) => buildConstructionOrganizationRecommendationKey({
      publicationKey: publication?.publicationKey,
      draftNetworkKey: item.draftNetworkKey,
      optionId: item.optionId,
      useCase,
    })),
    buildConstructionOrganizationRecommendationKey({ draftNetworkKey: item.draftNetworkKey }),
    buildConstructionOrganizationRecommendationKey({ publicationKey: publication?.publicationKey }),
  ].filter((key): key is string => Boolean(key))
}

function indexRecommendationDecisions(
  decisions: ConstructionOrganizationPlanNetworkRecommendationDecisionProjection[],
  draftItems: Array<Pick<ConstructionOrganizationPlanNetworkDraft, 'projectId' | 'optionId' | 'draftNetworkKey'>> = [],
) {
  const byKey = new Map<string, ConstructionOrganizationPlanNetworkRecommendationDecisionProjection>()
  const byScopedKey = new Map<string, ConstructionOrganizationPlanNetworkRecommendationDecisionProjection>()
  const byOptionId = new Map<string, ConstructionOrganizationPlanNetworkRecommendationDecisionProjection>()
  const byScopedOptionId = new Map<string, ConstructionOrganizationPlanNetworkRecommendationDecisionProjection>()
  const byDraftNetworkKey = new Map<string, ConstructionOrganizationPlanNetworkRecommendationDecisionProjection>()
  const byScopedDraftNetworkKey = new Map<string, ConstructionOrganizationPlanNetworkRecommendationDecisionProjection>()
  const byPublicationKey = new Map<string, ConstructionOrganizationPlanNetworkRecommendationDecisionProjection>()
  const scoped = (projectId: string | null | undefined, key: string | null | undefined) => (
    projectId && key ? `${projectId}:${key}` : null
  )
  const draftNetworkKeysByOptionId = new Map<string, Set<string>>()
  const draftNetworkKeysByScopedOptionId = new Map<string, Set<string>>()
  for (const item of draftItems) {
    const optionId = normalizeText(item.optionId)
    const draftNetworkKey = normalizeText(item.draftNetworkKey)
    if (!optionId || !draftNetworkKey) continue
    const globalKeys = draftNetworkKeysByOptionId.get(optionId) ?? new Set<string>()
    globalKeys.add(draftNetworkKey)
    draftNetworkKeysByOptionId.set(optionId, globalKeys)
    const scopedOptionId = scoped(item.projectId, optionId)
    if (scopedOptionId) {
      const scopedKeys = draftNetworkKeysByScopedOptionId.get(scopedOptionId) ?? new Set<string>()
      scopedKeys.add(draftNetworkKey)
      draftNetworkKeysByScopedOptionId.set(scopedOptionId, scopedKeys)
    }
  }
  const canUseLegacyOptionFallback = (projectId: string | null | undefined, optionId: string | null | undefined) => {
    const optionText = normalizeText(optionId)
    if (!optionText) return false
    const scopedOptionId = scoped(projectId, optionText)
    const scopedDraftKeys = scopedOptionId ? draftNetworkKeysByScopedOptionId.get(scopedOptionId) : undefined
    if (scopedDraftKeys) return scopedDraftKeys.size === 1
    const globalDraftKeys = draftNetworkKeysByOptionId.get(optionText)
    return !globalDraftKeys || globalDraftKeys.size === 1
  }
  for (const decision of decisions) {
    if (!byKey.has(decision.recommendationKey)) byKey.set(decision.recommendationKey, decision)
    const scopedRecommendationKey = scoped(decision.projectId, decision.recommendationKey)
    if (scopedRecommendationKey && !byScopedKey.has(scopedRecommendationKey)) byScopedKey.set(scopedRecommendationKey, decision)
    if (decision.optionId && !byOptionId.has(decision.optionId)) byOptionId.set(decision.optionId, decision)
    const scopedOptionId = scoped(decision.projectId, decision.optionId)
    if (scopedOptionId && !byScopedOptionId.has(scopedOptionId)) byScopedOptionId.set(scopedOptionId, decision)
    if (decision.draftNetworkKey && !byDraftNetworkKey.has(decision.draftNetworkKey)) byDraftNetworkKey.set(decision.draftNetworkKey, decision)
    const scopedDraftNetworkKey = scoped(decision.projectId, decision.draftNetworkKey)
    if (scopedDraftNetworkKey && !byScopedDraftNetworkKey.has(scopedDraftNetworkKey)) byScopedDraftNetworkKey.set(scopedDraftNetworkKey, decision)
    if (decision.publicationKey && !byPublicationKey.has(decision.publicationKey)) byPublicationKey.set(decision.publicationKey, decision)
  }
  const findForDraft = (
    item: ConstructionOrganizationPlanNetworkDraft,
    publication?: ConstructionOrganizationPlanNetworkRuntimePublicationProjection | null,
  ) => {
    const projectId = publication?.projectId ?? item.projectId ?? null
    const scopedDraftNetworkKey = scoped(projectId, item.draftNetworkKey)
    const byExactScopedDraftNetworkKey = scopedDraftNetworkKey
      ? byScopedDraftNetworkKey.get(scopedDraftNetworkKey)
      : undefined
    if (byExactScopedDraftNetworkKey) return byExactScopedDraftNetworkKey
    const byExactDraftNetworkKey = byDraftNetworkKey.get(item.draftNetworkKey)
    if (byExactDraftNetworkKey) return byExactDraftNetworkKey
    if (publication?.publicationKey) {
      const byExactPublicationKey = byPublicationKey.get(publication.publicationKey)
      if (byExactPublicationKey) return byExactPublicationKey
    }

    const preciseKeys = buildPreciseRecommendationKeysForDraft(item, publication)
    for (const key of preciseKeys) {
      const byScopedRecommendationKey = scoped(projectId, key)
        ? byScopedKey.get(scoped(projectId, key) as string)
        : undefined
      if (byScopedRecommendationKey) return byScopedRecommendationKey
      const byRecommendationKey = byKey.get(key)
      if (byRecommendationKey) return byRecommendationKey
    }
    const optionKey = buildConstructionOrganizationRecommendationKey({ optionId: item.optionId })
    if (optionKey && canUseLegacyOptionFallback(projectId, item.optionId)) {
      const byScopedRecommendationKey = scoped(projectId, optionKey)
        ? byScopedKey.get(scoped(projectId, optionKey) as string)
        : undefined
      if (byScopedRecommendationKey) return byScopedRecommendationKey
      const byRecommendationKey = byKey.get(optionKey)
      if (byRecommendationKey) return byRecommendationKey
    }
    if (!canUseLegacyOptionFallback(projectId, item.optionId)) return null
    return (item.optionId ? byScopedOptionId.get(scoped(projectId, item.optionId) ?? '') : undefined)
      ?? (item.optionId ? byOptionId.get(item.optionId) : undefined)
      ?? null
  }
  return { findForDraft }
}

function runtimeDecisionMatchesDraft(
  item: ConstructionOrganizationPlanNetworkDraft,
  publication: ConstructionOrganizationPlanNetworkRuntimePublicationProjection | null | undefined,
  siteDecision: ConstructionOrganizationPlanNetworkRecommendationDecisionProjection | null | undefined,
) {
  if (!siteDecision) return null
  const draftBusinessType = normalizeText(item.businessType)
  const siteDecisionBusinessType = normalizeText(siteDecision.businessType)
  if (draftBusinessType && !siteDecisionBusinessType) return false
  if (draftBusinessType && siteDecisionBusinessType && draftBusinessType !== siteDecisionBusinessType) return false
  if (siteDecision.actionType !== 'adopted') return false
  if (isDecisionBeforeRuntimePublication(siteDecision, publication)) return false
  const decisionDraftNetworkKey = normalizeText(siteDecision.draftNetworkKey)
  const decisionOptionId = normalizeText(siteDecision.optionId)
  const decisionPublicationKey = normalizeText(siteDecision.publicationKey)
  const draftNetworkKey = normalizeText(item.draftNetworkKey)
  const optionId = normalizeText(item.optionId)
  const publicationKey = normalizeText(publication?.publicationKey)
  if (decisionDraftNetworkKey && decisionDraftNetworkKey !== draftNetworkKey) return false
  if (decisionOptionId && decisionOptionId !== optionId) return false
  if (decisionPublicationKey && decisionPublicationKey !== publicationKey) return false
  const recommendationKeyMatches = [
    ...CONSTRUCTION_ORGANIZATION_PLAN_NETWORK_REQUIRED_USE_CASES.map((useCase) => buildConstructionOrganizationRecommendationKey({
      publicationKey,
      draftNetworkKey,
      optionId,
      useCase,
    })),
    buildConstructionOrganizationRecommendationKey({ optionId }),
    buildConstructionOrganizationRecommendationKey({ draftNetworkKey }),
    buildConstructionOrganizationRecommendationKey({ publicationKey }),
  ].some((key) => key && key === siteDecision.recommendationKey)
  if (decisionDraftNetworkKey || decisionOptionId || decisionPublicationKey || recommendationKeyMatches) return true
  return siteDecision.actionType === 'adopted'
    && (
      Boolean(siteDecision.optionId && siteDecision.optionId === item.optionId)
      || siteDecision.recommendationKey === buildConstructionOrganizationRecommendationKey({ optionId: item.optionId })
    )
}

function isDecisionBeforeRuntimePublication(
  siteDecision: ConstructionOrganizationPlanNetworkRecommendationDecisionProjection | null | undefined,
  publication: ConstructionOrganizationPlanNetworkRuntimePublicationProjection | null | undefined,
) {
  const decidedAt = normalizeText(siteDecision?.decidedAt)
  const publishedAt = normalizeText(publication?.publishedAt)
  if (!decidedAt || !publishedAt) return false
  const decidedTime = parseRuntimeTimestamp(decidedAt)
  const publishedTime = parseRuntimeTimestamp(publishedAt)
  if (decidedTime == null || publishedTime == null) return false
  return decidedTime < publishedTime
}

function parseRuntimeTimestamp(value: string | null | undefined) {
  const normalized = normalizeText(value)
  if (!normalized) return null
  const timestamp = Date.parse(normalized)
  return Number.isFinite(timestamp) ? timestamp : null
}

function isRuntimeEvidenceBeforePublication(
  observedAt: string | null | undefined,
  publication: ConstructionOrganizationPlanNetworkRuntimePublicationProjection | null | undefined,
) {
  const evidenceTime = parseRuntimeTimestamp(observedAt)
  const publishedTime = parseRuntimeTimestamp(publication?.publishedAt)
  if (evidenceTime == null || publishedTime == null) return false
  return evidenceTime < publishedTime
}

function hasRuntimeEvidenceAfterPublication<T>(
  publication: ConstructionOrganizationPlanNetworkRuntimePublicationProjection | null | undefined,
  items: T[],
  readTimestamp: (item: T) => string | null | undefined,
) {
  if (!publication?.publicationKey) return false
  return items.some((item) => !isRuntimeEvidenceBeforePublication(readTimestamp(item), publication))
}

function hasRuntimeEvidenceBeforePublication<T>(
  publication: ConstructionOrganizationPlanNetworkRuntimePublicationProjection | null | undefined,
  items: T[],
  readTimestamp: (item: T) => string | null | undefined,
) {
  if (!publication?.publicationKey) return false
  return items.some((item) => isRuntimeEvidenceBeforePublication(readTimestamp(item), publication))
}

function collectRuntimeUseCasesAfterPublication<T>(
  publication: ConstructionOrganizationPlanNetworkRuntimePublicationProjection | null | undefined,
  items: T[],
  readUseCase: (item: T) => string | null | undefined,
  readTimestamp: (item: T) => string | null | undefined,
): ConstructionOrganizationPlanNetworkUseCaseKey[] {
  if (!publication?.publicationKey) return []
  return [...new Set(items
    .filter((item) => !isRuntimeEvidenceBeforePublication(readTimestamp(item), publication))
    .map((item) => normalizePlanNetworkUseCase(readUseCase(item)))
    .filter((item): item is ConstructionOrganizationPlanNetworkUseCaseKey => Boolean(item)))]
}

function filterRuntimeConsumerObservationsForDraft(
  item: ConstructionOrganizationPlanNetworkDraft,
  publication: ConstructionOrganizationPlanNetworkRuntimePublicationProjection | null | undefined,
  observationsByPublicationKey: Map<string, ConstructionOrganizationPlanNetworkRuntimeConsumerObservationProjection[]>,
) {
  if (!publication?.publicationKey) return []
  return filterRuntimeEvidenceForDraft(
    item,
    observationsByPublicationKey.get(publication.publicationKey) ?? [],
  )
}

function filterRuntimeEvidenceForDraft<
  T extends { projectId?: string | null; draftNetworkKey?: string | null; optionId?: string | null },
>(
  item: ConstructionOrganizationPlanNetworkDraft,
  evidence: T[],
) {
  const projectId = normalizeText(item.projectId)
  const draftNetworkKey = normalizeText(item.draftNetworkKey)
  const optionId = normalizeText(item.optionId)
  return evidence.filter((record) => {
    const evidenceProjectId = normalizeText(record.projectId)
    const evidenceDraftNetworkKey = normalizeText(record.draftNetworkKey)
    const evidenceOptionId = normalizeText(record.optionId)
    const draftNetworkKeyMatches = Boolean(draftNetworkKey && evidenceDraftNetworkKey === draftNetworkKey)
    const optionIdMatches = Boolean(optionId && evidenceOptionId === optionId)
    return Boolean(
      projectId
      && evidenceProjectId === projectId
      && (!evidenceDraftNetworkKey || draftNetworkKeyMatches)
      && (!evidenceOptionId || optionIdMatches)
      && (draftNetworkKeyMatches || optionIdMatches),
    )
  })
}

function hasAllRuntimeEnginesAfterPublication(
  publication: ConstructionOrganizationPlanNetworkRuntimePublicationProjection | null | undefined,
  evidence: ConstructionOrganizationPlanNetworkRuntimeEngineEvidenceProjection[],
) {
  if (!publication?.publicationKey) return false
  const postPublicationEngineCodes = new Set(
    evidence
      .filter((item) => !isRuntimeEvidenceBeforePublication(item.backtestedAt, publication))
      .map((item) => item.engineCode),
  )
  return CONSTRUCTION_ORGANIZATION_PLAN_NETWORK_REQUIRED_ENGINE_CODES.every((engineCode) =>
    postPublicationEngineCodes.has(engineCode),
  )
}

function hasRuntimeEvidenceAfterPublicationForUseCase<T>(
  publication: ConstructionOrganizationPlanNetworkRuntimePublicationProjection | null | undefined,
  useCase: ConstructionOrganizationPlanNetworkUseCaseKey,
  items: T[],
  readUseCase: (item: T) => string | null | undefined,
  readTimestamp: (item: T) => string | null | undefined,
) {
  if (!publication?.publicationKey) return false
  return items.some((item) =>
    normalizePlanNetworkUseCase(readUseCase(item)) === useCase
    && !isRuntimeEvidenceBeforePublication(readTimestamp(item), publication),
  )
}

function hasAllRuntimeEnginesAfterPublicationForUseCase(
  publication: ConstructionOrganizationPlanNetworkRuntimePublicationProjection | null | undefined,
  useCase: ConstructionOrganizationPlanNetworkUseCaseKey,
  evidence: ConstructionOrganizationPlanNetworkRuntimeEngineEvidenceProjection[],
) {
  if (!publication?.publicationKey) return false
  const postPublicationEngineCodes = new Set(
    evidence
      .filter((item) =>
        normalizePlanNetworkUseCase(item.useCase) === useCase
        && !isRuntimeEvidenceBeforePublication(item.backtestedAt, publication),
      )
      .map((item) => item.engineCode),
  )
  return CONSTRUCTION_ORGANIZATION_PLAN_NETWORK_REQUIRED_ENGINE_CODES.every((engineCode) =>
    postPublicationEngineCodes.has(engineCode),
  )
}

function buildRuntimeUseCaseCoverage(input: {
  publication: ConstructionOrganizationPlanNetworkRuntimePublicationProjection | null | undefined
  runtimeConsumerObservations: ConstructionOrganizationPlanNetworkRuntimeConsumerObservationProjection[]
  impactMonitoringResults: ConstructionOrganizationPlanNetworkRuntimeEventProjection[]
  rollbackExecutionVerifications: ConstructionOrganizationPlanNetworkRuntimeEventProjection[]
  savedNetworkOutcomes: ConstructionOrganizationPlanNetworkOutcomeProjection[]
  runtimeEngineEvidence: ConstructionOrganizationPlanNetworkRuntimeEngineEvidenceProjection[]
}): ConstructionOrganizationPlanNetworkOptionRuntimeMaterializationEvidence['runtimeUseCaseCoverage'] {
  return Object.fromEntries(CONSTRUCTION_ORGANIZATION_PLAN_NETWORK_REQUIRED_USE_CASES.map((useCase) => {
    const hasRuntimeConsumerObservation = hasRuntimeEvidenceAfterPublicationForUseCase(
      input.publication,
      useCase,
      input.runtimeConsumerObservations,
      (evidence) => evidence.useCase,
      (evidence) => evidence.observedAt,
    )
    const hasImpactMonitoringResult = hasRuntimeEvidenceAfterPublicationForUseCase(
      input.publication,
      useCase,
      input.impactMonitoringResults,
      (evidence) => evidence.useCase,
      (evidence) => evidence.executedAt,
    )
    const hasRollbackExecutionVerification = hasRuntimeEvidenceAfterPublicationForUseCase(
      input.publication,
      useCase,
      input.rollbackExecutionVerifications,
      (evidence) => evidence.useCase,
      (evidence) => evidence.executedAt,
    )
    const hasSavedNetworkOutcome = hasRuntimeEvidenceAfterPublicationForUseCase(
      input.publication,
      useCase,
      input.savedNetworkOutcomes,
      (evidence) => evidence.useCase,
      (evidence) => evidence.observedAt,
    )
    const hasRuntimeEngineEvidence = hasAllRuntimeEnginesAfterPublicationForUseCase(
      input.publication,
      useCase,
      input.runtimeEngineEvidence,
    )
    return [useCase, {
      hasRuntimeConsumerObservation,
      hasImpactMonitoringResult,
      hasRollbackExecutionVerification,
      hasSavedNetworkOutcome,
      hasRuntimeEngineEvidence,
      canClaimRuntimeUseCaseEvidence: hasRuntimeConsumerObservation
        && hasImpactMonitoringResult
        && hasRollbackExecutionVerification
        && hasSavedNetworkOutcome
        && hasRuntimeEngineEvidence,
    }]
  })) as ConstructionOrganizationPlanNetworkOptionRuntimeMaterializationEvidence['runtimeUseCaseCoverage']
}

function buildRuntimeEvidenceIndexes(params: {
  runtimePublications: ConstructionOrganizationPlanNetworkRuntimePublicationProjection[]
  runtimeConsumerObservations: ConstructionOrganizationPlanNetworkRuntimeConsumerObservationProjection[]
  runtimeEvents: ConstructionOrganizationPlanNetworkRuntimeEventProjection[]
  planNetworkOutcomes: ConstructionOrganizationPlanNetworkOutcomeProjection[]
  runtimeEngineEvidence: ConstructionOrganizationPlanNetworkRuntimeEngineEvidenceProjection[]
}) {
  const { publicationByDraftKey, publicationByReleaseHandoffEventId } = indexRuntimePublications(params.runtimePublications)
  const { observationsByPublicationKey } = indexRuntimeConsumerObservations(params.runtimeConsumerObservations)
  const { impactMonitoringByPublicationKey, rollbackExecutionByPublicationKey } = indexRuntimeEvents(params.runtimeEvents)
  const { outcomesByPublicationKey } = indexPlanNetworkOutcomes(params.planNetworkOutcomes)
  const { engineCodesByPublicationKey, hasAllRequiredEngines } = indexRuntimeEngineEvidence(params.runtimeEngineEvidence)
  const engineEvidenceByPublicationKey = new Map<string, ConstructionOrganizationPlanNetworkRuntimeEngineEvidenceProjection[]>()
  for (const evidence of params.runtimeEngineEvidence) {
    const existing = engineEvidenceByPublicationKey.get(evidence.publicationKey) ?? []
    existing.push(evidence)
    engineEvidenceByPublicationKey.set(evidence.publicationKey, existing)
  }
  return {
    publicationByDraftKey,
    publicationByReleaseHandoffEventId,
    observationsByPublicationKey,
    impactMonitoringByPublicationKey,
    rollbackExecutionByPublicationKey,
    outcomesByPublicationKey,
    engineCodesByPublicationKey,
    engineEvidenceByPublicationKey,
    hasAllRequiredEngines,
  }
}

type ConstructionOrganizationPlanNetworkRuntimeEvidenceIndexes = ReturnType<typeof buildRuntimeEvidenceIndexes>

function filterByPublicationKeys<T>(
  items: T[],
  publicationKeys: Set<string>,
  readPublicationKey: (item: T) => string | null | undefined,
) {
  return items.filter((item) => {
    const publicationKey = readPublicationKey(item)
    return Boolean(publicationKey && publicationKeys.has(publicationKey))
  })
}

function findRuntimePublicationForDraft(
  item: ConstructionOrganizationPlanNetworkDraft,
  indexes: ConstructionOrganizationPlanNetworkRuntimeEvidenceIndexes,
) {
  const releaseHandoffCandidateEventId = item.releaseExitHandoff?.candidateEventId
  const byDraftKey = indexes.publicationByDraftKey.get(item.draftNetworkKey)
  if (runtimePublicationMatchesDraft(item, byDraftKey)) return byDraftKey
  const byReleaseHandoff = releaseHandoffCandidateEventId
      ? indexes.publicationByReleaseHandoffEventId.get(releaseHandoffCandidateEventId)
      : undefined
  return runtimePublicationMatchesDraft(item, byReleaseHandoff) ? byReleaseHandoff : undefined
}

function buildOptionRuntimeMaterializationEvidence(
  item: ConstructionOrganizationPlanNetworkDraft,
  indexes: ConstructionOrganizationPlanNetworkRuntimeEvidenceIndexes,
): ConstructionOrganizationPlanNetworkOptionRuntimeMaterializationEvidence {
  const publication = findRuntimePublicationForDraft(item, indexes)
  const publicationKey = publication?.publicationKey ?? null
  const hasReleaseExitHandoff = Boolean(item.releaseExitHandoff)
  const hasRuntimePublication = Boolean(publicationKey)
  const runtimeConsumerObservations = filterRuntimeConsumerObservationsForDraft(
    item,
    publication,
    indexes.observationsByPublicationKey,
  )
  const impactMonitoringResults = publicationKey
    ? filterRuntimeEvidenceForDraft(item, indexes.impactMonitoringByPublicationKey.get(publicationKey) ?? [])
    : []
  const rollbackExecutionVerifications = publicationKey
    ? filterRuntimeEvidenceForDraft(item, indexes.rollbackExecutionByPublicationKey.get(publicationKey) ?? [])
    : []
  const savedNetworkOutcomes = publicationKey
    ? filterRuntimeEvidenceForDraft(item, indexes.outcomesByPublicationKey.get(publicationKey) ?? [])
    : []
  const runtimeEngineEvidence = publicationKey
    ? filterRuntimeEvidenceForDraft(item, indexes.engineEvidenceByPublicationKey.get(publicationKey) ?? [])
    : []
  const hasRuntimeConsumerObservation = hasRuntimeEvidenceAfterPublication(
    publication,
    runtimeConsumerObservations,
    (evidence) => evidence.observedAt,
  )
  const hasImpactMonitoringResult = hasRuntimeEvidenceAfterPublication(
    publication,
    impactMonitoringResults,
    (evidence) => evidence.executedAt,
  )
  const hasRollbackExecutionVerification = hasRuntimeEvidenceAfterPublication(
    publication,
    rollbackExecutionVerifications,
    (evidence) => evidence.executedAt,
  )
  const hasSavedNetworkOutcome = hasRuntimeEvidenceAfterPublication(
    publication,
    savedNetworkOutcomes,
    (evidence) => evidence.observedAt,
  )
  const hasRuntimeEngineEvidence = hasAllRuntimeEnginesAfterPublication(publication, runtimeEngineEvidence)
  const hasPrePublicationRuntimeConsumerObservation = hasRuntimeEvidenceBeforePublication(
    publication,
    runtimeConsumerObservations,
    (evidence) => evidence.observedAt,
  )
  const hasPrePublicationImpactMonitoringResult = hasRuntimeEvidenceBeforePublication(
    publication,
    impactMonitoringResults,
    (evidence) => evidence.executedAt,
  )
  const hasPrePublicationRollbackExecutionVerification = hasRuntimeEvidenceBeforePublication(
    publication,
    rollbackExecutionVerifications,
    (evidence) => evidence.executedAt,
  )
  const hasPrePublicationSavedNetworkOutcome = hasRuntimeEvidenceBeforePublication(
    publication,
    savedNetworkOutcomes,
    (evidence) => evidence.observedAt,
  )
  const hasPrePublicationRuntimeEngineEvidence = hasRuntimeEvidenceBeforePublication(
    publication,
    runtimeEngineEvidence,
    (evidence) => evidence.backtestedAt,
  )
  const runtimeUseCaseCoverage = buildRuntimeUseCaseCoverage({
    publication,
    runtimeConsumerObservations,
    impactMonitoringResults,
    rollbackExecutionVerifications,
    savedNetworkOutcomes,
    runtimeEngineEvidence,
  })
  const runtimeUseCases = Object.entries(runtimeUseCaseCoverage)
    .filter(([, coverage]) => coverage.canClaimRuntimeUseCaseEvidence)
    .map(([useCase]) => useCase as ConstructionOrganizationPlanNetworkUseCaseKey)
  const draftBusinessType = normalizeText(item.businessType)
  const runtimeBusinessTypeConflicts = publicationKey && draftBusinessType
      ? [...new Set(collectRuntimeBusinessTypesForPublication({
        publicationKey,
        observationsByPublicationKey: indexes.observationsByPublicationKey,
        impactMonitoringByPublicationKey: indexes.impactMonitoringByPublicationKey,
        rollbackExecutionByPublicationKey: indexes.rollbackExecutionByPublicationKey,
        outcomesByPublicationKey: indexes.outcomesByPublicationKey,
        engineEvidenceByPublicationKey: indexes.engineEvidenceByPublicationKey,
      }).filter((businessType) => businessType !== draftBusinessType))]
    : []
  const hasRuntimeBusinessTypeAttributionGap = Boolean(publicationKey && draftBusinessType)
    && hasMissingRuntimeBusinessTypeAttribution({
      publicationKey: publicationKey as string,
      observationsByPublicationKey: indexes.observationsByPublicationKey,
      impactMonitoringByPublicationKey: indexes.impactMonitoringByPublicationKey,
      rollbackExecutionByPublicationKey: indexes.rollbackExecutionByPublicationKey,
      outcomesByPublicationKey: indexes.outcomesByPublicationKey,
      engineEvidenceByPublicationKey: indexes.engineEvidenceByPublicationKey,
    })
  const missingBeforeRuntime = [
    hasReleaseExitHandoff ? null : 'release_exit_handoff_candidate_event_required',
    hasRuntimePublication ? null : 'domain_writer_runtime_execution_required',
    hasRuntimeConsumerObservation ? null : 'runtime_consumer_observation_required',
    hasImpactMonitoringResult ? null : 'post_materialization_impact_monitoring_result_required',
    hasRuntimePublication ? null : 'runtime_release_record_persistence_required',
    hasRollbackExecutionVerification ? null : 'rollback_execution_verification_required',
    hasSavedNetworkOutcome ? null : 'saved_network_outcome_required',
    hasRuntimeEngineEvidence ? null : 'true_per_option_runtime_e1_e3_e5_evidence_required',
    hasPrePublicationRuntimeConsumerObservation ? 'runtime_consumer_observation_before_publication' : null,
    hasPrePublicationImpactMonitoringResult ? 'post_materialization_impact_monitoring_before_publication' : null,
    hasPrePublicationRollbackExecutionVerification ? 'rollback_execution_before_publication' : null,
    hasPrePublicationSavedNetworkOutcome ? 'saved_network_outcome_before_publication' : null,
    hasPrePublicationRuntimeEngineEvidence ? 'runtime_engine_evidence_before_publication' : null,
    hasRuntimeBusinessTypeAttributionGap ? 'runtime_business_type_attribution_required' : null,
    ...runtimeBusinessTypeConflicts.map((businessType) => `runtime_business_type_conflict:${businessType}`),
  ].filter((reason): reason is string => Boolean(reason))
  const canClaimRuntimeMaterializationEvidence = missingBeforeRuntime.length === 0

  return {
    source: 'construction_organization_plan_network_option_runtime_materialization_evidence',
    status: canClaimRuntimeMaterializationEvidence ? 'runtime_evidence_ready' : 'missing_runtime_evidence',
    publicationKey,
    runtimeUseCases,
    runtimeUseCaseCoverage,
    missingBeforeRuntime,
    hasReleaseExitHandoff,
    hasRuntimePublication,
    hasRuntimeConsumerObservation,
    hasImpactMonitoringResult,
    hasRollbackExecutionVerification,
    hasSavedNetworkOutcome,
    hasRuntimeEngineEvidence,
    canClaimRuntimeMaterializationEvidence,
    boundaryPolicy: [
      'option_runtime_materialization_evidence_is_read_only',
      'does_not_write_task_dependencies_or_plan_dates',
      'does_not_grant_runtime_materialization',
    ],
  }
}

function buildMissingRuntimeEngineEvidenceSummary(): ConstructionOrganizationPlanNetworkRuntimeEngineEvidenceSummary {
  return {
    source: 'construction_organization_plan_network_runtime_engine_evidence_summary',
    status: 'missing_runtime_engine_evidence',
    publicationKey: null,
    presentEngineCodes: [],
    missingEngineCodes: CONSTRUCTION_ORGANIZATION_PLAN_NETWORK_REQUIRED_ENGINE_CODES
      .map((engineCode) => CONSTRUCTION_ORGANIZATION_PLAN_NETWORK_ENGINE_LABELS[engineCode]),
    evidenceCount: 0,
    canClaimTruePerOptionRuntimeEvaluation: false,
    boundaryPolicy: [
      'runtime_engine_evidence_is_read_only',
      'e1_e3_e5_required_before_true_per_option_runtime_claim',
      'does_not_write_task_dependencies_or_plan_dates',
    ],
  }
}

function buildReleaseExitAssessment(
  draft: Pick<ConstructionOrganizationPlanNetworkDraft, 'draftNetworkKey'>,
  handoff?: ConstructionOrganizationPlanNetworkManualReviewHandoffProjection | null,
  approval?: ConstructionOrganizationPlanNetworkManualReviewApprovalProjection | null,
): ConstructionOrganizationPlanNetworkReleaseExitAssessment {
  const hasHandoff = Boolean(handoff?.candidateEventId)
  const hasApproval = Boolean(approval?.candidateEventId)
  const requiredBeforeRuntime = (hasHandoff
    ? [
        hasApproval ? null : 'manual_review_approval_required',
        'domain_writer_release_exit_required',
        'runtime_consumer_verification_required',
        'impact_monitoring_required',
        'release_record_required',
        'rollback_target_required',
      ]
    : [
        'manual_review_handoff_required',
        'domain_writer_release_exit_required',
        'runtime_consumer_verification_required',
        'impact_monitoring_required',
        'release_record_required',
        'rollback_target_required',
      ]).filter((item): item is string => Boolean(item))

  return {
    source: 'construction_organization_plan_network_release_exit_assessment',
    status: hasHandoff ? 'release_exit_blocked' : 'manual_review_handoff_required',
    canMaterializeRuntime: false,
    draftNetworkKey: draft.draftNetworkKey,
    handoffCandidateEventId: handoff?.candidateEventId ?? null,
    approvalCandidateEventId: approval?.candidateEventId ?? null,
    requiredBeforeRuntime,
    reasons: requiredBeforeRuntime,
    writesTaskDependencies: false,
    writesPlanDates: false,
    writesSeed: false,
    writesBaseline: false,
    writesCriticalPathFacts: false,
    writesAccelerationDraft: false,
    boundaryPolicy: [
      'release_exit_assessment_is_read_only',
      'manual_review_handoff_is_not_runtime_approval',
      'runtime_materialization_requires_explicit_domain_writer',
      'runtime_materialization_requires_consumer_verification_monitoring_and_rollback',
      'does_not_write_task_dependencies_or_plan_dates',
    ],
  }
}

function buildReleaseExitPreparation(
  draft: ConstructionOrganizationPlanNetworkDraft,
  handoff: ConstructionOrganizationPlanNetworkManualReviewHandoffProjection | null,
  approval: ConstructionOrganizationPlanNetworkManualReviewApprovalProjection | null,
  assessment: ConstructionOrganizationPlanNetworkReleaseExitAssessment,
): ConstructionOrganizationPlanNetworkReleaseExitPreparation | null {
  if (!handoff?.candidateEventId || !approval?.candidateEventId) return null
  return {
    source: 'construction_organization_plan_network_release_exit_preparation',
    status: 'ready_for_domain_writer_release_exit_package',
    canMaterializeRuntime: false,
    draftNetworkKey: draft.draftNetworkKey,
    candidateEventId: draft.candidateEventId,
    handoffCandidateEventId: handoff.candidateEventId,
    approvalCandidateEventId: approval.candidateEventId,
    optionId: draft.optionId,
    selectedScenarioIds: draft.selectedScenarioIds,
    domainWriterKey: 'constructionOrganizationPlanNetworkDomainWriter.applyApprovedDraft',
    proposedDependencyEdgeCount: draft.edgeCount,
    nodeCount: draft.nodeCount,
    edgeCount: draft.edgeCount,
    proposedDependencyEdges: draft.edges,
    evaluationEvidence: draft.evaluationEvidence,
    useCaseEvaluationEvidence: draft.useCaseEvaluationEvidence,
    requiredBeforeRuntime: assessment.requiredBeforeRuntime,
    packageArtifacts: [
      'approved_plan_network_draft',
      'manual_review_handoff_event',
      'manual_review_approval_event',
      'proposed_dependency_edges',
      'e1_generated_row_reference_duration_evidence',
      'e3_generated_row_candidate_network_evidence',
      'e5_acceleration_recovery_evidence',
    ],
    mutationBoundary: {
      writesTaskDependencies: false,
      writesPlanDates: false,
      writesSeed: false,
      writesBaseline: false,
      writesCriticalPathFacts: false,
      writesAccelerationDraft: false,
    },
    boundaryPolicy: [
      'release_exit_preparation_is_candidate_only',
      'approved_manual_review_does_not_materialize_runtime',
      'domain_writer_release_exit_required_before_any_dependency_write',
      'consumer_verification_monitoring_release_record_and_rollback_required_before_runtime',
      'does_not_write_task_dependencies_or_plan_dates',
    ],
  }
}

function buildDomainWriterReleaseExitReadiness(
  preparation: ConstructionOrganizationPlanNetworkReleaseExitPreparation | null,
): ConstructionOrganizationPlanNetworkDomainWriterReleaseExitReadiness | null {
  if (!preparation) return null
  return {
    source: 'construction_organization_plan_network_domain_writer_release_exit_readiness',
    status: 'blocked_pending_release_exit_evidence',
    canMaterializeRuntime: false,
    draftNetworkKey: preparation.draftNetworkKey,
    candidateEventId: preparation.candidateEventId,
    handoffCandidateEventId: preparation.handoffCandidateEventId,
    approvalCandidateEventId: preparation.approvalCandidateEventId,
    optionId: preparation.optionId,
    selectedScenarioIds: preparation.selectedScenarioIds,
    domainWriterKey: preparation.domainWriterKey,
    releaseExitPreparationStatus: preparation.status,
    proposedDependencyEdgeCount: preparation.proposedDependencyEdgeCount,
    nodeCount: preparation.nodeCount,
    edgeCount: preparation.edgeCount,
    requiredEvidenceBeforeDomainWriter: [
      'domain_writer_release_exit_evidence_required',
      'runtime_consumer_verification_ref_required',
      'impact_monitoring_ref_required',
      'release_record_target_required',
      'rollback_target_required',
    ],
    packageArtifacts: preparation.packageArtifacts,
    mutationBoundary: {
      writesTaskDependencies: false,
      writesPlanDates: false,
      writesSeed: false,
      writesBaseline: false,
      writesCriticalPathFacts: false,
      writesAccelerationDraft: false,
    },
    boundaryPolicy: [
      'domain_writer_release_exit_readiness_is_read_only',
      'approved_preparation_package_is_not_runtime_materialization',
      'domain_writer_execution_requires_release_exit_evidence_consumer_verification_monitoring_release_record_and_rollback',
      'does_not_write_task_dependencies_or_plan_dates',
    ],
  }
}

function readNestedRecord(source: Record<string, unknown>, key: string) {
  return readRecord(source[key])
}

function buildUseCaseEvidence(
  source: Record<string, unknown>,
): ConstructionOrganizationPlanNetworkDraftUseCaseEvidence {
  if (Object.keys(source).length === 0) return null
  return {
    source: 'construction_organization_plan_network_draft_use_case_evaluation',
    useCase: normalizeText(source.useCase),
    optionScore: readNumber(source.optionScore),
    actionability: normalizeText(source.actionability),
    rankBasis: readStringArray(source.rankBasis),
    recoveryFactorHint: readNumber(source.recoveryFactorHint),
    e5RecoverableSpanDays: readNumber(source.e5RecoverableSpanDays),
    writesTaskDependencies: false,
    writesPlanDates: false,
    writesSeed: false,
  }
}

function buildUseCaseEvaluationEvidence(item: ConstructionOrganizationMaterializationReviewPackageItem) {
  return {
    newProjectPlanning: buildUseCaseEvidence(readNestedRecord(item.useCaseEvaluations, 'newProjectPlanning')),
    startingLineOnboarding: buildUseCaseEvidence(readNestedRecord(item.useCaseEvaluations, 'startingLineOnboarding')),
    accelerationRecovery: buildUseCaseEvidence(readNestedRecord(item.useCaseEvaluations, 'accelerationRecovery')),
  }
}

function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableSerialize(record[key])}`).join(',')}}`
  }
  return JSON.stringify(value)
}

function hashDraftKey(value: unknown) {
  return `sha256:${createHash('sha256').update(stableSerialize(value)).digest('hex')}`
}

function buildDraftEdge(rawEdge: unknown, index: number): ConstructionOrganizationPlanNetworkDraftEdge | null {
  const edge = readRecord(rawEdge)
  const fromGeneratedRowId = normalizeText(
    edge.fromGeneratedRowId
      ?? edge.from_generated_row_id
      ?? readStringArray(edge.fromGeneratedRowIds ?? edge.from_generated_row_ids)[0],
  )
  const toGeneratedRowId = normalizeText(
    edge.toGeneratedRowId
      ?? edge.to_generated_row_id
      ?? readStringArray(edge.toGeneratedRowIds ?? edge.to_generated_row_ids)[0],
  )
  if (!fromGeneratedRowId || !toGeneratedRowId || fromGeneratedRowId === toGeneratedRowId) return null

  const dependencyType = normalizeDependencyType(edge.dependencyType ?? edge.dependency_type)
  const lagDays = normalizeLagDays(edge.lagDays ?? edge.lag_days)
  const intent = normalizeText(edge.intent)
  const fromVirtualNodeId = normalizeText(edge.fromVirtualNodeId ?? edge.from_virtual_node_id)
  const toVirtualNodeId = normalizeText(edge.toVirtualNodeId ?? edge.to_virtual_node_id)
  const edgeKey = [
    fromGeneratedRowId,
    toGeneratedRowId,
    dependencyType,
    lagDays,
    intent ?? '',
    fromVirtualNodeId ?? '',
    toVirtualNodeId ?? '',
    index,
  ]

  return {
    edgeId: hashDraftKey(edgeKey),
    fromGeneratedRowId,
    toGeneratedRowId,
    dependencyType,
    lagDays,
    intent,
    fromVirtualNodeId,
    toVirtualNodeId,
    operation: 'propose_create_dependency',
    writesTaskDependencies: false,
  }
}

function buildManualConflictEvidence(rawEvidence: unknown, index: number): ConstructionOrganizationPlanNetworkManualConflictEvidence | null {
  const evidence = readRecord(rawEvidence)
  const fromGeneratedRowId = normalizeText(evidence.fromGeneratedRowId ?? evidence.from_generated_row_id)
  const toGeneratedRowId = normalizeText(evidence.toGeneratedRowId ?? evidence.to_generated_row_id)
  const reason = normalizeText(evidence.reason)
  if (!fromGeneratedRowId || !toGeneratedRowId || !reason) return null
  const fromWindow = readRecord(evidence.fromWindow ?? evidence.from_window)
  const toWindow = readRecord(evidence.toWindow ?? evidence.to_window)
  const edgeId = normalizeText(evidence.edgeId ?? evidence.edge_id)

  return {
    edgeId: edgeId ?? hashDraftKey([
      'manual_conflict_evidence',
      fromGeneratedRowId,
      toGeneratedRowId,
      evidence.dependencyType ?? evidence.dependency_type,
      evidence.lagDays ?? evidence.lag_days,
      evidence.intent,
      reason,
      index,
    ]),
    fromGeneratedRowId,
    toGeneratedRowId,
    dependencyType: normalizeDependencyType(evidence.dependencyType ?? evidence.dependency_type),
    lagDays: normalizeLagDays(evidence.lagDays ?? evidence.lag_days),
    intent: normalizeText(evidence.intent),
    fromVirtualNodeId: normalizeText(evidence.fromVirtualNodeId ?? evidence.from_virtual_node_id),
    toVirtualNodeId: normalizeText(evidence.toVirtualNodeId ?? evidence.to_virtual_node_id),
    reason,
    fromWindow: {
      startDay: readNumber(fromWindow.startDay ?? fromWindow.start_day),
      finishDay: readNumber(fromWindow.finishDay ?? fromWindow.finish_day),
      plannedStartDate: normalizeText(fromWindow.plannedStartDate ?? fromWindow.planned_start_date),
      plannedEndDate: normalizeText(fromWindow.plannedEndDate ?? fromWindow.planned_end_date),
    },
    toWindow: {
      startDay: readNumber(toWindow.startDay ?? toWindow.start_day),
      finishDay: readNumber(toWindow.finishDay ?? toWindow.finish_day),
      plannedStartDate: normalizeText(toWindow.plannedStartDate ?? toWindow.planned_start_date),
      plannedEndDate: normalizeText(toWindow.plannedEndDate ?? toWindow.planned_end_date),
    },
    writesTaskDependencies: false,
    writesPlanDates: false,
  }
}

function buildDraftNodes(edges: ConstructionOrganizationPlanNetworkDraftEdge[]) {
  const nodeById = new Map<string, ConstructionOrganizationPlanNetworkDraftNode>()
  const ensureNode = (generatedRowId: string) => {
    const existing = nodeById.get(generatedRowId)
    if (existing) return existing
    const node: ConstructionOrganizationPlanNetworkDraftNode = {
      generatedRowId,
      virtualNodeIds: [],
      roles: [],
    }
    nodeById.set(generatedRowId, node)
    return node
  }

  for (const edge of edges) {
    const fromNode = ensureNode(edge.fromGeneratedRowId)
    if (edge.fromVirtualNodeId) fromNode.virtualNodeIds.push(edge.fromVirtualNodeId)
    fromNode.roles.push('from')

    const toNode = ensureNode(edge.toGeneratedRowId)
    if (edge.toVirtualNodeId) toNode.virtualNodeIds.push(edge.toVirtualNodeId)
    toNode.roles.push('to')
  }

  return [...nodeById.values()]
    .map((node) => ({
      ...node,
      virtualNodeIds: [...new Set(node.virtualNodeIds)].sort(),
      roles: [...new Set(node.roles)].sort() as Array<'from' | 'to'>,
    }))
    .sort((left, right) => left.generatedRowId.localeCompare(right.generatedRowId))
}

const DEFAULT_MASTER_PLAN_SOURCE_LABELS = new Set([
  'residential_master_plan_v2',
  'managed_frontier_default_master_plan',
])

export type DefaultMasterPlanDependencyWriterTaskMapping = {
  generatedRowId: string
  taskId: string
  baselineItemId: string
}

export type BuildDefaultMasterPlanDependencyWriterDraftInput = {
  baseline?: TaskBaseline | null
  items?: TaskBaselineItem[] | null
  handoffCandidateEventId?: string | null
  approvalCandidateEventId?: string | null
  releaseHandoffCandidateEventId?: string | null
  releaseRecordTarget?: string | null
  rollbackTarget?: string | null
  requestedByUserId?: string | null
  executedAt?: string | null
  consumerVerificationRefs?: string[]
  impactMonitoringRefs?: string[]
  rollbackWriterRefs?: string[]
}

export type DefaultMasterPlanDependencyWriterDraftResult = {
  source: 'default_master_plan_dependency_writer_handoff'
  status: 'domain_writer_draft_ready' | 'domain_writer_draft_blocked'
  canMaterializeRuntime: false
  domainWriterKey: 'constructionOrganizationPlanNetworkDomainWriter.applyApprovedDraft'
  baselineId: string | null
  projectId: string | null
  businessType: string | null
  dependencyIntentCount: number
  mappedDependencyIntentCount: number
  taskMappings: DefaultMasterPlanDependencyWriterTaskMapping[]
  missingRequirements: string[]
  draft: ConstructionOrganizationPlanNetworkDraft | null
  writesTaskDependencies: false
  writesPlanDates: false
  writesSeed: false
  writesBaseline: false
  writesCriticalPathFacts: false
  boundaryPolicy: string[]
}

function defaultMasterPlanBoundaryPolicy() {
  return [
    'default_master_plan_dependency_handoff_is_candidate_to_domain_writer_bridge',
    'handoff_does_not_write_task_dependencies',
    'handoff_requires_generated_plan_baseline_and_runtime_task_mapping',
    'domain_writer_execution_is_separate_and_required_before_production_dependency_gate',
    'runtime_publication_smoke_and_rollback_remain_separate_gates',
  ]
}

function readDefaultMasterPlanBoolean(value: unknown) {
  return value === true || String(value ?? '').trim().toLowerCase() === 'true'
}

function normalizeLowerText(value: unknown) {
  return String(value ?? '').trim().toLowerCase()
}

function readBaselineItemMetadata(item: TaskBaselineItem) {
  return readRecord(item.generation_metadata)
}

function readBaselineItemDurationSuggestion(item: TaskBaselineItem) {
  const metadata = readBaselineItemMetadata(item)
  return readRecord(metadata.durationSuggestion ?? metadata.duration_suggestion)
}

function readDefaultMasterPlanGeneratedRowId(item: TaskBaselineItem) {
  const metadata = readBaselineItemMetadata(item)
  return normalizeText(
    metadata.clientRowId
      ?? metadata.client_row_id
      ?? metadata.rowCarrierClientRowId
      ?? metadata.row_carrier_client_row_id
      ?? item.id,
  )
}

function isDefaultMasterPlanBaselineItem(item: TaskBaselineItem) {
  const metadata = readBaselineItemMetadata(item)
  const durationSuggestion = readBaselineItemDurationSuggestion(item)
  const source = normalizeLowerText(metadata.source ?? metadata.source_type)
  const dataUpgradeBlockers = readStringArray(durationSuggestion.dataUpgradeBlockedBy ?? durationSuggestion.data_upgrade_blocked_by)
    .map((code) => code.toLowerCase())

  return DEFAULT_MASTER_PLAN_SOURCE_LABELS.has(source)
    || readDefaultMasterPlanBoolean(metadata.candidate_default_master_plan_baseline ?? metadata.candidateDefaultMasterPlanBaseline)
    || (
      readDefaultMasterPlanBoolean(metadata.candidateOnly ?? metadata.candidate_only)
      && normalizeLowerText(durationSuggestion.planDurationTruthSource ?? durationSuggestion.plan_duration_truth_source) === 'candidate_default_master_plan_baseline'
    )
    || dataUpgradeBlockers.includes('generation_depth_trust_review_required')
}

function isDefaultMasterPlanBaseline(input: {
  baseline?: TaskBaseline | null
  items: TaskBaselineItem[]
}) {
  const sourceVersionLabel = normalizeLowerText(input.baseline?.source_version_label)
  return DEFAULT_MASTER_PLAN_SOURCE_LABELS.has(sourceVersionLabel)
    || input.items.some(isDefaultMasterPlanBaselineItem)
}

function readDefaultMasterPlanBusinessType(input: {
  baseline?: TaskBaseline | null
  items: TaskBaselineItem[]
}) {
  for (const item of input.items) {
    const metadata = readBaselineItemMetadata(item)
    const businessType = normalizeText(metadata.businessType ?? metadata.business_type)
    if (businessType) return businessType
  }
  const sourceVersionLabel = normalizeLowerText(input.baseline?.source_version_label)
  if (sourceVersionLabel === 'residential_master_plan_v2') return 'general_civil_residential'
  return null
}

function buildDefaultMasterPlanTaskMappings(items: TaskBaselineItem[]) {
  return items
    .map((item) => ({
      generatedRowId: readDefaultMasterPlanGeneratedRowId(item),
      taskId: normalizeText(item.source_task_id),
      baselineItemId: item.id,
    }))
    .filter((mapping): mapping is DefaultMasterPlanDependencyWriterTaskMapping => Boolean(mapping.generatedRowId && mapping.taskId && mapping.baselineItemId))
    .sort((left, right) => left.generatedRowId.localeCompare(right.generatedRowId))
}

function readBaselineItemPredecessorDependencies(item: TaskBaselineItem) {
  const metadata = readBaselineItemMetadata(item)
  return readArray(metadata.predecessorDependencies ?? metadata.predecessor_dependencies)
}

function buildDefaultMasterPlanDependencyEdges(items: TaskBaselineItem[]) {
  const itemByGeneratedRowId = new Map(items.map((item) => [readDefaultMasterPlanGeneratedRowId(item), item]))
  const edges: ConstructionOrganizationPlanNetworkDraftEdge[] = []
  const unresolved: string[] = []

  for (const item of items) {
    const toGeneratedRowId = readDefaultMasterPlanGeneratedRowId(item)
    if (!toGeneratedRowId) continue
    for (const rawDependency of readBaselineItemPredecessorDependencies(item)) {
      const dependency = readRecord(rawDependency)
      const fromGeneratedRowId = normalizeText(dependency.clientRowId ?? dependency.client_row_id ?? dependency.generatedRowId ?? dependency.generated_row_id)
      if (!fromGeneratedRowId || fromGeneratedRowId === toGeneratedRowId) continue
      const predecessor = itemByGeneratedRowId.get(fromGeneratedRowId)
      if (!predecessor?.source_task_id || !item.source_task_id) {
        unresolved.push(`${fromGeneratedRowId}->${toGeneratedRowId}`)
        continue
      }
      edges.push({
        edgeId: hashDraftKey([
          'default_master_plan_dependency_edge',
          item.baseline_version_id,
          fromGeneratedRowId,
          toGeneratedRowId,
          dependency.dependencyType ?? dependency.dependency_type,
          dependency.lagDays ?? dependency.lag_days,
          dependency.intentCode ?? dependency.intent_code ?? dependency.intent,
        ]),
        fromGeneratedRowId,
        toGeneratedRowId,
        dependencyType: normalizeDependencyType(dependency.dependencyType ?? dependency.dependency_type),
        lagDays: normalizeLagDays(dependency.lagDays ?? dependency.lag_days),
        intent: normalizeText(dependency.intentCode ?? dependency.intent_code ?? dependency.intent),
        fromVirtualNodeId: null,
        toVirtualNodeId: null,
        operation: 'propose_create_dependency',
        writesTaskDependencies: false,
      })
    }
  }

  const uniqueEdges = [...new Map(edges.map((edge) => [`${edge.fromGeneratedRowId}|${edge.toGeneratedRowId}|${edge.dependencyType}|${edge.lagDays}|${edge.intent ?? ''}`, edge])).values()]
    .sort((left, right) => left.edgeId.localeCompare(right.edgeId))
  return {
    edges: uniqueEdges,
    unresolved,
  }
}

function buildDefaultMasterPlanEvaluationEvidence(input: {
  edgeCount: number
  unresolvedCount: number
}): ConstructionOrganizationPlanNetworkDraftEvaluationEvidence {
  return {
    source: 'construction_organization_plan_network_draft_evaluation_evidence',
    evaluationStatus: input.edgeCount > 0 && input.unresolvedCount === 0 ? 'evaluation_ready' : 'missing_evaluation_evidence',
    e1: {
      sourceEvidence: 'generated_row_reference_duration_evidence',
      matchedReferenceRowCount: 0,
      totalPlanReferenceDays: null,
      totalContextualReferenceDays: null,
      totalRecommendedDurationDays: null,
      writesReferenceDuration: false,
      writesPlanDates: false,
      writesSeed: false,
    },
    e3: {
      sourceEvidence: 'generated_row_network_evaluation',
      projectedNetworkSpanDays: null,
      previewEdgeCount: input.edgeCount,
      unresolvedEdgeCount: input.unresolvedCount,
      criticalGeneratedRowIds: [],
      materializationStatus: input.unresolvedCount === 0 ? 'baseline_items_mapped_read_only' : 'baseline_item_mapping_unresolved',
      writesTaskDependencies: false,
      writesPlanDates: false,
      writesCriticalPathFacts: false,
    },
    e5: null,
    engineEvaluationSummary: null,
    evidenceGaps: input.unresolvedCount === 0 ? [] : ['baseline_dependency_intent_task_mapping_unresolved'],
    boundaryPolicy: [
      'default_master_plan_dependency_evaluation_is_read_only',
      'does_not_write_task_dependencies',
      'critical_path_recalculation_required_after_domain_writer_execution',
    ],
  }
}

function buildDefaultMasterPlanHandoffProjection(input: {
  baseline: TaskBaseline
  draftNetworkKey: string
  candidateEventId: string
  optionId: string | null
  selectedScenarioIds: string[]
  edgeCount: number
  handoffCandidateEventId: string
  requestedByUserId: string | null
  executedAt: string | null
}): ConstructionOrganizationPlanNetworkManualReviewHandoffProjection {
  return {
    source: 'construction_organization_plan_network_manual_review_handoff_projection',
    candidateEventId: input.handoffCandidateEventId,
    assetKey: `default_master_plan.plan_network_handoff.${safeAssetKeySegment(input.baseline.id) || 'unknown'}`,
    sourceModule: 'defaultMasterPlanDependencyWriterHandoff',
    eventStatus: 'review_required',
    runtimeEffect: 'candidate_only',
    createdAt: input.executedAt,
    updatedAt: input.executedAt,
    draftNetworkKey: input.draftNetworkKey,
    originalCandidateEventId: input.candidateEventId,
    optionId: input.optionId,
    selectedScenarioIds: input.selectedScenarioIds,
    requestedByUserId: input.requestedByUserId,
    executedAt: input.executedAt,
    reviewOperation: 'manual_review_dependency_proposal',
    proposedDependencyEdgeCount: input.edgeCount,
    writesTaskDependencies: false,
    writesPlanDates: false,
    writesSeed: false,
    writesBaseline: false,
    writesCriticalPathFacts: false,
    writesAccelerationDraft: false,
  }
}

function buildDefaultMasterPlanApprovalProjection(input: {
  baseline: TaskBaseline
  draftNetworkKey: string
  handoffCandidateEventId: string
  approvalCandidateEventId: string
  approvedByUserId: string | null
  approvedAt: string | null
}): ConstructionOrganizationPlanNetworkManualReviewApprovalProjection {
  return {
    source: 'construction_organization_plan_network_manual_review_approval_projection',
    candidateEventId: input.approvalCandidateEventId,
    assetKey: `default_master_plan.plan_network_approval.${safeAssetKeySegment(input.baseline.id) || 'unknown'}`,
    sourceModule: 'defaultMasterPlanDependencyWriterHandoff',
    eventStatus: 'approved',
    runtimeEffect: 'candidate_only',
    createdAt: input.approvedAt,
    updatedAt: input.approvedAt,
    draftNetworkKey: input.draftNetworkKey,
    handoffCandidateEventId: input.handoffCandidateEventId,
    approvedByUserId: input.approvedByUserId,
    approvedAt: input.approvedAt,
    approvalDecision: 'approved_for_release_exit_preparation',
    writesTaskDependencies: false,
    writesPlanDates: false,
    writesSeed: false,
    writesBaseline: false,
    writesCriticalPathFacts: false,
    writesAccelerationDraft: false,
  }
}

function buildDefaultMasterPlanReleaseExitHandoffProjection(input: {
  baseline: TaskBaseline
  draftNetworkKey: string
  candidateEventId: string
  handoffCandidateEventId: string
  approvalCandidateEventId: string
  optionId: string | null
  selectedScenarioIds: string[]
  requestedByUserId: string | null
  executedAt: string | null
  releaseHandoffCandidateEventId: string
  releaseRecordTarget: string
  rollbackTarget: string
  consumerVerificationRefs: string[]
  impactMonitoringRefs: string[]
  rollbackWriterRefs: string[]
  edgeCount: number
}): ConstructionOrganizationPlanNetworkReleaseExitHandoffProjection {
  return {
    source: 'construction_organization_plan_network_release_exit_handoff_projection',
    candidateEventId: input.releaseHandoffCandidateEventId,
    assetKey: `default_master_plan.plan_network_release_exit.${safeAssetKeySegment(input.baseline.id) || 'unknown'}`,
    sourceModule: 'defaultMasterPlanDependencyWriterHandoff',
    eventStatus: 'review_required',
    runtimeEffect: 'candidate_only',
    createdAt: input.executedAt,
    updatedAt: input.executedAt,
    draftNetworkKey: input.draftNetworkKey,
    originalCandidateEventId: input.candidateEventId,
    handoffCandidateEventId: input.handoffCandidateEventId,
    approvalCandidateEventId: input.approvalCandidateEventId,
    optionId: input.optionId,
    selectedScenarioIds: input.selectedScenarioIds,
    requestedByUserId: input.requestedByUserId,
    executedAt: input.executedAt,
    releaseRecordTarget: input.releaseRecordTarget,
    rollbackTarget: input.rollbackTarget,
    consumerVerificationRefs: input.consumerVerificationRefs,
    impactMonitoringRefs: input.impactMonitoringRefs,
    rollbackWriterRefs: input.rollbackWriterRefs,
    proposedDependencyEdgeCount: input.edgeCount,
    writesTaskDependencies: false,
    writesPlanDates: false,
    writesSeed: false,
    writesBaseline: false,
    writesCriticalPathFacts: false,
    writesAccelerationDraft: false,
  }
}

function blockedDefaultMasterPlanDependencyDraft(input: {
  baseline?: TaskBaseline | null
  reasons: string[]
  dependencyIntentCount?: number
  taskMappings?: DefaultMasterPlanDependencyWriterTaskMapping[]
  businessType?: string | null
}): DefaultMasterPlanDependencyWriterDraftResult {
  return {
    source: 'default_master_plan_dependency_writer_handoff',
    status: 'domain_writer_draft_blocked',
    canMaterializeRuntime: false,
    domainWriterKey: 'constructionOrganizationPlanNetworkDomainWriter.applyApprovedDraft',
    baselineId: input.baseline?.id ?? null,
    projectId: input.baseline?.project_id ?? null,
    businessType: input.businessType ?? null,
    dependencyIntentCount: input.dependencyIntentCount ?? 0,
    mappedDependencyIntentCount: 0,
    taskMappings: input.taskMappings ?? [],
    missingRequirements: [...new Set(input.reasons.filter(Boolean))],
    draft: null,
    writesTaskDependencies: false,
    writesPlanDates: false,
    writesSeed: false,
    writesBaseline: false,
    writesCriticalPathFacts: false,
    boundaryPolicy: defaultMasterPlanBoundaryPolicy(),
  }
}

export function buildDefaultMasterPlanDependencyWriterDraft(
  input: BuildDefaultMasterPlanDependencyWriterDraftInput,
): DefaultMasterPlanDependencyWriterDraftResult {
  const baseline = input.baseline ?? null
  const items = Array.isArray(input.items) ? input.items : []
  const candidateItems = items.filter(isDefaultMasterPlanBaselineItem)
  const effectiveCandidateItems = candidateItems.length > 0 ? candidateItems : items
  const taskMappings = buildDefaultMasterPlanTaskMappings(effectiveCandidateItems)
  const taskMappingIds = new Set(taskMappings.map((mapping) => mapping.generatedRowId))
  const businessType = readDefaultMasterPlanBusinessType({ baseline, items: effectiveCandidateItems })
  const { edges, unresolved } = buildDefaultMasterPlanDependencyEdges(effectiveCandidateItems)
  const missingMappedRows = effectiveCandidateItems
    .map((item) => readDefaultMasterPlanGeneratedRowId(item))
    .filter((rowId): rowId is string => Boolean(rowId && !taskMappingIds.has(rowId)))
  const releaseRecordTarget = normalizeText(input.releaseRecordTarget)
  const rollbackTarget = normalizeText(input.rollbackTarget)
  const handoffCandidateEventId = normalizeText(input.handoffCandidateEventId)
  const approvalCandidateEventId = normalizeText(input.approvalCandidateEventId)
  const releaseHandoffCandidateEventId = normalizeText(input.releaseHandoffCandidateEventId)
  const requestedByUserId = normalizeText(input.requestedByUserId)
  const executedAt = normalizeText(input.executedAt) ?? new Date().toISOString()
  const reasons = [
    baseline ? null : 'baseline_required',
    baseline?.id ? null : 'baseline_id_required',
    baseline?.project_id ? null : 'project_id_required',
    isDefaultMasterPlanBaseline({ baseline, items: effectiveCandidateItems }) ? null : 'default_master_plan_candidate_baseline_required',
    effectiveCandidateItems.length > 0 ? null : 'candidate_default_master_plan_items_required',
    edges.length > 0 ? null : 'candidate_dependency_intents_required',
    missingMappedRows.length === 0 ? null : `runtime_task_mapping_missing:${missingMappedRows.join(',')}`,
    unresolved.length === 0 ? null : `dependency_intent_mapping_unresolved:${unresolved.join(',')}`,
    handoffCandidateEventId ? null : 'manual_review_handoff_candidate_event_id_required',
    approvalCandidateEventId ? null : 'manual_review_approval_candidate_event_id_required',
    releaseHandoffCandidateEventId ? null : 'release_exit_handoff_candidate_event_id_required',
    releaseRecordTarget ? null : 'release_record_target_required',
    rollbackTarget ? null : 'rollback_target_required',
    requestedByUserId ? null : 'requested_by_user_id_required',
  ].filter((reason): reason is string => Boolean(reason))

  if (!baseline || reasons.length > 0) {
    return blockedDefaultMasterPlanDependencyDraft({
      baseline,
      reasons,
      dependencyIntentCount: edges.length,
      taskMappings,
      businessType,
    })
  }

  const draftNetworkKey = hashDraftKey({
    source: 'default_master_plan_dependency_writer_handoff',
    baselineId: baseline.id,
    sourceVersionLabel: baseline.source_version_label ?? null,
    edges: edges.map((edge) => ({
      fromGeneratedRowId: edge.fromGeneratedRowId,
      toGeneratedRowId: edge.toGeneratedRowId,
      dependencyType: edge.dependencyType,
      lagDays: edge.lagDays,
      intent: edge.intent,
    })),
  })
  const candidateEventId = `default_master_plan_baseline:${baseline.id}`
  const optionId = `default_master_plan:${baseline.source_version_label ?? 'unknown'}`
  const selectedScenarioIds = [String(baseline.source_version_label ?? 'default_master_plan')]
  const handoff = buildDefaultMasterPlanHandoffProjection({
    baseline,
    draftNetworkKey,
    candidateEventId,
    optionId,
    selectedScenarioIds,
    edgeCount: edges.length,
    handoffCandidateEventId,
    requestedByUserId,
    executedAt,
  })
  const approval = buildDefaultMasterPlanApprovalProjection({
    baseline,
    draftNetworkKey,
    handoffCandidateEventId,
    approvalCandidateEventId,
    approvedByUserId: requestedByUserId,
    approvedAt: executedAt,
  })
  const releaseExitHandoff = buildDefaultMasterPlanReleaseExitHandoffProjection({
    baseline,
    draftNetworkKey,
    candidateEventId,
    handoffCandidateEventId,
    approvalCandidateEventId,
    optionId,
    selectedScenarioIds,
    requestedByUserId,
    executedAt,
    releaseHandoffCandidateEventId,
    releaseRecordTarget,
    rollbackTarget,
    consumerVerificationRefs: (input.consumerVerificationRefs ?? []).map((item) => normalizeText(item)).filter((item): item is string => Boolean(item)),
    impactMonitoringRefs: (input.impactMonitoringRefs ?? []).map((item) => normalizeText(item)).filter((item): item is string => Boolean(item)),
    rollbackWriterRefs: (input.rollbackWriterRefs ?? []).map((item) => normalizeText(item)).filter((item): item is string => Boolean(item)),
    edgeCount: edges.length,
  })
  const nodes = buildDraftNodes(edges)
  const releaseExitAssessment = buildReleaseExitAssessment({ draftNetworkKey }, handoff, approval)
  let draft: ConstructionOrganizationPlanNetworkDraft = {
    source: 'construction_organization_plan_network_draft',
    draftNetworkKey,
    candidateEventId,
    assetKey: `default_master_plan.plan_network.${safeAssetKeySegment(baseline.id) || 'unknown'}`,
    projectId: baseline.project_id,
    optionId,
    businessType,
    selectedScenarioIds,
    readiness: 'ready_for_replay',
    nodeCount: nodes.length,
    edgeCount: edges.length,
    blockedReasons: [],
    nodes,
    edges,
    evaluationEvidence: buildDefaultMasterPlanEvaluationEvidence({
      edgeCount: edges.length,
      unresolvedCount: 0,
    }),
    useCaseEvaluationEvidence: {
      newProjectPlanning: {
        source: 'construction_organization_plan_network_draft_use_case_evaluation',
        useCase: 'new_project_planning',
        optionScore: null,
        actionability: 'actionable_candidate',
        rankBasis: ['default_master_plan_dependency_intents', 'user_confirmed_generated_baseline'],
        recoveryFactorHint: null,
        e5RecoverableSpanDays: null,
        writesTaskDependencies: false,
        writesPlanDates: false,
        writesSeed: false,
      },
      startingLineOnboarding: null,
      accelerationRecovery: null,
    },
    reviewPackageStatus: 'ready_for_manual_review',
    reviewRequired: true,
    manualConflictReviewPackage: buildManualConflictReviewPackage({
      readiness: 'ready_for_replay',
      blockedReasons: [],
      edges,
      conflictEvidence: [],
    }),
    manualReviewHandoff: handoff,
    manualConflictReviewDecision: null,
    manualReviewApproval: approval,
    releaseExitHandoff,
    releaseExitAssessment,
    releaseExitPreparation: null,
    domainWriterReleaseExitReadiness: null,
    runtimeEngineEvidence: buildMissingRuntimeEngineEvidenceSummary(),
    recommendationDecision: null,
    runtimeEvidenceLineage: {
      workPackageKey: null,
      useCase: 'new_project_planning',
      evidenceAction: 'default_master_plan_dependency_writer_handoff',
    },
    mutationBoundary: {
      writesTaskDependencies: false,
      writesPlanDates: false,
      writesSeed: false,
      writesBaseline: false,
      writesCriticalPathFacts: false,
      writesAccelerationDraft: false,
    },
    replayRequirements: [
      'replay_e1_reference_duration_against_default_master_plan_rows',
      'replay_e3_cpm_against_default_master_plan_dependency_edges',
      'compare_against_runtime_task_mapping_before_domain_writer_execution',
    ],
    evaluationRequirements: [
      'generated_plan_structure_validation_required_before_dependency_writer_handoff',
      'release_exit_requires_domain_writer_monitoring_and_rollback',
      'critical_path_readback_required_after_domain_writer_execution',
    ],
    boundaryPolicy: [
      'default_master_plan_dependency_draft_is_read_only',
      'derived_from_user_confirmed_generated_default_master_plan_baseline',
      'does_not_write_task_dependencies',
      'does_not_write_plan_dates',
      'does_not_write_baseline_seed_task_facts_or_critical_path_facts',
    ],
  }
  const releaseExitPreparation = buildReleaseExitPreparation(draft, handoff, approval, releaseExitAssessment)
  draft = {
    ...draft,
    releaseExitPreparation,
    domainWriterReleaseExitReadiness: buildDomainWriterReleaseExitReadiness(releaseExitPreparation),
  }

  return {
    source: 'default_master_plan_dependency_writer_handoff',
    status: 'domain_writer_draft_ready',
    canMaterializeRuntime: false,
    domainWriterKey: 'constructionOrganizationPlanNetworkDomainWriter.applyApprovedDraft',
    baselineId: baseline.id,
    projectId: baseline.project_id,
    businessType,
    dependencyIntentCount: edges.length,
    mappedDependencyIntentCount: edges.length,
    taskMappings,
    missingRequirements: [],
    draft,
    writesTaskDependencies: false,
    writesPlanDates: false,
    writesSeed: false,
    writesBaseline: false,
    writesCriticalPathFacts: false,
    boundaryPolicy: defaultMasterPlanBoundaryPolicy(),
  }
}

function resolveReadiness(item: ConstructionOrganizationMaterializationReviewPackageItem, edgeCount: number): ConstructionOrganizationPlanNetworkDraftReadiness {
  if (item.reviewPackage.status === 'evidence_only') return 'evidence_only'
  if (item.reviewPackage.status === 'ready_for_manual_review' && item.reviewPackage.allowManualReview && edgeCount > 0) {
    return 'ready_for_replay'
  }
  if (item.reviewPackage.status === 'blocked_by_violations' && edgeCount > 0) {
    return 'conflict_review_required'
  }
  return 'blocked'
}

function buildBlockedReasons(item: ConstructionOrganizationMaterializationReviewPackageItem, edgeCount: number) {
  const reasons = [...item.reviewPackage.blockedReasons]
  const isConflictReview = item.reviewPackage.status === 'blocked_by_violations' && edgeCount > 0
  if (isConflictReview) {
    reasons.push('candidate_network_conflicts_with_current_generated_row_dates')
    reasons.push('requires_manual_conflict_review_before_replay')
  }
  if (item.reviewPackage.status !== 'ready_for_manual_review' && !isConflictReview) reasons.push('review_package_not_ready_for_manual_review')
  if (!item.reviewPackage.allowManualReview && !isConflictReview) reasons.push('manual_review_not_allowed')
  if (edgeCount === 0) reasons.push('no_proposed_dependency_edges')
  if (item.reviewPackage.writesTaskDependencies !== false) reasons.push('review_package_write_boundary_unknown')
  return [...new Set(reasons)]
}

function buildManualConflictReviewPackage(input: {
  readiness: ConstructionOrganizationPlanNetworkDraftReadiness
  blockedReasons: string[]
  edges: ConstructionOrganizationPlanNetworkDraftEdge[]
  conflictEvidence: ConstructionOrganizationPlanNetworkManualConflictEvidence[]
}): ConstructionOrganizationPlanNetworkManualConflictReviewPackage {
  const conflictReasonCodes = input.blockedReasons
    .filter((reason) => isConstructionOrganizationConflictReviewHandoffReason(reason))
  const requiresReview = input.readiness === 'conflict_review_required'
    && conflictReasonCodes.includes('candidate_network_conflicts_with_current_generated_row_dates')

  return {
    source: 'construction_organization_plan_network_manual_conflict_review_package',
    status: requiresReview ? 'manual_conflict_review_required' : 'not_required',
    reviewPrompt: requiresReview
      ? '候选施工组织关系与当前生成计划日期存在冲突，需要人工确认是接受候选关系进入回放，还是退回调整计划日期。'
      : null,
    reviewChecklist: requiresReview
      ? [
          '核对候选依赖是否符合当前施工组织方案和现场业务顺序。',
          '核对当前计划日期冲突是否应由计划日期调整解决。',
          '确认批准后仍只是进入 ready_for_replay，不会直接写入真实依赖或计划日期。',
          '如候选关系不应覆盖当前计划日期，选择退回调整日期。',
        ]
      : [],
    conflictReasonCodes: [...new Set(conflictReasonCodes)].sort(),
    proposedDependencyEdgeCount: input.edges.length,
    sampleProposedDependencyEdges: input.edges.slice(0, 5),
    conflictEvidenceCount: input.conflictEvidence.length,
    sampleConflictEvidence: input.conflictEvidence.slice(0, 5),
    allowedDecisions: requiresReview
      ? ['approved_ready_for_replay', 'rejected_needs_plan_date_adjustment']
      : [],
    recommendedNextAction: requiresReview
      ? 'complete_manual_conflict_review_before_manual_review_approval'
      : 'continue_standard_governance_flow',
    writesTaskDependencies: false,
    writesPlanDates: false,
    writesSeed: false,
    writesBaseline: false,
    writesCriticalPathFacts: false,
    writesAccelerationDraft: false,
    boundaryPolicy: [
      'manual_conflict_review_package_is_read_only',
      'manual_conflict_review_package_does_not_auto_approve_candidate',
      'manual_conflict_review_package_does_not_write_task_dependencies',
      'manual_conflict_review_package_does_not_write_plan_dates',
      'manual_review_approval_still_required_after_approved_conflict_review',
    ],
  }
}

function buildDraftEvaluationEvidence(
  item: ConstructionOrganizationMaterializationReviewPackageItem,
): ConstructionOrganizationPlanNetworkDraftEvaluationEvidence {
  const referenceEvidence = readRecord(item.generatedRowReferenceDurationEvidence)
  const networkEvaluation = readRecord(item.generatedRowNetworkEvaluation)
  const accelerationRecovery = readNestedRecord(item.useCaseEvaluations, 'accelerationRecovery')
  const e1 = Object.keys(referenceEvidence).length > 0
    ? {
        sourceEvidence: 'generated_row_reference_duration_evidence' as const,
        matchedReferenceRowCount: readNumber(referenceEvidence.matchedReferenceRowCount) ?? 0,
        totalPlanReferenceDays: readNumber(referenceEvidence.totalPlanReferenceDays),
        totalContextualReferenceDays: readNumber(referenceEvidence.totalContextualReferenceDays),
        totalRecommendedDurationDays: readNumber(referenceEvidence.totalRecommendedDurationDays),
        writesReferenceDuration: false as const,
        writesPlanDates: false as const,
        writesSeed: false as const,
      }
    : null
  const e3 = Object.keys(networkEvaluation).length > 0
    ? {
        sourceEvidence: 'generated_row_network_evaluation' as const,
        projectedNetworkSpanDays: readNumber(networkEvaluation.projectedNetworkSpanDays),
        previewEdgeCount: readNumber(networkEvaluation.previewEdgeCount) ?? 0,
        unresolvedEdgeCount: readNumber(networkEvaluation.unresolvedEdgeCount) ?? 0,
        criticalGeneratedRowIds: readStringArray(networkEvaluation.criticalGeneratedRowIds),
        materializationStatus: normalizeText(networkEvaluation.materializationStatus),
        writesTaskDependencies: false as const,
        writesPlanDates: false as const,
        writesCriticalPathFacts: false as const,
      }
    : null
  const e5 = Object.keys(accelerationRecovery).length > 0
    ? {
        sourceEvidence: 'acceleration_recovery_use_case_evaluation' as const,
        optionScore: readNumber(accelerationRecovery.optionScore),
        recoveryFactorHint: readNumber(accelerationRecovery.recoveryFactorHint),
        e5RecoverableSpanDays: readNumber(accelerationRecovery.e5RecoverableSpanDays),
        actionability: normalizeText(accelerationRecovery.actionability),
        writesTaskDependencies: false as const,
        writesPlanDates: false as const,
        writesSeed: false as const,
        writesAccelerationDraft: false as const,
      }
    : null
  const evidenceGaps = [
    e1 ? null : 'missing_generated_row_reference_duration_evidence',
    e3 ? null : 'missing_generated_row_network_evaluation',
    e5 ? null : 'missing_acceleration_recovery_use_case_evaluation',
  ].filter((item): item is string => Boolean(item))
  const evidenceCount = [e1, e3, e5].filter(Boolean).length
  const evaluationStatus = evidenceCount === 3
    ? 'evaluation_ready'
    : evidenceCount > 0
      ? 'partial_evidence'
      : 'missing_evaluation_evidence'

  return {
    source: 'construction_organization_plan_network_draft_evaluation_evidence',
    evaluationStatus,
    e1,
    e3,
    e5,
    engineEvaluationSummary: item.engineEvaluationSummary,
    evidenceGaps,
    boundaryPolicy: [
      'evaluation_evidence_is_read_only',
      'e1_evidence_from_generated_row_reference_duration_projection',
      'e3_evidence_from_generated_row_candidate_network_cpm',
      'e5_evidence_from_acceleration_recovery_use_case_evaluation',
      'does_not_write_runtime_dependencies_or_plan_dates',
    ],
  }
}

function readBusinessTypeFromFactBasis(item: ConstructionOrganizationMaterializationReviewPackageItem) {
  const factBasis = readRecord(item.factBasis)
  return normalizeText(
    factBasis.businessType
      ?? factBasis.business_type
      ?? factBasis.projectTypeCode
      ?? factBasis.project_type_code,
  )
}

function buildRuntimeEvidenceLineageFromReviewPackageItem(
  item: ConstructionOrganizationMaterializationReviewPackageItem,
): ConstructionOrganizationPlanNetworkDraft['runtimeEvidenceLineage'] {
  const factBasis = readRecord(item.factBasis)
  const reviewPackage = readRecord(item.reviewPackage)
  return {
    workPackageKey: readWorkPackageKeyFromRecord(factBasis) ?? readWorkPackageKeyFromRecord(reviewPackage),
    useCase: readUseCaseFromRecord(factBasis) ?? readUseCaseFromRecord(reviewPackage),
    evidenceAction: readEvidenceActionFromRecord(factBasis) ?? readEvidenceActionFromRecord(reviewPackage),
  }
}

export function buildConstructionOrganizationPlanNetworkDraftFromReviewPackageItem(
  item: ConstructionOrganizationMaterializationReviewPackageItem,
): ConstructionOrganizationPlanNetworkDraft {
  const edges = item.reviewPackage.proposedDependencyEdges
    .map(buildDraftEdge)
    .filter((edge): edge is ConstructionOrganizationPlanNetworkDraftEdge => Boolean(edge))
    .sort((left, right) => left.edgeId.localeCompare(right.edgeId))
  const conflictEvidence = readArray((item.reviewPackage as Record<string, unknown>).conflictEvidence)
    .map(buildManualConflictEvidence)
    .filter((evidence): evidence is ConstructionOrganizationPlanNetworkManualConflictEvidence => Boolean(evidence))
    .sort((left, right) => left.edgeId.localeCompare(right.edgeId))
  const nodes = buildDraftNodes(edges)
  const readiness = resolveReadiness(item, edges.length)
  const blockedReasons = buildBlockedReasons(item, edges.length)
  const manualConflictReviewPackage = buildManualConflictReviewPackage({
    readiness,
    blockedReasons,
    edges,
    conflictEvidence,
  })
  const evaluationEvidence = buildDraftEvaluationEvidence(item)
  const useCaseEvaluationEvidence = buildUseCaseEvaluationEvidence(item)
  const draftNetworkKey = hashDraftKey({
    source: 'construction_organization_plan_network_draft',
    candidateEventId: item.candidateEventId,
    optionId: item.optionId ?? item.reviewPackage.optionId,
    selectedScenarioIds: item.selectedScenarioIds,
    edges: edges.map((edge) => ({
      fromGeneratedRowId: edge.fromGeneratedRowId,
      toGeneratedRowId: edge.toGeneratedRowId,
      dependencyType: edge.dependencyType,
      lagDays: edge.lagDays,
      intent: edge.intent,
      fromVirtualNodeId: edge.fromVirtualNodeId,
      toVirtualNodeId: edge.toVirtualNodeId,
    })),
  })

  return {
    source: 'construction_organization_plan_network_draft',
    draftNetworkKey,
    candidateEventId: item.candidateEventId,
    assetKey: item.assetKey,
    projectId: item.projectId,
    optionId: item.optionId ?? item.reviewPackage.optionId,
    businessType: readBusinessTypeFromFactBasis(item),
    selectedScenarioIds: item.selectedScenarioIds,
    readiness,
    nodeCount: nodes.length,
    edgeCount: edges.length,
    blockedReasons,
    nodes,
    edges,
    evaluationEvidence,
    useCaseEvaluationEvidence,
    reviewPackageStatus: item.reviewPackage.status,
    reviewRequired: item.reviewPackage.reviewRequired,
    manualConflictReviewPackage,
    manualReviewHandoff: null,
    manualConflictReviewDecision: null,
    manualReviewApproval: null,
    releaseExitHandoff: null,
    releaseExitAssessment: buildReleaseExitAssessment({ draftNetworkKey }),
    releaseExitPreparation: null,
    domainWriterReleaseExitReadiness: null,
    runtimeEngineEvidence: buildMissingRuntimeEngineEvidenceSummary(),
    recommendationDecision: null,
    runtimeEvidenceLineage: buildRuntimeEvidenceLineageFromReviewPackageItem(item),
    mutationBoundary: {
      writesTaskDependencies: false,
      writesPlanDates: false,
      writesSeed: false,
      writesBaseline: false,
      writesCriticalPathFacts: false,
      writesAccelerationDraft: false,
    },
    replayRequirements: [
      'replay_e1_reference_duration_against_draft_nodes',
      'replay_e3_cpm_against_draft_edges',
      'replay_e5_recovery_against_draft_network_before_any_materialization',
      'compare_against_generated_wbs_dates_before_domain_writer_handoff',
    ],
    evaluationRequirements: [
      'manual_review_is_required_before_runtime_dependency_write',
      'release_exit_requires_domain_writer_monitoring_and_rollback',
      'starting_line_onboarding_must_recheck_project_generation_facts_snapshot',
    ],
    boundaryPolicy: [
      'draft_network_is_read_only',
      'derived_from_governed_materialization_review_package',
      'does_not_write_task_dependencies',
      'does_not_write_plan_dates',
      'does_not_write_baseline_seed_task_facts_or_critical_path_facts',
    ],
  }
}

function actionabilityRank(actionability: string | null) {
  if (actionability === 'actionable_candidate') return 2
  if (actionability === 'evidence_only') return 1
  return 0
}

function readinessRank(readiness: ConstructionOrganizationPlanNetworkDraftReadiness) {
  if (readiness === 'ready_for_replay') return 2
  if (readiness === 'conflict_review_required') return 1.5
  if (readiness === 'evidence_only') return 1
  return 0
}

function evaluationRank(status: ConstructionOrganizationPlanNetworkDraftEvaluationEvidence['evaluationStatus']) {
  if (status === 'evaluation_ready') return 2
  if (status === 'partial_evidence') return 1
  return 0
}

function selectRecommendedDraft(
  items: ConstructionOrganizationPlanNetworkDraft[],
  useCase: ConstructionOrganizationPlanNetworkUseCaseKey,
): ConstructionOrganizationPlanNetworkDraftRecommendation {
  const candidates = items
    .map((item) => ({
      item,
      evidence: item.useCaseEvaluationEvidence[useCase],
    }))
    .filter((candidate) => candidate.evidence)
  if (candidates.length === 0) return null

  const selected = [...candidates].sort((left, right) => {
    const leftEvidence = left.evidence as NonNullable<typeof left.evidence>
    const rightEvidence = right.evidence as NonNullable<typeof right.evidence>
    const actionabilityDelta = actionabilityRank(rightEvidence.actionability) - actionabilityRank(leftEvidence.actionability)
    if (actionabilityDelta !== 0) return actionabilityDelta
    const scoreDelta = (rightEvidence.optionScore ?? -Infinity) - (leftEvidence.optionScore ?? -Infinity)
    if (scoreDelta !== 0) return scoreDelta
    const readinessDelta = readinessRank(right.item.readiness) - readinessRank(left.item.readiness)
    if (readinessDelta !== 0) return readinessDelta
    return evaluationRank(right.item.evaluationEvidence.evaluationStatus) - evaluationRank(left.item.evaluationEvidence.evaluationStatus)
  })[0]
  if (!selected?.evidence) return null

  return {
    useCase,
    draftNetworkKey: selected.item.draftNetworkKey,
    candidateEventId: selected.item.candidateEventId,
    optionId: selected.item.optionId,
    selectedScenarioIds: selected.item.selectedScenarioIds,
    readiness: selected.item.readiness,
    evaluationStatus: selected.item.evaluationEvidence.evaluationStatus,
    optionScore: selected.evidence.optionScore,
    actionability: selected.evidence.actionability,
    e5RecoverableSpanDays: selected.evidence.e5RecoverableSpanDays,
    runtimeEngineEvidenceStatus: selected.item.runtimeEngineEvidence.status,
    presentRuntimeEngineCodes: selected.item.runtimeEngineEvidence.presentEngineCodes,
    missingRuntimeEngineCodes: selected.item.runtimeEngineEvidence.missingEngineCodes,
    canClaimTruePerOptionRuntimeEvaluation: selected.item.runtimeEngineEvidence.canClaimTruePerOptionRuntimeEvaluation,
    recommendationBasis: [
      'selected_from_plan_network_draft_use_case_evaluation',
      selected.evidence.actionability ? `actionability:${selected.evidence.actionability}` : 'actionability:unknown',
      selected.item.evaluationEvidence.evaluationStatus,
      selected.item.readiness,
      selected.item.runtimeEngineEvidence.status,
    ],
    writesTaskDependencies: false,
    writesPlanDates: false,
    writesSeed: false,
    writesAccelerationDraft: false,
  }
}

function buildUseCaseRankMaps(items: ConstructionOrganizationPlanNetworkDraft[]) {
  const useCases: ConstructionOrganizationPlanNetworkUseCaseKey[] = [
    'newProjectPlanning',
    'startingLineOnboarding',
    'accelerationRecovery',
  ]
  const rankByUseCase = new Map<ConstructionOrganizationPlanNetworkUseCaseKey, Map<string, number>>()
  for (const useCase of useCases) {
    const ranked = items
      .map((item) => ({ item, evidence: item.useCaseEvaluationEvidence[useCase] }))
      .filter((candidate) => candidate.evidence)
      .sort((left, right) => {
        const leftEvidence = left.evidence as NonNullable<typeof left.evidence>
        const rightEvidence = right.evidence as NonNullable<typeof right.evidence>
        const actionabilityDelta = actionabilityRank(rightEvidence.actionability) - actionabilityRank(leftEvidence.actionability)
        if (actionabilityDelta !== 0) return actionabilityDelta
        const scoreDelta = (rightEvidence.optionScore ?? -Infinity) - (leftEvidence.optionScore ?? -Infinity)
        if (scoreDelta !== 0) return scoreDelta
        const readinessDelta = readinessRank(right.item.readiness) - readinessRank(left.item.readiness)
        if (readinessDelta !== 0) return readinessDelta
        return evaluationRank(right.item.evaluationEvidence.evaluationStatus) - evaluationRank(left.item.evaluationEvidence.evaluationStatus)
      })
    rankByUseCase.set(
      useCase,
      new Map(ranked.map((candidate, index) => [candidate.item.draftNetworkKey, index + 1])),
    )
  }
  return rankByUseCase
}

function buildNextGovernanceAction(
  item: ConstructionOrganizationPlanNetworkDraft,
  runtimeMaterializationEvidence: ConstructionOrganizationPlanNetworkOptionRuntimeMaterializationEvidence,
): Pick<ConstructionOrganizationPlanNetworkOptionComparisonItem, 'nextGovernanceAction' | 'nextGovernanceReasons'> {
  if (item.readiness !== 'ready_for_replay' || item.evaluationEvidence.evaluationStatus !== 'evaluation_ready' || item.edgeCount <= 0) {
    return {
      nextGovernanceAction: 'blocked',
      nextGovernanceReasons: [
        item.readiness,
        item.evaluationEvidence.evaluationStatus,
        item.edgeCount > 0 ? null : 'no_proposed_dependency_edges',
        ...item.blockedReasons,
      ].filter((reason): reason is string => Boolean(reason)),
    }
  }
  if (!item.manualReviewHandoff) {
    return {
      nextGovernanceAction: 'manual_review_handoff',
      nextGovernanceReasons: ['ready_for_manual_review_handoff'],
    }
  }
  if (!item.manualReviewApproval) {
    return {
      nextGovernanceAction: 'manual_review_approval',
      nextGovernanceReasons: ['manual_review_handoff_recorded'],
    }
  }
  if (!item.releaseExitHandoff) {
    return {
      nextGovernanceAction: 'release_exit_handoff',
      nextGovernanceReasons: ['manual_review_approved_release_exit_handoff_required'],
    }
  }
  if (item.runtimeEngineEvidence.canClaimTruePerOptionRuntimeEvaluation) {
    if (!runtimeMaterializationEvidence.canClaimRuntimeMaterializationEvidence) {
      return {
        nextGovernanceAction: 'runtime_materialization_evidence_required',
        nextGovernanceReasons: runtimeMaterializationEvidence.missingBeforeRuntime,
      }
    }
    return {
      nextGovernanceAction: 'runtime_engine_evidence_ready',
      nextGovernanceReasons: [
        'true_per_option_runtime_e1_e3_e5_evidence_ready',
        'runtime_materialization_boundary_remains_read_only',
      ],
    }
  }
  return {
    nextGovernanceAction: 'runtime_engine_evidence_required',
    nextGovernanceReasons: item.runtimeEngineEvidence.missingEngineCodes.map((engineCode) => `missing_runtime_engine:${engineCode}`),
  }
}

function buildOptionComparisonPackage(
  items: ConstructionOrganizationPlanNetworkDraft[],
  recommendedDrafts: ConstructionOrganizationPlanNetworkDraftReport['recommendedDrafts'],
  runtimeEvidenceIndexes: ConstructionOrganizationPlanNetworkRuntimeEvidenceIndexes,
  recommendationDecisionIndex: ReturnType<typeof indexRecommendationDecisions>,
): ConstructionOrganizationPlanNetworkOptionComparisonPackage {
  const useCases: ConstructionOrganizationPlanNetworkUseCaseKey[] = [
    'newProjectPlanning',
    'startingLineOnboarding',
    'accelerationRecovery',
  ]
  const rankMaps = buildUseCaseRankMaps(items)
  const recommendedKeyByUseCase = new Map<ConstructionOrganizationPlanNetworkUseCaseKey, string | null>(
    useCases.map((useCase) => [useCase, recommendedDrafts[useCase]?.draftNetworkKey ?? null]),
  )
  const options = items.map((item): ConstructionOrganizationPlanNetworkOptionComparisonItem => {
    const useCaseScores = Object.fromEntries(useCases.map((useCase) => {
      const evidence = item.useCaseEvaluationEvidence[useCase]
      const score: ConstructionOrganizationPlanNetworkOptionComparisonScore | null = evidence
        ? {
            rank: rankMaps.get(useCase)?.get(item.draftNetworkKey) ?? null,
            optionScore: evidence.optionScore,
            actionability: evidence.actionability,
            e5RecoverableSpanDays: evidence.e5RecoverableSpanDays,
            rankBasis: evidence.rankBasis,
          }
        : null
      return [useCase, score]
    })) as Record<ConstructionOrganizationPlanNetworkUseCaseKey, ConstructionOrganizationPlanNetworkOptionComparisonScore | null>
    const runtimeMaterializationEvidence = buildOptionRuntimeMaterializationEvidence(item, runtimeEvidenceIndexes)
    const publication = findRuntimePublicationForDraft(item, runtimeEvidenceIndexes)
    const recommendationDecision = item.recommendationDecision
      ?? recommendationDecisionIndex.findForDraft(item, publication)
    const next = buildNextGovernanceAction(item, runtimeMaterializationEvidence)
    return {
      source: 'construction_organization_plan_network_option_comparison_item',
      draftNetworkKey: item.draftNetworkKey,
      candidateEventId: item.candidateEventId,
      optionId: item.optionId,
      selectedScenarioIds: item.selectedScenarioIds,
      isRecommendedFor: useCases.filter((useCase) => recommendedKeyByUseCase.get(useCase) === item.draftNetworkKey),
      readiness: item.readiness,
      evaluationStatus: item.evaluationEvidence.evaluationStatus,
      runtimeEngineEvidenceStatus: item.runtimeEngineEvidence.status,
      presentRuntimeEngineCodes: item.runtimeEngineEvidence.presentEngineCodes,
      missingRuntimeEngineCodes: item.runtimeEngineEvidence.missingEngineCodes,
      canClaimTruePerOptionRuntimeEvaluation: item.runtimeEngineEvidence.canClaimTruePerOptionRuntimeEvaluation,
      useCaseScores,
      proposedDependencyEdgeCount: item.edgeCount,
      nextGovernanceAction: next.nextGovernanceAction,
      nextGovernanceReasons: next.nextGovernanceReasons,
      runtimeMaterializationEvidence,
      recommendationDecision,
      writesTaskDependencies: false,
      writesPlanDates: false,
      writesSeed: false,
      writesAccelerationDraft: false,
    }
  })

  return {
    source: 'construction_organization_plan_network_option_comparison_package',
    totalOptionCount: items.length,
    recommendedOptionIdsByUseCase: {
      newProjectPlanning: recommendedDrafts.newProjectPlanning?.optionId ?? null,
      startingLineOnboarding: recommendedDrafts.startingLineOnboarding?.optionId ?? null,
      accelerationRecovery: recommendedDrafts.accelerationRecovery?.optionId ?? null,
    },
    canAutoMaterializeSelectedOption: false,
    comparisonBasis: [
      'read_only_plan_network_draft_use_case_evidence',
      'runtime_engine_evidence_gap_by_draft',
      'runtime_materialization_evidence_gap_by_draft',
      'manual_governance_release_exit_required',
    ],
    options,
    boundaryPolicy: [
      'option_comparison_package_is_read_only',
      'does_not_select_runtime_materialization_automatically',
      'does_not_write_task_dependencies_or_plan_dates',
    ],
  }
}

function buildRuntimeRecommendedOption(
  items: ConstructionOrganizationPlanNetworkDraft[],
  runtimeEvidenceIndexes: ConstructionOrganizationPlanNetworkRuntimeEvidenceIndexes,
  recommendationDecisionIndex: ReturnType<typeof indexRecommendationDecisions>,
): ConstructionOrganizationPlanNetworkRuntimeRecommendedOption {
  const candidates = items.map((item) => {
    const runtimeMaterializationEvidence = buildOptionRuntimeMaterializationEvidence(item, runtimeEvidenceIndexes)
    const publication = findRuntimePublicationForDraft(item, runtimeEvidenceIndexes)
    const outcomes = publication?.publicationKey
      ? runtimeEvidenceIndexes.outcomesByPublicationKey.get(publication.publicationKey) ?? []
      : []
    return { item, runtimeMaterializationEvidence, publication, outcomes }
  })
  const eligible = candidates
    .filter((candidate) => candidate.runtimeMaterializationEvidence.canClaimRuntimeMaterializationEvidence)
    .sort((left, right) => {
      const leftScore = left.item.useCaseEvaluationEvidence.accelerationRecovery?.optionScore ?? -Infinity
      const rightScore = right.item.useCaseEvaluationEvidence.accelerationRecovery?.optionScore ?? -Infinity
      if (rightScore !== leftScore) return rightScore - leftScore
      const leftOutcomeAccepted = left.outcomes.some((outcome) => outcome.outcomeStatus === 'accepted') ? 1 : 0
      const rightOutcomeAccepted = right.outcomes.some((outcome) => outcome.outcomeStatus === 'accepted') ? 1 : 0
      if (rightOutcomeAccepted !== leftOutcomeAccepted) return rightOutcomeAccepted - leftOutcomeAccepted
      return left.item.draftNetworkKey.localeCompare(right.item.draftNetworkKey)
    })
  const selected = eligible[0] ?? null
  const siteDecision = selected
    ? selected.item.recommendationDecision
      ?? recommendationDecisionIndex.findForDraft(selected.item, selected.publication)
    : null
  const selectedBusinessType = normalizeText(selected?.item.businessType)
  const siteDecisionBusinessType = normalizeText(siteDecision?.businessType)
  const siteDecisionAttributionGap = selectedBusinessType && siteDecision && !siteDecisionBusinessType
    ? 'runtime_business_type_attribution_required'
    : null
  const siteDecisionBusinessTypeConflict = selectedBusinessType && siteDecisionBusinessType && selectedBusinessType !== siteDecisionBusinessType
    ? `runtime_business_type_conflict:${siteDecisionBusinessType}`
    : null
  const siteDecisionTimingGap = siteDecision && selected?.publication && isDecisionBeforeRuntimePublication(siteDecision, selected.publication)
    ? 'site_adoption_before_runtime_publication'
    : null
  const siteDecisionMatchesRuntimeRecommendation = selected && siteDecision
    ? runtimeDecisionMatchesDraft(selected.item, selected.publication, siteDecision)
    : null
  const rejectedReasonsByOptionId = Object.fromEntries(candidates
    .filter((candidate) => !selected || candidate.item.draftNetworkKey !== selected.item.draftNetworkKey)
    .map((candidate) => [
      candidate.item.optionId ?? candidate.item.draftNetworkKey,
      candidate.runtimeMaterializationEvidence.canClaimRuntimeMaterializationEvidence
        ? ['lower_ranked_runtime_ready_option']
        : candidate.runtimeMaterializationEvidence.missingBeforeRuntime,
    ])) as Record<string, string[]>

  return {
    source: 'construction_organization_plan_network_runtime_recommended_option',
    status: selected ? 'runtime_recommended_option_ready' : 'runtime_recommended_option_blocked',
    optionId: selected?.item.optionId ?? null,
    draftNetworkKey: selected?.item.draftNetworkKey ?? null,
    publicationKey: selected?.publication?.publicationKey ?? null,
    selectedScenarioIds: selected?.item.selectedScenarioIds ?? [],
    canAutoAdoptRuntimeOption: false,
    siteDecision: siteDecision
      ? {
          ...siteDecision,
          siteDecisionMatchesRuntimeRecommendation,
        }
      : null,
    siteDecisionMatchesRuntimeRecommendation,
    siteDecisionAttributionGap,
    siteDecisionBusinessTypeConflict,
    siteDecisionTimingGap,
    recommendationBasis: selected
      ? [
          'runtime_materialization_evidence_ready_for_option',
          selected.outcomes.some((outcome) => outcome.outcomeStatus === 'accepted')
            ? 'saved_network_outcome:accepted'
            : 'saved_network_outcome:weak',
          'ranked_by_acceleration_recovery_score_after_runtime_evidence_gate',
        ]
      : ['no_runtime_materialization_ready_option'],
    rejectedOptionIds: Object.keys(rejectedReasonsByOptionId),
    rejectedReasonsByOptionId,
    mutationBoundary: {
      writesTaskDependencies: false,
      writesPlanDates: false,
      writesSeed: false,
      writesBaseline: false,
      writesCriticalPathFacts: false,
      writesAccelerationDraft: false,
    },
    boundaryPolicy: [
      'runtime_recommended_option_is_read_only',
      'runtime_recommended_option_does_not_auto_adopt_site_plan',
      'requires_option_runtime_materialization_evidence_ready',
      'does_not_write_task_dependencies_or_plan_dates',
      'does_not_write_seed_baseline_task_facts_acceleration_drafts_or_critical_path_facts',
    ],
  }
}

function buildRuntimeMaterializationReadiness(
  items: ConstructionOrganizationPlanNetworkDraft[],
  releaseExitHandoffs: ConstructionOrganizationPlanNetworkReleaseExitHandoffProjection[],
  runtimePublications: ConstructionOrganizationPlanNetworkRuntimePublicationProjection[],
  runtimeConsumerObservations: ConstructionOrganizationPlanNetworkRuntimeConsumerObservationProjection[],
  runtimeEvents: ConstructionOrganizationPlanNetworkRuntimeEventProjection[],
  planNetworkOutcomes: ConstructionOrganizationPlanNetworkOutcomeProjection[],
  runtimeEngineEvidence: ConstructionOrganizationPlanNetworkRuntimeEngineEvidenceProjection[],
): ConstructionOrganizationPlanNetworkRuntimeMaterializationReadiness {
  const releaseExitPreparationCount = items.filter((item) => item.releaseExitPreparation).length
  const domainWriterReleaseExitReadinessCount = items.filter((item) => item.domainWriterReleaseExitReadiness).length
  const linkedReleaseExitHandoffCount = items.filter((item) => item.releaseExitHandoff).length
  const { publicationByDraftKey, publicationByReleaseHandoffEventId } = indexRuntimePublications(runtimePublications)
  const { observationsByPublicationKey } = indexRuntimeConsumerObservations(runtimeConsumerObservations)
  const { impactMonitoringByPublicationKey, rollbackExecutionByPublicationKey } = indexRuntimeEvents(runtimeEvents)
  const { outcomesByPublicationKey } = indexPlanNetworkOutcomes(planNetworkOutcomes)
  const { engineEvidenceByPublicationKey } = buildRuntimeEvidenceIndexes({
    runtimePublications,
    runtimeConsumerObservations,
    runtimeEvents,
    planNetworkOutcomes,
    runtimeEngineEvidence,
  })
  const findPublicationForDraft = (item: ConstructionOrganizationPlanNetworkDraft) => {
    const releaseHandoffCandidateEventId = item.releaseExitHandoff?.candidateEventId
    const byDraftKey = publicationByDraftKey.get(item.draftNetworkKey)
    if (runtimePublicationMatchesDraft(item, byDraftKey)) return byDraftKey
    const byReleaseHandoff = releaseHandoffCandidateEventId
        ? publicationByReleaseHandoffEventId.get(releaseHandoffCandidateEventId)
        : undefined
    return runtimePublicationMatchesDraft(item, byReleaseHandoff) ? byReleaseHandoff : undefined
  }
  const linkedRuntimePublicationCount = items.filter((item) => {
    return Boolean(findPublicationForDraft(item))
  }).length
  const linkedRuntimeConsumerObservationCount = items.filter((item) => {
    const publication = findPublicationForDraft(item)
    const evidence = filterRuntimeConsumerObservationsForDraft(item, publication, observationsByPublicationKey)
    return hasRuntimeEvidenceAfterPublication(publication, evidence, (item) => item.observedAt)
  }).length
  const linkedRuntimeImpactMonitoringCount = items.filter((item) => {
    const publication = findPublicationForDraft(item)
    const evidence = publication?.publicationKey
      ? filterRuntimeEvidenceForDraft(item, impactMonitoringByPublicationKey.get(publication.publicationKey) ?? [])
      : []
    return hasRuntimeEvidenceAfterPublication(publication, evidence, (item) => item.executedAt)
  }).length
  const linkedRollbackExecutionVerificationCount = items.filter((item) => {
    const publication = findPublicationForDraft(item)
    const evidence = publication?.publicationKey
      ? filterRuntimeEvidenceForDraft(item, rollbackExecutionByPublicationKey.get(publication.publicationKey) ?? [])
      : []
    return hasRuntimeEvidenceAfterPublication(publication, evidence, (item) => item.executedAt)
  }).length
  const linkedPlanNetworkOutcomeCount = items.filter((item) => {
    const publication = findPublicationForDraft(item)
    const evidence = publication?.publicationKey
      ? filterRuntimeEvidenceForDraft(item, outcomesByPublicationKey.get(publication.publicationKey) ?? [])
      : []
    return hasRuntimeEvidenceAfterPublication(publication, evidence, (item) => item.observedAt)
  }).length
  const linkedRuntimeEngineEvidenceCount = items.filter((item) => {
    const publication = findPublicationForDraft(item)
    const evidence = publication?.publicationKey
      ? filterRuntimeEvidenceForDraft(item, engineEvidenceByPublicationKey.get(publication.publicationKey) ?? [])
      : []
    return hasAllRuntimeEnginesAfterPublication(publication, evidence)
  }).length
  const totalDraftCount = items.length
  const hasDrafts = totalDraftCount > 0
  const runtimeImpactMonitoringEvents = runtimeEvents.filter((event) => event.eventType === 'impact_monitoring')
  const rollbackExecutionEvents = runtimeEvents.filter((event) => event.eventType === 'rollback_execution')
  const linkedRuntimeConsumerObservationKeys = new Set<string>()
  const linkedRuntimeImpactMonitoringKeys = new Set<string>()
  const linkedRollbackExecutionKeys = new Set<string>()
  const linkedPlanNetworkOutcomeKeys = new Set<string>()
  const linkedRuntimeEngineEvidenceKeys = new Set<string>()
  for (const item of items) {
    const publication = findPublicationForDraft(item)
    const observations = filterRuntimeConsumerObservationsForDraft(item, publication, observationsByPublicationKey)
    for (const observation of observations) {
      linkedRuntimeConsumerObservationKeys.add([
        observation.publicationKey,
        observation.projectId,
        observation.draftNetworkKey,
        observation.optionId,
        observation.observedAt,
      ].map(normalizeText).join(':'))
    }
    if (!publication?.publicationKey) continue
    const impactEvents = filterRuntimeEvidenceForDraft(
      item,
      impactMonitoringByPublicationKey.get(publication.publicationKey) ?? [],
    )
    for (const event of impactEvents) {
      linkedRuntimeImpactMonitoringKeys.add([
        event.sourcePublicationKey,
        event.projectId,
        event.draftNetworkKey,
        event.optionId,
        event.executedAt,
      ].map(normalizeText).join(':'))
    }
    const rollbackEvents = filterRuntimeEvidenceForDraft(
      item,
      rollbackExecutionByPublicationKey.get(publication.publicationKey) ?? [],
    )
    for (const event of rollbackEvents) {
      linkedRollbackExecutionKeys.add([
        event.sourcePublicationKey,
        event.projectId,
        event.draftNetworkKey,
        event.optionId,
        event.executedAt,
      ].map(normalizeText).join(':'))
    }
    const outcomes = filterRuntimeEvidenceForDraft(
      item,
      outcomesByPublicationKey.get(publication.publicationKey) ?? [],
    )
    for (const outcome of outcomes) {
      linkedPlanNetworkOutcomeKeys.add([
        outcome.publicationKey,
        outcome.projectId,
        outcome.draftNetworkKey,
        outcome.optionId,
        outcome.outcomeRef,
        outcome.observedAt,
      ].map(normalizeText).join(':'))
    }
    const engineEvidence = filterRuntimeEvidenceForDraft(
      item,
      engineEvidenceByPublicationKey.get(publication.publicationKey) ?? [],
    )
    for (const evidence of engineEvidence) {
      linkedRuntimeEngineEvidenceKeys.add([
        evidence.publicationKey,
        evidence.projectId,
        evidence.draftNetworkKey,
        evidence.optionId,
        evidence.evidenceId,
        evidence.engineCode,
      ].map(normalizeText).join(':'))
    }
  }
  const hasPrePublicationRuntimeConsumerObservation = items.some((item) => {
    const publication = findPublicationForDraft(item)
    const evidence = filterRuntimeConsumerObservationsForDraft(item, publication, observationsByPublicationKey)
    return hasRuntimeEvidenceBeforePublication(publication, evidence, (item) => item.observedAt)
  })
  const hasPrePublicationImpactMonitoringResult = items.some((item) => {
    const publication = findPublicationForDraft(item)
    const evidence = publication?.publicationKey
      ? filterRuntimeEvidenceForDraft(item, impactMonitoringByPublicationKey.get(publication.publicationKey) ?? [])
      : []
    return hasRuntimeEvidenceBeforePublication(publication, evidence, (item) => item.executedAt)
  })
  const hasPrePublicationRollbackExecutionVerification = items.some((item) => {
    const publication = findPublicationForDraft(item)
    const evidence = publication?.publicationKey
      ? filterRuntimeEvidenceForDraft(item, rollbackExecutionByPublicationKey.get(publication.publicationKey) ?? [])
      : []
    return hasRuntimeEvidenceBeforePublication(publication, evidence, (item) => item.executedAt)
  })
  const hasPrePublicationSavedNetworkOutcome = items.some((item) => {
    const publication = findPublicationForDraft(item)
    const evidence = publication?.publicationKey
      ? filterRuntimeEvidenceForDraft(item, outcomesByPublicationKey.get(publication.publicationKey) ?? [])
      : []
    return hasRuntimeEvidenceBeforePublication(publication, evidence, (item) => item.observedAt)
  })
  const hasPrePublicationRuntimeEngineEvidence = items.some((item) => {
    const publication = findPublicationForDraft(item)
    const evidence = publication?.publicationKey
      ? filterRuntimeEvidenceForDraft(item, engineEvidenceByPublicationKey.get(publication.publicationKey) ?? [])
      : []
    return hasRuntimeEvidenceBeforePublication(publication, evidence, (item) => item.backtestedAt)
  })
  const missingBeforeRuntime = [
    linkedReleaseExitHandoffCount >= totalDraftCount && hasDrafts ? null : 'release_exit_handoff_candidate_event_required',
    linkedRuntimePublicationCount >= totalDraftCount && hasDrafts ? null : 'domain_writer_runtime_execution_required',
    linkedRuntimeConsumerObservationCount >= totalDraftCount && hasDrafts ? null : 'runtime_consumer_observation_required',
    linkedRuntimeImpactMonitoringCount >= totalDraftCount && hasDrafts ? null : 'post_materialization_impact_monitoring_result_required',
    linkedRuntimePublicationCount >= totalDraftCount && hasDrafts ? null : 'runtime_release_record_persistence_required',
    linkedRollbackExecutionVerificationCount >= totalDraftCount && hasDrafts ? null : 'rollback_execution_verification_required',
    linkedPlanNetworkOutcomeCount >= totalDraftCount && hasDrafts ? null : 'saved_network_outcome_required',
    linkedRuntimeEngineEvidenceCount >= totalDraftCount && hasDrafts
      ? null
      : 'true_per_option_runtime_e1_e3_e5_evidence_required',
    hasPrePublicationRuntimeConsumerObservation ? 'runtime_consumer_observation_before_publication' : null,
    hasPrePublicationImpactMonitoringResult ? 'post_materialization_impact_monitoring_before_publication' : null,
    hasPrePublicationRollbackExecutionVerification ? 'rollback_execution_before_publication' : null,
    hasPrePublicationSavedNetworkOutcome ? 'saved_network_outcome_before_publication' : null,
    hasPrePublicationRuntimeEngineEvidence ? 'runtime_engine_evidence_before_publication' : null,
  ].filter((item): item is string => Boolean(item))

  const status = missingBeforeRuntime.length === 0 && hasDrafts
    ? 'runtime_materialization_evidence_ready'
    : releaseExitHandoffs.length > 0
      ? 'blocked_candidate_only_after_release_exit_handoff'
      : 'blocked_pending_release_exit_handoff'

  return {
    source: 'construction_organization_plan_network_runtime_materialization_readiness',
    status,
    canMaterializeRuntime: false,
    totalDraftCount,
    releaseExitPreparationCount,
    domainWriterReleaseExitReadinessCount,
    releaseExitHandoffCandidateCount: releaseExitHandoffs.length,
    linkedReleaseExitHandoffCount,
    domainWriterRuntimeExecutionCount: runtimePublications.length,
    readyForDomainWriterExecutionCount: linkedRuntimePublicationCount,
    runtimeConsumerObservationCount: linkedRuntimeConsumerObservationKeys.size,
    readyForRuntimeConsumerObservationCount: linkedRuntimeConsumerObservationCount,
    runtimeImpactMonitoringResultCount: linkedRuntimeImpactMonitoringKeys.size,
    readyForRuntimeImpactMonitoringResultCount: linkedRuntimeImpactMonitoringCount,
    rollbackExecutionVerificationCount: linkedRollbackExecutionKeys.size,
    readyForRollbackExecutionVerificationCount: linkedRollbackExecutionVerificationCount,
    savedNetworkOutcomeCount: linkedPlanNetworkOutcomeKeys.size,
    readyForSavedNetworkOutcomeCount: linkedPlanNetworkOutcomeCount,
    perOptionRuntimeEngineEvidenceCount: linkedRuntimeEngineEvidenceKeys.size,
    readyForPerOptionRuntimeEngineEvidenceCount: linkedRuntimeEngineEvidenceCount,
    missingBeforeRuntime,
    mutationBoundary: {
      writesTaskDependencies: false,
      writesPlanDates: false,
      writesSeed: false,
      writesBaseline: false,
      writesCriticalPathFacts: false,
      writesAccelerationDraft: false,
    },
    boundaryPolicy: [
      'runtime_materialization_readiness_is_read_only',
      'release_exit_handoff_candidate_event_is_not_domain_writer_execution',
      'domain_writer_runtime_execution_requires_separate_apply_record',
      'runtime_consumer_observation_monitoring_release_record_and_rollback_required',
      'saved_network_outcome_required_before_runtime_materialization_claim',
      'true_per_option_runtime_e1_e3_e5_evidence_required_before_runtime_materialization_claim',
      'does_not_write_task_dependencies_or_plan_dates',
    ],
  }
}

function buildRuntimeCloseoutClaim(
  readiness: ConstructionOrganizationPlanNetworkRuntimeMaterializationReadiness,
  runtimeRecommendedOption: ConstructionOrganizationPlanNetworkRuntimeRecommendedOption,
  draftClaims: ConstructionOrganizationPlanNetworkRuntimeCloseoutClaim[] = [],
): ConstructionOrganizationPlanNetworkRuntimeCloseoutClaim {
  const hasRuntimeMaterializationEvidence = readiness.status === 'runtime_materialization_evidence_ready'
    && readiness.totalDraftCount > 0
    && readiness.missingBeforeRuntime.length === 0
  const hasSiteAdoption = runtimeRecommendedOption.siteDecisionMatchesRuntimeRecommendation === true
  const draftClaimMissing = Array.from(new Set(draftClaims.flatMap((claim) => claim.missingBeforeClaim)))
  const missingBeforeClaim = Array.from(new Set([
    ...readiness.missingBeforeRuntime,
    ...draftClaimMissing,
    runtimeRecommendedOption.siteDecisionAttributionGap,
    runtimeRecommendedOption.siteDecisionBusinessTypeConflict,
    runtimeRecommendedOption.siteDecisionTimingGap,
    hasRuntimeMaterializationEvidence && !hasSiteAdoption
      ? 'site_adoption_of_runtime_recommended_option_required'
      : null,
  ].filter((item): item is string => Boolean(item))))
  const canClaimRuntimeCloseout = hasRuntimeMaterializationEvidence
    && hasSiteAdoption
    && draftClaims.every((claim) => claim.canClaimRuntimeCloseout)
    && missingBeforeClaim.length === 0
  return {
    source: 'construction_organization_plan_network_runtime_closeout_claim',
    status: canClaimRuntimeCloseout ? 'runtime_closeout_claim_ready' : 'runtime_closeout_claim_blocked',
    canClaimRuntimeCloseout,
    canMaterializeRuntime: false,
    totalDraftCount: readiness.totalDraftCount,
    claimBasis: canClaimRuntimeCloseout
      ? [
          'release_exit_handoff_linked_for_every_draft',
          'domain_writer_runtime_publication_linked_for_every_draft',
          'runtime_consumer_observation_linked_for_every_draft',
          'impact_monitoring_passed_for_every_draft',
          'rollback_execution_verified_for_every_draft',
          'saved_network_outcome_linked_for_every_draft',
          'true_per_option_E1_E3_E5_runtime_evidence_linked_for_every_draft',
          'site_adoption_of_runtime_recommended_option_linked',
        ]
      : [],
    missingBeforeClaim,
    mutationBoundary: {
      writesTaskDependencies: false,
      writesPlanDates: false,
      writesSeed: false,
      writesBaseline: false,
      writesCriticalPathFacts: false,
      writesAccelerationDraft: false,
    },
    boundaryPolicy: [
      'runtime_closeout_claim_is_a_read_only_audit_projection',
      'runtime_closeout_claim_does_not_grant_runtime_materialization',
      'requires_runtime_materialization_evidence_ready',
      'requires_site_adoption_of_runtime_recommended_option',
      'does_not_write_task_dependencies_or_plan_dates',
      'does_not_write_seed_baseline_task_facts_acceleration_drafts_or_critical_path_facts',
    ],
  }
}

function collectMissingRuntimeUseCaseCoverage(
  runtimeMaterializationEvidence: ConstructionOrganizationPlanNetworkOptionRuntimeMaterializationEvidence,
) {
  return CONSTRUCTION_ORGANIZATION_PLAN_NETWORK_REQUIRED_USE_CASES
    .filter((useCase) =>
      runtimeMaterializationEvidence.runtimeUseCaseCoverage?.[useCase]?.canClaimRuntimeUseCaseEvidence !== true)
    .map((useCase) => `runtime_use_case_coverage_required:${useCase}`)
}

function buildRuntimeCloseoutClaimFromDraftEvidence(input: {
  item: ConstructionOrganizationPlanNetworkDraft
  runtimeEvidenceIndexes: ConstructionOrganizationPlanNetworkRuntimeEvidenceIndexes
  recommendationDecisionIndex: ReturnType<typeof indexRecommendationDecisions>
}): ConstructionOrganizationPlanNetworkRuntimeCloseoutClaim {
  const publication = findRuntimePublicationForDraft(input.item, input.runtimeEvidenceIndexes)
  const runtimeMaterializationEvidence = buildOptionRuntimeMaterializationEvidence(input.item, input.runtimeEvidenceIndexes)
  const siteDecision = input.item.recommendationDecision
    ?? input.recommendationDecisionIndex.findForDraft(input.item, publication)
  const hasSiteAdoption = runtimeDecisionMatchesDraft(input.item, publication, siteDecision) === true
  const hasRuntimeMaterializationEvidence = runtimeMaterializationEvidence.canClaimRuntimeMaterializationEvidence
  const draftBusinessType = normalizeText(input.item.businessType)
  const siteDecisionBusinessType = normalizeText(siteDecision?.businessType)
  const siteDecisionBusinessTypeAttributionGap = draftBusinessType && siteDecision && !siteDecisionBusinessType
    ? 'runtime_business_type_attribution_required'
    : null
  const siteDecisionBusinessTypeConflict = draftBusinessType && siteDecisionBusinessType && draftBusinessType !== siteDecisionBusinessType
    ? `runtime_business_type_conflict:${siteDecisionBusinessType}`
    : null
  const siteDecisionTimingGap = siteDecision && publication && isDecisionBeforeRuntimePublication(siteDecision, publication)
    ? 'site_adoption_before_runtime_publication'
    : null
  const missingRuntimeUseCaseCoverage = collectMissingRuntimeUseCaseCoverage(runtimeMaterializationEvidence)
  const missingBeforeClaim = [
    ...runtimeMaterializationEvidence.missingBeforeRuntime,
    ...missingRuntimeUseCaseCoverage,
    siteDecisionBusinessTypeAttributionGap,
    siteDecisionBusinessTypeConflict,
    siteDecisionTimingGap,
    hasRuntimeMaterializationEvidence && !hasSiteAdoption
      ? 'site_adoption_of_runtime_recommended_option_required'
      : null,
  ].filter((item): item is string => Boolean(item))
  const canClaimRuntimeCloseout = hasRuntimeMaterializationEvidence
    && hasSiteAdoption
    && missingBeforeClaim.length === 0

  return {
    source: 'construction_organization_plan_network_runtime_closeout_claim',
    status: canClaimRuntimeCloseout ? 'runtime_closeout_claim_ready' : 'runtime_closeout_claim_blocked',
    canClaimRuntimeCloseout,
    canMaterializeRuntime: false,
    totalDraftCount: 1,
    claimBasis: canClaimRuntimeCloseout
      ? [
          'release_exit_handoff_linked_for_draft',
          'domain_writer_runtime_publication_linked_for_draft',
          'runtime_consumer_observation_linked_for_draft',
          'impact_monitoring_passed_for_draft',
          'rollback_execution_verified_for_draft',
          'saved_network_outcome_linked_for_draft',
          'true_per_option_E1_E3_E5_runtime_evidence_linked_for_draft',
          'site_adoption_of_runtime_recommended_option_linked',
        ]
      : [],
    missingBeforeClaim,
    mutationBoundary: {
      writesTaskDependencies: false,
      writesPlanDates: false,
      writesSeed: false,
      writesBaseline: false,
      writesCriticalPathFacts: false,
      writesAccelerationDraft: false,
    },
    boundaryPolicy: [
      'runtime_closeout_claim_is_a_read_only_audit_projection',
      'runtime_closeout_claim_does_not_grant_runtime_materialization',
      'requires_draft_runtime_materialization_evidence_ready',
      'requires_site_adoption_of_runtime_recommended_option',
      'does_not_write_task_dependencies_or_plan_dates',
      'does_not_write_seed_baseline_task_facts_acceleration_drafts_or_critical_path_facts',
    ],
  }
}

function buildRuntimeCloseoutClaimsByDraftNetworkKey(input: {
  items: ConstructionOrganizationPlanNetworkDraft[]
  runtimeEvidenceIndexes: ConstructionOrganizationPlanNetworkRuntimeEvidenceIndexes
  recommendationDecisionIndex: ReturnType<typeof indexRecommendationDecisions>
}) {
  const claimsByDraftNetworkKey: Record<string, ConstructionOrganizationPlanNetworkRuntimeCloseoutClaim> = {}
  for (const item of input.items) {
    claimsByDraftNetworkKey[item.draftNetworkKey] = buildRuntimeCloseoutClaimFromDraftEvidence({
      item,
      runtimeEvidenceIndexes: input.runtimeEvidenceIndexes,
      recommendationDecisionIndex: input.recommendationDecisionIndex,
    })
  }
  return claimsByDraftNetworkKey
}

function buildRuntimeCloseoutProjectDraftKey(projectId: string | null | undefined, draftNetworkKey: string | null | undefined) {
  const normalizedProjectId = normalizeText(projectId)
  const normalizedDraftNetworkKey = normalizeText(draftNetworkKey)
  return normalizedProjectId && normalizedDraftNetworkKey
    ? `${normalizedProjectId}::${normalizedDraftNetworkKey}`
    : null
}

function buildRuntimeCloseoutClaimsByProjectDraftNetworkKey(input: {
  items: ConstructionOrganizationPlanNetworkDraft[]
  runtimeEvidenceIndexes: ConstructionOrganizationPlanNetworkRuntimeEvidenceIndexes
  recommendationDecisionIndex: ReturnType<typeof indexRecommendationDecisions>
}) {
  const claimsByProjectDraftNetworkKey: Record<string, ConstructionOrganizationPlanNetworkRuntimeCloseoutClaim> = {}
  for (const item of input.items) {
    const key = buildRuntimeCloseoutProjectDraftKey(item.projectId, item.draftNetworkKey)
    if (!key) continue
    claimsByProjectDraftNetworkKey[key] = buildRuntimeCloseoutClaimFromDraftEvidence({
      item,
      runtimeEvidenceIndexes: input.runtimeEvidenceIndexes,
      recommendationDecisionIndex: input.recommendationDecisionIndex,
    })
  }
  return claimsByProjectDraftNetworkKey
}

function buildRuntimeCloseoutClaimsByProject(input: {
  items: ConstructionOrganizationPlanNetworkDraft[]
  releaseExitHandoffs: ConstructionOrganizationPlanNetworkReleaseExitHandoffProjection[]
  runtimePublications: ConstructionOrganizationPlanNetworkRuntimePublicationProjection[]
  runtimeConsumerObservations: ConstructionOrganizationPlanNetworkRuntimeConsumerObservationProjection[]
  runtimeEvents: ConstructionOrganizationPlanNetworkRuntimeEventProjection[]
  planNetworkOutcomes: ConstructionOrganizationPlanNetworkOutcomeProjection[]
  runtimeEngineEvidence: ConstructionOrganizationPlanNetworkRuntimeEngineEvidenceProjection[]
  recommendationDecisionIndex: ReturnType<typeof indexRecommendationDecisions>
}) {
  const projectIds = Array.from(new Set(input.items
    .map((item) => normalizeText(item.projectId))
    .filter((item): item is string => Boolean(item))))
  const claimsByProject: Record<string, ConstructionOrganizationPlanNetworkRuntimeCloseoutClaim> = {}
  for (const projectId of projectIds) {
    const projectItems = input.items.filter((item) => normalizeText(item.projectId) === projectId)
    const projectRuntimePublications = input.runtimePublications.filter((publication) => publication.projectId === projectId)
    const publicationKeys = new Set(projectRuntimePublications.map((publication) => publication.publicationKey))
    const projectRuntimeConsumerObservations = filterByPublicationKeys(
      input.runtimeConsumerObservations,
      publicationKeys,
      (item) => item.publicationKey,
    )
    const projectRuntimeEvents = filterByPublicationKeys(
      input.runtimeEvents,
      publicationKeys,
      (item) => item.sourcePublicationKey,
    )
    const projectPlanNetworkOutcomes = filterByPublicationKeys(
      input.planNetworkOutcomes,
      publicationKeys,
      (item) => item.publicationKey,
    )
    const projectRuntimeEngineEvidence = filterByPublicationKeys(
      input.runtimeEngineEvidence,
      publicationKeys,
      (item) => item.publicationKey,
    )
    const projectRuntimeEvidenceIndexes = buildRuntimeEvidenceIndexes({
      runtimePublications: projectRuntimePublications,
      runtimeConsumerObservations: projectRuntimeConsumerObservations,
      runtimeEvents: projectRuntimeEvents,
      planNetworkOutcomes: projectPlanNetworkOutcomes,
      runtimeEngineEvidence: projectRuntimeEngineEvidence,
    })
    const readiness = buildRuntimeMaterializationReadiness(
      projectItems,
      input.releaseExitHandoffs,
      projectRuntimePublications,
      projectRuntimeConsumerObservations,
      projectRuntimeEvents,
      projectPlanNetworkOutcomes,
      projectRuntimeEngineEvidence,
    )
    const runtimeRecommendedOption = buildRuntimeRecommendedOption(
      projectItems,
      projectRuntimeEvidenceIndexes,
      input.recommendationDecisionIndex,
    )
    const projectDraftClaims = projectItems.map((item) => buildRuntimeCloseoutClaimFromDraftEvidence({
      item,
      runtimeEvidenceIndexes: projectRuntimeEvidenceIndexes,
      recommendationDecisionIndex: input.recommendationDecisionIndex,
    }))
    claimsByProject[projectId] = buildRuntimeCloseoutClaim(readiness, runtimeRecommendedOption, projectDraftClaims)
  }
  return claimsByProject
}

export async function listConstructionOrganizationPlanNetworkDrafts(
  input: ListConstructionOrganizationMaterializationReviewPackagesInput,
): Promise<ConstructionOrganizationPlanNetworkDraftReport> {
  const reviewPackageReport = await listConstructionOrganizationMaterializationReviewPackages(input)
  const handoffRows = await queryManualReviewHandoffRows({
    companyId: reviewPackageReport.companyId,
    projectId: reviewPackageReport.projectId,
    limit: input.limit,
    maxLimit: input.maxLimit,
    queryExec: input.queryExec,
  })
  const handoffs = handoffRows
    .map(buildManualReviewHandoffProjection)
    .filter((handoff): handoff is ConstructionOrganizationPlanNetworkManualReviewHandoffProjection => Boolean(handoff))
  const handoffByDraftKey = indexManualReviewHandoffs(handoffs)
  const approvalRows = await queryManualReviewApprovalRows({
    companyId: reviewPackageReport.companyId,
    projectId: reviewPackageReport.projectId,
    limit: input.limit,
    maxLimit: input.maxLimit,
    queryExec: input.queryExec,
  })
  const approvals = approvalRows
    .map(buildManualReviewApprovalProjection)
    .filter((approval): approval is ConstructionOrganizationPlanNetworkManualReviewApprovalProjection => Boolean(approval))
  const approvalByDraftKey = indexManualReviewApprovals(approvals)
  const conflictReviewRows = await queryManualConflictReviewRows({
    companyId: reviewPackageReport.companyId,
    projectId: reviewPackageReport.projectId,
    limit: input.limit,
    maxLimit: input.maxLimit,
    queryExec: input.queryExec,
  })
  const conflictReviews = conflictReviewRows
    .map(buildManualConflictReviewProjection)
    .filter((review): review is ConstructionOrganizationPlanNetworkManualConflictReviewProjection => Boolean(review))
  const conflictReviewByDraftKey = indexManualConflictReviews(conflictReviews)
  const releaseExitHandoffRows = await queryReleaseExitHandoffRows({
    companyId: reviewPackageReport.companyId,
    projectId: reviewPackageReport.projectId,
    limit: input.limit,
    maxLimit: input.maxLimit,
    queryExec: input.queryExec,
  })
  const releaseExitHandoffs = releaseExitHandoffRows
    .map(buildReleaseExitHandoffProjection)
    .filter((handoff): handoff is ConstructionOrganizationPlanNetworkReleaseExitHandoffProjection => Boolean(handoff))
  const releaseExitHandoffByDraftKey = indexReleaseExitHandoffs(releaseExitHandoffs)
  const runtimePublicationRows = await queryRuntimePublicationRows({
    companyId: reviewPackageReport.companyId,
    projectId: reviewPackageReport.projectId,
    limit: input.limit,
    maxLimit: input.maxLimit,
    queryExec: input.queryExec,
  })
  const runtimePublications = runtimePublicationRows
    .map(buildRuntimePublicationProjection)
    .filter((publication): publication is ConstructionOrganizationPlanNetworkRuntimePublicationProjection => Boolean(publication))
  const runtimeConsumerObservationRows = await queryRuntimeConsumerObservationRows({
    publicationKeys: runtimePublications.map((publication) => publication.publicationKey),
    limit: input.limit,
    maxLimit: input.maxLimit,
    queryExec: input.queryExec,
  })
  const runtimeConsumerObservations = runtimeConsumerObservationRows
    .map(buildRuntimeConsumerObservationProjection)
    .filter((observation): observation is ConstructionOrganizationPlanNetworkRuntimeConsumerObservationProjection => Boolean(observation))
  const runtimeEventRows = await queryRuntimeEventRows({
    publicationKeys: runtimePublications.map((publication) => publication.publicationKey),
    limit: input.limit,
    maxLimit: input.maxLimit,
    queryExec: input.queryExec,
  })
  const runtimeEvents = runtimeEventRows
    .map(buildRuntimeEventProjection)
    .filter((event): event is ConstructionOrganizationPlanNetworkRuntimeEventProjection => Boolean(event))
  const planNetworkOutcomeRows = await queryPlanNetworkOutcomeRows({
    publicationKeys: runtimePublications.map((publication) => publication.publicationKey),
    limit: input.limit,
    maxLimit: input.maxLimit,
    queryExec: input.queryExec,
  })
  const planNetworkOutcomes = planNetworkOutcomeRows
    .map(buildPlanNetworkOutcomeProjection)
    .filter((outcome): outcome is ConstructionOrganizationPlanNetworkOutcomeProjection => Boolean(outcome))
  const runtimeEngineEvidenceRows = await queryRuntimeEngineEvidenceRows({
    publicationKeys: runtimePublications.map((publication) => publication.publicationKey),
    limit: input.limit,
    maxLimit: input.maxLimit,
    queryExec: input.queryExec,
  })
  const runtimeEngineEvidence = runtimeEngineEvidenceRows
    .map(buildRuntimeEngineEvidenceProjection)
    .filter((evidence): evidence is ConstructionOrganizationPlanNetworkRuntimeEngineEvidenceProjection => Boolean(evidence))
  const { buildSummary: buildRuntimeEngineEvidenceSummary } = indexRuntimeEngineEvidence(runtimeEngineEvidence)
  const runtimeEvidenceIndexes = buildRuntimeEvidenceIndexes({
    runtimePublications,
    runtimeConsumerObservations,
    runtimeEvents,
    planNetworkOutcomes,
    runtimeEngineEvidence,
  })
  const baseDrafts = reviewPackageReport.items
    .map(buildConstructionOrganizationPlanNetworkDraftFromReviewPackageItem)
  const findRuntimePublicationForBaseDraft = (draft: ConstructionOrganizationPlanNetworkDraft) => {
    const releaseExitHandoff = releaseExitHandoffByDraftKey.get(draft.draftNetworkKey) ?? null
    return runtimePublications.find((item) => (
      runtimePublicationMatchesDraft(draft, item)
      && (
        item.draftNetworkKey === draft.draftNetworkKey
        || (releaseExitHandoff?.candidateEventId && item.releaseHandoffCandidateEventId === releaseExitHandoff.candidateEventId)
      )
    )) ?? null
  }
  const recommendationDecisionRows = await queryRecommendationDecisionRows({
    projectId: reviewPackageReport.projectId,
    projectIds: runtimePublications.map((publication) => publication.projectId),
    recommendationKeys: baseDrafts.flatMap((draft) => buildRecommendationKeysForDraft(
      draft,
      findRuntimePublicationForBaseDraft(draft),
    )),
    limit: input.limit,
    maxLimit: input.maxLimit,
    queryExec: input.queryExec,
  })
  const recommendationDecisionIndex = indexRecommendationDecisions(recommendationDecisionRows
    .map(buildRecommendationDecisionProjection)
    .filter((decision): decision is ConstructionOrganizationPlanNetworkRecommendationDecisionProjection => Boolean(decision)), baseDrafts)
  const items = baseDrafts
    .map((draft) => {
      const manualReviewHandoff = handoffByDraftKey.get(draft.draftNetworkKey) ?? null
      const manualReviewApproval = approvalByDraftKey.get(draft.draftNetworkKey) ?? null
      const manualConflictReviewDecision = conflictReviewByDraftKey.get(draft.draftNetworkKey) ?? null
      const effectiveDraft = applyManualConflictReviewProjection({
        ...draft,
        manualReviewHandoff,
        manualConflictReviewDecision,
        manualReviewApproval,
      }, manualConflictReviewDecision)
      const releaseExitHandoff = releaseExitHandoffByDraftKey.get(draft.draftNetworkKey) ?? null
      const releaseExitAssessment = buildReleaseExitAssessment(effectiveDraft, manualReviewHandoff, manualReviewApproval)
      const releaseExitPreparation = buildReleaseExitPreparation(
        effectiveDraft,
        manualReviewHandoff,
        manualReviewApproval,
        releaseExitAssessment,
      )
      const publication = runtimePublications.find((item) => (
        runtimePublicationMatchesDraft(draft, item)
        && (
          item.draftNetworkKey === draft.draftNetworkKey
          || (releaseExitHandoff?.candidateEventId && item.releaseHandoffCandidateEventId === releaseExitHandoff.candidateEventId)
        )
      ))
      return {
        ...effectiveDraft,
        manualReviewHandoff,
        manualConflictReviewDecision,
        manualReviewApproval,
        releaseExitHandoff,
        releaseExitAssessment,
        releaseExitPreparation,
        domainWriterReleaseExitReadiness: buildDomainWriterReleaseExitReadiness(releaseExitPreparation),
        runtimeEngineEvidence: buildRuntimeEngineEvidenceSummary(publication?.publicationKey ?? null),
        recommendationDecision: recommendationDecisionIndex.findForDraft(draft, publication),
      }
    })
  const recommendedDrafts: ConstructionOrganizationPlanNetworkDraftReport['recommendedDrafts'] = {
    newProjectPlanning: selectRecommendedDraft(items, 'newProjectPlanning'),
    startingLineOnboarding: selectRecommendedDraft(items, 'startingLineOnboarding'),
    accelerationRecovery: selectRecommendedDraft(items, 'accelerationRecovery'),
  }
  const runtimeMaterializationReadiness = buildRuntimeMaterializationReadiness(
    items,
    releaseExitHandoffs,
    runtimePublications,
    runtimeConsumerObservations,
    runtimeEvents,
    planNetworkOutcomes,
    runtimeEngineEvidence,
  )
  const runtimeRecommendedOption = buildRuntimeRecommendedOption(items, runtimeEvidenceIndexes, recommendationDecisionIndex)
  const runtimeCloseoutClaimLineage = items.find((item) =>
    item.draftNetworkKey === runtimeRecommendedOption.draftNetworkKey
      || item.optionId === runtimeRecommendedOption.optionId,
  )?.runtimeEvidenceLineage ?? {
    workPackageKey: null,
    useCase: null,
    evidenceAction: null,
  }
  const runtimeCloseoutClaimsByProject = buildRuntimeCloseoutClaimsByProject({
    items,
    releaseExitHandoffs,
    runtimePublications,
    runtimeConsumerObservations,
    runtimeEvents,
    planNetworkOutcomes,
    runtimeEngineEvidence,
    recommendationDecisionIndex,
  })
  const runtimeCloseoutClaimsByDraftNetworkKey = buildRuntimeCloseoutClaimsByDraftNetworkKey({
    items,
    runtimeEvidenceIndexes,
    recommendationDecisionIndex,
  })
  const runtimeCloseoutClaimsByProjectDraftNetworkKey = buildRuntimeCloseoutClaimsByProjectDraftNetworkKey({
    items,
    runtimeEvidenceIndexes,
    recommendationDecisionIndex,
  })

  return {
    source: 'construction_organization_plan_network_draft_read_model',
    companyId: reviewPackageReport.companyId,
    projectId: reviewPackageReport.projectId,
    totalReviewPackageItems: reviewPackageReport.totalReviewPackageItems,
    totalDraftCount: items.length,
    readyForReplayCount: items.filter((item) => item.readiness === 'ready_for_replay').length,
    evaluationReadyCount: items.filter((item) => item.evaluationEvidence.evaluationStatus === 'evaluation_ready').length,
    partialEvaluationCount: items.filter((item) => item.evaluationEvidence.evaluationStatus === 'partial_evidence').length,
    evidenceOnlyCount: items.filter((item) => item.readiness === 'evidence_only').length,
    blockedCount: items.filter((item) => item.readiness === 'blocked').length,
    totalEdgeCount: items.reduce((sum, item) => sum + item.edgeCount, 0),
    totalManualReviewHandoffCount: handoffs.length,
    linkedManualReviewHandoffCount: items.filter((item) => item.manualReviewHandoff).length,
    totalManualReviewApprovalCount: approvals.length,
    linkedManualReviewApprovalCount: items.filter((item) => item.manualReviewApproval).length,
    totalReleaseExitHandoffCount: releaseExitHandoffs.length,
    linkedReleaseExitHandoffCount: items.filter((item) => item.releaseExitHandoff).length,
    runtimeMaterializationReadiness,
    runtimeCloseoutClaim: buildRuntimeCloseoutClaim(
      runtimeMaterializationReadiness,
      runtimeRecommendedOption,
      items.map((item) => buildRuntimeCloseoutClaimFromDraftEvidence({
        item,
        runtimeEvidenceIndexes,
        recommendationDecisionIndex,
      })),
    ),
    runtimeCloseoutClaimLineage,
    runtimeCloseoutClaimsByProject,
    runtimeCloseoutClaimsByDraftNetworkKey,
    runtimeCloseoutClaimsByProjectDraftNetworkKey,
    runtimeRecommendedOption,
    recommendedDrafts,
    optionComparisonPackage: buildOptionComparisonPackage(items, recommendedDrafts, runtimeEvidenceIndexes, recommendationDecisionIndex),
    items,
    boundaryPolicy: [
      'read_only_projection_from_materialization_review_packages',
      'plan_network_draft_is_not_runtime_materialization',
      'no_task_dependencies_write',
      'no_plan_dates_write',
      'no_seed_write',
      'no_baseline_write',
      'no_critical_path_fact_write',
      'domain_writer_release_exit_monitoring_and_rollback_required_for_future_materialization',
    ],
  }
}

function manualReviewHandoffReasons(draft: ConstructionOrganizationPlanNetworkDraft | null | undefined) {
  if (!draft) return ['draft_network_required']
  const conflictReviewAllowed = draft.readiness === 'conflict_review_required'
  const reasons = [
    draft.readiness === 'ready_for_replay' || conflictReviewAllowed ? null : 'draft_not_ready_for_replay',
    draft.evaluationEvidence.evaluationStatus === 'evaluation_ready' ? null : 'draft_evaluation_not_ready',
    draft.edgeCount > 0 && draft.edges.length > 0 ? null : 'draft_has_no_edges',
    draft.reviewRequired ? null : 'draft_review_required_flag_missing',
    draft.mutationBoundary.writesTaskDependencies === false ? null : 'draft_write_boundary_unknown',
    draft.edges.every((edge) => edge.writesTaskDependencies === false) ? null : 'draft_edge_write_boundary_unknown',
  ].filter((item): item is string => Boolean(item))
  return [...new Set([
    ...reasons,
    ...draft.blockedReasons.filter((reason) => !(
      conflictReviewAllowed
      && isConstructionOrganizationConflictReviewHandoffReason(reason)
    )),
  ])]
}

function manualReviewApprovalReasons(draft: ConstructionOrganizationPlanNetworkDraft | null | undefined) {
  if (!draft) return ['draft_network_required']
  const reasons: string[] = []
  if (!draft.manualReviewHandoff?.candidateEventId) reasons.push('manual_review_handoff_required')
  if (draft.manualReviewHandoff && draft.manualReviewHandoff.candidateEventId && draft.manualReviewHandoff.writesTaskDependencies !== false) {
    reasons.push('handoff_write_boundary_unknown')
  }
  if (draft.readiness !== 'ready_for_replay') reasons.push('draft_not_ready_for_replay')
  if (draft.evaluationEvidence.evaluationStatus !== 'evaluation_ready') reasons.push('draft_evaluation_not_ready')
  if (!(draft.edgeCount > 0) || !Array.isArray(draft.edges) || draft.edges.length === 0) reasons.push('draft_has_no_edges')
  if (draft.mutationBoundary.writesTaskDependencies !== false) reasons.push('draft_write_boundary_unknown')
  return [...new Set([...reasons, ...draft.blockedReasons])]
}

function manualConflictReviewDecisionReasons(input: {
  draft: ConstructionOrganizationPlanNetworkDraft | null | undefined
  manualReviewHandoff?: ConstructionOrganizationPlanNetworkManualReviewHandoffProjection | null
}) {
  const draft = input.draft
  if (!draft) return ['draft_network_required']
  const handoff = input.manualReviewHandoff ?? draft.manualReviewHandoff
  const reasons: string[] = []
  if (draft.readiness !== 'conflict_review_required') reasons.push('draft_not_in_conflict_review')
  if (!handoff?.candidateEventId) reasons.push('manual_review_handoff_required')
  if (handoff?.writesTaskDependencies !== false) reasons.push('handoff_write_boundary_unknown')
  if (draft.evaluationEvidence.evaluationStatus !== 'evaluation_ready') reasons.push('draft_evaluation_not_ready')
  if (!(draft.edgeCount > 0) || !Array.isArray(draft.edges) || draft.edges.length === 0) reasons.push('draft_has_no_edges')
  if (draft.mutationBoundary.writesTaskDependencies !== false) reasons.push('draft_write_boundary_unknown')
  const nonConflictReasons = draft.blockedReasons.filter((reason) => !isConstructionOrganizationConflictReviewHandoffReason(reason))
  return [...new Set([...reasons, ...nonConflictReasons])]
}

function releaseExitHandoffReasons(
  draft: ConstructionOrganizationPlanNetworkDraft | null | undefined,
  input: {
    releaseRecordTarget?: string | null
    rollbackTarget?: string | null
    consumerVerificationRefs?: string[]
    impactMonitoringRefs?: string[]
    rollbackWriterRefs?: string[]
  },
) {
  const reasons: string[] = []
  if (!normalizeText(input.releaseRecordTarget)) reasons.push('release_record_target_required')
  if (!normalizeText(input.rollbackTarget)) reasons.push('rollback_target_required')
  if ((input.consumerVerificationRefs ?? []).filter((item) => normalizeText(item)).length === 0) {
    reasons.push('runtime_consumer_verification_ref_required')
  }
  if ((input.impactMonitoringRefs ?? []).filter((item) => normalizeText(item)).length === 0) {
    reasons.push('impact_monitoring_ref_required')
  }
  if ((input.rollbackWriterRefs ?? []).filter((item) => normalizeText(item)).length === 0) {
    reasons.push('rollback_writer_ref_required')
  }
  if (!draft) {
    reasons.push('draft_network_required')
    return [...new Set(reasons)]
  }
  if (!draft.releaseExitPreparation) reasons.push('release_exit_preparation_required')
  if (!draft.domainWriterReleaseExitReadiness) reasons.push('domain_writer_release_exit_readiness_required')
  if (!draft.manualReviewHandoff?.candidateEventId) reasons.push('manual_review_handoff_required')
  if (!draft.manualReviewApproval?.candidateEventId) reasons.push('manual_review_approval_required')
  if (draft.readiness !== 'ready_for_replay') reasons.push('draft_not_ready_for_replay')
  if (draft.evaluationEvidence.evaluationStatus !== 'evaluation_ready') reasons.push('draft_evaluation_not_ready')
  if (!(draft.edgeCount > 0) || !Array.isArray(draft.edges) || draft.edges.length === 0) reasons.push('draft_has_no_edges')
  if (draft.mutationBoundary.writesTaskDependencies !== false) reasons.push('draft_write_boundary_unknown')
  if (draft.releaseExitPreparation?.canMaterializeRuntime !== false) reasons.push('release_exit_preparation_boundary_unknown')
  if (draft.domainWriterReleaseExitReadiness?.canMaterializeRuntime !== false) {
    reasons.push('domain_writer_release_exit_readiness_boundary_unknown')
  }
  return [...new Set([...reasons, ...draft.blockedReasons])]
}

export function buildConstructionOrganizationPlanNetworkManualReviewHandoff(input: {
  draft?: ConstructionOrganizationPlanNetworkDraft | null
  requestedByUserId?: string | null
  executedAt?: string | null
}): ConstructionOrganizationPlanNetworkManualReviewHandoffResult {
  const draft = input.draft ?? null
  const reasons = manualReviewHandoffReasons(draft)
  const proposedDependencyEdges = draft && reasons.length === 0
    ? draft.edges
    : []

  return {
    source: 'construction_organization_plan_network_manual_review_handoff',
    status: reasons.length === 0 ? 'manual_review_handoff_ready' : 'manual_review_handoff_blocked',
    draftNetworkKey: draft?.draftNetworkKey ?? null,
    candidateEventId: draft?.candidateEventId ?? null,
    optionId: draft?.optionId ?? null,
    selectedScenarioIds: draft?.selectedScenarioIds ?? [],
    requestedByUserId: normalizeText(input.requestedByUserId),
    executedAt: normalizeText(input.executedAt),
    proposedDependencyEdgeCount: proposedDependencyEdges.length,
    reviewPackage: {
      source: 'construction_organization_plan_network_manual_review_handoff',
      reviewOperation: 'manual_review_dependency_proposal',
      reviewRequired: true,
      proposedDependencyEdges,
      writesTaskDependencies: false,
      writesPlanDates: false,
      writesCriticalPathFacts: false,
    },
    reasons,
    writesTaskDependencies: false,
    writesPlanDates: false,
    writesSeed: false,
    writesBaseline: false,
    writesCriticalPathFacts: false,
    writesAccelerationDraft: false,
    boundaryPolicy: [
      'manual_review_handoff_is_not_runtime_materialization',
      'domain_writer_does_not_write_task_dependencies',
      'domain_writer_does_not_write_plan_dates',
      'release_exit_still_required_before_any_runtime_write',
      'monitoring_and_rollback_still_required_before_runtime_materialization',
    ],
  }
}

export function buildConstructionOrganizationPlanNetworkManualConflictReviewDecision(input: {
  draft?: ConstructionOrganizationPlanNetworkDraft | null
  manualReviewHandoff?: ConstructionOrganizationPlanNetworkManualReviewHandoffProjection | null
  decision: 'approved_ready_for_replay' | 'rejected_needs_plan_date_adjustment'
  reviewedByUserId?: string | null
  reviewedAt?: string | null
  decisionNotes?: string | null
}): ConstructionOrganizationPlanNetworkManualConflictReviewDecisionResult {
  const draft = input.draft ?? null
  const reasons = manualConflictReviewDecisionReasons({
    draft,
    manualReviewHandoff: input.manualReviewHandoff,
  })
  const status = reasons.length === 0 && input.decision === 'approved_ready_for_replay'
    ? 'manual_conflict_review_ready'
    : 'manual_conflict_review_blocked'
  const resultingReadiness: ConstructionOrganizationPlanNetworkDraftReadiness = status === 'manual_conflict_review_ready'
    ? 'ready_for_replay'
    : 'conflict_review_required'
  const handoff = input.manualReviewHandoff ?? draft?.manualReviewHandoff ?? null

  return {
    source: 'construction_organization_plan_network_manual_conflict_review',
    status,
    draftNetworkKey: draft?.draftNetworkKey ?? null,
    handoffCandidateEventId: handoff?.candidateEventId ?? null,
    decision: input.decision,
    resultingReadiness,
    reviewedByUserId: normalizeText(input.reviewedByUserId),
    reviewedAt: normalizeText(input.reviewedAt),
    decisionNotes: normalizeText(input.decisionNotes),
    reasons,
    writesTaskDependencies: false,
    writesPlanDates: false,
    writesSeed: false,
    writesBaseline: false,
    writesCriticalPathFacts: false,
    writesAccelerationDraft: false,
    boundaryPolicy: [
      'manual_conflict_review_is_candidate_only',
      'manual_conflict_review_does_not_write_task_dependencies',
      'manual_conflict_review_does_not_write_plan_dates',
      'manual_review_approval_still_required_before_release_exit',
      'release_exit_still_required_before_any_runtime_write',
    ],
  }
}

export async function persistConstructionOrganizationPlanNetworkManualConflictReviewDecision(input: {
  draft?: ConstructionOrganizationPlanNetworkDraft | null
  manualReviewHandoff?: ConstructionOrganizationPlanNetworkManualReviewHandoffProjection | null
  companyId?: string | null
  projectId?: string | null
  decision: 'approved_ready_for_replay' | 'rejected_needs_plan_date_adjustment'
  reviewedByUserId?: string | null
  reviewedAt?: string | null
  decisionNotes?: string | null
  queryExec?: AlgorithmAssetGovernanceQueryExec
}): Promise<PersistConstructionOrganizationPlanNetworkManualConflictReviewDecisionResult> {
  const conflictReview = buildConstructionOrganizationPlanNetworkManualConflictReviewDecision({
    draft: input.draft,
    manualReviewHandoff: input.manualReviewHandoff,
    decision: input.decision,
    reviewedByUserId: input.reviewedByUserId,
    reviewedAt: input.reviewedAt,
    decisionNotes: input.decisionNotes,
  })

  if (conflictReview.status !== 'manual_conflict_review_ready' || !input.draft) {
    return {
      ...conflictReview,
      governanceCandidateEvent: null,
      governancePersistence: null,
    }
  }

  const draftKeySegment = safeAssetKeySegment(conflictReview.draftNetworkKey) || 'unknown_draft'
  const result = await createAndPersistAlgorithmAssetCandidateEvent({
    assetKey: `${CONSTRUCTION_ORGANIZATION_PLAN_NETWORK_CONFLICT_REVIEW_ASSET_PREFIX}${draftKeySegment}`,
    sourceSystem: CONSTRUCTION_ORGANIZATION_PLAN_NETWORK_CONFLICT_REVIEW_SOURCE_MODULE,
    assetType: 'rule',
    companyId: input.companyId,
    projectId: input.projectId,
    candidatePayload: {
      source: 'construction_organization_plan_network_manual_conflict_review_candidate',
      draftNetworkKey: conflictReview.draftNetworkKey,
      handoffCandidateEventId: conflictReview.handoffCandidateEventId,
      originalDraftAssetKey: input.draft.assetKey,
      decision: conflictReview.decision,
      resultingReadiness: conflictReview.resultingReadiness,
      reviewedByUserId: conflictReview.reviewedByUserId,
      reviewedAt: conflictReview.reviewedAt,
      decisionNotes: conflictReview.decisionNotes,
      runtimeMutationBoundary: {
        writesTaskDependencies: false,
        writesPlanDates: false,
        writesSeed: false,
        writesBaseline: false,
        writesCriticalPathFacts: false,
        writesAccelerationDraft: false,
      },
      boundaryPolicy: [
        ...conflictReview.boundaryPolicy,
        'persisted_as_algorithm_asset_candidate_event_only',
        'manual_conflict_review_event_does_not_materialize_dependencies',
      ],
    },
    publishAnchor: 'manual_governance_required',
    automationMaturity: 'auto_review_package',
    learningMaturity: 'governed_candidate',
    learningTarget: 'dependency_order',
    requestedRuntimeEffect: 'candidate_only',
    generatedBy: 'service',
    evidence: {
      sourceHealthPassed: true,
      conflictFree: true,
    },
    queryExec: input.queryExec,
  })

  return {
    ...conflictReview,
    governanceCandidateEvent: result.event,
    governancePersistence: result.persistence,
  }
}

export function buildConstructionOrganizationPlanNetworkManualReviewApproval(input: {
  draft?: ConstructionOrganizationPlanNetworkDraft | null
  approvedByUserId?: string | null
  approvedAt?: string | null
}): ConstructionOrganizationPlanNetworkManualReviewApprovalResult {
  const draft = input.draft ?? null
  const reasons = manualReviewApprovalReasons(draft)

  return {
    source: 'construction_organization_plan_network_manual_review_approval',
    status: reasons.length === 0 ? 'manual_review_approval_ready' : 'manual_review_approval_blocked',
    draftNetworkKey: draft?.draftNetworkKey ?? null,
    handoffCandidateEventId: draft?.manualReviewHandoff?.candidateEventId ?? null,
    approvedByUserId: normalizeText(input.approvedByUserId),
    approvedAt: normalizeText(input.approvedAt),
    approvalDecision: 'approved_for_release_exit_preparation',
    reasons,
    writesTaskDependencies: false,
    writesPlanDates: false,
    writesSeed: false,
    writesBaseline: false,
    writesCriticalPathFacts: false,
    writesAccelerationDraft: false,
    boundaryPolicy: [
      'manual_review_approval_is_not_runtime_materialization',
      'manual_review_approval_does_not_write_task_dependencies',
      'manual_review_approval_does_not_write_plan_dates',
      'release_exit_still_required_before_any_runtime_write',
      'monitoring_and_rollback_still_required_before_runtime_materialization',
    ],
  }
}

export function buildConstructionOrganizationPlanNetworkReleaseExitHandoff(input: {
  draft?: ConstructionOrganizationPlanNetworkDraft | null
  requestedByUserId?: string | null
  executedAt?: string | null
  releaseRecordTarget?: string | null
  rollbackTarget?: string | null
  consumerVerificationRefs?: string[]
  impactMonitoringRefs?: string[]
  rollbackWriterRefs?: string[]
}): ConstructionOrganizationPlanNetworkReleaseExitHandoffResult {
  const draft = input.draft ?? null
  const consumerVerificationRefs = (input.consumerVerificationRefs ?? []).map(normalizeText).filter((item): item is string => Boolean(item))
  const impactMonitoringRefs = (input.impactMonitoringRefs ?? []).map(normalizeText).filter((item): item is string => Boolean(item))
  const rollbackWriterRefs = (input.rollbackWriterRefs ?? []).map(normalizeText).filter((item): item is string => Boolean(item))
  const reasons = releaseExitHandoffReasons(draft, {
    releaseRecordTarget: input.releaseRecordTarget,
    rollbackTarget: input.rollbackTarget,
    consumerVerificationRefs,
    impactMonitoringRefs,
    rollbackWriterRefs,
  })
  const proposedDependencyEdges = draft && reasons.length === 0
    ? draft.edges
    : []

  return {
    source: 'construction_organization_plan_network_release_exit_handoff',
    status: reasons.length === 0 ? 'release_exit_handoff_ready' : 'release_exit_handoff_blocked',
    canMaterializeRuntime: false,
    draftNetworkKey: draft?.draftNetworkKey ?? null,
    candidateEventId: draft?.candidateEventId ?? null,
    handoffCandidateEventId: draft?.manualReviewHandoff?.candidateEventId ?? null,
    approvalCandidateEventId: draft?.manualReviewApproval?.candidateEventId ?? null,
    optionId: draft?.optionId ?? null,
    selectedScenarioIds: draft?.selectedScenarioIds ?? [],
    requestedByUserId: normalizeText(input.requestedByUserId),
    executedAt: normalizeText(input.executedAt),
    releaseRecordTarget: normalizeText(input.releaseRecordTarget),
    rollbackTarget: normalizeText(input.rollbackTarget),
    consumerVerificationRefs,
    impactMonitoringRefs,
    rollbackWriterRefs,
    proposedDependencyEdgeCount: proposedDependencyEdges.length,
    proposedDependencyEdges,
    packageArtifacts: draft?.releaseExitPreparation?.packageArtifacts ?? [],
    reasons,
    writesTaskDependencies: false,
    writesPlanDates: false,
    writesSeed: false,
    writesBaseline: false,
    writesCriticalPathFacts: false,
    writesAccelerationDraft: false,
    boundaryPolicy: [
      'release_exit_handoff_is_candidate_only',
      'release_exit_handoff_does_not_materialize_runtime',
      'domain_writer_execution_still_requires_separate_runtime_apply_record',
      'consumer_verification_monitoring_release_record_and_rollback_are_required_before_runtime_claim',
      'does_not_write_task_dependencies_or_plan_dates',
    ],
  }
}

export async function persistConstructionOrganizationPlanNetworkManualReviewApproval(input: {
  draft?: ConstructionOrganizationPlanNetworkDraft | null
  companyId?: string | null
  projectId?: string | null
  approvedByUserId?: string | null
  approvedAt?: string | null
  queryExec?: AlgorithmAssetGovernanceQueryExec
}): Promise<PersistConstructionOrganizationPlanNetworkManualReviewApprovalResult> {
  const approval = buildConstructionOrganizationPlanNetworkManualReviewApproval({
    draft: input.draft,
    approvedByUserId: input.approvedByUserId,
    approvedAt: input.approvedAt,
  })

  if (approval.status !== 'manual_review_approval_ready' || !input.draft) {
    return {
      ...approval,
      governanceCandidateEvent: null,
      governancePersistence: null,
    }
  }

  const draftKeySegment = safeAssetKeySegment(approval.draftNetworkKey) || 'unknown_draft'
  const result = await createAndPersistAlgorithmAssetCandidateEvent({
    assetKey: `construction_organization.plan_network_approval.${draftKeySegment}`,
    sourceSystem: 'constructionOrganizationPlanNetworkDraftService.manualReviewApproval',
    assetType: 'rule',
    companyId: input.companyId,
    projectId: input.projectId,
    candidatePayload: {
      source: 'construction_organization_plan_network_manual_review_approval_candidate',
      draftNetworkKey: approval.draftNetworkKey,
      handoffCandidateEventId: approval.handoffCandidateEventId,
      originalDraftAssetKey: input.draft.assetKey,
      approvedByUserId: approval.approvedByUserId,
      approvedAt: approval.approvedAt,
      approvalDecision: approval.approvalDecision,
      runtimeMutationBoundary: {
        writesTaskDependencies: false,
        writesPlanDates: false,
        writesSeed: false,
        writesBaseline: false,
        writesCriticalPathFacts: false,
        writesAccelerationDraft: false,
      },
      boundaryPolicy: [
        ...approval.boundaryPolicy,
        'persisted_as_algorithm_asset_candidate_event_only',
        'manual_review_approval_event_does_not_materialize_dependencies',
      ],
    },
    publishAnchor: 'manual_governance_required',
    automationMaturity: 'auto_review_package',
    learningMaturity: 'governed_candidate',
    learningTarget: 'dependency_order',
    requestedRuntimeEffect: 'candidate_only',
    generatedBy: 'service',
    evidence: {
      sourceHealthPassed: true,
      conflictFree: true,
    },
    queryExec: input.queryExec,
  })

  return {
    ...approval,
    governanceCandidateEvent: result.event,
    governancePersistence: result.persistence,
  }
}

export async function persistConstructionOrganizationPlanNetworkManualReviewHandoff(input: {
  draft?: ConstructionOrganizationPlanNetworkDraft | null
  companyId?: string | null
  projectId?: string | null
  requestedByUserId?: string | null
  executedAt?: string | null
  queryExec?: AlgorithmAssetGovernanceQueryExec
}): Promise<PersistConstructionOrganizationPlanNetworkManualReviewHandoffResult> {
  const handoff = buildConstructionOrganizationPlanNetworkManualReviewHandoff({
    draft: input.draft,
    requestedByUserId: input.requestedByUserId,
    executedAt: input.executedAt,
  })

  if (handoff.status !== 'manual_review_handoff_ready' || !input.draft) {
    return {
      ...handoff,
      governanceCandidateEvent: null,
      governancePersistence: null,
    }
  }

  const draftKeySegment = safeAssetKeySegment(handoff.draftNetworkKey) || 'unknown_draft'
  const result = await createAndPersistAlgorithmAssetCandidateEvent({
    assetKey: `construction_organization.plan_network_handoff.${draftKeySegment}`,
    sourceSystem: 'constructionOrganizationPlanNetworkDraftService.manualReviewHandoff',
    assetType: 'rule',
    companyId: input.companyId,
    projectId: input.projectId,
    candidatePayload: {
      source: 'construction_organization_plan_network_manual_review_handoff_candidate',
      draftNetworkKey: handoff.draftNetworkKey,
      originalCandidateEventId: handoff.candidateEventId,
      originalDraftAssetKey: input.draft.assetKey,
      optionId: handoff.optionId,
      selectedScenarioIds: handoff.selectedScenarioIds,
      requestedByUserId: handoff.requestedByUserId,
      executedAt: handoff.executedAt,
      reviewPackage: handoff.reviewPackage,
      evaluationEvidence: input.draft.evaluationEvidence,
      useCaseEvaluationEvidence: input.draft.useCaseEvaluationEvidence,
      replayRequirements: input.draft.replayRequirements,
      evaluationRequirements: input.draft.evaluationRequirements,
      mutationBoundary: input.draft.mutationBoundary,
      runtimeMutationBoundary: {
        writesTaskDependencies: false,
        writesPlanDates: false,
        writesSeed: false,
        writesBaseline: false,
        writesCriticalPathFacts: false,
        writesAccelerationDraft: false,
      },
      boundaryPolicy: [
        ...handoff.boundaryPolicy,
        'persisted_as_algorithm_asset_candidate_event_only',
        'manual_review_event_does_not_materialize_dependencies',
      ],
    },
    publishAnchor: 'manual_governance_required',
    automationMaturity: 'auto_review_package',
    learningMaturity: 'governed_candidate',
    learningTarget: 'dependency_order',
    requestedRuntimeEffect: 'candidate_only',
    generatedBy: 'service',
    evidence: {
      sourceHealthPassed: true,
      conflictFree: true,
    },
    queryExec: input.queryExec,
  })

  return {
    ...handoff,
    governanceCandidateEvent: result.event,
    governancePersistence: result.persistence,
  }
}

export async function persistConstructionOrganizationPlanNetworkReleaseExitHandoff(input: {
  draft?: ConstructionOrganizationPlanNetworkDraft | null
  companyId?: string | null
  projectId?: string | null
  requestedByUserId?: string | null
  executedAt?: string | null
  releaseRecordTarget?: string | null
  rollbackTarget?: string | null
  consumerVerificationRefs?: string[]
  impactMonitoringRefs?: string[]
  rollbackWriterRefs?: string[]
  queryExec?: AlgorithmAssetGovernanceQueryExec
}): Promise<PersistConstructionOrganizationPlanNetworkReleaseExitHandoffResult> {
  const handoff = buildConstructionOrganizationPlanNetworkReleaseExitHandoff({
    draft: input.draft,
    requestedByUserId: input.requestedByUserId,
    executedAt: input.executedAt,
    releaseRecordTarget: input.releaseRecordTarget,
    rollbackTarget: input.rollbackTarget,
    consumerVerificationRefs: input.consumerVerificationRefs,
    impactMonitoringRefs: input.impactMonitoringRefs,
    rollbackWriterRefs: input.rollbackWriterRefs,
  })

  if (handoff.status !== 'release_exit_handoff_ready' || !input.draft) {
    return {
      ...handoff,
      governanceCandidateEvent: null,
      governancePersistence: null,
    }
  }

  const draftKeySegment = safeAssetKeySegment(handoff.draftNetworkKey) || 'unknown_draft'
  const result = await createAndPersistAlgorithmAssetCandidateEvent({
    assetKey: `construction_organization.plan_network_release_exit_handoff.${draftKeySegment}`,
    sourceSystem: 'constructionOrganizationPlanNetworkDraftService.releaseExitHandoff',
    assetType: 'rule',
    companyId: input.companyId,
    projectId: input.projectId,
    candidatePayload: {
      source: 'construction_organization_plan_network_release_exit_handoff_candidate',
      draftNetworkKey: handoff.draftNetworkKey,
      originalCandidateEventId: handoff.candidateEventId,
      originalDraftAssetKey: input.draft.assetKey,
      handoffCandidateEventId: handoff.handoffCandidateEventId,
      approvalCandidateEventId: handoff.approvalCandidateEventId,
      optionId: handoff.optionId,
      selectedScenarioIds: handoff.selectedScenarioIds,
      requestedByUserId: handoff.requestedByUserId,
      executedAt: handoff.executedAt,
      releaseRecordTarget: handoff.releaseRecordTarget,
      rollbackTarget: handoff.rollbackTarget,
      consumerVerificationRefs: handoff.consumerVerificationRefs,
      impactMonitoringRefs: handoff.impactMonitoringRefs,
      rollbackWriterRefs: handoff.rollbackWriterRefs,
      releaseExitPreparation: input.draft.releaseExitPreparation,
      domainWriterReleaseExitReadiness: input.draft.domainWriterReleaseExitReadiness,
      proposedDependencyEdges: handoff.proposedDependencyEdges,
      evaluationEvidence: input.draft.evaluationEvidence,
      useCaseEvaluationEvidence: input.draft.useCaseEvaluationEvidence,
      mutationBoundary: input.draft.mutationBoundary,
      runtimeMutationBoundary: {
        writesTaskDependencies: false,
        writesPlanDates: false,
        writesSeed: false,
        writesBaseline: false,
        writesCriticalPathFacts: false,
        writesAccelerationDraft: false,
      },
      boundaryPolicy: [
        ...handoff.boundaryPolicy,
        'persisted_as_algorithm_asset_candidate_event_only',
        'release_exit_handoff_event_does_not_materialize_dependencies',
      ],
    },
    publishAnchor: 'manual_governance_required',
    automationMaturity: 'auto_review_package',
    learningMaturity: 'governed_candidate',
    learningTarget: 'dependency_order',
    requestedRuntimeEffect: 'candidate_only',
    generatedBy: 'service',
    evidence: {
      sourceHealthPassed: true,
      conflictFree: true,
      rollbackTarget: handoff.rollbackTarget ?? undefined,
    },
    queryExec: input.queryExec,
  })

  return {
    ...handoff,
    governanceCandidateEvent: result.event,
    governancePersistence: result.persistence,
  }
}
