import type {
  DurationLearningScope,
  DurationLearningScopeEvidence,
  DurationLiveLearningAssetKey,
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

export type ForecastScopedRuntimeAssetKey = Extract<
  DurationLiveLearningAssetKey,
  'forecast_residual_overlay' | 'forecast_confidence_weight'
>

export interface ForecastScopedRuntimeLiveLearningEvidenceInput {
  assetKey: ForecastScopedRuntimeAssetKey
  predictionEventRecorded: boolean
  actualOutcomeEventRecorded: boolean
  enabledLearningScopes: readonly DurationLearningScopeEvidence[]
  scopeExceptionApprovalId?: string | null
  runtimePublicationKey?: string | null
  rollbackTarget?: string | null
  releaseExitApproved: boolean
  impactMonitoringReady: boolean
  accuracyMetricsAvailable: boolean
}

export interface ForecastScopedRuntimeLiveLearningEvidenceFromProductionRowsInput {
  assetKey: ForecastScopedRuntimeAssetKey
  enabledLearningScopes: readonly DurationLearningScopeEvidence[]
  scopeExceptionApprovalId?: string | null
  sourceRows?: readonly DurationLiveLearningProductionEvidenceSourceRow[]
  records?: readonly DurationLiveLearningProductionEvidenceRecord[]
}

export interface ForecastScopedRuntimeLineage {
  assetKey: ForecastScopedRuntimeAssetKey
  scopeExceptionApprovalId: string | null
  runtimePublicationKey: string | null
  rollbackTarget: string | null
  enabledLearningScopes: DurationLearningScope[]
}

export interface ForecastScopedRuntimeProductionLineage {
  evidenceRefs: DurationLiveLearningProductionEvidenceRef
  rejectedRows: DurationLiveLearningRejectedProductionEvidenceSourceRow[]
  rejectedRecords: DurationLiveLearningRejectedProductionEvidenceRecord[]
}

export interface ForecastScopedRuntimeLiveLearningEvidenceDecision {
  status: 'forecast_scoped_runtime_live_learning_ready' | 'forecast_scoped_runtime_live_learning_not_ready'
  liveLearningEvidence: DurationLiveLearningEvidence
  lineage: ForecastScopedRuntimeLineage
  missingReasons: string[]
}

export type ForecastScopedRuntimeProductionLiveLearningEvidenceDecision =
  ForecastScopedRuntimeLiveLearningEvidenceDecision & {
    productionLineage: ForecastScopedRuntimeProductionLineage
  }

const FORECAST_SCOPED_RUNTIME_SCOPE_ORDER: DurationLearningScope[] = ['global', 'industry', 'company', 'project']

function normalizeText(value: unknown): string | null {
  const normalized = String(value ?? '').trim()
  return normalized || null
}

function readText(row: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = row[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return ''
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

function normalizeEnabledScopes(scopes: readonly DurationLearningScopeEvidence[]): DurationLearningScope[] {
  const normalized = new Set<DurationLearningScope>()
  for (const scope of scopes) {
    const normalizedScope = normalizeScope(scope)
    if (normalizedScope) normalized.add(normalizedScope)
  }
  return FORECAST_SCOPED_RUNTIME_SCOPE_ORDER.filter((scope) => normalized.has(scope))
}

function forecastScopedRuntimePublicationKeyFromProductionRows(
  input: Pick<ForecastScopedRuntimeLiveLearningEvidenceFromProductionRowsInput, 'assetKey' | 'sourceRows'>,
) {
  for (const source of input.sourceRows ?? []) {
    if (source.sourceTable !== 'algorithm_learnable_parameter_runtime_publications') continue
    const row = source.row
    if (readText(row, 'asset_key', 'assetKey') !== input.assetKey) continue
    const publicationStatus = readText(row, 'publication_status', 'publicationStatus')
    if (publicationStatus !== 'published' && publicationStatus !== 'canary') continue
    const publicationKey = readText(row, 'publication_key', 'publicationKey')
    if (publicationKey) return publicationKey
  }
  return null
}

function forecastScopedRuntimeProductionLineageFromProductionInput(
  input: Pick<ForecastScopedRuntimeLiveLearningEvidenceFromProductionRowsInput, 'assetKey' | 'sourceRows' | 'records'>,
): ForecastScopedRuntimeProductionLineage {
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
    evidence.assetKey === input.assetKey)
    ?? { assetKey: input.assetKey }

  return {
    evidenceRefs,
    rejectedRows: rowCollection.rejectedRows,
    rejectedRecords: evidenceCollection.rejectedRecords,
  }
}

export function buildForecastScopedRuntimeLiveLearningEvidence(
  input: ForecastScopedRuntimeLiveLearningEvidenceInput,
): ForecastScopedRuntimeLiveLearningEvidenceDecision {
  const enabledLearningScopes = normalizeEnabledScopes(input.enabledLearningScopes)
  const scopeExceptionApprovalId = normalizeText(input.scopeExceptionApprovalId)
  const runtimePublicationKey = normalizeText(input.runtimePublicationKey)
  const rollbackTarget = normalizeText(input.rollbackTarget)
  const hasCompanyProjectScope = enabledLearningScopes.includes('company') && enabledLearningScopes.includes('project')
  const scopeExceptionApproved = Boolean(scopeExceptionApprovalId && hasCompanyProjectScope)
  const runtimeConsumerUsesPublishedArtifact = Boolean(runtimePublicationKey)
  const rollbackTargetReady = Boolean(rollbackTarget)

  const missingReasons: string[] = []
  if (!input.predictionEventRecorded) missingReasons.push('forecast_prediction_event_required')
  if (!input.actualOutcomeEventRecorded) missingReasons.push('forecast_actual_outcome_required')
  if (!hasCompanyProjectScope) missingReasons.push('company_project_scope_required')
  if (!scopeExceptionApproved) missingReasons.push('forecast_scope_exception_approval_required')
  if (!runtimeConsumerUsesPublishedArtifact) missingReasons.push('runtime_consumer_publication_required')
  if (!input.releaseExitApproved) missingReasons.push('release_exit_required')
  if (!input.impactMonitoringReady) missingReasons.push('impact_monitoring_required')
  if (!rollbackTargetReady) missingReasons.push('rollback_target_required')
  if (!input.accuracyMetricsAvailable) missingReasons.push('accuracy_metrics_required')

  return {
    status: missingReasons.length === 0
      ? 'forecast_scoped_runtime_live_learning_ready'
      : 'forecast_scoped_runtime_live_learning_not_ready',
    liveLearningEvidence: {
      assetClassificationRegistered: true,
      predictionEventRecorded: input.predictionEventRecorded,
      actualOutcomeEventRecorded: input.actualOutcomeEventRecorded,
      tieredLearningPolicyRegistered: scopeExceptionApproved,
      enabledLearningScopes,
      scopeExceptionApproved,
      runtimeConsumerUsesPublishedArtifact,
      releaseExitApproved: input.releaseExitApproved,
      impactMonitoringReady: input.impactMonitoringReady,
      rollbackTargetReady,
      accuracyMetricsAvailable: input.accuracyMetricsAvailable,
    },
    lineage: {
      assetKey: input.assetKey,
      scopeExceptionApprovalId,
      runtimePublicationKey,
      rollbackTarget,
      enabledLearningScopes,
    },
    missingReasons,
  }
}

export function buildForecastScopedRuntimeLiveLearningEvidenceFromProductionRows(
  input: ForecastScopedRuntimeLiveLearningEvidenceFromProductionRowsInput,
): ForecastScopedRuntimeProductionLiveLearningEvidenceDecision {
  const productionLineage = forecastScopedRuntimeProductionLineageFromProductionInput(input)
  const evidenceRefs = productionLineage.evidenceRefs
  const rawRuntimePublicationKey = forecastScopedRuntimePublicationKeyFromProductionRows(input)
  const runtimePublicationKey = evidenceRefs.runtimeConsumerObservationRef ? rawRuntimePublicationKey : null
  const decision = buildForecastScopedRuntimeLiveLearningEvidence({
    assetKey: input.assetKey,
    predictionEventRecorded: Boolean(evidenceRefs.accuracyEvidenceRef || evidenceRefs.publicationExecutionRef),
    actualOutcomeEventRecorded: Boolean(evidenceRefs.accuracyEvidenceRef),
    enabledLearningScopes: input.enabledLearningScopes,
    scopeExceptionApprovalId: input.scopeExceptionApprovalId,
    runtimePublicationKey,
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
