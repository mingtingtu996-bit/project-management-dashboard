import type { PoolClient } from 'pg'

import { getClient } from '../database.js'
import { persistCurrentCauseSegments } from './durationBenchmarkCauseSegmentService.js'
import { promoteDurationLearningRuntimeCanary } from './durationLearningRuntimePublicationService.js'

type PersistenceRow = Record<string, unknown>

const DURATION_BENCHMARK_COLUMNS = [
  'company_id',
  'project_id',
  'benchmark_key',
  'benchmark_version',
  'template_node_id',
  'engineering_category_id',
  'project_context',
  'wbs_node_type',
  'sample_count',
  'duration_day_basis',
  'p50_days',
  'p75_days',
  'p80_days',
  'mean_days',
  'variance',
  'coefficient_of_variation',
  'confidence_level',
  'confidence_score',
  'is_current',
  'is_active',
  'duration_calibration_source',
  'metadata',
  'generated_at',
  'source_window_start',
  'source_as_of',
  'created_at',
  'updated_at',
] as const

const PROJECT_PRODUCTIVITY_CALIBRATION_COLUMNS = [
  'company_id',
  'project_id',
  'calibration_key',
  'status',
  'action_policy',
  'window_start_date',
  'window_end_date',
  'window_days',
  'sample_count',
  'snapshot_count',
  'maturity_days',
  'base_productivity',
  'observed_productivity',
  'adjusted_productivity',
  'bias_before',
  'bias_after',
  'mae_before',
  'mae_after',
  'overcompensation_rate',
  'recommended_cap',
  'recommended_min_uplift',
  'parameter_payload',
  'evidence_summary',
  'published_at',
  'created_at',
  'updated_at',
] as const

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

function normalizeTimestamp(value: unknown) {
  return value instanceof Date ? value.toISOString() : normalizeText(value)
}

function requireText(value: unknown, fieldName: string) {
  const text = normalizeText(value)
  if (!text) throw new Error(`${fieldName} is required`)
  return text
}

async function insertAllowedRow(
  client: PoolClient,
  tableName: 'duration_benchmarks' | 'project_productivity_compensation_calibrations',
  allowedColumns: readonly string[],
  row: PersistenceRow,
) {
  const columns = allowedColumns.filter((column) => Object.prototype.hasOwnProperty.call(row, column))
  if (columns.length === 0) throw new Error(`No supported columns supplied for ${tableName}`)
  const placeholders = columns.map((_, index) => `$${index + 1}`)
  const result = await client.query<PersistenceRow>(
    `insert into public.${tableName} (${columns.join(', ')})
     values (${placeholders.join(', ')})
     returning *`,
    columns.map((column) => row[column]),
  )
  const inserted = result.rows[0]
  if (!inserted) throw new Error(`Failed to insert ${tableName} row`)
  return inserted
}

async function updateAllowedRow(
  client: PoolClient,
  tableName: 'duration_benchmarks' | 'project_productivity_compensation_calibrations',
  allowedColumns: readonly string[],
  rowId: string,
  row: PersistenceRow,
) {
  const columns = allowedColumns.filter((column) => (
    column !== 'company_id'
    && Object.prototype.hasOwnProperty.call(row, column)
  ))
  if (columns.length === 0) throw new Error(`No supported columns supplied for ${tableName}`)
  const assignments = columns.map((column, index) => `${column} = $${index + 1}`)
  const result = await client.query<PersistenceRow>(
    `update public.${tableName}
        set ${assignments.join(', ')}
      where id = $${columns.length + 1}::uuid
      returning *`,
    [...columns.map((column) => row[column]), rowId],
  )
  const updated = result.rows[0]
  if (!updated) throw new Error(`Failed to update ${tableName} row`)
  return updated
}

async function withTransaction<T>(operation: (client: PoolClient) => Promise<T>) {
  const client = await getClient()
  let transactionStarted = false
  try {
    await client.query('BEGIN')
    transactionStarted = true
    const result = await operation(client)
    await client.query('COMMIT')
    transactionStarted = false
    return result
  } catch (error) {
    if (transactionStarted) await client.query('ROLLBACK').catch(() => undefined)
    throw error
  } finally {
    client.release()
  }
}

export async function replaceDurationBenchmarkAtomically(row: PersistenceRow) {
  const benchmarkKey = requireText(row.benchmark_key, 'benchmark_key')
  const companyId = normalizeText(row.company_id) || null
  const projectId = normalizeText(row.project_id) || null
  return withTransaction(async (client) => {
    await assertDurationBenchmarkScopeAuthority(client, companyId, projectId)
    await client.query(
      `update public.duration_benchmarks
          set is_current = false,
              updated_at = coalesce($4::timestamptz, now())
        where benchmark_key = $1
          and company_id is not distinct from $2::uuid
          and project_id is not distinct from $3::uuid
          and is_current = true
          and is_active = true`,
      [benchmarkKey, companyId, projectId, row.updated_at ?? null],
    )
    const inserted = await insertAllowedRow(client, 'duration_benchmarks', DURATION_BENCHMARK_COLUMNS, row)
    const persistedMetadata = inserted.metadata && typeof inserted.metadata === 'object' && !Array.isArray(inserted.metadata)
      ? inserted.metadata as Record<string, unknown>
      : {}
    const generatedAt = normalizeTimestamp(inserted.generated_at)
    const sourceAsOf = normalizeTimestamp(inserted.source_as_of)
    const calendarRef = normalizeText(
      persistedMetadata.calendar_ref
      ?? persistedMetadata.calendarRef
      ?? persistedMetadata.construction_calendar_ref
      ?? persistedMetadata.constructionCalendarRef,
    )
    const calendarVersion = normalizeText(
      persistedMetadata.calendar_version
      ?? persistedMetadata.calendarVersion
      ?? persistedMetadata.construction_calendar_version
      ?? persistedMetadata.constructionCalendarVersion,
    )
    if (
      normalizeText(inserted.duration_day_basis) === 'construction_production_day'
      && generatedAt
      && sourceAsOf
      && calendarRef
      && calendarVersion
    ) {
      await persistCurrentCauseSegments({
        benchmarkId: requireText(inserted.id, 'persisted benchmark id'),
        companyId: normalizeText(inserted.company_id) || null,
        projectId: normalizeText(inserted.project_id) || null,
        benchmarkKey: requireText(inserted.benchmark_key, 'persisted benchmark key'),
        generatedAt,
        sourceWindowStart: normalizeTimestamp(inserted.source_window_start) || null,
        sourceAsOf,
        calendarRef,
        calendarVersion,
      }, client)
    }
    return inserted
  })
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function requirePositiveNumber(value: unknown, fieldName: string) {
  const number = Number(value)
  if (!Number.isFinite(number) || number <= 0) throw new Error(`${fieldName} is required`)
  return number
}

function requireNonNegativeNumber(value: unknown, fieldName: string) {
  const number = Number(value)
  if (!Number.isFinite(number) || number < 0) throw new Error(`${fieldName} is required`)
  return number
}

async function assertDurationBenchmarkScopeAuthority(
  client: PoolClient,
  companyId: string | null,
  projectId: string | null,
) {
  if (!projectId) return
  if (!companyId) throw new Error('company_id is required for project-scoped duration benchmark')
  const result = await client.query<{ company_id?: unknown }>(
    `select company_id
      from public.projects
      where id = $1::uuid
      for no key update`,
    [projectId],
  )
  const projectCompanyId = normalizeText(result.rows[0]?.company_id)
  if (!projectCompanyId) throw new Error('duration benchmark project not found')
  if (projectCompanyId !== companyId) throw new Error('duration benchmark project/company mismatch')
}

export async function stageDurationBenchmarkCandidateAtomically(row: PersistenceRow) {
  const benchmarkKey = requireText(row.benchmark_key, 'benchmark_key')
  const companyId = normalizeText(row.company_id) || null
  const projectId = normalizeText(row.project_id) || null
  const metadata = row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
    ? row.metadata as Record<string, unknown>
    : {}
  const candidateOperationId = requireText(metadata.candidate_operation_id, 'candidate_operation_id')
  const candidateRow: PersistenceRow = {
    ...row,
    is_current: false,
    is_active: true,
    metadata: {
      ...metadata,
      candidate_operation_id: candidateOperationId,
      runtime_publication_status: 'candidate',
    },
  }

  return withTransaction(async (client) => {
    await assertDurationBenchmarkScopeAuthority(client, companyId, projectId)
    await client.query(
      `select pg_advisory_xact_lock(hashtextextended($1::text, 0))`,
      [`duration-benchmark-candidate:${companyId ?? 'global'}:${projectId ?? 'all'}:${benchmarkKey}:${candidateOperationId}`],
    )
    const existing = await client.query<PersistenceRow>(
      `select *
         from public.duration_benchmarks
        where benchmark_key = $1
          and company_id is not distinct from $2::uuid
          and project_id is not distinct from $3::uuid
          and metadata ->> 'candidate_operation_id' = $4
          and is_active = true
        limit 1
        for update`,
      [benchmarkKey, companyId, projectId, candidateOperationId],
    )
    const existingRow = existing.rows[0]
    if (existingRow) {
      const existingMetadata = readRecord(existingRow.metadata)
      const existingContractHash = normalizeText(existingMetadata.evidence_contract_hash)
      const incomingContractHash = normalizeText(metadata.evidence_contract_hash)
      if (!existingContractHash || !incomingContractHash || existingContractHash !== incomingContractHash) {
        throw new Error('duration benchmark candidate operation contract mismatch')
      }
      return existingRow
    }
    return insertAllowedRow(client, 'duration_benchmarks', DURATION_BENCHMARK_COLUMNS, candidateRow)
  })
}

export async function promoteDurationBenchmarkRuntimeCanaryAtomically(input: {
  publicationKey: string
  promotedAt?: string
  benchmarkId?: string
  companyId: string
  projectId: string
  artifactKey?: string
}) {
  const publicationKey = requireText(input.publicationKey, 'publicationKey')
  const companyId = requireText(input.companyId, 'companyId')
  const projectId = requireText(input.projectId, 'projectId')
  return withTransaction(async (client) => {
    const publicationResult = await client.query<PersistenceRow>(
      `select publication_key, asset_key, artifact_key, scope_level,
              company_id, project_id, runtime_payload, publication_stage,
              monitoring_status
         from public.duration_learning_runtime_publications
        where publication_key = $1
          and company_id = $2::uuid
          and project_id = $3::uuid
        limit 1
        for update`,
      [publicationKey, companyId, projectId],
    )
    const publication = publicationResult.rows[0]
    if (!publication) throw new Error('duration benchmark runtime publication not found')
    if (normalizeText(publication.asset_key) !== 'base_duration_benchmark') {
      throw new Error('duration benchmark runtime publication asset mismatch')
    }
    if (normalizeText(publication.scope_level) !== 'project') {
      throw new Error('duration benchmark runtime publication requires exact project scope')
    }

    const runtimePayload = readRecord(publication.runtime_payload)
    const benchmarkId = requireText(runtimePayload.benchmarkId ?? runtimePayload.benchmark_id, 'benchmarkId')
    const benchmarkVersion = requireText(
      runtimePayload.benchmarkVersion ?? runtimePayload.benchmark_version,
      'benchmarkVersion',
    )
    const publicationCompanyId = requireText(publication.company_id, 'publication company_id')
    const publicationProjectId = requireText(publication.project_id, 'publication project_id')
    const artifactKey = requireText(publication.artifact_key, 'publication artifact_key')
    if (input.benchmarkId && input.benchmarkId !== benchmarkId) throw new Error('duration benchmark activation id mismatch')
    if (companyId !== publicationCompanyId) throw new Error('duration benchmark activation company mismatch')
    if (projectId !== publicationProjectId) throw new Error('duration benchmark activation project mismatch')
    if (input.artifactKey && input.artifactKey !== artifactKey) throw new Error('duration benchmark activation artifact mismatch')

    const durationDayBasis = requireText(runtimePayload.durationDayBasis ?? runtimePayload.duration_day_basis, 'durationDayBasis')
    if (durationDayBasis !== 'construction_production_day') {
      throw new Error('duration benchmark activation requires construction production days')
    }
    const generatedAt = requireText(runtimePayload.generatedAt ?? runtimePayload.generated_at, 'generatedAt')
    const sourceWindowStart = requireText(runtimePayload.sourceWindowStart ?? runtimePayload.source_window_start, 'sourceWindowStart')
    const sourceAsOf = requireText(runtimePayload.sourceAsOf ?? runtimePayload.source_as_of, 'sourceAsOf')
    const calendarRef = requireText(runtimePayload.calendarRef ?? runtimePayload.calendar_ref, 'calendarRef')
    const calendarVersion = requireText(runtimePayload.calendarVersion ?? runtimePayload.calendar_version, 'calendarVersion')
    requirePositiveNumber(runtimePayload.p50Days ?? runtimePayload.p50_days, 'p50Days')
    requirePositiveNumber(runtimePayload.p75Days ?? runtimePayload.p75_days, 'p75Days')
    requirePositiveNumber(runtimePayload.p80Days ?? runtimePayload.p80_days, 'p80Days')
    requirePositiveNumber(runtimePayload.meanDays ?? runtimePayload.mean_days, 'meanDays')
    requirePositiveNumber(runtimePayload.sampleCount ?? runtimePayload.sample_count, 'sampleCount')
    requireNonNegativeNumber(runtimePayload.variance, 'variance')
    requireNonNegativeNumber(
      runtimePayload.coefficientOfVariation ?? runtimePayload.coefficient_of_variation,
      'coefficientOfVariation',
    )
    requireText(runtimePayload.confidenceLevel ?? runtimePayload.confidence_level, 'confidenceLevel')
    requireNonNegativeNumber(runtimePayload.confidenceScore ?? runtimePayload.confidence_score, 'confidenceScore')

    await assertDurationBenchmarkScopeAuthority(client, publicationCompanyId, publicationProjectId)
    const candidateResult = await client.query<PersistenceRow>(
      `select *
         from public.duration_benchmarks
        where id = $1::uuid
          and company_id = $2::uuid
          and project_id = $3::uuid
          and benchmark_key = $4
          and is_active = true
        for update`,
      [benchmarkId, publicationCompanyId, publicationProjectId, artifactKey],
    )
    const candidate = candidateResult.rows[0]
    if (!candidate) throw new Error('duration benchmark candidate not found')
    if (normalizeText(candidate.benchmark_version) !== benchmarkVersion) {
      throw new Error('duration benchmark activation version mismatch')
    }
    const candidateMetadata = readRecord(candidate.metadata)
    const exactCandidate = normalizeText(candidate.duration_day_basis) === durationDayBasis
      && normalizeTimestamp(candidate.generated_at) === generatedAt
      && normalizeTimestamp(candidate.source_window_start) === sourceWindowStart
      && normalizeTimestamp(candidate.source_as_of) === sourceAsOf
      && normalizeText(candidateMetadata.calendar_ref) === calendarRef
      && normalizeText(candidateMetadata.calendar_version) === calendarVersion
      && Number(candidate.p50_days) === Number(runtimePayload.p50Days ?? runtimePayload.p50_days)
      && Number(candidate.p75_days) === Number(runtimePayload.p75Days ?? runtimePayload.p75_days)
      && Number(candidate.p80_days) === Number(runtimePayload.p80Days ?? runtimePayload.p80_days)
      && Number(candidate.mean_days) === Number(runtimePayload.meanDays ?? runtimePayload.mean_days)
      && Number(candidate.variance) === Number(runtimePayload.variance)
      && Number(candidate.coefficient_of_variation) === Number(
        runtimePayload.coefficientOfVariation ?? runtimePayload.coefficient_of_variation,
      )
      && Number(candidate.sample_count) === Number(runtimePayload.sampleCount ?? runtimePayload.sample_count)
      && normalizeText(candidate.confidence_level) === normalizeText(runtimePayload.confidenceLevel ?? runtimePayload.confidence_level)
      && Number(candidate.confidence_score) === Number(runtimePayload.confidenceScore ?? runtimePayload.confidence_score)
    if (!exactCandidate) throw new Error('duration benchmark candidate publication contract mismatch')

    const promotion = await promoteDurationLearningRuntimeCanary({
      queryExec: async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => {
        const result = await client.query<T>(sql, params)
        return result.rows
      },
      publicationKey,
      promotedAt: input.promotedAt,
    })
    if (promotion.status === 'blocked') return promotion

    const alreadyActivated = candidate.is_current === true
      && normalizeText(candidateMetadata.runtime_publication_status) === 'published'
      && normalizeText(candidateMetadata.runtime_publication_key) === publicationKey
      && normalizeText(candidateMetadata.cause_segments_publication_key) === publicationKey
    if (promotion.status === 'stable_already_promoted') {
      if (!alreadyActivated) throw new Error('duration benchmark activation replay mismatch')
      return promotion
    }

    const promotedAt = input.promotedAt ?? new Date().toISOString()
    await client.query(
      `update public.duration_benchmarks
          set is_current = false,
              updated_at = $5::timestamptz
        where benchmark_key = $1
          and company_id = $2::uuid
          and project_id = $3::uuid
          and id <> $4::uuid
          and is_current = true
          and is_active = true`,
      [artifactKey, companyId, projectId, benchmarkId, promotedAt],
    )
    const activatedResult = await client.query<PersistenceRow>(
      `update public.duration_benchmarks
          set is_current = true,
              metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
                'runtime_publication_status', 'published',
                'runtime_publication_key', $2::text
              ),
              updated_at = $3::timestamptz
        where id = $1::uuid
          and is_active = true
        returning *`,
      [benchmarkId, publicationKey, promotedAt],
    )
    if (activatedResult.rows.length !== 1) throw new Error('duration benchmark activation readback required')

    await persistCurrentCauseSegments({
      benchmarkId,
      companyId: publicationCompanyId,
      projectId: publicationProjectId,
      benchmarkKey: artifactKey,
      generatedAt,
      sourceWindowStart,
      sourceAsOf,
      calendarRef,
      calendarVersion,
      frozenEvidence: {
        evidenceContractHash: candidateMetadata.evidence_contract_hash,
        sampleMutationLineage: candidateMetadata.sample_mutation_lineage,
        structuredCauseAttributionLineage: candidateMetadata.structured_cause_attribution_lineage,
      },
    }, client)
    const markerResult = await client.query<PersistenceRow>(
      `update public.duration_benchmarks
          set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
                'cause_segments_publication_key', $2::text,
                'cause_segments_persisted_at', $3::timestamptz
              ),
              updated_at = $3::timestamptz
        where id = $1::uuid
          and is_current = true
        returning id`,
      [benchmarkId, publicationKey, promotedAt],
    )
    if (markerResult.rows.length !== 1) throw new Error('duration benchmark cause segment activation marker required')
    return promotion
  })
}

export async function replaceProjectProductivityCalibrationAtomically(row: PersistenceRow) {
  const companyId = requireText(row.company_id, 'company_id')
  const projectId = requireText(row.project_id, 'project_id')
  const calibrationKey = requireText(row.calibration_key, 'calibration_key')
  const isPublished = normalizeText(row.status) === 'published'
  return withTransaction(async (client) => {
    let previousPublishedId: string | null = null
    if (isPublished) {
      const previous = await client.query<{ id: string }>(
        `select id
          from public.project_productivity_compensation_calibrations
          where company_id = $1::uuid
            and project_id = $2::uuid
            and calibration_key = $3
            and status = 'published'
          for update`,
        [companyId, projectId, calibrationKey],
      )
      previousPublishedId = previous.rows[0]?.id ?? null
      if (previousPublishedId) {
        await client.query(
          `update public.project_productivity_compensation_calibrations
              set status = 'superseded',
                  updated_at = now()
            where id = $1::uuid
              and company_id = $2::uuid
              and status = 'published'`,
          [previousPublishedId, companyId],
        )
      }
    }

    const inserted = await insertAllowedRow(
      client,
      'project_productivity_compensation_calibrations',
      PROJECT_PRODUCTIVITY_CALIBRATION_COLUMNS,
      row,
    )
    if (previousPublishedId) {
      await client.query(
        `update public.project_productivity_compensation_calibrations
            set superseded_by = $2::uuid,
                updated_at = now()
          where id = $1::uuid
            and company_id = $3::uuid
            and status = 'superseded'`,
        [previousPublishedId, inserted.id, companyId],
      )
    }
    return inserted
  })
}

export async function rollbackProjectProductivityCalibrationAtomically(input: {
  companyId: string
  projectId: string
  reason?: string | null
}) {
  const companyId = requireText(input.companyId, 'companyId')
  const projectId = requireText(input.projectId, 'projectId')
  return withTransaction(async (client) => {
    const currentResult = await client.query<{ id: string; evidence_summary?: Record<string, unknown> | null }>(
      `select id, evidence_summary
         from public.project_productivity_compensation_calibrations
        where company_id = $1::uuid
          and project_id = $2::uuid
          and calibration_key = 'productivity_compensation'
          and status = 'published'
        order by published_at desc nulls last, created_at desc
        limit 1
        for update`,
      [companyId, projectId],
    )
    const current = currentResult.rows[0]
    if (!current?.id) return null

    const previousResult = await client.query<{ id: string }>(
      `select id
         from public.project_productivity_compensation_calibrations
        where superseded_by = $1::uuid
          and company_id = $2::uuid
          and status = 'superseded'
        order by published_at desc nulls last, created_at desc
        limit 1
        for update`,
      [current.id, companyId],
    )
    const previousId = previousResult.rows[0]?.id ?? null
    await client.query(
      `update public.project_productivity_compensation_calibrations
          set status = 'rolled_back',
              rollback_of = $2::uuid,
              evidence_summary = coalesce(evidence_summary, '{}'::jsonb) || jsonb_build_object(
                'rollbackReason', $3::text,
                'rolledBackAt', now()
              ),
              updated_at = now()
        where id = $1::uuid
          and company_id = $4::uuid
          and status = 'published'
        returning id`,
      [current.id, previousId, normalizeText(input.reason) || 'manual_rollback', companyId],
    )
    if (previousId) {
      await client.query(
        `update public.project_productivity_compensation_calibrations
            set status = 'published',
                superseded_by = null,
                published_at = coalesce(published_at, now()),
                updated_at = now()
          where id = $1::uuid
            and company_id = $2::uuid
            and status = 'superseded'
          returning id`,
        [previousId, companyId],
      )
    }
    return {
      id: current.id,
      status: 'rolled_back' as const,
      restoredCalibrationId: previousId,
    }
  })
}
