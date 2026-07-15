import { apiGet, apiPost } from '@/lib/apiClient'

const RULE_ASSET_GOVERNANCE_WORKBENCH_ENDPOINT = '/api/planning/algorithm-seeds/rule-assets/governance-workbench'
const RULE_ASSET_GOVERNANCE_COMPLETION_AUDIT_ENDPOINT = '/api/planning/algorithm-seeds/rule-assets/governance-completion-audit'
const RULE_ASSET_GOVERNANCE_WORKBENCH_OPERATION_ENDPOINT = `${RULE_ASSET_GOVERNANCE_WORKBENCH_ENDPOINT}/operations`
const CONSTRUCTION_ORGANIZATION_PLAN_NETWORK_DRAFTS_ENDPOINT =
  `${RULE_ASSET_GOVERNANCE_WORKBENCH_ENDPOINT}/construction-organization/plan-network-drafts`

export type RuleAssetGovernanceWorkbenchStatus = 'workbench_ready' | 'workbench_incomplete'
export type RuleAssetGovernanceWorkbenchGateStatus = 'ready' | 'needs_work'
export type RuleAssetGovernanceWorkbenchCompletionScope = 'workbench_readiness_evidence_only'
export type RuleAssetGovernanceWorkbenchClosureGapStatus = 'not_proven_by_workbench_readiness'
export type RuleAssetGovernanceWorkbenchOperationStatus = 'operation_blocked' | 'operation_delegated'
export type RuleAssetGovernanceWorkbenchOperationAction =
  | 'release_exit_handoff'
  | 'manual_review_handoff'
  | 'manual_conflict_review'
  | 'manual_review_approval'
  | 'runtime_apply'
  | 'runtime_impact_monitoring'
  | 'runtime_rollback_execution'
  | 'runtime_consumer_observation'
  | 'runtime_engine_evidence'
  | 'runtime_saved_outcome'
  | 'runtime_recommendation_adopt'
  | 'runtime_recommendation_decline'
  | 'runtime_rollback'
export type RuleAssetGovernanceCompletionDeclarationStatus =
  | 'current_snapshot_gate_passed'
  | 'evidence_layer_ready'
  | 'runtime_surface_closed'
  | 'chapter_completion_candidate'
  | 'v14223_governance_complete_current_snapshot'
  | 'review_required'
export type RuleAssetGovernanceWorkbenchAssetType =
  | 'learnable_parameter'
  | 'algorithm_seed'
  | 'policy_template'
  | 'forecast_residual_overlay'
  | 'cold_start_baseline'
  | 'sample_health'
  | 'dependency_rule'
  | 'template_seed'
  | 'construction_organization_plan_network'

export interface RuleAssetGovernanceWorkbenchSummary {
  totalAssetCount: number
  algorithmSeedCount: number
  totalDiscoveredCount: number
  registeredCount: number
  reviewItemCount: number
  blockerCount: number
  durationRelatedAssetCount: number
  durationRelatedCoverageRatio: number
  explicitGovernanceFieldCount: number
  conservativeGovernanceDefaultCount: number
  governanceDefaultReviewItemCount: number
  candidateReviewRequiredCount: number
  replayBlockedOrFailedCount: number
  sampleHealthWeakOrRejectedCount: number
  readyGateCount: number
  needsWorkGateCount: number
  totalGateCount: number
}

export interface RuleAssetGovernanceDefaultReviewItem {
  assetKey: string
  sourcePath: string
  durationRelated: boolean
  learningTarget: string
  learningMaturity: string
  publishAnchor: string
  automationMaturity: string
  reason: string
}

export interface RuleAssetGovernanceWorkbenchGate {
  key: string
  status: RuleAssetGovernanceWorkbenchGateStatus
  evidenceRefs: string[]
  missingReasons: string[]
  details?: Record<string, unknown>
}

export interface RuleAssetGovernanceWorkbenchClosureGap {
  key: string
  status: RuleAssetGovernanceWorkbenchClosureGapStatus
  evidenceRequired: string[]
  reason: string
}

export interface RuleAssetGovernanceWorkbenchReadiness {
  reportCode: 'v14223_rule_asset_governance_workbench_readiness'
  companyId: string | null
  status: RuleAssetGovernanceWorkbenchStatus
  canDeclareGovernanceWorkbenchComplete: boolean
  completionScope: RuleAssetGovernanceWorkbenchCompletionScope
  canDeclareV14223GovernanceComplete: boolean
  remainingClosureGaps: RuleAssetGovernanceWorkbenchClosureGap[]
  frontendExposurePolicy: 'backend_admin_governance_only'
  runtimeMutationPolicy: 'none_read_only_evidence_and_gap_report'
  summary: RuleAssetGovernanceWorkbenchSummary
  governanceDefaultReviewItems: RuleAssetGovernanceDefaultReviewItem[]
  gates: RuleAssetGovernanceWorkbenchGate[]
  boundaryPolicy: string[]
}

export interface RuleAssetGovernanceCompletionAuditRecordResult {
  surface: string
  status: 'verified' | 'incomplete'
  missingReasons: string[]
}

export interface RuleAssetGovernanceCompletionAudit {
  reportCode: 'v14223_completion_audit'
  declarationStatus: RuleAssetGovernanceCompletionDeclarationStatus
  canDeclareChapterCompletionCandidate: boolean
  canDeclareV14223GovernanceComplete: boolean
  missingReasons: string[]
  requiredSurfaces: string[]
  recordResults: RuleAssetGovernanceCompletionAuditRecordResult[]
  boundaryPolicy: string[]
}

export interface RuleAssetGovernanceWorkbenchOperationInput {
  action: RuleAssetGovernanceWorkbenchOperationAction
  assetType: RuleAssetGovernanceWorkbenchAssetType
  evidenceToken: string
  workPackageKey?: string | null
  useCase?: string | null
  evidenceAction?: string | null
  businessType?: string | null
  companyId?: string | null
  projectId?: string | null
  requestedByUserId?: string | null
  executedAt?: string | null
  domainWriterKey?: string
  sourcePublicationKey?: string
  optionId?: string
  draftNetworkKey?: string
  releaseRecordTarget?: string
  rollbackTarget?: string
  rollbackReason?: string
  engineCode?: string
  predictedDurationDays?: number
  actualDurationDays?: number
  overlayKey?: string
  baselineKey?: string
  segmentKey?: string
  consumerVerificationRefs?: string[]
  impactMonitoringRefs?: string[]
  rollbackWriterRefs?: string[]
  selectedScenarioIds?: string[]
  manualConflictReviewDecision?: 'approved_ready_for_replay' | 'rejected_needs_plan_date_adjustment' | null
  constructionOrganizationPlanNetworkDraft?: Record<string, unknown>
}

export interface RuleAssetGovernanceWorkbenchOperationResult {
  status: RuleAssetGovernanceWorkbenchOperationStatus
  operationAction: RuleAssetGovernanceWorkbenchOperationAction | null
  assetType: RuleAssetGovernanceWorkbenchAssetType | null
  writesRuntimeDirectly: false
  workbenchDoesNotGrantPublishRights: true
  delegatedToDomainWriter: boolean
  domainWriterKey: string | null
  reasons: string[]
  domainResult: unknown | null
  boundaryPolicy: string[]
}

export type ConstructionOrganizationPlanNetworkDraftReadiness = 'ready_for_replay' | 'conflict_review_required' | 'evidence_only' | 'blocked'
export type ConstructionOrganizationPlanNetworkDraftEvaluationStatus =
  | 'evaluation_ready'
  | 'partial_evidence'
  | 'missing_evaluation_evidence'
export type ConstructionOrganizationPlanNetworkUseCaseKey =
  | 'newProjectPlanning'
  | 'startingLineOnboarding'
  | 'accelerationRecovery'

const CONSTRUCTION_ORGANIZATION_PLAN_NETWORK_USE_CASES: ConstructionOrganizationPlanNetworkUseCaseKey[] = [
  'newProjectPlanning',
  'startingLineOnboarding',
  'accelerationRecovery',
]

export interface ConstructionOrganizationPlanNetworkDraftEdge {
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

export interface ConstructionOrganizationPlanNetworkManualConflictWindow {
  startDay: number | null
  finishDay: number | null
  plannedStartDate: string | null
  plannedEndDate: string | null
}

export interface ConstructionOrganizationPlanNetworkManualConflictEvidence {
  edgeId: string
  fromGeneratedRowId: string
  toGeneratedRowId: string
  dependencyType: ConstructionOrganizationPlanNetworkDraftEdge['dependencyType']
  lagDays: number
  intent: string | null
  fromVirtualNodeId: string | null
  toVirtualNodeId: string | null
  reason: string
  fromWindow: ConstructionOrganizationPlanNetworkManualConflictWindow
  toWindow: ConstructionOrganizationPlanNetworkManualConflictWindow
  writesTaskDependencies: false
  writesPlanDates: false
}

export interface ConstructionOrganizationPlanNetworkDraftEvaluationEvidence {
  evaluationStatus: ConstructionOrganizationPlanNetworkDraftEvaluationStatus
  e1: Record<string, unknown> | null
  e3: Record<string, unknown> | null
  e5: Record<string, unknown> | null
  evidenceGaps: string[]
  boundaryPolicy: string[]
}

export interface ConstructionOrganizationPlanNetworkManualReviewHandoffProjection {
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

export interface ConstructionOrganizationPlanNetworkManualReviewApprovalProjection {
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

export interface ConstructionOrganizationPlanNetworkManualConflictReviewProjection {
  source: 'construction_organization_plan_network_manual_conflict_review_projection'
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
  decision: 'approved_ready_for_replay' | 'rejected_needs_plan_date_adjustment'
  resultingReadiness: ConstructionOrganizationPlanNetworkDraftReadiness
  writesTaskDependencies: false
  writesPlanDates: false
  writesSeed: false
  writesBaseline: false
  writesCriticalPathFacts: false
  writesAccelerationDraft: false
}

export interface ConstructionOrganizationPlanNetworkReleaseExitHandoffProjection {
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

export interface ConstructionOrganizationPlanNetworkRecommendationDecisionProjection {
  source: 'construction_organization_plan_network_recommendation_decision_projection'
  recommendationKind: 'construction_organization_plan_network'
  recommendationKey: string
  actionType: 'adopted' | 'declined'
  optionId: string | null
  draftNetworkKey: string | null
  publicationKey: string | null
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

export interface ConstructionOrganizationPlanNetworkReleaseExitAssessment {
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

export interface ConstructionOrganizationPlanNetworkReleaseExitPreparation {
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
  useCaseEvaluationEvidence: Record<string, unknown>
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

export interface ConstructionOrganizationPlanNetworkDomainWriterReleaseExitReadiness {
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

export interface ConstructionOrganizationPlanNetworkRuntimeMaterializationReadiness {
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

export interface ConstructionOrganizationPlanNetworkRuntimeCloseoutClaim {
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

export interface ConstructionOrganizationPlanNetworkRuntimeRecommendedOption {
  source: 'construction_organization_plan_network_runtime_recommended_option'
  status: 'runtime_recommended_option_ready' | 'runtime_recommended_option_blocked'
  optionId: string | null
  draftNetworkKey: string | null
  publicationKey: string | null
  selectedScenarioIds: string[]
  canAutoAdoptRuntimeOption: false
  siteDecision?: ConstructionOrganizationPlanNetworkRecommendationDecisionProjection | null
  siteDecisionMatchesRuntimeRecommendation?: boolean | null
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

export type ConstructionOrganizationPlanNetworkRuntimeEngineEvidenceStatus =
  | 'runtime_engine_evidence_ready'
  | 'partial_runtime_engine_evidence'
  | 'missing_runtime_engine_evidence'

export type ConstructionOrganizationPlanNetworkRuntimeEngineCode = 'E1' | 'E3' | 'E5'

export interface ConstructionOrganizationPlanNetworkRuntimeEngineEvidenceSummary {
  source: 'construction_organization_plan_network_runtime_engine_evidence_summary'
  status: ConstructionOrganizationPlanNetworkRuntimeEngineEvidenceStatus
  publicationKey: string | null
  presentEngineCodes: ConstructionOrganizationPlanNetworkRuntimeEngineCode[]
  missingEngineCodes: ConstructionOrganizationPlanNetworkRuntimeEngineCode[]
  evidenceCount: number
  canClaimTruePerOptionRuntimeEvaluation: boolean
  boundaryPolicy: string[]
}

export type ConstructionOrganizationPlanNetworkOptionRuntimeMaterializationEvidenceStatus =
  | 'runtime_evidence_ready'
  | 'missing_runtime_evidence'

export interface ConstructionOrganizationPlanNetworkOptionRuntimeMaterializationEvidence {
  source: 'construction_organization_plan_network_option_runtime_materialization_evidence'
  status: ConstructionOrganizationPlanNetworkOptionRuntimeMaterializationEvidenceStatus
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

export interface ConstructionOrganizationPlanNetworkManualConflictReviewPackage {
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

export interface ConstructionOrganizationPlanNetworkDraft {
  source: 'construction_organization_plan_network_draft'
  draftNetworkKey: string
  candidateEventId: string | null
  assetKey: string
  optionId: string | null
  businessType?: string | null
  selectedScenarioIds: string[]
  readiness: ConstructionOrganizationPlanNetworkDraftReadiness
  nodeCount: number
  edgeCount: number
  blockedReasons: string[]
  edges: ConstructionOrganizationPlanNetworkDraftEdge[]
  evaluationEvidence: ConstructionOrganizationPlanNetworkDraftEvaluationEvidence
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
  recommendationDecision?: ConstructionOrganizationPlanNetworkRecommendationDecisionProjection | null
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

export interface ConstructionOrganizationPlanNetworkDraftRecommendation {
  useCase: ConstructionOrganizationPlanNetworkUseCaseKey
  draftNetworkKey: string
  candidateEventId: string | null
  optionId: string | null
  selectedScenarioIds: string[]
  readiness: ConstructionOrganizationPlanNetworkDraftReadiness
  evaluationStatus: ConstructionOrganizationPlanNetworkDraftEvaluationStatus
  optionScore: number | null
  actionability: string | null
  e5RecoverableSpanDays: number | null
  runtimeEngineEvidenceStatus: ConstructionOrganizationPlanNetworkRuntimeEngineEvidenceStatus
  presentRuntimeEngineCodes: ConstructionOrganizationPlanNetworkRuntimeEngineCode[]
  missingRuntimeEngineCodes: ConstructionOrganizationPlanNetworkRuntimeEngineCode[]
  canClaimTruePerOptionRuntimeEvaluation: boolean
  recommendationBasis: string[]
  writesTaskDependencies: false
  writesPlanDates: false
  writesSeed: false
  writesAccelerationDraft: false
}

export interface ConstructionOrganizationPlanNetworkOptionComparisonScore {
  rank: number | null
  optionScore: number | null
  actionability: string | null
  e5RecoverableSpanDays: number | null
  rankBasis: string[]
}

export type ConstructionOrganizationPlanNetworkNextGovernanceAction =
  | 'manual_review_handoff'
  | 'manual_review_approval'
  | 'release_exit_handoff'
  | 'runtime_engine_evidence_required'
  | 'runtime_engine_evidence_ready'
  | 'runtime_materialization_evidence_required'
  | 'blocked'

export interface ConstructionOrganizationPlanNetworkOptionComparisonItem {
  source: 'construction_organization_plan_network_option_comparison_item'
  draftNetworkKey: string
  candidateEventId: string | null
  optionId: string | null
  selectedScenarioIds: string[]
  isRecommendedFor: ConstructionOrganizationPlanNetworkUseCaseKey[]
  readiness: ConstructionOrganizationPlanNetworkDraftReadiness
  evaluationStatus: ConstructionOrganizationPlanNetworkDraftEvaluationStatus
  runtimeEngineEvidenceStatus: ConstructionOrganizationPlanNetworkRuntimeEngineEvidenceStatus
  presentRuntimeEngineCodes: ConstructionOrganizationPlanNetworkRuntimeEngineCode[]
  missingRuntimeEngineCodes: ConstructionOrganizationPlanNetworkRuntimeEngineCode[]
  canClaimTruePerOptionRuntimeEvaluation: boolean
  useCaseScores: Record<ConstructionOrganizationPlanNetworkUseCaseKey, ConstructionOrganizationPlanNetworkOptionComparisonScore | null>
  proposedDependencyEdgeCount: number
  nextGovernanceAction: ConstructionOrganizationPlanNetworkNextGovernanceAction
  nextGovernanceReasons: string[]
  runtimeMaterializationEvidence: ConstructionOrganizationPlanNetworkOptionRuntimeMaterializationEvidence
  recommendationDecision?: ConstructionOrganizationPlanNetworkRecommendationDecisionProjection | null
  writesTaskDependencies: false
  writesPlanDates: false
  writesSeed: false
  writesAccelerationDraft: false
}

export interface ConstructionOrganizationPlanNetworkOptionComparisonPackage {
  source: 'construction_organization_plan_network_option_comparison_package'
  totalOptionCount: number
  recommendedOptionIdsByUseCase: Record<ConstructionOrganizationPlanNetworkUseCaseKey, string | null>
  canAutoMaterializeSelectedOption: false
  comparisonBasis: string[]
  options: ConstructionOrganizationPlanNetworkOptionComparisonItem[]
  boundaryPolicy: string[]
}

export interface ConstructionOrganizationPlanNetworkDraftReport {
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
  runtimeCloseoutClaimsByProjectDraftNetworkKey?: Record<string, ConstructionOrganizationPlanNetworkRuntimeCloseoutClaim>
  runtimeRecommendedOption: ConstructionOrganizationPlanNetworkRuntimeRecommendedOption
  recommendedDrafts: {
    newProjectPlanning: ConstructionOrganizationPlanNetworkDraftRecommendation | null
    startingLineOnboarding: ConstructionOrganizationPlanNetworkDraftRecommendation | null
    accelerationRecovery: ConstructionOrganizationPlanNetworkDraftRecommendation | null
  }
  optionComparisonPackage: ConstructionOrganizationPlanNetworkOptionComparisonPackage
  items: ConstructionOrganizationPlanNetworkDraft[]
  boundaryPolicy: string[]
}

function toNumber(value: unknown) {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

function toNullableNumber(value: unknown): number | null {
  if (value == null || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function toStringArray(value: unknown) {
  return Array.isArray(value) ? value.map((item) => String(item ?? '').trim()).filter(Boolean) : []
}

function toStringArrayRecord(value: unknown): Record<string, string[]> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return Object.fromEntries(Object.entries(value)
    .map(([key, item]) => [String(key), toStringArray(item)] as const)
    .filter(([key]) => key.length > 0))
}

function toRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  return value as Record<string, unknown>
}

function normalizeRuntimeEngineCodeArray(value: unknown): ConstructionOrganizationPlanNetworkRuntimeEngineCode[] {
  return toStringArray(value)
    .filter((item): item is ConstructionOrganizationPlanNetworkRuntimeEngineCode => item === 'E1' || item === 'E3' || item === 'E5')
}

function normalizeRuntimeEngineEvidenceStatus(raw: unknown): ConstructionOrganizationPlanNetworkRuntimeEngineEvidenceStatus {
  if (raw === 'runtime_engine_evidence_ready' || raw === 'partial_runtime_engine_evidence') return raw
  return 'missing_runtime_engine_evidence'
}

function normalizeRuntimeEngineEvidenceSummary(raw: any): ConstructionOrganizationPlanNetworkRuntimeEngineEvidenceSummary {
  const missingEngineCodes = normalizeRuntimeEngineCodeArray(raw?.missingEngineCodes)
  return {
    source: 'construction_organization_plan_network_runtime_engine_evidence_summary',
    status: normalizeRuntimeEngineEvidenceStatus(raw?.status),
    publicationKey: raw?.publicationKey == null ? null : String(raw.publicationKey),
    presentEngineCodes: normalizeRuntimeEngineCodeArray(raw?.presentEngineCodes),
    missingEngineCodes: missingEngineCodes.length > 0 ? missingEngineCodes : ['E1', 'E3', 'E5'],
    evidenceCount: toNumber(raw?.evidenceCount),
    canClaimTruePerOptionRuntimeEvaluation: Boolean(raw?.canClaimTruePerOptionRuntimeEvaluation),
    boundaryPolicy: toStringArray(raw?.boundaryPolicy),
  }
}

function normalizeRuntimeMaterializationEvidenceStatus(
  raw: unknown,
): ConstructionOrganizationPlanNetworkOptionRuntimeMaterializationEvidenceStatus {
  return raw === 'runtime_evidence_ready' ? 'runtime_evidence_ready' : 'missing_runtime_evidence'
}

function normalizeOptionRuntimeMaterializationEvidence(
  raw: any,
  runtimeEngineEvidence: {
    missingRuntimeEngineCodes: ConstructionOrganizationPlanNetworkRuntimeEngineCode[]
    canClaimTruePerOptionRuntimeEvaluation: boolean
  },
): ConstructionOrganizationPlanNetworkOptionRuntimeMaterializationEvidence {
  const missingBeforeRuntime = toStringArray(raw?.missingBeforeRuntime)
  const fallbackMissingBeforeRuntime = [
    ...(!runtimeEngineEvidence.canClaimTruePerOptionRuntimeEvaluation
      ? ['true_per_option_runtime_e1_e3_e5_evidence_required']
      : []),
    'runtime_materialization_evidence_required',
  ]
  const rawCoverage = raw?.runtimeUseCaseCoverage && typeof raw.runtimeUseCaseCoverage === 'object'
    ? raw.runtimeUseCaseCoverage
    : {}
  const runtimeUseCaseCoverage = Object.fromEntries(CONSTRUCTION_ORGANIZATION_PLAN_NETWORK_USE_CASES.map((useCase) => {
    const coverage = rawCoverage[useCase] && typeof rawCoverage[useCase] === 'object'
      ? rawCoverage[useCase]
      : {}
    return [useCase, {
      hasRuntimeConsumerObservation: Boolean(coverage.hasRuntimeConsumerObservation),
      hasImpactMonitoringResult: Boolean(coverage.hasImpactMonitoringResult),
      hasRollbackExecutionVerification: Boolean(coverage.hasRollbackExecutionVerification),
      hasSavedNetworkOutcome: Boolean(coverage.hasSavedNetworkOutcome),
      hasRuntimeEngineEvidence: Boolean(coverage.hasRuntimeEngineEvidence),
      canClaimRuntimeUseCaseEvidence: Boolean(coverage.canClaimRuntimeUseCaseEvidence),
    }]
  })) as ConstructionOrganizationPlanNetworkOptionRuntimeMaterializationEvidence['runtimeUseCaseCoverage']

  return {
    source: 'construction_organization_plan_network_option_runtime_materialization_evidence',
    status: normalizeRuntimeMaterializationEvidenceStatus(raw?.status),
    publicationKey: raw?.publicationKey == null ? null : String(raw.publicationKey),
    runtimeUseCases: normalizeConstructionOrganizationPlanNetworkUseCaseKeys(raw?.runtimeUseCases),
    runtimeUseCaseCoverage,
    missingBeforeRuntime: missingBeforeRuntime.length > 0 ? missingBeforeRuntime : fallbackMissingBeforeRuntime,
    hasReleaseExitHandoff: Boolean(raw?.hasReleaseExitHandoff),
    hasRuntimePublication: Boolean(raw?.hasRuntimePublication),
    hasRuntimeConsumerObservation: Boolean(raw?.hasRuntimeConsumerObservation),
    hasImpactMonitoringResult: Boolean(raw?.hasImpactMonitoringResult),
    hasRollbackExecutionVerification: Boolean(raw?.hasRollbackExecutionVerification),
    hasSavedNetworkOutcome: Boolean(raw?.hasSavedNetworkOutcome),
    hasRuntimeEngineEvidence: raw?.hasRuntimeEngineEvidence == null
      ? runtimeEngineEvidence.canClaimTruePerOptionRuntimeEvaluation
      : Boolean(raw.hasRuntimeEngineEvidence),
    canClaimRuntimeMaterializationEvidence: Boolean(raw?.canClaimRuntimeMaterializationEvidence),
    boundaryPolicy: toStringArray(raw?.boundaryPolicy),
  }
}

function normalizeDraftReadiness(raw: unknown): ConstructionOrganizationPlanNetworkDraftReadiness {
  if (raw === 'ready_for_replay' || raw === 'conflict_review_required' || raw === 'evidence_only' || raw === 'blocked') return raw
  return 'blocked'
}

function normalizeDraftEvaluationStatus(raw: unknown): ConstructionOrganizationPlanNetworkDraftEvaluationStatus {
  if (raw === 'evaluation_ready' || raw === 'partial_evidence' || raw === 'missing_evaluation_evidence') return raw
  return 'missing_evaluation_evidence'
}

function normalizeDraftEdge(raw: any): ConstructionOrganizationPlanNetworkDraftEdge {
  const dependencyType = ['SS', 'FF', 'SF'].includes(String(raw?.dependencyType ?? '').toUpperCase())
    ? String(raw.dependencyType).toUpperCase() as ConstructionOrganizationPlanNetworkDraftEdge['dependencyType']
    : 'FS'

  return {
    edgeId: String(raw?.edgeId ?? ''),
    fromGeneratedRowId: String(raw?.fromGeneratedRowId ?? ''),
    toGeneratedRowId: String(raw?.toGeneratedRowId ?? ''),
    dependencyType,
    lagDays: toNumber(raw?.lagDays),
    intent: raw?.intent == null ? null : String(raw.intent),
    fromVirtualNodeId: raw?.fromVirtualNodeId == null ? null : String(raw.fromVirtualNodeId),
    toVirtualNodeId: raw?.toVirtualNodeId == null ? null : String(raw.toVirtualNodeId),
    operation: 'propose_create_dependency',
    writesTaskDependencies: false,
  }
}

function normalizeManualConflictWindow(raw: any): ConstructionOrganizationPlanNetworkManualConflictWindow {
  const window = raw && typeof raw === 'object' ? raw : {}
  const plannedStartDate = window.plannedStartDate ?? window.planned_start_date
  const plannedEndDate = window.plannedEndDate ?? window.planned_end_date
  return {
    startDay: toNullableNumber(window.startDay ?? window.start_day),
    finishDay: toNullableNumber(window.finishDay ?? window.finish_day),
    plannedStartDate: plannedStartDate == null
      ? null
      : String(plannedStartDate),
    plannedEndDate: plannedEndDate == null
      ? null
      : String(plannedEndDate),
  }
}

function normalizeManualConflictEvidence(raw: any): ConstructionOrganizationPlanNetworkManualConflictEvidence {
  const dependencyType = ['SS', 'FF', 'SF'].includes(String(raw?.dependencyType ?? '').toUpperCase())
    ? String(raw.dependencyType).toUpperCase() as ConstructionOrganizationPlanNetworkDraftEdge['dependencyType']
    : 'FS'

  return {
    edgeId: String(raw?.edgeId ?? ''),
    fromGeneratedRowId: String(raw?.fromGeneratedRowId ?? ''),
    toGeneratedRowId: String(raw?.toGeneratedRowId ?? ''),
    dependencyType,
    lagDays: toNumber(raw?.lagDays),
    intent: raw?.intent == null ? null : String(raw.intent),
    fromVirtualNodeId: raw?.fromVirtualNodeId == null ? null : String(raw.fromVirtualNodeId),
    toVirtualNodeId: raw?.toVirtualNodeId == null ? null : String(raw.toVirtualNodeId),
    reason: String(raw?.reason ?? ''),
    fromWindow: normalizeManualConflictWindow(raw?.fromWindow),
    toWindow: normalizeManualConflictWindow(raw?.toWindow),
    writesTaskDependencies: false,
    writesPlanDates: false,
  }
}

function normalizeDraftEvaluationEvidence(raw: any): ConstructionOrganizationPlanNetworkDraftEvaluationEvidence {
  return {
    evaluationStatus: normalizeDraftEvaluationStatus(raw?.evaluationStatus),
    e1: raw?.e1 && typeof raw.e1 === 'object' ? raw.e1 : null,
    e3: raw?.e3 && typeof raw.e3 === 'object' ? raw.e3 : null,
    e5: raw?.e5 && typeof raw.e5 === 'object' ? raw.e5 : null,
    evidenceGaps: toStringArray(raw?.evidenceGaps),
    boundaryPolicy: toStringArray(raw?.boundaryPolicy),
  }
}

function normalizeManualConflictReviewPackage(
  raw: any,
  fallback: {
    readiness: ConstructionOrganizationPlanNetworkDraftReadiness
    blockedReasons: string[]
    edges: ConstructionOrganizationPlanNetworkDraftEdge[]
  },
): ConstructionOrganizationPlanNetworkManualConflictReviewPackage {
  const status = raw?.status === 'manual_conflict_review_required'
    ? 'manual_conflict_review_required'
    : fallback.readiness === 'conflict_review_required'
      ? 'manual_conflict_review_required'
      : 'not_required'
  const conflictReasonCodes = toStringArray(raw?.conflictReasonCodes)
  const fallbackConflictReasonCodes = fallback.blockedReasons.filter((reason) =>
    reason === 'all_virtual_dependency_edges_have_generated_row_carriers'
    || reason === 'candidate_preview_edges_violate_generated_row_dates'
    || reason === 'candidate_network_conflicts_with_current_generated_row_dates'
    || reason === 'requires_manual_conflict_review_before_replay')
  const sampleEdges = Array.isArray(raw?.sampleProposedDependencyEdges)
    ? raw.sampleProposedDependencyEdges.map(normalizeDraftEdge)
    : fallback.edges.slice(0, 5)
  const sampleConflictEvidence = Array.isArray(raw?.sampleConflictEvidence)
    ? raw.sampleConflictEvidence.map(normalizeManualConflictEvidence)
    : []

  return {
    source: 'construction_organization_plan_network_manual_conflict_review_package',
    status,
    reviewPrompt: raw?.reviewPrompt == null
      ? status === 'manual_conflict_review_required'
        ? '候选施工组织关系与当前生成计划日期存在冲突，需要人工确认。'
        : null
      : String(raw.reviewPrompt),
    reviewChecklist: toStringArray(raw?.reviewChecklist),
    conflictReasonCodes: conflictReasonCodes.length > 0 ? conflictReasonCodes : fallbackConflictReasonCodes,
    proposedDependencyEdgeCount: raw?.proposedDependencyEdgeCount == null
      ? fallback.edges.length
      : toNumber(raw.proposedDependencyEdgeCount),
    sampleProposedDependencyEdges: sampleEdges,
    conflictEvidenceCount: raw?.conflictEvidenceCount == null
      ? sampleConflictEvidence.length
      : toNumber(raw.conflictEvidenceCount),
    sampleConflictEvidence,
    allowedDecisions: status === 'manual_conflict_review_required'
      ? ['approved_ready_for_replay', 'rejected_needs_plan_date_adjustment']
      : [],
    recommendedNextAction: status === 'manual_conflict_review_required'
      ? 'complete_manual_conflict_review_before_manual_review_approval'
      : 'continue_standard_governance_flow',
    writesTaskDependencies: false,
    writesPlanDates: false,
    writesSeed: false,
    writesBaseline: false,
    writesCriticalPathFacts: false,
    writesAccelerationDraft: false,
    boundaryPolicy: toStringArray(raw?.boundaryPolicy),
  }
}

function normalizeManualReviewHandoff(raw: any): ConstructionOrganizationPlanNetworkManualReviewHandoffProjection | null {
  if (!raw || typeof raw !== 'object') return null
  return {
    source: 'construction_organization_plan_network_manual_review_handoff_projection',
    candidateEventId: raw?.candidateEventId == null ? null : String(raw.candidateEventId),
    assetKey: String(raw?.assetKey ?? ''),
    sourceModule: String(raw?.sourceModule ?? ''),
    eventStatus: String(raw?.eventStatus ?? ''),
    runtimeEffect: String(raw?.runtimeEffect ?? ''),
    createdAt: raw?.createdAt == null ? null : String(raw.createdAt),
    updatedAt: raw?.updatedAt == null ? null : String(raw.updatedAt),
    draftNetworkKey: String(raw?.draftNetworkKey ?? ''),
    originalCandidateEventId: raw?.originalCandidateEventId == null ? null : String(raw.originalCandidateEventId),
    optionId: raw?.optionId == null ? null : String(raw.optionId),
    selectedScenarioIds: toStringArray(raw?.selectedScenarioIds),
    requestedByUserId: raw?.requestedByUserId == null ? null : String(raw.requestedByUserId),
    executedAt: raw?.executedAt == null ? null : String(raw.executedAt),
    reviewOperation: 'manual_review_dependency_proposal',
    proposedDependencyEdgeCount: toNumber(raw?.proposedDependencyEdgeCount),
    writesTaskDependencies: false,
    writesPlanDates: false,
    writesSeed: false,
    writesBaseline: false,
    writesCriticalPathFacts: false,
    writesAccelerationDraft: false,
  }
}

function normalizeManualReviewApproval(raw: any): ConstructionOrganizationPlanNetworkManualReviewApprovalProjection | null {
  if (!raw || typeof raw !== 'object') return null
  return {
    source: 'construction_organization_plan_network_manual_review_approval_projection',
    candidateEventId: raw?.candidateEventId == null ? null : String(raw.candidateEventId),
    assetKey: String(raw?.assetKey ?? ''),
    sourceModule: String(raw?.sourceModule ?? ''),
    eventStatus: String(raw?.eventStatus ?? ''),
    runtimeEffect: String(raw?.runtimeEffect ?? ''),
    createdAt: raw?.createdAt == null ? null : String(raw.createdAt),
    updatedAt: raw?.updatedAt == null ? null : String(raw.updatedAt),
    draftNetworkKey: String(raw?.draftNetworkKey ?? ''),
    handoffCandidateEventId: raw?.handoffCandidateEventId == null ? null : String(raw.handoffCandidateEventId),
    approvedByUserId: raw?.approvedByUserId == null ? null : String(raw.approvedByUserId),
    approvedAt: raw?.approvedAt == null ? null : String(raw.approvedAt),
    approvalDecision: 'approved_for_release_exit_preparation',
    writesTaskDependencies: false,
    writesPlanDates: false,
    writesSeed: false,
    writesBaseline: false,
    writesCriticalPathFacts: false,
    writesAccelerationDraft: false,
  }
}

function normalizeManualConflictReviewDecision(raw: any): ConstructionOrganizationPlanNetworkManualConflictReviewProjection | null {
  if (!raw || typeof raw !== 'object') return null
  const decision = raw?.decision === 'rejected_needs_plan_date_adjustment'
    ? 'rejected_needs_plan_date_adjustment'
    : 'approved_ready_for_replay'
  return {
    source: 'construction_organization_plan_network_manual_conflict_review_projection',
    candidateEventId: raw?.candidateEventId == null ? null : String(raw.candidateEventId),
    assetKey: String(raw?.assetKey ?? ''),
    sourceModule: String(raw?.sourceModule ?? ''),
    eventStatus: String(raw?.eventStatus ?? ''),
    runtimeEffect: String(raw?.runtimeEffect ?? ''),
    createdAt: raw?.createdAt == null ? null : String(raw.createdAt),
    updatedAt: raw?.updatedAt == null ? null : String(raw.updatedAt),
    draftNetworkKey: String(raw?.draftNetworkKey ?? ''),
    originalCandidateEventId: raw?.originalCandidateEventId == null ? null : String(raw.originalCandidateEventId),
    optionId: raw?.optionId == null ? null : String(raw.optionId),
    selectedScenarioIds: toStringArray(raw?.selectedScenarioIds),
    requestedByUserId: raw?.requestedByUserId == null ? null : String(raw.requestedByUserId),
    executedAt: raw?.executedAt == null ? null : String(raw.executedAt),
    decision,
    resultingReadiness: normalizeDraftReadiness(raw?.resultingReadiness),
    writesTaskDependencies: false,
    writesPlanDates: false,
    writesSeed: false,
    writesBaseline: false,
    writesCriticalPathFacts: false,
    writesAccelerationDraft: false,
  }
}

function normalizeReleaseExitHandoff(raw: any): ConstructionOrganizationPlanNetworkReleaseExitHandoffProjection | null {
  if (!raw || typeof raw !== 'object') return null
  return {
    source: 'construction_organization_plan_network_release_exit_handoff_projection',
    candidateEventId: raw?.candidateEventId == null ? null : String(raw.candidateEventId),
    assetKey: String(raw?.assetKey ?? ''),
    sourceModule: String(raw?.sourceModule ?? ''),
    eventStatus: String(raw?.eventStatus ?? ''),
    runtimeEffect: String(raw?.runtimeEffect ?? ''),
    createdAt: raw?.createdAt == null ? null : String(raw.createdAt),
    updatedAt: raw?.updatedAt == null ? null : String(raw.updatedAt),
    draftNetworkKey: String(raw?.draftNetworkKey ?? ''),
    originalCandidateEventId: raw?.originalCandidateEventId == null ? null : String(raw.originalCandidateEventId),
    handoffCandidateEventId: raw?.handoffCandidateEventId == null ? null : String(raw.handoffCandidateEventId),
    approvalCandidateEventId: raw?.approvalCandidateEventId == null ? null : String(raw.approvalCandidateEventId),
    optionId: raw?.optionId == null ? null : String(raw.optionId),
    selectedScenarioIds: toStringArray(raw?.selectedScenarioIds),
    requestedByUserId: raw?.requestedByUserId == null ? null : String(raw.requestedByUserId),
    executedAt: raw?.executedAt == null ? null : String(raw.executedAt),
    releaseRecordTarget: raw?.releaseRecordTarget == null ? null : String(raw.releaseRecordTarget),
    rollbackTarget: raw?.rollbackTarget == null ? null : String(raw.rollbackTarget),
    consumerVerificationRefs: toStringArray(raw?.consumerVerificationRefs),
    impactMonitoringRefs: toStringArray(raw?.impactMonitoringRefs),
    rollbackWriterRefs: toStringArray(raw?.rollbackWriterRefs),
    proposedDependencyEdgeCount: toNumber(raw?.proposedDependencyEdgeCount),
    writesTaskDependencies: false,
    writesPlanDates: false,
    writesSeed: false,
    writesBaseline: false,
    writesCriticalPathFacts: false,
    writesAccelerationDraft: false,
  }
}

function normalizeRecommendationDecision(raw: any): ConstructionOrganizationPlanNetworkRecommendationDecisionProjection | null {
  if (!raw || typeof raw !== 'object') return null
  return {
    source: 'construction_organization_plan_network_recommendation_decision_projection',
    recommendationKind: 'construction_organization_plan_network',
    recommendationKey: String(raw?.recommendationKey ?? ''),
    actionType: raw?.actionType === 'declined' ? 'declined' : 'adopted',
    optionId: raw?.optionId == null ? null : String(raw.optionId),
    draftNetworkKey: raw?.draftNetworkKey == null ? null : String(raw.draftNetworkKey),
    publicationKey: raw?.publicationKey == null ? null : String(raw.publicationKey),
    selectedScenarioIds: toStringArray(raw?.selectedScenarioIds),
    decidedAt: raw?.decidedAt == null ? null : String(raw.decidedAt),
    decidedBy: raw?.decidedBy == null ? null : String(raw.decidedBy),
    siteDecisionMatchesRuntimeRecommendation: raw?.siteDecisionMatchesRuntimeRecommendation == null
      ? null
      : Boolean(raw.siteDecisionMatchesRuntimeRecommendation),
    writesTaskDependencies: false,
    writesPlanDates: false,
    writesSeed: false,
    writesBaseline: false,
    writesCriticalPathFacts: false,
    writesAccelerationDraft: false,
    boundaryPolicy: toStringArray(raw?.boundaryPolicy),
  }
}

function normalizeReleaseExitAssessment(
  raw: any,
  draftNetworkKey: string,
): ConstructionOrganizationPlanNetworkReleaseExitAssessment {
  const requiredBeforeRuntime = toStringArray(raw?.requiredBeforeRuntime)
  const status = raw?.status === 'release_exit_blocked' ? 'release_exit_blocked' : 'manual_review_handoff_required'

  return {
    source: 'construction_organization_plan_network_release_exit_assessment',
    status,
    canMaterializeRuntime: false,
    draftNetworkKey: String(raw?.draftNetworkKey ?? draftNetworkKey),
    handoffCandidateEventId: raw?.handoffCandidateEventId == null ? null : String(raw.handoffCandidateEventId),
    approvalCandidateEventId: raw?.approvalCandidateEventId == null ? null : String(raw.approvalCandidateEventId),
    requiredBeforeRuntime: requiredBeforeRuntime.length > 0
      ? requiredBeforeRuntime
      : ['manual_review_handoff_required', 'domain_writer_release_exit_required', 'runtime_consumer_verification_required', 'impact_monitoring_required', 'rollback_target_required'],
    reasons: toStringArray(raw?.reasons),
    writesTaskDependencies: false,
    writesPlanDates: false,
    writesSeed: false,
    writesBaseline: false,
    writesCriticalPathFacts: false,
    writesAccelerationDraft: false,
    boundaryPolicy: toStringArray(raw?.boundaryPolicy),
  }
}

function normalizeReleaseExitPreparation(
  raw: any,
  draftNetworkKey: string,
): ConstructionOrganizationPlanNetworkReleaseExitPreparation | null {
  if (!raw || typeof raw !== 'object') return null
  return {
    source: 'construction_organization_plan_network_release_exit_preparation',
    status: 'ready_for_domain_writer_release_exit_package',
    canMaterializeRuntime: false,
    draftNetworkKey: String(raw?.draftNetworkKey ?? draftNetworkKey),
    candidateEventId: raw?.candidateEventId == null ? null : String(raw.candidateEventId),
    handoffCandidateEventId: String(raw?.handoffCandidateEventId ?? ''),
    approvalCandidateEventId: String(raw?.approvalCandidateEventId ?? ''),
    optionId: raw?.optionId == null ? null : String(raw.optionId),
    selectedScenarioIds: toStringArray(raw?.selectedScenarioIds),
    domainWriterKey: 'constructionOrganizationPlanNetworkDomainWriter.applyApprovedDraft',
    proposedDependencyEdgeCount: toNumber(raw?.proposedDependencyEdgeCount),
    nodeCount: toNumber(raw?.nodeCount),
    edgeCount: toNumber(raw?.edgeCount),
    proposedDependencyEdges: Array.isArray(raw?.proposedDependencyEdges)
      ? raw.proposedDependencyEdges.map(normalizeDraftEdge)
      : [],
    evaluationEvidence: normalizeDraftEvaluationEvidence(raw?.evaluationEvidence),
    useCaseEvaluationEvidence: raw?.useCaseEvaluationEvidence && typeof raw.useCaseEvaluationEvidence === 'object'
      ? raw.useCaseEvaluationEvidence
      : {},
    requiredBeforeRuntime: toStringArray(raw?.requiredBeforeRuntime),
    packageArtifacts: toStringArray(raw?.packageArtifacts),
    mutationBoundary: {
      writesTaskDependencies: false,
      writesPlanDates: false,
      writesSeed: false,
      writesBaseline: false,
      writesCriticalPathFacts: false,
      writesAccelerationDraft: false,
    },
    boundaryPolicy: toStringArray(raw?.boundaryPolicy),
  }
}

function normalizeDomainWriterReleaseExitReadiness(
  raw: any,
  draftNetworkKey: string,
): ConstructionOrganizationPlanNetworkDomainWriterReleaseExitReadiness | null {
  if (!raw || typeof raw !== 'object') return null
  return {
    source: 'construction_organization_plan_network_domain_writer_release_exit_readiness',
    status: 'blocked_pending_release_exit_evidence',
    canMaterializeRuntime: false,
    draftNetworkKey: String(raw?.draftNetworkKey ?? draftNetworkKey),
    candidateEventId: raw?.candidateEventId == null ? null : String(raw.candidateEventId),
    handoffCandidateEventId: String(raw?.handoffCandidateEventId ?? ''),
    approvalCandidateEventId: String(raw?.approvalCandidateEventId ?? ''),
    optionId: raw?.optionId == null ? null : String(raw.optionId),
    selectedScenarioIds: toStringArray(raw?.selectedScenarioIds),
    domainWriterKey: 'constructionOrganizationPlanNetworkDomainWriter.applyApprovedDraft',
    releaseExitPreparationStatus: raw?.releaseExitPreparationStatus === 'ready_for_domain_writer_release_exit_package'
      ? 'ready_for_domain_writer_release_exit_package'
      : 'ready_for_domain_writer_release_exit_package',
    proposedDependencyEdgeCount: toNumber(raw?.proposedDependencyEdgeCount),
    nodeCount: toNumber(raw?.nodeCount),
    edgeCount: toNumber(raw?.edgeCount),
    requiredEvidenceBeforeDomainWriter: toStringArray(raw?.requiredEvidenceBeforeDomainWriter),
    packageArtifacts: toStringArray(raw?.packageArtifacts),
    mutationBoundary: {
      writesTaskDependencies: false,
      writesPlanDates: false,
      writesSeed: false,
      writesBaseline: false,
      writesCriticalPathFacts: false,
      writesAccelerationDraft: false,
    },
    boundaryPolicy: toStringArray(raw?.boundaryPolicy),
  }
}

function normalizeConstructionOrganizationPlanNetworkDraft(raw: any): ConstructionOrganizationPlanNetworkDraft {
  const draftNetworkKey = String(raw?.draftNetworkKey ?? '')
  const readiness = normalizeDraftReadiness(raw?.readiness)
  const blockedReasons = toStringArray(raw?.blockedReasons)
  const edges = Array.isArray(raw?.edges) ? raw.edges.map(normalizeDraftEdge) : []
  return {
    source: 'construction_organization_plan_network_draft',
    draftNetworkKey,
    candidateEventId: raw?.candidateEventId == null ? null : String(raw.candidateEventId),
    assetKey: String(raw?.assetKey ?? ''),
    optionId: raw?.optionId == null ? null : String(raw.optionId),
    selectedScenarioIds: toStringArray(raw?.selectedScenarioIds),
    readiness,
    nodeCount: toNumber(raw?.nodeCount),
    edgeCount: toNumber(raw?.edgeCount),
    blockedReasons,
    edges,
    evaluationEvidence: normalizeDraftEvaluationEvidence(raw?.evaluationEvidence),
    reviewPackageStatus: raw?.reviewPackageStatus == null ? null : String(raw.reviewPackageStatus),
    reviewRequired: Boolean(raw?.reviewRequired),
    manualConflictReviewPackage: normalizeManualConflictReviewPackage(raw?.manualConflictReviewPackage, {
      readiness,
      blockedReasons,
      edges,
    }),
    manualReviewHandoff: normalizeManualReviewHandoff(raw?.manualReviewHandoff),
    manualConflictReviewDecision: normalizeManualConflictReviewDecision(raw?.manualConflictReviewDecision),
    manualReviewApproval: normalizeManualReviewApproval(raw?.manualReviewApproval),
    releaseExitHandoff: normalizeReleaseExitHandoff(raw?.releaseExitHandoff),
    releaseExitAssessment: normalizeReleaseExitAssessment(raw?.releaseExitAssessment, draftNetworkKey),
    releaseExitPreparation: normalizeReleaseExitPreparation(raw?.releaseExitPreparation, draftNetworkKey),
    domainWriterReleaseExitReadiness: normalizeDomainWriterReleaseExitReadiness(raw?.domainWriterReleaseExitReadiness, draftNetworkKey),
    runtimeEngineEvidence: normalizeRuntimeEngineEvidenceSummary(raw?.runtimeEngineEvidence),
    recommendationDecision: normalizeRecommendationDecision(raw?.recommendationDecision),
    mutationBoundary: {
      writesTaskDependencies: false,
      writesPlanDates: false,
      writesSeed: false,
      writesBaseline: false,
      writesCriticalPathFacts: false,
      writesAccelerationDraft: false,
    },
    boundaryPolicy: toStringArray(raw?.boundaryPolicy),
  }
}

function normalizeConstructionOrganizationPlanNetworkDraftRecommendation(
  raw: any,
  runtimeEngineEvidenceFallback?: ConstructionOrganizationPlanNetworkRuntimeEngineEvidenceSummary | null,
): ConstructionOrganizationPlanNetworkDraftRecommendation | null {
  if (!raw || typeof raw !== 'object') return null
  const useCase = raw.useCase === 'startingLineOnboarding' || raw.useCase === 'accelerationRecovery'
    ? raw.useCase
    : 'newProjectPlanning'
  const fallback = runtimeEngineEvidenceFallback ?? normalizeRuntimeEngineEvidenceSummary(null)
  const presentRuntimeEngineCodes = normalizeRuntimeEngineCodeArray(raw?.presentRuntimeEngineCodes)
  const missingRuntimeEngineCodes = normalizeRuntimeEngineCodeArray(raw?.missingRuntimeEngineCodes)

  return {
    useCase,
    draftNetworkKey: String(raw?.draftNetworkKey ?? ''),
    candidateEventId: raw?.candidateEventId == null ? null : String(raw.candidateEventId),
    optionId: raw?.optionId == null ? null : String(raw.optionId),
    selectedScenarioIds: toStringArray(raw?.selectedScenarioIds),
    readiness: normalizeDraftReadiness(raw?.readiness),
    evaluationStatus: normalizeDraftEvaluationStatus(raw?.evaluationStatus),
    optionScore: raw?.optionScore == null ? null : toNumber(raw.optionScore),
    actionability: raw?.actionability == null ? null : String(raw.actionability),
    e5RecoverableSpanDays: raw?.e5RecoverableSpanDays == null ? null : toNumber(raw.e5RecoverableSpanDays),
    runtimeEngineEvidenceStatus: raw?.runtimeEngineEvidenceStatus == null
      ? fallback.status
      : normalizeRuntimeEngineEvidenceStatus(raw.runtimeEngineEvidenceStatus),
    presentRuntimeEngineCodes: presentRuntimeEngineCodes.length > 0
      ? presentRuntimeEngineCodes
      : fallback.presentEngineCodes,
    missingRuntimeEngineCodes: missingRuntimeEngineCodes.length > 0
      ? missingRuntimeEngineCodes
      : fallback.missingEngineCodes,
    canClaimTruePerOptionRuntimeEvaluation: raw?.canClaimTruePerOptionRuntimeEvaluation == null
      ? fallback.canClaimTruePerOptionRuntimeEvaluation
      : Boolean(raw.canClaimTruePerOptionRuntimeEvaluation),
    recommendationBasis: toStringArray(raw?.recommendationBasis),
    writesTaskDependencies: false,
    writesPlanDates: false,
    writesSeed: false,
    writesAccelerationDraft: false,
  }
}

function normalizeConstructionOrganizationPlanNetworkUseCaseKeys(raw: unknown): ConstructionOrganizationPlanNetworkUseCaseKey[] {
  return toStringArray(raw).filter((item): item is ConstructionOrganizationPlanNetworkUseCaseKey => (
    item === 'newProjectPlanning'
    || item === 'startingLineOnboarding'
    || item === 'accelerationRecovery'
  ))
}

function normalizeOptionComparisonScore(raw: any): ConstructionOrganizationPlanNetworkOptionComparisonScore | null {
  if (!raw || typeof raw !== 'object') return null
  return {
    rank: raw?.rank == null ? null : toNumber(raw.rank),
    optionScore: raw?.optionScore == null ? null : toNumber(raw.optionScore),
    actionability: raw?.actionability == null ? null : String(raw.actionability),
    e5RecoverableSpanDays: raw?.e5RecoverableSpanDays == null ? null : toNumber(raw.e5RecoverableSpanDays),
    rankBasis: toStringArray(raw?.rankBasis),
  }
}

function normalizeNextGovernanceAction(raw: unknown): ConstructionOrganizationPlanNetworkNextGovernanceAction {
  const value = String(raw ?? '')
  if (
    value === 'manual_review_handoff'
    || value === 'manual_review_approval'
    || value === 'release_exit_handoff'
    || value === 'runtime_engine_evidence_required'
    || value === 'runtime_engine_evidence_ready'
    || value === 'runtime_materialization_evidence_required'
    || value === 'blocked'
  ) {
    return value
  }
  return 'blocked'
}

function normalizeOptionComparisonItem(raw: any): ConstructionOrganizationPlanNetworkOptionComparisonItem {
  const rawScores = raw?.useCaseScores && typeof raw.useCaseScores === 'object'
    ? raw.useCaseScores
    : {}
  const missingRuntimeEngineCodes = normalizeRuntimeEngineCodeArray(raw?.missingRuntimeEngineCodes)
  const canClaimTruePerOptionRuntimeEvaluation = Boolean(raw?.canClaimTruePerOptionRuntimeEvaluation)
  return {
    source: 'construction_organization_plan_network_option_comparison_item',
    draftNetworkKey: String(raw?.draftNetworkKey ?? ''),
    candidateEventId: raw?.candidateEventId == null ? null : String(raw.candidateEventId),
    optionId: raw?.optionId == null ? null : String(raw.optionId),
    selectedScenarioIds: toStringArray(raw?.selectedScenarioIds),
    isRecommendedFor: normalizeConstructionOrganizationPlanNetworkUseCaseKeys(raw?.isRecommendedFor),
    readiness: normalizeDraftReadiness(raw?.readiness),
    evaluationStatus: normalizeDraftEvaluationStatus(raw?.evaluationStatus),
    runtimeEngineEvidenceStatus: normalizeRuntimeEngineEvidenceStatus(raw?.runtimeEngineEvidenceStatus),
    presentRuntimeEngineCodes: normalizeRuntimeEngineCodeArray(raw?.presentRuntimeEngineCodes),
    missingRuntimeEngineCodes,
    canClaimTruePerOptionRuntimeEvaluation,
    useCaseScores: {
      newProjectPlanning: normalizeOptionComparisonScore(rawScores.newProjectPlanning),
      startingLineOnboarding: normalizeOptionComparisonScore(rawScores.startingLineOnboarding),
      accelerationRecovery: normalizeOptionComparisonScore(rawScores.accelerationRecovery),
    },
    proposedDependencyEdgeCount: toNumber(raw?.proposedDependencyEdgeCount),
    nextGovernanceAction: normalizeNextGovernanceAction(raw?.nextGovernanceAction),
    nextGovernanceReasons: toStringArray(raw?.nextGovernanceReasons),
    runtimeMaterializationEvidence: normalizeOptionRuntimeMaterializationEvidence(raw?.runtimeMaterializationEvidence, {
      missingRuntimeEngineCodes,
      canClaimTruePerOptionRuntimeEvaluation,
    }),
    recommendationDecision: normalizeRecommendationDecision(raw?.recommendationDecision),
    writesTaskDependencies: false,
    writesPlanDates: false,
    writesSeed: false,
    writesAccelerationDraft: false,
  }
}

function normalizeRecommendedOptionIdsByUseCase(raw: any): Record<ConstructionOrganizationPlanNetworkUseCaseKey, string | null> {
  return {
    newProjectPlanning: raw?.newProjectPlanning == null ? null : String(raw.newProjectPlanning),
    startingLineOnboarding: raw?.startingLineOnboarding == null ? null : String(raw.startingLineOnboarding),
    accelerationRecovery: raw?.accelerationRecovery == null ? null : String(raw.accelerationRecovery),
  }
}

function buildMissingBackendOptionComparisonPackage(): ConstructionOrganizationPlanNetworkOptionComparisonPackage {
  return {
    source: 'construction_organization_plan_network_option_comparison_package',
    totalOptionCount: 0,
    recommendedOptionIdsByUseCase: {
      newProjectPlanning: null,
      startingLineOnboarding: null,
      accelerationRecovery: null,
    },
    canAutoMaterializeSelectedOption: false,
    comparisonBasis: ['backend_option_comparison_package_missing_direct_failure'],
    options: [],
    boundaryPolicy: [
      'frontend_does_not_synthesize_option_comparison_package',
      'backend_option_comparison_package_required',
      'does_not_write_task_dependencies_or_plan_dates',
    ],
  }
}

function normalizeOptionComparisonPackage(
  raw: any,
  items: ConstructionOrganizationPlanNetworkDraft[],
  recommendedDrafts: ConstructionOrganizationPlanNetworkDraftReport['recommendedDrafts'],
): ConstructionOrganizationPlanNetworkOptionComparisonPackage {
  if (!raw || typeof raw !== 'object') {
    return buildMissingBackendOptionComparisonPackage()
  }
  return {
    source: 'construction_organization_plan_network_option_comparison_package',
    totalOptionCount: toNumber(raw?.totalOptionCount),
    recommendedOptionIdsByUseCase: normalizeRecommendedOptionIdsByUseCase(raw?.recommendedOptionIdsByUseCase),
    canAutoMaterializeSelectedOption: false,
    comparisonBasis: toStringArray(raw?.comparisonBasis),
    options: Array.isArray(raw?.options) ? raw.options.map(normalizeOptionComparisonItem) : [],
    boundaryPolicy: toStringArray(raw?.boundaryPolicy),
  }
}

function normalizeRuntimeMaterializationReadiness(
  raw: any,
): ConstructionOrganizationPlanNetworkRuntimeMaterializationReadiness {
  const rawStatus = String(raw?.status ?? '')
  const status = rawStatus === 'runtime_materialization_evidence_ready'
    ? 'runtime_materialization_evidence_ready'
    : rawStatus === 'blocked_candidate_only_after_release_exit_handoff'
      ? 'blocked_candidate_only_after_release_exit_handoff'
      : 'blocked_pending_release_exit_handoff'
  return {
    source: 'construction_organization_plan_network_runtime_materialization_readiness',
    status,
    canMaterializeRuntime: false,
    totalDraftCount: toNumber(raw?.totalDraftCount),
    releaseExitPreparationCount: toNumber(raw?.releaseExitPreparationCount),
    domainWriterReleaseExitReadinessCount: toNumber(raw?.domainWriterReleaseExitReadinessCount),
    releaseExitHandoffCandidateCount: toNumber(raw?.releaseExitHandoffCandidateCount),
    linkedReleaseExitHandoffCount: toNumber(raw?.linkedReleaseExitHandoffCount),
    domainWriterRuntimeExecutionCount: toNumber(raw?.domainWriterRuntimeExecutionCount),
    readyForDomainWriterExecutionCount: toNumber(raw?.readyForDomainWriterExecutionCount),
    runtimeConsumerObservationCount: toNumber(raw?.runtimeConsumerObservationCount),
    readyForRuntimeConsumerObservationCount: toNumber(raw?.readyForRuntimeConsumerObservationCount),
    runtimeImpactMonitoringResultCount: toNumber(raw?.runtimeImpactMonitoringResultCount),
    readyForRuntimeImpactMonitoringResultCount: toNumber(raw?.readyForRuntimeImpactMonitoringResultCount),
    rollbackExecutionVerificationCount: toNumber(raw?.rollbackExecutionVerificationCount),
    readyForRollbackExecutionVerificationCount: toNumber(raw?.readyForRollbackExecutionVerificationCount),
    savedNetworkOutcomeCount: toNumber(raw?.savedNetworkOutcomeCount),
    readyForSavedNetworkOutcomeCount: toNumber(raw?.readyForSavedNetworkOutcomeCount),
    perOptionRuntimeEngineEvidenceCount: toNumber(raw?.perOptionRuntimeEngineEvidenceCount),
    readyForPerOptionRuntimeEngineEvidenceCount: toNumber(raw?.readyForPerOptionRuntimeEngineEvidenceCount),
    missingBeforeRuntime: toStringArray(raw?.missingBeforeRuntime),
    mutationBoundary: {
      writesTaskDependencies: false,
      writesPlanDates: false,
      writesSeed: false,
      writesBaseline: false,
      writesCriticalPathFacts: false,
      writesAccelerationDraft: false,
    },
    boundaryPolicy: toStringArray(raw?.boundaryPolicy),
  }
}

function normalizeRuntimeCloseoutClaim(raw: any): ConstructionOrganizationPlanNetworkRuntimeCloseoutClaim {
  const status = raw?.status === 'runtime_closeout_claim_ready'
    ? 'runtime_closeout_claim_ready'
    : 'runtime_closeout_claim_blocked'
  return {
    source: 'construction_organization_plan_network_runtime_closeout_claim',
    status,
    canClaimRuntimeCloseout: Boolean(raw?.canClaimRuntimeCloseout),
    canMaterializeRuntime: false,
    totalDraftCount: toNumber(raw?.totalDraftCount),
    claimBasis: toStringArray(raw?.claimBasis),
    missingBeforeClaim: toStringArray(raw?.missingBeforeClaim),
    mutationBoundary: {
      writesTaskDependencies: false,
      writesPlanDates: false,
      writesSeed: false,
      writesBaseline: false,
      writesCriticalPathFacts: false,
      writesAccelerationDraft: false,
    },
    boundaryPolicy: toStringArray(raw?.boundaryPolicy),
  }
}

function normalizeRuntimeCloseoutClaimRecord(raw: unknown): Record<string, ConstructionOrganizationPlanNetworkRuntimeCloseoutClaim> {
  const record = toRecord(raw)
  if (!record) return {}
  return Object.fromEntries(Object.entries(record)
    .map(([key, value]) => [String(key).trim(), normalizeRuntimeCloseoutClaim(value)] as const)
    .filter(([key]) => key.length > 0))
}

function normalizeRuntimeRecommendedOption(raw: any): ConstructionOrganizationPlanNetworkRuntimeRecommendedOption {
  const status = raw?.status === 'runtime_recommended_option_ready'
    ? 'runtime_recommended_option_ready'
    : 'runtime_recommended_option_blocked'
  return {
    source: 'construction_organization_plan_network_runtime_recommended_option',
    status,
    optionId: raw?.optionId == null ? null : String(raw.optionId),
    draftNetworkKey: raw?.draftNetworkKey == null ? null : String(raw.draftNetworkKey),
    publicationKey: raw?.publicationKey == null ? null : String(raw.publicationKey),
    selectedScenarioIds: toStringArray(raw?.selectedScenarioIds),
    canAutoAdoptRuntimeOption: false,
    siteDecision: normalizeRecommendationDecision(raw?.siteDecision),
    siteDecisionMatchesRuntimeRecommendation: raw?.siteDecisionMatchesRuntimeRecommendation == null
      ? null
      : Boolean(raw.siteDecisionMatchesRuntimeRecommendation),
    recommendationBasis: toStringArray(raw?.recommendationBasis),
    rejectedOptionIds: toStringArray(raw?.rejectedOptionIds),
    rejectedReasonsByOptionId: toStringArrayRecord(raw?.rejectedReasonsByOptionId),
    mutationBoundary: {
      writesTaskDependencies: false,
      writesPlanDates: false,
      writesSeed: false,
      writesBaseline: false,
      writesCriticalPathFacts: false,
      writesAccelerationDraft: false,
    },
    boundaryPolicy: toStringArray(raw?.boundaryPolicy),
  }
}

function normalizeSummary(raw: any): RuleAssetGovernanceWorkbenchSummary {
  return {
    totalAssetCount: toNumber(raw?.totalAssetCount),
    algorithmSeedCount: toNumber(raw?.algorithmSeedCount),
    totalDiscoveredCount: toNumber(raw?.totalDiscoveredCount),
    registeredCount: toNumber(raw?.registeredCount),
    reviewItemCount: toNumber(raw?.reviewItemCount),
    blockerCount: toNumber(raw?.blockerCount),
    durationRelatedAssetCount: toNumber(raw?.durationRelatedAssetCount),
    durationRelatedCoverageRatio: toNumber(raw?.durationRelatedCoverageRatio),
    explicitGovernanceFieldCount: toNumber(raw?.explicitGovernanceFieldCount),
    conservativeGovernanceDefaultCount: toNumber(raw?.conservativeGovernanceDefaultCount),
    governanceDefaultReviewItemCount: toNumber(raw?.governanceDefaultReviewItemCount),
    candidateReviewRequiredCount: toNumber(raw?.candidateReviewRequiredCount),
    replayBlockedOrFailedCount: toNumber(raw?.replayBlockedOrFailedCount),
    sampleHealthWeakOrRejectedCount: toNumber(raw?.sampleHealthWeakOrRejectedCount),
    readyGateCount: toNumber(raw?.readyGateCount),
    needsWorkGateCount: toNumber(raw?.needsWorkGateCount),
    totalGateCount: toNumber(raw?.totalGateCount),
  }
}

function normalizeGovernanceDefaultReviewItem(raw: any): RuleAssetGovernanceDefaultReviewItem {
  return {
    assetKey: String(raw?.assetKey ?? ''),
    sourcePath: String(raw?.sourcePath ?? ''),
    durationRelated: Boolean(raw?.durationRelated),
    learningTarget: String(raw?.learningTarget ?? ''),
    learningMaturity: String(raw?.learningMaturity ?? ''),
    publishAnchor: String(raw?.publishAnchor ?? ''),
    automationMaturity: String(raw?.automationMaturity ?? ''),
    reason: String(raw?.reason ?? ''),
  }
}

function normalizeGate(raw: any): RuleAssetGovernanceWorkbenchGate {
  const details = toRecord(raw?.details)
  return {
    key: String(raw?.key ?? ''),
    status: raw?.status === 'ready' ? 'ready' : 'needs_work',
    evidenceRefs: toStringArray(raw?.evidenceRefs),
    missingReasons: toStringArray(raw?.missingReasons),
    ...(details ? { details } : {}),
  }
}

function normalizeClosureGap(raw: any): RuleAssetGovernanceWorkbenchClosureGap {
  return {
    key: String(raw?.key ?? ''),
    status: 'not_proven_by_workbench_readiness',
    evidenceRequired: toStringArray(raw?.evidenceRequired),
    reason: String(raw?.reason ?? ''),
  }
}

function normalizeOperationAction(raw: unknown): RuleAssetGovernanceWorkbenchOperationAction | null {
  return raw === 'release_exit_handoff'
    || raw === 'manual_review_handoff'
    || raw === 'manual_conflict_review'
    || raw === 'manual_review_approval'
    || raw === 'runtime_apply'
    || raw === 'runtime_impact_monitoring'
    || raw === 'runtime_rollback_execution'
    || raw === 'runtime_consumer_observation'
    || raw === 'runtime_engine_evidence'
    || raw === 'runtime_saved_outcome'
    || raw === 'runtime_recommendation_adopt'
    || raw === 'runtime_recommendation_decline'
    || raw === 'runtime_rollback'
    ? raw
    : null
}

function normalizeAssetType(raw: unknown): RuleAssetGovernanceWorkbenchAssetType | null {
  const value = String(raw ?? '')
  const knownTypes: RuleAssetGovernanceWorkbenchAssetType[] = [
    'learnable_parameter',
    'algorithm_seed',
    'policy_template',
    'forecast_residual_overlay',
    'cold_start_baseline',
    'sample_health',
    'dependency_rule',
    'template_seed',
    'construction_organization_plan_network',
  ]
  return knownTypes.includes(value as RuleAssetGovernanceWorkbenchAssetType)
    ? value as RuleAssetGovernanceWorkbenchAssetType
    : null
}

export async function getRuleAssetGovernanceWorkbenchReadiness() {
  const report = await apiGet<any>(RULE_ASSET_GOVERNANCE_WORKBENCH_ENDPOINT, {
    runtimeCache: 'off',
  })

  return {
    reportCode: 'v14223_rule_asset_governance_workbench_readiness',
    companyId: report?.companyId ?? null,
    status: report?.status === 'workbench_ready' ? 'workbench_ready' : 'workbench_incomplete',
    canDeclareGovernanceWorkbenchComplete: Boolean(report?.canDeclareGovernanceWorkbenchComplete),
    completionScope: 'workbench_readiness_evidence_only',
    canDeclareV14223GovernanceComplete: Boolean(report?.canDeclareV14223GovernanceComplete),
    remainingClosureGaps: Array.isArray(report?.remainingClosureGaps)
      ? report.remainingClosureGaps.map(normalizeClosureGap)
      : [],
    frontendExposurePolicy: 'backend_admin_governance_only',
    runtimeMutationPolicy: 'none_read_only_evidence_and_gap_report',
    summary: normalizeSummary(report?.summary),
    governanceDefaultReviewItems: Array.isArray(report?.governanceDefaultReviewItems)
      ? report.governanceDefaultReviewItems.map(normalizeGovernanceDefaultReviewItem)
      : [],
    gates: Array.isArray(report?.gates) ? report.gates.map(normalizeGate) : [],
    boundaryPolicy: toStringArray(report?.boundaryPolicy),
  } satisfies RuleAssetGovernanceWorkbenchReadiness
}

function normalizeCompletionRecordResult(raw: any): RuleAssetGovernanceCompletionAuditRecordResult {
  return {
    surface: String(raw?.surface ?? ''),
    status: raw?.status === 'verified' ? 'verified' : 'incomplete',
    missingReasons: toStringArray(raw?.missingReasons),
  }
}

function normalizeCompletionDeclarationStatus(raw: unknown): RuleAssetGovernanceCompletionDeclarationStatus {
  const value = String(raw ?? '')
  const knownStatuses: RuleAssetGovernanceCompletionDeclarationStatus[] = [
    'current_snapshot_gate_passed',
    'evidence_layer_ready',
    'runtime_surface_closed',
    'chapter_completion_candidate',
    'v14223_governance_complete_current_snapshot',
    'review_required',
  ]
  return knownStatuses.includes(value as RuleAssetGovernanceCompletionDeclarationStatus)
    ? value as RuleAssetGovernanceCompletionDeclarationStatus
    : 'review_required'
}

export async function getRuleAssetGovernanceCompletionAudit() {
  const audit = await apiGet<any>(RULE_ASSET_GOVERNANCE_COMPLETION_AUDIT_ENDPOINT, {
    runtimeCache: 'off',
  })

  return {
    reportCode: 'v14223_completion_audit',
    declarationStatus: normalizeCompletionDeclarationStatus(audit?.declarationStatus),
    canDeclareChapterCompletionCandidate: Boolean(audit?.canDeclareChapterCompletionCandidate),
    canDeclareV14223GovernanceComplete: Boolean(audit?.canDeclareV14223GovernanceComplete),
    missingReasons: toStringArray(audit?.missingReasons),
    requiredSurfaces: toStringArray(audit?.requiredSurfaces),
    recordResults: Array.isArray(audit?.recordResults)
      ? audit.recordResults.map(normalizeCompletionRecordResult)
      : [],
    boundaryPolicy: toStringArray(audit?.boundaryPolicy),
  } satisfies RuleAssetGovernanceCompletionAudit
}

export async function getConstructionOrganizationPlanNetworkDrafts(input: {
  projectId?: string | null
  limit?: number
} = {}): Promise<ConstructionOrganizationPlanNetworkDraftReport> {
  const params = new URLSearchParams()
  const projectId = String(input.projectId ?? '').trim()
  if (projectId) params.set('projectId', projectId)
  if (input.limit != null && Number.isFinite(input.limit) && input.limit > 0) {
    params.set('limit', String(Math.trunc(input.limit)))
  }
  const query = params.toString()
  const report = await apiGet<any>(
    `${CONSTRUCTION_ORGANIZATION_PLAN_NETWORK_DRAFTS_ENDPOINT}${query ? `?${query}` : ''}`,
    { runtimeCache: 'off' },
  )
  const recommendedDrafts = report?.recommendedDrafts ?? {}
  const items: ConstructionOrganizationPlanNetworkDraft[] = Array.isArray(report?.items)
    ? report.items.map(normalizeConstructionOrganizationPlanNetworkDraft)
    : []
  const runtimeEvidenceByDraftKey = new Map<string, ConstructionOrganizationPlanNetworkRuntimeEngineEvidenceSummary>(
    items.map((item) => [item.draftNetworkKey, item.runtimeEngineEvidence] as const),
  )
  const normalizedRecommendedDrafts: ConstructionOrganizationPlanNetworkDraftReport['recommendedDrafts'] = {
    newProjectPlanning: normalizeConstructionOrganizationPlanNetworkDraftRecommendation(
      recommendedDrafts.newProjectPlanning,
      runtimeEvidenceByDraftKey.get(String(recommendedDrafts.newProjectPlanning?.draftNetworkKey ?? '')) ?? null,
    ),
    startingLineOnboarding: normalizeConstructionOrganizationPlanNetworkDraftRecommendation(
      recommendedDrafts.startingLineOnboarding,
      runtimeEvidenceByDraftKey.get(String(recommendedDrafts.startingLineOnboarding?.draftNetworkKey ?? '')) ?? null,
    ),
    accelerationRecovery: normalizeConstructionOrganizationPlanNetworkDraftRecommendation(
      recommendedDrafts.accelerationRecovery,
      runtimeEvidenceByDraftKey.get(String(recommendedDrafts.accelerationRecovery?.draftNetworkKey ?? '')) ?? null,
    ),
  }

  return {
    source: 'construction_organization_plan_network_draft_read_model',
    companyId: String(report?.companyId ?? ''),
    projectId: report?.projectId == null ? null : String(report.projectId),
    totalReviewPackageItems: toNumber(report?.totalReviewPackageItems),
    totalDraftCount: toNumber(report?.totalDraftCount),
    readyForReplayCount: toNumber(report?.readyForReplayCount),
    evaluationReadyCount: toNumber(report?.evaluationReadyCount),
    partialEvaluationCount: toNumber(report?.partialEvaluationCount),
    evidenceOnlyCount: toNumber(report?.evidenceOnlyCount),
    blockedCount: toNumber(report?.blockedCount),
    totalEdgeCount: toNumber(report?.totalEdgeCount),
    totalManualReviewHandoffCount: toNumber(report?.totalManualReviewHandoffCount),
    linkedManualReviewHandoffCount: toNumber(report?.linkedManualReviewHandoffCount),
    totalManualReviewApprovalCount: toNumber(report?.totalManualReviewApprovalCount),
    linkedManualReviewApprovalCount: toNumber(report?.linkedManualReviewApprovalCount),
    totalReleaseExitHandoffCount: toNumber(report?.totalReleaseExitHandoffCount),
    linkedReleaseExitHandoffCount: toNumber(report?.linkedReleaseExitHandoffCount),
    runtimeMaterializationReadiness: normalizeRuntimeMaterializationReadiness(report?.runtimeMaterializationReadiness),
    runtimeCloseoutClaim: normalizeRuntimeCloseoutClaim(report?.runtimeCloseoutClaim),
    runtimeCloseoutClaimsByProjectDraftNetworkKey: normalizeRuntimeCloseoutClaimRecord(
      report?.runtimeCloseoutClaimsByProjectDraftNetworkKey,
    ),
    runtimeRecommendedOption: normalizeRuntimeRecommendedOption(report?.runtimeRecommendedOption),
    recommendedDrafts: normalizedRecommendedDrafts,
    optionComparisonPackage: normalizeOptionComparisonPackage(report?.optionComparisonPackage, items, normalizedRecommendedDrafts),
    items,
    boundaryPolicy: toStringArray(report?.boundaryPolicy),
  } satisfies ConstructionOrganizationPlanNetworkDraftReport
}

export async function executeRuleAssetGovernanceWorkbenchOperation(
  input: RuleAssetGovernanceWorkbenchOperationInput,
) {
  const result = await apiPost<any>(RULE_ASSET_GOVERNANCE_WORKBENCH_OPERATION_ENDPOINT, input)

  return {
    status: result?.status === 'operation_delegated' ? 'operation_delegated' : 'operation_blocked',
    operationAction: normalizeOperationAction(result?.operationAction),
    assetType: normalizeAssetType(result?.assetType),
    writesRuntimeDirectly: false,
    workbenchDoesNotGrantPublishRights: true,
    delegatedToDomainWriter: Boolean(result?.delegatedToDomainWriter),
    domainWriterKey: result?.domainWriterKey ? String(result.domainWriterKey) : null,
    reasons: toStringArray(result?.reasons),
    domainResult: result?.domainResult ?? null,
    boundaryPolicy: toStringArray(result?.boundaryPolicy),
  } satisfies RuleAssetGovernanceWorkbenchOperationResult
}
