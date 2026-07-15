import { describe, expect, it } from 'vitest'
import type { ExecutionImpactSignal } from '../services/executionImpactSignals.js'
import {
  buildImpactSignalCoverageSummary,
  buildDelayWarningReplayGovernanceReport,
  buildOwnerConfirmationRequests,
  buildImpactSignalWarningDebugReport,
  buildImpactSignalWarningLifecyclePlan,
  buildReplayThresholdAlgorithmSeedCandidate,
  buildReplayThresholdCandidate,
  buildResponsibilityEscalationPlan,
  buildRuleQualityUpdatesFromWarnings,
  resolveWarningImpactSignalPolicy,
  buildWarningsFromImpactSignalSummary,
} from '../services/warningImpactSignalService.js'

function signal(overrides: Partial<ExecutionImpactSignal>): ExecutionImpactSignal {
  return {
    signalId: overrides.signalId ?? 'signal-1',
    sourceAlgorithm: overrides.sourceAlgorithm ?? 'condition',
    sourceEntityType: overrides.sourceEntityType ?? 'project_material',
    sourceEntityId: overrides.sourceEntityId ?? 'material-1',
    sourceCategory: overrides.sourceCategory ?? 'material',
    impactOwnership: overrides.impactOwnership ?? 'condition',
    impactMode: overrides.impactMode ?? 'start_wait',
    impactPhase: overrides.impactPhase ?? 'start',
    severity: overrides.severity ?? 'critical',
    runtimePolicy: overrides.runtimePolicy ?? 'deterministic',
    confidence: overrides.confidence ?? 0.86,
    expectedDate: overrides.expectedDate ?? '2026-05-28',
    reason: overrides.reason ?? 'shared material gate blocks start',
    dedupeKey: overrides.dedupeKey ?? 'project:blocker:project_material:material-1:start',
    metadata: overrides.metadata,
    responsibility: overrides.responsibility,
    criticalityWeight: overrides.criticalityWeight,
    criticalityBasis: overrides.criticalityBasis,
    weightedRiskScore: overrides.weightedRiskScore,
  }
}

describe('warningImpactSignalService', () => {
  it('builds one readiness warning from a project-scope deduped impactSignalSummary instead of double-counting shared blockers', () => {
    const warnings = buildWarningsFromImpactSignalSummary({
      projectId: 'project-1',
      taskId: 'task-1',
      taskTitle: '主体结构施工',
      source: 'readiness_summary',
      ownerships: ['condition', 'obstacle'],
      includeDelayWarning: false,
      summary: {
        rawCount: 2,
        dedupedCount: 1,
        duplicates: [{
          dedupeKey: 'project:blocker:project_material:material-1:start',
          keptSignalId: 'condition-material',
          suppressedSignalIds: ['obstacle-material'],
          affectedTaskIds: ['task-1', 'task-2'],
        }],
        signals: [
          signal({
            signalId: 'condition-material',
            impactOwnership: 'condition',
            sourceEntityType: 'project_material',
            sourceEntityId: 'material-1',
            metadata: { affectedTaskIds: ['task-1', 'task-2'] },
          }),
        ],
        weightedRiskScore: 0.92,
        uncertaintyIndex: 0,
        uncertaintyReasons: [],
      },
    })

    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toMatchObject({
      project_id: 'project-1',
      task_id: 'task-1',
      warning_type: 'condition_due',
      warning_level: 'critical',
      source_entity_id: 'material-1',
    })
    expect((warnings[0] as any).metadata.impactSignalSummary).toMatchObject({
      rawCount: 2,
      dedupedCount: 1,
      duplicateCount: 1,
      sourceEntityId: 'material-1',
    })
  })

  it('separates confirmed delay from uncertain delay risk using summary-level deterministic and criticality fields', () => {
    const warnings = buildWarningsFromImpactSignalSummary({
      projectId: 'project-1',
      taskId: 'task-critical',
      taskTitle: '机电联合调试',
      source: 'duration_forecast',
      ownerships: ['acceptance'],
      includeDelayWarning: true,
      summary: {
        rawCount: 1,
        dedupedCount: 1,
        signals: [
          signal({
            signalId: 'acceptance-finish',
            sourceAlgorithm: 'acceptance',
            sourceEntityType: 'acceptance_plan',
            sourceEntityId: 'acceptance-1',
            sourceCategory: 'acceptance',
            impactOwnership: 'acceptance',
            impactMode: 'finish_gate',
            impactPhase: 'finish',
            severity: 'warning',
            reason: 'acceptance finish gate is not cleared',
          }),
        ],
        confirmedDelayDays: 5,
        weightedConfirmedDelayDays: 7,
        weightedRiskScore: 0.94,
        criticality: {
          isCritical: true,
          totalFloatDays: 0,
          freeFloatDays: 0,
          successorCount: 4,
          milestoneDistanceDays: 6,
          criticalityWeight: 1.4,
          basis: 'critical_path',
        },
        responsibilityBreakdown: [{
          ownerType: 'participant_unit',
          ownerUnitId: 'unit-qa',
          ownerRole: 'supervision',
          basis: 'explicit_signal_metadata',
          signalCount: 1,
          weightedSignalCount: 1.4,
          maxWeightedRiskScore: 0.94,
          confidence: 0.91,
          evidence: [{ source: 'acceptance_plan', value: 'acceptance-1', confidence: 0.91 }],
        }],
        uncertaintyIndex: 0.08,
        uncertaintyReasons: [],
      },
    })

    expect(warnings.map((warning) => warning.warning_type)).toEqual(
      expect.arrayContaining(['acceptance_expired', 'critical_path_delay']),
    )
    expect(warnings.find((warning) => warning.warning_type === 'critical_path_delay')).toMatchObject({
      warning_level: 'critical',
      title: expect.stringContaining('确定延期'),
      source_entity_id: 'acceptance-1',
    })
  })

  it('keeps candidate-only or confidence-only signals as uncertain risk instead of confirmed delay', () => {
    const warnings = buildWarningsFromImpactSignalSummary({
      projectId: 'project-1',
      taskId: 'task-risk',
      taskTitle: '室内移交',
      source: 'duration_forecast',
      includeSignalWarnings: false,
      includeDelayWarning: true,
      summary: {
        rawCount: 1,
        dedupedCount: 1,
        signals: [
          signal({
            signalId: 'expired-seed',
            sourceEntityType: 'algorithm_seed',
            sourceEntityId: 'GB50300:handover:seed',
            impactOwnership: 'acceptance',
            impactMode: 'confidence_only',
            runtimePolicy: 'candidate_only',
            confidence: 0.48,
            severity: 'warning',
            expectedDate: null,
            metadata: { staleReason: 'evidence_expired', sourceStandard: 'GB50300-2013' },
          }),
        ],
        confirmedDelayDays: 0,
        weightedRiskScore: 0.62,
        uncertaintyIndex: 0.5,
        uncertaintyReasons: ['candidate_only_signals', 'stale_seed_signals'],
      },
    })

    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toMatchObject({
      warning_type: 'delay_exceeded',
      warning_level: 'info',
      title: expect.stringContaining('不确定风险'),
    })
    expect((warnings[0] as any).metadata.delayCertainty).toBe('uncertain_risk')
  })

  it('wraps historical replay and threshold calibration into a warning governance report', () => {
    const report = buildDelayWarningReplayGovernanceReport([
      {
        task_id: 'hit',
        planned_end_date: '2026-05-10',
        actual_end_date: '2026-05-15',
        afterImpactSignals: [signal({ signalId: 'hit-signal', sourceEntityId: 'hit-signal', confidence: 0.9 })],
      },
      {
        task_id: 'false-positive',
        planned_end_date: '2026-05-10',
        actual_end_date: '2026-05-10',
        afterImpactSignals: [signal({
          signalId: 'fp-signal',
          sourceEntityId: 'fp-signal',
          impactMode: 'confidence_only',
          runtimePolicy: 'confidence_only',
          confidence: 0.42,
          severity: 'warning',
        })],
      },
    ], {
      calibration: {
        currentThreshold: 0,
        candidateThresholds: [0, 0.35, 0.55],
        minPrecision: 0.5,
        minRecall: 0.5,
      },
    })

    expect(report.sampleCount).toBe(2)
    expect(report.evaluation.thresholdCalibration).toBeDefined()
    expect(report.warningPolicy).toMatchObject({
      policy: 'confirmed_or_weighted_risk_score_at_least_threshold',
      thresholdSource: 'historical_replay_calibration',
    })
  })

  it('uses centralized threshold policy metadata when projecting confirmed delay severity', () => {
    const policy = resolveWarningImpactSignalPolicy({
      criticalWeightedRiskScore: 0.96,
      warningWeightedRiskScore: 0.7,
      uncertainRiskScoreThreshold: 0.55,
    })

    const warnings = buildWarningsFromImpactSignalSummary({
      projectId: 'project-1',
      taskId: 'task-threshold',
      taskTitle: 'threshold task',
      source: 'duration_forecast',
      includeSignalWarnings: false,
      includeDelayWarning: true,
      policy,
      summary: {
        rawCount: 1,
        dedupedCount: 1,
        signals: [signal({
          signalId: 'delay-threshold',
          sourceEntityId: 'delay-source-1',
          impactOwnership: 'acceptance',
          impactMode: 'finish_gate',
          severity: 'critical',
          weightedRiskScore: 0.94,
        })],
        confirmedDelayDays: 2,
        weightedConfirmedDelayDays: 3,
        weightedRiskScore: 0.94,
        criticality: { isCritical: true, criticalityWeight: 1.5 },
      },
    })

    expect(warnings).toHaveLength(1)
    expect(warnings[0].warning_level).toBe('warning')
    expect((warnings[0] as any).metadata.thresholdPolicy).toMatchObject({
      version: 'warning_impact_signal_policy_v1',
      thresholdSource: 'governance_config',
      criticalWeightedRiskScore: 0.96,
      warningWeightedRiskScore: 0.7,
    })
    expect((warnings[0] as any).metadata.thresholdDecision).toMatchObject({
      matched: 'confirmed_delay_warning',
      weightedRiskScore: 0.94,
    })
  })

  it('suppresses low-confidence uncertain risks into review metadata instead of noisy delay warnings', () => {
    const warnings = buildWarningsFromImpactSignalSummary({
      projectId: 'project-1',
      taskId: 'task-low-confidence',
      taskTitle: 'low confidence task',
      source: 'duration_forecast',
      includeSignalWarnings: false,
      includeDelayWarning: true,
      policy: resolveWarningImpactSignalPolicy({
        uncertainRiskScoreThreshold: 0.7,
        uncertainRiskIndexThreshold: 0.65,
      }),
      summary: {
        rawCount: 1,
        dedupedCount: 1,
        signals: [signal({
          signalId: 'candidate-low',
          sourceEntityType: 'algorithm_seed',
          sourceEntityId: 'seed-low',
          impactOwnership: 'acceptance',
          impactMode: 'confidence_only',
          runtimePolicy: 'candidate_only',
          confidence: 0.42,
          severity: 'warning',
        })],
        confirmedDelayDays: 0,
        weightedRiskScore: 0.45,
        uncertaintyIndex: 0.5,
        uncertaintyReasons: ['candidate_only_signals'],
      },
    })

    expect(warnings).toHaveLength(0)
  })

  it('keeps acceptance stage semantics and responsibility routing metadata on projected warnings', () => {
    const warnings = buildWarningsFromImpactSignalSummary({
      projectId: 'project-1',
      taskId: 'task-acceptance-stage',
      taskTitle: 'acceptance stage task',
      source: 'duration_forecast',
      includeSignalWarnings: true,
      includeDelayWarning: false,
      summary: {
        rawCount: 1,
        dedupedCount: 1,
        signals: [signal({
          signalId: 'acceptance-archive',
          sourceAlgorithm: 'acceptance',
          sourceEntityType: 'acceptance_plan',
          sourceEntityId: 'acceptance-archive-1',
          sourceCategory: 'archive_document_gate',
          impactOwnership: 'acceptance',
          impactMode: 'finish_gate',
          impactPhase: 'finish',
          severity: 'warning',
          responsibility: {
            ownerType: 'participant_unit',
            ownerUnitId: 'unit-doc',
            ownerRole: 'archive_owner',
            basis: 'explicit_signal_metadata',
            confidence: 0.88,
            evidence: [{ source: 'acceptance_plan', value: 'acceptance-archive-1', confidence: 0.88 }],
          },
          metadata: {
            acceptanceStage: 'archive_document',
            acceptanceCycle: 'first_pass',
          },
        })],
        weightedRiskScore: 0.72,
        responsibilityBreakdown: [{
          ownerType: 'participant_unit',
          ownerUnitId: 'unit-doc',
          ownerRole: 'archive_owner',
          confidence: 0.88,
          signalCount: 1,
        }],
      },
    })

    expect(warnings).toHaveLength(1)
    expect((warnings[0] as any).metadata.acceptanceSemantics).toMatchObject({
      stage: 'archive_document',
      cycle: 'first_pass',
    })
    expect((warnings[0] as any).metadata.routing).toMatchObject({
      strategy: 'responsibility_owner',
      ownerUnitId: 'unit-doc',
      confidence: 0.88,
    })
  })

  it('builds an explainable debug report for raw, deduped, suppressed, and emitted warning decisions', () => {
    const report = buildImpactSignalWarningDebugReport({
      projectId: 'project-1',
      taskId: 'task-debug',
      taskTitle: 'debug task',
      source: 'duration_forecast',
      includeSignalWarnings: true,
      includeDelayWarning: true,
      summary: {
        rawCount: 2,
        dedupedCount: 1,
        duplicates: [{
          dedupeKey: 'project:blocker:project_material:material-1:start',
          keptSignalId: 'condition-material',
          suppressedSignalIds: ['obstacle-material'],
        }],
        signals: [signal({
          signalId: 'condition-material',
          sourceEntityId: 'material-1',
          weightedRiskScore: 0.88,
        })],
        confirmedDelayDays: 2,
        weightedConfirmedDelayDays: 2,
        weightedRiskScore: 0.88,
      },
    })

    expect(report).toMatchObject({
      projectId: 'project-1',
      taskId: 'task-debug',
      rawSignalCount: 2,
      dedupedSignalCount: 1,
      suppressedDuplicateCount: 1,
    })
    expect(report.emittedWarnings.length).toBeGreaterThan(0)
    expect(report.decisions[0]).toMatchObject({
      sourceEntityId: 'material-1',
      thresholdSource: 'default_signal_summary',
    })
  })

  it('resolves governance-configured thresholds by project context without changing frontend behavior', () => {
    const policy = resolveWarningImpactSignalPolicy({}, {
      projectType: 'hospital',
      governanceConfig: {
        defaultPolicy: {
          warningWeightedRiskScore: 0.7,
          uncertainRiskScoreThreshold: 0.45,
        },
        thresholdsByProjectType: {
          hospital: {
            warningWeightedRiskScore: 0.82,
            criticalWeightedRiskScore: 0.96,
          },
        },
      },
    })

    expect(policy).toMatchObject({
      thresholdSource: 'governance_config',
      warningWeightedRiskScore: 0.82,
      criticalWeightedRiskScore: 0.96,
      uncertainRiskScoreThreshold: 0.45,
    })
  })

  it('adds shadow replay calibration instead of directly applying historical thresholds', () => {
    const report = buildDelayWarningReplayGovernanceReport([
      {
        task_id: 'hit',
        planned_end_date: '2026-05-10',
        actual_end_date: '2026-05-18',
        afterImpactSignals: [signal({ signalId: 'hit-signal', weightedRiskScore: 0.92 })],
      },
      {
        task_id: 'quiet',
        planned_end_date: '2026-05-10',
        actual_end_date: '2026-05-10',
        afterImpactSignals: [signal({
          signalId: 'quiet-signal',
          impactMode: 'confidence_only',
          runtimePolicy: 'confidence_only',
          weightedRiskScore: 0.2,
          confidence: 0.2,
          severity: 'info',
        })],
      },
    ], {
      calibration: {
        currentThreshold: 0.65,
        candidateThresholds: [0.35, 0.65, 0.85],
        minPrecision: 0.5,
        minRecall: 0.5,
      },
    })

    expect(report.warningPolicy).toMatchObject({
      appliedMode: 'shadow_only',
      thresholdSource: 'historical_replay_calibration',
    })
    expect(report.shadowCalibration).toMatchObject({
      currentThreshold: 0.65,
      recommendedPolicy: 'confirmed_or_weighted_risk_score_at_least_threshold',
    })
    expect(report.shadowCalibration.projectedWarningDelta).toEqual(expect.any(Number))
  })

  it('returns lifecycle sync actions when signal-backed warnings disappear or downgrade', () => {
    const plan = buildImpactSignalWarningLifecyclePlan({
      activeWarnings: [
        {
          id: 'active-missing',
          project_id: 'project-1',
          task_id: 'task-1',
          warning_type: 'condition_due',
          warning_level: 'critical',
          source_entity_type: 'project_material',
          source_entity_id: 'material-missing',
          is_acknowledged: false,
          created_at: '2026-05-26T00:00:00.000Z',
          metadata: { delaySignalVersion: 'impact_signal_summary_v1' },
        } as any,
        {
          id: 'active-downgrade',
          project_id: 'project-1',
          task_id: 'task-2',
          warning_type: 'delay_exceeded',
          warning_level: 'critical',
          source_entity_type: 'algorithm_seed',
          source_entity_id: 'seed-1',
          is_acknowledged: false,
          created_at: '2026-05-26T00:00:00.000Z',
          metadata: { delaySignalVersion: 'impact_signal_summary_v1' },
        } as any,
      ],
      currentWarnings: [
        {
          id: 'current-downgrade',
          project_id: 'project-1',
          task_id: 'task-2',
          warning_type: 'delay_exceeded',
          warning_level: 'info',
          source_entity_type: 'algorithm_seed',
          source_entity_id: 'seed-1',
          is_acknowledged: false,
          created_at: '2026-05-26T01:00:00.000Z',
          metadata: { delaySignalVersion: 'impact_signal_summary_v1' },
        } as any,
      ],
    })

    expect(plan.actions).toEqual([
      expect.objectContaining({ warningId: 'active-missing', action: 'resolve', reason: 'impact_signal_disappeared' }),
      expect.objectContaining({ warningId: 'active-downgrade', action: 'downgrade', nextLevel: 'info' }),
    ])
  })

  it('summarizes impact-signal coverage and legacy gap-fill suppression counts', () => {
    const summary = buildImpactSignalCoverageSummary({
      taskIds: ['task-1', 'task-2', 'task-3'],
      impactWarnings: [
        {
          project_id: 'project-1',
          task_id: 'task-1',
          warning_type: 'condition_due',
          source_entity_type: 'project_material',
          source_entity_id: 'material-1',
        } as any,
      ],
      legacyWarnings: [
        {
          project_id: 'project-1',
          task_id: 'task-1',
          warning_type: 'condition_due',
          source_entity_type: 'project_material',
          source_entity_id: 'material-1',
        } as any,
        {
          project_id: 'project-1',
          task_id: 'task-2',
          warning_type: 'obstacle_timeout',
        } as any,
      ],
    })

    expect(summary).toMatchObject({
      taskCount: 3,
      impactCoveredTaskCount: 1,
      legacyGapFillCount: 1,
      suppressedLegacyDuplicateCount: 1,
      uncoveredTaskCount: 1,
    })
  })

  it('emits composite blocker chain, multi-owner routing, uncertainty tier, and rule quality metadata', () => {
    const warnings = buildWarningsFromImpactSignalSummary({
      projectId: 'project-1',
      taskId: 'task-chain',
      taskTitle: 'compound blocker task',
      source: 'duration_forecast',
      includeSignalWarnings: false,
      includeDelayWarning: true,
      summary: {
        rawCount: 3,
        dedupedCount: 3,
        confirmedDelayDays: 0,
        weightedRiskScore: 0.9,
        uncertaintyIndex: 0.86,
        uncertaintyReasons: ['candidate_only_signals', 'multi_owner_blocker'],
        responsibilityBreakdown: [
          { ownerType: 'participant_unit', ownerUnitId: 'unit-main', ownerRole: 'construction', confidence: 0.92, signalCount: 2 },
          { ownerType: 'participant_unit', ownerUnitId: 'unit-design', ownerRole: 'design', confidence: 0.78, signalCount: 1 },
          { ownerType: 'role', ownerRole: 'project_manager', confidence: 0.74, signalCount: 1 },
        ],
        signals: [
          signal({
            signalId: 'condition-seed',
            impactOwnership: 'condition',
            sourceEntityType: 'algorithm_seed',
            sourceEntityId: 'seed-condition',
            runtimePolicy: 'candidate_only',
            impactMode: 'confidence_only',
            confidence: 0.52,
            metadata: {
              seedSource: 'GB50300',
              ruleCode: 'GB50300.condition.archive',
              ruleQuality: {
                sampleCount: 3,
                precision: 0.45,
                falsePositiveRate: 0.35,
                stale: false,
              },
            },
          }),
          signal({
            signalId: 'obstacle-seed',
            impactOwnership: 'obstacle',
            sourceEntityType: 'task_obstacle',
            sourceEntityId: 'obstacle-1',
            runtimePolicy: 'candidate_only',
            impactMode: 'confidence_only',
            confidence: 0.5,
          }),
          signal({
            signalId: 'acceptance-seed',
            impactOwnership: 'acceptance',
            sourceEntityType: 'acceptance_plan',
            sourceEntityId: 'acceptance-1',
            runtimePolicy: 'candidate_only',
            impactMode: 'confidence_only',
            confidence: 0.51,
          }),
        ],
      },
    })

    expect(warnings).toHaveLength(1)
    expect((warnings[0] as any).metadata.thresholdDecision).toMatchObject({
      matched: 'uncertain_risk_owner_confirmation',
      reviewTier: 'owner_confirmation',
    })
    expect((warnings[0] as any).metadata.routing).toMatchObject({
      strategy: 'responsibility_owner',
      primaryOwner: expect.objectContaining({ ownerUnitId: 'unit-main' }),
      coOwners: [expect.objectContaining({ ownerUnitId: 'unit-design' })],
      escalationOwner: expect.objectContaining({ ownerRole: 'project_manager' }),
    })
    expect((warnings[0] as any).metadata.compositeBlockerChain).toMatchObject({
      kind: 'compound_blocker_chain',
      ownerships: ['condition', 'obstacle', 'acceptance'],
      signalCount: 3,
    })
    expect((warnings[0] as any).metadata.ruleQuality).toMatchObject({
      grade: 'weak',
      runtimeRole: 'explain_only',
    })
  })

  it('aggregates compound blockers into one main warning when composite aggregation is enabled', () => {
    const warnings = buildWarningsFromImpactSignalSummary({
      projectId: 'project-1',
      taskId: 'task-compound',
      taskTitle: 'compound blocker task',
      source: 'readiness_summary',
      includeSignalWarnings: true,
      includeDelayWarning: false,
      aggregateCompositeBlockers: true,
      summary: {
        rawCount: 2,
        dedupedCount: 2,
        weightedRiskScore: 0.82,
        signals: [
          signal({
            signalId: 'condition-1',
            impactOwnership: 'condition',
            sourceEntityType: 'task_condition',
            sourceEntityId: 'condition-1',
            severity: 'warning',
          }),
          signal({
            signalId: 'obstacle-1',
            impactOwnership: 'obstacle',
            sourceEntityType: 'task_obstacle',
            sourceEntityId: 'obstacle-1',
            severity: 'critical',
          }),
        ],
      },
    })

    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toMatchObject({
      warning_type: 'condition_due',
      warning_level: 'critical',
      source_entity_type: 'impact_signal_chain',
      source_entity_id: 'task-compound',
    })
    expect((warnings[0] as any).metadata.compositeBlockerChain).toMatchObject({
      kind: 'compound_blocker_chain',
      ownerships: ['condition', 'obstacle'],
    })
  })

  it('builds replay threshold candidates that require approval before runtime use', () => {
    const report = buildDelayWarningReplayGovernanceReport([
      {
        task_id: 'hit',
        planned_end_date: '2026-05-10',
        actual_end_date: '2026-05-18',
        afterImpactSignals: [signal({ signalId: 'hit-signal', weightedRiskScore: 0.92 })],
      },
      {
        task_id: 'quiet',
        planned_end_date: '2026-05-10',
        actual_end_date: '2026-05-10',
        afterImpactSignals: [],
      },
    ], {
      calibration: {
        currentThreshold: 0.65,
        candidateThresholds: [0.35, 0.65, 0.85],
        minPrecision: 0.5,
        minRecall: 0.5,
      },
    })

    const candidate = buildReplayThresholdCandidate(report, {
      projectId: 'project-1',
      minSampleCount: 2,
    })

    expect(candidate).toMatchObject({
      projectId: 'project-1',
      status: 'candidate',
      approvalMode: 'manual_approval_required',
      recommendedPolicy: 'confirmed_or_weighted_risk_score_at_least_threshold',
    })
  })

  it('converts replay threshold recommendations into candidate-only risk warning seed upgrades', () => {
    const report = buildDelayWarningReplayGovernanceReport([
      {
        task_id: 'hit',
        planned_end_date: '2026-05-10',
        actual_end_date: '2026-05-18',
        afterImpactSignals: [signal({ signalId: 'hit-signal', weightedRiskScore: 0.92 })],
      },
      {
        task_id: 'miss',
        planned_end_date: '2026-05-10',
        actual_end_date: '2026-05-16',
        afterImpactSignals: [signal({ signalId: 'miss-signal', weightedRiskScore: 0.58 })],
      },
      {
        task_id: 'quiet',
        planned_end_date: '2026-05-10',
        actual_end_date: '2026-05-10',
        afterImpactSignals: [],
      },
    ], {
      calibration: {
        currentThreshold: 0.65,
        candidateThresholds: [0.35, 0.55, 0.75],
        minPrecision: 0.5,
        minRecall: 0.5,
      },
    })

    const candidate = buildReplayThresholdAlgorithmSeedCandidate(report, {
      projectId: 'project-1',
      minSampleCount: 2,
    })

    expect(candidate).toEqual(expect.objectContaining({
      seedType: 'risk_issue_warning_rule',
      stableCode: 'learned:risk_issue_warning_rule:project-1:delay-warning-threshold',
      candidateSource: 'project_history',
      projectId: 'project-1',
      actionPolicy: 'candidate_only',
      sampleCount: 3,
    }))
    expect(candidate?.candidatePayload).toEqual(expect.objectContaining({
      ruleCode: 'delay_warning_replay_threshold_project-1',
      stableCode: 'learned:risk_issue_warning_rule:project-1:delay-warning-threshold',
      sourceStandard: 'warning_replay',
      sourceClauseRef: 'warning_replay.delay_warning_threshold',
      status: 'candidate_only',
      isActive: false,
      webVerified: false,
      reviewNeeded: true,
      signalConsumptionPolicy: expect.objectContaining({
        inputContract: 'impactSignalSummary_only',
      }),
    }))
    expect(candidate?.evidenceSummary).toEqual(expect.objectContaining({
      source: 'delay_warning_signal_replay',
      replayCaseCount: 3,
      replayTruePositiveRate: expect.any(Number),
      replayFalsePositiveRate: expect.any(Number),
      runtimeEffect: 'candidate_only_until_manual_warning_policy_review',
    }))
  })

  it('creates rule-quality updates from warning metadata for seed assets', () => {
    const warnings = buildWarningsFromImpactSignalSummary({
      projectId: 'project-1',
      taskId: 'task-quality',
      taskTitle: 'quality task',
      source: 'duration_forecast',
      includeSignalWarnings: false,
      includeDelayWarning: true,
      summary: {
        rawCount: 1,
        dedupedCount: 1,
        confirmedDelayDays: 0,
        weightedRiskScore: 0.88,
        uncertaintyIndex: 0.82,
        signals: [signal({
          signalId: 'seed-quality',
          sourceEntityType: 'algorithm_seed',
          sourceEntityId: 'seed-quality-1',
          impactOwnership: 'acceptance',
          impactMode: 'confidence_only',
          runtimePolicy: 'candidate_only',
          metadata: {
            seedSource: 'GB50300',
            ruleCode: 'GB50300.acceptance.archive',
            ruleQuality: {
              sampleCount: 3,
              precision: 0.45,
              falsePositiveRate: 0.35,
            },
          },
        })],
      },
    })

    const updates = buildRuleQualityUpdatesFromWarnings(warnings)

    expect(updates).toEqual([
      expect.objectContaining({
        projectId: 'project-1',
        ruleCode: 'GB50300.acceptance.archive',
        seedSource: 'GB50300',
        qualityGrade: 'weak',
        runtimeRole: 'explain_only',
      }),
    ])
  })

  it('builds owner confirmation requests for high-tier uncertain risks', () => {
    const warnings = buildWarningsFromImpactSignalSummary({
      projectId: 'project-1',
      taskId: 'task-confirm',
      taskTitle: 'owner confirmation task',
      source: 'duration_forecast',
      includeSignalWarnings: false,
      includeDelayWarning: true,
      summary: {
        rawCount: 2,
        dedupedCount: 2,
        confirmedDelayDays: 0,
        weightedRiskScore: 0.91,
        uncertaintyIndex: 0.88,
        responsibilityBreakdown: [
          { ownerType: 'participant_unit', ownerUnitId: 'unit-main', ownerRole: 'construction', confidence: 0.9 },
        ],
        signals: [
          signal({ signalId: 'condition', impactOwnership: 'condition', runtimePolicy: 'candidate_only', impactMode: 'confidence_only' }),
          signal({ signalId: 'acceptance', impactOwnership: 'acceptance', runtimePolicy: 'candidate_only', impactMode: 'confidence_only' }),
        ],
      },
    })

    const requests = buildOwnerConfirmationRequests(warnings)

    expect(requests).toEqual([
      expect.objectContaining({
        projectId: 'project-1',
        taskId: 'task-confirm',
        ownerUnitId: 'unit-main',
        confirmationType: 'delay_uncertainty_owner_confirmation',
        status: 'pending',
      }),
    ])
  })

  it('plans responsibility escalation from primary owner to co-owner and escalation owner by age', () => {
    const warning = buildWarningsFromImpactSignalSummary({
      projectId: 'project-1',
      taskId: 'task-route',
      taskTitle: 'route task',
      source: 'duration_forecast',
      includeSignalWarnings: false,
      includeDelayWarning: true,
      summary: {
        rawCount: 2,
        dedupedCount: 2,
        confirmedDelayDays: 0,
        weightedRiskScore: 0.91,
        uncertaintyIndex: 0.88,
        responsibilityBreakdown: [
          { ownerType: 'participant_unit', ownerUnitId: 'unit-main', ownerRole: 'construction', confidence: 0.9 },
          { ownerType: 'participant_unit', ownerUnitId: 'unit-design', ownerRole: 'design', confidence: 0.8 },
          { ownerType: 'role', ownerRole: 'project_manager', confidence: 0.75 },
        ],
        signals: [
          signal({ signalId: 'condition', impactOwnership: 'condition', runtimePolicy: 'candidate_only', impactMode: 'confidence_only' }),
          signal({ signalId: 'acceptance', impactOwnership: 'acceptance', runtimePolicy: 'candidate_only', impactMode: 'confidence_only' }),
        ],
      },
      now: '2026-05-26T00:00:00.000Z',
    })[0] as any

    const plan = buildResponsibilityEscalationPlan(warning, {
      now: '2026-05-28T01:00:00.000Z',
      coOwnerAfterHours: 24,
      escalationAfterHours: 48,
    })

    expect(plan).toMatchObject({
      stage: 'escalation_owner',
      recipients: [
        expect.objectContaining({ ownerUnitId: 'unit-main' }),
        expect.objectContaining({ ownerUnitId: 'unit-design' }),
        expect.objectContaining({ ownerRole: 'project_manager' }),
      ],
    })
  })
})
