import type { ReactNode } from 'react'

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
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
    useLocation: vi.fn(),
    useNavigate: vi.fn(),
    useParams: vi.fn(),
  }
})

const mockedApiGet = vi.mocked(apiGet)
const mockedApiPost = vi.mocked(apiPost)
const mockedApiPut = vi.mocked(apiPut)
const mockedUseLocation = vi.mocked(useLocation)
const mockedUseNavigate = vi.mocked(useNavigate)
const mockedUseParams = vi.mocked(useParams)
const fetchMock = vi.fn()
const originalConsoleError = console.error
let consoleErrorSpy: ReturnType<typeof vi.spyOn> | null = null

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

function clickButtonText(container: HTMLElement, text: string) {
  const button = Array.from(container.querySelectorAll('button')).find((element) => element.textContent?.includes(text))
  if (!button) {
    throw new Error(`Button not found: ${text}`)
  }
  act(() => {
    button.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }))
    button.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
    button.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }))
    button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
  })
}

function clickExactButtonText(container: HTMLElement, text: string) {
  const button = Array.from(container.querySelectorAll('button')).find((element) => element.textContent?.trim() === text)
  if (!button) {
    throw new Error(`Exact button not found: ${text}`)
  }
  act(() => {
    button.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }))
    button.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
    button.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }))
    button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
  })
}

function clickTestId(container: HTMLElement, testId: string) {
  const resolvedTestId = testId === 'risk-stream-problems' ? 'risk-stream-issues' : testId
  const element = container.querySelector(`[data-testid="${resolvedTestId}"]`)
  if (!element) {
    throw new Error(`Element not found: ${resolvedTestId}`)
  }
  act(() => {
    element.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, button: 0 }))
    element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 }))
    element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, button: 0 }))
    if (element instanceof HTMLElement) {
      element.click()
    } else {
      element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }))
    }
  })
}

function hasLeafExactText(container: ParentNode, text: string) {
  return Array.from(container.querySelectorAll('*')).some((element) => {
    if (element.childElementCount > 0) {
      return false
    }
    return element.textContent?.trim() === text
  })
}

function setElementValue(element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, value: string) {
  act(() => {
    const prototype = Object.getPrototypeOf(element) as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value')
    descriptor?.set?.call(element, value)
    element.dispatchEvent(new Event('input', { bubbles: true }))
    element.dispatchEvent(new Event('change', { bubbles: true }))
  })
}

describe('RiskManagement', () => {
  const projectId = 'project-1'
  const navigateMock = vi.fn()
  const container = document.createElement('div')

  let root: Root | null = null

  const confirmedWarning = {
    id: 'warning-1',
    task_id: 'task-1',
    source_type: 'condition_expired',
    warning_type: 'condition_due',
    warning_level: 'warning' as const,
    title: '开工条件即将到期',
    description: '任务A的开工条件待确认',
    is_acknowledged: false,
    created_at: '2026-04-01T08:00:00.000Z',
  }

  const obstacleWarning = {
    id: 'warning-2',
    task_id: 'task-2',
    source_type: 'obstacle_escalated',
    warning_type: 'obstacle_timeout',
    warning_level: 'warning' as const,
    title: '阻碍已持续3天',
    description: '任务B材料未到',
    is_acknowledged: false,
    created_at: '2026-04-01T09:00:00.000Z',
  }

  let warningsData: Array<Record<string, unknown>>
  let issuesData: Array<Record<string, unknown>>
  let risksData: Array<Record<string, unknown>>
  let obstaclesData: Array<Record<string, unknown>>

  beforeEach(() => {
    document.body.appendChild(container)
    container.innerHTML = ''
    root = createRoot(container)
    mockedUseLocation.mockReturnValue({
      pathname: `/projects/${projectId}/risks`,
      search: '',
      hash: '',
      state: null,
      key: 'risk-test',
    })

    useStore.setState({
      currentProject: { id: projectId, name: '城市中心广场项目（二期）' } as never,
      notifications: [] as never,
      warnings: [] as never,
      issueRows: [] as never,
      problemRows: [] as never,
      tasks: [
        { id: 'task-3', specialty_type: 'structure' },
        { id: 'task-summary', specialty_type: 'structure' },
      ] as never,
      conditions: [] as never,
      obstacles: [] as never,
    })

    warningsData = [confirmedWarning, obstacleWarning]
    issuesData = [
      {
        id: 'issue-0',
        project_id: projectId,
        task_id: 'task-0',
        title: '既有风险',
        description: '已有的风险记录',
        source_type: 'risk_converted',
        severity: 'medium',
        priority: 2,
        status: 'open',
        created_at: '2026-04-01T00:00:00.000Z',
        updated_at: '2026-04-01T00:00:00.000Z',
        version: 1,
      },
    ]
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
    fetchMock.mockResolvedValue({
      json: async () => ({ success: false }),
    } as never)
    vi.stubGlobal('fetch', fetchMock)
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      const first = String(args[0] ?? '')
      if (first.includes('not wrapped in act')) {
        return
      }
      if (first.includes('Failed to refresh risk management data:')) {
        return
      }

      originalConsoleError(...(args as Parameters<typeof console.error>))
    })

    mockedApiGet.mockImplementation(async (url: string) => {
      if (url.includes('/api/warnings')) return warningsData as never
      if (url.includes('/api/issues')) return issuesData as never
      if (url.includes('/api/risks')) return risksData as never
      if (url.includes('/api/task-obstacles')) return obstaclesData as never
      if (url.includes('/api/change-logs')) return [] as never
      throw new Error(`Unexpected url: ${url}`)
    })

    mockedApiPost.mockResolvedValue({} as never)
    mockedApiPut.mockResolvedValue({} as never)

  })

  afterEach(() => {
    mockedApiGet.mockReset()
    mockedApiPost.mockReset()
    mockedApiPut.mockReset()
    mockedUseNavigate.mockReset()
    mockedUseParams.mockReset()
    fetchMock.mockReset()
    vi.unstubAllGlobals()
    useStore.setState({ currentProject: null } as never)
    useStore.setState({
      notifications: [] as never,
      warnings: [] as never,
      issueRows: [] as never,
      problemRows: [] as never,
      tasks: [] as never,
      conditions: [] as never,
      obstacles: [] as never,
    })

    act(() => {
      root?.unmount()
    })
    root = null
    container.remove()
    consoleErrorSpy?.mockRestore()
    consoleErrorSpy = null
  })

  it('renders the consolidated workspace without restoring the removed overview columns', async () => {
    await act(async () => {
      root?.render(<RiskManagement />)
      await flush()
      await flush()
    })

    await waitForCondition(
      () =>
        Boolean(container.querySelector('[data-testid="risk-summary-band"]')) &&
        Boolean(container.querySelector('[data-testid="risk-chain-workspace"]')) &&
        container.textContent?.includes('开工条件即将到期') &&
        container.textContent?.includes('阻碍已持续3天'),
      container,
    )

    const workspace = container.querySelector('[data-testid="risk-chain-workspace"]')
    expect(workspace?.textContent).toContain('预警看板')
    expect(workspace?.textContent).toContain('风险登记册')
    expect(workspace?.textContent).toContain('问题工作台')
    expect(container.textContent).toContain('开工条件即将到期')
    expect(container.textContent).toContain('阻碍已持续3天')
    expect(container.textContent).not.toContain('待确认或待处理的业务预警')
    expect(container.textContent).not.toContain('风险主数据源使用 /api/risks')
    expect(container.textContent).not.toContain('问题主数据源使用 /api/issues，并按优先级排序')

    clickTestId(container, 'risk-stream-risks')
    await waitForCondition(() => Boolean(workspace?.textContent?.includes('既有风险')), container)

    clickTestId(container, 'risk-stream-issues')
    await waitForCondition(() => Boolean(workspace?.textContent?.includes('既有风险')), container)

    await act(async () => {
      await flush()
      await flush()
    })
  })

  it('filters risks by route status and level', async () => {
    warningsData = []
    issuesData = []
    obstaclesData = []
    risksData = [
      {
        id: 'risk-route-match',
        project_id: projectId,
        task_id: 'task-route',
        title: '路由匹配风险',
        description: '应该保留',
        category: 'schedule',
        level: 'high',
        probability: 80,
        impact: 70,
        status: 'mitigating',
        created_at: '2026-04-01T00:00:00.000Z',
        updated_at: '2026-04-01T00:00:00.000Z',
        version: 1,
      },
      {
        id: 'risk-route-miss',
        project_id: projectId,
        task_id: 'task-route',
        title: '路由不匹配风险',
        description: '应该被过滤',
        category: 'schedule',
        level: 'low',
        probability: 10,
        impact: 20,
        status: 'identified',
        created_at: '2026-04-02T00:00:00.000Z',
        updated_at: '2026-04-02T00:00:00.000Z',
        version: 1,
      },
    ]
    mockedUseLocation.mockReturnValue({
      pathname: `/projects/${projectId}/risks`,
      search: '?stream=risks&status=mitigating&level=high',
      hash: '',
      state: null,
      key: 'risk-route-filter',
    })

    await act(async () => {
      root?.render(<RiskManagement />)
      await flush()
      await flush()
    })

    const riskWorkspace = container.querySelector('[data-testid="risk-chain-workspace"]') as HTMLElement | null
    expect(riskWorkspace).toBeTruthy()

    await waitForCondition(
      () =>
        Boolean(
          riskWorkspace?.textContent?.includes('路由匹配风险') &&
          !riskWorkspace.textContent?.includes('路由不匹配风险'),
        ),
      riskWorkspace ?? container,
    )

    expect(riskWorkspace?.textContent).toContain('路由匹配风险')
    expect(riskWorkspace?.textContent).not.toContain('路由不匹配风险')
  })

  it('surfaces task-derived warnings in the active warning area', async () => {
    warningsData = [
      {
        id: 'warning-condition',
        task_id: 'task-condition',
        source_type: 'manual',
        warning_type: 'condition_due',
        warning_level: 'warning',
        title: '土方开挖开工条件未满足',
        description: '工作面移交仍未完成',
        is_acknowledged: false,
        created_at: '2026-04-02T00:00:00.000Z',
      },
      {
        id: 'warning-delay',
        task_id: 'task-delay',
        source_type: 'condition_expired',
        warning_type: 'delay_exceeded',
        warning_level: 'critical',
        title: '任务已延期',
        description: '主体结构超过计划完成时间',
        is_acknowledged: false,
        created_at: '2026-04-03T00:00:00.000Z',
      },
    ]
    issuesData = []
    risksData = []
    obstaclesData = []

    useStore.setState({
      currentProject: { id: projectId, name: '城市中心广场项目（二期）' } as never,
      notifications: [] as never,
      warnings: [] as never,
      issueRows: [] as never,
      problemRows: [] as never,
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
        container.textContent?.includes('土方开挖开工条件未满足') &&
        container.textContent?.includes('任务已延期'),
      container,
    )

    expect(container.textContent).toContain('土方开挖开工条件未满足')
    expect(container.textContent).toContain('任务已延期')
    expect(container.textContent).toContain('条件过期')
    expect(container.textContent).toContain('链路来源')
    expect(container.textContent).not.toContain('暂无预警')

    clickTestId(container, 'risk-stream-risks')
    await waitForCondition(() => container.textContent?.includes('暂无风险'), container)
    expect(container.textContent).toContain('暂无风险')

    clickTestId(container, 'risk-stream-issues')
    await waitForCondition(() => container.textContent?.includes('暂无问题'), container)
    expect(container.textContent).toContain('暂无问题')
  })

  it('keeps the trend analysis collapsed by default and expands on demand', async () => {
    await act(async () => {
      root?.render(<RiskManagement />)
      await flush()
      await flush()
    })

    await waitForCondition(
      () =>
        Boolean(container.querySelector('[data-testid="risk-summary-band"]')) &&
        Boolean(container.querySelector('[data-testid="risk-trend-toggle"]')),
      container,
    )

    expect(fetchMock).not.toHaveBeenCalled()

    clickTestId(container, 'risk-trend-toggle')

    await waitForCondition(() => fetchMock.mock.calls.length > 0, container)
  })

  it('surfaces pending manual close items with banner actions and quick filter', async () => {
    risksData = [
      {
        id: 'risk-1',
        project_id: projectId,
        task_id: 'task-1',
        title: '待确认关闭A',
        description: '来源已解除',
        source_type: 'manual',
        level: 'medium',
        probability: 50,
        impact: 50,
        status: 'mitigating',
        pending_manual_close: true,
        created_at: '2026-04-01T00:00:00.000Z',
        updated_at: '2026-04-01T00:00:00.000Z',
        version: 2,
      },
      {
        id: 'risk-2',
        project_id: projectId,
        task_id: 'task-2',
        title: '待确认关闭B',
        description: '继续处理中',
        source_type: 'warning_converted',
        level: 'high',
        probability: 60,
        impact: 70,
        status: 'mitigating',
        pending_manual_close: true,
        created_at: '2026-04-01T01:00:00.000Z',
        updated_at: '2026-04-01T01:00:00.000Z',
        version: 3,
      },
      {
        id: 'risk-3',
        project_id: projectId,
        task_id: 'task-3',
        title: '普通风险',
        description: '不需要收口',
        source_type: 'manual',
        level: 'low',
        probability: 30,
        impact: 20,
        status: 'identified',
        pending_manual_close: false,
        created_at: '2026-04-01T02:00:00.000Z',
        updated_at: '2026-04-01T02:00:00.000Z',
        version: 1,
      },
    ]

    await act(async () => {
      root?.render(<RiskManagement />)
      await flush()
      await flush()
    })

    await waitForCondition(
      () => Boolean(container.querySelector('[data-testid="risk-chain-workspace"]')),
      container,
    )

    clickTestId(container, 'risk-stream-risks')

    await waitForCondition(
      () =>
        Boolean(container.querySelector('[data-testid="pending-manual-close-toggle"]')) &&
        container.textContent?.includes('待确认关闭A') &&
        container.textContent?.includes('待确认关闭B') &&
        container.textContent?.includes('普通风险'),
      container,
    )

    await waitForCondition(
      () =>
        container.textContent?.includes('待确认关闭 (2)') &&
        container.textContent?.includes('来源已解除，是否确认关闭？') &&
        container.textContent?.includes('确认关闭') &&
        container.textContent?.includes('保持处理中'),
      container,
    )
    expect(container.textContent).toContain('待确认关闭A')
    expect(container.textContent).toContain('待确认关闭B')
    expect(container.querySelector('[data-testid="pending-manual-close-toggle"]')).not.toBeNull()
  })

  it('supports task and timeline grouping plus independent manual issue creation', async () => {
    risksData = [
      {
        id: 'risk-1',
        project_id: projectId,
        task_id: 'task-1',
        title: '塔楼结构进度风险',
        description: '钢筋班组排产不足',
        source_type: 'manual',
        level: 'high',
        probability: 70,
        impact: 80,
        status: 'identified',
        created_at: '2026-04-02T00:00:00.000Z',
        updated_at: '2026-04-02T00:00:00.000Z',
        version: 1,
      },
      {
        id: 'risk-2',
        project_id: projectId,
        task_id: null,
        title: '项目级协调风险',
        description: '外部专项审批延迟',
        source_type: 'warning_auto_escalated',
        level: 'critical',
        probability: 90,
        impact: 90,
        status: 'mitigating',
        created_at: '2026-04-01T00:00:00.000Z',
        updated_at: '2026-04-01T00:00:00.000Z',
        version: 1,
      },
    ]

    mockedApiPost.mockResolvedValue({
      id: 'issue-new',
      title: '人工补录风险',
    } as never)

    await act(async () => {
      root?.render(<RiskManagement />)
      await flush()
      await flush()
    })

    clickTestId(container, 'risk-stream-risks')

    await waitForCondition(
      () =>
        container.textContent?.includes('按任务归类') &&
        container.textContent?.includes('时间轴') &&
        container.textContent?.includes('任务 task-1') &&
        container.textContent?.includes('塔楼结构进度风险'),
      container,
    )

    clickButtonText(container, '时间轴')
    await waitForCondition(
      () => container.textContent?.includes('2026/04/02') || container.textContent?.includes('2026/04/01'),
      container,
    )

    clickTestId(container, 'risk-stream-problems')

    await waitForCondition(() => Boolean(container.querySelector('[data-testid="manual-issue-create"]')), container)

    clickTestId(container, 'manual-issue-create')

    await waitForCondition(() => document.body.textContent?.includes('实时优先级分'), document.body)

    const titleInput = document.body.querySelector('input[placeholder="例如：专项审批资料缺失"]') as HTMLInputElement | null
    const severitySelect = document.body.querySelector('select') as HTMLSelectElement | null
    const descriptionInput = document.body.querySelector('textarea[placeholder="补充内容"]') as HTMLTextAreaElement | null

    if (!titleInput || !severitySelect || !descriptionInput) {
      throw new Error('Manual issue dialog fields not found')
    }

    setElementValue(titleInput, '人工补录风险')
    setElementValue(severitySelect, 'high')
    setElementValue(descriptionInput, '现场临时协调事项需要人工跟进')

    await act(async () => {
      await flush()
    })

    clickButtonText(document.body, '确认创建')

    await waitForCondition(() => mockedApiPost.mock.calls.length > 0, document.body)

    expect(mockedApiPost.mock.calls.at(-1)?.[0]).toBe('/api/issues')
    expect(mockedApiPost.mock.calls.at(-1)?.[1]).toMatchObject({
      project_id: projectId,
      title: '人工补录风险',
      description: '现场临时协调事项需要人工跟进',
      source_type: 'manual',
      severity: 'high',
      status: 'open',
      priority: 3,
    })
    expect(mockedApiPost.mock.calls.at(-1)?.[1]).not.toHaveProperty('chain_id')
  })

  it('surfaces issues loading failures instead of silently falling back to risks', async () => {
    mockedApiGet.mockImplementation(async (url: string) => {
      if (url.includes('/api/issues')) {
        throw new Error('issues down')
      }
      if (url.includes('/api/risks')) return risksData as never
      if (url.includes('/api/warnings')) return [] as never
      if (url.includes('/api/task-obstacles')) return [] as never
      if (url.includes('/api/change-logs')) return [] as never
      throw new Error(`Unexpected url: ${url}`)
    })

    await act(async () => {
      root?.render(<RiskManagement />)
      await flush()
      await flush()
    })

    await waitForCondition(() => container.textContent?.includes('issues down'), container)
    expect(container.textContent).toContain('issues down')

    clickTestId(container, 'risk-stream-risks')
    await waitForCondition(() => container.textContent?.includes('既有风险'), container)
    expect(container.textContent).toContain('既有风险')
  })

  it('converts risk to issue without issuing a second risk-close request', async () => {
    risksData = [
      {
        id: 'risk-convert-1',
        project_id: projectId,
        task_id: 'task-1',
        title: '需要升级的问题风险',
        description: '风险已达到问题阈值',
        source_type: 'warning_converted',
        chain_id: 'chain-1',
        level: 'high',
        probability: 70,
        impact: 80,
        status: 'mitigating',
        created_at: '2026-04-02T00:00:00.000Z',
        updated_at: '2026-04-02T00:00:00.000Z',
        version: 2,
      },
    ]
    issuesData = []
    mockedApiPost.mockResolvedValue({
      id: 'issue-converted-1',
      title: '需要升级的问题风险',
    } as never)

    await act(async () => {
      root?.render(<RiskManagement />)
      await flush()
      await flush()
    })

    clickTestId(container, 'risk-stream-risks')
    await waitForCondition(() => container.textContent?.includes('需要升级的问题风险'), container)

    clickButtonText(container, '转为问题')
    await waitForCondition(() => document.body.textContent?.includes('确认转入'), document.body)
    clickButtonText(document.body, '确认转入')

    await waitForCondition(() => mockedApiPost.mock.calls.length > 0, document.body)

    expect(mockedApiPost.mock.calls.at(-1)?.[0]).toBe('/api/issues')
    expect(mockedApiPost.mock.calls.at(-1)?.[1]).toMatchObject({
      project_id: projectId,
      source_type: 'risk_converted',
      source_id: 'risk-convert-1',
      source_entity_type: 'risk',
      source_entity_id: 'risk-convert-1',
      chain_id: 'chain-1',
    })
    expect(mockedApiPut).not.toHaveBeenCalledWith(
      '/api/risks/risk-convert-1',
      expect.objectContaining({ status: 'closed' }),
    )
  })

  it('does not render an invalid reopen action for closed issues', async () => {
    issuesData = [
      {
        id: 'issue-closed-1',
        project_id: projectId,
        task_id: 'task-9',
        title: '已关闭问题',
        description: '问题已闭环',
        source_type: 'manual',
        severity: 'medium',
        priority: 2,
        status: 'closed',
        created_at: '2026-04-01T00:00:00.000Z',
        updated_at: '2026-04-03T00:00:00.000Z',
        version: 4,
      },
    ]
    risksData = []
    warningsData = []
    obstaclesData = []

    await act(async () => {
      root?.render(<RiskManagement />)
      await flush()
      await flush()
    })

    clickTestId(container, 'risk-stream-problems')
    await waitForCondition(() => container.textContent?.includes('已关闭问题'), container)

    const reopenButtons = Array.from(container.querySelectorAll('button')).filter(
      (button) => button.textContent?.trim() === '重新打开',
    )
    expect(reopenButtons).toHaveLength(0)
  })

  it('renders the summary band and opens the detail drawer for risk records', async () => {
    warningsData = [
      {
        id: 'warning-summary-1',
        task_id: 'task-summary',
        warning_type: 'delay_exceeded',
        warning_level: 'critical',
        title: '关键任务延迟',
        description: '需要尽快确认链路处理方案',
        is_acknowledged: false,
        created_at: '2026-04-03T00:00:00.000Z',
      },
    ]
    risksData = [
      {
        id: 'risk-summary-1',
        project_id: projectId,
        task_id: 'task-summary',
        title: '塔楼结构进度风险',
        description: '现场资源切换导致结构施工受限',
        source_type: 'obstacle_escalated',
        chain_id: 'chain-summary-1',
        level: 'high',
        probability: 70,
        impact: 80,
        status: 'mitigating',
        created_at: '2026-04-02T00:00:00.000Z',
        updated_at: '2026-04-03T00:00:00.000Z',
        version: 3,
      },
    ]
    issuesData = [
      {
        id: 'issue-summary-1',
        project_id: projectId,
        task_id: 'task-summary',
        title: '结构面移交偏晚',
        description: '需要协调下游工序重新排产',
        source_type: 'risk_converted',
        severity: 'high',
        priority: 3,
        status: 'investigating',
        created_at: '2026-04-04T00:00:00.000Z',
        updated_at: '2026-04-04T00:00:00.000Z',
        version: 1,
      },
    ]

    await act(async () => {
      root?.render(<RiskManagement />)
      await flush()
      await flush()
    })

    await waitForCondition(
      () =>
        Boolean(container.querySelector('[data-testid="risk-summary-band"]')) &&
        Boolean(container.querySelector('[data-testid="risk-trend-summary"]')) &&
        container.textContent?.includes('链路摘要带'),
      container,
    )

    clickTestId(container, 'risk-stream-risks')
    await waitForCondition(() => container.textContent?.includes('塔楼结构进度风险'), container)
    clickTestId(container, 'risk-detail-open-risk-risk-summary-1')

    await waitForCondition(
      () =>
        Boolean(document.body.querySelector('[data-testid="risk-detail-dialog"]')) &&
        document.body.textContent?.includes('记录详情') &&
        document.body.textContent?.includes('塔楼结构进度风险') &&
        document.body.textContent?.includes('chain-summary-1'),
      document.body,
    )
  })

  it('renders exact warning, risk, and issue titles inside the chain dialog', async () => {
    warningsData = [
      {
        id: 'warning-chain-1',
        task_id: 'task-1',
        source_type: 'manual',
        warning_type: 'delay_exceeded',
        warning_level: 'warning',
        title: '链路预警标题',
        description: '链路预警说明',
        chain_id: 'chain-dialog-1',
        is_acknowledged: false,
        created_at: '2026-04-03T00:00:00.000Z',
      },
    ]
    risksData = [
      {
        id: 'risk-chain-1',
        project_id: projectId,
        task_id: 'task-1',
        title: '链路风险标题',
        description: '链路风险说明',
        source_type: 'warning_converted',
        chain_id: 'chain-dialog-1',
        level: 'high',
        probability: 70,
        impact: 80,
        status: 'mitigating',
        created_at: '2026-04-03T01:00:00.000Z',
        updated_at: '2026-04-03T01:00:00.000Z',
        version: 1,
      },
    ]
    issuesData = [
      {
        id: 'issue-chain-1',
        project_id: projectId,
        task_id: 'task-1',
        title: '链路问题标题',
        description: '链路问题说明',
        source_type: 'risk_converted',
        source_entity_type: 'risk',
        source_entity_id: 'risk-chain-1',
        chain_id: 'chain-dialog-1',
        severity: 'high',
        priority: 3,
        status: 'investigating',
        created_at: '2026-04-03T02:00:00.000Z',
        updated_at: '2026-04-03T02:00:00.000Z',
        version: 1,
      },
    ]
    obstaclesData = []

    await act(async () => {
      root?.render(<RiskManagement />)
      await flush()
      await flush()
    })

    clickTestId(container, 'risk-stream-problems')
    await waitForCondition(
      () => Boolean(container.querySelector('[data-testid="risk-open-chain-issue-issue-chain-1"]')),
      container,
    )

    clickTestId(container, 'risk-open-chain-issue-issue-chain-1')
    await waitForCondition(
      () => Boolean(document.body.querySelector('[data-testid="risk-chain-dialog"]')),
      document.body,
    )

    const chainDialog = document.body.querySelector('[data-testid="risk-chain-dialog"]') as HTMLElement | null
    if (!chainDialog) {
      throw new Error('Chain dialog not found')
    }

    await waitForCondition(
      () =>
        hasLeafExactText(chainDialog, '链路预警标题') &&
        hasLeafExactText(chainDialog, '链路风险标题') &&
        hasLeafExactText(chainDialog, '链路问题标题'),
      chainDialog,
    )

    expect(
      document.body.querySelector('[data-testid="risk-chain-warning-title-warning-chain-1"]')?.textContent?.trim(),
    ).toBe('链路预警标题')
    expect(
      document.body.querySelector('[data-testid="risk-chain-risk-title-risk-chain-1"]')?.textContent?.trim(),
    ).toBe('链路风险标题')
    expect(
      document.body.querySelector('[data-testid="risk-chain-issue-title-issue-chain-1"]')?.textContent?.trim(),
    ).toBe('链路问题标题')
  })

  it('shows drawings links for design obstacles in the problems stream and issue detail', async () => {
    warningsData = []
    risksData = []
    obstaclesData = [
      {
        id: 'obstacle-panel',
        task_id: 'task-3',
        description: '设计图纸尚未确认',
        obstacle_type: '设计',
        severity: 'high',
        status: 'active',
        created_at: '2026-04-01T00:00:00.000Z',
        updated_at: '2026-04-01T00:00:00.000Z',
      },
      {
        id: 'obstacle-issue',
        task_id: 'task-3',
        description: '设计图纸版本待确认',
        obstacle_type: '设计',
        severity: 'high',
        status: 'active',
        created_at: '2026-04-02T00:00:00.000Z',
        updated_at: '2026-04-02T00:00:00.000Z',
      },
    ]
    issuesData = [
      {
        id: 'issue-design-1',
        project_id: projectId,
        task_id: 'task-3',
        title: '设计问题待排查',
        description: '来源于设计类阻碍',
        source_type: 'obstacle_escalated',
        source_entity_type: 'task_obstacle',
        source_entity_id: 'obstacle-issue',
        severity: 'high',
        priority: 4,
        status: 'investigating',
        created_at: '2026-04-05T00:00:00.000Z',
        updated_at: '2026-04-05T00:00:00.000Z',
        version: 1,
      },
    ]

    await act(async () => {
      root?.render(<RiskManagement />)
      await flush()
      await flush()
    })

    clickTestId(container, 'risk-stream-problems')
    await waitForCondition(
      () => Boolean(container.querySelector('[data-testid="obstacle-drawings-link-obstacle-panel"]')),
      container,
    )

    const obstacleLink = container.querySelector('[data-testid="obstacle-drawings-link-obstacle-panel"]') as HTMLAnchorElement | null
    expect(obstacleLink?.getAttribute('href')).toBe('/projects/project-1/drawings?specialty=structure')

    clickTestId(container, 'risk-detail-open-issue-issue-design-1')
    await waitForCondition(
      () => Boolean(document.body.querySelector('[data-testid="issue-drawings-link-issue-design-1"]')),
      document.body,
    )

    const detailLink = document.body.querySelector('[data-testid="issue-drawings-link-issue-design-1"]') as HTMLAnchorElement | null
    expect(detailLink?.getAttribute('href')).toBe('/projects/project-1/drawings?specialty=structure')
  })

  it('shows a guard dialog when a close action is blocked by a 422 response', async () => {
    risksData = [
      {
        id: 'risk-guard-1',
        project_id: projectId,
        task_id: 'task-7',
        title: '待关闭但被业务规则拦截的风险',
        description: '当前还不能直接关闭',
        source_type: 'manual',
        level: 'high',
        probability: 70,
        impact: 80,
        status: 'mitigating',
        created_at: '2026-04-01T00:00:00.000Z',
        updated_at: '2026-04-03T00:00:00.000Z',
        version: 5,
      },
    ]
    issuesData = []
    warningsData = []
    obstaclesData = []
    mockedApiPut.mockRejectedValueOnce(
      Object.assign(new Error('当前风险仍在待处理链路中，暂不能确认关闭。'), { status: 422 }),
    )

    await act(async () => {
      root?.render(<RiskManagement />)
      await flush()
      await flush()
    })

    clickTestId(container, 'risk-stream-risks')
    await waitForCondition(() => container.textContent?.includes('待关闭但被业务规则拦截的风险'), container)

    clickButtonText(container, '关闭风险')

    await waitForCondition(
      () =>
        Boolean(document.body.querySelector('[data-testid="risk-action-guard-dialog"]')) &&
        document.body.textContent?.includes('更新风险') &&
        document.body.textContent?.includes('当前风险仍在待处理链路中，暂不能确认关闭。'),
      document.body,
    )
  })
})
