import type { PermissionLevel } from '@/lib/permissions'

export const PROJECT_ACCESS_OVERRIDE_EVENT = 'workbuddy:project-access-override'

export interface ProjectAccessOverrideDetail {
  projectId: string
  permissionLevel: PermissionLevel
  canManageTeam: boolean
  canEdit: boolean
}

declare global {
  interface WindowEventMap {
    [PROJECT_ACCESS_OVERRIDE_EVENT]: CustomEvent<ProjectAccessOverrideDetail>
  }
}

export function dispatchProjectAccessOverride(detail: ProjectAccessOverrideDetail): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(PROJECT_ACCESS_OVERRIDE_EVENT, { detail }))
}
