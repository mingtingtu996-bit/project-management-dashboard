import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  executeSQL: vi.fn(),
  executeSQLOne: vi.fn(),
  from: vi.fn(() => {
    throw new Error('notification persistence must not use anonymous Supabase REST')
  }),
  broadcastRealtimeEvent: vi.fn(),
  registerDatabasePostCommitEffect: vi.fn(async (_label: string, effect: () => Promise<void>) => effect()),
}))

vi.mock('../services/dbService.js', () => ({
  executeSQL: mocks.executeSQL,
  executeSQLOne: mocks.executeSQLOne,
  supabase: { from: mocks.from },
}))

vi.mock('../services/realtimeServer.js', () => ({
  broadcastRealtimeEvent: mocks.broadcastRealtimeEvent,
}))

vi.mock('../database.js', () => ({
  registerDatabasePostCommitEffect: mocks.registerDatabasePostCommitEffect,
}))

const {
  compareAndSetNotificationById,
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
    mocks.registerDatabasePostCommitEffect.mockImplementation(async (_label: string, effect: () => Promise<void>) => effect())
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

  it('defers realtime notification broadcasts until the surrounding transaction commits', async () => {
    const postCommitEffects: Array<() => Promise<void>> = []
    mocks.registerDatabasePostCommitEffect.mockImplementation(async (_label, effect) => {
      postCommitEffects.push(effect)
    })
    mocks.executeSQLOne.mockResolvedValueOnce({ company_id: 'company-1' })
    mocks.executeSQL.mockResolvedValueOnce([])

    await insertNotification({
      id: 'notification-transactional',
      project_id: 'project-1',
      user_id: 'user-1',
      type: 'drawing_version_updated',
      title: 'Drawing version updated',
      content: 'Drawing D-001 is now version 2.0',
    } as any)

    expect(mocks.broadcastRealtimeEvent).not.toHaveBeenCalled()
    expect(postCommitEffects).toHaveLength(1)

    await postCommitEffects[0]?.()

    expect(mocks.broadcastRealtimeEvent).toHaveBeenCalledWith(expect.objectContaining({
      channel: 'notifications',
      type: 'notification.changed',
      projectId: 'project-1',
      ids: ['notification-transactional'],
      payload: { action: 'insert' },
    }))
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

  it('compares the stored lifecycle version before updating a notification', async () => {
    expect(compareAndSetNotificationById).toBeTypeOf('function')
    if (typeof compareAndSetNotificationById !== 'function') return

    mocks.executeSQL
      .mockResolvedValueOnce([{ id: 'notification-1' }])
      .mockResolvedValueOnce([])

    await expect(compareAndSetNotificationById(
      'notification-1',
      {
        title: 'Authoritative title',
        lifecycle_status: 'active',
        updated_at: '2026-07-29T10:00:00.000Z',
      },
      {
        ...currentNotification,
        lifecycle_status: 'active',
        updated_at: '2026-07-29T09:00:00.000Z',
      },
    )).resolves.toBe(true)

    const [sql, params] = mocks.executeSQL.mock.calls[0]
    expect(String(sql)).toContain('updated_at IS NOT DISTINCT FROM ?')
    expect(String(sql)).toContain("COALESCE(lifecycle_status, 'active') = ?")
    expect(String(sql)).toContain('RETURNING id')
    expect(params).toEqual(expect.arrayContaining([
      'notification-1',
      'project-1',
      '2026-07-29T09:00:00.000Z',
      'active',
    ]))

    await expect(compareAndSetNotificationById(
      'notification-1',
      { title: 'Stale title' },
      {
        ...currentNotification,
        lifecycle_status: 'active',
        updated_at: '2026-07-29T09:00:00.000Z',
      },
    )).resolves.toBe(false)
  })
})
