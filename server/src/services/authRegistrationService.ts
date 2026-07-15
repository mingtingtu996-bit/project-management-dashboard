import { getClient as getDatabaseClient } from '../database.js'

type RegistrationClient = {
  query: (sql: string, params?: unknown[]) => Promise<{ rows?: any[]; rowCount?: number | null }>
  release: () => void
}

export class AuthRegistrationError extends Error {
  constructor(
    public readonly code: 'USERNAME_ALREADY_EXISTS' | 'EMAIL_ALREADY_EXISTS',
    message: string,
  ) {
    super(message)
    this.name = 'AuthRegistrationError'
  }
}

function mapUniqueViolation(error: unknown) {
  const code = String((error as { code?: unknown } | null)?.code ?? '')
  if (code !== '23505') return null
  const detail = `${String((error as Error | null)?.message ?? '')} ${String((error as { detail?: unknown } | null)?.detail ?? '')}`.toLowerCase()
  return detail.includes('email')
    ? new AuthRegistrationError('EMAIL_ALREADY_EXISTS', '邮箱已被注册')
    : new AuthRegistrationError('USERNAME_ALREADY_EXISTS', '用户名已存在')
}

// workspace-isolation-system-boundary-approved: registration creates a new user and company before any tenant membership scope exists; the transaction establishes that initial boundary atomically.
export async function registerAuthUser(input: {
  username: string
  passwordHash: string
  displayName: string
  email: string | null
  getClient?: () => Promise<RegistrationClient>
}) {
  const client = await (input.getClient ?? (getDatabaseClient as unknown as () => Promise<RegistrationClient>))()
  let transactionStarted = false
  try {
    await client.query('BEGIN')
    transactionStarted = true
    await client.query("SELECT pg_advisory_xact_lock(hashtext('workbuddy_auth_registration'))")

    const existing = await client.query(
      `SELECT id, username, email
         FROM public.users
        WHERE username = $1
           OR ($2::text IS NOT NULL AND email = $2)
        LIMIT 1`,
      [input.username, input.email],
    )
    const existingUser = existing.rows?.[0]
    if (existingUser) {
      if (input.email && String(existingUser.email ?? '').toLowerCase() === input.email.toLowerCase()) {
        throw new AuthRegistrationError('EMAIL_ALREADY_EXISTS', '邮箱已被注册')
      }
      throw new AuthRegistrationError('USERNAME_ALREADY_EXISTS', '用户名已存在')
    }

    const firstUserResult = await client.query(
      'SELECT NOT EXISTS (SELECT 1 FROM public.users) AS is_first_user',
    )
    const globalRole = firstUserResult.rows?.[0]?.is_first_user === true
      ? 'company_admin'
      : 'regular'
    const inserted = await client.query(
      `INSERT INTO public.users
        (username, password_hash, display_name, email, global_role)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, username, display_name, email, global_role,
                 last_active_company_id, auth_token_version, password_reset_required,
                 joined_at, last_active`,
      [
        input.username,
        input.passwordHash,
        input.displayName,
        input.email,
        globalRole,
      ],
    )
    const user = inserted.rows?.[0]
    if (!user) throw new Error('Registration insert returned no user')

    await client.query('COMMIT')
    return user
  } catch (error) {
    if (transactionStarted) {
      await client.query('ROLLBACK').catch(() => undefined)
    }
    if (error instanceof AuthRegistrationError) throw error
    throw mapUniqueViolation(error) ?? error
  } finally {
    client.release()
  }
}
