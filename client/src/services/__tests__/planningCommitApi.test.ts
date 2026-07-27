import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  apiPost: vi.fn(),
}))

vi.mock('@/lib/apiClient', () => ({
  apiPost: mocks.apiPost,
}))

const { commitPlanningTable, commitTaskListTable } = await import('../planningCommitApi')

describe('planningCommitApi', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.apiPost.mockResolvedValue({ success: true, rows: [] })
  })

  it('routes task list commits to the task commit endpoint', async () => {
    await commitTaskListTable({
      projectId: 'project-1',
      fieldRegistryVersion: 'v1.4.7.6',
      operations: [
        {
          type: 'update_cell',
          rowId: 'task-1',
          field: 'progress',
          value: 50,
        },
      ],
      clientContext: { requestId: 'request-1' },
    })

    expect(mocks.apiPost).toHaveBeenCalledWith(
      '/api/tasks/commit',
      expect.objectContaining({
        projectId: 'project-1',
        surface: 'task_list',
        clientContext: { requestId: 'request-1' },
      }),
      expect.objectContaining({
        headers: expect.any(Headers),
      }),
    )
    const requestOptions = mocks.apiPost.mock.calls[0]?.[2] as RequestInit
    expect(new Headers(requestOptions.headers).get('Idempotency-Key')).toBe('request-1')
  })

  it('routes baseline and monthly plan commits to their resource endpoints', async () => {
    await commitPlanningTable({
      projectId: 'project-1',
      surface: 'monthly_plan',
      resourceId: 'plan-1',
      fieldRegistryVersion: 'v1.4.7.6',
      operations: [],
    })

    expect(mocks.apiPost).toHaveBeenCalledWith(
      '/api/monthly-plans/plan-1/commit',
      expect.objectContaining({
        projectId: 'project-1',
        surface: 'monthly_plan',
        resourceId: 'plan-1',
      }),
      undefined,
    )

    await commitPlanningTable({
      projectId: 'project-1',
      surface: 'baseline',
      resourceId: 'baseline-1',
      fieldRegistryVersion: 'v1.4.7.6',
      operations: [],
    })

    expect(mocks.apiPost).toHaveBeenLastCalledWith(
      '/api/task-baselines/baseline-1/commit',
      expect.objectContaining({
        projectId: 'project-1',
        surface: 'baseline',
        resourceId: 'baseline-1',
      }),
      undefined,
    )
  })
})
