import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const upsert = vi.fn()
  const from = vi.fn(() => ({ upsert }))

  return {
    from,
    upsert,
    getAllProjectExecutionSummaries: vi.fn(),
    getProjectExecutionSummary: vi.fn(),
    logger: {
      warn: vi.fn(),
    },
  }
})

vi.mock('../services/dbService.js', () => ({
  supabase: {
    from: mocks.from,
  },
}))

vi.mock('../services/projectExecutionSummaryService.js', () => ({
  getAllProjectExecutionSummaries: mocks.getAllProjectExecutionSummaries,
  getProjectExecutionSummary: mocks.getProjectExecutionSummary,
}))

vi.mock('../middleware/logger.js', () => ({
  logger: mocks.logger,
}))

import {
  recordProjectDailySnapshot,
  recordProjectDailySnapshots,
} from '../services/projectDailySnapshotService.js'

describe('projectDailySnapshotService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.upsert.mockResolvedValue({ error: null })
  })

  it('writes shared project summaries into project_daily_snapshot with an idempotent project/date key', async () => {
    mocks.getAllProjectExecutionSummaries.mockResolvedValue([
      {
        id: 'project-1',
        healthScore: 82,
        healthStatus: '健康',
        overallProgress: 64,
        taskProgress: 61,
        delayDays: 3,
        delayCount: 2,
        activeRiskCount: 1,
        pendingConditionCount: 4,
        activeObstacleCount: 2,
        activeDelayRequests: 1,
        monthlyCloseStatus: '未关账',
        attentionRequired: true,
        highestWarningLevel: 'high',
        shiftedMilestoneCount: 1,
        criticalPathAffectedTasks: 2,
      },
      {
        id: 'project-2',
        healthScore: 91,
        healthStatus: '良好',
        overallProgress: 88,
        taskProgress: 87,
        delayDays: 0,
        delayCount: 0,
        activeRiskCount: 0,
        pendingConditionCount: 0,
        activeObstacleCount: 0,
        activeDelayRequests: 0,
        monthlyCloseStatus: '已关账',
        attentionRequired: false,
        highestWarningLevel: null,
        shiftedMilestoneCount: 0,
        criticalPathAffectedTasks: 0,
      },
    ] as never)

    const result = await recordProjectDailySnapshots('2026-04-27')

    expect(result).toEqual({ recorded: 2, failed: 0, snapshotDate: '2026-04-27' })
    expect(mocks.from).toHaveBeenCalledWith('project_daily_snapshot')
    expect(mocks.upsert).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        project_id: 'project-1',
        snapshot_date: '2026-04-27',
        health_score: 82,
        overall_progress: 64,
        attention_required: true,
      }),
      { onConflict: 'project_id,snapshot_date' },
    )
  })

  it('continues the batch when one project snapshot write fails', async () => {
    mocks.getAllProjectExecutionSummaries.mockResolvedValue([
      { id: 'project-1', healthScore: 70, attentionRequired: false },
      { id: 'project-2', healthScore: 80, attentionRequired: false },
    ] as never)
    mocks.upsert
      .mockResolvedValueOnce({ error: { message: 'temporary failure' } })
      .mockResolvedValueOnce({ error: null })

    const result = await recordProjectDailySnapshots('2026-04-27')

    expect(result).toEqual({ recorded: 1, failed: 1, snapshotDate: '2026-04-27' })
    expect(mocks.logger.warn).toHaveBeenCalledWith(
      '[projectDailySnapshotService] failed to upsert snapshot row',
      expect.objectContaining({
        projectId: 'project-1',
        snapshotDate: '2026-04-27',
      }),
    )
  })

  it('records a single project snapshot from the shared summary service', async () => {
    mocks.getProjectExecutionSummary.mockResolvedValue({
      id: 'project-1',
      healthScore: 77,
      healthStatus: '关注',
      overallProgress: 55,
      attentionRequired: true,
    } as never)

    const result = await recordProjectDailySnapshot('project-1', '2026-04-27')

    expect(result).toEqual({ recorded: 1, failed: 0, snapshotDate: '2026-04-27' })
    expect(mocks.getProjectExecutionSummary).toHaveBeenCalledWith('project-1')
    expect(mocks.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        project_id: 'project-1',
        snapshot_date: '2026-04-27',
        health_score: 77,
      }),
      { onConflict: 'project_id,snapshot_date' },
    )
  })
})
