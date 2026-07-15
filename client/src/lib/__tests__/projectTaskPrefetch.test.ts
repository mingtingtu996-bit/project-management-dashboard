import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
}))

vi.mock('@/lib/apiClient', () => ({
  apiGet: mocks.apiGet,
}))

import { prefetchProjectTasks } from '../projectTaskPrefetch'

describe('projectTaskPrefetch', () => {
  beforeEach(() => {
    mocks.apiGet.mockReset()
  })

  it('normalizes tasks fetched from the authoritative API', async () => {
    mocks.apiGet.mockResolvedValueOnce([
      {
        id: 'task-1',
        title: 'Foundation inspection',
        planned_start_date: '2026-05-01',
        planned_end_date: '2026-05-03',
        progress: '30',
      },
    ])

    const tasks = await prefetchProjectTasks('project-1', { force: true })

    expect(mocks.apiGet).toHaveBeenCalledWith(
      '/api/tasks?projectId=project-1&surface=task_list',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    )
    expect(tasks[0]).toMatchObject({
      id: 'task-1',
      title: 'Foundation inspection',
      start_date: '2026-05-01',
      end_date: '2026-05-03',
      progress: 30,
    })
    expect(tasks[0]).not.toHaveProperty('name')
  })
})
