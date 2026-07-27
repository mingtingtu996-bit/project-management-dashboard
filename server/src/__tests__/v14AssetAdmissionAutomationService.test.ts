import { describe, expect, it } from 'vitest'

import {
  collectV14AutoDiscoveredAssets,
  evaluateV14AssetAdmissionAutomation,
  evaluateV14AssetAdmissionAutomationForTypes,
} from '../services/v14AssetAdmissionAutomationService.js'

describe('v1.4 automated asset admission', () => {
  it('auto-discovers and registers current rule, data-quality, and metric assets without requiring manual hand registration first', () => {
    const report = collectV14AutoDiscoveredAssets()
    const byKey = new Map(report.assets.map((asset) => [asset.assetKey, asset]))

    expect(byKey.get('acceptanceTimelineTemplateSeed')).toEqual(expect.objectContaining({
      assetType: 'rule_seed_asset',
      discoveryStatus: 'registered',
    }))
    expect(byKey.get('durationContextPolicyLearningService')).toEqual(expect.objectContaining({
      assetType: 'algorithm_policy_asset',
      discoveryStatus: 'registered',
    }))
    expect(byKey.get('metricRegistryService')).toEqual(expect.objectContaining({
      assetType: 'metric_admission_asset',
      discoveryStatus: 'registered',
    }))
    expect(byKey.get('dataQualityRuleRegistry')).toEqual(expect.objectContaining({
      assetType: 'data_admission_asset',
      discoveryStatus: 'registered',
    }))
  })

  it('keeps the current full-repo v1.4.22 phase 1-3 scan registered after auto catalog intake', () => {
    const report = evaluateV14AssetAdmissionAutomation()
    const byKey = new Map(report.assets.map((asset) => [asset.assetKey, asset]))

    expect(report.status).toBe('pass')
    expect(report.summary.autoDiscoveredCount).toBe(0)
    expect(report.summary.handRegistrationMissingCount).toBe(0)
    expect(report.blockers).toEqual([])
    expect(report.reviewItems).toEqual([])
    expect(byKey.get('algorithmAssetGovernanceProtocolService')).toEqual(expect.objectContaining({
      assetType: 'governance_support_asset',
      discoveryStatus: 'registered',
      governanceStatus: 'confirmed',
      sourcePath: 'server/src/services/algorithmAssetGovernanceProtocolService.ts',
    }))
    expect(byKey.get('algorithmAssetCandidateEventAdapterService')).toEqual(expect.objectContaining({
      assetType: 'governance_support_asset',
      discoveryStatus: 'registered',
      governanceStatus: 'confirmed',
      sourcePath: 'server/src/services/algorithmAssetCandidateEventAdapterService.ts',
    }))
    expect(byKey.get('algorithmAssetSampleHealthService')).toEqual(expect.objectContaining({
      discoveryStatus: 'registered',
      governanceStatus: 'confirmed',
      sourcePath: 'server/src/services/algorithmAssetSampleHealthService.ts',
    }))
    expect(byKey.get('algorithmAssetLearnableParameterRegistryService')).toEqual(expect.objectContaining({
      discoveryStatus: 'registered',
      governanceStatus: 'confirmed',
      sourcePath: 'server/src/services/algorithmAssetLearnableParameterRegistryService.ts',
    }))
    expect(byKey.get('algorithmAssetColdStartBaselineService')).toEqual(expect.objectContaining({
      assetType: 'governance_support_asset',
      discoveryStatus: 'registered',
      governanceStatus: 'confirmed',
      sourcePath: 'server/src/services/algorithmAssetColdStartBaselineService.ts',
    }))
    expect(byKey.get('algorithmAssetForecastResidualOverlayService')).toEqual(expect.objectContaining({
      assetType: 'algorithm_policy_asset',
      discoveryStatus: 'registered',
      governanceStatus: 'confirmed',
      sourcePath: 'server/src/services/algorithmAssetForecastResidualOverlayService.ts',
    }))
    expect(byKey.get('wbsTemplateRecommendationAccuracyMatrixService')).toEqual(expect.objectContaining({
      assetType: 'governance_support_asset',
      discoveryStatus: 'registered',
      governanceStatus: 'confirmed',
      sourcePath: 'server/src/services/wbsTemplateRecommendationAccuracyMatrixService.ts',
    }))
    expect(report.boundaryPolicy).toEqual(expect.arrayContaining([
      'auto_discovery_is_the_default_for_new_v14_assets',
      'manual_registry_is_confirmation_not_the_first_line_of_defense',
      'only_high_risk_unclassified_runtime_assets_block_ci',
      'publish_anchor_and_automation_maturity_are_required_before_runtime_publish',
      'llm_and_manual_anchor_assets_default_to_candidate_or_review',
    ]))
  })

  it('can project the same automated admission report to data and metric admission scopes', () => {
    const dataReport = evaluateV14AssetAdmissionAutomationForTypes(['data_admission_asset'])
    const metricReport = evaluateV14AssetAdmissionAutomationForTypes(['metric_admission_asset'])

    expect(dataReport.assets.every((asset) => asset.assetType === 'data_admission_asset')).toBe(true)
    expect(metricReport.assets.every((asset) => asset.assetType === 'metric_admission_asset')).toBe(true)
    expect(dataReport.summary.handRegistrationMissingCount).toBe(0)
    expect(metricReport.summary.handRegistrationMissingCount).toBe(0)
    expect(metricReport.assets.map((asset) => asset.assetKey)).toContain('metricRegistryService')
    expect(dataReport.assets.map((asset) => asset.assetKey)).toContain('dataQualityRuleRegistry')
  })

  it('reports duration relevance and conservative governance defaults for every discovered asset', () => {
    const report = evaluateV14AssetAdmissionAutomation()
    const byKey = new Map(report.assets.map((asset) => [asset.assetKey, asset]))

    expect(report.assets.every((asset) => typeof asset.durationRelated === 'boolean')).toBe(true)
    expect(report.assets.every((asset) => asset.learningTarget)).toBe(true)
    expect(report.assets.every((asset) => asset.learningMaturity)).toBe(true)
    expect(report.assets.every((asset) => asset.publishAnchor)).toBe(true)
    expect(report.assets.every((asset) => asset.automationMaturity)).toBe(true)
    expect(report.assets.every((asset) => asset.governanceDefaultsEvidence.length > 0)).toBe(true)

    expect(byKey.get('algorithmAssetLearnableParameterRuntimeConsumptionService')).toEqual(expect.objectContaining({
      durationRelated: true,
      learningTarget: 'context_factor',
      learningMaturity: 'guarded_live_tuning',
      publishAnchor: 'guarded_runtime_auto_publish',
      automationMaturity: 'auto_canary',
      governanceDefaultsEvidence: expect.arrayContaining([
        'matched_algorithm_rule_asset_inventory_governance_fields',
      ]),
    }))

    expect(byKey.get('durationContextPolicyLearningService')).toEqual(expect.objectContaining({
      durationRelated: true,
      learningTarget: 'context_factor',
      learningMaturity: 'shadow_report_only',
      publishAnchor: 'candidate_only',
      automationMaturity: 'auto_shadow',
      governanceDefaultsEvidence: expect.arrayContaining([
        'matched_algorithm_rule_asset_inventory_governance_fields',
      ]),
    }))

    expect(byKey.get('algorithmAssetForecastResidualOverlayService')).toEqual(expect.objectContaining({
      durationRelated: true,
      learningTarget: 'forecast_residual',
      learningMaturity: 'shadow_report_only',
      publishAnchor: 'candidate_only',
      automationMaturity: 'auto_shadow',
      governanceDefaultsEvidence: expect.arrayContaining([
        'matched_algorithm_rule_asset_inventory_governance_fields',
      ]),
    }))

    expect(byKey.get('metricRegistryService')).toEqual(expect.objectContaining({
      durationRelated: false,
      learningTarget: 'metric_caliber',
      learningMaturity: 'frozen_constant',
      publishAnchor: 'manual_governance_required',
      automationMaturity: 'manual_required',
      governanceDefaultsEvidence: expect.arrayContaining([
        'matched_algorithm_rule_asset_inventory_governance_fields',
      ]),
    }))
  })

  it('summarizes duration coverage and assets that still rely on conservative governance defaults', () => {
    const report = evaluateV14AssetAdmissionAutomation()
    const conservativeDefaultAssets = report.assets.filter((asset) => (
      asset.governanceDefaultsEvidence.includes('missing_inventory_governance_field_defaults_to_candidate_or_shadow')
    ))
    const durationRelatedAssets = report.assets.filter((asset) => asset.durationRelated)

    expect(report.summary.durationRelatedAssetCount).toBe(durationRelatedAssets.length)
    expect(report.summary.durationRelatedCoverageRatio).toBe(Number((durationRelatedAssets.length / report.assets.length).toFixed(4)))
    expect(conservativeDefaultAssets).toEqual([])
    expect(report.summary.conservativeGovernanceDefaultCount).toBe(0)
    expect(report.summary.explicitGovernanceFieldCount).toBe(report.assets.length)
    expect(report.governanceDefaultReviewItems).toEqual([])
    expect(report.governanceDefaultReviewItems.map((asset) => asset.assetKey)).not.toContain(
      'durationContextPolicyLearningService',
    )
    expect(report.governanceDefaultReviewItems.map((asset) => asset.assetKey)).not.toContain(
      'metricRegistryService',
    )
    expect(report.governanceDefaultReviewItems.map((asset) => asset.assetKey)).not.toContain(
      'algorithmAssetLearnableParameterRuntimeConsumptionService',
    )
    expect(report.boundaryPolicy).toEqual(expect.arrayContaining([
      'duration_related_coverage_is_reported_without_publish_rights',
      'conservative_governance_defaults_require_explicit_follow_up_before_runtime_publish',
    ]))
  })

  it('classifies lineage services as data-admission assets so new data objects do not rely on manual registration', () => {
    const dataReport = evaluateV14AssetAdmissionAutomationForTypes(['data_admission_asset'])
    const dataAssetKeys = dataReport.assets.map((asset) => asset.assetKey)

    expect(dataAssetKeys).toEqual(expect.arrayContaining([
      'dataLineageService',
      'dataLineageGovernanceService',
    ]))
    expect(dataReport.assets.find((asset) => asset.assetKey === 'dataLineageService')).toEqual(expect.objectContaining({
      discoveryStatus: 'registered',
      scopePolicy: 'company_or_project_scoped',
    }))
  })

  it('classifies summary snapshot and trend services as metric-admission assets so new indicators enter the same gate', () => {
    const metricReport = evaluateV14AssetAdmissionAutomationForTypes(['metric_admission_asset'])
    const metricAssetKeys = metricReport.assets.map((asset) => asset.assetKey)

    expect(metricAssetKeys).toEqual(expect.arrayContaining([
      'projectExecutionSummaryService',
      'projectDailySnapshotService',
      'projectTrendAnalyticsService',
      'companySummaryService',
      'companyTrendAnalyticsService',
    ]))
    expect(metricReport.assets.find((asset) => asset.assetKey === 'projectExecutionSummaryService')).toEqual(expect.objectContaining({
      discoveryStatus: 'registered',
      runtimeEffect: 'metric_registry_or_metric_snapshot_boundary',
    }))
  })

  it('covers backend-wide governance assets outside services seeds jobs and routes', () => {
    const report = evaluateV14AssetAdmissionAutomation()
    const byPath = new Map(report.assets.map((asset) => [asset.sourcePath, asset]))

    expect(byPath.get('server/src/scheduler.ts')).toEqual(expect.objectContaining({
      assetKey: 'scheduler',
      assetType: 'background_governance_job',
      discoveryStatus: 'registered',
    }))
    expect(byPath.get('server/src/utils/progressCalculation.ts')).toEqual(expect.objectContaining({
      assetKey: 'utils.progressCalculation',
      assetType: 'metric_admission_asset',
      discoveryStatus: 'registered',
    }))
    expect(byPath.get('server/src/utils/taskStatus.ts')).toEqual(expect.objectContaining({
      assetKey: 'utils.taskStatus',
      assetType: 'governance_support_asset',
      discoveryStatus: 'registered',
    }))
    expect(byPath.has('server/src/scripts/adopt-migration-baseline.ts')).toBe(false)
    expect(byPath.has('server/src/seed-test-project.ts')).toBe(false)
  })

  it('keeps auto-registered current assets explicit in the four-field governance ledger', () => {
    const report = evaluateV14AssetAdmissionAutomation()
    const byPath = new Map(report.assets.map((asset) => [asset.sourcePath, asset]))
    const defaultReviewKeys = new Set(report.governanceDefaultReviewItems.map((asset) => asset.assetKey))

    expect(byPath.get('server/src/scheduler.ts')).toEqual(expect.objectContaining({
      learningTarget: 'governance_report',
      learningMaturity: 'shadow_report_only',
      publishAnchor: 'manual_governance_required',
      automationMaturity: 'auto_review_package',
      governanceDefaultsEvidence: expect.arrayContaining([
        'matched_algorithm_rule_asset_inventory_governance_fields',
      ]),
    }))
    expect(byPath.get('server/src/utils/progressCalculation.ts')).toEqual(expect.objectContaining({
      learningTarget: 'metric_caliber',
      learningMaturity: 'frozen_constant',
      publishAnchor: 'manual_governance_required',
      automationMaturity: 'manual_required',
      governanceDefaultsEvidence: expect.arrayContaining([
        'matched_algorithm_rule_asset_inventory_governance_fields',
      ]),
    }))
    expect(defaultReviewKeys.has('scheduler')).toBe(false)
    expect(defaultReviewKeys.has('metricRegistry')).toBe(false)
    expect(defaultReviewKeys.has('utils.progressCalculation')).toBe(false)
  })
})
