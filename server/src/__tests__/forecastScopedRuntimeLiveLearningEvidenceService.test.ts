import { describe, expect, it } from 'vitest'
import {
  buildForecastScopedRuntimeLiveLearningEvidence,
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
})
