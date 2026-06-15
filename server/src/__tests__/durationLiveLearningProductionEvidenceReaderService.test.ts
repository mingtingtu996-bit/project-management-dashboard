import { describe, expect, it } from 'vitest'

import {
  buildDurationLiveLearningCompletionAudit,
} from '../services/durationLiveLearningCompletionAuditService.js'
import type {
  DurationLiveLearningAssetKey,
  DurationLiveLearningEvidence,
  DurationLiveLearningEvidenceOverride,
} from '../services/durationLiveLearningClosureService.js'

const readyEvidence: DurationLiveLearningEvidence = {
  assetClassificationRegistered: true,
  predictionEventRecorded: true,
  actualOutcomeEventRecorded: true,
  tieredLearningPolicyRegistered: true,
  enabledLearningScopes: ['system', 'industry_baseline', 'company', 'project'],
  runtimeConsumerUsesPublishedArtifact: true,
  releaseExitApproved: true,
  impactMonitoringReady: true,
  rollbackTargetReady: true,
  accuracyMetricsAvailable: true,
}

const learnableAssetKeys: DurationLiveLearningAssetKey[] = [
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

const parameterPublicationAssetKeys: DurationLiveLearningAssetKey[] = [
  'base_duration_benchmark',
  'duration_cold_start_baseline',
  'forecast_residual_overlay',
  'forecast_confidence_weight',
]

const planNetworkAssetKeys: DurationLiveLearningAssetKey[] = [
  'special_work_duration_seed',
  'wbs_reference_days',
  'dependency_rule_candidate',
  'critical_path_rule_candidate',
]

const durationOutcomeAssetKeys = learnableAssetKeys.filter((assetKey) =>
  !planNetworkAssetKeys.includes(assetKey))

function publicationKeyForAsset(assetKey: DurationLiveLearningAssetKey) {
  if (assetKey === 'base_duration_benchmark') return 'duration_benchmark_runtime:base-v2'
  if (assetKey === 'duration_cold_start_baseline') return 'cold_start_baseline_runtime:segment-v2'
  if (assetKey === 'forecast_residual_overlay') return 'forecast_residual_overlay_runtime:overlay-v2'
  if (assetKey === 'forecast_confidence_weight') return 'forecast_confidence_weight_runtime:weight-v2'
  if (assetKey === 'standard_work_duration_seed') {
    return 'algorithm_seed_versions:seed-version-standard-work-duration-v2'
  }
  if (assetKey === 'special_work_duration_seed') return 'wbs_template_runtime:special-work-seed-v2'
  if (assetKey === 'wbs_reference_days') return 'wbs_reference_days_runtime:wbs-reference-days-v2'
  if (assetKey === 'dependency_rule_candidate') return 'dependency_rule_runtime:dependency-rule-v2'
  if (assetKey === 'critical_path_rule_candidate') return 'critical_path_rule_runtime:critical-path-rule-v2'
  return `publication-${assetKey}`
}

const expectedRuntimeConsumerObservations = [
  { assetKey: 'base_duration_benchmark' as const, consumerKey: 'durationSuggestionService' },
  { assetKey: 'duration_cold_start_baseline' as const, consumerKey: 'durationSuggestionService' },
  { assetKey: 'forecast_residual_overlay' as const, consumerKey: 'taskDurationForecastService' },
  { assetKey: 'forecast_residual_overlay' as const, consumerKey: 'projectRemainingDurationForecastService' },
  { assetKey: 'forecast_confidence_weight' as const, consumerKey: 'taskDurationForecastService' },
  { assetKey: 'standard_work_duration_seed' as const, consumerKey: 'durationSuggestionService' },
  { assetKey: 'special_work_duration_seed' as const, consumerKey: 'wbsTemplateGenerationService' },
  { assetKey: 'special_work_duration_seed' as const, consumerKey: 'durationSuggestionService' },
  { assetKey: 'wbs_reference_days' as const, consumerKey: 'wbsTemplateGenerationService' },
  { assetKey: 'wbs_reference_days' as const, consumerKey: 'projectRemainingDurationForecastService' },
  { assetKey: 'dependency_rule_candidate' as const, consumerKey: 'wbsTemplateGenerationService' },
  { assetKey: 'dependency_rule_candidate' as const, consumerKey: 'scheduleAccelerationService' },
  { assetKey: 'critical_path_rule_candidate' as const, consumerKey: 'projectRemainingDurationForecastService' },
  { assetKey: 'critical_path_rule_candidate' as const, consumerKey: 'scheduleAccelerationRuntimeService' },
]

const runtimeCallEvidence = [
  {
    consumerKey: 'durationSuggestionService',
    runtimeEntryRef: 'durationSuggestionService:suggestDuration',
  },
  {
    consumerKey: 'taskDurationForecastService',
    runtimeEntryRef: 'taskDurationForecastService:forecastTaskDuration',
  },
  {
    consumerKey: 'projectRemainingDurationForecastService',
    runtimeEntryRef: 'projectRemainingDurationForecastService:forecastRemainingDuration',
  },
  {
    consumerKey: 'wbsTemplateGenerationService',
    runtimeEntryRef: 'wbsTemplateGenerationService:generateTemplate',
  },
  {
    consumerKey: 'scheduleAccelerationService',
    runtimeEntryRef: 'scheduleAccelerationService:buildAccelerationPlan',
  },
  {
    consumerKey: 'scheduleAccelerationRuntimeService',
    runtimeEntryRef: 'scheduleAccelerationRuntimeService:applyRuntimeAcceleration',
  },
]

function buildReadyCompletionAudit() {
  const evidenceOverrides: DurationLiveLearningEvidenceOverride[] = learnableAssetKeys.map((assetKey) => ({
    assetKey,
    evidence: assetKey === 'forecast_residual_overlay' || assetKey === 'forecast_confidence_weight'
      ? {
          ...readyEvidence,
          enabledLearningScopes: ['company', 'project'],
          scopeExceptionApproved: true,
        }
      : readyEvidence,
  }))
  return buildDurationLiveLearningCompletionAudit({ evidenceOverrides })
}

function buildPlanNetworkOutcomeRecords() {
  return planNetworkAssetKeys.map((assetKey) => ({
    assetKey,
    evidenceKind: 'production_sample' as const,
    evidenceRef: `network_outcomes:${assetKey}:accepted`,
    evidenceStatus: 'accepted',
  }))
}

function rowsForSql(sql: string) {
  const normalized = sql.toLowerCase()
  if (normalized.includes('from public.duration_experience_samples')) {
    return durationOutcomeAssetKeys.map((assetKey) => ({
      id: `sample-${assetKey}`,
      sample_status: 'active',
      included_in_benchmark: true,
      actual_duration: 8,
      completed_at: '2026-06-01T00:00:00.000Z',
      metadata: { liveLearningAssetKey: assetKey },
    }))
  }
  if (normalized.includes('from public.algorithm_learnable_parameter_runtime_publications')) {
    return parameterPublicationAssetKeys.map((assetKey) => ({
      publication_key: publicationKeyForAsset(assetKey),
      asset_key: assetKey,
      publication_status: 'published',
      impact_monitoring: { status: 'monitoring_armed' },
      rollback_execution: { status: 'rollback_verified' },
      writes_seed_runtime_directly: false,
      target_runtime_table: 'algorithm_learnable_parameter_runtime_publications',
    }))
  }
  if (normalized.includes('from public.algorithm_seed_versions')) {
    return [{
      id: 'seed-version-standard-work-duration-v2',
      seed_type: 'standard_work_duration',
      seed_version: 'v2',
      status: 'active',
      is_current: true,
      published_at: '2026-06-14T00:00:00.000Z',
    }]
  }
  if (normalized.includes('from public.duration_algorithm_accuracy_events')) {
    return learnableAssetKeys.map((assetKey) => ({
      id: `accuracy-${assetKey}`,
      absolute_error_days: 1,
      prediction_context: { assetKey },
      actual_context: { accuracyGateStatus: 'accuracy_passed' },
    }))
  }
  if (normalized.includes('from public.runtime_consumer_observations')) {
    return expectedRuntimeConsumerObservations.map(({ assetKey, consumerKey }) => ({
      id: `consumer-${assetKey}-${consumerKey}`,
      asset_key: assetKey,
      publication_key: publicationKeyForAsset(assetKey),
      consumer_key: consumerKey,
      observation_status: 'observed',
      writes_runtime_directly: false,
      writes_fact_directly: false,
    }))
  }
  if (normalized.includes('from public.runtime_consumer_runtime_calls')) {
    return runtimeCallEvidence.map(({ consumerKey, runtimeEntryRef }) => ({
      id: `runtime-call-${consumerKey}`,
      consumer_key: consumerKey,
      runtime_entry_ref: runtimeEntryRef,
      call_status: 'called',
      writes_runtime_directly: false,
      writes_fact_directly: false,
    }))
  }
  if (normalized.includes('from public.wbs_template_runtime_publications')) {
    return [
      {
        publication_key: publicationKeyForAsset('special_work_duration_seed'),
        asset_kind: 'special_work_duration_seed',
        asset_version_id: 'special_work_duration_seed-version-v2',
        runtime_publication_status: 'runtime_published',
        impact_monitoring: { status: 'monitoring_armed' },
        rollback_execution: { status: 'rollback_verified' },
      },
      {
        publication_key: publicationKeyForAsset('wbs_reference_days'),
        asset_kind: 'wbs_reference_days',
        asset_version_id: 'wbs_reference_days-version-v2',
        runtime_publication_status: 'runtime_published',
        impact_monitoring: { status: 'monitoring_armed' },
        rollback_execution: { status: 'rollback_verified' },
      },
    ]
  }
  if (normalized.includes('from public.wbs_template_runtime_events')) return []
  if (normalized.includes('from public.construction_dependency_rule_runtime_publications')) {
    return [
      {
        publication_key: publicationKeyForAsset('dependency_rule_candidate'),
        dependency_rule_version_id: 'dependency_rule_candidate-version-v2',
        runtime_publication_status: 'runtime_published',
        dependency_rule_lineage: { assetType: 'dependency_rule_candidate' },
        impact_monitoring: { status: 'monitoring_armed' },
        rollback_execution: { status: 'rollback_verified' },
      },
      {
        publication_key: publicationKeyForAsset('critical_path_rule_candidate'),
        dependency_rule_version_id: 'critical_path_rule_candidate-version-v2',
        runtime_publication_status: 'runtime_published',
        dependency_rule_lineage: { assetType: 'critical_path_rule_candidate' },
        impact_monitoring: { status: 'monitoring_armed' },
        rollback_execution: { status: 'rollback_verified' },
      },
    ]
  }
  if (normalized.includes('from public.construction_dependency_rule_runtime_events')) return []
  if (normalized.includes('from public.algorithm_learnable_parameter_release_events')) {
    return [
      {
        event_type: 'impact_monitoring',
        event_status: 'monitoring_passed',
        source_publication_key: publicationKeyForAsset('standard_work_duration_seed'),
        event_payload: { assetKey: 'standard_work_duration_seed' },
      },
      {
        event_type: 'rollback_execution',
        event_status: 'rollback_executed',
        source_publication_key: publicationKeyForAsset('standard_work_duration_seed'),
        event_payload: { assetKey: 'standard_work_duration_seed' },
      },
    ]
  }
  throw new Error(`unexpected query: ${sql}`)
}

function buildReadyBusinessPathSourceFiles() {
  return [
    {
      sourcePath: 'server/src/services/durationSuggestionService.ts',
      sourceText: `
        import { recordDurationSuggestionConsumedArtifacts } from './durationRuntimeConsumerObservationAdapterService.js'
        export async function suggestDuration() {
          await recordDurationSuggestionConsumedArtifacts({ queryExec, artifacts: [] })
        }
      `,
    },
    {
      sourcePath: 'server/src/services/taskDurationForecastService.ts',
      sourceText: `
        import { recordTaskDurationForecastConsumedArtifacts } from './durationRuntimeConsumerObservationAdapterService.js'
        export async function forecastTaskDuration() {
          await recordTaskDurationForecastConsumedArtifacts({ queryExec, artifacts: [] })
        }
      `,
    },
    {
      sourcePath: 'server/src/services/projectRemainingDurationForecastService.ts',
      sourceText: `
        import { recordProjectRemainingDurationForecastConsumedArtifacts } from './durationRuntimeConsumerObservationAdapterService.js'
        export async function forecastRemainingDuration() {
          await recordProjectRemainingDurationForecastConsumedArtifacts({ queryExec, artifacts: [] })
        }
      `,
    },
    {
      sourcePath: 'server/src/services/wbsTemplateGenerationService.ts',
      sourceText: `
        import { recordWbsTemplateGenerationConsumedArtifacts } from './durationRuntimeConsumerObservationAdapterService.js'
        export async function generateTemplate() {
          await recordWbsTemplateGenerationConsumedArtifacts({ queryExec, artifacts: [] })
        }
      `,
    },
    {
      sourcePath: 'server/src/services/scheduleAccelerationService.ts',
      sourceText: `
        import { recordScheduleAccelerationConsumedArtifacts } from './durationRuntimeConsumerObservationAdapterService.js'
        export async function buildAccelerationPlan() {
          await recordScheduleAccelerationConsumedArtifacts({ queryExec, artifacts: [] })
        }
      `,
    },
    {
      sourcePath: 'server/src/services/scheduleAccelerationRuntimeService.ts',
      sourceText: `
        import { recordScheduleAccelerationRuntimeConsumedArtifacts } from './durationRuntimeConsumerObservationAdapterService.js'
        export async function applyRuntimeAcceleration() {
          await recordScheduleAccelerationRuntimeConsumedArtifacts({ queryExec, artifacts: [] })
        }
      `,
    },
  ]
}

describe('durationLiveLearningProductionEvidenceReaderService', () => {
  it('keeps the DB-only production claim blocked when typed network outcomes are absent', async () => {
    const {
      buildDurationLiveLearningProductionClaimAuditFromDb,
    } = await import('../services/durationLiveLearningProductionEvidenceReaderService.js')
    const queryExec = async <T = Record<string, unknown>>(sql: string): Promise<T[]> =>
      rowsForSql(sql) as T[]

    const audit = await buildDurationLiveLearningProductionClaimAuditFromDb({
      completionAudit: buildReadyCompletionAudit(),
      queryExec,
      maxRowsPerSourceTable: 200,
      runtimeConsumerBusinessPathSourceFiles: buildReadyBusinessPathSourceFiles(),
    })

    expect(audit.status).toBe('duration_live_learning_production_claim_not_ready')
    expect(audit.evidenceRowCollection.rejectedRows).toEqual([])
    expect(audit.productionGate.status).toBe('duration_live_learning_production_evidence_not_ready')
    expect(audit.productionGate.missingEvidenceByAsset).toEqual(planNetworkAssetKeys.map((assetKey) => ({
      assetKey,
      missingReasonCodes: ['production_sample_evidence_required'],
    })))
  })

  it('builds the production claim audit from canonical read-only source queries', async () => {
    const {
      buildDurationLiveLearningProductionClaimAuditFromDb,
    } = await import('../services/durationLiveLearningProductionEvidenceReaderService.js')
    const calls: Array<{ sql: string, params: unknown[] }> = []
    const queryExec = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> => {
      calls.push({ sql, params })
      return rowsForSql(sql) as T[]
    }

    const audit = await buildDurationLiveLearningProductionClaimAuditFromDb({
      completionAudit: buildReadyCompletionAudit(),
      queryExec,
      maxRowsPerSourceTable: 200,
      records: buildPlanNetworkOutcomeRecords(),
      runtimeConsumerBusinessPathSourceFiles: buildReadyBusinessPathSourceFiles(),
    })

    expect(audit.status).toBe('duration_live_learning_production_claim_ready')
    expect(audit.runtimeConsumerObservationCoverage.status).toBe('runtime_consumer_observation_coverage_ready')
    expect(audit.runtimeConsumerObservationIntegrationCoverage.status)
      .toBe('runtime_consumer_observation_integration_ready')
    expect(audit.runtimeConsumerRuntimeCallCoverage.status)
      .toBe('runtime_consumer_observation_runtime_calls_ready')
    expect(audit.runtimeConsumerBusinessPathIntegrationCoverage.status)
      .toBe('runtime_consumer_business_path_integration_ready')
    expect(audit.runtimeConsumerObservationCoverage.requiredConsumerObservations).toEqual(expectedRuntimeConsumerObservations)
    expect(audit.runtimeConsumerObservationCoverage.missingConsumerObservations).toEqual([])
    expect(audit.sourceQuery.sourceTables).toEqual([
      'duration_experience_samples',
      'duration_algorithm_accuracy_events',
      'runtime_consumer_observations',
      'runtime_consumer_runtime_calls',
      'algorithm_learnable_parameter_runtime_publications',
      'algorithm_learnable_parameter_release_events',
      'algorithm_seed_versions',
      'wbs_template_runtime_publications',
      'wbs_template_runtime_events',
      'construction_dependency_rule_runtime_publications',
      'construction_dependency_rule_runtime_events',
    ])
    expect(audit.evidenceRowCollection.rejectedRows).toEqual([])
    expect(audit.evidenceCollection.rejectedRecords).toEqual([])

    const joinedSql = calls.map((call) => call.sql.toLowerCase()).join('\n')
    expect(joinedSql).toContain('from public.duration_experience_samples')
    expect(joinedSql).toContain('from public.algorithm_learnable_parameter_runtime_publications')
    expect(joinedSql).toContain('from public.algorithm_seed_versions')
    expect(joinedSql).toContain("seed_type = 'standard_work_duration'")
    expect(joinedSql).toContain('from public.algorithm_learnable_parameter_release_events')
    expect(joinedSql).toContain('from public.wbs_template_runtime_publications')
    expect(joinedSql).toContain('from public.wbs_template_runtime_events')
    expect(joinedSql).toContain('from public.construction_dependency_rule_runtime_publications')
    expect(joinedSql).toContain('from public.construction_dependency_rule_runtime_events')
    expect(joinedSql).toContain('from public.duration_algorithm_accuracy_events')
    expect(joinedSql).toContain('from public.runtime_consumer_observations')
    expect(joinedSql).toContain('from public.runtime_consumer_runtime_calls')
    expect(joinedSql).not.toMatch(/\binsert\b|\bupdate\b|\bdelete\b/)
    expect(joinedSql).not.toContain('task_baseline_items')
    expect(joinedSql).not.toContain('monthly_plan_items')
  })

  it('loads real business path source files and keeps the claim blocked when runtime entries are not integrated', async () => {
    const {
      buildDurationLiveLearningProductionClaimAuditFromDb,
    } = await import('../services/durationLiveLearningProductionEvidenceReaderService.js')
    const queryExec = async <T = Record<string, unknown>>(sql: string): Promise<T[]> =>
      rowsForSql(sql) as T[]

    const audit = await buildDurationLiveLearningProductionClaimAuditFromDb({
      completionAudit: buildReadyCompletionAudit(),
      queryExec,
      maxRowsPerSourceTable: 200,
      records: buildPlanNetworkOutcomeRecords(),
    })

    expect(audit.status).toBe('duration_live_learning_production_claim_not_ready')
    expect(audit.runtimeConsumerBusinessPathIntegrationCoverage.status)
      .toBe('runtime_consumer_business_path_integration_not_ready')
    expect(audit.runtimeConsumerBusinessPathIntegrationCoverage.missingIntegrations.length).toBeGreaterThan(0)
  })
})
