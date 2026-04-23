import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  listNotifications: vi.fn(),
  updateNotificationsByIds: vi.fn(),
  updateNotificationById: vi.fn(),
  persistNotification: vi.fn(),
  acknowledgeWarningNotification: vi.fn(),
  muteWarningNotification: vi.fn(),
  deleteNotificationById: vi.fn(),
}))

vi.mock('../middleware/auth.js', () => ({
  authenticate: vi.fn((req: any, _res: any, next: () => void) => {
    req.user = { id: 'user-1' }
    next()
  }),
}))

vi.mock('../services/warningService.js', () => ({
  WarningService: vi.fn().mockImplementation(() => ({
    syncConditionExpiredIssues: vi.fn(),
    syncAcceptanceExpiredIssues: vi.fn(),
    autoEscalateWarnings: vi.fn(),
    autoEscalateRisksToIssues: vi.fn(),
    syncActiveWarnings: vi.fn(),
  })),
}))

vi.mock('../services/operationalNotificationService.js', () => ({
  OperationalNotificationService: vi.fn().mockImplementation(() => ({
    syncProjectNotifications: vi.fn(),
    syncAllProjectNotifications: vi.fn(),
  })),
}))

vi.mock('../services/planningGovernanceService.js', () => ({
  planningGovernanceService: {
    persistProjectGovernanceNotifications: vi.fn(async () => []),
  },
}))

vi.mock('../services/notificationStore.js', () => ({
  listNotifications: mocks.listNotifications,
  findNotification: vi.fn(),
  updateNotificationById: mocks.updateNotificationById,
  updateNotificationsByIds: mocks.updateNotificationsByIds,
  deleteNotificationById: mocks.deleteNotificationById,
}))

vi.mock('../services/upgradeChainService.js', () => ({
  acknowledgeWarningNotification: mocks.acknowledgeWarningNotification,
  muteWarningNotification: mocks.muteWarningNotification,
}))

vi.mock('../services/warningChainService.js', () => ({
  persistNotification: mocks.persistNotification,
}))

function buildApp(router: express.Router) {
  const app = express()
  app.use(express.json())
  app.use('/api/notifications', router)
  return app
}

describe('notifications acknowledge-group route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.listNotifications.mockResolvedValue([
      { id: 'warning-1', source_entity_type: 'warning' },
      { id: 'system-1', source_entity_type: 'system' },
    ])
  })

  it('acknowledges grouped warning and regular notifications in one request', async () => {
    const { default: router } = await import('../routes/notifications.js')
    const response = await request(buildApp(router))
      .put('/api/notifications/acknowledge-group')
      .send({ ids: ['warning-1', 'system-1'] })

    expect(response.status).toBe(200)
    expect(mocks.listNotifications).toHaveBeenCalledWith({ ids: ['warning-1', 'system-1'] })
    expect(mocks.acknowledgeWarningNotification).toHaveBeenCalledWith('warning-1', 'user-1')
    expect(mocks.updateNotificationsByIds).toHaveBeenCalledWith(
      ['system-1'],
      expect.objectContaining({
        status: 'acknowledged',
        is_read: true,
      }),
    )
  })

  it('accepts project_id and user_id aliases when reading notifications', async () => {
    mocks.listNotifications.mockResolvedValue([
      {
        id: 'system-2',
        project_id: 'project-1',
        recipients: ['user-1'],
        status: 'unread',
        is_read: false,
        created_at: '2026-04-19T10:00:00.000Z',
      },
    ])

    const { default: router } = await import('../routes/notifications.js')
    const response = await request(buildApp(router))
      .get('/api/notifications')
      .query({ project_id: 'project-1', user_id: 'user-1', unread_only: 'true' })

    expect(response.status).toBe(200)
    expect(response.body.success).toBe(true)
    expect(response.body.data).toHaveLength(1)
    expect(response.body.data[0].id).toBe('system-2')
  })

  it('rejects unsupported mute durations before muting notifications', async () => {
    const { default: router } = await import('../routes/notifications.js')
    const response = await request(buildApp(router))
      .put('/api/notifications/system-1/mute')
      .send({ mute_hours: 2 })

    expect(response.status).toBe(400)
    expect(response.body.success).toBe(false)
    expect(response.body.error.code).toBe('VALIDATION_ERROR')
    expect(mocks.muteWarningNotification).not.toHaveBeenCalled()
    expect(mocks.updateNotificationById).not.toHaveBeenCalled()
  })
})
