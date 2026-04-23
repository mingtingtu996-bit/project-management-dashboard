import { act } from 'react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { PROJECT_NAVIGATION_LABELS } from '@/config/navigation'
import { useStore } from '@/hooks/useStore'
import Dashboard from '@/pages/Dashboard'
import { DashboardApiService } from '@/services/dashboardApi'

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return {
    ...actual,
    useNavigate: vi.fn(),
  }
})

const mockedUseNavigate = vi.mocked(useNavigate)

function flush() {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

function readDashboardSource() {
  const candidates = [
    join(process.cwd(), 'src/pages/Dashboard.tsx'),
    join(process.cwd(), 'client/src/pages/Dashboard.tsx'),
  ]

  for (const candidate of candidates) {
    try {
      return readFileSync(candidate, 'utf8')
    } catch {
      // Fall through to the alternate workspace root before failing.
    }
  }

  throw new Error(`Unable to locate Dashboard.tsx in: ${candidates.join(', ')}`)
}

function dataQualitySummaryResponse(projectId: string) {
  return {
    projectId,
    month: '2026-04',
    confidence: {
      score: 88,
      flag: 'high' as const,
      note: '当前数据质量稳定，可作为分析依据',
      timelinessScore: 92,
      anomalyScore: 86,
      consistencyScore: 89,
      coverageScore: 90,
      jumpinessScore: 83,
      activeFindingCount: 1,
      trendWarningCount: 0,
      anomalyFindingCount: 1,
      crossCheckFindingCount: 0,
      weights: {
        timeliness: 0.3,
        anomaly: 0.25,
        consistency: 0.2,
        jumpiness: 0.1,
        coverage: 0.15,
      },
      dimensions: [
        {
          key: 'anomaly',
          label: '异常检测命中率',
          score: 86,
          weight: 0.25,
          maxContribution: 25,
          actualContribution: 21.5,
          lossContribution: 3.5,
          lossShare: 43.75,
        },
        {
          key: 'jumpiness',
          label: '进度跳变率',
          score: 83,
          weight: 0.1,
          maxContribution: 10,
          actualContribution: 8.3,
          lossContribution: 1.7,
          lossShare: 21.25,
        },
      ],
    },
    prompt: {
      count: 0,
      summary: '当前没有需要额外提示的数据质量异常',
      items: [],
    },
    ownerDigest: {
      shouldNotify: false,
      severity: 'info' as const,
      scopeLabel: null,
      findingCount: 1,
      summary: '当前项目数据质量稳定',
    },
    findings: [],
  }
}

async function waitForSelector(container: HTMLElement, selector: string) {
  const deadline = Date.now() + 2500

  while (Date.now() < deadline) {
    await act(async () => {
      await flush()
    })

    if (container.querySelector(selector)) {
      return
    }
  }

  throw new Error(`Timed out waiting for selector: ${selector}`)
}

describe('Dashboard contract', () => {
  const projectId = 'project-1'
  let container: HTMLDivElement
  let root: Root | null = null
  const fetchMock = vi.fn()
  const getProjectSummarySpy = vi.spyOn(DashboardApiService, 'getProjectSummary')
  const getProjectCriticalPathSummarySpy = vi.spyOn(DashboardApiService, 'getProjectCriticalPathSummary')

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)

    mockedUseNavigate.mockReturnValue(vi.fn())
    getProjectSummarySpy.mockResolvedValue(null)
    getProjectCriticalPathSummarySpy.mockResolvedValue(null)

    useStore.setState({
      currentProject: {
        id: projectId,
        name: '示例项目',
        status: 'active',
        current_phase: 'construction',
        planned_start_date: '2026-04-01',
        planned_end_date: '2026-12-31',
      } as never,
      projects: [] as never,
      tasks: [] as never,
      risks: [] as never,
      milestones: [] as never,
      conditions: [] as never,
      obstacles: [] as never,
      acceptancePlans: [] as never,
      participantUnits: [] as never,
      scopeDimensions: [] as never,
    })

    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input)

      if (url.includes(`/api/task-summaries/projects/${projectId}/task-summary`)) {
        return {
          ok: true,
          json: async () => ({
            stats: {
              total_completed: 0,
              on_time_count: 0,
              delayed_count: 0,
            },
            groups: [{ tasks: [] }],
          }),
        } as never
      }

      if (url.includes(`/api/task-summaries/projects/${projectId}/daily-progress`)) {
        return {
          ok: true,
          json: async () => ({
            success: true,
            data: {
              date: '2026-04-15',
              previous_date: '2026-04-14',
              progress_change: 0,
              tasks_updated: 0,
              tasks_completed: 0,
              details: [],
            },
          }),
        } as never
      }

      if (url.includes(`/api/data-quality/project-summary?projectId=${projectId}`)) {
        return {
          ok: true,
          json: async () => dataQualitySummaryResponse(projectId),
        } as never
      }

      return {
        ok: true,
        json: async () => ({}),
      } as never
    })

    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    fetchMock.mockReset()
    mockedUseNavigate.mockReset()
    getProjectSummarySpy.mockReset()
    getProjectCriticalPathSummarySpy.mockReset()

    useStore.setState({ currentProject: null } as never)
    useStore.setState({
      projects: [] as never,
      tasks: [] as never,
      risks: [] as never,
      milestones: [] as never,
      conditions: [] as never,
      obstacles: [] as never,
      acceptancePlans: [] as never,
      participantUnits: [] as never,
      scopeDimensions: [] as never,
    } as never)

    act(() => {
      root?.unmount()
    })
    root = null
    container.remove()
    vi.unstubAllGlobals()
  })

  it('keeps the hero group, monthly trend, weekly digest, live panel, and snapshot areas visible', async () => {
    act(() => {
      root?.render(
        <MemoryRouter initialEntries={[`/projects/${projectId}/dashboard`]}>
          <Routes>
            <Route path="/projects/:id/dashboard" element={<Dashboard />} />
          </Routes>
        </MemoryRouter>,
      )
    })

    await waitForSelector(container, '[data-testid="dashboard-hero-cards"]')
    await waitForSelector(container, '[data-testid="dashboard-monthly-trend"]')
    await waitForSelector(container, '[data-testid="dashboard-weekly-digest"]')
    await waitForSelector(container, '[data-testid="dashboard-live-panel"]')
    await waitForSelector(container, '[data-testid="dashboard-snapshot-panel"]')

    expect(container.querySelector('[data-testid="dashboard-hero-cards"]')).toBeTruthy()
    expect(container.querySelectorAll('[data-testid^="dashboard-hero-card-"]').length).toBe(4)
    expect(container.querySelector('[data-testid="dashboard-live-panel"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="dashboard-snapshot-panel"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="dashboard-monthly-trend"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="dashboard-weekly-digest"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="dashboard-global-summary"]')).toBeTruthy()

    const planningSummary = container.querySelector('[data-testid="dashboard-monthly-trend"]')
    const weeklyDigest = container.querySelector('[data-testid="dashboard-weekly-digest"]')
    const livePanel = container.querySelector('[data-testid="dashboard-live-panel"]')
    const snapshotPanel = container.querySelector('[data-testid="dashboard-snapshot-panel"]')

    expect(planningSummary).toBeTruthy()
    expect(weeklyDigest).toBeTruthy()
    expect(livePanel).toBeTruthy()
    expect(snapshotPanel).toBeTruthy()

    expect(planningSummary!.compareDocumentPosition(weeklyDigest!) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0)
    expect(weeklyDigest!.compareDocumentPosition(livePanel!) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0)
    expect(livePanel!.compareDocumentPosition(snapshotPanel!) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0)

    expect(container.textContent).toContain('月度趋势将在任务完成后自动生成')
    expect(container.textContent).toContain('周报将在每周一自动生成，当前暂无数据')
    expect(container.textContent).toContain('全局摘要')
    expect(container.textContent).toContain('当下优先级信号区')
    expect(container.textContent).toContain('导流快照')
    expect(container.textContent).toContain('问题与风险快照')
    expect(container.textContent).toContain(PROJECT_NAVIGATION_LABELS.reports)
    expect(container.textContent).toContain('专项管理')
    expect(container.textContent).not.toContain('模块分析')
    expect(container.textContent).not.toContain('最高优先级问题')
    expect(container.textContent).not.toContain('证照管理')
    expect(container.textContent).not.toContain('项目脉冲')
    expect(container.textContent).toContain('月度趋势')
    expect(container.textContent).toContain('月度计划')
    expect(container.textContent).toContain('月末关账')
  })

  it('uses the shared dashboard label in the empty state', async () => {
    useStore.setState({ currentProject: null } as never)

    act(() => {
      root?.render(
        <MemoryRouter initialEntries={['/projects/project-1/dashboard']}>
          <Routes>
            <Route path="/projects/:id/dashboard" element={<Dashboard />} />
          </Routes>
        </MemoryRouter>,
      )
    })

    await waitForSelector(container, '[data-testid="dashboard-empty-state"]')

    expect((container.textContent || '').replace(/\s+/g, '')).toContain(`请先进入一个项目，再查看项目${PROJECT_NAVIGATION_LABELS.dashboard}。`)
    expect(container.textContent).not.toContain('项目 Dashboard')
  })

  it('expands weekly digest details by default when digest data exists', async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input)

      if (url.includes(`/api/projects/${projectId}/weekly-digest/latest`)) {
        return {
          ok: true,
          json: async () => ({
            data: {
              id: 'digest-1',
              project_id: projectId,
              week_start: '2026-04-20',
              generated_at: '2026-04-21T01:00:00.000Z',
              overall_progress: 68,
              health_score: 84,
              progress_change: 3.5,
              completed_tasks_count: 5,
              completed_milestones_count: 1,
              critical_tasks_count: 3,
              critical_blocked_count: 1,
              critical_nearest_milestone: '结构封顶',
              critical_nearest_delay_days: 2,
              top_delayed_tasks: [
                { task_id: 'task-1', title: '主体结构施工', assignee: '张工', delay_days: 4 },
              ],
              abnormal_responsibilities: [
                { subject_id: 'resp-1', name: '主体施工单位', type: '施工' },
              ],
              new_risks_count: 2,
              new_obstacles_count: 1,
              max_risk_level: 'high',
            },
          }),
        } as never
      }

      return {
        ok: true,
        json: async () => ({}),
      } as never
    })

    act(() => {
      root?.render(
        <MemoryRouter initialEntries={[`/projects/${projectId}/dashboard`]}>
          <Routes>
            <Route path="/projects/:id/dashboard" element={<Dashboard />} />
          </Routes>
        </MemoryRouter>,
      )
    })

    await waitForSelector(container, '[data-testid="dashboard-weekly-digest"]')

    expect(container.textContent).toContain('Top 5 偏差任务')
    expect(container.textContent).toContain('责任主体异常')
    expect(container.textContent).toContain('本周新增风险 2 条 / 阻碍 1 条')
    expect(container.textContent).toContain('主体施工单位')
    expect(container.textContent).toContain('收起')
  })

  it('opens a confidence breakdown dialog from the dashboard hero area', async () => {
    act(() => {
      root?.render(
        <MemoryRouter initialEntries={[`/projects/${projectId}/dashboard`]}>
          <Routes>
            <Route path="/projects/:id/dashboard" element={<Dashboard />} />
          </Routes>
        </MemoryRouter>,
      )
    })

    await waitForSelector(container, '[data-testid="dashboard-data-quality-detail-trigger"]')
    const trigger = container.querySelector('[data-testid="dashboard-data-quality-detail-trigger"]') as HTMLButtonElement

    await act(async () => {
      trigger.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await flush()
    })

    await waitForSelector(document.body, '[data-testid="dashboard-data-quality-detail-dialog"]')
    expect(document.body.textContent).toContain('数据置信度维度分解')
    expect(document.body.textContent).toContain('本月各维度降分贡献')
    expect(document.body.textContent).toContain('异常检测命中率')
  })

  it('shows planning governance signals in the hero area when shared summary reports active governance states', async () => {
    getProjectSummarySpy.mockResolvedValue({
      id: projectId,
      name: '示例项目',
      status: 'active',
      statusLabel: '进行中',
      plannedEndDate: '2026-12-31',
      daysUntilPlannedEnd: 254,
      totalTasks: 10,
      leafTaskCount: 8,
      completedTaskCount: 2,
      inProgressTaskCount: 4,
      delayedTaskCount: 1,
      delayDays: 3,
      delayCount: 1,
      overallProgress: 35,
      taskProgress: 35,
      totalMilestones: 3,
      completedMilestones: 1,
      milestoneProgress: 33,
      riskCount: 1,
      activeRiskCount: 1,
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
      healthScore: 72,
      healthStatus: '亚健康',
      nextMilestone: null,
      milestoneOverview: {
        items: [],
        stats: {
          total: 0,
          pending: 0,
          completed: 0,
          overdue: 0,
          upcomingSoon: 0,
          completionRate: 0,
        },
      },
      planningGovernance: {
        activeCount: 3,
        closeoutOverdueSignalCount: 1,
        closeoutForceUnlockCount: 1,
        reorderReminderCount: 0,
        reorderEscalationCount: 0,
        reorderSummaryCount: 1,
        adHocReminderCount: 0,
        dashboardCloseoutOverdue: true,
        dashboardForceUnlockAvailable: true,
        hasActiveGovernanceSignal: true,
      },
    })

    act(() => {
      root?.render(
        <MemoryRouter initialEntries={[`/projects/${projectId}/dashboard`]}>
          <Routes>
            <Route path="/projects/:id/dashboard" element={<Dashboard />} />
          </Routes>
        </MemoryRouter>,
      )
    })

    await waitForSelector(container, '[data-testid="dashboard-governance-signal"]')

    const governanceSignal = container.querySelector('[data-testid="dashboard-governance-signal"]')
    expect(governanceSignal?.textContent).toContain('计划治理信号')
    expect(governanceSignal?.textContent).toContain('关账超期信号已触发')
    expect(governanceSignal?.textContent).toContain('第 7 日强制发起关账权限可用')
    expect(governanceSignal?.textContent).toContain('重排摘要 1 条')

    const monthlyEntry = container.querySelector('[data-testid="dashboard-governance-open-monthly"]')
    const closeoutEntry = container.querySelector('[data-testid="dashboard-governance-open-closeout"]')
    expect(monthlyEntry?.getAttribute('href')).toBe(`/projects/${projectId}/planning/monthly`)
    expect(closeoutEntry?.getAttribute('href')).toBe(`/projects/${projectId}/planning/closeout`)
  })

  it('reads live panel data from shared slices instead of page-local fetch truth', () => {
    const source = readDashboardSource()

    expect(source).toContain('const warnings = useStore((state) => state.warnings)')
    expect(source).toContain('const liveWarnings = useMemo(')
    expect(source).not.toContain('const [liveWarnings, setLiveWarnings]')
    expect(source).not.toContain('apiGet(`/api/warnings?projectId=')
    expect(source).not.toContain('apiGet(`/api/issues?projectId=')
    expect(source).not.toContain('apiGet(`/api/task-obstacles?projectId=')
    expect(source).not.toContain('apiGet(`/api/change-logs?projectId=')
  })
})
