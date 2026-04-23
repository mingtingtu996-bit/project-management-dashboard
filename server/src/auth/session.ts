import { query } from '../database.js'
import type { AuthUserView, GlobalRole } from './types.js'

type AuthUserRow = {
  id: string
  username: string
  display_name: string
  email?: string | null
  role?: string | null
  global_role?: string | null
  password_hash?: string | null
  joined_at?: string | null
  last_active?: string | null
}

let hasGlobalRoleColumnCache: boolean | null = null
let hasUpdatedAtColumnCache: boolean | null = null

function isMissingGlobalRoleColumn(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? '')
  return message.includes('global_role') && message.includes('does not exist')
}

export function normalizeGlobalRole(value?: string | null): GlobalRole {
  return value === 'company_admin' ? 'company_admin' : 'regular'
}

export function mapLegacyRoleToGlobalRole(value?: string | null): GlobalRole {
  const normalized = String(value ?? '').trim()
  return normalized === 'owner' || normalized === 'admin' ? 'company_admin' : 'regular'
}

async function hasGlobalRoleColumn() {
  if (hasGlobalRoleColumnCache !== null) {
    return hasGlobalRoleColumnCache
  }

  const result = await query(
    `SELECT 1
       FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'users'
        AND column_name = 'global_role'
      LIMIT 1`,
  )

  hasGlobalRoleColumnCache = result.rows.length > 0
  return hasGlobalRoleColumnCache
}

export async function hasUsersUpdatedAtColumn() {
  if (hasUpdatedAtColumnCache !== null) {
    return hasUpdatedAtColumnCache
  }

  const result = await query(
    `SELECT 1
       FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'users'
        AND column_name = 'updated_at'
      LIMIT 1`,
  )

  hasUpdatedAtColumnCache = result.rows.length > 0
  return hasUpdatedAtColumnCache
}

async function queryAuthUser(whereSql: string, values: unknown[]) {
  const supportsGlobalRole = await hasGlobalRoleColumn()

  if (supportsGlobalRole) {
    try {
      const result = await query(
        `SELECT id, username, display_name, email, role, global_role, password_hash, joined_at, last_active
           FROM public.users
          WHERE ${whereSql}
          LIMIT 1`,
        values,
      )
      return (result.rows[0] ?? null) as AuthUserRow | null
    } catch (error) {
      if (!isMissingGlobalRoleColumn(error)) {
        throw error
      }
      hasGlobalRoleColumnCache = false
    }
  }

  const fallbackResult = await query(
    `SELECT id, username, display_name, email, role, password_hash, joined_at, last_active
       FROM public.users
      WHERE ${whereSql}
      LIMIT 1`,
    values,
  )
  return (fallbackResult.rows[0] ?? null) as AuthUserRow | null
}

export async function getAuthUserByUsername(username: string) {
  return queryAuthUser('username = $1', [username])
}

export async function getAuthUserById(userId: string) {
  return queryAuthUser('id = $1', [userId])
}

export async function countUsers() {
  const result = await query('SELECT COUNT(*)::int AS count FROM public.users')
  return Number(result.rows[0]?.count ?? 0)
}

export function toAuthUserView(user: AuthUserRow): AuthUserView {
  return {
    id: user.id,
    username: user.username,
    display_name: user.display_name,
    email: user.email ?? null,
    role: user.role ?? undefined,
    globalRole: user.global_role ? normalizeGlobalRole(user.global_role) : mapLegacyRoleToGlobalRole(user.role),
    joined_at: user.joined_at ?? null,
    last_active: user.last_active ?? null,
  }
}
