import type {
  AlgorithmAssetReleaseExitResult,
} from './algorithmAssetReleaseExitService.js'
import {
  executeAlgorithmAssetLearnableParameterRuntimeRollback,
  persistAlgorithmAssetLearnableParameterRuntimePublication,
  type AlgorithmAssetLearnableParameterPublicationResult,
  type AlgorithmAssetLearnableParameterReleaseExecutionQueryExec,
  type AlgorithmAssetLearnableParameterRuntimeRollbackResult,
} from './algorithmAssetLearnableParameterReleaseExecutionService.js'
import {
  rollbackAlgorithmAssetForecastResidualOverlayRuntimePublication,
} from './algorithmAssetForecastResidualOverlayService.js'
import {
  rollbackAlgorithmAssetColdStartBaselineRuntimePublicationRecord,
  type RollbackAlgorithmAssetColdStartBaselineRuntimePublicationResult,
  type RollbackAlgorithmAssetForecastResidualOverlayRuntimePublicationResult,
} from './algorithmAssetGovernancePersistenceService.js'
import {
  executeConstructionDependencyRuleRuntimeRollback,
  type ConstructionDependencyRuleRuntimePublicationQueryExec,
  type ConstructionDependencyRuleRuntimeRollbackResult,
} from './constructionDependencyRuleRuntimePublicationService.js'
import {
  buildConstructionOrganizationPlanNetworkManualConflictReviewDecision,
  buildConstructionOrganizationPlanNetworkManualReviewHandoff,
  buildConstructionOrganizationPlanNetworkManualReviewApproval,
  buildConstructionOrganizationPlanNetworkReleaseExitHandoff,
  canSubmitConstructionOrganizationPlanNetworkManualReviewHandoff,
  isConstructionOrganizationConflictReviewHandoffReason,
  persistConstructionOrganizationPlanNetworkManualConflictReviewDecision,
  persistConstructionOrganizationPlanNetworkManualReviewApproval,
  persistConstructionOrganizationPlanNetworkManualReviewHandoff,
  persistConstructionOrganizationPlanNetworkReleaseExitHandoff,
  type ConstructionOrganizationPlanNetworkDraft,
  type ConstructionOrganizationPlanNetworkManualConflictReviewDecisionResult,
  type ConstructionOrganizationPlanNetworkManualReviewApprovalResult,
  type ConstructionOrganizationPlanNetworkManualReviewHandoffResult,
  type ConstructionOrganizationPlanNetworkReleaseExitHandoffResult,
  type PersistConstructionOrganizationPlanNetworkManualConflictReviewDecisionResult,
  type PersistConstructionOrganizationPlanNetworkManualReviewApprovalResult,
  type PersistConstructionOrganizationPlanNetworkManualReviewHandoffResult,
  type PersistConstructionOrganizationPlanNetworkReleaseExitHandoffResult,
} from './constructionOrganizationPlanNetworkDraftService.js'
import {
  applyConstructionOrganizationPlanNetworkApprovedDraft,
  type ApplyConstructionOrganizationPlanNetworkApprovedDraftInput,
  type ApplyConstructionOrganizationPlanNetworkApprovedDraftResult,
} from './constructionOrganizationPlanNetworkDomainWriter.js'
import {
  recordConstructionOrganizationPlanNetworkRecommendationDecision,
  recordConstructionOrganizationPlanNetworkRuntimeEvent,
  recordConstructionOrganizationPlanNetworkRuntimeEngineEvidence,
  recordConstructionOrganizationPlanNetworkSavedOutcome,
  type RecordConstructionOrganizationPlanNetworkRecommendationDecisionInput,
  type RecordConstructionOrganizationPlanNetworkRecommendationDecisionResult,
  type RecordConstructionOrganizationPlanNetworkRuntimeEngineEvidenceInput,
  type RecordConstructionOrganizationPlanNetworkRuntimeEngineEvidenceResult,
  type RecordConstructionOrganizationPlanNetworkSavedOutcomeInput,
  type RecordConstructionOrganizationPlanNetworkSavedOutcomeResult,
  type RecordConstructionOrganizationPlanNetworkRuntimeEventInput,
  type RecordConstructionOrganizationPlanNetworkRuntimeEventResult,
} from './constructionOrganizationPlanNetworkRuntimeEvidenceService.js'
import {
  constructionOrganizationProductOutcomeProjectionOnlyEvidenceActionReasons,
} from './constructionOrganizationProductOutcomeEvidenceActionGuard.js'
import {
  recordScheduleAccelerationRuntimeConsumedArtifacts,
  type DurationRuntimeConsumerFacadeArtifactsResult,
  type RecordDurationRuntimeConsumerFacadeArtifactsInput,
} from './durationRuntimeConsumerObservationAdapterService.js'
import {
  executeWbsTemplateRuntimeRollback,
  type WbsTemplateRuntimePublicationQueryExec,
  type WbsTemplateRuntimeRollbackResult,
} from './wbsTemplateRuntimePublicationService.js'
import {
  publishApprovedAlgorithmSeedOverride,
  type AlgorithmSeedOverrideReleaseExecutionInput,
  type AlgorithmSeedOverrideReleaseExecutionResult,
} from './algorithmSeedOverrideReleaseExecutionService.js'

export type AlgorithmAssetGovernanceWorkbenchOperationAction =
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

export type AlgorithmAssetGovernanceWorkbenchAssetType =
  | 'learnable_parameter'
  | 'algorithm_seed'
  | 'policy_template'
  | 'forecast_residual_overlay'
  | 'cold_start_baseline'
  | 'sample_health'
  | 'dependency_rule'
  | 'template_seed'
  | 'construction_organization_plan_network'

export type AlgorithmAssetGovernanceWorkbenchOperationStatus =
  | 'operation_blocked'
  | 'operation_delegated'

export type AlgorithmAssetGovernanceWorkbenchOperationDependencies = {
  publishAlgorithmSeedOverride?: (
    input: Omit<AlgorithmSeedOverrideReleaseExecutionInput, 'queryExec'> & {
      queryExec?: AlgorithmSeedOverrideReleaseExecutionInput['queryExec']
    },
  ) => Promise<AlgorithmSeedOverrideReleaseExecutionResult>
  persistLearnableParameterRuntimePublication?: (input: {
    releaseExit: AlgorithmAssetReleaseExitResult
    queryExec?: AlgorithmAssetLearnableParameterReleaseExecutionQueryExec
    executedAt?: string
    impactMonitoring?: {
      monitoredAssetCount?: number
      monitoringWindowHours?: number
    }
  }) => Promise<AlgorithmAssetLearnableParameterPublicationResult>
  executeLearnableParameterRuntimeRollback?: (input: {
    queryExec?: AlgorithmAssetLearnableParameterReleaseExecutionQueryExec
    sourcePublicationKey: string
    rollbackTarget: string
    reason?: string
    executedAt?: string
  }) => Promise<AlgorithmAssetLearnableParameterRuntimeRollbackResult>
  executeForecastResidualOverlayRuntimeRollback?: (input: {
    queryExec?: AlgorithmAssetLearnableParameterReleaseExecutionQueryExec
    overlayKey: string
    rollbackTarget: string
    reason: string
  }) => Promise<RollbackAlgorithmAssetForecastResidualOverlayRuntimePublicationResult>
  executeColdStartBaselineRuntimeRollback?: (input: {
    queryExec?: AlgorithmAssetLearnableParameterReleaseExecutionQueryExec
    baselineKey: string
    segmentKey: string
    rollbackTarget: string
    reason: string
  }) => Promise<RollbackAlgorithmAssetColdStartBaselineRuntimePublicationResult>
  executeWbsTemplateRuntimeRollback?: (input: {
    queryExec?: WbsTemplateRuntimePublicationQueryExec
    companyId?: string
    projectId?: string
    sourcePublicationKey: string
    rollbackTarget: string
    reason?: string
    executedAt?: string
  }) => Promise<WbsTemplateRuntimeRollbackResult>
  executeConstructionDependencyRuleRuntimeRollback?: (input: {
    queryExec?: ConstructionDependencyRuleRuntimePublicationQueryExec
    sourcePublicationKey: string
    rollbackTarget: string
    reason?: string
    executedAt?: string
  }) => Promise<ConstructionDependencyRuleRuntimeRollbackResult>
  executeConstructionOrganizationPlanNetworkManualReviewHandoff?: (input: {
    draft: ConstructionOrganizationPlanNetworkDraft
    companyId?: string | null
    projectId?: string | null
    requestedByUserId?: string | null
    executedAt?: string | null
    queryExec?: AlgorithmAssetLearnableParameterReleaseExecutionQueryExec
  }) => Promise<ConstructionOrganizationPlanNetworkManualReviewHandoffResult | PersistConstructionOrganizationPlanNetworkManualReviewHandoffResult>
  executeConstructionOrganizationPlanNetworkManualReviewApproval?: (input: {
    draft: ConstructionOrganizationPlanNetworkDraft
    companyId?: string | null
    projectId?: string | null
    approvedByUserId?: string | null
    approvedAt?: string | null
    queryExec?: AlgorithmAssetLearnableParameterReleaseExecutionQueryExec
  }) => Promise<ConstructionOrganizationPlanNetworkManualReviewApprovalResult | PersistConstructionOrganizationPlanNetworkManualReviewApprovalResult>
  executeConstructionOrganizationPlanNetworkManualConflictReview?: (input: {
    draft: ConstructionOrganizationPlanNetworkDraft
    companyId?: string | null
    projectId?: string | null
    decision: 'approved_ready_for_replay' | 'rejected_needs_plan_date_adjustment'
    reviewedByUserId?: string | null
    reviewedAt?: string | null
    decisionNotes?: string | null
    queryExec?: AlgorithmAssetLearnableParameterReleaseExecutionQueryExec
  }) => Promise<ConstructionOrganizationPlanNetworkManualConflictReviewDecisionResult | PersistConstructionOrganizationPlanNetworkManualConflictReviewDecisionResult>
  executeConstructionOrganizationPlanNetworkReleaseExitHandoff?: (input: {
    draft: ConstructionOrganizationPlanNetworkDraft
    companyId?: string | null
    projectId?: string | null
    requestedByUserId?: string | null
    executedAt?: string | null
    releaseRecordTarget?: string | null
    rollbackTarget?: string | null
    consumerVerificationRefs?: string[]
    impactMonitoringRefs?: string[]
    rollbackWriterRefs?: string[]
    queryExec?: AlgorithmAssetLearnableParameterReleaseExecutionQueryExec
  }) => Promise<ConstructionOrganizationPlanNetworkReleaseExitHandoffResult | PersistConstructionOrganizationPlanNetworkReleaseExitHandoffResult>
  applyConstructionOrganizationPlanNetworkApprovedDraft?: (input: ApplyConstructionOrganizationPlanNetworkApprovedDraftInput) =>
    Promise<ApplyConstructionOrganizationPlanNetworkApprovedDraftResult>
  recordConstructionOrganizationPlanNetworkRuntimeEvent?: (input: RecordConstructionOrganizationPlanNetworkRuntimeEventInput) =>
    Promise<RecordConstructionOrganizationPlanNetworkRuntimeEventResult>
  recordConstructionOrganizationPlanNetworkRuntimeEngineEvidence?: (input: RecordConstructionOrganizationPlanNetworkRuntimeEngineEvidenceInput) =>
    Promise<RecordConstructionOrganizationPlanNetworkRuntimeEngineEvidenceResult>
  recordConstructionOrganizationPlanNetworkRuntimeConsumerObservation?: (input: RecordDurationRuntimeConsumerFacadeArtifactsInput) =>
    Promise<DurationRuntimeConsumerFacadeArtifactsResult>
  recordConstructionOrganizationPlanNetworkSavedOutcome?: (input: RecordConstructionOrganizationPlanNetworkSavedOutcomeInput) =>
    Promise<RecordConstructionOrganizationPlanNetworkSavedOutcomeResult>
  recordConstructionOrganizationPlanNetworkRecommendationDecision?: (input: RecordConstructionOrganizationPlanNetworkRecommendationDecisionInput) =>
    Promise<RecordConstructionOrganizationPlanNetworkRecommendationDecisionResult>
}

export type AlgorithmAssetGovernanceWorkbenchOperationInput = {
  action?: AlgorithmAssetGovernanceWorkbenchOperationAction | string | null
  assetType?: AlgorithmAssetGovernanceWorkbenchAssetType | string | null
  evidenceToken?: string | null
  workPackageKey?: string | null
  useCase?: string | null
  evidenceAction?: string | null
  businessType?: string | null
  companyId?: string | null
  projectId?: string | null
  requestedByUserId?: string | null
  domainWriterKey?: string | null
  releaseExit?: AlgorithmAssetReleaseExitResult | null
  sourcePublicationKey?: string | null
  optionId?: string | null
  draftNetworkKey?: string | null
  overlayKey?: string | null
  baselineKey?: string | null
  segmentKey?: string | null
  rollbackTarget?: string | null
  rollbackReason?: string | null
  engineCode?: string | null
  predictedDurationDays?: number | string | null
  actualDurationDays?: number | string | null
  releaseRecordTarget?: string | null
  manualConflictReviewDecision?: string | null
  decisionNotes?: string | null
  selectedScenarioIds?: string[]
  consumerVerificationRefs?: string[]
  impactMonitoringRefs?: string[]
  rollbackWriterRefs?: string[]
  constructionOrganizationPlanNetworkDraft?: ConstructionOrganizationPlanNetworkDraft | null
  queryExec?: AlgorithmAssetLearnableParameterReleaseExecutionQueryExec
  executedAt?: string
  impactMonitoring?: {
    monitoredAssetCount?: number
    monitoringWindowHours?: number
  }
  dependencies?: AlgorithmAssetGovernanceWorkbenchOperationDependencies
}

export type AlgorithmAssetGovernanceWorkbenchOperationResult = {
  status: AlgorithmAssetGovernanceWorkbenchOperationStatus
  operationAction: AlgorithmAssetGovernanceWorkbenchOperationAction | null
  assetType: AlgorithmAssetGovernanceWorkbenchAssetType | null
  writesRuntimeDirectly: false
  workbenchDoesNotGrantPublishRights: true
  delegatedToDomainWriter: boolean
  domainWriterKey: string | null
  reasons: string[]
  domainResult: unknown | null
  boundaryPolicy: string[]
}

const SUPPORTED_ACTIONS = new Set<AlgorithmAssetGovernanceWorkbenchOperationAction>([
  'release_exit_handoff',
  'manual_review_handoff',
  'manual_conflict_review',
  'manual_review_approval',
  'runtime_apply',
  'runtime_impact_monitoring',
  'runtime_rollback_execution',
  'runtime_consumer_observation',
  'runtime_engine_evidence',
  'runtime_saved_outcome',
  'runtime_recommendation_adopt',
  'runtime_recommendation_decline',
  'runtime_rollback',
])

const SUPPORTED_ASSET_TYPES = new Set<AlgorithmAssetGovernanceWorkbenchAssetType>([
  'learnable_parameter',
  'algorithm_seed',
  'policy_template',
  'forecast_residual_overlay',
  'cold_start_baseline',
  'sample_health',
  'dependency_rule',
  'template_seed',
  'construction_organization_plan_network',
])

const LEARNABLE_PARAMETER_WRITER = 'algorithmAssetLearnableParameterReleaseExecutionService'
const ALGORITHM_SEED_OVERRIDE_RUNTIME_WRITER = 'algorithmSeedOverrideReleaseExecutionService.publishApprovedAlgorithmSeedOverride'
const FORECAST_RESIDUAL_OVERLAY_ROLLBACK_WRITER = 'algorithmAssetForecastResidualOverlayService.rollbackRuntimePublication'
const COLD_START_BASELINE_ROLLBACK_WRITER = 'algorithmAssetColdStartBaselineService.rollbackRuntimePublication'
const WBS_TEMPLATE_RUNTIME_ROLLBACK_WRITER = 'wbsTemplateRuntimePublicationService.executeWbsTemplateRuntimeRollback'
const CONSTRUCTION_DEPENDENCY_RULE_RUNTIME_ROLLBACK_WRITER = 'constructionDependencyRuleRuntimePublicationService.executeConstructionDependencyRuleRuntimeRollback'
const CONSTRUCTION_ORGANIZATION_PLAN_NETWORK_MANUAL_REVIEW_WRITER = 'constructionOrganizationPlanNetworkDraftService.manualReviewHandoff'
const CONSTRUCTION_ORGANIZATION_PLAN_NETWORK_MANUAL_CONFLICT_REVIEW_WRITER = 'constructionOrganizationPlanNetworkDraftService.manualConflictReview'
const CONSTRUCTION_ORGANIZATION_PLAN_NETWORK_MANUAL_APPROVAL_WRITER = 'constructionOrganizationPlanNetworkDraftService.manualReviewApproval'
const CONSTRUCTION_ORGANIZATION_PLAN_NETWORK_RELEASE_EXIT_HANDOFF_WRITER = 'constructionOrganizationPlanNetworkDraftService.releaseExitHandoff'
const CONSTRUCTION_ORGANIZATION_PLAN_NETWORK_RUNTIME_APPLY_WRITER = 'constructionOrganizationPlanNetworkDomainWriter.applyApprovedDraft'
const CONSTRUCTION_ORGANIZATION_PLAN_NETWORK_RUNTIME_EVIDENCE_WRITER = 'constructionOrganizationPlanNetworkRuntimeEvidenceService.recordRuntimeEvent'
const CONSTRUCTION_ORGANIZATION_PLAN_NETWORK_RUNTIME_CONSUMER_OBSERVATION_WRITER = 'durationRuntimeConsumerObservationAdapterService.recordScheduleAccelerationRuntimeConsumedArtifacts'
const CONSTRUCTION_ORGANIZATION_PLAN_NETWORK_RUNTIME_ENGINE_EVIDENCE_WRITER = 'constructionOrganizationPlanNetworkRuntimeEvidenceService.recordRuntimeEngineEvidence'
const CONSTRUCTION_ORGANIZATION_PLAN_NETWORK_SAVED_OUTCOME_WRITER = 'constructionOrganizationPlanNetworkRuntimeEvidenceService.recordSavedOutcome'
const CONSTRUCTION_ORGANIZATION_PLAN_NETWORK_RECOMMENDATION_DECISION_WRITER = 'constructionOrganizationPlanNetworkRuntimeEvidenceService.recordRecommendationDecision'

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

function normalizeRefs(values: string[] | undefined) {
  return (values ?? []).map((value) => normalizeText(value)).filter(Boolean)
}

function productOutcomeLineageMetadata(input: AlgorithmAssetGovernanceWorkbenchOperationInput) {
  return {
    workPackageKey: normalizeText(input.workPackageKey) || null,
    useCase: normalizeText(input.useCase) || null,
    evidenceAction: normalizeText(input.evidenceAction) || null,
  }
}

function readPositiveDays(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? Math.ceil(parsed) : null
}

function constructionOrganizationPlanNetworkProjectionOnlyEvidenceActionReasons(
  input: AlgorithmAssetGovernanceWorkbenchOperationInput,
) {
  return constructionOrganizationProductOutcomeProjectionOnlyEvidenceActionReasons(input.evidenceAction)
}

function normalizeAction(value: unknown): AlgorithmAssetGovernanceWorkbenchOperationAction | null {
  const action = normalizeText(value) as AlgorithmAssetGovernanceWorkbenchOperationAction
  return SUPPORTED_ACTIONS.has(action) ? action : null
}

function normalizeAssetType(value: unknown): AlgorithmAssetGovernanceWorkbenchAssetType | null {
  const assetType = normalizeText(value) as AlgorithmAssetGovernanceWorkbenchAssetType
  return SUPPORTED_ASSET_TYPES.has(assetType) ? assetType : null
}

function uniqueReasons(reasons: string[]) {
  return Array.from(new Set(reasons.filter(Boolean)))
}

function blockedResult(input: {
  action: AlgorithmAssetGovernanceWorkbenchOperationAction | null
  assetType: AlgorithmAssetGovernanceWorkbenchAssetType | null
  domainWriterKey: string | null
  reasons: string[]
}): AlgorithmAssetGovernanceWorkbenchOperationResult {
  return {
    status: 'operation_blocked',
    operationAction: input.action,
    assetType: input.assetType,
    writesRuntimeDirectly: false,
    workbenchDoesNotGrantPublishRights: true,
    delegatedToDomainWriter: false,
    domainWriterKey: input.domainWriterKey,
    reasons: uniqueReasons(input.reasons),
    domainResult: null,
    boundaryPolicy: boundaryPolicy(),
  }
}

function delegatedResult(input: {
  action: AlgorithmAssetGovernanceWorkbenchOperationAction
  assetType: AlgorithmAssetGovernanceWorkbenchAssetType
  domainWriterKey: string
  domainResult: unknown
}): AlgorithmAssetGovernanceWorkbenchOperationResult {
  return {
    status: 'operation_delegated',
    operationAction: input.action,
    assetType: input.assetType,
    writesRuntimeDirectly: false,
    workbenchDoesNotGrantPublishRights: true,
    delegatedToDomainWriter: true,
    domainWriterKey: input.domainWriterKey,
    reasons: [],
    domainResult: input.domainResult,
    boundaryPolicy: boundaryPolicy(),
  }
}

function boundaryPolicy() {
  return [
    'workbench_operation_does_not_grant_publish_rights',
    'workbench_never_writes_runtime_directly',
    'runtime_write_requires_explicit_domain_writer_consumer_monitoring_and_rollback_evidence',
    'manual_publish_anchors_remain_hard_blockers_until_versioned_anchor_upgrade_passes',
  ]
}

function baseReasons(
  input: AlgorithmAssetGovernanceWorkbenchOperationInput,
  action: AlgorithmAssetGovernanceWorkbenchOperationAction | null,
  assetType: AlgorithmAssetGovernanceWorkbenchAssetType | null,
) {
  const reasons: string[] = []
  if (!normalizeText(input.action)) reasons.push('operation_action_required')
  else if (!action) reasons.push('unsupported_operation_action')
  if (!normalizeText(input.assetType)) reasons.push('asset_type_required')
  else if (!assetType) reasons.push('unsupported_asset_type')
  if (!normalizeText(input.evidenceToken)) reasons.push('evidence_token_required')
  return reasons
}

function learnableParameterWriterReasons(input: AlgorithmAssetGovernanceWorkbenchOperationInput) {
  const reasons: string[] = []
  const writerKey = normalizeText(input.domainWriterKey)
  if (!writerKey) reasons.push('domain_writer_required')
  else if (writerKey !== LEARNABLE_PARAMETER_WRITER) reasons.push('domain_writer_not_registered_for_asset_type')
  if (normalizeRefs(input.consumerVerificationRefs).length === 0) reasons.push('consumer_verification_required')
  if (normalizeRefs(input.rollbackWriterRefs).length === 0) reasons.push('rollback_writer_required')
  return reasons
}

function algorithmSeedOverrideRuntimeApplyReasons(input: AlgorithmAssetGovernanceWorkbenchOperationInput) {
  const reasons: string[] = []
  const writerKey = normalizeText(input.domainWriterKey)
  if (!writerKey) reasons.push('domain_writer_required')
  else if (writerKey !== ALGORITHM_SEED_OVERRIDE_RUNTIME_WRITER) {
    reasons.push('domain_writer_not_registered_for_asset_type')
  }
  if (!normalizeText(input.sourcePublicationKey).startsWith('algorithm_seed_upgrade_candidates:')) {
    reasons.push('algorithm_seed_candidate_publication_key_required')
  }
  if (!normalizeText(input.companyId)) reasons.push('company_scope_required')
  if (!normalizeText(input.requestedByUserId)) reasons.push('published_by_required')
  if (!normalizeText(input.releaseRecordTarget)) reasons.push('release_record_target_required')
  if (!normalizeText(input.rollbackTarget)) reasons.push('rollback_target_required')
  if (normalizeRefs(input.consumerVerificationRefs).length === 0) reasons.push('consumer_verification_required')
  if (normalizeRefs(input.impactMonitoringRefs).length === 0) reasons.push('impact_monitoring_required')
  if (normalizeRefs(input.rollbackWriterRefs).length === 0) reasons.push('rollback_writer_required')
  const hasApplyDependency = Boolean(input.dependencies?.publishAlgorithmSeedOverride || input.queryExec)
  if (writerKey === ALGORITHM_SEED_OVERRIDE_RUNTIME_WRITER && !hasApplyDependency) {
    reasons.push('domain_writer_dependency_required')
  }
  return reasons
}

function runtimeRollbackWriterReasons(input: AlgorithmAssetGovernanceWorkbenchOperationInput, expectedWriterKey: string) {
  const reasons: string[] = []
  const writerKey = normalizeText(input.domainWriterKey)
  if (!writerKey) reasons.push('domain_writer_required')
  else if (writerKey !== expectedWriterKey) reasons.push('domain_writer_not_registered_for_asset_type')
  if (normalizeRefs(input.consumerVerificationRefs).length === 0) reasons.push('consumer_verification_required')
  if (normalizeRefs(input.rollbackWriterRefs).length === 0) reasons.push('rollback_writer_required')
  if (!normalizeText(input.rollbackTarget)) reasons.push('rollback_target_required')
  if (!normalizeText(input.rollbackReason)) reasons.push('rollback_reason_required')
  return reasons
}

function releaseHandoffReasons(input: AlgorithmAssetGovernanceWorkbenchOperationInput) {
  const reasons = learnableParameterWriterReasons(input)
  if (normalizeRefs(input.impactMonitoringRefs).length === 0) reasons.push('impact_monitoring_required')
  if (!input.releaseExit?.canHandoffToRuntimeAdapter || !input.releaseExit.releasePackage) {
    reasons.push('release_exit_handoff_package_required')
  }
  const hasWriterDependency = Boolean(input.dependencies?.persistLearnableParameterRuntimePublication || input.queryExec)
  if (normalizeText(input.domainWriterKey) === LEARNABLE_PARAMETER_WRITER && !hasWriterDependency) {
    reasons.push('domain_writer_dependency_required')
  }
  return reasons
}

function rollbackReasons(input: AlgorithmAssetGovernanceWorkbenchOperationInput) {
  const reasons = learnableParameterWriterReasons(input)
  if (!normalizeText(input.sourcePublicationKey)) reasons.push('source_publication_key_required')
  if (!normalizeText(input.rollbackTarget)) reasons.push('rollback_target_required')
  const hasRollbackDependency = Boolean(input.dependencies?.executeLearnableParameterRuntimeRollback || input.queryExec)
  if (normalizeText(input.domainWriterKey) === LEARNABLE_PARAMETER_WRITER && !hasRollbackDependency) {
    reasons.push('domain_writer_dependency_required')
  }
  return reasons
}

function forecastResidualOverlayRollbackReasons(input: AlgorithmAssetGovernanceWorkbenchOperationInput) {
  const reasons = runtimeRollbackWriterReasons(input, FORECAST_RESIDUAL_OVERLAY_ROLLBACK_WRITER)
  if (!normalizeText(input.overlayKey)) reasons.push('overlay_key_required')
  const hasRollbackDependency = Boolean(input.dependencies?.executeForecastResidualOverlayRuntimeRollback || input.queryExec)
  if (normalizeText(input.domainWriterKey) === FORECAST_RESIDUAL_OVERLAY_ROLLBACK_WRITER && !hasRollbackDependency) {
    reasons.push('domain_writer_dependency_required')
  }
  return reasons
}

function coldStartBaselineRollbackReasons(input: AlgorithmAssetGovernanceWorkbenchOperationInput) {
  const reasons = runtimeRollbackWriterReasons(input, COLD_START_BASELINE_ROLLBACK_WRITER)
  if (!normalizeText(input.baselineKey)) reasons.push('baseline_key_required')
  if (!normalizeText(input.segmentKey)) reasons.push('segment_key_required')
  const hasRollbackDependency = Boolean(input.dependencies?.executeColdStartBaselineRuntimeRollback || input.queryExec)
  if (normalizeText(input.domainWriterKey) === COLD_START_BASELINE_ROLLBACK_WRITER && !hasRollbackDependency) {
    reasons.push('domain_writer_dependency_required')
  }
  return reasons
}

function wbsTemplateRuntimeRollbackReasons(input: AlgorithmAssetGovernanceWorkbenchOperationInput) {
  const reasons = runtimeRollbackWriterReasons(input, WBS_TEMPLATE_RUNTIME_ROLLBACK_WRITER)
  if (!normalizeText(input.sourcePublicationKey)) reasons.push('source_publication_key_required')
  if (!normalizeText(input.companyId)) reasons.push('company_scope_required')
  const hasRollbackDependency = Boolean(input.dependencies?.executeWbsTemplateRuntimeRollback || input.queryExec)
  if (normalizeText(input.domainWriterKey) === WBS_TEMPLATE_RUNTIME_ROLLBACK_WRITER && !hasRollbackDependency) {
    reasons.push('domain_writer_dependency_required')
  }
  return reasons
}

function constructionDependencyRuleRuntimeRollbackReasons(input: AlgorithmAssetGovernanceWorkbenchOperationInput) {
  const reasons = runtimeRollbackWriterReasons(input, CONSTRUCTION_DEPENDENCY_RULE_RUNTIME_ROLLBACK_WRITER)
  if (!normalizeText(input.sourcePublicationKey)) reasons.push('source_publication_key_required')
  const hasRollbackDependency = Boolean(input.dependencies?.executeConstructionDependencyRuleRuntimeRollback || input.queryExec)
  if (normalizeText(input.domainWriterKey) === CONSTRUCTION_DEPENDENCY_RULE_RUNTIME_ROLLBACK_WRITER && !hasRollbackDependency) {
    reasons.push('domain_writer_dependency_required')
  }
  return reasons
}

function constructionOrganizationPlanNetworkManualReviewReasons(input: AlgorithmAssetGovernanceWorkbenchOperationInput) {
  const reasons: string[] = []
  const writerKey = normalizeText(input.domainWriterKey)
  if (!writerKey) reasons.push('domain_writer_required')
  else if (writerKey !== CONSTRUCTION_ORGANIZATION_PLAN_NETWORK_MANUAL_REVIEW_WRITER) {
    reasons.push('domain_writer_not_registered_for_asset_type')
  }
  if (normalizeRefs(input.consumerVerificationRefs).length === 0) reasons.push('consumer_verification_required')
  const draft = input.constructionOrganizationPlanNetworkDraft
  if (!draft) {
    reasons.push('draft_network_required')
    return reasons
  }
  const conflictReviewAllowed = draft.readiness === 'conflict_review_required'
  if (!canSubmitConstructionOrganizationPlanNetworkManualReviewHandoff(draft)) reasons.push('draft_not_ready_for_replay')
  if (draft.evaluationEvidence?.evaluationStatus !== 'evaluation_ready') reasons.push('draft_evaluation_not_ready')
  if (!(draft.edgeCount > 0) || !Array.isArray(draft.edges) || draft.edges.length === 0) reasons.push('draft_has_no_edges')
  if (draft.mutationBoundary?.writesTaskDependencies !== false) reasons.push('draft_write_boundary_unknown')
  if (!draft.reviewRequired) reasons.push('draft_review_required_flag_missing')
  const blockedReasons = Array.isArray(draft.blockedReasons)
    ? draft.blockedReasons.filter((reason) => !(
      conflictReviewAllowed && isConstructionOrganizationConflictReviewHandoffReason(reason)
    ))
    : []
  return [...new Set([...reasons, ...blockedReasons])]
}

function constructionOrganizationPlanNetworkManualApprovalReasons(input: AlgorithmAssetGovernanceWorkbenchOperationInput) {
  const reasons: string[] = []
  const writerKey = normalizeText(input.domainWriterKey)
  if (!writerKey) reasons.push('domain_writer_required')
  else if (writerKey !== CONSTRUCTION_ORGANIZATION_PLAN_NETWORK_MANUAL_APPROVAL_WRITER) {
    reasons.push('domain_writer_not_registered_for_asset_type')
  }
  if (normalizeRefs(input.consumerVerificationRefs).length === 0) reasons.push('consumer_verification_required')
  const draft = input.constructionOrganizationPlanNetworkDraft
  if (!draft) {
    reasons.push('draft_network_required')
    return reasons
  }
  if (!draft.manualReviewHandoff?.candidateEventId) reasons.push('manual_review_handoff_required')
  if (draft.readiness !== 'ready_for_replay') reasons.push('draft_not_ready_for_replay')
  if (draft.evaluationEvidence?.evaluationStatus !== 'evaluation_ready') reasons.push('draft_evaluation_not_ready')
  if (!(draft.edgeCount > 0) || !Array.isArray(draft.edges) || draft.edges.length === 0) reasons.push('draft_has_no_edges')
  if (draft.mutationBoundary?.writesTaskDependencies !== false) reasons.push('draft_write_boundary_unknown')
  return reasons
}

function normalizeManualConflictReviewDecision(value: unknown): 'approved_ready_for_replay' | 'rejected_needs_plan_date_adjustment' | null {
  const decision = normalizeText(value)
  if (decision === 'approved_ready_for_replay' || decision === 'rejected_needs_plan_date_adjustment') return decision
  return null
}

function constructionOrganizationPlanNetworkManualConflictReviewReasons(input: AlgorithmAssetGovernanceWorkbenchOperationInput) {
  const reasons: string[] = []
  const writerKey = normalizeText(input.domainWriterKey)
  if (!writerKey) reasons.push('domain_writer_required')
  else if (writerKey !== CONSTRUCTION_ORGANIZATION_PLAN_NETWORK_MANUAL_CONFLICT_REVIEW_WRITER) {
    reasons.push('domain_writer_not_registered_for_asset_type')
  }
  if (normalizeRefs(input.consumerVerificationRefs).length === 0) reasons.push('consumer_verification_required')
  if (!normalizeManualConflictReviewDecision(input.manualConflictReviewDecision)) {
    reasons.push('manual_conflict_review_decision_required')
  }
  const draft = input.constructionOrganizationPlanNetworkDraft
  if (!draft) {
    reasons.push('draft_network_required')
    return reasons
  }
  if (draft.readiness !== 'conflict_review_required') reasons.push('draft_not_in_conflict_review')
  if (!draft.manualReviewHandoff?.candidateEventId) reasons.push('manual_review_handoff_required')
  if (draft.evaluationEvidence?.evaluationStatus !== 'evaluation_ready') reasons.push('draft_evaluation_not_ready')
  if (!(draft.edgeCount > 0) || !Array.isArray(draft.edges) || draft.edges.length === 0) reasons.push('draft_has_no_edges')
  if (draft.mutationBoundary?.writesTaskDependencies !== false) reasons.push('draft_write_boundary_unknown')
  const blockedReasons = Array.isArray(draft.blockedReasons)
    ? draft.blockedReasons.filter((reason) => !isConstructionOrganizationConflictReviewHandoffReason(reason))
    : []
  return [...new Set([...reasons, ...blockedReasons])]
}

function constructionOrganizationPlanNetworkReleaseExitHandoffReasons(input: AlgorithmAssetGovernanceWorkbenchOperationInput) {
  const reasons: string[] = []
  const writerKey = normalizeText(input.domainWriterKey)
  if (!writerKey) reasons.push('domain_writer_required')
  else if (writerKey !== CONSTRUCTION_ORGANIZATION_PLAN_NETWORK_RELEASE_EXIT_HANDOFF_WRITER) {
    reasons.push('domain_writer_not_registered_for_asset_type')
  }
  if (normalizeRefs(input.consumerVerificationRefs).length === 0) reasons.push('consumer_verification_required')
  if (normalizeRefs(input.impactMonitoringRefs).length === 0) reasons.push('impact_monitoring_required')
  if (normalizeRefs(input.rollbackWriterRefs).length === 0) reasons.push('rollback_writer_required')
  if (!normalizeText(input.rollbackTarget)) reasons.push('rollback_target_required')
  if (!normalizeText(input.releaseRecordTarget)) reasons.push('release_record_target_required')
  const draft = input.constructionOrganizationPlanNetworkDraft
  if (!draft) {
    reasons.push('draft_network_required')
    return reasons
  }
  if (!draft.releaseExitPreparation) reasons.push('release_exit_preparation_required')
  if (!draft.domainWriterReleaseExitReadiness) reasons.push('domain_writer_release_exit_readiness_required')
  if (!draft.manualReviewHandoff?.candidateEventId) reasons.push('manual_review_handoff_required')
  if (!draft.manualReviewApproval?.candidateEventId) reasons.push('manual_review_approval_required')
  if (draft.readiness !== 'ready_for_replay') reasons.push('draft_not_ready_for_replay')
  if (draft.evaluationEvidence?.evaluationStatus !== 'evaluation_ready') reasons.push('draft_evaluation_not_ready')
  if (!(draft.edgeCount > 0) || !Array.isArray(draft.edges) || draft.edges.length === 0) reasons.push('draft_has_no_edges')
  if (draft.mutationBoundary?.writesTaskDependencies !== false) reasons.push('draft_write_boundary_unknown')
  if (draft.releaseExitPreparation?.canMaterializeRuntime !== false) reasons.push('release_exit_preparation_boundary_unknown')
  if (draft.domainWriterReleaseExitReadiness?.canMaterializeRuntime !== false) {
    reasons.push('domain_writer_release_exit_readiness_boundary_unknown')
  }
  return reasons
}

function constructionOrganizationPlanNetworkRuntimeApplyReasons(input: AlgorithmAssetGovernanceWorkbenchOperationInput) {
  const reasons: string[] = []
  const writerKey = normalizeText(input.domainWriterKey)
  if (!writerKey) reasons.push('domain_writer_required')
  else if (writerKey !== CONSTRUCTION_ORGANIZATION_PLAN_NETWORK_RUNTIME_APPLY_WRITER) {
    reasons.push('domain_writer_not_registered_for_asset_type')
  }
  if (normalizeRefs(input.consumerVerificationRefs).length === 0) reasons.push('consumer_verification_required')
  if (normalizeRefs(input.impactMonitoringRefs).length === 0) reasons.push('impact_monitoring_required')
  if (normalizeRefs(input.rollbackWriterRefs).length === 0) reasons.push('rollback_writer_required')
  if (!normalizeText(input.projectId)) reasons.push('project_id_required')
  const hasApplyDependency = Boolean(input.dependencies?.applyConstructionOrganizationPlanNetworkApprovedDraft || input.queryExec)
  if (writerKey === CONSTRUCTION_ORGANIZATION_PLAN_NETWORK_RUNTIME_APPLY_WRITER && !hasApplyDependency) {
    reasons.push('domain_writer_dependency_required')
  }

  const draft = input.constructionOrganizationPlanNetworkDraft
  if (!draft) {
    reasons.push('draft_network_required')
    return reasons
  }
  if (!draft.manualReviewHandoff?.candidateEventId) reasons.push('manual_review_handoff_required')
  if (!draft.manualReviewApproval?.candidateEventId) reasons.push('manual_review_approval_required')
  if (!draft.releaseExitHandoff?.candidateEventId) reasons.push('release_exit_handoff_required')
  if (!draft.releaseExitHandoff?.releaseRecordTarget) reasons.push('release_record_target_required')
  if (!draft.releaseExitHandoff?.rollbackTarget) reasons.push('rollback_target_required')
  if (normalizeText(input.releaseRecordTarget) && normalizeText(input.releaseRecordTarget) !== normalizeText(draft.releaseExitHandoff?.releaseRecordTarget)) {
    reasons.push('release_record_target_mismatch')
  }
  if (normalizeText(input.rollbackTarget) && normalizeText(input.rollbackTarget) !== normalizeText(draft.releaseExitHandoff?.rollbackTarget)) {
    reasons.push('rollback_target_mismatch')
  }
  if (draft.readiness !== 'ready_for_replay') reasons.push('draft_not_ready_for_replay')
  if (draft.evaluationEvidence?.evaluationStatus !== 'evaluation_ready') reasons.push('draft_evaluation_not_ready')
  if (!(draft.edgeCount > 0) || !Array.isArray(draft.edges) || draft.edges.length === 0) reasons.push('draft_has_no_edges')
  if (draft.mutationBoundary?.writesTaskDependencies !== false) reasons.push('draft_write_boundary_unknown')
  if (draft.edges.some((edge) => edge.writesTaskDependencies !== false)) reasons.push('draft_edge_write_boundary_unknown')
  return reasons
}

function constructionOrganizationPlanNetworkRuntimeEvidenceReasons(
  input: AlgorithmAssetGovernanceWorkbenchOperationInput,
  eventType: 'impact_monitoring' | 'rollback_execution',
) {
  const reasons: string[] = []
  const writerKey = normalizeText(input.domainWriterKey)
  reasons.push(...constructionOrganizationPlanNetworkProjectionOnlyEvidenceActionReasons(input))
  if (!writerKey) reasons.push('domain_writer_required')
  else if (writerKey !== CONSTRUCTION_ORGANIZATION_PLAN_NETWORK_RUNTIME_EVIDENCE_WRITER) {
    reasons.push('domain_writer_not_registered_for_asset_type')
  }
  if (!normalizeText(input.businessType)) reasons.push('business_type_required')
  if (!normalizeText(input.sourcePublicationKey)) reasons.push('source_publication_key_required')
  if (eventType === 'impact_monitoring') {
    if (normalizeRefs(input.consumerVerificationRefs).length === 0) reasons.push('consumer_verification_required')
    if (normalizeRefs(input.impactMonitoringRefs).length === 0) reasons.push('impact_monitoring_required')
  }
  if (eventType === 'rollback_execution') {
    if (normalizeRefs(input.rollbackWriterRefs).length === 0) reasons.push('rollback_writer_required')
    if (!normalizeText(input.rollbackTarget)) reasons.push('rollback_target_required')
    if (!normalizeText(input.rollbackReason)) reasons.push('rollback_reason_required')
  }
  const hasRuntimeEvidenceDependency = Boolean(
    input.dependencies?.recordConstructionOrganizationPlanNetworkRuntimeEvent || input.queryExec,
  )
  if (writerKey === CONSTRUCTION_ORGANIZATION_PLAN_NETWORK_RUNTIME_EVIDENCE_WRITER && !hasRuntimeEvidenceDependency) {
    reasons.push('domain_writer_dependency_required')
  }
  return reasons
}

function constructionOrganizationPlanNetworkRuntimeConsumerObservationReasons(
  input: AlgorithmAssetGovernanceWorkbenchOperationInput,
) {
  const reasons: string[] = []
  const writerKey = normalizeText(input.domainWriterKey)
  reasons.push(...constructionOrganizationPlanNetworkProjectionOnlyEvidenceActionReasons(input))
  if (!writerKey) reasons.push('domain_writer_required')
  else if (writerKey !== CONSTRUCTION_ORGANIZATION_PLAN_NETWORK_RUNTIME_CONSUMER_OBSERVATION_WRITER) {
    reasons.push('domain_writer_not_registered_for_asset_type')
  }
  if (!normalizeText(input.businessType)) reasons.push('business_type_required')
  if (!normalizeText(input.projectId)) reasons.push('project_id_required')
  if (!normalizeText(input.sourcePublicationKey)) reasons.push('source_publication_key_required')
  if (normalizeRefs(input.consumerVerificationRefs).length === 0) reasons.push('consumer_verification_required')
  const hasRuntimeConsumerObservationDependency = Boolean(
    input.dependencies?.recordConstructionOrganizationPlanNetworkRuntimeConsumerObservation || input.queryExec,
  )
  if (writerKey === CONSTRUCTION_ORGANIZATION_PLAN_NETWORK_RUNTIME_CONSUMER_OBSERVATION_WRITER && !hasRuntimeConsumerObservationDependency) {
    reasons.push('domain_writer_dependency_required')
  }
  return reasons
}

function constructionOrganizationPlanNetworkSavedOutcomeReasons(
  input: AlgorithmAssetGovernanceWorkbenchOperationInput,
) {
  const reasons: string[] = []
  const writerKey = normalizeText(input.domainWriterKey)
  reasons.push(...constructionOrganizationPlanNetworkProjectionOnlyEvidenceActionReasons(input))
  if (!writerKey) reasons.push('domain_writer_required')
  else if (writerKey !== CONSTRUCTION_ORGANIZATION_PLAN_NETWORK_SAVED_OUTCOME_WRITER) {
    reasons.push('domain_writer_not_registered_for_asset_type')
  }
  if (!normalizeText(input.businessType)) reasons.push('business_type_required')
  if (!normalizeText(input.sourcePublicationKey)) reasons.push('source_publication_key_required')
  if (!normalizeText(input.releaseRecordTarget)) reasons.push('outcome_ref_required')
  const hasSavedOutcomeDependency = Boolean(
    input.dependencies?.recordConstructionOrganizationPlanNetworkSavedOutcome || input.queryExec,
  )
  if (writerKey === CONSTRUCTION_ORGANIZATION_PLAN_NETWORK_SAVED_OUTCOME_WRITER && !hasSavedOutcomeDependency) {
    reasons.push('domain_writer_dependency_required')
  }
  return reasons
}

function constructionOrganizationPlanNetworkRuntimeEngineEvidenceReasons(
  input: AlgorithmAssetGovernanceWorkbenchOperationInput,
) {
  const reasons: string[] = []
  const writerKey = normalizeText(input.domainWriterKey)
  reasons.push(...constructionOrganizationPlanNetworkProjectionOnlyEvidenceActionReasons(input))
  if (!writerKey) reasons.push('domain_writer_required')
  else if (writerKey !== CONSTRUCTION_ORGANIZATION_PLAN_NETWORK_RUNTIME_ENGINE_EVIDENCE_WRITER) {
    reasons.push('domain_writer_not_registered_for_asset_type')
  }
  if (!normalizeText(input.businessType)) reasons.push('business_type_required')
  if (!normalizeText(input.sourcePublicationKey)) reasons.push('source_publication_key_required')
  if (!normalizeText(input.engineCode)) reasons.push('engine_code_required')
  if (readPositiveDays(input.predictedDurationDays) === null) reasons.push('predicted_duration_days_required')
  if (readPositiveDays(input.actualDurationDays) === null) reasons.push('actual_duration_days_required')
  const hasRuntimeEngineEvidenceDependency = Boolean(
    input.dependencies?.recordConstructionOrganizationPlanNetworkRuntimeEngineEvidence || input.queryExec,
  )
  if (writerKey === CONSTRUCTION_ORGANIZATION_PLAN_NETWORK_RUNTIME_ENGINE_EVIDENCE_WRITER && !hasRuntimeEngineEvidenceDependency) {
    reasons.push('domain_writer_dependency_required')
  }
  return reasons
}

function constructionOrganizationPlanNetworkRecommendationDecisionReasons(
  input: AlgorithmAssetGovernanceWorkbenchOperationInput,
) {
  const reasons: string[] = []
  const writerKey = normalizeText(input.domainWriterKey)
  const evidenceAction = normalizeText(input.evidenceAction)
  if (!writerKey) reasons.push('domain_writer_required')
  else if (writerKey !== CONSTRUCTION_ORGANIZATION_PLAN_NETWORK_RECOMMENDATION_DECISION_WRITER) {
    reasons.push('domain_writer_not_registered_for_asset_type')
  }
  if (evidenceAction && evidenceAction !== 'record_site_adoption_for_business_type') {
    reasons.push('recommendation_decision_evidence_action_must_be_site_adoption')
  }
  if (!normalizeText(input.businessType)) reasons.push('business_type_required')
  if (!normalizeText(input.projectId)) reasons.push('project_id_required')
  if (
    !normalizeText(input.releaseRecordTarget)
    && !normalizeText(input.rollbackTarget)
  ) {
    reasons.push('recommendation_option_identity_required')
  }
  const hasRecommendationDecisionDependency = Boolean(
    input.dependencies?.recordConstructionOrganizationPlanNetworkRecommendationDecision || input.queryExec,
  )
  if (writerKey === CONSTRUCTION_ORGANIZATION_PLAN_NETWORK_RECOMMENDATION_DECISION_WRITER && !hasRecommendationDecisionDependency) {
    reasons.push('domain_writer_dependency_required')
  }
  return reasons
}

async function delegateLearnableParameterRelease(
  input: AlgorithmAssetGovernanceWorkbenchOperationInput,
) {
  const writer = input.dependencies?.persistLearnableParameterRuntimePublication
  if (writer) {
    return writer({
      releaseExit: input.releaseExit as AlgorithmAssetReleaseExitResult,
      queryExec: input.queryExec,
      executedAt: input.executedAt,
      impactMonitoring: input.impactMonitoring,
    })
  }

  return persistAlgorithmAssetLearnableParameterRuntimePublication({
    releaseExit: input.releaseExit as AlgorithmAssetReleaseExitResult,
    queryExec: input.queryExec as AlgorithmAssetLearnableParameterReleaseExecutionQueryExec,
    executedAt: input.executedAt,
    impactMonitoring: input.impactMonitoring,
  })
}

async function delegateLearnableParameterRollback(
  input: AlgorithmAssetGovernanceWorkbenchOperationInput,
) {
  const writer = input.dependencies?.executeLearnableParameterRuntimeRollback
  const rollbackInput = {
    queryExec: input.queryExec,
    sourcePublicationKey: normalizeText(input.sourcePublicationKey),
    rollbackTarget: normalizeText(input.rollbackTarget),
    reason: normalizeText(input.rollbackReason) || undefined,
    executedAt: input.executedAt,
  }
  if (writer) return writer(rollbackInput)

  return executeAlgorithmAssetLearnableParameterRuntimeRollback({
    ...rollbackInput,
    queryExec: input.queryExec as AlgorithmAssetLearnableParameterReleaseExecutionQueryExec,
  })
}

async function delegateForecastResidualOverlayRollback(
  input: AlgorithmAssetGovernanceWorkbenchOperationInput,
) {
  const writer = input.dependencies?.executeForecastResidualOverlayRuntimeRollback
  const rollbackInput = {
    queryExec: input.queryExec,
    overlayKey: normalizeText(input.overlayKey),
    rollbackTarget: normalizeText(input.rollbackTarget),
    reason: normalizeText(input.rollbackReason),
  }
  if (writer) return writer(rollbackInput as {
    queryExec?: AlgorithmAssetLearnableParameterReleaseExecutionQueryExec
    overlayKey: string
    rollbackTarget: string
    reason: string
  })

  return rollbackAlgorithmAssetForecastResidualOverlayRuntimePublication({
    ...rollbackInput,
    queryExec: input.queryExec as AlgorithmAssetLearnableParameterReleaseExecutionQueryExec,
  } as {
    queryExec: AlgorithmAssetLearnableParameterReleaseExecutionQueryExec
    overlayKey: string
    rollbackTarget: string
    reason: string
  })
}

async function delegateColdStartBaselineRollback(
  input: AlgorithmAssetGovernanceWorkbenchOperationInput,
) {
  const writer = input.dependencies?.executeColdStartBaselineRuntimeRollback
  const rollbackInput = {
    queryExec: input.queryExec,
    baselineKey: normalizeText(input.baselineKey),
    segmentKey: normalizeText(input.segmentKey),
    rollbackTarget: normalizeText(input.rollbackTarget),
    reason: normalizeText(input.rollbackReason),
  }
  if (writer) return writer(rollbackInput as {
    queryExec?: AlgorithmAssetLearnableParameterReleaseExecutionQueryExec
    baselineKey: string
    segmentKey: string
    rollbackTarget: string
    reason: string
  })

  return rollbackAlgorithmAssetColdStartBaselineRuntimePublicationRecord({
    ...rollbackInput,
    queryExec: input.queryExec as AlgorithmAssetLearnableParameterReleaseExecutionQueryExec,
  } as {
    queryExec: AlgorithmAssetLearnableParameterReleaseExecutionQueryExec
    baselineKey: string
    segmentKey: string
    rollbackTarget: string
    reason: string
  })
}

async function delegateWbsTemplateRuntimeRollback(
  input: AlgorithmAssetGovernanceWorkbenchOperationInput,
) {
  const writer = input.dependencies?.executeWbsTemplateRuntimeRollback
  const rollbackInput = {
    queryExec: input.queryExec as WbsTemplateRuntimePublicationQueryExec | undefined,
    companyId: normalizeText(input.companyId),
    projectId: normalizeText(input.projectId) || undefined,
    sourcePublicationKey: normalizeText(input.sourcePublicationKey),
    rollbackTarget: normalizeText(input.rollbackTarget),
    reason: normalizeText(input.rollbackReason) || undefined,
    executedAt: input.executedAt,
  }
  if (writer) return writer(rollbackInput)

  return executeWbsTemplateRuntimeRollback({
    ...rollbackInput,
    queryExec: input.queryExec as WbsTemplateRuntimePublicationQueryExec,
  })
}

async function delegateConstructionDependencyRuleRuntimeRollback(
  input: AlgorithmAssetGovernanceWorkbenchOperationInput,
) {
  const writer = input.dependencies?.executeConstructionDependencyRuleRuntimeRollback
  const rollbackInput = {
    queryExec: input.queryExec as ConstructionDependencyRuleRuntimePublicationQueryExec | undefined,
    sourcePublicationKey: normalizeText(input.sourcePublicationKey),
    rollbackTarget: normalizeText(input.rollbackTarget),
    reason: normalizeText(input.rollbackReason) || undefined,
    executedAt: input.executedAt,
  }
  if (writer) return writer(rollbackInput)

  return executeConstructionDependencyRuleRuntimeRollback({
    ...rollbackInput,
    queryExec: input.queryExec as ConstructionDependencyRuleRuntimePublicationQueryExec,
  })
}

async function delegateConstructionOrganizationPlanNetworkManualReview(
  input: AlgorithmAssetGovernanceWorkbenchOperationInput,
) {
  const draft = input.constructionOrganizationPlanNetworkDraft as ConstructionOrganizationPlanNetworkDraft
  const writer = input.dependencies?.executeConstructionOrganizationPlanNetworkManualReviewHandoff
  if (writer) {
    return writer({
      draft,
      companyId: normalizeText(input.companyId) || null,
      projectId: normalizeText(input.projectId) || null,
      requestedByUserId: normalizeText(input.requestedByUserId) || null,
      executedAt: normalizeText(input.executedAt) || null,
      queryExec: input.queryExec,
    })
  }

  if (input.queryExec) {
    return persistConstructionOrganizationPlanNetworkManualReviewHandoff({
      draft,
      companyId: normalizeText(input.companyId) || null,
      projectId: normalizeText(input.projectId) || null,
      requestedByUserId: normalizeText(input.requestedByUserId) || null,
      executedAt: normalizeText(input.executedAt) || null,
      queryExec: input.queryExec,
    })
  }

  return buildConstructionOrganizationPlanNetworkManualReviewHandoff({
    draft,
    requestedByUserId: normalizeText(input.requestedByUserId) || null,
    executedAt: normalizeText(input.executedAt) || null,
  })
}

async function delegateConstructionOrganizationPlanNetworkManualApproval(
  input: AlgorithmAssetGovernanceWorkbenchOperationInput,
) {
  const draft = input.constructionOrganizationPlanNetworkDraft as ConstructionOrganizationPlanNetworkDraft
  const writer = input.dependencies?.executeConstructionOrganizationPlanNetworkManualReviewApproval
  if (writer) {
    return writer({
      draft,
      companyId: normalizeText(input.companyId) || null,
      projectId: normalizeText(input.projectId) || null,
      approvedByUserId: normalizeText(input.requestedByUserId) || null,
      approvedAt: normalizeText(input.executedAt) || null,
      queryExec: input.queryExec,
    })
  }

  if (input.queryExec) {
    return persistConstructionOrganizationPlanNetworkManualReviewApproval({
      draft,
      companyId: normalizeText(input.companyId) || null,
      projectId: normalizeText(input.projectId) || null,
      approvedByUserId: normalizeText(input.requestedByUserId) || null,
      approvedAt: normalizeText(input.executedAt) || null,
      queryExec: input.queryExec,
    })
  }

  return buildConstructionOrganizationPlanNetworkManualReviewApproval({
    draft,
    approvedByUserId: normalizeText(input.requestedByUserId) || null,
    approvedAt: normalizeText(input.executedAt) || null,
  })
}

async function delegateConstructionOrganizationPlanNetworkManualConflictReview(
  input: AlgorithmAssetGovernanceWorkbenchOperationInput,
) {
  const draft = input.constructionOrganizationPlanNetworkDraft as ConstructionOrganizationPlanNetworkDraft
  const decision = normalizeManualConflictReviewDecision(input.manualConflictReviewDecision) as 'approved_ready_for_replay' | 'rejected_needs_plan_date_adjustment'
  const conflictReviewInput = {
    draft,
    companyId: normalizeText(input.companyId) || null,
    projectId: normalizeText(input.projectId) || null,
    decision,
    reviewedByUserId: normalizeText(input.requestedByUserId) || null,
    reviewedAt: normalizeText(input.executedAt) || null,
    decisionNotes: normalizeText(input.decisionNotes) || null,
    queryExec: input.queryExec,
  }
  const writer = input.dependencies?.executeConstructionOrganizationPlanNetworkManualConflictReview
  if (writer) return writer(conflictReviewInput)

  if (input.queryExec) {
    return persistConstructionOrganizationPlanNetworkManualConflictReviewDecision(conflictReviewInput)
  }

  return buildConstructionOrganizationPlanNetworkManualConflictReviewDecision(conflictReviewInput)
}

async function delegateConstructionOrganizationPlanNetworkReleaseExitHandoff(
  input: AlgorithmAssetGovernanceWorkbenchOperationInput,
) {
  const draft = input.constructionOrganizationPlanNetworkDraft as ConstructionOrganizationPlanNetworkDraft
  const handoffInput = {
    draft,
    companyId: normalizeText(input.companyId) || null,
    projectId: normalizeText(input.projectId) || null,
    requestedByUserId: normalizeText(input.requestedByUserId) || null,
    executedAt: normalizeText(input.executedAt) || null,
    releaseRecordTarget: normalizeText(input.releaseRecordTarget) || null,
    rollbackTarget: normalizeText(input.rollbackTarget) || null,
    consumerVerificationRefs: normalizeRefs(input.consumerVerificationRefs),
    impactMonitoringRefs: normalizeRefs(input.impactMonitoringRefs),
    rollbackWriterRefs: normalizeRefs(input.rollbackWriterRefs),
    queryExec: input.queryExec,
  }
  const writer = input.dependencies?.executeConstructionOrganizationPlanNetworkReleaseExitHandoff
  if (writer) return writer(handoffInput)

  if (input.queryExec) {
    return persistConstructionOrganizationPlanNetworkReleaseExitHandoff(handoffInput)
  }

  return buildConstructionOrganizationPlanNetworkReleaseExitHandoff(handoffInput)
}

async function delegateConstructionOrganizationPlanNetworkRuntimeApply(
  input: AlgorithmAssetGovernanceWorkbenchOperationInput,
) {
  const draft = input.constructionOrganizationPlanNetworkDraft as ConstructionOrganizationPlanNetworkDraft
  const applyInput: ApplyConstructionOrganizationPlanNetworkApprovedDraftInput = {
    draft,
    companyId: normalizeText(input.companyId) || null,
    projectId: normalizeText(input.projectId) || null,
    queryExec: input.queryExec as ApplyConstructionOrganizationPlanNetworkApprovedDraftInput['queryExec'],
    executedByUserId: normalizeText(input.requestedByUserId) || null,
    executedAt: normalizeText(input.executedAt) || null,
  }
  const writer = input.dependencies?.applyConstructionOrganizationPlanNetworkApprovedDraft
  if (writer) return writer(applyInput)
  return applyConstructionOrganizationPlanNetworkApprovedDraft(applyInput)
}

async function delegateAlgorithmSeedOverrideRuntimeApply(
  input: AlgorithmAssetGovernanceWorkbenchOperationInput,
) {
  const publicationInput = {
    sourcePublicationKey: normalizeText(input.sourcePublicationKey),
    companyId: normalizeText(input.companyId) || null,
    projectId: normalizeText(input.projectId) || null,
    publishedBy: normalizeText(input.requestedByUserId) || null,
    evidenceToken: normalizeText(input.evidenceToken) || null,
    releaseRecordTarget: normalizeText(input.releaseRecordTarget) || null,
    rollbackTarget: normalizeText(input.rollbackTarget) || null,
    consumerVerificationRefs: normalizeRefs(input.consumerVerificationRefs),
    impactMonitoringRefs: normalizeRefs(input.impactMonitoringRefs),
    rollbackWriterRefs: normalizeRefs(input.rollbackWriterRefs),
    queryExec: input.queryExec,
    executedAt: input.executedAt,
  }
  const writer = input.dependencies?.publishAlgorithmSeedOverride
  if (writer) return writer(publicationInput)
  if (!input.queryExec) throw new Error('algorithm_seed_override_writer_query_exec_required')

  return publishApprovedAlgorithmSeedOverride({
    ...publicationInput,
    queryExec: input.queryExec,
  })
}

async function delegateConstructionOrganizationPlanNetworkRuntimeEvidence(
  input: AlgorithmAssetGovernanceWorkbenchOperationInput,
  eventType: 'impact_monitoring' | 'rollback_execution',
) {
  const evidenceInput: RecordConstructionOrganizationPlanNetworkRuntimeEventInput = {
    queryExec: input.queryExec as RecordConstructionOrganizationPlanNetworkRuntimeEventInput['queryExec'],
    projectId: normalizeText(input.projectId),
    eventType,
    eventStatus: eventType === 'impact_monitoring' ? 'monitoring_passed' : 'rollback_executed',
    publicationKey: normalizeText(input.sourcePublicationKey),
    eventPayload: {
      evidenceToken: normalizeText(input.evidenceToken),
      ...productOutcomeLineageMetadata(input),
      businessType: normalizeText(input.businessType) || null,
      projectId: normalizeText(input.projectId) || null,
      optionId: normalizeText(input.optionId) || normalizeText(input.releaseRecordTarget) || null,
      draftNetworkKey: normalizeText(input.draftNetworkKey) || normalizeText(input.rollbackTarget) || null,
      requestedByUserId: normalizeText(input.requestedByUserId) || null,
      consumerVerificationRefs: normalizeRefs(input.consumerVerificationRefs),
      impactMonitoringRefs: normalizeRefs(input.impactMonitoringRefs),
      rollbackWriterRefs: normalizeRefs(input.rollbackWriterRefs),
      rollbackTarget: normalizeText(input.rollbackTarget) || null,
      rollbackReason: normalizeText(input.rollbackReason) || null,
    },
    executedAt: normalizeText(input.executedAt) || null,
  }
  const writer = input.dependencies?.recordConstructionOrganizationPlanNetworkRuntimeEvent
  if (writer) return writer(evidenceInput)
  return recordConstructionOrganizationPlanNetworkRuntimeEvent(evidenceInput)
}

async function delegateConstructionOrganizationPlanNetworkRuntimeConsumerObservation(
  input: AlgorithmAssetGovernanceWorkbenchOperationInput,
) {
  const publicationKey = normalizeText(input.sourcePublicationKey)
  const evidenceToken = normalizeText(input.evidenceToken)
  const releaseRecordTarget = normalizeText(input.releaseRecordTarget)
  const sourceEvidenceRefs = Array.from(new Set([
    ...normalizeRefs(input.consumerVerificationRefs),
    ...(releaseRecordTarget ? [releaseRecordTarget] : []),
    ...(evidenceToken ? [evidenceToken] : []),
  ]))
  const lineage = {
    evidenceToken,
    ...productOutcomeLineageMetadata(input),
    projectId: normalizeText(input.projectId) || null,
    companyId: normalizeText(input.companyId) || null,
    businessType: normalizeText(input.businessType) || null,
    requestedByUserId: normalizeText(input.requestedByUserId) || null,
    sourcePublicationKey: publicationKey,
    releaseRecordTarget: releaseRecordTarget || null,
    optionId: normalizeText(input.optionId) || null,
    draftNetworkKey: normalizeText(input.draftNetworkKey) || null,
  }
  const observationInput: RecordDurationRuntimeConsumerFacadeArtifactsInput = {
    queryExec: input.queryExec as RecordDurationRuntimeConsumerFacadeArtifactsInput['queryExec'],
    runtimeEntryRef: 'scheduleAccelerationRuntimeService:recordScheduleAccelerationRecommendationAdoption',
    calledAt: normalizeText(input.executedAt) || undefined,
    observedAt: normalizeText(input.executedAt) || undefined,
    callContext: {
      runtimeConsumer: 'scheduleAccelerationRuntimeService',
      consumerTrigger: 'governance_workbench_controlled_runtime_consumer_observation',
      ...lineage,
    },
    sourceEvidenceRefs,
    artifacts: [{
      assetKey: 'construction_organization_plan_network',
      publicationKey,
      publicationStatus: 'runtime_published',
      observationContext: {
        runtimeConsumer: 'scheduleAccelerationRuntimeService',
        consumerTrigger: 'governance_workbench_controlled_runtime_consumer_observation',
        ...lineage,
      },
      sourceEvidenceRefs,
    }],
  }
  const writer = input.dependencies?.recordConstructionOrganizationPlanNetworkRuntimeConsumerObservation
  if (writer) return writer(observationInput)
  return recordScheduleAccelerationRuntimeConsumedArtifacts(observationInput)
}

async function delegateConstructionOrganizationPlanNetworkSavedOutcome(
  input: AlgorithmAssetGovernanceWorkbenchOperationInput,
) {
  const outcomeInput: RecordConstructionOrganizationPlanNetworkSavedOutcomeInput = {
    queryExec: input.queryExec as RecordConstructionOrganizationPlanNetworkSavedOutcomeInput['queryExec'],
    publicationKey: normalizeText(input.sourcePublicationKey),
    outcomeStatus: 'accepted',
    outcomeRef: normalizeText(input.releaseRecordTarget),
    companyId: normalizeText(input.companyId) || null,
    projectId: normalizeText(input.projectId) || null,
    observedAt: normalizeText(input.executedAt) || null,
    metadata: {
      evidenceToken: normalizeText(input.evidenceToken),
      ...productOutcomeLineageMetadata(input),
      businessType: normalizeText(input.businessType) || null,
      projectId: normalizeText(input.projectId) || null,
      optionId: normalizeText(input.optionId) || normalizeText(input.releaseRecordTarget) || null,
      draftNetworkKey: normalizeText(input.draftNetworkKey) || normalizeText(input.rollbackTarget) || null,
      requestedByUserId: normalizeText(input.requestedByUserId) || null,
      consumerVerificationRefs: normalizeRefs(input.consumerVerificationRefs),
      impactMonitoringRefs: normalizeRefs(input.impactMonitoringRefs),
      rollbackWriterRefs: normalizeRefs(input.rollbackWriterRefs),
      rollbackTarget: normalizeText(input.rollbackTarget) || null,
      rollbackReason: normalizeText(input.rollbackReason) || null,
    },
  }
  const writer = input.dependencies?.recordConstructionOrganizationPlanNetworkSavedOutcome
  if (writer) return writer(outcomeInput)
  return recordConstructionOrganizationPlanNetworkSavedOutcome(outcomeInput)
}

async function delegateConstructionOrganizationPlanNetworkRuntimeEngineEvidence(
  input: AlgorithmAssetGovernanceWorkbenchOperationInput,
) {
  const evidenceInput: RecordConstructionOrganizationPlanNetworkRuntimeEngineEvidenceInput = {
    queryExec: input.queryExec as RecordConstructionOrganizationPlanNetworkRuntimeEngineEvidenceInput['queryExec'],
    publicationKey: normalizeText(input.sourcePublicationKey),
    engineCode: normalizeText(input.engineCode),
    projectId: normalizeText(input.projectId) || null,
    dedupeKey: normalizeText(input.evidenceToken)
      ? `${normalizeText(input.sourcePublicationKey)}:${normalizeText(input.engineCode)}:${normalizeText(input.evidenceToken)}`
      : null,
    predictedDurationDays: readPositiveDays(input.predictedDurationDays),
    actualDurationDays: readPositiveDays(input.actualDurationDays),
    observedAt: normalizeText(input.executedAt) || null,
    metadata: {
      evidenceToken: normalizeText(input.evidenceToken),
      ...productOutcomeLineageMetadata(input),
      businessType: normalizeText(input.businessType) || null,
      projectId: normalizeText(input.projectId) || null,
      optionId: normalizeText(input.optionId) || normalizeText(input.releaseRecordTarget) || null,
      draftNetworkKey: normalizeText(input.draftNetworkKey) || normalizeText(input.rollbackTarget) || null,
      requestedByUserId: normalizeText(input.requestedByUserId) || null,
      consumerVerificationRefs: normalizeRefs(input.consumerVerificationRefs),
      impactMonitoringRefs: normalizeRefs(input.impactMonitoringRefs),
      rollbackWriterRefs: normalizeRefs(input.rollbackWriterRefs),
      releaseRecordTarget: normalizeText(input.releaseRecordTarget) || null,
      rollbackTarget: normalizeText(input.rollbackTarget) || null,
      rollbackReason: normalizeText(input.rollbackReason) || null,
    },
  }
  const writer = input.dependencies?.recordConstructionOrganizationPlanNetworkRuntimeEngineEvidence
  if (writer) return writer(evidenceInput)
  return recordConstructionOrganizationPlanNetworkRuntimeEngineEvidence(evidenceInput)
}

async function delegateConstructionOrganizationPlanNetworkRecommendationDecision(
  input: AlgorithmAssetGovernanceWorkbenchOperationInput,
) {
  const optionId = normalizeText(input.optionId) || normalizeText(input.releaseRecordTarget) || null
  const draftNetworkKey = normalizeText(input.draftNetworkKey) || normalizeText(input.rollbackTarget) || null
  const decisionInput: RecordConstructionOrganizationPlanNetworkRecommendationDecisionInput = {
    queryExec: input.queryExec as RecordConstructionOrganizationPlanNetworkRecommendationDecisionInput['queryExec'],
    projectId: normalizeText(input.projectId) || null,
    companyId: normalizeText(input.companyId) || null,
    actionType: input.action === 'runtime_recommendation_decline' ? 'declined' : 'adopted',
    optionId,
    draftNetworkKey,
    publicationKey: normalizeText(input.sourcePublicationKey) || null,
    selectedScenarioIds: Array.isArray(input.selectedScenarioIds)
      ? input.selectedScenarioIds.map((item) => normalizeText(item)).filter(Boolean)
      : null,
    decidedBy: normalizeText(input.requestedByUserId) || null,
    decidedAt: normalizeText(input.executedAt) || null,
    decisionContext: {
      evidenceToken: normalizeText(input.evidenceToken),
      ...productOutcomeLineageMetadata(input),
      businessType: normalizeText(input.businessType) || null,
      requestedByUserId: normalizeText(input.requestedByUserId) || null,
      sourcePublicationKey: normalizeText(input.sourcePublicationKey) || null,
      optionId,
      draftNetworkKey,
      releaseRecordTarget: normalizeText(input.releaseRecordTarget) || null,
      rollbackTarget: normalizeText(input.rollbackTarget) || null,
      rollbackReason: normalizeText(input.rollbackReason) || null,
      consumerVerificationRefs: normalizeRefs(input.consumerVerificationRefs),
      impactMonitoringRefs: normalizeRefs(input.impactMonitoringRefs),
      rollbackWriterRefs: normalizeRefs(input.rollbackWriterRefs),
      writesRuntimeDirectly: false,
      writesTaskDependencies: false,
      writesPlanDates: false,
      writesSeed: false,
      writesBaseline: false,
      writesCriticalPathFacts: false,
      writesAccelerationDraft: false,
    },
  }
  const writer = input.dependencies?.recordConstructionOrganizationPlanNetworkRecommendationDecision
  if (writer) return writer(decisionInput)
  return recordConstructionOrganizationPlanNetworkRecommendationDecision(decisionInput)
}

export async function executeAlgorithmAssetGovernanceWorkbenchOperation(
  input: AlgorithmAssetGovernanceWorkbenchOperationInput,
): Promise<AlgorithmAssetGovernanceWorkbenchOperationResult> {
  const action = normalizeAction(input.action)
  const assetType = normalizeAssetType(input.assetType)
  const domainWriterKey = normalizeText(input.domainWriterKey) || null
  const reasons = baseReasons(input, action, assetType)

  if (reasons.length > 0 || !action || !assetType) {
    return blockedResult({ action, assetType, domainWriterKey, reasons })
  }

  if (
    assetType !== 'learnable_parameter'
    && !(assetType === 'algorithm_seed' && action === 'runtime_apply')
    && !(assetType === 'construction_organization_plan_network' && (
      action === 'manual_review_handoff'
      || action === 'manual_conflict_review'
      || action === 'manual_review_approval'
      || action === 'release_exit_handoff'
      || action === 'runtime_apply'
      || action === 'runtime_impact_monitoring'
      || action === 'runtime_rollback_execution'
      || action === 'runtime_consumer_observation'
      || action === 'runtime_engine_evidence'
      || action === 'runtime_saved_outcome'
      || action === 'runtime_recommendation_adopt'
      || action === 'runtime_recommendation_decline'
    ))
    && action !== 'runtime_rollback'
  ) {
    return blockedResult({
      action,
      assetType,
      domainWriterKey,
      reasons: ['domain_operation_not_registered_for_asset_type'],
    })
  }

  if (
    assetType !== 'learnable_parameter'
    && assetType !== 'algorithm_seed'
    && assetType !== 'forecast_residual_overlay'
    && assetType !== 'cold_start_baseline'
    && assetType !== 'template_seed'
    && assetType !== 'dependency_rule'
    && assetType !== 'construction_organization_plan_network'
  ) {
    return blockedResult({
      action,
      assetType,
      domainWriterKey,
      reasons: ['domain_operation_not_registered_for_asset_type'],
    })
  }

  if (action === 'release_exit_handoff') {
    if (assetType === 'construction_organization_plan_network') {
      const handoffReasons = constructionOrganizationPlanNetworkReleaseExitHandoffReasons(input)
      if (handoffReasons.length > 0) {
        return blockedResult({ action, assetType, domainWriterKey, reasons: handoffReasons })
      }

      const domainResult = await delegateConstructionOrganizationPlanNetworkReleaseExitHandoff(input)
      return delegatedResult({
        action,
        assetType,
        domainWriterKey: CONSTRUCTION_ORGANIZATION_PLAN_NETWORK_RELEASE_EXIT_HANDOFF_WRITER,
        domainResult,
      })
    }

    if (assetType !== 'learnable_parameter') {
      return blockedResult({
        action,
        assetType,
        domainWriterKey,
        reasons: ['domain_operation_not_registered_for_asset_type'],
      })
    }

    const handoffReasons = releaseHandoffReasons(input)
    if (handoffReasons.length > 0) {
      return blockedResult({ action, assetType, domainWriterKey, reasons: handoffReasons })
    }

    const domainResult = await delegateLearnableParameterRelease(input)
    return delegatedResult({ action, assetType, domainWriterKey: LEARNABLE_PARAMETER_WRITER, domainResult })
  }

  if (action === 'manual_review_handoff') {
    if (assetType !== 'construction_organization_plan_network') {
      return blockedResult({
        action,
        assetType,
        domainWriterKey,
        reasons: ['domain_operation_not_registered_for_asset_type'],
      })
    }

    const handoffReasons = constructionOrganizationPlanNetworkManualReviewReasons(input)
    if (handoffReasons.length > 0) {
      return blockedResult({ action, assetType, domainWriterKey, reasons: handoffReasons })
    }

    const domainResult = await delegateConstructionOrganizationPlanNetworkManualReview(input)
    return delegatedResult({
      action,
      assetType,
      domainWriterKey: CONSTRUCTION_ORGANIZATION_PLAN_NETWORK_MANUAL_REVIEW_WRITER,
      domainResult,
    })
  }

  if (action === 'manual_conflict_review') {
    if (assetType !== 'construction_organization_plan_network') {
      return blockedResult({
        action,
        assetType,
        domainWriterKey,
        reasons: ['domain_operation_not_registered_for_asset_type'],
      })
    }

    const conflictReviewReasons = constructionOrganizationPlanNetworkManualConflictReviewReasons(input)
    if (conflictReviewReasons.length > 0) {
      return blockedResult({ action, assetType, domainWriterKey, reasons: conflictReviewReasons })
    }

    const domainResult = await delegateConstructionOrganizationPlanNetworkManualConflictReview(input)
    return delegatedResult({
      action,
      assetType,
      domainWriterKey: CONSTRUCTION_ORGANIZATION_PLAN_NETWORK_MANUAL_CONFLICT_REVIEW_WRITER,
      domainResult,
    })
  }

  if (action === 'manual_review_approval') {
    if (assetType !== 'construction_organization_plan_network') {
      return blockedResult({
        action,
        assetType,
        domainWriterKey,
        reasons: ['domain_operation_not_registered_for_asset_type'],
      })
    }

    const approvalReasons = constructionOrganizationPlanNetworkManualApprovalReasons(input)
    if (approvalReasons.length > 0) {
      return blockedResult({ action, assetType, domainWriterKey, reasons: approvalReasons })
    }

    const domainResult = await delegateConstructionOrganizationPlanNetworkManualApproval(input)
    return delegatedResult({
      action,
      assetType,
      domainWriterKey: CONSTRUCTION_ORGANIZATION_PLAN_NETWORK_MANUAL_APPROVAL_WRITER,
      domainResult,
    })
  }

  if (action === 'runtime_apply') {
    if (assetType === 'algorithm_seed') {
      const applyReasons = algorithmSeedOverrideRuntimeApplyReasons(input)
      if (applyReasons.length > 0) {
        return blockedResult({ action, assetType, domainWriterKey, reasons: applyReasons })
      }

      const domainResult = await delegateAlgorithmSeedOverrideRuntimeApply(input)
      return delegatedResult({
        action,
        assetType,
        domainWriterKey: ALGORITHM_SEED_OVERRIDE_RUNTIME_WRITER,
        domainResult,
      })
    }

    if (assetType !== 'construction_organization_plan_network') {
      return blockedResult({
        action,
        assetType,
        domainWriterKey,
        reasons: ['domain_operation_not_registered_for_asset_type'],
      })
    }

    const applyReasons = constructionOrganizationPlanNetworkRuntimeApplyReasons(input)
    if (applyReasons.length > 0) {
      return blockedResult({ action, assetType, domainWriterKey, reasons: applyReasons })
    }

    const domainResult = await delegateConstructionOrganizationPlanNetworkRuntimeApply(input)
    return delegatedResult({
      action,
      assetType,
      domainWriterKey: CONSTRUCTION_ORGANIZATION_PLAN_NETWORK_RUNTIME_APPLY_WRITER,
      domainResult,
    })
  }

  if (action === 'runtime_impact_monitoring') {
    if (assetType !== 'construction_organization_plan_network') {
      return blockedResult({
        action,
        assetType,
        domainWriterKey,
        reasons: ['domain_operation_not_registered_for_asset_type'],
      })
    }

    const evidenceReasons = constructionOrganizationPlanNetworkRuntimeEvidenceReasons(input, 'impact_monitoring')
    if (evidenceReasons.length > 0) {
      return blockedResult({ action, assetType, domainWriterKey, reasons: evidenceReasons })
    }

    const domainResult = await delegateConstructionOrganizationPlanNetworkRuntimeEvidence(input, 'impact_monitoring')
    return delegatedResult({
      action,
      assetType,
      domainWriterKey: CONSTRUCTION_ORGANIZATION_PLAN_NETWORK_RUNTIME_EVIDENCE_WRITER,
      domainResult,
    })
  }

  if (action === 'runtime_rollback_execution') {
    if (assetType !== 'construction_organization_plan_network') {
      return blockedResult({
        action,
        assetType,
        domainWriterKey,
        reasons: ['domain_operation_not_registered_for_asset_type'],
      })
    }

    const evidenceReasons = constructionOrganizationPlanNetworkRuntimeEvidenceReasons(input, 'rollback_execution')
    if (evidenceReasons.length > 0) {
      return blockedResult({ action, assetType, domainWriterKey, reasons: evidenceReasons })
    }

    const domainResult = await delegateConstructionOrganizationPlanNetworkRuntimeEvidence(input, 'rollback_execution')
    return delegatedResult({
      action,
      assetType,
      domainWriterKey: CONSTRUCTION_ORGANIZATION_PLAN_NETWORK_RUNTIME_EVIDENCE_WRITER,
      domainResult,
    })
  }

  if (action === 'runtime_saved_outcome') {
    if (assetType !== 'construction_organization_plan_network') {
      return blockedResult({
        action,
        assetType,
        domainWriterKey,
        reasons: ['domain_operation_not_registered_for_asset_type'],
      })
    }

    const outcomeReasons = constructionOrganizationPlanNetworkSavedOutcomeReasons(input)
    if (outcomeReasons.length > 0) {
      return blockedResult({ action, assetType, domainWriterKey, reasons: outcomeReasons })
    }

    const domainResult = await delegateConstructionOrganizationPlanNetworkSavedOutcome(input)
    return delegatedResult({
      action,
      assetType,
      domainWriterKey: CONSTRUCTION_ORGANIZATION_PLAN_NETWORK_SAVED_OUTCOME_WRITER,
      domainResult,
    })
  }

  if (action === 'runtime_consumer_observation') {
    if (assetType !== 'construction_organization_plan_network') {
      return blockedResult({
        action,
        assetType,
        domainWriterKey,
        reasons: ['domain_operation_not_registered_for_asset_type'],
      })
    }

    const observationReasons = constructionOrganizationPlanNetworkRuntimeConsumerObservationReasons(input)
    if (observationReasons.length > 0) {
      return blockedResult({ action, assetType, domainWriterKey, reasons: observationReasons })
    }

    const domainResult = await delegateConstructionOrganizationPlanNetworkRuntimeConsumerObservation(input)
    return delegatedResult({
      action,
      assetType,
      domainWriterKey: CONSTRUCTION_ORGANIZATION_PLAN_NETWORK_RUNTIME_CONSUMER_OBSERVATION_WRITER,
      domainResult,
    })
  }

  if (action === 'runtime_engine_evidence') {
    if (assetType !== 'construction_organization_plan_network') {
      return blockedResult({
        action,
        assetType,
        domainWriterKey,
        reasons: ['domain_operation_not_registered_for_asset_type'],
      })
    }

    const evidenceReasons = constructionOrganizationPlanNetworkRuntimeEngineEvidenceReasons(input)
    if (evidenceReasons.length > 0) {
      return blockedResult({ action, assetType, domainWriterKey, reasons: evidenceReasons })
    }

    const domainResult = await delegateConstructionOrganizationPlanNetworkRuntimeEngineEvidence(input)
    return delegatedResult({
      action,
      assetType,
      domainWriterKey: CONSTRUCTION_ORGANIZATION_PLAN_NETWORK_RUNTIME_ENGINE_EVIDENCE_WRITER,
      domainResult,
    })
  }

  if (action === 'runtime_recommendation_adopt' || action === 'runtime_recommendation_decline') {
    if (assetType !== 'construction_organization_plan_network') {
      return blockedResult({
        action,
        assetType,
        domainWriterKey,
        reasons: ['domain_operation_not_registered_for_asset_type'],
      })
    }

    const decisionReasons = constructionOrganizationPlanNetworkRecommendationDecisionReasons(input)
    if (decisionReasons.length > 0) {
      return blockedResult({ action, assetType, domainWriterKey, reasons: decisionReasons })
    }

    const domainResult = await delegateConstructionOrganizationPlanNetworkRecommendationDecision(input)
    return delegatedResult({
      action,
      assetType,
      domainWriterKey: CONSTRUCTION_ORGANIZATION_PLAN_NETWORK_RECOMMENDATION_DECISION_WRITER,
      domainResult,
    })
  }

  if (assetType === 'forecast_residual_overlay') {
    const overlayReasons = forecastResidualOverlayRollbackReasons(input)
    if (overlayReasons.length > 0) {
      return blockedResult({ action, assetType, domainWriterKey, reasons: overlayReasons })
    }

    const domainResult = await delegateForecastResidualOverlayRollback(input)
    return delegatedResult({
      action,
      assetType,
      domainWriterKey: FORECAST_RESIDUAL_OVERLAY_ROLLBACK_WRITER,
      domainResult,
    })
  }

  if (assetType === 'cold_start_baseline') {
    const baselineReasons = coldStartBaselineRollbackReasons(input)
    if (baselineReasons.length > 0) {
      return blockedResult({ action, assetType, domainWriterKey, reasons: baselineReasons })
    }

    const domainResult = await delegateColdStartBaselineRollback(input)
    return delegatedResult({
      action,
      assetType,
      domainWriterKey: COLD_START_BASELINE_ROLLBACK_WRITER,
      domainResult,
    })
  }

  if (assetType === 'template_seed') {
    const wbsReasons = wbsTemplateRuntimeRollbackReasons(input)
    if (wbsReasons.length > 0) {
      return blockedResult({ action, assetType, domainWriterKey, reasons: wbsReasons })
    }

    const domainResult = await delegateWbsTemplateRuntimeRollback(input)
    return delegatedResult({
      action,
      assetType,
      domainWriterKey: WBS_TEMPLATE_RUNTIME_ROLLBACK_WRITER,
      domainResult,
    })
  }

  if (assetType === 'dependency_rule') {
    const dependencyRuleReasons = constructionDependencyRuleRuntimeRollbackReasons(input)
    if (dependencyRuleReasons.length > 0) {
      return blockedResult({ action, assetType, domainWriterKey, reasons: dependencyRuleReasons })
    }

    const domainResult = await delegateConstructionDependencyRuleRuntimeRollback(input)
    return delegatedResult({
      action,
      assetType,
      domainWriterKey: CONSTRUCTION_DEPENDENCY_RULE_RUNTIME_ROLLBACK_WRITER,
      domainResult,
    })
  }

  const handoffReasons = rollbackReasons(input)
  if (handoffReasons.length > 0) {
    return blockedResult({ action, assetType, domainWriterKey, reasons: handoffReasons })
  }

  const domainResult = await delegateLearnableParameterRollback(input)
  return delegatedResult({ action, assetType, domainWriterKey: LEARNABLE_PARAMETER_WRITER, domainResult })
}
