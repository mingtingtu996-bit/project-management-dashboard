import { describe, expect, it, vi } from 'vitest'

import { getTaskLagLevel } from '../services/taskLagStatusService.js'

describe('taskLagStatusService runtime contract', () => {
  it('derives short in-progress lag with shared inclusive duration semantics', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-02T12:00:00.000Z'))

    try {
      expect(getTaskLagLevel({
        status: 'in_progress',
        progress: 0,
        planned_start_date: '2026-05-01',
        planned_end_date: '2026-05-03',
      })).not.toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })
})
