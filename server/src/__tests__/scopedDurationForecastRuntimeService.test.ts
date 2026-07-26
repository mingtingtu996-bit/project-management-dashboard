import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

import type { ScheduleAccelerationRow } from '../services/scheduleAccelerationService.js'
import {
  buildRuntimeScopedDurationForecast,
  type ScopedDurationForecastRuntimeDependencies,
} from '../services/scopedDurationForecastRuntimeService.js'
import type { TaskDurationForecast } from '../services/taskDurationForecastService.js'

const serverRoot = process.cwd().endsWith('server')
  ? process.cwd()
  : resolve(process.cwd(), 'server')

function runtimeRow(id: string, values: Record<string, unknown> = {}): ScheduleAccelerationRow {
  return {
    clientRowId: id,
    rowProjectionMode: 'schedule_row',
    predecessorDependencies: [],
    values: {
      title: id,
      parent_id: null,
      wbs_level: 1,
      sort_order: 1,
      engineering_category_id: 'category-1',
      engineering_category_name: 'Civil',
      specialty_type: 'Civil',
      duration_contribution_mode: 'duration_bearing',
      row_projection_mode: 'schedule_row',
      status: 'pending',
      progress: 0,
      planned_end_date: '2026-07-20',
      ...values,
    },
  }
}

function currentForecast(taskId: string): TaskDurationForecast {
  return {
    taskId,
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
    forecastDelayDays: 0,
    confidenceLevel: 'high',
    confidenceScore: 90,
    forecastSource: 'current_history',
    businessReason: null,
    probabilityDuration: {
      method: 'pert_from_existing_percentiles',
      source: 'current_history',
      p20RemainingDays: 5,
      p50RemainingDays: 8,
      p80RemainingDays: 12,
      expectedRemainingDays: 8,
      variance: null,
      standardDeviationDays: null,
      confidenceBandWidthDays: 7,
    },
  }
}

function dependencies(overrides: Partial<ScopedDurationForecastRuntimeDependencies> = {}) {
  return {
    buildRuntimeScheduleAccelerationRowsWithDiagnostics: vi.fn(async () => ({
      rows: [
        runtimeRow('task-1'),
        runtimeRow('task-2', { parent_id: 'task-1', wbs_level: 2 }),
      ],
      degradationReasons: [],
    })),
    listCurrentTaskDurationForecasts: vi.fn(async (taskIds: string[]) => taskIds.map(currentForecast)),
    getProjectCriticalPathSnapshot: vi.fn(async () => ({
      displayTaskIds: ['task-2'],
      autoTaskIds: ['task-2'],
      tasks: [{ taskId: 'task-2', isAutoCritical: true }],
    })),
    resolveConstructionCalendarContext: vi.fn(async () => ({
      basis: 'official_construction_calendar_seed' as const,
      windows: [],
      calendarRef: 'work_calendar',
      calendarVersion: 'calendar-v1',
      timezone: 'Asia/Shanghai',
      availability: 'available' as const,
      unavailableReason: null,
    })),
    ...overrides,
  } as ScopedDurationForecastRuntimeDependencies
}

describe('scopedDurationForecastRuntimeService', () => {
  it('loads the complete project once and consumes current read-only forecast evidence', async () => {
    const deps = dependencies()

    const result = await buildRuntimeScopedDurationForecast(
      'project-1',
      { asOfDate: '2026-07-13' },
      deps,
    )

    expect(deps.buildRuntimeScheduleAccelerationRowsWithDiagnostics).toHaveBeenCalledTimes(1)
    expect(deps.buildRuntimeScheduleAccelerationRowsWithDiagnostics).toHaveBeenCalledWith('project-1')
    expect(deps.listCurrentTaskDurationForecasts).toHaveBeenCalledWith(
      ['task-1', 'task-2'],
      { projectId: 'project-1', maxAgeMs: 36 * 60 * 60 * 1000 },
    )
    expect(deps.getProjectCriticalPathSnapshot).toHaveBeenCalledWith('project-1')
    expect(deps.resolveConstructionCalendarContext).toHaveBeenCalledWith({ projectId: 'project-1' })
    expect(result.dimensions.division[0]).toEqual(expect.objectContaining({
      id: 'division-task-1',
      taskCount: 2,
      criticalTaskCount: 1,
      dataStatus: 'ready',
    }))
    expect(result.dimensions.subdivision.some((group) => group.id === 'subdivision-task-2')).toBe(true)
    expect(result.dimensions.specialty[0].id).toBe('specialty-category-1')
  })

  it('degrades optional forecast, critical-path, and calendar failures without hiding task groups', async () => {
    const deps = dependencies({
      buildRuntimeScheduleAccelerationRowsWithDiagnostics: vi.fn(async () => ({
        rows: [runtimeRow('task-1')],
        degradationReasons: ['task_dependencies_unavailable'],
      })),
      listCurrentTaskDurationForecasts: vi.fn(async () => { throw new Error('forecast read unavailable') }),
      getProjectCriticalPathSnapshot: vi.fn(async () => { throw new Error('critical path unavailable') }),
      resolveConstructionCalendarContext: vi.fn(async () => { throw new Error('calendar unavailable') }),
    })

    const result = await buildRuntimeScopedDurationForecast(
      'project-1',
      { asOfDate: '2026-07-13' },
      deps,
    )

    expect(result.dimensions.division[0]).toEqual(expect.objectContaining({
      p50FinishDate: '2026-07-20',
      dataStatus: 'degraded',
      degradationReasons: expect.arrayContaining([
        'task_forecasts_unavailable',
        'critical_path_unavailable',
        'construction_calendar_unavailable',
        'task_dependencies_unavailable',
      ]),
    }))
  })

  it('rejects a mandatory project task read before starting optional reads', async () => {
    const deps = dependencies({
      buildRuntimeScheduleAccelerationRowsWithDiagnostics: vi.fn(async () => { throw new Error('task read failed') }),
    })

    await expect(buildRuntimeScopedDurationForecast('project-1', {}, deps)).rejects.toThrow('task read failed')
    expect(deps.listCurrentTaskDurationForecasts).not.toHaveBeenCalled()
    expect(deps.getProjectCriticalPathSnapshot).not.toHaveBeenCalled()
    expect(deps.resolveConstructionCalendarContext).not.toHaveBeenCalled()
  })

  it('uses the Shanghai business date instead of the UTC date around local midnight', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-12T16:30:00.000Z'))
    try {
      const result = await buildRuntimeScopedDurationForecast('project-1', {}, dependencies())
      expect(result.asOfDate).toBe('2026-07-13')
    } finally {
      vi.useRealTimers()
    }
  })

  it('validates and forwards an arbitrary target date into the scoped forecast response', async () => {
    const result = await buildRuntimeScopedDurationForecast(
      'project-1',
      {
        asOfDate: '2026-07-13',
        targetDate: '2026-08-31',
        simulationSeed: 'runtime-target-seed',
      } as any,
      dependencies(),
    ) as any

    expect(result.targetDate).toBe('2026-08-31')
    expect(result.dimensions.division[0].targetDateCompletion).toEqual(expect.objectContaining({
      targetDate: '2026-08-31',
    }))

    await expect(buildRuntimeScopedDurationForecast(
      'project-1',
      { targetDate: '08/31/2026' } as any,
      dependencies(),
    )).rejects.toThrow('targetDate must be a valid YYYY-MM-DD date')
  })

  it('rejects missing or invalid target-date simulation seeds before loading project data', async () => {
    const missingSeedDependencies = dependencies()
    await expect(buildRuntimeScopedDurationForecast(
      'project-1',
      { targetDate: '2026-08-31' } as any,
      missingSeedDependencies,
    )).rejects.toThrow(/simulationSeed.*required/)
    expect(missingSeedDependencies.buildRuntimeScheduleAccelerationRowsWithDiagnostics).not.toHaveBeenCalled()

    const invalidSeedDependencies = dependencies()
    await expect(buildRuntimeScopedDurationForecast(
      'project-1',
      { targetDate: '2026-08-31', simulationSeed: 'contains spaces' } as any,
      invalidSeedDependencies,
    )).rejects.toThrow(/simulationSeed.*valid/)
    expect(invalidSeedDependencies.buildRuntimeScheduleAccelerationRowsWithDiagnostics).not.toHaveBeenCalled()
  })

  it('does not import forecast refresh or mutation APIs', () => {
    const source = readFileSync(resolve(serverRoot, 'src/services/scopedDurationForecastRuntimeService.ts'), 'utf8')
    expect(source).toContain('listCurrentTaskDurationForecasts')
    expect(source).not.toContain('forecastTaskDuration')
    expect(source).not.toMatch(/\.(insert|update|delete|upsert)\s*\(/)
  })
})
