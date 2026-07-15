// v1.4.20.1: Workspace data hook
// Consumes GET /api/workspace, provides flat state for WorkspacePage

import { useCallback, useEffect, useRef, useState } from 'react'
import { apiGet, apiPost, persistCurrentCompanyId } from '@/lib/apiClient'
import { useAuth } from '@/context/AuthContext'

export interface WorkspaceCompany {
  id: string
  name: string
  role: 'company_admin' | 'regular'
  isCurrent: boolean
  active?: boolean
}

export interface WorkspaceProject {
  id: string
  name: string
  projectType: string
  stage: string
  ownerName: string
  location?: string
  healthScore: number | null
  progress: number | null
  criticalPathCount: number | null
  lastActivityAt: string | null
  myRole: 'owner' | 'editor' | 'company_admin'
}

export interface WorkspaceInvitation {
  id: string
  projectId: string
  projectName: string
  inviterName: string
  invitedAt: string
  companyId?: string
  companyName?: string
  role?: 'editor'
  needsCompanySwitch?: boolean
  expiresAt?: string | null
}

export interface WorkspaceJoinRequest {
  id: string
  type?: 'company' | 'project'
  companyId?: string
  companyName?: string
  projectId: string
  projectName: string
  status: 'pending' | 'approved' | 'rejected' | 'cancelled'
  canReapply?: boolean
}

export interface JoinableProject {
  id: string
  name: string
  projectType: string
  stage: string
  ownerName: string
  location?: string
  joinRequestStatus?: 'idle' | 'pending' | 'rejected'
}

export interface WorkspaceError {
  code: string
  message: string
}

export interface WorkspaceDemoEntry {
  available: boolean
  label: string
  title?: string
  route?: '/demo'
  enabled?: boolean
}

export interface WorkspaceData {
  loading: boolean
  error: WorkspaceError | null
  hasCompany: boolean
  currentCompany: WorkspaceCompany | null
  switchableCompanies: WorkspaceCompany[]
  myProjects: WorkspaceProject[]
  recentProjects: WorkspaceProject[]
  companyProjects: WorkspaceProject[]
  joinableProjects: JoinableProject[]
  pendingInvitations: WorkspaceInvitation[]
  joinRequests: WorkspaceJoinRequest[]
  demoEntry: WorkspaceDemoEntry | null
  emptyStateReason: 'no_company' | 'no_project_membership' | 'pending_approval' | null
  refresh: () => Promise<void>
  createCompany: (name: string) => Promise<{ id?: string; name?: string; role?: 'company_admin' | 'regular' }>
  switchCompany: (companyId: string) => Promise<void>
  acceptInvitation: (invitationId: string) => Promise<{ projectId?: string }>
  declineInvitation: (invitationId: string) => Promise<void>
  requestJoinProject: (projectId: string, reason?: string) => Promise<void>
}

type CreatedCompanyResult = {
  id?: string
  name?: string
  role?: 'company_admin' | 'regular'
}

const EMPTY_DATA = {
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
  emptyStateReason: null as 'no_company' | 'no_project_membership' | 'pending_approval' | null,
}

export function useWorkspaceData(): WorkspaceData {
  const { syncCurrentCompanyContext } = useAuth()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<WorkspaceError | null>(null)
  const [data, setData] = useState<Omit<
    WorkspaceData,
    'loading' | 'error' | 'refresh' | 'createCompany' | 'switchCompany' | 'acceptInvitation' | 'declineInvitation' | 'requestJoinProject'
  >>(EMPTY_DATA)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  const fetchData = useCallback(async (options?: { fallbackCompany?: WorkspaceCompany | null }) => {
    setLoading(true)
    setError(null)
    try {
      const result = await apiGet<any>('/api/workspace')
      if (mountedRef.current && result) {
        const fallbackCompany = options?.fallbackCompany ?? null
        const currentCompany = result.currentCompany ?? fallbackCompany
        const hasCompany = Boolean(currentCompany || result.hasCompany)
        const switchableCompanies = result.switchableCompanies ?? []
        const normalizedSwitchableCompanies = fallbackCompany && !switchableCompanies.some((company: WorkspaceCompany) => company.id === fallbackCompany.id)
          ? [fallbackCompany, ...switchableCompanies.map((company: WorkspaceCompany) => ({ ...company, isCurrent: false, active: false }))]
          : switchableCompanies
        const emptyStateReason = hasCompany && result.emptyStateReason === 'no_company'
          ? 'no_project_membership'
          : (result.emptyStateReason ?? null)
        syncCurrentCompanyContext({
          companyId: currentCompany?.id ?? null,
          role: currentCompany?.role ?? null,
        })
        setData({
          hasCompany,
          currentCompany: currentCompany ?? null,
          switchableCompanies: normalizedSwitchableCompanies,
          myProjects: result.myProjects ?? [],
          recentProjects: result.recentProjects ?? [],
          companyProjects: result.companyProjects ?? [],
          joinableProjects: result.joinableProjects ?? [],
          pendingInvitations: result.pendingInvitations ?? [],
          joinRequests: result.joinRequests ?? [],
          demoEntry: result.demoEntry ?? null,
          emptyStateReason: emptyStateReason as 'no_company' | 'no_project_membership' | 'pending_approval' | null,
        })
      }
    } catch (err) {
      if (mountedRef.current) {
        setError({
          code: 'WORKSPACE_LOAD_FAILED',
          message: err instanceof Error ? err.message : 'Failed to load workspace',
        })
      }
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }, [syncCurrentCompanyContext])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const createCompany = useCallback(async (name: string) => {
    const result = await apiPost<CreatedCompanyResult>('/api/workspace/companies', {
      name,
      discoverability: 'searchable',
      join_policy: 'approval_required',
    })
    let fallbackCompany: WorkspaceCompany | null = null
    if (result.id) {
      fallbackCompany = {
        id: result.id,
        name: result.name ?? name,
        role: result.role ?? 'company_admin',
        isCurrent: true,
        active: true,
      }
      persistCurrentCompanyId(result.id)
      syncCurrentCompanyContext({
        companyId: result.id,
        role: result.role ?? 'company_admin',
      })
      if (mountedRef.current) {
        setData((current) => ({
          ...current,
          hasCompany: true,
          currentCompany: fallbackCompany,
          switchableCompanies: [
            fallbackCompany,
            ...current.switchableCompanies
              .filter((company) => company.id !== fallbackCompany?.id)
              .map((company) => ({ ...company, isCurrent: false, active: false })),
          ].filter(Boolean) as WorkspaceCompany[],
          myProjects: current.myProjects ?? [],
          recentProjects: current.recentProjects ?? [],
          companyProjects: current.companyProjects ?? [],
          emptyStateReason: current.emptyStateReason === 'no_company' ? 'no_project_membership' : current.emptyStateReason,
        }))
      }
    }
    await fetchData({ fallbackCompany })
    return result
  }, [fetchData, syncCurrentCompanyContext])

  const switchCompany = useCallback(async (companyId: string) => {
    const result = await apiPost<{ companyId?: string; role?: 'company_admin' | 'regular' }>('/api/workspace/companies/switch', { companyId })
    const nextCompanyId = result.companyId || companyId
    persistCurrentCompanyId(nextCompanyId)
    syncCurrentCompanyContext({
      companyId: nextCompanyId,
      role: result.role ?? null,
    })
    await fetchData()
  }, [fetchData, syncCurrentCompanyContext])

  const acceptInvitation = useCallback(async (invitationId: string) => {
    const result = await apiPost<{ accepted?: boolean; projectId?: string }>(`/api/workspace/invitations/${invitationId}/accept`)
    await fetchData()
    return { projectId: result.projectId }
  }, [fetchData])

  const declineInvitation = useCallback(async (invitationId: string) => {
    await apiPost(`/api/workspace/invitations/${invitationId}/decline`)
    await fetchData()
  }, [fetchData])

  const requestJoinProject = useCallback(async (projectId: string, reason?: string) => {
    await apiPost(`/api/workspace/projects/${projectId}/join-request`, { reason })
    await fetchData()
  }, [fetchData])

  return {
    ...data,
    loading,
    error,
    refresh: fetchData,
    createCompany,
    switchCompany,
    acceptInvitation,
    declineInvitation,
    requestJoinProject,
  }
}

export default useWorkspaceData
