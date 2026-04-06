import { act } from 'react'
import type { ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import PreMilestones from '../PreMilestones'
import AcceptanceTimeline from '../AcceptanceTimeline'
import { useStore } from '@/hooks/useStore'

vi.mock('@/components/ReadOnlyGuard', () => ({
  ReadOnlyGuard: ({ children }: { children: ReactNode }) => <>{children}</>,
}))

vi.mock('@/services/acceptanceApi', () => ({
  acceptanceApi: {
    getPlans: vi.fn(async () => []),
    getCustomTypes: vi.fn(async () => []),
    updatePosition: vi.fn(async () => undefined),
    addDependency: vi.fn(async () => undefined),
    removeDependency: vi.fn(async () => undefined),
    updateStatus: vi.fn(async () => undefined),
    createCustomType: vi.fn(async (type: Record<string, unknown>) => ({ id: 'type-1', ...type })),
    deleteCustomType: vi.fn(async () => undefined),
    createPlan: vi.fn(async (plan: Record<string, unknown>) => ({ id: 'plan-1', ...plan })),
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

describe('License management presentation layer', () => {
  const projectId = 'project-1'
  const projectName = '示例项目'
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
      } as never,
      projects: [] as never,
      tasks: [] as never,
      risks: [] as never,
      milestones: [] as never,
      conditions: [] as never,
      obstacles: [] as never,
    })

    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input)

      if (url.includes('/api/')) {
        return {
          ok: true,
          json: async () => ({ success: true, data: [] }),
        } as never
      }

      throw new Error(`Unexpected fetch url: ${url}`)
    })

    vi.stubGlobal('fetch', fetchMock)

    window.localStorage.getItem.mockImplementation(() => null)
    window.localStorage.setItem.mockImplementation(() => undefined)
    window.localStorage.removeItem.mockImplementation(() => undefined)
    window.localStorage.clear.mockImplementation(() => undefined)
  })

  afterEach(() => {
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

  it('keeps PreMilestones inside the license management parent module and removes the reports primary action', async () => {
    act(() => {
      root?.render(
        <MemoryRouter initialEntries={[`/projects/${projectId}/pre-milestones`]}>
          <Routes>
            <Route path="/projects/:id/pre-milestones" element={<PreMilestones />} />
          </Routes>
        </MemoryRouter>,
      )
    })

    await waitForText(container, ['证照管理', '前期证照'])

    expect(container.textContent).toContain('证照管理父模块下')
    expect(container.textContent).not.toContain('查看证照状态')
  })

  it('keeps AcceptanceTimeline inside the license management parent module and removes the reports primary action', async () => {
    act(() => {
      root?.render(
        <MemoryRouter initialEntries={[`/projects/${projectId}/acceptance`]}>
          <Routes>
            <Route path="/projects/:id/acceptance" element={<AcceptanceTimeline />} />
          </Routes>
        </MemoryRouter>,
      )
    })

    await waitForText(container, ['证照管理', '验收时间轴'])

    expect(container.textContent).toContain('证照管理父模块下的验收节点与时间线')
    expect(container.textContent).not.toContain('验收报表')
  })
})
