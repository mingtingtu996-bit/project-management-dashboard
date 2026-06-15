import { query as rawQuery } from '../database.js'
import type {
  DurationLiveLearningCompletionAudit,
} from './durationLiveLearningCompletionAuditService.js'
import {
  buildDurationLiveLearningCompletionAudit,
} from './durationLiveLearningCompletionAuditService.js'
import type {
  DurationLiveLearningAssetKey,
  DurationLiveLearningEvidence,
  DurationLiveLearningEvidenceOverride,
  DurationLearningScope,
} from './durationLiveLearningClosureService.js'
import {
  buildDurationLiveLearningProductionClaimAudit,
  collectDurationLiveLearningProductionEvidenceRecordsFromRows,
  collectDurationLiveLearningProductionEvidenceRefs,
  listDurationLiveLearningProductionEvidenceSourcePlan,
  type DurationLiveLearningProductionClaimAudit,
  type DurationLiveLearningProductionEvidenceRecord,
  type DurationLiveLearningProductionEvidenceRef,
  type DurationLiveLearningProductionEvidenceSourceRow,
  type DurationLiveLearningProductionEvidenceSourceTable,
} from './durationLiveLearningProductionEvidenceGateService.js'
import {
  loadDurationRuntimeConsumerBusinessPathSourceFiles,
} from './durationRuntimeConsumerBusinessPathIntegrationAuditService.js'

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
  completionAudit?: DurationLiveLearningCompletionAudit
  records?: readonly DurationLiveLearningProductionEvidenceRecord[]
}

export type DurationLiveLearningProductionClaimAuditFromDb =
  DurationLiveLearningProductionClaimAudit & {
    sourceQuery: DurationLiveLearningProductionEvidenceSourceQuery
  }

const DEFAULT_MAX_ROWS_PER_SOURCE_TABLE = 500
const FULL_TIERED_LEARNING_SCOPES: DurationLearningScope[] = ['global', 'industry', 'company', 'project']
const FORECAST_SCOPE_EXCEPTION_SCOPES: DurationLearningScope[] = ['company', 'project']
const FORECAST_SCOPE_EXCEPTION_ASSET_KEYS = new Set<DurationLiveLearningAssetKey>([
  'forecast_residual_overlay',
  'forecast_confidence_weight',
])
const PLAN_NETWORK_PRODUCTION_SAMPLE_ASSET_KEYS = new Set<DurationLiveLearningAssetKey>([
  'special_work_duration_seed',
  'wbs_reference_days',
  'dependency_rule_candidate',
  'critical_path_rule_candidate',
])

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

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function readText(row: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = row[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return ''
}

function normalizeLearningScope(value: unknown): DurationLearningScope | null {
  const normalized = normalizeText(value).toLowerCase()
  if (normalized === 'system' || normalized === 'global') return 'global'
  if (normalized === 'industry' || normalized === 'industry_baseline' || normalized === 'segment_baseline') {
    return 'industry'
  }
  if (normalized === 'company') return 'company'
  if (normalized === 'project') return 'project'
  return null
}

function durationSampleAssetKey(row: Record<string, unknown>) {
  const metadata = readRecord(row.metadata)
  return readText(row, 'asset_key', 'assetKey')
    || readText(metadata, 'liveLearningAssetKey', 'live_learning_asset_key', 'assetKey', 'asset_key')
}

function durationSampleLearningScope(row: Record<string, unknown>) {
  const metadata = readRecord(row.metadata)
  return normalizeLearningScope(
    readText(row, 'learning_scope', 'learningScope', 'sample_scope', 'sampleScope', 'scope')
      || readText(metadata, 'learningScope', 'learning_scope', 'sampleScope', 'sample_scope', 'scope'),
  )
}

function acceptedLearningScopesFromDurationSamples(
  assetKey: DurationLiveLearningAssetKey,
  sourceRows: readonly DurationLiveLearningProductionEvidenceSourceRow[],
): DurationLearningScope[] {
  const scopes = new Set<DurationLearningScope>()
  for (const source of sourceRows) {
    if (source.sourceTable !== 'duration_experience_samples') continue
    if (durationSampleAssetKey(source.row) !== assetKey) continue
    if (readText(source.row, 'sample_status', 'sampleStatus') !== 'active') continue
    if (source.row.included_in_benchmark !== true) continue
    if (typeof source.row.actual_duration !== 'number' || !Number.isFinite(source.row.actual_duration)) continue
    if (!readText(source.row, 'completed_at', 'completedAt')) continue
    const scope = durationSampleLearningScope(source.row)
    if (scope) scopes.add(scope)
  }
  return FULL_TIERED_LEARNING_SCOPES.filter((scope) => scopes.has(scope))
}

function hasRef(value: string | null | undefined) {
  return typeof value === 'string' && value.trim().length > 0
}

function publicationRefMatchesObservedPublication(evidence: DurationLiveLearningProductionEvidenceRef) {
  const publicationRef = normalizeText(evidence.publicationExecutionRef)
  const observedPublicationKey = normalizeText(evidence.runtimeConsumerPublicationKey)
  return Boolean(publicationRef && observedPublicationKey)
    && (
      publicationRef === observedPublicationKey
      || publicationRef.endsWith(`:${observedPublicationKey}`)
    )
}

function productionCompletionEvidenceForAsset(
  evidence: DurationLiveLearningProductionEvidenceRef,
  sourceRows: readonly DurationLiveLearningProductionEvidenceSourceRow[],
): DurationLiveLearningEvidence {
  const scopeExceptionApproved = FORECAST_SCOPE_EXCEPTION_ASSET_KEYS.has(evidence.assetKey)
  const baseScopes = evidence.assetKey === 'base_duration_benchmark'
    ? acceptedLearningScopesFromDurationSamples(evidence.assetKey, sourceRows)
    : FULL_TIERED_LEARNING_SCOPES
  const enabledLearningScopes = scopeExceptionApproved
    ? FORECAST_SCOPE_EXCEPTION_SCOPES
    : baseScopes
  const hasTieredLearningPolicy = scopeExceptionApproved
    || FULL_TIERED_LEARNING_SCOPES.every((scope) => enabledLearningScopes.includes(scope))

  return {
    assetClassificationRegistered: true,
    predictionEventRecorded: hasRef(evidence.publicationExecutionRef) || hasRef(evidence.accuracyEvidenceRef),
    actualOutcomeEventRecorded: hasRef(evidence.productionSampleEvidenceRef),
    tieredLearningPolicyRegistered: hasTieredLearningPolicy,
    enabledLearningScopes,
    scopeExceptionApproved: scopeExceptionApproved ? true : undefined,
    runtimeConsumerUsesPublishedArtifact: hasRef(evidence.runtimeConsumerObservationRef)
      && publicationRefMatchesObservedPublication(evidence),
    releaseExitApproved: hasRef(evidence.publicationExecutionRef),
    impactMonitoringReady: hasRef(evidence.impactMonitoringEvidenceRef),
    rollbackTargetReady: hasRef(evidence.rollbackDrillEvidenceRef),
    accuracyMetricsAvailable: hasRef(evidence.accuracyEvidenceRef),
  }
}

function planNetworkProductionSampleRecords(
  records: readonly DurationLiveLearningProductionEvidenceRecord[] | undefined,
) {
  return (records ?? []).filter((record) =>
    record.evidenceKind === 'production_sample'
    && PLAN_NETWORK_PRODUCTION_SAMPLE_ASSET_KEYS.has(record.assetKey))
}

function buildDurationLiveLearningCompletionAuditFromProductionSources(input: {
  sourceRows: readonly DurationLiveLearningProductionEvidenceSourceRow[]
  records?: readonly DurationLiveLearningProductionEvidenceRecord[]
}) {
  const rowCollection = collectDurationLiveLearningProductionEvidenceRecordsFromRows({
    rows: input.sourceRows,
  })
  const evidenceCollection = collectDurationLiveLearningProductionEvidenceRefs({
    records: [
      ...rowCollection.records,
      ...planNetworkProductionSampleRecords(input.records),
    ],
  })
  const evidenceOverrides: DurationLiveLearningEvidenceOverride[] = evidenceCollection.productionEvidence.map((evidence) => ({
    assetKey: evidence.assetKey,
    evidence: productionCompletionEvidenceForAsset(evidence, input.sourceRows),
  }))

  return buildDurationLiveLearningCompletionAudit({ evidenceOverrides })
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

  if (sourceTable === 'algorithm_seed_versions') {
    return `
      select *
      from public.algorithm_seed_versions
      where seed_type = 'standard_work_duration'
        and status = 'active'
        and is_current = true
        and published_at is not null
      order by published_at desc, updated_at desc
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

  if (sourceTable === 'runtime_consumer_runtime_calls') {
    return `
      select *
      from public.runtime_consumer_runtime_calls
      where call_status = 'called'
        and writes_runtime_directly = false
        and writes_fact_directly = false
      order by called_at desc
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
  const runtimeConsumerBusinessPathSourceFiles = await loadDurationRuntimeConsumerBusinessPathSourceFiles()
  const completionAudit = buildDurationLiveLearningCompletionAuditFromProductionSources({
    sourceRows: sourceQuery.sourceRows,
    records: input.records,
  })
  const audit = buildDurationLiveLearningProductionClaimAudit({
    completionAudit,
    sourceRows: sourceQuery.sourceRows,
    records: input.records,
    runtimeConsumerBusinessPathSourceFiles,
  })

  return {
    ...audit,
    sourceQuery,
  }
}
