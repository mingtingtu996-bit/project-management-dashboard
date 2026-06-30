import type { BusinessSubtypeCode, BusinessTypeCode, MethodVariantCode } from './projectTypeRecommendations.js'
import {
  isLowRiseMultiBuildingParallelScenario as resolveLowRiseMultiBuildingParallelScenario,
  resolveBuildingPatternExecutionArchetypeProfile,
  type BuildingPatternExecutionArchetype,
  type BuildingPatternExecutionArchetypeProfile,
} from './buildingPatternExecutionResolver.js'
import {
  resolveBuildingPatternScheduleTrust,
  type BuildingPatternScheduleTrust,
} from './buildingPatternScheduleTrustService.js'
import {
  BUILDING_PATTERN_SCHEDULE_CALIBRATION_THRESHOLDS,
  type BuildingPatternScheduleCalibrationStatus,
  type BuildingPatternScheduleRuntimeBenchmarkResult,
} from './buildingPatternScheduleCalibrationService.js'

export type {
  BuildingPatternExecutionArchetype,
  BuildingPatternExecutionArchetypeProfile,
} from './buildingPatternExecutionResolver.js'

export const PROJECT_SCENARIO_TAXONOMY_VERSION = 'v1.4.22.1-project-scenario-taxonomy-20260529'

export const PRODUCT_BUSINESS_TYPE_CODES = [
  'general_civil',
  'hotel',
  'hospital',
  'school',
  'industrial',
  'data_center',
  'transportation_hub',
  'sports_culture',
  'tod_upper_cover',
  'renovation',
  'modular_building',
] as const satisfies readonly BusinessTypeCode[]

export type WbsTemplateProjectRecommendationKey =
  | 'residential'
  | 'prefab_residential'
  | 'hospital'
  | 'data_center'
  | 'clean_industrial'
  | 'large_span_steel_public'
  | 'renovation'
  | 'heritage'
  | 'campus'
  | 'tod'
  | 'modular_construction'
  | 'luxury_hotel'
  | 'deep_foundation'

export const REAL_PROJECT_RECOMMENDATION_PACK_KEYS = [
  'residential',
  'prefab_residential',
  'hospital',
  'data_center',
  'clean_industrial',
  'large_span_steel_public',
  'renovation',
  'heritage',
  'campus',
  'tod',
  'modular_construction',
  'luxury_hotel',
  'deep_foundation',
] as const satisfies readonly WbsTemplateProjectRecommendationKey[]

export interface ProjectScenarioFacts {
  businessType?: BusinessTypeCode | string | null
  businessSubtype?: BusinessSubtypeCode | string | null
  methodVariantCodes?: Array<MethodVariantCode | string> | null
  buildingPatternCode?: string | null
  buildingPatternCodes?: string[] | null
  projectFeatures?: Record<string, unknown> | null
  projectTypeCode?: string | null
  structureTypeCode?: string | null
  totalAreaM2?: number | null
  buildingCount?: number | null
  standardFloorCount?: number | null
  highestBuildingFloorCount?: number | null
  basementLevelCount?: number | null
  basementAreaM2?: number | null
  foundationDepthM?: number | null
  prefabRate?: number | null
}

export interface ProjectScenarioProfile {
  taxonomyVersion: typeof PROJECT_SCENARIO_TAXONOMY_VERSION
  businessType: string | null
  businessSubtype: string | null
  primaryRecommendationPack: WbsTemplateProjectRecommendationKey
  companionRecommendationPacks: WbsTemplateProjectRecommendationKey[]
  recommendationPacks: WbsTemplateProjectRecommendationKey[]
  benchmarkScenarioKeys: string[]
  executionProfile: {
    source: BuildingPatternExecutionArchetypeProfile['source']
    primaryArchetype: BuildingPatternExecutionArchetype
    crossCuttingArchetypes: BuildingPatternExecutionArchetype[]
    allArchetypes: BuildingPatternExecutionArchetype[]
    patternCodes: string[]
    confidence: BuildingPatternExecutionArchetypeProfile['confidence']
  }
  buildingPatternScheduleTrust: BuildingPatternScheduleTrust
  scheduleProfile: ProjectScenarioScheduleProfile
  durationCommercialReadiness: ProjectScenarioDurationCommercialReadiness
}

export type ProjectScenarioDurationCommercialReadinessStatus =
  | 'commercial_ready'
  | 'candidate_only'
  | 'advisory_only'
  | 'blocked'

export type ProjectScenarioDurationFactStrengthStatus =
  | 'strong_static_facts'
  | 'missing_scale_or_method_facts'
  | 'missing_pattern_evidence'

export type ProjectScenarioDurationAccuracyStatus =
  | 'within_commercial_threshold'
  | 'needs_runtime_benchmark_evidence'
  | 'failed_runtime_benchmark'
  | 'needs_golden_benchmark_binding'

export type ProjectScenarioDurationCommercialReadiness = {
  status: ProjectScenarioDurationCommercialReadinessStatus
  factStrengthStatus: ProjectScenarioDurationFactStrengthStatus
  sampleCalibrationStatus: BuildingPatternScheduleCalibrationStatus
  scenarioAccuracyStatus: ProjectScenarioDurationAccuracyStatus
  reasonCodes: string[]
  thresholds: typeof BUILDING_PATTERN_SCHEDULE_CALIBRATION_THRESHOLDS
  boundaryPolicy: string[]
}

export type ProjectScenarioSchedulePattern =
  | 'residential_tower_overlap_chain'
  | 'prefab_supply_chain_parallel'
  | 'special_system_commissioning_chain'
  | 'mission_critical_mep_commissioning_chain'
  | 'industrial_cleanroom_validation_chain'
  | 'large_span_steel_lift_chain'
  | 'renovation_decanting_chain'
  | 'heritage_protection_chain'
  | 'campus_multi_building_parallel'
  | 'interface_constraint_chain'
  | 'factory_parallel_site_assembly'
  | 'hotel_room_mockup_turnover_chain'
  | 'deep_foundation_observation_chain'
  | 'general_sequence'

export type ProjectScenarioScheduleProfile = {
  recommendationPacks: WbsTemplateProjectRecommendationKey[]
  dominantSchedulePattern: ProjectScenarioSchedulePattern
  fastTrackIntensity: 'low' | 'medium' | 'high'
  strictInterfaceLagDays: number
  foundationReleaseDays: number
  mepReleaseDays: number
  fitoutReleaseDays: number
  commissioningReleaseDays: number
  outdoorReleaseDays: number
  phaseScaleAreaBaselineM2: number
  phaseScaleBuildingExponent: number
  phaseScaleFloorExponent: number
}

function normalizeId(value: unknown) {
  return String(value ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_')
}

function readNumber(value: unknown): number | null {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function normalizeRate01(value: unknown): number | null {
  const parsed = readNumber(value)
  if (parsed === null) return null
  if (parsed > 1) return parsed / 100
  return parsed
}

function unique<T extends string>(values: T[]) {
  return [...new Set(values)]
}

function readFeatureNumber(facts: ProjectScenarioFacts, key: keyof ProjectScenarioFacts, featureKey: string) {
  return readNumber(facts[key] ?? facts.projectFeatures?.[featureKey])
}

function readFeatureBoolean(features: Record<string, unknown>, key: string) {
  return features[key] === true || normalizeId(features[key]) === 'true'
}

function hasMethodOrStructureFacts(facts: ProjectScenarioFacts) {
  const methodCodes = (facts.methodVariantCodes ?? []).map(normalizeProjectScenarioMethodCode).filter(Boolean)
  return methodCodes.length > 0
    || Boolean(normalizeId(facts.structureTypeCode))
    || Boolean(normalizeId(facts.projectTypeCode))
}

export function normalizeProjectScenarioMethodCode(value: unknown) {
  const normalized = normalizeId(value)
  if (['modular_mic', 'mic', 'modular', 'modular_building', 'modular_construction'].includes(normalized)) return 'mic_modular'
  if (['steel_frame', 'steel_structure', 'steel_assembly', 'prefabricated_steel'].includes(normalized)) return 'steel_assembly'
  if (['precast_concrete', 'prefab', 'prefabricated', 'prefabricated_concrete', 'pc', 'pc_prefab'].includes(normalized)) return 'prefab_concrete'
  if (['cast_in_situ', 'cast_in_place', 'cast_in_place_concrete', 'cast_in_place_tower'].includes(normalized)) return 'cast_in_place'
  return normalized
}

export function isLowRiseMultiBuildingParallelScenario(facts: ProjectScenarioFacts) {
  return resolveLowRiseMultiBuildingParallelScenario(facts)
}

export function inferExecutionProfileFromProjectFacts(facts: ProjectScenarioFacts) {
  return resolveBuildingPatternExecutionArchetypeProfile(facts)
}

function resolvePrimaryRecommendationPack(facts: ProjectScenarioFacts): WbsTemplateProjectRecommendationKey {
  const businessType = normalizeId(facts.businessType)
  const businessSubtype = normalizeId(facts.businessSubtype)
  const methods = new Set((facts.methodVariantCodes ?? []).map(normalizeProjectScenarioMethodCode))
  const features = facts.projectFeatures ?? {}
  if (businessType === 'modular_building' || methods.has('mic_modular')) return 'modular_construction'
  if (businessType === 'tod_upper_cover') return 'tod'
  if (businessType === 'data_center') return 'data_center'
  if (businessType === 'hospital') return 'hospital'
  if (businessType === 'school') return 'campus'
  if (businessType === 'hotel') return 'luxury_hotel'
  if (businessType === 'transportation_hub' || businessType === 'sports_culture') return 'large_span_steel_public'
  if (businessSubtype === 'industrial_cleanroom' || features.cleanroomLevel || features.processValidationScope) return 'clean_industrial'
  if (businessSubtype === 'renovation_heritage') return 'heritage'
  if (businessType === 'renovation') return 'renovation'
  if (methods.has('prefab_concrete')) return 'prefab_residential'
  return 'residential'
}

function resolveCompanionRecommendationPacks(facts: ProjectScenarioFacts, primary: WbsTemplateProjectRecommendationKey) {
  const features = facts.projectFeatures ?? {}
  const foundationDepth = readFeatureNumber(facts, 'foundationDepthM', 'foundationDepthM')
    ?? readFeatureNumber(facts, 'foundationDepthM', 'foundation_depth_m')
  const packs: WbsTemplateProjectRecommendationKey[] = []
  if ((foundationDepth !== null && foundationDepth >= 10) || features.foundationIntensive === true) {
    packs.push('deep_foundation')
  }
  return unique(packs.filter((pack) => pack !== primary))
}

const BENCHMARK_SCENARIO_BY_PACK: Record<WbsTemplateProjectRecommendationKey, string> = {
  residential: 'A',
  prefab_residential: 'B',
  hospital: 'C',
  data_center: 'D',
  clean_industrial: 'E',
  large_span_steel_public: 'F',
  renovation: 'G1',
  heritage: 'G2',
  campus: 'H',
  tod: 'I',
  modular_construction: 'J',
  luxury_hotel: 'K',
  deep_foundation: 'L',
}

const SCHEDULE_PROFILE_BY_PACK: Record<WbsTemplateProjectRecommendationKey, ProjectScenarioScheduleProfile> = {
  residential: {
    recommendationPacks: ['residential'],
    dominantSchedulePattern: 'residential_tower_overlap_chain',
    fastTrackIntensity: 'low',
    strictInterfaceLagDays: 0,
    foundationReleaseDays: 30,
    mepReleaseDays: 110,
    fitoutReleaseDays: 120,
    commissioningReleaseDays: 90,
    outdoorReleaseDays: 90,
    phaseScaleAreaBaselineM2: 120_000,
    phaseScaleBuildingExponent: 0.24,
    phaseScaleFloorExponent: 0.28,
  },
  prefab_residential: {
    recommendationPacks: ['prefab_residential'],
    dominantSchedulePattern: 'prefab_supply_chain_parallel',
    fastTrackIntensity: 'medium',
    strictInterfaceLagDays: 0,
    foundationReleaseDays: 30,
    mepReleaseDays: 45,
    fitoutReleaseDays: 105,
    commissioningReleaseDays: 75,
    outdoorReleaseDays: 75,
    phaseScaleAreaBaselineM2: 120_000,
    phaseScaleBuildingExponent: 0.14,
    phaseScaleFloorExponent: 0.24,
  },
  hospital: {
    recommendationPacks: ['hospital'],
    dominantSchedulePattern: 'special_system_commissioning_chain',
    fastTrackIntensity: 'low',
    strictInterfaceLagDays: 14,
    foundationReleaseDays: 35,
    mepReleaseDays: 45,
    fitoutReleaseDays: 75,
    commissioningReleaseDays: 21,
    outdoorReleaseDays: 45,
    phaseScaleAreaBaselineM2: 90_000,
    phaseScaleBuildingExponent: 0.18,
    phaseScaleFloorExponent: 0.22,
  },
  data_center: {
    recommendationPacks: ['data_center'],
    dominantSchedulePattern: 'mission_critical_mep_commissioning_chain',
    fastTrackIntensity: 'medium',
    strictInterfaceLagDays: 14,
    foundationReleaseDays: 30,
    mepReleaseDays: 21,
    fitoutReleaseDays: 60,
    commissioningReleaseDays: 14,
    outdoorReleaseDays: 45,
    phaseScaleAreaBaselineM2: 70_000,
    phaseScaleBuildingExponent: 0.1,
    phaseScaleFloorExponent: 0.18,
  },
  clean_industrial: {
    recommendationPacks: ['clean_industrial'],
    dominantSchedulePattern: 'industrial_cleanroom_validation_chain',
    fastTrackIntensity: 'medium',
    strictInterfaceLagDays: 14,
    foundationReleaseDays: 30,
    mepReleaseDays: 35,
    fitoutReleaseDays: 65,
    commissioningReleaseDays: 21,
    outdoorReleaseDays: 45,
    phaseScaleAreaBaselineM2: 80_000,
    phaseScaleBuildingExponent: 0.1,
    phaseScaleFloorExponent: 0.16,
  },
  large_span_steel_public: {
    recommendationPacks: ['large_span_steel_public'],
    dominantSchedulePattern: 'large_span_steel_lift_chain',
    fastTrackIntensity: 'medium',
    strictInterfaceLagDays: 21,
    foundationReleaseDays: 35,
    mepReleaseDays: 45,
    fitoutReleaseDays: 75,
    commissioningReleaseDays: 45,
    outdoorReleaseDays: 45,
    phaseScaleAreaBaselineM2: 90_000,
    phaseScaleBuildingExponent: 0.08,
    phaseScaleFloorExponent: 0.16,
  },
  renovation: {
    recommendationPacks: ['renovation'],
    dominantSchedulePattern: 'renovation_decanting_chain',
    fastTrackIntensity: 'low',
    strictInterfaceLagDays: 14,
    foundationReleaseDays: 14,
    mepReleaseDays: 21,
    fitoutReleaseDays: 35,
    commissioningReleaseDays: 21,
    outdoorReleaseDays: 21,
    phaseScaleAreaBaselineM2: 45_000,
    phaseScaleBuildingExponent: 0.08,
    phaseScaleFloorExponent: 0.14,
  },
  heritage: {
    recommendationPacks: ['heritage'],
    dominantSchedulePattern: 'heritage_protection_chain',
    fastTrackIntensity: 'low',
    strictInterfaceLagDays: 21,
    foundationReleaseDays: 14,
    mepReleaseDays: 28,
    fitoutReleaseDays: 42,
    commissioningReleaseDays: 21,
    outdoorReleaseDays: 21,
    phaseScaleAreaBaselineM2: 30_000,
    phaseScaleBuildingExponent: 0.06,
    phaseScaleFloorExponent: 0.12,
  },
  campus: {
    recommendationPacks: ['campus'],
    dominantSchedulePattern: 'campus_multi_building_parallel',
    fastTrackIntensity: 'medium',
    strictInterfaceLagDays: 0,
    foundationReleaseDays: 21,
    mepReleaseDays: 35,
    fitoutReleaseDays: 60,
    commissioningReleaseDays: 35,
    outdoorReleaseDays: 35,
    phaseScaleAreaBaselineM2: 100_000,
    phaseScaleBuildingExponent: 0.08,
    phaseScaleFloorExponent: 0.14,
  },
  tod: {
    recommendationPacks: ['tod'],
    dominantSchedulePattern: 'interface_constraint_chain',
    fastTrackIntensity: 'low',
    strictInterfaceLagDays: 21,
    foundationReleaseDays: 45,
    mepReleaseDays: 50,
    fitoutReleaseDays: 90,
    commissioningReleaseDays: 60,
    outdoorReleaseDays: 45,
    phaseScaleAreaBaselineM2: 110_000,
    phaseScaleBuildingExponent: 0.18,
    phaseScaleFloorExponent: 0.2,
  },
  modular_construction: {
    recommendationPacks: ['modular_construction'],
    dominantSchedulePattern: 'factory_parallel_site_assembly',
    fastTrackIntensity: 'high',
    strictInterfaceLagDays: 0,
    foundationReleaseDays: 21,
    mepReleaseDays: 14,
    fitoutReleaseDays: 30,
    commissioningReleaseDays: 14,
    outdoorReleaseDays: 21,
    phaseScaleAreaBaselineM2: 60_000,
    phaseScaleBuildingExponent: 0.06,
    phaseScaleFloorExponent: 0.12,
  },
  luxury_hotel: {
    recommendationPacks: ['luxury_hotel'],
    dominantSchedulePattern: 'hotel_room_mockup_turnover_chain',
    fastTrackIntensity: 'low',
    strictInterfaceLagDays: 14,
    foundationReleaseDays: 30,
    mepReleaseDays: 45,
    fitoutReleaseDays: 60,
    commissioningReleaseDays: 30,
    outdoorReleaseDays: 45,
    phaseScaleAreaBaselineM2: 90_000,
    phaseScaleBuildingExponent: 0.16,
    phaseScaleFloorExponent: 0.22,
  },
  deep_foundation: {
    recommendationPacks: ['deep_foundation'],
    dominantSchedulePattern: 'deep_foundation_observation_chain',
    fastTrackIntensity: 'low',
    strictInterfaceLagDays: 14,
    foundationReleaseDays: 45,
    mepReleaseDays: 60,
    fitoutReleaseDays: 120,
    commissioningReleaseDays: 90,
    outdoorReleaseDays: 90,
    phaseScaleAreaBaselineM2: 90_000,
    phaseScaleBuildingExponent: 0.18,
    phaseScaleFloorExponent: 0.24,
  },
}

function mergeScheduleProfiles(profiles: ProjectScenarioScheduleProfile[]): ProjectScenarioScheduleProfile {
  const [primary, ...companions] = profiles
  const all = profiles.length > 0 ? profiles : [SCHEDULE_PROFILE_BY_PACK.residential]
  const maxFastTrack = all.some((profile) => profile.fastTrackIntensity === 'high')
    ? 'high'
    : all.some((profile) => profile.fastTrackIntensity === 'medium')
      ? 'medium'
      : 'low'
  return {
    ...(primary ?? SCHEDULE_PROFILE_BY_PACK.residential),
    recommendationPacks: unique(all.flatMap((profile) => profile.recommendationPacks)),
    fastTrackIntensity: maxFastTrack,
    strictInterfaceLagDays: Math.max(...all.map((profile) => profile.strictInterfaceLagDays)),
    foundationReleaseDays: Math.max(...all.map((profile) => profile.foundationReleaseDays)),
    mepReleaseDays: Math.min(...all.map((profile) => profile.mepReleaseDays)),
    fitoutReleaseDays: Math.min(...all.map((profile) => profile.fitoutReleaseDays)),
    commissioningReleaseDays: Math.min(...all.map((profile) => profile.commissioningReleaseDays)),
    outdoorReleaseDays: Math.min(...all.map((profile) => profile.outdoorReleaseDays)),
    phaseScaleAreaBaselineM2: Math.min(...all.map((profile) => profile.phaseScaleAreaBaselineM2)),
    phaseScaleBuildingExponent: Math.min(...all.map((profile) => profile.phaseScaleBuildingExponent)),
    phaseScaleFloorExponent: Math.min(...all.map((profile) => profile.phaseScaleFloorExponent)),
  }
}

function uniqueReasonCodes(values: Array<string | null | undefined>) {
  return [...new Set(values.map((value) => String(value ?? '').trim()).filter(Boolean))]
}

function resolveFactStrengthStatus(
  facts: ProjectScenarioFacts,
  scheduleTrust: BuildingPatternScheduleTrust,
): {
  status: ProjectScenarioDurationFactStrengthStatus
  reasonCodes: string[]
} {
  const scaleFactsComplete = scheduleTrust.reasonCodes.includes('project_scale_facts_present')
  const patternEvidencePresent = scheduleTrust.reasonCodes.includes('building_pattern_codes_verified')
  const methodFactsPresent = hasMethodOrStructureFacts(facts)

  if (!patternEvidencePresent) {
    return {
      status: 'missing_pattern_evidence',
      reasonCodes: uniqueReasonCodes([
        'building_pattern_codes_missing',
        scaleFactsComplete ? 'project_scale_facts_present' : 'project_scale_facts_incomplete',
        methodFactsPresent ? 'method_or_structure_facts_present' : 'method_or_structure_facts_missing',
      ]),
    }
  }

  if (!scaleFactsComplete || !methodFactsPresent) {
    return {
      status: 'missing_scale_or_method_facts',
      reasonCodes: uniqueReasonCodes([
        scaleFactsComplete ? 'project_scale_facts_present' : 'project_scale_facts_incomplete',
        methodFactsPresent ? 'method_or_structure_facts_present' : 'method_or_structure_facts_missing',
        'building_pattern_codes_verified',
      ]),
    }
  }

  return {
    status: 'strong_static_facts',
    reasonCodes: [
      'static_facts_complete',
      'project_scale_facts_present',
      'method_or_structure_facts_present',
      'building_pattern_codes_verified',
    ],
  }
}

function resolveScenarioAccuracyStatus(status: BuildingPatternScheduleCalibrationStatus): {
  status: ProjectScenarioDurationAccuracyStatus
  reasonCodes: string[]
} {
  if (status === 'golden_benchmark_bound') {
    return {
      status: 'within_commercial_threshold',
      reasonCodes: [
        'sample_calibration_passed',
        'scenario_accuracy_within_commercial_threshold',
      ],
    }
  }
  if (status === 'needs_runtime_benchmark_evidence') {
    return {
      status: 'needs_runtime_benchmark_evidence',
      reasonCodes: ['runtime_benchmark_evidence_missing'],
    }
  }
  if (status === 'runtime_benchmark_failed') {
    return {
      status: 'failed_runtime_benchmark',
      reasonCodes: ['runtime_benchmark_failed'],
    }
  }
  return {
    status: 'needs_golden_benchmark_binding',
    reasonCodes: ['golden_benchmark_binding_missing'],
  }
}

function resolveDurationCommercialReadiness(params: {
  facts: ProjectScenarioFacts
  buildingPatternScheduleTrust: BuildingPatternScheduleTrust
}): ProjectScenarioDurationCommercialReadiness {
  const factStrength = resolveFactStrengthStatus(params.facts, params.buildingPatternScheduleTrust)
  const sampleCalibrationStatus = params.buildingPatternScheduleTrust.calibration.status
  const scenarioAccuracy = resolveScenarioAccuracyStatus(sampleCalibrationStatus)
  const trustIsControlled = params.buildingPatternScheduleTrust.trustLevel === 'controlled_schedule_input'

  let status: ProjectScenarioDurationCommercialReadinessStatus = 'advisory_only'
  if (scenarioAccuracy.status === 'failed_runtime_benchmark') {
    status = 'blocked'
  } else if (
    factStrength.status === 'strong_static_facts'
    && sampleCalibrationStatus === 'golden_benchmark_bound'
    && scenarioAccuracy.status === 'within_commercial_threshold'
    && trustIsControlled
  ) {
    status = 'commercial_ready'
  } else if (
    factStrength.status !== 'strong_static_facts'
    || sampleCalibrationStatus === 'needs_runtime_benchmark_evidence'
    || params.buildingPatternScheduleTrust.trustLevel === 'candidate_only'
  ) {
    status = 'candidate_only'
  }

  return {
    status,
    factStrengthStatus: factStrength.status,
    sampleCalibrationStatus,
    scenarioAccuracyStatus: scenarioAccuracy.status,
    reasonCodes: uniqueReasonCodes([
      ...factStrength.reasonCodes,
      ...scenarioAccuracy.reasonCodes,
      trustIsControlled ? 'building_pattern_schedule_trust_controlled' : 'building_pattern_schedule_trust_not_controlled',
      status === 'commercial_ready' ? 'commercial_ready_requires_fact_strength_sample_calibration_and_scenario_accuracy' : null,
      status !== 'commercial_ready' ? 'non_commercial_ready_profiles_must_not_write_planned_dates_or_hard_dependencies' : null,
    ]),
    thresholds: BUILDING_PATTERN_SCHEDULE_CALIBRATION_THRESHOLDS,
    boundaryPolicy: [
      'commercial_ready_requires_fact_strength_sample_calibration_and_scenario_accuracy',
      'building_pattern_can_only_supply_schedule_rhythm_context',
      'non_commercial_ready_profiles_must_not_write_planned_dates_or_hard_dependencies',
      'hard_dependencies_remain_owned_by_five_layer_dependency_assets',
    ],
  }
}

export function resolveScenarioScheduleProfile(params: {
  recommendationPacks?: WbsTemplateProjectRecommendationKey[] | null
  facts?: ProjectScenarioFacts | null
}): ProjectScenarioScheduleProfile {
  const recommendationPacks = params.recommendationPacks?.length
    ? params.recommendationPacks
    : params.facts
      ? resolveProjectScenarioProfile(params.facts).recommendationPacks
      : ['residential']
  return mergeScheduleProfiles(recommendationPacks.map((pack) => SCHEDULE_PROFILE_BY_PACK[pack]).filter(Boolean))
}

export function resolveProjectScenarioProfile(
  facts: ProjectScenarioFacts,
  options: { runtimeBenchmarkResults?: readonly BuildingPatternScheduleRuntimeBenchmarkResult[] | null } = {},
): ProjectScenarioProfile {
  const primaryRecommendationPack = resolvePrimaryRecommendationPack(facts)
  const companionRecommendationPacks = resolveCompanionRecommendationPacks(facts, primaryRecommendationPack)
  const recommendationPacks = unique([primaryRecommendationPack, ...companionRecommendationPacks])
  const scheduleProfile = mergeScheduleProfiles(recommendationPacks.map((pack) => SCHEDULE_PROFILE_BY_PACK[pack]))
  const executionProfile = inferExecutionProfileFromProjectFacts(facts)
  const buildingPatternScheduleTrust = resolveBuildingPatternScheduleTrust({
    facts,
    recommendationPacks,
    scheduleProfile,
    runtimeBenchmarkResults: options.runtimeBenchmarkResults,
  })
  const durationCommercialReadiness = resolveDurationCommercialReadiness({
    facts,
    buildingPatternScheduleTrust,
  })
  return {
    taxonomyVersion: PROJECT_SCENARIO_TAXONOMY_VERSION,
    businessType: normalizeId(facts.businessType) || null,
    businessSubtype: normalizeId(facts.businessSubtype) || null,
    primaryRecommendationPack,
    companionRecommendationPacks,
    recommendationPacks,
    benchmarkScenarioKeys: recommendationPacks.map((pack) => BENCHMARK_SCENARIO_BY_PACK[pack]),
    executionProfile,
    buildingPatternScheduleTrust,
    scheduleProfile,
    durationCommercialReadiness,
  }
}
