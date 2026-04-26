import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AuthContext } from '@/context/AuthContext'
import { usePermissions } from '../usePermissions'

const authState = vi.hoisted(() => ({
  user: {
    id: 'user-1',
    globalRole: 'company_admin',
  },
  isAuthenticated: true,
}))

const projectState = vi.hoisted(() => ({
  project: {
    id: 'project-1',
    name: 'Sample Project',
    owner_id: 'user-2',
  },
}))

vi.mock('@/hooks/useStore', () => ({
  useCurrentProject: vi.fn(() => projectState.project),
}))

function flush() {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

function Probe() {
  const permissions = usePermissions({
    projectId: 'project-1',
  })

  return (
    <div data-testid="result">
      {permissions.permissionLevel}:{permissions.canEdit ? 'edit' : 'read'}
    </div>
  )
}

function renderProbe(root: Root | null) {
  root?.render(
    <AuthContext.Provider
      value={{
        authState: {
          isAuthenticated: authState.isAuthenticated,
          user: authState.user as never,
          loading: false,
        },
        login: vi.fn(),
        logout: vi.fn(),
        register: vi.fn(),
        changePassword: vi.fn(),
        updateProfile: vi.fn(),
      }}
    >
      <Probe />
    </AuthContext.Provider>,
  )
}

describe('usePermissions', () => {
  let container: HTMLDivElement
  let root: Root | null = null

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    vi.stubGlobal('fetch', vi.fn())
    projectState.project.owner_id = 'user-2'
  })

  afterEach(() => {
    act(() => {
      root?.unmount()
    })
    root = null
    container.remove()
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('loads editable permissions from the membership endpoint', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        data: {
          permissionLevel: 'editor',
          globalRole: 'company_admin',
          canManageTeam: false,
          canEdit: true,
        },
      }),
    } as Response)

    await act(async () => {
      renderProbe(root)
      await flush()
      await flush()
    })

    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/members/project-1/me',
      expect.objectContaining({
        credentials: 'include',
      }),
    )
    expect(container.textContent).toContain('editor:edit')
  })

  it('falls back to owner access without a membership lookup when the current user owns the project', async () => {
    projectState.project.owner_id = 'user-1'

    await act(async () => {
      renderProbe(root)
      await flush()
    })

    expect(globalThis.fetch).not.toHaveBeenCalled()
    expect(container.textContent).toContain('owner:edit')
  })
})
