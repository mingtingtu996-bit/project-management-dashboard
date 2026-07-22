import type { PoolClient } from 'pg'

import {
  CANONICAL_STRUCTURED_CAUSE_CODES,
  isStructuredCauseCode,
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
}

export type DurationBenchmarkCauseSegmentQueryExec = <T = Record<string, unknown>>(
  sql: string,
  params?: unknown[],
) => Promise<T[]>

type ConfirmedCauseSampleRow = {
  sample_id?: unknown
  attribution_id?: unknown
  cause_code?: unknown
  taxonomy_version?: unknown
  actual_duration_production_days?: unknown
  sample_company_id?: unknown
  sample_project_id?: unknown
  attribution_company_id?: unknown
  attribution_project_id?: unknown
  attribution_status?: unknown
  included_in_benchmark?: unknown
  sample_strength?: unknown
  duration_day_basis?: unknown
  calendar_ref?: unknown
  calendar_version?: unknown
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
    sample.included_in_benchmark,
    sample.sample_strength,
    sample.duration_day_basis,
    sample.metadata ->> 'construction_calendar_ref' AS calendar_ref,
    sample.metadata ->> 'construction_calendar_version' AS calendar_version
  FROM public.duration_experience_samples sample
  INNER JOIN public.structured_cause_attributions attribution
    ON attribution.subject_type = 'task'
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
    AND sample.sample_status = 'active'
    AND sample.included_in_benchmark = TRUE
    AND COALESCE(sample.sample_strength, '') NOT IN ('weak', 'unusable')
    AND sample.duration_day_basis = 'construction_production_day'
    AND sample.actual_duration_production_days > 0
    AND attribution.status = 'confirmed'
    AND attribution.cause_code = ANY($5::text[])
    AND sample.metadata ->> 'construction_calendar_ref' = $6
    AND sample.metadata ->> 'construction_calendar_version' = $7
    AND ($8::timestamptz IS NULL OR sample.completed_at >= $8::timestamptz)
  ORDER BY attribution.cause_code, sample.id
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

function isCompatibleSample(row: ConfirmedCauseSampleRow, input: PersistCurrentCauseSegmentsInput) {
  const causeCode = text(row.cause_code)
  return isStructuredCauseCode(causeCode)
    && text(row.attribution_status) === 'confirmed'
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

function aggregateConfirmedCauseSamples(
  rows: readonly ConfirmedCauseSampleRow[],
  input: PersistCurrentCauseSegmentsInput,
) {
  const groups = new Map<StructuredCauseCode, ConfirmedCauseSampleRow[]>()
  const seenSamples = new Set<string>()
  for (const row of rows) {
    if (!isCompatibleSample(row, input)) continue
    const causeCode = text(row.cause_code) as StructuredCauseCode
    const sampleIdentity = text(row.sample_id) || text(row.attribution_id)
    const dedupeKey = `${causeCode}:${sampleIdentity}`
    if (seenSamples.has(dedupeKey)) continue
    seenSamples.add(dedupeKey)
    groups.set(causeCode, [...(groups.get(causeCode) ?? []), row])
  }

  return [...groups.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([causeCode, samples]): DurationBenchmarkCauseSegment & { lineage: string[] } => {
      const durations = samples
        .map((sample) => positiveNumber(sample.actual_duration_production_days))
        .filter((value): value is number => value !== null)
        .sort((left, right) => left - right)
      const mean = durations.reduce((sum, value) => sum + value, 0) / durations.length
      const variance = durations.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / durations.length
      const taxonomyVersions = [...new Set(samples.map((sample) => text(sample.taxonomy_version)).filter(Boolean))]
      if (taxonomyVersions.length !== 1) throw new Error(`Mixed taxonomy versions for cause segment ${causeCode}`)

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
        lineage: samples.map((sample) => text(sample.sample_id)).filter(Boolean),
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

async function replaceCurrentCauseSegments(
  client: PoolClient,
  input: PersistCurrentCauseSegmentsInput,
  segments: Array<DurationBenchmarkCauseSegment & { lineage: string[] }>,
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
    const { lineage: _lineage, ...unpersistedSegment } = segment
    persisted.push(mapSegmentRow(result.rows[0] ?? {}) ?? unpersistedSegment)
  }
  return persisted
}

export async function persistCurrentCauseSegments(
  input: PersistCurrentCauseSegmentsInput,
  client: PoolClient,
): Promise<DurationBenchmarkCauseSegment[]> {
  const rows = await client.query<ConfirmedCauseSampleRow>(CONFIRMED_CAUSE_SAMPLE_SQL, [
    input.companyId,
    input.projectId,
    input.benchmarkKey,
    input.sourceAsOf,
    [...CANONICAL_STRUCTURED_CAUSE_CODES],
    input.calendarRef,
    input.calendarVersion,
    input.sourceWindowStart,
  ])
  const segments = aggregateConfirmedCauseSamples(rows.rows, input)
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
  const segment = mapSegmentRow(rows[0] ?? {})
  if (!segment) return null
  if (
    segment.benchmarkId !== input.benchmarkId
    || segment.causeCode !== input.causeCode
    || segment.companyId !== input.companyId
    || segment.projectId !== input.projectId
  ) return null
  return segment
}
