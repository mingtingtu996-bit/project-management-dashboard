import type {
  AlgorithmAssetGovernanceRequest,
  AlgorithmAssetAutomationMaturity,
  AlgorithmAssetPublishAnchor,
} from './algorithmAssetGovernanceProtocolService.js'
import {
  evaluateAlgorithmAssetGovernanceRequest,
  normalizeAlgorithmAssetGovernanceRequest,
} from './algorithmAssetGovernanceProtocolService.js'

export type AlgorithmAssetAutomationRoute =
  | 'manual_unlock_package'
  | 'review_package'
  | 'shadow_candidate'
  | 'canary_candidate'
  | 'publish_candidate'

export type AlgorithmAssetSuggestedAutomationRoute =
  | AlgorithmAssetAutomationMaturity
  | 'anchor_upgrade_candidate'

export type AlgorithmAssetAutomationMaturityReview = {
  assetKey: string
  publishAnchor: AlgorithmAssetPublishAnchor
  automationMaturity: AlgorithmAssetAutomationMaturity
  currentRoute: AlgorithmAssetAutomationRoute
  canWriteRuntimeNow: boolean
  canModifyPublishAnchorNow: boolean
  automationUnlockCriteria: string[]
  moreVerificationNeeds: string[]
  suggestedNextRoutes: AlgorithmAssetSuggestedAutomationRoute[]
  blockedRuntimeClaims: string[]
}

function addUnique(target: string[], ...values: Array<string | false | null | undefined>) {
  for (const value of values) {
    if (value && !target.includes(value)) target.push(value)
  }
}

function currentRouteFor(
  publishAnchor: AlgorithmAssetPublishAnchor,
  automationMaturity: AlgorithmAssetAutomationMaturity,
): AlgorithmAssetAutomationRoute {
  if (publishAnchor === 'manual_governance_required' || automationMaturity === 'manual_required') {
    return 'manual_unlock_package'
  }
  if (automationMaturity === 'auto_review_package') return 'review_package'
  if (automationMaturity === 'auto_shadow') return 'shadow_candidate'
  if (automationMaturity === 'auto_canary') return 'canary_candidate'
  return 'publish_candidate'
}

function buildUnlockCriteria(input: ReturnType<typeof normalizeAlgorithmAssetGovernanceRequest>) {
  const criteria: string[] = []
  if (input.publishAnchor === 'manual_governance_required') {
    addUnique(
      criteria,
      'register_anchor_upgrade_strategy',
      'collect_cross_project_or_cross_company_replay',
      'versioned_governance_audit_required',
    )
  }
  if (!input.evidence?.rollbackTarget) addUnique(criteria, 'rollback_target_required')
  if (!input.evidence?.conflictFree) addUnique(criteria, 'conflict_clearance_required')
  return criteria
}

function buildVerificationNeeds(input: ReturnType<typeof normalizeAlgorithmAssetGovernanceRequest>) {
  const needs: string[] = []
  addUnique(
    needs,
    !input.evidence?.crossCompanyReplayPassed && 'cross_project_or_cross_company_replay_required',
    !input.evidence?.replayPassed && 'replay_required',
    !input.evidence?.rollbackTarget && 'rollback_target_required',
    !input.evidence?.conflictFree && 'conflict_clearance_required',
    'domain_writer_contract_required',
    'consumer_verification_required',
    'impact_monitoring_required',
  )

  if (input.publishAnchor === 'manual_governance_required') {
    addUnique(needs, 'versioned_anchor_upgrade_approval_required')
  }

  if (
    input.automationMaturity === 'auto_shadow'
    || input.automationMaturity === 'auto_canary'
    || Boolean(input.evidence?.replayPassed && input.evidence.crossCompanyReplayPassed)
  ) {
    addUnique(needs, 'canary_aware_consumer_required')
  }

  return needs
}

function suggestedRoutesFor(input: ReturnType<typeof normalizeAlgorithmAssetGovernanceRequest>) {
  const routes: AlgorithmAssetSuggestedAutomationRoute[] = []
  if (input.publishAnchor === 'manual_governance_required') {
    if (
      input.evidence?.replayPassed
      && input.evidence.crossCompanyReplayPassed
      && input.evidence.conflictFree
      && input.evidence.rollbackTarget
    ) {
      addUnique(routes, 'anchor_upgrade_candidate', 'auto_canary')
      return routes
    }
    if (input.automationMaturity === 'manual_required') {
      addUnique(routes, 'auto_review_package', 'auto_shadow')
      return routes
    }
    addUnique(routes, 'auto_shadow')
    return routes
  }

  if (input.automationMaturity === 'auto_review_package') addUnique(routes, 'auto_shadow')
  if (input.automationMaturity === 'auto_shadow') addUnique(routes, 'auto_canary')
  return routes
}

export function buildAlgorithmAssetAutomationMaturityReview(
  input: AlgorithmAssetGovernanceRequest,
): AlgorithmAssetAutomationMaturityReview {
  const normalized = normalizeAlgorithmAssetGovernanceRequest(input)
  const decision = evaluateAlgorithmAssetGovernanceRequest(normalized)
  const automationUnlockCriteria = [...decision.unlockCriteria]
  addUnique(automationUnlockCriteria, ...buildUnlockCriteria(normalized))
  const isManualAnchor = normalized.publishAnchor === 'manual_governance_required'

  return {
    assetKey: input.assetKey,
    publishAnchor: normalized.publishAnchor,
    automationMaturity: normalized.automationMaturity,
    currentRoute: currentRouteFor(normalized.publishAnchor, normalized.automationMaturity),
    canWriteRuntimeNow: decision.canWriteRuntime,
    canModifyPublishAnchorNow: decision.canModifyPublishAnchor,
    automationUnlockCriteria,
    moreVerificationNeeds: buildVerificationNeeds(normalized),
    suggestedNextRoutes: suggestedRoutesFor(normalized),
    blockedRuntimeClaims: isManualAnchor
      ? [
          'automation_unlock_is_not_publish_permission',
          'canary_suggestion_is_not_runtime_publication',
          'manual_anchor_requires_versioned_upgrade_before_release_gate',
        ]
      : [],
  }
}
