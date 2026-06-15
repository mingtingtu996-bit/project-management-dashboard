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

function buildAllProductionEvidenceRecords() {
  return [
    ...learnableAssetKeys.flatMap((assetKey) => [
      {
        assetKey,
        evidenceKind: 'production_sample' as const,
        evidenceRef: `duration_samples:${assetKey}:accepted`,
        evidenceStatus: 'accepted',
      },
      {
        assetKey,
        evidenceKind: 'publication_execution' as const,
        evidenceRef: `release_execution:${assetKey}:published`,
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

function buildAllProductionSourceRows() {
  return [
    ...learnableAssetKeys.flatMap((assetKey) => [
      {
        sourceTable: 'duration_experience_samples' as const,
        row: {
          id: `sample-${assetKey}`,
          sample_status: 'active',
          included_in_benchmark: true,
          actual_duration: 8,
          completed_at: '2026-06-01T00:00:00.000Z',
          metadata: { liveLearningAssetKey: assetKey },
        },
      },
      {
        sourceTable: 'algorithm_learnable_parameter_runtime_publications' as const,
        row: {
          publication_key: `publication-${assetKey}`,
          asset_key: assetKey,
          publication_status: 'published',
          impact_monitoring: { status: 'monitoring_armed' },
          rollback_execution: { status: 'rollback_verified' },
        },
      },
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
        publication_key: `publication-${assetKey}`,
        consumer_key: consumerKey,
        observation_status: 'observed',
        writes_runtime_directly: false,
        writes_fact_directly: false,
      },
    })),
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
      expect(entry.sourceTables).toEqual([
        'duration_experience_samples',
        'algorithm_learnable_parameter_runtime_publications',
        'algorithm_learnable_parameter_release_events',
        'wbs_template_runtime_publications',
        'wbs_template_runtime_events',
        'construction_dependency_rule_runtime_publications',
        'construction_dependency_rule_runtime_events',
        'duration_algorithm_accuracy_events',
        'runtime_consumer_observations',
      ])
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
        productionSampleEvidenceRef: `duration_samples:${assetKey}:accepted`,
        publicationExecutionRef: `release_execution:${assetKey}:published`,
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
          evidenceRef: 'release_execution:base:published',
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
      publicationExecutionRef: 'release_execution:base:published',
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
    })

    expect(audit.status).toBe('duration_live_learning_production_claim_ready')
    expect(audit.evidenceCollection.rejectedRecords).toEqual([])
    expect(audit.productionGate.status).toBe('duration_live_learning_production_evidence_ready')
    expect(audit.runtimeConsumerObservationCoverage.status).toBe('runtime_consumer_observation_coverage_ready')
    expect(audit.runtimeConsumerObservationCoverage.missingConsumerObservations).toEqual([])
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

  it('builds the final production claim audit directly from production source rows', () => {
    const audit = buildDurationLiveLearningProductionClaimAudit({
      completionAudit: buildReadyCompletionAudit(),
      sourceRows: buildAllProductionSourceRows(),
      runtimeConsumerRuntimeCallEvidence: runtimeCallEvidence,
    })

    expect(audit.status).toBe('duration_live_learning_production_claim_ready')
    expect(audit.evidenceRowCollection.rejectedRows).toEqual([])
    expect(audit.evidenceCollection.rejectedRecords).toEqual([])
    expect(audit.productionGate.status).toBe('duration_live_learning_production_evidence_ready')
    expect(audit.runtimeConsumerObservationCoverage.status).toBe('runtime_consumer_observation_coverage_ready')
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
