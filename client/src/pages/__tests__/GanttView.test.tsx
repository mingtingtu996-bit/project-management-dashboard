import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import GanttView from '../GanttView'
import { useStore } from '@/hooks/useStore'

vi.mock('@/components/Breadcrumb', () => ({
  Breadcrumb: ({ items }: { items: Array<{ label: string; href?: string }> }) => (
    <nav>
      {items.map((item) => (
        <span key={item.label}>{item.label}</span>
      ))}
    </nav>
  ),
}))

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

describe('GanttView presentation layer', () => {
  const projectId = 'project-1'
  const projectName = '城市中心广场项目（二期）'
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

    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input)

      if (url.includes('/api/tasks?projectId=')) {
        return {
          ok: true,
          json: async () => ({ data: [] }),
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

  it('reads as task management / task list and does not surface reports as the main action', async () => {
    act(() => {
      root?.render(
        <MemoryRouter initialEntries={[`/projects/${projectId}/gantt`]}>
          <Routes>
            <Route path="/projects/:id/gantt" element={<GanttView />} />
          </Routes>
        </MemoryRouter>,
      )
    })

    await waitForText(container, ['任务管理', '任务列表', '任务总结'])

    expect(container.textContent).not.toContain('工期报表')
  })
})
