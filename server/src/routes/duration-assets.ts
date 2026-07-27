import { Router } from 'express'
import { z } from 'zod'

import { getCurrentCompanyMembership, getProjectCompanyId, getVisibleProjectIds } from '../auth/access.js'
import { getRequestCompanyId } from '../auth/companyContext.js'
import { authenticate } from '../middleware/auth.js'
import { asyncHandler } from '../middleware/errorHandler.js'
import {
  DURATION_ASSET_REVIEW_KEYS,
  listDurationAssetReviewItems,
  listSharedDurationAssetReviewItems,
} from '../services/durationAssetReviewQueueService.js'
import { isDurationAssetGovernanceOperator } from '../services/durationAssetPlatformOperatorService.js'
import { decideDurationAssetReviewItem } from '../services/durationAssetReviewDecisionService.js'
import { areRuleAssetRuntimeActionsEnabled } from '../services/v14231ActionableSurfaceRegistryService.js'
import type { ApiResponse } from '../types/index.js'

const router = Router()

router.use(authenticate)

const reviewListSchema = z.object({
  assetKey: z.enum(DURATION_ASSET_REVIEW_KEYS).optional(),
  scope: z.enum(['project', 'company', 'industry', 'global']).optional(),
  projectId: z.string().uuid().optional(),
  reason: z.string().trim().max(120).optional(),
  status: z.enum(['open', 'approved', 'rejected', 'superseded', 'resolved_by_publication']).optional(),
  age: z.enum(['all', '24h', '7d', '30d']).optional(),
})

const sharedReviewListSchema = reviewListSchema
  .omit({ scope: true, projectId: true })
  .extend({ scope: z.enum(['industry', 'global']).optional() })

const reviewDecisionSchema = z.object({
  decision: z.enum(['approve', 'reject', 'supersede']),
  decisionNotes: z.string().trim().min(1).max(1000),
})

const reviewItemParamsSchema = z.object({
  reviewItemId: z.string().uuid(),
})

function forbidden(
  res: any,
  code: 'FORBIDDEN' | 'FORBIDDEN_COMPANY_SCOPE' | 'DURATION_ASSET_PLATFORM_OPERATOR_REQUIRED',
  message: string,
) {
  return res.status(403).json({
    success: false,
    error: { code, message },
    timestamp: new Date().toISOString(),
  } satisfies ApiResponse)
}

router.get('/review-items', asyncHandler(async (req: any, res) => {
  const platformOperator = await isDurationAssetGovernanceOperator(req.user?.id)
  if (platformOperator && (!req.query.scope || req.query.scope === 'industry' || req.query.scope === 'global')) {
    const filters = sharedReviewListSchema.parse(req.query)
    const data = await listSharedDurationAssetReviewItems({
      assetKey: filters.assetKey,
      scopeLevel: filters.scope,
      reason: filters.reason,
      status: filters.status,
      age: filters.age,
    })
    return res.json({ success: true, data, timestamp: new Date().toISOString() } satisfies ApiResponse)
  }

  const membership = req.user?.id
    ? await getCurrentCompanyMembership(req.user.id, getRequestCompanyId(req))
    : null
  if (membership?.role !== 'company_admin' || !membership.companyId) {
    return forbidden(res, 'FORBIDDEN', 'Duration asset reviews are available to current company administrators only.')
  }

  const filters = reviewListSchema.parse(req.query)
  const visibleProjectIds = await getVisibleProjectIds(
    req.user.id,
    req.user.globalRole,
    membership.companyId,
  )
  if (filters.projectId) {
    const projectCompanyId = await getProjectCompanyId(filters.projectId)
    const visible = visibleProjectIds === null || visibleProjectIds.includes(filters.projectId)
    if (!projectCompanyId || projectCompanyId !== membership.companyId || !visible) {
      return forbidden(
        res,
        'FORBIDDEN_COMPANY_SCOPE',
        'The requested project is outside the current company review scope.',
      )
    }
  }

  const data = await listDurationAssetReviewItems({
    companyId: membership.companyId,
    projectIds: visibleProjectIds,
    assetKey: filters.assetKey,
    scopeLevel: filters.scope,
    projectId: filters.projectId,
    reason: filters.reason,
    status: filters.status,
    age: filters.age,
  })
  res.json({
    success: true,
    data,
    timestamp: new Date().toISOString(),
  } satisfies ApiResponse)
}))

router.post('/review-items/:reviewItemId/decision', asyncHandler(async (req: any, res) => {
  const reviewerUserId = String(req.user?.id ?? '').trim()
  if (!reviewerUserId || !(await isDurationAssetGovernanceOperator(reviewerUserId))) {
    return forbidden(
      res,
      'DURATION_ASSET_PLATFORM_OPERATOR_REQUIRED',
      'A dedicated duration governance platform operator is required for shared-scope decisions.',
    )
  }
  const { reviewItemId } = reviewItemParamsSchema.parse(req.params)
  const decision = reviewDecisionSchema.parse(req.body ?? {})
  if (decision.decision === 'approve' && !areRuleAssetRuntimeActionsEnabled()) {
    return res.status(409).json({
      success: false,
      error: {
        code: 'ACTION_READINESS_GATED',
        message: 'Runtime publication actions are not enabled.',
      },
      timestamp: new Date().toISOString(),
    } satisfies ApiResponse)
  }
  const data = await decideDurationAssetReviewItem({
    reviewItemId,
    decision: decision.decision,
    decisionReason: decision.decisionNotes,
    authority: {
      kind: 'duration_governance_operator',
      reviewerUserId,
    },
  })
  res.json({ success: true, data, timestamp: new Date().toISOString() } satisfies ApiResponse)
}))

export default router
