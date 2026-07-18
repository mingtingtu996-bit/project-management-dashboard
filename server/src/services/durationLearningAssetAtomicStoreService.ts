import type { PoolClient } from 'pg'

import { getClient } from '../database.js'

type PersistenceRow = Record<string, unknown>

const DURATION_BENCHMARK_COLUMNS = [
  'company_id',
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
  return withTransaction(async (client) => {
    await client.query(
      `update public.duration_benchmarks
          set is_current = false,
              updated_at = coalesce($3::timestamptz, now())
        where benchmark_key = $1
          and company_id is not distinct from $2::uuid
          and is_current = true
          and is_active = true`,
      [benchmarkKey, companyId, row.updated_at ?? null],
    )
    return insertAllowedRow(client, 'duration_benchmarks', DURATION_BENCHMARK_COLUMNS, row)
  })
}

export async function stageDurationBenchmarkCandidateAtomically(row: PersistenceRow) {
  const benchmarkKey = requireText(row.benchmark_key, 'benchmark_key')
  const companyId = normalizeText(row.company_id) || null
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
    const existing = await client.query<{ id: string }>(
      `select id
         from public.duration_benchmarks
        where benchmark_key = $1
          and company_id is not distinct from $2::uuid
          and metadata ->> 'candidate_operation_id' = $3
          and is_current = false
          and is_active = true
        limit 1
        for update`,
      [benchmarkKey, companyId, candidateOperationId],
    )
    const existingId = existing.rows[0]?.id ?? null
    return existingId
      ? updateAllowedRow(client, 'duration_benchmarks', DURATION_BENCHMARK_COLUMNS, existingId, candidateRow)
      : insertAllowedRow(client, 'duration_benchmarks', DURATION_BENCHMARK_COLUMNS, candidateRow)
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
