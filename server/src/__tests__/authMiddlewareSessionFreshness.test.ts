import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  payload: {
    userId: '00000000-0000-4000-8000-000000000001',
    globalRole: 'company_admin' as const,
    tokenVersion: 1,
    iat: 100,
  },
  authUser: {
    id: '00000000-0000-4000-8000-000000000001',
    username: 'alice',
    display_name: 'Alice',
    global_role: 'regular',
    last_active_company_id: 'company-1',
    auth_token_version: 1,
    password_reset_required: false,
  },
  verifyToken: vi.fn(),
  getAuthUserById: vi.fn(),
  isCompanySessionRevoked: vi.fn(),
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}))

vi.mock('../auth/jwt.js', () => ({
  extractTokenFromRequest: vi.fn(() => 'fresh-token'),
  verifyToken: mocks.verifyToken,
}))

vi.mock('../auth/session.js', async () => {
  const actual = await vi.importActual<typeof import('../auth/session.js')>('../auth/session.js')
  return {
    ...actual,
    getAuthUserById: mocks.getAuthUserById,
  }
})

vi.mock('../middleware/logger.js', () => ({
  logger: mocks.logger,
}))

vi.mock('../auth/companySession.js', () => ({
  isCompanySessionRevoked: mocks.isCompanySessionRevoked,
}))

function createResponse() {
  const response: any = {}
  response.status = vi.fn(() => response)
  response.json = vi.fn(() => response)
  return response
}

describe('auth middleware session freshness', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    process.env.NODE_ENV = 'production'
    process.env.JWT_SECRET = 'test-secret'
    mocks.payload = {
      userId: '00000000-0000-4000-8000-000000000001',
      globalRole: 'company_admin',
      tokenVersion: 1,
      iat: 100,
    }
    mocks.authUser = {
      id: '00000000-0000-4000-8000-000000000001',
      username: 'alice',
      display_name: 'Alice',
      global_role: 'regular',
      last_active_company_id: 'company-1',
      auth_token_version: 1,
      password_reset_required: false,
    }
    mocks.verifyToken.mockImplementation(() => mocks.payload)
    mocks.getAuthUserById.mockResolvedValue(mocks.authUser)
    mocks.isCompanySessionRevoked.mockResolvedValue(false)
  })

  it('hydrates req.user from the current users row without the retired role alias', async () => {
    const { authenticate } = await import('../middleware/auth.js')
    const req: any = { get: vi.fn(() => 'Bearer fresh-token'), headers: {} }
    const res = createResponse()
    const next = vi.fn()

    await authenticate(req, res, next)

    expect(next).toHaveBeenCalledOnce()
    expect(res.status).not.toHaveBeenCalled()
    expect(mocks.getAuthUserById).toHaveBeenCalledWith('00000000-0000-4000-8000-000000000001')
    expect(req.user).toMatchObject({
      id: '00000000-0000-4000-8000-000000000001',
      globalRole: 'regular',
      currentCompanyId: 'company-1',
    })
  })

  it('rejects JWTs whose user row no longer exists', async () => {
    const { authenticate } = await import('../middleware/auth.js')
    mocks.getAuthUserById.mockResolvedValueOnce(null)
    const req: any = { get: vi.fn(() => 'Bearer fresh-token'), headers: {} }
    const res = createResponse()
    const next = vi.fn()

    await authenticate(req, res, next)

    expect(next).not.toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(401)
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      error: expect.objectContaining({ code: 'USER_SESSION_REVOKED' }),
    }))
  })

  it('rejects JWTs whose token version is older than the current users row', async () => {
    const { authenticate } = await import('../middleware/auth.js')
    mocks.authUser.auth_token_version = 2
    const req: any = { get: vi.fn(() => 'Bearer fresh-token'), headers: {} }
    const res = createResponse()
    const next = vi.fn()

    await authenticate(req, res, next)

    expect(next).not.toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(401)
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      error: expect.objectContaining({ code: 'USER_SESSION_REVOKED' }),
    }))
  })

  it('rejects only the revoked company scope without globally invalidating the token', async () => {
    const { authenticate } = await import('../middleware/auth.js')
    mocks.isCompanySessionRevoked.mockResolvedValueOnce(true)
    const req: any = {
      get: vi.fn(() => 'Bearer fresh-token'),
      headers: { 'x-company-id': '00000000-0000-4000-8000-00000000000a' },
      originalUrl: '/api/projects',
    }
    const res = createResponse()
    const next = vi.fn()

    await authenticate(req, res, next)

    expect(next).not.toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(403)
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      error: expect.objectContaining({ code: 'COMPANY_SESSION_REVOKED' }),
    }))
  })

  it('checks a company switch against the target company rather than the stale header company', async () => {
    const { authenticate } = await import('../middleware/auth.js')
    const targetCompanyId = '00000000-0000-4000-8000-00000000000b'
    const req: any = {
      get: vi.fn(() => 'Bearer fresh-token'),
      headers: { 'x-company-id': '00000000-0000-4000-8000-00000000000a' },
      originalUrl: '/api/workspace/companies/switch',
      body: { companyId: targetCompanyId },
    }
    const res = createResponse()
    const next = vi.fn()

    await authenticate(req, res, next)

    expect(next).toHaveBeenCalledOnce()
    expect(mocks.isCompanySessionRevoked).toHaveBeenCalledWith(expect.objectContaining({
      companyId: targetCompanyId,
    }))
  })

  it('rechecks the current user row for sequential requests so revocation is immediate', async () => {
    const { authenticate, clearAuthCurrentUserCacheForTest } = await import('../middleware/auth.js')
    clearAuthCurrentUserCacheForTest()
    const firstReq: any = { get: vi.fn(() => 'Bearer fresh-token'), headers: {} }
    const secondReq: any = { get: vi.fn(() => 'Bearer fresh-token'), headers: {} }
    const firstRes = createResponse()
    const secondRes = createResponse()
    const firstNext = vi.fn()
    const secondNext = vi.fn()

    await authenticate(firstReq, firstRes, firstNext)
    await authenticate(secondReq, secondRes, secondNext)

    expect(firstNext).toHaveBeenCalledOnce()
    expect(secondNext).toHaveBeenCalledOnce()
    expect(mocks.getAuthUserById).toHaveBeenCalledTimes(2)
  })

  it('does not reuse the current user cache when the JWT token version changes', async () => {
    const { authenticate, clearAuthCurrentUserCacheForTest } = await import('../middleware/auth.js')
    clearAuthCurrentUserCacheForTest()
    const firstReq: any = { get: vi.fn(() => 'Bearer fresh-token'), headers: {} }
    const secondReq: any = { get: vi.fn(() => 'Bearer fresh-token'), headers: {} }
    const firstRes = createResponse()
    const secondRes = createResponse()
    const firstNext = vi.fn()
    const secondNext = vi.fn()

    await authenticate(firstReq, firstRes, firstNext)
    mocks.payload = {
      ...mocks.payload,
      tokenVersion: 2,
    }
    mocks.authUser = {
      ...mocks.authUser,
      auth_token_version: 2,
    }
    await authenticate(secondReq, secondRes, secondNext)

    expect(firstNext).toHaveBeenCalledOnce()
    expect(secondNext).toHaveBeenCalledOnce()
    expect(mocks.getAuthUserById).toHaveBeenCalledTimes(2)
  })

  it('blocks normal protected requests until a temporary password is rotated', async () => {
    const { authenticate } = await import('../middleware/auth.js')
    mocks.authUser.password_reset_required = true
    const req: any = {
      get: vi.fn(() => 'Bearer fresh-token'),
      headers: {},
      originalUrl: '/api/projects',
      path: '/api/projects',
    }
    const res = createResponse()
    const next = vi.fn()

    await authenticate(req, res, next)

    expect(next).not.toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(403)
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      error: expect.objectContaining({ code: 'PASSWORD_CHANGE_REQUIRED' }),
    }))
  })

  it('allows the password change endpoint while temporary-password rotation is required', async () => {
    const { authenticate } = await import('../middleware/auth.js')
    mocks.authUser.password_reset_required = true
    const req: any = {
      get: vi.fn(() => 'Bearer fresh-token'),
      headers: {},
      originalUrl: '/api/auth/change-password',
      path: '/',
    }
    const res = createResponse()
    const next = vi.fn()

    await authenticate(req, res, next)

    expect(next).toHaveBeenCalledOnce()
    expect(res.status).not.toHaveBeenCalled()
  })
})
