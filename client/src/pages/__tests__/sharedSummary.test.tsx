import type { ReactNode } from 'react'

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
const cockpitSummarySpy = vi.spyOn(DashboardApiService, 'getAllProjectsSummary')

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
      if (url === '/api/health-score/avg-history') {
        return {
          thisMonth: 77,
          lastMonth: 72,
          change: 5,
          lastMonthPeriod: '2026-03',
        } as never
      }

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
            title: '结构专业提资滞后',
            severity: 'high',
            status: 'open',
          },
        ] as never
      }

      if (url === '/api/projects/project-1/weekly-digest/latest') {
        return null as never
      }

      if (url === '/api/task-summaries/projects/project-1/task-summary/trend') {
        return [] as never
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
    cockpitSummarySpy.mockResolvedValue([
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
    ] as never)

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
    cockpitSummarySpy.mockReset()
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

    await waitForText(container, ['64%', '81', '2/5', '现场快照与对比'])

    expect(container.textContent).toContain('64%')
    expect(container.textContent).toContain('81')
    expect(container.textContent).toContain('2/5')
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

    await waitForText(container, ['项目总数', '平均总体进度', '平均健康度', '需关注项目数', '任务列表', '关键路径任务受阻'])

    expect(container.textContent).toContain('项目总数')
    expect(container.textContent).toContain('72%')
    expect(container.textContent).toContain('88')
    expect(container.textContent).toContain('需关注项目数')
    expect(container.textContent).toContain('专项进展')
    expect(container.textContent).toContain('证照')
    expect(container.textContent).toContain('验收')
    expect(container.textContent).toContain('图纸')
    expect(container.textContent).toContain('任务列表')
    expect(container.textContent).toContain('关键路径任务受阻')
    expect(cockpitSummarySpy).toHaveBeenCalled()
    expect(syncProjectCacheFromApiSpy).toHaveBeenCalled()
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
    expect(cockpitSummarySpy).not.toHaveBeenCalled()
    expect(syncProjectCacheFromApiSpy).not.toHaveBeenCalled()
  })
})
