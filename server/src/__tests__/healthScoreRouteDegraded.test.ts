import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  runWithRequestBudget: vi.fn(),
  calculateProjectHealth: vi.fn(),
  loadProjectMonthlyHealthHistory: vi.fn(),
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}))

vi.mock('../middleware/auth.js', () => ({
  authenticate: vi.fn((req: any, _res: unknown, next: () => void) => {
    req.user = { id: 'user-1', globalRole: 'company_admin' }
    next()
  }),
  requireProjectEditor: vi.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()),
  requireProjectMember: vi.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()),
}))

vi.mock('../middleware/logger.js', () => ({
  logger: mocks.logger,
}))

vi.mock('../services/requestBudgetService.js', () => ({
  REQUEST_TIMEOUT_BUDGETS: {
    fastReadMs: 2000,
    boardReadMs: 3000,
    analysisReadMs: 5000,
    batchWriteMs: 5000,
  },
  runWithRequestBudget: mocks.runWithRequestBudget,
}))

vi.mock('../services/projectHealthService.js', () => ({
  calculateProjectHealth: mocks.calculateProjectHealth,
  updateProjectHealth: vi.fn(),
  updateAllProjectsHealth: vi.fn(),
}))

vi.mock('../services/projectDailySnapshotService.js', () => ({
  loadProjectMonthlyHealthHistory: mocks.loadProjectMonthlyHealthHistory,
  recordProjectDailySnapshot: vi.fn(),
  recordProjectDailySnapshots: vi.fn(),
}))

vi.mock('../auth/access.js', () => ({
  getVisibleProjectIds: vi.fn(async () => []),
}))

vi.mock('../auth/companyContext.js', () => ({
  getRequestCompanyId: vi.fn(() => 'company-1'),
}))

const { default: healthScoreRouter, clearHealthScoreReadCacheForTest } = await import('../routes/health-score.js')

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/health-score', healthScoreRouter)
  return app
}

describe('health-score route degradation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clearHealthScoreReadCacheForTest()
  })

  it('returns a consumable degraded payload instead of 504 when project health details exceed budget without cache', async () => {
    mocks.runWithRequestBudget.mockRejectedValueOnce(new Error('health-score.project-read exceeded 2000ms'))

    const response = await request(buildApp()).get('/api/health-score/project-1')

    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({
      success: true,
      data: {
        degraded: true,
        degradationReason: 'request_budget_exceeded',
        score: null,
        details: null,
        status: 'degraded',
      },
    })
    expect(mocks.logger.warn).toHaveBeenCalledWith(
      '[health-score] project health score degraded after budgeted read failed without cache',
      expect.objectContaining({ projectId: 'project-1' }),
    )
    expect(mocks.runWithRequestBudget).toHaveBeenCalledWith(
      {
        operation: 'health-score.project-read',
        timeoutMs: 5000,
      },
      expect.any(Function),
    )
  })

  it('loads monthly health history through the backend snapshot read model', async () => {
    mocks.loadProjectMonthlyHealthHistory.mockResolvedValueOnce([
      {
        period: '2026-07',
        health_score: 82,
        health_status: 'healthy',
        recorded_at: '2026-07-14T00:10:00.000Z',
      },
    ])

    const response = await request(buildApp()).get('/api/health-score/project-1/history?months=3')

    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({
      success: true,
      data: [{ period: '2026-07', health_score: 82 }],
    })
    expect(mocks.loadProjectMonthlyHealthHistory).toHaveBeenCalledWith('project-1', 3)
  })
})
