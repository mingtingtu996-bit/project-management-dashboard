import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  executeSQL: vi.fn(),
  executeSQLOne: vi.fn(),
  from: vi.fn(() => {
    throw new Error('notification persistence must not use anonymous Supabase REST')
  }),
  broadcastRealtimeEvent: vi.fn(),
}))

vi.mock('../services/dbService.js', () => ({
  executeSQL: mocks.executeSQL,
  executeSQLOne: mocks.executeSQLOne,
  supabase: { from: mocks.from },
}))

vi.mock('../services/realtimeServer.js', () => ({
  broadcastRealtimeEvent: mocks.broadcastRealtimeEvent,
}))

const {
  deleteNotificationById,
  insertNotification,
  listNotifications,
  updateNotificationById,
} = await import('../services/notificationStore.js')

const currentNotification = {
  id: 'notification-1',
  company_id: 'company-1',
  project_id: 'project-1',
  user_id: 'user-1',
  type: 'issue_created',
  title: 'Issue created',
  content: 'A risk was converted to an issue',
  is_read: false,
  created_at: '2026-07-12T00:00:00.000Z',
} as any

describe('notification store direct runtime persistence', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.executeSQL.mockReset()
    mocks.executeSQLOne.mockReset()
  })

  it('inserts scoped notifications through the backend database role', async () => {
    mocks.executeSQLOne.mockResolvedValueOnce({ company_id: 'company-1' })
    mocks.executeSQL.mockResolvedValueOnce([])

    await expect(insertNotification({
      id: 'notification-1',
      project_id: 'project-1',
      user_id: 'user-1',
      type: 'issue_created',
      title: 'Issue created',
      content: 'A risk was converted to an issue',
      source_entity_type: 'issue',
      source_entity_id: 'issue-1',
      metadata: { source: 'uat' },
    } as any)).resolves.toMatchObject({
      id: 'notification-1',
      company_id: 'company-1',
      project_id: 'project-1',
    })

    expect(mocks.executeSQLOne).toHaveBeenCalledWith(
      'SELECT company_id FROM projects WHERE id = ? LIMIT 1',
      ['project-1'],
    )
    expect(String(mocks.executeSQL.mock.calls[0][0])).toContain('INSERT INTO notifications')
    expect(mocks.from).not.toHaveBeenCalled()
  })

  it('lists scoped notifications through the backend database role', async () => {
    mocks.executeSQL.mockResolvedValueOnce([currentNotification])

    await expect(listNotifications({
      projectId: 'project-1',
      sourceEntityType: 'issue',
      sourceEntityId: 'issue-1',
      limit: 10,
    })).resolves.toEqual([currentNotification])

    const [sql, params] = mocks.executeSQL.mock.calls[0]
    expect(String(sql)).toContain('FROM notifications')
    expect(String(sql)).toContain('project_id = ?')
    expect(String(sql)).toContain('source_entity_type = ?')
    expect(params).toEqual(expect.arrayContaining(['project-1', 'issue', 'issue-1', 10]))
    expect(mocks.from).not.toHaveBeenCalled()
  })

  it('updates and archives notifications through scoped backend SQL', async () => {
    mocks.executeSQL.mockResolvedValue([])

    await updateNotificationById('notification-1', { is_read: true }, currentNotification)
    await deleteNotificationById('notification-1', currentNotification)

    expect(String(mocks.executeSQL.mock.calls[0][0])).toContain('UPDATE notifications SET')
    expect(String(mocks.executeSQL.mock.calls[0][0])).toContain('project_id = ?')
    expect(String(mocks.executeSQL.mock.calls[1][0])).toContain('lifecycle_status = ?')
    expect(mocks.from).not.toHaveBeenCalled()
  })
})
