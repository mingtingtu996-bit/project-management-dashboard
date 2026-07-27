import type {
  AlgorithmAssetAutomationMaturity,
  AlgorithmAssetPublishAnchor,
} from './algorithmAssetGovernanceProtocolService.js'

export type AlgorithmAssetAnchorUpgradeRequestedBy = 'system' | 'service' | 'user' | 'llm'

export type AlgorithmAssetAnchorUpgradeImpactScope = {
  projectCount?: number
  companyCount?: number
  scenarioCount?: number
}

export type AlgorithmAssetAnchorUpgradeEvidence = {
  strategyKey?: string | null
  strategyVersion?: string | null
  evidenceThresholdsPassed?: boolean
  replayPassed?: boolean
  conflictFree?: boolean
  crossCompanyReplayPassed?: boolean
  singleCandidateOnly?: boolean
  impactScope?: AlgorithmAssetAnchorUpgradeImpactScope | null
  rollbackTarget?: string | null
  auditRecordId?: string | null
}

export type AlgorithmAssetAnchorUpgradeStrategyInput = {
  assetKey: string
  requestedBy: AlgorithmAssetAnchorUpgradeRequestedBy
  currentPublishAnchor: AlgorithmAssetPublishAnchor
  requestedPublishAnchor: AlgorithmAssetPublishAnchor
  currentAutomationMaturity: AlgorithmAssetAutomationMaturity
  requestedAutomationMaturity: AlgorithmAssetAutomationMaturity
  evidence?: AlgorithmAssetAnchorUpgradeEvidence | null
}

export type AlgorithmAssetVersionedAnchorUpgrade = {
  assetKey: string
  strategyKey: string
  strategyVersion: string
  fromPublishAnchor: AlgorithmAssetPublishAnchor
  toPublishAnchor: AlgorithmAssetPublishAnchor
  fromAutomationMaturity: AlgorithmAssetAutomationMaturity
  toAutomationMaturity: AlgorithmAssetAutomationMaturity
  rollbackTarget: string
  auditRecordId: string
  impactScope: Required<AlgorithmAssetAnchorUpgradeImpactScope>
}

export type AlgorithmAssetAnchorUpgradeStrategyEvaluation = {
  status: 'upgrade_candidate_ready' | 'upgrade_blocked'
  canGenerateVersionedUpgrade: boolean
  canModifyPublishAnchor: false
  canWriteRuntime: false
  reasons: string[]
  unlockCriteria: string[]
  versionedUpgrade: AlgorithmAssetVersionedAnchorUpgrade | null
}

const PUBLISH_CAPABLE_ANCHORS = new Set<AlgorithmAssetPublishAnchor>([
  'trusted_source_auto_publish',
  'guarded_runtime_auto_publish',
  'system_curated_publish',
])

const AUTOMATION_CAPABLE_MATURITIES = new Set<AlgorithmAssetAutomationMaturity>([
  'auto_canary',
  'auto_publish',
])

function requiredText(value: string | null | undefined) {
  return String(value ?? '').trim()
}

function impactScopeReady(scope: AlgorithmAssetAnchorUpgradeImpactScope | null | undefined) {
  return {
    projectCount: Math.max(0, Number(scope?.projectCount ?? 0)),
    companyCount: Math.max(0, Number(scope?.companyCount ?? 0)),
    scenarioCount: Math.max(0, Number(scope?.scenarioCount ?? 0)),
  }
}

function pushMissing(
  condition: boolean,
  reasons: string[],
  unlockCriteria: string[],
  reason: string,
  unlockCriterion = reason,
) {
  if (condition) return
  reasons.push(reason)
  unlockCriteria.push(unlockCriterion)
}

export function evaluateAlgorithmAssetAnchorUpgradeStrategy(
  input: AlgorithmAssetAnchorUpgradeStrategyInput,
): AlgorithmAssetAnchorUpgradeStrategyEvaluation {
  const evidence = input.evidence ?? {}
  const reasons: string[] = []
  const unlockCriteria: string[] = []
  const strategyKey = requiredText(evidence.strategyKey)
  const strategyVersion = requiredText(evidence.strategyVersion)
  const rollbackTarget = requiredText(evidence.rollbackTarget)
  const auditRecordId = requiredText(evidence.auditRecordId)
  const impactScope = impactScopeReady(evidence.impactScope)

  if (input.requestedBy === 'llm') {
    reasons.push('llm_cannot_approve_anchor_upgrade')
    unlockCriteria.push('platform_or_registered_strategy_request_required')
  }

  if (evidence.singleCandidateOnly) {
    reasons.push('single_candidate_or_single_replay_cannot_upgrade_manual_anchor')
    unlockCriteria.push('collect_cross_project_or_cross_company_replay')
  }

  pushMissing(
    Boolean(strategyKey),
    reasons,
    unlockCriteria,
    'registered_anchor_upgrade_strategy_required',
  )
  pushMissing(
    Boolean(strategyVersion),
    reasons,
    unlockCriteria,
    'strategy_version_required',
  )
  pushMissing(
    evidence.evidenceThresholdsPassed === true,
    reasons,
    unlockCriteria,
    'evidence_thresholds_required',
  )
  pushMissing(
    evidence.replayPassed === true,
    reasons,
    unlockCriteria,
    'replay_pass_required',
  )
  pushMissing(
    evidence.conflictFree === true,
    reasons,
    unlockCriteria,
    'conflict_clearance_required',
  )
  pushMissing(
    evidence.crossCompanyReplayPassed === true,
    reasons,
    unlockCriteria,
    'cross_project_or_cross_company_evidence_required',
  )
  pushMissing(
    impactScope.projectCount >= 2 && impactScope.companyCount >= 2 && impactScope.scenarioCount >= 2,
    reasons,
    unlockCriteria,
    'cross_project_or_cross_company_evidence_required',
  )
  pushMissing(
    Boolean(rollbackTarget),
    reasons,
    unlockCriteria,
    'rollback_target_required',
  )
  pushMissing(
    Boolean(auditRecordId),
    reasons,
    unlockCriteria,
    'versioned_governance_audit_required',
  )

  if (!PUBLISH_CAPABLE_ANCHORS.has(input.requestedPublishAnchor)) {
    reasons.push('requested_publish_anchor_must_allow_controlled_publish')
    unlockCriteria.push('choose_versioned_publish_capable_anchor')
  }

  if (!AUTOMATION_CAPABLE_MATURITIES.has(input.requestedAutomationMaturity)) {
    reasons.push('requested_automation_maturity_must_be_canary_or_publish')
    unlockCriteria.push('choose_auto_canary_or_auto_publish_maturity')
  }

  if (reasons.length > 0) {
    return {
      status: 'upgrade_blocked',
      canGenerateVersionedUpgrade: false,
      canModifyPublishAnchor: false,
      canWriteRuntime: false,
      reasons: Array.from(new Set(reasons)),
      unlockCriteria: Array.from(new Set(unlockCriteria)),
      versionedUpgrade: null,
    }
  }

  return {
    status: 'upgrade_candidate_ready',
    canGenerateVersionedUpgrade: true,
    canModifyPublishAnchor: false,
    canWriteRuntime: false,
    reasons: [],
    unlockCriteria: [],
    versionedUpgrade: {
      assetKey: input.assetKey,
      strategyKey,
      strategyVersion,
      fromPublishAnchor: input.currentPublishAnchor,
      toPublishAnchor: input.requestedPublishAnchor,
      fromAutomationMaturity: input.currentAutomationMaturity,
      toAutomationMaturity: input.requestedAutomationMaturity,
      rollbackTarget,
      auditRecordId,
      impactScope,
    },
  }
}
