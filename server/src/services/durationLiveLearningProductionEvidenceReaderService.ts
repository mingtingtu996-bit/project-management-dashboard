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
  requestedFactRewriteAssetKeys?: readonly DurationLiveLearningAssetKey[]
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
  const scope = normalizeLearningScope(
    readText(row, 'learning_scope', 'learningScope', 'sample_scope', 'sampleScope', 'scope'),
  )
  if (!scope) return null
  const source = readText(row, 'learning_scope_source', 'learningScopeSource')
  if (!source && scope === 'project') return scope
  const expectedSourceByScope: Record<DurationLearningScope, string> = {
    global: 'global_shared_baseline_job',
    industry: 'industry_shared_baseline_job',
    company: 'company_aggregate_evidence_job',
    project: 'task_completion_writer',
  }
  return source === expectedSourceByScope[scope] ? scope : null
}

function planNetworkOutcomeLearningScope(row: Record<string, unknown>) {
  const scope = normalizeLearningScope(
    readText(row, 'learning_scope', 'learningScope', 'sample_scope', 'sampleScope', 'scope'),
  )
  if (!scope) return null
  const source = readText(row, 'learning_scope_source', 'learningScopeSource')
  if (!source && scope === 'project') return scope
  const expectedSourceByScope: Record<DurationLearningScope, string> = {
    global: 'plan_network_global_baseline_job',
    industry: 'plan_network_industry_baseline_job',
    company: 'plan_network_company_aggregate_job',
    project: 'project_business_outcome_writer',
  }
  return source === expectedSourceByScope[scope] ? scope : null
}

function acceptedLearningScopesFromProductionSamples(
  assetKey: DurationLiveLearningAssetKey,
  sourceRows: readonly DurationLiveLearningProductionEvidenceSourceRow[],
): DurationLearningScope[] {
  const scopes = new Set<DurationLearningScope>()
  for (const source of sourceRows) {
    if (source.sourceTable === 'duration_experience_samples') {
      if (durationSampleAssetKey(source.row) !== assetKey) continue
      if (readText(source.row, 'sample_status', 'sampleStatus') !== 'active') continue
      if (source.row.included_in_benchmark !== true) continue
      if (typeof source.row.actual_duration !== 'number' || !Number.isFinite(source.row.actual_duration)) continue
      if (!readText(source.row, 'completed_at', 'completedAt')) continue
      const scope = durationSampleLearningScope(source.row)
      if (scope) scopes.add(scope)
      continue
    }

    if (source.sourceTable === 'duration_plan_network_outcomes') {
      if (readText(source.row, 'asset_key', 'assetKey') !== assetKey) continue
      if (readText(source.row, 'outcome_status', 'outcomeStatus') !== 'accepted') continue
      if (source.row.writes_runtime_directly === true || source.row.writes_fact_directly === true) continue
      const scope = planNetworkOutcomeLearningScope(source.row)
      if (scope) scopes.add(scope)
    }
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

function publicationRefMatchesPublicationKey(
  publicationExecutionRef: string | null | undefined,
  publicationKey: string | null | undefined,
) {
  const publicationRef = normalizeText(publicationExecutionRef)
  const normalizedPublicationKey = normalizeText(publicationKey)
  return Boolean(publicationRef && normalizedPublicationKey)
    && (
      publicationRef === normalizedPublicationKey
      || publicationRef.endsWith(`:${normalizedPublicationKey}`)
    )
}

function forecastScopeExceptionApprovalRecord(row: Record<string, unknown>) {
  const releasePackage = readRecord(row.release_package ?? row.releasePackage)
  const nestedApproval = readRecord(
    releasePackage.scopeExceptionApproval
      ?? releasePackage.scope_exception_approval
      ?? releasePackage.scope_exception,
  )
  const approvalId = readText(
    releasePackage,
    'scopeExceptionApprovalId',
    'scope_exception_approval_id',
    'scopeExceptionApprovalRef',
    'scope_exception_approval_ref',
  ) || readText(nestedApproval, 'id', 'approvalId', 'approval_id', 'ref', 'reference')
  const status = readText(
    releasePackage,
    'scopeExceptionApprovalStatus',
    'scope_exception_approval_status',
  ) || readText(nestedApproval, 'status', 'approvalStatus', 'approval_status')
  const approved = releasePackage.scopeExceptionApproved === true
    || releasePackage.scope_exception_approved === true
    || nestedApproval.approved === true
    || status === 'approved'
    || status === 'scope_exception_approved'
  return {
    approvalId,
    approved,
  }
}

function hasForecastScopeExceptionApprovalFromProductionPublication(
  evidence: DurationLiveLearningProductionEvidenceRef,
  sourceRows: readonly DurationLiveLearningProductionEvidenceSourceRow[],
) {
  if (!FORECAST_SCOPE_EXCEPTION_ASSET_KEYS.has(evidence.assetKey)) return false
  for (const source of sourceRows) {
    if (source.sourceTable !== 'algorithm_learnable_parameter_runtime_publications') continue
    const row = source.row
    if (readText(row, 'asset_key', 'assetKey') !== evidence.assetKey) continue
    const publicationKey = readText(row, 'publication_key', 'publicationKey')
    if (!publicationRefMatchesPublicationKey(evidence.publicationExecutionRef, publicationKey)) continue
    const publicationStatus = readText(row, 'publication_status', 'publicationStatus')
    if (publicationStatus !== 'published' && publicationStatus !== 'canary') continue
    const approval = forecastScopeExceptionApprovalRecord(row)
    if (approval.approvalId && approval.approved) return true
  }
  return false
}

function productionCompletionEvidenceForAsset(
  evidence: DurationLiveLearningProductionEvidenceRef,
  sourceRows: readonly DurationLiveLearningProductionEvidenceSourceRow[],
): DurationLiveLearningEvidence {
  const scopeExceptionApproved = hasForecastScopeExceptionApprovalFromProductionPublication(evidence, sourceRows)
  const productionSampleScopes = acceptedLearningScopesFromProductionSamples(evidence.assetKey, sourceRows)
  const enabledLearningScopes = scopeExceptionApproved
    ? FORECAST_SCOPE_EXCEPTION_SCOPES
    : productionSampleScopes
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

function buildDurationLiveLearningCompletionAuditFromProductionSources(input: {
  sourceRows: readonly DurationLiveLearningProductionEvidenceSourceRow[]
  requestedFactRewriteAssetKeys?: readonly DurationLiveLearningAssetKey[]
}) {
  const rowCollection = collectDurationLiveLearningProductionEvidenceRecordsFromRows({
    rows: input.sourceRows,
  })
  const evidenceCollection = collectDurationLiveLearningProductionEvidenceRefs({
    records: rowCollection.records,
  })
  const evidenceOverrides: DurationLiveLearningEvidenceOverride[] = evidenceCollection.productionEvidence.map((evidence) => ({
    assetKey: evidence.assetKey,
    evidence: productionCompletionEvidenceForAsset(evidence, input.sourceRows),
  }))

  return buildDurationLiveLearningCompletionAudit({
    evidenceOverrides,
    requestedFactRewriteAssetKeys: input.requestedFactRewriteAssetKeys,
  })
}

function queryForSourceTable(sourceTable: DurationLiveLearningProductionEvidenceSourceTable) {
  if (sourceTable === 'duration_experience_samples') {
    return `
      select *
      from public.duration_experience_samples
      where sample_status = 'active'
        and included_in_benchmark = true
        and actual_duration is not null
        and (
          (learning_scope = 'project' and learning_scope_source = 'task_completion_writer')
          or (learning_scope = 'company' and learning_scope_source = 'company_aggregate_evidence_job')
          or (learning_scope = 'industry' and learning_scope_source = 'industry_shared_baseline_job')
          or (learning_scope = 'global' and learning_scope_source = 'global_shared_baseline_job')
        )
      order by completed_at desc nulls last, created_at desc
      limit $1
    `
  }

  if (sourceTable === 'duration_plan_network_outcomes') {
    return `
      select *
      from public.duration_plan_network_outcomes
      where outcome_status in ('accepted', 'weak')
        and writes_runtime_directly = false
        and writes_fact_directly = false
        and (
          (learning_scope = 'project' and learning_scope_source = 'project_business_outcome_writer')
          or (learning_scope = 'company' and learning_scope_source = 'plan_network_company_aggregate_job')
          or (learning_scope = 'industry' and learning_scope_source = 'plan_network_industry_baseline_job')
          or (learning_scope = 'global' and learning_scope_source = 'plan_network_global_baseline_job')
        )
      order by observed_at desc nulls last, created_at desc
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
    requestedFactRewriteAssetKeys: input.requestedFactRewriteAssetKeys,
  })
  const audit = buildDurationLiveLearningProductionClaimAudit({
    completionAudit,
    sourceRows: sourceQuery.sourceRows,
    runtimeConsumerBusinessPathSourceFiles,
  })

  return {
    ...audit,
    sourceQuery,
  }
}
