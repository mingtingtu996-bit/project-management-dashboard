import { describe, expect, it } from 'vitest'

import { shouldRecordTaskProgressSnapshot } from '../utils/taskProgressSnapshotPolicy.js'

describe('task progress snapshot write policy', () => {
  it('records creates and execution-fact changes only', () => {
    const task = {
      id: 'task-1',
      progress: 20,
      status: 'in_progress',
      actual_start_date: '2026-07-17',
      actual_end_date: null,
      first_progress_at: '2026-07-17T00:00:00.000Z',
    }
    const renamedTask = { ...task, title: 'Renamed task' }

    expect(shouldRecordTaskProgressSnapshot(null, task)).toBe(true)
    expect(shouldRecordTaskProgressSnapshot(task, renamedTask)).toBe(false)
    expect(shouldRecordTaskProgressSnapshot(task, { ...task, progress: 25 })).toBe(true)
    expect(shouldRecordTaskProgressSnapshot(task, { ...task, status: 'completed' })).toBe(true)
    expect(shouldRecordTaskProgressSnapshot(task, { ...task, actual_end_date: '2026-07-18' })).toBe(true)
  })
})
