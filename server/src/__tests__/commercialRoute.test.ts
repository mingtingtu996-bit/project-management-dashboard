import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getCurrentCompanyMembership: vi.fn(),
  getCommercialState: vi.fn(),
  countActiveProjects: vi.fn(),
  isCommercialPlatformOperator: vi.fn(),
  changeCommercialStateAtomic: vi.fn(),
  createCommercialOrder: vi.fn(),
  recordCommercialPaymentEventAtomic: vi.fn(),
}))

const COMPANY_ID = '11111111-1111-4111-8111-111111111111'
const USER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'

vi.mock('../middleware/auth.js', () => ({
  authenticate: vi.fn((req: any, _res: any, next: () => void) => {
    req.user = { id: USER_ID, globalRole: 'company_admin', currentCompanyId: COMPANY_ID }
    next()
  }),
}))

vi.mock('../auth/access.js', () => ({
  getCurrentCompanyMembership: mocks.getCurrentCompanyMembership,
}))

vi.mock('../services/commercialFoundationService.js', () => ({
  COMMERCIAL_PLAN_CATALOG: {
    free: { tier: 'free', projectLimit: 1, monthlyPriceCents: 0, selfServiceAvailable: true },
    starter: { tier: 'starter', projectLimit: 2, monthlyPriceCents: 4900, selfServiceAvailable: true },
    pro: { tier: 'pro', projectLimit: 5, monthlyPriceCents: 14900, selfServiceAvailable: true },
    group: { tier: 'group', projectLimit: null, monthlyPriceCents: null, selfServiceAvailable: false },
  },
  countActiveProjects: mocks.countActiveProjects,
  getCommercialState: mocks.getCommercialState,
  createCommercialOrder: mocks.createCommercialOrder,
}))

vi.mock('../services/commercialTransactionService.js', () => ({
  isCommercialPlatformOperator: mocks.isCommercialPlatformOperator,
  changeCommercialStateAtomic: mocks.changeCommercialStateAtomic,
  recordCommercialPaymentEventAtomic: mocks.recordCommercialPaymentEventAtomic,
}))

const { default: commercialRouter } = await import('../routes/commercial.js')

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/commercial', commercialRouter)
  return app
}

function state(overrides: Record<string, unknown> = {}) {
  return {
    company_id: COMPANY_ID,
    plan_tier: 'free',
    commercial_state: 'trial',
    active_project_limit: 1,
    billing_enabled: false,
    onboarded_at: '2026-06-30T00:00:00.000Z',
    plan_started_at: null,
    plan_expires_at: null,
    updated_by: null,
    updated_at: '2026-06-30T00:00:00.000Z',
    ...overrides,
  }
}

describe('commercial route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getCurrentCompanyMembership.mockResolvedValue({
      companyId: COMPANY_ID,
      role: 'company_admin',
    })
    mocks.getCommercialState.mockResolvedValue(state())
    mocks.countActiveProjects.mockResolvedValue(1)
    mocks.isCommercialPlatformOperator.mockResolvedValue(false)
    mocks.changeCommercialStateAtomic.mockResolvedValue(state({
      plan_tier: 'pro',
      commercial_state: 'active',
      active_project_limit: 5,
      billing_enabled: true,
      updated_by: USER_ID,
    }))
    mocks.createCommercialOrder.mockResolvedValue({
      id: 'order-1',
      company_id: COMPANY_ID,
      plan_tier: 'pro',
      amount_cents: 9800,
      currency: 'CNY',
      payment_provider: 'manual',
      payment_status: 'draft',
    })
    mocks.recordCommercialPaymentEventAtomic.mockResolvedValue({
      applied: false,
      reason: 'billing_disabled',
      order: {
        id: 'order-1',
        company_id: COMPANY_ID,
        plan_tier: 'pro',
        payment_status: 'draft',
      },
      event: {
        id: 100,
        order_id: 'order-1',
        company_id: COMPANY_ID,
        event_status: 'verified',
      },
      state: state({ billing_enabled: false }),
    })
  })

  it('returns current company commercial state for company admins', async () => {
    const response = await request(buildApp())
      .get('/api/commercial/state')
      .set('x-company-id', COMPANY_ID)

    expect(response.status).toBe(200)
    expect(response.body.data.company_id).toBe(COMPANY_ID)
    expect(response.body.data.active_project_count).toBe(1)
    expect(response.body.data.plans.starter.monthlyPriceCents).toBe(4900)
    expect(mocks.getCommercialState).toHaveBeenCalledWith(COMPANY_ID)
  })

  it('requires a platform operator for commercial state changes', async () => {
    const response = await request(buildApp())
      .patch('/api/commercial/state')
      .set('x-company-id', COMPANY_ID)
      .send({ planTier: 'pro' })

    expect(response.status).toBe(403)
    expect(response.body.error.code).toBe('COMMERCIAL_PLATFORM_OPERATOR_REQUIRED')
    expect(mocks.changeCommercialStateAtomic).not.toHaveBeenCalled()
  })

  it('changes tier and billing switch through the audited service', async () => {
    mocks.isCommercialPlatformOperator.mockResolvedValueOnce(true)
    const response = await request(buildApp())
      .patch('/api/commercial/state')
      .set('x-company-id', COMPANY_ID)
      .send({
        planTier: 'pro',
        commercialState: 'active',
        activeProjectLimit: 5,
        billingEnabled: true,
        reason: 'manual_upgrade',
      })

    expect(response.status).toBe(200)
    expect(response.body.data.plan_tier).toBe('pro')
    expect(mocks.changeCommercialStateAtomic).toHaveBeenCalledWith({
      companyId: COMPANY_ID,
      actorUserId: USER_ID,
      patch: expect.objectContaining({
        planTier: 'pro',
        commercialState: 'active',
        activeProjectLimit: 5,
        billingEnabled: true,
        reason: 'manual_upgrade',
      }),
    })
  })

  it('forwards high-risk confirmation fields to the audited service', async () => {
    mocks.isCommercialPlatformOperator.mockResolvedValueOnce(true)
    const response = await request(buildApp())
      .patch('/api/commercial/state')
      .set('x-company-id', COMPANY_ID)
      .send({
        commercial_state: 'suspended',
        reason: 'overdue_payment',
        high_risk_confirmation: true,
      })

    expect(response.status).toBe(200)
    expect(mocks.changeCommercialStateAtomic).toHaveBeenCalledWith({
      companyId: COMPANY_ID,
      actorUserId: USER_ID,
      patch: expect.objectContaining({
        commercialState: 'suspended',
        reason: 'overdue_payment',
        highRiskConfirmation: true,
      }),
    })
  })

  it('returns a stable error code when high-risk commercial confirmation is missing', async () => {
    const error = new Error('COMMERCIAL_HIGH_RISK_CONFIRMATION_REQUIRED') as Error & {
      code?: string
      statusCode?: number
    }
    error.code = 'COMMERCIAL_HIGH_RISK_CONFIRMATION_REQUIRED'
    error.statusCode = 400
    mocks.isCommercialPlatformOperator.mockResolvedValueOnce(true)
    mocks.changeCommercialStateAtomic.mockRejectedValueOnce(error)

    const response = await request(buildApp())
      .patch('/api/commercial/state')
      .set('x-company-id', COMPANY_ID)
      .send({
        commercialState: 'archived',
        reason: 'company_closed',
      })

    expect(response.status).toBe(400)
    expect(response.body.error.code).toBe('COMMERCIAL_HIGH_RISK_CONFIRMATION_REQUIRED')
  })

  it('creates default-off manual commercial orders for company admins', async () => {
    const response = await request(buildApp())
      .post('/api/commercial/orders')
      .set('x-company-id', COMPANY_ID)
      .send({
        planTier: 'pro',
        amountCents: 9800,
        paymentProvider: 'manual',
      })

    expect(response.status).toBe(201)
    expect(response.body.data.payment_status).toBe('draft')
    expect(mocks.createCommercialOrder).toHaveBeenCalledWith({
      companyId: COMPANY_ID,
      actorUserId: USER_ID,
      planTier: 'pro',
      amountCents: 9800,
      currency: undefined,
      paymentProvider: 'manual',
    })
  })

  it('records default-off payment events without public provider webhooks', async () => {
    mocks.isCommercialPlatformOperator.mockResolvedValueOnce(true)
    const response = await request(buildApp())
      .post('/api/commercial/orders/order-1/payment-events')
      .set('x-company-id', COMPANY_ID)
      .send({
        paymentProvider: 'manual',
        eventType: 'payment_succeeded',
        eventStatus: 'verified',
        providerEventId: 'manual-paid-1',
        payload: { receiptRef: 'bank-transfer-1' },
      })

    expect(response.status).toBe(202)
    expect(response.body.data.reason).toBe('billing_disabled')
    expect(mocks.recordCommercialPaymentEventAtomic).toHaveBeenCalledWith({
      companyId: COMPANY_ID,
      actorUserId: USER_ID,
      orderId: 'order-1',
      paymentProvider: 'manual',
      eventType: 'payment_succeeded',
      eventStatus: 'verified',
      providerEventId: 'manual-paid-1',
      payload: { receiptRef: 'bank-transfer-1' },
    })
  })
})
