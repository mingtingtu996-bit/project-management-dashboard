import { describe, expect, it } from 'vitest'

import { buildPolicyOpsAutoPublishDecision } from '../services/policyOpsAutoPublishGateService.js'

const readySourceCoverage = {
  coverageStatus: 'ready' as const,
  coverageRate: 1,
  missingOrWeakSourceAssetCount: 0,
}

const readyParseHitRate = {
  evaluatedSnapshotCount: 5,
  averageHitRate: 0.9,
  status: 'ready_for_rule_diff' as const,
}

const readyReplay = {
  sampleCount: 3,
  calibratedSampleCount: 3,
  status: 'candidate_overlay_ready' as const,
}

describe('policy ops auto-publish gate service', () => {
  it('promotes a policy run only when source, parser, replay, and blocked-update gates pass', () => {
    const decision = buildPolicyOpsAutoPublishDecision({
      domain: 'pre_certificate',
      asOfDate: '2026-09-01',
      summary: {
        candidateUpdateCount: 3,
        autoPublishedUpdateCount: 3,
        blockedUpdateCount: 0,
      },
      sourceCoverage: readySourceCoverage,
      policyParseHitRate: readyParseHitRate,
      projectReplayCalibration: readyReplay,
    })

    expect(decision).toMatchObject({
      runtimeConsumptionStatus: 'stable_consumable',
      promotionDecision: 'promote_to_stable',
      runtimeConsumptionPolicy: 'consume_stable_auto_published_seed',
      stableConsumptionAllowed: true,
      reasonCodes: [],
    })
  })

  it('keeps parsed but under-calibrated runs as audit-only candidates', () => {
    const decision = buildPolicyOpsAutoPublishDecision({
      domain: 'acceptance_timeline',
      asOfDate: '2026-09-01',
      summary: {
        candidateUpdateCount: 3,
        autoPublishedUpdateCount: 3,
        blockedUpdateCount: 0,
      },
      sourceCoverage: readySourceCoverage,
      policyParseHitRate: readyParseHitRate,
      projectReplayCalibration: {
        ...readyReplay,
        sampleCount: 1,
        status: 'needs_more_samples',
      },
      goldenReplayBaseline: {
        status: 'baseline_ready',
      },
    })

    expect(decision).toMatchObject({
      runtimeConsumptionStatus: 'candidate_only',
      promotionDecision: 'hold_as_candidate_overlay',
      runtimeConsumptionPolicy: 'candidate_overlay_for_audit_only',
      stableConsumptionAllowed: false,
      reasonCodes: ['project_replay_needs_more_samples'],
    })
  })

  it('rolls back to previous stable policy when hard gates fail', () => {
    const decision = buildPolicyOpsAutoPublishDecision({
      domain: 'pre_certificate',
      asOfDate: '2026-09-02',
      summary: {
        candidateUpdateCount: 3,
        autoPublishedUpdateCount: 2,
        blockedUpdateCount: 1,
      },
      sourceCoverage: readySourceCoverage,
      policyParseHitRate: {
        evaluatedSnapshotCount: 0,
        averageHitRate: 0,
        status: 'not_evaluated',
      },
      projectReplayCalibration: readyReplay,
      previousStableRunAvailable: true,
    })

    expect(decision).toMatchObject({
      runtimeConsumptionStatus: 'rolled_back_to_previous',
      promotionDecision: 'rollback_to_previous_stable',
      runtimeConsumptionPolicy: 'retain_previous_published_seed',
      stableConsumptionAllowed: false,
      reasonCodes: ['policy_parse_not_evaluated', 'blocked_policy_updates_present'],
    })
  })
})
