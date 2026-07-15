import { logger } from '../middleware/logger.js'
import { supabase } from './dbService.js'
import {
  buildProjectGenerationFactsSnapshot,
  type ProjectGenerationFactsSnapshot,
} from './projectGenerationFactsSnapshotService.js'
import { buildScopeOrganizationFactsFromObjects } from './scopeOrganizationFactsService.js'
import type { ConstructionOrganizationScenarioSelection } from './constructionOrganizationScenarioSelector.js'
import type { T2RhythmScheduleCandidatePackage } from './t2DivisionRhythmTemplateRegistryService.js'
import {
  buildT2RhythmProductionCapacityEvidence,
  type T2RhythmProductionCapacityEvidence,
} from './t2RhythmProductionCapacityEvidenceService.js'
import type { T2RhythmScheduleCandidateNetwork } from './t2RhythmScheduleCandidateNetworkService.js'
import type { T2RhythmScheduleCandidateNetworkPhase1Evaluation } from './t2RhythmScheduleCandidateNetworkEvaluationService.js'
import type { T2RhythmSchedulePhase1Selection } from './t2RhythmSchedulePhase1SelectionService.js'
import type { T2RhythmStandardLibraryTrustGate } from './t2RhythmStandardLibraryTrustGateService.js'
import type { ConstructionCalendarContext } from './constructionCalendar.js'

const FORECAST_LIVE_REREAD_FIELDS = new Set([
  'businessType',
  'businessSubtype',
  'planScopeCaliber',
  'deliveryStandard',
  'terminalEvent',
  'structureTypeCode',
  'methodVariantCodes',
  'prefabSystemCodes',
  'elementVariantCodes',
  'externalInterfaceCodes',
  'hardConstraintCodes',
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
  'hasCivilDefense',
  'towerCraneCount',
  'constructionHoistCount',
  'buildingPatternCodes',
  'functionalUsageCodes',
  'floorUsageCodes',
  'functionalCategoryCodes',
  'specialRoomTypeCodes',
  'physicalZoneTypeCodes',
  'climateSignals',
  'weatherImpactBands',
  'locationFacts',
  'scopeOrganizationFacts',
  'onboardingMode',
  'onboardingSubstage',
  'onboardingPassedMilestones',
  'onboardingPhaseProgress',
  'projectFeatures',
])

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function normalizeFeatureCode(value: unknown, aliases: Record<string, string> = {}) {
  const raw = normalizeText(value)
  if (!raw) return null
  const lower = raw.toLowerCase()
  return aliases[lower] ?? aliases[raw] ?? lower.replace(/\s+/g, '_')
}

function firstText(...values: unknown[]) {
  for (const value of values) {
    const text = normalizeText(value)
    if (text) return text
  }
  return null
}

function firstNumber(...values: unknown[]) {
  for (const value of values) {
    if (value === null || value === undefined || value === '') continue
    const number = Number(value)
    if (Number.isFinite(number)) return number
  }
  return null
}

function readPositiveInteger(...values: unknown[]) {
  const number = firstNumber(...values)
  return number && number > 0 ? Math.floor(number) : null
}

function readStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeText(item)).filter(Boolean)
  }
  const text = normalizeText(value)
  return text ? text.split(/[,\s]+/).map((item) => item.trim()).filter(Boolean) : []
}

function readArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.map((item) => normalizeText(item)).filter(Boolean))]
}

function maxNumberFromRecords(records: Record<string, unknown>[], keys: string[]) {
  const values = records
    .flatMap((record) => keys.map((key) => firstNumber(record[key])))
    .filter((value): value is number => value !== null)
  return values.length > 0 ? Math.max(...values) : null
}

function firstNumberFromRecords(records: Record<string, unknown>[], keys: string[]) {
  for (const record of records) {
    const value = firstNumber(...keys.map((key) => record[key]))
    if (value !== null) return value
  }
  return null
}

function readBooleanFromRecords(records: Record<string, unknown>[], keys: string[]) {
  return records.some((record) => keys.some((key) => {
    const value = record[key]
    if (typeof value === 'boolean') return value
    if (typeof value === 'number') return value !== 0
    const text = normalizeText(value).toLowerCase()
    return ['true', '1', 'yes', 'y'].includes(text)
  }))
}

function normalizeProjectTypeCode(value: unknown) {
  return normalizeFeatureCode(value, {
    housing: 'residential',
    residential: 'residential',
    apartment: 'residential',
    commercial: 'commercial',
    office: 'commercial',
    hospital: 'hospital',
    medical: 'hospital',
    school: 'school',
    campus: 'school',
    industrial: 'industrial',
    factory: 'industrial',
    data_center: 'data_center',
    idc: 'data_center',
    modular: 'modular_building',
    mic: 'modular_building',
  })
}

function normalizeStructureTypeCode(value: unknown) {
  return normalizeFeatureCode(value, {
    shear_wall: 'shear_wall',
    frame: 'frame',
    frame_shear_wall: 'frame_shear_wall',
    steel: 'steel_structure',
    steel_structure: 'steel_structure',
    prefab: 'prefabricated_concrete',
    prefabricated: 'prefabricated_concrete',
    prefabricated_concrete: 'prefabricated_concrete',
    prefabricated_steel: 'prefabricated_steel',
  })
}

function compactFacts(source: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(source).filter(([, value]) => {
      if (value === null || value === undefined || value === '') return false
      if (Array.isArray(value)) return value.length > 0
      if (typeof value === 'object') return Object.keys(readRecord(value)).length > 0
      return true
    }),
  )
}

function inferProjectGenerationFactsFromProjectState(
  projectRow: Record<string, unknown>,
  engineeringObjectRows: Array<Record<string, unknown>>,
): ProjectGenerationFactsSnapshot {
  const metadata = readRecord(projectRow.metadata)
  const existingFacts = buildProjectGenerationFactsSnapshot(
    metadata.projectGenerationFacts ?? metadata.project_generation_facts,
  )
  const activeObjects = engineeringObjectRows.filter((object) => normalizeText(object.status || 'active') === 'active')
  const objectMetadata = activeObjects.map((object) => readRecord(object.metadata))
  const allMetadata = [metadata, ...objectMetadata]
  const scopeOrganizationObjects = activeObjects.map((object) => ({
    id: object.id,
    type: object.object_type,
    metadata: readRecord(object.metadata),
  }))
  const scopeOrganizationFacts = buildScopeOrganizationFactsFromObjects(scopeOrganizationObjects, {
    explicitFacts: existingFacts.scopeOrganizationFacts,
    source: 'engineering_objects',
  })
  const buildingObjects = activeObjects.filter((object) => normalizeText(object.object_type) === 'building')
  const basementObjects = activeObjects.filter((object) => normalizeText(object.object_type) === 'basement')
  const floorObjects = activeObjects.filter((object) => normalizeText(object.object_type) === 'floor')

  const businessType = normalizeProjectTypeCode(firstText(
    metadata.businessType,
    metadata.business_type,
    metadata.businessTypeCode,
    metadata.business_type_code,
    metadata.projectTypeCode,
    metadata.project_type_code,
    projectRow.project_type,
    projectRow.building_type,
  ))
  const structureTypeCode = normalizeStructureTypeCode(firstText(
    metadata.structureTypeCode,
    metadata.structure_type_code,
    projectRow.structure_type,
    ...objectMetadata.flatMap((item) => [
      item.structureTypeCode,
      item.structure_type_code,
      item.structureSystem,
      item.structure_system,
    ]),
  ))
  const buildingCount = readPositiveInteger(
    metadata.buildingCount,
    metadata.building_count,
    projectRow.building_count,
  ) ?? (buildingObjects.length > 0 ? buildingObjects.length : null)
  const standardFloorCount = readPositiveInteger(
    metadata.standardFloorCount,
    metadata.standard_floor_count,
    projectRow.above_ground_floors,
  ) ?? maxNumberFromRecords(allMetadata, [
    'standardFloorCount',
    'standard_floor_count',
    'aboveGroundFloors',
    'above_ground_floors',
    'floorCount',
    'floor_count',
    'totalFloors',
    'total_floors',
  ]) ?? (floorObjects.length > 0 ? floorObjects.length : null)
  const basementLevelCount = readPositiveInteger(
    metadata.basementLevelCount,
    metadata.basement_level_count,
    projectRow.underground_floors,
  ) ?? maxNumberFromRecords(allMetadata, [
    'basementLevelCount',
    'basement_level_count',
    'undergroundFloors',
    'underground_floors',
  ]) ?? (basementObjects.length > 0 ? basementObjects.length : null)

  const inferred = compactFacts({
    businessType,
    businessSubtype: firstText(metadata.businessSubtype, metadata.business_subtype),
    planScopeCaliber: firstText(metadata.planScopeCaliber, metadata.plan_scope_caliber),
    deliveryStandard: firstText(metadata.deliveryStandard, metadata.delivery_standard),
    terminalEvent: firstText(metadata.terminalEvent, metadata.terminal_event),
    detailLevel: firstText(metadata.detailLevel, metadata.detail_level),
    totalAreaM2: firstNumber(
      metadata.totalAreaM2,
      metadata.total_area_m2,
      projectRow.total_area,
      projectRow.totalArea,
    ),
    buildingCount,
    standardFloorCount,
    highestBuildingFloorCount: readPositiveInteger(
      metadata.highestBuildingFloorCount,
      metadata.highest_building_floor_count,
    ) ?? standardFloorCount,
    basementLevelCount,
    basementAreaM2: firstNumberFromRecords(allMetadata, ['basementAreaM2', 'basement_area_m2']),
    aboveGroundAreaM2: firstNumberFromRecords(allMetadata, ['aboveGroundAreaM2', 'above_ground_area_m2']),
    siteAreaM2: firstNumberFromRecords(allMetadata, ['siteAreaM2', 'site_area_m2']),
    foundationDepthM: maxNumberFromRecords(allMetadata, ['foundationDepthM', 'foundation_depth_m', 'foundationDepth', 'foundation_depth']),
    prefabRate: maxNumberFromRecords(allMetadata, ['prefabRate', 'prefab_rate', 'assemblyRate', 'assembly_rate']),
    maxSpanM: maxNumberFromRecords(allMetadata, ['maxSpanM', 'max_span_m', 'maxSpan', 'max_span']),
    supportHeightM: maxNumberFromRecords(allMetadata, ['supportHeightM', 'support_height_m', 'templateSupportHeightM', 'template_support_height_m']),
    towerCraneCount: maxNumberFromRecords(allMetadata, ['towerCraneCount', 'tower_crane_count']),
    constructionHoistCount: maxNumberFromRecords(allMetadata, ['constructionHoistCount', 'construction_hoist_count']),
    hasCivilDefense: readBooleanFromRecords(allMetadata, ['hasCivilDefense', 'has_civil_defense']),
    structureTypeCode,
    methodVariantCodes: uniqueStrings(allMetadata.flatMap((item) => [
      ...readStringArray(item.methodVariantCodes),
      ...readStringArray(item.method_variant_codes),
      ...readStringArray(item.mainMethodCodes),
      ...readStringArray(item.main_method_codes),
    ])),
    prefabSystemCodes: uniqueStrings(allMetadata.flatMap((item) => [
      ...readStringArray(item.prefabSystemCodes),
      ...readStringArray(item.prefab_system_codes),
    ])),
    elementVariantCodes: uniqueStrings(allMetadata.flatMap((item) => [
      ...readStringArray(item.elementVariantCodes),
      ...readStringArray(item.element_variant_codes),
      ...readStringArray(item.componentTypeCodes),
      ...readStringArray(item.component_type_codes),
    ])),
    externalInterfaceCodes: uniqueStrings(allMetadata.flatMap((item) => [
      ...readStringArray(item.externalInterfaceCodes),
      ...readStringArray(item.external_interface_codes),
    ])),
    hardConstraintCodes: uniqueStrings(allMetadata.flatMap((item) => [
      ...readStringArray(item.hardConstraintCodes),
      ...readStringArray(item.hard_constraint_codes),
    ])),
    buildingPatternCodes: uniqueStrings(allMetadata.flatMap((item) => [
      ...readStringArray(item.buildingPatternCodes),
      ...readStringArray(item.building_pattern_codes),
    ])),
    functionalUsageCodes: uniqueStrings(allMetadata.flatMap((item) => [
      ...readStringArray(item.functionalUsageCodes),
      ...readStringArray(item.functional_usage_codes),
      ...readStringArray(item.functionalUsage),
      ...readStringArray(item.functional_usage),
    ])),
    floorUsageCodes: uniqueStrings(allMetadata.flatMap((item) => [
      ...readStringArray(item.floorUsageCodes),
      ...readStringArray(item.floor_usage_codes),
      ...readStringArray(item.floorUsage),
      ...readStringArray(item.floor_usage),
    ])),
    functionalCategoryCodes: uniqueStrings(allMetadata.flatMap((item) => [
      ...readStringArray(item.functionalCategoryCodes),
      ...readStringArray(item.functional_category_codes),
      ...readStringArray(item.functionalCategory),
      ...readStringArray(item.functional_category),
    ])),
    specialRoomTypeCodes: uniqueStrings(allMetadata.flatMap((item) => [
      ...readStringArray(item.specialRoomTypeCodes),
      ...readStringArray(item.special_room_type_codes),
      ...readStringArray(item.specialRoomType),
      ...readStringArray(item.special_room_type),
    ])),
    physicalZoneTypeCodes: uniqueStrings(allMetadata.flatMap((item) => [
      ...readStringArray(item.physicalZoneTypeCodes),
      ...readStringArray(item.physical_zone_type_codes),
      ...readStringArray(item.physicalCategory),
      ...readStringArray(item.physical_category),
    ])),
    projectFeatures: {
      ...readRecord(existingFacts.projectFeatures),
      ...readRecord(metadata.projectFeatures ?? metadata.project_features),
    },
    climateSignals: uniqueStrings([
      ...readStringArray(existingFacts.climateSignals),
      ...readStringArray(metadata.climateSignals),
      ...readStringArray(metadata.climate_signals),
      ...readStringArray(readRecord(existingFacts.locationFacts).climateSignals),
      ...readStringArray(readRecord(metadata.locationFacts ?? metadata.location_facts).climateSignals),
      ...readStringArray(readRecord(metadata.wizard_location_facts).climateSignals),
    ]),
    weatherImpactBands: uniqueStrings([
      ...readStringArray(existingFacts.weatherImpactBands),
      ...readStringArray(metadata.weatherImpactBands),
      ...readStringArray(metadata.weather_impact_bands),
      ...readStringArray(readRecord(existingFacts.locationFacts).weatherImpactBands),
      ...readStringArray(readRecord(metadata.locationFacts ?? metadata.location_facts).weatherImpactBands),
      ...readStringArray(readRecord(metadata.wizard_location_facts).weatherImpactBands),
    ]),
    locationFacts: {
      ...readRecord(existingFacts.locationFacts),
      ...readRecord(metadata.locationFacts ?? metadata.location_facts),
      ...readRecord(metadata.wizard_location_facts),
    },
    scopeOrganizationFacts,
  })

  return buildProjectGenerationFactsSnapshot({
    ...existingFacts,
    ...inferred,
  })
}

function readProjectRowFacts(row: Record<string, unknown> | null): ProjectGenerationFactsSnapshot {
  if (!row) return {}
  const metadata = readRecord(row.metadata)
  return buildProjectGenerationFactsSnapshot(
    metadata.projectGenerationFacts
      ?? metadata.project_generation_facts
      ?? row.projectGenerationFacts
      ?? row.project_generation_facts,
  )
}

function readProjectRowConstructionOrganizationScenario(
  row: Record<string, unknown> | null,
): ConstructionOrganizationScenarioSelection | null {
  if (!row) return null
  const metadata = readRecord(row.metadata)
  const scenario = readRecord(
    metadata.constructionOrganizationScenario
      ?? metadata.construction_organization_scenario,
  )
  return scenario.source === 'construction_organization_scenario_selector'
    ? scenario as unknown as ConstructionOrganizationScenarioSelection
    : null
}

function readProjectRowT2RhythmScheduleCandidatePackage(
  row: Record<string, unknown> | null,
): T2RhythmScheduleCandidatePackage | null {
  if (!row) return null
  const metadata = readRecord(row.metadata)
  const candidatePackage = readRecord(
    metadata.t2RhythmScheduleCandidatePackage
      ?? metadata.t2_rhythm_schedule_candidate_package,
  )
  return candidatePackage.source === 't2_division_rhythm_schedule_candidate_package'
    ? candidatePackage as unknown as T2RhythmScheduleCandidatePackage
    : null
}

function readProjectRowT2RhythmProductionCapacityEvidence(
  row: Record<string, unknown> | null,
): T2RhythmProductionCapacityEvidence | null {
  if (!row) return null
  const metadata = readRecord(row.metadata)
  const capacityEvidence = readRecord(
    metadata.t2RhythmProductionCapacityEvidence
      ?? metadata.t2_rhythm_production_capacity_evidence,
  )
  return capacityEvidence.source === 't2_rhythm_production_capacity_evidence'
    ? capacityEvidence as unknown as T2RhythmProductionCapacityEvidence
    : deriveProjectRowT2RhythmProductionCapacityEvidence(row)
}

function readProjectRowResourceSidecar(row: Record<string, unknown>): Record<string, unknown> | null {
  const metadata = readRecord(row.metadata)
  const sidecar = readRecord(
    metadata.resourceSidecar
      ?? metadata.resource_sidecar
      ?? metadata.productionResourceSidecar
      ?? metadata.production_resource_sidecar
      ?? metadata.scheduleResourceSidecar
      ?? metadata.schedule_resource_sidecar
      ?? readRecord(metadata.projectGenerationFacts ?? metadata.project_generation_facts).resourceSidecar
      ?? readRecord(metadata.projectGenerationFacts ?? metadata.project_generation_facts).resource_sidecar,
  )
  return Object.keys(sidecar).length > 0 ? sidecar : null
}

function readProjectRowConstructionRhythmExpansion(row: Record<string, unknown>) {
  const metadata = readRecord(row.metadata)
  const expansion = readRecord(
    metadata.constructionRhythmExpansion
      ?? metadata.construction_rhythm_expansion
      ?? metadata.constructionRhythmExpansionResult
      ?? metadata.construction_rhythm_expansion_result
      ?? readRecord(metadata.projectGenerationFacts ?? metadata.project_generation_facts).constructionRhythmExpansion
      ?? readRecord(metadata.projectGenerationFacts ?? metadata.project_generation_facts).construction_rhythm_expansion,
  )
  if (Object.keys(expansion).length === 0) return null
  return {
    workfaceCandidateCount: firstNumber(
      expansion.workfaceCandidateCount,
      expansion.workface_candidate_count,
      expansion.constructionRhythmWorkfaceCandidateCount,
      readRecord(expansion.metrics).constructionRhythmWorkfaceCandidateCount,
    ),
    dominantRhythmUnits: uniqueStrings([
      ...readStringArray(expansion.dominantRhythmUnits),
      ...readStringArray(expansion.dominant_rhythm_units),
    ]),
    candidates: readArray(expansion.candidates).map((candidate) => {
      const record = readRecord(candidate)
      return {
        backendConsumable: typeof record.backendConsumable === 'boolean'
          ? record.backendConsumable
          : typeof record.backend_consumable === 'boolean' ? record.backend_consumable : undefined,
        workfaceCount: firstNumber(record.workfaceCount, record.workface_count),
        workfaceKeys: [
          ...readStringArray(record.workfaceKeys),
          ...readStringArray(record.workface_keys),
        ],
      }
    }),
  }
}

function readProjectRowConstructionCalendar(row: Record<string, unknown>): ConstructionCalendarContext | null {
  const metadata = readRecord(row.metadata)
  const calendar = readRecord(
    metadata.constructionCalendar
      ?? metadata.construction_calendar
      ?? metadata.constructionCalendarContext
      ?? metadata.construction_calendar_context
      ?? readRecord(metadata.projectGenerationFacts ?? metadata.project_generation_facts).constructionCalendar
      ?? readRecord(metadata.projectGenerationFacts ?? metadata.project_generation_facts).construction_calendar,
  )
  const basis = normalizeText(calendar.basis)
  if (!basis) return null
  return {
    basis: basis === 'official_construction_calendar_seed'
      ? 'official_construction_calendar_seed'
      : 'calendar_day',
    windows: readArray(calendar.windows) as ConstructionCalendarContext['windows'],
  }
}

function deriveProjectRowT2RhythmProductionCapacityEvidence(
  row: Record<string, unknown>,
): T2RhythmProductionCapacityEvidence | null {
  const resourceSidecar = readProjectRowResourceSidecar(row)
  const constructionRhythmExpansion = readProjectRowConstructionRhythmExpansion(row)
  const constructionCalendar = readProjectRowConstructionCalendar(row)
  if (!resourceSidecar && !constructionRhythmExpansion && !constructionCalendar) return null
  return buildT2RhythmProductionCapacityEvidence({
    resourceSidecar,
    constructionRhythmExpansion,
    constructionCalendar,
  })
}

function readProjectRowT2RhythmScheduleCandidateNetwork(
  row: Record<string, unknown> | null,
): T2RhythmScheduleCandidateNetwork | null {
  if (!row) return null
  const metadata = readRecord(row.metadata)
  const candidateNetwork = readRecord(
    metadata.t2RhythmScheduleCandidateNetwork
      ?? metadata.t2_rhythm_schedule_candidate_network,
  )
  return candidateNetwork.source === 't2_rhythm_schedule_candidate_network'
    ? candidateNetwork as unknown as T2RhythmScheduleCandidateNetwork
    : null
}

function readProjectRowT2RhythmScheduleCandidateNetworkEvaluation(
  row: Record<string, unknown> | null,
): T2RhythmScheduleCandidateNetworkPhase1Evaluation | null {
  if (!row) return null
  const metadata = readRecord(row.metadata)
  const evaluation = readRecord(
    metadata.t2RhythmScheduleCandidateNetworkEvaluation
      ?? metadata.t2_rhythm_schedule_candidate_network_evaluation
      ?? metadata.t2_rhythm_schedule_candidate_network_phase1_evaluation,
  )
  return evaluation.source === 't2_rhythm_schedule_candidate_network_phase1_evaluation'
    ? evaluation as unknown as T2RhythmScheduleCandidateNetworkPhase1Evaluation
    : null
}

function readProjectRowT2RhythmSchedulePhase1Selection(
  row: Record<string, unknown> | null,
): T2RhythmSchedulePhase1Selection | null {
  if (!row) return null
  const metadata = readRecord(row.metadata)
  const selection = readRecord(
    metadata.t2RhythmSchedulePhase1Selection
      ?? metadata.t2_rhythm_schedule_phase1_selection,
  )
  return selection.source === 't2_rhythm_schedule_phase1_selection'
    ? selection as unknown as T2RhythmSchedulePhase1Selection
    : null
}

function readProjectRowT2RhythmStandardLibraryTrustGate(
  row: Record<string, unknown> | null,
): T2RhythmStandardLibraryTrustGate | null {
  if (!row) return null
  const metadata = readRecord(row.metadata)
  const trustGate = readRecord(
    metadata.t2RhythmStandardLibraryTrustGate
      ?? metadata.t2_rhythm_standard_library_trust_gate
      ?? metadata.t2_rhythm_standard_library_live_replay_trust_gate,
  )
  return trustGate.source === 't2_rhythm_standard_library_live_replay_trust_gate'
    ? trustGate as unknown as T2RhythmStandardLibraryTrustGate
    : null
}

export function mergeLiveProjectGenerationFactsForForecast(
  frozenFactsInput: unknown,
  liveFactsInput: unknown,
): ProjectGenerationFactsSnapshot {
  const frozenFacts = buildProjectGenerationFactsSnapshot(frozenFactsInput)
  const liveFacts = buildProjectGenerationFactsSnapshot(liveFactsInput)
  const allowedLiveFacts = Object.fromEntries(
    Object.entries(liveFacts).filter(([key]) => FORECAST_LIVE_REREAD_FIELDS.has(key)),
  )

  return buildProjectGenerationFactsSnapshot({
    ...frozenFacts,
    ...allowedLiveFacts,
  })
}

export async function readLiveProjectGenerationFacts(projectId: string | null | undefined): Promise<ProjectGenerationFactsSnapshot> {
  const normalizedProjectId = normalizeText(projectId)
  if (!normalizedProjectId) return {}

  const { data, error } = await (supabase as any)
    .from('projects')
    .select('id, metadata')
    .eq('id', normalizedProjectId)
    .maybeSingle()

  if (error) {
    logger.warn('[projectGenerationFactsStoreService] failed to read project generation facts', {
      projectId: normalizedProjectId,
      error,
    })
    return {}
  }

  return readProjectRowFacts(readRecord(data))
}

export async function readLiveProjectGenerationContext(projectId: string | null | undefined): Promise<{
  projectGenerationFacts: ProjectGenerationFactsSnapshot
  constructionOrganizationScenario: ConstructionOrganizationScenarioSelection | null
  t2RhythmScheduleCandidatePackage: T2RhythmScheduleCandidatePackage | null
  t2RhythmProductionCapacityEvidence: T2RhythmProductionCapacityEvidence | null
  t2RhythmScheduleCandidateNetwork: T2RhythmScheduleCandidateNetwork | null
  t2RhythmScheduleCandidateNetworkEvaluation: T2RhythmScheduleCandidateNetworkPhase1Evaluation | null
  t2RhythmSchedulePhase1Selection: T2RhythmSchedulePhase1Selection | null
  t2RhythmStandardLibraryTrustGate: T2RhythmStandardLibraryTrustGate | null
}> {
  const normalizedProjectId = normalizeText(projectId)
  if (!normalizedProjectId) {
    return {
      projectGenerationFacts: {},
      constructionOrganizationScenario: null,
      t2RhythmScheduleCandidatePackage: null,
      t2RhythmProductionCapacityEvidence: null,
      t2RhythmScheduleCandidateNetwork: null,
      t2RhythmScheduleCandidateNetworkEvaluation: null,
      t2RhythmSchedulePhase1Selection: null,
      t2RhythmStandardLibraryTrustGate: null,
    }
  }

  const { data, error } = await (supabase as any)
    .from('projects')
    .select('id, metadata')
    .eq('id', normalizedProjectId)
    .maybeSingle()

  if (error) {
    logger.warn('[projectGenerationFactsStoreService] failed to read project generation context', {
      projectId: normalizedProjectId,
      error,
    })
    return {
      projectGenerationFacts: {},
      constructionOrganizationScenario: null,
      t2RhythmScheduleCandidatePackage: null,
      t2RhythmProductionCapacityEvidence: null,
      t2RhythmScheduleCandidateNetwork: null,
      t2RhythmScheduleCandidateNetworkEvaluation: null,
      t2RhythmSchedulePhase1Selection: null,
      t2RhythmStandardLibraryTrustGate: null,
    }
  }

  const row = readRecord(data)
  return {
    projectGenerationFacts: readProjectRowFacts(row),
    constructionOrganizationScenario: readProjectRowConstructionOrganizationScenario(row),
    t2RhythmScheduleCandidatePackage: readProjectRowT2RhythmScheduleCandidatePackage(row),
    t2RhythmProductionCapacityEvidence: readProjectRowT2RhythmProductionCapacityEvidence(row),
    t2RhythmScheduleCandidateNetwork: readProjectRowT2RhythmScheduleCandidateNetwork(row),
    t2RhythmScheduleCandidateNetworkEvaluation: readProjectRowT2RhythmScheduleCandidateNetworkEvaluation(row),
    t2RhythmSchedulePhase1Selection: readProjectRowT2RhythmSchedulePhase1Selection(row),
    t2RhythmStandardLibraryTrustGate: readProjectRowT2RhythmStandardLibraryTrustGate(row),
  }
}

export async function persistProjectGenerationFactsSnapshot(params: {
  projectId: string | null | undefined
  facts: unknown
  source?: string | null
}): Promise<ProjectGenerationFactsSnapshot> {
  const projectId = normalizeText(params.projectId)
  const snapshot = buildProjectGenerationFactsSnapshot(params.facts)
  if (!projectId || Object.keys(snapshot).length === 0) return snapshot
  if (projectId === 'wizard-preview' || projectId.startsWith('wizard-preview:')) return snapshot

  const { data, error } = await (supabase as any)
    .from('projects')
    .select('id, metadata')
    .eq('id', projectId)
    .maybeSingle()

  if (error) {
    logger.warn('[projectGenerationFactsStoreService] failed to load project metadata before persisting facts', {
      projectId,
      source: params.source ?? null,
      error,
    })
    return snapshot
  }

  const metadata = {
    ...readRecord(readRecord(data).metadata),
    projectGenerationFacts: snapshot,
    projectGenerationFactsSource: params.source ?? 'project_generation',
    projectGenerationFactsUpdatedAt: new Date().toISOString(),
  }

  const { error: updateError } = await (supabase as any)
    .from('projects')
    .update({ metadata })
    .eq('id', projectId)

  if (updateError) {
    logger.warn('[projectGenerationFactsStoreService] failed to persist project generation facts', {
      projectId,
      source: params.source ?? null,
      error: updateError,
    })
  }

  return snapshot
}

export async function refreshLiveProjectGenerationFactsFromProjectState(params: {
  projectId: string | null | undefined
  source?: string | null
}): Promise<ProjectGenerationFactsSnapshot> {
  const projectId = normalizeText(params.projectId)
  if (!projectId || projectId === 'wizard-preview' || projectId.startsWith('wizard-preview:')) return {}

  const { data: projectData, error: projectError } = await (supabase as any)
    .from('projects')
    .select('*')
    .eq('id', projectId)
    .maybeSingle()

  if (projectError || !projectData) {
    logger.warn('[projectGenerationFactsStoreService] failed to refresh project generation facts from project state', {
      projectId,
      source: params.source ?? null,
      error: projectError ?? 'project_not_found',
    })
    return {}
  }

  const { data: objectData, error: objectError } = await (supabase as any)
    .from('engineering_objects')
    .select('id, object_type, object_code, object_name, status, metadata')
    .eq('project_id', projectId)
    .eq('status', 'active')

  if (objectError) {
    logger.warn('[projectGenerationFactsStoreService] failed to load engineering objects for project generation facts refresh', {
      projectId,
      source: params.source ?? null,
      error: objectError,
    })
  }

  const facts = inferProjectGenerationFactsFromProjectState(
    readRecord(projectData),
    Array.isArray(objectData) ? objectData.map(readRecord) : [],
  )

  return persistProjectGenerationFactsSnapshot({
    projectId,
    facts,
    source: params.source ?? 'project_state_refresh',
  })
}
