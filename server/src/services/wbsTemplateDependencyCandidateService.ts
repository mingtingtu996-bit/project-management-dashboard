import {
type ResolveDurationLearningRuntimePublicationResult
} from './durationLearningRuntimePublicationService.js'
import { signedDurationDayDelta } from '../utils/durationDays.js'
import type { PlanningTableOperation } from '../types/planningTable.js'
import {
type WbsTemplateGenerationPolicy,
type WbsTemplateDomainGroup,
type WbsTemplatePackType
} from '../seeds/domainWbsTemplateCatalogs.js'
import {
findV1474ProcessConstraint,
type V1474ProcessConstraintRule,
} from '../seeds/v1474ProcessConstraintSeed.js'
import {
inspectV1475DependencyIntentTemplates,type V1475DependencyIntentTemplate
} from '../seeds/v1475DependencyIntentTemplates.js'
import {
V1475_CROSS_ITEM_WORKFLOW_SEED,
type V1475CrossItemWorkflowRule,
} from '../seeds/v1475CrossItemWorkflowSeed.js'
import {
isDurationBearingContributionMode,
normalizeDurationContributionMode,
type DurationContributionMode
} from '../seeds/durationContributionMode.js'
import {
type WbsGenerationDepthPolicy
} from '../seeds/wbsGenerationDepthPolicySeed.js'
import {
resolveProjectConstructionOrganizationPolicy
} from '../seeds/projectConstructionOrganizationPolicySeed.js'
import {
buildConstructionOrganizationSelectorInputFromProjectFacts,
selectConstructionOrganizationScenario,type ConstructionOrganizationScenarioSelection
} from './constructionOrganizationScenarioSelector.js'
import {
projectConstructionOrganizationSelectionToGeneratedRows,
type ConstructionOrganizationGeneratedRowProjectionInputRow,
} from './constructionOrganizationPlanOptionProjectionService.js'
import {
inferControlRoles
} from '../seeds/controlRoles.js'
import {
inferExecutionNature,
normalizeExecutionNature
} from '../seeds/executionNature.js'
import {
addPlanDays as addDays,
applyWbsPlanRollupToRows,inclusivePlanDuration as daysInclusive,
type WbsPlanRollupResult
} from './wbsPlanRollupService.js'
import {
effectiveConstructionCalendarBasis,
effectiveConstructionCalendarWindowCount,
isAuthoritativeConstructionCalendar,parseConstructionCalendarDate,
productionDaysBetweenInclusive,type ConstructionCalendarContext
} from './constructionCalendar.js'
import { buildWbsTaskStructureGovernanceMetadata } from './wbsTaskStructureGovernancePipelineService.js'
import {
evaluateBaselineTargetAlignment,
type ScheduleAccelerationMode
} from './scheduleAccelerationService.js'
import { buildProjectGenerationFactsSnapshot } from './projectGenerationFactsSnapshotService.js'
import { TASK_SCOPE_OBJECT_ID_KEY_BY_OBJECT_TYPE } from '../types/db.js'

import {
GENERATION_DEPTH_RANK,
PROJECT_SCOPE_ACTUALIZATION_RESOURCE_POLICY,
TEMPLATE_GENERATION_FORBIDDEN_TASK_CODE_FIELDS,
addTemplateProductionDayOffset,
addTemplateProductionDays,
buildDurationOutputContractSummary,
buildEngineeringFeatureProfile,
buildFloorSequenceMetadata,
buildFloorSequenceScope,
buildInferredBuildingIds,
buildInferredFloorSequence,
compactTemplateNodeConstraintText,
countExplicitScopeComboBuildings,
decorateTitleWithElementVariant,
deriveElementVariantsForGeneration,
explicitScopeCombosLength,
inferElementVariantSuggestion,
mergeBuildingPatternCodesFromFacts,
mergeElementVariantCodesFromFacts,
mergeMethodVariantCodesFromFacts,
mergeRecommendationPacksFromFacts,
mergeScopeCodeArrayFromFacts,
nextTemplateProductionDay,
normalizeDate,
normalizeDependencyType,
normalizeId,
normalizeText,
pickPersistableScopeValues,
readArray,
readBooleanFromSources,
readCodeArray,
readFloorSequenceItems,
readGeneratedDurationSuggestion,
readMergedStringArray,
readMetadataCodeArray,
readNumberFromSources,
readOperationProjectFacts,
readOptionalNumber,
readPlanReferenceDurationNumber,
readPositiveNumber,
readRecord,
readStringArray,
readWritablePlanTaskDurationDays,
serializeProcessConstraintRule,
subtractTemplateProductionDays,
uniqueStringArray,
withPlanReferenceDurationOutput,
} from './wbsTemplateGenerationFoundation.js'
import type {
EngineeringFeatureProfile,
GeneratedCandidateNetworkEvaluation,
GeneratedElementVariant,
GeneratedPhaseWindow,
GeneratedScheduleTrustGate,
GeneratedTargetFeasibility,
GeneratedTemplateDependency,
GeneratedTemplateDurationSuggestion,
GeneratedTemplateGovernanceWarning,
GeneratedTemplateProcessConstraintEffect,
GeneratedTemplateProcessConstraintRoutingCandidate,
GeneratedTemplateProcessConstraintRule,
GeneratedTemplateRow,
PreviousInternalFlowSibling,
ResolvedPhaseReleasePolicy,
TemplateNode,
WbsTemplateGenerationDepth,
WbsTemplateGenerationRuntimeArtifactPublication,
WbsTemplatePhaseReleaseMode,
WbsTemplatePhaseReleasePolicy,
WbsTemplateScope,
} from './wbsTemplateGenerationFoundation.js'
import {
buildScopeObjectComboKey,
countUniqueComboBuildings,
findStandardScopeComboAnchor,
getChildGenerationDepth,
hasAnyScope,
isSuppressedPhysicalScopeObject,
readScopeObjectsForComboExpansion,
resolveGenerationDepthPolicyForNode,
shouldMaterializeNodeInGeneration,
} from './wbsTemplateScopeClassificationService.js'
import type {
ScopeComboRuntimeObject,
} from './wbsTemplateScopeClassificationService.js'
import {
applyProjectOrganizationToScopeCombos,
buildFloorSeriesMetadata,
clampNumber,
codeMatchesReplacementCode,
evaluateProjectScopeCatalogActualization,
executionProfileHasArchetype,
getDurationSuggestionKey,
getGeneratableChildren,
getPackageChildRhythmWindow,
hasGeneratableRowsForNode,
inferParentDurationBoundaryPolicy,
inferSchedulePhaseKindFromText,
isHardParentDurationBoundaryPolicy,
isInternalFlowAnchorMode,
isLowRiseMultiBuildingParallelProject,
normalizeDurationBoundaryPolicySource,
normalizeParentDurationBoundaryPolicy,
normalizeRate01,
parentWindowPolicySource,
readDurationDaysForNode,
readExecutionProfileFromProjectFacts,
readNodeDurationContributionMode,
readPackageChildRhythmWindowFromSuggestion,
readScenarioScheduleProfile,
} from './wbsTemplateDurationAssemblyService.js'
import {
EXECUTION_PHASE_ORDER,
buildGeneratedDurationSuggestionValue,
buildInternalFlowRuntimePolicy,
buildLinkedProjectionSource,
buildOverviewItemWorkInternalFlowRelation,
buildReferenceOnlyInternalFlowRelation,
buildWorkfaceId,
getScheduleChildKey,
inferCriticalPathEligible,
inferExecutionLane,
inferExecutionPhase,
inferPlanItemKind,
inferProgressMode,
inferRowProjectionMode,
inferScheduleParticipation,
inferScopeExpansionMode,
normalizeRowProjectionMode,
readInternalFlowRelationFromSeed,
syncGeneratedRowDurationOutput,
} from './wbsTemplateOutputProjectionService.js'



export function collectDescendantProcessConstraintRules(node: TemplateNode): GeneratedTemplateProcessConstraintRule[] {
  const rules: GeneratedTemplateProcessConstraintRule[] = []
  for (const child of node.children) {
    const childMetadata = readRecord(child.metadata)
    if (child.categoryType === 'process' || child.categoryType === 'activity_step') {
      const seedRule = findV1474ProcessConstraint(compactTemplateNodeConstraintText(child, childMetadata))
      if (seedRule) rules.push(serializeProcessConstraintRule(seedRule))
      rules.push(...readArray(childMetadata.processConstraintRules)
        .map((item) => readRecord(item))
        .map((item) => ({
          stableCode: normalizeText(item.stableCode),
          constraintType: normalizeText(item.constraintType),
          applicationMode: normalizeText(item.applicationMode) as V1474ProcessConstraintRule['applicationMode'],
          impactMode: normalizeText(item.impactMode) as V1474ProcessConstraintRule['impactMode'],
          runtimeActionPolicy: normalizeText(item.runtimeActionPolicy) as V1474ProcessConstraintRule['runtimeActionPolicy'],
          timeSourcePolicy: normalizeText(item.timeSourcePolicy) as V1474ProcessConstraintRule['timeSourcePolicy'],
          durationLookupPolicy: normalizeText(item.durationLookupPolicy) as V1474ProcessConstraintRule['durationLookupPolicy'],
          durationLookupKeys: readStringArray(item.durationLookupKeys),
          carrierProcessHints: readStringArray(item.carrierProcessHints),
          durationAuthorityPolicy: normalizeText(item.durationAuthorityPolicy) as V1474ProcessConstraintRule['durationAuthorityPolicy'],
          durationDoubleCountPolicy: normalizeText(item.durationDoubleCountPolicy) as V1474ProcessConstraintRule['durationDoubleCountPolicy'],
          partialOverlapRatio: normalizeProcessConstraintPartialOverlapRatio(item.partialOverlapRatio),
          startAfterPercent: normalizeProcessConstraintStartAfterPercent(
            item.startAfterPercent,
            normalizeProcessConstraintPartialOverlapRatio(item.partialOverlapRatio),
          ),
          scopeGranularity: normalizeText(item.scopeGranularity) as V1474ProcessConstraintRule['scopeGranularity'],
          releaseQuantityPolicy: normalizeText(item.releaseQuantityPolicy) as V1474ProcessConstraintRule['releaseQuantityPolicy'],
          minReleaseQuantityPercent: Number(item.minReleaseQuantityPercent ?? 0) || 0,
          quantityEvidenceRequirement: normalizeText(item.quantityEvidenceRequirement) as V1474ProcessConstraintRule['quantityEvidenceRequirement'],
          quantityProxyRiskLevel: normalizeText(item.quantityProxyRiskLevel) as V1474ProcessConstraintRule['quantityProxyRiskLevel'],
          quantitySourcePriority: readStringArray(item.quantitySourcePriority) as V1474ProcessConstraintRule['quantitySourcePriority'],
          insufficientQuantityPolicy: normalizeText(item.insufficientQuantityPolicy) as V1474ProcessConstraintRule['insufficientQuantityPolicy'],
          quantityDoubleCountPolicy: normalizeText(item.quantityDoubleCountPolicy) as V1474ProcessConstraintRule['quantityDoubleCountPolicy'],
          sourceStandard: normalizeText(item.sourceStandard),
          sourceVersion: normalizeText(item.sourceVersion),
          sourceClauseRef: normalizeText(item.sourceClauseRef),
          confidence: normalizeText(item.confidence) as V1474ProcessConstraintRule['confidence'],
        }))
        .filter((item) => item.stableCode) as GeneratedTemplateProcessConstraintRule[])
    }
    rules.push(...collectDescendantProcessConstraintRules(child))
  }
  return rules
}



export function buildProcessConstraintRules(
  node: TemplateNode,
  metadata: Record<string, unknown>,
): GeneratedTemplateProcessConstraintRule[] {
  const existingRules = readArray(metadata.processConstraintRules)
    .map((item) => readRecord(item))
    .map((item) => ({
      stableCode: normalizeText(item.stableCode),
      constraintType: normalizeText(item.constraintType),
      applicationMode: normalizeText(item.applicationMode) as V1474ProcessConstraintRule['applicationMode'],
      impactMode: normalizeText(item.impactMode) as V1474ProcessConstraintRule['impactMode'],
      runtimeActionPolicy: normalizeText(item.runtimeActionPolicy) as V1474ProcessConstraintRule['runtimeActionPolicy'],
      timeSourcePolicy: normalizeText(item.timeSourcePolicy) as V1474ProcessConstraintRule['timeSourcePolicy'],
      durationLookupPolicy: normalizeText(item.durationLookupPolicy) as V1474ProcessConstraintRule['durationLookupPolicy'],
      durationLookupKeys: readStringArray(item.durationLookupKeys),
      carrierProcessHints: readStringArray(item.carrierProcessHints),
      durationAuthorityPolicy: normalizeText(item.durationAuthorityPolicy) as V1474ProcessConstraintRule['durationAuthorityPolicy'],
      durationDoubleCountPolicy: normalizeText(item.durationDoubleCountPolicy) as V1474ProcessConstraintRule['durationDoubleCountPolicy'],
      partialOverlapRatio: normalizeProcessConstraintPartialOverlapRatio(item.partialOverlapRatio),
      startAfterPercent: normalizeProcessConstraintStartAfterPercent(
        item.startAfterPercent,
        normalizeProcessConstraintPartialOverlapRatio(item.partialOverlapRatio),
      ),
      scopeGranularity: normalizeText(item.scopeGranularity) as V1474ProcessConstraintRule['scopeGranularity'],
      releaseQuantityPolicy: normalizeText(item.releaseQuantityPolicy) as V1474ProcessConstraintRule['releaseQuantityPolicy'],
      minReleaseQuantityPercent: Number(item.minReleaseQuantityPercent ?? 0) || 0,
      quantityEvidenceRequirement: normalizeText(item.quantityEvidenceRequirement) as V1474ProcessConstraintRule['quantityEvidenceRequirement'],
      quantityProxyRiskLevel: normalizeText(item.quantityProxyRiskLevel) as V1474ProcessConstraintRule['quantityProxyRiskLevel'],
      quantitySourcePriority: readStringArray(item.quantitySourcePriority) as V1474ProcessConstraintRule['quantitySourcePriority'],
      insufficientQuantityPolicy: normalizeText(item.insufficientQuantityPolicy) as V1474ProcessConstraintRule['insufficientQuantityPolicy'],
      quantityDoubleCountPolicy: normalizeText(item.quantityDoubleCountPolicy) as V1474ProcessConstraintRule['quantityDoubleCountPolicy'],
      sourceStandard: normalizeText(item.sourceStandard),
      sourceVersion: normalizeText(item.sourceVersion),
      sourceClauseRef: normalizeText(item.sourceClauseRef),
      confidence: normalizeText(item.confidence) as V1474ProcessConstraintRule['confidence'],
    }))
    .filter((item) => item.stableCode)

  const seedRule = ['process', 'activity_step'].includes(node.categoryType)
    ? findV1474ProcessConstraint(compactTemplateNodeConstraintText(node, metadata))
    : null

  const descendantRules = node.categoryType === 'item_work'
    ? collectDescendantProcessConstraintRules(node)
    : []
  const rules = seedRule
    ? [...existingRules, serializeProcessConstraintRule(seedRule), ...descendantRules]
    : [...existingRules, ...descendantRules]
  const seen = new Set<string>()
  return rules.filter((rule) => {
    const key = `${rule.stableCode}:${rule.constraintType}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  }) as GeneratedTemplateProcessConstraintRule[]
}



export function buildScopeObjectLineageValues(
  anchor: ScopeComboRuntimeObject,
  byId: Map<string, ScopeComboRuntimeObject>,
) {
  const values: Partial<WbsTemplateScope> = {}
  let current: ScopeComboRuntimeObject | undefined = anchor
  const visited = new Set<string>()
  while (current && !visited.has(current.id)) {
    visited.add(current.id)
    if (!isSuppressedPhysicalScopeObject(current)) {
      const field = SCOPE_OBJECT_FIELD_BY_TYPE[current.type]
      if (field && !values[field as keyof WbsTemplateScope]) {
        values[field as keyof WbsTemplateScope] = current.id as never
      }
    }
    current = current.parentId ? byId.get(current.parentId) : undefined
  }
  return values
}



export function buildScopeCombosFromScopeObjects(scope: Record<string, unknown>, direct: WbsTemplateScope): WbsTemplateScope[] {
  const objects = readScopeObjectsForComboExpansion(scope)
  if (objects.length === 0) return []

  const byId = new Map(objects.map((object) => [object.id, object]))
  const childCounts = new Map<string, number>()
  for (const object of objects) {
    if (!object.parentId) continue
    childCounts.set(object.parentId, (childCounts.get(object.parentId) ?? 0) + 1)
  }

  const rawCombos: Array<Partial<WbsTemplateScope>> = []
  const seen = new Set<string>()
  for (const leaf of objects.filter((object) => (childCounts.get(object.id) ?? 0) === 0)) {
    const anchor = findStandardScopeComboAnchor(leaf, byId)
    if (!anchor) continue
    const values = buildScopeObjectLineageValues(anchor, byId)
    const key = buildScopeObjectComboKey(values)
    if (seen.has(key)) continue
    seen.add(key)
    rawCombos.push(values)
  }

  if (rawCombos.length === 0) return []

  const buildingIds = uniqueStringArray(rawCombos.map((combo) => normalizeText(combo.building_object_id)).filter(Boolean))
  const buildingIndexById = new Map(buildingIds.map((id, index) => [id, index]))
  const uniqueBuildingCount = countUniqueComboBuildings(rawCombos)

  return rawCombos.map((combo, index) => {
    const buildingId = normalizeText(combo.building_object_id)
    const buildingIndex = buildingId ? buildingIndexById.get(buildingId) ?? 0 : null
    const hasBuilding = Boolean(buildingId)
    const next: WbsTemplateScope = {
      ...direct,
      engineering_object_id: null,
      phase_object_id: null,
      section_object_id: null,
      building_object_id: null,
      floor_object_id: null,
      basement_object_id: null,
      physical_zone_object_id: null,
      functional_area_object_id: null,
      ...combo,
      building_sequence_source: hasBuilding ? 'explicit_building_array' : null,
      building_sequence_index: hasBuilding && uniqueBuildingCount > 1 ? buildingIndex : null,
      building_sequence_number: hasBuilding && uniqueBuildingCount > 1 && buildingIndex != null ? buildingIndex + 1 : null,
      building_sequence_total: hasBuilding && uniqueBuildingCount > 1 ? uniqueBuildingCount : null,
    }
    Object.assign(
      next,
      buildFloorSequenceScope(next.floor_object_id ? index : null, next.floor_object_id ? rawCombos.length : 0, next.floor_object_id ? 'explicit_floor_array' : null),
    )
    return next
  })
}



export function readScopeCombos(scopeInput: unknown, projectFactsInput: unknown = {}): WbsTemplateScope[] {
  const scope = readRecord(scopeInput)
  const projectFacts = readRecord(projectFactsInput)
  const readScopeOrFactNumber = (scopeKeys: string[], factKeys: string[]) => (
    readNumberFromSources([scope], scopeKeys) ?? readNumberFromSources([projectFacts], factKeys)
  )
  const buildingCountFact = readScopeOrFactNumber(['buildingCount', 'building_count'], ['buildingCount'])
  const standardFloorCountFact = readScopeOrFactNumber(['standardFloorCount', 'standard_floor_count'], ['standardFloorCount'])
  const highestFloorCountFact = readScopeOrFactNumber(['highestBuildingFloorCount', 'highest_building_floor_count', 'floorCount', 'floor_count'], ['highestBuildingFloorCount', 'floorCount'])
  const basementLevelCountFact = readScopeOrFactNumber(['basementLevelCount', 'basement_level_count'], ['basementLevelCount'])
  const totalAreaFact = readScopeOrFactNumber(['totalAreaM2', 'total_area_m2', 'totalArea', 'total_area'], ['totalAreaM2', 'totalArea'])
  const basementAreaFact = readScopeOrFactNumber(['basementAreaM2', 'basement_area_m2'], ['basementAreaM2'])
  const foundationDepthFact = readScopeOrFactNumber(
    ['foundationDepthM', 'foundation_depth_m', 'deepFoundationPitDepthM', 'deep_foundation_pit_depth_m', 'pitDepthM', 'pit_depth_m'],
    ['foundationDepthM', 'deepFoundationPitDepthM', 'pitDepthM'],
  )
  const prefabRateFact = readScopeOrFactNumber(['prefabRate', 'prefab_rate'], ['prefabRate'])
  const maxSpanFact = readScopeOrFactNumber(['maxSpanM', 'max_span_m'], ['maxSpanM'])
  const supportHeightFact = readScopeOrFactNumber(['supportHeightM', 'support_height_m'], ['supportHeightM'])
  const hasCivilDefenseFact = readBooleanFromSources([scope], ['hasCivilDefense'])
    ?? readBooleanFromSources([projectFacts], ['hasCivilDefense'])
  const towerCraneCountFact = readScopeOrFactNumber(['towerCraneCount', 'tower_crane_count'], ['towerCraneCount'])
  const constructionHoistCountFact = readScopeOrFactNumber(['constructionHoistCount', 'construction_hoist_count'], ['constructionHoistCount'])
  const locationFacts = readRecord(scope.locationFacts ?? scope.location_facts ?? projectFacts.locationFacts)
  const locationClimateSignals = readCodeArray(locationFacts.climateSignals ?? locationFacts.climate_signals)
  const locationWeatherImpactBands = readCodeArray(locationFacts.weatherImpactBands ?? locationFacts.weather_impact_bands)
  const rawScopeObjects = readArray(scope.scope_objects ?? scope.scopeObjects)
  const existingScopeOrganizationFacts = readRecord(
    scope.scopeOrganizationFacts
      ?? scope.scope_organization_facts
      ?? projectFacts.scopeOrganizationFacts
      ?? projectFacts.scope_organization_facts,
  )
  const direct: WbsTemplateScope = {
    engineering_object_id: normalizeId(scope.engineering_object_id ?? scope.engineeringObjectId),
    phase_object_id: normalizeId(scope.phase_object_id ?? scope.phaseObjectId),
    section_object_id: normalizeId(scope.section_object_id ?? scope.sectionObjectId),
    building_object_id: normalizeId(scope.building_object_id ?? scope.buildingObjectId),
    building_sequence_source: normalizeId(scope.building_object_id ?? scope.buildingObjectId) ? 'direct_building' : null,
    building_sequence_index: null,
    building_sequence_number: null,
    building_sequence_total: null,
    floor_object_id: normalizeId(scope.floor_object_id ?? scope.floorObjectId),
    basement_object_id: normalizeId(scope.basement_object_id ?? scope.basementObjectId),
    physical_zone_object_id: normalizeId(scope.physical_zone_object_id ?? scope.physicalZoneObjectId),
    functional_area_object_id: normalizeId(scope.functional_area_object_id ?? scope.functionalAreaObjectId),
    business_type: normalizeId(scope.business_type ?? scope.businessType ?? projectFacts.businessType),
    business_subtype: normalizeId(scope.business_subtype ?? scope.businessSubtype ?? projectFacts.businessSubtype),
    plan_scope_caliber: normalizeId(scope.plan_scope_caliber ?? scope.planScopeCaliber ?? projectFacts.planScopeCaliber),
    delivery_standard: normalizeId(scope.delivery_standard ?? scope.deliveryStandard ?? projectFacts.deliveryStandard),
    terminal_event: normalizeId(scope.terminal_event ?? scope.terminalEvent ?? projectFacts.terminalEvent),
    recommendation_packs: mergeRecommendationPacksFromFacts(scope, projectFacts),
    project_type_code: normalizeId(scope.project_type_code ?? scope.projectTypeCode ?? projectFacts.projectTypeCode),
    structure_type_code: normalizeId(scope.structure_type_code ?? scope.structureTypeCode ?? projectFacts.structureTypeCode),
    method_variant_codes: mergeMethodVariantCodesFromFacts(scope, projectFacts),
    prefab_system_codes: mergeScopeCodeArrayFromFacts(scope, projectFacts, ['prefab_system_codes', 'prefabSystemCodes'], ['prefabSystemCodes']),
    element_variant_codes: mergeElementVariantCodesFromFacts(scope, projectFacts),
    external_interface_codes: mergeScopeCodeArrayFromFacts(scope, projectFacts, ['external_interface_codes', 'externalInterfaceCodes'], ['externalInterfaceCodes']),
    hard_constraint_codes: mergeScopeCodeArrayFromFacts(scope, projectFacts, ['hard_constraint_codes', 'hardConstraintCodes'], ['hardConstraintCodes']),
    project_features: readRecord(scope.project_features ?? scope.projectFeatures ?? projectFacts.projectFeatures),
    detail_level: normalizeId(scope.detail_level ?? scope.detailLevel ?? projectFacts.detailLevel ?? projectFacts.detail_level),
    detailLevel: normalizeId(scope.detail_level ?? scope.detailLevel ?? projectFacts.detailLevel ?? projectFacts.detail_level),
    building_pattern_codes: mergeBuildingPatternCodesFromFacts(scope, projectFacts),
    functional_usage_codes: mergeScopeCodeArrayFromFacts(scope, projectFacts, ['functional_usage_codes', 'functionalUsageCodes'], ['functionalUsageCodes']),
    floor_usage_codes: mergeScopeCodeArrayFromFacts(scope, projectFacts, ['floor_usage_codes', 'floorUsageCodes'], ['floorUsageCodes']),
    functional_category_codes: mergeScopeCodeArrayFromFacts(scope, projectFacts, ['functional_category_codes', 'functionalCategoryCodes'], ['functionalCategoryCodes']),
    special_room_type_codes: mergeScopeCodeArrayFromFacts(scope, projectFacts, ['special_room_type_codes', 'specialRoomTypeCodes'], ['specialRoomTypeCodes']),
    physical_zone_type_codes: mergeScopeCodeArrayFromFacts(scope, projectFacts, ['physical_zone_type_codes', 'physicalZoneTypeCodes'], ['physicalZoneTypeCodes']),
    climate_signal: normalizeId(scope.climate_signal ?? scope.climateSignal ?? readCodeArray(scope.climateSignals ?? scope.climate_signals)[0] ?? locationClimateSignals[0]),
    monthly_climate_signal: normalizeId(scope.monthly_climate_signal ?? scope.monthlyClimateSignal ?? readCodeArray(scope.climateSignals ?? scope.climate_signals)[0] ?? locationClimateSignals[0]),
    climate_signals: uniqueStringArray([
      ...readCodeArray(scope.climateSignals ?? scope.climate_signals),
      ...locationClimateSignals,
    ]),
    weather_impact_bands: uniqueStringArray([
      ...readCodeArray(scope.weather_impact_bands ?? scope.weatherImpactBands),
      ...locationWeatherImpactBands,
    ]),
    location_facts: locationFacts,
    selected_template_ids: readCodeArray(scope.selected_template_ids ?? scope.selectedTemplateIds ?? scope.template_ids ?? scope.templateIds),
    scope_expansion_mode: normalizeId(scope.scopeExpansionMode ?? scope.scope_expansion_mode),
    scope_objects: rawScopeObjects,
    scopeObjects: rawScopeObjects,
    scope_organization_facts: existingScopeOrganizationFacts,
    scopeOrganizationFacts: existingScopeOrganizationFacts,
    benchmark_replay_scope_mode: normalizeId(scope.benchmarkReplayScopeMode ?? scope.benchmark_replay_scope_mode) === 'single_project_scope'
      ? 'single_project_scope'
      : null,
    benchmarkReplayScopeMode: normalizeId(scope.benchmarkReplayScopeMode ?? scope.benchmark_replay_scope_mode) === 'single_project_scope'
      ? 'single_project_scope'
      : null,
    total_area_m2: totalAreaFact,
    above_ground_area_m2: readScopeOrFactNumber(['aboveGroundAreaM2', 'above_ground_area_m2'], ['aboveGroundAreaM2']),
    building_count: buildingCountFact,
    standard_floor_count: standardFloorCountFact,
    highest_building_floor_count: highestFloorCountFact,
    basement_level_count: basementLevelCountFact,
    basement_area_m2: basementAreaFact,
    site_area_m2: readScopeOrFactNumber(['siteAreaM2', 'site_area_m2'], ['siteAreaM2']),
    foundation_depth_m: foundationDepthFact,
    prefab_rate: prefabRateFact,
    max_span_m: maxSpanFact,
    support_height_m: supportHeightFact,
    hasCivilDefense: hasCivilDefenseFact,
    tower_crane_count: towerCraneCountFact,
    construction_hoist_count: constructionHoistCountFact,
    onboarding_mode: normalizeId(scope.onboarding_mode ?? scope.onboardingMode ?? projectFacts.onboardingMode ?? projectFacts.onboarding_mode),
    onboarding_substage: normalizeId(scope.onboarding_substage ?? scope.onboardingSubstage ?? projectFacts.onboardingSubstage ?? projectFacts.onboarding_substage),
    onboarding_passed_milestones: uniqueStringArray([
      ...readCodeArray(scope.onboardingPassedMilestones ?? scope.onboarding_passed_milestones),
      ...readCodeArray(projectFacts.onboardingPassedMilestones ?? projectFacts.onboarding_passed_milestones),
    ]),
    onboarding_phase_progress: readRecord(
      scope.onboardingPhaseProgress
        ?? scope.onboarding_phase_progress
        ?? projectFacts.onboardingPhaseProgress
        ?? projectFacts.onboarding_phase_progress,
    ),
  }
  Object.assign(
    direct,
    buildFloorSequenceScope(direct.floor_object_id ? 0 : null, direct.floor_object_id ? 1 : 0, direct.floor_object_id ? 'direct_floor' : null),
  )

  const explicitScopeCombos = readArray(scope.scope_combos ?? scope.scopeCombos)
    .map((comboInput, index) => {
      const combo = readRecord(comboInput)
      const next: WbsTemplateScope = {
        ...direct,
        engineering_object_id: normalizeId(combo.engineering_object_id ?? combo.engineeringObjectId),
        phase_object_id: normalizeId(combo.phase_object_id ?? combo.phaseObjectId),
        section_object_id: normalizeId(combo.section_object_id ?? combo.sectionObjectId),
        building_object_id: normalizeId(combo.building_object_id ?? combo.buildingObjectId),
        floor_object_id: normalizeId(combo.floor_object_id ?? combo.floorObjectId),
        basement_object_id: normalizeId(combo.basement_object_id ?? combo.basementObjectId),
        physical_zone_object_id: normalizeId(combo.physical_zone_object_id ?? combo.physicalZoneObjectId),
        functional_area_object_id: normalizeId(combo.functional_area_object_id ?? combo.functionalAreaObjectId),
      }
      const hasBuilding = Boolean(next.building_object_id)
      next.building_sequence_source = hasBuilding ? 'explicit_building_array' : null
      next.building_sequence_index = hasBuilding ? index : null
      next.building_sequence_number = hasBuilding ? index + 1 : null
      next.building_sequence_total = hasBuilding ? countExplicitScopeComboBuildings(scope) || null : null
      Object.assign(
        next,
        buildFloorSequenceScope(next.floor_object_id ? index : null, next.floor_object_id ? explicitScopeCombosLength(scope) : 0, next.floor_object_id ? 'explicit_floor_array' : null),
      )
      return next
    })
    .filter(hasAnyScope)
  if (explicitScopeCombos.length > 0) return applyProjectOrganizationToScopeCombos(explicitScopeCombos, direct)

  const scopeObjectCombos = buildScopeCombosFromScopeObjects(scope, direct)
  if (scopeObjectCombos.length > 0) return applyProjectOrganizationToScopeCombos(scopeObjectCombos, direct)

  const explicitBuildings = readArray(scope.buildings ?? scope.buildingIds).map(normalizeText).filter(Boolean)
  const buildings = explicitBuildings.length > 0
    ? explicitBuildings
    : buildingCountFact && buildingCountFact > 1
      ? buildInferredBuildingIds(Math.min(Math.floor(buildingCountFact), 200))
      : []
  const floors = readArray(scope.floors ?? scope.floorIds).map(normalizeText).filter(Boolean)
  const explicitFloorSequence = readFloorSequenceItems(scope)
  const inferredFloorCount = Math.floor(standardFloorCountFact ?? highestFloorCountFact ?? 0)
  const inferredFloorSequence = explicitFloorSequence.length > 0
    ? explicitFloorSequence
    : inferredFloorCount > 1
      ? buildInferredFloorSequence(Math.min(inferredFloorCount, 200))
      : []
  const physicalZones = readArray(scope.physical_zones ?? scope.physicalZoneIds ?? scope.physical_zone_ids).map(normalizeText).filter(Boolean)
  const phases = readArray(scope.phases ?? scope.phaseIds).map(normalizeText).filter(Boolean)

  const hasPluralScope = buildings.length > 0 || floors.length > 0 || inferredFloorSequence.length > 0 || physicalZones.length > 0 || phases.length > 0
  if (!hasPluralScope) return applyProjectOrganizationToScopeCombos([direct], direct)

  const buildingList = buildings.length > 0 ? buildings : [direct.building_object_id ?? null]
  const buildingSource: WbsTemplateScope['building_sequence_source'] = explicitBuildings.length > 0
    ? 'explicit_building_array'
    : buildingCountFact && buildingCountFact > 1
      ? 'inferred_building_count'
      : direct.building_object_id
        ? 'direct_building'
        : null
  const floorList = floors.length > 0
    ? floors.map((floorId) => ({ floorObjectId: floorId, label: '', levelNumber: null as number | null, isBasement: false, source: 'explicit_floor_array' as const }))
    : inferredFloorSequence.length > 0
      ? inferredFloorSequence.map((item) => ({ ...item, source: item.floorObjectId ? 'explicit_floor_array' as const : 'inferred_floor_count' as const }))
      : [{ floorObjectId: direct.floor_object_id ?? null, label: '', levelNumber: null as number | null, isBasement: false, source: direct.floor_object_id ? 'direct_floor' as const : null }]
  const physicalZoneList = physicalZones.length > 0 ? physicalZones : [direct.physical_zone_object_id ?? null]
  const phaseList = phases.length > 0 ? phases : [direct.phase_object_id ?? null]

  const combos: WbsTemplateScope[] = []
  for (const [buildingIndex, buildingId] of buildingList.entries()) {
    for (const [floorIndex, floorItem] of floorList.entries()) {
      for (const physicalZoneId of physicalZoneList) {
        for (const phaseId of phaseList) {
          combos.push({
            ...direct,
            building_object_id: buildingId,
            building_sequence_source: buildingId ? buildingSource : null,
            building_sequence_index: buildingId && buildingList.length > 1 ? buildingIndex : null,
            building_sequence_number: buildingId && buildingList.length > 1 ? buildingIndex + 1 : null,
            building_sequence_total: buildingId && buildingList.length > 1 ? buildingList.length : null,
            floor_object_id: floorItem.floorObjectId,
            physical_zone_object_id: physicalZoneId,
            phase_object_id: phaseId,
            ...buildFloorSequenceScope(
              floorItem.floorObjectId || floorItem.source === 'inferred_floor_count' ? floorIndex : null,
              floorList.length > 0 && (floorItem.floorObjectId || floorItem.source === 'inferred_floor_count') ? floorList.length : 0,
              floorItem.source,
            ),
            floor_sequence_label: floorItem.label || null,
            floor_sequence_level_number: floorItem.levelNumber,
            floor_sequence_is_basement: floorItem.isBasement,
          })
        }
      }
    }
  }
  return applyProjectOrganizationToScopeCombos(combos, direct)
}



export function buildGeneratedStandardTaskMetadata(
  node: TemplateNode,
  durationSuggestion: GeneratedTemplateDurationSuggestion | null,
  featureProfile: EngineeringFeatureProfile,
  elementVariant: GeneratedElementVariant | null,
  scope?: WbsTemplateScope,
) {
  const metadata = readRecord(node.metadata)
  const templateGroup = (normalizeId(metadata.templateGroup) || 'building_main') as WbsTemplateDomainGroup
  const packType = (normalizeId(metadata.packType) || (templateGroup === 'building_main' ? 'core_quality' : 'specialty')) as WbsTemplatePackType
  const generationPolicy = (normalizeId(metadata.generationPolicy) || 'explicit') as WbsTemplateGenerationPolicy
  const preconditionTemplates = readStringArray(metadata.preconditionTemplates)
  const acceptanceCheckpoints = readStringArray(metadata.acceptanceCheckpoints)
  const processConstraintRules = buildProcessConstraintRules(node, metadata)
  const elementVariantSuggestion = elementVariant ? null : inferElementVariantSuggestion(node)
  const relationRole = normalizeId(metadata.relationRole)
  const planItemKind = inferPlanItemKind({ metadata, packType, relationRole, categoryType: node.categoryType })
  const progressMode = inferProgressMode(planItemKind, metadata)
  const scheduleParticipation = inferScheduleParticipation(planItemKind, metadata)
  const criticalPathEligible = inferCriticalPathEligible(planItemKind, metadata)
  const scopeExpansionMode = normalizeId(scope?.scope_expansion_mode)
    || inferScopeExpansionMode(planItemKind, packType, metadata)
  const nodeDurationContributionMode = readNodeDurationContributionMode(node, { planItemKind, relationRole })
  const durationContributionMode = nodeDurationContributionMode
    ?? normalizeDurationContributionMode(durationSuggestion?.durationContributionMode)
  const durationBoundaryPolicy = normalizeParentDurationBoundaryPolicy(
    durationSuggestion?.parentDurationBoundaryPolicy
      ?? metadata.durationBoundaryPolicy
      ?? metadata.duration_boundary_policy,
  )
  const durationBoundaryPolicySource = normalizeDurationBoundaryPolicySource(
    metadata.durationBoundaryPolicySource
      ?? metadata.duration_boundary_policy_source
      ?? (durationBoundaryPolicy ? parentWindowPolicySource(durationBoundaryPolicy) : null),
  )
  const planDurationTruthSource = normalizeText(
    durationSuggestion?.planDurationTruthSource
      ?? metadata.planDurationTruthSource
      ?? metadata.plan_duration_truth_source,
  ) || null
  const rowProjectionMode = inferRowProjectionMode({
    metadata,
    categoryType: node.categoryType,
    planItemKind,
    scheduleParticipation,
    durationContributionMode,
  })
  const executionPhase = normalizeId(metadata.executionPhase ?? metadata.execution_phase)
    || inferExecutionPhase({
      stableCode: node.stableCode,
      title: node.standardWorkName ?? node.name,
      packType,
      templateGroup,
      planItemKind,
      rowProjectionMode,
    })
  const executionLane = normalizeId(metadata.executionLane ?? metadata.execution_lane)
    || inferExecutionLane({
      executionPhase,
      templateGroup,
      packType,
    })
  const executionNature = normalizeExecutionNature(metadata.executionNature ?? metadata.execution_nature)
    ?? inferExecutionNature({
      name: node.standardWorkName ?? node.name,
      metadata,
      planItemKind,
      relationRole,
      durationContributionMode,
    })
  const controlRoles = inferControlRoles({
    name: node.standardWorkName ?? node.name,
    metadata,
    packType,
    planItemKind,
    relationRole,
    durationContributionMode,
    executionNature,
  })
  const planItemTags = readStringArray(metadata.planItemTags ?? metadata.plan_item_tags)
  const linkedProjectionSource = buildLinkedProjectionSource(metadata)
  const milestoneSemanticRole = normalizeId(metadata.milestoneSemanticRole ?? metadata.milestone_semantic_role)
  const referencedCoreQualityCodes = readMergedStringArray(metadata.referencedCoreQualityCodes, metadata.semanticReferencedCoreQualityCodes)
  const extendsCoreQualityCodes = readStringArray(metadata.extendsCoreQualityCodes)
  const replacesCoreQualityCodes = readStringArray(metadata.replacesCoreQualityCodes)
  const referencedMilestoneCodes = readMergedStringArray(metadata.referencedMilestoneCodes, metadata.semanticReferencedMilestoneCodes)
  const referencedSiteManagementCodes = readMergedStringArray(metadata.referencedSiteManagementCodes, metadata.semanticReferencedSiteManagementCodes)
  const referencedDangerControlCodes = readMergedStringArray(metadata.referencedDangerControlCodes, metadata.semanticReferencedDangerControlCodes)
  const referencedQualityResponsibilityCodes = readMergedStringArray(metadata.referencedQualityResponsibilityCodes, metadata.semanticReferencedQualityResponsibilityCodes)
  const referencedDocumentCommercialCodes = readMergedStringArray(metadata.referencedDocumentCommercialCodes, metadata.semanticReferencedDocumentCommercialCodes)
  const referencedSpecialtyCodes = readMergedStringArray(metadata.referencedSpecialtyCodes, metadata.semanticReferencedSpecialtyCodes)
  const branchFamily = normalizeId(metadata.branchFamily ?? metadata.branch_family)
  const branchKey = normalizeId(metadata.branchKey ?? metadata.branch_key)
  const branchSelectionMode = normalizeId(metadata.branchSelectionMode ?? metadata.branch_selection_mode)
  const applicableProjectTypes = readMetadataCodeArray(metadata, 'applicableProjectTypes', 'applicable_project_types')
  const applicableStructureTypes = readMetadataCodeArray(metadata, 'applicableStructureTypes', 'applicable_structure_types', 'applicableStructures', 'applicable_structures')
  const applicableMethodVariantCodes = readMetadataCodeArray(metadata, 'applicableMethodVariantCodes', 'applicable_method_variant_codes', 'methodVariantCodes', 'method_variant_codes', 'methodVariants', 'method_variants')
  const methodVariantExpansionPolicy = normalizeId(metadata.methodVariantExpansionPolicy ?? metadata.method_variant_expansion_policy)
  const applicableFloorSequencePositions = readMetadataCodeArray(
    metadata,
    'applicableFloorSequencePositions',
    'applicable_floor_sequence_positions',
    'floorSequencePositions',
    'floor_sequence_positions',
  )
  const historyFeedbackPolicy = readRecord(metadata.historyFeedbackPolicy ?? metadata.history_feedback_policy)
  const generationDepthPolicy = resolveGenerationDepthPolicyForNode(node)
  const durationReasonParams = readRecord(durationSuggestion?.businessReasonParams)
  const descendantRollup = readRecord(durationReasonParams.descendantRollup)
  const dependencyIntentResolution = inspectV1475DependencyIntentTemplates({
    fromCatalogGroup: packType,
    fromReferencedCode: node.stableCode,
    metadata: {
      ...metadata,
      relationRole,
      referencedCoreQualityCodes,
      referencedMilestoneCodes,
      referencedSiteManagementCodes,
      referencedDangerControlCodes,
      referencedQualityResponsibilityCodes,
      referencedDocumentCommercialCodes,
      referencedSpecialtyCodes,
    },
  })
  return {
    templateId: node.templateId,
    templateNodeId: node.id,
    packType,
    templateGroup,
    generationPolicy,
    stableCode: node.stableCode,
    standardWorkCode: node.standardWorkCode,
    standardWorkName: node.standardWorkName,
    projectGenerationFacts: buildProjectGenerationFactsSnapshot(featureProfile),
    methodVariantCodes: featureProfile.methodVariantCodes,
    elementVariant,
    elementVariantSuggestion,
    generationDepthPolicy,
    drillDownAvailable: generationDepthPolicy.drillDownAvailable || node.children.length > 0,
    deepDurationRollup: Object.keys(descendantRollup).length > 0 ? descendantRollup : null,
    processGranularity: normalizeId(metadata.processGranularity),
    generationMode: normalizeId(metadata.generationMode),
    planItemKind,
    progressMode,
    scheduleParticipation,
    criticalPathEligible,
    scopeExpansionMode,
    durationContributionMode,
    durationBoundaryPolicy,
    durationBoundaryPolicySource,
    planDurationTruthSource,
    parentDurationTruthRole: normalizeId(metadata.parentDurationTruthRole ?? metadata.parent_duration_truth_role),
    parentDurationTruthBoundary: normalizeId(metadata.parentDurationTruthBoundary ?? metadata.parent_duration_truth_boundary),
    rowProjectionMode,
    executionPhase,
    executionLane,
    executionNature,
    ...controlRoles,
    planItemTags,
    linkedProjectionSource,
    milestoneSemanticRole,
    relationRole,
    branchFamily,
    branchKey,
    branchSelectionMode,
    applicableProjectTypes,
    applicableStructureTypes,
    applicableMethodVariantCodes,
    applicableFloorSequencePositions,
    methodVariantExpansionPolicy,
    referencedCoreQualityCodes,
    extendsCoreQualityCodes,
    replacesCoreQualityCodes,
    referencedMilestoneCodes,
    referencedSiteManagementCodes,
    referencedDangerControlCodes,
    referencedQualityResponsibilityCodes,
    referencedDocumentCommercialCodes,
    referencedSpecialtyCodes,
    dependencyIntentTemplates: dependencyIntentResolution.intents,
    dependencyIntentAudit: dependencyIntentResolution.audit,
    dependencyIntentAuditSummary: dependencyIntentResolution.summary,
    acceptanceLinkRule: readRecord(metadata.acceptanceLinkRule),
    isAcceptanceMilestone: Boolean(metadata.isAcceptanceMilestone),
    preconditionTemplates,
    acceptanceCheckpoints,
    processConstraintRules,
    historyFeedbackPolicy: Object.keys(historyFeedbackPolicy).length > 0
      ? historyFeedbackPolicy
      : {
        mode: 'candidate_only',
        target: 'duration_dependency_and_process_pack_candidates',
        directSeedMutation: false,
      },
    resourceProfile: readRecord(metadata.resourceProfile),
    durationLearningPublicationKey: normalizeId(metadata.durationLearningPublicationKey),
    durationLearningPublicationStage: normalizeId(metadata.durationLearningPublicationStage),
    durationLearningSelectionBasis: normalizeId(metadata.durationLearningSelectionBasis),
    durationLearningAssetKey: normalizeId(metadata.durationLearningAssetKey),
    durationLearningConsumptions: readArray(metadata.durationLearningConsumptions)
      .map(readRecord)
      .filter((consumption) => normalizeId(consumption.publicationKey)),
    durationDayBasis: normalizeId(metadata.durationDayBasis ?? metadata.duration_day_basis),
    floorRhythm: durationSuggestion?.floorRhythmAdjustment ?? null,
    durationSuggestion: buildGeneratedDurationSuggestionValue(durationSuggestion, durationContributionMode),
  }
}



export function shouldMarkGeneratedRowAsMilestone(
  node: TemplateNode,
  standardTaskMetadata: ReturnType<typeof buildGeneratedStandardTaskMetadata>,
) {
  if (node.defaultMilestone) return true
  return standardTaskMetadata.planItemKind === 'milestone'
    || standardTaskMetadata.planItemKind === 'linked_projection'
    || standardTaskMetadata.generationMode === 'read_only_milestone_projection'
    || standardTaskMetadata.milestoneSemanticRole !== ''
}



export function scheduleNode(
  node: TemplateNode,
  cursorDate: string,
  generationDepth: WbsTemplateGenerationDepth,
  scopeIndex: number,
  suggestionByNodeKey: Map<string, GeneratedTemplateDurationSuggestion>,
  scope: WbsTemplateScope,
  elementVariant: GeneratedElementVariant | null = null,
  constructionCalendar?: ConstructionCalendarContext | null,
): {
  start: string
  end: string
  next: string
  children: Map<string, { start: string; end: string }>
} {
  const children = new Map<string, { start: string; end: string }>()
  const includedChildren = getGeneratableChildren(node, generationDepth, scope)
  const childGenerationDepth = getChildGenerationDepth(node, generationDepth, scope)
  const ownDuration = readDurationDaysForNode(node, scopeIndex, suggestionByNodeKey, elementVariant, scope)
  if (includedChildren.length === 0) {
    const duration = ownDuration
    if (duration <= 0) return { start: cursorDate, end: cursorDate, next: cursorDate, children }
    const end = addTemplateProductionDays(cursorDate, duration - 1, constructionCalendar)
    return { start: cursorDate, end, next: nextTemplateProductionDay(end, constructionCalendar), children }
  }

  let next = cursorDate
  let start = cursorDate
  let end = cursorDate
  includedChildren.forEach((child, index) => {
    const variants = deriveElementVariantsForGeneration(child, scope)
    const variantList = variants.length > 0 ? variants : [elementVariant]
    variantList.forEach((childElementVariant, variantIndex) => {
      const rhythmWindow = getPackageChildRhythmWindow(scopeIndex, child, suggestionByNodeKey, childElementVariant)
      const childCursorDate = rhythmWindow ? addTemplateProductionDays(cursorDate, rhythmWindow.startDay - 1, constructionCalendar) : next
      const childSchedule = scheduleNode(child, childCursorDate, childGenerationDepth, scopeIndex, suggestionByNodeKey, scope, childElementVariant, constructionCalendar)
      const childEnd = rhythmWindow ? addTemplateProductionDays(cursorDate, rhythmWindow.endDay - 1, constructionCalendar) : childSchedule.end
      if (index === 0 && variantIndex === 0) start = childSchedule.start
      end = comparePlanDates(childEnd, end) > 0 ? childEnd : end
      next = rhythmWindow
        ? (comparePlanDates(next, nextTemplateProductionDay(end, constructionCalendar)) > 0 ? next : nextTemplateProductionDay(end, constructionCalendar))
        : childSchedule.next
      children.set(getScheduleChildKey(child, childElementVariant), { start: childSchedule.start, end: childEnd })
    })
  })
  if (ownDuration > 0 && isHardParentDurationBoundaryPolicy(inferParentDurationBoundaryPolicy(node))) {
    const ownEnd = addTemplateProductionDays(cursorDate, ownDuration - 1, constructionCalendar)
    return {
      start: cursorDate,
      end: ownEnd,
      next: nextTemplateProductionDay(ownEnd, constructionCalendar),
      children,
    }
  }
  return { start, end, next, children }
}



export function buildGeneratedRowsForNode(params: {
  node: TemplateNode
  scope: WbsTemplateScope
  elementVariant?: GeneratedElementVariant | null
  parentClientRowId: string | null
  parentRowId: string | null
  attachUnderRowId: string | null
  batchId: string
  sortCursor: { value: number }
  startDate: string
  generationDepth: WbsTemplateGenerationDepth
  scopeIndex: number
  suggestionByNodeKey: Map<string, GeneratedTemplateDurationSuggestion>
  constructionCalendar?: ConstructionCalendarContext | null
  predecessorByParent: Map<string, PreviousInternalFlowSibling[]>
  rows: GeneratedTemplateRow[]
}) {
  if (!hasGeneratableRowsForNode(params.node, params.generationDepth, params.scope)) return
  const variants = !params.elementVariant ? deriveElementVariantsForGeneration(params.node, params.scope) : []
  if (variants.length > 0) {
    let nextStartDate = params.startDate
    variants.forEach((elementVariant) => {
      const variantSchedule = scheduleNode(
        params.node,
        nextStartDate,
        params.generationDepth,
        params.scopeIndex,
        params.suggestionByNodeKey,
        params.scope,
        elementVariant,
        params.constructionCalendar,
      )
      buildGeneratedRowsForNode({ ...params, elementVariant, startDate: variantSchedule.start })
      nextStartDate = variantSchedule.next
    })
    return
  }

  const shouldMaterialize = shouldMaterializeNodeInGeneration(params.node, params.generationDepth, params.scope)
  if (!shouldMaterialize) {
    const inheritedElementVariant = params.elementVariant ?? null
    const schedule = scheduleNode(
      params.node,
      params.startDate,
      params.generationDepth,
      params.scopeIndex,
      params.suggestionByNodeKey,
      params.scope,
      inheritedElementVariant,
      params.constructionCalendar,
    )
    const childGenerationDepth = getChildGenerationDepth(params.node, params.generationDepth, params.scope)
    for (const child of getGeneratableChildren(params.node, params.generationDepth, params.scope)) {
      const childVariants = deriveElementVariantsForGeneration(child, params.scope)
      if (childVariants.length > 0) {
        childVariants.forEach((childElementVariant) => {
          buildGeneratedRowsForNode({
            ...params,
            node: child,
            generationDepth: childGenerationDepth,
            elementVariant: childElementVariant,
            startDate: schedule.children.get(getScheduleChildKey(child, childElementVariant))?.start ?? schedule.start,
          })
        })
        continue
      }
      const inheritedChildElementVariant = params.node.categoryType === 'process' ? inheritedElementVariant : undefined
      buildGeneratedRowsForNode({
        ...params,
        node: child,
        generationDepth: childGenerationDepth,
        elementVariant: inheritedChildElementVariant,
        startDate: schedule.children.get(getScheduleChildKey(child, inheritedChildElementVariant ?? null))?.start
          ?? schedule.children.get(getScheduleChildKey(child, null))?.start
          ?? schedule.start,
      })
    }
    return
  }

  const elementVariant = params.elementVariant ?? null
  const featureProfile = buildEngineeringFeatureProfile(params.scope)
  const schedule = scheduleNode(
    params.node,
    params.startDate,
    params.generationDepth,
    params.scopeIndex,
    params.suggestionByNodeKey,
    params.scope,
    elementVariant,
    params.constructionCalendar,
  )
  const clientRowId = `${params.batchId}:${params.node.stableCode}${elementVariant ? `:el-${elementVariant.code}` : ''}:${params.sortCursor.value}`
  const sortOrder = params.sortCursor.value++
  const parentKey = params.parentClientRowId ?? params.parentRowId ?? 'root'
  const predecessorClientRowIds: string[] = []
  const predecessorDependencies: GeneratedTemplateDependency[] = []
  const durationSuggestion = withPlanReferenceDurationOutput(
    params.suggestionByNodeKey.get(getDurationSuggestionKey(params.scopeIndex, params.node, elementVariant)) ?? null,
  )
  const standardTaskMetadata = buildGeneratedStandardTaskMetadata(params.node, durationSuggestion, featureProfile, elementVariant, params.scope)
  const authoritativeConstructionCalendar = isAuthoritativeConstructionCalendar(params.constructionCalendar)
  ;(standardTaskMetadata as Record<string, unknown>).calendarBasis = effectiveConstructionCalendarBasis(params.constructionCalendar)
  ;(standardTaskMetadata as Record<string, unknown>).constructionCalendarWindowCount = effectiveConstructionCalendarWindowCount(params.constructionCalendar)
  ;(standardTaskMetadata as Record<string, unknown>).constructionCalendarRef = authoritativeConstructionCalendar
    ? params.constructionCalendar.calendarRef
    : null
  ;(standardTaskMetadata as Record<string, unknown>).constructionCalendarVersion = authoritativeConstructionCalendar
    ? params.constructionCalendar.calendarVersion
    : null
  ;(standardTaskMetadata as Record<string, unknown>).constructionCalendarTimezone = authoritativeConstructionCalendar
    ? params.constructionCalendar.timezone
    : params.constructionCalendar?.timezone ?? 'Asia/Shanghai'
  ;(standardTaskMetadata as Record<string, unknown>).constructionCalendarAvailability = authoritativeConstructionCalendar
    ? 'available'
    : 'unavailable'
  if (params.scope.project_organization_policy_id) {
    const organizationPolicy = resolveProjectConstructionOrganizationPolicy(
      featureProfile.businessType,
      featureProfile.projectTypeCode,
      featureProfile,
    )
    const scenarioSelection = selectConstructionOrganizationScenario(buildConstructionOrganizationSelectorInputFromProjectFacts(featureProfile, {
      projectTypeCode: featureProfile.projectTypeCode,
      onboardingMode: normalizeText(params.scope.onboarding_mode ?? params.scope.onboardingMode),
      onboardingSubstage: normalizeText(params.scope.onboarding_substage ?? params.scope.onboardingSubstage),
      onboardingPassedMilestones: params.scope.onboarding_passed_milestones ?? params.scope.onboardingPassedMilestones ?? [],
      onboardingPhaseProgress: params.scope.onboarding_phase_progress ?? params.scope.onboardingPhaseProgress ?? {},
    }))
    ;(standardTaskMetadata as Record<string, unknown>).projectOrganization = {
      source: 'project_execution_organization_policy',
      policyId: params.scope.project_organization_policy_id,
      strategy: params.scope.project_organization_strategy,
      policySource: organizationPolicy.source,
      policySourceVersion: organizationPolicy.sourceVersion,
      organizationLane: params.scope.organization_lane,
      organizationLaneRole: params.scope.organization_lane_role,
      organizationLaneIndex: params.scope.organization_lane_index,
      organizationLaneTotal: params.scope.organization_lane_total,
      organizationScopeGroup: params.scope.organization_scope_group,
      sharedWork: params.scope.organization_shared_work === true,
      confidence: params.scope.organization_confidence,
      laneSizingPolicy: organizationPolicy.laneSizingPolicy ?? null,
      networkPolicy: organizationPolicy.networkPolicy,
      governance: organizationPolicy.governance,
      inputBasis: {
        businessType: featureProfile.businessType,
        projectTypeCode: featureProfile.projectTypeCode,
        buildingCount: featureProfile.buildingCount,
        totalAreaM2: featureProfile.totalAreaM2,
        aboveGroundAreaM2: featureProfile.aboveGroundAreaM2,
        basementLevelCount: featureProfile.basementLevelCount,
        basementAreaM2: featureProfile.basementAreaM2,
        siteAreaM2: featureProfile.siteAreaM2,
        foundationDepthM: featureProfile.foundationDepthM,
        standardFloorCount: featureProfile.standardFloorCount,
        highestBuildingFloorCount: featureProfile.highestBuildingFloorCount,
        prefabRate: featureProfile.prefabRate,
        maxSpanM: featureProfile.maxSpanM,
        supportHeightM: featureProfile.supportHeightM,
        hasCivilDefense: featureProfile.hasCivilDefense,
        planScopeCaliber: featureProfile.planScopeCaliber,
        deliveryStandard: featureProfile.deliveryStandard,
        terminalEvent: featureProfile.terminalEvent,
        structureTypeCode: featureProfile.structureTypeCode,
        methodVariantCodes: featureProfile.methodVariantCodes,
        prefabSystemCodes: featureProfile.prefabSystemCodes,
        elementVariantCodes: featureProfile.elementVariantCodes,
        externalInterfaceCodes: featureProfile.externalInterfaceCodes,
        hardConstraintCodes: featureProfile.hardConstraintCodes,
        projectFeatures: featureProfile.projectFeatures,
        detailLevel: featureProfile.detailLevel,
        functionalUsageCodes: featureProfile.functionalUsageCodes,
        floorUsageCodes: featureProfile.floorUsageCodes,
        functionalCategoryCodes: featureProfile.functionalCategoryCodes,
        specialRoomTypeCodes: featureProfile.specialRoomTypeCodes,
        physicalZoneTypeCodes: featureProfile.physicalZoneTypeCodes,
        buildingPatternCodes: featureProfile.buildingPatternCodes,
        climateSignals: featureProfile.climateSignals,
        weatherImpactBands: featureProfile.weatherImpactBands,
        locationFacts: featureProfile.locationFacts,
        scopeOrganizationFacts: featureProfile.scopeOrganizationFacts,
        towerCraneCount: featureProfile.towerCraneCount,
        constructionHoistCount: featureProfile.constructionHoistCount,
        onboardingMode: params.scope.onboarding_mode ?? params.scope.onboardingMode ?? null,
        onboardingSubstage: params.scope.onboarding_substage ?? params.scope.onboardingSubstage ?? null,
        onboardingPassedMilestones: params.scope.onboarding_passed_milestones ?? params.scope.onboardingPassedMilestones ?? [],
        onboardingPhaseProgress: params.scope.onboarding_phase_progress ?? params.scope.onboardingPhaseProgress ?? {},
        constructionOrganizationBasis: 'business_type_building_pattern_shared_work_interface_gate',
      },
      resourcePolicy: 'resources_are_sidecar_feasibility_signals_not_primary_schedule_driver',
      scenarioSelection,
    }
  }
  const actualizationDecision = evaluateProjectScopeCatalogActualization(params.node, params.scope)
  if (actualizationDecision?.applies && actualizationDecision.selected) {
    ;(standardTaskMetadata as Record<string, unknown>).projectScopeCatalogActualization = {
      source: 'project_scope_catalog_actualization_policy',
      sourceVersion: 'v1.4.22-project-organization-actualization-20260620',
      familyCode: actualizationDecision.familyCode,
      selectedCodes: actualizationDecision.selectedCodes,
      selectedStableCode: params.node.stableCode,
      selectionStatus: 'actualized_schedule_carrier',
      reasonCode: actualizationDecision.reasonCode,
      confidence: actualizationDecision.confidence,
      inputBasis: {
        businessType: featureProfile.businessType,
        projectTypeCode: featureProfile.projectTypeCode,
        structureTypeCode: featureProfile.structureTypeCode,
        basementLevelCount: featureProfile.basementLevelCount,
        basementAreaM2: featureProfile.basementAreaM2,
        foundationDepthM: featureProfile.foundationDepthM,
        buildingPatternCodes: featureProfile.buildingPatternCodes,
        methodVariantCodes: featureProfile.methodVariantCodes,
      },
      resourcePolicy: PROJECT_SCOPE_ACTUALIZATION_RESOURCE_POLICY,
      governance: {
        assetType: 'project_scope_catalog_actualization_policy',
        curationStatus: 'seeded',
        directSeedMutation: false,
      },
    }
  }
  const floorSequenceMetadata = buildFloorSequenceMetadata(params.scope)
  const floorSeriesMetadata = buildFloorSeriesMetadata(params.scope)
  const executionPhase = standardTaskMetadata.executionPhase
  const executionLane = standardTaskMetadata.executionLane
  const executionSortKey = ((EXECUTION_PHASE_ORDER[executionPhase] ?? 999) * 1_000_000) + sortOrder
  const workfaceId = buildWorkfaceId(params.scope)
  ;(standardTaskMetadata as Record<string, unknown>).executionSortKey = executionSortKey
  ;(standardTaskMetadata as Record<string, unknown>).workfaceId = workfaceId
  if (floorSequenceMetadata) {
    ;(standardTaskMetadata as Record<string, unknown>).floorSequence = floorSequenceMetadata
  }
  if (floorSeriesMetadata) {
    ;(standardTaskMetadata as Record<string, unknown>).floorSeries = floorSeriesMetadata
  }
  const preconditionTemplates = standardTaskMetadata.preconditionTemplates
  const acceptanceCheckpoints = standardTaskMetadata.acceptanceCheckpoints
  let rowStartDate = schedule.start
  let rowEndDate = schedule.end
  const packageChildRhythmWindow = readPackageChildRhythmWindowFromSuggestion(durationSuggestion)
  const hasPackageChildRhythmWindow = Boolean(packageChildRhythmWindow)
  if (hasPackageChildRhythmWindow) {
    ;(standardTaskMetadata as Record<string, unknown>).scheduleAuthorityPolicy = 'package_child_rhythm_window'
  }
  const baseTitle = params.node.categoryType === 'process'
    ? decorateTitleWithElementVariant(params.node.name, elementVariant)
    : params.node.name
  const title = floorSequenceMetadata?.objectBinding === 'inferred_sequence_only' && floorSequenceMetadata.label
    ? `${floorSequenceMetadata.label} ${baseTitle}`
    : baseTitle
  const standardWorkName = params.node.categoryType === 'process'
    ? decorateTitleWithElementVariant(params.node.standardWorkName ?? params.node.name, elementVariant)
    : params.node.standardWorkName
  const appliesSiblingInternalFlow = params.node.categoryType === 'process'
    || params.node.categoryType === 'activity_step'
    || (params.node.categoryType === 'item_work' && params.generationDepth === 'item_work')
  if (appliesSiblingInternalFlow) {
    const previousSiblings = params.predecessorByParent.get(parentKey) ?? []
    const previousAnySibling = previousSiblings[previousSiblings.length - 1]
    const durationContributionMode = standardTaskMetadata.durationContributionMode as DurationContributionMode
    const isDurationBearing = isDurationBearingContributionMode(durationContributionMode)
    const currentIsInternalFlowAnchor = isInternalFlowAnchorMode(durationContributionMode)
    if (!isDurationBearing && !hasPackageChildRhythmWindow) {
      rowStartDate = previousAnySibling?.endDate ?? schedule.start
      rowEndDate = rowStartDate
    }
    const previousAnchorSiblings = previousSiblings.filter((sibling) => isInternalFlowAnchorMode(sibling.durationContributionMode))
    let previousSibling = previousAnchorSiblings[previousAnchorSiblings.length - 1]
    const skippedSiblingClientRowIds = previousSiblings
      .filter((sibling) => !isInternalFlowAnchorMode(sibling.durationContributionMode))
      .map((sibling) => sibling.clientRowId)
    if (!currentIsInternalFlowAnchor) {
      const internalFlowRelation = buildReferenceOnlyInternalFlowRelation(durationContributionMode)
      ;(standardTaskMetadata as any).internalFlow = {
        source: 'v1.4.7.2_internal_flow',
        sourceType: 'sibling_sequence',
        scope: 'same_parent',
        ruleSource: internalFlowRelation.source,
        ruleSourceVersion: internalFlowRelation.sourceVersion,
        seedRuleId: internalFlowRelation.seedRuleId,
        ruleVersion: internalFlowRelation.ruleVersion,
        curationStatus: internalFlowRelation.curationStatus,
        curationMethod: internalFlowRelation.curationMethod,
        curationBasis: internalFlowRelation.curationBasis,
        reviewNeeded: internalFlowRelation.reviewNeeded,
        scheduleMode: internalFlowRelation.scheduleMode,
        requiresAllPreviousSiblings: internalFlowRelation.requiresAllPreviousSiblings,
        evidenceCodes: internalFlowRelation.evidenceCodes,
        evidenceRefs: internalFlowRelation.evidenceRefs,
        governancePriority: internalFlowRelation.governancePriority,
        applicableWhen: internalFlowRelation.applicableWhen,
        conditionalEffects: internalFlowRelation.conditionalEffects,
        appliedConditionalEffectIds: internalFlowRelation.appliedConditionalEffectIds,
        generalizationHint: internalFlowRelation.generalizationHint,
        relationKind: internalFlowRelation.kind,
        createsDependency: false,
        runtimePolicy: buildInternalFlowRuntimePolicy(internalFlowRelation),
        predecessorClientRowId: previousAnySibling?.clientRowId ?? null,
        predecessorClientRowIds: [],
        predecessorStableCode: previousAnySibling?.node.stableCode ?? null,
        predecessorStableCodes: [],
        predecessorName: previousAnySibling?.node.name ?? null,
        predecessorNames: [],
        successorStableCode: params.node.stableCode,
        successorName: params.node.name,
        dependencyType: internalFlowRelation.dependencyType,
        lagDays: internalFlowRelation.lagDays,
        relationRole: internalFlowRelation.relationRole,
        strength: internalFlowRelation.strength,
        reasonCode: internalFlowRelation.reasonCode,
        durationContributionMode,
        durationContributionModePolicy: 'reference_only_not_sibling_dependency',
      }
    } else if (previousSibling) {
      let internalFlowRelation = readInternalFlowRelationFromSeed(previousSibling.node, params.node, {
        featureProfile,
        predecessorName: previousSibling.node.name,
        successorName: params.node.name,
        elementVariant,
      })
      if (params.node.categoryType === 'item_work' && internalFlowRelation.reviewNeeded) {
        internalFlowRelation = buildOverviewItemWorkInternalFlowRelation(previousSibling.node, params.node)
      }
      if (internalFlowRelation.reviewNeeded) {
        for (const candidateSibling of [...previousSiblings].reverse()) {
          if (candidateSibling.clientRowId === previousSibling.clientRowId) continue
          const candidateRelation = readInternalFlowRelationFromSeed(candidateSibling.node, params.node, {
            featureProfile,
            predecessorName: candidateSibling.node.name,
            successorName: params.node.name,
            elementVariant,
          })
          const resolvedCandidateRelation = params.node.categoryType === 'item_work' && candidateRelation.reviewNeeded
            ? buildOverviewItemWorkInternalFlowRelation(candidateSibling.node, params.node)
            : candidateRelation
          if (!resolvedCandidateRelation.reviewNeeded && resolvedCandidateRelation.createsDependency) {
            previousSibling = candidateSibling
            internalFlowRelation = resolvedCandidateRelation
            break
          }
        }
      }
      const additionalPredecessorStableCodes = new Set(
        uniqueStringArray(internalFlowRelation.additionalPredecessorStableCodes ?? [])
          .map((code) => normalizeText(code).toLowerCase()),
      )
      const explicitDependencySiblings = previousSiblings.filter((sibling) => (
        additionalPredecessorStableCodes.has(normalizeText(sibling.node.stableCode).toLowerCase())
      ))
      const baseDependencySiblings = internalFlowRelation.requiresAllPreviousSiblings ? previousAnchorSiblings : [previousSibling]
      const hasExplicitDependencySiblings = explicitDependencySiblings.length > 0
      const dependencySiblings = [...baseDependencySiblings, ...explicitDependencySiblings]
        .filter((sibling, index, siblings) => (
          siblings.findIndex((candidate) => candidate.clientRowId === sibling.clientRowId) === index
        ))
      const materializesInternalFlowDependency = internalFlowRelation.createsDependency
        && !hasPackageChildRhythmWindow
      if (internalFlowRelation.scheduleMode === 'parallel_with_previous' && !hasPackageChildRhythmWindow) {
        const durationDays = daysInclusive(schedule.start, schedule.end)
        rowStartDate = previousSibling.startDate
        rowEndDate = addTemplateProductionDays(rowStartDate, durationDays - 1, params.constructionCalendar)
      }
      ;(standardTaskMetadata as any).internalFlow = {
        source: 'v1.4.7.2_internal_flow',
        sourceType: 'sibling_sequence',
        scope: 'same_parent',
        ruleSource: internalFlowRelation.source,
        ruleSourceVersion: internalFlowRelation.sourceVersion,
        seedRuleId: internalFlowRelation.seedRuleId,
        ruleVersion: internalFlowRelation.ruleVersion,
        curationStatus: internalFlowRelation.curationStatus,
        curationMethod: internalFlowRelation.curationMethod,
        curationBasis: internalFlowRelation.curationBasis,
        reviewNeeded: internalFlowRelation.reviewNeeded,
        scheduleMode: internalFlowRelation.scheduleMode,
        requiresAllPreviousSiblings: internalFlowRelation.requiresAllPreviousSiblings,
        usesExplicitNonAnchorPredecessorStableCodes: hasExplicitDependencySiblings,
        additionalPredecessorStableCodes: [...additionalPredecessorStableCodes],
        additionalPredecessorClientRowIds: explicitDependencySiblings.map((sibling) => sibling.clientRowId),
        evidenceCodes: internalFlowRelation.evidenceCodes,
        evidenceRefs: internalFlowRelation.evidenceRefs,
        governancePriority: internalFlowRelation.governancePriority,
        applicableWhen: internalFlowRelation.applicableWhen,
        conditionalEffects: internalFlowRelation.conditionalEffects,
        appliedConditionalEffectIds: internalFlowRelation.appliedConditionalEffectIds,
        generalizationHint: internalFlowRelation.generalizationHint,
        relationKind: internalFlowRelation.kind,
        createsDependency: materializesInternalFlowDependency,
        dependencyMaterializationPolicy: hasPackageChildRhythmWindow
          ? 'metadata_only_parent_package_window_authority'
          : 'materialize_governed_internal_flow',
        runtimePolicy: buildInternalFlowRuntimePolicy(internalFlowRelation),
        predecessorClientRowId: materializesInternalFlowDependency ? previousSibling.clientRowId : null,
        predecessorClientRowIds: materializesInternalFlowDependency
          ? dependencySiblings.map((sibling) => sibling.clientRowId)
          : [],
        predecessorStableCode: materializesInternalFlowDependency ? previousSibling.node.stableCode : null,
        predecessorStableCodes: materializesInternalFlowDependency
          ? dependencySiblings.map((sibling) => sibling.node.stableCode)
          : [],
        predecessorName: materializesInternalFlowDependency ? previousSibling.node.name : null,
        predecessorNames: materializesInternalFlowDependency
          ? dependencySiblings.map((sibling) => sibling.node.name)
          : [],
        referencePredecessorClientRowId: hasPackageChildRhythmWindow ? previousSibling.clientRowId : null,
        referencePredecessorClientRowIds: hasPackageChildRhythmWindow
          ? dependencySiblings.map((sibling) => sibling.clientRowId)
          : [],
        referencePredecessorStableCode: hasPackageChildRhythmWindow ? previousSibling.node.stableCode : null,
        referencePredecessorStableCodes: hasPackageChildRhythmWindow
          ? dependencySiblings.map((sibling) => sibling.node.stableCode)
          : [],
        skippedSiblingClientRowIds,
        successorStableCode: params.node.stableCode,
        successorName: params.node.name,
        dependencyType: internalFlowRelation.dependencyType,
        lagDays: internalFlowRelation.lagDays,
        relationRole: internalFlowRelation.relationRole,
        strength: internalFlowRelation.strength,
        reasonCode: internalFlowRelation.reasonCode,
        predecessorDurationContributionMode: previousSibling.durationContributionMode,
        successorDurationContributionMode: durationContributionMode,
        durationContributionModePolicy: params.node.categoryType === 'item_work'
          ? 'overview_item_work_dependencies_use_duration_bearing_gate_or_handover_anchors'
          : hasPackageChildRhythmWindow
            ? 'package_child_rhythm_window_dates_are_authoritative_dependencies_are_metadata_only'
            : hasExplicitDependencySiblings
              ? 'curated_explicit_stable_code_predecessors_may_reference_non_duration_evidence'
              : 'dependencies_use_duration_bearing_gate_or_handover_anchors',
        scheduleAuthorityPolicy: hasPackageChildRhythmWindow ? 'package_child_rhythm_window' : 'internal_flow_relation',
      }
      if (materializesInternalFlowDependency) {
        dependencySiblings.forEach((sibling) => {
          if (!predecessorClientRowIds.includes(sibling.clientRowId)) predecessorClientRowIds.push(sibling.clientRowId)
          predecessorDependencies.push({
            clientRowId: sibling.clientRowId,
            dependencyType: internalFlowRelation.dependencyType,
            lagDays: internalFlowRelation.lagDays,
            intentCode: null,
            relationRole: internalFlowRelation.relationRole,
            strength: internalFlowRelation.strength,
            source: 'sibling_sequence',
          })
        })
      }
    }
    params.predecessorByParent.set(parentKey, [
      ...previousSiblings,
      { clientRowId, node: params.node, startDate: rowStartDate, endDate: rowEndDate, durationContributionMode },
    ])
  }
  const isMilestone = shouldMarkGeneratedRowAsMilestone(params.node, standardTaskMetadata)

  params.rows.push({
    clientRowId,
    parentClientRowId: params.parentClientRowId,
    parentRowId: params.parentClientRowId ? null : params.parentRowId,
    sortOrder,
    predecessorClientRowIds,
    predecessorDependencies,
    rowProjectionMode: standardTaskMetadata.rowProjectionMode,
    executionPhase,
    executionLane,
    executionSortKey,
    workfaceId,
    planItemKind: standardTaskMetadata.planItemKind,
    planItemTags: standardTaskMetadata.planItemTags,
    progressMode: standardTaskMetadata.progressMode,
    scheduleParticipation: standardTaskMetadata.scheduleParticipation,
    scopeExpansionMode: standardTaskMetadata.scopeExpansionMode,
    executionNature: standardTaskMetadata.executionNature,
    qualityControlRole: standardTaskMetadata.qualityControlRole,
    safetyControlRole: standardTaskMetadata.safetyControlRole,
    inspectionAcceptanceRole: standardTaskMetadata.inspectionAcceptanceRole,
    documentEvidenceRole: standardTaskMetadata.documentEvidenceRole,
    commercialControlRole: standardTaskMetadata.commercialControlRole,
    managementControlRole: standardTaskMetadata.managementControlRole,
    linkedProjectionSource: Object.keys(standardTaskMetadata.linkedProjectionSource).length > 0
      ? standardTaskMetadata.linkedProjectionSource
      : null,
    durationSuggestion,
    values: {
      title,
      planned_start_date: rowStartDate,
      planned_end_date: rowEndDate,
      start_date: rowStartDate,
      end_date: rowEndDate,
      progress: 0,
      status: 'todo',
      priority: 'medium',
      is_milestone: isMilestone,
      milestone_level: isMilestone ? 3 : null,
      is_wbs_summary: !['process', 'activity_step'].includes(params.node.categoryType),
      is_executable: ['process', 'activity_step'].includes(params.node.categoryType),
      wbs_node_type: params.node.categoryType,
      category_type: params.node.categoryType,
      template_id: params.node.templateId,
      template_node_id: params.node.id,
      source_template_id: params.node.templateId,
      source_template_node_id: params.node.id,
      template_group: standardTaskMetadata.templateGroup,
      pack_type: standardTaskMetadata.packType,
      generation_policy: standardTaskMetadata.generationPolicy,
      generation_batch_id: (params as any).generationBatchId ?? null,
      scope_index: params.scopeIndex,
      standard_work_code: params.node.standardWorkCode ?? params.node.stableCode,
      standard_work_name: standardWorkName,
      engineering_category_id: params.node.engineeringCategoryId,
      project_type_code: featureProfile.projectTypeCode,
      structure_type_code: featureProfile.structureTypeCode,
      method_variant_codes: featureProfile.methodVariantCodes,
      element_variant_code: elementVariant?.code ?? null,
      element_variant_name: elementVariant?.label ?? null,
      element_variant_source: elementVariant?.source ?? null,
      element_variant_confidence: elementVariant?.confidence ?? null,
      smart_reference_days: isDurationBearingContributionMode(standardTaskMetadata.durationContributionMode)
        ? readWritablePlanTaskDurationDays(durationSuggestion)
        : null,
      duration_calibration_source: durationSuggestion?.durationCalibrationSource ?? 'unavailable',
      duration_provenance: durationSuggestion?.durationProvenance ?? 'unavailable',
      duration_contribution_mode: standardTaskMetadata.durationContributionMode,
      row_projection_mode: standardTaskMetadata.rowProjectionMode,
      execution_phase: executionPhase,
      execution_lane: executionLane,
      execution_sort_key: executionSortKey,
      workface_id: workfaceId,
      duration_suggestion: standardTaskMetadata.durationSuggestion,
      package_child_rhythm_window_start_day: durationSuggestion?.packageChildRhythmWindowStartDay ?? null,
      package_child_rhythm_window_end_day: durationSuggestion?.packageChildRhythmWindowEndDay ?? null,
      package_child_rhythm_window_role: durationSuggestion?.packageChildRhythmWindowRole ?? null,
      execution_nature: standardTaskMetadata.executionNature,
      quality_control_role: standardTaskMetadata.qualityControlRole,
      safety_control_role: standardTaskMetadata.safetyControlRole,
      inspection_acceptance_role: standardTaskMetadata.inspectionAcceptanceRole,
      document_evidence_role: standardTaskMetadata.documentEvidenceRole,
      commercial_control_role: standardTaskMetadata.commercialControlRole,
      management_control_role: standardTaskMetadata.managementControlRole,
      precondition_templates: preconditionTemplates,
      acceptance_checkpoints: acceptanceCheckpoints,
      standard_task_metadata: standardTaskMetadata,
      material_required: preconditionTemplates.includes('material_accepted'),
      acceptance_required: acceptanceCheckpoints.length > 2,
      source_type: 'template',
      ...pickPersistableScopeValues(params.scope),
    },
  })

  const childGenerationDepth = getChildGenerationDepth(params.node, params.generationDepth, params.scope)
  for (const child of getGeneratableChildren(params.node, params.generationDepth, params.scope)) {
    const childVariants = deriveElementVariantsForGeneration(child, params.scope)
    if (childVariants.length > 0) {
      childVariants.forEach((childElementVariant) => {
        buildGeneratedRowsForNode({
          ...params,
          node: child,
          generationDepth: childGenerationDepth,
          parentClientRowId: clientRowId,
          parentRowId: null,
          elementVariant: childElementVariant,
          startDate: schedule.children.get(getScheduleChildKey(child, childElementVariant))?.start ?? schedule.start,
        })
      })
      continue
    }
    const inheritedElementVariant = params.node.categoryType === 'process' ? elementVariant : undefined
    buildGeneratedRowsForNode({
      ...params,
      node: child,
      generationDepth: childGenerationDepth,
      parentClientRowId: clientRowId,
      parentRowId: null,
      elementVariant: inheritedElementVariant,
      startDate: schedule.children.get(getScheduleChildKey(child, inheritedElementVariant ?? null))?.start
        ?? schedule.children.get(getScheduleChildKey(child, null))?.start
        ?? schedule.start,
    })
  }
}



export const DEPENDENCY_SCOPE_FIELDS = [
  'phase_object_id',
  'section_object_id',
  'building_object_id',
  'floor_object_id',
  'physical_zone_object_id',
]



export type DependencyScopeRule = V1475CrossItemWorkflowRule['scopeRule'] | V1475DependencyIntentTemplate['scopeRule']


export type ResolvedCrossItemWorkflowLag = {
  lagDays: number
  baseLagDays: number
  appliedConditionalLagProfile?: NonNullable<V1475CrossItemWorkflowRule['conditionalLagProfiles']>[number] | null
  matchedTriggerSignals: string[]
}



export function readRowMetadata(row: GeneratedTemplateRow) {
  return readRecord(row.values.standard_task_metadata)
}



export function readRowPackType(row: GeneratedTemplateRow): WbsTemplatePackType {
  return (normalizeId(row.values.pack_type) || normalizeId(readRowMetadata(row).packType) || 'core_quality') as WbsTemplatePackType
}



export function readRowStableCode(row: GeneratedTemplateRow) {
  const metadata = readRowMetadata(row)
  return normalizeText(metadata.stableCode ?? metadata.standardWorkCode ?? row.values.standard_work_code ?? row.values.template_node_id)
}



export function readRowCategoryType(row: GeneratedTemplateRow) {
  return normalizeText(row.values.category_type ?? row.values.wbs_node_type)
}



export function rowsShareGeneratedScopeInstance(left: GeneratedTemplateRow, right: GeneratedTemplateRow) {
  const leftScopeIndex = Number(left.values.scope_index)
  const rightScopeIndex = Number(right.values.scope_index)
  if (Number.isFinite(leftScopeIndex) && Number.isFinite(rightScopeIndex)) return leftScopeIndex === rightScopeIndex
  return rowsDoNotConflictOnScopeFields(left, right, DEPENDENCY_SCOPE_FIELDS)
}



export type RuntimeScopeAssignmentRule = {
  itemPackPattern: string
  effect: string
  functionalAreaCategory?: string
  matchFunctionalUsage?: string
  targetObjectType?: string
  target_object_type?: string
  matchMetadata?: Record<string, unknown>
  match_metadata?: Record<string, unknown>
  matchObjectName?: string
  match_object_name?: string
  priority: number
}



export type RuntimeScopeAssignmentRulesInput = RuntimeScopeAssignmentRule[] | null | undefined



export type RuntimeScopeObject = {
  id: string
  type: string
  name: string
  parentId: string | null
  metadata: Record<string, unknown>
}



export function readRuntimeScopeObjects(operation: PlanningTableOperation): RuntimeScopeObject[] {
  const scope = readRecord(operation.scope)
  return readArray(scope.scope_objects ?? scope.scopeObjects)
    .map((item) => {
      const record = readRecord(item)
      const id = normalizeText(record.id ?? record.objectId ?? record.object_id)
      const type = normalizeId(record.type ?? record.objectType ?? record.object_type)
      const name = normalizeText(record.name ?? record.objectName ?? record.object_name)
      if (!id || !type) return null
      return {
        id,
        type,
        name,
        parentId: normalizeText(record.parentId ?? record.parent_id) || null,
        metadata: readRecord(record.metadata),
      }
    })
    .filter((item): item is RuntimeScopeObject => Boolean(item))
}



export function textMatchesRulePattern(value: unknown, pattern: string) {
  const normalizedValue = normalizeText(value)
  const normalizedPattern = normalizeText(pattern)
  if (!normalizedValue || !normalizedPattern) return false
  if (normalizedPattern === '.*' || normalizedPattern === '*') return true
  if (
    normalizedValue === normalizedPattern
    || normalizedValue.startsWith(normalizedPattern)
    || normalizedValue.includes(normalizedPattern)
  ) {
    return true
  }
  try {
    return new RegExp(normalizedPattern, 'i').test(normalizedValue)
  } catch {
    return false
  }
}



export function rowMatchesScopeAssignmentRule(row: GeneratedTemplateRow, rule: RuntimeScopeAssignmentRule) {
  const metadata = readRowMetadata(row)
  const candidates = [
    readRowStableCode(row),
    row.values.standard_work_code,
    row.values.template_node_id,
    row.values.item_pack_code,
    row.values.itemPackCode,
    metadata.stableCode,
    metadata.standardWorkCode,
    metadata.itemPackCode,
    row.values.title,
    row.values.name,
  ]
  return candidates.some((candidate) => textMatchesRulePattern(candidate, rule.itemPackPattern))
}



export function metadataValueMatches(value: unknown, expected: unknown) {
  const normalizedValue = normalizeText(value)
  const normalizedExpected = normalizeText(expected)
  if (!normalizedValue || !normalizedExpected) return false
  return normalizedValue === normalizedExpected
    || normalizeId(normalizedValue) === normalizeId(normalizedExpected)
    || normalizedValue.includes(normalizedExpected)
    || normalizedExpected.includes(normalizedValue)
}



export function findScopeObjectsByMetadata(
  objects: RuntimeScopeObject[],
  type: string,
  metadataKeys: string[],
  expected: unknown,
) {
  return objects.filter((object) => (
    object.type === type
    && metadataKeys.some((key) => metadataValueMatches(object.metadata[key], expected))
  ))
}



export function scopeObjectMatchesMetadata(object: RuntimeScopeObject, matchMetadata: Record<string, unknown>) {
  const entries = Object.entries(matchMetadata).filter(([, expected]) => normalizeText(expected))
  if (entries.length === 0) return true
  return entries.every(([key, expected]) => metadataValueMatches(object.metadata[key], expected))
}



export function findScopeObjectsByRule(objects: RuntimeScopeObject[], rule: RuntimeScopeAssignmentRule) {
  const targetType = normalizeId(rule.targetObjectType ?? rule.target_object_type)
  if (!targetType) return []

  const matchMetadata = readRecord(rule.matchMetadata ?? rule.match_metadata)
  const matchObjectName = normalizeText(rule.matchObjectName ?? rule.match_object_name)
  const candidates = objects.filter((object) => object.type === targetType)
  return candidates.filter((object) => (
    (!matchObjectName || metadataValueMatches(object.name, matchObjectName))
    && scopeObjectMatchesMetadata(object, matchMetadata)
  ))
}



export function findScopeAssignmentTargetObjects(objects: RuntimeScopeObject[], rule: RuntimeScopeAssignmentRule) {
  const effect = normalizeText(rule.effect)
  if (effect === 'assign_to_scope_object') return findScopeObjectsByRule(objects, rule)
  if (effect === 'assign_to_all_buildings') return objects.filter((object) => object.type === 'building')
  if (effect === 'assign_to_matching_buildings' && rule.matchFunctionalUsage) {
    return findScopeObjectsByMetadata(
      objects,
      'building',
      ['functionalUsage', 'functional_usage', 'usageCode', 'usage_code'],
      rule.matchFunctionalUsage,
    )
  }
  if (effect === 'assign_to_functional_area' && rule.functionalAreaCategory) {
    return findScopeObjectsByMetadata(
      objects,
      'functional_area',
      ['functionalCategory', 'functional_category', 'category', 'specialRoomType', 'special_room_type'],
      rule.functionalAreaCategory,
    )
  }
  return []
}



export function collectRuntimeBuildingUsageFacts(operation: PlanningTableOperation, scopeObjects: RuntimeScopeObject[]) {
  const scope = readRecord(operation.scope)
  const projectFacts = readOperationProjectFacts(operation)
  const fromScopeFacts = readCodeArray(scope.functional_usage_codes ?? scope.functionalUsageCodes)
  const fromProjectFacts = readCodeArray(projectFacts.functionalUsageCodes ?? projectFacts.functional_usage_codes)
  const fromObjects = scopeObjects
    .filter((object) => object.type === 'building')
    .flatMap((object) => [
      object.metadata.functionalUsage,
      object.metadata.functional_usage,
      object.metadata.usageCode,
      object.metadata.usage_code,
    ])
    .map((value) => normalizeText(value).toLowerCase())
    .filter(Boolean)
  return uniqueStringArray([...fromScopeFacts, ...fromProjectFacts, ...fromObjects])
}



export function ruleTargetUsageIsAbsentFromExplicitFacts(
  rule: RuntimeScopeAssignmentRule,
  operation: PlanningTableOperation,
  scopeObjects: RuntimeScopeObject[],
) {
  if (normalizeText(rule.effect) !== 'assign_to_matching_buildings') return false
  const expectedUsage = normalizeText(rule.matchFunctionalUsage).toLowerCase()
  if (!expectedUsage) return false
  const usageFacts = collectRuntimeBuildingUsageFacts(operation, scopeObjects)
  return usageFacts.length > 0 && !usageFacts.some((usage) => metadataValueMatches(usage, expectedUsage))
}



export function collectDescendantClientRowIds(rows: GeneratedTemplateRow[], seedIds: Set<string>) {
  const removed = new Set(seedIds)
  let changed = true
  while (changed) {
    changed = false
    for (const row of rows) {
      if (!row.parentClientRowId || !removed.has(row.parentClientRowId) || removed.has(row.clientRowId)) continue
      removed.add(row.clientRowId)
      changed = true
    }
  }
  return removed
}



export function removeGeneratedRowsByClientIds(rows: GeneratedTemplateRow[], removedClientRowIds: Set<string>) {
  if (removedClientRowIds.size === 0) return rows
  return rows
    .filter((row) => !removedClientRowIds.has(row.clientRowId))
    .map((row) => ({
      ...row,
      predecessorClientRowIds: row.predecessorClientRowIds.filter((id) => !removedClientRowIds.has(id)),
      predecessorDependencies: row.predecessorDependencies.filter((dependency) => !removedClientRowIds.has(dependency.clientRowId)),
    }))
}



export function suppressRowsForAbsentOptionalMatchingBuildingUsage(
  rows: GeneratedTemplateRow[],
  rulesInput: RuntimeScopeAssignmentRule[] | null | undefined,
  operation: PlanningTableOperation,
) {
  const rules = normalizeRuntimeScopeAssignmentRules(rulesInput)
  if (rules.length === 0) return rows

  const scopeObjects = readRuntimeScopeObjects(operation)
  if (scopeObjects.length === 0) return rows

  const seedIds = new Set<string>()
  for (const rule of rules) {
    if (!ruleTargetUsageIsAbsentFromExplicitFacts(rule, operation, scopeObjects)) continue
    for (const row of rows) {
      if (rowMatchesScopeAssignmentRule(row, rule)) seedIds.add(row.clientRowId)
    }
  }
  return removeGeneratedRowsByClientIds(rows, collectDescendantClientRowIds(rows, seedIds))
}



export function clearScopeObjectFields(row: GeneratedTemplateRow) {
  for (const field of Object.values(SCOPE_OBJECT_FIELD_BY_TYPE)) {
    row.values[field] = null
  }
}



export function applyRuntimeScopeObjectLineageToRow(
  row: GeneratedTemplateRow,
  object: RuntimeScopeObject,
  scopeObjects: RuntimeScopeObject[],
) {
  const byId = new Map(scopeObjects.map((scopeObject) => [scopeObject.id, scopeObject]))
  let current: RuntimeScopeObject | undefined = object
  const visited = new Set<string>()
  while (current && !visited.has(current.id)) {
    visited.add(current.id)
    const field = SCOPE_OBJECT_FIELD_BY_TYPE[current.type]
    if (field) row.values[field] = current.id
    current = current.parentId ? byId.get(current.parentId) : undefined
  }
}



export function assignScopeObjectToRow(
  row: GeneratedTemplateRow,
  object: RuntimeScopeObject,
  rule: RuntimeScopeAssignmentRule,
  scopeObjects: RuntimeScopeObject[],
) {
  const targetField = SCOPE_OBJECT_FIELD_BY_TYPE[object.type]
  if (!targetField) return
  clearScopeObjectFields(row)
  applyRuntimeScopeObjectLineageToRow(row, object, scopeObjects)
  row.values.scope_assignment_rule = rule.itemPackPattern
}



export function buildRuntimeScopeAssignmentRuleKey(rule: RuntimeScopeAssignmentRule) {
  return [
    rule.itemPackPattern,
    rule.effect,
    rule.targetObjectType ?? rule.target_object_type ?? '',
    JSON.stringify(rule.matchMetadata ?? rule.match_metadata ?? {}),
    rule.matchObjectName ?? rule.match_object_name ?? '',
  ].join('|')
}



export function buildScopeCloneClientRowId(clientRowId: string, object: RuntimeScopeObject, targetIndex: number) {
  const suffix = normalizeId(object.id).replace(/[^a-z0-9_-]/gi, '_') || `target_${targetIndex + 1}`
  return `${clientRowId}:scope-${suffix}`
}



export function expandRowsAcrossScopeObjects(
  rows: GeneratedTemplateRow[],
  rule: RuntimeScopeAssignmentRule,
  objects: RuntimeScopeObject[],
  allScopeObjects: RuntimeScopeObject[],
) {
  if (objects.length <= 1) return rows

  const matchedRows = rows.filter((row) => rowMatchesScopeAssignmentRule(row, rule))
  if (matchedRows.length === 0) return rows

  const matchedIds = new Set(matchedRows.map((row) => row.clientRowId))
  for (const row of matchedRows) assignScopeObjectToRow(row, objects[0], rule, allScopeObjects)

  const clones: GeneratedTemplateRow[] = []
  for (const [targetIndex, object] of objects.slice(1).entries()) {
    const idMap = new Map<string, string>()
    for (const row of matchedRows) {
      idMap.set(row.clientRowId, buildScopeCloneClientRowId(row.clientRowId, object, targetIndex + 1))
    }

    for (const row of matchedRows) {
      const clone: GeneratedTemplateRow = {
        ...row,
        clientRowId: idMap.get(row.clientRowId) ?? row.clientRowId,
        parentClientRowId: row.parentClientRowId && matchedIds.has(row.parentClientRowId)
          ? idMap.get(row.parentClientRowId) ?? row.parentClientRowId
          : row.parentClientRowId,
        values: { ...row.values },
        predecessorClientRowIds: row.predecessorClientRowIds.map((id) => idMap.get(id) ?? id),
        predecessorDependencies: row.predecessorDependencies.map((dependency) => ({
          ...dependency,
          clientRowId: idMap.get(dependency.clientRowId) ?? dependency.clientRowId,
        })),
        planItemTags: row.planItemTags ? [...row.planItemTags] : row.planItemTags,
        linkedProjectionSource: row.linkedProjectionSource ? { ...row.linkedProjectionSource } : row.linkedProjectionSource,
        durationSuggestion: row.durationSuggestion ? { ...row.durationSuggestion } : row.durationSuggestion,
      }
      assignScopeObjectToRow(clone, object, rule, allScopeObjects)
      clones.push(clone)
    }
  }

  return [...rows, ...clones]
}



export type ScopeAssignmentTarget = {
  rule: RuntimeScopeAssignmentRule
  object: RuntimeScopeObject
}



export function buildScopeAssignmentExpansionGroupKey(rule: RuntimeScopeAssignmentRule) {
  return [
    normalizeText(rule.itemPackPattern),
    normalizeId(rule.effect),
    normalizeId(rule.targetObjectType ?? rule.target_object_type),
    normalizeText(rule.matchFunctionalUsage),
    normalizeText(rule.functionalAreaCategory),
    normalizeText(rule.matchObjectName ?? rule.match_object_name),
  ].join('|')
}



export function buildScopeAssignmentTargetPresenceGroupKey(rule: RuntimeScopeAssignmentRule) {
  return [
    normalizeText(rule.itemPackPattern),
    normalizeId(rule.effect),
    normalizeId(rule.targetObjectType ?? rule.target_object_type),
    normalizeText(rule.matchFunctionalUsage),
    normalizeText(rule.functionalAreaCategory),
    normalizeText(rule.matchObjectName ?? rule.match_object_name),
  ].join('|')
}



export function collectScopeAssignmentExpansionGroups(
  rules: RuntimeScopeAssignmentRule[],
  scopeObjects: RuntimeScopeObject[],
) {
  const groups = new Map<string, ScopeAssignmentTarget[]>()

  for (const rule of rules) {
    const matchedObjects = findScopeAssignmentTargetObjects(scopeObjects, rule)
    if (matchedObjects.length === 0) continue

    const key = buildScopeAssignmentExpansionGroupKey(rule)
    const group = groups.get(key) ?? []
    for (const object of matchedObjects) {
      if (group.some((target) => target.object.id === object.id)) continue
      group.push({ rule, object })
    }
    groups.set(key, group)
  }

  return [...groups.values()].filter((group) => group.length > 1)
}



export function expandRowsAcrossScopeAssignmentTargets(
  rows: GeneratedTemplateRow[],
  targets: ScopeAssignmentTarget[],
  allScopeObjects: RuntimeScopeObject[],
) {
  if (targets.length <= 1) return rows

  const matchedRows = rows.filter((row) => targets.some((target) => rowMatchesScopeAssignmentRule(row, target.rule)))
  if (matchedRows.length === 0) return rows

  const matchedIds = new Set(matchedRows.map((row) => row.clientRowId))
  const [firstTarget, ...cloneTargets] = targets
  for (const row of matchedRows) assignScopeObjectToRow(row, firstTarget.object, firstTarget.rule, allScopeObjects)

  const clones: GeneratedTemplateRow[] = []
  for (const [targetIndex, target] of cloneTargets.entries()) {
    const idMap = new Map<string, string>()
    for (const row of matchedRows) {
      idMap.set(row.clientRowId, buildScopeCloneClientRowId(row.clientRowId, target.object, targetIndex + 1))
    }

    for (const row of matchedRows) {
      const clone: GeneratedTemplateRow = {
        ...row,
        clientRowId: idMap.get(row.clientRowId) ?? row.clientRowId,
        parentClientRowId: row.parentClientRowId && matchedIds.has(row.parentClientRowId)
          ? idMap.get(row.parentClientRowId) ?? row.parentClientRowId
          : row.parentClientRowId,
        values: { ...row.values },
        predecessorClientRowIds: row.predecessorClientRowIds.map((id) => idMap.get(id) ?? id),
        predecessorDependencies: row.predecessorDependencies.map((dependency) => ({
          ...dependency,
          clientRowId: idMap.get(dependency.clientRowId) ?? dependency.clientRowId,
        })),
        planItemTags: row.planItemTags ? [...row.planItemTags] : row.planItemTags,
        linkedProjectionSource: row.linkedProjectionSource ? { ...row.linkedProjectionSource } : row.linkedProjectionSource,
        durationSuggestion: row.durationSuggestion ? { ...row.durationSuggestion } : row.durationSuggestion,
      }
      assignScopeObjectToRow(clone, target.object, target.rule, allScopeObjects)
      clones.push(clone)
    }
  }

  return [...rows, ...clones]
}



export function applyScopeAssignmentRules(
  rows: GeneratedTemplateRow[],
  rulesInput: RuntimeScopeAssignmentRule[] | null | undefined,
  operation: PlanningTableOperation,
): GeneratedTemplateRow[] {
  const rules = readArray(rulesInput)
    .map((rule) => readRecord(rule) as RuntimeScopeAssignmentRule)
    .filter((rule) => normalizeText(rule.itemPackPattern) && normalizeText(rule.effect))
    .sort((left, right) => (Number(left.priority ?? 0) || 0) - (Number(right.priority ?? 0) || 0))
  if (rules.length === 0) return rows

  const scopeObjects = readRuntimeScopeObjects(operation)
  if (scopeObjects.length === 0) return rows

  let assignedRows = rows
  const expandedRuleKeys = new Set<string>()
  for (const targets of collectScopeAssignmentExpansionGroups(rules, scopeObjects)) {
    const beforeCount = assignedRows.length
    assignedRows = expandRowsAcrossScopeAssignmentTargets(assignedRows, targets, scopeObjects)
    if (assignedRows.length === beforeCount && !targets.some((target) => assignedRows.some((row) => rowMatchesScopeAssignmentRule(row, target.rule)))) {
      continue
    }
    for (const target of targets) expandedRuleKeys.add(buildRuntimeScopeAssignmentRuleKey(target.rule))
  }

  for (const row of assignedRows) {
    for (const rule of rules) {
      if (!rowMatchesScopeAssignmentRule(row, rule)) continue

      if (expandedRuleKeys.has(buildRuntimeScopeAssignmentRuleKey(rule))) continue
      const matchedObject = findScopeAssignmentTargetObjects(scopeObjects, rule)[0] ?? null
      if (matchedObject) assignScopeObjectToRow(row, matchedObject, rule, scopeObjects)
    }
  }

  return assignedRows
}



export function normalizeRuntimeScopeAssignmentRules(rulesInput: RuntimeScopeAssignmentRule[] | null | undefined) {
  return readArray(rulesInput)
    .map((rule) => readRecord(rule) as RuntimeScopeAssignmentRule)
    .filter((rule) => normalizeText(rule.itemPackPattern) && normalizeText(rule.effect))
    .sort((left, right) => (Number(left.priority ?? 0) || 0) - (Number(right.priority ?? 0) || 0))
}



export function readScopeAssignmentRulesFromOperation(operation: PlanningTableOperation): RuntimeScopeAssignmentRulesInput {
  const direct = readArray(operation.scopeAssignmentRules ?? operation.scope_assignment_rules)
  if (direct.length > 0) return direct as RuntimeScopeAssignmentRule[]

  const clientContext = readRecord(operation.clientContext ?? operation.client_context)
  const contextRules = readArray(clientContext.scopeAssignmentRules ?? clientContext.scope_assignment_rules)
  return contextRules.length > 0 ? contextRules as RuntimeScopeAssignmentRule[] : null
}



export function getScopeAssignmentMissingObjectLabel(rule: RuntimeScopeAssignmentRule) {
  const effect = normalizeText(rule.effect)
  if (effect === 'assign_to_functional_area') return '功能区域'
  if (effect === 'assign_to_matching_buildings' || effect === 'assign_to_all_buildings') return '楼栋'

  const targetType = normalizeId(rule.targetObjectType ?? rule.target_object_type)
  const matchMetadata = readRecord(rule.matchMetadata ?? rule.match_metadata)
  const physicalSpaceKind = normalizeId(matchMetadata.physicalSpaceKind ?? matchMetadata.physical_space_kind)
  const physicalCategory = normalizeId(matchMetadata.physicalCategory ?? matchMetadata.physical_category)
  const floorUsage = normalizeId(matchMetadata.floorUsage ?? matchMetadata.floor_usage)

  if (targetType === 'basement') return '地下室'
  if (targetType === 'floor') {
    if (floorUsage === 'refuge') return '避难层'
    if (floorUsage === 'ground_pilotis') return '架空层'
    if (floorUsage === 'mechanical') return '设备层'
    if (floorUsage === 'transfer') return '转换层'
    return '特殊楼层'
  }
  if (targetType === 'physical_zone') {
    if (physicalSpaceKind === 'outdoor_site') return '室外总平'
    if (physicalSpaceKind === 'independent_engineering_zone') {
      const categoryLabel = normalizeText(matchMetadata.physicalCategoryLabel ?? matchMetadata.physical_category_label)
      if (categoryLabel) return categoryLabel
      const knownLabels: Record<string, string> = {
        switching_station: '开闭所',
        fire_pump_room: '消防泵房',
        heat_exchange_station: '换热站',
        waste_room: '垃圾房',
        liquid_oxygen_station: '液氧站',
        sewage_treatment_station: '污水处理站',
        medical_waste_holding: '医疗废物暂存间',
        hyperbaric_oxygen_chamber: '高压氧舱',
        substation: '变配电所',
        generator_yard: '柴油发电机区',
        cooling_plant: '冷站',
        transfer_passage: '换乘通道',
        traffic_connection_zone: '交通接驳区',
      }
      return knownLabels[physicalCategory] ?? '独立工程区'
    }
    return '工程区域'
  }
  if (targetType === 'functional_area') return '功能区域'
  return '对应空间'
}



export function findRowsMatchingScopeAssignmentRule(rows: GeneratedTemplateRow[], rule: RuntimeScopeAssignmentRule) {
  return rows.filter((row) => rowMatchesScopeAssignmentRule(row, rule))
}



export function collectScopeAssignmentMissingTargetWarnings(
  rows: GeneratedTemplateRow[],
  rulesInput: RuntimeScopeAssignmentRule[] | null | undefined,
  operation: PlanningTableOperation,
): GeneratedTemplateGovernanceWarning[] {
  const rules = normalizeRuntimeScopeAssignmentRules(rulesInput)
  if (rules.length === 0) return []

  const scopeObjects = readRuntimeScopeObjects(operation)
  const warnings: GeneratedTemplateGovernanceWarning[] = []
  const emitted = new Set<string>()
  const targetPresenceGroups = new Set(
    rules
      .filter((rule) => findScopeAssignmentTargetObjects(scopeObjects, rule).length > 0)
      .map(buildScopeAssignmentTargetPresenceGroupKey),
  )

  for (const rule of rules) {
    const matchedRows = findRowsMatchingScopeAssignmentRule(rows, rule)
    if (matchedRows.length === 0) continue

    let targetObjects: RuntimeScopeObject[] = []
    const effect = normalizeText(rule.effect)
    targetObjects = findScopeAssignmentTargetObjects(scopeObjects, rule)
    if (
      ![
        'assign_to_scope_object',
        'assign_to_functional_area',
        'assign_to_matching_buildings',
        'assign_to_all_buildings',
      ].includes(effect)
    ) {
      continue
    }

    if (targetObjects.length > 0) continue
    if (targetPresenceGroups.has(buildScopeAssignmentTargetPresenceGroupKey(rule))) continue

    const stableCodes = uniqueStringArray(matchedRows.map(readRowStableCode).filter(Boolean))
    const nodeCode = stableCodes[0] ?? normalizeText(rule.itemPackPattern)
    const targetObjectType = normalizeId(rule.targetObjectType ?? rule.target_object_type)
    const missingObjectLabel = getScopeAssignmentMissingObjectLabel(rule)
    const warningKey = [
      normalizeText(rule.itemPackPattern),
      effect,
      targetObjectType,
      JSON.stringify(rule.matchMetadata ?? rule.match_metadata ?? {}),
      normalizeText(rule.matchObjectName ?? rule.match_object_name),
      nodeCode,
    ].join('|')
    if (emitted.has(warningKey)) continue
    emitted.add(warningKey)

    warnings.push({
      code: 'SCOPE_ASSIGNMENT_TARGET_NOT_FOUND',
      severity: 'error',
      nodeCode,
      message: `Template rows match ${rule.itemPackPattern}, but the project scope does not contain the required ${missingObjectLabel} object.`,
      details: {
        itemPackPattern: rule.itemPackPattern,
        effect,
        targetObjectType: targetObjectType || null,
        matchMetadata: readRecord(rule.matchMetadata ?? rule.match_metadata),
        matchObjectName: normalizeText(rule.matchObjectName ?? rule.match_object_name) || null,
        missingObjectLabel,
        matchedRowCount: matchedRows.length,
        matchedStableCodes: stableCodes,
      },
    })
  }

  return warnings
}



export const SCOPE_OBJECT_FIELD_BY_TYPE: Record<string, string | undefined> = TASK_SCOPE_OBJECT_ID_KEY_BY_OBJECT_TYPE



export function applyScopeObjectLineage(rows: GeneratedTemplateRow[], operation: PlanningTableOperation) {
  const scopeObjects = readRuntimeScopeObjects(operation)
  if (scopeObjects.length === 0) return

  const byId = new Map(scopeObjects.map((object) => [object.id, object]))
  const anchorFields = [
    'functional_area_object_id',
    'physical_zone_object_id',
    'floor_object_id',
    'building_object_id',
    'basement_object_id',
    'section_object_id',
    'phase_object_id',
  ]

  for (const row of rows) {
    const anchorId = anchorFields.map((field) => normalizeText(row.values[field])).find(Boolean)
    if (!anchorId) continue

    let current = byId.get(anchorId)
    const visited = new Set<string>()
    while (current && !visited.has(current.id)) {
      visited.add(current.id)
      const field = SCOPE_OBJECT_FIELD_BY_TYPE[current.type]
      if (field && !row.values[field]) row.values[field] = current.id
      current = current.parentId ? byId.get(current.parentId) : undefined
    }
  }
}



export function rowIsSuppressedByCoreReplacement(row: GeneratedTemplateRow, replacementCodes: ReadonlySet<string>) {
  if (!replacementCodes.size || readRowPackType(row) !== 'core_quality') return false
  if (!['process', 'activity_step'].includes(readRowCategoryType(row))) return false
  const stableCode = readRowStableCode(row)
  return [...replacementCodes].some((code) => codeMatchesReplacementCode(stableCode, code))
}



export function suppressCoreRowsReplacedBySpecialty(rows: GeneratedTemplateRow[], replacementCodes: ReadonlySet<string>) {
  if (!replacementCodes.size) return rows
  const removedClientRowIds = new Set(
    rows
      .filter((row) => rowIsSuppressedByCoreReplacement(row, replacementCodes))
      .map((row) => row.clientRowId),
  )
  if (removedClientRowIds.size === 0) return rows

  return rows
    .filter((row) => !removedClientRowIds.has(row.clientRowId))
    .map((row) => ({
      ...row,
      predecessorClientRowIds: row.predecessorClientRowIds.filter((id) => !removedClientRowIds.has(id)),
      predecessorDependencies: row.predecessorDependencies.filter((dependency) => !removedClientRowIds.has(dependency.clientRowId)),
    }))
}



export function rowMatchesReferencedCode(row: GeneratedTemplateRow, code: string) {
  const normalizedCode = normalizeText(code)
  if (!normalizedCode) return false
  const metadata = readRowMetadata(row)
  const floorRhythm = readRecord(metadata.floorRhythm)
  return [
    row.values.template_node_id,
    row.values.source_template_node_id,
    row.values.standard_work_code,
    metadata.stableCode,
    metadata.standardWorkCode,
    metadata.templateNodeId,
    floorRhythm.stableCode,
    floorRhythm.rhythmNodeStableCode,
  ].some((value) => {
    const candidate = normalizeText(value)
    return candidate === normalizedCode || Boolean(candidate && normalizedCode.startsWith(`${candidate}-`))
  })
}



export function rowScopeValue(row: GeneratedTemplateRow, field: string) {
  return normalizeText(row.values[field])
}



export function rowFloorSeriesCoversObject(row: GeneratedTemplateRow, floorObjectId: string) {
  if (!floorObjectId) return false
  const metadata = readRowMetadata(row)
  const floorRhythm = readRecord(metadata.floorRhythm)
  const floorSeries = readRecord(metadata.floorSeries)
  const rhythmFloors = readArray(floorRhythm.floors)
  const seriesFloors = readArray(floorSeries.floors)
  return [...rhythmFloors, ...seriesFloors].some((item) => {
    const record = readRecord(item)
    return normalizeText(record.floorObjectId ?? record.floor_object_id) === floorObjectId
  })
}



export function rowHasFloorScopeEvidence(row: GeneratedTemplateRow) {
  if (rowScopeValue(row, 'floor_object_id')) return true
  const metadata = readRowMetadata(row)
  const floorRhythm = readRecord(metadata.floorRhythm)
  const floorSeries = readRecord(metadata.floorSeries)
  return [...readArray(floorRhythm.floors), ...readArray(floorSeries.floors)]
    .some((item) => normalizeText(readRecord(item).floorObjectId ?? readRecord(item).floor_object_id))
}



export function rowsDoNotConflictOnScopeFields(left: GeneratedTemplateRow, right: GeneratedTemplateRow, fields: string[]) {
  return fields.every((field) => {
    const leftValue = rowScopeValue(left, field)
    const rightValue = rowScopeValue(right, field)
    return !leftValue || !rightValue || leftValue === rightValue
  })
}



export function rowsMatchRequiredScopeFields(left: GeneratedTemplateRow, right: GeneratedTemplateRow, fields: string[]) {
  return fields.every((field) => {
    const leftValue = rowScopeValue(left, field)
    const rightValue = rowScopeValue(right, field)
    if (field === 'floor_object_id') {
      if (leftValue && !rightValue && rowFloorSeriesCoversObject(right, leftValue)) return true
      if (rightValue && !leftValue && rowFloorSeriesCoversObject(left, rightValue)) return true
    }
    return !leftValue || !rightValue || leftValue === rightValue
  })
}



export function rowsShareProjectOrganizationScope(left: GeneratedTemplateRow, right: GeneratedTemplateRow) {
  const leftOrg = readRecord(readRowMetadata(left).projectOrganization)
  const rightOrg = readRecord(readRowMetadata(right).projectOrganization)
  const leftPolicy = normalizeText(leftOrg.policyId ?? left.values.project_organization_policy_id)
  const rightPolicy = normalizeText(rightOrg.policyId ?? right.values.project_organization_policy_id)
  if (!leftPolicy || !rightPolicy || leftPolicy !== rightPolicy) return false
  const leftGroup = normalizeText(leftOrg.organizationScopeGroup ?? left.values.organization_scope_group)
  const rightGroup = normalizeText(rightOrg.organizationScopeGroup ?? right.values.organization_scope_group)
  if (leftGroup && rightGroup && leftGroup === rightGroup) return true
  const leftLane = normalizeText(leftOrg.organizationLane ?? left.values.organization_lane)
  const rightLane = normalizeText(rightOrg.organizationLane ?? right.values.organization_lane)
  return Boolean(leftLane && rightLane && leftLane === rightLane)
}



export function rowsHaveMissingRequiredScopeEvidence(left: GeneratedTemplateRow, right: GeneratedTemplateRow, fields: string[]) {
  return fields.some((field) => {
    if (field === 'floor_object_id') {
      const leftHasFloor = rowScopeValue(left, field) || rowHasFloorScopeEvidence(left)
      const rightHasFloor = rowScopeValue(right, field) || rowHasFloorScopeEvidence(right)
      return !leftHasFloor || !rightHasFloor
    }
    return !rowScopeValue(left, field) || !rowScopeValue(right, field)
  })
}



export function rowsHaveOrganizationCompatibleDependencyScope(
  left: GeneratedTemplateRow,
  right: GeneratedTemplateRow,
  scopeRule: DependencyScopeRule,
) {
  if (scopeRule === 'same_project' || scopeRule === 'same_phase') return false
  if (!rowsShareProjectOrganizationScope(left, right)) return false
  if (!rowsDoNotConflictOnScopeFields(left, right, DEPENDENCY_SCOPE_FIELDS)) return false
  const requiredFields = scopeRule === 'same_building'
    ? ['building_object_id']
    : scopeRule === 'same_floor'
      ? ['floor_object_id']
      : scopeRule === 'same_zone' || scopeRule === 'same_unit'
        ? ['physical_zone_object_id']
        : scopeRule === 'same_system'
          ? ['functional_area_object_id', 'physical_zone_object_id']
          : []
  return requiredFields.length > 0 && rowsHaveMissingRequiredScopeEvidence(left, right, requiredFields)
}



export function dependencyUsesProjectOrganizationScopeFallback(
  left: GeneratedTemplateRow,
  right: GeneratedTemplateRow,
  scopeRule: DependencyScopeRule,
) {
  return rowsHaveOrganizationCompatibleDependencyScope(left, right, scopeRule)
}



export function rowsHaveCompatibleDependencyScope(
  left: GeneratedTemplateRow,
  right: GeneratedTemplateRow,
  scopeRule: DependencyScopeRule = 'same_project',
) {
  if (scopeRule === 'same_project') return true

  if (scopeRule === 'same_phase') {
    return rowsMatchRequiredScopeFields(left, right, ['phase_object_id'])
  }

  if (scopeRule === 'same_building') {
    const leftBuilding = rowScopeValue(left, 'building_object_id')
    const rightBuilding = rowScopeValue(right, 'building_object_id')
    if (leftBuilding
      && rightBuilding
      && leftBuilding === rightBuilding
      && rowsDoNotConflictOnScopeFields(left, right, ['phase_object_id', 'section_object_id', 'floor_object_id'])
    ) return true
    return rowsHaveOrganizationCompatibleDependencyScope(left, right, scopeRule)
  }

  if (scopeRule === 'next_floor') {
    const leftIndex = Number(left.values.floor_sequence_index)
    const rightIndex = Number(right.values.floor_sequence_index)
    return rowsDoNotConflictOnScopeFields(left, right, ['phase_object_id', 'section_object_id', 'building_object_id'])
      && rowsMatchRequiredScopeFields(left, right, ['building_object_id'])
      && Number.isFinite(leftIndex)
      && Number.isFinite(rightIndex)
      && leftIndex === rightIndex + 1
  }

  if (scopeRule === 'same_floor') {
    if (rowsDoNotConflictOnScopeFields(left, right, ['phase_object_id', 'section_object_id', 'building_object_id'])
      && rowHasFloorScopeEvidence(left)
      && rowHasFloorScopeEvidence(right)
      && rowsMatchRequiredScopeFields(left, right, ['floor_object_id'])
    ) return true
    return rowsHaveOrganizationCompatibleDependencyScope(left, right, scopeRule)
  }

  if (scopeRule === 'same_zone' || scopeRule === 'same_unit') {
    if (rowsDoNotConflictOnScopeFields(left, right, ['phase_object_id', 'section_object_id', 'building_object_id', 'floor_object_id'])
      && Boolean(rowScopeValue(left, 'physical_zone_object_id'))
      && Boolean(rowScopeValue(right, 'physical_zone_object_id'))
      && rowsMatchRequiredScopeFields(left, right, ['physical_zone_object_id'])
    ) return true
    return rowsHaveOrganizationCompatibleDependencyScope(left, right, scopeRule)
  }

  if (scopeRule === 'same_system') {
    if (Boolean(rowScopeValue(left, 'functional_area_object_id') || rowScopeValue(left, 'physical_zone_object_id'))
      && Boolean(rowScopeValue(right, 'functional_area_object_id') || rowScopeValue(right, 'physical_zone_object_id'))
      && rowsDoNotConflictOnScopeFields(left, right, DEPENDENCY_SCOPE_FIELDS)
    ) return true
    return rowsHaveOrganizationCompatibleDependencyScope(left, right, scopeRule)
  }

  return rowsDoNotConflictOnScopeFields(left, right, DEPENDENCY_SCOPE_FIELDS)
}



export function rowsHaveCoarseCrossItemWorkflowScope(
  left: GeneratedTemplateRow,
  right: GeneratedTemplateRow,
  scopeRule: DependencyScopeRule,
) {
  if (scopeRule === 'same_floor') {
    const leftHasFloor = rowScopeValue(left, 'floor_object_id') || rowHasFloorScopeEvidence(left)
    const rightHasFloor = rowScopeValue(right, 'floor_object_id') || rowHasFloorScopeEvidence(right)
    if (leftHasFloor || rightHasFloor) return false
    if (!rowsDoNotConflictOnScopeFields(left, right, ['phase_object_id', 'section_object_id', 'building_object_id', 'physical_zone_object_id'])) return false
    const leftZone = rowScopeValue(left, 'physical_zone_object_id')
    const rightZone = rowScopeValue(right, 'physical_zone_object_id')
    if (leftZone && rightZone && leftZone === rightZone) return true
    const leftBuilding = rowScopeValue(left, 'building_object_id')
    const rightBuilding = rowScopeValue(right, 'building_object_id')
    return Boolean(leftBuilding && rightBuilding && leftBuilding === rightBuilding && !leftZone && !rightZone)
  }

  if (scopeRule === 'same_system') {
    const leftHasSystemScope = rowScopeValue(left, 'functional_area_object_id') || rowScopeValue(left, 'physical_zone_object_id')
    const rightHasSystemScope = rowScopeValue(right, 'functional_area_object_id') || rowScopeValue(right, 'physical_zone_object_id')
    if (leftHasSystemScope || rightHasSystemScope) return false
    if (!rowsDoNotConflictOnScopeFields(left, right, ['phase_object_id', 'section_object_id', 'building_object_id'])) return false
    const leftBuilding = rowScopeValue(left, 'building_object_id')
    const rightBuilding = rowScopeValue(right, 'building_object_id')
    return Boolean(leftBuilding && rightBuilding && leftBuilding === rightBuilding)
  }

  return false
}



export function rowsHaveCompatibleCrossItemWorkflowScope(
  left: GeneratedTemplateRow,
  right: GeneratedTemplateRow,
  rule: V1475CrossItemWorkflowRule,
) {
  return rowsHaveCompatibleDependencyScope(left, right, rule.scopeRule)
    || rowsHaveCoarseCrossItemWorkflowScope(left, right, rule.scopeRule)
}



export function addGeneratedDependency(row: GeneratedTemplateRow, dependency: GeneratedTemplateDependency) {
  const exists = row.predecessorDependencies.some((item) => (
    item.clientRowId === dependency.clientRowId
    && item.dependencyType === dependency.dependencyType
    && item.lagDays === dependency.lagDays
  ))
  if (exists) return false
  row.predecessorDependencies.push(dependency)
  if (!row.predecessorClientRowIds.includes(dependency.clientRowId)) {
    row.predecessorClientRowIds.push(dependency.clientRowId)
  }
  return true
}



export function rowMatchesCodePrefix(row: GeneratedTemplateRow, prefix: string) {
  const stableCode = readRowStableCode(row)
  const normalizedPrefix = normalizeText(prefix)
  if (!stableCode || !normalizedPrefix) return false
  return stableCode === normalizedPrefix
    || stableCode.startsWith(`${normalizedPrefix}-`)
    || stableCode.startsWith(`${normalizedPrefix}:`)
}



export function rowMatchesAnyCodePrefix(row: GeneratedTemplateRow, prefixes: string[]) {
  return prefixes.some((prefix) => rowMatchesCodePrefix(row, prefix))
}



export function rowMatchesAnyExcludedCodePrefix(row: GeneratedTemplateRow, prefixes?: string[]) {
  return Array.isArray(prefixes)
    && prefixes.length > 0
    && rowMatchesAnyCodePrefix(row, prefixes)
}



export function rowMatchesAnyExcludedStableCode(row: GeneratedTemplateRow, stableCodes?: string[]) {
  if (!Array.isArray(stableCodes) || stableCodes.length === 0) return false
  const stableCode = readRowStableCode(row)
  return stableCodes.some((code) => stableCode === normalizeText(code))
}



export function rowMatchesCategoryTypes(row: GeneratedTemplateRow, categoryTypes: string[] | undefined) {
  if (!categoryTypes || categoryTypes.length === 0) return true
  const categoryType = readRowCategoryType(row)
  return categoryTypes.map(normalizeText).includes(categoryType)
}



export function pickCrossItemWorkflowCandidates(
  candidates: GeneratedTemplateRow[],
  prefixes: string[],
) {
  const exact = candidates.filter((row) => prefixes.some((prefix) => readRowStableCode(row) === normalizeText(prefix)))
  if (exact.length > 0) return exact

  const categoryPriority = ['sub_division', 'item_work', 'division']
  for (const category of categoryPriority) {
    const scoped = candidates.filter((row) => readRowCategoryType(row) === category)
    if (scoped.length > 0) return scoped
  }
  return candidates
}



export function isBuildingRhythmAggregateRow(row: GeneratedTemplateRow) {
  const metadata = readRowMetadata(row)
  const floorRhythm = readRecord(metadata.floorRhythm)
  return normalizeId(row.scopeExpansionMode ?? row.values.scope_expansion_mode ?? metadata.scopeExpansionMode) === 'building_rhythm_series'
    || normalizeId(floorRhythm.scopeExpansionMode) === 'building_rhythm_series'
}



export function filterRhythmAggregatedWorkflowCandidates(
  candidates: GeneratedTemplateRow[],
  rule: V1475CrossItemWorkflowRule,
) {
  if (rule.rhythmAggregationPolicy !== 'building_level_anchor_no_floor_cartesian_edges') return candidates
  return candidates.filter((row) => (
    isBuildingRhythmAggregateRow(row)
    || !rowScopeValue(row, 'floor_object_id')
  ))
}



export function crossItemWorkflowManagedFrontierAnchorCodes(prefixes: string[]) {
  return uniqueStringArray(prefixes
    .map((prefix) => normalizeText(prefix).replace(/-P\d+$/i, ''))
    .filter(Boolean))
}



export function collectCrossItemWorkflowCandidates(
  rows: GeneratedTemplateRow[],
  rule: V1475CrossItemWorkflowRule,
  role: 'predecessor' | 'successor',
) {
  const prefixes = role === 'predecessor'
    ? rule.predecessorCodePrefixes
    : rule.successorCodePrefixes
  const excludedPrefixes = role === 'predecessor'
    ? rule.excludedPredecessorCodePrefixes
    : rule.excludedSuccessorCodePrefixes
  const excludedStableCodes = role === 'predecessor'
    ? rule.excludedPredecessorStableCodes
    : rule.excludedSuccessorStableCodes
  const categoryTypes = role === 'predecessor'
    ? rule.predecessorCategoryTypes
    : rule.successorCategoryTypes
  const allowedModes = role === 'predecessor'
    ? rule.predecessorAnchorDurationContributionModes
    : rule.successorAnchorDurationContributionModes
  const directCandidates = filterRhythmAggregatedWorkflowCandidates(rows.filter((row) => (
    rowMatchesAnyCodePrefix(row, prefixes)
    && !rowMatchesAnyExcludedCodePrefix(row, excludedPrefixes)
    && !rowMatchesAnyExcludedStableCode(row, excludedStableCodes)
    && rowMatchesCategoryTypes(row, categoryTypes)
    && rowCanAnchorCrossItemWorkflow(row, allowedModes)
  )), rule)
  if (
    directCandidates.length > 0
    || rule.managedFrontierProjectionPolicy !== 'item_pack_anchor_when_process_hidden'
  ) {
    return pickCrossItemWorkflowCandidates(directCandidates, prefixes)
  }

  const itemPackAnchorCodes = crossItemWorkflowManagedFrontierAnchorCodes(prefixes)
  const projectedCandidates = filterRhythmAggregatedWorkflowCandidates(rows.filter((row) => (
    readRowCategoryType(row) === 'item_work'
    && itemPackAnchorCodes.includes(readRowStableCode(row))
    && rowCanAnchorCrossItemWorkflow(row, allowedModes)
  )), rule)
  return pickCrossItemWorkflowCandidates(projectedCandidates, itemPackAnchorCodes)
}



export function normalizeCrossItemWorkflowSignal(value: unknown) {
  return normalizeText(value).toLowerCase()
}



export function collectCrossItemWorkflowProjectFeatureSignals(value: unknown) {
  const features = readRecord(value)
  const signals: string[] = []

  for (const [key, rawValue] of Object.entries(features)) {
    const normalizedKey = normalizeCrossItemWorkflowSignal(key)
    if (!normalizedKey) continue
    if (rawValue === true) {
      signals.push(normalizedKey)
      continue
    }
    if (rawValue === false || rawValue === null || rawValue === undefined) continue
    if (typeof rawValue === 'number') {
      if (rawValue > 0) signals.push(normalizedKey)
      continue
    }
    if (Array.isArray(rawValue)) {
      signals.push(...readCodeArray(rawValue))
      continue
    }
    signals.push(...readCodeArray(rawValue))
  }

  return signals
}



export function collectCrossItemWorkflowTriggerSignals(...rows: GeneratedTemplateRow[]) {
  const signals: string[] = []
  const arrayFields = [
    'methodVariantCodes',
    'prefabSystemCodes',
    'elementVariantCodes',
    'externalInterfaceCodes',
    'hardConstraintCodes',
    'buildingPatternCodes',
    'functionalUsageCodes',
    'floorUsageCodes',
    'functionalCategoryCodes',
    'specialRoomTypeCodes',
    'physicalZoneTypeCodes',
    'climateSignals',
    'weatherImpactBands',
    'onboardingPassedMilestones',
  ]
  const textFields = [
    'businessType',
    'businessSubtype',
    'detailLevel',
    'structureTypeCode',
    'planScopeCaliber',
    'deliveryStandard',
    'terminalEvent',
    'onboardingMode',
    'onboardingSubstage',
  ]

  for (const row of rows) {
    const metadata = readRowMetadata(row)
    const facts = readRecord(metadata.projectGenerationFacts ?? metadata.project_generation_facts)

    for (const field of arrayFields) {
      signals.push(...readCodeArray(facts[field]))
    }
    signals.push(...collectCrossItemWorkflowProjectFeatureSignals(facts.projectFeatures ?? facts.project_features))
    for (const field of textFields) {
      const value = normalizeCrossItemWorkflowSignal(facts[field])
      if (value) signals.push(value)
    }
  }

  return new Set(uniqueStringArray(signals.map(normalizeCrossItemWorkflowSignal)).filter(Boolean))
}



export function resolveCrossItemWorkflowLag(
  rule: V1475CrossItemWorkflowRule,
  successor: GeneratedTemplateRow,
  predecessor: GeneratedTemplateRow,
): ResolvedCrossItemWorkflowLag {
  const baseLagDays = Number.isFinite(Number(rule.lagDays)) ? Number(rule.lagDays) : 0
  const profiles = rule.conditionalLagProfiles ?? []
  if (profiles.length === 0) {
    return { lagDays: baseLagDays, baseLagDays, appliedConditionalLagProfile: null, matchedTriggerSignals: [] }
  }

  const triggerSignals = collectCrossItemWorkflowTriggerSignals(successor, predecessor)
  const matchedProfile = profiles
    .filter((profile) => profile.triggerSignals.some((signal) => triggerSignals.has(normalizeCrossItemWorkflowSignal(signal))))
    .sort((left, right) => Number(right.lagDays ?? 0) - Number(left.lagDays ?? 0))[0]

  if (!matchedProfile) {
    return { lagDays: baseLagDays, baseLagDays, appliedConditionalLagProfile: null, matchedTriggerSignals: [] }
  }
  const lagDays = Number.isFinite(Number(matchedProfile.lagDays)) ? Number(matchedProfile.lagDays) : baseLagDays
  const matchedTriggerSignals = uniqueStringArray(matchedProfile.triggerSignals
    .map(normalizeCrossItemWorkflowSignal)
    .filter((signal) => triggerSignals.has(signal)))
  return { lagDays, baseLagDays, appliedConditionalLagProfile: matchedProfile, matchedTriggerSignals }
}



export function appendCrossItemWorkflowMetadata(
  row: GeneratedTemplateRow,
  rule: V1475CrossItemWorkflowRule,
  predecessor: GeneratedTemplateRow,
  resolvedLag: ResolvedCrossItemWorkflowLag,
  organizationScopeFallback = false,
) {
  const metadata = readRowMetadata(row)
  const existing = Array.isArray(metadata.crossItemWorkflow) ? metadata.crossItemWorkflow : []
  const appliedProfile = resolvedLag.appliedConditionalLagProfile
  const predecessorStableCode = readRowStableCode(predecessor)
  const retained = existing.filter((item) => {
    const record = readRecord(item)
    return normalizeText(record.ruleCode) !== rule.stableCode
      || normalizeText(record.predecessorStableCode) !== predecessorStableCode
  })
  row.values = {
    ...row.values,
    standard_task_metadata: {
      ...metadata,
      crossItemWorkflow: [
        ...retained,
        {
          source: 'v1.4.7.5_cross_item_workflow',
          sourceType: 'cross_item_workflow',
          ruleCode: rule.stableCode,
          predecessorStableCode,
          successorStableCode: readRowStableCode(row),
          scopeRule: rule.scopeRule,
          dependencyType: rule.dependencyType,
          baseLagDays: resolvedLag.baseLagDays,
          effectiveLagDays: resolvedLag.lagDays,
          lagDays: resolvedLag.lagDays,
          ...(appliedProfile
            ? {
                appliedConditionalLagProfileCode: appliedProfile.conditionCode,
                appliedConditionalLagProfileConditionCode: appliedProfile.conditionCode,
                conditionalLagProfileCode: appliedProfile.conditionCode,
                conditionalLagTriggerSignals: resolvedLag.matchedTriggerSignals,
                appliedConditionalLagProfile: {
                  conditionCode: appliedProfile.conditionCode,
                  triggerSignals: appliedProfile.triggerSignals,
                  matchedTriggerSignals: resolvedLag.matchedTriggerSignals,
                  lagDays: appliedProfile.lagDays,
                  calibrationPolicy: appliedProfile.calibrationPolicy,
                },
              }
            : {}),
          strength: rule.strength,
          autoApplyPolicy: rule.autoApplyPolicy,
          boundaryPolicy: rule.boundaryPolicy,
          rhythmAggregationPolicy: rule.rhythmAggregationPolicy ?? null,
          managedFrontierProjectionPolicy: rule.managedFrontierProjectionPolicy ?? null,
          managedFrontierAnchorProjection: rule.managedFrontierProjectionPolicy === 'item_pack_anchor_when_process_hidden'
            && (
              readRowCategoryType(predecessor) !== 'process'
              || readRowCategoryType(row) !== 'process'
            ),
          predecessorAnchorCategoryType: readRowCategoryType(predecessor),
          successorAnchorCategoryType: readRowCategoryType(row),
          organizationScopeFallback,
          organizationScopePolicy: organizationScopeFallback
            ? 'project_organization_lane_used_when_project_scope_has_no_finer_scope_object'
            : null,
        },
      ],
    },
  }
}



export function applyCrossItemWorkflowRules(rows: GeneratedTemplateRow[]) {
  const activeRules = V1475_CROSS_ITEM_WORKFLOW_SEED.filter((rule) => (
    rule.isActive !== false
    && rule.autoApplyPolicy === 'confirmed_template_only'
  ))

  for (const rule of activeRules) {
    const predecessorCandidates = collectCrossItemWorkflowCandidates(rows, rule, 'predecessor')
    const successorCandidates = collectCrossItemWorkflowCandidates(rows, rule, 'successor')

    for (const successor of successorCandidates) {
      for (const predecessor of predecessorCandidates) {
        if (successor.clientRowId === predecessor.clientRowId) continue
        if (!rowsHaveCompatibleCrossItemWorkflowScope(successor, predecessor, rule)) continue
        const organizationScopeFallback = dependencyUsesProjectOrganizationScopeFallback(successor, predecessor, rule.scopeRule)
        const resolvedLag = resolveCrossItemWorkflowLag(rule, successor, predecessor)
        const appliedProfile = resolvedLag.appliedConditionalLagProfile
        const intentCode = `cross-item:${rule.stableCode}`
        const dependency = {
          clientRowId: predecessor.clientRowId,
          dependencyType: rule.dependencyType,
          lagDays: resolvedLag.lagDays,
          baseLagDays: resolvedLag.baseLagDays,
          effectiveLagDays: resolvedLag.lagDays,
          ...(appliedProfile
            ? {
                conditionalLagProfileCode: appliedProfile.conditionCode,
                appliedConditionalLagProfileCode: appliedProfile.conditionCode,
                appliedConditionalLagProfileConditionCode: appliedProfile.conditionCode,
                conditionalLagTriggerSignals: resolvedLag.matchedTriggerSignals,
                conditionalLagCalibrationPolicy: appliedProfile.calibrationPolicy,
              }
            : {}),
          intentCode,
          relationRole: 'workflow',
          strength: rule.strength,
          source: 'cross_item_workflow',
          managedFrontierProjectionPolicy: rule.managedFrontierProjectionPolicy ?? null,
        } satisfies GeneratedTemplateDependency
        const added = addGeneratedDependency(successor, dependency)
        const equivalentDependency = added
          ? null
          : successor.predecessorDependencies.find((candidate) => (
              candidate.clientRowId === dependency.clientRowId
              && candidate.dependencyType === dependency.dependencyType
              && candidate.lagDays === dependency.lagDays
            ))
        if (equivalentDependency) {
          const record = equivalentDependency as unknown as Record<string, unknown>
          record.additionalIntentCodes = uniqueStringArray([
            ...readStringArray(record.additionalIntentCodes),
            intentCode,
          ])
          record.crossItemWorkflowRuleCodes = uniqueStringArray([
            ...readStringArray(record.crossItemWorkflowRuleCodes),
            rule.stableCode,
          ])
        }
        if (added || equivalentDependency) {
          appendCrossItemWorkflowMetadata(successor, rule, predecessor, resolvedLag, organizationScopeFallback)
        }
      }
    }
  }
}



export function rowCanAnchorDependencyIntent(row: GeneratedTemplateRow) {
  const metadata = readRowMetadata(row)
  const mode = normalizeDurationContributionMode(row.values.duration_contribution_mode ?? metadata.durationContributionMode)
    ?? 'duration_bearing'
  if (isInternalFlowAnchorMode(mode)) return true
  const rowProjectionMode = normalizeRowProjectionMode(row.values.row_projection_mode ?? metadata.rowProjectionMode)
  const planItemKind = normalizeId(row.values.plan_item_kind ?? metadata.planItemKind)
  return rowProjectionMode === 'linked_projection'
    || planItemKind === 'linked_projection'
    || mode === 'record_only'
}



export function dependencyIntentUsesExplicitBusinessGate(intent: Partial<V1475DependencyIntentTemplate>) {
  return readArray(intent.auditTrace).map(normalizeText).includes('explicitBusinessGateTemplate=true')
}



export function rowsHaveDependencyIntentCoarseScopeFallback(
  left: GeneratedTemplateRow,
  right: GeneratedTemplateRow,
  scopeRule: DependencyScopeRule,
) {
  if (!['same_floor', 'same_zone', 'same_unit', 'same_system'].includes(scopeRule)) return false
  if (!rowsDoNotConflictOnScopeFields(left, right, ['phase_object_id', 'section_object_id', 'building_object_id'])) return false
  if (scopeRule === 'same_floor') {
    const leftHasFloor = rowScopeValue(left, 'floor_object_id') || rowHasFloorScopeEvidence(left)
    const rightHasFloor = rowScopeValue(right, 'floor_object_id') || rowHasFloorScopeEvidence(right)
    if (leftHasFloor || rightHasFloor) return false
  }
  if (scopeRule === 'same_zone' || scopeRule === 'same_unit') {
    const leftHasZone = rowScopeValue(left, 'physical_zone_object_id')
    const rightHasZone = rowScopeValue(right, 'physical_zone_object_id')
    if (leftHasZone || rightHasZone) return false
  }
  if (scopeRule === 'same_system') {
    const leftHasSystemScope = rowScopeValue(left, 'functional_area_object_id') || rowScopeValue(left, 'physical_zone_object_id')
    const rightHasSystemScope = rowScopeValue(right, 'functional_area_object_id') || rowScopeValue(right, 'physical_zone_object_id')
    if (leftHasSystemScope || rightHasSystemScope) return false
  }
  const leftBuilding = rowScopeValue(left, 'building_object_id')
  const rightBuilding = rowScopeValue(right, 'building_object_id')
  return Boolean(leftBuilding && rightBuilding && leftBuilding === rightBuilding)
}



export function rowsHaveCompatibleDependencyIntentScope(
  left: GeneratedTemplateRow,
  right: GeneratedTemplateRow,
  intent: Partial<V1475DependencyIntentTemplate>,
) {
  const scopeRule = intent.scopeRule ?? 'same_project'
  if (
    scopeRule === 'same_project'
    && readRowPackType(left) === 'project_milestone'
    && readRowPackType(right) === 'project_milestone'
    && !rowsShareGeneratedScopeInstance(left, right)
  ) return false
  return rowsHaveCompatibleDependencyScope(left, right, scopeRule)
    || (
      dependencyIntentUsesExplicitBusinessGate(intent)
      && rowsHaveDependencyIntentCoarseScopeFallback(left, right, scopeRule)
    )
}



export function rowCanAnchorCrossItemWorkflow(
  row: GeneratedTemplateRow,
  allowedModes: DurationContributionMode[] | undefined,
) {
  const metadata = readRowMetadata(row)
  const mode = normalizeDurationContributionMode(row.values.duration_contribution_mode ?? metadata.durationContributionMode)
    ?? 'duration_bearing'
  return isInternalFlowAnchorMode(mode) || Boolean(allowedModes?.includes(mode))
}



export function rowMatchesDependencyIntentTarget(row: GeneratedTemplateRow, code: string, intent: Partial<V1475DependencyIntentTemplate>) {
  if (intent.materializeDirection === 'target_depends_on_source') {
    return rowMatchesCodePrefix(row, code) || rowMatchesReferencedCode(row, code)
  }
  return rowMatchesReferencedCode(row, code)
}



export function pickDependencyIntentTargets(
  candidates: GeneratedTemplateRow[],
  code: string,
  intent: Partial<V1475DependencyIntentTemplate>,
) {
  if (intent.materializeDirection !== 'target_depends_on_source') return candidates
  const processAnchors = candidates.filter((candidate) => (
    ['process', 'activity_step'].includes(readRowCategoryType(candidate))
    && rowMatchesCodePrefix(candidate, code)
  ))
  return processAnchors.length > 0 ? processAnchors : candidates
}



export function collectGeneratedTemplateGovernanceWarnings(rows: GeneratedTemplateRow[]): GeneratedTemplateGovernanceWarning[] {
  const warnings: GeneratedTemplateGovernanceWarning[] = []
  for (const row of rows) {
    const metadata = readRowMetadata(row)
    const stableCode = readRowStableCode(row)
    const intents = readArray(metadata.dependencyIntentTemplates)
      .map((item) => readRecord(item)) as Array<Partial<V1475DependencyIntentTemplate>>
    for (const intent of intents) {
      if (intent.autoApplyPolicy !== 'confirmed_template_only') continue
      if (intent.relationshipDomain && intent.relationshipDomain !== 'business_constraint') continue
      const targetGroup = normalizeText(intent.toCatalogGroup) as WbsTemplatePackType
      const targetCode = normalizeText(intent.toReferencedCode)
      if (!targetGroup || !targetCode) continue

      if (intent.auditReasonCode === 'accepted_business_constraint_reference_field_normalized') {
        warnings.push({
          code: 'DEPENDENCY_INTENT_REFERENCE_FIELD_NORMALIZED',
          severity: 'warning',
          nodeCode: stableCode,
          message: 'Template reference field prefix does not match stableCode prefix. The generator normalized by code prefix; fix the field in seed governance.',
          details: {
            matchedReferenceField: intent.matchedReferenceField ?? null,
            targetGroup,
            targetCode,
            auditTrace: intent.auditTrace ?? [],
          },
        })
      }

      const candidates = rows.filter((candidate) => (
        candidate.clientRowId !== row.clientRowId
        && readRowPackType(candidate) === targetGroup
        && rowMatchesDependencyIntentTarget(candidate, targetCode, intent)
        && rowsHaveCompatibleDependencyIntentScope(row, candidate, intent)
      ))
      if (candidates.length === 0) {
        warnings.push({
          code: 'DEPENDENCY_INTENT_TARGET_NOT_GENERATED',
          severity: 'warning',
          nodeCode: stableCode,
          message: 'Confirmation or handover dependency target was not generated. Select the corresponding physical-work template or complete the specialty acceptance reference code.',
          details: {
            targetGroup,
            targetCode,
            relationRole: intent.relationRole ?? null,
            scopeRule: intent.scopeRule ?? 'same_project',
            matchedReferenceField: intent.matchedReferenceField ?? null,
          },
        })
        continue
      }
      if (!candidates.some((candidate) => rowCanAnchorDependencyIntent(candidate))) {
        warnings.push({
          code: 'DEPENDENCY_INTENT_TARGET_NOT_ANCHORABLE',
          severity: 'warning',
          nodeCode: stableCode,
          message: 'Confirmation or handover dependency target exists, but it is not an anchorable dependency target. Check the target durationContributionMode.',
          details: {
            targetGroup,
            targetCode,
            targetModes: candidates.map((candidate) => {
              const candidateMetadata = readRowMetadata(candidate)
              return {
                stableCode: readRowStableCode(candidate),
                durationContributionMode: candidate.values.duration_contribution_mode ?? candidateMetadata.durationContributionMode ?? null,
              }
            }),
          },
        })
      }
    }
  }
  return warnings
}



export function getRowProjectionMode(row: GeneratedTemplateRow) {
  return normalizeRowProjectionMode(
    row.rowProjectionMode
      ?? row.values.row_projection_mode
      ?? readRowMetadata(row).rowProjectionMode,
  )
}



export function getRowDurationContributionMode(row: GeneratedTemplateRow) {
  const metadata = readRowMetadata(row)
  return normalizeDurationContributionMode(
    row.values.duration_contribution_mode
      ?? metadata.durationContributionMode
      ?? metadata.duration_contribution_mode,
  )
}



export function readRowGenerationDepthPolicy(row: GeneratedTemplateRow): WbsGenerationDepthPolicy | null {
  const policy = readRecord(readRowMetadata(row).generationDepthPolicy)
  const policyId = normalizeText(policy.policyId)
  const materializeDepth = normalizeText(policy.materializeDepth) as WbsTemplateGenerationDepth
  const durationComputeDepth = normalizeText(policy.durationComputeDepth) as WbsTemplateGenerationDepth
  const confidence = normalizeText(policy.confidence) as WbsGenerationDepthPolicy['confidence']
  if (!policyId || !GENERATION_DEPTH_RANK[materializeDepth] || !GENERATION_DEPTH_RANK[durationComputeDepth]) return null
  if (!['high', 'medium', 'low'].includes(confidence)) return null
  return policy as unknown as WbsGenerationDepthPolicy
}



export function rowRequiresManagedFrontierDescendantRollup(row: GeneratedTemplateRow, policy: WbsGenerationDepthPolicy | null) {
  if (!policy) return false
  if (GENERATION_DEPTH_RANK[policy.durationComputeDepth] <= GENERATION_DEPTH_RANK[policy.materializeDepth]) return false
  if (!isDurationBearingContributionMode(getRowDurationContributionMode(row))) return false
  const metadata = readRowMetadata(row)
  return row.values.is_wbs_summary === true || metadata.drillDownAvailable === true || policy.drillDownAvailable === true
}



export function rowHasManagedFrontierDescendantRollup(row: GeneratedTemplateRow) {
  const metadata = readRowMetadata(row)
  const deepDurationRollup = readRecord(metadata.deepDurationRollup)
  if (normalizeText(deepDurationRollup.source) === 'contextual_descendant_rollup') return true
  const suggestion = row.durationSuggestion ?? readGeneratedDurationSuggestion(row.values.duration_suggestion)
  const reasonParams = readRecord(suggestion?.businessReasonParams)
  const descendantRollup = readRecord(reasonParams.descendantRollup)
  return normalizeText(descendantRollup.source) === 'contextual_descendant_rollup'
}



export function buildGenerationDepthScheduleTrustGate(
  rows: GeneratedTemplateRow[],
  generationDepth: WbsTemplateGenerationDepth,
): GeneratedScheduleTrustGate {
  const scheduleRows = rows.filter((row) => getRowProjectionMode(row) === 'schedule_row')
  const durationRows = scheduleRows.filter((row) => isDurationBearingContributionMode(getRowDurationContributionMode(row)))
  const confidenceCounts: GeneratedScheduleTrustGate['policyConfidenceCounts'] = {
    high: 0,
    medium: 0,
    low: 0,
  }
  let fallbackPolicyRowCount = 0
  let descendantRollupRequiredRowCount = 0
  let descendantRollupAppliedRowCount = 0
  let missingDescendantRollupRowCount = 0
  let rowsMissingReferenceDuration = 0
  let candidateReviewGateRowCount = 0
  const reviewRows: GeneratedScheduleTrustGate['reviewRows'] = []

  for (const row of durationRows) {
    const policy = readRowGenerationDepthPolicy(row)
    const reasons: string[] = []
    const durationSuggestion = row.durationSuggestion ?? readGeneratedDurationSuggestion(row.values.duration_suggestion)
    const confidence = policy?.confidence ?? 'low'
    confidenceCounts[confidence] += 1
    if (!policy || policy.governance.curationStatus !== 'seeded' || policy.policyId.startsWith('fallback-')) {
      fallbackPolicyRowCount += 1
      reasons.push('generation_depth_policy_fallback')
    }
    if (confidence === 'low') reasons.push('generation_depth_policy_low_confidence')

    if (rowRequiresManagedFrontierDescendantRollup(row, policy)) {
      descendantRollupRequiredRowCount += 1
      if (rowHasManagedFrontierDescendantRollup(row)) {
        descendantRollupAppliedRowCount += 1
      } else {
        missingDescendantRollupRowCount += 1
        reasons.push('missing_descendant_duration_rollup')
      }
    }

    if (!readPlanReferenceDurationNumber(row.values.smart_reference_days)) {
      rowsMissingReferenceDuration += 1
      reasons.push('missing_plan_reference_duration')
    }
    const dataUpgradeBlockedBy = Array.isArray(durationSuggestion?.dataUpgradeBlockedBy)
      ? durationSuggestion.dataUpgradeBlockedBy
      : []
    if (
      normalizeText(row.values.duration_review_gate) === 'GENERATION_DEPTH_TRUST_REVIEW_REQUIRED'
      || dataUpgradeBlockedBy.map((code) => normalizeText(code)).includes('GENERATION_DEPTH_TRUST_REVIEW_REQUIRED')
    ) {
      candidateReviewGateRowCount += 1
      reasons.push('candidate_generation_depth_policy_review_required')
    }

    if (reasons.length > 0 && reviewRows.length < 12) {
      reviewRows.push({
        stableCode: readRowStableCode(row),
        title: normalizeText(row.values.title),
        reasons,
        policyId: policy?.policyId ?? null,
        confidence: policy?.confidence ?? null,
      })
    }
  }

  const reviewReasons = uniqueStringArray([
    fallbackPolicyRowCount > 0 ? 'generation_depth_policy_fallback' : '',
    confidenceCounts.low > 0 ? 'generation_depth_policy_low_confidence' : '',
    missingDescendantRollupRowCount > 0 ? 'missing_descendant_duration_rollup' : '',
    rowsMissingReferenceDuration > 0 ? 'missing_plan_reference_duration' : '',
    candidateReviewGateRowCount > 0 ? 'candidate_generation_depth_policy_review_required' : '',
  ])
  const blocked = rowsMissingReferenceDuration > 0
  const reviewRequired = fallbackPolicyRowCount > 0
    || confidenceCounts.low > 0
    || missingDescendantRollupRowCount > 0
    || candidateReviewGateRowCount > 0
  const status: GeneratedScheduleTrustGate['status'] = blocked
    ? 'blocked'
    : reviewRequired
      ? 'review_required'
      : 'trusted'

  return {
    source: 'generation_depth_policy',
    generationDepth,
    status,
    trustedForScheduling: status === 'trusted',
    totalScheduleRows: scheduleRows.length,
    durationBearingScheduleRows: durationRows.length,
    fallbackPolicyRowCount,
    descendantRollupRequiredRowCount,
    descendantRollupAppliedRowCount,
    missingDescendantRollupRowCount,
    rowsMissingReferenceDuration,
    policyConfidenceCounts: confidenceCounts,
    candidateReviewGateRowCount,
    reviewReasons,
    reviewRows,
  }
}



export function buildGenerationDepthTrustGovernanceWarning(
  gate: GeneratedScheduleTrustGate,
): GeneratedTemplateGovernanceWarning | null {
  if (gate.status === 'trusted') return null
  return {
    code: 'GENERATION_DEPTH_TRUST_REVIEW_REQUIRED',
    severity: gate.status === 'blocked' ? 'error' : 'warning',
    nodeCode: 'generation_depth_policy',
    message: gate.status === 'blocked'
      ? 'Generated schedule has duration-bearing rows without writable plan reference days. Review generation depth policy or duration seeds before using it as a production schedule.'
      : 'Generated schedule uses fallback/low-confidence generation depth policy or lacks required descendant rollup. Review before committing as a trusted production schedule.',
    details: {
      status: gate.status,
      reviewReasons: gate.reviewReasons,
      fallbackPolicyRowCount: gate.fallbackPolicyRowCount,
      missingDescendantRollupRowCount: gate.missingDescendantRollupRowCount,
      rowsMissingReferenceDuration: gate.rowsMissingReferenceDuration,
      candidateReviewGateRowCount: gate.candidateReviewGateRowCount,
      reviewRows: gate.reviewRows,
    },
  }
}



export function applyDependencyIntentTemplates(rows: GeneratedTemplateRow[]) {
  for (const row of rows) {
    const metadata = readRowMetadata(row)
    const intents = readArray(metadata.dependencyIntentTemplates)
      .map((item) => readRecord(item)) as Array<Partial<V1475DependencyIntentTemplate>>
    for (const intent of intents) {
      if (intent.autoApplyPolicy !== 'confirmed_template_only') continue
      if (intent.relationshipDomain && intent.relationshipDomain !== 'business_constraint') continue
      const toCatalogGroup = normalizeText(intent.toCatalogGroup) as WbsTemplatePackType
      const toReferencedCode = normalizeText(intent.toReferencedCode)
      if (!toCatalogGroup || !toReferencedCode) continue
      const candidates = rows.filter((candidate) => (
        candidate.clientRowId !== row.clientRowId
        && readRowPackType(candidate) === toCatalogGroup
        && rowMatchesDependencyIntentTarget(candidate, toReferencedCode, intent)
        && rowsHaveCompatibleDependencyIntentScope(row, candidate, intent)
        && rowCanAnchorDependencyIntent(candidate)
      ))
      const targets = pickDependencyIntentTargets(candidates, toReferencedCode, intent)
      for (const target of targets) {
        const materializeTarget = intent.materializeDirection === 'target_depends_on_source' ? target : row
        const predecessor = intent.materializeDirection === 'target_depends_on_source' ? row : target
        addGeneratedDependency(materializeTarget, {
          clientRowId: predecessor.clientRowId,
          dependencyType: intent.dependencyType ?? 'FS',
          lagDays: Number(intent.lagDays ?? 0) || 0,
          intentCode: normalizeId(intent.intentCode),
          relationRole: intent.relationRole ?? null,
          strength: intent.strength,
          source: 'dependency_intent_template',
          confidenceScore: typeof intent.confidenceScore === 'number' ? intent.confidenceScore : null,
          confidenceLevel: intent.confidenceLevel ?? null,
          matchedReferenceField: normalizeText(intent.matchedReferenceField) || null,
          auditReasonCode: intent.auditReasonCode ?? null,
          auditTrace: Array.isArray(intent.auditTrace) ? [...intent.auditTrace] : null,
        })
      }
    }
  }
}



export function learnedDependencyRowsShareScope(
  predecessor: GeneratedTemplateRow,
  successor: GeneratedTemplateRow,
  scopeRule: string,
) {
  if (!scopeRule || scopeRule === 'same_scope_instance' || scopeRule === 'same_project') {
    return rowsShareGeneratedScopeInstance(predecessor, successor)
  }
  return rowsHaveCompatibleDependencyScope(
    predecessor,
    successor,
    scopeRule as DependencyScopeRule,
  )
}



export function applyDurationLearningDependencyPublications(
  rows: GeneratedTemplateRow[],
  publications: readonly ResolveDurationLearningRuntimePublicationResult[],
) {
  const consumed: WbsTemplateGenerationRuntimeArtifactPublication[] = []
  for (const resolution of publications) {
    const publication = resolution.publication
    if (!resolution.runtimeConsumable || !publication || !resolution.publicationKey) continue
    const payload = publication.runtimePayload
    const predecessorCode = normalizeText(payload.predecessorCode ?? payload.predecessor_code)
    const successorCode = normalizeText(payload.successorCode ?? payload.successor_code)
    if (!predecessorCode || !successorCode) continue
    const dependencyType = normalizeDependencyType(payload.dependencyType ?? payload.dependency_type)
    const lagDaysValue = Number(payload.lagDays ?? payload.lag_days ?? 0)
    const lagDays = Number.isFinite(lagDaysValue) ? lagDaysValue : 0
    const scopeRule = normalizeText(payload.scopeRule ?? payload.scope_rule) || 'same_scope_instance'
    const predecessors = rows.filter((row) => rowMatchesCodePrefix(row, predecessorCode))
    const successors = rows.filter((row) => rowMatchesCodePrefix(row, successorCode))
    let appliedEdgeCount = 0

    for (const successor of successors) {
      const predecessor = predecessors.find((candidate) => (
        candidate.clientRowId !== successor.clientRowId
        && learnedDependencyRowsShareScope(candidate, successor, scopeRule)
      ))
      if (!predecessor) continue
      const learnedDependency: GeneratedTemplateDependency = {
        clientRowId: predecessor.clientRowId,
        dependencyType,
        lagDays,
        intentCode: normalizeId(payload.intentCode ?? payload.intent_code),
        relationRole: 'workflow',
        strength: 'hard',
        source: 'duration_learning_runtime_publication',
        publicationKey: resolution.publicationKey,
        artifactKey: publication.artifactKey,
        publicationStage: publication.publicationStage,
        selectionBasis: resolution.selectionBasis,
      }
      const existingIndex = successor.predecessorDependencies.findIndex((dependency) => (
        dependency.clientRowId === predecessor.clientRowId
      ))
      if (existingIndex >= 0) successor.predecessorDependencies.splice(existingIndex, 1, learnedDependency)
      else addGeneratedDependency(successor, learnedDependency)
      if (!successor.predecessorClientRowIds.includes(predecessor.clientRowId)) {
        successor.predecessorClientRowIds.push(predecessor.clientRowId)
      }
      const metadata = readRowMetadata(successor)
      const existingReceipts = readArray(metadata.durationLearningDependencyPublications).map(readRecord)
      successor.values = {
        ...successor.values,
        standard_task_metadata: {
          ...metadata,
          durationLearningDependencyPublications: [
            ...existingReceipts.filter((receipt) => normalizeText(receipt.publicationKey) !== resolution.publicationKey),
            {
              publicationKey: resolution.publicationKey,
              publicationStage: publication.publicationStage,
              selectionBasis: resolution.selectionBasis,
              artifactKey: publication.artifactKey,
              predecessorCode,
              successorCode,
              dependencyType,
              lagDays,
              scopeRule,
            },
          ],
        },
      }
      appliedEdgeCount += 1
    }

    if (appliedEdgeCount > 0) {
      consumed.push({
        assetKey: 'dependency_rule_candidate',
        publicationKey: resolution.publicationKey,
        publicationStatus: publication.publicationStage === 'canary' ? 'canary' : 'published',
        sourceEvidenceRefs: [`duration_learning_runtime_publications:${resolution.publicationKey}`],
        observationContext: {
          artifactKey: publication.artifactKey,
          appliedEdgeCount,
          selectionBasis: resolution.selectionBasis,
          scopeRule,
        },
      })
    }
  }
  return consumed
}



export function generatedDependencyPriority(dependency: GeneratedTemplateDependency) {
  if (dependency.source === 'duration_learning_runtime_publication') return 6
  if (
    dependency.source === 'cross_item_workflow'
    && dependency.managedFrontierProjectionPolicy === 'item_pack_anchor_when_process_hidden'
    && dependency.strength === 'hard'
  ) return 5
  if (dependency.source === 'dependency_intent_template') return 4
  if (dependency.source === 'cross_item_workflow') return 3
  if (dependency.source === 'internal_flow') return 2
  if (dependency.source === 'sibling_sequence') return 1
  if (dependency.source === 'phase_chain') return 0
  return 0
}



export function pruneGeneratedDependencyConflicts(rows: GeneratedTemplateRow[]) {
  const rowById = new Map(rows.map((row) => [row.clientRowId, row]))
  let prunedCount = 0
  for (const row of rows) {
    const previousDependencyCount = row.predecessorDependencies.length
    const keptDependencies = row.predecessorDependencies.filter((dependency) => {
      const predecessor = rowById.get(dependency.clientRowId)
      if (!predecessor) return true
      const reverseDependencies = predecessor.predecessorDependencies.filter((reverse) => reverse.clientRowId === row.clientRowId)
      if (reverseDependencies.length === 0) return true
      const ownPriority = generatedDependencyPriority(dependency)
      const strongestReversePriority = Math.max(...reverseDependencies.map(generatedDependencyPriority))
      const keep = ownPriority >= strongestReversePriority
      if (!keep) prunedCount += 1
      return keep
    })
    if (keptDependencies.length === row.predecessorDependencies.length) continue
    row.predecessorDependencies = keptDependencies
    row.predecessorClientRowIds = row.predecessorClientRowIds.filter((id) => keptDependencies.some((dependency) => dependency.clientRowId === id))
    const metadata = readRowMetadata(row)
    row.values = {
      ...row.values,
      standard_task_metadata: {
        ...metadata,
        dependencyConflictResolution: {
          source: 'generated_dependency_network',
          policy: 'prefer_business_dependency_over_catalog_sibling_sequence',
          prunedCount: previousDependencyCount - keptDependencies.length,
        },
      },
    }
  }
  return prunedCount
}



export type GeneratedDependencyEdge = {
  from: string
  to: string
  row: GeneratedTemplateRow
  dependency: GeneratedTemplateDependency
}



export function generatedDependencyEquals(left: GeneratedTemplateDependency, right: GeneratedTemplateDependency) {
  return left.clientRowId === right.clientRowId
    && left.dependencyType === right.dependencyType
    && left.lagDays === right.lagDays
    && left.source === right.source
    && left.intentCode === right.intentCode
}



export function buildGeneratedDependencyEdges(rows: GeneratedTemplateRow[]) {
  const rowById = new Map(rows.map((row) => [row.clientRowId, row]))
  const outgoing = new Map<string, GeneratedDependencyEdge[]>()
  for (const row of rows) {
    for (const dependency of row.predecessorDependencies) {
      if (!rowById.has(dependency.clientRowId)) continue
      const edge = {
        from: dependency.clientRowId,
        to: row.clientRowId,
        row,
        dependency,
      }
      outgoing.set(edge.from, [...(outgoing.get(edge.from) ?? []), edge])
    }
  }
  return { rowById, outgoing }
}



export function findGeneratedDependencyCycle(rows: GeneratedTemplateRow[]): GeneratedDependencyEdge[] | null {
  const { rowById, outgoing } = buildGeneratedDependencyEdges(rows)
  const state = new Map<string, 'visiting' | 'visited'>()
  const edgeStack: GeneratedDependencyEdge[] = []

  function visit(rowId: string): GeneratedDependencyEdge[] | null {
    state.set(rowId, 'visiting')
    for (const edge of outgoing.get(rowId) ?? []) {
      if (!rowById.has(edge.to)) continue
      const targetState = state.get(edge.to)
      if (targetState === 'visiting') {
        const cycleStartIndex = edgeStack.findIndex((item) => item.from === edge.to)
        return [
          ...(cycleStartIndex >= 0 ? edgeStack.slice(cycleStartIndex) : edgeStack),
          edge,
        ]
      }
      if (targetState === 'visited') continue
      edgeStack.push(edge)
      const cycle = visit(edge.to)
      if (cycle) return cycle
      edgeStack.pop()
    }
    state.set(rowId, 'visited')
    return null
  }

  for (const row of rows) {
    if (state.has(row.clientRowId)) continue
    const cycle = visit(row.clientRowId)
    if (cycle) return cycle
  }
  return null
}



export function removeGeneratedDependencyEdge(edge: GeneratedDependencyEdge) {
  const previousDependencyCount = edge.row.predecessorDependencies.length
  edge.row.predecessorDependencies = edge.row.predecessorDependencies.filter((dependency) => !generatedDependencyEquals(dependency, edge.dependency))
  if (edge.row.predecessorDependencies.length === previousDependencyCount) return false
  edge.row.predecessorClientRowIds = edge.row.predecessorClientRowIds.filter((id) => (
    edge.row.predecessorDependencies.some((dependency) => dependency.clientRowId === id)
  ))
  const metadata = readRowMetadata(edge.row)
  const existing = readArray(metadata.dependencyCycleResolution)
  edge.row.values = {
    ...edge.row.values,
    standard_task_metadata: {
      ...metadata,
      dependencyCycleResolution: [
        ...existing,
        {
          source: 'generated_dependency_network',
          policy: 'remove_lowest_priority_edge_in_cycle',
          removedDependencySource: edge.dependency.source ?? null,
          removedDependencyType: edge.dependency.dependencyType,
          removedDependencyIntentCode: edge.dependency.intentCode ?? null,
          removedPredecessorClientRowId: edge.dependency.clientRowId,
        },
      ],
    },
  }
  return true
}



export function generatedRowHasAncestor(
  rowById: Map<string, GeneratedTemplateRow>,
  descendantRowId: string,
  ancestorRowId: string,
) {
  const seen = new Set<string>()
  let current = rowById.get(descendantRowId)
  while (current?.parentClientRowId && !seen.has(current.clientRowId)) {
    if (current.parentClientRowId === ancestorRowId) return true
    seen.add(current.clientRowId)
    current = rowById.get(current.parentClientRowId)
  }
  return false
}



export function pruneGeneratedHierarchySelfDependencies(rows: GeneratedTemplateRow[]) {
  const rowById = new Map(rows.map((row) => [row.clientRowId, row]))
  let prunedCount = 0

  for (const row of rows) {
    const hierarchySelfDependencies = row.predecessorDependencies.filter((dependency) => (
      generatedRowHasAncestor(rowById, dependency.clientRowId, row.clientRowId)
    ))
    if (hierarchySelfDependencies.length === 0) continue

    row.predecessorDependencies = row.predecessorDependencies.filter((dependency) => (
      !hierarchySelfDependencies.some((candidate) => generatedDependencyEquals(candidate, dependency))
    ))
    row.predecessorClientRowIds = row.predecessorClientRowIds.filter((id) => (
      row.predecessorDependencies.some((dependency) => dependency.clientRowId === id)
    ))
    prunedCount += hierarchySelfDependencies.length

    const metadata = readRowMetadata(row)
    const existing = readArray(metadata.dependencyHierarchyResolution)
    row.values = {
      ...row.values,
      standard_task_metadata: {
        ...metadata,
        dependencyHierarchyResolution: [
          ...existing,
          ...hierarchySelfDependencies.map((dependency) => ({
            source: 'generated_dependency_network',
            policy: 'remove_ancestor_depends_on_descendant_edge',
            removedDependencySource: dependency.source ?? null,
            removedDependencyType: dependency.dependencyType,
            removedDependencyIntentCode: dependency.intentCode ?? null,
            removedPredecessorClientRowId: dependency.clientRowId,
          })),
        ],
      },
    }
  }

  return prunedCount
}



export function generatedDependencyEdgeCanBeCyclePruned(edge: GeneratedDependencyEdge) {
  return edge.dependency.source !== 'cross_item_workflow'
    && edge.dependency.source !== 'dependency_intent_template'
}



export function pruneGeneratedDependencyCycles(rows: GeneratedTemplateRow[]) {
  let prunedCount = 0
  const maxIterations = Math.max(
    1,
    rows.reduce((count, row) => count + row.predecessorDependencies.length, 0),
  )
  for (let iteration = 0; iteration < maxIterations; iteration += 1) {
    const cycle = findGeneratedDependencyCycle(rows)
    if (!cycle) break
    const prunableCycleEdges = cycle.filter(generatedDependencyEdgeCanBeCyclePruned)
    const edgeToRemove = [...(prunableCycleEdges.length > 0 ? prunableCycleEdges : cycle)].sort((left, right) => {
      const priorityDelta = generatedDependencyPriority(left.dependency) - generatedDependencyPriority(right.dependency)
      if (priorityDelta !== 0) return priorityDelta
      if (left.dependency.source === 'sibling_sequence' && right.dependency.source !== 'sibling_sequence') return -1
      if (right.dependency.source === 'sibling_sequence' && left.dependency.source !== 'sibling_sequence') return 1
      return 0
    })[0]
    if (!edgeToRemove || !removeGeneratedDependencyEdge(edgeToRemove)) break
    prunedCount += 1
  }
  return prunedCount
}



export function parsePlanDateTime(date: string | null) {
  if (!date) return null
  const time = Date.parse(`${date}T00:00:00.000Z`)
  return Number.isFinite(time) ? time : null
}



export function comparePlanDates(left: string | null, right: string | null) {
  const leftTime = parsePlanDateTime(left)
  const rightTime = parsePlanDateTime(right)
  if (leftTime === null && rightTime === null) return 0
  if (leftTime === null) return -1
  if (rightTime === null) return 1
  return leftTime - rightTime
}



export function readGeneratedRowPlanStart(row: GeneratedTemplateRow) {
  return normalizeDate(row.values.planned_start_date ?? row.values.start_date)
}



export function readGeneratedRowPlanEnd(row: GeneratedTemplateRow) {
  return normalizeDate(row.values.planned_end_date ?? row.values.end_date)
}



export function readGeneratedRowPlanDurationDays(row: GeneratedTemplateRow) {
  const start = readGeneratedRowPlanStart(row)
  const end = readGeneratedRowPlanEnd(row)
  if (start && end) return daysInclusive(start, end)
  const referenceDuration = Number(row.values.smart_reference_days)
  if (Number.isFinite(referenceDuration) && referenceDuration > 0) return Math.max(1, Math.round(referenceDuration))
  return 1
}



export function applyTaskPlanDrilldownFrontier(params: {
  rows: GeneratedTemplateRow[]
  operation: PlanningTableOperation
  attachUnderRowId: string
  selectedTemplateNodeIds: string[]
  generationBatchId: string
}): GeneratedTemplateRow[] {
  const drilldownMode = normalizeText(
    params.operation.drilldownMode ?? params.operation.drilldown_mode,
  ).toLowerCase()
  if (drilldownMode !== 'selected_children') return params.rows

  const selectedNodeIds = uniqueStringArray(params.selectedTemplateNodeIds)
  const normalizedSelectedNodeIds = new Set(selectedNodeIds.map((id) => id.toLowerCase()))
  const selectedRootRows = params.rows.filter((row) => {
    const templateNodeId = normalizeText(
      row.values.source_template_node_id
        ?? row.values.template_node_id
        ?? readRecord(row.values.standard_task_metadata).stableCode,
    ).toLowerCase()
    return normalizedSelectedNodeIds.has(templateNodeId)
      && row.parentClientRowId === null
      && row.parentRowId === params.attachUnderRowId
  })
  const selectedRootClientRowIds = new Set(selectedRootRows.map((row) => row.clientRowId))
  if (selectedRootClientRowIds.size === 0) {
    throw Object.assign(new Error('The selected task did not resolve to a generated drilldown root.'), {
      statusCode: 422,
      code: 'TASK_PLAN_DRILLDOWN_FRONTIER_EMPTY',
      details: {
        sourceParentTaskId: params.attachUnderRowId,
        selectedTemplateNodeIds: selectedNodeIds,
        mutationBoundary: 'rejected_before_task_or_dependency_write',
      },
    })
  }

  const descendantClientRowIds = new Set<string>()
  let frontier = selectedRootClientRowIds
  while (frontier.size > 0) {
    const nextFrontier = new Set<string>()
    for (const row of params.rows) {
      if (
        row.parentClientRowId
        && frontier.has(row.parentClientRowId)
        && !descendantClientRowIds.has(row.clientRowId)
      ) {
        descendantClientRowIds.add(row.clientRowId)
        nextFrontier.add(row.clientRowId)
      }
    }
    frontier = nextFrontier
  }

  const materializedDescendantClientRowIds = new Set(
    params.rows
      .filter((row) => (
        descendantClientRowIds.has(row.clientRowId)
        && getRowProjectionMode(row) === 'schedule_row'
      ))
      .map((row) => row.clientRowId),
  )

  if (materializedDescendantClientRowIds.size === 0) {
    throw Object.assign(new Error('The selected task has no next-level schedule rows to materialize.'), {
      statusCode: 422,
      code: 'TASK_PLAN_DRILLDOWN_FRONTIER_EMPTY',
      details: {
        sourceParentTaskId: params.attachUnderRowId,
        selectedTemplateNodeIds: selectedNodeIds,
        mutationBoundary: 'rejected_before_task_or_dependency_write',
      },
    })
  }

  const droppedClientRowIds = new Set(
    params.rows
      .filter((row) => !materializedDescendantClientRowIds.has(row.clientRowId))
      .map((row) => row.clientRowId),
  )
  const drilldownLevel = normalizeText(
    params.operation.drilldownGenerationLevel ?? params.operation.drilldown_generation_level,
  ) || 'process_detail'

  return params.rows
    .filter((row) => materializedDescendantClientRowIds.has(row.clientRowId))
    .map((row) => {
      const standardTaskMetadata = readRecord(row.values.standard_task_metadata)
      const isDirectChild = Boolean(row.parentClientRowId && selectedRootClientRowIds.has(row.parentClientRowId))
      return {
        ...row,
        parentClientRowId: isDirectChild ? null : row.parentClientRowId,
        parentRowId: isDirectChild ? params.attachUnderRowId : row.parentRowId,
        predecessorClientRowIds: row.predecessorClientRowIds.filter((id) => !droppedClientRowIds.has(id)),
        predecessorDependencies: row.predecessorDependencies.filter(
          (dependency) => !droppedClientRowIds.has(dependency.clientRowId),
        ),
        values: {
          ...row.values,
          standard_task_metadata: {
            ...standardTaskMetadata,
            drilldownGenerationLineage: {
              level: drilldownLevel,
              sourceParentTaskId: params.attachUnderRowId,
              generationBatchId: params.generationBatchId,
              templateId: row.values.source_template_id ?? row.values.template_id ?? null,
              templateNodeId: row.values.source_template_node_id ?? row.values.template_node_id ?? null,
              selectedTemplateNodeIds: selectedNodeIds,
              mutationBoundary: 'generated_row_metadata_only',
            },
          },
        },
      }
    })
}



export function isGeneratedRecordOnlyWbsSummaryRow(row: GeneratedTemplateRow) {
  const metadata = readRowMetadata(row)
  const value = row.values.is_wbs_summary ?? metadata.isWbsSummary ?? metadata.is_wbs_summary
  const isSummary = value === true || value === 1 || normalizeText(value).toLowerCase() === 'true'
  return isSummary && getRowDurationContributionMode(row) === 'record_only'
}



export function readGeneratedRowTitle(row: GeneratedTemplateRow) {
  const metadata = readRowMetadata(row)
  return normalizeText(
    row.values.title
      ?? row.values.name
      ?? row.values.standard_work_name
      ?? metadata.title
      ?? metadata.name
      ?? metadata.standardWorkName
      ?? metadata.standard_work_name
      ?? readRowStableCode(row),
  )
}



export function clampInteger(value: unknown, min: number, max: number, fallback: number) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(max, Math.max(min, Math.round(parsed)))
}



export function readRecordField(record: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(record, key)) return record[key]
  }
  return undefined
}



export function normalizePhaseReleaseMode(value: unknown): WbsTemplatePhaseReleaseMode | null {
  const mode = normalizeText(value)
  if (
    mode === 'strict_finish_start'
    || mode === 'overlap_after_days'
    || mode === 'overlap_before_finish_days'
    || mode === 'overlap_after_percent'
    || mode === 'parallel_group'
  ) return mode
  return null
}



export function readOperationPhaseId(operation: PlanningTableOperation) {
  const scope = readRecord(operation.scope)
  return normalizeText(
    scope.phase_object_id
      ?? scope.phaseObjectId
      ?? operation.phase_object_id
      ?? operation.phaseObjectId,
  )
}



export function operationLooksPrefabScope(operation: PlanningTableOperation) {
  const templateIds = uniqueStringArray([
    normalizeText(operation.templateId),
    ...readArray(operation.templateIds).map(normalizeText),
    ...Object.keys(readRecord(operation.selectedNodesByTemplate ?? operation.selected_nodes_by_template)).map(normalizeText),
  ].filter(Boolean))
  if (templateIds.some((id) => id.includes('prefab') || id.includes('prefabricated'))) return true

  const selectedCodes = uniqueStringArray([
    ...readArray(operation.selectedNodeIds ?? operation.selected_node_ids).map(normalizeText),
    ...Object.values(readRecord(operation.selectedNodesByTemplate ?? operation.selected_nodes_by_template))
      .flatMap((value) => readArray(value).map(normalizeText)),
  ].filter(Boolean))
  return selectedCodes.some((code) => code.toUpperCase().startsWith('PFB-'))
}



export function operationLooksPrefabFactorySupplyScope(operation: PlanningTableOperation) {
  const phaseId = readOperationPhaseId(operation).toLowerCase()
  if (!operationLooksPrefabScope(operation)) return false
  if (phaseId.includes('factory') || phaseId.includes('supply')) return true

  const selectedCodes = uniqueStringArray([
    ...readArray(operation.selectedNodeIds ?? operation.selected_node_ids).map(normalizeText),
    ...Object.values(readRecord(operation.selectedNodesByTemplate ?? operation.selected_nodes_by_template))
      .flatMap((value) => readArray(value).map(normalizeText)),
  ].filter(Boolean))
  return selectedCodes.length > 0 && selectedCodes.every((code) => code.toUpperCase().startsWith('PFB-00'))
}



export function readOperationPhaseReleasePolicy(operation: PlanningTableOperation): WbsTemplatePhaseReleasePolicy | null {
  return normalizePhaseReleasePolicyRecord(
    operation.phaseReleasePolicy
      ?? operation.phase_release_policy
      ?? readRecord(operation.scope).phaseReleasePolicy
      ?? readRecord(operation.scope).phase_release_policy,
  )
}



export function normalizePhaseReleasePolicyRecord(value: unknown): WbsTemplatePhaseReleasePolicy | null {
  const raw = readRecord(value)
  const mode = normalizePhaseReleaseMode(readRecordField(raw, 'mode', 'releaseMode', 'release_mode'))
  if (!mode) return null
  return {
    mode,
    afterDays: clampInteger(readRecordField(raw, 'afterDays', 'after_days'), 0, 3650, 0),
    beforeFinishDays: clampInteger(readRecordField(raw, 'beforeFinishDays', 'before_finish_days'), 0, 3650, 0),
    percent: clampInteger(readRecordField(raw, 'percent', 'afterPercent', 'after_percent'), 0, 100, 0),
    groupKey: normalizeId(readRecordField(raw, 'groupKey', 'group_key')),
    dependencyType: normalizeDependencyType(readRecordField(raw, 'dependencyType', 'dependency_type')),
    lagDays: clampInteger(readRecordField(raw, 'lagDays', 'lag_days'), -3650, 3650, 0),
  }
}



export function buildExplicitPhaseReleasePolicyMap(value: unknown) {
  const result = new Map<string, WbsTemplatePhaseReleasePolicy>()
  if (Array.isArray(value)) {
    for (const item of value) {
      const record = readRecord(item)
      const phaseId = normalizeText(readRecordField(record, 'phaseId', 'phase_id', 'id'))
      const policy = normalizePhaseReleasePolicyRecord(record)
      if (phaseId && policy) result.set(phaseId, policy)
    }
    return result
  }

  const record = readRecord(value)
  for (const [phaseId, rawPolicy] of Object.entries(record)) {
    const policy = normalizePhaseReleasePolicyRecord(rawPolicy)
    if (normalizeText(phaseId) && policy) result.set(normalizeText(phaseId), policy)
  }
  return result
}



export function inferDefaultPhaseReleasePolicy(operation: PlanningTableOperation, index: number): WbsTemplatePhaseReleasePolicy {
  if (index === 0) return { mode: 'strict_finish_start', dependencyType: 'FS', lagDays: 0 }
  const phaseId = readOperationPhaseId(operation).toLowerCase()
  if (operationLooksPrefabFactorySupplyScope(operation)) return { mode: 'parallel_group', dependencyType: 'SS', lagDays: 0 }
  if (
    phaseId.includes('site')
    || phaseId.includes('danger')
    || phaseId.includes('quality')
    || phaseId.includes('doc')
    || phaseId.includes('milestone')
  ) return { mode: 'parallel_group', dependencyType: 'SS', lagDays: 0 }
  if (phaseId.includes('foundation-pit') || phaseId.includes('pit-pile')) return { mode: 'parallel_group', dependencyType: 'SS', lagDays: 0 }
  if (phaseId.includes('basement')) return { mode: 'overlap_before_finish_days', beforeFinishDays: 30, dependencyType: 'SS', lagDays: 60 }
  if (phaseId.includes('waterproof')) return { mode: 'overlap_before_finish_days', beforeFinishDays: 14, dependencyType: 'SS', lagDays: 90 }
  if (phaseId.includes('superstructure') || phaseId.includes('structure-core')) return { mode: 'strict_finish_start', dependencyType: 'FS', lagDays: 0 }
  if (phaseId.includes('mep')) return { mode: 'overlap_after_days', afterDays: 60, dependencyType: 'SS', lagDays: 60 }
  if (phaseId.includes('finishing') || phaseId.includes('fitout')) return { mode: 'overlap_before_finish_days', beforeFinishDays: 30, dependencyType: 'SS', lagDays: 120 }
  if (phaseId.includes('commission') || phaseId.includes('outdoor')) return { mode: 'overlap_before_finish_days', beforeFinishDays: 30, dependencyType: 'SS', lagDays: 90 }
  return { mode: 'overlap_after_percent', percent: 70, dependencyType: 'SS', lagDays: 0 }
}



export function resolvePhaseReleasePolicy(operation: PlanningTableOperation, index: number, explicitPolicies: Map<string, WbsTemplatePhaseReleasePolicy>) {
  const phaseId = readOperationPhaseId(operation)
  const explicitMapPolicy = phaseId ? explicitPolicies.get(phaseId) : null
  if (explicitMapPolicy) {
    return {
      policy: explicitMapPolicy,
      source: 'explicit_map',
    } satisfies ResolvedPhaseReleasePolicy
  }
  const operationPolicy = readOperationPhaseReleasePolicy(operation)
  if (operationPolicy) {
    return {
      policy: operationPolicy,
      source: 'operation',
    } satisfies ResolvedPhaseReleasePolicy
  }
  return {
    policy: inferDefaultPhaseReleasePolicy(operation, index),
    source: 'inferred',
  } satisfies ResolvedPhaseReleasePolicy
}



export function computePhaseReleaseStartDate(params: {
  projectStartDate: string
  previousStartDate: string | null
  previousEndDate: string | null
  previousDurationDays: number
  policy: WbsTemplatePhaseReleasePolicy
}) {
  const { projectStartDate, previousStartDate, previousEndDate, previousDurationDays, policy } = params
  if (!previousStartDate || !previousEndDate) return projectStartDate
  let computedStart: string
  switch (policy.mode) {
    case 'parallel_group':
      computedStart = projectStartDate
      break
    case 'overlap_after_days':
      computedStart = addDays(previousStartDate, clampInteger(policy.afterDays, 0, 3650, 0))
      break
    case 'overlap_before_finish_days':
      computedStart = addDays(previousEndDate, -clampInteger(policy.beforeFinishDays, 0, 3650, 0))
      break
    case 'overlap_after_percent': {
      const percent = clampInteger(policy.percent, 0, 100, 70)
      computedStart = addDays(previousStartDate, Math.max(0, Math.floor(previousDurationDays * percent / 100)))
      break
    }
    case 'strict_finish_start':
    default:
      computedStart = addDays(previousEndDate, 1 + clampInteger(policy.lagDays, -3650, 3650, 0))
  }
  return comparePlanDates(computedStart, projectStartDate) < 0 ? projectStartDate : computedStart
}



export const EXECUTION_PHASE_RELEASE_OPERATION_BY_PHASE: Record<string, Partial<PlanningTableOperation>> = {
  startup_site_setup: {
    phase_object_id: 'site-startup',
    scope: { phase_object_id: 'site-startup' },
  },
  foundation_pit_pile: {
    phase_object_id: 'foundation-pit',
    scope: { phase_object_id: 'foundation-pit' },
  },
  basement_structure: {
    phase_object_id: 'basement',
    scope: { phase_object_id: 'basement' },
  },
  basement_waterproof_handover: {
    phase_object_id: 'basement-waterproof',
    scope: { phase_object_id: 'basement-waterproof' },
  },
  superstructure_rhythm: {
    phase_object_id: 'superstructure',
    scope: { phase_object_id: 'superstructure' },
  },
  secondary_structure_fitout_roughin: {
    phase_object_id: 'secondary-structure',
    scope: { phase_object_id: 'secondary-structure' },
  },
  mep_roughin: {
    phase_object_id: 'mep',
    scope: { phase_object_id: 'mep' },
  },
  envelope_roof_facade: {
    phase_object_id: 'facade-envelope',
    scope: { phase_object_id: 'facade-envelope' },
  },
  elevator_installation: {
    phase_object_id: 'elevator',
    scope: { phase_object_id: 'elevator' },
  },
  interior_fitout_terminal: {
    phase_object_id: 'finishing-fitout',
    scope: { phase_object_id: 'finishing-fitout' },
  },
  outdoor_municipal_landscape: {
    phase_object_id: 'outdoor',
    scope: { phase_object_id: 'outdoor' },
  },
  commissioning: {
    phase_object_id: 'commissioning',
    scope: { phase_object_id: 'commissioning' },
  },
  acceptance_handover: {
    phase_object_id: 'handover',
    scope: { phase_object_id: 'handover' },
  },
  management_support: {
    phase_object_id: 'management-support',
    scope: { phase_object_id: 'management-support' },
  },
}



export function buildExecutionPhaseReleaseOperation(baseOperation: PlanningTableOperation, phase: string): PlanningTableOperation {
  const phaseOperation = EXECUTION_PHASE_RELEASE_OPERATION_BY_PHASE[phase] ?? {
    phase_object_id: phase,
    scope: { phase_object_id: phase },
  }
  return {
    ...baseOperation,
    ...phaseOperation,
    scope: {
      ...readRecord(baseOperation.scope),
      ...readRecord(phaseOperation.scope),
    },
  } as PlanningTableOperation
}



export function resolveExecutionPhaseReleasePolicy(
  baseOperation: PlanningTableOperation,
  phase: string,
  phaseIndex: number,
) {
  const phaseOperation = buildExecutionPhaseReleaseOperation(baseOperation, phase)
  return scalePhaseReleasePolicyByProjectFacts(
    resolvePhaseReleasePolicy(phaseOperation, phaseIndex, new Map()),
    phaseOperation,
  )
}



export function phaseReleasePolicyToDependency(policy: WbsTemplatePhaseReleasePolicy): Pick<GeneratedTemplateDependency, 'dependencyType' | 'lagDays'> {
  if (policy.dependencyType === 'SF') {
    return { dependencyType: 'SF', lagDays: clampInteger(policy.lagDays, -3650, 3650, 0) }
  }
  if (policy.mode === 'strict_finish_start') {
    return { dependencyType: 'FS', lagDays: clampInteger(policy.lagDays, -3650, 3650, 0) }
  }
  if (policy.mode === 'overlap_after_days') {
    return { dependencyType: 'SS', lagDays: clampInteger(policy.afterDays ?? policy.lagDays, -3650, 3650, 0) }
  }
  if (policy.mode === 'overlap_after_percent') {
    return { dependencyType: 'SS', lagDays: clampInteger(policy.lagDays, -3650, 3650, 0) }
  }
  if (policy.mode === 'overlap_before_finish_days') {
    return { dependencyType: 'FF', lagDays: -clampInteger(policy.beforeFinishDays ?? policy.lagDays, 0, 3650, 0) }
  }
  return { dependencyType: 'SS', lagDays: clampInteger(policy.lagDays, -3650, 3650, 0) }
}



export function readGeneratedRowPlanScheduleDurationDays(
  row: GeneratedTemplateRow,
  constructionCalendar?: ConstructionCalendarContext | null,
) {
  if (!isAuthoritativeConstructionCalendar(constructionCalendar)) return readGeneratedRowPlanDurationDays(row)
  const start = readGeneratedRowPlanStart(row)
  const end = readGeneratedRowPlanEnd(row)
  const parsedStart = parseConstructionCalendarDate(start)
  const parsedEnd = parseConstructionCalendarDate(end)
  if (parsedStart && parsedEnd && parsedEnd >= parsedStart) {
    return Math.max(1, productionDaysBetweenInclusive(parsedStart, parsedEnd, constructionCalendar) || 1)
  }
  return readGeneratedRowPlanDurationDays(row)
}



export function shiftGeneratedRowPlanDates(
  row: GeneratedTemplateRow,
  shiftDays: number,
  constructionCalendar?: ConstructionCalendarContext | null,
) {
  if (shiftDays === 0) return
  const start = readGeneratedRowPlanStart(row)
  const end = readGeneratedRowPlanEnd(row)
  if (!start || !end) return
  const hasAuthoritativeCalendar = isAuthoritativeConstructionCalendar(constructionCalendar)
  const nextStart = hasAuthoritativeCalendar
    ? addTemplateProductionDays(addDays(start, shiftDays), 0, constructionCalendar)
    : addDays(start, shiftDays)
  const durationDays = readGeneratedRowPlanScheduleDurationDays(row, constructionCalendar)
  const nextEnd = hasAuthoritativeCalendar
    ? addTemplateProductionDays(nextStart, Math.max(1, durationDays) - 1, constructionCalendar)
    : addDays(end, shiftDays)
  row.values = {
    ...row.values,
    planned_start_date: nextStart,
    planned_end_date: nextEnd,
    start_date: nextStart,
    end_date: nextEnd,
  }
}



export function computeDependencyRequiredStart(
  dependency: GeneratedTemplateDependency,
  predecessor: GeneratedTemplateRow,
  successorDurationDays: number,
  constructionCalendar?: ConstructionCalendarContext | null,
) {
  const predecessorStart = readGeneratedRowPlanStart(predecessor)
  const predecessorEnd = readGeneratedRowPlanEnd(predecessor)
  const lagDays = Number.isFinite(Number(dependency.lagDays)) ? Math.round(Number(dependency.lagDays)) : 0
  switch (dependency.dependencyType) {
    case 'SS':
      return predecessorStart ? addTemplateProductionDayOffset(predecessorStart, lagDays, constructionCalendar) : null
    case 'FF': {
      const requiredFinish = predecessorEnd
        ? addTemplateProductionDayOffset(predecessorEnd, lagDays, constructionCalendar)
        : null
      return requiredFinish
        ? subtractTemplateProductionDays(requiredFinish, Math.max(1, successorDurationDays) - 1, constructionCalendar)
        : null
    }
    case 'SF': {
      const requiredFinish = predecessorStart
        ? addTemplateProductionDayOffset(predecessorStart, lagDays, constructionCalendar)
        : null
      return requiredFinish
        ? subtractTemplateProductionDays(requiredFinish, Math.max(1, successorDurationDays) - 1, constructionCalendar)
        : null
    }
    case 'FS':
    default:
      return predecessorEnd ? addTemplateProductionDayOffset(predecessorEnd, lagDays + 1, constructionCalendar) : null
  }
}



export function shiftGeneratedRowAndDescendants(
  row: GeneratedTemplateRow,
  shiftDays: number,
  childRowsByParentId: Map<string, GeneratedTemplateRow[]>,
  constructionCalendar?: ConstructionCalendarContext | null,
) {
  if (shiftDays === 0) return []
  shiftGeneratedRowPlanDates(row, shiftDays, constructionCalendar)
  const shiftedClientRowIds = [row.clientRowId]
  for (const child of childRowsByParentId.get(row.clientRowId) ?? []) {
    shiftedClientRowIds.push(
      ...shiftGeneratedRowAndDescendants(child, shiftDays, childRowsByParentId, constructionCalendar),
    )
  }
  return shiftedClientRowIds
}



export function buildGeneratedRowsByParentId(rows: GeneratedTemplateRow[]) {
  const childRowsByParentId = new Map<string, GeneratedTemplateRow[]>()
  for (const row of rows) {
    if (!row.parentClientRowId) continue
    const siblings = childRowsByParentId.get(row.parentClientRowId) ?? []
    siblings.push(row)
    childRowsByParentId.set(row.parentClientRowId, siblings)
  }
  return childRowsByParentId
}



export function applyGeneratedDependencySchedule(
  rows: GeneratedTemplateRow[],
  constructionCalendar?: ConstructionCalendarContext | null,
) {
  const rowById = new Map(rows.map((row) => [row.clientRowId, row]))
  const childRowsByParentId = buildGeneratedRowsByParentId(rows)
  const projectStartDate = getGeneratedRowsEarliestStart(rows)
  const scheduleCapDate = projectStartDate ? addDays(projectStartDate, 3650) : null
  let nonConvergent = false
  let cappedShiftCount = 0
  let maxRequiredStartBeyondCap: string | null = null

  const dependencyStats = new Map<string, {
    predecessorCount: number
    appliedDependencyTypes: Set<GeneratedTemplateDependency['dependencyType']>
    appliedSources: Set<NonNullable<GeneratedTemplateDependency['source']>>
    appliedDependencyAssetStableCodes: Set<string>
    appliedDependencyTimingSources: Set<string>
    appliedRelationLayerKeys: Set<string>
    invalidPredecessorCount: number
    adjusted: boolean
    maxShiftDays: number
  }>()

  for (const row of rows) {
    if (row.predecessorDependencies.length === 0) continue
    const stat = {
      predecessorCount: 0,
      appliedDependencyTypes: new Set<GeneratedTemplateDependency['dependencyType']>(),
      appliedSources: new Set<NonNullable<GeneratedTemplateDependency['source']>>(),
      appliedDependencyAssetStableCodes: new Set<string>(),
      appliedDependencyTimingSources: new Set<string>(),
      appliedRelationLayerKeys: new Set<string>(),
      invalidPredecessorCount: 0,
      adjusted: false,
      maxShiftDays: 0,
    }
    for (const dependency of row.predecessorDependencies) {
      const predecessor = rowById.get(dependency.clientRowId)
      const isLinkedProfileAnchor = dependency.intentCode === 'business_type_profile_phase_anchor'
        && predecessor
        && getRowProjectionMode(predecessor) !== 'schedule_row'
      if (isLinkedProfileAnchor) continue
      if (!predecessor || !readGeneratedRowPlanStart(predecessor) || !readGeneratedRowPlanEnd(predecessor)) {
        stat.invalidPredecessorCount += 1
        continue
      }
      stat.predecessorCount += 1
      stat.appliedDependencyTypes.add(dependency.dependencyType)
      if (dependency.source) stat.appliedSources.add(dependency.source)
      const evidence = readRecord(dependency.dependencyRuleEvidence)
      const assetStableCode = normalizeText(evidence.dependencyAssetStableCode)
      if (assetStableCode) stat.appliedDependencyAssetStableCodes.add(assetStableCode)
      const timingSource = normalizeText(evidence.dependencyTimingSource)
      if (timingSource) stat.appliedDependencyTimingSources.add(timingSource)
      const relationLayerKey = normalizeText(evidence.relationLayerKey)
      if (relationLayerKey) stat.appliedRelationLayerKeys.add(relationLayerKey)
    }
    if (stat.predecessorCount > 0 || stat.invalidPredecessorCount > 0) {
      dependencyStats.set(row.clientRowId, stat)
    }
  }

  const maxPasses = Math.max(rows.length, 1)
  for (let pass = 0; pass < maxPasses; pass += 1) {
    let changed = false
    for (const row of rows) {
      if (row.predecessorDependencies.length === 0) continue
      const currentStart = readGeneratedRowPlanStart(row)
      if (!currentStart) continue
      const durationDays = readGeneratedRowPlanScheduleDurationDays(row, constructionCalendar)
      let requiredStart = currentStart
      for (const dependency of row.predecessorDependencies) {
        const predecessor = rowById.get(dependency.clientRowId)
        if (!predecessor) continue
        if (
          dependency.intentCode === 'business_type_profile_phase_anchor'
          && getRowProjectionMode(predecessor) !== 'schedule_row'
        ) continue
        const dependencyRequiredStart = computeDependencyRequiredStart(
          dependency,
          predecessor,
          durationDays,
          constructionCalendar,
        )
        if (comparePlanDates(dependencyRequiredStart, requiredStart) > 0) {
          requiredStart = dependencyRequiredStart
        }
      }
      if (scheduleCapDate && comparePlanDates(requiredStart, scheduleCapDate) > 0) {
        nonConvergent = true
        cappedShiftCount += 1
        maxRequiredStartBeyondCap = !maxRequiredStartBeyondCap || comparePlanDates(requiredStart, maxRequiredStartBeyondCap) > 0
          ? requiredStart
          : maxRequiredStartBeyondCap
        requiredStart = scheduleCapDate
      }
      const shiftDays = signedDurationDayDelta(currentStart, requiredStart) ?? 0
      if (shiftDays <= 0) continue
      const shiftedClientRowIds = shiftGeneratedRowAndDescendants(row, shiftDays, childRowsByParentId, constructionCalendar)
      for (const shiftedClientRowId of shiftedClientRowIds) {
        const stat = dependencyStats.get(shiftedClientRowId)
        if (stat) {
          stat.adjusted = true
          stat.maxShiftDays = Math.max(stat.maxShiftDays, shiftDays)
        }
      }
      changed = true
    }
    if (!changed) break
    if (pass === maxPasses - 1) nonConvergent = true
  }

  for (const [clientRowId, stat] of dependencyStats.entries()) {
    const row = rowById.get(clientRowId)
    if (!row) continue
    const metadata = readRowMetadata(row)
    const previousDependencySchedule = readRecord(metadata.dependencySchedule)
    const previousMaxShiftDays = readOptionalNumber(previousDependencySchedule.maxShiftDays) ?? 0
    const authoritativeConstructionCalendar = isAuthoritativeConstructionCalendar(constructionCalendar)
    row.values = {
      ...row.values,
      standard_task_metadata: {
        ...metadata,
        dependencySchedule: {
          source: 'generated_dependency_network',
          adjusted: stat.adjusted || previousDependencySchedule.adjusted === true,
          calendarBasis: effectiveConstructionCalendarBasis(constructionCalendar),
          constructionCalendarWindowCount: effectiveConstructionCalendarWindowCount(constructionCalendar),
          constructionCalendarRef: authoritativeConstructionCalendar ? constructionCalendar.calendarRef : null,
          constructionCalendarVersion: authoritativeConstructionCalendar ? constructionCalendar.calendarVersion : null,
          constructionCalendarTimezone: authoritativeConstructionCalendar
            ? constructionCalendar.timezone
            : constructionCalendar?.timezone ?? 'Asia/Shanghai',
          constructionCalendarAvailability: authoritativeConstructionCalendar ? 'available' : 'unavailable',
          durationBasis: authoritativeConstructionCalendar ? 'production_day' : 'calendar_day',
          predecessorCount: stat.predecessorCount,
          invalidPredecessorCount: stat.invalidPredecessorCount,
          appliedDependencyTypes: [...stat.appliedDependencyTypes],
          appliedSources: [...stat.appliedSources],
          appliedDependencyAssetStableCodes: [...stat.appliedDependencyAssetStableCodes].sort(),
          appliedDependencyTimingSources: [...stat.appliedDependencyTimingSources].sort(),
          appliedRelationLayerKeys: [...stat.appliedRelationLayerKeys].sort(),
          maxShiftDays: Math.max(stat.maxShiftDays, previousMaxShiftDays),
          convergence: nonConvergent
            ? {
                status: 'capped_or_unresolved',
                scheduleCapDate,
                cappedShiftCount,
                maxRequiredStartBeyondCap,
              }
            : { status: 'converged' },
        },
      },
    }
  }

  return nonConvergent
    ? {
        code: 'DEPENDENCY_SCHEDULE_NON_CONVERGENT' as const,
        severity: 'warning' as const,
        nodeCode: 'GENERATED_DEPENDENCY_NETWORK',
        message: 'Generated dependency schedule reached the project schedule cap before convergence; review cross-item workflow or dependency-intent rules.',
        details: {
          scheduleCapDate,
          cappedShiftCount,
          maxRequiredStartBeyondCap,
        },
      } satisfies GeneratedTemplateGovernanceWarning
    : null
}



export function applyGeneratedPhaseChainSchedule(rows: GeneratedTemplateRow[], scopeCombos: WbsTemplateScope[]) {
  const phaseOrder: string[] = []
  const phaseByScopeIndex = new Map<number, string>()
  scopeCombos.forEach((scope, scopeIndex) => {
    const phaseId = normalizeText(scope.phase_object_id)
    if (!phaseId) return
    phaseByScopeIndex.set(scopeIndex, phaseId)
    if (!phaseOrder.includes(phaseId)) phaseOrder.push(phaseId)
  })
  if (phaseOrder.length <= 1) return

  const rowsByPhaseId = new Map<string, GeneratedTemplateRow[]>()
  for (const row of rows) {
    const scopeIndex = Number(row.values.scope_index)
    const phaseId = Number.isFinite(scopeIndex)
      ? phaseByScopeIndex.get(scopeIndex)
      : normalizeText(row.values.phase_object_id)
    if (!phaseId) continue
    rowsByPhaseId.set(phaseId, [...(rowsByPhaseId.get(phaseId) ?? []), row])
  }

  const childRowsByParentId = buildGeneratedRowsByParentId(rows)
  let previousPhaseEnd: string | null = null
  for (const phaseId of phaseOrder) {
    const phaseRows = rowsByPhaseId.get(phaseId) ?? []
    const rootRows = phaseRows.filter((row) => !row.parentClientRowId || !phaseRows.some((candidate) => candidate.clientRowId === row.parentClientRowId))
    const earliestStart = phaseRows
      .map(readGeneratedRowPlanStart)
      .filter((date): date is string => Boolean(date))
      .sort(comparePlanDates)[0] ?? null
    if (previousPhaseEnd && earliestStart) {
      const requiredStart = addDays(previousPhaseEnd, 1)
      const shiftDays = signedDurationDayDelta(earliestStart, requiredStart) ?? 0
      if (shiftDays !== 0) {
        for (const row of rootRows) {
          shiftGeneratedRowAndDescendants(row, shiftDays, childRowsByParentId)
        }
        for (const row of phaseRows) {
          const metadata = readRowMetadata(row)
          row.values = {
            ...row.values,
            standard_task_metadata: {
              ...metadata,
              phaseChainSchedule: {
                source: 'generated_phase_chain',
                phaseId,
                adjusted: true,
                shiftDays,
                previousPhaseEnd,
                requiredStart,
              },
            },
          }
        }
      }
    }
    previousPhaseEnd = phaseRows
      .map(readGeneratedRowPlanEnd)
      .filter((date): date is string => Boolean(date))
      .sort(comparePlanDates)
      .at(-1) ?? previousPhaseEnd
  }
}



export function getGeneratedRowExecutionPhase(row: GeneratedTemplateRow) {
  const metadata = readRowMetadata(row)
  return normalizeText(row.executionPhase ?? row.values.execution_phase ?? metadata.executionPhase)
}



export function rowIsManagedFrontierSummaryScheduleRow(row: GeneratedTemplateRow) {
  if (getRowProjectionMode(row) !== 'schedule_row') return false
  if (!isDurationBearingContributionMode(getRowDurationContributionMode(row))) return false
  const categoryType = readRowCategoryType(row)
  if (!['division', 'sub_division', 'item_work'].includes(categoryType)) return false
  return Boolean(readRowMetadata(row).generationDepthPolicy)
}



export function readStableCodeMajor(value: unknown) {
  const code = normalizeText(value).toUpperCase()
  return code.split('-').filter(Boolean)[0] ?? code
}



export function readStableCodeFamily(value: unknown) {
  const code = normalizeText(value).toUpperCase()
  const parts = code.split('-').filter(Boolean)
  if (parts.length >= 2) return `${parts[0]}-${parts[1]}`
  return parts[0] ?? code
}



export function readSummaryNetworkLaneKey(row: GeneratedTemplateRow, phase: string) {
  const metadata = readRowMetadata(row)
  const projectOrganization = readRecord(metadata.projectOrganization)
  const organizationLane = normalizeText(
    projectOrganization.organizationLane
      ?? row.values.organization_lane,
  )
  const executionLane = normalizeText(row.executionLane ?? row.values.execution_lane ?? metadata.executionLane)
  const templateGroup = normalizeText(metadata.templateGroup ?? row.values.template_group)
  const packType = normalizeText(metadata.packType ?? row.values.pack_type)
  const phaseKind = inferSchedulePhaseKindFromText(phase)
  const codeBucket = phaseKind === 'foundation' || phaseKind === 'basement'
    ? readStableCodeFamily(readRowStableCode(row))
    : readStableCodeMajor(readRowStableCode(row))
  if (organizationLane) {
    const organizationRole = normalizeText(
      projectOrganization.organizationLaneRole
        ?? row.values.organization_lane_role,
    )
    const organizationBucket = organizationRole === 'shared_works'
      ? codeBucket
      : executionLane || templateGroup || packType || codeBucket
    return ['project_org', organizationLane, phaseKind, organizationBucket].filter(Boolean).join(':')
  }
  return [executionLane, templateGroup, packType, codeBucket].filter(Boolean).join(':') || codeBucket || 'default'
}



export function rowProjectOrganizationMetadata(row: GeneratedTemplateRow) {
  return readRecord(readRowMetadata(row).projectOrganization)
}



export function rowHasProjectOrganizationBasis(row: GeneratedTemplateRow) {
  return rowProjectOrganizationMetadata(row).source === 'project_execution_organization_policy'
}



export function readProjectOrganizationLane(row: GeneratedTemplateRow) {
  const organization = rowProjectOrganizationMetadata(row)
  return normalizeText(organization.organizationLane ?? row.values.organization_lane)
}



export function readProjectOrganizationLaneRole(row: GeneratedTemplateRow) {
  const organization = rowProjectOrganizationMetadata(row)
  return normalizeText(organization.organizationLaneRole ?? row.values.organization_lane_role)
}



export function readProjectOrganizationPolicySummary(row: GeneratedTemplateRow) {
  const projectOrganization = rowProjectOrganizationMetadata(row)
  if (projectOrganization.source !== 'project_execution_organization_policy') return {}
  return {
    basis: 'project_execution_organization_policy',
    organizationPolicyId: projectOrganization.policyId ?? null,
    organizationStrategy: projectOrganization.strategy ?? null,
    organizationLane: projectOrganization.organizationLane ?? row.values.organization_lane ?? null,
    organizationLaneRole: projectOrganization.organizationLaneRole ?? row.values.organization_lane_role ?? null,
    organizationScopeGroup: projectOrganization.organizationScopeGroup ?? row.values.organization_scope_group ?? null,
    policySourceVersion: projectOrganization.policySourceVersion ?? null,
    networkPolicy: projectOrganization.networkPolicy ?? null,
    resourcePolicy: projectOrganization.resourcePolicy ?? null,
  }
}



export function readProjectOrganizationNetworkPolicy(row: GeneratedTemplateRow) {
  return readRecord(rowProjectOrganizationMetadata(row).networkPolicy)
}



export function computeSummaryNetworkReleaseStepDays(params: {
  previousRow: GeneratedTemplateRow
  currentRow: GeneratedTemplateRow
  phase: string
  operation: PlanningTableOperation
}) {
  const previousDuration = readGeneratedRowPlanDurationDays(params.previousRow)
  const phaseKind = inferSchedulePhaseKindFromText(`${params.phase} ${readRowStableCode(params.currentRow)}`)
  const facts = getOperationFactProfile(params.operation)
  const scenarioProfile = readScenarioScheduleProfile(facts)
  const executionProfile = readExecutionProfileFromProjectFacts(facts)
  const fastTrack = scenarioProfile.fastTrackIntensity === 'high'
    || scenarioProfile.dominantSchedulePattern === 'factory_parallel_site_assembly'
    || executionProfileHasArchetype(executionProfile, 'steel_assembly_fast_track')
    || executionProfileHasArchetype(executionProfile, 'mic_modular_fast_track')
  const sameMajor = readStableCodeMajor(readRowStableCode(params.previousRow)) === readStableCodeMajor(readRowStableCode(params.currentRow))
  const sameFamily = readStableCodeFamily(readRowStableCode(params.previousRow)) === readStableCodeFamily(readRowStableCode(params.currentRow))
  const baseRatio = phaseKind === 'mep'
    ? 0.14
    : phaseKind === 'finishing' || phaseKind === 'facade'
      ? 0.18
      : phaseKind === 'outdoor' || phaseKind === 'commissioning'
        ? 0.22
        : phaseKind === 'foundation' || phaseKind === 'basement'
          ? 0.24
          : 0.2
  const familyFactor = sameFamily ? 1.25 : sameMajor ? 1 : 0.78
  const fastTrackFactor = fastTrack ? 0.72 : 1
  const rawStep = previousDuration * baseRatio * familyFactor * fastTrackFactor
  const minStep = phaseKind === 'mep'
    ? 3
    : phaseKind === 'finishing' || phaseKind === 'facade'
      ? 4
      : phaseKind === 'foundation' || phaseKind === 'basement'
        ? 5
        : 4
  const maxStep = phaseKind === 'foundation' || phaseKind === 'basement'
    ? Math.max(14, Math.round(scenarioProfile.foundationReleaseDays * 0.6))
    : phaseKind === 'mep'
      ? Math.max(10, Math.round(scenarioProfile.mepReleaseDays * 0.35))
      : phaseKind === 'finishing' || phaseKind === 'facade'
        ? Math.max(12, Math.round(scenarioProfile.fitoutReleaseDays * 0.3))
        : Math.max(14, Math.round(scenarioProfile.commissioningReleaseDays * 0.35))
  return clampInteger(rawStep, minStep, maxStep, minStep)
}



export function computeProjectOrganizationLaneReleaseDays(params: {
  previousRow: GeneratedTemplateRow | null
  currentRow: GeneratedTemplateRow
  phase: string
  operation: PlanningTableOperation
}) {
  const laneRole = readProjectOrganizationLaneRole(params.currentRow)
  if (laneRole === 'shared_works' || !params.previousRow) return 0
  const policy = readProjectOrganizationNetworkPolicy(params.currentRow)
  const laneScheduling = normalizeText(policy.primaryLaneScheduling)
  if (laneScheduling === 'parallel_lanes_with_interface_gates') return 0
  return computeSummaryNetworkReleaseStepDays({
    previousRow: params.previousRow,
    currentRow: params.currentRow,
    phase: params.phase,
    operation: params.operation,
  })
}



export function applyManagedFrontierSummaryNetworkSchedule(params: {
  phase: string
  phaseRows: GeneratedTemplateRow[]
  phaseStart: string
  operation: PlanningTableOperation
  childRowsByParentId: Map<string, GeneratedTemplateRow[]>
}) {
  const sortedRootRows = params.phaseRows
    .filter((row) => !row.parentClientRowId || !params.phaseRows.some((candidate) => candidate.clientRowId === row.parentClientRowId))
    .filter(rowIsManagedFrontierSummaryScheduleRow)
    .sort((left, right) => {
      const byStart = comparePlanDates(readGeneratedRowPlanStart(left), readGeneratedRowPlanStart(right))
      if (byStart) return byStart
      const byExecutionSort = Number(left.values.execution_sort_key ?? left.executionSortKey ?? 0)
        - Number(right.values.execution_sort_key ?? right.executionSortKey ?? 0)
      if (byExecutionSort) return byExecutionSort
      return readRowStableCode(left).localeCompare(readRowStableCode(right), 'zh-Hans-CN')
    })
  const rootRows = sortedRootRows.filter((row, index) => {
    const laneKey = readSummaryNetworkLaneKey(row, params.phase)
    return sortedRootRows.findIndex((candidate) => readSummaryNetworkLaneKey(candidate, params.phase) === laneKey) === index
  })
  if (rootRows.length <= 1) return

  if (rootRows.some(rowHasProjectOrganizationBasis)) {
    const sharedRoots = rootRows.filter((row) => readProjectOrganizationLaneRole(row) === 'shared_works')
    const primaryRoots = rootRows.filter((row) => readProjectOrganizationLaneRole(row) !== 'shared_works')
    const sharedEnd = sharedRoots
      .map(readGeneratedRowPlanEnd)
      .filter((date): date is string => Boolean(date))
      .sort(comparePlanDates)
      .at(-1) ?? null
    const firstPolicy = rootRows.map(readProjectOrganizationNetworkPolicy).find((policy) => Object.keys(policy).length > 0) ?? {}
    const sharedRelease = normalizeText(firstPolicy.sharedWorksRelease)
    const primaryReleaseStart = sharedEnd && sharedRelease !== 'parallel_with_primary_lanes'
      ? addDays(sharedEnd, 1)
      : params.phaseStart
    let previousPrimaryRow: GeneratedTemplateRow | null = null
    let primaryCursor = primaryReleaseStart

    for (const row of rootRows) {
      const laneRole = readProjectOrganizationLaneRole(row)
      const targetStart = laneRole === 'shared_works' ? params.phaseStart : primaryCursor
      const currentStart = readGeneratedRowPlanStart(row)
      if (!currentStart) continue
      const shiftDays = signedDurationDayDelta(currentStart, targetStart) ?? 0
      if (shiftDays !== 0) {
        shiftGeneratedRowAndDescendants(row, shiftDays, params.childRowsByParentId)
      }
      const releaseStepDaysFromPrevious = laneRole === 'shared_works'
        ? null
        : computeProjectOrganizationLaneReleaseDays({
            previousRow: previousPrimaryRow,
            currentRow: row,
            phase: params.phase,
            operation: params.operation,
          })
      const metadata = readRowMetadata(row)
      row.values = {
        ...row.values,
        standard_task_metadata: {
          ...metadata,
          summaryNetworkSchedule: {
            source: 'generation_depth_policy_summary_network',
            policy: 'project_organization_lane_network',
            ...readProjectOrganizationPolicySummary(row),
            phase: params.phase,
            phaseStart: params.phaseStart,
            targetStart,
            adjusted: shiftDays !== 0,
            shiftDays,
            predecessorStableCode: previousPrimaryRow && laneRole !== 'shared_works'
              ? readRowStableCode(previousPrimaryRow)
              : null,
            releaseStepDaysFromPrevious,
            sharedWorksReleaseDate: primaryReleaseStart,
            trustBasis: 'business_type_building_pattern_shared_work_interface_gate',
          },
        },
      }
      if (laneRole !== 'shared_works') {
        if (releaseStepDaysFromPrevious) {
          primaryCursor = addDays(primaryCursor, releaseStepDaysFromPrevious)
        }
        previousPrimaryRow = row
      }
    }

    const rootIds = new Set(rootRows.map((row) => row.clientRowId))
    const laneStartByKey = new Map<string, string>()
    for (const row of rootRows) {
      laneStartByKey.set(readSummaryNetworkLaneKey(row, params.phase), readGeneratedRowPlanStart(row) ?? params.phaseStart)
    }
    for (const row of sortedRootRows) {
      if (rootIds.has(row.clientRowId)) continue
      const targetStart = laneStartByKey.get(readSummaryNetworkLaneKey(row, params.phase)) ?? params.phaseStart
      const currentStart = readGeneratedRowPlanStart(row)
      if (!currentStart) continue
      const shiftDays = signedDurationDayDelta(currentStart, targetStart) ?? 0
      if (shiftDays !== 0) {
        shiftGeneratedRowAndDescendants(row, shiftDays, params.childRowsByParentId)
      }
      const metadata = readRowMetadata(row)
      row.values = {
        ...row.values,
        standard_task_metadata: {
          ...metadata,
          summaryNetworkSchedule: {
            source: 'generation_depth_policy_summary_network',
            policy: 'project_organization_lane_parallel_projection',
            ...readProjectOrganizationPolicySummary(row),
            phase: params.phase,
            phaseStart: params.phaseStart,
            laneKey: readSummaryNetworkLaneKey(row, params.phase),
            targetStart,
            adjusted: shiftDays !== 0,
            shiftDays,
            trustBasis: 'business_type_building_pattern_shared_work_interface_gate',
          },
        },
      }
    }
    return
  }

  let cursor = params.phaseStart
  let previousRow: GeneratedTemplateRow | null = null
  const laneStartByKey = new Map<string, string>()
  for (const row of sortedRootRows) {
    const laneKey = readSummaryNetworkLaneKey(row, params.phase)
    if (!laneStartByKey.has(laneKey)) laneStartByKey.set(laneKey, params.phaseStart)
  }
  for (const row of rootRows) {
    const currentStart = readGeneratedRowPlanStart(row)
    if (!currentStart) continue
    const shiftDays = signedDurationDayDelta(currentStart, cursor) ?? 0
    if (shiftDays !== 0) {
      shiftGeneratedRowAndDescendants(row, shiftDays, params.childRowsByParentId)
    }
    const releaseStepDaysFromPrevious = previousRow
      ? computeSummaryNetworkReleaseStepDays({
          previousRow,
          currentRow: row,
          phase: params.phase,
          operation: params.operation,
        })
      : null
    const metadata = readRowMetadata(row)
    row.values = {
      ...row.values,
      standard_task_metadata: {
        ...metadata,
        summaryNetworkSchedule: {
          source: 'generation_depth_policy_summary_network',
          policy: 'managed_frontier_phase_workface_release',
          ...readProjectOrganizationPolicySummary(row),
          phase: params.phase,
          phaseStart: params.phaseStart,
          adjusted: shiftDays !== 0,
          shiftDays,
          predecessorStableCode: previousRow ? readRowStableCode(previousRow) : null,
          releaseStepDaysFromPrevious,
        },
      },
    }
    if (previousRow && releaseStepDaysFromPrevious) {
      cursor = addDays(cursor, releaseStepDaysFromPrevious)
    }
    previousRow = row
  }
  const rootIds = new Set(rootRows.map((row) => row.clientRowId))
  for (const row of sortedRootRows) {
    if (rootIds.has(row.clientRowId)) continue
    const targetStart = laneStartByKey.get(readSummaryNetworkLaneKey(row, params.phase)) ?? params.phaseStart
    const currentStart = readGeneratedRowPlanStart(row)
    if (!currentStart) continue
    const shiftDays = signedDurationDayDelta(currentStart, targetStart) ?? 0
    if (shiftDays !== 0) {
      shiftGeneratedRowAndDescendants(row, shiftDays, params.childRowsByParentId)
    }
    const metadata = readRowMetadata(row)
    row.values = {
      ...row.values,
      standard_task_metadata: {
        ...metadata,
        summaryNetworkSchedule: {
          source: 'generation_depth_policy_summary_network',
          policy: 'managed_frontier_phase_lane_parallel_projection',
          ...readProjectOrganizationPolicySummary(row),
          phase: params.phase,
          phaseStart: params.phaseStart,
          laneKey: readSummaryNetworkLaneKey(row, params.phase),
          adjusted: shiftDays !== 0,
          shiftDays,
        },
      },
    }
  }
}



export function applyGeneratedExecutionPhaseSchedule(rows: GeneratedTemplateRow[], operation: PlanningTableOperation) {
  const phaseOrder = uniqueStringArray(
    rows
      .map(getGeneratedRowExecutionPhase)
      .filter(Boolean)
      .sort((left, right) => (EXECUTION_PHASE_ORDER[left] ?? 999) - (EXECUTION_PHASE_ORDER[right] ?? 999)),
  ).filter((phase) => (EXECUTION_PHASE_ORDER[phase] ?? 999) < EXECUTION_PHASE_ORDER.management_support)
  if (phaseOrder.length <= 1) return

  const rowsByPhase = new Map<string, GeneratedTemplateRow[]>()
  for (const row of rows) {
    const phase = getGeneratedRowExecutionPhase(row)
    if (!phaseOrder.includes(phase)) continue
    rowsByPhase.set(phase, [...(rowsByPhase.get(phase) ?? []), row])
  }

  const childRowsByParentId = buildGeneratedRowsByParentId(rows)
  const projectStartDate = getGeneratedRowsEarliestStart(rows)
  let previousPhaseStart: string | null = null
  let previousPhaseEnd: string | null = null
  let previousPhaseDurationDays = 0
  for (const [phaseIndex, phase] of phaseOrder.entries()) {
    const phaseRows = rowsByPhase.get(phase) ?? []
    const rootRows = phaseRows.filter((row) => !row.parentClientRowId || !phaseRows.some((candidate) => candidate.clientRowId === row.parentClientRowId))
    const earliestStart = phaseRows
      .map(readGeneratedRowPlanStart)
      .filter((date): date is string => Boolean(date))
      .sort(comparePlanDates)[0] ?? null
    let phaseStart = earliestStart
    if (previousPhaseEnd && earliestStart) {
      const releasePolicy = resolveExecutionPhaseReleasePolicy(operation, phase, phaseIndex)
      const requiredStart = computePhaseReleaseStartDate({
        projectStartDate: projectStartDate ?? earliestStart,
        previousStartDate: previousPhaseStart,
        previousEndDate: previousPhaseEnd,
        previousDurationDays: previousPhaseDurationDays,
        policy: releasePolicy,
      })
      const shiftDays = signedDurationDayDelta(earliestStart, requiredStart) ?? 0
      if (shiftDays !== 0) {
        for (const row of rootRows) {
          shiftGeneratedRowAndDescendants(row, shiftDays, childRowsByParentId)
        }
        for (const row of phaseRows) {
          const metadata = readRowMetadata(row)
          row.values = {
            ...row.values,
            standard_task_metadata: {
              ...metadata,
              executionPhaseSchedule: {
                source: 'generated_execution_phase_chain',
                schedulingPolicy: 'phase_release_policy',
                phase,
                releasePolicy,
                adjusted: true,
                shiftDays,
                shiftDirection: shiftDays > 0 ? 'delay_to_release_window' : 'pull_forward_to_release_window',
                previousPhaseEnd,
                requiredStart,
              },
            },
          }
        }
      }
      phaseStart = requiredStart
    }
    if (phaseStart) {
      applyManagedFrontierSummaryNetworkSchedule({
        phase,
        phaseRows,
        phaseStart,
        operation,
        childRowsByParentId,
      })
    }
    previousPhaseStart = phaseRows
      .map(readGeneratedRowPlanStart)
      .filter((date): date is string => Boolean(date))
      .sort(comparePlanDates)[0] ?? previousPhaseStart
    previousPhaseEnd = phaseRows
      .map(readGeneratedRowPlanEnd)
      .filter((date): date is string => Boolean(date))
      .sort(comparePlanDates)
      .at(-1) ?? previousPhaseEnd
    previousPhaseDurationDays = previousPhaseStart && previousPhaseEnd
      ? daysInclusive(previousPhaseStart, previousPhaseEnd)
      : previousPhaseDurationDays
  }
}



export function getGeneratedRowPhaseId(row: GeneratedTemplateRow) {
  const metadata = readRowMetadata(row)
  return normalizeText(
    row.values.phase_object_id
      ?? metadata.phaseObjectId
      ?? metadata.phase_object_id,
  )
}



export function getGeneratedRowsLatestEnd(rows: GeneratedTemplateRow[]) {
  return rows
    .map(readGeneratedRowPlanEnd)
    .filter((date): date is string => Boolean(date))
    .sort(comparePlanDates)
    .at(-1) ?? null
}



export function getGeneratedRowsEarliestStart(rows: GeneratedTemplateRow[]) {
  return rows
    .map(readGeneratedRowPlanStart)
    .filter((date): date is string => Boolean(date))
    .sort(comparePlanDates)[0] ?? null
}



export function buildGeneratedPhaseWindows(
  rows: GeneratedTemplateRow[],
  orderedPhaseIds: string[] = [],
): GeneratedPhaseWindow[] {
  const contract = buildDurationOutputContractSummary('phase_window')
  const rowsByPhaseId = new Map<string, GeneratedTemplateRow[]>()
  for (const row of rows) {
    const phaseId = getGeneratedRowPhaseId(row)
    if (!phaseId) continue
    rowsByPhaseId.set(phaseId, [...(rowsByPhaseId.get(phaseId) ?? []), row])
  }

  const phaseIds = uniqueStringArray([
    ...orderedPhaseIds,
    ...[...rowsByPhaseId.keys()],
  ])

  const phaseWindows: GeneratedPhaseWindow[] = []
  for (const phaseId of phaseIds) {
    const phaseRows = rowsByPhaseId.get(phaseId) ?? []
    if (phaseRows.length === 0) continue
    const plannedStartDate = getGeneratedRowsEarliestStart(phaseRows)
    const plannedEndDate = getGeneratedRowsLatestEnd(phaseRows)
    const durationBearingRowCount = phaseRows.filter((row) => {
      const metadata = readRowMetadata(row)
      const mode = normalizeDurationContributionMode(
        row.values.duration_contribution_mode ?? metadata.durationContributionMode ?? metadata.duration_contribution_mode,
      )
      return isDurationBearingContributionMode(mode)
    }).length

    phaseWindows.push({
      phaseId,
      plannedStartDate,
      plannedEndDate,
      phaseWindowDays: plannedStartDate && plannedEndDate
        ? daysInclusive(plannedStartDate, plannedEndDate)
        : null,
      rowCount: phaseRows.length,
      durationBearingRowCount,
      durationOutputCode: 'phase_window',
      durationOutputSemanticFieldName: contract?.semanticFieldName ?? 'phaseWindowDays',
      durationOutputContract: contract,
    })
  }
  return phaseWindows
}



export function selectPhaseChainPredecessor(
  previousRows: GeneratedTemplateRow[],
  dependencyType: GeneratedTemplateDependency['dependencyType'],
) {
  const candidates = previousRows.filter(rowCanAnchorDependencyIntent)
  const fallbackCandidates = candidates.length > 0 ? candidates : previousRows
  if (fallbackCandidates.length === 0) return null

  if (dependencyType === 'SS' || dependencyType === 'SF') {
    return [...fallbackCandidates]
      .sort((left, right) => {
        const byStart = comparePlanDates(readGeneratedRowPlanStart(left), readGeneratedRowPlanStart(right))
        if (byStart) return byStart
        return generatedDependencyPriorityForRow(right) - generatedDependencyPriorityForRow(left)
      })[0]
  }

  return [...fallbackCandidates]
    .sort((left, right) => {
      const byEnd = comparePlanDates(readGeneratedRowPlanEnd(right), readGeneratedRowPlanEnd(left))
      if (byEnd) return byEnd
      return generatedDependencyPriorityForRow(right) - generatedDependencyPriorityForRow(left)
    })[0]
}



export function readTargetConstraintContext(operation: PlanningTableOperation) {
  const clientContext = readRecord(operation.clientContext ?? operation.client_context)
  const targetEndDate = normalizeDate(
    clientContext.projectPlannedEndDate
      ?? clientContext.project_planned_end_date
      ?? clientContext.targetEndDate
      ?? clientContext.target_end_date
      ?? operation.projectPlannedEndDate
      ?? operation.project_planned_end_date
      ?? operation.targetEndDate
      ?? operation.target_end_date,
  )
  const rawMode = normalizeId(
    clientContext.targetConstraintMode
      ?? clientContext.target_constraint_mode
      ?? operation.targetConstraintMode
      ?? operation.target_constraint_mode,
  )
  const mode: GeneratedTargetFeasibility['mode'] = rawMode === 'compression_preview' || rawMode === 'reverse_cpm'
    ? rawMode
    : 'compare_only'
  return { targetEndDate, mode }
}



export function evaluateTargetEndFeasibility(
  rows: GeneratedTemplateRow[],
  operation: PlanningTableOperation,
  constructionCalendar?: ConstructionCalendarContext | null,
): GeneratedTargetFeasibility | undefined {
  const context = readTargetConstraintContext(operation)
  return evaluateBaselineTargetAlignment({
    rows,
    targetEndDate: context.targetEndDate,
    mode: context.mode as ScheduleAccelerationMode,
    context: { constructionCalendar: constructionCalendar ?? null },
  })
}



export function buildTargetEndGovernanceWarning(feasibility: GeneratedTargetFeasibility | undefined) {
  if (!feasibility || feasibility.overshootDays <= 0) return null
  return {
    code: 'TARGET_END_OVERSHOOT' as const,
    severity: 'warning' as const,
    nodeCode: 'PROJECT_TARGET_END',
    message: `?????? ${feasibility.naturalEndDate} ????????? ${feasibility.targetEndDate} ${feasibility.overshootDays} ?????????????????????????`,
    details: {
      mode: feasibility.mode,
      targetEndDate: feasibility.targetEndDate,
      naturalEndDate: feasibility.naturalEndDate,
      overshootDays: feasibility.overshootDays,
      recoverableDays: feasibility.recoverableDays,
      unrecoverableDays: feasibility.unrecoverableDays,
      verdict: feasibility.verdict,
    },
  } satisfies GeneratedTemplateGovernanceWarning
}



export function getOperationFactProfile(operation: PlanningTableOperation) {
  return buildEngineeringFeatureProfile(readScopeCombos(
    readRecord(operation.scope),
    readOperationProjectFacts(operation),
  )[0] ?? {})
}



export function readProjectPhaseScaleRatio(facts: EngineeringFeatureProfile) {
  const projectType = normalizeText(facts.projectTypeCode).toLowerCase()
  const scenarioProfile = readScenarioScheduleProfile(facts)
  const executionProfile = readExecutionProfileFromProjectFacts(facts)
  const hasLowRiseParallel = executionProfileHasArchetype(executionProfile, 'lowrise_multi_building_parallel')
    || isLowRiseMultiBuildingParallelProject(facts)
  const hasSteelAssembly = executionProfileHasArchetype(executionProfile, 'steel_assembly_fast_track')
  const hasMicModular = executionProfileHasArchetype(executionProfile, 'mic_modular_fast_track')
  const baselineArea = scenarioProfile.phaseScaleAreaBaselineM2
    || (projectType.includes('commercial') || projectType.includes('hospital') || projectType.includes('public')
      ? 90_000
      : projectType.includes('industrial')
        ? 80_000
        : 120_000)
  const baselineBuildings = 3
  const baselineFloors = projectType.includes('industrial') ? 6 : 26
  const totalArea = readOptionalNumber(facts.totalAreaM2)
  const buildingCount = readOptionalNumber(facts.buildingCount)
  const floorCount = readOptionalNumber(facts.standardFloorCount) ?? readOptionalNumber(facts.highestBuildingFloorCount)

  const areaRatio = totalArea && totalArea > 0 ? totalArea / baselineArea : 1
  const buildingRatio = buildingCount && buildingCount > 0 ? buildingCount / baselineBuildings : 1
  const floorRatio = floorCount && floorCount > 0 ? floorCount / baselineFloors : 1
  const buildingExponent = hasLowRiseParallel || hasSteelAssembly || hasMicModular
    ? Math.min(0.06, scenarioProfile.phaseScaleBuildingExponent)
    : scenarioProfile.phaseScaleBuildingExponent
  const floorExponent = hasLowRiseParallel
    ? Math.min(0.18, scenarioProfile.phaseScaleFloorExponent)
    : scenarioProfile.phaseScaleFloorExponent
  const weighted = Math.pow(areaRatio, 0.48) * Math.pow(buildingRatio, buildingExponent) * Math.pow(floorRatio, floorExponent)
  return clampNumber(weighted, 0.32, 2.6)
}



export function scalePolicyForConstructionArchetype(
  policy: WbsTemplatePhaseReleasePolicy,
  operation: PlanningTableOperation,
  facts: EngineeringFeatureProfile,
  allowModeOverride: boolean,
) {
  const scenarioProfile = readScenarioScheduleProfile(facts)
  const executionProfile = readExecutionProfileFromProjectFacts(facts)
  const hasLowRiseParallel = executionProfileHasArchetype(executionProfile, 'lowrise_multi_building_parallel')
    || isLowRiseMultiBuildingParallelProject(facts)
  const hasPrefabSupplyChain = executionProfileHasArchetype(executionProfile, 'prefab_concrete_supply_chain')
  const hasSteelAssembly = executionProfileHasArchetype(executionProfile, 'steel_assembly_fast_track')
  const hasMicModular = executionProfileHasArchetype(executionProfile, 'mic_modular_fast_track')
  const hasDeepFoundationCompanion = scenarioProfile.recommendationPacks.includes('deep_foundation')
  const phaseId = readOperationPhaseId(operation).toLowerCase()
  const phaseKind = inferSchedulePhaseKindFromText(phaseId)
  const scaled: WbsTemplatePhaseReleasePolicy = { ...policy }
  const floorCount = Math.max(
    readOptionalNumber(facts.standardFloorCount) ?? 0,
    readOptionalNumber(facts.highestBuildingFloorCount) ?? 0,
  )
  const compactLowRiseParallel = hasLowRiseParallel && floorCount > 0 && floorCount <= 13

  if (
    allowModeOverride
    && hasDeepFoundationCompanion
    && (phaseId.includes('foundation') || phaseId.includes('basement') || phaseId.includes('pit'))
  ) {
    return { mode: 'overlap_after_days', afterDays: scenarioProfile.foundationReleaseDays, dependencyType: 'SS', lagDays: scenarioProfile.foundationReleaseDays } satisfies WbsTemplatePhaseReleasePolicy
  }

  if (allowModeOverride && operationLooksPrefabFactorySupplyScope(operation)) {
    return { mode: 'parallel_group', dependencyType: 'SS', lagDays: 0 } satisfies WbsTemplatePhaseReleasePolicy
  }

  if (allowModeOverride && (
    scenarioProfile.dominantSchedulePattern === 'factory_parallel_site_assembly'
    || scenarioProfile.fastTrackIntensity === 'high'
  )) {
    if (phaseId.includes('factory') || phaseId.includes('module') || phaseId.includes('mic') || phaseId.includes('steel')) {
      return { mode: 'parallel_group', dependencyType: 'SS', lagDays: 0 } satisfies WbsTemplatePhaseReleasePolicy
    }
    if (scaled.mode === 'strict_finish_start') {
      return { mode: 'overlap_after_days', afterDays: scenarioProfile.commissioningReleaseDays, dependencyType: 'SS', lagDays: scenarioProfile.commissioningReleaseDays } satisfies WbsTemplatePhaseReleasePolicy
    }
  }

  if (allowModeOverride && (hasSteelAssembly || hasMicModular)) {
    if (phaseId.includes('factory') || phaseId.includes('module') || phaseId.includes('mic') || phaseId.includes('steel')) {
      return { mode: 'parallel_group', dependencyType: 'SS', lagDays: 0 } satisfies WbsTemplatePhaseReleasePolicy
    }
    if (phaseKind === 'mep') {
      return { mode: 'overlap_after_days', afterDays: 21, dependencyType: 'SS', lagDays: 21 } satisfies WbsTemplatePhaseReleasePolicy
    }
    if (phaseKind === 'finishing' || phaseKind === 'facade' || phaseKind === 'commissioning' || phaseKind === 'outdoor') {
      return { mode: 'overlap_after_days', afterDays: 14, dependencyType: 'SS', lagDays: 14 } satisfies WbsTemplatePhaseReleasePolicy
    }
    if (scaled.mode === 'strict_finish_start') {
      return { mode: 'overlap_after_days', afterDays: 21, dependencyType: 'SS', lagDays: 21 } satisfies WbsTemplatePhaseReleasePolicy
    }
  }

  if (allowModeOverride && hasLowRiseParallel) {
    if (phaseKind === 'superstructure' || phaseKind === 'finishing' || phaseKind === 'facade') {
      const days = compactLowRiseParallel ? 24 : 30
      return { mode: 'overlap_after_days', afterDays: days, dependencyType: 'SS', lagDays: days } satisfies WbsTemplatePhaseReleasePolicy
    }
    if (phaseKind === 'mep') {
      const days = compactLowRiseParallel ? 28 : 35
      return { mode: 'overlap_after_days', afterDays: days, dependencyType: 'SS', lagDays: days } satisfies WbsTemplatePhaseReleasePolicy
    }
    if (phaseKind === 'commissioning' || phaseKind === 'outdoor') {
      const days = compactLowRiseParallel ? 28 : 35
      return { mode: 'overlap_after_days', afterDays: days, dependencyType: 'SS', lagDays: days } satisfies WbsTemplatePhaseReleasePolicy
    }
    if (scaled.mode === 'strict_finish_start') {
      return { mode: 'overlap_after_percent', percent: 35, dependencyType: 'SS', lagDays: 0 } satisfies WbsTemplatePhaseReleasePolicy
    }
  }

  if (allowModeOverride && hasPrefabSupplyChain && operationLooksPrefabScope(operation)) {
    if (phaseId.includes('factory') || phaseId.includes('deepening') || phaseId.includes('production')) {
      return { mode: 'parallel_group', dependencyType: 'SS', lagDays: 0 } satisfies WbsTemplatePhaseReleasePolicy
    }
    if (phaseId.includes('site') || phaseId.includes('hoist') || phaseId.includes('prefab')) {
      return { mode: 'overlap_after_days', afterDays: 7, dependencyType: 'SS', lagDays: 7 } satisfies WbsTemplatePhaseReleasePolicy
    }
  }

  if (allowModeOverride && hasPrefabSupplyChain) {
    const prefabRate = normalizeRate01(facts.prefabRate) ?? 0
    const highRisePrefab = executionProfileHasArchetype(executionProfile, 'highrise_cast_in_place_tower') && !hasLowRiseParallel
    const releaseDays = prefabRate >= 0.6 ? 7 : 14
    if (highRisePrefab && prefabRate < 0.5) {
      if (phaseKind === 'mep') {
        return { mode: 'overlap_after_days', afterDays: scenarioProfile.mepReleaseDays, dependencyType: 'SS', lagDays: scenarioProfile.mepReleaseDays } satisfies WbsTemplatePhaseReleasePolicy
      }
      if (phaseKind === 'finishing' || phaseKind === 'facade') {
        return { mode: 'overlap_after_days', afterDays: scenarioProfile.fitoutReleaseDays, dependencyType: 'SS', lagDays: scenarioProfile.fitoutReleaseDays } satisfies WbsTemplatePhaseReleasePolicy
      }
      if (phaseKind === 'commissioning' || phaseKind === 'outdoor') {
        return { mode: 'overlap_after_days', afterDays: scenarioProfile.commissioningReleaseDays, dependencyType: 'SS', lagDays: scenarioProfile.commissioningReleaseDays } satisfies WbsTemplatePhaseReleasePolicy
      }
    }
    if (phaseKind === 'mep') {
      return { mode: 'overlap_after_days', afterDays: releaseDays, dependencyType: 'SS', lagDays: releaseDays } satisfies WbsTemplatePhaseReleasePolicy
    }
    if (phaseKind === 'finishing' || phaseKind === 'facade' || phaseKind === 'commissioning' || phaseKind === 'outdoor') {
      return { mode: 'overlap_after_days', afterDays: Math.max(5, Math.round(releaseDays * 0.7)), dependencyType: 'SS', lagDays: Math.max(5, Math.round(releaseDays * 0.7)) } satisfies WbsTemplatePhaseReleasePolicy
    }
  }

  if (allowModeOverride) {
    if (phaseId.includes('mep') || phaseId.includes('electrical') || phaseId.includes('hvac') || phaseId.includes('mechanical')) {
      return { mode: 'overlap_after_days', afterDays: scenarioProfile.mepReleaseDays, dependencyType: 'SS', lagDays: scenarioProfile.mepReleaseDays } satisfies WbsTemplatePhaseReleasePolicy
    }
    if (phaseId.includes('finishing') || phaseId.includes('fitout') || phaseId.includes('decoration') || phaseId.includes('guestroom')) {
      if (scaled.mode === 'overlap_before_finish_days') return scaled
      return { mode: 'overlap_after_days', afterDays: scenarioProfile.fitoutReleaseDays, dependencyType: 'SS', lagDays: scenarioProfile.fitoutReleaseDays } satisfies WbsTemplatePhaseReleasePolicy
    }
    if (phaseId.includes('commission') || phaseId.includes('validation') || phaseId.includes('handover')) {
      if (scaled.mode === 'overlap_before_finish_days') return scaled
      return { mode: 'overlap_after_days', afterDays: scenarioProfile.commissioningReleaseDays, dependencyType: 'SS', lagDays: scenarioProfile.commissioningReleaseDays } satisfies WbsTemplatePhaseReleasePolicy
    }
    if (phaseId.includes('outdoor')) {
      if (scaled.mode === 'overlap_before_finish_days') return scaled
      return { mode: 'overlap_after_days', afterDays: scenarioProfile.outdoorReleaseDays, dependencyType: 'SS', lagDays: scenarioProfile.outdoorReleaseDays } satisfies WbsTemplatePhaseReleasePolicy
    }
    if (scaled.mode === 'strict_finish_start' && scenarioProfile.strictInterfaceLagDays > 0) {
      return { mode: 'overlap_after_days', afterDays: scenarioProfile.strictInterfaceLagDays, dependencyType: 'SS', lagDays: scenarioProfile.strictInterfaceLagDays } satisfies WbsTemplatePhaseReleasePolicy
    }
  }

  return scaled
}



export function scalePhaseReleasePolicyByProjectFacts(
  resolvedPolicy: ResolvedPhaseReleasePolicy,
  operation: PlanningTableOperation,
) {
  const policy = resolvedPolicy.policy
  if (resolvedPolicy.source !== 'inferred') {
    return { ...policy }
  }
  const facts = getOperationFactProfile(operation)
  const buildingCount = facts.buildingCount ?? null
  const prefabRate = facts.prefabRate ?? null
  const foundationDepth = facts.foundationDepthM ?? null
  const executionProfile = readExecutionProfileFromProjectFacts(facts)
  const hasLowRiseParallel = executionProfileHasArchetype(executionProfile, 'lowrise_multi_building_parallel')
    || isLowRiseMultiBuildingParallelProject(facts)
  const hasSteelAssembly = executionProfileHasArchetype(executionProfile, 'steel_assembly_fast_track')
  const hasMicModular = executionProfileHasArchetype(executionProfile, 'mic_modular_fast_track')
  const phaseScaleRatio = readProjectPhaseScaleRatio(facts)
  const scaled: WbsTemplatePhaseReleasePolicy = scalePolicyForConstructionArchetype(
    policy,
    operation,
    facts,
    true,
  )

  if (scaled.mode === 'parallel_group') {
    return scaled
  }

  if (scaled.mode === 'overlap_after_days' || scaled.mode === 'overlap_before_finish_days') {
    if (scaled.mode === 'overlap_after_days') {
      const releaseDelayFactor = clampNumber(Math.pow(phaseScaleRatio, 0.36), 0.55, 1.28)
      const minAfterDays = hasSteelAssembly || hasMicModular
        ? 3
        : hasLowRiseParallel
          ? 7
          : 14
      scaled.afterDays = Math.max(minAfterDays, Math.round(clampInteger(scaled.afterDays ?? policy.afterDays ?? scaled.lagDays ?? policy.lagDays, 0, 3650, 0) * releaseDelayFactor))
      scaled.lagDays = scaled.afterDays
    } else {
      const smallProjectCompression = phaseScaleRatio < 1
        ? 1 + ((1 - phaseScaleRatio) * 0.62)
        : 1
      const largeProjectWorkfaceOverlap = phaseScaleRatio > 1
        ? Math.pow(phaseScaleRatio, 0.16)
        : 1
      const overlapFactor = clampNumber(smallProjectCompression * largeProjectWorkfaceOverlap, 1, 1.35)
      scaled.beforeFinishDays = Math.max(7, Math.round(clampInteger(scaled.beforeFinishDays ?? policy.beforeFinishDays ?? scaled.lagDays ?? policy.lagDays, 0, 3650, 0) * overlapFactor))
      scaled.lagDays = scaled.beforeFinishDays
    }
  }

  if (
    scaled.mode === 'strict_finish_start'
    && buildingCount
    && buildingCount > 3
    && !hasLowRiseParallel
    && !hasSteelAssembly
    && !hasMicModular
  ) {
    scaled.lagDays = Math.max(clampInteger(policy.lagDays, -3650, 3650, 0), Math.min(45, (buildingCount - 3) * 7))
  }

  if (foundationDepth && foundationDepth > 8 && scaled.mode === 'overlap_before_finish_days') {
    scaled.beforeFinishDays = Math.max(7, Math.round(clampInteger(scaled.beforeFinishDays ?? policy.beforeFinishDays, 0, 3650, 0) * 0.85))
  }

  const normalizedPrefabRate = normalizeRate01(prefabRate)
  if (normalizedPrefabRate !== null && scaled.mode === 'overlap_after_days') {
    const prefabPhaseFactor = operationLooksPrefabScope(operation)
      ? clampNumber(1 + normalizedPrefabRate * 0.08, 1, 1.08)
      : clampNumber(1 - normalizedPrefabRate * 0.06, 0.88, 1)
    scaled.afterDays = Math.max(7, Math.round(clampInteger(scaled.afterDays ?? policy.afterDays, 0, 3650, 0) * prefabPhaseFactor))
    scaled.lagDays = scaled.afterDays
  }

  return scaled
}



export function applyGeneratedPhaseChainDependencies(
  rows: GeneratedTemplateRow[],
  orderedPhaseIds: string[],
  releasePolicyByPhaseId: Map<string, WbsTemplatePhaseReleasePolicy> = new Map(),
) {
  const normalizedPhaseIds = uniqueStringArray(orderedPhaseIds.map(normalizeText).filter(Boolean))
  if (normalizedPhaseIds.length <= 1) return

  const rowsByPhaseId = new Map<string, GeneratedTemplateRow[]>()
  for (const row of rows) {
    const phaseId = getGeneratedRowPhaseId(row)
    if (!phaseId) continue
    rowsByPhaseId.set(phaseId, [...(rowsByPhaseId.get(phaseId) ?? []), row])
  }

  for (let index = 1; index < normalizedPhaseIds.length; index += 1) {
    const previousPhaseId = normalizedPhaseIds[index - 1]
    const currentPhaseId = normalizedPhaseIds[index]
    const previousRows = rowsByPhaseId.get(previousPhaseId) ?? []
    const currentRows = rowsByPhaseId.get(currentPhaseId) ?? []
    if (previousRows.length === 0 || currentRows.length === 0) continue

    const previousPhaseEnd = getGeneratedRowsLatestEnd(previousRows)
    const currentPhaseStart = getGeneratedRowsEarliestStart(currentRows)
    const releasePolicy = releasePolicyByPhaseId.get(currentPhaseId) ?? { mode: 'strict_finish_start', dependencyType: 'FS', lagDays: 0 }
    const phaseDependency = phaseReleasePolicyToDependency(releasePolicy)
    const predecessor = selectPhaseChainPredecessor(previousRows, phaseDependency.dependencyType)
    if (!predecessor) continue
    const successors = currentRows.filter((row) => (
      (!row.parentClientRowId || !currentRows.some((candidate) => candidate.clientRowId === row.parentClientRowId))
      && rowCanAnchorDependencyIntent(row)
    ))
    const dependencyTargets = successors.length > 0
      ? successors
      : [currentRows.find(rowCanAnchorDependencyIntent) ?? currentRows[0]].filter(Boolean) as GeneratedTemplateRow[]
    for (const successor of dependencyTargets) {
      addGeneratedDependency(successor, {
        clientRowId: predecessor.clientRowId,
        dependencyType: phaseDependency.dependencyType,
        lagDays: phaseDependency.lagDays,
        intentCode: `phase-chain:${previousPhaseId}->${currentPhaseId}`,
        relationRole: 'workflow',
        strength: releasePolicy.mode === 'strict_finish_start' ? 'recommended' : 'candidate',
        source: 'phase_chain',
      })
      const metadata = readRowMetadata(successor)
      successor.values = {
        ...successor.values,
        standard_task_metadata: {
          ...metadata,
          phaseChainDependency: {
            source: 'generated_phase_chain',
            previousPhaseId,
            currentPhaseId,
            predecessorClientRowId: predecessor.clientRowId,
            predecessorStableCode: readRowStableCode(predecessor),
            previousPhaseEnd,
            currentPhaseStart,
            releasePolicy,
            dependencyType: phaseDependency.dependencyType,
            lagDays: phaseDependency.lagDays,
          },
        },
      }
    }
  }
}



export function generatedDependencyPriorityForRow(row: GeneratedTemplateRow) {
  const categoryType = readRowCategoryType(row)
  if (categoryType === 'item_work') return 4
  if (categoryType === 'process') return 3
  if (categoryType === 'sub_division') return 2
  if (categoryType === 'division') return 1
  return 0
}



export function rebuildGeneratedDependencyNetwork(
  rows: GeneratedTemplateRow[],
  constructionCalendar?: ConstructionCalendarContext | null,
) {
  applyCrossItemWorkflowRules(rows)
  applyDependencyIntentTemplates(rows)
  pruneGeneratedHierarchySelfDependencies(rows)
  pruneGeneratedDependencyConflicts(rows)
  pruneGeneratedDependencyCycles(rows)
  applyGeneratedDependencySchedule(rows, constructionCalendar)
}



export function normalizeProcessConstraintPartialOverlapRatio(value: unknown) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return 0
  return Math.max(0, Math.min(0.9, parsed))
}



export function normalizeProcessConstraintStartAfterPercent(value: unknown, partialOverlapRatio: number) {
  return clampInteger(value, 0, 100, Math.round((1 - partialOverlapRatio) * 100))
}



export function buildProcessConstraintEffect(
  row: GeneratedTemplateRow,
  rule: GeneratedTemplateProcessConstraintRule,
): GeneratedTemplateProcessConstraintEffect {
  const partialOverlapRatio = normalizeProcessConstraintPartialOverlapRatio(rule.partialOverlapRatio)
  const startAfterPercent = normalizeProcessConstraintStartAfterPercent(rule.startAfterPercent, partialOverlapRatio)
  return {
    source: 'v1.4.7.4_process_constraint',
    sourceType: 'process_constraint',
    ruleCode: rule.stableCode,
    constraintType: rule.constraintType,
    applicationMode: rule.applicationMode,
    impactMode: rule.impactMode,
    runtimeActionPolicy: rule.runtimeActionPolicy,
    timeSourcePolicy: rule.timeSourcePolicy,
    relationInputPolicy: 'requires_existing_relation',
    dependencyCreationPolicy: 'never_create_dependency',
    durationDoubleCountPolicy: rule.durationDoubleCountPolicy,
    durationAuthorityPolicy: rule.durationAuthorityPolicy,
    partialOverlapRatio,
    startAfterPercent,
    scopeGranularity: rule.scopeGranularity || 'task',
    releaseQuantityPolicy: rule.releaseQuantityPolicy,
    minReleaseQuantityPercent: Number(rule.minReleaseQuantityPercent ?? 0) || 0,
    quantityEvidenceRequirement: rule.quantityEvidenceRequirement || 'not_applicable',
    quantityProxyRiskLevel: rule.quantityProxyRiskLevel || 'not_applicable',
    durationLookupKeys: [...(rule.durationLookupKeys ?? [])],
    carrierProcessHints: [...(rule.carrierProcessHints ?? [])],
    sourceStandard: rule.sourceStandard,
    sourceVersion: rule.sourceVersion,
    sourceClauseRef: rule.sourceClauseRef,
    confidence: rule.confidence,
    businessReason: `${row.values.title ?? readRowStableCode(row)} ?????? ${rule.sourceClauseRef || rule.stableCode}`,
  }
}



export function buildProcessConstraintRoutingCandidate(
  row: GeneratedTemplateRow,
  predecessor: GeneratedTemplateRow,
  dependency: GeneratedTemplateDependency,
  effect: GeneratedTemplateProcessConstraintEffect,
): GeneratedTemplateProcessConstraintRoutingCandidate | null {
  if (effect.applicationMode !== 'edge_overlap') return null
  if (effect.runtimeActionPolicy === 'confidence_only') return null
  const predecessorDurationDays = readGeneratedRowPlanDurationDays(predecessor)
  const proposedLagDays = Math.max(0, Math.round(predecessorDurationDays * effect.startAfterPercent / 100))
  return {
    source: effect.source,
    ruleCode: effect.ruleCode,
    applicationMode: effect.applicationMode,
    runtimeActionPolicy: effect.runtimeActionPolicy,
    mutationBoundary: 'candidate_only_existing_dependency_no_auto_mutation',
    dependencyCreationPolicy: effect.dependencyCreationPolicy,
    proposedDependencyType: 'SS',
    proposedLagDays,
    proposedStartAfterPercent: effect.startAfterPercent,
    proposedPartialOverlapRatio: effect.partialOverlapRatio,
    releaseQuantityPolicy: effect.releaseQuantityPolicy,
    minReleaseQuantityPercent: effect.minReleaseQuantityPercent,
    quantityEvidenceRequirement: effect.quantityEvidenceRequirement,
    quantityProxyRiskLevel: effect.quantityProxyRiskLevel,
    durationLookupKeys: [...effect.durationLookupKeys],
    carrierProcessHints: [...effect.carrierProcessHints],
    sourceStandard: effect.sourceStandard,
    sourceVersion: effect.sourceVersion,
    sourceClauseRef: effect.sourceClauseRef,
    confidence: effect.confidence,
    predecessorClientRowId: dependency.clientRowId,
    predecessorStableCode: readRowStableCode(predecessor) || null,
    predecessorDurationDays,
    successorClientRowId: row.clientRowId,
    successorStableCode: readRowStableCode(row) || null,
    successorDurationDays: readGeneratedRowPlanDurationDays(row),
    candidateBasis: 'existing_dependency_edge',
  }
}



export function processConstraintRoutingCandidateKey(candidate: GeneratedTemplateProcessConstraintRoutingCandidate) {
  return [
    candidate.predecessorClientRowId,
    candidate.successorClientRowId,
    candidate.ruleCode,
    candidate.applicationMode,
    candidate.proposedDependencyType,
    candidate.proposedLagDays,
  ].join('|')
}



export function routeProcessConstraintEffectsOntoExistingDependencies(
  row: GeneratedTemplateRow,
  effects: GeneratedTemplateProcessConstraintEffect[],
  rowById: Map<string, GeneratedTemplateRow>,
) {
  const routedKeys = new Set<string>()
  for (const dependency of row.predecessorDependencies) {
    const predecessor = rowById.get(dependency.clientRowId)
    if (!predecessor) continue
    const existingCandidates = dependency.processConstraintRoutingCandidates ?? []
    const existingKeys = new Set(existingCandidates.map(processConstraintRoutingCandidateKey))
    const nextCandidates = [...existingCandidates]
    for (const effect of effects) {
      const candidate = buildProcessConstraintRoutingCandidate(row, predecessor, dependency, effect)
      if (!candidate) continue
      const key = processConstraintRoutingCandidateKey(candidate)
      routedKeys.add(key)
      if (existingKeys.has(key)) continue
      existingKeys.add(key)
      nextCandidates.push(candidate)
    }
    if (nextCandidates.length > 0) {
      dependency.processConstraintRoutingCandidates = nextCandidates
    }
  }
  return routedKeys.size
}



export function applyProcessConstraintEffects(rows: GeneratedTemplateRow[]) {
  const rowById = new Map(rows.map((row) => [row.clientRowId, row]))
  for (const row of rows) {
    const metadata = readRowMetadata(row)
    const rules = readArray(metadata.processConstraintRules)
      .map((item) => readRecord(item) as GeneratedTemplateProcessConstraintRule)
      .filter((rule) => normalizeText(rule.stableCode))
    if (rules.length === 0) continue

    const effects = rules.map((rule) => buildProcessConstraintEffect(row, rule))
    const primary = effects[0]
    const edgeRoutingCandidateCount = routeProcessConstraintEffectsOntoExistingDependencies(row, effects, rowById)
    const existingDurationContext = readRecord(metadata.durationContext)
    row.values = {
      ...row.values,
      standard_task_metadata: {
        ...metadata,
        processConstraintEffect: primary,
        processConstraintEffects: effects,
        durationContext: {
          ...existingDurationContext,
          source: 'v1.4.7.4_process_constraint',
          processConstraintRuleCount: effects.length,
          processConstraintRules: effects.map((effect) => ({
            ruleCode: effect.ruleCode,
            constraintType: effect.constraintType,
            applicationMode: effect.applicationMode,
            impactMode: effect.impactMode,
            scopeGranularity: effect.scopeGranularity,
            runtimeActionPolicy: effect.runtimeActionPolicy,
            durationDoubleCountPolicy: effect.durationDoubleCountPolicy,
            partialOverlapRatio: effect.partialOverlapRatio,
            startAfterPercent: effect.startAfterPercent,
          })),
          processConstraintPolicy: {
            ...(readRecord(existingDurationContext.processConstraintPolicy)),
            createsDependency: false,
            requiresExistingRelation: true,
            routesExistingDependencies: edgeRoutingCandidateCount > 0,
            autoMutatesDependencies: false,
            edgeRoutingCandidateCount,
            userFacingFieldsAdded: false,
            durationDayAuthority: 'standard_work_duration_seed_or_project_fact',
          },
        },
      },
    }
  }
  return rows
}



export function applyGeneratedRowPlanRollups(rows: GeneratedTemplateRow[]) {
  applyWbsPlanRollupToRows(rows, {
    getId: (row) => row.clientRowId,
    getParentId: (row) => row.parentClientRowId,
    getNodeType: (row) => normalizeText(row.values.wbs_node_type ?? row.values.category_type),
    getPlannedStartDate: (row) => row.values.planned_start_date ?? row.values.start_date,
    getPlannedEndDate: (row) => row.values.planned_end_date ?? row.values.end_date,
    getReferenceDuration: (row) => readPlanReferenceDurationNumber(row.values.smart_reference_days),
    getDurationContributionMode: (row) => row.values.duration_contribution_mode ?? readRecord(row.values.standard_task_metadata).durationContributionMode,
    applyRollup: (row, rollup: WbsPlanRollupResult) => {
      const metadata = readRecord(row.values.standard_task_metadata)
      const protectedDurationBoundaryPolicy = normalizeParentDurationBoundaryPolicy(
        metadata.durationBoundaryPolicy
          ?? metadata.duration_boundary_policy
          ?? readRecord(row.values.duration_suggestion).parentDurationBoundaryPolicy,
      )
      const protectsParentWindow = isHardParentDurationBoundaryPolicy(protectedDurationBoundaryPolicy)
      const expandsParentPackageWindow = protectedDurationBoundaryPolicy === 'parent_package_window'
      const currentStart = normalizeDate(row.values.planned_start_date ?? row.values.start_date)
      const currentEnd = normalizeDate(row.values.planned_end_date ?? row.values.end_date)
      const expandedStart = expandsParentPackageWindow && currentStart
        && comparePlanDates(rollup.plannedStartDate, currentStart) < 0
        ? rollup.plannedStartDate
        : currentStart
      const expandedEnd = expandsParentPackageWindow && currentEnd
        && comparePlanDates(rollup.plannedEndDate, currentEnd) > 0
        ? rollup.plannedEndDate
        : currentEnd
      const parentWindowExpanded = expandsParentPackageWindow
        && Boolean(expandedStart && expandedEnd)
        && (expandedStart !== currentStart || expandedEnd !== currentEnd)
      const appliedStart = expandsParentPackageWindow
        ? expandedStart ?? rollup.plannedStartDate
        : protectsParentWindow ? row.values.planned_start_date : rollup.plannedStartDate
      const appliedEnd = expandsParentPackageWindow
        ? expandedEnd ?? rollup.plannedEndDate
        : protectsParentWindow ? row.values.planned_end_date : rollup.plannedEndDate
      const appliedDurationDays = daysInclusive(appliedStart, appliedEnd)
      row.values = {
        ...row.values,
        planned_start_date: appliedStart,
        planned_end_date: appliedEnd,
        start_date: appliedStart,
        end_date: appliedEnd,
        smart_reference_days: expandsParentPackageWindow
          ? Math.max(
              appliedDurationDays,
              readPlanReferenceDurationNumber(row.values.smart_reference_days) ?? 0,
              readPlanReferenceDurationNumber(rollup.referenceDurationDays) ?? 0,
            )
          : protectsParentWindow
          ? readPlanReferenceDurationNumber(row.values.smart_reference_days)
          : readPlanReferenceDurationNumber(rollup.referenceDurationDays),
        standard_task_metadata: {
          ...metadata,
          planRollup: {
            source: rollup.rollupSource,
            appliedToPlanWindow: !protectsParentWindow || parentWindowExpanded,
            protectedByDurationBoundaryPolicy: protectsParentWindow ? protectedDurationBoundaryPolicy : null,
            parentWindowApplicationPolicy: expandsParentPackageWindow ? 'minimum_window_expand_only' : null,
            parentWindowExpanded,
            plannedDurationDays: expandsParentPackageWindow ? appliedDurationDays : rollup.plannedDurationDays,
            referenceDurationDays: rollup.referenceDurationDays,
            referenceDurationPolicy: rollup.referenceDurationPolicy,
            childReferenceDurationTotal: rollup.childReferenceDurationTotal,
            childCount: rollup.childCount,
            diagnostics: rollup.diagnostics,
          },
        },
      }
      syncGeneratedRowDurationOutput(row)
    },
  })
}



export function generatedScheduleWindowSignature(rows: GeneratedTemplateRow[]) {
  return rows.map((row) => [
    row.clientRowId,
    readGeneratedRowPlanStart(row),
    readGeneratedRowPlanEnd(row),
  ].join(':')).join('|')
}



export function stabilizeGeneratedDependencyAndRollupSchedule(
  rows: GeneratedTemplateRow[],
  constructionCalendar?: ConstructionCalendarContext | null,
) {
  const warnings: GeneratedTemplateGovernanceWarning[] = []
  const maxPasses = 8
  for (let pass = 0; pass < maxPasses; pass += 1) {
    const before = generatedScheduleWindowSignature(rows)
    const warning = applyGeneratedDependencySchedule(rows, constructionCalendar)
    if (warning && !warnings.some((candidate) => candidate.code === warning.code)) warnings.push(warning)
    applyGeneratedRowPlanRollups(rows)
    const after = generatedScheduleWindowSignature(rows)
    if (after === before) return { converged: true, passCount: pass + 1, warnings }
  }
  warnings.push({
    code: 'DEPENDENCY_SCHEDULE_NON_CONVERGENT',
    severity: 'warning',
    nodeCode: 'GENERATED_DEPENDENCY_NETWORK',
    message: 'Generated dependencies and parent package rollups did not converge within the bounded schedule pass count.',
    details: { maxPasses },
  })
  return { converged: false, passCount: maxPasses, warnings }
}



export function restorePackageRhythmWindowRows(rows: GeneratedTemplateRow[]) {
  const rowById = new Map(rows.map((row) => [row.clientRowId, row]))
  for (const row of rows) {
    const metadata = readRowMetadata(row)
    if (metadata.scheduleAuthorityPolicy !== 'package_child_rhythm_window') continue
    const parent = row.parentClientRowId ? rowById.get(row.parentClientRowId) ?? null : null
    const parentStart = parent ? readGeneratedRowPlanStart(parent) : null
    const suggestion = readRecord(row.values.duration_suggestion)
    const startDay = readPositiveNumber(row.values.package_child_rhythm_window_start_day ?? suggestion.packageChildRhythmWindowStartDay)
    const endDay = readPositiveNumber(row.values.package_child_rhythm_window_end_day ?? suggestion.packageChildRhythmWindowEndDay)
    if (!parentStart || !startDay || !endDay) continue
    const start = addDays(parentStart, startDay - 1)
    const end = addDays(parentStart, Math.max(startDay, endDay) - 1)
    row.values = {
      ...row.values,
      planned_start_date: start,
      planned_end_date: end,
      start_date: start,
      end_date: end,
    }
  }
}



export function applyGeneratedRowTaskStructureGovernance(rows: GeneratedTemplateRow[]) {
  for (const row of rows) {
    const metadata = readRecord(row.values.standard_task_metadata)
    row.values = {
      ...row.values,
      standard_task_metadata: {
        ...metadata,
        taskStructureGovernance: buildWbsTaskStructureGovernanceMetadata({
          source: 'template_generate',
          rollupApplied: true,
          taskCodeFinalized: false,
          lineageExpected: true,
        }),
      },
    }
  }
}



export function buildConstructionOrganizationProjectionRows(
  rows: GeneratedTemplateRow[],
): ConstructionOrganizationGeneratedRowProjectionInputRow[] {
  return rows.map((row) => {
    const metadata = readRowMetadata(row)
    return {
      id: row.clientRowId,
      title: normalizeText(row.values.title ?? row.values.name),
      stableCode: readRowStableCode(row),
      executionPhase: normalizeText(row.executionPhase ?? row.values.execution_phase ?? metadata.executionPhase),
      rowProjectionMode: normalizeText(row.rowProjectionMode ?? row.values.row_projection_mode ?? metadata.rowProjectionMode),
      durationContributionMode: normalizeText(row.values.duration_contribution_mode ?? metadata.durationContributionMode),
      plannedStartDate: readGeneratedRowPlanStart(row),
      plannedEndDate: readGeneratedRowPlanEnd(row),
      smartReferenceDays: readPlanReferenceDurationNumber(row.values.smart_reference_days),
      durationSuggestion: row.durationSuggestion
        ?? readGeneratedDurationSuggestion(row.values.duration_suggestion)
        ?? readGeneratedDurationSuggestion(metadata.durationSuggestion),
    }
  })
}



export function applyConstructionOrganizationCandidateNetworkAlignment(
  rows: GeneratedTemplateRow[],
  projectedSelection: ConstructionOrganizationScenarioSelection,
) {
  const projection = projectedSelection.recommendedPlanOption?.evaluation?.generatedRowProjection
  const previewEdges = projection?.candidateDependencyPreview?.previewEdges
  if (!Array.isArray(previewEdges) || previewEdges.length === 0) return false

  const rowById = new Map(rows.map((row) => [row.clientRowId, row]))
  const childRowsByParentId = buildGeneratedRowsByParentId(rows)
  const requiredStartByRowId = new Map<string, string>()

  for (const edge of previewEdges) {
    const fromRows = edge.fromGeneratedRowIds
      .map((rowId) => rowById.get(rowId))
      .filter((row): row is GeneratedTemplateRow => Boolean(row))
    const toRows = edge.toGeneratedRowIds
      .map((rowId) => rowById.get(rowId))
      .filter((row): row is GeneratedTemplateRow => Boolean(row))
    if (fromRows.length === 0 || toRows.length === 0) continue

    const lagDays = Number.isFinite(Number(edge.lagDays)) ? Math.round(Number(edge.lagDays)) : 0
    const requiredStart = edge.dependencyType === 'SS'
      ? (() => {
          const fromStart = getGeneratedRowsEarliestStart(fromRows)
          return fromStart ? addDays(fromStart, lagDays) : null
        })()
      : (() => {
          const fromEnd = getGeneratedRowsLatestEnd(fromRows)
          return fromEnd ? addDays(fromEnd, lagDays) : null
        })()
    if (!requiredStart) continue

    for (const toRow of toRows) {
      const existing = requiredStartByRowId.get(toRow.clientRowId)
      if (!existing || comparePlanDates(requiredStart, existing) > 0) {
        requiredStartByRowId.set(toRow.clientRowId, requiredStart)
      }
    }
  }

  let adjusted = false

  for (const [rowId, targetStart] of requiredStartByRowId.entries()) {
    const row = rowById.get(rowId)
    if (!row) continue
    const currentStart = readGeneratedRowPlanStart(row)
    if (!currentStart) continue
    const shiftDays = signedDurationDayDelta(currentStart, targetStart) ?? 0
    if (shiftDays <= 0) continue

    shiftGeneratedRowAndDescendants(row, shiftDays, childRowsByParentId)
    const metadata = readRowMetadata(row)
    row.values = {
      ...row.values,
      standard_task_metadata: {
        ...metadata,
        constructionOrganizationScheduleAlignment: {
          source: 'construction_organization_candidate_network_alignment',
          scenarioSourceVersion: projectedSelection.sourceVersion,
          optionId: projectedSelection.recommendedPlanOption.optionId,
          generatedRowId: row.clientRowId,
          previousStartDate: currentStart,
          targetStartDate: targetStart,
          shiftDays,
          policy: 'delay_generated_row_to_recommended_candidate_network',
          writesTaskDependencies: false,
          writesCriticalPathFacts: false,
        },
      },
    }
    adjusted = true
  }

  return adjusted
}



export function attachConstructionOrganizationGeneratedRowProjection(
  rows: GeneratedTemplateRow[],
  options: { alignCandidateNetworkDates?: boolean } = {},
) {
  let projectedSelection: unknown = null
  const alignCandidateNetworkDates = options.alignCandidateNetworkDates !== false

  for (const row of rows) {
    const metadata = readRowMetadata(row)
    const projectOrganization = readRecord(metadata.projectOrganization)
    const scenarioSelection = readRecord(projectOrganization.scenarioSelection)
    if (scenarioSelection.source !== 'construction_organization_scenario_selector') continue

    if (!projectedSelection) {
      if (alignCandidateNetworkDates) {
        const maxAlignmentPasses = Math.max(4, rows.length)
        for (let pass = 0; pass < maxAlignmentPasses; pass += 1) {
          projectedSelection = projectConstructionOrganizationSelectionToGeneratedRows(
            scenarioSelection as unknown as ConstructionOrganizationScenarioSelection,
            buildConstructionOrganizationProjectionRows(rows),
          )
          const adjusted = applyConstructionOrganizationCandidateNetworkAlignment(
            rows,
            projectedSelection as ConstructionOrganizationScenarioSelection,
          )
          if (!adjusted) break
        }
        applyGeneratedRowPlanRollups(rows)
        projectedSelection = projectConstructionOrganizationSelectionToGeneratedRows(
          scenarioSelection as unknown as ConstructionOrganizationScenarioSelection,
          buildConstructionOrganizationProjectionRows(rows),
        )
      } else {
        projectedSelection = projectConstructionOrganizationSelectionToGeneratedRows(
          scenarioSelection as unknown as ConstructionOrganizationScenarioSelection,
          buildConstructionOrganizationProjectionRows(rows),
        )
      }
    }
    row.values = {
      ...row.values,
      standard_task_metadata: {
        ...metadata,
        projectOrganization: {
          ...projectOrganization,
          scenarioSelection: projectedSelection,
        },
      },
    }
  }
}



export function readCandidateNetworkEvaluationFromRow(
  row: GeneratedTemplateRow,
): GeneratedCandidateNetworkEvaluation | null {
  const metadata = readRowMetadata(row)
  const projectOrganization = readRecord(metadata.projectOrganization)
  const scenarioSelection = readRecord(projectOrganization.scenarioSelection)
  const recommendedPlanOption = readRecord(scenarioSelection.recommendedPlanOption)
  const evaluation = readRecord(recommendedPlanOption.evaluation)
  const generatedRowProjection = readRecord(evaluation.generatedRowProjection)
  const networkEvaluation = readRecord(generatedRowProjection.generatedRowNetworkEvaluation)
  if (
    normalizeText(networkEvaluation.source) !== 'generated_wbs_row_candidate_network_cpm'
    || normalizeText(networkEvaluation.networkBasis) !== 'generated_wbs_rows_and_candidate_dependency_preview_edges'
  ) {
    return null
  }
  return networkEvaluation as unknown as GeneratedCandidateNetworkEvaluation
}



export function buildCandidateCriticalRowSummaries(params: {
  rows: GeneratedTemplateRow[]
  rowSchedule: GeneratedCandidateNetworkEvaluation['rowSchedule']
  projectStart: string | null
}) {
  if (!params.projectStart) return []
  const rowById = new Map(params.rows.map((row) => [row.clientRowId, row]))
  return params.rowSchedule
    .filter((node) => node.isCritical || node.totalFloatDays <= 0)
    .map((node) => {
      const row = rowById.get(node.generatedRowId)
      if (!row) return null
      const startDay = Math.max(0, Math.round(Number(node.startDay) || 0))
      const finishDay = Math.max(startDay + 1, Math.round(Number(node.finishDay) || startDay + Math.max(1, Number(node.durationDays) || 1)))
      const durationDays = Math.max(1, Math.round(Number(node.durationDays) || (finishDay - startDay)))
      return {
        generatedRowId: node.generatedRowId,
        title: readGeneratedRowTitle(row),
        plannedStartDate: addDays(params.projectStart!, startDay),
        plannedEndDate: addDays(params.projectStart!, Math.max(startDay, finishDay - 1)),
        startDay,
        finishDay,
        durationDays,
        totalFloatDays: Math.max(0, Math.round(Number(node.totalFloatDays) || 0)),
      }
    })
    .filter((summary): summary is NonNullable<typeof summary> => Boolean(summary))
}



export function withCandidateCriticalRowSummaries(
  rows: GeneratedTemplateRow[],
  evaluation: GeneratedCandidateNetworkEvaluation,
): GeneratedCandidateNetworkEvaluation {
  const existing = (evaluation as unknown as { criticalRowSummaries?: unknown }).criticalRowSummaries
  if (Array.isArray(existing) && existing.length > 0) return evaluation
  const starts = rows
    .filter((row) => getRowProjectionMode(row) === 'schedule_row' && row.scheduleParticipation !== 'reference_only')
    .map(readGeneratedRowPlanStart)
    .filter((date): date is string => Boolean(date))
    .sort(comparePlanDates)
  const projectStart = starts[0] ?? null
  return {
    ...evaluation,
    criticalRowSummaries: buildCandidateCriticalRowSummaries({
      rows,
      rowSchedule: evaluation.rowSchedule,
      projectStart,
    }),
  }
}



export function isValidProcessConstraintRoutingCandidateForPreview(
  candidate: GeneratedTemplateProcessConstraintRoutingCandidate,
) {
  if (candidate.source !== 'v1.4.7.4_process_constraint') return false
  if (candidate.mutationBoundary !== 'candidate_only_existing_dependency_no_auto_mutation') return false
  if (candidate.dependencyCreationPolicy !== 'never_create_dependency') return false
  if (!['FS', 'SS', 'FF', 'SF'].includes(candidate.proposedDependencyType)) return false
  return Number.isFinite(Number(candidate.proposedLagDays))
}



export function calculatePreviewRequiredStartOffset(
  dependencyType: GeneratedTemplateDependency['dependencyType'],
  lagDays: number,
  predecessorDurationDays: number,
  successorDurationDays: number,
) {
  if (dependencyType === 'SS') return lagDays
  if (dependencyType === 'FF') return predecessorDurationDays + lagDays - successorDurationDays
  if (dependencyType === 'SF') return lagDays - successorDurationDays
  return predecessorDurationDays + lagDays
}



export function selectProcessConstraintRoutingCandidateForPreview(
  row: GeneratedTemplateRow,
  predecessor: GeneratedTemplateRow,
  dependency: GeneratedTemplateDependency,
): GeneratedTemplateProcessConstraintRoutingCandidate | null {
  const candidates = (dependency.processConstraintRoutingCandidates ?? [])
    .filter(isValidProcessConstraintRoutingCandidateForPreview)
  if (candidates.length === 0) return null
  const predecessorDurationDays = readGeneratedRowPlanDurationDays(predecessor)
  const successorDurationDays = readGeneratedRowPlanDurationDays(row)
  return candidates
    .map((candidate) => ({
      candidate,
      requiredStartOffset: calculatePreviewRequiredStartOffset(
        candidate.proposedDependencyType,
        Math.round(Number(candidate.proposedLagDays)),
        predecessorDurationDays,
        successorDurationDays,
      ),
    }))
    .sort((left, right) => (
      right.requiredStartOffset - left.requiredStartOffset
      || right.candidate.proposedLagDays - left.candidate.proposedLagDays
      || right.candidate.ruleCode.localeCompare(left.candidate.ruleCode)
    ))[0]?.candidate ?? null
}



export function buildCandidateNetworkEvaluationFromGeneratedDependencies(
  rows: GeneratedTemplateRow[],
): GeneratedCandidateNetworkEvaluation | null {
  const scheduleRows = rows.filter((row) => (
    getRowProjectionMode(row) === 'schedule_row'
    && row.scheduleParticipation !== 'reference_only'
    && !isGeneratedRecordOnlyWbsSummaryRow(row)
  ))
  if (scheduleRows.length === 0) return null

  const rowById = new Map(scheduleRows.map((row) => [row.clientRowId, row]))
  const starts = scheduleRows
    .map(readGeneratedRowPlanStart)
    .filter((date): date is string => Boolean(date))
    .sort(comparePlanDates)
  const projectStart = starts[0] ?? null
  if (!projectStart) return null

  const nodes = scheduleRows.map((row) => {
    const start = readGeneratedRowPlanStart(row) ?? projectStart
    const startDay = Math.max(0, signedDurationDayDelta(projectStart, start) ?? 0)
    const durationDays = readGeneratedRowPlanDurationDays(row)
    return {
      generatedRowId: row.clientRowId,
      startDay,
      finishDay: startDay + durationDays,
      durationDays,
      totalFloatDays: 0,
      isCritical: true,
    }
  })
  const nodeById = new Map(nodes.map((node) => [node.generatedRowId, node]))
  const previewEdges = scheduleRows.flatMap((row) => row.predecessorDependencies
    .filter((dependency) => rowById.has(dependency.clientRowId))
    .map((dependency) => {
      const predecessor = rowById.get(dependency.clientRowId)
      const processConstraintCandidate = predecessor
        ? selectProcessConstraintRoutingCandidateForPreview(row, predecessor, dependency)
        : null
      return {
        fromGeneratedRowId: dependency.clientRowId,
        toGeneratedRowId: row.clientRowId,
        dependencyType: processConstraintCandidate?.proposedDependencyType ?? dependency.dependencyType,
        lagDays: processConstraintCandidate
          ? Math.round(processConstraintCandidate.proposedLagDays)
          : Number.isFinite(Number(dependency.lagDays)) ? Math.round(Number(dependency.lagDays)) : 0,
        processConstraintRoutingCandidate: processConstraintCandidate
          ? {
              ruleCode: processConstraintCandidate.ruleCode,
              originalDependencyType: dependency.dependencyType,
              originalLagDays: Number.isFinite(Number(dependency.lagDays)) ? Math.round(Number(dependency.lagDays)) : 0,
              mutationBoundary: processConstraintCandidate.mutationBoundary,
            }
          : null,
      }
    }))
  if (previewEdges.length === 0) return null
  const processConstraintRoutingEdges = previewEdges.filter((edge) => edge.processConstraintRoutingCandidate)
  const processConstraintRoutingRuleCodes = Array.from(new Set(
    processConstraintRoutingEdges
      .map((edge) => edge.processConstraintRoutingCandidate?.ruleCode)
      .filter((code): code is string => Boolean(code)),
  ))

  const controllingPathPredecessor = new Map<string, string>()
  const controllingPathDistance = new Map(nodes.map((node) => [node.generatedRowId, Number.NEGATIVE_INFINITY]))
  const controllingPathOutgoing = new Map(nodes.map((node) => [node.generatedRowId, [] as typeof previewEdges]))
  const controllingPathIndegree = new Map(nodes.map((node) => [node.generatedRowId, 0]))
  for (const edge of previewEdges) {
    controllingPathOutgoing.get(edge.fromGeneratedRowId)?.push(edge)
    controllingPathIndegree.set(
      edge.toGeneratedRowId,
      (controllingPathIndegree.get(edge.toGeneratedRowId) ?? 0) + 1,
    )
  }
  for (const node of nodes) {
    if ((controllingPathIndegree.get(node.generatedRowId) ?? 0) === 0) {
      controllingPathDistance.set(node.generatedRowId, 0)
    }
  }
  const controllingPathQueue = nodes
    .filter((node) => (controllingPathIndegree.get(node.generatedRowId) ?? 0) === 0)
    .sort((left, right) => left.startDay - right.startDay || left.generatedRowId.localeCompare(right.generatedRowId))
    .map((node) => node.generatedRowId)
  const controllingPathTopologicalOrder: string[] = []
  while (controllingPathQueue.length > 0) {
    const currentId = controllingPathQueue.shift()!
    controllingPathTopologicalOrder.push(currentId)
    for (const edge of controllingPathOutgoing.get(currentId) ?? []) {
      const from = nodeById.get(edge.fromGeneratedRowId)
      const to = nodeById.get(edge.toGeneratedRowId)
      if (from && to) {
        const requiredStartOffset = edge.dependencyType === 'SS'
          ? edge.lagDays
          : edge.dependencyType === 'FF'
            ? from.durationDays + edge.lagDays - to.durationDays
            : edge.dependencyType === 'SF'
              ? edge.lagDays - to.durationDays
              : from.durationDays + edge.lagDays
        const candidateDistance = (controllingPathDistance.get(from.generatedRowId) ?? 0) + requiredStartOffset
        const currentDistance = controllingPathDistance.get(to.generatedRowId) ?? Number.NEGATIVE_INFINITY
        if (candidateDistance > currentDistance) {
          controllingPathDistance.set(to.generatedRowId, candidateDistance)
          controllingPathPredecessor.set(to.generatedRowId, from.generatedRowId)
        }
      }
      const nextIndegree = (controllingPathIndegree.get(edge.toGeneratedRowId) ?? 0) - 1
      controllingPathIndegree.set(edge.toGeneratedRowId, nextIndegree)
      if (nextIndegree === 0) controllingPathQueue.push(edge.toGeneratedRowId)
    }
  }
  const controllingPathIds = new Set<string>()
  if (controllingPathTopologicalOrder.length === nodes.length) {
    const terminalNode = nodes
      .filter((node) => (controllingPathOutgoing.get(node.generatedRowId) ?? []).length === 0)
      .sort((left, right) => (
        ((controllingPathDistance.get(right.generatedRowId) ?? 0) + right.durationDays)
          - ((controllingPathDistance.get(left.generatedRowId) ?? 0) + left.durationDays)
        || right.finishDay - left.finishDay
        || left.generatedRowId.localeCompare(right.generatedRowId)
      ))[0]
    let currentId = terminalNode?.generatedRowId ?? null
    while (currentId && !controllingPathIds.has(currentId)) {
      controllingPathIds.add(currentId)
      currentId = controllingPathPredecessor.get(currentId) ?? null
    }
  }

  const earliestStart = new Map(nodes.map((node) => [node.generatedRowId, node.startDay]))
  for (let pass = 0; pass < Math.max(1, nodes.length); pass += 1) {
    let changed = false
    for (const edge of previewEdges) {
      const from = nodeById.get(edge.fromGeneratedRowId)
      const to = nodeById.get(edge.toGeneratedRowId)
      if (!from || !to) continue
      const fromStart = earliestStart.get(from.generatedRowId) ?? from.startDay
      const currentToStart = earliestStart.get(to.generatedRowId) ?? to.startDay
      const requiredStart = edge.dependencyType === 'SS'
        ? fromStart + edge.lagDays
        : edge.dependencyType === 'FF'
          ? fromStart + from.durationDays + edge.lagDays - to.durationDays
          : edge.dependencyType === 'SF'
            ? fromStart + edge.lagDays - to.durationDays
            : fromStart + from.durationDays + edge.lagDays
      if (requiredStart > currentToStart) {
        earliestStart.set(to.generatedRowId, requiredStart)
        changed = true
      }
    }
    if (!changed) break
  }

  const projectedNetworkSpanDays = Math.max(
    1,
    ...nodes.map((node) => (earliestStart.get(node.generatedRowId) ?? node.startDay) + node.durationDays),
  ) - Math.min(...nodes.map((node) => node.startDay))
  const latestStart = new Map(nodes.map((node) => [
    node.generatedRowId,
    Math.max(0, projectedNetworkSpanDays - node.durationDays),
  ]))
  for (let pass = 0; pass < Math.max(1, nodes.length); pass += 1) {
    let changed = false
    for (const edge of [...previewEdges].reverse()) {
      const from = nodeById.get(edge.fromGeneratedRowId)
      const to = nodeById.get(edge.toGeneratedRowId)
      if (!from || !to) continue
      const toLatestStart = latestStart.get(to.generatedRowId) ?? to.startDay
      const currentFromLatestStart = latestStart.get(from.generatedRowId) ?? from.startDay
      const requiredLatestStart = edge.dependencyType === 'SS'
        ? toLatestStart - edge.lagDays
        : edge.dependencyType === 'FF'
          ? toLatestStart + to.durationDays - from.durationDays - edge.lagDays
          : edge.dependencyType === 'SF'
            ? toLatestStart + to.durationDays - edge.lagDays
            : toLatestStart - from.durationDays - edge.lagDays
      if (requiredLatestStart < currentFromLatestStart) {
        latestStart.set(from.generatedRowId, requiredLatestStart)
        changed = true
      }
    }
    if (!changed) break
  }

  const rowSchedule = nodes
    .map((node) => {
      const startDay = Math.max(0, Math.round(earliestStart.get(node.generatedRowId) ?? node.startDay))
      const finishDay = startDay + node.durationDays
      const calculatedTotalFloatDays = Math.max(0, Math.round(
        (latestStart.get(node.generatedRowId) ?? startDay) - startDay,
      ))
      const isControllingPath = controllingPathIds.has(node.generatedRowId)
      const totalFloatDays = isControllingPath ? 0 : calculatedTotalFloatDays
      return {
        ...node,
        startDay,
        finishDay,
        totalFloatDays,
        isCritical: isControllingPath || totalFloatDays <= 0,
      }
    })
    .sort((left, right) => left.startDay - right.startDay || left.finishDay - right.finishDay || left.generatedRowId.localeCompare(right.generatedRowId))

  return {
    source: 'generated_wbs_row_candidate_network_cpm',
    networkBasis: 'generated_wbs_rows_and_candidate_dependency_preview_edges',
    projectedNetworkSpanDays,
    previewEdgeCount: previewEdges.length,
    processConstraintRoutingCandidateEdgeCount: processConstraintRoutingEdges.length,
    processConstraintRoutingRuleCodes,
    unresolvedEdgeCount: 0,
    criticalGeneratedRowIds: rowSchedule.filter((node) => node.isCritical).map((node) => node.generatedRowId),
    criticalRowSummaries: buildCandidateCriticalRowSummaries({
      rows: scheduleRows,
      rowSchedule,
      projectStart,
    }),
    materializationStatus: 'fully_mapped_read_only',
    rowSchedule,
    writesTaskDependencies: false,
    writesPlanDates: false,
    writesCriticalPathFacts: false,
  }
}



export function buildCandidateNetworkEvaluationForGeneratedRows(
  rows: GeneratedTemplateRow[],
): GeneratedCandidateNetworkEvaluation | null {
  for (const row of rows) {
    const networkEvaluation = readCandidateNetworkEvaluationFromRow(row)
    if (networkEvaluation) return withCandidateCriticalRowSummaries(rows, networkEvaluation)
  }
  return buildCandidateNetworkEvaluationFromGeneratedDependencies(rows)
}



export function resolveStartingLineCurrentPhase(substage: unknown) {
  const text = normalizeText(substage).toLowerCase()
  if (!text) return null
  if (text.includes('foundation') || text.includes('pile') || text.includes('桩') || text.includes('基础')) return 'foundation_pit_pile'
  if (text.includes('basement') || text.includes('地下室')) return 'basement_structure'
  if (text.includes('main_structure') || text.includes('superstructure') || text.includes('structure') || text.includes('主体') || text.includes('结构')) return 'superstructure_rhythm'
  if (text.includes('mep') || text.includes('rough') || text.includes('electrical') || text.includes('hvac') || text.includes('plumbing') || text.includes('机电')) return 'mep_roughin'
  if (text.includes('facade') || text.includes('envelope') || text.includes('roof') || text.includes('幕墙') || text.includes('屋面')) return 'envelope_roof_facade'
  if (text.includes('fitout') || text.includes('interior') || text.includes('decoration') || text.includes('装修') || text.includes('精装')) return 'interior_fitout_terminal'
  if (text.includes('outdoor') || text.includes('municipal') || text.includes('landscape') || text.includes('室外') || text.includes('市政') || text.includes('景观')) return 'outdoor_municipal_landscape'
  if (text.includes('commission') || text.includes('debug') || text.includes('调试') || text.includes('试运行')) return 'commissioning'
  if (text.includes('acceptance') || text.includes('handover') || text.includes('验收') || text.includes('移交')) return 'acceptance_handover'
  return null
}



export function classifyStartingLineRow(row: GeneratedTemplateRow, currentPhase: string | null): 'history' | 'in_progress' | 'future' {
  if (!currentPhase) return 'future'
  const phase = getGeneratedRowExecutionPhase(row)
  const currentOrder = EXECUTION_PHASE_ORDER[currentPhase]
  const phaseOrder = EXECUTION_PHASE_ORDER[phase]
  if (currentOrder == null || phaseOrder == null) return 'future'
  if (phaseOrder < currentOrder) return 'history'
  if (phaseOrder === currentOrder) return 'in_progress'
  return 'future'
}



export function applyStartingLineOnboardingClassification(params: {
  rows: GeneratedTemplateRow[]
  onboardingSubstage?: string | null
  projectFacts?: Record<string, unknown> | null
}) {
  const onboardingSubstage = normalizeText(
    params.onboardingSubstage
      ?? params.projectFacts?.onboardingSubstage
      ?? params.projectFacts?.onboarding_substage,
  )
  if (!onboardingSubstage) return
  const currentPhase = resolveStartingLineCurrentPhase(onboardingSubstage)

  for (const row of params.rows) {
    const classification = classifyStartingLineRow(row, currentPhase)
    const isHistorical = classification === 'history'
    const metadata = readRowMetadata(row)
    row.values = {
      ...row.values,
      onboarding_stage_classification: classification,
      onboarding_substage: onboardingSubstage,
      is_historical: isHistorical,
      standard_task_metadata: {
        ...metadata,
        onboardingStageClassification: classification,
        onboarding_stage_classification: classification,
        onboardingSubstage,
        onboarding_substage: onboardingSubstage,
        is_historical: isHistorical,
      },
    }
  }
}



export function sanitizeGeneratedRowValuesForCreate(values: Record<string, unknown>) {
  const sanitized = { ...values }
  for (const field of TEMPLATE_GENERATION_FORBIDDEN_TASK_CODE_FIELDS) {
    delete sanitized[field]
  }
  const durationSuggestion = readGeneratedDurationSuggestion(sanitized.duration_suggestion)
  const durationContributionMode = normalizeDurationContributionMode(
    sanitized.duration_contribution_mode ?? readRecord(sanitized.standard_task_metadata).durationContributionMode,
  )
  if (isDurationBearingContributionMode(durationContributionMode) && !durationSuggestion) {
    const metadata = readRecord(sanitized.standard_task_metadata)
    sanitized.smart_reference_days = null
    sanitized.duration_suggestion = null
    sanitized.standard_task_metadata = {
      ...metadata,
      durationSuggestion: null,
    }
  }
  if (durationSuggestion && isDurationBearingContributionMode(durationContributionMode)) {
    const writablePlanTaskDurationDays = readWritablePlanTaskDurationDays(durationSuggestion)
    if (writablePlanTaskDurationDays == null) {
      const guardedSuggestion = withPlanReferenceDurationOutput(durationSuggestion) ?? durationSuggestion
      sanitized.smart_reference_days = null
      sanitized.duration_suggestion = buildGeneratedDurationSuggestionValue(
        guardedSuggestion,
        durationContributionMode,
      )
      const metadata = readRecord(sanitized.standard_task_metadata)
      sanitized.standard_task_metadata = {
        ...metadata,
        durationSuggestion: sanitized.duration_suggestion,
      }
    } else {
      sanitized.smart_reference_days = writablePlanTaskDurationDays
      sanitized.duration_suggestion = buildGeneratedDurationSuggestionValue(
        durationSuggestion,
        durationContributionMode,
      )
      const metadata = readRecord(sanitized.standard_task_metadata)
      sanitized.standard_task_metadata = {
        ...metadata,
        durationSuggestion: sanitized.duration_suggestion,
      }
    }
  }
  return sanitized
}



export function sanitizeGeneratedTemplateRowForPublicOutput(row: GeneratedTemplateRow): GeneratedTemplateRow {
  const durationContributionMode = normalizeDurationContributionMode(
    row.values.duration_contribution_mode
      ?? readRecord(row.values.standard_task_metadata).durationContributionMode,
  )
  const sourceSuggestion = row.durationSuggestion
    ?? readGeneratedDurationSuggestion(row.values.duration_suggestion)
  const publicSuggestion = buildGeneratedDurationSuggestionValue(sourceSuggestion, durationContributionMode)
  const metadata = readRecord(row.values.standard_task_metadata)
  const smartReferenceDays = readPlanReferenceDurationNumber(row.values.smart_reference_days)
  const values = {
    ...row.values,
    smart_reference_days: smartReferenceDays,
    duration_suggestion: publicSuggestion,
    standard_task_metadata: {
      ...metadata,
      durationSuggestion: publicSuggestion,
    },
  }
  return {
    ...row,
    values,
    durationSuggestion: publicSuggestion as unknown as GeneratedTemplateDurationSuggestion | null,
  }
}



export function sanitizeGeneratedTemplateRowsForPublicOutput(rows: GeneratedTemplateRow[]) {
  return rows.map(sanitizeGeneratedTemplateRowForPublicOutput)
}
