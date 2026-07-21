import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ConstructionCalendarContext } from '../services/constructionCalendar.js'

const aggregationMocks = vi.hoisted(() => {
  const taskQuery: Record<string, ReturnType<typeof vi.fn>> = {}
  taskQuery.select = vi.fn(() => taskQuery)
  taskQuery.eq = vi.fn(() => taskQuery)
  taskQuery.not = vi.fn(() => taskQuery)
  taskQuery.gte = vi.fn(async () => ({ data: [], error: null }))

  return {
    taskQuery,
    from: vi.fn(() => taskQuery),
    resolveConstructionCalendarContext: vi.fn(),
  }
})

const monthlyPlanMocks = vi.hoisted(() => ({
  getMonthlyPlanFulfillmentTrend: vi.fn(),
  getMonthlyPlanStatusSummary: vi.fn(async () => ({
    confirmedCount: 0,
    closedCount: 0,
    pendingCloseoutCount: 0,
    temporaryWithoutBaselineCount: 0,
  })),
}))

vi.mock('../services/dbService.js', () => ({
  executeSQL: vi.fn(),
  getProject: vi.fn(),
  getTasks: vi.fn(),
  getRisks: vi.fn(),
  getIssues: vi.fn(),
  supabase: { from: aggregationMocks.from },
}))

vi.mock('../services/constructionCalendar.js', async (importOriginal) => ({
  ...await importOriginal<typeof import('../services/constructionCalendar.js')>(),
  resolveConstructionCalendarContext: aggregationMocks.resolveConstructionCalendarContext,
}))

vi.mock('../services/monthlyPlanSummaryService.js', () => monthlyPlanMocks)

const projectExecutionSummaryService = await import('../services/projectExecutionSummaryService.js')
const {
  buildTaskSummaryAssigneeRows,
  buildTaskSummaryCompletionTrend,
  getTaskSummaryCompletionTrend,
  getTaskSummaryMonthlyPlanFulfillmentTrend,
  resolveTaskSummaryTrendWindow,
} = projectExecutionSummaryService

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
    vi.clearAllMocks()
    monthlyPlanMocks.getMonthlyPlanFulfillmentTrend.mockReset()
    aggregationMocks.taskQuery.gte.mockResolvedValue({ data: [], error: null })
    aggregationMocks.resolveConstructionCalendarContext.mockResolvedValue(UNAVAILABLE_CALENDAR)
  })

  it.each([
    ['leap-day month end', '2024-02-29T12:00:00.000+08:00', '2023-09-01'],
    ['30-day month end', '2026-04-30T12:00:00.000+08:00', '2025-11-01'],
    ['31-day month end', '2026-07-31T12:00:00.000+08:00', '2026-02-01'],
    ['year boundary', '2026-01-31T12:00:00.000+08:00', '2025-08-01'],
  ])('resolves the six-month window from the first day for %s', (_label, asOf, expectedFromDate) => {
    expect(resolveTaskSummaryTrendWindow({ months: 6, asOf: new Date(asOf) })).toEqual({
      months: 6,
      asOfDate: asOf.slice(0, 10),
      fromDate: expectedFromDate,
      timezone: 'Asia/Shanghai',
    })
  })

  it('uses the explicit business timezone at a UTC month boundary', () => {
    const asOf = new Date('2026-07-31T16:30:00.000Z')

    expect(resolveTaskSummaryTrendWindow({ months: 6, asOf })).toMatchObject({
      asOfDate: '2026-08-01',
      fromDate: '2026-03-01',
      timezone: 'Asia/Shanghai',
    })
    expect(resolveTaskSummaryTrendWindow({ months: 6, asOf, timezone: 'UTC' })).toMatchObject({
      asOfDate: '2026-07-31',
      fromDate: '2026-02-01',
      timezone: 'UTC',
    })
  })

  it('passes the exact sixth natural month start to the completed-task query', async () => {
    await getTaskSummaryCompletionTrend('project-1', {
      months: 6,
      asOf: new Date('2026-07-30T16:30:00.000Z'),
    })

    expect(aggregationMocks.taskQuery.gte).toHaveBeenCalledWith('actual_end_date', '2026-02-01')
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
