import {
  approveCertificateLocalOverridePromotionPlan,
  type CertificateLocalOverridePromotionApprovalInput,
} from './certificateTemplateLocalOverridePromotionApprovalService.js'
import { buildCertificateLocalOverrideGovernanceReport } from './certificateTemplateLocalOverrideGovernanceService.js'

export interface BuildCertificateLocalOverridePublishedSeedAuthoringPackageInput
  extends CertificateLocalOverridePromotionApprovalInput {
  targetSeedVersion?: string | null
}

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

function resolveTargetSeedVersion(value: unknown) {
  const text = normalizeText(value)
  return text || 'v1.4.22.2-local-override-batch-1-published-draft'
}

export function buildCertificateLocalOverridePublishedSeedAuthoringPackage(
  input: BuildCertificateLocalOverridePublishedSeedAuthoringPackageInput,
) {
  const approval = approveCertificateLocalOverridePromotionPlan(input)
  const report = buildCertificateLocalOverrideGovernanceReport()
  const promotionCandidates = report.localOverridePublishPromotionPlan.promotionPlan?.candidates ?? []
  const reviewCandidateByCode = new Map(
    report.localOverridePublishReviewCandidates.map((candidate) => [candidate.overrideCode, candidate]),
  )
  const targetSeedVersion = resolveTargetSeedVersion(input.targetSeedVersion)

  const publishedOverrideDrafts = promotionCandidates.map((candidate) => {
    const reviewCandidate = reviewCandidateByCode.get(candidate.overrideCode)
    return {
      overrideCode: candidate.generatedPublishedOverrideCode,
      sourceCandidateOverrideCode: candidate.overrideCode,
      provinceCode: candidate.provinceCode,
      cityCode: candidate.cityCode,
      cityName: candidate.cityName,
      overrideScope: candidate.overrideScope,
      reviewStatus: 'published' as const,
      sourceCandidateReviewStatus: candidate.currentReviewStatus,
      sourceEvidenceCount: reviewCandidate?.sourceEvidenceCount ?? 0,
      materialPackageOverrideCount: reviewCandidate?.materialPackageOverrideCount ?? 0,
      hasTransferLandAcquisitionOverride: reviewCandidate?.hasTransferLandAcquisitionOverride === true,
      runtimeConsumptionPolicyAfterSeedSwap: candidate.runtimeConsumptionPolicyAfterApproval,
    }
  })

  return {
    packageCode: 'certificate_local_override_published_seed_authoring_package' as const,
    frontendExposurePolicy: 'backend_admin_api_only' as const,
    runtimeMutationPolicy: 'none_authoring_package_only' as const,
    packageStatus: 'draft_seed_version_ready_for_review' as const,
    sourcePlanCode: approval.planCode,
    sourceSeedVersion: report.seedVersion,
    targetSeedVersion,
    runtimeActivationPolicy: 'manual_seed_version_swap_required' as const,
    previewConsumptionPolicy: 'business_preview_unchanged_until_seed_swap' as const,
    summary: {
      authoredPublishedOverrideCount: publishedOverrideDrafts.length,
      sourceCandidateCount: approval.approvedCandidateCount,
      currentPublishedOverrideCount: report.summary.publishedOverrideCount,
      currentCandidateOverrideCount: report.summary.candidateOverrideCount,
      runtimePreviewChanged: false,
      requiresFinalSeedVersionReview: true,
    },
    approvalRecord: approval,
    publishedOverrideDrafts,
    finalReviewChecklist: [
      'confirm_source_evidence_links_current',
      'confirm_four_certificate_material_depth',
      'confirm_legal_policy_wording',
      'confirm_seed_version_changelog',
      'confirm_manual_runtime_seed_swap_window',
    ],
  }
}
