import { describe, expect, it } from 'vitest'
import {
  buildDurationLiveLearningCompletionAudit,
} from '../services/durationLiveLearningCompletionAuditService.js'
import type { DurationLiveLearningEvidence } from '../services/durationLiveLearningClosureService.js'

const fullScopeEvidence: DurationLiveLearningEvidence = {
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
}

const companyProjectScopedEvidence: DurationLiveLearningEvidence = {
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
}

function buildCompleteOverrides() {
  return [
    { assetKey: 'base_duration_benchmark' as const, evidence: fullScopeEvidence },
    { assetKey: 'duration_cold_start_baseline' as const, evidence: fullScopeEvidence },
    { assetKey: 'forecast_residual_overlay' as const, evidence: companyProjectScopedEvidence },
    { assetKey: 'forecast_confidence_weight' as const, evidence: companyProjectScopedEvidence },
    { assetKey: 'standard_work_duration_seed' as const, evidence: fullScopeEvidence },
    { assetKey: 'special_work_duration_seed' as const, evidence: fullScopeEvidence },
    { assetKey: 'wbs_reference_days' as const, evidence: fullScopeEvidence },
    { assetKey: 'dependency_rule_candidate' as const, evidence: fullScopeEvidence },
    { assetKey: 'critical_path_rule_candidate' as const, evidence: fullScopeEvidence },
  ]
}

describe('durationLiveLearningCompletionAuditService', () => {
  it('declares completion only when all learnable assets are ready and fact assets stay locked', () => {
    const audit = buildDurationLiveLearningCompletionAudit({
      evidenceOverrides: buildCompleteOverrides(),
    })

    expect(audit.status).toBe('duration_live_learning_completion_ready')
    expect(audit.allowedClaim).toBe(
      'all_learnable_duration_prediction_and_network_assets_are_live_self_learning;facts_and_commitments_remain_locked',
    )
    expect(audit.prohibitedClaim).toBe('all_duration_assets_are_live_self_learning')
    expect(audit.manifestEvaluations.map((manifest) => manifest.status)).toEqual([
      'manifest_live_self_learning_ready',
      'manifest_live_self_learning_ready',
    ])
    expect(audit.executionPlan.status).toBe('execution_plan_ready')
    expect(audit.portfolio.status).toBe('portfolio_live_self_learning_ready')
    expect(audit.learnableAssetKeys).toEqual([
      'base_duration_benchmark',
      'duration_cold_start_baseline',
      'forecast_residual_overlay',
      'forecast_confidence_weight',
      'standard_work_duration_seed',
      'special_work_duration_seed',
      'wbs_reference_days',
      'dependency_rule_candidate',
      'critical_path_rule_candidate',
    ])
    expect(audit.factLockedAssetKeys).toEqual([
      'baseline_commitment',
      'monthly_plan_commitment',
      'actual_duration_outcome',
      'progress_snapshot',
    ])
    expect(audit.blockedAssetKeys).toEqual([])
    expect(audit.factRewriteBlockedAssetKeys).toEqual([])
  })

  it('keeps completion closed when any learnable evidence is missing or a fact rewrite is requested', () => {
    const overrides = buildCompleteOverrides()
      .filter((override) => override.assetKey !== 'critical_path_rule_candidate')

    const audit = buildDurationLiveLearningCompletionAudit({
      evidenceOverrides: overrides,
      requestedFactRewriteAssetKeys: ['baseline_commitment'],
    })

    expect(audit.status).toBe('duration_live_learning_completion_not_ready')
    expect(audit.allowedClaim).toBe('not_ready_for_live_self_learning_claim')
    expect(audit.prohibitedClaim).toBe('all_duration_assets_are_live_self_learning')
    expect(audit.blockedAssetKeys).toContain('critical_path_rule_candidate')
    expect(audit.factRewriteBlockedAssetKeys).toEqual(['baseline_commitment'])
    expect(audit.executionPlan.status).toBe('execution_plan_not_ready')
    expect(audit.portfolio.status).toBe('portfolio_not_ready')
  })
})
