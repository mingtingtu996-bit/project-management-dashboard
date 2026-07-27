import request from 'supertest'
import express from 'express'
import { afterEach, describe, expect, it, vi } from 'vitest'

const { queryMock } = vi.hoisted(() => ({
  queryMock: vi.fn(),
}))

const { loginUserMock } = vi.hoisted(() => ({
  loginUserMock: vi.fn(),
}))

vi.mock('../database.js', () => ({
  query: queryMock,
}))

vi.mock('../auth/session.js', () => ({
  getAuthUserByUsername: loginUserMock,
  isDatabaseConnectivityError: (error: { code?: string } | null | undefined) => {
    const code = String(error?.code ?? '')
    return code === '08006' || code === '521' || code === '42P01' || code === '57P01' || code === 'ECONNRESET'
  },
  toAuthUserView: vi.fn((user) => ({
    id: user.id,
    username: user.username,
    display_name: user.display_name,
    email: user.email ?? null,
    role: user.role ?? undefined,
    globalRole: user.global_role ?? 'regular',
    currentCompanyId: user.last_active_company_id ?? null,
    currentCompanyRole: null,
    tokenVersion: 0,
    joined_at: user.joined_at ?? null,
    last_active: user.last_active ?? null,
  })),
}))

vi.mock('../auth/access.js', () => ({
  getCurrentCompanyMembership: vi.fn(async () => null),
}))

vi.mock('../auth/jwt.js', () => ({
  generateToken: vi.fn(() => 'token'),
}))

import authRouter from '../routes/auth.js'

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/auth/login', authRouter)
  return app
}

describe('auth login route', () => {
  afterEach(() => {
    vi.clearAllMocks()
    delete process.env.JWT_SECRET
  })

  it('returns service unavailable when the user lookup is unreachable', async () => {
    process.env.JWT_SECRET = 'test-secret'
    loginUserMock.mockRejectedValueOnce(Object.assign(new Error('Connection terminated due to connection timeout'), { code: '08006' }))

    const app = buildApp()
    const response = await request(app)
      .post('/api/auth/login')
      .send({
        username: 'codex_login_down',
        password: 'AnyPass123!',
      })

    expect(response.status).toBe(503)
    expect(response.body?.error?.code).toBe('SERVICE_UNAVAILABLE')
  })

  it('returns invalid credentials when the user is missing', async () => {
    process.env.JWT_SECRET = 'test-secret'
    loginUserMock.mockResolvedValueOnce(null)

    const app = buildApp()
    const response = await request(app)
      .post('/api/auth/login')
      .send({
        username: 'missing_user',
        password: 'AnyPass123!',
      })

    expect(response.status).toBe(401)
    expect(response.body?.error?.code).toBe('INVALID_CREDENTIALS')
  })
})
