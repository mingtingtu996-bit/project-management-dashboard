import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const supabaseBuilder: any = {
    select: vi.fn(() => supabaseBuilder),
    eq: vi.fn(() => supabaseBuilder),
    limit: vi.fn(() => Promise.resolve({ data: [], error: null })),
  }

  return {
    executeSQL: vi.fn(),
    executeSQLOne: vi.fn(),
    supabaseFrom: vi.fn(() => supabaseBuilder),
    supabaseBuilder,
    query: vi.fn(async () => ({ rows: [] })),
    getProjectPermissionLevel: vi.fn(async () => null),
    isCompanyAdminRole: vi.fn((role?: string | null) => String(role ?? '').trim() === 'company_admin'),
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    },
  }
})

vi.mock('../services/dbService.js', () => ({
  executeSQL: mocks.executeSQL,
  executeSQLOne: mocks.executeSQLOne,
  supabase: {
    from: mocks.supabaseFrom,
  },
}))

vi.mock('../middleware/logger.js', () => ({
  logger: mocks.logger,
  requestLogger: (_req: unknown, _res: unknown, next: () => void) => next(),
}))

vi.mock('../auth/access.js', () => ({
  getProjectPermissionLevel: mocks.getProjectPermissionLevel,
  isCompanyAdminRole: mocks.isCompanyAdminRole,
  isUuidLike: (value?: string | null) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      String(value ?? '').trim(),
    ),
}))

vi.mock('../database.js', () => ({
  query: mocks.query,
}))

function createResponse() {
  const response: any = {}
  response.status = vi.fn(() => response)
  response.json = vi.fn(() => response)
  return response
}

describe('auth permission fallback hardening', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    process.env.NODE_ENV = 'test'
    process.env.TEST_USER_ID = ''
    process.env.DEV_USER_ID = 'test-user-id'
    mocks.supabaseBuilder.select.mockClear()
    mocks.supabaseBuilder.eq.mockClear()
    mocks.supabaseBuilder.limit.mockClear()
    mocks.query.mockReset()
    mocks.query.mockResolvedValue({ rows: [] })
  })

  it('injects a valid UUID fallback user in test mode even when DEV_USER_ID is invalid', async () => {
    const { authenticate } = await import('../middleware/auth.js')
    const req: any = {
      get: vi.fn(() => undefined),
      headers: {},
    }
    const res = createResponse()
    const next = vi.fn()

    await authenticate(req, res, next)

    expect(next).toHaveBeenCalledOnce()
    expect(res.status).not.toHaveBeenCalled()
    expect(req.user).toMatchObject({
      email: 'test@example.com',
      globalRole: 'company_admin',
    })
    expect(req.user.id).toBe('00000000-0000-4000-8000-000000000001')
  })

  it('returns 4xx instead of 500 when permission middleware receives an invalid user id', async () => {
    const { requireProjectMember } = await import('../middleware/auth.js')
    const middleware = requireProjectMember((req) => req.params.id)
    const req: any = {
      user: {
        id: 'test-user-id',
      },
      params: {
        id: '2f72d68c-5173-4edf-a86b-b48396f8d5f3',
      },
    }
    const res = createResponse()
    const next = vi.fn()

    await middleware(req, res, next)

    expect(next).not.toHaveBeenCalled()
    // Project existence is checked first: mocked executeSQLOne returns undefined → 404
    // If project existed, invalid userId would yield 403. Either way no 500.
    const statusCode = (res.status as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]
    expect([403, 404]).toContain(statusCode)
  })

  it('allows company admins to read existing projects without project membership', async () => {
    const { requireProjectMember } = await import('../middleware/auth.js')
    mocks.query.mockResolvedValueOnce({ rows: [{ id: '2f72d68c-5173-4edf-a86b-b48396f8d5f3' }] })

    const middleware = requireProjectMember((req) => req.params.id)
    const req: any = {
      method: 'GET',
      user: {
        id: '00000000-0000-4000-8000-000000000001',
        globalRole: 'company_admin',
      },
      params: {
        id: '2f72d68c-5173-4edf-a86b-b48396f8d5f3',
      },
    }
    const res = createResponse()
    const next = vi.fn()

    await middleware(req, res, next)

    expect(next).toHaveBeenCalledOnce()
    expect(res.status).not.toHaveBeenCalled()
  })

  it('still blocks company admins from non-read project member routes without membership', async () => {
    const { requireProjectMember } = await import('../middleware/auth.js')
    mocks.query
      .mockResolvedValueOnce({ rows: [{ id: '2f72d68c-5173-4edf-a86b-b48396f8d5f3' }] })
      .mockResolvedValueOnce({ rows: [{ owner_id: '11111111-1111-4111-8111-111111111111' }] })
      .mockResolvedValueOnce({ rows: [] })

    const middleware = requireProjectMember((req) => req.params.id)
    const req: any = {
      method: 'POST',
      user: {
        id: '00000000-0000-4000-8000-000000000001',
        globalRole: 'company_admin',
      },
      params: {
        id: '2f72d68c-5173-4edf-a86b-b48396f8d5f3',
      },
    }
    const res = createResponse()
    const next = vi.fn()

    await middleware(req, res, next)

    expect(next).not.toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(403)
  })
})
