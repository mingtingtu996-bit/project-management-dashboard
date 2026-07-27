import type {
  AlgorithmAssetCandidateEvent,
} from './algorithmAssetCandidateEventAdapterService.js'
import type {
  AlgorithmAssetConflictResult,
} from './algorithmAssetConflictService.js'
import type {
  AlgorithmAssetReplayRuntimeImpact,
} from './algorithmAssetReplayService.js'

export type AlgorithmAssetReleaseTargetSurface =
  | 'project_override'
  | 'company_override'
  | 'system_seed'

export type AlgorithmAssetReleaseExitStatus =
  | 'release_package_ready'
  | 'canary_package_ready'
  | 'review_required'
  | 'manual_governance_required'
  | 'platform_exception_review'
  | 'quarantined'

export type AlgorithmAssetReleaseAction =
  | 'handoff_to_domain_release_adapter'
  | 'handoff_to_domain_canary_adapter'
  | 'review_package_only'
  | 'quarantine_only'

export type AlgorithmAssetReleaseAdapter = {
  adapterKey: string
  targetSurface: AlgorithmAssetReleaseTargetSurface
  supportsRollback: boolean
}

export type AlgorithmAssetReleasePlatformPolicy = {
  systemAutoPublishPolicyReady?: boolean
  impactMonitoringReady?: boolean
  platformReleaseExitReady?: boolean
}

export type AlgorithmAssetReleaseReplaySummary = {
  replayPassed?: boolean
  runtimeImpact?: AlgorithmAssetReplayRuntimeImpact
}

export type AlgorithmAssetReleasePackage = {
  eventKey: string
  assetKey: string
  scopeType: AlgorithmAssetCandidateEvent['scopeType']
  companyId?: string
  projectId?: string
  adapterKey: string
  targetSurface: AlgorithmAssetReleaseTargetSurface
  rollbackTarget: string
  publishAnchor: AlgorithmAssetCandidateEvent['publishAnchor']
  automationMaturity: AlgorithmAssetCandidateEvent['automationMaturity']
  learningMaturity: AlgorithmAssetCandidateEvent['learningMaturity']
  learningTarget: AlgorithmAssetCandidateEvent['learningTarget']
  candidatePayload?: unknown
  conflictResult?: AlgorithmAssetConflictResult
  replaySummary?: AlgorithmAssetReleaseReplaySummary
}

export type AlgorithmAssetReleaseExitInput = {
  candidateEvent: AlgorithmAssetCandidateEvent
  conflictResult?: AlgorithmAssetConflictResult
  replaySummary?: AlgorithmAssetReleaseReplaySummary
  releaseAdapter?: AlgorithmAssetReleaseAdapter | null
  platformPolicy?: AlgorithmAssetReleasePlatformPolicy | null
}

export type AlgorithmAssetReleaseExitResult = {
  status: AlgorithmAssetReleaseExitStatus
  releaseAction: AlgorithmAssetReleaseAction
  canHandoffToRuntimeAdapter: boolean
  writesRuntimeDirectly: false
  targetSurface: AlgorithmAssetReleaseTargetSurface | null
  reasons: string[]
  releasePackage: AlgorithmAssetReleasePackage | null
}

const RELEASE_ALLOWED_CONFLICT_RESULTS = new Set<AlgorithmAssetConflictResult>([
  'no_conflict_publish_allowed',
  'supersede_with_rollback_target',
])

function rollbackTargetFor(event: AlgorithmAssetCandidateEvent) {
  const rollbackTarget = event.governanceDecision.normalizedRequest.evidence?.rollbackTarget
  const normalized = String(rollbackTarget ?? '').trim()
  return normalized || null
}

function expectedTargetSurface(event: AlgorithmAssetCandidateEvent): AlgorithmAssetReleaseTargetSurface | null {
  if (event.publishAnchor === 'system_curated_publish') return 'system_seed'
  if (event.scopeType === 'system') return 'system_seed'
  if (event.scopeType === 'project') return 'project_override'
  if (event.scopeType === 'company') return 'company_override'
  return null
}

function replayGateSatisfied(event: AlgorithmAssetCandidateEvent, replaySummary?: AlgorithmAssetReleaseReplaySummary) {
  if (event.publishAnchor === 'trusted_source_auto_publish') return true
  return Boolean(replaySummary?.replayPassed && replaySummary.runtimeImpact === 'publish_gate_evidence')
}

function systemPolicyReasons(policy: AlgorithmAssetReleasePlatformPolicy | null | undefined) {
  const reasons: string[] = []
  if (!policy?.systemAutoPublishPolicyReady) reasons.push('system_auto_publish_policy_required')
  if (!policy?.impactMonitoringReady) reasons.push('impact_monitoring_required')
  if (!policy?.platformReleaseExitReady) reasons.push('platform_release_exit_required')
  return reasons
}

function blockedResult(
  status: Exclude<AlgorithmAssetReleaseExitStatus, 'release_package_ready' | 'canary_package_ready'>,
  reasons: string[],
  targetSurface: AlgorithmAssetReleaseTargetSurface | null,
): AlgorithmAssetReleaseExitResult {
  return {
    status,
    releaseAction: status === 'quarantined' ? 'quarantine_only' : 'review_package_only',
    canHandoffToRuntimeAdapter: false,
    writesRuntimeDirectly: false,
    targetSurface,
    reasons,
    releasePackage: null,
  }
}

export function buildAlgorithmAssetReleaseExitPackage(
  input: AlgorithmAssetReleaseExitInput,
): AlgorithmAssetReleaseExitResult {
  const event = input.candidateEvent
  const decision = event.governanceDecision
  const targetSurface = expectedTargetSurface(event)
  const reasons: string[] = []

  if (decision.status === 'quarantine_required' || event.lifecycleStatus === 'quarantined') {
    return blockedResult('quarantined', ['candidate_governance_requires_quarantine'], targetSurface)
  }

  if (decision.status === 'manual_governance_required' || input.conflictResult === 'manual_governance_required') {
    return blockedResult(
      'manual_governance_required',
      ['manual_anchor_or_existing_rule_blocks_release_exit'],
      targetSurface,
    )
  }

  if (targetSurface === 'system_seed') {
    const policyReasons = systemPolicyReasons(input.platformPolicy)
    if (policyReasons.length > 0) {
      return blockedResult('platform_exception_review', policyReasons, targetSurface)
    }
  }

  if (!targetSurface) reasons.push('runtime_scope_required')

  if (!input.platformPolicy?.impactMonitoringReady) {
    reasons.push('impact_monitoring_required')
  }

  if (decision.status !== 'publish_allowed' && decision.status !== 'canary_allowed') {
    reasons.push('governance_publish_gate_not_allowed')
  }

  if (!replayGateSatisfied(event, input.replaySummary)) {
    reasons.push('replay_gate_evidence_required')
  }

  if (input.conflictResult && !RELEASE_ALLOWED_CONFLICT_RESULTS.has(input.conflictResult)) {
    reasons.push('conflict_arbitration_blocks_release_exit')
  }

  const rollbackTarget = rollbackTargetFor(event)
  if (!rollbackTarget) reasons.push('rollback_target_required')

  const adapter = input.releaseAdapter ?? null
  if (!adapter?.adapterKey) {
    reasons.push('release_adapter_required')
  } else {
    if (!adapter.supportsRollback) reasons.push('release_adapter_must_support_rollback')
    if (targetSurface && adapter.targetSurface !== targetSurface) {
      reasons.push('release_adapter_target_surface_mismatch')
    }
  }

  if (reasons.length > 0 || !adapter || !targetSurface || !rollbackTarget) {
    return blockedResult('review_required', reasons, targetSurface)
  }

  const isCanary = decision.status === 'canary_allowed'
  return {
    status: isCanary ? 'canary_package_ready' : 'release_package_ready',
    releaseAction: isCanary ? 'handoff_to_domain_canary_adapter' : 'handoff_to_domain_release_adapter',
    canHandoffToRuntimeAdapter: true,
    writesRuntimeDirectly: false,
    targetSurface,
    reasons,
    releasePackage: {
      eventKey: event.eventKey,
      assetKey: event.assetKey,
      scopeType: event.scopeType,
      companyId: event.companyId,
      projectId: event.projectId,
      adapterKey: adapter.adapterKey,
      targetSurface,
      rollbackTarget,
      publishAnchor: event.publishAnchor,
      automationMaturity: event.automationMaturity,
      learningMaturity: event.learningMaturity,
      learningTarget: event.learningTarget,
      candidatePayload: event.candidatePayload,
      conflictResult: input.conflictResult,
      replaySummary: input.replaySummary,
    },
  }
}
