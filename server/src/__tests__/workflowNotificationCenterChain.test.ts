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
  const notifications: Array<Record<string, any>> = []

  const notificationStore = {
    listNotifications: vi.fn(async (options: Record<string, any> = {}) => {
      let rows = notifications.slice()
      if (options.id) rows = rows.filter((row) => row.id === options.id)
      if (options.projectId) rows = rows.filter((row) => row.project_id === options.projectId)
      if (options.sourceEntityType) rows = rows.filter((row) => row.source_entity_type === options.sourceEntityType)
      if (options.sourceEntityId) rows = rows.filter((row) => row.source_entity_id === options.sourceEntityId)
      if (options.type) rows = rows.filter((row) => row.type === options.type)
      if (Array.isArray(options.ids) && options.ids.length > 0) {
        rows = rows.filter((row) => options.ids.includes(row.id))
      }
      rows = rows.sort((left, right) => String(right.created_at || '').localeCompare(String(left.created_at || '')))
      if (options.limit) {
        rows = rows.slice(0, Number(options.limit))
      }
      return rows.map((row) => ({ ...row }))
    }),
    findNotification: vi.fn(async (options: Record<string, any>) => {
      const rows = await notificationStore.listNotifications({ ...options, limit: 1 })
      return rows[0] ?? null
    }),
    insertNotification: vi.fn(async (notification: Record<string, any>) => {
      const row = {
        id: notification.id ?? `notification-${notifications.length + 1}`,
        touchpoint_type: notification.touchpoint_type ?? 'persistent',
        created_at: notification.created_at ?? new Date().toISOString(),
        updated_at: notification.updated_at ?? notification.created_at ?? new Date().toISOString(),
        ...notification,
      }
      notifications.push(row)
      return { ...row }
    }),
    updateNotificationById: vi.fn(async (id: string, patch: Record<string, any>) => {
      const row = notifications.find((item) => item.id === id)
      if (row) Object.assign(row, patch)
    }),
    updateNotificationsByIds: vi.fn(async (ids: string[], patch: Record<string, any>) => {
      notifications
        .filter((item) => ids.includes(String(item.id)))
        .forEach((item) => Object.assign(item, patch))
    }),
    deleteNotificationById: vi.fn(async (id: string) => {
      const index = notifications.findIndex((item) => item.id === id)
      if (index >= 0) notifications.splice(index, 1)
    }),
  }

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
    plan_name: '主体结构验收',
    acceptance_type: '主体',
    status: 'submitted',
    actual_date: null,
    created_at: '2026-04-15T00:00:00.000Z',
    updated_at: '2026-04-15T00:00:00.000Z',
  }

  const oldTask = {
    id: taskId,
    project_id: projectId,
    title: '主体结构施工',
    status: 'pending',
    progress: 0,
    assignee: '张三',
    assignee_name: '张三',
    assignee_user_id: '11111111-1111-4111-8111-111111111111',
    planned_start_date: '2026-04-15',
    planned_end_date: '2026-04-20',
    building_object_id: '99999999-9999-4999-8999-999999999999',
    responsible_unit: null,
    assignee_unit: null,
    participant_unit_id: null,
    version: 1,
    created_at: '2026-04-15T00:00:00.000Z',
    updated_at: '2026-04-15T00:00:00.000Z',
  }

  const updatedTask = {
    ...oldTask,
    status: 'pending',
    progress: 100,
    actual_end_date: '2026-04-16',
    updated_at: '2026-04-16T00:00:00.000Z',
  }
  const closeDelaySourceRisksForCompletedTask = vi.fn(async () => [])
  const planningGovernanceService = {
    persistProjectGovernanceNotifications: vi.fn(async () => []),
  }

  function normalizeSql(sql: string) {
    return sql.replace(/\s+/g, ' ').trim().toLowerCase()
  }

  const executeSQLOne = vi.fn(async (sql: string, params: unknown[] = []) => {
    const normalized = normalizeSql(sql)

    if (normalized.includes('from construction_drawings where id = ? limit 1') || normalized.includes('from construction_drawings where id = ? and project_id = ? limit 1')) {
      return { ...drawing }
    }

    if (normalized.includes('from acceptance_plans where id = ? limit 1') || normalized.includes('from acceptance_plans where id = ? and project_id = ? limit 1')) {
      return { ...acceptancePlan }
    }

    if (normalized === 'select count(*) as cnt from notifications where project_id = ? and (status = \'unread\' or is_read = 0)') {
      const project = String(params[0] ?? '')
      return {
        cnt: notifications.filter((row) => row.project_id === project && row.status !== 'read' && Number(row.is_read ?? 0) !== 1).length,
      }
    }

    if (normalized === 'select * from notifications where id = ?') {
      return notifications.find((row) => row.id === String(params[0] ?? '')) ?? null
    }

    return null
  })

  const databaseQuery = vi.fn(async (sql: string, params: unknown[] = []) => {
    const normalized = normalizeSql(sql)

    if (normalized.includes('from public.notifications') && normalized.includes('where project_id = $1')) {
      const project = String(params[0] ?? '')
      const touchpointType = params[1] ? String(params[1]) : null
      const category = params[2] ? String(params[2]) : null
      const type = params[3] ? String(params[3]) : null
      const types = Array.isArray(params[4]) ? params[4].map(String) : null
      const limit = Number(params[5] ?? 20)
      const offset = Number(params[6] ?? 0)
      const rows = notifications
        .filter((row) => row.project_id === project)
        .filter((row) => !touchpointType || row.touchpoint_type === touchpointType)
        .filter((row) => !category || row.category === category)
        .filter((row) => !type || row.type === type)
        .filter((row) => !types || types.includes(String(row.type)))
        .sort((left, right) => String(right.created_at || '').localeCompare(String(left.created_at || '')))
        .slice(offset, offset + limit)
      return { rows, rowCount: rows.length }
    }

    if (normalized.includes('from public.task_preceding_relations relation')
      && normalized.includes('condition_row.project_id = $2')) {
      const inScope = params[0] === taskId && params[1] === projectId
      return {
        rows: inScope ? [{ condition_id: conditionId }] : [],
        rowCount: inScope ? 1 : 0,
      }
    }

    return { rows: [], rowCount: 0 }
  })

  const executeSQL = vi.fn(async (sql: string, params: unknown[] = []) => {
    const normalized = normalizeSql(sql)

    if (normalized.startsWith('select * from notifications where project_id = ? order by created_at desc')) {
      const project = String(params[0] ?? '')
      if (normalized.includes('limit ? offset ?')) {
        const limit = Number(params[1] ?? 20)
        const offset = Number(params[2] ?? 0)
        return notifications
          .filter((row) => row.project_id === project)
          .sort((left, right) => String(right.created_at || '').localeCompare(String(left.created_at || '')))
          .slice(offset, offset + limit)
      }
      return notifications
        .filter((row) => row.project_id === project)
        .sort((left, right) => String(right.created_at || '').localeCompare(String(left.created_at || '')))
    }

    if (normalized === 'select * from notifications order by created_at desc') {
      return notifications
        .slice()
        .sort((left, right) => String(right.created_at || '').localeCompare(String(left.created_at || '')))
    }

    if (normalized.startsWith('select * from notifications order by created_at desc limit ? offset ?')) {
      const limit = Number(params[0] ?? 20)
      const offset = Number(params[1] ?? 0)
      return notifications
        .slice()
        .sort((left, right) => String(right.created_at || '').localeCompare(String(left.created_at || '')))
        .slice(offset, offset + limit)
    }

    if (normalized.startsWith('insert into notifications')) {
      const columnsMatch = sql.match(/notifications\s*\(([^)]+)\)/i)
      const columns = columnsMatch?.[1]?.split(',').map((item) => item.trim()) ?? []
      const row = Object.fromEntries(columns.map((column, index) => [column, params[index] ?? null]))
      notifications.push(row)
      return []
    }

    if (normalized.startsWith('update construction_drawings set ') && (normalized.endsWith(' where id = ? and lock_version = ?') || normalized.endsWith(' where id = ? and project_id = ? and lock_version = ?'))) {
      const withProject = normalized.endsWith(' where id = ? and project_id = ? and lock_version = ?')
      const clauseList = normalized
        .slice('update construction_drawings set '.length, -(withProject ? ' where id = ? and project_id = ? and lock_version = ?'.length : ' where id = ? and lock_version = ?'.length))
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

    const acceptanceUpdateSql = normalized.endsWith(' returning id')
      ? normalized.slice(0, -' returning id'.length)
      : normalized
    if (acceptanceUpdateSql.startsWith('update acceptance_plans set ') && (
      acceptanceUpdateSql.endsWith(' where id = ?')
      || acceptanceUpdateSql.endsWith(' where id = ? and project_id = ?')
      || acceptanceUpdateSql.endsWith(' where id = ? and project_id = ? and status = ?')
    )) {
      const suffix = acceptanceUpdateSql.endsWith(' where id = ? and project_id = ? and status = ?')
        ? ' where id = ? and project_id = ? and status = ?'
        : acceptanceUpdateSql.endsWith(' where id = ? and project_id = ?')
          ? ' where id = ? and project_id = ?'
          : ' where id = ?'
      const expectedStatus = acceptanceUpdateSql.endsWith(' where id = ? and project_id = ? and status = ?')
        ? String(params[params.length - 1] ?? '')
        : null
      if (expectedStatus !== null && expectedStatus !== acceptancePlan.status) {
        return []
      }
      const clauseList = acceptanceUpdateSql
        .slice('update acceptance_plans set '.length, -suffix.length)
        .split(', ')
        .map((item) => item.replace(' = ?', ''))
      clauseList.forEach((field, index) => {
        ;(acceptancePlan as Record<string, unknown>)[field] = params[index] as never
      })
      return [{ ...acceptancePlan }]
    }

    if (normalized === 'select id from tasks where preceding_task_id = ? and project_id = ?') {
      return []
    }

    if (normalized === 'select condition_id from task_preceding_relations where task_id = ?') {
      return [{ condition_id: conditionId }]
    }

    if (normalized.startsWith('select id, task_id from task_conditions where id in')) {
      return [{ id: conditionId, task_id: dependentTaskId }]
    }

    if (normalized.startsWith('select id, task_id from task_conditions where task_id in')) {
      return []
    }

    if (normalized.startsWith('update task_conditions set is_satisfied = true')) {
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
    { id: 'm-1', project_id: projectId, user_id: 'owner-1', permission_level: 'owner', joined_at: '2026-04-01T00:00:00.000Z' },
    { id: 'm-2', project_id: projectId, user_id: 'editor-1', permission_level: 'editor', joined_at: '2026-04-01T00:00:00.000Z' },
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

  const reset = () => {
    notifications.splice(0, notifications.length)
    drawing.version = 'V1'
    drawing.version_no = 'V1'
    drawing.updated_at = '2026-04-15 08:00:00'
    acceptancePlan.status = 'submitted'
    acceptancePlan.updated_at = '2026-04-15T00:00:00.000Z'
    executeSQLOne.mockClear()
    executeSQL.mockClear()
    databaseQuery.mockClear()
    getMembers.mockClear()
    getTask.mockClear()
    updateTask.mockClear()
    supabaseService.getTask.mockClear()
    supabaseService.updateTask.mockClear()
    notificationStore.listNotifications.mockClear()
    notificationStore.findNotification.mockClear()
    notificationStore.insertNotification.mockClear()
    notificationStore.updateNotificationById.mockClear()
    notificationStore.updateNotificationsByIds.mockClear()
    notificationStore.deleteNotificationById.mockClear()
  }

  return {
    ids: { projectId, drawingId, taskId, dependentTaskId, conditionId, planId },
    notifications,
    executeSQLOne,
    executeSQL,
    databaseQuery,
    getMembers,
    getTask,
    updateTask,
    supabaseService,
    notificationStore,
    closeDelaySourceRisksForCompletedTask,
    planningGovernanceService,
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

vi.mock('../auth/access.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../auth/access.js')>()
  return {
    ...actual,
    canAccessProject: vi.fn(async (_userId: string, projectId: string) => projectId === state.ids.projectId),
    getCurrentCompanyMembership: vi.fn(async () => null),
    getVisibleProjectIds: vi.fn(async () => [state.ids.projectId]),
  }
})

vi.mock('../database.js', () => ({
  query: state.databaseQuery,
  isDatabaseTransactionActive: vi.fn(() => false),
  withDatabaseTransaction: vi.fn(async (work: () => Promise<unknown>) => await work()),
  registerDatabasePostCommitEffect: vi.fn(async (_label: string, effect: () => Promise<void>) => await effect()),
}))

vi.mock('../services/dbService.js', () => ({
  executeSQLOne: state.executeSQLOne,
  executeSQL: state.executeSQL,
  getMembers: state.getMembers,
  getTask: state.getTask,
  recordTaskProgressSnapshot: vi.fn(async () => undefined),
  updateTask: state.updateTask,
  supabase: {
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
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        upsert: vi.fn(async () => ({ data: null, error: null })),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        then: vi.fn((resolve: any) => resolve({ data: [], error: null })),
      }
    }),
  },
}))

vi.mock('../services/engineeringObjectService.js', () => ({
  hasAnyScopeObjectId: vi.fn((task: Record<string, unknown>) => Boolean(
    task.engineering_object_id
    || task.phase_object_id
    || task.section_object_id
    || task.building_object_id
    || task.basement_object_id
    || task.floor_object_id
    || task.physical_zone_object_id
    || task.functional_area_object_id,
  )),
  validateScopeObjectTypes: vi.fn(async () => null),
  validateTaskScopeConsistency: vi.fn(async () => null),
}))

vi.mock('../services/taskCodeTransactionService.js', () => ({
  rejectTaskCodeFields: vi.fn(() => null),
  createTaskWithCodeInTransaction: vi.fn(),
  updateTaskWithCodeInTransaction: vi.fn(async (taskId: string, updates: Record<string, unknown>) => ({
    task: await state.updateTask(taskId, updates),
    taskCode: 'TASK-001',
  })),
}))

vi.mock('../services/notificationStore.js', () => ({
  listNotifications: state.notificationStore.listNotifications,
  findNotification: state.notificationStore.findNotification,
  insertNotification: state.notificationStore.insertNotification,
  updateNotificationById: state.notificationStore.updateNotificationById,
  updateNotificationsByIds: state.notificationStore.updateNotificationsByIds,
  deleteNotificationById: state.notificationStore.deleteNotificationById,
}))

vi.mock('../services/warningChainService.js', () => ({
  persistNotification: vi.fn(async (notification: Record<string, any>) => {
    return await state.notificationStore.insertNotification(notification)
  }),
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
    generateNotifications: vi.fn(async () => []),
    syncConditionExpiredIssues: vi.fn(async () => undefined),
    syncAcceptanceExpiredIssues: vi.fn(async () => undefined),
    autoEscalateWarnings: vi.fn(async () => undefined),
    autoEscalateRisksToIssues: vi.fn(async () => undefined),
    syncActiveWarnings: vi.fn(async () => undefined),
  })),
}))

vi.mock('../services/systemAnomalyService.js', () => ({
  SystemAnomalyService: vi.fn().mockImplementation(() => ({
    enqueuePassiveReorderDetection: vi.fn(async () => undefined),
  })),
}))

vi.mock('../services/planningGovernanceService.js', () => ({
  planningGovernanceService: state.planningGovernanceService,
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
  clearDrawingBoardCache: vi.fn(() => undefined),
}))

vi.mock('../routes/drawing-review-rules.js', () => ({
  registerDrawingReviewRuleRoutes: vi.fn(() => undefined),
}))

const { default: constructionDrawingsRouter } = await import('../routes/construction-drawings.js')
const { default: acceptancePlansRouter } = await import('../routes/acceptance-plans.js')
const { default: tasksRouter } = await import('../routes/tasks.js')
const { default: notificationsRouter } = await import('../routes/notifications.js')

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/projects/:projectId/construction-drawings', constructionDrawingsRouter)
  app.use('/api/acceptance-plans', acceptancePlansRouter)
  app.use('/api/tasks', tasksRouter)
  app.use('/api/notifications', notificationsRouter)
  app.use((error: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(500).json({ success: false, error: { message: error?.message ?? 'unknown error' } })
  })
  return app
}

describe('workflow notification center chain', () => {
  beforeEach(() => {
    state.reset()
    vi.clearAllMocks()
  })

  it('exposes drawing version update notifications in the notification center', async () => {
    const request = supertest(buildApp())

    await request
      .put(`/api/projects/${state.ids.projectId}/construction-drawings/${state.ids.drawingId}`)
      .send({ version: 'V2', lock_version: 1, drawing_name: '总平面图' })
      .expect(200)

    const response = await request.get(`/api/notifications?projectId=${state.ids.projectId}`)

    expect(response.status).toBe(200)
    expect(response.body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'drawing_version_updated',
          notification_type: 'flow-reminder',
          source_entity_type: 'drawing_version',
          message: expect.any(String),
          body: expect.any(String),
        }),
      ]),
    )
  })

  it('exposes acceptance status change notifications in the notification center', async () => {
    const request = supertest(buildApp())

    await request
      .patch(`/api/acceptance-plans/${state.ids.planId}/status`)
      .send({ status: 'passed', actual_date: '2026-04-16' })
      .expect(200)

    const response = await request.get(`/api/notifications?projectId=${state.ids.projectId}`)

    expect(response.status).toBe(200)
    expect(response.body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'acceptance_status_changed',
          notification_type: 'flow-reminder',
          source_entity_type: 'acceptance_plan',
          source_entity_id: state.ids.planId,
        }),
      ]),
    )
  })

  it('exposes auto-satisfied condition notifications in the notification center', async () => {
    const request = supertest(buildApp())

    await request
      .put(`/api/tasks/${state.ids.taskId}`)
      .send({ version: 1, progress: 100 })
      .expect(200)

    const response = await request.get(`/api/notifications?projectId=${state.ids.projectId}`)

    expect(response.status).toBe(200)
    expect(response.body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'condition_auto_satisfied',
          notification_type: 'flow-reminder',
          source_entity_type: 'task_condition',
          source_entity_id: state.ids.conditionId,
          task_id: state.ids.dependentTaskId,
        }),
      ]),
    )
  })

  it('exposes task assignment change notifications in the notification center', async () => {
    const request = supertest(buildApp())

    await request
      .put(`/api/tasks/${state.ids.taskId}`)
      .send({
        version: 1,
        assignee: '李四',
        assignee_name: '李四',
        assignee_user_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      })
      .expect(200)

    const response = await request.get(`/api/notifications?projectId=${state.ids.projectId}`)

    expect(response.status).toBe(200)
    expect(response.body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'task_assignment_changed',
          notification_type: 'flow-reminder',
          source_entity_type: 'task',
          recipients: ['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'],
        }),
      ]),
    )
  })

  it('serves persisted planning governance notifications without refreshing them on read', async () => {
    await state.notificationStore.insertNotification({
      id: 'notification-governance-1',
      project_id: state.ids.projectId,
      type: 'planning_gov_mapping_orphan_pointer',
      notification_type: 'planning-governance-mapping',
      category: 'planning_mapping_orphan',
      severity: 'critical',
      title: '规划映射存在孤立指针',
      content: '映射孤立指针 2 条。',
      is_read: false,
      source_entity_type: 'planning_governance',
      source_entity_id: `${state.ids.projectId}:mapping_orphan_pointer`,
      created_at: '2026-04-18T00:00:00.000Z',
    })

    const request = supertest(buildApp())
    const response = await request.get(`/api/notifications?projectId=${state.ids.projectId}`)

    expect(response.status).toBe(200)
    expect(state.planningGovernanceService.persistProjectGovernanceNotifications).not.toHaveBeenCalled()
    expect(response.body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'planning_gov_mapping_orphan_pointer',
          notification_type: 'planning-governance-mapping',
          category: 'planning_mapping_orphan',
        }),
      ]),
    )
  })
})
