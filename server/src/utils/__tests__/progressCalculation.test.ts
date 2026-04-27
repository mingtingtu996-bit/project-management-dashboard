import { describe, expect, it } from 'vitest'
import {
  calculateOverallProgress,
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
    expect(calculateWeightedProgress(tasks)).toBe(70)
    expect(calculateOverallProgress(tasks)).toBe(70)
  })

  it('falls back to equal weights when task dates are missing', () => {
    expect(calculateWeightedProgress([
      { id: 'task-1', progress: 20 },
      { id: 'task-2', progress: 80 },
    ])).toBe(50)
  })
})
