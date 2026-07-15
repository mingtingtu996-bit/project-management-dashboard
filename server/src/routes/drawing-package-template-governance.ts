import { Router } from 'express'

import { getCurrentCompanyMembership } from '../auth/access.js'
import { getRequestCompanyId } from '../auth/companyContext.js'
import { authenticate } from '../middleware/auth.js'
import { asyncHandler } from '../middleware/errorHandler.js'
import {
  buildDrawingPackageExperienceIterationReportFromProjectExperience,
  loadLatestDrawingPackageExperienceIterationRun,
  publishDrawingPackageExperienceIterationRunFromProjectExperience,
} from '../services/drawingPackageExperienceIterationService.js'
import type { ApiResponse } from '../types/index.js'

const router = Router()
router.use(authenticate)

async function ensureCompanyAdmin(req: any, res: any) {
  const membership = req.user?.id
    ? await getCurrentCompanyMembership(req.user.id, getRequestCompanyId(req))
    : null
  if (membership?.role === 'company_admin') return true
  res.status(403).json({
    success: false,
    error: {
      code: 'FORBIDDEN',
      message: 'Drawing package template governance diagnostics are available to company administrators only.',
    },
    timestamp: new Date().toISOString(),
  } satisfies ApiResponse)
  return false
}

router.get('/experience-iteration/report', asyncHandler(async (req, res) => {
  if (!await ensureCompanyAdmin(req, res)) return
  const minimumCalibratedSamples = req.query.minimumCalibratedSamples == null
    ? undefined
    : Number(req.query.minimumCalibratedSamples)
  const data = await buildDrawingPackageExperienceIterationReportFromProjectExperience({
    minimumCalibratedSamples: Number.isFinite(minimumCalibratedSamples) && minimumCalibratedSamples > 0
      ? minimumCalibratedSamples
      : undefined,
  })
  res.json({
    success: true,
    data,
    timestamp: new Date().toISOString(),
  } satisfies ApiResponse<typeof data>)
}))

router.get('/experience-iteration/latest-run', asyncHandler(async (req, res) => {
  if (!await ensureCompanyAdmin(req, res)) return
  const data = await loadLatestDrawingPackageExperienceIterationRun()
  res.json({
    success: true,
    data,
    timestamp: new Date().toISOString(),
  } satisfies ApiResponse<typeof data>)
}))

router.post('/experience-iteration/run', asyncHandler(async (req, res) => {
  if (!await ensureCompanyAdmin(req, res)) return
  const minimumCalibratedSamples = req.body?.minimumCalibratedSamples == null
    ? undefined
    : Number(req.body.minimumCalibratedSamples)
  const minimumPackageHitRate = req.body?.minimumPackageHitRate == null
    ? undefined
    : Number(req.body.minimumPackageHitRate)
  const data = await publishDrawingPackageExperienceIterationRunFromProjectExperience({
    asOfDate: req.body?.asOfDate ?? req.body?.as_of_date ?? undefined,
    minimumCalibratedSamples: Number.isFinite(minimumCalibratedSamples) && minimumCalibratedSamples > 0
      ? minimumCalibratedSamples
      : undefined,
    minimumPackageHitRate: Number.isFinite(minimumPackageHitRate) && minimumPackageHitRate > 0
      ? minimumPackageHitRate
      : undefined,
  })
  res.json({
    success: true,
    data,
    timestamp: new Date().toISOString(),
  } satisfies ApiResponse<typeof data>)
}))

export default router
