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

    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input)

      if (url.includes('/api/auth/me')) {
        return {
          ok: false,
          status: 401,
          json: async () => ({ success: false }),
        } as never
      }

      if (url.includes(`/api/members/${projectId}`)) {
        return {
          ok: true,
          json: async () => ({
            success: true,
            members: [
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
            ],
          }),
        } as never
      }

      throw new Error(`Unexpected fetch url: ${url}`)
    })

    vi.stubGlobal('fetch', fetchMock)

    window.localStorage.getItem.mockImplementation((key: string) => {
      if (key === 'pm_invitations') {
        return JSON.stringify([
          {
            id: 'inv-1',
            project_id: projectId,
            invitation_code: 'JOIN1234',
            permission_level: 'editor',
            created_at: '2026-04-05T08:00:00.000Z',
            is_revoked: false,
            used_count: 0,
          },
        ])
      }
      return null
    })
    window.localStorage.setItem.mockImplementation(() => undefined)
    window.localStorage.removeItem.mockImplementation(() => undefined)
    window.localStorage.clear.mockImplementation(() => undefined)
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

    await waitForText(container, ['辅助能力', '团队成员', '项目成员', '有效邀请码', '所有者', '生成邀请码'])

    expect(container.textContent).not.toContain('第七个项目主模块')
    expect(container.textContent).toContain('张三')
    expect(container.textContent).toContain('JOIN1234')
  })
})
