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
}

describe('taskSummaryService duration stats', () => {
  beforeEach(() => {
    mocks.executeSQL.mockClear()
    mocks.executeSQLOne.mockClear()
    mocks.executeSQLOne.mockResolvedValue({ cnt: 0 })
    mocks.executeSQL.mockResolvedValue([])
  })

  it('uses planned fields for planned duration and actual fields for actual duration', () => {
    expect(calculateTaskSummaryDurationStats({
      start_date: '2026-04-01',
      end_date: '2026-04-30',
      planned_start_date: '2026-04-03',
      planned_end_date: '2026-04-05',
      actual_start_date: '2026-04-04',
      actual_end_date: '2026-04-08',
    } as never)).toEqual({
      plannedDuration: 3,
      actualDuration: 5,
    })
  })

  it('falls back to planned duration when actual execution window is incomplete', () => {
    expect(calculateTaskSummaryDurationStats({
      planned_start_date: '2026-04-03',
      planned_end_date: '2026-04-05',
      actual_start_date: '2026-04-04',
      actual_end_date: null,
    } as never)).toEqual({
      plannedDuration: 3,
      actualDuration: 3,
    })
  })

  it('keeps same-day tasks as one inclusive day', () => {
    expect(calculateTaskSummaryDurationStats({
      planned_start_date: '2026-04-03',
      planned_end_date: '2026-04-03',
      actual_start_date: '2026-04-03',
      actual_end_date: '2026-04-03',
    } as never)).toEqual({
      plannedDuration: 1,
      actualDuration: 1,
    })
  })

  it('calculates completion delay from the shared signed date-only delta', () => {
    expect(calculateTaskCompletionDelayStats({
      planned_end_date: '2026-04-10',
      actual_end_date: '2026-04-10T23:30:00+08:00',
      status: 'completed',
      progress: 100,
    })).toEqual({ totalDelayDays: 0, delayCount: 0, delayDetails: [] })

    expect(calculateTaskCompletionDelayStats({
      planned_end_date: '2026-04-10',
      actual_end_date: '2026-04-12T01:00:00+08:00',
      status: 'completed',
      progress: 100,
    })).toEqual({
      totalDelayDays: 2,
      delayCount: 1,
      delayDetails: [{
        delay_date: '2026-04-12T01:00:00+08:00',
        delay_days: 2,
        delay_type: 'auto_detected',
        reason: '实际完成时间晚于计划完成时间',
      }],
    })
  })

  it('deducts official construction shutdown windows from completion delay days', () => {
    expect(calculateTaskCompletionDelayStats({
      planned_end_date: '2026-02-10',
      actual_end_date: '2026-03-01',
      status: 'completed',
      progress: 100,
    }, SHUTDOWN_CALENDAR)).toEqual({
      totalDelayDays: 5,
      delayCount: 1,
      delayDetails: [{
        delay_date: '2026-03-01',
        delay_days: 5,
        delay_type: 'auto_detected',
        reason: '实际完成时间晚于计划完成时间',
      }],
    })
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
