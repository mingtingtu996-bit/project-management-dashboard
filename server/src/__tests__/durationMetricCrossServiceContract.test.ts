import { describe, expect, it } from 'vitest'

import type { ConstructionCalendarContext } from '../services/constructionCalendar.js'
import { buildScopedDurationForecasts } from '../services/scopedDurationForecastService.js'
import { deriveTaskUnifiedStatus } from '../services/taskStatusDerivationService.js'

const calendar: ConstructionCalendarContext = {
  basis: 'official_construction_calendar_seed',
  windows: [{
    holidayCode: 'shutdown',
    startDate: '2026-07-18',
    endDate: '2026-07-19',
    constructionShutdown: true,
  }],
  calendarRef: 'work_calendar',
  calendarVersion: 'calendar-v1',
  timezone: 'Asia/Shanghai',
  availability: 'available',
  unavailableReason: null,
}

describe('duration metric cross-service contract', () => {
  it('uses calendar days for future due windows and production days for actual overdue', () => {
    const future = deriveTaskUnifiedStatus({
      status: 'pending',
      planned_end_date: '2026-08-19',
    }, {
      currentDate: new Date('2026-07-20T00:00:00.000Z'),
      calendar,
    })
    expect(future.dueStatus.duration).toEqual(expect.objectContaining({
      value: 30,
      unit: 'calendar_day',
      availability: 'available',
    }))

    const overdue = deriveTaskUnifiedStatus({
      status: 'in_progress',
      planned_end_date: '2026-07-16',
    }, {
      currentDate: new Date('2026-07-20T00:00:00.000Z'),
      calendar,
    })
    expect(overdue.dueStatus.duration).toEqual(expect.objectContaining({
      value: -2,
      unit: 'construction_production_day',
      calendarRef: 'work_calendar',
      calendarVersion: 'calendar-v1',
      availability: 'available',
    }))
  })

  it('does not expose an overdue count when production calendar metadata is missing', () => {
    const result = deriveTaskUnifiedStatus({
      status: 'in_progress',
      planned_end_date: '2026-07-16',
    }, {
      currentDate: new Date('2026-07-20T00:00:00.000Z'),
      calendar: { basis: 'calendar_day', windows: [] },
    })

    expect(result.dueStatus.status).toBe('overdue')
    expect(result.dueStatus.duration).toEqual(expect.objectContaining({
      value: null,
      unit: 'construction_production_day',
      availability: 'unavailable',
    }))
    expect(result.dueStatus.daysUntilDue).toBeNull()
    expect(result.dueStatus.label).toBe('已逾期 · 生产日口径不可用')
  })

  it('carries typed production-day metrics across the scoped forecast service', () => {
    const result = buildScopedDurationForecasts({
      projectId: 'project-1',
      asOfDate: '2026-07-20',
      rows: [{
        clientRowId: 'task-1',
        rowKind: 'schedule_row',
        predecessorDependencies: [],
        values: {
          id: 'task-1',
          title: 'Task 1',
          status: 'in_progress',
          progress: 50,
          planned_start_date: '2026-07-01',
          planned_end_date: '2026-07-22',
          duration_contribution_mode: 'duration_bearing',
        },
      } as any],
      forecasts: [{
        taskId: 'task-1',
        forecastFinishDate: '2026-07-24',
        remainingDurationDays: 5,
        forecastDelayDays: 2,
        confidenceLevel: 'high',
        confidenceScore: 0.9,
        probabilityBand: { p20Days: 4, p50Days: 5, p80Days: 6 },
      } as any],
      attributions: new Map([['task-1', {
        divisionId: 'division-1',
        divisionName: 'Division 1',
        divisionSortOrder: 1,
        subdivisionId: 'subdivision-1',
        subdivisionName: 'Subdivision 1',
        subdivisionSortOrder: 1,
        specialtyId: 'specialty-1',
        specialtyName: 'Specialty 1',
        specialtySortOrder: 1,
        specialtySource: 'engineering_category',
        degradationReasons: [],
      }]]),
      criticalTaskIds: new Set(['task-1']),
      constructionCalendar: calendar,
    })

    expect(result.dimensions.division[0]).toEqual(expect.objectContaining({
      remainingDuration: expect.objectContaining({
        unit: 'construction_production_day',
        calendarRef: 'work_calendar',
        calendarVersion: 'calendar-v1',
        asOf: '2026-07-20',
        availability: 'available',
      }),
      targetGap: expect.objectContaining({ unit: 'construction_production_day' }),
      delay: expect.objectContaining({ unit: 'construction_production_day' }),
    }))
  })
})
