import { describe, expect, it } from 'vitest'

import { collectDurationContextGovernanceReport } from '../services/durationContextGovernanceService.js'
import {
  buildAndPersistDurationContextPolicyRecommendation,
  buildDurationContextPolicyRecommendation,
  evaluateDurationContextPolicyReward,
} from '../services/durationContextPolicyLearningService.js'

describe('durationContextPolicyLearningService', () => {
  it('keeps high-risk factor strategy recommendations out of unattended runtime publication', () => {
    const result = buildDurationContextPolicyRecommendation({
      projectId: 'project-high-risk',
      state: {
        projectType: 'residential',
        city: '杭州',
        yearMonth: '2027-02',
        maturityDays: 90,
        ruleBaselineP: 0.42,
        currentP: 0.42,
        isCriticalPath: true,
        hardConstraintActive: true,
        factorSignals: [
          { factorKey: 'weather_forecast_impact', multiplier: 1.24, extraDays: 2, actionPolicy: 'candidate_only' },
          { factorKey: 'process_constraint', multiplier: 1.18, extraDays: 3, actionPolicy: 'candidate_only' },
        ],
      },
      replayEvidence: {
        maeBefore: 0.18,
        maeAfter: 0.09,
        overcompensationRate: 0.01,
        sampleCount: 96,
      },
    })

    expect(result.modelFamily).toBe('contextual_bandit_v1')
    expect(result.stateVector.highRiskFactorCount).toBe(2)
    expect(result.recommendedAction).toEqual(expect.objectContaining({
      actionKey: 'hold_high_risk_candidate_for_review',
      runtimePolicy: 'candidate_only',
      runtimeAutoPublishEligible: false,
    }))
    expect(result.recommendedAction.guardrailViolations).toEqual(expect.arrayContaining([
      'manual_runtime_promotion_required',
      'hard_constraint_active',
    ]))
  })

  it('marks low-risk productivity calibration as auto-publish eligible only after mature safe replay evidence', () => {
    const result = buildDurationContextPolicyRecommendation({
      projectId: 'project-low-risk',
      state: {
        projectType: 'residential',
        city: '杭州',
        yearMonth: '2027-06',
        maturityDays: 90,
        ruleBaselineP: 0.74,
        currentP: 0.82,
        scheduleState: 'accelerating',
        factorSignals: [
          { factorKey: 'productivity_compensation', multiplier: 0.94, extraDays: 0, actionPolicy: 'auto_apply' },
          { factorKey: 'project_baseline_calibration', multiplier: 0.98, extraDays: 0, actionPolicy: 'auto_apply' },
        ],
      },
      replayEvidence: {
        maeBefore: 0.14,
        maeAfter: 0.05,
        overcompensationRate: 0.02,
        sampleCount: 120,
      },
    })

    expect(result.recommendedAction).toEqual(expect.objectContaining({
      actionKey: 'publish_low_risk_calibration_threshold',
      runtimePolicy: 'auto_publish_eligible',
      runtimeAutoPublishEligible: true,
    }))
    expect(result.recommendedAction.expectedReward).toBeGreaterThan(0)
    expect(result.recommendedAction.guardrailViolations).toEqual([])
  })

  it('does not treat equal MAE as a publishable improvement', () => {
    const result = buildDurationContextPolicyRecommendation({
      companyId: 'company-a',
      projectId: 'project-equal-mae',
      state: {
        projectType: 'residential',
        city: '杭州',
        yearMonth: '2027-06',
        maturityDays: 90,
        ruleBaselineP: 0.74,
        currentP: 0.82,
        factorSignals: [
          { factorKey: 'productivity_compensation', multiplier: 0.94, extraDays: 0, actionPolicy: 'auto_apply' },
        ],
      },
      replayEvidence: {
        maeBefore: 0.08,
        maeAfter: 0.08,
        overcompensationRate: 0.02,
        sampleCount: 120,
      },
    })

    const publicationAction = result.candidateActions.find((action) => action.actionKey === 'publish_low_risk_calibration_threshold')
    expect(publicationAction).toEqual(expect.objectContaining({
      runtimePolicy: 'candidate_only',
      runtimeAutoPublishEligible: false,
      guardrailViolations: expect.arrayContaining(['insufficient_mature_safe_replay_evidence']),
    }))
  })

  it('scores candidate actions with action-specific counterfactual rewards instead of cloning the replay reward', () => {
    const result = buildDurationContextPolicyRecommendation({
      projectId: 'project-action-reward',
      state: {
        projectType: 'residential',
        city: '杭州',
        yearMonth: '2027-06',
        maturityDays: 90,
        ruleBaselineP: 0.76,
        currentP: 0.88,
        scheduleState: 'accelerating',
        factorSignals: [
          { factorKey: 'productivity_compensation', multiplier: 0.94, extraDays: 0, actionPolicy: 'auto_apply' },
          { factorKey: 'project_baseline_calibration', multiplier: 1.16, extraDays: 1, actionPolicy: 'auto_apply' },
        ],
      },
      replayEvidence: {
        maeBefore: 0.16,
        maeAfter: 0.07,
        overcompensationRate: 0.03,
        scheduleStabilityDelta: 0.04,
        sampleCount: 120,
      },
    })

    const rewards = new Map(result.candidateActions.map((action) => [action.actionKey, action.expectedReward]))
    const uniqueRewards = new Set(result.candidateActions.map((action) => action.expectedReward))

    expect(uniqueRewards.size).toBeGreaterThan(1)
    expect(rewards.get('publish_low_risk_calibration_threshold')).toBeGreaterThan(rewards.get('keep_rule_baseline') ?? Number.NEGATIVE_INFINITY)
    expect(rewards.get('recommend_resequence_workfaces')).not.toBe(rewards.get('recommend_weather_recovery_overtime'))
  })

  it('penalizes strategies that improve MAE by violating hard construction constraints', () => {
    const reward = evaluateDurationContextPolicyReward({
      maeBefore: 0.18,
      maeAfter: 0.03,
      overcompensationRate: 0.01,
      scheduleStabilityDelta: 0.02,
      hardConstraintViolation: true,
      highRiskRuntimeAutoPublishAttempted: true,
    })

    expect(reward.totalReward).toBeLessThan(0)
    expect(reward.components.maeImprovement).toBeGreaterThan(0)
    expect(reward.penalties.hardConstraintViolation).toBeLessThan(0)
    expect(reward.penalties.highRiskRuntimeAutoPublish).toBeLessThan(0)
  })

  it('publishes a backend-only policy learning contract in the duration context governance report', () => {
    const report = collectDurationContextGovernanceReport()

    expect(report.policyLearningContract).toEqual(expect.objectContaining({
      modelFamily: 'contextual_bandit_v1',
      runtimeRole: 'strategy_candidate_layer_only',
      productionBoundary: 'rule_layer_remains_authoritative_high_risk_manual_promotion',
      stateFeatures: expect.arrayContaining(['factorSignals', 'scheduleState', 'maturityDays', 'criticalPathFlag']),
      actionFamilies: expect.arrayContaining(['keep_rule_baseline', 'publish_low_risk_calibration_threshold']),
      rewardSignals: expect.arrayContaining(['mae_improvement', 'overcompensation_penalty', 'hard_constraint_violation_penalty']),
    }))
  })

  it('persists policy recommendations as unified governance candidates without runtime writes', async () => {
    const calls: Array<{ sql: string, params: unknown[] }> = []
    const queryExec = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> => {
      calls.push({ sql, params })
      if (sql.includes('INSERT INTO public.algorithm_asset_candidate_events')) {
        return [{ id: 'duration-context-policy-candidate-id' }] as T[]
      }
      return [] as T[]
    }

    const result = await buildAndPersistDurationContextPolicyRecommendation({
      companyId: '10000000-0000-4000-8000-000000000001',
      projectId: 'project-high-risk',
      state: {
        projectType: 'residential',
        city: '杭州',
        yearMonth: '2027-02',
        maturityDays: 90,
        ruleBaselineP: 0.42,
        currentP: 0.42,
        isCriticalPath: true,
        hardConstraintActive: true,
        factorSignals: [
          { factorKey: 'weather_forecast_impact', multiplier: 1.24, extraDays: 2, actionPolicy: 'candidate_only' },
          { factorKey: 'process_constraint', multiplier: 1.18, extraDays: 3, actionPolicy: 'candidate_only' },
        ],
      },
      replayEvidence: {
        maeBefore: 0.18,
        maeAfter: 0.09,
        overcompensationRate: 0.01,
        sampleCount: 96,
      },
      queryExec,
    })

    expect(result.recommendation.recommendedAction.actionKey).toBe('hold_high_risk_candidate_for_review')
    expect(result.event).toEqual(expect.objectContaining({
      assetKey: 'duration.context.policy.contextual_bandit_v1.project-high-risk',
      sourceSystem: 'durationContextPolicyLearningService',
      scopeType: 'project',
      companyId: '10000000-0000-4000-8000-000000000001',
      projectId: 'project-high-risk',
      publishAnchor: 'manual_governance_required',
      automationMaturity: 'auto_review_package',
      learningTarget: 'candidate_weight',
      lifecycleStatus: 'review_required',
      candidatePayload: expect.objectContaining({
        experienceTier: 'T3',
        experienceAssetType: 'project_efficiency_model',
        reuseScope: 'project',
        factSource: 'hybrid',
        companyId: '10000000-0000-4000-8000-000000000001',
        projectId: 'project-high-risk',
      }),
    }))
    expect(result.persistence.candidateEventId).toBe('duration-context-policy-candidate-id')

    const sql = calls.map((call) => call.sql).join('\n').toLowerCase()
    expect(sql).toContain('insert into public.algorithm_asset_candidate_events')
    expect(sql).not.toContain('task_dependencies')
    expect(sql).not.toContain('standard_work_duration')
    expect(sql).not.toContain('algorithm_seed_records')
  })
})
