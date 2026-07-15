import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
}))

vi.mock('../database.js', () => ({
  query: mocks.query,
}))

describe('auth session active user predicate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.query.mockResolvedValue({ rows: [], rowCount: 0 })
  })

  it('loads auth users through status and deleted_at filters so disabled users cannot ride old JWTs', async () => {
    const { getAuthUserById } = await import('../auth/session.js')

    await getAuthUserById('user-1')

    const sql = String(mocks.query.mock.calls[0]?.[0] ?? '')
    expect(sql).toContain("COALESCE(status, 'active') = 'active'")
    expect(sql).toContain('deleted_at IS NULL')
    expect(mocks.query.mock.calls[0]?.[1]).toEqual(['user-1'])
  })

  it('fails closed when active-user guard columns are missing instead of falling back to a bare user lookup', async () => {
    mocks.query.mockRejectedValueOnce(Object.assign(new Error('column "deleted_at" does not exist'), { code: '42703' }))
    const { getAuthUserById } = await import('../auth/session.js')

    await expect(getAuthUserById('user-1')).rejects.toMatchObject({
      code: 'AUTH_ACTIVE_USER_GUARD_UNAVAILABLE',
    })

    expect(mocks.query).toHaveBeenCalledTimes(1)
    const sql = String(mocks.query.mock.calls[0]?.[0] ?? '')
    expect(sql).toContain("COALESCE(status, 'active') = 'active'")
    expect(sql).toContain('deleted_at IS NULL')
  })

  it('keeps the production schema repair migration aligned with the active session guard', () => {
    const serverRoot = resolve(process.cwd().endsWith('server') ? process.cwd() : resolve(process.cwd(), 'server'))
    const sql = readFileSync(resolve(serverRoot, 'migrations/247_v14231_users_active_session_guard_columns.sql'), 'utf8')

    expect(sql).toContain("ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active'")
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ')
    expect(sql).toContain('users_status_check')
    expect(sql).toContain("WHERE status = 'active' AND deleted_at IS NULL")
    expect(sql).toContain("NOTIFY pgrst, 'reload schema'")
  })
})
