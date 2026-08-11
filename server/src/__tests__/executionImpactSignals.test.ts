import { describe, expect, it } from 'vitest'

import {
  buildAcceptancePlanImpactSignals,
  buildConditionImpactSignals,
  buildObstacleImpactSignals,
  summarizeDelayImpactSignals,
} from '../services/executionImpactSignals.js'

describe('executionImpactSignals', () => {
  it('turns unmet hard conditions into structured start-gate impact signals', () => {
    const signals = buildConditionImpactSignals([
      {
        id: 'condition-drawing-1',
        condition_type: 'drawing',
        name: 'Shop drawing approval',
        is_satisfied: false,
        required_for_start: true,
        blocking_level: 'hard',
        source_entity_type: 'drawing_package',
        source_entity_id: 'drawing-1',
        target_date: '2026-05-24',
      },
    ])

    expect(signals).toEqual([
      expect.objectContaining({
        signalId: 'condition:condition-drawing-1',
        sourceAlgorithm: 'condition',
        sourceEntityType: 'drawing_package',
        sourceEntityId: 'drawing-1',
        sourceCategory: 'drawing',
        impactOwnership: 'condition',
        impactMode: 'start_wait',
        impactPhase: 'start',
        severity: 'critical',
        expectedDate: '2026-05-24',
        runtimePolicy: 'deterministic',
      }),
    ])
  })

  it('deduplicates condition and obstacle signals that describe the same material blocker', () => {
    const conditionSignals = buildConditionImpactSignals([
      {
        id: 'condition-material-1',
        condition_type: 'material',
        name: 'Facade panel arrival',
        is_satisfied: false,
        required_for_start: true,
        blocking_level: 'hard',
        source_entity_type: 'project_material',
        source_entity_id: 'material-1',
        expected_date: '2026-05-28',
      },
    ])
    const obstacleSignals = buildObstacleImpactSignals([
      {
        id: 'obstacle-material-1',
        obstacle_type: 'material',
        description: 'Facade panel supplier delay',
        severity: 'critical',
        source_entity_type: 'project_material',
        source_entity_id: 'material-1',
        estimated_resolve_date: '2026-05-28',
      },
    ], new Date('2026-05-20T08:00:00.000Z'))

    const summary = summarizeDelayImpactSignals([...conditionSignals, ...obstacleSignals], {
      forecastDelayDays: 5,
    })

    expect(summary.rawCount).toBe(2)
    expect(summary.dedupedCount).toBe(1)
    expect(summary.duplicates).toEqual([
      expect.objectContaining({
        dedupeKey: 'blocker:project_material:material-1:start',
        suppressedSignalIds: ['obstacle:obstacle-material-1'],
      }),
    ])
    expect(summary.signals[0]).toEqual(expect.objectContaining({
      signalId: 'condition:condition-material-1',
      impactMode: 'start_wait',
      sourceEntityType: 'project_material',
      sourceEntityId: 'material-1',
      sourceCategory: 'material',
    }))
  })

  it('uses canonical source_type and source_ref_id aliases for blocker identity', () => {
    const conditionSignals = buildConditionImpactSignals([{
      id: 'condition-material-canonical',
      condition_type: 'material',
      name: 'Facade panel arrival',
      is_satisfied: false,
      required_for_start: true,
      blocking_level: 'hard',
      source_type: 'project_material',
      source_ref_id: 'material-canonical',
      target_date: '2026-05-28',
    } as any])
    const obstacleSignals = buildObstacleImpactSignals([{
      id: 'obstacle-material-canonical',
      obstacle_type: 'material',
      description: 'Facade panel supplier delay',
      severity: 'critical',
      source_type: 'project_material',
      source_ref_id: 'material-canonical',
      estimated_resolve_date: '2026-05-28',
    } as any], new Date('2026-05-20T08:00:00.000Z'))

    const summary = summarizeDelayImpactSignals([...conditionSignals, ...obstacleSignals], {
      forecastDelayDays: 5,
    })

    expect(summary.dedupedCount).toBe(1)
    expect(summary.signals[0]).toEqual(expect.objectContaining({
      sourceEntityType: 'project_material',
      sourceEntityId: 'material-canonical',
      dedupeKey: 'blocker:project_material:material-canonical:start',
    }))
  })

  it('uses canonical source entity identity when a condition points at a shared blocker', () => {
    const [signal] = buildConditionImpactSignals([
      {
        id: 'condition-material-2',
        condition_type: 'material',
        name: 'Curtain wall panel arrival',
        is_satisfied: false,
        required_for_start: true,
        blocking_level: 'hard',
        source_entity_type: 'project_material',
        source_entity_id: 'material-2',
        target_date: '2026-05-30',
      },
    ])

    expect(signal).toEqual(expect.objectContaining({
      sourceEntityType: 'project_material',
      sourceEntityId: 'material-2',
      dedupeKey: 'blocker:project_material:material-2:start',
      metadata: expect.objectContaining({
        sourceRowId: 'condition-material-2',
      }),
    }))
  })

  it('classifies acceptance blockers by gate direction instead of treating all acceptance items as the same delay', () => {
    const signals = buildAcceptancePlanImpactSignals({
      planId: 'acceptance-1',
      status: 'pending',
      plannedDate: '2026-05-18',
      upstreamUnfinishedCount: 1,
      blockedRequirementCount: 1,
      requirementReadyPercent: 50,
      isOverdue: true,
      gateHint: 'handover',
    })

    expect(signals).toEqual(expect.arrayContaining([
      expect.objectContaining({
        sourceAlgorithm: 'acceptance',
        sourceEntityType: 'acceptance_plan',
        sourceEntityId: 'acceptance-1',
        impactOwnership: 'acceptance',
        impactMode: 'finish_gate',
        impactPhase: 'handover',
        severity: 'critical',
        runtimePolicy: 'deterministic',
      }),
      expect.objectContaining({
        impactMode: 'confidence_only',
        impactPhase: 'archive',
        severity: 'warning',
        runtimePolicy: 'confidence_only',
      }),
    ]))
  })

  it('separates confirmed delay from uncertainty caused by missing dates and confidence-only signals', () => {
    const summary = summarizeDelayImpactSignals([
      {
        signalId: 'condition:unknown',
        sourceAlgorithm: 'condition',
        sourceEntityType: 'task_condition',
        sourceEntityId: 'unknown',
        sourceCategory: 'site_access',
        impactOwnership: 'condition',
        impactMode: 'confidence_only',
        impactPhase: 'start',
        severity: 'warning',
        runtimePolicy: 'confidence_only',
        confidence: 0.45,
        reason: 'Missing target date',
        dedupeKey: 'condition:unknown',
      },
    ], {
      forecastDelayDays: 4,
      unknownBlockerCount: 2,
      staleKnownDateCount: 1,
    })

    expect(summary.confirmedDelayDays).toBe(0)
    expect(summary.uncertaintyIndex).toBeGreaterThan(0.35)
    expect(summary.uncertaintyReasons).toEqual(expect.arrayContaining([
      'unknown_blocker_dates',
      'stale_known_dates',
      'confidence_only_signals',
    ]))
  })

  it('adds critical-path weight and lightweight responsibility metadata without changing dedupe identity', () => {
    const conditionSignals = buildConditionImpactSignals([{
      id: 'condition-material-owner',
      condition_type: 'material',
      name: 'Curtain wall panel arrival',
      is_satisfied: false,
      required_for_start: true,
      blocking_level: 'hard',
      source_entity_type: 'project_material',
      source_entity_id: 'material-owner-1',
      expected_date: '2026-05-28',
      participant_unit_id: 'unit-facade',
      responsibility_role: 'supplier_install',
    } as any])
    const obstacleSignals = buildObstacleImpactSignals([{
      id: 'obstacle-material-owner',
      obstacle_type: 'material',
      description: 'Curtain wall supplier late delivery',
      severity: 'critical',
      source_entity_type: 'project_material',
      source_entity_id: 'material-owner-1',
      estimated_resolve_date: '2026-05-28',
      participant_unit_id: 'unit-facade',
      responsibility_role: 'supplier_install',
    } as any], new Date('2026-05-20T08:00:00.000Z'))

    const summary = summarizeDelayImpactSignals([...conditionSignals, ...obstacleSignals], {
      forecastDelayDays: 6,
      taskCriticality: {
        isCritical: true,
        totalFloatDays: 0,
        basis: 'baseline_critical_path',
      },
    })

    expect(summary.dedupedCount).toBe(1)
    expect(summary.weightedRiskScore).toBeGreaterThan(0.9)
    expect(summary.weightedConfirmedDelayDays).toBeGreaterThan(summary.confirmedDelayDays)
    expect(summary.criticality).toEqual(expect.objectContaining({
      isCritical: true,
      criticalityWeight: expect.any(Number),
      basis: 'baseline_critical_path',
    }))
    expect(summary.responsibilityBreakdown).toEqual([
      expect.objectContaining({
        ownerUnitId: 'unit-facade',
        ownerRole: 'supplier_install',
        signalCount: 1,
      }),
    ])
    expect(summary.signals[0]).toEqual(expect.objectContaining({
      dedupeKey: 'blocker:project_material:material-owner-1:start',
      criticalityWeight: expect.any(Number),
      responsibility: expect.objectContaining({
        ownerUnitId: 'unit-facade',
        ownerRole: 'supplier_install',
        basis: 'explicit_signal_metadata',
      }),
    }))
  })

  it('downgrades expired and low-confidence seed gates before they can become confirmed delay days', () => {
    const summary = summarizeDelayImpactSignals([
      {
        signalId: 'condition:expired-seed',
        sourceAlgorithm: 'condition',
        sourceEntityType: 'algorithm_seed',
        sourceEntityId: 'gb50300:04-01-01-P07:precondition:drawing_reviewed',
        sourceCategory: 'drawing',
        impactOwnership: 'condition',
        impactMode: 'start_wait',
        impactPhase: 'start',
        severity: 'critical',
        runtimePolicy: 'deterministic',
        confidence: 0.82,
        expectedDate: '2026-05-28',
        reason: 'Seed-backed drawing gate',
        dedupeKey: 'seed:expired:drawing:start',
        metadata: {
          staleReason: 'evidence_expired',
          stalePolicy: 'candidate_until_revalidated',
          validUntil: '2025-12-31',
          taskId: 'task-a',
        },
      },
      {
        signalId: 'acceptance:low-confidence-seed',
        sourceAlgorithm: 'acceptance',
        sourceEntityType: 'algorithm_seed',
        sourceEntityId: 'gb50300:04-01-01-P07:acceptance:self_check',
        sourceCategory: 'acceptance',
        impactOwnership: 'acceptance',
        impactMode: 'finish_gate',
        impactPhase: 'finish',
        severity: 'warning',
        runtimePolicy: 'deterministic',
        confidence: 0.44,
        expectedDate: '2026-05-29',
        reason: 'Low-confidence generated acceptance gate',
        dedupeKey: 'seed:low-confidence:acceptance:finish',
        metadata: {
          seedSource: 'GB50300-2013',
          ruleCode: 'seed:acceptance:self_check',
          taskId: 'task-a',
        },
      },
    ], {
      forecastDelayDays: 5,
      now: new Date('2026-05-26T00:00:00.000Z'),
    })

    expect(summary.confirmedDelayDays).toBe(0)
    expect(summary.uncertaintyReasons).toEqual(expect.arrayContaining([
      'candidate_only_signals',
      'confidence_only_signals',
      'stale_seed_signals',
    ]))
    expect(summary.signals).toEqual(expect.arrayContaining([
      expect.objectContaining({
        signalId: 'condition:expired-seed',
        runtimePolicy: 'candidate_only',
        metadata: expect.objectContaining({
          runtimeDowngradeReason: 'stale_seed_evidence',
        }),
      }),
      expect.objectContaining({
        signalId: 'acceptance:low-confidence-seed',
        runtimePolicy: 'confidence_only',
        impactMode: 'confidence_only',
        metadata: expect.objectContaining({
          runtimeDowngradeReason: 'low_confidence_seed',
        }),
      }),
    ]))
  })

  it('weights criticality with total float, free float, successor fan-out, and milestone distance', () => {
    const summary = summarizeDelayImpactSignals([
      {
        signalId: 'condition:fanout-critical',
        sourceAlgorithm: 'condition',
        sourceEntityType: 'project_material',
        sourceEntityId: 'material-critical',
        sourceCategory: 'material',
        impactOwnership: 'condition',
        impactMode: 'start_wait',
        impactPhase: 'start',
        severity: 'critical',
        runtimePolicy: 'deterministic',
        confidence: 0.88,
        expectedDate: '2026-05-30',
        reason: 'Critical shared material gate',
        dedupeKey: 'blocker:project_material:material-critical:start',
      },
    ], {
      forecastDelayDays: 4,
      taskCriticality: {
        isCritical: false,
        totalFloatDays: 1,
        freeFloatDays: 0,
        successorCount: 6,
        milestoneDistanceDays: 5,
        basis: 'cpm_replay',
      },
    })

    expect(summary.criticality).toEqual(expect.objectContaining({
      isCritical: false,
      totalFloatDays: 1,
      freeFloatDays: 0,
      successorCount: 6,
      milestoneDistanceDays: 5,
      criticalityWeight: 1.49,
      basis: 'cpm_replay',
      basisFactors: expect.arrayContaining([
        'near_zero_total_float',
        'zero_free_float',
        'high_successor_fanout',
        'near_downstream_milestone',
      ]),
    }))
    expect(summary.weightedConfirmedDelayDays).toBe(5.96)
    expect(summary.signals[0]).toEqual(expect.objectContaining({
      criticalityWeight: 1.49,
      criticalityBasis: 'cpm_replay',
    }))
  })

  it('rolls responsibility confidence, evidence, and shared contributors into attribution summary', () => {
    const summary = summarizeDelayImpactSignals([
      {
        signalId: 'condition:shared-owner',
        sourceAlgorithm: 'condition',
        sourceEntityType: 'project_material',
        sourceEntityId: 'material-shared-owner',
        sourceCategory: 'material',
        impactOwnership: 'condition',
        impactMode: 'start_wait',
        impactPhase: 'start',
        severity: 'critical',
        runtimePolicy: 'deterministic',
        confidence: 0.8,
        expectedDate: '2026-05-28',
        reason: 'Shared supplier and contractor gate',
        dedupeKey: 'blocker:project_material:material-shared-owner:start',
        responsibility: {
          ownerType: 'participant_unit',
          ownerUnitId: 'unit-supplier',
          ownerRole: 'supplier_install',
          basis: 'seed_and_contract_owner',
          confidence: 0.86,
          evidence: [
            { source: 'seed', value: 'typicalResponsibilityRole=supplier_install' },
            { source: 'task', value: 'participant_unit_id=unit-supplier' },
          ],
          contributors: [
            {
              ownerType: 'role',
              ownerRole: 'general_contractor',
              basis: 'coordination_owner',
              confidence: 0.62,
              evidence: [{ source: 'rule', value: 'shared_workface_coordination' }],
            },
          ],
        },
      },
    ], {
      forecastDelayDays: 3,
    })

    expect(summary.responsibilityBreakdown).toEqual([
      expect.objectContaining({
        ownerUnitId: 'unit-supplier',
        ownerRole: 'supplier_install',
        confidence: 0.86,
        evidence: expect.arrayContaining([
          expect.objectContaining({ source: 'seed', value: 'typicalResponsibilityRole=supplier_install' }),
        ]),
      }),
      expect.objectContaining({
        ownerUnitId: null,
        ownerRole: 'general_contractor',
        confidence: 0.62,
        evidence: expect.arrayContaining([
          expect.objectContaining({ source: 'rule', value: 'shared_workface_coordination' }),
        ]),
      }),
    ])
  })

  it('deduplicates shared blockers and same seed rules across project-level signal batches', () => {
    const summary = summarizeDelayImpactSignals([
      {
        signalId: 'task-a-material',
        sourceAlgorithm: 'condition',
        sourceEntityType: 'project_material',
        sourceEntityId: 'material-9',
        sourceCategory: 'material',
        impactOwnership: 'condition',
        impactMode: 'start_wait',
        impactPhase: 'start',
        severity: 'critical',
        runtimePolicy: 'deterministic',
        confidence: 0.85,
        expectedDate: '2026-05-28',
        reason: 'Task A waits for shared material',
        dedupeKey: 'condition-row-a',
        metadata: { taskId: 'task-a' },
      },
      {
        signalId: 'task-b-material',
        sourceAlgorithm: 'obstacle',
        sourceEntityType: 'project_material',
        sourceEntityId: 'material-9',
        sourceCategory: 'material',
        impactOwnership: 'obstacle',
        impactMode: 'start_wait',
        impactPhase: 'start',
        severity: 'critical',
        runtimePolicy: 'deterministic',
        confidence: 0.78,
        expectedDate: '2026-05-28',
        reason: 'Task B sees same shared material delay',
        dedupeKey: 'obstacle-row-b',
        metadata: { taskId: 'task-b' },
      },
      {
        signalId: 'task-a-seed',
        sourceAlgorithm: 'acceptance',
        sourceEntityType: 'algorithm_seed',
        sourceEntityId: 'gb50300:04-01-01-P07:acceptance:self_check',
        sourceCategory: 'acceptance',
        impactOwnership: 'acceptance',
        impactMode: 'finish_gate',
        impactPhase: 'finish',
        severity: 'warning',
        runtimePolicy: 'deterministic',
        confidence: 0.82,
        expectedDate: '2026-05-29',
        reason: 'Task A self check',
        dedupeKey: 'seed-row-a',
        metadata: {
          taskId: 'task-a',
          sourceStandard: 'GB50300-2013',
          ruleCode: 'seed:acceptance:self_check',
        },
      },
      {
        signalId: 'task-c-seed',
        sourceAlgorithm: 'acceptance',
        sourceEntityType: 'algorithm_seed',
        sourceEntityId: 'gb50300:04-01-01-P08:acceptance:self_check',
        sourceCategory: 'acceptance',
        impactOwnership: 'acceptance',
        impactMode: 'finish_gate',
        impactPhase: 'finish',
        severity: 'warning',
        runtimePolicy: 'deterministic',
        confidence: 0.8,
        expectedDate: '2026-05-29',
        reason: 'Task C self check from the same governed seed rule',
        dedupeKey: 'seed-row-c',
        metadata: {
          taskId: 'task-c',
          sourceStandard: 'GB50300-2013',
          ruleCode: 'seed:acceptance:self_check',
        },
      },
    ], {
      forecastDelayDays: 7,
      dedupeScope: 'project',
    })

    expect(summary.rawCount).toBe(4)
    expect(summary.dedupedCount).toBe(2)
    expect(summary.duplicates).toEqual(expect.arrayContaining([
      expect.objectContaining({
        dedupeKey: 'project:blocker:project_material:material-9:start',
        affectedTaskIds: ['task-a', 'task-b'],
      }),
      expect.objectContaining({
        dedupeKey: 'project:seed-rule:GB50300-2013:seed:acceptance:self_check:acceptance:finish',
        affectedTaskIds: ['task-a', 'task-c'],
      }),
    ]))
    expect(summary.signals).toEqual(expect.arrayContaining([
      expect.objectContaining({
        signalId: 'task-a-material',
        metadata: expect.objectContaining({
          affectedTaskIds: ['task-a', 'task-b'],
        }),
      }),
      expect.objectContaining({
        signalId: 'task-a-seed',
        metadata: expect.objectContaining({
          affectedTaskIds: ['task-a', 'task-c'],
        }),
      }),
    ]))
  })
})
