import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const governanceMuteWarningMock = vi.fn(async () => true)
  const governanceAcknowledgeWarningMock = vi.fn(async () => true)

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
    upsertNotificationUserState: vi.fn(async (
      _payload: Record<string, unknown>,
      _options: { onConflict: string },
    ) => ({ data: null, error: null })),
    muteWarningNotification: vi.fn(async () => undefined),
    acknowledgeWarningNotification: vi.fn(async () => undefined),
    governanceMuteWarningMock,
    governanceAcknowledgeWarningMock,
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
  requireProjectMember: vi.fn((_getProjectId: any) => (req: any, _res: any, next: () => void) => next()),
  requireProjectEditor: vi.fn((_getProjectId: any) => (req: any, _res: any, next: () => void) => next()),
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

vi.mock('../services/riskIssueWarningGovernanceService.js', () => ({
  buildWarningSignature: vi.fn(() => 'test-signature'),
  buildSourceHash: vi.fn(() => 'test-hash'),
  governanceAcknowledgeWarning: mocks.governanceAcknowledgeWarningMock,
  governanceMuteWarning: mocks.governanceMuteWarningMock,
  confirmWarningAsRisk: vi.fn(async () => null),
  upsertWarningLifecycle: vi.fn(async () => null),
  markSourceResolved: vi.fn(async () => undefined),
  markSourceDeleted: vi.fn(async () => undefined),
  isActiveWarningLifecycle: vi.fn(() => true),
}))

vi.mock('../services/dbService.js', () => ({
  supabase: {
    from: vi.fn(() => {
      const builder: Record<string, any> = {
        select: vi.fn(() => builder),
        eq: vi.fn(() => builder),
        single: vi.fn(async () => ({ data: { project_id: 'project-1' }, error: null })),
        update: vi.fn(() => builder),
        insert: vi.fn(() => builder),
        upsert: mocks.upsertNotificationUserState,
        maybeSingle: vi.fn(async () => ({ data: null, error: null })),
        limit: vi.fn(() => builder),
        in: vi.fn(() => builder),
      }
      return builder
    }),
    update: vi.fn(),
    query: vi.fn(async () => []),
    delete: vi.fn(),
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
      recipients: ['user-1'],
      metadata: { origin: 'test' },
    })
    mocks.warningServiceInstance.muteWarning.mockResolvedValue({ id: 'warning-1' })
  })

  it('stores selected mute hours on notification mute', async () => {
    const requestStartedAt = Date.now()
    const { default: router } = await import('../routes/notifications.js')
    const response = await request(buildApp('/api/notifications', router))
      .put('/api/notifications/notification-1/mute')
      .send({ mutedHours: 4 })
    const requestFinishedAt = Date.now()

    expect(response.status).toBe(200)
    expect(response.body.success).toBe(true)
    expect(response.body.data.message).toContain('4')
    expect(mocks.updateNotificationById).not.toHaveBeenCalled()
    expect(mocks.upsertNotificationUserState).toHaveBeenCalledWith(
      expect.objectContaining({
        notification_id: 'notification-1',
        user_id: 'user-1',
        is_muted: true,
        muted_at: expect.any(String),
        muted_until: expect.any(String),
        updated_at: expect.any(String),
      }),
      { onConflict: 'notification_id,user_id' },
    )
    const mutedUntil = String(mocks.upsertNotificationUserState.mock.calls[0]?.[0]?.muted_until ?? '')
    expect(new Date(mutedUntil).getTime()).toBeGreaterThanOrEqual(requestStartedAt + 4 * 60 * 60 * 1000)
    expect(new Date(mutedUntil).getTime()).toBeLessThanOrEqual(requestFinishedAt + 4 * 60 * 60 * 1000)
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
    expect(mocks.upsertNotificationUserState).not.toHaveBeenCalled()
  })

  it('passes multi-duration mute hours through warning mute route', async () => {
    const { default: router } = await import('../routes/warnings.js')
    const response = await request(buildApp('/api/warnings', router))
      .put('/api/warnings/warning-1/mute')
      .send({ mutedHours: 168 })

    expect(response.status).toBe(200)
    expect(response.body.success).toBe(true)
    expect(response.body.data.message).toContain('7')
    expect(mocks.governanceMuteWarningMock).toHaveBeenCalledWith('project-1', 'warning-1', 168, 'user-1')
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
    expect(mocks.upsertNotificationUserState).not.toHaveBeenCalled()
  })
})
