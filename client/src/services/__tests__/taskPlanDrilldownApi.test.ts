import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ apiGet: vi.fn() }))

vi.mock('@/lib/apiClient', () => ({ apiGet: mocks.apiGet }))

const { getTaskPlanDrilldownContext } = await import('../taskPlanDrilldownApi')

describe('task plan drilldown API', () => {
  beforeEach(() => vi.clearAllMocks())

  it('loads authoritative read-only context for the selected task', async () => {
    mocks.apiGet.mockResolvedValue({
      parentTask: { id: 'task/1' },
      currentLevel: 'master_control',
      nextLevel: 'process_detail',
      rowLimit: 80,
    })

    const result = await getTaskPlanDrilldownContext('task/1')

    expect(mocks.apiGet).toHaveBeenCalledWith(
      '/api/tasks/task%2F1/plan-drilldown-context',
      { runtimeCache: 'off' },
    )
    expect(result.rowLimit).toBe(80)
  })
})
