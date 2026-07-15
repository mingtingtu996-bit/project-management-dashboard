import express from 'express'
import request from 'supertest'
import { afterEach, describe, expect, it, vi } from 'vitest'

const {
  queryMock,
  getClientMock,
  clientQueryMock,
  releaseMock,
  getAuthUserByIdMock,
  getCurrentCompanyMembershipMock,
  extractTokenFromRequestMock,
  verifyTokenMock,
  validatePasswordStrengthMock,
  verifyPasswordMock,
  validateUsernameMock,
  getRequestCompanyIdMock,
  toAuthUserViewMock,
  generateTokenMock,
} = vi.hoisted(() => ({
  queryMock: vi.fn(),
  getClientMock: vi.fn(),
  clientQueryMock: vi.fn(),
  releaseMock: vi.fn(),
  getAuthUserByIdMock: vi.fn(),
  getCurrentCompanyMembershipMock: vi.fn(),
  extractTokenFromRequestMock: vi.fn(),
  verifyTokenMock: vi.fn(),
  validatePasswordStrengthMock: vi.fn(() => ({ valid: true, errors: [] })),
  verifyPasswordMock: vi.fn(async () => true),
  validateUsernameMock: vi.fn(() => ({ valid: true, errors: [] })),
  getRequestCompanyIdMock: vi.fn(() => 'company-test-id'),
  toAuthUserViewMock: vi.fn((user) => ({
    id: user.id,
    username: user.username,
    display_name: user.display_name ?? 'Test User',
    email: user.email ?? null,
    role: user.role ?? undefined,
    globalRole: user.global_role ?? 'regular',
    currentCompanyId: user.last_active_company_id ?? null,
    currentCompanyRole: user.current_company_role ?? null,
    tokenVersion: Number(user.auth_token_version ?? 0),
    joined_at: user.joined_at ?? null,
    last_active: user.last_active ?? null,
  })),
  generateTokenMock: vi.fn(() => 'token'),
}))

vi.mock('../database.js', () => ({
  getClient: getClientMock,
  query: queryMock,
}))

vi.mock('../auth/session.js', () => ({
  getAuthUserById: getAuthUserByIdMock,
  isDatabaseConnectivityError: (error: { code?: string } | null | undefined) => {
    const code = String(error?.code ?? '')
    const message = String((error as Error | null | undefined)?.message ?? '').toLowerCase()
    return code === '42P01'
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
      || message.includes('could not connect')
  },
  toAuthUserView: toAuthUserViewMock,
}))

vi.mock('../auth/access.js', () => ({
  getCurrentCompanyMembership: getCurrentCompanyMembershipMock,
  isUuidLike: (value?: string | null) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(value ?? '').trim()),
}))

vi.mock('../auth/jwt.js', () => ({
  extractTokenFromRequest: extractTokenFromRequestMock,
  verifyToken: verifyTokenMock,
  generateToken: generateTokenMock,
}))

vi.mock('../auth/password.js', () => ({
  hashPassword: vi.fn(async () => 'hashed-password'),
  validatePasswordStrength: validatePasswordStrengthMock,
  validateUsername: validateUsernameMock,
  verifyPassword: verifyPasswordMock,
}))

vi.mock('../auth/companyContext.js', () => ({
  getRequestCompanyId: getRequestCompanyIdMock,
}))

import authChangePasswordRouter from '../routes/auth-change-password.js'
import authMeRouter from '../routes/auth-me.js'
import authProfileRouter from '../routes/auth-profile.js'
import authResetPasswordRouter from '../routes/auth-reset-password.js'

function createApp(mountPath: string, router: express.Router) {
  const app = express()
  app.use(express.json())
  app.use(mountPath, router)
  return app
}

function createConnectivityError() {
  return Object.assign(new Error('Connection terminated due to connection timeout'), { code: '08006' })
}

describe('auth routes service unavailable handling', () => {
  afterEach(() => {
    vi.clearAllMocks()
    getClientMock.mockReset()
    clientQueryMock.mockReset()
  })

  it('returns 503 for auth-me when user lookup is unreachable', async () => {
    extractTokenFromRequestMock.mockReturnValue('valid-test-token')
    verifyTokenMock.mockReturnValue({ userId: 'user-1' })
    getAuthUserByIdMock.mockRejectedValueOnce(createConnectivityError())

    const app = createApp('/api/auth/me', authMeRouter)
    const response = await request(app).get('/api/auth/me')

    expect(response.status).toBe(503)
    expect(response.body?.error?.code).toBe('SERVICE_UNAVAILABLE')
  })

  it('returns 503 for auth-change-password when the password query is unreachable', async () => {
    extractTokenFromRequestMock.mockReturnValue('valid-test-token')
    verifyTokenMock.mockReturnValue({ userId: 'user-1' })
    validatePasswordStrengthMock.mockReturnValue({ valid: true, errors: [] })
    getAuthUserByIdMock.mockResolvedValueOnce({
      id: 'user-1',
      username: 'auth-user',
      display_name: 'Auth User',
      global_role: 'regular',
      auth_token_version: 0,
    })
    getClientMock.mockResolvedValueOnce({
      query: clientQueryMock,
      release: releaseMock,
    })
    clientQueryMock
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockRejectedValueOnce(createConnectivityError())
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })

    const app = createApp('/api/auth/change-password', authChangePasswordRouter)
    const response = await request(app)
      .post('/api/auth/change-password')
      .send({
        oldPassword: 'OldPass123!',
        newPassword: 'NewPass123!Aa',
      })

    expect(response.status).toBe(503)
    expect(response.body?.error?.code).toBe('SERVICE_UNAVAILABLE')
  })

  it('returns 503 for auth-reset-password when company membership lookup is unreachable', async () => {
    extractTokenFromRequestMock.mockReturnValue('valid-test-token')
    verifyTokenMock.mockReturnValue({ userId: 'user-1' })
    getAuthUserByIdMock.mockResolvedValueOnce({
      id: 'user-1',
      username: 'admin-user',
      display_name: 'Admin User',
      global_role: 'company_admin',
      last_active_company_id: 'company-test-id',
    })
    getCurrentCompanyMembershipMock.mockRejectedValueOnce(createConnectivityError())

    const app = createApp('/api/auth/reset-password', authResetPasswordRouter)
    const response = await request(app)
      .post('/api/auth/reset-password')
      .send({
        username: 'target-user',
      })

    expect(response.status).toBe(503)
    expect(response.body?.error?.code).toBe('SERVICE_UNAVAILABLE')
  })

  it('returns 503 for auth-profile when company membership lookup is unreachable', async () => {
    extractTokenFromRequestMock.mockReturnValue('valid-test-token')
    verifyTokenMock.mockReturnValue({ userId: 'user-1' })
    queryMock.mockResolvedValueOnce({
      rows: [{
        id: 'user-1',
        username: 'profile-user',
        display_name: 'Profile User',
        email: 'profile@example.com',
        role: 'member',
        global_role: 'regular',
        last_active_company_id: 'company-test-id',
        joined_at: null,
        last_active: null,
      }],
    })
    getCurrentCompanyMembershipMock.mockRejectedValueOnce(createConnectivityError())

    const app = createApp('/api/auth/profile', authProfileRouter)
    const response = await request(app)
      .put('/api/auth/profile')
      .send({
        display_name: 'Profile User Updated',
      })

    expect(response.status).toBe(503)
    expect(response.body?.error?.code).toBe('SERVICE_UNAVAILABLE')
  })
})
