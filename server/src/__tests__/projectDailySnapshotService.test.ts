import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const upsert = vi.fn()
  const insert = vi.fn()
  const tasks: Array<Record<string, unknown>> = []
  const taskBaselines: Array<Record<string, unknown>> = []
  const taskBaselineItems: Array<Record<string, unknown>> = []
  const deleteBuilder: Record<string, any> = {
    delete: vi.fn(() => deleteBuilder),
    eq: vi.fn(() => deleteBuilder),
  }
  const makeQuery = (rowsSource: Array<Record<string, unknown>>) => {
    const filters: Array<(row: Record<string, unknown>) => boolean> = []
    const query: Record<string, any> = {
      select: vi.fn(() => query),
      eq: vi.fn((column: string, value: unknown) => {
        filters.push((row) => String(row[column] ?? '') === String(value ?? ''))
        return query
      }),
      in: vi.fn((column: string, values: unknown[]) => {
        const normalizedValues = values.map(String)
        filters.push((row) => normalizedValues.includes(String(row[column] ?? '')))
        return query
      }),
      order: vi.fn(() => query),
      then: (resolve: (value: { data: Array<Record<string, unknown>>; error: null }) => unknown) => {
        const rows = rowsSource.filter((row) => filters.every((filter) => filter(row)))
        return Promise.resolve(resolve({ data: rows, error: null }))
      },
    }
    return query
  }
  const from = vi.fn((table: string) => {
    if (table === 'metric_value_snapshots') {
      return {
        ...deleteBuilder,
        insert,
      }
    }
    if (table === 'tasks') {
      return makeQuery(tasks)
    }
    if (table === 'task_baselines') {
      return makeQuery(taskBaselines)
    }
    if (table === 'task_baseline_items') {
      return makeQuery(taskBaselineItems)
    }
    return { upsert }
  })

  return {
    from,
    upsert,
    insert,
    tasks,
    deleteBuilder,
    getAllProjectExecutionSummaries: vi.fn(),
    getProjectExecutionSummary: vi.fn(),
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
    },
    taskBaselines,
    taskBaselineItems,
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
    mocks.insert.mockResolvedValue({ error: null })
    mocks.deleteBuilder.eq.mockReturnValue(mocks.deleteBuilder)
    mocks.deleteBuilder.delete.mockReturnValue(mocks.deleteBuilder)
    mocks.deleteBuilder.error = null
    mocks.tasks.splice(0, mocks.tasks.length)
    mocks.taskBaselines.splice(0, mocks.taskBaselines.length)
    mocks.taskBaselineItems.splice(0, mocks.taskBaselineItems.length)
  })

  it('writes shared project summaries into project_daily_snapshot with an idempotent project/date key', async () => {
    mocks.getAllProjectExecutionSummaries.mockResolvedValue([
      {
        id: 'project-1',
        businessHealthScore: 82,
        healthStatus: '健康',
        overallProgress: 64,
        taskProgress: 61,
        delayDays: 3,
        delayCount: 2,
        activeRiskCount: 1,
        pendingConditionCount: 4,
        activeObstacleCount: 2,
        todayTodoCount: 6,
        milestoneOverview: {
          summaryStats: {
            baselineOnTimeCount: 3,
            dueSoon30dCount: 2,
            highRiskCount: 1,
          },
        },
        activeDelayedTasks: 1,
        monthlyProductivityDistribution: {
          monthlyAverageP: 0.94,
          monthlyMaxP: 1.22,
          monthlyMinP: 0.62,
          monthlyP90: 1.08,
          accelerationCaseRatio: 0.07,
          monthlyProductivityCaseCount: 1280,
          sampleMaturity: 'high',
          representativeness: {
            sampleCount: 1280,
            maturity: 'high',
            buildingGroupCount: 3,
            specialtyGroupCount: 5,
            criticalPathSampleCount: 14,
          },
        },
        monthlyCloseStatus: '未关账',
        attentionRequired: true,
        highestWarningLevel: 'high',
        shiftedMilestoneCount: 1,
        criticalPathAffectedTasks: 2,
      },
      {
        id: 'project-2',
        businessHealthScore: 91,
        healthStatus: '良好',
        overallProgress: 88,
        taskProgress: 87,
        delayDays: 0,
        delayCount: 0,
        activeRiskCount: 0,
        pendingConditionCount: 0,
        activeObstacleCount: 0,
        todayTodoCount: 0,
        activeDelayedTasks: 0,
        monthlyCloseStatus: '已关账',
        attentionRequired: false,
        highestWarningLevel: null,
        shiftedMilestoneCount: 0,
        criticalPathAffectedTasks: 0,
      },
    ] as never)
    mocks.tasks.push({
      id: 'task-1',
      project_id: 'project-1',
      planned_start_date: '2026-04-20',
      planned_end_date: '2026-04-30',
      progress: 0,
      status: 'in_progress',
      is_executable: true,
      is_wbs_summary: false,
    })

    const result = await recordProjectDailySnapshots('2026-04-27')

    expect(result).toEqual({ recorded: 2, failed: 0, snapshotDate: '2026-04-27' })
    expect(mocks.from).toHaveBeenCalledWith('project_daily_snapshot')
    expect(mocks.from).toHaveBeenCalledWith('metric_value_snapshots')
    expect(mocks.upsert).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        project_id: 'project-1',
        snapshot_date: '2026-04-27',
        health_score: 82,
        overall_progress: 64,
        planned_cumulative: 70,
        today_todo_count: 6,
        milestone_baseline_on_time_count: 3,
        milestone_due_soon_30d_count: 2,
        milestone_high_risk_count: 1,
        attention_required: true,
        metric_registry_version: 'v1.4.17',
        metric_snapshot_version: 1,
      }),
      { onConflict: 'project_id,snapshot_date' },
    )
    expect(mocks.insert).toHaveBeenCalled()
    expect(mocks.insert).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          metric_key: 'productivity_monthly_max_p',
          metric_value: 1.22,
        }),
        expect.objectContaining({
          metric_key: 'productivity_acceleration_case_ratio',
          metric_value: 0.07,
        }),
        expect.objectContaining({
          metric_key: 'productivity_sample_maturity_score',
          metric_value: 3,
        }),
      ]),
    )
  })

  it('continues the batch when one project snapshot write fails', async () => {
    mocks.getAllProjectExecutionSummaries.mockResolvedValue([
      { id: 'project-1', businessHealthScore: 70, attentionRequired: false },
      { id: 'project-2', businessHealthScore: 80, attentionRequired: false },
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
      businessHealthScore: 77,
      healthStatus: '关注',
      overallProgress: 55,
      attentionRequired: true,
    } as never)
    mocks.tasks.push({
      id: 'task-1',
      project_id: 'project-1',
      planned_start_date: '2026-04-27',
      planned_end_date: '2026-04-27',
      progress: 0,
      status: 'todo',
      is_executable: true,
      is_wbs_summary: false,
    })

    const result = await recordProjectDailySnapshot('project-1', '2026-04-27')

    expect(result).toEqual({ recorded: 1, failed: 0, snapshotDate: '2026-04-27' })
    expect(mocks.getProjectExecutionSummary).toHaveBeenCalledWith('project-1', { asOf: '2026-04-27' })
    expect(mocks.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        project_id: 'project-1',
        snapshot_date: '2026-04-27',
        health_score: 77,
        planned_cumulative: 100,
      }),
      { onConflict: 'project_id,snapshot_date' },
    )
  })

  it('anchors planned_cumulative to the current execution baseline when one exists', async () => {
    mocks.getProjectExecutionSummary.mockResolvedValue({
      id: 'project-1',
      businessHealthScore: 77,
      healthStatus: '关注',
      overallProgress: 15,
      attentionRequired: false,
    } as never)
    mocks.tasks.push({
      id: 'task-1',
      project_id: 'project-1',
      planned_start_date: '2026-04-01',
      planned_end_date: '2026-04-10',
      progress: 0,
      status: 'todo',
      is_executable: true,
      is_wbs_summary: false,
    })
    mocks.taskBaselines.push({
      id: 'baseline-current',
      project_id: 'project-1',
      status: 'confirmed',
      version: 3,
      confirmed_at: '2026-03-31T00:00:00.000Z',
      updated_at: '2026-03-31T00:00:00.000Z',
    })
    mocks.taskBaselineItems.push({
      id: 'baseline-item-1',
      project_id: 'project-1',
      baseline_version_id: 'baseline-current',
      source_task_id: 'task-1',
      planned_start_date: '2026-04-01',
      planned_end_date: '2026-04-20',
      is_executable: true,
      is_wbs_summary: false,
    })

    await recordProjectDailySnapshot('project-1', '2026-04-05')

    expect(mocks.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        project_id: 'project-1',
        snapshot_date: '2026-04-05',
        planned_cumulative: 21,
      }),
      { onConflict: 'project_id,snapshot_date' },
    )
  })

  it('keeps non-baseline tasks in the planned cumulative curve when only some tasks have baseline projections', async () => {
    mocks.getProjectExecutionSummary.mockResolvedValue({
      id: 'project-1',
      businessHealthScore: 77,
      healthStatus: '鍏虫敞',
      overallProgress: 15,
      attentionRequired: false,
    } as never)
    mocks.tasks.push(
      {
        id: 'task-with-baseline',
        project_id: 'project-1',
        planned_start_date: '2026-04-01',
        planned_end_date: '2026-04-10',
        progress: 0,
        status: 'todo',
        is_executable: true,
        is_wbs_summary: false,
      },
      {
        id: 'task-without-baseline',
        project_id: 'project-1',
        planned_start_date: '2026-04-01',
        planned_end_date: '2026-04-05',
        progress: 0,
        status: 'todo',
        is_executable: true,
        is_wbs_summary: false,
      },
    )
    mocks.taskBaselines.push({
      id: 'baseline-current',
      project_id: 'project-1',
      status: 'confirmed',
      version: 3,
      confirmed_at: '2026-03-31T00:00:00.000Z',
      updated_at: '2026-03-31T00:00:00.000Z',
    })
    mocks.taskBaselineItems.push({
      id: 'baseline-item-1',
      project_id: 'project-1',
      baseline_version_id: 'baseline-current',
      source_task_id: 'task-with-baseline',
      planned_start_date: '2026-04-01',
      planned_end_date: '2026-04-20',
      is_executable: true,
      is_wbs_summary: false,
    })

    await recordProjectDailySnapshot('project-1', '2026-04-05')

    expect(mocks.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        project_id: 'project-1',
        snapshot_date: '2026-04-05',
        planned_cumulative: 37,
      }),
      { onConflict: 'project_id,snapshot_date' },
    )
  })

  it('passes snapshotDate into summary generation so monthly productivity distribution uses the snapshot month', async () => {
    mocks.getAllProjectExecutionSummaries.mockResolvedValue([
      {
        id: 'project-1',
        businessHealthScore: 77,
        attentionRequired: false,
        monthlyProductivityDistribution: {
          monthlyAverageP: 0.95,
          monthlyMaxP: 1.18,
          monthlyMinP: 0.7,
          monthlyP90: 1.09,
          accelerationCaseRatio: 0.08,
          monthlyProductivityCaseCount: 1200,
        },
      },
    ] as never)

    await recordProjectDailySnapshots('2026-04-27')

    expect(mocks.getAllProjectExecutionSummaries).toHaveBeenCalledWith({
      asOf: '2026-04-27',
      systemJob: true,
    })
  })
})
