import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getTask: vi.fn(),
  executeSQL: vi.fn(),
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
    getTask: mocks.getTask,
    getProject: vi.fn(),
    getProjects: vi.fn(async () => []),
    getTasks: vi.fn(async () => []),
    getRisks: vi.fn(async () => []),
    getMilestones: vi.fn(async () => []),
    getMembers: vi.fn(async () => []),
    getInvitations: vi.fn(async () => []),
  })),
}))

vi.mock('../services/dbService.js', () => ({
  executeSQL: mocks.executeSQL,
}))

vi.mock('../services/dataQualityService.js', () => ({
  dataQualityService: {},
}))

vi.mock('../services/projectBootstrapService.js', () => ({
  getProjectBootstrap: vi.fn(),
}))

function buildApp(router: express.Router) {
  const app = express()
  app.use(express.json())
  app.use('/api/projects', router)
  return app
}

describe('project milestone linked tasks route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getTask.mockResolvedValue({
      id: 'milestone-1',
      project_id: 'project-1',
      title: '主体结构封顶',
    })
  })

  it('combines parent tasks with canonical milestone-linked tasks', async () => {
    mocks.executeSQL.mockImplementation(async (sql: string) => {
      if (sql.includes('parent_id')) {
        return [
          {
            id: 'task-1',
            project_id: 'project-1',
            parent_id: 'milestone-1',
            title: '主体结构施工',
            status: 'in_progress',
            progress: 55,
            assignee: '王工',
            assignee_name: null,
            planned_end_date: null,
            end_date: '2026-08-10',
            updated_at: '2026-04-20T00:00:00.000Z',
          },
        ]
      }

      if (sql.includes('milestone_id')) {
        return []
      }

      return []
    })

    const { default: router } = await import('../routes/projects.js')
    const response = await request(buildApp(router))
      .get('/api/projects/project-1/milestones/milestone-1/linked-tasks')

    expect(response.status).toBe(200)
    expect(response.body.success).toBe(true)
    expect(response.body.data).toEqual([
      {
        id: 'task-1',
        title: '主体结构施工',
        status: 'in_progress',
        progress: 55,
        assignee_name: '王工',
        planned_end_date: '2026-08-10',
      },
    ])
    expect(mocks.executeSQL).toHaveBeenCalledWith(
      'SELECT * FROM tasks WHERE project_id = ? AND milestone_id = ?',
      ['project-1', 'milestone-1'],
    )
  })
})
