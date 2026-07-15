import type { ProjectGenerationFacts } from './projectFactsToTemplateService.js'

export type ProjectGenerationFactsSnapshot = Partial<Omit<ProjectGenerationFacts, 'scopeTree'>>

const SNAPSHOT_ARRAY_FIELDS = new Set([
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
])

const SNAPSHOT_NUMBER_FIELDS = new Set([
  'buildingCount',
  'totalAreaM2',
  'aboveGroundAreaM2',
  'basementAreaM2',
  'siteAreaM2',
  'standardFloorCount',
  'highestBuildingFloorCount',
  'basementLevelCount',
  'foundationDepthM',
  'prefabRate',
  'maxSpanM',
  'supportHeightM',
  'towerCraneCount',
  'constructionHoistCount',
])

const SNAPSHOT_BOOLEAN_FIELDS = new Set([
  'hasCivilDefense',
])

const SNAPSHOT_RECORD_FIELDS = new Set([
  'projectFeatures',
  'locationFacts',
  'scopeOrganizationFacts',
  'onboardingPhaseProgress',
])

const SNAPSHOT_TEXT_FIELDS = new Set([
  'businessType',
  'businessSubtype',
  'detailLevel',
  'plannedEndDate',
  'structureTypeCode',
  'planScopeCaliber',
  'deliveryStandard',
  'terminalEvent',
  'onboardingMode',
  'onboardingSubstage',
])

const SNAPSHOT_FIELD_ALIASES: Record<string, string[]> = {
  businessType: ['businessType', 'business_type', 'businessTypeCode', 'business_type_code', 'projectTypeCode', 'project_type_code'],
  businessSubtype: ['businessSubtype', 'business_subtype', 'businessSubtypeCode', 'business_subtype_code'],
  methodVariantCodes: ['methodVariantCodes', 'method_variant_codes'],
  planScopeCaliber: ['planScopeCaliber', 'plan_scope_caliber'],
  deliveryStandard: ['deliveryStandard', 'delivery_standard'],
  terminalEvent: ['terminalEvent', 'terminal_event'],
  prefabSystemCodes: ['prefabSystemCodes', 'prefab_system_codes'],
  elementVariantCodes: ['elementVariantCodes', 'element_variant_codes'],
  externalInterfaceCodes: ['externalInterfaceCodes', 'external_interface_codes'],
  hardConstraintCodes: ['hardConstraintCodes', 'hard_constraint_codes'],
  projectFeatures: ['projectFeatures', 'project_features'],
  detailLevel: ['detailLevel', 'detail_level'],
  plannedEndDate: ['plannedEndDate', 'planned_end_date', 'projectPlannedEndDate', 'project_planned_end_date'],
  buildingCount: ['buildingCount', 'building_count'],
  totalAreaM2: ['totalAreaM2', 'total_area_m2', 'totalArea', 'total_area'],
  aboveGroundAreaM2: ['aboveGroundAreaM2', 'above_ground_area_m2'],
  basementAreaM2: ['basementAreaM2', 'basement_area_m2'],
  siteAreaM2: ['siteAreaM2', 'site_area_m2'],
  structureTypeCode: ['structureTypeCode', 'structure_type_code'],
  standardFloorCount: ['standardFloorCount', 'standard_floor_count'],
  highestBuildingFloorCount: ['highestBuildingFloorCount', 'highest_building_floor_count', 'floorCount', 'floor_count'],
  basementLevelCount: ['basementLevelCount', 'basement_level_count'],
  foundationDepthM: ['foundationDepthM', 'foundation_depth_m', 'deepFoundationPitDepthM', 'deep_foundation_pit_depth_m', 'pitDepthM', 'pit_depth_m'],
  prefabRate: ['prefabRate', 'prefab_rate', 'assemblyRate', 'assembly_rate'],
  maxSpanM: ['maxSpanM', 'max_span_m', 'maxSpan', 'max_span'],
  supportHeightM: ['supportHeightM', 'support_height_m', 'templateSupportHeightM', 'template_support_height_m'],
  hasCivilDefense: ['hasCivilDefense', 'has_civil_defense'],
  towerCraneCount: ['towerCraneCount', 'tower_crane_count'],
  constructionHoistCount: ['constructionHoistCount', 'construction_hoist_count'],
  buildingPatternCodes: ['buildingPatternCodes', 'building_pattern_codes'],
  functionalUsageCodes: ['functionalUsageCodes', 'functional_usage_codes'],
  floorUsageCodes: ['floorUsageCodes', 'floor_usage_codes'],
  functionalCategoryCodes: ['functionalCategoryCodes', 'functional_category_codes'],
  specialRoomTypeCodes: ['specialRoomTypeCodes', 'special_room_type_codes'],
  physicalZoneTypeCodes: ['physicalZoneTypeCodes', 'physical_zone_type_codes'],
  climateSignals: ['climateSignals', 'climate_signals'],
  weatherImpactBands: ['weatherImpactBands', 'weather_impact_bands'],
  locationFacts: ['locationFacts', 'location_facts', 'wizard_location_facts'],
  scopeOrganizationFacts: ['scopeOrganizationFacts', 'scope_organization_facts'],
  onboardingMode: ['onboardingMode', 'onboarding_mode'],
  onboardingSubstage: ['onboardingSubstage', 'onboarding_substage'],
  onboardingPassedMilestones: ['onboardingPassedMilestones', 'onboarding_passed_milestones'],
  onboardingPhaseProgress: ['onboardingPhaseProgress', 'onboarding_phase_progress'],
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

function readFirstValue(source: Record<string, unknown>, aliases: string[]) {
  for (const alias of aliases) {
    if (source[alias] !== undefined && source[alias] !== null) return source[alias]
  }
  return undefined
}

function normalizeTextValue(value: unknown) {
  const text = normalizeText(value)
  return text || undefined
}

function normalizeNumberValue(value: unknown) {
  if (value === null || value === undefined || value === '') return undefined
  const number = Number(value)
  return Number.isFinite(number) ? number : undefined
}

function normalizeBooleanValue(value: unknown) {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value !== 0
  const text = normalizeText(value).toLowerCase()
  if (!text) return undefined
  if (['true', '1', 'yes', 'y'].includes(text)) return true
  if (['false', '0', 'no', 'n'].includes(text)) return false
  return undefined
}

function normalizeStringArray(value: unknown) {
  const rawValues = Array.isArray(value) ? value : [value]
  const normalized = rawValues.map(normalizeTextValue).filter((item): item is string => Boolean(item))
  return Array.from(new Set(normalized))
}

export function buildProjectGenerationFactsSnapshot(sourceInput: unknown): ProjectGenerationFactsSnapshot {
  const source = readRecord(sourceInput)
  const snapshot: Record<string, unknown> = {}

  for (const [field, aliases] of Object.entries(SNAPSHOT_FIELD_ALIASES)) {
    const value = readFirstValue(source, aliases)
    if (value === undefined) continue
    if (SNAPSHOT_ARRAY_FIELDS.has(field)) {
      const arrayValue = normalizeStringArray(value)
      if (arrayValue.length > 0) snapshot[field] = arrayValue
      continue
    }
    if (SNAPSHOT_NUMBER_FIELDS.has(field)) {
      const numberValue = normalizeNumberValue(value)
      if (numberValue !== undefined) snapshot[field] = numberValue
      continue
    }
    if (SNAPSHOT_BOOLEAN_FIELDS.has(field)) {
      const booleanValue = normalizeBooleanValue(value)
      if (booleanValue !== undefined) snapshot[field] = booleanValue
      continue
    }
    if (SNAPSHOT_TEXT_FIELDS.has(field)) {
      const textValue = normalizeTextValue(value)
      if (textValue) snapshot[field] = textValue
      continue
    }
    if (SNAPSHOT_RECORD_FIELDS.has(field)) {
      const recordValue = readRecord(value)
      if (Object.keys(recordValue).length > 0) snapshot[field] = recordValue
    }
  }

  return snapshot as ProjectGenerationFactsSnapshot
}

export function readProjectGenerationFactsSnapshot(...sources: unknown[]): ProjectGenerationFactsSnapshot {
  for (const sourceInput of sources) {
    const source = readRecord(sourceInput)
    const nested = buildProjectGenerationFactsSnapshot(source.projectGenerationFacts ?? source.project_generation_facts)
    if (Object.keys(nested).length > 0) return nested
    const direct = buildProjectGenerationFactsSnapshot(source)
    if (Object.keys(direct).length > 0) return direct
  }
  return {}
}
