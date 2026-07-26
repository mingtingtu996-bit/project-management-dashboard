import {
type DurationSuggestion
} from './durationSuggestionService.js'
import {
type WbsTemplatePackType
} from '../seeds/domainWbsTemplateCatalogs.js'
import {
describeDurationContributionMode,
inferDurationContributionMode,
isDurationBearingContributionMode,
normalizeDurationContributionMode,
type DurationContributionMode,
} from '../seeds/durationContributionMode.js'
import {
resolveProjectConstructionOrganizationPolicy
} from '../seeds/projectConstructionOrganizationPolicySeed.js'
import {
addPlanDays as addDays
} from './wbsPlanRollupService.js'
import {
inferExecutionProfileFromProjectFacts,
isLowRiseMultiBuildingParallelScenario,
normalizeProjectScenarioMethodCode,
resolveScenarioScheduleProfile,
type BuildingPatternExecutionArchetype,
type BuildingPatternExecutionArchetypeProfile,
type ProjectScenarioScheduleProfile,
type WbsTemplateProjectRecommendationKey,
} from './projectScenarioTaxonomyService.js'
import { buildProjectGenerationFactsSnapshot } from './projectGenerationFactsSnapshotService.js'
import { resolvePackageChildRhythmWindow } from './packageChildRhythmWindowService.js'

import {
GENERATION_DEPTH_RANK,
WBS_TEMPLATE_GENERATION_SERVER_ROW_LIMIT,
buildEngineeringFeatureProfile,
buildFloorSequenceScope,
deriveElementVariantsForGeneration,
deriveProjectOrganizationLaneTotal,
hasSharedBasementOrganizationFacts,
isBuiltInChinaTemplateId,
isExplicitSelectedNodeInScope,
isWholeProjectScope,
nodeMatchesEngineeringFeatureFilters,
normalizeId,
normalizeText,
readActualizationCodeFamily,
readArray,
readFloorSequenceItems,
readOptionalNumber,
readPositiveNumber,
readRecord,
readStringArray,
selectedEarthworkActualCarrierCodes,
selectedGroundwaterControlActualCarrierCodes,
selectedWaterproofActualCarrierCodes,
shouldDeriveProjectOrganizationPolicy,
uniqueStringArray,
withPlanReferenceDurationOutput,
withProjectOrganizationScope,
} from './wbsTemplateGenerationFoundation.js'
import type {
EngineeringFeatureProfile,
GeneratedElementVariant,
GeneratedMasterPlanProfile,
GeneratedTemplateBatch,
GeneratedTemplateDurationSuggestion,
ProjectOrganizationStrategy,
ProjectScopeCatalogActualizationDecision,
TemplateNode,
WbsTemplateFloorSequenceInput,
WbsTemplateGenerationDepth,
WbsTemplateScope,
} from './wbsTemplateGenerationFoundation.js'
import {
buildFloorSeriesItemFromScope,
buildNonFloorScopeKey,
buildScopeContextKey,
getChildGenerationDepth,
isDurationSuggestionNode,
isExplicitFloorInstanceScope,
isFloorSeriesScope,
isManagedFrontierGeneration,
isRhythmExpansionEligibleNode,
isWithinGenerationDepth,
resolveGenerationDepthPolicyForNode,
scopeCanGenerateNodeForProjectOrganization,
shouldMaterializeNodeInGeneration,
shouldTraverseNodeChildrenInGeneration,
} from './wbsTemplateScopeClassificationService.js'



export function selectedFoundationActualCarrierCodes(featureProfile: EngineeringFeatureProfile) {
  const projectType = normalizeText(featureProfile.projectTypeCode).toLowerCase()
  const structureType = normalizeText(featureProfile.structureTypeCode).toLowerCase()
  const methodCodes = featureProfile.methodVariantCodes.map((item) => normalizeDurationMethodCode(item))
  const hasBasement = (featureProfile.basementLevelCount ?? 0) > 0 || (featureProfile.basementAreaM2 ?? 0) > 0
  const hasDeepPit = (featureProfile.foundationDepthM ?? 0) >= 5 || (featureProfile.basementLevelCount ?? 0) >= 2
  const usesSteel = structureType.includes('steel') || methodCodes.includes('steel_structure')
  const usesPile = methodCodes.some((code) => ['pile', 'bored_pile', 'precast_pile', 'cast_in_place_pile'].includes(code))

  if (usesPile) return ['01-02-08']
  if (usesSteel) return ['01-02-04']
  if (hasBasement || hasDeepPit || ['residential', 'general_civil', 'commercial'].includes(projectType)) return ['01-02-03']
  return ['01-02-02']
}



export function selectedGroundTreatmentActualCarrierCodes(featureProfile: EngineeringFeatureProfile) {
  const methodCodes = featureProfile.methodVariantCodes.map((item) => normalizeDurationMethodCode(item))
  if (methodCodes.includes('cement_soil_mixing_pile')) return ['01-01-10']
  if (methodCodes.includes('jet_grouting')) return ['01-01-09']
  if (methodCodes.includes('dynamic_compaction')) return ['01-01-05']
  return []
}



export function selectedPitSupportActualCarrierCodes(featureProfile: EngineeringFeatureProfile) {
  const methodCodes = featureProfile.methodVariantCodes.map((item) => normalizeDurationMethodCode(item))
  if (methodCodes.includes('diaphragm_wall')) return ['01-03-06']
  if (methodCodes.includes('smw')) return ['01-03-04']
  if ((featureProfile.foundationDepthM ?? 0) >= 5 || (featureProfile.basementLevelCount ?? 0) >= 2) return ['01-03-01', '01-03-08']
  return ['01-03-05']
}



export function selectedSlopeActualCarrierCodes(featureProfile: EngineeringFeatureProfile) {
  const methodCodes = featureProfile.methodVariantCodes.map((item) => normalizeDurationMethodCode(item))
  if (methodCodes.includes('shotcrete_anchor') || methodCodes.includes('soil_nail')) return ['01-06-01']
  if (methodCodes.includes('retaining_wall')) return ['01-06-02']
  return (featureProfile.foundationDepthM ?? 0) >= 5 || (featureProfile.basementLevelCount ?? 0) >= 2
    ? ['01-06-03']
    : []
}



export function resolveProjectScopeActualCarrierCodes(familyCode: string, featureProfile: EngineeringFeatureProfile) {
  switch (familyCode) {
    case '01-01':
      return selectedGroundTreatmentActualCarrierCodes(featureProfile)
    case '01-02':
      return selectedFoundationActualCarrierCodes(featureProfile)
    case '01-03':
      return selectedPitSupportActualCarrierCodes(featureProfile)
    case '01-04':
      return selectedGroundwaterControlActualCarrierCodes(featureProfile)
    case '01-05':
      return selectedEarthworkActualCarrierCodes()
    case '01-06':
      return selectedSlopeActualCarrierCodes(featureProfile)
    case '01-07':
      return selectedWaterproofActualCarrierCodes(featureProfile)
    default:
      return []
  }
}



export function evaluateProjectScopeCatalogActualization(
  node: TemplateNode,
  scope: WbsTemplateScope,
): ProjectScopeCatalogActualizationDecision | null {
  if (!isWholeProjectScope(scope)) return null
  if (!scope.project_organization_policy_id) return null
  if (node.categoryType !== 'item_work') return null

  const code = normalizeText(node.stableCode).toUpperCase()
  const familyCode = readActualizationCodeFamily(code)
  if (!['01-01', '01-02', '01-03', '01-04', '01-05', '01-06', '01-07'].includes(familyCode)) return null

  const featureProfile = buildEngineeringFeatureProfile(scope)
  const selectedCodes = resolveProjectScopeActualCarrierCodes(familyCode, featureProfile)
  const applies = true
  const selected = selectedCodes.includes(code)
  return {
    applies,
    selected,
    familyCode,
    selectedCodes,
    reasonCode: selectedCodes.length > 0
      ? `${familyCode.toLowerCase().replace('-', '_')}_actual_carrier_selected_by_project_facts`
      : `${familyCode.toLowerCase().replace('-', '_')}_not_actualized_without_project_fact_support`,
    confidence: familyCode === '01-02' ? 'high' : 'medium',
  }
}



export function shouldSuppressNodeByProjectScopeActualization(node: TemplateNode, scope: WbsTemplateScope) {
  const decision = evaluateProjectScopeCatalogActualization(node, scope)
  return Boolean(decision?.applies && !decision.selected && !isExplicitSelectedNodeInScope(node, scope))
}



export function deriveProjectOrganizationStrategy(scope: WbsTemplateScope): ProjectOrganizationStrategy | null {
  if (!shouldDeriveProjectOrganizationPolicy(scope)) return null
  const featureProfile = buildEngineeringFeatureProfile(scope)
  const executionProfile = readExecutionProfileFromProjectFacts(featureProfile)
  const businessType = normalizeId(featureProfile.businessType ?? featureProfile.projectTypeCode)
  const projectType = normalizeId(featureProfile.projectTypeCode)
  const buildingCount = Math.max(1, Math.floor(readOptionalNumber(scope.building_count) ?? 1))
  const seedPolicy = resolveProjectConstructionOrganizationPolicy(businessType, projectType, featureProfile)
  const policy = businessType === 'modular_building'
    || projectType === 'modular_building'
    || executionProfileHasArchetype(executionProfile, 'mic_modular_fast_track')
    ? resolveProjectConstructionOrganizationPolicy('modular_building', projectType, featureProfile)
    : seedPolicy
  const hasSharedBasementFacts = hasSharedBasementOrganizationFacts(featureProfile)
  const lowRiseParallel = !hasSharedBasementFacts
    && executionProfileHasArchetype(executionProfile, 'lowrise_multi_building_parallel')
  const strategy = lowRiseParallel
    ? 'lowrise_multi_building_cluster_parallel_network'
    : policy.strategy
  return {
    policyId: lowRiseParallel ? 'project-organization-lowrise-cluster-parallel-v1' : policy.policyId,
    strategy,
    laneTotal: deriveProjectOrganizationLaneTotal({
      scope,
      policy,
      buildingCount,
      lowRiseParallel,
    }),
    lanePrefix: lowRiseParallel ? 'lowrise_lane' : policy.lanePrefix,
    laneRole: lowRiseParallel ? 'primary_building_lane' : policy.laneRole,
    confidence: lowRiseParallel ? 'high' : policy.confidence,
    policy,
    networkPolicy: lowRiseParallel
      ? {
          ...policy.networkPolicy,
          primaryLaneScheduling: 'parallel_lanes_with_interface_gates',
        }
      : policy.networkPolicy,
  }
}



export function expandProjectOrganizationScopes(scope: WbsTemplateScope): WbsTemplateScope[] {
  const strategy = deriveProjectOrganizationStrategy(scope)
  if (!strategy) return [scope]
  if (scope.building_sequence_index != null || scope.building_object_id) {
    const index = scope.building_sequence_index != null
      ? Math.max(0, Math.min(strategy.laneTotal - 1, Math.floor(scope.building_sequence_index)))
      : 0
    return [withProjectOrganizationScope(scope, index, strategy)]
  }
  const usesBuildingScope = strategy.laneRole === 'primary_building_lane'
  return [
    withProjectOrganizationScope(scope, null, strategy),
    ...Array.from({ length: strategy.laneTotal }, (_, index) => withProjectOrganizationScope({
      ...scope,
      building_object_id: usesBuildingScope ? scope.building_object_id ?? `B${index + 1}` : null,
      building_sequence_source: usesBuildingScope ? scope.building_sequence_source ?? 'inferred_building_count' : null,
      building_sequence_index: usesBuildingScope ? index : null,
      building_sequence_number: usesBuildingScope ? index + 1 : null,
      building_sequence_total: usesBuildingScope ? strategy.laneTotal : null,
    }, index, strategy)),
  ]
}



export function applyProjectOrganizationToScopeCombos(combos: WbsTemplateScope[], baseScope: WbsTemplateScope): WbsTemplateScope[] {
  const strategy = deriveProjectOrganizationStrategy(baseScope)
  if (!strategy) return combos
  const hasBuildingCombos = combos.some((scope) => scope.building_sequence_index != null || scope.building_object_id)
  if (!hasBuildingCombos) return expandProjectOrganizationScopes(baseScope)
  return [
    withProjectOrganizationScope({
      ...baseScope,
      building_object_id: null,
      building_sequence_source: null,
      building_sequence_index: null,
      building_sequence_number: null,
      building_sequence_total: null,
      floor_object_id: null,
      ...buildFloorSequenceScope(null, 0, null),
    }, null, strategy),
    ...combos.map((scope, fallbackIndex) => {
      const rawIndex = scope.building_sequence_index != null ? Math.floor(scope.building_sequence_index) : fallbackIndex
      const index = Math.max(0, Math.min(strategy.laneTotal - 1, rawIndex))
      return withProjectOrganizationScope(scope, index, strategy)
    }),
  ]
}



export function compactScopeCombosForRhythmNode(node: TemplateNode, scopeCombos: WbsTemplateScope[]) {
  if (!isRhythmExpansionEligibleNode(node)) return scopeCombos

  const compacted: WbsTemplateScope[] = []
  const groups = new Map<string, WbsTemplateScope[]>()
  const passthrough: WbsTemplateScope[] = []

  for (const scope of scopeCombos) {
    const canCompact = !isExplicitFloorInstanceScope(scope)
      && (scope.floor_sequence_source === 'explicit_floor_array' || scope.floor_sequence_source === 'inferred_floor_count')
      && (scope.floor_sequence_total ?? 0) > 1
      && scope.floor_sequence_index != null
    if (!canCompact) {
      passthrough.push(scope)
      continue
    }
    const key = buildNonFloorScopeKey(scope)
    const group = groups.get(key) ?? []
    group.push(scope)
    groups.set(key, group)
  }

  for (const group of groups.values()) {
    if (group.length <= 1) {
      compacted.push(...group)
      continue
    }
    const ordered = [...group].sort((left, right) => (left.floor_sequence_index ?? 0) - (right.floor_sequence_index ?? 0))
    const representative = ordered[0]
    const floorSeries = ordered.map(buildFloorSeriesItemFromScope)
    compacted.push({
      ...representative,
      floor_object_id: null,
      ...buildFloorSequenceScope(null, 0, null),
      floor_series: floorSeries,
      floor_series_count: floorSeries.length,
      floor_series_label: buildFloorSeriesLabel(floorSeries),
      floor_series_source: representative.floor_sequence_source,
      scope_expansion_mode: 'building_rhythm_series',
    })
  }

  return [...compacted, ...passthrough]
}



export function buildScopeCombosForNode(node: TemplateNode, scopeCombos: WbsTemplateScope[]) {
  scopeCombos = scopeCombos.filter((scope) => scopeCanGenerateNodeForProjectOrganization(scope, node))
  if (scopeCombos.length === 0) return []
  const metadata = readRecord(node.metadata)
  const explicitScopeMode = normalizeId(metadata.scopeExpansionMode ?? metadata.scope_expansion_mode)
  if (
    !isRhythmExpansionEligibleNode(node)
    && explicitScopeMode !== 'explicit_instances'
    && explicitScopeMode !== 'floor_full_expand'
  ) {
    const normalizedScopes = scopeCombos.map((scope) => ({
      ...scope,
      ...(scope.floor_sequence_source === 'inferred_floor_count'
        ? {
            floor_object_id: null,
            ...buildFloorSequenceScope(null, 0, null),
            floor_series: undefined,
            floor_series_count: null,
            floor_series_label: null,
            floor_series_source: null,
          }
        : {}),
      ...(scope.building_sequence_source === 'inferred_building_count'
        && !scope.project_organization_policy_id
        ? {
            building_object_id: null,
            building_sequence_source: null,
            building_sequence_index: null,
            building_sequence_number: null,
            building_sequence_total: null,
          }
        : {}),
      ...(scope.project_organization_policy_id
        && scope.floor_sequence_source === 'inferred_floor_count'
        ? {
            floor_object_id: null,
            ...buildFloorSequenceScope(null, 0, null),
            floor_series: undefined,
            floor_series_count: null,
            floor_series_label: null,
            floor_series_source: null,
          }
        : {}),
    }))
    const seen = new Set<string>()
    return normalizedScopes.filter((scope) => {
      const key = buildScopeContextKey(scope)
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  }
  const normalizedScopes = compactScopeCombosForRhythmNode(node, scopeCombos).map((scope) => (
    shouldCompactInferredBuildingsToWorkfacePool(scope)
      ? {
          ...scope,
          building_object_id: null,
          building_sequence_source: null,
          building_sequence_index: null,
          building_sequence_number: null,
          building_sequence_total: null,
          project_organization_policy_id: null,
          project_organization_strategy: null,
          organization_lane: null,
          organization_lane_role: null,
          organization_lane_index: null,
          organization_lane_total: null,
          organization_scope_group: null,
          organization_shared_work: null,
          organization_confidence: null,
        }
      : scope
  ))
  const seen = new Set<string>()
  return normalizedScopes.filter((scope) => {
    const key = buildScopeContextKey(scope)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}



export function buildGenerationScopeContexts(
  templateSelections: Array<{ templateId: string; selectedNodes: TemplateNode[]; templateIndex: number }>,
  baseScopeCombos: WbsTemplateScope[],
) {
  const contexts: Array<{
    scope: WbsTemplateScope
    templateSelections: Array<{ templateId: string; selectedNodes: TemplateNode[]; templateIndex: number }>
  }> = []

  for (const selection of templateSelections) {
    const groups = new Map<string, { scopes: WbsTemplateScope[]; selectedNodes: TemplateNode[] }>()
    for (const node of selection.selectedNodes) {
      const nodeScopes = buildScopeCombosForNode(node, baseScopeCombos)
      const signature = nodeScopes.map(buildScopeContextKey).join('|')
      const group = groups.get(signature) ?? { scopes: nodeScopes, selectedNodes: [] }
      group.selectedNodes.push(node)
      groups.set(signature, group)
    }

    for (const group of groups.values()) {
      const selectedNodeStableCodes = uniqueStringArray(group.selectedNodes.flatMap((node) => [
        node.stableCode,
        node.id,
        node.standardWorkCode ?? '',
      ]))
      for (const scope of group.scopes) {
        const scopedSelectedNodeStableCodes = uniqueStringArray([
          ...(scope.selected_node_stable_codes ?? []),
          ...(scope.selectedNodeStableCodes ?? []),
          ...selectedNodeStableCodes,
        ])
        contexts.push({
          scope: {
            ...scope,
            selected_node_stable_codes: scopedSelectedNodeStableCodes,
            selectedNodeStableCodes: scopedSelectedNodeStableCodes,
          },
          templateSelections: [{
            templateId: selection.templateId,
            selectedNodes: group.selectedNodes,
            templateIndex: selection.templateIndex,
          }],
        })
      }
    }
  }

  return contexts
}



export function shouldKeepItemWorkRollupParentInDeepGeneration(node: TemplateNode) {
  if (node.categoryType !== 'item_work') return false
  const metadata = readRecord(node.metadata)
  const planDurationTruthSource = normalizeText(metadata.planDurationTruthSource ?? metadata.plan_duration_truth_source)
  const parentDurationTruthBoundary = normalizeText(metadata.parentDurationTruthBoundary ?? metadata.parent_duration_truth_boundary)
  const durationBoundaryPolicy = normalizeParentDurationBoundaryPolicy(metadata.durationBoundaryPolicy ?? metadata.duration_boundary_policy)
  return planDurationTruthSource === 'parent_package_rhythm_window'
    || parentDurationTruthBoundary === 'parent_window_is_plan_truth_children_are_package_windows'
    || Boolean(durationBoundaryPolicy)
}



export function normalizeDurationMethodCode(value: unknown) {
  const normalized = normalizeProjectScenarioMethodCode(normalizeFloorMethodCode(value))
  if (normalized === 'aluminum_formwork') return 'aluminum_form_early_strip'
  if (normalized === 'large_formwork') return 'large_form'
  if (normalized === 'wood_formwork' || normalized === 'timber_formwork') return 'wood_form'
  if (normalized === 'prefab_concrete') return 'prefab'
  if (normalized === 'mic_modular') return 'mic'
  return normalized
}



export function readPositiveFactor(value: unknown): number | null {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}



export function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}



export function normalizeRate01(value: unknown): number | null {
  const parsed = readOptionalNumber(value)
  if (parsed === null || parsed <= 0) return null
  return clampNumber(parsed > 1 ? parsed / 100 : parsed, 0, 1)
}



export type PrefabRateDurationFactor = {
  factor: number
  profile: string
}



export type ConstructionSchedulePhaseKind =
  | 'foundation'
  | 'basement'
  | 'superstructure'
  | 'mep'
  | 'finishing'
  | 'facade'
  | 'commissioning'
  | 'outdoor'
  | 'control'
  | 'prefab'
  | 'general'



export function isLowRiseMultiBuildingParallelProject(featureProfile: EngineeringFeatureProfile) {
  return isLowRiseMultiBuildingParallelScenario(featureProfile)
}



export function readExecutionProfileFromProjectFacts(featureProfile: EngineeringFeatureProfile): BuildingPatternExecutionArchetypeProfile {
  return inferExecutionProfileFromProjectFacts(featureProfile)
}



export function executionProfileHasArchetype(
  profile: BuildingPatternExecutionArchetypeProfile,
  archetype: BuildingPatternExecutionArchetype,
) {
  return profile.primaryArchetype === archetype
    || profile.crossCuttingArchetypes.includes(archetype)
    || profile.allArchetypes.includes(archetype)
}



export function inferSchedulePhaseKindFromText(value: unknown): ConstructionSchedulePhaseKind {
  const text = normalizeText(value).toLowerCase()
  if (!text) return 'general'
  if (text.includes('site') || text.includes('danger') || text.includes('quality') || text.includes('doc') || text.includes('milestone')) return 'control'
  if (text.includes('prefab') || text.includes('factory') || text.includes('module') || text.includes('mic') || text.includes('hoist')) return 'prefab'
  if (text.includes('foundation') || text.includes('pit') || text.includes('pile')) return 'foundation'
  if (text.includes('basement') || text.includes('waterproof')) return 'basement'
  if (text.includes('superstructure') || text.includes('structure-core') || text.includes('structure')) return 'superstructure'
  if (text.includes('mep') || text.includes('electrical') || text.includes('hvac') || text.includes('mechanical') || text.includes('plumbing')) return 'mep'
  if (text.includes('facade') || text.includes('curtain')) return 'facade'
  if (text.includes('finishing') || text.includes('fitout') || text.includes('decoration') || text.includes('guestroom')) return 'finishing'
  if (text.includes('commission') || text.includes('validation') || text.includes('handover') || text.includes('elevator')) return 'commissioning'
  if (text.includes('outdoor')) return 'outdoor'
  return 'general'
}



export function readScenarioScheduleProfile(featureProfile: EngineeringFeatureProfile): ProjectScenarioScheduleProfile {
  return resolveScenarioScheduleProfile({
    recommendationPacks: featureProfile.recommendationPacks as WbsTemplateProjectRecommendationKey[],
    facts: {
      businessType: featureProfile.businessType,
      businessSubtype: featureProfile.businessSubtype,
      methodVariantCodes: featureProfile.methodVariantCodes,
      projectTypeCode: featureProfile.projectTypeCode,
      structureTypeCode: featureProfile.structureTypeCode,
      buildingPatternCodes: featureProfile.buildingPatternCodes,
      totalAreaM2: featureProfile.totalAreaM2,
      buildingCount: featureProfile.buildingCount,
      standardFloorCount: featureProfile.standardFloorCount,
      highestBuildingFloorCount: featureProfile.highestBuildingFloorCount,
      basementLevelCount: featureProfile.basementLevelCount,
      basementAreaM2: featureProfile.basementAreaM2,
      foundationDepthM: featureProfile.foundationDepthM,
      prefabRate: featureProfile.prefabRate,
    },
  })
}



export function shouldCompactInferredBuildingsToWorkfacePool(scope: WbsTemplateScope) {
  if (scope.building_sequence_source !== 'inferred_building_count') return false
  if ((scope.building_sequence_total ?? 0) <= 3) return false
  return isLowRiseMultiBuildingParallelProject(buildEngineeringFeatureProfile(scope))
}



export function buildFastTemplateDurationSeedMatchText(
  node: TemplateNode,
  featureProfile: EngineeringFeatureProfile,
) {
  return [
    node.name,
    node.standardWorkName,
    node.standardWorkCode,
    node.stableCode,
    node.engineeringCategoryId,
    node.categoryType,
    featureProfile.projectTypeCode,
    featureProfile.structureTypeCode,
    ...featureProfile.methodVariantCodes,
    ...featureProfile.elementVariantCodes,
  ].map(normalizeId).filter(Boolean).join(' ').toLowerCase()
}



export function stableDurationCacheValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => stableDurationCacheValue(item))
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, stableDurationCacheValue(item)]),
  )
}



export function buildFastTemplateFeatureProfileCacheKey(featureProfile: EngineeringFeatureProfile) {
  return JSON.stringify(stableDurationCacheValue(buildProjectGenerationFactsSnapshot(featureProfile)))
}



export function buildFastTemplateDurationSeedCacheKey(
  node: TemplateNode,
  featureProfile: EngineeringFeatureProfile,
) {
  return JSON.stringify({
    templateNodeId: isBuiltInChinaTemplateId(node.templateId) ? null : node.id,
    stableCode: node.stableCode,
    standardWorkCode: node.standardWorkCode ?? null,
    standardWorkName: node.standardWorkName ?? null,
    templateId: node.templateId,
    categoryType: node.categoryType,
    engineeringCategoryId: node.engineeringCategoryId ?? null,
    projectTypeCode: featureProfile.projectTypeCode,
    structureTypeCode: featureProfile.structureTypeCode,
    methodVariantCodes: featureProfile.methodVariantCodes,
    elementVariantCodes: featureProfile.elementVariantCodes,
    sourcePolicy: featureProfile.algorithmSeedSourcePolicy ?? null,
  })
}



export function buildFastTemplateDurationProjectionCacheKey(
  node: TemplateNode,
  featureProfile: EngineeringFeatureProfile,
) {
  return JSON.stringify({
    seed: buildFastTemplateDurationSeedCacheKey(node, featureProfile),
    featureProfile: buildFastTemplateFeatureProfileCacheKey(featureProfile),
  })
}



export type FastTemplateDescendantDurationScaling = {
  stableCode: string
  scaleBasis: string | null
  quantity: number | null
  defaultQuantity: number | null
  source: string | null
  projectScaleRatio: number | null
  baseline: Record<string, unknown> | null
  factor: number
  baseRecommendedDurationDays: number
  adjustedRecommendedDurationDays: number
}



export type FastTemplateDescendantDurationEstimate = {
  days: number
  usesDurationSeed: boolean
  projectFactScalingApplied: boolean
  projectFactScalingSamples: FastTemplateDescendantDurationScaling[]
}



export function buildBenchmarkPlanReferenceDurationSuggestion(
  node: TemplateNode,
  durationContributionMode: DurationContributionMode,
): GeneratedTemplateDurationSuggestion {
  const effectiveMode = durationContributionMode ?? readNodeDurationContributionMode(node)
  if (!isDurationBearingContributionMode(effectiveMode)) {
    return buildNonDurationTemplateSuggestion(effectiveMode)
  }

  const recommendedDurationDays = readPositiveNumber(node.defaultDurationDays) ?? 1
  const conservativeDurationDays = Math.max(recommendedDurationDays, Math.ceil(recommendedDurationDays * 1.35))

  return withPlanReferenceDurationOutput({
    recommendedDurationDays,
    conservativeDurationDays,
    durationOutputCode: 'contextual_reference',
    contextualReferenceDays: recommendedDurationDays,
    confidenceLevel: 'low',
    confidenceScore: 38,
    forecastSource: 'wbs_template_golden_benchmark:benchmark_plan_reference',
    durationCalibrationSource: 'unavailable',
    durationProvenance: 'unavailable',
    businessReason: 'Golden benchmark replay uses DB-free template duration evidence to validate generated schedule structure.',
    businessReasonCode: 'BENCHMARK_PLAN_REFERENCE_PLACEHOLDER',
    businessReasonCodes: ['BENCHMARK_PLAN_REFERENCE_PLACEHOLDER', 'GOLDEN_BENCHMARK_PLAN_REFERENCE'],
    businessReasonParams: {
      durationSuggestionMode: 'benchmark_plan_reference',
      dbQuerySkipped: true,
      runtimeExecutionFactsSkipped: true,
      seedResolverSkipped: true,
    },
    displaySummary: `Benchmark plan reference ${recommendedDurationDays} days`,
    dataMaturity: 'L0',
    dataMaturityReasons: ['benchmark placeholder used for runtime gate replay without DB-backed duration context'],
    dataUpgradePath: ['golden_benchmark_replay'],
    dataUpgradeBlockedBy: [],
    factorAvailability: {
      benchmark_plan_reference: true,
      db_query_skipped: true,
    },
    durationContributionMode: effectiveMode,
  })!
}



export function buildFloorSeriesLabel(floors: WbsTemplateFloorSequenceInput[]) {
  if (floors.length === 0) return null
  const first = normalizeText(floors[0]?.label ?? floors[0]?.floorLabel ?? floors[0]?.floor_label ?? floors[0]?.name ?? floors[0]?.object_name ?? floors[0]?.floorObjectId ?? floors[0]?.floor_object_id ?? floors[0]?.id)
  const lastFloor = floors[floors.length - 1]
  const last = normalizeText(lastFloor?.label ?? lastFloor?.floorLabel ?? lastFloor?.floor_label ?? lastFloor?.name ?? lastFloor?.object_name ?? lastFloor?.floorObjectId ?? lastFloor?.floor_object_id ?? lastFloor?.id)
  if (floors.length === 1) return first || last || '1 floor'
  return [first || 'first', last || 'last'].join('-')
}



export function buildFloorSeriesMetadata(scope: WbsTemplateScope) {
  const floors = Array.isArray(scope.floor_series) ? scope.floor_series : []
  if (!scope.floor_series_source || floors.length <= 1) return null
  return {
    source: scope.floor_series_source,
    count: scope.floor_series_count ?? floors.length,
    label: scope.floor_series_label ?? buildFloorSeriesLabel(floors),
    objectBinding: floors.some((floor) => normalizeId(floor.floorObjectId ?? floor.floor_object_id ?? floor.id))
      ? 'engineering_object_series'
      : 'inferred_sequence_series',
    floors: floors.map((floor, index) => ({
      index,
      number: index + 1,
      label: normalizeText(floor.label ?? floor.floorLabel ?? floor.floor_label ?? floor.name ?? floor.object_name)
        || normalizeText(floor.floorObjectId ?? floor.floor_object_id ?? floor.id)
        || `F${index + 1}`,
      floorObjectId: normalizeId(floor.floorObjectId ?? floor.floor_object_id ?? floor.id) || null,
      levelNumber: typeof floor.levelNumber === 'number'
        ? floor.levelNumber
        : typeof floor.level_number === 'number'
          ? floor.level_number
          : null,
      isBasement: floor.isBasement === true || floor.is_basement === true,
    })),
  }
}



export function readNodeDurationContributionMode(
  node: TemplateNode,
  context: { planItemKind?: unknown; relationRole?: unknown } = {},
) {
  const metadata = readRecord(node.metadata)
  return normalizeDurationContributionMode(metadata.durationContributionMode ?? metadata.duration_contribution_mode)
    ?? inferDurationContributionMode({
      name: node.standardWorkName ?? node.name,
      metadata,
      planItemKind: context.planItemKind,
      relationRole: context.relationRole,
    })
}



export function isDurationBearingNode(node: TemplateNode) {
  return isDurationBearingContributionMode(readNodeDurationContributionMode(node))
}



export function isInternalFlowAnchorMode(mode: DurationContributionMode | null) {
  return mode === 'duration_bearing' || mode === 'quality_gate' || mode === 'handover_marker'
}



export function getDurationSuggestionKey(scopeIndex: number, node: TemplateNode, elementVariant?: GeneratedElementVariant | null) {
  return `${scopeIndex}:${node.id}:${node.stableCode}:${elementVariant?.code ?? 'base'}`
}



export function collectTemplateNodesById(nodes: TemplateNode[], result = new Map<string, TemplateNode>()) {
  for (const node of nodes) {
    result.set(node.id, node)
    collectTemplateNodesById(node.children, result)
  }
  return result
}



export function withRecommendedDuration(
  suggestion: GeneratedTemplateDurationSuggestion,
  recommendedDurationDays: number,
  reason: string,
): GeneratedTemplateDurationSuggestion {
  const conservativeDurationDays = Math.max(
    recommendedDurationDays,
    readPositiveNumber(suggestion.conservativeDurationDays) ?? Math.ceil(recommendedDurationDays * 1.25),
  )
  return {
    ...suggestion,
    recommendedDurationDays,
    conservativeDurationDays,
    businessReason: suggestion.businessReason
      ? `${suggestion.businessReason}?${reason}`
      : reason,
    displaySummary: suggestion.displaySummary
      ? `${suggestion.displaySummary} ${reason}`
      : `?? ${recommendedDurationDays} ??${reason}?`,
    businessReasonCodes: uniqueStringArray([
      ...(suggestion.businessReasonCodes ?? []),
      'ACTIVITY_STEP_ROLLUP_ALIGNED',
    ]),
    businessReasonParams: {
      ...(suggestion.businessReasonParams ?? {}),
      activityStepRollupAligned: true,
      activityStepRollupDays: recommendedDurationDays,
    },
  }
}



export function buildActivityStepDurationSuggestion(
  parentSuggestion: GeneratedTemplateDurationSuggestion,
  stepDurationDays: number,
  stepIndex: number,
  stepCount: number,
  parentTotalDays: number,
): GeneratedTemplateDurationSuggestion {
  return {
    ...parentSuggestion,
    recommendedDurationDays: stepDurationDays,
    conservativeDurationDays: stepDurationDays,
    forecastSource: `${parentSuggestion.forecastSource}+activity_step_rollup`,
    durationCalibrationSource: parentSuggestion.durationCalibrationSource,
    durationProvenance: parentSuggestion.durationProvenance,
    businessReason: `??? process ???? ${parentTotalDays} ?? ${stepCount} ? activity_step ???? ${stepIndex + 1} ????? ${stepDurationDays} ?`,
    businessReasonCode: 'ACTIVITY_STEP_ROLLUP_ALIGNED',
    businessReasonCodes: uniqueStringArray([
      ...(parentSuggestion.businessReasonCodes ?? []),
      'ACTIVITY_STEP_ROLLUP_ALIGNED',
    ]),
    businessReasonParams: {
      ...(parentSuggestion.businessReasonParams ?? {}),
      parentProcessRecommendedDurationDays: parentTotalDays,
      activityStepIndex: stepIndex,
      activityStepCount: stepCount,
      activityStepDurationDays: stepDurationDays,
    },
    displaySummary: `?? ${stepDurationDays} ????? process ?? ${parentTotalDays} ????activity_step ??? process ?????`,
  }
}



export function buildNonDurationActivityStepSuggestion(
  parentSuggestion: GeneratedTemplateDurationSuggestion,
  mode: ReturnType<typeof readNodeDurationContributionMode>,
): GeneratedTemplateDurationSuggestion {
  const label = describeDurationContributionMode(mode)
  return {
    ...parentSuggestion,
    recommendedDurationDays: null,
    conservativeDurationDays: null,
    forecastSource: `${parentSuggestion.forecastSource}+duration_contribution_mode`,
    durationProvenance: 'unavailable',
    businessReason: `${label}????? process ??????`,
    businessReasonCode: 'NON_DURATION_BEARING_STANDARD_WORK',
    businessReasonCodes: uniqueStringArray([
      ...(parentSuggestion.businessReasonCodes ?? []),
      'NON_DURATION_BEARING_STANDARD_WORK',
    ]),
    businessReasonParams: {
      ...(parentSuggestion.businessReasonParams ?? {}),
      durationContributionMode: mode,
      durationContributionModeLabel: label,
      activityStepRollupExcluded: true,
    },
    displaySummary: `???????${label}????? process ???????`,
    durationContributionMode: mode,
  }
}



export function buildNonDurationTemplateSuggestion(mode: DurationContributionMode): GeneratedTemplateDurationSuggestion {
  const label = describeDurationContributionMode(mode)
  return {
    recommendedDurationDays: null,
    conservativeDurationDays: null,
    confidenceLevel: 'medium',
    confidenceScore: 56,
    forecastSource: 'template_seed:duration_contribution_mode',
    durationCalibrationSource: 'standard_work_duration_seed',
    durationProvenance: 'unavailable',
    businessReason: `${label}，不生成独立参考工期`,
    businessReasonCode: 'NON_DURATION_BEARING_STANDARD_WORK',
    businessReasonCodes: ['NON_DURATION_BEARING_STANDARD_WORK'],
    businessReasonParams: {
      durationContributionMode: mode,
      durationContributionModeLabel: label,
    },
    displaySummary: `暂无参考工期；${label}，不参与普通施工工期计算。`,
    dataMaturity: 'L1',
    dataMaturityReasons: ['governed seed declares a non-duration-bearing contribution mode'],
    dataUpgradePath: [],
    dataUpgradeBlockedBy: [],
    factorAvailability: {
      standard_classification: true,
      standard_work_duration_seed: true,
      duration_contribution_mode: true,
    },
    durationContributionMode: mode,
  }
}



export function codeMatchesReplacementCode(stableCode: string, replacementCode: string) {
  const code = normalizeText(stableCode)
  const replacement = normalizeText(replacementCode)
  return Boolean(code && replacement && (code === replacement || code.startsWith(`${replacement}-`)))
}



export function collectCoreReplacementCodes(nodes: TemplateNode[], scopes: WbsTemplateScope[] = [{}]) {
  const codes: string[] = []
  for (const node of nodes) {
    const matchingScopes = scopes.filter((scope) => nodeMatchesEngineeringFeatureFilters(node, scope))
    if (matchingScopes.length === 0) continue
    const metadata = readRecord(node.metadata)
    if (readRowLikePackType(metadata) !== 'core_quality') {
      codes.push(...readStringArray(metadata.replacesCoreQualityCodes))
    }
    codes.push(...collectCoreReplacementCodes(node.children, matchingScopes))
  }
  return new Set(uniqueStringArray(codes))
}



export function readRowLikePackType(source: Record<string, unknown>): WbsTemplatePackType {
  return (normalizeId(source.packType ?? source.pack_type) || 'core_quality') as WbsTemplatePackType
}



export function isCoreNodeSuppressedByReplacement(node: TemplateNode, replacementCodes?: ReadonlySet<string>) {
  if (!replacementCodes?.size) return false
  const metadata = readRecord(node.metadata)
  if (readRowLikePackType(metadata) !== 'core_quality') return false
  if (!['process', 'activity_step'].includes(node.categoryType)) return false
  return [...replacementCodes].some((code) => codeMatchesReplacementCode(node.stableCode, code))
}



export function getGeneratableChildren(
  node: TemplateNode,
  generationDepth: WbsTemplateGenerationDepth,
  scope: WbsTemplateScope,
  replacementCodes?: ReadonlySet<string>,
) {
  if (isFloorSeriesScope(scope) && isRhythmExpansionEligibleNode(node)) return []
  if (!shouldTraverseNodeChildrenInGeneration(node, generationDepth, scope)) return []
  const childGenerationDepth = getChildGenerationDepth(node, generationDepth, scope)
  return node.children.filter((child) => (
    hasGeneratableRowsForNode(child, childGenerationDepth, scope, replacementCodes)
  ))
}



export function hasGeneratableRowsForNode(
  node: TemplateNode,
  generationDepth: WbsTemplateGenerationDepth,
  scope: WbsTemplateScope,
  replacementCodes?: ReadonlySet<string>,
): boolean {
  if (isCoreNodeSuppressedByReplacement(node, replacementCodes)) return false
  if (!nodeMatchesEngineeringFeatureFilters(node, scope)) return false
  if (shouldSuppressNodeByProjectScopeActualization(node, scope)) return false
  if (isFloorSeriesScope(scope) && isRhythmExpansionEligibleNode(node)) return true
  if (!isManagedFrontierGeneration(generationDepth) && !isWithinGenerationDepth(node, generationDepth)) return false
  if (shouldMaterializeNodeInGeneration(node, generationDepth, scope)) return true
  return getGeneratableChildren(node, generationDepth, scope, replacementCodes).length > 0
}



export function countGeneratedRowsForNode(
  node: TemplateNode,
  generationDepth: WbsTemplateGenerationDepth,
  scope: WbsTemplateScope = {},
  replacementCodes?: ReadonlySet<string>,
): number {
  if (!hasGeneratableRowsForNode(node, generationDepth, scope, replacementCodes)) return 0
  const variants = deriveElementVariantsForGeneration(node, scope)
  const multiplier = variants.length > 0 ? variants.length : 1
  const childGenerationDepth = getChildGenerationDepth(node, generationDepth, scope)
  const childrenCount = getGeneratableChildren(node, generationDepth, scope, replacementCodes)
    .reduce((count, child) => count + countGeneratedRowsForNode(child, childGenerationDepth, scope, replacementCodes), 0)
  const selfCount = shouldMaterializeNodeInGeneration(node, generationDepth, scope) ? 1 : 0
  return multiplier * (selfCount + childrenCount)
}



export function scopePhaseBatchKey(scope: WbsTemplateScope, scopeIndex: number) {
  return normalizeText(scope.phase_object_id) || `scope-${scopeIndex + 1}`
}



export function scopeHasPhaseBatch(scope: WbsTemplateScope) {
  return Boolean(normalizeText(scope.phase_object_id))
}



export function assertGeneratedRowBudget(params: {
  generatedMainPlanRowCount: number
  generatedRowCount: number
  generationBatches: GeneratedTemplateBatch[]
  preflightStage?: string
}) {
  if (params.generatedMainPlanRowCount <= WBS_TEMPLATE_GENERATION_SERVER_ROW_LIMIT) return

  throw Object.assign(
    new Error(
      `WBS template generation would create ${params.generatedMainPlanRowCount} main plan rows, exceeding server limit ${WBS_TEMPLATE_GENERATION_SERVER_ROW_LIMIT}. Split scope or phase batches before generation.`,
    ),
    {
      statusCode: 413,
      code: 'WBS_TEMPLATE_GENERATION_ROW_LIMIT_EXCEEDED',
      details: {
        generatedMainPlanRowCount: params.generatedMainPlanRowCount,
        generatedRowCount: params.generatedRowCount,
        rowLimit: WBS_TEMPLATE_GENERATION_SERVER_ROW_LIMIT,
        ...(params.preflightStage ? { preflightStage: params.preflightStage } : {}),
        generationBatches: params.generationBatches,
      },
    },
  )
}



export function applyMasterPlanProfilePreflightRowLimit(
  generatedMainPlanRowCount: number,
  masterPlanProfile: GeneratedMasterPlanProfile | null,
) {
  if (!masterPlanProfile) return generatedMainPlanRowCount
  const upperLimit = masterPlanProfile.rowCountRange[1]
  if (!Number.isFinite(upperLimit) || upperLimit <= 0) return generatedMainPlanRowCount
  return Math.min(generatedMainPlanRowCount, upperLimit)
}



export function readExplicitScopeCardinality(scopeInput: unknown) {
  const scope = readRecord(scopeInput)
  if (readArray(scope.scope_combos ?? scope.scopeCombos).length > 0) return null
  if (readArray(scope.scope_objects ?? scope.scopeObjects).length > 0) return null
  const phases = readArray(scope.phases ?? scope.phaseIds).map(normalizeText).filter(Boolean)
  if (phases.length > 0) return null

  const buildings = readArray(scope.buildings ?? scope.buildingIds).map(normalizeText).filter(Boolean)
  const floors = readArray(scope.floors ?? scope.floorIds).map(normalizeText).filter(Boolean)
  const explicitFloorSequence = readFloorSequenceItems(scope)
  const physicalZones = readArray(scope.physical_zones ?? scope.physicalZoneIds ?? scope.physical_zone_ids).map(normalizeText).filter(Boolean)
  const dimensions = [
    buildings.length,
    Math.max(floors.length, explicitFloorSequence.length),
    physicalZones.length,
  ].filter((count) => count > 0)

  if (dimensions.length === 0) return null
  return dimensions.reduce((product, count) => product * count, 1)
}



export type DurationSuggestionTarget = {
  node: TemplateNode,
  elementVariant: GeneratedElementVariant | null,
  parentDurationBoundary: ParentDurationBoundaryContext | null,
}



export type ParentDurationBoundaryContext = {
  parentStandardWorkCode: string | null
  parentTaskTitle: string | null
  parentDurationBoundaryPolicy: string
  parentDurationPolicySource: string | null
  parentReferenceDurationDays: number | null
}



export function collectDurationSuggestionTargets(
  node: TemplateNode,
  generationDepth: WbsTemplateGenerationDepth,
  scope: WbsTemplateScope,
  result: DurationSuggestionTarget[] = [],
  inheritedElementVariant: GeneratedElementVariant | null = null,
  parentDurationBoundary: ParentDurationBoundaryContext | null = null,
) {
  if (!hasGeneratableRowsForNode(node, generationDepth, scope)) return result
  const variants = !inheritedElementVariant ? deriveElementVariantsForGeneration(node, scope) : []
  if (variants.length > 0) {
    variants.forEach((variant) => collectDurationSuggestionTargets(node, generationDepth, scope, result, variant, parentDurationBoundary))
    return result
  }

  if (shouldMaterializeNodeInGeneration(node, generationDepth, scope) && isDurationSuggestionNode(node)) {
    result.push({ node, elementVariant: inheritedElementVariant, parentDurationBoundary })
  }
  const childGenerationDepth = getChildGenerationDepth(node, generationDepth, scope)
  const childParentBoundary = resolveChildParentDurationBoundary(node, scope, parentDurationBoundary)
  for (const child of getGeneratableChildren(node, generationDepth, scope)) {
    collectDurationSuggestionTargets(child, childGenerationDepth, scope, result, inheritedElementVariant, childParentBoundary)
  }
  return result
}



export function normalizeParentDurationBoundaryPolicy(value: unknown): string | null {
  const normalized = normalizeText(value).toLowerCase()
  if (
    normalized === 'aggregate_package_window'
    || normalized === 'rhythm_package_window'
    || normalized === 'system_package_window'
    || normalized === 'specialty_package_window'
    || normalized === 'itempack_window'
    || normalized === 'parent_package_window'
  ) {
    return normalized
  }
  return null
}



export function isHardParentDurationBoundaryPolicy(policy: string | null | undefined) {
  return policy === 'rhythm_package_window'
    || policy === 'system_package_window'
    || policy === 'specialty_package_window'
    || policy === 'itempack_window'
    || policy === 'parent_package_window'
}



export function parentWindowBusinessReasonCode(policy: string | null | undefined) {
  return policy === 'rhythm_package_window'
    ? 'STANDARD_FLOOR_RHYTHM_WINDOW'
    : 'PARENT_PACKAGE_DURATION_WINDOW'
}



export function parentWindowPolicySource(_policy: string | null | undefined) {
  return 'template_duration_truth_asset'
}



export function normalizeDurationBoundaryPolicySource(value: unknown) {
  const normalized = normalizeText(value).toLowerCase()
  if (!normalized) return null
  return normalized
}



export function packageChildWindowBusinessReasonCodes(policy: string | null | undefined) {
  return uniqueStringArray([
    'PACKAGE_CHILD_DURATION_WINDOW',
    policy === 'rhythm_package_window' ? 'STANDARD_FLOOR_RHYTHM_CURVE' : null,
  ])
}



export function inferParentDurationBoundaryPolicy(node: TemplateNode): string | null {
  const metadata = readRecord(node.metadata)
  const explicit = normalizeParentDurationBoundaryPolicy(metadata.durationBoundaryPolicy ?? metadata.duration_boundary_policy)
  return explicit
}



export function resolveParentReferenceDurationDays(node: TemplateNode, scope: WbsTemplateScope) {
  const metadata = readRecord(node.metadata)
  const policy = inferParentDurationBoundaryPolicy(node)
  const series = buildFloorRhythmSeriesAdjustment(node, scope)
  const curveDays = readFloorCurveDays(readFloorDurationCurve(metadata, scope), scope.floor_sequence_position)
  if (policy === 'rhythm_package_window') {
    if (series?.totalDays) return series.totalDays
    if (curveDays) return curveDays
  }
  const explicit = readPositiveNumber(
    metadata.referenceDurationDays
    ?? metadata.reference_duration_days
    ?? metadata.smartReferenceDays
    ?? metadata.smart_reference_days,
  )
  if (explicit) return explicit
  if (series?.totalDays) return series.totalDays
  return curveDays ?? readPositiveNumber(node.defaultDurationDays)
}



export function resolveChildParentDurationBoundary(
  node: TemplateNode,
  scope: WbsTemplateScope,
  inherited: ParentDurationBoundaryContext | null,
): ParentDurationBoundaryContext | null {
  const policy = inferParentDurationBoundaryPolicy(node)
  if (!policy) return inherited
  if (!isHardParentDurationBoundaryPolicy(policy)) return inherited
  const metadata = readRecord(node.metadata)
  return {
    parentStandardWorkCode: node.standardWorkCode ?? node.stableCode ?? null,
    parentTaskTitle: node.standardWorkName ?? node.name ?? null,
    parentDurationBoundaryPolicy: policy,
    parentDurationPolicySource: normalizeDurationBoundaryPolicySource(metadata.durationBoundaryPolicySource ?? metadata.duration_boundary_policy_source)
      || parentWindowPolicySource(policy),
    parentReferenceDurationDays: resolveParentReferenceDurationDays(node, scope),
  }
}



export function serializeDurationSuggestion(suggestion: DurationSuggestion): GeneratedTemplateDurationSuggestion {
  return {
    recommendedDurationDays: suggestion.recommendedDurationDays,
    conservativeDurationDays: suggestion.conservativeDurationDays,
    durationOutputCode: suggestion.durationOutputCode ?? null,
    durationOutputSemanticFieldName: suggestion.durationOutputSemanticFieldName ?? null,
    durationOutputContract: readRecord(suggestion.durationOutputContract ?? suggestion.calculationContext?.durationOutputContract),
    templateFastEstimateDays: null,
    planReferenceDays: suggestion.planReferenceDays ?? null,
    contextualReferenceDays: suggestion.contextualReferenceDays ?? null,
    remainingForecastDays: suggestion.remainingForecastDays ?? null,
    phaseWindowDays: suggestion.phaseWindowDays ?? null,
    accelerationTargetDays: suggestion.accelerationTargetDays ?? null,
    confidenceLevel: suggestion.confidenceLevel,
    confidenceScore: suggestion.confidenceScore,
    forecastSource: suggestion.forecastSource,
    durationCalibrationSource: suggestion.durationCalibrationSource,
    durationProvenance: suggestion.durationProvenance,
    businessReason: suggestion.businessReason,
    businessReasonCode: suggestion.businessReasonCode ?? null,
    businessReasonCodes: suggestion.businessReasonCodes ?? [],
    businessReasonParams: suggestion.businessReasonParams ?? null,
    displaySummary: suggestion.displaySummary ?? null,
    dataMaturity: suggestion.dataMaturity,
    dataMaturityReasons: suggestion.dataMaturityReasons ?? [],
    dataUpgradePath: suggestion.dataUpgradePath ?? [],
    dataUpgradeBlockedBy: suggestion.dataUpgradeBlockedBy ?? [],
    factorAvailability: suggestion.factorAvailability ?? {},
    durationContributionMode: suggestion.durationContributionMode ?? null,
    durationBoundaryRole: suggestion.durationBoundaryRole ?? null,
    parentDurationBoundaryPolicy: suggestion.parentDurationBoundaryPolicy ?? null,
    nonAdditiveWithParentDuration: suggestion.nonAdditiveWithParentDuration ?? false,
    parentReferenceDurationDays: suggestion.parentReferenceDurationDays ?? null,
    parentTaskTitle: suggestion.parentTaskTitle ?? null,
    independentReferenceDurationDays: suggestion.independentReferenceDurationDays ?? null,
    packageChildPlanDurationDays: suggestion.packageChildPlanDurationDays ?? null,
    planDurationTruthSource: suggestion.planDurationTruthSource ?? null,
    packageChildRhythmWindowStartDay: suggestion.packageChildRhythmWindowStartDay ?? null,
    packageChildRhythmWindowEndDay: suggestion.packageChildRhythmWindowEndDay ?? null,
    packageChildRhythmWindowRole: suggestion.packageChildRhythmWindowRole ?? null,
  }
}



export function shouldUseDescendantRollupForDurationSuggestion(
  node: TemplateNode,
  suggestion: GeneratedTemplateDurationSuggestion,
) {
  if (node.categoryType !== 'item_work') return false
  if (node.children.length === 0) return false
  if (!isDurationBearingContributionMode(readNodeDurationContributionMode(node))) return false
  const reasonParams = readRecord(suggestion.businessReasonParams)
  const factorAvailability = suggestion.factorAvailability ?? {}
  const seedSource = normalizeText(reasonParams.seedSource).toLowerCase()
  return reasonParams.seedVariantFallback === true
    || suggestion.businessReasonCode === 'STANDARD_SEED_VARIANT_FALLBACK'
    || (
      factorAvailability.standard_work_duration_seed === true
      && factorAvailability.seed_variant_specific_match === false
      && seedSource.includes('fallback')
    )
}



export function shouldUseManagedFrontierDescendantRollup(
  node: TemplateNode,
  generationDepth: WbsTemplateGenerationDepth,
  scope: WbsTemplateScope,
) {
  if (!isManagedFrontierGeneration(generationDepth)) return false
  if (!shouldMaterializeNodeInGeneration(node, generationDepth, scope)) return false
  if (node.children.length === 0) return false
  if (!isDurationBearingContributionMode(readNodeDurationContributionMode(node))) return false
  const policy = resolveGenerationDepthPolicyForNode(node)
  return GENERATION_DEPTH_RANK[policy.durationComputeDepth] > GENERATION_DEPTH_RANK[policy.materializeDepth]
}



export function readContextualDescendantRollupCompression(featureProfile: EngineeringFeatureProfile) {
  const executionProfile = readExecutionProfileFromProjectFacts(featureProfile)
  if (executionProfileHasArchetype(executionProfile, 'mic_modular_fast_track')) {
    return {
      factor: 0.8,
      profile: 'mic_modular_factory_pipeline_rollup',
      reason: 'MiC/module factory-site pipeline compresses process-child rollup windows instead of treating all child processes as a fully serial onsite chain.',
    }
  }
  return null
}



export function readFastTrackDescendantNetworkTailFactor(
  featureProfile: EngineeringFeatureProfile,
  phaseKind: ConstructionSchedulePhaseKind,
) {
  const executionProfile = readExecutionProfileFromProjectFacts(featureProfile)
  if (executionProfileHasArchetype(executionProfile, 'mic_modular_fast_track')) {
    return phaseKind === 'commissioning'
      ? 0.18
      : phaseKind === 'mep'
        ? 0.12
        : phaseKind === 'finishing' || phaseKind === 'facade'
          ? 0.1
          : 0.04
  }
  if (executionProfileHasArchetype(executionProfile, 'steel_assembly_fast_track')) {
    return phaseKind === 'commissioning'
      ? 0.28
      : phaseKind === 'mep'
        ? 0.22
        : phaseKind === 'finishing' || phaseKind === 'facade'
          ? 0.18
          : 0.16
  }
  return null
}



export function isSequentialModularItemPackProcessChain(
  node: TemplateNode,
  childDurations: Array<{ child: TemplateNode }>,
) {
  return node.categoryType === 'item_work'
    && normalizeText(node.stableCode).toUpperCase().startsWith('MIC-')
    && childDurations.length > 1
    && childDurations.every(({ child }) => child.categoryType === 'process')
}



export function findAncestorNode(
  node: TemplateNode,
  nodeById: Map<string, TemplateNode>,
  predicate: (candidate: TemplateNode) => boolean,
) {
  let current: TemplateNode | null = node
  const visited = new Set<string>()
  while (current && !visited.has(current.id)) {
    if (predicate(current)) return current
    visited.add(current.id)
    current = current.parentId ? nodeById.get(current.parentId) ?? null : null
  }
  return null
}



export function normalizeFloorMethodCode(value: unknown) {
  const code = normalizeText(value).toLowerCase()
  if (code === 'aluminum_formwork') return 'aluminum_form_early_strip'
  if (code === 'large_formwork') return 'large_form'
  if (code === 'wood_formwork') return 'wood_form'
  if (code === 'climbing_formwork') return 'climbing_form'
  return code
}



export function readFloorDurationCurve(metadata: Record<string, unknown>, scope: WbsTemplateScope): Record<string, unknown> | null {
  const byMethod = readRecord(metadata.floorDurationCurveByMethod ?? metadata.floor_duration_curve_by_method)
  const methodCodes = uniqueStringArray([
    ...(scope.method_variant_codes ?? []),
    'default',
  ].map((item) => normalizeFloorMethodCode(item)))
  for (const methodCode of methodCodes) {
    const curve = readRecord(byMethod[methodCode] ?? byMethod[normalizeFloorMethodCode(methodCode)])
    if (Object.keys(curve).length > 0) return curve
  }

  const fallback = readRecord(metadata.floorDurationCurve ?? metadata.floor_duration_curve)
  return Object.keys(fallback).length > 0 ? fallback : null
}



export function readFloorCurveDays(curve: Record<string, unknown> | null, position: WbsTemplateScope['floor_sequence_position']) {
  if (!curve || !position) return null
  const candidates = position === 'first'
    ? [curve.firstFloor, curve.first_floor, curve.first]
    : position === 'last'
      ? [curve.lastFloors, curve.last_floor, curve.last, curve.topFloor, curve.top_floor, curve.top]
      : position === 'single'
        ? [curve.singleFloor, curve.single_floor, curve.midFloors, curve.mid_floors, curve.middle, curve.standard]
        : [curve.midFloors, curve.mid_floors, curve.middleFloors, curve.middle_floors, curve.middle, curve.standard]
  for (const value of candidates) {
    const days = readPositiveNumber(value)
    if (days) return days
  }
  return null
}



export function readFloorCurveDaysForIndex(curve: Record<string, unknown> | null, index: number, total: number) {
  return readFloorCurveDays(curve, buildFloorSequenceScope(index, total, 'explicit_floor_array').floor_sequence_position)
}



export function buildFloorRhythmSeriesAdjustment(
  node: TemplateNode,
  scope: WbsTemplateScope,
): { adjustment: Record<string, unknown>; totalDays: number } | null {
  const floors = Array.isArray(scope.floor_series) ? scope.floor_series : []
  if (!isFloorSeriesScope(scope) || floors.length <= 1) return null
  const metadata = readRecord(node.metadata)
  const curve = readFloorDurationCurve(metadata, scope)
  if (!curve) return null
  const floorDurationDays = floors.map((_, index) => readFloorCurveDaysForIndex(curve, index, floors.length) ?? 1)
  const totalDays = floorDurationDays.reduce((sum, days) => sum + Math.max(1, days), 0)
  return {
    totalDays,
    adjustment: {
      source: 'template_duration_truth_asset',
      adjustmentKind: 'floor_duration_curve_series',
      durationSeedStableCode: null,
      durationSeedScope: 'itempack_floor_rhythm_series',
      rhythmPatternCode: normalizeText(metadata.rhythmPatternCode ?? metadata.rhythm_pattern_code) || null,
      rhythmNodeStableCode: node.stableCode,
      stableCode: node.stableCode,
      scopeExpansionMode: 'building_rhythm_series',
      workfaceInstanceMode: 'floor_cycle_matrix',
      floorCount: floors.length,
      floorSeriesLabel: scope.floor_series_label ?? buildFloorSeriesLabel(floors),
      totalRhythmDurationDays: totalDays,
      floorDurationCurve: curve,
      floorDurationDays,
      floors: floors.map((floor, index) => ({
        index,
        number: index + 1,
        label: normalizeText(floor.label ?? floor.floorLabel ?? floor.floor_label ?? floor.name ?? floor.object_name)
          || normalizeText(floor.floorObjectId ?? floor.floor_object_id ?? floor.id)
          || `F${index + 1}`,
        floorObjectId: normalizeId(floor.floorObjectId ?? floor.floor_object_id ?? floor.id) || null,
        durationDays: floorDurationDays[index],
        position: buildFloorSequenceScope(index, floors.length, 'explicit_floor_array').floor_sequence_position,
      })),
    },
  }
}



export function findFloorRhythmNode(node: TemplateNode, nodeById: Map<string, TemplateNode>, scope: WbsTemplateScope) {
  if (!scope.floor_sequence_position || !scope.floor_sequence_total) return null
  return findAncestorNode(node, nodeById, (candidate) => {
    const metadata = readRecord(candidate.metadata)
    const curve = readFloorDurationCurve(metadata, scope)
    return Boolean(curve && readFloorCurveDays(curve, scope.floor_sequence_position))
  })
}



export function allocateIntegerDurations(originalDurations: number[], targetTotal: number) {
  if (originalDurations.length === 0) return []
  const normalizedTarget = Math.max(originalDurations.length, Math.round(targetTotal))
  const originalTotal = originalDurations.reduce((sum, value) => sum + Math.max(1, value), 0)
  if (originalTotal <= 0) return originalDurations.map(() => 1)

  const raw = originalDurations.map((value) => Math.max(1, value) / originalTotal * normalizedTarget)
  const allocation = raw.map((value) => Math.max(1, Math.floor(value)))
  let sum = allocation.reduce((total, value) => total + value, 0)

  while (sum > normalizedTarget) {
    const index = allocation
      .map((value, itemIndex) => ({ value, itemIndex, fraction: raw[itemIndex] - Math.floor(raw[itemIndex]) }))
      .filter((item) => item.value > 1)
      .sort((left, right) => left.fraction - right.fraction || right.value - left.value)[0]?.itemIndex
    if (index === undefined) break
    allocation[index] -= 1
    sum -= 1
  }

  while (sum < normalizedTarget) {
    const index = raw
      .map((value, itemIndex) => ({ itemIndex, fraction: value - Math.floor(value) }))
      .sort((left, right) => right.fraction - left.fraction)[0]?.itemIndex ?? 0
    allocation[index] += 1
    sum += 1
  }

  return allocation
}



export function withPackageChildRhythmWindowSuggestion(
  suggestion: GeneratedTemplateDurationSuggestion,
  target: DurationSuggestionTarget,
  parentWindowDays: number,
  window: NonNullable<ReturnType<typeof resolvePackageChildRhythmWindow>>,
  rhythmMetadata: Record<string, unknown>,
  originalDurationDays: number,
): GeneratedTemplateDurationSuggestion {
  const params = {
    ...(suggestion.businessReasonParams ?? {}),
    parentStandardWorkCode: target.parentDurationBoundary?.parentStandardWorkCode ?? null,
    parentTaskTitle: target.parentDurationBoundary?.parentTaskTitle ?? null,
    parentDurationBoundaryPolicy: target.parentDurationBoundary?.parentDurationBoundaryPolicy ?? null,
    parentDurationPolicySource: target.parentDurationBoundary?.parentDurationPolicySource ?? null,
    parentReferenceDurationDays: parentWindowDays,
    independentReferenceDurationDays: suggestion.independentReferenceDurationDays ?? originalDurationDays,
    independentConservativeDurationDays: suggestion.conservativeDurationDays ?? null,
    packageChildPlanDurationDays: window.durationDays,
    packageChildConservativeDurationDays: window.durationDays,
    packageChildRhythmWindowApplied: true,
    rhythmWindowStartDay: window.startDay,
    rhythmWindowEndDay: window.endDay,
    rhythmWindowRole: window.role,
    rhythmWindowSource: window.source,
    rhythmWindowConfidence: window.confidence,
    planDurationTruthSource: 'parent_package_rhythm_window',
    nonAdditiveWithParentDuration: true,
  }
  const displaySummary = `参考工期 ${window.durationDays} 天（第 ${window.startDay}-${window.endDay} 天），已纳入父级节拍 ${parentWindowDays} 天计划窗口；计划表以父级包窗口为约束。`
  return {
    ...suggestion,
    recommendedDurationDays: window.durationDays,
    conservativeDurationDays: window.durationDays,
    businessReason: [
      suggestion.businessReason,
      '该工序位于父级包内，参考工期来自包内排布；独立工序标准工期仅保留为审计依据',
    ].map(normalizeText).filter(Boolean).join('；'),
    businessReasonCode: 'PACKAGE_CHILD_DURATION_WINDOW',
    businessReasonCodes: uniqueStringArray([
      ...(suggestion.businessReasonCodes ?? []),
      ...packageChildWindowBusinessReasonCodes(target.parentDurationBoundary?.parentDurationBoundaryPolicy),
    ]),
    businessReasonParams: params,
    displaySummary: [
      suggestion.displaySummary,
      displaySummary,
    ].map(normalizeText).filter(Boolean).join(' | '),
    factorAvailability: {
      ...(suggestion.factorAvailability ?? {}),
      parent_duration_boundary: true,
      package_child_duration_window: true,
      parent_package_window_plan_truth: true,
      package_child_rhythm_window: true,
      standard_floor_rhythm_curve: target.parentDurationBoundary?.parentDurationBoundaryPolicy === 'rhythm_package_window',
    },
    forecastSource: `${suggestion.forecastSource}${suggestion.forecastSource.includes('package_child_rhythm_window') ? '' : '+package_child_rhythm_window'}`,
    floorRhythmAdjustment: {
      source: 'template_duration_truth_asset',
      adjustmentKind: 'floor_duration_curve',
      allocationPolicy: 'overlapped_package_child_rhythm_window',
      rhythmPatternCode: normalizeText(rhythmMetadata.rhythmPatternCode ?? rhythmMetadata.rhythm_pattern_code) || null,
      rhythmNodeStableCode: normalizeText(rhythmMetadata.stableCode) || target.parentDurationBoundary?.parentStandardWorkCode || null,
      floorCurveDays: parentWindowDays,
      originalDurationDays,
      adjustedDurationDays: window.durationDays,
      rhythmWindowStartDay: window.startDay,
      rhythmWindowEndDay: window.endDay,
      rhythmWindowRole: window.role,
      rhythmWindowSource: window.source,
      rhythmWindowConfidence: window.confidence,
      independentReferenceDurationDays: suggestion.independentReferenceDurationDays ?? originalDurationDays,
    },
    durationBoundaryRole: 'package_child_window',
    parentDurationBoundaryPolicy: target.parentDurationBoundary?.parentDurationBoundaryPolicy ?? suggestion.parentDurationBoundaryPolicy ?? null,
    nonAdditiveWithParentDuration: true,
    parentReferenceDurationDays: parentWindowDays,
    parentTaskTitle: target.parentDurationBoundary?.parentTaskTitle ?? suggestion.parentTaskTitle ?? null,
    independentReferenceDurationDays: suggestion.independentReferenceDurationDays ?? originalDurationDays,
    packageChildPlanDurationDays: window.durationDays,
    planDurationTruthSource: 'parent_package_rhythm_window',
    packageChildRhythmWindowStartDay: window.startDay,
    packageChildRhythmWindowEndDay: window.endDay,
    packageChildRhythmWindowRole: window.role,
  }
}



export function applyFloorRhythmCurvesToSuggestionMap(params: {
  suggestions: Map<string, GeneratedTemplateDurationSuggestion>
  targetsByScope: Array<{ scope: WbsTemplateScope; scopeIndex: number; targets: DurationSuggestionTarget[] }>
  nodeById: Map<string, TemplateNode>
}) {
  for (const { scope, scopeIndex, targets } of params.targetsByScope) {
    if (scope.floor_sequence_source !== 'explicit_floor_array' && scope.floor_sequence_source !== 'inferred_floor_count') continue

    const groups = new Map<string, { rhythmNode: TemplateNode; curveDays: number; targets: DurationSuggestionTarget[] }>()
    for (const target of targets) {
      if (target.node.categoryType !== 'process') continue
      const rhythmNode = findFloorRhythmNode(target.node, params.nodeById, scope)
      if (!rhythmNode) continue
      const curve = readFloorDurationCurve(readRecord(rhythmNode.metadata), scope)
      const curveDays = readFloorCurveDays(curve, scope.floor_sequence_position)
      if (!curveDays) continue
      const key = `${scopeIndex}:${rhythmNode.id}:${target.elementVariant?.code ?? 'base'}`
      const group = groups.get(key) ?? { rhythmNode, curveDays, targets: [] }
      group.targets.push(target)
      groups.set(key, group)
    }

    for (const group of groups.values()) {
      const parentBoundaryPolicy = inferParentDurationBoundaryPolicy(group.rhythmNode)
      const hasParentPackageWindowTruth = isHardParentDurationBoundaryPolicy(parentBoundaryPolicy)
      const durationTargets = group.targets.filter((target) => {
        const suggestion = params.suggestions.get(getDurationSuggestionKey(scopeIndex, target.node, target.elementVariant))
        const mode = normalizeDurationContributionMode(suggestion?.durationContributionMode)
        return Boolean(suggestion?.recommendedDurationDays && (!mode || isDurationBearingContributionMode(mode)))
      })
      if (durationTargets.length === 0) continue

      const originalDurations = durationTargets.map((target) => (
        Math.max(1, Math.round(
          params.suggestions.get(getDurationSuggestionKey(scopeIndex, target.node, target.elementVariant))?.recommendedDurationDays ?? 1,
        ))
      ))
      const originalTotal = originalDurations.reduce((sum, value) => sum + value, 0)
      const allocatedDurations = allocateIntegerDurations(originalDurations, group.curveDays)

      durationTargets.forEach((target, targetIndex) => {
        const suggestionKey = getDurationSuggestionKey(scopeIndex, target.node, target.elementVariant)
        const suggestion = params.suggestions.get(suggestionKey)
        if (!suggestion) return

        const rhythmMetadata: Record<string, unknown> = {
          ...readRecord(group.rhythmNode.metadata),
          stableCode: group.rhythmNode.stableCode,
        }
        const originalDurationDays = originalDurations[targetIndex]
        const rhythmWindow = hasParentPackageWindowTruth
          ? resolvePackageChildRhythmWindow({
              taskTitle: target.node.standardWorkName ?? target.node.name,
              standardWorkCode: target.node.standardWorkCode ?? target.node.stableCode,
              parentStandardWorkCode: group.rhythmNode.standardWorkCode ?? group.rhythmNode.stableCode,
              parentDurationBoundaryPolicy: parentBoundaryPolicy,
              parentReferenceDurationDays: group.curveDays,
              metadata: readRecord(target.node.metadata),
            })
          : null
        if (rhythmWindow) {
          params.suggestions.set(
            suggestionKey,
            withPackageChildRhythmWindowSuggestion(
              suggestion,
              {
                ...target,
                parentDurationBoundary: target.parentDurationBoundary ?? {
                  parentStandardWorkCode: group.rhythmNode.standardWorkCode ?? group.rhythmNode.stableCode,
                  parentTaskTitle: group.rhythmNode.standardWorkName ?? group.rhythmNode.name,
                  parentDurationBoundaryPolicy: parentBoundaryPolicy!,
                  parentDurationPolicySource: parentWindowPolicySource(parentBoundaryPolicy),
                  parentReferenceDurationDays: group.curveDays,
                },
              },
              group.curveDays,
              rhythmWindow,
              rhythmMetadata,
              originalDurationDays,
            ),
          )
          return
        }

        const recommendedDurationDays = allocatedDurations[targetIndex]
        const conservativeScale = originalDurations[targetIndex] > 0 ? recommendedDurationDays / originalDurations[targetIndex] : 1
        const conservativeDurationDays = Math.max(
          recommendedDurationDays,
          Math.round((suggestion.conservativeDurationDays ?? suggestion.recommendedDurationDays ?? recommendedDurationDays) * conservativeScale),
        )
        const floorRhythmAdjustment = {
          source: 'template_duration_truth_asset',
          adjustmentKind: 'floor_duration_curve',
          rhythmPatternCode: normalizeText(rhythmMetadata.rhythmPatternCode ?? rhythmMetadata.rhythm_pattern_code) || null,
          rhythmNodeStableCode: group.rhythmNode.stableCode,
          floorSequenceNumber: scope.floor_sequence_number,
          floorSequenceTotal: scope.floor_sequence_total,
          floorSequencePosition: scope.floor_sequence_position,
          floorCurveDays: group.curveDays,
          originalGroupDurationDays: originalTotal,
          adjustedGroupDurationDays: allocatedDurations.reduce((sum, value) => sum + value, 0),
          originalDurationDays: originalDurations[targetIndex],
          adjustedDurationDays: recommendedDurationDays,
        }

        params.suggestions.set(suggestionKey, {
          ...suggestion,
          recommendedDurationDays,
          conservativeDurationDays,
          businessReasonCode: suggestion.businessReasonCode ?? 'STANDARD_FLOOR_RHYTHM_CURVE',
          businessReasonCodes: uniqueStringArray([
            ...(suggestion.businessReasonCodes ?? []),
            'STANDARD_FLOOR_RHYTHM_CURVE',
          ]),
          displaySummary: [
            suggestion.displaySummary,
            `Standard floor ${scope.floor_sequence_number}/${scope.floor_sequence_total}: ${group.curveDays} day rhythm allocation`,
          ].map(normalizeText).filter(Boolean).join(' | '),
          factorAvailability: {
            ...(suggestion.factorAvailability ?? {}),
            standard_floor_rhythm_curve: true,
          },
          floorRhythmAdjustment,
        })
      })
    }
  }
}



export function applyExplicitParentPackageWindowsToSuggestionMap(params: {
  suggestions: Map<string, GeneratedTemplateDurationSuggestion>
  targetsByScope: Array<{ scope: WbsTemplateScope; scopeIndex: number; targets: DurationSuggestionTarget[] }>
}) {
  for (const { scopeIndex, targets } of params.targetsByScope) {
    for (const target of targets) {
      if (target.node.categoryType !== 'process') continue
      const boundary = target.parentDurationBoundary
      if (!boundary || !isHardParentDurationBoundaryPolicy(boundary.parentDurationBoundaryPolicy)) continue
      if (boundary.parentDurationBoundaryPolicy === 'rhythm_package_window') continue
      const parentWindowDays = readPositiveNumber(boundary.parentReferenceDurationDays)
      if (!parentWindowDays) continue
      const suggestionKey = getDurationSuggestionKey(scopeIndex, target.node, target.elementVariant)
      const suggestion = params.suggestions.get(suggestionKey)
      if (!suggestion) continue

      const rhythmWindow = resolvePackageChildRhythmWindow({
        taskTitle: target.node.standardWorkName ?? target.node.name,
        standardWorkCode: target.node.standardWorkCode ?? target.node.stableCode,
        parentStandardWorkCode: boundary.parentStandardWorkCode,
        parentDurationBoundaryPolicy: boundary.parentDurationBoundaryPolicy,
        parentReferenceDurationDays: parentWindowDays,
        metadata: readRecord(target.node.metadata),
      })
      if (!rhythmWindow) continue
      const originalDurationDays = Math.max(1, Math.round(suggestion.recommendedDurationDays ?? rhythmWindow.durationDays))

      params.suggestions.set(
        suggestionKey,
        withPackageChildRhythmWindowSuggestion(
          suggestion,
          target,
          parentWindowDays,
          rhythmWindow,
          {
            source: parentWindowPolicySource(boundary.parentDurationBoundaryPolicy),
            stableCode: boundary.parentStandardWorkCode,
          },
          originalDurationDays,
        ),
      )
    }
  }
}



export function findFirstFloorRhythmNode(nodes: TemplateNode[], scope: WbsTemplateScope): TemplateNode | null {
  for (const node of nodes) {
    const metadata = readRecord(node.metadata)
    const curve = readFloorDurationCurve(metadata, scope)
    if (curve && readFloorCurveDays(curve, scope.floor_sequence_position)) return node
    const child = findFirstFloorRhythmNode(node.children ?? [], scope)
    if (child) return child
  }
  return null
}



export function buildScopeStartDateByIndex(params: {
  selectedNodes: TemplateNode[]
  scopeCombos: WbsTemplateScope[]
  startDate: string
}) {
  const result = new Map<number, string>()
  params.scopeCombos.forEach((scope, scopeIndex) => {
    let offsetDays = 0
    if (
      scope.building_sequence_source === 'inferred_building_count'
      && scope.building_sequence_index != null
      && scope.building_sequence_index > 0
    ) {
      const profile = buildEngineeringFeatureProfile(scope)
      const floorCount = readOptionalNumber(profile.standardFloorCount)
        ?? readOptionalNumber(profile.highestBuildingFloorCount)
        ?? scope.floor_series_count
        ?? 0
      const buildingStaggerDays = floorCount >= 30 ? 30 : floorCount >= 18 ? 21 : 14
      offsetDays += scope.building_sequence_index * buildingStaggerDays
    }
    if ((scope.floor_sequence_source !== 'explicit_floor_array' && scope.floor_sequence_source !== 'inferred_floor_count') || scope.floor_sequence_index === null || scope.floor_sequence_index === undefined) {
      result.set(scopeIndex, offsetDays > 0 ? addDays(params.startDate, offsetDays) : params.startDate)
      return
    }
    const rhythmNode = findFirstFloorRhythmNode(params.selectedNodes, scope)
    if (!rhythmNode) {
      result.set(scopeIndex, offsetDays > 0 ? addDays(params.startDate, offsetDays) : params.startDate)
      return
    }
    for (let index = 0; index < scope.floor_sequence_index; index += 1) {
      const previousScope = {
        ...scope,
        ...buildFloorSequenceScope(index, scope.floor_sequence_total ?? 0, scope.floor_sequence_source),
      }
      const curve = readFloorDurationCurve(readRecord(rhythmNode.metadata), previousScope)
      offsetDays += readFloorCurveDays(curve, previousScope.floor_sequence_position) ?? 0
    }
    result.set(scopeIndex, offsetDays > 0 ? addDays(params.startDate, offsetDays) : params.startDate)
  })
  return result
}



export function readDurationDaysForNode(
  node: TemplateNode,
  scopeIndex: number,
  suggestionByNodeKey: Map<string, GeneratedTemplateDurationSuggestion>,
  elementVariant?: GeneratedElementVariant | null,
  scope?: WbsTemplateScope,
) {
  const suggestion = suggestionByNodeKey.get(getDurationSuggestionKey(scopeIndex, node, elementVariant))
  const suggestionMode = normalizeDurationContributionMode(suggestion?.durationContributionMode)
  if (suggestionMode && !isDurationBearingContributionMode(suggestionMode)) return 0
  if (!isDurationBearingNode(node)) return 0
  if (node.categoryType === 'item_work' && scope) {
    const parentWindowDays = resolveParentReferenceDurationDays(node, scope)
    if (parentWindowDays && isHardParentDurationBoundaryPolicy(inferParentDurationBoundaryPolicy(node))) {
      return parentWindowDays
    }
  }
  return Math.max(1, suggestion?.recommendedDurationDays ?? 1)
}



export function readPackageChildRhythmWindowFromSuggestion(
  suggestion: GeneratedTemplateDurationSuggestion | null | undefined,
) {
  if (suggestion?.planDurationTruthSource !== 'parent_package_rhythm_window') return null
  const params = readRecord(suggestion.businessReasonParams)
  const startDay = readPositiveNumber(suggestion.packageChildRhythmWindowStartDay ?? params.rhythmWindowStartDay)
  const endDay = readPositiveNumber(suggestion.packageChildRhythmWindowEndDay ?? params.rhythmWindowEndDay)
  if (!startDay || !endDay) return null
  return {
    startDay,
    endDay: Math.max(startDay, endDay),
  }
}



export function getPackageChildRhythmWindow(
  scopeIndex: number,
  node: TemplateNode,
  suggestionByNodeKey: Map<string, GeneratedTemplateDurationSuggestion>,
  elementVariant?: GeneratedElementVariant | null,
) {
  return readPackageChildRhythmWindowFromSuggestion(
    suggestionByNodeKey.get(getDurationSuggestionKey(scopeIndex, node, elementVariant)),
  )
}
