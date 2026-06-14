import type {
  DurationLearningScope,
  DurationLearningScopeEvidence,
  DurationLiveLearningEvidence,
} from './durationLiveLearningClosureService.js'

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
  rollbackTarget?: string | null
  releaseExitApproved: boolean
  impactMonitoringReady: boolean
  accuracyMetricsAvailable: boolean
}

export interface BaseDurationBenchmarkLineage {
  assetType: 'base_duration_benchmark'
  runtimePublicationKey: string | null
  rollbackTarget: string | null
  acceptedSampleCounts: Record<DurationLearningScope, number>
  enabledLearningScopes: DurationLearningScope[]
}

export interface BaseDurationBenchmarkLiveLearningEvidenceDecision {
  status: 'base_duration_benchmark_live_learning_ready' | 'base_duration_benchmark_live_learning_not_ready'
  liveLearningEvidence: DurationLiveLearningEvidence
  benchmarkLineage: BaseDurationBenchmarkLineage
  missingReasons: string[]
}

const BASE_DURATION_BENCHMARK_SCOPE_ORDER: DurationLearningScope[] = ['global', 'industry', 'company', 'project']

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

export function buildBaseDurationBenchmarkLiveLearningEvidence(
  input: BaseDurationBenchmarkLiveLearningEvidenceInput,
): BaseDurationBenchmarkLiveLearningEvidenceDecision {
  const runtimePublicationKey = normalizeText(input.runtimePublicationKey)
  const rollbackTarget = normalizeText(input.rollbackTarget)
  const enabledLearningScopes = normalizeEnabledScopes(input.enabledLearningScopes)
  const acceptedSampleCounts = normalizeSampleCounts(input.acceptedSampleCounts)
  const hasAllLearningScopes = BASE_DURATION_BENCHMARK_SCOPE_ORDER.every((scope) => enabledLearningScopes.includes(scope))
  const hasAllScopeSamples = BASE_DURATION_BENCHMARK_SCOPE_ORDER.every((scope) => acceptedSampleCounts[scope] > 0)
  const tieredLearningPolicyRegistered = hasAllLearningScopes && hasAllScopeSamples
  const runtimeConsumerUsesPublishedArtifact = Boolean(runtimePublicationKey)
  const rollbackTargetReady = Boolean(rollbackTarget)

  const missingReasons: string[] = []
  if (!input.predictionEventRecorded) missingReasons.push('base_duration_prediction_event_required')
  if (!input.actualOutcomeEventRecorded) missingReasons.push('base_duration_actual_outcome_required')
  if (!hasAllLearningScopes) missingReasons.push('global_industry_company_project_learning_scopes_required')
  if (!hasAllScopeSamples) missingReasons.push('base_duration_scope_sample_coverage_required')
  if (!runtimeConsumerUsesPublishedArtifact) missingReasons.push('runtime_consumer_publication_required')
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
