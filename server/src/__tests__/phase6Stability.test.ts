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
    task_delay_history: [],
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
      then: (resolve: (value: any) => void, reject: (reason?: any) => void) =>
        Promise.resolve({ data: supabaseTables[table] || [], error: null }).then(resolve, reject),
    }
    return query
  }

  return {
    conditionStore,
    obstacleStore,
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

      if (sql.includes('update task_conditions set')) {
        const id = params[params.length - 1]
        const current = conditionStore.get(id)
        if (current) {
          let p = 1
          if (sql.includes('name = ?')) current.name = params[p++]
          if (sql.includes('condition_type = ?')) current.condition_type = params[p++]
          if (sql.includes('description = ?')) current.description = params[p++]
          if (sql.includes('target_date = ?')) current.target_date = params[p++]
          if (sql.includes('is_satisfied = ?')) current.is_satisfied = Boolean(params[p++])
          if (sql.includes('attachments = ?')) current.attachments = params[p++]
          if (sql.includes('confirmed_by = ?')) current.confirmed_by = params[p++]
          if (sql.includes('confirmed_at = ?')) current.confirmed_at = params[p++]
          current.updated_at = params[0]
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
        const [id, taskId, projectId, obstacleType, description, status, severity, resolution, resolvedBy, resolvedAt, createdBy, createdAt, updatedAt] = params
        obstacleStore.set(id, {
          id,
          task_id: taskId,
          project_id: projectId,
          obstacle_type: obstacleType,
          description,
          status,
          severity,
          resolution,
          resolved_by: resolvedBy,
          resolved_at: resolvedAt,
          created_by: createdBy,
          created_at: createdAt,
          updated_at: updatedAt,
        })
        return { affectedRows: 1 }
      }

      if (sql.includes('update task_obstacles set')) {
        const id = params[params.length - 1]
        const current = obstacleStore.get(id)
        if (current) {
          let p = 1
          if (sql.includes('obstacle_type = ?')) current.obstacle_type = params[p++]
          if (sql.includes('description = ?')) current.description = params[p++]
          if (sql.includes('status = ?')) current.status = params[p++]
          if (sql.includes('severity = ?')) current.severity = params[p++]
          if (sql.includes('resolution = ?')) current.resolution = params[p++]
          if (sql.includes('resolved_by = ?')) current.resolved_by = params[p++]
          if (sql.includes('resolved_at = ?')) current.resolved_at = params[p++]
          current.updated_at = params[0]
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
        return conditionStore.get(id) || null
      }

      if (sql.includes('select project_id from task_conditions')) {
        const current = conditionStore.get(id)
        return current ? { project_id: current.project_id } : null
      }

      if (sql.includes('select * from task_obstacles')) {
        return obstacleStore.get(id) || null
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
  executeSQL: mocks.executeSQL,
  executeSQLOne: mocks.executeSQLOne,
  supabase: mocks.supabase,
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
      is_satisfied: false,
    })
    expect(conditionCreate.status).toBe(201)
    expect(conditionCreate.body.success).toBe(true)

    const conditionUpdate = await request.put(`/api/task-conditions/${conditionCreate.body.data.id}`).send({
      description: '钢筋已全部到场',
      is_satisfied: true,
    })
    expect(conditionUpdate.status).toBe(200)
    expect(conditionUpdate.body.success).toBe(true)

    const obstacleCreate = await request.post('/api/task-obstacles').send({
      project_id: projectId,
      task_id: taskId,
      title: '材料未到',
      obstacle_type: 'material',
      severity: '中',
      status: 'pending',
    })
    expect(obstacleCreate.status).toBe(201)
    expect(obstacleCreate.body.success).toBe(true)

    const obstacleUpdate = await request.put(`/api/task-obstacles/${obstacleCreate.body.data.id}`).send({
      status: 'resolved',
      resolution: '已协调到货',
      resolved_by: 'test-user-id',
    })
    expect(obstacleUpdate.status).toBe(200)
    expect(obstacleUpdate.body.success).toBe(true)

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
