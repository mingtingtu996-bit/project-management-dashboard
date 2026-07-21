import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ConstructionCalendarContext } from '../services/constructionCalendar.js'

const monthlyPlanMocks = vi.hoisted(() => ({
  getMonthlyPlanFulfillmentTrend: vi.fn(),
  getMonthlyPlanStatusSummary: vi.fn(async () => ({
    confirmedCount: 0,
    closedCount: 0,
    pendingCloseoutCount: 0,
    temporaryWithoutBaselineCount: 0,
  })),
}))

vi.mock('../services/monthlyPlanSummaryService.js', () => monthlyPlanMocks)

const {
  buildTaskSummaryAssigneeRows,
  buildTaskSummaryCompletionTrend,
  getTaskSummaryMonthlyPlanFulfillmentTrend,
} = await import('../services/projectExecutionSummaryService.js')

const SHUTDOWN_CALENDAR: ConstructionCalendarContext = {
  basis: 'official_construction_calendar_seed',
  windows: [{
    holidayCode: 'spring-festival-shutdown',
    holidayName: 'Spring Festival shutdown',
    startDate: '2026-02-11',
    endDate: '2026-02-24',
    counts_as_construction_shutdown: true,
  }],
  calendarRef: 'work_calendar',
  calendarVersion: 'calendar-v1',
  timezone: 'Asia/Shanghai',
  availability: 'available',
  unavailableReason: null,
}

const UNAVAILABLE_CALENDAR: ConstructionCalendarContext = {
  basis: 'calendar_day',
  windows: [],
  calendarRef: null,
  calendarVersion: null,
  timezone: 'Asia/Shanghai',
  availability: 'unavailable',
  unavailableReason: 'construction_calendar_identity_missing',
}

describe('task-summary authoritative aggregation', () => {
  beforeEach(() => {
    monthlyPlanMocks.getMonthlyPlanFulfillmentTrend.mockReset()
  })

  it('builds the monthly completion trend with the construction-calendar delay policy', () => {
    const result = buildTaskSummaryCompletionTrend([
      {
        status: 'completed',
        progress: 100,
        planned_end_date: '2026-02-10',
        actual_end_date: '2026-02-24',
      },
      {
        status: 'done',
        progress: 100,
        planned_end_date: '2026-02-10',
        actual_end_date: '2026-02-25',
      },
      {
        status: 'in_progress',
        progress: 80,
        planned_end_date: '2026-02-10',
        actual_end_date: null,
      },
      {
        status: 'completed',
        progress: 100,
        planned_end_date: '2025-12-01',
        actual_end_date: '2025-12-02',
      },
    ], '2026-01-01', SHUTDOWN_CALENDAR)

    expect(result).toEqual([{ month: '2026-02', total: 2, on_time: 1, delayed: 1 }])
  })

  it('preserves calendar-day fallback when construction-calendar identity is unavailable', () => {
    const result = buildTaskSummaryCompletionTrend([{
      status: 'completed',
      progress: 100,
      planned_end_date: '2026-05-10',
      actual_end_date: '2026-05-11',
    }], '2026-05-01', UNAVAILABLE_CALENDAR)

    expect(result).toEqual([{ month: '2026-05', total: 1, on_time: 0, delayed: 1 }])
  })

  it('returns empty trend and assignee rows when no completed tasks exist', () => {
    expect(buildTaskSummaryCompletionTrend([], '2026-01-01', UNAVAILABLE_CALENDAR)).toEqual([])
    expect(buildTaskSummaryAssigneeRows([], new Map(), UNAVAILABLE_CALENDAR)).toEqual([])
  })

  it('builds assignee totals and rates from completed tasks with stable project-member labels', () => {
    const result = buildTaskSummaryAssigneeRows([
      {
        assignee_user_id: 'user-1',
        status: 'completed',
        progress: 100,
        planned_end_date: '2026-05-10',
        actual_end_date: '2026-05-11',
      },
      {
        assignee_user_id: 'user-1',
        status: 'done',
        progress: 100,
        planned_end_date: '2026-05-12',
        actual_end_date: '2026-05-12',
      },
      {
        assignee_user_id: 'outside-project',
        status: 'finished',
        progress: 100,
        planned_end_date: '2026-05-12',
        actual_end_date: '2026-05-12',
      },
      {
        assignee_user_id: 'user-1',
        status: 'in_progress',
        progress: 80,
        planned_end_date: '2026-05-12',
        actual_end_date: null,
      },
    ], new Map([['user-1', 'Project Member']]), UNAVAILABLE_CALENDAR)

    expect(result).toEqual([
      { assignee: 'Project Member', total: 2, on_time: 1, delayed: 1, on_time_rate: 50 },
      { assignee: '未关联责任人', total: 1, on_time: 1, delayed: 0, on_time_rate: 100 },
    ])
  })

  it('reuses the monthly-plan summary authority without a second fulfillment formula', async () => {
    const expected = [{ month: '2026-05', committedCount: 4, fulfilledCount: 3, rate: 75 }]
    monthlyPlanMocks.getMonthlyPlanFulfillmentTrend.mockResolvedValueOnce(expected)

    await expect(getTaskSummaryMonthlyPlanFulfillmentTrend('project-1', 6)).resolves.toEqual(expected)
    expect(monthlyPlanMocks.getMonthlyPlanFulfillmentTrend).toHaveBeenCalledWith('project-1', 6)
  })
})
