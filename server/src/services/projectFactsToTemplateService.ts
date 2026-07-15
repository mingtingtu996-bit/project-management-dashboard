// v1.4.22.1 §10: Maps project facts (business type, features, methods, scope tree, detail level)
// to a template recommendation with item pack list and expected row counts.

import type { BusinessTypeCode, BusinessSubtypeCode, MethodVariantCode } from './projectTypeRecommendations.js'
import { getBusinessTypeRecommendation } from './projectTypeRecommendations.js'
import { mapT2RhythmBusinessTypeCodeToFormalBusinessTypes } from './businessTypeRegistryService.js'
import { getFeatureEntry } from './projectFeatureToItemPackMap.js'
import { getScopeAssignmentRules } from './scopeAssignmentRulesService.js'
import type { ScopeAssignmentRule } from './scopeAssignmentRulesService.js'
import {
  resolveProjectScenarioProfile,
  type ProjectScenarioProfile,
} from './projectScenarioTaxonomyService.js'
import { WBS_TEMPLATE_PROJECT_RECOMMENDATIONS } from '../seeds/wbsTemplateProjectRecommendations.js'
import type { BuildingPatternScheduleRuntimeBenchmarkResult } from './buildingPatternScheduleCalibrationService.js'
import {
  loadBuildingPatternScheduleRuntimeBenchmarkResults,
} from './buildingPatternScheduleBenchmarkEvidenceService.js'
import {
  resolveProjectConstructionOrganizationPolicy,
} from '../seeds/projectConstructionOrganizationPolicySeed.js'
import { resolveDefaultMasterPlanRowCountRange } from './defaultMasterPlanRowVolumePolicy.js'

export type DetailLevel = 'overview' | 'standard' | 'detailed'
export type PlanScopeCaliber =
  | 'full_project_master'
  | 'general_contract'
  | 'civil_structure_package'
  | 'specialty_package'
  | 'continuation_start_line'
export type DeliveryStandard =
  | 'rough'
  | 'mep_ready'
  | 'public_area_fitout'
  | 'full_fitout'
  | 'hotel_opening'
  | 'production_ready'
export type TerminalEvent =
  | 'contract_completion'
  | 'completion_acceptance'
  | 'owner_handover'
  | 'trial_opening'
  | 'production_validation'
export type DefaultPlanOutputLayer = 'master_plan'
export type MasterPlanDetailLevel = 'planning_skeleton'
export type MasterPlanGenerationDepth = 'managed_frontier'
export type FoundationMethodCandidateCategory =
  | 'shallow_foundation'
  | 'pile_foundation'
  | 'pit_support'
  | 'dewatering_monitoring'

export interface MasterPlanProfile {
  layer: DefaultPlanOutputLayer
  detailLevel: MasterPlanDetailLevel
  generationDepth: MasterPlanGenerationDepth
  rowCountRange: [number, number]
  rowProjectionMode: 'schedule_row'
  supportLayerPolicy: {
    gateMarkers: 'supporting_evidence_not_default_gantt_rows'
    inlineControls: 'embedded_under_schedule_rows'
    linkedProjections: 'review_reference_not_default_gantt_rows'
  }
  mutationBoundary: {
    writesProductionDependencies: false
    writesProductionDates: false
    writesCriticalPathFacts: false
  }
}

export interface FoundationMethodCandidate {
  code: string
  label: string
  category: FoundationMethodCandidateCategory
  selected: boolean
}

export type TriggeredItemPackSource =
  | 'template_catalog'
  | 'business_default'
  | 'project_feature'
  | 'method'
  | 'prefab_system'
  | 'external_interface'
  | 'hard_constraint'
  | 'delivery_standard'
  | 'terminal_event'
  | 'physical_scope'
  | 'floor_usage'
  | 'explicit_user_selection'

const SPECIAL_FLOOR_USAGE_RULES: Record<string, {
  templates?: string[]
  itemPacks?: string[]
  milestones?: string[]
  dangerItems?: string[]
  suppressionRules?: string[]
  rationale: string
}> = {
  ground_pilotis: {
    templates: ['china-building-fine-detail'],
    suppressionRules: ['ground_pilotis_masonry_scope'],
    rationale: 'Special floor usage: ground_pilotis. Treat as open/transferable ground-level workface and avoid ordinary masonry scope assumptions.',
  },
  refuge: {
    templates: ['china-cecs-fire-system', 'china-hvac-system', 'china-electrical-system', 'china-ultra-high-rise-specialty'],
    itemPacks: ['UHR-03-01-02', 'UHR-04-01-09'],
    milestones: ['refuge_floor_fire_life_safety_acceptance'],
    rationale: 'Special floor usage: refuge. Add fire, smoke-control, emergency power and life-safety handoff branches.',
  },
  mechanical: {
    templates: ['china-hvac-system', 'china-electrical-system', 'china-plumbing-heating-system'],
    milestones: ['mechanical_floor_system_handover'],
    rationale: 'Special floor usage: mechanical. Add dense MEP equipment, riser and commissioning handoff branches.',
  },
  transfer: {
    templates: ['china-building-fine-detail', 'china-dangerous-subproject-control'],
    itemPacks: ['BDT-07-01-03'],
    milestones: ['transfer_floor_structural_acceptance'],
    dangerItems: ['DANGER-01-01-02', 'DANGER-02-01-04'],
    rationale: 'Special floor usage: transfer. Add transfer-structure, mass concrete and high-formwork control branches.',
  },
  roof: {
    templates: ['china-waterproof-insulation', 'china-electrical-system'],
    milestones: ['roof_waterproof_lightning_acceptance'],
    rationale: 'Special floor usage: roof. Add roof waterproofing, insulation, drainage and lightning-protection handoff branches.',
  },
  mezzanine: {
    templates: ['china-building-fine-detail'],
    milestones: ['mezzanine_structure_handover'],
    rationale: 'Special floor usage: mezzanine. Add split-level structure and fit-out interface checks.',
  },
  podium_roof: {
    templates: ['china-waterproof-insulation', 'china-building-fine-detail'],
    milestones: ['podium_roof_interface_handover'],
    rationale: 'Special floor usage: podium_roof. Add podium roof waterproofing, drainage and tower/podium interface handoff.',
  },
  canopy: {
    templates: ['china-building-fine-detail', 'china-steel-structure-specialty'],
    milestones: ['canopy_corridor_handover'],
    rationale: 'Special floor usage: canopy. Add canopy/corridor steel or envelope interface work and handoff.',
  },
}

const INDEPENDENT_ENGINEERING_ZONE_RULES: Record<string, {
  templates: string[]
  itemPacks: string[]
  rationale: string
}> = {
  switching_station: {
    templates: ['china-electrical-system'],
    itemPacks: ['ELE-05-01-01'],
    rationale: 'Independent engineering zone: switching_station. Add electrical power-distribution pack so switch station work can be scheduled against its own physical zone.',
  },
  fire_pump_room: {
    templates: ['china-plumbing-heating-system', 'china-cecs-fire-system'],
    itemPacks: ['PLU-02-01-02', 'FIR-05-01-02'],
    rationale: 'Independent engineering zone: fire_pump_room. Add pump-room and fire-linkage packs so fire pump room work can be scheduled against its own physical zone.',
  },
  heat_exchange_station: {
    templates: ['china-hvac-system'],
    itemPacks: ['HVA-03-01-02'],
    rationale: 'Independent engineering zone: heat_exchange_station. Add equipment-room MEP pack so heat exchange station work can be scheduled against its own physical zone.',
  },
  waste_room: {
    templates: ['china-plumbing-heating-system'],
    itemPacks: ['PLU-05-01-01'],
    rationale: 'Independent engineering zone: waste_room. Add sanitation and waste-room drainage/deodorization pack so waste-room work can be scheduled against its own physical zone.',
  },
  playground: {
    templates: ['china-campus-specialty'],
    itemPacks: ['CMP-03-01-02'],
    rationale: 'Independent engineering zone: playground. Add sports-field and stand construction controls so athletic-facility work is only scheduled when that physical zone exists.',
  },
  liquid_oxygen_station: {
    templates: ['china-cleanroom-medical-specialty'],
    itemPacks: ['CLN-04-01-06'],
    rationale: 'Independent engineering zone: liquid_oxygen_station. Add medical oxygen source pack so liquid oxygen station work can be scheduled against its own physical zone.',
  },
  sewage_treatment_station: {
    templates: ['china-cleanroom-medical-specialty'],
    itemPacks: ['CLN-04-01-33'],
    rationale: 'Independent engineering zone: sewage_treatment_station. Add medical wastewater treatment pack so sewage-treatment work can be scheduled against its own physical zone.',
  },
  medical_waste_holding: {
    templates: ['china-cleanroom-medical-specialty'],
    itemPacks: ['CLN-04-01-32'],
    rationale: 'Independent engineering zone: medical_waste_holding. Add medical waste temporary-storage pack so medical-waste holding work can be scheduled against its own physical zone.',
  },
  hyperbaric_oxygen_chamber: {
    templates: ['china-cleanroom-medical-specialty'],
    itemPacks: ['CLN-04-01-40'],
    rationale: 'Independent engineering zone: hyperbaric_oxygen_chamber. Add hyperbaric oxygen chamber interface pack so chamber work can be scheduled against its own physical zone.',
  },
  substation: {
    templates: ['china-electrical-system'],
    itemPacks: ['ELE-05-01-01'],
    rationale: 'Independent engineering zone: substation. Add power-distribution energization pack so substation work can be scheduled against its own physical zone.',
  },
  generator_yard: {
    templates: ['china-data-center-specialty'],
    itemPacks: ['DTC-02-01-02', 'DTC-04-01-09', 'DTC-04-01-10'],
    rationale: 'Independent engineering zone: generator_yard. Add generator, day-tank and exhaust packs so backup-power work can be scheduled against its own physical zone.',
  },
  cooling_plant: {
    templates: ['china-data-center-specialty'],
    itemPacks: ['DTC-04-01-16'],
    rationale: 'Independent engineering zone: cooling_plant. Add cooling plant pack so heat-rejection work can be scheduled against its own physical zone.',
  },
  railway_operation_zone: {
    templates: ['china-tod-upper-cover-specialty'],
    itemPacks: ['TOD-01-01-02', 'TOD-04-01-08', 'TOD-04-01-09'],
    rationale: 'Independent engineering zone: railway_operation_zone. Add rail-operation protection and interface packs so railway operation zone work can be scheduled against its own physical zone.',
  },
  transfer_passage: {
    templates: ['china-tod-upper-cover-specialty'],
    itemPacks: ['TOD-04-01-13'],
    rationale: 'Independent engineering zone: transfer_passage. Add transfer-passage fit-out pack so transfer passage work can be scheduled against its own physical zone.',
  },
  traffic_connection_zone: {
    templates: ['china-tod-upper-cover-specialty'],
    itemPacks: ['TOD-03-01-01'],
    rationale: 'Independent engineering zone: traffic_connection_zone. Add station-city interface pack so traffic-connection work can be scheduled against its own physical zone.',
  },
}

export const SUPPORTED_INDEPENDENT_ENGINEERING_ZONE_CODES = Object.freeze(
  Object.keys(INDEPENDENT_ENGINEERING_ZONE_RULES),
)

export interface ProjectGenerationFacts {
  businessType: BusinessTypeCode
  businessSubtype?: BusinessSubtypeCode | null
  methodVariantCodes: string[]
  planScopeCaliber?: PlanScopeCaliber | null
  deliveryStandard?: DeliveryStandard | null
  terminalEvent?: TerminalEvent | null
  prefabSystemCodes?: string[] | null
  elementVariantCodes?: string[] | null
  externalInterfaceCodes?: string[] | null
  hardConstraintCodes?: string[] | null
  projectFeatures: Record<string, number | boolean | string | string[]>
  detailLevel: DetailLevel
  plannedEndDate?: string | null
  buildingCount: number
  totalAreaM2?: number | null
  aboveGroundAreaM2?: number | null
  basementAreaM2?: number | null
  siteAreaM2?: number | null
  structureTypeCode?: string | null
  standardFloorCount?: number | null
  highestBuildingFloorCount?: number | null
  basementLevelCount?: number | null
  foundationDepthM?: number | null
  prefabRate?: number | null
  maxSpanM?: number | null
  supportHeightM?: number | null
  hasCivilDefense?: boolean | null
  towerCraneCount?: number | null
  constructionHoistCount?: number | null
  buildingPatternCodes?: string[] | null
  functionalUsageCodes?: string[] | null
  floorUsageCodes?: string[] | null
  functionalCategoryCodes?: string[] | null
  specialRoomTypeCodes?: string[] | null
  physicalZoneTypeCodes?: string[] | null
  climateSignals?: string[] | null
  weatherImpactBands?: string[] | null
  locationFacts?: Record<string, string | string[] | boolean | null> | null
  scopeOrganizationFacts?: Record<string, unknown> | null
  onboardingMode?: string | null
  onboardingSubstage?: string | null
  onboardingPassedMilestones?: string[] | null
  onboardingPhaseProgress?: Record<string, unknown> | null
  scopeTree?: unknown // tree snapshot from wizard
}

function normalizeScopeFactCode(value: unknown) {
  return String(value ?? '').trim().toLowerCase()
}

function hasOutdoorPhysicalScope(codes: string[] | null | undefined) {
  return (codes ?? []).some((code) => {
    const normalized = normalizeScopeFactCode(code)
    return normalized === 'outdoor_site_plan'
      || normalized === 'outdoor_site'
      || normalized === 'site_plan'
      || normalized.includes('outdoor')
  })
}

function lookupIndependentEngineeringZoneRule(code: unknown) {
  const normalized = normalizeScopeFactCode(code)
  return normalized ? INDEPENDENT_ENGINEERING_ZONE_RULES[normalized] ?? null : null
}

export interface TemplateRecommendation {
  businessType: BusinessTypeCode
  label: string
  matchedTemplates: string[]
  triggeredItemPacks: string[]
  triggeredItemPackSources: Record<string, TriggeredItemPackSource[]>
  triggeredItemPackScopeTargets: Record<string, string[]>
  triggeredMilestones: string[]
  triggeredDangerItems: string[]
  suppressionRules: string[]
  scopeAssignmentRules: ScopeAssignmentRule[]
  expectedRowCount: { overview: number; standard: number; detailed: number }
  defaultPlanOutput: DefaultPlanOutputLayer
  masterPlanProfile: MasterPlanProfile
  foundationMethodCandidates: FoundationMethodCandidate[]
  projectOrganizationPolicyId: string
  projectOrganizationVariantCode: string
  buildingPatternScheduleTrust: ProjectScenarioProfile['buildingPatternScheduleTrust']
  /** Business-language explanation only: no seed key, source key, confidence, or caliber_version exposed. */
  recommendationRationale: string[]
}

export interface TemplateRecommendationOptions {
  runtimeBenchmarkResults?: readonly BuildingPatternScheduleRuntimeBenchmarkResult[] | null
}

function withDefinedFact(
  target: Record<string, unknown>,
  key: string,
  value: unknown,
) {
  if (value === null || value === undefined) return
  if (Array.isArray(value) && value.length === 0) return
  target[key] = value
}

function isProjectFeatureEnabled(value: unknown) {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return Number.isFinite(value) && value > 0
  if (Array.isArray(value)) return value.length > 0
  const normalized = String(value ?? '').trim().toLowerCase()
  return normalized.length > 0 && !['0', 'false', 'no', 'none', 'off'].includes(normalized)
}

const DETAIL_LEVEL_FILTER: Record<DetailLevel, string[]> = {
  overview: ['chapter', 'section', 'itemPack'],
  standard: ['chapter', 'section', 'itemPack', 'subItemPack'],
  detailed: ['chapter', 'section', 'itemPack', 'subItemPack', 'workItem'],
}

const PRECAST_CONCRETE_CORE_ITEM_PACKS = [
  'PFB-00-01-01',
  'PFB-00-01-02',
  'PFB-00-01-03',
  'PFB-01-01-01',
  'PFB-01-01-02',
  'PFB-01-01-03',
  'PFB-01-01-04',
  'PFB-02-01-01',
  'PFB-02-01-03',
  'PFB-02-01-04',
  'PFB-03-01-01',
  'PFB-03-01-02',
  'PFB-03-01-03',
  'PFB-04-01-01',
  'PFB-04-01-02',
  'PFB-04-01-03',
  'PFB-04-01-04',
  'PFB-04-01-11',
  'PFB-04-01-12',
]

const MODULAR_MIC_CORE_ITEM_PACKS = [
  'MIC-01-01-01',
  'MIC-01-01-02',
  'MIC-02-01-01',
  'MIC-02-01-02',
  'MIC-03-01-01',
  'MIC-03-01-02',
  'MIC-04-01-01',
  'MIC-04-01-02',
  'MIC-05-01-01',
  'MIC-05-01-02',
  'MIC-06-01-01',
  'MIC-06-01-02',
  'MIC-06-01-03',
  'MIC-06-01-04',
  'MIC-06-01-05',
  'MIC-06-01-06',
  'MIC-06-01-07',
  'MIC-06-01-08',
  'MIC-06-01-09',
  'MIC-06-01-10',
  'MIC-06-01-11',
  'MIC-06-01-12',
  'MIC-06-01-13',
  'MIC-06-01-14',
  'MIC-06-01-15',
  'MIC-06-01-16',
  'MIC-06-01-17',
  'MIC-06-01-18',
  'MIC-06-01-19',
  'MIC-06-01-20',
  'MIC-06-01-21',
  'MIC-06-01-22',
]

const STEEL_FRAME_CORE_ITEM_PACKS = [
  'STL-01-01-01',
  'STL-01-01-02',
  'STL-02-01-01',
  'STL-02-01-02',
  'STL-03-01-01',
  'STL-04-01-01',
  'STL-04-01-02',
  'STL-04-01-03',
  'STL-04-01-04',
  'STL-04-01-05',
  'STL-04-01-06',
  'STL-04-01-07',
  'STL-04-01-08',
  'STL-04-01-10',
  'STL-04-01-11',
  'STL-04-01-13',
  'STL-04-01-14',
  'STL-04-01-15',
  'STL-04-01-16',
  'STL-04-01-17',
]

const FOUNDATION_METHOD_CANDIDATES: FoundationMethodCandidate[] = [
  { code: 'raft_foundation', label: '筏板基础', category: 'shallow_foundation', selected: false },
  { code: 'independent_foundation', label: '独立基础', category: 'shallow_foundation', selected: false },
  { code: 'bored_pile', label: '钻孔灌注桩', category: 'pile_foundation', selected: false },
  { code: 'precast_pile', label: '预制管桩', category: 'pile_foundation', selected: false },
  { code: 'cfg_pile', label: 'CFG 桩', category: 'pile_foundation', selected: false },
  { code: 'diaphragm_wall', label: '地下连续墙', category: 'pit_support', selected: false },
  { code: 'smw_pile', label: 'SMW 工法桩', category: 'pit_support', selected: false },
  { code: 'trd_wall', label: 'TRD 等厚水泥土连续墙', category: 'pit_support', selected: false },
  { code: 'soil_nailing', label: '土钉墙', category: 'pit_support', selected: false },
  { code: 'anchor_support', label: '锚杆支护', category: 'pit_support', selected: false },
  { code: 'dewatering_well', label: '管井降水', category: 'dewatering_monitoring', selected: false },
]

const FOUNDATION_METHOD_TO_FEATURE_CODE: Record<string, string> = {
  bored_pile: 'pile_foundation',
  precast_pile: 'pile_foundation',
  cfg_pile: 'pile_foundation',
  diaphragm_wall: 'diaphragm_wall',
  smw_pile: 'foundation_dewatering',
  trd_wall: 'foundation_dewatering',
  dewatering_well: 'foundation_dewatering',
}

function addTriggeredItemPack(
  target: Set<string>,
  sources: Map<string, Set<TriggeredItemPackSource>>,
  itemPack: string,
  source: TriggeredItemPackSource,
) {
  const code = String(itemPack ?? '').trim()
  if (!code) return
  target.add(code)
  const bucket = sources.get(code) ?? new Set<TriggeredItemPackSource>()
  bucket.add(source)
  sources.set(code, bucket)
}

function addTriggeredItemPacks(
  target: Set<string>,
  sources: Map<string, Set<TriggeredItemPackSource>>,
  itemPacks: string[],
  source: TriggeredItemPackSource,
) {
  itemPacks.forEach((itemPack) => addTriggeredItemPack(target, sources, itemPack, source))
}

function addTriggeredItemPackScopeTarget(
  targets: Map<string, Set<string>>,
  itemPack: string,
  scopeTarget: unknown,
) {
  const code = String(itemPack ?? '').trim()
  const target = normalizeScopeFactCode(scopeTarget)
  if (!code || !target) return
  const bucket = targets.get(code) ?? new Set<string>()
  bucket.add(target)
  targets.set(code, bucket)
}

function serializeTriggeredItemPackSources(sources: Map<string, Set<TriggeredItemPackSource>>) {
  return Object.fromEntries(
    [...sources.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([itemPack, itemSources]) => [itemPack, [...itemSources].sort()]),
  )
}

function serializeTriggeredItemPackScopeTargets(targets: Map<string, Set<string>>) {
  return Object.fromEntries(
    [...targets.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([itemPack, scopeTargets]) => [itemPack, [...scopeTargets].sort()]),
  )
}

function readProjectFeatureStringArray(features: Record<string, unknown>, key: string): string[] {
  const value = features[key]
  if (Array.isArray(value)) {
    return value
      .map((item) => String(item ?? '').trim())
      .filter(Boolean)
  }
  const text = String(value ?? '').trim()
  return text ? [text] : []
}

function readSelectedFoundationMethodCodes(facts: ProjectGenerationFacts): Set<string> {
  const selected = new Set<string>()
  for (const method of facts.methodVariantCodes ?? []) {
    const code = normalizeScopeFactCode(method)
    if (FOUNDATION_METHOD_CANDIDATES.some((candidate) => candidate.code === code)) selected.add(code)
    if (code === 'pile_foundation') selected.add('bored_pile')
    if (code === 'vertical_retaining_support' || code === 'vertical_retaining') selected.add('diaphragm_wall')
  }
  for (const code of readProjectFeatureStringArray(facts.projectFeatures, 'foundationFormCodes')) {
    const normalized = normalizeScopeFactCode(code)
    if (FOUNDATION_METHOD_CANDIDATES.some((candidate) => candidate.code === normalized)) selected.add(normalized)
  }
  for (const code of ['pile_foundation', 'diaphragm_wall', 'foundation_dewatering', 'foundation_monitoring']) {
    if (facts.projectFeatures[code] === true) {
      if (code === 'pile_foundation') selected.add('bored_pile')
      if (code === 'diaphragm_wall') selected.add('diaphragm_wall')
      if (code === 'foundation_dewatering') selected.add('dewatering_well')
    }
  }
  return selected
}

function buildFoundationMethodCandidates(facts: ProjectGenerationFacts): FoundationMethodCandidate[] {
  const selected = readSelectedFoundationMethodCodes(facts)
  return FOUNDATION_METHOD_CANDIDATES.map((candidate) => ({
    ...candidate,
    selected: selected.has(candidate.code),
  }))
}

function buildMasterPlanProfile(facts: ProjectGenerationFacts): MasterPlanProfile {
  const rowCountRange = resolveDefaultMasterPlanRowCountRange({
    businessType: facts.businessType,
    buildingCount: facts.buildingCount,
    basementLevelCount: facts.basementLevelCount,
    highestBuildingFloorCount: facts.highestBuildingFloorCount,
  })
  return {
    layer: 'master_plan',
    detailLevel: 'planning_skeleton',
    generationDepth: 'managed_frontier',
    rowCountRange,
    rowProjectionMode: 'schedule_row',
    supportLayerPolicy: {
      gateMarkers: 'supporting_evidence_not_default_gantt_rows',
      inlineControls: 'embedded_under_schedule_rows',
      linkedProjections: 'review_reference_not_default_gantt_rows',
    },
    mutationBoundary: {
      writesProductionDependencies: false,
      writesProductionDates: false,
      writesCriticalPathFacts: false,
    },
  }
}

function normalizeGenerationBusinessFacts(facts: ProjectGenerationFacts): ProjectGenerationFacts {
  const rawBusinessType = String(facts.businessType ?? '').trim()
  const compatibilityMatches = mapT2RhythmBusinessTypeCodeToFormalBusinessTypes(facts.businessType)
  if (compatibilityMatches.length === 1 && compatibilityMatches[0] === 'general_civil') {
    const normalizedBusinessSubtype = facts.businessSubtype
      ?? (rawBusinessType === 'residential' ? 'civil_residential' : null)
    return {
      ...facts,
      businessType: 'general_civil',
      businessSubtype: normalizedBusinessSubtype,
    }
  }
  return facts
}

export function buildTemplateRecommendation(
  rawFacts: ProjectGenerationFacts,
  options: TemplateRecommendationOptions = {},
): TemplateRecommendation {
  const facts = normalizeGenerationBusinessFacts(rawFacts)
  const rec = getBusinessTypeRecommendation(facts.businessType)
  const scenarioProjectFeatures: Record<string, unknown> = { ...facts.projectFeatures }
  withDefinedFact(scenarioProjectFeatures, 'planScopeCaliber', facts.planScopeCaliber)
  withDefinedFact(scenarioProjectFeatures, 'deliveryStandard', facts.deliveryStandard)
  withDefinedFact(scenarioProjectFeatures, 'terminalEvent', facts.terminalEvent)
  withDefinedFact(scenarioProjectFeatures, 'prefabSystemCodes', facts.prefabSystemCodes)
  withDefinedFact(scenarioProjectFeatures, 'elementVariantCodes', facts.elementVariantCodes)
  withDefinedFact(scenarioProjectFeatures, 'externalInterfaceCodes', facts.externalInterfaceCodes)
  withDefinedFact(scenarioProjectFeatures, 'hardConstraintCodes', facts.hardConstraintCodes)
  withDefinedFact(scenarioProjectFeatures, 'totalAreaM2', facts.totalAreaM2)
  withDefinedFact(scenarioProjectFeatures, 'aboveGroundAreaM2', facts.aboveGroundAreaM2)
  withDefinedFact(scenarioProjectFeatures, 'basementAreaM2', facts.basementAreaM2)
  withDefinedFact(scenarioProjectFeatures, 'siteAreaM2', facts.siteAreaM2)
  withDefinedFact(scenarioProjectFeatures, 'buildingCount', facts.buildingCount)
  withDefinedFact(scenarioProjectFeatures, 'standardFloorCount', facts.standardFloorCount)
  withDefinedFact(scenarioProjectFeatures, 'highestBuildingFloorCount', facts.highestBuildingFloorCount)
  withDefinedFact(scenarioProjectFeatures, 'basementLevelCount', facts.basementLevelCount)
  withDefinedFact(scenarioProjectFeatures, 'foundationDepthM', facts.foundationDepthM)
  withDefinedFact(scenarioProjectFeatures, 'prefabRate', facts.prefabRate)
  withDefinedFact(scenarioProjectFeatures, 'maxSpanM', facts.maxSpanM)
  withDefinedFact(scenarioProjectFeatures, 'supportHeightM', facts.supportHeightM)
  withDefinedFact(scenarioProjectFeatures, 'hasCivilDefense', facts.hasCivilDefense)
  withDefinedFact(scenarioProjectFeatures, 'towerCraneCount', facts.towerCraneCount)
  withDefinedFact(scenarioProjectFeatures, 'constructionHoistCount', facts.constructionHoistCount)
  withDefinedFact(scenarioProjectFeatures, 'buildingPatternCodes', facts.buildingPatternCodes)
  withDefinedFact(scenarioProjectFeatures, 'functionalUsageCodes', facts.functionalUsageCodes)
  withDefinedFact(scenarioProjectFeatures, 'floorUsageCodes', facts.floorUsageCodes)
  withDefinedFact(scenarioProjectFeatures, 'functionalCategoryCodes', facts.functionalCategoryCodes)
  withDefinedFact(scenarioProjectFeatures, 'specialRoomTypeCodes', facts.specialRoomTypeCodes)
  withDefinedFact(scenarioProjectFeatures, 'physicalZoneTypeCodes', facts.physicalZoneTypeCodes)
  const runtimeBenchmarkResults = options.runtimeBenchmarkResults
    ?? loadBuildingPatternScheduleRuntimeBenchmarkResults()
  const scenarioProfile = resolveProjectScenarioProfile(
    {
      businessType: facts.businessType,
      businessSubtype: facts.businessSubtype,
      methodVariantCodes: facts.methodVariantCodes,
      buildingPatternCodes: facts.buildingPatternCodes,
      projectFeatures: scenarioProjectFeatures,
      totalAreaM2: facts.totalAreaM2,
      buildingCount: facts.buildingCount,
      structureTypeCode: facts.structureTypeCode,
      standardFloorCount: facts.standardFloorCount,
      highestBuildingFloorCount: facts.highestBuildingFloorCount,
      basementLevelCount: facts.basementLevelCount,
      foundationDepthM: facts.foundationDepthM,
      prefabRate: facts.prefabRate,
    },
    { runtimeBenchmarkResults },
  )
  const foundationMethodCandidates = buildFoundationMethodCandidates(facts)
  const selectedFoundationMethodCandidates = foundationMethodCandidates.filter((candidate) => candidate.selected)
  const projectOrganizationPolicy = resolveProjectConstructionOrganizationPolicy(
    facts.businessType,
    facts.businessSubtype ?? facts.businessType,
    facts,
  )
  const projectRecommendations = scenarioProfile.recommendationPacks
    .map((packKey) => WBS_TEMPLATE_PROJECT_RECOMMENDATIONS[packKey])
  const triggeredItemPacks = new Set<string>()
  const triggeredItemPackSources = new Map<string, Set<TriggeredItemPackSource>>()
  const triggeredItemPackScopeTargets = new Map<string, Set<string>>()
  const triggeredMilestones = new Set<string>()
  const triggeredDangerItems = new Set<string>()
  const suppressionRules = new Set<string>()
  const rationale: string[] = []

  for (const projectRecommendation of projectRecommendations) {
    projectRecommendation.requiredTemplateIds.forEach((templateId) => addTriggeredItemPack(triggeredItemPacks, triggeredItemPackSources, templateId, 'template_catalog'))
    projectRecommendation.recommendedTemplateIds.forEach((templateId) => addTriggeredItemPack(triggeredItemPacks, triggeredItemPackSources, templateId, 'template_catalog'))
    projectRecommendation.conditionalTemplateRules.forEach((rule) => {
      rule.includeTemplateIds.forEach((templateId) => addTriggeredItemPack(triggeredItemPacks, triggeredItemPackSources, templateId, 'template_catalog'))
    })
  }
  rationale.push(`项目推荐组合：${scenarioProfile.recommendationPacks.join(' + ')}`)
  rationale.push(`真实项目覆盖报告场景：${scenarioProfile.benchmarkScenarioKeys.join(', ')}`)

  rationale.push(`业态：${rec.label}（${facts.businessType}）`)
  if (facts.businessSubtype) {
    rationale.push(`子类型：${facts.businessSubtype}`)
    const sub = rec.subtypes?.find(s => s.code === facts.businessSubtype)
    if (sub) {
      sub.triggers.forEach(t => rationale.push(`  - ${t}`))
    }
  }

  // Default features from business type
  for (const featCode of rec.defaultFeatures) {
    const entry = getFeatureEntry(featCode)
    if (entry) {
      entry.triggers.forEach(t => addTriggeredItemPack(triggeredItemPacks, triggeredItemPackSources, t, 'business_default'))
      entry.milestones.forEach(m => triggeredMilestones.add(m))
      entry.dangerItems.forEach(d => triggeredDangerItems.add(d))
      entry.suppressionRules.forEach(s => suppressionRules.add(s))
      rationale.push(`默认特征：${entry.label}`)
    }
  }

  // User-selected features
  for (const [featCode, value] of Object.entries(facts.projectFeatures)) {
    const entry = getFeatureEntry(featCode)
    if (!entry || !isProjectFeatureEnabled(value)) continue
    entry.triggers.forEach(t => addTriggeredItemPack(triggeredItemPacks, triggeredItemPackSources, t, 'project_feature'))
    entry.milestones.forEach(m => triggeredMilestones.add(m))
    entry.dangerItems.forEach(d => triggeredDangerItems.add(d))
    entry.suppressionRules.forEach(s => suppressionRules.add(s))
    const valStr = entry.hasNumericValue ? `=${value}` : ''
    rationale.push(`特征：${entry.label}${valStr}`)
  }

  // Methods
  for (const method of facts.methodVariantCodes) {
    rationale.push(`工法：${method}`)
    if (method === 'steel_frame') {
      addTriggeredItemPack(triggeredItemPacks, triggeredItemPackSources, 'china-steel-structure-specialty', 'method')
      addTriggeredItemPacks(triggeredItemPacks, triggeredItemPackSources, STEEL_FRAME_CORE_ITEM_PACKS, 'method')
    }
    if (method === 'precast_concrete') {
      addTriggeredItemPack(triggeredItemPacks, triggeredItemPackSources, 'china-dangerous-subproject-control', 'method')
      addTriggeredItemPack(triggeredItemPacks, triggeredItemPackSources, 'DANGER-01-01-13', 'method')
      addTriggeredItemPack(triggeredItemPacks, triggeredItemPackSources, 'DANGER-02-01-06', 'method')
      triggeredDangerItems.add('DANGER-01-01-13')
      triggeredDangerItems.add('DANGER-02-01-06')
      addTriggeredItemPack(triggeredItemPacks, triggeredItemPackSources, 'china-prefabricated-assembly', 'method')
      addTriggeredItemPacks(triggeredItemPacks, triggeredItemPackSources, PRECAST_CONCRETE_CORE_ITEM_PACKS, 'method')
    }
    if (method === 'modular_mic') {
      addTriggeredItemPack(triggeredItemPacks, triggeredItemPackSources, 'china-dangerous-subproject-control', 'method')
      addTriggeredItemPack(triggeredItemPacks, triggeredItemPackSources, 'DANGER-01-01-13', 'method')
      addTriggeredItemPack(triggeredItemPacks, triggeredItemPackSources, 'DANGER-01-01-14', 'method')
      addTriggeredItemPack(triggeredItemPacks, triggeredItemPackSources, 'DANGER-02-01-06', 'method')
      triggeredDangerItems.add('DANGER-01-01-13')
      triggeredDangerItems.add('DANGER-01-01-14')
      triggeredDangerItems.add('DANGER-02-01-06')
      addTriggeredItemPack(triggeredItemPacks, triggeredItemPackSources, 'china-modular-mic-specialty', 'method')
      addTriggeredItemPacks(triggeredItemPacks, triggeredItemPackSources, MODULAR_MIC_CORE_ITEM_PACKS, 'method')
      addTriggeredItemPack(triggeredItemPacks, triggeredItemPackSources, 'china-prefab-bathroom-specialty', 'method')
      addTriggeredItemPack(triggeredItemPacks, triggeredItemPackSources, 'china-prefab-kitchen-specialty', 'method')
    }
  }

  for (const candidate of selectedFoundationMethodCandidates) {
    rationale.push(`基础/基坑候选：${candidate.label}`)
    addTriggeredItemPack(triggeredItemPacks, triggeredItemPackSources, 'china-foundation-pit-pile', 'explicit_user_selection')
    const featureCode = FOUNDATION_METHOD_TO_FEATURE_CODE[candidate.code]
    const entry = featureCode ? getFeatureEntry(featureCode) : null
    if (entry) {
      entry.triggers.forEach((itemPack) => addTriggeredItemPack(triggeredItemPacks, triggeredItemPackSources, itemPack, 'explicit_user_selection'))
      entry.milestones.forEach((milestone) => triggeredMilestones.add(milestone))
      entry.dangerItems.forEach((dangerItem) => triggeredDangerItems.add(dangerItem))
      entry.suppressionRules.forEach((rule) => suppressionRules.add(rule))
    }
  }

  if (facts.planScopeCaliber) rationale.push(`Plan scope caliber: ${facts.planScopeCaliber}`)
  if (facts.deliveryStandard) rationale.push(`Delivery standard: ${facts.deliveryStandard}`)
  if (facts.terminalEvent) rationale.push(`Terminal event: ${facts.terminalEvent}`)

  for (const systemCode of facts.prefabSystemCodes ?? []) {
    rationale.push(`Prefab system: ${systemCode}`)
    if (systemCode === 'pcf_facade_panel') {
      addTriggeredItemPack(triggeredItemPacks, triggeredItemPackSources, 'PFB-01-01-07', 'prefab_system')
      addTriggeredItemPack(triggeredItemPacks, triggeredItemPackSources, 'PFB-04-01-10', 'prefab_system')
      suppressionRules.add('03-02')
      suppressionRules.add('03-03')
      suppressionRules.add('03-10')
    }
    if (systemCode === 'alc_partition_panel') {
      addTriggeredItemPack(triggeredItemPacks, triggeredItemPackSources, 'PFB-02-01-05', 'prefab_system')
      suppressionRules.add('02-02-05')
    }
    if (systemCode === 'integrated_bathroom') {
      addTriggeredItemPack(triggeredItemPacks, triggeredItemPackSources, 'china-prefab-bathroom-specialty', 'prefab_system')
      addTriggeredItemPack(triggeredItemPacks, triggeredItemPackSources, 'IBU-01-01-01', 'prefab_system')
      addTriggeredItemPack(triggeredItemPacks, triggeredItemPackSources, 'IBU-01-01-02', 'prefab_system')
      addTriggeredItemPack(triggeredItemPacks, triggeredItemPackSources, 'IBU-01-02-01', 'prefab_system')
      addTriggeredItemPack(triggeredItemPacks, triggeredItemPackSources, 'IBU-02-01-01', 'prefab_system')
      addTriggeredItemPack(triggeredItemPacks, triggeredItemPackSources, 'IBU-03-01-01', 'prefab_system')
      addTriggeredItemPack(triggeredItemPacks, triggeredItemPackSources, 'IBU-03-01-03', 'prefab_system')
      addTriggeredItemPack(triggeredItemPacks, triggeredItemPackSources, 'IBU-03-01-05', 'prefab_system')
    }
    if (systemCode === 'integrated_kitchen') {
      addTriggeredItemPack(triggeredItemPacks, triggeredItemPackSources, 'china-prefab-kitchen-specialty', 'prefab_system')
      addTriggeredItemPack(triggeredItemPacks, triggeredItemPackSources, 'IKU-01-01-01', 'prefab_system')
      addTriggeredItemPack(triggeredItemPacks, triggeredItemPackSources, 'IKU-01-01-02', 'prefab_system')
      addTriggeredItemPack(triggeredItemPacks, triggeredItemPackSources, 'IKU-01-02-01', 'prefab_system')
      addTriggeredItemPack(triggeredItemPacks, triggeredItemPackSources, 'IKU-02-01-01', 'prefab_system')
      addTriggeredItemPack(triggeredItemPacks, triggeredItemPackSources, 'IKU-03-01-01', 'prefab_system')
      addTriggeredItemPack(triggeredItemPacks, triggeredItemPackSources, 'IKU-03-01-03', 'prefab_system')
      addTriggeredItemPack(triggeredItemPacks, triggeredItemPackSources, 'IKU-03-01-05', 'prefab_system')
    }
  }

  for (const interfaceCode of facts.externalInterfaceCodes ?? []) {
    rationale.push(`External interface: ${interfaceCode}`)
    if (interfaceCode === 'metro_operation_interface') {
      addTriggeredItemPack(triggeredItemPacks, triggeredItemPackSources, 'china-tod-upper-cover-specialty', 'external_interface')
      addTriggeredItemPack(triggeredItemPacks, triggeredItemPackSources, 'TOD-01-01-01', 'external_interface')
      addTriggeredItemPack(triggeredItemPacks, triggeredItemPackSources, 'TOD-01-01-02', 'external_interface')
      addTriggeredItemPack(triggeredItemPacks, triggeredItemPackSources, 'TOD-04-01-01', 'external_interface')
      addTriggeredItemPack(triggeredItemPacks, triggeredItemPackSources, 'TOD-04-01-02', 'external_interface')
      addTriggeredItemPack(triggeredItemPacks, triggeredItemPackSources, 'TOD-04-01-08', 'external_interface')
      addTriggeredItemPack(triggeredItemPacks, triggeredItemPackSources, 'TOD-04-01-09', 'external_interface')
      addTriggeredItemPack(triggeredItemPacks, triggeredItemPackSources, 'TOD-04-01-18', 'external_interface')
      addTriggeredItemPack(triggeredItemPacks, triggeredItemPackSources, 'TOD-04-01-22', 'external_interface')
      addTriggeredItemPack(triggeredItemPacks, triggeredItemPackSources, 'china-foundation-pit-pile', 'external_interface')
      addTriggeredItemPack(triggeredItemPacks, triggeredItemPackSources, 'FND-06-01-04', 'external_interface')
      triggeredMilestones.add('metro_operator_acceptance')
    }
    if (interfaceCode === 'heritage_protection_interface') {
      addTriggeredItemPack(triggeredItemPacks, triggeredItemPackSources, 'china-heritage-preservation-specialty', 'external_interface')
      addTriggeredItemPack(triggeredItemPacks, triggeredItemPackSources, 'HRT-01-01-01', 'external_interface')
      addTriggeredItemPack(triggeredItemPacks, triggeredItemPackSources, 'HRT-01-01-02', 'external_interface')
      addTriggeredItemPack(triggeredItemPacks, triggeredItemPackSources, 'HRT-03-01-01', 'external_interface')
      addTriggeredItemPack(triggeredItemPacks, triggeredItemPackSources, 'HRT-04-01-01', 'external_interface')
      addTriggeredItemPack(triggeredItemPacks, triggeredItemPackSources, 'HRT-04-01-02', 'external_interface')
      addTriggeredItemPack(triggeredItemPacks, triggeredItemPackSources, 'HRT-04-01-03', 'external_interface')
      addTriggeredItemPack(triggeredItemPacks, triggeredItemPackSources, 'HRT-04-01-14', 'external_interface')
      addTriggeredItemPack(triggeredItemPacks, triggeredItemPackSources, 'HRT-04-01-15', 'external_interface')
    }
    if (interfaceCode === 'high_voltage_protection_interface') {
      addTriggeredItemPack(triggeredItemPacks, triggeredItemPackSources, 'china-foundation-pit-pile', 'external_interface')
      addTriggeredItemPack(triggeredItemPacks, triggeredItemPackSources, 'FND-06-01-01', 'external_interface')
      addTriggeredItemPack(triggeredItemPacks, triggeredItemPackSources, 'FND-06-01-03', 'external_interface')
      addTriggeredItemPack(triggeredItemPacks, triggeredItemPackSources, 'FND-06-01-05', 'external_interface')
    }
  }

  for (const hardConstraintCode of facts.hardConstraintCodes ?? []) {
    rationale.push(`Hard constraint: ${hardConstraintCode}`)
    if (hardConstraintCode === 'non_stop_operation') {
      addTriggeredItemPack(triggeredItemPacks, triggeredItemPackSources, 'china-tod-upper-cover-specialty', 'hard_constraint')
      addTriggeredItemPack(triggeredItemPacks, triggeredItemPackSources, 'TOD-01-01-02', 'hard_constraint')
      addTriggeredItemPack(triggeredItemPacks, triggeredItemPackSources, 'TOD-04-01-02', 'hard_constraint')
      addTriggeredItemPack(triggeredItemPacks, triggeredItemPackSources, 'TOD-04-01-08', 'hard_constraint')
      addTriggeredItemPack(triggeredItemPacks, triggeredItemPackSources, 'TOD-04-01-09', 'hard_constraint')
      addTriggeredItemPack(triggeredItemPacks, triggeredItemPackSources, 'TOD-04-01-18', 'hard_constraint')
      addTriggeredItemPack(triggeredItemPacks, triggeredItemPackSources, 'TOD-04-01-22', 'hard_constraint')
    }
    if (hardConstraintCode === 'occupied_renovation') {
      addTriggeredItemPack(triggeredItemPacks, triggeredItemPackSources, 'china-renovation-retrofit-specialty', 'hard_constraint')
      addTriggeredItemPack(triggeredItemPacks, triggeredItemPackSources, 'RNV-01-01-01', 'hard_constraint')
      addTriggeredItemPack(triggeredItemPacks, triggeredItemPackSources, 'RNV-01-01-02', 'hard_constraint')
      addTriggeredItemPack(triggeredItemPacks, triggeredItemPackSources, 'RNV-03-01-01', 'hard_constraint')
      addTriggeredItemPack(triggeredItemPacks, triggeredItemPackSources, 'RNV-03-01-02', 'hard_constraint')
      addTriggeredItemPack(triggeredItemPacks, triggeredItemPackSources, 'RNV-04-01-04', 'hard_constraint')
      addTriggeredItemPack(triggeredItemPacks, triggeredItemPackSources, 'RNV-04-01-16', 'hard_constraint')
      addTriggeredItemPack(triggeredItemPacks, triggeredItemPackSources, 'RNV-04-01-18', 'hard_constraint')
      addTriggeredItemPack(triggeredItemPacks, triggeredItemPackSources, 'RNV-04-01-21', 'hard_constraint')
      addTriggeredItemPack(triggeredItemPacks, triggeredItemPackSources, 'RNV-04-01-22', 'hard_constraint')
      addTriggeredItemPack(triggeredItemPacks, triggeredItemPackSources, 'RNV-04-01-23', 'hard_constraint')
      addTriggeredItemPack(triggeredItemPacks, triggeredItemPackSources, 'RNV-04-01-24', 'hard_constraint')
    }
    if (hardConstraintCode === 'hard_date_opening') triggeredMilestones.add('opening_readiness')
    if (hardConstraintCode === 'production_validation_gate') triggeredMilestones.add('production_validation')
  }

  if (facts.deliveryStandard === 'rough') {
    suppressionRules.add('fitout_finish_heavy_scope')
    rationale.push('Rough delivery standard: suppress heavy fit-out scope unless explicitly selected.')
  }
  if (facts.deliveryStandard === 'mep_ready') triggeredMilestones.add('mep_transfer_ready')
  if (facts.deliveryStandard === 'public_area_fitout') {
    addTriggeredItemPack(triggeredItemPacks, triggeredItemPackSources, 'china-jgj-tianjin-decoration', 'delivery_standard')
    addTriggeredItemPack(triggeredItemPacks, triggeredItemPackSources, 'DEC-05-01-01', 'delivery_standard')
    addTriggeredItemPack(triggeredItemPacks, triggeredItemPackSources, 'DEC-05-01-02', 'delivery_standard')
  }
  if (facts.deliveryStandard === 'full_fitout') {
    addTriggeredItemPack(triggeredItemPacks, triggeredItemPackSources, 'china-jgj-tianjin-decoration', 'delivery_standard')
    addTriggeredItemPack(triggeredItemPacks, triggeredItemPackSources, 'DEC-01-01-01', 'delivery_standard')
    addTriggeredItemPack(triggeredItemPacks, triggeredItemPackSources, 'DEC-01-02-01', 'delivery_standard')
    addTriggeredItemPack(triggeredItemPacks, triggeredItemPackSources, 'DEC-02-01-01', 'delivery_standard')
    addTriggeredItemPack(triggeredItemPacks, triggeredItemPackSources, 'DEC-02-01-02', 'delivery_standard')
    addTriggeredItemPack(triggeredItemPacks, triggeredItemPackSources, 'DEC-02-01-03', 'delivery_standard')
    addTriggeredItemPack(triggeredItemPacks, triggeredItemPackSources, 'DEC-02-02-01', 'delivery_standard')
    addTriggeredItemPack(triggeredItemPacks, triggeredItemPackSources, 'DEC-03-01-01', 'delivery_standard')
    addTriggeredItemPack(triggeredItemPacks, triggeredItemPackSources, 'DEC-03-01-02', 'delivery_standard')
    addTriggeredItemPack(triggeredItemPacks, triggeredItemPackSources, 'DEC-03-02-01', 'delivery_standard')
    addTriggeredItemPack(triggeredItemPacks, triggeredItemPackSources, 'DEC-03A-01-01', 'delivery_standard')
    addTriggeredItemPack(triggeredItemPacks, triggeredItemPackSources, 'DEC-06-01-01', 'delivery_standard')
  }
  if (facts.deliveryStandard === 'hotel_opening') {
    addTriggeredItemPack(triggeredItemPacks, triggeredItemPackSources, 'china-document-commercial-support', 'delivery_standard')
    addTriggeredItemPack(triggeredItemPacks, triggeredItemPackSources, 'china-hotel-specialty', 'delivery_standard')
    addTriggeredItemPack(triggeredItemPacks, triggeredItemPackSources, 'HTL-01-01-01', 'delivery_standard')
    addTriggeredItemPack(triggeredItemPacks, triggeredItemPackSources, 'HTL-01-01-02', 'delivery_standard')
    addTriggeredItemPack(triggeredItemPacks, triggeredItemPackSources, 'HTL-02-01-01', 'delivery_standard')
    addTriggeredItemPack(triggeredItemPacks, triggeredItemPackSources, 'HTL-03-01-01', 'delivery_standard')
    addTriggeredItemPack(triggeredItemPacks, triggeredItemPackSources, 'HTL-04-01-01', 'delivery_standard')
    addTriggeredItemPack(triggeredItemPacks, triggeredItemPackSources, 'HTL-04-01-02', 'delivery_standard')
    addTriggeredItemPack(triggeredItemPacks, triggeredItemPackSources, 'HTL-05-01-01', 'delivery_standard')
    addTriggeredItemPack(triggeredItemPacks, triggeredItemPackSources, 'HTL-05-01-02', 'delivery_standard')
    addTriggeredItemPack(triggeredItemPacks, triggeredItemPackSources, 'HTL-06-01-24', 'delivery_standard')
    addTriggeredItemPack(triggeredItemPacks, triggeredItemPackSources, 'HTL-06-01-25', 'delivery_standard')
    addTriggeredItemPack(triggeredItemPacks, triggeredItemPackSources, 'HTL-06-01-26', 'delivery_standard')
    addTriggeredItemPack(triggeredItemPacks, triggeredItemPackSources, 'HTL-06-01-27', 'delivery_standard')
    triggeredMilestones.add('trial_opening')
  }
  if (facts.deliveryStandard === 'production_ready') triggeredMilestones.add('production_validation')

  if (facts.terminalEvent === 'completion_acceptance') triggeredMilestones.add('completion_acceptance')
  if (facts.terminalEvent === 'owner_handover') triggeredMilestones.add('owner_handover')
  if (facts.terminalEvent === 'trial_opening') triggeredMilestones.add('trial_opening')
  if (facts.terminalEvent === 'production_validation') triggeredMilestones.add('production_validation')

  if ((facts.basementLevelCount ?? 0) > 0) {
    addTriggeredItemPack(triggeredItemPacks, triggeredItemPackSources, 'china-foundation-pit-pile', 'physical_scope')
    addTriggeredItemPack(triggeredItemPacks, triggeredItemPackSources, 'china-waterproof-insulation', 'physical_scope')
    rationale.push(`Basement scope: ${facts.basementLevelCount} basement level(s). Add pit and waterproofing packs so basement tasks can be scheduled against basement objects.`)
  }

  if (hasOutdoorPhysicalScope(facts.physicalZoneTypeCodes)) {
    addTriggeredItemPack(triggeredItemPacks, triggeredItemPackSources, 'china-gb55032-2022-outdoor', 'physical_scope')
    addTriggeredItemPack(triggeredItemPacks, triggeredItemPackSources, 'OUT-02-01-01', 'physical_scope')
    rationale.push('Outdoor physical space: scope tree includes outdoor site works. Add outdoor works pack so roads, pipe networks and landscape tasks can be scheduled against outdoor physical zones.')
  }

  for (const physicalZoneTypeCode of facts.physicalZoneTypeCodes ?? []) {
    const zoneRule = lookupIndependentEngineeringZoneRule(physicalZoneTypeCode)
    if (!zoneRule) continue
    zoneRule.templates.forEach((templateId) => addTriggeredItemPack(triggeredItemPacks, triggeredItemPackSources, templateId, 'physical_scope'))
    zoneRule.itemPacks.forEach((itemPackCode) => {
      addTriggeredItemPack(triggeredItemPacks, triggeredItemPackSources, itemPackCode, 'physical_scope')
      addTriggeredItemPackScopeTarget(triggeredItemPackScopeTargets, itemPackCode, physicalZoneTypeCode)
    })
    rationale.push(zoneRule.rationale)
  }

  for (const floorUsageCode of facts.floorUsageCodes ?? []) {
    const rule = SPECIAL_FLOOR_USAGE_RULES[floorUsageCode]
    if (!rule) continue
    rule.templates?.forEach((templateId) => addTriggeredItemPack(triggeredItemPacks, triggeredItemPackSources, templateId, 'floor_usage'))
    rule.itemPacks?.forEach((itemPackCode) => addTriggeredItemPack(triggeredItemPacks, triggeredItemPackSources, itemPackCode, 'floor_usage'))
    rule.milestones?.forEach((milestoneCode) => triggeredMilestones.add(milestoneCode))
    rule.dangerItems?.forEach((dangerCode) => triggeredDangerItems.add(dangerCode))
    rule.suppressionRules?.forEach((suppressionCode) => suppressionRules.add(suppressionCode))
    rationale.push(rule.rationale)
  }

  // Scope assignment rules
  const scopeRules = getScopeAssignmentRules(facts.businessType)

  // Expected row counts based on building count and detail level
  const baseCount = rec.templateCountHint * facts.buildingCount
  const masterPlanProfile = buildMasterPlanProfile(facts)
  const expectedRowCount = {
    overview: Math.max(masterPlanProfile.rowCountRange[0], Math.round(baseCount * 0.4)),
    standard: Math.max(masterPlanProfile.rowCountRange[1], Math.round(baseCount * 1.0)),
    detailed: Math.max(masterPlanProfile.rowCountRange[1], Math.round(baseCount * 3.2)),
  }

  return {
    businessType: facts.businessType,
    label: rec.label,
    matchedTemplates: [...triggeredItemPacks].sort(),
    triggeredItemPacks: [...triggeredItemPacks].sort(),
    triggeredItemPackSources: serializeTriggeredItemPackSources(triggeredItemPackSources),
    triggeredItemPackScopeTargets: serializeTriggeredItemPackScopeTargets(triggeredItemPackScopeTargets),
    triggeredMilestones: [...triggeredMilestones].sort(),
    triggeredDangerItems: [...triggeredDangerItems].sort(),
    suppressionRules: [...suppressionRules].sort(),
    scopeAssignmentRules: scopeRules,
    expectedRowCount,
    defaultPlanOutput: 'master_plan',
    masterPlanProfile,
    foundationMethodCandidates,
    projectOrganizationPolicyId: projectOrganizationPolicy.policyId,
    projectOrganizationVariantCode: projectOrganizationPolicy.variantCode,
    buildingPatternScheduleTrust: scenarioProfile.buildingPatternScheduleTrust,
    recommendationRationale: rationale,
  }
}

export function getDetailLevelFilter(level: DetailLevel): string[] {
  return DETAIL_LEVEL_FILTER[level]
}
