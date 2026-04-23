import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getProjectInsights: vi.fn(),
  markWatch: vi.fn(),
  clearWatch: vi.fn(),
  confirmRecovery: vi.fn(),
}))

vi.mock('../middleware/auth.js', () => ({
  authenticate: vi.fn((req: any, _res: any, next: () => void) => {
    req.user = { id: 'user-1', globalRole: 'owner' }
    next()
  }),
  requireProjectMember: vi.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()),
  requireProjectEditor: vi.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()),
}))

vi.mock('../services/responsibilityInsightService.js', () => ({
  responsibilityInsightService: {
    getProjectInsights: mocks.getProjectInsights,
    markWatch: mocks.markWatch,
    clearWatch: mocks.clearWatch,
    confirmRecovery: mocks.confirmRecovery,
  },
}))

function buildApp(router: express.Router) {
  const app = express()
  app.use(express.json())
  app.use('/api/projects/:projectId/responsibility', router)
  return app
}

describe('responsibility routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.confirmRecovery.mockResolvedValue({
      id: 'watch-1',
      project_id: 'project-1',
      dimension: 'unit',
      subject_key: 'unit:unit-1',
      status: 'cleared',
    })
  })

  it('confirms recovery through the dedicated endpoint', async () => {
    const { default: router } = await import('../routes/responsibility.js')
    const response = await request(buildApp(router))
      .post('/api/projects/project-1/responsibility/watchlist/confirm-recovery')
      .send({
        dimension: 'unit',
        subject_key: 'unit:unit-1',
      })

    expect(response.status).toBe(200)
    expect(mocks.confirmRecovery).toHaveBeenCalledWith('project-1', {
      dimension: 'unit',
      subject_key: 'unit:unit-1',
    })
    expect(response.body).toMatchObject({
      success: true,
      data: {
        status: 'cleared',
      },
    })
  })
})
