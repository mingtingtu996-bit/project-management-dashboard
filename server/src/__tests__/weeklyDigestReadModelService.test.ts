import { describe, expect, it } from 'vitest'

import { buildWeeklyDigestReadModel } from '../services/weeklyDigestReadModelService.js'

describe('weeklyDigestReadModelService', () => {
  it('projects persisted compatibility numbers into identified production-day DTOs', () => {
    const result = buildWeeklyDigestReadModel({
      project_id: 'project-1',
      generated_at: '2026-07-20T08:00:00.000Z',
      critical_nearest_delay_days: 3,
      top_delayed_tasks: [{ task_id: 'task-1', title: 'Task 1', delay_days: 2 }],
    }, {
      basis: 'official_construction_calendar_seed',
      windows: [],
      calendarRef: 'work_calendar',
      calendarVersion: 'calendar-v1',
      timezone: 'Asia/Shanghai',
      availability: 'available',
      unavailableReason: null,
    })

    expect(result).toEqual(expect.objectContaining({
      critical_nearest_delay: expect.objectContaining({
        value: 3,
        unit: 'construction_production_day',
        calendarRef: 'work_calendar',
        calendarVersion: 'calendar-v1',
        asOf: '2026-07-20',
        availability: 'available',
      }),
      top_delayed_tasks: [expect.objectContaining({
        delay: expect.objectContaining({ value: 2, unit: 'construction_production_day' }),
      })],
    }))
  })

  it('fails closed instead of relabeling persisted numbers when calendar identity is missing', () => {
    const result = buildWeeklyDigestReadModel({
      project_id: 'project-1',
      generated_at: '2026-07-20T08:00:00.000Z',
      critical_nearest_delay_days: 3,
      top_delayed_tasks: [{ task_id: 'task-1', title: 'Task 1', delay_days: 2 }],
    }, { basis: 'calendar_day', windows: [] })

    expect(result?.critical_nearest_delay).toEqual(expect.objectContaining({
      value: null,
      availability: 'unavailable',
    }))
    expect(result?.top_delayed_tasks[0].delay).toEqual(expect.objectContaining({
      value: null,
      availability: 'unavailable',
    }))
  })
})
