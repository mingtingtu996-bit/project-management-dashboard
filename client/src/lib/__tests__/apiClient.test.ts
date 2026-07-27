import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const { toastMock } = vi.hoisted(() => ({
  toastMock: vi.fn(),
}))

vi.mock('@/hooks/use-toast', () => ({
  toast: toastMock,
  useToast: () => ({
    toast: toastMock,
  }),
}))

import {
  AUTH_SESSION_EXPIRED_EVENT,
  COMMERCIAL_UPGRADE_REQUIRED_EVENT,
  apiGet,
  apiDelete,
  apiPost,
  bindApiErrorToToast,
  clearApiClientRuntimeCache,
  getAuthToken,
  persistAuthToken,
} from '../apiClient'

describe('apiClient global error toasts', () => {
  beforeAll(() => {
    bindApiErrorToToast()
  })

  beforeEach(() => {
    toastMock.mockReset()
    clearApiClientRuntimeCache()
    vi.stubGlobal('fetch', vi.fn())
    Object.defineProperty(window.navigator, 'onLine', {
      configurable: true,
      value: true,
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  afterAll(() => {
    Object.defineProperty(window.navigator, 'onLine', {
      configurable: true,
      value: true,
    })
  })

  it('shows a friendly toast when api requests fail at the network layer', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new TypeError('Failed to fetch'))

    await expect(apiGet('/api/projects')).rejects.toMatchObject({
      code: 'network_error',
      status: null,
    })

    expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({
      title: '网络请求失败',
      description: expect.stringContaining('接口服务暂不可用'),
      variant: 'destructive',
    }))
  })

  it('shows an offline-friendly toast before write requests are sent', async () => {
    Object.defineProperty(window.navigator, 'onLine', {
      configurable: true,
      value: false,
    })

    await expect(apiPost('/api/tasks', { title: '新任务' })).rejects.toMatchObject({
      code: 'network_error',
      status: null,
    })

    expect(fetch).not.toHaveBeenCalled()
    expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({
      title: '网络连接已断开',
      description: '当前处于离线状态，无法保存或提交内容，请恢复网络后重试。',
      variant: 'destructive',
    }))
  })

  it('shows a friendly toast for server-side 500 errors', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response('{"error":{"message":"服务内部异常"}}', {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    await expect(apiGet('/api/dashboard')).rejects.toMatchObject({
      code: 'http_error',
      status: 500,
    })

    expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({
      title: '服务暂时不可用',
      description: '服务内部异常',
      variant: 'destructive',
    }))
  })

  it('bypasses browser cache for API requests by default', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response('{"data":[]}', {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    await expect(apiGet('/api/risks?projectId=project-1')).resolves.toEqual([])

    expect(fetch).toHaveBeenCalledWith(
      '/api/risks?projectId=project-1',
      expect.objectContaining({
        cache: 'no-store',
        credentials: 'include',
        method: 'GET',
      }),
    )
  })

  it('deduplicates concurrent identical api GET requests', async () => {
    let resolveFetch: (response: Response) => void = () => undefined
    vi.mocked(fetch).mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = resolve
        }),
    )

    const first = apiGet('/api/projects/project-1/bootstrap')
    const second = apiGet('/api/projects/project-1/bootstrap')

    expect(fetch).toHaveBeenCalledTimes(1)

    resolveFetch(
      new Response('{"data":{"id":"project-1","name":"示例项目"}}', {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    await expect(first).resolves.toEqual({ id: 'project-1', name: '示例项目' })
    await expect(second).resolves.toEqual({ id: 'project-1', name: '示例项目' })
  })

  it('serves repeated api GET requests from a short runtime cache', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response('{"data":{"items":["风险A"]}}', {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    const first = await apiGet<{ items: string[] }>('/api/risks?projectId=project-1', {
      runtimeCacheTtlMs: 10000,
    })
    first.items.push('本地突变不应污染缓存')

    const second = await apiGet('/api/risks?projectId=project-1', {
      runtimeCacheTtlMs: 10000,
    })

    expect(fetch).toHaveBeenCalledTimes(1)
    expect(second).toEqual({ items: ['风险A'] })
  })

  it('clears the short runtime cache after write requests', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        new Response('{"data":[{"id":"risk-1"}]}', {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response('{"data":{"ok":true}}', {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response('{"data":[{"id":"risk-2"}]}', {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )

    await expect(apiGet('/api/risks?projectId=project-1', { runtimeCacheTtlMs: 10000 })).resolves.toEqual([
      { id: 'risk-1' },
    ])
    await expect(apiPost('/api/risks', { title: '新增风险' })).resolves.toEqual({ ok: true })
    await expect(apiGet('/api/risks?projectId=project-1', { runtimeCacheTtlMs: 10000 })).resolves.toEqual([
      { id: 'risk-2' },
    ])

    expect(fetch).toHaveBeenCalledTimes(3)
  })

  it('treats 204 empty DELETE responses as success', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(null, {
        status: 204,
      }),
    )

    await expect(apiDelete<void>('/api/projects/project-1/wizard/draft')).resolves.toBeUndefined()

    expect(fetch).toHaveBeenCalledWith(
      '/api/projects/project-1/wizard/draft',
      expect.objectContaining({
        cache: 'no-store',
        credentials: 'include',
        method: 'DELETE',
      }),
    )
  })

  it('clears expired auth tokens and emits a session expired event on invalid token responses', async () => {
    const sessionExpiredListener = vi.fn()
    window.addEventListener(AUTH_SESSION_EXPIRED_EVENT, sessionExpiredListener)
    persistAuthToken('expired-token-for-test')
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response('{"error":{"code":"INVALID_TOKEN","message":"无效的认证token或token已过期"}}', {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    await expect(apiGet('/api/company-summary')).rejects.toMatchObject({
      code: 'http_error',
      status: 401,
    })

    expect(getAuthToken()).toBe('')
    expect(sessionExpiredListener).toHaveBeenCalledWith(expect.objectContaining({
      detail: expect.objectContaining({
        url: '/api/company-summary',
      }),
    }))

    window.removeEventListener(AUTH_SESSION_EXPIRED_EVENT, sessionExpiredListener)
  })

  it('emits a structured upgrade event for commercial admission failures', async () => {
    const listener = vi.fn()
    window.addEventListener(COMMERCIAL_UPGRADE_REQUIRED_EVENT, listener)
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({
        error: {
          code: 'COMMERCIAL_PROJECT_LIMIT_REACHED',
          message: '项目数量已达上限',
          details: {
            activeProjectLimit: 2,
            activeProjectCount: 2,
            upgradePath: '/settings/billing',
          },
        },
      }), {
        status: 402,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    await expect(apiPost('/api/projects', { name: 'blocked' })).rejects.toMatchObject({
      status: 402,
      serverCode: 'COMMERCIAL_PROJECT_LIMIT_REACHED',
      upgradePath: '/settings/billing',
    })
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({
      detail: expect.objectContaining({
        code: 'COMMERCIAL_PROJECT_LIMIT_REACHED',
        upgradePath: '/settings/billing',
      }),
    }))
    window.removeEventListener(COMMERCIAL_UPGRADE_REQUIRED_EVENT, listener)
  })
})
