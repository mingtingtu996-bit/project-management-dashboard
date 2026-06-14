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
} from '../services/durationLiveLearningProductionEvidenceGateService.js'

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
  return learnableAssetKeys.flatMap((assetKey) => [
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
      evidenceKind: 'runtime_consumer_observation' as const,
      evidenceRef: `runtime_consumer:${assetKey}:observed`,
      evidenceStatus: 'observed',
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
  ])
}

function buildAllProductionSourceRows() {
  return learnableAssetKeys.flatMap((assetKey) => [
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
    {
      sourceTable: 'runtime_consumer_observations' as const,
      row: {
        id: `consumer-${assetKey}`,
        asset_key: assetKey,
        publication_key: `publication-${assetKey}`,
        observation_status: 'observed',
      },
    },
  ])
}

describe('durationLiveLearningProductionEvidenceGateService', () => {
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

  it('builds the final production claim audit from completion audit plus typed production records', () => {
    const audit = buildDurationLiveLearningProductionClaimAudit({
      completionAudit: buildReadyCompletionAudit(),
      records: buildAllProductionEvidenceRecords(),
    })

    expect(audit.status).toBe('duration_live_learning_production_claim_ready')
    expect(audit.evidenceCollection.rejectedRecords).toEqual([])
    expect(audit.productionGate.status).toBe('duration_live_learning_production_evidence_ready')
    expect(audit.productionGate.productionEvidenceAssetKeys).toEqual(learnableAssetKeys)
    expect(audit.allowedClaim).toBe(
      'all_learnable_duration_prediction_and_network_assets_are_live_self_learning;facts_and_commitments_remain_locked',
    )
  })

  it('builds the final production claim audit directly from production source rows', () => {
    const audit = buildDurationLiveLearningProductionClaimAudit({
      completionAudit: buildReadyCompletionAudit(),
      sourceRows: buildAllProductionSourceRows(),
    })

    expect(audit.status).toBe('duration_live_learning_production_claim_ready')
    expect(audit.evidenceRowCollection.rejectedRows).toEqual([])
    expect(audit.evidenceCollection.rejectedRecords).toEqual([])
    expect(audit.productionGate.status).toBe('duration_live_learning_production_evidence_ready')
  })
})
