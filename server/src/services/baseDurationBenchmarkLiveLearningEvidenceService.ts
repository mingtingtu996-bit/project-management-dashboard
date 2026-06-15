import type {
  DurationLearningScope,
  DurationLearningScopeEvidence,
  DurationLiveLearningEvidence,
} from './durationLiveLearningClosureService.js'
import {
  collectDurationLiveLearningProductionEvidenceRecordsFromRows,
  collectDurationLiveLearningProductionEvidenceRefs,
  type DurationLiveLearningProductionEvidenceRecord,
  type DurationLiveLearningProductionEvidenceRef,
  type DurationLiveLearningProductionEvidenceSourceRow,
  type DurationLiveLearningRejectedProductionEvidenceRecord,
  type DurationLiveLearningRejectedProductionEvidenceSourceRow,
} from './durationLiveLearningProductionEvidenceGateService.js'

export type BaseDurationBenchmarkLearningScopeEvidence = DurationLearningScopeEvidence

export type BaseDurationBenchmarkAcceptedSampleCounts = Partial<Record<
  BaseDurationBenchmarkLearningScopeEvidence,
  number | null | undefined
>>

export interface BaseDurationBenchmarkLiveLearningEvidenceInput {
  predictionEventRecorded: boolean
  actualOutcomeEventRecorded: boolean
  enabledLearningScopes: readonly BaseDurationBenchmarkLearningScopeEvidence[]
  acceptedSampleCounts: BaseDurationBenchmarkAcceptedSampleCounts
  runtimePublicationKey?: string | null
  runtimeConsumerObservationRef?: string | null
  runtimeConsumerPublicationKey?: string | null
  rollbackTarget?: string | null
  releaseExitApproved: boolean
  impactMonitoringReady: boolean
  accuracyMetricsAvailable: boolean
}

export interface BaseDurationBenchmarkLiveLearningEvidenceFromProductionRowsInput {
  enabledLearningScopes: readonly BaseDurationBenchmarkLearningScopeEvidence[]
  sourceRows?: readonly DurationLiveLearningProductionEvidenceSourceRow[]
  records?: readonly DurationLiveLearningProductionEvidenceRecord[]
}

export interface BaseDurationBenchmarkLineage {
  assetType: 'base_duration_benchmark'
  runtimePublicationKey: string | null
  rollbackTarget: string | null
  acceptedSampleCounts: Record<DurationLearningScope, number>
  enabledLearningScopes: DurationLearningScope[]
}

export interface BaseDurationBenchmarkProductionLineage {
  evidenceRefs: DurationLiveLearningProductionEvidenceRef
  rejectedRows: DurationLiveLearningRejectedProductionEvidenceSourceRow[]
  rejectedRecords: DurationLiveLearningRejectedProductionEvidenceRecord[]
}

export interface BaseDurationBenchmarkLiveLearningEvidenceDecision {
  status: 'base_duration_benchmark_live_learning_ready' | 'base_duration_benchmark_live_learning_not_ready'
  liveLearningEvidence: DurationLiveLearningEvidence
  benchmarkLineage: BaseDurationBenchmarkLineage
  missingReasons: string[]
}

export type BaseDurationBenchmarkProductionLiveLearningEvidenceDecision =
  BaseDurationBenchmarkLiveLearningEvidenceDecision & {
    productionLineage: BaseDurationBenchmarkProductionLineage
  }

const BASE_DURATION_BENCHMARK_SCOPE_ORDER: DurationLearningScope[] = ['global', 'industry', 'company', 'project']
const BASE_DURATION_BENCHMARK_ASSET_KEY = 'base_duration_benchmark'

function normalizeText(value: unknown): string | null {
  const normalized = String(value ?? '').trim()
  return normalized || null
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

function readBoolean(row: Record<string, unknown>, key: string) {
  return row[key] === true
}

function hasFiniteNumber(row: Record<string, unknown>, key: string) {
  return typeof row[key] === 'number' && Number.isFinite(row[key])
}

function normalizeScope(value: unknown): DurationLearningScope | null {
  const normalized = String(value ?? '').trim().toLowerCase()
  if (normalized === 'global' || normalized === 'system') return 'global'
  if (normalized === 'industry' || normalized === 'industry_baseline' || normalized === 'segment_baseline') {
    return 'industry'
  }
  if (normalized === 'company') return 'company'
  if (normalized === 'project') return 'project'
  return null
}

function normalizeEnabledScopes(scopes: readonly BaseDurationBenchmarkLearningScopeEvidence[]): DurationLearningScope[] {
  const normalized = new Set<DurationLearningScope>()
  for (const scope of scopes) {
    const normalizedScope = normalizeScope(scope)
    if (normalizedScope) normalized.add(normalizedScope)
  }
  return BASE_DURATION_BENCHMARK_SCOPE_ORDER.filter((scope) => normalized.has(scope))
}

function readSampleCount(value: unknown): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return 0
  return Math.max(0, Math.round(parsed))
}

function normalizeSampleCounts(
  counts: BaseDurationBenchmarkAcceptedSampleCounts,
): Record<DurationLearningScope, number> {
  const normalized: Record<DurationLearningScope, number> = {
    global: 0,
    industry: 0,
    company: 0,
    project: 0,
  }

  for (const [scope, value] of Object.entries(counts)) {
    const normalizedScope = normalizeScope(scope)
    if (!normalizedScope) continue
    normalized[normalizedScope] += readSampleCount(value)
  }

  return normalized
}

function baseDurationAssetKeyFromSampleRow(row: Record<string, unknown>) {
  const metadata = readRecord(row.metadata)
  return readText(row, 'asset_key', 'assetKey')
    || readText(metadata, 'liveLearningAssetKey', 'live_learning_asset_key', 'assetKey', 'asset_key')
}

function baseDurationSampleScopeFromRow(row: Record<string, unknown>): DurationLearningScope | null {
  const metadata = readRecord(row.metadata)
  return normalizeScope(
    readText(row, 'learning_scope', 'learningScope', 'sample_scope', 'sampleScope', 'scope')
      || readText(metadata, 'learningScope', 'learning_scope', 'sampleScope', 'sample_scope', 'scope'),
  )
}

function isAcceptedBaseDurationSampleRow(row: Record<string, unknown>) {
  return baseDurationAssetKeyFromSampleRow(row) === BASE_DURATION_BENCHMARK_ASSET_KEY
    && readText(row, 'sample_status', 'sampleStatus') === 'active'
    && readBoolean(row, 'included_in_benchmark')
    && hasFiniteNumber(row, 'actual_duration')
    && Boolean(readText(row, 'completed_at', 'completedAt'))
}

function countAcceptedBaseDurationSamplesByScope(
  rows: readonly DurationLiveLearningProductionEvidenceSourceRow[] | undefined,
): Record<DurationLearningScope, number> {
  const counts: Record<DurationLearningScope, number> = {
    global: 0,
    industry: 0,
    company: 0,
    project: 0,
  }
  for (const source of rows ?? []) {
    if (source.sourceTable !== 'duration_experience_samples') continue
    if (!isAcceptedBaseDurationSampleRow(source.row)) continue
    const scope = baseDurationSampleScopeFromRow(source.row)
    if (!scope) continue
    counts[scope] += 1
  }
  return counts
}

function runtimePublicationKeyFromProductionRows(
  rows: readonly DurationLiveLearningProductionEvidenceSourceRow[] | undefined,
) {
  for (const source of rows ?? []) {
    if (source.sourceTable !== 'algorithm_learnable_parameter_runtime_publications') continue
    const row = source.row
    if (readText(row, 'asset_key', 'assetKey') !== BASE_DURATION_BENCHMARK_ASSET_KEY) continue
    if (readText(row, 'publication_status', 'publicationStatus') !== 'published') continue
    const publicationKey = readText(row, 'publication_key', 'publicationKey')
    if (publicationKey) return publicationKey
  }
  return null
}

function baseDurationProductionLineageFromProductionInput(
  input: Pick<BaseDurationBenchmarkLiveLearningEvidenceFromProductionRowsInput, 'sourceRows' | 'records'>,
): BaseDurationBenchmarkProductionLineage {
  const rowCollection = collectDurationLiveLearningProductionEvidenceRecordsFromRows({
    rows: input.sourceRows,
  })
  const evidenceCollection = collectDurationLiveLearningProductionEvidenceRefs({
    records: [
      ...rowCollection.records,
      ...(input.records ?? []),
    ],
  })
  const evidenceRefs = evidenceCollection.productionEvidence.find((evidence) =>
    evidence.assetKey === BASE_DURATION_BENCHMARK_ASSET_KEY)
    ?? { assetKey: BASE_DURATION_BENCHMARK_ASSET_KEY }

  return {
    evidenceRefs,
    rejectedRows: rowCollection.rejectedRows,
    rejectedRecords: evidenceCollection.rejectedRecords,
  }
}

export function buildBaseDurationBenchmarkLiveLearningEvidence(
  input: BaseDurationBenchmarkLiveLearningEvidenceInput,
): BaseDurationBenchmarkLiveLearningEvidenceDecision {
  const runtimePublicationKey = normalizeText(input.runtimePublicationKey)
  const runtimeConsumerObservationRef = normalizeText(input.runtimeConsumerObservationRef)
  const runtimeConsumerPublicationKey = normalizeText(input.runtimeConsumerPublicationKey)
  const rollbackTarget = normalizeText(input.rollbackTarget)
  const enabledLearningScopes = normalizeEnabledScopes(input.enabledLearningScopes)
  const acceptedSampleCounts = normalizeSampleCounts(input.acceptedSampleCounts)
  const hasAllLearningScopes = BASE_DURATION_BENCHMARK_SCOPE_ORDER.every((scope) => enabledLearningScopes.includes(scope))
  const hasAllScopeSamples = BASE_DURATION_BENCHMARK_SCOPE_ORDER.every((scope) => acceptedSampleCounts[scope] > 0)
  const tieredLearningPolicyRegistered = hasAllLearningScopes && hasAllScopeSamples
  const runtimeConsumerPublicationMismatched = Boolean(
    runtimeConsumerObservationRef
      && runtimePublicationKey
      && runtimeConsumerPublicationKey
      && runtimeConsumerPublicationKey !== runtimePublicationKey,
  )
  const runtimeConsumerUsesPublishedArtifact = Boolean(
    runtimeConsumerObservationRef
      && runtimePublicationKey
      && runtimeConsumerPublicationKey
      && runtimeConsumerPublicationKey === runtimePublicationKey,
  )
  const rollbackTargetReady = Boolean(rollbackTarget)

  const missingReasons: string[] = []
  if (!input.predictionEventRecorded) missingReasons.push('base_duration_prediction_event_required')
  if (!input.actualOutcomeEventRecorded) missingReasons.push('base_duration_actual_outcome_required')
  if (!hasAllLearningScopes) missingReasons.push('global_industry_company_project_learning_scopes_required')
  if (!hasAllScopeSamples) missingReasons.push('base_duration_scope_sample_coverage_required')
  if (!runtimeConsumerUsesPublishedArtifact) missingReasons.push('runtime_consumer_publication_required')
  if (runtimeConsumerPublicationMismatched) missingReasons.push('runtime_consumer_publication_mismatch')
  if (!input.releaseExitApproved) missingReasons.push('release_exit_required')
  if (!input.impactMonitoringReady) missingReasons.push('impact_monitoring_required')
  if (!rollbackTargetReady) missingReasons.push('rollback_target_required')
  if (!input.accuracyMetricsAvailable) missingReasons.push('accuracy_metrics_required')

  return {
    status: missingReasons.length === 0
      ? 'base_duration_benchmark_live_learning_ready'
      : 'base_duration_benchmark_live_learning_not_ready',
    liveLearningEvidence: {
      assetClassificationRegistered: true,
      predictionEventRecorded: input.predictionEventRecorded,
      actualOutcomeEventRecorded: input.actualOutcomeEventRecorded,
      tieredLearningPolicyRegistered,
      enabledLearningScopes,
      runtimeConsumerUsesPublishedArtifact,
      releaseExitApproved: input.releaseExitApproved,
      impactMonitoringReady: input.impactMonitoringReady,
      rollbackTargetReady,
      accuracyMetricsAvailable: input.accuracyMetricsAvailable,
    },
    benchmarkLineage: {
      assetType: 'base_duration_benchmark',
      runtimePublicationKey,
      rollbackTarget,
      acceptedSampleCounts,
      enabledLearningScopes,
    },
    missingReasons,
  }
}

export function buildBaseDurationBenchmarkLiveLearningEvidenceFromProductionRows(
  input: BaseDurationBenchmarkLiveLearningEvidenceFromProductionRowsInput,
): BaseDurationBenchmarkProductionLiveLearningEvidenceDecision {
  const acceptedSampleCounts = countAcceptedBaseDurationSamplesByScope(input.sourceRows)
  const productionLineage = baseDurationProductionLineageFromProductionInput(input)
  const evidenceRefs = productionLineage.evidenceRefs
  const rawRuntimePublicationKey = runtimePublicationKeyFromProductionRows(input.sourceRows)
  const runtimePublicationKey = rawRuntimePublicationKey
  const decision = buildBaseDurationBenchmarkLiveLearningEvidence({
    predictionEventRecorded: Boolean(evidenceRefs.accuracyEvidenceRef || evidenceRefs.publicationExecutionRef),
    actualOutcomeEventRecorded: Boolean(evidenceRefs.productionSampleEvidenceRef),
    enabledLearningScopes: input.enabledLearningScopes,
    acceptedSampleCounts,
    runtimePublicationKey,
    runtimeConsumerObservationRef: evidenceRefs.runtimeConsumerObservationRef,
    runtimeConsumerPublicationKey: evidenceRefs.runtimeConsumerPublicationKey,
    rollbackTarget: evidenceRefs.rollbackDrillEvidenceRef,
    releaseExitApproved: Boolean(evidenceRefs.publicationExecutionRef),
    impactMonitoringReady: Boolean(evidenceRefs.impactMonitoringEvidenceRef),
    accuracyMetricsAvailable: Boolean(evidenceRefs.accuracyEvidenceRef),
  })

  return {
    ...decision,
    productionLineage,
  }
}
