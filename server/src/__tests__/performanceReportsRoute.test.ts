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

const {
  default: performanceReportsRouter,
  resetPerformanceReportsForTests,
} = await import('../routes/performance-reports.js')

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/performance-reports', performanceReportsRouter)
  return app
}

describe('performance reports route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetPerformanceReportsForTests()
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
        url: '/api/performance-reports',
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

    const summary = await supertest(buildApp()).get('/api/performance-reports/summary')

    expect(summary.status).toBe(200)
    expect(summary.headers['cache-control']).toBe('no-store')
    expect(summary.body.data).toMatchObject({
      window: {
        retainedReports: 1,
        thresholdExceeded: 1,
      },
      topSlowApis: [
        expect.objectContaining({
          key: 'GET /api/performance-reports',
          samples: 1,
          p95: 1450,
          errorCount: 0,
        }),
      ],
      releaseGate: {
        status: 'watch',
      },
    })
  })

  it('summarizes online evidence into top bottlenecks and a fail gate when api evidence is severe', async () => {
    const app = buildApp()

    await supertest(app)
      .post('/api/performance-reports')
      .send({
        source: 'api',
        name: 'api_request',
        value: 2600,
        unit: 'ms',
        url: '/api/projects/project-1/bootstrap?changeLogLimit=100',
        metadata: {
          method: 'GET',
          statusCode: 503,
          cacheStatus: 'network',
        },
      })

    await supertest(app)
      .post('/api/performance-reports')
      .send({
        source: 'route',
        name: 'route_settled',
        value: 420,
        unit: 'ms',
        route: '/projects/project-1/gantt',
      })

    const response = await supertest(app).get('/api/performance-reports/summary')

    expect(response.status).toBe(200)
    expect(response.body.data).toMatchObject({
      window: {
        retainedReports: 2,
        thresholdExceeded: 2,
      },
      topSlowApis: [
        expect.objectContaining({
          key: 'GET /api/projects/project-1/bootstrap',
          samples: 1,
          p95: 2600,
          errorCount: 1,
          cacheStatuses: ['network'],
        }),
      ],
      topSlowRoutes: [
        expect.objectContaining({
          key: 'route:/projects/project-1/gantt',
          samples: 1,
          p95: 420,
        }),
      ],
      releaseGate: {
        status: 'fail',
      },
    })
    expect(response.body.data.recommendations.join('\n')).toContain('优先治理慢 API')
  })

  it('returns an insufficient-data summary before online evidence arrives', async () => {
    const response = await supertest(buildApp()).get('/api/performance-reports/summary')

    expect(response.status).toBe(200)
    expect(response.body.data).toMatchObject({
      window: {
        retainedReports: 0,
        thresholdExceeded: 0,
      },
      releaseGate: {
        status: 'insufficient_data',
      },
    })
    expect(response.body.data.recommendations[0]).toContain('核心路径巡检')
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
