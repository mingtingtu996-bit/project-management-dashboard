import { EventEmitter } from 'node:events'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  query: vi.fn(async (..._args: any[]) => ({ rows: [] })),
  extractTokenFromRequest: vi.fn(() => null),
  verifyToken: vi.fn(() => null),
}))

vi.mock('../database.js', () => ({
  query: mocks.query,
}))

vi.mock('../auth/jwt.js', () => ({
  extractTokenFromRequest: mocks.extractTokenFromRequest,
  verifyToken: mocks.verifyToken,
}))

function createRequest(overrides: Record<string, unknown> = {}) {
  return {
    method: 'POST',
    path: '/api/tasks',
    originalUrl: '/api/tasks',
    url: '/api/tasks',
    body: {
      password: 'secret',
      title: '测试任务',
    },
    ip: '127.0.0.1',
    socket: {
      remoteAddress: '127.0.0.1',
    },
    get: vi.fn(() => null),
    ...overrides,
  } as any
}

function createResponse() {
  const response = new EventEmitter() as any
  response.statusCode = 201
  response.get = vi.fn(() => null)
  response.end = vi.fn()
  return response
}

async function flushImmediate() {
  await new Promise((resolve) => setImmediate(resolve))
}

describe('auditLogger test-mode guards', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    process.env.NODE_ENV = 'test'
    delete process.env.ENABLE_AUDIT_LOGGER_IN_TESTS
  })

  it('skips table probing and audit writes in test mode by default', async () => {
    const { auditLogger } = await import('../middleware/auditLogger.js')
    const req = createRequest()
    const res = createResponse()
    const next = vi.fn()

    await auditLogger(req, res, next)
    res.emit('finish')
    await flushImmediate()

    expect(next).toHaveBeenCalledOnce()
    expect(mocks.query).not.toHaveBeenCalled()
  })

  it('allows audit logging in test mode when explicitly enabled', async () => {
    process.env.ENABLE_AUDIT_LOGGER_IN_TESTS = 'true'

    const { auditLogger } = await import('../middleware/auditLogger.js')
    const req = createRequest()
    const res = createResponse()
    const next = vi.fn()

    await auditLogger(req, res, next)
    res.emit('finish')
    await flushImmediate()

    expect(next).toHaveBeenCalledOnce()
    expect(mocks.query).toHaveBeenCalled()
    expect(mocks.query.mock.calls.some(([sql]) => String(sql).includes('CREATE TABLE IF NOT EXISTS public.operation_logs'))).toBe(false)
    expect(mocks.query.mock.calls.some(([sql]) => String(sql).includes('ALTER TABLE IF EXISTS public.operation_logs'))).toBe(false)
    expect(mocks.query.mock.calls.some(([sql]) => String(sql).includes('CREATE INDEX IF NOT EXISTS idx_operation_logs'))).toBe(false)
    expect(mocks.query.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO public.operation_logs'))).toBe(true)
  })

  it('captures the original api path even if req.path changes before finish', async () => {
    process.env.ENABLE_AUDIT_LOGGER_IN_TESTS = 'true'

    const { auditLogger } = await import('../middleware/auditLogger.js')
    const req = createRequest({
      path: '/',
      originalUrl: '/api/tasks/task-123?tab=detail',
      url: '/api/tasks/task-123?tab=detail',
      method: 'PUT',
      body: {
        title: '更新任务',
      },
    })
    const res = createResponse()
    const next = vi.fn()

    await auditLogger(req, res, next)
    req.path = '/task-123'
    res.emit('finish')
    await flushImmediate()

    const insertCall = mocks.query.mock.calls.find(([sql]) => String(sql).includes('INSERT INTO public.operation_logs'))
    expect(insertCall).toBeTruthy()
    expect(insertCall?.[1]?.[2]).toBe('编辑任务')
    expect(insertCall?.[1]?.[4]).toBe('/api/tasks/task-123')
  })

  it('logs delay approval actions with the full api path', async () => {
    process.env.ENABLE_AUDIT_LOGGER_IN_TESTS = 'true'

    const { auditLogger } = await import('../middleware/auditLogger.js')
    const req = createRequest({
      method: 'POST',
      path: '/approve',
      originalUrl: '/api/delay-requests/delay-123/approve',
      url: '/api/delay-requests/delay-123/approve',
      body: {},
    })
    const res = createResponse()
    const next = vi.fn()

    await auditLogger(req, res, next)
    res.emit('finish')
    await flushImmediate()

    const insertCall = mocks.query.mock.calls.find(([sql]) => String(sql).includes('INSERT INTO public.operation_logs'))
    expect(insertCall).toBeTruthy()
    expect(insertCall?.[1]?.[2]).toBe('审批延期申请')
    expect(insertCall?.[1]?.[4]).toBe('/api/delay-requests/delay-123/approve')
  })
})
