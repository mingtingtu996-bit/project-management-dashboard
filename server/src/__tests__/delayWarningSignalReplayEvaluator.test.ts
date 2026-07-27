import { describe, expect, it } from 'vitest'
import {
  buildDelayWarningReplaySamples,
  evaluateDelayWarningSignalReplay,
  type DelayWarningReplaySample,
} from '../services/delayWarningSignalReplayEvaluator.js'
import type { ExecutionImpactSignal } from '../services/executionImpactSignals.js'

function signal(overrides: Partial<ExecutionImpactSignal>): ExecutionImpactSignal {
  return {
    signalId: overrides.signalId ?? 'signal-1',
    sourceAlgorithm: overrides.sourceAlgorithm ?? 'condition',
    sourceEntityType: overrides.sourceEntityType ?? 'algorithm_seed',
    sourceEntityId: overrides.sourceEntityId ?? overrides.signalId ?? 'seed-1',
    sourceCategory: overrides.sourceCategory ?? 'condition',
    impactOwnership: overrides.impactOwnership ?? 'condition',
    impactMode: overrides.impactMode ?? 'start_wait',
    impactPhase: overrides.impactPhase ?? 'start',
    severity: overrides.severity ?? 'critical',
    runtimePolicy: overrides.runtimePolicy ?? 'deterministic',
    confidence: overrides.confidence ?? 0.82,
    expectedDate: overrides.expectedDate ?? '2026-05-20',
    reason: overrides.reason ?? 'seed-backed gate',
    dedupeKey: overrides.dedupeKey ?? `blocker:${overrides.sourceEntityType ?? 'algorithm_seed'}:${overrides.sourceEntityId ?? overrides.signalId ?? 'seed-1'}:start`,
    metadata: overrides.metadata,
  }
}

describe('delayWarningSignalReplayEvaluator', () => {
  it('compares before and after signal sets and reports hit-rate and false-positive deltas', () => {
    const samples: DelayWarningReplaySample[] = [
      {
        taskId: 'task-hit-added',
        plannedEndDate: '2026-05-10',
        actualEndDate: '2026-05-15',
        beforeSignals: [],
        afterSignals: [signal({ signalId: 'seed-material', sourceEntityId: 'material-gate' })],
      },
      {
        taskId: 'task-existing-hit',
        plannedEndDate: '2026-05-10',
        actualEndDate: '2026-05-13',
        beforeSignals: [signal({ signalId: 'old-obstacle', sourceAlgorithm: 'obstacle', sourceEntityType: 'task_obstacle', sourceEntityId: 'obstacle-1' })],
        afterSignals: [
          signal({ signalId: 'old-obstacle', sourceAlgorithm: 'obstacle', sourceEntityType: 'task_obstacle', sourceEntityId: 'obstacle-1' }),
          signal({ signalId: 'seed-acceptance', sourceAlgorithm: 'acceptance', impactOwnership: 'acceptance', impactMode: 'finish_gate', impactPhase: 'finish', sourceEntityId: 'acceptance-gate' }),
        ],
      },
      {
        taskId: 'task-false-positive',
        plannedEndDate: '2026-05-10',
        actualEndDate: '2026-05-10',
        beforeSignals: [],
        afterSignals: [signal({ signalId: 'seed-uncertain', runtimePolicy: 'confidence_only', impactMode: 'confidence_only', confidence: 0.45 })],
      },
    ]

    const result = evaluateDelayWarningSignalReplay(samples)

    expect(result.sampleCount).toBe(3)
    expect(result.before).toEqual(expect.objectContaining({
      actualDelayedCount: 2,
      warnedCount: 1,
      truePositiveCount: 1,
      falsePositiveCount: 0,
      falseNegativeCount: 1,
      precision: 1,
      recall: 0.5,
    }))
    expect(result.after).toEqual(expect.objectContaining({
      actualDelayedCount: 2,
      warnedCount: 3,
      truePositiveCount: 2,
      falsePositiveCount: 1,
      falseNegativeCount: 0,
      precision: 0.67,
      recall: 1,
    }))
    expect(result.delta).toEqual(expect.objectContaining({
      recallDelta: 0.5,
      falsePositiveDelta: 1,
      netAssessment: 'hit_rate_improved_with_more_false_positives',
    }))
    expect(result.after.topSourceCategories).toEqual(expect.arrayContaining([
      expect.objectContaining({ category: 'condition', count: expect.any(Number) }),
    ]))
  })

  it('separates deterministic delay warnings from uncertain risk-only signals during replay', () => {
    const [result] = evaluateDelayWarningSignalReplay([
      {
        taskId: 'task-risk-only',
        plannedEndDate: '2026-05-10',
        actualEndDate: '2026-05-14',
        beforeSignals: [],
        afterSignals: [
          signal({
            signalId: 'seed-risk',
            impactMode: 'confidence_only',
            runtimePolicy: 'confidence_only',
            expectedDate: null,
            confidence: 0.5,
          }),
        ],
      },
    ]).sampleResults

    expect(result.after).toEqual(expect.objectContaining({
      hasConfirmedDelaySignal: false,
      hasUncertainRiskSignal: true,
      warned: true,
    }))
  })

  it('breaks down replay quality by seed source, rule identity, responsibility owner, and critical-path weighting', () => {
    const result = evaluateDelayWarningSignalReplay([
      {
        taskId: 'critical-hit',
        plannedEndDate: '2026-05-10',
        actualEndDate: '2026-05-14',
        beforeSignals: [],
        afterSignals: [
          signal({
            signalId: 'seed-gb50300-hit',
            sourceEntityType: 'algorithm_seed',
            sourceEntityId: 'gb50300:04-01-01-P07:acceptance:self_check',
            sourceCategory: 'acceptance',
            impactOwnership: 'acceptance',
            impactMode: 'finish_gate',
            impactPhase: 'finish',
            metadata: {
              sourceStandard: 'GB50300-2013',
              ruleCode: 'seed:acceptance:self_check',
              ownerUnitId: 'unit-qa',
              ownerRole: 'supervision',
              criticalityWeight: 1.35,
            },
          }),
        ],
      },
      {
        taskId: 'critical-false-positive',
        plannedEndDate: '2026-05-10',
        actualEndDate: '2026-05-10',
        beforeSignals: [],
        afterSignals: [
          signal({
            signalId: 'seed-gb50300-fp',
            sourceEntityType: 'algorithm_seed',
            sourceEntityId: 'gb50300:04-01-01-P08:acceptance:self_check',
            sourceCategory: 'acceptance',
            impactOwnership: 'acceptance',
            impactMode: 'finish_gate',
            impactPhase: 'finish',
            metadata: {
              sourceStandard: 'GB50300-2013',
              ruleCode: 'seed:acceptance:self_check',
              ownerUnitId: 'unit-qa',
              ownerRole: 'supervision',
              criticalityWeight: 1.35,
            },
          }),
        ],
      },
    ])

    expect(result.after.topSeedSources).toEqual([
      expect.objectContaining({
        source: 'GB50300-2013',
        warnedCount: 2,
        truePositiveCount: 1,
        falsePositiveCount: 1,
        precision: 0.5,
        weightedTruePositiveCount: 1.35,
      }),
    ])
    expect(result.after.topRules).toEqual([
      expect.objectContaining({
        rule: 'seed:acceptance:self_check',
        warnedCount: 2,
        falsePositiveCount: 1,
      }),
    ])
    expect(result.after.topResponsibilityOwners).toEqual([
      expect.objectContaining({
        owner: 'unit-qa|supervision',
        warnedCount: 2,
        truePositiveCount: 1,
      }),
    ])
  })

  it('builds ordinary replay samples from historical task records and signal snapshots', () => {
    const samples = buildDelayWarningReplaySamples([
      {
        id: 'task-a',
        planned_end_date: '2026-05-10',
        actual_end_date: '2026-05-14',
        impact_signal_snapshots: [
          {
            captured_at: '2026-05-01',
            stage: 'before',
            signals: [signal({ signalId: 'before-a', sourceEntityId: 'before-a' })],
          },
          {
            captured_at: '2026-05-08',
            stage: 'after',
            signals: [signal({ signalId: 'after-a', sourceEntityId: 'after-a' })],
          },
        ],
      },
      {
        task_id: 'task-b',
        plannedEndDate: '2026-05-10',
        actualEndDate: '2026-05-10',
        beforeImpactSignals: [signal({ signalId: 'before-b', sourceEntityId: 'before-b' })],
        afterImpactSignals: [signal({ signalId: 'after-b', sourceEntityId: 'after-b' })],
      },
    ])

    expect(samples).toEqual([
      expect.objectContaining({
        taskId: 'task-a',
        plannedEndDate: '2026-05-10',
        actualEndDate: '2026-05-14',
        beforeSignals: [expect.objectContaining({ signalId: 'before-a' })],
        afterSignals: [expect.objectContaining({ signalId: 'after-a' })],
      }),
      expect.objectContaining({
        taskId: 'task-b',
        beforeSignals: [expect.objectContaining({ signalId: 'before-b' })],
        afterSignals: [expect.objectContaining({ signalId: 'after-b' })],
      }),
    ])
  })

  it('recommends calibrated warning thresholds from replay precision and recall tradeoffs', () => {
    const samples: DelayWarningReplaySample[] = [
      {
        taskId: 'hit-high',
        plannedEndDate: '2026-05-10',
        actualEndDate: '2026-05-14',
        beforeSignals: [],
        afterSignals: [
          signal({
            signalId: 'hit-high-signal',
            sourceEntityId: 'hit-high',
            confidence: 0.9,
            metadata: { criticalityWeight: 1.35 },
          }),
        ],
      },
      {
        taskId: 'hit-medium',
        plannedEndDate: '2026-05-10',
        actualEndDate: '2026-05-12',
        beforeSignals: [],
        afterSignals: [
          signal({
            signalId: 'hit-medium-signal',
            sourceEntityId: 'hit-medium',
            confidence: 0.72,
            severity: 'warning',
            metadata: { criticalityWeight: 1.1 },
          }),
        ],
      },
      {
        taskId: 'miss-low',
        plannedEndDate: '2026-05-10',
        actualEndDate: '2026-05-15',
        beforeSignals: [],
        afterSignals: [
          signal({
            signalId: 'miss-low-signal',
            sourceEntityId: 'miss-low',
            confidence: 0.42,
            severity: 'warning',
            runtimePolicy: 'confidence_only',
            impactMode: 'confidence_only',
          }),
        ],
      },
      {
        taskId: 'false-positive-low',
        plannedEndDate: '2026-05-10',
        actualEndDate: '2026-05-10',
        beforeSignals: [],
        afterSignals: [
          signal({
            signalId: 'false-positive-low-signal',
            sourceEntityId: 'false-positive-low',
            confidence: 0.4,
            severity: 'warning',
            runtimePolicy: 'confidence_only',
            impactMode: 'confidence_only',
          }),
        ],
      },
      {
        taskId: 'true-negative',
        plannedEndDate: '2026-05-10',
        actualEndDate: '2026-05-10',
        beforeSignals: [],
        afterSignals: [],
      },
    ]

    const result = evaluateDelayWarningSignalReplay(samples, {
      calibration: {
        minPrecision: 0.65,
        minRecall: 0.6,
        maxFalsePositiveRate: 0.35,
        candidateThresholds: [0, 0.35, 0.55, 0.75],
      },
    })

    expect(result.thresholdCalibration).toEqual(expect.objectContaining({
      policy: 'replay_precision_recall_false_positive_guardrail',
      recommendedThreshold: 0.35,
      recommendedWarningPolicy: 'confirmed_or_weighted_risk_score_at_least_threshold',
      currentThreshold: 0,
    }))
    expect(result.thresholdCalibration?.candidateResults).toEqual(expect.arrayContaining([
      expect.objectContaining({
        threshold: 0.35,
        precision: 1,
        recall: 0.67,
        falsePositiveRate: 0,
        accepted: true,
      }),
      expect.objectContaining({
        threshold: 0.75,
        precision: 1,
        recall: 0.33,
        accepted: false,
        rejectionReasons: expect.arrayContaining(['recall_below_minimum']),
      }),
    ]))
  })
})
