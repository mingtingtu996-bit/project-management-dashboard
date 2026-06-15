import type {
  DurationLiveLearningCompletionAudit,
} from './durationLiveLearningCompletionAuditService.js'
import {
  listDurationLiveLearningManifests,
  type DurationLiveLearningAssetKey,
} from './durationLiveLearningClosureService.js'
import {
  evaluateDurationRuntimeConsumerObservationIntegrationCoverage,
  type DurationRuntimeConsumerObservationAdapterRegistration,
  type DurationRuntimeConsumerObservationIntegrationCoverage,
} from './durationRuntimeConsumerObservationIntegrationService.js'
import {
  listDurationRuntimeConsumerObservationFacadeRegistrations,
} from './durationRuntimeConsumerObservationAdapterService.js'

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
  publicationExecutionRef?: string | null
  runtimeConsumerObservationRef?: string | null
  impactMonitoringEvidenceRef?: string | null
  rollbackDrillEvidenceRef?: string | null
  accuracyEvidenceRef?: string | null
}

export type DurationLiveLearningProductionEvidenceKind =
  | 'production_sample'
  | 'publication_execution'
  | 'runtime_consumer_observation'
  | 'impact_monitoring'
  | 'rollback_drill'
  | 'accuracy'

export interface DurationLiveLearningProductionEvidenceRecord {
  assetKey: DurationLiveLearningAssetKey
  evidenceKind: DurationLiveLearningProductionEvidenceKind
  evidenceRef?: string | null
  evidenceStatus?: string | null
  consumerKey?: string | null
}

export interface DurationRuntimeConsumerObservationIdentity {
  assetKey: DurationLiveLearningAssetKey
  consumerKey: string
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
}

export interface DurationLiveLearningProductionEvidenceCollectionInput {
  records?: readonly DurationLiveLearningProductionEvidenceRecord[]
}

export type DurationLiveLearningProductionEvidenceSourceTable =
  | 'duration_experience_samples'
  | 'duration_algorithm_accuracy_events'
  | 'algorithm_learnable_parameter_runtime_publications'
  | 'algorithm_learnable_parameter_release_events'
  | 'wbs_template_runtime_publications'
  | 'wbs_template_runtime_events'
  | 'construction_dependency_rule_runtime_publications'
  | 'construction_dependency_rule_runtime_events'
  | 'runtime_consumer_observations'

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
  'algorithm_learnable_parameter_runtime_publications',
  'algorithm_learnable_parameter_release_events',
  'wbs_template_runtime_publications',
  'wbs_template_runtime_events',
  'construction_dependency_rule_runtime_publications',
  'construction_dependency_rule_runtime_events',
  'duration_algorithm_accuracy_events',
  'runtime_consumer_observations',
]

const REQUIRED_FIELDS_BY_SOURCE_TABLE: Record<DurationLiveLearningProductionEvidenceSourceTable, string[]> = {
  duration_experience_samples: [
    'id',
    'sample_status',
    'included_in_benchmark',
    'actual_duration',
    'completed_at',
    'metadata.liveLearningAssetKey',
  ],
  algorithm_learnable_parameter_runtime_publications: [
    'publication_key',
    'asset_key',
    'publication_status',
    'impact_monitoring.status',
    'impact_monitoring.eventRef',
    'rollback_execution.status',
    'rollback_execution.eventRef',
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
    'actual_context.assetKey',
    'actual_context.accuracyGateStatus',
  ],
  runtime_consumer_observations: [
    'id',
    'asset_key',
    'publication_key',
    'consumer_key',
    'observation_status',
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

export function listDurationLiveLearningProductionEvidenceSourcePlan(): DurationLiveLearningProductionEvidenceSourcePlan[] {
  return LEARNABLE_DURATION_LIVE_LEARNING_ASSET_KEYS.map((assetKey) => ({
    assetKey,
    requiredEvidenceKinds: [...REQUIRED_PRODUCTION_EVIDENCE_KINDS],
    sourceTables: [...CANONICAL_PRODUCTION_EVIDENCE_SOURCE_TABLES],
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
    const normalized = { assetKey: value.assetKey, consumerKey }
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

function accuracyGateStatus(row: Record<string, unknown>) {
  const actualContext = readRecord(row.actual_context ?? row.actualContext)
  return readText(row, 'accuracy_gate_status', 'accuracyGateStatus')
    || readText(actualContext, 'accuracyGateStatus', 'accuracy_gate_status')
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
) {
  records.push({ assetKey, evidenceKind, evidenceRef, evidenceStatus })
}

function acceptedStatusesFor(kind: DurationLiveLearningProductionEvidenceKind) {
  if (kind === 'production_sample') return new Set(['accepted', 'weak'])
  if (kind === 'publication_execution') return new Set(['published', 'canary'])
  if (kind === 'runtime_consumer_observation') return new Set(['observed'])
  if (kind === 'impact_monitoring') return new Set(['monitoring_armed', 'monitoring_running', 'monitoring_passed'])
  if (kind === 'rollback_drill') return new Set(['rollback_verified', 'rollback_executed'])
  return new Set(['accuracy_passed'])
}

function acceptedRefPrefixesFor(kind: DurationLiveLearningProductionEvidenceKind) {
  if (kind === 'production_sample') return ['duration_samples:', 'duration_outcomes:', 'network_outcomes:']
  if (kind === 'publication_execution') {
    return [
      'release_execution:',
      'algorithm_seed_versions:',
      'algorithm_learnable_parameter_runtime_publications:',
      'wbs_template_runtime:',
      'wbs_reference_days_runtime:',
      'dependency_rule_runtime:',
      'critical_path_rule_runtime:',
      'duration_benchmark_runtime:',
    ]
  }
  if (kind === 'runtime_consumer_observation') return ['runtime_consumer:', 'runtime_consumption:']
  if (kind === 'impact_monitoring') return ['impact_monitoring:']
  if (kind === 'rollback_drill') return ['rollback:']
  return ['accuracy:', 'duration_algorithm_accuracy_events:', 'duration_accuracy_replay:']
}

function hasAcceptedRefSource(kind: DurationLiveLearningProductionEvidenceKind, evidenceRef: string) {
  return acceptedRefPrefixesFor(kind).some((prefix) => evidenceRef.startsWith(prefix))
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
    if (!evidenceRef || !hasAcceptedRefSource(record.evidenceKind, evidenceRef)) continue
    observed.push({ assetKey: record.assetKey, consumerKey })
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
    if (!assetKey || !consumerKey) continue
    if (readText(row, 'observation_status', 'observationStatus') !== 'observed') continue
    if (!readText(row, 'publication_key', 'publicationKey')) continue
    if (readTrue(row, 'writes_runtime_directly', 'writesRuntimeDirectly')) continue
    if (readTrue(row, 'writes_fact_directly', 'writesFactDirectly')) continue
    observed.push({ assetKey, consumerKey })
  }
  return observed
}

export function evaluateDurationRuntimeConsumerObservationCoverage(input: {
  records?: readonly DurationLiveLearningProductionEvidenceRecord[]
  sourceRows?: readonly DurationLiveLearningProductionEvidenceSourceRow[]
} = {}): DurationRuntimeConsumerObservationCoverage {
  const requiredConsumerObservations = listDurationLiveLearningExpectedRuntimeConsumerObservations()
  const observedConsumerObservations = uniqueConsumerObservations([
    ...observedRuntimeConsumerObservationsFromRecords(input.records),
    ...observedRuntimeConsumerObservationsFromSourceRows(input.sourceRows),
  ])
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
) {
  if (kind === 'production_sample') target.productionSampleEvidenceRef ??= evidenceRef
  if (kind === 'publication_execution') target.publicationExecutionRef ??= evidenceRef
  if (kind === 'runtime_consumer_observation') target.runtimeConsumerObservationRef ??= evidenceRef
  if (kind === 'impact_monitoring') target.impactMonitoringEvidenceRef ??= evidenceRef
  if (kind === 'rollback_drill') target.rollbackDrillEvidenceRef ??= evidenceRef
  if (kind === 'accuracy') target.accuracyEvidenceRef ??= evidenceRef
}

export function collectDurationLiveLearningProductionEvidenceRefs(
  input: DurationLiveLearningProductionEvidenceCollectionInput,
): DurationLiveLearningProductionEvidenceCollection {
  const evidenceByAssetKey = new Map<DurationLiveLearningAssetKey, DurationLiveLearningProductionEvidenceRef>()
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
    if (!hasAcceptedRefSource(record.evidenceKind, evidenceRef)) {
      rejectedRecords.push({ ...record, reason: 'production_evidence_ref_source_not_allowed' })
      continue
    }

    const current = evidenceByAssetKey.get(record.assetKey) ?? { assetKey: record.assetKey }
    assignEvidenceRef(current, record.evidenceKind, evidenceRef)
    evidenceByAssetKey.set(record.assetKey, current)
  }

  return {
    productionEvidence: [...evidenceByAssetKey.values()],
    rejectedRecords,
  }
}

export function collectDurationLiveLearningProductionEvidenceRecordsFromRows(
  input: DurationLiveLearningProductionEvidenceRowCollectionInput,
): DurationLiveLearningProductionEvidenceRowCollection {
  const records: DurationLiveLearningProductionEvidenceRecord[] = []
  const rejectedRows: DurationLiveLearningRejectedProductionEvidenceSourceRow[] = []

  for (const source of input.rows ?? []) {
    const row = source.row
    const assetKey = assetKeyFromSourceRow(source)
    if (!assetKey) {
      pushRejectedRow(rejectedRows, source, 'production_source_asset_key_required')
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
      pushRecord(records, assetKey, 'production_sample', `duration_samples:${id}`, sampleEvidenceStatus(row))
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
        pushRecord(records, assetKey, 'impact_monitoring', eventRef || `impact_monitoring:${publicationKey}:${monitoringStatus}`, monitoringStatus)
      }
      const rollbackStatus = rollbackExecutionStatus(row.rollback_execution ?? row.rollbackExecution)
      if (rollbackStatus) {
        const eventRef = readText(readRecord(row.rollback_execution ?? row.rollbackExecution), 'eventRef', 'event_ref')
        pushRecord(records, assetKey, 'rollback_drill', eventRef || `rollback:${publicationKey}:${rollbackStatus}`, rollbackStatus)
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
        )
        continue
      }
      pushRejectedRow(rejectedRows, source, 'production_source_row_not_evidence_ready')
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
        pushRecord(records, assetKey, 'impact_monitoring', eventRef || `impact_monitoring:${publicationKey}:${monitoringStatus}`, monitoringStatus)
      }
      const rollbackStatus = rollbackExecutionStatus(row.rollback_execution ?? row.rollbackExecution)
      if (rollbackStatus) {
        const eventRef = readText(readRecord(row.rollback_execution ?? row.rollbackExecution), 'eventRef', 'event_ref')
        pushRecord(records, assetKey, 'rollback_drill', eventRef || `rollback:${publicationKey}:${rollbackStatus}`, rollbackStatus)
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
        )
        continue
      }
      pushRejectedRow(rejectedRows, source, 'production_source_row_not_evidence_ready')
      continue
    }

    if (source.sourceTable === 'duration_algorithm_accuracy_events') {
      const id = readText(row, 'id')
      if (!id) {
        pushRejectedRow(rejectedRows, source, 'production_source_row_id_required')
        continue
      }
      if (accuracyGateStatus(row) !== 'accuracy_passed' || !hasNumber(row, 'absolute_error_days')) {
        pushRejectedRow(rejectedRows, source, 'production_source_row_not_evidence_ready')
        continue
      }
      pushRecord(records, assetKey, 'accuracy', `duration_algorithm_accuracy_events:${id}`, 'accuracy_passed')
      continue
    }

    const id = readText(row, 'id')
    if (!id) {
      pushRejectedRow(rejectedRows, source, 'production_source_row_id_required')
      continue
    }
    if (readText(row, 'observation_status', 'observationStatus') !== 'observed') {
      pushRejectedRow(rejectedRows, source, 'production_source_row_not_evidence_ready')
      continue
    }
    pushRecord(records, assetKey, 'runtime_consumer_observation', `runtime_consumer:${id}`, 'observed')
  }

  return { records, rejectedRows }
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

function evaluateAssetEvidence(
  assetKey: DurationLiveLearningAssetKey,
  evidence: DurationLiveLearningProductionEvidenceRef | undefined,
): DurationLiveLearningProductionEvidenceGap | null {
  const missingReasonCodes: DurationLiveLearningProductionEvidenceReasonCode[] = []

  if (!hasRef(evidence?.productionSampleEvidenceRef)) {
    missingReasonCodes.push('production_sample_evidence_required')
  }
  if (!hasRef(evidence?.publicationExecutionRef)) {
    missingReasonCodes.push('publication_execution_evidence_required')
  }
  if (!hasRef(evidence?.runtimeConsumerObservationRef)) {
    missingReasonCodes.push('runtime_consumer_observation_required')
  }
  if (!hasRef(evidence?.impactMonitoringEvidenceRef)) {
    missingReasonCodes.push('impact_monitoring_evidence_required')
  }
  if (!hasRef(evidence?.rollbackDrillEvidenceRef)) {
    missingReasonCodes.push('rollback_drill_evidence_required')
  }
  if (!hasRef(evidence?.accuracyEvidenceRef)) {
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
  const missingEvidenceByAsset = input.completionAudit.learnableAssetKeys
    .map((assetKey) => evaluateAssetEvidence(assetKey, productionEvidenceMap.get(assetKey)))
    .filter((gap): gap is DurationLiveLearningProductionEvidenceGap => Boolean(gap))

  if (input.completionAudit.status !== 'duration_live_learning_completion_ready') {
    missingEvidenceByAsset.unshift({
      assetKey: input.completionAudit.learnableAssetKeys[0] ?? 'base_duration_benchmark',
      missingReasonCodes: ['completion_audit_ready_required'],
    })
  }

  const ready = input.completionAudit.status === 'duration_live_learning_completion_ready'
    && missingEvidenceByAsset.length === 0

  return {
    status: ready
      ? 'duration_live_learning_production_evidence_ready'
      : 'duration_live_learning_production_evidence_not_ready',
    allowedClaim: ready
      ? input.completionAudit.allowedClaim
      : 'not_ready_for_live_self_learning_claim',
    prohibitedClaim: input.completionAudit.prohibitedClaim,
    completionAuditStatus: input.completionAudit.status,
    productionEvidenceAssetKeys: input.completionAudit.learnableAssetKeys.filter((assetKey) =>
      productionEvidenceMap.has(assetKey)),
    missingEvidenceByAsset,
  }
}

export function buildDurationLiveLearningProductionClaimAudit(
  input: DurationLiveLearningProductionClaimAuditInput,
): DurationLiveLearningProductionClaimAudit {
  const evidenceRowCollection = collectDurationLiveLearningProductionEvidenceRecordsFromRows({
    rows: input.sourceRows,
  })
  const evidenceCollection = collectDurationLiveLearningProductionEvidenceRefs({
    records: [
      ...evidenceRowCollection.records,
      ...(input.records ?? []),
    ],
  })
  const productionGate = evaluateDurationLiveLearningProductionEvidenceGate({
    completionAudit: input.completionAudit,
    productionEvidence: evidenceCollection.productionEvidence,
  })
  const runtimeConsumerObservationCoverage = evaluateDurationRuntimeConsumerObservationCoverage({
    records: [
      ...evidenceRowCollection.records,
      ...(input.records ?? []),
    ],
    sourceRows: input.sourceRows,
  })
  const runtimeConsumerObservationIntegrationCoverage =
    evaluateDurationRuntimeConsumerObservationIntegrationCoverage({
      adapterRegistrations: input.runtimeConsumerAdapterRegistrations
        ?? listDurationRuntimeConsumerObservationFacadeRegistrations(),
    })
  const ready = productionGate.status === 'duration_live_learning_production_evidence_ready'
    && runtimeConsumerObservationCoverage.status === 'runtime_consumer_observation_coverage_ready'
    && runtimeConsumerObservationIntegrationCoverage.status === 'runtime_consumer_observation_integration_ready'

  return {
    status: ready
      ? 'duration_live_learning_production_claim_ready'
      : 'duration_live_learning_production_claim_not_ready',
    allowedClaim: ready ? productionGate.allowedClaim : 'not_ready_for_live_self_learning_claim',
    prohibitedClaim: productionGate.prohibitedClaim,
    completionAudit: input.completionAudit,
    evidenceRowCollection,
    evidenceCollection,
    productionGate,
    runtimeConsumerObservationCoverage,
    runtimeConsumerObservationIntegrationCoverage,
  }
}
