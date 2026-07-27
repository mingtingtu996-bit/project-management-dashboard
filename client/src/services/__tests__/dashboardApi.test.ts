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
      '/api/projects/project-1/dashboard/project-summary',
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
      '/api/company/dashboard/projects-summary',
      expect.objectContaining({
        cache: 'no-store',
      }),
    )
  })

  it('requests company summary with no-store cache', async () => {
    mocks.apiGet.mockResolvedValueOnce({
      projectCount: 0,
      statusCounts: {
        total: 0,
        inProgress: 0,
        completed: 0,
        paused: 0,
        notStarted: 0,
      },
      averageHealth: 0,
      averageProgress: 0,
      attentionProjectCount: 0,
      totalUnreadWarningCount: 0,
      totalDelayedTaskCount: 0,
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
      '/api/company/dashboard/company-summary',
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
      statusCounts: {
        total: null,
        inProgress: null,
        completed: null,
        paused: null,
        notStarted: null,
      },
      averageHealth: null,
      averageProgress: null,
      attentionProjectCount: null,
      totalUnreadWarningCount: null,
      totalDelayedTaskCount: null,
      ranking: null,
      healthHistory: {
        thisMonth: 72,
        lastMonth: null,
        change: null,
        periods: [],
      },
    })
  })

  it('does not synthesize company status counts from ranking when the backend omits them', async () => {
    mocks.apiGet.mockResolvedValueOnce({
      projectCount: 2,
      averageHealth: 72,
      averageProgress: 41,
      attentionProjectCount: 1,
      totalUnreadWarningCount: 3,
      totalDelayedTaskCount: 2,
      lowHealthProjectCount: 1,
      overdueMilestoneProjectCount: 0,
      healthHistory: {
        thisMonth: 72,
        lastMonth: 70,
        change: 2,
        thisMonthPeriod: '2026-07',
        lastMonthPeriod: '2026-06',
        periods: [],
      },
      ranking: [
        { id: 'project-1', name: '项目一', status: 'active', statusLabel: '进行中' },
        { id: 'project-2', name: '项目二', status: 'completed', statusLabel: '已完成' },
      ],
    })

    const summary = await DashboardApiService.getCompanySummary()

    expect(summary.statusCounts).toEqual({
      total: null,
      inProgress: null,
      completed: null,
      paused: null,
      notStarted: null,
    })
  })
})
