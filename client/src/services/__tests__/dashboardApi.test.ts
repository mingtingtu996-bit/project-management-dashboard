import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
  isAbortError: vi.fn(() => false),
  buildCriticalPathSummaryModel: vi.fn(),
  fetchCriticalPathSnapshot: vi.fn(),
}))

vi.mock('../../lib/apiClient', () => ({
  apiGet: mocks.apiGet,
  isAbortError: mocks.isAbortError,
}))

vi.mock('../../lib/criticalPath', () => ({
  buildCriticalPathSummaryModel: mocks.buildCriticalPathSummaryModel,
  fetchCriticalPathSnapshot: mocks.fetchCriticalPathSnapshot,
}))

import { DashboardApiService } from '../dashboardApi'

describe('DashboardApiService cache policy', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.isAbortError.mockReturnValue(false)
  })

  it('requests project summary with no-store cache while preserving caller options', async () => {
    const controller = new AbortController()
    mocks.apiGet.mockResolvedValueOnce({
      id: 'project-1',
      milestoneOverview: { items: [], stats: { total: 0, pending: 0, completed: 0, overdue: 0, upcomingSoon: 0, completionRate: 0 } },
    })

    await DashboardApiService.getProjectSummary('project-1', { signal: controller.signal })

    expect(mocks.apiGet).toHaveBeenCalledWith(
      '/api/dashboard/project-summary?projectId=project-1',
      expect.objectContaining({
        cache: 'no-store',
        signal: controller.signal,
      }),
    )
  })

  it('requests company summary collections with no-store cache', async () => {
    mocks.apiGet.mockResolvedValueOnce([])

    await DashboardApiService.getAllProjectsSummary()

    expect(mocks.apiGet).toHaveBeenCalledWith(
      '/api/dashboard/projects-summary',
      expect.objectContaining({
        cache: 'no-store',
      }),
    )
  })

  it('requests company summary with no-store cache', async () => {
    mocks.apiGet.mockResolvedValueOnce({
      projectCount: 0,
      averageHealth: 0,
      averageProgress: 0,
      attentionProjectCount: 0,
      lowHealthProjectCount: 0,
      overdueMilestoneProjectCount: 0,
      healthHistory: {
        thisMonth: null,
        lastMonth: null,
        change: null,
        thisMonthPeriod: null,
        lastMonthPeriod: null,
        periods: [],
      },
      ranking: [],
    })

    await DashboardApiService.getCompanySummary()

    expect(mocks.apiGet).toHaveBeenCalledWith(
      '/api/dashboard/company-summary',
      expect.objectContaining({
        cache: 'no-store',
      }),
    )
  })

  it('normalizes malformed company summary payloads', async () => {
    mocks.apiGet.mockResolvedValueOnce({
      projectCount: 1,
      healthHistory: {
        thisMonth: 72,
        periods: null,
      },
    })

    const summary = await DashboardApiService.getCompanySummary()

    expect(summary).toMatchObject({
      projectCount: 1,
      averageHealth: 0,
      averageProgress: 0,
      attentionProjectCount: 0,
      ranking: [],
      healthHistory: {
        thisMonth: 72,
        lastMonth: null,
        change: null,
        periods: [],
      },
    })
  })
})
