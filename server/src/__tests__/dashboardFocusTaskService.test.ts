import { describe, expect, it } from 'vitest'

import { buildDashboardFocusTasksResponse } from '../services/dashboardFocusTaskService.js'

const calendar = {
  basis: 'official_construction_calendar_seed' as const,
  windows: [{
    startDate: '2026-07-21',
    endDate: '2026-07-30',
    constructionShutdown: true,
  }],
  calendarRef: 'work_calendar',
  calendarVersion: 'calendar-v1',
  timezone: 'Asia/Shanghai',
  availability: 'available' as const,
  unavailableReason: null,
}

describe('dashboardFocusTaskService', () => {
  it('uses the natural 30-day window for future due and production days for overdue', () => {
    const result = buildDashboardFocusTasksResponse({
      rows: [
        { id: 'future', title: 'Future', status: 'pending', planned_end_date: '2026-08-19' },
        { id: 'overdue', title: 'Overdue', status: 'in_progress', planned_end_date: '2026-07-16' },
      ],
      filter: '30days',
      limit: 10,
      now: new Date('2026-07-20T00:00:00.000Z'),
      calendar,
    })

    expect(result.items.map((item) => item.id)).toContain('future')
    expect(result.items.find((item) => item.id === 'future')?.dueDuration).toEqual(expect.objectContaining({
      value: 30,
      unit: 'calendar_day',
    }))
    expect(result.allItems.find((item) => item.id === 'overdue')?.dueDuration).toEqual(expect.objectContaining({
      value: -4,
      unit: 'construction_production_day',
    }))
  })

  it('keeps overdue status but withholds the count when calendar identity is unavailable', () => {
    const result = buildDashboardFocusTasksResponse({
      rows: [{ id: 'overdue', title: 'Overdue', status: 'in_progress', planned_end_date: '2026-07-16' }],
      filter: 'urgent',
      limit: 10,
      now: new Date('2026-07-20T00:00:00.000Z'),
      calendar: { basis: 'calendar_day', windows: [] },
    })

    expect(result.items[0]).toEqual(expect.objectContaining({
      dueStatus: 'overdue',
      dueDuration: expect.objectContaining({
        value: null,
        availability: 'unavailable',
      }),
    }))
  })
})
