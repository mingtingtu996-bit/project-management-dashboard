import {
  evaluateAlgorithmAssetGovernanceRequest,
  type AlgorithmAssetAutomationMaturity,
  type AlgorithmAssetGeneratedBy,
  type AlgorithmAssetGovernanceDecision,
  type AlgorithmAssetGovernanceEvidence,
  type AlgorithmAssetLearningMaturity,
  type AlgorithmAssetLearningTarget,
  type AlgorithmAssetPublishAnchor,
  type AlgorithmAssetRequestedRuntimeEffect,
} from './algorithmAssetGovernanceProtocolService.js'
import {
  persistAlgorithmAssetCandidateEvent,
  type AlgorithmAssetGovernanceQueryExec,
  type PersistAlgorithmAssetCandidateEventResult,
} from './algorithmAssetGovernancePersistenceService.js'

export type AlgorithmAssetCandidateEventType =
  | 'seed'
  | 'rule'
  | 'template'
  | 'calibration'
  | 'override'
  | 'signal'

export type AlgorithmAssetCandidateScopeType =
  | 'project'
  | 'company'
  | 'system'
  | 'system_observation'

export type AlgorithmAssetCandidateLifecycleStatus =
  | 'candidate'
  | 'review_required'
  | 'shadow_ready'
  | 'canary_ready'
  | 'published_ready'
  | 'quarantined'

export type AlgorithmAssetCandidateEventInput = {
  assetKey: string
  sourceSystem: string
  assetType: AlgorithmAssetCandidateEventType
  companyId?: string | null
  projectId?: string | null
  allowSystemReleaseScope?: boolean
  candidatePayload?: unknown
  publishAnchor?: AlgorithmAssetPublishAnchor | string | null
  automationMaturity?: AlgorithmAssetAutomationMaturity | string | null
  learningMaturity?: AlgorithmAssetLearningMaturity | string | null
  learningTarget?: AlgorithmAssetLearningTarget | string | null
  requestedRuntimeEffect?: AlgorithmAssetRequestedRuntimeEffect
  generatedBy?: AlgorithmAssetGeneratedBy
  evidence?: AlgorithmAssetGovernanceEvidence
}

export type AlgorithmAssetCandidateEvent = {
  eventKey: string
  assetKey: string
  sourceSystem: string
  assetType: AlgorithmAssetCandidateEventType
  scopeType: AlgorithmAssetCandidateScopeType
  companyId?: string
  projectId?: string
  runtimeEffectPolicy: AlgorithmAssetRequestedRuntimeEffect
  lifecycleStatus: AlgorithmAssetCandidateLifecycleStatus
  publishAnchor: AlgorithmAssetPublishAnchor
  automationMaturity: AlgorithmAssetAutomationMaturity
  learningMaturity: AlgorithmAssetLearningMaturity
  learningTarget: AlgorithmAssetLearningTarget
  candidatePayload?: unknown
  governanceDecision: AlgorithmAssetGovernanceDecision
}

export type CreateAndPersistAlgorithmAssetCandidateEventInput = AlgorithmAssetCandidateEventInput & {
  queryExec?: AlgorithmAssetGovernanceQueryExec
}

export type CreateAndPersistAlgorithmAssetCandidateEventResult = {
  event: AlgorithmAssetCandidateEvent
  persistence: PersistAlgorithmAssetCandidateEventResult
}

function normalizeId(value: string | null | undefined) {
  const trimmed = String(value ?? '').trim()
  return trimmed || undefined
}

function scopeTypeFor(
  companyId: string | undefined,
  projectId: string | undefined,
  allowSystemReleaseScope?: boolean,
): AlgorithmAssetCandidateScopeType {
  if (projectId) return 'project'
  if (companyId) return 'company'
  if (allowSystemReleaseScope) return 'system'
  return 'system_observation'
}

function lifecycleStatusFor(decision: AlgorithmAssetGovernanceDecision): AlgorithmAssetCandidateLifecycleStatus {
  if (decision.status === 'quarantine_required') return 'quarantined'
  if (decision.status === 'canary_allowed') return 'canary_ready'
  if (decision.status === 'publish_allowed') return 'published_ready'
  if (decision.status === 'manual_governance_required' || decision.status === 'review_required') return 'review_required'
  if (decision.runtimeAction === 'shadow_compare_only') return 'shadow_ready'
  return 'candidate'
}

function effectiveRuntimeEffectPolicyFor(
  requestedRuntimeEffect: AlgorithmAssetRequestedRuntimeEffect,
  decision: AlgorithmAssetGovernanceDecision,
): AlgorithmAssetRequestedRuntimeEffect {
  if (decision.canWriteRuntime) return requestedRuntimeEffect
  if (requestedRuntimeEffect === 'direct_effect_request' || requestedRuntimeEffect === 'bounded_calibration') {
    return 'candidate_only'
  }
  return requestedRuntimeEffect
}

function eventKeyFor(input: Pick<AlgorithmAssetCandidateEventInput, 'assetKey' | 'sourceSystem' | 'companyId' | 'projectId'>) {
  return [
    input.sourceSystem,
    input.assetKey,
    input.companyId ?? 'no_company',
    input.projectId ?? 'no_project',
  ].join(':')
}

export function createAlgorithmAssetCandidateEvent(input: AlgorithmAssetCandidateEventInput): AlgorithmAssetCandidateEvent {
  const companyId = normalizeId(input.companyId)
  const projectId = normalizeId(input.projectId)
  const scopeType = scopeTypeFor(companyId, projectId, input.allowSystemReleaseScope)
  const reasons: string[] = []
  const runtimeEffectPolicy: AlgorithmAssetRequestedRuntimeEffect = scopeType === 'system_observation'
    ? 'candidate_only'
    : input.requestedRuntimeEffect ?? 'candidate_only'

  if (scopeType === 'system_observation') {
    reasons.push('missing_scope_defaults_to_system_observation')
  }

  const governanceDecision = evaluateAlgorithmAssetGovernanceRequest({
    assetKey: input.assetKey,
    sourceSystem: input.sourceSystem,
    publishAnchor: scopeType === 'system_observation' ? 'candidate_only' : input.publishAnchor,
    automationMaturity: scopeType === 'system_observation' ? 'manual_required' : input.automationMaturity,
    learningMaturity: input.learningMaturity,
    learningTarget: input.learningTarget,
    requestedRuntimeEffect: runtimeEffectPolicy,
    generatedBy: input.generatedBy,
    candidatePayload: input.candidatePayload,
    evidence: input.evidence,
  })

  governanceDecision.reasons.unshift(...reasons)

  return {
    eventKey: eventKeyFor({ ...input, companyId, projectId }),
    assetKey: input.assetKey,
    sourceSystem: input.sourceSystem,
    assetType: input.assetType,
    scopeType,
    companyId,
    projectId,
    runtimeEffectPolicy: effectiveRuntimeEffectPolicyFor(runtimeEffectPolicy, governanceDecision),
    lifecycleStatus: lifecycleStatusFor(governanceDecision),
    publishAnchor: governanceDecision.normalizedRequest.publishAnchor,
    automationMaturity: governanceDecision.normalizedRequest.automationMaturity,
    learningMaturity: governanceDecision.normalizedRequest.learningMaturity,
    learningTarget: governanceDecision.normalizedRequest.learningTarget,
    candidatePayload: input.candidatePayload,
    governanceDecision,
  }
}

export async function createAndPersistAlgorithmAssetCandidateEvent(
  input: CreateAndPersistAlgorithmAssetCandidateEventInput,
): Promise<CreateAndPersistAlgorithmAssetCandidateEventResult> {
  const event = createAlgorithmAssetCandidateEvent(input)
  const persistence = await persistAlgorithmAssetCandidateEvent({
    event,
    queryExec: input.queryExec,
  })

  return {
    event,
    persistence,
  }
}
