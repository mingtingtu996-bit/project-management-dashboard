import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  authenticate: vi.fn(),
  clientQuery: vi.fn(),
  getClient: vi.fn(),
  query: vi.fn(),
  release: vi.fn(),
  getAuthUserById: vi.fn(),
  getCurrentCompanyMembership: vi.fn(),
  generateTemporaryPassword: vi.fn(() => 'SecureTemp123!'),
  hashPassword: vi.fn(async () => 'hashed-password'),
  verifyPassword: vi.fn(async () => true),
  validatePasswordStrength: vi.fn(() => ({ valid: true, errors: [] })),
  validateUsername: vi.fn(() => ({ valid: true, errors: [] })),
  logLogout: vi.fn(async () => undefined),
}))

vi.mock('../database.js', () => ({
  getClient: mocks.getClient,
  query: mocks.query,
}))

vi.mock('../middleware/auth.js', () => ({
  authenticate: mocks.authenticate,
}))

vi.mock('../auth/jwt.js', () => ({
  extractTokenFromRequest: vi.fn(() => 'current-token'),
  generateToken: vi.fn(() => 'replacement-token'),
  verifyToken: vi.fn(() => ({
    userId: 'admin-1',
    username: 'admin',
    tokenVersion: 3,
  })),
}))

vi.mock('../auth/password.js', () => ({
  generateTemporaryPassword: mocks.generateTemporaryPassword,
  hashPassword: mocks.hashPassword,
  validatePasswordStrength: mocks.validatePasswordStrength,
  validateUsername: mocks.validateUsername,
  verifyPassword: mocks.verifyPassword,
}))

vi.mock('../auth/session.js', () => ({
  getAuthUserById: mocks.getAuthUserById,
  isDatabaseConnectivityError: () => false,
  toAuthUserView: (user: Record<string, unknown>) => ({
    id: user.id,
    username: user.username,
    display_name: user.display_name,
    email: user.email ?? null,
    role: user.role,
    globalRole: user.global_role ?? 'regular',
    currentCompanyId: user.last_active_company_id ?? null,
    currentCompanyRole: user.current_company_role ?? null,
    tokenVersion: Number(user.auth_token_version ?? 0),
    passwordResetRequired: Boolean(user.password_reset_required),
  }),
}))

vi.mock('../auth/access.js', () => ({
  getCurrentCompanyMembership: mocks.getCurrentCompanyMembership,
}))

vi.mock('../auth/companyContext.js', () => ({
  getRequestCompanyId: vi.fn(() => 'company-1'),
}))

vi.mock('../utils/operationLog.js', () => ({
  logLogout: mocks.logLogout,
}))

import authChangePasswordRouter from '../routes/auth-change-password.js'
import authLogoutRouter from '../routes/auth-logout.js'
import authResetPasswordRouter from '../routes/auth-reset-password.js'

function createApp(path: string, router: express.Router) {
  const app = express()
  app.use(express.json())
  app.use(path, router)
  return app
}

function sqlOf(call: unknown[] | undefined) {
  return String(call?.[0] ?? '').replace(/\s+/g, ' ').trim()
}

describe('credential changes revoke stale sessions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.authenticate.mockImplementation((req: any, _res: any, next: () => void) => {
      req.user = {
        id: 'admin-1',
        username: 'admin',
        currentCompanyId: 'company-1',
        tokenVersion: 3,
      }
      next()
    })
    mocks.getClient.mockResolvedValue({
      query: mocks.clientQuery,
      release: mocks.release,
    })
    mocks.clientQuery.mockImplementation(async (sql: string) => {
      if (/SELECT password_hash/i.test(sql)) {
        return { rows: [{ password_hash: 'old-hash' }], rowCount: 1 }
      }
      if (/UPDATE public\.users/i.test(sql)) {
        return {
          rows: [{
            id: 'admin-1',
            username: 'admin',
            display_name: 'Admin',
            email: 'admin@example.com',
            role: 'owner',
            global_role: 'company_admin',
            last_active_company_id: 'company-1',
            auth_token_version: 4,
            password_reset_required: false,
          }],
          rowCount: 1,
        }
      }
      return { rows: [], rowCount: 0 }
    })
    mocks.getAuthUserById.mockResolvedValue({
      id: 'admin-1',
      username: 'admin',
      display_name: 'Admin',
      global_role: 'company_admin',
      auth_token_version: 3,
    })
    mocks.getCurrentCompanyMembership.mockResolvedValue({
      companyId: 'company-1',
      role: 'company_admin',
    })
    mocks.query.mockImplementation(async (sql: string) => {
      if (/SELECT id, username FROM public\.users/i.test(sql)) {
        return { rows: [{ id: 'user-2', username: 'member' }], rowCount: 1 }
      }
      if (/FROM public\.company_members/i.test(sql)) {
        return { rows: [{ exists: 1 }], rowCount: 1 }
      }
      if (/UPDATE public\.users/i.test(sql)) {
        return { rows: [{ id: 'user-2', auth_token_version: 8 }], rowCount: 1 }
      }
      return { rows: [], rowCount: 0 }
    })
  })

  it('revokes the authenticated user token version before completing logout', async () => {
    const response = await request(createApp('/api/auth/logout', authLogoutRouter))
      .post('/api/auth/logout')

    expect(response.status).toBe(200)
    expect(mocks.authenticate).toHaveBeenCalledOnce()
    const revokeCall = mocks.query.mock.calls.find((call) => /UPDATE public\.users/i.test(sqlOf(call)))
    expect(sqlOf(revokeCall)).toMatch(/auth_token_version\s*=\s*COALESCE\(auth_token_version,\s*0\)\s*\+\s*1/i)
    expect(revokeCall?.[1]).toEqual(['admin-1'])
  })

  it('changes the password and token version in one transaction and returns a replacement token', async () => {
    const response = await request(createApp('/api/auth/change-password', authChangePasswordRouter))
      .post('/api/auth/change-password')
      .send({ oldPassword: 'OldPass123!', newPassword: 'NewPass123!' })

    expect(response.status).toBe(200)
    expect(mocks.authenticate).toHaveBeenCalledOnce()
    expect(mocks.clientQuery.mock.calls.map(sqlOf)).toEqual(expect.arrayContaining(['BEGIN', 'COMMIT']))
    const selectCall = mocks.clientQuery.mock.calls.find((call) => /SELECT password_hash/i.test(sqlOf(call)))
    expect(sqlOf(selectCall)).toMatch(/FOR UPDATE/i)
    const updateCall = mocks.clientQuery.mock.calls.find((call) => /UPDATE public\.users/i.test(sqlOf(call)))
    expect(sqlOf(updateCall)).toMatch(/auth_token_version\s*=\s*COALESCE\(auth_token_version,\s*0\)\s*\+\s*1/i)
    expect(sqlOf(updateCall)).toMatch(/password_reset_required\s*=\s*false/i)
    expect(response.body.data.token).toBe('replacement-token')
    const setCookie = response.headers['set-cookie']
    expect(Array.isArray(setCookie) ? setCookie.join(';') : String(setCookie ?? '')).toContain('auth_token=replacement-token')
    expect(mocks.release).toHaveBeenCalledOnce()
  })

  it('rejects a reset request when the central authentication guard rejects a stale admin token', async () => {
    mocks.authenticate.mockImplementationOnce((_req: any, res: any) => {
      res.status(401).json({
        success: false,
        error: { code: 'USER_SESSION_REVOKED' },
      })
    })

    const response = await request(createApp('/api/auth/reset-password', authResetPasswordRouter))
      .post('/api/auth/reset-password')
      .send({ username: 'member' })

    expect(response.status).toBe(401)
    expect(response.body.error.code).toBe('USER_SESSION_REVOKED')
    expect(mocks.query).not.toHaveBeenCalled()
  })

  it('resets a company member password while revoking sessions and requiring first-login rotation', async () => {
    const response = await request(createApp('/api/auth/reset-password', authResetPasswordRouter))
      .post('/api/auth/reset-password')
      .send({ username: 'member' })

    expect(response.status).toBe(200)
    expect(mocks.authenticate).toHaveBeenCalledOnce()
    expect(mocks.generateTemporaryPassword).toHaveBeenCalledOnce()
    const updateCall = mocks.query.mock.calls.find((call) => /UPDATE public\.users/i.test(sqlOf(call)))
    expect(sqlOf(updateCall)).toMatch(/auth_token_version\s*=\s*COALESCE\(auth_token_version,\s*0\)\s*\+\s*1/i)
    expect(sqlOf(updateCall)).toMatch(/password_reset_required\s*=\s*true/i)
    expect(response.body.data.temporaryPassword).toBe('SecureTemp123!')
  })
})
