import { query as rawQuery } from '../database.js'
import type {
  DurationLiveLearningCompletionAudit,
} from './durationLiveLearningCompletionAuditService.js'
import {
  buildDurationLiveLearningProductionClaimAudit,
  listDurationLiveLearningProductionEvidenceSourcePlan,
  type DurationLiveLearningProductionClaimAudit,
  type DurationLiveLearningProductionEvidenceSourceRow,
  type DurationLiveLearningProductionEvidenceSourceTable,
} from './durationLiveLearningProductionEvidenceGateService.js'

export type DurationLiveLearningProductionEvidenceQueryExec = <T = Record<string, unknown>>(
  sql: string,
  params?: unknown[],
) => Promise<T[]>

export interface DurationLiveLearningProductionEvidenceSourceQueryInput {
  queryExec?: DurationLiveLearningProductionEvidenceQueryExec
  maxRowsPerSourceTable?: number
}

export interface DurationLiveLearningProductionEvidenceSourceQuery {
  sourceTables: DurationLiveLearningProductionEvidenceSourceTable[]
  maxRowsPerSourceTable: number
  sourceRows: DurationLiveLearningProductionEvidenceSourceRow[]
}

export interface DurationLiveLearningProductionClaimAuditFromDbInput
  extends DurationLiveLearningProductionEvidenceSourceQueryInput {
  completionAudit: DurationLiveLearningCompletionAudit
}

export type DurationLiveLearningProductionClaimAuditFromDb =
  DurationLiveLearningProductionClaimAudit & {
    sourceQuery: DurationLiveLearningProductionEvidenceSourceQuery
  }

const DEFAULT_MAX_ROWS_PER_SOURCE_TABLE = 500

async function defaultQueryExec<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  const result = await rawQuery(sql, params)
  if (Array.isArray(result)) return result as T[]
  const rows = (result as { rows?: unknown }).rows
  return Array.isArray(rows) ? rows as T[] : []
}

function normalizePositiveInteger(value: unknown, fallback: number) {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : fallback
}

function canonicalSourceTables() {
  const sourcePlan = listDurationLiveLearningProductionEvidenceSourcePlan()
  const sourceTables = sourcePlan.flatMap((entry) => entry.sourceTables)
  return Array.from(new Set(sourceTables))
}

function queryForSourceTable(sourceTable: DurationLiveLearningProductionEvidenceSourceTable) {
  if (sourceTable === 'duration_experience_samples') {
    return `
      select *
      from public.duration_experience_samples
      where sample_status = 'active'
        and included_in_benchmark = true
        and actual_duration is not null
      order by completed_at desc nulls last, created_at desc
      limit $1
    `
  }

  if (sourceTable === 'algorithm_learnable_parameter_runtime_publications') {
    return `
      select *
      from public.algorithm_learnable_parameter_runtime_publications
      where publication_status in ('published', 'canary')
        and writes_seed_runtime_directly = false
        and target_runtime_table = 'algorithm_learnable_parameter_runtime_publications'
      order by published_at desc
      limit $1
    `
  }

  if (sourceTable === 'algorithm_learnable_parameter_release_events') {
    return `
      select *
      from public.algorithm_learnable_parameter_release_events
      where event_type in ('impact_monitoring', 'rollback_execution')
        and event_status in ('monitoring_passed', 'rollback_executed')
      order by executed_at desc
      limit $1
    `
  }

  if (sourceTable === 'wbs_template_runtime_publications') {
    return `
      select *
      from public.wbs_template_runtime_publications
      where runtime_publication_status = 'runtime_published'
      order by published_at desc
      limit $1
    `
  }

  if (sourceTable === 'wbs_template_runtime_events') {
    return `
      select *
      from public.wbs_template_runtime_events
      where event_type in ('impact_monitoring', 'rollback_execution')
        and event_status in ('monitoring_passed', 'rollback_executed')
      order by executed_at desc
      limit $1
    `
  }

  if (sourceTable === 'construction_dependency_rule_runtime_publications') {
    return `
      select *
      from public.construction_dependency_rule_runtime_publications
      where runtime_publication_status = 'runtime_published'
      order by published_at desc
      limit $1
    `
  }

  if (sourceTable === 'construction_dependency_rule_runtime_events') {
    return `
      select *
      from public.construction_dependency_rule_runtime_events
      where event_type in ('impact_monitoring', 'rollback_execution')
        and event_status in ('monitoring_passed', 'rollback_executed')
      order by executed_at desc
      limit $1
    `
  }

  if (sourceTable === 'duration_algorithm_accuracy_events') {
    return `
      select *
      from public.duration_algorithm_accuracy_events
      where absolute_error_days is not null
      order by backtested_at desc nulls last, predicted_at desc nulls last
      limit $1
    `
  }

  return `
    select *
    from public.runtime_consumer_observations
    where observation_status = 'observed'
      and writes_runtime_directly = false
      and writes_fact_directly = false
    order by observed_at desc
    limit $1
  `
}

export async function loadDurationLiveLearningProductionEvidenceSourceRows(
  input: DurationLiveLearningProductionEvidenceSourceQueryInput = {},
): Promise<DurationLiveLearningProductionEvidenceSourceQuery> {
  const queryExec = input.queryExec ?? defaultQueryExec
  const maxRowsPerSourceTable = normalizePositiveInteger(
    input.maxRowsPerSourceTable,
    DEFAULT_MAX_ROWS_PER_SOURCE_TABLE,
  )
  const sourceTables = canonicalSourceTables()
  const sourceRows: DurationLiveLearningProductionEvidenceSourceRow[] = []

  for (const sourceTable of sourceTables) {
    const rows = await queryExec<Record<string, unknown>>(queryForSourceTable(sourceTable), [
      maxRowsPerSourceTable,
    ])
    for (const row of rows) sourceRows.push({ sourceTable, row })
  }

  return { sourceTables, maxRowsPerSourceTable, sourceRows }
}

export async function buildDurationLiveLearningProductionClaimAuditFromDb(
  input: DurationLiveLearningProductionClaimAuditFromDbInput,
): Promise<DurationLiveLearningProductionClaimAuditFromDb> {
  const sourceQuery = await loadDurationLiveLearningProductionEvidenceSourceRows(input)
  const audit = buildDurationLiveLearningProductionClaimAudit({
    completionAudit: input.completionAudit,
    sourceRows: sourceQuery.sourceRows,
  })

  return {
    ...audit,
    sourceQuery,
  }
}
