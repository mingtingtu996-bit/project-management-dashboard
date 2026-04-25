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

export function normalizeGlobalRole(value?: string | null): GlobalRole {
  return value === 'company_admin' ? 'company_admin' : 'regular'
}

export function mapLegacyRoleToGlobalRole(value?: string | null): GlobalRole {
  const normalized = String(value ?? '').trim()
  return normalized === 'owner' || normalized === 'admin' ? 'company_admin' : 'regular'
}

async function queryAuthUser(whereSql: string, values: unknown[]) {
  const result = await query(
    `SELECT id, username, display_name, email, role, global_role, password_hash, joined_at, last_active
       FROM public.users
      WHERE ${whereSql}
      LIMIT 1`,
    values,
  )
  return (result.rows[0] ?? null) as AuthUserRow | null
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
