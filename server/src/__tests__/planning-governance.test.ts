import { describe, expect, it } from 'vitest'
import {
  buildAlerts,
  buildAdHocCarryoverGovernanceAlerts,
  buildAdHocCarryoverGovernanceStates,
  buildCloseoutGovernanceAlerts,
  buildCloseoutGovernanceStates,
  buildExecutionReorderGovernanceAlerts,
  buildExecutionReorderGovernanceStates,
  buildGovernanceSignals,
  evaluatePreConfirmGovernanceGate,
} from '../services/planningGovernanceService.js'

describe('planning governance lifecycle alerts', () => {
  it('builds closeout reminders, escalation and owner attention alerts from overdue monthly plans', () => {
    const alerts = buildCloseoutGovernanceAlerts({
      projectId: 'project-1',
      plans: [
        {
          id: 'monthly-plan-1',
          project_id: 'project-1',
          version: 12,
          status: 'confirmed',
          month: '2026-04',
          title: '2026-04 monthly plan',
          closeout_at: null,
        },
      ] as any,
      now: new Date('2026-05-08T08:00:00.000Z'),
    })

    expect(alerts.map((alert) => alert.kind)).toEqual([
      'closeout_reminder',
      'closeout_escalation',
      'closeout_owner_attention',
    ])
    expect(alerts.map((alert) => alert.source_id)).toEqual([
      'project-1:monthly_plan:monthly-plan-1:closeout:3',
      'project-1:monthly_plan:monthly-plan-1:closeout:5',
      'project-1:monthly_plan:monthly-plan-1:closeout:7',
    ])
    expect(alerts[0].detail).toContain('PM')
    expect(alerts[1].detail).toContain('overdue signal')
    expect(alerts[2].detail).toContain('Project owner attention')

    const states = buildCloseoutGovernanceStates({
      projectId: 'project-1',
      plans: [
        {
          id: 'monthly-plan-1',
          project_id: 'project-1',
          version: 12,
          status: 'confirmed',
          month: '2026-04',
          title: '2026-04 monthly plan',
          closeout_at: null,
        },
      ] as any,
      now: new Date('2026-05-08T08:00:00.000Z'),
    })

    expect(states.map((state) => state.kind)).toEqual([
      'closeout_reminder',
      'closeout_overdue_signal',
      'closeout_owner_attention',
    ])
    expect(states.find((state) => state.kind === 'closeout_overdue_signal')?.dashboard_signal).toBe(true)
    expect(states.find((state) => state.kind === 'closeout_owner_attention')?.payload).toMatchObject({
      owner_attention_required: true,
    })
  })

  it('builds passive reorder reminder, escalation and summary alerts from triggered windows', () => {
    const alerts = buildExecutionReorderGovernanceAlerts({
      projectId: 'project-2',
      anomaly: {
        project_id: 'project-2',
        detected_at: '2026-04-14T08:00:00.000Z',
        total_events: 10,
        windows: [
          {
            window_days: 3,
            event_count: 10,
            affected_task_count: 10,
            cumulative_event_count: 10,
            triggered: true,
            average_offset_days: 8,
            key_task_count: 3,
          },
          {
            window_days: 5,
            event_count: 10,
            affected_task_count: 10,
            cumulative_event_count: 10,
            triggered: true,
            average_offset_days: 8,
            key_task_count: 3,
          },
          {
            window_days: 7,
            event_count: 10,
            affected_task_count: 10,
            cumulative_event_count: 10,
            triggered: true,
            average_offset_days: 8,
            key_task_count: 3,
          },
        ],
      },
      now: new Date('2026-04-14T08:00:00.000Z'),
    })

    expect(alerts.map((alert) => alert.kind)).toEqual([
      'reorder_reminder',
      'reorder_escalation',
      'reorder_summary',
    ])
    expect(alerts[0].detail).toContain('3')
    expect(alerts[1].detail).toContain('5')
    expect(alerts[2].detail).toContain('7')
    expect(alerts[2].detail).toContain('change summary')

    const states = buildExecutionReorderGovernanceStates({
      projectId: 'project-2',
      anomaly: {
        project_id: 'project-2',
        detected_at: '2026-04-14T08:00:00.000Z',
        total_events: 10,
        windows: [
          {
            window_days: 3,
            event_count: 10,
            affected_task_count: 10,
            cumulative_event_count: 10,
            triggered: true,
            average_offset_days: 8,
            key_task_count: 3,
          },
          {
            window_days: 5,
            event_count: 10,
            affected_task_count: 10,
            cumulative_event_count: 10,
            triggered: true,
            average_offset_days: 8,
            key_task_count: 3,
          },
          {
            window_days: 7,
            event_count: 10,
            affected_task_count: 10,
            cumulative_event_count: 10,
            triggered: true,
            average_offset_days: 8,
            key_task_count: 3,
          },
        ],
      } as any,
      now: new Date('2026-04-14T08:00:00.000Z'),
    })

    expect(states.map((state) => state.kind)).toEqual([
      'reorder_reminder',
      'reorder_escalation',
      'reorder_summary',
    ])
    expect(states.find((state) => state.kind === 'reorder_summary')?.status).toBe('resolved')
    expect(states.find((state) => state.kind === 'reorder_summary')?.payload).toMatchObject({
      change_summary_generated: true,
    })
  })

  it('builds ad hoc cross-month reminders after three unmapped months', () => {
    const alerts = buildAdHocCarryoverGovernanceAlerts({
      projectId: 'project-3',
      tasks: [
        {
          id: 'task-1',
          project_id: 'project-3',
          title: 'Ad hoc task',
          task_source: 'ad_hoc',
          baseline_item_id: null,
          monthly_plan_item_id: null,
        },
      ] as any,
      snapshots: [
        {
          id: 'snapshot-1',
          task_id: 'task-1',
          progress: 10,
          snapshot_date: '2026-03-02',
          created_at: '2026-03-02T00:00:00.000Z',
          planning_source_type: 'execution',
        },
        {
          id: 'snapshot-2',
          task_id: 'task-1',
          progress: 20,
          snapshot_date: '2026-04-02',
          created_at: '2026-04-02T00:00:00.000Z',
          planning_source_type: 'execution',
        },
        {
          id: 'snapshot-3',
          task_id: 'task-1',
          progress: 30,
          snapshot_date: '2026-05-02',
          created_at: '2026-05-02T00:00:00.000Z',
          planning_source_type: 'execution',
        },
      ] as any,
    })

    expect(alerts).toHaveLength(1)
    expect(alerts[0].kind).toBe('ad_hoc_cross_month_reminder')
    expect(alerts[0].task_id).toBe('task-1')
    expect(alerts[0].detail).toContain('for 3 months')

    const states = buildAdHocCarryoverGovernanceStates({
      projectId: 'project-3',
      tasks: [
        {
          id: 'task-1',
          project_id: 'project-3',
          title: 'Ad hoc task',
          task_source: 'ad_hoc',
          baseline_item_id: null,
          monthly_plan_item_id: null,
        },
      ] as any,
      snapshots: [
        {
          id: 'snapshot-1',
          task_id: 'task-1',
          progress: 10,
          snapshot_date: '2026-03-02',
          created_at: '2026-03-02T00:00:00.000Z',
          planning_source_type: 'execution',
        },
        {
          id: 'snapshot-2',
          task_id: 'task-1',
          progress: 20,
          snapshot_date: '2026-04-02',
          created_at: '2026-04-02T00:00:00.000Z',
          planning_source_type: 'execution',
        },
        {
          id: 'snapshot-3',
          task_id: 'task-1',
          progress: 30,
          snapshot_date: '2026-05-02',
          created_at: '2026-05-02T00:00:00.000Z',
          planning_source_type: 'execution',
        },
      ] as any,
    })

    expect(states).toHaveLength(1)
    expect(states[0].kind).toBe('ad_hoc_cross_month_reminder')
    expect(states[0].payload).toMatchObject({
      consecutive_months: 3,
    })
  })

  it('does not alert when ad hoc snapshots are not consecutive months', () => {
    const alerts = buildAdHocCarryoverGovernanceAlerts({
      projectId: 'project-4',
      tasks: [
        {
          id: 'task-2',
          project_id: 'project-4',
          title: 'Ad hoc task with gaps',
          task_source: 'ad_hoc',
          baseline_item_id: null,
          monthly_plan_item_id: null,
        },
      ] as any,
      snapshots: [
        {
          id: 'snapshot-4',
          task_id: 'task-2',
          progress: 10,
          snapshot_date: '2026-03-02',
          created_at: '2026-03-02T00:00:00.000Z',
          planning_source_type: 'execution',
        },
        {
          id: 'snapshot-5',
          task_id: 'task-2',
          progress: 20,
          snapshot_date: '2026-05-02',
          created_at: '2026-05-02T00:00:00.000Z',
          planning_source_type: 'execution',
        },
        {
          id: 'snapshot-6',
          task_id: 'task-2',
          progress: 30,
          snapshot_date: '2026-06-02',
          created_at: '2026-06-02T00:00:00.000Z',
          planning_source_type: 'execution',
        },
      ] as any,
    })

    expect(alerts).toHaveLength(0)
  })

  it('builds independent mapping orphan and milestone scenario alerts', () => {
    const alerts = buildAlerts({
      project_id: 'project-9',
      health: {
        project_id: 'project-9',
        score: 92,
        status: 'healthy',
        label: 'healthy',
        breakdown: {
          data_integrity_score: 92,
          mapping_integrity_score: 60,
          system_consistency_score: 95,
          m1_m9_score: 80,
          passive_reorder_penalty: 0,
          total_score: 92,
        },
        integrity: {} as any,
      },
      integrity: {
        project_id: 'project-9',
        milestone_integrity: {
          project_id: 'project-9',
          summary: {
            total: 2,
            aligned: 0,
            needs_attention: 1,
            missing_data: 1,
            blocked: 0,
          },
          items: [
            {
              milestone_id: 'milestone-1',
              milestone_key: 'M1',
              title: 'M1 complete',
              planned_date: '2026-04-01T00:00:00.000Z',
              current_planned_date: '2026-04-01T00:00:00.000Z',
              actual_date: null,
              state: 'missing_data',
              issues: ['missing actual date for completed milestone'],
            },
            {
              milestone_id: 'milestone-2',
              milestone_key: 'M2',
              title: 'M2 start',
              planned_date: '2026-04-02T00:00:00.000Z',
              current_planned_date: '2026-04-03T00:00:00.000Z',
              actual_date: null,
              state: 'needs_attention',
              issues: ['current planned date earlier than baseline date'],
            },
          ],
        },
        data_integrity: {
          total_tasks: 10,
          missing_participant_unit_count: 0,
          missing_scope_dimension_count: 0,
          missing_progress_snapshot_count: 0,
        },
        mapping_integrity: {
          baseline_pending_count: 2,
          baseline_merged_count: 1,
          monthly_carryover_count: 0,
        },
        system_consistency: {
          inconsistent_milestones: 2,
          stale_snapshot_count: 0,
        },
        passive_reorder: {
          project_id: 'project-9',
          detected_at: '2026-04-18T00:00:00.000Z',
          total_events: 0,
          windows: [
            { window_days: 3, event_count: 0, affected_task_count: 0, cumulative_event_count: 0, triggered: false },
            { window_days: 5, event_count: 0, affected_task_count: 0, cumulative_event_count: 0, triggered: false },
            { window_days: 7, event_count: 0, affected_task_count: 0, cumulative_event_count: 0, triggered: false },
          ],
        },
      },
      anomaly: {
        project_id: 'project-9',
        detected_at: '2026-04-18T00:00:00.000Z',
        total_events: 0,
        windows: [
          { window_days: 3, event_count: 0, affected_task_count: 0, cumulative_event_count: 0, triggered: false },
          { window_days: 5, event_count: 0, affected_task_count: 0, cumulative_event_count: 0, triggered: false },
          { window_days: 7, event_count: 0, affected_task_count: 0, cumulative_event_count: 0, triggered: false },
        ],
      },
      alerts: [],
      states: [],
    } as any)

    expect(alerts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'mapping_orphan_pointer',
          severity: 'critical',
        }),
        expect.objectContaining({
          kind: 'milestone_missing_data',
          source_id: 'project-9:milestone:milestone-1:milestone_missing_data',
        }),
        expect.objectContaining({
          kind: 'milestone_needs_attention',
          source_id: 'project-9:milestone:milestone-2:milestone_needs_attention',
        }),
      ]),
    )
  })

  it('normalizes existing algorithm outputs into layered governance signals without letting health score block saves', () => {
    const signals = buildGovernanceSignals({
      project_id: 'project-10',
      health: {
        project_id: 'project-10',
        score: 72,
        status: 'warning',
        label: 'warning',
        breakdown: {
          data_integrity_score: 70,
          mapping_integrity_score: 60,
          system_consistency_score: 80,
          m1_m9_score: 65,
          passive_reorder_penalty: 5,
          total_score: 72,
        },
        integrity: {} as any,
      },
      integrity: {
        project_id: 'project-10',
        milestone_integrity: {
          project_id: 'project-10',
          summary: {
            total: 3,
            aligned: 0,
            needs_attention: 1,
            missing_data: 1,
            blocked: 1,
          },
          items: [
            {
              milestone_id: 'milestone-blocked',
              milestone_key: 'M1',
              title: 'M1 blocked',
              planned_date: '2026-04-01T00:00:00.000Z',
              current_planned_date: '2026-04-01T00:00:00.000Z',
              actual_date: null,
              state: 'blocked',
              issues: ['blocked by missing commitment anchor'],
            },
            {
              milestone_id: 'milestone-missing',
              milestone_key: 'M2',
              title: 'M2 missing',
              planned_date: null,
              current_planned_date: null,
              actual_date: null,
              state: 'missing_data',
              issues: ['missing milestone plan date'],
            },
            {
              milestone_id: 'milestone-attention',
              milestone_key: 'M3',
              title: 'M3 attention',
              planned_date: '2026-04-03T00:00:00.000Z',
              current_planned_date: '2026-04-05T00:00:00.000Z',
              actual_date: null,
              state: 'needs_attention',
              issues: ['current date deviates from baseline'],
            },
          ],
        },
        data_integrity: {
          total_tasks: 12,
          missing_participant_unit_count: 2,
          missing_scope_dimension_count: 1,
          missing_progress_snapshot_count: 3,
        },
        mapping_integrity: {
          baseline_pending_count: 1,
          baseline_merged_count: 0,
          monthly_carryover_count: 2,
        },
        system_consistency: {
          inconsistent_milestones: 1,
          stale_snapshot_count: 2,
        },
        passive_reorder: {
          project_id: 'project-10',
          detected_at: '2026-04-18T00:00:00.000Z',
          total_events: 6,
          windows: [
            { window_days: 3, event_count: 3, affected_task_count: 3, cumulative_event_count: 3, triggered: true },
            { window_days: 5, event_count: 6, affected_task_count: 5, cumulative_event_count: 6, triggered: true },
            { window_days: 7, event_count: 0, affected_task_count: 0, cumulative_event_count: 6, triggered: false },
          ],
        },
      },
      anomaly: {
        project_id: 'project-10',
        detected_at: '2026-04-18T00:00:00.000Z',
        total_events: 6,
        windows: [
          { window_days: 3, event_count: 3, affected_task_count: 3, cumulative_event_count: 3, triggered: true },
          { window_days: 5, event_count: 6, affected_task_count: 5, cumulative_event_count: 6, triggered: true },
          { window_days: 7, event_count: 0, affected_task_count: 0, cumulative_event_count: 6, triggered: false },
        ],
      },
      alerts: [],
      states: [],
    } as any)

    expect(signals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceAlgorithm: 'data_lineage',
          gateLevel: 'block_save',
          targetSurface: 'baseline',
        }),
        expect.objectContaining({
          sourceAlgorithm: 'data_lineage',
          gateLevel: 'confirm',
          targetSurface: 'monthly_plan',
        }),
        expect.objectContaining({
          sourceAlgorithm: 'data_quality',
          gateLevel: 'confirm',
          targetSurface: 'planning_governance',
        }),
        expect.objectContaining({
          sourceAlgorithm: 'milestone_integrity',
          gateLevel: 'block_save',
          targetSurface: 'baseline',
        }),
        expect.objectContaining({
          sourceAlgorithm: 'milestone_integrity',
          gateLevel: 'confirm',
          targetSurface: 'planning_governance',
        }),
        expect.objectContaining({
          sourceAlgorithm: 'planning_integrity',
          gateLevel: 'confirm',
          targetSurface: 'planning_governance',
        }),
        expect.objectContaining({
          sourceAlgorithm: 'system_anomaly',
          gateLevel: 'confirm',
          targetSurface: 'planning_governance',
        }),
        expect.objectContaining({
          sourceAlgorithm: 'planning_health',
          gateLevel: 'hint',
          targetSurface: 'planning_governance',
        }),
      ]),
    )
    expect(signals.some((signal) => signal.sourceAlgorithm === 'planning_health' && signal.gateLevel === 'block_save')).toBe(false)
  })

  it('uses milestone integrity row gate policy so manual milestones confirm but formal broken anchors block', () => {
    const signals = buildGovernanceSignals({
      project_id: 'project-13',
      health: {
        project_id: 'project-13',
        score: 90,
        status: 'healthy',
        label: 'healthy',
        breakdown: {
          data_integrity_score: 100,
          mapping_integrity_score: 100,
          system_consistency_score: 80,
          m1_m9_score: 50,
          passive_reorder_penalty: 0,
          total_score: 90,
        },
        integrity: {} as any,
      },
      integrity: {
        project_id: 'project-13',
        milestone_integrity: {
          project_id: 'project-13',
          summary: { total: 2, aligned: 0, needs_attention: 1, missing_data: 0, blocked: 1 },
          items: [
            {
              milestone_id: 'manual-milestone',
              milestone_key: 'M3',
              title: 'Manual milestone',
              planned_date: '2026-05-01T00:00:00.000Z',
              current_planned_date: '2026-05-01T00:00:00.000Z',
              actual_date: null,
              state: 'needs_attention',
              issues: ['manual milestone missing commitment anchor'],
              gate_level: 'confirm',
              target_surface: 'planning_governance',
              commitment_anchor: 'manual',
              critical_context: false,
            },
            {
              milestone_id: 'formal-milestone',
              milestone_key: 'M6',
              title: 'Formal milestone',
              planned_date: '2026-06-01T00:00:00.000Z',
              current_planned_date: '2026-06-01T00:00:00.000Z',
              actual_date: null,
              state: 'blocked',
              issues: ['baseline commitment anchor missing'],
              gate_level: 'block_save',
              target_surface: 'baseline',
              commitment_anchor: 'baseline',
              critical_context: true,
            },
          ],
        },
        data_integrity: {
          total_tasks: 10,
          missing_participant_unit_count: 0,
          missing_scope_dimension_count: 0,
          missing_progress_snapshot_count: 0,
        },
        mapping_integrity: {
          baseline_pending_count: 0,
          baseline_merged_count: 0,
          monthly_carryover_count: 0,
        },
        system_consistency: {
          inconsistent_milestones: 2,
          stale_snapshot_count: 0,
        },
        passive_reorder: {
          project_id: 'project-13',
          detected_at: '2026-04-18T00:00:00.000Z',
          total_events: 0,
          windows: [],
        },
      },
      anomaly: {
        project_id: 'project-13',
        detected_at: '2026-04-18T00:00:00.000Z',
        total_events: 0,
        windows: [],
      },
      alerts: [],
      states: [],
    } as any)

    expect(signals).toEqual(expect.arrayContaining([
      expect.objectContaining({
        sourceAlgorithm: 'milestone_integrity',
        sourceId: 'project-13:milestone_integrity:manual-milestone',
        gateLevel: 'confirm',
        targetSurface: 'planning_governance',
      }),
      expect.objectContaining({
        sourceAlgorithm: 'milestone_integrity',
        sourceId: 'project-13:milestone_integrity:formal-milestone',
        gateLevel: 'block_save',
        targetSurface: 'baseline',
      }),
    ]))
  })

  it('normalizes connected algorithm context into hard, soft and explanation governance signals', () => {
    const baseSnapshot = {
      project_id: 'project-11',
      health: {
        project_id: 'project-11',
        score: 96,
        status: 'healthy',
        label: 'healthy',
        breakdown: {
          data_integrity_score: 96,
          mapping_integrity_score: 96,
          system_consistency_score: 96,
          m1_m9_score: 96,
          passive_reorder_penalty: 0,
          total_score: 96,
        },
        integrity: {} as any,
      },
      integrity: {
        project_id: 'project-11',
        milestone_integrity: {
          project_id: 'project-11',
          summary: { total: 0, aligned: 0, needs_attention: 0, missing_data: 0, blocked: 0 },
          items: [],
        },
        data_integrity: {
          total_tasks: 10,
          missing_participant_unit_count: 0,
          missing_scope_dimension_count: 0,
          missing_progress_snapshot_count: 0,
        },
        mapping_integrity: {
          baseline_pending_count: 0,
          baseline_merged_count: 0,
          monthly_carryover_count: 0,
        },
        system_consistency: {
          inconsistent_milestones: 0,
          stale_snapshot_count: 0,
        },
        passive_reorder: {
          project_id: 'project-11',
          detected_at: '2026-04-18T00:00:00.000Z',
          total_events: 0,
          windows: [],
        },
      },
      anomaly: {
        project_id: 'project-11',
        detected_at: '2026-04-18T00:00:00.000Z',
        total_events: 0,
        windows: [],
      },
      alerts: [],
      states: [],
      governanceSignals: [],
    } as any

    const signals = buildGovernanceSignals(baseSnapshot, {
      wbsRollupIssues: [
        {
          code: 'MISSING_PARENT_ROW',
          level: 'error',
          message: 'Parent row is missing.',
          rowId: 'task-1',
          parentId: 'parent-missing',
        },
      ],
      baselineValidity: {
        baselineId: 'baseline-1',
        state: 'needs_realign',
        comparedTaskCount: 20,
        deviatedTaskCount: 8,
        deviatedTaskRatio: 0.4,
        shiftedMilestoneCount: 2,
        averageMilestoneShiftDays: 7,
        totalDurationDeviationRatio: 0.25,
        triggeredRules: ['task_deviation_ratio', 'milestone_shift'],
        isValid: false,
      },
      progressAnomalySignals: [
        {
          taskId: 'task-2',
          code: 'progress_jump',
          severity: 'critical',
          summary: 'Progress jumped in one day.',
          metadata: { progress_delta: 80 },
        },
      ],
      taskConstraintSummaries: [
        {
          taskId: 'task-3',
          readyForStart: false,
          dependencyStatus: 'blocking',
          conditionStatus: 'satisfied',
          obstacleStatus: 'clear',
          progressImpactLevel: 'none',
          blockedForProgress: false,
          unmetDependencyCount: 1,
          unmetHardConditionCount: 0,
        },
      ],
      linkageSignals: [
        {
          sourceAlgorithm: 'drawing_package',
          taskId: 'task-4',
          boundToTask: true,
          severity: 'warning',
          title: 'Drawing package not ready',
          detail: 'Drawing package is a bound start condition.',
          evidence: { drawing_package_id: 'drawing-1' },
        },
        {
          sourceAlgorithm: 'acceptance_flow',
          taskId: 'task-5',
          boundToTask: false,
          severity: 'critical',
          title: 'Acceptance domain notice',
          detail: 'Acceptance notice is not bound to the plan task.',
          evidence: { acceptance_plan_id: 'acceptance-1' },
        },
      ],
      explanationSignals: [
        {
          sourceAlgorithm: 'progress_deviation',
          taskId: 'task-6',
          title: 'Progress deviation attribution',
          detail: 'Delay is mainly explained by workflow handover.',
          evidence: { top_cause: 'workflow_handover' },
        },
        {
          sourceAlgorithm: 'construction_rhythm',
          title: 'Construction rhythm candidate',
          detail: 'Candidate-only rhythm indicates low confidence.',
          evidence: { autoApply: false },
        },
      ],
    })

    expect(signals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceAlgorithm: 'wbs_plan_rollup',
          gateLevel: 'block_save',
          targetSurface: 'task_list',
          taskId: 'task-1',
        }),
        expect.objectContaining({
          sourceAlgorithm: 'planning_revision_pool',
          gateLevel: 'confirm',
          targetSurface: 'baseline',
          sourceId: 'project-11:planning_revision_pool:baseline-1',
        }),
        expect.objectContaining({
          sourceAlgorithm: 'progress_anomaly',
          gateLevel: 'confirm',
          targetSurface: 'planning_governance',
          taskId: 'task-2',
        }),
        expect.objectContaining({
          sourceAlgorithm: 'task_constraint',
          gateLevel: 'confirm',
          targetSurface: 'monthly_plan',
          taskId: 'task-3',
        }),
        expect.objectContaining({
          sourceAlgorithm: 'drawing_package',
          gateLevel: 'confirm',
          targetSurface: 'monthly_plan',
          taskId: 'task-4',
        }),
        expect.objectContaining({
          sourceAlgorithm: 'progress_deviation',
          gateLevel: 'explain',
          targetSurface: 'reports',
          taskId: 'task-6',
        }),
        expect.objectContaining({
          sourceAlgorithm: 'construction_rhythm',
          gateLevel: 'hint',
          targetSurface: 'planning_governance',
        }),
      ]),
    )
    expect(signals.some((signal) => signal.sourceAlgorithm === 'acceptance_flow')).toBe(false)
    expect(signals.some((signal) => signal.sourceAlgorithm === 'progress_anomaly' && signal.gateLevel === 'block_save')).toBe(false)
    expect(signals.some((signal) => signal.sourceAlgorithm === 'progress_deviation' && signal.gateLevel === 'block_save')).toBe(false)
    expect(signals.some((signal) => signal.sourceAlgorithm === 'construction_rhythm' && signal.gateLevel === 'block_save')).toBe(false)
  })

  it('evaluates publish and confirm gates from governance signals without letting confirm-level findings block', () => {
    const gate = evaluatePreConfirmGovernanceGate({
      projectId: 'project-12',
      targetSurface: 'baseline',
      signals: [
        {
          id: 'confirm-signal',
          sourceAlgorithm: 'planning_revision_pool',
          gateLevel: 'confirm',
          targetSurface: 'baseline',
          title: 'Baseline needs review',
          detail: 'Baseline needs owner confirmation.',
          evidence: {},
          recommendation: 'Confirm before publication.',
          sourceId: 'confirm-signal',
          taskId: null,
        },
        {
          id: 'hint-signal',
          sourceAlgorithm: 'planning_health',
          gateLevel: 'hint',
          targetSurface: 'planning_governance',
          title: 'Health hint',
          detail: 'Health is only context.',
          evidence: {},
          recommendation: 'Review context.',
          sourceId: 'hint-signal',
          taskId: null,
        },
        {
          id: 'report-explain',
          sourceAlgorithm: 'progress_deviation',
          gateLevel: 'explain',
          targetSurface: 'reports',
          title: 'Deviation explanation',
          detail: 'Reports-only explanation should not affect baseline gate.',
          evidence: {},
          recommendation: 'Use in reports.',
          sourceId: 'report-explain',
          taskId: null,
        },
      ],
    })

    expect(gate.allowed).toBe(true)
    expect(gate.blocked).toBe(false)
    expect(gate.blockingSignals).toHaveLength(0)
    expect(gate.confirmationSignals.map((signal) => signal.id)).toEqual(['confirm-signal'])
    expect(gate.hintSignals.map((signal) => signal.id)).toEqual(['hint-signal'])

    const blockedGate = evaluatePreConfirmGovernanceGate({
      projectId: 'project-12',
      targetSurface: 'baseline',
      signals: [
        {
          id: 'block-signal',
          sourceAlgorithm: 'wbs_plan_rollup',
          gateLevel: 'block_save',
          targetSurface: 'task_list',
          title: 'WBS rollup blocks save',
          detail: 'Parent row is missing.',
          evidence: {},
          recommendation: 'Repair WBS rollup first.',
          sourceId: 'block-signal',
          taskId: 'task-1',
        },
      ],
    })

    expect(blockedGate.allowed).toBe(false)
    expect(blockedGate.blocked).toBe(true)
    expect(blockedGate.blockingSignals.map((signal) => signal.id)).toEqual(['block-signal'])
  })
})
