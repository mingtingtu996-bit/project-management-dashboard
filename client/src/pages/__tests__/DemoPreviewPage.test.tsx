import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import DemoPreviewPage from '../DemoPreviewPage'

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

function RouteProbe() {
  const location = useLocation()
  return <div data-testid="route-probe">{location.pathname}</div>
}

function mountDemo() {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root: Root = createRoot(container)

  act(() => {
    root.render(
      <MemoryRouter initialEntries={['/demo']}>
        <Routes>
          <Route
            path="/demo"
            element={(
              <>
                <RouteProbe />
                <DemoPreviewPage />
              </>
            )}
          />
          <Route path="/workspace" element={<div data-testid="workspace-page">workspace</div>} />
        </Routes>
      </MemoryRouter>,
    )
  })

  return {
    container,
    cleanup() {
      act(() => {
        root.unmount()
      })
      container.remove()
    },
  }
}

describe('DemoPreviewPage', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input)

        if (url.includes('/api/demo-projects')) {
          const payload = {
            success: true,
            data: [
              {
                id: 'demo-commercial',
                name: '商业综合体项目',
                description: '商业建筑全生命周期示例',
                project_type: 'commercial',
                sort_order: 1,
                preview_payload: {
                  stage: '装修阶段',
                  highlights: ['计划编制', '风险预警'],
                  disabledActions: ['保存任务', '发布基线'],
                },
              },
            ],
            timestamp: new Date().toISOString(),
          }
          return {
            ok: true,
            status: 200,
            json: async () => payload,
            text: async () => JSON.stringify(payload),
          } as Response
        }

        throw new Error(`Unexpected request: ${url}`)
      }),
    )
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('loads demo projects from the read-only API and opens details in the demo namespace', async () => {
    const view = mountDemo()

    try {
      await waitForText(view.container, ['产品预览模式', '商业综合体项目'])

      const projectButton = view.container.querySelector('[data-testid="demo-project-card-demo-commercial"]') as HTMLButtonElement | null
      expect(projectButton?.tagName).toBe('BUTTON')
      expect(projectButton?.getAttribute('type')).toBe('button')

      await act(async () => {
        projectButton?.click()
        await flush()
      })

      await waitForText(view.container, ['只读演示详情', '装修阶段', '计划编制', '保存任务', '发布基线'])
      expect(view.container.querySelector('[data-testid="route-probe"]')?.textContent).toBe('/demo')
      expect(vi.mocked(fetch)).toHaveBeenCalledWith('/api/demo-projects', expect.objectContaining({ method: 'GET' }))
    } finally {
      view.cleanup()
    }
  })

  it('keeps write actions disabled and returns to workspace explicitly', async () => {
    const view = mountDemo()

    try {
      await waitForText(view.container, ['产品预览模式', '商业综合体项目'])
      expect(view.container.textContent || '').toContain('写入功能已禁用')

      const disabledAction = view.container.querySelector('[data-testid="demo-write-disabled-action"]') as HTMLButtonElement | null
      expect(disabledAction).toBeTruthy()
      expect(disabledAction?.disabled).toBe(true)

      const backButton = view.container.querySelector('[data-testid="demo-back-workspace"]') as HTMLButtonElement | null
      await act(async () => {
        backButton?.click()
        await flush()
      })

      expect(document.body.querySelector('[data-testid="workspace-page"]')).toBeTruthy()
    } finally {
      view.cleanup()
    }
  })
})
