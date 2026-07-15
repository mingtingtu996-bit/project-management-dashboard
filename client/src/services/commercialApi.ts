import { apiGet, apiPost } from '@/lib/apiClient'

export type CommercialPlanTier = 'free' | 'starter' | 'pro' | 'group'
export type CommercialState = 'trial' | 'active' | 'suspended' | 'expired' | 'archived'

export type CommercialPlan = {
  tier: CommercialPlanTier
  label: string
  projectLimit: number | null
  monthlyPriceCents: number | null
  selfServiceAvailable: boolean
}

export type CommercialEntitlements = {
  company_id: string
  plan_tier: CommercialPlanTier
  commercial_state: CommercialState
  active_project_limit: number
  active_project_count: number
  billing_enabled: boolean
  onboarded_at: string
  plan_started_at: string | null
  plan_expires_at: string | null
  updated_by: string | null
  updated_at: string
  plans: Record<CommercialPlanTier, CommercialPlan>
}

export type CommercialOrder = {
  id: string
  company_id: string
  plan_tier: CommercialPlanTier
  amount_cents: number
  currency: string
  payment_provider: string
  payment_status: string
}

export function getCommercialEntitlements() {
  return apiGet<CommercialEntitlements>('/api/commercial/state', { runtimeCache: 'off' })
}

export function createCommercialOrder(tier: 'starter' | 'pro') {
  return apiPost<CommercialOrder>('/api/commercial/orders', {
    planTier: tier,
    paymentProvider: 'manual',
  })
}
