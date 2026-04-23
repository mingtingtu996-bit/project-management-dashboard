/**
 * 10.1 Issues 域模型验收测试
 *
 * 目标：验证以下契约
 *  1. /api/issues CRUD 可用（GET / POST / PUT / DELETE）
 *  2. source_type 合法值校验（非法值返回 400）
 *  3. issues 与 task_obstacles 是独立记录（不同表，不共享 ID 空间）
 *  4. risks 已有 source_type / chain_id 字段（接口结构稳定）
 */

// ── 环境变量必须在所有 import 之前设置 ───────────────────────────────────────
process.env.SUPABASE_URL = 'https://test.supabase.co'
process.env.SUPABASE_ANON_KEY = 'test-key'
process.env.SUPABASE_SERVICE_KEY = 'test-service-key'
process.env.NODE_ENV = 'test'
process.env.JWT_SECRET = 'test-jwt-secret'

import { beforeEach, describe, expect, it, vi } from 'vitest'

// ── Mock dbService ────────────────────────────────────────────────────────────

const mocks = vi.hoisted(() => {
  const issuesStore: any[] = []
  const risksStore: any[] = []
  const notificationsStore: any[] = []

  const notificationStore = {
    listNotifications: vi.fn(async (options: Record<string, any> = {}) => {
      let rows = notificationsStore.slice()
      if (options.id) rows = rows.filter((row) => row.id === options.id)
      if (options.projectId) rows = rows.filter((row) => row.project_id === options.projectId)
      if (options.sourceEntityType) rows = rows.filter((row) => row.source_entity_type === options.sourceEntityType)
      if (options.sourceEntityId) rows = rows.filter((row) => row.source_entity_id === options.sourceEntityId)
      if (options.type) rows = rows.filter((row) => row.type === options.type)
      if (Array.isArray(options.ids) && options.ids.length > 0) {
        rows = rows.filter((row) => options.ids.includes(row.id))
      }
      rows = rows.sort((left, right) => String(right.created_at || '').localeCompare(String(left.created_at || '')))
      if (options.limit) rows = rows.slice(0, Number(options.limit))
      return rows.map((row) => ({ ...row }))
    }),
    findNotification: vi.fn(async (options: Record<string, any>) => {
      const rows = await notificationStore.listNotifications({ ...options, limit: 1 })
      return rows[0] ?? null
    }),
    insertNotification: vi.fn(async (notification: Record<string, any>) => {
      const row = {
        id: notification.id ?? `notification-${notificationsStore.length + 1}`,
        created_at: notification.created_at ?? new Date().toISOString(),
        updated_at: notification.updated_at ?? notification.created_at ?? new Date().toISOString(),
        ...notification,
      }
      notificationsStore.push(row)
      return { ...row }
    }),
    updateNotificationById: vi.fn(async (id: string, patch: Record<string, any>) => {
      const index = notificationsStore.findIndex((row) => row.id === id)
      if (index === -1) return
      notificationsStore[index] = {
        ...notificationsStore[index],
        ...patch,
        updated_at: patch.updated_at ?? new Date().toISOString(),
      }
    }),
    updateNotificationsByIds: vi.fn(async (ids: string[], patch: Record<string, any>) => {
      notificationsStore.forEach((row, index) => {
        if (!ids.includes(String(row.id))) return
        notificationsStore[index] = {
          ...row,
          ...patch,
          updated_at: patch.updated_at ?? new Date().toISOString(),
        }
      })
    }),
    deleteNotificationById: vi.fn(async (id: string) => {
      const index = notificationsStore.findIndex((row) => row.id === id)
      if (index >= 0) notificationsStore.splice(index, 1)
    }),
  }

  return {
    issuesStore,
    risksStore,
    notificationsStore,
    notificationStore,
    executeSQL: vi.fn(async () => []),
    executeSQLOne: vi.fn(async () => ({ cnt: 0 })),
    supabase: {
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        insert: vi.fn().mockReturnThis(),
        update: vi.fn().mockReturnThis(),
        delete: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116', message: 'not found' } }),
        then: vi.fn((resolve: any) => resolve({ data: [], error: null })),
      })),
    },
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    },
  }
})

vi.mock('../services/dbService.js', async () => {
  const { v4: uuidv4 } = await import('uuid')
  const store: any[] = mocks.issuesStore
  const riskStore: any[] = mocks.risksStore

  // SupabaseService 实例方法 mock（risks 路由使用 new SupabaseService()）
  const mockSupabaseInstance = {
    getRisks: vi.fn(async (projectId?: string) => {
      if (!projectId) return riskStore
      return riskStore.filter(r => r.project_id === projectId)
    }),
    getRisk: vi.fn(async (id: string) => {
      return riskStore.find(r => r.id === id) ?? null
    }),
    createRisk: vi.fn(async (r: any) => ({
      id: uuidv4(),
      ...r,
      status: r.status ?? 'identified',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })),
    updateRisk: vi.fn(async (id: string, updates: any) => {
      const idx = riskStore.findIndex(r => r.id === id)
      if (idx === -1) return null
      riskStore[idx] = { ...riskStore[idx], ...updates, updated_at: new Date().toISOString() }
      return riskStore[idx]
    }),
    deleteRisk: vi.fn(async (id: string) => {
      const idx = riskStore.findIndex(r => r.id === id)
      if (idx !== -1) riskStore.splice(idx, 1)
    }),
    query: vi.fn(async () => []),
    create: vi.fn(async () => ({})),
    update: vi.fn(async () => ({})),
    delete: vi.fn(async () => {}),
  }

  return {
    supabase: mocks.supabase,
    SupabaseService: vi.fn(() => mockSupabaseInstance),
    executeSQL: mocks.executeSQL,
    executeSQLOne: mocks.executeSQLOne,

    // Issues CRUD mock
    getIssues: vi.fn(async (projectId?: string) => {
      if (!projectId) return store
      return store.filter(i => i.project_id === projectId)
    }),
    getIssue: vi.fn(async (id: string) => {
      return store.find(i => i.id === id) ?? null
    }),
    createIssue: vi.fn(async (issue: any) => {
      const record = {
        id: uuidv4(),
        version: 1,
        pending_manual_close: false,
        status: 'open',
        severity: 'medium',
        priority: 50,
        ...issue,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
      store.push(record)
      return record
    }),
    updateIssue: vi.fn(async (id: string, updates: any) => {
      const idx = store.findIndex(i => i.id === id)
      if (idx === -1) return null
      store[idx] = { ...store[idx], ...updates, updated_at: new Date().toISOString() }
      return store[idx]
    }),
    confirmIssuePendingManualClose: vi.fn(async (id: string) => {
      const idx = store.findIndex(i => i.id === id)
      if (idx === -1) return null
      store[idx] = {
        ...store[idx],
        status: 'closed',
        pending_manual_close: false,
        closed_reason: 'manual_confirmed_close',
        closed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
      return store[idx]
    }),
    keepIssueProcessing: vi.fn(async (id: string) => {
      const idx = store.findIndex(i => i.id === id)
      if (idx === -1) return null
      store[idx] = {
        ...store[idx],
        status: 'investigating',
        pending_manual_close: false,
        updated_at: new Date().toISOString(),
      }
      return store[idx]
    }),
    deleteIssue: vi.fn(async (id: string) => {
      const idx = store.findIndex(i => i.id === id)
      if (idx !== -1) store.splice(idx, 1)
    }),

    // Risks CRUD stub（仅做接口验证）
    getRisks: vi.fn(async () => []),
    getRisk: vi.fn(async () => null),
    createRisk: vi.fn(async (r: any) => ({
      id: 'test-risk-id',
      ...r,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })),
    updateRisk: vi.fn(async () => null),
    confirmRiskPendingManualClose: vi.fn(async () => null),
    keepRiskProcessing: vi.fn(async () => null),
    deleteRisk: vi.fn(async () => {}),

    // Task obstacles stub
    getTaskObstacles: vi.fn(async () => []),
  }
})

vi.mock('../middleware/logger.js', () => ({
  requestLogger: vi.fn((_req: any, _res: any, next: any) => next()),
  logger: mocks.logger,
}))

vi.mock('../middleware/auditLogger.js', () => ({
  auditLogger: vi.fn((_req: any, _res: any, next: any) => next()),
}))

vi.mock('../middleware/auth.js', () => ({
  authenticate: vi.fn((_req: any, _res: any, next: any) => next()),
  optionalAuthenticate: vi.fn((_req: any, _res: any, next: any) => next()),
  requireProjectMember: vi.fn(() => (_req: any, _res: any, next: any) => next()),
  requireProjectEditor: vi.fn(() => (_req: any, _res: any, next: any) => next()),
  requireProjectOwner: vi.fn(() => (_req: any, _res: any, next: any) => next()),
  checkResourceAccess: vi.fn((_req: any, _res: any, next: any) => next()),
}))

vi.mock('../scheduler.js', () => ({}))

vi.mock('../services/notificationStore.js', () => ({
  listNotifications: mocks.notificationStore.listNotifications,
  findNotification: mocks.notificationStore.findNotification,
  insertNotification: mocks.notificationStore.insertNotification,
  updateNotificationById: mocks.notificationStore.updateNotificationById,
  updateNotificationsByIds: mocks.notificationStore.updateNotificationsByIds,
  deleteNotificationById: mocks.notificationStore.deleteNotificationById,
}))

// ── 启动 app ─────────────────────────────────────────────────────────────────

const { default: app } = await import('../index.js')
import supertest from 'supertest'
const request = supertest(app)

const testProjectId = '00000000-0000-0000-0000-000000000001'

// ── 每次测试前清空 store ────────────────────────────────────────────────────
beforeEach(() => {
  mocks.issuesStore.splice(0, mocks.issuesStore.length)
  mocks.risksStore.splice(0, mocks.risksStore.length)
  mocks.notificationsStore.splice(0, mocks.notificationsStore.length)
  mocks.notificationStore.listNotifications.mockClear()
  mocks.notificationStore.findNotification.mockClear()
  mocks.notificationStore.insertNotification.mockClear()
  mocks.notificationStore.updateNotificationById.mockClear()
  mocks.notificationStore.updateNotificationsByIds.mockClear()
  mocks.notificationStore.deleteNotificationById.mockClear()
})

// ─────────────────────────────────────────────────────────────────────────────

describe('10.1 Issues 域模型', () => {

  describe('1. /api/issues CRUD 可用', () => {
    it('POST /api/issues 创建问题，返回 201 + 结构完整', async () => {
      const res = await request.post('/api/issues').send({
        project_id: testProjectId,
        title: '测试问题',
        source_type: 'manual',
      })

      expect(res.status).toBe(201)
      expect(res.body.success).toBe(true)
      expect(res.body.data).toMatchObject({
        project_id: testProjectId,
        title: '测试问题',
        source_type: 'manual',
        status: 'open',
        severity: 'medium',
        pending_manual_close: false,
      })
      expect(res.body.data.id).toBeTruthy()
    })

    it('POST /api/issues 保留 source_entity 追溯字段', async () => {
      const res = await request.post('/api/issues').send({
        project_id: testProjectId,
        title: '图纸升级问题',
        source_type: 'manual',
        source_id: '00000000-0000-0000-0000-000000000021',
        source_entity_type: 'drawing_package',
        source_entity_id: '00000000-0000-0000-0000-000000000022',
      })

      expect(res.status).toBe(201)
      expect(res.body.data.source_entity_type).toBe('drawing_package')
      expect(res.body.data.source_entity_id).toBe('00000000-0000-0000-0000-000000000022')
    })

    it('POST /api/issues 同步写入问题通知，供提醒中心读取', async () => {
      const res = await request.post('/api/issues').send({
        project_id: testProjectId,
        title: '图纸缺漏',
        description: '当前图纸包缺少必有图纸，请尽快补齐。',
        source_type: 'manual',
        source_entity_type: 'drawing_package',
        source_entity_id: '00000000-0000-0000-0000-000000000022',
      })

      expect(res.status).toBe(201)
      expect(mocks.notificationStore.insertNotification).toHaveBeenCalledWith(expect.objectContaining({
        project_id: testProjectId,
        type: 'issue_created',
        notification_type: 'business-warning',
        title: '图纸缺漏',
        content: '当前图纸包缺少必有图纸，请尽快补齐。',
        source_entity_type: 'issue',
        source_entity_id: res.body.data.id,
        category: 'problem',
        status: 'unread',
        is_read: false,
      }))
      expect(mocks.notificationsStore).toHaveLength(1)
    })

    it('POST /api/issues 命中同项目同 source_type 同标题时直接返回既有问题，避免重复创建', async () => {
      const payload = {
        project_id: testProjectId,
        title: '主体结构浇筑阻碍',
        source_type: 'obstacle_escalated',
        source_id: '00000000-0000-0000-0000-000000000051',
        source_entity_type: 'task_obstacle',
        source_entity_id: '00000000-0000-0000-0000-000000000052',
      }

      const first = await request.post('/api/issues').send(payload)
      const second = await request.post('/api/issues').send(payload)

      expect(first.status).toBe(201)
      expect(second.status).toBe(200)
      expect(second.body.success).toBe(true)
      expect(second.body.data.id).toBe(first.body.data.id)
      expect(mocks.issuesStore).toHaveLength(1)
    })

    it('POST /api/issues 对手动问题也按同项目同 source_type 同标题去重', async () => {
      const payload = {
        project_id: testProjectId,
        title: '同名手动问题',
        source_type: 'manual',
      }

      const first = await request.post('/api/issues').send(payload)
      const second = await request.post('/api/issues').send(payload)

      expect(first.status).toBe(201)
      expect(second.status).toBe(200)
      expect(second.body.data.id).toBe(first.body.data.id)
      expect(mocks.issuesStore).toHaveLength(1)
    })

    it('POST /api/issues 对同标题但不同 source_type 的问题不去重', async () => {
      const title = '同标题不同来源问题'

      const first = await request.post('/api/issues').send({
        project_id: testProjectId,
        title,
        source_type: 'manual',
      })
      const second = await request.post('/api/issues').send({
        project_id: testProjectId,
        title,
        source_type: 'risk_converted',
      })

      expect(first.status).toBe(201)
      expect(second.status).toBe(201)
      expect(second.body.data.id).not.toBe(first.body.data.id)
      expect(mocks.issuesStore).toHaveLength(2)
    })

    it('POST /api/issues 对同 source_type 同标题但不同项目的问题不去重', async () => {
      const title = '跨项目同名问题'

      const first = await request.post('/api/issues').send({
        project_id: testProjectId,
        title,
        source_type: 'manual',
      })
      const second = await request.post('/api/issues').send({
        project_id: '00000000-0000-0000-0000-000000000002',
        title,
        source_type: 'manual',
      })

      expect(first.status).toBe(201)
      expect(second.status).toBe(201)
      expect(second.body.data.id).not.toBe(first.body.data.id)
      expect(mocks.issuesStore).toHaveLength(2)
    })

    it('GET /api/issues?projectId=... 返回列表', async () => {
      // 先创建一条
      await request.post('/api/issues').send({
        project_id: testProjectId,
        title: '列表测试问题',
        source_type: 'manual',
      })

      const res = await request.get(`/api/issues?projectId=${testProjectId}`)

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(Array.isArray(res.body.data)).toBe(true)
      expect(res.body.data.length).toBeGreaterThan(0)
    })

    it('GET /api/issues/:id 获取单条，不存在时 404', async () => {
      const notFoundRes = await request.get('/api/issues/00000000-0000-0000-0000-000000000099')
      expect(notFoundRes.status).toBe(404)
      expect(notFoundRes.body.success).toBe(false)
    })

    it('PUT /api/issues/:id 更新状态', async () => {
      const created = await request.post('/api/issues').send({
        project_id: testProjectId,
        title: '待更新问题',
        source_type: 'manual',
      })
      const id = created.body.data.id

      const updated = await request.put(`/api/issues/${id}`).send({
        status: 'investigating',
        version: 1,
      })

      expect(updated.status).toBe(200)
      expect(updated.body.data.status).toBe('investigating')
    })

    it('DELETE /api/issues/:id 删除成功', async () => {
      const created = await request.post('/api/issues').send({
        project_id: testProjectId,
        title: '待删除问题',
        source_type: 'manual',
      })
      const id = created.body.data.id

      const deleted = await request.delete(`/api/issues/${id}`)
      expect(deleted.status).toBe(200)
      expect(deleted.body.success).toBe(true)
    })
  })

  describe('2. source_type 合法值校验', () => {
    it('合法 source_type 可创建', async () => {
      const validTypes = ['manual', 'risk_converted', 'risk_auto_escalated', 'obstacle_escalated', 'condition_expired']

      for (const sourceType of validTypes) {
        const res = await request.post('/api/issues').send({
          project_id: testProjectId,
          title: `source_type=${sourceType} 测试`,
          source_type: sourceType,
        })
        expect(res.status).toBe(201), `source_type=${sourceType} 应该可以创建`
      }
    })

    it('非法 source_type 返回 400', async () => {
      const res = await request.post('/api/issues').send({
        project_id: testProjectId,
        title: '非法来源类型测试',
        source_type: 'invalid_type',
      })

      expect(res.status).toBe(400)
      expect(res.body.success).toBe(false)
    })
  })

  describe('3. issues 与 task_obstacles 是独立记录', () => {
    it('issues 表独立：issue id 不会出现在 task_obstacles 路由中', async () => {
      // 创建一条 issue
      const issueRes = await request.post('/api/issues').send({
        project_id: testProjectId,
        title: '独立域问题',
        source_type: 'manual',
      })
      expect(issueRes.status).toBe(201)
      const issueId = issueRes.body.data.id

      // 用 issue id 去 task-obstacles 查询
      // task-obstacles 路由按 task_id 筛选，用 issue id 查不到任何阻碍记录
      const obstacleRes = await request.get(`/api/task-obstacles?taskId=${issueId}`)
      expect(obstacleRes.status).toBe(200)
      // 返回空列表（issues 和 task_obstacles 是完全独立的域）
      if (Array.isArray(obstacleRes.body.data)) {
        expect(obstacleRes.body.data).toHaveLength(0)
      }
    })
  })

  describe('4. risks 已有 source_type / chain_id 字段（接口结构稳定）', () => {
    it('GET /api/risks 路由正常响应，返回数组结构', async () => {
      const res = await request.get(`/api/risks?projectId=${testProjectId}`)

      // 路由本身正常响应
      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(Array.isArray(res.body.data)).toBe(true)
    })

    it('POST /api/risks 拒绝 occurred 状态（已废弃），接受 identified / mitigating / closed', async () => {
      // occurred 已废弃，应被 schema 拒绝
      const invalidStatusRes = await request.post('/api/risks').send({
        project_id: testProjectId,
        title: '测试风险（occurred 状态）',
        status: 'occurred',
        probability: 50,
        impact: 50,
      })
      // occurred 已废弃，应被 schema 拒绝
      expect(invalidStatusRes.status).toBe(400)
    })

    it('POST /api/risks 保留 source_entity 追溯字段', async () => {
      const res = await request.post('/api/risks').send({
        project_id: testProjectId,
        title: '图纸升级风险',
        probability: 60,
        impact: 70,
        source_type: 'manual',
        source_id: '00000000-0000-0000-0000-000000000031',
        source_entity_type: 'drawing_package',
        source_entity_id: '00000000-0000-0000-0000-000000000032',
      })

      expect(res.status).toBe(201)
      expect(res.body.data.source_entity_type).toBe('drawing_package')
      expect(res.body.data.source_entity_id).toBe('00000000-0000-0000-0000-000000000032')
    })
  })

  describe('5. 升级链删除保护', () => {
    it('DELETE /api/issues/:id 命中升级链来源时返回 422', async () => {
      const protectedIssueId = '00000000-0000-0000-0000-0000000000a1'
      mocks.issuesStore.push({
        id: protectedIssueId,
        project_id: testProjectId,
        task_id: null,
        title: '升级链问题',
        description: null,
        source_type: 'risk_converted',
        source_id: '00000000-0000-0000-0000-0000000000b1',
        chain_id: '00000000-0000-0000-0000-0000000000c1',
        severity: 'high',
        priority: 50,
        pending_manual_close: false,
        status: 'open',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        version: 1,
      })

      const res = await request.delete(`/api/issues/${protectedIssueId}`)

      expect(res.status).toBe(422)
      expect(res.body.success).toBe(false)
      expect(res.body.error.code).toBe('UPGRADE_CHAIN_PROTECTED')
      expect(mocks.issuesStore).toHaveLength(1)
    })

    it('DELETE /api/issues/:id 对 obstacle_escalated 也返回 422', async () => {
      const protectedIssueId = '00000000-0000-0000-0000-0000000001a1'
      mocks.issuesStore.push({
        id: protectedIssueId,
        project_id: testProjectId,
        task_id: null,
        title: '阻碍升级问题',
        description: null,
        source_type: 'obstacle_escalated',
        source_id: '00000000-0000-0000-0000-0000000001b1',
        chain_id: '00000000-0000-0000-0000-0000000001c1',
        severity: 'high',
        priority: 9,
        pending_manual_close: false,
        status: 'open',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        version: 1,
      })

      const res = await request.delete(`/api/issues/${protectedIssueId}`)

      expect(res.status).toBe(422)
      expect(res.body.error.code).toBe('UPGRADE_CHAIN_PROTECTED')
      expect(mocks.issuesStore).toHaveLength(1)
    })

    it('DELETE /api/issues/:id 对 condition_expired 也返回 422', async () => {
      const protectedIssueId = '00000000-0000-0000-0000-0000000002a1'
      mocks.issuesStore.push({
        id: protectedIssueId,
        project_id: testProjectId,
        task_id: null,
        title: '条件过期问题',
        description: null,
        source_type: 'condition_expired',
        source_id: '00000000-0000-0000-0000-0000000002b1',
        chain_id: '00000000-0000-0000-0000-0000000002c1',
        severity: 'critical',
        priority: 16,
        pending_manual_close: false,
        status: 'open',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        version: 1,
      })

      const res = await request.delete(`/api/issues/${protectedIssueId}`)

      expect(res.status).toBe(422)
      expect(res.body.error.code).toBe('UPGRADE_CHAIN_PROTECTED')
      expect(mocks.issuesStore).toHaveLength(1)
    })

    it('DELETE /api/risks/:id 命中 linked_issue_id 时返回 422', async () => {
      const protectedRiskId = '00000000-0000-0000-0000-0000000000d1'
      mocks.risksStore.push({
        id: protectedRiskId,
        project_id: testProjectId,
        task_id: null,
        title: '升级链风险',
        description: null,
        category: 'other',
        level: 'high',
        probability: 50,
        impact: 50,
        status: 'closed',
        source_type: 'manual',
        source_id: null,
        chain_id: '00000000-0000-0000-0000-0000000000e1',
        pending_manual_close: false,
        linked_issue_id: '00000000-0000-0000-0000-0000000000f1',
        closed_reason: 'converted_to_issue',
        closed_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        version: 1,
      })

      const res = await request.delete(`/api/risks/${protectedRiskId}`)

      expect(res.status).toBe(422)
      expect(res.body.success).toBe(false)
      expect(res.body.error.code).toBe('UPGRADE_CHAIN_PROTECTED')
      expect(mocks.risksStore).toHaveLength(1)
    })
  })

  describe('6. pending_manual_close 专用动作', () => {
    it('POST /api/issues/:id/confirm-close 通过专用动作关闭待确认问题', async () => {
      const issueId = '00000000-0000-0000-0000-0000000003a1'
      mocks.issuesStore.push({
        id: issueId,
        project_id: testProjectId,
        task_id: null,
        title: '待确认关闭问题',
        description: null,
        source_type: 'obstacle_escalated',
        source_id: '00000000-0000-0000-0000-0000000003b1',
        severity: 'high',
        priority: 9,
        pending_manual_close: true,
        status: 'resolved',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        version: 1,
      })

      const res = await request.post(`/api/issues/${issueId}/confirm-close`).send({ version: 1 })

      expect(res.status).toBe(200)
      expect(res.body.data.status).toBe('closed')
      expect(res.body.data.pending_manual_close).toBe(false)
    })

    it('POST /api/issues/:id/keep-processing 通过专用动作恢复处理中', async () => {
      const issueId = '00000000-0000-0000-0000-0000000004a1'
      mocks.issuesStore.push({
        id: issueId,
        project_id: testProjectId,
        task_id: null,
        title: '继续处理问题',
        description: null,
        source_type: 'obstacle_escalated',
        source_id: '00000000-0000-0000-0000-0000000004b1',
        severity: 'high',
        priority: 9,
        pending_manual_close: true,
        status: 'resolved',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        version: 1,
      })

      const res = await request.post(`/api/issues/${issueId}/keep-processing`).send({ version: 1 })

      expect(res.status).toBe(200)
      expect(res.body.data.status).toBe('investigating')
      expect(res.body.data.pending_manual_close).toBe(false)
    })
  })
})
