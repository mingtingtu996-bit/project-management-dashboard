import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  query: vi.fn(),
  listActiveProjectIds: vi.fn(),
  supabaseFrom: vi.fn(() => {
    throw new Error('dependency signals must not use Supabase REST')
  }),
}))

vi.mock('../services/activeProjectService.js', () => ({
  listActiveProjectIds: state.listActiveProjectIds,
}))

vi.mock('../database.js', () => ({
  query: state.query,
}))

vi.mock('../services/dbService.js', () => ({
  executeSQL: vi.fn(),
  listTaskProgressSnapshotsByTaskIds: vi.fn(async () => []),
  supabase: {
    from: state.supabaseFrom,
  },
}))

vi.mock('../middleware/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}))

const {
  DataQualityService,
  loadTaskDependencySignals,
  persistDataQualityFindingsDirect,
} = await import('../services/dataQualityService.js')

describe('loadTaskDependencySignals', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.query.mockReset()
    state.listActiveProjectIds.mockResolvedValue([])
  })

  it('persists a large finding set in bounded no-op-aware upsert batches', async () => {
    const projectId = '10000000-0000-4000-8000-000000000001'
    const nextFindings = Array.from({ length: 1_200 }, (_, index) => ({
      finding_key: `LINEAGE_INCOMPLETE:task:${index}`,
      project_id: projectId,
      task_id: null,
      rule_code: 'LINEAGE_INCOMPLETE',
      rule_type: 'lineage',
      severity: 'info',
      dimension_key: `task:${index}`,
      summary: `missing lineage ${index}`,
      details_json: { index },
      entity_type: 'task',
      entity_id: String(index),
      quality_dimension: 'lineage',
      source_type: 'task',
    }))
    const persistedRows = [{
      id: '30000000-0000-4000-8000-000000000001',
      ...nextFindings[0],
      status: 'active',
      detected_at: '2026-07-14T00:00:00.000Z',
      resolved_at: null,
    }]
    state.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [], rowCount: 500 })
      .mockResolvedValueOnce({ rows: [], rowCount: 500 })
      .mockResolvedValueOnce({ rows: [], rowCount: 200 })
      .mockResolvedValueOnce({ rows: persistedRows })

    const result = await persistDataQualityFindingsDirect({
      projectId,
      nextFindings: nextFindings as any,
      queryExec: state.query,
      transactionRunner: async <T>(work: () => Promise<T>) => work(),
    })

    const upsertCalls = state.query.mock.calls.filter(([sql]) => String(sql).includes('jsonb_to_recordset'))
    expect(state.query).toHaveBeenCalledTimes(5)
    expect(upsertCalls).toHaveLength(3)
    expect(upsertCalls.map(([, params]) => JSON.parse(params?.[0]).length)).toEqual([500, 500, 200])
    for (const [sql] of upsertCalls) {
      expect(String(sql)).toContain('IS DISTINCT FROM')
    }
    expect(result).toEqual(persistedRows)
  })

  it('fails the all-project sync when any project could not be persisted', async () => {
    state.listActiveProjectIds.mockResolvedValueOnce(['project-ok', 'project-failed'])
    const service = new DataQualityService()
    vi.spyOn(service, 'syncProjectDataQuality')
      .mockResolvedValueOnce({ projectId: 'project-ok' } as any)
      .mockRejectedValueOnce(new Error('persistence failed'))

    await expect(service.syncAllProjectsDataQuality()).rejects.toMatchObject({
      code: 'SCOPED_BATCH_PARTIAL_FAILURE',
      failures: [expect.objectContaining({
        scopeId: 'project-failed',
        errorMessage: 'persistence failed',
      })],
      successfulScopeIds: ['project-ok'],
    })
  })

  it('uses a parameterized database query instead of a large REST in filter', async () => {
    const projectId = '10000000-0000-4000-8000-000000000001'
    const taskIds = [
      '20000000-0000-4000-8000-000000000001',
      '20000000-0000-4000-8000-000000000002',
    ]
    state.query.mockResolvedValueOnce({
      rows: [
        {
          task_id: taskIds[0],
          dependency_task_id: taskIds[1],
          source_type: 'manual',
          required_for_start: true,
          status: 'active',
        },
      ],
    })

    const result = await loadTaskDependencySignals(
      projectId,
      taskIds.map((id) => ({ id })) as any,
    )

    expect(state.query).toHaveBeenCalledWith(
      expect.stringContaining('FROM public.task_dependencies'),
      [projectId, taskIds],
    )
    expect(state.supabaseFrom).not.toHaveBeenCalled()
    expect(result.get(taskIds[0])).toEqual([
      {
        dependencyTaskId: taskIds[1],
        sourceType: 'manual',
      },
    ])
  })

  it('does not query when the project has no tasks', async () => {
    const result = await loadTaskDependencySignals(
      '10000000-0000-4000-8000-000000000001',
      [],
    )

    expect(state.query).not.toHaveBeenCalled()
    expect(result.size).toBe(0)
  })
})
