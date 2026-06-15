import {
  listDurationRuntimeConsumerObservationFacadeRegistrations,
} from './durationRuntimeConsumerObservationAdapterService.js'
import {
  listDurationRuntimeConsumerBusinessPathRequiredIntegrations,
} from './durationRuntimeConsumerBusinessPathIntegrationAuditService.js'

export interface DurationRuntimeConsumerObservationRuntimeCallEvidence {
  consumerKey: string
  runtimeEntryRef: string
  evidenceRef?: string | null
}

export interface DurationRuntimeConsumerObservationRuntimeCallIdentity {
  consumerKey: string
  runtimeEntryRef: string
}

export interface DurationRuntimeConsumerObservationObservedRuntimeCall
  extends DurationRuntimeConsumerObservationRuntimeCallIdentity {
  runtimeEntryRef: string
  evidenceRef: string
}

export interface DurationRuntimeConsumerObservationRejectedRuntimeCall
  extends DurationRuntimeConsumerObservationRuntimeCallIdentity {
  evidenceRef?: string
  reason:
    | 'runtime_consumer_observation_facade_consumer_not_declared'
    | 'runtime_consumer_observation_runtime_entry_ref_not_declared'
    | 'runtime_consumer_observation_runtime_call_production_ref_required'
}

export interface DurationRuntimeConsumerObservationRuntimeCallCoverageInput {
  runtimeCallEvidence?: readonly DurationRuntimeConsumerObservationRuntimeCallEvidence[]
}

export interface DurationRuntimeConsumerObservationRuntimeCallCoverage {
  status:
    | 'runtime_consumer_observation_runtime_calls_ready'
    | 'runtime_consumer_observation_runtime_calls_not_ready'
  requiredRuntimeCalls: DurationRuntimeConsumerObservationRuntimeCallIdentity[]
  observedRuntimeCalls: DurationRuntimeConsumerObservationObservedRuntimeCall[]
  missingRuntimeCalls: DurationRuntimeConsumerObservationRuntimeCallIdentity[]
  rejectedRuntimeCalls: DurationRuntimeConsumerObservationRejectedRuntimeCall[]
}

function normalizeConsumerKey(value: string) {
  return value.trim().replace(/\.ts$/i, '')
}

function normalizeText(value: string) {
  return value.trim()
}

function normalizeOptionalText(value: string | null | undefined) {
  return typeof value === 'string' ? value.trim() : ''
}

function isRuntimeConsumerRuntimeCallProductionEvidenceRef(value: string) {
  return value.startsWith('runtime_consumer_runtime_calls:')
    && value.slice('runtime_consumer_runtime_calls:'.length).trim().length > 0
}

export function listDurationRuntimeConsumerObservationRequiredRuntimeCalls():
  DurationRuntimeConsumerObservationRuntimeCallIdentity[] {
  const declaredFacadeConsumers = new Set(
    listDurationRuntimeConsumerObservationFacadeRegistrations()
      .map((registration) => registration.consumerKey),
  )
  return listDurationRuntimeConsumerBusinessPathRequiredIntegrations()
    .filter((integration) => declaredFacadeConsumers.has(integration.consumerKey))
    .map((integration) => ({
      consumerKey: integration.consumerKey,
      runtimeEntryRef: integration.runtimeEntryRef,
    }))
}

export function evaluateDurationRuntimeConsumerObservationRuntimeCallCoverage(
  input: DurationRuntimeConsumerObservationRuntimeCallCoverageInput = {},
): DurationRuntimeConsumerObservationRuntimeCallCoverage {
  const requiredRuntimeCalls = listDurationRuntimeConsumerObservationRequiredRuntimeCalls()
  const requiredRuntimeCallByConsumerKey = new Map(
    requiredRuntimeCalls.map((item) => [item.consumerKey, item]),
  )
  const observedMap = new Map<string, DurationRuntimeConsumerObservationObservedRuntimeCall>()
  const rejectedRuntimeCalls: DurationRuntimeConsumerObservationRejectedRuntimeCall[] = []

  for (const evidence of input.runtimeCallEvidence ?? []) {
    const consumerKey = normalizeConsumerKey(evidence.consumerKey)
    const runtimeEntryRef = normalizeText(evidence.runtimeEntryRef)
    const evidenceRef = normalizeOptionalText(evidence.evidenceRef)
    const requiredRuntimeCall = requiredRuntimeCallByConsumerKey.get(consumerKey)
    if (!requiredRuntimeCall) {
      rejectedRuntimeCalls.push({
        consumerKey,
        runtimeEntryRef,
        ...(evidenceRef ? { evidenceRef } : {}),
        reason: 'runtime_consumer_observation_facade_consumer_not_declared',
      })
      continue
    }
    if (!runtimeEntryRef) continue
    if (runtimeEntryRef !== requiredRuntimeCall.runtimeEntryRef) {
      rejectedRuntimeCalls.push({
        consumerKey,
        runtimeEntryRef,
        ...(evidenceRef ? { evidenceRef } : {}),
        reason: 'runtime_consumer_observation_runtime_entry_ref_not_declared',
      })
      continue
    }
    if (!isRuntimeConsumerRuntimeCallProductionEvidenceRef(evidenceRef)) {
      rejectedRuntimeCalls.push({
        consumerKey,
        runtimeEntryRef,
        ...(evidenceRef ? { evidenceRef } : {}),
        reason: 'runtime_consumer_observation_runtime_call_production_ref_required',
      })
      continue
    }
    observedMap.set(consumerKey, { consumerKey, runtimeEntryRef, evidenceRef })
  }

  const observedRuntimeCalls = [...observedMap.values()]
  const observedConsumerKeys = new Set(observedRuntimeCalls.map((item) => item.consumerKey))
  const missingRuntimeCalls = requiredRuntimeCalls
    .filter((item) => !observedConsumerKeys.has(item.consumerKey))

  return {
    status: missingRuntimeCalls.length === 0
      ? 'runtime_consumer_observation_runtime_calls_ready'
      : 'runtime_consumer_observation_runtime_calls_not_ready',
    requiredRuntimeCalls,
    observedRuntimeCalls,
    missingRuntimeCalls,
    rejectedRuntimeCalls,
  }
}
