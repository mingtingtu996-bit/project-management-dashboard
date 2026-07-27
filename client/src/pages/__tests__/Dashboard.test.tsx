import { act } from 'react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { PROJECT_NAVIGATION_LABELS } from '@/config/navigation'
import { useStore } from '@/hooks/useStore'
import Dashboard from '@/pages/Dashboard'
import { DashboardApiService, type ProjectSummary } from '@/services/dashboardApi'

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

function readAppSource() {
  const candidates = [
    join(process.cwd(), 'src/App.tsx'),
    join(process.cwd(), 'client/src/App.tsx'),
  ]

  for (const candidate of candidates) {
    try {
      return readFileSync(candidate, 'utf8')
    } catch {
      // Fall through to the alternate workspace root before failing.
    }
  }

  throw new Error(`Unable to locate App.tsx in: ${candidates.join(', ')}`)
}

function readRecentTasksSource() {
  const candidates = [
    join(process.cwd(), 'src/components/RecentTasksCard.tsx'),
    join(process.cwd(), 'client/src/components/RecentTasksCard.tsx'),
  ]

  for (const candidate of candidates) {
    try {
      return readFileSync(candidate, 'utf8')
    } catch {
      // Fall through to the alternate workspace root before failing.
    }
  }

  throw new Error(`Unable to locate RecentTasksCard.tsx in: ${candidates.join(', ')}`)
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
          label: '进度跳变',
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

function apiJsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

function projectSummaryFixture(overrides: Partial<ProjectSummary> = {}): ProjectSummary {
  return {
    id: 'project-1',
    name: '示例项目',
    status: 'active',
    statusLabel: '进行中',
    plannedStartDate: '2026-04-01',
    plannedEndDate: '2026-12-31',
    daysUntilPlannedEnd: 240,
    totalTasks: 10,
    leafTaskCount: 10,
    planPhaseCount: 4,
    completedTaskCount: 3,
    inProgressTaskCount: 3,
    delayedTaskCount: 1,
    delayDays: 5,
    delayCount: 1,
    overallProgress: 35,
    plannedProgress: 50,
    progressDeviation: -15,
    progressGap: 15,
    summaryAsOf: '2026-04-15T00:00:00.000Z',
    taskProgress: 35,
    totalMilestones: 2,
    completedMilestones: 0,
    milestoneProgress: 0,
    riskCount: 2,
    activeRiskCount: 2,
    activeIssueCount: 1,
    pendingConditionCount: 1,
    pendingConditionTaskCount: 1,
    activeObstacleCount: 1,
    activeObstacleTaskCount: 1,
    todayTodoCount: 4,
    projectTodayActionCount: 4,
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
    businessHealthScore: 80,
    healthStatus: '健康',
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
    ...overrides,
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

async function waitForText(container: HTMLElement, text: string, timeoutMs = 2500) {
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    await act(async () => {
      await flush()
    })

    if (container.textContent?.includes(text)) {
      return
    }
  }

  throw new Error(`Timed out waiting for text: ${text}`)
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
    })

    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input)

      if (url.includes(`/api/task-summaries/projects/${projectId}/task-summary`)) {
        return apiJsonResponse({
          stats: {
            total_completed: 0,
            on_time_count: 0,
            delayed_count: 0,
          },
          groups: [{ tasks: [] }],
        })
      }

      if (url.includes(`/api/task-summaries/projects/${projectId}/daily-progress`)) {
        return apiJsonResponse({
          success: true,
          data: {
            date: '2026-04-15',
            previous_date: '2026-04-14',
            progress_change: 0,
            tasks_updated: 0,
            tasks_completed: 0,
            details: [],
          },
        })
      }

      if (url.includes(`/api/data-quality/project-summary?projectId=${projectId}`)) {
        return apiJsonResponse(dataQualitySummaryResponse(projectId))
      }

      return apiJsonResponse({})
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
    } as never)

    act(() => {
      root?.unmount()
    })
    root = null
    container.remove()
    vi.unstubAllGlobals()
  })

  it('renders the conclusion-first overview while keeping heavy support panels lazy', async () => {
    getProjectSummarySpy.mockResolvedValue(projectSummaryFixture())

    act(() => {
      root?.render(
        <MemoryRouter initialEntries={[`/projects/${projectId}/dashboard`]}>
          <Routes>
            <Route path="/projects/:id/dashboard" element={<Dashboard />} />
          </Routes>
        </MemoryRouter>,
      )
    })

    await waitForSelector(container, '[data-testid="dashboard-page-title"]')
    await waitForSelector(container, '[data-testid="dashboard-decision-overview"]')
    await waitForSelector(container, '[data-testid="dashboard-health-weakness-panel"]')
    await waitForSelector(container, '[data-testid="dashboard-action-panel"]')
    await waitForSelector(container, '[data-testid="dashboard-snapshot-panel"]')

    expect(container.querySelector('[data-testid="dashboard-page-title"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="dashboard-decision-overview"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="dashboard-forecast-summary"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="dashboard-health-weakness-panel"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="dashboard-action-panel"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="dashboard-hero-cards"]')).toBeNull()
    expect(container.querySelectorAll('[data-testid^="dashboard-hero-card-"]').length).toBe(0)
    expect(container.querySelector('[data-testid="dashboard-snapshot-panel"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="dashboard-readiness-boundary"]')).toBeNull()
    expect(container.querySelector('[data-testid="dashboard-attention-panel"]')).toBeNull()
    expect(container.querySelector('[data-testid="dashboard-focus-tasks-panel"]')).toBeNull()
    expect(container.querySelector('[data-testid="dashboard-live-panel"]')).toBeNull()
    expect(container.querySelector('[data-testid="dashboard-monthly-trend"]')).toBeNull()
    expect(container.querySelector('[data-testid="dashboard-weekly-digest"]')).toBeNull()
    expect(container.querySelector('[data-testid="dashboard-project-remaining-forecast"]')).toBeNull()

    const pageTitle = container.querySelector('[data-testid="dashboard-page-title"]')
    const decisionOverview = container.querySelector('[data-testid="dashboard-decision-overview"]')
    const weaknessPanel = container.querySelector('[data-testid="dashboard-health-weakness-panel"]')
    const actionPanel = container.querySelector('[data-testid="dashboard-action-panel"]')
    const snapshotPanel = container.querySelector('[data-testid="dashboard-snapshot-panel"]')

    expect(pageTitle).toBeTruthy()
    expect(decisionOverview).toBeTruthy()
    expect(weaknessPanel).toBeTruthy()
    expect(actionPanel).toBeTruthy()
    expect(snapshotPanel).toBeTruthy()

    expect(pageTitle!.compareDocumentPosition(decisionOverview!) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0)
    expect(decisionOverview!.compareDocumentPosition(weaknessPanel!) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0)
    expect(weaknessPanel!.compareDocumentPosition(actionPanel!) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0)
    expect(actionPanel!.compareDocumentPosition(snapshotPanel!) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0)

    expect(container.textContent).toContain('数据可靠性')
    expect(container.textContent).toContain('进度偏差 -15%，落后计划')
    expect(container.textContent).toContain('实际 35% / 计划应到 50%')
    expect(container.textContent).toContain('工期预测')
    expect(container.querySelector('[data-testid="dashboard-decision-drilldown"]')?.getAttribute('href')).toBe(`/projects/${projectId}/gantt`)
    expect(container.querySelector('[data-testid="dashboard-forecast-summary"]')?.getAttribute('href')).toBe(`/projects/${projectId}/gantt`)
    expect(container.querySelector('[data-testid="dashboard-business-health-chip"]')?.classList.contains('dashboard-title-metric-chip')).toBe(true)
    expect(container.querySelector('[data-testid="dashboard-data-quality-detail-trigger"]')?.classList.contains('dashboard-title-metric-chip')).toBe(true)
    expect(container.querySelector('[data-testid="dashboard-progress-chip"]')?.classList.contains('dashboard-title-metric-chip')).toBe(true)
    expect(container.textContent).toContain('掉在哪')
    expect(container.textContent).toContain('今天干这件')
    expect(container.textContent).not.toContain('计划计划工期')
    expect(container.textContent).not.toContain('主结论')
    expect(container.textContent).not.toContain('弱项优先')
    expect(container.textContent).not.toContain('优先处理')
    expect(container.textContent).not.toContain('数据时点 --')
    expect(container.textContent).toContain('预测详情')
    expect(container.textContent).toContain('趋势与周报')
    expect(container.textContent).toContain('执行明细')
    expect(container.textContent).not.toContain('摘要指标')
    expect(container.textContent).not.toContain('里程碑追踪')
    expect(container.textContent).not.toContain('模块分析')
    expect(container.textContent).not.toContain('最高优先级问题')
    expect(container.textContent).not.toContain('证照管理')
    expect(container.textContent).not.toContain('项目脉冲')
    expect(container.querySelector('[data-testid="dashboard-governance-signal"]')).toBeNull()
    expect(container.textContent).not.toContain('月度趋势（近6个月）')
    expect(container.querySelector('[data-testid="dashboard-compare-reports-link"]')).toBeNull()
  })

  it('defaults the support area to forecast details only after the first-screen budget', () => {
    const source = readDashboardSource()

    expect(source).toContain('DASHBOARD_DEFAULT_SUPPORT_TAB_DELAY_MS = 2_600')
    expect(source).toContain("setActiveSupportTab((current) => current ?? 'forecast')")
    expect(source).toContain("activeSupportTab === 'trend'")
    expect(source).toContain("activeSupportTab === 'execution'")
  })

  it('uses the project summary identity when the shell project name is missing', async () => {
    useStore.setState({
      currentProject: {
        id: projectId,
        name: '',
        status: 'active',
        current_phase: 'construction',
        planned_start_date: '2026-04-01',
        planned_end_date: '2026-12-31',
      } as never,
    })
    getProjectSummarySpy.mockResolvedValue(projectSummaryFixture({ name: '真实项目名称' }))

    act(() => {
      root?.render(
        <MemoryRouter initialEntries={[`/projects/${projectId}/dashboard`]}>
          <Routes>
            <Route path="/projects/:id/dashboard" element={<Dashboard />} />
          </Routes>
        </MemoryRouter>,
      )
    })

    await waitForText(container, '真实项目名称', 5000)
    await act(async () => {
      await flush()
    })

    const title = container.querySelector('[data-testid="dashboard-page-title"] h1')
    expect(title?.textContent).toBe('真实项目名称')
    expect(useStore.getState().currentProject?.name).toBe('真实项目名称')
  })

  it('defers health and data-quality detail reads beyond the first-screen budget', async () => {
    getProjectSummarySpy.mockResolvedValue(projectSummaryFixture())

    act(() => {
      root?.render(
        <MemoryRouter initialEntries={[`/projects/${projectId}/dashboard`]}>
          <Routes>
            <Route path="/projects/:id/dashboard" element={<Dashboard />} />
          </Routes>
        </MemoryRouter>,
      )
    })

    await waitForSelector(container, '[data-testid="dashboard-decision-overview"]')
    await waitForSelector(container, '[data-testid="dashboard-health-weakness-panel"]')

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 350))
    })

    expect(fetchMock.mock.calls.some(([input]) => new RegExp(`/api/health-score/${projectId}`).test(String(input)))).toBe(false)
    expect(fetchMock.mock.calls.some(([input]) => new RegExp(`/api/data-quality/project-summary\\?projectId=${projectId}`).test(String(input)))).toBe(false)
    expect(container.textContent).toContain('健康指标加载中')
  })

  it('keeps global project-list sync outside the Dashboard first-screen budget', () => {
    const source = readAppSource()

    expect(source).toContain('DASHBOARD_FIRST_SCREEN_BACKGROUND_SYNC_DELAY_MS = 5_000')
    expect(source).toContain('isDashboardProjectRoutePath(location.pathname)')
    expect(source).toContain('window.setTimeout(runSync, backgroundSyncDelayMs)')
  })

  it('treats null planned progress fields as an unavailable plan baseline instead of zero', async () => {
    getProjectSummarySpy.mockResolvedValue(projectSummaryFixture({
      overallProgress: 29,
      plannedProgress: null,
      progressDeviation: null,
      progressGap: null,
      plannedEndDate: null,
    }))

    act(() => {
      root?.render(
        <MemoryRouter initialEntries={[`/projects/${projectId}/dashboard`]}>
          <Routes>
            <Route path="/projects/:id/dashboard" element={<Dashboard />} />
          </Routes>
        </MemoryRouter>,
      )
    })

    await waitForSelector(container, '[data-testid="dashboard-decision-overview"]')

    expect(container.textContent).toContain('等待计划进度口径')
    expect(container.textContent).toContain('实际 29% / 计划 --')
    expect(container.textContent).not.toContain('基本按计划')
    expect(container.textContent).not.toContain('计划应到 0%')
    expect(container.textContent).not.toContain('计划应到0%')
    expect(container.textContent).not.toContain('偏差 0%')
    expect(container.textContent).not.toContain('偏差0%')
  })

  it('keeps real zero planned progress values visible in the primary conclusion', async () => {
    getProjectSummarySpy.mockResolvedValue(projectSummaryFixture({
      overallProgress: 0,
      plannedProgress: 0,
      progressDeviation: 0,
      progressGap: 0,
    }))

    act(() => {
      root?.render(
        <MemoryRouter initialEntries={[`/projects/${projectId}/dashboard`]}>
          <Routes>
            <Route path="/projects/:id/dashboard" element={<Dashboard />} />
          </Routes>
        </MemoryRouter>,
      )
    })

    await waitForSelector(container, '[data-testid="dashboard-decision-overview"]')

    // 真 0（planned=0 且 actual=0）= 项目尚未产生有效进度：必须显式提醒去录进展，
    // 不得再判成误导的"基本按计划"（暗示在计划轨道上）。真 0 值本身仍可见（KPI 区），
    // 且不退化成"等待计划进度口径"（那是缺日期/null 的态）。
    expect(container.textContent).toContain('计划已开始，暂无进展录入')
    expect(container.textContent).not.toContain('基本按计划')
    expect(container.textContent).toContain('实际进度0%')
    expect(container.textContent).toContain('计划应到0%')
    expect(container.querySelector('[data-testid="dashboard-business-health-chip"]')?.textContent).toContain('业务健康 80分 · 低信')
    expect(container.textContent).not.toContain('等待计划进度口径')
  })

  it('renders the activation state for a generated plan with no progress records', async () => {
    getProjectSummarySpy.mockResolvedValue(projectSummaryFixture({
      totalTasks: 12,
      leafTaskCount: 12,
      planPhaseCount: 5,
      completedTaskCount: 0,
      inProgressTaskCount: 0,
      delayedTaskCount: 0,
      delayDays: 0,
      delayCount: 0,
      overallProgress: 0,
      taskProgress: 0,
      riskCount: 0,
      activeRiskCount: 0,
      activeIssueCount: 0,
      pendingConditionCount: 0,
      pendingConditionTaskCount: 0,
      activeObstacleCount: 0,
      activeObstacleTaskCount: 0,
      todayTodoCount: 0,
      projectTodayActionCount: 0,
      businessHealthScore: null,
      healthStatus: '待完善',
    }))

    act(() => {
      root?.render(
        <MemoryRouter initialEntries={[`/projects/${projectId}/dashboard`]}>
          <Routes>
            <Route path="/projects/:id/dashboard" element={<Dashboard />} />
          </Routes>
        </MemoryRouter>,
      )
    })

    await waitForSelector(container, '[data-testid="dashboard-cold-start-activation"]')
    await waitForSelector(container, '[data-testid="dashboard-ready-fact-cards"]')

    expect(container.querySelector('[data-testid="dashboard-hero-cards"]')).toBeNull()
    expect(container.querySelector('[data-onboarding-target="dashboard-metrics"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="dashboard-attention-panel"]')).toBeNull()
    expect(container.querySelector('[data-testid="dashboard-snapshot-panel"]')).toBeNull()
    expect(container.textContent).toContain('计划已生成，去录入第一条现场进展')
    expect(container.textContent).toContain('少录多得')
    expect(container.textContent).toContain('去 Gantt 录进展')
    expect(container.textContent).toContain('先看看计划')
    expect(container.textContent).toContain('总任务')
    expect(container.textContent).toContain('12')
    expect(container.textContent).toContain('阶段')
    expect(container.textContent).toContain('5')
    expect(container.textContent).not.toContain('计划状态')
    expect(container.querySelector('[data-testid="dashboard-activation-primary"]')?.getAttribute('href')).toBe('/projects/project-1/gantt')
    expect(container.querySelector('[data-testid="dashboard-activation-secondary"]')?.getAttribute('href')).toBe('/projects/project-1/gantt')
  })

  it('renders the modeling empty state when the project has no generated tasks', async () => {
    getProjectSummarySpy.mockResolvedValue(projectSummaryFixture({
      totalTasks: 0,
      leafTaskCount: 0,
      completedTaskCount: 0,
      inProgressTaskCount: 0,
      delayedTaskCount: 0,
      delayDays: 0,
      delayCount: 0,
      overallProgress: 0,
      taskProgress: 0,
      riskCount: 0,
      activeRiskCount: 0,
      activeIssueCount: 0,
      pendingConditionCount: 0,
      pendingConditionTaskCount: 0,
      activeObstacleCount: 0,
      activeObstacleTaskCount: 0,
      todayTodoCount: 0,
      projectTodayActionCount: 0,
      businessHealthScore: null,
      healthStatus: '待完善',
    }))

    act(() => {
      root?.render(
        <MemoryRouter initialEntries={[`/projects/${projectId}/dashboard`]}>
          <Routes>
            <Route path="/projects/:id/dashboard" element={<Dashboard />} />
          </Routes>
        </MemoryRouter>,
      )
    })

    await waitForSelector(container, '[data-testid="dashboard-plan-empty-state"]')

    expect(container.querySelector('[data-testid="dashboard-hero-cards"]')).toBeNull()
    expect(container.querySelector('[data-testid="dashboard-attention-panel"]')).toBeNull()
    expect(container.textContent).toContain('先生成项目计划')
    expect(container.textContent).toContain('几分钟建模')
    expect(container.textContent).toContain('去快速建模')
    expect(container.querySelector('[data-testid="dashboard-plan-empty-action"]')?.getAttribute('href')).toBe('/projects/project-1/gantt?modelingWorkbench=generate')
  })

  it('shows the committed construction organization scenario snapshot from project metadata', async () => {
    useStore.setState({
      currentProject: {
        id: projectId,
        name: '示例项目',
        status: 'active',
        current_phase: 'construction',
        planned_start_date: '2026-04-01',
        planned_end_date: '2026-12-31',
        metadata: {
          constructionOrganizationScenario: {
            source: 'construction_organization_scenario_selector',
            confidence: 'medium',
            recommendedScenarioIds: ['shared_basement_first_then_tower'],
            scenarioRecommendations: {
              newProjectPlanning: {
                optionId: 'option-shared-basement-first',
                actionability: 'actionable',
              },
            },
            planOptions: [
              {
                optionId: 'option-shared-basement-first',
                selectedScenarioIds: ['shared_basement_first_then_tower'],
                confidence: 'medium',
                useCaseEvaluations: {
                  newProjectPlanning: {
                    factCoverage: {
                      decisionFactKeys: ['scopeOrganizationFacts', 'buildingCount'],
                      contextFactKeys: ['detailLevel'],
                      sidecarFactKeys: ['towerCraneCount'],
                    },
                  },
                },
              },
            ],
            factBasis: {
              projectOrganizationPolicy: {
                strategy: 'shared_basement_podium_then_multi_tower_lane_network',
                schemeFamily: 'shared_works_then_multi_building_lane',
                interfaceGateTags: ['shared_basement_gate', 'tower_lane_gate'],
              },
            },
          },
        },
      } as never,
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

    await waitForSelector(container, '[data-testid="dashboard-construction-organization-scenario"]')
    await waitForText(container, '施工组织方案')

    expect(container.textContent).toContain('整体地下室先行')
    expect(container.textContent).toContain('已用于判断：空间组织关系、楼栋数量')
    expect(container.textContent).toContain('已留痕：生成深度')
    expect(container.textContent).toContain('组织族 shared_works_then_multi_building_lane')
    expect(container.textContent).toContain('接口 shared_basement_gate、tower_lane_gate')
    expect(container.textContent).toContain('塔吊等资源只作可行性旁路信号')
    expect(container.textContent).toContain('候选方案不直接改写任务依赖或计划日期')
  })

  it('shows the lightweight construction organization scenario summary when the full snapshot is absent', async () => {
    useStore.setState({
      currentProject: {
        id: projectId,
        name: '示例项目',
        status: 'active',
        current_phase: 'construction',
        planned_start_date: '2026-04-01',
        planned_end_date: '2026-12-31',
        metadata: {
          constructionOrganizationScenarioSummary: {
            source: 'project_wizard_commit_construction_organization_summary',
            confidence: 'high',
            recommendedScenarioIds: ['pile_before_excavation', 'shared_basement_first_then_tower'],
            newProjectPlanning: {
              optionId: 'option-foundation-basement',
              selectedScenarioIds: ['pile_before_excavation', 'shared_basement_first_then_tower'],
              actionability: 'actionable_candidate',
              recommendationBasis: ['uses_existing_wizard_project_facts', 'default_new_project_planning_option'],
            },
            startingLineOnboarding: {
              optionId: 'option-foundation-basement',
              selectedScenarioIds: ['pile_before_excavation', 'shared_basement_first_then_tower'],
              actionability: 'not_actionable_after_current_phase',
              recommendationBasis: ['starting_line_current_phase_past_foundation_or_basement'],
            },
            accelerationRecovery: {
              optionId: 'option-tower-early',
              selectedScenarioIds: ['pile_before_excavation', 'tower_lane_early_release_after_core_basement'],
              actionability: 'actionable_candidate',
              recommendationBasis: ['e5_recoverable_span_priority'],
            },
            recommendedPlanOption: {
              optionId: 'option-foundation-basement',
              selectedScenarioIds: ['pile_before_excavation', 'shared_basement_first_then_tower'],
              selectionReasons: ['pile_foundation_fact_present', 'wizard_scope_shared_basement_service_range'],
              excludedReasons: [{
                scenarioId: 'excavation_before_pile',
                reasons: ['rainy_deep_pit_without_horizontal_support'],
              }],
            },
            projectOrganizationPolicy: {
              strategy: 'shared_basement_podium_then_multi_tower_lane_network',
              schemeFamily: 'shared_works_then_multi_building_lane',
              interfaceGateTags: ['shared_basement_gate', 'podium_gate', 'tower_lane_gate'],
            },
            planOptions: [{
              optionId: 'option-foundation-basement',
              selectedScenarioIds: ['pile_before_excavation', 'shared_basement_first_then_tower'],
              selectionReasons: ['pile_foundation_fact_present'],
              excludedReasons: [{
                scenarioId: 'excavation_before_pile',
                reasons: ['rainy_deep_pit_without_horizontal_support'],
              }],
            }, {
              optionId: 'option-tower-early',
              selectedScenarioIds: ['pile_before_excavation', 'tower_lane_early_release_after_core_basement'],
              selectionReasons: ['high_rise_vertical_lane_value_present'],
            }],
            planOptionCount: 2,
            scopeOrganizationFacts: {
              source: 'wizard_scope_objects',
              organizationSignals: ['shared_basement_serves_multiple_buildings'],
              buildingObjectCount: 2,
              sharedBasementObjectCount: 1,
              sharedBasementServiceTargetCount: 2,
              sharedBasementServiceTargetKindCounts: { building: 2 },
            },
            mutationBoundary: {
              writesTaskDependencies: false,
              writesPlanDates: false,
            },
          },
        },
      } as never,
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

    await waitForSelector(container, '[data-testid="dashboard-construction-organization-scenario"]')
    await waitForText(container, '施工组织方案')

    expect(container.textContent).toContain('先桩后挖 / 整体地下室先行')
    expect(container.textContent).toContain('已用于判断：空间组织关系、楼栋数量')
    expect(container.textContent).toContain('已比较 2 套候选方案')
    expect(container.textContent).toContain('推荐依据：依据向导事实推导、新建主计划默认入口')
    expect(container.textContent).toContain('组织族 shared_works_then_multi_building_lane')
    expect(container.textContent).toContain('接口 shared_basement_gate、podium_gate、tower_lane_gate')
    expect(container.textContent).toContain('先挖后桩：雨季深基坑且缺少水平支撑')
    expect(container.textContent).toContain('新建主计划：可作为默认组织方案')
    expect(container.textContent).toContain('候选方案不直接改写任务依赖或计划日期')
  })

  it('uses the starting-line construction organization view on the project dashboard for starting-line commits', async () => {
    useStore.setState({
      currentProject: {
        id: projectId,
        name: '起跑线项目',
        status: 'active',
        current_phase: 'construction',
        planned_start_date: '2026-04-01',
        planned_end_date: '2026-12-31',
        metadata: {
          constructionOrganizationScenarioSummary: {
            source: 'project_wizard_commit_construction_organization_summary',
            mode: 'starting_line',
            confidence: 'medium',
            recommendedScenarioIds: ['pile_before_excavation'],
            newProjectPlanning: {
              optionId: 'option-default',
              selectedScenarioIds: ['pile_before_excavation'],
              actionability: 'actionable_candidate',
            },
            startingLineOnboarding: {
              optionId: 'option-starting-line',
              selectedScenarioIds: ['shared_basement_first_then_tower'],
              actionability: 'not_actionable_after_current_phase',
              currentSubstage: 'main_structure',
            },
            planOptionCount: 2,
            scopeOrganizationFacts: {
              source: 'wizard_scope_objects',
              buildingObjectCount: 2,
            },
          },
        },
      } as never,
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

    await waitForSelector(container, '[data-testid="dashboard-construction-organization-scenario"]')
    await waitForText(container, '施工组织方案')

    expect(container.textContent).toContain('整体地下室先行')
    expect(container.textContent).not.toContain('先桩后挖')
    expect(container.textContent).toContain('起跑线接入：仅作证据，当前阶段不可倒写')
    expect(container.textContent).toContain('当前阶段：main_structure')
    expect(container.textContent).not.toContain('新建主计划：可作为默认组织方案')
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

    expect(container.textContent).toContain('未选择项目')
    expect(container.textContent).not.toContain('项目 Dashboard')
  })

  it('does not revive the old KPI card wall from backend weekly comparison fields', async () => {
    getProjectSummarySpy.mockResolvedValue({
      id: projectId,
      name: '示例项目',
      status: 'active',
      statusLabel: '进行',
      plannedStartDate: '2026-04-01',
      plannedEndDate: '2026-12-31',
      daysUntilPlannedEnd: 240,
      totalTasks: 10,
      leafTaskCount: 10,
      completedTaskCount: 3,
      inProgressTaskCount: 3,
      delayedTaskCount: 1,
      delayDays: 5,
      delayCount: 1,
      overallProgress: 35,
      plannedProgress: 30,
      progressDeviation: 5,
      progressGap: -5,
      taskProgress: 35,
      totalMilestones: 2,
      completedMilestones: 0,
      milestoneProgress: 0,
      riskCount: 2,
      activeRiskCount: 2,
      activeIssueCount: 1,
      pendingConditionCount: 1,
      pendingConditionTaskCount: 1,
      activeObstacleCount: 1,
      activeObstacleTaskCount: 1,
      todayTodoCount: 4,
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
      businessHealthScore: 80,
      healthStatus: '健康',
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
      kpiComparisons: {
        weekly: {
          progress: { current: 35, previous: 31, delta: 4, periodLabel: 'vs previous', status: 'ready' },
          deviation: { current: 5, previous: 2, delta: 3, periodLabel: 'vs previous', status: 'ready' },
          risks: { current: 2, previous: 5, delta: -3, periodLabel: 'vs previous', status: 'ready' },
          todos: { current: 4, previous: null, delta: null, periodLabel: 'vs previous', status: 'insufficient_history' },
        },
      },
    } as never)

    act(() => {
      root?.render(
        <MemoryRouter initialEntries={[`/projects/${projectId}/dashboard`]}>
          <Routes>
            <Route path="/projects/:id/dashboard" element={<Dashboard />} />
          </Routes>
        </MemoryRouter>,
      )
    })

    await waitForSelector(container, '[data-testid="dashboard-snapshot-panel"]')

    expect(container.querySelector('[data-testid="dashboard-hero-cards"]')).toBeNull()
    expect(container.querySelector('[data-testid="dashboard-hero-card-progress"]')).toBeNull()
    expect(container.querySelector('[data-testid="dashboard-hero-card-deviation"]')).toBeNull()
    expect(container.querySelector('[data-testid="dashboard-hero-card-efficiency"]')).toBeNull()
    expect(container.querySelector('[data-testid="dashboard-hero-card-risks"]')).toBeNull()
    expect(container.querySelector('[data-testid="dashboard-hero-card-todos"]')).toBeNull()
    expect(container.textContent).toContain('进度偏差 +5%，超前计划')
  })

  it('uses businessHealthScore without rendering keyNodeSummary as a Dashboard module', async () => {
    getProjectSummarySpy.mockResolvedValue({
      id: projectId,
      name: '示例项目',
      status: 'active',
      statusLabel: '进行中',
      plannedStartDate: '2026-04-01',
      plannedEndDate: '2026-12-31',
      daysUntilPlannedEnd: 240,
      totalTasks: 10,
      leafTaskCount: 10,
      completedTaskCount: 3,
      inProgressTaskCount: 3,
      delayedTaskCount: 1,
      delayDays: 5,
      delayCount: 1,
      overallProgress: 35,
      taskProgress: 35,
      totalMilestones: 2,
      completedMilestones: 0,
      milestoneProgress: 0,
      riskCount: 2,
      activeRiskCount: 2,
      activeIssueCount: 1,
      pendingConditionCount: 1,
      pendingConditionTaskCount: 1,
      activeObstacleCount: 1,
      activeObstacleTaskCount: 1,
      todayTodoCount: 4,
      projectTodayActionCount: 4,
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
      businessHealthScore: 88,
      reliabilityScore: 76,
      healthStatus: '健康',
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
      keyNodeSummary: {
        total: 7,
        milestoneCount: 3,
        criticalPathCount: 2,
        monthlyControlCount: 1,
        baselineControlCount: 4,
        dueSoonCount: 2,
        shiftedCount: 1,
        blockedCount: 0,
        highRiskCount: 1,
      },
    } as never)

    act(() => {
      root?.render(
        <MemoryRouter initialEntries={[`/projects/${projectId}/dashboard`]}>
          <Routes>
            <Route path="/projects/:id/dashboard" element={<Dashboard />} />
          </Routes>
        </MemoryRouter>,
      )
    })

    await waitForSelector(container, '[data-testid="dashboard-page-title"]')
    await waitForSelector(container, '[data-testid="dashboard-snapshot-panel"]')

    expect(container.querySelector('[data-testid="dashboard-page-title"]')?.textContent).toContain('业务健康 88分')
    expect(container.querySelector('[data-testid="dashboard-key-node-card"]')).toBeNull()
    expect(container.textContent).not.toContain('业务健康 12分')
  })

  it('does not render a fake zero business health badge before health data exists', async () => {
    getProjectSummarySpy.mockResolvedValue(projectSummaryFixture({
      businessHealthScore: null,
    }))

    act(() => {
      root?.render(
        <MemoryRouter initialEntries={[`/projects/${projectId}/dashboard`]}>
          <Routes>
            <Route path="/projects/:id/dashboard" element={<Dashboard />} />
          </Routes>
        </MemoryRouter>,
      )
    })

    await waitForSelector(container, '[data-testid="dashboard-page-title"]')

    expect(container.querySelector('[data-testid="dashboard-page-title"]')?.textContent).toContain('业务健康 --')
    expect(container.querySelector('[data-testid="dashboard-page-title"]')?.textContent).not.toContain('业务健康 0分')
  })

  it('keeps an explicit zero business health score visible when the summary returns zero', async () => {
    getProjectSummarySpy.mockResolvedValue(projectSummaryFixture({
      businessHealthScore: 0,
    }))

    act(() => {
      root?.render(
        <MemoryRouter initialEntries={[`/projects/${projectId}/dashboard`]}>
          <Routes>
            <Route path="/projects/:id/dashboard" element={<Dashboard />} />
          </Routes>
        </MemoryRouter>,
      )
    })

    await waitForSelector(container, '[data-testid="dashboard-page-title"]')

    expect(container.querySelector('[data-testid="dashboard-page-title"]')?.textContent).toContain('业务健康 0分')
    expect(container.querySelector('[data-testid="dashboard-page-title"]')?.textContent).not.toContain('业务健康 --')
  })

  it('does not render a fake zero progress badge before progress data exists', async () => {
    getProjectSummarySpy.mockResolvedValue(projectSummaryFixture({
      overallProgress: null,
      plannedProgress: null,
      progressDeviation: null,
    }))

    act(() => {
      root?.render(
        <MemoryRouter initialEntries={[`/projects/${projectId}/dashboard`]}>
          <Routes>
            <Route path="/projects/:id/dashboard" element={<Dashboard />} />
          </Routes>
        </MemoryRouter>,
      )
    })

    await waitForSelector(container, '[data-testid="dashboard-page-title"]')

    expect(container.querySelector('[data-testid="dashboard-page-title"]')?.textContent).toContain('进度 --')
    expect(container.querySelector('[data-testid="dashboard-page-title"]')?.textContent).not.toContain('进度 0%')
  })

  it('does not call forecast unavailable when only the planned progress basis is missing', async () => {
    getProjectSummarySpy.mockResolvedValue(projectSummaryFixture({
      overallProgress: 58,
      plannedProgress: null,
      progressDeviation: null,
    }))

    act(() => {
      root?.render(
        <MemoryRouter initialEntries={[`/projects/${projectId}/dashboard`]}>
          <Routes>
            <Route path="/projects/:id/dashboard" element={<Dashboard />} />
          </Routes>
        </MemoryRouter>,
      )
    })

    await waitForSelector(container, '[data-testid="dashboard-forecast-summary"]')

    const forecastSummaryText = container.querySelector('[data-testid="dashboard-forecast-summary"]')?.textContent ?? ''
    expect(forecastSummaryText).toContain('计划应到口径待补')
    expect(forecastSummaryText).not.toContain('预测暂不可用')
  })

  it('does not expose internal forecast contract wording in the Dashboard support area', async () => {
    getProjectSummarySpy.mockResolvedValue(projectSummaryFixture())

    act(() => {
      root?.render(
        <MemoryRouter initialEntries={[`/projects/${projectId}/dashboard`]}>
          <Routes>
            <Route path="/projects/:id/dashboard" element={<Dashboard />} />
          </Routes>
        </MemoryRouter>,
      )
    })

    await waitForSelector(container, '[data-testid="dashboard-snapshot-panel"]')

    const forecastTab = Array.from(container.querySelectorAll('[role="tab"]'))
      .find((item) => item.textContent?.includes('预测详情')) as HTMLElement | undefined
    expect(forecastTab).toBeTruthy()

    await act(async () => {
      forecastTab?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await flush()
    })

    await waitForSelector(container, '[data-testid="dashboard-project-remaining-forecast"]')

    const pageText = container.textContent ?? ''
    expect(pageText).not.toContain('project_remaining_forecast')
    expect(pageText).not.toContain('出口读取')
    expect(pageText).not.toContain('同一口径')
    expect(pageText).not.toContain('重读内容不会阻塞首屏主结论')
    expect(pageText).not.toContain('后台计算')
    expect(pageText).not.toContain('项目级剩余工期')
    expect(pageText).not.toContain('预测详情可查看')
    expect(pageText).not.toContain('补齐计划应到后')
    expect(pageText).not.toContain('结合剩余工作')
    expect(pageText).not.toContain('说明工期预测为什么这样判断')
    expect(pageText).not.toContain('施工组织预测覆盖')
    expect(pageText).not.toContain('当前预测按已覆盖业态解释')
    expect(pageText).not.toContain('满足目标')
  })

  it('uses health-score details as the page title business health source', async () => {
    getProjectSummarySpy.mockResolvedValue({
      id: projectId,
      name: '示例项目',
      status: 'active',
      statusLabel: '进行中',
      plannedStartDate: '2026-04-01',
      plannedEndDate: '2026-12-31',
      daysUntilPlannedEnd: 240,
      totalTasks: 10,
      leafTaskCount: 10,
      completedTaskCount: 3,
      inProgressTaskCount: 3,
      delayedTaskCount: 1,
      delayDays: 5,
      delayCount: 1,
      overallProgress: 35,
      taskProgress: 35,
      totalMilestones: 2,
      completedMilestones: 0,
      milestoneProgress: 0,
      riskCount: 2,
      activeRiskCount: 2,
      activeIssueCount: 1,
      pendingConditionCount: 1,
      pendingConditionTaskCount: 1,
      activeObstacleCount: 1,
      activeObstacleTaskCount: 1,
      todayTodoCount: 4,
      projectTodayActionCount: 4,
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
      businessHealthScore: 65,
      reliabilityScore: 76,
      healthStatus: '亚健康',
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
    } as never)

    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input)

      if (url.includes(`/api/health-score/${projectId}`)) {
        return apiJsonResponse({
          score: 33,
          details: {
            businessHealthScore: 33,
            progressDeliveryScore: 35,
            executionStabilityScore: 40,
            criticalTargetScore: 25,
            businessExceptionScore: 30,
            planGovernanceScore: 38,
            dataTrustScore: 91,
          },
        })
      }

      if (url.includes(`/api/task-summaries/projects/${projectId}/task-summary`)) {
        return apiJsonResponse({
          stats: {
            total_completed: 0,
            on_time_count: 0,
            delayed_count: 0,
          },
          groups: [{ tasks: [] }],
        })
      }

      if (url.includes(`/api/task-summaries/projects/${projectId}/daily-progress`)) {
        return apiJsonResponse({
          success: true,
          data: {
            date: '2026-04-15',
            previous_date: '2026-04-14',
            progress_change: 0,
            tasks_updated: 0,
            tasks_completed: 0,
            details: [],
          },
        })
      }

      if (url.includes(`/api/data-quality/project-summary?projectId=${projectId}`)) {
        return apiJsonResponse(dataQualitySummaryResponse(projectId))
      }

      return apiJsonResponse({})
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

    await waitForSelector(container, '[data-testid="dashboard-page-title"]')

    await waitForText(container, '业务健康 33分', 5000)
    expect(container.querySelector('[data-testid="dashboard-page-title"]')?.textContent).not.toContain('业务健康 65分')
  })

  it('shows an explicit health breakdown degradation state when health-score returns a degraded payload', async () => {
    getProjectSummarySpy.mockResolvedValue(projectSummaryFixture())
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input)

      if (url.includes(`/api/health-score/${projectId}`)) {
        return apiJsonResponse({
          success: true,
          data: {
            degraded: true,
            degradationReason: 'request_budget_exceeded',
            score: null,
            details: null,
            status: 'degraded',
          },
        })
      }

      if (url.includes(`/api/data-quality/project-summary?projectId=${projectId}`)) {
        return apiJsonResponse(dataQualitySummaryResponse(projectId))
      }

      return apiJsonResponse({})
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

    await waitForSelector(container, '[data-testid="dashboard-health-weakness-panel"]')
    await waitForText(container, '健康指标暂不可用，先使用摘要健康参考；弱项明细稍后重试。', 5000)

    expect(container.textContent).not.toContain('参考展示')
  })

  it('renders the weekly progress panel when digest data exists', async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input)

      if (url.includes(`/api/projects/${projectId}/weekly-digest/latest`)) {
        return apiJsonResponse({
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
            critical_nearest_delay: {
              value: 2,
              unit: 'construction_production_day',
              calendarRef: 'work_calendar',
              calendarVersion: 'calendar-v1',
              timezone: 'Asia/Shanghai',
              asOf: '2026-04-21',
              availability: 'available',
              unavailableReason: null,
            },
            top_delayed_tasks: [
              {
                task_id: 'task-1',
                title: '主体结构施工',
                assignee: '张工',
                delay: {
                  value: 4,
                  unit: 'construction_production_day',
                  calendarRef: 'work_calendar',
                  calendarVersion: 'calendar-v1',
                  timezone: 'Asia/Shanghai',
                  asOf: '2026-04-21',
                  availability: 'available',
                  unavailableReason: null,
                },
              },
            ],
            abnormal_responsibilities: [
              { subject_id: 'resp-1', name: '主体施工单位', type: '施工' },
            ],
            new_risks_count: 2,
            new_obstacles_count: 1,
            max_risk_level: 'high',
          },
        })
      }

      return apiJsonResponse({})
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

    const trendTab = Array.from(container.querySelectorAll('[role="tab"]'))
      .find((item) => item.textContent?.includes('趋势与周报')) as HTMLElement | undefined
    expect(trendTab).toBeTruthy()
    await act(async () => {
      trendTab?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await flush()
    })

    await waitForSelector(container, '[data-testid="dashboard-weekly-digest"]')

    expect(container.textContent).toContain('本周进度面板')
    expect(container.textContent).toContain('本周新增风险')
    expect(container.textContent).toContain('关键阻碍数')
    expect(container.textContent).toContain('最近关键里程碑')
    expect(container.textContent).toContain('最高等级 high')
    expect(container.textContent).toContain('查看详情')
  })

  it('opens a confidence breakdown dialog from the dashboard page title', async () => {
    getProjectSummarySpy.mockResolvedValue(projectSummaryFixture())

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
    await waitForText(container, '数据可靠性 88%', 5000)
    const trigger = container.querySelector('[data-testid="dashboard-data-quality-detail-trigger"]') as HTMLElement

    await act(async () => {
      trigger.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await flush()
    })

    await waitForSelector(document.body, '[data-testid="dashboard-data-quality-detail-dialog"]')
    expect(document.body.textContent).toContain('数据可靠性维度分解')
    expect(document.body.textContent).toContain('本月各维度降分贡献')
    expect(document.body.textContent).toContain('异常检测命中率')
  })

  it('does not migrate planning governance signals into the v1.3.5.1 dashboard page title', async () => {
    getProjectSummarySpy.mockResolvedValue({
      id: projectId,
      name: '示例项目',
      status: 'active',
      statusLabel: '进行',
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
      businessHealthScore: 72,
      healthStatus: '亚健康',
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
        closeoutOwnerAttentionCount: 1,
        reorderReminderCount: 0,
        reorderEscalationCount: 0,
        reorderSummaryCount: 1,
        adHocReminderCount: 0,
        dashboardCloseoutOverdue: true,
        dashboardCloseoutOwnerAttentionRequired: true,
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

    await waitForSelector(container, '[data-testid="dashboard-page-title"]')

    expect(container.querySelector('[data-testid="dashboard-governance-signal"]')).toBeNull()
    expect(container.querySelector('[data-testid="dashboard-governance-open-monthly"]')).toBeNull()
    expect(container.querySelector('[data-testid="dashboard-governance-open-closeout"]')).toBeNull()
    expect(container.textContent).not.toContain('计划治理信号')
    expect(container.textContent).not.toContain('关账超期信号已触')
  })

  it('reads live and focus panels from backend dashboard contracts instead of local fallbacks', () => {
    const source = readDashboardSource()
    const focusSource = readRecentTasksSource()

    expect(source).toContain('/dashboard/today-progress')
    expect(source).toContain('<RecentTasksCard projectId={projectId} />')
    expect(focusSource).toContain('/dashboard/focus-tasks?filter=')
    expect(source).not.toContain('const warnings = useStore((state) => state.warnings)')
    expect(source).not.toContain('const liveWarnings = useMemo(')
    expect(source).not.toContain('localTodayLiveItems')
    expect(source).not.toContain('effectiveTodayLiveItems')
    expect(focusSource).not.toContain('localStorage')
    expect(source).not.toContain('apiGet(`/api/warnings?projectId=')
    expect(source).not.toContain('apiGet(`/api/issues?projectId=')
    expect(source).not.toContain('apiGet(`/api/task-obstacles?projectId=')
    expect(source).not.toContain('apiGet(`/api/change-logs?projectId=')
  })

  it('keeps Dashboard health consumption while preventing keyNodeSummary frontend regressions', () => {
    const source = readDashboardSource()

    expect(source).toContain('summaryData?.businessHealthScore')
    expect(source).not.toContain('keyNodeSummary')
    expect(source).not.toContain('DashboardKeyNodeCard')
    expect(source).not.toContain('dashboard-key-node-card')
    expect(source).not.toContain('value="milestone"')
  })

  it('does not invent KPI sparkline shapes in the Dashboard frontend', () => {
    const source = readDashboardSource()

    expect(source).not.toContain('[36, 40, 43, 47, 52]')
    expect(source).not.toContain('[42, 46, 44, 50, 56]')
    expect(source).not.toContain('[32, 36, 34, 43, 50]')
    expect(source).not.toContain('[35, 38, 41, 43, 46]')
    expect(source).not.toContain('normalizeKpiSparkline')
    expect(source).not.toContain('DashboardMetricCards')
  })

  it('mounts the authoritative start-readiness consumer in a lazy dashboard tab', () => {
    const source = readDashboardSource()
    expect(source).toContain("import { ProjectStartReadinessPanel }")
    expect(source).toContain("value=\"readiness\"")
    expect(source).toContain('<ProjectStartReadinessPanel projectId={projectId}')
  })

  it('honors the readiness notification target tab instead of reverting to forecast', () => {
    const source = readDashboardSource()
    expect(source).toContain('useLocation')
    expect(source).toContain("new URLSearchParams(location.search).get('tab')")
    expect(source).toContain("requestedSupportTab === 'readiness'")
  })

  it('fixes dashboard summary scope to post-access without exposing a range switch', async () => {
    act(() => {
      root?.render(
        <MemoryRouter initialEntries={[`/projects/${projectId}/dashboard`]}>
          <Routes>
            <Route path="/projects/:id/dashboard" element={<Dashboard />} />
          </Routes>
        </MemoryRouter>,
      )
    })

    await waitForSelector(container, '[data-testid="dashboard-page-title"]')

    expect(container.textContent).not.toContain(['全', '周期'].join(''))
  })

  it('exposes owner-only data quality governance actions from v1.4.16', () => {
    const source = readDashboardSource()

    expect(source).toContain('DataQualityApiService.recomputeSnapshot(projectId)')
    expect(source).toContain('DataQualityApiService.resolveSourceDeleted(projectId')
    expect(source).toContain('canRunDataQualityGovernance={isOwner}')
    expect(source).toContain('重算快照')
    expect(source).toContain('标记来源已删除已处理')
  })
})
