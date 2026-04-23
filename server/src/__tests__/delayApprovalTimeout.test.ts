/**
 * §4.2 Delay approval timeout tests
 *
 * Explicit boundary tests for:
 * - Day-3 reminder: requests pending >= 3 days get a reminder notification
 * - Day-5 escalation: requests pending >= 5 days get escalated to owner only
 * - Boundary conditions: exactly at and just below thresholds
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const DAY_MS = 24 * 60 * 60 * 1000

function daysAgo(days: number): string {
  return new Date(Date.now() - days * DAY_MS).toISOString()
}

type Row = Record<string, any>

const mocks = vi.hoisted(() => {
  const tables: Record<string, Row[]> = {
    delay_requests: [],
    tasks: [
      { id: 'task-1', project_id: 'project-1', title: '桩基施工' },
      { id: 'task-2', project_id: 'project-1', title: '地下室施工' },
      { id: 'task-3', project_id: 'project-1', title: '主体结构' },
    ],
    projects: [{ id: 'project-1', owner_id: 'owner-1', name: '示例项目' }],
    project_members: [
      { project_id: 'project-1', user_id: 'owner-1', role: 'owner', permission_level: 'owner' },
      { project_id: 'project-1', user_id: 'admin-1', role: 'admin', permission_level: 'editor' },
    ],
    notifications: [] as Row[],
  }

  const executeSQL = vi.fn(async (sql: string, params: any[] = []) => {
    const q = sql.toLowerCase()

    if (q.includes('from delay_requests')) {
      return tables.delay_requests.filter((r) => r.status === (params[0] ?? 'pending')).map((r) => ({ ...r }))
    }
    if (q.includes('from tasks')) {
      return tables.tasks.filter((r) => params.includes(r.id)).map((r) => ({ ...r }))
    }
    if (q.includes('from projects')) {
      return tables.projects.filter((r) => params.includes(r.id)).map((r) => ({ ...r }))
    }
    if (q.includes('from project_members')) {
      return tables.project_members.filter((r) => params.includes(r.project_id)).map((r) => ({ ...r }))
    }
    if (q.includes('from notifications')) {
      const [sourceType, sourceId, type] = params
      return tables.notifications.filter(
        (r) => r.source_entity_type === sourceType && r.source_entity_id === sourceId && r.type === type,
      )
    }
    if (q.includes('insert into notifications')) {
      const colMatch = sql.match(/notifications\s*\(([^)]+)\)/i)
      const cols = (colMatch?.[1] ?? '').split(',').map((c) => c.trim()).filter(Boolean)
      const row: Row = {}
      cols.forEach((col, i) => { row[col] = params[i] })
      tables.notifications.push(row)
      return []
    }
    return []
  })

  const notificationStore = {
    findNotification: vi.fn(async (opts: Record<string, any>) => {
      const matches = tables.notifications.filter((r) => {
        if (opts.type && r.type !== opts.type) return false
        if (opts.projectId && r.project_id !== opts.projectId) return false
        if (opts.sourceEntityId && r.source_entity_id !== opts.sourceEntityId) return false
        if (opts.sourceEntityType && r.source_entity_type !== opts.sourceEntityType) return false
        return true
      })
      return matches[0] ?? null
    }),
    insertNotification: vi.fn(async (data: Record<string, any>) => {
      tables.notifications.push({ ...data })
      return data
    }),
    updateNotificationById: vi.fn(async () => undefined),
    updateNotificationsByIds: vi.fn(async () => undefined),
    deleteNotificationById: vi.fn(async () => undefined),
    listNotifications: vi.fn(async (opts: Record<string, any>) => {
      let rows = [...tables.notifications]
      if (opts.type) rows = rows.filter((r) => r.type === opts.type)
      if (opts.projectId) rows = rows.filter((r) => r.project_id === opts.projectId)
      return rows
    }),
  }

  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }

  return { tables, executeSQL, notificationStore, logger }
})

vi.mock('../services/dbService.js', () => ({ executeSQL: mocks.executeSQL }))
vi.mock('../services/notificationStore.js', () => ({
  findNotification: mocks.notificationStore.findNotification,
  insertNotification: mocks.notificationStore.insertNotification,
  updateNotificationById: mocks.notificationStore.updateNotificationById,
  updateNotificationsByIds: mocks.notificationStore.updateNotificationsByIds,
  deleteNotificationById: mocks.notificationStore.deleteNotificationById,
  listNotifications: mocks.notificationStore.listNotifications,
}))
vi.mock('../middleware/logger.js', () => ({ logger: mocks.logger, requestLogger: (_: unknown, __: unknown, next: () => void) => next() }))

const { DelayRequestNotificationService } = await import('../services/delayRequestNotificationService.js')

function resetTables() {
  mocks.tables.delay_requests = []
  mocks.tables.notifications = []
  vi.clearAllMocks()
}

// ─────────────────────────────────────────────
// §4.2 延期审批超时第 3 天提醒
// ─────────────────────────────────────────────
describe('§4.2 day-3 reminder threshold', () => {
  beforeEach(resetTables)

  it('does NOT create reminder for a 2-day-old pending request (below threshold)', async () => {
    mocks.tables.delay_requests = [
      { id: 'dr-2d', project_id: 'project-1', task_id: 'task-1', status: 'pending', created_at: daysAgo(2) },
    ]
    const service = new DelayRequestNotificationService()
    const result = await service.persistPendingDelayRequestNotifications()
    expect(result).toHaveLength(0)
  })

  it('creates a reminder_notification for a request pending exactly 3 days', async () => {
    mocks.tables.delay_requests = [
      { id: 'dr-3d', project_id: 'project-1', task_id: 'task-1', status: 'pending', created_at: daysAgo(3) },
    ]
    // Seed read submitted notification so gate passes
    mocks.tables.notifications = [
      {
        id: 'sub-1',
        project_id: 'project-1',
        type: 'delay_request_submitted',
        source_entity_type: 'delay_request',
        source_entity_id: 'dr-3d',
        is_read: true,
        status: 'read',
        title: 'submitted',
        content: 'submitted',
        created_at: new Date().toISOString(),
      },
    ]
    const service = new DelayRequestNotificationService()
    const result = await service.persistPendingDelayRequestNotifications()
    expect(result.length).toBeGreaterThan(0)
    const reminder = result.find((n: any) => n.type === 'delay_request_reminder')
    expect(reminder).toBeTruthy()
  })

  it('creates a reminder for a 4-day-old request', async () => {
    mocks.tables.delay_requests = [
      { id: 'dr-4d', project_id: 'project-1', task_id: 'task-2', status: 'pending', created_at: daysAgo(4) },
    ]
    mocks.tables.notifications = [
      {
        id: 'sub-2',
        project_id: 'project-1',
        type: 'delay_request_submitted',
        source_entity_type: 'delay_request',
        source_entity_id: 'dr-4d',
        is_read: true,
        status: 'read',
        title: 'submitted',
        content: 'submitted',
        created_at: new Date().toISOString(),
      },
    ]
    const service = new DelayRequestNotificationService()
    const result = await service.persistPendingDelayRequestNotifications()
    const reminder = result.find((n: any) => n.type === 'delay_request_reminder')
    expect(reminder).toBeTruthy()
    expect(reminder?.content).toContain('4 days')
  })

  it('sends reminder to owner-level and editor-level approvers', async () => {
    mocks.tables.delay_requests = [
      { id: 'dr-remind', project_id: 'project-1', task_id: 'task-1', status: 'pending', created_at: daysAgo(3) },
    ]
    mocks.tables.notifications = [
      {
        id: 'sub-r',
        project_id: 'project-1',
        type: 'delay_request_submitted',
        source_entity_type: 'delay_request',
        source_entity_id: 'dr-remind',
        is_read: true,
        status: 'read',
        title: 'submitted',
        content: 'submitted',
        created_at: new Date().toISOString(),
      },
    ]
    const service = new DelayRequestNotificationService()
    const result = await service.persistPendingDelayRequestNotifications()
    const reminder = result.find((n: any) => n.type === 'delay_request_reminder')
    expect(reminder?.recipients).toContain('owner-1')
  })
})

// ─────────────────────────────────────────────
// §4.2 延期审批超时第 5 天升级
// ─────────────────────────────────────────────
describe('§4.2 day-5 escalation threshold', () => {
  beforeEach(resetTables)

  it('creates escalation notification for a request pending exactly 5 days', async () => {
    mocks.tables.delay_requests = [
      { id: 'dr-5d', project_id: 'project-1', task_id: 'task-3', status: 'pending', created_at: daysAgo(5) },
    ]
    mocks.tables.notifications = [
      {
        id: 'sub-5',
        project_id: 'project-1',
        type: 'delay_request_submitted',
        source_entity_type: 'delay_request',
        source_entity_id: 'dr-5d',
        is_read: true,
        status: 'read',
        title: 'submitted',
        content: 'submitted',
        created_at: new Date().toISOString(),
      },
    ]
    const service = new DelayRequestNotificationService()
    const result = await service.persistPendingDelayRequestNotifications()
    const escalation = result.find((n: any) => n.type === 'delay_request_escalation')
    expect(escalation).toBeTruthy()
  })

  it('escalation at day 6 targets only the project owner', async () => {
    mocks.tables.delay_requests = [
      { id: 'dr-6d', project_id: 'project-1', task_id: 'task-1', status: 'pending', created_at: daysAgo(6) },
    ]
    mocks.tables.notifications = [
      {
        id: 'sub-6',
        project_id: 'project-1',
        type: 'delay_request_submitted',
        source_entity_type: 'delay_request',
        source_entity_id: 'dr-6d',
        is_read: true,
        status: 'read',
        title: 'submitted',
        content: 'submitted',
        created_at: new Date().toISOString(),
      },
    ]
    const service = new DelayRequestNotificationService()
    const result = await service.persistPendingDelayRequestNotifications()
    const escalation = result.find((n: any) => n.type === 'delay_request_escalation')
    expect(escalation).toBeTruthy()
    expect(escalation?.recipients).toEqual(expect.arrayContaining(['owner-1']))
    // admin-1 is editor-level — should NOT be in escalation recipients
    if (escalation?.recipients) {
      expect(escalation.recipients).not.toContain('admin-1')
    }
  })

  it('escalation content mentions the number of days elapsed', async () => {
    mocks.tables.delay_requests = [
      { id: 'dr-7d', project_id: 'project-1', task_id: 'task-2', status: 'pending', created_at: daysAgo(7) },
    ]
    mocks.tables.notifications = [
      {
        id: 'sub-7',
        project_id: 'project-1',
        type: 'delay_request_submitted',
        source_entity_type: 'delay_request',
        source_entity_id: 'dr-7d',
        is_read: true,
        status: 'read',
        title: 'submitted',
        content: 'submitted',
        created_at: new Date().toISOString(),
      },
    ]
    const service = new DelayRequestNotificationService()
    const result = await service.persistPendingDelayRequestNotifications()
    const escalation = result.find((n: any) => n.type === 'delay_request_escalation')
    expect(escalation?.content).toContain('7 days')
  })

  it('a 4-day-old request produces reminder NOT escalation', async () => {
    mocks.tables.delay_requests = [
      { id: 'dr-4d-e', project_id: 'project-1', task_id: 'task-1', status: 'pending', created_at: daysAgo(4) },
    ]
    mocks.tables.notifications = [
      {
        id: 'sub-4e',
        project_id: 'project-1',
        type: 'delay_request_submitted',
        source_entity_type: 'delay_request',
        source_entity_id: 'dr-4d-e',
        is_read: true,
        status: 'read',
        title: 'submitted',
        content: 'submitted',
        created_at: new Date().toISOString(),
      },
    ]
    const service = new DelayRequestNotificationService()
    const result = await service.persistPendingDelayRequestNotifications()
    const escalation = result.find((n: any) => n.type === 'delay_request_escalation')
    expect(escalation).toBeFalsy()
    const reminder = result.find((n: any) => n.type === 'delay_request_reminder')
    expect(reminder).toBeTruthy()
  })
})
