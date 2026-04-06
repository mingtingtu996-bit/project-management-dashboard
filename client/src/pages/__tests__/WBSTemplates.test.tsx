import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import WBSTemplates from '../WBSTemplates'
import { useStore } from '@/hooks/useStore'

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

describe('WBSTemplates presentation layer', () => {
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

      if (url.includes('/api/wbs-templates')) {
        return {
          ok: true,
          json: async () => ({ success: true, data: [] }),
        } as never
      }

      if (url.includes('/api/projects')) {
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

  it('reads as an independent main module that serves task management without becoming a child page', async () => {
    act(() => {
      root?.render(
        <MemoryRouter initialEntries={[`/projects/${projectId}/wbs-templates`]}>
          <Routes>
            <Route path="/projects/:id/wbs-templates" element={<WBSTemplates />} />
          </Routes>
        </MemoryRouter>,
      )
    })

    await waitForText(container, ['独立主模块', 'WBS 模板', '任务列表页'])

    expect(container.textContent).toContain('任务管理')
    expect(container.textContent).toContain('WBS 模板是独立主模块')
    expect(container.textContent).not.toContain('WBS 模板库')
    expect(container.textContent).not.toContain('任务管理子页')
  })
})
