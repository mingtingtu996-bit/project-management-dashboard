import type { ReactNode } from 'react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, useNavigate } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import CompanyCockpit from '../CompanyCockpit'
import Dashboard from '../Dashboard'
import { useAuth } from '@/hooks/useAuth'
import { useStore } from '@/hooks/useStore'
import * as apiClient from '@/lib/apiClient'
import * as projectPersistence from '@/lib/projectPersistence'
import { DashboardApiService } from '@/services/dashboardApi'

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return {
    ...actual,
    useNavigate: vi.fn(),
  }
})

vi.mock('@/hooks/useAuth', () => ({
  useAuth: vi.fn(),
}))

const mockedUseNavigate = vi.mocked(useNavigate)
const mockedUseAuth = vi.mocked(useAuth)
const apiGetSpy = vi.spyOn(apiClient, 'apiGet')
const syncProjectCacheFromApiSpy = vi.spyOn(projectPersistence, 'syncProjectCacheFromApi')
const dashboardSummarySpy = vi.spyOn(DashboardApiService, 'getProjectSummary')
const companySummarySpy = vi.spyOn(DashboardApiService, 'getCompanySummary')

function buildAuthState(globalRole: 'company_admin' | 'regular' = 'company_admin') {
  return {
    isAuthenticated: true,
    loading: false,
    user: {
      id: 'user-1',
      username: 'zhangsan',
      display_name: '张三',
      email: 'zhangsan@example.com',
      globalRole,
    },
    login: vi.fn(),
    logout: vi.fn(),
    register: vi.fn(),
    changePassword: vi.fn(),
    updateProfile: vi.fn(),
  }
}

function flush() {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

async function waitForText(container: HTMLElement, expected: string[]) {
  const deadline = Date.now() + 2000

  while (Date.now() < deadline) {
    await act(async () => {
      await flush()
    })

    const text = container.textContent || ''
    if (expected.every((item) => text.includes(item))) {
      return
    }
  }

  throw new Error(`Timed out waiting for: ${expected.join(', ')}`)
}

describe('shared summary dashboards', () => {
  let container: HTMLDivElement
  let root: Root | null = null
  const fetchMock = vi.fn()

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    container.innerHTML = ''
    root = createRoot(container)

    mockedUseNavigate.mockReturnValue(vi.fn())
    mockedUseAuth.mockReturnValue(buildAuthState())
    apiGetSpy.mockImplementation(async (url: string) => {
      if (url === '/api/projects/project-1/critical-path') {
        return {
          projectId: 'project-1',
          autoTaskIds: [],
          manualAttentionTaskIds: [],
          manualInsertedTaskIds: [],
          primaryChain: null,
          alternateChains: [],
          displayTaskIds: [],
          edges: [],
          tasks: [],
          projectDurationDays: 0,
        } as never
      }

      if (url === '/api/data-quality/project-summary?projectId=project-1') {
        return {
          projectId: 'project-1',
          month: '2026-04',
          confidence: {
            score: 81,
            flag: 'medium',
            note: '当前项目数据质量稳定，可继续复核关键节点。',
            timelinessScore: 80,
            anomalyScore: 79,
            consistencyScore: 84,
            coverageScore: 82,
            jumpinessScore: 78,
            activeFindingCount: 1,
            trendWarningCount: 0,
            anomalyFindingCount: 1,
            crossCheckFindingCount: 0,
          },
          prompt: {
            count: 0,
            summary: '当前没有需要额外提示的数据质量异常',
            items: [],
          },
          ownerDigest: {
            shouldNotify: false,
            severity: 'info',
            scopeLabel: null,
            findingCount: 1,
            summary: '数据质量已同步',
          },
          findings: [],
        } as never
      }

      if (url === '/api/issues') {
        return [
          {
            id: 'issue-1',
            project_id: 'project-1',
            title: '结构专业提资进度落后',
            severity: 'high',
            status: 'open',
          },
        ] as never
      }

      if (url === '/api/projects/project-1/weekly-digest/latest') {
        return null as never
      }

      if (url === '/api/projects/project-1/dashboard/today-live') {
        return [] as never
      }

      if (url === '/api/task-summaries/projects/project-1/task-summary/trend') {
        return [] as never
      }

      if (url === '/api/monthly-plans/projects/project-1/fulfillment-trend?months=6') {
        return [] as never
      }

      if (url.startsWith('/api/task-summaries/projects/project-1/task-summary/compare?')) {
        return [
          {
            period_label: '昨天',
            from: '2026-05-02',
            to: '2026-05-02',
            summary: {
              total_progress_change: 0,
              tasks_updated: 0,
              tasks_progressed: 0,
              tasks_completed: 0,
              total: 0,
              on_time: 0,
              delayed: 0,
              on_time_rate: 0,
            },
            task_ids: [],
            task_details: [],
          },
          {
            period_label: '今天',
            from: '2026-05-03',
            to: '2026-05-03',
            summary: {
              total_progress_change: 0,
              tasks_updated: 0,
              tasks_progressed: 0,
              tasks_completed: 0,
              total: 0,
              on_time: 0,
              delayed: 0,
              on_time_rate: 0,
            },
            task_ids: [],
            task_details: [],
          },
        ] as never
      }

      if (url === '/api/task-summaries/projects/project-1/task-summary?limit=1') {
        return null as never
      }

      if (url.startsWith('/api/task-summaries/projects/project-1/daily-progress?date=')) {
        return null as never
      }

      throw new Error(`Unexpected url: ${url}`)
    })
    syncProjectCacheFromApiSpy.mockResolvedValue([
      {
        id: 'project-1',
        name: '城市中心广场项目（二期）',
        description: '椤圭洰姒傚喌',
        status: 'active',
      },
    ] as never)
    dashboardSummarySpy.mockResolvedValue({
      id: 'project-1',
      name: '城市中心广场项目（二期）',
      status: 'active',
      statusLabel: '进行中',
      plannedEndDate: '2026-12-31',
      daysUntilPlannedEnd: 120,
      totalTasks: 16,
      leafTaskCount: 12,
      completedTaskCount: 7,
      inProgressTaskCount: 5,
      delayedTaskCount: 2,
      delayDays: 6,
      delayCount: 2,
      overallProgress: 64,
      taskProgress: 64,
      totalMilestones: 5,
      completedMilestones: 2,
      milestoneProgress: 40,
      riskCount: 3,
      activeRiskCount: 2,
      pendingConditionCount: 1,
      pendingConditionTaskCount: 1,
      activeObstacleCount: 1,
      activeObstacleTaskCount: 1,
      preMilestoneCount: 4,
      completedPreMilestoneCount: 2,
      activePreMilestoneCount: 1,
      overduePreMilestoneCount: 1,
      acceptancePlanCount: 3,
      passedAcceptancePlanCount: 1,
      inProgressAcceptancePlanCount: 1,
      failedAcceptancePlanCount: 1,
      constructionDrawingCount: 6,
      issuedConstructionDrawingCount: 3,
      reviewingConstructionDrawingCount: 2,
      attentionRequired: true,
      scheduleVarianceDays: 6,
      activeDelayRequests: 2,
      activeObstacles: 1,
      monthlyCloseStatus: '已超期',
      closeoutOverdueDays: 5,
      unreadWarningCount: 3,
      highestWarningLevel: 'critical',
      highestWarningSummary: '关键路径任务受阻',
      shiftedMilestoneCount: 2,
      criticalPathAffectedTasks: 1,
      healthScore: 81,
      healthStatus: '健康',
      nextMilestone: {
        id: 'milestone-1',
        name: '主体封顶',
        targetDate: '2026-08-30',
        status: 'in_progress',
        daysRemaining: 35,
      },
    } as never)
    companySummarySpy.mockResolvedValue({
      projectCount: 1,
      statusCounts: {
        total: 1,
        inProgress: 1,
        completed: 0,
        paused: 0,
        notStarted: 0,
      },
      averageHealth: 88,
      averageProgress: 72,
      attentionProjectCount: 1,
      lowHealthProjectCount: 0,
      overdueMilestoneProjectCount: 1,
      healthHistory: {
        thisMonth: 77,
        lastMonth: 72,
        change: 5,
        thisMonthPeriod: '2026-04',
        lastMonthPeriod: '2026-03',
        periods: [
          { period: '2026-03', value: 72 },
          { period: '2026-04', value: 77 },
        ],
      },
      ranking: [
        {
          id: 'project-1',
          name: '城市中心广场项目（二期）',
          status: 'active',
          statusLabel: '进行中',
          plannedEndDate: '2026-12-31',
          daysUntilPlannedEnd: 120,
          totalTasks: 16,
          leafTaskCount: 12,
          completedTaskCount: 7,
          inProgressTaskCount: 5,
          delayedTaskCount: 2,
          delayDays: 6,
          delayCount: 2,
          overallProgress: 72,
          taskProgress: 72,
          totalMilestones: 5,
          completedMilestones: 3,
          milestoneProgress: 60,
          riskCount: 3,
          activeRiskCount: 2,
          pendingConditionCount: 1,
          pendingConditionTaskCount: 1,
          activeObstacleCount: 1,
          activeObstacleTaskCount: 1,
          preMilestoneCount: 4,
          completedPreMilestoneCount: 2,
          activePreMilestoneCount: 1,
          overduePreMilestoneCount: 1,
          acceptancePlanCount: 3,
          passedAcceptancePlanCount: 1,
          inProgressAcceptancePlanCount: 1,
          failedAcceptancePlanCount: 1,
          constructionDrawingCount: 6,
          issuedConstructionDrawingCount: 3,
          reviewingConstructionDrawingCount: 2,
          attentionRequired: true,
          scheduleVarianceDays: 6,
          activeDelayRequests: 2,
          activeObstacles: 1,
          monthlyCloseStatus: '已超期',
          closeoutOverdueDays: 5,
          unreadWarningCount: 3,
          highestWarningLevel: 'critical',
          highestWarningSummary: '关键路径任务受阻',
          shiftedMilestoneCount: 2,
          criticalPathAffectedTasks: 1,
          healthScore: 88,
          healthStatus: '健康',
          nextMilestone: {
            id: 'milestone-1',
            name: '主体封顶',
            targetDate: '2026-08-30',
            status: 'in_progress',
            daysRemaining: 35,
          },
        },
      ],
    } as never)

    useStore.setState({
      currentProject: {
        id: 'project-1',
        name: '城市中心广场项目（二期）',
        description: '椤圭洰姒傚喌',
        status: 'active',
        planned_start_date: '2026-04-01',
        planned_end_date: '2026-12-31',
      } as never,
      projects: [] as never,
      tasks: [] as never,
      risks: [] as never,
      milestones: [] as never,
      conditions: [] as never,
      obstacles: [] as never,
      participantUnits: [] as never,
      scopeDimensions: [] as never,
    })

    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input)

      if (url.includes('/task-summary?limit=1')) {
        return {
          ok: true,
          json: async () => ({
            stats: {
              total_completed: 1,
              on_time_count: 1,
              delayed_count: 0,
            },
            groups: [
              {
                tasks: [
                  {
                    id: 'task-1',
                    title: '主体结构施工',
                    completed_at: '2026-04-02 18:00',
                    status_label: 'on_time',
                  },
                ],
              },
            ],
          }),
        } as never
      }

      if (url.includes('/task-summaries/projects/') && url.includes('/daily-progress?')) {
        return {
          ok: true,
          json: async () => ({
            success: true,
            data: {
              date: '2026-04-14',
              previous_date: '2026-04-13',
              progress_change: 12.5,
              tasks_updated: 3,
              tasks_completed: 1,
              details: [
                {
                  task_id: 'task-1',
                  task_title: '主体结构施工',
                  progress_before: 40,
                  progress_after: 55,
                  progress_delta: 15,
                  assignee: '张三',
                },
              ],
            },
          }),
        } as never
      }

      if (url.includes('/projects/') && url.includes('/daily-progress?')) {
        return {
          ok: true,
          json: async () => ({
            success: true,
            data: {
              snapshot_summary: {
                conditions_added: 3,
                conditions_closed: 1,
                obstacles_added: 2,
                obstacles_closed: 1,
                delayed_tasks: 2,
              },
            },
          }),
        } as never
      }

      if (url.includes('/task-summary/compare?')) {
        return {
          ok: true,
          json: async () => ({
            current: { totalTasks: 10, completedTasks: 6, overallProgress: 64 },
            previous: { totalTasks: 10, completedTasks: 4, overallProgress: 40 },
          }),
        } as never
      }

      throw new Error(`Unexpected fetch url: ${url}`)
    })

    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    mockedUseNavigate.mockReset()
    mockedUseAuth.mockReset()
    apiGetSpy.mockReset()
    syncProjectCacheFromApiSpy.mockReset()
    dashboardSummarySpy.mockReset()
    companySummarySpy.mockReset()
    useStore.setState({ currentProject: null } as never)
    useStore.setState({
      projects: [] as never,
      tasks: [] as never,
      risks: [] as never,
      milestones: [] as never,
      conditions: [] as never,
      obstacles: [] as never,
      participantUnits: [] as never,
      scopeDimensions: [] as never,
    })
    fetchMock.mockReset()
    vi.unstubAllGlobals()
    act(() => {
      root?.unmount()
    })
    root = null
    container.remove()
  })

  it('Dashboard only uses shared project summary', async () => {
    await act(async () => {
      root?.render(
        <MemoryRouter>
          <Dashboard />
        </MemoryRouter>,
      )
      await flush()
    })

    await waitForText(container, ['64%', '健康度 81分', '现场快照与对比'])

    expect(container.textContent).toContain('64%')
    expect(container.textContent).toContain('健康度 81分')
    expect(container.textContent).not.toContain('专项准备度')
    expect(dashboardSummarySpy).toHaveBeenCalledWith(
      'project-1',
      expect.objectContaining({ signal: expect.anything() }),
    )
  })

  it('surfaces dashboard summary failures instead of silently zeroing them', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    dashboardSummarySpy.mockRejectedValueOnce(new Error('summary failed'))

    await act(async () => {
      root?.render(
        <MemoryRouter>
          <Dashboard />
        </MemoryRouter>,
      )
      await flush()
    })

    const errorText = '\u9879\u76ee\u6458\u8981\u52a0\u8f7d\u5931\u8d25'
    await waitForText(container, [errorText])
    expect(container.textContent).toContain(errorText)
    consoleErrorSpy.mockRestore()
    expect(container.textContent).toContain('返回公司驾驶舱')
  })

  it('CompanyCockpit only uses shared project summaries', async () => {
    await act(async () => {
      root?.render(
        <MemoryRouter>
          <CompanyCockpit />
        </MemoryRouter>,
      )
      await flush()
    })

    await waitForText(container, ['项目总数', '活跃项目', '整体健康', '良好', '完成率', '风险数', '1 个项目异常', '关键路径任务受阻'])

    expect(container.textContent).toContain('项目总数')
    expect(container.textContent).toContain('72%')
    expect(container.textContent).toContain('88')
    expect(container.textContent).toContain('活跃项目')
    expect(container.textContent).toContain('整体健康')
    expect(container.textContent).toContain('良好')
    expect(container.textContent).toContain('完成率')
    expect(container.textContent).toContain('风险数')
    expect(container.textContent).toContain('任务列表')
    expect(container.textContent).toContain('关键路径任务受阻')
    expect(container.querySelectorAll('[data-testid="company-hero-metric"]')).toHaveLength(3)
    expect(container.querySelectorAll('svg[aria-label="趋势微图"]').length).toBeGreaterThanOrEqual(3)
    expect(container.querySelector('[data-testid="company-hero"]')).not.toBeNull()
    expect(container.querySelector('[data-testid="company-project-grid"]')?.className).toContain('xl:grid-cols-3')
    expect(container.querySelector('[data-testid="company-project-card"]')?.className).toContain('ring-orange-200')
    expect(companySummarySpy).toHaveBeenCalled()
    expect(apiGetSpy.mock.calls.some(([url]) => url === '/api/health-score/avg-history')).toBe(false)
    expect(syncProjectCacheFromApiSpy).toHaveBeenCalled()
  })

  it('CompanyCockpit shows the normal empty insight state when no project is anomalous', async () => {
    companySummarySpy.mockResolvedValueOnce({
      projectCount: 1,
      statusCounts: {
        total: 1,
        inProgress: 1,
        completed: 0,
        paused: 0,
        notStarted: 0,
      },
      averageHealth: 90,
      averageProgress: 90,
      attentionProjectCount: 0,
      lowHealthProjectCount: 0,
      overdueMilestoneProjectCount: 0,
      healthHistory: {
        thisMonth: 90,
        lastMonth: 90,
        change: 0,
        thisMonthPeriod: '2026-04',
        lastMonthPeriod: '2026-03',
        periods: [
          { period: '2026-03', value: 90 },
          { period: '2026-04', value: 90 },
        ],
      },
      ranking: [
        {
          id: 'project-1',
          name: '城市中心广场项目（二期）',
          status: 'active',
          statusLabel: '进行中',
          plannedEndDate: '2026-12-31',
          daysUntilPlannedEnd: 120,
          totalTasks: 10,
          leafTaskCount: 10,
          completedTaskCount: 9,
          inProgressTaskCount: 1,
          delayedTaskCount: 0,
          delayDays: 0,
          delayCount: 0,
          overallProgress: 90,
          taskProgress: 90,
          totalMilestones: 4,
          completedMilestones: 4,
          milestoneProgress: 100,
          riskCount: 0,
          activeRiskCount: 0,
          activeIssueCount: 0,
          pendingConditionCount: 0,
          pendingConditionTaskCount: 0,
          activeObstacleCount: 0,
          activeObstacleTaskCount: 0,
          preMilestoneCount: 0,
          completedPreMilestoneCount: 0,
          activePreMilestoneCount: 0,
          overduePreMilestoneCount: 0,
          acceptancePlanCount: 0,
          passedAcceptancePlanCount: 0,
          inProgressAcceptancePlanCount: 0,
          failedAcceptancePlanCount: 0,
          constructionDrawingCount: 0,
          issuedConstructionDrawingCount: 0,
          reviewingConstructionDrawingCount: 0,
          attentionRequired: false,
          scheduleVarianceDays: 0,
          activeDelayRequests: 0,
          activeObstacles: 0,
          monthlyCloseStatus: '已完成',
          closeoutOverdueDays: 0,
          unreadWarningCount: 0,
          highestWarningLevel: 'info',
          highestWarningSummary: null,
          shiftedMilestoneCount: 0,
          criticalPathAffectedTasks: 0,
          healthScore: 90,
          healthStatus: '健康',
          nextMilestone: null,
        },
      ],
    } as never)

    await act(async () => {
      root?.render(
        <MemoryRouter>
          <CompanyCockpit />
        </MemoryRouter>,
      )
      await flush()
    })

    await waitForText(container, ['所有项目运行正常'])

    expect(container.textContent).toContain('所有项目运行正常')
    expect(container.textContent).not.toContain('个项目异常')
  })

  it('CompanyCockpit does not keep frontend BI aggregation fallbacks', () => {
    const source = readFileSync(join(process.cwd(), 'src/pages/CompanyCockpit.tsx'), 'utf8')

    expect(source).not.toMatch(/reduce\(\(sum,\s*item\)\s*=>\s*sum\s*\+\s*item\.healthScore/)
    expect(source).not.toMatch(/reduce\(\(sum,\s*item\)\s*=>\s*sum\s*\+\s*item\.overallProgress/)
    expect(source).not.toMatch(/filter\(\(summary\)\s*=>\s*summary\.healthScore\s*<\s*60/)
    expect(source).not.toMatch(/summary\.attentionRequired\s*\|\|\s*summary\.healthScore\s*<\s*60/)
  })

  it('blocks regular users from loading company-wide cockpit data', async () => {
    mockedUseAuth.mockReturnValue(buildAuthState('regular'))

    await act(async () => {
      root?.render(
        <MemoryRouter>
          <CompanyCockpit />
        </MemoryRouter>,
      )
      await flush()
    })

    await waitForText(container, ['公司驾驶舱仅公司管理员可见'])

    expect(container.querySelector('[data-testid="company-cockpit-access-denied"]')).not.toBeNull()
    expect(companySummarySpy).not.toHaveBeenCalled()
    expect(syncProjectCacheFromApiSpy).not.toHaveBeenCalled()
  })
})
