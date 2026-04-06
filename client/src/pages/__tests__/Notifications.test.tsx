import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { useNavigate } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import Notifications from '../Notifications'
import { useApi } from '@/hooks/useApi'
import { useStore } from '@/hooks/useStore'

vi.mock('@/hooks/use-toast', () => ({
  toast: vi.fn(),
}))

vi.mock('@/hooks/useApi', () => ({
  useApi: vi.fn(),
}))

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return {
    ...actual,
    useNavigate: vi.fn(),
  }
})

const mockedUseNavigate = vi.mocked(useNavigate)
const mockedUseApi = vi.mocked(useApi)

function flush() {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

async function waitForCondition(condition: () => boolean) {
  const deadline = Date.now() + 2000

  while (Date.now() < deadline) {
    let matched = false
    await act(async () => {
      await flush()
      matched = condition()
    })

    if (matched) return
  }

  throw new Error('Condition not met within timeout')
}

describe('Notifications', () => {
  const projectId = 'project-1'
  const navigateMock = vi.fn()
  const container = document.createElement('div')
  let root: Root | null = null

  const apiMock = {
    get: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  }

  beforeEach(() => {
    document.body.appendChild(container)
    container.innerHTML = ''
    root = createRoot(container)

    useStore.setState({
      currentProject: { id: projectId, name: '城市中心广场项目（一期）' } as never,
      connectionMode: 'websocket',
    } as never)

    mockedUseNavigate.mockReturnValue(navigateMock)
    mockedUseApi.mockReturnValue(apiMock as never)
    apiMock.put.mockResolvedValue({})
    apiMock.delete.mockResolvedValue({})
  })

  afterEach(() => {
    mockedUseNavigate.mockReset()
    mockedUseApi.mockReset()
    apiMock.get.mockReset()
    apiMock.put.mockReset()
    apiMock.delete.mockReset()
    navigateMock.mockReset()
    act(() => {
      root?.unmount()
    })
    root = null
    container.remove()
    useStore.setState({ currentProject: null } as never)
  })

  it('keeps reminder center focused on risk, issue and follow-up reminders', async () => {
    apiMock.get.mockResolvedValue([
      {
        id: 'sys-1',
        title: '系统通知',
        message: '系统级提醒',
        category: 'system',
        type: 'info',
        read: false,
        projectId,
        createdAt: '2026-04-01T08:00:00.000Z',
      },
      {
        id: 'risk-1',
        title: '风险预警',
        message: '应出现在提醒中心',
        category: 'risk',
        type: 'warning',
        read: false,
        projectId,
        createdAt: '2026-04-01T09:00:00.000Z',
      },
    ])

    await act(async () => {
      root?.render(<Notifications />)
      await flush()
    })

    await waitForCondition(() => container.textContent?.includes('提醒中心') && container.textContent?.includes('风险预警'))

    expect(container.textContent).toContain('提醒中心')
    expect(container.textContent).toContain('公司级第二入口')
    expect(container.textContent).toContain('提醒设置')
    expect(container.textContent).toContain('风险 / 问题')
    expect(container.textContent).toContain('关键跟进')
    expect(container.textContent).toContain('系统 / 广播')
    expect(container.textContent).toContain('应出现在提醒中心')
    expect(container.textContent).not.toContain('导出数据')
    expect(container.textContent).not.toContain('导入数据')
    expect(container.textContent).not.toContain('JSON备份')
    expect(container.textContent).not.toContain('下载模板')

    const goButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('去处理'),
    ) as HTMLButtonElement | undefined

    expect(goButton).toBeTruthy()

    await act(async () => {
      goButton?.click()
      await flush()
    })

    expect(navigateMock).toHaveBeenCalled()
    expect(String(navigateMock.mock.calls.at(-1)?.[0] ?? '')).toContain(`/projects/${projectId}`)
  })

  it('filters reminder items through risk and issue tab instead of hiding them', async () => {
    apiMock.get.mockResolvedValue([
      {
        id: 'sys-1',
        title: '系统通知',
        message: '系统级提醒',
        category: 'system',
        type: 'info',
        read: false,
        projectId,
        createdAt: '2026-04-01T08:00:00.000Z',
      },
      {
        id: 'risk-1',
        title: '风险预警',
        message: '需要立即关注',
        category: 'risk',
        type: 'warning',
        read: false,
        projectId,
        createdAt: '2026-04-01T09:00:00.000Z',
      },
    ])

    await act(async () => {
      root?.render(<Notifications />)
      await flush()
    })

    await waitForCondition(() => container.textContent?.includes('风险预警'))

    const riskTab = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('风险 / 问题'),
    ) as HTMLButtonElement | undefined

    expect(riskTab).toBeTruthy()

    await act(async () => {
      riskTab?.click()
      await flush()
    })

    expect(container.textContent).toContain('风险预警')
  })

  it('routes reminder items to the correct project module by payload', async () => {
    apiMock.get.mockResolvedValue([
      {
        id: 'task-1',
        title: '任务延期提醒',
        message: '任务需要立即处理',
        category: 'system',
        type: 'warning',
        read: false,
        projectId,
        taskId: 'task-1',
        createdAt: '2026-04-01T10:00:00.000Z',
      },
      {
        id: 'risk-2',
        title: '风险升级提醒',
        message: '风险需要处理',
        category: 'system',
        type: 'critical',
        read: false,
        projectId,
        createdAt: '2026-04-01T11:00:00.000Z',
      },
      {
        id: 'license-1',
        title: '验收临期提醒',
        message: '验收事项需要处理',
        category: 'system',
        type: 'info',
        read: false,
        projectId,
        sourceEntityType: 'acceptance',
        createdAt: '2026-04-01T12:00:00.000Z',
      },
    ])

    await act(async () => {
      root?.render(<Notifications />)
      await flush()
    })

    await waitForCondition(() => container.textContent?.includes('任务延期提醒'))

    const goButtons = Array.from(container.querySelectorAll('button')).filter((button) =>
      button.textContent?.includes('去处理'),
    ) as HTMLButtonElement[]

    expect(goButtons).toHaveLength(3)

    for (const button of goButtons) {
      await act(async () => {
        button.click()
        await flush()
      })
    }

    expect(navigateMock.mock.calls.some((call) => call[0] === `/projects/${projectId}/gantt`)).toBe(true)
    expect(navigateMock.mock.calls.some((call) => call[0] === `/projects/${projectId}/risks`)).toBe(true)
    expect(navigateMock.mock.calls.some((call) => call[0] === `/projects/${projectId}/pre-milestones`)).toBe(true)
  })
})
