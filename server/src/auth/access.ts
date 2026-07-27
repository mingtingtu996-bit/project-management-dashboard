import { query } from '../database.js'
import type { GlobalRole, ProjectPermissionLevel } from './types.js'
import { normalizeGlobalRole } from './session.js'
import { isPermissionSystemDisabled } from './permissionBypass.js'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
type CompanyRole = 'company_admin' | 'regular'
type CompanyMembership = { companyId: string; role: CompanyRole }
type ProjectCompanyCacheEntry = {
  expiresAt: number
  value: Promise<string | null>
}
type VisibleProjectIdsCacheEntry = {
  expiresAt: number
  value: Promise<string[] | null>
}

const PROJECT_COMPANY_ID_CACHE_TTL_MS = Number(process.env.PROJECT_COMPANY_ID_CACHE_TTL_MS ?? 300_000)
const PROJECT_COMPANY_ID_CACHE_MAX = Number(process.env.PROJECT_COMPANY_ID_CACHE_MAX ?? 1_000)
const VISIBLE_PROJECT_IDS_CACHE_TTL_MS = Number(process.env.VISIBLE_PROJECT_IDS_CACHE_TTL_MS ?? 60_000)
const VISIBLE_PROJECT_IDS_CACHE_MAX = Number(process.env.VISIBLE_PROJECT_IDS_CACHE_MAX ?? 1_000)
const projectCompanyIdCache = new Map<string, ProjectCompanyCacheEntry>()
const visibleProjectIdsCache = new Map<string, VisibleProjectIdsCacheEntry>()

export function isUuidLike(value?: string | null): boolean {
  return UUID_PATTERN.test(String(value ?? '').trim())
}

function normalizeUuidCacheKey(value?: string | null) {
  return String(value ?? '').trim().toLowerCase()
}

function projectCompanyCacheTtlMs() {
  return Number.isFinite(PROJECT_COMPANY_ID_CACHE_TTL_MS) && PROJECT_COMPANY_ID_CACHE_TTL_MS > 0
    ? PROJECT_COMPANY_ID_CACHE_TTL_MS
    : 0
}

function visibleProjectIdsCacheTtlMs() {
  return Number.isFinite(VISIBLE_PROJECT_IDS_CACHE_TTL_MS) && VISIBLE_PROJECT_IDS_CACHE_TTL_MS > 0
    ? VISIBLE_PROJECT_IDS_CACHE_TTL_MS
    : 0
}

function trimProjectCompanyIdCache() {
  if (projectCompanyIdCache.size <= PROJECT_COMPANY_ID_CACHE_MAX) return
  const overflow = projectCompanyIdCache.size - PROJECT_COMPANY_ID_CACHE_MAX
  for (const key of Array.from(projectCompanyIdCache.keys()).slice(0, overflow)) {
    projectCompanyIdCache.delete(key)
  }
}

function trimVisibleProjectIdsCache() {
  if (visibleProjectIdsCache.size <= VISIBLE_PROJECT_IDS_CACHE_MAX) return
  const overflow = visibleProjectIdsCache.size - VISIBLE_PROJECT_IDS_CACHE_MAX
  for (const key of Array.from(visibleProjectIdsCache.keys()).slice(0, overflow)) {
    visibleProjectIdsCache.delete(key)
  }
}

export function clearProjectCompanyIdCache(projectId?: string | null) {
  const key = normalizeUuidCacheKey(projectId)
  if (key) {
    projectCompanyIdCache.delete(key)
    return
  }
  projectCompanyIdCache.clear()
}

export function clearVisibleProjectIdsCache(userId?: string | null) {
  const normalizedUserId = normalizeUuidCacheKey(userId)
  if (normalizedUserId) {
    for (const key of Array.from(visibleProjectIdsCache.keys())) {
      if (key.startsWith(`${normalizedUserId}:`)) {
        visibleProjectIdsCache.delete(key)
      }
    }
    return
  }
  visibleProjectIdsCache.clear()
}

export function isCompanyAdminRole(role?: string | null): boolean {
  return normalizeGlobalRole(role) === 'company_admin'
}

function normalizeCompanyRole(value?: string | null): CompanyRole {
  return value === 'company_admin' ? 'company_admin' : 'regular'
}

export function normalizeProjectPermissionLevel(value?: string | null): ProjectPermissionLevel | null {
  switch (String(value ?? '').trim()) {
    case 'owner':
    case 'admin':
      return 'owner'
    case 'editor':
      return 'editor'
    default:
      return null
  }
}

export async function getCurrentCompanyId(userId: string, requestedCompanyId?: string | null): Promise<string | null> {
  const membership = await getCurrentCompanyMembership(userId, requestedCompanyId)
  return membership?.companyId ?? null
}

export async function getCurrentCompanyMembership(
  userId: string,
  requestedCompanyId?: string | null,
): Promise<CompanyMembership | null> {
  if (!isUuidLike(userId)) {
    return null
  }

  const normalizedRequestedCompanyId = String(requestedCompanyId ?? '').trim()
  if (normalizedRequestedCompanyId) {
    if (!isUuidLike(normalizedRequestedCompanyId)) {
      return null
    }

    const requestedResult = await query(
      `SELECT company_id, role
         FROM public.company_members
        WHERE user_id = $1
          AND company_id = $2
          AND COALESCE(status, 'active') = 'active'
        LIMIT 1`,
      [userId, normalizedRequestedCompanyId],
    )

    const requested = requestedResult.rows[0]
    if (requested?.company_id) {
      return {
        companyId: String(requested.company_id),
        role: normalizeCompanyRole(requested.role),
      }
    }

    return null
  }

  const result = await query(
    `SELECT cm.company_id, cm.role
       FROM public.company_members cm
       LEFT JOIN public.users u ON u.id = $1
      WHERE cm.user_id = $1
        AND COALESCE(cm.status, 'active') = 'active'
      ORDER BY
        CASE WHEN cm.company_id = u.last_active_company_id THEN 0 ELSE 1 END,
        cm.created_at ASC
      LIMIT 1`,
    [userId],
  )

  const membership = result.rows[0]
  return membership?.company_id
    ? {
        companyId: String(membership.company_id),
        role: normalizeCompanyRole(membership.role),
      }
    : null
}

export async function ensureDefaultCompanyForUser(userId: string): Promise<string | null> {
  if (!isUuidLike(userId)) {
    return null
  }

  const existing = await getCurrentCompanyMembership(userId)
  if (existing?.companyId) {
    return existing.companyId
  }

  const userResult = await query(
      `SELECT id, username, display_name
         FROM public.users
        WHERE id = $1
        LIMIT 1`,
      [userId],
    )
    const user = userResult.rows[0]
    if (!user?.id) return null

    const companyResult = await query(
      `INSERT INTO public.companies (name, owner_id)
       VALUES ($1, $2)
       RETURNING id`,
      [`${String(user.display_name ?? user.username ?? 'My')}'s Company`, userId],
    )
    const companyId = String(companyResult.rows[0]?.id ?? '')
    if (!isUuidLike(companyId)) return null

    await query(
      `INSERT INTO public.company_members (company_id, user_id, role, status)
       VALUES ($1, $2, 'company_admin', 'active')
       ON CONFLICT (company_id, user_id)
       DO UPDATE SET role = 'company_admin', status = 'active', updated_at = NOW()`,
      [companyId, userId],
    )
    await query(
      `UPDATE public.users
          SET last_active_company_id = $1
        WHERE id = $2`,
      [companyId, userId],
    )

  return companyId
}

async function loadProjectCompanyId(projectId: string): Promise<string | null> {
  const result = await query(
    'SELECT company_id FROM public.projects WHERE id = $1 LIMIT 1',
    [projectId],
  )
  const companyId = String(result.rows[0]?.company_id ?? '').trim()
  return isUuidLike(companyId) ? companyId : null
}

export async function getProjectCompanyId(projectId: string): Promise<string | null> {
  if (isPermissionSystemDisabled()) {
    return null
  }

  const key = normalizeUuidCacheKey(projectId)
  if (!isUuidLike(key)) {
    return null
  }

  const ttlMs = projectCompanyCacheTtlMs()
  const now = Date.now()
  const cached = projectCompanyIdCache.get(key)
  if (cached && (ttlMs === 0 || cached.expiresAt > now)) {
    return cached.value
  }
  if (cached) projectCompanyIdCache.delete(key)

  const value = loadProjectCompanyId(key)
  projectCompanyIdCache.set(key, {
    expiresAt: ttlMs === 0 ? Number.POSITIVE_INFINITY : now + ttlMs,
    value,
  })
  value.catch(() => {
    const current = projectCompanyIdCache.get(key)
    if (current?.value === value) projectCompanyIdCache.delete(key)
  })
  trimProjectCompanyIdCache()
  return value
}

export async function isActiveCompanyMember(userId: string, companyId: string): Promise<boolean | null> {
  if (!isUuidLike(userId) || !isUuidLike(companyId)) {
    return false
  }

  const result = await query(
      `SELECT 1
         FROM public.company_members
        WHERE user_id = $1
          AND company_id = $2
          AND COALESCE(status, 'active') = 'active'
        LIMIT 1`,
      [userId, companyId],
    )
  return result.rows.length > 0
}

async function isCompanyAdminForProject(
  userId: string,
  projectId: string,
  requestedCompanyId?: string | null,
): Promise<boolean | null> {
  if (!isUuidLike(userId) || !isUuidLike(projectId)) {
    return false
  }

  const requestedFilter = isUuidLike(requestedCompanyId) ? 'AND p.company_id = $3' : ''
  const params = isUuidLike(requestedCompanyId)
    ? [userId, projectId, requestedCompanyId]
    : [userId, projectId]
  const result = await query(
      `SELECT 1
         FROM public.projects p
         JOIN public.company_members cm
           ON cm.company_id = p.company_id
          AND cm.user_id = $1
          AND cm.role = 'company_admin'
          AND COALESCE(cm.status, 'active') = 'active'
        WHERE p.id = $2
          ${requestedFilter}
        LIMIT 1`,
      params,
    )

  return result.rows.length > 0
}

async function isProjectInRequestedCompany(projectId: string, requestedCompanyId?: string | null): Promise<boolean | null> {
  if (!isUuidLike(requestedCompanyId)) {
    return true
  }

  const result = await query(
    'SELECT 1 FROM public.projects WHERE id = $1 AND company_id = $2 LIMIT 1',
    [projectId, requestedCompanyId],
  )
  return result.rows.length > 0
}

export async function getProjectPermissionLevel(
  userId: string,
  projectId: string,
  requestedCompanyId?: string | null,
): Promise<ProjectPermissionLevel | null> {
  if (isPermissionSystemDisabled()) {
    return 'owner'
  }

  if (!isUuidLike(userId) || !isUuidLike(projectId)) {
    return null
  }

  const projectCompanyId = await getProjectCompanyId(projectId)
  if (projectCompanyId) {
    const belongsToProjectCompany = await isActiveCompanyMember(userId, projectCompanyId)
    if (belongsToProjectCompany === false) {
      return null
    }
  }

  const hasCompanyAdminAccess = await isCompanyAdminForProject(userId, projectId, requestedCompanyId)
  if (hasCompanyAdminAccess === true) {
    return 'owner'
  }

  const projectMatchesRequestedCompany = await isProjectInRequestedCompany(projectId, requestedCompanyId)
  if (projectMatchesRequestedCompany === false) {
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

export async function getVisibleProjectIds(
  userId: string,
  globalRole?: GlobalRole | string | null,
  requestedCompanyId?: string | null,
): Promise<string[] | null> {
  if (isPermissionSystemDisabled()) {
    return null
  }

  if (!isUuidLike(userId)) {
    return []
  }

  const key = [
    normalizeUuidCacheKey(userId),
    normalizeGlobalRole(globalRole),
    normalizeUuidCacheKey(requestedCompanyId) || 'current',
  ].join(':')
  const ttlMs = visibleProjectIdsCacheTtlMs()
  const now = Date.now()
  const cached = visibleProjectIdsCache.get(key)
  if (cached && (ttlMs === 0 || cached.expiresAt > now)) {
    return cached.value
  }
  if (cached) visibleProjectIdsCache.delete(key)

  const value = loadVisibleProjectIds(userId, globalRole, requestedCompanyId)
  visibleProjectIdsCache.set(key, {
    expiresAt: ttlMs === 0 ? Number.POSITIVE_INFINITY : now + ttlMs,
    value,
  })
  value.catch(() => {
    const current = visibleProjectIdsCache.get(key)
    if (current?.value === value) visibleProjectIdsCache.delete(key)
  })
  trimVisibleProjectIdsCache()
  return value
}

async function loadVisibleProjectIds(
  userId: string,
  globalRole?: GlobalRole | string | null,
  requestedCompanyId?: string | null,
): Promise<string[] | null> {
  const currentCompanyMembership = await getCurrentCompanyMembership(userId, requestedCompanyId)
  const currentCompanyId = currentCompanyMembership?.companyId ?? null

  if (currentCompanyId) {
    if (currentCompanyMembership?.role === 'company_admin') {
      const adminResult = await query(
        `SELECT id
           FROM public.projects
          WHERE company_id = $1`,
        [currentCompanyId],
      )

      return adminResult.rows.map((row) => String(row.id))
    }

    const scopedResult = await query(
      `SELECT DISTINCT id
         FROM (
           SELECT id
             FROM public.projects
            WHERE owner_id = $1
              AND company_id = $2
           UNION
           SELECT pm.project_id AS id
             FROM public.project_members pm
             JOIN public.projects p ON p.id = pm.project_id
            WHERE pm.user_id = $1
              AND p.company_id = $2
              AND COALESCE(pm.is_active, true) = true
         ) visible_projects`,
      [userId, currentCompanyId],
    )

    return scopedResult.rows.map((row) => String(row.id))
  }

  return []
}

export async function canAccessProject(userId: string, projectId: string, requestedCompanyId?: string | null): Promise<boolean> {
  const permissionLevel = await getProjectPermissionLevel(userId, projectId, requestedCompanyId)
  return permissionLevel !== null
}
