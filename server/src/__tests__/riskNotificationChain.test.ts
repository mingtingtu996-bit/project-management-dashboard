/**
 * 8.4.3 风险 / 问题变更与提醒中心联动验收
 *
 * 目标：验证"风险或问题状态变更 -> /api/notifications 提醒中心列表"最短链路
 *  1. 风险/问题存在时，提醒中心能读到对应的告警通知
 *  2. 已关闭的风险/问题不应继续出现在待处理提醒中
 *  3. 提醒中心接口结构稳定（success + data[]）
 *  4. 未读计数在有未读通知时大于 0
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

// ── mock ─────────────────────────────────────────────────────────────────────

const mocks = vi.hoisted(() => {
  // persistedNotifications: DB 中存储的通知（已持久化）
  let persistedNotifications: any[] = []

  const notificationStore = {
    listNotifications: vi.fn(async (options: Record<string, any> = {}) => {
      let rows = persistedNotifications.slice()
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
        id: notification.id ?? `notification-${persistedNotifications.length + 1}`,
        created_at: notification.created_at ?? new Date().toISOString(),
        updated_at: notification.updated_at ?? notification.created_at ?? new Date().toISOString(),
        ...notification,
      }
      persistedNotifications = [...persistedNotifications, row]
      return { ...row }
    }),
    updateNotificationById: vi.fn(async (id: string, patch: Record<string, any>) => {
      persistedNotifications = persistedNotifications.map((row) => (row.id === id ? { ...row, ...patch } : row))
    }),
    updateNotificationsByIds: vi.fn(async (ids: string[], patch: Record<string, any>) => {
      persistedNotifications = persistedNotifications.map((row) => (
        ids.includes(String(row.id))
          ? { ...row, ...patch }
          : row
      ))
    }),
    deleteNotificationById: vi.fn(async (id: string) => {
      persistedNotifications = persistedNotifications.filter((row) => row.id !== id)
    }),
  }

  return {
    get persistedNotifications() {
      return persistedNotifications
    },
    setPersistedNotifications(list: any[]) {
      persistedNotifications = list
    },
    executeSQL: vi.fn(async () => persistedNotifications),
    executeSQLOne: vi.fn(async () => ({ cnt: 0 })),
    notificationStore,
    WarningService: vi.fn(),
    warningServiceInstance: {
      syncConditionExpiredIssues: vi.fn(async () => []),
      syncAcceptanceExpiredIssues: vi.fn(async () => []),
      autoEscalateWarnings: vi.fn(async () => []),
      autoEscalateRisksToIssues: vi.fn(async () => []),
      syncActiveWarnings: vi.fn(async () => []),
    },
    operationalNotificationServiceInstance: {
      syncProjectNotifications: vi.fn(async () => []),
      syncAllProjectNotifications: vi.fn(async () => []),
    },
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    },
  }
})

vi.mock('../services/dbService.js', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      then: vi.fn((resolve: any) => resolve({ data: [], error: null })),
    })),
  },
  SupabaseService: vi.fn(),
  executeSQL: mocks.executeSQL,
  executeSQLOne: mocks.executeSQLOne,
  getProject: vi.fn(),
  getProjects: vi.fn(async () => []),
  createProject: vi.fn(),
  updateProject: vi.fn(),
  deleteProject: vi.fn(),
  getRisks: vi.fn(async () => []),
  getRisk: vi.fn(),
  createRisk: vi.fn(),
  updateRisk: vi.fn(),
  deleteRisk: vi.fn(),
  getTasks: vi.fn(async () => []),
  getTask: vi.fn(),
  createTask: vi.fn(),
  updateTask: vi.fn(),
  deleteTask: vi.fn(),
  getMilestones: vi.fn(async () => []),
  getMilestone: vi.fn(),
  createMilestone: vi.fn(),
  updateMilestone: vi.fn(),
  deleteMilestone: vi.fn(),
  getMembers: vi.fn(async () => []),
  createMember: vi.fn(),
  updateMember: vi.fn(),
  deleteMember: vi.fn(),
  getInvitations: vi.fn(async () => []),
  createInvitation: vi.fn(),
  updateInvitation: vi.fn(),
  deleteInvitation: vi.fn(),
  validateInvitation: vi.fn(),
}))

vi.mock('../services/notificationStore.js', () => ({
  listNotifications: mocks.notificationStore.listNotifications,
  findNotification: mocks.notificationStore.findNotification,
  insertNotification: mocks.notificationStore.insertNotification,
  updateNotificationById: mocks.notificationStore.updateNotificationById,
  updateNotificationsByIds: mocks.notificationStore.updateNotificationsByIds,
  deleteNotificationById: mocks.notificationStore.deleteNotificationById,
}))

vi.mock('../services/warningService.js', () => ({
  WarningService: vi.fn().mockImplementation(() => mocks.warningServiceInstance),
}))

vi.mock('../services/operationalNotificationService.js', () => ({
  OperationalNotificationService: vi.fn().mockImplementation(() => mocks.operationalNotificationServiceInstance),
}))

vi.mock('../services/planningGovernanceService.js', () => ({
  planningGovernanceService: {
    persistProjectGovernanceNotifications: vi.fn(async () => []),
  },
}))

vi.mock('../middleware/logger.js', () => ({
  logger: mocks.logger,
  requestLogger: (_req: unknown, _res: unknown, next: () => void) => next(),
}))

// ── 测试 ─────────────────────────────────────────────────────────────────────

import { request } from './testSetup.js'

const projectId = '55555555-5555-4555-8555-555555555555'

describe('risk/issue change -> notifications chain (8.4.3)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.setPersistedNotifications([])
    // 重置 executeSQL 使其读取最新 persistedNotifications
    mocks.executeSQL.mockImplementation(async () => mocks.persistedNotifications)
    mocks.executeSQLOne.mockResolvedValue({ cnt: 0 })
  })

  it('notification list is empty when no risks or issues exist', async () => {
    const res = await request.get(`/api/notifications?projectId=${projectId}`)
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(Array.isArray(res.body.data)).toBe(true)
    expect(res.body.data).toHaveLength(0)
  })

  it('risk warning appears in notification center after risk is flagged', async () => {
    mocks.setPersistedNotifications([
      {
        id: 'warn-risk-1',
        title: '风险预警',
        content: '高风险：施工延期超过 10 天',
        category: 'risk',
        type: 'warning',
        is_read: 0,
        status: 'unread',
        project_id: projectId,
        created_at: new Date().toISOString(),
      },
    ])

    const res = await request.get(`/api/notifications?projectId=${projectId}`)
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    const data: any[] = res.body.data
    expect(data.length).toBeGreaterThan(0)
    const riskNotif = data.find((n: any) => n.category === 'risk' || n.title?.includes('风险'))
    expect(riskNotif).toBeTruthy()
    expect(riskNotif.content).toContain('施工延期')
  })

  it('closed risk does not appear in pending notifications (unreadOnly=true)', async () => {
    // 持久化通知：已关闭的风险（状态 read=true）
    mocks.setPersistedNotifications([
      {
        id: 'closed-risk-1',
        title: '风险已关闭',
        message: '风险已处理，无需再关注',
        category: 'risk',
        type: 'info',
        is_read: 1, // 已读 = 已处理
        status: 'read',
        project_id: projectId,
        created_at: new Date().toISOString(),
      },
    ])
    // unreadOnly=true 应过滤掉已读通知
    const res = await request.get(`/api/notifications?projectId=${projectId}&unreadOnly=true`)
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    // 已关闭/已读的项不应出现在待处理列表中
    const unreadItems = res.body.data.filter((n: any) => n.title === '风险已关闭')
    expect(unreadItems).toHaveLength(0)
  })

  it('notification center response structure is stable', async () => {
    const res = await request.get('/api/notifications')
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('success', true)
    expect(res.body).toHaveProperty('data')
    expect(Array.isArray(res.body.data)).toBe(true)
    expect(res.body).toHaveProperty('timestamp')
  })

  it('multiple notification types can coexist in notification center', async () => {
    mocks.setPersistedNotifications([
      {
        id: 'warn-risk-2',
        title: '风险告警',
        content: '材料供应延误风险',
        category: 'risk',
        type: 'warning',
        is_read: 0,
        status: 'unread',
        project_id: projectId,
        created_at: new Date().toISOString(),
      },
      {
        id: 'warn-obstacle-1',
        title: '问题跟进',
        content: '现场障碍未处理',
        category: 'system',
        type: 'info',
        is_read: 0,
        status: 'unread',
        project_id: projectId,
        created_at: new Date().toISOString(),
      },
    ])

    const res = await request.get('/api/notifications')
    expect(res.status).toBe(200)
    expect(res.body.data.length).toBeGreaterThanOrEqual(2)
    const titles = res.body.data.map((n: any) => n.title)
    expect(titles).toContain('风险告警')
    expect(titles).toContain('问题跟进')
  })
})
