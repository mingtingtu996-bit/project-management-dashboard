import express from 'express'
import request from 'supertest'
import { afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  registerAuthUser: vi.fn(),
}))

vi.mock('../services/authRegistrationService.js', async () => {
  const actual = await vi.importActual<typeof import('../services/authRegistrationService.js')>(
    '../services/authRegistrationService.js',
  )
  return {
    ...actual,
    registerAuthUser: mocks.registerAuthUser,
  }
})

import authRegisterRouter from '../routes/auth-register.js'

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/auth/register', authRegisterRouter)
  return app
}

function registeredUser() {
  return {
    id: 'new-user-id',
    username: 'codex_register',
    display_name: 'Codex Register',
    email: 'codex_register@example.invalid',
    role: 'member',
    global_role: 'regular',
    last_active_company_id: null,
    auth_token_version: 0,
    password_reset_required: false,
  }
}

describe('auth register route', () => {
  afterEach(() => {
    vi.clearAllMocks()
    delete process.env.AUTH_REGISTER_DB_TIMEOUT_MS
    delete process.env.SUPABASE_SERVICE_KEY
  })

  it('registers without requiring a Supabase service-role key in the API process', async () => {
    mocks.registerAuthUser.mockResolvedValueOnce(registeredUser())

    const response = await request(buildApp())
      .post('/api/auth/register')
      .send({
        username: 'codex_register',
        password: 'CodexRegister!123Aa',
        display_name: 'Codex Register',
        email: 'codex_register@example.invalid',
      })

    expect(response.status).toBe(200)
    expect(response.body?.success).toBe(true)
    expect(mocks.registerAuthUser).toHaveBeenCalledWith(expect.objectContaining({
      username: 'codex_register',
      displayName: 'Codex Register',
      email: 'codex_register@example.invalid',
      passwordHash: expect.any(String),
    }))
  })

  it('returns a conflict response for an existing username', async () => {
    mocks.registerAuthUser.mockRejectedValueOnce(Object.assign(new Error('duplicate'), {
      code: 'USERNAME_ALREADY_EXISTS',
    }))

    const response = await request(buildApp())
      .post('/api/auth/register')
      .send({ username: 'codex_register', password: 'CodexRegister!123Aa' })

    expect(response.status).toBe(400)
    expect(response.body?.error?.code).toBe('USERNAME_ALREADY_EXISTS')
  })

  it('returns service unavailable for database connectivity failures', async () => {
    mocks.registerAuthUser.mockRejectedValueOnce(
      Object.assign(new Error('connection timeout'), { code: '08006' }),
    )

    const response = await request(buildApp())
      .post('/api/auth/register')
      .send({ username: 'codex_register', password: 'CodexRegister!123Aa' })

    expect(response.status).toBe(503)
    expect(response.body?.error?.code).toBe('SERVICE_UNAVAILABLE')
  })

  it('times out stalled registration transactions instead of hanging', async () => {
    process.env.AUTH_REGISTER_DB_TIMEOUT_MS = '20'
    mocks.registerAuthUser.mockReturnValueOnce(new Promise(() => {}))

    const response = await request(buildApp())
      .post('/api/auth/register')
      .send({ username: 'codex_register', password: 'CodexRegister!123Aa' })

    expect(response.status).toBe(503)
    expect(response.body?.error?.code).toBe('SERVICE_UNAVAILABLE')
  })
})
