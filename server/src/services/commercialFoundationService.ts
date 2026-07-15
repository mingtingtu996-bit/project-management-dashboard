import { query } from '../database.js'

export const COMMERCIAL_PROJECT_LIMIT_REACHED = 'COMMERCIAL_PROJECT_LIMIT_REACHED'
export const COMMERCIAL_STATE_SUSPENDED = 'COMMERCIAL_STATE_SUSPENDED'
export const COMMERCIAL_STATE_EXPIRED = 'COMMERCIAL_STATE_EXPIRED'
export const COMMERCIAL_STATE_ARCHIVED = 'COMMERCIAL_STATE_ARCHIVED'

export type CommercialPlanTier = 'free' | 'starter' | 'pro' | 'group'
export type CommercialState = 'trial' | 'active' | 'suspended' | 'expired' | 'archived'
export type CommercialAuditAction =
  | 'commercial_state_created'
  | 'commercial_metering_recorded'
  | 'commercial_state_changed'

export type CommercialStateRow = {
  company_id: string
  plan_tier: CommercialPlanTier
  commercial_state: CommercialState
  active_project_limit: number
  billing_enabled: boolean
  onboarded_at: string
  plan_started_at: string | null
  plan_expires_at: string | null
  updated_by: string | null
  updated_at: string
}

export type CommercialProjectCreationDecision = {
  allowed: boolean
  state: CommercialStateRow
  activeProjectCount: number
  billingEnabled: boolean
  error?: {
    code: string
    message: string
    upgradePath: string
    details: {
      companyId: string
      planTier: CommercialPlanTier
      commercialState: CommercialState
      activeProjectLimit: number
      activeProjectCount: number
      billingEnabled: boolean
    }
  }
}

export type CommercialStatePatch = {
  planTier?: CommercialPlanTier
  commercialState?: CommercialState
  activeProjectLimit?: number
  billingEnabled?: boolean
  planStartedAt?: string | null
  planExpiresAt?: string | null
  reason?: string
  highRiskConfirmation?: boolean
}

export type CommercialOrderInput = {
  companyId: string
  planTier: CommercialPlanTier
  amountCents: number
  currency?: string | null
  paymentProvider?: string | null
  actorUserId?: string | null
}

export type CommercialPaymentEventStatus = 'received' | 'verified' | 'rejected' | 'applied'

export type CommercialPaymentEventInput = {
  companyId: string
  orderId: string
  paymentProvider: string
  eventType: string
  eventStatus: CommercialPaymentEventStatus
  providerEventId?: string | null
  payload?: Record<string, unknown> | null
  actorUserId?: string | null
}

export type CommercialPaymentEventApplicationResult = {
  applied: boolean
  reason:
    | 'billing_disabled'
    | 'event_not_verified_paid'
    | 'already_applied'
    | 'payment_applied'
  order: Record<string, unknown>
  event: Record<string, unknown>
  state?: CommercialStateRow
}

export const COMMERCIAL_PLAN_CATALOG = {
  free: {
    tier: 'free',
    label: '免费版',
    projectLimit: 1,
    monthlyPriceCents: 0,
    selfServiceAvailable: true,
  },
  starter: {
    tier: 'starter',
    label: '入门版',
    projectLimit: 2,
    monthlyPriceCents: 4_900,
    selfServiceAvailable: true,
  },
  pro: {
    tier: 'pro',
    label: '专业版',
    projectLimit: 5,
    monthlyPriceCents: 14_900,
    selfServiceAvailable: true,
  },
  group: {
    tier: 'group',
    label: '集团版',
    projectLimit: null,
    monthlyPriceCents: null,
    selfServiceAvailable: false,
  },
} as const satisfies Record<CommercialPlanTier, {
  tier: CommercialPlanTier
  label: string
  projectLimit: number | null
  monthlyPriceCents: number | null
  selfServiceAvailable: boolean
}>

const DEFAULT_ACTIVE_PROJECT_LIMIT = 1
const DEFAULT_TIER_PROJECT_LIMITS: Record<CommercialPlanTier, number> = {
  free: 1,
  starter: 2,
  pro: 5,
  group: 0,
}
const ACTIVE_PROJECT_STATUSES_EXCLUDED = ['已暂停', '已完成', 'archived', 'deleted', 'inactive', 'cancelled', 'canceled']
const COMMERCIAL_UPGRADE_PATH = '/settings/billing'
const PAID_EVENT_TYPES = new Set([
  'paid',
  'payment_paid',
  'payment_succeeded',
  'payment_success',
  'trade_success',
  'wechat_pay_success',
  'alipay_trade_success',
])

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

function normalizePlanTier(value: unknown): CommercialPlanTier {
  const normalized = normalizeText(value)
  if (normalized === 'starter' || normalized === 'pro' || normalized === 'group') return normalized
  return 'free'
}

function normalizeCommercialState(value: unknown): CommercialState {
  const normalized = normalizeText(value)
  if (normalized === 'active' || normalized === 'suspended' || normalized === 'expired' || normalized === 'archived') {
    return normalized
  }
  return 'trial'
}

function normalizeBoolean(value: unknown) {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value !== 0
  const normalized = normalizeText(value).toLowerCase()
  return normalized === 'true' || normalized === 't' || normalized === '1' || normalized === 'yes'
}

function normalizeLimit(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? Math.trunc(parsed) : DEFAULT_ACTIVE_PROJECT_LIMIT
}

function normalizePaymentEventStatus(value: unknown): CommercialPaymentEventStatus {
  const normalized = normalizeText(value)
  if (normalized === 'verified' || normalized === 'rejected' || normalized === 'applied') return normalized
  return 'received'
}

function isHighRiskCommercialState(value: CommercialState) {
  return value === 'suspended' || value === 'expired' || value === 'archived'
}

function requireHighRiskCommercialStateConfirmation(input: {
  currentState: CommercialState
  nextState: CommercialState
  patch: CommercialStatePatch
}) {
  if (input.currentState === input.nextState || !isHighRiskCommercialState(input.nextState)) return
  if (input.patch.highRiskConfirmation === true && normalizeText(input.patch.reason)) return
  const error = new Error('COMMERCIAL_HIGH_RISK_CONFIRMATION_REQUIRED')
  ;(error as any).code = 'COMMERCIAL_HIGH_RISK_CONFIRMATION_REQUIRED'
  ;(error as any).statusCode = 400
  throw error
}

function readIso(value: unknown) {
  const text = normalizeText(value)
  return text || new Date().toISOString()
}

function readNullableIso(value: unknown) {
  const text = normalizeText(value)
  return text || null
}

function toCommercialStateRow(row: Record<string, unknown>, companyId: string): CommercialStateRow {
  return {
    company_id: normalizeText(row.company_id) || companyId,
    plan_tier: normalizePlanTier(row.plan_tier),
    commercial_state: normalizeCommercialState(row.commercial_state),
    active_project_limit: normalizeLimit(row.active_project_limit),
    billing_enabled: normalizeBoolean(row.billing_enabled),
    onboarded_at: readIso(row.onboarded_at),
    plan_started_at: readNullableIso(row.plan_started_at),
    plan_expires_at: readNullableIso(row.plan_expires_at),
    updated_by: normalizeText(row.updated_by) || null,
    updated_at: readIso(row.updated_at),
  }
}

function isVerifiedPaidEvent(event: Record<string, unknown>): boolean {
  const eventStatus = normalizePaymentEventStatus(event.event_status)
  if (eventStatus !== 'verified') return false
  const eventType = normalizeText(event.event_type).toLowerCase().replace(/[.\s:-]+/g, '_')
  return PAID_EVENT_TYPES.has(eventType)
}

function defaultProjectLimitForTier(tier: CommercialPlanTier): number {
  return DEFAULT_TIER_PROJECT_LIMITS[tier] ?? DEFAULT_ACTIVE_PROJECT_LIMIT
}

function buildStateError(
  state: CommercialStateRow,
  activeProjectCount: number,
): CommercialProjectCreationDecision['error'] | null {
  const detail = {
    companyId: state.company_id,
    planTier: state.plan_tier,
    commercialState: state.commercial_state,
    activeProjectLimit: state.active_project_limit,
    activeProjectCount,
    billingEnabled: state.billing_enabled,
  }
  if (state.commercial_state === 'suspended') {
    return {
      code: COMMERCIAL_STATE_SUSPENDED,
      message: '当前公司商业状态已暂停，恢复后可继续创建项目。',
      upgradePath: COMMERCIAL_UPGRADE_PATH,
      details: detail,
    }
  }
  if (state.commercial_state === 'expired') {
    return {
      code: COMMERCIAL_STATE_EXPIRED,
      message: '当前公司套餐已到期，续费或恢复后可继续创建项目。',
      upgradePath: COMMERCIAL_UPGRADE_PATH,
      details: detail,
    }
  }
  if (state.commercial_state === 'archived') {
    return {
      code: COMMERCIAL_STATE_ARCHIVED,
      message: '当前公司商业状态已归档，恢复后可继续创建项目。',
      upgradePath: COMMERCIAL_UPGRADE_PATH,
      details: detail,
    }
  }
  return null
}

function buildLimitError(
  state: CommercialStateRow,
  activeProjectCount: number,
): CommercialProjectCreationDecision['error'] {
  return {
    code: COMMERCIAL_PROJECT_LIMIT_REACHED,
    message: '当前套餐的 active 项目数量已达上限，升级后可继续创建项目。',
    upgradePath: COMMERCIAL_UPGRADE_PATH,
    details: {
      companyId: state.company_id,
      planTier: state.plan_tier,
      commercialState: state.commercial_state,
      activeProjectLimit: state.active_project_limit,
      activeProjectCount,
      billingEnabled: state.billing_enabled,
    },
  }
}

async function recordCommercialAudit(input: {
  companyId: string
  action: CommercialAuditAction
  actorUserId?: string | null
  fromState?: CommercialState | null
  toState?: CommercialState | null
  fromTier?: CommercialPlanTier | null
  toTier?: CommercialPlanTier | null
  reason?: string | null
  payload?: Record<string, unknown>
}) {
  await query(
    `INSERT INTO public.company_commercial_audit
       (company_id, action, from_state, to_state, from_tier, to_tier, reason, actor_user_id, payload)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)`,
    [
      input.companyId,
      input.action,
      input.fromState ?? null,
      input.toState ?? null,
      input.fromTier ?? null,
      input.toTier ?? null,
      input.reason ?? null,
      input.actorUserId ?? null,
      JSON.stringify(input.payload ?? {}),
    ],
  )
}

export async function countActiveProjects(companyId: string): Promise<number> {
  const result = await query(
    `SELECT COUNT(*)::int AS count
       FROM public.projects
      WHERE company_id = $1
        AND COALESCE(status, '') <> ALL($2::text[])`,
    [companyId, ACTIVE_PROJECT_STATUSES_EXCLUDED],
  )
  return Number(result.rows[0]?.count ?? 0)
}

export async function getCommercialState(companyId: string): Promise<CommercialStateRow> {
  const normalizedCompanyId = normalizeText(companyId)
  if (!normalizedCompanyId) throw new Error('commercial_state_requires_company_id')

  const result = await query(
    `INSERT INTO public.company_commercial (company_id)
     VALUES ($1)
     ON CONFLICT (company_id)
     DO UPDATE SET updated_at = public.company_commercial.updated_at
     RETURNING
       company_id,
       plan_tier,
       commercial_state,
       active_project_limit,
       billing_enabled,
       onboarded_at,
       plan_started_at,
       plan_expires_at,
       updated_by,
       updated_at`,
    [normalizedCompanyId],
  )
  const row = result.rows[0]
  if (!row) throw new Error('commercial_state_upsert_returned_no_row')
  return toCommercialStateRow(row, normalizedCompanyId)
}

export async function canCreateProject(input: {
  companyId: string
  actorUserId?: string | null
}): Promise<CommercialProjectCreationDecision> {
  const state = await getCommercialState(input.companyId)
  const activeProjectCount = await countActiveProjects(state.company_id)

  await recordCommercialAudit({
    companyId: state.company_id,
    action: 'commercial_metering_recorded',
    actorUserId: input.actorUserId,
    reason: 'project_creation_guard_metering',
    payload: {
      activeProjectCount,
      activeProjectLimit: state.active_project_limit,
      billingEnabled: state.billing_enabled,
      planTier: state.plan_tier,
      commercialState: state.commercial_state,
    },
  })

  if (!state.billing_enabled) {
    return {
      allowed: true,
      state,
      activeProjectCount,
      billingEnabled: false,
    }
  }

  const stateError = buildStateError(state, activeProjectCount)
  if (stateError) {
    return {
      allowed: false,
      state,
      activeProjectCount,
      billingEnabled: true,
      error: stateError,
    }
  }

  if (activeProjectCount >= state.active_project_limit) {
    return {
      allowed: false,
      state,
      activeProjectCount,
      billingEnabled: true,
      error: buildLimitError(state, activeProjectCount),
    }
  }

  return {
    allowed: true,
    state,
    activeProjectCount,
    billingEnabled: true,
  }
}

export async function changeCommercialState(input: {
  companyId: string
  actorUserId?: string | null
  patch: CommercialStatePatch
}): Promise<CommercialStateRow> {
  const current = await getCommercialState(input.companyId)
  const nextTier = input.patch.planTier ? normalizePlanTier(input.patch.planTier) : current.plan_tier
  const nextState = input.patch.commercialState ? normalizeCommercialState(input.patch.commercialState) : current.commercial_state
  const nextLimit = input.patch.activeProjectLimit === undefined
    ? current.active_project_limit
    : normalizeLimit(input.patch.activeProjectLimit)
  const nextBillingEnabled = input.patch.billingEnabled === undefined
    ? current.billing_enabled
    : Boolean(input.patch.billingEnabled)
  requireHighRiskCommercialStateConfirmation({
    currentState: current.commercial_state,
    nextState,
    patch: input.patch,
  })

  const result = await query(
    `UPDATE public.company_commercial
        SET plan_tier = $2,
            commercial_state = $3,
            active_project_limit = $4,
            billing_enabled = $5,
            plan_started_at = $6,
            plan_expires_at = $7,
            updated_by = $8,
            updated_at = NOW()
      WHERE company_id = $1
      RETURNING
        company_id,
        plan_tier,
        commercial_state,
        active_project_limit,
        billing_enabled,
        onboarded_at,
        plan_started_at,
        plan_expires_at,
        updated_by,
        updated_at`,
    [
      current.company_id,
      nextTier,
      nextState,
      nextLimit,
      nextBillingEnabled,
      input.patch.planStartedAt === undefined ? current.plan_started_at : input.patch.planStartedAt,
      input.patch.planExpiresAt === undefined ? current.plan_expires_at : input.patch.planExpiresAt,
      input.actorUserId ?? null,
    ],
  )
  const updated = toCommercialStateRow(result.rows[0] ?? {}, current.company_id)
  await recordCommercialAudit({
    companyId: current.company_id,
    action: 'commercial_state_changed',
    actorUserId: input.actorUserId ?? null,
    fromState: current.commercial_state,
    toState: updated.commercial_state,
    fromTier: current.plan_tier,
    toTier: updated.plan_tier,
    reason: input.patch.reason ?? 'manual_commercial_state_change',
    payload: {
      previous: current,
      next: updated,
      activeProjectLimitChanged: current.active_project_limit !== updated.active_project_limit,
      billingEnabledChanged: current.billing_enabled !== updated.billing_enabled,
    },
  })
  return updated
}

export async function createCommercialOrder(input: CommercialOrderInput) {
  const tier = normalizePlanTier(input.planTier)
  const plan = COMMERCIAL_PLAN_CATALOG[tier]
  if (!plan.selfServiceAvailable || plan.monthlyPriceCents === null || tier === 'free') {
    const error = new Error('COMMERCIAL_PLAN_NOT_SELF_SERVICE')
    ;(error as any).code = 'COMMERCIAL_PLAN_NOT_SELF_SERVICE'
    ;(error as any).statusCode = 400
    throw error
  }
  const result = await query(
    `INSERT INTO public.company_commercial_orders
       (company_id, plan_tier, amount_cents, currency, payment_provider, payment_status, created_by)
     VALUES ($1, $2, $3, $4, $5, 'draft', $6)
     RETURNING id, company_id, plan_tier, amount_cents, currency, payment_provider, payment_status, created_at, updated_at`,
    [
      input.companyId,
      tier,
      plan.monthlyPriceCents,
      normalizeText(input.currency) || 'CNY',
      normalizeText(input.paymentProvider) || 'manual',
      input.actorUserId ?? null,
    ],
  )
  return result.rows[0] ?? null
}

export async function recordCommercialPaymentEvent(
  input: CommercialPaymentEventInput,
): Promise<CommercialPaymentEventApplicationResult> {
  const normalizedCompanyId = normalizeText(input.companyId)
  const normalizedOrderId = normalizeText(input.orderId)
  if (!normalizedCompanyId) throw new Error('commercial_payment_event_requires_company_id')
  if (!normalizedOrderId) throw new Error('commercial_payment_event_requires_order_id')

  const orderResult = await query(
    `SELECT id, company_id, plan_tier, amount_cents, currency, payment_provider, payment_status, provider_order_id
       FROM public.company_commercial_orders
      WHERE id = $1
        AND company_id = $2
      LIMIT 1`,
    [normalizedOrderId, normalizedCompanyId],
  )
  const order = orderResult.rows[0]
  if (!order) throw new Error('commercial_order_not_found_in_company')

  const paymentProvider = normalizeText(input.paymentProvider) || normalizeText(order.payment_provider) || 'manual'
  const eventType = normalizeText(input.eventType) || 'payment_succeeded'
  const eventStatus = normalizePaymentEventStatus(input.eventStatus)
  const providerEventId = normalizeText(input.providerEventId) || null

  const eventResult = await query(
    `INSERT INTO public.company_commercial_payment_events
       (order_id, company_id, payment_provider, event_type, event_status, provider_event_id, payload)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
     ON CONFLICT (payment_provider, provider_event_id)
       WHERE provider_event_id IS NOT NULL
     DO UPDATE SET
       event_type = EXCLUDED.event_type,
       event_status = CASE
         WHEN public.company_commercial_payment_events.event_status = 'applied' THEN 'applied'
         ELSE EXCLUDED.event_status
       END,
       payload = public.company_commercial_payment_events.payload || EXCLUDED.payload
     RETURNING id, order_id, company_id, payment_provider, event_type, event_status, provider_event_id, payload, created_at`,
    [
      normalizedOrderId,
      normalizedCompanyId,
      paymentProvider,
      eventType,
      eventStatus,
      providerEventId,
      JSON.stringify({
        ...(input.payload ?? {}),
        actorUserId: input.actorUserId ?? null,
        adapterBoundary: 'default_off_no_external_provider_call',
      }),
    ],
  )
  const event = eventResult.rows[0] ?? {}
  return applyCommercialPaymentEvent({ companyId: normalizedCompanyId, order, event, actorUserId: input.actorUserId })
}

async function applyCommercialPaymentEvent(input: {
  companyId: string
  order: Record<string, unknown>
  event: Record<string, unknown>
  actorUserId?: string | null
}): Promise<CommercialPaymentEventApplicationResult> {
  if (normalizePaymentEventStatus(input.event.event_status) === 'applied') {
    return { applied: false, reason: 'already_applied', order: input.order, event: input.event }
  }

  const state = await getCommercialState(input.companyId)
  if (!state.billing_enabled) {
    return {
      applied: false,
      reason: 'billing_disabled',
      order: input.order,
      event: input.event,
      state,
    }
  }

  if (!isVerifiedPaidEvent(input.event)) {
    return {
      applied: false,
      reason: 'event_not_verified_paid',
      order: input.order,
      event: input.event,
      state,
    }
  }

  const orderId = normalizeText(input.order.id)
  const eventId = Number(input.event.id)
  if (!Number.isFinite(eventId)) throw new Error('commercial_payment_event_requires_persisted_event_id')
  const nextTier = normalizePlanTier(input.order.plan_tier)
  const nextLimit = Math.max(state.active_project_limit, defaultProjectLimitForTier(nextTier))

  const paidOrderResult = await query(
    `UPDATE public.company_commercial_orders
        SET payment_status = 'paid',
            updated_at = NOW()
      WHERE id = $1
        AND company_id = $2
      RETURNING id, company_id, plan_tier, amount_cents, currency, payment_provider, payment_status, provider_order_id, created_at, updated_at`,
    [orderId, input.companyId],
  )
  const paidOrder = paidOrderResult.rows[0] ?? input.order

  const updatedState = await changeCommercialState({
    companyId: input.companyId,
    actorUserId: input.actorUserId ?? null,
    patch: {
      planTier: nextTier,
      commercialState: 'active',
      activeProjectLimit: nextLimit,
      planStartedAt: new Date().toISOString(),
      reason: `payment_event_applied:${normalizeText(input.event.provider_event_id) || eventId || orderId}`,
    },
  })

  const appliedEventResult = await query(
    `UPDATE public.company_commercial_payment_events
        SET event_status = 'applied'
      WHERE id = $1
        AND company_id = $2
      RETURNING id, order_id, company_id, payment_provider, event_type, event_status, provider_event_id, payload, created_at`,
    [eventId, input.companyId],
  )

  return {
    applied: true,
    reason: 'payment_applied',
    order: paidOrder,
    event: appliedEventResult.rows[0] ?? input.event,
    state: updatedState,
  }
}
