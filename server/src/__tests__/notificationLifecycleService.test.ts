import { afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  listNotifications: vi.fn(),
  updateNotificationById: vi.fn(),
  deleteNotificationById: vi.fn(),
}))

vi.mock('../services/notificationStore.js', () => ({
  listNotifications: mocks.listNotifications,
  updateNotificationById: mocks.updateNotificationById,
  deleteNotificationById: mocks.deleteNotificationById,
}))

import { NotificationLifecycleService } from '../services/notificationLifecycleService.js'

const baseNotification = {
  id: 'notification-1',
  project_id: 'project-1',
  type: 'acceptance_expired',
  title: '验收预警',
  content: '请处理',
  is_read: false,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
}

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  mocks.listNotifications.mockReset()
  mocks.updateNotificationById.mockReset()
  mocks.deleteNotificationById.mockReset()
})

describe('NotificationLifecycleService retention policy', () => {
  it('does not archive active warning notifications just because they are old', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-15T00:00:00.000Z'))
    mocks.listNotifications.mockResolvedValue([
      {
        ...baseNotification,
        id: 'active-warning',
        status: 'active',
        warning_lifecycle_status: 'active',
        created_at: '2025-12-01T00:00:00.000Z',
        first_seen_at: '2025-12-01T00:00:00.000Z',
      },
    ])

    const result = await new NotificationLifecycleService().runRetentionPolicy()

    expect(result).toEqual({ archived: 0, deleted: 0 })
    expect(mocks.updateNotificationById).not.toHaveBeenCalled()
    expect(mocks.deleteNotificationById).not.toHaveBeenCalled()
  })

  it('archives stale inactive notifications by last lifecycle activity', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-15T00:00:00.000Z'))
    mocks.listNotifications.mockResolvedValue([
      {
        ...baseNotification,
        id: 'resolved-warning',
        status: 'resolved',
        warning_lifecycle_status: 'resolved',
        is_read: true,
        created_at: '2025-12-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
        resolved_at: '2026-01-01T00:00:00.000Z',
      },
    ])

    const result = await new NotificationLifecycleService().runRetentionPolicy()

    expect(result).toEqual({ archived: 1, deleted: 0 })
    expect(mocks.updateNotificationById).toHaveBeenCalledWith(
      'resolved-warning',
      expect.objectContaining({
        status: 'archived',
        is_read: true,
        resolved_at: '2026-01-01T00:00:00.000Z',
        metadata: expect.objectContaining({
          archived_reason: 'retention_90d',
        }),
      }),
      expect.objectContaining({ id: 'resolved-warning', project_id: 'project-1' }),
    )
  })

  it('does not purge a freshly archived notification just because it was created long ago', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-01T00:00:00.000Z'))
    mocks.listNotifications.mockResolvedValue([
      {
        ...baseNotification,
        id: 'recently-archived-warning',
        status: 'archived',
        is_read: true,
        created_at: '2025-10-01T00:00:00.000Z',
        updated_at: '2026-06-25T00:00:00.000Z',
        metadata: {
          archived_at: '2026-06-25T00:00:00.000Z',
          archived_reason: 'retention_90d',
        },
      },
    ])

    const result = await new NotificationLifecycleService().runRetentionPolicy()

    expect(result).toEqual({ archived: 0, deleted: 0 })
    expect(mocks.deleteNotificationById).not.toHaveBeenCalled()
    expect(mocks.updateNotificationById).not.toHaveBeenCalled()
  })
})
