import { describe, expect, it } from 'vitest'

import type { ConstructionCalendarContext } from '../../services/constructionCalendar.js'
import {
  isCompletedTaskDelayedAgainstPlan,
  isOpenTaskDelayedAgainstPlan,
} from '../taskPerformance.js'

const calendar: ConstructionCalendarContext = {
  basis: 'official_construction_calendar_seed',
  windows: [{
    holidayCode: 'spring_festival_2026',
    holidayName: 'Spring Festival shutdown',
    startDate: '2026-02-08',
    endDate: '2026-02-21',
    counts_as_construction_shutdown: true,
  }],
}

describe('taskPerformance delay semantics', () => {
  it('uses construction production days before legacy stored delay days for completed tasks', () => {
    expect(isCompletedTaskDelayedAgainstPlan({
      status: 'completed',
      planned_end_date: '2026-02-07',
      actual_end_date: '2026-02-21',
      delay_total_days: 19,
    }, calendar)).toBe(false)

    expect(isCompletedTaskDelayedAgainstPlan({
      status: 'completed',
      planned_end_date: '2026-02-07',
      actual_end_date: '2026-02-26',
      delay_total_days: 19,
    }, calendar)).toBe(true)
  })

  it('does not treat updated_at as a completed task actual finish date', () => {
    expect(isCompletedTaskDelayedAgainstPlan({
      status: 'completed',
      planned_end_date: '2026-02-07',
      actual_end_date: null,
      completed_at: null,
      updated_at: '2026-02-26T00:00:00.000Z',
      delay_total_days: 0,
    }, calendar)).toBe(false)
  })

  it('uses construction production days for open-task overdue status', () => {
    expect(isOpenTaskDelayedAgainstPlan({
      status: 'in_progress',
      planned_end_date: '2026-02-07',
    }, new Date('2026-02-21T00:00:00.000Z'), calendar)).toBe(false)

    expect(isOpenTaskDelayedAgainstPlan({
      status: 'in_progress',
      planned_end_date: '2026-02-07',
    }, new Date('2026-02-26T00:00:00.000Z'), calendar)).toBe(true)
  })
})
