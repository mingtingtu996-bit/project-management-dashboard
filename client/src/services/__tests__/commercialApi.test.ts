import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
}))

vi.mock('@/lib/apiClient', () => ({
  apiGet: mocks.apiGet,
  apiPost: mocks.apiPost,
}))

const { createCommercialOrder, getCommercialEntitlements } = await import('@/services/commercialApi')

describe('commercialApi', () => {
  beforeEach(() => vi.clearAllMocks())

  it('loads current company entitlements without read caching', async () => {
    mocks.apiGet.mockResolvedValue({ company_id: 'company-1' })
    await getCommercialEntitlements()
    expect(mocks.apiGet).toHaveBeenCalledWith('/api/commercial/state', { runtimeCache: 'off' })
  })

  it('submits only the requested self-service tier and lets the server own pricing', async () => {
    mocks.apiPost.mockResolvedValue({ id: 'order-1' })
    await createCommercialOrder('starter')
    expect(mocks.apiPost).toHaveBeenCalledWith('/api/commercial/orders', {
      planTier: 'starter',
      paymentProvider: 'manual',
    })
  })
})
