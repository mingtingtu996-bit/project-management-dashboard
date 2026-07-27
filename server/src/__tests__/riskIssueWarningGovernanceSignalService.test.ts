import { describe, expect, it } from 'vitest'
import { V1474_SITE_CAPACITY_PRESSURE_SEED, V1474_SITE_CAPACITY_PRESSURE_SEED_META } from '../seeds/v1474SiteCapacityPressureSeed.js'
import {
  dedupeGovernanceSignals,
  evaluateSeedWarningPromotion,
  normalizeGovernanceSignalDirectory,
  normalizeGovernanceSignalFromSeedAsset,
  normalizeGovernanceSignalFromRuntimeEvidence,
} from '../services/riskIssueWarningGovernanceSignalService.js'

describe('risk/issue/warning governance signal bridge', () => {
  it('keeps candidate-only seed assets from creating risks or issues directly', () => {
    const signal = normalizeGovernanceSignalFromSeedAsset({
      seedType: 'site_capacity_pressure',
      seed: V1474_SITE_CAPACITY_PRESSURE_SEED[0],
      meta: V1474_SITE_CAPACITY_PRESSURE_SEED_META,
    })

    expect(signal).toMatchObject({
      signalType: 'site_capacity_pressure',
      actionPolicy: 'candidate_warning',
      canCreateWarning: false,
      canCreateRisk: false,
      canCreateIssue: false,
      boundaryReason: expect.stringContaining('does_not_create_risk_or_issue'),
    })
  })

  it('allows runtime evidence to become a warning candidate without bypassing risk/issue confirmation', () => {
    const signal = normalizeGovernanceSignalFromRuntimeEvidence({
      signalType: 'critical_path_delay',
      actionPolicy: 'create_warning',
      projectId: 'project-1',
      taskId: 'task-1',
      severity: 'critical',
      evidence: [{ source: 'notifications', id: 'warning-1' }],
    })

    expect(signal).toMatchObject({
      actionPolicy: 'create_warning',
      canCreateWarning: true,
      canCreateRisk: false,
      canCreateIssue: false,
    })
  })

  it('normalizes supported algorithm outputs into one governance signal directory', () => {
    const signals = normalizeGovernanceSignalDirectory([
      {
        sourceAlgorithm: 'duration_context',
        sourceId: 'forecast-task-1',
        signalType: 'critical_path_delay',
        projectId: 'project-1',
        taskId: 'task-1',
        actionPolicy: 'create_warning',
        severity: 'critical',
        evidence: [{ delayDays: 12 }],
      },
      {
        sourceAlgorithm: 'execution_impact',
        sourceId: 'condition-task-2',
        signalType: 'condition_blocked',
        projectId: 'project-1',
        taskId: 'task-2',
        actionPolicy: 'candidate_warning',
        evidence: [{ conditionId: 'condition-1' }],
      },
      {
        sourceAlgorithm: 'planning_governance',
        sourceId: 'plan-gate-1',
        signalType: 'planning_confirm_required',
        projectId: 'project-1',
        actionPolicy: 'observe_only',
        evidence: [{ gateLevel: 'confirm' }],
      },
      {
        sourceAlgorithm: 'data_quality',
        sourceId: 'dq-1',
        signalType: 'missing_owner',
        projectId: 'project-1',
        actionPolicy: 'candidate_warning',
        evidence: [{ ruleCode: 'TASK_OWNER_REQUIRED' }],
      },
      {
        sourceAlgorithm: 'project_schedule_state',
        sourceId: 'state-1',
        signalType: 'schedule_blocked',
        projectId: 'project-1',
        actionPolicy: 'candidate_warning',
        evidence: [{ state: 'blocked' }],
      },
      {
        sourceAlgorithm: 'algorithm_seed',
        sourceId: 'seed-1',
        signalType: 'site_capacity_pressure',
        projectId: 'project-1',
        actionPolicy: 'candidate_only',
        evidence: [{ stableCode: 'site.capacity.pressure' }],
      },
    ])

    expect(signals).toHaveLength(6)
    expect(signals.map((signal) => signal.sourceAlgorithm)).toEqual([
      'duration_context',
      'execution_impact',
      'planning_governance',
      'data_quality',
      'project_schedule_state',
      'algorithm_seed',
    ])
    expect(signals[0]).toMatchObject({
      sourceId: 'forecast-task-1',
      dedupeKey: 'project-1::critical_path_delay::task-1',
      canCreateWarning: true,
      canCreateRisk: false,
      canCreateIssue: false,
      attribution: {
        primarySourceAlgorithm: 'duration_context',
        sourceAlgorithms: ['duration_context'],
        evidenceCount: 1,
      },
    })
    expect(signals[5]).toMatchObject({
      actionPolicy: 'candidate_warning',
      canCreateWarning: false,
      promotionStatus: 'warning_candidate',
      boundaryReason: 'seed_or_candidate_signal_requires_runtime_evidence',
    })
  })

  it('keeps seed-only governance signals behind a warning promotion gate', () => {
    const seedOnly = evaluateSeedWarningPromotion({
      sourceAlgorithm: 'algorithm_seed',
      sourceId: 'site-capacity-seed',
      signalType: 'site_capacity_pressure',
      projectId: 'project-1',
      taskId: 'task-1',
      actionPolicy: 'candidate_only',
      evidence: [{ stableCode: 'site.capacity.pressure' }],
    })

    expect(seedOnly).toMatchObject({
      actionPolicy: 'candidate_warning',
      canCreateWarning: false,
      canCreateRisk: false,
      canCreateIssue: false,
      promotionStatus: 'warning_candidate',
      boundaryReason: 'seed_or_candidate_signal_requires_runtime_evidence',
    })

    const promoted = evaluateSeedWarningPromotion({
      sourceAlgorithm: 'algorithm_seed',
      sourceId: 'site-capacity-runtime',
      signalType: 'site_capacity_pressure',
      projectId: 'project-1',
      taskId: 'task-1',
      actionPolicy: 'create_warning',
      runtimeEvidence: [{ overloadRatio: 1.35 }],
    })

    expect(promoted).toMatchObject({
      actionPolicy: 'create_warning',
      canCreateWarning: true,
      canCreateRisk: false,
      canCreateIssue: false,
      promotionStatus: 'warning_allowed',
      boundaryReason: 'runtime_evidence_can_create_warning_only',
    })

    const missingSubject = evaluateSeedWarningPromotion({
      sourceAlgorithm: 'algorithm_seed',
      sourceId: 'site-capacity-missing-project',
      signalType: 'site_capacity_pressure',
      actionPolicy: 'create_warning',
      runtimeEvidence: [{ overloadRatio: 1.35 }],
    })

    expect(missingSubject).toMatchObject({
      actionPolicy: 'candidate_warning',
      canCreateWarning: false,
      canCreateRisk: false,
      canCreateIssue: false,
      promotionStatus: 'warning_candidate',
      boundaryReason: 'missing_project_or_subject_for_warning_promotion',
    })
  })

  it('deduplicates cross-algorithm signals and keeps attribution for the merged fact', () => {
    const signals = normalizeGovernanceSignalDirectory([
      {
        sourceAlgorithm: 'algorithm_seed',
        sourceId: 'seed-delay-task-1',
        signalType: 'critical_path_delay',
        projectId: 'project-1',
        taskId: 'task-1',
        actionPolicy: 'candidate_only',
        evidence: [{ stableCode: 'seed.delay.pattern' }],
      },
      {
        sourceAlgorithm: 'duration_context',
        sourceId: 'forecast-task-1',
        signalType: 'critical_path_delay',
        projectId: 'project-1',
        taskId: 'task-1',
        actionPolicy: 'create_warning',
        severity: 'critical',
        evidence: [{ confirmedDelayDays: 12 }],
      },
      {
        sourceAlgorithm: 'project_schedule_state',
        sourceId: 'schedule-state-task-1',
        signalType: 'critical_path_delay',
        projectId: 'project-1',
        taskId: 'task-1',
        actionPolicy: 'candidate_warning',
        severity: 'warning',
        evidence: [{ state: 'blocked' }],
      },
    ])

    const merged = dedupeGovernanceSignals(signals)

    expect(merged).toHaveLength(1)
    expect(merged[0]).toMatchObject({
      sourceAlgorithm: 'duration_context',
      sourceId: 'forecast-task-1',
      actionPolicy: 'create_warning',
      canCreateWarning: true,
      canCreateRisk: false,
      canCreateIssue: false,
      promotionStatus: 'warning_allowed',
      attribution: {
        primarySourceAlgorithm: 'duration_context',
        sourceAlgorithms: ['duration_context', 'project_schedule_state', 'algorithm_seed'],
        sourceIds: ['forecast-task-1', 'schedule-state-task-1', 'seed-delay-task-1'],
        evidenceCount: 3,
      },
    })
    expect(merged[0].evidence[0]).toMatchObject({ confirmedDelayDays: 12 })
  })
})
