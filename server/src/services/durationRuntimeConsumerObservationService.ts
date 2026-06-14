import {
  listDurationLiveLearningManifests,
  type DurationLiveLearningAssetKey,
} from './durationLiveLearningClosureService.js'

export type DurationRuntimeConsumerObservationQueryExec = <T = Record<string, unknown>>(
  sql: string,
  params?: unknown[],
) => Promise<T[]>

export type DurationRuntimeConsumerObservationStatus = 'observed' | 'rejected'

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
  return listDurationLiveLearningManifests()
    .filter((manifest) => manifest.assetKey === normalizedAssetKey)
    .some((manifest) => manifest.implementationAnchors.runtimeConsumers
      .map(normalizeConsumerKey)
      .includes(normalizedConsumerKey))
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

function isPublishedOrCanaryArtifact(status: string | null | undefined) {
  const normalized = normalizeText(status)
  return normalized === 'published'
    || normalized === 'canary'
    || normalized === 'runtime_published'
}

function validateInput(input: RecordDurationRuntimeConsumerObservationInput) {
  const reasons: string[] = []
  if (!normalizeText(input.assetKey)) reasons.push('runtime_consumer_observation_asset_key_required')
  if (!normalizeText(input.publicationKey)) reasons.push('runtime_consumer_observation_publication_key_required')
  if (!normalizeText(input.consumerKey)) reasons.push('runtime_consumer_observation_consumer_key_required')
  if (!normalizeText(input.consumerSurface)) reasons.push('runtime_consumer_observation_consumer_surface_required')
  if (input.writesRuntimeDirectly) reasons.push('runtime_consumer_observation_must_not_write_runtime_directly')
  if (input.writesFactDirectly) reasons.push('runtime_consumer_observation_must_not_write_fact_directly')
  if (!isDeclaredRuntimeConsumerForAsset(input.assetKey, input.consumerKey)) {
    reasons.push('runtime_consumer_observation_consumer_not_declared_for_asset')
  }
  return reasons
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
