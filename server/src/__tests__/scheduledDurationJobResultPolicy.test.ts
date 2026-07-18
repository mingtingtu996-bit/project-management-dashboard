import { describe, expect, it, vi } from 'vitest'

import {
  requireCompleteDailyDurationForecastRefresh,
  requireCompleteProjectDailySnapshotWrite,
  runScheduledDailyDurationForecastRefresh,
  runScheduledProjectDailySnapshotWrite,
} from '../services/scheduledDurationJobResultPolicyService.js'
import * as scheduledDurationJobResultPolicy from '../services/scheduledDurationJobResultPolicyService.js'

describe('scheduled duration job result policy', () => {
  it('rejects a project snapshot batch when any project failed', () => {
    expect(() => requireCompleteProjectDailySnapshotWrite({
      recorded: 9,
      failed: 1,
      snapshotDate: '2026-07-17',
    })).toThrowError(expect.objectContaining({
      code: 'PROJECT_DAILY_SNAPSHOT_PARTIAL_FAILURE',
      result: expect.objectContaining({ recorded: 9, failed: 1 }),
    }))
  })

  it('accepts a complete project snapshot batch', () => {
    const result = { recorded: 10, failed: 0, snapshotDate: '2026-07-17' }
    expect(requireCompleteProjectDailySnapshotWrite(result)).toBe(result)
  })

  it.each([
    {
      label: 'task refresh failures',
      patch: { failed: 2 },
      reason: 'forecast_refresh_failed_tasks',
    },
    {
      label: 'time-budget skips',
      patch: { skippedByTimeBudget: 4, timeBudgetExceeded: true },
      reason: 'forecast_refresh_time_budget_exceeded',
    },
    {
      label: 'stale current forecasts after refresh',
      patch: { staleCurrentForecastsAfter: 3, freshnessSloMet: false },
      reason: 'forecast_refresh_freshness_slo_not_met',
    },
  ])('rejects a daily forecast sweep with $label', ({ patch, reason }) => {
    const result = {
      scanned: 20,
      refreshed: 20,
      failed: 0,
      skippedByTimeBudget: 0,
      batchSize: 20,
      maxRuntimeMs: 60_000,
      durationMs: 1_000,
      batchesAttempted: 1,
      freshnessSloMs: 36 * 60 * 60 * 1_000,
      staleCurrentForecastsBefore: 5,
      staleCurrentForecastsAfter: 0,
      freshCurrentForecastsAfter: 20,
      freshnessSloMet: true,
      timeBudgetExceeded: false,
      ...patch,
    }

    expect(() => requireCompleteDailyDurationForecastRefresh(result)).toThrowError(expect.objectContaining({
      code: 'DAILY_DURATION_FORECAST_REFRESH_INCOMPLETE',
      reasons: expect.arrayContaining([reason]),
      result: expect.objectContaining(patch),
    }))
  })

  it('accepts a complete and fresh daily forecast sweep', () => {
    const result = {
      scanned: 20,
      refreshed: 20,
      failed: 0,
      skippedByTimeBudget: 0,
      batchSize: 20,
      maxRuntimeMs: 60_000,
      durationMs: 1_000,
      batchesAttempted: 1,
      freshnessSloMs: 36 * 60 * 60 * 1_000,
      staleCurrentForecastsBefore: 5,
      staleCurrentForecastsAfter: 0,
      freshCurrentForecastsAfter: 20,
      freshnessSloMet: true,
      timeBudgetExceeded: false,
    }

    expect(requireCompleteDailyDurationForecastRefresh(result)).toBe(result)
  })

  it('applies the project snapshot completeness policy inside the scheduled runner', async () => {
    await expect(runScheduledProjectDailySnapshotWrite(async () => ({
      recorded: 8,
      failed: 2,
      snapshotDate: '2026-07-17',
    }))).rejects.toMatchObject({ code: 'PROJECT_DAILY_SNAPSHOT_PARTIAL_FAILURE' })
  })

  it('applies the forecast completeness policy inside the scheduled runner', async () => {
    await expect(runScheduledDailyDurationForecastRefresh(async () => ({
      failed: 0,
      skippedByTimeBudget: 0,
      staleCurrentForecastsAfter: 2,
      freshnessSloMet: false,
      timeBudgetExceeded: false,
    }))).rejects.toMatchObject({ code: 'DAILY_DURATION_FORECAST_REFRESH_INCOMPLETE' })
  })

  it('reconciles task progress snapshots before writing the daily project snapshot under one lease fence', async () => {
    const events: string[] = []
    const runCycle = (scheduledDurationJobResultPolicy as unknown as {
      runScheduledProjectDailySnapshotCycle?: (options: {
        reconcileTaskProgressSnapshots: () => Promise<Record<string, unknown>>
        assertLeaseActive: () => void
        writeProjectDailySnapshots: () => Promise<Record<string, unknown>>
      }) => Promise<Record<string, unknown>>
    }).runScheduledProjectDailySnapshotCycle

    expect(runCycle).toBeTypeOf('function')
    if (!runCycle) return

    const result = await runCycle({
      assertLeaseActive: () => events.push('lease_active'),
      reconcileTaskProgressSnapshots: async () => {
        events.push('task_progress_reconciliation')
        return {
          projectsScanned: 2,
          tasksScanned: 20,
          driftCount: 3,
          repaired: 3,
          failed: 0,
          projectFailures: [],
        }
      },
      writeProjectDailySnapshots: async () => {
        events.push('project_daily_snapshot_write')
        return { recorded: 2, failed: 0, snapshotDate: '2026-07-17' }
      },
    })

    expect(events).toEqual([
      'lease_active',
      'task_progress_reconciliation',
      'lease_active',
      'project_daily_snapshot_write',
      'lease_active',
    ])
    expect(result).toMatchObject({
      reconciliation: { projectsScanned: 2, tasksScanned: 20, repaired: 3, failed: 0 },
      snapshot: { recorded: 2, failed: 0, snapshotDate: '2026-07-17' },
    })
  })

  it('does not write the project daily snapshot when task progress reconciliation partially fails', async () => {
    const writeProjectDailySnapshots = vi.fn(async () => ({
      recorded: 2,
      failed: 0,
      snapshotDate: '2026-07-17',
    }))
    const runCycle = (scheduledDurationJobResultPolicy as unknown as {
      runScheduledProjectDailySnapshotCycle?: (options: {
        reconcileTaskProgressSnapshots: () => Promise<Record<string, unknown>>
        assertLeaseActive: () => void
        writeProjectDailySnapshots: () => Promise<Record<string, unknown>>
      }) => Promise<Record<string, unknown>>
    }).runScheduledProjectDailySnapshotCycle

    expect(runCycle).toBeTypeOf('function')
    if (!runCycle) return

    await expect(runCycle({
      assertLeaseActive: vi.fn(),
      reconcileTaskProgressSnapshots: async () => ({
        projectsScanned: 2,
        tasksScanned: 20,
        driftCount: 3,
        repaired: 2,
        failed: 1,
        projectFailures: [{ projectId: 'project-2', error: 'task-9: write failed' }],
      }),
      writeProjectDailySnapshots,
    })).rejects.toMatchObject({
      code: 'TASK_PROGRESS_SNAPSHOT_RECONCILIATION_PARTIAL_FAILURE',
      result: expect.objectContaining({ failed: 1 }),
    })
    expect(writeProjectDailySnapshots).not.toHaveBeenCalled()
  })
})
