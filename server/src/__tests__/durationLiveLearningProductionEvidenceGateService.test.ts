import { describe, expect, it } from 'vitest'

import {
  buildDurationLiveLearningCompletionAudit,
} from '../services/durationLiveLearningCompletionAuditService.js'
import type {
  DurationLiveLearningAssetKey,
  DurationLiveLearningEvidence,
  DurationLiveLearningEvidenceOverride,
} from '../services/durationLiveLearningClosureService.js'
import {
  buildDurationLiveLearningProductionClaimAudit,
  collectDurationLiveLearningProductionEvidenceRecordsFromRows,
  collectDurationLiveLearningProductionEvidenceRefs,
  evaluateDurationLiveLearningProductionEvidenceGate,
  listDurationLiveLearningProductionEvidenceSourcePlan,
} from '../services/durationLiveLearningProductionEvidenceGateService.js'
import { listDurationRuntimeConsumerObservationFacadeRegistrations } from '../services/durationRuntimeConsumerObservationAdapterService.js'
import type { DurationRuntimeConsumerObservationRuntimeCallEvidence } from '../services/durationRuntimeConsumerObservationRuntimeCallAuditService.js'

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

const durationOutcomeProductionSourceTables = [
  'duration_experience_samples',
  'duration_algorithm_accuracy_events',
  'runtime_consumer_observations',
  'runtime_consumer_runtime_calls',
] as const

const networkOutcomeProductionSourceTables = [
  'duration_algorithm_accuracy_events',
  'runtime_consumer_observations',
  'runtime_consumer_runtime_calls',
] as const

const planNetworkAssetKeys: DurationLiveLearningAssetKey[] = [
  'special_work_duration_seed',
  'wbs_reference_days',
  'dependency_rule_candidate',
  'critical_path_rule_candidate',
]

function expectedSourceTablesForAssetKey(assetKey: DurationLiveLearningAssetKey) {
  if (
    assetKey === 'base_duration_benchmark'
    || assetKey === 'duration_cold_start_baseline'
    || assetKey === 'forecast_residual_overlay'
    || assetKey === 'forecast_confidence_weight'
  ) {
    return [
      ...durationOutcomeProductionSourceTables,
      'algorithm_learnable_parameter_runtime_publications',
      'algorithm_learnable_parameter_release_events',
    ]
  }
  if (assetKey === 'standard_work_duration_seed') {
    return [
      ...durationOutcomeProductionSourceTables,
      'algorithm_seed_versions',
      'algorithm_learnable_parameter_release_events',
    ]
  }
  if (assetKey === 'special_work_duration_seed' || assetKey === 'wbs_reference_days') {
    return [
      ...networkOutcomeProductionSourceTables,
      'wbs_template_runtime_publications',
      'wbs_template_runtime_events',
    ]
  }
  return [
    ...networkOutcomeProductionSourceTables,
    'construction_dependency_rule_runtime_publications',
    'construction_dependency_rule_runtime_events',
  ]
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

const runtimeCallEvidence: DurationRuntimeConsumerObservationRuntimeCallEvidence[] = [
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

function buildReadyOverrides(): DurationLiveLearningEvidenceOverride[] {
  return learnableAssetKeys.map((assetKey) => ({
    assetKey,
    evidence: assetKey === 'forecast_residual_overlay' || assetKey === 'forecast_confidence_weight'
      ? {
          ...readyEvidence,
          tieredLearningPolicyRegistered: true,
          enabledLearningScopes: ['company', 'project'],
          scopeExceptionApproved: true,
        }
      : readyEvidence,
  }))
}

function buildReadyCompletionAudit() {
  return buildDurationLiveLearningCompletionAudit({
    evidenceOverrides: buildReadyOverrides(),
  })
}

function publicationEvidenceRefForAsset(assetKey: DurationLiveLearningAssetKey) {
  if (assetKey === 'base_duration_benchmark') {
    return 'algorithm_learnable_parameter_runtime_publications:duration_benchmark_runtime:base-v2'
  }
  if (assetKey === 'duration_cold_start_baseline') {
    return 'algorithm_learnable_parameter_runtime_publications:duration_cold_start_baseline_runtime:cold-v2'
  }
  if (assetKey === 'forecast_residual_overlay') {
    return 'algorithm_learnable_parameter_runtime_publications:forecast_residual_overlay_runtime:overlay-v2'
  }
  if (assetKey === 'forecast_confidence_weight') {
    return 'algorithm_learnable_parameter_runtime_publications:forecast_confidence_weight_runtime:weight-v2'
  }
  if (assetKey === 'standard_work_duration_seed') {
    return 'algorithm_seed_versions:seed-version-standard-work-duration-v2'
  }
  if (assetKey === 'special_work_duration_seed') return 'wbs_template_runtime:special-work-seed-v2'
  if (assetKey === 'wbs_reference_days') return 'wbs_reference_days_runtime:wbs-reference-days-v2'
  if (assetKey === 'dependency_rule_candidate') return 'dependency_rule_runtime:dependency-rule-v2'
  return 'critical_path_rule_runtime:critical-path-rule-v2'
}

function productionSampleEvidenceRefForAsset(assetKey: DurationLiveLearningAssetKey) {
  if (planNetworkAssetKeys.includes(assetKey)) return `network_outcomes:${assetKey}:accepted`
  return `duration_samples:${assetKey}:accepted`
}

function buildPlanNetworkOutcomeRecords() {
  return planNetworkAssetKeys.map((assetKey) => ({
    assetKey,
    evidenceKind: 'production_sample' as const,
    evidenceRef: `network_outcomes:${assetKey}:accepted`,
    evidenceStatus: 'accepted',
  }))
}

function buildAllProductionEvidenceRecords() {
  return [
    ...learnableAssetKeys.flatMap((assetKey) => [
      {
        assetKey,
        evidenceKind: 'production_sample' as const,
        evidenceRef: productionSampleEvidenceRefForAsset(assetKey),
        evidenceStatus: 'accepted',
      },
      {
        assetKey,
        evidenceKind: 'publication_execution' as const,
        evidenceRef: publicationEvidenceRefForAsset(assetKey),
        evidenceStatus: 'published',
      },
      {
        assetKey,
        evidenceKind: 'impact_monitoring' as const,
        evidenceRef: `impact_monitoring:${assetKey}:armed`,
        evidenceStatus: 'monitoring_armed',
      },
      {
        assetKey,
        evidenceKind: 'rollback_drill' as const,
        evidenceRef: `rollback:${assetKey}:verified`,
        evidenceStatus: 'rollback_verified',
      },
      {
        assetKey,
        evidenceKind: 'accuracy' as const,
        evidenceRef: `accuracy:${assetKey}:mae-bias-ok`,
        evidenceStatus: 'accuracy_passed',
      },
    ]),
    ...expectedRuntimeConsumerObservations.map(({ assetKey, consumerKey }) => ({
      assetKey,
      consumerKey,
      evidenceKind: 'runtime_consumer_observation' as const,
      evidenceRef: `runtime_consumer:${assetKey}:${consumerKey}:observed`,
      evidenceStatus: 'observed',
    })),
  ]
}

function publicationKeyForAsset(assetKey: DurationLiveLearningAssetKey) {
  if (assetKey === 'standard_work_duration_seed') {
    return 'algorithm_seed_versions:seed-version-standard-work-duration-v2'
  }
  if (assetKey === 'special_work_duration_seed') return 'wbs_template_runtime:special-work-seed-v2'
  if (assetKey === 'wbs_reference_days') return 'wbs_reference_days_runtime:wbs-reference-days-v2'
  if (assetKey === 'dependency_rule_candidate') return 'dependency_rule_runtime:dependency-rule-v2'
  if (assetKey === 'critical_path_rule_candidate') return 'critical_path_rule_runtime:critical-path-rule-v2'
  return `publication-${assetKey}`
}

function publicationSourceRowsForAsset(assetKey: DurationLiveLearningAssetKey) {
  const publicationKey = publicationKeyForAsset(assetKey)
  if (
    assetKey === 'base_duration_benchmark'
    || assetKey === 'duration_cold_start_baseline'
    || assetKey === 'forecast_residual_overlay'
    || assetKey === 'forecast_confidence_weight'
  ) {
    return [{
      sourceTable: 'algorithm_learnable_parameter_runtime_publications' as const,
      row: {
        publication_key: publicationKey,
        asset_key: assetKey,
        publication_status: 'published',
        impact_monitoring: { status: 'monitoring_armed' },
        rollback_execution: { status: 'rollback_verified' },
      },
    }]
  }
  if (assetKey === 'standard_work_duration_seed') {
    return [
      {
        sourceTable: 'algorithm_seed_versions' as const,
        row: {
          id: 'seed-version-standard-work-duration-v2',
          seed_type: 'standard_work_duration',
          seed_version: 'v2',
          status: 'active',
          is_current: true,
          published_at: '2026-06-14T00:00:00.000Z',
        },
      },
      {
        sourceTable: 'algorithm_learnable_parameter_release_events' as const,
        row: {
          event_type: 'impact_monitoring',
          event_status: 'monitoring_passed',
          source_publication_key: publicationKey,
          event_payload: { assetKey },
        },
      },
      {
        sourceTable: 'algorithm_learnable_parameter_release_events' as const,
        row: {
          event_type: 'rollback_execution',
          event_status: 'rollback_executed',
          source_publication_key: publicationKey,
          event_payload: { assetKey },
        },
      },
    ]
  }
  if (assetKey === 'special_work_duration_seed' || assetKey === 'wbs_reference_days') {
    return [{
      sourceTable: 'wbs_template_runtime_publications' as const,
      row: {
        publication_key: publicationKey,
        asset_kind: assetKey,
        asset_version_id: `${assetKey}-version-v2`,
        runtime_publication_status: 'runtime_published',
        impact_monitoring: { status: 'monitoring_armed' },
        rollback_execution: { status: 'rollback_verified' },
      },
    }]
  }
  return [{
    sourceTable: 'construction_dependency_rule_runtime_publications' as const,
    row: {
      publication_key: publicationKey,
      dependency_rule_version_id: `${assetKey}-version-v2`,
      runtime_publication_status: 'runtime_published',
      dependency_rule_lineage: { assetType: assetKey },
      impact_monitoring: { status: 'monitoring_armed' },
      rollback_execution: { status: 'rollback_verified' },
    },
  }]
}

function buildAllProductionSourceRows() {
  return [
    ...learnableAssetKeys.flatMap((assetKey) => [
      ...(planNetworkAssetKeys.includes(assetKey)
        ? []
        : [{
            sourceTable: 'duration_experience_samples' as const,
            row: {
              id: `sample-${assetKey}`,
              sample_status: 'active',
              included_in_benchmark: true,
              actual_duration: 8,
              completed_at: '2026-06-01T00:00:00.000Z',
              metadata: { liveLearningAssetKey: assetKey },
            },
          }]),
      ...publicationSourceRowsForAsset(assetKey),
      {
        sourceTable: 'duration_algorithm_accuracy_events' as const,
        row: {
          id: `accuracy-${assetKey}`,
          backtest_status: 'backtested',
          absolute_error_days: 1,
          prediction_context: { assetKey },
          actual_context: { accuracyGateStatus: 'accuracy_passed' },
        },
      },
    ]),
    ...expectedRuntimeConsumerObservations.map(({ assetKey, consumerKey }) => ({
      sourceTable: 'runtime_consumer_observations' as const,
      row: {
        id: `consumer-${assetKey}-${consumerKey}`,
        asset_key: assetKey,
        publication_key: publicationKeyForAsset(assetKey),
        consumer_key: consumerKey,
        observation_status: 'observed',
        writes_runtime_directly: false,
        writes_fact_directly: false,
      },
    })),
  ]
}

function buildRuntimeConsumerRuntimeCallRows() {
  return runtimeCallEvidence.map(({ consumerKey, runtimeEntryRef }) => ({
    sourceTable: 'runtime_consumer_runtime_calls' as const,
    row: {
      id: `runtime-call-${consumerKey}`,
      consumer_key: consumerKey,
      runtime_entry_ref: runtimeEntryRef,
      call_status: 'called',
      writes_runtime_directly: false,
      writes_fact_directly: false,
    },
  }))
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

describe('durationLiveLearningProductionEvidenceGateService', () => {
  it('lists the canonical production evidence source plan for every learnable asset', () => {
    const sourcePlan = listDurationLiveLearningProductionEvidenceSourcePlan()

    expect(sourcePlan.map((entry) => entry.assetKey)).toEqual(learnableAssetKeys)
    for (const entry of sourcePlan) {
      expect(entry.requiredEvidenceKinds).toEqual([
        'production_sample',
        'publication_execution',
        'runtime_consumer_observation',
        'impact_monitoring',
        'rollback_drill',
        'accuracy',
      ])
      expect(entry.sourceTables).toEqual(expectedSourceTablesForAssetKey(entry.assetKey))
      expect(entry.requiredFieldsBySourceTable.duration_experience_samples).toEqual(expect.arrayContaining([
        'id',
        'sample_status',
        'included_in_benchmark',
        'actual_duration',
        'metadata.liveLearningAssetKey',
      ]))
      expect(entry.requiredFieldsBySourceTable.algorithm_learnable_parameter_runtime_publications).toEqual(expect.arrayContaining([
        'publication_key',
        'asset_key',
        'publication_status',
        'impact_monitoring.status',
        'rollback_execution.status',
      ]))
      expect(entry.requiredFieldsBySourceTable.algorithm_learnable_parameter_release_events).toEqual(expect.arrayContaining([
        'source_publication_key',
        'event_type',
        'event_status',
        'event_payload.assetKey',
      ]))
      expect(entry.requiredFieldsBySourceTable.wbs_template_runtime_publications).toEqual(expect.arrayContaining([
        'publication_key',
        'asset_kind',
        'asset_version_id',
        'runtime_publication_status',
        'impact_monitoring.status',
        'rollback_execution.status',
      ]))
      expect(entry.requiredFieldsBySourceTable.construction_dependency_rule_runtime_publications).toEqual(expect.arrayContaining([
        'publication_key',
        'dependency_rule_version_id',
        'runtime_publication_status',
        'dependency_rule_lineage.assetType',
        'impact_monitoring.status',
        'rollback_execution.status',
      ]))
      expect(entry.requiredFieldsBySourceTable.duration_algorithm_accuracy_events).toEqual(expect.arrayContaining([
        'id',
        'absolute_error_days',
        'prediction_context.assetKey',
        'actual_context.accuracyGateStatus',
      ]))
      expect(entry.requiredFieldsBySourceTable.runtime_consumer_observations).toEqual(expect.arrayContaining([
        'id',
        'asset_key',
        'consumer_key',
        'observation_status',
      ]))
      expect(entry.requiredFieldsBySourceTable.runtime_consumer_runtime_calls).toEqual(expect.arrayContaining([
        'id',
        'consumer_key',
        'runtime_entry_ref',
        'call_status',
        'writes_runtime_directly',
        'writes_fact_directly',
      ]))
    }
  })

  it('keeps the production claim blocked when completion audit is ready but production refs are missing', () => {
    const gate = evaluateDurationLiveLearningProductionEvidenceGate({
      completionAudit: buildReadyCompletionAudit(),
      productionEvidence: [],
    })

    expect(gate.status).toBe('duration_live_learning_production_evidence_not_ready')
    expect(gate.allowedClaim).toBe('not_ready_for_live_self_learning_claim')
    expect(gate.prohibitedClaim).toBe('all_duration_assets_are_live_self_learning')
    expect(gate.missingEvidenceByAsset).toHaveLength(learnableAssetKeys.length)
    expect(gate.missingEvidenceByAsset[0]).toEqual({
      assetKey: 'base_duration_benchmark',
      missingReasonCodes: [
        'production_sample_evidence_required',
        'publication_execution_evidence_required',
        'runtime_consumer_observation_required',
        'impact_monitoring_evidence_required',
        'rollback_drill_evidence_required',
        'accuracy_evidence_required',
      ],
    })
  })

  it('allows the production claim only when every learnable asset has production evidence refs', () => {
    const gate = evaluateDurationLiveLearningProductionEvidenceGate({
      completionAudit: buildReadyCompletionAudit(),
      productionEvidence: learnableAssetKeys.map((assetKey) => ({
        assetKey,
        productionSampleEvidenceRef: productionSampleEvidenceRefForAsset(assetKey),
        publicationExecutionRef: publicationEvidenceRefForAsset(assetKey),
        runtimeConsumerObservationRef: `runtime_consumer:${assetKey}:observed`,
        impactMonitoringEvidenceRef: `impact_monitoring:${assetKey}:armed`,
        rollbackDrillEvidenceRef: `rollback:${assetKey}:verified`,
        accuracyEvidenceRef: `accuracy:${assetKey}:mae-bias-ok`,
      })),
    })

    expect(gate.status).toBe('duration_live_learning_production_evidence_ready')
    expect(gate.allowedClaim).toBe(
      'all_learnable_duration_prediction_and_network_assets_are_live_self_learning;facts_and_commitments_remain_locked',
    )
    expect(gate.missingEvidenceByAsset).toEqual([])
    expect(gate.productionEvidenceAssetKeys).toEqual(learnableAssetKeys)
  })

  it('blocks direct production evidence refs when their source prefixes are not allowed for the asset', () => {
    const gate = evaluateDurationLiveLearningProductionEvidenceGate({
      completionAudit: buildReadyCompletionAudit(),
      productionEvidence: [{
        assetKey: 'critical_path_rule_candidate',
        productionSampleEvidenceRef: 'duration_samples:critical-path:accepted',
        publicationExecutionRef: 'release_execution:critical_path_rule_candidate:published',
        runtimeConsumerObservationRef: 'runtime_consumer:critical-path:observed',
        impactMonitoringEvidenceRef: 'impact_monitoring:critical-path:armed',
        rollbackDrillEvidenceRef: 'rollback:critical-path:verified',
        accuracyEvidenceRef: 'spreadsheet-upload:critical-path:mae-ok',
      }],
    })

    expect(gate.status).toBe('duration_live_learning_production_evidence_not_ready')
    expect(gate.allowedClaim).toBe('not_ready_for_live_self_learning_claim')
    expect(gate.missingEvidenceByAsset).toContainEqual({
      assetKey: 'critical_path_rule_candidate',
      missingReasonCodes: [
        'production_sample_evidence_required',
        'publication_execution_evidence_required',
        'accuracy_evidence_required',
      ],
    })
  })

  it('collects gate-ready production refs from typed evidence records and ignores non-production states', () => {
    const collected = collectDurationLiveLearningProductionEvidenceRefs({
      records: [
        {
          assetKey: 'base_duration_benchmark',
          evidenceKind: 'production_sample',
          evidenceRef: 'duration_samples:base:accepted',
          evidenceStatus: 'accepted',
        },
        {
          assetKey: 'base_duration_benchmark',
          evidenceKind: 'publication_execution',
          evidenceRef: 'algorithm_learnable_parameter_runtime_publications:duration_benchmark_runtime:base-v2',
          evidenceStatus: 'published',
        },
        {
          assetKey: 'base_duration_benchmark',
          evidenceKind: 'runtime_consumer_observation',
          evidenceRef: 'runtime_consumer:base:observed',
          evidenceStatus: 'observed',
        },
        {
          assetKey: 'base_duration_benchmark',
          evidenceKind: 'impact_monitoring',
          evidenceRef: 'impact_monitoring:base:armed',
          evidenceStatus: 'monitoring_armed',
        },
        {
          assetKey: 'base_duration_benchmark',
          evidenceKind: 'rollback_drill',
          evidenceRef: 'rollback:base:verified',
          evidenceStatus: 'rollback_verified',
        },
        {
          assetKey: 'base_duration_benchmark',
          evidenceKind: 'accuracy',
          evidenceRef: 'accuracy:base:mae-bias-ok',
          evidenceStatus: 'accuracy_passed',
        },
        {
          assetKey: 'duration_cold_start_baseline',
          evidenceKind: 'publication_execution',
          evidenceRef: 'release_execution:cold:candidate',
          evidenceStatus: 'candidate',
        },
        {
          assetKey: 'duration_cold_start_baseline',
          evidenceKind: 'accuracy',
          evidenceRef: '   ',
          evidenceStatus: 'accuracy_passed',
        },
      ],
    })

    expect(collected.productionEvidence).toEqual([{
      assetKey: 'base_duration_benchmark',
      productionSampleEvidenceRef: 'duration_samples:base:accepted',
      publicationExecutionRef: 'algorithm_learnable_parameter_runtime_publications:duration_benchmark_runtime:base-v2',
      runtimeConsumerObservationRef: 'runtime_consumer:base:observed',
      impactMonitoringEvidenceRef: 'impact_monitoring:base:armed',
      rollbackDrillEvidenceRef: 'rollback:base:verified',
      accuracyEvidenceRef: 'accuracy:base:mae-bias-ok',
    }])
    expect(collected.rejectedRecords).toEqual([
      {
        assetKey: 'duration_cold_start_baseline',
        evidenceKind: 'publication_execution',
        evidenceRef: 'release_execution:cold:candidate',
        evidenceStatus: 'candidate',
        reason: 'production_evidence_status_not_accepted',
      },
      {
        assetKey: 'duration_cold_start_baseline',
        evidenceKind: 'accuracy',
        evidenceRef: '   ',
        evidenceStatus: 'accuracy_passed',
        reason: 'production_evidence_ref_required',
      },
    ])
  })

  it('rejects accepted production evidence records when their refs do not match the evidence source allowlist', () => {
    const collected = collectDurationLiveLearningProductionEvidenceRefs({
      records: [
        {
          assetKey: 'base_duration_benchmark',
          evidenceKind: 'accuracy',
          evidenceRef: 'spreadsheet-upload:base:mae-ok',
          evidenceStatus: 'accuracy_passed',
        },
      ],
    })

    expect(collected.productionEvidence).toEqual([])
    expect(collected.rejectedRecords).toEqual([{
      assetKey: 'base_duration_benchmark',
      evidenceKind: 'accuracy',
      evidenceRef: 'spreadsheet-upload:base:mae-ok',
      evidenceStatus: 'accuracy_passed',
      reason: 'production_evidence_ref_source_not_allowed',
    }])
  })

  it('rejects generic release-execution publication refs for typed seed and plan-network records', () => {
    const collected = collectDurationLiveLearningProductionEvidenceRefs({
      records: [
        'standard_work_duration_seed',
        'special_work_duration_seed',
        'wbs_reference_days',
        'dependency_rule_candidate',
        'critical_path_rule_candidate',
      ].map((assetKey) => ({
        assetKey: assetKey as DurationLiveLearningAssetKey,
        evidenceKind: 'publication_execution' as const,
        evidenceRef: `release_execution:${assetKey}:published`,
        evidenceStatus: 'published',
      })),
    })

    expect(collected.productionEvidence).toEqual([])
    expect(collected.rejectedRecords).toEqual([
      'standard_work_duration_seed',
      'special_work_duration_seed',
      'wbs_reference_days',
      'dependency_rule_candidate',
      'critical_path_rule_candidate',
    ].map((assetKey) => ({
      assetKey,
      evidenceKind: 'publication_execution',
      evidenceRef: `release_execution:${assetKey}:published`,
      evidenceStatus: 'published',
      reason: 'production_evidence_ref_source_not_allowed',
    })))
  })

  it('rejects duration sample refs for plan-network production sample evidence', () => {
    const collected = collectDurationLiveLearningProductionEvidenceRefs({
      records: planNetworkAssetKeys.map((assetKey) => ({
        assetKey,
        evidenceKind: 'production_sample',
        evidenceRef: `duration_samples:${assetKey}:accepted`,
        evidenceStatus: 'accepted',
      })),
    })

    expect(collected.productionEvidence).toEqual([])
    expect(collected.rejectedRecords).toEqual(planNetworkAssetKeys.map((assetKey) => ({
      assetKey,
      evidenceKind: 'production_sample',
      evidenceRef: `duration_samples:${assetKey}:accepted`,
      evidenceStatus: 'accepted',
      reason: 'production_evidence_ref_source_not_allowed',
    })))
  })

  it('rejects parameter runtime publication rows for seed and plan-network assets', () => {
    const adapted = collectDurationLiveLearningProductionEvidenceRecordsFromRows({
      rows: [
        'standard_work_duration_seed',
        'special_work_duration_seed',
        'wbs_reference_days',
        'dependency_rule_candidate',
        'critical_path_rule_candidate',
      ].map((assetKey) => ({
        sourceTable: 'algorithm_learnable_parameter_runtime_publications' as const,
        row: {
          publication_key: `parameter-publication-${assetKey}`,
          asset_key: assetKey,
          publication_status: 'published',
          impact_monitoring: { status: 'monitoring_armed' },
          rollback_execution: { status: 'rollback_verified' },
        },
      })),
    })

    expect(adapted.records).toEqual([])
    expect(adapted.rejectedRows).toEqual([
      'standard_work_duration_seed',
      'special_work_duration_seed',
      'wbs_reference_days',
      'dependency_rule_candidate',
      'critical_path_rule_candidate',
    ].map((assetKey) => ({
      sourceTable: 'algorithm_learnable_parameter_runtime_publications',
      row: {
        publication_key: `parameter-publication-${assetKey}`,
        asset_key: assetKey,
        publication_status: 'published',
        impact_monitoring: { status: 'monitoring_armed' },
        rollback_execution: { status: 'rollback_verified' },
      },
      reason: 'production_source_table_not_allowed_for_asset',
    })))
  })

  it('rejects duration experience sample rows for plan-network assets', () => {
    const adapted = collectDurationLiveLearningProductionEvidenceRecordsFromRows({
      rows: planNetworkAssetKeys.map((assetKey) => ({
        sourceTable: 'duration_experience_samples',
        row: {
          id: `sample-${assetKey}`,
          sample_status: 'active',
          included_in_benchmark: true,
          actual_duration: 8,
          completed_at: '2026-06-01T00:00:00.000Z',
          metadata: { liveLearningAssetKey: assetKey },
        },
      })),
    })

    expect(adapted.records).toEqual([])
    expect(adapted.rejectedRows).toEqual(planNetworkAssetKeys.map((assetKey) => ({
      sourceTable: 'duration_experience_samples',
      row: {
        id: `sample-${assetKey}`,
        sample_status: 'active',
        included_in_benchmark: true,
        actual_duration: 8,
        completed_at: '2026-06-01T00:00:00.000Z',
        metadata: { liveLearningAssetKey: assetKey },
      },
      reason: 'production_source_table_not_allowed_for_asset',
    })))
  })

  it('adapts production source rows into typed production evidence records', () => {
    const adapted = collectDurationLiveLearningProductionEvidenceRecordsFromRows({
      rows: [
        {
          sourceTable: 'duration_experience_samples',
          row: {
            id: 'sample-1',
            sample_status: 'active',
            included_in_benchmark: true,
            actual_duration: 8,
            completed_at: '2026-06-01T00:00:00.000Z',
            metadata: { liveLearningAssetKey: 'base_duration_benchmark' },
          },
        },
        {
          sourceTable: 'algorithm_learnable_parameter_runtime_publications',
          row: {
            publication_key: 'forecast-weight-v2',
            asset_key: 'forecast_confidence_weight',
            publication_status: 'published',
            impact_monitoring: { status: 'monitoring_armed', eventRef: 'impact_monitoring:forecast-weight-v2:armed' },
            rollback_execution: { status: 'rollback_verified', eventRef: 'rollback:forecast-weight-v2:verified' },
          },
        },
        {
          sourceTable: 'algorithm_seed_versions',
          row: {
            id: 'seed-version-standard-work-duration-v2',
            seed_type: 'standard_work_duration',
            seed_version: 'v2',
            status: 'active',
            is_current: true,
            published_at: '2026-06-14T00:00:00.000Z',
          },
        },
        {
          sourceTable: 'algorithm_learnable_parameter_release_events',
          row: {
            event_type: 'impact_monitoring',
            event_status: 'monitoring_passed',
            source_publication_key: 'forecast-weight-v2',
            event_payload: { assetKey: 'forecast_confidence_weight' },
          },
        },
        {
          sourceTable: 'duration_algorithm_accuracy_events',
          row: {
            id: 'accuracy-1',
            backtest_status: 'backtested',
            absolute_error_days: 1,
            prediction_context: { assetKey: 'forecast_confidence_weight' },
            actual_context: { accuracyGateStatus: 'accuracy_passed' },
          },
        },
        {
          sourceTable: 'runtime_consumer_observations',
          row: {
            id: 'consumer-1',
            asset_key: 'forecast_confidence_weight',
            publication_key: 'forecast-weight-v2',
            observation_status: 'observed',
          },
        },
      ],
    })

    expect(adapted.records).toEqual([
      {
        assetKey: 'base_duration_benchmark',
        evidenceKind: 'production_sample',
        evidenceRef: 'duration_samples:sample-1',
        evidenceStatus: 'accepted',
      },
      {
        assetKey: 'forecast_confidence_weight',
        evidenceKind: 'publication_execution',
        evidenceRef: 'algorithm_learnable_parameter_runtime_publications:forecast-weight-v2',
        evidenceStatus: 'published',
      },
      {
        assetKey: 'forecast_confidence_weight',
        evidenceKind: 'impact_monitoring',
        evidenceRef: 'impact_monitoring:forecast-weight-v2:armed',
        evidenceStatus: 'monitoring_armed',
      },
      {
        assetKey: 'forecast_confidence_weight',
        evidenceKind: 'rollback_drill',
        evidenceRef: 'rollback:forecast-weight-v2:verified',
        evidenceStatus: 'rollback_verified',
      },
      {
        assetKey: 'standard_work_duration_seed',
        evidenceKind: 'publication_execution',
        evidenceRef: 'algorithm_seed_versions:seed-version-standard-work-duration-v2',
        evidenceStatus: 'published',
      },
      {
        assetKey: 'forecast_confidence_weight',
        evidenceKind: 'impact_monitoring',
        evidenceRef: 'impact_monitoring:forecast-weight-v2:monitoring_passed',
        evidenceStatus: 'monitoring_passed',
      },
      {
        assetKey: 'forecast_confidence_weight',
        evidenceKind: 'accuracy',
        evidenceRef: 'duration_algorithm_accuracy_events:accuracy-1',
        evidenceStatus: 'accuracy_passed',
      },
      {
        assetKey: 'forecast_confidence_weight',
        evidenceKind: 'runtime_consumer_observation',
        evidenceRef: 'runtime_consumer:consumer-1',
        evidenceStatus: 'observed',
      },
    ])
    expect(adapted.rejectedRows).toEqual([])
  })

  it('adapts plan-network runtime publication rows into production publication records', () => {
    const adapted = collectDurationLiveLearningProductionEvidenceRecordsFromRows({
      rows: [
        {
          sourceTable: 'wbs_template_runtime_publications',
          row: {
            publication_key: 'wbs_template_runtime:special-seed-version-v2',
            asset_kind: 'special_work_duration_seed',
            asset_version_id: 'special-seed-version-v2',
            runtime_publication_status: 'runtime_published',
            impact_monitoring: { status: 'monitoring_armed' },
            rollback_execution: { status: 'rollback_verified' },
          },
        },
        {
          sourceTable: 'wbs_template_runtime_events',
          row: {
            source_publication_key: 'wbs_reference_days_runtime:wbs-reference-days-v2',
            event_type: 'impact_monitoring',
            event_status: 'monitoring_passed',
            event_payload: {
              runtimePublication: {
                assetKind: 'wbs_reference_days',
              },
            },
          },
        },
        {
          sourceTable: 'construction_dependency_rule_runtime_publications',
          row: {
            publication_key: 'dependency_rule_runtime:dependency-rule-version-v2',
            dependency_rule_version_id: 'dependency-rule-version-v2',
            runtime_publication_status: 'runtime_published',
            dependency_rule_lineage: { assetType: 'dependency_rule_candidate' },
            impact_monitoring: { status: 'monitoring_armed' },
            rollback_execution: { status: 'rollback_verified' },
          },
        },
        {
          sourceTable: 'construction_dependency_rule_runtime_events',
          row: {
            source_publication_key: 'critical_path_rule_runtime:critical-path-rule-version-v2',
            event_type: 'rollback_execution',
            event_status: 'rollback_executed',
            event_payload: {
              runtimePublication: {
                assetType: 'critical_path_rule_candidate',
              },
            },
          },
        },
      ],
    })

    expect(adapted.records).toEqual([
      {
        assetKey: 'special_work_duration_seed',
        evidenceKind: 'publication_execution',
        evidenceRef: 'wbs_template_runtime:special-seed-version-v2',
        evidenceStatus: 'published',
      },
      {
        assetKey: 'special_work_duration_seed',
        evidenceKind: 'impact_monitoring',
        evidenceRef: 'impact_monitoring:wbs_template_runtime:special-seed-version-v2:monitoring_armed',
        evidenceStatus: 'monitoring_armed',
      },
      {
        assetKey: 'special_work_duration_seed',
        evidenceKind: 'rollback_drill',
        evidenceRef: 'rollback:wbs_template_runtime:special-seed-version-v2:rollback_verified',
        evidenceStatus: 'rollback_verified',
      },
      {
        assetKey: 'wbs_reference_days',
        evidenceKind: 'impact_monitoring',
        evidenceRef: 'impact_monitoring:wbs_reference_days_runtime:wbs-reference-days-v2:monitoring_passed',
        evidenceStatus: 'monitoring_passed',
      },
      {
        assetKey: 'dependency_rule_candidate',
        evidenceKind: 'publication_execution',
        evidenceRef: 'dependency_rule_runtime:dependency-rule-version-v2',
        evidenceStatus: 'published',
      },
      {
        assetKey: 'dependency_rule_candidate',
        evidenceKind: 'impact_monitoring',
        evidenceRef: 'impact_monitoring:dependency_rule_runtime:dependency-rule-version-v2:monitoring_armed',
        evidenceStatus: 'monitoring_armed',
      },
      {
        assetKey: 'dependency_rule_candidate',
        evidenceKind: 'rollback_drill',
        evidenceRef: 'rollback:dependency_rule_runtime:dependency-rule-version-v2:rollback_verified',
        evidenceStatus: 'rollback_verified',
      },
      {
        assetKey: 'critical_path_rule_candidate',
        evidenceKind: 'rollback_drill',
        evidenceRef: 'rollback:critical_path_rule_runtime:critical-path-rule-version-v2:rollback_executed',
        evidenceStatus: 'rollback_executed',
      },
    ])
    expect(adapted.rejectedRows).toEqual([])
  })

  it('builds the final production claim audit from completion audit plus typed production records', () => {
    const audit = buildDurationLiveLearningProductionClaimAudit({
      completionAudit: buildReadyCompletionAudit(),
      records: buildAllProductionEvidenceRecords(),
      runtimeConsumerRuntimeCallEvidence: runtimeCallEvidence,
      runtimeConsumerBusinessPathSourceFiles: buildReadyBusinessPathSourceFiles(),
    })

    expect(audit.status).toBe('duration_live_learning_production_claim_ready')
    expect(audit.evidenceCollection.rejectedRecords).toEqual([])
    expect(audit.productionGate.status).toBe('duration_live_learning_production_evidence_ready')
    expect(audit.runtimeConsumerObservationCoverage.status).toBe('runtime_consumer_observation_coverage_ready')
    expect(audit.runtimeConsumerObservationCoverage.missingConsumerObservations).toEqual([])
    expect(audit.runtimeConsumerBusinessPathIntegrationCoverage.status)
      .toBe('runtime_consumer_business_path_integration_ready')
    expect(audit.productionGate.productionEvidenceAssetKeys).toEqual(learnableAssetKeys)
    expect(audit.allowedClaim).toBe(
      'all_learnable_duration_prediction_and_network_assets_are_live_self_learning;facts_and_commitments_remain_locked',
    )
  })

  it('blocks the final production claim when any declared runtime consumer has no observation', () => {
    const audit = buildDurationLiveLearningProductionClaimAudit({
      completionAudit: buildReadyCompletionAudit(),
      records: buildAllProductionEvidenceRecords().filter((record) =>
        record.assetKey !== 'forecast_residual_overlay'
        || record.evidenceKind !== 'runtime_consumer_observation'
        || record.consumerKey !== 'projectRemainingDurationForecastService'),
      runtimeConsumerRuntimeCallEvidence: runtimeCallEvidence,
    })

    expect(audit.productionGate.status).toBe('duration_live_learning_production_evidence_ready')
    expect(audit.runtimeConsumerObservationCoverage.status).toBe('runtime_consumer_observation_coverage_not_ready')
    expect(audit.runtimeConsumerObservationCoverage.missingConsumerObservations).toEqual([{
      assetKey: 'forecast_residual_overlay',
      consumerKey: 'projectRemainingDurationForecastService',
    }])
    expect(audit.status).toBe('duration_live_learning_production_claim_not_ready')
    expect(audit.allowedClaim).toBe('not_ready_for_live_self_learning_claim')
  })

  it('keeps the source-row production claim blocked until typed network outcomes are supplied', () => {
    const audit = buildDurationLiveLearningProductionClaimAudit({
      completionAudit: buildReadyCompletionAudit(),
      sourceRows: [
        ...buildAllProductionSourceRows(),
        ...buildRuntimeConsumerRuntimeCallRows(),
      ],
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

  it('builds the final production claim audit from production source rows plus typed network outcomes', () => {
    const audit = buildDurationLiveLearningProductionClaimAudit({
      completionAudit: buildReadyCompletionAudit(),
      sourceRows: [
        ...buildAllProductionSourceRows(),
        ...buildRuntimeConsumerRuntimeCallRows(),
      ],
      records: buildPlanNetworkOutcomeRecords(),
      runtimeConsumerBusinessPathSourceFiles: buildReadyBusinessPathSourceFiles(),
    })

    expect(audit.status).toBe('duration_live_learning_production_claim_ready')
    expect(audit.evidenceRowCollection.rejectedRows).toEqual([])
    expect(audit.evidenceCollection.rejectedRecords).toEqual([])
    expect(audit.productionGate.status).toBe('duration_live_learning_production_evidence_ready')
    expect(audit.runtimeConsumerObservationCoverage.status).toBe('runtime_consumer_observation_coverage_ready')
    expect(audit.runtimeConsumerRuntimeCallCoverage.status)
      .toBe('runtime_consumer_observation_runtime_calls_ready')
    expect(audit.runtimeConsumerBusinessPathIntegrationCoverage.status)
      .toBe('runtime_consumer_business_path_integration_ready')
  })

  it('blocks the final production claim when facade-backed business paths are not integrated', () => {
    const audit = buildDurationLiveLearningProductionClaimAudit({
      completionAudit: buildReadyCompletionAudit(),
      sourceRows: [
        ...buildAllProductionSourceRows(),
        ...buildRuntimeConsumerRuntimeCallRows(),
      ],
      records: buildPlanNetworkOutcomeRecords(),
      runtimeConsumerBusinessPathSourceFiles: [{
        sourcePath: 'server/src/services/projectRemainingDurationForecastService.ts',
        sourceText: 'export function buildProjectRemainingDurationForecast() { return {} }',
      }],
    })

    expect(audit.productionGate.status).toBe('duration_live_learning_production_evidence_ready')
    expect(audit.runtimeConsumerObservationCoverage.status).toBe('runtime_consumer_observation_coverage_ready')
    expect(audit.runtimeConsumerRuntimeCallCoverage.status)
      .toBe('runtime_consumer_observation_runtime_calls_ready')
    expect(audit.runtimeConsumerBusinessPathIntegrationCoverage.status)
      .toBe('runtime_consumer_business_path_integration_not_ready')
    expect(audit.runtimeConsumerBusinessPathIntegrationCoverage.missingIntegrations)
      .toEqual(expect.arrayContaining([
        expect.objectContaining({
          consumerKey: 'projectRemainingDurationForecastService',
          facadeFunctionName: 'recordProjectRemainingDurationForecastConsumedArtifacts',
        }),
      ]))
    expect(audit.status).toBe('duration_live_learning_production_claim_not_ready')
    expect(audit.allowedClaim).toBe('not_ready_for_live_self_learning_claim')
  })

  it('blocks the final production claim when consumer observation facades are not fully integrated', () => {
    const audit = buildDurationLiveLearningProductionClaimAudit({
      completionAudit: buildReadyCompletionAudit(),
      records: buildAllProductionEvidenceRecords(),
      runtimeConsumerAdapterRegistrations: [
        {
          consumerKey: 'durationSuggestionService',
          assetKeys: ['base_duration_benchmark'],
        },
      ],
    })

    expect(audit.productionGate.status).toBe('duration_live_learning_production_evidence_ready')
    expect(audit.runtimeConsumerObservationCoverage.status).toBe('runtime_consumer_observation_coverage_ready')
    expect(audit.runtimeConsumerObservationIntegrationCoverage.status)
      .toBe('runtime_consumer_observation_integration_not_ready')
    expect(audit.runtimeConsumerObservationIntegrationCoverage.missingContracts.length).toBeGreaterThan(0)
    expect(audit.status).toBe('duration_live_learning_production_claim_not_ready')
    expect(audit.allowedClaim).toBe('not_ready_for_live_self_learning_claim')
  })

  it('blocks the final production claim when runtime call evidence is missing', () => {
    const audit = buildDurationLiveLearningProductionClaimAudit({
      completionAudit: buildReadyCompletionAudit(),
      records: buildAllProductionEvidenceRecords(),
      runtimeConsumerAdapterRegistrations: listDurationRuntimeConsumerObservationFacadeRegistrations(),
    })

    expect(audit.productionGate.status).toBe('duration_live_learning_production_evidence_ready')
    expect(audit.runtimeConsumerObservationCoverage.status).toBe('runtime_consumer_observation_coverage_ready')
    expect(audit.runtimeConsumerObservationIntegrationCoverage.status)
      .toBe('runtime_consumer_observation_integration_ready')
    expect(audit.runtimeConsumerRuntimeCallCoverage.status)
      .toBe('runtime_consumer_observation_runtime_calls_not_ready')
    expect(audit.status).toBe('duration_live_learning_production_claim_not_ready')
    expect(audit.allowedClaim).toBe('not_ready_for_live_self_learning_claim')
  })
})
