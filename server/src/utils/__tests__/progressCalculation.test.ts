import { describe, expect, it } from 'vitest'
import {
  calculateProgressMetrics,
  calculateOverallProgress,
  calculateTaskPlannedProgress,
  calculateWeightedPlannedProgress,
  calculateWeightedProgress,
  getLeafTasks,
} from '../progressCalculation.js'

describe('progressCalculation utilities', () => {
  it('calculates weighted progress from leaf tasks by planned duration', () => {
    const tasks = [
      { id: 'parent', progress: 100, planned_start_date: '2026-04-01', planned_end_date: '2026-04-10' },
      { id: 'child-a', parent_id: 'parent', progress: 20, planned_start_date: '2026-04-01', planned_end_date: '2026-04-03' },
      { id: 'child-b', parent_id: 'parent', progress: 80, planned_start_date: '2026-04-01', planned_end_date: '2026-04-11' },
    ]

    expect(getLeafTasks(tasks).map((task) => task.id)).toEqual(['child-a', 'child-b'])
    expect(calculateWeightedProgress(tasks)).toBe(67)
    expect(calculateOverallProgress(tasks)).toBe(67)
  })

  it('falls back to equal weights when task dates are missing', () => {
    expect(calculateWeightedProgress([
      { id: 'task-1', progress: 20 },
      { id: 'task-2', progress: 80 },
    ])).toBe(50)
  })

  it('excludes structure and closed rows from progress denominators', () => {
    const tasks = [
      { id: 'summary', progress: 100, is_wbs_summary: true },
      { id: 'task-1', parent_id: 'summary', progress: 50, planned_start_date: '2026-04-01', planned_end_date: '2026-04-03' },
      { id: 'task-2', parent_id: 'summary', progress: 100, status: 'cancelled', planned_start_date: '2026-04-01', planned_end_date: '2026-04-11' },
    ]

    expect(getLeafTasks(tasks).map((task) => task.id)).toEqual(['task-1'])
    expect(calculateWeightedProgress(tasks)).toBe(50)
  })

  it('calculates weighted planned progress using the same leaf and duration denominator', () => {
    const tasks = [
      { id: 'task-1', progress: 20, planned_start_date: '2026-04-01', planned_end_date: '2026-04-03' },
      { id: 'task-2', progress: 80, planned_start_date: '2026-04-01', planned_end_date: '2026-04-11' },
    ]
    const asOf = new Date('2026-04-06T00:00:00.000Z')

    expect(calculateTaskPlannedProgress(tasks[0], asOf)).toBe(100)
    expect(calculateTaskPlannedProgress(tasks[1], asOf)).toBe(50)
    expect(calculateWeightedPlannedProgress(tasks, asOf)).toBe(61)
    expect(calculateProgressMetrics(tasks, asOf)).toMatchObject({
      currentProgress: 67,
      plannedProgress: 61,
      targetProgress: 61,
      progressDeviation: 6,
      leafTaskCount: 2,
      datedLeafTaskCount: 2,
    })
  })
})
