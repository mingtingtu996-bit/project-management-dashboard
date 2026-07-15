import type {
  AlgorithmAssetCandidateEvent,
  AlgorithmAssetCandidateScopeType,
} from './algorithmAssetCandidateEventAdapterService.js'

export type AlgorithmAssetExistingRule = {
  assetKey: string
  stableCode: string
  semanticCode?: string | null
  targetSurface?: string | null
  lifecycleStatus: 'active' | 'published' | 'candidate' | 'quarantined' | 'retired'
  runtimePublicationStatus?: string | null
  scopeType: AlgorithmAssetCandidateScopeType | 'system'
  companyId?: string | null
  projectId?: string | null
  publishAnchor?: string | null
  releaseRecordId?: string | null
  runtimeWriterKey?: string | null
  consumerVerificationRef?: string | null
  impactMonitoringRef?: string | null
  rollbackTarget?: string | null
}

export type AlgorithmAssetConflictResult =
  | 'no_conflict_publish_allowed'
  | 'shadow_compare_only'
  | 'manual_governance_required'
  | 'automation_unlock_candidate'
  | 'quarantine_required'
  | 'supersede_with_rollback_target'

export type AlgorithmAssetConflictRuntimeRule =
  | 'candidate_may_replace_same_scope_published_version'
  | 'candidate_blocked_from_runtime'
  | 'existing_active_or_published_rule_continues'
  | 'candidate_may_publish_without_existing_conflict'

export type AlgorithmAssetConflictArbitration = {
  result: AlgorithmAssetConflictResult
  runtimeRule: AlgorithmAssetConflictRuntimeRule
  activeRuleContinues: boolean
  reasons: string[]
  candidate: AlgorithmAssetCandidateEvent
  conflictingRules: AlgorithmAssetExistingRule[]
}

export type AlgorithmAssetConflictInput = {
  candidate: AlgorithmAssetCandidateEvent
  existingRules?: AlgorithmAssetExistingRule[]
}

const MANUAL_ANCHORS = new Set([
  'manual_governance_required',
  'manual_review_required_before_publish',
  'manual_runtime_promotion_required',
  'no_unattended_runtime_auto_publish',
  'manual_review_only',
])

function sameNullableId(a: string | null | undefined, b: string | null | undefined) {
  return String(a ?? '') === String(b ?? '')
}

function isSameScope(candidate: AlgorithmAssetCandidateEvent, rule: AlgorithmAssetExistingRule) {
  if (candidate.scopeType === 'project') {
    return rule.scopeType === 'project'
      && sameNullableId(candidate.projectId, rule.projectId)
      && sameNullableId(candidate.companyId, rule.companyId)
  }
  if (candidate.scopeType === 'company') {
    return rule.scopeType === 'company'
      && sameNullableId(candidate.companyId, rule.companyId)
  }
  return rule.scopeType === 'system_observation' || rule.scopeType === 'system'
}

function isProjectEscalation(candidate: AlgorithmAssetCandidateEvent, rule: AlgorithmAssetExistingRule) {
  return candidate.scopeType === 'project' && (rule.scopeType === 'company' || rule.scopeType === 'system')
}

function isPublished(rule: AlgorithmAssetExistingRule) {
  return rule.lifecycleStatus === 'active' || rule.lifecycleStatus === 'published'
}

function hasUnifiedPublicationEvidence(rule: AlgorithmAssetExistingRule) {
  const publicationStatus = normalizeConflictToken(rule.runtimePublicationStatus)
  const isRolledBack = publicationStatus === 'runtime_rolled_back' || publicationStatus === 'rolled_back'
  return Boolean(
    isPublished(rule)
    && publicationStatus
    && !isRolledBack
    && normalizeConflictToken(rule.releaseRecordId)
    && normalizeConflictToken(rule.runtimeWriterKey)
    && normalizeConflictToken(rule.consumerVerificationRef)
    && normalizeConflictToken(rule.impactMonitoringRef)
    && normalizeConflictToken(rule.rollbackTarget)
  )
}

function normalizeConflictToken(value: unknown) {
  const token = String(value ?? '').trim()
  return token || null
}

function candidatePayloadRecord(candidate: AlgorithmAssetCandidateEvent) {
  return candidate.candidatePayload && typeof candidate.candidatePayload === 'object' && !Array.isArray(candidate.candidatePayload)
    ? candidate.candidatePayload as Record<string, unknown>
    : {}
}

function candidateSemanticCodes(candidate: AlgorithmAssetCandidateEvent) {
  const payload = candidatePayloadRecord(candidate)
  return new Set([
    normalizeConflictToken(candidate.assetKey),
    normalizeConflictToken(payload.stableCode),
    normalizeConflictToken(payload.semanticCode),
  ].filter((token): token is string => Boolean(token)))
}

function ruleSemanticCodes(rule: AlgorithmAssetExistingRule) {
  return new Set([
    normalizeConflictToken(rule.assetKey),
    normalizeConflictToken(rule.stableCode),
    normalizeConflictToken(rule.semanticCode),
  ].filter((token): token is string => Boolean(token)))
}

function candidateTargetSurface(candidate: AlgorithmAssetCandidateEvent) {
  return normalizeConflictToken(candidatePayloadRecord(candidate).targetSurface)
}

function targetSurfaceCompatible(candidate: AlgorithmAssetCandidateEvent, rule: AlgorithmAssetExistingRule) {
  const candidateSurface = candidateTargetSurface(candidate)
  const ruleSurface = normalizeConflictToken(rule.targetSurface)
  return !candidateSurface || !ruleSurface || candidateSurface === ruleSurface
}

function hasSemanticConflict(candidate: AlgorithmAssetCandidateEvent, rule: AlgorithmAssetExistingRule) {
  if (rule.assetKey === candidate.assetKey || rule.stableCode === candidate.assetKey) return false
  if (!targetSurfaceCompatible(candidate, rule)) return false

  const candidateCodes = candidateSemanticCodes(candidate)
  return [...ruleSemanticCodes(rule)].some((ruleCode) => candidateCodes.has(ruleCode))
}

function findConflictingRules(candidate: AlgorithmAssetCandidateEvent, rules: AlgorithmAssetExistingRule[]) {
  return rules.filter((rule) => (
    rule.assetKey === candidate.assetKey
    || rule.stableCode === candidate.assetKey
    || hasSemanticConflict(candidate, rule)
  ))
}

export function arbitrateAlgorithmAssetConflict(input: AlgorithmAssetConflictInput): AlgorithmAssetConflictArbitration {
  const candidate = input.candidate
  const conflictingRules = findConflictingRules(candidate, input.existingRules ?? [])
  const reasons: string[] = []
  const hasLegacyPublishedConflict = conflictingRules.some((rule) => isPublished(rule) && !hasUnifiedPublicationEvidence(rule))

  if (conflictingRules.some((rule) => hasSemanticConflict(candidate, rule))) {
    reasons.push('semantic_conflict_with_existing_stable_rule')
  }

  if (hasLegacyPublishedConflict) {
    reasons.push(
      'existing_published_rule_missing_unified_publication_evidence',
      'existing_published_rule_requires_legacy_audit_before_runtime_arbitration',
    )
  }

  if (candidate.governanceDecision.status === 'quarantine_required') {
    reasons.push('candidate_governance_decision_requires_quarantine')
    return {
      result: 'quarantine_required',
      runtimeRule: 'candidate_blocked_from_runtime',
      activeRuleContinues: true,
      reasons,
      candidate,
      conflictingRules,
    }
  }

  const manualAnchorRule = conflictingRules.find((rule) => rule.publishAnchor && MANUAL_ANCHORS.has(rule.publishAnchor))
  if (manualAnchorRule) {
    const activeRuleContinues = hasUnifiedPublicationEvidence(manualAnchorRule)
    reasons.push('existing_rule_has_manual_publish_anchor')
    return {
      result: 'manual_governance_required',
      runtimeRule: activeRuleContinues
        ? 'existing_active_or_published_rule_continues'
        : 'candidate_blocked_from_runtime',
      activeRuleContinues,
      reasons,
      candidate,
      conflictingRules,
    }
  }

  const scopeEscalationRule = conflictingRules.find((rule) => isProjectEscalation(candidate, rule))
  if (scopeEscalationRule) {
    const activeRuleContinues = hasUnifiedPublicationEvidence(scopeEscalationRule)
    reasons.push('project_candidate_cannot_replace_company_or_system_rule')
    return {
      result: 'quarantine_required',
      runtimeRule: 'candidate_blocked_from_runtime',
      activeRuleContinues,
      reasons,
      candidate,
      conflictingRules,
    }
  }

  if (!candidate.governanceDecision.canWriteRuntime) {
    const activeRuleContinues = conflictingRules.some(hasUnifiedPublicationEvidence)
    reasons.push('candidate_governance_decision_cannot_write_runtime')
    return {
      result: 'shadow_compare_only',
      runtimeRule: activeRuleContinues
        ? 'existing_active_or_published_rule_continues'
        : 'candidate_blocked_from_runtime',
      activeRuleContinues,
      reasons,
      candidate,
      conflictingRules,
    }
  }

  if (hasLegacyPublishedConflict) {
    return {
      result: 'shadow_compare_only',
      runtimeRule: 'candidate_blocked_from_runtime',
      activeRuleContinues: false,
      reasons,
      candidate,
      conflictingRules,
    }
  }

  const sameScopePublishedRule = conflictingRules.find((rule) => hasUnifiedPublicationEvidence(rule) && isSameScope(candidate, rule))
  if (sameScopePublishedRule) {
    const hasRollbackTarget = Boolean(candidate.governanceDecision.normalizedRequest.evidence?.rollbackTarget || sameScopePublishedRule.rollbackTarget)
    if (hasRollbackTarget) {
      reasons.push('same_scope_published_rule_can_be_superseded_with_rollback_target')
      return {
        result: 'supersede_with_rollback_target',
        runtimeRule: 'candidate_may_replace_same_scope_published_version',
        activeRuleContinues: false,
        reasons,
        candidate,
        conflictingRules,
      }
    }

    reasons.push('same_scope_published_rule_requires_rollback_target')
    return {
      result: 'automation_unlock_candidate',
      runtimeRule: 'existing_active_or_published_rule_continues',
      activeRuleContinues: true,
      reasons,
      candidate,
      conflictingRules,
    }
  }

  return {
    result: 'no_conflict_publish_allowed',
    runtimeRule: 'candidate_may_publish_without_existing_conflict',
    activeRuleContinues: false,
    reasons,
    candidate,
    conflictingRules,
  }
}
