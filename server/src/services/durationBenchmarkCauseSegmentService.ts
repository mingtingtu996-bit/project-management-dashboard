import type { PoolClient } from 'pg'

import {
  CANONICAL_STRUCTURED_CAUSE_CODES,
  isStructuredCauseCode,
  STRUCTURED_CAUSE_TAXONOMY_VERSION,
  type StructuredCauseCode,
} from '../domain/structuredCauseTaxonomy.js'

export type DurationBenchmarkCauseSegment = {
  id: string
  benchmarkId: string
  companyId: string | null
  projectId: string | null
  causeCode: StructuredCauseCode
  taxonomyVersion: string
  sampleCount: number
  p50Days: number | null
  p75Days: number | null
  p80Days: number | null
  meanDays: number | null
  variance: number | null
  generatedAt: string
  sourceWindowStart: string | null
  sourceAsOf: string
  durationDayBasis: 'construction_production_day'
  calendarRef: string
  calendarVersion: string
}

export type PersistCurrentCauseSegmentsInput = {
  benchmarkId: string
  companyId: string | null
  projectId: string | null
  benchmarkKey: string
  generatedAt: string
  sourceWindowStart: string | null
  sourceAsOf: string
  calendarRef: string
  calendarVersion: string
  frozenEvidence?: unknown
}

export type DurationBenchmarkCauseSegmentQueryExec = <T = Record<string, unknown>>(
  sql: string,
  params?: unknown[],
) => Promise<T[]>

type ConfirmedCauseSampleRow = {
  sample_id?: unknown
  sample_task_id?: unknown
  sample_completed_at?: unknown
  sample_created_at?: unknown
  sample_updated_at?: unknown
  sample_evidence_fingerprint?: unknown
  sample_source_lineage?: unknown
  attribution_id?: unknown
  cause_code?: unknown
  taxonomy_version?: unknown
  actual_duration_production_days?: unknown
  sample_company_id?: unknown
  sample_project_id?: unknown
  attribution_company_id?: unknown
  attribution_project_id?: unknown
  attribution_status?: unknown
  attribution_event_type?: unknown
  cause_role?: unknown
  attribution_subject_type?: unknown
  attribution_subject_id?: unknown
  confirmed_at?: unknown
  source_type?: unknown
  snapshot_attribution_id?: unknown
  snapshot_cause_code?: unknown
  snapshot_taxonomy_version?: unknown
  snapshot_event_type?: unknown
  snapshot_cause_role?: unknown
  snapshot_confirmed_at?: unknown
  snapshot_primary_count?: unknown
  included_in_benchmark?: unknown
  sample_strength?: unknown
  duration_day_basis?: unknown
  calendar_ref?: unknown
  calendar_version?: unknown
}

type FrozenCauseAttribution = {
  attributionId: string
  causeCode: string
  taxonomyVersion: string
  eventType: 'delay' | 'completion'
  causeRole: 'primary' | 'contributing' | 'transmitted'
  confirmedAt: string
}

type FrozenCauseSample = {
  sampleId: string
  taskId: string
  completedAt: string
  createdAt: string
  updatedAt: string
  evidenceFingerprint: string
  sourceLineage: unknown
  structuredCauseAttributions: FrozenCauseAttribution[]
}

type FrozenCauseEvidence = {
  evidenceContractHash: string
  sampleMutationLineage: FrozenCauseSample[]
  structuredCauseAttributionLineage: FrozenCauseAttribution[]
}

type CauseSegmentLineage = string[] | {
  schemaVersion: 'duration-benchmark-cause-segment-lineage/v2'
  evidenceContractHash: string
  samples: Array<{
    sampleId: string
    taskId: string
    evidenceFingerprint: string
    completedAt: string
    createdAt: string
    updatedAt: string
    attribution: FrozenCauseAttribution
  }>
}

type DurationBenchmarkCauseSegmentRow = {
  id?: unknown
  benchmark_id?: unknown
  company_id?: unknown
  project_id?: unknown
  cause_code?: unknown
  taxonomy_version?: unknown
  sample_count?: unknown
  p50_days?: unknown
  p75_days?: unknown
  p80_days?: unknown
  mean_days?: unknown
  variance?: unknown
  generated_at?: unknown
  source_window_start?: unknown
  source_as_of?: unknown
  duration_day_basis?: unknown
  calendar_ref?: unknown
  calendar_version?: unknown
  lineage?: unknown
}

const CONFIRMED_CAUSE_SAMPLE_SQL = `
  SELECT
    sample.id AS sample_id,
    attribution.id AS attribution_id,
    attribution.cause_code,
    attribution.taxonomy_version,
    sample.actual_duration_production_days,
    sample.company_id AS sample_company_id,
    sample.project_id AS sample_project_id,
    attribution.company_id AS attribution_company_id,
    attribution.project_id AS attribution_project_id,
    attribution.status AS attribution_status,
    attribution.event_type AS attribution_event_type,
    attribution.cause_role,
    attribution.confirmed_at,
    sample.source_type,
    confirmed_cause ->> 'attribution_id' AS snapshot_attribution_id,
    confirmed_cause ->> 'cause_code' AS snapshot_cause_code,
    confirmed_cause ->> 'taxonomy_version' AS snapshot_taxonomy_version,
    confirmed_cause ->> 'event_type' AS snapshot_event_type,
    confirmed_cause ->> 'confirmed_at' AS snapshot_confirmed_at,
    (
      SELECT COUNT(*)
      FROM jsonb_array_elements(
        CASE
          WHEN jsonb_typeof(sample.metadata -> 'structured_cause_snapshot' -> 'confirmed_causes') = 'array'
            THEN sample.metadata -> 'structured_cause_snapshot' -> 'confirmed_causes'
          ELSE '[]'::jsonb
        END
      ) snapshot_cause
      WHERE snapshot_cause ->> 'cause_role' = 'primary'
    ) AS snapshot_primary_count,
    sample.included_in_benchmark,
    sample.sample_strength,
    sample.duration_day_basis,
    sample.metadata ->> 'construction_calendar_ref' AS calendar_ref,
    sample.metadata ->> 'construction_calendar_version' AS calendar_version
  FROM public.duration_experience_samples sample
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE
      WHEN jsonb_typeof(sample.metadata -> 'structured_cause_snapshot' -> 'confirmed_causes') = 'array'
        THEN sample.metadata -> 'structured_cause_snapshot' -> 'confirmed_causes'
      ELSE '[]'::jsonb
    END
  ) confirmed_cause
  INNER JOIN public.structured_cause_attributions attribution
    ON confirmed_cause ->> 'attribution_id' = attribution.id::text
   AND confirmed_cause ->> 'cause_code' = attribution.cause_code
   AND confirmed_cause ->> 'taxonomy_version' = attribution.taxonomy_version
   AND confirmed_cause ->> 'event_type' = attribution.event_type
   AND (confirmed_cause ->> 'confirmed_at')::timestamptz = attribution.confirmed_at
   AND confirmed_cause ->> 'cause_role' = 'primary'
   AND attribution.subject_type = 'task'
   AND attribution.subject_id = sample.task_id::text
   AND attribution.company_id IS NOT DISTINCT FROM sample.company_id
   AND attribution.project_id IS NOT DISTINCT FROM sample.project_id
  WHERE sample.company_id IS NOT DISTINCT FROM $1::uuid
    AND sample.project_id IS NOT DISTINCT FROM $2::uuid
    AND COALESCE(
      sample.metadata ->> 'benchmark_key',
      CONCAT_WS(
        ':',
        COALESCE(sample.template_node_id::text, sample.standard_work_code, sample.engineering_category_id::text, 'all'),
        sample.wbs_node_type,
        COALESCE(sample.metadata ->> 'benchmark_context_key', 'all')
      )
    ) = $3
    AND sample.completed_at <= $4::timestamptz
    AND sample.source_type = 'task_completion'
    AND sample.sample_status = 'active'
    AND sample.included_in_benchmark = TRUE
    AND COALESCE(sample.sample_strength, '') NOT IN ('weak', 'unusable')
    AND sample.duration_day_basis = 'construction_production_day'
    AND sample.actual_duration_production_days > 0
    AND attribution.status = 'confirmed'
    AND attribution.event_type IN ('delay', 'completion')
    AND attribution.cause_role = 'primary'
    AND attribution.confirmed_at <= $4::timestamptz
    AND attribution.cause_code = ANY($5::text[])
    AND sample.metadata ->> 'construction_calendar_ref' = $6
    AND sample.metadata ->> 'construction_calendar_version' = $7
    AND ($8::timestamptz IS NULL OR sample.completed_at >= $8::timestamptz)
    AND (
      SELECT COUNT(*)
      FROM jsonb_array_elements(
        CASE
          WHEN jsonb_typeof(sample.metadata -> 'structured_cause_snapshot' -> 'confirmed_causes') = 'array'
            THEN sample.metadata -> 'structured_cause_snapshot' -> 'confirmed_causes'
          ELSE '[]'::jsonb
        END
      ) snapshot_cause
      WHERE snapshot_cause ->> 'cause_role' = 'primary'
    ) = 1
  ORDER BY attribution.cause_code, sample.id
`

const FROZEN_CAUSE_SAMPLE_SQL = `
  SELECT
    sample.id AS sample_id,
    sample.task_id AS sample_task_id,
    sample.completed_at AS sample_completed_at,
    sample.created_at AS sample_created_at,
    sample.updated_at AS sample_updated_at,
    sample.evidence_fingerprint AS sample_evidence_fingerprint,
    sample.source_lineage AS sample_source_lineage,
    attribution.id AS attribution_id,
    attribution.cause_code,
    attribution.taxonomy_version,
    sample.actual_duration_production_days,
    sample.company_id AS sample_company_id,
    sample.project_id AS sample_project_id,
    attribution.company_id AS attribution_company_id,
    attribution.project_id AS attribution_project_id,
    attribution.status AS attribution_status,
    attribution.event_type AS attribution_event_type,
    attribution.cause_role,
    attribution.subject_type AS attribution_subject_type,
    attribution.subject_id AS attribution_subject_id,
    attribution.confirmed_at,
    sample.source_type,
    confirmed_cause ->> 'attribution_id' AS snapshot_attribution_id,
    confirmed_cause ->> 'cause_code' AS snapshot_cause_code,
    confirmed_cause ->> 'taxonomy_version' AS snapshot_taxonomy_version,
    confirmed_cause ->> 'event_type' AS snapshot_event_type,
    confirmed_cause ->> 'cause_role' AS snapshot_cause_role,
    confirmed_cause ->> 'confirmed_at' AS snapshot_confirmed_at,
    (
      SELECT COUNT(*)
      FROM jsonb_array_elements(
        CASE
          WHEN jsonb_typeof(sample.metadata -> 'structured_cause_snapshot' -> 'confirmed_causes') = 'array'
            THEN sample.metadata -> 'structured_cause_snapshot' -> 'confirmed_causes'
          ELSE '[]'::jsonb
        END
      ) snapshot_cause
      WHERE snapshot_cause ->> 'cause_role' = 'primary'
    ) AS snapshot_primary_count,
    sample.included_in_benchmark,
    sample.sample_strength,
    sample.duration_day_basis,
    sample.metadata ->> 'construction_calendar_ref' AS calendar_ref,
    sample.metadata ->> 'construction_calendar_version' AS calendar_version
  FROM public.duration_experience_samples sample
  LEFT JOIN LATERAL jsonb_array_elements(
    CASE
      WHEN jsonb_typeof(sample.metadata -> 'structured_cause_snapshot' -> 'confirmed_causes') = 'array'
        THEN sample.metadata -> 'structured_cause_snapshot' -> 'confirmed_causes'
      ELSE '[]'::jsonb
    END
  ) confirmed_cause ON TRUE
  LEFT JOIN public.structured_cause_attributions attribution
    ON confirmed_cause ->> 'attribution_id' = attribution.id::text
   AND attribution.subject_type = 'task'
   AND attribution.subject_id = sample.task_id::text
   AND attribution.company_id IS NOT DISTINCT FROM sample.company_id
   AND attribution.project_id IS NOT DISTINCT FROM sample.project_id
  WHERE sample.id = ANY($1::uuid[])
    AND sample.company_id IS NOT DISTINCT FROM $2::uuid
    AND sample.project_id IS NOT DISTINCT FROM $3::uuid
    AND COALESCE(
      sample.metadata ->> 'benchmark_key',
      CONCAT_WS(
        ':',
        COALESCE(sample.template_node_id::text, sample.standard_work_code, sample.engineering_category_id::text, 'all'),
        sample.wbs_node_type,
        COALESCE(sample.metadata ->> 'benchmark_context_key', 'all')
      )
    ) = $4
    AND sample.completed_at <= $5::timestamptz
    AND sample.source_type = 'task_completion'
    AND sample.sample_status = 'active'
    AND sample.included_in_benchmark = TRUE
    AND COALESCE(sample.sample_strength, '') NOT IN ('weak', 'unusable')
    AND sample.duration_day_basis = 'construction_production_day'
    AND sample.actual_duration_production_days > 0
    AND sample.metadata ->> 'construction_calendar_ref' = $6
    AND sample.metadata ->> 'construction_calendar_version' = $7
    AND ($8::timestamptz IS NULL OR sample.completed_at >= $8::timestamptz)
  ORDER BY sample.id, attribution.id NULLS FIRST
`

const LOAD_CURRENT_CAUSE_SEGMENT_SQL = `
  SELECT
    id,
    benchmark_id,
    company_id,
    project_id,
    cause_code,
    taxonomy_version,
    sample_count,
    p50_days,
    p75_days,
    p80_days,
    mean_days,
    variance,
    generated_at,
    source_window_start,
    source_as_of,
    duration_day_basis,
    calendar_ref,
    calendar_version
  FROM public.duration_benchmark_cause_segments
  WHERE benchmark_id = $1::uuid
    AND cause_code = $2
    AND company_id IS NOT DISTINCT FROM $3::uuid
    AND project_id IS NOT DISTINCT FROM $4::uuid
    AND duration_day_basis = 'construction_production_day'
    AND is_current = TRUE
  ORDER BY generated_at DESC, id DESC
  LIMIT 1
`

function text(value: unknown) {
  return String(value ?? '').trim()
}

function nullableText(value: unknown) {
  return text(value) || null
}

function finiteNumber(value: unknown) {
  if (value === null || value === undefined || value === '') return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function positiveNumber(value: unknown) {
  const number = finiteNumber(value)
  return number !== null && number > 0 ? number : null
}

function timestamp(value: unknown) {
  if (value instanceof Date) return value.toISOString()
  return text(value)
}

function nullableTimestamp(value: unknown) {
  return value === null || value === undefined || value === '' ? null : timestamp(value)
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function canonicalValue(value: unknown): unknown {
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.toISOString() : null
  if (Array.isArray(value)) return value.map(canonicalValue)
  if (!value || typeof value !== 'object') return value ?? null
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, canonicalValue(entry)]),
  )
}

function canonicalJson(value: unknown) {
  return JSON.stringify(canonicalValue(value))
}

function requiredTimestamp(value: unknown, fieldName: string) {
  const normalized = timestamp(value)
  if (!normalized || !Number.isFinite(Date.parse(normalized))) {
    throw new Error(`Malformed frozen cause segment ${fieldName}`)
  }
  return normalized
}

function parseFrozenAttribution(value: unknown, fieldName: string): FrozenCauseAttribution {
  const source = readRecord(value)
  const attributionId = text(source.attributionId)
  const causeCode = text(source.causeCode)
  const taxonomyVersion = text(source.taxonomyVersion)
  const eventType = text(source.eventType)
  const causeRole = text(source.causeRole)
  if (
    !attributionId
    || !causeCode
    || !taxonomyVersion
    || !['delay', 'completion'].includes(eventType)
    || !['primary', 'contributing', 'transmitted'].includes(causeRole)
  ) {
    throw new Error(`Malformed frozen cause segment ${fieldName}`)
  }
  return {
    attributionId,
    causeCode,
    taxonomyVersion,
    eventType: eventType as FrozenCauseAttribution['eventType'],
    causeRole: causeRole as FrozenCauseAttribution['causeRole'],
    confirmedAt: requiredTimestamp(source.confirmedAt, `${fieldName}.confirmedAt`),
  }
}

function sortedFrozenAttributions(values: readonly FrozenCauseAttribution[]) {
  return [...values].sort((left, right) => canonicalJson(left).localeCompare(canonicalJson(right)))
}

function assertUniqueAttributionIds(values: readonly FrozenCauseAttribution[], fieldName: string) {
  const ids = new Set<string>()
  for (const value of values) {
    if (ids.has(value.attributionId)) {
      throw new Error(`Duplicate frozen cause segment attribution in ${fieldName}`)
    }
    ids.add(value.attributionId)
  }
}

function parseFrozenEvidence(input: unknown): FrozenCauseEvidence {
  const source = readRecord(input)
  const evidenceContractHash = text(source.evidenceContractHash)
  if (!/^[0-9a-f]{64}$/i.test(evidenceContractHash)) {
    throw new Error('Malformed frozen cause segment evidence contract hash')
  }
  if (!Array.isArray(source.sampleMutationLineage) || !Array.isArray(source.structuredCauseAttributionLineage)) {
    throw new Error('Malformed frozen cause segment lineage')
  }

  const sampleIds = new Set<string>()
  const nestedAttributions: FrozenCauseAttribution[] = []
  const sampleMutationLineage = source.sampleMutationLineage.map((value, index): FrozenCauseSample => {
    const sample = readRecord(value)
    const sampleId = text(sample.sampleId)
    const taskId = text(sample.taskId)
    const evidenceFingerprint = text(sample.evidenceFingerprint)
    if (
      !sampleId
      || !taskId
      || !evidenceFingerprint
      || !Object.prototype.hasOwnProperty.call(sample, 'sourceLineage')
      || !Array.isArray(sample.structuredCauseAttributions)
    ) {
      throw new Error(`Malformed frozen cause segment sample lineage at index ${index}`)
    }
    if (sampleIds.has(sampleId)) throw new Error(`Duplicate frozen cause segment sample ${sampleId}`)
    sampleIds.add(sampleId)
    const structuredCauseAttributions = sample.structuredCauseAttributions
      .map((attribution, attributionIndex) => parseFrozenAttribution(
        attribution,
        `sampleMutationLineage[${index}].structuredCauseAttributions[${attributionIndex}]`,
      ))
    assertUniqueAttributionIds(structuredCauseAttributions, `sampleMutationLineage[${index}]`)
    if (structuredCauseAttributions.filter((attribution) => attribution.causeRole === 'primary').length > 1) {
      throw new Error(`Malformed frozen cause segment primary attribution set for sample ${sampleId}`)
    }
    nestedAttributions.push(...structuredCauseAttributions)
    return {
      sampleId,
      taskId,
      completedAt: requiredTimestamp(sample.completedAt, `sampleMutationLineage[${index}].completedAt`),
      createdAt: requiredTimestamp(sample.createdAt, `sampleMutationLineage[${index}].createdAt`),
      updatedAt: requiredTimestamp(sample.updatedAt, `sampleMutationLineage[${index}].updatedAt`),
      evidenceFingerprint,
      sourceLineage: canonicalValue(sample.sourceLineage),
      structuredCauseAttributions: sortedFrozenAttributions(structuredCauseAttributions),
    }
  })
  if (sampleMutationLineage.length === 0) throw new Error('Frozen cause segment sample lineage is required')

  assertUniqueAttributionIds(nestedAttributions, 'sampleMutationLineage')
  const structuredCauseAttributionLineage = source.structuredCauseAttributionLineage
    .map((value, index) => parseFrozenAttribution(value, `structuredCauseAttributionLineage[${index}]`))
  assertUniqueAttributionIds(structuredCauseAttributionLineage, 'structuredCauseAttributionLineage')
  if (
    canonicalJson(sortedFrozenAttributions(nestedAttributions))
    !== canonicalJson(sortedFrozenAttributions(structuredCauseAttributionLineage))
  ) {
    throw new Error('Frozen cause segment attribution lineage mismatch')
  }

  return {
    evidenceContractHash,
    sampleMutationLineage,
    structuredCauseAttributionLineage: sortedFrozenAttributions(structuredCauseAttributionLineage),
  }
}

function percentile(sorted: readonly number[], quantile: number) {
  if (sorted.length === 0) return null
  const position = (sorted.length - 1) * quantile
  const lowerIndex = Math.floor(position)
  const upperIndex = Math.ceil(position)
  const lower = sorted[lowerIndex]
  const upper = sorted[upperIndex]
  return Math.round(lower + (upper - lower) * (position - lowerIndex))
}

function sameNullableText(left: unknown, right: string | null) {
  return nullableText(left) === right
}

function isTimestampAtOrBefore(value: unknown, upperBound: string) {
  const timestampValue = Date.parse(timestamp(value))
  const upperBoundValue = Date.parse(upperBound)
  return Number.isFinite(timestampValue)
    && Number.isFinite(upperBoundValue)
    && timestampValue <= upperBoundValue
}

function isSameTimestamp(left: unknown, right: unknown) {
  const leftValue = Date.parse(timestamp(left))
  const rightValue = Date.parse(timestamp(right))
  return Number.isFinite(leftValue) && leftValue === rightValue
}

function isCompatibleSample(row: ConfirmedCauseSampleRow, input: PersistCurrentCauseSegmentsInput) {
  const causeCode = text(row.cause_code)
  const taxonomyVersion = text(row.taxonomy_version)
  return isStructuredCauseCode(causeCode)
    && Boolean(text(row.sample_id))
    && Boolean(text(row.attribution_id))
    && taxonomyVersion === STRUCTURED_CAUSE_TAXONOMY_VERSION
    && text(row.attribution_status) === 'confirmed'
    && ['delay', 'completion'].includes(text(row.attribution_event_type))
    && text(row.cause_role) === 'primary'
    && text(row.source_type) === 'task_completion'
    && isTimestampAtOrBefore(row.confirmed_at, input.sourceAsOf)
    && Number(row.snapshot_primary_count) === 1
    && text(row.snapshot_attribution_id) === text(row.attribution_id)
    && text(row.snapshot_cause_code) === causeCode
    && text(row.snapshot_taxonomy_version) === taxonomyVersion
    && text(row.snapshot_event_type) === text(row.attribution_event_type)
    && isSameTimestamp(row.snapshot_confirmed_at, row.confirmed_at)
    && row.included_in_benchmark === true
    && !['weak', 'unusable'].includes(text(row.sample_strength))
    && text(row.duration_day_basis) === 'construction_production_day'
    && positiveNumber(row.actual_duration_production_days) !== null
    && sameNullableText(row.sample_company_id, input.companyId)
    && sameNullableText(row.sample_project_id, input.projectId)
    && sameNullableText(row.attribution_company_id, input.companyId)
    && sameNullableText(row.attribution_project_id, input.projectId)
    && text(row.calendar_ref) === input.calendarRef
    && text(row.calendar_version) === input.calendarVersion
}

function sameFrozenAttribution(left: FrozenCauseAttribution, right: FrozenCauseAttribution) {
  return left.attributionId === right.attributionId
    && left.causeCode === right.causeCode
    && left.taxonomyVersion === right.taxonomyVersion
    && left.eventType === right.eventType
    && left.causeRole === right.causeRole
    && isSameTimestamp(left.confirmedAt, right.confirmedAt)
}

function sameFrozenAttributionSets(
  left: readonly FrozenCauseAttribution[],
  right: readonly FrozenCauseAttribution[],
) {
  const leftSorted = [...left].sort((a, b) => a.attributionId.localeCompare(b.attributionId))
  const rightSorted = [...right].sort((a, b) => a.attributionId.localeCompare(b.attributionId))
  return leftSorted.length === rightSorted.length
    && leftSorted.every((value, index) => sameFrozenAttribution(value, rightSorted[index]))
}

function rowAttribution(row: ConfirmedCauseSampleRow, snapshot: boolean) {
  return parseFrozenAttribution(snapshot ? {
    attributionId: row.snapshot_attribution_id,
    causeCode: row.snapshot_cause_code,
    taxonomyVersion: row.snapshot_taxonomy_version,
    eventType: row.snapshot_event_type,
    causeRole: row.snapshot_cause_role,
    confirmedAt: row.snapshot_confirmed_at,
  } : {
    attributionId: row.attribution_id,
    causeCode: row.cause_code,
    taxonomyVersion: row.taxonomy_version,
    eventType: row.attribution_event_type,
    causeRole: row.cause_role,
    confirmedAt: row.confirmed_at,
  }, snapshot ? 'snapshot attribution' : 'persisted attribution')
}

function validateFrozenCauseEvidenceRows(
  rows: readonly ConfirmedCauseSampleRow[],
  input: PersistCurrentCauseSegmentsInput,
  frozenEvidence: FrozenCauseEvidence,
) {
  const frozenSamples = new Map(frozenEvidence.sampleMutationLineage.map((sample) => [sample.sampleId, sample]))
  const rowsBySample = new Map<string, ConfirmedCauseSampleRow[]>()
  const rowIdentities = new Set<string>()

  for (const row of rows) {
    const sampleId = text(row.sample_id)
    const frozenSample = frozenSamples.get(sampleId)
    if (!sampleId || !frozenSample) throw new Error('Frozen cause segment source sample set mismatch')
    const rowIdentity = `${sampleId}:${text(row.snapshot_attribution_id) || text(row.attribution_id) || '<none>'}`
    if (rowIdentities.has(rowIdentity)) throw new Error('Duplicate frozen cause segment source row')
    rowIdentities.add(rowIdentity)
    rowsBySample.set(sampleId, [...(rowsBySample.get(sampleId) ?? []), row])
  }

  if (rowsBySample.size !== frozenSamples.size) throw new Error('Frozen cause segment source sample set mismatch')

  for (const frozenSample of frozenEvidence.sampleMutationLineage) {
    const sampleRows = rowsBySample.get(frozenSample.sampleId)
    if (!sampleRows?.length) throw new Error('Frozen cause segment source sample set mismatch')
    const actualAttributions: FrozenCauseAttribution[] = []
    const expectedPrimaryCount = frozenSample.structuredCauseAttributions
      .filter((attribution) => attribution.causeRole === 'primary').length

    for (const row of sampleRows) {
      if (
        text(row.sample_task_id) !== frozenSample.taskId
        || !isSameTimestamp(row.sample_completed_at, frozenSample.completedAt)
        || !isSameTimestamp(row.sample_created_at, frozenSample.createdAt)
        || !isSameTimestamp(row.sample_updated_at, frozenSample.updatedAt)
        || text(row.sample_evidence_fingerprint) !== frozenSample.evidenceFingerprint
        || canonicalJson(row.sample_source_lineage) !== canonicalJson(frozenSample.sourceLineage)
        || !sameNullableText(row.sample_company_id, input.companyId)
        || !sameNullableText(row.sample_project_id, input.projectId)
        || text(row.source_type) !== 'task_completion'
        || row.included_in_benchmark !== true
        || ['weak', 'unusable'].includes(text(row.sample_strength))
        || text(row.duration_day_basis) !== 'construction_production_day'
        || positiveNumber(row.actual_duration_production_days) === null
        || text(row.calendar_ref) !== input.calendarRef
        || text(row.calendar_version) !== input.calendarVersion
        || Number(row.snapshot_primary_count) !== expectedPrimaryCount
      ) {
        throw new Error(`Frozen cause segment sample mutation mismatch for ${frozenSample.sampleId}`)
      }

      const hasPersistedAttribution = [
        row.attribution_id,
        row.cause_code,
        row.taxonomy_version,
        row.attribution_event_type,
        row.cause_role,
        row.confirmed_at,
      ].some((value) => Boolean(text(value)))
      const hasSnapshotAttribution = [
        row.snapshot_attribution_id,
        row.snapshot_cause_code,
        row.snapshot_taxonomy_version,
        row.snapshot_event_type,
        row.snapshot_cause_role,
        row.snapshot_confirmed_at,
      ].some((value) => Boolean(text(value)))
      if (!hasPersistedAttribution && !hasSnapshotAttribution) continue
      if (!hasPersistedAttribution || !hasSnapshotAttribution) {
        throw new Error(`Frozen cause segment attribution join mismatch for ${frozenSample.sampleId}`)
      }

      const persistedAttribution = rowAttribution(row, false)
      const snapshotAttribution = rowAttribution(row, true)
      if (
        !sameFrozenAttribution(persistedAttribution, snapshotAttribution)
        || text(row.attribution_status) !== 'confirmed'
        || text(row.attribution_subject_type) !== 'task'
        || text(row.attribution_subject_id) !== frozenSample.taskId
        || !sameNullableText(row.attribution_company_id, input.companyId)
        || !sameNullableText(row.attribution_project_id, input.projectId)
        || !isTimestampAtOrBefore(row.confirmed_at, input.sourceAsOf)
      ) {
        throw new Error(`Frozen cause segment attribution mutation mismatch for ${frozenSample.sampleId}`)
      }
      actualAttributions.push(persistedAttribution)
    }

    assertUniqueAttributionIds(actualAttributions, `source sample ${frozenSample.sampleId}`)
    if (!sameFrozenAttributionSets(actualAttributions, frozenSample.structuredCauseAttributions)) {
      throw new Error(`Frozen cause segment attribution set mismatch for ${frozenSample.sampleId}`)
    }
  }
}

function aggregateConfirmedCauseSamples(
  rows: readonly ConfirmedCauseSampleRow[],
  input: PersistCurrentCauseSegmentsInput,
  frozenEvidence?: FrozenCauseEvidence,
) {
  const observedTaxonomyVersions = [...new Set(rows.map((row) => text(row.taxonomy_version)).filter(Boolean))]
  if (observedTaxonomyVersions.length > 1) throw new Error('Mixed taxonomy versions for benchmark')
  if (observedTaxonomyVersions.some((version) => version !== STRUCTURED_CAUSE_TAXONOMY_VERSION)) {
    throw new Error('Unsupported taxonomy version for benchmark')
  }

  const compatibleRows = rows.filter((row) => isCompatibleSample(row, input))
  const taxonomyVersions = [...new Set(compatibleRows.map((row) => text(row.taxonomy_version)))]
  if (taxonomyVersions.length > 1) throw new Error('Mixed taxonomy versions for benchmark')

  const canonicalIdentityBySample = new Map<string, string>()
  for (const row of compatibleRows) {
    const sampleId = text(row.sample_id)
    const canonicalIdentity = [
      text(row.attribution_id),
      text(row.cause_code),
      text(row.taxonomy_version),
      text(row.attribution_event_type),
      timestamp(row.confirmed_at),
    ].join(':')
    const existingIdentity = canonicalIdentityBySample.get(sampleId)
    if (existingIdentity && existingIdentity !== canonicalIdentity) {
      throw new Error(`Sample ${sampleId} has multiple canonical attribution identities`)
    }
    canonicalIdentityBySample.set(sampleId, canonicalIdentity)
  }

  const groups = new Map<StructuredCauseCode, ConfirmedCauseSampleRow[]>()
  const seenSamples = new Set<string>()
  for (const row of compatibleRows) {
    const causeCode = text(row.cause_code) as StructuredCauseCode
    const dedupeKey = `${text(row.sample_id)}:${text(row.attribution_id)}`
    if (seenSamples.has(dedupeKey)) continue
    seenSamples.add(dedupeKey)
    groups.set(causeCode, [...(groups.get(causeCode) ?? []), row])
  }

  return [...groups.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([causeCode, samples]): DurationBenchmarkCauseSegment & { lineage: CauseSegmentLineage } => {
      const durations = samples
        .map((sample) => positiveNumber(sample.actual_duration_production_days))
        .filter((value): value is number => value !== null)
        .sort((left, right) => left - right)
      const mean = durations.reduce((sum, value) => sum + value, 0) / durations.length
      const variance = durations.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / durations.length
      return {
        id: '',
        benchmarkId: input.benchmarkId,
        companyId: input.companyId,
        projectId: input.projectId,
        causeCode,
        taxonomyVersion: taxonomyVersions[0],
        sampleCount: durations.length,
        p50Days: percentile(durations, 0.5),
        p75Days: percentile(durations, 0.75),
        p80Days: percentile(durations, 0.8),
        meanDays: Math.round(mean * 1000) / 1000,
        variance: Math.round(variance * 1000) / 1000,
        generatedAt: input.generatedAt,
        sourceWindowStart: input.sourceWindowStart,
        sourceAsOf: input.sourceAsOf,
        durationDayBasis: 'construction_production_day',
        calendarRef: input.calendarRef,
        calendarVersion: input.calendarVersion,
        lineage: frozenEvidence
          ? {
              schemaVersion: 'duration-benchmark-cause-segment-lineage/v2' as const,
              evidenceContractHash: frozenEvidence.evidenceContractHash,
              samples: samples.map((sample) => {
                const sampleId = text(sample.sample_id)
                const frozenSample = frozenEvidence.sampleMutationLineage
                  .find((candidate) => candidate.sampleId === sampleId)
                const attributionId = text(sample.attribution_id)
                const attribution = frozenSample?.structuredCauseAttributions
                  .find((candidate) => candidate.attributionId === attributionId)
                if (!frozenSample || !attribution) {
                  throw new Error('Frozen cause segment lineage assembly mismatch')
                }
                return {
                  sampleId,
                  taskId: frozenSample.taskId,
                  evidenceFingerprint: frozenSample.evidenceFingerprint,
                  completedAt: frozenSample.completedAt,
                  createdAt: frozenSample.createdAt,
                  updatedAt: frozenSample.updatedAt,
                  attribution,
                }
              }).sort((left, right) => left.sampleId.localeCompare(right.sampleId)),
            }
          : samples.map((sample) => text(sample.sample_id)).filter(Boolean),
      }
    })
}

function mapSegmentRow(row: DurationBenchmarkCauseSegmentRow): DurationBenchmarkCauseSegment | null {
  const causeCode = text(row.cause_code)
  const durationDayBasis = text(row.duration_day_basis)
  const sampleCount = positiveNumber(row.sample_count)
  if (
    !text(row.id)
    || !text(row.benchmark_id)
    || !isStructuredCauseCode(causeCode)
    || durationDayBasis !== 'construction_production_day'
    || !sampleCount
    || !text(row.taxonomy_version)
    || !timestamp(row.generated_at)
    || !timestamp(row.source_as_of)
    || !text(row.calendar_ref)
    || !text(row.calendar_version)
  ) return null
  return {
    id: text(row.id),
    benchmarkId: text(row.benchmark_id),
    companyId: nullableText(row.company_id),
    projectId: nullableText(row.project_id),
    causeCode,
    taxonomyVersion: text(row.taxonomy_version),
    sampleCount,
    p50Days: positiveNumber(row.p50_days),
    p75Days: positiveNumber(row.p75_days),
    p80Days: positiveNumber(row.p80_days),
    meanDays: positiveNumber(row.mean_days),
    variance: finiteNumber(row.variance),
    generatedAt: timestamp(row.generated_at),
    sourceWindowStart: nullableTimestamp(row.source_window_start),
    sourceAsOf: timestamp(row.source_as_of),
    durationDayBasis: 'construction_production_day',
    calendarRef: text(row.calendar_ref),
    calendarVersion: text(row.calendar_version),
  }
}

function nullableNumbersMatch(left: number | null, right: number | null) {
  if (left === null || right === null) return left === right
  return Math.abs(left - right) < 0.000001
}

function nullableFloat4NumbersMatch(left: number | null, right: number | null) {
  if (left === null || right === null) return left === right
  return Math.fround(left) === Math.fround(right)
}

function isPersistedSegmentReadback(
  persisted: DurationBenchmarkCauseSegment,
  expected: DurationBenchmarkCauseSegment,
) {
  return persisted.benchmarkId === expected.benchmarkId
    && persisted.companyId === expected.companyId
    && persisted.projectId === expected.projectId
    && persisted.causeCode === expected.causeCode
    && persisted.taxonomyVersion === expected.taxonomyVersion
    && persisted.sampleCount === expected.sampleCount
    && nullableNumbersMatch(persisted.p50Days, expected.p50Days)
    && nullableNumbersMatch(persisted.p75Days, expected.p75Days)
    && nullableNumbersMatch(persisted.p80Days, expected.p80Days)
    && nullableFloat4NumbersMatch(persisted.meanDays, expected.meanDays)
    && nullableFloat4NumbersMatch(persisted.variance, expected.variance)
    && persisted.generatedAt === expected.generatedAt
    && persisted.sourceWindowStart === expected.sourceWindowStart
    && persisted.sourceAsOf === expected.sourceAsOf
    && persisted.durationDayBasis === expected.durationDayBasis
    && persisted.calendarRef === expected.calendarRef
    && persisted.calendarVersion === expected.calendarVersion
}

function isPersistedLineageReadback(value: unknown, expected: CauseSegmentLineage) {
  return canonicalJson(value) === canonicalJson(expected)
}

async function replaceCurrentCauseSegments(
  client: PoolClient,
  input: PersistCurrentCauseSegmentsInput,
  segments: Array<DurationBenchmarkCauseSegment & { lineage: CauseSegmentLineage }>,
) {
  await client.query(
    `UPDATE public.duration_benchmark_cause_segments
        SET is_current = FALSE,
            updated_at = $4::timestamptz
      WHERE benchmark_id = $1::uuid
        AND company_id IS NOT DISTINCT FROM $2::uuid
        AND project_id IS NOT DISTINCT FROM $3::uuid
        AND is_current = TRUE`,
    [input.benchmarkId, input.companyId, input.projectId, input.generatedAt],
  )

  const persisted: DurationBenchmarkCauseSegment[] = []
  for (const segment of segments) {
    const result = await client.query<DurationBenchmarkCauseSegmentRow>(
      `INSERT INTO public.duration_benchmark_cause_segments (
         benchmark_id, company_id, project_id, cause_code, taxonomy_version,
         sample_count, p50_days, p75_days, p80_days, mean_days, variance,
         generated_at, source_window_start, source_as_of, duration_day_basis,
         calendar_ref, calendar_version, lineage, is_current
       ) VALUES (
         $1::uuid, $2::uuid, $3::uuid, $4, $5,
         $6, $7, $8, $9, $10, $11,
         $12::timestamptz, $13::timestamptz, $14::timestamptz,
         'construction_production_day', $15, $16, $17::jsonb, TRUE
       )
       RETURNING *`,
      [
        segment.benchmarkId,
        segment.companyId,
        segment.projectId,
        segment.causeCode,
        segment.taxonomyVersion,
        segment.sampleCount,
        segment.p50Days,
        segment.p75Days,
        segment.p80Days,
        segment.meanDays,
        segment.variance,
        segment.generatedAt,
        segment.sourceWindowStart,
        segment.sourceAsOf,
        segment.calendarRef,
        segment.calendarVersion,
        JSON.stringify(segment.lineage),
      ],
    )
    if (result.rows.length !== 1) {
      throw new Error('cause segment INSERT must return exactly one row')
    }
    const persistedSegment = mapSegmentRow(result.rows[0])
    if (
      !persistedSegment
      || !isPersistedSegmentReadback(persistedSegment, segment)
      || !isPersistedLineageReadback(result.rows[0].lineage, segment.lineage)
    ) {
      throw new Error('cause segment INSERT readback mismatch')
    }
    persisted.push(persistedSegment)
  }
  return persisted
}

export async function persistCurrentCauseSegments(
  input: PersistCurrentCauseSegmentsInput,
  client: PoolClient,
): Promise<DurationBenchmarkCauseSegment[]> {
  const frozenEvidence = input.frozenEvidence === undefined
    ? undefined
    : parseFrozenEvidence(input.frozenEvidence)
  const rows = frozenEvidence
    ? await client.query<ConfirmedCauseSampleRow>(FROZEN_CAUSE_SAMPLE_SQL, [
        frozenEvidence.sampleMutationLineage.map((sample) => sample.sampleId),
        input.companyId,
        input.projectId,
        input.benchmarkKey,
        input.sourceAsOf,
        input.calendarRef,
        input.calendarVersion,
        input.sourceWindowStart,
      ])
    : await client.query<ConfirmedCauseSampleRow>(CONFIRMED_CAUSE_SAMPLE_SQL, [
        input.companyId,
        input.projectId,
        input.benchmarkKey,
        input.sourceAsOf,
        [...CANONICAL_STRUCTURED_CAUSE_CODES],
        input.calendarRef,
        input.calendarVersion,
        input.sourceWindowStart,
      ])
  if (frozenEvidence) validateFrozenCauseEvidenceRows(rows.rows, input, frozenEvidence)
  const segments = aggregateConfirmedCauseSamples(rows.rows, input, frozenEvidence)
  return replaceCurrentCauseSegments(client, input, segments)
}

export async function loadCurrentCauseSegment(
  input: {
    benchmarkId: string
    causeCode: StructuredCauseCode
    companyId: string | null
    projectId: string | null
  },
  queryExec: DurationBenchmarkCauseSegmentQueryExec,
): Promise<DurationBenchmarkCauseSegment | null> {
  const rows = await queryExec<DurationBenchmarkCauseSegmentRow>(LOAD_CURRENT_CAUSE_SEGMENT_SQL, [
    input.benchmarkId,
    input.causeCode,
    input.companyId,
    input.projectId,
  ])
  if (rows.length === 0) return null
  if (rows.length !== 1) throw new Error('cause segment readback mismatch')
  const segment = mapSegmentRow(rows[0])
  if (!segment || segment.taxonomyVersion !== STRUCTURED_CAUSE_TAXONOMY_VERSION) {
    throw new Error('cause segment readback mismatch')
  }
  if (
    segment.benchmarkId !== input.benchmarkId
    || segment.causeCode !== input.causeCode
    || segment.companyId !== input.companyId
    || segment.projectId !== input.projectId
  ) throw new Error('cause segment readback mismatch')
  return segment
}
