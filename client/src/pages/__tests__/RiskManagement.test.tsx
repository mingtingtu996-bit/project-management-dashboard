import type { ReactNode } from 'react'

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { useNavigate, useParams } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import RiskManagement from '../RiskManagement'
import { useStore } from '@/hooks/useStore'
import { apiGet, apiPost, apiPut } from '@/lib/apiClient'

vi.mock('@/components/ReadOnlyGuard', () => ({
  ReadOnlyGuard: ({ children }: { children: ReactNode }) => <>{children}</>,
}))

vi.mock('@/components/Breadcrumb', () => ({
  Breadcrumb: ({ items }: { items: Array<{ label: string }> }) => (
    <div>
      {items.map((item) => (
        <span key={item.label}>{item.label}</span>
      ))}
    </div>
  ),
}))

vi.mock('@/lib/apiClient', () => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  apiPut: vi.fn(),
}))

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return {
    ...actual,
    useNavigate: vi.fn(),
    useParams: vi.fn(),
  }
})

const mockedApiGet = vi.mocked(apiGet)
const mockedApiPost = vi.mocked(apiPost)
const mockedApiPut = vi.mocked(apiPut)
const mockedUseNavigate = vi.mocked(useNavigate)
const mockedUseParams = vi.mocked(useParams)
const originalConsoleError = console.error
const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
  const first = String(args[0] ?? '')
  if (first.includes('not wrapped in act')) {
    return
  }

  originalConsoleError(...(args as Parameters<typeof console.error>))
})

function flush() {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

async function waitForCondition(condition: () => boolean, container?: HTMLElement) {
  const deadline = Date.now() + 2000

  while (Date.now() < deadline) {
    let matched = false
    await act(async () => {
      await flush()
      matched = condition()
    })

    if (matched) {
      return
    }
  }

  throw new Error(`Condition not met within timeout${container ? `: ${container.textContent}` : ''}`)
}

function normalizeWarningText(value: string) {
  return value.replace(/\s+/g, '').trim()
}

function getWarningSignature(item: { warning_type: string; task_id?: string; description?: string }) {
  return [item.warning_type, item.task_id || '', normalizeWarningText(String(item.description || ''))].join('|')
}

describe('RiskManagement', () => {
  const projectId = 'project-1'
  const navigateMock = vi.fn()
  const storage = new Map<string, string>()
  const container = document.createElement('div')

  let root: Root | null = null

  const confirmedWarning = {
    id: 'warning-1',
    task_id: 'task-1',
    warning_type: 'condition_expired',
    warning_level: 'warning' as const,
    title: '开工条件即将到期',
    description: '任务A的开工条件待确认',
    is_acknowledged: false,
    created_at: '2026-04-01T08:00:00.000Z',
  }

  const obstacleWarning = {
    id: 'warning-2',
    task_id: 'task-2',
    warning_type: 'obstacle_timeout',
    warning_level: 'warning' as const,
    title: '阻碍已持续3天',
    description: '任务B材料未到',
    is_acknowledged: false,
    created_at: '2026-04-01T09:00:00.000Z',
  }

  let warningsData: Array<Record<string, unknown>>
  let risksData: Array<Record<string, unknown>>
  let obstaclesData: Array<Record<string, unknown>>

  beforeEach(() => {
    document.body.appendChild(container)
    container.innerHTML = ''
    root = createRoot(container)

    storage.clear()
    useStore.setState({
      currentProject: { id: projectId, name: '城市中心广场项目（二期）' } as never,
      tasks: [] as never,
      conditions: [] as never,
      obstacles: [] as never,
    })

    warningsData = [confirmedWarning, obstacleWarning]
    risksData = [
      {
        id: 'risk-0',
        project_id: projectId,
        task_id: 'task-0',
        title: '既有风险',
        description: '已有的风险记录',
        category: 'schedule',
        level: 'medium',
        probability: 50,
        impact: 50,
        status: 'identified',
        mitigation_plan: '',
        created_at: '2026-04-01T00:00:00.000Z',
        updated_at: '2026-04-01T00:00:00.000Z',
        version: 1,
      },
    ]
    obstaclesData = [
      {
        id: 'obstacle-1',
        task_id: 'task-3',
        description: '材料未到',
        obstacle_type: 'material',
        severity: 'medium',
        status: 'active',
        responsible_person: '张三',
        responsible_unit: '总包单位',
        expected_resolution_date: '2026-04-05T00:00:00.000Z',
        resolution_notes: '',
        resolved_at: '',
        created_at: '2026-04-01T00:00:00.000Z',
        updated_at: '2026-04-01T00:00:00.000Z',
      },
    ]

    mockedUseNavigate.mockReturnValue(navigateMock)
    mockedUseParams.mockReturnValue({ id: projectId })

    mockedApiGet.mockImplementation(async (url: string) => {
      if (url.includes('/api/warnings')) return warningsData as never
      if (url.includes('/api/risks')) return risksData as never
      if (url.includes('/api/task-obstacles')) return obstaclesData as never
      throw new Error(`Unexpected url: ${url}`)
    })

    mockedApiPost.mockResolvedValue({} as never)
    mockedApiPut.mockResolvedValue({} as never)

    const confirmedKey = `risk-management:confirmed-warnings:${projectId}`
    const confirmedSignature = getWarningSignature(confirmedWarning)
    storage.set(confirmedKey, JSON.stringify([confirmedSignature]))

    window.localStorage.getItem.mockImplementation((key: string) => storage.get(key) ?? null)
    window.localStorage.setItem.mockImplementation((key: string, value: string) => {
      storage.set(key, value)
    })
    window.localStorage.removeItem.mockImplementation((key: string) => {
      storage.delete(key)
    })
    window.localStorage.clear.mockImplementation(() => {
      storage.clear()
    })
  })

  afterEach(() => {
    mockedApiGet.mockReset()
    mockedApiPost.mockReset()
    mockedApiPut.mockReset()
    mockedUseNavigate.mockReset()
    mockedUseParams.mockReset()
    useStore.setState({ currentProject: null } as never)
    useStore.setState({
      tasks: [] as never,
      conditions: [] as never,
      obstacles: [] as never,
    })

    act(() => {
      root?.unmount()
    })
    root = null
    container.remove()
    storage.clear()
    consoleErrorSpy.mockRestore()
  })

  it('renders three sections and keeps confirmed warnings out of the active warning area', async () => {
    await act(async () => {
      root?.render(<RiskManagement />)
      await flush()
      await flush()
    })

    await waitForCondition(
      () =>
        container.textContent?.includes('预警') &&
        container.textContent?.includes('风险') &&
        container.textContent?.includes('问题') &&
        container.textContent?.includes('既有风险') &&
        container.textContent?.includes('材料未到') &&
        container.textContent?.includes('暂无预警'),
      container,
    )

    expect(container.textContent).toContain('预警')
    expect(container.textContent).toContain('风险')
    expect(container.textContent).toContain('问题')
    expect(container.textContent).toContain('既有风险')
    expect(container.textContent).toContain('材料未到')
    expect(container.textContent).toContain('暂无预警')
    expect(container.textContent).not.toContain('开工条件即将到期')
    expect(container.textContent).not.toContain('阻碍已持续3天')

    await act(async () => {
      await flush()
      await flush()
    })
  })

  it('does not surface task-derived warnings in the active warning area', async () => {
    warningsData = []
    risksData = []
    obstaclesData = []

    useStore.setState({
      currentProject: { id: projectId, name: '城市中心广场项目（二期）' } as never,
      tasks: [
        {
          id: 'task-condition',
          project_id: projectId,
          title: '土方开挖',
          status: 'in_progress',
          progress: 20,
          planned_end_date: '2026-03-30T00:00:00.000Z',
          created_at: '2026-03-20T00:00:00.000Z',
        },
        {
          id: 'task-delay',
          project_id: projectId,
          title: '主体结构',
          status: 'in_progress',
          progress: 40,
          planned_end_date: '2026-03-25T00:00:00.000Z',
          created_at: '2026-03-18T00:00:00.000Z',
        },
      ] as never,
      conditions: [
        {
          id: 'cond-1',
          task_id: 'task-condition',
          condition_name: '工作面移交',
          description: '工作面尚未移交',
          target_date: '2026-04-01T00:00:00.000Z',
          is_satisfied: false,
          status: '未满足',
          created_at: '2026-04-01T00:00:00.000Z',
        },
      ] as never,
      obstacles: [
        {
          id: 'obstacle-task',
          task_id: 'task-delay',
          description: '材料未到',
          obstacle_type: 'material',
          severity: 'medium',
          status: 'active',
          created_at: '2026-04-01T00:00:00.000Z',
        },
      ] as never,
    })

    await act(async () => {
      root?.render(<RiskManagement />)
      await flush()
      await flush()
    })

    await waitForCondition(
      () =>
        container.textContent?.includes('暂无预警') &&
        container.textContent?.includes('暂无风险') &&
        container.textContent?.includes('暂无问题'),
      container,
    )

    expect(container.textContent).toContain('暂无预警')
    expect(container.textContent).toContain('暂无风险')
    expect(container.textContent).toContain('暂无问题')
    expect(container.textContent).not.toContain('材料未到')
    expect(container.textContent).not.toContain('土方开挖开工条件未满足')
    expect(container.textContent).not.toContain('任务已延期')
  })
})
