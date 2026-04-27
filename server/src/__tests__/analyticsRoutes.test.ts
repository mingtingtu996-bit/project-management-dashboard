import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getVisibleProjectIds: vi.fn(),
  getProjectTrendAnalytics: vi.fn(),
  getCompanyTrendAnalytics: vi.fn(),
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}))

vi.mock('../middleware/auth.js', () => ({
  authenticate: vi.fn((req: any, _res: any, next: () => void) => {
    req.user = { id: 'user-1', globalRole: 'company_admin' }
    next()
  }),
  requireProjectMember: vi.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()),
}))

vi.mock('../auth/access.js', () => ({
  getVisibleProjectIds: mocks.getVisibleProjectIds,
}))

vi.mock('../services/projectTrendAnalyticsService.js', () => ({
  getProjectTrendAnalytics: mocks.getProjectTrendAnalytics,
  normalizeTrendGranularity: vi.fn((value: string) => (['day', 'week', 'month'].includes(value) ? value : null)),
  normalizeTrendGroupBy: vi.fn((value: string) => (['none', 'building', 'specialty', 'phase', 'region'].includes(value) ? value : null)),
}))

vi.mock('../services/companyTrendAnalyticsService.js', () => ({
  getCompanyTrendAnalytics: mocks.getCompanyTrendAnalytics,
}))

vi.mock('../middleware/logger.js', () => ({
  logger: mocks.logger,
}))

function buildApp(router: express.Router) {
  const app = express()
  app.use(express.json())
  app.use('/api/analytics', router)
  return app
}

describe('analytics routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    mocks.getVisibleProjectIds.mockResolvedValue(['project-1', 'project-2'])
    mocks.getProjectTrendAnalytics.mockResolvedValue({
      projectId: 'project-1',
      metric: 'health_score',
      from: '2026-04-01',
      to: '2026-04-27',
      groupBy: 'none',
      granularity: 'day',
      points: [{ date: '2026-04-27', value: 82 }],
    })
    mocks.getCompanyTrendAnalytics.mockResolvedValue({
      metric: 'overall_progress',
      from: '2026-04-01',
      to: '2026-04-27',
      granularity: 'day',
      points: [{ date: '2026-04-27', value: 39, projectCount: 2 }],
    })
  })

  it('returns project trend data from the analytics service', async () => {
    const { default: router } = await import('../routes/analytics.js')
    const response = await request(buildApp(router))
      .get('/api/analytics/project-trend')
      .query({ projectId: 'project-1', metric: 'health_score', from: '2026-04-01', to: '2026-04-27' })

    expect(response.status).toBe(200)
    expect(response.body.success).toBe(true)
    expect(mocks.getProjectTrendAnalytics).toHaveBeenCalledWith('project-1', 'health_score', expect.objectContaining({
      from: '2026-04-01',
      to: '2026-04-27',
      groupBy: 'none',
      granularity: 'day',
    }))
  })

  it('returns company trend data and applies visible project filtering', async () => {
    const { default: router } = await import('../routes/analytics.js')
    const response = await request(buildApp(router))
      .get('/api/analytics/company-trend')
      .query({ metric: 'overall_progress', from: '2026-04-01', to: '2026-04-27' })

    expect(response.status).toBe(200)
    expect(response.body.success).toBe(true)
    expect(mocks.getVisibleProjectIds).toHaveBeenCalledWith('user-1', 'company_admin')
    expect(mocks.getCompanyTrendAnalytics).toHaveBeenCalledWith('overall_progress', expect.objectContaining({
      from: '2026-04-01',
      to: '2026-04-27',
      granularity: 'day',
      projectIds: ['project-1', 'project-2'],
    }))
  })

  it('rejects metrics that are not registered', async () => {
    const { default: router } = await import('../routes/analytics.js')
    const response = await request(buildApp(router))
      .get('/api/analytics/company-trend')
      .query({ metric: 'not_registered_metric' })

    expect(response.status).toBe(400)
    expect(mocks.getCompanyTrendAnalytics).not.toHaveBeenCalled()
  })
})
