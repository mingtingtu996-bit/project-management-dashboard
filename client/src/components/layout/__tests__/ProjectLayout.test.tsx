import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import ProjectLayout from '../ProjectLayout'
import { useStore } from '@/hooks/useStore'
import { ApiClientError } from '@/lib/apiClient'
import { projectDb } from '@/lib/localDb'

const { apiGet } = vi.hoisted(() => ({
  apiGet: vi.fn(),
}))

vi.mock('@/lib/apiClient', async () => {
  const actual = await vi.importActual<typeof import('@/lib/apiClient')>('@/lib/apiClient')
  return {
    ...actual,
    apiGet,
  }
})

const sharedSliceStatus = {
  notifications: { loading: false, error: null },
  warnings: { loading: false, error: null },
  issueRows: { loading: false, error: null },
  problemRows: { loading: false, error: null },
  delayRequests: { loading: false, error: null },
  changeLogs: { loading: false, error: null },
  taskProgressSnapshots: { loading: false, error: null },
} as const

function flush() {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

async function waitFor(check: () => boolean, describeFailure?: () => string) {
  const deadline = Date.now() + 3000

  while (Date.now() < deadline) {
    await act(async () => {
      await flush()
    })

    if (check()) {
      return
    }
  }

  throw new Error(describeFailure?.() || 'Timed out waiting for condition')
}

function resetStore() {
  useStore.setState({
    currentProject: null,
    hydratedProjectId: null,
    tasks: [],
    risks: [],
    milestones: [],
    conditions: [],
    obstacles: [],
    notifications: [],
    warnings: [],
    issueRows: [],
    problemRows: [],
    sharedSliceStatus: { ...sharedSliceStatus },
    participantUnits: [],
    scopeDimensions: [],
  })
}

describe('ProjectLayout', () => {
  let container: HTMLDivElement
  let root: Root | null = null

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    apiGet.mockReset()
    projectDb.replaceAll([])
    resetStore()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    act(() => {
      root?.unmount()
    })
    root = null
    container.remove()
    projectDb.replaceAll([])
    resetStore()
  })

  it('keeps the project route alive when the project API is temporarily unavailable but a cached project exists', async () => {
    vi.spyOn(projectDb, 'getById').mockReturnValue({
      id: 'project-1',
      name: '缓存项目',
      description: '',
      status: 'active',
      created_at: '2026-04-18T00:00:00.000Z',
      updated_at: '2026-04-18T00:00:00.000Z',
    })

    apiGet.mockImplementation((url: string) => {
      if (url === '/api/projects/project-1') {
        return Promise.reject(
          new ApiClientError('接口服务暂不可用', {
            status: null,
            url,
            code: 'network_error',
          }),
        )
      }

      return Promise.resolve([])
    })

    act(() => {
      root?.render(
        <MemoryRouter initialEntries={['/projects/project-1']}>
          <Routes>
            <Route path="/projects/:id" element={<ProjectLayout />}>
              <Route index element={<div data-testid="project-child">项目子页面</div>} />
            </Route>
            <Route path="/company" element={<div data-testid="company-page">公司驾驶舱</div>} />
          </Routes>
        </MemoryRouter>,
      )
    })

    await waitFor(
      () => Boolean(container.querySelector('[data-testid="project-child"]')),
      () => `Timed out waiting for cached project child. HTML: ${container.innerHTML}`,
    )

    expect(container.textContent).toContain('项目子页面')
    expect(container.textContent).not.toContain('公司驾驶舱')
    expect(container.textContent).not.toContain('项目加载失败')
  })

  it('hydrates the materials route without extra project or task lookups', async () => {
    act(() => {
      root?.render(
        <MemoryRouter initialEntries={['/projects/project-1/materials']}>
          <Routes>
            <Route path="/projects/:id" element={<ProjectLayout />}>
              <Route path="materials" element={<div data-testid="materials-child">材料子页面</div>} />
            </Route>
          </Routes>
        </MemoryRouter>,
      )
    })

    await waitFor(
      () => Boolean(container.querySelector('[data-testid="materials-child"]')),
      () => `Timed out waiting for materials child. HTML: ${container.innerHTML}`,
    )

    expect(container.textContent).toContain('材料子页面')
    expect(apiGet).not.toHaveBeenCalled()
  })

  it('shows not-found state for a real 404 instead of silently redirecting away', async () => {
    apiGet.mockImplementation((url: string) => {
      if (url === '/api/projects/project-missing') {
        return Promise.reject(
          new ApiClientError('项目不存在', {
            status: 404,
            url,
            code: 'http_error',
          }),
        )
      }

      return Promise.resolve([])
    })

    act(() => {
      root?.render(
        <MemoryRouter initialEntries={['/projects/project-missing']}>
          <Routes>
            <Route path="/projects/:id" element={<ProjectLayout />}>
              <Route index element={<div data-testid="project-child">项目子页面</div>} />
            </Route>
            <Route path="/company" element={<div data-testid="company-page">公司驾驶舱</div>} />
          </Routes>
        </MemoryRouter>,
      )
    })

    await waitFor(() => container.textContent?.includes('项目不存在') === true)

    expect(container.textContent).toContain('项目不存在')
    expect(container.textContent).toContain('project-missing')
    expect(container.querySelector('[data-testid="company-page"]')).toBeNull()
  })

  it('shows a retryable load error when the project API fails and no cache exists', async () => {
    apiGet.mockImplementation((url: string) => {
      if (url === '/api/projects/project-error') {
        return Promise.reject(
          new ApiClientError('接口服务暂不可用，请稍后重试。', {
            status: 503,
            url,
            code: 'http_error',
          }),
        )
      }

      return Promise.resolve([])
    })

    act(() => {
      root?.render(
        <MemoryRouter initialEntries={['/projects/project-error']}>
          <Routes>
            <Route path="/projects/:id" element={<ProjectLayout />}>
              <Route index element={<div data-testid="project-child">项目子页面</div>} />
            </Route>
            <Route path="/company" element={<div data-testid="company-page">公司驾驶舱</div>} />
          </Routes>
        </MemoryRouter>,
      )
    })

    await waitFor(() => container.textContent?.includes('项目加载失败') === true)

    expect(container.textContent).toContain('项目加载失败')
    expect(container.textContent).toContain('重新加载')
    expect(container.querySelector('[data-testid="company-page"]')).toBeNull()
  })
})
