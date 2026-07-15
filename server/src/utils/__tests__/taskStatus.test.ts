import { describe, expect, it } from 'vitest'
import {
  COMPLETED_TASK_STATUSES,
  isCompletedTaskStatus,
  isCompletedMilestone,
  isCompletedTask,
  isInProgressTask,
} from '../taskStatus.js'

describe('taskStatus utilities', () => {
  it('detects completed tasks from canonical statuses and full progress', () => {
    expect(COMPLETED_TASK_STATUSES.has('completed')).toBe(true)
    expect(isCompletedTaskStatus('DONE')).toBe(true)
    expect(isCompletedTask({ status: 'done' })).toBe(true)
    expect(isCompletedTask({ status: '已完成' })).toBe(true)
    expect(isCompletedTask({ status: 'in_progress', progress: 100 })).toBe(true)
    expect(isCompletedTask({ status: 'in_progress', progress: 99 })).toBe(false)
  })

  it('keeps milestone and in-progress status helpers aligned with the shared task status model', () => {
    expect(isCompletedMilestone({ is_milestone: true, status: 'completed' })).toBe(true)
    expect(isCompletedMilestone({ is_milestone: false, status: 'completed' })).toBe(false)
    expect(isInProgressTask({ status: '进行中' })).toBe(true)
    expect(isInProgressTask({ status: 'completed' })).toBe(false)
  })
})
