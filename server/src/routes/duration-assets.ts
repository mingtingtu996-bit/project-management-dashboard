import { Router } from 'express'
import { z } from 'zod'

import { getCurrentCompanyMembership, getProjectCompanyId, getVisibleProjectIds } from '../auth/access.js'
import { getRequestCompanyId } from '../auth/companyContext.js'
import { authenticate } from '../middleware/auth.js'
import { asyncHandler } from '../middleware/errorHandler.js'
import {
  DURATION_ASSET_REVIEW_KEYS,
  listDurationAssetReviewItems,
} from '../services/durationAssetReviewQueueService.js'
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

function forbidden(res: any, code: 'FORBIDDEN' | 'FORBIDDEN_COMPANY_SCOPE', message: string) {
  return res.status(403).json({
    success: false,
    error: { code, message },
    timestamp: new Date().toISOString(),
  } satisfies ApiResponse)
}

router.get('/review-items', asyncHandler(async (req: any, res) => {
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

export default router
