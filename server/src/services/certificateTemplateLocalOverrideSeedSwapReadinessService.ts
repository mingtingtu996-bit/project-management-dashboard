import {
  buildCertificateLocalOverridePublishedSeedAuthoringPackage,
  type BuildCertificateLocalOverridePublishedSeedAuthoringPackageInput,
} from './certificateTemplateLocalOverridePublishedSeedAuthoringService.js'

export interface BuildCertificateLocalOverrideSeedSwapReadinessPlanInput
  extends BuildCertificateLocalOverridePublishedSeedAuthoringPackageInput {
  requestedBy?: string | null
  requestedWindow?: string | null
}

export interface BuildCertificateLocalOverrideSeedSwapAuditRecordInput
  extends BuildCertificateLocalOverrideSeedSwapReadinessPlanInput {
  executedBy?: string | null
  executionWindow?: string | null
  postSwapPreviewSmokeStatus?: string | null
}

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

function normalizeId(value: unknown) {
  const text = normalizeText(value)
  return text || null
}

const ROLLBACK_TRIGGERS = [
  'preview_contract_regression',
  'published_override_count_mismatch',
  'material_package_depth_regression',
  'source_evidence_missing',
  'manual_admin_rollback',
]

const MONITORING_SIGNALS = [
  'business_preview_seed_version',
  'published_local_override_count',
  'candidate_override_exclusion',
  'material_package_overlay_count',
  'policy_source_evidence_integrity',
]

const EXECUTION_AUDIT_EVIDENCE_CHECKLIST = [
  'manual_seed_version_backup_confirmed',
  'target_seed_version_selected_by_admin',
  'post_swap_preview_smoke_passed',
  'published_override_count_verified',
  'candidate_override_exclusion_verified',
]

export function buildCertificateLocalOverrideSeedSwapReadinessPlan(
  input: BuildCertificateLocalOverrideSeedSwapReadinessPlanInput,
) {
  const authoringPackage = buildCertificateLocalOverridePublishedSeedAuthoringPackage(input)
  const finalReviewChecklistPassedCount = authoringPackage.finalReviewChecklist.length
  const readyForManualSeedSwapReview = authoringPackage.summary.authoredPublishedOverrideCount > 0
    && finalReviewChecklistPassedCount === authoringPackage.finalReviewChecklist.length

  return {
    readinessCode: 'certificate_local_override_manual_seed_swap_readiness_plan' as const,
    frontendExposurePolicy: 'backend_admin_api_only' as const,
    runtimeMutationPolicy: 'none_readiness_plan_only' as const,
    activationMode: 'manual_seed_version_swap_review_request' as const,
    readinessStatus: readyForManualSeedSwapReview
      ? 'ready_for_manual_seed_swap_review' as const
      : 'blocked_before_manual_seed_swap_review' as const,
    sourceSeedVersion: authoringPackage.sourceSeedVersion,
    targetSeedVersion: authoringPackage.targetSeedVersion,
    runtimeActivationPolicy: 'manual_admin_seed_swap_required' as const,
    previewConsumptionPolicy: 'business_preview_unchanged_until_manual_swap' as const,
    summary: {
      authoredPublishedOverrideCount: authoringPackage.summary.authoredPublishedOverrideCount,
      finalReviewChecklistPassedCount,
      rollbackRequired: true,
      monitoringSignalCount: MONITORING_SIGNALS.length,
      runtimePreviewChanged: false,
      currentPublishedOverrideCount: authoringPackage.summary.currentPublishedOverrideCount,
      currentCandidateOverrideCount: authoringPackage.summary.currentCandidateOverrideCount,
    },
    manualSwapPlan: readyForManualSeedSwapReview
      ? {
          status: 'draft_review_required' as const,
          requestedBy: normalizeId(input.requestedBy ?? input.approvedBy),
          requestedWindow: normalizeText(input.requestedWindow) || null,
          requiresBackupBeforeSwap: true,
          requiresPostSwapPreviewSmoke: true,
          rollbackPolicy: 'manual_rollback_to_source_seed_version' as const,
          rollbackTriggers: ROLLBACK_TRIGGERS,
          monitoringSignals: MONITORING_SIGNALS,
        }
      : null,
    authoringPackage,
    blockers: readyForManualSeedSwapReview
      ? []
      : [{
          code: 'published_seed_authoring_package_not_ready',
          severity: 'P0' as const,
          message: 'Manual seed swap readiness requires a reviewed published seed authoring package.',
        }],
  }
}

export function buildCertificateLocalOverrideSeedSwapAuditRecord(
  input: BuildCertificateLocalOverrideSeedSwapAuditRecordInput,
) {
  const readinessPlan = buildCertificateLocalOverrideSeedSwapReadinessPlan(input)
  const preSwapPublishedOverrideCount = readinessPlan.summary.currentPublishedOverrideCount
  const authoredPublishedOverrideCount = readinessPlan.summary.authoredPublishedOverrideCount

  return {
    auditCode: 'certificate_local_override_manual_seed_swap_audit_record' as const,
    frontendExposurePolicy: 'backend_admin_api_only' as const,
    runtimeMutationPolicy: 'none_audit_record_only' as const,
    sourceReadinessCode: readinessPlan.readinessCode,
    executionRecordStatus: 'manual_swap_execution_recorded' as const,
    sourceSeedVersion: readinessPlan.sourceSeedVersion,
    targetSeedVersion: readinessPlan.targetSeedVersion,
    activationEvidencePolicy: 'manual_admin_confirmation_required' as const,
    previewConsumptionPolicy: 'business_preview_changes_only_after_external_seed_swap' as const,
    summary: {
      runtimeSeedMutatedByApi: false,
      authoredPublishedOverrideCount,
      expectedPublishedOverrideCountAfterExternalSwap: preSwapPublishedOverrideCount + authoredPublishedOverrideCount,
      preSwapPublishedOverrideCount,
      candidateOverrideCount: readinessPlan.summary.currentCandidateOverrideCount,
      postSwapPreviewSmokeRequired: readinessPlan.manualSwapPlan?.requiresPostSwapPreviewSmoke === true,
      rollbackPlanAttached: Array.isArray(readinessPlan.manualSwapPlan?.rollbackTriggers)
        && readinessPlan.manualSwapPlan.rollbackTriggers.length > 0,
    },
    executionAudit: {
      executedBy: normalizeId(input.executedBy ?? input.requestedBy ?? input.approvedBy),
      executedAt: new Date().toISOString(),
      executionWindow: normalizeText(input.executionWindow ?? input.requestedWindow) || null,
      postSwapPreviewSmokeStatus: normalizeText(input.postSwapPreviewSmokeStatus) || null,
      rollbackPolicy: readinessPlan.manualSwapPlan?.rollbackPolicy ?? 'manual_rollback_to_source_seed_version',
      auditReason: normalizeText(input.reason) || null,
      evidenceChecklist: EXECUTION_AUDIT_EVIDENCE_CHECKLIST,
    },
    readinessPlan,
  }
}
