import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import Notifications from '../Notifications'
import { useApi } from '@/hooks/useApi'
import { useAuth } from '@/hooks/useAuth'
import { useAuthDialog } from '@/hooks/useAuthDialog'
import { useStore } from '@/hooks/useStore'

vi.mock('@/hooks/use-toast', () => ({
  toast: vi.fn(),
}))

vi.mock('@/hooks/useApi', () => ({
  useApi: vi.fn(),
}))

vi.mock('@/hooks/useAuth', () => ({
  useAuth: vi.fn(),
}))

vi.mock('@/hooks/useAuthDialog', () => ({
  useAuthDialog: vi.fn(),
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
const mockedUseAuth = vi.mocked(useAuth)
const mockedUseAuthDialog = vi.mocked(useAuthDialog)

function flush() {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

function renderNotifications(root: Root | null, initialEntry = '/notifications') {
  root?.render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/notifications" element={<Notifications />} />
      </Routes>
    </MemoryRouter>,
  )
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
  const openLoginDialogMock = vi.fn()

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
    mockedUseAuth.mockReturnValue({
      isAuthenticated: true,
      loading: false,
    } as never)
    mockedUseAuthDialog.mockReturnValue({
      isOpen: false,
      openLoginDialog: openLoginDialogMock,
      closeLoginDialog: vi.fn(),
    })
    apiMock.put.mockResolvedValue({})
    apiMock.delete.mockResolvedValue({})
  })

  afterEach(() => {
    mockedUseNavigate.mockReset()
    mockedUseApi.mockReset()
    mockedUseAuth.mockReset()
    mockedUseAuthDialog.mockReset()
    apiMock.get.mockReset()
    apiMock.put.mockReset()
    apiMock.delete.mockReset()
    navigateMock.mockReset()
    openLoginDialogMock.mockReset()
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
      renderNotifications(root)
      await flush()
    })

    await waitForCondition(() => container.textContent?.includes('提醒中心') && container.textContent?.includes('风险预警'))

    expect(container.textContent).toContain('提醒中心')
    expect(container.textContent).toContain('公司级第二入口')
    expect(container.textContent).toContain('提醒设置')
    expect(container.textContent).toContain('业务预警')
    expect(container.textContent).toContain('流程催办')
    expect(container.textContent).toContain('系统异常')
    expect(container.textContent).toContain('应出现在提醒中心')
    expect(container.textContent).not.toContain('导出数据')
    expect(container.textContent).not.toContain('导入数据')
    expect(container.textContent).not.toContain('JSON备份')
    expect(container.textContent).not.toContain('下载模板')

    const goButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('前往处理'),
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
      renderNotifications(root)
      await flush()
    })

    await waitForCondition(() => container.textContent?.includes('风险预警'))

    const riskTab = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('业务预警'),
    ) as HTMLButtonElement | undefined

    expect(riskTab).toBeTruthy()

    await act(async () => {
      riskTab?.click()
      await flush()
    })

    expect(container.textContent).toContain('风险预警')
  })

  it('keeps material arrival reminders visible and routes them to materials page', async () => {
    apiMock.get.mockResolvedValue([
      {
        id: 'material-1',
        title: '幕墙单位材料到场提醒',
        message: '铝板预计 2026-04-25 到场，请及时确认施工条件。',
        category: 'materials',
        type: 'material_arrival_reminder',
        notificationType: 'material_arrival_reminder',
        sourceEntityType: 'project_material',
        read: false,
        projectId,
        createdAt: '2026-04-01T09:00:00.000Z',
      },
    ])

    await act(async () => {
      renderNotifications(root)
      await flush()
    })

    await waitForCondition(() => container.textContent?.includes('幕墙单位材料到场提醒') === true)

    expect(container.textContent).toContain('幕墙单位材料到场提醒')
    expect(container.textContent).toContain('流程催办')

    const goButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('前往处理'),
    ) as HTMLButtonElement | undefined

    expect(goButton).toBeTruthy()

    await act(async () => {
      goButton?.click()
      await flush()
    })

    expect(String(navigateMock.mock.calls.at(-1)?.[0] ?? '')).toContain(`/projects/${projectId}/materials`)
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
      renderNotifications(root)
      await flush()
    })

    await waitForCondition(() => container.textContent?.includes('任务延期提醒'))

    const goButtons = Array.from(container.querySelectorAll('button')).filter((button) =>
      button.textContent?.includes('前往处理'),
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
    expect(navigateMock.mock.calls.some((call) => call[0] === `/projects/${projectId}/acceptance`)).toBe(true)
  })

  it('keeps S2 mapping orphan notifications under system exceptions and routes them to planning baseline', async () => {
    apiMock.get.mockResolvedValue([
      {
        id: 'mapping-1',
        title: '规划映射存在孤立指针',
        message: '映射孤立指针 2 条，需要回到 Planning 基线收口。',
        category: 'planning_mapping_orphan',
        notificationType: 'planning-governance-mapping',
        type: 'planning_gov_mapping_orphan_pointer',
        read: false,
        projectId,
        sourceEntityType: 'planning_governance',
        createdAt: '2026-04-01T13:00:00.000Z',
      },
    ])

    await act(async () => {
      renderNotifications(root)
      await flush()
    })

    await waitForCondition(() => container.textContent?.includes('规划映射存在孤立指针'))

    expect(container.textContent).toContain('规划映射存在孤立指针')
    expect(container.textContent).toContain('S2 mapping')
    expect(container.textContent).toContain('系统异常')
    expect(container.textContent).not.toContain('映射孤立指针2 条')

    const goButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('前往处理'),
    ) as HTMLButtonElement | undefined

    expect(goButton).toBeTruthy()

    await act(async () => {
      goButton?.click()
      await flush()
    })

    expect(navigateMock).toHaveBeenCalledWith(`/projects/${projectId}/planning/baseline`)
  })

  it('opens the delete guard and removes the reminder only after confirm', async () => {
    let notificationsData = [
      {
        id: 'risk-1',
        title: '风险预警',
        message: '需要删除这条提醒',
        category: 'risk',
        type: 'warning',
        read: false,
        projectId,
        createdAt: '2026-04-01T09:00:00.000Z',
      },
    ]

    apiMock.get.mockImplementation(async (url: string) => {
      if (url.includes('/summary')) {
        return {
          pendingCount: notificationsData.length,
          processedCount: 0,
          businessWarningCount: 1,
          systemExceptionCount: 0,
          systemExceptionMappingCount: 0,
          flowReminderCount: 0,
          linkedProjectCount: 1,
          allCount: notificationsData.length,
        }
      }

      if (url.includes('/api/notifications')) {
        return notificationsData as never
      }

      throw new Error(`Unexpected url: ${url}`)
    })

    apiMock.delete.mockImplementation(async (url: string) => {
      const deletedId = url.split('/').filter(Boolean).at(-1)
      notificationsData = notificationsData.filter((item) => item.id !== deletedId)
      return {}
    })

    await act(async () => {
      renderNotifications(root)
      await flush()
    })

    await waitForCondition(() => container.textContent?.includes('风险预警') === true)

    const deleteButton = container.querySelector('[data-testid="notification-delete-action-risk-1"]') as HTMLButtonElement | null
    expect(deleteButton).toBeTruthy()

    await act(async () => {
      deleteButton?.click()
      await flush()
    })

    await waitForCondition(
      () => Boolean(document.body.querySelector('[data-testid="notification-delete-guard"]')),
    )

    const confirmButton = Array.from(document.body.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('确认删除'),
    ) as HTMLButtonElement | undefined
    expect(confirmButton).toBeTruthy()

    await act(async () => {
      confirmButton?.click()
      await flush()
      await flush()
    })

    expect(apiMock.delete).toHaveBeenCalledWith('/api/notifications/risk-1')
    await waitForCondition(() => container.textContent?.includes('风险预警') === false)
  })

  it('shows login guidance instead of requesting protected notifications when unauthenticated', async () => {
    mockedUseAuth.mockReturnValue({
      isAuthenticated: false,
      loading: false,
    } as never)

    await act(async () => {
      renderNotifications(root)
      await flush()
    })

    await waitForCondition(() => Boolean(container.querySelector('[data-testid="notifications-login-required"]')))

    expect(apiMock.get).not.toHaveBeenCalled()
    expect(container.textContent).toContain('登录后继续')

    const loginButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('登录后继续'),
    ) as HTMLButtonElement | undefined

    expect(loginButton).toBeTruthy()

    await act(async () => {
      loginButton?.click()
      await flush()
    })

    expect(openLoginDialogMock).toHaveBeenCalled()
  })
})
