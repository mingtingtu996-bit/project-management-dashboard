import {
  listAlgorithmCatalogEntries,
  listAlgorithmSeedCatalogEntries,
} from './algorithmCatalogService.js'
import {
  listAlgorithmRuleAssets,
  type AlgorithmRuleAsset,
} from './algorithmRuleAssetInventoryService.js'
import { DATA_QUALITY_RULE_REGISTRY } from './dataQualityRuleRegistry.js'
import { listMetricRegistry } from './metricRegistryService.js'
import type {
  AlgorithmAssetAutomationMaturity,
  AlgorithmAssetLearningMaturity,
  AlgorithmAssetLearningTarget,
  AlgorithmAssetPublishAnchor,
} from './algorithmAssetGovernanceProtocolService.js'
import {
  discoverV14AssetSources,
  type V14DiscoveredAssetSource,
  type V14AssetScopePolicy,
  type V14AutoDiscoveredAssetType,
} from './v14AssetDiscoveryService.js'

export type { V14AssetScopePolicy, V14AutoDiscoveredAssetType } from './v14AssetDiscoveryService.js'

export type V14AssetDiscoveryStatus =
  | 'registered'
  | 'auto_discovered'
  | 'explicitly_exempted'

export type V14AssetGovernanceStatus =
  | 'confirmed'
  | 'needs_governance_review'
  | 'exempted'

export interface V14AutoDiscoveredAsset {
  assetKey: string
  assetType: V14AutoDiscoveredAssetType
  sourcePath: string
  discoveryStatus: V14AssetDiscoveryStatus
  governanceStatus: V14AssetGovernanceStatus
  runtimeEffect: string
  scopePolicy: V14AssetScopePolicy
  consumers: string[]
  durationRelated: boolean
  learningTarget: AlgorithmAssetLearningTarget
  learningMaturity: AlgorithmAssetLearningMaturity
  publishAnchor: AlgorithmAssetPublishAnchor
  automationMaturity: AlgorithmAssetAutomationMaturity
  governanceDefaultsEvidence: string[]
  owner: string
  evidence: string[]
}

export interface V14AssetAdmissionAutomationReport {
  generatedAt: string
  status: 'pass' | 'review_required' | 'block'
  summary: {
    totalDiscoveredCount: number
    registeredCount: number
    autoDiscoveredCount: number
    reviewRequiredCount: number
    blockerCount: number
    handRegistrationMissingCount: number
    dataAdmissionAssetCount: number
    metricAdmissionAssetCount: number
    ruleSeedAssetCount: number
    durationRelatedAssetCount: number
    durationRelatedCoverageRatio: number
    explicitGovernanceFieldCount: number
    conservativeGovernanceDefaultCount: number
  }
  blockers: Array<{
    assetKey: string
    sourcePath: string
    reason: string
  }>
  reviewItems: V14AutoDiscoveredAsset[]
  governanceDefaultReviewItems: Array<{
    assetKey: string
    sourcePath: string
    durationRelated: boolean
    learningTarget: AlgorithmAssetLearningTarget
    learningMaturity: AlgorithmAssetLearningMaturity
    publishAnchor: AlgorithmAssetPublishAnchor
    automationMaturity: AlgorithmAssetAutomationMaturity
    reason: string
  }>
  assets: V14AutoDiscoveredAsset[]
  boundaryPolicy: string[]
}

function slash(value: string) {
  return value.replaceAll('\\', '/')
}

const DURATION_RELATED_PATTERN = /(duration|forecast|schedule|critical|dependency|calendar|baseline|productivity|weather|climate|risk|warning|health|wbs|template|milestone|monthly|planning|acceleration)/i

function governanceText(discovered: V14DiscoveredAssetSource, registeredAsset?: AlgorithmRuleAsset) {
  return [
    discovered.assetKey,
    discovered.assetType,
    discovered.sourcePath,
    discovered.runtimeEffect,
    discovered.scopePolicy,
    ...discovered.consumers,
    registeredAsset?.governanceSystem,
    registeredAsset?.ownerService,
    registeredAsset?.role,
    registeredAsset?.reason,
    ...(registeredAsset?.boundaryPolicy ?? []),
    ...(registeredAsset?.consumers ?? []),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}

function isDurationRelated(discovered: V14DiscoveredAssetSource, registeredAsset?: AlgorithmRuleAsset) {
  return DURATION_RELATED_PATTERN.test(governanceText(discovered, registeredAsset))
}

function deriveLearningTarget(
  discovered: V14DiscoveredAssetSource,
  registeredAsset: AlgorithmRuleAsset | undefined,
  evidence: string[],
): AlgorithmAssetLearningTarget {
  if (registeredAsset?.learningTarget) {
    evidence.push('matched_algorithm_rule_asset_inventory_governance_fields')
    return registeredAsset.learningTarget
  }

  const text = governanceText(discovered, registeredAsset)
  if (/forecast|residual/.test(text)) {
    evidence.push('derived_learning_target_from_duration_or_forecast_effect')
    return 'forecast_residual'
  }
  if (/weather|climate|site|resource|context/.test(text)) {
    evidence.push('derived_learning_target_from_duration_or_context_effect')
    return 'context_factor'
  }
  if (/duration|baseline|calendar|productivity|acceleration/.test(text)) {
    evidence.push('derived_learning_target_from_duration_or_baseline_effect')
    return 'base_duration'
  }
  if (/dependency|critical|schedule/.test(text)) {
    evidence.push('derived_learning_target_from_plan_network_effect')
    return 'dependency_order'
  }
  if (/wbs|template|catalog|certificate|acceptance|drawing/.test(text)) {
    evidence.push('derived_learning_target_from_template_structure_effect')
    return 'template_structure'
  }
  if (/risk|warning|health|issue/.test(text)) {
    evidence.push('derived_learning_target_from_risk_or_health_effect')
    return 'risk_warning'
  }
  if (discovered.assetType === 'metric_admission_asset' || /metric|summary|snapshot|trend|analytics|report|dashboard|cockpit/.test(text)) {
    evidence.push('derived_learning_target_from_metric_admission_asset')
    return 'metric_caliber'
  }

  evidence.push('derived_learning_target_from_governance_report_default')
  return 'governance_report'
}

function deriveGovernanceDefaults(
  discovered: V14DiscoveredAssetSource,
  registeredAsset?: AlgorithmRuleAsset,
) {
  const governanceDefaultsEvidence: string[] = []
  const learningTarget = deriveLearningTarget(discovered, registeredAsset, governanceDefaultsEvidence)

  const hasCompleteInventoryGovernanceFields = Boolean(
    registeredAsset?.learningTarget
      && registeredAsset.learningMaturity
      && registeredAsset.publishAnchor
      && registeredAsset.automationMaturity,
  )
  if (hasCompleteInventoryGovernanceFields) {
    return {
      durationRelated: isDurationRelated(discovered, registeredAsset),
      learningTarget,
      learningMaturity: registeredAsset.learningMaturity as AlgorithmAssetLearningMaturity,
      publishAnchor: registeredAsset.publishAnchor as AlgorithmAssetPublishAnchor,
      automationMaturity: registeredAsset.automationMaturity as AlgorithmAssetAutomationMaturity,
      governanceDefaultsEvidence,
    }
  }

  governanceDefaultsEvidence.push('missing_inventory_governance_field_defaults_to_candidate_or_shadow')
  const isConservativeFactLayerTarget = learningTarget === 'metric_caliber' || learningTarget === 'governance_report'
  return {
    durationRelated: isDurationRelated(discovered, registeredAsset),
    learningTarget,
    learningMaturity: (isConservativeFactLayerTarget ? 'frozen_constant' : 'shadow_report_only') as AlgorithmAssetLearningMaturity,
    publishAnchor: (isConservativeFactLayerTarget ? 'manual_governance_required' : 'candidate_only') as AlgorithmAssetPublishAnchor,
    automationMaturity: (isConservativeFactLayerTarget ? 'manual_required' : 'auto_shadow') as AlgorithmAssetAutomationMaturity,
    governanceDefaultsEvidence,
  }
}

function buildRegisteredEvidence() {
  const registeredKeys = new Set<string>()
  const registeredPaths = new Set<string>()
  const ruleAssetsByKey = new Map<string, AlgorithmRuleAsset>()
  const ruleAssetsByPath = new Map<string, AlgorithmRuleAsset>()

  for (const algorithm of listAlgorithmCatalogEntries()) {
    registeredKeys.add(algorithm.algorithmKey)
    registeredPaths.add(slash(algorithm.implementationPath))
  }
  for (const seed of listAlgorithmSeedCatalogEntries()) {
    registeredKeys.add(seed.seedKey)
    registeredPaths.add(slash(seed.seedFile))
  }
  for (const asset of listAlgorithmRuleAssets()) {
    registeredKeys.add(asset.key)
    const sourcePath = slash(asset.source)
    registeredPaths.add(sourcePath)
    ruleAssetsByKey.set(asset.key, asset)
    ruleAssetsByPath.set(sourcePath, asset)
  }
  for (const rule of DATA_QUALITY_RULE_REGISTRY) {
    registeredKeys.add(rule.ruleCode)
  }
  for (const metric of listMetricRegistry()) {
    registeredKeys.add(metric.key)
  }

  return { registeredKeys, registeredPaths, ruleAssetsByKey, ruleAssetsByPath }
}

export function collectV14AutoDiscoveredAssets(): V14AssetAdmissionAutomationReport {
  const { registeredKeys, registeredPaths, ruleAssetsByKey, ruleAssetsByPath } = buildRegisteredEvidence()
  const assets = discoverV14AssetSources()
    .map((discovered) => {
      const registered = registeredKeys.has(discovered.assetKey)
        || registeredKeys.has(discovered.assetKey.replace(/Service$/, ''))
        || registeredPaths.has(discovered.sourcePath)
      const registeredAsset = ruleAssetsByKey.get(discovered.assetKey)
        ?? ruleAssetsByKey.get(discovered.assetKey.replace(/Service$/, ''))
        ?? ruleAssetsByPath.get(discovered.sourcePath)
      const governanceDefaults = deriveGovernanceDefaults(discovered, registeredAsset)
      const asset: V14AutoDiscoveredAsset = {
        assetKey: discovered.assetKey,
        assetType: discovered.assetType,
        sourcePath: discovered.sourcePath,
        discoveryStatus: registered ? 'registered' : 'auto_discovered',
        governanceStatus: registered ? 'confirmed' : 'needs_governance_review',
        runtimeEffect: discovered.runtimeEffect,
        scopePolicy: discovered.scopePolicy,
        consumers: discovered.consumers,
        ...governanceDefaults,
        owner: discovered.assetKey,
        evidence: [
          'repo_path_keyword_scan',
          registered ? 'matched_existing_registry_or_catalog' : 'auto_discovered_by_v14_admission_scan',
        ],
      }
      return asset
    })
    .sort((a, b) => a.sourcePath.localeCompare(b.sourcePath))

  return buildReport(assets)
}

function isHighRiskUnclassified(asset: V14AutoDiscoveredAsset) {
  return asset.discoveryStatus === 'auto_discovered'
    && (!asset.runtimeEffect || asset.scopePolicy === 'not_runtime_data' || asset.consumers.length === 0)
}

function ratio(numerator: number, denominator: number) {
  if (denominator === 0) return 0
  return Number((numerator / denominator).toFixed(4))
}

function usesConservativeGovernanceDefaults(asset: V14AutoDiscoveredAsset) {
  return asset.governanceDefaultsEvidence.includes('missing_inventory_governance_field_defaults_to_candidate_or_shadow')
}

function buildReport(assets: V14AutoDiscoveredAsset[]): V14AssetAdmissionAutomationReport {
  const reviewItems = assets.filter((asset) => asset.governanceStatus === 'needs_governance_review')
  const durationRelatedAssets = assets.filter((asset) => asset.durationRelated)
  const conservativeGovernanceDefaultAssets = assets.filter(usesConservativeGovernanceDefaults)
  const blockers = assets
    .filter(isHighRiskUnclassified)
    .map((asset) => ({
      assetKey: asset.assetKey,
      sourcePath: asset.sourcePath,
      reason: 'Auto-discovered v1.4 asset has runtime effect, scope, or consumer boundary that cannot be classified safely.',
    }))
  const status: V14AssetAdmissionAutomationReport['status'] = blockers.length > 0
    ? 'block'
    : reviewItems.length > 0
      ? 'review_required'
      : 'pass'

  return {
    generatedAt: new Date().toISOString(),
    status,
    summary: {
      totalDiscoveredCount: assets.length,
      registeredCount: assets.filter((asset) => asset.discoveryStatus === 'registered').length,
      autoDiscoveredCount: assets.filter((asset) => asset.discoveryStatus === 'auto_discovered').length,
      reviewRequiredCount: reviewItems.length,
      blockerCount: blockers.length,
      handRegistrationMissingCount: 0,
      dataAdmissionAssetCount: assets.filter((asset) => asset.assetType === 'data_admission_asset').length,
      metricAdmissionAssetCount: assets.filter((asset) => asset.assetType === 'metric_admission_asset').length,
      ruleSeedAssetCount: assets.filter((asset) => asset.assetType === 'rule_seed_asset').length,
      durationRelatedAssetCount: durationRelatedAssets.length,
      durationRelatedCoverageRatio: ratio(durationRelatedAssets.length, assets.length),
      explicitGovernanceFieldCount: assets.length - conservativeGovernanceDefaultAssets.length,
      conservativeGovernanceDefaultCount: conservativeGovernanceDefaultAssets.length,
    },
    blockers,
    reviewItems,
    governanceDefaultReviewItems: conservativeGovernanceDefaultAssets.map((asset) => ({
      assetKey: asset.assetKey,
      sourcePath: asset.sourcePath,
      durationRelated: asset.durationRelated,
      learningTarget: asset.learningTarget,
      learningMaturity: asset.learningMaturity,
      publishAnchor: asset.publishAnchor,
      automationMaturity: asset.automationMaturity,
      reason: 'missing_inventory_governance_field_defaults_to_candidate_or_shadow',
    })),
    assets,
    boundaryPolicy: [
      'auto_discovery_is_the_default_for_new_v14_assets',
      'manual_registry_is_confirmation_not_the_first_line_of_defense',
      'data_admission_metric_admission_and_rule_asset_admission_share_one_detection_model',
      'only_high_risk_unclassified_runtime_assets_block_ci',
      'publish_anchor_and_automation_maturity_are_required_before_runtime_publish',
      'llm_and_manual_anchor_assets_default_to_candidate_or_review',
      'ordinary_business_frontend_must_not_expose_technical_asset_fields',
      'duration_related_coverage_is_reported_without_publish_rights',
      'conservative_governance_defaults_require_explicit_follow_up_before_runtime_publish',
    ],
  }
}

export function evaluateV14AssetAdmissionAutomation() {
  return collectV14AutoDiscoveredAssets()
}

export function evaluateV14AssetAdmissionAutomationForTypes(assetTypes: V14AutoDiscoveredAssetType[]) {
  const allowedTypes = new Set(assetTypes)
  const report = collectV14AutoDiscoveredAssets()
  const assets = report.assets.filter((asset) => allowedTypes.has(asset.assetType))
  return buildReport(assets)
}
