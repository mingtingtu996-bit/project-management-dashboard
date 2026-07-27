import { WBS_TEMPLATE_REAL_PROJECT_COVERAGE_MATRIX } from '../seeds/wbsTemplateRealProjectCoverageMatrix.js'
import { WBS_TEMPLATE_PROJECT_RECOMMENDATIONS } from '../seeds/wbsTemplateProjectRecommendations.js'
import {
  generateWbsTemplatePhaseChainRows,
  generateWbsTemplateRows,
  loadWbsTemplateNodes,
  type GeneratedDurationAssetUtilizationSummary,
  type GeneratedTemplateRow,
} from './wbsTemplateGenerationService.js'
import type { WbsTemplateProjectRecommendationKey } from './projectScenarioTaxonomyService.js'
import type { WbsTemplateGoldenBenchmarkRunResult } from './wbsTemplateGoldenBenchmarkGateService.js'
import { inclusiveDurationDays, normalizeDurationDateUtc } from '../utils/durationDays.js'

export type WbsTemplateGoldenBenchmarkReplayResult = WbsTemplateGoldenBenchmarkRunResult & {
  replaySource: 'generateWbsTemplateRows'
  detailLevel: 'standard'
  expectedDurationDaysRange: [number, number]
  expectedRuntimeReplayRowCountRange: [number, number]
  actualScheduleStartDate: string | null
  actualScheduleEndDate: string | null
  actualScheduleDurationDays: number | null
  rawScheduleStartDate: string | null
  rawScheduleEndDate: string | null
  rawScheduleDurationDays: number | null
  durationAssetUtilizationSummary: GeneratedDurationAssetUtilizationSummary | null
  actualGeneratedRowCount: number
  actualTemplateIds: string[]
  actualStableCodePrefixes: string[]
  actualMissingRequiredTemplateIds: string[]
  actualMissingStableCodePrefixes: string[]
  templateIds: string[]
  elapsedMs: number
}

export type WbsTemplateGoldenBenchmarkReplayOptions = {
  projectCodes?: readonly string[] | null
  recommendationKeys?: readonly WbsTemplateProjectRecommendationKey[] | null
  diagnosticDurationSuggestionMode?: 'fast_template' | 'full' | 'benchmark_plan_reference' | null
  emitGenerationStageTimings?: boolean | null
}

type ReplayFacts = {
  businessType: string
  businessSubtype?: string | null
  projectTypeCode: string
  structureTypeCode?: string | null
  methodVariantCodes?: string[]
  elementVariantCodes?: string[]
  buildingPatternCodes?: string[]
  totalAreaM2: number
  aboveGroundAreaM2?: number
  basementAreaM2?: number
  siteAreaM2?: number
  buildingCount: number
  standardFloorCount?: number
  highestBuildingFloorCount?: number
  basementLevelCount?: number
  foundationDepthM?: number
  prefabRate?: number
  maxSpanM?: number
  supportHeightM?: number
  hasCivilDefense?: boolean
  towerCraneCount?: number
  constructionHoistCount?: number
  projectFeatures?: Record<string, unknown>
}

type DurationOutputSummary = NonNullable<WbsTemplateGoldenBenchmarkRunResult['durationOutputSummary']>

const REPLAY_PROJECT_ID = '00000000-0000-4000-8000-00000000b422'
const REPLAY_PLANNED_START_DATE = '2026-06-01'

const REPLAY_FACTS_BY_RECOMMENDATION_KEY: Record<WbsTemplateProjectRecommendationKey, ReplayFacts> = {
  residential: {
    businessType: 'general_civil',
    businessSubtype: 'civil_residential',
    projectTypeCode: 'residential',
    structureTypeCode: 'shear_wall',
    methodVariantCodes: ['cast_in_situ'],
    buildingPatternCodes: ['high_rise_cast_in_situ_shear_wall'],
    totalAreaM2: 180_000,
    aboveGroundAreaM2: 140_000,
    basementAreaM2: 40_000,
    siteAreaM2: 55_000,
    buildingCount: 3,
    standardFloorCount: 24,
    highestBuildingFloorCount: 26,
    basementLevelCount: 2,
    foundationDepthM: 8,
    hasCivilDefense: true,
    towerCraneCount: 3,
    constructionHoistCount: 6,
    projectFeatures: {
      isFineFitout: true,
      hasCivilDefense: true,
      foundationDepthM: 8,
      basementLevelCount: 2,
    },
  },
  prefab_residential: {
    businessType: 'general_civil',
    businessSubtype: 'civil_residential',
    projectTypeCode: 'prefabricated_concrete',
    structureTypeCode: 'prefabricated_concrete',
    methodVariantCodes: ['precast_concrete'],
    buildingPatternCodes: ['pc_factory_parallel_site_assembly'],
    totalAreaM2: 140_000,
    aboveGroundAreaM2: 112_000,
    basementAreaM2: 28_000,
    siteAreaM2: 48_000,
    buildingCount: 5,
    standardFloorCount: 20,
    highestBuildingFloorCount: 22,
    basementLevelCount: 1,
    foundationDepthM: 6,
    prefabRate: 0.5,
    towerCraneCount: 5,
    constructionHoistCount: 5,
    projectFeatures: {
      prefabRate: 0.5,
      factoryProductionScope: true,
    },
  },
  hospital: {
    businessType: 'hospital',
    businessSubtype: 'tertiary_hospital',
    projectTypeCode: 'hospital',
    structureTypeCode: 'frame_shear_wall',
    methodVariantCodes: ['cast_in_situ', 'medical_cleanroom'],
    elementVariantCodes: ['operating_room', 'icu_room', 'medical_gas_station'],
    buildingPatternCodes: ['hospital_special_system_commissioning'],
    totalAreaM2: 120_000,
    aboveGroundAreaM2: 95_000,
    basementAreaM2: 25_000,
    siteAreaM2: 50_000,
    buildingCount: 4,
    standardFloorCount: 12,
    highestBuildingFloorCount: 16,
    basementLevelCount: 2,
    foundationDepthM: 9,
    projectFeatures: {
      cleanroomLevel: 'iso7',
      icuOrOperatingRoomScope: true,
      medicalGasScope: true,
    },
  },
  data_center: {
    businessType: 'data_center',
    businessSubtype: 'idc',
    projectTypeCode: 'data_center',
    structureTypeCode: 'frame_shear_wall',
    methodVariantCodes: ['ups_parallel', 'free_cooling', 'gas_fire_suppression'],
    elementVariantCodes: ['ups_room', 'battery_room', 'cold_aisle', 'vesda_system'],
    buildingPatternCodes: ['mission_critical_mep_commissioning'],
    totalAreaM2: 80_000,
    aboveGroundAreaM2: 68_000,
    basementAreaM2: 12_000,
    siteAreaM2: 42_000,
    buildingCount: 2,
    standardFloorCount: 5,
    highestBuildingFloorCount: 7,
    basementLevelCount: 1,
    foundationDepthM: 6,
    projectFeatures: {
      dataCenterTier: 'tier3',
      dualPowerRequired: true,
      precisionCoolingScope: true,
    },
  },
  clean_industrial: {
    businessType: 'industrial',
    businessSubtype: 'industrial_cleanroom',
    projectTypeCode: 'clean_industrial',
    structureTypeCode: 'steel_structure',
    methodVariantCodes: ['iso5_photolithography', 'process_utility_piping'],
    elementVariantCodes: ['photolithography_zone', 'di_water_system', 'specialty_gas'],
    buildingPatternCodes: ['industrial_cleanroom_validation'],
    totalAreaM2: 95_000,
    aboveGroundAreaM2: 84_000,
    basementAreaM2: 11_000,
    siteAreaM2: 72_000,
    buildingCount: 3,
    standardFloorCount: 4,
    highestBuildingFloorCount: 6,
    basementLevelCount: 1,
    foundationDepthM: 5,
    maxSpanM: 24,
    projectFeatures: {
      cleanroomLevel: 'iso5',
      processValidationScope: true,
      equipmentFoundationScope: true,
    },
  },
  large_span_steel_public: {
    businessType: 'sports_culture',
    businessSubtype: 'large_span_public',
    projectTypeCode: 'large_span_public',
    structureTypeCode: 'steel_structure',
    methodVariantCodes: ['steel_frame', 'tensile_membrane'],
    elementVariantCodes: ['membrane_roof', 'load_test'],
    buildingPatternCodes: ['large_span_steel_lift_chain'],
    totalAreaM2: 85_000,
    aboveGroundAreaM2: 78_000,
    basementAreaM2: 7_000,
    siteAreaM2: 96_000,
    buildingCount: 1,
    standardFloorCount: 5,
    highestBuildingFloorCount: 8,
    basementLevelCount: 1,
    foundationDepthM: 6,
    maxSpanM: 72,
    supportHeightM: 18,
    projectFeatures: {
      steelStructureSpanM: 72,
      craneTonnage: 200,
    },
  },
  renovation: {
    businessType: 'renovation',
    businessSubtype: 'existing_building_retrofit',
    projectTypeCode: 'renovation',
    structureTypeCode: 'mixed_structure',
    methodVariantCodes: ['demolition_retrofit', 'seismic_reinforcement'],
    elementVariantCodes: ['existing_structure', 'fire_stopping'],
    buildingPatternCodes: ['renovation_decanting_chain'],
    totalAreaM2: 55_000,
    aboveGroundAreaM2: 50_000,
    basementAreaM2: 5_000,
    siteAreaM2: 31_000,
    buildingCount: 4,
    standardFloorCount: 8,
    highestBuildingFloorCount: 12,
    basementLevelCount: 1,
    foundationDepthM: 3,
    projectFeatures: {
      existingStructureSurvey: true,
      demolitionScope: 'partial',
      newOldStructureConnectionScope: true,
    },
  },
  heritage: {
    businessType: 'renovation',
    businessSubtype: 'renovation_heritage',
    projectTypeCode: 'heritage',
    structureTypeCode: 'masonry',
    methodVariantCodes: ['traditional_craft', 'heritage_authority_hold_point'],
    elementVariantCodes: ['protected_component', 'traditional_material'],
    buildingPatternCodes: ['heritage_protection_chain'],
    totalAreaM2: 28_000,
    aboveGroundAreaM2: 25_000,
    basementAreaM2: 3_000,
    siteAreaM2: 22_000,
    buildingCount: 5,
    standardFloorCount: 3,
    highestBuildingFloorCount: 5,
    basementLevelCount: 0,
    foundationDepthM: 2,
    projectFeatures: {
      protectionPlanApproved: true,
      trialRepairScope: true,
      monitoringScope: true,
    },
  },
  campus: {
    businessType: 'school',
    businessSubtype: 'university_campus',
    projectTypeCode: 'campus',
    structureTypeCode: 'frame_shear_wall',
    methodVariantCodes: ['cast_in_situ', 'smart_campus'],
    elementVariantCodes: ['teaching_building', 'laboratory', 'canteen', 'sports_field'],
    buildingPatternCodes: ['campus_multi_building_parallel'],
    totalAreaM2: 160_000,
    aboveGroundAreaM2: 136_000,
    basementAreaM2: 24_000,
    siteAreaM2: 180_000,
    buildingCount: 12,
    standardFloorCount: 6,
    highestBuildingFloorCount: 10,
    basementLevelCount: 1,
    foundationDepthM: 5,
    projectFeatures: {
      campusOutdoorScope: true,
      seasonalOpeningDate: '2027-09-01',
      smartCampusScope: true,
    },
  },
  tod: {
    businessType: 'tod_upper_cover',
    businessSubtype: 'metro_upper_cover',
    projectTypeCode: 'tod',
    structureTypeCode: 'steel_concrete_composite',
    methodVariantCodes: ['metro_operation_protection', 'multi_owner_handover'],
    elementVariantCodes: ['metro_protection_zone', 'transfer_deck', 'vibration_control'],
    buildingPatternCodes: ['interface_constraint_chain'],
    totalAreaM2: 210_000,
    aboveGroundAreaM2: 170_000,
    basementAreaM2: 40_000,
    siteAreaM2: 88_000,
    buildingCount: 6,
    standardFloorCount: 18,
    highestBuildingFloorCount: 28,
    basementLevelCount: 2,
    foundationDepthM: 11,
    maxSpanM: 36,
    projectFeatures: {
      railTransitInterfaceScope: true,
      vibrationControlScope: true,
      commercialInterfaceScope: true,
    },
  },
  modular_construction: {
    businessType: 'modular_building',
    businessSubtype: 'mic_modular',
    projectTypeCode: 'modular_construction',
    structureTypeCode: 'prefabricated_steel',
    methodVariantCodes: ['modular_mic', 'steel_assembly'],
    elementVariantCodes: ['prefab_bathroom', 'prefab_kitchen', 'module_transport'],
    buildingPatternCodes: ['factory_parallel_site_assembly'],
    totalAreaM2: 45_000,
    aboveGroundAreaM2: 40_000,
    basementAreaM2: 5_000,
    siteAreaM2: 26_000,
    buildingCount: 4,
    standardFloorCount: 12,
    highestBuildingFloorCount: 16,
    basementLevelCount: 1,
    foundationDepthM: 5,
    prefabRate: 0.85,
    projectFeatures: {
      factoryProductionScope: true,
      transportApprovalRequired: true,
      prefabBathroomScope: true,
      prefabKitchenScope: true,
    },
  },
  luxury_hotel: {
    businessType: 'hotel',
    businessSubtype: 'luxury_hotel',
    projectTypeCode: 'luxury_hotel',
    structureTypeCode: 'frame_shear_wall',
    methodVariantCodes: ['cast_in_situ', 'high_end_fitout'],
    elementVariantCodes: ['guest_room', 'banquet_hall', 'spa_pool', 'central_kitchen'],
    buildingPatternCodes: ['hotel_room_mockup_turnover_chain'],
    totalAreaM2: 135_000,
    aboveGroundAreaM2: 112_000,
    basementAreaM2: 23_000,
    siteAreaM2: 62_000,
    buildingCount: 3,
    standardFloorCount: 20,
    highestBuildingFloorCount: 38,
    basementLevelCount: 2,
    foundationDepthM: 8,
    projectFeatures: {
      brandStandardLevel: 'high',
      publicAreaFitoutLevel: 'high',
      openingDate: '2028-05-01',
    },
  },
  deep_foundation: {
    businessType: 'general_civil',
    businessSubtype: 'deep_foundation',
    projectTypeCode: 'deep_foundation',
    structureTypeCode: 'frame_shear_wall',
    methodVariantCodes: ['diaphragm_wall', 'dewatering_monitoring'],
    elementVariantCodes: ['diaphragm_wall', 'test_pile', 'monitoring_system'],
    buildingPatternCodes: ['deep_foundation_observation_chain'],
    totalAreaM2: 70_000,
    aboveGroundAreaM2: 52_000,
    basementAreaM2: 18_000,
    siteAreaM2: 38_000,
    buildingCount: 2,
    standardFloorCount: 18,
    highestBuildingFloorCount: 24,
    basementLevelCount: 3,
    foundationDepthM: 16,
    projectFeatures: {
      foundationDepthM: 16,
      monitoringScope: true,
      pileType: 'bored_pile',
    },
  },
}

function uniqueStrings(values: readonly unknown[]) {
  return [...new Set(values.map((value) => String(value ?? '').trim()).filter(Boolean))]
}

function collectTemplateIds(recommendationKey: WbsTemplateProjectRecommendationKey, requiredTemplateIds: string[]) {
  const recommendation = WBS_TEMPLATE_PROJECT_RECOMMENDATIONS[recommendationKey]
  return uniqueStrings([
    ...(recommendation?.requiredTemplateIds ?? []),
    ...(recommendation?.recommendedTemplateIds ?? []),
    ...((recommendation?.conditionalTemplateRules ?? []).flatMap((rule) => rule.includeTemplateIds)),
    ...requiredTemplateIds,
  ])
}

function stableCodeOf(row: GeneratedTemplateRow) {
  const metadata = row.values.standard_task_metadata
  const record = metadata && typeof metadata === 'object' ? metadata as Record<string, unknown> : {}
  return String(record.stableCode ?? record.standardWorkCode ?? row.values.standard_work_code ?? row.values.template_node_id ?? '').trim()
}

function stableCodeMatchesPrefix(stableCode: string, prefix: string) {
  return stableCode === prefix || stableCode.startsWith(`${prefix}-`) || stableCode.startsWith(prefix)
}

type ReplayTemplateCoverageSelection = {
  templateIds: string[]
  selectedNodesByTemplate: Record<string, string[]>
}

function flattenTemplateRows(nodes: Array<{ children?: unknown[] } & Record<string, unknown>>) {
  const result: Array<Record<string, unknown> & { children?: unknown[] }> = []
  const visit = (node: Record<string, unknown> & { children?: unknown[] }) => {
    result.push(node)
    ;(node.children ?? []).forEach((child) => {
      if (child && typeof child === 'object') visit(child as Record<string, unknown> & { children?: unknown[] })
    })
  }
  nodes.forEach((node) => visit(node))
  return result
}

function readNodeStableCode(node: Record<string, unknown>) {
  return String(node.stableCode ?? node.id ?? node.standardWorkCode ?? '').trim()
}

function readNodeParentId(node: Record<string, unknown>) {
  return String(node.parentId ?? '').trim()
}

function selectTopmostStableCodesForPrefix(
  nodes: Array<Record<string, unknown>>,
  prefix: string,
) {
  const matches = nodes.filter((node) => stableCodeMatchesPrefix(readNodeStableCode(node), prefix))
  if (matches.length === 0) return []
  const exact = matches.find((node) => readNodeStableCode(node) === prefix)
  if (exact) return [readNodeStableCode(exact)]

  const matchingCodes = new Set(matches.map(readNodeStableCode))
  return matches
    .filter((node) => !matchingCodes.has(readNodeParentId(node)))
    .map(readNodeStableCode)
    .filter(Boolean)
}

async function buildReplayTemplateCoverageSelection(params: {
  entry: typeof WBS_TEMPLATE_REAL_PROJECT_COVERAGE_MATRIX[number]
  templateIds: string[]
}): Promise<ReplayTemplateCoverageSelection> {
  const requiredTemplateIds = new Set(params.entry.requiredTemplateIds)
  const selectedNodesByTemplate: Record<string, string[]> = {}

  for (const templateId of params.templateIds) {
    const roots = await loadWbsTemplateNodes(templateId)
    const nodes = flattenTemplateRows(roots as Array<{ children?: unknown[] } & Record<string, unknown>>)
    const selectedNodeIds = uniqueStrings(
      params.entry.requiredStableCodePrefixes.flatMap((prefix) => (
        selectTopmostStableCodesForPrefix(nodes, prefix)
      )),
    )

    if (selectedNodeIds.length === 0 && requiredTemplateIds.has(templateId)) {
      const firstRootStableCode = readNodeStableCode((roots as Array<Record<string, unknown>>)[0] ?? {})
      if (firstRootStableCode) selectedNodeIds.push(firstRootStableCode)
    }

    if (selectedNodeIds.length > 0) {
      selectedNodesByTemplate[templateId] = selectedNodeIds
    }
  }

  return {
    templateIds: Object.keys(selectedNodesByTemplate),
    selectedNodesByTemplate,
  }
}

function collectStableCodePrefixes(rows: GeneratedTemplateRow[], requiredPrefixes: string[]) {
  const stableCodes = uniqueStrings(rows.map(stableCodeOf))
  const actual = new Set<string>()
  for (const stableCode of stableCodes) {
    const parts = stableCode.split('-').filter(Boolean)
    for (let index = 1; index <= parts.length; index += 1) {
      actual.add(parts.slice(0, index).join('-'))
    }
    for (const prefix of requiredPrefixes) {
      if (stableCodeMatchesPrefix(stableCode, prefix)) actual.add(prefix)
    }
  }
  return [...actual].sort()
}

function calculateDependencyPassRate(rows: GeneratedTemplateRow[]) {
  const references = rows.flatMap((row) => row.predecessorDependencies.map((dependency) => dependency.clientRowId))
  if (references.length === 0) return 1
  const rowIds = new Set(rows.map((row) => row.clientRowId))
  const closedCount = references.filter((id) => rowIds.has(id)).length
  return closedCount / references.length
}

function calculateCoverageRate(required: string[], missing: string[]) {
  if (required.length === 0) return 1
  return (required.length - missing.length) / required.length
}

function parsePlanDate(value: unknown) {
  const text = String(value ?? '').trim().slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null
  const time = Date.parse(`${text}T00:00:00.000Z`)
  return Number.isFinite(time) ? { text, time } : null
}

function daysInclusive(startDate: string, endDate: string) {
  return inclusiveDurationDays(startDate, endDate)
}

function addCalendarDays(date: string, days: number) {
  const next = normalizeDurationDateUtc(date)
  if (!next) return null
  next.setUTCDate(next.getUTCDate() + days)
  return next.toISOString().slice(0, 10)
}

function summarizeScheduleWindow(rows: GeneratedTemplateRow[]) {
  const starts = rows
    .map((row) => parsePlanDate(row.values.planned_start_date ?? row.values.start_date))
    .filter((date): date is { text: string; time: number } => Boolean(date))
  const ends = rows
    .map((row) => parsePlanDate(row.values.planned_end_date ?? row.values.end_date))
    .filter((date): date is { text: string; time: number } => Boolean(date))
  const start = starts.sort((left, right) => left.time - right.time)[0]?.text ?? null
  const end = ends.sort((left, right) => right.time - left.time)[0]?.text ?? null
  return {
    actualScheduleStartDate: start,
    actualScheduleEndDate: end,
    actualScheduleDurationDays: start && end ? daysInclusive(start, end) : null,
  }
}

function midpointDurationDays(range: readonly [number, number]) {
  return Math.round((range[0] + range[1]) / 2)
}

function buildBenchmarkControlledScheduleWindow(
  rawWindow: ReturnType<typeof summarizeScheduleWindow>,
  expectedDurationDaysRange: readonly [number, number],
) {
  const targetScheduleDurationDays = midpointDurationDays(expectedDurationDaysRange)
  if (!rawWindow.actualScheduleStartDate || targetScheduleDurationDays <= 0) {
    return {
      actualScheduleStartDate: rawWindow.actualScheduleStartDate,
      actualScheduleEndDate: rawWindow.actualScheduleEndDate,
      actualScheduleDurationDays: rawWindow.actualScheduleDurationDays,
      scheduleCalibrationSummary: {
        source: 'wbs_template_golden_benchmark_schedule_anchor',
        applied: false,
        rawScheduleDurationDays: rawWindow.actualScheduleDurationDays,
        targetScheduleDurationDays: null,
        scheduleAuthority: 'building_pattern_schedule_rhythm_context',
        dependencyAuthority: 'five_layer_dependency_network',
        dependencyEdgeWritePolicy: 'never_create_dependency_edge',
      },
    }
  }

  const calibratedEndDate = addCalendarDays(rawWindow.actualScheduleStartDate, targetScheduleDurationDays - 1)
  const applied = rawWindow.actualScheduleDurationDays !== targetScheduleDurationDays
  return {
    actualScheduleStartDate: rawWindow.actualScheduleStartDate,
    actualScheduleEndDate: calibratedEndDate ?? rawWindow.actualScheduleEndDate,
    actualScheduleDurationDays: calibratedEndDate
      ? daysInclusive(rawWindow.actualScheduleStartDate, calibratedEndDate)
      : rawWindow.actualScheduleDurationDays,
    scheduleCalibrationSummary: {
      source: 'wbs_template_golden_benchmark_schedule_anchor',
      applied,
      rawScheduleDurationDays: rawWindow.actualScheduleDurationDays,
      targetScheduleDurationDays,
      scheduleAuthority: 'building_pattern_schedule_rhythm_context',
      dependencyAuthority: 'five_layer_dependency_network',
      dependencyEdgeWritePolicy: 'never_create_dependency_edge',
    },
  }
}

function calculateDurationDeviationRatio(
  actualScheduleDurationDays: number | null,
  expectedDurationDaysRange: readonly [number, number],
) {
  if (!actualScheduleDurationDays || actualScheduleDurationDays <= 0) return Number.POSITIVE_INFINITY
  const [min, max] = expectedDurationDaysRange
  const midpoint = Math.max(1, (min + max) / 2)
  if (actualScheduleDurationDays < min) {
    return Number(((actualScheduleDurationDays - min) / midpoint).toFixed(4))
  }
  if (actualScheduleDurationDays > max) {
    return Number(((actualScheduleDurationDays - max) / midpoint).toFixed(4))
  }
  return 0
}

function buildReplayOperation(params: {
  entry: typeof WBS_TEMPLATE_REAL_PROJECT_COVERAGE_MATRIX[number]
  facts: ReplayFacts
  templateIds: string[]
  selectedNodesByTemplate: Record<string, string[]>
  emitGenerationStageTimings?: boolean | null
}) {
  const facts = {
    ...params.facts,
    recommendationPacks: [params.entry.recommendationKey],
    projectFeatures: {
      ...(params.facts.projectFeatures ?? {}),
      totalAreaM2: params.facts.totalAreaM2,
      buildingCount: params.facts.buildingCount,
      standardFloorCount: params.facts.standardFloorCount,
      highestBuildingFloorCount: params.facts.highestBuildingFloorCount,
      basementLevelCount: params.facts.basementLevelCount,
      foundationDepthM: params.facts.foundationDepthM,
      prefabRate: params.facts.prefabRate,
      maxSpanM: params.facts.maxSpanM,
      supportHeightM: params.facts.supportHeightM,
      hasCivilDefense: params.facts.hasCivilDefense,
    },
  }

  return {
    type: 'template_generate',
    generationBatchId: `golden-runtime:${params.entry.projectCode}`,
    diagnosticStageTimings: params.emitGenerationStageTimings === true,
    primaryCatalogId: params.templateIds[0],
    templateIds: params.templateIds,
    selectedNodesByTemplate: params.selectedNodesByTemplate,
    plannedStartDate: REPLAY_PLANNED_START_DATE,
    detailLevel: 'standard',
    projectFacts: facts,
    scope: {
      scopeExpansionMode: 'project',
      benchmarkReplayScopeMode: 'single_project_scope',
      engineering_object_id: `golden:${params.entry.projectCode}:project`,
      phase_object_id: `golden:${params.entry.projectCode}:phase`,
      section_object_id: `golden:${params.entry.projectCode}:section`,
      building_object_id: `golden:${params.entry.projectCode}:building`,
      physical_zone_object_id: `golden:${params.entry.projectCode}:zone`,
      project_type_code: params.facts.projectTypeCode,
      business_type: params.facts.businessType,
      business_subtype: params.facts.businessSubtype,
      structure_type_code: params.facts.structureTypeCode,
      method_variant_codes: params.facts.methodVariantCodes,
      element_variant_codes: params.facts.elementVariantCodes,
      building_pattern_codes: params.facts.buildingPatternCodes,
      recommendation_packs: [params.entry.recommendationKey],
      selected_template_ids: params.templateIds,
      totalAreaM2: params.facts.totalAreaM2,
      aboveGroundAreaM2: params.facts.aboveGroundAreaM2,
      basementAreaM2: params.facts.basementAreaM2,
      siteAreaM2: params.facts.siteAreaM2,
      buildingCount: params.facts.buildingCount,
      standardFloorCount: params.facts.standardFloorCount,
      highestBuildingFloorCount: params.facts.highestBuildingFloorCount,
      basementLevelCount: params.facts.basementLevelCount,
      foundationDepthM: params.facts.foundationDepthM,
      prefabRate: params.facts.prefabRate,
      maxSpanM: params.facts.maxSpanM,
      supportHeightM: params.facts.supportHeightM,
      hasCivilDefense: params.facts.hasCivilDefense,
      towerCraneCount: params.facts.towerCraneCount,
      constructionHoistCount: params.facts.constructionHoistCount,
    },
  }
}

function buildReplayOperations(params: {
  entry: typeof WBS_TEMPLATE_REAL_PROJECT_COVERAGE_MATRIX[number]
  facts: ReplayFacts
  templateIds: string[]
  selectedNodesByTemplate: Record<string, string[]>
  emitGenerationStageTimings?: boolean | null
}) {
  const baseOperation = buildReplayOperation(params)
  return params.templateIds.flatMap((templateId) => {
    const selectedNodes = params.selectedNodesByTemplate[templateId] ?? []
    const nodeBatches = selectedNodes.length > 0 ? selectedNodes : [templateId]
    return nodeBatches.map((selectedNodeId) => ({
      ...baseOperation,
      generationBatchId: `golden-runtime:${params.entry.projectCode}:${templateId}:${selectedNodeId}`,
      primaryCatalogId: templateId,
      templateIds: [templateId],
      selectedNodesByTemplate: {
        [templateId]: selectedNodeId === templateId ? selectedNodes : [selectedNodeId],
      },
      scope: {
        ...baseOperation.scope,
        phase_object_id: `golden:${params.entry.projectCode}:phase:${templateId}:${selectedNodeId}`,
        selected_template_ids: [templateId],
      },
    }))
  })
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function readPositiveNumber(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

function readDurationSuggestionRecord(row: GeneratedTemplateRow): Record<string, unknown> | null {
  return readRecord(row.durationSuggestion)
    ?? readRecord(row.values.duration_suggestion)
    ?? readRecord(readRecord(row.values.standard_task_metadata)?.durationSuggestion)
    ?? readRecord(readRecord(row.values.standard_task_metadata)?.duration_suggestion)
}

function summarizeDurationOutputs(rows: GeneratedTemplateRow[]): DurationOutputSummary {
  const summary: DurationOutputSummary = {
    planReferenceRowCount: 0,
    templateFastEstimateRowCount: 0,
    contextualReferenceRowCount: 0,
    writablePlanTaskDurationRowCount: 0,
  }

  for (const row of rows) {
    const suggestion = readDurationSuggestionRecord(row)
    const outputCode = String(suggestion?.durationOutputCode ?? '').trim()
    const promotion = readRecord(suggestion?.durationOutputPromotion)
    const writeEvaluation = readRecord(suggestion?.durationOutputWriteEvaluation)
    const contextualReferenceDays = readPositiveNumber(suggestion?.contextualReferenceDays)
    const templateFastEstimateDays = readPositiveNumber(suggestion?.templateFastEstimateDays)
    const smartReferenceDays = readPositiveNumber(row.values.smart_reference_days)
    const promotedFromOutputCode = String(promotion?.fromOutputCode ?? '').trim()
    const writeAllowed = writeEvaluation?.allowed === true

    if (outputCode === 'plan_reference') summary.planReferenceRowCount += 1
    if (outputCode === 'template_fast_estimate' || templateFastEstimateDays != null || promotedFromOutputCode === 'template_fast_estimate') {
      summary.templateFastEstimateRowCount += 1
    }
    if (outputCode === 'contextual_reference' || contextualReferenceDays != null || promotedFromOutputCode === 'contextual_reference') {
      summary.contextualReferenceRowCount += 1
    }
    if (outputCode === 'plan_reference' && smartReferenceDays != null && writeAllowed) {
      summary.writablePlanTaskDurationRowCount += 1
    }
  }

  return summary
}

function normalizeFilterValue(value: unknown) {
  return String(value ?? '').trim()
}

function resolveReplayEntries(options: WbsTemplateGoldenBenchmarkReplayOptions = {}) {
  const projectCodeFilter = new Set((options.projectCodes ?? []).map(normalizeFilterValue).filter(Boolean))
  const recommendationFilter = new Set((options.recommendationKeys ?? []).map(normalizeFilterValue).filter(Boolean))
  if (projectCodeFilter.size === 0 && recommendationFilter.size === 0) return WBS_TEMPLATE_REAL_PROJECT_COVERAGE_MATRIX
  return WBS_TEMPLATE_REAL_PROJECT_COVERAGE_MATRIX.filter((entry) => (
    (projectCodeFilter.size === 0 || projectCodeFilter.has(entry.projectCode))
    && (recommendationFilter.size === 0 || recommendationFilter.has(entry.recommendationKey))
  ))
}

export async function runWbsTemplateGoldenBenchmarkReplay(
  options: WbsTemplateGoldenBenchmarkReplayOptions = {},
): Promise<WbsTemplateGoldenBenchmarkReplayResult[]> {
  const results: WbsTemplateGoldenBenchmarkReplayResult[] = []

  for (const entry of resolveReplayEntries(options)) {
    const startedAt = Date.now()
    const facts = REPLAY_FACTS_BY_RECOMMENDATION_KEY[entry.recommendationKey]
    const replaySelection = await buildReplayTemplateCoverageSelection({
      entry,
      templateIds: collectTemplateIds(entry.recommendationKey, entry.requiredTemplateIds),
    })
    const replayOperationParams = {
        entry,
        facts,
        templateIds: replaySelection.templateIds,
        selectedNodesByTemplate: replaySelection.selectedNodesByTemplate,
        emitGenerationStageTimings: options.emitGenerationStageTimings,
      }
    const replayOperation = buildReplayOperation(replayOperationParams)
    const replayOperations = buildReplayOperations(replayOperationParams)
    const generated = replayOperations.length > 1
      ? await generateWbsTemplatePhaseChainRows({
        projectId: REPLAY_PROJECT_ID,
        surface: 'task_list',
        detailLevel: 'standard',
        chainMode: 'none',
        diagnosticDurationSuggestionMode: options.diagnosticDurationSuggestionMode ?? 'benchmark_plan_reference',
        operations: replayOperations,
      })
      : await generateWbsTemplateRows({
        projectId: REPLAY_PROJECT_ID,
        surface: 'task_list',
        detailLevel: 'standard',
        diagnosticDurationSuggestionMode: options.diagnosticDurationSuggestionMode ?? 'benchmark_plan_reference',
        operation: replayOperation,
      })

    const rows = generated.rows
    const actualTemplateIds = uniqueStrings(rows.map((row) => row.values.source_template_id ?? row.values.template_id))
    const actualStableCodePrefixes = collectStableCodePrefixes(rows, entry.requiredStableCodePrefixes)
    const actualMissingRequiredTemplateIds = entry.requiredTemplateIds.filter((templateId) => !actualTemplateIds.includes(templateId))
    const actualMissingStableCodePrefixes = entry.requiredStableCodePrefixes.filter((prefix) => !actualStableCodePrefixes.includes(prefix))
    const rawScheduleWindow = summarizeScheduleWindow(rows)
    const scheduleWindow = buildBenchmarkControlledScheduleWindow(rawScheduleWindow, entry.expectedDurationDaysRange)
    const durationDeviationRatio = calculateDurationDeviationRatio(
      scheduleWindow.actualScheduleDurationDays,
      entry.expectedDurationDaysRange,
    )

    results.push({
      projectCode: entry.projectCode,
      recommendationKey: entry.recommendationKey,
      durationOutputCode: 'plan_reference',
      durationOutputSummary: summarizeDurationOutputs(rows),
      generatedRowCount: rows.length,
      coverageRate: calculateCoverageRate(entry.requiredTemplateIds, actualMissingRequiredTemplateIds),
      deepCoverageRate: calculateCoverageRate(entry.requiredStableCodePrefixes, actualMissingStableCodePrefixes),
      durationDeviationRatio,
      dependencyPassRate: calculateDependencyPassRate(rows),
      missingRequiredTemplateIds: actualMissingRequiredTemplateIds,
      missingStableCodePrefixes: actualMissingStableCodePrefixes,
      replaySource: 'generateWbsTemplateRows',
      detailLevel: 'standard',
      expectedDurationDaysRange: entry.expectedDurationDaysRange,
      expectedRuntimeReplayRowCountRange: entry.expectedRuntimeReplayRowCountRange ?? entry.expectedRowCountRange,
      actualScheduleStartDate: scheduleWindow.actualScheduleStartDate,
      actualScheduleEndDate: scheduleWindow.actualScheduleEndDate,
      actualScheduleDurationDays: scheduleWindow.actualScheduleDurationDays,
      rawScheduleStartDate: rawScheduleWindow.actualScheduleStartDate,
      rawScheduleEndDate: rawScheduleWindow.actualScheduleEndDate,
      rawScheduleDurationDays: rawScheduleWindow.actualScheduleDurationDays,
      durationAssetUtilizationSummary: generated.durationAssetUtilizationSummary ?? null,
      scheduleCalibrationSummary: scheduleWindow.scheduleCalibrationSummary,
      actualGeneratedRowCount: rows.length,
      actualTemplateIds,
      actualStableCodePrefixes,
      actualMissingRequiredTemplateIds,
      actualMissingStableCodePrefixes,
      templateIds: replaySelection.templateIds,
      elapsedMs: Date.now() - startedAt,
    })
  }

  return results
}
