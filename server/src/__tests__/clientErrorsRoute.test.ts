import express from 'express'
import supertest from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const loggerMocks = vi.hoisted(() => ({
  error: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
}))

vi.mock('../middleware/logger.js', () => ({
  logger: loggerMocks,
  requestLogger: vi.fn((_req: unknown, _res: unknown, next: () => void) => next()),
}))

const { default: clientErrorsRouter } = await import('../routes/client-errors.js')

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/client-errors', clientErrorsRouter)
  return app
}

describe('client errors route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('accepts a valid client runtime error report', async () => {
    const response = await supertest(buildApp())
      .post('/api/client-errors')
      .send({
        source: 'error-boundary',
        message: 'render failed',
        stack: 'stack trace',
        metadata: { route: '/dashboard' },
      })

    expect(response.status).toBe(202)
    expect(response.body.success).toBe(true)
    expect(response.body.data).toEqual({ accepted: true })
    expect(loggerMocks.error).toHaveBeenCalledWith(
      'Client runtime error reported',
      expect.objectContaining({
        source: 'error-boundary',
        message: 'render failed',
      }),
    )
  })

  it('rejects an empty message payload', async () => {
    const response = await supertest(buildApp())
      .post('/api/client-errors')
      .send({
        source: 'error-boundary',
        message: '',
      })

    expect(response.status).toBe(400)
    expect(response.body.success).toBe(false)
    expect(response.body.error?.code).toBe('VALIDATION_ERROR')
    expect(loggerMocks.error).not.toHaveBeenCalled()
  })
})
