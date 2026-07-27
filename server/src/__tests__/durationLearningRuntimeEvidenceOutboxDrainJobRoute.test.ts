import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  globalRole: 'regular',
  membershipRole: 'company_admin',
  executeNow: vi.fn(),
  getStatus: vi.fn(),
}))

vi.mock('../middleware/auth.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../middleware/auth.js')>()
  return {
    ...actual,
    authenticate: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
      req.user = {
        id: '00000000-0000-4000-8000-000000000001',
        globalRole: state.globalRole,
        currentCompanyId: '00000000-0000-4000-8000-000000000101',
      }
      next()
    },
  }
})

vi.mock('../auth/access.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../auth/access.js')>()
  return {
    ...actual,
    getCurrentCompanyMembership: vi.fn(async () => ({
      companyId: '00000000-0000-4000-8000-000000000101',
      role: state.membershipRole,
      status: 'active',
    })),
    getVisibleProjectIds: vi.fn(async () => []),
  }
})

vi.mock('../jobs/durationLearningRuntimeEvidenceOutboxDrainJob.js', () => ({
  durationLearningRuntimeEvidenceOutboxDrainJob: {
    executeNow: state.executeNow,
    getStatus: state.getStatus,
  },
}))

const { default: jobsRouter } = await import('../routes/jobs.js')

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/jobs', jobsRouter)
  return app
}

describe('duration learning runtime evidence outbox drain operational surface', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.globalRole = 'regular'
    state.membershipRole = 'company_admin'
    state.getStatus.mockReturnValue({
      isRunning: false,
      isScheduled: true,
      lastRun: null,
      nextRun: '2026-07-21T05:15:00.000Z',
    })
    state.executeNow.mockResolvedValue({
      status: 'completed',
      attempts: 1,
      claimed: 1,
      completed: 1,
    })
  })

  it('lists the cross-tenant drain for company observability but excludes company-admin execution', async () => {
    const app = buildApp()

    const statusResponse = await request(app).get('/api/jobs/status')
    expect(statusResponse.status).toBe(200)
    expect(statusResponse.body.data.jobs).toContainEqual(expect.objectContaining({
      name: 'durationLearningRuntimeEvidenceOutboxDrainJob',
      schedule: '*/5 * * * *',
    }))

    const executeResponse = await request(app)
      .post('/api/jobs/durationLearningRuntimeEvidenceOutboxDrainJob/execute')
      .send({})
    expect(executeResponse.status).toBe(404)
    expect(executeResponse.body.error.code).toBe('JOB_NOT_FOUND')
    expect(state.executeNow).not.toHaveBeenCalled()
  })

  it('does not expose an HTTP operator recovery surface', async () => {
    const app = buildApp()

    const statusResponse = await request(app)
      .get('/api/jobs/operator/duration-learning-runtime-evidence-outbox-drain/status')
    const executeResponse = await request(app)
      .post('/api/jobs/operator/duration-learning-runtime-evidence-outbox-drain/execute')
      .send({})

    expect(statusResponse.status).toBe(404)
    expect(executeResponse.status).toBe(404)
    expect(state.executeNow).not.toHaveBeenCalled()
  })

  it('does not treat the legacy global company_admin field as an operator identity', async () => {
    state.globalRole = 'company_admin'
    const app = buildApp()

    const statusResponse = await request(app)
      .get('/api/jobs/operator/duration-learning-runtime-evidence-outbox-drain/status')
    expect(statusResponse.status).toBe(404)

    const executeResponse = await request(app)
      .post('/api/jobs/operator/duration-learning-runtime-evidence-outbox-drain/execute')
      .send({})
    expect(executeResponse.status).toBe(404)
    expect(state.executeNow).not.toHaveBeenCalled()
  })
})
