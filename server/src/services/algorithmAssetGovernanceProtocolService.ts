import type {
  AlgorithmAssetAnchorUpgradeStrategyEvaluation,
} from './algorithmAssetAnchorUpgradeStrategyService.js'

export type AlgorithmAssetPublishAnchor =
  | 'candidate_only'
  | 'manual_governance_required'
  | 'trusted_source_auto_publish'
  | 'guarded_runtime_auto_publish'
  | 'system_curated_publish'

export type AlgorithmAssetAutomationMaturity =
  | 'manual_required'
  | 'auto_review_package'
  | 'auto_shadow'
  | 'auto_canary'
  | 'auto_publish'

export type AlgorithmAssetLearningMaturity =
  | 'frozen_constant'
  | 'shadow_report_only'
  | 'governed_candidate'
  | 'guarded_live_tuning'
  | 'system_curated_learning'

export type AlgorithmAssetLearningTarget =
  | 'base_duration'
  | 'forecast_residual'
  | 'context_factor'
  | 'confidence'
  | 'candidate_weight'
  | 'template_structure'
  | 'dependency_order'
  | 'metric_caliber'
  | 'risk_warning'
  | 'governance_report'

export type AlgorithmAssetRequestedRuntimeEffect =
  | 'explain_only'
  | 'candidate_only'
  | 'confidence_only'
  | 'bounded_calibration'
  | 'direct_effect_request'

export type AlgorithmAssetGeneratedBy = 'system' | 'service' | 'user' | 'llm'

export type AlgorithmAssetGovernanceEvidence = {
  replayPassed?: boolean
  conflictFree?: boolean
  rollbackTarget?: string | null
  sourceHealthPassed?: boolean
  crossCompanyReplayPassed?: boolean
  anchorUpgradeStrategy?: string | null
  anchorUpgradeEvaluation?: AlgorithmAssetAnchorUpgradeStrategyEvaluation | null
  singleCandidateOnly?: boolean
}

export type AlgorithmAssetGovernanceRequest = {
  assetKey: string
  sourceSystem: string
  publishAnchor?: AlgorithmAssetPublishAnchor | string | null
  automationMaturity?: AlgorithmAssetAutomationMaturity | string | null
  learningMaturity?: AlgorithmAssetLearningMaturity | string | null
  learningTarget?: AlgorithmAssetLearningTarget | string | null
  requestedRuntimeEffect?: AlgorithmAssetRequestedRuntimeEffect
  generatedBy?: AlgorithmAssetGeneratedBy
  requestAnchorUpgrade?: boolean
  candidatePayload?: unknown
  evidence?: AlgorithmAssetGovernanceEvidence
}

export type NormalizedAlgorithmAssetGovernanceRequest = Omit<
  AlgorithmAssetGovernanceRequest,
  'publishAnchor' | 'automationMaturity' | 'learningMaturity' | 'learningTarget'
> & {
  publishAnchor: AlgorithmAssetPublishAnchor
  automationMaturity: AlgorithmAssetAutomationMaturity
  learningMaturity: AlgorithmAssetLearningMaturity
  learningTarget: AlgorithmAssetLearningTarget
  normalizationReasons: string[]
}

export type AlgorithmAssetGovernanceDecisionStatus =
  | 'publish_allowed'
  | 'canary_allowed'
  | 'manual_governance_required'
  | 'review_required'
  | 'quarantine_required'

export type AlgorithmAssetRuntimeAction =
  | 'write_published_version'
  | 'write_canary_version'
  | 'shadow_compare_only'
  | 'review_package_only'
  | 'candidate_only'
  | 'quarantine'

export type AlgorithmAssetGovernanceDecision = {
  status: AlgorithmAssetGovernanceDecisionStatus
  runtimeAction: AlgorithmAssetRuntimeAction
  canWriteRuntime: boolean
  canModifyPublishAnchor: boolean
  reasons: string[]
  unlockCriteria: string[]
  normalizedRequest: NormalizedAlgorithmAssetGovernanceRequest
}

const MANUAL_ANCHOR_ALIASES = new Set([
  'manual_governance_required',
  'manual_review_required_before_publish',
  'manual_runtime_promotion_required',
  'no_unattended_runtime_auto_publish',
  'manual_review_only',
])

const CANDIDATE_ONLY_ANCHOR_ALIASES = new Set([
  'candidate_only',
  'candidate_only_until_manual_review',
  'candidate_only_until_manual_governance',
  'candidate_only_until_manual_promotion',
  'confidence_only',
  'recognition_only',
  'planned_candidate',
])

const PUBLISH_ANCHORS = new Set<AlgorithmAssetPublishAnchor>([
  'candidate_only',
  'manual_governance_required',
  'trusted_source_auto_publish',
  'guarded_runtime_auto_publish',
  'system_curated_publish',
])

const AUTOMATION_MATURITIES = new Set<AlgorithmAssetAutomationMaturity>([
  'manual_required',
  'auto_review_package',
  'auto_shadow',
  'auto_canary',
  'auto_publish',
])

const LEARNING_MATURITIES = new Set<AlgorithmAssetLearningMaturity>([
  'frozen_constant',
  'shadow_report_only',
  'governed_candidate',
  'guarded_live_tuning',
  'system_curated_learning',
])

const LEARNING_TARGETS = new Set<AlgorithmAssetLearningTarget>([
  'base_duration',
  'forecast_residual',
  'context_factor',
  'confidence',
  'candidate_weight',
  'template_structure',
  'dependency_order',
  'metric_caliber',
  'risk_warning',
  'governance_report',
])

const LEGACY_SCOPE_OBJECT_FIELDS = new Set([
  'zone_object_id',
  'professional_object_id',
  'scope_dimensions',
  'project_scope_dimensions',
  'legacy_object_type',
])

const LEGACY_LOCAL_PUBLICATION_STATUS_FIELDS = new Set([
  'status',
  'state',
  'local_status',
  'lifecycle_status',
  'publication_status',
  'publish_status',
  'profile_status',
  'seed_status',
  'template_status',
  'governance_status',
  'runtime_status',
])

const LEGACY_LOCAL_PUBLICATION_STATUS_VALUES = new Set([
  'active',
  'default',
  'published',
  'auto_published',
  'published_profile',
  'system_published',
  'runtime_published',
])

const LEGACY_LOCAL_PUBLICATION_BOOLEAN_FIELDS = new Set([
  'active',
  'active_profile',
  'active_rule',
  'active_seed',
  'active_template',
  'default',
  'default_profile',
  'default_rule',
  'default_seed',
  'default_template',
  'is_active',
  'is_default',
  'is_published',
  'published',
  'published_profile',
  'auto_published',
  'system_published',
  'runtime_published',
])

function normalizePublishAnchor(
  raw: AlgorithmAssetGovernanceRequest['publishAnchor'],
  reasons: string[],
): AlgorithmAssetPublishAnchor {
  if (!raw) {
    reasons.push('missing_publish_anchor_defaults_to_candidate_only')
    return 'candidate_only'
  }
  if (PUBLISH_ANCHORS.has(raw as AlgorithmAssetPublishAnchor)) {
    return raw as AlgorithmAssetPublishAnchor
  }
  if (MANUAL_ANCHOR_ALIASES.has(raw)) {
    reasons.push(`legacy_publish_anchor_${raw}_mapped_to_manual_governance_required`)
    return 'manual_governance_required'
  }
  if (CANDIDATE_ONLY_ANCHOR_ALIASES.has(raw)) {
    reasons.push(`legacy_publish_anchor_${raw}_mapped_to_candidate_only`)
    return 'candidate_only'
  }
  reasons.push('unknown_publish_anchor_defaults_to_candidate_only')
  return 'candidate_only'
}

function normalizeAutomationMaturity(
  raw: AlgorithmAssetGovernanceRequest['automationMaturity'],
  reasons: string[],
): AlgorithmAssetAutomationMaturity {
  if (!raw) {
    reasons.push('missing_automation_maturity_defaults_to_manual_required')
    return 'manual_required'
  }
  if (AUTOMATION_MATURITIES.has(raw as AlgorithmAssetAutomationMaturity)) {
    return raw as AlgorithmAssetAutomationMaturity
  }
  reasons.push('unknown_automation_maturity_defaults_to_manual_required')
  return 'manual_required'
}

function normalizeLearningMaturity(
  raw: AlgorithmAssetGovernanceRequest['learningMaturity'],
  reasons: string[],
): AlgorithmAssetLearningMaturity {
  if (!raw) {
    reasons.push('missing_learning_maturity_defaults_to_shadow_report_only')
    return 'shadow_report_only'
  }
  if (LEARNING_MATURITIES.has(raw as AlgorithmAssetLearningMaturity)) {
    return raw as AlgorithmAssetLearningMaturity
  }
  reasons.push('unknown_learning_maturity_defaults_to_shadow_report_only')
  return 'shadow_report_only'
}

function normalizeLearningTarget(
  raw: AlgorithmAssetGovernanceRequest['learningTarget'],
  reasons: string[],
): AlgorithmAssetLearningTarget {
  if (!raw) {
    reasons.push('missing_learning_target_defaults_to_governance_report')
    return 'governance_report'
  }
  if (LEARNING_TARGETS.has(raw as AlgorithmAssetLearningTarget)) {
    return raw as AlgorithmAssetLearningTarget
  }
  reasons.push('unknown_learning_target_defaults_to_governance_report')
  return 'governance_report'
}

export function normalizeAlgorithmAssetGovernanceRequest(
  request: AlgorithmAssetGovernanceRequest | NormalizedAlgorithmAssetGovernanceRequest,
): NormalizedAlgorithmAssetGovernanceRequest {
  const reasons = [...('normalizationReasons' in request ? request.normalizationReasons : [])]
  return {
    ...request,
    publishAnchor: normalizePublishAnchor(request.publishAnchor, reasons),
    automationMaturity: normalizeAutomationMaturity(request.automationMaturity, reasons),
    learningMaturity: normalizeLearningMaturity(request.learningMaturity, reasons),
    learningTarget: normalizeLearningTarget(request.learningTarget, reasons),
    normalizationReasons: reasons,
  }
}

function baseUnlockCriteria(request: NormalizedAlgorithmAssetGovernanceRequest): string[] {
  const criteria = [
    'register_anchor_upgrade_strategy',
    'collect_cross_project_or_cross_company_replay',
    'versioned_governance_audit_required',
  ]
  if (!request.evidence?.rollbackTarget) criteria.push('rollback_target_required')
  if (!request.evidence?.conflictFree) criteria.push('conflict_clearance_required')
  return criteria
}

function hasRuntimeEvidence(request: NormalizedAlgorithmAssetGovernanceRequest) {
  return Boolean(request.evidence?.conflictFree && request.evidence.rollbackTarget)
}

function hasTrustedSourceEvidence(request: NormalizedAlgorithmAssetGovernanceRequest) {
  return Boolean(hasRuntimeEvidence(request) && request.evidence?.sourceHealthPassed)
}

function hasGuardedRuntimeEvidence(request: NormalizedAlgorithmAssetGovernanceRequest) {
  return Boolean(hasRuntimeEvidence(request) && request.evidence?.replayPassed)
}

function hasSystemCuratedEvidence(request: NormalizedAlgorithmAssetGovernanceRequest) {
  return Boolean(
    hasRuntimeEvidence(request)
    && request.evidence?.replayPassed
    && request.evidence.crossCompanyReplayPassed
    && hasReadyAnchorUpgradeEvaluation(request.evidence),
  )
}

function hasReadyAnchorUpgradeEvaluation(evidence: AlgorithmAssetGovernanceEvidence | undefined) {
  const evaluation = evidence?.anchorUpgradeEvaluation
  return Boolean(
    evaluation?.status === 'upgrade_candidate_ready'
    && evaluation.canGenerateVersionedUpgrade
    && evaluation.versionedUpgrade,
  )
}

function containsLegacyScopeObjectField(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false
  if (Array.isArray(value)) return value.some(containsLegacyScopeObjectField)
  return Object.entries(value as Record<string, unknown>).some(([key, childValue]) => (
    LEGACY_SCOPE_OBJECT_FIELDS.has(key) || containsLegacyScopeObjectField(childValue)
  ))
}

function normalizeLegacyMarker(value: unknown) {
  return String(value ?? '')
    .trim()
    .replace(/([a-z])([A-Z])/g, '$1_$2')
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
}

function isLegacyPublicationStatusKey(key: string) {
  const normalizedKey = normalizeLegacyMarker(key)
  return LEGACY_LOCAL_PUBLICATION_STATUS_FIELDS.has(normalizedKey)
    || normalizedKey.includes('auto_published')
    || normalizedKey.includes('published_profile')
}

function isLegacyPublicationBooleanKey(key: string) {
  return LEGACY_LOCAL_PUBLICATION_BOOLEAN_FIELDS.has(normalizeLegacyMarker(key))
}

function isTruthyLegacyPublicationValue(value: unknown) {
  if (value === true) return true
  if (typeof value === 'number') return value === 1
  if (typeof value !== 'string') return false
  const normalizedValue = normalizeLegacyMarker(value)
  return normalizedValue === 'true'
    || normalizedValue === 'yes'
    || normalizedValue === '1'
    || LEGACY_LOCAL_PUBLICATION_STATUS_VALUES.has(normalizedValue)
}

function containsLegacyLocalPublicationStatus(value: unknown, keyHint?: string): boolean {
  if (typeof value === 'string') {
    return Boolean(
      keyHint
      && isLegacyPublicationStatusKey(keyHint)
      && LEGACY_LOCAL_PUBLICATION_STATUS_VALUES.has(normalizeLegacyMarker(value))
    )
  }
  if (!value || typeof value !== 'object') return false
  if (Array.isArray(value)) {
    return value.some((item) => containsLegacyLocalPublicationStatus(item, keyHint))
  }
  return Object.entries(value as Record<string, unknown>).some(([key, childValue]) => {
    const normalizedKey = normalizeLegacyMarker(key)
    if (isLegacyPublicationBooleanKey(key) && isTruthyLegacyPublicationValue(childValue)) {
      return true
    }
    if (
      normalizedKey.includes('auto_published')
      || normalizedKey.includes('published_profile')
    ) {
      return true
    }
    return containsLegacyLocalPublicationStatus(childValue, key)
  })
}

export function evaluateAlgorithmAssetGovernanceRequest(
  request: AlgorithmAssetGovernanceRequest | NormalizedAlgorithmAssetGovernanceRequest,
): AlgorithmAssetGovernanceDecision {
  const normalizedRequest = normalizeAlgorithmAssetGovernanceRequest(request)
  const reasons = [...normalizedRequest.normalizationReasons]
  const unlockCriteria: string[] = []

  if (normalizedRequest.generatedBy === 'llm') {
    reasons.push('llm_generated_payload_requires_candidate_or_quarantine')
  }

  if (normalizedRequest.requestAnchorUpgrade && !normalizedRequest.evidence?.anchorUpgradeStrategy) {
    reasons.push('anchor_upgrade_strategy_required')
  }

  if (
    (normalizedRequest.publishAnchor === 'system_curated_publish'
      || normalizedRequest.requestAnchorUpgrade
      || normalizedRequest.evidence?.anchorUpgradeStrategy)
    && !hasReadyAnchorUpgradeEvaluation(normalizedRequest.evidence)
  ) {
    reasons.push('anchor_upgrade_strategy_evaluation_required')
  }

  if (containsLegacyScopeObjectField(normalizedRequest.candidatePayload)) {
    reasons.push('legacy_scope_object_field_detected')
    return {
      status: 'quarantine_required',
      runtimeAction: 'quarantine',
      canWriteRuntime: false,
      canModifyPublishAnchor: false,
      reasons,
      unlockCriteria,
      normalizedRequest,
    }
  }

  if (containsLegacyLocalPublicationStatus(normalizedRequest.candidatePayload)) {
    reasons.push(
      'legacy_local_publication_status_detected',
      'legacy_local_publication_status_requires_unified_publication_evidence',
    )
    return {
      status: 'review_required',
      runtimeAction: 'candidate_only',
      canWriteRuntime: false,
      canModifyPublishAnchor: false,
      reasons,
      unlockCriteria,
      normalizedRequest,
    }
  }

  if (
    normalizedRequest.generatedBy === 'llm'
    || normalizedRequest.publishAnchor === 'candidate_only'
    || normalizedRequest.automationMaturity === 'manual_required'
  ) {
    return {
      status: 'review_required',
      runtimeAction: 'candidate_only',
      canWriteRuntime: false,
      canModifyPublishAnchor: false,
      reasons,
      unlockCriteria,
      normalizedRequest,
    }
  }

  if (normalizedRequest.publishAnchor === 'manual_governance_required') {
    unlockCriteria.push(...baseUnlockCriteria(normalizedRequest))
    return {
      status: 'manual_governance_required',
      runtimeAction: normalizedRequest.requestAnchorUpgrade ? 'review_package_only' : 'shadow_compare_only',
      canWriteRuntime: false,
      canModifyPublishAnchor: false,
      reasons,
      unlockCriteria,
      normalizedRequest,
    }
  }

  if (normalizedRequest.automationMaturity === 'auto_review_package' || normalizedRequest.automationMaturity === 'auto_shadow') {
    return {
      status: 'review_required',
      runtimeAction: 'shadow_compare_only',
      canWriteRuntime: false,
      canModifyPublishAnchor: false,
      reasons,
      unlockCriteria,
      normalizedRequest,
    }
  }

  if (
    normalizedRequest.publishAnchor === 'trusted_source_auto_publish'
    && normalizedRequest.automationMaturity === 'auto_publish'
    && hasTrustedSourceEvidence(normalizedRequest)
  ) {
    return {
      status: 'publish_allowed',
      runtimeAction: 'write_published_version',
      canWriteRuntime: true,
      canModifyPublishAnchor: false,
      reasons,
      unlockCriteria,
      normalizedRequest,
    }
  }

  if (
    normalizedRequest.publishAnchor === 'guarded_runtime_auto_publish'
    && normalizedRequest.automationMaturity === 'auto_canary'
    && hasGuardedRuntimeEvidence(normalizedRequest)
  ) {
    return {
      status: 'canary_allowed',
      runtimeAction: 'write_canary_version',
      canWriteRuntime: true,
      canModifyPublishAnchor: false,
      reasons,
      unlockCriteria,
      normalizedRequest,
    }
  }

  if (
    normalizedRequest.publishAnchor === 'guarded_runtime_auto_publish'
    && normalizedRequest.automationMaturity === 'auto_publish'
    && hasGuardedRuntimeEvidence(normalizedRequest)
  ) {
    return {
      status: 'publish_allowed',
      runtimeAction: 'write_published_version',
      canWriteRuntime: true,
      canModifyPublishAnchor: false,
      reasons,
      unlockCriteria,
      normalizedRequest,
    }
  }

  if (
    normalizedRequest.publishAnchor === 'system_curated_publish'
    && normalizedRequest.automationMaturity === 'auto_publish'
    && hasSystemCuratedEvidence(normalizedRequest)
  ) {
    return {
      status: 'publish_allowed',
      runtimeAction: 'write_published_version',
      canWriteRuntime: true,
      canModifyPublishAnchor: false,
      reasons,
      unlockCriteria,
      normalizedRequest,
    }
  }

  reasons.push('publish_gate_evidence_incomplete')
  unlockCriteria.push(...baseUnlockCriteria(normalizedRequest))
  return {
    status: 'review_required',
    runtimeAction: 'review_package_only',
    canWriteRuntime: false,
    canModifyPublishAnchor: false,
    reasons,
    unlockCriteria,
    normalizedRequest,
  }
}
