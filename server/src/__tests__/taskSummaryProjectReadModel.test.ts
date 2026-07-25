import { describe, expect, it } from 'vitest'

import * as taskSummaryService from '../services/taskSummaryService.js'

describe('project task summary read model', () => {
  it('owns completion filtering, milestone grouping, labels, and summary counts', async () => {
    const buildProjectTaskSummaryReadModel = (taskSummaryService as any).buildProjectTaskSummaryReadModel
    expect(buildProjectTaskSummaryReadModel).toBeTypeOf('function')
    if (typeof buildProjectTaskSummaryReadModel !== 'function') return

    const attributionTotals = new Map([['all', { taskCount: 3 }]])
    const result = await buildProjectTaskSummaryReadModel({
      projectId: 'project-1',
      type: 'all',
      milestones: [{
        id: 'milestone-1',
        title: 'Structure complete',
        status: 'completed',
        completed_at: '2026-04-10',
        target_date: '2026-04-10',
      }],
      taskRows: [
        {
          id: 'task-on-time',
          title: 'On-time task',
          status: 'completed',
          progress: 100,
          planned_start_date: '2026-04-01',
          planned_end_date: '2026-04-05',
          actual_start_date: '2026-04-01',
          actual_end_date: '2026-04-05',
          assignee_user_id: 'user-1',
          participant_unit_id: 'unit-1',
        },
        {
          id: 'task-late',
          title: 'Late task',
          status: 'completed',
          progress: 100,
          planned_start_date: '2026-04-01',
          planned_end_date: '2026-04-05',
          actual_start_date: '2026-04-01',
          actual_end_date: '2026-04-07',
        },
        {
          id: 'task-active',
          title: 'Active task',
          status: 'in_progress',
          progress: 40,
          planned_end_date: '2026-04-20',
        },
      ],
      scopeBindingMap: { specialty: [], building: [], region: [], phase: [] },
      workCalendar: {
        basis: 'official_construction_calendar_seed',
        calendarRef: 'work_calendar',
        calendarVersion: 'calendar-v1',
        timezone: 'Asia/Shanghai',
        availability: 'available',
        unavailableReason: null,
        windows: [],
      },
      participantUnitNameMap: new Map([['unit-1', 'General contractor']]),
      projectMemberNameMap: new Map([['user-1', 'Owner One']]),
      taskMilestoneRows: [{ task_id: 'task-on-time', milestone_id: 'milestone-1' }],
      monthlyFulfillment: [{ month: '2026-04', rate: 80 }],
      timelineEvents: [{ id: 'timeline-1' }],
      timelineReady: true,
    }, {
      getAttributionTotals: async () => attributionTotals,
    })

    expect(result.stats).toEqual({
      total_completed: 2,
      on_time_count: 1,
      delayed_count: 1,
      completed_milestone_count: 1,
    })
    expect(result.groups).toEqual([
      expect.objectContaining({
        id: 'milestone-1',
        tasks: [expect.objectContaining({
          id: 'task-on-time',
          assignee: 'Owner One',
          participant_unit_name: 'General contractor',
          status_label: 'on_time',
        })],
      }),
      expect.objectContaining({
        id: 'unclassified',
        tasks: [expect.objectContaining({ id: 'task-late', status_label: 'delayed' })],
      }),
    ])
    expect(result.attribution_totals).toBe(attributionTotals)
    expect(result.monthlyFulfillment).toEqual([{ month: '2026-04', rate: 80 }])
    expect(result.timeline_events).toEqual([{ id: 'timeline-1' }])
    expect(result.timeline_ready).toBe(true)
  })
})
