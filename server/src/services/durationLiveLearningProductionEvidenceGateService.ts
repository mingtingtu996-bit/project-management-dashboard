import type {
  DurationLiveLearningCompletionAudit,
} from './durationLiveLearningCompletionAuditService.js'
import {
  listDurationLiveLearningManifests,
  type DurationLiveLearningAssetKey,
  type DurationLearningScope,
} from './durationLiveLearningClosureService.js'
import {
  evaluateDurationRuntimeConsumerObservationIntegrationCoverage,
  isDurationRuntimeConsumerPublicationKeyAllowedForAsset,
  type DurationRuntimeConsumerObservationAdapterRegistration,
  type DurationRuntimeConsumerObservationIntegrationCoverage,
} from './durationRuntimeConsumerObservationIntegrationService.js'
import {
  listDurationRuntimeConsumerObservationFacadeRegistrations,
} from './durationRuntimeConsumerObservationAdapterService.js'
import {
  evaluateDurationRuntimeConsumerObservationRuntimeCallCoverage,
  type DurationRuntimeConsumerObservationRuntimeCallCoverage,
  type DurationRuntimeConsumerObservationRuntimeCallEvidence,
} from './durationRuntimeConsumerObservationRuntimeCallAuditService.js'
import {
  evaluateDurationRuntimeConsumerBusinessPathIntegrationCoverage,
  type DurationRuntimeConsumerBusinessPathIntegrationCoverage,
  type DurationRuntimeConsumerBusinessPathSourceFile,
} from './durationRuntimeConsumerBusinessPathIntegrationAuditService.js'

export type DurationLiveLearningProductionEvidenceReasonCode =
  | 'completion_audit_ready_required'
  | 'production_sample_evidence_required'
  | 'publication_execution_evidence_required'
  | 'runtime_consumer_observation_required'
  | 'impact_monitoring_evidence_required'
  | 'rollback_drill_evidence_required'
  | 'accuracy_evidence_required'

export interface DurationLiveLearningProductionEvidenceRef {
  assetKey: DurationLiveLearningAssetKey
  productionSampleEvidenceRef?: string | null
  productionSamplePublicationKey?: string | null
  publicationExecutionRef?: string | null
  runtimeConsumerObservationRef?: string | null
  runtimeConsumerPublicationKey?: string | null
  impactMonitoringEvidenceRef?: string | null
  impactMonitoringPublicationKey?: string | null
  rollbackDrillEvidenceRef?: string | null
  rollbackDrillPublicationKey?: string | null
  accuracyEvidenceRef?: string | null
  accuracyPublicationKey?: string | null
}

export type DurationLiveLearningProductionEvidenceKind =
  | 'production_sample'
  | 'publication_execution'
  | 'runtime_consumer_observation'
  | 'impact_monitoring'
  | 'rollback_drill'
  | 'accuracy'

const PUBLICATION_BOUND_EVIDENCE_KINDS = new Set<DurationLiveLearningProductionEvidenceKind>([
  'runtime_consumer_observation',
  'impact_monitoring',
  'rollback_drill',
  'accuracy',
])

export interface DurationLiveLearningProductionEvidenceRecord {
  assetKey: DurationLiveLearningAssetKey
  evidenceKind: DurationLiveLearningProductionEvidenceKind
  evidenceRef?: string | null
  evidenceStatus?: string | null
  publicationKey?: string | null
  consumerKey?: string | null
  sourceEvidenceRefs?: readonly string[] | null
}

export interface DurationRuntimeConsumerObservationIdentity {
  assetKey: DurationLiveLearningAssetKey
  consumerKey: string
  publicationKey?: string | null
  sourceEvidenceRefs?: readonly string[]
}

export interface DurationRuntimeConsumerObservationCoverage {
  status:
    | 'runtime_consumer_observation_coverage_ready'
    | 'runtime_consumer_observation_coverage_not_ready'
  requiredConsumerObservations: DurationRuntimeConsumerObservationIdentity[]
  observedConsumerObservations: DurationRuntimeConsumerObservationIdentity[]
  missingConsumerObservations: DurationRuntimeConsumerObservationIdentity[]
}

export interface DurationLiveLearningRejectedProductionEvidenceRecord {
  assetKey: DurationLiveLearningAssetKey
  evidenceKind: DurationLiveLearningProductionEvidenceKind
  evidenceRef?: string | null
  evidenceStatus?: string | null
  reason:
    | 'production_evidence_ref_required'
    | 'production_evidence_status_not_accepted'
    | 'production_evidence_ref_source_not_allowed'
    | 'production_evidence_publication_key_not_allowed_for_asset'
    | 'production_evidence_direct_record_not_allowed_for_final_claim'
    | 'production_evidence_direct_record_not_allowed_for_publication_readiness'
}

export interface DurationLiveLearningProductionEvidenceCollectionInput {
  records?: readonly DurationLiveLearningProductionEvidenceRecord[]
}

export type DurationLiveLearningProductionEvidenceSourceTable =
  | 'duration_experience_samples'
  | 'duration_plan_network_outcomes'
  | 'duration_algorithm_accuracy_events'
  | 'algorithm_learnable_parameter_runtime_publications'
  | 'algorithm_seed_versions'
  | 'algorithm_learnable_parameter_release_events'
  | 'wbs_template_runtime_publications'
  | 'wbs_template_runtime_events'
  | 'construction_dependency_rule_runtime_publications'
  | 'construction_dependency_rule_runtime_events'
  | 'runtime_consumer_observations'
  | 'runtime_consumer_runtime_calls'

export interface DurationLiveLearningProductionEvidenceSourceRow {
  sourceTable: DurationLiveLearningProductionEvidenceSourceTable
  row: Record<string, unknown>
}

export interface DurationLiveLearningRejectedProductionEvidenceSourceRow {
  sourceTable: DurationLiveLearningProductionEvidenceSourceTable
  row: Record<string, unknown>
  reason:
    | 'production_source_asset_key_required'
    | 'production_source_row_id_required'
    | 'production_source_row_not_evidence_ready'
    | 'production_source_table_not_allowed_for_asset'
}

export interface DurationLiveLearningProductionEvidenceRowCollectionInput {
  rows?: readonly DurationLiveLearningProductionEvidenceSourceRow[]
}

export interface DurationLiveLearningProductionEvidenceSourcePlan {
  assetKey: DurationLiveLearningAssetKey
  requiredEvidenceKinds: DurationLiveLearningProductionEvidenceKind[]
  sourceTables: DurationLiveLearningProductionEvidenceSourceTable[]
  requiredFieldsBySourceTable: Record<DurationLiveLearningProductionEvidenceSourceTable, string[]>
}

export interface DurationLiveLearningProductionEvidenceRowCollection {
  records: DurationLiveLearningProductionEvidenceRecord[]
  rejectedRows: DurationLiveLearningRejectedProductionEvidenceSourceRow[]
}

export interface DurationLiveLearningProductionEvidenceCollection {
  productionEvidence: DurationLiveLearningProductionEvidenceRef[]
  rejectedRecords: DurationLiveLearningRejectedProductionEvidenceRecord[]
}

export interface DurationLiveLearningProductionEvidenceGateInput {
  completionAudit: DurationLiveLearningCompletionAudit
  productionEvidence?: readonly DurationLiveLearningProductionEvidenceRef[]
}

export interface DurationLiveLearningProductionEvidenceGap {
  assetKey: DurationLiveLearningAssetKey
  missingReasonCodes: DurationLiveLearningProductionEvidenceReasonCode[]
}

export interface DurationLiveLearningProductionEvidenceGate {
  status:
    | 'duration_live_learning_production_evidence_ready'
    | 'duration_live_learning_production_evidence_not_ready'
  allowedClaim: DurationLiveLearningCompletionAudit['allowedClaim']
  prohibitedClaim: DurationLiveLearningCompletionAudit['prohibitedClaim']
  completionAuditStatus: DurationLiveLearningCompletionAudit['status']
  productionEvidenceAssetKeys: DurationLiveLearningAssetKey[]
  missingEvidenceByAsset: DurationLiveLearningProductionEvidenceGap[]
}

export interface DurationLiveLearningProductionClaimAuditInput {
  completionAudit: DurationLiveLearningCompletionAudit
  records?: readonly DurationLiveLearningProductionEvidenceRecord[]
  sourceRows?: readonly DurationLiveLearningProductionEvidenceSourceRow[]
  runtimeConsumerAdapterRegistrations?: readonly DurationRuntimeConsumerObservationAdapterRegistration[]
  runtimeConsumerBusinessPathSourceFiles?: readonly DurationRuntimeConsumerBusinessPathSourceFile[]
}

export interface DurationLiveLearningSourceRowsProvenanceGate {
  status:
    | 'canonical_source_rows_provenance_ready'
    | 'canonical_source_rows_provenance_not_ready'
  requiredProvenance: 'canonical_db_reader'
  actualProvenance: 'canonical_db_reader' | 'direct_source_rows_diagnostic'
}

export interface DurationLiveLearningProductionClaimAudit {
  status:
    | 'duration_live_learning_production_claim_ready'
    | 'duration_live_learning_production_claim_not_ready'
  allowedClaim: DurationLiveLearningCompletionAudit['allowedClaim']
  prohibitedClaim: DurationLiveLearningCompletionAudit['prohibitedClaim']
  completionAudit: DurationLiveLearningCompletionAudit
  evidenceRowCollection: DurationLiveLearningProductionEvidenceRowCollection
  evidenceCollection: DurationLiveLearningProductionEvidenceCollection
  productionGate: DurationLiveLearningProductionEvidenceGate
  runtimeConsumerObservationCoverage: DurationRuntimeConsumerObservationCoverage
  runtimeConsumerObservationIntegrationCoverage: DurationRuntimeConsumerObservationIntegrationCoverage
  runtimeConsumerRuntimeCallCoverage: DurationRuntimeConsumerObservationRuntimeCallCoverage
  runtimeConsumerBusinessPathIntegrationCoverage: DurationRuntimeConsumerBusinessPathIntegrationCoverage
  sourceRowsProvenanceGate: DurationLiveLearningSourceRowsProvenanceGate
}

const LEARNABLE_DURATION_LIVE_LEARNING_ASSET_KEYS: DurationLiveLearningAssetKey[] = [
  'base_duration_benchmark',
  'duration_cold_start_baseline',
  'forecast_residual_overlay',
  'forecast_confidence_weight',
  'standard_work_duration_seed',
  'special_work_duration_seed',
  'wbs_reference_days',
  'dependency_rule_candidate',
  'critical_path_rule_candidate',
]

const REQUIRED_PRODUCTION_EVIDENCE_KINDS: DurationLiveLearningProductionEvidenceKind[] = [
  'production_sample',
  'publication_execution',
  'runtime_consumer_observation',
  'impact_monitoring',
  'rollback_drill',
  'accuracy',
]

const CANONICAL_PRODUCTION_EVIDENCE_SOURCE_TABLES: DurationLiveLearningProductionEvidenceSourceTable[] = [
  'duration_experience_samples',
  'duration_plan_network_outcomes',
  'algorithm_learnable_parameter_runtime_publications',
  'algorithm_seed_versions',
  'algorithm_learnable_parameter_release_events',
  'wbs_template_runtime_publications',
  'wbs_template_runtime_events',
  'construction_dependency_rule_runtime_publications',
  'construction_dependency_rule_runtime_events',
  'duration_algorithm_accuracy_events',
  'runtime_consumer_observations',
  'runtime_consumer_runtime_calls',
]

const DURATION_OUTCOME_PRODUCTION_EVIDENCE_SOURCE_TABLES: DurationLiveLearningProductionEvidenceSourceTable[] = [
  'duration_experience_samples',
  'duration_algorithm_accuracy_events',
  'runtime_consumer_observations',
  'runtime_consumer_runtime_calls',
]

const NETWORK_OUTCOME_PRODUCTION_EVIDENCE_SOURCE_TABLES: DurationLiveLearningProductionEvidenceSourceTable[] = [
  'duration_plan_network_outcomes',
  'duration_algorithm_accuracy_events',
  'runtime_consumer_observations',
  'runtime_consumer_runtime_calls',
]

const PARAMETER_RUNTIME_PUBLICATION_ASSET_KEYS = new Set<DurationLiveLearningAssetKey>([
  'base_duration_benchmark',
  'duration_cold_start_baseline',
  'forecast_residual_overlay',
  'forecast_confidence_weight',
])

const WBS_RUNTIME_PUBLICATION_ASSET_KEYS = new Set<DurationLiveLearningAssetKey>([
  'special_work_duration_seed',
  'wbs_reference_days',
])

const CONSTRUCTION_DEPENDENCY_RUNTIME_PUBLICATION_ASSET_KEYS = new Set<DurationLiveLearningAssetKey>([
  'dependency_rule_candidate',
  'critical_path_rule_candidate',
])

const PLAN_NETWORK_PRODUCTION_SAMPLE_ASSET_KEYS = new Set<DurationLiveLearningAssetKey>([
  'special_work_duration_seed',
  'wbs_reference_days',
  'dependency_rule_candidate',
  'critical_path_rule_candidate',
])

const REQUIRED_FIELDS_BY_SOURCE_TABLE: Record<DurationLiveLearningProductionEvidenceSourceTable, string[]> = {
  duration_experience_samples: [
    'id',
    'sample_status',
    'included_in_benchmark',
    'actual_duration',
    'completed_at',
    'learning_scope',
    'learning_scope_source',
    'metadata.liveLearningAssetKey',
  ],
  duration_plan_network_outcomes: [
    'id',
    'asset_key',
    'outcome_status',
    'learning_scope',
    'learning_scope_source',
    'writes_runtime_directly',
    'writes_fact_directly',
  ],
  algorithm_learnable_parameter_runtime_publications: [
    'publication_key',
    'asset_key',
    'publication_status',
    'release_package.scopeExceptionApprovalId',
    'release_package.scopeExceptionApprovalStatus',
    'impact_monitoring.status',
    'impact_monitoring.eventRef',
    'rollback_execution.status',
    'rollback_execution.eventRef',
  ],
  algorithm_seed_versions: [
    'id',
    'seed_type',
    'seed_version',
    'status',
    'is_current',
    'published_at',
  ],
  algorithm_learnable_parameter_release_events: [
    'source_publication_key',
    'event_type',
    'event_status',
    'event_payload.assetKey',
  ],
  wbs_template_runtime_publications: [
    'publication_key',
    'asset_kind',
    'asset_version_id',
    'runtime_publication_status',
    'impact_monitoring.status',
    'rollback_execution.status',
  ],
  wbs_template_runtime_events: [
    'source_publication_key',
    'event_type',
    'event_status',
    'event_payload.runtimePublication.assetKind',
  ],
  construction_dependency_rule_runtime_publications: [
    'publication_key',
    'dependency_rule_version_id',
    'runtime_publication_status',
    'dependency_rule_lineage.assetType',
    'impact_monitoring.status',
    'rollback_execution.status',
  ],
  construction_dependency_rule_runtime_events: [
    'source_publication_key',
    'event_type',
    'event_status',
    'event_payload.runtimePublication.assetType',
  ],
  duration_algorithm_accuracy_events: [
    'id',
    'absolute_error_days',
    'prediction_context.assetKey',
    'prediction_context.publicationKey',
    'actual_context.assetKey',
    'actual_context.accuracyGateStatus',
  ],
  runtime_consumer_observations: [
    'id',
    'asset_key',
    'publication_key',
    'consumer_key',
    'observation_status',
    'source_evidence_refs',
    'writes_runtime_directly',
    'writes_fact_directly',
  ],
  runtime_consumer_runtime_calls: [
    'id',
    'consumer_key',
    'runtime_entry_ref',
    'call_status',
    'source_evidence_refs',
    'writes_runtime_directly',
    'writes_fact_directly',
  ],
}

function cloneRequiredFieldsBySourceTable() {
  return Object.fromEntries(
    Object.entries(REQUIRED_FIELDS_BY_SOURCE_TABLE).map(([sourceTable, fields]) => [
      sourceTable,
      [...fields],
    ]),
  ) as Record<DurationLiveLearningProductionEvidenceSourceTable, string[]>
}

function sourceTablesForAssetKey(
  assetKey: DurationLiveLearningAssetKey,
): DurationLiveLearningProductionEvidenceSourceTable[] {
  if (PARAMETER_RUNTIME_PUBLICATION_ASSET_KEYS.has(assetKey)) {
    return [
      ...DURATION_OUTCOME_PRODUCTION_EVIDENCE_SOURCE_TABLES,
      'algorithm_learnable_parameter_runtime_publications',
      'algorithm_learnable_parameter_release_events',
    ]
  }

  if (assetKey === 'standard_work_duration_seed') {
    return [
      ...DURATION_OUTCOME_PRODUCTION_EVIDENCE_SOURCE_TABLES,
      'algorithm_seed_versions',
      'algorithm_learnable_parameter_release_events',
    ]
  }

  if (WBS_RUNTIME_PUBLICATION_ASSET_KEYS.has(assetKey)) {
    return [
      ...NETWORK_OUTCOME_PRODUCTION_EVIDENCE_SOURCE_TABLES,
      'wbs_template_runtime_publications',
      'wbs_template_runtime_events',
    ]
  }

  if (CONSTRUCTION_DEPENDENCY_RUNTIME_PUBLICATION_ASSET_KEYS.has(assetKey)) {
    return [
      ...NETWORK_OUTCOME_PRODUCTION_EVIDENCE_SOURCE_TABLES,
      'construction_dependency_rule_runtime_publications',
      'construction_dependency_rule_runtime_events',
    ]
  }

  return [...DURATION_OUTCOME_PRODUCTION_EVIDENCE_SOURCE_TABLES]
}

export function listDurationLiveLearningProductionEvidenceSourcePlan(): DurationLiveLearningProductionEvidenceSourcePlan[] {
  return LEARNABLE_DURATION_LIVE_LEARNING_ASSET_KEYS.map((assetKey) => ({
    assetKey,
    requiredEvidenceKinds: [...REQUIRED_PRODUCTION_EVIDENCE_KINDS],
    sourceTables: sourceTablesForAssetKey(assetKey),
    requiredFieldsBySourceTable: cloneRequiredFieldsBySourceTable(),
  }))
}

function hasRef(value: string | null | undefined) {
  return typeof value === 'string' && value.trim().length > 0
}

function normalizeText(value: string | null | undefined) {
  return typeof value === 'string' ? value.trim() : ''
}

function readText(row: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = row[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return ''
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function normalizeStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return Array.from(new Set(value
      .map((item) => normalizeText(typeof item === 'string' ? item : null))
      .filter(Boolean)))
  }
  if (typeof value === 'string') {
    try {
      return normalizeStringArray(JSON.parse(value))
    } catch {
      const normalized = normalizeText(value)
      return normalized ? [normalized] : []
    }
  }
  return []
}

function readSourceEvidenceRefs(row: Record<string, unknown>) {
  return normalizeStringArray(row.source_evidence_refs ?? row.sourceEvidenceRefs)
}

function readRuntimePublicationFromPayload(row: Record<string, unknown>) {
  const payload = readRecord(row.event_payload ?? row.eventPayload)
  return readRecord(payload.runtimePublication ?? payload.runtime_publication)
}

function inferPlanNetworkAssetKeyFromPublicationKey(publicationKey: string): DurationLiveLearningAssetKey | null {
  if (publicationKey.startsWith('wbs_reference_days_runtime:')) return 'wbs_reference_days'
  if (publicationKey.startsWith('dependency_rule_runtime:')) return 'dependency_rule_candidate'
  if (publicationKey.startsWith('critical_path_rule_runtime:')) return 'critical_path_rule_candidate'
  return null
}

function inferSeedAssetKeyFromSeedType(seedType: string): DurationLiveLearningAssetKey | null {
  if (seedType === 'standard_work_duration') return 'standard_work_duration_seed'
  return null
}

function readBoolean(row: Record<string, unknown>, key: string) {
  return row[key] === true
}

function hasNumber(row: Record<string, unknown>, key: string) {
  return typeof row[key] === 'number' && Number.isFinite(row[key])
}

function readTrue(row: Record<string, unknown>, ...keys: string[]) {
  return keys.some((key) => row[key] === true)
}

function normalizeConsumerKey(value: string | null | undefined) {
  return normalizeText(value).replace(/\.ts$/i, '')
}

function consumerObservationKey(item: DurationRuntimeConsumerObservationIdentity) {
  return `${item.assetKey}::${item.consumerKey}`
}

function uniqueConsumerObservations(
  values: DurationRuntimeConsumerObservationIdentity[],
): DurationRuntimeConsumerObservationIdentity[] {
  const map = new Map<string, DurationRuntimeConsumerObservationIdentity>()
  for (const value of values) {
    const consumerKey = normalizeConsumerKey(value.consumerKey)
    if (!consumerKey) continue
    const publicationKey = normalizeText(value.publicationKey)
    const sourceEvidenceRefs = normalizeStringArray(value.sourceEvidenceRefs)
    const existing = map.get(consumerObservationKey({
      assetKey: value.assetKey,
      consumerKey,
    }))
    const normalized = {
      assetKey: value.assetKey,
      consumerKey,
      ...(publicationKey ? { publicationKey } : {}),
      ...(sourceEvidenceRefs.length > 0 || existing?.sourceEvidenceRefs?.length
        ? {
            sourceEvidenceRefs: Array.from(new Set([
              ...(existing?.sourceEvidenceRefs ?? []),
              ...sourceEvidenceRefs,
            ])),
          }
        : {}),
    }
    map.set(consumerObservationKey(normalized), normalized)
  }
  return [...map.values()]
}

function assetKeyFromRow(row: Record<string, unknown>): DurationLiveLearningAssetKey | null {
  const direct = readText(row, 'asset_key', 'assetKey')
  if (direct) return direct as DurationLiveLearningAssetKey
  const metadata = readRecord(row.metadata)
  const eventPayload = readRecord(row.event_payload ?? row.eventPayload)
  const predictionContext = readRecord(row.prediction_context ?? row.predictionContext)
  const actualContext = readRecord(row.actual_context ?? row.actualContext)
  const nested = readText(metadata, 'liveLearningAssetKey', 'live_learning_asset_key', 'assetKey', 'asset_key')
    || readText(eventPayload, 'liveLearningAssetKey', 'live_learning_asset_key', 'assetKey', 'asset_key')
    || readText(predictionContext, 'liveLearningAssetKey', 'live_learning_asset_key', 'assetKey', 'asset_key')
    || readText(actualContext, 'liveLearningAssetKey', 'live_learning_asset_key', 'assetKey', 'asset_key')
  return nested ? nested as DurationLiveLearningAssetKey : null
}

function assetKeyFromSourceRow(source: DurationLiveLearningProductionEvidenceSourceRow): DurationLiveLearningAssetKey | null {
  const row = source.row
  if (source.sourceTable === 'algorithm_seed_versions') {
    return inferSeedAssetKeyFromSeedType(readText(row, 'seed_type', 'seedType'))
  }
  if (source.sourceTable === 'wbs_template_runtime_publications') {
    const assetKind = readText(row, 'asset_kind', 'assetKind')
    return assetKind ? assetKind as DurationLiveLearningAssetKey : null
  }
  if (source.sourceTable === 'wbs_template_runtime_events') {
    const runtimePublication = readRuntimePublicationFromPayload(row)
    const assetKind = readText(runtimePublication, 'assetKind', 'asset_kind')
    return assetKind
      ? assetKind as DurationLiveLearningAssetKey
      : inferPlanNetworkAssetKeyFromPublicationKey(readText(row, 'source_publication_key', 'sourcePublicationKey'))
  }
  if (source.sourceTable === 'construction_dependency_rule_runtime_publications') {
    const lineage = readRecord(row.dependency_rule_lineage ?? row.dependencyRuleLineage)
    const assetType = readText(lineage, 'assetType', 'asset_type')
    return assetType
      ? assetType as DurationLiveLearningAssetKey
      : inferPlanNetworkAssetKeyFromPublicationKey(readText(row, 'publication_key', 'publicationKey'))
  }
  if (source.sourceTable === 'construction_dependency_rule_runtime_events') {
    const runtimePublication = readRuntimePublicationFromPayload(row)
    const assetType = readText(runtimePublication, 'assetType', 'asset_type')
    return assetType
      ? assetType as DurationLiveLearningAssetKey
      : inferPlanNetworkAssetKeyFromPublicationKey(readText(row, 'source_publication_key', 'sourcePublicationKey'))
  }
  return assetKeyFromRow(row)
}

function isActiveBenchmarkSample(row: Record<string, unknown>) {
  return readText(row, 'sample_status', 'sampleStatus') === 'active'
    && readBoolean(row, 'included_in_benchmark')
    && hasNumber(row, 'actual_duration')
}

function sampleEvidenceStatus(row: Record<string, unknown>) {
  return readText(row, 'completed_at', 'completedAt') ? 'accepted' : 'weak'
}

function planNetworkOutcomeEvidenceStatus(row: Record<string, unknown>) {
  const status = readText(row, 'outcome_status', 'outcomeStatus')
  return status === 'accepted' || status === 'weak' ? status : ''
}

function normalizeLearningScope(value: string | null | undefined): DurationLearningScope | null {
  const normalized = normalizeText(value).toLowerCase()
  if (normalized === 'system' || normalized === 'global') return 'global'
  if (normalized === 'industry' || normalized === 'industry_baseline' || normalized === 'segment_baseline') {
    return 'industry'
  }
  if (normalized === 'company') return 'company'
  if (normalized === 'project') return 'project'
  return null
}

const DURATION_SAMPLE_SCOPE_SOURCE_BY_SCOPE: Record<DurationLearningScope, string> = {
  global: 'global_shared_baseline_job',
  industry: 'industry_shared_baseline_job',
  company: 'company_aggregate_evidence_job',
  project: 'task_completion_writer',
}

const PLAN_NETWORK_SCOPE_SOURCE_BY_SCOPE: Record<DurationLearningScope, string> = {
  global: 'plan_network_global_baseline_job',
  industry: 'plan_network_industry_baseline_job',
  company: 'plan_network_company_aggregate_job',
  project: 'project_business_outcome_writer',
}

function hasMatchingLearningScopeSource(
  row: Record<string, unknown>,
  expectedSourcesByScope: Record<DurationLearningScope, string>,
) {
  const scope = normalizeLearningScope(readText(row, 'learning_scope', 'learningScope'))
  if (!scope) return false
  const source = readText(row, 'learning_scope_source', 'learningScopeSource')
  return source === expectedSourcesByScope[scope]
}

function durationSampleHasMatchingLearningScopeSource(row: Record<string, unknown>) {
  return hasMatchingLearningScopeSource(row, DURATION_SAMPLE_SCOPE_SOURCE_BY_SCOPE)
}

function planNetworkOutcomeHasMatchingLearningScopeSource(row: Record<string, unknown>) {
  return hasMatchingLearningScopeSource(row, PLAN_NETWORK_SCOPE_SOURCE_BY_SCOPE)
}

function sourceTableAllowedForAssetKey(
  assetKey: DurationLiveLearningAssetKey,
  sourceTable: DurationLiveLearningProductionEvidenceSourceTable,
) {
  return sourceTablesForAssetKey(assetKey).includes(sourceTable)
}

function accuracyGateStatus(row: Record<string, unknown>) {
  const actualContext = readRecord(row.actual_context ?? row.actualContext)
  return readText(row, 'accuracy_gate_status', 'accuracyGateStatus')
    || readText(actualContext, 'accuracyGateStatus', 'accuracy_gate_status')
}

function accuracyPublicationKey(row: Record<string, unknown>) {
  const predictionContext = readRecord(row.prediction_context ?? row.predictionContext)
  const actualContext = readRecord(row.actual_context ?? row.actualContext)
  return readText(row, 'publication_key', 'publicationKey')
    || readText(predictionContext, 'publicationKey', 'publication_key', 'runtimePublicationKey', 'runtime_publication_key')
    || readText(actualContext, 'publicationKey', 'publication_key', 'runtimePublicationKey', 'runtime_publication_key')
}

function publicationEvidenceStatus(row: Record<string, unknown>) {
  const status = readText(row, 'publication_status', 'publicationStatus')
  return status === 'published' || status === 'canary' ? status : ''
}

function runtimePublicationEvidenceStatus(row: Record<string, unknown>) {
  const status = readText(row, 'runtime_publication_status', 'runtimePublicationStatus')
  return status === 'runtime_published' ? 'published' : ''
}

function impactMonitoringStatus(value: unknown) {
  const monitoring = readRecord(value)
  const status = readText(monitoring, 'status')
  return status === 'monitoring_armed' || status === 'monitoring_running' || status === 'monitoring_passed'
    ? status
    : ''
}

function rollbackExecutionStatus(value: unknown) {
  const rollback = readRecord(value)
  const status = readText(rollback, 'status')
  return status === 'rollback_verified' || status === 'rollback_executed' ? status : ''
}

function pushRejectedRow(
  rejectedRows: DurationLiveLearningRejectedProductionEvidenceSourceRow[],
  source: DurationLiveLearningProductionEvidenceSourceRow,
  reason: DurationLiveLearningRejectedProductionEvidenceSourceRow['reason'],
) {
  rejectedRows.push({ ...source, reason })
}

function pushRecord(
  records: DurationLiveLearningProductionEvidenceRecord[],
  assetKey: DurationLiveLearningAssetKey,
  evidenceKind: DurationLiveLearningProductionEvidenceKind,
  evidenceRef: string,
  evidenceStatus: string,
  publicationKey?: string | null,
) {
  records.push({
    assetKey,
    evidenceKind,
    evidenceRef,
    evidenceStatus,
    ...(publicationKey ? { publicationKey } : {}),
  })
}

function acceptedStatusesFor(kind: DurationLiveLearningProductionEvidenceKind) {
  if (kind === 'production_sample') return new Set(['accepted'])
  if (kind === 'publication_execution') return new Set(['published', 'canary'])
  if (kind === 'runtime_consumer_observation') return new Set(['observed'])
  if (kind === 'impact_monitoring') return new Set(['monitoring_armed', 'monitoring_running', 'monitoring_passed'])
  if (kind === 'rollback_drill') return new Set(['rollback_verified', 'rollback_executed'])
  return new Set(['accuracy_passed'])
}

function acceptedPublicationExecutionRefPrefixesForAsset(
  assetKey: DurationLiveLearningAssetKey,
) {
  if (PARAMETER_RUNTIME_PUBLICATION_ASSET_KEYS.has(assetKey)) {
    return [
      'algorithm_learnable_parameter_runtime_publications:',
      'duration_benchmark_runtime:',
    ]
  }
  if (assetKey === 'standard_work_duration_seed') {
    return ['algorithm_seed_versions:']
  }
  if (assetKey === 'special_work_duration_seed') {
    return ['wbs_template_runtime:']
  }
  if (assetKey === 'wbs_reference_days') {
    return ['wbs_reference_days_runtime:']
  }
  if (assetKey === 'dependency_rule_candidate') {
    return ['dependency_rule_runtime:']
  }
  if (assetKey === 'critical_path_rule_candidate') {
    return ['critical_path_rule_runtime:']
  }
  return []
}

function acceptedRefPrefixesFor(
  kind: DurationLiveLearningProductionEvidenceKind,
  assetKey?: DurationLiveLearningAssetKey,
) {
  if (kind === 'production_sample') {
    if (assetKey && PLAN_NETWORK_PRODUCTION_SAMPLE_ASSET_KEYS.has(assetKey)) return ['network_outcomes:']
    if (assetKey) return ['duration_samples:', 'duration_outcomes:']
    return ['duration_samples:', 'duration_outcomes:', 'network_outcomes:']
  }
  if (kind === 'publication_execution') {
    return assetKey ? acceptedPublicationExecutionRefPrefixesForAsset(assetKey) : []
  }
  if (kind === 'runtime_consumer_observation') return ['runtime_consumer:', 'runtime_consumption:']
  if (kind === 'impact_monitoring') return ['impact_monitoring:']
  if (kind === 'rollback_drill') return ['rollback:']
  return ['accuracy:', 'duration_algorithm_accuracy_events:', 'duration_accuracy_replay:']
}

function hasAcceptedRefSource(
  kind: DurationLiveLearningProductionEvidenceKind,
  evidenceRef: string,
  assetKey?: DurationLiveLearningAssetKey,
) {
  return acceptedRefPrefixesFor(kind, assetKey).some((prefix) => evidenceRef.startsWith(prefix))
}

export function listDurationLiveLearningExpectedRuntimeConsumerObservations(): DurationRuntimeConsumerObservationIdentity[] {
  return uniqueConsumerObservations(
    listDurationLiveLearningManifests().flatMap((manifest) =>
      manifest.implementationAnchors.runtimeConsumers.map((consumerKey) => ({
        assetKey: manifest.assetKey,
        consumerKey,
      }))),
  )
}

function observedRuntimeConsumerObservationsFromRecords(
  records: readonly DurationLiveLearningProductionEvidenceRecord[] | undefined,
): DurationRuntimeConsumerObservationIdentity[] {
  const observed: DurationRuntimeConsumerObservationIdentity[] = []
  for (const record of records ?? []) {
    if (record.evidenceKind !== 'runtime_consumer_observation') continue
    const evidenceRef = normalizeText(record.evidenceRef)
    const consumerKey = normalizeConsumerKey(record.consumerKey)
    if (!consumerKey) continue
    if (!acceptedStatusesFor(record.evidenceKind).has(normalizeText(record.evidenceStatus))) continue
    if (!evidenceRef || !hasAcceptedRefSource(record.evidenceKind, evidenceRef, record.assetKey)) continue
    if (!isDurationRuntimeConsumerPublicationKeyAllowedForAsset(record.assetKey, record.publicationKey)) continue
    observed.push({
      assetKey: record.assetKey,
      consumerKey,
      publicationKey: record.publicationKey,
      sourceEvidenceRefs: normalizeStringArray(record.sourceEvidenceRefs),
    })
  }
  return observed
}

function observedRuntimeConsumerObservationsFromSourceRows(
  sourceRows: readonly DurationLiveLearningProductionEvidenceSourceRow[] | undefined,
): DurationRuntimeConsumerObservationIdentity[] {
  const observed: DurationRuntimeConsumerObservationIdentity[] = []
  for (const source of sourceRows ?? []) {
    if (source.sourceTable !== 'runtime_consumer_observations') continue
    const row = source.row
    const assetKey = assetKeyFromSourceRow(source)
    const consumerKey = normalizeConsumerKey(readText(row, 'consumer_key', 'consumerKey'))
    const publicationKey = readText(row, 'publication_key', 'publicationKey')
    if (!assetKey || !consumerKey) continue
    if (readText(row, 'observation_status', 'observationStatus') !== 'observed') continue
    if (!isDurationRuntimeConsumerPublicationKeyAllowedForAsset(assetKey, publicationKey)) continue
    if (readTrue(row, 'writes_runtime_directly', 'writesRuntimeDirectly')) continue
    if (readTrue(row, 'writes_fact_directly', 'writesFactDirectly')) continue
    observed.push({
      assetKey,
      consumerKey,
      publicationKey,
      sourceEvidenceRefs: readSourceEvidenceRefs(row),
    })
  }
  return observed
}

function runtimeConsumerObservationMatchesProductionPublication(
  observation: DurationRuntimeConsumerObservationIdentity,
  productionEvidence: DurationLiveLearningProductionEvidenceRef | undefined,
) {
  if (!productionEvidence) return true
  return publicationRefMatchesPublicationKey(
    productionEvidence.publicationExecutionRef,
    observation.publicationKey,
  )
}

export function evaluateDurationRuntimeConsumerObservationCoverage(input: {
  records?: readonly DurationLiveLearningProductionEvidenceRecord[]
  sourceRows?: readonly DurationLiveLearningProductionEvidenceSourceRow[]
  productionEvidence?: readonly DurationLiveLearningProductionEvidenceRef[]
} = {}): DurationRuntimeConsumerObservationCoverage {
  const requiredConsumerObservations = listDurationLiveLearningExpectedRuntimeConsumerObservations()
  const productionEvidenceMap = buildProductionEvidenceMap(input.productionEvidence)
  const observedConsumerObservations = uniqueConsumerObservations([
    ...observedRuntimeConsumerObservationsFromRecords(input.records),
    ...observedRuntimeConsumerObservationsFromSourceRows(input.sourceRows),
  ].filter((observation) =>
    runtimeConsumerObservationMatchesProductionPublication(
      observation,
      productionEvidenceMap.get(observation.assetKey),
    )))
  const observedKeys = new Set(observedConsumerObservations.map(consumerObservationKey))
  const missingConsumerObservations = requiredConsumerObservations
    .filter((item) => !observedKeys.has(consumerObservationKey(item)))

  return {
    status: missingConsumerObservations.length === 0
      ? 'runtime_consumer_observation_coverage_ready'
      : 'runtime_consumer_observation_coverage_not_ready',
    requiredConsumerObservations,
    observedConsumerObservations,
    missingConsumerObservations,
  }
}

function assignEvidenceRef(
  target: DurationLiveLearningProductionEvidenceRef,
  kind: DurationLiveLearningProductionEvidenceKind,
  evidenceRef: string,
  publicationKey?: string | null,
) {
  if (kind === 'production_sample') {
    target.productionSampleEvidenceRef ??= evidenceRef
    const normalizedPublicationKey = normalizeText(publicationKey)
    if (normalizedPublicationKey) target.productionSamplePublicationKey ??= normalizedPublicationKey
  }
  if (kind === 'publication_execution') target.publicationExecutionRef ??= evidenceRef
  if (kind === 'runtime_consumer_observation') {
    target.runtimeConsumerObservationRef ??= evidenceRef
    target.runtimeConsumerPublicationKey ??= normalizeText(publicationKey)
  }
  if (kind === 'impact_monitoring') {
    target.impactMonitoringEvidenceRef ??= evidenceRef
    const normalizedPublicationKey = normalizeText(publicationKey)
    if (normalizedPublicationKey) target.impactMonitoringPublicationKey ??= normalizedPublicationKey
  }
  if (kind === 'rollback_drill') {
    target.rollbackDrillEvidenceRef ??= evidenceRef
    const normalizedPublicationKey = normalizeText(publicationKey)
    if (normalizedPublicationKey) target.rollbackDrillPublicationKey ??= normalizedPublicationKey
  }
  if (kind === 'accuracy') target.accuracyEvidenceRef ??= evidenceRef
  if (kind === 'accuracy') {
    const normalizedPublicationKey = normalizeText(publicationKey)
    if (normalizedPublicationKey) target.accuracyPublicationKey ??= normalizedPublicationKey
  }
}

function evidenceRecordMatchesPublicationExecution(
  record: DurationLiveLearningProductionEvidenceRecord,
  publicationExecutionRef: string | null | undefined,
) {
  if (record.evidenceKind === 'production_sample' && normalizeText(record.publicationKey)) {
    if (!hasRef(publicationExecutionRef)) return true
    return publicationRefMatchesPublicationKey(publicationExecutionRef, record.publicationKey)
  }
  if (!PUBLICATION_BOUND_EVIDENCE_KINDS.has(record.evidenceKind)) return true
  if (!hasRef(publicationExecutionRef)) return true
  return publicationRefMatchesPublicationKey(publicationExecutionRef, record.publicationKey)
}

function assignFirstMatchingEvidenceRecord(
  target: DurationLiveLearningProductionEvidenceRef,
  records: readonly DurationLiveLearningProductionEvidenceRecord[],
  kind: DurationLiveLearningProductionEvidenceKind,
) {
  const sameKindRecords = records.filter((record) => record.evidenceKind === kind)
  const matchingRecord = sameKindRecords.find((record) =>
    evidenceRecordMatchesPublicationExecution(record, target.publicationExecutionRef))
    ?? sameKindRecords[0]
  if (!matchingRecord) return
  assignEvidenceRef(
    target,
    kind,
    normalizeText(matchingRecord.evidenceRef),
    matchingRecord.publicationKey,
  )
}

function buildProductionEvidenceForAsset(
  assetKey: DurationLiveLearningAssetKey,
  records: readonly DurationLiveLearningProductionEvidenceRecord[],
): DurationLiveLearningProductionEvidenceRef {
  const target: DurationLiveLearningProductionEvidenceRef = { assetKey }
  assignFirstMatchingEvidenceRecord(target, records, 'publication_execution')
  assignFirstMatchingEvidenceRecord(target, records, 'production_sample')
  assignFirstMatchingEvidenceRecord(target, records, 'runtime_consumer_observation')
  assignFirstMatchingEvidenceRecord(target, records, 'impact_monitoring')
  assignFirstMatchingEvidenceRecord(target, records, 'rollback_drill')
  assignFirstMatchingEvidenceRecord(target, records, 'accuracy')
  return target
}

export function collectDurationLiveLearningProductionEvidenceRefs(
  input: DurationLiveLearningProductionEvidenceCollectionInput,
): DurationLiveLearningProductionEvidenceCollection {
  const recordsByAssetKey = new Map<DurationLiveLearningAssetKey, DurationLiveLearningProductionEvidenceRecord[]>()
  const rejectedRecords: DurationLiveLearningRejectedProductionEvidenceRecord[] = []

  for (const record of input.records ?? []) {
    const evidenceRef = normalizeText(record.evidenceRef)
    if (!evidenceRef) {
      rejectedRecords.push({ ...record, reason: 'production_evidence_ref_required' })
      continue
    }

    const acceptedStatuses = acceptedStatusesFor(record.evidenceKind)
    if (!acceptedStatuses.has(normalizeText(record.evidenceStatus))) {
      rejectedRecords.push({ ...record, reason: 'production_evidence_status_not_accepted' })
      continue
    }
    if (!hasAcceptedRefSource(record.evidenceKind, evidenceRef, record.assetKey)) {
      rejectedRecords.push({ ...record, reason: 'production_evidence_ref_source_not_allowed' })
      continue
    }
    if (
      (
        PUBLICATION_BOUND_EVIDENCE_KINDS.has(record.evidenceKind)
        || normalizeText(record.publicationKey)
      )
      && !isDurationRuntimeConsumerPublicationKeyAllowedForAsset(record.assetKey, record.publicationKey)
    ) {
      rejectedRecords.push({ ...record, reason: 'production_evidence_publication_key_not_allowed_for_asset' })
      continue
    }

    const recordsForAsset = recordsByAssetKey.get(record.assetKey) ?? []
    recordsForAsset.push({ ...record, evidenceRef })
    recordsByAssetKey.set(record.assetKey, recordsForAsset)
  }

  return {
    productionEvidence: [...recordsByAssetKey.entries()]
      .map(([assetKey, records]) => buildProductionEvidenceForAsset(assetKey, records)),
    rejectedRecords,
  }
}

export function collectDurationLiveLearningProductionEvidenceRecordsFromRows(
  input: DurationLiveLearningProductionEvidenceRowCollectionInput,
): DurationLiveLearningProductionEvidenceRowCollection {
  const records: DurationLiveLearningProductionEvidenceRecord[] = []
  const rejectedRows: DurationLiveLearningRejectedProductionEvidenceSourceRow[] = []

  for (const source of input.rows ?? []) {
    if (source.sourceTable === 'runtime_consumer_runtime_calls') {
      continue
    }

    const row = source.row
    const assetKey = assetKeyFromSourceRow(source)
    if (!assetKey) {
      pushRejectedRow(rejectedRows, source, 'production_source_asset_key_required')
      continue
    }

    if (!sourceTableAllowedForAssetKey(assetKey, source.sourceTable)) {
      pushRejectedRow(rejectedRows, source, 'production_source_table_not_allowed_for_asset')
      continue
    }

    if (source.sourceTable === 'duration_experience_samples') {
      const id = readText(row, 'id')
      if (!id) {
        pushRejectedRow(rejectedRows, source, 'production_source_row_id_required')
        continue
      }
      if (!isActiveBenchmarkSample(row)) {
        pushRejectedRow(rejectedRows, source, 'production_source_row_not_evidence_ready')
        continue
      }
      if (!durationSampleHasMatchingLearningScopeSource(row)) {
        pushRejectedRow(rejectedRows, source, 'production_source_row_not_evidence_ready')
        continue
      }
      pushRecord(
        records,
        assetKey,
        'production_sample',
        `duration_samples:${id}`,
        sampleEvidenceStatus(row),
        readText(row, 'publication_key', 'publicationKey'),
      )
      continue
    }

    if (source.sourceTable === 'duration_plan_network_outcomes') {
      const id = readText(row, 'id')
      const outcomeStatus = planNetworkOutcomeEvidenceStatus(row)
      if (!id) {
        pushRejectedRow(rejectedRows, source, 'production_source_row_id_required')
        continue
      }
      if (
        !outcomeStatus
        || readTrue(row, 'writes_runtime_directly', 'writesRuntimeDirectly')
        || readTrue(row, 'writes_fact_directly', 'writesFactDirectly')
        || !planNetworkOutcomeHasMatchingLearningScopeSource(row)
      ) {
        pushRejectedRow(rejectedRows, source, 'production_source_row_not_evidence_ready')
        continue
      }
      pushRecord(
        records,
        assetKey,
        'production_sample',
        `network_outcomes:${id}`,
        outcomeStatus,
        readText(row, 'publication_key', 'publicationKey'),
      )
      continue
    }

    if (source.sourceTable === 'algorithm_learnable_parameter_runtime_publications') {
      const publicationKey = readText(row, 'publication_key', 'publicationKey')
      const publicationStatus = publicationEvidenceStatus(row)
      if (!publicationKey) {
        pushRejectedRow(rejectedRows, source, 'production_source_row_id_required')
        continue
      }
      if (!publicationStatus) {
        pushRejectedRow(rejectedRows, source, 'production_source_row_not_evidence_ready')
        continue
      }
      pushRecord(
        records,
        assetKey,
        'publication_execution',
        `algorithm_learnable_parameter_runtime_publications:${publicationKey}`,
        publicationStatus,
      )

      const monitoringStatus = impactMonitoringStatus(row.impact_monitoring ?? row.impactMonitoring)
      if (monitoringStatus) {
        const eventRef = readText(readRecord(row.impact_monitoring ?? row.impactMonitoring), 'eventRef', 'event_ref')
        pushRecord(
          records,
          assetKey,
          'impact_monitoring',
          eventRef || `impact_monitoring:${publicationKey}:${monitoringStatus}`,
          monitoringStatus,
          publicationKey,
        )
      }
      const rollbackStatus = rollbackExecutionStatus(row.rollback_execution ?? row.rollbackExecution)
      if (rollbackStatus) {
        const eventRef = readText(readRecord(row.rollback_execution ?? row.rollbackExecution), 'eventRef', 'event_ref')
        pushRecord(
          records,
          assetKey,
          'rollback_drill',
          eventRef || `rollback:${publicationKey}:${rollbackStatus}`,
          rollbackStatus,
          publicationKey,
        )
      }
      continue
    }

    if (source.sourceTable === 'algorithm_learnable_parameter_release_events') {
      const sourcePublicationKey = readText(row, 'source_publication_key', 'sourcePublicationKey')
      const eventType = readText(row, 'event_type', 'eventType')
      const eventStatus = readText(row, 'event_status', 'eventStatus')
      if (!sourcePublicationKey) {
        pushRejectedRow(rejectedRows, source, 'production_source_row_id_required')
        continue
      }
      if (eventType === 'impact_monitoring' && eventStatus === 'monitoring_passed') {
        pushRecord(
          records,
          assetKey,
          'impact_monitoring',
          `impact_monitoring:${sourcePublicationKey}:monitoring_passed`,
          'monitoring_passed',
          sourcePublicationKey,
        )
        continue
      }
      if (eventType === 'rollback_execution' && eventStatus === 'rollback_executed') {
        pushRecord(
          records,
          assetKey,
          'rollback_drill',
          `rollback:${sourcePublicationKey}:rollback_executed`,
          'rollback_executed',
          sourcePublicationKey,
        )
        continue
      }
      pushRejectedRow(rejectedRows, source, 'production_source_row_not_evidence_ready')
      continue
    }

    if (source.sourceTable === 'algorithm_seed_versions') {
      const seedVersionId = readText(row, 'id')
      const seedType = readText(row, 'seed_type', 'seedType')
      if (!seedVersionId || !seedType) {
        pushRejectedRow(rejectedRows, source, 'production_source_row_id_required')
        continue
      }
      if (
        seedType !== 'standard_work_duration'
        || readText(row, 'status') !== 'active'
        || !readBoolean(row, 'is_current')
        || !readText(row, 'published_at', 'publishedAt')
      ) {
        pushRejectedRow(rejectedRows, source, 'production_source_row_not_evidence_ready')
        continue
      }
      pushRecord(
        records,
        assetKey,
        'publication_execution',
        `algorithm_seed_versions:${seedVersionId}`,
        'published',
      )
      continue
    }

    if (
      source.sourceTable === 'wbs_template_runtime_publications'
      || source.sourceTable === 'construction_dependency_rule_runtime_publications'
    ) {
      const publicationKey = readText(row, 'publication_key', 'publicationKey')
      const publicationStatus = runtimePublicationEvidenceStatus(row)
      if (!publicationKey) {
        pushRejectedRow(rejectedRows, source, 'production_source_row_id_required')
        continue
      }
      if (!publicationStatus) {
        pushRejectedRow(rejectedRows, source, 'production_source_row_not_evidence_ready')
        continue
      }
      pushRecord(records, assetKey, 'publication_execution', publicationKey, publicationStatus)

      const monitoringStatus = impactMonitoringStatus(row.impact_monitoring ?? row.impactMonitoring)
      if (monitoringStatus) {
        const eventRef = readText(readRecord(row.impact_monitoring ?? row.impactMonitoring), 'eventRef', 'event_ref')
        pushRecord(
          records,
          assetKey,
          'impact_monitoring',
          eventRef || `impact_monitoring:${publicationKey}:${monitoringStatus}`,
          monitoringStatus,
          publicationKey,
        )
      }
      const rollbackStatus = rollbackExecutionStatus(row.rollback_execution ?? row.rollbackExecution)
      if (rollbackStatus) {
        const eventRef = readText(readRecord(row.rollback_execution ?? row.rollbackExecution), 'eventRef', 'event_ref')
        pushRecord(
          records,
          assetKey,
          'rollback_drill',
          eventRef || `rollback:${publicationKey}:${rollbackStatus}`,
          rollbackStatus,
          publicationKey,
        )
      }
      continue
    }

    if (
      source.sourceTable === 'wbs_template_runtime_events'
      || source.sourceTable === 'construction_dependency_rule_runtime_events'
    ) {
      const sourcePublicationKey = readText(row, 'source_publication_key', 'sourcePublicationKey')
      const eventType = readText(row, 'event_type', 'eventType')
      const eventStatus = readText(row, 'event_status', 'eventStatus')
      if (!sourcePublicationKey) {
        pushRejectedRow(rejectedRows, source, 'production_source_row_id_required')
        continue
      }
      if (eventType === 'impact_monitoring' && eventStatus === 'monitoring_passed') {
        pushRecord(
          records,
          assetKey,
          'impact_monitoring',
          `impact_monitoring:${sourcePublicationKey}:monitoring_passed`,
          'monitoring_passed',
          sourcePublicationKey,
        )
        continue
      }
      if (eventType === 'rollback_execution' && eventStatus === 'rollback_executed') {
        pushRecord(
          records,
          assetKey,
          'rollback_drill',
          `rollback:${sourcePublicationKey}:rollback_executed`,
          'rollback_executed',
          sourcePublicationKey,
        )
        continue
      }
      pushRejectedRow(rejectedRows, source, 'production_source_row_not_evidence_ready')
      continue
    }

    if (source.sourceTable === 'duration_algorithm_accuracy_events') {
      const id = readText(row, 'id')
      const publicationKey = accuracyPublicationKey(row)
      if (!id) {
        pushRejectedRow(rejectedRows, source, 'production_source_row_id_required')
        continue
      }
      if (
        accuracyGateStatus(row) !== 'accuracy_passed'
        || !hasNumber(row, 'absolute_error_days')
        || !isDurationRuntimeConsumerPublicationKeyAllowedForAsset(assetKey, publicationKey)
      ) {
        pushRejectedRow(rejectedRows, source, 'production_source_row_not_evidence_ready')
        continue
      }
      pushRecord(
        records,
        assetKey,
        'accuracy',
        `duration_algorithm_accuracy_events:${id}`,
        'accuracy_passed',
        publicationKey,
      )
      continue
    }

    const id = readText(row, 'id')
    if (!id) {
      pushRejectedRow(rejectedRows, source, 'production_source_row_id_required')
      continue
    }
    const publicationKey = readText(row, 'publication_key', 'publicationKey')
    const consumerKey = normalizeConsumerKey(readText(row, 'consumer_key', 'consumerKey'))
    if (
      readText(row, 'observation_status', 'observationStatus') !== 'observed'
      || !isDurationRuntimeConsumerPublicationKeyAllowedForAsset(assetKey, publicationKey)
      || !consumerKey
      || readTrue(row, 'writes_runtime_directly', 'writesRuntimeDirectly')
      || readTrue(row, 'writes_fact_directly', 'writesFactDirectly')
    ) {
      pushRejectedRow(rejectedRows, source, 'production_source_row_not_evidence_ready')
      continue
    }
    records.push({
      assetKey,
      consumerKey,
      evidenceKind: 'runtime_consumer_observation',
      evidenceRef: `runtime_consumer:${id}`,
      publicationKey,
      evidenceStatus: 'observed',
    })
  }

  return { records, rejectedRows }
}

function runtimeConsumerRuntimeCallEvidenceFromSourceRows(
  sourceRows: readonly DurationLiveLearningProductionEvidenceSourceRow[] | undefined,
): DurationRuntimeConsumerObservationRuntimeCallEvidence[] {
  const evidence: DurationRuntimeConsumerObservationRuntimeCallEvidence[] = []
  for (const source of sourceRows ?? []) {
    if (source.sourceTable !== 'runtime_consumer_runtime_calls') continue
    const row = source.row
    if (!readText(row, 'id')) continue
    if (readText(row, 'call_status', 'callStatus') !== 'called') continue
    if (readTrue(row, 'writes_runtime_directly', 'writesRuntimeDirectly')) continue
    if (readTrue(row, 'writes_fact_directly', 'writesFactDirectly')) continue
    const consumerKey = readText(row, 'consumer_key', 'consumerKey')
    const runtimeEntryRef = readText(row, 'runtime_entry_ref', 'runtimeEntryRef')
    if (!consumerKey || !runtimeEntryRef) continue
    evidence.push({
      consumerKey,
      runtimeEntryRef,
      evidenceRef: `runtime_consumer_runtime_calls:${readText(row, 'id')}`,
      sourceEvidenceRefs: readSourceEvidenceRefs(row),
    })
  }
  return evidence
}

function splitFinalClaimDirectProductionEvidenceRecords(
  records: readonly DurationLiveLearningProductionEvidenceRecord[] | undefined,
) {
  const allowedRecords: DurationLiveLearningProductionEvidenceRecord[] = []
  const rejectedRecords: DurationLiveLearningRejectedProductionEvidenceRecord[] = []

  for (const record of records ?? []) {
    rejectedRecords.push({
      ...record,
      reason: 'production_evidence_direct_record_not_allowed_for_final_claim',
    })
  }

  return { allowedRecords, rejectedRecords }
}

export function splitPublicationReadinessDirectProductionEvidenceRecords(
  records: readonly DurationLiveLearningProductionEvidenceRecord[] | undefined,
) {
  const allowedRecords: DurationLiveLearningProductionEvidenceRecord[] = []
  const rejectedRecords: DurationLiveLearningRejectedProductionEvidenceRecord[] = []

  for (const record of records ?? []) {
    if (
      record.evidenceKind === 'production_sample'
      && PLAN_NETWORK_PRODUCTION_SAMPLE_ASSET_KEYS.has(record.assetKey)
    ) {
      allowedRecords.push(record)
      continue
    }
    rejectedRecords.push({
      ...record,
      reason: 'production_evidence_direct_record_not_allowed_for_publication_readiness',
    })
  }

  return { allowedRecords, rejectedRecords }
}

function buildProductionEvidenceMap(
  productionEvidence: readonly DurationLiveLearningProductionEvidenceRef[] | undefined,
) {
  const map = new Map<DurationLiveLearningAssetKey, DurationLiveLearningProductionEvidenceRef>()
  for (const evidence of productionEvidence ?? []) {
    map.set(evidence.assetKey, evidence)
  }
  return map
}

function publicationRefMatchesPublicationKey(
  publicationExecutionRef: string | null | undefined,
  publicationKey: string | null | undefined,
) {
  const publicationRef = normalizeText(publicationExecutionRef)
  const normalizedPublicationKey = normalizeText(publicationKey)
  return Boolean(publicationRef)
    && Boolean(normalizedPublicationKey)
    && (
      publicationRef === normalizedPublicationKey
      || publicationRef.endsWith(`:${normalizedPublicationKey}`)
    )
}

function evaluateAssetEvidence(
  assetKey: DurationLiveLearningAssetKey,
  evidence: DurationLiveLearningProductionEvidenceRef | undefined,
): DurationLiveLearningProductionEvidenceGap | null {
  const missingReasonCodes: DurationLiveLearningProductionEvidenceReasonCode[] = []

  if (
    !hasRef(evidence?.productionSampleEvidenceRef)
    || !hasAcceptedRefSource('production_sample', evidence.productionSampleEvidenceRef, assetKey)
    || (
      normalizeText(evidence.productionSamplePublicationKey)
      && !publicationRefMatchesPublicationKey(evidence.publicationExecutionRef, evidence.productionSamplePublicationKey)
    )
  ) {
    missingReasonCodes.push('production_sample_evidence_required')
  }
  if (
    !hasRef(evidence?.publicationExecutionRef)
    || !hasAcceptedRefSource('publication_execution', evidence.publicationExecutionRef, assetKey)
  ) {
    missingReasonCodes.push('publication_execution_evidence_required')
  }
  if (
    !hasRef(evidence?.runtimeConsumerObservationRef)
    || !hasAcceptedRefSource('runtime_consumer_observation', evidence.runtimeConsumerObservationRef, assetKey)
    || !isDurationRuntimeConsumerPublicationKeyAllowedForAsset(assetKey, evidence.runtimeConsumerPublicationKey)
    || !publicationRefMatchesPublicationKey(evidence.publicationExecutionRef, evidence.runtimeConsumerPublicationKey)
  ) {
    missingReasonCodes.push('runtime_consumer_observation_required')
  }
  if (
    !hasRef(evidence?.impactMonitoringEvidenceRef)
    || !hasAcceptedRefSource('impact_monitoring', evidence.impactMonitoringEvidenceRef, assetKey)
    || !publicationRefMatchesPublicationKey(evidence.publicationExecutionRef, evidence.impactMonitoringPublicationKey)
  ) {
    missingReasonCodes.push('impact_monitoring_evidence_required')
  }
  if (
    !hasRef(evidence?.rollbackDrillEvidenceRef)
    || !hasAcceptedRefSource('rollback_drill', evidence.rollbackDrillEvidenceRef, assetKey)
    || !publicationRefMatchesPublicationKey(evidence.publicationExecutionRef, evidence.rollbackDrillPublicationKey)
  ) {
    missingReasonCodes.push('rollback_drill_evidence_required')
  }
  if (
    !hasRef(evidence?.accuracyEvidenceRef)
    || !hasAcceptedRefSource('accuracy', evidence.accuracyEvidenceRef, assetKey)
    || !publicationRefMatchesPublicationKey(evidence.publicationExecutionRef, evidence.accuracyPublicationKey)
  ) {
    missingReasonCodes.push('accuracy_evidence_required')
  }

  return missingReasonCodes.length > 0
    ? { assetKey, missingReasonCodes }
    : null
}

export function evaluateDurationLiveLearningProductionEvidenceGate(
  input: DurationLiveLearningProductionEvidenceGateInput,
): DurationLiveLearningProductionEvidenceGate {
  const productionEvidenceMap = buildProductionEvidenceMap(input.productionEvidence)
  const claimAssetKeys = LEARNABLE_DURATION_LIVE_LEARNING_ASSET_KEYS
  const missingEvidenceByAsset = claimAssetKeys
    .map((assetKey) => evaluateAssetEvidence(assetKey, productionEvidenceMap.get(assetKey)))
    .filter((gap): gap is DurationLiveLearningProductionEvidenceGap => Boolean(gap))

  if (input.completionAudit.status !== 'duration_live_learning_completion_ready') {
    missingEvidenceByAsset.unshift({
      assetKey: claimAssetKeys[0] ?? 'base_duration_benchmark',
      missingReasonCodes: ['completion_audit_ready_required'],
    })
  }

  const ready = input.completionAudit.status === 'duration_live_learning_completion_ready'
    && missingEvidenceByAsset.length === 0

  return {
    status: ready
      ? 'duration_live_learning_production_evidence_ready'
      : 'duration_live_learning_production_evidence_not_ready',
    allowedClaim: 'not_ready_for_live_self_learning_claim',
    prohibitedClaim: input.completionAudit.prohibitedClaim,
    completionAuditStatus: input.completionAudit.status,
    productionEvidenceAssetKeys: claimAssetKeys.filter((assetKey) =>
      productionEvidenceMap.has(assetKey)),
    missingEvidenceByAsset,
  }
}

function buildDurationLiveLearningProductionClaimAuditDiagnostic(
  input: DurationLiveLearningProductionClaimAuditInput,
): DurationLiveLearningProductionClaimAudit {
  const evidenceRowCollection = collectDurationLiveLearningProductionEvidenceRecordsFromRows({
    rows: input.sourceRows,
  })
  const directRecordCollection = splitFinalClaimDirectProductionEvidenceRecords(input.records)
  const claimEvidenceRecords = [
    ...evidenceRowCollection.records,
    ...directRecordCollection.allowedRecords,
  ]
  const collectedEvidence = collectDurationLiveLearningProductionEvidenceRefs({
    records: claimEvidenceRecords,
  })
  const evidenceCollection: DurationLiveLearningProductionEvidenceCollection = {
    productionEvidence: collectedEvidence.productionEvidence,
    rejectedRecords: [
      ...collectedEvidence.rejectedRecords,
      ...directRecordCollection.rejectedRecords,
    ],
  }
  const productionGate = evaluateDurationLiveLearningProductionEvidenceGate({
    completionAudit: input.completionAudit,
    productionEvidence: evidenceCollection.productionEvidence,
  })
  const runtimeConsumerObservationCoverage = evaluateDurationRuntimeConsumerObservationCoverage({
    records: claimEvidenceRecords,
    sourceRows: input.sourceRows,
    productionEvidence: evidenceCollection.productionEvidence,
  })
  const runtimeConsumerObservationIntegrationCoverage =
    evaluateDurationRuntimeConsumerObservationIntegrationCoverage({
      adapterRegistrations: input.runtimeConsumerAdapterRegistrations
        ?? listDurationRuntimeConsumerObservationFacadeRegistrations(),
    })
  const runtimeConsumerRuntimeCallCoverage = evaluateDurationRuntimeConsumerObservationRuntimeCallCoverage({
    runtimeCallEvidence: runtimeConsumerRuntimeCallEvidenceFromSourceRows(input.sourceRows),
    observedConsumerObservations: runtimeConsumerObservationCoverage.observedConsumerObservations,
  })
  const runtimeConsumerBusinessPathIntegrationCoverage =
    evaluateDurationRuntimeConsumerBusinessPathIntegrationCoverage({
      sourceFiles: input.runtimeConsumerBusinessPathSourceFiles,
    })
  const sourceRowsProvenanceGate: DurationLiveLearningSourceRowsProvenanceGate = {
    status: 'canonical_source_rows_provenance_not_ready',
    requiredProvenance: 'canonical_db_reader',
    actualProvenance: 'direct_source_rows_diagnostic',
  }
  const ready = productionGate.status === 'duration_live_learning_production_evidence_ready'
    && runtimeConsumerObservationCoverage.status === 'runtime_consumer_observation_coverage_ready'
    && runtimeConsumerObservationIntegrationCoverage.status === 'runtime_consumer_observation_integration_ready'
    && runtimeConsumerRuntimeCallCoverage.status === 'runtime_consumer_observation_runtime_calls_ready'
    && runtimeConsumerBusinessPathIntegrationCoverage.status === 'runtime_consumer_business_path_integration_ready'
    && sourceRowsProvenanceGate.status === 'canonical_source_rows_provenance_ready'

  return {
    status: ready
      ? 'duration_live_learning_production_claim_ready'
      : 'duration_live_learning_production_claim_not_ready',
    allowedClaim: 'not_ready_for_live_self_learning_claim',
    prohibitedClaim: productionGate.prohibitedClaim,
    completionAudit: input.completionAudit,
    evidenceRowCollection,
    evidenceCollection,
    productionGate,
    runtimeConsumerObservationCoverage,
    runtimeConsumerObservationIntegrationCoverage,
    runtimeConsumerRuntimeCallCoverage,
    runtimeConsumerBusinessPathIntegrationCoverage,
    sourceRowsProvenanceGate,
  }
}

export function buildDurationLiveLearningProductionClaimAudit(
  input: DurationLiveLearningProductionClaimAuditInput,
): DurationLiveLearningProductionClaimAudit {
  return buildDurationLiveLearningProductionClaimAuditDiagnostic(input)
}
