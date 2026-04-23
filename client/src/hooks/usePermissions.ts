import { useEffect, useMemo, useState } from 'react'

import { useAuth } from '@/hooks/useAuth'
import { useCurrentProject } from '@/hooks/useStore'
import { getApiErrorMessage, getAuthHeaders } from '@/lib/apiClient'
import { PROJECT_ACCESS_OVERRIDE_EVENT } from '@/lib/projectAccessEvents'
import {
  hasAllPermissions,
  hasAnyPermission,
  hasPermission,
  PermissionAction,
  PermissionLevel,
  ROLE_PERMISSIONS,
} from '@/lib/permissions'
import { normalizeGlobalRole, normalizeProjectPermissionLevel, type GlobalRole } from '@/lib/roleLabels'

interface UsePermissionsOptions {
  projectId?: string
}

interface ProjectAccessSummary {
  permissionLevel: PermissionLevel
  globalRole: GlobalRole
  canManageTeam: boolean
  canEdit: boolean
}

const PROJECT_ACCESS_CACHE_TTL_MS = 15_000
const projectAccessCache = new Map<string, { value: ProjectAccessSummary; fetchedAt: number }>()
const projectAccessInflight = new Map<string, Promise<ProjectAccessSummary>>()

function buildProjectAccessCacheKey(projectId: string, userId: string) {
  return `${userId}:${projectId}`
}

function getCachedProjectAccess(cacheKey: string): ProjectAccessSummary | null {
  const cached = projectAccessCache.get(cacheKey)
  if (!cached) return null
  if (Date.now() - cached.fetchedAt > PROJECT_ACCESS_CACHE_TTL_MS) {
    projectAccessCache.delete(cacheKey)
    return null
  }
  return cached.value
}

async function fetchProjectAccessSummary(
  projectId: string,
  userId: string,
  globalRole: GlobalRole,
): Promise<ProjectAccessSummary> {
  const cacheKey = buildProjectAccessCacheKey(projectId, userId)
  const cached = getCachedProjectAccess(cacheKey)
  if (cached) return cached

  const inflight = projectAccessInflight.get(cacheKey)
  if (inflight) return inflight

  const request = fetch(`/api/members/${projectId}/me`, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
    },
  })
    .then(async (response) => {
      const payload = await response.json().catch(() => ({}))
      if (!response.ok || !payload.success) {
        throw new Error(payload.message || `Project access request failed (${response.status})`)
      }

      const data = payload.data || {}
      const summary: ProjectAccessSummary = {
        permissionLevel: normalizeProjectPermissionLevel(data.permissionLevel),
        globalRole: normalizeGlobalRole(data.globalRole || globalRole),
        canManageTeam: Boolean(data.canManageTeam),
        canEdit: Boolean(data.canEdit),
      }

      projectAccessCache.set(cacheKey, {
        value: summary,
        fetchedAt: Date.now(),
      })

      return summary
    })
    .finally(() => {
      projectAccessInflight.delete(cacheKey)
    })

  projectAccessInflight.set(cacheKey, request)
  return request
}

export function usePermissions(options: UsePermissionsOptions = {}) {
  const currentProject = useCurrentProject()
  const { isAuthenticated, user } = useAuth()
  const [accessSummary, setAccessSummary] = useState<ProjectAccessSummary>({
    permissionLevel: 'viewer',
    globalRole: normalizeGlobalRole(user?.globalRole),
    canManageTeam: false,
    canEdit: false,
  })
  const [loading, setLoading] = useState(false)

  const projectId = options.projectId ?? currentProject?.id ?? null

  useEffect(() => {
    let cancelled = false

    const ownerFallback = currentProject?.owner_id && user?.id && currentProject.owner_id === user.id

    if (!projectId || !isAuthenticated || !user?.id) {
      setAccessSummary({
        permissionLevel: ownerFallback ? 'owner' : 'viewer',
        globalRole: normalizeGlobalRole(user?.globalRole),
        canManageTeam: Boolean(ownerFallback),
        canEdit: Boolean(ownerFallback),
      })
      setLoading(false)
      return () => {
        cancelled = true
      }
    }

    if (ownerFallback) {
      setAccessSummary({
        permissionLevel: 'owner',
        globalRole: normalizeGlobalRole(user?.globalRole),
        canManageTeam: true,
        canEdit: true,
      })
      setLoading(false)
      return () => {
        cancelled = true
      }
    }

    setLoading(true)

    void fetchProjectAccessSummary(projectId, user.id, normalizeGlobalRole(user.globalRole))
      .then((summary) => {
        if (cancelled) return
        setAccessSummary(summary)
      })
      .catch((error) => {
        if (cancelled) return
        if (import.meta.env.DEV) {
          console.warn('[usePermissions] fallback to readonly access', getApiErrorMessage(error))
        }
        setAccessSummary({
          permissionLevel: 'viewer',
          globalRole: normalizeGlobalRole(user.globalRole),
          canManageTeam: false,
          canEdit: false,
        })
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [currentProject?.owner_id, isAuthenticated, projectId, user?.globalRole, user?.id])

  useEffect(() => {
    if (typeof window === 'undefined' || !projectId) return undefined

    const handleProjectAccessOverride = (
      event: Event,
    ) => {
      const detail = (event as CustomEvent<{
        projectId: string
        permissionLevel: PermissionLevel
        canManageTeam: boolean
        canEdit: boolean
      }>).detail
      if (!detail || detail.projectId !== projectId) return

      if (user?.id) {
        projectAccessCache.set(buildProjectAccessCacheKey(projectId, user.id), {
          value: {
            permissionLevel: normalizeProjectPermissionLevel(detail.permissionLevel),
            globalRole: normalizeGlobalRole(user.globalRole),
            canManageTeam: Boolean(detail.canManageTeam),
            canEdit: Boolean(detail.canEdit),
          },
          fetchedAt: Date.now(),
        })
      }

      setAccessSummary((current) => ({
        ...current,
        permissionLevel: normalizeProjectPermissionLevel(detail.permissionLevel),
        canManageTeam: Boolean(detail.canManageTeam),
        canEdit: Boolean(detail.canEdit),
      }))
      setLoading(false)
    }

    window.addEventListener(PROJECT_ACCESS_OVERRIDE_EVENT, handleProjectAccessOverride)
    return () => {
      window.removeEventListener(PROJECT_ACCESS_OVERRIDE_EVENT, handleProjectAccessOverride)
    }
  }, [projectId, user?.globalRole, user?.id])

  const isStaleFormerOwner = Boolean(
    currentProject?.owner_id
    && user?.id
    && currentProject.owner_id !== user.id
    && accessSummary.permissionLevel === 'owner',
  )

  const permissionLevel = isStaleFormerOwner ? 'editor' : accessSummary.permissionLevel
  const effectiveCanManageTeam = isStaleFormerOwner ? false : accessSummary.canManageTeam
  const effectiveCanEdit = isStaleFormerOwner ? true : accessSummary.canEdit

  const can = useMemo(() => {
    const check = (action: PermissionAction): boolean => {
      return hasPermission(permissionLevel, action)
    }

    return {
      check,
      anyOf: (actions: PermissionAction[]): boolean => {
        return hasAnyPermission(permissionLevel, actions)
      },
      allOf: (actions: PermissionAction[]): boolean => {
        return hasAllPermissions(permissionLevel, actions)
      },
      viewProject: () => hasPermission(permissionLevel, 'view:project'),
      editProject: () => hasPermission(permissionLevel, 'edit:project'),
      deleteProject: () => hasPermission(permissionLevel, 'delete:project'),
      viewTask: () => hasPermission(permissionLevel, 'view:task'),
      createTask: () => hasPermission(permissionLevel, 'create:task'),
      editTask: () => hasPermission(permissionLevel, 'edit:task'),
      deleteTask: () => hasPermission(permissionLevel, 'delete:task'),
      viewRisk: () => hasPermission(permissionLevel, 'view:risk'),
      createRisk: () => hasPermission(permissionLevel, 'create:risk'),
      editRisk: () => hasPermission(permissionLevel, 'edit:risk'),
      deleteRisk: () => hasPermission(permissionLevel, 'delete:risk'),
      viewMilestone: () => hasPermission(permissionLevel, 'view:milestone'),
      createMilestone: () => hasPermission(permissionLevel, 'create:milestone'),
      editMilestone: () => hasPermission(permissionLevel, 'edit:milestone'),
      deleteMilestone: () => hasPermission(permissionLevel, 'delete:milestone'),
      viewTeam: () => hasPermission(permissionLevel, 'view:team'),
      inviteMember: () => hasPermission(permissionLevel, 'invite:member'),
      removeMember: () => hasPermission(permissionLevel, 'remove:member'),
      viewReports: () => hasPermission(permissionLevel, 'view:reports'),
      exportData: () => hasPermission(permissionLevel, 'export:data'),
      viewAudit: () => hasPermission(permissionLevel, 'view:audit'),
      manageSettings: () => hasPermission(permissionLevel, 'manage:settings'),
      manageTeam: () => effectiveCanManageTeam,
    }
  }, [effectiveCanManageTeam, permissionLevel])

  return {
    permissionLevel,
    globalRole: accessSummary.globalRole,
    can,
    loading,
    isOwner: permissionLevel === 'owner',
    isEditor: permissionLevel === 'editor',
    isViewer: permissionLevel === 'viewer',
    canEdit: effectiveCanEdit,
    canManageTeam: effectiveCanManageTeam,
  }
}

export const AVAILABLE_PERMISSIONS = ROLE_PERMISSIONS
