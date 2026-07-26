import { describe, expect, it } from 'vitest'

import * as taskSummaryCompareService from '../services/taskSummaryCompareService.js'

import {
  buildDailyTaskProgressSummary,
  buildTaskSummaryCompareResults,
  normalizeTaskSummaryCompareGranularity,
  normalizeTaskSummaryComparePeriods,
} from '../services/taskSummaryCompareService.js'

describe('taskSummaryCompareService', () => {
  it('resolves daily progress boundaries in the project business timezone', () => {
    const resolveDailyTaskProgressWindow = (taskSummaryCompareService as any).resolveDailyTaskProgressWindow
    expect(resolveDailyTaskProgressWindow).toBeTypeOf('function')
    if (typeof resolveDailyTaskProgressWindow !== 'function') return

    expect(resolveDailyTaskProgressWindow({
      now: new Date('2026-07-19T16:30:00.000Z'),
      timezone: 'Asia/Shanghai',
    })).toEqual({
      targetDate: '2026-07-20',
      previousDate: '2026-07-19',
      dayStartInclusive: '2026-07-19T16:00:00.000Z',
      dayEndExclusive: '2026-07-20T16:00:00.000Z',
    })

    expect(resolveDailyTaskProgressWindow({
      date: '2026-03-08',
      timezone: 'America/New_York',
    })).toEqual(expect.objectContaining({
      targetDate: '2026-03-08',
      previousDate: '2026-03-07',
      dayStartInclusive: '2026-03-08T05:00:00.000Z',
      dayEndExclusive: '2026-03-09T04:00:00.000Z',
    }))
  })

  it('normalizes unsupported granularities back to day', () => {
    expect(normalizeTaskSummaryCompareGranularity('year')).toBe('day')
    expect(normalizeTaskSummaryCompareGranularity('month')).toBe('month')
  })

  it('expands month periods into full date ranges', () => {
    const periods = normalizeTaskSummaryComparePeriods([
      {
        label: '本月',
        from: '2026-04',
        to: '2026-04',
      },
    ], 'month')

    expect(periods).toEqual([
      {
        label: '本月',
        from: '2026-04-01',
        to: '2026-04-30',
      },
    ])
  })

  it('builds registered compare metrics in the service and uses real on-time semantics', () => {
    const results = buildTaskSummaryCompareResults({
      periods: [{ label: 'April', from: '2026-04-01', to: '2026-04-30' }],
      tasks: [
        {
          id: 'task-1',
          title: 'Late active task',
          status: 'in_progress',
          progress: 40,
          planned_start_date: '2026-03-01',
          planned_end_date: '2026-04-15',
        },
        {
          id: 'task-2',
          title: 'On-time completed task',
          status: 'completed',
          progress: 100,
          planned_start_date: '2026-03-01',
          planned_end_date: '2026-04-20',
          actual_end_date: '2026-04-20',
        },
      ],
      snapshots: [
        { task_id: 'task-1', progress: 20, snapshot_date: '2026-03-31' },
        { task_id: 'task-2', progress: 80, snapshot_date: '2026-03-31' },
        { task_id: 'task-1', progress: 40, snapshot_date: '2026-04-10' },
        { task_id: 'task-2', progress: 100, snapshot_date: '2026-04-20' },
      ],
      resolveResponsibleLabel: (task) => `owner:${String(task.id)}`,
      workCalendar: null,
    })

    expect(results).toHaveLength(1)
    expect(results[0].summary).toEqual({
      total_progress_change: 20,
      tasks_updated: 2,
      tasks_progressed: 2,
      tasks_completed: 1,
      delayed: 1,
      on_time_rate: 50,
    })
    expect(results[0].metric_keys).toEqual({
      total_progress_change: 'task_summary_progress_change',
      tasks_updated: 'task_summary_tasks_updated',
      tasks_progressed: 'task_summary_tasks_progressed',
      tasks_completed: 'task_summary_tasks_completed',
      delayed: 'task_summary_delayed_count',
      on_time_rate: 'task_summary_on_time_rate',
    })
  })

  it('does not invent a ten-point delta when the previous snapshot is missing', () => {
    const result = buildDailyTaskProgressSummary({
      targetDate: '2026-04-30',
      previousDate: '2026-04-29',
      tasks: [
        { id: 'task-1', title: 'Comparable task', status: 'in_progress', progress: 60 },
        { id: 'task-2', title: 'Missing baseline', status: 'completed', progress: 100 },
      ],
      todaySnapshots: new Map([
        ['task-1', { task_id: 'task-1', progress: 60, conditions_total_count: 2, obstacles_active_count: 0 }],
        ['task-2', { task_id: 'task-2', progress: 100, conditions_total_count: 1, obstacles_active_count: 0 }],
      ]),
      previousSnapshots: new Map([
        ['task-1', { task_id: 'task-1', progress: 50, conditions_total_count: 1, obstacles_active_count: 1 }],
      ]),
      delayedTaskCount: 4,
      resolveResponsibleLabel: (task) => `owner:${String(task.id)}`,
    })

    expect(result).toEqual(expect.objectContaining({
      progress_change: 10,
      tasks_updated: 1,
      tasks_completed: 0,
      evidence_status: 'insufficient_data',
      insufficient_task_ids: ['task-2'],
      snapshot_summary: {
        conditions_added: 1,
        conditions_closed: 0,
        obstacles_added: 0,
        obstacles_closed: 1,
        delayed_tasks: 4,
      },
    }))
    expect(result.details).toEqual([
      expect.objectContaining({
        task_id: 'task-1',
        progress_before: 50,
        progress_after: 60,
        progress_delta: 10,
      }),
    ])
  })
})
