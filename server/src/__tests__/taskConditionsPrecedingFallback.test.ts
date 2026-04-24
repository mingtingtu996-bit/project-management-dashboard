import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const taskDetail = {
    task_id: 'task-legacy-1',
    title: '砌体施工',
    name: '砌体施工',
    status: 'pending',
    progress: 0,
  }
  const taskFallbackEq = vi.fn(async () => ({ error: null }))
  const databaseQuery = vi.fn(async (_sql: string, _params: unknown[] = []): Promise<{ rows: any[]; rowCount: number }> => ({ rows: [], rowCount: 0 }))

  return {
    executeSQL: vi.fn(async (_sql: string, _params: unknown[] = []): Promise<any[]> => []),
    executeSQLOne: vi.fn(async (_sql: string, _params: unknown[] = []): Promise<any> => null),
    databaseQuery,
    taskFallbackEq,
    supabase: {
      from: vi.fn(() => ({
        update: vi.fn(() => ({
          eq: taskFallbackEq,
        })),
      })),
    },
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    },
    taskDetail,
  }
})

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

vi.mock('../middleware/logger.js', () => ({
  logger: mocks.logger,
}))

vi.mock('../services/changeLogs.js', () => ({
  writeLifecycleLog: vi.fn(),
  writeLog: vi.fn(),
  writeStatusTransitionLog: vi.fn(),
}))

vi.mock('../services/projectHealthService.js', () => ({
  enqueueProjectHealthUpdate: vi.fn(),
}))

vi.mock('../services/dbService.js', () => ({
  executeSQL: mocks.executeSQL,
  executeSQLOne: mocks.executeSQLOne,
  supabase: mocks.supabase,
}))

vi.mock('../database.js', () => ({
  query: mocks.databaseQuery,
}))

function buildApp(router: express.Router) {
  const app = express()
  app.use(express.json())
  app.use('/api/task-conditions', router)
  app.use((error: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(500).json({ success: false, error: { message: error?.message ?? 'unknown error' } })
  })
  return app
}

describe('task-conditions preceding task fallback', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()

    mocks.executeSQLOne.mockImplementation(async (sql: string, params: unknown[] = []) => {
      const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase()

      if (normalized === 'select project_id from task_conditions where id = ?') {
        return { project_id: 'project-1' }
      }

      if (normalized === 'select task_id from task_preceding_relations limit 1') {
        throw new Error("relation 'public.task_preceding_relations' does not exist")
      }

      if (normalized === 'select preceding_task_id from task_conditions where id = ?') {
        return { preceding_task_id: 'task-legacy-1' }
      }

      if (normalized === 'select id as task_id, title, name, status, progress from tasks where id = ?') {
        return params[0] === 'task-legacy-1' ? { ...mocks.taskDetail } : null
      }

      return null
    })

    mocks.executeSQL.mockImplementation(async (sql: string) => {
      const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase()
      if (normalized.startsWith('update task_conditions set preceding_task_id = ?, updated_at = ? where id = ?')) {
        return []
      }
      if (normalized === 'select task_id from task_preceding_relations where condition_id = ?') {
        throw new Error("relation 'public.task_preceding_relations' does not exist")
      }
      return []
    })
    mocks.taskFallbackEq.mockResolvedValue({ error: null })
    mocks.databaseQuery.mockImplementation(async (sql: string) => {
      const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase()
      if (normalized.includes('public.task_preceding_relations')) {
        if (normalized.startsWith('create table if not exists public.task_preceding_relations')) {
          throw new Error('permission denied for schema public')
        }
        throw new Error("relation 'public.task_preceding_relations' does not exist")
      }
      return { rows: [], rowCount: 0 }
    })
  })

  it('falls back to legacy preceding_task_id when relation table is missing on POST', async () => {
    const { default: router } = await import('../routes/task-conditions.js')

    const response = await request(buildApp(router))
      .post('/api/task-conditions/condition-1/preceding-tasks')
      .send({ preceding_task_ids: ['task-legacy-1'] })

    expect(response.status).toBe(200)
    expect(response.body.success).toBe(true)
    expect(response.body.data).toEqual([expect.objectContaining({ task_id: 'task-legacy-1' })])
    expect(mocks.executeSQL).toHaveBeenCalledWith(
      'UPDATE task_conditions SET preceding_task_id = ?, updated_at = ? WHERE id = ?',
      ['task-legacy-1', expect.any(String), 'condition-1'],
    )
  })

  it('returns legacy preceding task rows instead of 500 on GET when relation table is missing', async () => {
    const { default: router } = await import('../routes/task-conditions.js')

    const response = await request(buildApp(router))
      .get('/api/task-conditions/condition-1/preceding-tasks')

    expect(response.status).toBe(200)
    expect(response.body.success).toBe(true)
    expect(response.body.data).toEqual([expect.objectContaining({ task_id: 'task-legacy-1' })])
  })

  it('falls back to tasks.preceding_task_id when condition legacy field is also missing', async () => {
    mocks.executeSQLOne.mockImplementation(async (sql: string, params: unknown[] = []) => {
      const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase()

      if (normalized === 'select project_id from task_conditions where id = ?') {
        return { project_id: 'project-1' }
      }

      if (normalized === 'select task_id from task_preceding_relations limit 1') {
        throw new Error("relation 'public.task_preceding_relations' does not exist")
      }

      if (normalized === 'select preceding_task_id from task_conditions where id = ?') {
        throw new Error("column 'preceding_task_id' does not exist")
      }

      if (normalized === 'select task_id from task_conditions where id = ?') {
        return { task_id: 'dependent-task-1' }
      }

      if (normalized === 'select id as task_id, title, name, status, progress from tasks where id = ?') {
        return params[0] === 'task-legacy-1' ? { ...mocks.taskDetail } : null
      }

      return null
    })

    mocks.executeSQL.mockImplementation(async (sql: string) => {
      const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase()
      if (normalized.startsWith('update task_conditions set preceding_task_id = ?, updated_at = ? where id = ?')) {
        throw new Error("column 'preceding_task_id' does not exist")
      }
      if (normalized === 'select task_id from task_preceding_relations where condition_id = ?') {
        throw new Error("relation 'public.task_preceding_relations' does not exist")
      }
      return []
    })
    mocks.taskFallbackEq.mockResolvedValue({ error: null })

    const { default: router } = await import('../routes/task-conditions.js')

    const postResponse = await request(buildApp(router))
      .post('/api/task-conditions/condition-1/preceding-tasks')
      .send({ preceding_task_ids: ['task-legacy-1'] })

    expect(postResponse.status).toBe(200)
    expect(postResponse.body.success).toBe(true)
    expect(mocks.supabase.from).toHaveBeenCalledWith('tasks')
    expect(mocks.taskFallbackEq).toHaveBeenCalledWith('id', 'dependent-task-1')
  })

  it('self-heals the relation table and continues with junction persistence when DDL is available', async () => {
    let relationTableAvailable = false
    const insertedRelations: Array<{ conditionId: string; taskId: string }> = []

    mocks.databaseQuery.mockImplementation(async (sql: string) => {
      const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase()
      if (normalized.startsWith('create table if not exists public.task_preceding_relations')) {
        relationTableAvailable = true
        return { rows: [], rowCount: 0 }
      }
      if (normalized.includes('public.task_preceding_relations')) {
        if (!relationTableAvailable) {
          throw new Error("relation 'public.task_preceding_relations' does not exist")
        }
        return { rows: [], rowCount: 0 }
      }
      return { rows: [], rowCount: 0 }
    })

    mocks.executeSQLOne.mockImplementation(async (sql: string) => {
      const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase()

      if (normalized === 'select project_id from task_conditions where id = ?') {
        return { project_id: 'project-1' }
      }

      if (normalized === 'select task_id from task_preceding_relations limit 1') {
        if (!relationTableAvailable) {
          throw new Error("relation 'public.task_preceding_relations' does not exist")
        }
        return null
      }

      if (normalized === 'select preceding_task_id from task_conditions where id = ?') {
        return { preceding_task_id: null }
      }

      return null
    })

    mocks.executeSQL.mockImplementation(async (sql: string, params: unknown[] = []) => {
      const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase()
      if (normalized === 'delete from task_preceding_relations where condition_id = ?') {
        insertedRelations.splice(0, insertedRelations.length)
        return []
      }
      if (normalized.startsWith('insert into task_preceding_relations (id, condition_id, task_id)')) {
        insertedRelations.push({
          conditionId: String(params[1] ?? ''),
          taskId: String(params[2] ?? ''),
        })
        return []
      }
      if (normalized === 'select task_id from task_preceding_relations where condition_id = ?') {
        return insertedRelations
          .filter((relation) => relation.conditionId === String(params[0] ?? ''))
          .map((relation) => ({ task_id: relation.taskId }))
      }
      return []
    })

    const { default: router } = await import('../routes/task-conditions.js')

    const response = await request(buildApp(router))
      .post('/api/task-conditions/condition-1/preceding-tasks')
      .send({ preceding_task_ids: ['task-legacy-1'] })

    expect(response.status).toBe(200)
    expect(response.body.success).toBe(true)
    expect(mocks.databaseQuery).toHaveBeenCalled()
    expect(mocks.executeSQL).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO task_preceding_relations'),
      [expect.any(String), 'condition-1', 'task-legacy-1'],
    )
  })
})
