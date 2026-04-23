import { query } from '../database.js'
import type { GlobalRole, ProjectPermissionLevel } from './types.js'
import { normalizeGlobalRole } from './session.js'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isUuidLike(value?: string | null): boolean {
  return UUID_PATTERN.test(String(value ?? '').trim())
}

export function isCompanyAdminRole(role?: string | null): boolean {
  return normalizeGlobalRole(role) === 'company_admin'
}

export function normalizeProjectPermissionLevel(value?: string | null): ProjectPermissionLevel {
  switch (String(value ?? '').trim()) {
    case 'owner':
    case 'admin':
      return 'owner'
    case 'editor':
      return 'editor'
    default:
      return 'viewer'
  }
}

export async function getProjectPermissionLevel(userId: string, projectId: string): Promise<ProjectPermissionLevel | null> {
  if (!isUuidLike(userId) || !isUuidLike(projectId)) {
    return null
  }

  const ownerResult = await query(
    'SELECT owner_id FROM public.projects WHERE id = $1 LIMIT 1',
    [projectId],
  )

  if (ownerResult.rows[0]?.owner_id === userId) {
    return 'owner'
  }

  const memberResult = await query(
    `SELECT permission_level
       FROM public.project_members
      WHERE project_id = $1
        AND user_id = $2
        AND COALESCE(is_active, true) = true
      LIMIT 1`,
    [projectId, userId],
  )

  const permissionLevel = memberResult.rows[0]?.permission_level
  if (!permissionLevel) {
    return null
  }

  return normalizeProjectPermissionLevel(permissionLevel)
}

export async function getVisibleProjectIds(userId: string, globalRole?: GlobalRole | string | null): Promise<string[] | null> {
  if (isCompanyAdminRole(globalRole)) {
    return null
  }

  if (!isUuidLike(userId)) {
    return []
  }

  const result = await query(
    `SELECT DISTINCT id
       FROM (
         SELECT id
           FROM public.projects
          WHERE owner_id = $1
         UNION
         SELECT project_id AS id
           FROM public.project_members
          WHERE user_id = $1
            AND COALESCE(is_active, true) = true
       ) visible_projects`,
    [userId],
  )

  return result.rows.map((row) => String(row.id))
}

export async function canAccessProject(userId: string, projectId: string): Promise<boolean> {
  const permissionLevel = await getProjectPermissionLevel(userId, projectId)
  return permissionLevel !== null
}
