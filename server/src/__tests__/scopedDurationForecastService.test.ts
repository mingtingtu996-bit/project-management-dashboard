import { describe, expect, it } from 'vitest'

import type { ScheduleAccelerationRow } from '../services/scheduleAccelerationService.js'
import type { ConstructionCalendarContext } from '../services/constructionCalendar.js'
import {
  buildScopedDurationForecasts,
} from '../services/scopedDurationForecastService.js'
import {
  buildProjectTaskAttributionProjection,
  type ProjectTaskAttribution,
} from '../services/taskAttributionProjectionService.js'
import type { TaskDurationForecast } from '../services/taskDurationForecastService.js'

function row(
  id: string,
  values: Record<string, unknown> = {},
  predecessorDependencies: ScheduleAccelerationRow['predecessorDependencies'] = [],
): ScheduleAccelerationRow {
  return {
    clientRowId: id,
    rowProjectionMode: 'schedule_row',
    predecessorDependencies,
    values: {
      title: id,
      status: 'pending',
      progress: 0,
      planned_end_date: null,
      actual_end_date: null,
      duration_contribution_mode: 'duration_bearing',
      row_projection_mode: 'schedule_row',
      is_milestone: false,
      ...values,
    },
  }
}

function attribution(overrides: Partial<ProjectTaskAttribution> = {}): ProjectTaskAttribution {
  return {
    divisionId: 'd1',
    divisionName: 'Structure',
    divisionSortOrder: 1,
    subdivisionId: 'sd1',
    subdivisionName: 'Concrete',
    subdivisionSortOrder: 1,
    specialtyId: 'sp1',
    specialtyName: 'Civil',
    specialtySortOrder: 1,
    specialtySource: 'engineering_category',
    degradationReasons: [],
    ...overrides,
  }
}

function forecast(
  taskId: string,
  finishDate: string,
  probability: [number, number, number] | null = [5, 8, 12],
  confidenceLevel = 'high',
  confidenceScore = 90,
): TaskDurationForecast {
  const durationMetric = (value: number | null) => ({
    value,
    unit: 'construction_production_day' as const,
    calendarRef: 'work_calendar',
    calendarVersion: 'calendar-v1',
    timezone: 'Asia/Shanghai',
    asOf: '2026-07-13',
    availability: value === null ? 'unavailable' as const : 'available' as const,
    unavailableReason: value === null ? 'duration_value_missing' : null,
  })
  return {
    taskId,
    recommendedDurationDays: probability?.[1] ?? null,
    conservativeDurationDays: probability?.[2] ?? null,
    remainingDurationDays: probability?.[1] ?? null,
    remainingDuration: {
      value: probability?.[1] ?? null,
      unit: 'construction_production_day',
      calendarRef: 'work_calendar',
      calendarVersion: 'calendar-v1',
      timezone: 'Asia/Shanghai',
      asOf: '2026-07-13',
      availability: probability ? 'available' : 'unavailable',
      unavailableReason: probability ? null : 'duration_value_missing',
    },
    forecastFinishDate: finishDate,
    forecastDelay: durationMetric(probability ? 0 : null),
    forecastDelayDays: 0,
    confidenceLevel,
    confidenceScore,
    forecastSource: 'test',
    businessReason: null,
    probabilityDuration: probability
      ? {
          method: 'pert_from_existing_percentiles',
          source: 'test',
          p20RemainingDays: probability[0],
          p50RemainingDays: probability[1],
          p80RemainingDays: probability[2],
          expectedRemainingDays: probability[1],
          variance: null,
          standardDeviationDays: null,
          confidenceBandWidthDays: probability[2] - probability[0],
        }
      : null,
    probabilityDurationMetrics: {
      p20RemainingDuration: durationMetric(probability?.[0] ?? null),
      p50RemainingDuration: durationMetric(probability?.[1] ?? null),
      p80RemainingDuration: durationMetric(probability?.[2] ?? null),
    },
  }
}

const calendar: ConstructionCalendarContext = {
  basis: 'official_construction_calendar_seed',
  windows: [],
  calendarRef: 'work_calendar',
  calendarVersion: 'calendar-v1',
  timezone: 'Asia/Shanghai',
  availability: 'available',
  unavailableReason: null,
}

describe('scopedDurationForecastService', () => {
  it('uses the latest constrained finish for every dimension and governing-task confidence only', () => {
    const rows = [
      row('task-a', { planned_end_date: '2026-07-19' }),
      row('task-b', { planned_end_date: '2026-07-17' }),
    ]
    const attributions = new Map([
      ['task-a', attribution()],
      ['task-b', attribution()],
    ])

    const result = buildScopedDurationForecasts({
      projectId: 'project-1',
      asOfDate: '2026-07-13',
      rows,
      forecasts: [
        forecast('task-a', '2026-07-20', [5, 8, 12], 'high', 92),
        forecast('task-b', '2026-07-18', [4, 6, 8], 'low', 35),
      ],
      attributions,
      criticalTaskIds: new Set(['task-b']),
      constructionCalendar: calendar,
    })

    expect(result.dimensions.division).toHaveLength(1)
    expect(result.dimensions.division[0]).toEqual(expect.objectContaining({
      id: 'division-d1',
      sourceId: 'd1',
      taskCount: 2,
      criticalTaskCount: 1,
      targetFinishDate: '2026-07-19',
      p20FinishDate: '2026-07-17',
      p50FinishDate: '2026-07-20',
      p80FinishDate: '2026-07-24',
      expectedFinishDate: '2026-07-20',
      remainingDurationDays: 8,
      targetGapDays: 1,
      delayDays: 1,
      confidenceLevel: 'high',
      confidenceScore: 92,
      forecastCoverageRate: 1,
      probabilityCoverageRate: 1,
      dataStatus: 'ready',
      governingTaskIds: ['task-a'],
    }))
    expect(result.dimensions.subdivision[0].id).toBe('subdivision-sd1')
    expect(result.dimensions.specialty[0].id).toBe('specialty-sp1')
    expect(result.summary).toEqual({
      groupCount: 3,
      readyCount: 3,
      degradedCount: 0,
      insufficientDataCount: 0,
    })
  })

  it('keeps target gap in Gregorian days while reporting delay in construction production days', () => {
    const shutdownCalendar: ConstructionCalendarContext = {
      ...calendar,
      windows: [{
        holidayCode: 'site_shutdown',
        startDate: '2026-07-19',
        endDate: '2026-07-21',
        counts_as_construction_shutdown: true,
      }],
    }
    const result = buildScopedDurationForecasts({
      projectId: 'project-1',
      asOfDate: '2026-07-13',
      rows: [row('task-cross-shutdown', { planned_end_date: '2026-07-18' })],
      forecasts: [forecast('task-cross-shutdown', '2026-07-22', [5, 8, 12])],
      attributions: new Map([['task-cross-shutdown', attribution()]]),
      criticalTaskIds: new Set(),
      constructionCalendar: shutdownCalendar,
    }).dimensions.division[0]

    expect(result.targetGap).toMatchObject({
      value: 4,
      unit: 'calendar_day',
      calendarRef: 'gregorian',
      calendarVersion: 'ISO-8601',
      availability: 'available',
    })
    expect(result.delay).toMatchObject({
      value: 1,
      unit: 'construction_production_day',
      calendarRef: 'work_calendar',
      calendarVersion: 'calendar-v1',
      availability: 'available',
    })
    expect(result.targetGapDays).toBe(4)
    expect(result.delayDays).toBe(1)
  })

  it('keeps Gregorian target gap available but fails production-day delay closed without calendar identity', () => {
    const result = buildScopedDurationForecasts({
      projectId: 'project-1',
      asOfDate: '2026-07-13',
      rows: [row('task-missing-calendar', { planned_end_date: '2026-07-18' })],
      forecasts: [forecast('task-missing-calendar', '2026-07-22', [5, 8, 12])],
      attributions: new Map([['task-missing-calendar', attribution()]]),
      criticalTaskIds: new Set(),
      constructionCalendar: {
        basis: 'calendar_day',
        windows: [],
        calendarRef: null,
        calendarVersion: null,
        timezone: 'Asia/Shanghai',
        availability: 'unavailable',
        unavailableReason: 'construction_calendar_identity_missing',
      },
    }).dimensions.division[0]

    expect(result.targetGap).toMatchObject({
      value: 4,
      unit: 'calendar_day',
      availability: 'available',
    })
    expect(result.delay).toMatchObject({
      value: null,
      unit: 'construction_production_day',
      availability: 'unavailable',
      unavailableReason: 'construction_calendar_identity_missing',
    })
    expect(result.targetGapDays).toBe(4)
    expect(result.delayDays).toBeNull()
  })

  it('does not use legacy probability values when typed probability metrics are unavailable', () => {
    const first = forecast('first', '2026-07-17', [4, 5, 7])
    const second = forecast('second', '2026-07-22', [4, 5, 7])
    for (const item of [first, second]) {
      item.probabilityDurationMetrics = {
        p20RemainingDuration: {
          ...item.probabilityDurationMetrics.p20RemainingDuration,
          value: null,
          availability: 'unavailable',
          unavailableReason: 'construction_calendar_identity_missing',
        },
        p50RemainingDuration: {
          ...item.probabilityDurationMetrics.p50RemainingDuration,
          value: null,
          availability: 'unavailable',
          unavailableReason: 'construction_calendar_identity_missing',
        },
        p80RemainingDuration: {
          ...item.probabilityDurationMetrics.p80RemainingDuration,
          value: null,
          availability: 'unavailable',
          unavailableReason: 'construction_calendar_identity_missing',
        },
      }
    }

    const result = buildScopedDurationForecasts({
      projectId: 'project-1',
      asOfDate: '2026-07-13',
      simulationSeed: 'typed-probability-unavailable',
      rows: [
        row('first', { planned_start_date: '2026-07-13', planned_end_date: '2026-07-17' }),
        row('second', { planned_start_date: '2026-07-18', planned_end_date: '2026-07-22' }, [
          { clientRowId: 'first', dependencyType: 'FS', lagDays: 0 },
        ]),
      ],
      forecasts: [first, second],
      attributions: new Map([
        ['first', attribution()],
        ['second', attribution()],
      ]),
      criticalTaskIds: new Set(['first', 'second']),
      constructionCalendar: calendar,
    }).dimensions.division[0]

    expect(result.probabilityCoverageRate).toBe(0)
    expect(result.probabilityBasis).not.toBe('monte_carlo')
    expect(result.networkProbability).toEqual(expect.objectContaining({
      probabilityBasis: 'pert_analytic',
      p20RemainingDays: null,
      p50RemainingDays: null,
      p80RemainingDays: null,
    }))
    expect(result.degradationReasons).toContain('missing_probability_window')
  })

  it('uses the same correlated Monte Carlo basis for a dependency-backed scoped network', () => {
    const rows = [
      row('a1', { planned_start_date: '2026-07-13', planned_end_date: '2026-07-22' }),
      row('a2', { planned_start_date: '2026-07-23', planned_end_date: '2026-08-01' }, [
        { clientRowId: 'a1', dependencyType: 'FS', lagDays: 0 },
      ]),
      row('b1', { planned_start_date: '2026-07-13', planned_end_date: '2026-07-22' }),
      row('b2', { planned_start_date: '2026-07-23', planned_end_date: '2026-08-01' }, [
        { clientRowId: 'b1', dependencyType: 'FS', lagDays: 0 },
      ]),
    ]
    const result = buildScopedDurationForecasts({
      projectId: 'project-1',
      asOfDate: '2026-07-13',
      rows,
      forecasts: rows.map((item) => forecast(item.clientRowId, '2026-07-22', [8, 10, 15])),
      attributions: new Map(rows.map((item) => [item.clientRowId, attribution()])),
      criticalTaskIds: new Set(['a1', 'a2', 'b1', 'b2']),
      constructionCalendar: calendar,
    })

    const division = result.dimensions.division[0]
    expect(division.probabilityBasis).toBe('monte_carlo')
    expect(division.networkProbability).toEqual(expect.objectContaining({
      probabilityBasis: 'monte_carlo',
      simulationCount: 1000,
      taskCount: 4,
      dependencyCount: 2,
    }))
    expect(division.p80FinishDate).toBe(division.networkProbability?.p80FinishDate)
    expect(division.p80FinishDate).not.toBe(division.p50FinishDate)
  })

  it('returns the authoritative network target-date contract for an arbitrary target date', () => {
    const rows = [
      row('first', { planned_start_date: '2026-07-13', planned_end_date: '2026-07-17' }),
      row('second', { planned_start_date: '2026-07-18', planned_end_date: '2026-07-22' }, [
        { clientRowId: 'first', dependencyType: 'FS', lagDays: 0 },
      ]),
    ]
    const common = {
      projectId: 'project-1',
      asOfDate: '2026-07-13',
      rows,
      forecasts: rows.map((item) => forecast(item.clientRowId, '2026-07-22', [5, 5, 5])),
      attributions: new Map(rows.map((item) => [item.clientRowId, attribution()])),
      criticalTaskIds: new Set(['first', 'second']),
      constructionCalendar: calendar,
    }

    const immediate = buildScopedDurationForecasts({
      ...common,
      targetDate: '2026-07-13',
      simulationSeed: 'target-date-seed-1',
    } as any).dimensions.division[0] as any
    const later = buildScopedDurationForecasts({
      ...common,
      targetDate: '2026-12-31',
      simulationSeed: 'target-date-seed-1',
    } as any).dimensions.division[0] as any

    expect(immediate.targetDateCompletion).toEqual(expect.objectContaining({
      targetDate: '2026-07-13',
      availability: 'available',
      unavailableReason: null,
      completionProbability: 0,
      probabilityBasis: 'monte_carlo',
      sampleCount: 1000,
      confidenceInterval: expect.objectContaining({
        confidenceLevel: 0.95,
        lowerProbability: 0,
        upperProbability: expect.any(Number),
        method: 'wilson_score',
      }),
      governingTaskIds: ['first', 'second'],
      analyticAdvisory: null,
      targetDuration: expect.objectContaining({
        unit: 'construction_production_day',
        availability: 'available',
      }),
    }))
    expect(later.targetDateCompletion).toEqual(expect.objectContaining({
      targetDate: '2026-12-31',
      availability: 'available',
      unavailableReason: null,
      completionProbability: 1,
      probabilityBasis: 'monte_carlo',
      sampleCount: 1000,
      confidenceInterval: expect.objectContaining({
        confidenceLevel: 0.95,
        lowerProbability: expect.any(Number),
        upperProbability: 1,
        method: 'wilson_score',
      }),
      governingTaskIds: ['first', 'second'],
      analyticAdvisory: null,
    }))
  })

  it('is deterministic for a fixed simulation seed and consumes that seed', () => {
    const rows = [
      row('first', { planned_start_date: '2026-07-13', planned_end_date: '2026-07-20' }),
      row('second', { planned_start_date: '2026-07-21', planned_end_date: '2026-07-31' }, [
        { clientRowId: 'first', dependencyType: 'FS', lagDays: 0 },
      ]),
    ]
    const common = {
      projectId: 'project-1',
      asOfDate: '2026-07-13',
      targetDate: '2026-08-03',
      rows,
      forecasts: rows.map((item) => forecast(item.clientRowId, '2026-07-31', [4, 8, 16])),
      attributions: new Map(rows.map((item) => [item.clientRowId, attribution()])),
      criticalTaskIds: new Set(['first', 'second']),
      constructionCalendar: calendar,
    }

    const first = buildScopedDurationForecasts({
      ...common,
      simulationSeed: 'fixed-seed-a',
    } as any).dimensions.division[0] as any
    const repeated = buildScopedDurationForecasts({
      ...common,
      simulationSeed: 'fixed-seed-a',
    } as any).dimensions.division[0] as any
    const otherSeed = buildScopedDurationForecasts({
      ...common,
      simulationSeed: 'fixed-seed-b',
    } as any).dimensions.division[0] as any

    expect(repeated.targetDateCompletion).toEqual(first.targetDateCompletion)
    expect(repeated.networkProbability.inputHash).toBe(first.networkProbability.inputHash)
    expect(otherSeed.networkProbability.inputHash).not.toBe(first.networkProbability.inputHash)
    expect(first.targetDateCompletion.confidenceInterval.lowerProbability)
      .toBeLessThanOrEqual(first.targetDateCompletion.completionProbability)
    expect(first.targetDateCompletion.confidenceInterval.upperProbability)
      .toBeGreaterThanOrEqual(first.targetDateCompletion.completionProbability)
  })

  it('fails the authoritative result closed and labels the task-only estimate as advisory', () => {
    const rows = [
      row('first', { planned_end_date: '2026-07-20' }),
      row('second', { planned_end_date: '2026-07-22' }),
    ]

    const result = buildScopedDurationForecasts({
      projectId: 'project-1',
      asOfDate: '2026-07-13',
      targetDate: '2026-07-21',
      simulationSeed: 'network-unavailable-seed',
      rows,
      forecasts: [
        forecast('first', '2026-07-20', [5, 8, 12]),
        forecast('second', '2026-07-22', [6, 10, 14]),
      ],
      attributions: new Map(rows.map((item) => [item.clientRowId, attribution()])),
      criticalTaskIds: new Set(),
      constructionCalendar: calendar,
    } as any).dimensions.division[0] as any

    expect(result.targetDateCompletion).toEqual(expect.objectContaining({
      availability: 'unavailable',
      unavailableReason: 'network_probability_unavailable',
      completionProbability: null,
      confidenceInterval: null,
      probabilityBasis: 'unavailable',
      sampleCount: 0,
      governingTaskIds: [],
      reasonCodes: expect.arrayContaining([
        'dependency_network_missing',
        'network_probability_unavailable',
      ]),
      analyticAdvisory: expect.objectContaining({
        completionProbability: expect.any(Number),
        probabilityBasis: 'pert_analytic',
        governingTaskIds: expect.arrayContaining(['second']),
      }),
    }))
  })

  it.each([
    [undefined, 'simulation_seed_missing'],
    ['contains spaces', 'simulation_seed_invalid'],
  ])('fails target-date probability closed for simulation seed %s', (simulationSeed, reasonCode) => {
    const rows = [
      row('first', { planned_end_date: '2026-07-20' }),
      row('second', { planned_end_date: '2026-07-22' }, [
        { clientRowId: 'first', dependencyType: 'FS', lagDays: 0 },
      ]),
    ]
    const result = buildScopedDurationForecasts({
      projectId: 'project-1',
      asOfDate: '2026-07-13',
      targetDate: '2026-07-21',
      simulationSeed,
      rows,
      forecasts: rows.map((item) => forecast(item.clientRowId, '2026-07-22')),
      attributions: new Map(rows.map((item) => [item.clientRowId, attribution()])),
      criticalTaskIds: new Set(),
      constructionCalendar: calendar,
    } as any).dimensions.division[0] as any

    expect(result.targetDateCompletion).toEqual(expect.objectContaining({
      availability: 'unavailable',
      unavailableReason: reasonCode,
      completionProbability: null,
      confidenceInterval: null,
      probabilityBasis: 'unavailable',
      sampleCount: 0,
      governingTaskIds: [],
      reasonCodes: expect.arrayContaining([reasonCode]),
      analyticAdvisory: null,
    }))
  })

  it('fails target-date probability closed when required dependency evidence is unavailable', () => {
    const rows = [
      row('first', { planned_end_date: '2026-07-20' }),
      row('second', { planned_end_date: '2026-07-22' }, [
        { clientRowId: 'first', dependencyType: 'FS', lagDays: 0 },
      ]),
    ]
    const result = buildScopedDurationForecasts({
      projectId: 'project-1',
      asOfDate: '2026-07-13',
      targetDate: '2026-07-21',
      simulationSeed: 'dependency-evidence-seed',
      rows,
      forecasts: rows.map((item) => forecast(item.clientRowId, '2026-07-22')),
      attributions: new Map(rows.map((item) => [item.clientRowId, attribution()])),
      criticalTaskIds: new Set(),
      constructionCalendar: calendar,
      globalDegradationReasons: ['task_dependencies_unavailable'],
    } as any).dimensions.division[0] as any

    expect(result.networkProbability.probabilityBasis).toBe('monte_carlo')
    expect(result.targetDateCompletion).toEqual(expect.objectContaining({
      availability: 'unavailable',
      completionProbability: null,
      probabilityBasis: 'unavailable',
      governingTaskIds: [],
      reasonCodes: expect.arrayContaining([
        'task_dependencies_unavailable',
        'network_probability_unavailable',
      ]),
      analyticAdvisory: {
        completionProbability: 0.4,
        probabilityBasis: 'pert_analytic',
        governingTaskIds: ['first', 'second'],
      },
    }))
  })

  it('fails target-date probability closed without authoritative calendar identity', () => {
    const result = buildScopedDurationForecasts({
      projectId: 'project-1',
      asOfDate: '2026-07-13',
      targetDate: '2026-07-31',
      simulationSeed: 'calendar-authority-seed',
      rows: [row('task-1', { planned_end_date: '2026-07-20' })],
      forecasts: [forecast('task-1', '2026-07-20')],
      attributions: new Map([['task-1', attribution()]]),
      criticalTaskIds: new Set(),
      constructionCalendar: {
        basis: 'calendar_day', windows: [], calendarRef: null, calendarVersion: null,
        timezone: 'Asia/Shanghai', availability: 'unavailable', unavailableReason: 'calendar_identity_missing',
      },
    } as any).dimensions.division[0] as any

    expect(result.targetDateCompletion).toEqual(expect.objectContaining({
      targetDate: '2026-07-31',
      availability: 'unavailable',
      unavailableReason: 'construction_calendar_identity_missing',
      completionProbability: null,
      confidenceInterval: null,
      probabilityBasis: 'unavailable',
      governingTaskIds: [],
      analyticAdvisory: null,
      reasonCodes: expect.arrayContaining(['construction_calendar_identity_missing']),
      targetDuration: expect.objectContaining({ availability: 'unavailable', value: null }),
    }))
  })

  it('does not count a future task release offset twice in scoped Monte Carlo', () => {
    const rows = [
      row('first', {
        planned_start_date: '2026-07-13',
        planned_end_date: '2026-07-17',
      }),
      row('second', {
        planned_start_date: '2026-07-18',
        planned_end_date: '2026-07-22',
      }, [
        { clientRowId: 'first', dependencyType: 'FS', lagDays: 0 },
      ]),
    ]

    const result = buildScopedDurationForecasts({
      projectId: 'project-1',
      asOfDate: '2026-07-13',
      rows,
      forecasts: [
        forecast('first', '2026-07-17', [5, 5, 5]),
        forecast('second', '2026-07-22', [5, 5, 5]),
      ],
      attributions: new Map(rows.map((item) => [item.clientRowId, attribution()])),
      criticalTaskIds: new Set(['first', 'second']),
      constructionCalendar: calendar,
    })

    const division = result.dimensions.division[0]
    expect(division.probabilityBasis).toBe('monte_carlo')
    expect(division.networkProbability).toEqual(expect.objectContaining({
      p50RemainingDays: 10,
      p50FinishDate: '2026-07-22',
    }))
  })

  it('walks probability bands across shutdown days and orders an inverted band', () => {
    const result = buildScopedDurationForecasts({
      projectId: 'project-1',
      asOfDate: '2026-07-13',
      rows: [row('task-a', { planned_end_date: '2026-07-22' })],
      forecasts: [forecast('task-a', '2026-07-22', [10, 7, 3])],
      attributions: new Map([['task-a', attribution()]]),
      criticalTaskIds: new Set(),
      constructionCalendar: {
        basis: 'official_construction_calendar_seed',
        windows: [{
          calendar_kind: 'winter_shutdown',
          start_date: '2026-07-18',
          end_date: '2026-07-20',
        }],
        calendarRef: 'work_calendar',
        calendarVersion: 'calendar-v1',
        timezone: 'Asia/Shanghai',
        availability: 'available',
        unavailableReason: null,
      },
    })

    expect(result.dimensions.division[0]).toEqual(expect.objectContaining({
      p20FinishDate: '2026-07-15',
      p50FinishDate: '2026-07-22',
      p80FinishDate: '2026-07-25',
      remainingDurationDays: 7,
      dataStatus: 'degraded',
      degradationReasons: expect.arrayContaining(['duration_band_reordered']),
    }))
  })

  it('uses latest actual completion and zero remaining duration for a fully completed group', () => {
    const result = buildScopedDurationForecasts({
      projectId: 'project-1',
      asOfDate: '2026-07-13',
      rows: [
        row('task-a', {
          status: 'completed',
          progress: 100,
          planned_end_date: '2026-07-09',
          actual_end_date: '2026-07-10',
        }),
        row('task-b', {
          status: 'completed',
          progress: 100,
          planned_end_date: '2026-07-11',
          actual_end_date: '2026-07-12',
        }),
      ],
      forecasts: [],
      attributions: new Map([
        ['task-a', attribution()],
        ['task-b', attribution()],
      ]),
      criticalTaskIds: new Set(),
      constructionCalendar: calendar,
    })

    expect(result.dimensions.division[0]).toEqual(expect.objectContaining({
      completedTaskCount: 2,
      remainingTaskCount: 0,
      p20FinishDate: '2026-07-12',
      p50FinishDate: '2026-07-12',
      p80FinishDate: '2026-07-12',
      expectedFinishDate: '2026-07-12',
      remainingDurationDays: 0,
      forecastCoverageRate: 1,
      probabilityCoverageRate: 1,
      forecastState: 'completed',
      dataStatus: 'ready',
    }))
  })

  it('degrades a completed group when actual completion dates are missing', () => {
    const result = buildScopedDurationForecasts({
      projectId: 'project-1',
      asOfDate: '2026-07-13',
      targetDate: '2026-07-31',
      rows: [
        row('task-a', {
          status: 'completed',
          progress: 100,
          planned_end_date: '2026-07-12',
        }),
      ],
      forecasts: [],
      attributions: new Map([
        ['task-a', attribution()],
      ]),
      criticalTaskIds: new Set(),
      constructionCalendar: calendar,
    })

    expect(result.dimensions.division[0]).toEqual(expect.objectContaining({
      expectedFinishDate: '2026-07-12',
      remainingDurationDays: 0,
      forecastState: 'completed',
      dataStatus: 'degraded',
      degradationReasons: expect.arrayContaining(['missing_actual_completion']),
      targetDateCompletion: expect.objectContaining({
        targetDate: '2026-07-31',
        completionProbability: null,
        probabilityBasis: 'unavailable',
        reasonCodes: ['missing_actual_completion'],
      }),
    }))
  })

  it('deduplicates incoming boundary predecessors and does not count outgoing edges', () => {
    const dependency = {
      clientRowId: 'task-x',
      dependencyType: 'FS' as const,
      lagDays: 0,
    }
    const rows = [
      row('task-a', { planned_end_date: '2026-07-20' }, [
        dependency,
        { ...dependency },
        { clientRowId: 'task-y', dependencyType: 'FS', lagDays: 0 },
      ]),
      row('task-y', { planned_end_date: '2026-07-18' }),
      row('task-x'),
      row('task-z', { planned_end_date: '2026-07-25' }, [
        { clientRowId: 'task-a', dependencyType: 'FS', lagDays: 0 },
      ]),
    ]
    const otherAttribution = attribution({
      divisionId: 'd2',
      divisionName: 'Facade',
      subdivisionId: 'sd2',
      subdivisionName: 'Curtain wall',
      specialtyId: 'sp2',
      specialtyName: 'Facade',
    })

    const result = buildScopedDurationForecasts({
      projectId: 'project-1',
      asOfDate: '2026-07-13',
      rows,
      forecasts: [
        forecast('task-a', '2026-07-20'),
        forecast('task-y', '2026-07-18', [3, 6, 8]),
        forecast('task-z', '2026-07-25', [8, 13, 16]),
      ],
      attributions: new Map([
        ['task-a', attribution()],
        ['task-y', attribution()],
        ['task-x', otherAttribution],
        ['task-z', otherAttribution],
      ]),
      criticalTaskIds: new Set(),
      constructionCalendar: calendar,
    })

    const division = result.dimensions.division.find((group) => group.id === 'division-d1')
    expect(division).toEqual(expect.objectContaining({
      boundaryPredecessorCount: 1,
      unresolvedBoundaryPredecessorCount: 1,
      dataStatus: 'degraded',
      degradationReasons: expect.arrayContaining(['unresolved_boundary_predecessor']),
    }))
  })

  it('keeps an unfinished overdue boundary predecessor unresolved', () => {
    const rows = [
      row('task-active', { planned_end_date: '2026-07-20' }, [
        { clientRowId: 'task-external', dependencyType: 'FS', lagDays: 0 },
      ]),
      row('task-external', {
        status: 'in_progress',
        progress: 60,
        planned_end_date: '2026-07-01',
      }),
    ]
    const externalAttribution = attribution({
      divisionId: 'd2',
      divisionName: 'External works',
      subdivisionId: 'sd2',
      subdivisionName: 'External works',
      specialtyId: 'sp2',
      specialtyName: 'External works',
    })

    const result = buildScopedDurationForecasts({
      projectId: 'project-1',
      asOfDate: '2026-07-13',
      rows,
      forecasts: [forecast('task-active', '2026-07-20')],
      attributions: new Map([
        ['task-active', attribution()],
        ['task-external', externalAttribution],
      ]),
      criticalTaskIds: new Set(),
      constructionCalendar: calendar,
    })

    expect(result.dimensions.division.find((group) => group.id === 'division-d1')).toEqual(
      expect.objectContaining({
        boundaryPredecessorCount: 1,
        unresolvedBoundaryPredecessorCount: 1,
        dataStatus: 'degraded',
        degradationReasons: expect.arrayContaining(['unresolved_boundary_predecessor']),
      }),
    )
  })

  it('uses planned finish as a degraded fallback and reports missing finish as insufficient', () => {
    const result = buildScopedDurationForecasts({
      projectId: 'project-1',
      asOfDate: '2026-07-13',
      rows: [
        row('task-fallback', { planned_end_date: '2026-07-18' }),
        row('task-missing'),
      ],
      forecasts: [],
      attributions: new Map([
        ['task-fallback', attribution({ divisionId: 'fallback', divisionName: 'Fallback' })],
        ['task-missing', attribution({ divisionId: 'missing', divisionName: 'Missing' })],
      ]),
      criticalTaskIds: new Set(),
      constructionCalendar: calendar,
    })

    const fallback = result.dimensions.division.find((group) => group.id === 'division-fallback')
    const missing = result.dimensions.division.find((group) => group.id === 'division-missing')
    expect(fallback).toEqual(expect.objectContaining({
      p20FinishDate: '2026-07-18',
      p50FinishDate: '2026-07-18',
      p80FinishDate: '2026-07-18',
      forecastCoverageRate: 0,
      probabilityCoverageRate: 0,
      dataStatus: 'degraded',
      degradationReasons: expect.arrayContaining([
        'planned_finish_fallback',
        'missing_probability_window',
      ]),
    }))
    expect(missing).toEqual(expect.objectContaining({
      p50FinishDate: null,
      expectedFinishDate: null,
      remainingDurationDays: null,
      dataStatus: 'insufficient_data',
      degradationReasons: expect.arrayContaining(['missing_usable_finish']),
    }))
  })

  it('does not report a past finish with zero remaining days for unfinished overdue work', () => {
    const result = buildScopedDurationForecasts({
      projectId: 'project-1',
      asOfDate: '2026-07-13',
      rows: [row('task-overdue', {
        status: 'in_progress',
        progress: 50,
        planned_end_date: '2026-06-01',
      })],
      forecasts: [],
      attributions: new Map([['task-overdue', attribution()]]),
      criticalTaskIds: new Set(),
      constructionCalendar: calendar,
    })

    expect(result.dimensions.division[0]).toEqual(expect.objectContaining({
      expectedFinishDate: null,
      remainingDurationDays: null,
      targetGapDays: null,
      delayDays: 42,
      dataStatus: 'insufficient_data',
      degradationReasons: expect.arrayContaining([
        'overdue_without_current_forecast',
        'missing_usable_finish',
      ]),
    }))
  })

  it('rejects a past current forecast finish for unfinished work', () => {
    const result = buildScopedDurationForecasts({
      projectId: 'project-1',
      asOfDate: '2026-07-13',
      rows: [row('task-stale-forecast', {
        status: 'in_progress',
        progress: 70,
        planned_end_date: '2026-07-25',
      })],
      forecasts: [forecast('task-stale-forecast', '2026-07-10', [1, 3, 5])],
      attributions: new Map([['task-stale-forecast', attribution()]]),
      criticalTaskIds: new Set(),
      constructionCalendar: calendar,
    })

    expect(result.dimensions.division[0]).toEqual(expect.objectContaining({
      p20FinishDate: null,
      p50FinishDate: null,
      p80FinishDate: null,
      expectedFinishDate: null,
      remainingDurationDays: null,
      delayDays: 3,
      dataStatus: 'insufficient_data',
      degradationReasons: expect.arrayContaining([
        'past_current_forecast_finish',
        'missing_usable_finish',
      ]),
    }))
  })

  it('treats one uncovered active task as insufficient for the group completion finish', () => {
    const result = buildScopedDurationForecasts({
      projectId: 'project-1',
      asOfDate: '2026-07-13',
      rows: [
        row('task-covered', { planned_end_date: '2026-07-20' }),
        row('task-uncovered', { planned_end_date: '2026-06-01' }),
      ],
      forecasts: [forecast('task-covered', '2026-07-22', [5, 8, 12])],
      attributions: new Map([
        ['task-covered', attribution()],
        ['task-uncovered', attribution()],
      ]),
      criticalTaskIds: new Set(),
      constructionCalendar: calendar,
    })

    expect(result.dimensions.division[0]).toEqual(expect.objectContaining({
      expectedFinishDate: null,
      remainingDurationDays: null,
      dataStatus: 'insufficient_data',
      governingTaskIds: [],
    }))
  })

  it('excludes cancelled tasks and record-only milestones from completion control', () => {
    const rows = [
      row('task-active', { planned_end_date: '2026-07-20' }),
      row('task-cancelled', {
        status: 'cancelled',
        planned_end_date: '2027-12-31',
      }),
      row('milestone-record-only', {
        is_milestone: true,
        duration_contribution_mode: 'record_only',
        planned_end_date: '2027-11-30',
      }),
    ]
    const result = buildScopedDurationForecasts({
      projectId: 'project-1',
      asOfDate: '2026-07-13',
      rows,
      forecasts: [forecast('task-active', '2026-07-20', [5, 8, 12])],
      attributions: new Map(rows.map((item) => [item.clientRowId, attribution()])),
      criticalTaskIds: new Set(),
      constructionCalendar: calendar,
    })

    expect(result.dimensions.division[0]).toEqual(expect.objectContaining({
      taskIds: ['task-active'],
      taskCount: 1,
      expectedFinishDate: '2026-07-20',
      governingTaskIds: ['task-active'],
    }))
  })

  it('does not present a past planned finish as the forecast for an unfinished overdue task', () => {
    const result = buildScopedDurationForecasts({
      projectId: 'project-1',
      asOfDate: '2026-07-13',
      rows: [row('task-overdue', {
        status: 'in_progress',
        progress: 40,
        planned_end_date: '2026-07-10',
      })],
      forecasts: [],
      attributions: new Map([['task-overdue', attribution()]]),
      criticalTaskIds: new Set(),
      constructionCalendar: calendar,
    })

    expect(result.dimensions.division[0]).toEqual(expect.objectContaining({
      p20FinishDate: null,
      p50FinishDate: null,
      p80FinishDate: null,
      expectedFinishDate: null,
      remainingDurationDays: null,
      targetGapDays: null,
      delayDays: 3,
      forecastState: 'in_progress',
      dataStatus: 'insufficient_data',
      degradationReasons: expect.arrayContaining([
        'missing_current_forecast',
        'overdue_without_current_forecast',
        'missing_usable_finish',
      ]),
    }))
  })

  it('includes controlling milestones but excludes linked and non-duration rows', () => {
    const rows = [
      row('task-a', { planned_end_date: '2026-07-18' }),
      row('milestone-a', {
        planned_end_date: '2026-07-25',
        is_milestone: true,
        duration_contribution_mode: 'handover_marker',
      }),
      {
        ...row('linked-a', { planned_end_date: '2026-12-31' }),
        rowProjectionMode: 'linked_projection' as const,
      },
      row('summary-a', {
        planned_end_date: '2027-01-31',
        duration_contribution_mode: 'summary_only',
      }),
    ]
    const attributions = new Map(rows.map((item) => [item.clientRowId, attribution()]))

    const result = buildScopedDurationForecasts({
      projectId: 'project-1',
      asOfDate: '2026-07-13',
      rows,
      forecasts: [forecast('task-a', '2026-07-18', [3, 6, 8])],
      attributions,
      criticalTaskIds: new Set(),
      constructionCalendar: calendar,
    })

    expect(result.dimensions.division[0]).toEqual(expect.objectContaining({
      taskIds: ['task-a', 'milestone-a'],
      taskCount: 2,
      p50FinishDate: '2026-07-25',
      dataStatus: 'degraded',
    }))
  })

  it('excludes cancelled tasks from scoped finish and task counts', () => {
    const rows = [
      row('task-active', { planned_end_date: '2026-07-20' }),
      row('task-cancelled', {
        status: 'cancelled',
        planned_end_date: '2026-12-31',
      }),
    ]
    const attributions = new Map(rows.map((item) => [item.clientRowId, attribution()]))

    const result = buildScopedDurationForecasts({
      projectId: 'project-1',
      asOfDate: '2026-07-13',
      rows,
      forecasts: [forecast('task-active', '2026-07-20', [5, 8, 12])],
      attributions,
      criticalTaskIds: new Set(['task-cancelled']),
      constructionCalendar: calendar,
    })

    expect(result.dimensions.division[0]).toEqual(expect.objectContaining({
      taskIds: ['task-active'],
      taskCount: 1,
      criticalTaskCount: 0,
      targetFinishDate: '2026-07-20',
      p50FinishDate: '2026-07-20',
      governingTaskIds: ['task-active'],
    }))
  })

  it('merges governed specialty aliases before aggregating forecasts and boundaries', () => {
    const rows = [
      row('task-mep-category', { planned_end_date: '2026-07-20' }),
      row('task-mep-label', { planned_end_date: '2026-07-22' }, [
        { clientRowId: 'task-mep-category', dependencyType: 'FS', lagDays: 0 },
      ]),
      row('task-curtain-category', { planned_end_date: '2026-07-24' }),
      row('task-curtain-code', { planned_end_date: '2026-07-26' }),
    ]
    const attributions = buildProjectTaskAttributionProjection([
      {
        id: 'task-mep-category',
        engineering_category_id: 'category-mep',
        engineering_category_name: '机电安装',
      },
      { id: 'task-mep-label', specialty_type: '机电' },
      {
        id: 'task-curtain-category',
        engineering_category_id: 'category-curtain-wall',
        engineering_category_name: '幕墙工程',
      },
      { id: 'task-curtain-code', specialty_type: 'curtain_wall' },
    ])

    const result = buildScopedDurationForecasts({
      projectId: 'project-1',
      asOfDate: '2026-07-13',
      rows,
      forecasts: [],
      attributions,
      criticalTaskIds: new Set(),
      constructionCalendar: calendar,
    })

    expect(result.dimensions.specialty).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'specialty-mep',
        sourceId: 'mep',
        name: '机电安装',
        taskCount: 2,
        boundaryPredecessorCount: 0,
      }),
      expect.objectContaining({
        id: 'specialty-curtain_wall',
        sourceId: 'curtain_wall',
        name: '幕墙工程',
        taskCount: 2,
      }),
    ]))
    expect(result.dimensions.specialty).toHaveLength(2)
  })

  it('keeps unmapped work visible in one explicit unassigned group per dimension', () => {
    const result = buildScopedDurationForecasts({
      projectId: 'project-1',
      asOfDate: '2026-07-13',
      rows: [row('task-a', { planned_end_date: '2026-07-18' })],
      forecasts: [],
      attributions: new Map(),
      criticalTaskIds: new Set(),
      constructionCalendar: calendar,
    })

    expect(result.dimensions.division[0]).toEqual(expect.objectContaining({
      id: 'division-__unassigned__',
      sourceId: null,
      name: '未归属分部工程',
    }))
    expect(result.dimensions.subdivision[0].id).toBe('subdivision-__unassigned__')
    expect(result.dimensions.specialty[0].id).toBe('specialty-__unassigned__')
  })
})
