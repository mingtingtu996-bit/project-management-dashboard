export const NOTIFICATION_PRODUCER_CONTRACT_VERSION = 'v1.4.13-producer-closure'

type ProducerTouchpointType = 'persistent' | 'dashboard_todo' | 'popup' | 'page_banner' | 'system_record'

type ProducerNotificationInput = {
  notification_type?: string | null
  touchpoint_type?: string | null
  source_entity_type?: string | null
  metadata?: Record<string, unknown> | null
  [key: string]: unknown
}

type ProducerDecision = 'allowed_actionable' | 'allowed_non_actionable' | 'downgraded_to_system_record'

const ATTENTION_TOUCHPOINT_TYPES = new Set(['persistent', 'dashboard_todo', 'popup', 'page_banner'])
const OWNER_CONFIRMATION_MARKERS = ['owner_confirmation']
const NON_ACTIONABLE_POLICY_MARKERS = [
  'candidate_only',
  'candidate_gate',
  'candidate_warning',
  'confidence_only',
  'explain_only',
  'manual_review',
  'observe_only',
  'observation_only',
  'reviewable',
  'shadow_only',
  'shadow_run',
  'warning_candidate',
]

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

function normalizeToken(value: unknown) {
  return normalizeText(value).replace(/-/g, '_').toLowerCase()
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function normalizeTouchpoint(value: unknown): ProducerTouchpointType {
  const normalized = normalizeToken(value)
  if (
    normalized === 'dashboard_todo'
    || normalized === 'popup'
    || normalized === 'page_banner'
    || normalized === 'system_record'
    || normalized === 'persistent'
  ) {
    return normalized
  }
  return 'persistent'
}

function collectPolicyTokens(input: ProducerNotificationInput) {
  const metadata = readRecord(input.metadata)
  const governanceSignal = readRecord(metadata.governanceSignal)
  const thresholdDecision = readRecord(metadata.thresholdDecision)
  const ruleQuality = readRecord(metadata.ruleQuality)

  return [
    input.actionPolicy,
    input.action_policy,
    input.runtimePolicy,
    input.runtime_policy,
    metadata.actionPolicy,
    metadata.action_policy,
    metadata.runtimeActionPolicy,
    metadata.runtime_action_policy,
    metadata.runtimePolicy,
    metadata.runtime_policy,
    metadata.reviewTier,
    metadata.review_tier,
    metadata.promotionStatus,
    metadata.promotion_status,
    governanceSignal.actionPolicy,
    governanceSignal.action_policy,
    governanceSignal.promotionStatus,
    governanceSignal.promotion_status,
    thresholdDecision.reviewTier,
    thresholdDecision.review_tier,
    ruleQuality.runtimeRole,
    ruleQuality.runtime_role,
  ]
    .map(normalizeToken)
    .filter(Boolean)
}

function hasAnyMarker(token: string, markers: string[]) {
  return markers.some((marker) => token === marker || token.includes(marker))
}

function strongestPolicyToken(tokens: string[]) {
  const ownerConfirmation = tokens.find((token) => hasAnyMarker(token, OWNER_CONFIRMATION_MARKERS))
  if (ownerConfirmation) return ownerConfirmation
  return tokens.find((token) => hasAnyMarker(token, NON_ACTIONABLE_POLICY_MARKERS)) ?? tokens[0] ?? 'unspecified'
}

export function evaluateNotificationProducerContract(input: ProducerNotificationInput) {
  const metadata = readRecord(input.metadata)
  const tokens = collectPolicyTokens(input)
  const actionPolicy = strongestPolicyToken(tokens)
  const isOwnerConfirmation = tokens.some((token) => hasAnyMarker(token, OWNER_CONFIRMATION_MARKERS))
  const isNonActionableSignal = tokens.some((token) => hasAnyMarker(token, NON_ACTIONABLE_POLICY_MARKERS))
  const touchpointType = normalizeTouchpoint(input.touchpoint_type)
  const requestedAttention = ATTENTION_TOUCHPOINT_TYPES.has(touchpointType)
  const shouldDowngrade = requestedAttention && isNonActionableSignal && !isOwnerConfirmation
  const decision: ProducerDecision = shouldDowngrade
    ? 'downgraded_to_system_record'
    : requestedAttention
      ? 'allowed_actionable'
      : 'allowed_non_actionable'

  return {
    actionPolicy,
    decision,
    boundaryReason: shouldDowngrade ? 'non_actionable_algorithm_signal' : 'producer_contract_satisfied',
    metadata,
    shouldDowngrade,
  }
}

export function applyNotificationProducerContract<T extends ProducerNotificationInput>(input: T): T {
  const evaluation = evaluateNotificationProducerContract(input)
  const metadata = {
    ...evaluation.metadata,
    producer_contract_version: NOTIFICATION_PRODUCER_CONTRACT_VERSION,
    producer_action_policy: evaluation.actionPolicy,
    producer_touchpoint_decision: evaluation.decision,
    producer_boundary_reason: evaluation.boundaryReason,
  }

  if (!evaluation.shouldDowngrade) {
    return {
      ...input,
      metadata,
    }
  }

  return {
    ...input,
    notification_type: 'system-exception',
    touchpoint_type: 'system_record',
    metadata,
  }
}
