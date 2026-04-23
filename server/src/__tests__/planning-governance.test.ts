import { describe, expect, it } from 'vitest'
import {
  buildAlerts,
  buildAdHocCarryoverGovernanceAlerts,
  buildAdHocCarryoverGovernanceStates,
  buildCloseoutGovernanceAlerts,
  buildCloseoutGovernanceStates,
  buildExecutionReorderGovernanceAlerts,
  buildExecutionReorderGovernanceStates,
} from '../services/planningGovernanceService.js'

describe('planning governance lifecycle alerts', () => {
  it('builds closeout reminders, escalation and unlock alerts from overdue monthly plans', () => {
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
      'closeout_unlock',
    ])
    expect(alerts.map((alert) => alert.source_id)).toEqual([
      'project-1:monthly_plan:monthly-plan-1:closeout:3',
      'project-1:monthly_plan:monthly-plan-1:closeout:5',
      'project-1:monthly_plan:monthly-plan-1:closeout:7',
    ])
    expect(alerts[0].detail).toContain('PM')
    expect(alerts[1].detail).toContain('Dashboard')
    expect(alerts[2].detail).toContain('强制发起关账')

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
      'closeout_force_unlock',
    ])
    expect(states.find((state) => state.kind === 'closeout_overdue_signal')?.dashboard_signal).toBe(true)
    expect(states.find((state) => state.kind === 'closeout_force_unlock')?.payload).toMatchObject({
      force_unlock_enabled: true,
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
    expect(alerts[2].detail).toContain('变更摘要')

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
    expect(alerts[0].detail).toContain('连续 3 个月')

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
        label: '健康',
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
              title: 'M1 拿地',
              planned_date: '2026-04-01T00:00:00.000Z',
              current_planned_date: '2026-04-01T00:00:00.000Z',
              actual_date: null,
              state: 'missing_data',
              issues: ['missing actual date for completed milestone'],
            },
            {
              milestone_id: 'milestone-2',
              milestone_key: 'M2',
              title: 'M2 开工',
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
})
