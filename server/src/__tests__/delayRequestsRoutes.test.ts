import express from 'express'
import supertest from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createDelayRequest: vi.fn(),
  approveDelayRequest: vi.fn(),
  rejectDelayRequest: vi.fn(),
  withdrawDelayRequest: vi.fn(),
  calculateDelayImpact: vi.fn(),
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}))

vi.mock('../middleware/auth.js', () => ({
  authenticate: vi.fn((req: any, _res: any, next: () => void) => {
    req.user = { id: 'user-1' }
    next()
  }),
}))

vi.mock('../middleware/logger.js', () => ({
  logger: mocks.logger,
  requestLogger: vi.fn((_req: unknown, _res: unknown, next: () => void) => next()),
}))

vi.mock('../services/delayRequests.js', () => ({
  approveDelayRequest: mocks.approveDelayRequest,
  calculateDelayImpact: mocks.calculateDelayImpact,
  createDelayRequest: mocks.createDelayRequest,
  getDelayRequest: vi.fn(),
  listDelayRequests: vi.fn(async () => []),
  rejectDelayRequest: mocks.rejectDelayRequest,
  withdrawDelayRequest: mocks.withdrawDelayRequest,
}))

const { default: delayRequestsRouter } = await import('../routes/delay-requests.js')

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/delay-requests', delayRequestsRouter)
  return app
}

describe('delay requests routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.calculateDelayImpact.mockResolvedValue({ impact_level: 'medium' })
    mocks.createDelayRequest.mockResolvedValue({
      id: 'delay-1',
      task_id: 'task-1',
      status: 'pending',
      project_id: 'project-1',
    })
    mocks.approveDelayRequest.mockResolvedValue({
      id: 'delay-1',
      task_id: 'task-1',
      status: 'approved',
      project_id: 'project-1',
    })
    mocks.rejectDelayRequest.mockResolvedValue({
      id: 'delay-1',
      task_id: 'task-1',
      status: 'rejected',
      project_id: 'project-1',
    })
    mocks.withdrawDelayRequest.mockResolvedValue({
      id: 'delay-1',
      task_id: 'task-1',
      status: 'withdrawn',
      project_id: 'project-1',
    })
  })

  it('delegates create to the service layer', async () => {
    const response = await supertest(buildApp())
      .post('/api/delay-requests')
      .send({
        project_id: 'project-1',
        task_id: 'task-1',
        baseline_version_id: 'baseline-1',
        original_date: '2026-04-18',
        delayed_date: '2026-04-21',
        delay_days: 3,
        reason: '材料晚到',
      })

    expect(response.status).toBe(201)
    expect(mocks.createDelayRequest).toHaveBeenCalledWith(expect.objectContaining({
      project_id: 'project-1',
      task_id: 'task-1',
      baseline_version_id: 'baseline-1',
      requested_by: 'user-1',
    }))
  })

  it('delegates approve to the service layer with the reviewer id', async () => {
    const response = await supertest(buildApp())
      .post('/api/delay-requests/delay-1/approve')
      .send({})

    expect(response.status).toBe(200)
    expect(mocks.approveDelayRequest).toHaveBeenCalledWith('delay-1', 'user-1')
  })

  it('delegates reject and withdraw to the service layer', async () => {
    const rejectResponse = await supertest(buildApp())
      .post('/api/delay-requests/delay-1/reject')
      .send({})
    const withdrawResponse = await supertest(buildApp())
      .post('/api/delay-requests/delay-1/withdraw')
      .send({})

    expect(rejectResponse.status).toBe(200)
    expect(withdrawResponse.status).toBe(200)
    expect(mocks.rejectDelayRequest).toHaveBeenCalledWith('delay-1', 'user-1')
    expect(mocks.withdrawDelayRequest).toHaveBeenCalledWith('delay-1', 'user-1')
  })
})
