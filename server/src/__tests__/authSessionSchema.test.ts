import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
}))

vi.mock('../database.js', () => ({
  query: mocks.query,
}))

describe('auth session schema usage', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  it('reads auth users from the canonical users schema without runtime column probes', async () => {
    mocks.query.mockResolvedValueOnce({
      rows: [
        {
          id: 'user-1',
          username: 'admin',
          display_name: '系统管理员',
          email: 'admin@example.com',
          role: 'owner',
          global_role: 'company_admin',
          password_hash: 'hash',
          joined_at: '2026-04-01T00:00:00.000Z',
          last_active: '2026-04-24T00:00:00.000Z',
        },
      ],
    })

    const { getAuthUserByUsername, toAuthUserView } = await import('../auth/session.js')
    const user = await getAuthUserByUsername('admin')

    expect(user?.global_role).toBe('company_admin')
    expect(toAuthUserView(user as NonNullable<typeof user>).globalRole).toBe('company_admin')
    expect(mocks.query).toHaveBeenCalledOnce()
    expect(String(mocks.query.mock.calls[0]?.[0])).toContain('global_role')
    expect(String(mocks.query.mock.calls[0]?.[0])).not.toContain('information_schema.columns')
  })
})
