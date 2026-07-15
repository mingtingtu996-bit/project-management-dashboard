import { Router } from 'express'

import { getCurrentCompanyMembership } from '../auth/access.js'
import { getRequestCompanyId } from '../auth/companyContext.js'
import { authenticate } from '../middleware/auth.js'
import { asyncHandler } from '../middleware/errorHandler.js'
import { buildCertificateLocalOverrideGovernanceReport } from '../services/certificateTemplateLocalOverrideGovernanceService.js'
import {
  approveCertificateLocalOverridePromotionPlan,
  rejectCertificateLocalOverridePromotionPlan,
} from '../services/certificateTemplateLocalOverridePromotionApprovalService.js'
import { buildCertificateLocalOverridePublishedSeedAuthoringPackage } from '../services/certificateTemplateLocalOverridePublishedSeedAuthoringService.js'
import {
  buildCertificateLocalOverrideSeedSwapAuditRecord,
  buildCertificateLocalOverrideSeedSwapReadinessPlan,
} from '../services/certificateTemplateLocalOverrideSeedSwapReadinessService.js'
import {
  buildCertificatePolicyUpdateGovernanceReport,
  getLatestCertificatePolicyAutoPublishRun,
} from '../services/certificateTemplatePolicyUpdateService.js'
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
      message: 'Certificate template policy governance diagnostics are available to company administrators only.',
    },
    timestamp: new Date().toISOString(),
  } satisfies ApiResponse)
  return false
}

function isNoLocalOverrideCandidatesError(error: unknown) {
  return error instanceof Error
    && error.message === 'Certificate local override promotion plan has no candidates ready for approval.'
}

function sendNoLocalOverrideCandidatesResponse(res: any, message: string) {
  res.status(409).json({
    success: false,
    error: {
      code: 'NO_LOCAL_OVERRIDE_PROMOTION_CANDIDATES',
      message,
    },
    timestamp: new Date().toISOString(),
  } satisfies ApiResponse)
}

router.get('/policy-updates/report', asyncHandler(async (req, res) => {
  if (!await ensureCompanyAdmin(req, res)) return
  const asOfDate = String(req.query.asOfDate ?? '').trim() || undefined
  const data = buildCertificatePolicyUpdateGovernanceReport({ asOfDate })
  res.json({
    success: true,
    data,
    timestamp: new Date().toISOString(),
  } satisfies ApiResponse<typeof data>)
}))

router.get('/policy-updates/latest-run', asyncHandler(async (req, res) => {
  if (!await ensureCompanyAdmin(req, res)) return
  const data = getLatestCertificatePolicyAutoPublishRun()
  res.json({
    success: true,
    data,
    timestamp: new Date().toISOString(),
  } satisfies ApiResponse<typeof data>)
}))

router.get('/local-overrides/report', asyncHandler(async (req, res) => {
  if (!await ensureCompanyAdmin(req, res)) return
  const data = buildCertificateLocalOverrideGovernanceReport()
  res.json({
    success: true,
    data,
    timestamp: new Date().toISOString(),
  } satisfies ApiResponse<typeof data>)
}))

router.post('/local-overrides/promotion-plans/:planCode/approve', asyncHandler(async (req, res) => {
  if (!await ensureCompanyAdmin(req, res)) return
  let data
  try {
    data = approveCertificateLocalOverridePromotionPlan({
      planCode: String(req.params.planCode ?? ''),
      approvedBy: req.user?.id ?? null,
      reason: req.body?.reason ?? null,
    })
  } catch (error) {
    if (isNoLocalOverrideCandidatesError(error)) {
      sendNoLocalOverrideCandidatesResponse(res, 'First-batch local certificate override rules are already published; no promotion approval candidates remain.')
      return
    }
    throw error
  }
  res.json({
    success: true,
    data,
    timestamp: new Date().toISOString(),
  } satisfies ApiResponse<typeof data>)
}))

router.post('/local-overrides/promotion-plans/:planCode/reject', asyncHandler(async (req, res) => {
  if (!await ensureCompanyAdmin(req, res)) return
  let data
  try {
    data = rejectCertificateLocalOverridePromotionPlan({
      planCode: String(req.params.planCode ?? ''),
      rejectedBy: req.user?.id ?? null,
      reason: req.body?.reason ?? null,
    })
  } catch (error) {
    if (isNoLocalOverrideCandidatesError(error)) {
      sendNoLocalOverrideCandidatesResponse(res, 'First-batch local certificate override rules are already published; no promotion rejection candidates remain.')
      return
    }
    throw error
  }
  res.json({
    success: true,
    data,
    timestamp: new Date().toISOString(),
  } satisfies ApiResponse<typeof data>)
}))

router.post('/local-overrides/promotion-plans/:planCode/author-published-seed', asyncHandler(async (req, res) => {
  if (!await ensureCompanyAdmin(req, res)) return
  let data
  try {
    data = buildCertificateLocalOverridePublishedSeedAuthoringPackage({
      planCode: String(req.params.planCode ?? ''),
      approvedBy: req.user?.id ?? null,
      targetSeedVersion: req.body?.targetSeedVersion ?? req.body?.target_seed_version ?? null,
      reason: req.body?.reason ?? null,
    })
  } catch (error) {
    if (isNoLocalOverrideCandidatesError(error)) {
      sendNoLocalOverrideCandidatesResponse(res, 'First-batch local certificate override rules are already published; no authoring package candidates remain.')
      return
    }
    throw error
  }
  res.json({
    success: true,
    data,
    timestamp: new Date().toISOString(),
  } satisfies ApiResponse<typeof data>)
}))

router.post('/local-overrides/promotion-plans/:planCode/seed-swap-readiness', asyncHandler(async (req, res) => {
  if (!await ensureCompanyAdmin(req, res)) return
  let data
  try {
    data = buildCertificateLocalOverrideSeedSwapReadinessPlan({
      planCode: String(req.params.planCode ?? ''),
      approvedBy: req.user?.id ?? null,
      requestedBy: req.user?.id ?? null,
      targetSeedVersion: req.body?.targetSeedVersion ?? req.body?.target_seed_version ?? null,
      requestedWindow: req.body?.requestedWindow ?? req.body?.requested_window ?? null,
      reason: req.body?.reason ?? null,
    })
  } catch (error) {
    if (isNoLocalOverrideCandidatesError(error)) {
      sendNoLocalOverrideCandidatesResponse(res, 'First-batch local certificate override rules are already published; no seed-swap readiness candidates remain.')
      return
    }
    throw error
  }
  res.json({
    success: true,
    data,
    timestamp: new Date().toISOString(),
  } satisfies ApiResponse<typeof data>)
}))

router.post('/local-overrides/promotion-plans/:planCode/seed-swap-audit', asyncHandler(async (req, res) => {
  if (!await ensureCompanyAdmin(req, res)) return
  let data
  try {
    data = buildCertificateLocalOverrideSeedSwapAuditRecord({
      planCode: String(req.params.planCode ?? ''),
      approvedBy: req.user?.id ?? null,
      requestedBy: req.user?.id ?? null,
      executedBy: req.user?.id ?? null,
      targetSeedVersion: req.body?.targetSeedVersion ?? req.body?.target_seed_version ?? null,
      requestedWindow: req.body?.requestedWindow ?? req.body?.requested_window ?? null,
      executionWindow: req.body?.executionWindow ?? req.body?.execution_window ?? null,
      postSwapPreviewSmokeStatus: req.body?.postSwapPreviewSmokeStatus ?? req.body?.post_swap_preview_smoke_status ?? null,
      reason: req.body?.reason ?? null,
    })
  } catch (error) {
    if (isNoLocalOverrideCandidatesError(error)) {
      sendNoLocalOverrideCandidatesResponse(res, 'First-batch local certificate override rules are already published; no seed-swap audit candidates remain.')
      return
    }
    throw error
  }
  res.json({
    success: true,
    data,
    timestamp: new Date().toISOString(),
  } satisfies ApiResponse<typeof data>)
}))

export default router
