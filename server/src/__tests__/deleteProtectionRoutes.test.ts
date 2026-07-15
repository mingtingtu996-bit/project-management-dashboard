import express from 'express'
import supertest from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
    const supabaseService = {
      getTask: vi.fn(),
      deleteTask: vi.fn(async (_id?: string) => undefined),
    }

  const obstacleQueryBuilderFactory = () => {
      const builder: Record<string, any> = {
        select: vi.fn(() => builder),
        update: vi.fn(() => builder),
        eq: vi.fn(() => builder),
        in: vi.fn(async () => ({ data: mocks.linkedIssues, error: null })),
      }
    return builder
  }

  return {
    supabaseService,
    executeSQL: vi.fn(),
    executeSQLOne: vi.fn(),
    executeDatabaseRpc: vi.fn(async () => true),
    getTask: vi.fn(),
    updateTaskRecord: vi.fn(),
    recordTaskProgressSnapshot: vi.fn(async () => undefined),
    getMembers: vi.fn(async () => []),
    linkedIssues: [] as Array<Record<string, unknown>>,
    supabaseDb: {
      from: vi.fn(() => obstacleQueryBuilderFactory()),
      rpc: vi.fn(async () => ({ data: true, error: null })),
    },
    warningEvaluate: vi.fn(async (_payload?: unknown) => undefined),
    passiveReorderDetection: vi.fn(async () => undefined),
    enqueueProjectHealthUpdate: vi.fn(async () => undefined),
    writeStatusTransitionLog: vi.fn(async () => undefined),
    writeLifecycleLog: vi.fn(async () => undefined),
    writeLog: vi.fn(async () => undefined),
    resolveObstacle: vi.fn(),
    calculateBusinessStatus: vi.fn(async () => ({ status: 'healthy' })),
    evaluateBusinessStatusForTaskFromLoadedFact: vi.fn(async () => ({ status: 'healthy' })),
    evaluateTaskConstraint: vi.fn(async () => undefined),
    persistNotification: vi.fn(async () => undefined),
    executeRetention: vi.fn(async () => ({
      decision: 'physical_delete',
      resolvedAction: 'physical_delete',
      executionMode: 'auto_execute',
      requiresUserConfirmation: false,
      canPhysicalDelete: true,
      reasonCode: 'no_reference_physical_delete',
      reason: 'The record has no references and can be deleted.',
      referenceSummary: {},
    })),
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    },
    closeTaskInMainChain: vi.fn(async (id: string, version: number, userId: string | null) => {
      const updatedTask = await mocks.updateTaskRecord(
        id,
        {
          status: 'completed',
          progress: 100,
          updated_by: userId,
        },
        version,
        { skipSnapshotWrite: true },
      )

      await mocks.warningEvaluate({
        type: 'task',
        task: {
          id,
          status: 'completed',
          progress: 100,
        },
      })

      return {
        task: updatedTask,
      }
    }),
    deleteTaskInMainChain: vi.fn(async (id: string) => {
      await mocks.supabaseService.deleteTask(id)
    }),
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
  executeDatabaseRpc: mocks.executeDatabaseRpc,
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
    evaluateBusinessStatusForTaskFromLoadedFact: mocks.evaluateBusinessStatusForTaskFromLoadedFact,
  },
}))

vi.mock('../services/taskWriteChainService.js', () => ({
  closeTaskInMainChain: mocks.closeTaskInMainChain,
  createTaskInMainChain: vi.fn(),
  deleteTaskInMainChain: mocks.deleteTaskInMainChain,
  reopenTaskInMainChain: vi.fn(),
  updateTaskInMainChain: vi.fn(),
}))

vi.mock('../services/taskConstraintGovernanceService.js', () => ({
  evaluateTaskConstraint: mocks.evaluateTaskConstraint,
}))

vi.mock('../services/deletionRetentionGovernanceService.js', () => ({
  executeRetention: mocks.executeRetention,
  enforceRetentionOrBlock: vi.fn(async (input: Record<string, unknown>) => {
    const result = await (mocks.executeRetention as any)(input)
    const blocked = result.executionMode === 'reject' ||
      result.requiresUserConfirmation === true ||
      (input.userAction === 'delete' && (result.resolvedAction !== 'physical_delete' || result.executionMode !== 'auto_execute'))
    return { blocked, reason: blocked ? result.reason : '', result }
  }),
  buildRetentionBlockedApiError: vi.fn((reason: string, result: Record<string, unknown>, options?: { details?: unknown }) => ({
    code: result.requiresUserConfirmation ? 'RETENTION_CONFIRMATION_REQUIRED' : 'RETENTION_REJECTED',
    message: reason || result.reason,
    details: options?.details ?? result,
  })),
  buildRetentionBlockedHttpStatus: vi.fn((result: Record<string, unknown>) => (
    result.requiresUserConfirmation ? 409 : 422
  )),
}))

const { default: tasksRouter } = await import('../routes/tasks.js')
const { default: taskObstaclesRouter } = await import('../routes/task-obstacles.js')
const { default: taskConditionsRouter } = await import('../routes/task-conditions.js')

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
      if (sql.includes('FROM acceptance_plans')) return []
      return []
    })

    const response = await supertest(buildApp('/api/tasks', tasksRouter)).delete('/api/tasks/task-1')

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
  }, 30_000)

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
      if (sql.includes('FROM acceptance_plans')) return []
      if (sql.includes('DELETE FROM task_preceding_relations')) {
        throw new Error("[executeSQL DELETE] Could not find the table 'public.task_preceding_relations' in the schema cache")
      }
      return []
    })

    const response = await supertest(buildApp('/api/tasks', tasksRouter)).delete('/api/tasks/task-1')

    expect(response.status).toBe(200)
    expect(response.body.success).toBe(true)
    expect(mocks.executeRetention).toHaveBeenCalledWith(expect.objectContaining({
      entityType: 'task',
      entityId: 'task-1',
      projectId: 'project-1',
      userId: 'user-1',
      actorId: 'user-1',
      userAction: 'delete',
      metadata: {
        source: 'task_api_delete',
      },
    }))
    expect(mocks.supabaseService.deleteTask).toHaveBeenCalledWith('task-1')
    expect(mocks.deleteTaskInMainChain).toHaveBeenCalledWith('task-1', 'project-1', 'user-1')
  })

  it('refuses direct task deletion when retention requires confirmation', async () => {
    const task = {
      id: 'task-1',
      project_id: 'project-1',
      title: '历史任务',
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
      if (sql.includes('FROM acceptance_plans')) return []
      return []
    })
    mocks.executeRetention.mockResolvedValueOnce({
      decision: 'soft_delete',
      resolvedAction: 'soft_delete',
      executionMode: 'require_user_confirm',
      requiresUserConfirmation: true,
      canPhysicalDelete: false,
      reasonCode: 'history_consumer_retained',
      reason: 'The record has history consumers and will be retained.',
      referenceSummary: {
        task_baseline_items: 1,
      },
    })

    const response = await supertest(buildApp('/api/tasks', tasksRouter)).delete('/api/tasks/task-1')

    expect(response.status).toBe(409)
    expect(response.body.error).toMatchObject({
      code: 'RETENTION_CONFIRMATION_REQUIRED',
      details: {
        entity_type: 'task',
        entity_id: 'task-1',
        reason_code: 'history_consumer_retained',
        resolved_action: 'soft_delete',
        execution_mode: 'require_user_confirm',
        has_baseline_link: true,
      },
    })
    expect(mocks.deleteTaskInMainChain).not.toHaveBeenCalled()
    expect(mocks.supabaseService.deleteTask).not.toHaveBeenCalled()
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

    const response = await supertest(buildApp('/api/tasks', tasksRouter))
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
      if (sql.includes('FROM task_obstacles WHERE id = ?')) return obstacle
      return null
    })

    const response = await supertest(buildApp('/api/task-obstacles', taskObstaclesRouter)).delete('/api/task-obstacles/obstacle-1')

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
      if (sql.includes('FROM task_conditions')) return { project_id: 'project-1', task_id: 'task-1' }
      return null
    })

    const response = await supertest(buildApp('/api/task-conditions', taskConditionsRouter)).delete('/api/task-conditions/condition-1')

    expect(response.status).toBe(200)
    expect(response.body.success).toBe(true)
    expect(mocks.executeDatabaseRpc).toHaveBeenCalledWith('delete_task_condition_with_source_backfill_atomic', {
      p_condition_id: 'condition-1',
    })
    expect(mocks.supabaseDb.rpc).not.toHaveBeenCalled()
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
      if (sql.includes('FROM task_obstacles WHERE id = ?')) return obstacle
      return null
    })

    const response = await supertest(buildApp('/api/task-obstacles', taskObstaclesRouter)).delete('/api/task-obstacles/obstacle-1')

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

    const response = await supertest(buildApp('/api/task-obstacles', taskObstaclesRouter))
      .post('/api/task-obstacles/obstacle-1/close')
      .send({ resolution: '保留记录，转为关闭' })

    expect(response.status).toBe(200)
    expect(response.body.success).toBe(true)
    expect(response.body.data.obstacle.status).toBe('已解决')
    expect(mocks.resolveObstacle).toHaveBeenCalledWith({
      id: 'obstacle-1',
      resolution: '保留记录，转为关闭',
      resolved_by: 'user-1',
      project_id: 'project-1',
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
