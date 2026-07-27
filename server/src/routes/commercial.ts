import { Router } from 'express'
import { z } from 'zod'
import { getRequestCompanyId } from '../auth/companyContext.js'
import { getCurrentCompanyMembership } from '../auth/access.js'
import { asyncHandler } from '../middleware/errorHandler.js'
import { authenticate } from '../middleware/auth.js'
import type { ApiResponse } from '../types/index.js'
import {
  COMMERCIAL_PLAN_CATALOG,
  countActiveProjects,
  createCommercialOrder,
  getCommercialState,
  type CommercialPlanTier,
  type CommercialState,
  type CommercialPaymentEventStatus,
} from '../services/commercialFoundationService.js'
import {
  changeCommercialStateAtomic,
  isCommercialPlatformOperator,
  recordCommercialPaymentEventAtomic,
} from '../services/commercialTransactionService.js'

const router = Router()
router.use(authenticate)

const commercialStatePatchSchema = z.object({
  planTier: z.enum(['free', 'starter', 'pro', 'group']).optional(),
  plan_tier: z.enum(['free', 'starter', 'pro', 'group']).optional(),
  commercialState: z.enum(['trial', 'active', 'suspended', 'expired', 'archived']).optional(),
  commercial_state: z.enum(['trial', 'active', 'suspended', 'expired', 'archived']).optional(),
  activeProjectLimit: z.number().int().min(0).optional(),
  active_project_limit: z.number().int().min(0).optional(),
  billingEnabled: z.boolean().optional(),
  billing_enabled: z.boolean().optional(),
  planStartedAt: z.string().nullable().optional(),
  plan_started_at: z.string().nullable().optional(),
  planExpiresAt: z.string().nullable().optional(),
  plan_expires_at: z.string().nullable().optional(),
  reason: z.string().max(500).optional(),
  highRiskConfirmation: z.boolean().optional(),
  high_risk_confirmation: z.boolean().optional(),
})

const commercialOrderSchema = z.object({
  planTier: z.enum(['starter', 'pro']).optional(),
  plan_tier: z.enum(['starter', 'pro']).optional(),
  amountCents: z.number().int().min(0).optional(),
  amount_cents: z.number().int().min(0).optional(),
  currency: z.string().trim().min(1).max(8).optional(),
  paymentProvider: z.string().trim().min(1).max(40).optional(),
  payment_provider: z.string().trim().min(1).max(40).optional(),
})

const commercialPaymentEventSchema = z.object({
  paymentProvider: z.string().trim().min(1).max(40).optional(),
  payment_provider: z.string().trim().min(1).max(40).optional(),
  eventType: z.string().trim().min(1).max(80).optional(),
  event_type: z.string().trim().min(1).max(80).optional(),
  eventStatus: z.enum(['received', 'verified', 'rejected', 'applied']).optional(),
  event_status: z.enum(['received', 'verified', 'rejected', 'applied']).optional(),
  providerEventId: z.string().trim().min(1).max(160).optional(),
  provider_event_id: z.string().trim().min(1).max(160).optional(),
  payload: z.record(z.unknown()).optional(),
})

function errorResponse(code: string, message: string): ApiResponse {
  return {
    success: false,
    error: { code, message },
    timestamp: new Date().toISOString(),
  }
}

async function requireCurrentCompanyAdmin(userId: string | undefined, requestedCompanyId?: string | null) {
  if (!userId) return null
  const membership = await getCurrentCompanyMembership(userId, requestedCompanyId)
  if (!membership?.companyId || membership.role !== 'company_admin') return null
  return membership.companyId
}

async function requireCommercialOperator(userId: string | undefined) {
  return userId ? isCommercialPlatformOperator(userId) : false
}

router.get('/state', asyncHandler(async (req, res) => {
  const companyId = await requireCurrentCompanyAdmin(req.user?.id, getRequestCompanyId(req))
  if (!companyId) {
    return res.status(403).json(errorResponse('FORBIDDEN', 'Only company admins can read commercial state'))
  }

  const state = await getCommercialState(companyId)
  const activeProjectCount = await countActiveProjects(companyId)
  res.json({
    success: true,
    data: {
      ...state,
      active_project_count: activeProjectCount,
      plans: COMMERCIAL_PLAN_CATALOG,
    },
    timestamp: new Date().toISOString(),
  })
}))

router.patch('/state', asyncHandler(async (req, res) => {
  const companyId = getRequestCompanyId(req)
  if (!companyId) {
    return res.status(400).json(errorResponse('COMPANY_CONTEXT_REQUIRED', 'Company context is required'))
  }
  if (!req.user?.id || !(await requireCommercialOperator(req.user.id))) {
    return res.status(403).json(errorResponse(
      'COMMERCIAL_PLATFORM_OPERATOR_REQUIRED',
      'Only a platform commercial operator can change commercial state',
    ))
  }

  const parsed = commercialStatePatchSchema.safeParse(req.body ?? {})
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid commercial state patch',
        details: parsed.error.flatten(),
      },
      timestamp: new Date().toISOString(),
    } satisfies ApiResponse)
  }

  const body = parsed.data
  let state
  try {
    state = await changeCommercialStateAtomic({
      companyId,
      actorUserId: req.user.id,
      patch: {
        planTier: (body.planTier ?? body.plan_tier) as CommercialPlanTier | undefined,
        commercialState: (body.commercialState ?? body.commercial_state) as CommercialState | undefined,
        activeProjectLimit: body.activeProjectLimit ?? body.active_project_limit,
        billingEnabled: body.billingEnabled ?? body.billing_enabled,
        planStartedAt: body.planStartedAt ?? body.plan_started_at,
        planExpiresAt: body.planExpiresAt ?? body.plan_expires_at,
        reason: body.reason,
        highRiskConfirmation: body.highRiskConfirmation ?? body.high_risk_confirmation,
      },
    })
  } catch (error) {
    const code = String((error as { code?: unknown } | null)?.code ?? '')
    if (code === 'COMMERCIAL_HIGH_RISK_CONFIRMATION_REQUIRED') {
      return res.status(400).json(errorResponse(
        'COMMERCIAL_HIGH_RISK_CONFIRMATION_REQUIRED',
        'High-risk commercial state changes require explicit confirmation and a reason',
      ))
    }
    throw error
  }

  res.json({
    success: true,
    data: state,
    timestamp: new Date().toISOString(),
  })
}))

router.post('/orders', asyncHandler(async (req, res) => {
  const companyId = await requireCurrentCompanyAdmin(req.user?.id, getRequestCompanyId(req))
  if (!companyId) {
    return res.status(403).json(errorResponse('FORBIDDEN', 'Only company admins can create commercial orders'))
  }

  const parsed = commercialOrderSchema.safeParse(req.body ?? {})
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid commercial order payload',
        details: parsed.error.flatten(),
      },
      timestamp: new Date().toISOString(),
    } satisfies ApiResponse)
  }

  const body = parsed.data
  const order = await createCommercialOrder({
    companyId,
    actorUserId: req.user?.id,
    planTier: (body.planTier ?? body.plan_tier ?? 'starter') as CommercialPlanTier,
    amountCents: body.amountCents ?? body.amount_cents ?? 0,
    currency: body.currency,
    paymentProvider: body.paymentProvider ?? body.payment_provider ?? 'manual',
  })

  res.status(201).json({
    success: true,
    data: order,
    timestamp: new Date().toISOString(),
  })
}))

router.post('/orders/:orderId/payment-events', asyncHandler(async (req, res) => {
  const companyId = getRequestCompanyId(req)
  if (!companyId) {
    return res.status(400).json(errorResponse('COMPANY_CONTEXT_REQUIRED', 'Company context is required'))
  }
  if (!req.user?.id || !(await requireCommercialOperator(req.user.id))) {
    return res.status(403).json(errorResponse(
      'COMMERCIAL_PLATFORM_OPERATOR_REQUIRED',
      'Only a platform commercial operator can verify or apply payment events',
    ))
  }

  const parsed = commercialPaymentEventSchema.safeParse(req.body ?? {})
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid commercial payment event payload',
        details: parsed.error.flatten(),
      },
      timestamp: new Date().toISOString(),
    } satisfies ApiResponse)
  }

  const body = parsed.data
  const result = await recordCommercialPaymentEventAtomic({
    companyId,
    actorUserId: req.user?.id,
    orderId: String(req.params.orderId ?? ''),
    paymentProvider: body.paymentProvider ?? body.payment_provider ?? 'manual',
    eventType: body.eventType ?? body.event_type ?? 'payment_succeeded',
    eventStatus: (body.eventStatus ?? body.event_status ?? 'received') as CommercialPaymentEventStatus,
    providerEventId: body.providerEventId ?? body.provider_event_id,
    payload: body.payload,
  })

  res.status(result.applied ? 200 : 202).json({
    success: true,
    data: result,
    timestamp: new Date().toISOString(),
  })
}))

export default router
