import {
  evaluateAlgorithmAssetGovernanceRequest,
  type AlgorithmAssetGovernanceRequest,
} from './algorithmAssetGovernanceProtocolService.js'

export const ALGORITHM_ASSET_EXPLANATION_CHAIN_VERSION = 'v1.4.22.3-algorithm-asset-explanation-chain-v1' as const

export type AlgorithmAssetExplanationScope = {
  type: 'system' | 'company' | 'project' | 'unknown' | string
  id?: string | null
}

export type AlgorithmAssetExplanationStepInput = {
  code: string
  source: string
  summary: string
  evidenceRef?: string | null
  boundaryPolicy?: string[]
}

export type AlgorithmAssetExplanationStep = AlgorithmAssetExplanationStepInput & {
  order: number
  runtimeMutationPolicy: 'evidence_only_not_runtime_writer'
}

export type AlgorithmAssetExplanationChainInput = {
  assetKey: string
  sourceSystem: string
  scope: AlgorithmAssetExplanationScope
  targetSurface?: string | null
  consumerKey?: string | null
  businessReason?: string | null
  governanceRequest: AlgorithmAssetGovernanceRequest
  steps?: AlgorithmAssetExplanationStepInput[]
}

export type AlgorithmAssetExplanationChain = {
  version: typeof ALGORITHM_ASSET_EXPLANATION_CHAIN_VERSION
  assetKey: string
  sourceSystem: string
  scope: AlgorithmAssetExplanationScope
  targetSurface: string | null
  consumerKey: string | null
  businessReason: string | null
  businessReasonPreservationPolicy: 'preserve_existing_business_reason_do_not_replace'
  runtimeMutationPolicy: 'explain_chain_only_not_runtime_writer'
  governance: {
    publishAnchor: string
    automationMaturity: string
    learningMaturity: string
    learningTarget: string
    requestedRuntimeEffect: string | null
    decisionStatus: string
    runtimeAction: string
    canWriteRuntime: false
    governanceDecisionCanWriteRuntime: boolean
    canModifyPublishAnchor: boolean
    reasons: string[]
    unlockCriteria: string[]
  }
  steps: AlgorithmAssetExplanationStep[]
  boundaryPolicy: string[]
}

export type AlgorithmAssetExplanationChainSummary = {
  assetKey: string
  sourceSystem: string
  scopeType: string
  decisionStatus: string
  runtimeAction: string
  canWriteRuntime: false
  businessReasonPreserved: boolean
  stepCodes: string[]
  governanceReasons: string[]
  boundaryPolicy: string[]
}

function normalizeText(value: unknown): string {
  return String(value ?? '').trim()
}

function nullableText(value: unknown): string | null {
  const normalized = normalizeText(value)
  return normalized || null
}

function uniqueStringArray(values: string[]): string[] {
  return [...new Set(values.map((value) => normalizeText(value)).filter(Boolean))]
}

function normalizeStep(step: AlgorithmAssetExplanationStepInput, index: number): AlgorithmAssetExplanationStep {
  return {
    code: normalizeText(step.code) || `step_${index + 1}`,
    source: normalizeText(step.source) || 'unknown_source',
    summary: normalizeText(step.summary),
    evidenceRef: nullableText(step.evidenceRef),
    boundaryPolicy: uniqueStringArray(step.boundaryPolicy ?? []),
    order: index + 1,
    runtimeMutationPolicy: 'evidence_only_not_runtime_writer',
  }
}

export function buildAlgorithmAssetExplanationChain(
  input: AlgorithmAssetExplanationChainInput,
): AlgorithmAssetExplanationChain {
  const decision = evaluateAlgorithmAssetGovernanceRequest({
    ...input.governanceRequest,
    assetKey: input.governanceRequest.assetKey || input.assetKey,
    sourceSystem: input.governanceRequest.sourceSystem || input.sourceSystem,
  })
  const normalized = decision.normalizedRequest
  const steps = (input.steps ?? []).map(normalizeStep)

  return {
    version: ALGORITHM_ASSET_EXPLANATION_CHAIN_VERSION,
    assetKey: normalizeText(input.assetKey),
    sourceSystem: normalizeText(input.sourceSystem),
    scope: input.scope,
    targetSurface: nullableText(input.targetSurface),
    consumerKey: nullableText(input.consumerKey),
    businessReason: nullableText(input.businessReason),
    businessReasonPreservationPolicy: 'preserve_existing_business_reason_do_not_replace',
    runtimeMutationPolicy: 'explain_chain_only_not_runtime_writer',
    governance: {
      publishAnchor: normalized.publishAnchor,
      automationMaturity: normalized.automationMaturity,
      learningMaturity: normalized.learningMaturity,
      learningTarget: normalized.learningTarget,
      requestedRuntimeEffect: normalized.requestedRuntimeEffect ?? null,
      decisionStatus: decision.status,
      runtimeAction: decision.runtimeAction,
      canWriteRuntime: false,
      governanceDecisionCanWriteRuntime: decision.canWriteRuntime,
      canModifyPublishAnchor: decision.canModifyPublishAnchor,
      reasons: [...decision.reasons],
      unlockCriteria: [...decision.unlockCriteria],
    },
    steps,
    boundaryPolicy: uniqueStringArray([
      'business_reason_is_preserved_not_rewritten',
      'explanation_chain_is_governance_metadata_not_runtime_writer',
      'runtime_write_still_requires_release_exit_domain_writer_consumer_monitoring_and_rollback',
      ...steps.flatMap((step) => step.boundaryPolicy ?? []),
    ]),
  }
}

export function summarizeAlgorithmAssetExplanationChain(
  chain: AlgorithmAssetExplanationChain,
): AlgorithmAssetExplanationChainSummary {
  return {
    assetKey: chain.assetKey,
    sourceSystem: chain.sourceSystem,
    scopeType: chain.scope.type,
    decisionStatus: chain.governance.decisionStatus,
    runtimeAction: chain.governance.runtimeAction,
    canWriteRuntime: false,
    businessReasonPreserved: Boolean(chain.businessReason),
    stepCodes: chain.steps.map((step) => step.code),
    governanceReasons: [...chain.governance.reasons],
    boundaryPolicy: [...chain.boundaryPolicy],
  }
}
