import { randomUUID } from 'node:crypto'
import type { PoolClient } from 'pg'

import { getClient } from '../database.js'
import type { Project } from '../types/db.js'
import { getProject } from './dbService.js'
import type {
  CommercialPaymentEventApplicationResult,
  CommercialPaymentEventInput,
  CommercialPlanTier,
  CommercialState,
  CommercialStatePatch,
  CommercialStateRow,
} from './commercialFoundationService.js'

const ACTIVE_PROJECT_STATUSES_EXCLUDED = [
  '已暂停',
  '已完成',
  'archived',
  'deleted',
  'inactive',
  'cancelled',
  'canceled',
]

const TIER_PROJECT_LIMITS: Record<CommercialPlanTier, number> = {
  free: 1,
  starter: 2,
  pro: 5,
  group: 0,
}

const PAID_EVENT_TYPES = new Set([
  'paid',
  'payment_paid',
  'payment_succeeded',
  'payment_success',
  'trade_success',
  'wechat_pay_success',
  'alipay_trade_success',
])

type CommercialProjectCreateInput = Record<string, unknown> & {
  id?: string
  name: string
  company_id?: string | null
  owner_id?: string | null
  created_by?: string | null
}

export type CommercialTransactionClient = Pick<PoolClient, 'query'>

type Queryable = CommercialTransactionClient

export class CommercialOperationError extends Error {
  code: string
  statusCode: number
  details?: Record<string, unknown>

  constructor(code: string, message: string, statusCode: number, details?: Record<string, unknown>) {
    super(message)
    this.name = 'CommercialOperationError'
    this.code = code
    this.statusCode = statusCode
    this.details = details
  }
}

function text(value: unknown) {
  return String(value ?? '').trim()
}

function normalizeTier(value: unknown): CommercialPlanTier {
  const normalized = text(value)
  if (normalized === 'starter' || normalized === 'pro' || normalized === 'group') return normalized
  return 'free'
}

function normalizeState(value: unknown): CommercialState {
  const normalized = text(value)
  if (normalized === 'active' || normalized === 'suspended' || normalized === 'expired' || normalized === 'archived') {
    return normalized
  }
  return 'trial'
}

function normalizeBoolean(value: unknown) {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value !== 0
  return ['true', 't', '1', 'yes'].includes(text(value).toLowerCase())
}

function normalizeLimit(value: unknown, tier: CommercialPlanTier) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0
    ? Math.trunc(parsed)
    : TIER_PROJECT_LIMITS[tier]
}

function nullableText(value: unknown) {
  const normalized = text(value)
  return normalized || null
}

function toStateRow(row: Record<string, unknown>, companyId: string): CommercialStateRow {
  const tier = normalizeTier(row.plan_tier)
  return {
    company_id: text(row.company_id) || companyId,
    plan_tier: tier,
    commercial_state: normalizeState(row.commercial_state),
    active_project_limit: normalizeLimit(row.active_project_limit, tier),
    billing_enabled: normalizeBoolean(row.billing_enabled),
    onboarded_at: text(row.onboarded_at) || new Date().toISOString(),
    plan_started_at: nullableText(row.plan_started_at),
    plan_expires_at: nullableText(row.plan_expires_at),
    updated_by: nullableText(row.updated_by),
    updated_at: text(row.updated_at) || new Date().toISOString(),
  }
}

async function ensureAndLockCommercialState(client: Queryable, companyId: string) {
  await client.query(
    `INSERT INTO public.company_commercial (company_id)
     VALUES ($1)
     ON CONFLICT (company_id) DO NOTHING`,
    [companyId],
  )
  const result = await client.query(
    `SELECT
       company_id,
       plan_tier,
       commercial_state,
       active_project_limit,
       billing_enabled,
       onboarded_at,
       plan_started_at,
       plan_expires_at,
       updated_by,
       updated_at
     FROM public.company_commercial
     WHERE company_id = $1
     FOR UPDATE`,
    [companyId],
  )
  const row = result.rows[0] as Record<string, unknown> | undefined
  if (!row) {
    throw new CommercialOperationError(
      'COMMERCIAL_STATE_NOT_FOUND',
      'Commercial state is unavailable for this company',
      503,
    )
  }
  return toStateRow(row, companyId)
}

async function recordAudit(client: Queryable, input: {
  companyId: string
  action: string
  actorUserId?: string | null
  fromState?: CommercialState | null
  toState?: CommercialState | null
  fromTier?: CommercialPlanTier | null
  toTier?: CommercialPlanTier | null
  reason?: string | null
  payload?: Record<string, unknown>
}) {
  await client.query(
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

function projectCreationError(state: CommercialStateRow, activeProjectCount: number) {
  const details = {
    companyId: state.company_id,
    planTier: state.plan_tier,
    commercialState: state.commercial_state,
    activeProjectLimit: state.active_project_limit,
    activeProjectCount,
    billingEnabled: state.billing_enabled,
    upgradePath: '/settings/billing',
  }
  if (state.commercial_state === 'suspended') {
    return new CommercialOperationError('COMMERCIAL_STATE_SUSPENDED', '当前公司商业状态已暂停。', 402, details)
  }
  if (state.commercial_state === 'expired') {
    return new CommercialOperationError('COMMERCIAL_STATE_EXPIRED', '当前公司套餐已到期。', 402, details)
  }
  if (state.commercial_state === 'archived') {
    return new CommercialOperationError('COMMERCIAL_STATE_ARCHIVED', '当前公司商业状态已归档。', 402, details)
  }
  if (activeProjectCount >= state.active_project_limit) {
    return new CommercialOperationError(
      'COMMERCIAL_PROJECT_LIMIT_REACHED',
      '当前套餐的 active 项目数量已达上限。',
      402,
      details,
    )
  }
  return null
}

function normalizeProjectStatus(value: unknown): Project['status'] {
  switch (text(value)) {
    case 'wizard_drafting': return 'wizard_drafting'
    case '已完成':
    case 'completed':
    case 'done': return '已完成'
    case '进行中':
    case 'in_progress':
    case 'active': return '进行中'
    case '已暂停':
    case 'paused':
    case 'archived': return '已暂停'
    default: return '未开始'
  }
}

async function insertProjectAndOwner(client: Queryable, input: CommercialProjectCreateInput) {
  const projectId = text(input.id) || randomUUID()
  const companyId = text(input.company_id)
  const ownerId = text(input.owner_id)
  if (!companyId || !ownerId || !text(input.name)) {
    throw new CommercialOperationError(
      'PROJECT_OWNERSHIP_REQUIRED',
      '创建项目必须提供 name、company_id 和 owner_id',
      400,
    )
  }

  const values = [
    projectId,
    text(input.name),
    nullableText(input.description),
    companyId,
    nullableText(input.project_visibility) ?? 'private',
    normalizeProjectStatus(input.status),
    ownerId,
    nullableText(input.created_by) ?? ownerId,
    nullableText(input.project_type),
    nullableText(input.building_type),
    nullableText(input.structure_type),
    Number(input.building_count ?? 1) || 1,
    input.above_ground_floors ?? null,
    input.underground_floors ?? null,
    nullableText(input.support_method),
    input.total_area ?? null,
    nullableText(input.planned_start_date),
    nullableText(input.planned_end_date),
    nullableText(input.actual_start_date),
    nullableText(input.actual_end_date),
    input.total_investment ?? null,
    Number(input.health_score ?? 50),
    nullableText(input.health_status) ?? '亚健康',
    Number(input.version ?? 1),
  ]

  await client.query(
    `INSERT INTO public.projects (
       id, name, description, company_id, project_visibility, status,
       owner_id, created_by, project_type, building_type, structure_type,
       building_count, above_ground_floors, underground_floors, support_method,
       total_area, planned_start_date, planned_end_date, actual_start_date,
       actual_end_date, total_investment, health_score, health_status, version,
       created_at, updated_at
     ) VALUES (
       $1, $2, $3, $4, $5, $6,
       $7, $8, $9, $10, $11,
       $12, $13, $14, $15,
       $16, $17, $18, $19,
       $20, $21, $22, $23, $24,
       NOW(), NOW()
     )
     RETURNING id`,
    values,
  )

  await client.query(
    `INSERT INTO public.project_members (
       id, project_id, user_id, permission_level, joined_at, is_active, last_activity
     ) VALUES ($1, $2, $3, 'owner', NOW(), TRUE, NOW())
     ON CONFLICT (project_id, user_id)
     DO UPDATE SET
       permission_level = 'owner',
       is_active = TRUE,
       last_activity = NOW()`,
    [randomUUID(), projectId, ownerId],
  )

  return projectId
}

export async function executeProjectCreationUnderCommercialGuard<T>(input: {
  companyId: string
  actorUserId?: string | null
  create: (client: CommercialTransactionClient) => Promise<T>
}) {
  const companyId = text(input.companyId)
  if (!companyId) {
    throw new CommercialOperationError('PROJECT_COMPANY_REQUIRED', 'Project company is required', 400)
  }

  const client = await getClient()
  let denied: CommercialOperationError | null = null
  let result: T | undefined
  let creationExecuted = false
  let committed = false
  try {
    await client.query('BEGIN')
    const state = await ensureAndLockCommercialState(client, companyId)
    const countResult = await client.query(
      `SELECT COUNT(*)::int AS count
       FROM public.projects
       WHERE company_id = $1
         AND COALESCE(status, '') <> ALL($2::text[])`,
      [companyId, ACTIVE_PROJECT_STATUSES_EXCLUDED],
    )
    const activeProjectCount = Number(countResult.rows[0]?.count ?? 0)

    await recordAudit(client, {
      companyId,
      action: 'commercial_metering_recorded',
      actorUserId: input.actorUserId,
      reason: 'atomic_project_creation_guard',
      payload: {
        activeProjectCount,
        activeProjectLimit: state.active_project_limit,
        billingEnabled: state.billing_enabled,
        planTier: state.plan_tier,
        commercialState: state.commercial_state,
      },
    })

    denied = state.billing_enabled ? projectCreationError(state, activeProjectCount) : null
    if (!denied) {
      result = await input.create(client)
      creationExecuted = true
    }
    await client.query('COMMIT')
    committed = true
  } catch (error) {
    if (!committed) await client.query('ROLLBACK').catch(() => undefined)
    throw error
  } finally {
    client.release()
  }

  if (denied) throw denied
  if (!creationExecuted) throw new Error('project_creation_guard_committed_without_writer')
  return result as T
}

export async function createProjectUnderCommercialGuard(input: {
  project: CommercialProjectCreateInput
  actorUserId?: string | null
}) {
  const companyId = text(input.project.company_id)
  const projectId = await executeProjectCreationUnderCommercialGuard({
    companyId,
    actorUserId: input.actorUserId,
    create: async (client) => insertProjectAndOwner(client, input.project),
  })
  const project = await getProject(projectId)
  if (!project) throw new Error('project_creation_readback_failed')
  return project
}

function requireHighRiskConfirmation(current: CommercialState, next: CommercialState, patch: CommercialStatePatch) {
  const highRisk = next === 'suspended' || next === 'expired' || next === 'archived'
  if (current === next || !highRisk) return
  if (patch.highRiskConfirmation === true && text(patch.reason)) return
  throw new CommercialOperationError(
    'COMMERCIAL_HIGH_RISK_CONFIRMATION_REQUIRED',
    'High-risk commercial state changes require explicit confirmation and a reason',
    400,
  )
}

async function updateCommercialState(client: Queryable, input: {
  current: CommercialStateRow
  actorUserId?: string | null
  patch: CommercialStatePatch
  auditAction?: string
}) {
  const nextTier = input.patch.planTier ? normalizeTier(input.patch.planTier) : input.current.plan_tier
  const nextState = input.patch.commercialState ? normalizeState(input.patch.commercialState) : input.current.commercial_state
  const nextLimit = input.patch.activeProjectLimit === undefined
    ? Math.max(input.current.active_project_limit, TIER_PROJECT_LIMITS[nextTier])
    : normalizeLimit(input.patch.activeProjectLimit, nextTier)
  const nextBilling = input.patch.billingEnabled === undefined
    ? input.current.billing_enabled
    : Boolean(input.patch.billingEnabled)
  requireHighRiskConfirmation(input.current.commercial_state, nextState, input.patch)

  const result = await client.query(
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
       company_id, plan_tier, commercial_state, active_project_limit,
       billing_enabled, onboarded_at, plan_started_at, plan_expires_at,
       updated_by, updated_at`,
    [
      input.current.company_id,
      nextTier,
      nextState,
      nextLimit,
      nextBilling,
      input.patch.planStartedAt === undefined ? input.current.plan_started_at : input.patch.planStartedAt,
      input.patch.planExpiresAt === undefined ? input.current.plan_expires_at : input.patch.planExpiresAt,
      input.actorUserId ?? null,
    ],
  )
  const row = result.rows[0] as Record<string, unknown> | undefined
  if (!row) throw new Error('commercial_state_update_returned_no_row')
  const updated = toStateRow(row, input.current.company_id)
  await recordAudit(client, {
    companyId: input.current.company_id,
    action: input.auditAction ?? 'commercial_state_changed',
    actorUserId: input.actorUserId,
    fromState: input.current.commercial_state,
    toState: updated.commercial_state,
    fromTier: input.current.plan_tier,
    toTier: updated.plan_tier,
    reason: input.patch.reason ?? 'commercial_state_change',
    payload: { previous: input.current, next: updated },
  })
  return updated
}

export async function changeCommercialStateAtomic(input: {
  companyId: string
  actorUserId?: string | null
  patch: CommercialStatePatch
}) {
  const client = await getClient()
  try {
    await client.query('BEGIN')
    const current = await ensureAndLockCommercialState(client, text(input.companyId))
    const updated = await updateCommercialState(client, { current, actorUserId: input.actorUserId, patch: input.patch })
    await client.query('COMMIT')
    return updated
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw error
  } finally {
    client.release()
  }
}

export async function isCommercialPlatformOperator(userId: string | undefined | null) {
  const normalized = text(userId)
  if (!normalized) return false
  const client = await getClient()
  try {
    const result = await client.query(
      `SELECT 1
       FROM public.users
       WHERE id = $1
         AND platform_role = 'commercial_operator'
       LIMIT 1`,
      [normalized],
    )
    return result.rowCount === 1
  } finally {
    client.release()
  }
}

function normalizeEventStatus(value: unknown) {
  const normalized = text(value)
  if (normalized === 'verified' || normalized === 'rejected' || normalized === 'applied') return normalized
  return 'received'
}

function isVerifiedPaidEvent(event: Record<string, unknown>) {
  if (normalizeEventStatus(event.event_status) !== 'verified') return false
  const eventType = text(event.event_type).toLowerCase().replace(/[.\s:-]+/g, '_')
  return PAID_EVENT_TYPES.has(eventType)
}

export async function recordCommercialPaymentEventAtomic(
  input: CommercialPaymentEventInput,
): Promise<CommercialPaymentEventApplicationResult> {
  const companyId = text(input.companyId)
  const orderId = text(input.orderId)
  if (!companyId || !orderId) {
    throw new CommercialOperationError('COMMERCIAL_PAYMENT_EVENT_SCOPE_REQUIRED', 'Company and order are required', 400)
  }

  const client = await getClient()
  try {
    await client.query('BEGIN')
    const orderResult = await client.query(
      `SELECT id, company_id, plan_tier, amount_cents, currency, payment_provider, payment_status, provider_order_id
       FROM public.company_commercial_orders
       WHERE id = $1 AND company_id = $2
       FOR UPDATE`,
      [orderId, companyId],
    )
    const order = orderResult.rows[0] as Record<string, unknown> | undefined
    if (!order) {
      throw new CommercialOperationError('COMMERCIAL_ORDER_NOT_FOUND', 'Commercial order was not found in company', 404)
    }

    const provider = text(input.paymentProvider) || text(order.payment_provider) || 'manual'
    const eventType = text(input.eventType) || 'payment_succeeded'
    const eventStatus = normalizeEventStatus(input.eventStatus)
    const providerEventId = nullableText(input.providerEventId)
    const payload = JSON.stringify({
      ...(input.payload ?? {}),
      actorUserId: input.actorUserId ?? null,
      adapterBoundary: 'default_off_no_external_provider_call',
    })

    const inserted = await client.query(
      `INSERT INTO public.company_commercial_payment_events
         (order_id, company_id, payment_provider, event_type, event_status, provider_event_id, payload)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
       ON CONFLICT (payment_provider, provider_event_id)
         WHERE provider_event_id IS NOT NULL
       DO NOTHING
       RETURNING id, order_id, company_id, payment_provider, event_type, event_status, provider_event_id, payload, created_at`,
      [orderId, companyId, provider, eventType, eventStatus, providerEventId, payload],
    )
    let event = inserted.rows[0] as Record<string, unknown> | undefined

    if (!event && providerEventId) {
      const existingResult = await client.query(
        `SELECT id, order_id, company_id, payment_provider, event_type, event_status, provider_event_id, payload, created_at
         FROM public.company_commercial_payment_events
         WHERE payment_provider = $1 AND provider_event_id = $2
         FOR UPDATE`,
        [provider, providerEventId],
      )
      event = existingResult.rows[0] as Record<string, unknown> | undefined
      if (!event || text(event.company_id) !== companyId || text(event.order_id) !== orderId) {
        throw new CommercialOperationError(
          'COMMERCIAL_PAYMENT_EVENT_SCOPE_CONFLICT',
          'Provider event is already bound to a different company or order',
          409,
        )
      }
      if (normalizeEventStatus(event.event_status) === 'applied') {
        await client.query('COMMIT')
        return { applied: false, reason: 'already_applied', order, event }
      }
      const updatedEventResult = await client.query(
        `UPDATE public.company_commercial_payment_events
         SET event_type = $3,
             event_status = $4,
             payload = payload || $5::jsonb
         WHERE id = $1 AND company_id = $2
         RETURNING id, order_id, company_id, payment_provider, event_type, event_status, provider_event_id, payload, created_at`,
        [event.id, companyId, eventType, eventStatus, payload],
      )
      event = updatedEventResult.rows[0] as Record<string, unknown> | undefined
    }
    if (!event) throw new Error('commercial_payment_event_insert_returned_no_row')

    const current = await ensureAndLockCommercialState(client, companyId)
    if (!current.billing_enabled) {
      await client.query('COMMIT')
      return { applied: false, reason: 'billing_disabled', order, event, state: current }
    }
    if (!isVerifiedPaidEvent(event)) {
      await client.query('COMMIT')
      return { applied: false, reason: 'event_not_verified_paid', order, event, state: current }
    }

    const nextTier = normalizeTier(order.plan_tier)
    if (nextTier === 'group') {
      throw new CommercialOperationError(
        'COMMERCIAL_GROUP_PLAN_REQUIRES_MANUAL_CONTRACT',
        'Group plan cannot be activated by an automatic payment event',
        409,
      )
    }
    const paidOrderResult = await client.query(
      `UPDATE public.company_commercial_orders
       SET payment_status = 'paid', updated_at = NOW()
       WHERE id = $1 AND company_id = $2
       RETURNING id, company_id, plan_tier, amount_cents, currency, payment_provider, payment_status, provider_order_id, created_at, updated_at`,
      [orderId, companyId],
    )
    if (paidOrderResult.rowCount !== 1) throw new Error('commercial_order_payment_transition_failed')

    const updatedState = await updateCommercialState(client, {
      current,
      actorUserId: input.actorUserId,
      auditAction: 'commercial_payment_event_applied',
      patch: {
        planTier: nextTier,
        commercialState: 'active',
        activeProjectLimit: Math.max(current.active_project_limit, TIER_PROJECT_LIMITS[nextTier]),
        planStartedAt: new Date().toISOString(),
        reason: `payment_event_applied:${providerEventId ?? event.id}`,
      },
    })

    const appliedEventResult = await client.query(
      `UPDATE public.company_commercial_payment_events
       SET event_status = 'applied'
       WHERE id = $1
         AND company_id = $2
         AND order_id = $3
         AND event_status = 'verified'
       RETURNING id, order_id, company_id, payment_provider, event_type, event_status, provider_event_id, payload, created_at`,
      [event.id, companyId, orderId],
    )
    if (appliedEventResult.rowCount !== 1) throw new Error('commercial_payment_event_transition_failed')

    await client.query('COMMIT')
    return {
      applied: true,
      reason: 'payment_applied',
      order: paidOrderResult.rows[0] as Record<string, unknown>,
      event: appliedEventResult.rows[0] as Record<string, unknown>,
      state: updatedState,
    }
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw error
  } finally {
    client.release()
  }
}
