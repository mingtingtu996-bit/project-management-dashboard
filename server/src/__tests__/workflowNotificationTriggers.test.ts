import express from 'express'
import supertest from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

process.env.NODE_ENV = 'test'
process.env.JWT_SECRET = 'test-jwt-secret'

const state = vi.hoisted(() => {
  const projectId = '11111111-1111-4111-8111-111111111111'
  const drawingId = '22222222-2222-4222-8222-222222222222'
  const taskId = '33333333-3333-4333-8333-333333333333'
  const dependentTaskId = '44444444-4444-4444-8444-444444444444'
  const conditionId = '55555555-5555-4555-8555-555555555555'
  const planId = '66666666-6666-4666-8666-666666666666'
  const nodeId = '77777777-7777-4777-8777-777777777777'
  const obstacleId = '88888888-8888-4888-8888-888888888888'

  const drawing = {
    id: drawingId,
    project_id: projectId,
    package_id: null,
    package_code: null,
    drawing_name: '总平面图',
    version: 'V1',
    lock_version: 1,
    version_no: 'V1',
    is_current_version: false,
    created_at: '2026-04-15 08:00:00',
    updated_at: '2026-04-15 08:00:00',
    responsible_user_id: '77777777-7777-4777-8777-777777777777',
  }

  const acceptancePlan = {
    id: planId,
    task_id: taskId,
    project_id: projectId,
    plan_name: 'main-structure-acceptance',
    acceptance_type: 'main-structure',
    status: 'submitted',
    actual_date: null,
    created_at: '2026-04-15T00:00:00.000Z',
    updated_at: '2026-04-15T00:00:00.000Z',
  }

  const oldTask = {
    id: taskId,
    project_id: projectId,
    title: 'main-structure-task',
    status: 'pending',
    progress: 0,
    assignee: 'owner-1',
    assignee_name: 'owner-1',
    assignee_user_id: '11111111-1111-4111-8111-111111111111',
    planned_start_date: '2026-04-15',
    planned_end_date: '2026-04-20',
    responsible_unit: null,
    assignee_unit: null,
    participant_unit_id: null,
    version: 1,
    created_at: '2026-04-15T00:00:00.000Z',
    updated_at: '2026-04-15T00:00:00.000Z',
  }

  const updatedTask = {
    ...oldTask,
    status: 'completed',
    progress: 100,
    actual_end_date: '2026-04-16',
    updated_at: '2026-04-16T00:00:00.000Z',
  }
  const obstacle = {
    id: obstacleId,
    task_id: dependentTaskId,
    project_id: projectId,
    title: '依赖阻碍',
    description: '前置任务未完成导致阻碍',
    severity: '高',
    status: '待处理',
    resolution: null as string | null,
    resolved_by: null as string | null,
    resolved_at: null as string | null,
    expected_resolution_date: '2026-04-20',
    estimated_resolve_date: '2026-04-20',
  }
  let relationTableMissing = false
  let directRelationQueryAvailable = false
  let legacyPrecedingTaskFieldMissing = false

  const persistNotification = vi.fn(async (payload: any) => payload)
  const closeDelaySourceRisksForCompletedTask = vi.fn(async () => [])
  const databaseQuery = vi.fn(async (sql: string, params: unknown[] = []) => {
    const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase()

    if (normalized === 'select condition_id from public.task_preceding_relations where task_id = $1') {
      if (!directRelationQueryAvailable) {
        throw new Error("relation 'public.task_preceding_relations' does not exist")
      }
      return { rows: [{ condition_id: params[0] === taskId ? conditionId : null }].filter((row) => row.condition_id), rowCount: 1 }
    }

    return { rows: [], rowCount: 0 }
  })

  const executeSQLOne = vi.fn(async (sql: string, params: unknown[] = []) => {
    const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase()

    if (normalized.includes('from construction_drawings where id = ? limit 1')) {
      return { ...drawing }
    }

    if (normalized.includes('from acceptance_plans where id = ? limit 1')) {
      return { ...acceptancePlan }
    }

    if (normalized === 'select * from task_obstacles where id = ? limit 1') {
      return params[0] === obstacleId ? { ...obstacle } : null
    }

    return null
  })

  const executeSQL = vi.fn(async (sql: string, params: unknown[] = []) => {
    const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase()

    if (normalized.startsWith('update construction_drawings set ') && normalized.endsWith(' where id = ? and lock_version = ?')) {
      const clauseList = normalized
        .slice('update construction_drawings set '.length, -' where id = ? and lock_version = ?'.length)
        .split(', ')
        .map((item) => item.replace(' = ?', ''))
      if (Number(params[params.length - 1] ?? 1) !== Number(drawing.lock_version ?? 1)) {
        return []
      }
      clauseList.forEach((field, index) => {
        ;(drawing as Record<string, unknown>)[field] = params[index] as never
      })
      return []
    }

    if (normalized.startsWith('update acceptance_plans set ') && normalized.endsWith(' where id = ?')) {
      if (normalized.startsWith("update acceptance_plans set status = 'passed'")) {
        acceptancePlan.status = 'passed'
        acceptancePlan.actual_date = params[0] as string
        acceptancePlan.updated_at = params[1] as string
        return []
      }

      if (normalized.startsWith("update acceptance_plans set status = 'rectification'")) {
        acceptancePlan.status = 'rectification'
        acceptancePlan.updated_at = params[0] as string
        return []
      }

      const clauseList = normalized
        .slice('update acceptance_plans set '.length, -' where id = ?'.length)
        .split(', ')
        .map((item) => item.replace(' = ?', ''))
      clauseList.forEach((field, index) => {
        ;(acceptancePlan as Record<string, unknown>)[field] = params[index] as never
      })
      return []
    }

    if (normalized === 'select id from tasks where preceding_task_id = ?') {
      if (legacyPrecedingTaskFieldMissing) {
        throw new Error('column tasks.preceding_task_id does not exist')
      }
      return relationTableMissing ? [{ id: dependentTaskId }] : []
    }

    if (normalized === 'select condition_id from task_preceding_relations where task_id = ?') {
      if (relationTableMissing) {
        throw new Error("relation 'public.task_preceding_relations' does not exist")
      }
      return [{ condition_id: conditionId }]
    }

    if (normalized.startsWith('select id, task_id from task_conditions where id in')) {
      return [{ id: conditionId, task_id: dependentTaskId }]
    }

    if (normalized.startsWith('select id, task_id from task_conditions where task_id in')) {
      return relationTableMissing ? [{ id: conditionId, task_id: dependentTaskId }] : []
    }

    if (normalized.startsWith('update task_conditions set is_satisfied = true')) {
      return []
    }

    if (normalized.startsWith('select id, task_id, project_id, title, description, severity, status, expected_resolution_date, estimated_resolve_date from task_obstacles where task_id in')) {
      return [{ ...obstacle }]
    }

    if (normalized === 'update task_obstacles set status = ?, resolution = ?, resolved_by = ?, resolved_at = ? where id = ?') {
      obstacle.status = String(params[0] ?? obstacle.status)
      obstacle.resolution = String(params[1] ?? '')
      obstacle.resolved_by = String(params[2] ?? '')
      obstacle.resolved_at = String(params[3] ?? '')
      return []
    }

    if (normalized.startsWith('select id, title from tasks where id in')) {
      return [{ id: dependentTaskId, title: '砌体施工' }]
    }

    if (
      normalized === 'select id, unit_name from participant_units where project_id = ? and unit_name = ?'
      || normalized === 'select id, unit_name from participant_units where project_id is null and unit_name = ?'
    ) {
      return []
    }

    return []
  })

  const getMembers = vi.fn(async () => ([
    { id: 'm-1', project_id: projectId, user_id: 'owner-1', role: 'owner', joined_at: '2026-04-01T00:00:00.000Z' },
    { id: 'm-2', project_id: projectId, user_id: 'admin-1', role: 'admin', joined_at: '2026-04-01T00:00:00.000Z' },
  ]))
  const getTask = vi.fn(async () => ({ ...oldTask }))
  const updateTask = vi.fn(async (_id: string, updates: Record<string, unknown>) => ({
    ...oldTask,
    ...updates,
    updated_at: '2026-04-16T00:00:00.000Z',
  }))

  const supabaseService = {
    getTask: vi.fn(async () => ({ ...oldTask })),
    updateTask: vi.fn(async () => ({ ...updatedTask })),
  }

  const supabaseDb = {
    from: vi.fn((table: string) => {
      if (table === 'tasks') {
        return {
          update: vi.fn(() => ({
            eq: vi.fn(async () => ({ error: null })),
          })),
        }
      }

      if (table === 'participant_units') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(async () => ({ data: null, error: { message: 'No rows found' } })),
            })),
          })),
        }
      }

      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: vi.fn(async () => ({ data: null, error: { message: 'No rows found' } })),
          })),
        })),
        update: vi.fn(() => ({
          eq: vi.fn(async () => ({ error: null })),
        })),
      }
    }),
  }

  const reset = () => {
    drawing.version = 'V1'
    drawing.version_no = 'V1'
    drawing.updated_at = '2026-04-15 08:00:00'
    acceptancePlan.status = 'submitted'
    acceptancePlan.actual_date = null
    acceptancePlan.updated_at = '2026-04-15T00:00:00.000Z'
    obstacle.status = '待处理'
    obstacle.resolution = null
    obstacle.resolved_by = null
    obstacle.resolved_at = null
    persistNotification.mockClear()
    executeSQLOne.mockClear()
    executeSQL.mockClear()
    relationTableMissing = false
    directRelationQueryAvailable = false
    legacyPrecedingTaskFieldMissing = false
    getMembers.mockClear()
    getTask.mockClear()
    updateTask.mockClear()
    supabaseService.getTask.mockClear()
    supabaseService.updateTask.mockClear()
    databaseQuery.mockClear()
  }

  return {
    ids: { projectId, drawingId, taskId, dependentTaskId, conditionId, planId, nodeId, obstacleId },
    drawing,
    acceptancePlan,
    obstacle,
    persistNotification,
    closeDelaySourceRisksForCompletedTask,
    executeSQLOne,
    executeSQL,
    getMembers,
    getTask,
    updateTask,
    supabaseService,
    supabaseDb,
    databaseQuery,
    setRelationTableMissing(value: boolean) {
      relationTableMissing = value
    },
    setDirectRelationQueryAvailable(value: boolean) {
      directRelationQueryAvailable = value
    },
    setLegacyPrecedingTaskFieldMissing(value: boolean) {
      legacyPrecedingTaskFieldMissing = value
    },
    reset,
  }
})

vi.mock('../middleware/auth.js', () => ({
  authenticate: vi.fn((req: any, _res: any, next: () => void) => {
    req.user = { id: 'user-1' }
    next()
  }),
  optionalAuthenticate: vi.fn((_req: any, _res: any, next: () => void) => next()),
  requireProjectMember: vi.fn(() => (_req: any, _res: any, next: () => void) => next()),
  requireProjectEditor: vi.fn(() => (_req: any, _res: any, next: () => void) => next()),
  requireProjectOwner: vi.fn(() => (_req: any, _res: any, next: () => void) => next()),
  checkResourceAccess: vi.fn((_req: any, _res: any, next: () => void) => next()),
}))

vi.mock('../middleware/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}))

vi.mock('../database.js', () => ({
  query: state.databaseQuery,
}))

vi.mock('../services/dbService.js', () => ({
  executeSQLOne: state.executeSQLOne,
  executeSQL: state.executeSQL,
  getMembers: state.getMembers,
  getTask: state.getTask,
  recordTaskProgressSnapshot: vi.fn(async () => undefined),
    updateTask: state.updateTask,
    supabase: state.supabaseDb,
  }))

vi.mock('../services/warningChainService.js', () => ({
  persistNotification: state.persistNotification,
}))

vi.mock('../services/supabaseService.js', () => ({
  SupabaseService: vi.fn().mockImplementation(() => state.supabaseService),
}))

vi.mock('../services/validationService.js', () => ({
  ValidationService: {
    validateAcceptanceStatusUpdate: vi.fn(() => ({ valid: true, errors: [] })),
    validateAcceptanceStatusPreconditions: vi.fn(() => ({ valid: true, errors: [] })),
    validateAcceptancePlan: vi.fn(() => ({ valid: true, errors: [] })),
  },
}))

vi.mock('../services/warningService.js', () => ({
  WarningService: vi.fn().mockImplementation(() => ({
    evaluate: vi.fn(async () => undefined),
  })),
}))

vi.mock('../services/systemAnomalyService.js', () => ({
  SystemAnomalyService: vi.fn().mockImplementation(() => ({
    enqueuePassiveReorderDetection: vi.fn(async () => undefined),
  })),
}))

vi.mock('../services/upgradeChainService.js', () => ({
  closeDelaySourceRisksForCompletedTask: state.closeDelaySourceRisksForCompletedTask,
}))

vi.mock('../services/drawingPackageService.js', () => ({
  DRAWING_REVIEW_MODE_VALUES: ['mandatory', 'optional', 'none', 'manual_confirm'],
  resolveDrawingCurrentVersionPolicy: vi.fn((input: { explicitCurrentVersion?: boolean | null }) => ({
    resolvedCurrentVersion: input.explicitCurrentVersion === true,
    error: null,
  })),
  deriveDrawingScheduleImpactFlag: vi.fn(() => false),
}))

vi.mock('../routes/drawing-packages.js', () => ({
  registerDrawingPackageRoutes: vi.fn(() => undefined),
}))

vi.mock('../routes/drawing-review-rules.js', () => ({
  registerDrawingReviewRuleRoutes: vi.fn(() => undefined),
}))

const { default: constructionDrawingsRouter } = await import('../routes/construction-drawings.js')
const { default: acceptancePlansRouter } = await import('../routes/acceptance-plans.js')
const { default: tasksRouter } = await import('../routes/tasks.js')

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/projects/:projectId/construction-drawings', constructionDrawingsRouter)
  app.use('/api/acceptance-plans', acceptancePlansRouter)
  app.use('/api/tasks', tasksRouter)
  app.use((error: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(500).json({ success: false, error: { message: error?.message ?? 'unknown error' } })
  })
  return app
}

describe('workflow notification triggers', () => {
  beforeEach(() => {
    state.reset()
    vi.clearAllMocks()
  })

  it('notifies when a drawing version is updated', async () => {
    const request = supertest(buildApp())

    const response = await request
      .put(`/api/projects/${state.ids.projectId}/construction-drawings/${state.ids.drawingId}`)
      .send({ version: 'V2', lock_version: 1, drawing_name: '总平面图' })

    expect(response.status).toBe(200)
    expect(state.persistNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'drawing_version_updated',
        notification_type: 'flow-reminder',
        source_entity_type: 'drawing_version',
        title: '图纸版本已更新',
      }),
    )
  })

  it('notifies when an acceptance plan status changes', async () => {
    const request = supertest(buildApp())

    const response = await request
      .patch(`/api/acceptance-plans/${state.ids.planId}/status`)
      .send({ status: 'passed', actual_date: '2026-04-16' })

    expect(response.status).toBe(200)
    expect(state.persistNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'acceptance_status_changed',
        notification_type: 'flow-reminder',
        source_entity_type: 'acceptance_plan',
        source_entity_id: state.ids.planId,
      }),
    )
    expect(state.updateTask).toHaveBeenCalledWith(
      state.ids.taskId,
      expect.objectContaining({
        status: 'completed',
        progress: 100,
      }),
    )
  })

  it('syncs the linked task when acceptance status is updated through PUT', async () => {
    const request = supertest(buildApp())

    const response = await request
      .put(`/api/acceptance-plans/${state.ids.planId}`)
      .send({ status: 'passed', actual_date: '2026-04-16' })

    expect(response.status).toBe(200)
    expect(state.persistNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'acceptance_status_changed',
        source_entity_id: state.ids.planId,
      }),
    )
    expect(state.updateTask).toHaveBeenCalledWith(
      state.ids.taskId,
      expect.objectContaining({
        status: 'completed',
        progress: 100,
        actual_end_date: '2026-04-16',
      }),
    )
  })

  it('notifies when preceding conditions are auto-satisfied by task completion', async () => {
    const request = supertest(buildApp())

    const response = await request
      .put(`/api/tasks/${state.ids.taskId}`)
      .send({ version: 1, progress: 100 })

    expect(response.status).toBe(200)
    expect(state.persistNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'condition_auto_satisfied',
        notification_type: 'flow-reminder',
        source_entity_type: 'task_condition',
        source_entity_id: state.ids.conditionId,
        task_id: state.ids.dependentTaskId,
      }),
    )
    expect(state.closeDelaySourceRisksForCompletedTask).toHaveBeenCalledWith(state.ids.taskId)
  })

  it('notifies the new assignee when task responsibility changes', async () => {
    const request = supertest(buildApp())

    const response = await request
      .put(`/api/tasks/${state.ids.taskId}`)
      .send({
        version: 1,
        assignee: 'editor-1',
        assignee_name: 'editor-1',
        assignee_user_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      })

    expect(response.status).toBe(200)
    expect(state.persistNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'task_assignment_changed',
        notification_type: 'flow-reminder',
        source_entity_type: 'task',
        recipients: ['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'],
      }),
    )
  })

  it('still auto-satisfies preceding conditions through legacy task field when relation table is missing', async () => {
    state.reset()
    vi.clearAllMocks()
    state.setRelationTableMissing(true)
    const request = supertest(buildApp())

    const response = await request
      .put(`/api/tasks/${state.ids.taskId}`)
      .send({ version: 1, progress: 100 })

    expect(response.status).toBe(200)
    expect(state.persistNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'condition_auto_satisfied',
        source_entity_id: state.ids.conditionId,
        task_id: state.ids.dependentTaskId,
      }),
    )
  })

  it('auto-satisfies preceding conditions through direct pg fallback when schema cache misses the relation table', async () => {
    state.reset()
    vi.clearAllMocks()
    state.setRelationTableMissing(true)
    state.setDirectRelationQueryAvailable(true)
    const request = supertest(buildApp())

    const response = await request
      .put(`/api/tasks/${state.ids.taskId}`)
      .send({ version: 1, progress: 100 })

    expect(response.status).toBe(200)
    expect(state.databaseQuery).toHaveBeenCalledWith(
      'SELECT condition_id FROM public.task_preceding_relations WHERE task_id = $1',
      [state.ids.taskId],
    )
    expect(state.persistNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'condition_auto_satisfied',
        source_entity_id: state.ids.conditionId,
        task_id: state.ids.dependentTaskId,
      }),
    )
  })

  it('still auto-satisfies through direct pg fallback when both relation table cache and legacy task field are missing', async () => {
    state.reset()
    vi.clearAllMocks()
    state.setRelationTableMissing(true)
    state.setDirectRelationQueryAvailable(true)
    state.setLegacyPrecedingTaskFieldMissing(true)
    const request = supertest(buildApp())

    const response = await request
      .put(`/api/tasks/${state.ids.taskId}`)
      .send({ version: 1, progress: 100 })

    expect(response.status).toBe(200)
    expect(state.databaseQuery).toHaveBeenCalledWith(
      'SELECT condition_id FROM public.task_preceding_relations WHERE task_id = $1',
      [state.ids.taskId],
    )
    expect(state.persistNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'condition_auto_satisfied',
        source_entity_id: state.ids.conditionId,
        task_id: state.ids.dependentTaskId,
      }),
    )
  })

  it('auto-resolves dependent task obstacles when preceding conditions are auto-satisfied', async () => {
    state.reset()
    vi.clearAllMocks()
    state.setRelationTableMissing(true)
    state.setDirectRelationQueryAvailable(true)
    state.setLegacyPrecedingTaskFieldMissing(true)
    const request = supertest(buildApp())

    const response = await request
      .put(`/api/tasks/${state.ids.taskId}`)
      .send({ version: 1, progress: 100 })

    expect(response.status).toBe(200)
    expect(state.obstacle.status).toBe('已解决')
    expect(state.obstacle.resolution).toBe('关联前置任务已完成，系统自动解除依赖型阻碍')
    expect(state.obstacle.resolved_by).toBe('user-1')
  })
})


