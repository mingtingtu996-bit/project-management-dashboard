import {
  createAlgorithmAssetCandidateEvent,
  type AlgorithmAssetCandidateEvent,
} from './algorithmAssetCandidateEventAdapterService.js'
import {
  persistAlgorithmAssetCandidateEvent,
  type AlgorithmAssetGovernanceQueryExec,
  type PersistAlgorithmAssetCandidateEventResult,
} from './algorithmAssetGovernancePersistenceService.js'
import {
  buildAlgorithmAssetReleaseExitPackage,
  type AlgorithmAssetReleaseAdapter,
  type AlgorithmAssetReleaseExitResult,
  type AlgorithmAssetReleasePlatformPolicy,
  type AlgorithmAssetReleaseReplaySummary,
} from './algorithmAssetReleaseExitService.js'
import type { AlgorithmAssetConflictResult } from './algorithmAssetConflictService.js'
import {
  evaluateAlgorithmAssetParameterRuntimeUse,
  getAlgorithmAssetLearnableParameter,
  type AlgorithmAssetParameterRuntimeUseDecision,
  type AlgorithmAssetParameterRuntimeUseEvidence,
} from './algorithmAssetLearnableParameterRegistryService.js'

export type AlgorithmAssetLearnableParameterSuggestionInput = {
  parameterKey: string
  sourceSystem: string
  companyId?: string | null
  projectId?: string | null
  allowSystemReleaseScope?: boolean
  currentValue?: number | null
  proposedValue?: number | null
  evidence?: AlgorithmAssetParameterRuntimeUseEvidence
  metadata?: Record<string, unknown>
}

export type CreateAndPersistAlgorithmAssetLearnableParameterSuggestionInput =
  AlgorithmAssetLearnableParameterSuggestionInput & {
    queryExec?: AlgorithmAssetGovernanceQueryExec
  }

export type AlgorithmAssetLearnableParameterSuggestionReleaseInput =
  AlgorithmAssetLearnableParameterSuggestionInput & {
    conflictResult?: AlgorithmAssetConflictResult
    replaySummary?: AlgorithmAssetReleaseReplaySummary
    releaseAdapter?: AlgorithmAssetReleaseAdapter | null
    platformPolicy?: AlgorithmAssetReleasePlatformPolicy | null
  }

export type AlgorithmAssetLearnableParameterSuggestionEventResult = {
  event: AlgorithmAssetCandidateEvent
  parameterDecision: AlgorithmAssetParameterRuntimeUseDecision
}

export type CreateAndPersistAlgorithmAssetLearnableParameterSuggestionResult =
  AlgorithmAssetLearnableParameterSuggestionEventResult & {
    persistence: PersistAlgorithmAssetCandidateEventResult
  }

export type AlgorithmAssetLearnableParameterSuggestionReleaseResult =
  AlgorithmAssetLearnableParameterSuggestionEventResult & {
    releaseExit: AlgorithmAssetReleaseExitResult
  }

function parameterAssetKey(parameterKey: string) {
  return `learnable_parameter:${String(parameterKey ?? '').trim()}`
}

function scopeTypeFor(input: AlgorithmAssetLearnableParameterSuggestionInput) {
  if (input.projectId) return 'project'
  if (input.companyId) return 'company'
  if (input.allowSystemReleaseScope) return 'system'
  return undefined
}

function parameterPayload(
  input: AlgorithmAssetLearnableParameterSuggestionInput,
  parameterDecision: AlgorithmAssetParameterRuntimeUseDecision,
) {
  const parameter = parameterDecision.parameter
  const currentValue = input.currentValue ?? null
  const proposedValue = input.proposedValue ?? null
  const delta = typeof currentValue === 'number' && typeof proposedValue === 'number'
    ? Math.abs(proposedValue - currentValue)
    : null
  return {
    ...(input.metadata ?? {}),
    parameterSuggestionInstance: true,
    parameterKey: input.parameterKey,
    ownerAlgorithm: parameter?.ownerAlgorithm ?? null,
    currentValue,
    proposedValue,
    delta,
    parameterDecisionStatus: parameterDecision.status,
    runtimeConsumable: parameterDecision.runtimeConsumable,
    parameterDecisionReasons: parameterDecision.reasons,
    registeredPublishAnchor: parameter?.publishAnchor ?? null,
    registeredAutomationMaturity: parameter?.automationMaturity ?? null,
    registeredLearningMaturity: parameter?.learningMaturity ?? null,
    registeredLearningTarget: parameter?.learningTarget ?? null,
    maxDeltaPerRelease: parameter?.maxDeltaPerRelease ?? null,
    rollbackTarget: parameter?.rollbackTarget ?? null,
    evidence: input.evidence ?? {},
  }
}

function eventPolicyFor(parameterDecision: AlgorithmAssetParameterRuntimeUseDecision) {
  const parameter = parameterDecision.parameter
  if (!parameter) {
    return {
      publishAnchor: 'candidate_only' as const,
      automationMaturity: 'manual_required' as const,
      learningMaturity: 'frozen_constant' as const,
      learningTarget: 'governance_report' as const,
    }
  }

  if (parameterDecision.runtimeConsumable) {
    return {
      publishAnchor: parameter.publishAnchor,
      automationMaturity: parameter.automationMaturity,
      learningMaturity: parameter.learningMaturity,
      learningTarget: parameter.learningTarget,
    }
  }

  return {
    publishAnchor: 'manual_governance_required' as const,
    automationMaturity: parameter.automationMaturity === 'manual_required'
      ? 'manual_required' as const
      : 'auto_review_package' as const,
    learningMaturity: parameter.learningMaturity,
    learningTarget: parameter.learningTarget,
  }
}

function withParameterDecisionReasons(
  event: AlgorithmAssetCandidateEvent,
  parameterDecision: AlgorithmAssetParameterRuntimeUseDecision,
): AlgorithmAssetCandidateEvent {
  if (parameterDecision.runtimeConsumable) return event
  return {
    ...event,
    governanceDecision: {
      ...event.governanceDecision,
      reasons: [
        ...parameterDecision.reasons,
        'parameter_suggestion_runtime_decision_blocks_release',
        ...event.governanceDecision.reasons,
      ],
    },
  }
}

function createParameterDecision(input: AlgorithmAssetLearnableParameterSuggestionInput) {
  const parameter = getAlgorithmAssetLearnableParameter(input.parameterKey)
  return evaluateAlgorithmAssetParameterRuntimeUse({
    parameterKey: input.parameterKey,
    currentValue: input.currentValue,
    proposedValue: input.proposedValue,
    scopeType: scopeTypeFor(input) ?? parameter?.scopePolicy,
    companyId: input.companyId,
    projectId: input.projectId,
    evidence: input.evidence,
  })
}

export function createAlgorithmAssetLearnableParameterSuggestionEventResult(
  input: AlgorithmAssetLearnableParameterSuggestionInput,
): AlgorithmAssetLearnableParameterSuggestionEventResult {
  const parameterDecision = createParameterDecision(input)
  const policy = eventPolicyFor(parameterDecision)
  const event = createAlgorithmAssetCandidateEvent({
    assetKey: parameterAssetKey(input.parameterKey),
    sourceSystem: input.sourceSystem,
    assetType: 'calibration',
    companyId: input.companyId,
    projectId: input.projectId,
    allowSystemReleaseScope: input.allowSystemReleaseScope,
    candidatePayload: parameterPayload(input, parameterDecision),
    publishAnchor: policy.publishAnchor,
    automationMaturity: policy.automationMaturity,
    learningMaturity: policy.learningMaturity,
    learningTarget: policy.learningTarget,
    requestedRuntimeEffect: parameterDecision.runtimeConsumable ? 'bounded_calibration' : 'candidate_only',
    evidence: {
      replayPassed: input.evidence?.replayPassed,
      conflictFree: input.evidence?.conflictFree,
      rollbackTarget: input.evidence?.rollbackTarget,
      crossCompanyReplayPassed: input.evidence?.crossCompanyReplayPassed,
    },
  })

  return {
    event: withParameterDecisionReasons(event, parameterDecision),
    parameterDecision,
  }
}

export function createAlgorithmAssetLearnableParameterSuggestionEvent(
  input: AlgorithmAssetLearnableParameterSuggestionInput,
): AlgorithmAssetCandidateEvent {
  return createAlgorithmAssetLearnableParameterSuggestionEventResult(input).event
}

export async function createAndPersistAlgorithmAssetLearnableParameterSuggestionEvent(
  input: CreateAndPersistAlgorithmAssetLearnableParameterSuggestionInput,
): Promise<CreateAndPersistAlgorithmAssetLearnableParameterSuggestionResult> {
  const { event, parameterDecision } = createAlgorithmAssetLearnableParameterSuggestionEventResult(input)
  const persistence = await persistAlgorithmAssetCandidateEvent({
    event,
    queryExec: input.queryExec,
  })
  return {
    event,
    parameterDecision,
    persistence,
  }
}

export function buildAlgorithmAssetLearnableParameterSuggestionRelease(
  input: AlgorithmAssetLearnableParameterSuggestionReleaseInput,
): AlgorithmAssetLearnableParameterSuggestionReleaseResult {
  const { event, parameterDecision } = createAlgorithmAssetLearnableParameterSuggestionEventResult(input)
  const releaseExit = buildAlgorithmAssetReleaseExitPackage({
    candidateEvent: event,
    conflictResult: input.conflictResult,
    replaySummary: input.replaySummary,
    releaseAdapter: input.releaseAdapter,
    platformPolicy: input.platformPolicy,
  })
  return {
    event,
    parameterDecision,
    releaseExit,
  }
}
