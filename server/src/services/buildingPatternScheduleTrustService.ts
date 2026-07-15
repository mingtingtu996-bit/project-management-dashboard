import {
  V1474_BUILDING_PATTERN_SEED,
  type V1474BuildingPattern,
} from '../seeds/v1474BuildingPatternSeed.js'
import {
  resolveBuildingPatternScheduleCalibrationCoverage,
  type BuildingPatternScheduleCalibrationCoverage,
  type BuildingPatternScheduleRuntimeBenchmarkResult,
} from './buildingPatternScheduleCalibrationService.js'
import { resolveBuildingPatternExecutionArchetypeProfile } from './buildingPatternExecutionResolver.js'
import type { BusinessTypeCode } from './projectTypeRecommendations.js'
import type {
  ProjectScenarioFacts,
  ProjectScenarioScheduleProfile,
  WbsTemplateProjectRecommendationKey,
} from './projectScenarioTaxonomyService.js'

export type BuildingPatternScheduleTrustLevel =
  | 'confidence_only'
  | 'candidate_only'
  | 'controlled_schedule_input'

export type BuildingPatternScheduleReadiness =
  | 'trusted'
  | 'needs_seed_evidence'
  | 'needs_project_scale_facts'
  | 'needs_schedule_profile'
  | 'needs_seed_depth'
  | 'needs_real_project_calibration'

export type BuildingPatternScheduleTrust = {
  trustLevel: BuildingPatternScheduleTrustLevel
  scheduleReadiness: BuildingPatternScheduleReadiness
  seedAuthority: 'schedule_rhythm_context'
  hardDependencyAuthority: false
  plannedDateWritePolicy: 'never_direct_write'
  reasonCodes: string[]
  coverage: {
    businessType: string | null
    businessSubtype: string | null
    recommendationPacks: WbsTemplateProjectRecommendationKey[]
    schedulePattern: ProjectScenarioScheduleProfile['dominantSchedulePattern']
    verifiedPatternCodes: string[]
    rejectedPatternCodes: string[]
    executionArchetypes: string[]
    scaleFactKeys: string[]
  }
  calibration: BuildingPatternScheduleCalibrationCoverage
  boundaryPolicy: {
    allowedOutputs: Array<
      | 'phase_release_window_candidate'
      | 'rhythm_context'
      | 'duration_context_factor'
      | 'parallel_caution'
    >
    forbiddenOutputs: Array<
      | 'hard_task_dependency'
      | 'dependency_layer_edge'
      | 'planned_date_write'
    >
    fiveLayerDependencyAuthority: 'hard_dependencies_only'
    dependencyAuthoritySeedTypes: [
      'workflow_dictionary',
      'standard_internal_flow',
      'cross_item_workflow',
      'dependency_intent_templates',
      'process_constraint',
    ]
  }
}

const SEED_BY_CODE = new Map(
  V1474_BUILDING_PATTERN_SEED.map((record) => [normalizeId(record.patternCode), record]),
)

function normalizeId(value: unknown) {
  return String(value ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_')
}

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

function normalizeNumber(value: unknown): number | null {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function readArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function readStringArray(value: unknown) {
  return readArray(value).map(normalizeText).filter(Boolean)
}

function unique(values: Array<string | null | undefined>) {
  return [...new Set(values.map(normalizeText).filter(Boolean))]
}

function readBuildingPatternCodes(facts: ProjectScenarioFacts) {
  const factRecord = facts as Record<string, unknown>
  const projectFeatures = readRecord(facts.projectFeatures)
  return unique([
    ...readStringArray(facts.buildingPatternCodes),
    ...readStringArray(factRecord.building_pattern_codes),
    normalizeText(facts.buildingPatternCode),
    normalizeText(factRecord.building_pattern_code),
    ...readStringArray(projectFeatures.buildingPatternCodes),
    ...readStringArray(projectFeatures.building_pattern_codes),
    normalizeText(projectFeatures.buildingPatternCode),
    normalizeText(projectFeatures.building_pattern_code),
  ]).map(normalizeId)
}

function readFeatureNumber(facts: ProjectScenarioFacts, key: keyof ProjectScenarioFacts, featureKey: string) {
  const projectFeatures = readRecord(facts.projectFeatures)
  return normalizeNumber(facts[key] ?? projectFeatures[featureKey])
}

function scaleFactKeys(facts: ProjectScenarioFacts) {
  const keys: string[] = []
  if ((readFeatureNumber(facts, 'totalAreaM2', 'totalAreaM2') ?? 0) > 0) keys.push('totalAreaM2')
  if ((readFeatureNumber(facts, 'buildingCount', 'buildingCount') ?? 0) > 0) keys.push('buildingCount')
  if (
    (readFeatureNumber(facts, 'standardFloorCount', 'standardFloorCount') ?? 0) > 0
    || (readFeatureNumber(facts, 'highestBuildingFloorCount', 'highestBuildingFloorCount') ?? 0) > 0
  ) {
    keys.push('floorCount')
  }
  if (readFeatureNumber(facts, 'basementLevelCount', 'basementLevelCount') !== null) keys.push('basementLevelCount')
  return keys
}

function hasScheduleDepth(record: V1474BuildingPattern) {
  return Boolean(record.durationCurveProfile)
    && Boolean(record.parallelPolicy)
    && (record.staggerRules?.length ?? 0) > 0
    && (record.controlChains?.length ?? 0) > 0
}

function boundaryPolicy(): BuildingPatternScheduleTrust['boundaryPolicy'] {
  return {
    allowedOutputs: [
      'phase_release_window_candidate',
      'rhythm_context',
      'duration_context_factor',
      'parallel_caution',
    ],
    forbiddenOutputs: [
      'hard_task_dependency',
      'dependency_layer_edge',
      'planned_date_write',
    ],
    fiveLayerDependencyAuthority: 'hard_dependencies_only',
    dependencyAuthoritySeedTypes: [
      'workflow_dictionary',
      'standard_internal_flow',
      'cross_item_workflow',
      'dependency_intent_templates',
      'process_constraint',
    ],
  }
}

function trustLevel(readiness: BuildingPatternScheduleReadiness): BuildingPatternScheduleTrustLevel {
  if (readiness === 'trusted') return 'controlled_schedule_input'
  if (
    readiness === 'needs_seed_evidence'
    || readiness === 'needs_project_scale_facts'
    || readiness === 'needs_real_project_calibration'
  ) return 'candidate_only'
  return 'confidence_only'
}

export function resolveBuildingPatternScheduleTrust(params: {
  facts: ProjectScenarioFacts
  recommendationPacks: WbsTemplateProjectRecommendationKey[]
  scheduleProfile: ProjectScenarioScheduleProfile
  runtimeBenchmarkResults?: readonly BuildingPatternScheduleRuntimeBenchmarkResult[] | null
}): BuildingPatternScheduleTrust {
  const patternCodes = readBuildingPatternCodes(params.facts)
  const verifiedPatternCodes = patternCodes.filter((code) => SEED_BY_CODE.has(code))
  const rejectedPatternCodes = patternCodes.filter((code) => !SEED_BY_CODE.has(code))
  const verifiedPatterns = verifiedPatternCodes
    .map((code) => SEED_BY_CODE.get(code))
    .filter((record): record is V1474BuildingPattern => Boolean(record))
  const scaleKeys = scaleFactKeys(params.facts)
  const scheduleProfilePresent = params.recommendationPacks.length > 0
    && params.scheduleProfile.dominantSchedulePattern !== 'general_sequence'
  const seedDepthPresent = verifiedPatterns.length > 0
    && verifiedPatterns.every(hasScheduleDepth)
  const executionProfile = resolveBuildingPatternExecutionArchetypeProfile(params.facts)
  const calibration = resolveBuildingPatternScheduleCalibrationCoverage({
    recommendationPacks: params.recommendationPacks,
    runtimeResults: params.runtimeBenchmarkResults,
  })
  const calibrationBound = calibration.status === 'golden_benchmark_bound'

  let scheduleReadiness: BuildingPatternScheduleReadiness = 'trusted'
  if (verifiedPatternCodes.length === 0) {
    scheduleReadiness = 'needs_seed_evidence'
  } else if (scaleKeys.length < 4) {
    scheduleReadiness = 'needs_project_scale_facts'
  } else if (!scheduleProfilePresent) {
    scheduleReadiness = 'needs_schedule_profile'
  } else if (!seedDepthPresent) {
    scheduleReadiness = 'needs_seed_depth'
  } else if (!calibrationBound) {
    scheduleReadiness = 'needs_real_project_calibration'
  }

  const reasonCodes = unique([
    verifiedPatternCodes.length > 0 ? 'building_pattern_codes_verified' : 'building_pattern_codes_missing',
    rejectedPatternCodes.length > 0 ? 'building_pattern_codes_rejected' : null,
    scaleKeys.length >= 4 ? 'project_scale_facts_present' : 'project_scale_facts_incomplete',
    scheduleProfilePresent ? 'scenario_schedule_profile_present' : 'scenario_schedule_profile_missing',
    seedDepthPresent ? 'duration_curve_parallel_stagger_fields_present' : 'duration_curve_parallel_stagger_fields_missing',
    calibrationBound ? 'real_project_benchmark_pack_bound' : 'real_project_benchmark_pack_missing',
    calibrationBound ? 'golden_benchmark_threshold_bound' : 'golden_benchmark_threshold_missing',
    'five_layer_dependency_boundary_preserved',
  ])

  return {
    trustLevel: trustLevel(scheduleReadiness),
    scheduleReadiness,
    seedAuthority: 'schedule_rhythm_context',
    hardDependencyAuthority: false,
    plannedDateWritePolicy: 'never_direct_write',
    reasonCodes,
    coverage: {
      businessType: normalizeText(params.facts.businessType) || null,
      businessSubtype: normalizeText(params.facts.businessSubtype) || null,
      recommendationPacks: params.recommendationPacks,
      schedulePattern: params.scheduleProfile.dominantSchedulePattern,
      verifiedPatternCodes,
      rejectedPatternCodes,
      executionArchetypes: executionProfile.allArchetypes,
      scaleFactKeys: scaleKeys,
    },
    calibration,
    boundaryPolicy: boundaryPolicy(),
  }
}

export const BUILDING_PATTERN_SCHEDULE_TRUST_REQUIRED_BUSINESS_TYPE_CODES = [
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
