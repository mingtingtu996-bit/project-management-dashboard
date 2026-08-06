import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getProjects: vi.fn(),
  getTasks: vi.fn(),
  listTaskProgressSnapshotsByTaskIds: vi.fn(),
  recordTaskProgressSnapshot: vi.fn(),
}))

vi.mock('../services/dbService.js', () => ({
  getProjects: mocks.getProjects,
  getTasks: mocks.getTasks,
  listTaskProgressSnapshotsByTaskIds: mocks.listTaskProgressSnapshotsByTaskIds,
  recordTaskProgressSnapshot: mocks.recordTaskProgressSnapshot,
}))

import {
  inspectProjectTaskProgressSnapshotDrift,
  reconcileAllProjectTaskProgressSnapshots,
  reconcileProjectTaskProgressSnapshots,
} from '../services/taskProgressSnapshotReconciliationService.js'

describe('task progress snapshot reconciliation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getTasks.mockResolvedValue([
      { id: 'task-matching', project_id: 'project-1', progress: 30, status: 'in_progress' },
      { id: 'task-drifted', project_id: 'project-1', progress: 60, status: 'in_progress' },
      { id: 'task-missing', project_id: 'project-1', progress: 10, status: 'in_progress' },
    ])
    mocks.listTaskProgressSnapshotsByTaskIds.mockResolvedValue([
      {
        id: 'snapshot-matching',
        task_id: 'task-matching',
        progress: 30,
        status: 'in_progress',
        snapshot_date: '2026-07-17',
        created_at: '2026-07-17T00:00:00.000Z',
      },
      {
        id: 'snapshot-drifted',
        task_id: 'task-drifted',
        progress: 45,
        status: 'in_progress',
        snapshot_date: '2026-07-17',
        created_at: '2026-07-17T00:00:00.000Z',
      },
    ])
    mocks.recordTaskProgressSnapshot.mockResolvedValue(undefined)
    mocks.getProjects.mockResolvedValue([
      { id: 'project-1', status: 'active' },
      { id: 'project-archived', status: 'archived' },
    ])
  })

  it('detects missing and mismatched latest snapshots without treating tasks.progress as history', async () => {
    const result = await inspectProjectTaskProgressSnapshotDrift('project-1')

    expect(result.scanned).toBe(3)
    expect(result.drifts).toEqual([
      expect.objectContaining({ taskId: 'task-drifted', reason: 'state_mismatch', taskProgress: 60, snapshotProgress: 45 }),
      expect.objectContaining({ taskId: 'task-missing', reason: 'missing_snapshot', taskProgress: 10, snapshotProgress: null }),
    ])
    expect(mocks.recordTaskProgressSnapshot).not.toHaveBeenCalled()
  })

  it('loads only physical task columns and keeps planning lineage anchored by item ids', async () => {
    await inspectProjectTaskProgressSnapshotDrift('project-1')

    expect(mocks.getTasks).toHaveBeenCalledWith('project-1', {
      columns: [
        'id',
        'project_id',
        'progress',
        'status',
        'updated_at',
        'baseline_item_id',
        'monthly_plan_item_id',
      ],
    })
  })

  it('writes an auditable system reconciliation event for every drifted task', async () => {
    const result = await reconcileProjectTaskProgressSnapshots('project-1')

    expect(result).toMatchObject({ scanned: 3, driftCount: 2, repaired: 2, failed: 0 })
    expect(mocks.recordTaskProgressSnapshot).toHaveBeenCalledTimes(2)
    expect(mocks.recordTaskProgressSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'task-drifted', progress: 60 }),
      expect.objectContaining({
        eventType: 'task_reconciled',
        eventSource: 'system_auto',
        notes: expect.stringContaining('state_mismatch'),
      }),
    )
  })

  it('provides an active-project system entry for the daily snapshot job', async () => {
    const result = await reconcileAllProjectTaskProgressSnapshots()

    expect(result).toMatchObject({
      projectsScanned: 1,
      tasksScanned: 3,
      driftCount: 2,
      repaired: 2,
      failed: 0,
    })
    expect(mocks.getTasks).toHaveBeenCalledTimes(1)
    expect(mocks.getTasks).toHaveBeenCalledWith('project-1', expect.any(Object))
  })
})
