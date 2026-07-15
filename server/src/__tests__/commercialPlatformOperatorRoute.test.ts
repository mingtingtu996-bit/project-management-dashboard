import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getCurrentCompanyMembership: vi.fn(),
  isCommercialPlatformOperator: vi.fn(),
  getCommercialState: vi.fn(),
  changeCommercialStateAtomic: vi.fn(),
  createCommercialOrder: vi.fn(),
  recordCommercialPaymentEventAtomic: vi.fn(),
}))

const COMPANY_ID = '11111111-1111-4111-8111-111111111111'
const USER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'

vi.mock('../middleware/auth.js', () => ({
  authenticate: vi.fn((req: any, _res: any, next: () => void) => {
    req.user = { id: USER_ID, currentCompanyId: COMPANY_ID }
    next()
  }),
}))

vi.mock('../auth/access.js', () => ({
  getCurrentCompanyMembership: mocks.getCurrentCompanyMembership,
}))

vi.mock('../services/commercialFoundationService.js', () => ({
  getCommercialState: mocks.getCommercialState,
  createCommercialOrder: mocks.createCommercialOrder,
}))

vi.mock('../services/commercialTransactionService.js', () => ({
  isCommercialPlatformOperator: mocks.isCommercialPlatformOperator,
  changeCommercialStateAtomic: mocks.changeCommercialStateAtomic,
  recordCommercialPaymentEventAtomic: mocks.recordCommercialPaymentEventAtomic,
}))

const { default: commercialRouter } = await import('../routes/commercial.js')

function app() {
  const instance = express()
  instance.use(express.json())
  instance.use('/api/commercial', commercialRouter)
  return instance
}

describe('commercial platform operator route boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getCurrentCompanyMembership.mockResolvedValue({ companyId: COMPANY_ID, role: 'company_admin' })
    mocks.isCommercialPlatformOperator.mockResolvedValue(false)
    mocks.getCommercialState.mockResolvedValue({ company_id: COMPANY_ID, plan_tier: 'free' })
    mocks.changeCommercialStateAtomic.mockResolvedValue({ company_id: COMPANY_ID, plan_tier: 'starter' })
    mocks.recordCommercialPaymentEventAtomic.mockResolvedValue({ applied: true, reason: 'payment_applied' })
  })

  it('does not let a tenant company admin change tier, quota or billing state', async () => {
    const response = await request(app())
      .patch('/api/commercial/state')
      .set('x-company-id', COMPANY_ID)
      .send({ planTier: 'starter', activeProjectLimit: 2, billingEnabled: true })

    expect(response.status).toBe(403)
    expect(response.body.error.code).toBe('COMMERCIAL_PLATFORM_OPERATOR_REQUIRED')
    expect(mocks.changeCommercialStateAtomic).not.toHaveBeenCalled()
  })

  it('allows a platform commercial operator to change commercial state', async () => {
    mocks.isCommercialPlatformOperator.mockResolvedValue(true)

    const response = await request(app())
      .patch('/api/commercial/state')
      .set('x-company-id', COMPANY_ID)
      .send({ planTier: 'starter', activeProjectLimit: 2, billingEnabled: true, reason: 'approved_upgrade' })

    expect(response.status).toBe(200)
    expect(mocks.changeCommercialStateAtomic).toHaveBeenCalledWith(expect.objectContaining({
      companyId: COMPANY_ID,
      actorUserId: USER_ID,
    }))
  })

  it('does not let a tenant company admin verify or apply payment events', async () => {
    const response = await request(app())
      .post('/api/commercial/orders/order-1/payment-events')
      .set('x-company-id', COMPANY_ID)
      .send({
        paymentProvider: 'manual',
        eventType: 'payment_succeeded',
        eventStatus: 'verified',
        providerEventId: 'event-1',
      })

    expect(response.status).toBe(403)
    expect(response.body.error.code).toBe('COMMERCIAL_PLATFORM_OPERATOR_REQUIRED')
    expect(mocks.recordCommercialPaymentEventAtomic).not.toHaveBeenCalled()
  })
})
