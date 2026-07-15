import { describe, expect, it } from 'vitest'

import { GENERAL_CONSTRUCTION_CERTIFICATE_TEMPLATE } from '../seeds/certificateTemplateSeed.js'
import { buildCertificateLocalOverrideGovernanceReport } from '../services/certificateTemplateLocalOverrideGovernanceService.js'

describe('certificate template local override governance', () => {
  it('summarizes published city overrides after first-batch local publication', () => {
    const report = buildCertificateLocalOverrideGovernanceReport({
      template: GENERAL_CONSTRUCTION_CERTIFICATE_TEMPLATE,
    })

    expect(report.reportCode).toBe('certificate_template_local_override_governance')
    expect(report.frontendExposurePolicy).toBe('backend_admin_api_only')
    expect(report.runtimePreviewPolicy).toBe('business_preview_consumes_published_overrides_only')
    expect(report.summary.totalOverrides).toBeGreaterThanOrEqual(26)
    expect(report.summary.publishedOverrideCount).toBe(50)
    expect(report.summary.candidateOverrideCount).toBe(0)
    expect(report.scopeCounts).toEqual({ city: 50 })
    expect(report.candidateOverrides).toEqual([])
    expect(report.overrides.map((override) => override.overrideCode)).toEqual(
      expect.arrayContaining([
        'city_override_shanghai_shanghai_v14222',
        'city_override_zhejiang_hangzhou_v14222',
        'city_override_beijing_beijing_v14222',
        'city_override_guangdong_guangzhou_v14222',
        'city_override_jiangsu_nanjing_v14222',
        'city_override_sichuan_chengdu_v14222',
        'city_override_hubei_wuhan_v14222',
        'city_override_shaanxi_xian_v14222',
        'city_override_henan_zhengzhou_v14222',
        'city_override_hunan_changsha_v14222',
        'city_override_shandong_jinan_v14222',
        'city_override_fujian_fuzhou_v14222',
        'city_override_liaoning_shenyang_v14222',
        'city_override_liaoning_dalian_v14222',
        'city_override_yunnan_kunming_v14222',
        'city_override_jiangxi_nanchang_v14222',
      ]),
    )
    expect(report.overrides.every((override) => override.runtimeConsumptionPolicy === 'published_preview_consumed')).toBe(true)
  })

  it('reports local override governance as city-only after zone rules are cleaned up', () => {
    const report = buildCertificateLocalOverrideGovernanceReport({
      template: GENERAL_CONSTRUCTION_CERTIFICATE_TEMPLATE,
    })

    expect(report.scopeCounts).toEqual({
      city: report.summary.totalOverrides,
    })
    expect(report.overrides.every((override) => override.overrideScope === 'city')).toBe(true)
    expect(report.overrides.every((override) => !(override as any).zoneCode && !(override as any).zoneName)).toBe(true)
    expect(report.localOverrideExpansionCandidates.every((candidate) => candidate.overrideScope === 'city')).toBe(true)
    expect(report.localOverrideExpansionCandidates.every((candidate) => !(candidate as any).zoneCode && !(candidate as any).zoneName)).toBe(true)
    expect(report.overrides.map((override) => override.overrideCode).join(' ')).not.toMatch(/park_override|district_override/)
  })

  it('exposes local override expansion batches as backend governance assets only', () => {
    const report = buildCertificateLocalOverrideGovernanceReport({
      template: GENERAL_CONSTRUCTION_CERTIFICATE_TEMPLATE,
    })

    expect(report.summary.localOverrideExpansionBatchCount).toBeGreaterThanOrEqual(1)
    expect(report.localOverrideExpansionBatches[0]).toMatchObject({
      batchCode: 'local_override_high_value_city_batch_1',
      targetOverrideStatus: 'published',
      localOverrideQualityGateCode: report.qualityGate.gateCode,
      runtimePreviewPolicy: 'published_override_only',
    })
    expect(report.localOverrideExpansionBatches[0].targets.every((target) => target.seedAssetStatus === 'published_seed_asset')).toBe(true)
    expect(report.localOverrideExpansionBatches[0].targets.map((target) => target.cityCode)).toEqual(
      expect.arrayContaining(['beijing', 'guangzhou', 'nanjing', 'chengdu', 'wuhan', 'xian']),
    )
  })

  it('flattens local override expansion targets as published seed assets after direct city publication', () => {
    const report = buildCertificateLocalOverrideGovernanceReport({
      template: GENERAL_CONSTRUCTION_CERTIFICATE_TEMPLATE,
    })

    expect(report.summary.localOverrideExpansionTargetCount).toBe(8)
    expect(report.summary.existingCandidateOverrideTargetCount).toBe(0)
    expect(report.summary.plannedCandidateOverrideTargetCount).toBe(0)
    expect(report.localOverrideExpansionCandidates).toHaveLength(8)
    expect(report.localOverrideExpansionCandidates.every((candidate) => candidate.localOverrideQualityGateCode === report.qualityGate.gateCode)).toBe(true)

    const shanghai = report.localOverrideExpansionCandidates.find((candidate) => candidate.cityCode === 'shanghai')
    expect(shanghai).toMatchObject({
      batchCode: 'local_override_high_value_city_batch_1',
      provinceCode: 'shanghai',
      cityCode: 'shanghai',
      seedAssetStatus: 'published_seed_asset',
      matchedOverrideCode: 'city_override_shanghai_shanghai_v14222',
      matchedOverrideReviewStatus: 'published',
      nextGovernanceAction: 'none_published',
      runtimeConsumptionPolicy: 'published_preview_consumed',
    })

    const beijing = report.localOverrideExpansionCandidates.find((candidate) => candidate.cityCode === 'beijing')
    expect(beijing).toMatchObject({
      provinceCode: 'beijing',
      cityCode: 'beijing',
      seedAssetStatus: 'published_seed_asset',
      matchedOverrideCode: 'city_override_beijing_beijing_v14222',
      matchedOverrideReviewStatus: 'published',
      nextGovernanceAction: 'none_published',
      runtimeConsumptionPolicy: 'published_preview_consumed',
    })
    expect(beijing?.sourceDiscoveryKeywords.length).toBeGreaterThanOrEqual(2)

    const guangzhou = report.localOverrideExpansionCandidates.find((candidate) => candidate.cityCode === 'guangzhou')
    expect(guangzhou).toMatchObject({
      provinceCode: 'guangdong',
      cityCode: 'guangzhou',
      seedAssetStatus: 'published_seed_asset',
      matchedOverrideCode: 'city_override_guangdong_guangzhou_v14222',
      matchedOverrideReviewStatus: 'published',
      nextGovernanceAction: 'none_published',
      runtimeConsumptionPolicy: 'published_preview_consumed',
    })

    const nanjing = report.localOverrideExpansionCandidates.find((candidate) => candidate.cityCode === 'nanjing')
    expect(nanjing).toMatchObject({
      provinceCode: 'jiangsu',
      cityCode: 'nanjing',
      seedAssetStatus: 'published_seed_asset',
      matchedOverrideCode: 'city_override_jiangsu_nanjing_v14222',
      matchedOverrideReviewStatus: 'published',
      nextGovernanceAction: 'none_published',
      runtimeConsumptionPolicy: 'published_preview_consumed',
    })

    const chengdu = report.localOverrideExpansionCandidates.find((candidate) => candidate.cityCode === 'chengdu')
    expect(chengdu).toMatchObject({
      provinceCode: 'sichuan',
      cityCode: 'chengdu',
      seedAssetStatus: 'published_seed_asset',
      matchedOverrideCode: 'city_override_sichuan_chengdu_v14222',
      matchedOverrideReviewStatus: 'published',
      nextGovernanceAction: 'none_published',
      runtimeConsumptionPolicy: 'published_preview_consumed',
    })

    const wuhan = report.localOverrideExpansionCandidates.find((candidate) => candidate.cityCode === 'wuhan')
    expect(wuhan).toMatchObject({
      provinceCode: 'hubei',
      cityCode: 'wuhan',
      seedAssetStatus: 'published_seed_asset',
      matchedOverrideCode: 'city_override_hubei_wuhan_v14222',
      matchedOverrideReviewStatus: 'published',
      nextGovernanceAction: 'none_published',
      runtimeConsumptionPolicy: 'published_preview_consumed',
    })

    const xian = report.localOverrideExpansionCandidates.find((candidate) => candidate.cityCode === 'xian')
    expect(xian).toMatchObject({
      provinceCode: 'shaanxi',
      cityCode: 'xian',
      seedAssetStatus: 'published_seed_asset',
      matchedOverrideCode: 'city_override_shaanxi_xian_v14222',
      matchedOverrideReviewStatus: 'published',
      nextGovernanceAction: 'none_published',
      runtimeConsumptionPolicy: 'published_preview_consumed',
    })
  })

  it('requires official source discovery checklists before local override candidate promotion', () => {
    const report = buildCertificateLocalOverrideGovernanceReport({
      template: GENERAL_CONSTRUCTION_CERTIFICATE_TEMPLATE,
    })

    const requiredSourceTypes = [
      'engineering_approval_portal',
      'planning_natural_resources',
      'housing_construction_permit',
      'land_supply_or_transaction',
    ]

    expect(report.summary.localOverrideSourceChecklistItemCount).toBe(32)
    expect(report.summary.awaitingOfficialSourceDiscoveryCount).toBe(0)
    expect(report.summary.existingCandidateSourceMappingCount).toBe(0)

    for (const candidate of report.localOverrideExpansionCandidates) {
      expect(candidate.sourceDiscoveryChecklist.map((item) => item.sourceType), candidate.cityCode).toEqual(requiredSourceTypes)
      expect(candidate.sourceDiscoveryChecklist.every((item) => item.required), candidate.cityCode).toBe(true)
    }

    const shanghai = report.localOverrideExpansionCandidates.find((candidate) => candidate.cityCode === 'shanghai')
    expect(shanghai).toMatchObject({
      sourceDiscoveryReadinessStatus: 'official_sources_mapped',
    })
    expect(shanghai?.sourceDiscoveryChecklist.every((item) => item.status === 'mapped_to_governed_source')).toBe(true)

    const hangzhou = report.localOverrideExpansionCandidates.find((candidate) => candidate.cityCode === 'hangzhou')
    expect(hangzhou).toMatchObject({
      sourceDiscoveryReadinessStatus: 'official_sources_mapped',
    })
    expect(hangzhou?.sourceDiscoveryChecklist.every((item) => item.status === 'mapped_to_governed_source')).toBe(true)

    const beijing = report.localOverrideExpansionCandidates.find((candidate) => candidate.cityCode === 'beijing')
    expect(beijing).toMatchObject({
      sourceDiscoveryReadinessStatus: 'official_sources_mapped',
    })
    expect(beijing?.sourceDiscoveryChecklist.every((item) => item.status === 'mapped_to_governed_source')).toBe(true)
    expect(beijing?.sourceDiscoveryChecklist.every((item) => item.evidence?.sourceUrl)).toBe(true)

    const guangzhou = report.localOverrideExpansionCandidates.find((candidate) => candidate.cityCode === 'guangzhou')
    expect(guangzhou).toMatchObject({
      sourceDiscoveryReadinessStatus: 'official_sources_mapped',
    })
    expect(guangzhou?.sourceDiscoveryChecklist.every((item) => item.status === 'mapped_to_governed_source')).toBe(true)
    expect(guangzhou?.sourceDiscoveryChecklist.every((item) => item.evidence?.sourceUrl)).toBe(true)

    const nanjing = report.localOverrideExpansionCandidates.find((candidate) => candidate.cityCode === 'nanjing')
    expect(nanjing).toMatchObject({
      sourceDiscoveryReadinessStatus: 'official_sources_mapped',
    })
    expect(nanjing?.sourceDiscoveryChecklist.every((item) => item.status === 'mapped_to_governed_source')).toBe(true)
    expect(nanjing?.sourceDiscoveryChecklist.every((item) => item.evidence?.sourceUrl)).toBe(true)

    for (const cityCode of ['chengdu', 'wuhan', 'xian']) {
      const candidate = report.localOverrideExpansionCandidates.find((item) => item.cityCode === cityCode)
      expect(candidate).toMatchObject({
        sourceDiscoveryReadinessStatus: 'official_sources_mapped',
      })
      expect(candidate?.sourceDiscoveryChecklist.every((item) => item.status === 'mapped_to_governed_source'), cityCode).toBe(true)
      expect(candidate?.sourceDiscoveryChecklist.every((item) => item.evidence?.sourceUrl), cityCode).toBe(true)
    }
  })

  it('marks mapped first-batch local override targets as already published instead of entering publish review', () => {
    const report = buildCertificateLocalOverrideGovernanceReport({
      template: GENERAL_CONSTRUCTION_CERTIFICATE_TEMPLATE,
    })

    expect(report.summary.localOverridePromotionReadyCount).toBe(0)
    expect(report.summary.localOverridePromotionBlockedByMissingCandidateCount).toBe(0)
    expect(report.summary.localOverridePromotionBlockedBySourceMappingCount).toBe(0)
    expect(report.summary.localOverridePromotionBlockedByQualityGateCount).toBe(0)
    expect(report.summary.localOverrideMappedSourceEvidenceCount).toBe(32)

    const shanghai = report.localOverrideExpansionCandidates.find((candidate) => candidate.cityCode === 'shanghai')
    expect(shanghai?.promotionReadiness).toMatchObject({
      canEnterPublishReview: false,
      status: 'already_published',
      nextPromotionAction: 'none_published',
      qualityGateStatus: 'ready_for_review',
      requiredSourceTypeCount: 4,
      mappedSourceTypeCount: 4,
      runtimePreviewGuardrail: 'not_consumed_until_published',
      blockingCodes: [],
    })
    expect(shanghai?.promotionReadiness.canEnterPublishReview).toBe(false)
    expect(shanghai?.sourceDiscoveryChecklist.every((item) => item.status === 'mapped_to_governed_source')).toBe(true)
    expect(shanghai?.sourceDiscoveryChecklist.every((item) => item.evidence?.sourceUrl)).toBe(true)

    const hangzhou = report.localOverrideExpansionCandidates.find((candidate) => candidate.cityCode === 'hangzhou')
    expect(hangzhou?.promotionReadiness).toMatchObject({
      canEnterPublishReview: false,
      status: 'already_published',
      nextPromotionAction: 'none_published',
      qualityGateStatus: 'ready_for_review',
      requiredSourceTypeCount: 4,
      mappedSourceTypeCount: 4,
      runtimePreviewGuardrail: 'not_consumed_until_published',
      blockingCodes: [],
    })
    expect(hangzhou?.promotionReadiness.canEnterPublishReview).toBe(false)
    expect(hangzhou?.sourceDiscoveryChecklist.every((item) => item.status === 'mapped_to_governed_source')).toBe(true)
    expect(hangzhou?.sourceDiscoveryChecklist.every((item) => item.evidence?.sourceUrl)).toBe(true)

    const beijing = report.localOverrideExpansionCandidates.find((candidate) => candidate.cityCode === 'beijing')
    expect(beijing?.promotionReadiness).toMatchObject({
      canEnterPublishReview: false,
      status: 'already_published',
      nextPromotionAction: 'none_published',
      qualityGateStatus: 'ready_for_review',
      requiredSourceTypeCount: 4,
      mappedSourceTypeCount: 4,
      runtimePreviewGuardrail: 'not_consumed_until_published',
      blockingCodes: [],
    })
    expect(beijing?.promotionReadiness.canEnterPublishReview).toBe(false)
    expect(beijing?.sourceDiscoveryChecklist.every((item) => item.status === 'mapped_to_governed_source')).toBe(true)
    expect(beijing?.sourceDiscoveryChecklist.every((item) => item.evidence?.sourceUrl)).toBe(true)

    const guangzhou = report.localOverrideExpansionCandidates.find((candidate) => candidate.cityCode === 'guangzhou')
    expect(guangzhou?.promotionReadiness).toMatchObject({
      canEnterPublishReview: false,
      status: 'already_published',
      nextPromotionAction: 'none_published',
      qualityGateStatus: 'ready_for_review',
      requiredSourceTypeCount: 4,
      mappedSourceTypeCount: 4,
      runtimePreviewGuardrail: 'not_consumed_until_published',
      blockingCodes: [],
    })
    expect(guangzhou?.promotionReadiness.canEnterPublishReview).toBe(false)
    expect(guangzhou?.sourceDiscoveryChecklist.every((item) => item.status === 'mapped_to_governed_source')).toBe(true)
    expect(guangzhou?.sourceDiscoveryChecklist.every((item) => item.evidence?.sourceUrl)).toBe(true)

    const nanjing = report.localOverrideExpansionCandidates.find((candidate) => candidate.cityCode === 'nanjing')
    expect(nanjing?.promotionReadiness).toMatchObject({
      canEnterPublishReview: false,
      status: 'already_published',
      nextPromotionAction: 'none_published',
      qualityGateStatus: 'ready_for_review',
      requiredSourceTypeCount: 4,
      mappedSourceTypeCount: 4,
      runtimePreviewGuardrail: 'not_consumed_until_published',
      blockingCodes: [],
    })
    expect(nanjing?.promotionReadiness.canEnterPublishReview).toBe(false)
    expect(nanjing?.sourceDiscoveryChecklist.every((item) => item.status === 'mapped_to_governed_source')).toBe(true)
    expect(nanjing?.sourceDiscoveryChecklist.every((item) => item.evidence?.sourceUrl)).toBe(true)

    for (const cityCode of ['chengdu', 'wuhan', 'xian']) {
      const candidate = report.localOverrideExpansionCandidates.find((item) => item.cityCode === cityCode)
      expect(candidate?.promotionReadiness).toMatchObject({
        canEnterPublishReview: false,
        status: 'already_published',
        nextPromotionAction: 'none_published',
        qualityGateStatus: 'ready_for_review',
        requiredSourceTypeCount: 4,
        mappedSourceTypeCount: 4,
        runtimePreviewGuardrail: 'not_consumed_until_published',
        blockingCodes: [],
      })
      expect(candidate?.sourceDiscoveryChecklist.every((item) => item.status === 'mapped_to_governed_source'), cityCode).toBe(true)
      expect(candidate?.sourceDiscoveryChecklist.every((item) => item.evidence?.sourceUrl), cityCode).toBe(true)
    }
  })

  it('keeps the governed publish review queue empty after first-batch rules are published', () => {
    const report = buildCertificateLocalOverrideGovernanceReport({
      template: GENERAL_CONSTRUCTION_CERTIFICATE_TEMPLATE,
    })

    expect(report.summary.localOverridePublishReviewCandidateCount).toBe(0)
    expect(report.localOverridePublishReviewCandidates).toEqual([])
  })

  it('blocks promotion planning when no first-batch candidate remains', () => {
    const report = buildCertificateLocalOverrideGovernanceReport({
      template: GENERAL_CONSTRUCTION_CERTIFICATE_TEMPLATE,
    })

    expect(report.localOverridePublishPromotionPlan).toMatchObject({
      planCode: 'certificate_local_override_governed_publish_promotion_plan',
      frontendExposurePolicy: 'backend_admin_api_only',
      runtimeMutationPolicy: 'none_promotion_plan_only',
      promotionMode: 'candidate_override_to_published_seed_version_review_request',
    })
    expect(report.localOverridePublishPromotionPlan.summary).toMatchObject({
      readyForPromotionRequest: false,
      candidateCount: 0,
      plannedPublishedSeedVersionCount: 0,
      approvalRequired: true,
      runtimePreviewWillRemainPublishedOnlyUntilPromotion: true,
    })
    expect(report.localOverridePublishPromotionPlan.promotionPlan).toBeNull()
    expect(report.localOverridePublishPromotionPlan.blockers).toEqual([
      expect.objectContaining({ code: 'no_ready_local_override_publish_candidates' }),
    ])
    expect(report.summary.publishedOverrideCount).toBe(50)
    expect(report.candidateOverrides).toHaveLength(0)
  })

  it('keeps an existing Hangzhou city override out of governed publish review after source mapping is complete', () => {
    const report = buildCertificateLocalOverrideGovernanceReport({
      template: GENERAL_CONSTRUCTION_CERTIFICATE_TEMPLATE,
    })

    const hangzhou = report.localOverrideExpansionCandidates.find((candidate) => candidate.cityCode === 'hangzhou')
    expect(hangzhou?.sourceDiscoveryChecklist.every((item) => item.status === 'mapped_to_governed_source')).toBe(true)
    expect(hangzhou?.sourceDiscoveryChecklist.every((item) => item.evidence?.sourceUrl)).toBe(true)
    expect(report.summary.localOverrideMappedSourceEvidenceCount).toBe(32)
    expect(hangzhou?.promotionReadiness).toMatchObject({
      canEnterPublishReview: false,
      status: 'already_published',
      nextPromotionAction: 'none_published',
      blockingCodes: [],
      requiredSourceTypeCount: 4,
      mappedSourceTypeCount: 4,
      qualityGateStatus: 'ready_for_review',
      runtimePreviewGuardrail: 'not_consumed_until_published',
    })
    expect(report.summary.localOverridePromotionReadyCount).toBe(0)
    expect(report.summary.localOverridePromotionBlockedBySourceMappingCount).toBe(0)
  })

  it('enforces four-certificate package coverage for override publication readiness', () => {
    const report = buildCertificateLocalOverrideGovernanceReport({
      template: GENERAL_CONSTRUCTION_CERTIFICATE_TEMPLATE,
    })

    expect(report.qualityGate.gateCode).toBe('local_override_four_certificate_material_depth')
    expect(report.qualityGate.requiredMaterialPackageCodes).toEqual([
      'PKG-CERT-LAND-COMMON',
      'PKG-CERT-LUP-COMMON',
      'PKG-CERT-EPP-COMMON',
      'PKG-CERT-CP-COMMON',
    ])
    expect(report.overrides.every((override) => override.qualityGateStatus === 'ready_for_review')).toBe(true)
    expect(report.overrides.every((override) => override.missingRequiredPackageCodes.length === 0)).toBe(true)
  })

  it('requires published local overrides to pass material depth source and transfer gates', () => {
    const report = buildCertificateLocalOverrideGovernanceReport({
      template: GENERAL_CONSTRUCTION_CERTIFICATE_TEMPLATE,
    })

    const publishedOverrides = report.overrides.filter((override) => override.reviewStatus === 'published')

    expect(publishedOverrides.map((override) => override.overrideCode)).toEqual(
      expect.arrayContaining([
        'city_override_guangdong_shenzhen_v14222',
        'city_override_jiangsu_suzhou_v14222',
      ]),
    )

    for (const override of publishedOverrides as any[]) {
      expect(override.runtimeConsumptionPolicy, override.overrideCode).toBe('published_preview_consumed')
      expect(override.qualityGateStatus, override.overrideCode).toBe('ready_for_review')
      expect(override.missingRequiredPackageCodes, override.overrideCode).toEqual([])
      expect(override.packagesBelowMinimumMaterialNames, override.overrideCode).toEqual([])
      expect(override.hasTransferLandAcquisitionOverride, override.overrideCode).toBe(true)
      expect(override.policySourceHealthStatus, override.overrideCode).toBe('verified_sources_present')
      expect(override.policySourceCount, override.overrideCode).toBeGreaterThan(0)
    }
  })
})
