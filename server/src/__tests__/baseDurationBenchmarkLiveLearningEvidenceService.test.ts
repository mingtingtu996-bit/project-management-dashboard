import { describe, expect, it } from 'vitest'
import {
  buildBaseDurationBenchmarkLiveLearningEvidence,
} from '../services/baseDurationBenchmarkLiveLearningEvidenceService.js'
import {
  evaluateDurationLiveLearningManifest,
} from '../services/durationLiveLearningClosureService.js'

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
})
