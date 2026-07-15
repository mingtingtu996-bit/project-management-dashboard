import { describe, expect, it } from 'vitest'
import {
  ExecutionFactIntent,
  applyExecutionFactGovernance,
} from '../services/planningScheduleGovernanceService.js'

describe('planningScheduleGovernanceService', () => {
  it('strips manual execution facts and derives actual start from progress', () => {
    const result = applyExecutionFactGovernance({
      intent: ExecutionFactIntent.TaskCommit,
      now: '2026-05-16T08:00:00.000Z',
      previousTask: {
        status: 'todo',
        progress: 0,
        actual_start_date: null,
        actual_end_date: null,
        first_progress_at: null,
      },
      patch: {
        progress: 30,
        actual_start_date: '2026-05-01',
        actual_end_date: '2026-05-03',
      },
    })

    expect(result.strippedFields).toEqual(['actual_start_date', 'actual_end_date'])
    expect(result.patch).toMatchObject({
      progress: 30,
      actual_start_date: '2026-05-16',
      first_progress_at: '2026-05-16T08:00:00.000Z',
    })
    expect(result.patch).not.toMatchObject({ actual_end_date: '2026-05-03' })
  })

  it('derives actual end and normalizes progress when status completes the task', () => {
    const result = applyExecutionFactGovernance({
      intent: ExecutionFactIntent.TaskApiUpdate,
      now: '2026-05-16T09:00:00.000Z',
      previousTask: {
        status: 'in_progress',
        progress: 80,
        actual_start_date: '2026-05-10',
        actual_end_date: null,
        first_progress_at: '2026-05-10T00:00:00.000Z',
      },
      patch: {
        status: 'completed',
      },
    })

    expect(result.patch).toMatchObject({
      status: 'completed',
      progress: 100,
      actual_end_date: '2026-05-16',
    })
  })

  it('uses eventDate for domain-event execution facts', () => {
    const result = applyExecutionFactGovernance({
      intent: ExecutionFactIntent.AcceptancePass,
      now: '2026-05-16T09:00:00.000Z',
      eventDate: '2026-05-12',
      previousTask: {
        status: 'in_progress',
        progress: 90,
        actual_start_date: '2026-05-01',
        actual_end_date: null,
      },
      patch: {
        progress: 100,
      },
    })

    expect(result.patch.actual_end_date).toBe('2026-05-12')
  })

  it('preserves manual historical execution dates when manual correction is explicitly allowed', () => {
    const result = applyExecutionFactGovernance({
      intent: ExecutionFactIntent.TaskApiUpdate,
      now: '2026-05-16T09:00:00.000Z',
      allowManualActualDates: true,
      previousTask: {
        status: 'todo',
        progress: 0,
        actual_start_date: null,
        actual_end_date: null,
        first_progress_at: null,
      },
      patch: {
        status: 'in_progress',
        progress: 30,
        actual_start_date: '2026-05-01',
        first_progress_at: '2026-05-01T08:30:00.000Z',
      },
    })

    expect(result.strippedFields).toEqual([])
    expect(result.patch).toMatchObject({
      actual_start_date: '2026-05-01',
      first_progress_at: '2026-05-01T08:30:00.000Z',
    })
  })

  it('clears stale actual end when a previously completed task is reopened by progress rollback', () => {
    const result = applyExecutionFactGovernance({
      intent: ExecutionFactIntent.TaskApiUpdate,
      now: '2026-05-16T09:00:00.000Z',
      previousTask: {
        status: 'completed',
        progress: 100,
        actual_start_date: '2026-05-01',
        actual_end_date: '2026-05-10',
        first_progress_at: '2026-05-01T08:30:00.000Z',
      },
      patch: {
        status: 'in_progress',
        progress: 80,
      },
    })

    expect(result.patch).toMatchObject({
      status: 'in_progress',
      progress: 80,
      actual_end_date: null,
    })
  })
})
