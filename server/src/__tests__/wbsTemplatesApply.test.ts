import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const insertedTasks: any[][] = []
  const sqlCalls: Array<{ query: string; params: any[] }> = []

  return {
    insertedTasks,
    sqlCalls,
    executeSQL: vi.fn(async (query: string, params: any[] = []) => {
      sqlCalls.push({ query, params })

      if (query.includes('SELECT id FROM tasks WHERE project_id = ?')) {
        return [{ id: 'old-task-1' }]
      }

      if (query.includes('DELETE FROM tasks WHERE project_id = ?')) {
        return []
      }

      if (query.includes('INSERT INTO tasks')) {
        insertedTasks.push(params)
        return []
      }

      if (query.includes('UPDATE wbs_templates SET usage_count = ?')) {
        return []
      }

      return []
    }),
    executeSQLOne: vi.fn(async (query: string, params: any[] = []) => {
      if (query.includes('FROM wbs_templates WHERE id = ?')) {
        return {
          id: params[0],
          template_name: '商业综合体WBS模板',
          usage_count: 2,
          deleted_at: null,
          wbs_nodes: [
            {
              name: '一级任务',
              description: '根节点',
              children: [
                {
                  name: '二级任务',
                  description: '子节点',
                },
              ],
            },
          ],
        }
      }

      if (query.includes('FROM projects WHERE id = ?')) {
        return { id: params[0] }
      }

      return null
    }),
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    },
  }
})

vi.mock('../services/dbService.js', () => ({
  executeSQL: mocks.executeSQL,
  executeSQLOne: mocks.executeSQLOne,
  supabase: {
    from: () => ({
      select: () => ({ order: async () => ({ data: [], error: null }) }),
    }),
  },
  SupabaseService: class {},
  getProjects: vi.fn(),
  getProject: vi.fn(),
  createProject: vi.fn(),
  updateProject: vi.fn(),
  deleteProject: vi.fn(),
  getTasks: vi.fn(),
  getTask: vi.fn(),
  createTask: vi.fn(),
  updateTask: vi.fn(),
  deleteTask: vi.fn(),
  getRisks: vi.fn(),
  getRisk: vi.fn(),
  createRisk: vi.fn(),
  updateRisk: vi.fn(),
  deleteRisk: vi.fn(),
}))

vi.mock('../middleware/logger.js', () => ({
  logger: mocks.logger,
  requestLogger: (_req: unknown, _res: unknown, next: () => void) => next(),
}))

vi.mock('../middleware/auth.js', () => ({
  authenticate: vi.fn((req: any, _res: unknown, next: () => void) => {
    req.user = { id: 'owner-1' }
    next()
  }),
  optionalAuthenticate: vi.fn((req: any, _res: unknown, next: () => void) => {
    req.user = { id: 'owner-1' }
    next()
  }),
  requireProjectEditor: vi.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()),
  requireProjectMember: vi.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()),
  requireProjectOwner: vi.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()),
}))

vi.mock('../services/supabaseService.js', () => ({
  SupabaseService: class {
    getProjects = vi.fn(async () => [])
    getProject = vi.fn(async () => null)
    createProject = vi.fn(async () => null)
    updateProject = vi.fn(async () => null)
    deleteProject = vi.fn(async () => true)
    getTasks = vi.fn(async () => [])
    getTask = vi.fn(async () => null)
    createTask = vi.fn(async () => null)
    updateTask = vi.fn(async () => null)
    deleteTask = vi.fn(async () => true)
    getRisks = vi.fn(async () => [])
    getRisk = vi.fn(async () => null)
    createRisk = vi.fn(async () => null)
    updateRisk = vi.fn(async () => null)
    deleteRisk = vi.fn(async () => true)
  },
}))

vi.mock('uuid', () => {
  let index = 0
  const ids = ['task-root-1', 'task-child-1', 'task-extra-1']

  return {
    v4: () => ids[index++] ?? `task-${index}`,
  }
})

import { request } from './testSetup.js'

describe('wbs template apply route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.insertedTasks.length = 0
    mocks.sqlCalls.length = 0
  })

  it('applies template in overwrite mode with aligned task insert params', async () => {
    const response = await request.post('/api/wbs-templates/template-1/apply').send({
      projectId: 'project-1',
      overwrite: true,
    })

    expect(response.status).toBe(200)
    expect(response.body.success).toBe(true)
    expect(response.body.data.createdCount).toBe(2)
    expect(response.body.data.deletedCount).toBe(1)
    expect(mocks.insertedTasks).toHaveLength(2)

    const [rootInsert, childInsert] = mocks.insertedTasks

    expect(rootInsert).toHaveLength(16)
    expect(rootInsert[0]).toBe('task-root-1')
    expect(rootInsert[1]).toBe('project-1')
    expect(rootInsert[2]).toBeNull()
    expect(rootInsert[3]).toBe('一级任务')
    expect(rootInsert[5]).toBe('todo')
    expect(rootInsert[6]).toBe(0)
    expect(rootInsert[7]).toBe(0)
    expect(rootInsert[10]).toBe('1')
    expect(rootInsert[11]).toBe(1)
    expect(rootInsert[12]).toBe('template-1')
    expect(rootInsert[13]).toBeNull()
    expect(rootInsert[14]).toEqual(expect.any(String))
    expect(rootInsert[15]).toEqual(expect.any(String))

    expect(childInsert).toHaveLength(16)
    expect(childInsert[0]).toBe('task-child-1')
    expect(childInsert[1]).toBe('project-1')
    expect(childInsert[2]).toBe('task-root-1')
    expect(childInsert[3]).toBe('二级任务')
    expect(childInsert[5]).toBe('todo')
    expect(childInsert[6]).toBe(0)
    expect(childInsert[10]).toBe('1.1')
    expect(childInsert[11]).toBe(2)
    expect(childInsert[12]).toBe('template-1')
    expect(childInsert[13]).toBeNull()
    expect(childInsert[14]).toEqual(expect.any(String))
    expect(childInsert[15]).toEqual(expect.any(String))
  })
})
