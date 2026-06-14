import type { DurationLiveLearningAssetKey } from './durationLiveLearningClosureService.js'

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

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

function normalizeEvidenceRefs(value: string[] | null | undefined) {
  return Array.from(new Set((value ?? [])
    .map((item) => normalizeText(item))
    .filter(Boolean)))
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

function validateInput(input: RecordDurationRuntimeConsumerObservationInput) {
  const reasons: string[] = []
  if (!normalizeText(input.assetKey)) reasons.push('runtime_consumer_observation_asset_key_required')
  if (!normalizeText(input.publicationKey)) reasons.push('runtime_consumer_observation_publication_key_required')
  if (!normalizeText(input.consumerKey)) reasons.push('runtime_consumer_observation_consumer_key_required')
  if (!normalizeText(input.consumerSurface)) reasons.push('runtime_consumer_observation_consumer_surface_required')
  if (input.writesRuntimeDirectly) reasons.push('runtime_consumer_observation_must_not_write_runtime_directly')
  if (input.writesFactDirectly) reasons.push('runtime_consumer_observation_must_not_write_fact_directly')
  return reasons
}

function buildObservation(input: RecordDurationRuntimeConsumerObservationInput): DurationRuntimeConsumerObservation {
  return {
    assetKey: normalizeText(input.assetKey) as DurationLiveLearningAssetKey,
    publicationKey: normalizeText(input.publicationKey),
    consumerKey: normalizeText(input.consumerKey),
    consumerSurface: normalizeText(input.consumerSurface),
    observationStatus: input.observationStatus ?? 'observed',
    observationContext: input.observationContext ?? {},
    sourceEvidenceRefs: normalizeEvidenceRefs(input.sourceEvidenceRefs),
    writesRuntimeDirectly: false,
    writesFactDirectly: false,
    observedAt: input.observedAt ?? new Date().toISOString(),
  }
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
