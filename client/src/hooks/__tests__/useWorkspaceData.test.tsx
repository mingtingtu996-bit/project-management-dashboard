import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useWorkspaceData } from '../useWorkspaceData'

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  persistCurrentCompanyId: vi.fn(),
  syncCurrentCompanyContext: vi.fn(),
}))

vi.mock('@/lib/apiClient', () => ({
  apiGet: mocks.apiGet,
  apiPost: mocks.apiPost,
  persistCurrentCompanyId: mocks.persistCurrentCompanyId,
}))

vi.mock('@/context/AuthContext', async () => {
  const actual = await vi.importActual<typeof import('@/context/AuthContext')>('@/context/AuthContext')
  return {
    ...actual,
    useAuth: () => ({
      syncCurrentCompanyContext: mocks.syncCurrentCompanyContext,
    }),
  }
})

function emptyWorkspace() {
  return {
    hasCompany: false,
    currentCompany: null,
    switchableCompanies: [],
    myProjects: [],
    recentProjects: [],
    companyProjects: [],
    joinableProjects: [],
    pendingInvitations: [],
    joinRequests: [],
    demoEntry: null,
    emptyStateReason: 'no_company',
  }
}

describe('useWorkspaceData company context', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.apiGet.mockResolvedValue(emptyWorkspace())
  })

  it('switches auth company context from the create-company response before relying on workspace refresh', async () => {
    mocks.apiPost.mockResolvedValueOnce({
      id: 'company-created',
      name: '新公司',
      role: 'company_admin',
    })

    const { result } = renderHook(() => useWorkspaceData())

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    await act(async () => {
      await result.current.createCompany('新公司')
    })

    expect(mocks.persistCurrentCompanyId).toHaveBeenCalledWith('company-created')
    expect(mocks.syncCurrentCompanyContext).toHaveBeenCalledWith({
      companyId: 'company-created',
      role: 'company_admin',
    })
  })

  it('keeps the created company active when the follow-up workspace refresh is stale', async () => {
    mocks.apiGet
      .mockResolvedValueOnce(emptyWorkspace())
      .mockResolvedValueOnce(emptyWorkspace())
    mocks.apiPost.mockResolvedValueOnce({
      id: 'company-created',
      name: '新公司',
      role: 'company_admin',
    })

    const { result } = renderHook(() => useWorkspaceData())

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    await act(async () => {
      await result.current.createCompany('新公司')
    })

    expect(result.current.hasCompany).toBe(true)
    expect(result.current.currentCompany).toMatchObject({
      id: 'company-created',
      name: '新公司',
      role: 'company_admin',
    })
    expect(result.current.emptyStateReason).toBe('no_project_membership')
    expect(mocks.persistCurrentCompanyId).toHaveBeenCalledWith('company-created')
    expect(mocks.syncCurrentCompanyContext).toHaveBeenLastCalledWith({
      companyId: 'company-created',
      role: 'company_admin',
    })
  })

  it('syncs the returned company role when switching companies', async () => {
    mocks.apiPost.mockResolvedValueOnce({
      companyId: 'company-regular',
      role: 'regular',
    })

    const { result } = renderHook(() => useWorkspaceData())

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    await act(async () => {
      await result.current.switchCompany('company-regular')
    })

    expect(mocks.persistCurrentCompanyId).toHaveBeenCalledWith('company-regular')
    expect(mocks.syncCurrentCompanyContext).toHaveBeenCalledWith({
      companyId: 'company-regular',
      role: 'regular',
    })
  })
})
