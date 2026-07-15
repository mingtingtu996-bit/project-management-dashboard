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
          global_role: 'company_admin',
          password_hash: 'hash',
          auth_token_version: 3,
          joined_at: '2026-04-01T00:00:00.000Z',
          last_active: '2026-04-24T00:00:00.000Z',
        },
      ],
    })

    const { getAuthUserByUsername, toAuthUserView } = await import('../auth/session.js')
    const user = await getAuthUserByUsername('admin')

    expect(user?.global_role).toBe('company_admin')
    expect(toAuthUserView(user as NonNullable<typeof user>).globalRole).toBe('company_admin')
    expect(toAuthUserView(user as NonNullable<typeof user>).tokenVersion).toBe(3)
    expect(mocks.query).toHaveBeenCalledOnce()
    expect(String(mocks.query.mock.calls[0]?.[0])).toContain('global_role')
    expect(String(mocks.query.mock.calls[0]?.[0])).toContain('auth_token_version')
    expect(String(mocks.query.mock.calls[0]?.[0])).toContain("COALESCE(status, 'active') = 'active'")
    expect(String(mocks.query.mock.calls[0]?.[0])).toContain('deleted_at IS NULL')
    expect(String(mocks.query.mock.calls[0]?.[0])).not.toContain('information_schema.columns')
  })

  it('fails closed when active-session guard columns are missing', async () => {
    mocks.query
      .mockRejectedValueOnce({
        code: '42703',
        message: 'column "deleted_at" does not exist',
      })

    const { getAuthUserByUsername } = await import('../auth/session.js')

    await expect(getAuthUserByUsername('admin')).rejects.toMatchObject({
      code: 'AUTH_ACTIVE_USER_GUARD_UNAVAILABLE',
      statusCode: 500,
    })
    expect(mocks.query).toHaveBeenCalledTimes(1)
    expect(String(mocks.query.mock.calls[0]?.[0])).toContain('deleted_at IS NULL')
  })
})
