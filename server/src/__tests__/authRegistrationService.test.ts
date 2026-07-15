import { describe, expect, it, vi } from 'vitest'

import {
  registerAuthUser,
} from '../services/authRegistrationService.js'

function buildClient(rowsByQuery: unknown[][]) {
  const query = vi.fn(async (_sql: string, _params?: unknown[]) => ({ rows: rowsByQuery.shift() ?? [], rowCount: 1 }))
  return { query, release: vi.fn() }
}

describe('auth registration service', () => {
  it('serializes first-user assignment and creates the user in one transaction', async () => {
    const client = buildClient([
      [],
      [],
      [],
      [{ is_first_user: true }],
      [{
        id: 'user-1',
        username: 'alice',
        display_name: 'Alice',
        email: 'alice@example.test',
        role: 'member',
        global_role: 'company_admin',
        auth_token_version: 0,
        password_reset_required: false,
      }],
      [],
    ])

    const user = await registerAuthUser({
      username: 'alice',
      passwordHash: 'hashed',
      displayName: 'Alice',
      email: 'alice@example.test',
      getClient: vi.fn(async () => client as any),
    })

    expect(user.global_role).toBe('company_admin')
    expect(client.query.mock.calls.map(([sql]) => String(sql).trim().split(/\s+/).slice(0, 3).join(' ')))
      .toEqual(expect.arrayContaining(['BEGIN', "SELECT pg_advisory_xact_lock(hashtext('workbuddy_auth_registration'))", 'COMMIT']))
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO public.users'),
      expect.arrayContaining(['alice', 'hashed', 'Alice', 'alice@example.test']),
    )
    expect(client.release).toHaveBeenCalledOnce()
  })

  it('rolls back and reports duplicate username before inserting', async () => {
    const client = buildClient([
      [],
      [],
      [{ id: 'existing', username: 'alice', email: null }],
      [],
    ])

    await expect(registerAuthUser({
      username: 'alice',
      passwordHash: 'hashed',
      displayName: 'Alice',
      email: null,
      getClient: vi.fn(async () => client as any),
    })).rejects.toMatchObject({
      code: 'USERNAME_ALREADY_EXISTS',
    })

    expect(client.query).toHaveBeenCalledWith('ROLLBACK')
    expect(client.query.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO public.users'))).toBe(false)
    expect(client.release).toHaveBeenCalledOnce()
  })
})
