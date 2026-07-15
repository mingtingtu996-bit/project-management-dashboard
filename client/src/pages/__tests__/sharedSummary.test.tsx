import type { ReactNode } from 'react'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { act } from 'react'
import { fireEvent } from '@testing-library/react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, useNavigate } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import CompanyCockpit from '../CompanyCockpit'
import Dashboard from '../Dashboard'
import { useAuth } from '@/context/AuthContext'
import { useStore } from '@/hooks/useStore'
import * as apiClient from '@/lib/apiClient'
import * as projectApi from '@/lib/projectApi'
import { DashboardApiService } from '@/services/dashboardApi'
import type { WorkspaceData } from '@/hooks/useWorkspaceData'

function readClientSource(relativePath: string) {
  const candidates = [
    join(process.cwd(), relativePath),
    join(process.cwd(), 'client', relativePath),
  ]
  const filePath = candidates.find((candidate) => existsSync(candidate))
  if (!filePath) throw new Error(`Unable to locate ${relativePath} in: ${candidates.join(', ')}`)
  return readFileSync(filePath, 'utf8')
}

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return {
    ...actual,
    useNavigate: vi.fn(),
  }
})

vi.mock('@/context/AuthContext', async () => {
  const actual = await vi.importActual<typeof import('@/context/AuthContext')>('@/context/AuthContext')
  return { ...actual, useAuth: vi.fn() }
})

const workspaceMock = vi.hoisted(() => ({
  state: null as WorkspaceData | null,
}))

vi.mock('@/hooks/useWorkspaceData', () => ({
  useWorkspaceData: () => {
    if (!workspaceMock.state) throw new Error('workspace mock not configured')
    return workspaceMock.state
  },
}))

const mockedUseNavigate = vi.mocked(useNavigate)
const mockedUseAuth = vi.mocked(useAuth)
const apiGetSpy = vi.spyOn(apiClient, 'apiGet')
const fetchProjectsFromApiSpy = vi.spyOn(projectApi, 'fetchProjectsFromApi')
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
    syncCurrentCompanyContext: vi.fn(),
  }
}

function buildWorkspaceState(role: 'company_admin' | 'regular' = 'company_admin'): WorkspaceData {
  return {
    loading: false,
    error: null,
    hasCompany: true,
    currentCompany: {
      id: 'company-1',
      name: '华东一公司',
      role,
      isCurrent: true,
    },
    switchableCompanies: [],
    myProjects: [],
    recentProjects: [],
    companyProjects: [],
    joinableProjects: [],
    pendingInvitations: [],
    joinRequests: [],
    demoEntry: null,
    emptyStateReason: null,
    refresh: vi.fn(),
    createCompany: vi.fn(),
    switchCompany: vi.fn(),
    acceptInvitation: vi.fn(),
    declineInvitation: vi.fn(),
    requestJoinProject: vi.fn(),
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
    workspaceMock.state = buildWorkspaceState('company_admin')
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

      if (url === '/api/projects/project-1/dashboard/today-progress') {
        return [] as never
      }

      if (url.startsWith('/api/projects/project-1/dashboard/focus-tasks?')) {
        return {
          filter: 'week',
          stats: { total: 0, overdue: 0, urgent: 0, approaching: 0, normal: 0 },
          items: [],
          totalCount: 0,
        } as never
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
    fetchProjectsFromApiSpy.mockResolvedValue([
      {
        id: 'project-1',
        name: '城市中心广场项目（二期）',
        description: '项目概况',
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
      activeDelayedTasks: 2,
      activeObstacles: 1,
      monthlyCloseStatus: '已超期',
      closeoutOverdueDays: 5,
      unreadWarningCount: 3,
      highestWarningLevel: 'critical',
      highestWarningSummary: '关键路径任务受阻',
      shiftedMilestoneCount: 2,
      criticalPathAffectedTasks: 1,
      businessHealthScore: 81,
      healthStatus: '健康',
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
      totalUnreadWarningCount: 3,
      totalDelayedTaskCount: 2,
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
          activeDelayedTasks: 2,
          activeObstacles: 1,
          monthlyCloseStatus: '已超期',
          closeoutOverdueDays: 5,
          unreadWarningCount: 3,
          highestWarningLevel: 'critical',
          highestWarningSummary: '关键路径任务受阻',
          shiftedMilestoneCount: 2,
          criticalPathAffectedTasks: 1,
          businessHealthScore: 88,
          healthStatus: '健康',
        },
      ],
    } as never)

    useStore.setState({
      currentProject: {
        id: 'project-1',
        name: '城市中心广场项目（二期）',
        description: '项目概况',
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
    workspaceMock.state = null
    apiGetSpy.mockReset()
    fetchProjectsFromApiSpy.mockReset()
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

    await waitForText(container, ['64%', '业务健康 81分'])

    expect(container.textContent).toContain('64%')
    expect(container.textContent).toContain('业务健康 81分')
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
    expect(container.textContent).toContain('返回工作台')
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

    await waitForText(container, ['组合信号 88 分', '1 个项目建议优先查看', '本周建议优先查看', '关键路径任务受阻'])

    expect(container.textContent).toContain('组合信号 88 分')
    expect(container.textContent).toContain('1 个项目建议优先查看')
    expect(container.textContent).toContain('本周建议优先查看')
    expect(container.textContent).toContain('72%')
    expect(container.textContent).toContain('88')
    expect(container.textContent).toContain('完成率')
    expect(container.textContent).toContain('风险数')
    expect(container.textContent).toContain('任务列表')
    expect(container.textContent).toContain('关键路径任务受阻')
    expect(container.querySelectorAll('[data-testid="company-hero-metric"]')).toHaveLength(0)
    expect(container.querySelector('[data-testid="company-health-overview"]')).not.toBeNull()
    expect(container.querySelector('[data-testid="company-action-focus"]')).not.toBeNull()
    expect(container.querySelectorAll('[data-testid="company-action-item"]')).toHaveLength(1)
    expect(container.querySelector('[data-testid="company-hero"]')).not.toBeNull()
    expect(container.querySelector('[data-testid="company-project-compact-list"]')).not.toBeNull()
    expect(container.querySelector('[data-testid="company-project-card"]')).toBeNull()
    expect(container.querySelector('[data-testid="company-project-row"]')?.textContent).toContain('城市中心广场项目（二期）')
    expect(companySummarySpy).toHaveBeenCalled()
    expect(apiGetSpy.mock.calls.some(([url]) => url === '/api/health-score/avg-history')).toBe(false)
    expect(fetchProjectsFromApiSpy).toHaveBeenCalled()
  })

  it('CompanyCockpit renders the company summary before the project catalog sync finishes', async () => {
    let resolveProjects!: (projects: Awaited<ReturnType<typeof projectApi.fetchProjectsFromApi>>) => void
    fetchProjectsFromApiSpy.mockReturnValueOnce(new Promise((resolve) => {
      resolveProjects = resolve
    }))

    await act(async () => {
      root?.render(
        <MemoryRouter>
          <CompanyCockpit />
        </MemoryRouter>,
      )
      await flush()
    })

    await waitForText(container, ['组合信号 88 分', '正在同步项目目录', '城市中心广场项目（二期）'])
    expect(companySummarySpy).toHaveBeenCalled()
    expect(fetchProjectsFromApiSpy).toHaveBeenCalled()

    await act(async () => {
      resolveProjects([
        {
          id: 'project-1',
          name: '城市中心广场项目（二期）',
          description: '项目概况',
          status: 'active',
        },
      ] as never)
      await flush()
    })

    await waitForText(container, ['当前显示 1 / 1 个项目'])
    expect(container.textContent).not.toContain('项目目录同步中')
  })

  it('CompanyCockpit sanitizes internal draft names before showing the draft menu', async () => {
    apiGetSpy.mockImplementation(async (url: string) => {
      if (url === '/api/risks') return [] as never
      if (url === '/api/issues') return [] as never
      if (url === '/api/companies/company-1/project-drafts') {
        return [
          { id: 'draft-shadow', name: '[shadow] 西校区学生宿舍', status: 'wizard_draft', draft_step: 6, updated_at: '2026-05-27T11:56:00.000Z' },
          { id: 'draft-codex', name: 'Codex C18 L09 disposal', status: 'wizard_draft', draft_step: 6, updated_at: '2026-06-29T04:14:00.000Z' },
          { id: 'draft-question', name: '??????????', status: 'wizard_draft', draft_step: 6, updated_at: '2026-05-31T11:42:00.000Z' },
        ] as never
      }
      return [] as never
    })

    await act(async () => {
      root?.render(
        <MemoryRouter>
          <CompanyCockpit />
        </MemoryRouter>,
      )
      await flush()
    })

    await waitForText(container, ['草稿 (3)'])
    const draftButton = Array.from(container.querySelectorAll('button'))
      .find((button) => button.textContent?.includes('草稿'))
    expect(draftButton).toBeTruthy()

    fireEvent.click(draftButton as HTMLButtonElement)

    expect(container.textContent).toContain('候选项目')
    expect(container.textContent).not.toContain('[shadow]')
    expect(container.textContent).not.toContain('Codex')
    expect(container.textContent).not.toContain('??????????')
  })

  it('CompanyCockpit shows a degraded summary error instead of an empty-project state when initial summary fails', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    fetchProjectsFromApiSpy.mockResolvedValueOnce([] as never)
    companySummarySpy.mockRejectedValueOnce(new Error('summary failed'))

    await act(async () => {
      root?.render(
        <MemoryRouter>
          <CompanyCockpit />
        </MemoryRouter>,
      )
      await flush()
    })

    await waitForText(container, ['公司驾驶舱加载失败', '重新加载'])

    expect(container.textContent).not.toContain('暂无项目')
    expect(companySummarySpy).toHaveBeenCalled()
    consoleErrorSpy.mockRestore()
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
      totalUnreadWarningCount: 0,
      totalDelayedTaskCount: 0,
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
          activeDelayedTasks: 0,
          activeObstacles: 0,
          monthlyCloseStatus: '已完成',
          closeoutOverdueDays: 0,
          unreadWarningCount: 0,
          highestWarningLevel: 'info',
          highestWarningSummary: null,
          shiftedMilestoneCount: 0,
          criticalPathAffectedTasks: 0,
          businessHealthScore: 90,
          healthStatus: '健康',
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

    await waitForText(container, ['项目组合运行平稳'])

    expect(container.textContent).toContain('项目组合运行平稳')
    expect(container.textContent).not.toContain('个项目异常')
  })

  it('CompanyCockpit does not keep frontend BI aggregation fallbacks', () => {
    const source = readClientSource('src/pages/CompanyCockpit.tsx')

    expect(source).not.toMatch(/reduce\(\(sum,\s*item\)\s*=>\s*sum\s*\+\s*item\.businessHealthScore/)
    expect(source).not.toMatch(/reduce\(\(sum,\s*item\)\s*=>\s*sum\s*\+\s*item\.overallProgress/)
    expect(source).not.toMatch(/filter\(\(summary\)\s*=>\s*summary\.businessHealthScore\s*<\s*60/)
    expect(source).not.toMatch(/summary\.attentionRequired\s*\|\|\s*summary\.businessHealthScore\s*<\s*60/)
  })

  it('redirects regular users away from company-wide cockpit data', async () => {
    const navigateSpy = vi.fn()
    mockedUseNavigate.mockReturnValue(navigateSpy)
    mockedUseAuth.mockReturnValue(buildAuthState('regular'))
    workspaceMock.state = buildWorkspaceState('regular')

    await act(async () => {
      root?.render(
        <MemoryRouter>
          <CompanyCockpit />
        </MemoryRouter>,
      )
      await flush()
    })

    expect(navigateSpy).toHaveBeenCalledWith('/workspace', { replace: true })
    expect(companySummarySpy).not.toHaveBeenCalled()
    expect(fetchProjectsFromApiSpy).not.toHaveBeenCalled()
  })

  it('allows company cockpit when workspace current company membership is admin even if auth payload is stale regular', async () => {
    const navigateSpy = vi.fn()
    mockedUseNavigate.mockReturnValue(navigateSpy)
    mockedUseAuth.mockReturnValue(buildAuthState('regular'))
    workspaceMock.state = buildWorkspaceState('company_admin')

    await act(async () => {
      root?.render(
        <MemoryRouter>
          <CompanyCockpit />
        </MemoryRouter>,
      )
      await flush()
    })

    await waitForText(container, ['组合信号'])

    expect(navigateSpy).not.toHaveBeenCalledWith('/workspace', { replace: true })
    expect(companySummarySpy).toHaveBeenCalled()
    expect(fetchProjectsFromApiSpy).toHaveBeenCalled()
  })

  it('redirects when workspace confirms there is no current company even if auth payload is stale admin', async () => {
    const navigateSpy = vi.fn()
    mockedUseNavigate.mockReturnValue(navigateSpy)
    mockedUseAuth.mockReturnValue(buildAuthState('company_admin'))
    workspaceMock.state = {
      ...buildWorkspaceState('company_admin'),
      hasCompany: false,
      currentCompany: null,
      emptyStateReason: 'no_company',
    }

    await act(async () => {
      root?.render(
        <MemoryRouter>
          <CompanyCockpit />
        </MemoryRouter>,
      )
      await flush()
    })

    expect(navigateSpy).toHaveBeenCalledWith('/workspace', { replace: true })
    expect(companySummarySpy).not.toHaveBeenCalled()
    expect(fetchProjectsFromApiSpy).not.toHaveBeenCalled()
  })
})
