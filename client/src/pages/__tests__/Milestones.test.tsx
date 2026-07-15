import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import Milestones from '../Milestones'
import { apiGet } from '@/lib/apiClient'
import { useStore } from '@/hooks/useStore'
import { DashboardApiService } from '@/services/dashboardApi'

vi.mock('@/services/dashboardApi', () => ({
  DashboardApiService: {
    getProjectSummary: vi.fn(),
  },
}))

vi.mock('@/lib/apiClient', () => ({
  apiGet: vi.fn(),
  getApiErrorMessage: vi.fn((_error: unknown, fallback: string) => fallback),
  isAbortError: vi.fn(() => false),
}))

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return {
    ...actual,
    useNavigate: vi.fn(),
  }
})

const mockedUseNavigate = vi.mocked(useNavigate)
const mockedGetProjectSummary = vi.mocked(DashboardApiService.getProjectSummary)
const mockedApiGet = vi.mocked(apiGet)

function flush() {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

async function waitForText(container: HTMLElement, expected: string[]) {
  const deadline = Date.now() + 2500

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

function findButton(container: HTMLElement, label: string) {
  return Array.from(container.querySelectorAll('button')).find((button) =>
    button.textContent?.includes(label),
  ) as HTMLButtonElement | undefined
}

function findLink(container: HTMLElement, label: string) {
  return Array.from(container.querySelectorAll('a')).find((anchor) =>
    anchor.textContent?.includes(label),
  ) as HTMLAnchorElement | undefined
}

function findTab(container: HTMLElement, label: string) {
  return Array.from(container.querySelectorAll('[role="tab"]')).find((tab) =>
    tab.textContent?.trim() === label,
  ) as HTMLButtonElement | undefined
}

describe('Milestones page story coverage', () => {
  const projectId = 'project-1'
  const navigateMock = vi.fn()
  let container: HTMLDivElement
  let root: Root | null = null

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    if (!HTMLElement.prototype.scrollIntoView) {
      Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
        configurable: true,
        value: vi.fn(),
      })
    }

    mockedUseNavigate.mockReturnValue(navigateMock)
    mockedGetProjectSummary.mockResolvedValue({
      id: projectId,
      name: '示例项目',
      milestoneOverview: {
        stats: {
          total: 5,
          pending: 4,
          completed: 1,
          overdue: 1,
          upcomingSoon: 1,
          completionRate: 20,
        },
        summaryStats: {
          shiftedCount: 1,
          baselineOnTimeCount: 1,
          dueSoon30dCount: 2,
          highRiskCount: 2,
        },
        kpiComparisons: {
          monthly: {
            shifted: { current: 1, previous: 0, delta: 1, periodLabel: '较上月', status: 'ready' },
            baselineOnTime: { current: 1, previous: 1, delta: 0, periodLabel: '较上月', status: 'ready' },
            dueSoon30d: { current: 2, previous: 3, delta: -1, periodLabel: '较上月', status: 'ready' },
            highRisk: { current: 2, previous: null, delta: null, periodLabel: '较上月', status: 'insufficient_history' },
          },
        },
        items: [
          {
            id: 'm1',
            name: '地下室施工',
            description: '节点偏差表达',
            targetDate: '2026-04-01',
            planned_date: '2026-04-01',
            current_planned_date: '2026-04-03',
            actual_date: '2026-04-04',
            progress: 100,
            status: 'completed',
            statusLabel: '已兑现',
            milestone_level: 1,
            non_base_labels: ['偏差过大'],
            updatedAt: '2026-04-01T00:00:00.000Z',
          },
          {
            id: 'm2',
            name: '地上结构封顶',
            description: '当前推进中的节点',
            targetDate: '2026-04-06',
            planned_date: null,
            current_planned_date: '2026-04-08',
            actual_date: null,
            progress: 60,
            status: 'soon',
            statusLabel: '临近节点',
            milestone_level: 2,
            parent_id: 'm1',
            mapping_pending: true,
            non_base_labels: ['待补映射'],
            updatedAt: '2026-04-02T00:00:00.000Z',
          },
          {
            id: 'm3',
            name: '主体结构封顶',
            description: '待完成节点',
            targetDate: '2026-06-15',
            progress: 0,
            status: 'upcoming',
            statusLabel: '待完成',
            milestone_level: 1,
            updatedAt: '2026-04-03T00:00:00.000Z',
            non_base_labels: [],
          },
          {
            id: 'm4',
            name: '室外管网完成',
            description: '只有当前计划',
            targetDate: '2026-05-20',
            current_planned_date: '2026-05-20',
            actual_date: null,
            progress: 0,
            status: 'upcoming',
            statusLabel: '待完成',
            milestone_level: 3,
            non_base_labels: [],
          },
          {
            id: 'm5',
            name: '幕墙封闭',
            description: '只有基线日期',
            targetDate: '2026-05-30',
            planned_date: '2026-05-30',
            actual_date: null,
            progress: 0,
            status: 'upcoming',
            statusLabel: '待完成',
            milestone_level: 1,
            non_base_labels: [],
          },
        ],
      },
    } as never)
    mockedApiGet.mockImplementation(async (url: string) => {
      if (url === `/api/projects/${projectId}/milestones/m1/linked-tasks`) {
        return [
          {
            id: 'task-1',
            title: '地下室模板安装',
            status: 'in_progress',
            progress: 50,
            assignee_name: '张三',
            planned_end_date: '2026-04-06',
          },
        ] as never
      }

      return [] as never
    })

    useStore.setState({
      currentProject: {
        id: projectId,
        name: '示例项目',
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
      acceptancePlans: [] as never,
      participantUnits: [] as never,
    } as never)
  })

  afterEach(() => {
    mockedUseNavigate.mockReset()
    mockedGetProjectSummary.mockReset()
    mockedApiGet.mockReset()
    navigateMock.mockReset()
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
  })

  it('keeps the milestone shell and routes the detail entry to gantt', async () => {
    await act(async () => {
      root?.render(
        <MemoryRouter initialEntries={[`/projects/${projectId}/milestones`]}>
          <Routes>
            <Route path="/projects/:id/milestones" element={<Milestones />} />
          </Routes>
        </MemoryRouter>,
      )
      await flush()
    })

    await waitForText(container, ['里程碑', '节点偏差表', '任务管理', '+1 较上月'])
    expect(container.querySelector('.page-shell')).toBeTruthy()
    expect(container.querySelector('[data-testid="milestones-page-title"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="milestones-summary-grid"]')?.className).toContain('xl:grid-cols-4')
    expect(container.querySelectorAll('[data-testid^="milestone-summary-card-"]')).toHaveLength(4)
    expect(container.querySelector('[data-testid="milestone-summary-card-当前已偏移数"]')?.textContent).toContain('+1 较上月')
    expect(container.querySelector('[data-testid="milestone-summary-card-施工效率"]')).toBeNull()
    expect(container.textContent).toContain('持平 较上月')
    expect(container.textContent).toContain('-1 较上月')
    expect(container.textContent).toContain('待积累 较上月')
    expect(container.querySelector('[data-testid="milestone-card-m2"]')).toBeTruthy()
    expect(findTab(container, '全部')).toBeTruthy()
    expect(findTab(container, '待完成')).toBeTruthy()
    expect(findTab(container, '7天内')).toBeTruthy()
    expect(findTab(container, '已逾期')).toBeTruthy()
    expect(findTab(container, '已完成')).toBeTruthy()
    expect(container.querySelector('[data-testid="milestone-level-group-1"]')?.textContent).toContain('一级里程碑')
    expect(container.querySelector('[data-testid="milestone-level-group-1"]')?.textContent).toContain('· 3')
    expect(container.querySelector('[data-testid="milestone-level-group-2"]')?.textContent).toContain('二级里程碑')
    expect(container.querySelector('[data-testid="milestone-level-group-3"]')?.textContent).toContain('三级里程碑')
    const levelOneGroup = container.querySelector('[data-testid="milestone-level-group-1"]')
    const levelOnePending = levelOneGroup?.querySelector('[data-testid="milestone-card-m5"]')
    const levelOneLaterPending = levelOneGroup?.querySelector('[data-testid="milestone-card-m3"]')
    const levelOneCompleted = levelOneGroup?.querySelector('[data-testid="milestone-card-m1"]')
    expect(levelOnePending && levelOneLaterPending && levelOneCompleted).toBeTruthy()
    expect((levelOnePending!.compareDocumentPosition(levelOneLaterPending!) & Node.DOCUMENT_POSITION_FOLLOWING) > 0).toBe(true)
    expect((levelOneLaterPending!.compareDocumentPosition(levelOneCompleted!) & Node.DOCUMENT_POSITION_FOLLOWING) > 0).toBe(true)
    expect(container.querySelector('[data-testid="milestone-card-m2"]')?.textContent).not.toContain('L2')
    expect(container.textContent).toContain('主体结构封顶')
    expect(container.textContent).toContain('待完成 · 日期待补齐')
    expect(container.textContent).toContain('按当前计划推进 · 当前')
    expect(container.textContent).toContain('按基线推进 · 基线')
    expect(container.querySelector('[data-testid="milestone-detail-panel"]')).toBeNull()
    expect(container.querySelector('[data-testid="milestone-status-m1"]')?.className).toContain('ring-emerald-200')
    expect(container.querySelector('[data-testid="milestone-status-m2"]')?.className).toContain('ring-amber-200')
    expect(container.querySelector('[data-testid="milestones-three-time"]')).toBeTruthy()
    const planCardButton = container.querySelector('[data-testid="milestone-card-m2"] button') as HTMLButtonElement | null
    expect(planCardButton).toBeTruthy()

    await act(async () => {
      planCardButton?.click()
      await flush()
    })
    expect(container.textContent).toContain('计划未对齐')
    expect(container.textContent).toContain('地上结构封顶')
    expect(container.querySelector('[data-testid="milestone-card-m2"]')?.textContent).toContain('偏差分析')
    expect(container.querySelector('[data-testid="milestone-card-m2"]')?.textContent).toContain('实际尚未完成')
    expect(container.querySelector('[data-testid="milestone-level-group-2"]')?.textContent).toContain('· 1')
    expect(container.querySelector('[data-testid="milestone-detail-panel"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="milestone-detail-hierarchy"]')?.textContent).toContain('地下室施工')
    expect(container.querySelector('[data-testid="milestone-detail-hierarchy"]')?.textContent).not.toContain('属于：')
    const detailTime = container.querySelector('[data-testid="milestone-detail-time"]')
    expect(detailTime?.textContent).toContain('时间线')
    expect(detailTime?.textContent).toContain('基线')
    expect(detailTime?.textContent).toContain('当前计划')
    expect(detailTime?.textContent).toContain('实际')
    expect(container.querySelector('[data-testid="milestone-detail-time-current"]')?.className).not.toContain('border-l-2')
    expect(container.querySelector('[data-testid="milestone-detail-time-current-label"]')?.className).toContain('text-slate-600')
    expect(container.querySelector('[data-testid="milestone-detail-time-actual-label"]')?.className).toContain('text-slate-300')
    expect(container.textContent).toContain('未完成')
    expect(container.textContent).not.toContain('待补映射')

    await act(async () => {
      const completedCardButton = container.querySelector('[data-testid="milestone-card-m1"] button') as HTMLButtonElement | null
      completedCardButton?.click()
      await flush()
    })

    expect(container.textContent).toContain('地下室施工')
    expect(container.textContent).toContain('主体结构封顶')
    expect(container.querySelector('[data-testid="milestone-detail-deviation-current"]')?.className).not.toContain('border-red-500')
    expect(container.querySelector('[data-testid="milestone-detail-deviation-current"]')?.className).not.toContain('pl-2.5')
    expect(container.querySelector('[data-testid="milestone-detail-deviation-current"]')?.className).not.toContain('bg-')
    expect(container.querySelector('[data-testid="milestone-detail-deviation-current"]')?.className).not.toContain('ring-')

    expect(document.body.querySelector('[data-testid="milestone-detail-panel"]')).toBeTruthy()
    await waitForText(document.body, ['偏差分析', '计划偏差', '实际偏差', '关联执行'])
    expect(document.body.textContent).not.toContain('对应关系')
    expect(document.body.textContent).not.toContain('最近更新')
    expect(document.body.textContent).toContain('进入任务管理')

    expect(document.body.querySelector('[data-testid="milestone-detail-panel"]')).toBeTruthy()
    expect(document.body.textContent).toContain('关联任务 1 个 · 已完成 0 个')

    const goToTasksLink = findLink(document.body, '进入任务管理')
    expect(goToTasksLink).toBeTruthy()
    expect(goToTasksLink?.getAttribute('href')).toContain(`/projects/${projectId}/gantt?`)

    await act(async () => {
      goToTasksLink?.click()
      await flush()
    })

    expect(navigateMock).toHaveBeenCalledWith(`/projects/${projectId}/gantt?milestoneId=m1&milestoneName=${encodeURIComponent('地下室施工')}`)
  })

  it('keeps upcoming milestones visible under the pending tab', async () => {
    await act(async () => {
      root?.render(
        <MemoryRouter initialEntries={[`/projects/${projectId}/milestones`]}>
          <Routes>
            <Route path="/projects/:id/milestones" element={<Milestones />} />
          </Routes>
        </MemoryRouter>,
      )
      await flush()
    })

    await waitForText(container, ['主体结构封顶', '待完成'])

    const pendingTab = findTab(container, '待完成')
    expect(pendingTab).toBeTruthy()

    await act(async () => {
      pendingTab?.click()
      await flush()
    })

    expect(container.textContent).toContain('主体结构封顶')
    expect(container.textContent).not.toContain('暂无匹配的节点')
  })
})
