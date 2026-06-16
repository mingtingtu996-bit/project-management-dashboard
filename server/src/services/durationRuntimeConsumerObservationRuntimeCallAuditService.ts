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
  sourceEvidenceRefs?: readonly string[] | null
}

export interface DurationRuntimeConsumerObservationEvidence {
  consumerKey: string
  sourceEvidenceRefs?: readonly string[] | null
}

export interface DurationRuntimeConsumerObservationRuntimeCallIdentity {
  consumerKey: string
  runtimeEntryRef: string
}

export interface DurationRuntimeConsumerObservationUnlinkedObservation {
  consumerKey: string
  sourceEvidenceRefs: string[]
  reason: 'runtime_consumer_observation_not_linked_to_runtime_call'
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
    | 'runtime_consumer_observation_runtime_call_not_linked_to_observation'
}

export interface DurationRuntimeConsumerObservationRuntimeCallCoverageInput {
  runtimeCallEvidence?: readonly DurationRuntimeConsumerObservationRuntimeCallEvidence[]
  observedConsumerObservations?: readonly DurationRuntimeConsumerObservationEvidence[]
}

export interface DurationRuntimeConsumerObservationRuntimeCallCoverage {
  status:
    | 'runtime_consumer_observation_runtime_calls_ready'
    | 'runtime_consumer_observation_runtime_calls_not_ready'
  requiredRuntimeCalls: DurationRuntimeConsumerObservationRuntimeCallIdentity[]
  observedRuntimeCalls: DurationRuntimeConsumerObservationObservedRuntimeCall[]
  missingRuntimeCalls: DurationRuntimeConsumerObservationRuntimeCallIdentity[]
  rejectedRuntimeCalls: DurationRuntimeConsumerObservationRejectedRuntimeCall[]
  unlinkedConsumerObservations: DurationRuntimeConsumerObservationUnlinkedObservation[]
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

function normalizeSourceEvidenceRefs(value: readonly string[] | null | undefined) {
  return Array.from(new Set((value ?? [])
    .map((item) => normalizeOptionalText(item))
    .filter(Boolean)))
}

function buildObservationSourceRefsByConsumerKey(
  observations: readonly DurationRuntimeConsumerObservationEvidence[] | undefined,
) {
  const refsByConsumerKey = new Map<string, Set<string>>()
  for (const observation of observations ?? []) {
    const consumerKey = normalizeConsumerKey(observation.consumerKey)
    const refs = normalizeSourceEvidenceRefs(observation.sourceEvidenceRefs)
    if (!consumerKey || refs.length === 0) continue
    const existing = refsByConsumerKey.get(consumerKey) ?? new Set<string>()
    for (const ref of refs) existing.add(ref)
    refsByConsumerKey.set(consumerKey, existing)
  }
  return refsByConsumerKey
}

function hasLinkedObservationSourceRef(
  consumerKey: string,
  callSourceEvidenceRefs: readonly string[],
  observationSourceRefsByConsumerKey: Map<string, Set<string>>,
) {
  if (callSourceEvidenceRefs.length === 0) return false
  const observationRefs = observationSourceRefsByConsumerKey.get(consumerKey)
  if (!observationRefs || observationRefs.size === 0) return false
  return callSourceEvidenceRefs.some((ref) => observationRefs.has(ref))
}

function findUnlinkedConsumerObservations(
  observations: readonly DurationRuntimeConsumerObservationEvidence[] | undefined,
  runtimeCallSourceRefsByConsumerKey: Map<string, Set<string>>,
) {
  const unlinked: DurationRuntimeConsumerObservationUnlinkedObservation[] = []
  for (const observation of observations ?? []) {
    const consumerKey = normalizeConsumerKey(observation.consumerKey)
    if (!consumerKey) continue
    const sourceEvidenceRefs = normalizeSourceEvidenceRefs(observation.sourceEvidenceRefs)
    const runtimeCallRefs = runtimeCallSourceRefsByConsumerKey.get(consumerKey)
    const linked = sourceEvidenceRefs.length > 0
      && Boolean(runtimeCallRefs?.size)
      && sourceEvidenceRefs.some((ref) => runtimeCallRefs?.has(ref))
    if (linked) continue
    unlinked.push({
      consumerKey,
      sourceEvidenceRefs,
      reason: 'runtime_consumer_observation_not_linked_to_runtime_call',
    })
  }
  return unlinked
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
  const observationSourceRefsByConsumerKey = buildObservationSourceRefsByConsumerKey(
    input.observedConsumerObservations,
  )
  const observedMap = new Map<string, DurationRuntimeConsumerObservationObservedRuntimeCall>()
  const runtimeCallSourceRefsByConsumerKey = new Map<string, Set<string>>()
  const rejectedRuntimeCalls: DurationRuntimeConsumerObservationRejectedRuntimeCall[] = []

  for (const evidence of input.runtimeCallEvidence ?? []) {
    const consumerKey = normalizeConsumerKey(evidence.consumerKey)
    const runtimeEntryRef = normalizeText(evidence.runtimeEntryRef)
    const evidenceRef = normalizeOptionalText(evidence.evidenceRef)
    const sourceEvidenceRefs = normalizeSourceEvidenceRefs(evidence.sourceEvidenceRefs)
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
    if (!hasLinkedObservationSourceRef(
      consumerKey,
      sourceEvidenceRefs,
      observationSourceRefsByConsumerKey,
    )) {
      rejectedRuntimeCalls.push({
        consumerKey,
        runtimeEntryRef,
        evidenceRef,
        reason: 'runtime_consumer_observation_runtime_call_not_linked_to_observation',
      })
      continue
    }
    observedMap.set(consumerKey, { consumerKey, runtimeEntryRef, evidenceRef })
    const existingSourceRefs = runtimeCallSourceRefsByConsumerKey.get(consumerKey) ?? new Set<string>()
    for (const ref of sourceEvidenceRefs) existingSourceRefs.add(ref)
    runtimeCallSourceRefsByConsumerKey.set(consumerKey, existingSourceRefs)
  }

  const observedRuntimeCalls = [...observedMap.values()]
  const observedConsumerKeys = new Set(observedRuntimeCalls.map((item) => item.consumerKey))
  const missingRuntimeCalls = requiredRuntimeCalls
    .filter((item) => !observedConsumerKeys.has(item.consumerKey))
  const unlinkedConsumerObservations = findUnlinkedConsumerObservations(
    input.observedConsumerObservations,
    runtimeCallSourceRefsByConsumerKey,
  )

  return {
    status: missingRuntimeCalls.length === 0 && unlinkedConsumerObservations.length === 0
      ? 'runtime_consumer_observation_runtime_calls_ready'
      : 'runtime_consumer_observation_runtime_calls_not_ready',
    requiredRuntimeCalls,
    observedRuntimeCalls,
    missingRuntimeCalls,
    rejectedRuntimeCalls,
    unlinkedConsumerObservations,
  }
}
