import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  executeSQL: vi.fn(async (_sql: string, _params: unknown[] = []): Promise<any[]> => []),
  executeSQLOne: vi.fn(async (_sql: string, _params: unknown[] = []): Promise<any> => null),
  databaseQuery: vi.fn(async (): Promise<{ rows: any[]; rowCount: number }> => ({ rows: [], rowCount: 0 })),
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}))

vi.mock('../middleware/auth.js', () => ({
  authenticate: vi.fn((req: any, _res: any, next: () => void) => {
    req.user = { id: 'owner-1' }
    next()
  }),
  requireProjectEditor: vi.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()),
  requireProjectMember: vi.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()),
}))

vi.mock('../middleware/validation.js', () => ({
  validate: vi.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()),
  conditionSchema: {},
  conditionUpdateSchema: {},
}))

vi.mock('../middleware/logger.js', () => ({ logger: mocks.logger }))

vi.mock('../services/changeLogs.js', () => ({
  writeLifecycleLog: vi.fn(),
  writeLog: vi.fn(),
  writeStatusTransitionLog: vi.fn(),
}))

vi.mock('../services/projectHealthService.js', () => ({
  enqueueProjectHealthUpdate: vi.fn(),
}))

vi.mock('../services/taskConstraintGovernanceService.js', () => ({
  evaluateTaskConstraint: vi.fn(),
}))

vi.mock('../services/dbService.js', () => ({
  executeDatabaseRpc: vi.fn(),
  executeSQL: mocks.executeSQL,
  executeSQLOne: mocks.executeSQLOne,
  supabase: { from: vi.fn() },
}))

vi.mock('../database.js', () => ({ query: mocks.databaseQuery }))

function buildApp(router: express.Router) {
  const app = express()
  app.use(express.json())
  app.use('/api/task-conditions', router)
  app.use((error: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(500).json({ success: false, error: { message: error?.message ?? 'unknown error' } })
  })
  return app
}

function normalizeSql(sql: string) {
  return sql.replace(/\s+/g, ' ').trim().toLowerCase()
}

describe('task-condition preceding relations', () => {
  const relations = new Map<string, string[]>()

  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    relations.clear()

    mocks.executeSQLOne.mockImplementation(async (sql: string, params: unknown[] = []) => {
      const normalized = normalizeSql(sql)
      if (normalized.includes('select project_id from task_conditions where id = ?')) {
        return { project_id: 'project-1' }
      }
      if (normalized === 'select id as task_id, title, name, status, progress from tasks where id = ?') {
        return {
          task_id: String(params[0]),
          title: `Task ${String(params[0])}`,
          name: `Task ${String(params[0])}`,
          status: 'pending',
          progress: 0,
        }
      }
      return null
    })

    mocks.executeSQL.mockImplementation(async (sql: string, params: unknown[] = []) => {
      const normalized = normalizeSql(sql)
      if (normalized.startsWith('select id, project_id from tasks where id in')) {
        return params.map((id) => ({ id, project_id: 'project-1' }))
      }
      if (normalized === 'delete from task_preceding_relations where condition_id = ?') {
        relations.delete(String(params[0]))
        return []
      }
      if (normalized.startsWith('insert into task_preceding_relations (id, condition_id, task_id)')) {
        const conditionId = String(params[1])
        relations.set(conditionId, [...(relations.get(conditionId) ?? []), String(params[2])])
        return []
      }
      if (normalized === 'delete from task_preceding_relations where condition_id = ? and task_id = ?') {
        const conditionId = String(params[0])
        relations.set(conditionId, (relations.get(conditionId) ?? []).filter((id) => id !== String(params[1])))
        return []
      }
      if (normalized === 'select task_id from task_preceding_relations where condition_id = ?') {
        return (relations.get(String(params[0])) ?? []).map((taskId) => ({ task_id: taskId }))
      }
      return []
    })
  })

  it('replaces and reads preceding tasks through task_preceding_relations', async () => {
    const { default: router } = await import('../routes/task-conditions.js')
    const app = buildApp(router)

    const updateResponse = await request(app)
      .post('/api/task-conditions/condition-1/preceding-tasks')
      .send({ preceding_task_ids: ['task-1', 'task-2'] })

    expect(updateResponse.status).toBe(200)
    expect(updateResponse.body.data).toEqual([
      expect.objectContaining({ task_id: 'task-1' }),
      expect.objectContaining({ task_id: 'task-2' }),
    ])

    const getResponse = await request(app).get('/api/task-conditions/condition-1/preceding-tasks')
    expect(getResponse.status).toBe(200)
    expect(getResponse.body.data).toHaveLength(2)
    expect(mocks.executeSQL).not.toHaveBeenCalledWith(
      expect.stringContaining('preceding_task_id'),
      expect.anything(),
    )
  })

  it('deletes one canonical relation without mutating a task row', async () => {
    relations.set('condition-1', ['task-1', 'task-2'])
    const { default: router } = await import('../routes/task-conditions.js')

    const response = await request(buildApp(router))
      .delete('/api/task-conditions/condition-1/preceding-tasks/task-1')

    expect(response.status).toBe(200)
    expect(relations.get('condition-1')).toEqual(['task-2'])
    expect(mocks.executeSQL).not.toHaveBeenCalledWith(
      expect.stringMatching(/update\s+(?:tasks|task_conditions)/i),
      expect.anything(),
    )
  })

  it('fails closed when the canonical relation table is unavailable', async () => {
    mocks.executeSQL.mockRejectedValueOnce(new Error('relation "public.task_preceding_relations" does not exist'))
    const { default: router } = await import('../routes/task-conditions.js')

    const response = await request(buildApp(router))
      .get('/api/task-conditions/condition-1/preceding-tasks')

    expect(response.status).toBe(500)
    expect(response.body.error.message).toContain('task_preceding_relations')
    expect(mocks.databaseQuery).not.toHaveBeenCalled()
  })
})
