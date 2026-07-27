import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

process.env.NODE_ENV = 'test'
process.env.AUTH_ALLOW_TEST_FALLBACK_USER = 'false'
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://127.0.0.1:54321'
process.env.SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'test-anon-key'
process.env.SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || 'test-service-key'
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret'

vi.mock('../middleware/auth.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../middleware/auth.js')>()
  return {
    ...actual,
    authenticate: vi.fn((req: any, res: any, next: () => void) => {
      if (req.get?.('Authorization') === 'Bearer test-token') {
        req.user = { id: 'user-1', globalRole: 'company_admin' }
        next()
        return
      }

      res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'test auth required' },
      })
    }),
  }
})

const { resetPerformanceReportsForTests } = await import('../routes/performance-reports.js')
const { default: app } = await import('../index.js')

describe('performance reports index mount auth boundary', () => {
  beforeEach(() => {
    resetPerformanceReportsForTests()
  })

  it('allows anonymous browser runtime telemetry through the real index route order', async () => {
    const response = await request(app)
      .post('/api/performance-reports')
      .send({
        source: 'route',
        name: 'dashboard_initial_settled',
        value: 512,
        unit: 'ms',
        route: '/projects/project-1/dashboard',
      })

    expect(response.status).toBe(202)
    expect(response.body).toMatchObject({
      success: true,
      data: { accepted: true },
    })
  })

  it('keeps performance report summaries behind authentication', async () => {
    const response = await request(app).get('/api/performance-reports/summary')

    expect(response.status).toBe(401)
    expect(response.body).toMatchObject({
      success: false,
      error: { code: 'UNAUTHORIZED' },
    })
  })
})
