import { Router } from 'express'

import { getCurrentCompanyMembership, getProjectCompanyId, getVisibleProjectIds } from '../auth/access.js'
import { getRequestCompanyId } from '../auth/companyContext.js'
import { authenticate } from '../middleware/auth.js'
import { asyncHandler } from '../middleware/errorHandler.js'
import { getDurationAlgorithmAccuracySummary } from '../services/durationAlgorithmAccuracyService.js'
import type { ApiResponse } from '../types/index.js'

const router = Router()

router.use(authenticate)

function getQueryValue(value: unknown): string | null {
  if (typeof value === 'string') return value.trim() || null
  if (Array.isArray(value) && typeof value[0] === 'string') return value[0].trim() || null
  return null
}

async function resolveCompanyAdminMembership(req: any, res: any) {
  const membership = req.user?.id
    ? await getCurrentCompanyMembership(req.user.id, getRequestCompanyId(req))
    : null
  if (membership?.role === 'company_admin' && membership.companyId) return membership
  res.status(403).json({
    success: false,
    error: {
      code: 'FORBIDDEN',
      message: 'Duration accuracy diagnostics are available to company administrators only.',
    },
    timestamp: new Date().toISOString(),
  } satisfies ApiResponse)
  return null
}

function sendForbidden(res: any, message: string) {
  res.status(403).json({
    success: false,
    error: {
      code: 'FORBIDDEN',
      message,
    },
    timestamp: new Date().toISOString(),
  } satisfies ApiResponse)
}

async function ensureProjectWithinCurrentCompany(
  res: any,
  projectId: string | null,
  companyId: string,
): Promise<boolean> {
  if (!projectId) return true
  const projectCompanyId = await getProjectCompanyId(projectId)
  if (!projectCompanyId || projectCompanyId !== companyId) {
    sendForbidden(res, 'Duration accuracy diagnostics are limited to the current company workspace.')
    return false
  }
  return true
}

async function getCurrentCompanyProjectScope(req: any): Promise<string[] | null> {
  if (!req.user?.id) return []
  return await getVisibleProjectIds(req.user.id, req.user.globalRole, getRequestCompanyId(req))
}

router.get('/summary', asyncHandler(async (req, res) => {
  const membership = await resolveCompanyAdminMembership(req, res)
  if (!membership) return
  const projectId = getQueryValue(req.query.projectId ?? req.query.project_id)
  if (!await ensureProjectWithinCurrentCompany(res, projectId, membership.companyId)) return
  const projectIds = projectId ? undefined : await getCurrentCompanyProjectScope(req)
  const data = await getDurationAlgorithmAccuracySummary({
    companyId: membership.companyId,
    projectId,
    ...(projectId ? {} : { projectIds: projectIds ?? [] }),
    engineCode: getQueryValue(req.query.engineCode ?? req.query.engine_code),
  })
  res.json({
    success: true,
    data,
    timestamp: new Date().toISOString(),
  } satisfies ApiResponse)
}))

export default router
