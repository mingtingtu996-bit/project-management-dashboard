import { describe, expect, it } from 'vitest'

import type { ConstructionCalendarContext } from '../services/constructionCalendar.js'
import { buildProjectRemainingDurationForecast } from '../services/projectRemainingDurationForecastService.js'
import type { ScheduleAccelerationRow } from '../services/scheduleAccelerationService.js'
import { buildScopedDurationForecasts } from '../services/scopedDurationForecastService.js'
import type { ProjectTaskAttribution } from '../services/taskAttributionProjectionService.js'
import type { TaskDurationForecast } from '../services/taskDurationForecastService.js'

const calendar: ConstructionCalendarContext = {
  basis: 'official_construction_calendar_seed',
  windows: [],
  calendarRef: 'work_calendar',
  calendarVersion: 'calendar-v1',
  timezone: 'Asia/Shanghai',
  availability: 'available',
  unavailableReason: null,
}

describe('duration forecast cross-chain consistency', () => {
  it('keeps a single-division P50 aligned with project deterministic P50 and explains the risk-band adjustment', () => {
    const scheduleRow: ScheduleAccelerationRow = {
      clientRowId: 'task-1',
      rowProjectionMode: 'schedule_row',
      predecessorDependencies: [],
      values: {
        project_id: 'project-1',
        title: 'Single critical task',
        status: 'in_progress',
        progress: 20,
        planned_end_date: '2026-07-19',
        duration_contribution_mode: 'duration_bearing',
        row_projection_mode: 'schedule_row',
        is_milestone: false,
        is_critical: true,
        total_float_days: 0,
        remaining_duration_days: 8,
        forecast_finish_date: '2026-07-20',
        forecast_p20_finish_date: '2026-07-17',
        forecast_p80_finish_date: '2026-07-24',
      },
    }
    const taskForecast: TaskDurationForecast = {
      taskId: 'task-1',
      recommendedDurationDays: 8,
      conservativeDurationDays: 12,
      remainingDurationDays: 8,
      remainingDuration: {
        value: 8,
        unit: 'construction_production_day',
        calendarRef: 'work_calendar',
        calendarVersion: 'calendar-v1',
        timezone: 'Asia/Shanghai',
        asOf: '2026-07-13',
        availability: 'available',
        unavailableReason: null,
      },
      forecastFinishDate: '2026-07-20',
      forecastDelay: {
        value: 1,
        unit: 'construction_production_day',
        calendarRef: 'work_calendar',
        calendarVersion: 'calendar-v1',
        timezone: 'Asia/Shanghai',
        asOf: '2026-07-13',
        availability: 'available',
        unavailableReason: null,
      },
      forecastDelayDays: 1,
      confidenceLevel: 'high',
      confidenceScore: 90,
      forecastSource: 'test',
      businessReason: null,
      probabilityDuration: {
        method: 'pert_from_existing_percentiles',
        source: 'test',
        p20RemainingDays: 5,
        p50RemainingDays: 8,
        p80RemainingDays: 12,
        expectedRemainingDays: 8,
        variance: null,
        standardDeviationDays: null,
        confidenceBandWidthDays: 7,
      },
      probabilityDurationMetrics: {
        p20RemainingDuration: {
          value: 5,
          unit: 'construction_production_day',
          calendarRef: 'work_calendar',
          calendarVersion: 'calendar-v1',
          timezone: 'Asia/Shanghai',
          asOf: '2026-07-13',
          availability: 'available',
          unavailableReason: null,
        },
        p50RemainingDuration: {
          value: 8,
          unit: 'construction_production_day',
          calendarRef: 'work_calendar',
          calendarVersion: 'calendar-v1',
          timezone: 'Asia/Shanghai',
          asOf: '2026-07-13',
          availability: 'available',
          unavailableReason: null,
        },
        p80RemainingDuration: {
          value: 12,
          unit: 'construction_production_day',
          calendarRef: 'work_calendar',
          calendarVersion: 'calendar-v1',
          timezone: 'Asia/Shanghai',
          asOf: '2026-07-13',
          availability: 'available',
          unavailableReason: null,
        },
      },
    }
    const taskAttribution: ProjectTaskAttribution = {
      divisionId: 'division-1',
      divisionName: 'Structure',
      divisionSortOrder: 1,
      subdivisionId: 'subdivision-1',
      subdivisionName: 'Concrete',
      subdivisionSortOrder: 1,
      specialtyId: 'specialty-1',
      specialtyName: 'Civil',
      specialtySortOrder: 1,
      specialtySource: 'engineering_category',
      degradationReasons: [],
    }

    const scoped = buildScopedDurationForecasts({
      projectId: 'project-1',
      asOfDate: '2026-07-13',
      rows: [scheduleRow],
      forecasts: [taskForecast],
      attributions: new Map([['task-1', taskAttribution]]),
      criticalTaskIds: new Set(['task-1']),
      constructionCalendar: calendar,
    })
    const project = buildProjectRemainingDurationForecast({
      projectId: 'project-1',
      asOfDate: '2026-07-13',
      rows: [scheduleRow],
      constructionCalendar: calendar,
    })

    const division = scoped.dimensions.division[0]
    expect(division.p50FinishDate).toBe('2026-07-20')
    expect(project.calculationContext.criticalPath.latestCriticalFinishDate).toBe(division.p50FinishDate)
    expect(project.calculationContext.criticalPath.confidenceBandDecision).toEqual(expect.objectContaining({
      governingFinishSource: 'confidence_band',
      governingFinishDate: division.p80FinishDate,
      mergeBiasApplied: false,
    }))
    expect(project.forecastFinishDate).toBe(division.p80FinishDate)
    expect(project.projectRemainingForecastDays).toBeGreaterThan(division.remainingDurationDays ?? 0)
  })
})
