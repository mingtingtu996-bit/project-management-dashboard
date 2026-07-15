import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  authUser: { id: 'owner-1', globalRole: 'regular' } as { id: string; globalRole: string },
  confirmRetentionDecision: vi.fn(),
  getRetentionGovernanceDiagnostics: vi.fn(),
  previewRetentionConfirmedAction: vi.fn(),
  resolveRetentionOperatorAttention: vi.fn(),
  getCurrentCompanyMembership: vi.fn(),
  getVisibleProjectIds: vi.fn(),
}))

vi.mock('../middleware/auth.js', () => ({
  authenticate: vi.fn((req: any, _res: any, next: () => void) => {
    req.user = mocks.authUser
    next()
  }),
  requireProjectEditor: vi.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()),
}))

vi.mock('../auth/access.js', () => ({
  getCurrentCompanyMembership: mocks.getCurrentCompanyMembership,
  getVisibleProjectIds: mocks.getVisibleProjectIds,
  isCompanyAdminRole: vi.fn((role?: string | null) => role === 'company_admin'),
}))

vi.mock('../auth/companyContext.js', () => ({
  getRequestCompanyId: vi.fn(() => 'company-1'),
}))

vi.mock('../services/deletionRetentionGovernanceService.js', () => ({
  confirmRetentionDecision: mocks.confirmRetentionDecision,
  getRetentionGovernanceDiagnostics: mocks.getRetentionGovernanceDiagnostics,
  previewRetentionConfirmedAction: mocks.previewRetentionConfirmedAction,
  resolveRetentionOperatorAttention: mocks.resolveRetentionOperatorAttention,
}))

function buildApp(router: express.Router) {
  const app = express()
  app.use(express.json())
  app.use('/api/deletion-retention', router)
  return app
}

describe('deletion retention routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.authUser = { id: 'owner-1', globalRole: 'regular' }
    mocks.confirmRetentionDecision.mockResolvedValue({
      eventId: 'event-1',
      projectId: 'project-1',
      entityType: 'task',
      entityId: 'task-1',
      requestedAction: 'delete',
      resolvedAction: 'soft_delete',
      executionStatus: 'executed',
      confirmedAt: '2026-05-14T00:00:00.000Z',
      expiresAt: null,
    })
    mocks.getRetentionGovernanceDiagnostics.mockResolvedValue({
      summary: {
        totalEvents: 0,
        pendingConfirmationCount: 0,
        rejectedCount: 0,
        executedCount: 0,
      },
      byEntityType: {},
      byReasonCode: {},
      coverage: { coveredEntityTypes: ['task'], entries: [] },
      executorRegistry: { entries: [] },
    })
    mocks.previewRetentionConfirmedAction.mockResolvedValue({
      previewOnly: true,
      applied: false,
      supported: true,
      entityType: 'project_material',
      entityId: 'material-1',
      resolvedAction: 'archive',
      mutations: [],
    })
    mocks.resolveRetentionOperatorAttention.mockResolvedValue({
      eventId: 'event-1',
      projectId: 'project-1',
      action: 'mark_handled',
      executionStatus: 'cancelled_by_user',
    })
    mocks.getCurrentCompanyMembership.mockResolvedValue({ role: 'company_admin', companyId: 'company-1' })
    mocks.getVisibleProjectIds.mockResolvedValue(['project-1'])
  })

  it('confirms a pending retention decision token', async () => {
    const { default: router } = await import('../routes/deletion-retention.js')
    const response = await request(buildApp(router))
      .post('/api/deletion-retention/confirm')
      .send({ projectId: 'project-1', decisionToken: 'event-1.token' })

    expect(response.status).toBe(200)
    expect(response.body.data).toMatchObject({
      eventId: 'event-1',
      executionStatus: 'executed',
    })
    expect(mocks.confirmRetentionDecision).toHaveBeenCalledWith({
      projectId: 'project-1',
      decisionToken: 'event-1.token',
      actorId: 'owner-1',
    })
  })

  it('rejects confirmation without a project and decision token', async () => {
    const { default: router } = await import('../routes/deletion-retention.js')
    const response = await request(buildApp(router))
      .post('/api/deletion-retention/confirm')
      .send({ projectId: 'project-1' })

    expect(response.status).toBe(400)
    expect(response.body.error.code).toBe('RETENTION_DECISION_TOKEN_REQUIRED')
    expect(response.body.error.message).toBe('缺少保留处置凭证，请刷新后重新发起操作。')
  })

  it('returns stable user-facing messages for known confirmation failures', async () => {
    mocks.confirmRetentionDecision.mockRejectedValueOnce(new Error('ENTITY_RETENTION_DECISION_EXPIRED'))

    const { default: router } = await import('../routes/deletion-retention.js')
    const response = await request(buildApp(router))
      .post('/api/deletion-retention/confirm')
      .send({ projectId: 'project-1', decisionToken: 'event-1.token' })

    expect(response.status).toBe(409)
    expect(response.body.error).toMatchObject({
      code: 'ENTITY_RETENTION_DECISION_EXPIRED',
      message: '保留处置凭证已过期或引用关系已变化，请刷新后重新发起操作。',
    })
  })

  it('returns retention governance diagnostics for company admin management views', async () => {
    const { default: router } = await import('../routes/deletion-retention.js')
    const response = await request(buildApp(router))
      .get('/api/deletion-retention/diagnostics')

    expect(response.status).toBe(200)
    expect(response.body.data.summary.totalEvents).toBe(0)
    expect(mocks.getVisibleProjectIds).toHaveBeenCalledWith('owner-1', 'regular', 'company-1')
    expect(mocks.getRetentionGovernanceDiagnostics).toHaveBeenCalledWith({
      companyId: 'company-1',
      visibleProjectIds: ['project-1'],
    })
  })

  it('rejects diagnostics for non-admin users', async () => {
    mocks.getCurrentCompanyMembership.mockResolvedValueOnce({ role: 'regular', companyId: 'company-1' })

    const { default: router } = await import('../routes/deletion-retention.js')
    const response = await request(buildApp(router))
      .get('/api/deletion-retention/diagnostics')

    expect(response.status).toBe(403)
    expect(response.body.error.code).toBe('FORBIDDEN')
    expect(mocks.getRetentionGovernanceDiagnostics).not.toHaveBeenCalled()
  })

  it('does not trust a JWT company_admin role without an active company admin membership', async () => {
    mocks.authUser = { id: 'owner-1', globalRole: 'company_admin' }
    mocks.getCurrentCompanyMembership.mockResolvedValueOnce({ role: 'regular', companyId: 'company-1' })

    const { default: router } = await import('../routes/deletion-retention.js')
    const response = await request(buildApp(router))
      .get('/api/deletion-retention/diagnostics')

    expect(response.status).toBe(403)
    expect(response.body.error.code).toBe('FORBIDDEN')
    expect(mocks.getCurrentCompanyMembership).toHaveBeenCalledWith('owner-1', 'company-1')
    expect(mocks.getVisibleProjectIds).not.toHaveBeenCalled()
    expect(mocks.getRetentionGovernanceDiagnostics).not.toHaveBeenCalled()
  })

  it('previews a confirmed retention action without executing it', async () => {
    const { default: router } = await import('../routes/deletion-retention.js')
    const response = await request(buildApp(router))
      .post('/api/deletion-retention/preview')
      .send({
        projectId: 'project-1',
        entityType: 'project_material',
        entityId: 'material-1',
        resolvedAction: 'archive',
      })

    expect(response.status).toBe(200)
    expect(response.body.data).toMatchObject({
      previewOnly: true,
      applied: false,
      entityType: 'project_material',
      entityId: 'material-1',
    })
    expect(mocks.previewRetentionConfirmedAction).toHaveBeenCalledWith({
      projectId: 'project-1',
      entityType: 'project_material',
      entityId: 'material-1',
      resolvedAction: 'archive',
      actorId: 'owner-1',
    })
  })

  it('lets company admins close operator attention items through an action endpoint', async () => {
    const { default: router } = await import('../routes/deletion-retention.js')
    const response = await request(buildApp(router))
      .post('/api/deletion-retention/operator-actions')
      .send({
        projectId: 'project-1',
        eventId: 'event-1',
        action: 'mark_handled',
        note: 'handled during operations review',
      })

    expect(response.status).toBe(200)
    expect(response.body.data).toMatchObject({
      eventId: 'event-1',
      executionStatus: 'cancelled_by_user',
    })
    expect(mocks.resolveRetentionOperatorAttention).toHaveBeenCalledWith({
      projectId: 'project-1',
      eventId: 'event-1',
      action: 'mark_handled',
      note: 'handled during operations review',
      actorId: 'owner-1',
    })
  })

  it('rejects operator actions outside the administrator visible project scope', async () => {
    mocks.getVisibleProjectIds.mockResolvedValueOnce(['project-other'])

    const { default: router } = await import('../routes/deletion-retention.js')
    const response = await request(buildApp(router))
      .post('/api/deletion-retention/operator-actions')
      .send({
        projectId: 'project-1',
        eventId: 'event-1',
        action: 'mark_handled',
      })

    expect(response.status).toBe(403)
    expect(response.body.error.code).toBe('FORBIDDEN')
    expect(mocks.resolveRetentionOperatorAttention).not.toHaveBeenCalled()
  })

  it('keeps actor-mismatch confirmations on the conflict behavior contract', async () => {
    mocks.confirmRetentionDecision.mockRejectedValueOnce(new Error('RETENTION_DECISION_ACTOR_MISMATCH'))

    const { default: router } = await import('../routes/deletion-retention.js')
    const response = await request(buildApp(router))
      .post('/api/deletion-retention/confirm')
      .send({ projectId: 'project-1', decisionToken: 'event-1.token' })

    expect(response.status).toBe(409)
    expect(response.body.error.code).toBe('RETENTION_DECISION_ACTOR_MISMATCH')
  })
})
