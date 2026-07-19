import { describe, expect, it } from 'vitest'

import {
  buildTaskSummaryAttributionGroups,
  buildTaskSummaryAttributionTotals,
  HEALTH_THRESHOLDS,
  isDelayedAttributionTask,
  type TaskSummaryAttributionTask,
} from '../services/taskAttributionSummaryService.js'
import type { ConstructionCalendarContext } from '../services/constructionCalendar.js'

const CALENDAR: ConstructionCalendarContext = {
  basis: 'official_construction_calendar_seed',
  windows: [],
  calendarRef: 'work_calendar',
  calendarVersion: 'calendar-v1',
  timezone: 'Asia/Shanghai',
  availability: 'available',
  unavailableReason: null,
}

function buildTask(overrides: Partial<TaskSummaryAttributionTask>): TaskSummaryAttributionTask {
  return {
    id: 'task-1',
    status_label: 'pending',
    planned_end_date: '2026-05-10',
    completed_at: null,
    delay_total_days: 0,
    division_id: 'division-main',
    division_name: '主体结构',
    division_sort_order: 1,
    ...overrides,
  }
}

describe('taskAttributionSummaryService', () => {
  it('keeps total and completed separate when unfinished tasks share the attribution', () => {
    const totals = buildTaskSummaryAttributionTotals([
      buildTask({
        id: 'task-done',
        status_label: 'on_time',
        completed_at: '2026-05-08',
      }),
      buildTask({
        id: 'task-open',
        status_label: 'in_progress',
        completed_at: null,
      }),
    ], CALENDAR, '2026-05-31')

    const summary = totals.division['division-division-main']
    expect(summary.total).toBe(2)
    expect(summary.completed).toBe(1)
    expect(summary.completion_rate).toBe(50)
    expect(summary.on_time_rate).toBe(100)
    expect(summary.avg_delay_days).toBe(0)
    expect(summary.health_level).toBe('healthy')
  })

  it('returns average delay days from attribution totals', () => {
    const summary = buildTaskSummaryAttributionTotals([
      buildTask({ id: 'd-1', completed_at: '2026-05-12', status_label: 'delayed', delay_total_days: 2 }),
      buildTask({ id: 'd-2', completed_at: '2026-05-15', status_label: 'delayed', delay_total_days: 5 }),
      buildTask({ id: 'd-3', completed_at: '2026-05-10', status_label: 'on_time', delay_total_days: 0 }),
    ], CALENDAR, '2026-05-31').division['division-division-main']

    expect(summary.delayed).toBe(2)
    expect(summary.max_delay_days).toBe(5)
    expect(summary.avg_delay_days).toBe(3.5)
    expect(summary.max_delay).toEqual(expect.objectContaining({
      value: 5,
      unit: 'construction_production_day',
      calendarRef: 'work_calendar',
      calendarVersion: 'calendar-v1',
      asOf: '2026-05-31',
      availability: 'available',
    }))
    expect(summary.avg_delay).toEqual(expect.objectContaining({ value: 3.5, unit: 'construction_production_day' }))
  })

  it('maps attribution health thresholds by on-time rate boundaries', () => {
    const healthy = buildTaskSummaryAttributionTotals([
      buildTask({ id: 'h-1', completed_at: '2026-05-01', status_label: 'on_time' }),
      buildTask({ id: 'h-2', completed_at: '2026-05-02', status_label: 'on_time' }),
      buildTask({ id: 'h-3', completed_at: '2026-05-03', status_label: 'on_time' }),
      buildTask({ id: 'h-4', completed_at: '2026-05-04', status_label: 'on_time' }),
      buildTask({ id: 'h-5', completed_at: '2026-05-11', status_label: 'delayed', delay_total_days: 1 }),
    ], CALENDAR, '2026-05-31').division['division-division-main']

    const warning = buildTaskSummaryAttributionTotals([
      buildTask({ id: 'w-1', completed_at: '2026-05-01', status_label: 'on_time' }),
      buildTask({ id: 'w-2', completed_at: '2026-05-11', status_label: 'delayed', delay_total_days: 1 }),
    ], CALENDAR, '2026-05-31').division['division-division-main']

    const critical = buildTaskSummaryAttributionTotals([
      buildTask({ id: 'c-1', completed_at: '2026-05-11', status_label: 'delayed', delay_total_days: 1 }),
      buildTask({ id: 'c-2', completed_at: '2026-05-12', status_label: 'delayed', delay_total_days: 2 }),
    ], CALENDAR, '2026-05-31').division['division-division-main']

    expect(HEALTH_THRESHOLDS).toEqual({ healthy: 80, warning: 50 })
    expect(healthy.on_time_rate).toBe(80)
    expect(healthy.health_level).toBe('healthy')
    expect(warning.on_time_rate).toBe(50)
    expect(warning.health_level).toBe('warning')
    expect(critical.on_time_rate).toBe(0)
    expect(critical.health_level).toBe('critical')
  })

  it('filters zero-completed attributions from the visible group list', () => {
    const groups = buildTaskSummaryAttributionGroups([
      buildTask({
        id: 'task-open',
        status_label: 'in_progress',
        completed_at: null,
      }),
    ], CALENDAR)

    expect(groups).toEqual([])
  })

  it('shares completed-task delay semantics for responsibility and attribution consumers', () => {
    expect(isDelayedAttributionTask(
      buildTask({
        id: 'late-by-date',
        status_label: 'completed',
        completed_at: '2026-05-12',
        planned_end_date: '2026-05-10',
      }), CALENDAR,
    )).toBe(true)
    expect(isDelayedAttributionTask(
      buildTask({
        id: 'on-time-by-date',
        status_label: 'completed',
        completed_at: '2026-05-10',
        planned_end_date: '2026-05-10',
      }), CALENDAR,
    )).toBe(false)
  })

  it('fails closed for aggregate delay values without calendar identity', () => {
    const summary = buildTaskSummaryAttributionTotals([
      buildTask({ id: 'late', completed_at: '2026-05-12', status_label: 'delayed', delay_total_days: 2 }),
    ], { basis: 'calendar_day', windows: [] }, '2026-05-31').division['division-division-main']

    expect(summary.delayed).toBe(1)
    expect(summary.max_delay).toEqual(expect.objectContaining({ value: null, availability: 'unavailable' }))
    expect(summary.avg_delay).toEqual(expect.objectContaining({ value: null, availability: 'unavailable' }))
    expect(summary.max_delay_days).toBeNull()
    expect(summary.avg_delay_days).toBeNull()
  })
})
