import { Router } from 'express'

import { getCurrentCompanyMembership } from '../auth/access.js'
import { getRequestCompanyId } from '../auth/companyContext.js'
import { authenticate } from '../middleware/auth.js'
import { asyncHandler } from '../middleware/errorHandler.js'
import { collectDurationContextGovernanceReport } from '../services/durationContextGovernanceService.js'
import {
  approveDurationContextPolicyCanaryCandidateBatch,
  approveDurationContextPolicyCanaryCandidate,
  rejectDurationContextPolicyCanaryCandidate,
  rollbackDurationContextPolicyVersion,
} from '../services/durationContextPolicyCanaryApprovalService.js'
import { previewDurationContextPolicySelection } from '../services/durationContextPolicySelectorService.js'
import { evaluateDurationContextCanaryActivationReadiness } from '../services/durationContextPolicyActivationGateService.js'
import { runDurationContextApprovedCanaryShadowReplay } from '../services/durationContextPolicyShadowReplayService.js'
import { buildDurationContextCanaryTrialReleasePlan } from '../services/durationContextPolicyTrialReleasePlanService.js'
import { buildDurationContextColdStartLearningPlan } from '../services/durationContextColdStartLearningPlanService.js'
import type { ApiResponse } from '../types/index.js'

const router = Router()

router.use(authenticate)

async function ensureCompanyAdmin(req: any, res: any) {
  const membership = req.user?.id
    ? await getCurrentCompanyMembership(req.user.id, getRequestCompanyId(req))
    : null
  const companyId = String(membership?.companyId ?? getRequestCompanyId(req) ?? '').trim()
  if (membership?.role === 'company_admin' && companyId) return companyId
  res.status(403).json({
    success: false,
    error: {
      code: 'FORBIDDEN',
      message: 'Duration context governance diagnostics are available to company administrators only.',
    },
    timestamp: new Date().toISOString(),
  } satisfies ApiResponse)
  return false
}

router.get('/report', asyncHandler(async (req, res) => {
  if (!await ensureCompanyAdmin(req, res)) return
  res.json({
    success: true,
    data: collectDurationContextGovernanceReport(),
    timestamp: new Date().toISOString(),
  } satisfies ApiResponse)
}))

router.post('/canary-candidates/batch-approve', asyncHandler(async (req, res) => {
  const companyId = await ensureCompanyAdmin(req, res)
  if (!companyId) return
  const data = await approveDurationContextPolicyCanaryCandidateBatch({
    companyId,
    batchId: req.body?.batchId ?? req.body?.batch_id ?? null,
    approvedBy: req.user?.id ?? null,
    reason: req.body?.reason ?? null,
    items: Array.isArray(req.body?.items) ? req.body.items : [],
  })
  res.json({
    success: true,
    data,
    timestamp: new Date().toISOString(),
  } satisfies ApiResponse)
}))

router.post('/canary-candidates/:candidateId/approve', asyncHandler(async (req, res) => {
  const companyId = await ensureCompanyAdmin(req, res)
  if (!companyId) return
  const data = await approveDurationContextPolicyCanaryCandidate({
    companyId,
    candidateId: String(req.params.candidateId ?? ''),
    approvedBy: req.user?.id ?? null,
    scope: req.body?.scope ?? null,
    reason: req.body?.reason ?? null,
    expiresAt: req.body?.expiresAt ?? req.body?.expires_at ?? null,
  })
  res.json({
    success: true,
    data,
    timestamp: new Date().toISOString(),
  } satisfies ApiResponse)
}))

router.post('/canary-candidates/:candidateId/reject', asyncHandler(async (req, res) => {
  const companyId = await ensureCompanyAdmin(req, res)
  if (!companyId) return
  const data = await rejectDurationContextPolicyCanaryCandidate({
    companyId,
    candidateId: String(req.params.candidateId ?? ''),
    rejectedBy: req.user?.id ?? null,
    reason: req.body?.reason ?? null,
  })
  res.json({
    success: true,
    data,
    timestamp: new Date().toISOString(),
  } satisfies ApiResponse)
}))

router.post('/policy-versions/:versionId/rollback', asyncHandler(async (req, res) => {
  const companyId = await ensureCompanyAdmin(req, res)
  if (!companyId) return
  const data = await rollbackDurationContextPolicyVersion({
    companyId,
    versionId: String(req.params.versionId ?? ''),
    rolledBackBy: req.user?.id ?? null,
    reason: req.body?.reason ?? null,
  })
  res.json({
    success: true,
    data,
    timestamp: new Date().toISOString(),
  } satisfies ApiResponse)
}))

router.post('/policy-versions/preview-selection', asyncHandler(async (req, res) => {
  if (!await ensureCompanyAdmin(req, res)) return
  const data = await previewDurationContextPolicySelection({
    projectId: req.body?.projectId ?? req.body?.project_id ?? null,
    stateBucket: req.body?.stateBucket ?? req.body?.state_bucket ?? null,
    asOfDate: req.body?.asOfDate ?? req.body?.as_of_date ?? null,
  })
  res.json({
    success: true,
    data,
    timestamp: new Date().toISOString(),
  } satisfies ApiResponse)
}))

router.post('/policy-versions/shadow-replay', asyncHandler(async (req, res) => {
  if (!await ensureCompanyAdmin(req, res)) return
  const data = await runDurationContextApprovedCanaryShadowReplay({
    projectIds: Array.isArray(req.body?.projectIds)
      ? req.body.projectIds
      : Array.isArray(req.body?.project_ids)
        ? req.body.project_ids
        : null,
    asOfDate: req.body?.asOfDate ?? req.body?.as_of_date ?? null,
    limit: req.body?.limit ?? null,
  })
  res.json({
    success: true,
    data,
    timestamp: new Date().toISOString(),
  } satisfies ApiResponse)
}))

router.post('/policy-versions/activation-readiness', asyncHandler(async (req, res) => {
  if (!await ensureCompanyAdmin(req, res)) return
  const data = await evaluateDurationContextCanaryActivationReadiness({
    projectIds: Array.isArray(req.body?.projectIds)
      ? req.body.projectIds
      : Array.isArray(req.body?.project_ids)
        ? req.body.project_ids
        : null,
    asOfDate: req.body?.asOfDate ?? req.body?.as_of_date ?? null,
    limit: req.body?.limit ?? null,
    minMatchedCases: req.body?.minMatchedCases ?? req.body?.min_matched_cases ?? null,
    minProjectedRewardDelta: req.body?.minProjectedRewardDelta ?? req.body?.min_projected_reward_delta ?? null,
    maxBlockedCaseRatio: req.body?.maxBlockedCaseRatio ?? req.body?.max_blocked_case_ratio ?? null,
  })
  res.json({
    success: true,
    data,
    timestamp: new Date().toISOString(),
  } satisfies ApiResponse)
}))

router.post('/policy-versions/trial-release-plan', asyncHandler(async (req, res) => {
  if (!await ensureCompanyAdmin(req, res)) return
  const data = await buildDurationContextCanaryTrialReleasePlan({
    projectIds: Array.isArray(req.body?.projectIds)
      ? req.body.projectIds
      : Array.isArray(req.body?.project_ids)
        ? req.body.project_ids
        : null,
    asOfDate: req.body?.asOfDate ?? req.body?.as_of_date ?? null,
    limit: req.body?.limit ?? null,
    minMatchedCases: req.body?.minMatchedCases ?? req.body?.min_matched_cases ?? null,
    minProjectedRewardDelta: req.body?.minProjectedRewardDelta ?? req.body?.min_projected_reward_delta ?? null,
    maxBlockedCaseRatio: req.body?.maxBlockedCaseRatio ?? req.body?.max_blocked_case_ratio ?? null,
    requestedTrafficPercent: req.body?.requestedTrafficPercent ?? req.body?.requested_traffic_percent ?? null,
    trialDays: req.body?.trialDays ?? req.body?.trial_days ?? null,
    requestedBy: req.user?.id ?? null,
  })
  res.json({
    success: true,
    data,
    timestamp: new Date().toISOString(),
  } satisfies ApiResponse)
}))

router.post('/policy-learning/cold-start-plan', asyncHandler(async (req, res) => {
  if (!await ensureCompanyAdmin(req, res)) return
  const data = await buildDurationContextColdStartLearningPlan({
    projectIds: Array.isArray(req.body?.projectIds)
      ? req.body.projectIds
      : Array.isArray(req.body?.project_ids)
        ? req.body.project_ids
        : null,
    asOfDate: req.body?.asOfDate ?? req.body?.as_of_date ?? null,
    limit: req.body?.limit ?? null,
  })
  res.json({
    success: true,
    data,
    timestamp: new Date().toISOString(),
  } satisfies ApiResponse)
}))

export default router
