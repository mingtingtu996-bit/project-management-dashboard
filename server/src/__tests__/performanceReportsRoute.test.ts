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

const { default: performanceReportsRouter } = await import('../routes/performance-reports.js')

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/performance-reports', performanceReportsRouter)
  return app
}

describe('performance reports route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('accepts client performance evidence and emits a threshold warning for slow api calls', async () => {
    const response = await supertest(buildApp())
      .post('/api/performance-reports')
      .send({
        source: 'api',
        name: 'api_request',
        value: 1450,
        unit: 'ms',
        route: '/projects/project-1/dashboard',
        metadata: {
          method: 'GET',
          statusCode: 200,
        },
      })

    expect(response.status).toBe(202)
    expect(response.body).toMatchObject({
      success: true,
      data: { accepted: true },
    })
    expect(loggerMocks.info).toHaveBeenCalledWith(
      'Client performance evidence reported',
      expect.objectContaining({
        source: 'api',
        name: 'api_request',
        value: 1450,
      }),
    )
    expect(loggerMocks.warn).toHaveBeenCalledWith(
      'Client performance threshold exceeded',
      expect.objectContaining({
        source: 'api',
        metadata: expect.objectContaining({
          method: 'GET',
          statusCode: 200,
        }),
      }),
    )
  })

  it('rejects malformed performance evidence before logging', async () => {
    const response = await supertest(buildApp())
      .post('/api/performance-reports')
      .send({
        source: 'unknown',
        name: '',
        value: 'slow',
      })

    expect(response.status).toBe(400)
    expect(response.body.success).toBe(false)
    expect(response.body.error?.code).toBe('VALIDATION_ERROR')
    expect(loggerMocks.info).not.toHaveBeenCalled()
    expect(loggerMocks.warn).not.toHaveBeenCalled()
  })
})

