import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  executeSQL: vi.fn(async (_sql: string, _params: unknown[] = []) => []),
  executeSQLOne: vi.fn(async (_sql: string, _params: unknown[] = []) => ({ cnt: 0 })),
}))

vi.mock('../services/dbService.js', () => ({
  executeSQL: mocks.executeSQL,
  executeSQLOne: mocks.executeSQLOne,
}))

import {
  calculateTaskCompletionDelayStats,
  calculateTaskSummaryDurationStats,
  TaskSummaryService,
} from '../services/taskSummaryService.js'
import type { ConstructionCalendarContext } from '../services/constructionCalendar.js'

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

describe('taskSummaryService duration stats', () => {
  beforeEach(() => {
    mocks.executeSQL.mockClear()
    mocks.executeSQLOne.mockClear()
    mocks.executeSQLOne.mockResolvedValue({ cnt: 0 })
    mocks.executeSQL.mockResolvedValue([])
  })

  it('uses calendar days for the plan span and identified production days for actual execution', () => {
    expect(calculateTaskSummaryDurationStats({
      start_date: '2026-04-01',
      end_date: '2026-04-30',
      planned_start_date: '2026-04-03',
      planned_end_date: '2026-04-05',
      actual_start_date: '2026-04-04',
      actual_end_date: '2026-04-08',
    } as never, SHUTDOWN_CALENDAR, '2026-04-08')).toEqual(expect.objectContaining({
      plannedDuration: 3,
      actualDuration: 5,
      plannedDurationMetric: expect.objectContaining({
        value: 3,
        unit: 'calendar_day',
        asOf: '2026-04-08',
        availability: 'available',
      }),
      actualDurationMetric: expect.objectContaining({
        value: 5,
        unit: 'construction_production_day',
        calendarRef: 'work_calendar',
        calendarVersion: 'calendar-v1',
        asOf: '2026-04-08',
        availability: 'available',
      }),
    }))
  })

  it('does not copy the planned calendar span into an incomplete actual production span', () => {
    expect(calculateTaskSummaryDurationStats({
      planned_start_date: '2026-04-03',
      planned_end_date: '2026-04-05',
      actual_start_date: '2026-04-04',
      actual_end_date: null,
    } as never, SHUTDOWN_CALENDAR, '2026-04-08')).toEqual(expect.objectContaining({
      plannedDuration: 3,
      actualDuration: null,
      actualDurationMetric: expect.objectContaining({
        value: null,
        unit: 'construction_production_day',
        availability: 'unavailable',
        unavailableReason: 'duration_value_missing',
      }),
    }))
  })

  it('keeps same-day tasks as one inclusive day', () => {
    expect(calculateTaskSummaryDurationStats({
      planned_start_date: '2026-04-03',
      planned_end_date: '2026-04-03',
      actual_start_date: '2026-04-03',
      actual_end_date: '2026-04-03',
    } as never, SHUTDOWN_CALENDAR, '2026-04-03')).toEqual(expect.objectContaining({
      plannedDuration: 1,
      actualDuration: 1,
    }))
  })

  it('fails closed for actual duration and completion delay without calendar identity', () => {
    const unidentifiedCalendar: ConstructionCalendarContext = { basis: 'calendar_day', windows: [] }
    expect(calculateTaskSummaryDurationStats({
      planned_start_date: '2026-04-03',
      planned_end_date: '2026-04-05',
      actual_start_date: '2026-04-04',
      actual_end_date: '2026-04-08',
    } as never, unidentifiedCalendar, '2026-04-08')).toEqual(expect.objectContaining({
      plannedDuration: 3,
      actualDuration: null,
      actualDurationMetric: expect.objectContaining({
        value: null,
        availability: 'unavailable',
      }),
    }))
    expect(calculateTaskCompletionDelayStats({
      planned_end_date: '2026-04-05',
      actual_end_date: '2026-04-08',
      status: 'completed',
    }, unidentifiedCalendar, '2026-04-08')).toEqual(expect.objectContaining({
      totalDelayDays: null,
      delayDurationMetric: expect.objectContaining({
        value: null,
        unit: 'construction_production_day',
        availability: 'unavailable',
      }),
    }))
  })

  it('calculates completion delay from the shared signed date-only delta', () => {
    expect(calculateTaskCompletionDelayStats({
      planned_end_date: '2026-04-10',
      actual_end_date: '2026-04-10T23:30:00+08:00',
      status: 'completed',
      progress: 100,
    }, SHUTDOWN_CALENDAR)).toEqual(expect.objectContaining({
      totalDelayDays: 0,
      delayCount: 0,
      delayDetails: [],
      delayDurationMetric: expect.objectContaining({
        value: 0,
        unit: 'construction_production_day',
        availability: 'available',
      }),
    }))

    expect(calculateTaskCompletionDelayStats({
      planned_end_date: '2026-04-10',
      actual_end_date: '2026-04-12T01:00:00+08:00',
      status: 'completed',
      progress: 100,
    }, SHUTDOWN_CALENDAR)).toEqual(expect.objectContaining({
      totalDelayDays: 2,
      delayCount: 1,
      delayDetails: [{
        delay_date: '2026-04-12T01:00:00+08:00',
        delay_days: 2,
        delay_type: 'auto_detected',
        reason: '实际完成时间晚于计划完成时间',
      }],
      delayDurationMetric: expect.objectContaining({ value: 2, availability: 'available' }),
    }))
  })

  it('uses the shared completed-task aliases when actual finish is missing', () => {
    expect(calculateTaskCompletionDelayStats({
      planned_end_date: '2026-04-10',
      actual_end_date: null,
      updated_at: '2026-04-12T01:00:00+08:00',
      status: 'done',
      progress: 0,
    } as never, SHUTDOWN_CALENDAR)).toEqual(expect.objectContaining({
      totalDelayDays: 2,
      delayCount: 1,
      delayDetails: [{
        delay_date: '2026-04-12T01:00:00+08:00',
        delay_days: 2,
        delay_type: 'auto_detected',
        reason: '实际完成时间晚于计划完成时间',
      }],
      delayDurationMetric: expect.objectContaining({ value: 2, availability: 'available' }),
    }))
  })

  it('deducts official construction shutdown windows from completion delay days', () => {
    expect(calculateTaskCompletionDelayStats({
      planned_end_date: '2026-02-10',
      actual_end_date: '2026-03-01',
      status: 'completed',
      progress: 100,
    }, SHUTDOWN_CALENDAR)).toEqual(expect.objectContaining({
      totalDelayDays: 5,
      delayCount: 1,
      delayDetails: [{
        delay_date: '2026-03-01',
        delay_days: 5,
        delay_type: 'auto_detected',
        reason: '实际完成时间晚于计划完成时间',
      }],
      delayDurationMetric: expect.objectContaining({
        value: 5,
        calendarRef: 'work_calendar',
        availability: 'available',
      }),
    }))
  })

  it('uses fixed SQL branches for paginated and unpaginated project summaries', async () => {
    const service = new TaskSummaryService()

    await service.getProjectSummaries('project-1')
    await service.getProjectSummaries('project-1', { limit: 20, offset: 40 })

    const executeSQLCalls = mocks.executeSQL.mock.calls as Array<[string, unknown[]]>

    expect(executeSQLCalls.map(([sql, params]) => [sql, params])).toEqual([
      [
        'SELECT * FROM task_completion_reports WHERE project_id = ? ORDER BY generated_at DESC',
        ['project-1'],
      ],
      [
        'SELECT * FROM task_completion_reports WHERE project_id = ? ORDER BY generated_at DESC LIMIT ? OFFSET ?',
        ['project-1', 20, 40],
      ],
    ])
  })
})
