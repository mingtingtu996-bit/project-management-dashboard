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

import { apiGet, apiPost, bindApiErrorToToast } from '../apiClient'

describe('apiClient global error toasts', () => {
  beforeAll(() => {
    bindApiErrorToToast()
  })

  beforeEach(() => {
    toastMock.mockReset()
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
})
