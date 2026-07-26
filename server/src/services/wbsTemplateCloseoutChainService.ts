import { signedDurationDayDelta } from '../utils/durationDays.js'
import {
evaluateDurationOutputWrite
} from './durationOutputGovernanceService.js'
import {
T2_DIVISION_RHYTHM_TEMPLATE_SEED
} from '../seeds/t2DivisionRhythmTemplateSeed.js'
import type { PlanningTableOperation } from '../types/planningTable.js'
import {
addPlanDays as addDays
} from './wbsPlanRollupService.js'
import {
effectiveConstructionCalendarBasis,
effectiveConstructionCalendarWindowCount,
isAuthoritativeConstructionCalendar,type ConstructionCalendarContext
} from './constructionCalendar.js'
import {
type AlgorithmSeedResolveContext
} from './algorithmSeedResolver.js'
import {
evaluateExecutableDefaultMasterPlanRowVolumeReadiness,resolveExecutableDefaultMasterPlanMinimum,
type ExecutableDefaultMasterPlanAssemblySummary
} from './defaultMasterPlanExecutableAssemblyService.js'

import {
addTemplateProductionDays,
buildDurationOutputContractSummary,
normalizeText,
readArray,
readNumberFromSources,
readOptionalNumber,
readRecord,
readStringArray,
uniqueStringArray,
} from './wbsTemplateGenerationFoundation.js'
import type {
GeneratedMasterPlanProfile,
GeneratedTemplateDependency,
GeneratedTemplateDurationSuggestion,
GeneratedTemplateRow,
ProjectOrganizationStrategy,
WbsTemplateScope,
} from './wbsTemplateGenerationFoundation.js'
import {
deriveProjectOrganizationStrategy,
} from './wbsTemplateDurationAssemblyService.js'
import {
EXECUTION_PHASE_ORDER,
buildGeneratedDurationSuggestionValue,
inferProgressMode,
syncGeneratedRowDurationOutput,
} from './wbsTemplateOutputProjectionService.js'
import {
applyGeneratedRowPlanRollups,
applyGeneratedRowTaskStructureGovernance,
clampInteger,
comparePlanDates,
getGeneratedRowExecutionPhase,
getRowProjectionMode,
readGeneratedRowPlanEnd,
readGeneratedRowPlanStart,
readRowMetadata,
readRowStableCode,
} from './wbsTemplateDependencyCandidateService.js'
import {
ASSET_BACKED_DEFAULT_MASTER_PLAN_SOURCE,
ASSET_BACKED_MASTER_PLAN_DURATION_CALIBRATION_SOURCE,
ASSET_BACKED_MASTER_PLAN_GENERATION_SOURCE,
ASSET_BACKED_MASTER_PLAN_SOURCE_VERSION,
ASSET_BACKED_MASTER_PLAN_TRUTH_SOURCE,
BUSINESS_TYPE_BASE_MASTER_PLAN_ACTIVITIES,
BUSINESS_TYPE_SPECIALTY_DURATION_ASSETS,
DEFAULT_MASTER_PLAN_PHASE_DURATION_ASSETS,
FOUNDATION_SUPPORT_METHOD_OPTIONS,
PILE_FOUNDATION_METHOD_OPTIONS,
PROJECT_ORGANIZATION_VARIANT_T2_TEMPLATE_IDS,
REAL_PLAN_SKELETON_SOURCE_IDS,
RESIDENTIAL_DEFAULT_MASTER_PLAN_ENTRY_TEMPLATE_CODE,
RESIDENTIAL_MASTER_PLAN_PRELOAD_DURATION_SEED_CODES,
RESIDENTIAL_T2_RHYTHM_TEMPLATE_IDS,
buildAssetBackedBusinessTypeMasterPlanActivity,
buildAssetDurationCalculation,
buildDefaultMasterPlanDependencyRuleEvidence,
buildDefaultMasterPlanDurationRiskRange,
buildDefaultMasterPlanSeedResolveContext,
buildResidentialDurationAssetMapping,
buildStandardDurationSeedLookup,
buildT2RhythmTemplateLookup,
calculateAssetBackedMasterPlanDuration,
calculateDefaultMasterPlanProcessSeasonalDurationAdjustment,
calculateDurationByProductivity,
calculateDurationByStandardSeedFloor,
calculateRuntimeReferenceDayDuration,
fillStandardDurationSeedLookup,
fillT2RhythmTemplateLookup,
fillT2RhythmTemplateLookupForBusinessType,
findRuntimeReferenceDayForActivity,
findT2RhythmTemplate,
phaseWindowMatchesExecutionPhase,
readDefaultMasterPlanRuntimeReferenceDaysInput,
readP50DaysFromStandardSeed,
readP50DaysFromT2Template,
readP50Productivity,
readResidentialMethodVariantCodes,
resolveDefaultMasterPlanCrossItemWorkflowAsset,
resolveProjectOrganizationPolicyFromProjectFacts,
selectResidentialMethodOption,
} from './wbsTemplateAssetStrategyService.js'
import type {
BusinessTypeMasterPlanActivity,
DefaultMasterPlanRuntimeReferenceDaysInput,
ResidentialMasterPlanActivity,
StandardDurationSeedLookup,
T2RhythmTemplateLookup,
} from './wbsTemplateAssetStrategyService.js'



export type ResidentialMasterPlanOrganizationContext = {
  strategy: ProjectOrganizationStrategy
  baseScope: WbsTemplateScope
  sharedScope: WbsTemplateScope | null
  buildingScopeByNumber: Map<number, WbsTemplateScope>
}



export function buildResidentialMasterPlanOrganizationContext(params: {
  operation: PlanningTableOperation
  projectFacts: Record<string, unknown>
  scopeCombos: WbsTemplateScope[]
}): ResidentialMasterPlanOrganizationContext | null {
  const operationScope = readRecord(params.operation.scope)
  const baseScope = {
    ...operationScope,
    scope_expansion_mode: normalizeText(
      operationScope.scope_expansion_mode
        ?? operationScope.scopeExpansionMode,
    ) || 'project',
    business_type: normalizeText(
      operationScope.business_type
        ?? operationScope.businessType
        ?? params.projectFacts.businessType
        ?? params.projectFacts.business_type,
    ),
    business_subtype: normalizeText(
      operationScope.business_subtype
        ?? operationScope.businessSubtype
        ?? params.projectFacts.businessSubtype
        ?? params.projectFacts.business_subtype,
    ),
    project_type_code: normalizeText(
      operationScope.project_type_code
        ?? operationScope.projectTypeCode
        ?? params.projectFacts.projectTypeCode
        ?? params.projectFacts.project_type_code,
    ),
    structure_type_code: normalizeText(
      operationScope.structure_type_code
        ?? operationScope.structureTypeCode
        ?? params.projectFacts.structureTypeCode
        ?? params.projectFacts.structure_type_code,
    ),
    building_count: readOptionalNumber(
      operationScope.building_count
        ?? operationScope.buildingCount
        ?? params.projectFacts.buildingCount
        ?? params.projectFacts.building_count,
    ),
    total_area_m2: readOptionalNumber(
      operationScope.total_area_m2
        ?? operationScope.totalAreaM2
        ?? params.projectFacts.totalAreaM2
        ?? params.projectFacts.total_area_m2,
    ),
    standard_floor_count: readOptionalNumber(
      operationScope.standard_floor_count
        ?? operationScope.standardFloorCount
        ?? params.projectFacts.standardFloorCount
        ?? params.projectFacts.standard_floor_count,
    ),
    highest_building_floor_count: readOptionalNumber(
      operationScope.highest_building_floor_count
        ?? operationScope.highestBuildingFloorCount
        ?? params.projectFacts.highestBuildingFloorCount
        ?? params.projectFacts.highest_building_floor_count,
    ),
    basement_level_count: readOptionalNumber(
      operationScope.basement_level_count
        ?? operationScope.basementLevelCount
        ?? params.projectFacts.basementLevelCount
        ?? params.projectFacts.basement_level_count,
    ),
    project_features: {
      ...readRecord(params.projectFacts.projectFeatures ?? params.projectFacts.project_features),
      ...readRecord(operationScope.project_features ?? operationScope.projectFeatures),
    },
    building_pattern_codes: uniqueStringArray([
      ...readArray(operationScope.building_pattern_codes).map(normalizeText),
      ...readArray(operationScope.buildingPatternCodes).map(normalizeText),
      ...readArray(params.projectFacts.buildingPatternCodes).map(normalizeText),
      ...readArray(params.projectFacts.building_pattern_codes).map(normalizeText),
    ]),
  } as WbsTemplateScope
  const strategy = deriveProjectOrganizationStrategy(baseScope)
  if (!strategy) return null

  const organizationScopes = params.scopeCombos.filter((scope) => (
    normalizeText(scope.project_organization_policy_id) === strategy.policyId
      || normalizeText(scope.project_organization_strategy) === strategy.strategy
  ))
  const sharedScope = organizationScopes.find((scope) => (
    normalizeText(scope.organization_lane_role) === 'shared_works'
  )) ?? null
  const buildingScopeByNumber = new Map<number, WbsTemplateScope>()
  for (const scope of organizationScopes) {
    if (normalizeText(scope.organization_lane_role) === 'shared_works') continue
    const sequenceNumber = readOptionalNumber(scope.building_sequence_number)
      ?? ((readOptionalNumber(scope.organization_lane_index) ?? -1) + 1)
    if (sequenceNumber < 1) continue
    const normalizedSequenceNumber = Math.floor(sequenceNumber)
    if (!buildingScopeByNumber.has(normalizedSequenceNumber)) {
      buildingScopeByNumber.set(normalizedSequenceNumber, scope)
    }
  }
  return {
    strategy,
    baseScope,
    sharedScope,
    buildingScopeByNumber,
  }
}



export function resolveResidentialMasterPlanOrganizationAssignment(
  activity: ResidentialMasterPlanActivity,
  context: ResidentialMasterPlanOrganizationContext | null | undefined,
) {
  if (!context) return null
  const buildingNumber = activity.buildingSequenceNumber ?? null
  const scope = buildingNumber == null
    ? context.sharedScope
    : context.buildingScopeByNumber.get(buildingNumber) ?? null
  const organizationLane = normalizeText(scope?.organization_lane)
    || (buildingNumber == null ? 'shared_works' : `${context.strategy.lanePrefix}_${buildingNumber}`)
  const organizationLaneRole = normalizeText(scope?.organization_lane_role)
    || (buildingNumber == null ? 'shared_works' : context.strategy.laneRole)
  const organizationLaneIndex = buildingNumber == null
    ? null
    : readOptionalNumber(scope?.organization_lane_index) ?? buildingNumber - 1
  const organizationScopeGroup = normalizeText(scope?.organization_scope_group)
    || (buildingNumber == null ? 'shared_project_scope' : `building_group_${buildingNumber}`)
  return {
    policyId: context.strategy.policyId,
    strategy: context.strategy.strategy,
    policySource: context.strategy.policy.source,
    policySourceVersion: context.strategy.policy.sourceVersion,
    organizationLane,
    organizationLaneRole,
    organizationLaneIndex,
    organizationLaneTotal: context.strategy.laneTotal,
    organizationScopeGroup,
    sharedWork: buildingNumber == null,
    confidence: context.strategy.confidence,
    laneSizingPolicy: context.strategy.policy.laneSizingPolicy ?? null,
    buildingObjectId: buildingNumber == null
      ? null
      : normalizeText(scope?.building_object_id) || `B${buildingNumber}`,
    buildingSequenceNumber: buildingNumber,
    phaseObjectId: normalizeText(scope?.phase_object_id) || null,
    sectionObjectId: normalizeText(scope?.section_object_id) || null,
    networkPolicy: context.strategy.networkPolicy,
    governance: context.strategy.policy.governance,
    resourcePolicy: context.strategy.policy.governance.resourcePolicy,
    releaseStepDays: activity.organizationLaneReleaseStepDays ?? 0,
    releaseLagDays: activity.organizationLaneReleaseLagDays ?? 0,
  }
}



export const BUSINESS_TYPES_WITH_DEDICATED_MASTER_PLAN_ONLY = new Set(['renovation', 'modular_building'])



export const NO_BASEMENT_BASE_MASTER_PLAN_ACTIVITY_OVERRIDES = new Map<string, BusinessTypeMasterPlanActivity>([
  ['BTMP-BASE-02', {
    code: 'BTMP-BASE-02',
    title: '场地平整、土方与基础开挖',
    executionPhase: 'foundation_pit_pile',
    executionLane: 'foundation',
    startOffsetDays: 25,
    durationDays: 45,
    durationAssetStableCode: 'earthwork_excavation_transport',
    predecessorCodes: ['BTMP-BASE-01'],
    tags: ['base', 'foundation', 'earthwork'],
  }],
  ['BTMP-BASE-04', {
    code: 'BTMP-BASE-04',
    title: '基础承台地梁施工与基础验收',
    executionPhase: 'foundation_pit_pile',
    executionLane: 'foundation',
    startOffsetDays: 75,
    durationDays: 65,
    durationAssetStableCode: 'shallow_foundation_concrete_structure',
    predecessorCodes: ['BTMP-BASE-02', 'BTMP-BASE-03'],
    tags: ['base', 'foundation', 'foundation_handover'],
  }],
])



export const NO_BASEMENT_DEEP_FOUNDATION_ACTIVITY_OVERRIDES = new Map<string, BusinessTypeMasterPlanActivity>([
  ['BTMP-BASE-04', {
    code: 'BTMP-BASE-04',
    title: '深基础承台地梁施工与基础验收',
    executionPhase: 'foundation_pit_pile',
    executionLane: 'foundation',
    startOffsetDays: 80,
    durationDays: 75,
    durationAssetStableCode: 'shallow_foundation_concrete_structure',
    predecessorCodes: ['BTMP-BASE-02', 'BTMP-BASE-03'],
    tags: ['base', 'foundation', 'deep_foundation_handover'],
  }],
])



export function getBusinessTypeBaseMasterPlanActivities(
  businessType: string,
  basementLevelCount: number | null = null,
  foundationDepthM: number | null = null,
) {
  if (BUSINESS_TYPES_WITH_DEDICATED_MASTER_PLAN_ONLY.has(normalizeText(businessType))) return []
  if (basementLevelCount !== 0) return BUSINESS_TYPE_BASE_MASTER_PLAN_ACTIVITIES
  const overrides = foundationDepthM != null && foundationDepthM < 3
    ? NO_BASEMENT_BASE_MASTER_PLAN_ACTIVITY_OVERRIDES
    : NO_BASEMENT_DEEP_FOUNDATION_ACTIVITY_OVERRIDES
  return BUSINESS_TYPE_BASE_MASTER_PLAN_ACTIVITIES.map((activity) => (
    overrides.get(activity.code) ?? activity
  ))
}



export const BUSINESS_TYPE_PROFILE_PHASE_ANCHOR_PHASES: Record<string, string[]> = {
  startup_site_setup: ['startup_site_setup'],
  foundation_pit_pile: ['startup_site_setup'],
  basement_structure: ['foundation_pit_pile'],
  superstructure_rhythm: ['foundation_pit_pile', 'basement_structure'],
  secondary_structure_fitout_roughin: ['superstructure_rhythm'],
  mep_roughin: ['superstructure_rhythm', 'basement_structure'],
  envelope_roof_facade: ['superstructure_rhythm'],
  elevator_installation: ['superstructure_rhythm'],
  interior_fitout_terminal: ['superstructure_rhythm', 'envelope_roof_facade'],
  outdoor_municipal_landscape: ['superstructure_rhythm', 'envelope_roof_facade'],
  commissioning: ['mep_roughin', 'interior_fitout_terminal'],
  acceptance_handover: ['commissioning', 'outdoor_municipal_landscape', 'mep_roughin'],
}



export const BUSINESS_TYPE_MASTER_PLAN_ACTIVITY_SETS: Record<string, BusinessTypeMasterPlanActivity[]> = {
  general_civil: [
    {
      code: 'BTMP-GCV-P01',
      title: '幕墙、电梯、智能化及公区精装深化与采购释放',
      executionPhase: 'startup_site_setup',
      executionLane: 'office_commercial_specialist_procurement',
      startOffsetDays: 0,
      durationDays: 60,
      durationAssetStableCode: 'specialist_design_procurement_release',
      t2RhythmTemplateId: 't2-commercial-podium-tower-fitout-interface-rhythm-v1',
      predecessorRules: [{ code: 'BTMP-BASE-01', dependencyType: 'SS', lagDays: 0, intentCode: 'office_commercial_specialist_design_release' }],
      executionNature: 'technical_preparation',
      tags: ['general_civil', 'office_commercial', 'design_release', 'procurement'],
    },
    {
      code: 'BTMP-GCV-P02',
      title: '幕墙构件、电梯及智能化设备排产、FAT与分批到货',
      executionPhase: 'startup_site_setup',
      executionLane: 'office_commercial_long_lead_delivery',
      startOffsetDays: 60,
      durationDays: 180,
      durationAssetStableCode: 'long_lead_equipment_manufacture_delivery',
      t2RhythmTemplateId: 't2-commercial-podium-tower-fitout-interface-rhythm-v1',
      predecessorRules: [{ code: 'BTMP-GCV-P01', dependencyType: 'FS', lagDays: 0, intentCode: 'office_commercial_procurement_to_manufacture_delivery' }],
      executionNature: 'technical_preparation',
      tags: ['general_civil', 'office_commercial', 'long_lead', 'fat', 'delivery'],
    },
    {
      code: 'BTMP-GCV-01',
      title: '办公塔楼与商业裙房结构分区移交',
      executionPhase: 'superstructure_rhythm',
      executionLane: 'podium_tower_structure',
      startOffsetDays: 185,
      durationDays: 135,
      durationAssetStableCode: 'cast_in_place_formwork',
      predecessorRules: [{ code: 'BTMP-BASE-04', dependencyType: 'SS', lagDays: 30, intentCode: 'office_commercial_below_grade_to_podium_tower_structure' }],
      tags: ['general_civil', 'office', 'commercial', 'podium', 'tower', 'structure'],
    },
    {
      code: 'BTMP-GCV-02',
      title: '幕墙封闭、屋面防水与外立面收口',
      executionPhase: 'envelope_roof_facade',
      executionLane: 'facade_roof_enclosure',
      startOffsetDays: 245,
      durationDays: 120,
      durationAssetStableCode: 'curtain_wall_installation',
      predecessorRules: [
        { code: 'BTMP-GCV-01', dependencyType: 'SS', lagDays: 60, intentCode: 'office_commercial_structure_to_facade_workface' },
        { code: 'BTMP-GCV-P02', dependencyType: 'FS', lagDays: 0, intentCode: 'office_commercial_facade_components_delivery_release' },
      ],
      tags: ['general_civil', 'curtain_wall', 'roof', 'envelope'],
    },
    {
      code: 'BTMP-GCV-03',
      title: '机电、消防与智能化主干系统安装',
      executionPhase: 'mep_roughin',
      executionLane: 'mep_fire_intelligent_backbone',
      startOffsetDays: 220,
      durationDays: 150,
      durationAssetStableCode: 'mep_plumbing_fire_pipe',
      predecessorRules: [
        { code: 'BTMP-GCV-01', dependencyType: 'SS', lagDays: 35, intentCode: 'office_commercial_structure_to_mep_backbone' },
        { code: 'BTMP-GCV-P01', dependencyType: 'FS', lagDays: 0, intentCode: 'office_commercial_specialist_design_to_mep_installation' },
      ],
      tags: ['general_civil', 'mep', 'fire', 'intelligent'],
    },
    {
      code: 'BTMP-GCV-04',
      title: '办公标准层与商业公区样板及批量精装',
      executionPhase: 'interior_fitout_terminal',
      executionLane: 'office_commercial_fitout',
      startOffsetDays: 285,
      durationDays: 150,
      durationAssetStableCode: 'interior_public_finish',
      t2RhythmTemplateId: 't2-commercial-podium-tower-fitout-interface-rhythm-v1',
      predecessorRules: [
        { code: 'BTMP-BASE-06', dependencyType: 'SS', lagDays: 30, intentCode: 'office_commercial_secondary_structure_to_fitout' },
        { code: 'BTMP-BASE-07', dependencyType: 'SS', lagDays: 30, intentCode: 'office_commercial_watertight_zone_to_fitout' },
      ],
      tags: ['general_civil', 'office', 'commercial', 'public_area', 'mockup', 'fitout'],
    },
    {
      code: 'BTMP-GCV-05',
      title: '电梯、楼控、安防与运营系统安装调试',
      executionPhase: 'elevator_installation',
      executionLane: 'vertical_transport_operation_systems',
      startOffsetDays: 300,
      durationDays: 110,
      durationAssetStableCode: 'elevator_installation',
      predecessorRules: [
        { code: 'BTMP-GCV-03', dependencyType: 'SS', lagDays: 40, intentCode: 'office_commercial_mep_backbone_to_operation_systems' },
        { code: 'BTMP-GCV-P02', dependencyType: 'FS', lagDays: 0, intentCode: 'office_commercial_equipment_delivery_to_installation' },
      ],
      tags: ['general_civil', 'elevator', 'bms', 'security', 'operation_system'],
    },
    {
      code: 'BTMP-GCV-06',
      title: '租户界面、公区精装收口与导向泛光施工',
      executionPhase: 'interior_fitout_terminal',
      executionLane: 'tenant_public_area_closeout',
      startOffsetDays: 360,
      durationDays: 95,
      durationAssetStableCode: 'interior_public_finish',
      t2RhythmTemplateId: 't2-commercial-podium-tower-fitout-interface-rhythm-v1',
      predecessorRules: [
        { code: 'BTMP-GCV-04', dependencyType: 'SS', lagDays: 45, intentCode: 'office_commercial_fitout_to_tenant_public_closeout' },
        { code: 'BTMP-GCV-03', dependencyType: 'FS', lagDays: 0, intentCode: 'office_commercial_mep_to_public_area_closeout' },
      ],
      tags: ['general_civil', 'tenant_interface', 'public_area', 'wayfinding', 'facade_lighting'],
    },
    {
      code: 'BTMP-GCV-07',
      title: '机电消防智能化联调与开业条件验证',
      executionPhase: 'commissioning',
      executionLane: 'office_commercial_opening_commissioning',
      startOffsetDays: 440,
      durationDays: 65,
      durationAssetStableCode: 'integrated_commissioning',
      t2RhythmTemplateId: 't2-commercial-podium-tower-fitout-interface-rhythm-v1',
      predecessorCodes: ['BTMP-GCV-02', 'BTMP-GCV-03', 'BTMP-GCV-05', 'BTMP-GCV-06'],
      tags: ['general_civil', 'integrated_commissioning', 'opening_readiness', 'commissioning'],
    },
    {
      code: 'BTMP-GCV-08',
      title: '专项验收、竣工验收及运营移交',
      executionPhase: 'acceptance_handover',
      executionLane: 'office_commercial_handover',
      startOffsetDays: 505,
      durationDays: 45,
      durationAssetStableCode: 'integrated_commissioning',
      t2RhythmTemplateId: 't2-commercial-podium-tower-fitout-interface-rhythm-v1',
      predecessorCodes: ['BTMP-GCV-07', 'BTMP-BASE-11'],
      dependencyType: 'FS',
      lagDays: 0,
      tags: ['general_civil', 'special_acceptance', 'completion_acceptance', 'operation_handover', 'acceptance', 'handover'],
    },
  ],
  hotel: [
    { code: 'BTMP-HTL-P01', title: '酒店机电、厨洗及客房部品选型深化与采购释放', executionPhase: 'startup_site_setup', executionLane: 'hotel_specialist_procurement', startOffsetDays: 0, durationDays: 60, durationAssetStableCode: 'specialist_design_procurement_release', t2RhythmTemplateId: 't2-commercial-podium-tower-fitout-interface-rhythm-v1', predecessorCodes: ['BTMP-BASE-01'], dependencyType: 'SS', lagDays: 0, executionNature: 'technical_preparation', tags: ['hotel', 'design_release', 'procurement'] },
    { code: 'BTMP-HTL-P02', title: '电梯、厨房洗衣设备及客房部品订货排产、厂家FAT与分批到货', executionPhase: 'startup_site_setup', executionLane: 'hotel_long_lead_delivery', startOffsetDays: 60, durationDays: 180, durationAssetStableCode: 'long_lead_equipment_manufacture_delivery', t2RhythmTemplateId: 't2-commercial-podium-tower-fitout-interface-rhythm-v1', predecessorCodes: ['BTMP-HTL-P01'], dependencyType: 'FS', lagDays: 0, executionNature: 'technical_preparation', tags: ['hotel', 'long_lead', 'fat', 'delivery'] },
    { code: 'BTMP-HTL-01', title: '酒店样板层与机电综合样板确认', executionPhase: 'interior_fitout_terminal', executionLane: 'hotel_mockup', startOffsetDays: 210, durationDays: 35, durationAssetStableCode: 'interior_public_finish', t2RhythmTemplateId: 't2-hotel-guestroom-mockup-batch-fitout-rhythm-v1', predecessorRules: [{ code: 'BTMP-BASE-06', dependencyType: 'SS', lagDays: 30, intentCode: 'hotel_secondary_structure_to_mockup_workface_release' }], tags: ['hotel', 'mockup'] },
    { code: 'BTMP-HTL-02', title: '客房层批量精装与卫浴安装', executionPhase: 'interior_fitout_terminal', executionLane: 'guestroom_fitout', startOffsetDays: 260, durationDays: 150, predecessorRules: [{ code: 'BTMP-HTL-01', dependencyType: 'FS', lagDays: 0, intentCode: 'hotel_approved_mockup_to_guestroom_batch_release' }, { code: 'BTMP-HTL-P02', dependencyType: 'FS', lagDays: 0, intentCode: 'business_type_long_lead_delivery_release' }], tags: ['hotel', 'guestroom'] },
    { code: 'BTMP-HTL-03', title: '厨房洗衣房与后勤机电安装', executionPhase: 'mep_roughin', executionLane: 'hotel_back_of_house', startOffsetDays: 155, durationDays: 120, predecessorRules: [{ code: 'BTMP-HTL-P02', dependencyType: 'FS', lagDays: 0, intentCode: 'business_type_long_lead_delivery_release' }], tags: ['hotel', 'mep'] },
    { code: 'BTMP-HTL-04', title: '大堂宴会厅公区精装与机电收口', executionPhase: 'interior_fitout_terminal', executionLane: 'lobby_banquet_fitout', startOffsetDays: 260, durationDays: 115, predecessorRules: [{ code: 'BTMP-HTL-01', dependencyType: 'FS', lagDays: 0, intentCode: 'hotel_approved_mockup_to_public_area_fitout_release' }, { code: 'BTMP-HTL-P02', dependencyType: 'FS', lagDays: 0, intentCode: 'business_type_long_lead_delivery_release' }], tags: ['hotel', 'lobby', 'banquet'] },
    { code: 'BTMP-HTL-05', title: '酒店开业专项联调与运营系统验证', executionPhase: 'commissioning', executionLane: 'hotel_opening_commissioning', startOffsetDays: 315, durationDays: 55, predecessorCodes: ['BTMP-HTL-02', 'BTMP-HTL-03', 'BTMP-HTL-04'], tags: ['hotel', 'opening', 'commissioning'] },
    { code: 'BTMP-HTL-06', title: '酒店试运营移交与开业条件确认', executionPhase: 'acceptance_handover', executionLane: 'hotel_trial_operation', startOffsetDays: 365, durationDays: 30, predecessorCodes: ['BTMP-HTL-05'], dependencyType: 'FS', lagDays: 0, tags: ['hotel', 'trial_operation', 'handover'] },
  ],
  hospital: [
    { code: 'BTMP-HSP-P01', title: '净化、医气及医疗设备选型深化与采购释放', executionPhase: 'startup_site_setup', executionLane: 'medical_specialist_procurement', startOffsetDays: 0, durationDays: 60, durationAssetStableCode: 'specialist_design_procurement_release', t2RhythmTemplateId: 't2-hospital-cleanroom-medical-system-commissioning-v1', predecessorCodes: ['BTMP-BASE-01'], dependencyType: 'SS', lagDays: 0, executionNature: 'technical_preparation', tags: ['hospital', 'design_release', 'procurement'] },
    { code: 'BTMP-HSP-P02', title: '净化机组、医气站房及医疗设备订货排产、厂家FAT与分批到货', executionPhase: 'startup_site_setup', executionLane: 'medical_long_lead_delivery', startOffsetDays: 60, durationDays: 180, durationAssetStableCode: 'long_lead_equipment_manufacture_delivery', t2RhythmTemplateId: 't2-hospital-cleanroom-medical-system-commissioning-v1', predecessorCodes: ['BTMP-HSP-P01'], dependencyType: 'FS', lagDays: 0, executionNature: 'technical_preparation', tags: ['hospital', 'long_lead', 'fat', 'delivery'] },
    { code: 'BTMP-HSP-01', title: '医技楼主体结构与医疗功能区移交', executionPhase: 'superstructure_rhythm', executionLane: 'medical_technology_block', startOffsetDays: 150, durationDays: 110, predecessorRules: [{ code: 'BTMP-BASE-04', dependencyType: 'SS', lagDays: 75, intentCode: 'hospital_below_grade_to_medical_block_workface_release' }], tags: ['hospital', 'medical_technology'] },
    { code: 'BTMP-HSP-02', title: '病房楼二次结构与粗装修移交', executionPhase: 'secondary_structure_fitout_roughin', executionLane: 'ward_secondary_structure', startOffsetDays: 175, durationDays: 115, predecessorCodes: ['BTMP-HSP-01'], tags: ['hospital', 'ward', 'secondary_structure'] },
    { code: 'BTMP-HSP-03', title: '手术部洁净装修与净化空调安装', executionPhase: 'interior_fitout_terminal', executionLane: 'cleanroom_or', startOffsetDays: 310, durationDays: 150, durationAssetStableCode: 'hvac_cleanroom_system', t2RhythmTemplateId: 't2-hospital-clinical-department-fitout-rhythm-v1', predecessorRules: [{ code: 'BTMP-HSP-01', dependencyType: 'FS', lagDays: 0, intentCode: 'hospital_medical_block_structure_to_cleanroom_fitout_release' }, { code: 'BTMP-BASE-07', dependencyType: 'SS', lagDays: 45, intentCode: 'hospital_watertight_zone_to_cleanroom_fitout_release' }, { code: 'BTMP-HSP-P02', dependencyType: 'FS', lagDays: 0, intentCode: 'business_type_long_lead_delivery_release' }], tags: ['hospital', 'cleanroom', 'operating_room'] },
    { code: 'BTMP-HSP-03B', title: '病房、医技与门急诊功能区精装及医疗末端安装', executionPhase: 'interior_fitout_terminal', executionLane: 'clinical_department_fitout', startOffsetDays: 300, durationDays: 180, durationAssetStableCode: 'interior_public_finish', t2RhythmTemplateId: 't2-hospital-clinical-department-fitout-rhythm-v1', predecessorRules: [{ code: 'BTMP-HSP-02', dependencyType: 'SS', lagDays: 60, intentCode: 'hospital_department_rough_handover_to_clinical_fitout_release' }, { code: 'BTMP-BASE-07', dependencyType: 'SS', lagDays: 45, intentCode: 'hospital_watertight_zone_to_clinical_fitout_release' }], tags: ['hospital', 'clinical_department', 'fitout', 'medical_terminal'] },
    { code: 'BTMP-HSP-04', title: '医疗气体系统管网与站房安装', executionPhase: 'mep_roughin', executionLane: 'medical_gas', startOffsetDays: 240, durationDays: 100, durationAssetStableCode: 'mep_plumbing_fire_pipe', t2RhythmTemplateId: 't2-hospital-medical-gas-source-terminal-rhythm-v1', predecessorRules: [{ code: 'BTMP-HSP-02', dependencyType: 'SS', lagDays: 30, intentCode: 'hospital_department_rough_handover_to_medical_gas_release' }, { code: 'BTMP-HSP-P02', dependencyType: 'FS', lagDays: 0, intentCode: 'business_type_long_lead_delivery_release' }], tags: ['hospital', 'medical_gas'] },
    { code: 'BTMP-HSP-05', title: '医疗设备安装与系统接驳', executionPhase: 'mep_roughin', executionLane: 'medical_equipment', startOffsetDays: 420, durationDays: 85, durationAssetStableCode: 'mep_plumbing_fire_pipe', t2RhythmTemplateId: 't2-hospital-clinical-department-fitout-rhythm-v1', predecessorRules: [{ code: 'BTMP-HSP-03', dependencyType: 'SS', lagDays: 80, intentCode: 'hospital_cleanroom_progress_to_equipment_install_release' }, { code: 'BTMP-HSP-03B', dependencyType: 'SS', lagDays: 120, intentCode: 'hospital_clinical_fitout_progress_to_equipment_install_release' }, { code: 'BTMP-HSP-04', dependencyType: 'SS', lagDays: 95, intentCode: 'hospital_medical_gas_progress_to_equipment_interface_release' }, { code: 'BTMP-HSP-P02', dependencyType: 'FS', lagDays: 0, intentCode: 'business_type_long_lead_delivery_release' }], tags: ['hospital', 'medical_equipment'] },
    { code: 'BTMP-HSP-05A', title: '洁净环境性能检测、医气终端测试与医疗设备单系统调试', executionPhase: 'commissioning', executionLane: 'medical_single_system_validation', startOffsetDays: 505, durationDays: 75, durationAssetStableCode: 'single_system_commissioning', t2RhythmTemplateId: 't2-hospital-cleanroom-medical-system-commissioning-v1', predecessorRules: [{ code: 'BTMP-HSP-03', dependencyType: 'FS', lagDays: 0, intentCode: 'hospital_cleanroom_installation_to_performance_validation' }, { code: 'BTMP-HSP-03B', dependencyType: 'FS', lagDays: 0, intentCode: 'hospital_clinical_fitout_to_performance_validation' }, { code: 'BTMP-HSP-04', dependencyType: 'FS', lagDays: 0, intentCode: 'hospital_medical_gas_installation_to_terminal_validation' }, { code: 'BTMP-HSP-05', dependencyType: 'FS', lagDays: 0, intentCode: 'hospital_medical_equipment_installation_to_single_system_test' }], tags: ['hospital', 'cleanroom_validation', 'medical_gas_terminal_test', 'single_system_commissioning'] },
    { code: 'BTMP-HSP-06', title: '医疗系统综合联调与卫生专项验收', executionPhase: 'commissioning', executionLane: 'medical_commissioning', startOffsetDays: 580, durationDays: 60, durationAssetStableCode: 'integrated_commissioning', t2RhythmTemplateId: 't2-hospital-cleanroom-medical-system-commissioning-v1', predecessorRules: [{ code: 'BTMP-HSP-05A', dependencyType: 'FS', lagDays: 0, intentCode: 'hospital_single_system_validation_to_integrated_commissioning' }, { code: 'BTMP-BASE-08', dependencyType: 'FS', lagDays: 0, intentCode: 'hospital_common_mep_completion_to_integrated_commissioning' }, { code: 'BTMP-BASE-10', dependencyType: 'FS', lagDays: 0, intentCode: 'hospital_vertical_transport_acceptance_to_integrated_commissioning' }], tags: ['hospital', 'commissioning', 'health_acceptance'] },
    { code: 'BTMP-HSP-07', title: '医疗专项验收闭合、竣工验收与运营移交', executionPhase: 'acceptance_handover', executionLane: 'medical_handover', startOffsetDays: 645, durationDays: 45, predecessorRules: [{ code: 'BTMP-HSP-06', dependencyType: 'FS', lagDays: 0, intentCode: 'hospital_integrated_commissioning_to_operational_handover' }, { code: 'BTMP-BASE-11', dependencyType: 'FS', lagDays: 0, intentCode: 'hospital_outdoor_completion_to_final_handover' }], tags: ['hospital', 'acceptance', 'handover'] },
  ],
  school: [
    { code: 'BTMP-SCH-P01', title: '实验室、厨房及教学设备选型深化与采购释放', executionPhase: 'startup_site_setup', executionLane: 'school_specialist_procurement', startOffsetDays: 0, durationDays: 60, durationAssetStableCode: 'specialist_design_procurement_release', t2RhythmTemplateId: 't2-school-campus-functional-phasing-rhythm-v1', predecessorCodes: ['BTMP-BASE-01'], dependencyType: 'SS', lagDays: 0, executionNature: 'technical_preparation', tags: ['school', 'design_release', 'procurement'] },
    { code: 'BTMP-SCH-P02', title: '实验室通风、厨房及教学设备订货排产、厂家验收与分批到货', executionPhase: 'startup_site_setup', executionLane: 'school_equipment_delivery', startOffsetDays: 60, durationDays: 150, durationAssetStableCode: 'long_lead_equipment_manufacture_delivery', t2RhythmTemplateId: 't2-school-campus-functional-phasing-rhythm-v1', predecessorCodes: ['BTMP-SCH-P01'], dependencyType: 'FS', lagDays: 0, executionNature: 'technical_preparation', tags: ['school', 'long_lead', 'delivery'] },
    { code: 'BTMP-SCH-01', title: '教学楼主体结构与功能区移交', executionPhase: 'superstructure_rhythm', executionLane: 'teaching_building', startOffsetDays: 120, durationDays: 100, predecessorRules: [{ code: 'BTMP-BASE-04', dependencyType: 'SS', lagDays: 30, intentCode: 'school_below_grade_to_teaching_block_workface_release' }], tags: ['school', 'teaching'] },
    { code: 'BTMP-SCH-02', title: '教学楼二次结构与普通教室粗装修', executionPhase: 'secondary_structure_fitout_roughin', executionLane: 'teaching_secondary_structure', startOffsetDays: 160, durationDays: 95, predecessorCodes: ['BTMP-SCH-01'], tags: ['school', 'teaching', 'secondary_structure'] },
    { code: 'BTMP-SCH-03', title: '实验室通风与专业机电安装', executionPhase: 'mep_roughin', executionLane: 'laboratory_mep', startOffsetDays: 185, durationDays: 90, predecessorCodes: ['BTMP-SCH-01'], predecessorRules: [{ code: 'BTMP-SCH-P02', dependencyType: 'FS', lagDays: 0, intentCode: 'business_type_long_lead_delivery_release' }], tags: ['school', 'laboratory'] },
    { code: 'BTMP-SCH-04', title: '食堂宿舍装修与机电收口', executionPhase: 'interior_fitout_terminal', executionLane: 'cafeteria_dormitory_fitout', startOffsetDays: 230, durationDays: 85, predecessorCodes: ['BTMP-SCH-02', 'BTMP-SCH-03'], predecessorRules: [{ code: 'BTMP-SCH-P02', dependencyType: 'FS', lagDays: 0, intentCode: 'business_type_long_lead_delivery_release' }], tags: ['school', 'cafeteria', 'dormitory'] },
    { code: 'BTMP-SCH-05', title: '操场道路与校园室外配套', executionPhase: 'outdoor_municipal_landscape', executionLane: 'campus_outdoor', startOffsetDays: 265, durationDays: 75, tags: ['school', 'outdoor'] },
    { code: 'BTMP-SCH-06', title: '竣工验收与开学移交准备', executionPhase: 'acceptance_handover', executionLane: 'school_handover', startOffsetDays: 345, durationDays: 30, predecessorCodes: ['BTMP-SCH-03', 'BTMP-SCH-04', 'BTMP-SCH-05', 'BTMP-BASE-12'], dependencyType: 'FS', lagDays: 0, tags: ['school', 'handover'] },
  ],
  industrial: [
    { code: 'BTMP-IND-P01', title: '钢结构、动力系统及工艺设备技术深化与采购释放', executionPhase: 'startup_site_setup', executionLane: 'industrial_specialist_procurement', startOffsetDays: 0, durationDays: 60, durationAssetStableCode: 'specialist_design_procurement_release', t2RhythmTemplateId: 't2-industrial-main-plant-utility-equipment-rhythm-v1', predecessorCodes: ['BTMP-BASE-01'], dependencyType: 'SS', lagDays: 0, executionNature: 'technical_preparation', tags: ['industrial', 'design_release', 'procurement'] },
    { code: 'BTMP-IND-P02', title: '主厂房钢构件、工艺设备与动力成套设备排产、厂家FAT及分批到货', executionPhase: 'startup_site_setup', executionLane: 'industrial_long_lead_delivery', startOffsetDays: 60, durationDays: 180, durationAssetStableCode: 'long_lead_equipment_manufacture_delivery', t2RhythmTemplateId: 't2-industrial-main-plant-utility-equipment-rhythm-v1', predecessorCodes: ['BTMP-IND-P01'], dependencyType: 'FS', lagDays: 0, executionNature: 'technical_preparation', tags: ['industrial', 'long_lead', 'steel_fabrication', 'fat', 'delivery'] },
    { code: 'BTMP-IND-01', title: '主厂房钢结构与围护系统施工', executionPhase: 'superstructure_rhythm', executionLane: 'factory_structure', startOffsetDays: 240, durationDays: 130, predecessorRules: [{ code: 'BTMP-IND-P02', dependencyType: 'FS', lagDays: 0, intentCode: 'business_type_long_lead_delivery_release' }], tags: ['industrial', 'steel_frame'] },
    { code: 'BTMP-IND-02', title: '围护屋面封闭与厂房防水收口', executionPhase: 'envelope_roof_facade', executionLane: 'factory_envelope', startOffsetDays: 300, durationDays: 85, durationAssetStableCode: 'roof_waterproof_insulation', predecessorRules: [{ code: 'BTMP-IND-01', dependencyType: 'SS', lagDays: 60, intentCode: 'industrial_steel_workface_to_enclosure_release' }], tags: ['industrial', 'envelope', 'roof'] },
    { code: 'BTMP-IND-03', title: '工艺设备基础与动力管线综合', executionPhase: 'mep_roughin', executionLane: 'process_foundation_mep', startOffsetDays: 185, durationDays: 110, predecessorCodes: ['BTMP-IND-01'], tags: ['industrial', 'process', 'equipment_foundation'] },
    { code: 'BTMP-IND-04', title: '设备安装单机试车与动力接驳', executionPhase: 'commissioning', executionLane: 'equipment_single_test', startOffsetDays: 275, durationDays: 80, predecessorCodes: ['BTMP-IND-03'], predecessorRules: [{ code: 'BTMP-IND-P02', dependencyType: 'FS', lagDays: 0, intentCode: 'business_type_long_lead_delivery_release' }], tags: ['industrial', 'equipment', 'single_test'] },
    { code: 'BTMP-IND-05', title: '工业地坪与物流装卸区施工', executionPhase: 'interior_fitout_terminal', executionLane: 'industrial_floor', startOffsetDays: 250, durationDays: 75, predecessorCodes: ['BTMP-IND-02'], tags: ['industrial', 'floor'] },
    { code: 'BTMP-IND-06', title: '生产联动调试与投产条件验收', executionPhase: 'acceptance_handover', executionLane: 'production_validation', startOffsetDays: 360, durationDays: 50, predecessorCodes: ['BTMP-IND-04', 'BTMP-IND-05'], dependencyType: 'FS', lagDays: 0, tags: ['industrial', 'commissioning', 'acceptance'] },
  ],
  data_center: [
    { code: 'BTMP-DTC-P01', title: '关键设备选型深化、技术规格冻结与采购释放', executionPhase: 'startup_site_setup', executionLane: 'critical_equipment_procurement', startOffsetDays: 0, durationDays: 60, durationAssetStableCode: 'specialist_design_procurement_release', t2RhythmTemplateId: 't2-data-center-shell-room-readiness-rhythm-v1', predecessorCodes: ['BTMP-BASE-01'], dependencyType: 'SS', lagDays: 0, executionNature: 'technical_preparation', tags: ['data_center', 'design_release', 'procurement'] },
    { code: 'BTMP-DTC-P02', title: 'UPS、柴油发电机、冷机与精密空调订货排产、厂家FAT及分批到货', executionPhase: 'startup_site_setup', executionLane: 'critical_equipment_delivery', startOffsetDays: 60, durationDays: 180, durationAssetStableCode: 'long_lead_equipment_manufacture_delivery', t2RhythmTemplateId: 't2-data-center-shell-room-readiness-rhythm-v1', predecessorCodes: ['BTMP-DTC-P01'], dependencyType: 'FS', lagDays: 0, executionNature: 'technical_preparation', tags: ['data_center', 'long_lead', 'fat', 'delivery'] },
    { code: 'BTMP-DTC-01', title: '机房楼主体结构与设备层移交', executionPhase: 'superstructure_rhythm', executionLane: 'data_center_structure', startOffsetDays: 150, durationDays: 115, predecessorRules: [{ code: 'BTMP-BASE-04', dependencyType: 'SS', lagDays: 60, intentCode: 'data_center_below_grade_to_data_hall_workface_release' }], tags: ['data_center', 'structure'] },
    { code: 'BTMP-DTC-02', title: '机房白区装修与架空地板施工', executionPhase: 'interior_fitout_terminal', executionLane: 'data_hall_white_space', startOffsetDays: 205, durationDays: 105, predecessorCodes: ['BTMP-DTC-01'], tags: ['data_center', 'white_space'] },
    { code: 'BTMP-DTC-03', title: '供配电 UPS 与柴油发电系统安装', executionPhase: 'mep_roughin', executionLane: 'critical_power', startOffsetDays: 190, durationDays: 120, predecessorCodes: ['BTMP-DTC-01'], predecessorRules: [{ code: 'BTMP-DTC-P02', dependencyType: 'FS', lagDays: 0, intentCode: 'business_type_long_lead_delivery_release' }], tags: ['data_center', 'power'] },
    { code: 'BTMP-DTC-04', title: '制冷站冷冻水与精密空调系统安装', executionPhase: 'mep_roughin', executionLane: 'cooling_system', startOffsetDays: 200, durationDays: 115, predecessorCodes: ['BTMP-DTC-01'], predecessorRules: [{ code: 'BTMP-DTC-P02', dependencyType: 'FS', lagDays: 0, intentCode: 'business_type_long_lead_delivery_release' }], tags: ['data_center', 'cooling'] },
    { code: 'BTMP-DTC-05', title: '动环监控联调与弱电系统集成', executionPhase: 'commissioning', executionLane: 'dcim_monitoring', startOffsetDays: 305, durationDays: 60, predecessorCodes: ['BTMP-DTC-02', 'BTMP-DTC-03', 'BTMP-DTC-04'], tags: ['data_center', 'dcim', 'monitoring'] },
    { code: 'BTMP-DTC-06', title: '数据中心综合联调与带载负载测试', executionPhase: 'commissioning', executionLane: 'integrated_system_test', startOffsetDays: 355, durationDays: 55, predecessorCodes: ['BTMP-DTC-05'], dependencyType: 'FS', lagDays: 0, tags: ['data_center', 'load_test', 'commissioning'] },
    { code: 'BTMP-DTC-07', title: '投产验收、运维接管与项目移交', executionPhase: 'acceptance_handover', executionLane: 'data_center_handover', startOffsetDays: 415, durationDays: 35, predecessorCodes: ['BTMP-DTC-06'], dependencyType: 'FS', lagDays: 0, tags: ['data_center', 'acceptance', 'handover'] },
  ],
  transportation_hub: [
    { code: 'BTMP-TRH-P01', title: '大跨度钢构、幕墙屋面及旅客系统深化与采购释放', executionPhase: 'startup_site_setup', executionLane: 'hub_specialist_procurement', startOffsetDays: 0, durationDays: 60, durationAssetStableCode: 'specialist_design_procurement_release', t2RhythmTemplateId: 't2-transport-hub-longspan-envelope-rhythm-v1', predecessorCodes: ['BTMP-BASE-01'], dependencyType: 'SS', lagDays: 0, executionNature: 'technical_preparation', tags: ['transportation_hub', 'design_release', 'procurement'] },
    { code: 'BTMP-TRH-P02', title: '长跨钢构、幕墙屋面及旅客系统设备排产、预拼装FAT与分批到货', executionPhase: 'startup_site_setup', executionLane: 'hub_long_lead_delivery', startOffsetDays: 60, durationDays: 180, durationAssetStableCode: 'long_lead_equipment_manufacture_delivery', t2RhythmTemplateId: 't2-transport-hub-longspan-envelope-rhythm-v1', predecessorCodes: ['BTMP-TRH-P01'], dependencyType: 'FS', lagDays: 0, executionNature: 'technical_preparation', tags: ['transportation_hub', 'long_lead', 'fat', 'delivery'] },
    { code: 'BTMP-TRH-01', title: '枢纽主体结构与大空间屋盖施工', executionPhase: 'superstructure_rhythm', executionLane: 'hub_structure', startOffsetDays: 95, durationDays: 145, predecessorRules: [{ code: 'BTMP-TRH-P02', dependencyType: 'FS', lagDays: 0, intentCode: 'business_type_long_lead_delivery_release' }], tags: ['transportation_hub', 'structure'] },
    { code: 'BTMP-TRH-02', title: '幕墙屋面封闭与站房防水收口', executionPhase: 'envelope_roof_facade', executionLane: 'hub_envelope', startOffsetDays: 210, durationDays: 95, durationAssetStableCode: 'curtain_wall_installation', predecessorCodes: ['BTMP-TRH-01'], predecessorRules: [{ code: 'BTMP-TRH-P02', dependencyType: 'FS', lagDays: 0, intentCode: 'business_type_long_lead_delivery_release' }], tags: ['transportation_hub', 'envelope'] },
    { code: 'BTMP-TRH-03', title: '站房机电弱电与旅客服务系统安装', executionPhase: 'mep_roughin', executionLane: 'hub_systems', startOffsetDays: 205, durationDays: 135, predecessorCodes: ['BTMP-TRH-01'], predecessorRules: [{ code: 'BTMP-TRH-P02', dependencyType: 'FS', lagDays: 0, intentCode: 'business_type_long_lead_delivery_release' }], tags: ['transportation_hub', 'systems'] },
    { code: 'BTMP-TRH-04', title: '旅客流线装修与导向标识施工', executionPhase: 'interior_fitout_terminal', executionLane: 'passenger_flow', startOffsetDays: 250, durationDays: 100, predecessorCodes: ['BTMP-TRH-01', 'BTMP-TRH-02'], tags: ['transportation_hub', 'fitout'] },
    { code: 'BTMP-TRH-05', title: '站台接口验收与运营联调条件确认', executionPhase: 'commissioning', executionLane: 'platform_interface', startOffsetDays: 345, durationDays: 60, durationAssetStableCode: 'integrated_commissioning', t2RhythmTemplateId: 't2-transport-hub-platform-canopy-trackside-interface-rhythm-v1', predecessorCodes: ['BTMP-TRH-03', 'BTMP-TRH-04'], tags: ['transportation_hub', 'platform_interface'] },
    { code: 'BTMP-TRH-05A', title: '消防生命安全、旅客组织与峰值客流全流程演练', executionPhase: 'commissioning', executionLane: 'peak_flow_rehearsal', startOffsetDays: 405, durationDays: 54, durationAssetStableCode: 'integrated_commissioning', t2RhythmTemplateId: 't2-transportation-hub-public-system-transfer-rhythm-v1', predecessorRules: [{ code: 'BTMP-TRH-05', dependencyType: 'FS', lagDays: 0, intentCode: 'hub_platform_readiness_to_peak_flow_rehearsal' }], tags: ['transportation_hub', 'life_safety', 'passenger_flow', 'full_rehearsal'] },
    { code: 'BTMP-TRH-06', title: '枢纽试运行验收与运营移交', executionPhase: 'acceptance_handover', executionLane: 'operation_handover', startOffsetDays: 460, durationDays: 54, durationAssetStableCode: 'integrated_commissioning', t2RhythmTemplateId: 't2-transportation-hub-public-system-transfer-rhythm-v1', predecessorRules: [{ code: 'BTMP-TRH-05A', dependencyType: 'FS', lagDays: 0, intentCode: 'hub_peak_flow_rehearsal_to_operation_handover' }], tags: ['transportation_hub', 'trial_operation', 'handover'] },
  ],
  sports_culture: [
    { code: 'BTMP-SPC-P01', title: '大跨度钢构屋盖、声光电及赛事系统深化与采购释放', executionPhase: 'startup_site_setup', executionLane: 'venue_specialist_procurement', startOffsetDays: 0, durationDays: 60, durationAssetStableCode: 'specialist_design_procurement_release', t2RhythmTemplateId: 't2-sports-culture-longspan-envelope-event-rhythm-v1', predecessorCodes: ['BTMP-BASE-01'], dependencyType: 'SS', lagDays: 0, executionNature: 'technical_preparation', tags: ['sports_culture', 'design_release', 'procurement'] },
    { code: 'BTMP-SPC-P02', title: '钢构屋盖、声光电、座椅及运动面层排产、预拼装FAT与分批到货', executionPhase: 'startup_site_setup', executionLane: 'venue_long_lead_delivery', startOffsetDays: 60, durationDays: 180, durationAssetStableCode: 'long_lead_equipment_manufacture_delivery', t2RhythmTemplateId: 't2-sports-culture-longspan-envelope-event-rhythm-v1', predecessorCodes: ['BTMP-SPC-P01'], dependencyType: 'FS', lagDays: 0, executionNature: 'technical_preparation', tags: ['sports_culture', 'long_lead', 'fat', 'delivery'] },
    { code: 'BTMP-SPC-01', title: '大跨度钢结构屋盖施工', executionPhase: 'superstructure_rhythm', executionLane: 'large_span_roof', startOffsetDays: 95, durationDays: 150, predecessorRules: [{ code: 'BTMP-SPC-P02', dependencyType: 'FS', lagDays: 0, intentCode: 'business_type_long_lead_delivery_release' }], tags: ['sports_culture', 'large_span'] },
    { code: 'BTMP-SPC-02', title: '屋面围护封闭与场馆外围护收口', executionPhase: 'envelope_roof_facade', executionLane: 'venue_envelope', startOffsetDays: 215, durationDays: 95, durationAssetStableCode: 'roof_waterproof_insulation', predecessorCodes: ['BTMP-SPC-01'], tags: ['sports_culture', 'envelope'] },
    { code: 'BTMP-SPC-03', title: '场馆声光电与机电系统安装', executionPhase: 'mep_roughin', executionLane: 'venue_systems', startOffsetDays: 220, durationDays: 120, predecessorCodes: ['BTMP-SPC-01'], predecessorRules: [{ code: 'BTMP-SPC-P02', dependencyType: 'FS', lagDays: 0, intentCode: 'business_type_long_lead_delivery_release' }], tags: ['sports_culture', 'systems'] },
    { code: 'BTMP-SPC-04', title: '看台装修与运动面层施工', executionPhase: 'interior_fitout_terminal', executionLane: 'venue_fitout', startOffsetDays: 255, durationDays: 90, predecessorCodes: ['BTMP-SPC-01', 'BTMP-SPC-02'], predecessorRules: [{ code: 'BTMP-SPC-P02', dependencyType: 'FS', lagDays: 0, intentCode: 'business_type_long_lead_delivery_release' }], tags: ['sports_culture', 'fitout'] },
    { code: 'BTMP-SPC-05', title: '场馆系统联调与功能测试', executionPhase: 'commissioning', executionLane: 'venue_system_commissioning', startOffsetDays: 345, durationDays: 55, predecessorCodes: ['BTMP-SPC-03', 'BTMP-SPC-04'], tags: ['sports_culture', 'commissioning'] },
    { code: 'BTMP-SPC-06', title: '赛事功能验收与运营移交', executionPhase: 'acceptance_handover', executionLane: 'event_handover', startOffsetDays: 395, durationDays: 40, predecessorCodes: ['BTMP-SPC-05'], dependencyType: 'FS', lagDays: 0, tags: ['sports_culture', 'handover'] },
  ],
  tod_upper_cover: [
    { code: 'BTMP-TOD-P01', title: '轨交接口、消防机电及商业设备深化与采购释放', executionPhase: 'startup_site_setup', executionLane: 'tod_interface_procurement', startOffsetDays: 0, durationDays: 60, durationAssetStableCode: 'specialist_design_procurement_release', t2RhythmTemplateId: 't2-tod-rail-protection-transfer-deck-readiness-rhythm-v1', predecessorCodes: ['BTMP-BASE-01'], dependencyType: 'SS', lagDays: 0, executionNature: 'technical_preparation', tags: ['tod_upper_cover', 'design_release', 'procurement'] },
    { code: 'BTMP-TOD-P02', title: '轨交接口、电梯及消防设备订货排产、厂家FAT与分批到货', executionPhase: 'startup_site_setup', executionLane: 'tod_interface_delivery', startOffsetDays: 60, durationDays: 180, durationAssetStableCode: 'long_lead_equipment_manufacture_delivery', t2RhythmTemplateId: 't2-tod-rail-protection-transfer-deck-readiness-rhythm-v1', predecessorCodes: ['BTMP-TOD-P01'], dependencyType: 'FS', lagDays: 0, executionNature: 'technical_preparation', tags: ['tod_upper_cover', 'long_lead', 'fat', 'delivery'] },
    { code: 'BTMP-TOD-01', title: '运营线保护监测与临时防护体系完成', executionPhase: 'startup_site_setup', executionLane: 'rail_operation_protection', startOffsetDays: 0, durationDays: 55, tags: ['tod_upper_cover', 'rail_monitoring'] },
    { code: 'BTMP-TOD-02', title: '轨交保护与转换层结构施工', executionPhase: 'superstructure_rhythm', executionLane: 'rail_protection_transfer', startOffsetDays: 210, durationDays: 140, predecessorRules: [{ code: 'BTMP-TOD-01', dependencyType: 'FS', lagDays: 2, intentCode: 'tod_rail_protection_release' }, { code: 'BTMP-BASE-04', dependencyType: 'FS', lagDays: 0, intentCode: 'tod_below_grade_structure_to_transfer_deck' }], tags: ['tod_upper_cover', 'rail_protection'] },
    { code: 'BTMP-TOD-03', title: '上盖塔楼结构与商业裙房穿插', executionPhase: 'superstructure_rhythm', executionLane: 'podium_tower', startOffsetDays: 165, durationDays: 180, predecessorCodes: ['BTMP-TOD-02'], tags: ['tod_upper_cover', 'tower'] },
    { code: 'BTMP-TOD-04', title: '商业公区装修与裙房运营界面收口', executionPhase: 'interior_fitout_terminal', executionLane: 'commercial_public_fitout', startOffsetDays: 285, durationDays: 115, predecessorCodes: ['BTMP-TOD-03'], tags: ['tod_upper_cover', 'commercial_fitout'] },
    { code: 'BTMP-TOD-04A', title: '上盖塔楼二次结构、外围护与机电安装穿插', executionPhase: 'mep_roughin', executionLane: 'upper_tower_secondary_envelope_mep', startOffsetDays: 285, durationDays: 240, durationAssetStableCode: 'mep_plumbing_fire_pipe', t2RhythmTemplateId: 't2-tod-upper-cover-mep-interface-rhythm-v1', predecessorRules: [{ code: 'BTMP-TOD-03', dependencyType: 'SS', lagDays: 120, intentCode: 'tod_upper_tower_trade_interleave' }, { code: 'BTMP-TOD-P02', dependencyType: 'FS', lagDays: 0, intentCode: 'business_type_long_lead_delivery_release' }], tags: ['tod_upper_cover', 'tower', 'secondary_structure', 'envelope', 'mep'] },
    { code: 'BTMP-TOD-04B', title: '上盖塔楼精装收口与分栋移交', executionPhase: 'interior_fitout_terminal', executionLane: 'upper_tower_fitout_handover', startOffsetDays: 435, durationDays: 180, durationAssetStableCode: 'interior_public_finish', t2RhythmTemplateId: 't2-tod-upper-cover-podium-public-fitout-rhythm-v1', predecessorRules: [{ code: 'BTMP-TOD-04A', dependencyType: 'SS', lagDays: 150, intentCode: 'tod_upper_tower_fitout_interleave' }, { code: 'BTMP-TOD-03', dependencyType: 'FF', lagDays: 120, intentCode: 'tod_upper_tower_structure_to_fitout_closeout' }], tags: ['tod_upper_cover', 'tower', 'fitout', 'sectional_handover'] },
    { code: 'BTMP-TOD-05', title: '轨交接口机电消防与商业公区安装', executionPhase: 'mep_roughin', executionLane: 'rail_interface_mep', startOffsetDays: 250, durationDays: 130, predecessorCodes: ['BTMP-TOD-02'], predecessorRules: [{ code: 'BTMP-TOD-P02', dependencyType: 'FS', lagDays: 0, intentCode: 'business_type_long_lead_delivery_release' }], tags: ['tod_upper_cover', 'interface'] },
    { code: 'BTMP-TOD-06', title: '轨交接口验收与分区移交', executionPhase: 'acceptance_handover', executionLane: 'rail_interface_acceptance', startOffsetDays: 615, durationDays: 45, predecessorCodes: ['BTMP-TOD-04', 'BTMP-TOD-05'], predecessorRules: [{ code: 'BTMP-TOD-04B', dependencyType: 'FS', lagDays: 0, intentCode: 'tod_upper_tower_sectional_handover_to_final_acceptance' }], dependencyType: 'FS', lagDays: 0, tags: ['tod_upper_cover', 'handover'] },
  ],
  renovation: [
    { code: 'BTMP-RNV-01', title: '既有结构检测鉴定与拆改准备', executionPhase: 'startup_site_setup', executionLane: 'renovation_survey', startOffsetDays: 0, durationDays: 30, durationAssetStableCode: 'expert_domain_renovation_retrofit', t2RhythmTemplateId: 't2-renovation-occupied-zone-decanting-cutover-rhythm-v1', tags: ['renovation', 'survey'] },
    { code: 'BTMP-RNV-P01', title: '改造机电、消防及运营切换设备深化与采购释放', executionPhase: 'startup_site_setup', executionLane: 'renovation_procurement', startOffsetDays: 30, durationDays: 60, durationAssetStableCode: 'specialist_design_procurement_release', t2RhythmTemplateId: 't2-renovation-occupied-zone-decanting-cutover-rhythm-v1', predecessorRules: [{ code: 'BTMP-RNV-01', dependencyType: 'FS', lagDays: 0, intentCode: 'renovation_existing_condition_release' }], executionNature: 'technical_preparation', tags: ['renovation', 'design_release', 'procurement'] },
    { code: 'BTMP-RNV-P02', title: '改造机电消防设备订货排产、厂家验收与分批到货', executionPhase: 'startup_site_setup', executionLane: 'renovation_equipment_delivery', startOffsetDays: 90, durationDays: 150, durationAssetStableCode: 'long_lead_equipment_manufacture_delivery', t2RhythmTemplateId: 't2-renovation-occupied-zone-decanting-cutover-rhythm-v1', predecessorRules: [{ code: 'BTMP-RNV-P01', dependencyType: 'FS', lagDays: 0, intentCode: 'business_type_long_lead_delivery_release' }], executionNature: 'technical_preparation', tags: ['renovation', 'long_lead', 'delivery'] },
    { code: 'BTMP-RNV-02', title: '临时导改与运营保护分区实施', executionPhase: 'startup_site_setup', executionLane: 'temporary_diversion', startOffsetDays: 20, durationDays: 45, durationAssetStableCode: 'expert_domain_renovation_retrofit', t2RhythmTemplateId: 't2-renovation-occupied-zone-decanting-cutover-rhythm-v1', predecessorCodes: ['BTMP-RNV-01'], tags: ['renovation', 'diversion', 'protection'] },
    { code: 'BTMP-RNV-03', title: '分区拆改与结构加固施工', executionPhase: 'superstructure_rhythm', executionLane: 'structural_retrofit', startOffsetDays: 55, durationDays: 120, predecessorCodes: ['BTMP-RNV-02'], tags: ['renovation', 'retrofit'] },
    { code: 'BTMP-RNV-04', title: '机电更新与装修恢复施工', executionPhase: 'interior_fitout_terminal', executionLane: 'renovation_fitout', startOffsetDays: 145, durationDays: 130, predecessorCodes: ['BTMP-RNV-03'], predecessorRules: [{ code: 'BTMP-RNV-P02', dependencyType: 'FS', lagDays: 0, intentCode: 'business_type_long_lead_delivery_release' }], tags: ['renovation', 'fitout'] },
    { code: 'BTMP-RNV-05', title: '消防机电联调与分区恢复验收', executionPhase: 'commissioning', executionLane: 'fire_mep_commissioning', startOffsetDays: 270, durationDays: 45, predecessorCodes: ['BTMP-RNV-04'], dependencyType: 'FS', lagDays: 0, tags: ['renovation', 'fire_mep', 'commissioning'] },
    { code: 'BTMP-RNV-06', title: '分区验收与运营恢复移交', executionPhase: 'acceptance_handover', executionLane: 'renovation_handover', startOffsetDays: 310, durationDays: 35, predecessorCodes: ['BTMP-RNV-05'], dependencyType: 'FS', lagDays: 0, tags: ['renovation', 'handover'] },
  ],
  modular_building: [
    { code: 'BTMP-MOD-01', title: '模块深化设计与工厂样板确认', executionPhase: 'startup_site_setup', executionLane: 'modular_factory', startOffsetDays: 0, durationDays: 45, durationAssetStableCode: 'site_setup_temp_works', t2RhythmTemplateId: 't2-modular-building-factory-lot-site-assembly-rhythm-v1', tags: ['modular_building', 'factory'] },
    { code: 'BTMP-MOD-P01', title: '模块主要材料、部品与机电设备定版深化及采购释放', executionPhase: 'startup_site_setup', executionLane: 'modular_procurement', startOffsetDays: 45, durationDays: 60, durationAssetStableCode: 'specialist_design_procurement_release', t2RhythmTemplateId: 't2-modular-building-factory-lot-site-assembly-rhythm-v1', predecessorCodes: ['BTMP-MOD-01'], dependencyType: 'FS', lagDays: 0, executionNature: 'technical_preparation', tags: ['modular_building', 'design_release', 'procurement'] },
    { code: 'BTMP-MOD-P02', title: '模块运输路线踏勘、通行许可与吊装物流方案深化确认', executionPhase: 'startup_site_setup', executionLane: 'modular_transport_logistics', startOffsetDays: 0, durationDays: 60, durationAssetStableCode: 'specialist_design_procurement_release', t2RhythmTemplateId: 't2-modular-building-factory-lot-site-assembly-rhythm-v1', predecessorCodes: ['BTMP-MOD-01'], dependencyType: 'SS', lagDays: 0, executionNature: 'technical_preparation', tags: ['modular_building', 'transport_route', 'lifting_logistics'] },
    { code: 'BTMP-MOD-02', title: '模块工厂批量生产与出厂验收', executionPhase: 'superstructure_rhythm', executionLane: 'factory_production', startOffsetDays: 105, durationDays: 100, durationAssetStableCode: 'pc_component_hoisting', t2RhythmTemplateId: 't2-modular-building-factory-lot-site-assembly-rhythm-v1', predecessorCodes: ['BTMP-MOD-01'], predecessorRules: [{ code: 'BTMP-MOD-P01', dependencyType: 'FS', lagDays: 0, intentCode: 'modular_procurement_release' }], tags: ['modular_building', 'factory_production'] },
    { code: 'BTMP-MOD-03', title: '模块基础与吊装道路准备', executionPhase: 'foundation_pit_pile', executionLane: 'modular_site', startOffsetDays: 45, durationDays: 70, durationAssetStableCode: 'foundation_pit_retaining_support', t2RhythmTemplateId: 't2-modular-building-site-foundation-anchor-readiness-rhythm-v1', predecessorCodes: ['BTMP-MOD-01'], tags: ['modular_building', 'foundation', 'hoisting_road'] },
    { code: 'BTMP-MOD-04', title: '模块单元运输吊装与结构连接', executionPhase: 'superstructure_rhythm', executionLane: 'modular_hoisting', startOffsetDays: 205, durationDays: 85, durationAssetStableCode: 'pc_component_hoisting', t2RhythmTemplateId: 't2-modular-building-factory-lot-site-assembly-rhythm-v1', predecessorCodes: ['BTMP-MOD-02', 'BTMP-MOD-03'], predecessorRules: [{ code: 'BTMP-MOD-P02', dependencyType: 'FS', lagDays: 0, intentCode: 'modular_transport_logistics_release' }], tags: ['modular_building', 'hoisting'] },
    { code: 'BTMP-MOD-05', title: '模块围护防水与拼缝封闭', executionPhase: 'envelope_roof_facade', executionLane: 'modular_envelope_waterproof', startOffsetDays: 195, durationDays: 70, durationAssetStableCode: 'curtain_wall_installation', t2RhythmTemplateId: 't2-modular-building-stacked-module-envelope-closeout-rhythm-v1', predecessorCodes: ['BTMP-MOD-04'], tags: ['modular_building', 'envelope', 'waterproof'] },
    { code: 'BTMP-MOD-06', title: '模块拼缝机电接驳与系统贯通', executionPhase: 'mep_roughin', executionLane: 'modular_mep_connection', startOffsetDays: 235, durationDays: 60, durationAssetStableCode: 'mep_plumbing_fire_pipe', t2RhythmTemplateId: 't2-modular-building-factory-lot-site-assembly-rhythm-v1', predecessorCodes: ['BTMP-MOD-05'], tags: ['modular_building', 'mep'] },
    { code: 'BTMP-MOD-07', title: '模块内装收口与设备末端安装', executionPhase: 'interior_fitout_terminal', executionLane: 'modular_fitout_terminal', startOffsetDays: 260, durationDays: 60, durationAssetStableCode: 'interior_public_finish', t2RhythmTemplateId: 't2-modular-building-factory-lot-site-assembly-rhythm-v1', predecessorCodes: ['BTMP-MOD-05', 'BTMP-MOD-06'], tags: ['modular_building', 'fitout'] },
    { code: 'BTMP-MOD-08', title: '室外管网场坪与吊装道路恢复', executionPhase: 'outdoor_municipal_landscape', executionLane: 'modular_outdoor', startOffsetDays: 280, durationDays: 45, durationAssetStableCode: 'outdoor_utilities', t2RhythmTemplateId: 't2-modular-building-factory-lot-site-assembly-rhythm-v1', predecessorCodes: ['BTMP-MOD-04'], tags: ['modular_building', 'outdoor'] },
    { code: 'BTMP-MOD-09', title: '模块单体调试与系统联合调试', executionPhase: 'commissioning', executionLane: 'modular_commissioning', startOffsetDays: 310, durationDays: 45, durationAssetStableCode: 'integrated_commissioning', t2RhythmTemplateId: 't2-modular-building-factory-lot-site-assembly-rhythm-v1', predecessorCodes: ['BTMP-MOD-06', 'BTMP-MOD-07', 'BTMP-MOD-08'], tags: ['modular_building', 'commissioning'] },
    { code: 'BTMP-MOD-10', title: '模块整体调试移交、专项验收与竣工交付', executionPhase: 'acceptance_handover', executionLane: 'modular_handover', startOffsetDays: 350, durationDays: 30, durationAssetStableCode: 'integrated_commissioning', t2RhythmTemplateId: 't2-modular-building-factory-lot-site-assembly-rhythm-v1', predecessorCodes: ['BTMP-MOD-09'], dependencyType: 'FS', lagDays: 0, tags: ['modular_building', 'handover'] },
  ],
}



export type ProjectOrganizationVariantActivityOverride = Pick<BusinessTypeMasterPlanActivity, 'code' | 'title'>
  & Partial<Pick<
    BusinessTypeMasterPlanActivity,
    | 'executionPhase'
    | 'executionLane'
    | 'startOffsetDays'
    | 'durationDays'
    | 'durationAssetStableCode'
    | 't2RhythmTemplateId'
    | 'predecessorCodes'
    | 'predecessorRules'
    | 'dependencyType'
    | 'lagDays'
    | 'tags'
  >>



export const PROJECT_ORGANIZATION_VARIANT_MASTER_PLAN_ACTIVITY_OVERRIDES: Record<
  string,
  ProjectOrganizationVariantActivityOverride[]
> = {
  general_civil_mixed_use_complex: [
    { code: 'BTMP-GCV-P01', title: '多业态幕墙、电梯、智能化及精装系统深化与采购释放', tags: ['mixed_use_complex', 'multi_system_design_release'] },
    { code: 'BTMP-GCV-P02', title: '多业态幕墙构件、电梯及运营设备排产、FAT与分批到货', tags: ['mixed_use_complex', 'multi_system_long_lead'] },
    { code: 'BTMP-GCV-01', title: '共享地下室、商业裙房与多业态塔楼结构分区移交', executionLane: 'shared_podium_mixed_use_tower_structure', durationDays: 155, tags: ['mixed_use_complex', 'shared_podium', 'multi_tower'] },
    { code: 'BTMP-GCV-02', title: '住宅办公商业幕墙、屋面防水与多界面封闭收口', executionLane: 'mixed_use_facade_enclosure', durationDays: 135, tags: ['mixed_use_complex', 'multi_facade_interface'] },
    { code: 'BTMP-GCV-03', title: '多业态机电、消防、智能化主干及计量系统安装', executionLane: 'mixed_use_mep_fire_intelligent', durationDays: 165, tags: ['mixed_use_complex', 'multi_system_mep'] },
    { code: 'BTMP-GCV-04', title: '住宅样板、办公标准层与商业公区分业态精装', executionLane: 'mixed_use_fitout', durationDays: 175, tags: ['mixed_use_complex', 'multi_use_fitout'] },
    { code: 'BTMP-GCV-05', title: '分区电梯、楼控、安防与多业态运营系统安装调试', executionLane: 'mixed_use_vertical_operation_systems', durationDays: 125, tags: ['mixed_use_complex', 'zoned_operation_systems'] },
    { code: 'BTMP-GCV-06', title: '多业态租户界面、公区精装收口与导向泛光施工', executionLane: 'mixed_use_tenant_public_closeout', durationDays: 110, tags: ['mixed_use_complex', 'tenant_interface', 'public_closeout'] },
    { code: 'BTMP-GCV-07', title: '多业态机电消防智能化联调与分期开业条件验证', executionLane: 'mixed_use_phased_opening_commissioning', durationDays: 75, tags: ['mixed_use_complex', 'phased_opening', 'commissioning'] },
    { code: 'BTMP-GCV-08', title: '分业态专项验收、分期竣工验收及运营移交', executionLane: 'mixed_use_phased_handover', durationDays: 55, tags: ['mixed_use_complex', 'phased_acceptance', 'operation_handover'] },
  ],
  renovation_seismic_reinforcement: [
    { code: 'BTMP-RNV-01', title: '既有结构抗震鉴定、构件检测与加固范围确认', durationDays: 40, durationAssetStableCode: 'expert_domain_renovation_retrofit', tags: ['seismic_retrofit', 'appraisal'] },
    { code: 'BTMP-RNV-P01', title: '抗震加固材料、植筋粘钢及临时支撑深化与采购释放', tags: ['seismic_retrofit', 'design_release'] },
    { code: 'BTMP-RNV-P02', title: '型钢、钢板、碳纤维及锚固材料排产、检验与分批到货', tags: ['seismic_retrofit', 'long_lead'] },
    { code: 'BTMP-RNV-02', title: '临时支撑、构件卸载与加固样板分区实施', durationDays: 55, durationAssetStableCode: 'expert_domain_renovation_retrofit', tags: ['seismic_retrofit', 'temporary_support', 'mockup'] },
    { code: 'BTMP-RNV-03', title: '分区植筋、粘钢、碳纤维与结构构件加固补强施工', executionLane: 'seismic_reinforcement_workface', durationDays: 140, durationAssetStableCode: 'expert_domain_renovation_retrofit', t2RhythmTemplateId: 't2-renovation-structural-reinforcement-envelope-rhythm-v1', predecessorCodes: [], predecessorRules: [{ code: 'BTMP-RNV-S02', dependencyType: 'FS', lagDays: 0, intentCode: 'seismic_mockup_release_to_batch_reinforcement' }, { code: 'BTMP-RNV-P02', dependencyType: 'FF', lagDays: 0, intentCode: 'seismic_full_material_delivery_before_reinforcement_completion' }], tags: ['seismic_retrofit', 'structural_reinforcement'] },
    { code: 'BTMP-RNV-04', title: '抗震加固影响面机电迁改、装修恢复与节点修复', executionLane: 'seismic_retrofit_finish_restore', durationDays: 105, durationAssetStableCode: 'interior_public_finish', predecessorCodes: [], predecessorRules: [{ code: 'BTMP-RNV-S03', dependencyType: 'FS', lagDays: 0, intentCode: 'seismic_hidden_acceptance_to_finish_restore' }], tags: ['seismic_retrofit', 'mep_relocation', 'finish_restore'] },
    { code: 'BTMP-RNV-05', title: '加固构件承载复测、结构鉴定闭合与问题销项', executionLane: 'seismic_capacity_retest', durationDays: 50, durationAssetStableCode: 'expert_domain_renovation_retrofit', t2RhythmTemplateId: 't2-renovation-structural-reinforcement-envelope-rhythm-v1', tags: ['seismic_retrofit', 'capacity_retest'] },
    { code: 'BTMP-RNV-06', title: '抗震加固专项验收、资料闭合与使用移交', executionLane: 'seismic_acceptance_handover', durationDays: 40, durationAssetStableCode: 'integrated_commissioning', t2RhythmTemplateId: 't2-renovation-structural-reinforcement-envelope-rhythm-v1', tags: ['seismic_retrofit', 'special_acceptance', 'handover'] },
  ],
  renovation_energy_retrofit: [
    { code: 'BTMP-RNV-01', title: '既有建筑节能改造能效诊断、围护热工与机电测评', durationDays: 35, durationAssetStableCode: 'expert_domain_renovation_retrofit', tags: ['energy_retrofit', 'energy_audit'] },
    { code: 'BTMP-RNV-P01', title: '保温、节能外窗、高效机电与能耗监测系统深化及采购释放', tags: ['energy_retrofit', 'design_release'] },
    { code: 'BTMP-RNV-P02', title: '节能外窗、保温材料、高效机组与计量设备排产、FAT及到货', tags: ['energy_retrofit', 'long_lead'] },
    { code: 'BTMP-RNV-02', title: '节能改造样板、运营保护与围护拆改分区实施', durationDays: 50, durationAssetStableCode: 'expert_domain_renovation_retrofit', tags: ['energy_retrofit', 'mockup', 'operation_protection'] },
    { code: 'BTMP-RNV-03', title: '外墙保温、节能外窗与外立面气密收口', executionPhase: 'envelope_roof_facade', executionLane: 'energy_envelope_retrofit', durationDays: 90, durationAssetStableCode: 'exterior_insulation_finish', t2RhythmTemplateId: 't2-renovation-structural-reinforcement-envelope-rhythm-v1', predecessorRules: [{ code: 'BTMP-RNV-02', dependencyType: 'FS', lagDays: 0, intentCode: 'energy_envelope_workface_release' }, { code: 'BTMP-RNV-P02', dependencyType: 'SS', lagDays: 90, intentCode: 'energy_envelope_first_batch_delivery_release' }], tags: ['energy_retrofit', 'insulation', 'energy_window'] },
    { code: 'BTMP-RNV-04', title: '高效机电、照明控制、计量与能耗监测系统改造', executionPhase: 'mep_roughin', executionLane: 'energy_mep_metering', durationDays: 125, durationAssetStableCode: 'mep_plumbing_fire_pipe', predecessorCodes: [], predecessorRules: [{ code: 'BTMP-RNV-03', dependencyType: 'SS', lagDays: 45, intentCode: 'energy_envelope_to_mep_workface' }, { code: 'BTMP-RNV-P02', dependencyType: 'SS', lagDays: 90, intentCode: 'energy_mep_first_batch_delivery_release' }], tags: ['energy_retrofit', 'high_efficiency_mep', 'metering'] },
    { code: 'BTMP-RNV-05', title: '围护性能复测、机电联调与建筑能耗验证', executionLane: 'energy_performance_validation', durationDays: 55, durationAssetStableCode: 'integrated_commissioning', predecessorCodes: [], predecessorRules: [{ code: 'BTMP-RNV-E01', dependencyType: 'FS', lagDays: 0, intentCode: 'energy_roof_completion_to_performance_validation' }, { code: 'BTMP-RNV-04', dependencyType: 'FS', lagDays: 0, intentCode: 'energy_mep_completion_to_performance_validation' }], tags: ['energy_retrofit', 'performance_test', 'commissioning'] },
    { code: 'BTMP-RNV-06', title: '节能专项验收、运行能效确认与使用移交', executionLane: 'energy_acceptance_handover', durationDays: 40, durationAssetStableCode: 'integrated_commissioning', t2RhythmTemplateId: 't2-renovation-structural-reinforcement-envelope-rhythm-v1', tags: ['energy_retrofit', 'energy_acceptance', 'handover'] },
  ],
  renovation_heritage_conservation: [
    { code: 'BTMP-RNV-01', title: '文保本体精细测绘、病害调查与保护边界确认', durationDays: 45, durationAssetStableCode: 'expert_domain_heritage_preservation', tags: ['heritage_conservation', 'survey', 'disease_investigation'] },
    { code: 'BTMP-RNV-P01', title: '文保传统材料、可逆加固与隐蔽机电深化及采购释放', tags: ['heritage_conservation', 'design_release'] },
    { code: 'BTMP-RNV-P02', title: '传统木石瓦作、灰浆颜料与隐蔽设备封样、试配及分批到货', tags: ['heritage_conservation', 'traditional_material', 'delivery'] },
    { code: 'BTMP-RNV-02', title: '文保本体临时保护、可逆支撑与样板试修确认', durationDays: 60, durationAssetStableCode: 'expert_domain_heritage_preservation', tags: ['heritage_conservation', 'reversible_support', 'trial_repair'] },
    { code: 'BTMP-RNV-03', title: '木作、砖石、瓦作与结构构件分区传统工艺修缮', executionLane: 'heritage_traditional_craft_repair', durationDays: 155, durationAssetStableCode: 'expert_domain_heritage_preservation', t2RhythmTemplateId: 't2-renovation-structural-reinforcement-envelope-rhythm-v1', predecessorCodes: [], predecessorRules: [{ code: 'BTMP-RNV-H01', dependencyType: 'FS', lagDays: 0, intentCode: 'heritage_material_mockup_to_traditional_craft_repair' }, { code: 'BTMP-RNV-P02', dependencyType: 'FF', lagDays: 0, intentCode: 'heritage_full_material_delivery_before_craft_completion' }], tags: ['heritage_conservation', 'traditional_craft', 'structural_repair'] },
    { code: 'BTMP-RNV-04', title: '彩绘油饰、灰塑线脚与隐蔽机电最小干预修复', executionLane: 'heritage_finish_mep_repair', durationDays: 165, durationAssetStableCode: 'expert_domain_heritage_preservation', t2RhythmTemplateId: 't2-renovation-structural-reinforcement-envelope-rhythm-v1', predecessorCodes: [], predecessorRules: [{ code: 'BTMP-RNV-H02', dependencyType: 'FS', lagDays: 0, intentCode: 'heritage_hidden_acceptance_to_finish_repair' }], tags: ['heritage_conservation', 'painted_decoration', 'minimal_intervention'] },
    { code: 'BTMP-RNV-05', title: '文保修缮监测、传统材料复核与专家意见销项', executionLane: 'heritage_expert_review_closeout', durationDays: 60, durationAssetStableCode: 'expert_domain_heritage_preservation', t2RhythmTemplateId: 't2-renovation-structural-reinforcement-envelope-rhythm-v1', tags: ['heritage_conservation', 'monitoring', 'expert_review'] },
    { code: 'BTMP-RNV-06', title: '文保专项验收、保护档案移交与开放恢复', executionLane: 'heritage_acceptance_opening', durationDays: 45, durationAssetStableCode: 'expert_domain_heritage_preservation', t2RhythmTemplateId: 't2-renovation-structural-reinforcement-envelope-rhythm-v1', tags: ['heritage_conservation', 'heritage_acceptance', 'archive_handover', 'opening'] },
  ],
  industrial_logistics_automation: [
    { code: 'BTMP-IND-P01', title: '仓储自动化、货架与物流运营系统深化及采购释放' },
    { code: 'BTMP-IND-P02', title: '货架、堆垛机、输送分拣、AGV及WMS/WCS排产、FAT与分批到货' },
    { code: 'BTMP-IND-03', title: '超平地坪、货架基础与自动化接口施工', executionLane: 'logistics_floor_automation_interface', durationDays: 110, durationAssetStableCode: 'expert_domain_industrial_logistics_automation', tags: ['logistics', 'superflat_floor', 'automation_interface'] },
    { code: 'BTMP-IND-04', title: '高位货架、堆垛机、输送分拣及AGV系统安装联调', executionLane: 'warehouse_automation_installation', durationDays: 120, durationAssetStableCode: 'expert_domain_industrial_logistics_automation', tags: ['logistics', 'asrs', 'agv', 'installation'] },
    { code: 'BTMP-IND-05', title: '装卸月台、重载通道与仓储运营配套施工', executionLane: 'warehouse_yard_dock', durationDays: 80, durationAssetStableCode: 'expert_domain_industrial_logistics_automation', tags: ['logistics', 'dock', 'traffic'] },
    { code: 'BTMP-IND-06', title: 'WMS/WCS集成、峰值吞吐验证与仓储运营移交', executionLane: 'warehouse_operation_validation', durationDays: 60, durationAssetStableCode: 'expert_domain_industrial_logistics_automation', tags: ['logistics', 'wms_wcs', 'trial_operation', 'handover'] },
  ],
  industrial_process_validation: [
    { code: 'BTMP-IND-P01', title: '洁净围护、高纯介质、工艺设备与验证系统深化及采购释放' },
    { code: 'BTMP-IND-P02', title: '洁净围护、高纯介质与工艺设备排产、FAT及分批到货' },
    { code: 'BTMP-IND-03', title: '受控生产环境围护与工艺区封闭', executionLane: 'controlled_environment_enclosure', durationDays: 120, durationAssetStableCode: 'expert_domain_industrial_process_validation', tags: ['process', 'controlled_environment', 'enclosure'] },
    { code: 'BTMP-IND-04', title: '高纯介质、洁净公用系统安装与工艺验证', executionLane: 'clean_utility_validation', durationDays: 140, durationAssetStableCode: 'expert_domain_industrial_process_validation', tags: ['process', 'clean_utility', 'iq_oq'] },
    { code: 'BTMP-IND-05', title: '工艺地面、防腐排水与洁净收口施工', executionLane: 'process_floor_clean_closeout', durationDays: 90, durationAssetStableCode: 'expert_domain_industrial_process_validation', tags: ['process', 'clean_finish', 'drainage'] },
    { code: 'BTMP-IND-06', title: 'PQ验证、试生产放行与生产运营移交', executionLane: 'process_qualification_handover', durationDays: 90, durationAssetStableCode: 'expert_domain_industrial_process_validation', tags: ['process', 'pq', 'trial_production', 'handover'] },
  ],
  industrial_heavy_equipment: [
    { code: 'BTMP-IND-P01', title: '重型设备基础、吊装运输与起重系统深化及采购释放' },
    { code: 'BTMP-IND-P02', title: '重型设备、桥式起重与大件运输排产、预装FAT及分批到货' },
    { code: 'BTMP-IND-03', title: '重型设备基础、吊装通道与起重系统投用', executionLane: 'heavy_foundation_lift_path', durationDays: 130, durationAssetStableCode: 'expert_domain_industrial_heavy_equipment', tags: ['heavy_equipment', 'foundation', 'lifting_route'] },
    { code: 'BTMP-IND-04', title: '重型设备吊装就位、精调灌浆与负荷试验', executionLane: 'heavy_equipment_alignment', durationDays: 120, durationAssetStableCode: 'expert_domain_industrial_heavy_equipment', tags: ['heavy_equipment', 'alignment', 'grouting', 'load_trial'] },
    { code: 'BTMP-IND-05', title: '重载物流通道、装卸区与安全防护施工', executionLane: 'heavy_logistics_route', durationDays: 80, durationAssetStableCode: 'expert_domain_industrial_heavy_equipment', tags: ['heavy_equipment', 'logistics_route', 'safety'] },
    { code: 'BTMP-IND-06', title: '公辅联动、重载试车与投产移交', executionLane: 'heavy_load_trial_handover', durationDays: 70, durationAssetStableCode: 'expert_domain_industrial_heavy_equipment', tags: ['heavy_equipment', 'load_trial', 'handover'] },
  ],
  transportation_rail_station: [
    { code: 'BTMP-TRH-P01', title: '铁路站房、站台雨棚、营业线保护与客运系统深化及采购释放' },
    { code: 'BTMP-TRH-P02', title: '站台雨棚、站台门与客运系统排产、预拼装FAT及分批到货' },
    { code: 'BTMP-TRH-01', title: '铁路站房、站台雨棚与营业线保护施工', executionLane: 'rail_station_trackside_work', durationDays: 145, durationAssetStableCode: 'expert_domain_transportation_rail_station', tags: ['rail_station', 'trackside', 'platform_canopy'] },
    { code: 'BTMP-TRH-03', title: '铁路客运、通信时钟与站台运营系统安装', executionLane: 'rail_passenger_systems', durationDays: 135, durationAssetStableCode: 'expert_domain_transportation_rail_station', tags: ['rail_station', 'passenger_system', 'platform'] },
    { code: 'BTMP-TRH-04', title: '站厅站台旅客流线、导向与客运服务设施施工', executionLane: 'rail_passenger_flow', durationDays: 100, durationAssetStableCode: 'expert_domain_transportation_rail_station', tags: ['rail_station', 'passenger_flow', 'fitout'] },
    { code: 'BTMP-TRH-05', title: '站台门、客运设备与铁路运营系统联调', executionLane: 'rail_platform_operation_interface', durationDays: 60, durationAssetStableCode: 'expert_domain_transportation_rail_station', t2RhythmTemplateId: 't2-transport-hub-platform-canopy-trackside-interface-rhythm-v1', tags: ['rail_station', 'platform_interface', 'commissioning'] },
    { code: 'BTMP-TRH-05A', title: '铁路旅客组织、应急处置与高峰客流全流程演练', executionLane: 'rail_peak_flow_rehearsal', durationDays: 54, durationAssetStableCode: 'expert_domain_transportation_rail_station', tags: ['rail_station', 'peak_flow', 'rehearsal'] },
    { code: 'BTMP-TRH-06', title: '铁路运营场景试运行与运营单位移交', executionLane: 'rail_operator_handover', durationDays: 54, durationAssetStableCode: 'expert_domain_transportation_rail_station', tags: ['rail_station', 'trial_operation', 'handover'] },
  ],
  transportation_metro_interchange: [
    { code: 'BTMP-TRH-P01', title: '地铁运营保护、换乘通道与夜间改接系统深化及采购释放' },
    { code: 'BTMP-TRH-P02', title: '换乘设备、票务导向与系统改接设备排产、FAT及分批到货' },
    { code: 'BTMP-TRH-01', title: '既有地铁运营保护、换乘通道与夜间窗口施工', executionLane: 'metro_live_operation_work', durationDays: 175, durationAssetStableCode: 'expert_domain_transportation_metro_interchange', tags: ['metro', 'live_operation', 'night_window'] },
    { code: 'BTMP-TRH-03', title: '换乘票务、广播时钟与跨线运营系统安装', executionLane: 'metro_interchange_systems', durationDays: 150, durationAssetStableCode: 'expert_domain_transportation_metro_interchange', tags: ['metro', 'interchange', 'systems'] },
    { code: 'BTMP-TRH-04', title: '换乘厅通道、导向与跨线客流设施施工', executionLane: 'metro_transfer_passage', durationDays: 110, durationAssetStableCode: 'expert_domain_transportation_metro_interchange', tags: ['metro', 'transfer_passage', 'passenger_flow'] },
    { code: 'BTMP-TRH-05', title: '系统改接恢复与跨线换乘运营联调', executionLane: 'metro_system_cutover', durationDays: 75, durationAssetStableCode: 'expert_domain_transportation_metro_interchange', t2RhythmTemplateId: 't2-transport-hub-metro-night-window-transfer-rhythm-v1', tags: ['metro', 'cutover', 'commissioning'] },
    { code: 'BTMP-TRH-05A', title: '地铁高峰换乘、单线故障与应急疏散演练', executionLane: 'metro_peak_transfer_rehearsal', durationDays: 70, durationAssetStableCode: 'expert_domain_transportation_metro_interchange', t2RhythmTemplateId: 't2-transport-hub-metro-night-window-transfer-rhythm-v1', tags: ['metro', 'peak_flow', 'rehearsal'] },
    { code: 'BTMP-TRH-06', title: '地铁分阶段试运行、开通与运营移交', executionLane: 'metro_phased_opening', durationDays: 60, durationAssetStableCode: 'expert_domain_transportation_metro_interchange', t2RhythmTemplateId: 't2-transport-hub-metro-night-window-transfer-rhythm-v1', tags: ['metro', 'trial_operation', 'handover'] },
  ],
  transportation_bus_terminal: [
    { code: 'BTMP-TRH-P01', title: '汽车客运站房、场坪、充电与调度系统深化及采购释放' },
    { code: 'BTMP-TRH-P02', title: '充电、调度与客运设备排产、FAT及分批到货' },
    { code: 'BTMP-TRH-01', title: '汽车客运站房、发车位与停车坪施工', executionLane: 'bus_terminal_yard', durationDays: 120, durationAssetStableCode: 'expert_domain_transportation_bus_terminal', tags: ['bus_terminal', 'yard', 'station'] },
    { code: 'BTMP-TRH-03', title: '充电、车辆调度与客运服务系统安装', executionLane: 'bus_charging_dispatch', durationDays: 105, durationAssetStableCode: 'expert_domain_transportation_bus_terminal', tags: ['bus_terminal', 'charging', 'dispatch'] },
    { code: 'BTMP-TRH-04', title: '候车区、人车分流与交通导向设施施工', executionLane: 'bus_passenger_vehicle_flow', durationDays: 85, durationAssetStableCode: 'expert_domain_transportation_bus_terminal', tags: ['bus_terminal', 'passenger_flow', 'traffic'] },
    { code: 'BTMP-TRH-05', title: '充电、调度、消防与人车分流运营联调', executionLane: 'bus_operation_commissioning', durationDays: 50, durationAssetStableCode: 'expert_domain_transportation_bus_terminal', t2RhythmTemplateId: 't2-transport-hub-bus-yard-charging-rhythm-v1', tags: ['bus_terminal', 'charging', 'fire', 'commissioning'] },
    { code: 'BTMP-TRH-05A', title: '车辆满载通行、旅客组织与应急场景演练', executionLane: 'bus_fleet_rehearsal', durationDays: 45, durationAssetStableCode: 'expert_domain_transportation_bus_terminal', t2RhythmTemplateId: 't2-transport-hub-bus-yard-charging-rhythm-v1', tags: ['bus_terminal', 'fleet_trial', 'rehearsal'] },
    { code: 'BTMP-TRH-06', title: '汽车客运试运行与运营单位移交', executionLane: 'bus_operator_handover', durationDays: 40, durationAssetStableCode: 'expert_domain_transportation_bus_terminal', t2RhythmTemplateId: 't2-transport-hub-bus-yard-charging-rhythm-v1', tags: ['bus_terminal', 'trial_operation', 'handover'] },
  ],
  sports_culture_stadium: [
    { code: 'BTMP-SPC-P01', title: '大跨度屋盖、赛事照明、计时计分、转播及场地系统深化与采购释放', tags: ['sports_stadium', 'design_release', 'event_system'] },
    { code: 'BTMP-SPC-P02', title: '屋盖构件、赛事设备、座椅及运动面层排产、预拼装FAT与分批到货', tags: ['sports_stadium', 'long_lead', 'fat', 'delivery'] },
    { code: 'BTMP-SPC-01', title: '体育场看台碗区与大跨度屋盖结构施工', executionLane: 'stadium_bowl_roof_structure', durationDays: 165, durationAssetStableCode: 'expert_domain_sports_culture', tags: ['sports_stadium', 'bowl', 'long_span_roof', 'structure'] },
    { code: 'BTMP-SPC-02', title: '罩棚屋面、场馆外围护与排水系统闭水收口', executionLane: 'stadium_roof_envelope', durationDays: 105, tags: ['sports_stadium', 'roof_envelope', 'watertight'] },
    { code: 'BTMP-SPC-03', title: '赛事照明、计时计分、广播转播与场馆机电系统安装', executionLane: 'stadium_event_systems', durationDays: 135, durationAssetStableCode: 'expert_domain_sports_culture', tags: ['sports_stadium', 'sports_lighting', 'scoreboard', 'broadcast', 'mep'] },
    { code: 'BTMP-SPC-04', title: '看台座椅、运动场地与赛事功能空间施工', executionLane: 'stadium_field_stand_fitout', durationDays: 105, durationAssetStableCode: 'expert_domain_sports_culture', tags: ['sports_stadium', 'seating', 'competition_field', 'fitout'] },
    { code: 'BTMP-SPC-05', title: '场地性能、赛事系统、生命安全与人群组织综合联调', executionLane: 'stadium_integrated_commissioning', durationDays: 65, durationAssetStableCode: 'expert_domain_sports_culture', t2RhythmTemplateId: 't2-sports-culture-event-systems-commissioning-rhythm-v1', predecessorCodes: [], predecessorRules: [{ code: 'BTMP-SPC-S12', dependencyType: 'FS', lagDays: 0, intentCode: 'stadium_life_safety_test_to_integrated_commissioning' }, { code: 'BTMP-SPC-S13', dependencyType: 'FS', lagDays: 0, intentCode: 'stadium_field_event_system_test_to_integrated_commissioning' }, { code: 'BTMP-SPC-S14', dependencyType: 'FS', lagDays: 0, intentCode: 'stadium_event_precinct_to_integrated_commissioning' }], tags: ['sports_stadium', 'integrated_commissioning', 'crowd_operation'] },
    { code: 'BTMP-SPC-06', title: '赛事功能验收、满载演练与场馆运营移交', executionLane: 'stadium_event_handover', durationDays: 45, durationAssetStableCode: 'expert_domain_sports_culture', tags: ['sports_stadium', 'event_rehearsal', 'acceptance', 'handover'] },
  ],
  sports_culture_indoor_arena: [
    { code: 'BTMP-SPC-P01', title: '比赛场地、伸缩看台、计时计分与赛事系统深化及采购释放' },
    { code: 'BTMP-SPC-P02', title: '比赛场地、伸缩看台与赛事设备排产、预装FAT及分批到货' },
    { code: 'BTMP-SPC-01', title: '场馆碗区、看台及大跨度屋盖结构施工', executionLane: 'arena_bowl_structure', durationDays: 150, durationAssetStableCode: 'expert_domain_sports_indoor_arena', tags: ['arena', 'bowl', 'structure'] },
    { code: 'BTMP-SPC-03', title: '计时计分、广播电视与赛事保障系统安装', executionLane: 'arena_event_systems', durationDays: 120, durationAssetStableCode: 'expert_domain_sports_indoor_arena', tags: ['arena', 'event_system', 'broadcast'] },
    { code: 'BTMP-SPC-04', title: '比赛场地、伸缩看台与场馆转换系统施工', executionLane: 'arena_field_conversion', durationDays: 90, durationAssetStableCode: 'expert_domain_sports_indoor_arena', tags: ['arena', 'event_floor', 'retractable_seating'] },
    { code: 'BTMP-SPC-05', title: '赛事系统联调、多模式转换与满负荷演练', executionLane: 'arena_mode_rehearsal', durationDays: 60, durationAssetStableCode: 'expert_domain_sports_indoor_arena', tags: ['arena', 'mode_conversion', 'rehearsal'] },
    { code: 'BTMP-SPC-06', title: '赛事功能验收与场馆运营移交', executionLane: 'arena_operation_handover', durationDays: 40, durationAssetStableCode: 'expert_domain_sports_indoor_arena', tags: ['arena', 'acceptance', 'handover'] },
  ],
  sports_culture_theater: [
    { code: 'BTMP-SPC-P01', title: '舞台机械、建筑声学、灯光音响与演出系统深化及采购释放' },
    { code: 'BTMP-SPC-P02', title: '舞台机械、声学构造与演出设备排产、预装FAT及分批到货' },
    { code: 'BTMP-SPC-01', title: '观众厅、舞台塔及大跨度屋盖结构施工', executionLane: 'theater_shell_stage_tower', durationDays: 140, durationAssetStableCode: 'expert_domain_sports_theater', tags: ['theater', 'stage_tower', 'structure'] },
    { code: 'BTMP-SPC-03', title: '舞台机械、灯光音响、视频与演出控制系统安装', executionLane: 'theater_stage_systems', durationDays: 140, durationAssetStableCode: 'expert_domain_sports_theater', tags: ['theater', 'stage_machinery', 'show_control'] },
    { code: 'BTMP-SPC-04', title: '观众厅声学装修、舞台机械与演出系统安装', executionLane: 'theater_acoustic_fitout', durationDays: 120, durationAssetStableCode: 'expert_domain_sports_theater', tags: ['theater', 'acoustic', 'fitout'] },
    { code: 'BTMP-SPC-05', title: '声场调试、舞台安全联锁与带妆排演', executionLane: 'theater_performance_rehearsal', durationDays: 80, durationAssetStableCode: 'expert_domain_sports_theater', tags: ['theater', 'acoustic_tuning', 'rehearsal'] },
    { code: 'BTMP-SPC-06', title: '演出条件验收与剧院运营移交', executionLane: 'theater_operation_handover', durationDays: 50, durationAssetStableCode: 'expert_domain_sports_theater', tags: ['theater', 'acceptance', 'handover'] },
  ],
  sports_culture_exhibition: [
    { code: 'BTMP-SPC-P01', title: '藏品环境、展陈、专业照明与安防导览系统深化及采购释放' },
    { code: 'BTMP-SPC-P02', title: '恒温恒湿、展陈照明与安防设备排产、FAT及分批到货' },
    { code: 'BTMP-SPC-01', title: '展厅、藏品库房与大空间结构施工', executionLane: 'exhibition_shell_storage', durationDays: 130, durationAssetStableCode: 'expert_domain_sports_exhibition', tags: ['exhibition', 'collection_storage', 'structure'] },
    { code: 'BTMP-SPC-03', title: '恒温恒湿、环境监测、安防与智慧导览系统安装', executionLane: 'exhibition_environment_systems', durationDays: 125, durationAssetStableCode: 'expert_domain_sports_exhibition', tags: ['exhibition', 'environment', 'security'] },
    { code: 'BTMP-SPC-04', title: '藏品环境、展陈承载与专业照明施工', executionLane: 'exhibition_display_fitout', durationDays: 100, durationAssetStableCode: 'expert_domain_sports_exhibition', tags: ['exhibition', 'display', 'lighting'] },
    { code: 'BTMP-SPC-05', title: '恒温恒湿、安防导览联调与试开放', executionLane: 'exhibition_trial_opening', durationDays: 70, durationAssetStableCode: 'expert_domain_sports_exhibition', tags: ['exhibition', 'environment_validation', 'trial_opening'] },
    { code: 'BTMP-SPC-06', title: '策展验收、藏品接收条件确认与运营移交', executionLane: 'exhibition_operation_handover', durationDays: 45, durationAssetStableCode: 'expert_domain_sports_exhibition', tags: ['exhibition', 'curatorial_acceptance', 'handover'] },
  ],
}



export const PROJECT_ORGANIZATION_VARIANT_MASTER_PLAN_ADDITIONAL_ACTIVITIES: Record<
  string,
  BusinessTypeMasterPlanActivity[]
> = {
  sports_culture_stadium: [
    { code: 'BTMP-SPC-S01', title: '看台碗区斜梁、框架与分区结构移交', executionPhase: 'superstructure_rhythm', executionLane: 'stadium_bowl_structure', startOffsetDays: 155, durationDays: 105, durationAssetStableCode: 'expert_domain_sports_culture', t2RhythmTemplateId: 't2-sports-culture-longspan-envelope-event-rhythm-v1', predecessorRules: [{ code: 'BTMP-BASE-04', dependencyType: 'SS', lagDays: 45, intentCode: 'stadium_below_grade_to_bowl_structure_release' }], durationBaselineAuthority: 'project_organization_variant', projectOrganizationVariantCode: 'sports_culture_stadium', tags: ['sports_stadium', 'bowl', 'raker_beam', 'structure'] },
    { code: 'BTMP-SPC-S02', title: '预制看台板、疏散楼梯与环廊结构安装', executionPhase: 'superstructure_rhythm', executionLane: 'stadium_precast_terrace', startOffsetDays: 220, durationDays: 75, durationAssetStableCode: 'expert_domain_sports_culture', t2RhythmTemplateId: 't2-sports-culture-longspan-envelope-event-rhythm-v1', predecessorRules: [{ code: 'BTMP-SPC-S01', dependencyType: 'SS', lagDays: 45, intentCode: 'stadium_bowl_structure_to_precast_terrace_release' }], durationBaselineAuthority: 'project_organization_variant', projectOrganizationVariantCode: 'sports_culture_stadium', tags: ['sports_stadium', 'precast_terrace', 'egress_stair', 'concourse'] },
    { code: 'BTMP-SPC-S03', title: '大跨度屋盖卸载、合拢、索力变形监测与结构验收', executionPhase: 'superstructure_rhythm', executionLane: 'stadium_roof_unloading_acceptance', startOffsetDays: 300, durationDays: 30, durationAssetStableCode: 'expert_domain_sports_culture', t2RhythmTemplateId: 't2-sports-culture-longspan-envelope-event-rhythm-v1', predecessorRules: [{ code: 'BTMP-SPC-01', dependencyType: 'FS', lagDays: 0, intentCode: 'stadium_roof_structure_to_unloading_acceptance' }], durationBaselineAuthority: 'project_organization_variant', projectOrganizationVariantCode: 'sports_culture_stadium', tags: ['sports_stadium', 'roof_unloading', 'cable_force', 'structural_monitoring'] },
    { code: 'BTMP-SPC-S04', title: '比赛场地地下排水、灌溉与设备管线基层施工', executionPhase: 'outdoor_municipal_landscape', executionLane: 'stadium_field_underground_systems', startOffsetDays: 270, durationDays: 60, durationAssetStableCode: 'expert_domain_sports_culture', t2RhythmTemplateId: 't2-sports-culture-bowl-public-area-fitout-rhythm-v1', predecessorRules: [{ code: 'BTMP-SPC-S01', dependencyType: 'SS', lagDays: 70, intentCode: 'stadium_bowl_structure_to_field_underground_release' }], durationBaselineAuthority: 'project_organization_variant', projectOrganizationVariantCode: 'sports_culture_stadium', tags: ['sports_stadium', 'field_drainage', 'irrigation', 'underground_services'] },
    { code: 'BTMP-SPC-S05', title: '比赛场地基层、草坪或专业运动面层施工', executionPhase: 'outdoor_municipal_landscape', executionLane: 'stadium_competition_surface', startOffsetDays: 330, durationDays: 55, durationAssetStableCode: 'expert_domain_sports_culture', t2RhythmTemplateId: 't2-sports-culture-bowl-public-area-fitout-rhythm-v1', predecessorRules: [{ code: 'BTMP-SPC-S04', dependencyType: 'FS', lagDays: 0, intentCode: 'stadium_field_underground_to_competition_surface' }], durationBaselineAuthority: 'project_organization_variant', projectOrganizationVariantCode: 'sports_culture_stadium', tags: ['sports_stadium', 'competition_field', 'turf', 'sports_surface'] },
    { code: 'BTMP-SPC-S06', title: '跑道、热身区与场地体育设施安装', executionPhase: 'outdoor_municipal_landscape', executionLane: 'stadium_track_warmup_facilities', startOffsetDays: 335, durationDays: 50, durationAssetStableCode: 'expert_domain_sports_culture', t2RhythmTemplateId: 't2-sports-culture-bowl-public-area-fitout-rhythm-v1', predecessorRules: [{ code: 'BTMP-SPC-S04', dependencyType: 'FS', lagDays: 0, intentCode: 'stadium_field_underground_to_track_facilities' }], durationBaselineAuthority: 'project_organization_variant', projectOrganizationVariantCode: 'sports_culture_stadium', tags: ['sports_stadium', 'track', 'warmup_area', 'sports_equipment'] },
    { code: 'BTMP-SPC-S07', title: '固定座椅、看台栏杆与人群分隔设施安装', executionPhase: 'interior_fitout_terminal', executionLane: 'stadium_seating_crowd_barrier', startOffsetDays: 330, durationDays: 70, durationAssetStableCode: 'expert_domain_sports_culture', t2RhythmTemplateId: 't2-sports-culture-bowl-public-area-fitout-rhythm-v1', predecessorRules: [{ code: 'BTMP-SPC-S02', dependencyType: 'FS', lagDays: 0, intentCode: 'stadium_precast_terrace_to_seating_installation' }, { code: 'BTMP-SPC-02', dependencyType: 'SS', lagDays: 35, intentCode: 'stadium_envelope_progress_to_seating_release' }], durationBaselineAuthority: 'project_organization_variant', projectOrganizationVariantCode: 'sports_culture_stadium', tags: ['sports_stadium', 'seating', 'guardrail', 'crowd_barrier'] },
    { code: 'BTMP-SPC-S08', title: '运动员、裁判、媒体、贵宾与赛事运营空间装修', executionPhase: 'interior_fitout_terminal', executionLane: 'stadium_event_support_fitout', startOffsetDays: 335, durationDays: 85, durationAssetStableCode: 'expert_domain_sports_culture', t2RhythmTemplateId: 't2-sports-culture-bowl-public-area-fitout-rhythm-v1', predecessorRules: [{ code: 'BTMP-SPC-02', dependencyType: 'SS', lagDays: 35, intentCode: 'stadium_envelope_progress_to_event_support_fitout' }, { code: 'BTMP-SPC-03', dependencyType: 'SS', lagDays: 35, intentCode: 'stadium_mep_progress_to_event_support_fitout' }], durationBaselineAuthority: 'project_organization_variant', projectOrganizationVariantCode: 'sports_culture_stadium', tags: ['sports_stadium', 'athlete_area', 'media_area', 'vip_area', 'operation_space'] },
    { code: 'BTMP-SPC-S09', title: '比赛照明、高杆灯或马道灯具与场景控制安装', executionPhase: 'mep_roughin', executionLane: 'stadium_sports_lighting', startOffsetDays: 335, durationDays: 70, durationAssetStableCode: 'expert_domain_sports_culture', t2RhythmTemplateId: 't2-sports-culture-event-systems-commissioning-rhythm-v1', predecessorRules: [{ code: 'BTMP-SPC-S03', dependencyType: 'FS', lagDays: 0, intentCode: 'stadium_roof_acceptance_to_sports_lighting' }, { code: 'BTMP-SPC-P02', dependencyType: 'FS', lagDays: 0, intentCode: 'stadium_lighting_delivery_to_installation' }], durationBaselineAuthority: 'project_organization_variant', projectOrganizationVariantCode: 'sports_culture_stadium', tags: ['sports_stadium', 'sports_lighting', 'high_mast', 'scene_control'] },
    { code: 'BTMP-SPC-S10', title: '计时计分、扩声、广播电视与转播接口系统安装', executionPhase: 'mep_roughin', executionLane: 'stadium_scoreboard_broadcast', startOffsetDays: 340, durationDays: 75, durationAssetStableCode: 'expert_domain_sports_culture', t2RhythmTemplateId: 't2-sports-culture-event-systems-commissioning-rhythm-v1', predecessorRules: [{ code: 'BTMP-SPC-S03', dependencyType: 'FS', lagDays: 0, intentCode: 'stadium_roof_acceptance_to_scoreboard_broadcast' }, { code: 'BTMP-SPC-P02', dependencyType: 'FS', lagDays: 0, intentCode: 'stadium_event_system_delivery_to_installation' }], durationBaselineAuthority: 'project_organization_variant', projectOrganizationVariantCode: 'sports_culture_stadium', tags: ['sports_stadium', 'scoreboard', 'public_address', 'broadcast', 'timing'] },
    { code: 'BTMP-SPC-S11', title: '票务、安检、门禁、视频安防与客流导向系统安装', executionPhase: 'mep_roughin', executionLane: 'stadium_ticketing_security_wayfinding', startOffsetDays: 360, durationDays: 65, durationAssetStableCode: 'expert_domain_sports_culture', t2RhythmTemplateId: 't2-sports-culture-event-systems-commissioning-rhythm-v1', predecessorRules: [{ code: 'BTMP-SPC-S07', dependencyType: 'SS', lagDays: 25, intentCode: 'stadium_seating_progress_to_crowd_system_installation' }, { code: 'BTMP-SPC-03', dependencyType: 'SS', lagDays: 45, intentCode: 'stadium_event_system_progress_to_security_installation' }], durationBaselineAuthority: 'project_organization_variant', projectOrganizationVariantCode: 'sports_culture_stadium', tags: ['sports_stadium', 'ticketing', 'security', 'access_control', 'wayfinding'] },
    { code: 'BTMP-SPC-S12', title: '消防联动、应急照明、广播与全场疏散系统测试', executionPhase: 'commissioning', executionLane: 'stadium_life_safety_test', startOffsetDays: 430, durationDays: 35, durationAssetStableCode: 'expert_domain_sports_culture', t2RhythmTemplateId: 't2-sports-culture-event-systems-commissioning-rhythm-v1', predecessorRules: [{ code: 'BTMP-SPC-S07', dependencyType: 'FS', lagDays: 0, intentCode: 'stadium_seating_to_life_safety_test' }, { code: 'BTMP-SPC-S11', dependencyType: 'FS', lagDays: 0, intentCode: 'stadium_security_system_to_life_safety_test' }, { code: 'BTMP-BASE-12', dependencyType: 'SS', lagDays: 20, intentCode: 'stadium_common_commissioning_to_life_safety_test' }], durationBaselineAuthority: 'project_organization_variant', projectOrganizationVariantCode: 'sports_culture_stadium', tags: ['sports_stadium', 'fire_linkage', 'emergency_lighting', 'evacuation_test'] },
    { code: 'BTMP-SPC-S13', title: '场地、照明、计时计分与广播转播专项性能测试', executionPhase: 'commissioning', executionLane: 'stadium_field_event_system_test', startOffsetDays: 430, durationDays: 40, durationAssetStableCode: 'expert_domain_sports_culture', t2RhythmTemplateId: 't2-sports-culture-event-systems-commissioning-rhythm-v1', predecessorRules: [{ code: 'BTMP-SPC-S05', dependencyType: 'FS', lagDays: 0, intentCode: 'stadium_competition_surface_to_performance_test' }, { code: 'BTMP-SPC-S06', dependencyType: 'FS', lagDays: 0, intentCode: 'stadium_track_facilities_to_performance_test' }, { code: 'BTMP-SPC-S09', dependencyType: 'FS', lagDays: 0, intentCode: 'stadium_sports_lighting_to_performance_test' }, { code: 'BTMP-SPC-S10', dependencyType: 'FS', lagDays: 0, intentCode: 'stadium_broadcast_system_to_performance_test' }], durationBaselineAuthority: 'project_organization_variant', projectOrganizationVariantCode: 'sports_culture_stadium', tags: ['sports_stadium', 'field_test', 'illuminance_test', 'scoreboard_test', 'broadcast_test'] },
    { code: 'BTMP-SPC-S14', title: '安检集散广场、赛事车辆流线与转播车接口完成', executionPhase: 'outdoor_municipal_landscape', executionLane: 'stadium_event_precinct', startOffsetDays: 400, durationDays: 55, durationAssetStableCode: 'expert_domain_sports_culture', t2RhythmTemplateId: 't2-sports-culture-bowl-public-area-fitout-rhythm-v1', predecessorRules: [{ code: 'BTMP-BASE-11', dependencyType: 'SS', lagDays: 35, intentCode: 'stadium_outdoor_progress_to_event_precinct' }, { code: 'BTMP-SPC-S11', dependencyType: 'SS', lagDays: 25, intentCode: 'stadium_security_progress_to_event_precinct' }], durationBaselineAuthority: 'project_organization_variant', projectOrganizationVariantCode: 'sports_culture_stadium', tags: ['sports_stadium', 'security_plaza', 'event_vehicle_route', 'broadcast_compound'] },
  ],
  renovation_seismic_reinforcement: [
    { code: 'BTMP-RNV-S01', title: '加固作业面拆改、结构剔凿与基层缺陷处理', executionPhase: 'superstructure_rhythm', executionLane: 'seismic_exposure_and_substrate', startOffsetDays: 75, durationDays: 45, durationAssetStableCode: 'expert_domain_renovation_retrofit', t2RhythmTemplateId: 't2-renovation-structural-reinforcement-envelope-rhythm-v1', predecessorCodes: ['BTMP-RNV-02'], dependencyType: 'FS', lagDays: 0, durationBaselineAuthority: 'project_organization_variant', projectOrganizationVariantCode: 'renovation_seismic_reinforcement', tags: ['seismic_retrofit', 'demolition', 'substrate_treatment'] },
    { code: 'BTMP-RNV-S02', title: '植筋锚固、粘钢碳纤维样板检验与批量加固放行', executionPhase: 'superstructure_rhythm', executionLane: 'seismic_anchor_mockup_release', startOffsetDays: 120, durationDays: 25, durationAssetStableCode: 'expert_domain_renovation_retrofit', t2RhythmTemplateId: 't2-renovation-structural-reinforcement-envelope-rhythm-v1', predecessorRules: [{ code: 'BTMP-RNV-S01', dependencyType: 'FS', lagDays: 0, intentCode: 'seismic_substrate_to_anchor_test' }, { code: 'BTMP-RNV-P02', dependencyType: 'SS', lagDays: 45, intentCode: 'seismic_first_batch_material_delivery_release' }], durationBaselineAuthority: 'project_organization_variant', projectOrganizationVariantCode: 'renovation_seismic_reinforcement', tags: ['seismic_retrofit', 'anchor_test', 'mockup_release'] },
    { code: 'BTMP-RNV-S03', title: '加固施工过程监测、隐蔽验收与结构安全复核', executionPhase: 'superstructure_rhythm', executionLane: 'seismic_monitoring_hidden_acceptance', startOffsetDays: 285, durationDays: 30, durationAssetStableCode: 'expert_domain_renovation_retrofit', t2RhythmTemplateId: 't2-renovation-structural-reinforcement-envelope-rhythm-v1', predecessorRules: [{ code: 'BTMP-RNV-03', dependencyType: 'FS', lagDays: 0, intentCode: 'seismic_batch_reinforcement_to_hidden_acceptance' }], durationBaselineAuthority: 'project_organization_variant', projectOrganizationVariantCode: 'renovation_seismic_reinforcement', tags: ['seismic_retrofit', 'monitoring', 'hidden_acceptance'] },
  ],
  renovation_energy_retrofit: [
    { code: 'BTMP-RNV-E01', title: '屋面保温防水、节点热桥治理与气密闭合', executionPhase: 'envelope_roof_facade', executionLane: 'energy_roof_thermal_bridge', startOffsetDays: 145, durationDays: 60, durationAssetStableCode: 'roof_waterproof_insulation', t2RhythmTemplateId: 't2-renovation-structural-reinforcement-envelope-rhythm-v1', predecessorRules: [{ code: 'BTMP-RNV-02', dependencyType: 'FS', lagDays: 0, intentCode: 'energy_roof_workface_release' }, { code: 'BTMP-RNV-P02', dependencyType: 'SS', lagDays: 90, intentCode: 'energy_roof_first_batch_delivery_release' }], durationBaselineAuthority: 'project_organization_variant', projectOrganizationVariantCode: 'renovation_energy_retrofit', tags: ['energy_retrofit', 'roof_insulation', 'thermal_bridge', 'airtightness'] },
  ],
  renovation_heritage_conservation: [
    { code: 'BTMP-RNV-H01', title: '传统材料试配、传统工艺样板修缮与批量施工放行', executionPhase: 'startup_site_setup', executionLane: 'heritage_material_mockup_release', startOffsetDays: 105, durationDays: 45, durationAssetStableCode: 'expert_domain_heritage_preservation', t2RhythmTemplateId: 't2-renovation-structural-reinforcement-envelope-rhythm-v1', predecessorRules: [{ code: 'BTMP-RNV-02', dependencyType: 'FS', lagDays: 0, intentCode: 'heritage_protection_to_mockup' }, { code: 'BTMP-RNV-P02', dependencyType: 'SS', lagDays: 30, intentCode: 'heritage_sample_material_delivery_release' }], durationBaselineAuthority: 'project_organization_variant', projectOrganizationVariantCode: 'renovation_heritage_conservation', tags: ['heritage_conservation', 'traditional_material', 'craft_mockup', 'release'] },
    { code: 'BTMP-RNV-H02', title: '修缮构件隐蔽验收、微环境监测与下道工序放行', executionPhase: 'interior_fitout_terminal', executionLane: 'heritage_hidden_acceptance_monitoring', startOffsetDays: 305, durationDays: 35, durationAssetStableCode: 'expert_domain_heritage_preservation', t2RhythmTemplateId: 't2-renovation-structural-reinforcement-envelope-rhythm-v1', predecessorRules: [{ code: 'BTMP-RNV-03', dependencyType: 'FS', lagDays: 0, intentCode: 'heritage_traditional_craft_to_hidden_acceptance' }], durationBaselineAuthority: 'project_organization_variant', projectOrganizationVariantCode: 'renovation_heritage_conservation', tags: ['heritage_conservation', 'hidden_acceptance', 'micro_environment', 'release'] },
  ],
}



export function applyProjectOrganizationVariantMasterPlanActivityOverrides(params: {
  businessType: string
  projectFacts: Record<string, unknown>
  activities: BusinessTypeMasterPlanActivity[]
}) {
  const policy = resolveProjectOrganizationPolicyFromProjectFacts(params.businessType, params.projectFacts)
  const overrides = PROJECT_ORGANIZATION_VARIANT_MASTER_PLAN_ACTIVITY_OVERRIDES[policy.variantCode] ?? []
  const activities = [
    ...params.activities,
    ...(PROJECT_ORGANIZATION_VARIANT_MASTER_PLAN_ADDITIONAL_ACTIVITIES[policy.variantCode] ?? []),
  ]
  const renovationVariantT2TemplateId = params.businessType === 'renovation'
    ? PROJECT_ORGANIZATION_VARIANT_T2_TEMPLATE_IDS[policy.variantCode]
    : undefined
  const renovationVariantT2Template = findT2RhythmTemplate(renovationVariantT2TemplateId)
  const overrideByCode = new Map(overrides.map((override) => [override.code, override]))
  return activities.map((activity) => {
    const override = overrideByCode.get(activity.code)
    const overriddenActivity = override
      ? {
          ...activity,
          ...override,
          durationBaselineAuthority: override.durationDays == null
            ? activity.durationBaselineAuthority
            : 'project_organization_variant',
          projectOrganizationVariantCode: policy.variantCode,
          tags: uniqueStringArray([
            ...(activity.tags ?? []),
            ...(override.tags ?? []),
            policy.variantCode,
          ]),
        }
      : activity
    return renovationVariantT2Template
      && phaseWindowMatchesExecutionPhase(renovationVariantT2Template, overriddenActivity.executionPhase)
      ? {
          ...overriddenActivity,
          t2RhythmTemplateId: renovationVariantT2Template.templateId,
        }
      : overriddenActivity
  })
}



export function orderBusinessTypeMasterPlanActivitiesByDependencies(
  activities: BusinessTypeMasterPlanActivity[],
) {
  const activityCodes = new Set(activities.map((activity) => activity.code))
  const ordered: BusinessTypeMasterPlanActivity[] = []
  const resolvedCodes = new Set<string>()
  const remaining = [...activities]

  while (remaining.length > 0) {
    let progressed = false
    for (let index = 0; index < remaining.length;) {
      const activity = remaining[index]
      const internalPredecessorCodes = uniqueStringArray([
        ...(activity.predecessorCodes ?? []),
        ...(activity.predecessorRules ?? []).map((rule) => rule.code),
      ]).filter((code) => activityCodes.has(code))
      if (!internalPredecessorCodes.every((code) => resolvedCodes.has(code))) {
        index += 1
        continue
      }
      ordered.push(activity)
      resolvedCodes.add(activity.code)
      remaining.splice(index, 1)
      progressed = true
    }
    if (progressed) continue
    ordered.push(...remaining)
    break
  }

  return ordered
}



export const BUSINESS_TYPE_CONTRACTUAL_HANDOVER_TITLE: Record<string, string> = {
  general_civil: '建设单位、物业及商业运营单位移交与保修启动',
  hotel: '建设单位及酒店运营方移交与保修启动',
  hospital: '建设单位及医院使用单位移交与保修启动',
  school: '建设单位及学校使用单位移交与保修启动',
  industrial: '建设单位及生产运营单位移交与保修启动',
  data_center: '建设单位及数据中心运维单位移交与保修启动',
  transportation_hub: '建设单位及枢纽运营单位移交与保修启动',
  sports_culture: '建设单位及场馆运营单位移交与保修启动',
  tod_upper_cover: '建设单位、轨交及物业运营单位移交与保修启动',
  renovation: '建设单位及原运营使用单位移交与保修启动',
  modular_building: '建设单位及使用单位移交与保修启动',
}



export function buildBusinessTypeContractualCloseoutActivities(params: {
  businessType: string
  terminalControlCode: string
  terminalControlEndOffsetDays: number
}): BusinessTypeMasterPlanActivity[] {
  return [
    {
      code: 'BTMP-CLOSEOUT-01',
      title: '竣工验收备案完成',
      executionPhase: 'acceptance_handover',
      executionLane: 'contractual_closeout',
      startOffsetDays: params.terminalControlEndOffsetDays + 1,
      durationDays: 1,
      predecessorCodes: [params.terminalControlCode],
      dependencyType: 'FS',
      lagDays: 0,
      tags: ['contractual_closeout', 'completion_filing', 'acceptance'],
      planItemKind: 'milestone',
      durationContributionMode: 'record_only',
      executionNature: 'handover_milestone',
      durationAssetStableCode: 'integrated_commissioning',
      contractualCloseoutRole: 'completion_filing',
      contractualTerminalControlCode: params.terminalControlCode,
    },
    {
      code: 'BTMP-CLOSEOUT-02',
      title: BUSINESS_TYPE_CONTRACTUAL_HANDOVER_TITLE[params.businessType]
        ?? '建设单位及使用单位移交与保修启动',
      executionPhase: 'acceptance_handover',
      executionLane: 'contractual_closeout',
      startOffsetDays: params.terminalControlEndOffsetDays + 2,
      durationDays: 1,
      predecessorCodes: ['BTMP-CLOSEOUT-01'],
      dependencyType: 'FS',
      lagDays: 0,
      tags: ['contractual_closeout', 'property_handover', 'warranty'],
      planItemKind: 'milestone',
      durationContributionMode: 'record_only',
      executionNature: 'handover_milestone',
      durationAssetStableCode: 'integrated_commissioning',
      contractualCloseoutRole: 'property_handover',
      contractualTerminalControlCode: params.terminalControlCode,
    },
  ]
}



export function readMasterPlanNumberFromOperation(
  operation: PlanningTableOperation,
  projectFacts: Record<string, unknown>,
  scope: Record<string, unknown>,
  keys: string[],
  fallback: number,
) {
  const value = readNumberFromSources([scope, projectFacts], keys)
  if (value == null || value <= 0) return fallback
  return value
}



export function isResidentialDefaultMasterPlanOperation(
  operation: PlanningTableOperation,
  projectFacts: Record<string, unknown>,
) {
  const scope = readRecord(operation.scope)
  const projectTypeCode = normalizeText(
    scope.project_type_code
      ?? scope.projectTypeCode
      ?? projectFacts.projectTypeCode
      ?? projectFacts.project_type_code,
  )
  const businessSubtype = normalizeText(
    scope.business_subtype
      ?? scope.businessSubtype
      ?? projectFacts.businessSubtype
      ?? projectFacts.business_subtype,
  )
  const businessType = normalizeText(
    scope.business_type
      ?? scope.businessType
      ?? projectFacts.businessType
      ?? projectFacts.business_type,
  )
  return projectTypeCode === 'residential'
    || businessSubtype.includes('residential')
    || businessSubtype.includes('住宅')
    || businessType.includes('residential')
}



export function buildResidentialMasterPlanActivities(params: {
  operation: PlanningTableOperation
  projectFacts: Record<string, unknown>
  seedLookup: StandardDurationSeedLookup
  t2Lookup?: T2RhythmTemplateLookup | null
  organizationStrategy?: ProjectOrganizationStrategy | null
}): ResidentialMasterPlanActivity[] {
  const scope = readRecord(params.operation.scope)
  const buildingCount = clampInteger(
    readMasterPlanNumberFromOperation(params.operation, params.projectFacts, scope, ['building_count', 'buildingCount'], 3),
    1,
    20,
    3,
  )
  const standardFloorCount = clampInteger(
    readMasterPlanNumberFromOperation(params.operation, params.projectFacts, scope, ['standard_floor_count', 'standardFloorCount'], 26),
    1,
    80,
    26,
  )
  const basementLevelCount = clampInteger(
    readMasterPlanNumberFromOperation(params.operation, params.projectFacts, scope, ['basement_level_count', 'basementLevelCount'], 1),
    0,
    6,
    1,
  )
  const highestFloorCount = clampInteger(
    readMasterPlanNumberFromOperation(params.operation, params.projectFacts, scope, ['highest_building_floor_count', 'highestBuildingFloorCount'], standardFloorCount + 2),
    standardFloorCount,
    120,
    standardFloorCount + 2,
  )
  const totalAreaM2 = clampInteger(
    readMasterPlanNumberFromOperation(params.operation, params.projectFacts, scope, ['total_area_m2', 'totalAreaM2'], 90_000),
    1_000,
    800_000,
    90_000,
  )
  const methodVariantCodes = readResidentialMethodVariantCodes(scope, params.projectFacts)
  const supportMethod = selectResidentialMethodOption(
    methodVariantCodes,
    FOUNDATION_SUPPORT_METHOD_OPTIONS,
    FOUNDATION_SUPPORT_METHOD_OPTIONS[0],
  )
  const pileMethod = selectResidentialMethodOption(
    methodVariantCodes,
    PILE_FOUNDATION_METHOD_OPTIONS,
    PILE_FOUNDATION_METHOD_OPTIONS[0],
  )
  const areaPerTowerM2 = Math.max(1, Math.round(totalAreaM2 / Math.max(1, buildingCount)))
  const supportFrontageM = Math.max(180, Math.round(Math.sqrt(totalAreaM2) * (basementLevelCount > 0 ? 3.2 : 2.2)))
  const pileQuantityProxy = Math.max(80, (buildingCount * 64) + Math.ceil(totalAreaM2 / 2500) + Math.ceil(areaPerTowerM2 / 3000))
  const basementAreaProxyM2 = Math.max(2_000, Math.round(totalAreaM2 * Math.max(0.18, Math.min(0.45, 0.18 + basementLevelCount * 0.08))))
  const standardFloorCycleDays = clampInteger(
    Math.max(
      readP50DaysFromT2Template(RESIDENTIAL_T2_RHYTHM_TEMPLATE_IDS.standardFloor, 6, params.t2Lookup),
      readP50DaysFromStandardSeed('cast_in_place_formwork', 5, params.seedLookup),
    ),
    5,
    9,
    6,
  )
  const towerStructureDuration = clampInteger(
    28 + (standardFloorCount * standardFloorCycleDays) + Math.max(0, highestFloorCount - standardFloorCount) * Math.max(4, standardFloorCycleDays - 1),
    90,
    340,
    235,
  )
  const towerReleaseDays = buildingCount > 1
    && params.organizationStrategy?.networkPolicy.primaryLaneScheduling !== 'parallel_lanes_with_interface_gates'
    ? clampInteger(24 + Math.min(18, buildingCount * 3), 24, 42, 30)
    : 0
  const towerTypicalFloorAreaProxyM2 = Math.max(600, Math.round(areaPerTowerM2 / Math.max(1, standardFloorCount)))
  const towerTransferConcreteVolumeProxyM3 = Math.max(300, Math.round(towerTypicalFloorAreaProxyM2 * 0.443))
  const towerTransferStructureDuration = calculateDurationByProductivity({
    stableCode: 'cast_in_place_concrete',
    quantity: towerTransferConcreteVolumeProxyM3,
    minDays: 20,
    maxDays: 70,
    fallbackDays: 28,
    fixedBufferDays: 20,
    seedLookup: params.seedLookup,
  })
  const towerRoofPlantRoomConcreteVolumeProxyM3 = Math.max(120, Math.round(towerTypicalFloorAreaProxyM2 * 0.185))
  const towerRoofPlantRoomStructureDuration = calculateDurationByProductivity({
    stableCode: 'cast_in_place_concrete',
    quantity: towerRoofPlantRoomConcreteVolumeProxyM3,
    minDays: 14,
    maxDays: 45,
    fallbackDays: 18,
    fixedBufferDays: 12,
    seedLookup: params.seedLookup,
  })
  const temporaryFacilityDuration = calculateDurationByStandardSeedFloor({
    stableCode: 'site_setup_temp_works',
    minDays: 14,
    maxDays: 70,
    fallbackDays: 24,
    seedLookup: params.seedLookup,
  })
  const siteMobilizationWorkfaceProxy = Math.max(6, buildingCount + basementLevelCount + Math.ceil(totalAreaM2 / 60_000))
  const siteAccessWorkfaceProxy = Math.max(7, buildingCount + basementLevelCount + Math.ceil(totalAreaM2 / 50_000))
  const temporaryUtilitiesWorkfaceProxy = Math.max(6, buildingCount + basementLevelCount + Math.ceil(totalAreaM2 / 70_000))
  const towerCraneQuantityProxy = Math.max(1, buildingCount)
  const siteMobilizationDuration = calculateDurationByProductivity({ stableCode: 'site_setup_temp_works', quantity: siteMobilizationWorkfaceProxy, minDays: 8, maxDays: 40, fallbackDays: 10, fixedBufferDays: 4, seedLookup: params.seedLookup })
  const siteAccessFencingRoadDuration = calculateDurationByProductivity({ stableCode: 'site_setup_temp_works', quantity: siteAccessWorkfaceProxy, minDays: 12, maxDays: 50, fallbackDays: 14, fixedBufferDays: 8, seedLookup: params.seedLookup })
  const temporaryUtilitiesDuration = calculateDurationByProductivity({ stableCode: 'site_setup_temp_works', quantity: temporaryUtilitiesWorkfaceProxy, minDays: 12, maxDays: 55, fallbackDays: 24, fixedBufferDays: 12, seedLookup: params.seedLookup })
  const towerCraneFoundationDuration = calculateDurationByProductivity({ stableCode: 'site_setup_temp_works', quantity: towerCraneQuantityProxy, minDays: 12, maxDays: 45, fallbackDays: 18, fixedBufferDays: 12, seedLookup: params.seedLookup })
  const towerCraneInstallDuration = calculateDurationByProductivity({ stableCode: 'site_setup_temp_works', quantity: towerCraneQuantityProxy, minDays: 10, maxDays: 35, fallbackDays: 14, fixedBufferDays: 10, seedLookup: params.seedLookup })
  const foundationStart = 36
  const pileDuration = calculateDurationByProductivity({
    stableCode: pileMethod.seedStableCode,
    quantity: pileQuantityProxy,
    minDays: 50,
    maxDays: 130,
    fallbackDays: 68,
    fixedBufferDays: 14,
    seedLookup: params.seedLookup,
  })
  const supportDuration = calculateDurationByProductivity({
    stableCode: supportMethod.seedStableCode,
    quantity: supportFrontageM,
    minDays: 52,
    maxDays: 140,
    fallbackDays: 70,
    fixedBufferDays: 10 + basementLevelCount * 6,
    seedLookup: params.seedLookup,
  })
  const foundationSupportReadinessDuration = calculateDurationByProductivity({
    stableCode: 'expert_foundation_pit_support',
    quantity: supportFrontageM,
    minDays: 18,
    maxDays: 70,
    fallbackDays: 24,
    fixedBufferDays: 14,
    seedLookup: params.seedLookup,
  })
  const earthworkStart = foundationStart + 46
  const earthworkDuration = calculateDurationByProductivity({
    stableCode: 'earthwork_excavation_transport',
    quantity: basementAreaProxyM2,
    minDays: 60,
    maxDays: 150,
    fallbackDays: 86,
    fixedBufferDays: 18 + basementLevelCount * 8,
    factor: 0.025,
    seedLookup: params.seedLookup,
  })
  const basementStart = earthworkStart + earthworkDuration - 6
  const basementDuration = basementLevelCount > 0
    ? clampInteger(
      readP50DaysFromT2Template(RESIDENTIAL_T2_RHYTHM_TEMPLATE_IDS.basement, 56, params.t2Lookup)
        + readP50DaysFromStandardSeed('basement_structure', 72, params.seedLookup)
        + basementLevelCount * 18
        + Math.ceil(totalAreaM2 / 80_000) * 8,
      85,
      190,
      118,
    )
    : 0
  const basementSlabWaterproofAreaProxyM2 = Math.max(1_800, Math.round(basementAreaProxyM2 * 0.55))
  const basementSlabWaterproofDuration = calculateDurationByProductivity({
    stableCode: 'basement_waterproof_backfill',
    quantity: basementSlabWaterproofAreaProxyM2,
    minDays: 24,
    maxDays: 120,
    fallbackDays: 26,
    fixedBufferDays: 12,
    seedLookup: params.seedLookup,
  })
  const basementStructureLevelProxy = Math.max(1, basementLevelCount)
  const basementStructureProductivityBufferDays = 38 + Math.ceil(totalAreaM2 / 120_000) * 2
  const basementStructureDuration = calculateDurationByProductivity({
    stableCode: 'basement_structure',
    quantity: basementStructureLevelProxy,
    minDays: 45,
    maxDays: 160,
    fallbackDays: Math.max(45, basementDuration - 42),
    fixedBufferDays: basementStructureProductivityBufferDays,
    seedLookup: params.seedLookup,
  })
  const basementExteriorWaterproofBackfillAreaProxyM2 = Math.max(1_200, Math.round(basementAreaProxyM2 * 0.24))
  const basementExteriorWaterproofBackfillDuration = calculateDurationByProductivity({
    stableCode: 'basement_waterproof_backfill',
    quantity: basementExteriorWaterproofBackfillAreaProxyM2,
    minDays: 24,
    maxDays: 90,
    fallbackDays: 30,
    fixedBufferDays: 18,
    seedLookup: params.seedLookup,
  })
  const foundationCushionAreaProxyM2 = Math.max(1_500, Math.round(basementAreaProxyM2 * 0.33))
  const foundationCushionDuration = calculateDurationByProductivity({
    stableCode: 'cushion_and_blinding',
    quantity: foundationCushionAreaProxyM2,
    minDays: 12,
    maxDays: 70,
    fallbackDays: 14,
    fixedBufferDays: 10,
    seedLookup: params.seedLookup,
  })
  const basementSlabConcreteVolumeProxyM3 = Math.max(1_200, Math.round(basementAreaProxyM2 * 0.08))
  const basementSlabConcreteDuration = calculateDurationByProductivity({
    stableCode: 'cast_in_place_concrete',
    quantity: basementSlabConcreteVolumeProxyM3,
    minDays: 10,
    maxDays: 60,
    fallbackDays: 12,
    fixedBufferDays: 14,
    seedLookup: params.seedLookup,
  })
  const structureStart = basementLevelCount > 0 ? basementStart + basementDuration + 10 : foundationStart + 110
  const latestTowerStart = structureStart + (buildingCount - 1) * towerReleaseDays
  const latestTowerEnd = latestTowerStart + towerStructureDuration - 1
  const secondaryLagDays = clampInteger(standardFloorCycleDays * 6, 30, 60, 42)
  const mepLagDays = clampInteger(standardFloorCycleDays * 8, 42, 84, 56)
  const sampleHandoverLagDays = Math.max(42, standardFloorCycleDays * 8)
  const interiorLagDays = clampInteger(standardFloorCycleDays * 16, 96, 160, 128)
  const facadeLagDays = clampInteger(standardFloorCycleDays * 18, 108, 180, 135)
  const secondaryDuration = clampInteger(
    Math.max(
      Math.ceil(standardFloorCount / Math.max(0.1, readP50Productivity('masonry_infill_wall', params.seedLookup) ?? 0.35)),
      readP50DaysFromT2Template(RESIDENTIAL_T2_RHYTHM_TEMPLATE_IDS.secondaryFitout, 26, params.t2Lookup) * 5,
    ),
    120,
    260,
    160,
  )
  const sampleHandoverDuration = Math.max(15, Math.round(secondaryDuration * 0.12))
  const mepTowerDuration = clampInteger(
    readP50DaysFromT2Template(RESIDENTIAL_T2_RHYTHM_TEMPLATE_IDS.mep, 36, params.t2Lookup) * Math.max(4, Math.ceil(standardFloorCount / 8)),
    160,
    280,
    210,
  )
  const facadeTowerDuration = clampInteger(
    readP50DaysFromT2Template(RESIDENTIAL_T2_RHYTHM_TEMPLATE_IDS.envelope, 50, params.t2Lookup) * Math.max(3, Math.ceil(highestFloorCount / 10)),
    150,
    260,
    180,
  )
  const interiorRoughDuration = clampInteger(
    readP50DaysFromT2Template(RESIDENTIAL_T2_RHYTHM_TEMPLATE_IDS.decoration, 42, params.t2Lookup) * Math.max(3, Math.ceil(standardFloorCount / 10)),
    150,
    260,
    190,
  )
  const interiorFinishDuration = clampInteger(
    readP50DaysFromT2Template(RESIDENTIAL_T2_RHYTHM_TEMPLATE_IDS.decoration, 42, params.t2Lookup) * Math.max(3, Math.ceil(standardFloorCount / 12)),
    120,
    220,
    150,
  )
  const secondaryStart = structureStart + secondaryLagDays
  const mepStart = structureStart + mepLagDays
  const latestTowerRoofStructureStart = latestTowerStart + towerStructureDuration - 5
  const roofStart = latestTowerRoofStructureStart + towerRoofPlantRoomStructureDuration
  const elevatorInstallLagDays = clampInteger(standardFloorCycleDays * 26, 150, 220, 185)
  const elevatorStart = structureStart + elevatorInstallLagDays
  const elevatorShaftQuantityProxy = Math.max(1, buildingCount * 2)
  const perTowerElevatorShaftQuantityProxy = Math.max(1, Math.ceil(elevatorShaftQuantityProxy / buildingCount))
  const elevatorCivilHandoverDuration = Math.max(28, calculateDurationByProductivity({
    stableCode: 'elevator_traction_civil_handover',
    quantity: elevatorShaftQuantityProxy,
    minDays: 24,
    maxDays: 80,
    fallbackDays: 28,
    fixedBufferDays: 18,
    seedLookup: params.seedLookup,
  }))
  const perTowerElevatorInstallationDuration = Math.max(90, calculateDurationByProductivity({
    stableCode: 'elevator_traction_installation',
    quantity: perTowerElevatorShaftQuantityProxy,
    minDays: 60,
    maxDays: 180,
    fallbackDays: 100,
    fixedBufferDays: 45,
    seedLookup: params.seedLookup,
  }))
  const elevatorFinalAcceptanceDuration = Math.max(30, calculateDurationByProductivity({
    stableCode: 'elevator_traction_final_acceptance',
    quantity: elevatorShaftQuantityProxy,
    minDays: 24,
    maxDays: 80,
    fallbackDays: 30,
    fixedBufferDays: 14,
    seedLookup: params.seedLookup,
  }))
  const interiorStart = structureStart + interiorLagDays
  const outdoorStart = latestTowerEnd + 20
  const basementExteriorWaterproofBackfillStart = basementStart + basementDuration - 20
  const latestInteriorEnd = (structureStart + (buildingCount - 1) * towerReleaseDays) + interiorLagDays + interiorRoughDuration + interiorFinishDuration
  const perTowerFacadeCloseoutAreaProxyM2 = Math.max(1_200, Math.round((totalAreaM2 * 0.08) / buildingCount))
  const perTowerFacadeCloseoutDuration = Math.max(35, calculateDurationByProductivity({
    stableCode: 'curtain_wall_installation',
    quantity: perTowerFacadeCloseoutAreaProxyM2,
    minDays: 30,
    maxDays: 90,
    fallbackDays: 45,
    fixedBufferDays: 15,
    seedLookup: params.seedLookup,
  }))
  const latestFacadeEnd = latestTowerStart + facadeLagDays + facadeTowerDuration + perTowerFacadeCloseoutDuration
  const latestMepEnd = mepStart + mepTowerDuration
  const basementMepEffectivePipeLengthM = Math.max(1_600, Math.round(basementAreaProxyM2 * 0.05))
  const basementMepCoordinationDuration = Math.max(160, calculateDurationByProductivity({
    stableCode: 'mep_plumbing_fire_pipe',
    quantity: basementMepEffectivePipeLengthM,
    minDays: 140,
    maxDays: 260,
    fallbackDays: 160,
    fixedBufferDays: 38,
    seedLookup: params.seedLookup,
  }))
  const commonMepEffectivePipeLengthM = Math.max(2_400, Math.round(totalAreaM2 * 0.08))
  const commonMepInstallDuration = Math.max(210, calculateDurationByProductivity({
    stableCode: 'mep_plumbing_fire_pipe',
    quantity: commonMepEffectivePipeLengthM,
    minDays: 160,
    maxDays: 360,
    fallbackDays: 210,
    fixedBufferDays: 60,
    seedLookup: params.seedLookup,
  }))
  const outdoorDuration = calculateDurationByProductivity({
    stableCode: 'outdoor_utilities',
    quantity: Math.max(260, Math.round(Math.sqrt(totalAreaM2) * 1.8)),
    minDays: 90,
    maxDays: 160,
    fallbackDays: 125,
    fixedBufferDays: 45,
    seedLookup: params.seedLookup,
  })
  const outdoorFinish = outdoorStart + outdoorDuration
  const outdoorCloseoutFrontageProxyM = Math.max(180, Math.round(Math.sqrt(totalAreaM2) * 0.63))
  const outdoorCloseoutDuration = calculateDurationByProductivity({
    stableCode: 'outdoor_utilities',
    quantity: outdoorCloseoutFrontageProxyM,
    minDays: 20,
    maxDays: 70,
    fallbackDays: 24,
    fixedBufferDays: 14,
    seedLookup: params.seedLookup,
  })
  const commissioningStart = Math.max(latestTowerEnd + 90, latestInteriorEnd + 35, latestFacadeEnd + 20, latestMepEnd + 20, outdoorFinish - 25)
  const roofWaterproofAreaProxyM2 = Math.max(buildingCount * 600, Math.round(totalAreaM2 * 0.04))
  const roofWaterproofDuration = Math.max(55, calculateDurationByProductivity({
    stableCode: 'roof_waterproof_insulation',
    quantity: roofWaterproofAreaProxyM2,
    minDays: 45,
    maxDays: 120,
    fallbackDays: 55,
    fixedBufferDays: 25,
    seedLookup: params.seedLookup,
  }))
  const singleSystemCommissioningSystemZoneProxy = Math.max(6, buildingCount + basementLevelCount + Math.ceil(totalAreaM2 / 40_000))
  const singleSystemCommissioningDuration = Math.max(32, calculateDurationByProductivity({
    stableCode: 'single_system_commissioning',
    quantity: singleSystemCommissioningSystemZoneProxy,
    minDays: 32,
    maxDays: 96,
    fallbackDays: 32,
    fixedBufferDays: 24,
    seedLookup: params.seedLookup,
  }))
  const integratedCommissioningLinkageScenarioProxy = Math.max(
    6,
    buildingCount + basementLevelCount + Math.ceil(totalAreaM2 / 60_000) + 2,
  )
  const integratedCommissioningDuration = Math.max(38, calculateDurationByProductivity({
    stableCode: 'integrated_commissioning',
    quantity: integratedCommissioningLinkageScenarioProxy,
    minDays: 38,
    maxDays: 120,
    fallbackDays: 38,
    fixedBufferDays: 18,
    seedLookup: params.seedLookup,
  }))
  const handoverDefectZoneProxy = Math.max(
    6,
    buildingCount + basementLevelCount + Math.ceil(totalAreaM2 / 24_000),
  )
  const handoverDefectCloseoutDuration = calculateDurationByProductivity({
    stableCode: 'integrated_commissioning',
    quantity: handoverDefectZoneProxy,
    minDays: 35,
    maxDays: 120,
    fallbackDays: 45,
    fixedBufferDays: 18,
    seedLookup: params.seedLookup,
  })
  const acceptanceStart = commissioningStart + 72

  const activities: ResidentialMasterPlanActivity[] = [
    { code: 'RMP-01-01', title: '施工准备与场地移交测量放线', executionPhase: 'startup_site_setup', executionLane: 'site_preparation', startOffsetDays: 0, durationDays: 10, tags: ['site_handover'], executionNature: 'technical_preparation', durationAssetStableCode: 'site_setup_temp_works', t2RhythmApplicability: 'not_applicable_one_off_activity', durationFormula: 'real-plan skeleton startup row with site_setup_temp_works seed floor' },
    { code: 'RMP-01-02', title: '围挡大门与临时道路施工', executionPhase: 'startup_site_setup', executionLane: 'site_preparation', startOffsetDays: 3, durationDays: 14, predecessorCodes: ['RMP-01-01'], durationAssetStableCode: 'site_setup_temp_works', t2RhythmApplicability: 'not_applicable_one_off_activity', durationFormula: 'site_setup_temp_works seed plus real-plan startup split' },
    { code: 'RMP-01-03', title: '临建办公生活区搭设', executionPhase: 'startup_site_setup', executionLane: 'site_preparation', startOffsetDays: 6, durationDays: temporaryFacilityDuration, predecessorCodes: ['RMP-01-01'], durationAssetStableCode: 'site_setup_temp_works', t2RhythmApplicability: 'not_applicable_one_off_activity', durationCalculationBasis: { minDays: 14, maxDays: 70, fallbackDays: 24, selectionRule: 'standard_seed_floor_for_temporary_facility_asset_backed_candidate_l1' }, durationFormula: 'max(real-plan temporary-facility skeleton, site_setup_temp_works seed p50) bounded by startup workface limits' },
    { code: 'RMP-01-04', title: '施工用水用电接入与临电验收', executionPhase: 'startup_site_setup', executionLane: 'site_preparation', startOffsetDays: 12, durationDays: 24, predecessorCodes: ['RMP-01-02'], durationAssetStableCode: 'site_setup_temp_works', t2RhythmApplicability: 'not_applicable_one_off_activity', durationFormula: 'site_setup_temp_works seed plus utility readiness gate proxy' },
    { code: 'RMP-01-05', title: '塔吊基础施工', executionPhase: 'startup_site_setup', executionLane: 'vertical_transport', startOffsetDays: 24, durationDays: 18, predecessorCodes: ['RMP-01-02'], durationAssetStableCode: 'site_setup_temp_works', t2RhythmApplicability: 'not_applicable_one_off_activity', durationFormula: 'site_setup_temp_works seed plus vertical-transport readiness proxy' },
    { code: 'RMP-01-06', title: '塔吊安装与投入使用', executionPhase: 'startup_site_setup', executionLane: 'vertical_transport', startOffsetDays: 38, durationDays: 14, predecessorCodes: ['RMP-01-05'], durationAssetStableCode: 'site_setup_temp_works', t2RhythmApplicability: 'not_applicable_one_off_activity', durationFormula: 'site_setup_temp_works seed plus tower-crane commissioning startup proxy' },
    { code: 'RMP-02-01', title: '基坑支护与降排水准备', executionPhase: 'foundation_pit_pile', executionLane: 'foundation', startOffsetDays: foundationStart, durationDays: 24, predecessorCodes: ['RMP-01-04'], durationAssetStableCode: 'expert_foundation_pit_support', t2RhythmTemplateId: RESIDENTIAL_T2_RHYTHM_TEMPLATE_IDS.basement, durationFormula: 'foundation support readiness from support/dewatering frontage seed and basement rhythm' },
    { code: 'RMP-02-02', title: supportMethod.title, executionPhase: 'foundation_pit_pile', executionLane: 'foundation', startOffsetDays: foundationStart + 3, durationDays: supportDuration, predecessorCodes: ['RMP-02-01'], dependencyType: 'SS', lagDays: 3, durationAssetStableCode: supportMethod.seedStableCode, t2RhythmTemplateId: RESIDENTIAL_T2_RHYTHM_TEMPLATE_IDS.basement, methodVariantCode: supportMethod.codes[0], quantityProxy: { value: supportFrontageM, unit: 'm', basis: 'sqrt(totalAreaM2) support frontage proxy' }, durationCalculationBasis: { minDays: 52, maxDays: 140, fallbackDays: 70, fixedBufferDays: 10 + basementLevelCount * 6, selectionRule: 'ceil(quantity / selected_seed_p50_productivity) + basement_support_buffer_clamped_asset_backed_candidate_l1' }, durationFormula: 'ceil(supportFrontageM / selected support seed p50PerDay) + basement support buffer' },
    { code: 'RMP-02-03', title: pileMethod.title, executionPhase: 'foundation_pit_pile', executionLane: 'foundation', startOffsetDays: foundationStart + 8, durationDays: pileDuration, predecessorCodes: ['RMP-02-01'], dependencyType: 'SS', lagDays: 8, durationAssetStableCode: pileMethod.seedStableCode, t2RhythmTemplateId: RESIDENTIAL_T2_RHYTHM_TEMPLATE_IDS.basement, methodVariantCode: pileMethod.codes[0], quantityProxy: { value: pileQuantityProxy, unit: 'pile', basis: 'building count plus total-area pile quantity proxy' }, durationCalculationBasis: { minDays: 50, maxDays: 130, fallbackDays: 68, fixedBufferDays: 14, selectionRule: 'ceil(quantity / selected_seed_p50_productivity) + testing_buffer_clamped_asset_backed_candidate_l1' }, durationFormula: 'ceil(pileQuantityProxy / selected pile seed p50PerDay) + testing buffer' },
    { code: 'RMP-02-04', title: '桩基检测与基础验收', executionPhase: 'foundation_pit_pile', executionLane: 'foundation', startOffsetDays: foundationStart + pileDuration + 12, durationDays: 20, predecessorCodes: ['RMP-02-03'], durationAssetStableCode: 'expert_pile_foundation', t2RhythmTemplateId: RESIDENTIAL_T2_RHYTHM_TEMPLATE_IDS.basement, planItemKind: 'inspection_task', durationContributionMode: 'quality_gate', executionNature: 'inspection_test', durationFormula: 'pile foundation testing closeout gate retained as schedule gate, not management checklist expansion' },
    { code: 'RMP-02-05', title: '土方开挖与边坡监测', executionPhase: 'foundation_pit_pile', executionLane: 'foundation', startOffsetDays: earthworkStart, durationDays: earthworkDuration, predecessorCodes: ['RMP-02-02', 'RMP-02-03'], durationAssetStableCode: 'earthwork_excavation_transport', t2RhythmTemplateId: RESIDENTIAL_T2_RHYTHM_TEMPLATE_IDS.basement, quantityProxy: { value: basementAreaProxyM2, unit: 'm2', basis: 'basement footprint proxy from total area and basement levels' }, durationCalculationBasis: { minDays: 60, maxDays: 150, fallbackDays: 86, fixedBufferDays: 18 + basementLevelCount * 8, factor: 0.025, selectionRule: 'earthwork_productivity_by_basement_footprint_plus_monitoring_buffer_asset_backed_candidate_l1' }, durationFormula: 'earthwork_excavation_transport seed with basement footprint proxy and monitoring buffer' },
    { code: 'RMP-02-06', title: '基坑验槽与垫层施工', executionPhase: 'foundation_pit_pile', executionLane: 'foundation', startOffsetDays: earthworkStart + earthworkDuration - 6, durationDays: 14, predecessorCodes: ['RMP-02-05'], durationAssetStableCode: 'cushion_and_blinding', t2RhythmTemplateId: RESIDENTIAL_T2_RHYTHM_TEMPLATE_IDS.basement, durationFormula: 'foundation handover/cushion gate from cushion_and_blinding seed and basement rhythm' },
    { code: 'RMP-03-01', title: '地下室底板防水与钢筋施工', executionPhase: 'basement_structure', executionLane: 'basement', startOffsetDays: basementStart, durationDays: basementSlabWaterproofDuration, predecessorCodes: ['RMP-02-06'], durationAssetStableCode: 'basement_waterproof_backfill', t2RhythmTemplateId: RESIDENTIAL_T2_RHYTHM_TEMPLATE_IDS.basement, quantityProxy: { value: basementSlabWaterproofAreaProxyM2, unit: 'm2', basis: 'basementAreaProxyM2 * 0.55 residential basement slab waterproofing and reinforcement release area proxy' }, durationCalculationBasis: { minDays: 24, maxDays: 120, fallbackDays: 26, fixedBufferDays: 12, selectionRule: 'basement_slab_waterproof_productivity_by_area_plus_steel_release_buffer_asset_backed_candidate_l1' }, durationFormula: 'max(real-plan basement slab skeleton, ceil(slabWaterproofArea / basement_waterproof_backfill seed p50PerDay) + steel release buffer)' },
    { code: 'RMP-03-02', title: '地下室底板混凝土浇筑', executionPhase: 'basement_structure', executionLane: 'basement', startOffsetDays: basementStart + 24, durationDays: 12, predecessorCodes: ['RMP-03-01'], dependencyType: 'SS', lagDays: 24, durationAssetStableCode: 'cast_in_place_concrete', t2RhythmTemplateId: RESIDENTIAL_T2_RHYTHM_TEMPLATE_IDS.basement, durationFormula: 'cast_in_place_concrete seed for rolling basement slab concrete window after waterproofing/steel release' },
    { code: 'RMP-03-03', title: '地下室结构施工', executionPhase: 'basement_structure', executionLane: 'basement', startOffsetDays: basementStart + 36, durationDays: Math.max(45, basementDuration - 42), predecessorCodes: ['RMP-03-02'], durationAssetStableCode: 'basement_structure', t2RhythmTemplateId: RESIDENTIAL_T2_RHYTHM_TEMPLATE_IDS.basement, quantityProxy: { value: basementAreaProxyM2, unit: 'm2', basis: 'basement structure footprint proxy from total area' }, durationFormula: 'basement_structure seed plus residential basement T2 parent rhythm' },
    { code: 'RMP-03-04', title: '地下室外墙防水与回填', executionPhase: 'basement_structure', executionLane: 'basement', startOffsetDays: basementExteriorWaterproofBackfillStart, durationDays: basementExteriorWaterproofBackfillDuration, predecessorCodes: ['RMP-03-03'], dependencyType: 'FF', lagDays: -20, durationAssetStableCode: 'basement_waterproof_backfill', t2RhythmTemplateId: RESIDENTIAL_T2_RHYTHM_TEMPLATE_IDS.basement, quantityProxy: { value: basementExteriorWaterproofBackfillAreaProxyM2, unit: 'm2', basis: 'basementAreaProxyM2 * 0.24 residential exterior waterproofing and backfill control area proxy' }, durationCalculationBasis: { minDays: 24, maxDays: 90, fallbackDays: 30, fixedBufferDays: 18, selectionRule: 'basement_exterior_waterproof_backfill_productivity_by_area_plus_compaction_buffer_asset_backed_candidate_l1' }, durationFormula: 'max(real-plan exterior waterproof/backfill skeleton, ceil(exteriorWaterproofBackfillArea / basement_waterproof_backfill seed p50PerDay) + compaction/inspection buffer)' },
    { code: 'RMP-03-05', title: '地下室结构验收与出正负零', executionPhase: 'basement_structure', executionLane: 'basement', startOffsetDays: basementStart + basementDuration + 2, durationDays: 10, predecessorCodes: ['RMP-03-03'], durationAssetStableCode: 'basement_structure', t2RhythmTemplateId: RESIDENTIAL_T2_RHYTHM_TEMPLATE_IDS.basement, planItemKind: 'milestone', durationContributionMode: 'handover_marker', executionNature: 'handover_milestone', durationFormula: 'real-plan ±0.000 handover milestone from basement rhythm, not quality checklist expansion' },
    { code: 'RMP-10-01', title: '施工电梯安装与楼层运输保障', executionPhase: 'elevator_installation', executionLane: 'vertical_transport', startOffsetDays: elevatorStart - elevatorCivilHandoverDuration, durationDays: elevatorCivilHandoverDuration, predecessorCodes: ['RMP-03-05'], durationAssetStableCode: 'elevator_traction_civil_handover', t2RhythmTemplateId: RESIDENTIAL_T2_RHYTHM_TEMPLATE_IDS.standardFloor, quantityProxy: { value: elevatorShaftQuantityProxy, unit: 'shaft', basis: 'two elevator shafts per residential tower cold-start proxy for civil handover and vertical transport readiness' }, durationCalculationBasis: { minDays: 24, maxDays: 80, fallbackDays: 28, fixedBufferDays: 18, selectionRule: 'elevator_civil_handover_productivity_by_shaft_plus_readiness_buffer_asset_backed_candidate_l1' }, durationFormula: 'project-level vertical-transport support constraint retained in the hidden calculation network' },
  ]

  for (let index = 0; index < buildingCount; index += 1) {
    const buildingNo = index + 1
    const towerStart = structureStart + index * towerReleaseDays
    const prefix = `RMP-04-${String(buildingNo).padStart(2, '0')}`
    const towerActivities: ResidentialMasterPlanActivity[] = [
      { code: `${prefix}-01`, title: `${buildingNo}#楼首层及转换层结构`, executionPhase: 'superstructure_rhythm', executionLane: `tower_${buildingNo}`, startOffsetDays: towerStart, durationDays: towerTransferStructureDuration, predecessorCodes: ['RMP-03-05'], durationAssetStableCode: 'cast_in_place_concrete', t2RhythmTemplateId: RESIDENTIAL_T2_RHYTHM_TEMPLATE_IDS.standardFloor, quantityProxy: { value: towerTransferConcreteVolumeProxyM3, unit: 'm3', basis: 'areaPerTowerM2 / standardFloorCount * 0.443 transfer/first-floor concrete volume proxy' }, durationCalculationBasis: { minDays: 20, maxDays: 70, fallbackDays: 28, fixedBufferDays: 20, selectionRule: 'tower_transfer_structure_concrete_productivity_by_volume_plus_transfer_buffer_asset_backed_candidate_l1' }, durationFormula: 'ceil(towerTransferConcreteVolume / cast_in_place_concrete seed p50PerDay) + transfer-floor structure buffer' },
      { code: `${prefix}-02`, title: `${buildingNo}#楼主体结构标准层循环`, executionPhase: 'superstructure_rhythm', executionLane: `tower_${buildingNo}`, startOffsetDays: towerStart + 21, durationDays: towerStructureDuration, predecessorCodes: [`${prefix}-01`], tags: ['standard_floor_cycle'], durationAssetStableCode: 'cast_in_place_formwork', t2RhythmTemplateId: RESIDENTIAL_T2_RHYTHM_TEMPLATE_IDS.standardFloor, quantityProxy: { value: standardFloorCount, unit: 'floor', basis: 'standard_floor_count from project facts' }, durationFormula: '28d transfer/base buffer + standardFloorCount * max(T2 p50 floor cycle, standard formwork p50)' },
      { code: `${prefix}-03`, title: `${buildingNo}#楼屋面层与机房结构`, executionPhase: 'superstructure_rhythm', executionLane: `tower_${buildingNo}`, startOffsetDays: towerStart + towerStructureDuration - 5, durationDays: towerRoofPlantRoomStructureDuration, predecessorCodes: [`${prefix}-02`], dependencyType: 'FF', lagDays: -5, durationAssetStableCode: 'cast_in_place_concrete', t2RhythmTemplateId: RESIDENTIAL_T2_RHYTHM_TEMPLATE_IDS.standardFloor, quantityProxy: { value: towerRoofPlantRoomConcreteVolumeProxyM3, unit: 'm3', basis: 'areaPerTowerM2 / standardFloorCount * 0.185 roof plant-room concrete volume proxy' }, durationCalculationBasis: { minDays: 14, maxDays: 45, fallbackDays: 18, fixedBufferDays: 12, selectionRule: 'roof_plant_room_structure_concrete_productivity_by_volume_plus_closeout_buffer_asset_backed_candidate_l1' }, durationFormula: 'ceil(towerRoofPlantRoomConcreteVolume / cast_in_place_concrete seed p50PerDay) + roof/plant-room closeout buffer' },
      { code: `${prefix}-04`, title: `${buildingNo}#楼主体结构验收`, executionPhase: 'superstructure_rhythm', executionLane: `tower_${buildingNo}`, startOffsetDays: towerStart + towerStructureDuration + 14, durationDays: 10, predecessorCodes: [`${prefix}-03`], durationAssetStableCode: 'cast_in_place_concrete', t2RhythmTemplateId: RESIDENTIAL_T2_RHYTHM_TEMPLATE_IDS.standardFloor, planItemKind: 'milestone', durationContributionMode: 'quality_gate', executionNature: 'inspection_test', durationFormula: 'structure acceptance gate retained as control milestone, not checklist expansion' },
      { code: `RMP-05-${String(buildingNo).padStart(2, '0')}-01`, title: `${buildingNo}#楼砌体与二次结构穿插`, executionPhase: 'secondary_structure_fitout_roughin', executionLane: `tower_${buildingNo}`, startOffsetDays: towerStart + secondaryLagDays, durationDays: secondaryDuration, predecessorCodes: [`${prefix}-02`], dependencyType: 'SS', lagDays: secondaryLagDays, dependencyIntentCode: 'asset_backed_residential_trade_interleave', durationAssetStableCode: 'masonry_infill_wall', t2RhythmTemplateId: RESIDENTIAL_T2_RHYTHM_TEMPLATE_IDS.secondaryFitout, quantityProxy: { value: standardFloorCount, unit: 'floor', basis: 'standard floors released after structure lag' }, durationFormula: 'max(standardFloorCount / masonry floor productivity, secondary-fitout T2 p50 rhythm)' },
      { code: `RMP-06-${String(buildingNo).padStart(2, '0')}-01`, title: `${buildingNo}#楼机电预留预埋与管井立管`, executionPhase: 'mep_roughin', executionLane: `tower_${buildingNo}`, startOffsetDays: towerStart + mepLagDays, durationDays: mepTowerDuration, predecessorCodes: [`${prefix}-02`], dependencyType: 'SS', lagDays: mepLagDays, dependencyIntentCode: 'asset_backed_residential_trade_interleave', durationAssetStableCode: 'mep_plumbing_fire_pipe', t2RhythmTemplateId: RESIDENTIAL_T2_RHYTHM_TEMPLATE_IDS.mep, quantityProxy: { value: Math.max(4, Math.ceil(standardFloorCount / 8)), unit: 'system_zone', basis: 'floor-count system-zone proxy' }, durationFormula: 'MEP T2 riser/branch p50 rhythm by system-zone proxy' },
      { code: `RMP-08-${String(buildingNo).padStart(2, '0')}-01`, title: `${buildingNo}#楼外立面与门窗封闭`, executionPhase: 'envelope_roof_facade', executionLane: `tower_${buildingNo}`, startOffsetDays: towerStart + facadeLagDays, durationDays: facadeTowerDuration, predecessorCodes: [`${prefix}-02`], dependencyType: 'SS', lagDays: facadeLagDays, dependencyIntentCode: 'asset_backed_residential_trade_interleave', durationAssetStableCode: 'curtain_wall_installation', t2RhythmTemplateId: RESIDENTIAL_T2_RHYTHM_TEMPLATE_IDS.envelope, quantityProxy: { value: Math.max(3, Math.ceil(highestFloorCount / 10)), unit: 'facade_zone', basis: 'highest floor count facade-zone proxy' }, durationFormula: 'facade/envelope T2 p50 rhythm by facade-zone proxy' },
      { code: `RMP-09-${String(buildingNo).padStart(2, '0')}-01`, title: `${buildingNo}#楼室内抹灰地坪与粗装修`, executionPhase: 'interior_fitout_terminal', executionLane: `tower_${buildingNo}`, startOffsetDays: towerStart + interiorLagDays, durationDays: interiorRoughDuration, predecessorCodes: [`RMP-05-${String(buildingNo).padStart(2, '0')}-01`], dependencyType: 'SS', lagDays: Math.max(28, standardFloorCycleDays * 4), dependencyIntentCode: 'asset_backed_residential_trade_interleave', durationAssetStableCode: 'interior_unit_finish', t2RhythmTemplateId: RESIDENTIAL_T2_RHYTHM_TEMPLATE_IDS.decoration, quantityProxy: { value: Math.max(3, Math.ceil(standardFloorCount / 10)), unit: 'fitout_zone', basis: 'standard-floor rough-fitout zone proxy' }, durationFormula: 'decoration T2 p50 rhythm by rough-fitout zone proxy' },
      { code: `RMP-05-${String(buildingNo).padStart(2, '0')}-02`, title: `${buildingNo}#楼砌体样板验收与精装作业面移交`, executionPhase: 'secondary_structure_fitout_roughin', executionLane: `tower_${buildingNo}`, startOffsetDays: towerStart + secondaryLagDays + sampleHandoverLagDays, durationDays: sampleHandoverDuration, predecessorCodes: [`RMP-05-${String(buildingNo).padStart(2, '0')}-01`], dependencyType: 'SS', lagDays: sampleHandoverLagDays, dependencyIntentCode: 'asset_backed_residential_workface_handover', durationAssetStableCode: 'masonry_infill_wall', t2RhythmTemplateId: RESIDENTIAL_T2_RHYTHM_TEMPLATE_IDS.secondaryFitout, quantityProxy: { value: Math.max(3, Math.ceil(standardFloorCount / 10)), unit: 'handover_zone', basis: 'standard-floor masonry sample and fitout handover-zone proxy' }, durationFormula: 'masonry seed plus secondary-fitout T2 sample acceptance and workface handover window' },
      { code: `RMP-09-${String(buildingNo).padStart(2, '0')}-02`, title: `${buildingNo}#楼户内精装与公共部位装修`, executionPhase: 'interior_fitout_terminal', executionLane: `tower_${buildingNo}`, startOffsetDays: towerStart + interiorLagDays + interiorFinishDuration, durationDays: interiorFinishDuration, predecessorRules: [
        { code: `RMP-09-${String(buildingNo).padStart(2, '0')}-01`, dependencyType: 'SS', lagDays: Math.max(56, standardFloorCycleDays * 8), intentCode: 'asset_backed_residential_trade_interleave' },
        { code: `RMP-06-${String(buildingNo).padStart(2, '0')}-01`, dependencyType: 'SS', lagDays: Math.max(56, standardFloorCycleDays * 8), intentCode: 'asset_backed_residential_trade_interleave' },
        { code: `RMP-05-${String(buildingNo).padStart(2, '0')}-02`, dependencyType: 'FS', lagDays: 0, intentCode: 'asset_backed_residential_sample_acceptance_release' },
      ], durationAssetStableCode: 'interior_public_finish', t2RhythmTemplateId: RESIDENTIAL_T2_RHYTHM_TEMPLATE_IDS.decoration, quantityProxy: { value: Math.max(3, Math.ceil(standardFloorCount / 12)), unit: 'finish_zone', basis: 'standard-floor finish-zone proxy' }, durationFormula: 'decoration T2 p50 rhythm by finish-zone proxy after sample acceptance and MEP interface release' },
      { code: `RMP-06-${String(buildingNo).padStart(2, '0')}-02`, title: `${buildingNo}#楼机电支管安装、试压与末端接驳`, executionPhase: 'mep_roughin', executionLane: `tower_${buildingNo}`, startOffsetDays: towerStart + mepLagDays + Math.max(75, Math.round(mepTowerDuration * 0.55)), durationDays: Math.max(45, Math.round(mepTowerDuration * 0.38)), predecessorCodes: [`RMP-06-${String(buildingNo).padStart(2, '0')}-01`], dependencyType: 'SS', lagDays: Math.max(75, Math.round(mepTowerDuration * 0.55)), dependencyIntentCode: 'asset_backed_residential_mep_branch_release', durationAssetStableCode: 'mep_plumbing_fire_pipe', t2RhythmTemplateId: RESIDENTIAL_T2_RHYTHM_TEMPLATE_IDS.mep, quantityProxy: { value: Math.max(4, Math.ceil(standardFloorCount / 8)), unit: 'system_zone', basis: 'floor-count MEP branch and pressure-test zone proxy' }, durationFormula: 'MEP seed plus riser-branch-pressure T2 terminal connection window' },
      { code: `RMP-08-${String(buildingNo).padStart(2, '0')}-02`, title: `${buildingNo}#楼外窗塞缝淋水与外围护封闭验收`, executionPhase: 'envelope_roof_facade', executionLane: `tower_${buildingNo}`, startOffsetDays: towerStart + facadeLagDays + Math.max(105, Math.round(facadeTowerDuration * 0.7)), durationDays: Math.max(25, Math.round(facadeTowerDuration * 0.2)), predecessorCodes: [`RMP-08-${String(buildingNo).padStart(2, '0')}-01`], dependencyType: 'SS', lagDays: Math.max(105, Math.round(facadeTowerDuration * 0.7)), dependencyIntentCode: 'asset_backed_residential_envelope_watertight_handover', durationAssetStableCode: 'curtain_wall_installation', t2RhythmTemplateId: RESIDENTIAL_T2_RHYTHM_TEMPLATE_IDS.envelope, quantityProxy: { value: Math.max(3, Math.ceil(highestFloorCount / 10)), unit: 'facade_zone', basis: 'facade-zone watertight-test and enclosure-handover proxy' }, durationFormula: 'curtain-wall seed plus facade/roof T2 watertight handover window' },
      { code: `RMP-08-${String(buildingNo).padStart(2, '0')}-03`, title: `${buildingNo}#楼外立面收口与外架拆除`, executionPhase: 'envelope_roof_facade', executionLane: `tower_${buildingNo}`, startOffsetDays: towerStart + facadeLagDays + facadeTowerDuration - 5, durationDays: perTowerFacadeCloseoutDuration, predecessorRules: [
        { code: `RMP-08-${String(buildingNo).padStart(2, '0')}-01`, dependencyType: 'FF', lagDays: -5, intentCode: 'asset_backed_residential_envelope_closeout' },
        { code: `RMP-08-${String(buildingNo).padStart(2, '0')}-02`, dependencyType: 'FS', lagDays: 0, intentCode: 'asset_backed_residential_envelope_handover_release' },
      ], durationAssetStableCode: 'curtain_wall_installation', t2RhythmTemplateId: RESIDENTIAL_T2_RHYTHM_TEMPLATE_IDS.envelope, quantityProxy: { value: perTowerFacadeCloseoutAreaProxyM2, unit: 'm2', basis: 'totalAreaM2 * 0.08 / buildingCount per-tower facade closeout area proxy' }, durationCalculationBasis: { minDays: 30, maxDays: 90, fallbackDays: 45, fixedBufferDays: 15, selectionRule: 'facade_closeout_productivity_by_tower_area_plus_scaffold_removal_buffer_asset_backed_candidate_l1' }, durationFormula: 'per-tower facade closeout and scaffold removal after enclosure acceptance' },
      { code: `RMP-10-02-${String(buildingNo).padStart(2, '0')}`, title: `${buildingNo}#楼正式电梯安装`, executionPhase: 'elevator_installation', executionLane: `tower_${buildingNo}`, startOffsetDays: towerStart + elevatorInstallLagDays, durationDays: perTowerElevatorInstallationDuration, predecessorRules: [
        { code: `${prefix}-02`, dependencyType: 'SS', lagDays: elevatorInstallLagDays, intentCode: 'asset_backed_residential_elevator_shaft_release' },
      ], durationAssetStableCode: 'elevator_traction_installation', t2RhythmTemplateId: RESIDENTIAL_T2_RHYTHM_TEMPLATE_IDS.mep, quantityProxy: { value: perTowerElevatorShaftQuantityProxy, unit: 'shaft', basis: 'two elevator shafts per residential tower cold-start proxy' }, durationCalculationBasis: { minDays: 60, maxDays: 180, fallbackDays: 100, fixedBufferDays: 45, selectionRule: 'elevator_installation_productivity_by_tower_shaft_plus_inspection_buffer_asset_backed_candidate_l1' }, durationFormula: 'per-tower elevator installation after its own structural shaft workface release' },
      { code: `RMP-09-${String(buildingNo).padStart(2, '0')}-03`, title: `${buildingNo}#楼精装末端安装、成品保护与分户初验`, executionPhase: 'interior_fitout_terminal', executionLane: `tower_${buildingNo}`, startOffsetDays: towerStart + interiorLagDays + interiorFinishDuration + Math.max(70, Math.round(interiorFinishDuration * 0.62)), durationDays: Math.max(30, Math.round(interiorFinishDuration * 0.25)), predecessorCodes: [`RMP-09-${String(buildingNo).padStart(2, '0')}-02`], dependencyType: 'SS', lagDays: Math.max(70, Math.round(interiorFinishDuration * 0.62)), dependencyIntentCode: 'asset_backed_residential_fitout_quality_handover', durationAssetStableCode: 'interior_public_finish', t2RhythmTemplateId: RESIDENTIAL_T2_RHYTHM_TEMPLATE_IDS.decoration, quantityProxy: { value: Math.max(3, Math.ceil(standardFloorCount / 12)), unit: 'finish_zone', basis: 'finish-zone terminal-installation and initial-inspection proxy' }, durationFormula: 'interior-finish seed plus decoration T2 terminal closeout and initial-inspection window' },
    ]
    activities.push(...towerActivities.map((activity) => ({
      ...activity,
      ...(activity.code === `${prefix}-01`
        ? {
            dependencyType: 'FS' as const,
            lagDays: index * towerReleaseDays,
            dependencyIntentCode: 'project_organization_tower_lane_release',
          }
        : {}),
      buildingSequenceNumber: buildingNo,
      organizationLaneReleaseStepDays: towerReleaseDays,
      organizationLaneReleaseLagDays: index * towerReleaseDays,
    })))
  }

  activities.push(
    { code: 'RMP-06-90', title: '地下室机电管线综合与设备基础', executionPhase: 'basement_structure', executionLane: 'basement_mep', startOffsetDays: mepStart - 12, durationDays: basementMepCoordinationDuration, predecessorCodes: ['RMP-03-03'], dependencyType: 'SS', lagDays: mepLagDays, dependencyIntentCode: 'asset_backed_residential_trade_interleave', durationAssetStableCode: 'mep_plumbing_fire_pipe', t2RhythmTemplateId: RESIDENTIAL_T2_RHYTHM_TEMPLATE_IDS.mep, quantityProxy: { value: basementMepEffectivePipeLengthM, unit: 'm', basis: 'basementAreaProxyM2 * 0.05 residential basement MEP effective pipe length proxy' }, durationCalculationBasis: { minDays: 140, maxDays: 260, fallbackDays: 160, fixedBufferDays: 38, selectionRule: 'basement_mep_pipe_productivity_by_effective_length_plus_coordination_buffer_asset_backed_candidate_l1' }, durationFormula: 'max(real-plan basement MEP skeleton, ceil(basementEffectivePipeLength / mep_plumbing_fire_pipe seed p50PerDay) + coordination buffer)' },
    { code: 'RMP-03-06', title: '地下车库地坪与交通设施施工', executionPhase: 'interior_fitout_terminal', executionLane: 'basement_finish', startOffsetDays: mepStart + 80, durationDays: 60, predecessorCodes: ['RMP-06-90'], dependencyType: 'SS', lagDays: 90, dependencyIntentCode: 'asset_backed_residential_basement_finish_release', durationAssetStableCode: 'interior_public_finish', t2RhythmTemplateId: RESIDENTIAL_T2_RHYTHM_TEMPLATE_IDS.decoration, quantityProxy: { value: Math.max(2, basementLevelCount), unit: 'basement_zone', basis: 'basement-level finish and traffic-facility zone proxy' }, durationFormula: 'interior-finish seed plus basement floor and traffic-facility release window' },
    { code: 'RMP-06-91', title: '消防给排水与通风系统安装', executionPhase: 'mep_roughin', executionLane: 'mep_common', startOffsetDays: mepStart + 45, durationDays: commonMepInstallDuration, predecessorCodes: ['RMP-06-90'], durationAssetStableCode: 'mep_plumbing_fire_pipe', t2RhythmTemplateId: RESIDENTIAL_T2_RHYTHM_TEMPLATE_IDS.mep, quantityProxy: { value: commonMepEffectivePipeLengthM, unit: 'm', basis: 'totalAreaM2 * 0.08 residential common plumbing/fire effective pipe length proxy' }, durationCalculationBasis: { minDays: 160, maxDays: 360, fallbackDays: 210, fixedBufferDays: 60, selectionRule: 'mep_common_pipe_productivity_by_effective_length_plus_testing_buffer_asset_backed_candidate_l1' }, durationFormula: 'max(real-plan common MEP skeleton, ceil(effectivePipeLength / mep_plumbing_fire_pipe seed p50PerDay) + testing buffer)' },
    { code: 'RMP-06-92', title: '变配电设备安装、受电与正式送电', executionPhase: 'mep_roughin', executionLane: 'power_supply', startOffsetDays: mepStart + 185, durationDays: 60, predecessorCodes: ['RMP-06-91'], dependencyType: 'SS', lagDays: 145, dependencyIntentCode: 'asset_backed_residential_power_energization_release', durationAssetStableCode: 'mep_plumbing_fire_pipe', t2RhythmTemplateId: RESIDENTIAL_T2_RHYTHM_TEMPLATE_IDS.mep, quantityProxy: { value: Math.max(2, buildingCount + basementLevelCount), unit: 'power_zone', basis: 'building and basement power-zone proxy for energization readiness' }, durationFormula: 'MEP seed plus power-zone installation, acceptance and energization window' },
    { code: 'RMP-07-01', title: '屋面防水保温与屋面工程', executionPhase: 'envelope_roof_facade', executionLane: 'roof', startOffsetDays: roofStart, durationDays: roofWaterproofDuration, predecessorCodes: [`RMP-04-${String(buildingCount).padStart(2, '0')}-03`], dependencyType: 'FS', lagDays: 0, dependencyIntentCode: 'asset_backed_residential_envelope_closeout', durationAssetStableCode: 'roof_waterproof_insulation', t2RhythmTemplateId: RESIDENTIAL_T2_RHYTHM_TEMPLATE_IDS.envelope, quantityProxy: { value: roofWaterproofAreaProxyM2, unit: 'm2', basis: 'max(buildingCount * 600, totalAreaM2 * 0.04) residential roof waterproofing area proxy' }, durationCalculationBasis: { minDays: 45, maxDays: 120, fallbackDays: 55, fixedBufferDays: 25, selectionRule: 'roof_waterproof_productivity_by_roof_area_plus_ponding_closeout_buffer_asset_backed_candidate_l1' }, durationFormula: 'max(real-plan roof skeleton, ceil(roofWaterproofArea / roof_waterproof_insulation seed p50PerDay) + ponding/closeout buffer)' },
    { code: 'RMP-10-03', title: '全部电梯安装调试与监督检验', executionPhase: 'elevator_installation', executionLane: 'elevator_installation', startOffsetDays: elevatorStart + (buildingCount - 1) * towerReleaseDays + perTowerElevatorInstallationDuration, durationDays: elevatorFinalAcceptanceDuration, predecessorCodes: Array.from({ length: buildingCount }, (_, index) => `RMP-10-02-${String(index + 1).padStart(2, '0')}`), durationAssetStableCode: 'elevator_traction_final_acceptance', t2RhythmTemplateId: RESIDENTIAL_T2_RHYTHM_TEMPLATE_IDS.commissioning, quantityProxy: { value: elevatorShaftQuantityProxy, unit: 'shaft', basis: 'two elevator shafts per residential tower cold-start proxy for final acceptance' }, durationCalculationBasis: { minDays: 24, maxDays: 80, fallbackDays: 30, fixedBufferDays: 14, selectionRule: 'elevator_final_acceptance_productivity_by_all_tower_shafts_plus_supervision_buffer_asset_backed_candidate_l1' }, durationFormula: 'all tower elevator installations converge before commissioning, supervision inspection and retest closeout' },
    { code: 'RMP-11-01', title: '室外管网施工', executionPhase: 'outdoor_municipal_landscape', executionLane: 'outdoor', startOffsetDays: outdoorStart, durationDays: Math.max(60, Math.round(outdoorDuration * 0.62)), predecessorCodes: ['RMP-03-04'], dependencyType: 'SS', lagDays: Math.max(0, outdoorStart - basementExteriorWaterproofBackfillStart), dependencyIntentCode: 'asset_backed_outdoor_release_after_heavy_transport', durationAssetStableCode: 'outdoor_utilities', t2RhythmTemplateId: RESIDENTIAL_T2_RHYTHM_TEMPLATE_IDS.outdoor, quantityProxy: { value: Math.max(260, Math.round(Math.sqrt(totalAreaM2) * 1.8)), unit: 'm', basis: 'site frontage proxy from totalAreaM2 for outdoor utilities release' }, durationCalculationBasis: { minDays: 60, maxDays: 160, fallbackDays: 125, fixedBufferDays: 45, selectionRule: 'outdoor_utilities_productivity_split_window_asset_backed_candidate_l1' }, durationFormula: 'outdoor_utilities seed by site frontage proxy and outdoor T2 rhythm' },
    { code: 'RMP-11-02', title: '道路场坪与景观绿化', executionPhase: 'outdoor_municipal_landscape', executionLane: 'outdoor', startOffsetDays: outdoorStart + Math.max(42, Math.round(outdoorDuration * 0.38)), durationDays: Math.max(70, Math.round(outdoorDuration * 0.74)), predecessorCodes: ['RMP-11-01'], dependencyType: 'SS', lagDays: Math.max(35, Math.round(outdoorDuration * 0.35)), dependencyIntentCode: 'asset_backed_outdoor_release_after_heavy_transport', durationAssetStableCode: 'outdoor_utilities', t2RhythmTemplateId: RESIDENTIAL_T2_RHYTHM_TEMPLATE_IDS.outdoor, quantityProxy: { value: Math.max(260, Math.round(Math.sqrt(totalAreaM2) * 1.8)), unit: 'm', basis: 'site frontage proxy from totalAreaM2 for outdoor road-landscape overlap' }, durationCalculationBasis: { minDays: 70, maxDays: 160, fallbackDays: 125, fixedBufferDays: 45, selectionRule: 'outdoor_t2_pipe_road_landscape_overlap_asset_backed_candidate_l1' }, durationFormula: 'outdoor T2 pipe-road-landscape controlled overlap' },
    { code: 'RMP-11-03', title: '室外工程收尾与综合验收配合', executionPhase: 'outdoor_municipal_landscape', executionLane: 'outdoor', startOffsetDays: outdoorStart + outdoorDuration, durationDays: 24, predecessorCodes: ['RMP-11-02'], durationAssetStableCode: 'outdoor_utilities', t2RhythmTemplateId: RESIDENTIAL_T2_RHYTHM_TEMPLATE_IDS.outdoor, durationFormula: 'outdoor T2 handover closeout gate' },
    { code: 'RMP-12-01', title: '机电系统单机调试', executionPhase: 'commissioning', executionLane: 'commissioning', startOffsetDays: commissioningStart, durationDays: singleSystemCommissioningDuration, predecessorCodes: ['RMP-06-91', 'RMP-06-92', 'RMP-10-03'], durationAssetStableCode: 'single_system_commissioning', t2RhythmTemplateId: RESIDENTIAL_T2_RHYTHM_TEMPLATE_IDS.commissioning, quantityProxy: { value: singleSystemCommissioningSystemZoneProxy, unit: 'system_zone', basis: 'building count + basement levels + totalAreaM2/40000 system-zone proxy' }, durationCalculationBasis: { minDays: 32, maxDays: 96, fallbackDays: 32, fixedBufferDays: 24, selectionRule: 'single_system_commissioning_productivity_by_system_zone_plus_retest_buffer_asset_backed_candidate_l1' }, durationFormula: 'max(real-plan single-system commissioning skeleton, ceil(systemZones / single_system_commissioning seed p50PerDay) + retest buffer)' },
    { code: 'RMP-12-02', title: '消防联动与系统联合调试', executionPhase: 'commissioning', executionLane: 'commissioning', startOffsetDays: commissioningStart + 28, durationDays: integratedCommissioningDuration, predecessorCodes: ['RMP-12-01'], dependencyType: 'SS', lagDays: 28, dependencyIntentCode: 'asset_backed_integrated_commissioning_overlap', durationAssetStableCode: 'integrated_commissioning', t2RhythmTemplateId: RESIDENTIAL_T2_RHYTHM_TEMPLATE_IDS.commissioning, quantityProxy: { value: integratedCommissioningLinkageScenarioProxy, unit: 'linkage_scenario', basis: 'building count + basement levels + totalAreaM2/60000 + life-safety linkage scenario buffer' }, durationCalculationBasis: { minDays: 38, maxDays: 120, fallbackDays: 38, fixedBufferDays: 18, selectionRule: 'integrated_commissioning_productivity_by_linkage_scenario_plus_witness_buffer_asset_backed_candidate_l1' }, durationFormula: 'max(real-plan integrated commissioning skeleton, ceil(linkageScenarios / integrated_commissioning seed p50PerDay) + witness/retest buffer)' },
    { code: 'RMP-12-03', title: '分户验收问题整改与销项', executionPhase: 'commissioning', executionLane: 'quality_closeout', startOffsetDays: commissioningStart + 42, durationDays: 45, predecessorCodes: [...Array.from({ length: buildingCount }, (_, index) => `RMP-09-${String(index + 1).padStart(2, '0')}-03`), 'RMP-12-01'], dependencyType: 'SS', lagDays: 42, dependencyIntentCode: 'asset_backed_handover_defect_closeout', durationAssetStableCode: 'integrated_commissioning', t2RhythmTemplateId: RESIDENTIAL_T2_RHYTHM_TEMPLATE_IDS.commissioning, durationFormula: 'handover defect closeout from commissioning T2 rhythm, not checklist expansion' },
    { code: 'RMP-12-04', title: '给排水消防通风电气系统功能验收', executionPhase: 'commissioning', executionLane: 'commissioning', startOffsetDays: commissioningStart + 45, durationDays: 28, predecessorCodes: ['RMP-12-02'], dependencyType: 'SS', lagDays: 17, dependencyIntentCode: 'asset_backed_residential_system_function_acceptance', durationAssetStableCode: 'integrated_commissioning', t2RhythmTemplateId: RESIDENTIAL_T2_RHYTHM_TEMPLATE_IDS.commissioning, quantityProxy: { value: integratedCommissioningLinkageScenarioProxy, unit: 'system_acceptance_scenario', basis: 'integrated system acceptance scenario proxy from project scale facts' }, durationFormula: 'integrated-commissioning seed plus functional acceptance and retest window' },
    { code: 'RMP-13-01', title: '消防专项验收', executionPhase: 'acceptance_handover', executionLane: 'acceptance', startOffsetDays: acceptanceStart, durationDays: 20, predecessorCodes: ['RMP-12-02', 'RMP-12-04', 'RMP-11-03'], durationAssetStableCode: 'integrated_commissioning', t2RhythmTemplateId: RESIDENTIAL_T2_RHYTHM_TEMPLATE_IDS.commissioning, planItemKind: 'inspection_task', durationContributionMode: 'quality_gate', executionNature: 'inspection_test', durationFormula: 'fire acceptance control gate after linkage commissioning, system function acceptance and fire-access closeout' },
    { code: 'RMP-13-02', title: '人防专项验收', executionPhase: 'acceptance_handover', executionLane: 'acceptance', startOffsetDays: acceptanceStart + 5, durationDays: 15, predecessorCodes: ['RMP-12-04', 'RMP-03-06'], durationAssetStableCode: 'integrated_commissioning', t2RhythmTemplateId: RESIDENTIAL_T2_RHYTHM_TEMPLATE_IDS.commissioning, planItemKind: 'inspection_task', durationContributionMode: 'quality_gate', executionNature: 'inspection_test', durationFormula: 'civil-defense acceptance control gate after basement finishes and system function acceptance' },
    { code: 'RMP-13-03', title: '节能专项验收', executionPhase: 'acceptance_handover', executionLane: 'acceptance', startOffsetDays: acceptanceStart + 10, durationDays: 15, predecessorCodes: ['RMP-12-04', 'RMP-07-01', ...Array.from({ length: buildingCount }, (_, index) => `RMP-08-${String(index + 1).padStart(2, '0')}-03`)], durationAssetStableCode: 'integrated_commissioning', t2RhythmTemplateId: RESIDENTIAL_T2_RHYTHM_TEMPLATE_IDS.commissioning, planItemKind: 'inspection_task', durationContributionMode: 'quality_gate', executionNature: 'inspection_test', durationFormula: 'energy-efficiency acceptance control gate after roof, system and every tower envelope closeout' },
    { code: 'RMP-13-04', title: '规划核实', executionPhase: 'acceptance_handover', executionLane: 'acceptance', startOffsetDays: acceptanceStart + 10, durationDays: 20, predecessorCodes: ['RMP-11-03', ...Array.from({ length: buildingCount }, (_, index) => `RMP-08-${String(index + 1).padStart(2, '0')}-03`)], durationAssetStableCode: 'integrated_commissioning', t2RhythmTemplateId: RESIDENTIAL_T2_RHYTHM_TEMPLATE_IDS.commissioning, planItemKind: 'inspection_task', durationContributionMode: 'quality_gate', executionNature: 'inspection_test', durationFormula: 'planning verification control gate after outdoor works and every tower facade closeout' },
    { code: 'RMP-13-05', title: '竣工预验收、问题整改与资料归档', executionPhase: 'acceptance_handover', executionLane: 'acceptance', startOffsetDays: acceptanceStart + 31, durationDays: 25, predecessorCodes: ['RMP-13-01', 'RMP-13-02', 'RMP-13-03', 'RMP-13-04'], durationAssetStableCode: 'integrated_commissioning', t2RhythmTemplateId: RESIDENTIAL_T2_RHYTHM_TEMPLATE_IDS.commissioning, planItemKind: 'inspection_task', durationContributionMode: 'quality_gate', executionNature: 'inspection_test', durationFormula: 'pre-acceptance, defect closure and completion-file closeout after all statutory acceptance gates' },
    { code: 'RMP-13-06', title: '竣工验收', executionPhase: 'acceptance_handover', executionLane: 'acceptance', startOffsetDays: acceptanceStart + 56, durationDays: 1, predecessorCodes: ['RMP-13-05'], durationAssetStableCode: 'integrated_commissioning', t2RhythmTemplateId: RESIDENTIAL_T2_RHYTHM_TEMPLATE_IDS.commissioning, planItemKind: 'milestone', durationContributionMode: 'handover_marker', executionNature: 'handover_milestone', durationFormula: 'formal completion acceptance milestone after pre-acceptance closeout' },
    { code: 'RMP-13-07', title: '竣工备案、档案及物业移交', executionPhase: 'acceptance_handover', executionLane: 'acceptance', startOffsetDays: acceptanceStart + 57, durationDays: 20, predecessorCodes: ['RMP-13-06'], durationAssetStableCode: 'integrated_commissioning', t2RhythmTemplateId: RESIDENTIAL_T2_RHYTHM_TEMPLATE_IDS.commissioning, planItemKind: 'document_task', durationContributionMode: 'quality_gate', executionNature: 'document_record', durationFormula: 'post-acceptance filing, archive transfer and property-management handover retained as an explicit master-plan control window' },
    { code: 'RMP-13-08', title: '项目交付完成', executionPhase: 'acceptance_handover', executionLane: 'acceptance', startOffsetDays: acceptanceStart + 77, durationDays: 1, predecessorCodes: ['RMP-13-07'], durationAssetStableCode: 'integrated_commissioning', t2RhythmTemplateId: RESIDENTIAL_T2_RHYTHM_TEMPLATE_IDS.commissioning, planItemKind: 'milestone', durationContributionMode: 'handover_marker', executionNature: 'handover_milestone', durationFormula: 'project delivery completion milestone after filing, archive and property handover' },
  )
  const outdoorCloseout = activities.find((activity) => activity.code === 'RMP-11-03')
  const startupAssetBackedRows: Array<{
    code: string
    durationDays: number
    quantityProxy: NonNullable<ResidentialMasterPlanActivity['quantityProxy']>
    durationCalculationBasis: NonNullable<ResidentialMasterPlanActivity['durationCalculationBasis']>
    durationFormula: string
  }> = [
    { code: 'RMP-01-01', durationDays: siteMobilizationDuration, quantityProxy: { value: siteMobilizationWorkfaceProxy, unit: 'startup_workface', basis: 'building count + basement levels + totalAreaM2/60000 site handover workface proxy' }, durationCalculationBasis: { minDays: 8, maxDays: 40, fallbackDays: 10, fixedBufferDays: 4, selectionRule: 'site_mobilization_productivity_by_workface_plus_handover_buffer_asset_backed_candidate_l1' }, durationFormula: 'ceil(siteMobilizationWorkfaces / site_setup_temp_works seed p50PerDay) + handover buffer' },
    { code: 'RMP-01-02', durationDays: siteAccessFencingRoadDuration, quantityProxy: { value: siteAccessWorkfaceProxy, unit: 'startup_workface', basis: 'building count + basement levels + totalAreaM2/50000 access/fencing/temporary-road workface proxy' }, durationCalculationBasis: { minDays: 12, maxDays: 50, fallbackDays: 14, fixedBufferDays: 8, selectionRule: 'site_access_fencing_road_productivity_by_workface_plus_access_buffer_asset_backed_candidate_l1' }, durationFormula: 'ceil(siteAccessWorkfaces / site_setup_temp_works seed p50PerDay) + access-road buffer' },
    { code: 'RMP-01-04', durationDays: temporaryUtilitiesDuration, quantityProxy: { value: temporaryUtilitiesWorkfaceProxy, unit: 'startup_workface', basis: 'building count + basement levels + totalAreaM2/70000 temporary utility workface proxy' }, durationCalculationBasis: { minDays: 12, maxDays: 55, fallbackDays: 24, fixedBufferDays: 12, selectionRule: 'temporary_utilities_productivity_by_workface_plus_acceptance_buffer_asset_backed_candidate_l1' }, durationFormula: 'ceil(temporaryUtilityWorkfaces / site_setup_temp_works seed p50PerDay) + temporary utility acceptance buffer' },
    { code: 'RMP-01-05', durationDays: towerCraneFoundationDuration, quantityProxy: { value: towerCraneQuantityProxy, unit: 'tower_crane', basis: 'one tower crane readiness proxy per residential tower' }, durationCalculationBasis: { minDays: 12, maxDays: 45, fallbackDays: 18, fixedBufferDays: 12, selectionRule: 'tower_crane_foundation_productivity_by_crane_count_plus_testing_buffer_asset_backed_candidate_l1' }, durationFormula: 'ceil(towerCraneCount / site_setup_temp_works seed p50PerDay) + foundation/testing buffer' },
    { code: 'RMP-01-06', durationDays: towerCraneInstallDuration, quantityProxy: { value: towerCraneQuantityProxy, unit: 'tower_crane', basis: 'one tower crane installation readiness proxy per residential tower' }, durationCalculationBasis: { minDays: 10, maxDays: 35, fallbackDays: 14, fixedBufferDays: 10, selectionRule: 'tower_crane_install_productivity_by_crane_count_plus_commissioning_buffer_asset_backed_candidate_l1' }, durationFormula: 'ceil(towerCraneCount / site_setup_temp_works seed p50PerDay) + installation/commissioning buffer' },
  ]
  for (const assetBackedRow of startupAssetBackedRows) {
    const activity = activities.find((candidate) => candidate.code === assetBackedRow.code)
    if (!activity) continue
    activity.durationDays = assetBackedRow.durationDays
    activity.quantityProxy = assetBackedRow.quantityProxy
    activity.durationCalculationBasis = assetBackedRow.durationCalculationBasis
    activity.durationFormula = assetBackedRow.durationFormula
  }

  const foundationAssetBackedRows: Array<{
    code: string
    durationDays: number
    quantityProxy: NonNullable<ResidentialMasterPlanActivity['quantityProxy']>
    durationCalculationBasis: NonNullable<ResidentialMasterPlanActivity['durationCalculationBasis']>
    durationFormula: string
  }> = [
    { code: 'RMP-02-01', durationDays: foundationSupportReadinessDuration, quantityProxy: { value: supportFrontageM, unit: 'm', basis: 'sqrt(totalAreaM2) support frontage proxy for foundation support and dewatering readiness' }, durationCalculationBasis: { minDays: 18, maxDays: 70, fallbackDays: 24, fixedBufferDays: 14, selectionRule: 'foundation_support_readiness_productivity_by_frontage_plus_preparation_buffer_asset_backed_candidate_l1' }, durationFormula: 'ceil(supportFrontageM / expert_foundation_pit_support seed p50PerDay) + preparation buffer' },
    { code: 'RMP-02-06', durationDays: foundationCushionDuration, quantityProxy: { value: foundationCushionAreaProxyM2, unit: 'm2', basis: 'basementAreaProxyM2 * 0.33 foundation cushion and blinding release area proxy' }, durationCalculationBasis: { minDays: 12, maxDays: 70, fallbackDays: 14, fixedBufferDays: 10, selectionRule: 'foundation_cushion_productivity_by_area_plus_handover_buffer_asset_backed_candidate_l1' }, durationFormula: 'ceil(foundationCushionArea / cushion_and_blinding seed p50PerDay) + handover buffer' },
    { code: 'RMP-03-02', durationDays: basementSlabConcreteDuration, quantityProxy: { value: basementSlabConcreteVolumeProxyM3, unit: 'm3', basis: 'basementAreaProxyM2 * 0.08 basement slab concrete volume proxy' }, durationCalculationBasis: { minDays: 10, maxDays: 60, fallbackDays: 12, fixedBufferDays: 14, selectionRule: 'basement_slab_concrete_productivity_by_volume_plus_curing_buffer_asset_backed_candidate_l1' }, durationFormula: 'ceil(basementSlabConcreteVolume / cast_in_place_concrete seed p50PerDay) + curing buffer' },
    { code: 'RMP-03-03', durationDays: basementStructureDuration, quantityProxy: { value: basementStructureLevelProxy, unit: 'basement_level', basis: 'basementLevelCount structural cycle proxy with totalAreaM2-scaled coordination buffer' }, durationCalculationBasis: { minDays: 45, maxDays: 160, fallbackDays: Math.max(45, basementDuration - 42), fixedBufferDays: basementStructureProductivityBufferDays, selectionRule: 'basement_structure_productivity_by_level_plus_area_coordination_buffer_asset_backed_candidate_l1' }, durationFormula: 'ceil(basementStructureLevels / basement_structure seed p50PerDay) + area-scaled coordination buffer' },
  ]
  for (const assetBackedRow of foundationAssetBackedRows) {
    const activity = activities.find((candidate) => candidate.code === assetBackedRow.code)
    if (!activity) continue
    activity.durationDays = assetBackedRow.durationDays
    activity.quantityProxy = assetBackedRow.quantityProxy
    activity.durationCalculationBasis = assetBackedRow.durationCalculationBasis
    activity.durationFormula = assetBackedRow.durationFormula
  }

  if (outdoorCloseout) {
    outdoorCloseout.durationDays = outdoorCloseoutDuration
    outdoorCloseout.quantityProxy = {
      value: outdoorCloseoutFrontageProxyM,
      unit: 'm',
      basis: 'sqrt(totalAreaM2) * 0.63 residential outdoor closeout frontage proxy',
    }
    outdoorCloseout.durationCalculationBasis = {
      minDays: 20,
      maxDays: 70,
      fallbackDays: 24,
      fixedBufferDays: 14,
      selectionRule: 'outdoor_closeout_productivity_by_frontage_plus_handover_buffer_asset_backed_candidate_l1',
    }
    outdoorCloseout.durationFormula = 'max(real-plan outdoor closeout skeleton, ceil(outdoorCloseoutFrontage / outdoor_utilities seed p50PerDay) + handover buffer)'
  }

  const handoverDefectCloseout = activities.find((activity) => activity.code === 'RMP-12-03')
  if (handoverDefectCloseout) {
    handoverDefectCloseout.durationDays = handoverDefectCloseoutDuration
    handoverDefectCloseout.quantityProxy = {
      value: handoverDefectZoneProxy,
      unit: 'handover_defect_zone',
      basis: 'building count + basement levels + totalAreaM2/24000 handover defect closeout-zone proxy',
    }
    handoverDefectCloseout.durationCalculationBasis = {
      minDays: 35,
      maxDays: 120,
      fallbackDays: 45,
      fixedBufferDays: 18,
      selectionRule: 'handover_defect_closeout_productivity_by_zone_plus_rectification_buffer_asset_backed_candidate_l1',
    }
    handoverDefectCloseout.durationFormula = 'max(real-plan handover defect skeleton, ceil(defectCloseoutZones / integrated_commissioning seed p50PerDay) + rectification buffer)'
  }

  for (const activity of activities) {
    if (!activity.quantityProxy) continue
    activity.quantityProxy = {
      ...activity.quantityProxy,
      source: activity.quantityProxy.source ?? 'project_scale_facts',
    }
  }

  return activities
}



export function convertExistingMasterPlanScheduleRowsToResidentialEvidence(rows: GeneratedTemplateRow[]) {
  for (const row of rows) {
    if (getRowProjectionMode(row) !== 'schedule_row') continue
    const metadata = readRowMetadata(row)
    row.rowProjectionMode = 'linked_projection'
    row.scheduleParticipation = 'read_only_projection'
    row.linkedProjectionSource = {
      source: 'residential_master_plan_v2_template_support_projection',
      originalRowProjectionMode: 'schedule_row',
    }
    row.values = {
      ...row.values,
      row_projection_mode: 'linked_projection',
      schedule_participation: 'read_only_projection',
      linked_projection_source: row.linkedProjectionSource,
      standard_task_metadata: {
        ...metadata,
        rowProjectionMode: 'linked_projection',
        scheduleParticipation: 'read_only_projection',
        masterPlanProjectionPolicy: {
          source: 'residential_master_plan_v2_template_support_projection',
          originalRowProjectionMode: 'schedule_row',
        },
      },
    }
  }
}



export async function buildResidentialMasterPlanRow(params: {
  activity: ResidentialMasterPlanActivity
  index: number
  generationBatchId: string
  projectId: string
  startDate: string
  constructionCalendar?: ConstructionCalendarContext | null
  predecessorByCode: Map<string, string>
  predecessorActivityByCode?: Map<string, ResidentialMasterPlanActivity>
  masterPlanProfile: GeneratedMasterPlanProfile
  projectFacts: Record<string, unknown>
  seedLookup: StandardDurationSeedLookup
  t2Lookup?: T2RhythmTemplateLookup | null
  runtimeReferenceDays?: DefaultMasterPlanRuntimeReferenceDaysInput | null
  operation: PlanningTableOperation
  seedResolveContext?: AlgorithmSeedResolveContext
  organizationContext?: ResidentialMasterPlanOrganizationContext | null
}): Promise<GeneratedTemplateRow> {
  const authoritativeConstructionCalendar = isAuthoritativeConstructionCalendar(params.constructionCalendar)
  const calendarBasis = effectiveConstructionCalendarBasis(params.constructionCalendar)
  const constructionCalendarWindowCount = effectiveConstructionCalendarWindowCount(params.constructionCalendar)
  const planItemKind = params.activity.planItemKind ?? 'work_task'
  const isMilestone = planItemKind === 'milestone'
  const start = addTemplateProductionDays(params.startDate, params.activity.startOffsetDays, params.constructionCalendar)
  const baseSelectedDurationDays = isMilestone
    ? 1
    : calculateRuntimeReferenceDayDuration(
        params.activity,
        params.runtimeReferenceDays,
        params.activity.durationDays,
      ) ?? params.activity.durationDays
  const processSeasonalAdjustment = isMilestone
    ? null
    : await calculateDefaultMasterPlanProcessSeasonalDurationAdjustment({
        activity: params.activity,
        operation: params.operation,
        projectFacts: params.projectFacts,
        plannedStartDate: start,
        selectedDurationDays: baseSelectedDurationDays,
        seedResolveContext: params.seedResolveContext,
      })
  const selectedDurationDays = processSeasonalAdjustment?.adjustedDurationDays ?? baseSelectedDurationDays
  const runtimeReferenceDay = findRuntimeReferenceDayForActivity(params.activity, params.runtimeReferenceDays)
  const end = addTemplateProductionDays(start, Math.max(1, selectedDurationDays) - 1, params.constructionCalendar)
  const clientRowId = `${params.generationBatchId}:residential-master-plan-v2:${params.activity.code}`
  const organizationAssignment = resolveResidentialMasterPlanOrganizationAssignment(
    params.activity,
    params.organizationContext,
  )
  const predecessorRules: NonNullable<ResidentialMasterPlanActivity['predecessorRules']> = params.activity.predecessorRules?.length
    ? params.activity.predecessorRules.filter((rule, index, rules) => (
        Boolean(rule.code) && rules.findIndex((candidate) => candidate.code === rule.code) === index
      ))
    : uniqueStringArray(params.activity.predecessorCodes ?? []).map((code) => ({ code }))
  const predecessorRefs = predecessorRules
    .map((rule) => ({
      stableCode: rule.code,
      clientRowId: params.predecessorByCode.get(rule.code) ?? '',
      activity: params.predecessorActivityByCode?.get(rule.code) ?? null,
      rule,
    }))
    .filter((item) => item.clientRowId)
  const predecessorClientRowIds = predecessorRefs.map((item) => item.clientRowId)
  const durationContributionMode = params.activity.durationContributionMode ?? 'duration_bearing'
  const executionNature = params.activity.executionNature ?? 'physical_work'
  const progressMode = inferProgressMode(planItemKind, {})
  const scheduleParticipation = params.activity.durationContributionMode === 'record_only'
    ? 'reference_only'
    : 'primary_schedule'
  const rowProjectionMode = scheduleParticipation === 'reference_only'
    ? 'linked_projection'
    : 'schedule_row'
  const linkedProjectionSource = rowProjectionMode === 'linked_projection'
    ? {
      source: 'residential_master_plan_v2_support_reference',
      originalRowProjectionMode: 'schedule_row',
      mutationBoundary: params.masterPlanProfile.mutationBoundary,
    }
    : null
  const durationBoundaryRole = durationContributionMode === 'duration_bearing'
    ? 'standalone_duration'
    : 'package_child_window'
  const baseDurationAssetCalculation = buildAssetDurationCalculation(
    params.activity,
    baseSelectedDurationDays,
    params.seedLookup,
    params.runtimeReferenceDays,
    params.t2Lookup,
  )
  const durationAssetCalculation = processSeasonalAdjustment
    ? {
        ...baseDurationAssetCalculation,
        selectionRule: `${String(baseDurationAssetCalculation.selectionRule ?? 'asset_backed_candidate_l1')}+process_seasonal_sensitivity_candidate_l1`,
        selectedDurationDays,
        baseSelectedDurationDays: processSeasonalAdjustment.baseDurationDays,
        runtimeReferenceDaysAdjustedByProcessSeasonal: baseDurationAssetCalculation.runtimeReferenceDaysConsumed === true
          && selectedDurationDays !== processSeasonalAdjustment.baseDurationDays,
        processSeasonalDurationAssetConsumed: true,
        processSeasonalSource: processSeasonalAdjustment.source,
        processSeasonalStableCode: processSeasonalAdjustment.stableCode,
        processSeasonalMultiplier: processSeasonalAdjustment.multiplier,
        processSeasonalProductivityMultiplier: processSeasonalAdjustment.productivityMultiplier,
        processSeasonalClimateSignal: processSeasonalAdjustment.climateSignal,
        processSeasonalMonthlyClimateSignal: processSeasonalAdjustment.monthlyClimateSignal,
        processSeasonalImpactBand: processSeasonalAdjustment.impactBand,
        processSeasonalMonth: processSeasonalAdjustment.month,
        processSeasonalWorkEnvironment: processSeasonalAdjustment.workEnvironment,
        processSeasonalResolverSource: processSeasonalAdjustment.resolverSource,
        processSeasonalMutationBoundary: processSeasonalAdjustment.mutationBoundary,
      }
    : baseDurationAssetCalculation
  const baseDurationAssetMapping = buildResidentialDurationAssetMapping(
    params.activity,
    selectedDurationDays,
    params.seedLookup,
    params.runtimeReferenceDays,
    params.t2Lookup,
  )
  const durationAssetMapping = {
    ...baseDurationAssetMapping,
    durationAssetCalculation,
  }
  const durationCalibrationSource = durationAssetCalculation.source as GeneratedTemplateDurationSuggestion['durationCalibrationSource']
  const usesT2Rhythm = durationAssetCalculation.t2RhythmApplicability !== 'not_applicable_one_off_activity'
  const metadata = {
    stableCode: params.activity.code,
    standardWorkCode: params.activity.code,
    source: ASSET_BACKED_DEFAULT_MASTER_PLAN_SOURCE,
    sourceVersion: ASSET_BACKED_MASTER_PLAN_SOURCE_VERSION,
    rowProjectionMode,
    scheduleParticipation,
    durationContributionMode,
    planItemKind,
    progressMode,
    templateGroup: 'residential_master_plan',
    packType: 'core_quality',
    durationEvidence: {
      source: 'candidate_default_master_plan_baseline',
      calibrationSource: durationCalibrationSource,
      maturity: 'L1',
      reviewGate: null,
      mutationBoundary: params.masterPlanProfile.mutationBoundary,
    },
    durationBoundaryPolicy: 'parent_package_window',
    generationDepthPolicy: {
      policyId: 'residential_master_plan_v2_controlled_frontier',
      materializeDepth: 'item_work',
      durationComputeDepth: 'item_work',
      confidence: 'medium',
      drillDownAvailable: true,
      governance: {
        curationStatus: 'seeded',
        mutationBoundary: params.masterPlanProfile.mutationBoundary,
      },
    },
    residentialMasterPlan: {
      source: ASSET_BACKED_DEFAULT_MASTER_PLAN_SOURCE,
      generationSource: ASSET_BACKED_MASTER_PLAN_GENERATION_SOURCE,
      entryTemplateCode: RESIDENTIAL_DEFAULT_MASTER_PLAN_ENTRY_TEMPLATE_CODE,
      buildingCount: readOptionalNumber(params.projectFacts.buildingCount) ?? null,
      standardFloorCount: readOptionalNumber(params.projectFacts.standardFloorCount) ?? null,
      activityCode: params.activity.code,
      activityTags: params.activity.tags ?? [],
      organizationLaneReleaseStepDays: organizationAssignment?.releaseStepDays ?? null,
      organizationLaneReleaseLagDays: organizationAssignment?.releaseLagDays ?? null,
      mutationBoundary: params.masterPlanProfile.mutationBoundary,
    },
    masterPlanGeneration: {
      source: ASSET_BACKED_MASTER_PLAN_GENERATION_SOURCE,
      entryTemplateCode: RESIDENTIAL_DEFAULT_MASTER_PLAN_ENTRY_TEMPLATE_CODE,
      generatorAssetPolicy: 'real_plan_skeleton_plus_duration_rhythm_dependency_assets',
      skeletonRuleId: 'real_schedule_shape_main_control_plan_20260630',
      skeletonEvidenceRefs: REAL_PLAN_SKELETON_SOURCE_IDS,
      excludesManagementChecklistsFromPrimarySchedule: true,
      excludesMutuallyExclusiveMethodAlternatives: true,
      mutationBoundary: params.masterPlanProfile.mutationBoundary,
    },
    durationAssetMapping,
    durationAssetCalculation,
    ...(organizationAssignment
      ? {
          projectOrganization: {
            source: 'project_execution_organization_policy',
            policyId: organizationAssignment.policyId,
            strategy: organizationAssignment.strategy,
            policySource: organizationAssignment.policySource,
            policySourceVersion: organizationAssignment.policySourceVersion,
            organizationLane: organizationAssignment.organizationLane,
            organizationLaneRole: organizationAssignment.organizationLaneRole,
            organizationLaneIndex: organizationAssignment.organizationLaneIndex,
            organizationLaneTotal: organizationAssignment.organizationLaneTotal,
            organizationScopeGroup: organizationAssignment.organizationScopeGroup,
            sharedWork: organizationAssignment.sharedWork,
            confidence: organizationAssignment.confidence,
            networkPolicy: organizationAssignment.networkPolicy,
            governance: organizationAssignment.governance,
            resourcePolicy: organizationAssignment.resourcePolicy,
            laneRelease: {
              anchorStableCode: organizationAssignment.sharedWork ? null : 'RMP-03-05',
              releaseStepDays: organizationAssignment.releaseStepDays,
              releaseLagDays: organizationAssignment.releaseLagDays,
              basis: 'project_organization_policy_relative_to_actual_shared_interface',
            },
          },
        }
      : {}),
    executionPhase: params.activity.executionPhase,
    executionLane: params.activity.executionLane,
    executionNature,
    calendarBasis,
    constructionCalendarWindowCount,
    constructionCalendarRef: authoritativeConstructionCalendar ? params.constructionCalendar.calendarRef : null,
    constructionCalendarVersion: authoritativeConstructionCalendar ? params.constructionCalendar.calendarVersion : null,
    constructionCalendarTimezone: authoritativeConstructionCalendar
      ? params.constructionCalendar.timezone
      : params.constructionCalendar?.timezone ?? 'Asia/Shanghai',
    constructionCalendarAvailability: authoritativeConstructionCalendar ? 'available' : 'unavailable',
    executionSortKey: ((EXECUTION_PHASE_ORDER[params.activity.executionPhase] ?? 999) * 1_000_000) + params.index,
  }
  const durationRiskRange = isMilestone
    ? {
        ...buildDefaultMasterPlanDurationRiskRange(durationAssetCalculation, selectedDurationDays),
        p20Days: 1,
        p50Days: 1,
        p80Days: 1,
        uncertaintyBandDays: 0,
      }
    : buildDefaultMasterPlanDurationRiskRange(durationAssetCalculation, selectedDurationDays)
  const durationSuggestion = {
    recommendedDurationDays: selectedDurationDays,
    conservativeDurationDays: isMilestone ? 1 : Math.ceil(selectedDurationDays * 1.15),
    riskP20DurationDays: durationRiskRange.p20Days,
    riskP50DurationDays: durationRiskRange.p50Days,
    riskP80DurationDays: durationRiskRange.p80Days,
    durationRiskRange,
    durationOutputCode: 'plan_reference',
    durationOutputSemanticFieldName: 'planReferenceDays',
    durationOutputContract: buildDurationOutputContractSummary('plan_reference'),
    durationOutputWriteEvaluation: evaluateDurationOutputWrite({
      outputCode: 'plan_reference',
      target: 'plan_task_duration',
    }),
    durationOutputPromotion: null,
    confidenceLevel: 'medium',
    confidenceScore: 0.7,
    forecastSource: usesT2Rhythm
      ? 'standard_work_duration_seed+t2_division_rhythm_template+real_plan_evidence'
      : 'standard_work_duration_seed+system_schedule_rules',
    durationCalibrationSource,
    durationProvenance: 'candidate_asset_backed',
    businessReason: '住宅初始总控计划工期由系统标准工期、T2 节奏、项目规模、施工日历和依赖规则共同生成；已发布学习结果仅作为可选校准覆盖。',
    businessReasonCode: 'ASSET_BACKED_RESIDENTIAL_MASTER_PLAN_CANDIDATE',
    businessReasonCodes: ['ASSET_BACKED_RESIDENTIAL_MASTER_PLAN_CANDIDATE'],
    businessReasonParams: {
      activityCode: params.activity.code,
      source: ASSET_BACKED_DEFAULT_MASTER_PLAN_SOURCE,
      entryTemplateCode: RESIDENTIAL_DEFAULT_MASTER_PLAN_ENTRY_TEMPLATE_CODE,
      durationCalibrationSource,
      durationEvidenceSource: 'candidate_default_master_plan_baseline',
      durationEvidenceStatus: 'cold_start_baseline_or_published_learning_overlay',
      durationAssetMapping,
      durationAssetCalculation,
    },
    displaySummary: `候选主计划参考 ${selectedDurationDays} 天`,
    dataMaturity: 'L1',
    dataMaturityReasons: [
      'candidate default master plan uses governed real-plan evidence and seeded duration/rhythm assets',
      runtimeReferenceDay
        ? 'accepted runtime-calibrated reference days are consumed as candidate input without production writes'
        : 'system cold-start baseline is used; runtime calibration remains optional',
    ],
    dataUpgradePath: ['optional_runtime_calibration'],
    dataUpgradeBlockedBy: [],
    factorAvailability: {
      asset_backed_default_master_plan: true,
      residential_master_plan_entry_template: true,
      candidate_default_master_plan_baseline: true,
      standard_work_duration_seed: true,
      t2_division_rhythm_template_seed: usesT2Rhythm,
      external_real_plan_evidence: true,
      accepted_project_duration_samples: Boolean(runtimeReferenceDay),
    },
    durationContributionMode,
    durationBoundaryRole,
    planDurationTruthSource: ASSET_BACKED_MASTER_PLAN_TRUTH_SOURCE,
    planReferenceDays: selectedDurationDays,
  } satisfies GeneratedTemplateDurationSuggestion
  const predecessorDependencies = predecessorRefs.map((predecessorRef) => {
    const dependencyType = predecessorRef.rule.dependencyType ?? params.activity.dependencyType ?? 'FS' as const
    const lagDays = predecessorRef.rule.lagDays ?? params.activity.lagDays ?? 0
    const intentCode = predecessorRef.rule.intentCode
      ?? params.activity.dependencyIntentCode
      ?? 'asset_backed_residential_master_plan_sequence'
    return {
      clientRowId: predecessorRef.clientRowId,
      dependencyType,
      lagDays,
      intentCode,
      predecessorStableCode: predecessorRef.stableCode,
      predecessorStableCodes: [predecessorRef.stableCode],
      source: 'dependency_intent_template' as const,
      dependencyRuleEvidence: {
        ...buildDefaultMasterPlanDependencyRuleEvidence({
          intentCode,
          dependencyType,
          lagDays,
          predecessorStableCode: predecessorRef.stableCode,
          successorStableCode: params.activity.code,
          predecessorActivity: predecessorRef.activity,
          successorActivity: params.activity,
        }),
        ...(organizationAssignment
          && predecessorRef.stableCode === 'RMP-03-05'
          && organizationAssignment.organizationLaneRole !== 'shared_works'
          ? {
              projectOrganizationLaneRelease: {
                policyId: organizationAssignment.policyId,
                strategy: organizationAssignment.strategy,
                organizationLane: organizationAssignment.organizationLane,
                schedulingPolicy: organizationAssignment.networkPolicy.primaryLaneScheduling,
                sharedInterfaceStableCode: predecessorRef.stableCode,
                releaseStepDays: organizationAssignment.releaseStepDays,
                releaseLagDays: organizationAssignment.releaseLagDays,
                mutationBoundary: 'preview_no_write_wizard_commit_transactional',
              },
            }
          : {}),
      },
    }
  })
  return {
    clientRowId,
    parentClientRowId: null,
    parentRowId: null,
    sortOrder: params.index,
    predecessorClientRowIds,
    predecessorDependencies,
    rowProjectionMode,
    executionPhase: params.activity.executionPhase,
    executionLane: params.activity.executionLane,
    executionSortKey: ((EXECUTION_PHASE_ORDER[params.activity.executionPhase] ?? 999) * 1_000_000) + params.index,
    workfaceId: params.activity.executionLane,
    planItemKind,
    planItemTags: params.activity.tags ?? [],
    progressMode,
    scheduleParticipation,
    linkedProjectionSource,
    scopeExpansionMode: 'project',
    executionNature,
    durationSuggestion,
    values: {
      title: params.activity.title,
      planned_start_date: start,
      planned_end_date: end,
      start_date: start,
      end_date: end,
      progress: 0,
      status: 'todo',
      priority: 'medium',
      is_milestone: planItemKind === 'milestone',
      milestone_level: planItemKind === 'milestone' ? 'project' : null,
      is_wbs_summary: true,
      is_executable: false,
      wbs_node_type: 'item_work',
      category_type: 'item_work',
      template_id: 'residential_master_plan_v2',
      template_node_id: params.activity.code,
      source_template_id: 'residential_master_plan_v2',
      source_template_node_id: params.activity.code,
      template_group: 'residential_master_plan',
      pack_type: 'core_quality',
      generation_policy: 'asset_backed_default_master_plan_v1',
      generation_batch_id: params.generationBatchId,
      scope_index: 0,
      standard_work_code: params.activity.code,
      standard_work_name: params.activity.title,
      smart_reference_days: selectedDurationDays,
      duration_calibration_source: durationSuggestion.durationCalibrationSource,
      duration_provenance: durationSuggestion.durationProvenance,
      duration_evidence_source: 'candidate_default_master_plan_baseline',
      duration_evidence_maturity: durationSuggestion.dataMaturity,
      duration_review_required: false,
      duration_review_gate: null,
      duration_truth_source: durationSuggestion.planDurationTruthSource,
      duration_asset_mapping: durationAssetMapping,
      duration_asset_calculation: durationAssetCalculation,
      duration_contribution_mode: durationContributionMode,
      row_projection_mode: rowProjectionMode,
      execution_phase: params.activity.executionPhase,
      execution_lane: params.activity.executionLane,
      project_organization_policy_id: organizationAssignment?.policyId ?? null,
      project_organization_strategy: organizationAssignment?.strategy ?? null,
      organization_lane: organizationAssignment?.organizationLane ?? null,
      organization_lane_role: organizationAssignment?.organizationLaneRole ?? null,
      organization_lane_index: organizationAssignment?.organizationLaneIndex ?? null,
      organization_lane_total: organizationAssignment?.organizationLaneTotal ?? null,
      organization_scope_group: organizationAssignment?.organizationScopeGroup ?? null,
      organization_shared_work: organizationAssignment?.sharedWork ?? null,
      organization_confidence: organizationAssignment?.confidence ?? null,
      phase_object_id: organizationAssignment?.phaseObjectId ?? null,
      section_object_id: organizationAssignment?.sectionObjectId ?? null,
      building_object_id: organizationAssignment?.buildingObjectId ?? null,
      building_sequence_source: organizationAssignment?.buildingSequenceNumber == null
        ? null
        : 'project_organization_lane',
      building_sequence_index: organizationAssignment?.organizationLaneIndex ?? null,
      building_sequence_number: organizationAssignment?.buildingSequenceNumber ?? null,
      building_sequence_total: organizationAssignment?.buildingSequenceNumber == null
        ? null
        : organizationAssignment?.organizationLaneTotal ?? null,
      execution_sort_key: ((EXECUTION_PHASE_ORDER[params.activity.executionPhase] ?? 999) * 1_000_000) + params.index,
      execution_nature: executionNature,
      calendar_basis: calendarBasis,
      construction_calendar_window_count: constructionCalendarWindowCount,
      construction_calendar_ref: authoritativeConstructionCalendar ? params.constructionCalendar.calendarRef : null,
      construction_calendar_version: authoritativeConstructionCalendar ? params.constructionCalendar.calendarVersion : null,
      construction_calendar_timezone: authoritativeConstructionCalendar
        ? params.constructionCalendar.timezone
        : params.constructionCalendar?.timezone ?? 'Asia/Shanghai',
      construction_calendar_availability: authoritativeConstructionCalendar ? 'available' : 'unavailable',
      workface_id: params.activity.executionLane,
      plan_item_kind: planItemKind,
      progress_mode: progressMode,
      schedule_participation: scheduleParticipation,
      linked_projection_source: linkedProjectionSource,
      duration_suggestion: buildGeneratedDurationSuggestionValue(durationSuggestion, durationContributionMode),
      standard_task_metadata: metadata,
      master_plan_generation_source: ASSET_BACKED_MASTER_PLAN_GENERATION_SOURCE,
      master_plan_entry_template_code: RESIDENTIAL_DEFAULT_MASTER_PLAN_ENTRY_TEMPLATE_CODE,
      plan_skeleton_evidence_refs: REAL_PLAN_SKELETON_SOURCE_IDS,
      selected_method_variant_code: params.activity.methodVariantCode ?? null,
      material_required: false,
      acceptance_required: params.activity.executionPhase === 'acceptance_handover',
      source_type: ASSET_BACKED_DEFAULT_MASTER_PLAN_SOURCE,
      project_id: params.projectId,
    },
  }
}



export function readDefaultMasterPlanBusinessType(
  operation: PlanningTableOperation,
  projectFacts: Record<string, unknown>,
) {
  const scope = readRecord(operation.scope)
  return normalizeText(
    scope.business_type
      ?? scope.businessType
      ?? projectFacts.businessType
      ?? projectFacts.business_type,
  )
}



export async function buildBusinessTypeMasterPlanRow(params: {
  activity: BusinessTypeMasterPlanActivity
  businessType: string
  sourceType?: 'business_type_base_master_plan_profile_v1' | 'business_type_master_plan_profile_v1'
  index: number
  generationBatchId: string
  projectId: string
  startDate: string
  constructionCalendar?: ConstructionCalendarContext | null
  predecessorByCode: Map<string, string>
  predecessorActivityByCode?: Map<string, BusinessTypeMasterPlanActivity>
  externalPredecessorClientRowIds?: string[]
  masterPlanProfile: GeneratedMasterPlanProfile
  seedLookup: StandardDurationSeedLookup
  t2Lookup?: T2RhythmTemplateLookup | null
  projectFacts: Record<string, unknown>
  runtimeReferenceDays?: DefaultMasterPlanRuntimeReferenceDaysInput | null
  operation: PlanningTableOperation
  seedResolveContext?: AlgorithmSeedResolveContext
}): Promise<GeneratedTemplateRow> {
  const activity = buildAssetBackedBusinessTypeMasterPlanActivity(params.activity, params.businessType, params.seedLookup, params.projectFacts, params.t2Lookup)
  const planItemKind = activity.planItemKind ?? 'work_task'
  const isMilestone = planItemKind === 'milestone'
  const durationContributionMode = activity.durationContributionMode
    ?? (isMilestone ? 'record_only' : 'duration_bearing')
  const executionNature = activity.executionNature
    ?? (isMilestone ? 'handover_milestone' : 'field_execution')
  const baseAssetBackedDurationDays = isMilestone
    ? 1
    : calculateAssetBackedMasterPlanDuration(activity, params.seedLookup, params.runtimeReferenceDays, params.t2Lookup)
  const runtimeReferenceDay = findRuntimeReferenceDayForActivity(activity, params.runtimeReferenceDays)
  const authoritativeConstructionCalendar = isAuthoritativeConstructionCalendar(params.constructionCalendar)
  const calendarBasis = effectiveConstructionCalendarBasis(params.constructionCalendar)
  const constructionCalendarWindowCount = effectiveConstructionCalendarWindowCount(params.constructionCalendar)
  const start = addTemplateProductionDays(params.startDate, activity.startOffsetDays, params.constructionCalendar)
  const processSeasonalAdjustment = await calculateDefaultMasterPlanProcessSeasonalDurationAdjustment({
    activity,
    operation: params.operation,
    projectFacts: params.projectFacts,
    plannedStartDate: start,
    selectedDurationDays: baseAssetBackedDurationDays,
    seedResolveContext: params.seedResolveContext,
  })
  const assetBackedDurationDays = processSeasonalAdjustment?.adjustedDurationDays ?? baseAssetBackedDurationDays
  const end = addTemplateProductionDays(start, Math.max(1, assetBackedDurationDays) - 1, params.constructionCalendar)
  const clientRowId = `${params.generationBatchId}:business-type-master-plan:${params.businessType}:${activity.code}`
  const predecessorRuleByCode = new Map((activity.predecessorRules ?? []).map((rule) => [rule.code, rule]))
  const internalPredecessorRefs = uniqueStringArray([
    ...(activity.predecessorCodes ?? []),
    ...(activity.predecessorRules ?? []).map((rule) => rule.code),
  ])
    .map((code) => ({
      code,
      clientRowId: params.predecessorByCode.get(code) ?? '',
      activity: params.predecessorActivityByCode?.get(code) ?? null,
      rule: predecessorRuleByCode.get(code) ?? null,
    }))
    .filter((item) => item.clientRowId)
  const internalPredecessorClientRowIds = internalPredecessorRefs.map((item) => item.clientRowId)
  const externalPredecessorClientRowIds = uniqueStringArray(params.externalPredecessorClientRowIds ?? [])
  const predecessorClientRowIds = uniqueStringArray([
    ...internalPredecessorClientRowIds,
    ...externalPredecessorClientRowIds,
  ])
  const profileSourceType = params.sourceType ?? 'business_type_master_plan_profile_v1'
  const publicSourceType = 'managed_frontier_default_master_plan'
  const isBaseProfile = profileSourceType === 'business_type_base_master_plan_profile_v1'
  const profileKindLabel = isBaseProfile ? '通用阶段骨架' : '行业专项'
  const templateId = isBaseProfile ? 'business_type_base_master_plan_profile_v1' : `${params.businessType}_master_plan_profile_v1`
  const templateGroup = isBaseProfile ? 'business_type_base_master_plan' : `${params.businessType}_master_plan`
  const packType = isBaseProfile ? 'business_type_base_profile' : 'business_type_profile'
  const generationPolicy = isBaseProfile
    ? 'business_type_base_default_master_plan_profile_v1'
    : 'business_type_default_master_plan_profile_v1'
  const businessReasonCode = isBaseProfile
    ? 'BUSINESS_TYPE_BASE_MASTER_PLAN_PROFILE_CANDIDATE'
    : 'BUSINESS_TYPE_MASTER_PLAN_PROFILE_CANDIDATE'
  const baseDurationAssetCalculation = buildAssetDurationCalculation(activity, baseAssetBackedDurationDays, params.seedLookup, params.runtimeReferenceDays, params.t2Lookup)
  const calculatedDurationAssetCalculation = processSeasonalAdjustment
    ? {
        ...baseDurationAssetCalculation,
        selectionRule: `${String(baseDurationAssetCalculation.selectionRule ?? 'asset_backed_candidate_l1')}+process_seasonal_sensitivity_candidate_l1`,
        selectedDurationDays: assetBackedDurationDays,
        baseSelectedDurationDays: processSeasonalAdjustment.baseDurationDays,
        runtimeReferenceDaysAdjustedByProcessSeasonal: baseDurationAssetCalculation.runtimeReferenceDaysConsumed === true
          && assetBackedDurationDays !== processSeasonalAdjustment.baseDurationDays,
        processSeasonalDurationAssetConsumed: true,
        processSeasonalSource: processSeasonalAdjustment.source,
        processSeasonalStableCode: processSeasonalAdjustment.stableCode,
        processSeasonalMultiplier: processSeasonalAdjustment.multiplier,
        processSeasonalProductivityMultiplier: processSeasonalAdjustment.productivityMultiplier,
        processSeasonalClimateSignal: processSeasonalAdjustment.climateSignal,
        processSeasonalMonthlyClimateSignal: processSeasonalAdjustment.monthlyClimateSignal,
        processSeasonalImpactBand: processSeasonalAdjustment.impactBand,
        processSeasonalMonth: processSeasonalAdjustment.month,
        processSeasonalWorkEnvironment: processSeasonalAdjustment.workEnvironment,
        processSeasonalResolverSource: processSeasonalAdjustment.resolverSource,
        processSeasonalMutationBoundary: processSeasonalAdjustment.mutationBoundary,
      }
    : baseDurationAssetCalculation
  const durationAssetCalculation = {
    ...calculatedDurationAssetCalculation,
    standardWorkDurationSeedStableCode: activity.durationAssetStableCode,
    t2RhythmTemplateId: activity.t2RhythmTemplateId,
  }
  const baseDurationAssetMapping = buildResidentialDurationAssetMapping(activity, assetBackedDurationDays, params.seedLookup, params.runtimeReferenceDays, params.t2Lookup)
  const durationAssetMapping = {
    ...baseDurationAssetMapping,
    standardWorkDurationSeedStableCode: activity.durationAssetStableCode,
    t2RhythmTemplateId: activity.t2RhythmTemplateId,
    profileActivityDurationAssetAuthority: true,
    durationAssetCalculation,
  }
  const durationCalibrationSource = durationAssetCalculation.source as GeneratedTemplateDurationSuggestion['durationCalibrationSource']
  const usesT2Rhythm = durationAssetCalculation.t2RhythmApplicability !== 'not_applicable_one_off_activity'
  const metadata = {
    stableCode: activity.code,
    standardWorkCode: activity.code,
    source: publicSourceType,
    sourceVersion: ASSET_BACKED_MASTER_PLAN_SOURCE_VERSION,
    rowProjectionMode: 'schedule_row',
    scheduleParticipation: 'primary_schedule',
    durationContributionMode,
    planItemKind,
    templateGroup,
    packType,
    durationEvidence: {
      source: 'candidate_default_master_plan_baseline',
      calibrationSource: durationCalibrationSource,
      maturity: 'L1',
      reviewGate: null,
      mutationBoundary: params.masterPlanProfile.mutationBoundary,
    },
    durationBoundaryPolicy: 'parent_package_window',
    generationDepthPolicy: {
      policyId: 'business_type_master_plan_profile_controlled_frontier',
      materializeDepth: 'item_work',
      durationComputeDepth: 'item_work',
      confidence: 'medium',
      drillDownAvailable: true,
      governance: {
        curationStatus: 'seeded',
        mutationBoundary: params.masterPlanProfile.mutationBoundary,
      },
    },
    businessTypeMasterPlan: {
      source: publicSourceType,
      profileSourceType,
      profileTemplateId: templateId,
      profileTemplateGroup: templateGroup,
      profilePackType: packType,
      businessType: params.businessType,
      activityCode: activity.code,
      activityTags: activity.tags ?? [],
      contractualCloseoutRole: activity.contractualCloseoutRole ?? null,
      contractualTerminalControlCode: activity.contractualTerminalControlCode ?? null,
      durationBaselineAuthority: activity.durationBaselineAuthority ?? null,
      projectOrganizationVariantCode: activity.projectOrganizationVariantCode ?? null,
      phaseAnchorPredecessorClientRowIds: externalPredecessorClientRowIds,
      mutationBoundary: params.masterPlanProfile.mutationBoundary,
    },
    masterPlanGeneration: {
      source: ASSET_BACKED_MASTER_PLAN_GENERATION_SOURCE,
      entryTemplateCode: 'managed_frontier_default_master_plan',
      generatorAssetPolicy: 'real_plan_skeleton_plus_duration_rhythm_dependency_assets',
      skeletonRuleId: 'real_schedule_shape_main_control_plan_20260630',
      skeletonEvidenceRefs: REAL_PLAN_SKELETON_SOURCE_IDS,
      businessType: params.businessType,
      excludesManagementChecklistsFromPrimarySchedule: true,
      excludesMutuallyExclusiveMethodAlternatives: true,
      mutationBoundary: params.masterPlanProfile.mutationBoundary,
    },
    durationAssetMapping,
    durationAssetCalculation,
    executionPhase: activity.executionPhase,
    executionLane: activity.executionLane,
    calendarBasis,
    constructionCalendarWindowCount,
    constructionCalendarRef: authoritativeConstructionCalendar ? params.constructionCalendar.calendarRef : null,
    constructionCalendarVersion: authoritativeConstructionCalendar ? params.constructionCalendar.calendarVersion : null,
    constructionCalendarTimezone: authoritativeConstructionCalendar
      ? params.constructionCalendar.timezone
      : params.constructionCalendar?.timezone ?? 'Asia/Shanghai',
    constructionCalendarAvailability: authoritativeConstructionCalendar ? 'available' : 'unavailable',
    executionSortKey: ((EXECUTION_PHASE_ORDER[activity.executionPhase] ?? 999) * 1_000_000) + 500_000 + params.index,
  }
  const durationRiskRange = buildDefaultMasterPlanDurationRiskRange(durationAssetCalculation, assetBackedDurationDays)
  const durationSuggestion = {
    recommendedDurationDays: assetBackedDurationDays,
    conservativeDurationDays: Math.ceil(assetBackedDurationDays * 1.15),
    riskP20DurationDays: durationRiskRange.p20Days,
    riskP50DurationDays: durationRiskRange.p50Days,
    riskP80DurationDays: durationRiskRange.p80Days,
    durationRiskRange,
    durationOutputCode: 'plan_reference',
    durationOutputSemanticFieldName: 'planReferenceDays',
    durationOutputContract: buildDurationOutputContractSummary('plan_reference'),
    durationOutputWriteEvaluation: evaluateDurationOutputWrite({
      outputCode: 'plan_reference',
      target: 'plan_task_duration',
    }),
    durationOutputPromotion: null,
    confidenceLevel: 'medium',
    confidenceScore: 0.68,
    forecastSource: usesT2Rhythm
      ? `${profileSourceType}_template+standard_work_duration_seed+t2_division_rhythm_template+real_plan_evidence`
      : `${profileSourceType}_template+standard_work_duration_seed+system_schedule_rules`,
    durationCalibrationSource,
    durationProvenance: 'candidate_asset_backed',
    businessReason: `正式业态初始总控计划${profileKindLabel}工期由系统标准工期、T2 节奏、项目规模、施工日历和依赖规则共同生成；已发布学习结果仅作为可选校准覆盖。`,
    businessReasonCode,
    businessReasonCodes: [businessReasonCode],
    businessReasonParams: {
      activityCode: activity.code,
      businessType: params.businessType,
      source: publicSourceType,
      profileSourceType,
      generationSource: ASSET_BACKED_MASTER_PLAN_GENERATION_SOURCE,
      durationCalibrationSource,
      durationEvidenceSource: 'candidate_default_master_plan_baseline',
      durationEvidenceStatus: 'cold_start_baseline_or_published_learning_overlay',
      durationAssetMapping,
      durationAssetCalculation,
    },
    displaySummary: `候选主计划参考 ${assetBackedDurationDays} 天`,
    dataMaturity: 'L1',
    dataMaturityReasons: [
      'candidate business-type master plan uses governed real-plan evidence and seeded duration/rhythm assets',
      runtimeReferenceDay
        ? 'accepted runtime-calibrated reference days are consumed as candidate input without production writes'
        : 'system cold-start baseline is used; runtime calibration remains optional',
    ],
    dataUpgradePath: ['optional_runtime_calibration'],
    dataUpgradeBlockedBy: [],
    factorAvailability: {
      business_type_base_master_plan_profile_v1: isBaseProfile,
      business_type_master_plan_profile_v1: !isBaseProfile,
      candidate_default_master_plan_baseline: true,
      standard_work_duration_seed: true,
      t2_division_rhythm_template_seed: usesT2Rhythm,
      external_real_plan_evidence: true,
      accepted_project_duration_samples: Boolean(runtimeReferenceDay),
    },
    durationContributionMode,
    durationBoundaryRole: 'standalone_duration',
    planDurationTruthSource: ASSET_BACKED_MASTER_PLAN_TRUTH_SOURCE,
    planReferenceDays: assetBackedDurationDays,
  } satisfies GeneratedTemplateDurationSuggestion
  const predecessorDependencies = [
    ...internalPredecessorRefs.map((predecessorRef) => {
      const authoredRule = predecessorRef.rule
      const { dependencyType, lagDays } = authoredRule
        ? {
            dependencyType: authoredRule.dependencyType ?? 'FS',
            lagDays: Number.isFinite(Number(authoredRule.lagDays)) ? Number(authoredRule.lagDays) : 0,
          }
        : resolveBusinessTypeMasterPlanInternalDependencyTiming(
            activity,
            predecessorRef.activity,
          )
      const intentCode = authoredRule?.intentCode ?? 'business_type_master_plan_profile_sequence'
      return {
        clientRowId: predecessorRef.clientRowId,
        dependencyType,
        lagDays,
        predecessorStableCode: predecessorRef.code,
        predecessorStableCodes: [predecessorRef.code],
        intentCode,
        source: 'dependency_intent_template' as const,
        confidenceLevel: 'medium' as const,
        confidenceScore: 0.62,
        dependencyRuleEvidence: buildDefaultMasterPlanDependencyRuleEvidence({
          intentCode,
          dependencyType,
          lagDays,
          predecessorStableCode: predecessorRef.code,
          successorStableCode: activity.code,
          predecessorActivity: predecessorRef.activity,
          successorActivity: activity,
        }),
      }
    }),
    ...externalPredecessorClientRowIds.map((predecessorClientRowId) => {
      const dependencyType = 'FS' as const
      const lagDays = 0
      const intentCode = 'business_type_profile_phase_anchor'
      return {
        clientRowId: predecessorClientRowId,
        dependencyType,
        lagDays,
        intentCode,
        source: 'dependency_intent_template' as const,
        confidenceLevel: 'low' as const,
        confidenceScore: 0.46,
        auditReasonCode: 'accepted_business_constraint_candidate_only' as const,
        auditTrace: [
          'candidate default master-plan profile row anchored to existing managed-frontier phase row',
          'does not write production task_dependencies',
        ],
        dependencyRuleEvidence: buildDefaultMasterPlanDependencyRuleEvidence({
          intentCode,
          dependencyType,
          lagDays,
          successorStableCode: activity.code,
          successorActivity: activity,
        }),
      }
    }),
  ]
  return {
    clientRowId,
    parentClientRowId: null,
    parentRowId: null,
    sortOrder: params.index,
    predecessorClientRowIds,
    predecessorDependencies,
    rowProjectionMode: 'schedule_row',
    executionPhase: activity.executionPhase,
    executionLane: activity.executionLane,
    executionSortKey: ((EXECUTION_PHASE_ORDER[activity.executionPhase] ?? 999) * 1_000_000) + 500_000 + params.index,
    workfaceId: activity.executionLane,
    planItemKind,
    planItemTags: activity.tags ?? [],
    progressMode: 'progress_percent',
    scheduleParticipation: 'primary_schedule',
    scopeExpansionMode: 'project',
    executionNature,
    durationSuggestion,
    values: {
      title: activity.title,
      planned_start_date: start,
      planned_end_date: end,
      start_date: start,
      end_date: end,
      progress: 0,
      status: 'todo',
      priority: 'medium',
      is_milestone: isMilestone,
      milestone_level: isMilestone ? 'project' : null,
      is_wbs_summary: !isMilestone,
      is_executable: false,
      wbs_node_type: 'item_work',
      category_type: 'item_work',
      template_id: templateId,
      template_node_id: activity.code,
      source_template_id: templateId,
      source_template_node_id: activity.code,
      template_group: templateGroup,
      pack_type: packType,
      generation_policy: generationPolicy,
      generation_batch_id: params.generationBatchId,
      scope_index: 0,
      standard_work_code: activity.code,
      standard_work_name: activity.title,
      smart_reference_days: assetBackedDurationDays,
      duration_calibration_source: durationSuggestion.durationCalibrationSource,
      duration_provenance: durationSuggestion.durationProvenance,
      duration_evidence_source: 'candidate_default_master_plan_baseline',
      duration_evidence_maturity: durationSuggestion.dataMaturity,
      duration_review_required: false,
      duration_review_gate: null,
      duration_truth_source: durationSuggestion.planDurationTruthSource,
      duration_asset_mapping: durationAssetMapping,
      duration_asset_calculation: durationAssetCalculation,
      duration_contribution_mode: durationContributionMode,
      row_projection_mode: 'schedule_row',
      execution_phase: activity.executionPhase,
      execution_lane: activity.executionLane,
      contractual_closeout_role: activity.contractualCloseoutRole ?? null,
      contractual_terminal_control_code: activity.contractualTerminalControlCode ?? null,
      execution_sort_key: ((EXECUTION_PHASE_ORDER[activity.executionPhase] ?? 999) * 1_000_000) + 500_000 + params.index,
      calendar_basis: calendarBasis,
      construction_calendar_window_count: constructionCalendarWindowCount,
      construction_calendar_ref: authoritativeConstructionCalendar ? params.constructionCalendar.calendarRef : null,
      construction_calendar_version: authoritativeConstructionCalendar ? params.constructionCalendar.calendarVersion : null,
      construction_calendar_timezone: authoritativeConstructionCalendar
        ? params.constructionCalendar.timezone
        : params.constructionCalendar?.timezone ?? 'Asia/Shanghai',
      construction_calendar_availability: authoritativeConstructionCalendar ? 'available' : 'unavailable',
      workface_id: activity.executionLane,
      duration_suggestion: buildGeneratedDurationSuggestionValue(durationSuggestion, durationContributionMode),
      standard_task_metadata: metadata,
      master_plan_generation_source: ASSET_BACKED_MASTER_PLAN_GENERATION_SOURCE,
      plan_skeleton_evidence_refs: REAL_PLAN_SKELETON_SOURCE_IDS,
      material_required: false,
      acceptance_required: activity.executionPhase === 'acceptance_handover',
      source_type: publicSourceType,
      profile_source_type: profileSourceType,
      business_type: params.businessType,
      business_type_code: params.businessType,
      project_id: params.projectId,
    },
  }
}



export function findBusinessTypeProfileOverrideActivity(
  baseActivity: BusinessTypeMasterPlanActivity,
  profileActivities: BusinessTypeMasterPlanActivity[],
) {
  if (!['acceptance_handover', 'commissioning'].includes(baseActivity.executionPhase)) return null
  const baseTags = new Set((baseActivity.tags ?? []).map((tag) => normalizeText(tag)).filter(Boolean))
  const baseIsHandoverOrAcceptance = baseTags.has('handover')
    || baseTags.has('acceptance')
    || /验收|移交|handover|acceptance/i.test(baseActivity.title)
  if (!baseIsHandoverOrAcceptance) return null
  const candidates = profileActivities.filter((activity) => {
    if (activity.executionPhase !== baseActivity.executionPhase) return false
    const tags = new Set((activity.tags ?? []).map((tag) => normalizeText(tag)).filter(Boolean))
    return tags.has('handover')
      || tags.has('acceptance')
      || tags.has('opening')
      || tags.has('commissioning')
      || /验收|移交|开业|投产|联调|handover|acceptance|opening|commissioning/i.test(activity.title)
  })
  if (candidates.length === 0) return null

  const scoreCandidate = (activity: BusinessTypeMasterPlanActivity) => {
    const text = [
      activity.title,
      activity.executionPhase,
      activity.executionLane,
      ...(activity.tags ?? []),
    ].join(' ')
    let score = 0
    if (baseActivity.executionPhase === 'commissioning') {
      if (/综合联调|联合调试|联调联试|带载|负载|试运营|开业|投产|移交|integrated|load|trial|opening|handover/i.test(text)) score += 80
      if (/专项联调|系统联调|单机试车|commissioning|test/i.test(text)) score += 30
      if (/监控|弱电|monitoring|interface/i.test(text)) score -= 10
    }
    if (baseActivity.executionPhase === 'acceptance_handover') {
      if (/竣工|验收|移交|开学|开业|投产|运营恢复|handover|acceptance|opening/i.test(text)) score += 100
      if (/联调|commissioning/i.test(text)) score += 20
    }
    return score
  }

  return [...candidates].sort((left, right) => {
    const byScore = scoreCandidate(right) - scoreCandidate(left)
    if (byScore) return byScore
    return right.startOffsetDays - left.startOffsetDays
  })[0] ?? null
}



export function businessTypeProfileOverridesBaseActivity(
  baseActivity: BusinessTypeMasterPlanActivity,
  profileActivities: BusinessTypeMasterPlanActivity[],
) {
  return Boolean(findBusinessTypeProfileOverrideActivity(baseActivity, profileActivities))
}



export function mergeBusinessTypeProfileOverrideActivity(
  profileActivity: BusinessTypeMasterPlanActivity,
  baseActivity: BusinessTypeMasterPlanActivity,
): BusinessTypeMasterPlanActivity {
  const hasExplicitProfilePredecessors = (profileActivity.predecessorCodes ?? []).length > 0
    || (profileActivity.predecessorRules ?? []).length > 0
  return {
    ...profileActivity,
    startOffsetDays: Math.max(profileActivity.startOffsetDays, baseActivity.startOffsetDays),
    durationDays: profileActivity.durationBaselineAuthority === 'project_organization_variant'
      ? profileActivity.durationDays
      : Math.max(profileActivity.durationDays, baseActivity.durationDays),
    predecessorCodes: hasExplicitProfilePredecessors
      ? uniqueStringArray(profileActivity.predecessorCodes ?? [])
      : uniqueStringArray([
          ...(profileActivity.predecessorCodes ?? []),
          ...(baseActivity.predecessorCodes ?? []),
        ]),
    tags: uniqueStringArray([
      ...(profileActivity.tags ?? []),
      ...(baseActivity.tags ?? []),
      'business_type_overrides_base_handover',
    ]),
  }
}



export function resolveBusinessTypeProfilePhaseAnchorPredecessors(params: {
  rows: GeneratedTemplateRow[]
  activity: BusinessTypeMasterPlanActivity
  startDate: string
}) {
  if ((params.activity.predecessorCodes ?? []).length > 0
    || (params.activity.predecessorRules ?? []).length > 0) return []
  const anchorPhases = BUSINESS_TYPE_PROFILE_PHASE_ANCHOR_PHASES[params.activity.executionPhase] ?? []
  if (anchorPhases.length === 0) return []
  const activityStart = addDays(params.startDate, params.activity.startOffsetDays)
  const isBusinessTypeProfileRow = (row: GeneratedTemplateRow) => {
    const metadata = readRowMetadata(row)
    const businessTypeMasterPlan = readRecord(metadata.businessTypeMasterPlan)
    const profileSourceType = normalizeText(
      row.values.profile_source_type
        ?? businessTypeMasterPlan.profileSourceType,
    )
    return profileSourceType === 'business_type_base_master_plan_profile_v1'
      || profileSourceType === 'business_type_master_plan_profile_v1'
      || normalizeText(businessTypeMasterPlan.source) === 'managed_frontier_default_master_plan'
  }
  const phaseCandidates = params.rows.filter((row) => (
    getRowProjectionMode(row) === 'schedule_row'
    && row.scheduleParticipation !== 'reference_only'
    && anchorPhases.includes(normalizeText(row.values.execution_phase ?? row.executionPhase))
    && !isBusinessTypeProfileRow(row)
  ))
  const candidates = phaseCandidates.length > 0
    ? phaseCandidates
    : params.rows.filter((row) => (
      getRowProjectionMode(row) === 'schedule_row'
      && row.scheduleParticipation !== 'reference_only'
      && !isBusinessTypeProfileRow(row)
    ))
  if (candidates.length === 0) return []
  const endingBeforeStart = candidates.filter((row) => comparePlanDates(readGeneratedRowPlanEnd(row), activityStart) <= 0)
  const pool = endingBeforeStart.length > 0 ? endingBeforeStart : candidates
  return [...pool]
    .sort((left, right) => {
      const byEndDesc = comparePlanDates(readGeneratedRowPlanEnd(right), readGeneratedRowPlanEnd(left))
      if (byEndDesc) return byEndDesc
      return right.sortOrder - left.sortOrder
    })
    .slice(0, 1)
    .map((row) => row.clientRowId)
}



/*
 * Keep business-type profile rows connected to the managed-frontier skeleton
 * without making their candidate edges authoritative production dependencies.
 */
export function buildBusinessTypeProfilePhaseAnchorDependencyNotice(row: GeneratedTemplateRow) {
  const metadata = readRecord(row.values.standard_task_metadata)
  const businessTypeMasterPlan = readRecord(metadata.businessTypeMasterPlan)
  const anchorIds = readStringArray(businessTypeMasterPlan.phaseAnchorPredecessorClientRowIds)
  if (anchorIds.length === 0) return null
  return {
    source: 'business_type_profile_phase_anchor',
    mutationBoundary: 'candidate_dependency_intent_only',
    predecessorClientRowIds: anchorIds,
  }
}



export function applyBusinessTypeProfilePhaseAnchorNotices(rows: GeneratedTemplateRow[]) {
  for (const row of rows) {
    const notice = buildBusinessTypeProfilePhaseAnchorDependencyNotice(row)
    if (!notice) continue
    const metadata = readRecord(row.values.standard_task_metadata)
    row.values = {
      ...row.values,
      profile_phase_anchor_dependency: notice,
      standard_task_metadata: {
        ...metadata,
        businessTypeProfilePhaseAnchorDependency: notice,
      },
    }
  }
}



export function resolveBusinessTypeMasterPlanInternalDependencyTiming(
  activity: BusinessTypeMasterPlanActivity,
  predecessorActivity: BusinessTypeMasterPlanActivity | null,
): {
  dependencyType: GeneratedTemplateDependency['dependencyType']
  lagDays: number
} {
  const dependencyAsset = predecessorActivity
    ? resolveDefaultMasterPlanCrossItemWorkflowAsset({
        intentCode: 'business_type_master_plan_profile_sequence',
        predecessorStableCode: predecessorActivity.code,
        successorStableCode: activity.code,
        predecessorActivity,
        successorActivity: activity,
      })
    : null
  if (dependencyAsset) {
    return {
      dependencyType: dependencyAsset.dependencyType,
      lagDays: Number.isFinite(Number(dependencyAsset.lagDays)) ? Number(dependencyAsset.lagDays) : 0,
    }
  }
  if (activity.dependencyType) {
    return {
      dependencyType: activity.dependencyType,
      lagDays: Number.isFinite(Number(activity.lagDays)) ? Number(activity.lagDays) : 0,
    }
  }
  if (!predecessorActivity) return { dependencyType: 'FS', lagDays: 0 }
  return {
    dependencyType: 'SS',
    lagDays: Math.max(0, activity.startOffsetDays - predecessorActivity.startOffsetDays),
  }
}



export function convertExistingMasterPlanScheduleRowsToBusinessTypeEvidence(rows: GeneratedTemplateRow[]) {
  for (const row of rows) {
    if (getRowProjectionMode(row) !== 'schedule_row') continue
    const sourceType = normalizeText(row.values.source_type)
    const metadata = readRowMetadata(row)
    const businessTypeMasterPlan = readRecord(metadata.businessTypeMasterPlan)
    const profileSourceType = normalizeText(
      row.values.profile_source_type
        ?? businessTypeMasterPlan.profileSourceType,
    )
    if (
      sourceType === 'business_type_base_master_plan_profile_v1'
      || sourceType === 'business_type_master_plan_profile_v1'
      || profileSourceType === 'business_type_base_master_plan_profile_v1'
      || profileSourceType === 'business_type_master_plan_profile_v1'
      || sourceType === 'residential_master_plan_v2'
    ) {
      continue
    }
    row.rowProjectionMode = 'linked_projection'
    row.scheduleParticipation = 'read_only_projection'
    row.linkedProjectionSource = {
      source: 'business_type_default_master_plan_template_support_projection',
      originalRowProjectionMode: 'schedule_row',
    }
    row.values = {
      ...row.values,
      row_projection_mode: 'linked_projection',
      schedule_participation: 'read_only_projection',
      linked_projection_source: row.linkedProjectionSource,
      standard_task_metadata: {
        ...metadata,
        rowProjectionMode: 'linked_projection',
        scheduleParticipation: 'read_only_projection',
        masterPlanProjectionPolicy: {
          source: 'business_type_default_master_plan_template_support_projection',
          originalRowProjectionMode: 'schedule_row',
        },
      },
    }
  }
}




export async function applyResidentialMasterPlanV2Rows(params: {
  rows: GeneratedTemplateRow[]
  scopeCombos: WbsTemplateScope[]
  operation: PlanningTableOperation
  projectFacts: Record<string, unknown>
  masterPlanProfile: GeneratedMasterPlanProfile | null
  projectId: string
  generationBatchId: string
  startDate: string
  constructionCalendar?: ConstructionCalendarContext | null
  algorithmSeedSourcePolicy?: AlgorithmSeedResolveContext['sourcePolicy']
}) {
  if (!params.masterPlanProfile) return null
  if (!isResidentialDefaultMasterPlanOperation(params.operation, params.projectFacts)) return null

  convertExistingMasterPlanScheduleRowsToResidentialEvidence(params.rows)
  const seedResolveContext = buildDefaultMasterPlanSeedResolveContext(params)
  const organizationContext = buildResidentialMasterPlanOrganizationContext({
    operation: params.operation,
    projectFacts: params.projectFacts,
    scopeCombos: params.scopeCombos,
  })
  const runtimeReferenceDays = readDefaultMasterPlanRuntimeReferenceDaysInput(params)
  const seedLookup = await buildStandardDurationSeedLookup(
    RESIDENTIAL_MASTER_PLAN_PRELOAD_DURATION_SEED_CODES,
    seedResolveContext,
  )
  const t2Lookup = await buildT2RhythmTemplateLookup(
    Object.values(RESIDENTIAL_T2_RHYTHM_TEMPLATE_IDS),
    seedResolveContext,
  )
  const activities = buildResidentialMasterPlanActivities({
    operation: params.operation,
    projectFacts: params.projectFacts,
    seedLookup,
    t2Lookup,
    organizationStrategy: organizationContext?.strategy,
  })
  await fillT2RhythmTemplateLookup(
    t2Lookup,
    activities.map((activity) => activity.t2RhythmTemplateId),
    seedResolveContext,
  )
  await fillStandardDurationSeedLookup(
    seedLookup,
    activities.map((activity) => activity.durationAssetStableCode),
    seedResolveContext,
  )
  const predecessorByCode = new Map<string, string>()
  const predecessorActivityByCode = new Map<string, ResidentialMasterPlanActivity>()
  const v2Rows: GeneratedTemplateRow[] = []
  for (const [index, activity] of activities.entries()) {
    const row = await buildResidentialMasterPlanRow({
      activity,
      index,
      generationBatchId: params.generationBatchId,
      projectId: params.projectId,
      startDate: params.startDate,
      constructionCalendar: params.constructionCalendar,
      predecessorByCode,
      predecessorActivityByCode,
      masterPlanProfile: params.masterPlanProfile!,
      projectFacts: params.projectFacts,
      seedLookup,
      t2Lookup,
      runtimeReferenceDays,
      operation: params.operation,
      seedResolveContext,
      organizationContext,
    })
    predecessorByCode.set(activity.code, row.clientRowId)
    predecessorActivityByCode.set(activity.code, activity)
    v2Rows.push(row)
  }
  for (const row of v2Rows) syncGeneratedRowDurationOutput(row)
  params.rows.push(...v2Rows)
  return {
    source: ASSET_BACKED_DEFAULT_MASTER_PLAN_SOURCE,
    entryTemplateCode: RESIDENTIAL_DEFAULT_MASTER_PLAN_ENTRY_TEMPLATE_CODE,
    generationSource: ASSET_BACKED_MASTER_PLAN_GENERATION_SOURCE,
    insertedScheduleRowCount: v2Rows.length,
    projectedTemplateEvidenceRowCount: params.rows.filter((row) => getRowProjectionMode(row) === 'linked_projection').length,
    mutationBoundary: params.masterPlanProfile.mutationBoundary,
  }
}



export const RESIDENTIAL_MASTER_PLAN_HIERARCHY_SOURCE = 'residential_master_plan_organization_hierarchy_v1'



export const RESIDENTIAL_MASTER_PLAN_PHASE_LABELS: Record<string, string> = {
  startup_site_setup: '施工准备与场地布置',
  foundation_pit_pile: '基坑支护、土方与桩基础',
  basement_structure: '地下室结构与共用工程',
  superstructure_rhythm: '主体结构施工',
  secondary_structure_fitout_roughin: '二次结构与初装穿插',
  mep_roughin: '机电预留预埋与安装',
  envelope_roof_facade: '屋面、门窗与外立面',
  elevator_installation: '垂直运输与电梯安装',
  interior_fitout_terminal: '室内装修与末端安装',
  outdoor_municipal_landscape: '室外管网、道路与景观',
  commissioning: '系统调试与问题销项',
  acceptance_handover: '专项验收、竣工与移交',
}



export const RESIDENTIAL_SHARED_WORK_PACKAGE_BY_PHASE: Record<string, string> = {
  startup_site_setup: 'shared_startup_foundation',
  foundation_pit_pile: 'shared_startup_foundation',
  basement_structure: 'shared_basement',
  mep_roughin: 'shared_mep_vertical_transport',
  elevator_installation: 'shared_mep_vertical_transport',
  envelope_roof_facade: 'shared_envelope_fitout',
  interior_fitout_terminal: 'shared_envelope_fitout',
  outdoor_municipal_landscape: 'shared_outdoor',
  commissioning: 'shared_commissioning',
  acceptance_handover: 'shared_acceptance',
}



export const RESIDENTIAL_TOWER_WORK_PACKAGE_BY_PHASE: Record<string, string> = {
  superstructure_rhythm: 'tower_structure',
  secondary_structure_fitout_roughin: 'tower_secondary_mep',
  mep_roughin: 'tower_secondary_mep',
  envelope_roof_facade: 'tower_envelope_fitout',
  interior_fitout_terminal: 'tower_envelope_fitout',
}



export function residentialHierarchyWorkPackageKey(organizationLane: string, executionPhase: string) {
  const phaseMap = organizationLane === 'shared_works'
    ? RESIDENTIAL_SHARED_WORK_PACKAGE_BY_PHASE
    : RESIDENTIAL_TOWER_WORK_PACKAGE_BY_PHASE
  return phaseMap[executionPhase] ?? executionPhase
}



export function residentialHierarchyWindow(rows: GeneratedTemplateRow[]) {
  const starts = rows.map(readGeneratedRowPlanStart).filter((value): value is string => Boolean(value)).sort(comparePlanDates)
  const ends = rows.map(readGeneratedRowPlanEnd).filter((value): value is string => Boolean(value)).sort(comparePlanDates)
  return {
    start: starts[0] ?? null,
    end: ends.at(-1) ?? null,
  }
}



export function residentialHierarchyOnboardingClassification(rows: GeneratedTemplateRow[]) {
  const classifications = rows
    .map((row) => normalizeText(row.values.onboarding_stage_classification))
    .filter(Boolean)
  if (classifications.length > 0 && classifications.every((value) => value === 'history')) return 'history'
  if (classifications.includes('in_progress')) return 'in_progress'
  return classifications.length > 0 ? 'future' : null
}



export function buildResidentialMasterPlanHierarchySummaryRow(params: {
  code: string
  title: string
  summaryKind: 'project_root' | 'organization_lane' | 'lane_work_package'
  nodeType: 'division' | 'sub_division' | 'item_work'
  parentClientRowId: string | null
  children: GeneratedTemplateRow[]
  representative: GeneratedTemplateRow
  generationBatchId: string
  executionPhase: string
  organizationLane: string | null
  executionSortKey: number
  sortOrder: number
}): GeneratedTemplateRow {
  const representativeValues = params.representative.values
  const representativeMetadata = readRowMetadata(params.representative)
  const window = residentialHierarchyWindow(params.children)
  const onboardingClassification = residentialHierarchyOnboardingClassification(params.children)
  const projectOrganization = readRecord(representativeMetadata.projectOrganization)
  const hierarchyMetadata = {
    source: RESIDENTIAL_MASTER_PLAN_HIERARCHY_SOURCE,
    summaryKind: params.summaryKind,
    nodeType: params.nodeType,
    organizationLane: params.organizationLane,
    executionPhase: params.executionPhase,
    childCount: params.children.length,
    mutationBoundary: 'preview_no_write_wizard_commit_transactional',
  }
  const metadata = {
    stableCode: params.code,
    standardWorkCode: params.code,
    source: ASSET_BACKED_DEFAULT_MASTER_PLAN_SOURCE,
    sourceVersion: ASSET_BACKED_MASTER_PLAN_SOURCE_VERSION,
    rowProjectionMode: 'schedule_row',
    scheduleParticipation: 'primary_schedule',
    durationContributionMode: 'record_only',
    planItemKind: 'work_task',
    progressMode: 'inherited',
    templateGroup: 'residential_master_plan',
    packType: 'core_quality',
    isWbsSummary: true,
    isExecutable: false,
    isMilestone: false,
    durationEvidence: {
      source: 'child_plan_window_rollup',
      calibrationSource: ASSET_BACKED_MASTER_PLAN_DURATION_CALIBRATION_SOURCE,
      maturity: 'L1',
      reviewGate: null,
      mutationBoundary: 'preview_no_write_wizard_commit_transactional',
    },
    generationDepthPolicy: {
      policyId: 'residential_master_plan_organization_hierarchy_v1',
      materializeDepth: params.nodeType,
      durationComputeDepth: 'process',
      confidence: 'high',
      drillDownAvailable: true,
      governance: {
        curationStatus: 'seeded',
        mutationBoundary: 'preview_no_write_wizard_commit_transactional',
      },
    },
    residentialMasterPlan: {
      source: ASSET_BACKED_DEFAULT_MASTER_PLAN_SOURCE,
      generationSource: ASSET_BACKED_MASTER_PLAN_GENERATION_SOURCE,
      entryTemplateCode: RESIDENTIAL_DEFAULT_MASTER_PLAN_ENTRY_TEMPLATE_CODE,
      hierarchySource: RESIDENTIAL_MASTER_PLAN_HIERARCHY_SOURCE,
      mutationBoundary: 'preview_no_write_wizard_commit_transactional',
    },
    masterPlanGeneration: {
      source: ASSET_BACKED_MASTER_PLAN_GENERATION_SOURCE,
      entryTemplateCode: RESIDENTIAL_DEFAULT_MASTER_PLAN_ENTRY_TEMPLATE_CODE,
      generatorAssetPolicy: 'real_plan_skeleton_plus_duration_rhythm_dependency_assets',
      mutationBoundary: 'preview_no_write_wizard_commit_transactional',
    },
    drilldownGenerationLineage: {
      level: 'master_control',
      templateId: 'residential_master_plan_v2_hierarchy',
      templateNodeId: params.code,
      generationBatchId: params.generationBatchId,
      source: RESIDENTIAL_MASTER_PLAN_HIERARCHY_SOURCE,
      mutationBoundary: 'generated_row_metadata_only',
    },
    masterPlanHierarchy: hierarchyMetadata,
    ...(Object.keys(projectOrganization).length > 0 ? { projectOrganization } : {}),
    executionPhase: params.executionPhase,
    executionLane: params.organizationLane ?? 'project_master_plan',
    executionNature: 'summary_rollup',
    executionSortKey: params.executionSortKey,
    calendarBasis: representativeValues.calendar_basis ?? representativeMetadata.calendarBasis ?? 'calendar_day',
  }
  const clientRowId = `${params.generationBatchId}:residential-master-plan-v2-hierarchy:${params.code}`
  return {
    clientRowId,
    parentClientRowId: params.parentClientRowId,
    parentRowId: null,
    sortOrder: params.sortOrder,
    predecessorClientRowIds: [],
    predecessorDependencies: [],
    rowProjectionMode: 'schedule_row',
    executionPhase: params.executionPhase,
    executionLane: params.organizationLane ?? 'project_master_plan',
    executionSortKey: params.executionSortKey,
    workfaceId: params.organizationLane,
    planItemKind: 'work_task',
    planItemTags: ['wbs_summary', params.summaryKind],
    progressMode: 'inherited',
    scheduleParticipation: 'primary_schedule',
    linkedProjectionSource: null,
    scopeExpansionMode: 'project',
    executionNature: 'summary_rollup',
    durationSuggestion: null,
    values: {
      title: params.title,
      planned_start_date: window.start,
      planned_end_date: window.end,
      start_date: window.start,
      end_date: window.end,
      progress: 0,
      status: 'todo',
      priority: 'medium',
      is_milestone: false,
      milestone_level: null,
      is_wbs_summary: true,
      is_executable: false,
      wbs_node_type: params.nodeType,
      category_type: params.nodeType,
      template_id: 'residential_master_plan_v2_hierarchy',
      template_node_id: params.code,
      source_template_id: 'residential_master_plan_v2_hierarchy',
      source_template_node_id: params.code,
      template_group: 'residential_master_plan',
      pack_type: 'core_quality',
      generation_policy: 'asset_backed_default_master_plan_v1',
      generation_batch_id: params.generationBatchId,
      scope_index: 0,
      standard_work_code: params.code,
      standard_work_name: params.title,
      smart_reference_days: null,
      duration_calibration_source: ASSET_BACKED_MASTER_PLAN_DURATION_CALIBRATION_SOURCE,
      duration_provenance: 'child_plan_window_rollup',
      duration_evidence_source: 'child_plan_window_rollup',
      duration_evidence_maturity: 'L1',
      duration_review_required: false,
      duration_review_gate: null,
      duration_truth_source: 'child_plan_window_rollup',
      duration_asset_mapping: null,
      duration_asset_calculation: null,
      duration_contribution_mode: 'record_only',
      row_projection_mode: 'schedule_row',
      execution_phase: params.executionPhase,
      execution_lane: params.organizationLane ?? 'project_master_plan',
      project_organization_policy_id: representativeValues.project_organization_policy_id ?? null,
      project_organization_strategy: representativeValues.project_organization_strategy ?? null,
      organization_lane: params.organizationLane,
      organization_lane_role: representativeValues.organization_lane_role ?? null,
      organization_lane_index: representativeValues.organization_lane_index ?? null,
      organization_lane_total: representativeValues.organization_lane_total ?? null,
      organization_scope_group: representativeValues.organization_scope_group ?? null,
      organization_shared_work: representativeValues.organization_shared_work ?? null,
      organization_confidence: representativeValues.organization_confidence ?? null,
      phase_object_id: representativeValues.phase_object_id ?? null,
      section_object_id: representativeValues.section_object_id ?? null,
      building_object_id: representativeValues.building_object_id ?? null,
      building_sequence_source: representativeValues.building_sequence_source ?? null,
      building_sequence_index: representativeValues.building_sequence_index ?? null,
      building_sequence_number: representativeValues.building_sequence_number ?? null,
      building_sequence_total: representativeValues.building_sequence_total ?? null,
      execution_sort_key: params.executionSortKey,
      execution_nature: 'summary_rollup',
      calendar_basis: representativeValues.calendar_basis ?? representativeMetadata.calendarBasis ?? 'calendar_day',
      construction_calendar_window_count: representativeValues.construction_calendar_window_count ?? 0,
      workface_id: params.organizationLane,
      plan_item_kind: 'work_task',
      progress_mode: 'inherited',
      schedule_participation: 'primary_schedule',
      linked_projection_source: null,
      duration_suggestion: null,
      standard_task_metadata: metadata,
      master_plan_generation_source: ASSET_BACKED_MASTER_PLAN_GENERATION_SOURCE,
      master_plan_entry_template_code: RESIDENTIAL_DEFAULT_MASTER_PLAN_ENTRY_TEMPLATE_CODE,
      plan_skeleton_evidence_refs: REAL_PLAN_SKELETON_SOURCE_IDS,
      material_required: false,
      acceptance_required: false,
      source_type: ASSET_BACKED_DEFAULT_MASTER_PLAN_SOURCE,
      project_id: representativeValues.project_id ?? null,
      ...(onboardingClassification
        ? {
            onboarding_stage_classification: onboardingClassification,
            is_historical: onboardingClassification === 'history',
          }
        : {}),
    },
  }
}



export function applyResidentialMasterPlanOrganizationHierarchy(params: {
  rows: GeneratedTemplateRow[]
  generationBatchId: string
  assembly: ExecutableDefaultMasterPlanAssemblySummary
}) {
  const activityRows = params.rows.filter((row) => {
    if (getRowProjectionMode(row) !== 'schedule_row') return false
    const metadata = readRowMetadata(row)
    return normalizeText(metadata.templateGroup ?? row.values.template_group) === 'residential_master_plan'
      && normalizeText(row.values.template_id) === 'residential_master_plan_v2'
  })
  if (activityRows.length === 0) return null

  const laneGroups = new Map<string, GeneratedTemplateRow[]>()
  for (const row of activityRows) {
    const lane = normalizeText(row.values.organization_lane) || 'shared_works'
    laneGroups.set(lane, [...(laneGroups.get(lane) ?? []), row])
  }
  const orderedLaneGroups = [...laneGroups.entries()].sort(([leftLane, leftRows], [rightLane, rightRows]) => {
    if (leftLane === 'shared_works') return -1
    if (rightLane === 'shared_works') return 1
    const leftSequence = readOptionalNumber(leftRows[0]?.values.building_sequence_number) ?? Number.MAX_SAFE_INTEGER
    const rightSequence = readOptionalNumber(rightRows[0]?.values.building_sequence_number) ?? Number.MAX_SAFE_INTEGER
    return leftSequence - rightSequence || leftLane.localeCompare(rightLane)
  })
  const hierarchyRows: GeneratedTemplateRow[] = []
  const rootRepresentative = activityRows
    .slice()
    .sort((left, right) => comparePlanDates(readGeneratedRowPlanStart(left), readGeneratedRowPlanStart(right)))[0]
  const rootCode = 'RMP-WBS-ROOT'
  const rootId = `${params.generationBatchId}:residential-master-plan-v2-hierarchy:${rootCode}`
  const rootPhase = getGeneratedRowExecutionPhase(rootRepresentative) || 'startup_site_setup'
  hierarchyRows.push(buildResidentialMasterPlanHierarchySummaryRow({
    code: rootCode,
    title: '项目总控计划',
    summaryKind: 'project_root',
    nodeType: 'division',
    parentClientRowId: null,
    children: activityRows,
    representative: rootRepresentative,
    generationBatchId: params.generationBatchId,
    executionPhase: rootPhase,
    organizationLane: null,
    executionSortKey: -3,
    sortOrder: params.rows.length + hierarchyRows.length,
  }))

  for (const [laneIndex, [lane, laneRows]] of orderedLaneGroups.entries()) {
    const representative = laneRows[0]
    const buildingSequence = readOptionalNumber(representative.values.building_sequence_number)
    const laneCode = lane === 'shared_works'
      ? 'SHARED'
      : `T${String(buildingSequence ?? laneIndex).padStart(2, '0')}`
    const laneTitle = lane === 'shared_works'
      ? '共用工程与总体配套'
      : `${buildingSequence ?? laneIndex}#楼施工`
    const laneSummaryCode = `RMP-WBS-LANE-${laneCode}`
    const laneSummaryId = `${params.generationBatchId}:residential-master-plan-v2-hierarchy:${laneSummaryCode}`
    const lanePhase = laneRows
      .slice()
      .sort((left, right) => comparePlanDates(readGeneratedRowPlanStart(left), readGeneratedRowPlanStart(right)))
      .map(getGeneratedRowExecutionPhase)[0] || rootPhase
    hierarchyRows.push(buildResidentialMasterPlanHierarchySummaryRow({
      code: laneSummaryCode,
      title: laneTitle,
      summaryKind: 'organization_lane',
      nodeType: 'sub_division',
      parentClientRowId: rootId,
      children: laneRows,
      representative,
      generationBatchId: params.generationBatchId,
      executionPhase: lanePhase,
      organizationLane: lane,
      executionSortKey: -2,
      sortOrder: params.rows.length + hierarchyRows.length,
    }))

    const phaseGroups = new Map<string, GeneratedTemplateRow[]>()
    for (const row of laneRows) {
      const phase = getGeneratedRowExecutionPhase(row) || 'startup_site_setup'
      phaseGroups.set(phase, [...(phaseGroups.get(phase) ?? []), row])
    }
    const orderedPhaseGroups = [...phaseGroups.entries()].sort(([left], [right]) => (
      (EXECUTION_PHASE_ORDER[left] ?? Number.MAX_SAFE_INTEGER)
        - (EXECUTION_PHASE_ORDER[right] ?? Number.MAX_SAFE_INTEGER)
        || left.localeCompare(right)
    ))
    const workPackageGroups = new Map<string, { phases: string[]; rows: GeneratedTemplateRow[] }>()
    for (const [phase, phaseRows] of orderedPhaseGroups) {
      const packageKey = residentialHierarchyWorkPackageKey(lane, phase)
      const existing = workPackageGroups.get(packageKey)
      workPackageGroups.set(packageKey, {
        phases: [...(existing?.phases ?? []), phase],
        rows: [...(existing?.rows ?? []), ...phaseRows],
      })
    }
    for (const [packageIndex, workPackage] of [...workPackageGroups.values()].entries()) {
      const packagePhase = workPackage.phases[0] ?? lanePhase
      const packageRows = workPackage.rows
      const packageSummaryCode = `${laneSummaryCode}-WP${String(packageIndex + 1).padStart(2, '0')}`
      const packageSummaryId = `${params.generationBatchId}:residential-master-plan-v2-hierarchy:${packageSummaryCode}`
      hierarchyRows.push(buildResidentialMasterPlanHierarchySummaryRow({
        code: packageSummaryCode,
        title: workPackage.phases.map((phase) => RESIDENTIAL_MASTER_PLAN_PHASE_LABELS[phase] ?? phase).join(' / '),
        summaryKind: 'lane_work_package',
        nodeType: 'item_work',
        parentClientRowId: laneSummaryId,
        children: packageRows,
        representative: packageRows[0],
        generationBatchId: params.generationBatchId,
        executionPhase: packagePhase,
        organizationLane: lane,
        executionSortKey: -1,
        sortOrder: params.rows.length + hierarchyRows.length,
      }))
      for (const row of packageRows) {
        const metadata = readRowMetadata(row)
        const generationDepthPolicy = readRecord(metadata.generationDepthPolicy)
        row.parentClientRowId = packageSummaryId
        row.parentRowId = null
        row.values = {
          ...row.values,
          is_wbs_summary: false,
          wbs_node_type: 'process',
          category_type: 'process',
          standard_task_metadata: {
            ...metadata,
            isWbsSummary: false,
            generationDepthPolicy: {
              ...generationDepthPolicy,
              materializeDepth: 'process',
              durationComputeDepth: 'process',
            },
            masterPlanHierarchy: {
              source: RESIDENTIAL_MASTER_PLAN_HIERARCHY_SOURCE,
              summaryKind: 'execution_activity',
              nodeType: 'process',
              organizationLane: lane,
              executionPhase: getGeneratedRowExecutionPhase(row),
              parentClientRowId: packageSummaryId,
              mutationBoundary: 'preview_no_write_wizard_commit_transactional',
            },
          },
        }
      }
    }
  }

  params.rows.push(...hierarchyRows)
  applyGeneratedRowPlanRollups(params.rows)
  applyGeneratedRowTaskStructureGovernance(params.rows)

  const scheduleRows = params.rows.filter((row) => getRowProjectionMode(row) === 'schedule_row')
  const summaryScheduleRowCount = scheduleRows.filter((row) => row.values.is_wbs_summary === true).length
  const recommendedMinimum = Math.max(1, Number(params.assembly.recommendedMinimumScheduleRowCount) || 1)
  const maximum = Math.max(recommendedMinimum, Number(params.assembly.maximumScheduleRowCount) || recommendedMinimum)
  const operationalFloor = Math.max(1, Number(params.assembly.operationalRowFloor) || 1)
  const availableScheduleRowCount = Math.max(params.assembly.availableScheduleRowCount, scheduleRows.length)
  const minimum = resolveExecutableDefaultMasterPlanMinimum({
    recommendedMinimum,
    maximum,
    operationalFloor,
    availableScheduleRowCount,
  })
  params.assembly.scheduleRowCount = scheduleRows.length
  params.assembly.availableScheduleRowCount = availableScheduleRowCount
  params.assembly.minimumScheduleRowCount = minimum
  params.assembly.summaryScheduleRowCount = summaryScheduleRowCount
  const rowVolumeReadiness = evaluateExecutableDefaultMasterPlanRowVolumeReadiness({
    availableScheduleRowCount: params.assembly.availableScheduleRowCount,
    scheduleRowCount: scheduleRows.length,
    minimumScheduleRowCount: minimum,
    maximumScheduleRowCount: maximum,
    operationalRowFloor: operationalFloor,
  })
  params.assembly.assetInventoryExhausted = rowVolumeReadiness.assetInventoryExhausted
  params.assembly.readyForWizardCommit = params.assembly.readyForWizardCommit
    && rowVolumeReadiness.reasonCodes.length === 0
  params.assembly.status = params.assembly.readyForWizardCommit
    ? 'executable_default_master_plan_ready'
    : 'executable_default_master_plan_blocked'

  return {
    source: RESIDENTIAL_MASTER_PLAN_HIERARCHY_SOURCE,
    scheduleRowCount: scheduleRows.length,
    summaryScheduleRowCount,
    organizationLaneSummaryCount: orderedLaneGroups.length,
    lanePhaseSummaryCount: hierarchyRows.length - orderedLaneGroups.length - 1,
    mutationBoundary: 'preview_no_write_wizard_commit_transactional',
  }
}



export async function applyBusinessTypeMasterPlanProfileRows(params: {
  rows: GeneratedTemplateRow[]
  operation: PlanningTableOperation
  projectFacts: Record<string, unknown>
  masterPlanProfile: GeneratedMasterPlanProfile | null
  projectId: string
  generationBatchId: string
  startDate: string
  constructionCalendar?: ConstructionCalendarContext | null
  onStageTiming?: (stage: string, details?: Record<string, unknown>) => void
  algorithmSeedSourcePolicy?: AlgorithmSeedResolveContext['sourcePolicy']
}) {
  if (!params.masterPlanProfile) return null
  if (isResidentialDefaultMasterPlanOperation(params.operation, params.projectFacts)) return null
  const businessType = readDefaultMasterPlanBusinessType(params.operation, params.projectFacts)
  const configuredActivities = applyProjectOrganizationVariantMasterPlanActivityOverrides({
    businessType,
    projectFacts: params.projectFacts,
    activities: BUSINESS_TYPE_MASTER_PLAN_ACTIVITY_SETS[businessType] ?? [],
  })
  if (configuredActivities.length === 0) return null
  const isDedicatedOnlyMasterPlan = BUSINESS_TYPES_WITH_DEDICATED_MASTER_PLAN_ONLY.has(businessType)
  const operationScope = readRecord(params.operation.scope)
  const basementLevelCount = readNumberFromSources(
    [operationScope, params.projectFacts],
    ['basement_level_count', 'basementLevelCount'],
  )
  const foundationDepthM = readNumberFromSources(
    [operationScope, params.projectFacts],
    ['foundation_depth_m', 'foundationDepthM'],
  )
  const shallowNoBasement = basementLevelCount === 0
    && foundationDepthM != null
    && foundationDepthM < 3
  const activities = configuredActivities.map((activity) => (
    shallowNoBasement && businessType === 'modular_building' && activity.code === 'BTMP-MOD-03'
      ? { ...activity, durationAssetStableCode: 'shallow_foundation_concrete_structure' }
      : activity
  ))
  const baseMasterPlanActivities = getBusinessTypeBaseMasterPlanActivities(
    businessType,
    basementLevelCount,
    foundationDepthM,
  )
  const seedResolveContext = buildDefaultMasterPlanSeedResolveContext(params)
  const runtimeReferenceDays = readDefaultMasterPlanRuntimeReferenceDaysInput(params)
  const seedLookup = await buildStandardDurationSeedLookup([
    ...Object.values(DEFAULT_MASTER_PLAN_PHASE_DURATION_ASSETS).map((asset) => asset.durationAssetStableCode),
    ...(BUSINESS_TYPE_SPECIALTY_DURATION_ASSETS[businessType] ?? []).map((asset) => asset.durationAssetStableCode),
    ...baseMasterPlanActivities.map((activity) => activity.durationAssetStableCode),
    ...activities.map((activity) => activity.durationAssetStableCode),
  ], seedResolveContext)
  params.onStageTiming?.('business_type_standard_duration_seed_lookup_built', {
    businessType,
    seedCount: seedLookup.size,
  })
  const t2Lookup = await buildT2RhythmTemplateLookup([
    ...Object.values(DEFAULT_MASTER_PLAN_PHASE_DURATION_ASSETS).map((asset) => asset.t2RhythmTemplateId),
    ...(BUSINESS_TYPE_SPECIALTY_DURATION_ASSETS[businessType] ?? []).map((asset) => asset.t2RhythmTemplateId),
    ...baseMasterPlanActivities.map((activity) => activity.t2RhythmTemplateId),
    ...activities.map((activity) => activity.t2RhythmTemplateId),
    ...T2_DIVISION_RHYTHM_TEMPLATE_SEED
      .filter((template) => template.applicability.businessTypeCodes
        .map((code) => normalizeText(code))
        .includes(businessType))
      .map((template) => template.templateId),
  ], seedResolveContext)
  params.onStageTiming?.('business_type_t2_lookup_built', {
    businessType,
    templateCount: t2Lookup.size,
  })
  await fillT2RhythmTemplateLookupForBusinessType(t2Lookup, businessType, seedResolveContext)
  params.onStageTiming?.('business_type_t2_lookup_filled', {
    businessType,
    templateCount: t2Lookup.size,
  })

  const profileActivityByCode = new Map(activities.map((activity) => [activity.code, activity]))
  const overriddenBaseActivityByProfileCode = new Map<string, BusinessTypeMasterPlanActivity>()
  for (const baseActivity of baseMasterPlanActivities) {
    const overrideActivity = findBusinessTypeProfileOverrideActivity(baseActivity, activities)
    if (!overrideActivity) continue
    overriddenBaseActivityByProfileCode.set(overrideActivity.code, baseActivity)
    profileActivityByCode.set(
      overrideActivity.code,
      mergeBusinessTypeProfileOverrideActivity(overrideActivity, baseActivity),
    )
  }
  const resolvedActivities = orderBusinessTypeMasterPlanActivitiesByDependencies(
    activities.map((activity) => profileActivityByCode.get(activity.code) ?? activity),
  )
  const predecessorByCode = new Map<string, string>()
  const baseActivities = baseMasterPlanActivities.filter((activity) => (
    !businessTypeProfileOverridesBaseActivity(activity, resolvedActivities)
  ))
  const baseActivityByCode = new Map(baseActivities.map((activity) => [activity.code, activity]))
  const businessTypeActivityByCode = new Map<string, BusinessTypeMasterPlanActivity>([
    ...baseActivities.map((activity) => [activity.code, activity] as const),
    ...resolvedActivities.map((activity) => [activity.code, activity] as const),
  ])
  for (const [profileCode, baseActivity] of overriddenBaseActivityByProfileCode) {
    const mergedActivity = profileActivityByCode.get(profileCode)
    if (mergedActivity) businessTypeActivityByCode.set(baseActivity.code, mergedActivity)
  }
  const baseRows: GeneratedTemplateRow[] = []
  for (const [index, activity] of baseActivities.entries()) {
    const row = await buildBusinessTypeMasterPlanRow({
      activity,
      businessType,
      sourceType: 'business_type_base_master_plan_profile_v1',
      index,
      generationBatchId: params.generationBatchId,
      projectId: params.projectId,
      startDate: params.startDate,
      constructionCalendar: params.constructionCalendar,
      predecessorByCode,
      predecessorActivityByCode: baseActivityByCode,
      externalPredecessorClientRowIds: [],
      masterPlanProfile: params.masterPlanProfile!,
      seedLookup,
      t2Lookup,
      projectFacts: params.projectFacts,
      runtimeReferenceDays,
      operation: params.operation,
      seedResolveContext,
    })
    predecessorByCode.set(activity.code, row.clientRowId)
    baseRows.push(row)
  }
  params.onStageTiming?.('business_type_base_rows_built', {
    businessType,
    rowCount: baseRows.length,
  })
  params.rows.push(...baseRows)

  const profileRows: GeneratedTemplateRow[] = []
  for (const [index, activity] of resolvedActivities.entries()) {
    const externalPredecessorClientRowIds = isDedicatedOnlyMasterPlan
      ? []
      : resolveBusinessTypeProfilePhaseAnchorPredecessors({
        rows: params.rows,
        activity,
        startDate: params.startDate,
      })
    const fallbackBaseAnchorClientRowIds = externalPredecessorClientRowIds.length > 0
      || (activity.predecessorCodes ?? []).length > 0
      || (activity.predecessorRules ?? []).length > 0
      ? []
      : (() => {
        const anchorPhases = BUSINESS_TYPE_PROFILE_PHASE_ANCHOR_PHASES[activity.executionPhase] ?? []
        const phaseRows = baseRows.filter((row) => anchorPhases.includes(
          normalizeText(row.values.execution_phase ?? row.executionPhase),
        ))
        const candidates = phaseRows.length > 0 ? phaseRows : baseRows
        const activityStart = addDays(params.startDate, activity.startOffsetDays)
        const endingBeforeStart = candidates.filter((row) => (
          comparePlanDates(readGeneratedRowPlanEnd(row), activityStart) <= 0
        ))
        return [...(endingBeforeStart.length > 0 ? endingBeforeStart : candidates)]
          .sort((left, right) => {
            const byEndDesc = comparePlanDates(readGeneratedRowPlanEnd(right), readGeneratedRowPlanEnd(left))
            if (byEndDesc) return byEndDesc
            return right.sortOrder - left.sortOrder
          })
          .slice(0, 1)
          .map((row) => row.clientRowId)
      })()
    const row = await buildBusinessTypeMasterPlanRow({
      activity,
      businessType,
      sourceType: 'business_type_master_plan_profile_v1',
      index: baseRows.length + index,
      generationBatchId: params.generationBatchId,
      projectId: params.projectId,
      startDate: params.startDate,
      constructionCalendar: params.constructionCalendar,
      predecessorByCode,
      predecessorActivityByCode: businessTypeActivityByCode,
      externalPredecessorClientRowIds: externalPredecessorClientRowIds.length > 0
        ? externalPredecessorClientRowIds
        : fallbackBaseAnchorClientRowIds,
      masterPlanProfile: params.masterPlanProfile!,
      seedLookup,
      t2Lookup,
      projectFacts: params.projectFacts,
      runtimeReferenceDays,
      operation: params.operation,
      seedResolveContext,
    })
    predecessorByCode.set(activity.code, row.clientRowId)
    const overriddenBaseActivity = overriddenBaseActivityByProfileCode.get(activity.code)
    if (overriddenBaseActivity) predecessorByCode.set(overriddenBaseActivity.code, row.clientRowId)
    profileRows.push(row)
  }
  params.onStageTiming?.('business_type_profile_rows_built', {
    businessType,
    rowCount: profileRows.length,
  })
  const terminalControlActivity = [...resolvedActivities]
    .filter((activity) => ['commissioning', 'acceptance_handover'].includes(activity.executionPhase))
    .sort((left, right) => (
      (right.startOffsetDays + right.durationDays) - (left.startOffsetDays + left.durationDays)
      || right.code.localeCompare(left.code)
    ))[0] ?? null
  const terminalControlRow = terminalControlActivity
    ? profileRows.find((row) => readRowStableCode(row) === terminalControlActivity.code) ?? null
    : null
  if (terminalControlRow) {
    const terminalControlCode = readRowStableCode(terminalControlRow)
    const terminalControlEnd = readGeneratedRowPlanEnd(terminalControlRow) ?? params.startDate
    const terminalControlEndOffsetDays = Math.max(
      0,
      signedDurationDayDelta(params.startDate, terminalControlEnd) ?? 0,
    )
    const closeoutActivities = buildBusinessTypeContractualCloseoutActivities({
      businessType,
      terminalControlCode,
      terminalControlEndOffsetDays,
    })
    for (const [index, activity] of closeoutActivities.entries()) {
      businessTypeActivityByCode.set(activity.code, activity)
      const row = await buildBusinessTypeMasterPlanRow({
        activity,
        businessType,
        sourceType: 'business_type_master_plan_profile_v1',
        index: baseRows.length + resolvedActivities.length + index,
        generationBatchId: params.generationBatchId,
        projectId: params.projectId,
        startDate: params.startDate,
        constructionCalendar: params.constructionCalendar,
        predecessorByCode,
        predecessorActivityByCode: businessTypeActivityByCode,
        externalPredecessorClientRowIds: [],
        masterPlanProfile: params.masterPlanProfile,
        seedLookup,
        t2Lookup,
        projectFacts: params.projectFacts,
        runtimeReferenceDays,
        operation: params.operation,
        seedResolveContext,
      })
      predecessorByCode.set(activity.code, row.clientRowId)
      profileRows.push(row)
    }
  }
  params.onStageTiming?.('business_type_closeout_rows_built', {
    businessType,
    rowCount: profileRows.length,
  })
  for (const row of [...baseRows, ...profileRows]) syncGeneratedRowDurationOutput(row)
  applyBusinessTypeProfilePhaseAnchorNotices(profileRows)
  params.rows.push(...profileRows)
  convertExistingMasterPlanScheduleRowsToBusinessTypeEvidence(params.rows)
  return {
    source: 'managed_frontier_default_master_plan',
    profileSource: 'business_type_master_plan_profile_v1',
    baseProfileSource: 'business_type_base_master_plan_profile_v1',
    businessType,
    insertedScheduleRowCount: baseRows.length + profileRows.length,
    baseScheduleRowCount: baseRows.length,
    profileScheduleRowCount: profileRows.length,
    mutationBoundary: params.masterPlanProfile.mutationBoundary,
  }
}
