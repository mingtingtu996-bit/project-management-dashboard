import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getProject: vi.fn(),
  getTasks: vi.fn(),
  getRisks: vi.fn(),
  getMilestones: vi.fn(),
  getMembers: vi.fn(),
  getInvitations: vi.fn(),
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

vi.mock('../services/supabaseService.js', () => ({
  SupabaseService: vi.fn().mockImplementation(() => ({
    getProject: mocks.getProject,
    getTasks: mocks.getTasks,
    getRisks: mocks.getRisks,
    getMilestones: mocks.getMilestones,
    getMembers: mocks.getMembers,
    getInvitations: mocks.getInvitations,
  })),
}))

function buildApp(router: express.Router) {
  const app = express()
  app.use(express.json())
  app.use('/api/projects', router)
  return app
}

describe('projects export route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getProject.mockResolvedValue({
      id: '11111111-1111-4111-8111-111111111111',
      name: '项目 A',
      status: '进行中',
      created_at: '2026-04-17T00:00:00.000Z',
      updated_at: '2026-04-17T00:00:00.000Z',
    })
    mocks.getTasks.mockResolvedValue([{ id: 'task-1', project_id: '11111111-1111-4111-8111-111111111111', title: '任务 A', version: 1 }])
    mocks.getRisks.mockResolvedValue([{ id: 'risk-1', project_id: '11111111-1111-4111-8111-111111111111', title: '风险 A', probability: 60, impact: 60, status: 'identified', version: 1 }])
    mocks.getMilestones.mockResolvedValue([{ id: 'ms-1', project_id: '11111111-1111-4111-8111-111111111111', name: '里程碑 A', target_date: '2026-04-30', status: 'pending', completion_rate: 0, created_at: '2026-04-17T00:00:00.000Z', updated_at: '2026-04-17T00:00:00.000Z', version: 1 }])
    mocks.getMembers.mockResolvedValue([{ id: 'member-1', project_id: '11111111-1111-4111-8111-111111111111', user_id: 'user-1', role: 'owner', joined_at: '2026-04-17T00:00:00.000Z' }])
    mocks.getInvitations.mockResolvedValue([{ id: 'invite-1', project_id: '11111111-1111-4111-8111-111111111111', code: 'ABC123', role: 'viewer', status: 'active', created_by: 'user-1', created_at: '2026-04-17T00:00:00.000Z' }])
  })

  it('returns aggregate project export data from backend APIs', async () => {
    const { default: router } = await import('../routes/projects.js')
    const response = await request(buildApp(router)).get('/api/projects/11111111-1111-4111-8111-111111111111/export')

    expect(response.status).toBe(200)
    expect(response.body.success).toBe(true)
    expect(response.body.data).toMatchObject({
      version: '2.0.0',
      projects: [{ id: '11111111-1111-4111-8111-111111111111', name: '项目 A' }],
      tasks: [{ id: 'task-1' }],
      risks: [{ id: 'risk-1' }],
      milestones: [{ id: 'ms-1' }],
      members: [{ id: 'member-1' }],
      invitations: [{ id: 'invite-1' }],
    })
  })

  it('returns 404 when the project does not exist', async () => {
    mocks.getProject.mockResolvedValue(null)

    const { default: router } = await import('../routes/projects.js')
    const response = await request(buildApp(router)).get('/api/projects/99999999-9999-4999-8999-999999999999/export')

    expect(response.status).toBe(404)
    expect(response.body).toMatchObject({
      success: false,
      error: {
        code: 'PROJECT_NOT_FOUND',
      },
    })
  })
})
