import type {
  DurationLearningScope,
  DurationLiveLearningAssetKey,
} from './durationLiveLearningClosureService.js'

export type DurationLearningScopeEvidenceQueryExec = (
  sql: string,
  params?: unknown[],
) => Promise<unknown>

type UpperLearningScope = Exclude<DurationLearningScope, 'project'>

export interface DurationOutcomeLearningScopeEvidenceInput {
  evidenceId: string
  assetKey: DurationLiveLearningAssetKey
  learningScope: DurationLearningScope
  companyId?: string | null
  projectId?: string | null
  representativeDurationDays: number
  sourceSampleCount: number
  publicationKey?: string | null
  observedAt?: string | null
  metadata?: Record<string, unknown> | null
}

export interface PlanNetworkLearningScopeEvidenceInput {
  evidenceId: string
  assetKey: DurationLiveLearningAssetKey
  learningScope: DurationLearningScope
  companyId?: string | null
  projectId?: string | null
  outcomeRef: string
  sourceOutcomeCount: number
  publicationKey?: string | null
  observedAt?: string | null
  metadata?: Record<string, unknown> | null
}

export interface DurationLearningScopeEvidenceWriteInput {
  queryExec: DurationLearningScopeEvidenceQueryExec
  observedAt?: string | null
  durationOutcomeEvidence?: readonly DurationOutcomeLearningScopeEvidenceInput[]
  planNetworkEvidence?: readonly PlanNetworkLearningScopeEvidenceInput[]
}

export interface DurationLearningScopeEvidenceWrittenRow {
  evidenceId: string
  assetKey: DurationLiveLearningAssetKey
  sourceTable: 'duration_experience_samples' | 'duration_plan_network_outcomes'
  learningScope: UpperLearningScope
  learningScopeSource: string
}

export interface DurationLearningScopeEvidenceRejectedRow {
  evidenceId: string
  assetKey: DurationLiveLearningAssetKey
  sourceTable: 'duration_experience_samples' | 'duration_plan_network_outcomes'
  reason:
    | 'asset_not_upper_scope_duration_outcome_learnable'
    | 'asset_not_upper_scope_plan_network_learnable'
    | 'upper_scope_aggregate_writer_cannot_write_project_scope'
    | 'evidence_id_required'
    | 'representative_duration_required'
    | 'source_sample_count_required'
    | 'outcome_ref_required'
    | 'source_outcome_count_required'
}

export interface DurationLearningScopeEvidenceWriteResult {
  status:
    | 'learning_scope_evidence_written'
    | 'learning_scope_evidence_partially_written'
    | 'learning_scope_evidence_rejected'
  writtenRows: DurationLearningScopeEvidenceWrittenRow[]
  rejectedRows: DurationLearningScopeEvidenceRejectedRow[]
}

const DURATION_OUTCOME_ASSET_KEYS = new Set<DurationLiveLearningAssetKey>([
  'base_duration_benchmark',
  'duration_cold_start_baseline',
  'forecast_residual_overlay',
  'forecast_confidence_weight',
  'standard_work_duration_seed',
])

const PLAN_NETWORK_ASSET_KEYS = new Set<DurationLiveLearningAssetKey>([
  'special_work_duration_seed',
  'wbs_reference_days',
  'dependency_rule_candidate',
  'critical_path_rule_candidate',
])

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

function isUpperLearningScope(scope: DurationLearningScope): scope is UpperLearningScope {
  return scope === 'company' || scope === 'industry' || scope === 'global'
}

function durationScopeSource(scope: UpperLearningScope) {
  if (scope === 'company') return 'company_aggregate_evidence_job'
  if (scope === 'industry') return 'industry_shared_baseline_job'
  return 'global_shared_baseline_job'
}

function planNetworkScopeSource(scope: UpperLearningScope) {
  if (scope === 'company') return 'plan_network_company_aggregate_job'
  if (scope === 'industry') return 'plan_network_industry_baseline_job'
  return 'plan_network_global_baseline_job'
}

function positiveNumber(value: unknown) {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? number : null
}

function positiveInteger(value: unknown) {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : null
}

function metadataWithLineage(
  metadata: Record<string, unknown> | null | undefined,
  additions: Record<string, unknown>,
) {
  return {
    ...(metadata ?? {}),
    ...additions,
    writer: 'durationLearningScopeEvidenceWriterService',
    writesRuntimeDirectly: false,
    writesFactDirectly: false,
  }
}

function rejectDurationRow(
  row: DurationOutcomeLearningScopeEvidenceInput,
  reason: DurationLearningScopeEvidenceRejectedRow['reason'],
): DurationLearningScopeEvidenceRejectedRow {
  return {
    evidenceId: normalizeText(row.evidenceId),
    assetKey: row.assetKey,
    sourceTable: 'duration_experience_samples',
    reason,
  }
}

function rejectPlanNetworkRow(
  row: PlanNetworkLearningScopeEvidenceInput,
  reason: DurationLearningScopeEvidenceRejectedRow['reason'],
): DurationLearningScopeEvidenceRejectedRow {
  return {
    evidenceId: normalizeText(row.evidenceId),
    assetKey: row.assetKey,
    sourceTable: 'duration_plan_network_outcomes',
    reason,
  }
}

async function writeDurationOutcomeEvidence(
  input: DurationLearningScopeEvidenceWriteInput,
  row: DurationOutcomeLearningScopeEvidenceInput,
): Promise<DurationLearningScopeEvidenceWrittenRow | DurationLearningScopeEvidenceRejectedRow> {
  const evidenceId = normalizeText(row.evidenceId)
  if (!evidenceId) return rejectDurationRow(row, 'evidence_id_required')
  if (!DURATION_OUTCOME_ASSET_KEYS.has(row.assetKey)) {
    return rejectDurationRow(row, 'asset_not_upper_scope_duration_outcome_learnable')
  }
  if (!isUpperLearningScope(row.learningScope)) {
    return rejectDurationRow(row, 'upper_scope_aggregate_writer_cannot_write_project_scope')
  }
  const representativeDurationDays = positiveNumber(row.representativeDurationDays)
  if (!representativeDurationDays) return rejectDurationRow(row, 'representative_duration_required')
  const sourceSampleCount = positiveInteger(row.sourceSampleCount)
  if (!sourceSampleCount) return rejectDurationRow(row, 'source_sample_count_required')

  const learningScopeSource = durationScopeSource(row.learningScope)
  const observedAt = normalizeText(row.observedAt) || normalizeText(input.observedAt) || new Date().toISOString()
  await input.queryExec(
    `insert into public.duration_experience_samples (
      id,
      project_id,
      task_id,
      wbs_node_type,
      planned_duration,
      actual_duration,
      completed_at,
      source_type,
      sample_strength,
      sample_status,
      confidence_level,
      confidence_score,
      included_in_benchmark,
      metadata,
      learning_scope,
      learning_scope_source,
      created_at,
      updated_at
    ) values (
      $1, $2, null, 'process', $3, $3, $4,
      'v14225_upper_scope_evidence',
      'strong',
      'active',
      'high',
      90,
      true,
      $5::jsonb,
      $6,
      $7,
      $4,
      $4
    )
    on conflict (id) do update set
      actual_duration = excluded.actual_duration,
      completed_at = excluded.completed_at,
      included_in_benchmark = true,
      metadata = excluded.metadata,
      learning_scope = excluded.learning_scope,
      learning_scope_source = excluded.learning_scope_source,
      updated_at = excluded.updated_at`,
    [
      evidenceId,
      row.projectId ?? null,
      representativeDurationDays,
      observedAt,
      JSON.stringify(metadataWithLineage(row.metadata, {
        liveLearningAssetKey: row.assetKey,
        assetKey: row.assetKey,
        learningScope: row.learningScope,
        learningScopeSource,
        companyId: row.companyId ?? null,
        sourceSampleCount,
        publicationKey: row.publicationKey ?? null,
      })),
      row.learningScope,
      learningScopeSource,
    ],
  )

  return {
    evidenceId,
    assetKey: row.assetKey,
    sourceTable: 'duration_experience_samples',
    learningScope: row.learningScope,
    learningScopeSource,
  }
}

async function writePlanNetworkEvidence(
  input: DurationLearningScopeEvidenceWriteInput,
  row: PlanNetworkLearningScopeEvidenceInput,
): Promise<DurationLearningScopeEvidenceWrittenRow | DurationLearningScopeEvidenceRejectedRow> {
  const evidenceId = normalizeText(row.evidenceId)
  if (!evidenceId) return rejectPlanNetworkRow(row, 'evidence_id_required')
  if (!PLAN_NETWORK_ASSET_KEYS.has(row.assetKey)) {
    return rejectPlanNetworkRow(row, 'asset_not_upper_scope_plan_network_learnable')
  }
  if (!isUpperLearningScope(row.learningScope)) {
    return rejectPlanNetworkRow(row, 'upper_scope_aggregate_writer_cannot_write_project_scope')
  }
  const outcomeRef = normalizeText(row.outcomeRef)
  if (!outcomeRef) return rejectPlanNetworkRow(row, 'outcome_ref_required')
  const sourceOutcomeCount = positiveInteger(row.sourceOutcomeCount)
  if (!sourceOutcomeCount) return rejectPlanNetworkRow(row, 'source_outcome_count_required')

  const learningScopeSource = planNetworkScopeSource(row.learningScope)
  const observedAt = normalizeText(row.observedAt) || normalizeText(input.observedAt) || new Date().toISOString()
  await input.queryExec(
    `insert into public.duration_plan_network_outcomes (
      id,
      asset_key,
      outcome_status,
      outcome_ref,
      learning_scope,
      learning_scope_source,
      company_id,
      project_id,
      publication_key,
      observed_at,
      metadata,
      writes_runtime_directly,
      writes_fact_directly
    ) values (
      $1, $2, 'accepted', $3, $4, $5, $6, $7, $8, $9, $10::jsonb, false, false
    )
    on conflict (id) do update set
      asset_key = excluded.asset_key,
      outcome_status = excluded.outcome_status,
      outcome_ref = excluded.outcome_ref,
      learning_scope = excluded.learning_scope,
      learning_scope_source = excluded.learning_scope_source,
      company_id = excluded.company_id,
      project_id = excluded.project_id,
      publication_key = excluded.publication_key,
      observed_at = excluded.observed_at,
      metadata = excluded.metadata,
      writes_runtime_directly = false,
      writes_fact_directly = false`,
    [
      evidenceId,
      row.assetKey,
      outcomeRef,
      row.learningScope,
      learningScopeSource,
      row.companyId ?? null,
      row.projectId ?? null,
      row.publicationKey ?? null,
      observedAt,
      JSON.stringify(metadataWithLineage(row.metadata, {
        learningScope: row.learningScope,
        learningScopeSource,
        sourceOutcomeCount,
      })),
    ],
  )

  return {
    evidenceId,
    assetKey: row.assetKey,
    sourceTable: 'duration_plan_network_outcomes',
    learningScope: row.learningScope,
    learningScopeSource,
  }
}

export async function writeDurationLearningScopeEvidence(
  input: DurationLearningScopeEvidenceWriteInput,
): Promise<DurationLearningScopeEvidenceWriteResult> {
  const writtenRows: DurationLearningScopeEvidenceWrittenRow[] = []
  const rejectedRows: DurationLearningScopeEvidenceRejectedRow[] = []

  for (const row of input.durationOutcomeEvidence ?? []) {
    const result = await writeDurationOutcomeEvidence(input, row)
    if ('reason' in result) rejectedRows.push(result)
    else writtenRows.push(result)
  }

  for (const row of input.planNetworkEvidence ?? []) {
    const result = await writePlanNetworkEvidence(input, row)
    if ('reason' in result) rejectedRows.push(result)
    else writtenRows.push(result)
  }

  return {
    status: writtenRows.length > 0 && rejectedRows.length === 0
      ? 'learning_scope_evidence_written'
      : writtenRows.length > 0
        ? 'learning_scope_evidence_partially_written'
        : 'learning_scope_evidence_rejected',
    writtenRows,
    rejectedRows,
  }
}
