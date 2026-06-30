import type { DurationLiveLearningAssetKey } from './durationLiveLearningClosureService.js'
import {
  isDurationRuntimeConsumerPublicationKeyAllowedForAsset,
  listDurationRuntimeConsumerObservationIntegrationContracts,
  type DurationRuntimeConsumerPublicationStatus,
} from './durationRuntimeConsumerObservationIntegrationService.js'
import {
  listDurationRuntimeConsumerBusinessPathRequiredIntegrations,
} from './durationRuntimeConsumerBusinessPathIntegrationAuditService.js'

export type DurationRuntimeConsumerObservationQueryExec = <T = Record<string, unknown>>(
  sql: string,
  params?: unknown[],
) => Promise<T[]>

export type DurationRuntimeConsumerObservationStatus = 'observed' | 'rejected'
export type DurationRuntimeConsumerRuntimeCallStatus = 'called' | 'rejected'

export interface DurationRuntimeConsumerObservation {
  assetKey: DurationLiveLearningAssetKey
  publicationKey: string
  consumerKey: string
  consumerSurface: string
  observationStatus: DurationRuntimeConsumerObservationStatus
  observationContext: Record<string, unknown>
  sourceEvidenceRefs: string[]
  writesRuntimeDirectly: false
  writesFactDirectly: false
  observedAt: string
}

export interface DurationRuntimeConsumerRuntimeCall {
  consumerKey: string
  runtimeEntryRef: string
  callStatus: DurationRuntimeConsumerRuntimeCallStatus
  callContext: Record<string, unknown>
  sourceEvidenceRefs: string[]
  writesRuntimeDirectly: false
  writesFactDirectly: false
  calledAt: string
}

export interface RecordDurationRuntimeConsumerRuntimeCallInput {
  queryExec: DurationRuntimeConsumerObservationQueryExec
  consumerKey: string
  runtimeEntryRef: string
  callStatus?: DurationRuntimeConsumerRuntimeCallStatus
  callContext?: Record<string, unknown> | null
  sourceEvidenceRefs?: string[] | null
  calledAt?: string
  writesRuntimeDirectly?: boolean
  writesFactDirectly?: boolean
}

export interface RecordDurationRuntimeConsumerObservationInput {
  queryExec: DurationRuntimeConsumerObservationQueryExec
  assetKey: DurationLiveLearningAssetKey
  publicationKey: string
  consumerKey: string
  consumerSurface: string
  observationStatus?: DurationRuntimeConsumerObservationStatus
  observationContext?: Record<string, unknown> | null
  sourceEvidenceRefs?: string[] | null
  observedAt?: string
  writesRuntimeDirectly?: boolean
  writesFactDirectly?: boolean
}

export interface DurationRuntimeConsumerObservedArtifact {
  assetKey: DurationLiveLearningAssetKey
  publicationKey: string
  publicationStatus?: string | null
  observationContext?: Record<string, unknown> | null
  sourceEvidenceRefs?: string[] | null
}

export interface RecordDurationRuntimeConsumerObservedArtifactsInput {
  queryExec: DurationRuntimeConsumerObservationQueryExec
  consumerKey: string
  consumerSurface: string
  artifacts: readonly DurationRuntimeConsumerObservedArtifact[]
  observedAt?: string
  writesRuntimeDirectly?: boolean
  writesFactDirectly?: boolean
}

export interface RecordDurationRuntimeConsumerObservedContractArtifactsInput {
  queryExec: DurationRuntimeConsumerObservationQueryExec
  consumerKey: string
  artifacts: readonly DurationRuntimeConsumerObservedArtifact[]
  observedAt?: string
  writesRuntimeDirectly?: boolean
  writesFactDirectly?: boolean
}

export interface DurationRuntimeConsumerObservationResult {
  status:
    | 'runtime_consumer_observation_recorded'
    | 'runtime_consumer_observation_blocked'
  canPersist: boolean
  observation: DurationRuntimeConsumerObservation | null
  writesRuntimeDirectly: false
  writesFactDirectly: false
  reasons: string[]
}

export interface DurationRuntimeConsumerRuntimeCallResult {
  status:
    | 'runtime_consumer_runtime_call_recorded'
    | 'runtime_consumer_runtime_call_blocked'
  canPersist: boolean
  runtimeCall: DurationRuntimeConsumerRuntimeCall | null
  writesRuntimeDirectly: false
  writesFactDirectly: false
  reasons: string[]
}

export interface DurationRuntimeConsumerObservedArtifactsResult {
  status:
    | 'runtime_consumer_observations_recorded'
    | 'runtime_consumer_observations_partially_recorded'
    | 'runtime_consumer_observations_blocked'
  recordedCount: number
  blockedCount: number
  results: DurationRuntimeConsumerObservationResult[]
  writesRuntimeDirectly: false
  writesFactDirectly: false
  reasons: string[]
}

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

function normalizeConsumerKey(value: unknown) {
  return normalizeText(value).replace(/\.ts$/i, '')
}

function normalizeEvidenceRefs(value: string[] | null | undefined) {
  return Array.from(new Set((value ?? [])
    .map((item) => normalizeText(item))
    .filter(Boolean)))
}

function isDeclaredRuntimeConsumerForAsset(assetKey: unknown, consumerKey: unknown) {
  const normalizedAssetKey = normalizeText(assetKey)
  const normalizedConsumerKey = normalizeConsumerKey(consumerKey)
  if (!normalizedAssetKey || !normalizedConsumerKey) return true
  return listDurationRuntimeConsumerObservationIntegrationContracts()
    .some((contract) => contract.assetKey === normalizedAssetKey
      && contract.consumerKey === normalizedConsumerKey)
}

function isDeclaredRuntimeConsumer(consumerKey: unknown) {
  const normalizedConsumerKey = normalizeConsumerKey(consumerKey)
  if (!normalizedConsumerKey) return false
  return listDurationRuntimeConsumerObservationIntegrationContracts()
    .some((contract) => contract.consumerKey === normalizedConsumerKey)
}

function isDeclaredRuntimeEntryForConsumer(consumerKey: unknown, runtimeEntryRef: unknown) {
  const normalizedConsumerKey = normalizeConsumerKey(consumerKey)
  const normalizedRuntimeEntryRef = normalizeText(runtimeEntryRef)
  if (!normalizedConsumerKey || !normalizedRuntimeEntryRef) return true
  return listDurationRuntimeConsumerBusinessPathRequiredIntegrations()
    .some((integration) => integration.consumerKey === normalizedConsumerKey
      && integration.runtimeEntryRef === normalizedRuntimeEntryRef)
}

function buildBlockResult(reasons: string[]): DurationRuntimeConsumerObservationResult {
  return {
    status: 'runtime_consumer_observation_blocked',
    canPersist: false,
    observation: null,
    writesRuntimeDirectly: false,
    writesFactDirectly: false,
    reasons: Array.from(new Set(reasons)),
  }
}

function buildRuntimeCallBlockResult(reasons: string[]): DurationRuntimeConsumerRuntimeCallResult {
  return {
    status: 'runtime_consumer_runtime_call_blocked',
    canPersist: false,
    runtimeCall: null,
    writesRuntimeDirectly: false,
    writesFactDirectly: false,
    reasons: Array.from(new Set(reasons)),
  }
}

function isPublishedOrCanaryArtifact(status: string | null | undefined) {
  const normalized = normalizeText(status)
  return listDurationRuntimeConsumerObservationIntegrationContracts()
    .some((contract) => contract.acceptedPublicationStatuses.includes(
      normalized as DurationRuntimeConsumerPublicationStatus,
    ))
}

function findRuntimeConsumerContract(assetKey: unknown, consumerKey: unknown) {
  const normalizedAssetKey = normalizeText(assetKey)
  const normalizedConsumerKey = normalizeConsumerKey(consumerKey)
  return listDurationRuntimeConsumerObservationIntegrationContracts()
    .find((contract) => contract.assetKey === normalizedAssetKey
      && contract.consumerKey === normalizedConsumerKey)
}

function validateInput(input: RecordDurationRuntimeConsumerObservationInput) {
  const reasons: string[] = []
  if (!normalizeText(input.assetKey)) reasons.push('runtime_consumer_observation_asset_key_required')
  if (!normalizeText(input.publicationKey)) reasons.push('runtime_consumer_observation_publication_key_required')
  if (!normalizeText(input.consumerKey)) reasons.push('runtime_consumer_observation_consumer_key_required')
  if (!normalizeText(input.consumerSurface)) reasons.push('runtime_consumer_observation_consumer_surface_required')
  if (input.writesRuntimeDirectly) reasons.push('runtime_consumer_observation_must_not_write_runtime_directly')
  if (input.writesFactDirectly) reasons.push('runtime_consumer_observation_must_not_write_fact_directly')
  if (
    normalizeText(input.assetKey)
    && normalizeText(input.publicationKey)
    && !isDurationRuntimeConsumerPublicationKeyAllowedForAsset(input.assetKey, input.publicationKey)
  ) {
    reasons.push('runtime_consumer_observation_publication_key_not_allowed_for_asset')
  }
  if (!isDeclaredRuntimeConsumerForAsset(input.assetKey, input.consumerKey)) {
    reasons.push('runtime_consumer_observation_consumer_not_declared_for_asset')
  }
  return reasons
}

function validateRuntimeCallInput(input: RecordDurationRuntimeConsumerRuntimeCallInput) {
  const reasons: string[] = []
  if (!normalizeText(input.consumerKey)) reasons.push('runtime_consumer_runtime_call_consumer_key_required')
  if (!normalizeText(input.runtimeEntryRef)) reasons.push('runtime_consumer_runtime_call_entry_ref_required')
  if (input.writesRuntimeDirectly) reasons.push('runtime_consumer_runtime_call_must_not_write_runtime_directly')
  if (input.writesFactDirectly) reasons.push('runtime_consumer_runtime_call_must_not_write_fact_directly')
  if (normalizeText(input.consumerKey) && !isDeclaredRuntimeConsumer(input.consumerKey)) {
    reasons.push('runtime_consumer_runtime_call_consumer_not_declared')
  }
  if (
    normalizeText(input.consumerKey)
    && isDeclaredRuntimeConsumer(input.consumerKey)
    && !isDeclaredRuntimeEntryForConsumer(input.consumerKey, input.runtimeEntryRef)
  ) {
    reasons.push('runtime_consumer_runtime_call_entry_ref_not_declared_for_consumer')
  }
  return reasons
}

function buildRuntimeCall(input: RecordDurationRuntimeConsumerRuntimeCallInput): DurationRuntimeConsumerRuntimeCall {
  return {
    consumerKey: normalizeConsumerKey(input.consumerKey),
    runtimeEntryRef: normalizeText(input.runtimeEntryRef),
    callStatus: input.callStatus ?? 'called',
    callContext: input.callContext ?? {},
    sourceEvidenceRefs: normalizeEvidenceRefs(input.sourceEvidenceRefs),
    writesRuntimeDirectly: false,
    writesFactDirectly: false,
    calledAt: input.calledAt ?? new Date().toISOString(),
  }
}

function buildObservation(input: RecordDurationRuntimeConsumerObservationInput): DurationRuntimeConsumerObservation {
  return {
    assetKey: normalizeText(input.assetKey) as DurationLiveLearningAssetKey,
    publicationKey: normalizeText(input.publicationKey),
    consumerKey: normalizeConsumerKey(input.consumerKey),
    consumerSurface: normalizeText(input.consumerSurface),
    observationStatus: input.observationStatus ?? 'observed',
    observationContext: input.observationContext ?? {},
    sourceEvidenceRefs: normalizeEvidenceRefs(input.sourceEvidenceRefs),
    writesRuntimeDirectly: false,
    writesFactDirectly: false,
    observedAt: input.observedAt ?? new Date().toISOString(),
  }
}

function summarizeObservedArtifactResults(
  results: DurationRuntimeConsumerObservationResult[],
): DurationRuntimeConsumerObservedArtifactsResult {
  const recordedCount = results.filter((result) => result.status === 'runtime_consumer_observation_recorded').length
  const blockedCount = results.length - recordedCount
  const status: DurationRuntimeConsumerObservedArtifactsResult['status'] = blockedCount === 0
    ? 'runtime_consumer_observations_recorded'
    : recordedCount === 0
      ? 'runtime_consumer_observations_blocked'
      : 'runtime_consumer_observations_partially_recorded'

  return {
    status,
    recordedCount,
    blockedCount,
    results,
    writesRuntimeDirectly: false,
    writesFactDirectly: false,
    reasons: Array.from(new Set(results.flatMap((result) => result.reasons))),
  }
}

export async function recordDurationRuntimeConsumerRuntimeCall(
  input: RecordDurationRuntimeConsumerRuntimeCallInput,
): Promise<DurationRuntimeConsumerRuntimeCallResult> {
  const reasons = validateRuntimeCallInput(input)
  if (reasons.length > 0) return buildRuntimeCallBlockResult(reasons)

  const runtimeCall = buildRuntimeCall(input)
  await input.queryExec(
    `insert into public.runtime_consumer_runtime_calls (
      consumer_key,
      runtime_entry_ref,
      call_status,
      call_context,
      source_evidence_refs,
      writes_runtime_directly,
      writes_fact_directly,
      called_at
    ) values ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      runtimeCall.consumerKey,
      runtimeCall.runtimeEntryRef,
      runtimeCall.callStatus,
      runtimeCall.callContext,
      runtimeCall.sourceEvidenceRefs,
      runtimeCall.writesRuntimeDirectly,
      runtimeCall.writesFactDirectly,
      runtimeCall.calledAt,
    ],
  )

  return {
    status: 'runtime_consumer_runtime_call_recorded',
    canPersist: true,
    runtimeCall,
    writesRuntimeDirectly: false,
    writesFactDirectly: false,
    reasons: [],
  }
}

export async function recordDurationRuntimeConsumerObservedArtifacts(
  input: RecordDurationRuntimeConsumerObservedArtifactsInput,
): Promise<DurationRuntimeConsumerObservedArtifactsResult> {
  const results: DurationRuntimeConsumerObservationResult[] = []

  for (const artifact of input.artifacts) {
    if (!isPublishedOrCanaryArtifact(artifact.publicationStatus)) {
      results.push(buildBlockResult(['runtime_consumer_observation_published_or_canary_artifact_required']))
      continue
    }

    results.push(await recordDurationRuntimeConsumerObservation({
      queryExec: input.queryExec,
      assetKey: artifact.assetKey,
      publicationKey: artifact.publicationKey,
      consumerKey: input.consumerKey,
      consumerSurface: input.consumerSurface,
      observationContext: artifact.observationContext,
      sourceEvidenceRefs: artifact.sourceEvidenceRefs,
      observedAt: input.observedAt,
      writesRuntimeDirectly: input.writesRuntimeDirectly,
      writesFactDirectly: input.writesFactDirectly,
    }))
  }

  return summarizeObservedArtifactResults(results)
}

export async function recordDurationRuntimeConsumerObservedContractArtifacts(
  input: RecordDurationRuntimeConsumerObservedContractArtifactsInput,
): Promise<DurationRuntimeConsumerObservedArtifactsResult> {
  const results: DurationRuntimeConsumerObservationResult[] = []

  for (const artifact of input.artifacts) {
    const contract = findRuntimeConsumerContract(artifact.assetKey, input.consumerKey)
    if (!contract) {
      results.push(buildBlockResult(['runtime_consumer_observation_contract_not_found']))
      continue
    }

    const publicationStatus = normalizeText(artifact.publicationStatus) as DurationRuntimeConsumerPublicationStatus
    if (!contract.acceptedPublicationStatuses.includes(publicationStatus)) {
      results.push(buildBlockResult(['runtime_consumer_observation_published_or_canary_artifact_required']))
      continue
    }

    results.push(await recordDurationRuntimeConsumerObservation({
      queryExec: input.queryExec,
      assetKey: artifact.assetKey,
      publicationKey: artifact.publicationKey,
      consumerKey: contract.consumerKey,
      consumerSurface: contract.consumerSurface,
      observationContext: artifact.observationContext,
      sourceEvidenceRefs: artifact.sourceEvidenceRefs,
      observedAt: input.observedAt,
      writesRuntimeDirectly: input.writesRuntimeDirectly,
      writesFactDirectly: input.writesFactDirectly,
    }))
  }

  return summarizeObservedArtifactResults(results)
}

export async function recordDurationRuntimeConsumerObservation(
  input: RecordDurationRuntimeConsumerObservationInput,
): Promise<DurationRuntimeConsumerObservationResult> {
  const reasons = validateInput(input)
  if (reasons.length > 0) return buildBlockResult(reasons)

  const observation = buildObservation(input)
  await input.queryExec(
    `insert into public.runtime_consumer_observations (
      asset_key,
      publication_key,
      consumer_key,
      consumer_surface,
      observation_status,
      observation_context,
      source_evidence_refs,
      writes_runtime_directly,
      writes_fact_directly,
      observed_at
    ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      observation.assetKey,
      observation.publicationKey,
      observation.consumerKey,
      observation.consumerSurface,
      observation.observationStatus,
      observation.observationContext,
      observation.sourceEvidenceRefs,
      observation.writesRuntimeDirectly,
      observation.writesFactDirectly,
      observation.observedAt,
    ],
  )

  return {
    status: 'runtime_consumer_observation_recorded',
    canPersist: true,
    observation,
    writesRuntimeDirectly: false,
    writesFactDirectly: false,
    reasons: [],
  }
}
