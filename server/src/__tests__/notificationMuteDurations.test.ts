import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const warningServiceInstance = {
    syncConditionExpiredIssues: vi.fn(async () => undefined),
    syncAcceptanceExpiredIssues: vi.fn(async () => undefined),
    autoEscalateWarnings: vi.fn(async () => undefined),
    autoEscalateRisksToIssues: vi.fn(async () => undefined),
    syncActiveWarnings: vi.fn(async () => []),
    scanPreMilestoneWarnings: vi.fn(async () => []),
    scanConditionWarnings: vi.fn(async () => []),
    scanObstacleWarnings: vi.fn(async () => []),
    scanAcceptanceWarnings: vi.fn(async () => []),
    scanDelayExceededWarnings: vi.fn(async () => []),
    acknowledgeWarning: vi.fn(async () => null),
    muteWarning: vi.fn(async () => ({ id: 'warning-1' })),
    confirmWarningAsRisk: vi.fn(async () => null),
  }

  return {
    listNotifications: vi.fn(async () => []),
    findNotification: vi.fn(),
    updateNotificationById: vi.fn(async () => undefined),
    updateNotificationsByIds: vi.fn(async () => undefined),
    deleteNotificationById: vi.fn(async () => undefined),
    muteWarningNotification: vi.fn(async () => undefined),
    acknowledgeWarningNotification: vi.fn(async () => undefined),
    warningServiceInstance,
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    },
  }
})

vi.mock('../middleware/auth.js', () => ({
  authenticate: vi.fn((req: any, _res: any, next: () => void) => {
    req.user = { id: 'user-1' }
    next()
  }),
}))

vi.mock('../middleware/logger.js', () => ({
  logger: mocks.logger,
}))

vi.mock('../services/warningService.js', () => ({
  WarningService: vi.fn().mockImplementation(() => mocks.warningServiceInstance),
}))

vi.mock('../services/operationalNotificationService.js', () => ({
  OperationalNotificationService: vi.fn().mockImplementation(() => ({
    syncProjectNotifications: vi.fn(async () => undefined),
    syncAllProjectNotifications: vi.fn(async () => undefined),
  })),
}))

vi.mock('../services/planningGovernanceService.js', () => ({
  planningGovernanceService: {
    persistProjectGovernanceNotifications: vi.fn(async () => []),
  },
}))

vi.mock('../services/warningChainService.js', () => ({
  persistNotification: vi.fn(async () => undefined),
}))

vi.mock('../services/notificationStore.js', () => ({
  listNotifications: mocks.listNotifications,
  findNotification: mocks.findNotification,
  updateNotificationById: mocks.updateNotificationById,
  updateNotificationsByIds: mocks.updateNotificationsByIds,
  deleteNotificationById: mocks.deleteNotificationById,
}))

vi.mock('../services/upgradeChainService.js', () => ({
  acknowledgeWarningNotification: mocks.acknowledgeWarningNotification,
  muteWarningNotification: mocks.muteWarningNotification,
  applyWarningAcknowledgments: vi.fn((warnings: any[]) => warnings),
  isProtectedWarning: vi.fn(() => false),
  loadAcknowledgedWarningsForUser: vi.fn(async () => []),
}))

vi.mock('../services/dbService.js', () => ({
  supabase: {
    from: vi.fn(() => {
      const builder: Record<string, any> = {
        select: vi.fn(() => builder),
        eq: vi.fn(() => builder),
        single: vi.fn(async () => ({ data: null, error: null })),
      }
      return builder
    }),
  },
}))

function buildApp(path: string, router: express.Router) {
  const app = express()
  app.use(express.json())
  app.use(path, router)
  return app
}

describe('notification and warning mute durations', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.findNotification.mockResolvedValue({
      id: 'notification-1',
      source_entity_type: 'system',
      metadata: { origin: 'test' },
    })
    mocks.warningServiceInstance.muteWarning.mockResolvedValue({ id: 'warning-1' })
  })

  it('stores selected mute hours on notification mute', async () => {
    const { default: router } = await import('../routes/notifications.js')
    const response = await request(buildApp('/api/notifications', router))
      .put('/api/notifications/notification-1/mute')
      .send({ mutedHours: 4 })

    expect(response.status).toBe(200)
    expect(response.body.success).toBe(true)
    expect(response.body.data.message).toContain('4')
    expect(mocks.updateNotificationById).toHaveBeenCalledWith(
      'notification-1',
      expect.objectContaining({
        status: 'muted',
        muted_until: expect.any(String),
        metadata: expect.objectContaining({
          origin: 'test',
          muted_hours: 4,
          mute_duration: '4h',
        }),
      }),
    )
  })

  it('rejects unsupported notification mute duration', async () => {
    const { default: router } = await import('../routes/notifications.js')
    const response = await request(buildApp('/api/notifications', router))
      .put('/api/notifications/notification-1/mute')
      .send({ mutedHours: 2 })

    expect(response.status).toBe(400)
    expect(response.body.error.code).toBe('VALIDATION_ERROR')
    expect(response.body.error.details.allowed_hours).toEqual([1, 4, 24, 168])
    expect(mocks.updateNotificationById).not.toHaveBeenCalled()
  })

  it('passes multi-duration mute hours through warning mute route', async () => {
    const { default: router } = await import('../routes/warnings.js')
    const response = await request(buildApp('/api/warnings', router))
      .put('/api/warnings/warning-1/mute')
      .send({ mutedHours: 168 })

    expect(response.status).toBe(200)
    expect(response.body.success).toBe(true)
    expect(response.body.data.message).toContain('7')
    expect(mocks.warningServiceInstance.muteWarning).toHaveBeenCalledWith('warning-1', 168, 'user-1')
  })

  it('rejects unsupported warning mute duration', async () => {
    const { default: router } = await import('../routes/warnings.js')
    const response = await request(buildApp('/api/warnings', router))
      .put('/api/warnings/warning-1/mute')
      .send({ mutedHours: 2 })

    expect(response.status).toBe(400)
    expect(response.body.error.code).toBe('VALIDATION_ERROR')
    expect(mocks.warningServiceInstance.muteWarning).not.toHaveBeenCalled()
  })

  it('rejects oversized notification group acknowledge requests before synchronous fan-out', async () => {
    const { default: router } = await import('../routes/notifications.js')
    const response = await request(buildApp('/api/notifications', router))
      .put('/api/notifications/acknowledge-group')
      .send({
        ids: Array.from({ length: 101 }, (_, index) => `notification-${index + 1}`),
      })

    expect(response.status).toBe(413)
    expect(response.body.error.code).toBe('BATCH_ASYNC_REQUIRED')
    expect(response.body.error.details).toMatchObject({
      requested_count: 101,
      max_sync_items: 100,
    })
    expect(mocks.updateNotificationsByIds).not.toHaveBeenCalled()
    expect(mocks.acknowledgeWarningNotification).not.toHaveBeenCalled()
  })
})
