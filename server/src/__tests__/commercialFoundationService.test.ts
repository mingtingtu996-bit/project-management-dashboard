import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
}))

vi.mock('../database.js', () => ({
  query: mocks.query,
}))

const COMPANY_ID = '11111111-1111-4111-8111-111111111111'
const USER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'

function result(rows: Array<Record<string, unknown>>) {
  return { rows, rowCount: rows.length }
}

function commercialRow(overrides: Record<string, unknown> = {}) {
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

describe('commercial foundation service', () => {
  beforeEach(() => {
    vi.resetModules()
    mocks.query.mockReset()
  })

  it('allows project creation when billing is disabled while still recording metering', async () => {
    const { canCreateProject } = await import('../services/commercialFoundationService.js')
    mocks.query
      .mockResolvedValueOnce(result([commercialRow({ billing_enabled: false })]))
      .mockResolvedValueOnce(result([{ count: 12 }]))
      .mockResolvedValueOnce(result([]))

    const decision = await canCreateProject({ companyId: COMPANY_ID, actorUserId: USER_ID })

    expect(decision.allowed).toBe(true)
    expect(decision.billingEnabled).toBe(false)
    expect(decision.activeProjectCount).toBe(12)
    expect(mocks.query.mock.calls[2]?.[0]).toContain('INSERT INTO public.company_commercial_audit')
    expect(mocks.query.mock.calls[2]?.[1]).toEqual(expect.arrayContaining([
      COMPANY_ID,
      'commercial_metering_recorded',
      USER_ID,
    ]))
  })

  it('blocks the next active project when billing is enabled and free quota is reached', async () => {
    const { canCreateProject } = await import('../services/commercialFoundationService.js')
    mocks.query
      .mockResolvedValueOnce(result([commercialRow({ billing_enabled: true, active_project_limit: 1 })]))
      .mockResolvedValueOnce(result([{ count: 1 }]))
      .mockResolvedValueOnce(result([]))

    const decision = await canCreateProject({ companyId: COMPANY_ID, actorUserId: USER_ID })

    expect(decision.allowed).toBe(false)
    expect(decision.error).toEqual(expect.objectContaining({
      code: 'COMMERCIAL_PROJECT_LIMIT_REACHED',
      upgradePath: '/settings/billing',
    }))
    expect(decision.error?.details).toEqual(expect.objectContaining({
      activeProjectCount: 1,
      activeProjectLimit: 1,
      billingEnabled: true,
    }))
  })

  it('blocks suspended companies before evaluating quota semantics', async () => {
    const { canCreateProject } = await import('../services/commercialFoundationService.js')
    mocks.query
      .mockResolvedValueOnce(result([commercialRow({
        billing_enabled: true,
        commercial_state: 'suspended',
        active_project_limit: 99,
      })]))
      .mockResolvedValueOnce(result([{ count: 0 }]))
      .mockResolvedValueOnce(result([]))

    const decision = await canCreateProject({ companyId: COMPANY_ID, actorUserId: USER_ID })

    expect(decision.allowed).toBe(false)
    expect(decision.error?.code).toBe('COMMERCIAL_STATE_SUSPENDED')
  })

  it('uses the authoritative starter and pro prices instead of trusting client amounts', async () => {
    const { COMMERCIAL_PLAN_CATALOG, createCommercialOrder } = await import('../services/commercialFoundationService.js')
    mocks.query.mockResolvedValueOnce(result([{
      id: 'order-starter',
      company_id: COMPANY_ID,
      plan_tier: 'starter',
      amount_cents: 4900,
      currency: 'CNY',
      payment_provider: 'manual',
      payment_status: 'draft',
    }]))

    await createCommercialOrder({
      companyId: COMPANY_ID,
      planTier: 'starter',
      amountCents: 1,
      actorUserId: USER_ID,
    })

    expect(COMMERCIAL_PLAN_CATALOG).toEqual(expect.objectContaining({
      free: expect.objectContaining({ projectLimit: 1, monthlyPriceCents: 0 }),
      starter: expect.objectContaining({ projectLimit: 2, monthlyPriceCents: 4900 }),
      pro: expect.objectContaining({ projectLimit: 5, monthlyPriceCents: 14900 }),
      group: expect.objectContaining({ selfServiceAvailable: false }),
    }))
    expect(mocks.query.mock.calls[0]?.[1]).toEqual(expect.arrayContaining([
      COMPANY_ID,
      'starter',
      4900,
    ]))
  })

  it('writes audit whenever commercial state changes', async () => {
    const { changeCommercialState } = await import('../services/commercialFoundationService.js')
    mocks.query
      .mockResolvedValueOnce(result([commercialRow({ billing_enabled: false })]))
      .mockResolvedValueOnce(result([commercialRow({
        plan_tier: 'pro',
        commercial_state: 'active',
        active_project_limit: 5,
        billing_enabled: true,
        updated_by: USER_ID,
      })]))
      .mockResolvedValueOnce(result([]))

    const state = await changeCommercialState({
      companyId: COMPANY_ID,
      actorUserId: USER_ID,
      patch: {
        planTier: 'pro',
        commercialState: 'active',
        activeProjectLimit: 5,
        billingEnabled: true,
        reason: 'manual_upgrade',
      },
    })

    expect(state.plan_tier).toBe('pro')
    expect(state.billing_enabled).toBe(true)
    const auditCall = mocks.query.mock.calls[2]
    expect(String(auditCall?.[0] ?? '')).toContain('INSERT INTO public.company_commercial_audit')
    expect(auditCall?.[1]).toEqual(expect.arrayContaining([
      COMPANY_ID,
      'commercial_state_changed',
      'trial',
      'active',
      'free',
      'pro',
      'manual_upgrade',
      USER_ID,
    ]))
  })

  it('blocks high-risk commercial state changes without explicit confirmation and reason', async () => {
    const { changeCommercialState } = await import('../services/commercialFoundationService.js')
    mocks.query
      .mockResolvedValueOnce(result([commercialRow({ commercial_state: 'active', billing_enabled: true })]))

    await expect(changeCommercialState({
      companyId: COMPANY_ID,
      actorUserId: USER_ID,
      patch: {
        commercialState: 'suspended',
        reason: 'overdue_payment',
      },
    })).rejects.toMatchObject({
      code: 'COMMERCIAL_HIGH_RISK_CONFIRMATION_REQUIRED',
      statusCode: 400,
    })

    expect(mocks.query).toHaveBeenCalledTimes(1)
    expect(String(mocks.query.mock.calls[0]?.[0] ?? '')).toContain('RETURNING')
    expect(mocks.query.mock.calls.some(([sql]) => String(sql ?? '').includes('UPDATE public.company_commercial'))).toBe(false)
    expect(mocks.query.mock.calls.some(([sql]) => String(sql ?? '').includes('INSERT INTO public.company_commercial_audit'))).toBe(false)
  })

  it('allows confirmed high-risk commercial state changes and records audit', async () => {
    const { changeCommercialState } = await import('../services/commercialFoundationService.js')
    mocks.query
      .mockResolvedValueOnce(result([commercialRow({ commercial_state: 'active', billing_enabled: true })]))
      .mockResolvedValueOnce(result([commercialRow({
        commercial_state: 'suspended',
        billing_enabled: true,
        updated_by: USER_ID,
      })]))
      .mockResolvedValueOnce(result([]))

    const state = await changeCommercialState({
      companyId: COMPANY_ID,
      actorUserId: USER_ID,
      patch: {
        commercialState: 'suspended',
        reason: 'overdue_payment',
        highRiskConfirmation: true,
      },
    })

    expect(state.commercial_state).toBe('suspended')
    expect(String(mocks.query.mock.calls[1]?.[0] ?? '')).toContain('UPDATE public.company_commercial')
    expect(String(mocks.query.mock.calls[2]?.[0] ?? '')).toContain('INSERT INTO public.company_commercial_audit')
    expect(mocks.query.mock.calls[2]?.[1]).toEqual(expect.arrayContaining([
      COMPANY_ID,
      'commercial_state_changed',
      'active',
      'suspended',
      'overdue_payment',
      USER_ID,
    ]))
  })

  it('records verified payment events without applying tier changes while billing is disabled', async () => {
    const { recordCommercialPaymentEvent } = await import('../services/commercialFoundationService.js')
    mocks.query
      .mockResolvedValueOnce(result([{
        id: 'order-1',
        company_id: COMPANY_ID,
        plan_tier: 'pro',
        amount_cents: 9800,
        currency: 'CNY',
        payment_provider: 'manual',
        payment_status: 'draft',
        provider_order_id: null,
      }]))
      .mockResolvedValueOnce(result([{
        id: 100,
        order_id: 'order-1',
        company_id: COMPANY_ID,
        payment_provider: 'manual',
        event_type: 'payment_succeeded',
        event_status: 'verified',
        provider_event_id: 'manual-paid-1',
        payload: {},
      }]))
      .mockResolvedValueOnce(result([commercialRow({ billing_enabled: false })]))

    const outcome = await recordCommercialPaymentEvent({
      companyId: COMPANY_ID,
      orderId: 'order-1',
      paymentProvider: 'manual',
      eventType: 'payment_succeeded',
      eventStatus: 'verified',
      providerEventId: 'manual-paid-1',
      actorUserId: USER_ID,
    })

    expect(outcome).toEqual(expect.objectContaining({
      applied: false,
      reason: 'billing_disabled',
    }))
    expect(mocks.query.mock.calls).toHaveLength(3)
    expect(String(mocks.query.mock.calls[1]?.[0] ?? '')).toContain('INSERT INTO public.company_commercial_payment_events')
  })

  it('applies verified paid events to the order and commercial state when billing is enabled', async () => {
    const { recordCommercialPaymentEvent } = await import('../services/commercialFoundationService.js')
    mocks.query
      .mockResolvedValueOnce(result([{
        id: 'order-1',
        company_id: COMPANY_ID,
        plan_tier: 'pro',
        amount_cents: 9800,
        currency: 'CNY',
        payment_provider: 'manual',
        payment_status: 'draft',
        provider_order_id: null,
      }]))
      .mockResolvedValueOnce(result([{
        id: 100,
        order_id: 'order-1',
        company_id: COMPANY_ID,
        payment_provider: 'manual',
        event_type: 'payment_succeeded',
        event_status: 'verified',
        provider_event_id: 'manual-paid-1',
        payload: {},
      }]))
      .mockResolvedValueOnce(result([commercialRow({ billing_enabled: true, active_project_limit: 1 })]))
      .mockResolvedValueOnce(result([{
        id: 'order-1',
        company_id: COMPANY_ID,
        plan_tier: 'pro',
        amount_cents: 9800,
        currency: 'CNY',
        payment_provider: 'manual',
        payment_status: 'paid',
        provider_order_id: null,
      }]))
      .mockResolvedValueOnce(result([commercialRow({ billing_enabled: true, active_project_limit: 1 })]))
      .mockResolvedValueOnce(result([commercialRow({
        plan_tier: 'pro',
        commercial_state: 'active',
        active_project_limit: 10,
        billing_enabled: true,
        updated_by: USER_ID,
      })]))
      .mockResolvedValueOnce(result([]))
      .mockResolvedValueOnce(result([{
        id: 100,
        order_id: 'order-1',
        company_id: COMPANY_ID,
        payment_provider: 'manual',
        event_type: 'payment_succeeded',
        event_status: 'applied',
        provider_event_id: 'manual-paid-1',
        payload: {},
      }]))

    const outcome = await recordCommercialPaymentEvent({
      companyId: COMPANY_ID,
      orderId: 'order-1',
      paymentProvider: 'manual',
      eventType: 'payment_succeeded',
      eventStatus: 'verified',
      providerEventId: 'manual-paid-1',
      actorUserId: USER_ID,
    })

    expect(outcome).toEqual(expect.objectContaining({
      applied: true,
      reason: 'payment_applied',
    }))
    expect(outcome.state).toEqual(expect.objectContaining({
      plan_tier: 'pro',
      commercial_state: 'active',
      active_project_limit: 10,
    }))
    expect(String(mocks.query.mock.calls[3]?.[0] ?? '')).toContain("SET payment_status = 'paid'")
    expect(String(mocks.query.mock.calls[7]?.[0] ?? '')).toContain("SET event_status = 'applied'")
  })
})
