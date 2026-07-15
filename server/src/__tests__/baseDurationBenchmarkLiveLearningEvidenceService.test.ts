import { describe, expect, it } from 'vitest'
import {
  buildBaseDurationBenchmarkLiveLearningEvidenceFromProductionRows,
  buildBaseDurationBenchmarkLiveLearningEvidence,
} from '../services/baseDurationBenchmarkLiveLearningEvidenceService.js'
import {
  evaluateDurationLiveLearningManifest,
} from '../services/durationLiveLearningClosureService.js'

function durationLearningScopeSource(learningScope: string) {
  if (learningScope === 'global') return 'global_shared_baseline_job'
  if (learningScope === 'industry') return 'industry_shared_baseline_job'
  if (learningScope === 'company') return 'company_aggregate_evidence_job'
  return 'task_completion_writer'
}

describe('baseDurationBenchmarkLiveLearningEvidenceService', () => {
  it('builds live-learning evidence for base duration benchmark when all learning scopes and release gates are present', () => {
    const decision = buildBaseDurationBenchmarkLiveLearningEvidence({
      predictionEventRecorded: true,
      actualOutcomeEventRecorded: true,
      enabledLearningScopes: ['system', 'industry_baseline', 'company', 'project'],
      acceptedSampleCounts: {
        global: 80,
        industry: 40,
        company: 12,
        project: 6,
      },
      runtimePublicationKey: 'duration_benchmark_runtime:benchmark-blend-v2',
      runtimeConsumerObservationRef: 'runtime_consumer:base-duration:observed',
      runtimeConsumerPublicationKey: 'duration_benchmark_runtime:benchmark-blend-v2',
      rollbackTarget: 'duration_benchmark_runtime:benchmark-blend-v1',
      releaseExitApproved: true,
      impactMonitoringReady: true,
      accuracyMetricsAvailable: true,
    })

    expect(decision.status).toBe('base_duration_benchmark_live_learning_ready')
    expect(decision.liveLearningEvidence).toEqual({
      assetClassificationRegistered: true,
      predictionEventRecorded: true,
      actualOutcomeEventRecorded: true,
      tieredLearningPolicyRegistered: true,
      enabledLearningScopes: ['global', 'industry', 'company', 'project'],
      runtimeConsumerUsesPublishedArtifact: true,
      releaseExitApproved: true,
      impactMonitoringReady: true,
      rollbackTargetReady: true,
      accuracyMetricsAvailable: true,
    })
    expect(decision.benchmarkLineage).toEqual({
      assetType: 'base_duration_benchmark',
      runtimePublicationKey: 'duration_benchmark_runtime:benchmark-blend-v2',
      rollbackTarget: 'duration_benchmark_runtime:benchmark-blend-v1',
      acceptedSampleCounts: {
        global: 80,
        industry: 40,
        company: 12,
        project: 6,
      },
      enabledLearningScopes: ['global', 'industry', 'company', 'project'],
    })
    expect(decision.missingReasons).toEqual([])

    const manifest = evaluateDurationLiveLearningManifest('duration_prediction_core_a', [{
      assetKey: 'base_duration_benchmark',
      evidence: decision.liveLearningEvidence,
    }])
    expect(manifest.assetEvaluations.find((asset) => asset.assetKey === 'base_duration_benchmark')).toEqual(
      expect.objectContaining({ status: 'live_self_learning_ready' }),
    )
  })

  it('blocks base duration benchmark evidence when consumer observes a different runtime publication', () => {
    const decision = buildBaseDurationBenchmarkLiveLearningEvidence({
      predictionEventRecorded: true,
      actualOutcomeEventRecorded: true,
      enabledLearningScopes: ['system', 'industry_baseline', 'company', 'project'],
      acceptedSampleCounts: {
        global: 80,
        industry: 40,
        company: 12,
        project: 6,
      },
      runtimePublicationKey: 'duration_benchmark_runtime:benchmark-blend-v2',
      runtimeConsumerObservationRef: 'runtime_consumer:base-duration:observed',
      runtimeConsumerPublicationKey: 'duration_benchmark_runtime:benchmark-blend-v1',
      rollbackTarget: 'duration_benchmark_runtime:benchmark-blend-v1',
      releaseExitApproved: true,
      impactMonitoringReady: true,
      accuracyMetricsAvailable: true,
    })

    expect(decision.status).toBe('base_duration_benchmark_live_learning_not_ready')
    expect(decision.liveLearningEvidence.runtimeConsumerUsesPublishedArtifact).toBe(false)
    expect(decision.missingReasons).toEqual(expect.arrayContaining([
      'runtime_consumer_publication_mismatch',
    ]))
  })

  it('keeps base duration benchmark evidence not ready without scope samples, runtime publication, monitoring, and accuracy', () => {
    const decision = buildBaseDurationBenchmarkLiveLearningEvidence({
      predictionEventRecorded: true,
      actualOutcomeEventRecorded: false,
      enabledLearningScopes: ['company'],
      acceptedSampleCounts: {
        company: 3,
      },
      runtimePublicationKey: '',
      rollbackTarget: '',
      releaseExitApproved: false,
      impactMonitoringReady: false,
      accuracyMetricsAvailable: false,
    })

    expect(decision.status).toBe('base_duration_benchmark_live_learning_not_ready')
    expect(decision.liveLearningEvidence).toEqual(expect.objectContaining({
      actualOutcomeEventRecorded: false,
      tieredLearningPolicyRegistered: false,
      enabledLearningScopes: ['company'],
      runtimeConsumerUsesPublishedArtifact: false,
      releaseExitApproved: false,
      impactMonitoringReady: false,
      rollbackTargetReady: false,
      accuracyMetricsAvailable: false,
    }))
    expect(decision.missingReasons).toEqual(expect.arrayContaining([
      'base_duration_actual_outcome_required',
      'global_industry_company_project_learning_scopes_required',
      'base_duration_scope_sample_coverage_required',
      'runtime_consumer_publication_required',
      'release_exit_required',
      'impact_monitoring_required',
      'rollback_target_required',
      'accuracy_metrics_required',
    ]))
  })

  it('builds base duration benchmark live evidence from production source rows', () => {
    const decision = buildBaseDurationBenchmarkLiveLearningEvidenceFromProductionRows({
      enabledLearningScopes: ['system', 'industry_baseline', 'company', 'project'],
      sourceRows: [
        ...['global', 'industry', 'company', 'project'].map((learningScope, index) => ({
          sourceTable: 'duration_experience_samples' as const,
          row: {
            id: `base-sample-${learningScope}`,
            sample_status: 'active',
            included_in_benchmark: true,
            actual_duration: 6 + index,
            completed_at: '2026-06-14T00:00:00.000Z',
            learning_scope: learningScope,
            learning_scope_source: durationLearningScopeSource(learningScope),
            metadata: {
              liveLearningAssetKey: 'base_duration_benchmark',
              learningScope,
            },
          },
        })),
        {
          sourceTable: 'algorithm_learnable_parameter_runtime_publications',
          row: {
            publication_key: 'duration_benchmark_runtime:benchmark-blend-v2',
            asset_key: 'base_duration_benchmark',
            publication_status: 'published',
            writes_seed_runtime_directly: false,
            target_runtime_table: 'algorithm_learnable_parameter_runtime_publications',
            impact_monitoring: {
              status: 'monitoring_armed',
              eventRef: 'impact_monitoring:duration_benchmark_runtime:benchmark-blend-v2:armed',
            },
            rollback_execution: {
              status: 'rollback_verified',
              eventRef: 'rollback:duration_benchmark_runtime:benchmark-blend-v2:verified',
            },
          },
        },
        {
          sourceTable: 'runtime_consumer_observations',
          row: {
            id: 'consumer-base-duration-1',
            asset_key: 'base_duration_benchmark',
            consumer_key: 'durationSuggestionService',
            publication_key: 'duration_benchmark_runtime:benchmark-blend-v2',
            observation_status: 'observed',
            writes_runtime_directly: false,
            writes_fact_directly: false,
          },
        },
        {
          sourceTable: 'duration_algorithm_accuracy_events',
          row: {
            id: 'accuracy-base-duration-1',
            absolute_error_days: 1,
            prediction_context: {
              assetKey: 'base_duration_benchmark',
              publicationKey: 'duration_benchmark_runtime:benchmark-blend-v2',
            },
            actual_context: {
              assetKey: 'base_duration_benchmark',
              accuracyGateStatus: 'accuracy_passed',
            },
          },
        },
      ],
    })

    expect(decision.status).toBe('base_duration_benchmark_live_learning_ready')
    expect(decision.liveLearningEvidence).toEqual(expect.objectContaining({
      predictionEventRecorded: true,
      actualOutcomeEventRecorded: true,
      tieredLearningPolicyRegistered: true,
      runtimeConsumerUsesPublishedArtifact: true,
      releaseExitApproved: true,
      impactMonitoringReady: true,
      rollbackTargetReady: true,
      accuracyMetricsAvailable: true,
    }))
    expect(decision.benchmarkLineage).toEqual(expect.objectContaining({
      runtimePublicationKey: 'duration_benchmark_runtime:benchmark-blend-v2',
      rollbackTarget: 'rollback:duration_benchmark_runtime:benchmark-blend-v2:verified',
      acceptedSampleCounts: {
        global: 1,
        industry: 1,
        company: 1,
        project: 1,
      },
    }))
    expect(decision.productionLineage.evidenceRefs).toEqual(expect.objectContaining({
      productionSampleEvidenceRef: 'duration_samples:base-sample-global',
      publicationExecutionRef: 'algorithm_learnable_parameter_runtime_publications:duration_benchmark_runtime:benchmark-blend-v2',
      runtimeConsumerObservationRef: 'runtime_consumer:consumer-base-duration-1',
      impactMonitoringEvidenceRef: 'impact_monitoring:duration_benchmark_runtime:benchmark-blend-v2:armed',
      rollbackDrillEvidenceRef: 'rollback:duration_benchmark_runtime:benchmark-blend-v2:verified',
      accuracyEvidenceRef: 'duration_algorithm_accuracy_events:accuracy-base-duration-1',
    }))
    expect(decision.productionLineage.rejectedRows).toEqual([])
    expect(decision.productionLineage.rejectedRecords).toEqual([])
  })

  it('keeps base duration benchmark not ready when production evidence is supplied only as direct typed records', () => {
    const decision = buildBaseDurationBenchmarkLiveLearningEvidenceFromProductionRows({
      enabledLearningScopes: ['system', 'industry_baseline', 'company', 'project'],
      records: [
        {
          assetKey: 'base_duration_benchmark',
          evidenceKind: 'production_sample',
          evidenceRef: 'duration_samples:manual-base-sample',
          evidenceStatus: 'accepted',
        },
        {
          assetKey: 'base_duration_benchmark',
          evidenceKind: 'publication_execution',
          evidenceRef: 'algorithm_learnable_parameter_runtime_publications:duration_benchmark_runtime:benchmark-blend-v2',
          evidenceStatus: 'published',
        },
        {
          assetKey: 'base_duration_benchmark',
          evidenceKind: 'runtime_consumer_observation',
          evidenceRef: 'runtime_consumer:manual-base-consumer',
          evidenceStatus: 'observed',
          publicationKey: 'duration_benchmark_runtime:benchmark-blend-v2',
        },
        {
          assetKey: 'base_duration_benchmark',
          evidenceKind: 'impact_monitoring',
          evidenceRef: 'impact_monitoring:duration_benchmark_runtime:benchmark-blend-v2:armed',
          evidenceStatus: 'monitoring_armed',
          publicationKey: 'duration_benchmark_runtime:benchmark-blend-v2',
        },
        {
          assetKey: 'base_duration_benchmark',
          evidenceKind: 'rollback_drill',
          evidenceRef: 'rollback:duration_benchmark_runtime:benchmark-blend-v2:verified',
          evidenceStatus: 'rollback_verified',
          publicationKey: 'duration_benchmark_runtime:benchmark-blend-v2',
        },
        {
          assetKey: 'base_duration_benchmark',
          evidenceKind: 'accuracy',
          evidenceRef: 'duration_algorithm_accuracy_events:manual-base-accuracy',
          evidenceStatus: 'accuracy_passed',
          publicationKey: 'duration_benchmark_runtime:benchmark-blend-v2',
        },
      ],
    })

    expect(decision.status).toBe('base_duration_benchmark_live_learning_not_ready')
    expect(decision.liveLearningEvidence).toEqual(expect.objectContaining({
      actualOutcomeEventRecorded: false,
      runtimeConsumerUsesPublishedArtifact: false,
      releaseExitApproved: false,
      impactMonitoringReady: false,
      rollbackTargetReady: false,
      accuracyMetricsAvailable: false,
    }))
    expect(decision.productionLineage.evidenceRefs).toEqual({
      assetKey: 'base_duration_benchmark',
    })
    expect(decision.productionLineage.rejectedRecords).toEqual(expect.arrayContaining([
      expect.objectContaining({
        evidenceKind: 'production_sample',
        reason: 'production_evidence_direct_record_not_allowed_for_publication_readiness',
      }),
      expect.objectContaining({
        evidenceKind: 'accuracy',
        reason: 'production_evidence_direct_record_not_allowed_for_publication_readiness',
      }),
    ]))
  })

  it('does not count mismatched learning scope sources toward base duration scope maturity', () => {
    const decision = buildBaseDurationBenchmarkLiveLearningEvidenceFromProductionRows({
      enabledLearningScopes: ['system', 'industry_baseline', 'company', 'project'],
      sourceRows: [
        ...['global', 'industry', 'company', 'project'].map((learningScope, index) => ({
          sourceTable: 'duration_experience_samples' as const,
          row: {
            id: `forged-base-sample-${learningScope}`,
            sample_status: 'active',
            included_in_benchmark: true,
            actual_duration: 6 + index,
            completed_at: '2026-06-14T00:00:00.000Z',
            learning_scope: learningScope,
            learning_scope_source: 'task_completion_writer',
            metadata: {
              liveLearningAssetKey: 'base_duration_benchmark',
              learningScope,
            },
          },
        })),
        {
          sourceTable: 'algorithm_learnable_parameter_runtime_publications',
          row: {
            publication_key: 'duration_benchmark_runtime:benchmark-blend-v2',
            asset_key: 'base_duration_benchmark',
            publication_status: 'published',
            impact_monitoring: { status: 'monitoring_armed' },
            rollback_execution: { status: 'rollback_verified' },
          },
        },
        {
          sourceTable: 'runtime_consumer_observations',
          row: {
            id: 'consumer-base-duration-1',
            asset_key: 'base_duration_benchmark',
            consumer_key: 'durationSuggestionService',
            publication_key: 'duration_benchmark_runtime:benchmark-blend-v2',
            observation_status: 'observed',
            writes_runtime_directly: false,
            writes_fact_directly: false,
          },
        },
        {
          sourceTable: 'duration_algorithm_accuracy_events',
          row: {
            id: 'accuracy-base-duration-1',
            absolute_error_days: 1,
            prediction_context: {
              assetKey: 'base_duration_benchmark',
              publicationKey: 'duration_benchmark_runtime:benchmark-blend-v2',
            },
            actual_context: {
              assetKey: 'base_duration_benchmark',
              accuracyGateStatus: 'accuracy_passed',
            },
          },
        },
      ],
    })

    expect(decision.status).toBe('base_duration_benchmark_live_learning_not_ready')
    expect(decision.benchmarkLineage.acceptedSampleCounts).toEqual({
      global: 0,
      industry: 0,
      company: 0,
      project: 1,
    })
    expect(decision.missingReasons).toContain('base_duration_scope_sample_coverage_required')
  })
})
