import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const conditionStore = new Map<string, any>()
  const obstacleStore = new Map<string, any>()

  const timelineEvents = [
    {
      id: 'evt-1',
      kind: 'task',
      title: '主结构施工已完成',
      description: '持久化时间线事件',
      occurredAt: '2026-04-10T08:00:00.000Z',
      taskId: '22222222-2222-4222-8222-222222222222',
      statusLabel: '已完成',
    },
  ]

  const supabaseTables: Record<string, any[]> = {
    projects: [{ owner_id: 'test-user-id' }],
    milestones: [
      {
        id: '11111111-1111-4111-8111-111111111111',
        title: '主体封顶',
        status: 'completed',
        target_date: '2026-05-01',
        completed_at: '2026-04-28',
      },
    ],
    tasks: [
      {
        id: '22222222-2222-4222-8222-222222222222',
        title: '主体结构施工',
        assignee: '张三',
        assignee_unit: '总包',
        status: 'completed',
        start_date: '2026-04-01',
        end_date: '2026-04-10',
        progress: 100,
        is_milestone: true,
        updated_at: '2026-04-10T08:00:00.000Z',
      },
    ],
    task_milestones: [
      {
        task_id: '22222222-2222-4222-8222-222222222222',
        milestone_id: '11111111-1111-4111-8111-111111111111',
      },
    ],
  }

  const createQuery = (table: string) => {
    const query: any = {
      select: () => query,
      eq: () => query,
      order: () => query,
      in: () => query,
      gte: () => query,
      lte: () => query,
      not: () => query,
      limit: () => query,
      insert: (row: Record<string, unknown>) => {
        if (table === 'task_conditions') {
          conditionStore.set(String(row.id ?? ''), { ...row })
        }
        return Promise.resolve({ data: null, error: null })
      },
      then: (resolve: (value: any) => void, reject: (reason?: any) => void) =>
        Promise.resolve({ data: supabaseTables[table] || [], error: null }).then(resolve, reject),
    }
    return query
  }

  return {
    conditionStore,
    obstacleStore,
    writeLog: vi.fn(async (..._args: any[]) => undefined),
    executeSQL: vi.fn(async (query: string, params: any[] = []) => {
      const sql = query.toLowerCase()

      if (sql.includes('insert into task_conditions')) {
        const [id, taskId, projectId, conditionType, name, description, responsibleUnit, targetDate, isSatisfied, attachments, confirmedBy, confirmedAt, createdBy, createdAt, updatedAt] = params
        conditionStore.set(id, {
          id,
          task_id: taskId,
          project_id: projectId,
          condition_type: conditionType,
          name,
          description,
          responsible_unit: responsibleUnit,
          target_date: targetDate,
          is_satisfied: isSatisfied,
          attachments,
          confirmed_by: confirmedBy,
          confirmed_at: confirmedAt,
          created_by: createdBy,
          created_at: createdAt,
          updated_at: updatedAt,
        })
        return { affectedRows: 1 }
      }

      if (sql.replace(/\s+/g, ' ').includes('update task_conditions set')) {
        const id = params[params.length - 2]
        const current = conditionStore.get(id)
        if (current) {
          const [
            name,
            conditionType,
            description,
            drawingPackageId,
            drawingPackageCode,
            participantUnitId,
            targetDate,
            isSatisfied,
            satisfiedReason,
            satisfiedReasonNote,
            attachments,
            confirmedBy,
            confirmedAt,
            updatedAt,
          ] = params
          current.name = name
          current.condition_type = conditionType
          current.description = description
          current.drawing_package_id = drawingPackageId
          current.drawing_package_code = drawingPackageCode
          current.participant_unit_id = participantUnitId
          current.target_date = targetDate
          current.is_satisfied = Boolean(isSatisfied)
          current.satisfied_reason = satisfiedReason
          current.satisfied_reason_note = satisfiedReasonNote
          current.attachments = attachments
          current.confirmed_by = confirmedBy
          current.confirmed_at = confirmedAt
          current.updated_at = updatedAt
          conditionStore.set(id, current)
        }
        return { affectedRows: 1 }
      }

      if (sql.includes('delete from task_conditions')) {
        const id = params[0]
        conditionStore.delete(id)
        return { affectedRows: 1 }
      }

      if (sql.includes('insert into task_obstacles')) {
        const [
          id,
          taskId,
          projectId,
          obstacleType,
          description,
          status,
          severity,
          severityEscalatedAt,
          severityManuallyOverridden,
          resolution,
          resolvedBy,
          resolvedAt,
          estimatedResolveDate,
          notes,
          createdBy,
          createdAt,
          updatedAt,
        ] = params
        obstacleStore.set(id, {
          id,
          task_id: taskId,
          project_id: projectId,
          obstacle_type: obstacleType,
          description,
          status,
          severity,
          severity_escalated_at: severityEscalatedAt,
          severity_manually_overridden: severityManuallyOverridden,
          resolution,
          resolved_by: resolvedBy,
          resolved_at: resolvedAt,
          estimated_resolve_date: estimatedResolveDate,
          notes,
          created_by: createdBy,
          created_at: createdAt,
          updated_at: updatedAt,
        })
        return { affectedRows: 1 }
      }

      if (sql.replace(/\s+/g, ' ').includes('update task_obstacles set')) {
        const id = params[params.length - 2]
        const current = obstacleStore.get(id)
        if (current) {
          const [
            obstacleType,
            description,
            status,
            severity,
            severityManuallyOverridden,
            estimatedResolveDate,
            notes,
            resolution,
            resolvedBy,
            resolvedAt,
            updatedAt,
          ] = params
          current.obstacle_type = obstacleType
          current.description = description
          current.status = status
          current.severity = severity
          current.severity_manually_overridden = severityManuallyOverridden
          current.estimated_resolve_date = estimatedResolveDate
          current.notes = notes
          current.resolution = resolution
          current.resolved_by = resolvedBy
          current.resolved_at = resolvedAt
          current.updated_at = updatedAt
          obstacleStore.set(id, current)
        }
        return { affectedRows: 1 }
      }

      if (sql.includes('delete from task_obstacles')) {
        const id = params[0]
        obstacleStore.delete(id)
        return { affectedRows: 1 }
      }

      if (sql.includes('select id from task_timeline_events')) {
        return [{ id: 'evt-1' }]
      }

      return []
    }),
    executeSQLOne: vi.fn(async (query: string, params: any[] = []) => {
      const sql = query.toLowerCase()
      const id = params[0]

      if (sql.includes('select * from task_conditions')) {
        const current = conditionStore.get(id)
        return current ? { ...current } : null
      }

      if (sql.includes('select id, project_id, is_satisfied')) {
        const current = conditionStore.get(id)
        return current
          ? {
            id: current.id,
            project_id: current.project_id,
            is_satisfied: current.is_satisfied,
            satisfied_reason: current.satisfied_reason ?? null,
            satisfied_reason_note: current.satisfied_reason_note ?? null,
          }
          : null
      }

      if (sql.includes('select project_id from task_conditions')) {
        const current = conditionStore.get(id)
        return current ? { project_id: current.project_id } : null
      }

      if (sql.includes('select id, project_id, status from task_obstacles')) {
        const current = obstacleStore.get(id)
        return current ? { id: current.id, project_id: current.project_id, status: current.status } : null
      }

      if (sql.includes('from task_obstacles where id = ?')) {
        const current = obstacleStore.get(id)
        return current ? { ...current } : null
      }

      if (sql.includes('select project_id from task_obstacles')) {
        const current = obstacleStore.get(id)
        return current ? { project_id: current.project_id } : null
      }

      if (sql.includes('select project_id from tasks')) {
        return { project_id: '33333333-3333-4333-8333-333333333333' }
      }

      return null
    }),
    supabase: {
      from: (table: string) => createQuery(table),
    },
    createRisk: vi.fn(async (payload: any) => ({
      id: 'risk-1',
      version: 1,
      ...payload,
    })),
    updateRisk: vi.fn(async (id: string, updates: any) => ({
      id,
      version: 2,
      ...updates,
    })),
    deleteRisk: vi.fn(async () => true),
    getRisks: vi.fn(async () => []),
    timelineReady: vi.fn(async () => true),
    getProjectTimelineEvents: vi.fn(async () => timelineEvents),
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    },
  }
})

vi.mock('../services/dbService.js', () => ({
  registerDbServiceBusinessSideEffectAdapters: vi.fn(),
  assertDbServiceBusinessSideEffectAdaptersRegistered: vi.fn(),
  executeSQL: mocks.executeSQL,
  executeSQLOne: mocks.executeSQLOne,
  supabase: mocks.supabase,
  SupabaseService: vi.fn().mockImplementation(() => ({
    query: vi.fn(async () => []),
    create: vi.fn(async (_table: string, payload: Record<string, unknown>) => payload),
    update: vi.fn(async (_table: string, _id: string, payload: Record<string, unknown>) => payload),
    delete: vi.fn(async () => undefined),
  })),
}))

vi.mock('../services/supabaseService.js', () => ({
  SupabaseService: vi.fn().mockImplementation(() => ({
    getRisks: mocks.getRisks,
    createRisk: mocks.createRisk,
    updateRisk: mocks.updateRisk,
    deleteRisk: mocks.deleteRisk,
  })),
}))

vi.mock('../services/taskTimelineService.js', () => ({
  isTaskTimelineEventStoreReady: mocks.timelineReady,
  getProjectTimelineEvents: mocks.getProjectTimelineEvents,
}))

vi.mock('../middleware/logger.js', () => ({
  logger: mocks.logger,
  requestLogger: (_req: unknown, _res: unknown, next: () => void) => next(),
}))

vi.mock('../services/changeLogs.js', () => ({
  writeLog: mocks.writeLog,
  writeLifecycleLog: vi.fn(async (params: Record<string, any>) => {
      await (mocks.writeLog as any)({
      entity_type: params.entity_type,
      entity_id: params.entity_id,
      field_name: 'lifecycle',
      new_value: params.action,
      changed_by: params.changed_by ?? null,
      change_source: params.change_source ?? 'manual_adjusted',
    })
  }),
  writeStatusTransitionLog: vi.fn(async (params: Record<string, any>) => {
      await (mocks.writeLog as any)({
      entity_type: params.entity_type,
      entity_id: params.entity_id,
      field_name: 'status',
      old_value: params.old_status ?? null,
      new_value: params.new_status,
      changed_by: params.changed_by ?? null,
      change_source: params.change_source ?? 'manual_adjusted',
    })
  }),
}))

vi.mock('../services/warningService.js', () => ({
  WarningService: vi.fn().mockImplementation(() => ({
    evaluate: vi.fn(async () => []),
  })),
}))

vi.mock('../services/projectHealthService.js', () => ({
  enqueueProjectHealthUpdate: vi.fn(),
}))

vi.mock('../services/taskConstraintGovernanceService.js', () => ({
  evaluateTaskConstraint: vi.fn(async () => null),
}))

vi.mock('../middleware/auth.js', () => ({
  authenticate: vi.fn((req: any, _res: any, next: () => void) => {
    req.user = { id: 'test-user-id', role: 'owner', globalRole: 'company_admin' }
    next()
  }),
  optionalAuthenticate: vi.fn((_req: any, _res: any, next: () => void) => next()),
  requireProjectMember: vi.fn(() => (_req: any, _res: any, next: () => void) => next()),
  requireProjectEditor: vi.fn(() => (_req: any, _res: any, next: () => void) => next()),
  requireProjectOwner: vi.fn(() => (_req: any, _res: any, next: () => void) => next()),
  getAuthorizedRequestProjectId: vi.fn(() => '33333333-3333-4333-8333-333333333333'),
  checkResourceAccess: vi.fn((_req: any, _res: any, next: () => void) => next()),
}))

import { request } from './testSetup.js'

describe('phase 6 stability smoke', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.conditionStore.clear()
    mocks.obstacleStore.clear()
  })

  it('keeps the core save chain and task summary path healthy', async () => {
    const projectId = '33333333-3333-4333-8333-333333333333'
    const taskId = '22222222-2222-4222-8222-222222222222'

    const conditionCreate = await request.post('/api/task-conditions').send({
      project_id: projectId,
      task_id: taskId,
      condition_name: '材料到场',
      condition_type: 'material',
      description: '钢筋已到场',
      target_date: '2026-05-01',
      is_satisfied: false,
    })
    expect(conditionCreate.status).toBe(201)
    expect(conditionCreate.body.success).toBe(true)

    const conditionUpdate = await request.put(`/api/task-conditions/${conditionCreate.body.data.id}`).send({
      description: '钢筋已全部到场',
      target_date: '2026-05-02',
      is_satisfied: true,
      evil_column: 'should-not-be-a-column',
    })
    expect(conditionUpdate.status).toBe(200)
    expect(conditionUpdate.body.success).toBe(true)
    const conditionUpdateCall = mocks.executeSQL.mock.calls.find(([sql]) => (
      String(sql).replace(/\s+/g, ' ').trim().toLowerCase().includes('update task_conditions set')
    ))
    expect(conditionUpdateCall).toBeTruthy()
    expect(String(conditionUpdateCall?.[0])).not.toContain('evil_column')
    expect(String(conditionUpdateCall?.[0])).toContain('name = ?')
    expect(String(conditionUpdateCall?.[0])).toContain('participant_unit_id = ?')
    expect(String(conditionUpdateCall?.[0])).toContain('updated_at = ?')
    expect(mocks.writeLog).toHaveBeenCalledWith(expect.objectContaining({
      entity_type: 'task_condition',
      field_name: 'lifecycle',
      new_value: 'created',
    }))
    expect(mocks.writeLog).toHaveBeenCalledWith(expect.objectContaining({
      entity_type: 'task_condition',
      field_name: 'status',
      new_value: '已确认',
    }))

    const obstacleCreate = await request.post('/api/task-obstacles').send({
      project_id: projectId,
      task_id: taskId,
      description: '材料未到',
      obstacle_type: 'material',
      severity: '中',
      status: 'pending',
      expected_resolution_date: '2026-04-08',
      resolution_notes: '等待供应商补货',
    })
    expect(obstacleCreate.status).toBe(201)
    expect(obstacleCreate.body.success).toBe(true)
    expect(obstacleCreate.body.data.expected_resolution_date).toBe('2026-04-08')
    expect(obstacleCreate.body.data.resolution_notes).toBe('等待供应商补货')

    const obstacleUpdate = await request.put(`/api/task-obstacles/${obstacleCreate.body.data.id}`).send({
      status: 'resolved',
      resolution: '已协调到货',
      resolved_by: 'test-user-id',
      expected_resolution_date: '2026-04-09',
      resolution_notes: '现场已完成协调',
      evil_column: 'should-not-be-a-column',
    })
    expect(obstacleUpdate.status).toBe(200)
    expect(obstacleUpdate.body.success).toBe(true)
    expect(obstacleUpdate.body.data.expected_resolution_date).toBe('2026-04-09')
    expect(obstacleUpdate.body.data.resolution_notes).toBe('现场已完成协调')
    const obstacleUpdateCall = mocks.executeSQL.mock.calls.find(([sql]) => (
      String(sql).replace(/\s+/g, ' ').trim().toLowerCase().includes('update task_obstacles set')
    ))
    expect(obstacleUpdateCall).toBeTruthy()
    expect(String(obstacleUpdateCall?.[0])).not.toContain('evil_column')
    expect(String(obstacleUpdateCall?.[0])).toContain('status = ?')
    expect(String(obstacleUpdateCall?.[0])).toContain('estimated_resolve_date = ?')
    expect(String(obstacleUpdateCall?.[0])).toContain('updated_at = ?')
    expect(mocks.writeLog).toHaveBeenCalledWith(expect.objectContaining({
      entity_type: 'task_obstacle',
      field_name: 'lifecycle',
      new_value: 'created',
    }))
    expect(mocks.writeLog).toHaveBeenCalledWith(expect.objectContaining({
      entity_type: 'task_obstacle',
      field_name: 'status',
      new_value: '已解决',
    }))

    const riskCreate = await request.post('/api/risks').send({
      project_id: projectId,
      title: '工期偏移风险',
      description: '关键节点可能延后',
      level: 'medium',
      status: 'identified',
      probability: 50,
      impact: 60,
      risk_category: 'progress',
      task_id: taskId,
    })
    expect(riskCreate.status).toBe(201)
    expect(riskCreate.body.success).toBe(true)

    const summaryResponse = await request.get(`/api/task-summaries/projects/${projectId}/task-summary`)
    expect(summaryResponse.status).toBe(200)
    expect(summaryResponse.body.success).toBe(true)
    expect(summaryResponse.body.data.timeline_ready).toBe(true)
    expect(summaryResponse.body.data.timeline_events).toHaveLength(1)
    expect(summaryResponse.body.data.stats.total_completed).toBe(1)
  })
})
