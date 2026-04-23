import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import Milestones from '../Milestones'
import { PROJECT_NAVIGATION_LABELS } from '@/config/navigation'
import { useStore } from '@/hooks/useStore'
import { DashboardApiService } from '@/services/dashboardApi'

vi.mock('@/services/dashboardApi', () => ({
  DashboardApiService: {
    getProjectSummary: vi.fn(),
  },
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

describe('Milestones page story coverage', () => {
  const projectId = 'project-1'
  const navigateMock = vi.fn()
  let container: HTMLDivElement
  let root: Root | null = null

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)

    mockedUseNavigate.mockReturnValue(navigateMock)
    mockedGetProjectSummary.mockResolvedValue({
      id: projectId,
      name: '示例项目',
      milestoneOverview: {
        stats: {
          total: 3,
          pending: 2,
          completed: 1,
          overdue: 1,
          upcomingSoon: 1,
          completionRate: 33,
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
            updatedAt: '2026-04-01T00:00:00.000Z',
          },
          {
            id: 'm2',
            name: '地上结构封顶',
            description: '当前推进中的节点',
            targetDate: '2026-04-06',
            planned_date: '2026-04-06',
            current_planned_date: '2026-04-08',
            actual_date: null,
            progress: 60,
            status: 'soon',
            statusLabel: '临近节点',
            parent_id: 'm1',
            mapping_pending: true,
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
            updatedAt: '2026-04-03T00:00:00.000Z',
          },
        ],
      },
    } as never)

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
      scopeDimensions: [] as never,
    } as never)
  })

  afterEach(() => {
    mockedUseNavigate.mockReset()
    mockedGetProjectSummary.mockReset()
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
      scopeDimensions: [] as never,
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

    await waitForText(container, ['关键节点偏差与兑现页', '节点偏差表', PROJECT_NAVIGATION_LABELS.dashboard, '任务管理'])
    expect(container.querySelector('[data-testid="milestone-health-strip"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="milestone-child-group"]')).toBeTruthy()

    const milestoneButton = findButton(container, '地下室施工')
    expect(milestoneButton).toBeTruthy()

    await act(async () => {
      milestoneButton?.click()
      await flush()
    })

    await waitForText(container, ['偏差结果', '异常与对应关系', '关联执行'])
    expect(container.textContent).toContain('进入任务管理')

    const goToTasksButton = findButton(container, '进入任务管理')
    expect(goToTasksButton).toBeTruthy()

    await act(async () => {
      goToTasksButton?.click()
      await flush()
    })

    expect(navigateMock).toHaveBeenCalledWith(`/projects/${projectId}/gantt?highlight=m1`)
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

    await waitForText(container, ['主体结构封顶', '待完成 2'])

    const pendingTab = findButton(container, '待完成 2')
    expect(pendingTab).toBeTruthy()

    await act(async () => {
      pendingTab?.click()
      await flush()
    })

    expect(container.textContent).toContain('主体结构封顶')
    expect(container.textContent).not.toContain('暂无匹配的节点')
  })
})
