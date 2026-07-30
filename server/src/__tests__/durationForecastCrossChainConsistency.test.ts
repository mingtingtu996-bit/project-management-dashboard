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

const unavailableCalendar: ConstructionCalendarContext = {
  basis: 'calendar_day',
  windows: [],
  calendarRef: null,
  calendarVersion: null,
  timezone: 'Asia/Shanghai',
  availability: 'unavailable',
  unavailableReason: 'construction_calendar_identity_missing',
}

function buildScheduleRow(): ScheduleAccelerationRow {
  return {
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
      remaining_duration_days: 999,
      forecast_finish_date: '2026-07-20',
      forecast_p20_finish_date: '2026-07-17',
      forecast_p80_finish_date: '2026-07-24',
    },
  }
}

type DurationMetricPatch = Partial<TaskDurationForecast['remainingDuration']>

function buildProductionDurationMetric(value: number | null, patch: DurationMetricPatch = {}) {
  return {
    value,
    unit: 'construction_production_day' as const,
    calendarRef: 'work_calendar',
    calendarVersion: 'calendar-v1',
    timezone: 'Asia/Shanghai',
    asOf: '2026-07-13',
    availability: 'available' as const,
    unavailableReason: null,
    ...patch,
  }
}

function buildTaskForecast(metricPatch: DurationMetricPatch = {}): TaskDurationForecast {
  const metricValue = metricPatch.availability === 'unavailable' ? null : 8
  return {
    taskId: 'task-1',
    recommendedDurationDays: 999,
    conservativeDurationDays: 999,
    remainingDurationDays: 999,
    remainingDuration: buildProductionDurationMetric(metricValue, metricPatch),
    forecastFinishDate: '2026-07-20',
    forecastDelay: buildProductionDurationMetric(1, metricPatch),
    forecastDelayDays: 999,
    confidenceLevel: 'high',
    confidenceScore: 90,
    forecastSource: 'test',
    businessReason: null,
    probabilityDuration: {
      method: 'pert_from_existing_percentiles',
      source: 'test',
      p20RemainingDays: 999,
      p50RemainingDays: 999,
      p80RemainingDays: 999,
      expectedRemainingDays: 999,
      variance: null,
      standardDeviationDays: null,
      confidenceBandWidthDays: 999,
    },
    probabilityDurationMetrics: {
      p20RemainingDuration: buildProductionDurationMetric(
        metricPatch.availability === 'unavailable' ? null : 5,
        metricPatch,
      ),
      p50RemainingDuration: buildProductionDurationMetric(metricValue, metricPatch),
      p80RemainingDuration: buildProductionDurationMetric(
        metricPatch.availability === 'unavailable' ? null : 12,
        metricPatch,
      ),
    },
  }
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
        remaining_duration: buildProductionDurationMetric(8),
        forecast_finish_date: '2026-07-20',
        forecast_p20_finish_date: '2026-07-17',
        forecast_p80_finish_date: '2026-07-24',
        probability_duration_metrics: {
          p20RemainingDuration: buildProductionDurationMetric(5),
          p50RemainingDuration: buildProductionDurationMetric(8),
          p80RemainingDuration: buildProductionDurationMetric(12),
        },
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

  it.each([
    ['typed metric unavailable', { availability: 'unavailable', unavailableReason: 'duration_value_missing' }],
    ['as-of mismatch', { asOf: '2026-07-12' }],
    ['calendar ref mismatch', { calendarRef: 'other_calendar' }],
    ['calendar version mismatch', { calendarVersion: 'calendar-v0' }],
    ['timezone mismatch', { timezone: 'UTC' }],
  ] satisfies Array<[string, DurationMetricPatch]>)('fails closed when the task forecast has %s', (_label, metricPatch) => {
    const scoped = buildScopedDurationForecasts({
      projectId: 'project-1',
      asOfDate: '2026-07-13',
      rows: [buildScheduleRow()],
      forecasts: [buildTaskForecast(metricPatch)],
      attributions: new Map([['task-1', taskAttribution]]),
      criticalTaskIds: new Set(['task-1']),
      constructionCalendar: calendar,
    })

    const division = scoped.dimensions.division[0]
    expect(division.forecastCoverageRate).toBe(0)
    expect(division.probabilityCoverageRate).toBe(0)
    expect(division.p20FinishDate).toBe('2026-07-19')
    expect(division.p50FinishDate).toBe('2026-07-19')
    expect(division.p80FinishDate).toBe('2026-07-19')
    expect(division.remainingDurationDays).not.toBe(999)
    expect(division.networkProbability?.p50RemainingDays).toBeNull()
    expect(division.dataStatus).toBe('degraded')
    expect(division.degradationReasons).toEqual(expect.arrayContaining([
      'planned_finish_fallback',
      'missing_probability_window',
    ]))
  })

  it('keeps scoped and project production-day facts unavailable without an authoritative calendar', () => {
    const scheduleRow = buildScheduleRow()
    const scoped = buildScopedDurationForecasts({
      projectId: 'project-1',
      asOfDate: '2026-07-13',
      rows: [scheduleRow],
      forecasts: [buildTaskForecast()],
      attributions: new Map([['task-1', taskAttribution]]),
      criticalTaskIds: new Set(['task-1']),
      constructionCalendar: unavailableCalendar,
    })
    const project = buildProjectRemainingDurationForecast({
      projectId: 'project-1',
      asOfDate: '2026-07-13',
      rows: [scheduleRow],
      constructionCalendar: unavailableCalendar,
    })

    const division = scoped.dimensions.division[0]
    expect(division.forecastCoverageRate).toBe(0)
    expect(division.probabilityCoverageRate).toBe(0)
    expect(division.remainingDuration).toEqual(expect.objectContaining({
      value: null,
      availability: 'unavailable',
      unit: 'construction_production_day',
    }))
    expect(division.remainingDurationDays).toBeNull()
    expect(division.delayDays).toBeNull()
    expect(division.networkProbability?.p20RemainingDays).toBeNull()
    expect(division.networkProbability?.p50RemainingDays).toBeNull()
    expect(division.networkProbability?.p80RemainingDays).toBeNull()
    expect(project.projectRemainingForecast).toEqual(expect.objectContaining({
      value: null,
      availability: 'unavailable',
      unit: 'construction_production_day',
    }))
    expect(project.projectRemainingForecastDays).toBeNull()
    expect(project.targetGapDays).toBeNull()
    expect(project.forecastFinishDate).toBeNull()
  })
})
