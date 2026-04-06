import type { ReactNode } from 'react'

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import CompanyCockpit from '../CompanyCockpit'
import Dashboard from '../Dashboard'
import RiskManagement from '../RiskManagement'
import TaskSummary from '../TaskSummary'
import { useStore } from '@/hooks/useStore'
import * as apiClient from '@/lib/apiClient'
import * as projectPersistence from '@/lib/projectPersistence'
import { buildProjectTaskProgressSnapshot } from '@/lib/taskBusinessStatus'
import { buildTaskTimelineDetailSnapshot, buildTaskTimelineEvents } from '@/lib/taskTimeline'
import { DashboardApiService } from '@/services/dashboardApi'

vi.mock('@/components/Breadcrumb', () => ({
  Breadcrumb: ({ items, showHome }: { items: Array<{ label: string }>; showHome?: boolean }) => (
    <nav>
      {showHome ? <span>首页</span> : null}
      {items.map((item) => (
        <span key={item.label}>{item.label}</span>
      ))}
    </nav>
  ),
}))

vi.mock('@/components/ReadOnlyGuard', () => ({
  ReadOnlyGuard: ({ children }: { children: ReactNode }) => <>{children}</>,
}))

const apiGetSpy = vi.spyOn(apiClient, 'apiGet')
const syncProjectCacheFromApiSpy = vi.spyOn(projectPersistence, 'syncProjectCacheFromApi')
const dashboardSummarySpy = vi.spyOn(DashboardApiService, 'getProjectSummary')
const cockpitSummarySpy = vi.spyOn(DashboardApiService, 'getAllProjectsSummary')

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

function jsonResponse(data: unknown) {
  return {
    ok: true,
    json: async () => data,
  } as never
}

describe('system main chains', () => {
  const projectId = 'project-1'
  const projectName = '城市中心广场项目（二期）'
  const confirmedKey = `risk-management:confirmed-warnings:${projectId}`

  const sharedSummary = {
    id: projectId,
    name: projectName,
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
    healthScore: 81,
    healthStatus: '健康',
    nextMilestone: {
      id: 'milestone-1',
      name: '主体封顶',
      targetDate: '2026-08-30',
      status: 'in_progress',
      daysRemaining: 35,
    },
    milestoneOverview: {
      stats: {
        total: 2,
        pending: 1,
        completed: 1,
        overdue: 0,
        upcomingSoon: 1,
        completionRate: 50,
      },
      items: [
        {
          id: 'm1',
          name: '主体封顶',
          description: '结构施工关键节点',
          targetDate: '2026-04-01',
          progress: 100,
          status: 'completed',
          statusLabel: '已完成',
          updatedAt: '2026-04-01T00:00:00.000Z',
        },
        {
          id: 'm2',
          name: '地下室施工',
          description: '正在推进',
          targetDate: '2026-04-06',
          progress: 60,
          status: 'soon',
          statusLabel: '即将到期',
          updatedAt: '2026-04-02T00:00:00.000Z',
        },
      ],
    },
  }

  const taskTimelineTasks = [
    {
      id: 'task-1',
      title: '主体结构施工',
      status: 'in_progress',
      progress: 40,
      is_milestone: true,
      updated_at: '2026-04-02T08:00:00.000Z',
      planned_end_date: '2000-01-01T00:00:00.000Z',
      created_at: '2026-04-01T08:00:00.000Z',
    },
  ]

  const taskTimelineConditions = [
    {
      id: 'condition-1',
      task_id: 'task-1',
      condition_name: '工作面移交',
      description: '工作面尚未移交',
      status: '未满足',
      created_at: '2026-04-02T07:00:00.000Z',
    },
  ]

  const taskTimelineObstacles = [
    {
      id: 'obstacle-1',
      task_id: 'task-1',
      description: '材料未到场',
      status: '处理中',
      created_at: '2026-04-02T07:30:00.000Z',
    },
  ]

  const riskWarnings = [
    {
      id: 'warning-1',
      task_id: 'task-1',
      warning_type: 'condition_expired',
      warning_level: 'warning',
      title: '开工条件即将到期',
      description: '工作面移交待确认',
      is_acknowledged: false,
      created_at: '2026-04-02T07:00:00.000Z',
    },
    {
      id: 'warning-2',
      task_id: 'task-2',
      warning_type: 'obstacle_timeout',
      warning_level: 'warning',
      title: '阻碍已持续3天',
      description: '材料未到场',
      is_acknowledged: false,
      created_at: '2026-04-02T08:00:00.000Z',
    },
  ]

  const activeRisk = {
    id: 'risk-1',
    project_id: projectId,
    task_id: 'task-2',
    title: '既有风险',
    description: '已有的风险记录',
    category: 'schedule',
    level: 'medium',
    probability: 50,
    impact: 50,
    status: 'identified',
    mitigation_plan: '',
    created_at: '2026-04-01T00:00:00.000Z',
    updated_at: '2026-04-01T00:00:00.000Z',
    version: 1,
  }

  const activeProblem = {
    id: 'problem-1',
    task_id: 'task-3',
    description: '材料未到',
    obstacle_type: 'material',
    severity: 'medium',
    status: 'active',
    responsible_person: '张三',
    responsible_unit: '总包单位',
    expected_resolution_date: '2026-04-05T00:00:00.000Z',
    resolution_notes: '',
    resolved_at: '',
    created_at: '2026-04-01T00:00:00.000Z',
    updated_at: '2026-04-01T00:00:00.000Z',
  }

  let container: HTMLDivElement
  let root: Root | null = null
  const fetchMock = vi.fn()

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)

    useStore.setState({
      currentProject: {
        id: projectId,
        name: projectName,
        description: '综合项目',
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
    })

    apiGetSpy.mockImplementation(async (url: string) => {
      if (url === '/api/health-score/avg-history') {
        return {
          thisMonth: 77,
          lastMonth: 72,
          change: 5,
          lastMonthPeriod: '2026-03',
        } as never
      }

      if (url.includes('/api/warnings')) return riskWarnings as never
      if (url.includes('/api/risks')) return [activeRisk] as never
      if (url.includes('/api/task-obstacles')) return [activeProblem] as never

      throw new Error(`Unexpected url: ${url}`)
    })

    syncProjectCacheFromApiSpy.mockResolvedValue([
      {
        id: projectId,
        name: projectName,
        description: '综合项目',
        status: 'active',
      },
    ] as never)

    dashboardSummarySpy.mockResolvedValue(sharedSummary as never)
    cockpitSummarySpy.mockResolvedValue([sharedSummary as never])

    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input)

      if (url.includes('/task-summary/assignees')) {
        return jsonResponse({ success: true, data: [] })
      }

      if (url.includes('/daily-progress?')) {
        return jsonResponse({ success: true, data: null })
      }

      if (url.includes('/task-summary?')) {
        return jsonResponse({
          success: true,
          data: {
            stats: {
              total_completed: 1,
              on_time_count: 1,
              delayed_count: 0,
              completed_milestone_count: 1,
              avg_delay_days: 0,
            },
            groups: [
              {
                id: 'g1',
                name: '主体结构',
                status: 'completed',
                tasks: [
                  {
                    id: 'task-1',
                    title: '主体结构施工',
                    assignee: '张三',
                    building: '1#楼',
                    section: '土建',
                    completed_at: '2026-04-02 18:00',
                    planned_end_date: '2026-04-01',
                    actual_duration: 2,
                    planned_duration: 1,
                    subtask_total: 2,
                    subtask_on_time: 1,
                    subtask_delayed: 1,
                    delay_total_days: 1,
                    delay_records: [
                      {
                        id: 'delay-1',
                        delay_days: 1,
                        reason: '材料未到',
                        recorded_at: '2026-04-01',
                      },
                    ],
                    status_label: 'on_time',
                    confirmed: true,
                  },
                ],
              },
            ],
            timeline_ready: true,
            timeline_events: buildTaskTimelineEvents(
              taskTimelineTasks as never,
              taskTimelineConditions as never,
              taskTimelineObstacles as never,
            ),
          },
        })
      }

      throw new Error(`Unexpected fetch url: ${url}`)
    })

    vi.stubGlobal('fetch', fetchMock)

    window.localStorage.getItem.mockImplementation((key: string) =>
      key === confirmedKey ? JSON.stringify([]) : null,
    )
    window.localStorage.setItem.mockImplementation(() => undefined)
    window.localStorage.removeItem.mockImplementation(() => undefined)
    window.localStorage.clear.mockImplementation(() => undefined)
  })

  afterEach(() => {
    apiGetSpy.mockReset()
    syncProjectCacheFromApiSpy.mockReset()
    dashboardSummarySpy.mockReset()
    cockpitSummarySpy.mockReset()
    fetchMock.mockReset()
    useStore.setState({ currentProject: null } as never)
    useStore.setState({
      projects: [] as never,
      tasks: [] as never,
      risks: [] as never,
      milestones: [] as never,
      conditions: [] as never,
      obstacles: [] as never,
    })

    act(() => {
      root?.unmount()
    })
    root = null
    container.remove()
    vi.unstubAllGlobals()
  })

  it('task main chain and task summary stay on one shared event source', () => {
    const snapshot = buildProjectTaskProgressSnapshot(
      taskTimelineTasks as never,
      taskTimelineConditions as never,
      taskTimelineObstacles as never,
    )

    const events = buildTaskTimelineEvents(
      taskTimelineTasks as never,
      taskTimelineConditions as never,
      taskTimelineObstacles as never,
    )

    const detail = buildTaskTimelineDetailSnapshot(events, 'task-1', '主体结构施工')

    expect(snapshot.delayedTaskCount).toBe(1)
    expect(snapshot.pendingConditionTaskCount).toBe(1)
    expect(snapshot.activeObstacleTaskCount).toBe(1)
    expect(events.map((event) => event.kind)).toEqual(['milestone', 'task', 'obstacle', 'condition'])
    expect(detail.taskEvents.length).toBe(4)
    expect(detail.taskSummary).toMatchObject({
      taskId: 'task-1',
      total: 4,
      taskCount: 1,
      milestoneCount: 1,
      conditionCount: 1,
      obstacleCount: 1,
    })
    expect(detail.narrative.headline).toContain('主体结构施工')
    expect(detail.narrative.summaryLines.join(' ')).toContain('4 条事实')
  })

  it('RiskManagement keeps warnings, risks, and problems split but connected', async () => {
    await act(async () => {
      root?.render(
        <MemoryRouter initialEntries={['/projects/project-1/risks']}>
          <Routes>
            <Route path="/projects/:id/risks" element={<RiskManagement />} />
          </Routes>
        </MemoryRouter>,
      )
      await flush()
    })

    await waitForText(container, ['问题与风险', '预警', '风险', '问题', '开工条件即将到期', '既有风险', '材料未到'])
  })

  it('Dashboard consumes the shared summary path', async () => {
    await act(async () => {
      root?.render(
        <MemoryRouter>
          <Dashboard />
        </MemoryRouter>,
      )
      await flush()
    })

    await waitForText(container, ['64%', '81', '2/5'])
    expect(dashboardSummarySpy).toHaveBeenCalledWith(projectId)
  })

  it('CompanyCockpit consumes the shared summary path', async () => {
    await act(async () => {
      root?.render(
        <MemoryRouter>
          <CompanyCockpit />
        </MemoryRouter>,
      )
      await flush()
    })

    await waitForText(container, ['64%', '81'])
    expect(syncProjectCacheFromApiSpy).toHaveBeenCalled()
    expect(cockpitSummarySpy).toHaveBeenCalled()
  })
})
