import { query } from '../database.js'
import type { AuthUserView, GlobalRole } from './types.js'

type AuthUserRow = {
  id: string
  username: string
  display_name: string
  email?: string | null
  global_role?: string | null
  last_active_company_id?: string | null
  password_hash?: string | null
  joined_at?: string | null
  last_active?: string | null
  current_company_role?: string | null
  auth_token_version?: number | string | null
  password_reset_required?: boolean | null
}

export function normalizeGlobalRole(value?: string | null): GlobalRole {
  return value === 'company_admin' ? 'company_admin' : 'regular'
}

async function queryAuthUser(whereSql: string, values: unknown[]) {
  const sql = [
    'SELECT id, username, display_name, email, global_role, last_active_company_id,',
    'password_hash, joined_at, last_active, auth_token_version, password_reset_required',
    'FROM public.users',
    `WHERE ${whereSql}`,
    "AND COALESCE(status, 'active') = 'active'",
    'AND deleted_at IS NULL',
    'LIMIT 1',
  ].filter(Boolean).join(' ')
  try {
    const result = await query(sql, values)
    return (result.rows[0] ?? null) as AuthUserRow | null
  } catch (error) {
    if (String((error as { code?: unknown } | null)?.code ?? '') === '42703') {
      throw Object.assign(new Error('Canonical auth user schema is unavailable'), {
        code: 'AUTH_ACTIVE_USER_GUARD_UNAVAILABLE',
        statusCode: 500,
        cause: error,
      })
    }
    throw error
  }
}

export async function getAuthUserByUsername(username: string) {
  return queryAuthUser('username = $1', [username])
}

export async function getAuthUserById(userId: string) {
  return queryAuthUser('id = $1', [userId])
}

export async function countUsers() {
  try {
    const result = await query('SELECT COUNT(*)::int AS count FROM public.users')
    return Number(result.rows[0]?.count ?? 0)
  } catch (error) {
    const code = String((error as { code?: unknown } | null)?.code ?? '')
    const message = String((error as Error | null | undefined)?.message ?? '').toLowerCase()
    if (code === '57P01' || code === '08006' || code === 'ECONNRESET' || message.includes('connection') || message.includes('timeout')) {
      return null
    }
    throw error
  }
}

export function isDatabaseConnectivityError(error: unknown): boolean {
  const code = String((error as { code?: unknown } | null)?.code ?? '')
  const message = String((error as Error | null | undefined)?.message ?? '').toLowerCase()
  return code === 'AUTH_REGISTER_DB_TIMEOUT'
    || code === '57P01'
    || code === '08006'
    || code === 'ECONNRESET'
    || code === '521'
    || message.includes('error code 521')
    || message.includes('web server is down')
    || message.includes('cloudflare')
    || message.includes('connection terminated')
    || message.includes('connection timeout')
    || message.includes('timeout')
    || message.includes('timed out')
    || message.includes('could not connect')
}

export function toAuthUserView(user: AuthUserRow): AuthUserView {
  const globalRole = normalizeGlobalRole(user.global_role)
  const currentCompanyRole = user.current_company_role
    ? normalizeGlobalRole(user.current_company_role)
    : null

  return {
    id: user.id,
    username: user.username,
    display_name: user.display_name,
    email: user.email ?? null,
    globalRole,
    currentCompanyId: user.last_active_company_id ?? null,
    currentCompanyRole,
    tokenVersion: Number(user.auth_token_version ?? 0),
    passwordResetRequired: Boolean(user.password_reset_required),
    joined_at: user.joined_at ?? null,
    last_active: user.last_active ?? null,
  }
}
