import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getProjectBootstrap: vi.fn(),
}))

vi.mock('../middleware/auth.js', () => ({
  authenticate: vi.fn((req: any, _res: any, next: () => void) => {
    req.user = { id: 'user-1', globalRole: 'owner' }
    next()
  }),
  requireProjectMember: vi.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()),
  requireProjectOwner: vi.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()),
}))

vi.mock('../auth/access.js', () => ({
  getVisibleProjectIds: vi.fn(async () => null),
}))

vi.mock('../services/projectBootstrapService.js', () => ({
  getProjectBootstrap: mocks.getProjectBootstrap,
}))

vi.mock('../services/supabaseService.js', () => ({
  SupabaseService: vi.fn().mockImplementation(() => ({
    getProjects: vi.fn(),
  })),
}))

function buildApp(router: express.Router) {
  const app = express()
  app.use(express.json())
  app.use('/api/projects', router)
  return app
}

describe('project bootstrap route', () => {
  const projectId = '11111111-1111-4111-8111-111111111111'

  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getProjectBootstrap.mockResolvedValue({
      project: { id: projectId, name: '项目 A', status: '进行中' },
      tasks: [{ id: 'task-1', project_id: projectId, title: '任务 A', progress: 10 }],
      risks: [{ id: 'risk-1', project_id: projectId, title: '风险 A' }],
      conditions: [],
      obstacles: [],
      warnings: [],
      issues: [],
      delayRequests: [],
      changeLogs: [],
      taskProgressSnapshots: [],
    })
  })

  it('returns the project initialization payload through one bootstrap request', async () => {
    const { default: router } = await import('../routes/projects.js')
    const response = await request(buildApp(router))
      .get(`/api/projects/${projectId}/bootstrap`)
      .query({ changeLogLimit: 25 })

    expect(response.status).toBe(200)
    expect(response.body.success).toBe(true)
    expect(response.body.data).toMatchObject({
      project: { id: projectId, name: '项目 A' },
      tasks: [{ id: 'task-1' }],
      risks: [{ id: 'risk-1' }],
    })
    expect(mocks.getProjectBootstrap).toHaveBeenCalledWith(projectId, 'user-1', {
      changeLogLimit: 25,
    })
  })

  it('returns 404 when the project does not exist', async () => {
    mocks.getProjectBootstrap.mockResolvedValueOnce(null)

    const { default: router } = await import('../routes/projects.js')
    const response = await request(buildApp(router)).get(`/api/projects/${projectId}/bootstrap`)

    expect(response.status).toBe(404)
    expect(response.body).toMatchObject({
      success: false,
      error: {
        code: 'PROJECT_NOT_FOUND',
      },
    })
  })
})
