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
})
