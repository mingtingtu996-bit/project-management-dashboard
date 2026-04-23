import { beforeEach, describe, expect, it, vi } from 'vitest'

type Row = Record<string, any>

const mocks = vi.hoisted(() => {
  const DAY_MS = 24 * 60 * 60 * 1000
  const tables: Record<string, Row[]> = {
    delay_requests: [
      {
        id: 'delay-1',
        project_id: 'project-1',
        task_id: 'task-1',
        status: 'pending',
        created_at: new Date(Date.now() - 4 * DAY_MS).toISOString(),
      },
      {
        id: 'delay-2',
        project_id: 'project-1',
        task_id: 'task-2',
        status: 'pending',
        created_at: new Date(Date.now() - 6 * DAY_MS).toISOString(),
      },
      {
        id: 'delay-3',
        project_id: 'project-2',
        task_id: 'task-3',
        status: 'pending',
        created_at: new Date(Date.now() - 1 * DAY_MS).toISOString(),
      },
    ],
    tasks: [
      { id: 'task-1', project_id: 'project-1', title: '一期结构' },
      { id: 'task-2', project_id: 'project-1', title: '二期机电' },
      { id: 'task-3', project_id: 'project-2', title: '外立面' },
    ],
    projects: [
      { id: 'project-1', owner_id: 'owner-1', name: '示例项目' },
      { id: 'project-2', owner_id: 'owner-2', name: '第二项目' },
    ],
    project_members: [
      { project_id: 'project-1', user_id: 'owner-1', role: 'owner' },
      { project_id: 'project-1', user_id: 'admin-1', role: 'admin' },
      { project_id: 'project-1', user_id: 'editor-1', role: 'editor' },
      { project_id: 'project-2', user_id: 'owner-2', role: 'owner' },
    ],
    notifications: [],
  }

  const executeSQL = vi.fn(async (query: string, params: any[] = []) => {
    const sql = query.toLowerCase()

    if (sql.startsWith('select') && sql.includes('from delay_requests')) {
      const status = params[0]
      const projectId = params[1]
      return tables.delay_requests.filter((row) => row.status === status && (!projectId || row.project_id === projectId)).map((row) => ({ ...row }))
    }

    if (sql.startsWith('select') && sql.includes('from tasks')) {
      const ids = params
      return tables.tasks.filter((row) => ids.includes(row.id)).map((row) => ({ ...row }))
    }

    if (sql.startsWith('select') && sql.includes('from projects')) {
      const ids = params
      return tables.projects.filter((row) => ids.includes(row.id)).map((row) => ({ ...row }))
    }

    if (sql.startsWith('select') && sql.includes('from project_members')) {
      const ids = params
      return tables.project_members.filter((row) => ids.includes(row.project_id)).map((row) => ({ ...row }))
    }

    if (sql.startsWith('select') && sql.includes('from notifications')) {
      const [sourceEntityType, sourceEntityId, type] = params
      return tables.notifications
        .filter((row) => row.source_entity_type === sourceEntityType && row.source_entity_id === sourceEntityId && row.type === type)
        .map((row) => ({ ...row }))
    }

    if (sql.startsWith('insert into notifications')) {
      const columnsMatch = query.match(/notifications\s*\(([^)]+)\)/i)
      const columns = (columnsMatch?.[1] || '').split(',').map((item) => item.trim()).filter(Boolean)
      const row: Row = {}
      columns.forEach((column, index) => {
        row[column] = params[index]
      })
      tables.notifications.push(row)
      return []
    }

    return []
  })

  const executeSQLOne = vi.fn(async (query: string, params: any[] = []) => {
    const rows = await executeSQL(query, params)
    return rows[0] ?? null
  })

  const notificationStore = {
    findNotification: vi.fn(async (options: Record<string, any>) => {
      return tables.notifications.find((row) => (
        (!options.sourceEntityType || row.source_entity_type === options.sourceEntityType)
        && (!options.sourceEntityId || row.source_entity_id === options.sourceEntityId)
        && (!options.type || row.type === options.type)
      )) ?? null
    }),
    insertNotification: vi.fn(async (notification: Row) => {
      const row = {
        id: notification.id ?? `notification-${tables.notifications.length + 1}`,
        created_at: notification.created_at ?? new Date().toISOString(),
        updated_at: notification.updated_at ?? notification.created_at ?? new Date().toISOString(),
        ...notification,
      }
      tables.notifications.push(row)
      return { ...row }
    }),
  }

  return {
    tables,
    executeSQL,
    executeSQLOne,
    notificationStore,
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
}))

vi.mock('../services/notificationStore.js', () => ({
  listNotifications: vi.fn(async (options: Record<string, any> = {}) => {
    let rows = mocks.tables.notifications.slice()
    if (options.sourceEntityType) rows = rows.filter((row) => row.source_entity_type === options.sourceEntityType)
    if (options.sourceEntityId) rows = rows.filter((row) => row.source_entity_id === options.sourceEntityId)
    if (options.type) rows = rows.filter((row) => row.type === options.type)
    if (options.projectId) rows = rows.filter((row) => row.project_id === options.projectId)
    if (options.limit) rows = rows.slice(0, Number(options.limit))
    return rows.map((row) => ({ ...row }))
  }),
  findNotification: mocks.notificationStore.findNotification,
  insertNotification: mocks.notificationStore.insertNotification,
  updateNotificationById: vi.fn(async () => undefined),
  updateNotificationsByIds: vi.fn(async () => undefined),
  deleteNotificationById: vi.fn(async () => undefined),
}))

vi.mock('../middleware/logger.js', () => ({
  logger: mocks.logger,
  requestLogger: (_req: unknown, _res: unknown, next: () => void) => next(),
}))

const { DelayRequestNotificationService } = await import('../services/delayRequestNotificationService.js')

describe('delay request notification service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.tables.notifications = []
  })

  it('creates reminder and escalation notifications with the expected recipients', async () => {
    mocks.tables.notifications = [
      {
        id: 'submitted-1',
        project_id: 'project-1',
        type: 'delay_request_submitted',
        source_entity_type: 'delay_request',
        source_entity_id: 'delay-1',
        is_read: true,
        status: 'read',
        title: 'submitted',
        content: 'submitted',
        created_at: new Date().toISOString(),
      },
      {
        id: 'submitted-2',
        project_id: 'project-1',
        type: 'delay_request_submitted',
        source_entity_type: 'delay_request',
        source_entity_id: 'delay-2',
        is_read: false,
        status: 'unread',
        title: 'submitted',
        content: 'submitted',
        created_at: new Date().toISOString(),
      },
    ]

    const service = new DelayRequestNotificationService()
    const notifications = await service.persistPendingDelayRequestNotifications()

    expect(notifications).toHaveLength(2)
    expect(mocks.tables.notifications).toHaveLength(4)

    const reminder = notifications.find((item) => item.type === 'delay_request_reminder')
    const escalation = notifications.find((item) => item.type === 'delay_request_escalation')

    expect(reminder?.recipients).toEqual(expect.arrayContaining(['owner-1', 'admin-1']))
    expect(escalation?.recipients).toEqual(['owner-1'])
    expect(reminder?.content).toContain('4 days')
    expect(escalation?.content).toContain('6 days')
  })

  it('does not create a 3-day reminder while the submitted notification is still unread', async () => {
    mocks.tables.delay_requests = [
      {
        id: 'delay-1',
        project_id: 'project-1',
        task_id: 'task-1',
        status: 'pending',
        created_at: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString(),
      },
    ]
    mocks.tables.notifications = [
      {
        id: 'submitted-1',
        project_id: 'project-1',
        type: 'delay_request_submitted',
        source_entity_type: 'delay_request',
        source_entity_id: 'delay-1',
        is_read: false,
        status: 'unread',
        title: 'submitted',
        content: 'submitted',
        created_at: new Date().toISOString(),
      },
    ]

    const service = new DelayRequestNotificationService()
    const notifications = await service.persistPendingDelayRequestNotifications()

    expect(notifications).toHaveLength(0)
    expect(mocks.tables.notifications).toHaveLength(1)
  })
})
