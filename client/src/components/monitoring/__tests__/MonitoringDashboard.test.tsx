import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import MonitoringDashboard from '../MonitoringDashboard'

const mockLocalMonitor = vi.hoisted(() => ({
  getApiMetrics: vi.fn(),
  getAverageResponseTime: vi.fn(),
  getErrorRate: vi.fn(),
  getSlowRequests: vi.fn(),
  getPerformanceMetrics: vi.fn(),
}))

vi.mock('@/lib/monitoring', () => ({
  localMonitor: mockLocalMonitor,
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

describe('MonitoringDashboard presentation layer', () => {
  let container: HTMLDivElement
  let root: Root | null = null

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)

    mockLocalMonitor.getApiMetrics.mockReturnValue([
      { url: '/api/projects', method: 'GET', statusCode: 200, duration: 120, timestamp: 1710000000000 },
      { url: '/api/tasks', method: 'POST', statusCode: 500, duration: 980, timestamp: 1710000100000, error: 'Boom' },
    ])
    mockLocalMonitor.getAverageResponseTime.mockReturnValue(550)
    mockLocalMonitor.getErrorRate.mockReturnValue(0.5)
    mockLocalMonitor.getSlowRequests.mockReturnValue([
      { url: '/api/tasks', method: 'POST', statusCode: 500, duration: 980, timestamp: 1710000100000, error: 'Boom' },
    ])
    mockLocalMonitor.getPerformanceMetrics.mockReturnValue([
      { name: 'dashboard-render', value: 12.4, timestamp: 1710000200000, metadata: { route: '/monitoring' } },
    ])
  })

  afterEach(() => {
    mockLocalMonitor.getApiMetrics.mockReset()
    mockLocalMonitor.getAverageResponseTime.mockReset()
    mockLocalMonitor.getErrorRate.mockReset()
    mockLocalMonitor.getSlowRequests.mockReset()
    mockLocalMonitor.getPerformanceMetrics.mockReset()

    act(() => {
      root?.unmount()
    })
    root = null
    container.remove()
  })

  it('renders as a hidden tool page with localized monitoring semantics', async () => {
    act(() => {
      root?.render(<MonitoringDashboard />)
    })

    await waitForText(container, ['监控中心', '隐藏路由', '接口监控', '性能追踪', '错误追踪', '接口请求', '平均响应'])

    expect(container.textContent).toContain('工具页')
    expect(container.textContent).toContain('错误率')
    expect(container.textContent).toContain('慢请求')
  })
})
