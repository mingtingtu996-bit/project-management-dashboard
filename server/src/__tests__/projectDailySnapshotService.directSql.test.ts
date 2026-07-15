import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const previousNodeEnv = process.env.NODE_ENV
process.env.NODE_ENV = 'development'

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  getClient: vi.fn(),
  clientQuery: vi.fn(),
  clientRelease: vi.fn(),
  from: vi.fn(() => {
    throw new Error('snapshot worker must not use anonymous Supabase REST')
  }),
  getProjectExecutionSummary: vi.fn(),
  attachCurrentBaselineProjectionToTasks: vi.fn(() => {
    throw new Error('direct snapshot reads must project the current baseline in SQL')
  }),
}))

vi.mock('../database.js', () => ({
  query: mocks.query,
  getClient: mocks.getClient,
}))

vi.mock('../services/dbService.js', () => ({
  supabase: { from: mocks.from },
}))

vi.mock('../services/projectExecutionSummaryService.js', () => ({
  getAllProjectExecutionSummaries: vi.fn(),
  getProjectExecutionSummary: mocks.getProjectExecutionSummary,
}))

vi.mock('../services/activeProjectService.js', () => ({
  listActiveProjectIds: vi.fn(),
}))

vi.mock('../services/taskBaselineProjectionService.js', () => ({
  attachCurrentBaselineProjectionToTasks: mocks.attachCurrentBaselineProjectionToTasks,
}))

vi.mock('../services/metricRegistryService.js', () => {
  const metric = {
    metricKey: 'health_score',
    dataType: 'number',
    source: 'projectExecutionSummary',
    nullStrategy: 'show_null',
    snapshotPolicy: 'daily',
  }
  return {
    getFrontendVisibleMetrics: () => [metric],
    getSnapshotMetrics: () => [metric],
  }
})

vi.mock('../middleware/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn() },
}))

const {
  loadProjectMonthlyHealthHistory,
  recordProjectDailySnapshot,
} = await import('../services/projectDailySnapshotService.js')

const projectId = '22cb1b1c-4d72-4275-8790-8174ce8c6d4b'

describe('project daily snapshot worker persistence', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getClient.mockResolvedValue({
      query: mocks.clientQuery,
      release: mocks.clientRelease,
    })
    mocks.getProjectExecutionSummary.mockResolvedValue({
      id: projectId,
      businessHealthScore: 82,
      healthStatus: '健康',
      overallProgress: 50,
      taskProgress: 50,
      attentionRequired: false,
    })
    mocks.query.mockResolvedValue({
      rows: [{
        id: 'c6a31a0f-df52-40cd-afac-6b510e68bbbc',
        project_id: projectId,
        progress: 50,
        status: 'in_progress',
        planned_start_date: '2026-07-01',
        planned_end_date: '2026-07-31',
        baseline_start: '2026-07-01',
        baseline_end: '2026-07-31',
        is_executable: true,
        is_wbs_summary: false,
      }],
    })
    mocks.clientQuery.mockResolvedValue({ rows: [] })
  })

  afterAll(() => {
    process.env.NODE_ENV = previousNodeEnv
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('reads baseline-projected tasks and atomically writes both snapshot tables with the backend role', async () => {
    await expect(recordProjectDailySnapshot(projectId, '2026-07-14')).resolves.toEqual({
      recorded: 1,
      failed: 0,
      snapshotDate: '2026-07-14',
    })

    expect(mocks.query).toHaveBeenCalledWith(
      expect.stringMatching(/WITH current_baseline AS[\s\S]*t\.planned_start_date::text[\s\S]*baseline_item\.planned_start_date::text[\s\S]*FROM public\.tasks/),
      [projectId],
    )
    expect(mocks.clientQuery).toHaveBeenCalledWith('BEGIN')
    expect(mocks.clientQuery).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO public.project_daily_snapshot'),
      expect.any(Array),
    )
    expect(mocks.clientQuery).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM public.metric_value_snapshots'),
      expect.any(Array),
    )
    expect(mocks.clientQuery).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO public.metric_value_snapshots'),
      expect.any(Array),
    )
    expect(mocks.clientQuery).toHaveBeenCalledWith('COMMIT')
    expect(mocks.clientRelease).toHaveBeenCalledOnce()
    expect(mocks.from).not.toHaveBeenCalled()
    expect(mocks.attachCurrentBaselineProjectionToTasks).not.toHaveBeenCalled()
  })

  it('rolls back the project snapshot when metric snapshot persistence fails', async () => {
    mocks.clientQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('INSERT INTO public.metric_value_snapshots')) throw new Error('metric write failed')
      return { rows: [] }
    })

    await expect(recordProjectDailySnapshot(projectId, '2026-07-14')).resolves.toEqual({
      recorded: 0,
      failed: 1,
      snapshotDate: '2026-07-14',
    })

    expect(mocks.clientQuery).toHaveBeenCalledWith('ROLLBACK')
    expect(mocks.clientQuery).not.toHaveBeenCalledWith('COMMIT')
    expect(mocks.clientRelease).toHaveBeenCalledOnce()
  })

  it('uses the Asia/Shanghai business date at the UTC day boundary', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-13T16:10:00.000Z'))

    await expect(recordProjectDailySnapshot(projectId)).resolves.toEqual({
      recorded: 1,
      failed: 0,
      snapshotDate: '2026-07-14',
    })
    expect(mocks.getProjectExecutionSummary).toHaveBeenCalledWith(projectId, { asOf: '2026-07-14' })
  })

  it('reads monthly project health history with the backend database role', async () => {
    mocks.query.mockResolvedValueOnce({
      rows: [
        {
          snapshot_date: '2026-07-14',
          health_score: 82,
          health_status: 'healthy',
          updated_at: '2026-07-14T00:10:00.000Z',
        },
        {
          snapshot_date: '2026-06-30',
          health_score: 77,
          health_status: 'attention',
          updated_at: '2026-06-30T00:10:00.000Z',
        },
      ],
    })

    await expect(loadProjectMonthlyHealthHistory(projectId, 3)).resolves.toEqual([
      {
        period: '2026-07',
        health_score: 82,
        health_status: 'healthy',
        recorded_at: '2026-07-14T00:10:00.000Z',
      },
      {
        period: '2026-06',
        health_score: 77,
        health_status: 'attention',
        recorded_at: '2026-06-30T00:10:00.000Z',
      },
    ])
    expect(mocks.query).toHaveBeenCalledWith(
      expect.stringMatching(/PARTITION BY TO_CHAR\(snapshot_date, 'YYYY-MM'\)[\s\S]*FROM public\.project_daily_snapshot/),
      [projectId, 3],
    )
    expect(mocks.from).not.toHaveBeenCalled()
  })
})
