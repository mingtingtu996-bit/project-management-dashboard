import {
  listDurationRuntimeConsumerObservationFacadeRegistrations,
} from './durationRuntimeConsumerObservationAdapterService.js'

export interface DurationRuntimeConsumerObservationRuntimeCallEvidence {
  consumerKey: string
  runtimeEntryRef: string
}

export interface DurationRuntimeConsumerObservationRuntimeCallIdentity {
  consumerKey: string
}

export interface DurationRuntimeConsumerObservationObservedRuntimeCall
  extends DurationRuntimeConsumerObservationRuntimeCallIdentity {
  runtimeEntryRef: string
}

export interface DurationRuntimeConsumerObservationRejectedRuntimeCall
  extends DurationRuntimeConsumerObservationObservedRuntimeCall {
  reason: 'runtime_consumer_observation_facade_consumer_not_declared'
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
  return listDurationRuntimeConsumerObservationFacadeRegistrations()
    .map((registration) => ({ consumerKey: registration.consumerKey }))
}

export function evaluateDurationRuntimeConsumerObservationRuntimeCallCoverage(
  input: DurationRuntimeConsumerObservationRuntimeCallCoverageInput = {},
): DurationRuntimeConsumerObservationRuntimeCallCoverage {
  const requiredRuntimeCalls = listDurationRuntimeConsumerObservationRequiredRuntimeCalls()
  const requiredConsumerKeys = new Set(requiredRuntimeCalls.map((item) => item.consumerKey))
  const observedMap = new Map<string, DurationRuntimeConsumerObservationObservedRuntimeCall>()
  const rejectedRuntimeCalls: DurationRuntimeConsumerObservationRejectedRuntimeCall[] = []

  for (const evidence of input.runtimeCallEvidence ?? []) {
    const consumerKey = normalizeConsumerKey(evidence.consumerKey)
    const runtimeEntryRef = normalizeText(evidence.runtimeEntryRef)
    if (!requiredConsumerKeys.has(consumerKey)) {
      rejectedRuntimeCalls.push({
        consumerKey,
        runtimeEntryRef,
        reason: 'runtime_consumer_observation_facade_consumer_not_declared',
      })
      continue
    }
    if (!runtimeEntryRef) continue
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
