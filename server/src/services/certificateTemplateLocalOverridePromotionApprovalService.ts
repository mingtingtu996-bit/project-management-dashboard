import {
  buildCertificateLocalOverrideGovernanceReport,
  type CertificateLocalOverridePublishPromotionPlan,
} from './certificateTemplateLocalOverrideGovernanceService.js'

export interface CertificateLocalOverridePromotionApprovalInput {
  planCode: CertificateLocalOverridePublishPromotionPlan['planCode'] | string
  approvedBy?: string | null
  reason?: string | null
}

export interface CertificateLocalOverridePromotionRejectionInput {
  planCode: CertificateLocalOverridePublishPromotionPlan['planCode'] | string
  rejectedBy?: string | null
  reason?: string | null
}

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

function normalizeId(value: unknown) {
  const text = normalizeText(value)
  return text || null
}

function loadPromotionPlan(planCode: string) {
  const report = buildCertificateLocalOverrideGovernanceReport()
  const promotionPlan = report.localOverridePublishPromotionPlan
  if (planCode !== promotionPlan.planCode) {
    throw new Error(`Certificate local override promotion plan not found: ${planCode || 'unknown'}`)
  }
  if (!promotionPlan.promotionPlan) {
    throw new Error('Certificate local override promotion plan has no candidates ready for approval.')
  }
  return { report, promotionPlan: promotionPlan.promotionPlan }
}

export function approveCertificateLocalOverridePromotionPlan(
  input: CertificateLocalOverridePromotionApprovalInput,
) {
  const planCode = normalizeText(input.planCode)
  const { report, promotionPlan } = loadPromotionPlan(planCode)
  const approvedOverrideCodes = promotionPlan.candidates.map((candidate) => candidate.overrideCode)
  const plannedPublishedOverrideCodes = promotionPlan.candidates.map((candidate) => candidate.generatedPublishedOverrideCode)

  return {
    approvalCode: 'certificate_local_override_promotion_plan_approval' as const,
    frontendExposurePolicy: 'backend_admin_api_only' as const,
    runtimeMutationPolicy: 'none_approval_record_only' as const,
    planCode: promotionPlan.status === 'draft_review_required' ? planCode : planCode,
    approvalStatus: 'approved_for_seed_version_authoring' as const,
    approvedBy: normalizeId(input.approvedBy),
    approvedAt: new Date().toISOString(),
    approvalReason: normalizeText(input.reason) || null,
    runtimePreviewPolicy: 'business_preview_consumes_published_overrides_only' as const,
    publishedSeedMutationPolicy: 'not_mutated_by_approval_record' as const,
    nextGovernanceAction: 'author_published_seed_version' as const,
    approvedCandidateCount: approvedOverrideCodes.length,
    approvedOverrideCodes,
    plannedPublishedOverrideCodes,
    currentPublishedOverrideCount: report.summary.publishedOverrideCount,
    currentCandidateOverrideCount: report.summary.candidateOverrideCount,
  }
}

export function rejectCertificateLocalOverridePromotionPlan(
  input: CertificateLocalOverridePromotionRejectionInput,
) {
  const planCode = normalizeText(input.planCode)
  const { report, promotionPlan } = loadPromotionPlan(planCode)
  const rejectedOverrideCodes = promotionPlan.candidates.map((candidate) => candidate.overrideCode)

  return {
    approvalCode: 'certificate_local_override_promotion_plan_rejection' as const,
    frontendExposurePolicy: 'backend_admin_api_only' as const,
    runtimeMutationPolicy: 'none_rejection_record_only' as const,
    planCode,
    approvalStatus: 'rejected_for_seed_version_authoring' as const,
    rejectedBy: normalizeId(input.rejectedBy),
    rejectedAt: new Date().toISOString(),
    rejectionReason: normalizeText(input.reason) || null,
    runtimePreviewPolicy: 'business_preview_consumes_published_overrides_only' as const,
    nextGovernanceAction: 'revise_candidate_override_evidence' as const,
    rejectedCandidateCount: rejectedOverrideCodes.length,
    rejectedOverrideCodes,
    currentPublishedOverrideCount: report.summary.publishedOverrideCount,
    currentCandidateOverrideCount: report.summary.candidateOverrideCount,
  }
}
