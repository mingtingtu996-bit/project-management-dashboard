import { describe, expect, it } from 'vitest'
import {
  buildForecastScopedRuntimeLiveLearningEvidence,
  buildForecastScopedRuntimeLiveLearningEvidenceFromProductionRows,
} from '../services/forecastScopedRuntimeLiveLearningEvidenceService.js'
import {
  evaluateDurationLiveLearningAsset,
} from '../services/durationLiveLearningClosureService.js'

describe('forecastScopedRuntimeLiveLearningEvidenceService', () => {
  it('builds approved company-project scope exception evidence for residual overlay runtime learning', () => {
    const decision = buildForecastScopedRuntimeLiveLearningEvidence({
      assetKey: 'forecast_residual_overlay',
      predictionEventRecorded: true,
      actualOutcomeEventRecorded: true,
      enabledLearningScopes: ['company', 'project'],
      scopeExceptionApprovalId: 'scope-exception-approval-1',
      runtimePublicationKey: 'forecast_residual_overlay_runtime:overlay-v2',
      runtimeConsumerObservationRef: 'runtime_consumer:forecast-residual:observed',
      runtimeConsumerPublicationKey: 'forecast_residual_overlay_runtime:overlay-v2',
      rollbackTarget: 'forecast_residual_overlay_runtime:overlay-v1',
      releaseExitApproved: true,
      impactMonitoringReady: true,
      accuracyMetricsAvailable: true,
    })

    expect(decision.status).toBe('forecast_scoped_runtime_live_learning_ready')
    expect(decision.liveLearningEvidence).toEqual({
      assetClassificationRegistered: true,
      predictionEventRecorded: true,
      actualOutcomeEventRecorded: true,
      tieredLearningPolicyRegistered: true,
      enabledLearningScopes: ['company', 'project'],
      scopeExceptionApproved: true,
      runtimeConsumerUsesPublishedArtifact: true,
      releaseExitApproved: true,
      impactMonitoringReady: true,
      rollbackTargetReady: true,
      accuracyMetricsAvailable: true,
    })
    expect(evaluateDurationLiveLearningAsset({
      assetKey: 'forecast_residual_overlay',
      evidence: decision.liveLearningEvidence,
    })).toEqual(expect.objectContaining({
      status: 'live_self_learning_ready',
      missingClosureConditions: [],
    }))
  })

  it('blocks forecast scoped runtime evidence when consumer observes a different runtime publication', () => {
    const decision = buildForecastScopedRuntimeLiveLearningEvidence({
      assetKey: 'forecast_residual_overlay',
      predictionEventRecorded: true,
      actualOutcomeEventRecorded: true,
      enabledLearningScopes: ['company', 'project'],
      scopeExceptionApprovalId: 'scope-exception-approval-1',
      runtimePublicationKey: 'forecast_residual_overlay_runtime:overlay-v2',
      runtimeConsumerObservationRef: 'runtime_consumer:forecast-residual:observed',
      runtimeConsumerPublicationKey: 'forecast_residual_overlay_runtime:overlay-v1',
      rollbackTarget: 'forecast_residual_overlay_runtime:overlay-v1',
      releaseExitApproved: true,
      impactMonitoringReady: true,
      accuracyMetricsAvailable: true,
    })

    expect(decision.status).toBe('forecast_scoped_runtime_live_learning_not_ready')
    expect(decision.liveLearningEvidence.runtimeConsumerUsesPublishedArtifact).toBe(false)
    expect(decision.missingReasons).toEqual(expect.arrayContaining([
      'runtime_consumer_publication_mismatch',
    ]))
  })

  it('keeps confidence weight scope exception evidence closed without explicit approval and publication gates', () => {
    const decision = buildForecastScopedRuntimeLiveLearningEvidence({
      assetKey: 'forecast_confidence_weight',
      predictionEventRecorded: true,
      actualOutcomeEventRecorded: true,
      enabledLearningScopes: ['company'],
      scopeExceptionApprovalId: '',
      runtimePublicationKey: '',
      rollbackTarget: '',
      releaseExitApproved: false,
      impactMonitoringReady: false,
      accuracyMetricsAvailable: false,
    })

    expect(decision.status).toBe('forecast_scoped_runtime_live_learning_not_ready')
    expect(decision.liveLearningEvidence).toEqual(expect.objectContaining({
      tieredLearningPolicyRegistered: false,
      enabledLearningScopes: ['company'],
      scopeExceptionApproved: false,
      runtimeConsumerUsesPublishedArtifact: false,
      releaseExitApproved: false,
      impactMonitoringReady: false,
      rollbackTargetReady: false,
      accuracyMetricsAvailable: false,
    }))
    expect(decision.missingReasons).toEqual(expect.arrayContaining([
      'company_project_scope_required',
      'forecast_scope_exception_approval_required',
      'runtime_consumer_publication_required',
      'release_exit_required',
      'impact_monitoring_required',
      'rollback_target_required',
      'accuracy_metrics_required',
    ]))
  })

  it('builds forecast scoped runtime live evidence from production source rows', () => {
    const forecastAssets = [
      {
        assetKey: 'forecast_residual_overlay' as const,
        publicationKey: 'forecast_residual_overlay_runtime:overlay-v2',
        consumerKey: 'projectRemainingDurationForecastService',
      },
      {
        assetKey: 'forecast_confidence_weight' as const,
        publicationKey: 'forecast_confidence_weight_runtime:weight-v2',
        consumerKey: 'taskDurationForecastService',
      },
    ]

    for (const asset of forecastAssets) {
      const decision = buildForecastScopedRuntimeLiveLearningEvidenceFromProductionRows({
        assetKey: asset.assetKey,
        enabledLearningScopes: ['company', 'project'],
        scopeExceptionApprovalId: `scope-exception-${asset.assetKey}`,
        sourceRows: [
          {
            sourceTable: 'algorithm_learnable_parameter_runtime_publications',
            row: {
              publication_key: asset.publicationKey,
              asset_key: asset.assetKey,
              publication_status: 'published',
              writes_seed_runtime_directly: false,
              target_runtime_table: 'algorithm_learnable_parameter_runtime_publications',
              impact_monitoring: {
                status: 'monitoring_armed',
                eventRef: `impact_monitoring:${asset.publicationKey}:armed`,
              },
              rollback_execution: {
                status: 'rollback_verified',
                eventRef: `rollback:${asset.publicationKey}:verified`,
              },
            },
          },
          {
            sourceTable: 'runtime_consumer_observations',
            row: {
              id: `consumer-${asset.assetKey}-1`,
              asset_key: asset.assetKey,
              consumer_key: asset.consumerKey,
              publication_key: asset.publicationKey,
              observation_status: 'observed',
              writes_runtime_directly: false,
              writes_fact_directly: false,
            },
          },
          {
            sourceTable: 'duration_algorithm_accuracy_events',
            row: {
              id: `accuracy-${asset.assetKey}-1`,
              absolute_error_days: 1,
              prediction_context: {
                assetKey: asset.assetKey,
                publicationKey: asset.publicationKey,
              },
              actual_context: {
                assetKey: asset.assetKey,
                publicationKey: asset.publicationKey,
                accuracyGateStatus: 'accuracy_passed',
              },
            },
          },
        ],
      })

      expect(decision.status).toBe('forecast_scoped_runtime_live_learning_ready')
      expect(decision.liveLearningEvidence).toEqual(expect.objectContaining({
        predictionEventRecorded: true,
        actualOutcomeEventRecorded: true,
        tieredLearningPolicyRegistered: true,
        enabledLearningScopes: ['company', 'project'],
        scopeExceptionApproved: true,
        runtimeConsumerUsesPublishedArtifact: true,
        releaseExitApproved: true,
        impactMonitoringReady: true,
        rollbackTargetReady: true,
        accuracyMetricsAvailable: true,
      }))
      expect(decision.lineage).toEqual(expect.objectContaining({
        assetKey: asset.assetKey,
        scopeExceptionApprovalId: `scope-exception-${asset.assetKey}`,
        runtimePublicationKey: asset.publicationKey,
        rollbackTarget: `rollback:${asset.publicationKey}:verified`,
        enabledLearningScopes: ['company', 'project'],
      }))
      expect(decision.productionLineage.evidenceRefs).toEqual(expect.objectContaining({
        publicationExecutionRef: `algorithm_learnable_parameter_runtime_publications:${asset.publicationKey}`,
        runtimeConsumerObservationRef: `runtime_consumer:consumer-${asset.assetKey}-1`,
        impactMonitoringEvidenceRef: `impact_monitoring:${asset.publicationKey}:armed`,
        rollbackDrillEvidenceRef: `rollback:${asset.publicationKey}:verified`,
        accuracyEvidenceRef: `duration_algorithm_accuracy_events:accuracy-${asset.assetKey}-1`,
      }))
      expect(decision.productionLineage.rejectedRows).toEqual([])
      expect(decision.productionLineage.rejectedRecords).toEqual([])
    }
  })
})
