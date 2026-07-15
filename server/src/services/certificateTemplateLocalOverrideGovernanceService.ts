import {
  CERTIFICATE_TEMPLATE_LOCAL_OVERRIDE_EXPANSION_BATCHES,
  CERTIFICATE_TEMPLATE_LOCAL_OVERRIDE_QUALITY_GATE,
  GENERAL_CONSTRUCTION_CERTIFICATE_TEMPLATE,
  type CertificateTemplateCityOverride,
  type CertificateTemplateLocalOverrideExpansionBatch,
  type CertificateTemplateLocalOverrideExpansionTarget,
  type CertificateTemplateLocalOverrideQualityGate,
  type CertificateTemplateLocalOverrideSourceEvidence,
  type CertificateTemplateLocalOverrideSourceType,
  type CertificateTemplateSeed,
} from '../seeds/certificateTemplateSeed.js'

export type CertificateLocalOverrideQualityGateStatus =
  | 'ready_for_review'
  | 'missing_required_packages'
  | 'insufficient_material_depth'
  | 'missing_policy_sources'
  | 'weak_policy_sources'
  | 'missing_transfer_land_acquisition_override'

export type CertificateLocalOverridePolicySourceHealthStatus =
  | 'verified_sources_present'
  | 'missing_policy_sources'
  | 'weak_policy_sources'

export interface CertificateLocalOverrideMaterialPackageDepthGap {
  materialPackageCode: string
  addMaterialNameCount: number
  minimumAddMaterialNames: number
}

export type CertificateLocalOverrideGovernanceQualityGate = CertificateTemplateLocalOverrideQualityGate

export interface CertificateLocalOverrideGovernanceEntry {
  overrideCode: string
  provinceCode: string
  cityCode: string
  cityName: string
  overrideScope: CertificateTemplateCityOverride['overrideScope']
  reviewStatus: CertificateTemplateCityOverride['reviewStatus']
  policySourceCount: number
  policySourceHealthStatus: CertificateLocalOverridePolicySourceHealthStatus
  materialPackageOverrideCount: number
  missingRequiredPackageCodes: string[]
  packagesBelowMinimumMaterialNames: CertificateLocalOverrideMaterialPackageDepthGap[]
  hasTransferLandAcquisitionOverride: boolean
  qualityGateStatus: CertificateLocalOverrideQualityGateStatus
  runtimeConsumptionPolicy: 'published_preview_consumed' | 'not_consumed_until_published'
}

export interface CertificateLocalOverrideExpansionCandidate {
  batchCode: string
  provinceCode: string
  cityCode: string
  cityName: string
  overrideScope: CertificateTemplateLocalOverrideExpansionTarget['overrideScope']
  targetCategory: CertificateTemplateLocalOverrideExpansionTarget['targetCategory']
  rolloutPriority: number
  seedAssetStatus: CertificateTemplateLocalOverrideExpansionTarget['seedAssetStatus']
  sourceDiscoveryKeywords: string[]
  localOverrideQualityGateCode: CertificateTemplateLocalOverrideQualityGate['gateCode']
  sourceDiscoveryChecklist: CertificateLocalOverrideSourceDiscoveryChecklistItem[]
  sourceDiscoveryReadinessStatus:
    | 'awaiting_official_source_discovery'
    | 'existing_candidate_needs_source_mapping'
    | 'official_sources_mapped'
  promotionReadiness: CertificateLocalOverridePromotionReadiness
  matchedOverrideCode?: string
  matchedOverrideReviewStatus?: CertificateTemplateCityOverride['reviewStatus']
  nextGovernanceAction: 'none_published' | 'create_candidate_override' | 'govern_existing_candidate_override'
  runtimeConsumptionPolicy: 'published_preview_consumed' | 'not_consumed_until_published'
}

export type CertificateLocalOverrideSourceType = CertificateTemplateLocalOverrideSourceType

export interface CertificateLocalOverrideSourceDiscoveryChecklistItem {
  sourceType: CertificateLocalOverrideSourceType
  required: true
  status: 'pending_source_discovery' | 'pending_source_mapping' | 'mapped_to_governed_source'
  evidence?: CertificateTemplateLocalOverrideSourceEvidence
}

export type CertificateLocalOverridePromotionReadinessStatus =
  | 'blocked_until_candidate_override_created'
  | 'already_published'
  | 'blocked_by_local_override_quality_gate'
  | 'blocked_until_official_source_mapping'
  | 'ready_for_governed_publish_review'

export type CertificateLocalOverridePromotionBlockingCode =
  | 'candidate_override_missing'
  | 'official_source_discovery_required'
  | 'official_source_mapping_incomplete'
  | 'local_override_quality_gate_pending'
  | 'local_override_quality_gate_not_ready'

export interface CertificateLocalOverridePromotionReadiness {
  canEnterPublishReview: boolean
  status: CertificateLocalOverridePromotionReadinessStatus
  nextPromotionAction:
    | 'create_candidate_override'
    | 'none_published'
    | 'complete_local_override_quality_gate'
    | 'map_official_sources'
    | 'submit_for_governed_publish_review'
  blockingCodes: CertificateLocalOverridePromotionBlockingCode[]
  requiredSourceTypeCount: number
  mappedSourceTypeCount: number
  qualityGateStatus?: CertificateLocalOverrideQualityGateStatus
  runtimePreviewGuardrail: 'not_consumed_until_published'
}

export type CertificateLocalOverridePublishApprovalStep =
  | 'official_source_review'
  | 'four_certificate_material_package_review'
  | 'legal_policy_review'
  | 'seed_version_approval'

export interface CertificateLocalOverridePublishReviewCandidate {
  overrideCode: string
  provinceCode: string
  cityCode: string
  cityName: string
  overrideScope: CertificateTemplateCityOverride['overrideScope']
  reviewStatus: 'candidate'
  reviewQueueStatus: 'ready_for_governed_publish_review'
  publishActionPolicy: 'governed_review_required'
  runtimeConsumptionPolicy: 'not_consumed_until_published'
  requiredApprovalSteps: CertificateLocalOverridePublishApprovalStep[]
  sourceEvidenceCount: number
  materialPackageOverrideCount: number
  hasTransferLandAcquisitionOverride: boolean
}

export interface CertificateLocalOverridePublishPromotionPlanCandidate {
  overrideCode: string
  provinceCode: string
  cityCode: string
  cityName: string
  overrideScope: CertificateTemplateCityOverride['overrideScope']
  currentReviewStatus: 'candidate'
  targetReviewStatus: 'published'
  generatedPublishedOverrideCode: string
  requiredApprovalSteps: CertificateLocalOverridePublishApprovalStep[]
  runtimeConsumptionPolicyAfterApproval: 'published_preview_consumed'
}

export interface CertificateLocalOverridePublishPromotionPlan {
  planCode: 'certificate_local_override_governed_publish_promotion_plan'
  frontendExposurePolicy: 'backend_admin_api_only'
  runtimeMutationPolicy: 'none_promotion_plan_only'
  promotionMode: 'candidate_override_to_published_seed_version_review_request'
  summary: {
    readyForPromotionRequest: boolean
    candidateCount: number
    plannedPublishedSeedVersionCount: number
    approvalRequired: true
    runtimePreviewWillRemainPublishedOnlyUntilPromotion: true
  }
  promotionPlan: {
    status: 'draft_review_required'
    approvalRequired: true
    sourceSeedVersion: string
    targetReviewStatus: 'published'
    publishOperationPolicy: 'explicit_seed_version_promotion_only'
    runtimeActivationPolicy: 'published_seed_version_required'
    candidates: CertificateLocalOverridePublishPromotionPlanCandidate[]
  } | null
  blockers: Array<{
    code: string
    severity: 'P0' | 'P1' | 'P2'
    message: string
  }>
}

export interface CertificateLocalOverrideGovernanceReport {
  reportCode: 'certificate_template_local_override_governance'
  seedVersion: string
  frontendExposurePolicy: 'backend_admin_api_only'
  runtimePreviewPolicy: 'business_preview_consumes_published_overrides_only'
  qualityGate: CertificateLocalOverrideGovernanceQualityGate
  summary: {
    totalOverrides: number
    publishedOverrideCount: number
    candidateOverrideCount: number
    readyForReviewCount: number
    blockedByQualityGateCount: number
    localOverrideExpansionBatchCount: number
    localOverrideExpansionTargetCount: number
    existingCandidateOverrideTargetCount: number
    plannedCandidateOverrideTargetCount: number
    localOverrideSourceChecklistItemCount: number
    awaitingOfficialSourceDiscoveryCount: number
    existingCandidateSourceMappingCount: number
    localOverridePromotionReadyCount: number
    localOverridePromotionBlockedByMissingCandidateCount: number
    localOverridePromotionBlockedBySourceMappingCount: number
    localOverridePromotionBlockedByQualityGateCount: number
    localOverrideMappedSourceEvidenceCount: number
    localOverridePublishReviewCandidateCount: number
  }
  scopeCounts: Record<CertificateTemplateCityOverride['overrideScope'], number>
  overrides: CertificateLocalOverrideGovernanceEntry[]
  candidateOverrides: CertificateLocalOverrideGovernanceEntry[]
  localOverrideExpansionBatches: CertificateTemplateLocalOverrideExpansionBatch[]
  localOverrideExpansionCandidates: CertificateLocalOverrideExpansionCandidate[]
  localOverridePublishReviewCandidates: CertificateLocalOverridePublishReviewCandidate[]
  localOverridePublishPromotionPlan: CertificateLocalOverridePublishPromotionPlan
}

export interface BuildCertificateLocalOverrideGovernanceReportOptions {
  template?: CertificateTemplateSeed
}

function buildPackageDepthGaps(override: CertificateTemplateCityOverride): CertificateLocalOverrideMaterialPackageDepthGap[] {
  const packageOverrideByCode = new Map(
    override.materialPackageOverrides.map((item) => [item.materialPackageCode, item]),
  )

  return CERTIFICATE_TEMPLATE_LOCAL_OVERRIDE_QUALITY_GATE.requiredMaterialPackageCodes
    .flatMap((packageCode) => {
      const packageOverride = packageOverrideByCode.get(packageCode)
      if (!packageOverride) return []
      const addMaterialNameCount = packageOverride.addMaterialNames?.filter((name) => name.trim()).length ?? 0
      if (addMaterialNameCount >= CERTIFICATE_TEMPLATE_LOCAL_OVERRIDE_QUALITY_GATE.minimumAddMaterialNamesPerPackage) return []
      return [{
        materialPackageCode: packageCode,
        addMaterialNameCount,
        minimumAddMaterialNames: CERTIFICATE_TEMPLATE_LOCAL_OVERRIDE_QUALITY_GATE.minimumAddMaterialNamesPerPackage,
      }]
    })
}

function resolvePolicySourceHealthStatus(
  override: CertificateTemplateCityOverride,
): CertificateLocalOverridePolicySourceHealthStatus {
  if (override.policySources.length === 0) return 'missing_policy_sources'
  const hasWeakSource = override.policySources.some((source) => !source.sourceUrl?.trim() || source.updateMode !== 'governed_seed_update')
  return hasWeakSource ? 'weak_policy_sources' : 'verified_sources_present'
}

function resolveQualityGateStatus(params: {
  missingRequiredPackageCodes: string[]
  packagesBelowMinimumMaterialNames: CertificateLocalOverrideMaterialPackageDepthGap[]
  policySourceHealthStatus: CertificateLocalOverridePolicySourceHealthStatus
  hasTransferLandAcquisitionOverride: boolean
}): CertificateLocalOverrideQualityGateStatus {
  if (params.missingRequiredPackageCodes.length > 0) return 'missing_required_packages'
  if (params.packagesBelowMinimumMaterialNames.length > 0) return 'insufficient_material_depth'
  if (params.policySourceHealthStatus === 'missing_policy_sources') return 'missing_policy_sources'
  if (params.policySourceHealthStatus === 'weak_policy_sources') return 'weak_policy_sources'
  if (!params.hasTransferLandAcquisitionOverride) return 'missing_transfer_land_acquisition_override'
  return 'ready_for_review'
}

function buildOverrideEntry(override: CertificateTemplateCityOverride): CertificateLocalOverrideGovernanceEntry {
  const packageCodes = new Set(override.materialPackageOverrides.map((item) => item.materialPackageCode))
  const missingRequiredPackageCodes = CERTIFICATE_TEMPLATE_LOCAL_OVERRIDE_QUALITY_GATE.requiredMaterialPackageCodes
    .filter((packageCode) => !packageCodes.has(packageCode))
  const packagesBelowMinimumMaterialNames = buildPackageDepthGaps(override)
  const policySourceHealthStatus = resolvePolicySourceHealthStatus(override)
  const hasTransferLandAcquisitionOverride = override.materialOverrides
    .some((item) => item.landAcquisitionMethodCode === 'transfer')
  const qualityGateStatus = resolveQualityGateStatus({
    missingRequiredPackageCodes,
    packagesBelowMinimumMaterialNames,
    policySourceHealthStatus,
    hasTransferLandAcquisitionOverride,
  })
  return {
    overrideCode: override.overrideCode,
    provinceCode: override.provinceCode,
    cityCode: override.cityCode,
    cityName: override.cityName,
    overrideScope: override.overrideScope,
    reviewStatus: override.reviewStatus,
    policySourceCount: override.policySources.length,
    policySourceHealthStatus,
    materialPackageOverrideCount: override.materialPackageOverrides.length,
    missingRequiredPackageCodes,
    packagesBelowMinimumMaterialNames,
    hasTransferLandAcquisitionOverride,
    qualityGateStatus,
    runtimeConsumptionPolicy: override.reviewStatus === 'published'
      ? 'published_preview_consumed'
      : 'not_consumed_until_published',
  }
}

function matchesExpansionTarget(
  override: CertificateTemplateCityOverride,
  target: CertificateTemplateLocalOverrideExpansionTarget,
) {
  if (override.provinceCode !== target.provinceCode) return false
  if (override.cityCode !== target.cityCode) return false
  return override.overrideScope === target.overrideScope
}

const LOCAL_OVERRIDE_REQUIRED_SOURCE_TYPES: CertificateLocalOverrideSourceType[] = [
  'engineering_approval_portal',
  'planning_natural_resources',
  'housing_construction_permit',
  'land_supply_or_transaction',
]

function buildSourceDiscoveryChecklist(
  status: CertificateLocalOverrideSourceDiscoveryChecklistItem['status'],
  governedSourceTypes: readonly CertificateLocalOverrideSourceType[] = [],
  governedSourceEvidence: readonly CertificateTemplateLocalOverrideSourceEvidence[] = [],
): CertificateLocalOverrideSourceDiscoveryChecklistItem[] {
  const governedSourceTypeSet = new Set(governedSourceTypes)
  const evidenceBySourceType = new Map(governedSourceEvidence.map((source) => [source.sourceType, source]))
  return LOCAL_OVERRIDE_REQUIRED_SOURCE_TYPES.map((sourceType) => ({
    sourceType,
    required: true,
    status: governedSourceTypeSet.has(sourceType) ? 'mapped_to_governed_source' : status,
    ...(governedSourceTypeSet.has(sourceType) && evidenceBySourceType.has(sourceType)
      ? { evidence: evidenceBySourceType.get(sourceType) }
      : {}),
  }))
}

function buildPromotionReadiness(params: {
  matchedOverrideEntry?: CertificateLocalOverrideGovernanceEntry
  sourceDiscoveryChecklist: CertificateLocalOverrideSourceDiscoveryChecklistItem[]
}): CertificateLocalOverridePromotionReadiness {
  const mappedSourceTypeCount = params.sourceDiscoveryChecklist
    .filter((item) => item.status === 'mapped_to_governed_source').length
  const requiredSourceTypeCount = LOCAL_OVERRIDE_REQUIRED_SOURCE_TYPES.length

  if (!params.matchedOverrideEntry) {
    return {
      canEnterPublishReview: false,
      status: 'blocked_until_candidate_override_created',
      nextPromotionAction: 'create_candidate_override',
      blockingCodes: [
        'candidate_override_missing',
        'official_source_discovery_required',
        'local_override_quality_gate_pending',
      ],
      requiredSourceTypeCount,
      mappedSourceTypeCount,
      runtimePreviewGuardrail: 'not_consumed_until_published',
    }
  }

  if (params.matchedOverrideEntry.reviewStatus === 'published') {
    return {
      canEnterPublishReview: false,
      status: 'already_published',
      nextPromotionAction: 'none_published',
      blockingCodes: [],
      requiredSourceTypeCount,
      mappedSourceTypeCount,
      qualityGateStatus: params.matchedOverrideEntry.qualityGateStatus,
      runtimePreviewGuardrail: 'not_consumed_until_published',
    }
  }

  if (params.matchedOverrideEntry.qualityGateStatus !== 'ready_for_review') {
    return {
      canEnterPublishReview: false,
      status: 'blocked_by_local_override_quality_gate',
      nextPromotionAction: 'complete_local_override_quality_gate',
      blockingCodes: ['local_override_quality_gate_not_ready'],
      requiredSourceTypeCount,
      mappedSourceTypeCount,
      qualityGateStatus: params.matchedOverrideEntry.qualityGateStatus,
      runtimePreviewGuardrail: 'not_consumed_until_published',
    }
  }

  if (mappedSourceTypeCount < requiredSourceTypeCount) {
    return {
      canEnterPublishReview: false,
      status: 'blocked_until_official_source_mapping',
      nextPromotionAction: 'map_official_sources',
      blockingCodes: ['official_source_mapping_incomplete'],
      requiredSourceTypeCount,
      mappedSourceTypeCount,
      qualityGateStatus: params.matchedOverrideEntry.qualityGateStatus,
      runtimePreviewGuardrail: 'not_consumed_until_published',
    }
  }

  return {
    canEnterPublishReview: true,
    status: 'ready_for_governed_publish_review',
    nextPromotionAction: 'submit_for_governed_publish_review',
    blockingCodes: [],
    requiredSourceTypeCount,
    mappedSourceTypeCount,
    qualityGateStatus: params.matchedOverrideEntry.qualityGateStatus,
    runtimePreviewGuardrail: 'not_consumed_until_published',
  }
}

function buildExpansionCandidates(
  template: CertificateTemplateSeed,
): CertificateLocalOverrideExpansionCandidate[] {
  return CERTIFICATE_TEMPLATE_LOCAL_OVERRIDE_EXPANSION_BATCHES.flatMap((batch) => (
    batch.targets.map((target) => {
      const matchedOverride = template.cityOverrides.find((override) => matchesExpansionTarget(override, target))
      const matchedOverrideEntry = matchedOverride ? buildOverrideEntry(matchedOverride) : undefined
      const sourceChecklistStatus = matchedOverride ? 'pending_source_mapping' : 'pending_source_discovery'
      const sourceDiscoveryChecklist = buildSourceDiscoveryChecklist(
        sourceChecklistStatus,
        matchedOverride?.governedSourceTypes,
        matchedOverride?.governedSourceEvidence,
      )
      return {
        batchCode: batch.batchCode,
        provinceCode: target.provinceCode,
        cityCode: target.cityCode,
        cityName: target.cityName,
        overrideScope: target.overrideScope,
        targetCategory: target.targetCategory,
        rolloutPriority: target.rolloutPriority,
        seedAssetStatus: target.seedAssetStatus,
        sourceDiscoveryKeywords: target.sourceDiscoveryKeywords,
        localOverrideQualityGateCode: batch.localOverrideQualityGateCode,
        sourceDiscoveryChecklist,
        sourceDiscoveryReadinessStatus: matchedOverride
          ? sourceDiscoveryChecklist.every((item) => item.status === 'mapped_to_governed_source')
            ? 'official_sources_mapped'
            : 'existing_candidate_needs_source_mapping'
          : 'awaiting_official_source_discovery',
        promotionReadiness: buildPromotionReadiness({
          matchedOverrideEntry,
          sourceDiscoveryChecklist,
        }),
        ...(matchedOverride
          ? {
              matchedOverrideCode: matchedOverride.overrideCode,
              matchedOverrideReviewStatus: matchedOverride.reviewStatus,
            }
          : {}),
        nextGovernanceAction: matchedOverride?.reviewStatus === 'published'
          ? 'none_published'
          : matchedOverride
            ? 'govern_existing_candidate_override'
            : 'create_candidate_override',
        runtimeConsumptionPolicy: matchedOverride?.reviewStatus === 'published'
          ? 'published_preview_consumed'
          : 'not_consumed_until_published',
      }
    })
  ))
}

const LOCAL_OVERRIDE_PUBLISH_APPROVAL_STEPS: CertificateLocalOverridePublishApprovalStep[] = [
  'official_source_review',
  'four_certificate_material_package_review',
  'legal_policy_review',
  'seed_version_approval',
]

function buildPublishReviewCandidates(params: {
  overrides: CertificateLocalOverrideGovernanceEntry[]
  localOverrideExpansionCandidates: CertificateLocalOverrideExpansionCandidate[]
}): CertificateLocalOverridePublishReviewCandidate[] {
  const overrideByCode = new Map(params.overrides.map((override) => [override.overrideCode, override]))

  return params.localOverrideExpansionCandidates.flatMap((candidate) => {
    if (candidate.promotionReadiness.status !== 'ready_for_governed_publish_review') return []
    if (!candidate.matchedOverrideCode) return []

    const override = overrideByCode.get(candidate.matchedOverrideCode)
    if (!override || override.reviewStatus !== 'candidate') return []

    return [{
      overrideCode: override.overrideCode,
      provinceCode: override.provinceCode,
      cityCode: override.cityCode,
      cityName: override.cityName,
      overrideScope: override.overrideScope,
      reviewStatus: override.reviewStatus,
      reviewQueueStatus: 'ready_for_governed_publish_review',
      publishActionPolicy: 'governed_review_required',
      runtimeConsumptionPolicy: 'not_consumed_until_published',
      requiredApprovalSteps: LOCAL_OVERRIDE_PUBLISH_APPROVAL_STEPS,
      sourceEvidenceCount: candidate.sourceDiscoveryChecklist.filter((item) => item.evidence).length,
      materialPackageOverrideCount: override.materialPackageOverrideCount,
      hasTransferLandAcquisitionOverride: override.hasTransferLandAcquisitionOverride,
    }]
  })
}

function buildPublishedOverrideCode(candidateOverrideCode: string) {
  return candidateOverrideCode
    .replace(/_candidate(?=_v\d+$)/, '_published')
    .replace(/_candidate$/, '_published')
}

function buildPublishPromotionPlan(params: {
  seedVersion: string
  localOverridePublishReviewCandidates: CertificateLocalOverridePublishReviewCandidate[]
}): CertificateLocalOverridePublishPromotionPlan {
  const candidates = params.localOverridePublishReviewCandidates.map((candidate) => ({
    overrideCode: candidate.overrideCode,
    provinceCode: candidate.provinceCode,
    cityCode: candidate.cityCode,
    cityName: candidate.cityName,
    overrideScope: candidate.overrideScope,
    currentReviewStatus: candidate.reviewStatus,
    targetReviewStatus: 'published' as const,
    generatedPublishedOverrideCode: buildPublishedOverrideCode(candidate.overrideCode),
    requiredApprovalSteps: candidate.requiredApprovalSteps,
    runtimeConsumptionPolicyAfterApproval: 'published_preview_consumed' as const,
  }))
  const readyForPromotionRequest = candidates.length > 0

  return {
    planCode: 'certificate_local_override_governed_publish_promotion_plan',
    frontendExposurePolicy: 'backend_admin_api_only',
    runtimeMutationPolicy: 'none_promotion_plan_only',
    promotionMode: 'candidate_override_to_published_seed_version_review_request',
    summary: {
      readyForPromotionRequest,
      candidateCount: candidates.length,
      plannedPublishedSeedVersionCount: candidates.length,
      approvalRequired: true,
      runtimePreviewWillRemainPublishedOnlyUntilPromotion: true,
    },
    promotionPlan: readyForPromotionRequest
      ? {
          status: 'draft_review_required',
          approvalRequired: true,
          sourceSeedVersion: params.seedVersion,
          targetReviewStatus: 'published',
          publishOperationPolicy: 'explicit_seed_version_promotion_only',
          runtimeActivationPolicy: 'published_seed_version_required',
          candidates,
        }
      : null,
    blockers: readyForPromotionRequest
      ? []
      : [{
          code: 'no_ready_local_override_publish_candidates',
          severity: 'P1',
          message: 'Local override promotion planning requires at least one governed publish review candidate.',
        }],
  }
}

export function buildCertificateLocalOverrideGovernanceReport(
  options: BuildCertificateLocalOverrideGovernanceReportOptions = {},
): CertificateLocalOverrideGovernanceReport {
  const template = options.template ?? GENERAL_CONSTRUCTION_CERTIFICATE_TEMPLATE
  const overrides = template.cityOverrides.map(buildOverrideEntry)
  const localOverrideExpansionCandidates = buildExpansionCandidates(template)
  const localOverridePublishReviewCandidates = buildPublishReviewCandidates({
    overrides,
    localOverrideExpansionCandidates,
  })
  const localOverridePublishPromotionPlan = buildPublishPromotionPlan({
    seedVersion: template.seedVersion,
    localOverridePublishReviewCandidates,
  })
  return {
    reportCode: 'certificate_template_local_override_governance',
    seedVersion: template.seedVersion,
    frontendExposurePolicy: 'backend_admin_api_only',
    runtimePreviewPolicy: 'business_preview_consumes_published_overrides_only',
    qualityGate: CERTIFICATE_TEMPLATE_LOCAL_OVERRIDE_QUALITY_GATE,
    summary: {
      totalOverrides: overrides.length,
      publishedOverrideCount: overrides.filter((override) => override.reviewStatus === 'published').length,
      candidateOverrideCount: overrides.filter((override) => override.reviewStatus === 'candidate').length,
      readyForReviewCount: overrides.filter((override) => override.qualityGateStatus === 'ready_for_review').length,
      blockedByQualityGateCount: overrides.filter((override) => override.qualityGateStatus !== 'ready_for_review').length,
      localOverrideExpansionBatchCount: CERTIFICATE_TEMPLATE_LOCAL_OVERRIDE_EXPANSION_BATCHES.length,
      localOverrideExpansionTargetCount: localOverrideExpansionCandidates.length,
      existingCandidateOverrideTargetCount: localOverrideExpansionCandidates.filter(
        (candidate) => candidate.matchedOverrideReviewStatus === 'candidate',
      ).length,
      plannedCandidateOverrideTargetCount: localOverrideExpansionCandidates.filter(
        (candidate) => !candidate.matchedOverrideCode,
      ).length,
      localOverrideSourceChecklistItemCount: localOverrideExpansionCandidates
        .reduce((sum, candidate) => sum + candidate.sourceDiscoveryChecklist.length, 0),
      awaitingOfficialSourceDiscoveryCount: localOverrideExpansionCandidates.filter(
        (candidate) => candidate.sourceDiscoveryReadinessStatus === 'awaiting_official_source_discovery',
      ).length,
      existingCandidateSourceMappingCount: localOverrideExpansionCandidates.filter(
        (candidate) => candidate.sourceDiscoveryReadinessStatus === 'existing_candidate_needs_source_mapping',
      ).length,
      localOverridePromotionReadyCount: localOverrideExpansionCandidates.filter(
        (candidate) => candidate.promotionReadiness.status === 'ready_for_governed_publish_review',
      ).length,
      localOverridePromotionBlockedByMissingCandidateCount: localOverrideExpansionCandidates.filter(
        (candidate) => candidate.promotionReadiness.status === 'blocked_until_candidate_override_created',
      ).length,
      localOverridePromotionBlockedBySourceMappingCount: localOverrideExpansionCandidates.filter(
        (candidate) => candidate.promotionReadiness.status === 'blocked_until_official_source_mapping',
      ).length,
      localOverridePromotionBlockedByQualityGateCount: localOverrideExpansionCandidates.filter(
        (candidate) => candidate.promotionReadiness.status === 'blocked_by_local_override_quality_gate',
      ).length,
      localOverrideMappedSourceEvidenceCount: localOverrideExpansionCandidates
        .reduce((sum, candidate) => (
          sum + candidate.sourceDiscoveryChecklist.filter((item) => item.evidence).length
        ), 0),
      localOverridePublishReviewCandidateCount: localOverridePublishReviewCandidates.length,
    },
    scopeCounts: {
      city: overrides.filter((override) => override.overrideScope === 'city').length,
    },
    overrides,
    candidateOverrides: overrides.filter((override) => override.reviewStatus === 'candidate'),
    localOverrideExpansionBatches: CERTIFICATE_TEMPLATE_LOCAL_OVERRIDE_EXPANSION_BATCHES,
    localOverrideExpansionCandidates,
    localOverridePublishReviewCandidates,
    localOverridePublishPromotionPlan,
  }
}
