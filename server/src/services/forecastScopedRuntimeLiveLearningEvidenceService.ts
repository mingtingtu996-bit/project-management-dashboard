import type {
  DurationLearningScope,
  DurationLearningScopeEvidence,
  DurationLiveLearningAssetKey,
  DurationLiveLearningEvidence,
} from './durationLiveLearningClosureService.js'

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

export interface ForecastScopedRuntimeLineage {
  assetKey: ForecastScopedRuntimeAssetKey
  scopeExceptionApprovalId: string | null
  runtimePublicationKey: string | null
  rollbackTarget: string | null
  enabledLearningScopes: DurationLearningScope[]
}

export interface ForecastScopedRuntimeLiveLearningEvidenceDecision {
  status: 'forecast_scoped_runtime_live_learning_ready' | 'forecast_scoped_runtime_live_learning_not_ready'
  liveLearningEvidence: DurationLiveLearningEvidence
  lineage: ForecastScopedRuntimeLineage
  missingReasons: string[]
}

const FORECAST_SCOPED_RUNTIME_SCOPE_ORDER: DurationLearningScope[] = ['global', 'industry', 'company', 'project']

function normalizeText(value: unknown): string | null {
  const normalized = String(value ?? '').trim()
  return normalized || null
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
