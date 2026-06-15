import {
  listDurationRuntimeConsumerObservationFacadeRegistrations,
} from './durationRuntimeConsumerObservationAdapterService.js'
import {
  listDurationRuntimeConsumerBusinessPathRequiredIntegrations,
} from './durationRuntimeConsumerBusinessPathIntegrationAuditService.js'

export interface DurationRuntimeConsumerObservationRuntimeCallEvidence {
  consumerKey: string
  runtimeEntryRef: string
}

export interface DurationRuntimeConsumerObservationRuntimeCallIdentity {
  consumerKey: string
  runtimeEntryRef: string
}

export interface DurationRuntimeConsumerObservationObservedRuntimeCall
  extends DurationRuntimeConsumerObservationRuntimeCallIdentity {
  runtimeEntryRef: string
}

export interface DurationRuntimeConsumerObservationRejectedRuntimeCall
  extends DurationRuntimeConsumerObservationObservedRuntimeCall {
  reason:
    | 'runtime_consumer_observation_facade_consumer_not_declared'
    | 'runtime_consumer_observation_runtime_entry_ref_not_declared'
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
    const requiredRuntimeCall = requiredRuntimeCallByConsumerKey.get(consumerKey)
    if (!requiredRuntimeCall) {
      rejectedRuntimeCalls.push({
        consumerKey,
        runtimeEntryRef,
        reason: 'runtime_consumer_observation_facade_consumer_not_declared',
      })
      continue
    }
    if (!runtimeEntryRef) continue
    if (runtimeEntryRef !== requiredRuntimeCall.runtimeEntryRef) {
      rejectedRuntimeCalls.push({
        consumerKey,
        runtimeEntryRef,
        reason: 'runtime_consumer_observation_runtime_entry_ref_not_declared',
      })
      continue
    }
    observedMap.set(consumerKey, { consumerKey, runtimeEntryRef })
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
