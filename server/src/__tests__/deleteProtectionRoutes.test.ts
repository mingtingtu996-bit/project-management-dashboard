import express from 'express'
import supertest from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const supabaseService = {
    getTask: vi.fn(),
    deleteTask: vi.fn(async () => undefined),
  }

  const obstacleQueryBuilderFactory = () => {
    const builder: Record<string, any> = {
      select: vi.fn(() => builder),
      eq: vi.fn(() => builder),
      in: vi.fn(async () => ({ data: mocks.linkedIssues, error: null })),
    }
    return builder
  }

  return {
    supabaseService,
    executeSQL: vi.fn(),
    executeSQLOne: vi.fn(),
    getTask: vi.fn(),
    updateTaskRecord: vi.fn(),
    recordTaskProgressSnapshot: vi.fn(async () => undefined),
    getMembers: vi.fn(async () => []),
    linkedIssues: [] as Array<Record<string, unknown>>,
    supabaseDb: {
      from: vi.fn(() => obstacleQueryBuilderFactory()),
      rpc: vi.fn(async () => ({ data: true, error: null })),
    },
    warningEvaluate: vi.fn(async () => undefined),
    passiveReorderDetection: vi.fn(async () => undefined),
    enqueueProjectHealthUpdate: vi.fn(async () => undefined),
    writeStatusTransitionLog: vi.fn(async () => undefined),
    writeLifecycleLog: vi.fn(async () => undefined),
    writeLog: vi.fn(async () => undefined),
    resolveObstacle: vi.fn(),
    calculateBusinessStatus: vi.fn(async () => ({ status: 'healthy' })),
    persistNotification: vi.fn(async () => undefined),
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    },
  }
})

vi.mock('../middleware/auth.js', () => ({
  authenticate: vi.fn((req: any, _res: any, next: () => void) => {
    req.user = { id: 'user-1' }
    next()
  }),
  requireProjectEditor: vi.fn((_resolveProjectId?: any) => (req: any, _res: any, next: () => void) => {
    req.user = req.user ?? { id: 'user-1' }
    next()
  }),
  requireProjectMember: vi.fn(() => (_req: any, _res: any, next: () => void) => next()),
}))

vi.mock('../middleware/validation.js', () => ({
  validate: vi.fn(() => (_req: any, _res: any, next: () => void) => next()),
  conditionSchema: {},
  conditionUpdateSchema: {},
  validateIdParam: vi.fn((_req: any, _res: any, next: () => void) => next()),
  taskSchema: {},
  taskUpdateSchema: {},
  obstacleSchema: {},
  obstacleUpdateSchema: {},
}))

vi.mock('../middleware/logger.js', () => ({
  logger: mocks.logger,
}))

vi.mock('../services/supabaseService.js', () => ({
  SupabaseService: vi.fn().mockImplementation(() => mocks.supabaseService),
}))

vi.mock('../services/dbService.js', () => ({
  executeSQL: mocks.executeSQL,
  executeSQLOne: mocks.executeSQLOne,
  supabase: mocks.supabaseDb,
  getTask: mocks.getTask,
  getMembers: mocks.getMembers,
  recordTaskProgressSnapshot: mocks.recordTaskProgressSnapshot,
  updateTask: mocks.updateTaskRecord,
}))

vi.mock('../services/warningService.js', () => ({
  WarningService: vi.fn().mockImplementation(() => ({
    evaluate: mocks.warningEvaluate,
  })),
}))

vi.mock('../services/systemAnomalyService.js', () => ({
  SystemAnomalyService: vi.fn().mockImplementation(() => ({
    enqueuePassiveReorderDetection: mocks.passiveReorderDetection,
  })),
}))

vi.mock('../services/projectHealthService.js', () => ({
  enqueueProjectHealthUpdate: mocks.enqueueProjectHealthUpdate,
}))

vi.mock('../services/warningChainService.js', () => ({
  persistNotification: mocks.persistNotification,
}))

vi.mock('../services/changeLogs.js', () => ({
  writeStatusTransitionLog: mocks.writeStatusTransitionLog,
  writeLifecycleLog: mocks.writeLifecycleLog,
  writeLog: mocks.writeLog,
}))

vi.mock('../services/businessStatusService.js', () => ({
  BusinessStatusService: {
    resolveObstacle: mocks.resolveObstacle,
    calculateBusinessStatus: mocks.calculateBusinessStatus,
  },
}))

function buildApp(path: string, router: express.Router) {
  const app = express()
  app.use(express.json())
  app.use(path, router)
  return app
}

describe('delete protection routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.linkedIssues = []
    mocks.executeSQL.mockResolvedValue([])
    mocks.executeSQLOne.mockResolvedValue(null)
    mocks.getTask.mockResolvedValue(null)
    mocks.supabaseService.getTask.mockResolvedValue(null)
    mocks.updateTaskRecord.mockResolvedValue(null)
    mocks.resolveObstacle.mockResolvedValue({
      id: 'obstacle-1',
      project_id: 'project-1',
      task_id: 'task-1',
      status: '已解决',
      is_resolved: true,
      description: '阻碍已关闭',
    })
  })

  it('returns structured 422 protection payload for task deletion', async () => {
    const task = {
      id: 'task-1',
      project_id: 'project-1',
      title: '关键任务',
      status: 'in_progress',
      progress: 45,
      version: 3,
      participant_unit_id: null,
      responsible_unit: null,
      assignee_unit: null,
    }
    mocks.supabaseService.getTask.mockResolvedValue(task)
    mocks.getTask.mockResolvedValue(task)
    mocks.executeSQL.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM tasks WHERE parent_id')) return [{ id: 'child-1' }]
      if (sql.includes('FROM task_conditions')) return []
      if (sql.includes('FROM task_obstacles')) return []
      if (sql.includes('FROM delay_requests')) return []
      if (sql.includes('FROM acceptance_plans')) return []
      return []
    })

    const { default: router } = await import('../routes/tasks.js')
    const response = await supertest(buildApp('/api/tasks', router)).delete('/api/tasks/task-1')

    expect(response.status).toBe(422)
    expect(response.body.error.code).toBe('TASK_DELETE_PROTECTED')
    expect(response.body.error.details).toMatchObject({
      entity_type: 'task',
      entity_id: 'task-1',
      child_task_count: 1,
      close_action: {
        method: 'POST',
        endpoint: '/api/tasks/task-1/close',
        label: '关闭此记录',
      },
    })
    expect(mocks.supabaseService.deleteTask).not.toHaveBeenCalled()
  })

  it('still deletes task when task_preceding_relations is missing in the live schema', async () => {
    const task = {
      id: 'task-1',
      project_id: 'project-1',
      title: '可删除任务',
      status: 'todo',
      progress: 0,
      version: 1,
      participant_unit_id: null,
      responsible_unit: null,
      assignee_unit: null,
    }
    mocks.supabaseService.getTask.mockResolvedValue(task)
    mocks.getTask.mockResolvedValue(task)
    mocks.executeSQL.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM tasks WHERE parent_id')) return []
      if (sql.includes('FROM task_conditions')) return []
      if (sql.includes('FROM task_obstacles')) return []
      if (sql.includes('FROM delay_requests')) return []
      if (sql.includes('FROM acceptance_plans')) return []
      if (sql.includes('DELETE FROM task_preceding_relations')) {
        throw new Error("[executeSQL DELETE] Could not find the table 'public.task_preceding_relations' in the schema cache")
      }
      return []
    })

    const { default: router } = await import('../routes/tasks.js')
    const response = await supertest(buildApp('/api/tasks', router)).delete('/api/tasks/task-1')

    expect(response.status).toBe(200)
    expect(response.body.success).toBe(true)
    expect(mocks.supabaseService.deleteTask).toHaveBeenCalledWith('task-1')
    expect(mocks.logger.warn).toHaveBeenCalledWith(
      'Skipping task_preceding_relations cleanup because relation table is missing',
      { id: 'task-1' },
    )
  })

  it('closes protected task through dedicated close endpoint', async () => {
    const task = {
      id: 'task-1',
      project_id: 'project-1',
      title: '关键任务',
      status: 'in_progress',
      progress: 45,
      version: 3,
      participant_unit_id: null,
      responsible_unit: null,
      assignee_unit: null,
    }
    mocks.supabaseService.getTask.mockResolvedValue(task)
    mocks.getTask.mockResolvedValue(task)
    mocks.updateTaskRecord.mockResolvedValue({
      ...task,
      status: 'completed',
      progress: 100,
    })
    mocks.executeSQL.mockResolvedValue([])

    const { default: router } = await import('../routes/tasks.js')
    const response = await supertest(buildApp('/api/tasks', router))
      .post('/api/tasks/task-1/close')
      .send({ version: 3 })

    expect(response.status).toBe(200)
    expect(response.body.success).toBe(true)
    expect(response.body.data.status).toBe('completed')
    expect(mocks.updateTaskRecord).toHaveBeenCalledWith(
      'task-1',
      expect.objectContaining({
        status: 'completed',
        updated_by: 'user-1',
      }),
      3,
      { skipSnapshotWrite: true },
    )
    expect(mocks.warningEvaluate).toHaveBeenCalledWith({
      type: 'task',
      task: {
        id: 'task-1',
        status: 'completed',
        progress: 100,
      },
    })
  })

  it('returns structured 422 protection payload for obstacle deletion', async () => {
    const obstacle = {
      id: 'obstacle-1',
      project_id: 'project-1',
      task_id: 'task-1',
      description: '塔吊冲突',
      status: '处理中',
      is_resolved: false,
    }
    mocks.executeSQLOne.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT project_id FROM task_obstacles')) return { project_id: 'project-1' }
      if (sql.includes('SELECT * FROM task_obstacles')) return obstacle
      return null
    })

    const { default: router } = await import('../routes/task-obstacles.js')
    const response = await supertest(buildApp('/api/task-obstacles', router)).delete('/api/task-obstacles/obstacle-1')

    expect(response.status).toBe(422)
    expect(response.body.error.code).toBe('OBSTACLE_DELETE_PROTECTED')
    expect(response.body.error.details).toMatchObject({
      entity_type: 'task_obstacle',
      entity_id: 'obstacle-1',
      status: '处理中',
      close_action: {
        method: 'POST',
        endpoint: '/api/task-obstacles/obstacle-1/close',
        label: '关闭此记录',
      },
    })
    expect(mocks.supabaseDb.rpc).not.toHaveBeenCalled()
  })

  it('writes a lifecycle delete log when deleting a task condition', async () => {
    mocks.executeSQLOne.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT project_id FROM task_conditions')) return { project_id: 'project-1' }
      return null
    })

    const { default: router } = await import('../routes/task-conditions.js')
    const response = await supertest(buildApp('/api/task-conditions', router)).delete('/api/task-conditions/condition-1')

    expect(response.status).toBe(200)
    expect(response.body.success).toBe(true)
    expect(mocks.supabaseDb.rpc).toHaveBeenCalledWith('delete_task_condition_with_source_backfill_atomic', {
      p_condition_id: 'condition-1',
    })
    expect(mocks.writeLifecycleLog).toHaveBeenCalledWith(expect.objectContaining({
      project_id: 'project-1',
      entity_type: 'task_condition',
      entity_id: 'condition-1',
      action: 'deleted',
      changed_by: 'user-1',
      change_source: 'manual_adjusted',
    }))
  })

  it('writes a lifecycle delete log when deleting a resolved obstacle', async () => {
    const obstacle = {
      id: 'obstacle-1',
      project_id: 'project-1',
      task_id: 'task-1',
      description: '塔吊冲突',
      status: '已解决',
      is_resolved: true,
    }
    mocks.executeSQLOne.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT project_id FROM task_obstacles')) return { project_id: 'project-1' }
      if (sql.includes('SELECT * FROM task_obstacles')) return obstacle
      return null
    })

    const { default: router } = await import('../routes/task-obstacles.js')
    const response = await supertest(buildApp('/api/task-obstacles', router)).delete('/api/task-obstacles/obstacle-1')

    expect(response.status).toBe(200)
    expect(response.body.success).toBe(true)
    expect(mocks.supabaseDb.rpc).toHaveBeenCalledWith('delete_task_obstacle_with_source_backfill_atomic', {
      p_obstacle_id: 'obstacle-1',
    })
    expect(mocks.writeLifecycleLog).toHaveBeenCalledWith(expect.objectContaining({
      project_id: 'project-1',
      entity_type: 'task_obstacle',
      entity_id: 'obstacle-1',
      action: 'deleted',
      changed_by: 'user-1',
      change_source: 'manual_adjusted',
    }))
  })

  it('closes obstacle through dedicated close endpoint', async () => {
    mocks.executeSQLOne.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT project_id FROM task_obstacles')) return { project_id: 'project-1' }
      if (sql.includes('SELECT id, project_id, status FROM task_obstacles')) {
        return { id: 'obstacle-1', project_id: 'project-1', status: '处理中' }
      }
      return null
    })
    mocks.resolveObstacle.mockResolvedValue({
      id: 'obstacle-1',
      project_id: 'project-1',
      task_id: 'task-1',
      status: '已解决',
      is_resolved: true,
      description: '已手动关闭',
    })

    const { default: router } = await import('../routes/task-obstacles.js')
    const response = await supertest(buildApp('/api/task-obstacles', router))
      .post('/api/task-obstacles/obstacle-1/close')
      .send({ resolution: '保留记录，转为关闭' })

    expect(response.status).toBe(200)
    expect(response.body.success).toBe(true)
    expect(response.body.data.obstacle.status).toBe('已解决')
    expect(mocks.resolveObstacle).toHaveBeenCalledWith({
      id: 'obstacle-1',
      resolution: '保留记录，转为关闭',
      resolved_by: 'user-1',
    })
    expect(mocks.warningEvaluate).toHaveBeenCalledWith({
      type: 'obstacle',
      obstacle: expect.objectContaining({
        id: 'obstacle-1',
        task_id: 'task-1',
      }),
    })
  })
})
