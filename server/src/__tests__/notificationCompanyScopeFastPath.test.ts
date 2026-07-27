import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Notification } from '../types/db.js'

const state = vi.hoisted(() => {
  const COMPANY_A = '11111111-1111-4111-8111-111111111111'
  const PROJECT_A = '22222222-2222-4222-8222-222222222222'
  const USER_NO_COMPANY = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa0'
  const USER_MEMBER_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'

  const rows: Notification[] = [
    {
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1',
      company_id: COMPANY_A,
      project_id: null,
      user_id: null,
      type: 'company_notice',
      notification_type: 'system-exception',
      title: '公司广播',
      content: 'company broadcast',
      is_read: false,
      is_broadcast: true,
      is_system: false,
      status: 'unread',
      metadata: {},
      created_at: '2026-06-17T01:00:00.000Z',
      updated_at: '2026-06-17T01:00:00.000Z',
    },
    {
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2',
      company_id: null,
      project_id: null,
      user_id: null,
      type: 'system_notice',
      notification_type: 'system-exception',
      title: '系统广播',
      content: 'system broadcast',
      is_read: false,
      is_broadcast: true,
      is_system: true,
      status: 'unread',
      metadata: {},
      created_at: '2026-06-17T00:00:00.000Z',
      updated_at: '2026-06-17T00:00:00.000Z',
    },
  ]

  return {
    COMPANY_A,
    PROJECT_A,
    USER_NO_COMPANY,
    USER_MEMBER_A,
    currentUserId: USER_NO_COMPANY,
    requestedCompanyId: COMPANY_A as string | null,
    membership: null as { companyId: string; role: 'regular' | 'company_admin' } | null,
    visibleProjectIds: [] as string[] | null,
    rows,
    rawQuery: vi.fn(),
    listNotifications: vi.fn(async () => []),
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    },
  }
})

function normalizeSql(sql: string) {
  return sql.replace(/\s+/g, ' ').trim().toLowerCase()
}

function result(rows: Notification[] | Array<Record<string, unknown>>) {
  return { rows, rowCount: rows.length }
}

function visibleNotificationsFor(params: unknown[]) {
  const [userId, companyId, canSeeAllProjects, projectIds] = params as [
    string,
    string | null,
    boolean,
    string[] | null,
  ]
  const projectIdFilter = typeof params[10] === 'string' ? params[10] : null
  const visibleProjectIds = Array.isArray(projectIds) ? projectIds.map(String) : []

  return state.rows.filter((row) => {
    if (projectIdFilter && row.project_id !== projectIdFilter) return false
    if (row.user_id === userId) return true
    if (row.project_id) {
      return canSeeAllProjects || visibleProjectIds.includes(row.project_id)
    }
    if (!row.is_broadcast) return false
    if (row.company_id) {
      return Boolean(companyId) && row.company_id === companyId
    }
    return Boolean(row.is_system)
  })
}

vi.mock('../middleware/auth.js', () => ({
  authenticate: vi.fn((req: any, _res: any, next: () => void) => {
    req.user = { id: state.currentUserId, globalRole: 'regular' }
    next()
  }),
}))

vi.mock('../auth/companyContext.js', () => ({
  getRequestCompanyId: vi.fn(() => state.requestedCompanyId),
}))

vi.mock('../auth/access.js', () => ({
  canAccessProject: vi.fn(async (_userId: string, projectId: string) => projectId === state.PROJECT_A),
  getCurrentCompanyMembership: vi.fn(async () => state.membership),
  getVisibleProjectIds: vi.fn(async () => state.visibleProjectIds),
}))

vi.mock('../database.js', () => ({
  query: state.rawQuery,
}))

vi.mock('../middleware/logger.js', () => ({
  logger: state.logger,
}))

vi.mock('../services/dbService.js', () => ({
  supabase: {
    from: vi.fn(() => {
      const builder: Record<string, any> = {
        select: vi.fn(() => builder),
        eq: vi.fn(() => builder),
        in: vi.fn(async () => ({ data: [], error: null })),
        upsert: vi.fn(async () => ({ data: null, error: null })),
      }
      return builder
    }),
  },
}))

vi.mock('../services/notificationStore.js', () => ({
  listNotifications: state.listNotifications,
  findNotification: vi.fn(),
  updateNotificationById: vi.fn(async () => undefined),
  updateNotificationsByIds: vi.fn(async () => undefined),
  deleteNotificationById: vi.fn(async () => undefined),
}))

vi.mock('../services/warningChainService.js', () => ({
  persistNotification: vi.fn(async () => undefined),
}))

vi.mock('../services/warningService.js', () => ({
  WarningService: vi.fn().mockImplementation(() => ({
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
  })),
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

vi.mock('../services/upgradeChainService.js', () => ({
  acknowledgeWarningNotification: vi.fn(async () => undefined),
  muteWarningNotification: vi.fn(async () => undefined),
  applyWarningAcknowledgments: vi.fn((warnings: any[]) => warnings),
  isProtectedWarning: vi.fn(() => false),
  loadAcknowledgedWarningsForUser: vi.fn(async () => []),
}))

vi.mock('../services/riskIssueWarningGovernanceService.js', () => ({
  buildWarningSignature: vi.fn(() => 'test-signature'),
  buildSourceHash: vi.fn(() => 'test-hash'),
  governanceAcknowledgeWarning: vi.fn(async () => true),
  governanceMuteWarning: vi.fn(async () => true),
  confirmWarningAsRisk: vi.fn(async () => null),
  upsertWarningLifecycle: vi.fn(async () => null),
  markSourceResolved: vi.fn(async () => undefined),
  markSourceDeleted: vi.fn(async () => undefined),
  isActiveWarningLifecycle: vi.fn(() => true),
}))

vi.mock('../services/notificationAnalyticsService.js', () => ({
  getNotificationAnalytics: vi.fn(async () => ({})),
}))

vi.mock('../services/todoTouchpointService.js', () => ({
  clearAttentionSummaryCache: vi.fn(),
}))

vi.mock('../services/notificationProducerAuditService.js', () => ({
  getNotificationProducerAudit: vi.fn(() => ({})),
}))

vi.mock('../services/notificationReconciliationService.js', () => ({
  getNotificationReconciliationCoverageMatrix: vi.fn(() => ({})),
}))

vi.mock('../services/notificationDeliveryGovernanceService.js', () => ({
  getNotificationDeliveryGovernanceDiagnostics: vi.fn(() => ({})),
}))

function buildApp(router: express.Router) {
  const app = express()
  app.use(express.json())
  app.use('/api/notifications', router)
  return app
}

describe('notification fast path company scope', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.currentUserId = state.USER_NO_COMPANY
    state.requestedCompanyId = state.COMPANY_A
    state.membership = null
    state.visibleProjectIds = []
    state.rows.splice(2)
    state.rawQuery.mockImplementation(async (sql: string, params: unknown[] = []) => {
      const normalized = normalizeSql(sql)
      if (normalized.includes('from public.notifications n')) {
        return result(visibleNotificationsFor(params))
      }
      if (normalized.includes('from public.notification_user_states')) {
        return result([])
      }
      throw new Error(`Unhandled notification query: ${sql}`)
    })
  })

  it('does not expose company broadcast notifications from a spoofed company header', async () => {
    const { default: router } = await import('../routes/notifications.js')

    const response = await request(buildApp(router))
      .get('/api/notifications')
      .set('X-Company-Id', state.COMPANY_A)

    expect(response.status).toBe(200)
    expect(response.body.success).toBe(true)
    expect(response.body.data.map((item: Notification) => item.id)).toEqual([
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2',
    ])
  })

  it('keeps company broadcast notifications visible for real company members', async () => {
    state.currentUserId = state.USER_MEMBER_A
    state.membership = { companyId: state.COMPANY_A, role: 'regular' }

    const { default: router } = await import('../routes/notifications.js')

    const response = await request(buildApp(router))
      .get('/api/notifications')
      .set('X-Company-Id', state.COMPANY_A)

    expect(response.status).toBe(200)
    expect(response.body.success).toBe(true)
    expect(response.body.data.map((item: Notification) => item.id)).toEqual([
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1',
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2',
    ])
  })

  it('uses the notification store as the project notification read source', async () => {
    const storeNotification = {
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb3',
      company_id: state.COMPANY_A,
      project_id: state.PROJECT_A,
      user_id: null,
      type: 'issue_created',
      notification_type: 'business-warning',
      title: '风险转问题闭环',
      content: 'issue notification persisted through Supabase store',
      is_read: false,
      is_broadcast: false,
      is_system: false,
      source_entity_type: 'issue',
      source_entity_id: 'issue-1',
      touchpoint_type: 'dashboard_todo',
      lifecycle_status: 'active',
      status: 'unread',
      metadata: {},
      recipients: [],
      created_at: '2026-06-17T02:00:00.000Z',
      updated_at: '2026-06-17T02:00:00.000Z',
    } as Notification
    state.currentUserId = state.USER_MEMBER_A
    state.membership = { companyId: state.COMPANY_A, role: 'regular' }
    state.listNotifications.mockResolvedValueOnce([storeNotification])
    state.rawQuery.mockImplementation(async (sql: string) => {
      const normalized = normalizeSql(sql)
      if (normalized.includes('from public.notification_user_states')) {
        return result([])
      }
      if (normalized.includes('from public.notifications')) {
        return result([])
      }
      throw new Error(`Unhandled notification query: ${sql}`)
    })

    const { default: router } = await import('../routes/notifications.js')

    const response = await request(buildApp(router))
      .get(`/api/notifications?projectId=${state.PROJECT_A}&touchpointType=all`)
      .set('X-Company-Id', state.COMPANY_A)

    expect(response.status).toBe(200)
    expect(response.body.success).toBe(true)
    expect(response.body.data).toEqual([
      expect.objectContaining({
        id: storeNotification.id,
        source_entity_type: 'issue',
        touchpoint_type: 'dashboard_todo',
      }),
    ])
    expect(state.listNotifications).toHaveBeenCalledWith(expect.objectContaining({
      projectId: state.PROJECT_A,
      touchpointType: undefined,
    }))
  })

  it('keeps project notifications visible when project access is valid without a current company membership row', async () => {
    const storeNotification = {
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb4',
      company_id: state.COMPANY_A,
      project_id: state.PROJECT_A,
      user_id: null,
      type: 'issue_created',
      notification_type: 'business-warning',
      title: '项目问题通知',
      content: 'project access should decide project-scoped notification visibility',
      is_read: false,
      is_broadcast: false,
      is_system: false,
      source_entity_type: 'issue',
      source_entity_id: 'issue-2',
      touchpoint_type: 'dashboard_todo',
      lifecycle_status: 'active',
      status: 'unread',
      metadata: {},
      recipients: [],
      created_at: '2026-06-17T03:00:00.000Z',
      updated_at: '2026-06-17T03:00:00.000Z',
    } as Notification
    state.currentUserId = state.USER_MEMBER_A
    state.membership = null
    state.listNotifications.mockResolvedValueOnce([storeNotification])
    state.rawQuery.mockImplementation(async (sql: string) => {
      const normalized = normalizeSql(sql)
      if (normalized.includes('from public.notification_user_states')) {
        return result([])
      }
      throw new Error(`Unhandled notification query: ${sql}`)
    })

    const { default: router } = await import('../routes/notifications.js')

    const response = await request(buildApp(router))
      .get(`/api/notifications?projectId=${state.PROJECT_A}&touchpointType=all`)
      .set('X-Company-Id', state.COMPANY_A)

    expect(response.status).toBe(200)
    expect(response.body.success).toBe(true)
    expect(response.body.data).toEqual([
      expect.objectContaining({
        id: storeNotification.id,
        project_id: state.PROJECT_A,
        source_entity_type: 'issue',
      }),
    ])
  })

  it('serves project notification summary from the fast read path without synchronous governance refresh', async () => {
    state.currentUserId = state.USER_MEMBER_A
    state.membership = { companyId: state.COMPANY_A, role: 'regular' }
    state.visibleProjectIds = [state.PROJECT_A]
    state.rows.push({
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb5',
      company_id: state.COMPANY_A,
      project_id: state.PROJECT_A,
      user_id: null,
      type: 'issue_created',
      notification_type: 'business-warning',
      title: '项目问题通知',
      content: 'project summary should stay read-only fast path',
      is_read: false,
      is_broadcast: false,
      is_system: false,
      source_entity_type: 'issue',
      source_entity_id: 'issue-3',
      touchpoint_type: 'dashboard_todo',
      lifecycle_status: 'active',
      status: 'unread',
      metadata: {},
      recipients: [],
      created_at: '2026-06-17T04:00:00.000Z',
      updated_at: '2026-06-17T04:00:00.000Z',
    } as Notification)

    const { default: router } = await import('../routes/notifications.js')

    const response = await request(buildApp(router))
      .get(`/api/notifications/summary?projectId=${state.PROJECT_A}`)
      .set('X-Company-Id', state.COMPANY_A)

    expect(response.status).toBe(200)
    expect(response.body.success).toBe(true)
    expect(response.body.data.allCount).toBe(1)
    expect(state.listNotifications).not.toHaveBeenCalled()
  })
})
