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
    runtimeEntryRef: 'durationSuggestionService:getTaskDurationSuggestion',
  },
  {
    consumerKey: 'taskDurationForecastService',
    runtimeEntryRef: 'taskDurationForecastService:forecastTaskDuration',
  },
  {
    consumerKey: 'projectRemainingDurationForecastService',
    runtimeEntryRef: 'projectRemainingDurationForecastService:buildProjectRemainingDurationForecast',
  },
  {
    consumerKey: 'wbsTemplateGenerationService',
    runtimeEntryRef: 'wbsTemplateGenerationService:generateWbsTemplateRows',
  },
  {
    consumerKey: 'scheduleAccelerationService',
    runtimeEntryRef: 'scheduleAccelerationService:evaluateRuntimeDelayRecoveryWithCriticalPath',
  },
  {
    consumerKey: 'scheduleAccelerationRuntimeService',
    runtimeEntryRef: 'scheduleAccelerationRuntimeService:evaluateRuntimeScheduleAcceleration',
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

function buildPlanNetworkOutcomeRows() {
  return planNetworkAssetKeys.flatMap((assetKey) =>
    ['global', 'industry', 'company', 'project'].map((learningScope) => ({
      id: `outcome-${assetKey}-${learningScope}`,
      asset_key: assetKey,
      outcome_status: 'accepted',
      outcome_ref: `network_outcomes:${assetKey}:${learningScope}:accepted`,
      learning_scope: learningScope,
      learning_scope_source: planNetworkLearningScopeSource(learningScope),
      metadata: { learningScope },
      writes_runtime_directly: false,
      writes_fact_directly: false,
    })))
}

function durationLearningScopeSource(learningScope: string) {
  if (learningScope === 'global') return 'global_shared_baseline_job'
  if (learningScope === 'industry') return 'industry_shared_baseline_job'
  if (learningScope === 'company') return 'company_aggregate_evidence_job'
  return 'task_completion_writer'
}

function planNetworkLearningScopeSource(learningScope: string) {
  if (learningScope === 'global') return 'plan_network_global_baseline_job'
  if (learningScope === 'industry') return 'plan_network_industry_baseline_job'
  if (learningScope === 'company') return 'plan_network_company_aggregate_job'
  return 'project_business_outcome_writer'
}

function rowsForSql(sql: string, options: { includePlanNetworkOutcomes?: boolean } = {}) {
  const includePlanNetworkOutcomes = options.includePlanNetworkOutcomes ?? true
  const normalized = sql.toLowerCase()
  if (normalized.includes('from public.duration_plan_network_outcomes')) {
    return includePlanNetworkOutcomes ? buildPlanNetworkOutcomeRows() : []
  }
  if (normalized.includes('from public.duration_experience_samples')) {
    const rows: Array<Record<string, unknown>> = []
    for (const assetKey of durationOutcomeAssetKeys) {
      if (assetKey === 'base_duration_benchmark') {
        rows.push(...['global', 'industry', 'company', 'project'].map((learningScope) => ({
          id: `sample-${assetKey}-${learningScope}`,
          sample_status: 'active',
          included_in_benchmark: true,
          actual_duration: 8,
          completed_at: '2026-06-01T00:00:00.000Z',
          learning_scope: learningScope,
          learning_scope_source: durationLearningScopeSource(learningScope),
          metadata: { liveLearningAssetKey: assetKey, learningScope },
        })))
        continue
      }
      if (assetKey === 'duration_cold_start_baseline') {
        rows.push(...['global', 'industry', 'company', 'project'].map((learningScope) => ({
          id: `sample-${assetKey}-${learningScope}`,
          sample_status: 'active',
          included_in_benchmark: true,
          actual_duration: 8,
          completed_at: '2026-06-01T00:00:00.000Z',
          learning_scope: learningScope,
          learning_scope_source: durationLearningScopeSource(learningScope),
          metadata: { liveLearningAssetKey: assetKey, learningScope },
        })))
        continue
      }
      rows.push(...['global', 'industry', 'company', 'project'].map((learningScope) => ({
        id: `sample-${assetKey}-${learningScope}`,
        sample_status: 'active',
        included_in_benchmark: true,
        actual_duration: 8,
        completed_at: '2026-06-01T00:00:00.000Z',
        learning_scope: learningScope,
        learning_scope_source: durationLearningScopeSource(learningScope),
        metadata: { liveLearningAssetKey: assetKey, learningScope },
      })))
    }
    return rows
  }
  if (normalized.includes('from public.algorithm_learnable_parameter_runtime_publications')) {
    return parameterPublicationAssetKeys.map((assetKey) => ({
      publication_key: publicationKeyForAsset(assetKey),
      asset_key: assetKey,
      publication_status: 'published',
      release_package: assetKey === 'forecast_residual_overlay' || assetKey === 'forecast_confidence_weight'
        ? {
            scopeExceptionApprovalId: `scope-exception-${assetKey}`,
            scopeExceptionApprovalStatus: 'approved',
          }
        : {},
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
      prediction_context: { assetKey, publicationKey: publicationKeyForAsset(assetKey) },
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

function rowsForSqlWithoutCompanyProjectDurationScopes(sql: string) {
  const normalized = sql.toLowerCase()
  if (!normalized.includes('from public.duration_experience_samples')) return rowsForSql(sql)
  return rowsForSql(sql).filter((row) => {
    const metadata = row.metadata as { liveLearningAssetKey?: string, learningScope?: string } | undefined
    if (
      metadata?.liveLearningAssetKey !== 'duration_cold_start_baseline'
      && metadata?.liveLearningAssetKey !== 'standard_work_duration_seed'
    ) {
      return true
    }
    return metadata.learningScope === 'global' || metadata.learningScope === 'industry'
  })
}

function rowsForSqlWithoutForecastScopeExceptionApproval(sql: string) {
  const normalized = sql.toLowerCase()
  if (normalized.includes('from public.duration_experience_samples')) {
    return rowsForSql(sql).filter((row) => {
      const metadata = row.metadata as { liveLearningAssetKey?: string, learningScope?: string } | undefined
      if (
        metadata?.liveLearningAssetKey !== 'forecast_residual_overlay'
        && metadata?.liveLearningAssetKey !== 'forecast_confidence_weight'
      ) {
        return true
      }
      return metadata.learningScope === 'company' || metadata.learningScope === 'project'
    })
  }
  if (!normalized.includes('from public.algorithm_learnable_parameter_runtime_publications')) {
    return rowsForSql(sql)
  }
  return rowsForSql(sql).map((row) => {
    const assetKey = row.asset_key
    if (assetKey !== 'forecast_residual_overlay' && assetKey !== 'forecast_confidence_weight') {
      return row
    }
    return {
      ...row,
      release_package: {},
    }
  })
}

function rowsForSqlWithMetadataOnlyDurationScopes(sql: string) {
  const normalized = sql.toLowerCase()
  if (!normalized.includes('from public.duration_experience_samples')) return rowsForSql(sql)
  return rowsForSql(sql).map((row) => {
    const metadata = row.metadata as Record<string, unknown> | undefined
    if (!metadata?.learningScope) return row
    const { learning_scope, ...withoutSchemaScope } = row
    return withoutSchemaScope
  })
}

function rowsForSqlWithImplicitPlanNetworkScopes(sql: string) {
  const normalized = sql.toLowerCase()
  if (!normalized.includes('from public.duration_plan_network_outcomes')) return rowsForSql(sql)
  return buildPlanNetworkOutcomeRows().map((row) => {
    const { learning_scope, ...withoutSchemaScope } = row
    return {
      ...withoutSchemaScope,
      company_id: 'company-live-learning',
      project_id: 'project-live-learning',
    }
  })
}

function rowsForSqlWithPlanNetworkScopesButNoOutcomeIds(sql: string) {
  const normalized = sql.toLowerCase()
  if (!normalized.includes('from public.duration_plan_network_outcomes')) return rowsForSql(sql)
  return buildPlanNetworkOutcomeRows().map((row) => {
    const { id, ...withoutId } = row
    return withoutId
  })
}

function rowsForSqlWithForgedUpperLearningScopes(sql: string) {
  const normalized = sql.toLowerCase()
  if (normalized.includes('from public.duration_experience_samples')) {
    return rowsForSql(sql).map((row) => {
      const scope = String(row.learning_scope ?? '')
      if (scope === 'global' || scope === 'industry') {
        return { ...row, learning_scope_source: 'task_completion_writer' }
      }
      return row
    })
  }
  if (normalized.includes('from public.duration_plan_network_outcomes')) {
    return rowsForSql(sql).map((row) => {
      const scope = String(row.learning_scope ?? '')
      if (scope === 'global' || scope === 'industry' || scope === 'company') {
        return { ...row, learning_scope_source: 'project_business_outcome_writer' }
      }
      return row
    })
  }
  return rowsForSql(sql)
}

function buildReadyBusinessPathSourceFiles() {
  return [
    {
      sourcePath: 'server/src/services/durationSuggestionService.ts',
      sourceText: `
        import { recordDurationSuggestionConsumedArtifacts } from './durationRuntimeConsumerObservationAdapterService.js'
        export async function getTaskDurationSuggestion() {
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
        export function buildProjectRemainingDurationForecast() {
          await recordProjectRemainingDurationForecastConsumedArtifacts({ queryExec, artifacts: [] })
        }
      `,
    },
    {
      sourcePath: 'server/src/services/wbsTemplateGenerationService.ts',
      sourceText: `
        import { recordWbsTemplateGenerationConsumedArtifacts } from './durationRuntimeConsumerObservationAdapterService.js'
        export async function generateWbsTemplateRows() {
          await recordWbsTemplateGenerationConsumedArtifacts({ queryExec, artifacts: [] })
        }
      `,
    },
    {
      sourcePath: 'server/src/services/scheduleAccelerationService.ts',
      sourceText: `
        import { recordScheduleAccelerationConsumedArtifacts } from './durationRuntimeConsumerObservationAdapterService.js'
        export async function evaluateRuntimeDelayRecoveryWithCriticalPath() {
          await recordScheduleAccelerationConsumedArtifacts({ queryExec, artifacts: [] })
        }
      `,
    },
    {
      sourcePath: 'server/src/services/scheduleAccelerationRuntimeService.ts',
      sourceText: `
        import { recordScheduleAccelerationRuntimeConsumedArtifacts } from './durationRuntimeConsumerObservationAdapterService.js'
        export async function evaluateRuntimeScheduleAcceleration() {
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
      rowsForSql(sql, { includePlanNetworkOutcomes: false }) as T[]

    const audit = await buildDurationLiveLearningProductionClaimAuditFromDb({
      completionAudit: buildReadyCompletionAudit(),
      queryExec,
      maxRowsPerSourceTable: 200,
    })

    expect(audit.status).toBe('duration_live_learning_production_claim_not_ready')
    expect(audit.completionAudit.status).toBe('duration_live_learning_completion_not_ready')
    expect(audit.evidenceRowCollection.rejectedRows).toEqual([])
    expect(audit.productionGate.status).toBe('duration_live_learning_production_evidence_not_ready')
    expect(audit.productionGate.missingEvidenceByAsset).toEqual([
      {
        assetKey: 'base_duration_benchmark',
        missingReasonCodes: ['completion_audit_ready_required'],
      },
      ...planNetworkAssetKeys.map((assetKey) => ({
        assetKey,
        missingReasonCodes: ['production_sample_evidence_required'],
      })),
    ])
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
      'duration_plan_network_outcomes',
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
    expect(joinedSql).toContain('from public.duration_plan_network_outcomes')
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

  it('builds the DB production claim from canonical plan-network outcome rows without typed records', async () => {
    const {
      buildDurationLiveLearningProductionClaimAuditFromDb,
    } = await import('../services/durationLiveLearningProductionEvidenceReaderService.js')
    const queryExec = async <T = Record<string, unknown>>(sql: string): Promise<T[]> =>
      rowsForSql(sql) as T[]

    const audit = await buildDurationLiveLearningProductionClaimAuditFromDb({
      completionAudit: buildReadyCompletionAudit(),
      queryExec,
      maxRowsPerSourceTable: 200,
    })

    expect(audit.status).toBe('duration_live_learning_production_claim_ready')
    expect(audit.completionAudit.status).toBe('duration_live_learning_completion_ready')
    expect(audit.evidenceRowCollection.rejectedRows).toEqual([])
    expect(audit.productionGate.missingEvidenceByAsset).toEqual([])
    expect(audit.evidenceCollection.productionEvidence)
      .toEqual(expect.arrayContaining(planNetworkAssetKeys.map((assetKey) =>
        expect.objectContaining({
          assetKey,
          productionSampleEvidenceRef: expect.stringMatching(
            new RegExp(`^network_outcomes:outcome-${assetKey}-`),
          ),
        }))))
  })

  it('does not let typed plan-network records repair invalid DB outcome rows', async () => {
    const {
      buildDurationLiveLearningProductionClaimAuditFromDb,
    } = await import('../services/durationLiveLearningProductionEvidenceReaderService.js')
    const queryExec = async <T = Record<string, unknown>>(sql: string): Promise<T[]> =>
      rowsForSqlWithPlanNetworkScopesButNoOutcomeIds(sql) as T[]

    const audit = await buildDurationLiveLearningProductionClaimAuditFromDb({
      completionAudit: buildReadyCompletionAudit(),
      queryExec,
      maxRowsPerSourceTable: 200,
      records: buildPlanNetworkOutcomeRecords(),
    } as Parameters<typeof buildDurationLiveLearningProductionClaimAuditFromDb>[0] & {
      records: ReturnType<typeof buildPlanNetworkOutcomeRecords>
    })

    expect(audit.status).toBe('duration_live_learning_production_claim_not_ready')
    expect(audit.evidenceRowCollection.rejectedRows).toEqual(expect.arrayContaining([
      expect.objectContaining({
        sourceTable: 'duration_plan_network_outcomes',
        reason: 'production_source_row_id_required',
      }),
    ]))
    expect(audit.evidenceCollection.rejectedRecords).toEqual([])
    expect(audit.productionGate.missingEvidenceByAsset).toEqual(expect.arrayContaining(
      planNetworkAssetKeys.map((assetKey) => ({
        assetKey,
        missingReasonCodes: ['production_sample_evidence_required'],
      })),
    ))
  })

  it('keeps the DB production claim blocked when non-forecast assets lack company/project learning scopes', async () => {
    const {
      buildDurationLiveLearningProductionClaimAuditFromDb,
    } = await import('../services/durationLiveLearningProductionEvidenceReaderService.js')
    const queryExec = async <T = Record<string, unknown>>(sql: string): Promise<T[]> =>
      rowsForSqlWithoutCompanyProjectDurationScopes(sql) as T[]

    const audit = await buildDurationLiveLearningProductionClaimAuditFromDb({
      completionAudit: buildReadyCompletionAudit(),
      queryExec,
      maxRowsPerSourceTable: 200,
    })

    expect(audit.status).toBe('duration_live_learning_production_claim_not_ready')
    expect(audit.completionAudit.status).toBe('duration_live_learning_completion_not_ready')
    expect(audit.completionAudit.blockedAssetKeys).toEqual(expect.arrayContaining([
      'duration_cold_start_baseline',
      'standard_work_duration_seed',
    ]))
    expect(audit.completionAudit.portfolio.learnableAssets).toEqual(expect.arrayContaining([
      expect.objectContaining({
        assetKey: 'duration_cold_start_baseline',
        missingClosureConditions: expect.arrayContaining([
          'global_industry_company_project_learning_scopes_required',
        ]),
      }),
      expect.objectContaining({
        assetKey: 'standard_work_duration_seed',
        missingClosureConditions: expect.arrayContaining([
          'global_industry_company_project_learning_scopes_required',
        ]),
      }),
    ]))
  })

  it('keeps duration-outcome scopes blocked when scope only exists in metadata', async () => {
    const {
      buildDurationLiveLearningProductionClaimAuditFromDb,
    } = await import('../services/durationLiveLearningProductionEvidenceReaderService.js')
    const queryExec = async <T = Record<string, unknown>>(sql: string): Promise<T[]> =>
      rowsForSqlWithMetadataOnlyDurationScopes(sql) as T[]

    const audit = await buildDurationLiveLearningProductionClaimAuditFromDb({
      completionAudit: buildReadyCompletionAudit(),
      queryExec,
      maxRowsPerSourceTable: 200,
    })

    expect(audit.status).toBe('duration_live_learning_production_claim_not_ready')
    expect(audit.completionAudit.status).toBe('duration_live_learning_completion_not_ready')
    expect(audit.completionAudit.blockedAssetKeys).toEqual(expect.arrayContaining([
      'base_duration_benchmark',
      'duration_cold_start_baseline',
      'standard_work_duration_seed',
    ]))
    expect(audit.completionAudit.portfolio.learnableAssets).toEqual(expect.arrayContaining([
      expect.objectContaining({
        assetKey: 'base_duration_benchmark',
        missingClosureConditions: expect.arrayContaining([
          'global_industry_company_project_learning_scopes_required',
        ]),
      }),
    ]))
  })

  it('keeps plan-network scopes blocked when scope is inferred only from company or project ids', async () => {
    const {
      buildDurationLiveLearningProductionClaimAuditFromDb,
    } = await import('../services/durationLiveLearningProductionEvidenceReaderService.js')
    const queryExec = async <T = Record<string, unknown>>(sql: string): Promise<T[]> =>
      rowsForSqlWithImplicitPlanNetworkScopes(sql) as T[]

    const audit = await buildDurationLiveLearningProductionClaimAuditFromDb({
      completionAudit: buildReadyCompletionAudit(),
      queryExec,
      maxRowsPerSourceTable: 200,
    })

    expect(audit.status).toBe('duration_live_learning_production_claim_not_ready')
    expect(audit.completionAudit.status).toBe('duration_live_learning_completion_not_ready')
    expect(audit.completionAudit.blockedAssetKeys).toEqual(expect.arrayContaining([
      'special_work_duration_seed',
      'wbs_reference_days',
      'dependency_rule_candidate',
      'critical_path_rule_candidate',
    ]))
    expect(audit.completionAudit.portfolio.learnableAssets).toEqual(expect.arrayContaining([
      expect.objectContaining({
        assetKey: 'special_work_duration_seed',
        missingClosureConditions: expect.arrayContaining([
          'global_industry_company_project_learning_scopes_required',
        ]),
      }),
    ]))
  })

  it('keeps upper learning scopes blocked without aggregate provenance', async () => {
    const {
      buildDurationLiveLearningProductionClaimAuditFromDb,
    } = await import('../services/durationLiveLearningProductionEvidenceReaderService.js')
    const queryExec = async <T = Record<string, unknown>>(sql: string): Promise<T[]> =>
      rowsForSqlWithForgedUpperLearningScopes(sql) as T[]

    const audit = await buildDurationLiveLearningProductionClaimAuditFromDb({
      completionAudit: buildReadyCompletionAudit(),
      queryExec,
      maxRowsPerSourceTable: 200,
    })

    expect(audit.status).toBe('duration_live_learning_production_claim_not_ready')
    expect(audit.completionAudit.status).toBe('duration_live_learning_completion_not_ready')
    expect(audit.completionAudit.blockedAssetKeys).toEqual(expect.arrayContaining([
      'base_duration_benchmark',
      'duration_cold_start_baseline',
      'standard_work_duration_seed',
      'special_work_duration_seed',
      'wbs_reference_days',
      'dependency_rule_candidate',
      'critical_path_rule_candidate',
    ]))
    expect(audit.completionAudit.portfolio.learnableAssets).toEqual(expect.arrayContaining([
      expect.objectContaining({
        assetKey: 'base_duration_benchmark',
        missingClosureConditions: expect.arrayContaining([
          'global_industry_company_project_learning_scopes_required',
        ]),
      }),
      expect.objectContaining({
        assetKey: 'special_work_duration_seed',
        missingClosureConditions: expect.arrayContaining([
          'global_industry_company_project_learning_scopes_required',
        ]),
      }),
    ]))
  })

  it('keeps forecast scoped runtime assets blocked without production scope-exception approval', async () => {
    const {
      buildDurationLiveLearningProductionClaimAuditFromDb,
    } = await import('../services/durationLiveLearningProductionEvidenceReaderService.js')
    const queryExec = async <T = Record<string, unknown>>(sql: string): Promise<T[]> =>
      rowsForSqlWithoutForecastScopeExceptionApproval(sql) as T[]

    const audit = await buildDurationLiveLearningProductionClaimAuditFromDb({
      completionAudit: buildReadyCompletionAudit(),
      queryExec,
      maxRowsPerSourceTable: 200,
    })

    expect(audit.status).toBe('duration_live_learning_production_claim_not_ready')
    expect(audit.completionAudit.status).toBe('duration_live_learning_completion_not_ready')
    expect(audit.completionAudit.blockedAssetKeys).toEqual(expect.arrayContaining([
      'forecast_residual_overlay',
      'forecast_confidence_weight',
    ]))
    expect(audit.completionAudit.portfolio.learnableAssets).toEqual(expect.arrayContaining([
      expect.objectContaining({
        assetKey: 'forecast_residual_overlay',
        missingClosureConditions: expect.arrayContaining([
          'global_industry_company_project_learning_scopes_required',
        ]),
      }),
      expect.objectContaining({
        assetKey: 'forecast_confidence_weight',
        missingClosureConditions: expect.arrayContaining([
          'global_industry_company_project_learning_scopes_required',
        ]),
      }),
    ]))
  })

  it('keeps the DB production claim blocked when callers request fact-layer rewrites', async () => {
    const {
      buildDurationLiveLearningProductionClaimAuditFromDb,
    } = await import('../services/durationLiveLearningProductionEvidenceReaderService.js')
    const queryExec = async <T = Record<string, unknown>>(sql: string): Promise<T[]> =>
      rowsForSql(sql) as T[]

    const audit = await buildDurationLiveLearningProductionClaimAuditFromDb({
      completionAudit: buildReadyCompletionAudit(),
      queryExec,
      maxRowsPerSourceTable: 200,
      requestedFactRewriteAssetKeys: ['baseline_commitment'],
    })

    expect(audit.status).toBe('duration_live_learning_production_claim_not_ready')
    expect(audit.completionAudit.status).toBe('duration_live_learning_completion_not_ready')
    expect(audit.completionAudit.factRewriteBlockedAssetKeys).toEqual(['baseline_commitment'])
    expect(audit.productionGate.status).toBe('duration_live_learning_production_evidence_not_ready')
    expect(audit.allowedClaim).toBe('not_ready_for_live_self_learning_claim')
    expect(audit.prohibitedClaim).toBe('all_duration_assets_are_live_self_learning')
  })

  it('builds the DB completion audit from production source rows instead of caller supplied completion audit', async () => {
    const {
      buildDurationLiveLearningProductionClaimAuditFromDb,
    } = await import('../services/durationLiveLearningProductionEvidenceReaderService.js')
    const queryExec = async <T = Record<string, unknown>>(sql: string): Promise<T[]> =>
      rowsForSql(sql) as T[]

    const audit = await buildDurationLiveLearningProductionClaimAuditFromDb({
      completionAudit: buildDurationLiveLearningCompletionAudit(),
      queryExec,
      maxRowsPerSourceTable: 200,
    })

    expect(audit.completionAudit.status).toBe('duration_live_learning_completion_ready')
    expect(audit.productionGate.completionAuditStatus).toBe('duration_live_learning_completion_ready')
    expect(audit.productionGate.missingEvidenceByAsset).toEqual([])
    expect(audit.status).toBe('duration_live_learning_production_claim_ready')
  })

  it('loads real business path source files and allows the claim when runtime entries are integrated', async () => {
    const {
      buildDurationLiveLearningProductionClaimAuditFromDb,
    } = await import('../services/durationLiveLearningProductionEvidenceReaderService.js')
    const queryExec = async <T = Record<string, unknown>>(sql: string): Promise<T[]> =>
      rowsForSql(sql) as T[]

    const audit = await buildDurationLiveLearningProductionClaimAuditFromDb({
      completionAudit: buildReadyCompletionAudit(),
      queryExec,
      maxRowsPerSourceTable: 200,
    })

    expect(audit.status).toBe('duration_live_learning_production_claim_ready')
    expect(audit.runtimeConsumerBusinessPathIntegrationCoverage.status)
      .toBe('runtime_consumer_business_path_integration_ready')
    expect(audit.runtimeConsumerBusinessPathIntegrationCoverage.missingIntegrations).toEqual([])
  })

  it('ignores caller-supplied business path source text and loads repository source files for the DB claim', async () => {
    const {
      buildDurationLiveLearningProductionClaimAuditFromDb,
    } = await import('../services/durationLiveLearningProductionEvidenceReaderService.js')
    const queryExec = async <T = Record<string, unknown>>(sql: string): Promise<T[]> =>
      rowsForSql(sql) as T[]
    const fakeSourceFiles = buildReadyBusinessPathSourceFiles().map((sourceFile) => ({
      ...sourceFile,
      sourceText: 'export function placeholderWithoutRuntimeConsumerFacade() { return null }',
    }))
    const input = {
      completionAudit: buildReadyCompletionAudit(),
      queryExec,
      maxRowsPerSourceTable: 200,
      runtimeConsumerBusinessPathSourceFiles: fakeSourceFiles,
    } as Parameters<typeof buildDurationLiveLearningProductionClaimAuditFromDb>[0] & {
      runtimeConsumerBusinessPathSourceFiles: typeof fakeSourceFiles
    }

    const audit = await buildDurationLiveLearningProductionClaimAuditFromDb(input)

    expect(audit.status).toBe('duration_live_learning_production_claim_ready')
    expect(audit.runtimeConsumerBusinessPathIntegrationCoverage.status)
      .toBe('runtime_consumer_business_path_integration_ready')
    expect(audit.runtimeConsumerBusinessPathIntegrationCoverage.missingIntegrations).toEqual([])
  })
})
