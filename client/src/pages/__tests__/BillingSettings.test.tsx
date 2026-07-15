import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getCommercialEntitlements: vi.fn(),
  createCommercialOrder: vi.fn(),
  useCurrentCompanyRole: vi.fn(),
}))

vi.mock('@/services/commercialApi', () => ({
  getCommercialEntitlements: mocks.getCommercialEntitlements,
  createCommercialOrder: mocks.createCommercialOrder,
}))

vi.mock('@/hooks/useCurrentCompanyRole', () => ({
  useCurrentCompanyRole: mocks.useCurrentCompanyRole,
}))

const { default: BillingSettings } = await import('@/pages/BillingSettings')

function entitlements() {
  return {
    company_id: 'company-1',
    plan_tier: 'starter' as const,
    commercial_state: 'active' as const,
    active_project_limit: 2,
    active_project_count: 1,
    billing_enabled: true,
    onboarded_at: '2026-07-11T00:00:00.000Z',
    plan_started_at: '2026-07-11T00:00:00.000Z',
    plan_expires_at: null,
    updated_by: null,
    updated_at: '2026-07-11T00:00:00.000Z',
    plans: {
      free: { tier: 'free' as const, label: '免费版', projectLimit: 1, monthlyPriceCents: 0, selfServiceAvailable: true },
      starter: { tier: 'starter' as const, label: '入门版', projectLimit: 2, monthlyPriceCents: 4900, selfServiceAvailable: true },
      pro: { tier: 'pro' as const, label: '专业版', projectLimit: 5, monthlyPriceCents: 14900, selfServiceAvailable: true },
      group: { tier: 'group' as const, label: '集团版', projectLimit: null, monthlyPriceCents: null, selfServiceAvailable: false },
    },
  }
}

describe('BillingSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.useCurrentCompanyRole.mockReturnValue('company_admin')
    mocks.getCommercialEntitlements.mockResolvedValue(entitlements())
    mocks.createCommercialOrder.mockResolvedValue({ id: 'order-1', plan_tier: 'pro', payment_status: 'draft' })
  })

  it('shows current usage and the authoritative plan prices', async () => {
    render(<MemoryRouter><BillingSettings /></MemoryRouter>)

    expect(await screen.findByRole('heading', { name: '套餐与权益' })).toBeInTheDocument()
    expect(screen.getByText('1 / 2')).toBeInTheDocument()
    expect(screen.getByText('¥49 / 月')).toBeInTheDocument()
    expect(screen.getByText('¥149 / 月')).toBeInTheDocument()
    expect(screen.getByText('当前套餐')).toBeInTheDocument()
  })

  it('lets a company admin submit a plan order without changing entitlement directly', async () => {
    render(<MemoryRouter><BillingSettings /></MemoryRouter>)

    const button = await screen.findByRole('button', { name: '申请专业版' })
    fireEvent.click(button)

    await waitFor(() => expect(mocks.createCommercialOrder).toHaveBeenCalledWith('pro'))
    expect(await screen.findByText('升级申请已提交')).toBeInTheDocument()
  })

  it('keeps order actions disabled for non-admin company members', async () => {
    mocks.useCurrentCompanyRole.mockReturnValue('regular')
    render(<MemoryRouter><BillingSettings /></MemoryRouter>)

    const button = await screen.findByRole('button', { name: '申请专业版' })
    expect(button).toBeDisabled()
    expect(screen.getByText('仅公司管理员可提交套餐申请')).toBeInTheDocument()
  })
})
