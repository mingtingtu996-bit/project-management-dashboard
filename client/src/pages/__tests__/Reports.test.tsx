import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import Reports from '../Reports'
import { useStore } from '@/hooks/useStore'

vi.mock('@/services/dashboardApi', () => ({
  DashboardApiService: {
    getProjectSummary: vi.fn(async () => ({
      overallProgress: 64,
      completedTaskCount: 81,
      totalTasks: 120,
      inProgressTaskCount: 12,
      delayedTaskCount: 3,
      completedMilestones: 2,
      totalMilestones: 5,
      milestoneProgress: 40,
      healthScore: 82,
      healthStatus: '良好',
      activeRiskCount: 4,
      riskCount: 7,
      pendingConditionCount: 3,
      activeObstacleCount: 2,
    })),
  },
}))

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

describe('Reports presentation layer', () => {
  const projectId = 'project-1'
  const projectName = '示例项目'
  let container: HTMLDivElement
  let root: Root | null = null

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)

    useStore.setState({
      currentProject: {
        id: projectId,
        name: projectName,
      } as never,
      projects: [] as never,
      tasks: [] as never,
      risks: [] as never,
      milestones: [] as never,
      conditions: [] as never,
      obstacles: [] as never,
    })

    window.localStorage.getItem.mockImplementation(() => null)
    window.localStorage.setItem.mockImplementation(() => undefined)
    window.localStorage.removeItem.mockImplementation(() => undefined)
    window.localStorage.clear.mockImplementation(() => undefined)
  })

  afterEach(() => {
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
  })

  it('renders as a module analysis handoff page instead of a standalone report hub', async () => {
    act(() => {
      root?.render(
        <MemoryRouter initialEntries={[`/projects/${projectId}/reports`]}>
          <Routes>
            <Route path="/projects/:id/reports" element={<Reports />} />
          </Routes>
        </MemoryRouter>,
      )
    })

    await waitForText(container, ['模块分析', '项目进度总览分析', '风险与问题分析', 'WBS完成度分析'])

    expect(container.textContent).toContain('分析能力按模块承接')
    expect(container.textContent).toContain('证照管理 / 验收时间轴')
    expect(container.textContent).not.toContain('负责人进展')
    expect(container.textContent).not.toContain('责任单位进展')
  })

  it('formally hosts the WBS completion analysis inside task management', async () => {
    act(() => {
      root?.render(
        <MemoryRouter initialEntries={[`/projects/${projectId}/reports?view=wbs`]}>
          <Routes>
            <Route path="/projects/:id/reports" element={<Reports />} />
          </Routes>
        </MemoryRouter>,
      )
    })

    await waitForText(container, ['WBS完成度分析', '返回任务列表', '条件 / 阻碍压力'])

    expect(container.textContent).toContain('任务管理 / 任务列表')
    expect(container.textContent).toContain('WBS完成度')
  })
})
