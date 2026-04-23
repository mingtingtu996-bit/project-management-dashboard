import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import TeamMembers from '../TeamMembers'
import { useStore } from '@/hooks/useStore'
import { AuthProvider } from '@/context/AuthContext'

function flush() {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

async function clickTab(container: HTMLElement, text: string) {
  const target = [...container.querySelectorAll('[role="tab"]')].find((element) => element.textContent?.includes(text))
  if (!target) {
    throw new Error(`Unable to find tab with text: ${text}`)
  }

  await act(async () => {
    target.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    target.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flush()
  })
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

describe('TeamMembers presentation layer', () => {
  const projectId = 'project-1'
  const projectName = '示例项目'
  let container: HTMLDivElement
  let root: Root | null = null
  const fetchMock = vi.fn()
  let membersData: Array<Record<string, unknown>>
  let invitationsData: Array<Record<string, unknown>>

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

    membersData = [
      {
        id: 'member-1',
        userId: 'user-1',
        username: 'zhangsan',
        displayName: '张三',
        email: 'zhangsan@example.com',
        permissionLevel: 'owner',
        joinedAt: '2026-04-01T08:00:00.000Z',
        lastActivity: '2026-04-05T08:00:00.000Z',
      },
      {
        id: 'member-2',
        userId: 'user-2',
        username: 'lisi',
        displayName: '李四',
        email: 'lisi@example.com',
        permissionLevel: 'editor',
        joinedAt: '2026-04-03T08:00:00.000Z',
        lastActivity: '2026-04-06T08:00:00.000Z',
      },
    ]
    invitationsData = [
      {
        id: 'inv-1',
        projectId,
        invitationCode: 'JOIN1234',
        permissionLevel: 'editor',
        createdAt: '2026-04-05T08:00:00.000Z',
        isRevoked: false,
        usedCount: 0,
      },
    ]

    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input)

      if (url.includes('/api/auth/me')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            authenticated: true,
            user: {
              id: 'user-1',
              username: 'zhangsan',
              display_name: '张三',
              globalRole: 'company_admin',
            },
          }),
        } as never
      }

      if (url.includes(`/api/members/${projectId}/me`)) {
        return {
          ok: true,
          json: async () => ({
            success: true,
            data: {
              projectId,
              permissionLevel: 'owner',
              globalRole: 'company_admin',
              canManageTeam: true,
              canEdit: true,
            },
          }),
        } as never
      }

      if (url.includes(`/api/members/${projectId}/unlinked-assignees`)) {
        return {
          ok: true,
          json: async () => ({
            success: true,
            data: [
              {
                assigneeName: '李四',
                taskCount: 2,
                taskIds: ['task-1', 'task-2'],
                sampleTaskTitles: ['主体结构验收', '机电样板确认'],
              },
            ],
          }),
        } as never
      }

      if (url.includes(`/api/members/${projectId}`)) {
        return {
          ok: true,
          json: async () => ({
            success: true,
            members: membersData,
          }),
        } as never
      }

      if (url.includes(`/api/invitations?projectId=${projectId}`)) {
        return {
          ok: true,
          json: async () => ({
            success: true,
            data: invitationsData,
          }),
        } as never
      }

      throw new Error(`Unexpected fetch url: ${url}`)
    })

    vi.stubGlobal('fetch', fetchMock)
    vi.mocked(window.localStorage.setItem).mockImplementation(() => undefined)
    vi.mocked(window.localStorage.removeItem).mockImplementation(() => undefined)
    vi.mocked(window.localStorage.clear).mockImplementation(() => undefined)
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

  it('reads as a project auxiliary page with consistent header and role badges', async () => {
    act(() => {
      root?.render(
        <AuthProvider>
          <MemoryRouter initialEntries={[`/projects/${projectId}/team`]}>
            <Routes>
              <Route path="/projects/:id/team" element={<TeamMembers />} />
            </Routes>
          </MemoryRouter>
        </AuthProvider>,
      )
    })

    await waitForText(container, ['辅助能力', '团队管理', '项目成员', '有效邀请码', '项目负责人', '生成邀请码', '待关联责任人'])

    expect(container.textContent).not.toContain('第七个项目主模块')
    expect(container.textContent).toContain('张三')
    expect(container.textContent).toContain('公司管理员')

    await clickTab(container, '待关联责任人')
    await waitForText(container, ['李四', '主体结构验收', '机电样板确认'])

    expect(container.textContent).toContain('李四')
  })

  it('opens the shared confirm dialog for removing a member and revoking an invitation', async () => {
    act(() => {
      root?.render(
        <AuthProvider>
          <MemoryRouter initialEntries={[`/projects/${projectId}/team`]}>
            <Routes>
              <Route path="/projects/:id/team" element={<TeamMembers />} />
            </Routes>
          </MemoryRouter>
        </AuthProvider>,
      )
    })

    await waitForText(container, ['项目成员', '有效邀请码', '待关联责任人'])

    await clickTab(container, '团队成员')
    await waitForText(container, ['张三', '李四'])

    const removeButton = Array.from(container.querySelectorAll('button')).find((element) => element.textContent?.includes('移除'))
    expect(removeButton).toBeTruthy()

    await act(async () => {
      removeButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await flush()
    })

    await waitForText(document.body as unknown as HTMLElement, ['移除项目成员', '确认移除“李四”吗？'])
    expect(document.body.querySelector('[data-testid="team-management-confirm-dialog"]')).toBeTruthy()

    const cancelButton = Array.from(document.body.querySelectorAll('button')).find((element) => element.textContent?.trim() === '取消')
    expect(cancelButton).toBeTruthy()

    await act(async () => {
      cancelButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await flush()
    })

    await clickTab(container, '邀请码')
    await waitForText(container, ['JOIN1234'])

    const revokeButton = Array.from(container.querySelectorAll('button')).find((element) => element.textContent?.includes('撤销'))
    expect(revokeButton).toBeTruthy()

    await act(async () => {
      revokeButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await flush()
    })

    await waitForText(document.body as unknown as HTMLElement, ['撤销邀请码', '确认撤销邀请码 JOIN1234 吗？'])
    expect(document.body.querySelector('[data-testid="team-management-confirm-dialog"]')).toBeTruthy()
  })
})
