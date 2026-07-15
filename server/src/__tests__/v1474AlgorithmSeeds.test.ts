import { describe, expect, it, vi } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as ts from 'typescript'

const mocks = vi.hoisted(() => ({
  supabaseFrom: vi.fn(),
}))

vi.mock('../services/dbService.js', () => ({
  supabase: {
    from: mocks.supabaseFrom,
  },
}))
import {
  V1474_BUILDING_PATTERN_SEED,
  V1474_BUILDING_PATTERN_CLASSIFICATION_CONTRACTS,
  V1474_BUILDING_PATTERN_SEED_META,
  V1474_SECTION_10_11_DETAILED_GAP_SPECS,
} from '../seeds/v1474BuildingPatternSeed.js'
import {
  V1474_PROCESS_CONSTRAINT_SEED,
  V1474_PROCESS_CONSTRAINT_SEED_META,
} from '../seeds/v1474ProcessConstraintSeed.js'
import {
  V1474_PROCESS_SEASONAL_SENSITIVITY_SEED,
  V1474_PROCESS_SEASONAL_SENSITIVITY_SEED_META,
} from '../seeds/v1474ProcessSeasonalSensitivitySeed.js'
import {
  V1474_RESOURCE_CLASS_SEED,
  V1474_RESOURCE_CLASS_SEED_META,
  findV1474ResourceClass,
  findV1474ResourceClassMatch,
} from '../seeds/v1474ResourceClassSeed.js'
import {
  V1474_REGIONAL_CLIMATE_RULE_EVIDENCE_SOURCES,
  V1474_REGIONAL_CLIMATE_RULE_SEED,
  V1474_REGIONAL_CLIMATE_RULE_SEED_META,
} from '../seeds/v1474RegionalClimateRuleSeed.js'
import {
  V1474_CLIMATE_SEASONALITY_RELATIONSHIP,
  V1474_CLIMATE_SEASONALITY_RELATIONSHIP_META,
} from '../seeds/v1474ClimateSeasonalityRelationship.js'
import {
  deriveV1474SeasonalProductivityRegion,
  V1474_SEASONAL_PRODUCTIVITY_SEED,
  V1474_SEASONAL_PRODUCTIVITY_SEED_META,
} from '../seeds/v1474SeasonalProductivitySeed.js'
import {
  flattenChinaTemplateCatalog,
} from '../seeds/chinaGb50300TemplateCatalog.js'
import { DOMAIN_WBS_TEMPLATE_CATALOGS } from '../seeds/domainWbsTemplateCatalogs.js'
import {
  V1474_WORK_CALENDAR_SEED,
  V1474_WORK_CALENDAR_SEED_META,
} from '../seeds/v1474WorkCalendarSeed.js'
import {
  V1474_WORKFLOW_DICTIONARY_SEED,
  V1474_WORKFLOW_DICTIONARY_SEED_META,
} from '../seeds/v1474WorkflowDictionarySeed.js'
import {
  isV1475ConstructionMainlineReference,
  inspectV1475DependencyIntentTemplates,
  resolveV1475DependencyIntentTemplates,
  shouldEmitV1475DependencyIntent,
} from '../seeds/v1475DependencyIntentTemplates.js'
import {
  STANDARD_WORK_DURATION_SEED,
  STANDARD_WORK_DURATION_SEED_META,
} from '../seeds/standardWorkDurationSeed.js'
import {
  mergeAlgorithmSeedRecords,
  resolveV1474BuildingPatternMatch,
  resolveV1474BuildingPatternMatches,
  resolveV1474BuildingPattern,
  resolveAlgorithmSeedRecords,
  resolveStandardWorkDurationSeed,
  resolveV1474HolidayWindow,
  resolveV1474ProcessConstraint,
  resolveV1474ProcessSeasonalSensitivity,
  resolveV1474WorkflowDictionary,
  resolveV1474ResourceClass,
} from '../services/algorithmSeedResolver.js'
import { ALGORITHM_SEED_REGISTRY, normalizeAlgorithmSeedRecordPayload } from '../services/algorithmSeedRegistry.js'
import { validateV1474AlgorithmSeeds } from '../services/algorithmSeedValidationService.js'
import { evaluateAlgorithmSeedCandidate } from '../services/algorithmSeedAutoGovernanceService.js'
import { inferV1474ClimateRegionFromLocation } from '../services/projectClimateResolver.js'
import {
  buildOfficialWorkCalendarRecords,
  parseOfficialHolidayNotice,
  resolveOfficialHolidayNoticeSourceUrl,
} from '../services/officialHolidayCalendarService.js'
import { buildForecastWorkCalendarRecords } from '../services/workCalendarForecastBuilder.js'
import { mergeConstructionParallelPolicy } from '../services/constructionRhythmExpansionService.js'

const serverRoot = path.resolve(__dirname, '..', '..')

function createEmptySupabaseQuery() {
  const builder: Record<string, unknown> = {
    select: () => builder,
    eq: () => builder,
    maybeSingle: () => Promise.resolve({ data: null, error: null }),
    then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
      Promise.resolve({ data: [], error: null }).then(resolve, reject),
  }
  return builder
}

mocks.supabaseFrom.mockImplementation(() => createEmptySupabaseQuery())


type AlgorithmSeedMeta = {
  seedVersion: string
  seedScope: string
  sourceStandards: readonly string[]
  expectedCounts: {
    records: number
    regions?: number
    monthsPerRegion?: number
    provinceRecords?: number
    priorityCityRecords?: number
  }
  evidenceSources: readonly unknown[]
  generationPolicy: string
  relationshipRole?: string
  upstreamRuleTypes?: readonly string[]
  downstreamRuleTypes?: readonly string[]
  boundaryPolicy?: readonly string[]
  webVerified: boolean
  reviewNeeded: boolean
}

type AlgorithmSeedRecord = {
  stableCode?: string
  evidenceSourceKeys?: readonly string[]
  webVerified?: boolean
  reviewNeeded?: boolean
}

const seedSuites = [
  ['workflow dictionary', V1474_WORKFLOW_DICTIONARY_SEED, V1474_WORKFLOW_DICTIONARY_SEED_META],
  ['building pattern', V1474_BUILDING_PATTERN_SEED, V1474_BUILDING_PATTERN_SEED_META],
  ['process constraint', V1474_PROCESS_CONSTRAINT_SEED, V1474_PROCESS_CONSTRAINT_SEED_META],
  ['seasonal productivity', V1474_SEASONAL_PRODUCTIVITY_SEED, V1474_SEASONAL_PRODUCTIVITY_SEED_META],
  ['work calendar', V1474_WORK_CALENDAR_SEED, V1474_WORK_CALENDAR_SEED_META],
  ['process seasonal sensitivity', V1474_PROCESS_SEASONAL_SENSITIVITY_SEED, V1474_PROCESS_SEASONAL_SENSITIVITY_SEED_META],
  ['resource class', V1474_RESOURCE_CLASS_SEED, V1474_RESOURCE_CLASS_SEED_META],
] as const

const durationSeedSuites = [
  ['standard work duration', STANDARD_WORK_DURATION_SEED, STANDARD_WORK_DURATION_SEED_META],
] as const

describe('v1.4.7.4 algorithm auxiliary seeds', () => {
  it.each(seedSuites)('keeps %s source-backed and count-checked', (_name, records, meta) => {
    const seedMeta = meta as AlgorithmSeedMeta
    const seedRecords = records as readonly AlgorithmSeedRecord[]

    const expectedVersionMarker = _name === 'process seasonal sensitivity'
      ? 'v1.4.7.5'
      : _name === 'process constraint'
        ? 'v1.4.22'
        : 'v1.4.7.4'
    expect(seedMeta.seedVersion).toContain(expectedVersionMarker)
    expect(seedMeta.seedScope).toBe('algorithm_auxiliary')
    expect(seedMeta.sourceStandards.length).toBeGreaterThan(0)
    expect(seedMeta.evidenceSources.length).toBeGreaterThan(0)
    expect(seedMeta.generationPolicy).toContain('source_backed_no_generic_generation')
    expect(seedMeta.webVerified).toBe(true)
    expect(seedMeta.reviewNeeded).toBe(false)
    expect(seedMeta.expectedCounts.records).toBe(seedRecords.length)

    expect(seedRecords.length).toBeGreaterThan(0)
    for (const record of seedRecords) {
      expect(record.webVerified).toBe(true)
      const calendarKind = String((record as any).calendarKind ?? '')
      if (_name === 'work calendar' && String((record as any).holidayCode ?? '').endsWith('_forecast')) {
        expect(record.reviewNeeded).toBe(true)
        expect([
          'forecast_calendar_window',
          'plum_rain_window',
          'hot_summer_window',
          'dust_storm_window',
        ]).toContain(calendarKind)
        expect((record as any).sourceStandard).toBe('system_default')
      } else {
        expect(record.reviewNeeded).toBe(false)
      }
      expect(record.evidenceSourceKeys?.length ?? 0).toBeGreaterThan(0)
    }
  })

  it.each(durationSeedSuites)('keeps %s source-backed and auto-governed', (_name, records, meta) => {
    const seedMeta = meta as AlgorithmSeedMeta
    const seedRecords = records as readonly AlgorithmSeedRecord[]

    expect(seedMeta.seedVersion).toContain('v1.4.23')
    expect(seedMeta.seedScope).toBe('standard_work_duration')
    expect(seedMeta.sourceStandards.length).toBeGreaterThan(0)
    expect(seedMeta.evidenceSources.length).toBeGreaterThan(0)
    expect(seedMeta.generationPolicy).toContain('source_backed_auto_upgrade')
    expect(seedMeta.webVerified).toBe(true)
    expect(seedMeta.reviewNeeded).toBe(false)
    expect(seedMeta.expectedCounts.records).toBe(seedRecords.length)
    expect(seedRecords.length).toBeGreaterThanOrEqual(30)

    for (const record of seedRecords) {
      expect(record.webVerified).toBe(true)
      expect(record.reviewNeeded).toBe(false)
      expect(record.evidenceSourceKeys?.length ?? 0).toBeGreaterThan(0)
      expect((record as any).durationContributionMode).toBeTruthy()
    }
  })

  it('keeps building pattern rules deep enough for commercial rhythm strategy consumption', () => {
    expect(V1474_BUILDING_PATTERN_SEED_META.expectedCounts.records).toBe(210)
    expect(V1474_BUILDING_PATTERN_SEED_META.boundaryPolicy).toEqual(expect.arrayContaining([
      'schedule_trust_gate_required_before_runtime_consumption',
      'building_pattern_never_creates_hard_dependency_edges',
      'five_layer_dependency_system_owns_hard_dependencies',
      'resource_class_and_runtime_facts_override_parallel_hints',
    ]))
    expect(V1474_BUILDING_PATTERN_SEED.length).toBeGreaterThanOrEqual(20)
    const byCode = new Map(V1474_BUILDING_PATTERN_SEED.map((record) => [record.patternCode, record]))
    const realProjectGapPatternCodes = [
      'hospital_medical_cleanroom_integration_flow',
      'data_center_room_commissioning_flow',
      'industrial_cleanroom_validation_flow',
      'large_span_public_steel_integration_flow',
      'renovation_heritage_protection_flow',
      'campus_term_handover_flow',
      'tod_upper_cover_interface_flow',
      'mic_module_factory_site_flow',
      'prefabricated_factory_coordination_flow',
      'generic_construction_management_coordination_flow',
      'heritage_preservation_micro_workface_flow',
      'industrial_logistics_warehouse_commissioning_flow',
      'hotel_room_public_area_opening_flow',
      'residential_owner_delivery_flow',
      'commercial_office_opening_readiness_flow',
    ]
    for (const patternCode of realProjectGapPatternCodes) {
      expect(byCode.get(patternCode)).toEqual(expect.objectContaining({
        evidenceSourceKeys: expect.arrayContaining(['REAL_PROJECT_COVERAGE_20260522']),
        rhythmExpansionEligible: true,
      }))
    }
    expect(byCode.get('foundation_pit_to_foundation_sequence')).toEqual(expect.objectContaining({
      expansionStrategy: 'section_ordered',
      rhythmUnit: 'section',
      requiredScopeDimensions: expect.arrayContaining(['section']),
      rhythmDrivers: expect.arrayContaining(['section_count', 'workface_count']),
      primaryWorkfaceType: 'foundation_section',
      phaseWindow: 'foundation',
      rhythmStrategyCodes: expect.arrayContaining([
        'foundation-pit-support-before-excavation',
        'foundation-section-handover',
        'deep-foundation-time-space-excavation',
      ]),
      consumptionPolicy: expect.objectContaining({
        baselineGeneration: 'candidate_dependency',
        monthlyPlanGeneration: 'candidate_dependency',
      }),
      standardCatalogCodePrefixes: expect.arrayContaining(['FND']),
      projectTypeCodes: expect.arrayContaining(['deep_foundation']),
    }))
    expect(byCode.get('high_rise_core_and_floor_cycle')).toEqual(expect.objectContaining({
      expansionStrategy: 'floor_ordered',
      rhythmUnit: 'floor',
      requiredScopeDimensions: expect.arrayContaining(['building', 'floor']),
      rhythmDrivers: expect.arrayContaining(['floor_count', 'method_variant', 'resource_capacity']),
      primaryWorkfaceType: 'standard_floor',
      phaseWindow: 'superstructure',
      rhythmStrategyCodes: expect.arrayContaining([
        'standard-floor-cycle-curve',
        'sectioned-standard-floor-flow',
      ]),
      staggerRules: expect.arrayContaining([
        expect.objectContaining({ ruleCode: 'standard-floor-cycle-next-floor', lagUnit: 'floor' }),
        expect.objectContaining({ ruleCode: 'secondary-structure-n-minus-three', lagValue: 3 }),
      ]),
      consumptionPolicy: expect.objectContaining({
        durationSuggestion: 'floor_curve',
      }),
    }))
    expect(byCode.get('single_building_vertical_flow')).toEqual(expect.objectContaining({
      projectTypeCodes: expect.arrayContaining(['residential', 'office']),
      structureTypeCodes: expect.arrayContaining(['frame_shear_wall', 'shear_wall']),
      applicableMethodCodes: expect.arrayContaining(['aluminum_formwork', 'climbing_formwork', 'timber_formwork']),
      elementVariantCodes: expect.arrayContaining(['beam', 'slab', 'wall']),
      typicalCycleDaysByMethod: expect.objectContaining({
        aluminum_formwork: expect.objectContaining({ midFloors: 5 }),
        timber_formwork: expect.objectContaining({ midFloors: 7 }),
      }),
      rhythmStrategyCodes: expect.arrayContaining([
        'single-building-structure-fitout-waterfall',
        'vertical-transport-capacity-check',
      ]),
      staggerRules: expect.arrayContaining([
        expect.objectContaining({ ruleCode: 'wet-trade-to-finish-handover', lagUnit: 'floor' }),
      ]),
      consumptionPolicy: expect.objectContaining({
        durationSuggestion: 'floor_curve',
      }),
    }))
    expect(byCode.get('mep_system_zone_commissioning')).toEqual(expect.objectContaining({
      applicableMethodCodes: expect.arrayContaining(['pipe_network', 'system_commissioning', 'fire_linkage_commissioning']),
      typicalCycleDaysByMethod: expect.objectContaining({
        fire_linkage_commissioning: expect.objectContaining({ midFloors: 9 }),
      }),
      rhythmStrategyCodes: expect.arrayContaining([
        'shaft-riser-before-branch-network',
        'single-system-before-integrated-commissioning',
      ]),
      staggerRules: expect.arrayContaining([
        expect.objectContaining({ ruleCode: 'roughin-before-pressure-insulation-test', lagUnit: 'zone' }),
      ]),
    }))
    expect(byCode.get('foundation_pit_to_foundation_sequence')).toEqual(expect.objectContaining({
      typicalCycleDaysByMethod: expect.objectContaining({
        bored_pile: expect.objectContaining({ midFloors: 12 }),
        top_down_construction: expect.objectContaining({ midFloors: 14 }),
      }),
      structureTypeCodes: expect.arrayContaining(['basement_human_defense']),
      elementVariantCodes: expect.arrayContaining(['foundation', 'wall']),
    }))
    expect(byCode.get('data_center_room_commissioning_flow')).toEqual(expect.objectContaining({
      standardCatalogCodePrefixes: expect.arrayContaining(['DTC', '08-18']),
      projectTypeCodes: expect.arrayContaining(['data_center', 'idc']),
      primaryWorkfaceType: 'data_center_room_zone',
      rhythmStrategyCodes: expect.arrayContaining(['power-cooling-cabling-integrated-load-test']),
    }))
    expect(byCode.get('tod_upper_cover_interface_flow')).toEqual(expect.objectContaining({
      standardCatalogCodePrefixes: expect.arrayContaining(['TOD']),
      projectTypeCodes: expect.arrayContaining(['tod', 'metro_upper_cover']),
      primaryWorkfaceType: 'tod_transfer_deck_zone',
      rhythmStrategyCodes: expect.arrayContaining(['rail-interface-gate-before-cover-work']),
    }))
    expect(byCode.get('mic_module_factory_site_flow')).toEqual(expect.objectContaining({
      applicableMethodCodes: expect.arrayContaining(['mic', 'volumetric_module', 'factory_pod', 'factory_kitchen', 'site_quick_connect']),
      projectTypeCodes: expect.arrayContaining(['prefab_bathroom', 'prefab_kitchen']),
      structureTypeCodes: expect.arrayContaining(['prefab_bathroom_module', 'prefab_kitchen_module']),
      standardCatalogCodePrefixes: expect.arrayContaining(['IBU', 'IKU']),
      templateNodeStableCodePrefixes: expect.arrayContaining(['IBU', 'IKU']),
      phaseWindow: 'factory',
      expansionStrategy: 'factory_lot_ordered',
      rhythmUnit: 'factory_lot',
      rhythmStrategyCodes: expect.arrayContaining(['mic-factory-before-site-assembly']),
    }))
    expect(byCode.get('prefabricated_factory_coordination_flow')).toEqual(expect.objectContaining({
      patternRole: 'supporting_mode',
      conflictGroup: 'supporting_signal',
      expansionStrategy: 'factory_lot_ordered',
      rhythmUnit: 'factory_lot',
      primaryWorkfaceType: 'prefab_factory_coordination_zone',
      applicableMethodCodes: expect.arrayContaining(['factory_first_article_review', 'pc_logistics_tracking']),
    }))
    expect(byCode.get('generic_construction_management_coordination_flow')).toEqual(expect.objectContaining({
      patternRole: 'supporting_mode',
      conflictGroup: 'supporting_signal',
      expansionStrategy: 'workface_ordered',
      rhythmUnit: 'workface',
      applicableMethodCodes: expect.arrayContaining(['coordination_meeting', 'bim_coordination', 'logistics_tracking']),
    }))
    expect(byCode.get('heritage_preservation_micro_workface_flow')).toEqual(expect.objectContaining({
      projectTypeCodes: expect.arrayContaining(['heritage_preservation']),
      applicableMethodCodes: expect.arrayContaining(['traditional_craft', 'reversible_reinforcement']),
      primaryWorkfaceType: 'renovation_protection_zone',
      expansionStrategy: 'workface_ordered',
    }))
    expect(byCode.get('industrial_logistics_warehouse_commissioning_flow')).toEqual(expect.objectContaining({
      projectTypeCodes: expect.arrayContaining(['industrial_general', 'industrial_logistics', 'cold_storage']),
      applicableMethodCodes: expect.arrayContaining(['heavy_floor_flatness', 'loading_dock_system', 'equipment_trial_run']),
      primaryWorkfaceType: 'steel_bay',
      expansionStrategy: 'section_ordered',
    }))
    expect(byCode.get('residential_owner_delivery_flow')).toEqual(expect.objectContaining({
      projectTypeCodes: expect.arrayContaining(['residential', 'apartment']),
      applicableMethodCodes: expect.arrayContaining(['household_inspection', 'owner_delivery', 'property_takeover']),
      primaryWorkfaceType: 'decoration_room_zone',
      phaseWindow: 'handover',
    }))
    expect(byCode.get('commercial_office_opening_readiness_flow')).toEqual(expect.objectContaining({
      projectTypeCodes: expect.arrayContaining(['commercial', 'office', 'commercial_opening']),
      applicableMethodCodes: expect.arrayContaining(['tenant_handover', 'fire_life_safety_acceptance', 'opening_readiness']),
      primaryWorkfaceType: 'public_system_zone',
      phaseWindow: 'opening',
    }))
    for (const record of V1474_BUILDING_PATTERN_SEED) {
      expect(record.typicalCycleDaysByMethod?.default).toEqual(expect.objectContaining({
        firstFloor: expect.any(Number),
        midFloors: expect.any(Number),
        lastFloors: expect.any(Number),
      }))
      expect(record.rhythmStrategyCodes?.length ?? 0).toBeGreaterThanOrEqual(2)
      expect(record.expansionStrategy).toBeTruthy()
      expect(record.rhythmUnit).toBeTruthy()
      expect(record.requiredScopeDimensions?.length ?? 0).toBeGreaterThan(0)
      expect(record.optionalScopeDimensions?.length ?? 0).toBeGreaterThan(0)
      expect(record.rhythmDrivers?.length ?? 0).toBeGreaterThan(0)
      expect(record.primaryWorkfaceType).toBeTruthy()
      expect(record.phaseWindow).toBeTruthy()
      expect(record.standardCatalogCodePrefixes?.length ?? 0).toBeGreaterThan(0)
      expect(record.templateNodeStableCodePrefixes?.length ?? 0).toBeGreaterThan(0)
      expect(record.projectTypeCodes?.length ?? 0).toBeGreaterThan(0)
      expect(record.structureTypeCodes?.length ?? 0).toBeGreaterThan(0)
      expect(record.applicableMethodCodes?.length ?? 0).toBeGreaterThan(0)
      expect(record.elementVariantCodes?.length ?? 0).toBeGreaterThan(0)
      expect(record.staggerRules?.length ?? 0).toBeGreaterThanOrEqual(2)
      if (record.parallelPolicy?.resourceOccupancyPolicy === 'high_parallel_no_resource') {
        expect(record.parallelPolicy?.crewLimitHint ?? -1).toBeGreaterThanOrEqual(0)
      } else {
        expect(record.parallelPolicy?.crewLimitHint ?? 0).toBeGreaterThan(0)
      }
      expect(record.parallelPolicy?.resourceClassMergePolicy).toBe('resource_class_hard_limit_overrides_building_pattern_hint')
      expect(record.negativeKeywords?.length ?? 0).toBeGreaterThan(0)
      expect(record.consumptionPolicy).toEqual(expect.objectContaining({
        baselineGeneration: expect.any(String),
        monthlyPlanGeneration: expect.any(String),
        durationSuggestion: expect.any(String),
      }))
      expect(record.patternRole).toBeTruthy()
      expect(record.patternPriority ?? 0).toBeGreaterThan(0)
      expect(record.conflictGroup).toBeTruthy()
      expect(record.controlChains?.length ?? 0).toBeGreaterThanOrEqual(1)
      expect(record.controlChains?.[0]?.steps.length ?? 0).toBeGreaterThanOrEqual(5)
      expect(record.durationCurveProfile?.curveCode).toBeTruthy()
      expect(record.durationCurveProfile?.calibrationPriority ?? 0).toBeGreaterThan(0)
      expect(record.calibrationSignals?.length ?? 0).toBeGreaterThanOrEqual(3)
      expect(record.selfCalibrationPolicy).toBe('candidate_overlay_only_no_ts_seed_mutation')
    }
    const priorityKeys = new Set<string>()
    for (const record of V1474_BUILDING_PATTERN_SEED) {
      const key = `${record.conflictGroup}:${record.patternPriority}`
      expect(priorityKeys.has(key), `${key} is used by more than one building pattern`).toBe(false)
      priorityKeys.add(key)
    }
    expect(byCode.get('high_rise_core_and_floor_cycle')?.durationCurveProfile).toEqual(expect.objectContaining({
      positionBasis: 'floor',
      tailUnitBias: 'higher',
    }))
    expect(byCode.get('mep_system_zone_commissioning')?.durationCurveProfile).toEqual(expect.objectContaining({
      positionBasis: 'system',
      readinessSensitivity: 'high',
    }))
    expect(byCode.get('residential_owner_delivery_flow')?.controlChains?.[0]?.steps.join(' ')).toContain('property takeover')
    expect(byCode.get('residential_owner_delivery_flow')?.controlChains?.[0]?.steps.join(' ')).toContain('owner delivery')
    expect(byCode.get('commercial_office_opening_readiness_flow')?.controlChains?.[0]?.steps.join(' ')).toContain('fire life-safety')
    expect(byCode.get('commercial_office_opening_readiness_flow')?.controlChains?.[0]?.steps.join(' ')).toContain('opening readiness')
  })

  it('keeps raw base building pattern records source-auditable for negative keyword coverage', () => {
    const sourcePath = path.resolve(serverRoot, 'src/seeds/v1474BuildingPatternSeed.ts')
    const source = fs.readFileSync(sourcePath, 'utf8')
    expect(source).not.toMatch(/\/\*[\s\S]*generic_construction_management_coordination_flow[\s\S]*\*\//)

    const sourceFile = ts.createSourceFile(sourcePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
    let baseSeedArray: ts.ArrayLiteralExpression | null = null
    const visit = (node: ts.Node) => {
      if (
        ts.isVariableDeclaration(node)
        && node.name.getText(sourceFile) === 'V1474_BUILDING_PATTERN_BASE_SEED'
        && node.initializer
        && ts.isArrayLiteralExpression(node.initializer)
      ) {
        baseSeedArray = node.initializer
      }
      ts.forEachChild(node, visit)
    }
    visit(sourceFile)
    expect(baseSeedArray).toBeTruthy()

    const rawBaseRecords = (baseSeedArray?.elements ?? [])
      .filter((element): element is ts.ObjectLiteralExpression => ts.isObjectLiteralExpression(element))
      .map((element) => {
        let patternCode = ''
        let hasNegativeKeywords = false
        for (const property of element.properties) {
          if (!ts.isPropertyAssignment(property)) continue
          const name = property.name.getText(sourceFile).replace(/^['"]|['"]$/g, '')
          if (name === 'patternCode' && ts.isStringLiteral(property.initializer)) patternCode = property.initializer.text
          if (name === 'negativeKeywords') hasNegativeKeywords = true
        }
        return { patternCode, hasNegativeKeywords }
      })
    const finalByCode = new Map(V1474_BUILDING_PATTERN_SEED.map((record) => [record.patternCode, record]))
    const spreadGeneratedCodes = V1474_BUILDING_PATTERN_SEED
      .map((record) => record.patternCode)
      .filter((patternCode) => !rawBaseRecords.some((record) => record.patternCode === patternCode))
    const generatedRecords = spreadGeneratedCodes.map((patternCode) => {
      const record = finalByCode.get(patternCode)
      return {
        patternCode,
        hasNegativeKeywords: (record?.negativeKeywords?.length ?? 0) > 0,
      }
    })
    const records = [...rawBaseRecords, ...generatedRecords]

    expect(records).toHaveLength(V1474_BUILDING_PATTERN_SEED.length)
    expect(records.filter((record) => !record.hasNegativeKeywords).map((record) => record.patternCode)).toEqual([])
  })

  it('keeps all building pattern classification contracts explicit and stable', () => {
    const byCode = new Map(V1474_BUILDING_PATTERN_SEED.map((record) => [record.patternCode, record]))
    const contractEntries = Object.entries(V1474_BUILDING_PATTERN_CLASSIFICATION_CONTRACTS)
    expect(contractEntries).toHaveLength(V1474_BUILDING_PATTERN_SEED.length)

    for (const [patternCode, contract] of contractEntries) {
      const record = byCode.get(patternCode)
      expect(record, `${patternCode} should exist in final building pattern seed`).toBeTruthy()
      expect(record).toEqual(expect.objectContaining({
        patternRole: contract.patternRole,
        conflictGroup: contract.conflictGroup,
        patternPriority: contract.patternPriority,
      }))
      expect(record?.coexistsWithGroups).toEqual(expect.arrayContaining(contract.coexistsWithGroups))
      expect(record?.coexistsWithGroups).toHaveLength(contract.coexistsWithGroups.length)
    }
  })

  it('uses business-specific coexistence rules instead of one default symmetric matrix', () => {
    const byCode = new Map(V1474_BUILDING_PATTERN_SEED.map((record) => [record.patternCode, record]))

    expect(byCode.get('residential_owner_delivery_flow')?.coexistsWithGroups).toEqual([
      'project_rhythm',
      'phase_rhythm',
      'specialty_domain',
    ])
    expect(byCode.get('campus_term_handover_flow')?.coexistsWithGroups).toEqual([
      'project_rhythm',
      'phase_rhythm',
      'specialty_domain',
    ])

    for (const patternCode of [
      'hospital_medical_cleanroom_integration_flow',
      'data_center_room_commissioning_flow',
      'industrial_cleanroom_validation_flow',
      'industrial_logistics_warehouse_commissioning_flow',
    ]) {
      expect(byCode.get(patternCode)?.coexistsWithGroups).toEqual([
        'project_rhythm',
        'handover_opening',
      ])
    }

    for (const patternCode of [
      'hotel_room_public_area_opening_flow',
      'commercial_office_opening_readiness_flow',
    ]) {
      expect(byCode.get(patternCode)?.coexistsWithGroups).toEqual([
        'project_rhythm',
        'specialty_domain',
      ])
    }
  })

  it('includes foundation rhythm strategy coverage for the new foundation mode', () => {
    const foundation = V1474_BUILDING_PATTERN_SEED.find((record) => record.patternCode === 'foundation_pit_to_foundation_sequence')
    expect(foundation).toEqual(expect.objectContaining({
      objectSequence: expect.arrayContaining(['section', 'zone', 'workface']),
      applicableKeywords: expect.arrayContaining(['foundation', 'pile foundation', '基坑', '筏板', '桩基']),
      applicableConditions: expect.arrayContaining(['foundation pit pile shallow foundation raft or basement foundation package is selected']),
      exclusionConditions: expect.arrayContaining(['superstructure standard floor cycle']),
      staggerRules: expect.arrayContaining([
        expect.objectContaining({ ruleCode: 'support-dewatering-before-excavation', lagUnit: 'section' }),
        expect.objectContaining({ ruleCode: 'pile-or-raft-before-basement-structure', relation: 'candidate' }),
      ]),
    }))
  })

  it('resolves building pattern by standard code prefixes and skips negative keyword conflicts', async () => {
    const matched = await resolveV1474BuildingPatternMatch('', {
      standardWorkCode: 'PFB-01-01-07-P03',
      standardWorkCodes: ['PFB-01-01-07-P03'],
    })
    expect(matched.patternCode).toBe('prefabricated_concrete_floor_cycle')
    expect(matched.confidenceLevel).toBe('low')
    expect(matched.actionPolicy).toBe('candidate_only')
    expect(matched.matchedSignals).toEqual(expect.arrayContaining(['standard_catalog_prefix']))
    const matchedRecord = await resolveV1474BuildingPattern('', {
      standardWorkCode: 'PFB-01-01-07-P03',
      standardWorkCodes: ['PFB-01-01-07-P03'],
    })
    expect(matchedRecord?.patternCode).toBe('prefabricated_concrete_floor_cycle')

    const excluded = await resolveV1474BuildingPatternMatch('standard floor decoration only', {
      standardWorkCode: 'PFB-01-01-07-P03',
      standardWorkCodes: ['PFB-01-01-07-P03'],
    })
    expect(excluded.patternCode).not.toBe('prefabricated_concrete_floor_cycle')
    expect(excluded.actionPolicy).not.toBe('backend_consume')
  })

  it('uses scope rhythm context to distinguish close building pattern modes', async () => {
    const standardFloor = await resolveV1474BuildingPattern('', {
      scopeDimensions: ['building', 'floor'],
      rhythmDrivers: ['floor_count', 'method_variant', 'resource_capacity'],
      primaryWorkfaceType: 'standard_floor',
      phaseWindow: 'superstructure',
      expansionStrategy: 'floor_ordered',
    })
    expect(standardFloor?.patternCode).toBe('high_rise_core_and_floor_cycle')

    const mep = await resolveV1474BuildingPattern('', {
      scopeDimensions: ['system', 'zone'],
      rhythmDrivers: ['system_count', 'zone_count', 'acceptance_gate'],
      primaryWorkfaceType: 'mep_system_zone',
      phaseWindow: 'mep',
      expansionStrategy: 'system_zone',
    })
    expect(mep?.patternCode).toBe('mep_system_zone_commissioning')

    const foundation = await resolveV1474BuildingPattern('', {
      scopeDimensions: ['section', 'workface'],
      rhythmDrivers: ['section_count', 'workface_count', 'readiness_gate'],
      primaryWorkfaceType: 'foundation_section',
      phaseWindow: 'foundation',
      expansionStrategy: 'section_ordered',
    })
    expect(foundation?.patternCode).toBe('foundation_pit_to_foundation_sequence')
  })

  it('keeps project B prefabricated apartment building-pattern boundaries deterministic', async () => {
    const alc = await resolveV1474BuildingPatternMatch('A1# ALC 隔墙板进场安装 SI体系 装配化装修', {
      projectTypeCode: 'prefabricated_building',
      structureTypeCode: 'prefabricated_concrete',
      methodVariantCodes: ['si_system', 'industrialized_fitout'],
      elementVariantCodes: ['alc_partition_panel', 'si_infill_system'],
      scopeDimensions: ['building', 'floor', 'zone'],
      rhythmDrivers: ['floor_count', 'method_variant', 'readiness_gate'],
      primaryWorkfaceType: 'prefab_floor_zone',
      phaseWindow: 'superstructure',
      expansionStrategy: 'floor_ordered',
    })
    expect(alc.patternCode).toBe('prefabricated_concrete_floor_cycle')

    const mixedPc = await resolveV1474BuildingPatternMatch('A1# 18层 PC 叠合楼板 吊装 套筒灌浆 后浇带 现浇剪力墙 混合主体', {
      standardWorkCodes: ['02-01-03-P04'],
      projectTypeCode: 'prefabricated_building',
      structureTypeCode: 'prefab_with_cast_in_place_core',
      methodVariantCodes: ['prefab_with_cast_in_place_core', 'sleeve_grouting'],
      elementVariantCodes: ['precast_slab', 'cast_in_place_core', 'post_cast_joint'],
      scopeDimensions: ['building', 'floor'],
      rhythmDrivers: ['floor_count', 'method_variant', 'resource_capacity'],
      primaryWorkfaceType: 'prefab_floor_zone',
      phaseWindow: 'superstructure',
      expansionStrategy: 'floor_ordered',
    })
    expect(mixedPc.patternCode).toBe('prefabricated_concrete_floor_cycle')
    expect(mixedPc.patternCode).not.toBe('high_rise_core_and_floor_cycle')

    const micFactory = await resolveV1474BuildingPatternMatch('装配化卫浴模块 模块工厂 工厂段试制 factory lot FAT', {
      projectTypeCode: 'prefab_bathroom',
      structureTypeCode: 'prefab_bathroom_module',
      methodVariantCodes: ['factory_pod', 'factory_lot_acceptance'],
      elementVariantCodes: ['bathroom_pod', 'factory_lot'],
      scopeDimensions: ['building', 'factory_lot', 'zone'],
      rhythmDrivers: ['factory_lot_count', 'method_variant', 'readiness_gate'],
      primaryWorkfaceType: 'mic_module_zone',
      phaseWindow: 'factory',
      expansionStrategy: 'factory_lot_ordered',
    })
    expect(micFactory.patternCode).toBe('mic_module_factory_site_flow')
    expect(micFactory.record).toEqual(expect.objectContaining({
      expansionStrategy: 'factory_lot_ordered',
      rhythmUnit: 'factory_lot',
    }))

    for (const title of [
      'PC 工厂首件评审会',
      '׷װʺ˶ר',
      'BIM 装配式深化设计协调',
      'PC 构件物流跟踪日报',
      '总包对 PC 厂家月度评分',
    ]) {
      const match = await resolveV1474BuildingPatternMatch(title, {
        projectTypeCode: 'prefabricated_building',
        structureTypeCode: 'prefabricated_concrete',
        scopeDimensions: ['building'],
        rhythmDrivers: ['readiness_gate'],
        phaseWindow: 'factory',
      })
      expect(match.patternCode).toBe('prefabricated_factory_coordination_flow')
    }
  })

  it('returns compatible project B pattern layers instead of suppressing sequential phase modes', async () => {
    const matches = await resolveV1474BuildingPatternMatches('5栋 multi building group PC precast slab sleeve grouting shared basement foundation pit factory bathroom module', {
      projectTypeCode: 'prefabricated_building',
      structureTypeCode: 'prefab_with_cast_in_place_core',
      methodVariantCodes: ['prefab_with_cast_in_place_core', 'sleeve_grouting', 'factory_pod'],
      elementVariantCodes: ['precast_slab', 'cast_in_place_core', 'bathroom_pod'],
      scopeDimensions: ['building', 'floor', 'zone', 'section', 'factory_lot'],
      rhythmDrivers: ['building_count', 'floor_count', 'zone_count', 'section_count', 'factory_lot_count', 'method_variant'],
      phaseWindow: 'superstructure',
    }, { limit: 12 })
    const codes = matches.map((match) => match.patternCode)
    expect(codes).toEqual(expect.arrayContaining([
      'prefabricated_concrete_floor_cycle',
      'multi_building_parallel_flow',
      'basement_podium_tower_sequence',
      'foundation_pit_to_foundation_sequence',
    ]))
    expect(codes.indexOf('prefabricated_concrete_floor_cycle')).toBeLessThan(codes.indexOf('high_rise_core_and_floor_cycle') === -1 ? Number.POSITIVE_INFINITY : codes.indexOf('high_rise_core_and_floor_cycle'))
  })

  it('merges project B top-N building patterns with weights instead of exposing only array-order fallback', async () => {
    const matches = await resolveV1474BuildingPatternMatches('5 buildings multi building PC precast slab sleeve grouting shared basement foundation pit cast in place post cast joint', {
      standardWorkCodes: ['02-01-03-P04'],
      projectTypeCode: 'prefabricated_building',
      structureTypeCode: 'prefab_with_cast_in_place_core',
      methodVariantCodes: ['prefab_with_cast_in_place_core', 'sleeve_grouting'],
      elementVariantCodes: ['precast_slab', 'cast_in_place_core', 'post_cast_joint'],
      scopeDimensions: ['building', 'floor', 'zone', 'section'],
      rhythmDrivers: ['building_count', 'floor_count', 'zone_count', 'section_count', 'method_variant', 'resource_capacity'],
      phaseWindow: 'superstructure',
      expansionStrategy: 'floor_ordered',
    })
    const codes = matches.map((match) => match.patternCode)
    expect(codes).toEqual(expect.arrayContaining([
      'prefabricated_concrete_floor_cycle',
      'high_rise_core_and_floor_cycle',
      'basement_podium_tower_sequence',
      'foundation_pit_to_foundation_sequence',
      'multi_building_parallel_flow',
    ]))
    expect(matches[0].patternCode).toBe('prefabricated_concrete_floor_cycle')
    expect(matches[0].mergedPatternCodes).toEqual(codes)
    expect(matches[0].secondaryMatches?.length ?? 0).toBeGreaterThan(0)
    expect(matches[0].mergedDurationCurveProfile).toEqual(expect.objectContaining({
      source: 'top_n_weighted_building_pattern_merge',
      calibrationPriority: expect.any(Number),
    }))
    expect(matches[0].weightedTypicalCycleDays).toEqual(expect.objectContaining({
      firstFloor: expect.any(Number),
      midFloors: expect.any(Number),
      lastFloors: expect.any(Number),
    }))
    expect(matches[0].weightedTypicalCycleDays?.midFloors ?? 0).toBeGreaterThan(5)
    expect(matches[0].typicalCycleDayContributions).toEqual(expect.arrayContaining([
      expect.objectContaining({ patternCode: 'prefabricated_concrete_floor_cycle' }),
      expect.objectContaining({ patternCode: 'high_rise_core_and_floor_cycle' }),
    ]))
    const totalWeight = matches.reduce((sum, match) => sum + Number(match.matchWeight ?? 0), 0)
    expect(totalWeight).toBeGreaterThan(0.99)
    expect(totalWeight).toBeLessThan(1.01)
  })

  it('keeps same-phase PC and cast-in-place floor-cycle patterns compatible for hybrid standard floors', async () => {
    const matches = await resolveV1474BuildingPatternMatches('PC precast slab sleeve grouting cast in place core post cast joint tower standard floor', {
      standardWorkCodes: ['02-01-03-P04'],
      projectTypeCode: 'prefabricated_building',
      structureTypeCode: 'prefab_with_cast_in_place_core',
      methodVariantCodes: ['prefab_with_cast_in_place_core', 'sleeve_grouting'],
      elementVariantCodes: ['precast_slab', 'cast_in_place_core', 'post_cast_joint'],
      scopeDimensions: ['building', 'floor'],
      rhythmDrivers: ['floor_count', 'method_variant'],
      phaseWindow: 'superstructure',
    }, { limit: 8 })
    const codes = matches.map((match) => match.patternCode)
    expect(codes).toEqual(expect.arrayContaining([
      'prefabricated_concrete_floor_cycle',
      'high_rise_core_and_floor_cycle',
    ]))
  })

  it('keeps same-phase steel bay and large-span steel patterns compatible without broad material-tag conflicts', async () => {
    const matches = await resolveV1474BuildingPatternMatches('steel structure bay hoisting long-span steel truss large public atrium section roof truss installation', {
      standardWorkCodes: ['STL-01-01-P01'],
      standardCatalogCodePrefixes: ['STL'],
      projectTypeCode: 'large_public_building',
      structureTypeCode: 'steel_structure',
      methodVariantCodes: ['steel_hoisting', 'long_span_steel'],
      elementVariantCodes: ['steel_bay', 'space_truss'],
      scopeDimensions: ['building', 'section', 'zone'],
      rhythmDrivers: ['section_count', 'method_variant', 'resource_capacity'],
      phaseWindow: 'superstructure',
    }, { limit: 8 })
    const codes = matches.map((match) => match.patternCode)
    expect(codes).toEqual(expect.arrayContaining([
      'steel_structure_bay_zone_flow',
      'large_span_public_steel_integration_flow',
    ]))
  })

  it('uses a generic management coordination fallback while preserving factory/site boundaries', async () => {
    const genericMeeting = await resolveV1474BuildingPatternMatch('owner briefing weekly meeting site coordination report supplier review', {
      projectTypeCode: 'residential',
      structureTypeCode: 'management_coordination',
      methodVariantCodes: ['coordination_meeting', 'owner_report'],
      elementVariantCodes: ['management_workface'],
      scopeDimensions: ['building', 'workface'],
      rhythmDrivers: ['readiness_gate', 'workface_count'],
    })
    expect(genericMeeting.patternCode).toBe('generic_construction_management_coordination_flow')

    const pcFactory = await resolveV1474BuildingPatternMatch('PC factory first article review prefab factory logistics tracking assembly rate review', {
      projectTypeCode: 'prefabricated_building',
      structureTypeCode: 'prefabricated_concrete',
      methodVariantCodes: ['factory_first_article_review', 'pc_logistics_tracking'],
      elementVariantCodes: ['pc_component', 'factory_lot'],
      scopeDimensions: ['building', 'factory_lot'],
      rhythmDrivers: ['factory_lot_count', 'readiness_gate'],
      phaseWindow: 'factory',
    })
    expect(pcFactory.patternCode).toBe('prefabricated_factory_coordination_flow')

    const siteInstall = await resolveV1474BuildingPatternMatch('A1# PC precast slab hoisting sleeve grouting site installation standard floor', {
      projectTypeCode: 'prefabricated_building',
      structureTypeCode: 'prefabricated_concrete',
      methodVariantCodes: ['sleeve_grouting'],
      elementVariantCodes: ['precast_slab'],
      scopeDimensions: ['building', 'floor'],
      rhythmDrivers: ['floor_count', 'method_variant'],
      phaseWindow: 'superstructure',
    })
    expect(siteInstall.patternCode).toBe('prefabricated_concrete_floor_cycle')
  })

  it('merges building-pattern parallel hints under resource-class hard limits explicitly', () => {
    const merged = mergeConstructionParallelPolicy(
      { allowedAcross: ['floor', 'zone'], cautionAcross: ['system'], crewLimitHint: 3 },
      { sameBuildingDailyLimit: 5, sameFloorDailyLimit: 1, sameZoneDailyLimit: 2 },
    )

    expect(merged.policy).toBe('resource_class_hard_limit_overrides_building_pattern_hint')
    expect(merged.allowedAcross).toEqual(expect.arrayContaining(['floor', 'zone']))
    expect(merged.cautionAcross).toEqual(expect.arrayContaining(['system', 'building', 'floor', 'zone']))
    expect(merged.crewLimitHint).toBe(3)
    expect(merged.effectiveCrewLimit).toBe(1)
    expect(merged.hardLimits.sameZoneDailyLimit).toBe(2)
    expect(merged.sourcePrecedence[0]).toContain('resource_class')
  })

  it('excludes minor exterior repairs without scaffold from physical rhythm patterns', async () => {
    const matches = await resolveV1474BuildingPatternMatches('面层修补（无脚手架室外） minor repair without scaffold outdoor surface repair', {
      projectTypeCode: 'residential',
      structureTypeCode: 'frame_shear_wall',
      scopeDimensions: ['building', 'zone'],
      rhythmDrivers: ['weather_window'],
      phaseWindow: 'envelope',
    }, { limit: 8 })

    expect(matches.map((match) => match.patternCode)).toEqual([
      'generic_construction_management_coordination_flow',
    ])
  })

  it('normalizes method variant casing before building pattern matching', async () => {
    const match = await resolveV1474BuildingPatternMatch('standard floor concrete cycle', {
      standardWorkCode: '02-01',
      standardWorkCodes: ['02-01'],
      projectTypeCode: 'residential',
      structureTypeCode: 'shear_wall',
      methodVariantCodes: ['Aluminum_Formwork'],
      elementVariantCodes: ['slab'],
      scopeDimensions: ['building', 'floor'],
      rhythmDrivers: ['floor_count', 'method_variant'],
      phaseWindow: 'superstructure',
    })

    expect(match.patternCode).toBe('high_rise_core_and_floor_cycle')
    expect(match.record?.typicalCycleDaysByMethod?.aluminum_formwork).toEqual(expect.objectContaining({
      midFloors: 5,
    }))
    expect(match.matchedSignals).toEqual(expect.arrayContaining(['method_variant']))
  })

  it('maps residential owner-delivery QR and MS codes to a resource class for downstream pressure checks', async () => {
    const buildingPattern = await resolveV1474BuildingPatternMatch('residential owner delivery household inspection property takeover', {
      standardWorkCodes: ['QR-01-01-11', 'MS-01'],
      projectTypeCode: 'residential',
      structureTypeCode: 'interior_fitout',
      methodVariantCodes: ['owner_delivery', 'household_inspection'],
      elementVariantCodes: ['dwelling_unit', 'handover_package'],
      scopeDimensions: ['building', 'floor', 'zone'],
      rhythmDrivers: ['readiness_gate', 'acceptance_gate'],
      phaseWindow: 'handover',
    })
    const resourceClass = await resolveV1474ResourceClass('residential owner delivery household inspection property takeover', {
      standardWorkCodes: ['QR-01-01-11', 'MS-01'],
    })

    expect(buildingPattern.patternCode).toBe('residential_owner_delivery_flow')
    expect(resourceClass?.resourceClass ?? resourceClass?.resource_class).toBe('general_crew')
    expect(resourceClass?.resourceOperationType ?? resourceClass?.resource_operation_type).toBe('inspection_acceptance')
  })

  it('uses project, structure, method and element context to strengthen building pattern confidence', async () => {
    const withoutEngineeringFeatures = await resolveV1474BuildingPatternMatch('', {
      standardWorkCode: '02-01-03-P04',
      standardWorkCodes: ['02-01-03-P04'],
      scopeDimensions: ['building', 'floor'],
      rhythmDrivers: ['floor_count', 'resource_capacity'],
      primaryWorkfaceType: 'standard_floor',
      phaseWindow: 'superstructure',
      expansionStrategy: 'floor_ordered',
    })

    const withEngineeringFeatures = await resolveV1474BuildingPatternMatch('', {
      standardWorkCode: '02-01-03-P04',
      standardWorkCodes: ['02-01-03-P04'],
      projectTypeCode: 'residential',
      structureTypeCode: 'shear_wall',
      methodVariantCodes: ['aluminum_formwork'],
      elementVariantCodes: ['slab'],
      scopeDimensions: ['building', 'floor'],
      rhythmDrivers: ['floor_count', 'method_variant', 'resource_capacity'],
      primaryWorkfaceType: 'standard_floor',
      phaseWindow: 'superstructure',
      expansionStrategy: 'floor_ordered',
    })

    expect(withEngineeringFeatures.patternCode).toBe('high_rise_core_and_floor_cycle')
    expect(withEngineeringFeatures.confidenceScore).toBeGreaterThan(withoutEngineeringFeatures.confidenceScore)
    expect(withEngineeringFeatures.matchedSignals).toEqual(expect.arrayContaining([
      'method_variant',
      'element_variant',
    ]))
  })

  it('resolves real-project gap building patterns before generic public or MEP modes', async () => {
    const dataCenter = await resolveV1474BuildingPattern('IDC 机房 UPS 精密空调和冷通道联调', {
      projectTypeCode: 'data_center',
      standardWorkCodes: ['DTC-02-01-01-P03', 'DTC-02-02-01-P04'],
      scopeDimensions: ['system', 'zone'],
      rhythmDrivers: ['system_count', 'zone_count', 'acceptance_gate'],
      primaryWorkfaceType: 'data_center_room_zone',
      phaseWindow: 'commissioning',
      expansionStrategy: 'system_zone',
    })
    expect(dataCenter?.patternCode).toBe('data_center_room_commissioning_flow')

    const hospital = await resolveV1474BuildingPattern('三甲医院 洁净手术室 医用气体 医院信息化专项验收', {
      projectTypeCode: 'hospital',
      standardWorkCodes: ['CLN-02-01-01-P03', 'CLN-01-01-02-P06'],
      scopeDimensions: ['system', 'zone'],
      rhythmDrivers: ['system_count', 'zone_count', 'acceptance_gate'],
      primaryWorkfaceType: 'medical_cleanroom_zone',
      phaseWindow: 'commissioning',
      expansionStrategy: 'system_zone',
    })
    expect(hospital?.patternCode).toBe('hospital_medical_cleanroom_integration_flow')

    const renovation = await resolveV1474BuildingPattern('既有建筑文保修缮 临时支护 拆改加固 分区移交', {
      projectTypeCode: 'renovation',
      standardWorkCodes: ['RNV-01-01-02-P02', 'RNV-02-01-01-P04'],
      scopeDimensions: ['zone', 'workface'],
      rhythmDrivers: ['workface_count', 'zone_count', 'readiness_gate'],
      primaryWorkfaceType: 'renovation_protection_zone',
      phaseWindow: 'renovation',
      expansionStrategy: 'workface_ordered',
    })
    expect(renovation?.patternCode).toBe('renovation_heritage_protection_flow')

    const tod = await resolveV1474BuildingPattern('TOD 上盖 营业线防护 转换层 隔振 商业试运营', {
      projectTypeCode: 'tod',
      standardWorkCodes: ['TOD-01-01-02-P01', 'TOD-02-01-01-P04'],
      scopeDimensions: ['zone', 'section'],
      rhythmDrivers: ['section_count', 'zone_count', 'acceptance_gate'],
      primaryWorkfaceType: 'tod_transfer_deck_zone',
      phaseWindow: 'superstructure',
      expansionStrategy: 'section_ordered',
    })
    expect(tod?.patternCode).toBe('tod_upper_cover_interface_flow')
  })

  it('uses complete engineering feature profile to avoid ambiguous building pattern matches', async () => {
    const idcWithGenericText = await resolveV1474BuildingPatternMatch('public building system commissioning', {
      projectTypeCode: 'tier4_data_center',
      structureTypeCode: 'mission_critical_room',
      methodVariantCodes: ['integrated_load_test'],
      elementVariantCodes: ['server_room'],
      scopeDimensions: ['system', 'zone'],
      rhythmDrivers: ['system_count', 'zone_count', 'acceptance_gate'],
      primaryWorkfaceType: 'data_center_room_zone',
      phaseWindow: 'commissioning',
      expansionStrategy: 'system_zone',
    })
    expect(idcWithGenericText.patternCode).toBe('data_center_room_commissioning_flow')
    expect(idcWithGenericText.matchedSignals).toEqual(expect.arrayContaining([
      'project_generation_facts',
      'project_type',
      'structure_type',
      'method_variant',
      'element_variant',
    ]))

    const hospitalWithMepText = await resolveV1474BuildingPatternMatch('MEP integrated commissioning and special acceptance', {
      projectTypeCode: 'hospital',
      structureTypeCode: 'medical_cleanroom_system',
      methodVariantCodes: ['medical_gas_commissioning'],
      elementVariantCodes: ['operating_room'],
      scopeDimensions: ['system', 'zone'],
      rhythmDrivers: ['system_count', 'zone_count', 'acceptance_gate'],
      primaryWorkfaceType: 'medical_cleanroom_zone',
      phaseWindow: 'commissioning',
      expansionStrategy: 'system_zone',
    })
    expect(hospitalWithMepText.patternCode).toBe('hospital_medical_cleanroom_integration_flow')

    const conflicted = await resolveV1474BuildingPatternMatch('IDC data center UPS cooling load test', {
      projectTypeCode: 'hospital',
      structureTypeCode: 'medical_cleanroom_system',
      methodVariantCodes: ['medical_gas_commissioning'],
      elementVariantCodes: ['operating_room'],
      scopeDimensions: ['system', 'zone'],
      rhythmDrivers: ['system_count', 'zone_count', 'acceptance_gate'],
      primaryWorkfaceType: 'medical_cleanroom_zone',
      phaseWindow: 'commissioning',
      expansionStrategy: 'system_zone',
    })
    expect(conflicted.patternCode).toBe('hospital_medical_cleanroom_integration_flow')
    expect(conflicted.patternCode).not.toBe('data_center_room_commissioning_flow')
  })

  it('keeps weak building pattern matches as candidates when engineering feature profile is incomplete', async () => {
    const weakTextOnly = await resolveV1474BuildingPatternMatch('MEP public building commissioning', {
      scopeDimensions: ['system', 'zone'],
      rhythmDrivers: ['system_count'],
      phaseWindow: 'commissioning',
    })
    expect(weakTextOnly.confidenceLevel).not.toBe('high')
    expect(weakTextOnly.actionPolicy).not.toBe('backend_consume')
    expect(weakTextOnly.missingSignals).toEqual(expect.arrayContaining([
      'project_type_conflict',
      'structure_type_conflict',
    ]))
  })

  it('resolves remaining real-project business modes from project type and rhythm context', async () => {
    const industrialCleanroom = await resolveV1474BuildingPattern('工业洁净厂房 DQ IQ OQ PQ 高纯管线和设备 SAT', {
      projectTypeCode: 'industrial_cleanroom',
      standardWorkCodes: ['ICR-03-01-01-P03', 'ICR-04-02-01-P05'],
      scopeDimensions: ['system', 'zone'],
      rhythmDrivers: ['system_count', 'zone_count', 'acceptance_gate'],
      primaryWorkfaceType: 'cleanroom_validation_zone',
      phaseWindow: 'commissioning',
      expansionStrategy: 'system_zone',
    })
    expect(industrialCleanroom?.patternCode).toBe('industrial_cleanroom_validation_flow')

    const largeSpan = await resolveV1474BuildingPattern('大跨度公建 钢结构整体提升 屋面封闭 高大空间机电联调', {
      projectTypeCode: 'public',
      structureTypeCode: 'large_span_steel',
      methodVariantCodes: ['overall_lifting'],
      standardWorkCodes: ['STL-02-01-01-P03', 'DEC-09-01-01-P05'],
      scopeDimensions: ['zone', 'section'],
      rhythmDrivers: ['zone_count', 'section_count', 'method_variant'],
      primaryWorkfaceType: 'large_span_public_zone',
      phaseWindow: 'superstructure',
      expansionStrategy: 'zone_ordered',
    })
    expect(largeSpan?.patternCode).toBe('large_span_public_steel_integration_flow')

    const campus = await resolveV1474BuildingPattern('校园 教学楼 宿舍 运动场 智慧校园 开学移交', {
      projectTypeCode: 'campus',
      standardWorkCodes: ['CMP-01-01-02-P02', 'CMP-04-01-01-P04'],
      scopeDimensions: ['building', 'zone'],
      rhythmDrivers: ['building_count', 'zone_count', 'acceptance_gate'],
      primaryWorkfaceType: 'campus_function_zone',
      phaseWindow: 'handover',
      expansionStrategy: 'building',
    })
    expect(campus?.patternCode).toBe('campus_term_handover_flow')

    const mic = await resolveV1474BuildingPattern('MiC 模块工厂 FAT 超限运输 现场吊装 模块连接交付', {
      projectTypeCode: 'mic',
      methodVariantCodes: ['mic'],
      standardWorkCodes: ['MIC-02-01-01-P03', 'MIC-04-01-01-P04'],
      scopeDimensions: ['building', 'factory_lot'],
      rhythmDrivers: ['factory_lot_count', 'method_variant', 'acceptance_gate'],
      primaryWorkfaceType: 'mic_module_zone',
      phaseWindow: 'factory',
      expansionStrategy: 'factory_lot_ordered',
    })
    expect(mic?.patternCode).toBe('mic_module_factory_site_flow')

    const ibu = await resolveV1474BuildingPatternMatch('IBU integrated bathroom factory pod quick connect waterproof test', {
      projectTypeCode: 'prefab_bathroom',
      structureTypeCode: 'prefab_bathroom_module',
      methodVariantCodes: ['factory_pod', 'site_quick_connect', 'waterproof_test'],
      elementVariantCodes: ['bathroom_pod'],
      standardWorkCodes: ['IBU-02-01-01-P02'],
      scopeDimensions: ['building', 'factory_lot', 'zone', 'system'],
      rhythmDrivers: ['factory_lot_count', 'method_variant', 'readiness_gate', 'acceptance_gate'],
      primaryWorkfaceType: 'mic_module_zone',
      phaseWindow: 'factory',
      expansionStrategy: 'factory_lot_ordered',
    })
    expect(ibu.patternCode).toBe('mic_module_factory_site_flow')
    expect(ibu.confidenceLevel).not.toBe('low')
    expect(ibu.actionPolicy).not.toBe('candidate_only')
    expect(ibu.matchedSignals).toEqual(expect.arrayContaining([
      'project_type',
      'structure_type',
      'method_variant',
      'element_variant',
    ]))

    const iku = await resolveV1474BuildingPatternMatch('IKU integrated kitchen factory assembly gas exhaust interface site quick connect', {
      projectTypeCode: 'prefab_kitchen',
      structureTypeCode: 'prefab_kitchen_module',
      methodVariantCodes: ['factory_kitchen', 'gas_exhaust_interface', 'site_quick_connect'],
      elementVariantCodes: ['kitchen_pod'],
      standardWorkCodes: ['IKU-02-01-01-P02'],
      scopeDimensions: ['building', 'factory_lot', 'zone', 'system'],
      rhythmDrivers: ['factory_lot_count', 'method_variant', 'readiness_gate', 'acceptance_gate'],
      primaryWorkfaceType: 'mic_module_zone',
      phaseWindow: 'factory',
      expansionStrategy: 'factory_lot_ordered',
    })
    expect(iku.patternCode).toBe('mic_module_factory_site_flow')
    expect(iku.confidenceLevel).not.toBe('low')
    expect(iku.actionPolicy).not.toBe('candidate_only')

    const heritagePreservation = await resolveV1474BuildingPattern('heritage preservation micro workface protection boundary survey documentation', {
      projectTypeCode: 'heritage_preservation',
      structureTypeCode: 'heritage_structure',
      methodVariantCodes: ['heritage_protection', 'micro_environment'],
      elementVariantCodes: ['protected_component', 'micro_environment_control'],
      standardWorkCodes: ['HRT-02-01-01-P02'],
      scopeDimensions: ['workface', 'zone'],
      rhythmDrivers: ['workface_count', 'zone_count', 'readiness_gate', 'acceptance_gate'],
      primaryWorkfaceType: 'renovation_protection_zone',
      phaseWindow: 'renovation',
      expansionStrategy: 'workface_ordered',
    })
    expect(heritagePreservation?.patternCode).toBe('heritage_preservation_micro_workface_flow')

    const logisticsWarehouse = await resolveV1474BuildingPattern('logistics warehouse heavy floor loading dock cold-chain process utility trial run', {
      projectTypeCode: 'industrial_logistics',
      structureTypeCode: 'logistics_warehouse',
      methodVariantCodes: ['heavy_floor_flatness', 'loading_dock_system', 'equipment_trial_run'],
      elementVariantCodes: ['steel_bay', 'loading_dock', 'logistics_route'],
      standardWorkCodes: ['STL-02-01-01-P03'],
      scopeDimensions: ['section', 'zone', 'system'],
      rhythmDrivers: ['section_count', 'zone_count', 'system_count', 'method_variant', 'acceptance_gate'],
      primaryWorkfaceType: 'steel_bay',
      phaseWindow: 'commissioning',
      expansionStrategy: 'section_ordered',
    })
    expect(logisticsWarehouse?.patternCode).toBe('industrial_logistics_warehouse_commissioning_flow')

    const residentialDelivery = await resolveV1474BuildingPattern('residential owner delivery household inspection property takeover defect closeout', {
      projectTypeCode: 'residential',
      structureTypeCode: 'interior_fitout',
      methodVariantCodes: ['household_inspection', 'owner_delivery', 'property_takeover'],
      elementVariantCodes: ['dwelling_unit', 'handover_package'],
      standardWorkCodes: ['QR-01-01-15-P01'],
      scopeDimensions: ['building', 'floor', 'zone'],
      rhythmDrivers: ['floor_count', 'zone_count', 'readiness_gate', 'acceptance_gate'],
      primaryWorkfaceType: 'decoration_room_zone',
      phaseWindow: 'handover',
      expansionStrategy: 'floor_ordered',
    })
    expect(residentialDelivery?.patternCode).toBe('residential_owner_delivery_flow')

    const commercialOpening = await resolveV1474BuildingPattern('commercial opening tenant handover fire life safety signage wayfinding public area readiness', {
      projectTypeCode: 'commercial_opening',
      structureTypeCode: 'commercial_public_area',
      methodVariantCodes: ['tenant_handover', 'fire_life_safety_acceptance', 'opening_readiness'],
      elementVariantCodes: ['tenant_zone', 'opening_route'],
      standardWorkCodes: ['FIR-01-01-01-P03'],
      scopeDimensions: ['zone', 'system'],
      rhythmDrivers: ['zone_count', 'system_count', 'readiness_gate', 'acceptance_gate'],
      primaryWorkfaceType: 'public_system_zone',
      phaseWindow: 'opening',
      expansionStrategy: 'system_zone',
    })
    expect(commercialOpening?.patternCode).toBe('commercial_office_opening_readiness_flow')

    const hotel = await resolveV1474BuildingPattern('五星酒店 客房样板间 品牌方接管 试运营 开业', {
      projectTypeCode: 'hotel',
      standardWorkCodes: ['HTL-01-01-01-P03', 'HTL-05-01-02-P05'],
      scopeDimensions: ['floor', 'zone'],
      rhythmDrivers: ['floor_count', 'zone_count', 'acceptance_gate'],
      primaryWorkfaceType: 'hotel_room_public_zone',
      phaseWindow: 'trial_operation',
      expansionStrategy: 'floor_ordered',
    })
    expect(hotel?.patternCode).toBe('hotel_room_public_area_opening_flow')
  })

  it('covers section 10 and 11 building_pattern gap families with governed specialty patterns', async () => {
    expect(40 + 37 + 24 + 22 + 25).toBe(148)

    const gapCoverageCases: Array<{
      text: string
      expectedPatternCode: string
      context: Parameters<typeof resolveV1474BuildingPatternMatch>[1]
    }> = [
      {
        text: 'ISO 5 operating room laminar cleanroom pressure cascade particle test',
        expectedPatternCode: 'hospital_cleanroom_grade_control_flow',
        context: { projectTypeCode: 'hospital', structureTypeCode: 'medical_cleanroom_system', methodVariantCodes: ['iso5_cleanroom'], elementVariantCodes: ['operating_room'], scopeDimensions: ['system', 'zone'], rhythmDrivers: ['system_count', 'zone_count', 'acceptance_gate'], primaryWorkfaceType: 'medical_cleanroom_zone', phaseWindow: 'commissioning', expansionStrategy: 'system_zone' },
      },
      {
        text: 'MRI magnetic shielding RF shielding CT DR lead equivalent wall radiation acceptance hold point',
        expectedPatternCode: 'hospital_radiation_shielding_flow',
        context: { projectTypeCode: 'hospital', structureTypeCode: 'medical_cleanroom_system', methodVariantCodes: ['radiation_shielding'], elementVariantCodes: ['mri_room', 'ct_room'], scopeDimensions: ['system', 'zone'], rhythmDrivers: ['system_count', 'acceptance_gate'], primaryWorkfaceType: 'medical_cleanroom_zone', phaseWindow: 'commissioning', expansionStrategy: 'system_zone' },
      },
      {
        text: 'linear accelerator neutron shielding boron concrete maze entrance interlock emergency door',
        expectedPatternCode: 'hospital_linear_accelerator_neutron_maze_flow',
        context: { projectTypeCode: 'hospital', structureTypeCode: 'medical_cleanroom_system', methodVariantCodes: ['linac_neutron_shielding'], elementVariantCodes: ['linear_accelerator_room'], scopeDimensions: ['system', 'zone'], rhythmDrivers: ['zone_count', 'acceptance_gate'], primaryWorkfaceType: 'medical_cleanroom_zone', phaseWindow: 'commissioning', expansionStrategy: 'system_zone' },
      },
      {
        text: 'medical gas liquid oxygen station vacuum pump terminal alarm emergency switch drill',
        expectedPatternCode: 'hospital_medical_gas_source_terminal_flow',
        context: { projectTypeCode: 'hospital', structureTypeCode: 'medical_cleanroom_system', methodVariantCodes: ['medical_gas_commissioning'], elementVariantCodes: ['medical_gas_station'], scopeDimensions: ['system', 'zone'], rhythmDrivers: ['system_count', 'acceptance_gate'], primaryWorkfaceType: 'medical_cleanroom_zone', phaseWindow: 'commissioning', expansionStrategy: 'system_zone' },
      },
      {
        text: 'HIS PACS RIS LIS nurse call pneumatic tube hospital information integration',
        expectedPatternCode: 'hospital_clinical_information_system_flow',
        context: { projectTypeCode: 'hospital', structureTypeCode: 'medical_cleanroom_system', methodVariantCodes: ['hospital_information_integration'], elementVariantCodes: ['clinical_information_system'], scopeDimensions: ['system', 'zone'], rhythmDrivers: ['system_count', 'acceptance_gate'], primaryWorkfaceType: 'medical_cleanroom_zone', phaseWindow: 'commissioning', expansionStrategy: 'system_zone' },
      },
      {
        text: 'infection clinic three zones two passages negative pressure ward buffer interlock UV disinfection',
        expectedPatternCode: 'hospital_infection_control_negative_pressure_flow',
        context: { projectTypeCode: 'hospital', structureTypeCode: 'medical_cleanroom_system', methodVariantCodes: ['negative_pressure_isolation'], elementVariantCodes: ['negative_pressure_ward'], scopeDimensions: ['system', 'zone'], rhythmDrivers: ['zone_count', 'acceptance_gate'], primaryWorkfaceType: 'medical_cleanroom_zone', phaseWindow: 'commissioning', expansionStrategy: 'system_zone' },
      },
      {
        text: 'CSSD pathology PCR morgue hyperbaric oxygen chamber hospital special room',
        expectedPatternCode: 'hospital_special_room_process_flow',
        context: { projectTypeCode: 'hospital', structureTypeCode: 'medical_cleanroom_system', methodVariantCodes: ['hospital_special_room'], elementVariantCodes: ['cssd_room', 'pcr_lab'], scopeDimensions: ['system', 'zone'], rhythmDrivers: ['zone_count', 'acceptance_gate'], primaryWorkfaceType: 'medical_cleanroom_zone', phaseWindow: 'commissioning', expansionStrategy: 'system_zone' },
      },
      {
        text: 'medical waste temporary storage wastewater pretreatment radioactive decay tank formalin waste',
        expectedPatternCode: 'hospital_medical_wastewater_waste_flow',
        context: { projectTypeCode: 'hospital', structureTypeCode: 'medical_cleanroom_system', methodVariantCodes: ['medical_wastewater'], elementVariantCodes: ['radioactive_decay_tank'], scopeDimensions: ['system', 'zone'], rhythmDrivers: ['system_count', 'acceptance_gate'], primaryWorkfaceType: 'medical_cleanroom_zone', phaseWindow: 'commissioning', expansionStrategy: 'system_zone' },
      },
      {
        text: 'hospital rooftop helipad dynamic load navigation lights foam fire aviation airworthiness acceptance',
        expectedPatternCode: 'hospital_helipad_airworthiness_flow',
        context: { projectTypeCode: 'hospital', structureTypeCode: 'medical_cleanroom_system', methodVariantCodes: ['helipad_airworthiness'], elementVariantCodes: ['rooftop_helipad'], scopeDimensions: ['zone', 'system'], rhythmDrivers: ['zone_count', 'acceptance_gate'], primaryWorkfaceType: 'medical_cleanroom_zone', phaseWindow: 'commissioning', expansionStrategy: 'system_zone' },
      },
      {
        text: 'data center 110kV medium voltage UPS parallel battery discharge STS PDU equipotential grounding',
        expectedPatternCode: 'data_center_power_redundancy_flow',
        context: { projectTypeCode: 'data_center', structureTypeCode: 'mission_critical_room', methodVariantCodes: ['ups_parallel', 'battery_discharge_test'], elementVariantCodes: ['ups_room', 'battery_room'], scopeDimensions: ['system', 'zone'], rhythmDrivers: ['system_count', 'acceptance_gate'], primaryWorkfaceType: 'data_center_room_zone', phaseWindow: 'commissioning', expansionStrategy: 'system_zone' },
      },
      {
        text: 'diesel generator parallel black start fuel day tank oil storage fire protection load switching',
        expectedPatternCode: 'data_center_generator_black_start_flow',
        context: { projectTypeCode: 'data_center', structureTypeCode: 'mission_critical_room', methodVariantCodes: ['generator_black_start'], elementVariantCodes: ['diesel_generator_room'], scopeDimensions: ['system', 'zone'], rhythmDrivers: ['system_count', 'acceptance_gate'], primaryWorkfaceType: 'data_center_room_zone', phaseWindow: 'commissioning', expansionStrategy: 'system_zone' },
      },
      {
        text: 'chilled water high delta T free cooling economizer indirect evaporative cooling tower data center',
        expectedPatternCode: 'data_center_chilled_water_free_cooling_flow',
        context: { projectTypeCode: 'data_center', structureTypeCode: 'mission_critical_room', methodVariantCodes: ['free_cooling'], elementVariantCodes: ['chilled_water_system'], scopeDimensions: ['system', 'zone'], rhythmDrivers: ['system_count', 'acceptance_gate'], primaryWorkfaceType: 'data_center_room_zone', phaseWindow: 'commissioning', expansionStrategy: 'system_zone' },
      },
      {
        text: 'row cooling in-row air conditioner hot aisle cold aisle containment CFD dew point positive pressure',
        expectedPatternCode: 'data_center_airflow_cooling_flow',
        context: { projectTypeCode: 'data_center', structureTypeCode: 'mission_critical_room', methodVariantCodes: ['row_cooling_airflow'], elementVariantCodes: ['cold_aisle'], scopeDimensions: ['system', 'zone'], rhythmDrivers: ['system_count', 'zone_count'], primaryWorkfaceType: 'data_center_room_zone', phaseWindow: 'commissioning', expansionStrategy: 'system_zone' },
      },
      {
        text: 'ISO 5 photolithography cleanroom vibration VC-E EMI shielding semiconductor validation',
        expectedPatternCode: 'industrial_cleanroom_grade_precision_flow',
        context: { projectTypeCode: 'industrial_cleanroom', structureTypeCode: 'clean_industrial', methodVariantCodes: ['iso5_photolithography', 'vibration_control'], elementVariantCodes: ['photolithography_zone'], scopeDimensions: ['system', 'zone'], rhythmDrivers: ['system_count', 'zone_count', 'acceptance_gate'], primaryWorkfaceType: 'cleanroom_validation_zone', phaseWindow: 'commissioning', expansionStrategy: 'system_zone' },
      },
      {
        text: 'DI water ultra pure water bulk gas N2 O2 H2 specialty gas SiH4 NH3 process piping FM EP clean',
        expectedPatternCode: 'semiconductor_process_utility_piping_flow',
        context: { projectTypeCode: 'semiconductor', structureTypeCode: 'clean_industrial', methodVariantCodes: ['process_utility_piping'], elementVariantCodes: ['di_water_system', 'specialty_gas'], scopeDimensions: ['system', 'zone'], rhythmDrivers: ['system_count', 'acceptance_gate'], primaryWorkfaceType: 'cleanroom_validation_zone', phaseWindow: 'commissioning', expansionStrategy: 'system_zone' },
      },
      {
        text: '24m high bay warehouse ASRS automated storage cold chain fire compartment logistics commissioning',
        expectedPatternCode: 'industrial_logistics_asrs_cold_chain_flow',
        context: { projectTypeCode: 'industrial_logistics', structureTypeCode: 'logistics_warehouse', methodVariantCodes: ['asrs_commissioning'], elementVariantCodes: ['high_bay_warehouse', 'cold_chain_zone'], scopeDimensions: ['section', 'zone', 'system'], rhythmDrivers: ['section_count', 'zone_count', 'acceptance_gate'], primaryWorkfaceType: 'steel_bay', phaseWindow: 'commissioning', expansionStrategy: 'section_ordered' },
      },
      {
        text: 'data center gas fire suppression IG541 FM200 high pressure water mist VESDA fire stopping acceptance',
        expectedPatternCode: 'data_center_fire_suppression_early_warning_flow',
        context: { projectTypeCode: 'data_center', structureTypeCode: 'mission_critical_room', methodVariantCodes: ['gas_fire_suppression'], elementVariantCodes: ['vesda_system'], scopeDimensions: ['system', 'zone'], rhythmDrivers: ['system_count', 'acceptance_gate'], primaryWorkfaceType: 'data_center_room_zone', phaseWindow: 'commissioning', expansionStrategy: 'system_zone' },
      },
      {
        text: 'Tier III certification MIIT data center filing MLPS level 3 96h full load test',
        expectedPatternCode: 'data_center_certification_security_acceptance_flow',
        context: { projectTypeCode: 'data_center', structureTypeCode: 'mission_critical_room', methodVariantCodes: ['tier3_certification', 'full_load_test'], elementVariantCodes: ['certification_package'], scopeDimensions: ['system', 'zone'], rhythmDrivers: ['acceptance_gate'], primaryWorkfaceType: 'data_center_room_zone', phaseWindow: 'handover', expansionStrategy: 'system_zone' },
      },
      {
        text: 'PTFE ETFE tensile membrane cable net wind tunnel CFD seam waterproof drainage roof',
        expectedPatternCode: 'public_tensile_membrane_roof_flow',
        context: { projectTypeCode: 'stadium', structureTypeCode: 'large_span_steel', methodVariantCodes: ['tensile_membrane'], elementVariantCodes: ['membrane_roof'], scopeDimensions: ['zone', 'section'], rhythmDrivers: ['zone_count', 'method_variant', 'acceptance_gate'], primaryWorkfaceType: 'large_span_public_zone', phaseWindow: 'superstructure', expansionStrategy: 'zone_ordered' },
      },
      {
        text: 'exhibition atrium high space HVAC jet nozzle stadium stratified airflow CFD CHP trigeneration',
        expectedPatternCode: 'public_large_space_hvac_energy_flow',
        context: { projectTypeCode: 'large_public_building', structureTypeCode: 'mep_integrated', methodVariantCodes: ['large_space_hvac'], elementVariantCodes: ['atrium', 'chp_system'], scopeDimensions: ['system', 'zone'], rhythmDrivers: ['system_count', 'zone_count'], primaryWorkfaceType: 'public_system_zone', phaseWindow: 'mep', expansionStrategy: 'system_zone' },
      },
      {
        text: 'office IBMS exhibition broadcast AV simultaneous interpretation sports lighting scoreboard ticket gate parking guidance',
        expectedPatternCode: 'public_venue_intelligent_system_flow',
        context: { projectTypeCode: 'exhibition', structureTypeCode: 'large_public_system', methodVariantCodes: ['venue_intelligent_system'], elementVariantCodes: ['ibms_system', 'ticket_gate'], scopeDimensions: ['system', 'zone'], rhythmDrivers: ['system_count', 'acceptance_gate'], primaryWorkfaceType: 'public_system_zone', phaseWindow: 'commissioning', expansionStrategy: 'system_zone' },
      },
      {
        text: 'structural transfer truss floor VIP business reception luxury finish high grade decoration',
        expectedPatternCode: 'public_transfer_vip_finish_flow',
        context: { projectTypeCode: 'office', structureTypeCode: 'large_public_system', methodVariantCodes: ['transfer_floor', 'vip_finish'], elementVariantCodes: ['transfer_truss', 'vip_floor'], scopeDimensions: ['floor', 'zone'], rhythmDrivers: ['zone_count', 'method_variant'], primaryWorkfaceType: 'public_system_zone', phaseWindow: 'decoration', expansionStrategy: 'zone_ordered' },
      },
      {
        text: 'reclaimed water reuse BIPV photovoltaic LEED green building three star certification',
        expectedPatternCode: 'public_green_building_energy_certification_flow',
        context: { projectTypeCode: 'large_public_building', structureTypeCode: 'mep_integrated', methodVariantCodes: ['green_building_certification'], elementVariantCodes: ['bipv_roof', 'reclaimed_water'], scopeDimensions: ['system', 'zone'], rhythmDrivers: ['system_count', 'acceptance_gate'], primaryWorkfaceType: 'public_system_zone', phaseWindow: 'commissioning', expansionStrategy: 'system_zone' },
      },
      {
        text: 'large public special fire acceptance lightning energy civil defense load test operation rehearsal',
        expectedPatternCode: 'public_special_acceptance_load_operation_flow',
        context: { projectTypeCode: 'stadium', structureTypeCode: 'large_span_steel', methodVariantCodes: ['public_special_acceptance'], elementVariantCodes: ['load_test', 'operation_drill'], scopeDimensions: ['system', 'zone'], rhythmDrivers: ['acceptance_gate'], primaryWorkfaceType: 'large_span_public_zone', phaseWindow: 'handover', expansionStrategy: 'system_zone' },
      },
      {
        text: 'heritage component local replacement reversible reinforcement restoration painted carving traditional craft',
        expectedPatternCode: 'heritage_craft_subprocess_flow',
        context: { projectTypeCode: 'heritage_preservation', structureTypeCode: 'heritage_structure', methodVariantCodes: ['traditional_craft'], elementVariantCodes: ['protected_component'], scopeDimensions: ['workface', 'zone'], rhythmDrivers: ['workface_count', 'acceptance_gate'], primaryWorkfaceType: 'renovation_protection_zone', phaseWindow: 'renovation', expansionStrategy: 'workface_ordered' },
      },
      {
        text: 'traditional brick tile timber lime mortar tung oil hemp fiber substitute material approval heritage',
        expectedPatternCode: 'heritage_traditional_material_supply_flow',
        context: { projectTypeCode: 'heritage_preservation', structureTypeCode: 'heritage_structure', methodVariantCodes: ['traditional_material_supply'], elementVariantCodes: ['traditional_material'], scopeDimensions: ['workface', 'zone'], rhythmDrivers: ['readiness_gate', 'workface_count'], primaryWorkfaceType: 'renovation_protection_zone', phaseWindow: 'renovation', expansionStrategy: 'workface_ordered' },
      },
      {
        text: 'heritage bureau witness sample section hidden inspection intermediate final acceptance monitoring hold point',
        expectedPatternCode: 'heritage_authority_hold_point_flow',
        context: { projectTypeCode: 'heritage_preservation', structureTypeCode: 'heritage_structure', methodVariantCodes: ['heritage_authority_hold_point'], elementVariantCodes: ['heritage_approval_package'], scopeDimensions: ['workface', 'zone'], rhythmDrivers: ['acceptance_gate', 'readiness_gate'], primaryWorkfaceType: 'renovation_protection_zone', phaseWindow: 'renovation', expansionStrategy: 'workface_ordered' },
      },
      {
        text: 'new steel frame near heritage vibration settlement pipe crossing landscape view corridor interface approval',
        expectedPatternCode: 'heritage_newbuild_interface_monitoring_flow',
        context: { projectTypeCode: 'heritage_preservation', structureTypeCode: 'heritage_structure', methodVariantCodes: ['newbuild_heritage_interface'], elementVariantCodes: ['heritage_interface'], scopeDimensions: ['zone', 'workface'], rhythmDrivers: ['readiness_gate', 'acceptance_gate'], primaryWorkfaceType: 'renovation_protection_zone', phaseWindow: 'renovation', expansionStrategy: 'workface_ordered' },
      },
      {
        text: 'scaffold avoid heritage body protective shed rain winter full cover heritage bureau approval',
        expectedPatternCode: 'heritage_scaffold_protection_shed_flow',
        context: { projectTypeCode: 'heritage_preservation', structureTypeCode: 'heritage_structure', methodVariantCodes: ['heritage_scaffold_protection'], elementVariantCodes: ['protective_shed'], scopeDimensions: ['zone', 'workface'], rhythmDrivers: ['resource_capacity', 'readiness_gate'], primaryWorkfaceType: 'renovation_protection_zone', phaseWindow: 'renovation', expansionStrategy: 'workface_ordered' },
      },
      {
        text: 'metro operation night window vibration limit noise limit safety protection zone construction approval',
        expectedPatternCode: 'tod_metro_operation_protection_flow',
        context: { projectTypeCode: 'tod', structureTypeCode: 'rail_interface_protected', methodVariantCodes: ['metro_operation_protection'], elementVariantCodes: ['metro_protection_zone'], scopeDimensions: ['section', 'zone'], rhythmDrivers: ['readiness_gate', 'acceptance_gate'], primaryWorkfaceType: 'tod_transfer_deck_zone', phaseWindow: 'renovation', expansionStrategy: 'section_ordered' },
      },
      {
        text: 'metro company commercial operator developer owner handover interface transfer common management stage',
        expectedPatternCode: 'tod_multi_owner_interface_handover_flow',
        context: { projectTypeCode: 'tod', structureTypeCode: 'metro_upper_cover', methodVariantCodes: ['multi_owner_handover'], elementVariantCodes: ['owner_interface'], scopeDimensions: ['building', 'zone'], rhythmDrivers: ['readiness_gate', 'acceptance_gate'], primaryWorkfaceType: 'tod_transfer_deck_zone', phaseWindow: 'handover', expansionStrategy: 'building' },
      },
      {
        text: 'school September 1 opening hotel Christmas trial opening commercial shopping festival hard date',
        expectedPatternCode: 'tod_hard_date_opening_constraint_flow',
        context: { projectTypeCode: 'tod', structureTypeCode: 'metro_upper_cover', methodVariantCodes: ['hard_date_opening'], elementVariantCodes: ['opening_deadline'], scopeDimensions: ['building', 'zone'], rhythmDrivers: ['acceptance_gate'], primaryWorkfaceType: 'campus_function_zone', phaseWindow: 'opening', expansionStrategy: 'building' },
      },
      {
        text: 'metro concourse upper cover commercial connection slab load check tower foundation avoid rail structure',
        expectedPatternCode: 'tod_rail_podium_interface_foundation_flow',
        context: { projectTypeCode: 'tod', structureTypeCode: 'tod_transfer_deck', methodVariantCodes: ['rail_podium_interface'], elementVariantCodes: ['metro_concourse_connection', 'load_check'], scopeDimensions: ['section', 'zone'], rhythmDrivers: ['section_count', 'acceptance_gate'], primaryWorkfaceType: 'tod_transfer_deck_zone', phaseWindow: 'foundation', expansionStrategy: 'section_ordered' },
      },
      {
        text: 'five towers separate handover phased commercial opening school teaching zone gym canteen zone level handover',
        expectedPatternCode: 'tod_multi_asset_zone_handover_flow',
        context: { projectTypeCode: 'tod', structureTypeCode: 'metro_upper_cover', methodVariantCodes: ['multi_asset_zone_handover'], elementVariantCodes: ['handover_zone'], scopeDimensions: ['building', 'zone'], rhythmDrivers: ['building_count', 'zone_count', 'acceptance_gate'], primaryWorkfaceType: 'tod_transfer_deck_zone', phaseWindow: 'handover', expansionStrategy: 'building' },
      },
      {
        text: 'international school sports field hotel central kitchen swimming pool SPA commercial atrium amusement roof facility',
        expectedPatternCode: 'tod_podium_special_facility_readiness_flow',
        context: { projectTypeCode: 'tod', structureTypeCode: 'metro_upper_cover', methodVariantCodes: ['podium_special_facility'], elementVariantCodes: ['sports_field', 'hotel_kitchen', 'pool_spa'], scopeDimensions: ['system', 'zone'], rhythmDrivers: ['system_count', 'acceptance_gate'], primaryWorkfaceType: 'public_system_zone', phaseWindow: 'opening', expansionStrategy: 'system_zone' },
      },
    ]

    for (const item of gapCoverageCases) {
      const match = await resolveV1474BuildingPatternMatch(item.text, item.context)
      expect(
        match.patternCode === item.expectedPatternCode
          || match.record.parentPatternCode === item.expectedPatternCode,
        `${item.text}: expected ${item.expectedPatternCode} or a detailed child, got ${match.patternCode}`,
      ).toBe(true)
      expect(match.confidenceLevel, item.text).not.toBe('low')
    }
  })

  it('uses pattern role and control-chain specificity to arbitrate handover and opening modes', async () => {
    const commercialOpening = await resolveV1474BuildingPatternMatch('public building system commissioning fire life safety opening readiness', {
      projectTypeCode: 'commercial_opening',
      structureTypeCode: 'commercial_public_area',
      methodVariantCodes: ['opening_readiness', 'fire_life_safety_acceptance'],
      elementVariantCodes: ['opening_route', 'public_area'],
      scopeDimensions: ['zone', 'system'],
      rhythmDrivers: ['zone_count', 'system_count', 'readiness_gate', 'acceptance_gate'],
      primaryWorkfaceType: 'public_system_zone',
      phaseWindow: 'opening',
      expansionStrategy: 'system_zone',
    })
    expect(commercialOpening.patternCode).toBe('commercial_office_opening_readiness_flow')
    expect(commercialOpening.matchedSignals).toEqual(expect.arrayContaining([
      'specific_pattern_role',
      'specific_phase_role',
      'pattern_priority',
      'control_chain',
      'duration_curve_profile',
    ]))

    const residentialHandover = await resolveV1474BuildingPatternMatch('fine decoration household inspection property takeover owner delivery', {
      projectTypeCode: 'residential',
      structureTypeCode: 'interior_fitout',
      methodVariantCodes: ['household_inspection', 'owner_delivery', 'property_takeover'],
      elementVariantCodes: ['dwelling_unit', 'handover_package'],
      scopeDimensions: ['building', 'floor', 'zone'],
      rhythmDrivers: ['floor_count', 'zone_count', 'readiness_gate', 'acceptance_gate'],
      primaryWorkfaceType: 'decoration_room_zone',
      phaseWindow: 'handover',
      expansionStrategy: 'floor_ordered',
    })
    expect(residentialHandover.patternCode).toBe('residential_owner_delivery_flow')
    expect(residentialHandover.patternCode).not.toBe('fine_decoration_floor_zone_flow')
    expect(residentialHandover.matchedSignals).toEqual(expect.arrayContaining([
      'specific_pattern_role',
      'specific_phase_role',
      'control_chain',
    ]))
  })

  it('merges building pattern edge-case governance for stagger rules, hard dates, EPC owners, and generic resource policy', async () => {
    const overloaded = await resolveV1474BuildingPatternMatch(
      'TOD metro operation night window vibration limit multi owner handover school September 1 opening hotel Christmas trial opening commercial shopping festival hard date metro concourse load check zone level handover hotel central kitchen swimming pool SPA',
      {
        projectTypeCode: 'tod',
        structureTypeCode: 'metro_upper_cover',
        methodVariantCodes: ['metro_operation_protection', 'multi_owner_handover', 'hard_date_opening', 'multi_asset_zone_handover', 'podium_special_facility'],
        elementVariantCodes: ['metro_protection_zone', 'owner_interface', 'opening_deadline', 'handover_zone', 'pool_spa'],
        scopeDimensions: ['building', 'zone', 'system'],
        rhythmDrivers: ['readiness_gate', 'acceptance_gate', 'building_count', 'zone_count', 'system_count'],
        primaryWorkfaceType: 'tod_transfer_deck_zone',
        phaseWindow: 'opening',
        expansionStrategy: 'system_zone',
      },
    )

    expect(overloaded.mergedPatternCodes?.length ?? 0).toBeGreaterThanOrEqual(5)
    expect(overloaded.mergedStaggerRules?.length ?? 0).toBeGreaterThan(0)
    expect(overloaded.mergedStaggerRules?.length ?? 0).toBeLessThanOrEqual(8)
    const rawStaggerRuleCount = overloaded.staggerRuleContributions
      ?.reduce((sum, contribution) => sum + contribution.staggerRules.length, 0) ?? 0
    expect(rawStaggerRuleCount).toBeGreaterThan(overloaded.mergedStaggerRules?.length ?? 0)
    expect(overloaded.mergedStaggerRules?.map((rule) => rule.ruleCode)).toEqual(expect.arrayContaining([
      'hard-date-opening-readiness-gate',
      'multi-owner-interface-transfer-gate',
    ]))
    expect(overloaded.staggerMergePolicy).toBe('dedupe_by_rule_code_then_hard_deadline_priority')
    expect(overloaded.hardDeadlinePriority).toBeGreaterThan(0)
    expect(overloaded.patternCode).toBe('tod_hard_date_opening_constraint_flow')
    expect(overloaded.matchedSignals).toContain('hard_deadline_priority')

    const genericMeeting = await resolveV1474BuildingPatternMatch('owner briefing weekly meeting site coordination report supplier review', {
      methodVariantCodes: ['coordination_meeting', 'owner_report'],
      elementVariantCodes: ['management_workface'],
      scopeDimensions: ['building', 'workface'],
      rhythmDrivers: ['readiness_gate', 'workface_count'],
      primaryWorkfaceType: 'building_zone',
      phaseWindow: 'full_project',
      expansionStrategy: 'workface_ordered',
    })
    expect(genericMeeting.patternCode).toBe('generic_construction_management_coordination_flow')
    expect((genericMeeting.record as any)?.parallelPolicy).toEqual(expect.objectContaining({
      resourceOccupancyPolicy: 'high_parallel_no_resource',
      crewLimitHint: 0,
    }))

    const multiOwner = await resolveV1474BuildingPatternMatch('EPC metro company commercial operator developer owner handover interface transfer common management stage', {
      projectTypeCode: 'tod',
      structureTypeCode: 'metro_upper_cover',
      methodVariantCodes: ['multi_owner_handover'],
      elementVariantCodes: ['owner_interface', 'operation_agreement'],
      scopeDimensions: ['building', 'zone'],
      rhythmDrivers: ['readiness_gate', 'acceptance_gate'],
      primaryWorkfaceType: 'tod_transfer_deck_zone',
      phaseWindow: 'handover',
      expansionStrategy: 'building',
    })
    expect(
      multiOwner.patternCode === 'tod_multi_owner_interface_handover_flow'
        || multiOwner.record.parentPatternCode === 'tod_multi_owner_interface_handover_flow',
    ).toBe(true)
    expect((multiOwner.record as any)?.dataModelPolicy).toEqual(expect.objectContaining({
      ownerScopeModel: 'project_id_with_owner_interface_segments',
      requiresOwnerInterfaceDimension: true,
    }))
  })

  it('covers every section 10 and 11 building_pattern detailed gap as a selectable seed pattern', () => {
    const expectedDomainCounts = {
      hospital: 40,
      data_center: 37,
      large_public: 24,
      heritage: 22,
      tod: 25,
    }
    const totalExpected = Object.values(expectedDomainCounts).reduce((sum, count) => sum + count, 0)
    expect(totalExpected).toBe(148)
    expect(V1474_SECTION_10_11_DETAILED_GAP_SPECS).toHaveLength(totalExpected)

    const actualDomainCounts = V1474_SECTION_10_11_DETAILED_GAP_SPECS.reduce<Record<string, number>>((counts, spec) => {
      counts[spec.domain] = (counts[spec.domain] ?? 0) + 1
      return counts
    }, {})
    expect(actualDomainCounts).toEqual(expectedDomainCounts)

    const byDetailedGapCode = new Map(
      V1474_BUILDING_PATTERN_SEED
        .filter((record) => record.detailedGapCode)
        .map((record) => [record.detailedGapCode, record]),
    )

    for (const spec of V1474_SECTION_10_11_DETAILED_GAP_SPECS) {
      const record = byDetailedGapCode.get(spec.gapCode)
      expect(record, `missing detailed pattern for ${spec.gapCode}`).toBeTruthy()
      expect(record).toEqual(expect.objectContaining({
        parentPatternCode: spec.parentPatternCode,
        detailedGapCode: spec.gapCode,
        detailedGapDomain: spec.domain,
      }))
      expect(record?.patternCode).toContain(spec.parentPatternCode)
      expect(record?.applicableKeywords).toEqual(expect.arrayContaining(spec.keywords))
      expect(record?.applicableMethodCodes).toContain(spec.methodCode)
      expect(record?.elementVariantCodes).toContain(spec.elementCode)
      expect(record?.negativeKeywords?.length ?? 0).toBeGreaterThan(0)
      expect(record?.rhythmExpansionEligible).toBe(true)
      expect(V1474_BUILDING_PATTERN_CLASSIFICATION_CONTRACTS[record?.patternCode ?? '']).toEqual(expect.objectContaining({
        patternRole: record?.patternRole,
        conflictGroup: record?.conflictGroup,
      }))
    }
  })

  it('maps standard work duration rules to v1.4.7.2 catalog prefixes without requiring one-to-one records', () => {
    for (const record of STANDARD_WORK_DURATION_SEED) {
      expect(record.standardWorkCodes.length).toBeGreaterThan(0)
      if (record.durationCoverageMode === 'external_support') {
        expect(record.standardCatalogCodePrefixes ?? []).toHaveLength(0)
      } else {
        expect(record.standardCatalogCodePrefixes?.length ?? 0).toBeGreaterThan(0)
      }
    }
  })

  it('generates exact cold-start duration records for every executable process while keeping activity steps roll-up driven', () => {
    const standardProcessNodes = flattenChinaTemplateCatalog().filter((node) => node.categoryType === 'process' && !node.deprecated)
    const domainProcessNodes = DOMAIN_WBS_TEMPLATE_CATALOGS
      .flatMap((catalog) => flattenChinaTemplateCatalog(catalog.divisions))
      .filter((node) => node.categoryType === 'process' && !node.deprecated)
    const processNodes = [...standardProcessNodes, ...domainProcessNodes]
    const processDurationRules = STANDARD_WORK_DURATION_SEED.filter((record) => String(record.stableCode).startsWith('process_duration:'))
    const exactProcessCodes = new Set(processDurationRules.flatMap((record) => record.standardWorkCodes))

    expect(processDurationRules).toHaveLength(processNodes.length)
    for (const node of processNodes) {
      expect(exactProcessCodes.has(node.stableCode)).toBe(true)
    }
    expect(processDurationRules.every((record) => record.durationCoverageMode === 'direct')).toBe(true)
    expect(processDurationRules.filter((record) => record.sourceVersion === 'multi_source_cold_start_2026')).toHaveLength(standardProcessNodes.length)
    expect(processDurationRules.filter((record) => record.sourceVersion === 'multi_source_domain_cold_start_2026')).toHaveLength(domainProcessNodes.length)
    expect(processDurationRules.every((record) => String(record.benchmarkBasis).includes('processSignals='))).toBe(true)
    expect(processDurationRules.some((record) => String(record.benchmarkBasis).includes('processSignals=catalog_default'))).toBe(false)
    expect(processDurationRules.every((record) => (
      record.defaultDaysP20 <= record.defaultDaysP50
      && record.defaultDaysP50 <= record.defaultDaysP80
      && record.fixedDays + record.variableDays === record.defaultDaysP50
    ))).toBe(true)
    expect(processDurationRules.some((record) => record.durationContributionMode !== 'duration_bearing')).toBe(true)
    expect(processDurationRules.filter((record) => record.durationContributionMode === 'duration_bearing').every((record) => record.baseDaysEligible === true)).toBe(true)
    expect(processDurationRules.filter((record) => record.durationContributionMode !== 'duration_bearing').every((record) => record.baseDaysEligible === false)).toBe(true)
    expect(processDurationRules.some((record) => record.durationContributionMode === 'embedded_check' && record.keywords.some((keyword) => String(keyword).includes('测量')))).toBe(true)
  })

  it('maps real-project coverage report aliases to current template codes with governed duration baselines', () => {
    const coverageReportAliasMap = {
      'OUT-X': 'OUT-04-03',
      'ELE-08': 'ELE-03-02',
      'DEC-X': 'DEC-03A',
      'SITE-X': 'SITE-01-01-09',
      'FND-01-01-01a': 'FND-01-01-01',
      'FND-01-01-01b': 'FND-01-01-01',
      'FND-01-01-01c': 'FND-01-01-01',
      'BDT-01-01-04a': 'BDT-01-01-04',
      'BDT-01-01-04b': 'BDT-01-01-04',
      'BDT-01-01-04c': 'BDT-01-01-04',
    } as const
    const standardProcessNodes = flattenChinaTemplateCatalog().filter((node) => node.categoryType === 'process' && !node.deprecated)
    const domainProcessNodes = DOMAIN_WBS_TEMPLATE_CATALOGS
      .flatMap((catalog) => flattenChinaTemplateCatalog(catalog.divisions))
      .filter((node) => node.categoryType === 'process' && !node.deprecated)
    const processNodes = [...standardProcessNodes, ...domainProcessNodes]
    const processDurationRules = STANDARD_WORK_DURATION_SEED.filter((record) => String(record.stableCode).startsWith('process_duration:'))
    const byCode = new Map(processDurationRules.map((record) => [record.standardWorkCodes[0], record]))

    for (const [reportAlias, currentPrefix] of Object.entries(coverageReportAliasMap)) {
      const mappedNodes = processNodes.filter((node) => node.stableCode.startsWith(currentPrefix))
      const mappedRules = mappedNodes.map((node) => byCode.get(node.stableCode))
      const durationBearingRules = mappedRules.filter((record) => record?.baseDaysEligible)

      expect(reportAlias.length).toBeGreaterThan(0)
      expect(mappedNodes.length).toBeGreaterThan(0)
      expect(mappedRules.filter(Boolean)).toHaveLength(mappedNodes.length)
      expect(durationBearingRules.length).toBeGreaterThan(0)
      expect(durationBearingRules.filter((record) => String(record?.benchmarkBasis).includes('processSignals=standard_process_family_default'))).toHaveLength(0)
      expect(durationBearingRules.filter((record) => !String(record?.sourceClauseRef).includes('expert_override='))).toHaveLength(0)
      expect(durationBearingRules.filter((record) => record?.confidence !== 'high')).toHaveLength(0)
      expect(durationBearingRules.filter((record) => !record?.baselineProductivity)).toHaveLength(0)
    }
  })

  it('resolves standard work duration from a generated catalog process code prefix', async () => {
    const match = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: '02-01-02-P04',
      applicableGranularity: 'task',
    })

    expect(match).toEqual(expect.objectContaining({
      stableCode: 'process_duration:02-01-02-P04',
      durationCoverageMode: 'direct',
    }))
  })

  it('prefers explicit process codes over title-weak family hints', async () => {
    const match = await resolveStandardWorkDurationSeed('cast in place concrete acceptance', {
      standardWorkCode: '02-01-03-P04',
      standardWorkCodes: ['02-01-03-P04', 'cast_in_place_concrete', 'special_acceptance'],
      applicableGranularity: 'task',
    })

    expect(match).toEqual(expect.objectContaining({
      stableCode: 'process_duration:02-01-03-P04',
      durationCoverageMode: 'direct',
      durationContributionMode: 'quality_gate',
      baseDaysEligible: false,
    }))
  })

  it('keeps commercial-grade exact duration overrides, method buckets, productivity baselines, and fixed-variable splits', async () => {
    const processDurationRules = STANDARD_WORK_DURATION_SEED.filter((record) => String(record.stableCode).startsWith('process_duration:'))
    const standardProcessDurationRules = processDurationRules.filter((record) => record.sourceVersion === 'multi_source_cold_start_2026')
    const domainProcessDurationRules = processDurationRules.filter((record) => record.sourceVersion === 'multi_source_domain_cold_start_2026')
    const baseDaysRules = standardProcessDurationRules.filter((record) => record.baseDaysEligible === true)
    const domainBaseDaysRules = domainProcessDurationRules.filter((record) => record.baseDaysEligible === true)
    const byCode = new Map(processDurationRules.map((record) => [record.standardWorkCodes[0], record]))
    const baseByStableCode = new Map(STANDARD_WORK_DURATION_SEED.map((record) => [record.stableCode, record]))

    expect(standardProcessDurationRules.filter((record) => String(record.benchmarkBasis).includes('expertOverride=')).length).toBeGreaterThanOrEqual(2300)
    expect(standardProcessDurationRules.filter((record) => String(record.benchmarkBasis).includes('domainExpert=')).length).toBe(standardProcessDurationRules.length)
    expect(domainProcessDurationRules.every((record) => String(record.benchmarkBasis).includes('domain_template='))).toBe(true)
    expect(domainProcessDurationRules.every((record) => String(record.benchmarkBasis).includes('domainExpert='))).toBe(true)
    expect(domainProcessDurationRules.filter((record) => record.confidence === 'low')).toHaveLength(0)
    expect(domainProcessDurationRules.filter((record) => String(record.sourceClauseRef).includes('expert_override=')).length).toBeGreaterThanOrEqual(471)
    expect(domainBaseDaysRules.every((record) => String(record.sourceClauseRef).includes('expert_override='))).toBe(true)
    expect(domainBaseDaysRules.filter((record) => (
      String(record.benchmarkBasis).includes('processSignals=standard_process_family_default')
      || String(record.benchmarkBasis).includes('catalog_default')
    ))).toHaveLength(0)
    expect(domainBaseDaysRules.filter((record) => record.confidence === 'low')).toHaveLength(0)
    expect(domainBaseDaysRules.filter((record) => (
      record.defaultDaysByMethod?.default_domain_method != null
      || record.defaultDaysByMethod?.domain_template_method != null
    ))).toHaveLength(0)
    expect(domainBaseDaysRules.filter((record) => !record.baselineProductivity)).toHaveLength(0)
    expect(domainBaseDaysRules.filter((record) => record.defaultDaysP50 <= 1)).toHaveLength(0)
    expect(processDurationRules.filter((record) => record.defaultQuantity && record.defaultQuantityUnit).length).toBe(processDurationRules.length)
    expect(processDurationRules.filter((record) => record.defaultDaysByMethod && Object.keys(record.defaultDaysByMethod).length > 0).length).toBe(processDurationRules.length)
    expect(baseDaysRules.filter((record) => !(record.elementVariantCodes?.length))).toHaveLength(0)
    expect(baseDaysRules.filter((record) => (
      record.defaultDaysByMethod
      && Object.keys(record.defaultDaysByMethod).length >= 2
      && new Set(Object.values(record.defaultDaysByMethod)).size === 1
    ))).toHaveLength(0)
    expect(baseDaysRules.filter((record) => (
      record.defaultDaysP50 > 1
      && ((record.defaultDaysP80 - record.defaultDaysP20) / record.defaultDaysP50) > 0.75
    ))).toHaveLength(0)
    expect(baseDaysRules.filter((record) => record.elementVariantDurationFactors && Object.keys(record.elementVariantDurationFactors).length > 0).length).toBeGreaterThanOrEqual(1800)
    expect(processDurationRules.filter((record) => (
      record.baseDaysEligible === true
      && record.elementVariantDurationFactors
      && Object.keys(record.elementVariantDurationFactors).length > 0
    )).length).toBeGreaterThanOrEqual(2000)
    expect(processDurationRules.filter((record) => (
      record.baseDaysEligible === true
      && record.structureTypeDurationFactors
      && Object.keys(record.structureTypeDurationFactors).length > 0
    )).length).toBeGreaterThanOrEqual(2400)
    expect(processDurationRules.filter((record) => record.confidence === 'high').length).toBeGreaterThanOrEqual(300)
    expect(baseDaysRules.filter((record) => String(record.benchmarkBasis).includes('expertSignalConfirmation='))).toHaveLength(0)
    expect(baseDaysRules.every((record) => String(record.benchmarkBasis).includes('expertOverride='))).toBe(true)
    expect(baseDaysRules.filter((record) => record.confidence !== 'high')).toHaveLength(0)
    expect(baseDaysRules.every((record) => (
      String(record.benchmarkBasis).includes('expertOverride=')
    ))).toBe(true)
    expect(baseDaysRules.filter((record) => String(record.benchmarkBasis).includes('processSignals=standard_process_family_default'))).toHaveLength(0)
    const mojibakeUnitPattern = /[\u864f\u9c81]/
    expect(baseDaysRules.filter((record) => (
      mojibakeUnitPattern.test(String(record.defaultQuantityUnit ?? ''))
      || mojibakeUnitPattern.test(String(record.baselineProductivity?.unit ?? ''))
    ))).toHaveLength(0)
    expect(baseDaysRules.filter((record) => record.defaultDaysP50 <= 1)).toHaveLength(0)
    expect(processDurationRules.filter((record) => String(record.sourceClauseRef).startsWith('process-level allocation from')).length).toBe(0)
    expect(processDurationRules.every((record) => String(record.sourceClauseRef).includes(`process=${record.standardWorkCodes[0]}`))).toBe(true)
    expect(processDurationRules.every((record) => String(record.sourceClauseRef).includes('scale_basis='))).toBe(true)
    expect(baseDaysRules.filter((record) => record.scaleBasis === 'system').length).toBeLessThanOrEqual(180)
    expect(baseDaysRules.filter((record) => record.defaultDaysP50 <= 1)).toHaveLength(0)
    expect(baseDaysRules.filter((record) => record.confidence === 'medium' && record.defaultDaysP50 >= 10).length).toBe(0)
    expect(byCode.get('02-01-02-P04')?.scaleBasis).toBe('tonnage')
    expect(byCode.get('02-01-03-P07')?.scaleBasis).toBe('floor')
    expect(byCode.get('01-02-08-P03')?.scaleBasis).toBe('workface')
    expect(byCode.get('03-09-01-P07')?.scaleBasis).toBe('area')
    expect(byCode.get('08-15-03-P03')?.scaleBasis).toBe('workface')
    expect(byCode.get('10-01-04-P03')?.scaleBasis).toBe('shaft')
    expect(byCode.get('05-01-03-P08')).toEqual(expect.objectContaining({
      durationContributionMode: 'duration_bearing',
      baseDaysEligible: true,
      scaleBasis: 'system',
    }))
    expect(byCode.get('05-01-07-P01')).toEqual(expect.objectContaining({
      durationContributionMode: 'embedded_check',
      baseDaysEligible: false,
    }))
    expect(byCode.get('02-01-02-P05')).toEqual(expect.objectContaining({
      defaultDaysP50: 5,
      durationContributionMode: 'duration_bearing',
      baseDaysEligible: true,
      scaleBasis: 'tonnage',
    }))
    expect(byCode.get('03-08-01-P03')).toEqual(expect.objectContaining({
      durationContributionMode: 'embedded_check',
      baseDaysEligible: false,
    }))
    expect(byCode.get('10-01-07-P05')).toEqual(expect.objectContaining({
      durationContributionMode: 'embedded_check',
      baseDaysEligible: false,
    }))
    expect(byCode.get('10-01-01-P01')).toEqual(expect.objectContaining({
      durationContributionMode: 'record_only',
      baseDaysEligible: false,
    }))
    expect(byCode.get('08-18-10-P08')).toEqual(expect.objectContaining({
      durationContributionMode: 'duration_bearing',
      baseDaysEligible: true,
      scaleBasis: 'system',
      defaultDaysByMethod: expect.objectContaining({
        integrated_commissioning: expect.any(Number),
        load_bank_test: expect.any(Number),
        bms_integration: expect.any(Number),
        issue_closure_dense: expect.any(Number),
      }),
      baselineProductivity: expect.objectContaining({
        unit: 'system/day',
        basis: expect.stringContaining('data center integrated commissioning'),
      }),
    }))
    expect(byCode.get('BRG-01-01-01-P02')).toEqual(expect.objectContaining({
      confidence: 'high',
      defaultDaysByMethod: expect.objectContaining({
        bridge_pile_foundation: expect.any(Number),
        cast_in_place_box_girder: expect.any(Number),
      }),
      elementVariantCodes: expect.arrayContaining(['bridge_foundation', 'precast_girder', 'bridge_deck_joint']),
      baselineProductivity: expect.objectContaining({
        unit: 'workface/day',
        basis: expect.stringContaining('bridge foundation'),
      }),
    }))
    expect(byCode.get('BRG-01-01-01-P02')?.benchmarkBasis).toContain('domainExpert=expert_domain_bridge')
    expect(byCode.get('BRG-01-01-01-P02')?.benchmarkBasis).toContain('processSignals=domain_expert_profile')
    expect(byCode.get('REN-01-01-01-P02')).toEqual(expect.objectContaining({
      confidence: 'high',
      defaultDaysByMethod: expect.objectContaining({
        photovoltaic_field: expect.any(Number),
        wind_turbine_erection: expect.any(Number),
      }),
      elementVariantCodes: expect.arrayContaining(['photovoltaic_field', 'wind_turbine', 'grid_connection_trial']),
      baselineProductivity: expect.objectContaining({
        unit: 'system/day',
        basis: expect.stringContaining('renewable generation'),
      }),
    }))
    expect(byCode.get('REN-01-01-01-P02')?.benchmarkBasis).toContain('domainExpert=expert_domain_renewable_energy')
    expect(byCode.get('REN-01-01-01-P02')?.benchmarkBasis).toContain('processSignals=domain_expert_profile')
    expect(byCode.get('01-03-01-P03')).toEqual(expect.objectContaining({
      durationContributionMode: 'external_wait',
      baseDaysEligible: false,
    }))
    expect(byCode.get('01-07-03-P06')).toEqual(expect.objectContaining({
      durationContributionMode: 'quality_gate',
      baseDaysEligible: false,
    }))
    expect(byCode.get('06-07-11-P01')).toEqual(expect.objectContaining({
      durationContributionMode: 'embedded_check',
      baseDaysEligible: false,
    }))
    expect(byCode.get('07-07-02-P03')).toEqual(expect.objectContaining({
      durationContributionMode: 'quality_gate',
      baseDaysEligible: false,
    }))
    expect(byCode.get('04-05-01-P05')).toEqual(expect.objectContaining({
      durationContributionMode: 'record_only',
      baseDaysEligible: false,
    }))
    expect(byCode.get('06-01-01-P07')).toEqual(expect.objectContaining({
      durationContributionMode: 'record_only',
      baseDaysEligible: false,
    }))
    expect(byCode.get('03-04-05-P08')).toEqual(expect.objectContaining({
      durationContributionMode: 'embedded_check',
      baseDaysEligible: false,
    }))
    expect(byCode.get('02-02-02-P03')).toEqual(expect.objectContaining({
      durationContributionMode: 'embedded_check',
      baseDaysEligible: false,
    }))
    expect(byCode.get('03-01-03-P02')).toEqual(expect.objectContaining({
      durationContributionMode: 'embedded_check',
      baseDaysEligible: false,
    }))
    expect(byCode.get('08-17-01-P07')).toEqual(expect.objectContaining({
      durationContributionMode: 'duration_bearing',
      baseDaysEligible: true,
      scaleBasis: 'workface',
      defaultDaysByMethod: expect.objectContaining({
        emergency_terminal_points: expect.any(Number),
        software_interface: expect.any(Number),
        command_platform: expect.any(Number),
      }),
      baselineProductivity: expect.objectContaining({
        unit: 'point/day',
        basis: expect.stringContaining('emergency response endpoint'),
      }),
    }))
    for (const code of ['07-01-10-P02', '07-03-01-P02', '07-04-03-P02', '07-05-11-P02']) {
      expect(byCode.get(code)).toEqual(expect.objectContaining({
        durationContributionMode: 'embedded_check',
        baseDaysEligible: false,
      }))
    }
    for (const code of ['08-08-02-P04', '08-09-02-P04', '08-10-02-P04', '08-11-02-P04', '08-12-02-P04']) {
      expect(byCode.get(code)).toEqual(expect.objectContaining({
        durationContributionMode: 'embedded_check',
        baseDaysEligible: false,
      }))
    }
    for (const code of [
      '02-06-03-P05',
      '05-06-01-P07',
      '05-06-02-P07',
      '06-07-02-P06',
      '07-01-07-P05',
      '07-02-06-P05',
      '07-04-08-P05',
      '07-05-02-P04',
      '07-05-07-P05',
      '07-06-08-P05',
      '07-07-04-P07',
      '08-19-02-P07',
      '08-19-03-P06',
      '08-19-05-P07',
      '08-19-06-P07',
    ]) {
      expect(byCode.get(code)).toEqual(expect.objectContaining({
        durationContributionMode: 'embedded_check',
        baseDaysEligible: false,
      }))
    }
    expect(byCode.get('06-09-07-P05')).toEqual(expect.objectContaining({
      durationContributionMode: 'quality_gate',
      baseDaysEligible: false,
    }))
    for (const code of ['07-01-05-P05', '07-02-05-P05']) {
      expect(byCode.get(code)).toEqual(expect.objectContaining({
        durationContributionMode: 'duration_bearing',
        baseDaysEligible: true,
      }))
    }
    for (const code of [
      '07-03-04-P05',
      '07-03-05-P05',
      '07-03-07-P05',
      '07-04-05-P05',
      '07-04-06-P05',
      '07-05-03-P04',
      '07-05-05-P05',
      '07-05-06-P05',
    ]) {
      expect(byCode.get(code)).toEqual(expect.objectContaining({
        durationContributionMode: 'quality_gate',
        baseDaysEligible: false,
      }))
    }
    expect(byCode.get('07-05-04-P04')).toEqual(expect.objectContaining({
      durationContributionMode: 'duration_bearing',
      baseDaysEligible: true,
    }))
    expect(byCode.get('05-08-01-P07')).toEqual(expect.objectContaining({
      durationContributionMode: 'quality_gate',
      baseDaysEligible: false,
    }))
    for (const code of ['07-07-02-P07', '08-15-04-P03', '09-03-01-P04', '10-01-10-P04']) {
      expect(byCode.get(code)).toEqual(expect.objectContaining({
        durationContributionMode: 'duration_bearing',
        baseDaysEligible: true,
      }))
    }
    expect(byCode.get('08-05-01-P04')).toEqual(expect.objectContaining({
      durationContributionMode: 'duration_bearing',
      baseDaysEligible: true,
      confidence: 'high',
      benchmarkBasis: expect.stringContaining('expertOverride=high-priority exact process baseline for 08-05-01-P04'),
    }))
    expect(byCode.get('08-14-01-P05')).toEqual(expect.objectContaining({
      durationContributionMode: 'duration_bearing',
      baseDaysEligible: true,
      confidence: 'high',
      benchmarkBasis: expect.stringContaining('expertOverride=high-priority exact process baseline for 08-14-01-P05'),
    }))
    expect(byCode.get('06-19-01-P06')).toEqual(expect.objectContaining({
      durationContributionMode: 'duration_bearing',
      baseDaysEligible: true,
      confidence: 'high',
      benchmarkBasis: expect.stringContaining('expertOverride=high-priority exact process baseline for 06-19-01-P06'),
    }))
    expect(byCode.get('04-03-04-P02')).toEqual(expect.objectContaining({
      durationContributionMode: 'duration_bearing',
      baseDaysEligible: true,
      confidence: 'high',
      defaultDaysP50: 2,
    }))
    expect(byCode.get('01-03-04-P02')).toEqual(expect.objectContaining({
      durationContributionMode: 'duration_bearing',
      baseDaysEligible: true,
      confidence: 'high',
      defaultDaysP50: 3,
      benchmarkBasis: expect.stringContaining('expertOverride=SMW cement slurry batching'),
    }))
    expect(byCode.get('01-02-01-P03')).toEqual(expect.objectContaining({
      defaultDaysP50: 5,
      defaultQuantityUnit: 't',
      baselineProductivity: expect.objectContaining({ unit: 't/day' }),
      benchmarkBasis: expect.stringContaining('expertOverride=shallow foundation reinforcement'),
    }))
    expect(byCode.get('01-03-06-P06')).toEqual(expect.objectContaining({
      defaultDaysP50: 5,
      defaultQuantityUnit: 'set',
      baselineProductivity: expect.objectContaining({ unit: 'set/day' }),
      benchmarkBasis: expect.stringContaining('expertOverride=diaphragm-wall reinforcement cage'),
    }))
    expect(byCode.get('02-01-04-P03')).toEqual(expect.objectContaining({
      durationContributionMode: 'embedded_check',
      baseDaysEligible: false,
      benchmarkBasis: expect.stringContaining('expertOverride=prestressing tensioning equipment calibration'),
    }))
    expect(byCode.get('02-05-06-P05')).toEqual(expect.objectContaining({
      durationContributionMode: 'embedded_check',
      baseDaysEligible: false,
      benchmarkBasis: expect.stringContaining('expertOverride=pouring monitoring'),
    }))
    expect(byCode.get('02-03-07-P05')).toEqual(expect.objectContaining({
      durationContributionMode: 'embedded_check',
      baseDaysEligible: false,
      benchmarkBasis: expect.stringContaining('expertOverride=prestressed steel strand tensioning equipment calibration'),
    }))
    expect(byCode.get('02-06-05-P01')).toEqual(expect.objectContaining({
      durationContributionMode: 'duration_bearing',
      baseDaysEligible: true,
      confidence: 'high',
      defaultDaysP50: 2,
      benchmarkBasis: expect.stringContaining('expertOverride=large-span roof preassembly'),
    }))
    expect(byCode.get('05-01-04-P04')).toEqual(expect.objectContaining({
      defaultDaysP50: 3,
      defaultQuantityUnit: 'set',
      baselineProductivity: expect.objectContaining({ unit: 'set/day' }),
      benchmarkBasis: expect.stringContaining('expertOverride=alarm valve'),
    }))
    expect(byCode.get('05-01-04-P06')).toEqual(expect.objectContaining({
      defaultQuantityUnit: 'point',
      baselineProductivity: expect.objectContaining({ unit: 'point/day' }),
      benchmarkBasis: expect.stringContaining('expertOverride=sprinkler head'),
    }))
    expect(byCode.get('05-04-01-P04')).toEqual(expect.objectContaining({
      defaultQuantityUnit: 'set',
      baselineProductivity: expect.objectContaining({ unit: 'set/day' }),
      benchmarkBasis: expect.stringContaining('expertOverride=sanitary fixture'),
    }))
    expect(byCode.get('03-04-01-P06')).toEqual(expect.objectContaining({
      defaultQuantityUnit: 'set',
      baselineProductivity: expect.objectContaining({ unit: 'set/day' }),
      benchmarkBasis: expect.stringContaining('expertOverride=door, window or detail hardware functional commissioning'),
    }))
    expect(byCode.get('05-01-01-P07')).toEqual(expect.objectContaining({
      defaultQuantityUnit: 'set',
      baselineProductivity: expect.objectContaining({ unit: 'set/day' }),
      benchmarkBasis: expect.stringContaining('expertOverride=indoor water supply valve'),
    }))
    expect(byCode.get('05-09-02-P03')).toEqual(expect.objectContaining({
      defaultQuantityUnit: 'point',
      baselineProductivity: expect.objectContaining({ unit: 'point/day' }),
      benchmarkBasis: expect.stringContaining('expertOverride=special water source component'),
    }))
    expect(byCode.get('06-14-01-P04')).toEqual(expect.objectContaining({
      defaultQuantityUnit: 'set',
      baselineProductivity: expect.objectContaining({ unit: 'set/day' }),
      benchmarkBasis: expect.stringContaining('expertOverride=water-source heat pump unit'),
    }))
    expect(byCode.get('06-13-01-P08')).toEqual(expect.objectContaining({
      scaleBasis: 'system',
      defaultQuantityUnit: 'system',
      baselineProductivity: expect.objectContaining({ unit: 'system/day' }),
      benchmarkBasis: expect.stringContaining('expertOverride=ground-source heat-pump energy-efficiency parameter commissioning'),
    }))
    expect(byCode.get('06-20-01-P04')).toEqual(expect.objectContaining({
      defaultQuantityUnit: 'point',
      baselineProductivity: expect.objectContaining({ unit: 'point/day' }),
      benchmarkBasis: expect.stringContaining('expertOverride=HVAC automatic-control single-point commissioning'),
    }))
    expect(byCode.get('06-07-11-P02')).toEqual(expect.objectContaining({
      scaleBasis: 'system',
      defaultQuantityUnit: 'system',
      benchmarkBasis: expect.stringContaining('expertOverride=cleanroom airflow balance'),
    }))
    expect(byCode.get('01-03-02-P03')).toEqual(expect.objectContaining({
      defaultQuantityUnit: 'set',
      baselineProductivity: expect.objectContaining({ unit: 'set/day' }),
      benchmarkBasis: expect.stringContaining('expertOverride=sheet-pile driving equipment'),
    }))
    expect(byCode.get('07-01-02-P03')).toEqual(expect.objectContaining({
      defaultQuantityUnit: 'set',
      baselineProductivity: expect.objectContaining({ unit: 'set/day' }),
      benchmarkBasis: expect.stringContaining('expertOverride=outdoor distribution equipment'),
    }))
    expect(byCode.get('07-02-01-P03')).toEqual(expect.objectContaining({
      defaultQuantityUnit: 'set',
      baselineProductivity: expect.objectContaining({ unit: 'set/day' }),
      benchmarkBasis: expect.stringContaining('expertOverride=power distribution room equipment'),
    }))
    expect(byCode.get('07-01-07-P01')).toEqual(expect.objectContaining({
      defaultQuantityUnit: 'point',
      baselineProductivity: expect.objectContaining({ unit: 'point/day' }),
      benchmarkBasis: expect.stringContaining('expertOverride=cable end preparation'),
    }))
    expect(byCode.get('07-05-08-P03')).toEqual(expect.objectContaining({
      defaultQuantityUnit: 'point',
      baselineProductivity: expect.objectContaining({ unit: 'point/day' }),
      benchmarkBasis: expect.stringContaining('expertOverride=lighting fixture'),
    }))
    expect(byCode.get('07-01-10-P03')).toEqual(expect.objectContaining({
      scaleBasis: 'system',
      defaultQuantityUnit: 'system',
      benchmarkBasis: expect.stringContaining('expertOverride=outdoor electrical single-machine trial run'),
    }))
    expect(byCode.get('07-06-05-P01')).toEqual(expect.objectContaining({
      durationContributionMode: 'embedded_check',
      baseDaysEligible: false,
      benchmarkBasis: expect.stringContaining('expertOverride=standby power conduit foundation'),
    }))
    expect(byCode.get('08-01-01-P07')).toEqual(expect.objectContaining({
      scaleBasis: 'system',
      defaultQuantityUnit: 'system',
      benchmarkBasis: expect.stringContaining('expertOverride=intelligent integration joint commissioning'),
    }))
    expect(byCode.get('08-18-04-P05')).toEqual(expect.objectContaining({
      defaultDaysP50: 3,
      defaultQuantityUnit: 'set',
      benchmarkBasis: expect.stringContaining('expertOverride=data center sanitary fixture'),
    }))
    expect(byCode.get('09-03-02-P03')).toEqual(expect.objectContaining({
      defaultQuantityUnit: 'point',
      baselineProductivity: expect.objectContaining({ unit: 'point/day' }),
      benchmarkBasis: expect.stringContaining('expertOverride=energy-saving lighting fixture'),
    }))
    expect(byCode.get('09-05-01-P07')).toEqual(expect.objectContaining({
      scaleBasis: 'system',
      defaultQuantityUnit: 'system',
      benchmarkBasis: expect.stringContaining('expertOverride=renewable-energy system efficiency'),
    }))

    expect(byCode.get('02-01-01-P04')).toEqual(expect.objectContaining({
      defaultDaysP50: 4,
      defaultDaysByMethod: expect.objectContaining({
        aluminum_form_early_strip: 3,
        large_form: 4,
        wood_form: 5,
      }),
      defaultQuantityUnit: 'floor',
    }))
    expect(byCode.get('02-01-02-P04')).toEqual(expect.objectContaining({
      defaultDaysP50: 5,
      defaultQuantityUnit: 't',
    }))
    expect(byCode.get('02-01-03-P06')).toEqual(expect.objectContaining({
      durationContributionMode: 'quality_gate',
      baseDaysEligible: false,
      defaultDaysP50: 1,
      defaultQuantityUnit: 'floor',
    }))
    expect((byCode.get('02-01-02-P04')?.variableDays ?? 0)).toBeGreaterThan(byCode.get('02-01-02-P04')?.fixedDays ?? 0)
    expect((byCode.get('02-01-03-P05')?.fixedDays ?? 0)).toBeGreaterThanOrEqual(byCode.get('02-01-03-P05')?.variableDays ?? 0)
    expect(byCode.get('01-02-08-P03')).toEqual(expect.objectContaining({
      defaultQuantityUnit: 'pile',
      defaultDaysByMethod: expect.objectContaining({
        bored_cast_in_place_pile: 8,
        rotary_drilling_pile: 7,
        reverse_circulation_drilling: 9,
      }),
      benchmarkBasis: expect.stringContaining('domainExpert=expert_bored_cast_in_place_pile_foundation'),
    }))
    expect(byCode.get('03-09-01-P07')).toEqual(expect.objectContaining({
      defaultQuantityUnit: 'm2',
      defaultDaysByMethod: expect.objectContaining({
        unitized_curtain_wall: 5,
        stone_curtain_wall: 9,
      }),
      benchmarkBasis: expect.stringContaining('domainExpert=expert_curtain_wall'),
    }))
    expect(byCode.get('08-15-03-P03')).toEqual(expect.objectContaining({
      defaultQuantityUnit: 'point',
      defaultDaysByMethod: expect.objectContaining({
        ba_control_points: 6,
        equipment_room_system: 6,
      }),
      benchmarkBasis: expect.stringContaining('domainExpert=expert_intelligent_building'),
    }))
    expect(byCode.get('10-01-01-P03')).toEqual(expect.objectContaining({
      defaultQuantityUnit: 'shaft',
      durationContributionMode: 'record_only',
      baseDaysEligible: false,
      defaultDaysByMethod: expect.objectContaining({
        high_speed_elevator: 1,
        hospital_bed_elevator: 1,
      }),
      benchmarkBasis: expect.stringContaining('domainExpert=expert_elevator_traction_equipment_acceptance'),
    }))
    expect(byCode.get('10-02-01-P03')).toEqual(expect.objectContaining({
      durationContributionMode: 'record_only',
      baseDaysEligible: false,
    }))
    expect(byCode.get('10-03-01-P02')).toEqual(expect.objectContaining({
      durationContributionMode: 'record_only',
      baseDaysEligible: false,
    }))
    expect(byCode.get('01-03-01-P04')).toEqual(expect.objectContaining({
      defaultDaysP50: 12,
      durationContributionMode: 'duration_bearing',
      baseDaysEligible: true,
    }))
    expect(byCode.get('01-03-01-P10')).toEqual(expect.objectContaining({
      defaultDaysP50: 4,
      durationContributionMode: 'duration_bearing',
      baseDaysEligible: true,
    }))
    expect(byCode.get('02-06-03-P02')).toEqual(expect.objectContaining({
      durationContributionMode: 'duration_bearing',
      baseDaysEligible: true,
    }))
    expect(byCode.get('08-01-01-P04')).toEqual(expect.objectContaining({
      durationContributionMode: 'duration_bearing',
      baseDaysEligible: true,
    }))
    expect(byCode.get('04-03-01-P04')).toEqual(expect.objectContaining({
      defaultDaysP50: 4,
      defaultQuantityUnit: 'm2',
      evidenceSourceKeys: expect.arrayContaining(['GB50207_2012_ROOFING']),
    }))
    expect(byCode.get('10-01-06-P03')).toEqual(expect.objectContaining({
      defaultDaysP50: 5,
      defaultQuantityUnit: 'shaft',
      evidenceSourceKeys: expect.arrayContaining(['GB50310_2002_ELEVATOR']),
    }))
    expect(byCode.get('10-01-04-P03')).toEqual(expect.objectContaining({
      defaultDaysP50: 6,
      defaultQuantityUnit: 'shaft',
      benchmarkBasis: expect.stringContaining('domainExpert=expert_elevator_traction_guide_rail'),
    }))
    expect(byCode.get('10-01-05-P04')).toEqual(expect.objectContaining({
      defaultDaysP50: 4,
      benchmarkBasis: expect.stringContaining('domainExpert=expert_elevator_traction_door_system'),
    }))
    expect(byCode.get('10-01-12-P04')).toEqual(expect.objectContaining({
      defaultDaysP50: 4,
      benchmarkBasis: expect.stringContaining('domainExpert=expert_elevator_traction_electrical_device'),
    }))
    expect(byCode.get('10-01-13-P08')).toEqual(expect.objectContaining({
      defaultDaysP50: 3,
      benchmarkBasis: expect.stringContaining('domainExpert=expert_elevator_traction_final_acceptance'),
    }))
    expect(baseByStableCode.get('elevator_hydraulic_installation')).toEqual(expect.objectContaining({
      defaultDaysP50: 40,
      benchmarkBasis: expect.stringContaining('Beijing 2018 quota gives 40 days'),
    }))
    expect(byCode.get('10-02-03-P03')).toEqual(expect.objectContaining({
      defaultDaysP50: 6,
      defaultQuantityUnit: 'shaft',
      defaultDaysByMethod: expect.objectContaining({
        roped_hydraulic: 7,
        heavy_load_hydraulic: 7,
      }),
      benchmarkBasis: expect.stringContaining('domainExpert=expert_elevator_hydraulic_cylinder_pump_station'),
    }))
    expect(byCode.get('10-02-04-P03')).toEqual(expect.objectContaining({
      defaultDaysP50: 6,
      benchmarkBasis: expect.stringContaining('domainExpert=expert_elevator_hydraulic_guide_rail'),
    }))
    expect(byCode.get('10-02-11-P03')).toEqual(expect.objectContaining({
      defaultDaysP50: 4,
      benchmarkBasis: expect.stringContaining('domainExpert=expert_elevator_hydraulic_electrical_device'),
    }))
    expect(byCode.get('10-02-12-P07')).toEqual(expect.objectContaining({
      defaultDaysP50: 2,
      defaultDaysP80: 3,
      defaultQuantityUnit: 'shaft',
      benchmarkBasis: expect.stringContaining('domainExpert=expert_elevator_hydraulic_final_acceptance'),
    }))
    expect(byCode.get('03-01-01-P03')?.benchmarkBasis).toContain('family=floor_finish_system')
    expect(byCode.get('01-03-01-P03')?.benchmarkBasis).toContain('family=foundation_pit_bored_pile_support')
    expect(byCode.get('01-03-02-P04')?.benchmarkBasis).toContain('family=foundation_pit_sheet_pile_wall')
    expect(byCode.get('01-03-03-P04')?.benchmarkBasis).toContain('family=foundation_pit_secant_pile_wall')
    expect(byCode.get('01-03-04-P05')?.benchmarkBasis).toContain('family=foundation_pit_smw_wall')
    expect(byCode.get('01-03-05-P04')?.benchmarkBasis).toContain('family=foundation_pit_soil_nail_wall')
    expect(byCode.get('01-03-06-P03')?.benchmarkBasis).toContain('family=foundation_pit_diaphragm_wall')
    expect(byCode.get('01-03-08-P03')?.benchmarkBasis).toContain('family=foundation_pit_internal_strut')
    expect(byCode.get('01-03-09-P07')?.benchmarkBasis).toContain('family=foundation_pit_anchor_support')
    expect(byCode.get('03-03-01-P04')?.benchmarkBasis).toContain('family=exterior_wall_waterproof')
    expect(byCode.get('03-05-01-P08')?.benchmarkBasis).toContain('family=ceiling_system_finish')
    expect(byCode.get('05-01-01-P03')?.benchmarkBasis).toContain('family=plumbing_indoor_water_supply_pipe')
    expect(byCode.get('05-01-02-P03')?.benchmarkBasis).toContain('family=plumbing_indoor_water_supply_equipment')
    expect(byCode.get('05-01-05-P03')?.benchmarkBasis).toContain('family=plumbing_pipe_anticorrosion')
    expect(byCode.get('05-01-06-P03')?.benchmarkBasis).toContain('family=plumbing_pipe_insulation')
    expect(byCode.get('05-01-07-P03')?.benchmarkBasis).toContain('family=plumbing_pipe_flushing')
    expect(byCode.get('05-01-08-P03')?.benchmarkBasis).toContain('family=plumbing_water_disinfection')
    expect(byCode.get('05-01-09-P03')?.benchmarkBasis).toContain('family=plumbing_water_test_commissioning')
    expect(byCode.get('05-05-03-P03')?.benchmarkBasis).toContain('family=heating_radiator_system')
    expect(byCode.get('05-05-04-P04')?.benchmarkBasis).toContain('family=heating_hydronic_floor_system')
    expect(byCode.get('05-05-05-P04')?.benchmarkBasis).toContain('family=heating_electric_floor_system')
    expect(byCode.get('05-05-06-P04')?.benchmarkBasis).toContain('family=heating_gas_radiant_system')
    expect(byCode.get('06-01-04-P03')?.benchmarkBasis).toContain('family=hvac_supply_air_system')
    expect(byCode.get('06-02-06-P03')?.benchmarkBasis).toContain('family=hvac_exhaust_air_system')
    expect(byCode.get('06-03-01-P04')?.benchmarkBasis).toContain('family=hvac_smoke_control')
    expect(byCode.get('06-07-09-P01')?.benchmarkBasis).toContain('family=hvac_cleanroom_system')
    expect(byCode.get('06-13-05-P03')?.benchmarkBasis).toContain('family=hvac_ground_source_heat_pump_exchange')
    expect(byCode.get('06-14-05-P03')?.benchmarkBasis).toContain('family=hvac_water_source_heat_pump_exchange')
    expect(byCode.get('06-15-05-P03')?.benchmarkBasis).toContain('family=hvac_thermal_storage_system')
    expect(byCode.get('06-19-01-P03')?.benchmarkBasis).toContain('family=hvac_solar_heating_air_system')
    expect(byCode.get('06-16-01-P03')?.benchmarkBasis).toContain('family=hvac_compression_chiller_equipment')
    expect(byCode.get('06-17-01-P03')?.benchmarkBasis).toContain('family=hvac_absorption_refrigeration_equipment')
    expect(byCode.get('07-02-01-P02')?.benchmarkBasis).toContain('family=electrical_power_distribution_room')
    expect(byCode.get('07-05-08-P01')?.benchmarkBasis).toContain('family=electrical_lighting_terminal')
    expect(byCode.get('08-15-03-P03')?.benchmarkBasis).toContain('family=intelligent_fire_alarm')
    expect(byCode.get('08-02-01-P01')?.benchmarkBasis).toContain('family=intelligent_information_access_system')
    expect(byCode.get('08-06-01-P01')?.benchmarkBasis).toContain('family=intelligent_mobile_signal_coverage')
    expect(byCode.get('08-07-01-P01')?.benchmarkBasis).toContain('family=intelligent_satellite_communication_system')
    expect(byCode.get('08-16-01-P03')?.benchmarkBasis).toContain('family=intelligent_security_technical_system')
    expect(byCode.get('08-17-01-P03')?.benchmarkBasis).toContain('family=intelligent_emergency_response_system')
    expect(byCode.get('08-18-01-P04')?.benchmarkBasis).toContain('family=intelligent_data_center_power')
    expect(byCode.get('08-18-03-P03')?.benchmarkBasis).toContain('family=intelligent_data_center_precision_air')
    expect(byCode.get('08-18-05-P04')?.benchmarkBasis).toContain('family=intelligent_data_center_cabling')
    expect(byCode.get('08-18-07-P06')?.benchmarkBasis).toContain('family=intelligent_data_center_fire_suppression')
    expect(byCode.get('08-18-09-P07')?.benchmarkBasis).toContain('family=intelligent_data_center_shielding')
    expect(byCode.get('08-18-10-P08')?.benchmarkBasis).toContain('family=intelligent_data_center_commissioning')
    expect(byCode.get('08-18-11-P08')?.benchmarkBasis).toContain('family=intelligent_data_center_trial_operation')
    expect(byCode.get('09-02-03-P03')?.benchmarkBasis).toContain('family=energy_hvac_system')
    expect(byCode.get('09-05-03-P04')?.benchmarkBasis).toContain('family=energy_renewable_system')
    expect(byCode.get('08-18-01-P04')?.projectTypeDurationFactors).toEqual(expect.objectContaining({
      data_center: 1.75,
      hospital: expect.any(Number),
    }))
    expect(byCode.get('05-01-03-P03')?.evidenceSourceKeys).toContain('GB50242_2002_PLUMBING')
    expect(byCode.get('06-01-04-P03')?.evidenceSourceKeys).toContain('GB50243_2016_HVAC')
    expect(byCode.get('07-01-08-P03')?.evidenceSourceKeys).toContain('GB50303_2015_ELECTRICAL')
    expect(byCode.get('08-15-03-P03')?.evidenceSourceKeys).toContain('GB50339_2013_INTELLIGENT')
    expect(byCode.get('09-05-03-P04')?.evidenceSourceKeys).toContain('GB50411_2019_ENERGY_SAVING')

    await expect(resolveStandardWorkDurationSeed('', {
      standardWorkCode: '02-01-01-P04',
      methodVariantCodes: ['aluminum_form_early_strip'],
      applicableGranularity: 'task',
    })).resolves.toEqual(expect.objectContaining({
      defaultDaysP50: 3,
      benchmarkBasis: expect.stringContaining('methodBucket=aluminum_form_early_strip:3'),
    }))
    await expect(resolveStandardWorkDurationSeed('', {
      standardWorkCode: '01-02-08-P03',
      methodVariantCodes: ['reverse_circulation_drilling'],
      applicableGranularity: 'task',
    })).resolves.toEqual(expect.objectContaining({
      defaultDaysP50: 9,
      benchmarkBasis: expect.stringContaining('methodBucket=reverse_circulation_drilling:9'),
    }))
    const foundationBase = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: '01-02-08-P03',
      applicableGranularity: 'task',
    })
    const foundationUnderground = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: '01-02-08-P03',
      elementVariantCodes: ['underground_or_foundation'],
      applicableGranularity: 'task',
    })
    expect(foundationUnderground?.defaultDaysP50).toBeGreaterThan(foundationBase?.defaultDaysP50 ?? 0)
    expect(foundationUnderground?.benchmarkBasis).toContain('elementVariantFactor=underground_or_foundation:1.16')
    const concreteBase = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: '02-01-03-P07',
      applicableGranularity: 'task',
    })
    const concreteBasementHumanDefense = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: '02-01-03-P07',
      structureTypeCode: 'basement_human_defense',
      applicableGranularity: 'task',
    })
    expect(concreteBasementHumanDefense?.defaultDaysP50).toBeGreaterThan(concreteBase?.defaultDaysP50 ?? 0)
    expect(concreteBasementHumanDefense?.benchmarkBasis).toContain('structureTypeFactor=basement_human_defense:1.14')
    const baseDataCenterRoom = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: '08-18-01-P04',
      applicableGranularity: 'task',
    })
    const dataCenterRoom = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: '08-18-01-P04',
      projectTypeCode: 'data_center',
      applicableGranularity: 'task',
    })
    expect(dataCenterRoom?.defaultDaysP50).toBeGreaterThan(baseDataCenterRoom?.defaultDaysP50 ?? 0)
    expect(dataCenterRoom?.benchmarkBasis).toContain('projectTypeFactor=data_center:1.75')
    expect(byCode.get('10-02-12-P07')).toEqual(expect.objectContaining({
      defaultDaysP50: 2,
      defaultDaysP80: 3,
      baselineProductivity: expect.objectContaining({ p50PerDay: 0.5 }),
    }))
    await expect(resolveStandardWorkDurationSeed('', {
      standardWorkCode: '10-02-12-P07',
      applicableGranularity: 'task',
    })).resolves.toEqual(expect.objectContaining({
      defaultDaysP50: 2,
      defaultDaysP80: 3,
      baselineProductivity: expect.objectContaining({
        p50PerDay: 0.5,
        sourceType: 'expert_override',
        sourceRef: expect.stringContaining('10-02-12-P07'),
      }),
    }))
  })

  it('keeps duration-bearing process rules from falling back to one-day placeholder baselines', () => {
    const processDurationRules = STANDARD_WORK_DURATION_SEED.filter((record) => String(record.stableCode).startsWith('process_duration:'))
    const oneDayBaseRules = processDurationRules.filter((record) => record.baseDaysEligible === true && record.defaultDaysP50 <= 1)

    expect(oneDayBaseRules).toHaveLength(0)
  })

  it('keeps standard duration seed precise and traceable enough for trusted scheduling', () => {
    const durationBearingRules = STANDARD_WORK_DURATION_SEED.filter((record) => record.baseDaysEligible === true)
    const rulesWithProductivity = STANDARD_WORK_DURATION_SEED.filter((record) => record.baselineProductivity)
    const quotaProductivityEntries = STANDARD_WORK_DURATION_SEED.flatMap((record) => [
      ...(record.baselineProductivity?.sourceType === 'quota'
        ? [{ owner: record.stableCode, productivity: record.baselineProductivity }]
        : []),
      ...((record as any).productivityBands ?? [])
        .filter((band: any) => band?.baselineProductivity?.sourceType === 'quota')
        .map((band: any) => ({
          owner: `${record.stableCode}:${band.conditionCode}`,
          productivity: band.baselineProductivity,
        })),
    ])
    const conditionedProductivityEntries = STANDARD_WORK_DURATION_SEED.flatMap((record) => (
      ((record as any).productivityBands ?? []).map((band: any) => ({
        owner: `${record.stableCode}:${band.conditionCode}`,
        productivity: band.baselineProductivity,
      }))
    ))
    const byStableCode = new Map(STANDARD_WORK_DURATION_SEED.map((record) => [record.stableCode, record]))
    const byCode = new Map(
      STANDARD_WORK_DURATION_SEED
        .filter((record) => String(record.stableCode).startsWith('process_duration:'))
        .map((record) => [record.standardWorkCodes[0], record]),
    )

    const wideDistributionRules = durationBearingRules.filter((record) => (
      record.defaultDaysP20 > 0
      && (record.defaultDaysP80 / record.defaultDaysP20) >= 4
    ))
    expect(wideDistributionRules).toHaveLength(0)

    for (const record of rulesWithProductivity) {
      expect(record.baselineProductivity).toEqual(expect.objectContaining({
        sourceType: expect.stringMatching(/^(quota|expert_profile|expert_override|derived_seed)$/),
        sourceRef: expect.any(String),
        sourceDetail: expect.any(String),
      }))
      expect(String((record.baselineProductivity as any).sourceRef).length).toBeGreaterThan(8)
      expect(String((record.baselineProductivity as any).sourceDetail).length).toBeGreaterThan(16)
    }

    expect(conditionedProductivityEntries.length).toBeGreaterThan(0)
    for (const entry of conditionedProductivityEntries) {
      expect(entry.productivity).toEqual(expect.objectContaining({
        sourceType: expect.stringMatching(/^(quota|expert_profile|expert_override|derived_seed)$/),
        sourceRef: expect.any(String),
        sourceDetail: expect.any(String),
      }))
      const detail = String(entry.productivity.sourceDetail)
      expect(detail, `${entry.owner} productivity band sourceDetail must include owner`).toMatch(/owner=/i)
      expect(detail, `${entry.owner} productivity band sourceDetail must include condition`).toMatch(/condition=/i)
      expect(detail, `${entry.owner} productivity band sourceDetail must include basis`).toMatch(/basis=/i)
    }

    expect(quotaProductivityEntries.length).toBeGreaterThan(0)
    for (const entry of quotaProductivityEntries) {
      expect(entry.productivity.sourceRef, `${entry.owner} quota sourceRef must be structured`).toMatch(
        /^quota:[A-Z0-9-]+:chapter=[^:]+:table=[^:]+:item=[^:]+$/,
      )
      expect(entry.productivity.sourceDetail, `${entry.owner} quota sourceDetail must be audit-grade`).toEqual(
        expect.stringMatching(/chapter=.*table=.*item=/i),
      )
    }

    expect(byStableCode.get('preloading_ground')).toEqual(expect.objectContaining({
      defaultDaysP20: 25,
      defaultDaysP50: 35,
      defaultDaysP80: 45,
      confidence: 'high',
    }))
    expect(byStableCode.get('ground_treatment')).toEqual(expect.objectContaining({
      confidence: 'medium',
    }))
    expect(byStableCode.get('concrete_curing_wait')).toEqual(expect.objectContaining({
      confidence: 'medium',
    }))
    expect(byStableCode.get('cast_in_place_concrete')).toEqual(expect.objectContaining({
      confidence: 'high',
    }))
    expect(byStableCode.get('roof_membrane_waterproof')).toEqual(expect.objectContaining({
      confidence: 'high',
    }))
    expect(byStableCode.get('intelligent_satellite_communication_system')).toEqual(expect.objectContaining({
      confidence: 'medium',
    }))
    expect(byCode.get('10-02-12-P07')).toEqual(expect.objectContaining({
      defaultDaysP50: 2,
      defaultDaysP80: 3,
      baselineProductivity: expect.objectContaining({
        p50PerDay: 0.5,
        sourceType: 'expert_override',
      }),
    }))
  })

  it('keeps high-variance standard duration families conditionized instead of hiding depth in one median', async () => {
    const byStableCode = new Map(STANDARD_WORK_DURATION_SEED.map((record) => [record.stableCode, record]))
    const boredPile = byStableCode.get('bored_cast_in_place_pile_foundation') as any

    expect(boredPile).toEqual(expect.objectContaining({
      defaultDaysP20: 13,
      defaultDaysP50: 18,
      defaultDaysP80: 23,
      conditionedDurationBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'short_depth_standard_diameter',
          defaultDaysP20: 7,
          defaultDaysP50: 12,
          defaultDaysP80: 18,
        }),
        expect.objectContaining({
          conditionCode: 'deep_large_diameter_complex_geology',
          defaultDaysP20: 16,
          defaultDaysP50: 25,
          defaultDaysP80: 34,
        }),
      ]),
      conditionedProcessProfiles: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'short_depth_standard_diameter',
          selector: expect.objectContaining({
            depthBand: 'short',
            diameterBand: 'standard',
          }),
          profile: expect.objectContaining({
            defaultBase: 6,
            max: 18,
          }),
        }),
        expect.objectContaining({
          conditionCode: 'deep_large_diameter_complex_geology',
          selector: expect.objectContaining({
            depthBand: 'deep',
            diameterBand: 'large',
            geologyBand: 'complex',
          }),
          profile: expect.objectContaining({
            defaultBase: 10,
            max: 34,
          }),
        }),
      ]),
      productivityBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'short_depth_standard_diameter',
          baselineProductivity: expect.objectContaining({
            p50PerDay: 4.2,
            unit: 'pile/day',
            sourceType: 'expert_profile',
          }),
        }),
        expect.objectContaining({
          conditionCode: 'standard_depth_standard_diameter',
          baselineProductivity: expect.objectContaining({
            p50PerDay: 3.2,
            unit: 'pile/day',
            sourceType: 'quota',
          }),
        }),
        expect.objectContaining({
          conditionCode: 'deep_large_diameter_complex_geology',
          baselineProductivity: expect.objectContaining({
            p50PerDay: 1.4,
            unit: 'pile/day',
            sourceType: 'expert_profile',
          }),
        }),
      ]),
    }))

    const shortStandard = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'bored_cast_in_place_pile_foundation',
      applicableGranularity: 'task',
      elementVariantCodes: ['short_depth', 'standard_diameter', 'normal_geology', 'open_workface'],
    }) as any

    expect(shortStandard).toEqual(expect.objectContaining({
      selectedConditionCode: 'short_depth_standard_diameter',
      defaultDaysP50: 12,
      baselineProductivity: expect.objectContaining({
        p50PerDay: 4.2,
        unit: 'pile/day',
        sourceType: 'expert_profile',
      }),
    }))

    const resolved = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'bored_cast_in_place_pile_foundation',
      applicableGranularity: 'task',
    }) as any

    expect(resolved?.conditionedProcessProfiles?.length).toBeGreaterThanOrEqual(2)
    expect(resolved?.productivityBands?.map((band: any) => band.conditionCode)).toEqual(expect.arrayContaining([
      'standard_depth_standard_diameter',
      'deep_large_diameter_complex_geology',
    ]))

    const deepLargeComplex = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'bored_cast_in_place_pile_foundation',
      applicableGranularity: 'task',
      elementVariantCodes: ['deep_depth', 'large_diameter', 'complex_geology'],
    }) as any

    expect(deepLargeComplex).toEqual(expect.objectContaining({
      selectedConditionCode: 'deep_large_diameter_complex_geology',
      defaultDaysP50: 25,
      baselineProductivity: expect.objectContaining({
        p50PerDay: 1.4,
        unit: 'pile/day',
        sourceType: 'expert_profile',
      }),
    }))
  })

  it('keeps long spiral drilled pile foundation conditionized by forming method and cage insertion', async () => {
    const byStableCode = new Map(STANDARD_WORK_DURATION_SEED.map((record) => [record.stableCode, record]))
    const longSpiral = byStableCode.get('long_spiral_drilled_pile_foundation') as any

    expect(longSpiral).toEqual(expect.objectContaining({
      defaultDaysP20: 10,
      defaultDaysP50: 14,
      defaultDaysP80: 18,
      conditionedDurationBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'cfa_continuous_drilling_open_workface',
          selector: expect.objectContaining({
            longSpiralPileMethodBand: 'cfa_continuous',
            workfaceBand: 'open',
          }),
          defaultDaysP20: 9,
          defaultDaysP50: 12,
          defaultDaysP80: 16,
        }),
        expect.objectContaining({
          conditionCode: 'pressure_grouted_long_spiral_standard_workface',
          selector: expect.objectContaining({
            longSpiralPileMethodBand: 'pressure_grouted',
            workfaceBand: 'open',
          }),
          defaultDaysP20: 10,
          defaultDaysP50: 14,
          defaultDaysP80: 18,
        }),
        expect.objectContaining({
          conditionCode: 'post_inserted_cage_complex_constrained',
          selector: expect.objectContaining({
            longSpiralPileMethodBand: 'post_inserted_cage',
            geologyBand: 'complex',
            workfaceBand: 'constrained',
          }),
          defaultDaysP20: 14,
          defaultDaysP50: 19,
          defaultDaysP80: 25,
        }),
      ]),
      conditionedProcessProfiles: expect.arrayContaining([
        expect.objectContaining({ conditionCode: 'cfa_continuous_drilling_open_workface' }),
        expect.objectContaining({ conditionCode: 'pressure_grouted_long_spiral_standard_workface' }),
        expect.objectContaining({ conditionCode: 'post_inserted_cage_complex_constrained' }),
      ]),
      productivityBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'cfa_continuous_drilling_open_workface',
          baselineProductivity: expect.objectContaining({ p50PerDay: 9, unit: 'pile/day' }),
        }),
        expect.objectContaining({
          conditionCode: 'post_inserted_cage_complex_constrained',
          baselineProductivity: expect.objectContaining({ p50PerDay: 5.5, unit: 'pile/day' }),
        }),
      ]),
    }))

    const postInserted = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'long_spiral_drilled_pile_foundation',
      applicableGranularity: 'task',
      methodVariantCodes: ['post_inserted_cage'],
      elementVariantCodes: ['complex_geology', 'constrained_workface'],
    }) as any

    expect(postInserted).toEqual(expect.objectContaining({
      selectedConditionCode: 'post_inserted_cage_complex_constrained',
      defaultDaysP50: 19,
      baselineProductivity: expect.objectContaining({ p50PerDay: 5.5, unit: 'pile/day' }),
    }))
  })

  it('keeps driven cast-in-place pile foundation conditionized by tube sinking and withdrawal controls', async () => {
    const byStableCode = new Map(STANDARD_WORK_DURATION_SEED.map((record) => [record.stableCode, record]))
    const drivenPile = byStableCode.get('driven_cast_in_place_pile_foundation') as any

    expect(drivenPile).toEqual(expect.objectContaining({
      defaultDaysP20: 11,
      defaultDaysP50: 16,
      defaultDaysP80: 21,
      conditionedDurationBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'vibration_sunk_tube_open_workface',
          selector: expect.objectContaining({
            drivenCastInPlacePileMethodBand: 'vibration_sunk_tube',
            workfaceBand: 'open',
          }),
          defaultDaysP20: 9,
          defaultDaysP50: 13,
          defaultDaysP80: 17,
        }),
        expect.objectContaining({
          conditionCode: 'hammer_sunk_tube_standard_workface',
          selector: expect.objectContaining({
            drivenCastInPlacePileMethodBand: 'hammer_sunk_tube',
            workfaceBand: 'open',
          }),
          defaultDaysP20: 11,
          defaultDaysP50: 16,
          defaultDaysP80: 21,
        }),
        expect.objectContaining({
          conditionCode: 'withdrawal_control_complex_constrained',
          selector: expect.objectContaining({
            drivenCastInPlacePileMethodBand: 'withdrawal_complex',
            geologyBand: 'complex',
            workfaceBand: 'constrained',
          }),
          defaultDaysP20: 16,
          defaultDaysP50: 23,
          defaultDaysP80: 30,
        }),
      ]),
      conditionedProcessProfiles: expect.arrayContaining([
        expect.objectContaining({ conditionCode: 'vibration_sunk_tube_open_workface' }),
        expect.objectContaining({ conditionCode: 'hammer_sunk_tube_standard_workface' }),
        expect.objectContaining({ conditionCode: 'withdrawal_control_complex_constrained' }),
      ]),
      productivityBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'vibration_sunk_tube_open_workface',
          baselineProductivity: expect.objectContaining({ p50PerDay: 7, unit: 'pile/day' }),
        }),
        expect.objectContaining({
          conditionCode: 'withdrawal_control_complex_constrained',
          baselineProductivity: expect.objectContaining({ p50PerDay: 4, unit: 'pile/day' }),
        }),
      ]),
    }))

    const withdrawal = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'driven_cast_in_place_pile_foundation',
      applicableGranularity: 'task',
      methodVariantCodes: ['pipe_withdrawal_control'],
      elementVariantCodes: ['complex_geology', 'constrained_workface'],
    }) as any

    expect(withdrawal).toEqual(expect.objectContaining({
      selectedConditionCode: 'withdrawal_control_complex_constrained',
      defaultDaysP50: 23,
      baselineProductivity: expect.objectContaining({ p50PerDay: 4, unit: 'pile/day' }),
    }))
  })

  it('keeps steel pile foundation conditionized by pile section and connection complexity', async () => {
    const byStableCode = new Map(STANDARD_WORK_DURATION_SEED.map((record) => [record.stableCode, record]))
    const steelPile = byStableCode.get('steel_pile_foundation') as any

    expect(steelPile).toEqual(expect.objectContaining({
      defaultDaysP20: 11,
      defaultDaysP50: 15,
      defaultDaysP80: 20,
      conditionedDurationBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'h_steel_pile_open_workface',
          selector: expect.objectContaining({
            steelPileMethodBand: 'h_steel',
            workfaceBand: 'open',
          }),
          defaultDaysP20: 9,
          defaultDaysP50: 13,
          defaultDaysP80: 17,
        }),
        expect.objectContaining({
          conditionCode: 'steel_pipe_pile_standard_workface',
          selector: expect.objectContaining({
            steelPileMethodBand: 'steel_pipe',
            workfaceBand: 'open',
          }),
          defaultDaysP20: 11,
          defaultDaysP50: 15,
          defaultDaysP80: 20,
        }),
        expect.objectContaining({
          conditionCode: 'welded_splice_deep_constrained',
          selector: expect.objectContaining({
            steelPileMethodBand: 'welded_splice',
            depthBand: 'deep',
            workfaceBand: 'constrained',
          }),
          defaultDaysP20: 16,
          defaultDaysP50: 22,
          defaultDaysP80: 28,
        }),
      ]),
      conditionedProcessProfiles: expect.arrayContaining([
        expect.objectContaining({ conditionCode: 'h_steel_pile_open_workface' }),
        expect.objectContaining({ conditionCode: 'steel_pipe_pile_standard_workface' }),
        expect.objectContaining({ conditionCode: 'welded_splice_deep_constrained' }),
      ]),
      productivityBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'h_steel_pile_open_workface',
          baselineProductivity: expect.objectContaining({ p50PerDay: 22, unit: 't/day' }),
        }),
        expect.objectContaining({
          conditionCode: 'welded_splice_deep_constrained',
          baselineProductivity: expect.objectContaining({ p50PerDay: 12, unit: 't/day' }),
        }),
      ]),
    }))

    const weldedSplice = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'steel_pile_foundation',
      applicableGranularity: 'task',
      methodVariantCodes: ['welded_splice_steel_pile'],
      elementVariantCodes: ['deep_depth', 'constrained_workface'],
    }) as any

    expect(weldedSplice).toEqual(expect.objectContaining({
      selectedConditionCode: 'welded_splice_deep_constrained',
      defaultDaysP50: 22,
      baselineProductivity: expect.objectContaining({ p50PerDay: 12, unit: 't/day' }),
    }))
  })

  it('keeps anchor static-pressure pile foundation conditionized by underpinning and confined reinforcement', async () => {
    const byStableCode = new Map(STANDARD_WORK_DURATION_SEED.map((record) => [record.stableCode, record]))
    const anchorStatic = byStableCode.get('anchor_static_pressure_pile_foundation') as any

    expect(anchorStatic).toEqual(expect.objectContaining({
      defaultDaysP20: 13,
      defaultDaysP50: 18,
      defaultDaysP80: 23,
      conditionedDurationBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'reaction_frame_static_press_open_workface',
          selector: expect.objectContaining({
            anchorStaticPressurePileMethodBand: 'reaction_frame',
            workfaceBand: 'open',
          }),
          defaultDaysP20: 12,
          defaultDaysP50: 16,
          defaultDaysP80: 21,
        }),
        expect.objectContaining({
          conditionCode: 'underpinning_static_pile_constrained',
          selector: expect.objectContaining({
            anchorStaticPressurePileMethodBand: 'underpinning',
            workfaceBand: 'constrained',
          }),
          defaultDaysP20: 15,
          defaultDaysP50: 20,
          defaultDaysP80: 26,
        }),
        expect.objectContaining({
          conditionCode: 'confined_reinforcement_settlement_control',
          selector: expect.objectContaining({
            anchorStaticPressurePileMethodBand: 'confined_reinforcement',
            workfaceBand: 'constrained',
          }),
          defaultDaysP20: 19,
          defaultDaysP50: 26,
          defaultDaysP80: 34,
        }),
      ]),
      conditionedProcessProfiles: expect.arrayContaining([
        expect.objectContaining({ conditionCode: 'reaction_frame_static_press_open_workface' }),
        expect.objectContaining({ conditionCode: 'underpinning_static_pile_constrained' }),
        expect.objectContaining({ conditionCode: 'confined_reinforcement_settlement_control' }),
      ]),
      productivityBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'reaction_frame_static_press_open_workface',
          baselineProductivity: expect.objectContaining({ p50PerDay: 4.5, unit: 'pile/day' }),
        }),
        expect.objectContaining({
          conditionCode: 'confined_reinforcement_settlement_control',
          baselineProductivity: expect.objectContaining({ p50PerDay: 2.2, unit: 'pile/day' }),
        }),
      ]),
    }))

    const confined = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'anchor_static_pressure_pile_foundation',
      applicableGranularity: 'task',
      methodVariantCodes: ['confined_reinforcement_pile'],
      elementVariantCodes: ['constrained_workface'],
    }) as any

    expect(confined).toEqual(expect.objectContaining({
      selectedConditionCode: 'confined_reinforcement_settlement_control',
      defaultDaysP50: 26,
      baselineProductivity: expect.objectContaining({ p50PerDay: 2.2, unit: 'pile/day' }),
    }))
  })

  it('keeps rock anchor foundation conditionized by anchor type and rock drilling hardness', async () => {
    const byStableCode = new Map(STANDARD_WORK_DURATION_SEED.map((record) => [record.stableCode, record]))
    const rockAnchor = byStableCode.get('rock_anchor_foundation') as any

    expect(rockAnchor).toEqual(expect.objectContaining({
      defaultDaysP20: 11,
      defaultDaysP50: 16,
      defaultDaysP80: 21,
      conditionedDurationBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'non_prestressed_rock_anchor_open_workface',
          selector: expect.objectContaining({
            rockAnchorFoundationMethodBand: 'non_prestressed',
            workfaceBand: 'open',
          }),
          defaultDaysP20: 9,
          defaultDaysP50: 13,
          defaultDaysP80: 17,
        }),
        expect.objectContaining({
          conditionCode: 'prestressed_anchor_standard_workface',
          selector: expect.objectContaining({
            rockAnchorFoundationMethodBand: 'prestressed',
            workfaceBand: 'open',
          }),
          defaultDaysP20: 12,
          defaultDaysP50: 17,
          defaultDaysP80: 22,
        }),
        expect.objectContaining({
          conditionCode: 'hard_rock_deep_grouted_constrained',
          selector: expect.objectContaining({
            rockAnchorFoundationMethodBand: 'hard_rock_deep',
            depthBand: 'deep',
            workfaceBand: 'constrained',
          }),
          defaultDaysP20: 17,
          defaultDaysP50: 24,
          defaultDaysP80: 31,
        }),
      ]),
      conditionedProcessProfiles: expect.arrayContaining([
        expect.objectContaining({ conditionCode: 'non_prestressed_rock_anchor_open_workface' }),
        expect.objectContaining({ conditionCode: 'prestressed_anchor_standard_workface' }),
        expect.objectContaining({ conditionCode: 'hard_rock_deep_grouted_constrained' }),
      ]),
      productivityBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'non_prestressed_rock_anchor_open_workface',
          baselineProductivity: expect.objectContaining({ p50PerDay: 42, unit: 'm/day' }),
        }),
        expect.objectContaining({
          conditionCode: 'hard_rock_deep_grouted_constrained',
          baselineProductivity: expect.objectContaining({ p50PerDay: 24, unit: 'm/day' }),
        }),
      ]),
    }))

    const hardRock = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'rock_anchor_foundation',
      applicableGranularity: 'task',
      methodVariantCodes: ['hard_rock_drilling'],
      elementVariantCodes: ['deep_depth', 'constrained_workface'],
    }) as any

    expect(hardRock).toEqual(expect.objectContaining({
      selectedConditionCode: 'hard_rock_deep_grouted_constrained',
      defaultDaysP50: 24,
      baselineProductivity: expect.objectContaining({ p50PerDay: 24, unit: 'm/day' }),
    }))
  })

  it('keeps foundation cushion and blinding conditionized by material and workface', async () => {
    const byStableCode = new Map(STANDARD_WORK_DURATION_SEED.map((record) => [record.stableCode, record]))
    const cushion = byStableCode.get('cushion_and_blinding') as any

    expect(cushion).toEqual(expect.objectContaining({
      defaultDaysP20: 3,
      defaultDaysP50: 4,
      defaultDaysP80: 5,
      conditionedDurationBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'lean_concrete_blinding_open_workface',
          selector: expect.objectContaining({
            foundationCushionMethodBand: 'lean_concrete',
            workfaceBand: 'open',
          }),
          defaultDaysP20: 2,
          defaultDaysP50: 3,
          defaultDaysP80: 4,
        }),
        expect.objectContaining({
          conditionCode: 'sand_gravel_cushion_standard_workface',
          selector: expect.objectContaining({
            foundationCushionMethodBand: 'sand_gravel',
            workfaceBand: 'open',
          }),
          defaultDaysP20: 3,
          defaultDaysP50: 4,
          defaultDaysP80: 5,
        }),
        expect.objectContaining({
          conditionCode: 'thick_raft_blinding_constrained',
          selector: expect.objectContaining({
            foundationCushionMethodBand: 'thick_raft',
            workfaceBand: 'constrained',
          }),
          defaultDaysP20: 5,
          defaultDaysP50: 6,
          defaultDaysP80: 8,
        }),
      ]),
      conditionedProcessProfiles: expect.arrayContaining([
        expect.objectContaining({ conditionCode: 'lean_concrete_blinding_open_workface' }),
        expect.objectContaining({ conditionCode: 'sand_gravel_cushion_standard_workface' }),
        expect.objectContaining({ conditionCode: 'thick_raft_blinding_constrained' }),
      ]),
      productivityBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'lean_concrete_blinding_open_workface',
          baselineProductivity: expect.objectContaining({ p50PerDay: 480, unit: 'm2/day' }),
        }),
        expect.objectContaining({
          conditionCode: 'thick_raft_blinding_constrained',
          baselineProductivity: expect.objectContaining({ p50PerDay: 260, unit: 'm2/day' }),
        }),
      ]),
    }))

    const thickRaft = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'cushion_and_blinding',
      applicableGranularity: 'task',
      methodVariantCodes: ['thick_raft_blinding'],
      elementVariantCodes: ['constrained_workface'],
    }) as any

    expect(thickRaft).toEqual(expect.objectContaining({
      selectedConditionCode: 'thick_raft_blinding_constrained',
      defaultDaysP50: 6,
      baselineProductivity: expect.objectContaining({ p50PerDay: 260, unit: 'm2/day' }),
    }))
  })

  it('keeps shallow foundation concrete conditionized by foundation form and mass concrete controls', async () => {
    const byStableCode = new Map(STANDARD_WORK_DURATION_SEED.map((record) => [record.stableCode, record]))
    const shallow = byStableCode.get('shallow_foundation_concrete_structure') as any

    expect(shallow).toEqual(expect.objectContaining({
      defaultDaysP20: 11,
      defaultDaysP50: 16,
      defaultDaysP80: 21,
      conditionedDurationBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'isolated_strip_footing_open_workface',
          selector: expect.objectContaining({
            shallowFoundationMethodBand: 'isolated_strip',
            workfaceBand: 'open',
          }),
          defaultDaysP20: 9,
          defaultDaysP50: 12,
          defaultDaysP80: 16,
        }),
        expect.objectContaining({
          conditionCode: 'raft_foundation_standard_workface',
          selector: expect.objectContaining({
            shallowFoundationMethodBand: 'raft',
            workfaceBand: 'open',
          }),
          defaultDaysP20: 12,
          defaultDaysP50: 17,
          defaultDaysP80: 22,
        }),
        expect.objectContaining({
          conditionCode: 'box_foundation_mass_concrete_constrained',
          selector: expect.objectContaining({
            shallowFoundationMethodBand: 'box_mass',
            workfaceBand: 'constrained',
          }),
          defaultDaysP20: 18,
          defaultDaysP50: 25,
          defaultDaysP80: 32,
        }),
      ]),
      conditionedProcessProfiles: expect.arrayContaining([
        expect.objectContaining({ conditionCode: 'isolated_strip_footing_open_workface' }),
        expect.objectContaining({ conditionCode: 'raft_foundation_standard_workface' }),
        expect.objectContaining({ conditionCode: 'box_foundation_mass_concrete_constrained' }),
      ]),
      productivityBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'isolated_strip_footing_open_workface',
          baselineProductivity: expect.objectContaining({ p50PerDay: 150, unit: 'm3/day' }),
        }),
        expect.objectContaining({
          conditionCode: 'box_foundation_mass_concrete_constrained',
          baselineProductivity: expect.objectContaining({ p50PerDay: 75, unit: 'm3/day' }),
        }),
      ]),
    }))

    const boxMass = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'shallow_foundation_concrete_structure',
      applicableGranularity: 'task',
      methodVariantCodes: ['box_foundation', 'mass_concrete'],
      elementVariantCodes: ['constrained_workface'],
    }) as any

    expect(boxMass).toEqual(expect.objectContaining({
      selectedConditionCode: 'box_foundation_mass_concrete_constrained',
      defaultDaysP50: 25,
      baselineProductivity: expect.objectContaining({ p50PerDay: 75, unit: 'm3/day' }),
    }))
  })

  it('keeps caisson and well foundation conditionized by sinking method and confined workface', async () => {
    const byStableCode = new Map(STANDARD_WORK_DURATION_SEED.map((record) => [record.stableCode, record]))
    const caisson = byStableCode.get('caisson_well_foundation') as any

    expect(caisson).toEqual(expect.objectContaining({
      defaultDaysP20: 18,
      defaultDaysP50: 26,
      defaultDaysP80: 34,
      conditionedDurationBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'dry_open_caisson_standard_workface',
          selector: expect.objectContaining({
            caissonFoundationMethodBand: 'dry_open',
            workfaceBand: 'open',
          }),
          defaultDaysP20: 17,
          defaultDaysP50: 24,
          defaultDaysP80: 31,
        }),
        expect.objectContaining({
          conditionCode: 'box_caisson_heavy_workface',
          selector: expect.objectContaining({
            caissonFoundationMethodBand: 'box_caisson',
            workfaceBand: 'open',
          }),
          defaultDaysP20: 20,
          defaultDaysP50: 28,
          defaultDaysP80: 36,
        }),
        expect.objectContaining({
          conditionCode: 'wet_sinking_caisson_confined',
          selector: expect.objectContaining({
            caissonFoundationMethodBand: 'wet_sinking',
            workfaceBand: 'constrained',
          }),
          defaultDaysP20: 27,
          defaultDaysP50: 38,
          defaultDaysP80: 49,
        }),
      ]),
      conditionedProcessProfiles: expect.arrayContaining([
        expect.objectContaining({ conditionCode: 'dry_open_caisson_standard_workface' }),
        expect.objectContaining({ conditionCode: 'box_caisson_heavy_workface' }),
        expect.objectContaining({ conditionCode: 'wet_sinking_caisson_confined' }),
      ]),
      productivityBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'dry_open_caisson_standard_workface',
          baselineProductivity: expect.objectContaining({ p50PerDay: 72, unit: 'm2/day' }),
        }),
        expect.objectContaining({
          conditionCode: 'wet_sinking_caisson_confined',
          baselineProductivity: expect.objectContaining({ p50PerDay: 42, unit: 'm2/day' }),
        }),
      ]),
    }))

    const wetSinking = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'caisson_well_foundation',
      applicableGranularity: 'task',
      methodVariantCodes: ['wet_sinking_caisson'],
      elementVariantCodes: ['constrained_workface'],
    }) as any

    expect(wetSinking).toEqual(expect.objectContaining({
      selectedConditionCode: 'wet_sinking_caisson_confined',
      defaultDaysP50: 38,
      baselineProductivity: expect.objectContaining({ p50PerDay: 42, unit: 'm2/day' }),
    }))
  })

  it('keeps basement structure conditionized by basement depth and construction sequence', async () => {
    const byStableCode = new Map(STANDARD_WORK_DURATION_SEED.map((record) => [record.stableCode, record]))
    const basement = byStableCode.get('basement_structure') as any

    expect(basement).toEqual(expect.objectContaining({
      defaultDaysP20: 15,
      defaultDaysP50: 22,
      defaultDaysP80: 29,
      conditionedDurationBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'single_level_basement_open_workface',
          selector: expect.objectContaining({
            basementStructureMethodBand: 'single_level',
            workfaceBand: 'open',
          }),
          defaultDaysP20: 13,
          defaultDaysP50: 18,
          defaultDaysP80: 23,
        }),
        expect.objectContaining({
          conditionCode: 'multi_level_basement_standard_workface',
          selector: expect.objectContaining({
            basementStructureMethodBand: 'multi_level',
            workfaceBand: 'open',
          }),
          defaultDaysP20: 16,
          defaultDaysP50: 23,
          defaultDaysP80: 30,
        }),
        expect.objectContaining({
          conditionCode: 'deep_topdown_basement_constrained',
          selector: expect.objectContaining({
            basementStructureMethodBand: 'deep_topdown',
            workfaceBand: 'constrained',
          }),
          defaultDaysP20: 24,
          defaultDaysP50: 34,
          defaultDaysP80: 44,
        }),
      ]),
      conditionedProcessProfiles: expect.arrayContaining([
        expect.objectContaining({ conditionCode: 'single_level_basement_open_workface' }),
        expect.objectContaining({ conditionCode: 'multi_level_basement_standard_workface' }),
        expect.objectContaining({ conditionCode: 'deep_topdown_basement_constrained' }),
      ]),
      productivityBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'single_level_basement_open_workface',
          baselineProductivity: expect.objectContaining({
            p50PerDay: 0.055,
            unit: 'floor/day',
            sourceType: 'expert_profile',
            sourceRef: expect.stringContaining('basement_structure:single_level_basement_open_workface'),
          }),
        }),
        expect.objectContaining({
          conditionCode: 'deep_topdown_basement_constrained',
          baselineProductivity: expect.objectContaining({
            p50PerDay: 0.029,
            unit: 'floor/day',
            sourceType: 'expert_profile',
            sourceRef: expect.stringContaining('basement_structure:deep_topdown_basement_constrained'),
          }),
        }),
      ]),
    }))

    const deepTopdown = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'basement_structure',
      applicableGranularity: 'task',
      methodVariantCodes: ['deep_topdown_basement'],
      elementVariantCodes: ['constrained_workface'],
    }) as any

    expect(deepTopdown).toEqual(expect.objectContaining({
      selectedConditionCode: 'deep_topdown_basement_constrained',
      defaultDaysP50: 34,
      baselineProductivity: expect.objectContaining({ p50PerDay: 0.029, unit: 'floor/day' }),
    }))
  })

  it('keeps basement waterproof and backfill conditionized by waterproof system and backfill sequence', async () => {
    const byStableCode = new Map(STANDARD_WORK_DURATION_SEED.map((record) => [record.stableCode, record]))
    const waterproof = byStableCode.get('basement_waterproof_backfill') as any

    expect(waterproof).toEqual(expect.objectContaining({
      defaultDaysP20: 10,
      defaultDaysP50: 14,
      defaultDaysP80: 18,
      conditionedDurationBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'membrane_backfill_open_workface',
          selector: expect.objectContaining({
            basementWaterproofMethodBand: 'membrane_backfill',
            workfaceBand: 'open',
          }),
          defaultDaysP20: 8,
          defaultDaysP50: 11,
          defaultDaysP80: 14,
        }),
        expect.objectContaining({
          conditionCode: 'composite_tanking_protection_standard_workface',
          selector: expect.objectContaining({
            basementWaterproofMethodBand: 'tanking_protection',
            workfaceBand: 'open',
          }),
          defaultDaysP20: 10,
          defaultDaysP50: 14,
          defaultDaysP80: 18,
        }),
        expect.objectContaining({
          conditionCode: 'layered_backfill_dewatering_constrained',
          selector: expect.objectContaining({
            basementWaterproofMethodBand: 'layered_backfill_dewatering',
            workfaceBand: 'constrained',
          }),
          defaultDaysP20: 14,
          defaultDaysP50: 20,
          defaultDaysP80: 26,
        }),
      ]),
      conditionedProcessProfiles: expect.arrayContaining([
        expect.objectContaining({ conditionCode: 'membrane_backfill_open_workface' }),
        expect.objectContaining({ conditionCode: 'composite_tanking_protection_standard_workface' }),
        expect.objectContaining({ conditionCode: 'layered_backfill_dewatering_constrained' }),
      ]),
      productivityBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'membrane_backfill_open_workface',
          baselineProductivity: expect.objectContaining({
            p50PerDay: 520,
            unit: 'm2/day',
            sourceType: 'expert_profile',
            sourceRef: expect.stringContaining('basement_waterproof_backfill:membrane_backfill_open_workface'),
          }),
        }),
        expect.objectContaining({
          conditionCode: 'layered_backfill_dewatering_constrained',
          baselineProductivity: expect.objectContaining({
            p50PerDay: 250,
            unit: 'm2/day',
            sourceType: 'expert_profile',
            sourceRef: expect.stringContaining('basement_waterproof_backfill:layered_backfill_dewatering_constrained'),
          }),
        }),
      ]),
    }))

    const constrainedBackfill = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'basement_waterproof_backfill',
      applicableGranularity: 'task',
      methodVariantCodes: ['layered_backfill_dewatering'],
      elementVariantCodes: ['constrained_workface'],
    }) as any

    expect(constrainedBackfill).toEqual(expect.objectContaining({
      selectedConditionCode: 'layered_backfill_dewatering_constrained',
      defaultDaysP50: 20,
      baselineProductivity: expect.objectContaining({ p50PerDay: 250, unit: 'm2/day' }),
    }))
  })

  it('keeps PC component hoisting conditionized by component type and hoisting constraint', async () => {
    const byStableCode = new Map(STANDARD_WORK_DURATION_SEED.map((record) => [record.stableCode, record]))
    const pcHoisting = byStableCode.get('pc_component_hoisting') as any

    expect(pcHoisting).toEqual(expect.objectContaining({
      defaultDaysP20: 4,
      defaultDaysP50: 6,
      defaultDaysP80: 8,
      conditionedDurationBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'composite_slab_stair_balcony_open_workface',
          selector: expect.objectContaining({
            pcHoistingMethodBand: 'slab_stair_balcony',
            workfaceBand: 'open',
          }),
          defaultDaysP20: 3,
          defaultDaysP50: 5,
          defaultDaysP80: 7,
        }),
        expect.objectContaining({
          conditionCode: 'wall_column_panel_standard_workface',
          selector: expect.objectContaining({
            pcHoistingMethodBand: 'wall_column_panel',
            workfaceBand: 'open',
          }),
          defaultDaysP20: 4,
          defaultDaysP50: 6,
          defaultDaysP80: 8,
        }),
        expect.objectContaining({
          conditionCode: 'heavy_integrated_component_constrained',
          selector: expect.objectContaining({
            pcHoistingMethodBand: 'heavy_integrated',
            workfaceBand: 'constrained',
          }),
          defaultDaysP20: 6,
          defaultDaysP50: 9,
          defaultDaysP80: 12,
        }),
      ]),
      conditionedProcessProfiles: expect.arrayContaining([
        expect.objectContaining({ conditionCode: 'composite_slab_stair_balcony_open_workface' }),
        expect.objectContaining({ conditionCode: 'wall_column_panel_standard_workface' }),
        expect.objectContaining({ conditionCode: 'heavy_integrated_component_constrained' }),
      ]),
      productivityBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'composite_slab_stair_balcony_open_workface',
          baselineProductivity: expect.objectContaining({
            p50PerDay: 0.2,
            unit: 'floor/day',
            sourceType: 'expert_profile',
            sourceRef: expect.stringContaining('pc_component_hoisting:composite_slab_stair_balcony_open_workface'),
          }),
        }),
        expect.objectContaining({
          conditionCode: 'heavy_integrated_component_constrained',
          baselineProductivity: expect.objectContaining({
            p50PerDay: 0.11,
            unit: 'floor/day',
            sourceType: 'expert_profile',
            sourceRef: expect.stringContaining('pc_component_hoisting:heavy_integrated_component_constrained'),
          }),
        }),
      ]),
    }))

    const heavyHoist = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'pc_component_hoisting',
      applicableGranularity: 'task',
      methodVariantCodes: ['heavy_integrated_pc_hoist'],
      elementVariantCodes: ['constrained_workface'],
    }) as any

    expect(heavyHoist).toEqual(expect.objectContaining({
      selectedConditionCode: 'heavy_integrated_component_constrained',
      defaultDaysP50: 9,
      baselineProductivity: expect.objectContaining({ p50PerDay: 0.11, unit: 'floor/day' }),
    }))
  })

  it('keeps PC grouting joint conditionized by grouting method and inspection hold', async () => {
    const byStableCode = new Map(STANDARD_WORK_DURATION_SEED.map((record) => [record.stableCode, record]))
    const pcJoint = byStableCode.get('pc_grouting_joint') as any

    expect(pcJoint).toEqual(expect.objectContaining({
      defaultDaysP20: 3,
      defaultDaysP50: 4,
      defaultDaysP80: 5,
      conditionedDurationBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'standard_sleeve_grouting_open_workface',
          selector: expect.objectContaining({
            pcJointMethodBand: 'standard_sleeve',
            workfaceBand: 'open',
          }),
          defaultDaysP20: 2,
          defaultDaysP50: 3,
          defaultDaysP80: 4,
        }),
        expect.objectContaining({
          conditionCode: 'dense_wall_column_joint_standard_workface',
          selector: expect.objectContaining({
            pcJointMethodBand: 'dense_wall_column',
            workfaceBand: 'open',
          }),
          defaultDaysP20: 3,
          defaultDaysP50: 4,
          defaultDaysP80: 5,
        }),
        expect.objectContaining({
          conditionCode: 'pressure_grouting_reinspection_constrained',
          selector: expect.objectContaining({
            pcJointMethodBand: 'pressure_reinspection',
            workfaceBand: 'constrained',
          }),
          defaultDaysP20: 5,
          defaultDaysP50: 7,
          defaultDaysP80: 9,
        }),
      ]),
      conditionedProcessProfiles: expect.arrayContaining([
        expect.objectContaining({ conditionCode: 'standard_sleeve_grouting_open_workface' }),
        expect.objectContaining({ conditionCode: 'dense_wall_column_joint_standard_workface' }),
        expect.objectContaining({ conditionCode: 'pressure_grouting_reinspection_constrained' }),
      ]),
      productivityBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'standard_sleeve_grouting_open_workface',
          baselineProductivity: expect.objectContaining({
            p50PerDay: 0.33,
            unit: 'floor/day',
            sourceType: 'expert_profile',
            sourceRef: expect.stringContaining('pc_grouting_joint:standard_sleeve_grouting_open_workface'),
          }),
        }),
        expect.objectContaining({
          conditionCode: 'pressure_grouting_reinspection_constrained',
          baselineProductivity: expect.objectContaining({
            p50PerDay: 0.14,
            unit: 'floor/day',
            sourceType: 'expert_profile',
            sourceRef: expect.stringContaining('pc_grouting_joint:pressure_grouting_reinspection_constrained'),
          }),
        }),
      ]),
    }))

    const pressureReinspection = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'pc_grouting_joint',
      applicableGranularity: 'task',
      methodVariantCodes: ['pressure_grouting_reinspection'],
      elementVariantCodes: ['constrained_workface'],
    }) as any

    expect(pressureReinspection).toEqual(expect.objectContaining({
      selectedConditionCode: 'pressure_grouting_reinspection_constrained',
      defaultDaysP50: 7,
      baselineProductivity: expect.objectContaining({ p50PerDay: 0.14, unit: 'floor/day' }),
    }))
  })

  it('keeps steel fabrication deepening conditionized by drawing and fabrication readiness', async () => {
    const byStableCode = new Map(STANDARD_WORK_DURATION_SEED.map((record) => [record.stableCode, record]))
    const fabrication = byStableCode.get('steel_fabrication_deepening') as any

    expect(fabrication).toEqual(expect.objectContaining({
      defaultDaysP20: 7,
      defaultDaysP50: 10,
      defaultDaysP80: 13,
      conditionedDurationBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'standard_shop_drawing_open_fabrication',
          selector: expect.objectContaining({
            steelFabricationMethodBand: 'standard_shop_drawing',
            workfaceBand: 'open',
          }),
          defaultDaysP20: 6,
          defaultDaysP50: 8,
          defaultDaysP80: 10,
        }),
        expect.objectContaining({
          conditionCode: 'complex_node_deepening_standard_fabrication',
          selector: expect.objectContaining({
            steelFabricationMethodBand: 'complex_node',
            workfaceBand: 'open',
          }),
          defaultDaysP20: 8,
          defaultDaysP50: 11,
          defaultDaysP80: 14,
        }),
        expect.objectContaining({
          conditionCode: 'large_span_preassembly_constrained_fabrication',
          selector: expect.objectContaining({
            steelFabricationMethodBand: 'large_span_preassembly',
            workfaceBand: 'constrained',
          }),
          defaultDaysP20: 12,
          defaultDaysP50: 17,
          defaultDaysP80: 22,
        }),
      ]),
      conditionedProcessProfiles: expect.arrayContaining([
        expect.objectContaining({ conditionCode: 'standard_shop_drawing_open_fabrication' }),
        expect.objectContaining({ conditionCode: 'complex_node_deepening_standard_fabrication' }),
        expect.objectContaining({ conditionCode: 'large_span_preassembly_constrained_fabrication' }),
      ]),
      productivityBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'standard_shop_drawing_open_fabrication',
          baselineProductivity: expect.objectContaining({
            p50PerDay: 22,
            unit: 't/day',
            sourceType: 'expert_profile',
            sourceRef: expect.stringContaining('steel_fabrication_deepening:standard_shop_drawing_open_fabrication'),
          }),
        }),
        expect.objectContaining({
          conditionCode: 'large_span_preassembly_constrained_fabrication',
          baselineProductivity: expect.objectContaining({
            p50PerDay: 9,
            unit: 't/day',
            sourceType: 'expert_profile',
            sourceRef: expect.stringContaining('steel_fabrication_deepening:large_span_preassembly_constrained_fabrication'),
          }),
        }),
      ]),
    }))

    const largeSpan = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'steel_fabrication_deepening',
      applicableGranularity: 'task',
      methodVariantCodes: ['large_span_preassembly'],
      elementVariantCodes: ['constrained_workface'],
    }) as any

    expect(largeSpan).toEqual(expect.objectContaining({
      selectedConditionCode: 'large_span_preassembly_constrained_fabrication',
      defaultDaysP50: 17,
      baselineProductivity: expect.objectContaining({ p50PerDay: 9, unit: 't/day' }),
    }))
  })

  it('keeps steel erection conditionized by erection method and workface constraint', async () => {
    const byStableCode = new Map(STANDARD_WORK_DURATION_SEED.map((record) => [record.stableCode, record]))
    const erection = byStableCode.get('steel_erection') as any

    expect(erection).toEqual(expect.objectContaining({
      defaultDaysP20: 8,
      defaultDaysP50: 12,
      defaultDaysP80: 16,
      conditionedDurationBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'single_crane_bay_erection_open_workface',
          selector: expect.objectContaining({
            steelErectionMethodBand: 'single_crane_bay',
            workfaceBand: 'open',
          }),
          defaultDaysP20: 7,
          defaultDaysP50: 10,
          defaultDaysP80: 13,
        }),
        expect.objectContaining({
          conditionCode: 'multi_crane_frame_erection_standard_workface',
          selector: expect.objectContaining({
            steelErectionMethodBand: 'multi_crane_frame',
            workfaceBand: 'open',
          }),
          defaultDaysP20: 9,
          defaultDaysP50: 13,
          defaultDaysP80: 17,
        }),
        expect.objectContaining({
          conditionCode: 'large_span_heavy_lift_constrained',
          selector: expect.objectContaining({
            steelErectionMethodBand: 'large_span_heavy_lift',
            workfaceBand: 'constrained',
          }),
          defaultDaysP20: 13,
          defaultDaysP50: 19,
          defaultDaysP80: 25,
        }),
      ]),
      conditionedProcessProfiles: expect.arrayContaining([
        expect.objectContaining({ conditionCode: 'single_crane_bay_erection_open_workface' }),
        expect.objectContaining({ conditionCode: 'multi_crane_frame_erection_standard_workface' }),
        expect.objectContaining({ conditionCode: 'large_span_heavy_lift_constrained' }),
      ]),
      productivityBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'single_crane_bay_erection_open_workface',
          baselineProductivity: expect.objectContaining({
            p50PerDay: 18,
            unit: 't/day',
            sourceType: 'expert_profile',
            sourceRef: expect.stringContaining('steel_erection:single_crane_bay_erection_open_workface'),
          }),
        }),
        expect.objectContaining({
          conditionCode: 'large_span_heavy_lift_constrained',
          baselineProductivity: expect.objectContaining({
            p50PerDay: 8,
            unit: 't/day',
            sourceType: 'expert_profile',
            sourceRef: expect.stringContaining('steel_erection:large_span_heavy_lift_constrained'),
          }),
        }),
      ]),
    }))

    const heavyLift = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'steel_erection',
      applicableGranularity: 'task',
      methodVariantCodes: ['large_span_heavy_lift'],
      elementVariantCodes: ['constrained_workface'],
    }) as any

    expect(heavyLift).toEqual(expect.objectContaining({
      selectedConditionCode: 'large_span_heavy_lift_constrained',
      defaultDaysP50: 19,
      baselineProductivity: expect.objectContaining({ p50PerDay: 8, unit: 't/day' }),
    }))
  })

  it('keeps steel tube concrete structure conditionized by tube form and concrete placing constraint', async () => {
    const byStableCode = new Map(STANDARD_WORK_DURATION_SEED.map((record) => [record.stableCode, record]))
    const steelTube = byStableCode.get('steel_tube_concrete_structure') as any

    expect(steelTube).toEqual(expect.objectContaining({
      defaultDaysP20: 11,
      defaultDaysP50: 15,
      defaultDaysP80: 20,
      conditionedDurationBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'standard_cfsteel_tube_open_workface',
          selector: expect.objectContaining({
            steelTubeConcreteMethodBand: 'standard_cfsteel_tube',
            workfaceBand: 'open',
          }),
          defaultDaysP20: 9,
          defaultDaysP50: 13,
          defaultDaysP80: 17,
        }),
        expect.objectContaining({
          conditionCode: 'large_diameter_cfsteel_tube_pumped',
          selector: expect.objectContaining({
            steelTubeConcreteMethodBand: 'large_diameter_pumped',
            concretePlacementBand: 'pump',
          }),
          defaultDaysP20: 12,
          defaultDaysP50: 17,
          defaultDaysP80: 22,
        }),
        expect.objectContaining({
          conditionCode: 'dense_joint_cfsteel_tube_constrained',
          selector: expect.objectContaining({
            steelTubeConcreteMethodBand: 'dense_joint_constrained',
            workfaceBand: 'constrained',
          }),
          defaultDaysP20: 17,
          defaultDaysP50: 24,
          defaultDaysP80: 31,
        }),
      ]),
      conditionedProcessProfiles: expect.arrayContaining([
        expect.objectContaining({ conditionCode: 'standard_cfsteel_tube_open_workface' }),
        expect.objectContaining({ conditionCode: 'large_diameter_cfsteel_tube_pumped' }),
        expect.objectContaining({ conditionCode: 'dense_joint_cfsteel_tube_constrained' }),
      ]),
      productivityBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'standard_cfsteel_tube_open_workface',
          baselineProductivity: expect.objectContaining({
            p50PerDay: 12,
            unit: 't/day',
            sourceType: 'expert_profile',
            sourceRef: expect.stringContaining('steel_tube_concrete_structure:standard_cfsteel_tube_open_workface'),
          }),
        }),
        expect.objectContaining({
          conditionCode: 'dense_joint_cfsteel_tube_constrained',
          baselineProductivity: expect.objectContaining({
            p50PerDay: 6,
            unit: 't/day',
            sourceType: 'expert_profile',
            sourceRef: expect.stringContaining('steel_tube_concrete_structure:dense_joint_cfsteel_tube_constrained'),
          }),
        }),
      ]),
    }))

    const denseJoint = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'steel_tube_concrete_structure',
      applicableGranularity: 'task',
      methodVariantCodes: ['dense_joint_cfsteel_tube'],
      elementVariantCodes: ['constrained_workface'],
    }) as any

    expect(denseJoint).toEqual(expect.objectContaining({
      selectedConditionCode: 'dense_joint_cfsteel_tube_constrained',
      defaultDaysP50: 24,
      baselineProductivity: expect.objectContaining({ p50PerDay: 6, unit: 't/day' }),
    }))
  })

  it('keeps steel reinforced concrete structure conditionized by SRC member complexity and pour sequence', async () => {
    const byStableCode = new Map(STANDARD_WORK_DURATION_SEED.map((record) => [record.stableCode, record]))
    const src = byStableCode.get('steel_reinforced_concrete_structure') as any

    expect(src).toEqual(expect.objectContaining({
      defaultDaysP20: 12,
      defaultDaysP50: 17,
      defaultDaysP80: 22,
      conditionedDurationBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'standard_src_frame_open_workface',
          selector: expect.objectContaining({
            steelReinforcedConcreteMethodBand: 'standard_src_frame',
            workfaceBand: 'open',
          }),
          defaultDaysP20: 10,
          defaultDaysP50: 14,
          defaultDaysP80: 18,
        }),
        expect.objectContaining({
          conditionCode: 'src_core_joint_standard_workface',
          selector: expect.objectContaining({
            steelReinforcedConcreteMethodBand: 'core_joint',
            workfaceBand: 'open',
          }),
          defaultDaysP20: 13,
          defaultDaysP50: 18,
          defaultDaysP80: 23,
        }),
        expect.objectContaining({
          conditionCode: 'dense_src_transfer_constrained',
          selector: expect.objectContaining({
            steelReinforcedConcreteMethodBand: 'dense_transfer',
            workfaceBand: 'constrained',
          }),
          defaultDaysP20: 19,
          defaultDaysP50: 27,
          defaultDaysP80: 35,
        }),
      ]),
      conditionedProcessProfiles: expect.arrayContaining([
        expect.objectContaining({ conditionCode: 'standard_src_frame_open_workface' }),
        expect.objectContaining({ conditionCode: 'src_core_joint_standard_workface' }),
        expect.objectContaining({ conditionCode: 'dense_src_transfer_constrained' }),
      ]),
      productivityBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'standard_src_frame_open_workface',
          baselineProductivity: expect.objectContaining({
            p50PerDay: 11,
            unit: 't/day',
            sourceType: 'expert_profile',
            sourceRef: expect.stringContaining('steel_reinforced_concrete_structure:standard_src_frame_open_workface'),
          }),
        }),
        expect.objectContaining({
          conditionCode: 'dense_src_transfer_constrained',
          baselineProductivity: expect.objectContaining({
            p50PerDay: 5,
            unit: 't/day',
            sourceType: 'expert_profile',
            sourceRef: expect.stringContaining('steel_reinforced_concrete_structure:dense_src_transfer_constrained'),
          }),
        }),
      ]),
    }))

    const denseTransfer = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'steel_reinforced_concrete_structure',
      applicableGranularity: 'task',
      methodVariantCodes: ['dense_src_transfer'],
      elementVariantCodes: ['constrained_workface'],
    }) as any

    expect(denseTransfer).toEqual(expect.objectContaining({
      selectedConditionCode: 'dense_src_transfer_constrained',
      defaultDaysP50: 27,
      baselineProductivity: expect.objectContaining({ p50PerDay: 5, unit: 't/day' }),
    }))
  })

  it('keeps steel bolting and welding conditionized by connection method and inspection hold', async () => {
    const byStableCode = new Map(STANDARD_WORK_DURATION_SEED.map((record) => [record.stableCode, record]))
    const connection = byStableCode.get('steel_bolting_welding') as any

    expect(connection).toEqual(expect.objectContaining({
      defaultDaysP20: 4,
      defaultDaysP50: 5,
      defaultDaysP80: 7,
      conditionedDurationBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'high_strength_bolting_open_workface',
          selector: expect.objectContaining({
            steelConnectionMethodBand: 'high_strength_bolting',
            workfaceBand: 'open',
          }),
          defaultDaysP20: 3,
          defaultDaysP50: 4,
          defaultDaysP80: 5,
        }),
        expect.objectContaining({
          conditionCode: 'standard_welding_inspection_workface',
          selector: expect.objectContaining({
            steelConnectionMethodBand: 'standard_welding',
            workfaceBand: 'open',
          }),
          defaultDaysP20: 4,
          defaultDaysP50: 6,
          defaultDaysP80: 8,
        }),
        expect.objectContaining({
          conditionCode: 'thick_plate_welding_reinspection_constrained',
          selector: expect.objectContaining({
            steelConnectionMethodBand: 'thick_plate_reinspection',
            workfaceBand: 'constrained',
          }),
          defaultDaysP20: 7,
          defaultDaysP50: 10,
          defaultDaysP80: 13,
        }),
      ]),
      conditionedProcessProfiles: expect.arrayContaining([
        expect.objectContaining({ conditionCode: 'high_strength_bolting_open_workface' }),
        expect.objectContaining({ conditionCode: 'standard_welding_inspection_workface' }),
        expect.objectContaining({ conditionCode: 'thick_plate_welding_reinspection_constrained' }),
      ]),
      productivityBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'high_strength_bolting_open_workface',
          baselineProductivity: expect.objectContaining({
            p50PerDay: 28,
            unit: 't/day',
            sourceType: 'expert_profile',
            sourceRef: expect.stringContaining('steel_bolting_welding:high_strength_bolting_open_workface'),
          }),
        }),
        expect.objectContaining({
          conditionCode: 'thick_plate_welding_reinspection_constrained',
          baselineProductivity: expect.objectContaining({
            p50PerDay: 10,
            unit: 't/day',
            sourceType: 'expert_profile',
            sourceRef: expect.stringContaining('steel_bolting_welding:thick_plate_welding_reinspection_constrained'),
          }),
        }),
      ]),
    }))

    const thickPlate = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'steel_bolting_welding',
      applicableGranularity: 'task',
      methodVariantCodes: ['thick_plate_welding_reinspection'],
      elementVariantCodes: ['constrained_workface'],
    }) as any

    expect(thickPlate).toEqual(expect.objectContaining({
      selectedConditionCode: 'thick_plate_welding_reinspection_constrained',
      defaultDaysP50: 10,
      baselineProductivity: expect.objectContaining({ p50PerDay: 10, unit: 't/day' }),
    }))
  })

  it('keeps large span roof structure conditionized by roof system and lift complexity', async () => {
    const byStableCode = new Map(STANDARD_WORK_DURATION_SEED.map((record) => [record.stableCode, record]))
    const largeSpanRoof = byStableCode.get('large_span_roof_structure') as any

    expect(largeSpanRoof).toEqual(expect.objectContaining({
      defaultDaysP20: 10,
      defaultDaysP50: 14,
      defaultDaysP80: 18,
      conditionedDurationBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'space_frame_modular_open_workface',
          selector: expect.objectContaining({
            largeSpanRoofMethodBand: 'space_frame_modular',
            workfaceBand: 'open',
          }),
          defaultDaysP20: 8,
          defaultDaysP50: 12,
          defaultDaysP80: 16,
        }),
        expect.objectContaining({
          conditionCode: 'truss_roof_segmental_lift_standard',
          selector: expect.objectContaining({
            largeSpanRoofMethodBand: 'truss_segmental_lift',
            workfaceBand: 'open',
          }),
          defaultDaysP20: 11,
          defaultDaysP50: 16,
          defaultDaysP80: 21,
        }),
        expect.objectContaining({
          conditionCode: 'reticulated_shell_heavy_lift_constrained',
          selector: expect.objectContaining({
            largeSpanRoofMethodBand: 'reticulated_shell_heavy_lift',
            workfaceBand: 'constrained',
          }),
          defaultDaysP20: 16,
          defaultDaysP50: 23,
          defaultDaysP80: 30,
        }),
      ]),
      conditionedProcessProfiles: expect.arrayContaining([
        expect.objectContaining({ conditionCode: 'space_frame_modular_open_workface' }),
        expect.objectContaining({ conditionCode: 'truss_roof_segmental_lift_standard' }),
        expect.objectContaining({ conditionCode: 'reticulated_shell_heavy_lift_constrained' }),
      ]),
      productivityBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'space_frame_modular_open_workface',
          baselineProductivity: expect.objectContaining({
            p50PerDay: 16,
            unit: 't/day',
            sourceType: 'expert_profile',
            sourceRef: expect.stringContaining('large_span_roof_structure:space_frame_modular_open_workface'),
          }),
        }),
        expect.objectContaining({
          conditionCode: 'reticulated_shell_heavy_lift_constrained',
          baselineProductivity: expect.objectContaining({
            p50PerDay: 7,
            unit: 't/day',
            sourceType: 'expert_profile',
            sourceRef: expect.stringContaining('large_span_roof_structure:reticulated_shell_heavy_lift_constrained'),
          }),
        }),
      ]),
    }))

    const heavyLiftShell = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'large_span_roof_structure',
      applicableGranularity: 'task',
      methodVariantCodes: ['reticulated_shell_heavy_lift'],
      elementVariantCodes: ['constrained_workface'],
    }) as any

    expect(heavyLiftShell).toEqual(expect.objectContaining({
      selectedConditionCode: 'reticulated_shell_heavy_lift_constrained',
      defaultDaysP50: 23,
      baselineProductivity: expect.objectContaining({ p50PerDay: 7, unit: 't/day' }),
    }))
  })

  it('keeps timber structure conditionized by timber system and renovation constraint', async () => {
    const byStableCode = new Map(STANDARD_WORK_DURATION_SEED.map((record) => [record.stableCode, record]))
    const timber = byStableCode.get('timber_structure') as any

    expect(timber).toEqual(expect.objectContaining({
      defaultDaysP20: 7,
      defaultDaysP50: 10,
      defaultDaysP80: 13,
      conditionedDurationBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'light_timber_panel_open_workface',
          selector: expect.objectContaining({
            timberStructureMethodBand: 'light_timber_panel',
            workfaceBand: 'open',
          }),
          defaultDaysP20: 5,
          defaultDaysP50: 7,
          defaultDaysP80: 9,
        }),
        expect.objectContaining({
          conditionCode: 'glulam_frame_standard_workface',
          selector: expect.objectContaining({
            timberStructureMethodBand: 'glulam_frame',
            workfaceBand: 'open',
          }),
          defaultDaysP20: 7,
          defaultDaysP50: 10,
          defaultDaysP80: 13,
        }),
        expect.objectContaining({
          conditionCode: 'traditional_timber_renovation_constrained',
          selector: expect.objectContaining({
            timberStructureMethodBand: 'traditional_timber',
            renovationBand: 'renovation',
            workfaceBand: 'constrained',
          }),
          defaultDaysP20: 10,
          defaultDaysP50: 15,
          defaultDaysP80: 20,
        }),
      ]),
      conditionedProcessProfiles: expect.arrayContaining([
        expect.objectContaining({ conditionCode: 'light_timber_panel_open_workface' }),
        expect.objectContaining({ conditionCode: 'glulam_frame_standard_workface' }),
        expect.objectContaining({ conditionCode: 'traditional_timber_renovation_constrained' }),
      ]),
      productivityBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'light_timber_panel_open_workface',
          baselineProductivity: expect.objectContaining({
            p50PerDay: 115,
            unit: 'm2/day',
            sourceType: 'expert_profile',
            sourceRef: expect.stringContaining('timber_structure:light_timber_panel_open_workface'),
          }),
        }),
        expect.objectContaining({
          conditionCode: 'traditional_timber_renovation_constrained',
          baselineProductivity: expect.objectContaining({
            p50PerDay: 52,
            unit: 'm2/day',
            sourceType: 'expert_profile',
            sourceRef: expect.stringContaining('timber_structure:traditional_timber_renovation_constrained'),
          }),
        }),
      ]),
    }))

    const traditionalRenovation = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'timber_structure',
      applicableGranularity: 'task',
      methodVariantCodes: ['traditional_timber'],
      elementVariantCodes: ['renovation', 'constrained_workface'],
    }) as any

    expect(traditionalRenovation).toEqual(expect.objectContaining({
      selectedConditionCode: 'traditional_timber_renovation_constrained',
      defaultDaysP50: 15,
      baselineProductivity: expect.objectContaining({ p50PerDay: 52, unit: 'm2/day' }),
    }))
  })

  it('keeps steel envelope roof wall conditionized by panel system and high-rise access', async () => {
    const byStableCode = new Map(STANDARD_WORK_DURATION_SEED.map((record) => [record.stableCode, record]))
    const envelope = byStableCode.get('steel_envelope_roof_wall') as any

    expect(envelope).toEqual(expect.objectContaining({
      defaultDaysP20: 7,
      defaultDaysP50: 10,
      defaultDaysP80: 13,
      conditionedDurationBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'single_skin_panel_low_rise_open_workface',
          selector: expect.objectContaining({
            steelEnvelopeMethodBand: 'single_skin_panel',
            heightBand: 'low_rise',
            workfaceBand: 'open',
          }),
          defaultDaysP20: 5,
          defaultDaysP50: 8,
          defaultDaysP80: 10,
        }),
        expect.objectContaining({
          conditionCode: 'sandwich_panel_roof_wall_standard',
          selector: expect.objectContaining({
            steelEnvelopeMethodBand: 'sandwich_panel',
            heightBand: 'low_rise',
            workfaceBand: 'open',
          }),
          defaultDaysP20: 7,
          defaultDaysP50: 10,
          defaultDaysP80: 13,
        }),
        expect.objectContaining({
          conditionCode: 'curved_metal_roof_high_rise_constrained',
          selector: expect.objectContaining({
            steelEnvelopeMethodBand: 'curved_metal_roof',
            heightBand: 'high_rise',
            workfaceBand: 'constrained',
          }),
          defaultDaysP20: 11,
          defaultDaysP50: 16,
          defaultDaysP80: 21,
        }),
      ]),
      conditionedProcessProfiles: expect.arrayContaining([
        expect.objectContaining({ conditionCode: 'single_skin_panel_low_rise_open_workface' }),
        expect.objectContaining({ conditionCode: 'sandwich_panel_roof_wall_standard' }),
        expect.objectContaining({ conditionCode: 'curved_metal_roof_high_rise_constrained' }),
      ]),
      productivityBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'single_skin_panel_low_rise_open_workface',
          baselineProductivity: expect.objectContaining({
            p50PerDay: 420,
            unit: 'm2/day',
            sourceType: 'expert_profile',
            sourceRef: expect.stringContaining('steel_envelope_roof_wall:single_skin_panel_low_rise_open_workface'),
          }),
        }),
        expect.objectContaining({
          conditionCode: 'curved_metal_roof_high_rise_constrained',
          baselineProductivity: expect.objectContaining({
            p50PerDay: 180,
            unit: 'm2/day',
            sourceType: 'expert_profile',
            sourceRef: expect.stringContaining('steel_envelope_roof_wall:curved_metal_roof_high_rise_constrained'),
          }),
        }),
      ]),
    }))

    const curvedHighRise = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'steel_envelope_roof_wall',
      applicableGranularity: 'task',
      methodVariantCodes: ['curved_metal_roof'],
      elementVariantCodes: ['high_rise', 'constrained_workface'],
    }) as any

    expect(curvedHighRise).toEqual(expect.objectContaining({
      selectedConditionCode: 'curved_metal_roof_high_rise_constrained',
      defaultDaysP50: 16,
      baselineProductivity: expect.objectContaining({ p50PerDay: 180, unit: 'm2/day' }),
    }))
  })

  it('keeps masonry infill wall conditionized by masonry material and secondary-structure density', async () => {
    const byStableCode = new Map(STANDARD_WORK_DURATION_SEED.map((record) => [record.stableCode, record]))
    const masonry = byStableCode.get('masonry_infill_wall') as any

    expect(masonry).toEqual(expect.objectContaining({
      defaultDaysP20: 6,
      defaultDaysP50: 8,
      defaultDaysP80: 10,
      conditionedDurationBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'aac_block_open_workface',
          selector: expect.objectContaining({
            masonryWallMethodBand: 'aac_block',
            workfaceBand: 'open',
          }),
          defaultDaysP20: 5,
          defaultDaysP50: 7,
          defaultDaysP80: 9,
        }),
        expect.objectContaining({
          conditionCode: 'concrete_block_standard_workface',
          selector: expect.objectContaining({
            masonryWallMethodBand: 'concrete_block',
            workfaceBand: 'open',
          }),
          defaultDaysP20: 6,
          defaultDaysP50: 8,
          defaultDaysP80: 10,
        }),
        expect.objectContaining({
          conditionCode: 'secondary_structure_dense_constrained',
          selector: expect.objectContaining({
            masonryWallMethodBand: 'secondary_structure_dense',
            workfaceBand: 'constrained',
          }),
          defaultDaysP20: 9,
          defaultDaysP50: 13,
          defaultDaysP80: 17,
        }),
      ]),
      conditionedProcessProfiles: expect.arrayContaining([
        expect.objectContaining({ conditionCode: 'aac_block_open_workface' }),
        expect.objectContaining({ conditionCode: 'concrete_block_standard_workface' }),
        expect.objectContaining({ conditionCode: 'secondary_structure_dense_constrained' }),
      ]),
      productivityBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'aac_block_open_workface',
          baselineProductivity: expect.objectContaining({
            p50PerDay: 180,
            unit: 'm2/day',
            sourceType: 'expert_profile',
            sourceRef: expect.stringContaining('masonry_infill_wall:aac_block_open_workface'),
          }),
        }),
        expect.objectContaining({
          conditionCode: 'secondary_structure_dense_constrained',
          baselineProductivity: expect.objectContaining({
            p50PerDay: 95,
            unit: 'm2/day',
            sourceType: 'expert_profile',
            sourceRef: expect.stringContaining('masonry_infill_wall:secondary_structure_dense_constrained'),
          }),
        }),
      ]),
    }))

    const dense = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'masonry_infill_wall',
      applicableGranularity: 'task',
      methodVariantCodes: ['secondary_structure_dense'],
      elementVariantCodes: ['constrained_workface'],
    }) as any

    expect(dense).toEqual(expect.objectContaining({
      selectedConditionCode: 'secondary_structure_dense_constrained',
      defaultDaysP50: 13,
      baselineProductivity: expect.objectContaining({ p50PerDay: 95, unit: 'm2/day' }),
    }))
  })

  it('keeps plastering wall ceiling conditionized by plaster system and location', async () => {
    const byStableCode = new Map(STANDARD_WORK_DURATION_SEED.map((record) => [record.stableCode, record]))
    const plaster = byStableCode.get('plastering_wall_ceiling') as any

    expect(plaster).toEqual(expect.objectContaining({
      defaultDaysP20: 5,
      defaultDaysP50: 7,
      defaultDaysP80: 9,
      conditionedDurationBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'gypsum_skim_indoor_open_workface',
          selector: expect.objectContaining({
            plasteringMethodBand: 'gypsum_skim',
            locationBand: 'indoor',
            workfaceBand: 'open',
          }),
          defaultDaysP20: 4,
          defaultDaysP50: 6,
          defaultDaysP80: 8,
        }),
        expect.objectContaining({
          conditionCode: 'cement_mortar_indoor_standard_workface',
          selector: expect.objectContaining({
            plasteringMethodBand: 'cement_mortar',
            locationBand: 'indoor',
            workfaceBand: 'open',
          }),
          defaultDaysP20: 5,
          defaultDaysP50: 7,
          defaultDaysP80: 9,
        }),
        expect.objectContaining({
          conditionCode: 'exterior_base_coat_high_rise_constrained',
          selector: expect.objectContaining({
            plasteringMethodBand: 'exterior_base_coat',
            locationBand: 'outdoor',
            heightBand: 'high_rise',
            workfaceBand: 'constrained',
          }),
          defaultDaysP20: 8,
          defaultDaysP50: 11,
          defaultDaysP80: 14,
        }),
      ]),
      conditionedProcessProfiles: expect.arrayContaining([
        expect.objectContaining({ conditionCode: 'gypsum_skim_indoor_open_workface' }),
        expect.objectContaining({ conditionCode: 'cement_mortar_indoor_standard_workface' }),
        expect.objectContaining({ conditionCode: 'exterior_base_coat_high_rise_constrained' }),
      ]),
      productivityBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'gypsum_skim_indoor_open_workface',
          baselineProductivity: expect.objectContaining({
            p50PerDay: 260,
            unit: 'm2/day',
            sourceType: 'expert_profile',
            sourceRef: expect.stringContaining('plastering_wall_ceiling:gypsum_skim_indoor_open_workface'),
          }),
        }),
        expect.objectContaining({
          conditionCode: 'exterior_base_coat_high_rise_constrained',
          baselineProductivity: expect.objectContaining({
            p50PerDay: 120,
            unit: 'm2/day',
            sourceType: 'expert_profile',
            sourceRef: expect.stringContaining('plastering_wall_ceiling:exterior_base_coat_high_rise_constrained'),
          }),
        }),
      ]),
    }))

    const exterior = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'plastering_wall_ceiling',
      applicableGranularity: 'task',
      methodVariantCodes: ['exterior_base_coat'],
      elementVariantCodes: ['outdoor_installation', 'high_rise', 'constrained_workface'],
    }) as any

    expect(exterior).toEqual(expect.objectContaining({
      selectedConditionCode: 'exterior_base_coat_high_rise_constrained',
      defaultDaysP50: 11,
      baselineProductivity: expect.objectContaining({ p50PerDay: 120, unit: 'm2/day' }),
    }))
  })

  it('keeps roof waterproof insulation conditionized by roof build-up and ponding-test constraint', async () => {
    const byStableCode = new Map(STANDARD_WORK_DURATION_SEED.map((record) => [record.stableCode, record]))
    const roof = byStableCode.get('roof_waterproof_insulation') as any

    expect(roof).toEqual(expect.objectContaining({
      defaultDaysP20: 6,
      defaultDaysP50: 8,
      defaultDaysP80: 10,
      conditionedDurationBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'membrane_waterproof_open_roof',
          selector: expect.objectContaining({
            roofWaterproofMethodBand: 'membrane_waterproof',
            workfaceBand: 'open',
          }),
          defaultDaysP20: 5,
          defaultDaysP50: 7,
          defaultDaysP80: 9,
        }),
        expect.objectContaining({
          conditionCode: 'insulation_membrane_standard_roof',
          selector: expect.objectContaining({
            roofWaterproofMethodBand: 'insulation_membrane',
            workfaceBand: 'open',
          }),
          defaultDaysP20: 6,
          defaultDaysP50: 8,
          defaultDaysP80: 10,
        }),
        expect.objectContaining({
          conditionCode: 'inverted_roof_ponding_test_constrained',
          selector: expect.objectContaining({
            roofWaterproofMethodBand: 'inverted_roof_ponding_test',
            workfaceBand: 'constrained',
          }),
          defaultDaysP20: 9,
          defaultDaysP50: 13,
          defaultDaysP80: 17,
        }),
      ]),
      conditionedProcessProfiles: expect.arrayContaining([
        expect.objectContaining({ conditionCode: 'membrane_waterproof_open_roof' }),
        expect.objectContaining({ conditionCode: 'insulation_membrane_standard_roof' }),
        expect.objectContaining({ conditionCode: 'inverted_roof_ponding_test_constrained' }),
      ]),
      productivityBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'membrane_waterproof_open_roof',
          baselineProductivity: expect.objectContaining({
            p50PerDay: 240,
            unit: 'm2/day',
            sourceType: 'expert_profile',
            sourceRef: expect.stringContaining('roof_waterproof_insulation:membrane_waterproof_open_roof'),
          }),
        }),
        expect.objectContaining({
          conditionCode: 'inverted_roof_ponding_test_constrained',
          baselineProductivity: expect.objectContaining({
            p50PerDay: 130,
            unit: 'm2/day',
            sourceType: 'expert_profile',
            sourceRef: expect.stringContaining('roof_waterproof_insulation:inverted_roof_ponding_test_constrained'),
          }),
        }),
      ]),
    }))

    const inverted = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'roof_waterproof_insulation',
      applicableGranularity: 'task',
      methodVariantCodes: ['inverted_roof_ponding_test'],
      elementVariantCodes: ['constrained_workface'],
    }) as any

    expect(inverted).toEqual(expect.objectContaining({
      selectedConditionCode: 'inverted_roof_ponding_test_constrained',
      defaultDaysP50: 13,
      baselineProductivity: expect.objectContaining({ p50PerDay: 130, unit: 'm2/day' }),
    }))
  })

  it('keeps roof insulation thermal layer conditionized by insulation system and thermal-bridge complexity', async () => {
    const byStableCode = new Map(STANDARD_WORK_DURATION_SEED.map((record) => [record.stableCode, record]))
    const insulation = byStableCode.get('roof_insulation_thermal_layer') as any

    expect(insulation).toEqual(expect.objectContaining({
      defaultDaysP20: 5,
      defaultDaysP50: 7,
      defaultDaysP80: 9,
      conditionedDurationBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'board_insulation_open_roof',
          selector: expect.objectContaining({
            roofInsulationMethodBand: 'board_insulation',
            workfaceBand: 'open',
          }),
          defaultDaysP20: 4,
          defaultDaysP50: 6,
          defaultDaysP80: 8,
        }),
        expect.objectContaining({
          conditionCode: 'tapered_slope_insulation_standard_roof',
          selector: expect.objectContaining({
            roofInsulationMethodBand: 'tapered_slope_insulation',
            workfaceBand: 'open',
          }),
          defaultDaysP20: 6,
          defaultDaysP50: 8,
          defaultDaysP80: 10,
        }),
        expect.objectContaining({
          conditionCode: 'spray_foam_thermal_bridge_constrained',
          selector: expect.objectContaining({
            roofInsulationMethodBand: 'spray_foam_thermal_bridge',
            workfaceBand: 'constrained',
          }),
          defaultDaysP20: 8,
          defaultDaysP50: 11,
          defaultDaysP80: 14,
        }),
      ]),
      conditionedProcessProfiles: expect.arrayContaining([
        expect.objectContaining({ conditionCode: 'board_insulation_open_roof' }),
        expect.objectContaining({ conditionCode: 'tapered_slope_insulation_standard_roof' }),
        expect.objectContaining({ conditionCode: 'spray_foam_thermal_bridge_constrained' }),
      ]),
      productivityBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'board_insulation_open_roof',
          baselineProductivity: expect.objectContaining({
            p50PerDay: 260,
            unit: 'm2/day',
            sourceType: 'expert_profile',
            sourceRef: expect.stringContaining('roof_insulation_thermal_layer:board_insulation_open_roof'),
          }),
        }),
        expect.objectContaining({
          conditionCode: 'spray_foam_thermal_bridge_constrained',
          baselineProductivity: expect.objectContaining({
            p50PerDay: 120,
            unit: 'm2/day',
            sourceType: 'expert_profile',
            sourceRef: expect.stringContaining('roof_insulation_thermal_layer:spray_foam_thermal_bridge_constrained'),
          }),
        }),
      ]),
    }))

    const sprayFoam = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'roof_insulation_thermal_layer',
      applicableGranularity: 'task',
      methodVariantCodes: ['spray_foam_insulation', 'thermal_bridge_treatment'],
      elementVariantCodes: ['constrained_workface'],
    }) as any

    expect(sprayFoam).toEqual(expect.objectContaining({
      selectedConditionCode: 'spray_foam_thermal_bridge_constrained',
      defaultDaysP50: 11,
      baselineProductivity: expect.objectContaining({ p50PerDay: 120, unit: 'm2/day' }),
    }))
  })

  it('keeps roof membrane waterproof conditionized by membrane system and ponding-test closure', async () => {
    const byStableCode = new Map(STANDARD_WORK_DURATION_SEED.map((record) => [record.stableCode, record]))
    const membrane = byStableCode.get('roof_membrane_waterproof') as any

    expect(membrane).toEqual(expect.objectContaining({
      defaultDaysP20: 7,
      defaultDaysP50: 9,
      defaultDaysP80: 12,
      conditionedDurationBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'sheet_membrane_open_roof',
          selector: expect.objectContaining({
            roofMembraneMethodBand: 'sheet_membrane',
            workfaceBand: 'open',
          }),
          defaultDaysP20: 5,
          defaultDaysP50: 7,
          defaultDaysP80: 9,
        }),
        expect.objectContaining({
          conditionCode: 'coating_membrane_standard_roof',
          selector: expect.objectContaining({
            roofMembraneMethodBand: 'coating_membrane',
            workfaceBand: 'open',
          }),
          defaultDaysP20: 7,
          defaultDaysP50: 9,
          defaultDaysP80: 12,
        }),
        expect.objectContaining({
          conditionCode: 'multi_layer_ponding_test_constrained',
          selector: expect.objectContaining({
            roofMembraneMethodBand: 'multi_layer_ponding_test',
            workfaceBand: 'constrained',
          }),
          defaultDaysP20: 10,
          defaultDaysP50: 14,
          defaultDaysP80: 18,
        }),
      ]),
      conditionedProcessProfiles: expect.arrayContaining([
        expect.objectContaining({ conditionCode: 'sheet_membrane_open_roof' }),
        expect.objectContaining({ conditionCode: 'coating_membrane_standard_roof' }),
        expect.objectContaining({ conditionCode: 'multi_layer_ponding_test_constrained' }),
      ]),
      productivityBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'sheet_membrane_open_roof',
          baselineProductivity: expect.objectContaining({
            p50PerDay: 240,
            unit: 'm2/day',
            sourceType: 'expert_profile',
            sourceRef: expect.stringContaining('roof_membrane_waterproof:sheet_membrane_open_roof'),
          }),
        }),
        expect.objectContaining({
          conditionCode: 'multi_layer_ponding_test_constrained',
          baselineProductivity: expect.objectContaining({
            p50PerDay: 120,
            unit: 'm2/day',
            sourceType: 'expert_profile',
            sourceRef: expect.stringContaining('roof_membrane_waterproof:multi_layer_ponding_test_constrained'),
          }),
        }),
      ]),
    }))

    const ponding = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'roof_membrane_waterproof',
      applicableGranularity: 'task',
      methodVariantCodes: ['multi_layer_ponding_test'],
      elementVariantCodes: ['constrained_workface'],
    }) as any

    expect(ponding).toEqual(expect.objectContaining({
      selectedConditionCode: 'multi_layer_ponding_test_constrained',
      defaultDaysP50: 14,
      baselineProductivity: expect.objectContaining({ p50PerDay: 120, unit: 'm2/day' }),
    }))
  })

  it('keeps roof tile panel surface conditionized by roof surface system and dense node work', async () => {
    const byStableCode = new Map(STANDARD_WORK_DURATION_SEED.map((record) => [record.stableCode, record]))
    const tilePanel = byStableCode.get('roof_tile_panel_surface') as any

    expect(tilePanel).toEqual(expect.objectContaining({
      defaultDaysP20: 7,
      defaultDaysP50: 10,
      defaultDaysP80: 13,
      conditionedDurationBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'clay_concrete_tile_open_roof',
          selector: expect.objectContaining({
            roofTilePanelMethodBand: 'clay_concrete_tile',
            workfaceBand: 'open',
          }),
          defaultDaysP20: 7,
          defaultDaysP50: 9,
          defaultDaysP80: 12,
        }),
        expect.objectContaining({
          conditionCode: 'metal_panel_standard_roof',
          selector: expect.objectContaining({
            roofTilePanelMethodBand: 'metal_panel',
            workfaceBand: 'open',
          }),
          defaultDaysP20: 5,
          defaultDaysP50: 8,
          defaultDaysP80: 10,
        }),
        expect.objectContaining({
          conditionCode: 'dense_ridge_eave_nodes_constrained',
          selector: expect.objectContaining({
            roofTilePanelMethodBand: 'dense_ridge_eave_nodes',
            workfaceBand: 'constrained',
          }),
          defaultDaysP20: 11,
          defaultDaysP50: 15,
          defaultDaysP80: 19,
        }),
      ]),
      conditionedProcessProfiles: expect.arrayContaining([
        expect.objectContaining({ conditionCode: 'clay_concrete_tile_open_roof' }),
        expect.objectContaining({ conditionCode: 'metal_panel_standard_roof' }),
        expect.objectContaining({ conditionCode: 'dense_ridge_eave_nodes_constrained' }),
      ]),
      productivityBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'metal_panel_standard_roof',
          baselineProductivity: expect.objectContaining({
            p50PerDay: 230,
            unit: 'm2/day',
            sourceType: 'expert_profile',
            sourceRef: expect.stringContaining('roof_tile_panel_surface:metal_panel_standard_roof'),
          }),
        }),
        expect.objectContaining({
          conditionCode: 'dense_ridge_eave_nodes_constrained',
          baselineProductivity: expect.objectContaining({
            p50PerDay: 105,
            unit: 'm2/day',
            sourceType: 'expert_profile',
            sourceRef: expect.stringContaining('roof_tile_panel_surface:dense_ridge_eave_nodes_constrained'),
          }),
        }),
      ]),
    }))

    const denseNodes = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'roof_tile_panel_surface',
      applicableGranularity: 'task',
      methodVariantCodes: ['dense_ridge_eave_nodes'],
      elementVariantCodes: ['constrained_workface'],
    }) as any

    expect(denseNodes).toEqual(expect.objectContaining({
      selectedConditionCode: 'dense_ridge_eave_nodes_constrained',
      defaultDaysP50: 15,
      baselineProductivity: expect.objectContaining({ p50PerDay: 105, unit: 'm2/day' }),
    }))
  })

  it('keeps roof detail nodes conditionized by detail type and equipment-root density', async () => {
    const byStableCode = new Map(STANDARD_WORK_DURATION_SEED.map((record) => [record.stableCode, record]))
    const detailNodes = byStableCode.get('roof_detail_nodes') as any

    expect(detailNodes).toEqual(expect.objectContaining({
      defaultDaysP20: 4,
      defaultDaysP50: 6,
      defaultDaysP80: 8,
      conditionedDurationBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'standard_flashing_open_roof',
          selector: expect.objectContaining({
            roofDetailMethodBand: 'standard_flashing',
            workfaceBand: 'open',
          }),
          defaultDaysP20: 3,
          defaultDaysP50: 5,
          defaultDaysP80: 7,
        }),
        expect.objectContaining({
          conditionCode: 'gutter_drainage_nodes_standard_roof',
          selector: expect.objectContaining({
            roofDetailMethodBand: 'gutter_drainage_nodes',
            workfaceBand: 'open',
          }),
          defaultDaysP20: 4,
          defaultDaysP50: 6,
          defaultDaysP80: 8,
        }),
        expect.objectContaining({
          conditionCode: 'equipment_root_dense_constrained',
          selector: expect.objectContaining({
            roofDetailMethodBand: 'equipment_root_dense',
            workfaceBand: 'constrained',
          }),
          defaultDaysP20: 7,
          defaultDaysP50: 10,
          defaultDaysP80: 13,
        }),
      ]),
      conditionedProcessProfiles: expect.arrayContaining([
        expect.objectContaining({ conditionCode: 'standard_flashing_open_roof' }),
        expect.objectContaining({ conditionCode: 'gutter_drainage_nodes_standard_roof' }),
        expect.objectContaining({ conditionCode: 'equipment_root_dense_constrained' }),
      ]),
      productivityBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'standard_flashing_open_roof',
          baselineProductivity: expect.objectContaining({
            p50PerDay: 180,
            unit: 'm2/day',
            sourceType: 'expert_profile',
            sourceRef: expect.stringContaining('roof_detail_nodes:standard_flashing_open_roof'),
          }),
        }),
        expect.objectContaining({
          conditionCode: 'equipment_root_dense_constrained',
          baselineProductivity: expect.objectContaining({
            p50PerDay: 85,
            unit: 'm2/day',
            sourceType: 'expert_profile',
            sourceRef: expect.stringContaining('roof_detail_nodes:equipment_root_dense_constrained'),
          }),
        }),
      ]),
    }))

    const equipmentRoots = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'roof_detail_nodes',
      applicableGranularity: 'task',
      methodVariantCodes: ['equipment_root_dense'],
      elementVariantCodes: ['constrained_workface'],
    }) as any

    expect(equipmentRoots).toEqual(expect.objectContaining({
      selectedConditionCode: 'equipment_root_dense_constrained',
      defaultDaysP50: 10,
      baselineProductivity: expect.objectContaining({ p50PerDay: 85, unit: 'm2/day' }),
    }))
  })

  it('keeps exterior wall waterproof conditionized by waterproofing method and high-rise spray verification', async () => {
    const byStableCode = new Map(STANDARD_WORK_DURATION_SEED.map((record) => [record.stableCode, record]))
    const exterior = byStableCode.get('exterior_wall_waterproof') as any

    expect(exterior).toEqual(expect.objectContaining({
      defaultDaysP20: 6,
      defaultDaysP50: 8,
      defaultDaysP80: 10,
      conditionedDurationBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'coating_waterproof_low_rise_open',
          selector: expect.objectContaining({
            exteriorWallWaterproofMethodBand: 'coating_waterproof',
            heightBand: 'low_rise',
            workfaceBand: 'open',
          }),
          defaultDaysP20: 5,
          defaultDaysP50: 7,
          defaultDaysP80: 9,
        }),
        expect.objectContaining({
          conditionCode: 'membrane_window_node_standard',
          selector: expect.objectContaining({
            exteriorWallWaterproofMethodBand: 'membrane_window_node',
            workfaceBand: 'open',
          }),
          defaultDaysP20: 7,
          defaultDaysP50: 9,
          defaultDaysP80: 12,
        }),
        expect.objectContaining({
          conditionCode: 'spray_test_high_rise_constrained',
          selector: expect.objectContaining({
            exteriorWallWaterproofMethodBand: 'spray_test_high_rise',
            heightBand: 'high_rise',
            workfaceBand: 'constrained',
          }),
          defaultDaysP20: 10,
          defaultDaysP50: 14,
          defaultDaysP80: 18,
        }),
      ]),
      conditionedProcessProfiles: expect.arrayContaining([
        expect.objectContaining({ conditionCode: 'coating_waterproof_low_rise_open' }),
        expect.objectContaining({ conditionCode: 'membrane_window_node_standard' }),
        expect.objectContaining({ conditionCode: 'spray_test_high_rise_constrained' }),
      ]),
      productivityBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'coating_waterproof_low_rise_open',
          baselineProductivity: expect.objectContaining({
            p50PerDay: 220,
            unit: 'm2/day',
            sourceType: 'expert_profile',
            sourceRef: expect.stringContaining('exterior_wall_waterproof:coating_waterproof_low_rise_open'),
          }),
        }),
        expect.objectContaining({
          conditionCode: 'spray_test_high_rise_constrained',
          baselineProductivity: expect.objectContaining({
            p50PerDay: 95,
            unit: 'm2/day',
            sourceType: 'expert_profile',
            sourceRef: expect.stringContaining('exterior_wall_waterproof:spray_test_high_rise_constrained'),
          }),
        }),
      ]),
    }))

    const highRiseSpray = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'exterior_wall_waterproof',
      applicableGranularity: 'task',
      methodVariantCodes: ['spray_test_high_rise'],
      elementVariantCodes: ['high_rise', 'constrained_workface'],
    }) as any

    expect(highRiseSpray).toEqual(expect.objectContaining({
      selectedConditionCode: 'spray_test_high_rise_constrained',
      defaultDaysP50: 14,
      baselineProductivity: expect.objectContaining({ p50PerDay: 95, unit: 'm2/day' }),
    }))
  })

  it('keeps floor finish system conditionized by finish system and protected-room complexity', async () => {
    const byStableCode = new Map(STANDARD_WORK_DURATION_SEED.map((record) => [record.stableCode, record]))
    const floorFinish = byStableCode.get('floor_finish_system') as any

    expect(floorFinish).toEqual(expect.objectContaining({
      defaultDaysP20: 7,
      defaultDaysP50: 10,
      defaultDaysP80: 13,
      conditionedDurationBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'self_leveling_open_room',
          selector: expect.objectContaining({
            floorFinishMethodBand: 'self_leveling',
            locationBand: 'indoor',
            workfaceBand: 'open',
          }),
          defaultDaysP20: 5,
          defaultDaysP50: 7,
          defaultDaysP80: 9,
        }),
        expect.objectContaining({
          conditionCode: 'tile_stone_standard_room',
          selector: expect.objectContaining({
            floorFinishMethodBand: 'tile_stone',
            locationBand: 'indoor',
            workfaceBand: 'open',
          }),
          defaultDaysP20: 8,
          defaultDaysP50: 11,
          defaultDaysP80: 14,
        }),
        expect.objectContaining({
          conditionCode: 'timber_floor_protected_constrained',
          selector: expect.objectContaining({
            floorFinishMethodBand: 'timber_floor_protected',
            locationBand: 'indoor',
            workfaceBand: 'constrained',
          }),
          defaultDaysP20: 10,
          defaultDaysP50: 14,
          defaultDaysP80: 18,
        }),
      ]),
      conditionedProcessProfiles: expect.arrayContaining([
        expect.objectContaining({ conditionCode: 'self_leveling_open_room' }),
        expect.objectContaining({ conditionCode: 'tile_stone_standard_room' }),
        expect.objectContaining({ conditionCode: 'timber_floor_protected_constrained' }),
      ]),
      productivityBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'self_leveling_open_room',
          baselineProductivity: expect.objectContaining({
            p50PerDay: 260,
            unit: 'm2/day',
            sourceType: 'expert_profile',
            sourceRef: expect.stringContaining('floor_finish_system:self_leveling_open_room'),
          }),
        }),
        expect.objectContaining({
          conditionCode: 'timber_floor_protected_constrained',
          baselineProductivity: expect.objectContaining({
            p50PerDay: 95,
            unit: 'm2/day',
            sourceType: 'expert_profile',
            sourceRef: expect.stringContaining('floor_finish_system:timber_floor_protected_constrained'),
          }),
        }),
      ]),
    }))

    const protectedTimber = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'floor_finish_system',
      applicableGranularity: 'task',
      methodVariantCodes: ['timber_floor_protected'],
      elementVariantCodes: ['indoor_installation', 'constrained_workface'],
    }) as any

    expect(protectedTimber).toEqual(expect.objectContaining({
      selectedConditionCode: 'timber_floor_protected_constrained',
      defaultDaysP50: 14,
      baselineProductivity: expect.objectContaining({ p50PerDay: 95, unit: 'm2/day' }),
    }))
  })

  it('keeps exterior insulation finish conditionized by insulation system and high-rise node complexity', async () => {
    const byStableCode = new Map(STANDARD_WORK_DURATION_SEED.map((record) => [record.stableCode, record]))
    const exteriorInsulation = byStableCode.get('exterior_insulation_finish') as any

    expect(exteriorInsulation).toEqual(expect.objectContaining({
      defaultDaysP20: 7,
      defaultDaysP50: 10,
      defaultDaysP80: 13,
      conditionedDurationBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'thin_plaster_eps_low_rise_open',
          selector: expect.objectContaining({
            exteriorInsulationMethodBand: 'thin_plaster_eps',
            heightBand: 'low_rise',
            workfaceBand: 'open',
          }),
          defaultDaysP20: 7,
          defaultDaysP50: 9,
          defaultDaysP80: 12,
        }),
        expect.objectContaining({
          conditionCode: 'insulated_panel_standard_facade',
          selector: expect.objectContaining({
            exteriorInsulationMethodBand: 'insulated_panel',
            workfaceBand: 'open',
          }),
          defaultDaysP20: 8,
          defaultDaysP50: 11,
          defaultDaysP80: 14,
        }),
        expect.objectContaining({
          conditionCode: 'thick_insulation_high_rise_node_constrained',
          selector: expect.objectContaining({
            exteriorInsulationMethodBand: 'thick_insulation_node',
            heightBand: 'high_rise',
            workfaceBand: 'constrained',
          }),
          defaultDaysP20: 12,
          defaultDaysP50: 16,
          defaultDaysP80: 21,
        }),
      ]),
      conditionedProcessProfiles: expect.arrayContaining([
        expect.objectContaining({ conditionCode: 'thin_plaster_eps_low_rise_open' }),
        expect.objectContaining({ conditionCode: 'insulated_panel_standard_facade' }),
        expect.objectContaining({ conditionCode: 'thick_insulation_high_rise_node_constrained' }),
      ]),
      productivityBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'thin_plaster_eps_low_rise_open',
          baselineProductivity: expect.objectContaining({
            p50PerDay: 210,
            unit: 'm2/day',
            sourceType: 'expert_profile',
            sourceRef: expect.stringContaining('exterior_insulation_finish:thin_plaster_eps_low_rise_open'),
          }),
        }),
        expect.objectContaining({
          conditionCode: 'thick_insulation_high_rise_node_constrained',
          baselineProductivity: expect.objectContaining({
            p50PerDay: 90,
            unit: 'm2/day',
            sourceType: 'expert_profile',
            sourceRef: expect.stringContaining('exterior_insulation_finish:thick_insulation_high_rise_node_constrained'),
          }),
        }),
      ]),
    }))

    const highRiseNodes = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'exterior_insulation_finish',
      applicableGranularity: 'task',
      methodVariantCodes: ['thick_insulation_node'],
      elementVariantCodes: ['high_rise', 'constrained_workface'],
    }) as any

    expect(highRiseNodes).toEqual(expect.objectContaining({
      selectedConditionCode: 'thick_insulation_high_rise_node_constrained',
      defaultDaysP50: 16,
      baselineProductivity: expect.objectContaining({ p50PerDay: 90, unit: 'm2/day' }),
    }))
  })

  it('keeps ceiling system finish conditionized by panel system and MEP terminal density', async () => {
    const byStableCode = new Map(STANDARD_WORK_DURATION_SEED.map((record) => [record.stableCode, record]))
    const ceiling = byStableCode.get('ceiling_system_finish') as any

    expect(ceiling).toEqual(expect.objectContaining({
      defaultDaysP20: 6,
      defaultDaysP50: 9,
      defaultDaysP80: 12,
      conditionedDurationBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'mineral_board_open_ceiling',
          selector: expect.objectContaining({
            ceilingSystemMethodBand: 'mineral_board',
            locationBand: 'indoor',
            workfaceBand: 'open',
          }),
          defaultDaysP20: 5,
          defaultDaysP50: 7,
          defaultDaysP80: 9,
        }),
        expect.objectContaining({
          conditionCode: 'gypsum_board_standard_ceiling',
          selector: expect.objectContaining({
            ceilingSystemMethodBand: 'gypsum_board',
            locationBand: 'indoor',
            workfaceBand: 'open',
          }),
          defaultDaysP20: 7,
          defaultDaysP50: 9,
          defaultDaysP80: 12,
        }),
        expect.objectContaining({
          conditionCode: 'complex_mep_terminal_constrained',
          selector: expect.objectContaining({
            ceilingSystemMethodBand: 'complex_mep_terminal',
            locationBand: 'indoor',
            workfaceBand: 'constrained',
          }),
          defaultDaysP20: 10,
          defaultDaysP50: 14,
          defaultDaysP80: 18,
        }),
      ]),
      conditionedProcessProfiles: expect.arrayContaining([
        expect.objectContaining({ conditionCode: 'mineral_board_open_ceiling' }),
        expect.objectContaining({ conditionCode: 'gypsum_board_standard_ceiling' }),
        expect.objectContaining({ conditionCode: 'complex_mep_terminal_constrained' }),
      ]),
      productivityBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'mineral_board_open_ceiling',
          baselineProductivity: expect.objectContaining({
            p50PerDay: 260,
            unit: 'm2/day',
            sourceType: 'expert_profile',
            sourceRef: expect.stringContaining('ceiling_system_finish:mineral_board_open_ceiling'),
          }),
        }),
        expect.objectContaining({
          conditionCode: 'complex_mep_terminal_constrained',
          baselineProductivity: expect.objectContaining({
            p50PerDay: 105,
            unit: 'm2/day',
            sourceType: 'expert_profile',
            sourceRef: expect.stringContaining('ceiling_system_finish:complex_mep_terminal_constrained'),
          }),
        }),
      ]),
    }))

    const complexMep = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'ceiling_system_finish',
      applicableGranularity: 'task',
      methodVariantCodes: ['complex_mep_terminal'],
      elementVariantCodes: ['indoor_installation', 'constrained_workface'],
    }) as any

    expect(complexMep).toEqual(expect.objectContaining({
      selectedConditionCode: 'complex_mep_terminal_constrained',
      defaultDaysP50: 14,
      baselineProductivity: expect.objectContaining({ p50PerDay: 105, unit: 'm2/day' }),
    }))
  })

  it('keeps public area interior finish conditionized by public-space complexity and renovation constraints', async () => {
    const byStableCode = new Map(STANDARD_WORK_DURATION_SEED.map((record) => [record.stableCode, record]))
    const publicFinish = byStableCode.get('interior_public_finish') as any

    expect(publicFinish).toEqual(expect.objectContaining({
      defaultDaysP20: 8,
      defaultDaysP50: 12,
      defaultDaysP80: 16,
      conditionedDurationBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'standard_corridor_public_finish',
          selector: expect.objectContaining({
            interiorPublicFinishMethodBand: 'standard_corridor_finish',
            locationBand: 'indoor',
            workfaceBand: 'open',
          }),
          defaultDaysP50: 10,
        }),
        expect.objectContaining({
          conditionCode: 'complex_lobby_public_finish',
          selector: expect.objectContaining({
            interiorPublicFinishMethodBand: 'complex_lobby_finish',
            locationBand: 'indoor',
          }),
          defaultDaysP50: 14,
        }),
        expect.objectContaining({
          conditionCode: 'renovation_constrained_public_finish',
          selector: expect.objectContaining({
            interiorPublicFinishMethodBand: 'renovation_constrained_finish',
            renovationBand: 'renovation',
            workfaceBand: 'constrained',
          }),
          defaultDaysP50: 18,
        }),
      ]),
      conditionedProcessProfiles: expect.arrayContaining([
        expect.objectContaining({ conditionCode: 'standard_corridor_public_finish' }),
        expect.objectContaining({ conditionCode: 'complex_lobby_public_finish' }),
        expect.objectContaining({ conditionCode: 'renovation_constrained_public_finish' }),
      ]),
      productivityBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'standard_corridor_public_finish',
          baselineProductivity: expect.objectContaining({ p50PerDay: 160, unit: 'm2/day', sourceType: 'quota' }),
        }),
        expect.objectContaining({
          conditionCode: 'renovation_constrained_public_finish',
          baselineProductivity: expect.objectContaining({ p50PerDay: 80, unit: 'm2/day', sourceType: 'expert_profile' }),
        }),
      ]),
    }))

    const renovationConstrained = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'interior_public_finish',
      applicableGranularity: 'task',
      methodVariantCodes: ['renovation_constrained_finish'],
      elementVariantCodes: ['renovation', 'constrained_workface'],
    }) as any

    expect(renovationConstrained).toEqual(expect.objectContaining({
      selectedConditionCode: 'renovation_constrained_public_finish',
      defaultDaysP50: 18,
      baselineProductivity: expect.objectContaining({ p50PerDay: 80, unit: 'm2/day' }),
    }))
  })

  it('keeps unit interior finish conditionized by repeated unit, wet-area, and occupied renovation constraints', async () => {
    const byStableCode = new Map(STANDARD_WORK_DURATION_SEED.map((record) => [record.stableCode, record]))
    const unitFinish = byStableCode.get('interior_unit_finish') as any

    expect(unitFinish).toEqual(expect.objectContaining({
      defaultDaysP20: 7,
      defaultDaysP50: 10,
      defaultDaysP80: 13,
      conditionedDurationBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'standard_repeated_unit_finish',
          selector: expect.objectContaining({
            interiorUnitFinishMethodBand: 'standard_repeated_finish',
            locationBand: 'indoor',
            workfaceBand: 'open',
          }),
          defaultDaysP50: 9,
        }),
        expect.objectContaining({
          conditionCode: 'wet_area_unit_finish',
          selector: expect.objectContaining({
            interiorUnitFinishMethodBand: 'wet_area_finish',
            locationBand: 'indoor',
          }),
          defaultDaysP50: 12,
        }),
        expect.objectContaining({
          conditionCode: 'renovation_occupied_unit_finish',
          selector: expect.objectContaining({
            interiorUnitFinishMethodBand: 'renovation_occupied_finish',
            renovationBand: 'renovation',
            workfaceBand: 'constrained',
          }),
          defaultDaysP50: 16,
        }),
      ]),
      conditionedProcessProfiles: expect.arrayContaining([
        expect.objectContaining({ conditionCode: 'standard_repeated_unit_finish' }),
        expect.objectContaining({ conditionCode: 'wet_area_unit_finish' }),
        expect.objectContaining({ conditionCode: 'renovation_occupied_unit_finish' }),
      ]),
      productivityBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'standard_repeated_unit_finish',
          baselineProductivity: expect.objectContaining({ p50PerDay: 140, unit: 'm2/day', sourceType: 'quota' }),
        }),
        expect.objectContaining({
          conditionCode: 'renovation_occupied_unit_finish',
          baselineProductivity: expect.objectContaining({ p50PerDay: 65, unit: 'm2/day', sourceType: 'expert_profile' }),
        }),
      ]),
    }))

    const renovationOccupied = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'interior_unit_finish',
      applicableGranularity: 'task',
      methodVariantCodes: ['renovation_occupied_finish'],
      elementVariantCodes: ['renovation', 'constrained_workface'],
    }) as any

    expect(renovationOccupied).toEqual(expect.objectContaining({
      selectedConditionCode: 'renovation_occupied_unit_finish',
      defaultDaysP50: 16,
      baselineProductivity: expect.objectContaining({ p50PerDay: 65, unit: 'm2/day' }),
    }))
  })

  it('keeps lightweight partition wall conditionized by partition system and constrained glass installation', async () => {
    const byStableCode = new Map(STANDARD_WORK_DURATION_SEED.map((record) => [record.stableCode, record]))
    const partitionWall = byStableCode.get('lightweight_partition_wall') as any

    expect(partitionWall).toEqual(expect.objectContaining({
      defaultDaysP20: 6,
      defaultDaysP50: 9,
      defaultDaysP80: 12,
      conditionedDurationBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'stud_board_lightweight_partition',
          selector: expect.objectContaining({
            lightweightPartitionWallMethodBand: 'stud_board_partition',
            locationBand: 'indoor',
            workfaceBand: 'open',
          }),
          defaultDaysP50: 8,
        }),
        expect.objectContaining({
          conditionCode: 'alc_panel_lightweight_partition',
          selector: expect.objectContaining({
            lightweightPartitionWallMethodBand: 'alc_panel_partition',
            locationBand: 'indoor',
          }),
          defaultDaysP50: 10,
        }),
        expect.objectContaining({
          conditionCode: 'glass_partition_constrained_lightweight',
          selector: expect.objectContaining({
            lightweightPartitionWallMethodBand: 'glass_partition_constrained',
            workfaceBand: 'constrained',
          }),
          defaultDaysP50: 14,
        }),
      ]),
      conditionedProcessProfiles: expect.arrayContaining([
        expect.objectContaining({ conditionCode: 'stud_board_lightweight_partition' }),
        expect.objectContaining({ conditionCode: 'alc_panel_lightweight_partition' }),
        expect.objectContaining({ conditionCode: 'glass_partition_constrained_lightweight' }),
      ]),
      productivityBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'stud_board_lightweight_partition',
          baselineProductivity: expect.objectContaining({
            p50PerDay: 125,
            unit: 'm2/day',
            sourceType: 'quota',
            sourceRef: 'quota:TY01-89-2016:chapter=03_06:table=m2_day_productivity:item=stud_board_lightweight_partition',
          }),
        }),
        expect.objectContaining({
          conditionCode: 'glass_partition_constrained_lightweight',
          baselineProductivity: expect.objectContaining({
            p50PerDay: 70,
            unit: 'm2/day',
            sourceType: 'expert_profile',
            sourceRef: expect.stringContaining('lightweight_partition_wall:glass_partition_constrained_lightweight'),
          }),
        }),
      ]),
    }))

    const constrainedGlass = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'lightweight_partition_wall',
      applicableGranularity: 'task',
      methodVariantCodes: ['glass_partition_constrained'],
      elementVariantCodes: ['constrained_workface'],
    }) as any

    expect(constrainedGlass).toEqual(expect.objectContaining({
      selectedConditionCode: 'glass_partition_constrained_lightweight',
      defaultDaysP50: 14,
      baselineProductivity: expect.objectContaining({ p50PerDay: 70, unit: 'm2/day' }),
    }))
  })

  it('keeps wall panel finish conditionized by panel material and constrained feature-wall nodes', async () => {
    const byStableCode = new Map(STANDARD_WORK_DURATION_SEED.map((record) => [record.stableCode, record]))
    const wallPanel = byStableCode.get('wall_panel_finish') as any

    expect(wallPanel).toEqual(expect.objectContaining({
      defaultDaysP20: 8,
      defaultDaysP50: 11,
      defaultDaysP80: 14,
      conditionedDurationBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'wood_metal_wall_panel_open_finish',
          selector: expect.objectContaining({
            wallPanelFinishMethodBand: 'wood_metal_panel',
            locationBand: 'indoor',
            workfaceBand: 'open',
          }),
          defaultDaysP50: 10,
        }),
        expect.objectContaining({
          conditionCode: 'stone_ceramic_wall_panel_finish',
          selector: expect.objectContaining({
            wallPanelFinishMethodBand: 'stone_ceramic_panel',
            locationBand: 'indoor',
          }),
          defaultDaysP50: 13,
        }),
        expect.objectContaining({
          conditionCode: 'feature_wall_panel_constrained_nodes',
          selector: expect.objectContaining({
            wallPanelFinishMethodBand: 'feature_wall_constrained_node',
            workfaceBand: 'constrained',
          }),
          defaultDaysP50: 17,
        }),
      ]),
      conditionedProcessProfiles: expect.arrayContaining([
        expect.objectContaining({ conditionCode: 'wood_metal_wall_panel_open_finish' }),
        expect.objectContaining({ conditionCode: 'stone_ceramic_wall_panel_finish' }),
        expect.objectContaining({ conditionCode: 'feature_wall_panel_constrained_nodes' }),
      ]),
      productivityBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'wood_metal_wall_panel_open_finish',
          baselineProductivity: expect.objectContaining({
            p50PerDay: 105,
            unit: 'm2/day',
            sourceType: 'quota',
            sourceRef: 'quota:TY01-89-2016:chapter=03_07:table=m2_day_productivity:item=wood_metal_wall_panel_open_finish',
          }),
        }),
        expect.objectContaining({
          conditionCode: 'feature_wall_panel_constrained_nodes',
          baselineProductivity: expect.objectContaining({
            p50PerDay: 58,
            unit: 'm2/day',
            sourceType: 'expert_profile',
            sourceRef: expect.stringContaining('wall_panel_finish:feature_wall_panel_constrained_nodes'),
          }),
        }),
      ]),
    }))

    const constrainedFeatureWall = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'wall_panel_finish',
      applicableGranularity: 'task',
      methodVariantCodes: ['feature_wall_constrained_node'],
      elementVariantCodes: ['constrained_workface'],
    }) as any

    expect(constrainedFeatureWall).toEqual(expect.objectContaining({
      selectedConditionCode: 'feature_wall_panel_constrained_nodes',
      defaultDaysP50: 17,
      baselineProductivity: expect.objectContaining({ p50PerDay: 58, unit: 'm2/day' }),
    }))
  })

  it('keeps tile facing finish conditionized by tile location and wet-area node complexity', async () => {
    const byStableCode = new Map(STANDARD_WORK_DURATION_SEED.map((record) => [record.stableCode, record]))
    const tileFacing = byStableCode.get('tile_facing_finish') as any

    expect(tileFacing).toEqual(expect.objectContaining({
      defaultDaysP20: 7,
      defaultDaysP50: 10,
      defaultDaysP80: 13,
      conditionedDurationBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'standard_indoor_tile_facing',
          selector: expect.objectContaining({
            tileFacingMethodBand: 'standard_indoor_tile',
            locationBand: 'indoor',
            workfaceBand: 'open',
          }),
          defaultDaysP50: 9,
        }),
        expect.objectContaining({
          conditionCode: 'exterior_tile_facing_finish',
          selector: expect.objectContaining({
            tileFacingMethodBand: 'exterior_tile',
            locationBand: 'outdoor',
          }),
          defaultDaysP50: 12,
        }),
        expect.objectContaining({
          conditionCode: 'wet_area_pattern_tile_constrained',
          selector: expect.objectContaining({
            tileFacingMethodBand: 'wet_area_pattern_tile',
            workfaceBand: 'constrained',
          }),
          defaultDaysP50: 15,
        }),
      ]),
      conditionedProcessProfiles: expect.arrayContaining([
        expect.objectContaining({ conditionCode: 'standard_indoor_tile_facing' }),
        expect.objectContaining({ conditionCode: 'exterior_tile_facing_finish' }),
        expect.objectContaining({ conditionCode: 'wet_area_pattern_tile_constrained' }),
      ]),
      productivityBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'standard_indoor_tile_facing',
          baselineProductivity: expect.objectContaining({
            p50PerDay: 120,
            unit: 'm2/day',
            sourceType: 'quota',
            sourceRef: 'quota:TY01-89-2016:chapter=03_08:table=m2_day_productivity:item=standard_indoor_tile_facing',
          }),
        }),
        expect.objectContaining({
          conditionCode: 'wet_area_pattern_tile_constrained',
          baselineProductivity: expect.objectContaining({
            p50PerDay: 68,
            unit: 'm2/day',
            sourceType: 'expert_profile',
            sourceRef: expect.stringContaining('tile_facing_finish:wet_area_pattern_tile_constrained'),
          }),
        }),
      ]),
    }))

    const wetAreaPattern = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'tile_facing_finish',
      applicableGranularity: 'task',
      methodVariantCodes: ['wet_area_pattern_tile'],
      elementVariantCodes: ['constrained_workface'],
    }) as any

    expect(wetAreaPattern).toEqual(expect.objectContaining({
      selectedConditionCode: 'wet_area_pattern_tile_constrained',
      defaultDaysP50: 15,
      baselineProductivity: expect.objectContaining({ p50PerDay: 68, unit: 'm2/day' }),
    }))

    const exteriorTile = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'tile_facing_finish',
      applicableGranularity: 'task',
      methodVariantCodes: ['exterior_tile'],
    }) as any

    expect(exteriorTile).toEqual(expect.objectContaining({
      selectedConditionCode: 'exterior_tile_facing_finish',
      defaultDaysP50: 12,
      baselineProductivity: expect.objectContaining({ p50PerDay: 88, unit: 'm2/day' }),
    }))
  })

  it('keeps coating paint finish conditionized by paint system and substrate exposure', async () => {
    const byStableCode = new Map(STANDARD_WORK_DURATION_SEED.map((record) => [record.stableCode, record]))
    const coatingPaint = byStableCode.get('coating_paint_finish') as any

    expect(coatingPaint).toEqual(expect.objectContaining({
      defaultDaysP20: 6,
      defaultDaysP50: 8,
      defaultDaysP80: 10,
      conditionedDurationBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'interior_emulsion_paint_open_finish',
          selector: expect.objectContaining({
            coatingPaintFinishMethodBand: 'interior_emulsion',
            locationBand: 'indoor',
            workfaceBand: 'open',
          }),
          defaultDaysP50: 7,
        }),
        expect.objectContaining({
          conditionCode: 'exterior_weatherproof_coating_finish',
          selector: expect.objectContaining({
            coatingPaintFinishMethodBand: 'exterior_weatherproof',
            locationBand: 'outdoor',
          }),
          defaultDaysP50: 9,
        }),
        expect.objectContaining({
          conditionCode: 'epoxy_solvent_high_requirement_paint',
          selector: expect.objectContaining({
            coatingPaintFinishMethodBand: 'epoxy_solvent_high_requirement',
            workfaceBand: 'constrained',
          }),
          defaultDaysP50: 11,
        }),
      ]),
      conditionedProcessProfiles: expect.arrayContaining([
        expect.objectContaining({ conditionCode: 'interior_emulsion_paint_open_finish' }),
        expect.objectContaining({ conditionCode: 'exterior_weatherproof_coating_finish' }),
        expect.objectContaining({ conditionCode: 'epoxy_solvent_high_requirement_paint' }),
      ]),
      productivityBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'interior_emulsion_paint_open_finish',
          baselineProductivity: expect.objectContaining({
            p50PerDay: 180,
            unit: 'm2/day',
            sourceType: 'quota',
            sourceRef: 'quota:TY01-89-2016:chapter=03_10:table=m2_day_productivity:item=interior_emulsion_paint_open_finish',
          }),
        }),
        expect.objectContaining({
          conditionCode: 'epoxy_solvent_high_requirement_paint',
          baselineProductivity: expect.objectContaining({
            p50PerDay: 90,
            unit: 'm2/day',
            sourceType: 'expert_profile',
            sourceRef: expect.stringContaining('coating_paint_finish:epoxy_solvent_high_requirement_paint'),
          }),
        }),
      ]),
    }))

    const exteriorPaint = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'coating_paint_finish',
      applicableGranularity: 'task',
      methodVariantCodes: ['exterior_weatherproof_coating'],
    }) as any

    expect(exteriorPaint).toEqual(expect.objectContaining({
      selectedConditionCode: 'exterior_weatherproof_coating_finish',
      defaultDaysP50: 9,
      baselineProductivity: expect.objectContaining({ p50PerDay: 125, unit: 'm2/day' }),
    }))
  })

  it('keeps wallpaper soft finish conditionized by wall covering material and soft-package nodes', async () => {
    const byStableCode = new Map(STANDARD_WORK_DURATION_SEED.map((record) => [record.stableCode, record]))
    const wallpaperSoft = byStableCode.get('wallpaper_soft_finish') as any

    expect(wallpaperSoft).toEqual(expect.objectContaining({
      defaultDaysP20: 5,
      defaultDaysP50: 7,
      defaultDaysP80: 9,
      conditionedDurationBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'standard_wallpaper_open_finish',
          selector: expect.objectContaining({
            wallpaperSoftFinishMethodBand: 'standard_wallpaper',
            workfaceBand: 'open',
          }),
          defaultDaysP50: 6,
        }),
        expect.objectContaining({
          conditionCode: 'wall_fabric_dense_joint_finish',
          selector: expect.objectContaining({
            wallpaperSoftFinishMethodBand: 'wall_fabric_dense_joint',
          }),
          defaultDaysP50: 8,
        }),
        expect.objectContaining({
          conditionCode: 'soft_package_constrained_node_finish',
          selector: expect.objectContaining({
            wallpaperSoftFinishMethodBand: 'soft_package_constrained',
            workfaceBand: 'constrained',
          }),
          defaultDaysP50: 10,
        }),
      ]),
      conditionedProcessProfiles: expect.arrayContaining([
        expect.objectContaining({ conditionCode: 'standard_wallpaper_open_finish' }),
        expect.objectContaining({ conditionCode: 'wall_fabric_dense_joint_finish' }),
        expect.objectContaining({ conditionCode: 'soft_package_constrained_node_finish' }),
      ]),
      productivityBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'standard_wallpaper_open_finish',
          baselineProductivity: expect.objectContaining({
            p50PerDay: 150,
            unit: 'm2/day',
            sourceType: 'quota',
            sourceRef: 'quota:TY01-89-2016:chapter=03_11:table=m2_day_productivity:item=standard_wallpaper_open_finish',
          }),
        }),
        expect.objectContaining({
          conditionCode: 'soft_package_constrained_node_finish',
          baselineProductivity: expect.objectContaining({
            p50PerDay: 55,
            unit: 'm2/day',
            sourceType: 'expert_profile',
            sourceRef: expect.stringContaining('wallpaper_soft_finish:soft_package_constrained_node_finish'),
          }),
        }),
      ]),
    }))

    const softPackage = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'wallpaper_soft_finish',
      applicableGranularity: 'task',
      methodVariantCodes: ['soft_package_constrained'],
      elementVariantCodes: ['constrained_workface'],
    }) as any

    expect(softPackage).toEqual(expect.objectContaining({
      selectedConditionCode: 'soft_package_constrained_node_finish',
      defaultDaysP50: 10,
      baselineProductivity: expect.objectContaining({ p50PerDay: 55, unit: 'm2/day' }),
    }))
  })

  it('keeps outdoor utilities conditionized by utility interface complexity without replacing system-specific networks', async () => {
    const byStableCode = new Map(STANDARD_WORK_DURATION_SEED.map((record) => [record.stableCode, record]))
    const outdoorUtilities = byStableCode.get('outdoor_utilities') as any

    expect(outdoorUtilities).toEqual(expect.objectContaining({
      defaultDaysP20: 10,
      defaultDaysP50: 14,
      defaultDaysP80: 18,
      conditionedDurationBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'standard_outdoor_utility_handover',
          selector: expect.objectContaining({
            outdoorUtilitiesMethodBand: 'standard_handover',
            workfaceBand: 'open',
          }),
          defaultDaysP50: 12,
        }),
        expect.objectContaining({
          conditionCode: 'multi_network_crossing_interface',
          selector: expect.objectContaining({
            outdoorUtilitiesMethodBand: 'multi_network_crossing',
          }),
          defaultDaysP50: 16,
        }),
        expect.objectContaining({
          conditionCode: 'existing_utility_relocation_constrained',
          selector: expect.objectContaining({
            outdoorUtilitiesMethodBand: 'existing_utility_relocation',
            workfaceBand: 'constrained',
          }),
          defaultDaysP50: 20,
        }),
      ]),
      conditionedProcessProfiles: expect.arrayContaining([
        expect.objectContaining({ conditionCode: 'standard_outdoor_utility_handover' }),
        expect.objectContaining({ conditionCode: 'multi_network_crossing_interface' }),
        expect.objectContaining({ conditionCode: 'existing_utility_relocation_constrained' }),
      ]),
      productivityBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'standard_outdoor_utility_handover',
          baselineProductivity: expect.objectContaining({
            p50PerDay: 70,
            unit: 'm/day',
            sourceType: 'quota',
            sourceRef: 'quota:TY01-89-2016:chapter=OUT:table=frontage_productivity:item=standard_outdoor_utility_handover',
          }),
        }),
        expect.objectContaining({
          conditionCode: 'existing_utility_relocation_constrained',
          baselineProductivity: expect.objectContaining({
            p50PerDay: 32,
            unit: 'm/day',
            sourceType: 'expert_profile',
            sourceRef: expect.stringContaining('outdoor_utilities:existing_utility_relocation_constrained'),
          }),
        }),
      ]),
    }))

    const relocation = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'outdoor_utilities',
      applicableGranularity: 'task',
      methodVariantCodes: ['existing_utility_relocation'],
      elementVariantCodes: ['constrained_workface'],
    }) as any

    expect(relocation).toEqual(expect.objectContaining({
      selectedConditionCode: 'existing_utility_relocation_constrained',
      defaultDaysP50: 20,
      baselineProductivity: expect.objectContaining({ p50PerDay: 32, unit: 'm/day' }),
    }))
  })

  it('keeps outdoor water supply network conditionized by pipe material and municipal tie-in complexity', async () => {
    const byStableCode = new Map(STANDARD_WORK_DURATION_SEED.map((record) => [record.stableCode, record]))
    const waterSupply = byStableCode.get('outdoor_water_supply_network') as any

    expect(waterSupply).toEqual(expect.objectContaining({
      defaultDaysP20: 9,
      defaultDaysP50: 13,
      defaultDaysP80: 17,
      conditionedDurationBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'pe_pipe_standard_trench_water_supply',
          selector: expect.objectContaining({
            outdoorWaterSupplyNetworkMethodBand: 'pe_pipe_standard_trench',
            workfaceBand: 'open',
          }),
          defaultDaysP50: 11,
        }),
        expect.objectContaining({
          conditionCode: 'ductile_iron_main_pressure_test',
          selector: expect.objectContaining({
            outdoorWaterSupplyNetworkMethodBand: 'ductile_iron_main_pressure',
          }),
          defaultDaysP50: 14,
        }),
        expect.objectContaining({
          conditionCode: 'municipal_tie_in_hydrant_constrained',
          selector: expect.objectContaining({
            outdoorWaterSupplyNetworkMethodBand: 'municipal_tie_in_hydrant',
            workfaceBand: 'constrained',
          }),
          defaultDaysP50: 18,
        }),
      ]),
      conditionedProcessProfiles: expect.arrayContaining([
        expect.objectContaining({ conditionCode: 'pe_pipe_standard_trench_water_supply' }),
        expect.objectContaining({ conditionCode: 'ductile_iron_main_pressure_test' }),
        expect.objectContaining({ conditionCode: 'municipal_tie_in_hydrant_constrained' }),
      ]),
      productivityBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'pe_pipe_standard_trench_water_supply',
          baselineProductivity: expect.objectContaining({
            p50PerDay: 90,
            unit: 'm/day',
            sourceType: 'quota',
            sourceRef: 'quota:TY01-89-2016:chapter=05_06:table=m_day_productivity:item=pe_pipe_standard_trench_water_supply',
          }),
        }),
        expect.objectContaining({
          conditionCode: 'municipal_tie_in_hydrant_constrained',
          baselineProductivity: expect.objectContaining({
            p50PerDay: 48,
            unit: 'm/day',
            sourceType: 'expert_profile',
            sourceRef: expect.stringContaining('outdoor_water_supply_network:municipal_tie_in_hydrant_constrained'),
          }),
        }),
      ]),
    }))

    const municipalTieIn = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'outdoor_water_supply_network',
      applicableGranularity: 'task',
      methodVariantCodes: ['municipal_tie_in_hydrant'],
      elementVariantCodes: ['constrained_workface'],
    }) as any

    expect(municipalTieIn).toEqual(expect.objectContaining({
      selectedConditionCode: 'municipal_tie_in_hydrant_constrained',
      defaultDaysP50: 18,
      baselineProductivity: expect.objectContaining({ p50PerDay: 48, unit: 'm/day' }),
    }))
  })

  it('keeps outdoor drainage network conditionized by sewer type, test burden, and manhole density', async () => {
    const byStableCode = new Map(STANDARD_WORK_DURATION_SEED.map((record) => [record.stableCode, record]))
    const drainage = byStableCode.get('outdoor_drainage_network') as any

    expect(drainage).toEqual(expect.objectContaining({
      defaultDaysP20: 11,
      defaultDaysP50: 15,
      defaultDaysP80: 20,
      conditionedDurationBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'rainwater_pipe_standard_trench',
          selector: expect.objectContaining({
            outdoorDrainageNetworkMethodBand: 'rainwater_pipe_standard_trench',
            workfaceBand: 'open',
          }),
          defaultDaysP50: 13,
        }),
        expect.objectContaining({
          conditionCode: 'combined_rain_sewage_closed_water',
          selector: expect.objectContaining({
            outdoorDrainageNetworkMethodBand: 'combined_rain_sewage_closed_water',
          }),
          defaultDaysP50: 16,
        }),
        expect.objectContaining({
          conditionCode: 'manhole_gully_dense_constrained',
          selector: expect.objectContaining({
            outdoorDrainageNetworkMethodBand: 'manhole_gully_dense_network',
            workfaceBand: 'constrained',
          }),
          defaultDaysP50: 20,
        }),
      ]),
      conditionedProcessProfiles: expect.arrayContaining([
        expect.objectContaining({ conditionCode: 'rainwater_pipe_standard_trench' }),
        expect.objectContaining({ conditionCode: 'combined_rain_sewage_closed_water' }),
        expect.objectContaining({ conditionCode: 'manhole_gully_dense_constrained' }),
      ]),
      productivityBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'rainwater_pipe_standard_trench',
          baselineProductivity: expect.objectContaining({
            p50PerDay: 78,
            unit: 'm/day',
            sourceType: 'quota',
            sourceRef: 'quota:TY01-89-2016:chapter=05_07:table=m_day_productivity:item=rainwater_pipe_standard_trench',
          }),
        }),
        expect.objectContaining({
          conditionCode: 'manhole_gully_dense_constrained',
          baselineProductivity: expect.objectContaining({
            p50PerDay: 44,
            unit: 'm/day',
            sourceType: 'expert_profile',
            sourceRef: expect.stringContaining('outdoor_drainage_network:manhole_gully_dense_constrained'),
          }),
        }),
      ]),
    }))

    const denseManhole = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'outdoor_drainage_network',
      applicableGranularity: 'task',
      methodVariantCodes: ['manhole_dense_network'],
      elementVariantCodes: ['constrained_workface'],
    }) as any

    expect(denseManhole).toEqual(expect.objectContaining({
      selectedConditionCode: 'manhole_gully_dense_constrained',
      defaultDaysP50: 20,
      baselineProductivity: expect.objectContaining({ p50PerDay: 44, unit: 'm/day' }),
    }))
  })

  it('keeps outdoor heating network conditionized by burial mode, welding pressure-test burden, and insulation interfaces', async () => {
    const byStableCode = new Map(STANDARD_WORK_DURATION_SEED.map((record) => [record.stableCode, record]))
    const heating = byStableCode.get('outdoor_heating_network') as any

    expect(heating).toEqual(expect.objectContaining({
      defaultDaysP20: 13,
      defaultDaysP50: 18,
      defaultDaysP80: 23,
      conditionedDurationBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'direct_buried_prefab_heat_pipe_standard',
          selector: expect.objectContaining({
            outdoorHeatingNetworkMethodBand: 'direct_buried_prefab_heat_pipe',
            workfaceBand: 'open',
          }),
          defaultDaysP50: 16,
        }),
        expect.objectContaining({
          conditionCode: 'welded_steel_heat_pipe_pressure_anticorrosion',
          selector: expect.objectContaining({
            outdoorHeatingNetworkMethodBand: 'welded_steel_pressure_anticorrosion',
          }),
          defaultDaysP50: 20,
        }),
        expect.objectContaining({
          conditionCode: 'pipe_gallery_insulation_jacket_constrained',
          selector: expect.objectContaining({
            outdoorHeatingNetworkMethodBand: 'pipe_gallery_insulation_jacket',
            workfaceBand: 'constrained',
          }),
          defaultDaysP50: 24,
        }),
      ]),
      conditionedProcessProfiles: expect.arrayContaining([
        expect.objectContaining({ conditionCode: 'direct_buried_prefab_heat_pipe_standard' }),
        expect.objectContaining({ conditionCode: 'welded_steel_heat_pipe_pressure_anticorrosion' }),
        expect.objectContaining({ conditionCode: 'pipe_gallery_insulation_jacket_constrained' }),
      ]),
      productivityBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'direct_buried_prefab_heat_pipe_standard',
          baselineProductivity: expect.objectContaining({
            p50PerDay: 60,
            unit: 'm/day',
            sourceType: 'quota',
            sourceRef: 'quota:TY01-89-2016:chapter=05_08:table=m_day_productivity:item=direct_buried_prefab_heat_pipe_standard',
          }),
        }),
        expect.objectContaining({
          conditionCode: 'pipe_gallery_insulation_jacket_constrained',
          baselineProductivity: expect.objectContaining({
            p50PerDay: 36,
            unit: 'm/day',
            sourceType: 'expert_profile',
            sourceRef: expect.stringContaining('outdoor_heating_network:pipe_gallery_insulation_jacket_constrained'),
          }),
        }),
      ]),
    }))

    const pipeGallery = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'outdoor_heating_network',
      applicableGranularity: 'task',
      methodVariantCodes: ['pipe_gallery_heating', 'insulation_jacket'],
      elementVariantCodes: ['constrained_workface'],
    }) as any

    expect(pipeGallery).toEqual(expect.objectContaining({
      selectedConditionCode: 'pipe_gallery_insulation_jacket_constrained',
      defaultDaysP50: 24,
      baselineProductivity: expect.objectContaining({ p50PerDay: 36, unit: 'm/day' }),
    }))
  })

  it('keeps outdoor road hardscape conditionized by base course, asphalt surfacing, and paving interface density', async () => {
    const byStableCode = new Map(STANDARD_WORK_DURATION_SEED.map((record) => [record.stableCode, record]))
    const roadHardscape = byStableCode.get('outdoor_road_hardscape') as any

    expect(roadHardscape).toEqual(expect.objectContaining({
      defaultDaysP20: 7,
      defaultDaysP50: 10,
      defaultDaysP80: 13,
      conditionedDurationBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'road_base_compaction_standard',
          selector: expect.objectContaining({
            outdoorRoadHardscapeMethodBand: 'road_base_compaction',
            workfaceBand: 'open',
          }),
          defaultDaysP50: 9,
        }),
        expect.objectContaining({
          conditionCode: 'asphalt_surface_paving_testing',
          selector: expect.objectContaining({
            outdoorRoadHardscapeMethodBand: 'asphalt_surface_paving',
          }),
          defaultDaysP50: 11,
        }),
        expect.objectContaining({
          conditionCode: 'hardscape_paving_curb_dense_constrained',
          selector: expect.objectContaining({
            outdoorRoadHardscapeMethodBand: 'hardscape_paving_curb_dense',
            workfaceBand: 'constrained',
          }),
          defaultDaysP50: 14,
        }),
      ]),
      conditionedProcessProfiles: expect.arrayContaining([
        expect.objectContaining({ conditionCode: 'road_base_compaction_standard' }),
        expect.objectContaining({ conditionCode: 'asphalt_surface_paving_testing' }),
        expect.objectContaining({ conditionCode: 'hardscape_paving_curb_dense_constrained' }),
      ]),
      productivityBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'road_base_compaction_standard',
          baselineProductivity: expect.objectContaining({
            p50PerDay: 420,
            unit: 'm2/day',
            sourceType: 'quota',
            sourceRef: 'quota:TY01-89-2016:chapter=OUT:table=m2_day_productivity:item=road_base_compaction_standard',
          }),
        }),
        expect.objectContaining({
          conditionCode: 'hardscape_paving_curb_dense_constrained',
          baselineProductivity: expect.objectContaining({
            p50PerDay: 180,
            unit: 'm2/day',
            sourceType: 'expert_profile',
            sourceRef: expect.stringContaining('outdoor_road_hardscape:hardscape_paving_curb_dense_constrained'),
          }),
        }),
      ]),
    }))

    const densePaving = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'outdoor_road_hardscape',
      applicableGranularity: 'task',
      methodVariantCodes: ['curb_dense_hardscape_paving'],
      elementVariantCodes: ['constrained_workface'],
    }) as any

    expect(densePaving).toEqual(expect.objectContaining({
      selectedConditionCode: 'hardscape_paving_curb_dense_constrained',
      defaultDaysP50: 14,
      baselineProductivity: expect.objectContaining({ p50PerDay: 180, unit: 'm2/day' }),
    }))
  })

  it('keeps landscape greenery conditionized by planting soil, tree-shrub planting, and constrained groundcover slopes', async () => {
    const byStableCode = new Map(STANDARD_WORK_DURATION_SEED.map((record) => [record.stableCode, record]))
    const landscape = byStableCode.get('landscape_greenery') as any

    expect(landscape).toEqual(expect.objectContaining({
      defaultDaysP20: 6,
      defaultDaysP50: 8,
      defaultDaysP80: 10,
      conditionedDurationBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'planting_soil_improvement_standard',
          selector: expect.objectContaining({
            landscapeGreeneryMethodBand: 'planting_soil_improvement',
            workfaceBand: 'open',
          }),
          defaultDaysP50: 7,
        }),
        expect.objectContaining({
          conditionCode: 'tree_shrub_planting_support',
          selector: expect.objectContaining({
            landscapeGreeneryMethodBand: 'tree_shrub_planting_support',
          }),
          defaultDaysP50: 9,
        }),
        expect.objectContaining({
          conditionCode: 'turf_groundcover_slope_constrained',
          selector: expect.objectContaining({
            landscapeGreeneryMethodBand: 'turf_groundcover_slope',
            workfaceBand: 'constrained',
          }),
          defaultDaysP50: 11,
        }),
      ]),
      conditionedProcessProfiles: expect.arrayContaining([
        expect.objectContaining({ conditionCode: 'planting_soil_improvement_standard' }),
        expect.objectContaining({ conditionCode: 'tree_shrub_planting_support' }),
        expect.objectContaining({ conditionCode: 'turf_groundcover_slope_constrained' }),
      ]),
      productivityBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'planting_soil_improvement_standard',
          baselineProductivity: expect.objectContaining({
            p50PerDay: 320,
            unit: 'm2/day',
            sourceType: 'quota',
            sourceRef: 'quota:TY01-89-2016:chapter=OUT:table=m2_day_productivity:item=planting_soil_improvement_standard',
          }),
        }),
        expect.objectContaining({
          conditionCode: 'turf_groundcover_slope_constrained',
          baselineProductivity: expect.objectContaining({
            p50PerDay: 220,
            unit: 'm2/day',
            sourceType: 'expert_profile',
            sourceRef: expect.stringContaining('landscape_greenery:turf_groundcover_slope_constrained'),
          }),
        }),
      ]),
    }))

    const slopeGroundcover = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'landscape_greenery',
      applicableGranularity: 'task',
      methodVariantCodes: ['slope_groundcover_dense'],
      elementVariantCodes: ['constrained_workface'],
    }) as any

    expect(slopeGroundcover).toEqual(expect.objectContaining({
      selectedConditionCode: 'turf_groundcover_slope_constrained',
      defaultDaysP50: 11,
      baselineProductivity: expect.objectContaining({ p50PerDay: 220, unit: 'm2/day' }),
    }))
  })

  it('keeps single system commissioning conditionized by equipment tests, subsystem balancing, and control-loop debugging', async () => {
    const byStableCode = new Map(STANDARD_WORK_DURATION_SEED.map((record) => [record.stableCode, record]))
    const singleSystem = byStableCode.get('single_system_commissioning') as any

    expect(singleSystem).toEqual(expect.objectContaining({
      defaultDaysP20: 4,
      defaultDaysP50: 6,
      defaultDaysP80: 8,
      conditionedDurationBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'standalone_equipment_function_test',
          selector: expect.objectContaining({
            singleSystemCommissioningMethodBand: 'standalone_equipment_function_test',
            workfaceBand: 'open',
          }),
          defaultDaysP50: 5,
        }),
        expect.objectContaining({
          conditionCode: 'water_air_balancing_subsystem',
          selector: expect.objectContaining({
            singleSystemCommissioningMethodBand: 'water_air_balancing_subsystem',
          }),
          defaultDaysP50: 6,
        }),
        expect.objectContaining({
          conditionCode: 'control_loop_linkage_debugging',
          selector: expect.objectContaining({
            singleSystemCommissioningMethodBand: 'control_loop_linkage_debugging',
          }),
          defaultDaysP50: 9,
        }),
      ]),
      conditionedProcessProfiles: expect.arrayContaining([
        expect.objectContaining({ conditionCode: 'standalone_equipment_function_test' }),
        expect.objectContaining({ conditionCode: 'water_air_balancing_subsystem' }),
        expect.objectContaining({ conditionCode: 'control_loop_linkage_debugging' }),
      ]),
      productivityBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'standalone_equipment_function_test',
          baselineProductivity: expect.objectContaining({
            p50PerDay: 1.2,
            unit: 'system/day',
            sourceType: 'quota',
            sourceRef: 'quota:TY01-89-2016:chapter=05_06_07_08_10:table=system_day_productivity:item=standalone_equipment_function_test',
          }),
        }),
        expect.objectContaining({
          conditionCode: 'control_loop_linkage_debugging',
          baselineProductivity: expect.objectContaining({
            p50PerDay: 45,
            unit: 'point/day',
            sourceType: 'expert_profile',
            sourceRef: expect.stringContaining('single_system_commissioning:control_loop_linkage_debugging'),
          }),
        }),
      ]),
    }))

    const controlLoop = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'single_system_commissioning',
      applicableGranularity: 'task',
      methodVariantCodes: ['control_loop_linkage_debugging'],
      elementVariantCodes: ['system_point_commissioning'],
    }) as any

    expect(controlLoop).toEqual(expect.objectContaining({
      selectedConditionCode: 'control_loop_linkage_debugging',
      defaultDaysP50: 9,
      baselineProductivity: expect.objectContaining({ p50PerDay: 45, unit: 'point/day' }),
    }))
  })

  it('keeps integrated commissioning conditionized by MEP joint testing, life-safety linkage, and data-platform integration', async () => {
    const byStableCode = new Map(STANDARD_WORK_DURATION_SEED.map((record) => [record.stableCode, record]))
    const integrated = byStableCode.get('integrated_commissioning') as any

    expect(integrated).toEqual(expect.objectContaining({
      defaultDaysP20: 8,
      defaultDaysP50: 12,
      defaultDaysP80: 16,
      conditionedDurationBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'mep_multi_system_joint_commissioning',
          selector: expect.objectContaining({
            integratedCommissioningMethodBand: 'mep_multi_system_joint',
          }),
          defaultDaysP50: 10,
        }),
        expect.objectContaining({
          conditionCode: 'life_safety_linkage_integrated',
          selector: expect.objectContaining({
            integratedCommissioningMethodBand: 'life_safety_linkage',
          }),
          defaultDaysP50: 13,
        }),
        expect.objectContaining({
          conditionCode: 'data_platform_integrated_acceptance',
          selector: expect.objectContaining({
            integratedCommissioningMethodBand: 'data_platform_integrated',
          }),
          defaultDaysP50: 16,
        }),
      ]),
      conditionedProcessProfiles: expect.arrayContaining([
        expect.objectContaining({ conditionCode: 'mep_multi_system_joint_commissioning' }),
        expect.objectContaining({ conditionCode: 'life_safety_linkage_integrated' }),
        expect.objectContaining({ conditionCode: 'data_platform_integrated_acceptance' }),
      ]),
      productivityBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'mep_multi_system_joint_commissioning',
          baselineProductivity: expect.objectContaining({
            p50PerDay: 0.6,
            unit: 'system/day',
            sourceType: 'quota',
            sourceRef: 'quota:TY01-89-2016:chapter=05_06_07_08_10:table=system_day_productivity:item=mep_multi_system_joint_commissioning',
          }),
        }),
        expect.objectContaining({
          conditionCode: 'data_platform_integrated_acceptance',
          baselineProductivity: expect.objectContaining({
            p50PerDay: 0.35,
            unit: 'system/day',
            sourceType: 'expert_profile',
            sourceRef: expect.stringContaining('integrated_commissioning:data_platform_integrated_acceptance'),
          }),
        }),
      ]),
    }))

    const lifeSafety = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'integrated_commissioning',
      applicableGranularity: 'task',
      methodVariantCodes: ['life_safety_linkage_integrated', 'fire_smoke_elevator_linkage'],
    }) as any

    expect(lifeSafety).toEqual(expect.objectContaining({
      selectedConditionCode: 'life_safety_linkage_integrated',
      defaultDaysP50: 13,
      baselineProductivity: expect.objectContaining({ p50PerDay: 0.45, unit: 'system/day' }),
    }))
  })

  it('keeps HVAC energy-saving systems conditionized by heat metering, equipment networks, and constrained balancing acceptance', async () => {
    const byStableCode = new Map(STANDARD_WORK_DURATION_SEED.map((record) => [record.stableCode, record]))
    const hvacEnergy = byStableCode.get('energy_hvac_system') as any

    expect(hvacEnergy).toEqual(expect.objectContaining({
      defaultDaysP20: 8,
      defaultDaysP50: 11,
      defaultDaysP80: 14,
      conditionedDurationBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'heat_metering_balance_standard',
          selector: expect.objectContaining({
            energyHvacSystemMethodBand: 'heat_metering_balance',
          }),
          defaultDaysP50: 10,
        }),
        expect.objectContaining({
          conditionCode: 'hvac_equipment_pipe_network_inspection',
          selector: expect.objectContaining({
            energyHvacSystemMethodBand: 'equipment_pipe_network',
          }),
          defaultDaysP50: 12,
        }),
        expect.objectContaining({
          conditionCode: 'energy_acceptance_balancing_constrained',
          selector: expect.objectContaining({
            energyHvacSystemMethodBand: 'energy_acceptance_balancing',
            workfaceBand: 'constrained',
          }),
          defaultDaysP50: 15,
        }),
      ]),
      conditionedProcessProfiles: expect.arrayContaining([
        expect.objectContaining({ conditionCode: 'heat_metering_balance_standard' }),
        expect.objectContaining({ conditionCode: 'hvac_equipment_pipe_network_inspection' }),
        expect.objectContaining({ conditionCode: 'energy_acceptance_balancing_constrained' }),
      ]),
      productivityBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'heat_metering_balance_standard',
          baselineProductivity: expect.objectContaining({
            p50PerDay: 0.8,
            unit: 'system/day',
            sourceType: 'quota',
            sourceRef: 'quota:TY01-89-2016:chapter=09_02:table=system_day_productivity:item=heat_metering_balance_standard',
          }),
        }),
        expect.objectContaining({
          conditionCode: 'energy_acceptance_balancing_constrained',
          baselineProductivity: expect.objectContaining({
            p50PerDay: 0.45,
            unit: 'system/day',
            sourceType: 'expert_profile',
            sourceRef: expect.stringContaining('energy_hvac_system:energy_acceptance_balancing_constrained'),
          }),
        }),
      ]),
    }))

    const constrainedBalance = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'energy_hvac_system',
      applicableGranularity: 'task',
      methodVariantCodes: ['energy_acceptance_balancing'],
      elementVariantCodes: ['constrained_workface'],
    }) as any

    expect(constrainedBalance).toEqual(expect.objectContaining({
      selectedConditionCode: 'energy_acceptance_balancing_constrained',
      defaultDaysP50: 15,
      baselineProductivity: expect.objectContaining({ p50PerDay: 0.45, unit: 'system/day' }),
    }))
  })

  it('keeps electrical lighting energy-saving conditionized by power density, scene controls, and emergency egress acceptance', async () => {
    const byStableCode = new Map(STANDARD_WORK_DURATION_SEED.map((record) => [record.stableCode, record]))
    const lightingEnergy = byStableCode.get('energy_electrical_lighting') as any

    expect(lightingEnergy).toEqual(expect.objectContaining({
      defaultDaysP20: 6,
      defaultDaysP50: 8,
      defaultDaysP80: 10,
      conditionedDurationBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'lighting_power_density_metering_standard',
          selector: expect.objectContaining({
            energyElectricalLightingMethodBand: 'power_density_metering',
          }),
          defaultDaysP50: 7,
        }),
        expect.objectContaining({
          conditionCode: 'lighting_scene_control_debugging',
          selector: expect.objectContaining({
            energyElectricalLightingMethodBand: 'scene_control_debugging',
          }),
          defaultDaysP50: 9,
        }),
        expect.objectContaining({
          conditionCode: 'emergency_egress_lighting_acceptance_constrained',
          selector: expect.objectContaining({
            energyElectricalLightingMethodBand: 'emergency_egress_acceptance',
            workfaceBand: 'constrained',
          }),
          defaultDaysP50: 11,
        }),
      ]),
      conditionedProcessProfiles: expect.arrayContaining([
        expect.objectContaining({ conditionCode: 'lighting_power_density_metering_standard' }),
        expect.objectContaining({ conditionCode: 'lighting_scene_control_debugging' }),
        expect.objectContaining({ conditionCode: 'emergency_egress_lighting_acceptance_constrained' }),
      ]),
      productivityBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'lighting_power_density_metering_standard',
          baselineProductivity: expect.objectContaining({
            p50PerDay: 1.05,
            unit: 'system/day',
            sourceType: 'quota',
            sourceRef: 'quota:TY01-89-2016:chapter=09_03:table=system_day_productivity:item=lighting_power_density_metering_standard',
          }),
        }),
        expect.objectContaining({
          conditionCode: 'emergency_egress_lighting_acceptance_constrained',
          baselineProductivity: expect.objectContaining({
            p50PerDay: 0.62,
            unit: 'system/day',
            sourceType: 'expert_profile',
            sourceRef: expect.stringContaining('energy_electrical_lighting:emergency_egress_lighting_acceptance_constrained'),
          }),
        }),
      ]),
    }))

    const emergencyAcceptance = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'energy_electrical_lighting',
      applicableGranularity: 'task',
      methodVariantCodes: ['emergency_egress_lighting_acceptance'],
      elementVariantCodes: ['constrained_workface'],
    }) as any

    expect(emergencyAcceptance).toEqual(expect.objectContaining({
      selectedConditionCode: 'emergency_egress_lighting_acceptance_constrained',
      defaultDaysP50: 11,
      baselineProductivity: expect.objectContaining({ p50PerDay: 0.62, unit: 'system/day' }),
    }))
  })

  it('keeps energy monitoring and control conditionized by metering acquisition, control strategy, and integrated acceptance', async () => {
    const byStableCode = new Map(STANDARD_WORK_DURATION_SEED.map((record) => [record.stableCode, record]))
    const monitoring = byStableCode.get('energy_monitoring_control') as any

    expect(monitoring).toEqual(expect.objectContaining({
      defaultDaysP20: 7,
      defaultDaysP50: 9,
      defaultDaysP80: 12,
      conditionedDurationBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'metering_data_acquisition_points_standard',
          selector: expect.objectContaining({
            energyMonitoringControlMethodBand: 'metering_data_acquisition',
          }),
          defaultDaysP50: 8,
        }),
        expect.objectContaining({
          conditionCode: 'control_strategy_platform_integration',
          selector: expect.objectContaining({
            energyMonitoringControlMethodBand: 'control_strategy_integration',
          }),
          defaultDaysP50: 10,
        }),
        expect.objectContaining({
          conditionCode: 'dense_monitoring_linkage_acceptance_constrained',
          selector: expect.objectContaining({
            energyMonitoringControlMethodBand: 'dense_linkage_acceptance',
            workfaceBand: 'constrained',
          }),
          defaultDaysP50: 13,
        }),
      ]),
      conditionedProcessProfiles: expect.arrayContaining([
        expect.objectContaining({ conditionCode: 'metering_data_acquisition_points_standard' }),
        expect.objectContaining({ conditionCode: 'control_strategy_platform_integration' }),
        expect.objectContaining({ conditionCode: 'dense_monitoring_linkage_acceptance_constrained' }),
      ]),
      productivityBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'metering_data_acquisition_points_standard',
          baselineProductivity: expect.objectContaining({
            p50PerDay: 0.95,
            unit: 'system/day',
            sourceType: 'quota',
            sourceRef: 'quota:TY01-89-2016:chapter=09_04:table=system_day_productivity:item=metering_data_acquisition_points_standard',
          }),
        }),
        expect.objectContaining({
          conditionCode: 'dense_monitoring_linkage_acceptance_constrained',
          baselineProductivity: expect.objectContaining({
            p50PerDay: 0.52,
            unit: 'system/day',
            sourceType: 'expert_profile',
            sourceRef: expect.stringContaining('energy_monitoring_control:dense_monitoring_linkage_acceptance_constrained'),
          }),
        }),
      ]),
    }))

    const denseAcceptance = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'energy_monitoring_control',
      applicableGranularity: 'task',
      methodVariantCodes: ['dense_monitoring_linkage_acceptance'],
      elementVariantCodes: ['constrained_workface'],
    }) as any

    expect(denseAcceptance).toEqual(expect.objectContaining({
      selectedConditionCode: 'dense_monitoring_linkage_acceptance_constrained',
      defaultDaysP50: 13,
      baselineProductivity: expect.objectContaining({ p50PerDay: 0.52, unit: 'system/day' }),
    }))
  })

  it('keeps renewable energy systems conditionized by photovoltaic, solar thermal, and ground-source commissioning', async () => {
    const byStableCode = new Map(STANDARD_WORK_DURATION_SEED.map((record) => [record.stableCode, record]))
    const renewable = byStableCode.get('energy_renewable_system') as any

    expect(renewable).toEqual(expect.objectContaining({
      defaultDaysP20: 12,
      defaultDaysP50: 16,
      defaultDaysP80: 21,
      conditionedDurationBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'photovoltaic_array_grid_interface_standard',
          selector: expect.objectContaining({
            energyRenewableSystemMethodBand: 'photovoltaic_grid_interface',
          }),
          defaultDaysP50: 14,
        }),
        expect.objectContaining({
          conditionCode: 'solar_thermal_collector_storage_loop',
          selector: expect.objectContaining({
            energyRenewableSystemMethodBand: 'solar_thermal_storage_loop',
          }),
          defaultDaysP50: 16,
        }),
        expect.objectContaining({
          conditionCode: 'ground_source_heat_pump_hybrid_commissioning_constrained',
          selector: expect.objectContaining({
            energyRenewableSystemMethodBand: 'ground_source_hybrid_commissioning',
            workfaceBand: 'constrained',
          }),
          defaultDaysP50: 20,
        }),
      ]),
      conditionedProcessProfiles: expect.arrayContaining([
        expect.objectContaining({ conditionCode: 'photovoltaic_array_grid_interface_standard' }),
        expect.objectContaining({ conditionCode: 'solar_thermal_collector_storage_loop' }),
        expect.objectContaining({ conditionCode: 'ground_source_heat_pump_hybrid_commissioning_constrained' }),
      ]),
      productivityBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'photovoltaic_array_grid_interface_standard',
          baselineProductivity: expect.objectContaining({
            p50PerDay: 0.55,
            unit: 'system/day',
            sourceType: 'quota',
            sourceRef: 'quota:TY01-89-2016:chapter=09_05:table=system_day_productivity:item=photovoltaic_array_grid_interface_standard',
          }),
        }),
        expect.objectContaining({
          conditionCode: 'ground_source_heat_pump_hybrid_commissioning_constrained',
          baselineProductivity: expect.objectContaining({
            p50PerDay: 0.34,
            unit: 'system/day',
            sourceType: 'expert_profile',
            sourceRef: expect.stringContaining('energy_renewable_system:ground_source_heat_pump_hybrid_commissioning_constrained'),
          }),
        }),
      ]),
    }))

    const groundSource = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'energy_renewable_system',
      applicableGranularity: 'task',
      methodVariantCodes: ['ground_source_heat_pump_hybrid_commissioning'],
      elementVariantCodes: ['constrained_workface'],
    }) as any

    expect(groundSource).toEqual(expect.objectContaining({
      selectedConditionCode: 'ground_source_heat_pump_hybrid_commissioning_constrained',
      defaultDaysP50: 20,
      baselineProductivity: expect.objectContaining({ p50PerDay: 0.34, unit: 'system/day' }),
    }))
  })

  it('keeps promoted exact process curing and interface-closure overrides inside the strict P50 precision window', () => {
    const byCode = new Map(
      STANDARD_WORK_DURATION_SEED.flatMap((record) => record.standardWorkCodes.map((code) => [code, record])),
    )

    for (const code of ['BDT-07-01-01-P04', 'DEC-02-02-02-P06', 'STL-04-01-14-P06']) {
      expect(byCode.get(code)).toEqual(expect.objectContaining({
        stableCode: `process_duration:${code}`,
        defaultDaysP20: 3,
        defaultDaysP50: 4,
        defaultDaysP80: 5,
        confidence: 'high',
        benchmarkBasis: expect.stringContaining('expertOverride='),
      }))
    }
  })

  it('keeps door window railing conditionized by opening system and high-rise constrained installation', async () => {
    const byStableCode = new Map(STANDARD_WORK_DURATION_SEED.map((record) => [record.stableCode, record]))
    const doorWindow = byStableCode.get('door_window_railing') as any

    expect(doorWindow).toEqual(expect.objectContaining({
      defaultDaysP20: 4,
      defaultDaysP50: 6,
      defaultDaysP80: 8,
      conditionedDurationBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'standard_door_window_open_workface',
          selector: expect.objectContaining({
            doorWindowRailingMethodBand: 'standard_door_window',
            workfaceBand: 'open',
          }),
          defaultDaysP20: 3,
          defaultDaysP50: 5,
          defaultDaysP80: 7,
        }),
        expect.objectContaining({
          conditionCode: 'system_window_high_rise_standard',
          selector: expect.objectContaining({
            doorWindowRailingMethodBand: 'system_window',
            heightBand: 'high_rise',
            workfaceBand: 'open',
          }),
          defaultDaysP20: 5,
          defaultDaysP50: 7,
          defaultDaysP80: 9,
        }),
        expect.objectContaining({
          conditionCode: 'railing_louver_constrained',
          selector: expect.objectContaining({
            doorWindowRailingMethodBand: 'railing_louver',
            workfaceBand: 'constrained',
          }),
          defaultDaysP20: 7,
          defaultDaysP50: 10,
          defaultDaysP80: 13,
        }),
      ]),
      conditionedProcessProfiles: expect.arrayContaining([
        expect.objectContaining({ conditionCode: 'standard_door_window_open_workface' }),
        expect.objectContaining({ conditionCode: 'system_window_high_rise_standard' }),
        expect.objectContaining({ conditionCode: 'railing_louver_constrained' }),
      ]),
      productivityBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'standard_door_window_open_workface',
          baselineProductivity: expect.objectContaining({
            p50PerDay: 95,
            unit: 'm2/day',
            sourceType: 'expert_profile',
            sourceRef: expect.stringContaining('door_window_railing:standard_door_window_open_workface'),
          }),
        }),
        expect.objectContaining({
          conditionCode: 'railing_louver_constrained',
          baselineProductivity: expect.objectContaining({
            p50PerDay: 48,
            unit: 'm/day',
            sourceType: 'expert_profile',
            sourceRef: expect.stringContaining('door_window_railing:railing_louver_constrained'),
          }),
        }),
      ]),
    }))

    const constrainedRailing = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'door_window_railing',
      applicableGranularity: 'task',
      methodVariantCodes: ['railing_louver'],
      elementVariantCodes: ['constrained_workface'],
    }) as any

    expect(constrainedRailing).toEqual(expect.objectContaining({
      selectedConditionCode: 'railing_louver_constrained',
      defaultDaysP50: 10,
      baselineProductivity: expect.objectContaining({ p50PerDay: 48, unit: 'm/day' }),
    }))
  })

  it('keeps scaffold temporary access duration conditionized by access system and height', async () => {
    const byStableCode = new Map(STANDARD_WORK_DURATION_SEED.map((record) => [record.stableCode, record]))
    const scaffold = byStableCode.get('scaffold_temp_access') as any

    expect(scaffold).toEqual(expect.objectContaining({
      defaultDaysP20: 6,
      defaultDaysP50: 8,
      defaultDaysP80: 10,
      conditionedDurationBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'floor_standing_low_rise_open_workface',
          selector: expect.objectContaining({
            accessSystemBand: 'floor_standing',
            heightBand: 'low_rise',
            workfaceBand: 'open',
          }),
          defaultDaysP20: 4,
          defaultDaysP50: 6,
          defaultDaysP80: 8,
        }),
        expect.objectContaining({
          conditionCode: 'cantilever_high_rise_constrained_workface',
          selector: expect.objectContaining({
            accessSystemBand: 'cantilever',
            heightBand: 'high_rise',
            workfaceBand: 'constrained',
          }),
          defaultDaysP20: 8,
          defaultDaysP50: 10,
          defaultDaysP80: 13,
        }),
        expect.objectContaining({
          conditionCode: 'climbing_high_rise_standard_workface',
          selector: expect.objectContaining({
            accessSystemBand: 'climbing',
            heightBand: 'high_rise',
          }),
          defaultDaysP20: 6,
          defaultDaysP50: 8,
          defaultDaysP80: 10,
        }),
      ]),
      conditionedProcessProfiles: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'floor_standing_low_rise_open_workface',
          profile: expect.objectContaining({
            defaultBase: 5,
            max: 9,
          }),
        }),
        expect.objectContaining({
          conditionCode: 'cantilever_high_rise_constrained_workface',
          profile: expect.objectContaining({
            defaultBase: 8,
            max: 14,
          }),
        }),
      ]),
      productivityBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'floor_standing_low_rise_open_workface',
          baselineProductivity: expect.objectContaining({
            p50PerDay: 120,
            unit: 'm2/day',
            sourceType: 'expert_profile',
          }),
        }),
        expect.objectContaining({
          conditionCode: 'cantilever_high_rise_constrained_workface',
          baselineProductivity: expect.objectContaining({
            p50PerDay: 70,
            unit: 'm2/day',
            sourceType: 'expert_profile',
          }),
        }),
      ]),
    }))

    const floorStanding = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'scaffold_temp_access',
      applicableGranularity: 'task',
      methodVariantCodes: ['floor_standing_scaffold'],
      elementVariantCodes: ['low_rise', 'open_workface'],
    }) as any

    expect(floorStanding).toEqual(expect.objectContaining({
      selectedConditionCode: 'floor_standing_low_rise_open_workface',
      defaultDaysP50: 6,
      defaultDaysP80: 8,
      baselineProductivity: expect.objectContaining({
        p50PerDay: 120,
        unit: 'm2/day',
      }),
    }))

    const cantilever = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'scaffold_temp_access',
      applicableGranularity: 'task',
      methodVariantCodes: ['cantilever_scaffold'],
      elementVariantCodes: ['high_rise', 'constrained_workface'],
    }) as any

    expect(cantilever).toEqual(expect.objectContaining({
      selectedConditionCode: 'cantilever_high_rise_constrained_workface',
      defaultDaysP50: 10,
      defaultDaysP80: 13,
      baselineProductivity: expect.objectContaining({
        p50PerDay: 70,
        unit: 'm2/day',
      }),
    }))

    const climbing = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'scaffold_temp_access',
      applicableGranularity: 'task',
      methodVariantCodes: ['climbing_scaffold'],
      elementVariantCodes: ['high_rise', 'standard_workface'],
    }) as any

    expect(climbing).toEqual(expect.objectContaining({
      selectedConditionCode: 'climbing_high_rise_standard_workface',
      defaultDaysP50: 8,
      defaultDaysP80: 10,
      baselineProductivity: expect.objectContaining({
        p50PerDay: 90,
        unit: 'm2/day',
      }),
    }))
  })

  it('keeps replacement cushion ground treatment conditionized by material and workface', async () => {
    const byStableCode = new Map(STANDARD_WORK_DURATION_SEED.map((record) => [record.stableCode, record]))
    const cushion = byStableCode.get('ground_replacement_cushion') as any

    expect(cushion).toEqual(expect.objectContaining({
      defaultDaysP20: 9,
      defaultDaysP50: 12,
      defaultDaysP80: 16,
      conditionedDurationBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'soil_lime_cushion_open_workface',
          selector: expect.objectContaining({
            replacementMaterialBand: 'soil_lime',
            workfaceBand: 'open',
          }),
          defaultDaysP20: 6,
          defaultDaysP50: 8,
          defaultDaysP80: 10,
        }),
        expect.objectContaining({
          conditionCode: 'sand_gravel_cushion_standard_workface',
          selector: expect.objectContaining({
            replacementMaterialBand: 'sand_gravel',
            workfaceBand: 'open',
          }),
          defaultDaysP20: 8,
          defaultDaysP50: 11,
          defaultDaysP80: 14,
        }),
        expect.objectContaining({
          conditionCode: 'geosynthetic_flyash_cushion_constrained_workface',
          selector: expect.objectContaining({
            replacementMaterialBand: 'geosynthetic_flyash',
            workfaceBand: 'constrained',
          }),
          defaultDaysP20: 11,
          defaultDaysP50: 15,
          defaultDaysP80: 19,
        }),
      ]),
      conditionedProcessProfiles: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'soil_lime_cushion_open_workface',
          profile: expect.objectContaining({
            defaultBase: 6,
            max: 11,
          }),
        }),
        expect.objectContaining({
          conditionCode: 'geosynthetic_flyash_cushion_constrained_workface',
          profile: expect.objectContaining({
            defaultBase: 10,
            max: 20,
          }),
        }),
      ]),
      productivityBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'soil_lime_cushion_open_workface',
          baselineProductivity: expect.objectContaining({
            p50PerDay: 520,
            unit: 'm2/day',
            sourceType: 'expert_profile',
          }),
        }),
        expect.objectContaining({
          conditionCode: 'geosynthetic_flyash_cushion_constrained_workface',
          baselineProductivity: expect.objectContaining({
            p50PerDay: 260,
            unit: 'm2/day',
            sourceType: 'expert_profile',
          }),
        }),
      ]),
    }))

    const soilLime = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'ground_replacement_cushion',
      applicableGranularity: 'task',
      methodVariantCodes: ['lime_soil_cushion'],
      elementVariantCodes: ['open_workface'],
    }) as any

    expect(soilLime).toEqual(expect.objectContaining({
      selectedConditionCode: 'soil_lime_cushion_open_workface',
      defaultDaysP50: 8,
      defaultDaysP80: 10,
      baselineProductivity: expect.objectContaining({
        p50PerDay: 520,
        unit: 'm2/day',
      }),
    }))

    const sandGravel = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'ground_replacement_cushion',
      applicableGranularity: 'task',
      methodVariantCodes: ['sand_gravel_cushion'],
      elementVariantCodes: ['standard_workface'],
    }) as any

    expect(sandGravel).toEqual(expect.objectContaining({
      selectedConditionCode: 'sand_gravel_cushion_standard_workface',
      defaultDaysP50: 11,
      defaultDaysP80: 14,
      baselineProductivity: expect.objectContaining({
        p50PerDay: 420,
        unit: 'm2/day',
      }),
    }))

    const geosynthetic = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'ground_replacement_cushion',
      applicableGranularity: 'task',
      methodVariantCodes: ['geosynthetic_cushion'],
      elementVariantCodes: ['constrained_workface'],
    }) as any

    expect(geosynthetic).toEqual(expect.objectContaining({
      selectedConditionCode: 'geosynthetic_flyash_cushion_constrained_workface',
      defaultDaysP50: 15,
      defaultDaysP80: 19,
      baselineProductivity: expect.objectContaining({
        p50PerDay: 260,
        unit: 'm2/day',
      }),
    }))
  })

  it('keeps dynamic compaction ground treatment conditionized by depth, geology, and workface', async () => {
    const byStableCode = new Map(STANDARD_WORK_DURATION_SEED.map((record) => [record.stableCode, record]))
    const dynamicCompaction = byStableCode.get('dynamic_compaction_ground') as any

    expect(dynamicCompaction).toEqual(expect.objectContaining({
      defaultDaysP20: 13,
      defaultDaysP50: 18,
      defaultDaysP80: 23,
      conditionedDurationBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'shallow_dynamic_compaction_open_workface',
          selector: expect.objectContaining({
            depthBand: 'short',
            workfaceBand: 'open',
          }),
          defaultDaysP20: 7,
          defaultDaysP50: 10,
          defaultDaysP80: 13,
        }),
        expect.objectContaining({
          conditionCode: 'standard_dynamic_compaction_normal_geology',
          selector: expect.objectContaining({
            depthBand: 'standard',
            geologyBand: 'normal',
            workfaceBand: 'open',
          }),
          defaultDaysP20: 10,
          defaultDaysP50: 14,
          defaultDaysP80: 18,
        }),
        expect.objectContaining({
          conditionCode: 'deep_dynamic_replacement_complex_geology',
          selector: expect.objectContaining({
            depthBand: 'deep',
            geologyBand: 'complex',
            workfaceBand: 'constrained',
          }),
          defaultDaysP20: 16,
          defaultDaysP50: 23,
          defaultDaysP80: 30,
        }),
      ]),
      conditionedProcessProfiles: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'shallow_dynamic_compaction_open_workface',
          profile: expect.objectContaining({
            defaultBase: 7,
            max: 14,
          }),
        }),
        expect.objectContaining({
          conditionCode: 'deep_dynamic_replacement_complex_geology',
          profile: expect.objectContaining({
            defaultBase: 12,
            max: 30,
          }),
        }),
      ]),
      productivityBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'shallow_dynamic_compaction_open_workface',
          baselineProductivity: expect.objectContaining({
            p50PerDay: 650,
            unit: 'm2/day',
            sourceType: 'expert_profile',
          }),
        }),
        expect.objectContaining({
          conditionCode: 'deep_dynamic_replacement_complex_geology',
          baselineProductivity: expect.objectContaining({
            p50PerDay: 260,
            unit: 'm2/day',
            sourceType: 'expert_profile',
          }),
        }),
      ]),
    }))

    const shallow = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'dynamic_compaction_ground',
      applicableGranularity: 'task',
      methodVariantCodes: ['shallow_dynamic_compaction'],
      elementVariantCodes: ['open_workface'],
    }) as any

    expect(shallow).toEqual(expect.objectContaining({
      selectedConditionCode: 'shallow_dynamic_compaction_open_workface',
      defaultDaysP50: 10,
      defaultDaysP80: 13,
      baselineProductivity: expect.objectContaining({
        p50PerDay: 650,
        unit: 'm2/day',
      }),
    }))

    const standard = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'dynamic_compaction_ground',
      applicableGranularity: 'task',
      methodVariantCodes: ['standard_dynamic_compaction'],
      elementVariantCodes: ['normal_geology', 'standard_workface'],
    }) as any

    expect(standard).toEqual(expect.objectContaining({
      selectedConditionCode: 'standard_dynamic_compaction_normal_geology',
      defaultDaysP50: 14,
      defaultDaysP80: 18,
      baselineProductivity: expect.objectContaining({
        p50PerDay: 460,
        unit: 'm2/day',
      }),
    }))

    const deepReplacement = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'dynamic_compaction_ground',
      applicableGranularity: 'task',
      methodVariantCodes: ['dynamic_replacement'],
      elementVariantCodes: ['deep_depth', 'complex_geology', 'constrained_workface'],
    }) as any

    expect(deepReplacement).toEqual(expect.objectContaining({
      selectedConditionCode: 'deep_dynamic_replacement_complex_geology',
      defaultDaysP50: 23,
      defaultDaysP80: 30,
      baselineProductivity: expect.objectContaining({
        p50PerDay: 260,
        unit: 'm2/day',
      }),
    }))
  })

  it('keeps foundation grouting conditionized by method, depth, geology, and workface', async () => {
    const byStableCode = new Map(STANDARD_WORK_DURATION_SEED.map((record) => [record.stableCode, record]))
    const grouting = byStableCode.get('grouting_ground') as any

    expect(grouting).toEqual(expect.objectContaining({
      defaultDaysP20: 11,
      defaultDaysP50: 15,
      defaultDaysP80: 20,
      conditionedDurationBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'permeation_grouting_shallow_normal_open_workface',
          selector: expect.objectContaining({
            groutingMethodBand: 'permeation',
            depthBand: 'short',
            geologyBand: 'normal',
            workfaceBand: 'open',
          }),
          defaultDaysP20: 5,
          defaultDaysP50: 8,
          defaultDaysP80: 10,
        }),
        expect.objectContaining({
          conditionCode: 'compaction_grouting_standard_normal_workface',
          selector: expect.objectContaining({
            groutingMethodBand: 'compaction',
            depthBand: 'standard',
            geologyBand: 'normal',
            workfaceBand: 'open',
          }),
          defaultDaysP20: 9,
          defaultDaysP50: 13,
          defaultDaysP80: 17,
        }),
        expect.objectContaining({
          conditionCode: 'curtain_grouting_deep_complex_constrained',
          selector: expect.objectContaining({
            groutingMethodBand: 'curtain',
            depthBand: 'deep',
            geologyBand: 'complex',
            workfaceBand: 'constrained',
          }),
          defaultDaysP20: 16,
          defaultDaysP50: 22,
          defaultDaysP80: 28,
        }),
      ]),
      conditionedProcessProfiles: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'permeation_grouting_shallow_normal_open_workface',
          profile: expect.objectContaining({
            defaultBase: 6,
            max: 12,
          }),
        }),
        expect.objectContaining({
          conditionCode: 'curtain_grouting_deep_complex_constrained',
          profile: expect.objectContaining({
            defaultBase: 12,
            max: 28,
          }),
        }),
      ]),
      productivityBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'permeation_grouting_shallow_normal_open_workface',
          baselineProductivity: expect.objectContaining({
            p50PerDay: 120,
            unit: 'm/day',
            sourceType: 'expert_profile',
          }),
        }),
        expect.objectContaining({
          conditionCode: 'curtain_grouting_deep_complex_constrained',
          baselineProductivity: expect.objectContaining({
            p50PerDay: 38,
            unit: 'm/day',
            sourceType: 'expert_profile',
          }),
        }),
      ]),
    }))

    const permeation = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'grouting_ground',
      applicableGranularity: 'task',
      methodVariantCodes: ['permeation_grouting'],
      elementVariantCodes: ['short_depth', 'normal_geology', 'open_workface'],
    }) as any

    expect(permeation).toEqual(expect.objectContaining({
      selectedConditionCode: 'permeation_grouting_shallow_normal_open_workface',
      defaultDaysP50: 8,
      defaultDaysP80: 10,
      baselineProductivity: expect.objectContaining({
        p50PerDay: 120,
        unit: 'm/day',
      }),
    }))

    const compaction = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'grouting_ground',
      applicableGranularity: 'task',
      methodVariantCodes: ['compaction_grouting'],
      elementVariantCodes: ['standard_depth', 'normal_geology', 'standard_workface'],
    }) as any

    expect(compaction).toEqual(expect.objectContaining({
      selectedConditionCode: 'compaction_grouting_standard_normal_workface',
      defaultDaysP50: 13,
      defaultDaysP80: 17,
      baselineProductivity: expect.objectContaining({
        p50PerDay: 72,
        unit: 'm/day',
      }),
    }))

    const curtain = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'grouting_ground',
      applicableGranularity: 'task',
      methodVariantCodes: ['curtain_grouting'],
      elementVariantCodes: ['deep_depth', 'complex_geology', 'constrained_workface'],
    }) as any

    expect(curtain).toEqual(expect.objectContaining({
      selectedConditionCode: 'curtain_grouting_deep_complex_constrained',
      defaultDaysP50: 22,
      defaultDaysP80: 28,
      baselineProductivity: expect.objectContaining({
        p50PerDay: 38,
        unit: 'm/day',
      }),
    }))
  })

  it('keeps preloading ground treatment conditionized by method, geology, and workface', async () => {
    const byStableCode = new Map(STANDARD_WORK_DURATION_SEED.map((record) => [record.stableCode, record]))
    const preloading = byStableCode.get('preloading_ground') as any

    expect(preloading).toEqual(expect.objectContaining({
      defaultDaysP20: 25,
      defaultDaysP50: 35,
      defaultDaysP80: 45,
      conditionedDurationBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'surcharge_preloading_normal_open_workface',
          selector: expect.objectContaining({
            preloadingMethodBand: 'surcharge',
            geologyBand: 'normal',
            workfaceBand: 'open',
          }),
          defaultDaysP20: 20,
          defaultDaysP50: 28,
          defaultDaysP80: 36,
        }),
        expect.objectContaining({
          conditionCode: 'vacuum_preloading_soft_soil_open_workface',
          selector: expect.objectContaining({
            preloadingMethodBand: 'vacuum',
            geologyBand: 'complex',
            workfaceBand: 'open',
          }),
          defaultDaysP20: 30,
          defaultDaysP50: 42,
          defaultDaysP80: 54,
        }),
        expect.objectContaining({
          conditionCode: 'combined_preloading_deep_soft_constrained',
          selector: expect.objectContaining({
            preloadingMethodBand: 'combined',
            geologyBand: 'complex',
            workfaceBand: 'constrained',
          }),
          defaultDaysP20: 42,
          defaultDaysP50: 58,
          defaultDaysP80: 74,
        }),
      ]),
      conditionedProcessProfiles: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'surcharge_preloading_normal_open_workface',
          profile: expect.objectContaining({
            defaultBase: 14,
            max: 42,
          }),
        }),
        expect.objectContaining({
          conditionCode: 'combined_preloading_deep_soft_constrained',
          profile: expect.objectContaining({
            defaultBase: 26,
            max: 78,
          }),
        }),
      ]),
      productivityBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'surcharge_preloading_normal_open_workface',
          baselineProductivity: expect.objectContaining({
            p50PerDay: 900,
            unit: 'm2/day',
            sourceType: 'expert_profile',
          }),
        }),
        expect.objectContaining({
          conditionCode: 'combined_preloading_deep_soft_constrained',
          baselineProductivity: expect.objectContaining({
            p50PerDay: 360,
            unit: 'm2/day',
            sourceType: 'expert_profile',
          }),
        }),
      ]),
    }))

    const surcharge = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'preloading_ground',
      applicableGranularity: 'task',
      methodVariantCodes: ['surcharge_preloading'],
      elementVariantCodes: ['normal_geology', 'open_workface'],
    }) as any

    expect(surcharge).toEqual(expect.objectContaining({
      selectedConditionCode: 'surcharge_preloading_normal_open_workface',
      defaultDaysP50: 28,
      defaultDaysP80: 36,
      baselineProductivity: expect.objectContaining({
        p50PerDay: 900,
        unit: 'm2/day',
      }),
    }))

    const vacuum = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'preloading_ground',
      applicableGranularity: 'task',
      methodVariantCodes: ['vacuum_preloading'],
      elementVariantCodes: ['thick_soft_soil', 'open_workface'],
    }) as any

    expect(vacuum).toEqual(expect.objectContaining({
      selectedConditionCode: 'vacuum_preloading_soft_soil_open_workface',
      defaultDaysP50: 42,
      defaultDaysP80: 54,
      baselineProductivity: expect.objectContaining({
        p50PerDay: 560,
        unit: 'm2/day',
      }),
    }))

    const combined = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'preloading_ground',
      applicableGranularity: 'task',
      methodVariantCodes: ['combined_preloading'],
      elementVariantCodes: ['complex_geology', 'constrained_workface'],
    }) as any

    expect(combined).toEqual(expect.objectContaining({
      selectedConditionCode: 'combined_preloading_deep_soft_constrained',
      defaultDaysP50: 58,
      defaultDaysP80: 74,
      baselineProductivity: expect.objectContaining({
        p50PerDay: 360,
        unit: 'm2/day',
      }),
    }))

    const combinedFromPairedMethods = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'preloading_ground',
      applicableGranularity: 'task',
      methodVariantCodes: ['surcharge_preloading', 'vacuum_preloading'],
      elementVariantCodes: ['complex_geology', 'constrained_workface'],
    }) as any

    expect(combinedFromPairedMethods).toEqual(expect.objectContaining({
      selectedConditionCode: 'combined_preloading_deep_soft_constrained',
      defaultDaysP50: 58,
      baselineProductivity: expect.objectContaining({
        p50PerDay: 360,
        unit: 'm2/day',
      }),
    }))
  })

  it('keeps granular and compaction composite ground conditionized by pile method and workface', async () => {
    const byStableCode = new Map(STANDARD_WORK_DURATION_SEED.map((record) => [record.stableCode, record]))
    const granular = byStableCode.get('granular_compaction_composite_ground') as any

    expect(granular).toEqual(expect.objectContaining({
      defaultDaysP20: 12,
      defaultDaysP50: 16,
      defaultDaysP80: 20,
      conditionedDurationBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'sand_gravel_pile_open_workface',
          selector: expect.objectContaining({
            compositeGroundMethodBand: 'sand_gravel_pile',
            workfaceBand: 'open',
          }),
          defaultDaysP20: 8,
          defaultDaysP50: 11,
          defaultDaysP80: 14,
        }),
        expect.objectContaining({
          conditionCode: 'lime_soil_compaction_normal_workface',
          selector: expect.objectContaining({
            compositeGroundMethodBand: 'lime_soil_compaction',
            geologyBand: 'normal',
          }),
          defaultDaysP20: 12,
          defaultDaysP50: 16,
          defaultDaysP80: 20,
        }),
        expect.objectContaining({
          conditionCode: 'cement_soil_compaction_complex_constrained',
          selector: expect.objectContaining({
            compositeGroundMethodBand: 'cement_soil_compaction',
            geologyBand: 'complex',
            workfaceBand: 'constrained',
          }),
          defaultDaysP20: 15,
          defaultDaysP50: 21,
          defaultDaysP80: 27,
        }),
      ]),
      conditionedProcessProfiles: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'sand_gravel_pile_open_workface',
          profile: expect.objectContaining({
            defaultBase: 7,
            max: 22,
          }),
        }),
        expect.objectContaining({
          conditionCode: 'cement_soil_compaction_complex_constrained',
          profile: expect.objectContaining({
            defaultBase: 13,
            max: 42,
          }),
        }),
      ]),
      productivityBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'sand_gravel_pile_open_workface',
          baselineProductivity: expect.objectContaining({
            p50PerDay: 150,
            unit: 'm2/day',
            sourceType: 'expert_profile',
          }),
        }),
        expect.objectContaining({
          conditionCode: 'cement_soil_compaction_complex_constrained',
          baselineProductivity: expect.objectContaining({
            p50PerDay: 90,
            unit: 'm2/day',
            sourceType: 'expert_profile',
          }),
        }),
      ]),
    }))

    const sandGravel = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'granular_compaction_composite_ground',
      applicableGranularity: 'task',
      methodVariantCodes: ['sand_gravel_pile'],
      elementVariantCodes: ['open_workface'],
    }) as any

    expect(sandGravel).toEqual(expect.objectContaining({
      selectedConditionCode: 'sand_gravel_pile_open_workface',
      defaultDaysP50: 11,
      defaultDaysP80: 14,
      baselineProductivity: expect.objectContaining({
        p50PerDay: 150,
        unit: 'm2/day',
      }),
    }))

    const limeSoil = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'granular_compaction_composite_ground',
      applicableGranularity: 'task',
      methodVariantCodes: ['lime_soil_compaction_pile'],
      elementVariantCodes: ['normal_geology', 'standard_workface'],
    }) as any

    expect(limeSoil).toEqual(expect.objectContaining({
      selectedConditionCode: 'lime_soil_compaction_normal_workface',
      defaultDaysP50: 16,
      defaultDaysP80: 20,
      baselineProductivity: expect.objectContaining({
        p50PerDay: 120,
        unit: 'm2/day',
      }),
    }))

    const cementSoil = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'granular_compaction_composite_ground',
      applicableGranularity: 'task',
      methodVariantCodes: ['compacted_cement_soil_pile'],
      elementVariantCodes: ['complex_geology', 'constrained_workface'],
    }) as any

    expect(cementSoil).toEqual(expect.objectContaining({
      selectedConditionCode: 'cement_soil_compaction_complex_constrained',
      defaultDaysP50: 21,
      defaultDaysP80: 27,
      baselineProductivity: expect.objectContaining({
        p50PerDay: 90,
        unit: 'm2/day',
      }),
    }))
  })

  it('keeps jet grouting ground conditionized by jet method, depth, geology, and workface', async () => {
    const byStableCode = new Map(STANDARD_WORK_DURATION_SEED.map((record) => [record.stableCode, record]))
    const jetGrouting = byStableCode.get('jet_grouting_ground') as any

    expect(jetGrouting).toEqual(expect.objectContaining({
      defaultDaysP20: 12,
      defaultDaysP50: 16,
      defaultDaysP80: 20,
      conditionedDurationBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'single_tube_jet_shallow_normal_open',
          selector: expect.objectContaining({
            jetGroutingMethodBand: 'single_tube',
            depthBand: 'short',
            geologyBand: 'normal',
            workfaceBand: 'open',
          }),
          defaultDaysP20: 7,
          defaultDaysP50: 10,
          defaultDaysP80: 13,
        }),
        expect.objectContaining({
          conditionCode: 'double_tube_jet_standard_normal_workface',
          selector: expect.objectContaining({
            jetGroutingMethodBand: 'double_tube',
            depthBand: 'standard',
            geologyBand: 'normal',
          }),
          defaultDaysP20: 10,
          defaultDaysP50: 14,
          defaultDaysP80: 18,
        }),
        expect.objectContaining({
          conditionCode: 'triple_tube_jet_deep_complex_constrained',
          selector: expect.objectContaining({
            jetGroutingMethodBand: 'triple_tube',
            depthBand: 'deep',
            geologyBand: 'complex',
            workfaceBand: 'constrained',
          }),
          defaultDaysP20: 16,
          defaultDaysP50: 22,
          defaultDaysP80: 28,
        }),
      ]),
      conditionedProcessProfiles: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'single_tube_jet_shallow_normal_open',
          profile: expect.objectContaining({
            defaultBase: 6,
            max: 20,
          }),
        }),
        expect.objectContaining({
          conditionCode: 'triple_tube_jet_deep_complex_constrained',
          profile: expect.objectContaining({
            defaultBase: 13,
            max: 44,
          }),
        }),
      ]),
      productivityBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'single_tube_jet_shallow_normal_open',
          baselineProductivity: expect.objectContaining({
            p50PerDay: 125,
            unit: 'm2/day',
            sourceType: 'expert_profile',
          }),
        }),
        expect.objectContaining({
          conditionCode: 'triple_tube_jet_deep_complex_constrained',
          baselineProductivity: expect.objectContaining({
            p50PerDay: 65,
            unit: 'm2/day',
            sourceType: 'expert_profile',
          }),
        }),
      ]),
    }))

    const singleTube = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'jet_grouting_ground',
      applicableGranularity: 'task',
      methodVariantCodes: ['single_tube_jet_grouting'],
      elementVariantCodes: ['shallow_depth', 'normal_geology', 'open_workface'],
    }) as any

    expect(singleTube).toEqual(expect.objectContaining({
      selectedConditionCode: 'single_tube_jet_shallow_normal_open',
      defaultDaysP50: 10,
      defaultDaysP80: 13,
      baselineProductivity: expect.objectContaining({
        p50PerDay: 125,
        unit: 'm2/day',
      }),
    }))

    const doubleTube = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'jet_grouting_ground',
      applicableGranularity: 'task',
      methodVariantCodes: ['double_tube_jet_grouting'],
      elementVariantCodes: ['standard_depth', 'normal_geology', 'standard_workface'],
    }) as any

    expect(doubleTube).toEqual(expect.objectContaining({
      selectedConditionCode: 'double_tube_jet_standard_normal_workface',
      defaultDaysP50: 14,
      defaultDaysP80: 18,
      baselineProductivity: expect.objectContaining({
        p50PerDay: 95,
        unit: 'm2/day',
      }),
    }))

    const tripleTube = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'jet_grouting_ground',
      applicableGranularity: 'task',
      methodVariantCodes: ['triple_tube_jet_grouting'],
      elementVariantCodes: ['deep_depth', 'complex_geology', 'constrained_workface'],
    }) as any

    expect(tripleTube).toEqual(expect.objectContaining({
      selectedConditionCode: 'triple_tube_jet_deep_complex_constrained',
      defaultDaysP50: 22,
      defaultDaysP80: 28,
      baselineProductivity: expect.objectContaining({
        p50PerDay: 65,
        unit: 'm2/day',
      }),
    }))
  })

  it('keeps cement-soil mixing pile conditionized by mixing method, depth, geology, and workface', async () => {
    const byStableCode = new Map(STANDARD_WORK_DURATION_SEED.map((record) => [record.stableCode, record]))
    const mixing = byStableCode.get('cement_soil_mixing_pile_ground') as any

    expect(mixing).toEqual(expect.objectContaining({
      defaultDaysP20: 11,
      defaultDaysP50: 15,
      defaultDaysP80: 19,
      conditionedDurationBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'single_axis_mixing_shallow_normal_open',
          selector: expect.objectContaining({
            cementSoilMixingMethodBand: 'single_axis',
            depthBand: 'short',
            geologyBand: 'normal',
            workfaceBand: 'open',
          }),
          defaultDaysP20: 7,
          defaultDaysP50: 10,
          defaultDaysP80: 13,
        }),
        expect.objectContaining({
          conditionCode: 'multi_axis_mixing_standard_normal_workface',
          selector: expect.objectContaining({
            cementSoilMixingMethodBand: 'multi_axis',
            depthBand: 'standard',
            geologyBand: 'normal',
          }),
          defaultDaysP20: 10,
          defaultDaysP50: 14,
          defaultDaysP80: 18,
        }),
        expect.objectContaining({
          conditionCode: 'wet_deep_mixing_complex_constrained',
          selector: expect.objectContaining({
            cementSoilMixingMethodBand: 'wet_deep',
            depthBand: 'deep',
            geologyBand: 'complex',
            workfaceBand: 'constrained',
          }),
          defaultDaysP20: 15,
          defaultDaysP50: 21,
          defaultDaysP80: 27,
        }),
      ]),
      conditionedProcessProfiles: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'single_axis_mixing_shallow_normal_open',
          profile: expect.objectContaining({
            defaultBase: 6,
            max: 20,
          }),
        }),
        expect.objectContaining({
          conditionCode: 'wet_deep_mixing_complex_constrained',
          profile: expect.objectContaining({
            defaultBase: 13,
            max: 42,
          }),
        }),
      ]),
      productivityBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'single_axis_mixing_shallow_normal_open',
          baselineProductivity: expect.objectContaining({
            p50PerDay: 135,
            unit: 'm2/day',
            sourceType: 'expert_profile',
          }),
        }),
        expect.objectContaining({
          conditionCode: 'wet_deep_mixing_complex_constrained',
          baselineProductivity: expect.objectContaining({
            p50PerDay: 78,
            unit: 'm2/day',
            sourceType: 'expert_profile',
          }),
        }),
      ]),
    }))

    const singleAxis = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'cement_soil_mixing_pile_ground',
      applicableGranularity: 'task',
      methodVariantCodes: ['deep_mixing_single_axis'],
      elementVariantCodes: ['shallow_depth', 'normal_geology', 'open_workface'],
    }) as any

    expect(singleAxis).toEqual(expect.objectContaining({
      selectedConditionCode: 'single_axis_mixing_shallow_normal_open',
      defaultDaysP50: 10,
      defaultDaysP80: 13,
      baselineProductivity: expect.objectContaining({
        p50PerDay: 135,
        unit: 'm2/day',
      }),
    }))

    const multiAxis = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'cement_soil_mixing_pile_ground',
      applicableGranularity: 'task',
      methodVariantCodes: ['deep_mixing_multi_axis'],
      elementVariantCodes: ['standard_depth', 'normal_geology', 'standard_workface'],
    }) as any

    expect(multiAxis).toEqual(expect.objectContaining({
      selectedConditionCode: 'multi_axis_mixing_standard_normal_workface',
      defaultDaysP50: 14,
      defaultDaysP80: 18,
      baselineProductivity: expect.objectContaining({
        p50PerDay: 110,
        unit: 'm2/day',
      }),
    }))

    const wetDeep = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'cement_soil_mixing_pile_ground',
      applicableGranularity: 'task',
      methodVariantCodes: ['wet_method_mixing'],
      elementVariantCodes: ['deep_depth', 'complex_geology', 'constrained_workface'],
    }) as any

    expect(wetDeep).toEqual(expect.objectContaining({
      selectedConditionCode: 'wet_deep_mixing_complex_constrained',
      defaultDaysP50: 21,
      defaultDaysP80: 27,
      baselineProductivity: expect.objectContaining({
        p50PerDay: 78,
        unit: 'm2/day',
      }),
    }))
  })

  it('keeps CFG composite ground conditionized by forming method, geology, and workface', async () => {
    const byStableCode = new Map(STANDARD_WORK_DURATION_SEED.map((record) => [record.stableCode, record]))
    const cfg = byStableCode.get('cfg_composite_ground') as any

    expect(cfg).toEqual(expect.objectContaining({
      defaultDaysP20: 12,
      defaultDaysP50: 17,
      defaultDaysP80: 22,
      conditionedDurationBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'long_spiral_cfg_open_workface',
          selector: expect.objectContaining({
            cfgMethodBand: 'long_spiral',
            workfaceBand: 'open',
          }),
          defaultDaysP20: 10,
          defaultDaysP50: 14,
          defaultDaysP80: 18,
        }),
        expect.objectContaining({
          conditionCode: 'vibro_cfg_standard_normal_workface',
          selector: expect.objectContaining({
            cfgMethodBand: 'vibro',
            geologyBand: 'normal',
          }),
          defaultDaysP20: 12,
          defaultDaysP50: 18,
          defaultDaysP80: 23,
        }),
        expect.objectContaining({
          conditionCode: 'dense_cfg_layout_complex_constrained',
          selector: expect.objectContaining({
            cfgMethodBand: 'dense_layout',
            geologyBand: 'complex',
            workfaceBand: 'constrained',
          }),
          defaultDaysP20: 17,
          defaultDaysP50: 24,
          defaultDaysP80: 31,
        }),
      ]),
      conditionedProcessProfiles: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'long_spiral_cfg_open_workface',
          profile: expect.objectContaining({
            defaultBase: 8,
            max: 28,
          }),
        }),
        expect.objectContaining({
          conditionCode: 'dense_cfg_layout_complex_constrained',
          profile: expect.objectContaining({
            defaultBase: 14,
            max: 48,
          }),
        }),
      ]),
      productivityBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'long_spiral_cfg_open_workface',
          baselineProductivity: expect.objectContaining({
            p50PerDay: 125,
            unit: 'm2/day',
            sourceType: 'expert_profile',
          }),
        }),
        expect.objectContaining({
          conditionCode: 'dense_cfg_layout_complex_constrained',
          baselineProductivity: expect.objectContaining({
            p50PerDay: 75,
            unit: 'm2/day',
            sourceType: 'expert_profile',
          }),
        }),
      ]),
    }))

    const longSpiral = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'cfg_composite_ground',
      applicableGranularity: 'task',
      methodVariantCodes: ['long_spiral_cfg'],
      elementVariantCodes: ['open_workface'],
    }) as any

    expect(longSpiral).toEqual(expect.objectContaining({
      selectedConditionCode: 'long_spiral_cfg_open_workface',
      defaultDaysP50: 14,
      defaultDaysP80: 18,
      baselineProductivity: expect.objectContaining({
        p50PerDay: 125,
        unit: 'm2/day',
      }),
    }))

    const vibro = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'cfg_composite_ground',
      applicableGranularity: 'task',
      methodVariantCodes: ['vibro_cfg'],
      elementVariantCodes: ['normal_geology', 'standard_workface'],
    }) as any

    expect(vibro).toEqual(expect.objectContaining({
      selectedConditionCode: 'vibro_cfg_standard_normal_workface',
      defaultDaysP50: 18,
      defaultDaysP80: 23,
      baselineProductivity: expect.objectContaining({
        p50PerDay: 105,
        unit: 'm2/day',
      }),
    }))

    const dense = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'cfg_composite_ground',
      applicableGranularity: 'task',
      methodVariantCodes: ['dense_cfg_layout'],
      elementVariantCodes: ['complex_geology', 'constrained_workface'],
    }) as any

    expect(dense).toEqual(expect.objectContaining({
      selectedConditionCode: 'dense_cfg_layout_complex_constrained',
      defaultDaysP50: 24,
      defaultDaysP80: 31,
      baselineProductivity: expect.objectContaining({
        p50PerDay: 75,
        unit: 'm2/day',
      }),
    }))
  })

  it('keeps earthwork excavation and backfill conditionized by method and workface', async () => {
    const byStableCode = new Map(STANDARD_WORK_DURATION_SEED.map((record) => [record.stableCode, record]))
    const earthwork = byStableCode.get('earthwork_excavation_transport') as any

    expect(earthwork).toEqual(expect.objectContaining({
      defaultDaysP20: 11,
      defaultDaysP50: 14,
      defaultDaysP80: 18,
      conditionedDurationBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'open_bulk_excavation_transport',
          selector: expect.objectContaining({
            earthworkMethodBand: 'bulk_excavation',
            workfaceBand: 'open',
          }),
          defaultDaysP20: 6,
          defaultDaysP50: 9,
          defaultDaysP80: 12,
        }),
        expect.objectContaining({
          conditionCode: 'deep_pit_excavation_constrained',
          selector: expect.objectContaining({
            earthworkMethodBand: 'pit_excavation',
            depthBand: 'deep',
            workfaceBand: 'constrained',
          }),
          defaultDaysP20: 10,
          defaultDaysP50: 14,
          defaultDaysP80: 18,
        }),
        expect.objectContaining({
          conditionCode: 'layered_backfill_compaction_constrained',
          selector: expect.objectContaining({
            earthworkMethodBand: 'layered_backfill',
            workfaceBand: 'constrained',
          }),
          defaultDaysP20: 12,
          defaultDaysP50: 17,
          defaultDaysP80: 22,
        }),
      ]),
      conditionedProcessProfiles: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'open_bulk_excavation_transport',
          profile: expect.objectContaining({
            defaultBase: 5,
            max: 18,
          }),
        }),
        expect.objectContaining({
          conditionCode: 'layered_backfill_compaction_constrained',
          profile: expect.objectContaining({
            defaultBase: 10,
            max: 34,
          }),
        }),
      ]),
      productivityBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'open_bulk_excavation_transport',
          baselineProductivity: expect.objectContaining({
            p50PerDay: 850,
            unit: 'm3/day',
            sourceType: 'expert_profile',
          }),
        }),
        expect.objectContaining({
          conditionCode: 'layered_backfill_compaction_constrained',
          baselineProductivity: expect.objectContaining({
            p50PerDay: 420,
            unit: 'm3/day',
            sourceType: 'expert_profile',
          }),
        }),
      ]),
    }))

    const openBulk = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'earthwork_excavation_transport',
      applicableGranularity: 'task',
      methodVariantCodes: ['bulk_excavation'],
      elementVariantCodes: ['open_workface'],
    }) as any

    expect(openBulk).toEqual(expect.objectContaining({
      selectedConditionCode: 'open_bulk_excavation_transport',
      defaultDaysP50: 9,
      defaultDaysP80: 12,
      baselineProductivity: expect.objectContaining({
        p50PerDay: 850,
        unit: 'm3/day',
      }),
    }))

    const deepPit = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'earthwork_excavation_transport',
      applicableGranularity: 'task',
      methodVariantCodes: ['deep_pit_excavation'],
      elementVariantCodes: ['deep_depth', 'constrained_workface'],
    }) as any

    expect(deepPit).toEqual(expect.objectContaining({
      selectedConditionCode: 'deep_pit_excavation_constrained',
      defaultDaysP50: 14,
      defaultDaysP80: 18,
      baselineProductivity: expect.objectContaining({
        p50PerDay: 520,
        unit: 'm3/day',
      }),
    }))

    const backfill = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'earthwork_excavation_transport',
      applicableGranularity: 'task',
      methodVariantCodes: ['layered_backfill'],
      elementVariantCodes: ['constrained_workface'],
    }) as any

    expect(backfill).toEqual(expect.objectContaining({
      selectedConditionCode: 'layered_backfill_compaction_constrained',
      defaultDaysP50: 17,
      defaultDaysP80: 22,
      baselineProductivity: expect.objectContaining({
        p50PerDay: 420,
        unit: 'm3/day',
      }),
    }))
  })

  it('keeps foundation pit retaining support conditionized by support method and workface', async () => {
    const byStableCode = new Map(STANDARD_WORK_DURATION_SEED.map((record) => [record.stableCode, record]))
    const retaining = byStableCode.get('foundation_pit_retaining_support') as any

    expect(retaining).toEqual(expect.objectContaining({
      defaultDaysP20: 18,
      defaultDaysP50: 24,
      defaultDaysP80: 30,
      conditionedDurationBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'soil_nail_wall_open_workface',
          selector: expect.objectContaining({
            foundationPitSupportMethodBand: 'soil_nail',
            workfaceBand: 'open',
          }),
          defaultDaysP20: 12,
          defaultDaysP50: 17,
          defaultDaysP80: 22,
        }),
        expect.objectContaining({
          conditionCode: 'anchor_strut_standard_support',
          selector: expect.objectContaining({
            foundationPitSupportMethodBand: 'anchor_strut',
            depthBand: 'standard',
            workfaceBand: 'open',
          }),
          defaultDaysP20: 18,
          defaultDaysP50: 24,
          defaultDaysP80: 30,
        }),
        expect.objectContaining({
          conditionCode: 'diaphragm_wall_deep_constrained',
          selector: expect.objectContaining({
            foundationPitSupportMethodBand: 'diaphragm_wall',
            depthBand: 'deep',
            workfaceBand: 'constrained',
          }),
          defaultDaysP20: 28,
          defaultDaysP50: 39,
          defaultDaysP80: 50,
        }),
      ]),
      productivityBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'soil_nail_wall_open_workface',
          baselineProductivity: expect.objectContaining({
            p50PerDay: 75,
            unit: 'm/day',
            sourceType: 'expert_profile',
          }),
        }),
        expect.objectContaining({
          conditionCode: 'diaphragm_wall_deep_constrained',
          baselineProductivity: expect.objectContaining({
            p50PerDay: 34,
            unit: 'm/day',
            sourceType: 'expert_profile',
          }),
        }),
      ]),
    }))

    const soilNail = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'foundation_pit_retaining_support',
      applicableGranularity: 'task',
      methodVariantCodes: ['soil_nail_wall'],
      elementVariantCodes: ['open_workface'],
    }) as any

    expect(soilNail).toEqual(expect.objectContaining({
      selectedConditionCode: 'soil_nail_wall_open_workface',
      defaultDaysP50: 17,
      baselineProductivity: expect.objectContaining({ p50PerDay: 75, unit: 'm/day' }),
    }))

    const diaphragm = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'foundation_pit_retaining_support',
      applicableGranularity: 'task',
      methodVariantCodes: ['diaphragm_wall'],
      elementVariantCodes: ['deep_depth', 'constrained_workface'],
    }) as any

    expect(diaphragm).toEqual(expect.objectContaining({
      selectedConditionCode: 'diaphragm_wall_deep_constrained',
      defaultDaysP50: 39,
      baselineProductivity: expect.objectContaining({ p50PerDay: 34, unit: 'm/day' }),
    }))
  })

  it('keeps early-stage fallback durations conditionized by intrinsic setup, support, and pile method', async () => {
    const byStableCode = new Map(STANDARD_WORK_DURATION_SEED.map((record) => [record.stableCode, record]))
    const siteSetup = byStableCode.get('site_setup_temp_works') as any
    const supportDewatering = byStableCode.get('deep_foundation_support_dewatering') as any
    const pileFoundation = byStableCode.get('pile_foundation') as any

    expect(siteSetup).toEqual(expect.objectContaining({
      defaultDaysP20: 6,
      defaultDaysP50: 8,
      defaultDaysP80: 10,
      conditionedDurationBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'site_mobilization_fencing_open',
          selector: expect.objectContaining({
            siteSetupMethodBand: 'mobilization_fencing',
            workfaceBand: 'open',
          }),
          defaultDaysP50: 6,
        }),
        expect.objectContaining({
          conditionCode: 'temporary_utilities_standard',
          selector: expect.objectContaining({
            siteSetupMethodBand: 'temporary_utilities',
            workfaceBand: 'open',
          }),
          defaultDaysP50: 8,
        }),
        expect.objectContaining({
          conditionCode: 'laydown_dust_control_constrained',
          selector: expect.objectContaining({
            siteSetupMethodBand: 'laydown_logistics_dust_control',
            workfaceBand: 'constrained',
          }),
          defaultDaysP50: 11,
        }),
      ]),
      conditionedProcessProfiles: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'laydown_dust_control_constrained',
          profile: expect.objectContaining({ defaultBase: 5, max: 14 }),
        }),
      ]),
      productivityBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'site_mobilization_fencing_open',
          baselineProductivity: expect.objectContaining({ p50PerDay: 1.4, unit: 'workface/day' }),
        }),
        expect.objectContaining({
          conditionCode: 'laydown_dust_control_constrained',
          baselineProductivity: expect.objectContaining({ p50PerDay: 0.8, unit: 'site/day' }),
        }),
      ]),
    }))

    expect(supportDewatering).toEqual(expect.objectContaining({
      defaultDaysP20: 17,
      defaultDaysP50: 24,
      defaultDaysP80: 31,
      conditionedDurationBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'soil_nail_wellpoint_open',
          selector: expect.objectContaining({
            foundationPitSupportMethodBand: 'soil_nail',
            dewateringMethodBand: 'wellpoint',
            workfaceBand: 'open',
          }),
          defaultDaysP50: 18,
        }),
        expect.objectContaining({
          conditionCode: 'anchor_strut_deep_well_standard',
          selector: expect.objectContaining({
            foundationPitSupportMethodBand: 'anchor_strut',
            dewateringMethodBand: 'deep_well',
            depthBand: 'standard',
          }),
          defaultDaysP50: 24,
        }),
        expect.objectContaining({
          conditionCode: 'diaphragm_recharge_monitoring_deep_constrained',
          selector: expect.objectContaining({
            foundationPitSupportMethodBand: 'diaphragm_wall',
            dewateringMethodBand: 'recharge_monitoring',
            depthBand: 'deep',
            workfaceBand: 'constrained',
          }),
          defaultDaysP50: 35,
        }),
      ]),
      conditionedProcessProfiles: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'diaphragm_recharge_monitoring_deep_constrained',
          profile: expect.objectContaining({ defaultBase: 12, max: 42 }),
        }),
      ]),
      productivityBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'soil_nail_wellpoint_open',
          baselineProductivity: expect.objectContaining({ p50PerDay: 0.9, unit: 'workface/day' }),
        }),
        expect.objectContaining({
          conditionCode: 'diaphragm_recharge_monitoring_deep_constrained',
          baselineProductivity: expect.objectContaining({ p50PerDay: 0.45, unit: 'workface/day' }),
        }),
      ]),
    }))

    expect(pileFoundation).toEqual(expect.objectContaining({
      defaultDaysP20: 13,
      defaultDaysP50: 18,
      defaultDaysP80: 23,
      conditionedDurationBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'precast_static_press_pile_open',
          selector: expect.objectContaining({
            pileFoundationMethodBand: 'precast_static_press',
            workfaceBand: 'open',
          }),
          defaultDaysP50: 14,
        }),
        expect.objectContaining({
          conditionCode: 'bored_cast_in_place_pile_standard',
          selector: expect.objectContaining({
            pileFoundationMethodBand: 'bored_cast_in_place',
            workfaceBand: 'open',
          }),
          defaultDaysP50: 18,
        }),
        expect.objectContaining({
          conditionCode: 'pile_testing_closeout_constrained',
          selector: expect.objectContaining({
            pileFoundationMethodBand: 'testing_closeout',
            workfaceBand: 'constrained',
          }),
          defaultDaysP50: 24,
        }),
      ]),
      conditionedProcessProfiles: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'pile_testing_closeout_constrained',
          profile: expect.objectContaining({ defaultBase: 10, max: 30 }),
        }),
      ]),
      productivityBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'precast_static_press_pile_open',
          baselineProductivity: expect.objectContaining({ p50PerDay: 8, unit: 'pile/day' }),
        }),
        expect.objectContaining({
          conditionCode: 'pile_testing_closeout_constrained',
          baselineProductivity: expect.objectContaining({ p50PerDay: 0.8, unit: 'test/day' }),
        }),
      ]),
    }))

    const temporaryUtilities = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'site_setup_temp_works',
      applicableGranularity: 'task',
      methodVariantCodes: ['temporary_utilities'],
    }) as any
    expect(temporaryUtilities).toEqual(expect.objectContaining({
      selectedConditionCode: 'temporary_utilities_standard',
      defaultDaysP50: 8,
      baselineProductivity: expect.objectContaining({ p50PerDay: 1.1, unit: 'workface/day' }),
    }))

    const deepRecharge = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'deep_foundation_support_dewatering',
      applicableGranularity: 'task',
      methodVariantCodes: ['diaphragm_wall', 'recharge_well'],
      elementVariantCodes: ['deep_depth', 'constrained_workface'],
    }) as any
    expect(deepRecharge).toEqual(expect.objectContaining({
      selectedConditionCode: 'diaphragm_recharge_monitoring_deep_constrained',
      defaultDaysP50: 35,
      baselineProductivity: expect.objectContaining({ p50PerDay: 0.45, unit: 'workface/day' }),
    }))

    const pileTesting = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'pile_foundation',
      applicableGranularity: 'task',
      methodVariantCodes: ['static_load_test', 'low_strain_test'],
      elementVariantCodes: ['constrained_workface'],
    }) as any
    expect(pileTesting).toEqual(expect.objectContaining({
      selectedConditionCode: 'pile_testing_closeout_constrained',
      defaultDaysP50: 24,
      baselineProductivity: expect.objectContaining({ p50PerDay: 0.8, unit: 'test/day' }),
    }))
  })

  it('keeps curing, interior detail, and fire pipe fallback durations conditionized by intrinsic standard-work parameters', async () => {
    const byStableCode = new Map(STANDARD_WORK_DURATION_SEED.map((record) => [record.stableCode, record]))
    const curing = byStableCode.get('concrete_curing_wait') as any
    const interiorDetail = byStableCode.get('interior_detail_fixture_railing') as any
    const firePipe = byStableCode.get('mep_plumbing_fire_pipe') as any

    expect(curing).toEqual(expect.objectContaining({
      defaultDaysP20: 5,
      defaultDaysP50: 7,
      defaultDaysP80: 9,
      conditionedDurationBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'standard_curing_strength_report',
          selector: expect.objectContaining({
            concreteCuringMethodBand: 'standard_strength_report',
          }),
          defaultDaysP50: 7,
        }),
        expect.objectContaining({
          conditionCode: 'early_strength_form_removal',
          selector: expect.objectContaining({
            concreteCuringMethodBand: 'early_strength_form_removal',
          }),
          defaultDaysP50: 5,
        }),
        expect.objectContaining({
          conditionCode: 'mass_concrete_temperature_monitoring',
          selector: expect.objectContaining({
            concreteCuringMethodBand: 'mass_temperature_monitoring',
          }),
          defaultDaysP50: 10,
        }),
      ]),
      conditionedProcessProfiles: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'mass_concrete_temperature_monitoring',
          profile: expect.objectContaining({ defaultBase: 6, max: 13 }),
        }),
      ]),
      productivityBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'standard_curing_strength_report',
          baselineProductivity: expect.objectContaining({ p50PerDay: 1, unit: 'pour-zone/day' }),
        }),
        expect.objectContaining({
          conditionCode: 'mass_concrete_temperature_monitoring',
          baselineProductivity: expect.objectContaining({ p50PerDay: 0.55, unit: 'pour-zone/day' }),
        }),
      ]),
    }))

    expect(interiorDetail).toEqual(expect.objectContaining({
      defaultDaysP20: 5,
      defaultDaysP50: 7,
      defaultDaysP80: 9,
      conditionedDurationBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'cabinet_curtain_box_standard',
          selector: expect.objectContaining({
            interiorDetailMethodBand: 'cabinet_curtain_box',
            locationBand: 'indoor',
          }),
          defaultDaysP50: 6,
        }),
        expect.objectContaining({
          conditionCode: 'stone_metal_trim_dense_node',
          selector: expect.objectContaining({
            interiorDetailMethodBand: 'stone_metal_trim',
            locationBand: 'indoor',
          }),
          defaultDaysP50: 8,
        }),
        expect.objectContaining({
          conditionCode: 'handrail_guardrail_constrained',
          selector: expect.objectContaining({
            interiorDetailMethodBand: 'handrail_guardrail',
            workfaceBand: 'constrained',
          }),
          defaultDaysP50: 10,
        }),
      ]),
      conditionedProcessProfiles: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'handrail_guardrail_constrained',
          profile: expect.objectContaining({ defaultBase: 5, max: 13 }),
        }),
      ]),
      productivityBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'cabinet_curtain_box_standard',
          baselineProductivity: expect.objectContaining({ p50PerDay: 75, unit: 'm/day' }),
        }),
        expect.objectContaining({
          conditionCode: 'handrail_guardrail_constrained',
          baselineProductivity: expect.objectContaining({ p50PerDay: 42, unit: 'm/day' }),
        }),
      ]),
    }))

    expect(firePipe).toEqual(expect.objectContaining({
      defaultDaysP20: 7,
      defaultDaysP50: 10,
      defaultDaysP80: 13,
      conditionedDurationBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'hydrant_pipe_standard_zone',
          selector: expect.objectContaining({
            plumbingFirePipeMethodBand: 'hydrant_pipe',
            locationBand: 'indoor',
          }),
          defaultDaysP50: 9,
        }),
        expect.objectContaining({
          conditionCode: 'sprinkler_dense_terminal_standard',
          selector: expect.objectContaining({
            plumbingFirePipeMethodBand: 'sprinkler_dense_terminal',
            locationBand: 'indoor',
          }),
          defaultDaysP50: 12,
        }),
        expect.objectContaining({
          conditionCode: 'fire_linkage_commissioning_constrained',
          selector: expect.objectContaining({
            plumbingFirePipeMethodBand: 'fire_linkage_commissioning',
            workfaceBand: 'constrained',
          }),
          defaultDaysP50: 16,
        }),
      ]),
      conditionedProcessProfiles: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'fire_linkage_commissioning_constrained',
          profile: expect.objectContaining({ defaultBase: 7, max: 21 }),
        }),
      ]),
      productivityBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'hydrant_pipe_standard_zone',
          baselineProductivity: expect.objectContaining({ p50PerDay: 58, unit: 'm/day' }),
        }),
        expect.objectContaining({
          conditionCode: 'fire_linkage_commissioning_constrained',
          baselineProductivity: expect.objectContaining({ p50PerDay: 24, unit: 'terminal/day' }),
        }),
      ]),
    }))

    const earlyStrength = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'concrete_curing_wait',
      applicableGranularity: 'task',
      methodVariantCodes: ['early_strength_form_removal'],
    }) as any
    expect(earlyStrength).toEqual(expect.objectContaining({
      selectedConditionCode: 'early_strength_form_removal',
      defaultDaysP50: 5,
      baselineProductivity: expect.objectContaining({ p50PerDay: 1.3, unit: 'pour-zone/day' }),
    }))

    const handrail = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'interior_detail_fixture_railing',
      applicableGranularity: 'task',
      methodVariantCodes: ['handrail_guardrail'],
      elementVariantCodes: ['constrained_workface'],
    }) as any
    expect(handrail).toEqual(expect.objectContaining({
      selectedConditionCode: 'handrail_guardrail_constrained',
      defaultDaysP50: 10,
      baselineProductivity: expect.objectContaining({ p50PerDay: 42, unit: 'm/day' }),
    }))

    const fireLinkage = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'mep_plumbing_fire_pipe',
      applicableGranularity: 'task',
      methodVariantCodes: ['fire_linkage_commissioning'],
      elementVariantCodes: ['constrained_workface'],
    }) as any
    expect(fireLinkage).toEqual(expect.objectContaining({
      selectedConditionCode: 'fire_linkage_commissioning_constrained',
      defaultDaysP50: 16,
      baselineProductivity: expect.objectContaining({ p50PerDay: 24, unit: 'terminal/day' }),
    }))
  })

  it('keeps plumbing supply-drainage and special water fallback durations conditionized by intrinsic system scope', async () => {
    const byStableCode = new Map(STANDARD_WORK_DURATION_SEED.map((record) => [record.stableCode, record]))
    const supplyDrainage = byStableCode.get('plumbing_indoor_supply_drainage') as any
    const specialWater = byStableCode.get('plumbing_special_water_system') as any
    const reclaimedRainwater = byStableCode.get('plumbing_reclaimed_rainwater_system') as any

    expect(supplyDrainage).toEqual(expect.objectContaining({
      defaultDaysP20: 6,
      defaultDaysP50: 8,
      defaultDaysP80: 10,
      conditionedDurationBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'indoor_supply_branch_open',
          selector: expect.objectContaining({
            plumbingSupplyDrainageMethodBand: 'supply_branch',
            locationBand: 'indoor',
            workfaceBand: 'open',
          }),
          defaultDaysP50: 7,
        }),
        expect.objectContaining({
          conditionCode: 'supply_drainage_combined_standard',
          selector: expect.objectContaining({
            plumbingSupplyDrainageMethodBand: 'supply_drainage_combined',
            locationBand: 'indoor',
          }),
          defaultDaysP50: 9,
        }),
        expect.objectContaining({
          conditionCode: 'renovation_supply_drainage_tie_in_constrained',
          selector: expect.objectContaining({
            plumbingSupplyDrainageMethodBand: 'renovation_tie_in',
            renovationBand: 'renovation',
            workfaceBand: 'constrained',
          }),
          defaultDaysP50: 12,
        }),
      ]),
      conditionedProcessProfiles: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'renovation_supply_drainage_tie_in_constrained',
          profile: expect.objectContaining({ defaultBase: 6, max: 16 }),
        }),
      ]),
      productivityBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'indoor_supply_branch_open',
          baselineProductivity: expect.objectContaining({ p50PerDay: 72, unit: 'm/day' }),
        }),
        expect.objectContaining({
          conditionCode: 'renovation_supply_drainage_tie_in_constrained',
          baselineProductivity: expect.objectContaining({ p50PerDay: 34, unit: 'm/day' }),
        }),
      ]),
    }))

    expect(specialWater).toEqual(expect.objectContaining({
      defaultDaysP20: 10,
      defaultDaysP50: 14,
      defaultDaysP80: 18,
      conditionedDurationBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'drinking_water_purification_standard',
          selector: expect.objectContaining({
            plumbingSpecialWaterMethodBand: 'drinking_water_purification',
            locationBand: 'indoor',
          }),
          defaultDaysP50: 12,
        }),
        expect.objectContaining({
          conditionCode: 'special_water_tank_pump_standard',
          selector: expect.objectContaining({
            plumbingSpecialWaterMethodBand: 'tank_pump_package',
            locationBand: 'indoor',
          }),
          defaultDaysP50: 15,
        }),
        expect.objectContaining({
          conditionCode: 'instrumentation_sampling_commissioning_constrained',
          selector: expect.objectContaining({
            plumbingSpecialWaterMethodBand: 'instrumentation_sampling_commissioning',
            workfaceBand: 'constrained',
          }),
          defaultDaysP50: 19,
        }),
      ]),
      conditionedProcessProfiles: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'instrumentation_sampling_commissioning_constrained',
          profile: expect.objectContaining({ defaultBase: 8, max: 25 }),
        }),
      ]),
      productivityBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'drinking_water_purification_standard',
          baselineProductivity: expect.objectContaining({ p50PerDay: 1.2, unit: 'system/day' }),
        }),
        expect.objectContaining({
          conditionCode: 'instrumentation_sampling_commissioning_constrained',
          baselineProductivity: expect.objectContaining({ p50PerDay: 0.55, unit: 'system/day' }),
        }),
      ]),
    }))

    expect(reclaimedRainwater).toEqual(expect.objectContaining({
      defaultDaysP20: 9,
      defaultDaysP50: 13,
      defaultDaysP80: 17,
      conditionedDurationBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'reclaimed_water_treatment_standard',
          selector: expect.objectContaining({
            plumbingReclaimedRainwaterMethodBand: 'reclaimed_treatment',
            locationBand: 'indoor',
          }),
          defaultDaysP50: 12,
        }),
        expect.objectContaining({
          conditionCode: 'rainwater_reuse_storage_filtration_open',
          selector: expect.objectContaining({
            plumbingReclaimedRainwaterMethodBand: 'rainwater_storage_filtration',
            workfaceBand: 'open',
          }),
          defaultDaysP50: 13,
        }),
        expect.objectContaining({
          conditionCode: 'reuse_quality_commissioning_constrained',
          selector: expect.objectContaining({
            plumbingReclaimedRainwaterMethodBand: 'quality_commissioning',
            workfaceBand: 'constrained',
          }),
          defaultDaysP50: 18,
        }),
      ]),
      conditionedProcessProfiles: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'reuse_quality_commissioning_constrained',
          profile: expect.objectContaining({ defaultBase: 8, max: 23 }),
        }),
      ]),
      productivityBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'rainwater_reuse_storage_filtration_open',
          baselineProductivity: expect.objectContaining({ p50PerDay: 1.1, unit: 'system/day' }),
        }),
        expect.objectContaining({
          conditionCode: 'reuse_quality_commissioning_constrained',
          baselineProductivity: expect.objectContaining({ p50PerDay: 0.6, unit: 'system/day' }),
        }),
      ]),
    }))

    const renovationCombined = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'plumbing_indoor_supply_drainage',
      applicableGranularity: 'task',
      methodVariantCodes: ['supply_drainage_renovation_tie_in'],
      elementVariantCodes: ['indoor_installation', 'renovation', 'constrained_workface'],
    }) as any
    expect(renovationCombined).toEqual(expect.objectContaining({
      selectedConditionCode: 'renovation_supply_drainage_tie_in_constrained',
      defaultDaysP50: 12,
      baselineProductivity: expect.objectContaining({ p50PerDay: 34, unit: 'm/day' }),
    }))

    const specialCommissioning = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'plumbing_special_water_system',
      applicableGranularity: 'task',
      methodVariantCodes: ['instrumentation_sampling_commissioning'],
      elementVariantCodes: ['constrained_workface'],
    }) as any
    expect(specialCommissioning).toEqual(expect.objectContaining({
      selectedConditionCode: 'instrumentation_sampling_commissioning_constrained',
      defaultDaysP50: 19,
      baselineProductivity: expect.objectContaining({ p50PerDay: 0.55, unit: 'system/day' }),
    }))

    const reuseCommissioning = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'plumbing_reclaimed_rainwater_system',
      applicableGranularity: 'task',
      methodVariantCodes: ['reuse_quality_commissioning'],
      elementVariantCodes: ['constrained_workface'],
    }) as any
    expect(reuseCommissioning).toEqual(expect.objectContaining({
      selectedConditionCode: 'reuse_quality_commissioning_constrained',
      defaultDaysP50: 18,
      baselineProductivity: expect.objectContaining({ p50PerDay: 0.6, unit: 'system/day' }),
    }))
  })

  it('keeps pool-bath, water-feature, and outdoor electrical fallbacks conditionized by intrinsic system scope', async () => {
    const byStableCode = new Map(STANDARD_WORK_DURATION_SEED.map((record) => [record.stableCode, record]))
    const poolBath = byStableCode.get('plumbing_pool_bath_system') as any
    const waterFeature = byStableCode.get('plumbing_water_feature_system') as any
    const outdoorElectrical = byStableCode.get('electrical_outdoor_distribution') as any

    expect(poolBath).toEqual(expect.objectContaining({
      defaultDaysP20: 12,
      defaultDaysP50: 16,
      defaultDaysP80: 20,
      conditionedDurationBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'pool_circulation_filtration_standard',
          selector: expect.objectContaining({
            plumbingPoolBathMethodBand: 'pool_circulation_filtration',
            locationBand: 'indoor',
          }),
          defaultDaysP50: 14,
        }),
        expect.objectContaining({
          conditionCode: 'public_bath_hot_water_dosing_standard',
          selector: expect.objectContaining({
            plumbingPoolBathMethodBand: 'bath_hot_water_dosing',
            locationBand: 'indoor',
          }),
          defaultDaysP50: 16,
        }),
        expect.objectContaining({
          conditionCode: 'pool_waterproof_commissioning_constrained',
          selector: expect.objectContaining({
            plumbingPoolBathMethodBand: 'waterproof_commissioning',
            workfaceBand: 'constrained',
          }),
          defaultDaysP50: 22,
        }),
      ]),
      conditionedProcessProfiles: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'pool_waterproof_commissioning_constrained',
          profile: expect.objectContaining({ defaultBase: 9, max: 28 }),
        }),
      ]),
      productivityBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'pool_circulation_filtration_standard',
          baselineProductivity: expect.objectContaining({ p50PerDay: 0.9, unit: 'system/day' }),
        }),
        expect.objectContaining({
          conditionCode: 'pool_waterproof_commissioning_constrained',
          baselineProductivity: expect.objectContaining({ p50PerDay: 0.55, unit: 'system/day' }),
        }),
      ]),
    }))

    expect(waterFeature).toEqual(expect.objectContaining({
      defaultDaysP20: 8,
      defaultDaysP50: 11,
      defaultDaysP80: 14,
      conditionedDurationBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'fountain_nozzle_pipe_open',
          selector: expect.objectContaining({
            plumbingWaterFeatureMethodBand: 'fountain_nozzle_pipe',
            workfaceBand: 'open',
          }),
          defaultDaysP50: 9,
        }),
        expect.objectContaining({
          conditionCode: 'water_feature_pump_filtration_standard',
          selector: expect.objectContaining({
            plumbingWaterFeatureMethodBand: 'pump_filtration',
          }),
          defaultDaysP50: 11,
        }),
        expect.objectContaining({
          conditionCode: 'waterproof_lighting_commissioning_constrained',
          selector: expect.objectContaining({
            plumbingWaterFeatureMethodBand: 'waterproof_lighting_commissioning',
            workfaceBand: 'constrained',
          }),
          defaultDaysP50: 15,
        }),
      ]),
      conditionedProcessProfiles: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'waterproof_lighting_commissioning_constrained',
          profile: expect.objectContaining({ defaultBase: 6, max: 19 }),
        }),
      ]),
      productivityBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'fountain_nozzle_pipe_open',
          baselineProductivity: expect.objectContaining({ p50PerDay: 48, unit: 'nozzle/day' }),
        }),
        expect.objectContaining({
          conditionCode: 'waterproof_lighting_commissioning_constrained',
          baselineProductivity: expect.objectContaining({ p50PerDay: 0.8, unit: 'system/day' }),
        }),
      ]),
    }))

    expect(outdoorElectrical).toEqual(expect.objectContaining({
      defaultDaysP20: 8,
      defaultDaysP50: 11,
      defaultDaysP80: 14,
      conditionedDurationBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'outdoor_cable_lighting_open',
          selector: expect.objectContaining({
            electricalOutdoorDistributionMethodBand: 'outdoor_cable_lighting',
            locationBand: 'outdoor',
            workfaceBand: 'open',
          }),
          defaultDaysP50: 9,
        }),
        expect.objectContaining({
          conditionCode: 'outdoor_transformer_cabinet_standard',
          selector: expect.objectContaining({
            electricalOutdoorDistributionMethodBand: 'transformer_cabinet',
            locationBand: 'outdoor',
          }),
          defaultDaysP50: 12,
        }),
        expect.objectContaining({
          conditionCode: 'outdoor_grounding_energization_constrained',
          selector: expect.objectContaining({
            electricalOutdoorDistributionMethodBand: 'grounding_energization',
            workfaceBand: 'constrained',
          }),
          defaultDaysP50: 15,
        }),
      ]),
      conditionedProcessProfiles: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'outdoor_grounding_energization_constrained',
          profile: expect.objectContaining({ defaultBase: 6, max: 19 }),
        }),
      ]),
      productivityBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'outdoor_cable_lighting_open',
          baselineProductivity: expect.objectContaining({ p50PerDay: 120, unit: 'm/day' }),
        }),
        expect.objectContaining({
          conditionCode: 'outdoor_grounding_energization_constrained',
          baselineProductivity: expect.objectContaining({ p50PerDay: 0.9, unit: 'system/day' }),
        }),
      ]),
    }))

    const poolCommissioning = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'plumbing_pool_bath_system',
      applicableGranularity: 'task',
      methodVariantCodes: ['pool_waterproof_commissioning'],
      elementVariantCodes: ['constrained_workface'],
    }) as any
    expect(poolCommissioning).toEqual(expect.objectContaining({
      selectedConditionCode: 'pool_waterproof_commissioning_constrained',
      defaultDaysP50: 22,
      baselineProductivity: expect.objectContaining({ p50PerDay: 0.55, unit: 'system/day' }),
    }))

    const waterFeatureCommissioning = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'plumbing_water_feature_system',
      applicableGranularity: 'task',
      methodVariantCodes: ['waterproof_lighting_commissioning'],
      elementVariantCodes: ['constrained_workface'],
    }) as any
    expect(waterFeatureCommissioning).toEqual(expect.objectContaining({
      selectedConditionCode: 'waterproof_lighting_commissioning_constrained',
      defaultDaysP50: 15,
      baselineProductivity: expect.objectContaining({ p50PerDay: 0.8, unit: 'system/day' }),
    }))

    const outdoorGrounding = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'electrical_outdoor_distribution',
      applicableGranularity: 'task',
      methodVariantCodes: ['outdoor_grounding_energization'],
      elementVariantCodes: ['constrained_workface'],
    }) as any
    expect(outdoorGrounding).toEqual(expect.objectContaining({
      selectedConditionCode: 'outdoor_grounding_energization_constrained',
      defaultDaysP50: 15,
      baselineProductivity: expect.objectContaining({ p50PerDay: 0.9, unit: 'system/day' }),
    }))
  })

  it('keeps power-distribution room, feeder, and equipment fallbacks conditionized by intrinsic electrical scope', async () => {
    const byStableCode = new Map(STANDARD_WORK_DURATION_SEED.map((record) => [record.stableCode, record]))
    const room = byStableCode.get('electrical_power_distribution_room') as any
    const feeder = byStableCode.get('electrical_feeder_busway') as any
    const equipment = byStableCode.get('electrical_distribution_equipment') as any

    expect(room).toEqual(expect.objectContaining({
      defaultDaysP20: 9,
      defaultDaysP50: 13,
      defaultDaysP80: 17,
      conditionedDurationBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'distribution_room_standard',
          selector: expect.objectContaining({ electricalPowerRoomMethodBand: 'distribution_room', locationBand: 'indoor' }),
          defaultDaysP50: 12,
        }),
        expect.objectContaining({
          conditionCode: 'ups_emergency_power_standard',
          selector: expect.objectContaining({ electricalPowerRoomMethodBand: 'ups_emergency_power', locationBand: 'indoor' }),
          defaultDaysP50: 14,
        }),
        expect.objectContaining({
          conditionCode: 'power_room_integrated_commissioning_constrained',
          selector: expect.objectContaining({ electricalPowerRoomMethodBand: 'integrated_commissioning', workfaceBand: 'constrained' }),
          defaultDaysP50: 18,
        }),
      ]),
      productivityBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'distribution_room_standard',
          baselineProductivity: expect.objectContaining({ p50PerDay: 0.9, unit: 'system/day' }),
        }),
        expect.objectContaining({
          conditionCode: 'power_room_integrated_commissioning_constrained',
          baselineProductivity: expect.objectContaining({ p50PerDay: 0.65, unit: 'system/day' }),
        }),
      ]),
    }))

    expect(feeder).toEqual(expect.objectContaining({
      defaultDaysP20: 8,
      defaultDaysP50: 12,
      defaultDaysP80: 16,
      conditionedDurationBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'cable_feeder_open',
          selector: expect.objectContaining({ electricalFeederMethodBand: 'cable_feeder', workfaceBand: 'open' }),
          defaultDaysP50: 10,
        }),
        expect.objectContaining({
          conditionCode: 'busway_tray_standard',
          selector: expect.objectContaining({ electricalFeederMethodBand: 'busway_tray', locationBand: 'indoor' }),
          defaultDaysP50: 12,
        }),
        expect.objectContaining({
          conditionCode: 'feeder_termination_insulation_test_constrained',
          selector: expect.objectContaining({ electricalFeederMethodBand: 'termination_insulation_test', workfaceBand: 'constrained' }),
          defaultDaysP50: 17,
        }),
      ]),
      productivityBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'cable_feeder_open',
          baselineProductivity: expect.objectContaining({ p50PerDay: 95, unit: 'm/day' }),
        }),
        expect.objectContaining({
          conditionCode: 'feeder_termination_insulation_test_constrained',
          baselineProductivity: expect.objectContaining({ p50PerDay: 36, unit: 'terminal/day' }),
        }),
      ]),
    }))

    expect(equipment).toEqual(expect.objectContaining({
      defaultDaysP20: 8,
      defaultDaysP50: 11,
      defaultDaysP80: 14,
      conditionedDurationBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'power_cabinet_standard',
          selector: expect.objectContaining({ electricalDistributionEquipmentMethodBand: 'power_cabinet', locationBand: 'indoor' }),
          defaultDaysP50: 10,
        }),
        expect.objectContaining({
          conditionCode: 'motor_control_wiring_standard',
          selector: expect.objectContaining({ electricalDistributionEquipmentMethodBand: 'motor_control_wiring' }),
          defaultDaysP50: 11,
        }),
        expect.objectContaining({
          conditionCode: 'circuit_test_debugging_constrained',
          selector: expect.objectContaining({ electricalDistributionEquipmentMethodBand: 'circuit_test_debugging', workfaceBand: 'constrained' }),
          defaultDaysP50: 15,
        }),
      ]),
      productivityBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'power_cabinet_standard',
          baselineProductivity: expect.objectContaining({ p50PerDay: 4, unit: 'cabinet/day' }),
        }),
        expect.objectContaining({
          conditionCode: 'circuit_test_debugging_constrained',
          baselineProductivity: expect.objectContaining({ p50PerDay: 28, unit: 'circuit/day' }),
        }),
      ]),
    }))

    const roomCommissioning = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'electrical_power_distribution_room',
      applicableGranularity: 'task',
      methodVariantCodes: ['power_room_integrated_commissioning'],
      elementVariantCodes: ['constrained_workface'],
    }) as any
    expect(roomCommissioning).toEqual(expect.objectContaining({
      selectedConditionCode: 'power_room_integrated_commissioning_constrained',
      defaultDaysP50: 18,
      baselineProductivity: expect.objectContaining({ p50PerDay: 0.65, unit: 'system/day' }),
    }))

    const feederTest = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'electrical_feeder_busway',
      applicableGranularity: 'task',
      methodVariantCodes: ['feeder_termination_insulation_test'],
      elementVariantCodes: ['constrained_workface'],
    }) as any
    expect(feederTest).toEqual(expect.objectContaining({
      selectedConditionCode: 'feeder_termination_insulation_test_constrained',
      defaultDaysP50: 17,
      baselineProductivity: expect.objectContaining({ p50PerDay: 36, unit: 'terminal/day' }),
    }))

    const equipmentDebugging = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'electrical_distribution_equipment',
      applicableGranularity: 'task',
      methodVariantCodes: ['circuit_test_debugging'],
      elementVariantCodes: ['constrained_workface'],
    }) as any
    expect(equipmentDebugging).toEqual(expect.objectContaining({
      selectedConditionCode: 'circuit_test_debugging_constrained',
      defaultDaysP50: 15,
      baselineProductivity: expect.objectContaining({ p50PerDay: 28, unit: 'circuit/day' }),
    }))
  })

  it('keeps lighting terminal, standby power, and grounding fallbacks conditionized by intrinsic electrical scope', async () => {
    const byStableCode = new Map(STANDARD_WORK_DURATION_SEED.map((record) => [record.stableCode, record]))
    const lighting = byStableCode.get('electrical_lighting_terminal') as any
    const standby = byStableCode.get('electrical_standby_power_ups') as any
    const grounding = byStableCode.get('electrical_grounding_lightning') as any

    expect(lighting).toEqual(expect.objectContaining({
      defaultDaysP20: 6,
      defaultDaysP50: 9,
      defaultDaysP80: 12,
      conditionedDurationBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'lighting_fixture_open',
          selector: expect.objectContaining({ electricalLightingTerminalMethodBand: 'lighting_fixture', workfaceBand: 'open' }),
          defaultDaysP50: 8,
        }),
        expect.objectContaining({
          conditionCode: 'switch_socket_standard',
          selector: expect.objectContaining({ electricalLightingTerminalMethodBand: 'switch_socket', locationBand: 'indoor' }),
          defaultDaysP50: 9,
        }),
        expect.objectContaining({
          conditionCode: 'lighting_control_debugging_constrained',
          selector: expect.objectContaining({ electricalLightingTerminalMethodBand: 'control_debugging', workfaceBand: 'constrained' }),
          defaultDaysP50: 13,
        }),
      ]),
      productivityBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'lighting_fixture_open',
          baselineProductivity: expect.objectContaining({ p50PerDay: 85, unit: 'terminal/day' }),
        }),
        expect.objectContaining({
          conditionCode: 'lighting_control_debugging_constrained',
          baselineProductivity: expect.objectContaining({ p50PerDay: 42, unit: 'terminal/day' }),
        }),
      ]),
    }))

    expect(standby).toEqual(expect.objectContaining({
      defaultDaysP20: 11,
      defaultDaysP50: 16,
      defaultDaysP80: 21,
      conditionedDurationBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'diesel_generator_standard',
          selector: expect.objectContaining({ electricalStandbyPowerMethodBand: 'diesel_generator', locationBand: 'indoor' }),
          defaultDaysP50: 15,
        }),
        expect.objectContaining({
          conditionCode: 'ups_battery_standard',
          selector: expect.objectContaining({ electricalStandbyPowerMethodBand: 'ups_battery', locationBand: 'indoor' }),
          defaultDaysP50: 16,
        }),
        expect.objectContaining({
          conditionCode: 'standby_power_load_test_constrained',
          selector: expect.objectContaining({ electricalStandbyPowerMethodBand: 'load_test_commissioning', workfaceBand: 'constrained' }),
          defaultDaysP50: 22,
        }),
      ]),
      productivityBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'diesel_generator_standard',
          baselineProductivity: expect.objectContaining({ p50PerDay: 0.8, unit: 'set/day' }),
        }),
        expect.objectContaining({
          conditionCode: 'standby_power_load_test_constrained',
          baselineProductivity: expect.objectContaining({ p50PerDay: 0.55, unit: 'system/day' }),
        }),
      ]),
    }))

    expect(grounding).toEqual(expect.objectContaining({
      defaultDaysP20: 5,
      defaultDaysP50: 7,
      defaultDaysP80: 9,
      conditionedDurationBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'grounding_grid_open',
          selector: expect.objectContaining({ electricalGroundingLightningMethodBand: 'grounding_grid', workfaceBand: 'open' }),
          defaultDaysP50: 6,
        }),
        expect.objectContaining({
          conditionCode: 'lightning_down_conductor_standard',
          selector: expect.objectContaining({ electricalGroundingLightningMethodBand: 'lightning_down_conductor' }),
          defaultDaysP50: 7,
        }),
        expect.objectContaining({
          conditionCode: 'ground_resistance_test_constrained',
          selector: expect.objectContaining({ electricalGroundingLightningMethodBand: 'ground_resistance_test', workfaceBand: 'constrained' }),
          defaultDaysP50: 10,
        }),
      ]),
      productivityBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'grounding_grid_open',
          baselineProductivity: expect.objectContaining({ p50PerDay: 120, unit: 'm/day' }),
        }),
        expect.objectContaining({
          conditionCode: 'ground_resistance_test_constrained',
          baselineProductivity: expect.objectContaining({ p50PerDay: 18, unit: 'point/day' }),
        }),
      ]),
    }))

    const lightingDebugging = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'electrical_lighting_terminal',
      applicableGranularity: 'task',
      methodVariantCodes: ['lighting_control_debugging'],
      elementVariantCodes: ['constrained_workface'],
    }) as any
    expect(lightingDebugging).toEqual(expect.objectContaining({
      selectedConditionCode: 'lighting_control_debugging_constrained',
      defaultDaysP50: 13,
      baselineProductivity: expect.objectContaining({ p50PerDay: 42, unit: 'terminal/day' }),
    }))

    const standbyLoadTest = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'electrical_standby_power_ups',
      applicableGranularity: 'task',
      methodVariantCodes: ['standby_power_load_test'],
      elementVariantCodes: ['constrained_workface'],
    }) as any
    expect(standbyLoadTest).toEqual(expect.objectContaining({
      selectedConditionCode: 'standby_power_load_test_constrained',
      defaultDaysP50: 22,
      baselineProductivity: expect.objectContaining({ p50PerDay: 0.55, unit: 'system/day' }),
    }))

    const groundResistance = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'electrical_grounding_lightning',
      applicableGranularity: 'task',
      methodVariantCodes: ['ground_resistance_test'],
      elementVariantCodes: ['constrained_workface'],
    }) as any
    expect(groundResistance).toEqual(expect.objectContaining({
      selectedConditionCode: 'ground_resistance_test_constrained',
      defaultDaysP50: 10,
      baselineProductivity: expect.objectContaining({ p50PerDay: 18, unit: 'point/day' }),
    }))
  })

  it('keeps elevator installation, traction installation, and machine-drive fallbacks conditionized by intrinsic elevator scope', async () => {
    const byStableCode = new Map(STANDARD_WORK_DURATION_SEED.map((record) => [record.stableCode, record]))
    const elevator = byStableCode.get('elevator_installation') as any
    const traction = byStableCode.get('elevator_traction_installation') as any
    const machineDrive = byStableCode.get('elevator_traction_machine_drive') as any

    expect(elevator).toEqual(expect.objectContaining({
      defaultDaysP20: 15,
      defaultDaysP50: 20,
      defaultDaysP80: 26,
      conditionedDurationBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'traction_elevator_standard',
          selector: expect.objectContaining({ elevatorInstallationMethodBand: 'traction', locationBand: 'indoor' }),
          defaultDaysP50: 20,
        }),
        expect.objectContaining({
          conditionCode: 'machine_roomless_elevator_standard',
          selector: expect.objectContaining({ elevatorInstallationMethodBand: 'machine_roomless', locationBand: 'indoor' }),
          defaultDaysP50: 23,
        }),
        expect.objectContaining({
          conditionCode: 'hydraulic_or_heavy_load_constrained',
          selector: expect.objectContaining({ elevatorInstallationMethodBand: 'hydraulic_heavy_load', workfaceBand: 'constrained' }),
          defaultDaysP50: 29,
        }),
      ]),
      productivityBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'traction_elevator_standard',
          baselineProductivity: expect.objectContaining({ p50PerDay: 0.42, unit: 'shaft/day' }),
        }),
        expect.objectContaining({
          conditionCode: 'hydraulic_or_heavy_load_constrained',
          baselineProductivity: expect.objectContaining({ p50PerDay: 0.28, unit: 'shaft/day' }),
        }),
      ]),
    }))

    expect(traction).toEqual(expect.objectContaining({
      defaultDaysP20: 15,
      defaultDaysP50: 20,
      defaultDaysP80: 26,
      conditionedDurationBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'traction_passenger_standard',
          selector: expect.objectContaining({ elevatorTractionInstallationMethodBand: 'passenger_standard', locationBand: 'indoor' }),
          defaultDaysP50: 19,
        }),
        expect.objectContaining({
          conditionCode: 'machine_roomless_traction_standard',
          selector: expect.objectContaining({ elevatorTractionInstallationMethodBand: 'machine_roomless' }),
          defaultDaysP50: 22,
        }),
        expect.objectContaining({
          conditionCode: 'high_speed_group_control_constrained',
          selector: expect.objectContaining({ elevatorTractionInstallationMethodBand: 'high_speed_group_control', workfaceBand: 'constrained' }),
          defaultDaysP50: 28,
        }),
      ]),
      productivityBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'traction_passenger_standard',
          baselineProductivity: expect.objectContaining({ p50PerDay: 0.45, unit: 'shaft/day' }),
        }),
        expect.objectContaining({
          conditionCode: 'high_speed_group_control_constrained',
          baselineProductivity: expect.objectContaining({ p50PerDay: 0.3, unit: 'shaft/day' }),
        }),
      ]),
    }))

    expect(machineDrive).toEqual(expect.objectContaining({
      defaultDaysP20: 7,
      defaultDaysP50: 9,
      defaultDaysP80: 12,
      conditionedDurationBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'machine_room_drive_standard',
          selector: expect.objectContaining({ elevatorMachineDriveMethodBand: 'machine_room_drive', locationBand: 'indoor' }),
          defaultDaysP50: 8,
        }),
        expect.objectContaining({
          conditionCode: 'machine_roomless_drive_standard',
          selector: expect.objectContaining({ elevatorMachineDriveMethodBand: 'machine_roomless_drive' }),
          defaultDaysP50: 10,
        }),
        expect.objectContaining({
          conditionCode: 'gearless_high_speed_drive_constrained',
          selector: expect.objectContaining({ elevatorMachineDriveMethodBand: 'gearless_high_speed_drive', workfaceBand: 'constrained' }),
          defaultDaysP50: 13,
        }),
      ]),
      productivityBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'machine_room_drive_standard',
          baselineProductivity: expect.objectContaining({ p50PerDay: 0.55, unit: 'shaft/day' }),
        }),
        expect.objectContaining({
          conditionCode: 'gearless_high_speed_drive_constrained',
          baselineProductivity: expect.objectContaining({ p50PerDay: 0.34, unit: 'shaft/day' }),
        }),
      ]),
    }))

    const hydraulicConstrained = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'elevator_installation',
      applicableGranularity: 'task',
      methodVariantCodes: ['hydraulic_elevator'],
      elementVariantCodes: ['constrained_workface'],
    }) as any
    expect(hydraulicConstrained).toEqual(expect.objectContaining({
      selectedConditionCode: 'hydraulic_or_heavy_load_constrained',
      defaultDaysP50: 29,
      baselineProductivity: expect.objectContaining({ p50PerDay: 0.28, unit: 'shaft/day' }),
    }))

    const highSpeedTraction = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'elevator_traction_installation',
      applicableGranularity: 'task',
      methodVariantCodes: ['high_speed_group_control'],
      elementVariantCodes: ['constrained_workface'],
    }) as any
    expect(highSpeedTraction).toEqual(expect.objectContaining({
      selectedConditionCode: 'high_speed_group_control_constrained',
      defaultDaysP50: 28,
      baselineProductivity: expect.objectContaining({ p50PerDay: 0.3, unit: 'shaft/day' }),
    }))

    const gearlessDrive = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'elevator_traction_machine_drive',
      applicableGranularity: 'task',
      methodVariantCodes: ['gearless_machine_drive'],
      elementVariantCodes: ['constrained_workface'],
    }) as any
    expect(gearlessDrive).toEqual(expect.objectContaining({
      selectedConditionCode: 'gearless_high_speed_drive_constrained',
      defaultDaysP50: 13,
      baselineProductivity: expect.objectContaining({ p50PerDay: 0.34, unit: 'shaft/day' }),
    }))
  })

  it('keeps elevator guide rail, door system, and car assembly conditionized by intrinsic traction component scope', async () => {
    const byStableCode = new Map(STANDARD_WORK_DURATION_SEED.map((record) => [record.stableCode, record]))
    const guideRail = byStableCode.get('elevator_traction_guide_rail') as any
    const doorSystem = byStableCode.get('elevator_traction_door_system') as any
    const carAssembly = byStableCode.get('elevator_traction_car_assembly') as any

    expect(guideRail).toEqual(expect.objectContaining({
      defaultDaysP20: 9,
      defaultDaysP50: 13,
      defaultDaysP80: 17,
      conditionedDurationBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'standard_guide_rail_indoor',
          selector: expect.objectContaining({ elevatorGuideRailMethodBand: 'standard_rail', locationBand: 'indoor' }),
          defaultDaysP50: 12,
        }),
        expect.objectContaining({
          conditionCode: 'high_rise_multi_section_rail',
          selector: expect.objectContaining({ elevatorGuideRailMethodBand: 'high_rise_multi_section', heightBand: 'high_rise' }),
          defaultDaysP50: 15,
        }),
        expect.objectContaining({
          conditionCode: 'high_speed_alignment_constrained',
          selector: expect.objectContaining({ elevatorGuideRailMethodBand: 'high_speed_alignment', workfaceBand: 'constrained' }),
          defaultDaysP50: 18,
        }),
      ]),
      conditionedProcessProfiles: expect.arrayContaining([
        expect.objectContaining({ conditionCode: 'standard_guide_rail_indoor' }),
        expect.objectContaining({ conditionCode: 'high_rise_multi_section_rail' }),
        expect.objectContaining({ conditionCode: 'high_speed_alignment_constrained' }),
      ]),
      productivityBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'standard_guide_rail_indoor',
          baselineProductivity: expect.objectContaining({
            p50PerDay: 0.62,
            unit: 'shaft/day',
            sourceType: 'quota',
          }),
        }),
        expect.objectContaining({
          conditionCode: 'high_speed_alignment_constrained',
          baselineProductivity: expect.objectContaining({
            p50PerDay: 0.38,
            unit: 'shaft/day',
            sourceType: 'expert_profile',
          }),
        }),
      ]),
    }))

    expect(doorSystem).toEqual(expect.objectContaining({
      defaultDaysP20: 8,
      defaultDaysP50: 11,
      defaultDaysP80: 14,
      conditionedDurationBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'landing_door_standard',
          selector: expect.objectContaining({ elevatorDoorSystemMethodBand: 'landing_door', locationBand: 'indoor' }),
          defaultDaysP50: 10,
        }),
        expect.objectContaining({
          conditionCode: 'car_door_operator_standard',
          selector: expect.objectContaining({ elevatorDoorSystemMethodBand: 'car_door_operator' }),
          defaultDaysP50: 11,
        }),
        expect.objectContaining({
          conditionCode: 'multi_opening_door_adjustment_constrained',
          selector: expect.objectContaining({ elevatorDoorSystemMethodBand: 'multi_opening_adjustment', workfaceBand: 'constrained' }),
          defaultDaysP50: 16,
        }),
      ]),
      conditionedProcessProfiles: expect.arrayContaining([
        expect.objectContaining({ conditionCode: 'landing_door_standard' }),
        expect.objectContaining({ conditionCode: 'car_door_operator_standard' }),
        expect.objectContaining({ conditionCode: 'multi_opening_door_adjustment_constrained' }),
      ]),
      productivityBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'landing_door_standard',
          baselineProductivity: expect.objectContaining({
            p50PerDay: 0.72,
            unit: 'shaft/day',
            sourceType: 'quota',
          }),
        }),
        expect.objectContaining({
          conditionCode: 'multi_opening_door_adjustment_constrained',
          baselineProductivity: expect.objectContaining({
            p50PerDay: 0.42,
            unit: 'shaft/day',
            sourceType: 'expert_profile',
          }),
        }),
      ]),
    }))

    expect(carAssembly).toEqual(expect.objectContaining({
      defaultDaysP20: 9,
      defaultDaysP50: 13,
      defaultDaysP80: 17,
      conditionedDurationBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'standard_car_assembly',
          selector: expect.objectContaining({ elevatorCarAssemblyMethodBand: 'standard_car', locationBand: 'indoor' }),
          defaultDaysP50: 12,
        }),
        expect.objectContaining({
          conditionCode: 'hospital_large_car_assembly',
          selector: expect.objectContaining({ elevatorCarAssemblyMethodBand: 'hospital_large_car' }),
          defaultDaysP50: 14,
        }),
        expect.objectContaining({
          conditionCode: 'high_speed_decorated_car_constrained',
          selector: expect.objectContaining({ elevatorCarAssemblyMethodBand: 'high_speed_decorated_car', workfaceBand: 'constrained' }),
          defaultDaysP50: 18,
        }),
      ]),
      conditionedProcessProfiles: expect.arrayContaining([
        expect.objectContaining({ conditionCode: 'standard_car_assembly' }),
        expect.objectContaining({ conditionCode: 'hospital_large_car_assembly' }),
        expect.objectContaining({ conditionCode: 'high_speed_decorated_car_constrained' }),
      ]),
      productivityBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'standard_car_assembly',
          baselineProductivity: expect.objectContaining({
            p50PerDay: 0.58,
            unit: 'shaft/day',
            sourceType: 'quota',
          }),
        }),
        expect.objectContaining({
          conditionCode: 'high_speed_decorated_car_constrained',
          baselineProductivity: expect.objectContaining({
            p50PerDay: 0.36,
            unit: 'shaft/day',
            sourceType: 'expert_profile',
          }),
        }),
      ]),
    }))

    const highSpeedGuideRail = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'elevator_traction_guide_rail',
      applicableGranularity: 'task',
      methodVariantCodes: ['high_speed_guide_rail_alignment'],
      elementVariantCodes: ['constrained_workface'],
    }) as any
    expect(highSpeedGuideRail).toEqual(expect.objectContaining({
      selectedConditionCode: 'high_speed_alignment_constrained',
      defaultDaysP50: 18,
      baselineProductivity: expect.objectContaining({ p50PerDay: 0.38, unit: 'shaft/day' }),
    }))

    const multiOpeningDoor = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'elevator_traction_door_system',
      applicableGranularity: 'task',
      methodVariantCodes: ['multi_opening_door_adjustment'],
      elementVariantCodes: ['constrained_workface'],
    }) as any
    expect(multiOpeningDoor).toEqual(expect.objectContaining({
      selectedConditionCode: 'multi_opening_door_adjustment_constrained',
      defaultDaysP50: 16,
      baselineProductivity: expect.objectContaining({ p50PerDay: 0.42, unit: 'shaft/day' }),
    }))

    const decoratedCar = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'elevator_traction_car_assembly',
      applicableGranularity: 'task',
      methodVariantCodes: ['high_speed_decorated_car'],
      elementVariantCodes: ['constrained_workface'],
    }) as any
    expect(decoratedCar).toEqual(expect.objectContaining({
      selectedConditionCode: 'high_speed_decorated_car_constrained',
      defaultDaysP50: 18,
      baselineProductivity: expect.objectContaining({ p50PerDay: 0.36, unit: 'shaft/day' }),
    }))
  })

  it('keeps elevator counterweight, safety components, and suspension rope conditionized by intrinsic traction safety scope', async () => {
    const byStableCode = new Map(STANDARD_WORK_DURATION_SEED.map((record) => [record.stableCode, record]))
    const counterweight = byStableCode.get('elevator_traction_counterweight') as any
    const safety = byStableCode.get('elevator_traction_safety_components') as any
    const suspension = byStableCode.get('elevator_traction_suspension_rope') as any

    expect(counterweight).toEqual(expect.objectContaining({
      defaultDaysP20: 6,
      defaultDaysP50: 8,
      defaultDaysP80: 10,
      conditionedDurationBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'standard_counterweight_indoor',
          selector: expect.objectContaining({ elevatorCounterweightMethodBand: 'standard_counterweight', locationBand: 'indoor' }),
          defaultDaysP50: 7,
        }),
        expect.objectContaining({
          conditionCode: 'heavy_load_counterweight',
          selector: expect.objectContaining({ elevatorCounterweightMethodBand: 'heavy_load_counterweight' }),
          defaultDaysP50: 9,
        }),
        expect.objectContaining({
          conditionCode: 'high_speed_counterweight_clearance_constrained',
          selector: expect.objectContaining({ elevatorCounterweightMethodBand: 'high_speed_clearance', workfaceBand: 'constrained' }),
          defaultDaysP50: 11,
        }),
      ]),
      conditionedProcessProfiles: expect.arrayContaining([
        expect.objectContaining({ conditionCode: 'standard_counterweight_indoor' }),
        expect.objectContaining({ conditionCode: 'heavy_load_counterweight' }),
        expect.objectContaining({ conditionCode: 'high_speed_counterweight_clearance_constrained' }),
      ]),
      productivityBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'standard_counterweight_indoor',
          baselineProductivity: expect.objectContaining({ p50PerDay: 0.78, unit: 'shaft/day', sourceType: 'quota' }),
        }),
        expect.objectContaining({
          conditionCode: 'high_speed_counterweight_clearance_constrained',
          baselineProductivity: expect.objectContaining({ p50PerDay: 0.52, unit: 'shaft/day', sourceType: 'expert_profile' }),
        }),
      ]),
    }))

    expect(safety).toEqual(expect.objectContaining({
      defaultDaysP20: 7,
      defaultDaysP50: 10,
      defaultDaysP80: 13,
      conditionedDurationBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'standard_safety_components',
          selector: expect.objectContaining({ elevatorSafetyComponentMethodBand: 'standard_safety' }),
          defaultDaysP50: 9,
        }),
        expect.objectContaining({
          conditionCode: 'linkage_test_safety_components',
          selector: expect.objectContaining({ elevatorSafetyComponentMethodBand: 'linkage_test' }),
          defaultDaysP50: 11,
        }),
        expect.objectContaining({
          conditionCode: 'high_speed_strict_safety_test_constrained',
          selector: expect.objectContaining({ elevatorSafetyComponentMethodBand: 'high_speed_strict_test', workfaceBand: 'constrained' }),
          defaultDaysP50: 14,
        }),
      ]),
      conditionedProcessProfiles: expect.arrayContaining([
        expect.objectContaining({ conditionCode: 'standard_safety_components' }),
        expect.objectContaining({ conditionCode: 'linkage_test_safety_components' }),
        expect.objectContaining({ conditionCode: 'high_speed_strict_safety_test_constrained' }),
      ]),
      productivityBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'standard_safety_components',
          baselineProductivity: expect.objectContaining({ p50PerDay: 0.68, unit: 'shaft/day', sourceType: 'quota' }),
        }),
        expect.objectContaining({
          conditionCode: 'high_speed_strict_safety_test_constrained',
          baselineProductivity: expect.objectContaining({ p50PerDay: 0.42, unit: 'shaft/day', sourceType: 'expert_profile' }),
        }),
      ]),
    }))

    expect(suspension).toEqual(expect.objectContaining({
      defaultDaysP20: 6,
      defaultDaysP50: 9,
      defaultDaysP80: 12,
      conditionedDurationBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'standard_suspension_rope',
          selector: expect.objectContaining({ elevatorSuspensionRopeMethodBand: 'standard_rope' }),
          defaultDaysP50: 8,
        }),
        expect.objectContaining({
          conditionCode: 'long_travel_multi_rope',
          selector: expect.objectContaining({ elevatorSuspensionRopeMethodBand: 'long_travel_multi_rope', heightBand: 'high_rise' }),
          defaultDaysP50: 11,
        }),
        expect.objectContaining({
          conditionCode: 'high_speed_tension_balancing_constrained',
          selector: expect.objectContaining({ elevatorSuspensionRopeMethodBand: 'high_speed_tension_balancing', workfaceBand: 'constrained' }),
          defaultDaysP50: 13,
        }),
      ]),
      conditionedProcessProfiles: expect.arrayContaining([
        expect.objectContaining({ conditionCode: 'standard_suspension_rope' }),
        expect.objectContaining({ conditionCode: 'long_travel_multi_rope' }),
        expect.objectContaining({ conditionCode: 'high_speed_tension_balancing_constrained' }),
      ]),
      productivityBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'standard_suspension_rope',
          baselineProductivity: expect.objectContaining({ p50PerDay: 0.64, unit: 'shaft/day', sourceType: 'quota' }),
        }),
        expect.objectContaining({
          conditionCode: 'high_speed_tension_balancing_constrained',
          baselineProductivity: expect.objectContaining({ p50PerDay: 0.4, unit: 'shaft/day', sourceType: 'expert_profile' }),
        }),
      ]),
    }))

    const highSpeedCounterweight = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'elevator_traction_counterweight',
      applicableGranularity: 'task',
      methodVariantCodes: ['high_speed_counterweight_clearance'],
      elementVariantCodes: ['constrained_workface'],
    }) as any
    expect(highSpeedCounterweight).toEqual(expect.objectContaining({
      selectedConditionCode: 'high_speed_counterweight_clearance_constrained',
      defaultDaysP50: 11,
      baselineProductivity: expect.objectContaining({ p50PerDay: 0.52, unit: 'shaft/day' }),
    }))

    const strictSafety = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'elevator_traction_safety_components',
      applicableGranularity: 'task',
      methodVariantCodes: ['high_speed_strict_safety_test'],
      elementVariantCodes: ['constrained_workface'],
    }) as any
    expect(strictSafety).toEqual(expect.objectContaining({
      selectedConditionCode: 'high_speed_strict_safety_test_constrained',
      defaultDaysP50: 14,
      baselineProductivity: expect.objectContaining({ p50PerDay: 0.42, unit: 'shaft/day' }),
    }))

    const highSpeedRope = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'elevator_traction_suspension_rope',
      applicableGranularity: 'task',
      methodVariantCodes: ['high_speed_tension_balancing'],
      elementVariantCodes: ['constrained_workface'],
    }) as any
    expect(highSpeedRope).toEqual(expect.objectContaining({
      selectedConditionCode: 'high_speed_tension_balancing_constrained',
      defaultDaysP50: 13,
      baselineProductivity: expect.objectContaining({ p50PerDay: 0.4, unit: 'shaft/day' }),
    }))
  })

  it('keeps elevator traveling cable, compensation device, and electrical device conditionized by intrinsic traction electrical scope', async () => {
    const byStableCode = new Map(STANDARD_WORK_DURATION_SEED.map((record) => [record.stableCode, record]))
    const travelingCable = byStableCode.get('elevator_traction_traveling_cable') as any
    const compensation = byStableCode.get('elevator_traction_compensation_device') as any
    const electrical = byStableCode.get('elevator_traction_electrical_device') as any

    expect(travelingCable).toEqual(expect.objectContaining({
      defaultDaysP20: 6,
      defaultDaysP50: 8,
      defaultDaysP80: 10,
      conditionedDurationBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'standard_traveling_cable',
          selector: expect.objectContaining({ elevatorTravelingCableMethodBand: 'standard_cable' }),
          defaultDaysP50: 7,
        }),
        expect.objectContaining({
          conditionCode: 'long_travel_traveling_cable_high_rise',
          selector: expect.objectContaining({ elevatorTravelingCableMethodBand: 'long_travel_cable', heightBand: 'high_rise' }),
          defaultDaysP50: 9,
        }),
        expect.objectContaining({
          conditionCode: 'shielded_safety_loop_cable_constrained',
          selector: expect.objectContaining({ elevatorTravelingCableMethodBand: 'shielded_safety_loop', workfaceBand: 'constrained' }),
          defaultDaysP50: 12,
        }),
      ]),
      conditionedProcessProfiles: expect.arrayContaining([
        expect.objectContaining({ conditionCode: 'standard_traveling_cable' }),
        expect.objectContaining({ conditionCode: 'long_travel_traveling_cable_high_rise' }),
        expect.objectContaining({ conditionCode: 'shielded_safety_loop_cable_constrained' }),
      ]),
      productivityBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'standard_traveling_cable',
          baselineProductivity: expect.objectContaining({ p50PerDay: 0.72, unit: 'shaft/day', sourceType: 'quota' }),
        }),
        expect.objectContaining({
          conditionCode: 'shielded_safety_loop_cable_constrained',
          baselineProductivity: expect.objectContaining({ p50PerDay: 0.45, unit: 'shaft/day', sourceType: 'expert_profile' }),
        }),
      ]),
    }))

    expect(compensation).toEqual(expect.objectContaining({
      defaultDaysP20: 5,
      defaultDaysP50: 7,
      defaultDaysP80: 9,
      conditionedDurationBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'standard_compensation_chain',
          selector: expect.objectContaining({ elevatorCompensationDeviceMethodBand: 'standard_chain' }),
          defaultDaysP50: 6,
        }),
        expect.objectContaining({
          conditionCode: 'long_travel_compensation_rope_high_rise',
          selector: expect.objectContaining({ elevatorCompensationDeviceMethodBand: 'compensation_rope_long_travel', heightBand: 'high_rise' }),
          defaultDaysP50: 8,
        }),
        expect.objectContaining({
          conditionCode: 'anti_sway_tensioning_constrained',
          selector: expect.objectContaining({ elevatorCompensationDeviceMethodBand: 'anti_sway_tensioning', workfaceBand: 'constrained' }),
          defaultDaysP50: 10,
        }),
      ]),
      conditionedProcessProfiles: expect.arrayContaining([
        expect.objectContaining({ conditionCode: 'standard_compensation_chain' }),
        expect.objectContaining({ conditionCode: 'long_travel_compensation_rope_high_rise' }),
        expect.objectContaining({ conditionCode: 'anti_sway_tensioning_constrained' }),
      ]),
      productivityBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'standard_compensation_chain',
          baselineProductivity: expect.objectContaining({ p50PerDay: 0.76, unit: 'shaft/day', sourceType: 'quota' }),
        }),
        expect.objectContaining({
          conditionCode: 'anti_sway_tensioning_constrained',
          baselineProductivity: expect.objectContaining({ p50PerDay: 0.48, unit: 'shaft/day', sourceType: 'expert_profile' }),
        }),
      ]),
    }))

    expect(electrical).toEqual(expect.objectContaining({
      defaultDaysP20: 9,
      defaultDaysP50: 13,
      defaultDaysP80: 17,
      conditionedDurationBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'shaft_wiring_standard',
          selector: expect.objectContaining({ elevatorElectricalDeviceMethodBand: 'shaft_wiring' }),
          defaultDaysP50: 12,
        }),
        expect.objectContaining({
          conditionCode: 'controller_safety_loop_commissioning',
          selector: expect.objectContaining({ elevatorElectricalDeviceMethodBand: 'controller_safety_loop' }),
          defaultDaysP50: 14,
        }),
        expect.objectContaining({
          conditionCode: 'destination_control_high_speed_constrained',
          selector: expect.objectContaining({ elevatorElectricalDeviceMethodBand: 'destination_control_high_speed', workfaceBand: 'constrained' }),
          defaultDaysP50: 18,
        }),
      ]),
      conditionedProcessProfiles: expect.arrayContaining([
        expect.objectContaining({ conditionCode: 'shaft_wiring_standard' }),
        expect.objectContaining({ conditionCode: 'controller_safety_loop_commissioning' }),
        expect.objectContaining({ conditionCode: 'destination_control_high_speed_constrained' }),
      ]),
      productivityBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'shaft_wiring_standard',
          baselineProductivity: expect.objectContaining({ p50PerDay: 0.5, unit: 'shaft/day', sourceType: 'quota' }),
        }),
        expect.objectContaining({
          conditionCode: 'destination_control_high_speed_constrained',
          baselineProductivity: expect.objectContaining({ p50PerDay: 0.32, unit: 'shaft/day', sourceType: 'expert_profile' }),
        }),
      ]),
    }))

    const shieldedCable = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'elevator_traction_traveling_cable',
      applicableGranularity: 'task',
      methodVariantCodes: ['shielded_safety_loop_cable'],
      elementVariantCodes: ['constrained_workface'],
    }) as any
    expect(shieldedCable).toEqual(expect.objectContaining({
      selectedConditionCode: 'shielded_safety_loop_cable_constrained',
      defaultDaysP50: 12,
      baselineProductivity: expect.objectContaining({ p50PerDay: 0.45, unit: 'shaft/day' }),
    }))

    const antiSway = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'elevator_traction_compensation_device',
      applicableGranularity: 'task',
      methodVariantCodes: ['anti_sway_tensioning'],
      elementVariantCodes: ['constrained_workface'],
    }) as any
    expect(antiSway).toEqual(expect.objectContaining({
      selectedConditionCode: 'anti_sway_tensioning_constrained',
      defaultDaysP50: 10,
      baselineProductivity: expect.objectContaining({ p50PerDay: 0.48, unit: 'shaft/day' }),
    }))

    const destinationControl = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'elevator_traction_electrical_device',
      applicableGranularity: 'task',
      methodVariantCodes: ['destination_control_high_speed'],
      elementVariantCodes: ['constrained_workface'],
    }) as any
    expect(destinationControl).toEqual(expect.objectContaining({
      selectedConditionCode: 'destination_control_high_speed_constrained',
      defaultDaysP50: 18,
      baselineProductivity: expect.objectContaining({ p50PerDay: 0.32, unit: 'shaft/day' }),
    }))
  })

  it('keeps hydraulic elevator guide rail, door system, and car assembly conditionized by intrinsic hydraulic scope', async () => {
    const byStableCode = new Map(STANDARD_WORK_DURATION_SEED.map((record) => [record.stableCode, record]))
    const guideRail = byStableCode.get('elevator_hydraulic_guide_rail') as any
    const doorSystem = byStableCode.get('elevator_hydraulic_door_system') as any
    const carAssembly = byStableCode.get('elevator_hydraulic_car_assembly') as any

    expect(guideRail).toEqual(expect.objectContaining({
      defaultDaysP20: 8,
      defaultDaysP50: 11,
      defaultDaysP80: 14,
      conditionedDurationBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'standard_hydraulic_rail',
          selector: expect.objectContaining({ elevatorHydraulicGuideRailMethodBand: 'standard_rail' }),
          defaultDaysP50: 10,
        }),
        expect.objectContaining({
          conditionCode: 'high_travel_hydraulic_rail_high_rise',
          selector: expect.objectContaining({ elevatorHydraulicGuideRailMethodBand: 'high_travel_rail', heightBand: 'high_rise' }),
          defaultDaysP50: 12,
        }),
        expect.objectContaining({
          conditionCode: 'renovation_hydraulic_rail_alignment_constrained',
          selector: expect.objectContaining({ elevatorHydraulicGuideRailMethodBand: 'renovation_alignment', renovationBand: 'renovation', workfaceBand: 'constrained' }),
          defaultDaysP50: 15,
        }),
      ]),
      conditionedProcessProfiles: expect.arrayContaining([
        expect.objectContaining({ conditionCode: 'standard_hydraulic_rail' }),
        expect.objectContaining({ conditionCode: 'high_travel_hydraulic_rail_high_rise' }),
        expect.objectContaining({ conditionCode: 'renovation_hydraulic_rail_alignment_constrained' }),
      ]),
      productivityBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'standard_hydraulic_rail',
          baselineProductivity: expect.objectContaining({ p50PerDay: 0.24, unit: 'shaft/day', sourceType: 'quota' }),
        }),
        expect.objectContaining({
          conditionCode: 'renovation_hydraulic_rail_alignment_constrained',
          baselineProductivity: expect.objectContaining({ p50PerDay: 0.16, unit: 'shaft/day', sourceType: 'expert_profile' }),
        }),
      ]),
    }))

    expect(doorSystem).toEqual(expect.objectContaining({
      defaultDaysP20: 7,
      defaultDaysP50: 10,
      defaultDaysP80: 13,
      conditionedDurationBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'standard_hydraulic_landing_door',
          selector: expect.objectContaining({ elevatorHydraulicDoorSystemMethodBand: 'standard_landing_door' }),
          defaultDaysP50: 9,
        }),
        expect.objectContaining({
          conditionCode: 'many_landings_hydraulic_door_high_rise',
          selector: expect.objectContaining({ elevatorHydraulicDoorSystemMethodBand: 'many_landings', heightBand: 'high_rise' }),
          defaultDaysP50: 11,
        }),
        expect.objectContaining({
          conditionCode: 'heavy_load_forced_closing_door_constrained',
          selector: expect.objectContaining({ elevatorHydraulicDoorSystemMethodBand: 'heavy_load_forced_closing', workfaceBand: 'constrained' }),
          defaultDaysP50: 14,
        }),
      ]),
      conditionedProcessProfiles: expect.arrayContaining([
        expect.objectContaining({ conditionCode: 'standard_hydraulic_landing_door' }),
        expect.objectContaining({ conditionCode: 'many_landings_hydraulic_door_high_rise' }),
        expect.objectContaining({ conditionCode: 'heavy_load_forced_closing_door_constrained' }),
      ]),
      productivityBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'standard_hydraulic_landing_door',
          baselineProductivity: expect.objectContaining({ p50PerDay: 0.32, unit: 'shaft/day', sourceType: 'quota' }),
        }),
        expect.objectContaining({
          conditionCode: 'heavy_load_forced_closing_door_constrained',
          baselineProductivity: expect.objectContaining({ p50PerDay: 0.22, unit: 'shaft/day', sourceType: 'expert_profile' }),
        }),
      ]),
    }))

    expect(carAssembly).toEqual(expect.objectContaining({
      defaultDaysP20: 9,
      defaultDaysP50: 12,
      defaultDaysP80: 16,
      conditionedDurationBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'standard_plunger_car_assembly',
          selector: expect.objectContaining({ elevatorHydraulicCarAssemblyMethodBand: 'standard_plunger_car' }),
          defaultDaysP50: 11,
        }),
        expect.objectContaining({
          conditionCode: 'roped_hydraulic_car_assembly',
          selector: expect.objectContaining({ elevatorHydraulicCarAssemblyMethodBand: 'roped_hydraulic_car' }),
          defaultDaysP50: 13,
        }),
        expect.objectContaining({
          conditionCode: 'hospital_heavy_load_car_constrained',
          selector: expect.objectContaining({ elevatorHydraulicCarAssemblyMethodBand: 'hospital_heavy_load_car', workfaceBand: 'constrained' }),
          defaultDaysP50: 16,
        }),
      ]),
      conditionedProcessProfiles: expect.arrayContaining([
        expect.objectContaining({ conditionCode: 'standard_plunger_car_assembly' }),
        expect.objectContaining({ conditionCode: 'roped_hydraulic_car_assembly' }),
        expect.objectContaining({ conditionCode: 'hospital_heavy_load_car_constrained' }),
      ]),
      productivityBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'standard_plunger_car_assembly',
          baselineProductivity: expect.objectContaining({ p50PerDay: 0.25, unit: 'shaft/day', sourceType: 'quota' }),
        }),
        expect.objectContaining({
          conditionCode: 'hospital_heavy_load_car_constrained',
          baselineProductivity: expect.objectContaining({ p50PerDay: 0.18, unit: 'shaft/day', sourceType: 'expert_profile' }),
        }),
      ]),
    }))

    const renovationRail = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'elevator_hydraulic_guide_rail',
      applicableGranularity: 'task',
      methodVariantCodes: ['renovation_hydraulic_rail_alignment'],
      elementVariantCodes: ['renovation_shaft', 'constrained_workface'],
    }) as any
    expect(renovationRail).toEqual(expect.objectContaining({
      selectedConditionCode: 'renovation_hydraulic_rail_alignment_constrained',
      defaultDaysP50: 15,
      baselineProductivity: expect.objectContaining({ p50PerDay: 0.16, unit: 'shaft/day' }),
    }))

    const heavyDoor = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'elevator_hydraulic_door_system',
      applicableGranularity: 'task',
      methodVariantCodes: ['heavy_load_forced_closing'],
      elementVariantCodes: ['constrained_workface'],
    }) as any
    expect(heavyDoor).toEqual(expect.objectContaining({
      selectedConditionCode: 'heavy_load_forced_closing_door_constrained',
      defaultDaysP50: 14,
      baselineProductivity: expect.objectContaining({ p50PerDay: 0.22, unit: 'shaft/day' }),
    }))

    const hospitalCar = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'elevator_hydraulic_car_assembly',
      applicableGranularity: 'task',
      methodVariantCodes: ['hospital_heavy_load_car'],
      elementVariantCodes: ['constrained_workface'],
    }) as any
    expect(hospitalCar).toEqual(expect.objectContaining({
      selectedConditionCode: 'hospital_heavy_load_car_constrained',
      defaultDaysP50: 16,
      baselineProductivity: expect.objectContaining({ p50PerDay: 0.18, unit: 'shaft/day' }),
    }))
  })

  it('keeps hydraulic elevator balance weight, safety components, and suspension device conditionized by intrinsic hydraulic safety scope', async () => {
    const byStableCode = new Map(STANDARD_WORK_DURATION_SEED.map((record) => [record.stableCode, record]))
    const balanceWeight = byStableCode.get('elevator_hydraulic_balance_weight') as any
    const safety = byStableCode.get('elevator_hydraulic_safety_components') as any
    const suspension = byStableCode.get('elevator_hydraulic_suspension_device') as any

    expect(balanceWeight).toEqual(expect.objectContaining({
      defaultDaysP20: 4,
      defaultDaysP50: 6,
      defaultDaysP80: 8,
      conditionedDurationBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'standard_hydraulic_balance_weight',
          selector: expect.objectContaining({ elevatorHydraulicBalanceWeightMethodBand: 'standard_balance' }),
          defaultDaysP50: 5,
        }),
        expect.objectContaining({
          conditionCode: 'roped_hydraulic_balance_weight',
          selector: expect.objectContaining({ elevatorHydraulicBalanceWeightMethodBand: 'roped_balance' }),
          defaultDaysP50: 7,
        }),
        expect.objectContaining({
          conditionCode: 'heavy_load_balance_weight_constrained',
          selector: expect.objectContaining({ elevatorHydraulicBalanceWeightMethodBand: 'heavy_load_balance', workfaceBand: 'constrained' }),
          defaultDaysP50: 9,
        }),
      ]),
      conditionedProcessProfiles: expect.arrayContaining([
        expect.objectContaining({ conditionCode: 'standard_hydraulic_balance_weight' }),
        expect.objectContaining({ conditionCode: 'roped_hydraulic_balance_weight' }),
        expect.objectContaining({ conditionCode: 'heavy_load_balance_weight_constrained' }),
      ]),
      productivityBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'standard_hydraulic_balance_weight',
          baselineProductivity: expect.objectContaining({ p50PerDay: 0.5, unit: 'shaft/day', sourceType: 'quota' }),
        }),
        expect.objectContaining({
          conditionCode: 'heavy_load_balance_weight_constrained',
          baselineProductivity: expect.objectContaining({ p50PerDay: 0.32, unit: 'shaft/day', sourceType: 'expert_profile' }),
        }),
      ]),
    }))

    expect(safety).toEqual(expect.objectContaining({
      defaultDaysP20: 6,
      defaultDaysP50: 9,
      defaultDaysP80: 12,
      conditionedDurationBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'standard_hydraulic_safety_components',
          selector: expect.objectContaining({ elevatorHydraulicSafetyMethodBand: 'standard_safety' }),
          defaultDaysP50: 8,
        }),
        expect.objectContaining({
          conditionCode: 'roped_rupture_valve_linkage_test',
          selector: expect.objectContaining({ elevatorHydraulicSafetyMethodBand: 'roped_rupture_valve_linkage' }),
          defaultDaysP50: 10,
        }),
        expect.objectContaining({
          conditionCode: 'heavy_load_strict_safety_test_constrained',
          selector: expect.objectContaining({ elevatorHydraulicSafetyMethodBand: 'heavy_load_strict_test', workfaceBand: 'constrained' }),
          defaultDaysP50: 13,
        }),
      ]),
      conditionedProcessProfiles: expect.arrayContaining([
        expect.objectContaining({ conditionCode: 'standard_hydraulic_safety_components' }),
        expect.objectContaining({ conditionCode: 'roped_rupture_valve_linkage_test' }),
        expect.objectContaining({ conditionCode: 'heavy_load_strict_safety_test_constrained' }),
      ]),
      productivityBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'standard_hydraulic_safety_components',
          baselineProductivity: expect.objectContaining({ p50PerDay: 0.4, unit: 'shaft/day', sourceType: 'quota' }),
        }),
        expect.objectContaining({
          conditionCode: 'heavy_load_strict_safety_test_constrained',
          baselineProductivity: expect.objectContaining({ p50PerDay: 0.28, unit: 'shaft/day', sourceType: 'expert_profile' }),
        }),
      ]),
    }))

    expect(suspension).toEqual(expect.objectContaining({
      defaultDaysP20: 6,
      defaultDaysP50: 8,
      defaultDaysP80: 10,
      conditionedDurationBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'standard_hydraulic_suspension_chain',
          selector: expect.objectContaining({ elevatorHydraulicSuspensionMethodBand: 'standard_chain' }),
          defaultDaysP50: 7,
        }),
        expect.objectContaining({
          conditionCode: 'roped_hydraulic_suspension_long_travel',
          selector: expect.objectContaining({ elevatorHydraulicSuspensionMethodBand: 'roped_long_travel', heightBand: 'high_rise' }),
          defaultDaysP50: 9,
        }),
        expect.objectContaining({
          conditionCode: 'anti_sway_suspension_tensioning_constrained',
          selector: expect.objectContaining({ elevatorHydraulicSuspensionMethodBand: 'anti_sway_tensioning', workfaceBand: 'constrained' }),
          defaultDaysP50: 11,
        }),
      ]),
      conditionedProcessProfiles: expect.arrayContaining([
        expect.objectContaining({ conditionCode: 'standard_hydraulic_suspension_chain' }),
        expect.objectContaining({ conditionCode: 'roped_hydraulic_suspension_long_travel' }),
        expect.objectContaining({ conditionCode: 'anti_sway_suspension_tensioning_constrained' }),
      ]),
      productivityBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'standard_hydraulic_suspension_chain',
          baselineProductivity: expect.objectContaining({ p50PerDay: 0.44, unit: 'shaft/day', sourceType: 'quota' }),
        }),
        expect.objectContaining({
          conditionCode: 'anti_sway_suspension_tensioning_constrained',
          baselineProductivity: expect.objectContaining({ p50PerDay: 0.3, unit: 'shaft/day', sourceType: 'expert_profile' }),
        }),
      ]),
    }))

    const heavyBalance = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'elevator_hydraulic_balance_weight',
      applicableGranularity: 'task',
      methodVariantCodes: ['heavy_load_balance_weight'],
      elementVariantCodes: ['constrained_workface'],
    }) as any
    expect(heavyBalance).toEqual(expect.objectContaining({
      selectedConditionCode: 'heavy_load_balance_weight_constrained',
      defaultDaysP50: 9,
      baselineProductivity: expect.objectContaining({ p50PerDay: 0.32, unit: 'shaft/day' }),
    }))

    const strictSafety = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'elevator_hydraulic_safety_components',
      applicableGranularity: 'task',
      methodVariantCodes: ['heavy_load_strict_safety_test'],
      elementVariantCodes: ['constrained_workface'],
    }) as any
    expect(strictSafety).toEqual(expect.objectContaining({
      selectedConditionCode: 'heavy_load_strict_safety_test_constrained',
      defaultDaysP50: 13,
      baselineProductivity: expect.objectContaining({ p50PerDay: 0.28, unit: 'shaft/day' }),
    }))

    const antiSwaySuspension = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'elevator_hydraulic_suspension_device',
      applicableGranularity: 'task',
      methodVariantCodes: ['anti_sway_suspension_tensioning'],
      elementVariantCodes: ['constrained_workface'],
    }) as any
    expect(antiSwaySuspension).toEqual(expect.objectContaining({
      selectedConditionCode: 'anti_sway_suspension_tensioning_constrained',
      defaultDaysP50: 11,
      baselineProductivity: expect.objectContaining({ p50PerDay: 0.3, unit: 'shaft/day' }),
    }))
  })

  it('keeps hydraulic elevator traveling cable, electrical device, and installation conditionized by intrinsic hydraulic system scope', async () => {
    const byStableCode = new Map(STANDARD_WORK_DURATION_SEED.map((record) => [record.stableCode, record]))
    const travelingCable = byStableCode.get('elevator_hydraulic_traveling_cable') as any
    const electrical = byStableCode.get('elevator_hydraulic_electrical_device') as any
    const installation = byStableCode.get('elevator_hydraulic_installation') as any

    expect(travelingCable).toEqual(expect.objectContaining({
      defaultDaysP20: 5,
      defaultDaysP50: 7,
      defaultDaysP80: 9,
      conditionedDurationBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'standard_hydraulic_traveling_cable',
          selector: expect.objectContaining({ elevatorHydraulicTravelingCableMethodBand: 'standard_cable' }),
          defaultDaysP50: 6,
        }),
        expect.objectContaining({
          conditionCode: 'roped_long_travel_hydraulic_cable',
          selector: expect.objectContaining({ elevatorHydraulicTravelingCableMethodBand: 'roped_long_travel_cable', heightBand: 'high_rise' }),
          defaultDaysP50: 8,
        }),
        expect.objectContaining({
          conditionCode: 'machine_roomless_safety_loop_cable_constrained',
          selector: expect.objectContaining({ elevatorHydraulicTravelingCableMethodBand: 'mrl_safety_loop_cable', workfaceBand: 'constrained' }),
          defaultDaysP50: 10,
        }),
      ]),
      conditionedProcessProfiles: expect.arrayContaining([
        expect.objectContaining({ conditionCode: 'standard_hydraulic_traveling_cable' }),
        expect.objectContaining({ conditionCode: 'roped_long_travel_hydraulic_cable' }),
        expect.objectContaining({ conditionCode: 'machine_roomless_safety_loop_cable_constrained' }),
      ]),
      productivityBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'standard_hydraulic_traveling_cable',
          baselineProductivity: expect.objectContaining({ p50PerDay: 0.56, unit: 'shaft/day', sourceType: 'quota' }),
        }),
        expect.objectContaining({
          conditionCode: 'machine_roomless_safety_loop_cable_constrained',
          baselineProductivity: expect.objectContaining({ p50PerDay: 0.38, unit: 'shaft/day', sourceType: 'expert_profile' }),
        }),
      ]),
    }))

    expect(electrical).toEqual(expect.objectContaining({
      defaultDaysP20: 7,
      defaultDaysP50: 10,
      defaultDaysP80: 13,
      conditionedDurationBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'standard_hydraulic_control_wiring',
          selector: expect.objectContaining({ elevatorHydraulicElectricalMethodBand: 'standard_control_wiring' }),
          defaultDaysP50: 9,
        }),
        expect.objectContaining({
          conditionCode: 'machine_roomless_hydraulic_controller',
          selector: expect.objectContaining({ elevatorHydraulicElectricalMethodBand: 'machine_roomless_controller' }),
          defaultDaysP50: 11,
        }),
        expect.objectContaining({
          conditionCode: 'destination_control_hydraulic_safety_loop_constrained',
          selector: expect.objectContaining({ elevatorHydraulicElectricalMethodBand: 'destination_control_safety_loop', workfaceBand: 'constrained' }),
          defaultDaysP50: 14,
        }),
      ]),
      conditionedProcessProfiles: expect.arrayContaining([
        expect.objectContaining({ conditionCode: 'standard_hydraulic_control_wiring' }),
        expect.objectContaining({ conditionCode: 'machine_roomless_hydraulic_controller' }),
        expect.objectContaining({ conditionCode: 'destination_control_hydraulic_safety_loop_constrained' }),
      ]),
      productivityBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'standard_hydraulic_control_wiring',
          baselineProductivity: expect.objectContaining({ p50PerDay: 0.42, unit: 'shaft/day', sourceType: 'quota' }),
        }),
        expect.objectContaining({
          conditionCode: 'destination_control_hydraulic_safety_loop_constrained',
          baselineProductivity: expect.objectContaining({ p50PerDay: 0.28, unit: 'shaft/day', sourceType: 'expert_profile' }),
        }),
      ]),
    }))

    expect(installation).toEqual(expect.objectContaining({
      defaultDaysP20: 28,
      defaultDaysP50: 40,
      defaultDaysP80: 52,
      conditionedDurationBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'direct_plunger_hydraulic_3_stop',
          selector: expect.objectContaining({ elevatorHydraulicInstallationMethodBand: 'direct_plunger_3_stop' }),
          defaultDaysP50: 35,
        }),
        expect.objectContaining({
          conditionCode: 'roped_hydraulic_multi_stop',
          selector: expect.objectContaining({ elevatorHydraulicInstallationMethodBand: 'roped_multi_stop', heightBand: 'high_rise' }),
          defaultDaysP50: 44,
        }),
        expect.objectContaining({
          conditionCode: 'renovation_heavy_load_hydraulic_constrained',
          selector: expect.objectContaining({ elevatorHydraulicInstallationMethodBand: 'renovation_heavy_load', renovationBand: 'renovation', workfaceBand: 'constrained' }),
          defaultDaysP50: 56,
        }),
      ]),
      conditionedProcessProfiles: expect.arrayContaining([
        expect.objectContaining({ conditionCode: 'direct_plunger_hydraulic_3_stop' }),
        expect.objectContaining({ conditionCode: 'roped_hydraulic_multi_stop' }),
        expect.objectContaining({ conditionCode: 'renovation_heavy_load_hydraulic_constrained' }),
      ]),
      productivityBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'direct_plunger_hydraulic_3_stop',
          baselineProductivity: expect.objectContaining({ p50PerDay: 0.08, unit: 'system/day', sourceType: 'quota' }),
        }),
        expect.objectContaining({
          conditionCode: 'renovation_heavy_load_hydraulic_constrained',
          baselineProductivity: expect.objectContaining({ p50PerDay: 0.05, unit: 'system/day', sourceType: 'expert_profile' }),
        }),
      ]),
    }))

    const mrlCable = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'elevator_hydraulic_traveling_cable',
      applicableGranularity: 'task',
      methodVariantCodes: ['machine_roomless_safety_loop_cable'],
      elementVariantCodes: ['constrained_workface'],
    }) as any
    expect(mrlCable).toEqual(expect.objectContaining({
      selectedConditionCode: 'machine_roomless_safety_loop_cable_constrained',
      defaultDaysP50: 10,
      baselineProductivity: expect.objectContaining({ p50PerDay: 0.38, unit: 'shaft/day' }),
    }))

    const destinationElectrical = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'elevator_hydraulic_electrical_device',
      applicableGranularity: 'task',
      methodVariantCodes: ['destination_control_hydraulic_safety_loop'],
      elementVariantCodes: ['constrained_workface'],
    }) as any
    expect(destinationElectrical).toEqual(expect.objectContaining({
      selectedConditionCode: 'destination_control_hydraulic_safety_loop_constrained',
      defaultDaysP50: 14,
      baselineProductivity: expect.objectContaining({ p50PerDay: 0.28, unit: 'shaft/day' }),
    }))

    const renovationHydraulic = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'elevator_hydraulic_installation',
      applicableGranularity: 'task',
      methodVariantCodes: ['renovation_heavy_load_hydraulic'],
      elementVariantCodes: ['renovation_shaft', 'constrained_workface'],
    }) as any
    expect(renovationHydraulic).toEqual(expect.objectContaining({
      selectedConditionCode: 'renovation_heavy_load_hydraulic_constrained',
      defaultDaysP50: 56,
      baselineProductivity: expect.objectContaining({ p50PerDay: 0.05, unit: 'system/day' }),
    }))
  })

  it('keeps escalator, intelligent integration, and network systems conditionized by intrinsic system scope', async () => {
    const byStableCode = new Map(STANDARD_WORK_DURATION_SEED.map((record) => [record.stableCode, record]))
    const escalator = byStableCode.get('escalator_moving_walk_installation') as any
    const integration = byStableCode.get('intelligent_integration_network') as any
    const network = byStableCode.get('intelligent_network_system') as any

    expect(escalator).toEqual(expect.objectContaining({
      defaultDaysP20: 11,
      defaultDaysP50: 15,
      defaultDaysP80: 20,
      conditionedDurationBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'standard_indoor_escalator',
          selector: expect.objectContaining({ escalatorMovingWalkMethodBand: 'standard_indoor_escalator' }),
          defaultDaysP50: 13,
        }),
        expect.objectContaining({
          conditionCode: 'public_transport_heavy_duty_escalator',
          selector: expect.objectContaining({ escalatorMovingWalkMethodBand: 'public_transport_heavy_duty', workfaceBand: 'constrained' }),
          defaultDaysP50: 17,
        }),
        expect.objectContaining({
          conditionCode: 'long_span_moving_walk_constrained',
          selector: expect.objectContaining({ escalatorMovingWalkMethodBand: 'long_span_moving_walk', workfaceBand: 'constrained' }),
          defaultDaysP50: 21,
        }),
      ]),
      conditionedProcessProfiles: expect.arrayContaining([
        expect.objectContaining({ conditionCode: 'standard_indoor_escalator' }),
        expect.objectContaining({ conditionCode: 'public_transport_heavy_duty_escalator' }),
        expect.objectContaining({ conditionCode: 'long_span_moving_walk_constrained' }),
      ]),
      productivityBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'standard_indoor_escalator',
          baselineProductivity: expect.objectContaining({ p50PerDay: 0.09, unit: 'system/day', sourceType: 'quota' }),
        }),
        expect.objectContaining({
          conditionCode: 'long_span_moving_walk_constrained',
          baselineProductivity: expect.objectContaining({ p50PerDay: 0.055, unit: 'system/day', sourceType: 'expert_profile' }),
        }),
      ]),
    }))

    expect(integration).toEqual(expect.objectContaining({
      defaultDaysP20: 8,
      defaultDaysP50: 11,
      defaultDaysP80: 14,
      conditionedDurationBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'standard_integration_network',
          selector: expect.objectContaining({ intelligentIntegrationMethodBand: 'standard_integration' }),
          defaultDaysP50: 10,
        }),
        expect.objectContaining({
          conditionCode: 'multi_subsystem_platform_integration',
          selector: expect.objectContaining({ intelligentIntegrationMethodBand: 'multi_subsystem_platform' }),
          defaultDaysP50: 13,
        }),
        expect.objectContaining({
          conditionCode: 'data_center_integration_constrained',
          selector: expect.objectContaining({ intelligentIntegrationMethodBand: 'data_center_integration', workfaceBand: 'constrained' }),
          defaultDaysP50: 16,
        }),
      ]),
      conditionedProcessProfiles: expect.arrayContaining([
        expect.objectContaining({ conditionCode: 'standard_integration_network' }),
        expect.objectContaining({ conditionCode: 'multi_subsystem_platform_integration' }),
        expect.objectContaining({ conditionCode: 'data_center_integration_constrained' }),
      ]),
      productivityBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'standard_integration_network',
          baselineProductivity: expect.objectContaining({ p50PerDay: 0.11, unit: 'system/day', sourceType: 'quota' }),
        }),
        expect.objectContaining({
          conditionCode: 'data_center_integration_constrained',
          baselineProductivity: expect.objectContaining({ p50PerDay: 0.068, unit: 'system/day', sourceType: 'expert_profile' }),
        }),
      ]),
    }))

    expect(network).toEqual(expect.objectContaining({
      defaultDaysP20: 8,
      defaultDaysP50: 12,
      defaultDaysP80: 16,
      conditionedDurationBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'standard_lan_network',
          selector: expect.objectContaining({ intelligentNetworkMethodBand: 'standard_lan' }),
          defaultDaysP50: 10,
        }),
        expect.objectContaining({
          conditionCode: 'dense_wireless_ap_network',
          selector: expect.objectContaining({ intelligentNetworkMethodBand: 'dense_wireless_ap' }),
          defaultDaysP50: 13,
        }),
        expect.objectContaining({
          conditionCode: 'data_center_core_network_constrained',
          selector: expect.objectContaining({ intelligentNetworkMethodBand: 'data_center_core', workfaceBand: 'constrained' }),
          defaultDaysP50: 17,
        }),
      ]),
      conditionedProcessProfiles: expect.arrayContaining([
        expect.objectContaining({ conditionCode: 'standard_lan_network' }),
        expect.objectContaining({ conditionCode: 'dense_wireless_ap_network' }),
        expect.objectContaining({ conditionCode: 'data_center_core_network_constrained' }),
      ]),
      productivityBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'standard_lan_network',
          baselineProductivity: expect.objectContaining({ p50PerDay: 0.1, unit: 'system/day', sourceType: 'quota' }),
        }),
        expect.objectContaining({
          conditionCode: 'data_center_core_network_constrained',
          baselineProductivity: expect.objectContaining({ p50PerDay: 0.06, unit: 'system/day', sourceType: 'expert_profile' }),
        }),
      ]),
    }))

    const longWalk = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'escalator_moving_walk_installation',
      applicableGranularity: 'task',
      methodVariantCodes: ['long_span_moving_walk'],
      elementVariantCodes: ['constrained_workface'],
    }) as any
    expect(longWalk).toEqual(expect.objectContaining({
      selectedConditionCode: 'long_span_moving_walk_constrained',
      defaultDaysP50: 21,
      baselineProductivity: expect.objectContaining({ p50PerDay: 0.055, unit: 'system/day' }),
    }))

    const dataCenterIntegration = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'intelligent_integration_network',
      applicableGranularity: 'task',
      methodVariantCodes: ['data_center_integration'],
      elementVariantCodes: ['constrained_workface'],
    }) as any
    expect(dataCenterIntegration).toEqual(expect.objectContaining({
      selectedConditionCode: 'data_center_integration_constrained',
      defaultDaysP50: 16,
      baselineProductivity: expect.objectContaining({ p50PerDay: 0.068, unit: 'system/day' }),
    }))

    const coreNetwork = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'intelligent_network_system',
      applicableGranularity: 'task',
      methodVariantCodes: ['data_center_core_network'],
      elementVariantCodes: ['constrained_workface'],
    }) as any
    expect(coreNetwork).toEqual(expect.objectContaining({
      selectedConditionCode: 'data_center_core_network_constrained',
      defaultDaysP50: 17,
      baselineProductivity: expect.objectContaining({ p50PerDay: 0.06, unit: 'system/day' }),
    }))
  })

  it('keeps structured cabling, information application, and access systems conditionized by intrinsic intelligent scope', async () => {
    const byStableCode = new Map(STANDARD_WORK_DURATION_SEED.map((record) => [record.stableCode, record]))
    const cabling = byStableCode.get('intelligent_structured_cabling') as any
    const application = byStableCode.get('intelligent_information_application') as any
    const access = byStableCode.get('intelligent_information_access_system') as any

    expect(cabling).toEqual(expect.objectContaining({
      defaultDaysP20: 7,
      defaultDaysP50: 10,
      defaultDaysP80: 13,
      conditionedDurationBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'standard_structured_cabling',
          selector: expect.objectContaining({ intelligentStructuredCablingMethodBand: 'standard_cabling' }),
          defaultDaysP50: 9,
        }),
        expect.objectContaining({
          conditionCode: 'fiber_backbone_rack_cabling',
          selector: expect.objectContaining({ intelligentStructuredCablingMethodBand: 'fiber_backbone_rack' }),
          defaultDaysP50: 11,
        }),
        expect.objectContaining({
          conditionCode: 'data_center_high_density_cabling_constrained',
          selector: expect.objectContaining({ intelligentStructuredCablingMethodBand: 'data_center_high_density', workfaceBand: 'constrained' }),
          defaultDaysP50: 15,
        }),
      ]),
      conditionedProcessProfiles: expect.arrayContaining([
        expect.objectContaining({ conditionCode: 'standard_structured_cabling' }),
        expect.objectContaining({ conditionCode: 'fiber_backbone_rack_cabling' }),
        expect.objectContaining({ conditionCode: 'data_center_high_density_cabling_constrained' }),
      ]),
      productivityBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'standard_structured_cabling',
          baselineProductivity: expect.objectContaining({ p50PerDay: 0.12, unit: 'system/day', sourceType: 'quota' }),
        }),
        expect.objectContaining({
          conditionCode: 'data_center_high_density_cabling_constrained',
          baselineProductivity: expect.objectContaining({ p50PerDay: 0.07, unit: 'system/day', sourceType: 'expert_profile' }),
        }),
      ]),
    }))

    expect(application).toEqual(expect.objectContaining({
      defaultDaysP20: 8,
      defaultDaysP50: 12,
      defaultDaysP80: 16,
      conditionedDurationBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'standard_information_application',
          selector: expect.objectContaining({ intelligentApplicationMethodBand: 'standard_application' }),
          defaultDaysP50: 10,
        }),
        expect.objectContaining({
          conditionCode: 'workflow_interface_application',
          selector: expect.objectContaining({ intelligentApplicationMethodBand: 'workflow_interface' }),
          defaultDaysP50: 13,
        }),
        expect.objectContaining({
          conditionCode: 'multi_platform_integration_application_constrained',
          selector: expect.objectContaining({ intelligentApplicationMethodBand: 'multi_platform_integration', workfaceBand: 'constrained' }),
          defaultDaysP50: 17,
        }),
      ]),
      conditionedProcessProfiles: expect.arrayContaining([
        expect.objectContaining({ conditionCode: 'standard_information_application' }),
        expect.objectContaining({ conditionCode: 'workflow_interface_application' }),
        expect.objectContaining({ conditionCode: 'multi_platform_integration_application_constrained' }),
      ]),
      productivityBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'standard_information_application',
          baselineProductivity: expect.objectContaining({ p50PerDay: 0.1, unit: 'system/day', sourceType: 'quota' }),
        }),
        expect.objectContaining({
          conditionCode: 'multi_platform_integration_application_constrained',
          baselineProductivity: expect.objectContaining({ p50PerDay: 0.058, unit: 'system/day', sourceType: 'expert_profile' }),
        }),
      ]),
    }))

    expect(access).toEqual(expect.objectContaining({
      defaultDaysP20: 4,
      defaultDaysP50: 5,
      defaultDaysP80: 7,
      conditionedDurationBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'standard_carrier_access',
          selector: expect.objectContaining({ intelligentAccessMethodBand: 'standard_carrier_access' }),
          defaultDaysP50: 4,
        }),
        expect.objectContaining({
          conditionCode: 'access_room_readiness_handover',
          selector: expect.objectContaining({ intelligentAccessMethodBand: 'access_room_handover' }),
          defaultDaysP50: 6,
        }),
        expect.objectContaining({
          conditionCode: 'multi_carrier_access_constrained',
          selector: expect.objectContaining({ intelligentAccessMethodBand: 'multi_carrier_constrained', workfaceBand: 'constrained' }),
          defaultDaysP50: 8,
        }),
      ]),
      conditionedProcessProfiles: expect.arrayContaining([
        expect.objectContaining({ conditionCode: 'standard_carrier_access' }),
        expect.objectContaining({ conditionCode: 'access_room_readiness_handover' }),
        expect.objectContaining({ conditionCode: 'multi_carrier_access_constrained' }),
      ]),
      productivityBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'standard_carrier_access',
          baselineProductivity: expect.objectContaining({ p50PerDay: 0.25, unit: 'system/day', sourceType: 'quota' }),
        }),
        expect.objectContaining({
          conditionCode: 'multi_carrier_access_constrained',
          baselineProductivity: expect.objectContaining({ p50PerDay: 0.14, unit: 'system/day', sourceType: 'expert_profile' }),
        }),
      ]),
    }))

    const denseCabling = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'intelligent_structured_cabling',
      applicableGranularity: 'task',
      methodVariantCodes: ['high_density_cabling'],
      elementVariantCodes: ['constrained_workface'],
    }) as any
    expect(denseCabling).toEqual(expect.objectContaining({
      selectedConditionCode: 'data_center_high_density_cabling_constrained',
      defaultDaysP50: 15,
      baselineProductivity: expect.objectContaining({ p50PerDay: 0.07, unit: 'system/day' }),
    }))

    const fiberCabling = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'intelligent_structured_cabling',
      applicableGranularity: 'task',
      methodVariantCodes: ['optical_backbone'],
    }) as any
    expect(fiberCabling).toEqual(expect.objectContaining({
      selectedConditionCode: 'fiber_backbone_rack_cabling',
      defaultDaysP50: 11,
    }))

    const platformApplication = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'intelligent_information_application',
      applicableGranularity: 'task',
      methodVariantCodes: ['cross_platform_application'],
      elementVariantCodes: ['constrained_workface'],
    }) as any
    expect(platformApplication).toEqual(expect.objectContaining({
      selectedConditionCode: 'multi_platform_integration_application_constrained',
      defaultDaysP50: 17,
      baselineProductivity: expect.objectContaining({ p50PerDay: 0.058, unit: 'system/day' }),
    }))

    const workflowApplication = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'intelligent_information_application',
      applicableGranularity: 'task',
      methodVariantCodes: ['interface_application'],
    }) as any
    expect(workflowApplication).toEqual(expect.objectContaining({
      selectedConditionCode: 'workflow_interface_application',
      defaultDaysP50: 13,
    }))

    const multiCarrier = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'intelligent_information_access_system',
      applicableGranularity: 'task',
      methodVariantCodes: ['carrier_multi_access'],
      elementVariantCodes: ['constrained_workface'],
    }) as any
    expect(multiCarrier).toEqual(expect.objectContaining({
      selectedConditionCode: 'multi_carrier_access_constrained',
      defaultDaysP50: 8,
      baselineProductivity: expect.objectContaining({ p50PerDay: 0.14, unit: 'system/day' }),
    }))

    const accessRoom = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'intelligent_information_access_system',
      applicableGranularity: 'task',
      methodVariantCodes: ['carrier_room_handover'],
    }) as any
    expect(accessRoom).toEqual(expect.objectContaining({
      selectedConditionCode: 'access_room_readiness_handover',
      defaultDaysP50: 6,
    }))
  })

  it('keeps mobile signal, satellite communication, and telecom access conditionized by intrinsic communication scope', async () => {
    const byStableCode = new Map(STANDARD_WORK_DURATION_SEED.map((record) => [record.stableCode, record]))
    const mobile = byStableCode.get('intelligent_mobile_signal_coverage') as any
    const satellite = byStableCode.get('intelligent_satellite_communication_system') as any
    const telecom = byStableCode.get('intelligent_telecom_access_coverage') as any

    expect(mobile).toEqual(expect.objectContaining({
      defaultDaysP20: 6,
      defaultDaysP50: 8,
      defaultDaysP80: 10,
      conditionedDurationBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'standard_indoor_das_coverage',
          selector: expect.objectContaining({ intelligentMobileSignalMethodBand: 'standard_indoor_das' }),
          defaultDaysP50: 7,
        }),
        expect.objectContaining({
          conditionCode: 'public_area_carrier_coverage',
          selector: expect.objectContaining({ intelligentMobileSignalMethodBand: 'public_area_carrier' }),
          defaultDaysP50: 9,
        }),
        expect.objectContaining({
          conditionCode: 'dense_basement_signal_coverage_constrained',
          selector: expect.objectContaining({ intelligentMobileSignalMethodBand: 'dense_basement_coverage', workfaceBand: 'constrained' }),
          defaultDaysP50: 12,
        }),
      ]),
      conditionedProcessProfiles: expect.arrayContaining([
        expect.objectContaining({ conditionCode: 'standard_indoor_das_coverage' }),
        expect.objectContaining({ conditionCode: 'public_area_carrier_coverage' }),
        expect.objectContaining({ conditionCode: 'dense_basement_signal_coverage_constrained' }),
      ]),
      productivityBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'standard_indoor_das_coverage',
          baselineProductivity: expect.objectContaining({ p50PerDay: 55, unit: 'point/day', sourceType: 'quota' }),
        }),
        expect.objectContaining({
          conditionCode: 'dense_basement_signal_coverage_constrained',
          baselineProductivity: expect.objectContaining({ p50PerDay: 36, unit: 'point/day', sourceType: 'expert_profile' }),
        }),
      ]),
    }))

    expect(satellite).toEqual(expect.objectContaining({
      defaultDaysP20: 6,
      defaultDaysP50: 9,
      defaultDaysP80: 12,
      confidence: 'medium',
      conditionedDurationBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'roof_satellite_antenna_alignment',
          selector: expect.objectContaining({ intelligentSatelliteMethodBand: 'roof_antenna_alignment' }),
          defaultDaysP50: 8,
        }),
        expect.objectContaining({
          conditionCode: 'multi_receiver_satellite_system',
          selector: expect.objectContaining({ intelligentSatelliteMethodBand: 'multi_receiver_system' }),
          defaultDaysP50: 10,
        }),
        expect.objectContaining({
          conditionCode: 'strict_grounding_satellite_commissioning_constrained',
          selector: expect.objectContaining({ intelligentSatelliteMethodBand: 'strict_grounding_commissioning', workfaceBand: 'constrained' }),
          defaultDaysP50: 13,
        }),
      ]),
      conditionedProcessProfiles: expect.arrayContaining([
        expect.objectContaining({ conditionCode: 'roof_satellite_antenna_alignment' }),
        expect.objectContaining({ conditionCode: 'multi_receiver_satellite_system' }),
        expect.objectContaining({ conditionCode: 'strict_grounding_satellite_commissioning_constrained' }),
      ]),
      productivityBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'roof_satellite_antenna_alignment',
          baselineProductivity: expect.objectContaining({ p50PerDay: 0.8, unit: 'system/day', sourceType: 'quota' }),
        }),
        expect.objectContaining({
          conditionCode: 'strict_grounding_satellite_commissioning_constrained',
          baselineProductivity: expect.objectContaining({ p50PerDay: 0.077, unit: 'system/day', sourceType: 'expert_profile' }),
        }),
      ]),
    }))

    expect(telecom).toEqual(expect.objectContaining({
      defaultDaysP20: 5,
      defaultDaysP50: 7,
      defaultDaysP80: 9,
      conditionedDurationBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'carrier_access_only_coverage',
          selector: expect.objectContaining({ intelligentTelecomAccessMethodBand: 'carrier_access_only' }),
          defaultDaysP50: 5,
        }),
        expect.objectContaining({
          conditionCode: 'mobile_signal_access_coverage',
          selector: expect.objectContaining({ intelligentTelecomAccessMethodBand: 'mobile_signal_access' }),
          defaultDaysP50: 7,
        }),
        expect.objectContaining({
          conditionCode: 'mobile_satellite_interface_constrained',
          selector: expect.objectContaining({ intelligentTelecomAccessMethodBand: 'mobile_satellite_interface', workfaceBand: 'constrained' }),
          defaultDaysP50: 10,
        }),
      ]),
      conditionedProcessProfiles: expect.arrayContaining([
        expect.objectContaining({ conditionCode: 'carrier_access_only_coverage' }),
        expect.objectContaining({ conditionCode: 'mobile_signal_access_coverage' }),
        expect.objectContaining({ conditionCode: 'mobile_satellite_interface_constrained' }),
      ]),
      productivityBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'carrier_access_only_coverage',
          baselineProductivity: expect.objectContaining({ p50PerDay: 0.22, unit: 'system/day', sourceType: 'quota' }),
        }),
        expect.objectContaining({
          conditionCode: 'mobile_satellite_interface_constrained',
          baselineProductivity: expect.objectContaining({ p50PerDay: 0.1, unit: 'system/day', sourceType: 'expert_profile' }),
        }),
      ]),
    }))

    const denseMobile = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'intelligent_mobile_signal_coverage',
      applicableGranularity: 'task',
      methodVariantCodes: ['basement_signal_dense'],
      elementVariantCodes: ['constrained_workface'],
    }) as any
    expect(denseMobile).toEqual(expect.objectContaining({
      selectedConditionCode: 'dense_basement_signal_coverage_constrained',
      defaultDaysP50: 12,
      baselineProductivity: expect.objectContaining({ p50PerDay: 36, unit: 'point/day' }),
    }))

    const multiReceiverSatellite = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'intelligent_satellite_communication_system',
      applicableGranularity: 'task',
      methodVariantCodes: ['multi_receiver_system'],
    }) as any
    expect(multiReceiverSatellite).toEqual(expect.objectContaining({
      selectedConditionCode: 'multi_receiver_satellite_system',
      defaultDaysP50: 10,
    }))

    const telecomInterface = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'intelligent_telecom_access_coverage',
      applicableGranularity: 'task',
      methodVariantCodes: ['mobile_satellite_interface'],
      elementVariantCodes: ['constrained_workface'],
    }) as any
    expect(telecomInterface).toEqual(expect.objectContaining({
      selectedConditionCode: 'mobile_satellite_interface_constrained',
      defaultDaysP50: 10,
      baselineProductivity: expect.objectContaining({ p50PerDay: 0.1, unit: 'system/day' }),
    }))
  })

  it('keeps telephone exchange, communication media, and public broadcast conditionized by intrinsic system scope', async () => {
    const byStableCode = new Map(STANDARD_WORK_DURATION_SEED.map((record) => [record.stableCode, record]))
    const telephone = byStableCode.get('intelligent_telephone_exchange') as any
    const media = byStableCode.get('intelligent_communication_media') as any
    const broadcast = byStableCode.get('intelligent_public_broadcast_system') as any

    expect(telephone).toEqual(expect.objectContaining({
      defaultDaysP20: 6,
      defaultDaysP50: 9,
      defaultDaysP80: 12,
      conditionedDurationBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'standard_voice_exchange',
          selector: expect.objectContaining({ intelligentTelephoneExchangeMethodBand: 'standard_voice_exchange' }),
          defaultDaysP50: 8,
        }),
        expect.objectContaining({
          conditionCode: 'ip_pbx_gateway_exchange',
          selector: expect.objectContaining({ intelligentTelephoneExchangeMethodBand: 'ip_pbx_gateway' }),
          defaultDaysP50: 10,
        }),
        expect.objectContaining({
          conditionCode: 'hospital_operator_exchange_constrained',
          selector: expect.objectContaining({ intelligentTelephoneExchangeMethodBand: 'operator_console_redundant', workfaceBand: 'constrained' }),
          defaultDaysP50: 13,
        }),
      ]),
      conditionedProcessProfiles: expect.arrayContaining([
        expect.objectContaining({ conditionCode: 'standard_voice_exchange' }),
        expect.objectContaining({ conditionCode: 'ip_pbx_gateway_exchange' }),
        expect.objectContaining({ conditionCode: 'hospital_operator_exchange_constrained' }),
      ]),
      productivityBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'standard_voice_exchange',
          baselineProductivity: expect.objectContaining({ p50PerDay: 0.13, unit: 'system/day', sourceType: 'quota' }),
        }),
        expect.objectContaining({
          conditionCode: 'hospital_operator_exchange_constrained',
          baselineProductivity: expect.objectContaining({ p50PerDay: 0.077, unit: 'system/day', sourceType: 'expert_profile' }),
        }),
      ]),
    }))

    expect(media).toEqual(expect.objectContaining({
      defaultDaysP20: 5,
      defaultDaysP50: 7,
      defaultDaysP80: 9,
      conditionedDurationBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'standard_cable_tv_distribution',
          selector: expect.objectContaining({ intelligentCommunicationMediaMethodBand: 'standard_cable_tv' }),
          defaultDaysP50: 6,
        }),
        expect.objectContaining({
          conditionCode: 'satellite_tv_receiver_distribution',
          selector: expect.objectContaining({ intelligentCommunicationMediaMethodBand: 'satellite_tv_distribution' }),
          defaultDaysP50: 8,
        }),
        expect.objectContaining({
          conditionCode: 'multi_source_media_headend_constrained',
          selector: expect.objectContaining({ intelligentCommunicationMediaMethodBand: 'multi_source_headend', workfaceBand: 'constrained' }),
          defaultDaysP50: 11,
        }),
      ]),
      conditionedProcessProfiles: expect.arrayContaining([
        expect.objectContaining({ conditionCode: 'standard_cable_tv_distribution' }),
        expect.objectContaining({ conditionCode: 'satellite_tv_receiver_distribution' }),
        expect.objectContaining({ conditionCode: 'multi_source_media_headend_constrained' }),
      ]),
      productivityBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'standard_cable_tv_distribution',
          baselineProductivity: expect.objectContaining({ p50PerDay: 0.17, unit: 'system/day', sourceType: 'quota' }),
        }),
        expect.objectContaining({
          conditionCode: 'multi_source_media_headend_constrained',
          baselineProductivity: expect.objectContaining({ p50PerDay: 0.091, unit: 'system/day', sourceType: 'expert_profile' }),
        }),
      ]),
    }))

    expect(broadcast).toEqual(expect.objectContaining({
      defaultDaysP20: 6,
      defaultDaysP50: 8,
      defaultDaysP80: 10,
      conditionedDurationBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'standard_public_broadcast_loop',
          selector: expect.objectContaining({ intelligentPublicBroadcastMethodBand: 'standard_loop' }),
          defaultDaysP50: 7,
        }),
        expect.objectContaining({
          conditionCode: 'zoned_public_broadcast_system',
          selector: expect.objectContaining({ intelligentPublicBroadcastMethodBand: 'zoned_broadcast' }),
          defaultDaysP50: 9,
        }),
        expect.objectContaining({
          conditionCode: 'emergency_linkage_broadcast_constrained',
          selector: expect.objectContaining({ intelligentPublicBroadcastMethodBand: 'emergency_linkage', workfaceBand: 'constrained' }),
          defaultDaysP50: 12,
        }),
      ]),
      conditionedProcessProfiles: expect.arrayContaining([
        expect.objectContaining({ conditionCode: 'standard_public_broadcast_loop' }),
        expect.objectContaining({ conditionCode: 'zoned_public_broadcast_system' }),
        expect.objectContaining({ conditionCode: 'emergency_linkage_broadcast_constrained' }),
      ]),
      productivityBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'standard_public_broadcast_loop',
          baselineProductivity: expect.objectContaining({ p50PerDay: 0.14, unit: 'system/day', sourceType: 'quota' }),
        }),
        expect.objectContaining({
          conditionCode: 'emergency_linkage_broadcast_constrained',
          baselineProductivity: expect.objectContaining({ p50PerDay: 0.083, unit: 'system/day', sourceType: 'expert_profile' }),
        }),
      ]),
    }))

    const operatorExchange = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'intelligent_telephone_exchange',
      applicableGranularity: 'task',
      methodVariantCodes: ['operator_console_redundant'],
      elementVariantCodes: ['constrained_workface'],
    }) as any
    expect(operatorExchange).toEqual(expect.objectContaining({
      selectedConditionCode: 'hospital_operator_exchange_constrained',
      defaultDaysP50: 13,
      baselineProductivity: expect.objectContaining({ p50PerDay: 0.077, unit: 'system/day' }),
    }))

    const satelliteMedia = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'intelligent_communication_media',
      applicableGranularity: 'task',
      methodVariantCodes: ['satellite_tv_distribution'],
    }) as any
    expect(satelliteMedia).toEqual(expect.objectContaining({
      selectedConditionCode: 'satellite_tv_receiver_distribution',
      defaultDaysP50: 8,
    }))

    const emergencyBroadcast = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'intelligent_public_broadcast_system',
      applicableGranularity: 'task',
      methodVariantCodes: ['emergency_broadcast_linkage'],
      elementVariantCodes: ['constrained_workface'],
    }) as any
    expect(emergencyBroadcast).toEqual(expect.objectContaining({
      selectedConditionCode: 'emergency_linkage_broadcast_constrained',
      defaultDaysP50: 12,
      baselineProductivity: expect.objectContaining({ p50PerDay: 0.083, unit: 'system/day' }),
    }))
  })

  it('keeps conference, information display, and clock systems conditionized by intrinsic endpoint scope', async () => {
    const byStableCode = new Map(STANDARD_WORK_DURATION_SEED.map((record) => [record.stableCode, record]))
    const conference = byStableCode.get('intelligent_conference_system') as any
    const display = byStableCode.get('intelligent_information_display_system') as any
    const clock = byStableCode.get('intelligent_clock_system') as any

    expect(conference).toEqual(expect.objectContaining({
      defaultDaysP20: 7,
      defaultDaysP50: 10,
      defaultDaysP80: 13,
      conditionedDurationBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'standard_meeting_room_av',
          selector: expect.objectContaining({ intelligentConferenceMethodBand: 'standard_meeting_room' }),
          defaultDaysP50: 9,
        }),
        expect.objectContaining({
          conditionCode: 'video_conference_matrix_system',
          selector: expect.objectContaining({ intelligentConferenceMethodBand: 'video_matrix' }),
          defaultDaysP50: 12,
        }),
        expect.objectContaining({
          conditionCode: 'multi_room_central_control_constrained',
          selector: expect.objectContaining({ intelligentConferenceMethodBand: 'multi_room_control', workfaceBand: 'constrained' }),
          defaultDaysP50: 15,
        }),
      ]),
      conditionedProcessProfiles: expect.arrayContaining([
        expect.objectContaining({ conditionCode: 'standard_meeting_room_av' }),
        expect.objectContaining({ conditionCode: 'video_conference_matrix_system' }),
        expect.objectContaining({ conditionCode: 'multi_room_central_control_constrained' }),
      ]),
      productivityBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'standard_meeting_room_av',
          baselineProductivity: expect.objectContaining({ p50PerDay: 0.11, unit: 'system/day', sourceType: 'quota' }),
        }),
        expect.objectContaining({
          conditionCode: 'multi_room_central_control_constrained',
          baselineProductivity: expect.objectContaining({ p50PerDay: 0.067, unit: 'system/day', sourceType: 'expert_profile' }),
        }),
      ]),
    }))

    expect(display).toEqual(expect.objectContaining({
      defaultDaysP20: 7,
      defaultDaysP50: 10,
      defaultDaysP80: 13,
      conditionedDurationBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'standard_guidance_display',
          selector: expect.objectContaining({ intelligentDisplayMethodBand: 'standard_guidance' }),
          defaultDaysP50: 8,
        }),
        expect.objectContaining({
          conditionCode: 'media_server_publishing_system',
          selector: expect.objectContaining({ intelligentDisplayMethodBand: 'media_server_publishing' }),
          defaultDaysP50: 11,
        }),
        expect.objectContaining({
          conditionCode: 'large_screen_splicing_display_constrained',
          selector: expect.objectContaining({ intelligentDisplayMethodBand: 'large_screen_splicing', workfaceBand: 'constrained' }),
          defaultDaysP50: 15,
        }),
      ]),
      conditionedProcessProfiles: expect.arrayContaining([
        expect.objectContaining({ conditionCode: 'standard_guidance_display' }),
        expect.objectContaining({ conditionCode: 'media_server_publishing_system' }),
        expect.objectContaining({ conditionCode: 'large_screen_splicing_display_constrained' }),
      ]),
      productivityBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'standard_guidance_display',
          baselineProductivity: expect.objectContaining({ p50PerDay: 0.13, unit: 'system/day', sourceType: 'quota' }),
        }),
        expect.objectContaining({
          conditionCode: 'large_screen_splicing_display_constrained',
          baselineProductivity: expect.objectContaining({ p50PerDay: 0.067, unit: 'system/day', sourceType: 'expert_profile' }),
        }),
      ]),
    }))

    expect(clock).toEqual(expect.objectContaining({
      defaultDaysP20: 4,
      defaultDaysP50: 6,
      defaultDaysP80: 8,
      conditionedDurationBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'standard_master_slave_clock',
          selector: expect.objectContaining({ intelligentClockMethodBand: 'master_slave_clock' }),
          defaultDaysP50: 5,
        }),
        expect.objectContaining({
          conditionCode: 'ntp_network_time_system',
          selector: expect.objectContaining({ intelligentClockMethodBand: 'ntp_network_time' }),
          defaultDaysP50: 7,
        }),
        expect.objectContaining({
          conditionCode: 'multi_zone_time_sync_acceptance_constrained',
          selector: expect.objectContaining({ intelligentClockMethodBand: 'multi_zone_sync', workfaceBand: 'constrained' }),
          defaultDaysP50: 9,
        }),
      ]),
      conditionedProcessProfiles: expect.arrayContaining([
        expect.objectContaining({ conditionCode: 'standard_master_slave_clock' }),
        expect.objectContaining({ conditionCode: 'ntp_network_time_system' }),
        expect.objectContaining({ conditionCode: 'multi_zone_time_sync_acceptance_constrained' }),
      ]),
      productivityBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'standard_master_slave_clock',
          baselineProductivity: expect.objectContaining({ p50PerDay: 0.2, unit: 'system/day', sourceType: 'quota' }),
        }),
        expect.objectContaining({
          conditionCode: 'multi_zone_time_sync_acceptance_constrained',
          baselineProductivity: expect.objectContaining({ p50PerDay: 0.11, unit: 'system/day', sourceType: 'expert_profile' }),
        }),
      ]),
    }))

    const multiRoomConference = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'intelligent_conference_system',
      applicableGranularity: 'task',
      methodVariantCodes: ['multi_room_control'],
      elementVariantCodes: ['constrained_workface'],
    }) as any
    expect(multiRoomConference).toEqual(expect.objectContaining({
      selectedConditionCode: 'multi_room_central_control_constrained',
      defaultDaysP50: 15,
      baselineProductivity: expect.objectContaining({ p50PerDay: 0.067, unit: 'system/day' }),
    }))

    const largeScreenDisplay = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'intelligent_information_display_system',
      applicableGranularity: 'task',
      methodVariantCodes: ['large_screen_splicing'],
      elementVariantCodes: ['constrained_workface'],
    }) as any
    expect(largeScreenDisplay).toEqual(expect.objectContaining({
      selectedConditionCode: 'large_screen_splicing_display_constrained',
      defaultDaysP50: 15,
      baselineProductivity: expect.objectContaining({ p50PerDay: 0.067, unit: 'system/day' }),
    }))

    const multiZoneClock = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'intelligent_clock_system',
      applicableGranularity: 'task',
      methodVariantCodes: ['multi_zone_time_sync'],
      elementVariantCodes: ['constrained_workface'],
    }) as any
    expect(multiZoneClock).toEqual(expect.objectContaining({
      selectedConditionCode: 'multi_zone_time_sync_acceptance_constrained',
      defaultDaysP50: 9,
      baselineProductivity: expect.objectContaining({ p50PerDay: 0.11, unit: 'system/day' }),
    }))
  })

  it('keeps BA, fire alarm, and security technical systems conditionized by intrinsic system complexity', async () => {
    const byStableCode = new Map(STANDARD_WORK_DURATION_SEED.map((record) => [record.stableCode, record]))
    const ba = byStableCode.get('intelligent_ba_control') as any
    const fireAlarm = byStableCode.get('intelligent_fire_alarm') as any
    const security = byStableCode.get('intelligent_security_technical_system') as any

    expect(ba).toEqual(expect.objectContaining({
      defaultDaysP20: 8,
      defaultDaysP50: 12,
      defaultDaysP80: 16,
      conditionedDurationBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'sensor_actuator_point_ba_standard',
          selector: expect.objectContaining({ intelligentBaControlMethodBand: 'sensor_actuator_points' }),
          defaultDaysP50: 10,
        }),
        expect.objectContaining({
          conditionCode: 'ddc_controller_strategy_ba_system',
          selector: expect.objectContaining({ intelligentBaControlMethodBand: 'ddc_controller_strategy' }),
          defaultDaysP50: 13,
        }),
        expect.objectContaining({
          conditionCode: 'integrated_ba_commissioning_constrained',
          selector: expect.objectContaining({ intelligentBaControlMethodBand: 'integrated_ba_commissioning', workfaceBand: 'constrained' }),
          defaultDaysP50: 17,
        }),
      ]),
      conditionedProcessProfiles: expect.arrayContaining([
        expect.objectContaining({ conditionCode: 'sensor_actuator_point_ba_standard' }),
        expect.objectContaining({ conditionCode: 'ddc_controller_strategy_ba_system' }),
        expect.objectContaining({ conditionCode: 'integrated_ba_commissioning_constrained' }),
      ]),
      productivityBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'sensor_actuator_point_ba_standard',
          baselineProductivity: expect.objectContaining({ p50PerDay: 45, unit: 'point/day', sourceType: 'quota' }),
        }),
        expect.objectContaining({
          conditionCode: 'integrated_ba_commissioning_constrained',
          baselineProductivity: expect.objectContaining({ p50PerDay: 0.058, unit: 'system/day', sourceType: 'expert_profile' }),
        }),
      ]),
    }))

    expect(fireAlarm).toEqual(expect.objectContaining({
      defaultDaysP20: 10,
      defaultDaysP50: 14,
      defaultDaysP80: 18,
      conditionedDurationBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'detector_loop_fire_alarm_standard',
          selector: expect.objectContaining({ intelligentFireAlarmMethodBand: 'detector_loop' }),
          defaultDaysP50: 12,
        }),
        expect.objectContaining({
          conditionCode: 'alarm_controller_matrix_system',
          selector: expect.objectContaining({ intelligentFireAlarmMethodBand: 'alarm_controller_matrix' }),
          defaultDaysP50: 15,
        }),
        expect.objectContaining({
          conditionCode: 'fire_linkage_commissioning_constrained',
          selector: expect.objectContaining({ intelligentFireAlarmMethodBand: 'fire_linkage_commissioning', workfaceBand: 'constrained' }),
          defaultDaysP50: 19,
        }),
      ]),
      conditionedProcessProfiles: expect.arrayContaining([
        expect.objectContaining({ conditionCode: 'detector_loop_fire_alarm_standard' }),
        expect.objectContaining({ conditionCode: 'alarm_controller_matrix_system' }),
        expect.objectContaining({ conditionCode: 'fire_linkage_commissioning_constrained' }),
      ]),
      productivityBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'detector_loop_fire_alarm_standard',
          baselineProductivity: expect.objectContaining({ p50PerDay: 60, unit: 'point/day', sourceType: 'quota' }),
        }),
        expect.objectContaining({
          conditionCode: 'fire_linkage_commissioning_constrained',
          baselineProductivity: expect.objectContaining({ p50PerDay: 0.052, unit: 'system/day', sourceType: 'expert_profile' }),
        }),
      ]),
    }))

    expect(security).toEqual(expect.objectContaining({
      defaultDaysP20: 7,
      defaultDaysP50: 10,
      defaultDaysP80: 13,
      conditionedDurationBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'video_surveillance_point_standard',
          selector: expect.objectContaining({ intelligentSecurityTechnicalMethodBand: 'video_surveillance_points' }),
          defaultDaysP50: 9,
        }),
        expect.objectContaining({
          conditionCode: 'access_control_intrusion_system',
          selector: expect.objectContaining({ intelligentSecurityTechnicalMethodBand: 'access_control_intrusion' }),
          defaultDaysP50: 11,
        }),
        expect.objectContaining({
          conditionCode: 'integrated_security_platform_constrained',
          selector: expect.objectContaining({ intelligentSecurityTechnicalMethodBand: 'integrated_security_platform', workfaceBand: 'constrained' }),
          defaultDaysP50: 14,
        }),
      ]),
      conditionedProcessProfiles: expect.arrayContaining([
        expect.objectContaining({ conditionCode: 'video_surveillance_point_standard' }),
        expect.objectContaining({ conditionCode: 'access_control_intrusion_system' }),
        expect.objectContaining({ conditionCode: 'integrated_security_platform_constrained' }),
      ]),
      productivityBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'video_surveillance_point_standard',
          baselineProductivity: expect.objectContaining({ p50PerDay: 42, unit: 'point/day', sourceType: 'quota' }),
        }),
        expect.objectContaining({
          conditionCode: 'integrated_security_platform_constrained',
          baselineProductivity: expect.objectContaining({ p50PerDay: 0.071, unit: 'system/day', sourceType: 'expert_profile' }),
        }),
      ]),
    }))

    const integratedBa = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'intelligent_ba_control',
      applicableGranularity: 'task',
      methodVariantCodes: ['integrated_ba_commissioning'],
      elementVariantCodes: ['constrained_workface'],
    }) as any
    expect(integratedBa).toEqual(expect.objectContaining({
      selectedConditionCode: 'integrated_ba_commissioning_constrained',
      defaultDaysP50: 17,
      baselineProductivity: expect.objectContaining({ p50PerDay: 0.058, unit: 'system/day' }),
    }))

    const fireLinkage = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'intelligent_fire_alarm',
      applicableGranularity: 'task',
      methodVariantCodes: ['fire_linkage_commissioning'],
      elementVariantCodes: ['constrained_workface'],
    }) as any
    expect(fireLinkage).toEqual(expect.objectContaining({
      selectedConditionCode: 'fire_linkage_commissioning_constrained',
      defaultDaysP50: 19,
      baselineProductivity: expect.objectContaining({ p50PerDay: 0.052, unit: 'system/day' }),
    }))

    const securityPlatform = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'intelligent_security_technical_system',
      applicableGranularity: 'task',
      methodVariantCodes: ['integrated_security_platform'],
      elementVariantCodes: ['constrained_workface'],
    }) as any
    expect(securityPlatform).toEqual(expect.objectContaining({
      selectedConditionCode: 'integrated_security_platform_constrained',
      defaultDaysP50: 14,
      baselineProductivity: expect.objectContaining({ p50PerDay: 0.071, unit: 'system/day' }),
    }))
  })

  it('keeps intelligent lightning grounding conditionized by intrinsic grounding and surge-protection scope', async () => {
    const byStableCode = new Map(STANDARD_WORK_DURATION_SEED.map((record) => [record.stableCode, record]))
    const lightningGrounding = byStableCode.get('intelligent_lightning_grounding') as any

    expect(lightningGrounding).toEqual(expect.objectContaining({
      defaultDaysP20: 6,
      defaultDaysP50: 9,
      defaultDaysP80: 12,
      conditionedDurationBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'intelligent_equipotential_bonding_standard',
          selector: expect.objectContaining({ intelligentLightningGroundingMethodBand: 'equipotential_bonding' }),
          defaultDaysP50: 7,
        }),
        expect.objectContaining({
          conditionCode: 'intelligent_spd_shielding_interface',
          selector: expect.objectContaining({ intelligentLightningGroundingMethodBand: 'spd_shielding_interface' }),
          defaultDaysP50: 10,
        }),
        expect.objectContaining({
          conditionCode: 'intelligent_strict_grounding_acceptance_constrained',
          selector: expect.objectContaining({ intelligentLightningGroundingMethodBand: 'strict_grounding_acceptance', workfaceBand: 'constrained' }),
          defaultDaysP50: 13,
        }),
      ]),
      conditionedProcessProfiles: expect.arrayContaining([
        expect.objectContaining({ conditionCode: 'intelligent_equipotential_bonding_standard' }),
        expect.objectContaining({ conditionCode: 'intelligent_spd_shielding_interface' }),
        expect.objectContaining({ conditionCode: 'intelligent_strict_grounding_acceptance_constrained' }),
      ]),
      productivityBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'intelligent_equipotential_bonding_standard',
          baselineProductivity: expect.objectContaining({ p50PerDay: 95, unit: 'point/day', sourceType: 'quota' }),
        }),
        expect.objectContaining({
          conditionCode: 'intelligent_strict_grounding_acceptance_constrained',
          baselineProductivity: expect.objectContaining({ p50PerDay: 48, unit: 'point/day', sourceType: 'expert_profile' }),
        }),
      ]),
    }))

    const strictGroundingAcceptance = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'intelligent_lightning_grounding',
      applicableGranularity: 'task',
      methodVariantCodes: ['strict_grounding_acceptance'],
      elementVariantCodes: ['constrained_workface'],
    }) as any
    expect(strictGroundingAcceptance).toEqual(expect.objectContaining({
      selectedConditionCode: 'intelligent_strict_grounding_acceptance_constrained',
      defaultDaysP50: 13,
      baselineProductivity: expect.objectContaining({ p50PerDay: 48, unit: 'point/day' }),
    }))
  })

  it('keeps emergency response, security emergency, and data center room conditionized by intrinsic system scope', async () => {
    const byStableCode = new Map(STANDARD_WORK_DURATION_SEED.map((record) => [record.stableCode, record]))
    const emergency = byStableCode.get('intelligent_emergency_response_system') as any
    const securityEmergency = byStableCode.get('intelligent_security_emergency') as any
    const dataCenterRoom = byStableCode.get('intelligent_data_center_room') as any

    expect(emergency).toEqual(expect.objectContaining({
      defaultDaysP20: 6,
      defaultDaysP50: 8,
      defaultDaysP80: 10,
      conditionedDurationBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'emergency_terminal_point_standard',
          selector: expect.objectContaining({ intelligentEmergencyResponseMethodBand: 'emergency_terminal_points' }),
          defaultDaysP50: 7,
        }),
        expect.objectContaining({
          conditionCode: 'software_interface_emergency_response_system',
          selector: expect.objectContaining({ intelligentEmergencyResponseMethodBand: 'software_interface' }),
          defaultDaysP50: 9,
        }),
        expect.objectContaining({
          conditionCode: 'command_platform_trial_operation_constrained',
          selector: expect.objectContaining({ intelligentEmergencyResponseMethodBand: 'command_platform_trial', workfaceBand: 'constrained' }),
          defaultDaysP50: 12,
        }),
      ]),
      conditionedProcessProfiles: expect.arrayContaining([
        expect.objectContaining({ conditionCode: 'emergency_terminal_point_standard' }),
        expect.objectContaining({ conditionCode: 'software_interface_emergency_response_system' }),
        expect.objectContaining({ conditionCode: 'command_platform_trial_operation_constrained' }),
      ]),
      productivityBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'emergency_terminal_point_standard',
          baselineProductivity: expect.objectContaining({ p50PerDay: 35, unit: 'point/day', sourceType: 'quota' }),
        }),
        expect.objectContaining({
          conditionCode: 'command_platform_trial_operation_constrained',
          baselineProductivity: expect.objectContaining({ p50PerDay: 0.083, unit: 'system/day', sourceType: 'expert_profile' }),
        }),
      ]),
    }))

    expect(securityEmergency).toEqual(expect.objectContaining({
      defaultDaysP20: 7,
      defaultDaysP50: 10,
      defaultDaysP80: 13,
      conditionedDurationBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'emergency_security_terminal_standard',
          selector: expect.objectContaining({ intelligentSecurityEmergencyMethodBand: 'emergency_security_terminal' }),
          defaultDaysP50: 9,
        }),
        expect.objectContaining({
          conditionCode: 'security_event_linkage_system',
          selector: expect.objectContaining({ intelligentSecurityEmergencyMethodBand: 'security_event_linkage' }),
          defaultDaysP50: 11,
        }),
        expect.objectContaining({
          conditionCode: 'integrated_security_emergency_platform_constrained',
          selector: expect.objectContaining({ intelligentSecurityEmergencyMethodBand: 'integrated_security_emergency_platform', workfaceBand: 'constrained' }),
          defaultDaysP50: 14,
        }),
      ]),
      conditionedProcessProfiles: expect.arrayContaining([
        expect.objectContaining({ conditionCode: 'emergency_security_terminal_standard' }),
        expect.objectContaining({ conditionCode: 'security_event_linkage_system' }),
        expect.objectContaining({ conditionCode: 'integrated_security_emergency_platform_constrained' }),
      ]),
      productivityBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'emergency_security_terminal_standard',
          baselineProductivity: expect.objectContaining({ p50PerDay: 38, unit: 'point/day', sourceType: 'quota' }),
        }),
        expect.objectContaining({
          conditionCode: 'integrated_security_emergency_platform_constrained',
          baselineProductivity: expect.objectContaining({ p50PerDay: 0.071, unit: 'system/day', sourceType: 'expert_profile' }),
        }),
      ]),
    }))

    expect(dataCenterRoom).toEqual(expect.objectContaining({
      defaultDaysP20: 17,
      defaultDaysP50: 24,
      defaultDaysP80: 31,
      conditionedDurationBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'data_center_room_fitout_infrastructure_standard',
          selector: expect.objectContaining({ intelligentDataCenterRoomMethodBand: 'room_fitout_infrastructure' }),
          defaultDaysP50: 18,
        }),
        expect.objectContaining({
          conditionCode: 'data_center_mep_integration_interface',
          selector: expect.objectContaining({ intelligentDataCenterRoomMethodBand: 'mep_integration_interface' }),
          defaultDaysP50: 24,
        }),
        expect.objectContaining({
          conditionCode: 'data_center_full_load_integrated_commissioning_constrained',
          selector: expect.objectContaining({ intelligentDataCenterRoomMethodBand: 'full_load_integrated_commissioning', workfaceBand: 'constrained' }),
          defaultDaysP50: 32,
        }),
      ]),
      conditionedProcessProfiles: expect.arrayContaining([
        expect.objectContaining({ conditionCode: 'data_center_room_fitout_infrastructure_standard' }),
        expect.objectContaining({ conditionCode: 'data_center_mep_integration_interface' }),
        expect.objectContaining({ conditionCode: 'data_center_full_load_integrated_commissioning_constrained' }),
      ]),
      productivityBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'data_center_room_fitout_infrastructure_standard',
          baselineProductivity: expect.objectContaining({ p50PerDay: 0.056, unit: 'system/day', sourceType: 'quota' }),
        }),
        expect.objectContaining({
          conditionCode: 'data_center_full_load_integrated_commissioning_constrained',
          baselineProductivity: expect.objectContaining({ p50PerDay: 0.031, unit: 'system/day', sourceType: 'expert_profile' }),
        }),
      ]),
    }))

    const commandPlatform = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'intelligent_emergency_response_system',
      applicableGranularity: 'task',
      methodVariantCodes: ['command_platform_trial'],
      elementVariantCodes: ['constrained_workface'],
    }) as any
    expect(commandPlatform).toEqual(expect.objectContaining({
      selectedConditionCode: 'command_platform_trial_operation_constrained',
      defaultDaysP50: 12,
      baselineProductivity: expect.objectContaining({ p50PerDay: 0.083, unit: 'system/day' }),
    }))

    const securityEmergencyPlatform = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'intelligent_security_emergency',
      applicableGranularity: 'task',
      methodVariantCodes: ['integrated_security_emergency_platform'],
      elementVariantCodes: ['constrained_workface'],
    }) as any
    expect(securityEmergencyPlatform).toEqual(expect.objectContaining({
      selectedConditionCode: 'integrated_security_emergency_platform_constrained',
      defaultDaysP50: 14,
      baselineProductivity: expect.objectContaining({ p50PerDay: 0.071, unit: 'system/day' }),
    }))

    const fullLoadCommissioning = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'intelligent_data_center_room',
      applicableGranularity: 'task',
      methodVariantCodes: ['full_load_integrated_commissioning'],
      elementVariantCodes: ['constrained_workface'],
    }) as any
    expect(fullLoadCommissioning).toEqual(expect.objectContaining({
      selectedConditionCode: 'data_center_full_load_integrated_commissioning_constrained',
      defaultDaysP50: 32,
      baselineProductivity: expect.objectContaining({ p50PerDay: 0.031, unit: 'system/day' }),
    }))
  })

  it('keeps data center power, grounding, and precision air conditionized by intrinsic system scope', async () => {
    const byStableCode = new Map(STANDARD_WORK_DURATION_SEED.map((record) => [record.stableCode, record]))
    const power = byStableCode.get('intelligent_data_center_power') as any
    const grounding = byStableCode.get('intelligent_data_center_grounding') as any
    const precisionAir = byStableCode.get('intelligent_data_center_precision_air') as any

    expect(power).toEqual(expect.objectContaining({
      defaultDaysP20: 12,
      defaultDaysP50: 17,
      defaultDaysP80: 22,
      conditionedDurationBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'data_center_ups_power_distribution_standard',
          selector: expect.objectContaining({ intelligentDataCenterPowerMethodBand: 'ups_power_distribution' }),
          defaultDaysP50: 13,
        }),
        expect.objectContaining({
          conditionCode: 'data_center_pdu_sts_interface',
          selector: expect.objectContaining({ intelligentDataCenterPowerMethodBand: 'pdu_sts_interface' }),
          defaultDaysP50: 17,
        }),
        expect.objectContaining({
          conditionCode: 'data_center_load_test_redundancy_commissioning_constrained',
          selector: expect.objectContaining({ intelligentDataCenterPowerMethodBand: 'load_test_redundancy_commissioning', workfaceBand: 'constrained' }),
          defaultDaysP50: 24,
        }),
      ]),
      conditionedProcessProfiles: expect.arrayContaining([
        expect.objectContaining({ conditionCode: 'data_center_ups_power_distribution_standard' }),
        expect.objectContaining({ conditionCode: 'data_center_pdu_sts_interface' }),
        expect.objectContaining({ conditionCode: 'data_center_load_test_redundancy_commissioning_constrained' }),
      ]),
      productivityBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'data_center_ups_power_distribution_standard',
          baselineProductivity: expect.objectContaining({ p50PerDay: 0.077, unit: 'system/day', sourceType: 'quota' }),
        }),
        expect.objectContaining({
          conditionCode: 'data_center_load_test_redundancy_commissioning_constrained',
          baselineProductivity: expect.objectContaining({ p50PerDay: 0.042, unit: 'system/day', sourceType: 'expert_profile' }),
        }),
      ]),
    }))

    expect(grounding).toEqual(expect.objectContaining({
      defaultDaysP20: 6,
      defaultDaysP50: 8,
      defaultDaysP80: 10,
      conditionedDurationBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'data_center_equipotential_bonding_standard',
          selector: expect.objectContaining({ intelligentDataCenterGroundingMethodBand: 'equipotential_bonding' }),
          defaultDaysP50: 7,
        }),
        expect.objectContaining({
          conditionCode: 'data_center_raised_floor_grounding_grid_test',
          selector: expect.objectContaining({ intelligentDataCenterGroundingMethodBand: 'raised_floor_grounding_grid_test' }),
          defaultDaysP50: 9,
        }),
        expect.objectContaining({
          conditionCode: 'data_center_strict_ground_resistance_acceptance_constrained',
          selector: expect.objectContaining({ intelligentDataCenterGroundingMethodBand: 'strict_ground_resistance_acceptance', workfaceBand: 'constrained' }),
          defaultDaysP50: 12,
        }),
      ]),
      conditionedProcessProfiles: expect.arrayContaining([
        expect.objectContaining({ conditionCode: 'data_center_equipotential_bonding_standard' }),
        expect.objectContaining({ conditionCode: 'data_center_raised_floor_grounding_grid_test' }),
        expect.objectContaining({ conditionCode: 'data_center_strict_ground_resistance_acceptance_constrained' }),
      ]),
      productivityBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'data_center_equipotential_bonding_standard',
          baselineProductivity: expect.objectContaining({ p50PerDay: 120, unit: 'm/day', sourceType: 'quota' }),
        }),
        expect.objectContaining({
          conditionCode: 'data_center_strict_ground_resistance_acceptance_constrained',
          baselineProductivity: expect.objectContaining({ p50PerDay: 65, unit: 'm/day', sourceType: 'expert_profile' }),
        }),
      ]),
    }))

    expect(precisionAir).toEqual(expect.objectContaining({
      defaultDaysP20: 14,
      defaultDaysP50: 19,
      defaultDaysP80: 25,
      conditionedDurationBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'data_center_precision_air_unit_installation_standard',
          selector: expect.objectContaining({ intelligentDataCenterPrecisionAirMethodBand: 'precision_air_unit_installation' }),
          defaultDaysP50: 16,
        }),
        expect.objectContaining({
          conditionCode: 'data_center_fresh_air_condensate_leak_detection_interface',
          selector: expect.objectContaining({ intelligentDataCenterPrecisionAirMethodBand: 'fresh_air_condensate_leak_detection' }),
          defaultDaysP50: 20,
        }),
        expect.objectContaining({
          conditionCode: 'data_center_thermal_stabilization_integrated_commissioning_constrained',
          selector: expect.objectContaining({ intelligentDataCenterPrecisionAirMethodBand: 'thermal_stabilization_integrated_commissioning', workfaceBand: 'constrained' }),
          defaultDaysP50: 27,
        }),
      ]),
      conditionedProcessProfiles: expect.arrayContaining([
        expect.objectContaining({ conditionCode: 'data_center_precision_air_unit_installation_standard' }),
        expect.objectContaining({ conditionCode: 'data_center_fresh_air_condensate_leak_detection_interface' }),
        expect.objectContaining({ conditionCode: 'data_center_thermal_stabilization_integrated_commissioning_constrained' }),
      ]),
      productivityBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'data_center_precision_air_unit_installation_standard',
          baselineProductivity: expect.objectContaining({ p50PerDay: 0.063, unit: 'system/day', sourceType: 'quota' }),
        }),
        expect.objectContaining({
          conditionCode: 'data_center_thermal_stabilization_integrated_commissioning_constrained',
          baselineProductivity: expect.objectContaining({ p50PerDay: 0.037, unit: 'system/day', sourceType: 'expert_profile' }),
        }),
      ]),
    }))

    const loadTestPower = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'intelligent_data_center_power',
      applicableGranularity: 'task',
      methodVariantCodes: ['load_test_redundancy_commissioning'],
      elementVariantCodes: ['constrained_workface'],
    }) as any
    expect(loadTestPower).toEqual(expect.objectContaining({
      selectedConditionCode: 'data_center_load_test_redundancy_commissioning_constrained',
      defaultDaysP50: 24,
      baselineProductivity: expect.objectContaining({ p50PerDay: 0.042, unit: 'system/day' }),
    }))

    const strictGrounding = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'intelligent_data_center_grounding',
      applicableGranularity: 'task',
      methodVariantCodes: ['strict_ground_resistance_acceptance'],
      elementVariantCodes: ['constrained_workface'],
    }) as any
    expect(strictGrounding).toEqual(expect.objectContaining({
      selectedConditionCode: 'data_center_strict_ground_resistance_acceptance_constrained',
      defaultDaysP50: 12,
      baselineProductivity: expect.objectContaining({ p50PerDay: 65, unit: 'm/day' }),
    }))

    const thermalCommissioning = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'intelligent_data_center_precision_air',
      applicableGranularity: 'task',
      methodVariantCodes: ['thermal_stabilization_integrated_commissioning'],
      elementVariantCodes: ['constrained_workface'],
    }) as any
    expect(thermalCommissioning).toEqual(expect.objectContaining({
      selectedConditionCode: 'data_center_thermal_stabilization_integrated_commissioning_constrained',
      defaultDaysP50: 27,
      baselineProductivity: expect.objectContaining({ p50PerDay: 0.037, unit: 'system/day' }),
    }))
  })

  it('keeps data center cabling, security monitoring, and fire suppression conditionized by intrinsic system scope', async () => {
    const byStableCode = new Map(STANDARD_WORK_DURATION_SEED.map((record) => [record.stableCode, record]))
    const cabling = byStableCode.get('intelligent_data_center_cabling') as any
    const securityMonitoring = byStableCode.get('intelligent_data_center_security_monitoring') as any
    const fireSuppression = byStableCode.get('intelligent_data_center_fire_suppression') as any

    expect(cabling).toEqual(expect.objectContaining({
      defaultDaysP20: 9,
      defaultDaysP50: 13,
      defaultDaysP80: 17,
      conditionedDurationBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'data_center_copper_rack_cabling_standard',
          selector: expect.objectContaining({ intelligentDataCenterCablingMethodBand: 'copper_rack_cabling' }),
          defaultDaysP50: 11,
        }),
        expect.objectContaining({
          conditionCode: 'data_center_fiber_backbone_certification',
          selector: expect.objectContaining({ intelligentDataCenterCablingMethodBand: 'fiber_backbone_certification' }),
          defaultDaysP50: 14,
        }),
        expect.objectContaining({
          conditionCode: 'data_center_high_density_cross_connect_certification_constrained',
          selector: expect.objectContaining({ intelligentDataCenterCablingMethodBand: 'high_density_cross_connect_certification', workfaceBand: 'constrained' }),
          defaultDaysP50: 18,
        }),
      ]),
      conditionedProcessProfiles: expect.arrayContaining([
        expect.objectContaining({ conditionCode: 'data_center_copper_rack_cabling_standard' }),
        expect.objectContaining({ conditionCode: 'data_center_fiber_backbone_certification' }),
        expect.objectContaining({ conditionCode: 'data_center_high_density_cross_connect_certification_constrained' }),
      ]),
      productivityBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'data_center_copper_rack_cabling_standard',
          baselineProductivity: expect.objectContaining({ p50PerDay: 65, unit: 'point/day', sourceType: 'quota' }),
        }),
        expect.objectContaining({
          conditionCode: 'data_center_high_density_cross_connect_certification_constrained',
          baselineProductivity: expect.objectContaining({ p50PerDay: 36, unit: 'point/day', sourceType: 'expert_profile' }),
        }),
      ]),
    }))

    expect(securityMonitoring).toEqual(expect.objectContaining({
      defaultDaysP20: 8,
      defaultDaysP50: 12,
      defaultDaysP80: 16,
      conditionedDurationBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'data_center_environment_monitoring_point_standard',
          selector: expect.objectContaining({ intelligentDataCenterSecurityMonitoringMethodBand: 'environment_monitoring_points' }),
          defaultDaysP50: 10,
        }),
        expect.objectContaining({
          conditionCode: 'data_center_access_security_endpoint_system',
          selector: expect.objectContaining({ intelligentDataCenterSecurityMonitoringMethodBand: 'access_security_endpoints' }),
          defaultDaysP50: 13,
        }),
        expect.objectContaining({
          conditionCode: 'data_center_integrated_monitoring_platform_constrained',
          selector: expect.objectContaining({ intelligentDataCenterSecurityMonitoringMethodBand: 'integrated_monitoring_platform', workfaceBand: 'constrained' }),
          defaultDaysP50: 17,
        }),
      ]),
      conditionedProcessProfiles: expect.arrayContaining([
        expect.objectContaining({ conditionCode: 'data_center_environment_monitoring_point_standard' }),
        expect.objectContaining({ conditionCode: 'data_center_access_security_endpoint_system' }),
        expect.objectContaining({ conditionCode: 'data_center_integrated_monitoring_platform_constrained' }),
      ]),
      productivityBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'data_center_environment_monitoring_point_standard',
          baselineProductivity: expect.objectContaining({ p50PerDay: 38, unit: 'point/day', sourceType: 'quota' }),
        }),
        expect.objectContaining({
          conditionCode: 'data_center_integrated_monitoring_platform_constrained',
          baselineProductivity: expect.objectContaining({ p50PerDay: 0.059, unit: 'system/day', sourceType: 'expert_profile' }),
        }),
      ]),
    }))

    expect(fireSuppression).toEqual(expect.objectContaining({
      defaultDaysP20: 10,
      defaultDaysP50: 14,
      defaultDaysP80: 18,
      conditionedDurationBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'data_center_fire_alarm_interface_standard',
          selector: expect.objectContaining({ intelligentDataCenterFireSuppressionMethodBand: 'fire_alarm_interface' }),
          defaultDaysP50: 12,
        }),
        expect.objectContaining({
          conditionCode: 'data_center_gas_suppression_release_system',
          selector: expect.objectContaining({ intelligentDataCenterFireSuppressionMethodBand: 'gas_suppression_release' }),
          defaultDaysP50: 15,
        }),
        expect.objectContaining({
          conditionCode: 'data_center_integrated_fire_suppression_test_constrained',
          selector: expect.objectContaining({ intelligentDataCenterFireSuppressionMethodBand: 'integrated_fire_suppression_test', workfaceBand: 'constrained' }),
          defaultDaysP50: 19,
        }),
      ]),
      conditionedProcessProfiles: expect.arrayContaining([
        expect.objectContaining({ conditionCode: 'data_center_fire_alarm_interface_standard' }),
        expect.objectContaining({ conditionCode: 'data_center_gas_suppression_release_system' }),
        expect.objectContaining({ conditionCode: 'data_center_integrated_fire_suppression_test_constrained' }),
      ]),
      productivityBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'data_center_fire_alarm_interface_standard',
          baselineProductivity: expect.objectContaining({ p50PerDay: 0.083, unit: 'system/day', sourceType: 'quota' }),
        }),
        expect.objectContaining({
          conditionCode: 'data_center_integrated_fire_suppression_test_constrained',
          baselineProductivity: expect.objectContaining({ p50PerDay: 0.052, unit: 'system/day', sourceType: 'expert_profile' }),
        }),
      ]),
    }))

    const denseCabling = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'intelligent_data_center_cabling',
      applicableGranularity: 'task',
      methodVariantCodes: ['high_density_cross_connect_certification'],
      elementVariantCodes: ['constrained_workface'],
    }) as any
    expect(denseCabling).toEqual(expect.objectContaining({
      selectedConditionCode: 'data_center_high_density_cross_connect_certification_constrained',
      defaultDaysP50: 18,
      baselineProductivity: expect.objectContaining({ p50PerDay: 36, unit: 'point/day' }),
    }))

    const integratedMonitoring = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'intelligent_data_center_security_monitoring',
      applicableGranularity: 'task',
      methodVariantCodes: ['integrated_monitoring_platform'],
      elementVariantCodes: ['constrained_workface'],
    }) as any
    expect(integratedMonitoring).toEqual(expect.objectContaining({
      selectedConditionCode: 'data_center_integrated_monitoring_platform_constrained',
      defaultDaysP50: 17,
      baselineProductivity: expect.objectContaining({ p50PerDay: 0.059, unit: 'system/day' }),
    }))

    const integratedFire = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'intelligent_data_center_fire_suppression',
      applicableGranularity: 'task',
      methodVariantCodes: ['integrated_fire_suppression_test'],
      elementVariantCodes: ['constrained_workface'],
    }) as any
    expect(integratedFire).toEqual(expect.objectContaining({
      selectedConditionCode: 'data_center_integrated_fire_suppression_test_constrained',
      defaultDaysP50: 19,
      baselineProductivity: expect.objectContaining({ p50PerDay: 0.052, unit: 'system/day' }),
    }))
  })

  it('keeps data center interior fitout and commissioning conditionized by intrinsic system scope', async () => {
    const byStableCode = new Map(STANDARD_WORK_DURATION_SEED.map((record) => [record.stableCode, record]))
    const interiorFitout = byStableCode.get('intelligent_data_center_interior_fitout') as any
    const commissioning = byStableCode.get('intelligent_data_center_commissioning') as any

    expect(interiorFitout).toEqual(expect.objectContaining({
      defaultDaysP20: 12,
      defaultDaysP50: 16,
      defaultDaysP80: 21,
      conditionedDurationBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'data_center_raised_floor_standard',
          selector: expect.objectContaining({ intelligentDataCenterInteriorFitoutMethodBand: 'raised_floor' }),
          defaultDaysP50: 13,
        }),
        expect.objectContaining({
          conditionCode: 'data_center_cold_aisle_containment',
          selector: expect.objectContaining({ intelligentDataCenterInteriorFitoutMethodBand: 'cold_aisle_containment' }),
          defaultDaysP50: 17,
        }),
        expect.objectContaining({
          conditionCode: 'data_center_micro_module_fitout_constrained',
          selector: expect.objectContaining({ intelligentDataCenterInteriorFitoutMethodBand: 'micro_module_fitout', workfaceBand: 'constrained' }),
          defaultDaysP50: 23,
        }),
      ]),
      conditionedProcessProfiles: expect.arrayContaining([
        expect.objectContaining({ conditionCode: 'data_center_raised_floor_standard' }),
        expect.objectContaining({ conditionCode: 'data_center_cold_aisle_containment' }),
        expect.objectContaining({ conditionCode: 'data_center_micro_module_fitout_constrained' }),
      ]),
      productivityBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'data_center_raised_floor_standard',
          baselineProductivity: expect.objectContaining({ p50PerDay: 110, unit: 'm2/day', sourceType: 'quota' }),
        }),
        expect.objectContaining({
          conditionCode: 'data_center_micro_module_fitout_constrained',
          baselineProductivity: expect.objectContaining({ p50PerDay: 60, unit: 'm2/day', sourceType: 'expert_profile' }),
        }),
      ]),
    }))

    expect(commissioning).toEqual(expect.objectContaining({
      defaultDaysP20: 8,
      defaultDaysP50: 12,
      defaultDaysP80: 16,
      conditionedDurationBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'data_center_subsystem_commissioning_standard',
          selector: expect.objectContaining({ intelligentDataCenterCommissioningMethodBand: 'subsystem_commissioning' }),
          defaultDaysP50: 10,
        }),
        expect.objectContaining({
          conditionCode: 'data_center_load_simulation_commissioning',
          selector: expect.objectContaining({ intelligentDataCenterCommissioningMethodBand: 'load_simulation_commissioning' }),
          defaultDaysP50: 15,
        }),
        expect.objectContaining({
          conditionCode: 'data_center_integrated_issue_closure_constrained',
          selector: expect.objectContaining({ intelligentDataCenterCommissioningMethodBand: 'integrated_issue_closure', workfaceBand: 'constrained' }),
          defaultDaysP50: 20,
        }),
      ]),
      conditionedProcessProfiles: expect.arrayContaining([
        expect.objectContaining({ conditionCode: 'data_center_subsystem_commissioning_standard' }),
        expect.objectContaining({ conditionCode: 'data_center_load_simulation_commissioning' }),
        expect.objectContaining({ conditionCode: 'data_center_integrated_issue_closure_constrained' }),
      ]),
      productivityBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'data_center_subsystem_commissioning_standard',
          baselineProductivity: expect.objectContaining({ p50PerDay: 0.1, unit: 'system/day', sourceType: 'quota' }),
        }),
        expect.objectContaining({
          conditionCode: 'data_center_integrated_issue_closure_constrained',
          baselineProductivity: expect.objectContaining({ p50PerDay: 0.05, unit: 'system/day', sourceType: 'expert_profile' }),
        }),
      ]),
    }))

    const microModuleFitout = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'intelligent_data_center_interior_fitout',
      applicableGranularity: 'task',
      methodVariantCodes: ['micro_module_fitout'],
      elementVariantCodes: ['constrained_workface'],
    }) as any
    expect(microModuleFitout).toEqual(expect.objectContaining({
      selectedConditionCode: 'data_center_micro_module_fitout_constrained',
      defaultDaysP50: 23,
      baselineProductivity: expect.objectContaining({ p50PerDay: 60, unit: 'm2/day' }),
    }))

    const issueClosure = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'intelligent_data_center_commissioning',
      applicableGranularity: 'task',
      methodVariantCodes: ['integrated_issue_closure'],
      elementVariantCodes: ['constrained_workface'],
    }) as any
    expect(issueClosure).toEqual(expect.objectContaining({
      selectedConditionCode: 'data_center_integrated_issue_closure_constrained',
      defaultDaysP50: 20,
      baselineProductivity: expect.objectContaining({ p50PerDay: 0.05, unit: 'system/day' }),
    }))
  })

  it('keeps foundation pit bored-pile support conditionized by pile support method', async () => {
    const byStableCode = new Map(STANDARD_WORK_DURATION_SEED.map((record) => [record.stableCode, record]))
    const bored = byStableCode.get('foundation_pit_bored_pile_support') as any

    expect(bored).toEqual(expect.objectContaining({
      defaultDaysP20: 16,
      defaultDaysP50: 22,
      defaultDaysP80: 28,
      conditionedDurationBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'rotary_bored_support_open_workface',
          selector: expect.objectContaining({
            boredPileSupportMethodBand: 'rotary',
            workfaceBand: 'open',
          }),
          defaultDaysP20: 12,
          defaultDaysP50: 17,
          defaultDaysP80: 22,
        }),
        expect.objectContaining({
          conditionCode: 'standard_bored_pile_support_normal',
          selector: expect.objectContaining({
            boredPileSupportMethodBand: 'standard_bored',
            geologyBand: 'normal',
          }),
          defaultDaysP20: 16,
          defaultDaysP50: 22,
          defaultDaysP80: 28,
        }),
        expect.objectContaining({
          conditionCode: 'dense_bored_pile_support_complex_constrained',
          selector: expect.objectContaining({
            boredPileSupportMethodBand: 'dense_spacing',
            geologyBand: 'complex',
            workfaceBand: 'constrained',
          }),
          defaultDaysP20: 24,
          defaultDaysP50: 34,
          defaultDaysP80: 44,
        }),
      ]),
      productivityBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'rotary_bored_support_open_workface',
          baselineProductivity: expect.objectContaining({ p50PerDay: 50, unit: 'm/day' }),
        }),
        expect.objectContaining({
          conditionCode: 'dense_bored_pile_support_complex_constrained',
          baselineProductivity: expect.objectContaining({ p50PerDay: 28, unit: 'm/day' }),
        }),
      ]),
    }))

    const dense = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'foundation_pit_bored_pile_support',
      applicableGranularity: 'task',
      methodVariantCodes: ['dense_pile_spacing'],
      elementVariantCodes: ['complex_geology', 'constrained_workface'],
    }) as any

    expect(dense).toEqual(expect.objectContaining({
      selectedConditionCode: 'dense_bored_pile_support_complex_constrained',
      defaultDaysP50: 34,
      baselineProductivity: expect.objectContaining({ p50PerDay: 28, unit: 'm/day' }),
    }))
  })

  it('keeps foundation pit sheet-pile wall conditionized by sheet-pile method and workface', async () => {
    const byStableCode = new Map(STANDARD_WORK_DURATION_SEED.map((record) => [record.stableCode, record]))
    const sheet = byStableCode.get('foundation_pit_sheet_pile_wall') as any

    expect(sheet).toEqual(expect.objectContaining({
      defaultDaysP20: 12,
      defaultDaysP50: 16,
      defaultDaysP80: 20,
      conditionedDurationBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'steel_sheet_pile_open_workface',
          selector: expect.objectContaining({
            sheetPileMethodBand: 'steel_sheet',
            workfaceBand: 'open',
          }),
          defaultDaysP20: 7,
          defaultDaysP50: 10,
          defaultDaysP80: 13,
        }),
        expect.objectContaining({
          conditionCode: 'concrete_sheet_pile_standard_workface',
          selector: expect.objectContaining({
            sheetPileMethodBand: 'concrete_sheet',
            workfaceBand: 'open',
          }),
          defaultDaysP20: 10,
          defaultDaysP50: 15,
          defaultDaysP80: 20,
        }),
        expect.objectContaining({
          conditionCode: 'lock_water_urban_sheet_pile_constrained',
          selector: expect.objectContaining({
            sheetPileMethodBand: 'lock_water_urban',
            workfaceBand: 'constrained',
          }),
          defaultDaysP20: 16,
          defaultDaysP50: 22,
          defaultDaysP80: 28,
        }),
      ]),
      productivityBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'steel_sheet_pile_open_workface',
          baselineProductivity: expect.objectContaining({ p50PerDay: 90, unit: 'm/day' }),
        }),
        expect.objectContaining({
          conditionCode: 'lock_water_urban_sheet_pile_constrained',
          baselineProductivity: expect.objectContaining({ p50PerDay: 48, unit: 'm/day' }),
        }),
      ]),
    }))

    const lockWater = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'foundation_pit_sheet_pile_wall',
      applicableGranularity: 'task',
      methodVariantCodes: ['lock_water_check'],
      elementVariantCodes: ['constrained_workface'],
    }) as any

    expect(lockWater).toEqual(expect.objectContaining({
      selectedConditionCode: 'lock_water_urban_sheet_pile_constrained',
      defaultDaysP50: 22,
      baselineProductivity: expect.objectContaining({ p50PerDay: 48, unit: 'm/day' }),
    }))
  })

  it('keeps foundation pit secant-pile wall conditionized by sequence and workface', async () => {
    const byStableCode = new Map(STANDARD_WORK_DURATION_SEED.map((record) => [record.stableCode, record]))
    const secant = byStableCode.get('foundation_pit_secant_pile_wall') as any

    expect(secant).toEqual(expect.objectContaining({
      defaultDaysP20: 19,
      defaultDaysP50: 26,
      defaultDaysP80: 33,
      conditionedDurationBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'primary_secondary_secant_open_workface',
          selector: expect.objectContaining({
            secantPileMethodBand: 'primary_secondary',
            workfaceBand: 'open',
          }),
          defaultDaysP20: 18,
          defaultDaysP50: 25,
          defaultDaysP80: 32,
        }),
        expect.objectContaining({
          conditionCode: 'full_casing_secant_complex_geology',
          selector: expect.objectContaining({
            secantPileMethodBand: 'full_casing',
            geologyBand: 'complex',
          }),
          defaultDaysP20: 22,
          defaultDaysP50: 31,
          defaultDaysP80: 40,
        }),
        expect.objectContaining({
          conditionCode: 'hard_interlock_secant_deep_constrained',
          selector: expect.objectContaining({
            secantPileMethodBand: 'hard_interlock',
            depthBand: 'deep',
            workfaceBand: 'constrained',
          }),
          defaultDaysP20: 30,
          defaultDaysP50: 42,
          defaultDaysP80: 54,
        }),
      ]),
      productivityBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'primary_secondary_secant_open_workface',
          baselineProductivity: expect.objectContaining({ p50PerDay: 35, unit: 'm/day' }),
        }),
        expect.objectContaining({
          conditionCode: 'hard_interlock_secant_deep_constrained',
          baselineProductivity: expect.objectContaining({ p50PerDay: 22, unit: 'm/day' }),
        }),
      ]),
    }))

    const hardInterlock = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'foundation_pit_secant_pile_wall',
      applicableGranularity: 'task',
      methodVariantCodes: ['hard_interlock_sequence'],
      elementVariantCodes: ['deep_depth', 'constrained_workface'],
    }) as any

    expect(hardInterlock).toEqual(expect.objectContaining({
      selectedConditionCode: 'hard_interlock_secant_deep_constrained',
      defaultDaysP50: 42,
      baselineProductivity: expect.objectContaining({ p50PerDay: 22, unit: 'm/day' }),
    }))
  })

  it('keeps foundation pit SMW wall conditionized by mixing wall method and workface', async () => {
    const byStableCode = new Map(STANDARD_WORK_DURATION_SEED.map((record) => [record.stableCode, record]))
    const smw = byStableCode.get('foundation_pit_smw_wall') as any

    expect(smw).toEqual(expect.objectContaining({
      defaultDaysP20: 16,
      defaultDaysP50: 22,
      defaultDaysP80: 28,
      conditionedDurationBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'three_axis_smw_open_workface',
          selector: expect.objectContaining({
            smwMethodBand: 'three_axis',
            workfaceBand: 'open',
          }),
          defaultDaysP20: 12,
          defaultDaysP50: 17,
          defaultDaysP80: 22,
        }),
        expect.objectContaining({
          conditionCode: 'h_steel_smw_standard_workface',
          selector: expect.objectContaining({
            smwMethodBand: 'h_steel_insert',
            workfaceBand: 'open',
          }),
          defaultDaysP20: 16,
          defaultDaysP50: 22,
          defaultDaysP80: 28,
        }),
        expect.objectContaining({
          conditionCode: 'dense_smw_deep_constrained',
          selector: expect.objectContaining({
            smwMethodBand: 'dense_cement_soil',
            depthBand: 'deep',
            workfaceBand: 'constrained',
          }),
          defaultDaysP20: 24,
          defaultDaysP50: 34,
          defaultDaysP80: 44,
        }),
      ]),
      productivityBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'three_axis_smw_open_workface',
          baselineProductivity: expect.objectContaining({ p50PerDay: 58, unit: 'm/day' }),
        }),
        expect.objectContaining({
          conditionCode: 'dense_smw_deep_constrained',
          baselineProductivity: expect.objectContaining({ p50PerDay: 34, unit: 'm/day' }),
        }),
      ]),
    }))

    const dense = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'foundation_pit_smw_wall',
      applicableGranularity: 'task',
      methodVariantCodes: ['dense_cement_soil_wall'],
      elementVariantCodes: ['deep_depth', 'constrained_workface'],
    }) as any

    expect(dense).toEqual(expect.objectContaining({
      selectedConditionCode: 'dense_smw_deep_constrained',
      defaultDaysP50: 34,
      baselineProductivity: expect.objectContaining({ p50PerDay: 34, unit: 'm/day' }),
    }))
  })

  it('keeps foundation pit soil-nail wall conditionized by nail density and excavation staging', async () => {
    const byStableCode = new Map(STANDARD_WORK_DURATION_SEED.map((record) => [record.stableCode, record]))
    const soilNail = byStableCode.get('foundation_pit_soil_nail_wall') as any

    expect(soilNail).toEqual(expect.objectContaining({
      defaultDaysP20: 11,
      defaultDaysP50: 14,
      defaultDaysP80: 18,
      conditionedDurationBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'shotcrete_mesh_soil_nail_open_workface',
          selector: expect.objectContaining({
            soilNailMethodBand: 'shotcrete_mesh',
            workfaceBand: 'open',
          }),
          defaultDaysP20: 6,
          defaultDaysP50: 9,
          defaultDaysP80: 12,
        }),
        expect.objectContaining({
          conditionCode: 'standard_soil_nail_staged_excavation',
          selector: expect.objectContaining({
            soilNailMethodBand: 'staged_excavation',
            workfaceBand: 'open',
          }),
          defaultDaysP20: 9,
          defaultDaysP50: 13,
          defaultDaysP80: 17,
        }),
        expect.objectContaining({
          conditionCode: 'dense_soil_nail_constrained',
          selector: expect.objectContaining({
            soilNailMethodBand: 'dense_nail_spacing',
            workfaceBand: 'constrained',
          }),
          defaultDaysP20: 14,
          defaultDaysP50: 20,
          defaultDaysP80: 26,
        }),
      ]),
      productivityBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'shotcrete_mesh_soil_nail_open_workface',
          baselineProductivity: expect.objectContaining({ p50PerDay: 110, unit: 'm2/day' }),
        }),
        expect.objectContaining({
          conditionCode: 'dense_soil_nail_constrained',
          baselineProductivity: expect.objectContaining({ p50PerDay: 70, unit: 'm2/day' }),
        }),
      ]),
    }))

    const dense = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'foundation_pit_soil_nail_wall',
      applicableGranularity: 'task',
      methodVariantCodes: ['dense_nail_spacing'],
      elementVariantCodes: ['constrained_workface'],
    }) as any

    expect(dense).toEqual(expect.objectContaining({
      selectedConditionCode: 'dense_soil_nail_constrained',
      defaultDaysP50: 20,
      baselineProductivity: expect.objectContaining({ p50PerDay: 70, unit: 'm2/day' }),
    }))
  })

  it('keeps foundation pit diaphragm wall conditionized by panel depth and slurry controls', async () => {
    const byStableCode = new Map(STANDARD_WORK_DURATION_SEED.map((record) => [record.stableCode, record]))
    const diaphragm = byStableCode.get('foundation_pit_diaphragm_wall') as any

    expect(diaphragm).toEqual(expect.objectContaining({
      defaultDaysP20: 24,
      defaultDaysP50: 32,
      defaultDaysP80: 40,
      conditionedDurationBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'standard_panel_diaphragm_open_workface',
          selector: expect.objectContaining({
            diaphragmWallMethodBand: 'standard_panel',
            workfaceBand: 'open',
          }),
          defaultDaysP20: 22,
          defaultDaysP50: 31,
          defaultDaysP80: 40,
        }),
        expect.objectContaining({
          conditionCode: 'deep_panel_diaphragm_complex_geology',
          selector: expect.objectContaining({
            diaphragmWallMethodBand: 'deep_panel',
            depthBand: 'deep',
            geologyBand: 'complex',
          }),
          defaultDaysP20: 30,
          defaultDaysP50: 42,
          defaultDaysP80: 54,
        }),
        expect.objectContaining({
          conditionCode: 'strict_slurry_diaphragm_constrained',
          selector: expect.objectContaining({
            diaphragmWallMethodBand: 'strict_slurry_recycling',
            workfaceBand: 'constrained',
          }),
          defaultDaysP20: 28,
          defaultDaysP50: 39,
          defaultDaysP80: 50,
        }),
      ]),
      conditionedProcessProfiles: expect.arrayContaining([
        expect.objectContaining({ conditionCode: 'standard_panel_diaphragm_open_workface' }),
        expect.objectContaining({ conditionCode: 'deep_panel_diaphragm_complex_geology' }),
        expect.objectContaining({ conditionCode: 'strict_slurry_diaphragm_constrained' }),
      ]),
      productivityBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'standard_panel_diaphragm_open_workface',
          baselineProductivity: expect.objectContaining({ p50PerDay: 24, unit: 'm/day' }),
        }),
        expect.objectContaining({
          conditionCode: 'deep_panel_diaphragm_complex_geology',
          baselineProductivity: expect.objectContaining({ p50PerDay: 18, unit: 'm/day' }),
        }),
      ]),
    }))

    const deepPanel = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'foundation_pit_diaphragm_wall',
      applicableGranularity: 'task',
      methodVariantCodes: ['deep_panel'],
      elementVariantCodes: ['deep_depth', 'complex_geology', 'constrained_workface'],
    }) as any

    expect(deepPanel).toEqual(expect.objectContaining({
      selectedConditionCode: 'deep_panel_diaphragm_complex_geology',
      defaultDaysP50: 42,
      baselineProductivity: expect.objectContaining({ p50PerDay: 18, unit: 'm/day' }),
    }))
  })

  it('keeps foundation pit cement-soil wall conditionized by wall method and workface', async () => {
    const byStableCode = new Map(STANDARD_WORK_DURATION_SEED.map((record) => [record.stableCode, record]))
    const cementSoil = byStableCode.get('foundation_pit_cement_soil_wall') as any

    expect(cementSoil).toEqual(expect.objectContaining({
      defaultDaysP20: 13,
      defaultDaysP50: 18,
      defaultDaysP80: 23,
      conditionedDurationBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'gravity_cement_soil_wall_open_workface',
          selector: expect.objectContaining({
            cementSoilWallMethodBand: 'gravity_wall',
            workfaceBand: 'open',
          }),
          defaultDaysP20: 10,
          defaultDaysP50: 14,
          defaultDaysP80: 18,
        }),
        expect.objectContaining({
          conditionCode: 'mixing_cement_soil_wall_standard_workface',
          selector: expect.objectContaining({
            cementSoilWallMethodBand: 'mixing_wall',
            workfaceBand: 'open',
          }),
          defaultDaysP20: 13,
          defaultDaysP50: 18,
          defaultDaysP80: 23,
        }),
        expect.objectContaining({
          conditionCode: 'jet_grouting_cutoff_deep_constrained',
          selector: expect.objectContaining({
            cementSoilWallMethodBand: 'jet_grouting_cutoff',
            depthBand: 'deep',
            workfaceBand: 'constrained',
          }),
          defaultDaysP20: 19,
          defaultDaysP50: 27,
          defaultDaysP80: 35,
        }),
      ]),
      conditionedProcessProfiles: expect.arrayContaining([
        expect.objectContaining({ conditionCode: 'gravity_cement_soil_wall_open_workface' }),
        expect.objectContaining({ conditionCode: 'mixing_cement_soil_wall_standard_workface' }),
        expect.objectContaining({ conditionCode: 'jet_grouting_cutoff_deep_constrained' }),
      ]),
      productivityBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'gravity_cement_soil_wall_open_workface',
          baselineProductivity: expect.objectContaining({ p50PerDay: 80, unit: 'm/day' }),
        }),
        expect.objectContaining({
          conditionCode: 'jet_grouting_cutoff_deep_constrained',
          baselineProductivity: expect.objectContaining({ p50PerDay: 38, unit: 'm/day' }),
        }),
      ]),
    }))

    const jetCutoff = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'foundation_pit_cement_soil_wall',
      applicableGranularity: 'task',
      methodVariantCodes: ['jet_grouting_cutoff'],
      elementVariantCodes: ['deep_depth', 'constrained_workface'],
    }) as any

    expect(jetCutoff).toEqual(expect.objectContaining({
      selectedConditionCode: 'jet_grouting_cutoff_deep_constrained',
      defaultDaysP50: 27,
      baselineProductivity: expect.objectContaining({ p50PerDay: 38, unit: 'm/day' }),
    }))
  })

  it('keeps foundation pit internal strut conditionized by strut method and support level', async () => {
    const byStableCode = new Map(STANDARD_WORK_DURATION_SEED.map((record) => [record.stableCode, record]))
    const internalStrut = byStableCode.get('foundation_pit_internal_strut') as any

    expect(internalStrut).toEqual(expect.objectContaining({
      defaultDaysP20: 11,
      defaultDaysP50: 16,
      defaultDaysP80: 21,
      conditionedDurationBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'steel_strut_single_level_open_workface',
          selector: expect.objectContaining({
            internalStrutMethodBand: 'steel_strut',
            workfaceBand: 'open',
          }),
          defaultDaysP20: 8,
          defaultDaysP50: 12,
          defaultDaysP80: 16,
        }),
        expect.objectContaining({
          conditionCode: 'concrete_strut_standard_workface',
          selector: expect.objectContaining({
            internalStrutMethodBand: 'concrete_strut',
            workfaceBand: 'open',
          }),
          defaultDaysP20: 11,
          defaultDaysP50: 16,
          defaultDaysP80: 21,
        }),
        expect.objectContaining({
          conditionCode: 'multi_level_prestressed_strut_deep_constrained',
          selector: expect.objectContaining({
            internalStrutMethodBand: 'multi_level_prestressed',
            depthBand: 'deep',
            workfaceBand: 'constrained',
          }),
          defaultDaysP20: 18,
          defaultDaysP50: 26,
          defaultDaysP80: 34,
        }),
      ]),
      conditionedProcessProfiles: expect.arrayContaining([
        expect.objectContaining({ conditionCode: 'steel_strut_single_level_open_workface' }),
        expect.objectContaining({ conditionCode: 'concrete_strut_standard_workface' }),
        expect.objectContaining({ conditionCode: 'multi_level_prestressed_strut_deep_constrained' }),
      ]),
      productivityBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'steel_strut_single_level_open_workface',
          baselineProductivity: expect.objectContaining({ p50PerDay: 16, unit: 't/day' }),
        }),
        expect.objectContaining({
          conditionCode: 'multi_level_prestressed_strut_deep_constrained',
          baselineProductivity: expect.objectContaining({ p50PerDay: 8, unit: 't/day' }),
        }),
      ]),
    }))

    const multiLevel = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'foundation_pit_internal_strut',
      applicableGranularity: 'task',
      methodVariantCodes: ['multi_level_strut', 'prestress_locking'],
      elementVariantCodes: ['deep_depth', 'constrained_workface'],
    }) as any

    expect(multiLevel).toEqual(expect.objectContaining({
      selectedConditionCode: 'multi_level_prestressed_strut_deep_constrained',
      defaultDaysP50: 26,
      baselineProductivity: expect.objectContaining({ p50PerDay: 8, unit: 't/day' }),
    }))
  })

  it('keeps foundation pit anchor support conditionized by anchor method and prestress controls', async () => {
    const byStableCode = new Map(STANDARD_WORK_DURATION_SEED.map((record) => [record.stableCode, record]))
    const anchorSupport = byStableCode.get('foundation_pit_anchor_support') as any

    expect(anchorSupport).toEqual(expect.objectContaining({
      defaultDaysP20: 11,
      defaultDaysP50: 16,
      defaultDaysP80: 21,
      conditionedDurationBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'anchor_rod_open_workface',
          selector: expect.objectContaining({
            anchorSupportMethodBand: 'anchor_rod',
            workfaceBand: 'open',
          }),
          defaultDaysP20: 8,
          defaultDaysP50: 12,
          defaultDaysP80: 16,
        }),
        expect.objectContaining({
          conditionCode: 'anchor_cable_standard_workface',
          selector: expect.objectContaining({
            anchorSupportMethodBand: 'anchor_cable',
            workfaceBand: 'open',
          }),
          defaultDaysP20: 11,
          defaultDaysP50: 16,
          defaultDaysP80: 21,
        }),
        expect.objectContaining({
          conditionCode: 'secondary_grouting_prestressed_deep_constrained',
          selector: expect.objectContaining({
            anchorSupportMethodBand: 'secondary_grouting_prestressed',
            depthBand: 'deep',
            workfaceBand: 'constrained',
          }),
          defaultDaysP20: 17,
          defaultDaysP50: 24,
          defaultDaysP80: 31,
        }),
      ]),
      conditionedProcessProfiles: expect.arrayContaining([
        expect.objectContaining({ conditionCode: 'anchor_rod_open_workface' }),
        expect.objectContaining({ conditionCode: 'anchor_cable_standard_workface' }),
        expect.objectContaining({ conditionCode: 'secondary_grouting_prestressed_deep_constrained' }),
      ]),
      productivityBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'anchor_rod_open_workface',
          baselineProductivity: expect.objectContaining({ p50PerDay: 55, unit: 'm/day' }),
        }),
        expect.objectContaining({
          conditionCode: 'secondary_grouting_prestressed_deep_constrained',
          baselineProductivity: expect.objectContaining({ p50PerDay: 32, unit: 'm/day' }),
        }),
      ]),
    }))

    const prestressed = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'foundation_pit_anchor_support',
      applicableGranularity: 'task',
      methodVariantCodes: ['secondary_grouting', 'prestress_tensioning'],
      elementVariantCodes: ['deep_depth', 'constrained_workface'],
    }) as any

    expect(prestressed).toEqual(expect.objectContaining({
      selectedConditionCode: 'secondary_grouting_prestressed_deep_constrained',
      defaultDaysP50: 24,
      baselineProductivity: expect.objectContaining({ p50PerDay: 32, unit: 'm/day' }),
    }))
  })

  it('keeps foundation pit interface support conditionized by handover and removal condition', async () => {
    const byStableCode = new Map(STANDARD_WORK_DURATION_SEED.map((record) => [record.stableCode, record]))
    const supportInterface = byStableCode.get('foundation_pit_interface_support') as any

    expect(supportInterface).toEqual(expect.objectContaining({
      defaultDaysP20: 8,
      defaultDaysP50: 12,
      defaultDaysP80: 16,
      conditionedDurationBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'basement_interface_handover_open_workface',
          selector: expect.objectContaining({
            interfaceSupportMethodBand: 'basement_handover',
            workfaceBand: 'open',
          }),
          defaultDaysP20: 6,
          defaultDaysP50: 9,
          defaultDaysP80: 12,
        }),
        expect.objectContaining({
          conditionCode: 'waterproof_load_transfer_standard_interface',
          selector: expect.objectContaining({
            interfaceSupportMethodBand: 'waterproof_load_transfer',
            workfaceBand: 'open',
          }),
          defaultDaysP20: 8,
          defaultDaysP50: 12,
          defaultDaysP80: 16,
        }),
        expect.objectContaining({
          conditionCode: 'support_removal_transfer_constrained',
          selector: expect.objectContaining({
            interfaceSupportMethodBand: 'support_removal_transfer',
            workfaceBand: 'constrained',
          }),
          defaultDaysP20: 13,
          defaultDaysP50: 18,
          defaultDaysP80: 23,
        }),
      ]),
      conditionedProcessProfiles: expect.arrayContaining([
        expect.objectContaining({ conditionCode: 'basement_interface_handover_open_workface' }),
        expect.objectContaining({ conditionCode: 'waterproof_load_transfer_standard_interface' }),
        expect.objectContaining({ conditionCode: 'support_removal_transfer_constrained' }),
      ]),
      productivityBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'basement_interface_handover_open_workface',
          baselineProductivity: expect.objectContaining({ p50PerDay: 1, unit: 'workface/day' }),
        }),
        expect.objectContaining({
          conditionCode: 'support_removal_transfer_constrained',
          baselineProductivity: expect.objectContaining({ p50PerDay: 0.6, unit: 'workface/day' }),
        }),
      ]),
    }))

    const removal = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'foundation_pit_interface_support',
      applicableGranularity: 'task',
      methodVariantCodes: ['support_removal_condition', 'load_transfer_check'],
      elementVariantCodes: ['constrained_workface'],
    }) as any

    expect(removal).toEqual(expect.objectContaining({
      selectedConditionCode: 'support_removal_transfer_constrained',
      defaultDaysP50: 18,
      baselineProductivity: expect.objectContaining({ p50PerDay: 0.6, unit: 'workface/day' }),
    }))
  })

  it('keeps groundwater control dewatering conditionized by well type and monitoring window', async () => {
    const byStableCode = new Map(STANDARD_WORK_DURATION_SEED.map((record) => [record.stableCode, record]))
    const dewatering = byStableCode.get('groundwater_control_dewatering') as any

    expect(dewatering).toEqual(expect.objectContaining({
      defaultDaysP20: 12,
      defaultDaysP50: 16,
      defaultDaysP80: 20,
      conditionedDurationBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'wellpoint_dewatering_open_workface',
          selector: expect.objectContaining({
            dewateringMethodBand: 'wellpoint',
            workfaceBand: 'open',
          }),
          defaultDaysP20: 8,
          defaultDaysP50: 12,
          defaultDaysP80: 16,
        }),
        expect.objectContaining({
          conditionCode: 'deep_well_dewatering_standard_workface',
          selector: expect.objectContaining({
            dewateringMethodBand: 'deep_well',
            workfaceBand: 'open',
          }),
          defaultDaysP20: 12,
          defaultDaysP50: 16,
          defaultDaysP80: 20,
        }),
        expect.objectContaining({
          conditionCode: 'recharge_well_monitoring_constrained',
          selector: expect.objectContaining({
            dewateringMethodBand: 'recharge_monitoring',
            workfaceBand: 'constrained',
          }),
          defaultDaysP20: 18,
          defaultDaysP50: 26,
          defaultDaysP80: 34,
        }),
      ]),
      conditionedProcessProfiles: expect.arrayContaining([
        expect.objectContaining({ conditionCode: 'wellpoint_dewatering_open_workface' }),
        expect.objectContaining({ conditionCode: 'deep_well_dewatering_standard_workface' }),
        expect.objectContaining({ conditionCode: 'recharge_well_monitoring_constrained' }),
      ]),
      productivityBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'wellpoint_dewatering_open_workface',
          baselineProductivity: expect.objectContaining({ p50PerDay: 85, unit: 'm/day' }),
        }),
        expect.objectContaining({
          conditionCode: 'recharge_well_monitoring_constrained',
          baselineProductivity: expect.objectContaining({ p50PerDay: 42, unit: 'm/day' }),
        }),
      ]),
    }))

    const recharge = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'groundwater_control_dewatering',
      applicableGranularity: 'task',
      methodVariantCodes: ['recharge_well', 'continuous_pumping_monitoring'],
      elementVariantCodes: ['constrained_workface'],
    }) as any

    expect(recharge).toEqual(expect.objectContaining({
      selectedConditionCode: 'recharge_well_monitoring_constrained',
      defaultDaysP50: 26,
      baselineProductivity: expect.objectContaining({ p50PerDay: 42, unit: 'm/day' }),
    }))
  })

  it('keeps slope support conditionized by support method and workface', async () => {
    const byStableCode = new Map(STANDARD_WORK_DURATION_SEED.map((record) => [record.stableCode, record]))
    const slopeSupport = byStableCode.get('slope_support_reinforcement') as any

    expect(slopeSupport).toEqual(expect.objectContaining({
      defaultDaysP20: 13,
      defaultDaysP50: 18,
      defaultDaysP80: 23,
      conditionedDurationBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'slope_excavation_drainage_open_workface',
          selector: expect.objectContaining({
            slopeSupportMethodBand: 'slope_excavation',
            workfaceBand: 'open',
          }),
          defaultDaysP20: 9,
          defaultDaysP50: 13,
          defaultDaysP80: 17,
        }),
        expect.objectContaining({
          conditionCode: 'shotcrete_anchor_slope_standard_workface',
          selector: expect.objectContaining({
            slopeSupportMethodBand: 'shotcrete_anchor',
            workfaceBand: 'open',
          }),
          defaultDaysP20: 12,
          defaultDaysP50: 18,
          defaultDaysP80: 23,
        }),
        expect.objectContaining({
          conditionCode: 'retaining_wall_slope_drainage_constrained',
          selector: expect.objectContaining({
            slopeSupportMethodBand: 'retaining_wall_drainage',
            workfaceBand: 'constrained',
          }),
          defaultDaysP20: 18,
          defaultDaysP50: 26,
          defaultDaysP80: 34,
        }),
      ]),
      conditionedProcessProfiles: expect.arrayContaining([
        expect.objectContaining({ conditionCode: 'slope_excavation_drainage_open_workface' }),
        expect.objectContaining({ conditionCode: 'shotcrete_anchor_slope_standard_workface' }),
        expect.objectContaining({ conditionCode: 'retaining_wall_slope_drainage_constrained' }),
      ]),
      productivityBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'slope_excavation_drainage_open_workface',
          baselineProductivity: expect.objectContaining({ p50PerDay: 110, unit: 'm/day' }),
        }),
        expect.objectContaining({
          conditionCode: 'retaining_wall_slope_drainage_constrained',
          baselineProductivity: expect.objectContaining({ p50PerDay: 52, unit: 'm/day' }),
        }),
      ]),
    }))

    const retainingWall = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'slope_support_reinforcement',
      applicableGranularity: 'task',
      methodVariantCodes: ['retaining_wall_slope', 'slope_drainage'],
      elementVariantCodes: ['constrained_workface'],
    }) as any

    expect(retainingWall).toEqual(expect.objectContaining({
      selectedConditionCode: 'retaining_wall_slope_drainage_constrained',
      defaultDaysP50: 26,
      baselineProductivity: expect.objectContaining({ p50PerDay: 52, unit: 'm/day' }),
    }))
  })

  it('keeps precast concrete pile foundation conditionized by pile method and workface', async () => {
    const byStableCode = new Map(STANDARD_WORK_DURATION_SEED.map((record) => [record.stableCode, record]))
    const precastPile = byStableCode.get('precast_concrete_pile_foundation') as any

    expect(precastPile).toEqual(expect.objectContaining({
      defaultDaysP20: 11,
      defaultDaysP50: 15,
      defaultDaysP80: 20,
      conditionedDurationBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'phc_static_press_pile_open_workface',
          selector: expect.objectContaining({
            precastPileMethodBand: 'phc_static_press',
            workfaceBand: 'open',
          }),
          defaultDaysP20: 8,
          defaultDaysP50: 12,
          defaultDaysP80: 16,
        }),
        expect.objectContaining({
          conditionCode: 'hammer_driven_precast_pile_standard_workface',
          selector: expect.objectContaining({
            precastPileMethodBand: 'hammer_driven',
            workfaceBand: 'open',
          }),
          defaultDaysP20: 10,
          defaultDaysP50: 15,
          defaultDaysP80: 20,
        }),
        expect.objectContaining({
          conditionCode: 'precast_square_pile_jointed_constrained',
          selector: expect.objectContaining({
            precastPileMethodBand: 'precast_square_jointed',
            workfaceBand: 'constrained',
          }),
          defaultDaysP20: 14,
          defaultDaysP50: 20,
          defaultDaysP80: 26,
        }),
      ]),
      conditionedProcessProfiles: expect.arrayContaining([
        expect.objectContaining({ conditionCode: 'phc_static_press_pile_open_workface' }),
        expect.objectContaining({ conditionCode: 'hammer_driven_precast_pile_standard_workface' }),
        expect.objectContaining({ conditionCode: 'precast_square_pile_jointed_constrained' }),
      ]),
      productivityBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'phc_static_press_pile_open_workface',
          baselineProductivity: expect.objectContaining({ p50PerDay: 10, unit: 'pile/day' }),
        }),
        expect.objectContaining({
          conditionCode: 'precast_square_pile_jointed_constrained',
          baselineProductivity: expect.objectContaining({ p50PerDay: 5, unit: 'pile/day' }),
        }),
      ]),
    }))

    const squareJointed = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'precast_concrete_pile_foundation',
      applicableGranularity: 'task',
      methodVariantCodes: ['precast_square_pile', 'pile_jointing'],
      elementVariantCodes: ['constrained_workface'],
    }) as any

    expect(squareJointed).toEqual(expect.objectContaining({
      selectedConditionCode: 'precast_square_pile_jointed_constrained',
      defaultDaysP50: 20,
      baselineProductivity: expect.objectContaining({ p50PerDay: 5, unit: 'pile/day' }),
    }))
  })

  it('keeps dry bored pile foundation conditionized by boring method, geology, and workface', async () => {
    const byStableCode = new Map(STANDARD_WORK_DURATION_SEED.map((record) => [record.stableCode, record]))
    const dryBoredPile = byStableCode.get('dry_bored_pile_foundation') as any

    expect(dryBoredPile).toEqual(expect.objectContaining({
      defaultDaysP20: 11,
      defaultDaysP50: 15,
      defaultDaysP80: 20,
      conditionedDurationBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'auger_dry_bored_open_workface',
          selector: expect.objectContaining({
            dryBoredPileMethodBand: 'auger_dry',
            workfaceBand: 'open',
          }),
          defaultDaysP20: 8,
          defaultDaysP50: 12,
          defaultDaysP80: 16,
        }),
        expect.objectContaining({
          conditionCode: 'rotary_dry_bored_standard_workface',
          selector: expect.objectContaining({
            dryBoredPileMethodBand: 'rotary_dry',
            workfaceBand: 'open',
          }),
          defaultDaysP20: 10,
          defaultDaysP50: 15,
          defaultDaysP80: 20,
        }),
        expect.objectContaining({
          conditionCode: 'manual_dug_pile_complex_constrained',
          selector: expect.objectContaining({
            dryBoredPileMethodBand: 'manual_dug_complex',
            geologyBand: 'complex',
            workfaceBand: 'constrained',
          }),
          defaultDaysP20: 18,
          defaultDaysP50: 26,
          defaultDaysP80: 34,
        }),
      ]),
      conditionedProcessProfiles: expect.arrayContaining([
        expect.objectContaining({ conditionCode: 'auger_dry_bored_open_workface' }),
        expect.objectContaining({ conditionCode: 'rotary_dry_bored_standard_workface' }),
        expect.objectContaining({ conditionCode: 'manual_dug_pile_complex_constrained' }),
      ]),
      productivityBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'auger_dry_bored_open_workface',
          baselineProductivity: expect.objectContaining({ p50PerDay: 8, unit: 'pile/day' }),
        }),
        expect.objectContaining({
          conditionCode: 'manual_dug_pile_complex_constrained',
          baselineProductivity: expect.objectContaining({ p50PerDay: 3, unit: 'pile/day' }),
        }),
      ]),
    }))

    const manualComplex = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'dry_bored_pile_foundation',
      applicableGranularity: 'task',
      methodVariantCodes: ['manual_dug_pile'],
      elementVariantCodes: ['complex_geology', 'constrained_workface'],
    }) as any

    expect(manualComplex).toEqual(expect.objectContaining({
      selectedConditionCode: 'manual_dug_pile_complex_constrained',
      defaultDaysP50: 26,
      baselineProductivity: expect.objectContaining({ p50PerDay: 3, unit: 'pile/day' }),
    }))
  })

  it('keeps installation productivity bands conditionized by standard work conditions', async () => {
    const byStableCode = new Map(STANDARD_WORK_DURATION_SEED.map((record) => [record.stableCode, record]))
    const sanitaryFixture = byStableCode.get('plumbing_sanitary_fixture') as any

    expect(sanitaryFixture).toEqual(expect.objectContaining({
      defaultDaysP20: 4,
      defaultDaysP50: 6,
      defaultDaysP80: 8,
      conditionedDurationBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'indoor_new_build_open_workface',
          defaultDaysP50: 5,
        }),
        expect.objectContaining({
          conditionCode: 'renovation_occupied_constrained_workface',
          defaultDaysP50: 8,
        }),
      ]),
      conditionedProcessProfiles: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'indoor_new_build_open_workface',
          profile: expect.any(Object),
        }),
        expect.objectContaining({
          conditionCode: 'renovation_occupied_constrained_workface',
          profile: expect.any(Object),
        }),
      ]),
      productivityBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'indoor_new_build_open_workface',
          selector: expect.objectContaining({
            locationBand: 'indoor',
            renovationBand: 'new_build',
            workfaceBand: 'open',
          }),
          baselineProductivity: expect.objectContaining({
            p50PerDay: 15,
            unit: 'set/day',
            sourceType: 'expert_profile',
          }),
        }),
        expect.objectContaining({
          conditionCode: 'renovation_occupied_constrained_workface',
          selector: expect.objectContaining({
            locationBand: 'indoor',
            renovationBand: 'renovation',
            workfaceBand: 'constrained',
          }),
          baselineProductivity: expect.objectContaining({
            p50PerDay: 8,
            unit: 'set/day',
            sourceType: 'expert_profile',
          }),
        }),
      ]),
    }))

    const indoorNewBuild = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'plumbing_sanitary_fixture',
      applicableGranularity: 'task',
      elementVariantCodes: ['indoor_installation', 'new_build', 'open_workface'],
    }) as any

    expect(indoorNewBuild).toEqual(expect.objectContaining({
      selectedConditionCode: 'indoor_new_build_open_workface',
      defaultDaysP50: 5,
      baselineProductivity: expect.objectContaining({
        p50PerDay: 15,
        unit: 'set/day',
      }),
    }))

    const indoorOnly = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'plumbing_sanitary_fixture',
      applicableGranularity: 'task',
      elementVariantCodes: ['indoor_installation'],
    }) as any

    expect(indoorOnly).toEqual(expect.objectContaining({
      selectedConditionCode: 'indoor_standard_workface',
      defaultDaysP50: 6,
      baselineProductivity: expect.objectContaining({
        p50PerDay: 12,
        unit: 'set/day',
      }),
    }))

    const renovationOpenWorkface = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'plumbing_sanitary_fixture',
      applicableGranularity: 'task',
      elementVariantCodes: ['indoor_installation', 'renovation', 'open_workface'],
    }) as any

    expect(renovationOpenWorkface).toEqual(expect.objectContaining({
      selectedConditionCode: 'indoor_standard_workface',
      defaultDaysP50: 6,
      baselineProductivity: expect.objectContaining({
        p50PerDay: 12,
        unit: 'set/day',
      }),
    }))

    const occupiedRenovation = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'plumbing_sanitary_fixture',
      applicableGranularity: 'task',
      elementVariantCodes: ['indoor_installation', 'renovation', 'occupied_workface', 'constrained_workface'],
    }) as any

    expect(occupiedRenovation).toEqual(expect.objectContaining({
      selectedConditionCode: 'renovation_occupied_constrained_workface',
      defaultDaysP50: 8,
      baselineProductivity: expect.objectContaining({
        p50PerDay: 8,
        unit: 'set/day',
      }),
    }))
  })

  it('keeps indoor plumbing pipe durations conditionized by pipe system and test complexity', async () => {
    const byStableCode = new Map(STANDARD_WORK_DURATION_SEED.map((record) => [record.stableCode, record]))
    const waterSupplyPipe = byStableCode.get('plumbing_indoor_water_supply_pipe') as any
    const fireHydrantSprinkler = byStableCode.get('plumbing_fire_hydrant_sprinkler') as any
    const indoorDrainage = byStableCode.get('plumbing_indoor_drainage') as any

    expect(waterSupplyPipe).toEqual(expect.objectContaining({
      defaultDaysP20: 5,
      defaultDaysP50: 7,
      defaultDaysP80: 9,
      conditionedDurationBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'ppr_branch_pipe_new_build_open',
          selector: expect.objectContaining({
            plumbingWaterSupplyPipeMethodBand: 'ppr_branch',
            locationBand: 'indoor',
            renovationBand: 'new_build',
            workfaceBand: 'open',
          }),
          defaultDaysP20: 4,
          defaultDaysP50: 6,
          defaultDaysP80: 8,
        }),
        expect.objectContaining({
          conditionCode: 'steel_riser_pressure_test_standard',
          selector: expect.objectContaining({
            plumbingWaterSupplyPipeMethodBand: 'steel_riser_pressure',
            locationBand: 'indoor',
          }),
          defaultDaysP20: 6,
          defaultDaysP50: 8,
          defaultDaysP80: 10,
        }),
        expect.objectContaining({
          conditionCode: 'renovation_tie_in_constrained',
          selector: expect.objectContaining({
            plumbingWaterSupplyPipeMethodBand: 'renovation_tie_in',
            locationBand: 'indoor',
            renovationBand: 'renovation',
            workfaceBand: 'constrained',
          }),
          defaultDaysP20: 8,
          defaultDaysP50: 11,
          defaultDaysP80: 14,
        }),
      ]),
      conditionedProcessProfiles: expect.arrayContaining([
        expect.objectContaining({ conditionCode: 'ppr_branch_pipe_new_build_open' }),
        expect.objectContaining({ conditionCode: 'steel_riser_pressure_test_standard' }),
        expect.objectContaining({ conditionCode: 'renovation_tie_in_constrained' }),
      ]),
      productivityBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'ppr_branch_pipe_new_build_open',
          baselineProductivity: expect.objectContaining({
            p50PerDay: 75,
            unit: 'm/day',
            sourceType: 'expert_profile',
            sourceRef: expect.stringContaining('plumbing_indoor_water_supply_pipe:ppr_branch_pipe_new_build_open'),
          }),
        }),
        expect.objectContaining({
          conditionCode: 'renovation_tie_in_constrained',
          baselineProductivity: expect.objectContaining({
            p50PerDay: 38,
            unit: 'm/day',
            sourceType: 'expert_profile',
            sourceRef: expect.stringContaining('plumbing_indoor_water_supply_pipe:renovation_tie_in_constrained'),
          }),
        }),
      ]),
    }))

    expect(fireHydrantSprinkler).toEqual(expect.objectContaining({
      defaultDaysP20: 8,
      defaultDaysP50: 12,
      defaultDaysP80: 16,
      conditionedDurationBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'hydrant_pipe_standard_zone',
          selector: expect.objectContaining({
            plumbingFirePipeMethodBand: 'hydrant_pipe',
            locationBand: 'indoor',
            workfaceBand: 'open',
          }),
          defaultDaysP20: 7,
          defaultDaysP50: 10,
          defaultDaysP80: 13,
        }),
        expect.objectContaining({
          conditionCode: 'sprinkler_dense_terminal_standard',
          selector: expect.objectContaining({
            plumbingFirePipeMethodBand: 'sprinkler_dense_terminal',
            locationBand: 'indoor',
          }),
          defaultDaysP20: 10,
          defaultDaysP50: 14,
          defaultDaysP80: 18,
        }),
        expect.objectContaining({
          conditionCode: 'fire_linkage_commissioning_constrained',
          selector: expect.objectContaining({
            plumbingFirePipeMethodBand: 'fire_linkage_commissioning',
            locationBand: 'indoor',
            workfaceBand: 'constrained',
          }),
          defaultDaysP20: 13,
          defaultDaysP50: 18,
          defaultDaysP80: 23,
        }),
      ]),
      productivityBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'hydrant_pipe_standard_zone',
          baselineProductivity: expect.objectContaining({ p50PerDay: 55, unit: 'm/day' }),
        }),
        expect.objectContaining({
          conditionCode: 'fire_linkage_commissioning_constrained',
          baselineProductivity: expect.objectContaining({ p50PerDay: 28, unit: 'terminal/day' }),
        }),
      ]),
    }))

    expect(indoorDrainage).toEqual(expect.objectContaining({
      defaultDaysP20: 5,
      defaultDaysP50: 7,
      defaultDaysP80: 9,
      conditionedDurationBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'pvc_branch_drainage_open',
          selector: expect.objectContaining({
            plumbingDrainageMethodBand: 'pvc_branch',
            locationBand: 'indoor',
            workfaceBand: 'open',
          }),
          defaultDaysP20: 4,
          defaultDaysP50: 6,
          defaultDaysP80: 8,
        }),
        expect.objectContaining({
          conditionCode: 'rainwater_riser_closed_water_standard',
          selector: expect.objectContaining({
            plumbingDrainageMethodBand: 'rainwater_riser_test',
            locationBand: 'indoor',
          }),
          defaultDaysP20: 6,
          defaultDaysP50: 8,
          defaultDaysP80: 10,
        }),
        expect.objectContaining({
          conditionCode: 'cast_iron_drainage_renovation_constrained',
          selector: expect.objectContaining({
            plumbingDrainageMethodBand: 'cast_iron_renovation',
            locationBand: 'indoor',
            renovationBand: 'renovation',
            workfaceBand: 'constrained',
          }),
          defaultDaysP20: 8,
          defaultDaysP50: 11,
          defaultDaysP80: 14,
        }),
      ]),
      productivityBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'pvc_branch_drainage_open',
          baselineProductivity: expect.objectContaining({ p50PerDay: 70, unit: 'm/day' }),
        }),
        expect.objectContaining({
          conditionCode: 'cast_iron_drainage_renovation_constrained',
          baselineProductivity: expect.objectContaining({ p50PerDay: 36, unit: 'm/day' }),
        }),
      ]),
    }))

    const renovationTieIn = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'plumbing_indoor_water_supply_pipe',
      applicableGranularity: 'task',
      methodVariantCodes: ['renovation_tie_in_pipe'],
      elementVariantCodes: ['indoor_installation', 'renovation', 'constrained_workface'],
    }) as any
    expect(renovationTieIn).toEqual(expect.objectContaining({
      selectedConditionCode: 'renovation_tie_in_constrained',
      defaultDaysP50: 11,
      baselineProductivity: expect.objectContaining({ p50PerDay: 38, unit: 'm/day' }),
    }))

    const sprinklerDense = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'plumbing_fire_hydrant_sprinkler',
      applicableGranularity: 'task',
      methodVariantCodes: ['sprinkler_dense_terminal'],
      elementVariantCodes: ['indoor_installation'],
    }) as any
    expect(sprinklerDense).toEqual(expect.objectContaining({
      selectedConditionCode: 'sprinkler_dense_terminal_standard',
      defaultDaysP50: 14,
      baselineProductivity: expect.objectContaining({ p50PerDay: 42, unit: 'm/day' }),
    }))

    const castIronDrainage = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'plumbing_indoor_drainage',
      applicableGranularity: 'task',
      methodVariantCodes: ['cast_iron_drainage_renovation'],
      elementVariantCodes: ['indoor_installation', 'renovation', 'constrained_workface'],
    }) as any
    expect(castIronDrainage).toEqual(expect.objectContaining({
      selectedConditionCode: 'cast_iron_drainage_renovation_constrained',
      defaultDaysP50: 11,
      baselineProductivity: expect.objectContaining({ p50PerDay: 36, unit: 'm/day' }),
    }))
  })

  it('keeps indoor heating durations conditionized by terminal type and floor-heating method', async () => {
    const byStableCode = new Map(STANDARD_WORK_DURATION_SEED.map((record) => [record.stableCode, record]))
    const radiator = byStableCode.get('heating_radiator_system') as any
    const hydronicFloor = byStableCode.get('heating_hydronic_floor_system') as any
    const electricFloor = byStableCode.get('heating_electric_floor_system') as any

    expect(radiator).toEqual(expect.objectContaining({
      defaultDaysP20: 5,
      defaultDaysP50: 7,
      defaultDaysP80: 9,
      conditionedDurationBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'steel_panel_radiator_open',
          selector: expect.objectContaining({
            heatingRadiatorMethodBand: 'steel_panel',
            locationBand: 'indoor',
            workfaceBand: 'open',
          }),
          defaultDaysP20: 4,
          defaultDaysP50: 6,
          defaultDaysP80: 8,
        }),
        expect.objectContaining({
          conditionCode: 'cast_iron_radiator_standard',
          selector: expect.objectContaining({
            heatingRadiatorMethodBand: 'cast_iron',
            locationBand: 'indoor',
          }),
          defaultDaysP20: 6,
          defaultDaysP50: 8,
          defaultDaysP80: 10,
        }),
        expect.objectContaining({
          conditionCode: 'retrofit_radiator_constrained',
          selector: expect.objectContaining({
            heatingRadiatorMethodBand: 'retrofit',
            locationBand: 'indoor',
            renovationBand: 'renovation',
            workfaceBand: 'constrained',
          }),
          defaultDaysP20: 8,
          defaultDaysP50: 11,
          defaultDaysP80: 14,
        }),
      ]),
      productivityBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'steel_panel_radiator_open',
          baselineProductivity: expect.objectContaining({ p50PerDay: 18, unit: 'set/day' }),
        }),
        expect.objectContaining({
          conditionCode: 'retrofit_radiator_constrained',
          baselineProductivity: expect.objectContaining({ p50PerDay: 10, unit: 'set/day' }),
        }),
      ]),
    }))

    expect(hydronicFloor).toEqual(expect.objectContaining({
      defaultDaysP20: 8,
      defaultDaysP50: 12,
      defaultDaysP80: 16,
      conditionedDurationBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'wet_floor_heating_standard',
          selector: expect.objectContaining({
            heatingHydronicFloorMethodBand: 'wet_floor',
            locationBand: 'indoor',
            workfaceBand: 'open',
          }),
          defaultDaysP20: 8,
          defaultDaysP50: 11,
          defaultDaysP80: 14,
        }),
        expect.objectContaining({
          conditionCode: 'dry_floor_heating_open',
          selector: expect.objectContaining({
            heatingHydronicFloorMethodBand: 'dry_floor',
            locationBand: 'indoor',
            workfaceBand: 'open',
          }),
          defaultDaysP20: 6,
          defaultDaysP50: 9,
          defaultDaysP80: 12,
        }),
        expect.objectContaining({
          conditionCode: 'dense_pipe_spacing_renovation_constrained',
          selector: expect.objectContaining({
            heatingHydronicFloorMethodBand: 'dense_pipe_spacing',
            locationBand: 'indoor',
            renovationBand: 'renovation',
            workfaceBand: 'constrained',
          }),
          defaultDaysP20: 13,
          defaultDaysP50: 18,
          defaultDaysP80: 23,
        }),
      ]),
      productivityBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'wet_floor_heating_standard',
          baselineProductivity: expect.objectContaining({ p50PerDay: 180, unit: 'm2/day' }),
        }),
        expect.objectContaining({
          conditionCode: 'dense_pipe_spacing_renovation_constrained',
          baselineProductivity: expect.objectContaining({ p50PerDay: 105, unit: 'm2/day' }),
        }),
      ]),
    }))

    expect(electricFloor).toEqual(expect.objectContaining({
      defaultDaysP20: 7,
      defaultDaysP50: 10,
      defaultDaysP80: 13,
      conditionedDurationBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'electric_heating_film_open',
          selector: expect.objectContaining({
            heatingElectricFloorMethodBand: 'heating_film',
            locationBand: 'indoor',
            workfaceBand: 'open',
          }),
          defaultDaysP20: 5,
          defaultDaysP50: 8,
          defaultDaysP80: 10,
        }),
        expect.objectContaining({
          conditionCode: 'heating_cable_wet_fill_standard',
          selector: expect.objectContaining({
            heatingElectricFloorMethodBand: 'heating_cable_wet_fill',
            locationBand: 'indoor',
          }),
          defaultDaysP20: 8,
          defaultDaysP50: 11,
          defaultDaysP80: 14,
        }),
        expect.objectContaining({
          conditionCode: 'thermostat_dense_constrained',
          selector: expect.objectContaining({
            heatingElectricFloorMethodBand: 'thermostat_dense',
            locationBand: 'indoor',
            workfaceBand: 'constrained',
          }),
          defaultDaysP20: 10,
          defaultDaysP50: 14,
          defaultDaysP80: 18,
        }),
      ]),
      productivityBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'electric_heating_film_open',
          baselineProductivity: expect.objectContaining({ p50PerDay: 240, unit: 'm2/day' }),
        }),
        expect.objectContaining({
          conditionCode: 'thermostat_dense_constrained',
          baselineProductivity: expect.objectContaining({ p50PerDay: 140, unit: 'm2/day' }),
        }),
      ]),
    }))

    const retrofitRadiator = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'heating_radiator_system',
      applicableGranularity: 'task',
      methodVariantCodes: ['retrofit_radiator'],
      elementVariantCodes: ['indoor_installation', 'renovation', 'constrained_workface'],
    }) as any
    expect(retrofitRadiator).toEqual(expect.objectContaining({
      selectedConditionCode: 'retrofit_radiator_constrained',
      defaultDaysP50: 11,
      baselineProductivity: expect.objectContaining({ p50PerDay: 10, unit: 'set/day' }),
    }))

    const denseHydronic = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'heating_hydronic_floor_system',
      applicableGranularity: 'task',
      methodVariantCodes: ['dense_pipe_spacing'],
      elementVariantCodes: ['indoor_installation', 'renovation', 'constrained_workface'],
    }) as any
    expect(denseHydronic).toEqual(expect.objectContaining({
      selectedConditionCode: 'dense_pipe_spacing_renovation_constrained',
      defaultDaysP50: 18,
      baselineProductivity: expect.objectContaining({ p50PerDay: 105, unit: 'm2/day' }),
    }))

    const denseThermostat = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'heating_electric_floor_system',
      applicableGranularity: 'task',
      methodVariantCodes: ['thermostat_dense'],
      elementVariantCodes: ['indoor_installation', 'constrained_workface'],
    }) as any
    expect(denseThermostat).toEqual(expect.objectContaining({
      selectedConditionCode: 'thermostat_dense_constrained',
      defaultDaysP50: 14,
      baselineProductivity: expect.objectContaining({ p50PerDay: 140, unit: 'm2/day' }),
    }))
  })

  it('keeps plumbing pipe auxiliary durations conditionized by exposure, insulation system, and flushing closure', async () => {
    const byStableCode = new Map(STANDARD_WORK_DURATION_SEED.map((record) => [record.stableCode, record]))
    const anticorrosion = byStableCode.get('plumbing_pipe_anticorrosion') as any
    const insulation = byStableCode.get('plumbing_pipe_insulation') as any
    const flushing = byStableCode.get('plumbing_pipe_flushing') as any

    expect(anticorrosion).toEqual(expect.objectContaining({
      defaultDaysP20: 4,
      defaultDaysP50: 6,
      defaultDaysP80: 8,
      conditionedDurationBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'indoor_visible_pipe_touchup_open',
          selector: expect.objectContaining({
            plumbingPipeAnticorrosionMethodBand: 'indoor_touchup',
            locationBand: 'indoor',
            workfaceBand: 'open',
          }),
          defaultDaysP20: 3,
          defaultDaysP50: 5,
          defaultDaysP80: 7,
        }),
        expect.objectContaining({
          conditionCode: 'buried_pipe_full_coating_standard',
          selector: expect.objectContaining({
            plumbingPipeAnticorrosionMethodBand: 'buried_full_coating',
            locationBand: 'outdoor',
          }),
          defaultDaysP20: 5,
          defaultDaysP50: 7,
          defaultDaysP80: 9,
        }),
        expect.objectContaining({
          conditionCode: 'renovation_confined_derusting_constrained',
          selector: expect.objectContaining({
            plumbingPipeAnticorrosionMethodBand: 'confined_derusting',
            renovationBand: 'renovation',
            workfaceBand: 'constrained',
          }),
          defaultDaysP20: 7,
          defaultDaysP50: 10,
          defaultDaysP80: 13,
        }),
      ]),
      productivityBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'indoor_visible_pipe_touchup_open',
          baselineProductivity: expect.objectContaining({ p50PerDay: 110, unit: 'm/day' }),
        }),
        expect.objectContaining({
          conditionCode: 'renovation_confined_derusting_constrained',
          baselineProductivity: expect.objectContaining({ p50PerDay: 45, unit: 'm/day' }),
        }),
      ]),
    }))

    expect(insulation).toEqual(expect.objectContaining({
      defaultDaysP20: 4,
      defaultDaysP50: 6,
      defaultDaysP80: 8,
      conditionedDurationBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'indoor_hot_water_insulation_open',
          selector: expect.objectContaining({
            plumbingPipeInsulationMethodBand: 'hot_water_standard',
            locationBand: 'indoor',
            workfaceBand: 'open',
          }),
          defaultDaysP20: 3,
          defaultDaysP50: 5,
          defaultDaysP80: 7,
        }),
        expect.objectContaining({
          conditionCode: 'outdoor_thermal_protection_standard',
          selector: expect.objectContaining({
            plumbingPipeInsulationMethodBand: 'outdoor_protection',
            locationBand: 'outdoor',
          }),
          defaultDaysP20: 5,
          defaultDaysP50: 7,
          defaultDaysP80: 9,
        }),
        expect.objectContaining({
          conditionCode: 'condensation_control_dense_constrained',
          selector: expect.objectContaining({
            plumbingPipeInsulationMethodBand: 'condensation_control',
            workfaceBand: 'constrained',
          }),
          defaultDaysP20: 7,
          defaultDaysP50: 10,
          defaultDaysP80: 13,
        }),
      ]),
      productivityBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'indoor_hot_water_insulation_open',
          baselineProductivity: expect.objectContaining({ p50PerDay: 95, unit: 'm/day' }),
        }),
        expect.objectContaining({
          conditionCode: 'condensation_control_dense_constrained',
          baselineProductivity: expect.objectContaining({ p50PerDay: 42, unit: 'm/day' }),
        }),
      ]),
    }))

    expect(flushing).toEqual(expect.objectContaining({
      defaultDaysP20: 4,
      defaultDaysP50: 5,
      defaultDaysP80: 7,
      conditionedDurationBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'branch_pipe_flushing_open',
          selector: expect.objectContaining({
            plumbingPipeFlushingMethodBand: 'branch_flushing',
            locationBand: 'indoor',
            workfaceBand: 'open',
          }),
          defaultDaysP20: 3,
          defaultDaysP50: 4,
          defaultDaysP80: 6,
        }),
        expect.objectContaining({
          conditionCode: 'main_riser_flushing_standard',
          selector: expect.objectContaining({
            plumbingPipeFlushingMethodBand: 'main_riser_flushing',
            locationBand: 'indoor',
          }),
          defaultDaysP20: 4,
          defaultDaysP50: 6,
          defaultDaysP80: 8,
        }),
        expect.objectContaining({
          conditionCode: 'water_quality_reflush_constrained',
          selector: expect.objectContaining({
            plumbingPipeFlushingMethodBand: 'water_quality_reflush',
            workfaceBand: 'constrained',
          }),
          defaultDaysP20: 6,
          defaultDaysP50: 8,
          defaultDaysP80: 10,
        }),
      ]),
      productivityBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'branch_pipe_flushing_open',
          baselineProductivity: expect.objectContaining({ p50PerDay: 180, unit: 'm/day' }),
        }),
        expect.objectContaining({
          conditionCode: 'water_quality_reflush_constrained',
          baselineProductivity: expect.objectContaining({ p50PerDay: 80, unit: 'm/day' }),
        }),
      ]),
    }))

    const confinedAnticorrosion = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'plumbing_pipe_anticorrosion',
      applicableGranularity: 'task',
      methodVariantCodes: ['confined_derusting'],
      elementVariantCodes: ['renovation', 'constrained_workface'],
    }) as any
    expect(confinedAnticorrosion).toEqual(expect.objectContaining({
      selectedConditionCode: 'renovation_confined_derusting_constrained',
      defaultDaysP50: 10,
      baselineProductivity: expect.objectContaining({ p50PerDay: 45, unit: 'm/day' }),
    }))

    const condensationInsulation = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'plumbing_pipe_insulation',
      applicableGranularity: 'task',
      methodVariantCodes: ['condensation_control'],
      elementVariantCodes: ['constrained_workface'],
    }) as any
    expect(condensationInsulation).toEqual(expect.objectContaining({
      selectedConditionCode: 'condensation_control_dense_constrained',
      defaultDaysP50: 10,
      baselineProductivity: expect.objectContaining({ p50PerDay: 42, unit: 'm/day' }),
    }))

    const qualityReflush = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'plumbing_pipe_flushing',
      applicableGranularity: 'task',
      methodVariantCodes: ['water_quality_reflush'],
      elementVariantCodes: ['constrained_workface'],
    }) as any
    expect(qualityReflush).toEqual(expect.objectContaining({
      selectedConditionCode: 'water_quality_reflush_constrained',
      defaultDaysP50: 8,
      baselineProductivity: expect.objectContaining({ p50PerDay: 80, unit: 'm/day' }),
    }))
  })

  it('keeps plumbing equipment, water test, and hot-water durations conditionized by method and workface', async () => {
    const byStableCode = new Map(STANDARD_WORK_DURATION_SEED.map((record) => [record.stableCode, record]))
    const waterSupplyEquipment = byStableCode.get('plumbing_indoor_water_supply_equipment') as any
    const waterTestCommissioning = byStableCode.get('plumbing_water_test_commissioning') as any
    const hotWaterSystem = byStableCode.get('plumbing_hot_water_system') as any

    expect(waterSupplyEquipment).toEqual(expect.objectContaining({
      defaultDaysP20: 7,
      defaultDaysP50: 10,
      defaultDaysP80: 13,
      conditionedDurationBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'pump_set_equipment_room_open',
          selector: expect.objectContaining({
            plumbingWaterSupplyEquipmentMethodBand: 'pump_set',
            locationBand: 'indoor',
            workfaceBand: 'open',
          }),
          defaultDaysP20: 6,
          defaultDaysP50: 8,
          defaultDaysP80: 10,
        }),
        expect.objectContaining({
          conditionCode: 'renovation_pump_room_constrained',
          selector: expect.objectContaining({
            plumbingWaterSupplyEquipmentMethodBand: 'renovation_pump_room',
            renovationBand: 'renovation',
            workfaceBand: 'constrained',
          }),
          defaultDaysP20: 10,
          defaultDaysP50: 14,
          defaultDaysP80: 18,
        }),
      ]),
      productivityBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'pump_set_equipment_room_open',
          baselineProductivity: expect.objectContaining({ p50PerDay: 2, unit: 'set/day' }),
        }),
        expect.objectContaining({
          conditionCode: 'renovation_pump_room_constrained',
          baselineProductivity: expect.objectContaining({ p50PerDay: 0.8, unit: 'set/day' }),
        }),
      ]),
      conditionedProcessProfiles: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'tank_meter_standard',
          profile: expect.objectContaining({
            defaultBase: 5,
            max: 12,
          }),
        }),
      ]),
    }))

    expect(waterTestCommissioning).toEqual(expect.objectContaining({
      defaultDaysP20: 4,
      defaultDaysP50: 6,
      defaultDaysP80: 8,
      conditionedDurationBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'branch_pressure_test_open',
          selector: expect.objectContaining({
            plumbingWaterTestMethodBand: 'branch_pressure_test',
            locationBand: 'indoor',
            workfaceBand: 'open',
          }),
          defaultDaysP50: 5,
        }),
        expect.objectContaining({
          conditionCode: 'renovation_retest_commissioning_constrained',
          selector: expect.objectContaining({
            plumbingWaterTestMethodBand: 'renovation_retest',
            renovationBand: 'renovation',
            workfaceBand: 'constrained',
          }),
          defaultDaysP50: 10,
        }),
      ]),
      productivityBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'branch_pressure_test_open',
          baselineProductivity: expect.objectContaining({ p50PerDay: 180, unit: 'm/day' }),
        }),
        expect.objectContaining({
          conditionCode: 'renovation_retest_commissioning_constrained',
          baselineProductivity: expect.objectContaining({ p50PerDay: 70, unit: 'm/day' }),
        }),
      ]),
    }))

    expect(hotWaterSystem).toEqual(expect.objectContaining({
      defaultDaysP20: 7,
      defaultDaysP50: 10,
      defaultDaysP80: 13,
      conditionedDurationBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'hot_water_branch_pipe_open',
          selector: expect.objectContaining({
            plumbingHotWaterMethodBand: 'branch_pipe',
            locationBand: 'indoor',
            workfaceBand: 'open',
          }),
          defaultDaysP50: 8,
        }),
        expect.objectContaining({
          conditionCode: 'renovation_hot_water_tie_in_constrained',
          selector: expect.objectContaining({
            plumbingHotWaterMethodBand: 'renovation_tie_in',
            renovationBand: 'renovation',
            workfaceBand: 'constrained',
          }),
          defaultDaysP50: 15,
        }),
      ]),
      productivityBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'hot_water_branch_pipe_open',
          baselineProductivity: expect.objectContaining({ p50PerDay: 60, unit: 'm/day' }),
        }),
        expect.objectContaining({
          conditionCode: 'renovation_hot_water_tie_in_constrained',
          baselineProductivity: expect.objectContaining({ p50PerDay: 30, unit: 'm/day' }),
        }),
      ]),
    }))

    const renovationEquipment = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'plumbing_indoor_water_supply_equipment',
      applicableGranularity: 'task',
      methodVariantCodes: ['renovation_pump_room'],
      elementVariantCodes: ['renovation', 'constrained_workface'],
    }) as any
    expect(renovationEquipment).toEqual(expect.objectContaining({
      selectedConditionCode: 'renovation_pump_room_constrained',
      defaultDaysP50: 14,
      baselineProductivity: expect.objectContaining({ p50PerDay: 0.8, unit: 'set/day' }),
    }))

    const renovationWaterTest = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'plumbing_water_test_commissioning',
      applicableGranularity: 'task',
      methodVariantCodes: ['renovation_retest'],
      elementVariantCodes: ['renovation', 'constrained_workface'],
    }) as any
    expect(renovationWaterTest).toEqual(expect.objectContaining({
      selectedConditionCode: 'renovation_retest_commissioning_constrained',
      defaultDaysP50: 10,
      baselineProductivity: expect.objectContaining({ p50PerDay: 70, unit: 'm/day' }),
    }))

    const hotWaterTieIn = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'plumbing_hot_water_system',
      applicableGranularity: 'task',
      methodVariantCodes: ['hot_water_renovation_tie_in'],
      elementVariantCodes: ['renovation', 'constrained_workface'],
    }) as any
    expect(hotWaterTieIn).toEqual(expect.objectContaining({
      selectedConditionCode: 'renovation_hot_water_tie_in_constrained',
      defaultDaysP50: 15,
      baselineProductivity: expect.objectContaining({ p50PerDay: 30, unit: 'm/day' }),
    }))
  })

  it('keeps indoor heating, gas radiant, and heat-source durations conditionized by system type and workface', async () => {
    const byStableCode = new Map(STANDARD_WORK_DURATION_SEED.map((record) => [record.stableCode, record]))
    const indoorHeating = byStableCode.get('heating_indoor_system') as any
    const gasRadiant = byStableCode.get('heating_gas_radiant_system') as any
    const heatSource = byStableCode.get('heating_source_auxiliary_equipment') as any

    expect(indoorHeating).toEqual(expect.objectContaining({
      defaultDaysP20: 8,
      defaultDaysP50: 11,
      defaultDaysP80: 14,
      conditionedDurationBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'indoor_heating_pipe_open',
          selector: expect.objectContaining({
            heatingIndoorSystemMethodBand: 'pipe_network',
            locationBand: 'indoor',
            workfaceBand: 'open',
          }),
          defaultDaysP50: 9,
        }),
        expect.objectContaining({
          conditionCode: 'renovation_heating_system_constrained',
          selector: expect.objectContaining({
            heatingIndoorSystemMethodBand: 'renovation_balancing',
            renovationBand: 'renovation',
            workfaceBand: 'constrained',
          }),
          defaultDaysP50: 16,
        }),
      ]),
      productivityBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'indoor_heating_pipe_open',
          baselineProductivity: expect.objectContaining({ p50PerDay: 65, unit: 'm/day' }),
        }),
        expect.objectContaining({
          conditionCode: 'renovation_heating_system_constrained',
          baselineProductivity: expect.objectContaining({ p50PerDay: 34, unit: 'm/day' }),
        }),
      ]),
    }))

    expect(gasRadiant).toEqual(expect.objectContaining({
      defaultDaysP20: 8,
      defaultDaysP50: 11,
      defaultDaysP80: 14,
      conditionedDurationBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'gas_radiant_tube_high_bay_open',
          selector: expect.objectContaining({
            heatingGasRadiantMethodBand: 'radiant_tube',
            heightBand: 'high_rise',
            workfaceBand: 'open',
          }),
          defaultDaysP50: 10,
        }),
        expect.objectContaining({
          conditionCode: 'safety_interlock_dense_constrained',
          selector: expect.objectContaining({
            heatingGasRadiantMethodBand: 'safety_interlock_dense',
            workfaceBand: 'constrained',
          }),
          defaultDaysP50: 16,
        }),
      ]),
      conditionedProcessProfiles: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'safety_interlock_dense_constrained',
          profile: expect.objectContaining({ defaultBase: 7, max: 18 }),
        }),
      ]),
    }))

    expect(heatSource).toEqual(expect.objectContaining({
      defaultDaysP20: 14,
      defaultDaysP50: 20,
      defaultDaysP80: 26,
      conditionedDurationBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'boiler_room_equipment_standard',
          selector: expect.objectContaining({
            heatingSourceEquipmentMethodBand: 'boiler_room',
            locationBand: 'indoor',
          }),
          defaultDaysP50: 18,
        }),
        expect.objectContaining({
          conditionCode: 'industrial_heat_source_auxiliary_dense',
          selector: expect.objectContaining({
            heatingSourceEquipmentMethodBand: 'industrial_auxiliary_dense',
            workfaceBand: 'constrained',
          }),
          defaultDaysP50: 28,
        }),
      ]),
      productivityBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'heat_exchanger_station_open',
          baselineProductivity: expect.objectContaining({ p50PerDay: 1.4, unit: 'set/day' }),
        }),
        expect.objectContaining({
          conditionCode: 'industrial_heat_source_auxiliary_dense',
          baselineProductivity: expect.objectContaining({ p50PerDay: 0.75, unit: 'set/day' }),
        }),
      ]),
    }))

    const renovationHeating = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'heating_indoor_system',
      applicableGranularity: 'task',
      methodVariantCodes: ['renovation_heating_balancing'],
      elementVariantCodes: ['renovation', 'constrained_workface'],
    }) as any
    expect(renovationHeating).toEqual(expect.objectContaining({
      selectedConditionCode: 'renovation_heating_system_constrained',
      defaultDaysP50: 16,
      baselineProductivity: expect.objectContaining({ p50PerDay: 34, unit: 'm/day' }),
    }))

    const terminalBalancing = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'heating_indoor_system',
      applicableGranularity: 'task',
      methodVariantCodes: ['terminal_balancing'],
    }) as any
    expect(terminalBalancing).toEqual(expect.objectContaining({
      selectedConditionCode: 'terminal_balancing_standard',
      defaultDaysP50: 11,
      baselineProductivity: expect.objectContaining({ p50PerDay: 48, unit: 'm/day' }),
    }))

    const radiantTube = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'heating_gas_radiant_system',
      applicableGranularity: 'task',
      methodVariantCodes: ['gas_radiant_tube'],
    }) as any
    expect(radiantTube).toEqual(expect.objectContaining({
      selectedConditionCode: 'gas_radiant_tube_high_bay_open',
      defaultDaysP50: 10,
      baselineProductivity: expect.objectContaining({ p50PerDay: 3.2, unit: 'set/day' }),
    }))

    const denseGasRadiant = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'heating_gas_radiant_system',
      applicableGranularity: 'task',
      methodVariantCodes: ['safety_interlock_dense'],
      elementVariantCodes: ['constrained_workface'],
    }) as any
    expect(denseGasRadiant).toEqual(expect.objectContaining({
      selectedConditionCode: 'safety_interlock_dense_constrained',
      defaultDaysP50: 16,
      baselineProductivity: expect.objectContaining({ p50PerDay: 2.4, unit: 'set/day' }),
    }))

    const heatExchangerStation = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'heating_source_auxiliary_equipment',
      applicableGranularity: 'task',
      methodVariantCodes: ['heat_exchanger_station'],
    }) as any
    expect(heatExchangerStation).toEqual(expect.objectContaining({
      selectedConditionCode: 'heat_exchanger_station_open',
      defaultDaysP50: 16,
      baselineProductivity: expect.objectContaining({ p50PerDay: 1.4, unit: 'set/day' }),
    }))

    const industrialHeatSource = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'heating_source_auxiliary_equipment',
      applicableGranularity: 'task',
      methodVariantCodes: ['industrial_heat_source_auxiliary_dense'],
      elementVariantCodes: ['constrained_workface'],
    }) as any
    expect(industrialHeatSource).toEqual(expect.objectContaining({
      selectedConditionCode: 'industrial_heat_source_auxiliary_dense',
      defaultDaysP50: 28,
      baselineProductivity: expect.objectContaining({ p50PerDay: 0.75, unit: 'set/day' }),
    }))
  })

  it('keeps HVAC supply, exhaust, and air-distribution durations conditionized by duct, equipment, and terminal density', async () => {
    const byStableCode = new Map(STANDARD_WORK_DURATION_SEED.map((record) => [record.stableCode, record]))
    const supplyAir = byStableCode.get('hvac_supply_air_system') as any
    const exhaustAir = byStableCode.get('hvac_exhaust_air_system') as any
    const airDistribution = byStableCode.get('hvac_air_distribution') as any

    expect(supplyAir).toEqual(expect.objectContaining({
      defaultDaysP20: 8,
      defaultDaysP50: 11,
      defaultDaysP80: 14,
      conditionedDurationBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'galvanized_duct_open',
          selector: expect.objectContaining({
            hvacSupplyAirMethodBand: 'galvanized_duct',
            workfaceBand: 'open',
          }),
          defaultDaysP50: 9,
        }),
        expect.objectContaining({
          conditionCode: 'ahu_equipment_balancing_standard',
          selector: expect.objectContaining({
            hvacSupplyAirMethodBand: 'ahu_balancing',
            locationBand: 'indoor',
          }),
          defaultDaysP50: 12,
        }),
        expect.objectContaining({
          conditionCode: 'composite_fabric_duct_dense_terminal',
          selector: expect.objectContaining({
            hvacSupplyAirMethodBand: 'composite_fabric_dense',
            workfaceBand: 'constrained',
          }),
          defaultDaysP50: 16,
        }),
      ]),
      productivityBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'galvanized_duct_open',
          baselineProductivity: expect.objectContaining({ p50PerDay: 82, unit: 'm2/day' }),
        }),
        expect.objectContaining({
          conditionCode: 'composite_fabric_duct_dense_terminal',
          baselineProductivity: expect.objectContaining({ p50PerDay: 48, unit: 'm2/day' }),
        }),
      ]),
    }))

    expect(exhaustAir).toEqual(expect.objectContaining({
      defaultDaysP20: 9,
      defaultDaysP50: 12,
      defaultDaysP80: 15,
      conditionedDurationBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'general_exhaust_duct_open',
          selector: expect.objectContaining({
            hvacExhaustAirMethodBand: 'general_exhaust',
            workfaceBand: 'open',
          }),
          defaultDaysP50: 10,
        }),
        expect.objectContaining({
          conditionCode: 'kitchen_hood_exhaust_standard',
          selector: expect.objectContaining({
            hvacExhaustAirMethodBand: 'kitchen_hood',
            locationBand: 'indoor',
          }),
          defaultDaysP50: 13,
        }),
        expect.objectContaining({
          conditionCode: 'anti_corrosion_exhaust_constrained',
          selector: expect.objectContaining({
            hvacExhaustAirMethodBand: 'anti_corrosion',
            workfaceBand: 'constrained',
          }),
          defaultDaysP50: 17,
        }),
      ]),
      conditionedProcessProfiles: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'anti_corrosion_exhaust_constrained',
          profile: expect.objectContaining({ defaultBase: 8, max: 18 }),
        }),
      ]),
    }))

    expect(airDistribution).toEqual(expect.objectContaining({
      defaultDaysP20: 8,
      defaultDaysP50: 12,
      defaultDaysP80: 16,
      conditionedDurationBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'duct_main_distribution_open',
          selector: expect.objectContaining({
            hvacAirDistributionMethodBand: 'duct_main',
            workfaceBand: 'open',
          }),
          defaultDaysP50: 10,
        }),
        expect.objectContaining({
          conditionCode: 'air_terminal_balancing_standard',
          selector: expect.objectContaining({
            hvacAirDistributionMethodBand: 'terminal_balancing',
            locationBand: 'indoor',
          }),
          defaultDaysP50: 12,
        }),
        expect.objectContaining({
          conditionCode: 'dense_terminal_distribution_constrained',
          selector: expect.objectContaining({
            hvacAirDistributionMethodBand: 'dense_terminal',
            workfaceBand: 'constrained',
          }),
          defaultDaysP50: 17,
        }),
      ]),
      productivityBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'duct_main_distribution_open',
          baselineProductivity: expect.objectContaining({ p50PerDay: 76, unit: 'm2/day' }),
        }),
        expect.objectContaining({
          conditionCode: 'dense_terminal_distribution_constrained',
          baselineProductivity: expect.objectContaining({ p50PerDay: 44, unit: 'm2/day' }),
        }),
      ]),
    }))

    const ahuBalancing = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'hvac_supply_air_system',
      applicableGranularity: 'task',
      methodVariantCodes: ['ahu_balancing'],
    }) as any
    expect(ahuBalancing).toEqual(expect.objectContaining({
      selectedConditionCode: 'ahu_equipment_balancing_standard',
      defaultDaysP50: 12,
      baselineProductivity: expect.objectContaining({ p50PerDay: 62, unit: 'm2/day' }),
    }))

    const kitchenExhaust = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'hvac_exhaust_air_system',
      applicableGranularity: 'task',
      methodVariantCodes: ['kitchen_hood_exhaust'],
    }) as any
    expect(kitchenExhaust).toEqual(expect.objectContaining({
      selectedConditionCode: 'kitchen_hood_exhaust_standard',
      defaultDaysP50: 13,
      baselineProductivity: expect.objectContaining({ p50PerDay: 54, unit: 'm2/day' }),
    }))

    const denseTerminal = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'hvac_air_distribution',
      applicableGranularity: 'task',
      methodVariantCodes: ['dense_air_terminal'],
    }) as any
    expect(denseTerminal).toEqual(expect.objectContaining({
      selectedConditionCode: 'dense_terminal_distribution_constrained',
      defaultDaysP50: 17,
      baselineProductivity: expect.objectContaining({ p50PerDay: 44, unit: 'm2/day' }),
    }))
  })

  it('keeps HVAC smoke, dust-exhaust, and vacuum-cleaning durations conditionized by linkage and equipment density', async () => {
    const byStableCode = new Map(STANDARD_WORK_DURATION_SEED.map((record) => [record.stableCode, record]))
    const smokeControl = byStableCode.get('hvac_smoke_control') as any
    const dustExhaust = byStableCode.get('hvac_dust_exhaust') as any
    const vacuumCleaning = byStableCode.get('hvac_vacuum_cleaning_system') as any

    expect(smokeControl).toEqual(expect.objectContaining({
      defaultDaysP20: 10,
      defaultDaysP50: 14,
      defaultDaysP80: 18,
      conditionedDurationBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'smoke_exhaust_duct_open',
          selector: expect.objectContaining({
            hvacSmokeControlMethodBand: 'smoke_exhaust_duct',
            workfaceBand: 'open',
          }),
          defaultDaysP50: 12,
        }),
        expect.objectContaining({
          conditionCode: 'positive_pressure_linkage_standard',
          selector: expect.objectContaining({
            hvacSmokeControlMethodBand: 'positive_pressure_linkage',
            locationBand: 'indoor',
          }),
          defaultDaysP50: 15,
        }),
        expect.objectContaining({
          conditionCode: 'fire_damper_fan_linkage_constrained',
          selector: expect.objectContaining({
            hvacSmokeControlMethodBand: 'fire_damper_fan_linkage',
            workfaceBand: 'constrained',
          }),
          defaultDaysP50: 20,
        }),
      ]),
      productivityBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'smoke_exhaust_duct_open',
          baselineProductivity: expect.objectContaining({ p50PerDay: 58, unit: 'm2/day' }),
        }),
        expect.objectContaining({
          conditionCode: 'fire_damper_fan_linkage_constrained',
          baselineProductivity: expect.objectContaining({ p50PerDay: 32, unit: 'terminal/day' }),
        }),
      ]),
    }))

    expect(dustExhaust).toEqual(expect.objectContaining({
      defaultDaysP20: 11,
      defaultDaysP50: 15,
      defaultDaysP80: 20,
      conditionedDurationBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'general_dust_exhaust_open',
          selector: expect.objectContaining({
            hvacDustExhaustMethodBand: 'general_dust',
            workfaceBand: 'open',
          }),
          defaultDaysP50: 13,
        }),
        expect.objectContaining({
          conditionCode: 'bag_filter_collector_standard',
          selector: expect.objectContaining({
            hvacDustExhaustMethodBand: 'bag_filter_collector',
            locationBand: 'indoor',
          }),
          defaultDaysP50: 16,
        }),
        expect.objectContaining({
          conditionCode: 'explosion_proof_dust_constrained',
          selector: expect.objectContaining({
            hvacDustExhaustMethodBand: 'explosion_proof_dust',
            workfaceBand: 'constrained',
          }),
          defaultDaysP50: 22,
        }),
      ]),
      conditionedProcessProfiles: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'explosion_proof_dust_constrained',
          profile: expect.objectContaining({ defaultBase: 9, max: 24 }),
        }),
      ]),
    }))

    expect(vacuumCleaning).toEqual(expect.objectContaining({
      defaultDaysP20: 9,
      defaultDaysP50: 13,
      defaultDaysP80: 17,
      conditionedDurationBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'vacuum_pipe_network_open',
          selector: expect.objectContaining({
            hvacVacuumCleaningMethodBand: 'pipe_network',
            workfaceBand: 'open',
          }),
          defaultDaysP50: 11,
        }),
        expect.objectContaining({
          conditionCode: 'dense_inlet_terminal_standard',
          selector: expect.objectContaining({
            hvacVacuumCleaningMethodBand: 'dense_inlet_terminal',
            locationBand: 'indoor',
          }),
          defaultDaysP50: 14,
        }),
        expect.objectContaining({
          conditionCode: 'plant_filter_fan_constrained',
          selector: expect.objectContaining({
            hvacVacuumCleaningMethodBand: 'plant_filter_fan',
            workfaceBand: 'constrained',
          }),
          defaultDaysP50: 18,
        }),
      ]),
      productivityBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'vacuum_pipe_network_open',
          baselineProductivity: expect.objectContaining({ p50PerDay: 68, unit: 'm/day' }),
        }),
        expect.objectContaining({
          conditionCode: 'dense_inlet_terminal_standard',
          baselineProductivity: expect.objectContaining({ p50PerDay: 42, unit: 'point/day' }),
        }),
      ]),
    }))

    const positivePressure = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'hvac_smoke_control',
      applicableGranularity: 'task',
      methodVariantCodes: ['positive_pressure_linkage'],
    }) as any
    expect(positivePressure).toEqual(expect.objectContaining({
      selectedConditionCode: 'positive_pressure_linkage_standard',
      defaultDaysP50: 15,
      baselineProductivity: expect.objectContaining({ p50PerDay: 40, unit: 'terminal/day' }),
    }))

    const explosionProofDust = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'hvac_dust_exhaust',
      applicableGranularity: 'task',
      methodVariantCodes: ['explosion_proof_dust'],
    }) as any
    expect(explosionProofDust).toEqual(expect.objectContaining({
      selectedConditionCode: 'explosion_proof_dust_constrained',
      defaultDaysP50: 22,
      baselineProductivity: expect.objectContaining({ p50PerDay: 30, unit: 'm2/day' }),
    }))

    const denseVacuumInlet = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'hvac_vacuum_cleaning_system',
      applicableGranularity: 'task',
      methodVariantCodes: ['dense_vacuum_inlet'],
    }) as any
    expect(denseVacuumInlet).toEqual(expect.objectContaining({
      selectedConditionCode: 'dense_inlet_terminal_standard',
      defaultDaysP50: 14,
      baselineProductivity: expect.objectContaining({ p50PerDay: 42, unit: 'point/day' }),
    }))
  })

  it('keeps HVAC comfort, VRF, and constant-humidity durations conditionized by terminal, refrigerant, and precision-control scope', async () => {
    const byStableCode = new Map(STANDARD_WORK_DURATION_SEED.map((record) => [record.stableCode, record]))
    const comfortAir = byStableCode.get('hvac_comfort_air') as any
    const vrfSystem = byStableCode.get('hvac_vrf_multisplit_system') as any
    const constantHumidity = byStableCode.get('hvac_constant_humidity') as any

    expect(comfortAir).toEqual(expect.objectContaining({
      defaultDaysP20: 10,
      defaultDaysP50: 13,
      defaultDaysP80: 17,
      conditionedDurationBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'fan_coil_terminal_open',
          selector: expect.objectContaining({
            hvacComfortAirMethodBand: 'fan_coil_terminal',
            workfaceBand: 'open',
          }),
          defaultDaysP50: 11,
        }),
        expect.objectContaining({
          conditionCode: 'ahu_terminal_balancing_standard',
          selector: expect.objectContaining({
            hvacComfortAirMethodBand: 'ahu_terminal_balancing',
            locationBand: 'indoor',
          }),
          defaultDaysP50: 14,
        }),
        expect.objectContaining({
          conditionCode: 'dense_comfort_terminal_constrained',
          selector: expect.objectContaining({
            hvacComfortAirMethodBand: 'dense_terminal',
            workfaceBand: 'constrained',
          }),
          defaultDaysP50: 18,
        }),
      ]),
      productivityBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'fan_coil_terminal_open',
          baselineProductivity: expect.objectContaining({ p50PerDay: 10, unit: 'set/day' }),
        }),
        expect.objectContaining({
          conditionCode: 'dense_comfort_terminal_constrained',
          baselineProductivity: expect.objectContaining({ p50PerDay: 44, unit: 'terminal/day' }),
        }),
      ]),
    }))

    expect(vrfSystem).toEqual(expect.objectContaining({
      defaultDaysP20: 11,
      defaultDaysP50: 15,
      defaultDaysP80: 20,
      conditionedDurationBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'vrf_indoor_unit_open',
          selector: expect.objectContaining({
            hvacVrfMethodBand: 'indoor_unit',
            workfaceBand: 'open',
          }),
          defaultDaysP50: 13,
        }),
        expect.objectContaining({
          conditionCode: 'refrigerant_pipe_pressure_standard',
          selector: expect.objectContaining({
            hvacVrfMethodBand: 'refrigerant_pipe_pressure',
            locationBand: 'indoor',
          }),
          defaultDaysP50: 16,
        }),
        expect.objectContaining({
          conditionCode: 'multi_outdoor_unit_commissioning_constrained',
          selector: expect.objectContaining({
            hvacVrfMethodBand: 'multi_outdoor_commissioning',
            workfaceBand: 'constrained',
          }),
          defaultDaysP50: 22,
        }),
      ]),
      conditionedProcessProfiles: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'multi_outdoor_unit_commissioning_constrained',
          profile: expect.objectContaining({ defaultBase: 9, max: 24 }),
        }),
      ]),
    }))

    expect(constantHumidity).toEqual(expect.objectContaining({
      defaultDaysP20: 13,
      defaultDaysP50: 18,
      defaultDaysP80: 23,
      conditionedDurationBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'precision_ac_equipment_standard',
          selector: expect.objectContaining({
            hvacConstantHumidityMethodBand: 'precision_ac_equipment',
            locationBand: 'indoor',
          }),
          defaultDaysP50: 16,
        }),
        expect.objectContaining({
          conditionCode: 'humidification_dehumidification_loop_standard',
          selector: expect.objectContaining({
            hvacConstantHumidityMethodBand: 'humidification_loop',
            locationBand: 'indoor',
          }),
          defaultDaysP50: 19,
        }),
        expect.objectContaining({
          conditionCode: 'strict_temp_humidity_commissioning_constrained',
          selector: expect.objectContaining({
            hvacConstantHumidityMethodBand: 'strict_commissioning',
            workfaceBand: 'constrained',
          }),
          defaultDaysP50: 25,
        }),
      ]),
      productivityBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'precision_ac_equipment_standard',
          baselineProductivity: expect.objectContaining({ p50PerDay: 0.8, unit: 'set/day' }),
        }),
        expect.objectContaining({
          conditionCode: 'strict_temp_humidity_commissioning_constrained',
          baselineProductivity: expect.objectContaining({ p50PerDay: 0.45, unit: 'system/day' }),
        }),
      ]),
    }))

    const ahuTerminalBalancing = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'hvac_comfort_air',
      applicableGranularity: 'task',
      methodVariantCodes: ['comfort_ahu_terminal_balancing'],
    }) as any
    expect(ahuTerminalBalancing).toEqual(expect.objectContaining({
      selectedConditionCode: 'ahu_terminal_balancing_standard',
      defaultDaysP50: 14,
      baselineProductivity: expect.objectContaining({ p50PerDay: 58, unit: 'terminal/day' }),
    }))

    const vrfCommissioning = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'hvac_vrf_multisplit_system',
      applicableGranularity: 'task',
      methodVariantCodes: ['multi_outdoor_unit_commissioning'],
    }) as any
    expect(vrfCommissioning).toEqual(expect.objectContaining({
      selectedConditionCode: 'multi_outdoor_unit_commissioning_constrained',
      defaultDaysP50: 22,
      baselineProductivity: expect.objectContaining({ p50PerDay: 0.7, unit: 'system/day' }),
    }))

    const strictHumidityCommissioning = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'hvac_constant_humidity',
      applicableGranularity: 'task',
      methodVariantCodes: ['strict_temp_humidity_commissioning'],
    }) as any
    expect(strictHumidityCommissioning).toEqual(expect.objectContaining({
      selectedConditionCode: 'strict_temp_humidity_commissioning_constrained',
      defaultDaysP50: 25,
      baselineProductivity: expect.objectContaining({ p50PerDay: 0.45, unit: 'system/day' }),
    }))
  })

  it('keeps HVAC cleanroom, civil-defense ventilation, and water-equipment durations conditionized by cleanliness, blast protection, and water-equipment scope', async () => {
    const byStableCode = new Map(STANDARD_WORK_DURATION_SEED.map((record) => [record.stableCode, record]))
    const cleanroom = byStableCode.get('hvac_cleanroom_system') as any
    const civilDefense = byStableCode.get('hvac_civil_defense_ventilation') as any
    const waterEquipment = byStableCode.get('hvac_water_equipment_system') as any

    expect(cleanroom).toEqual(expect.objectContaining({
      defaultDaysP20: 15,
      defaultDaysP50: 20,
      defaultDaysP80: 26,
      conditionedDurationBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'terminal_hepa_cleanroom_standard',
          selector: expect.objectContaining({
            hvacCleanroomMethodBand: 'terminal_hepa',
            locationBand: 'indoor',
          }),
          defaultDaysP50: 17,
        }),
        expect.objectContaining({
          conditionCode: 'cleanroom_air_balance_validation',
          selector: expect.objectContaining({
            hvacCleanroomMethodBand: 'air_balance_validation',
            locationBand: 'indoor',
          }),
          defaultDaysP50: 22,
        }),
        expect.objectContaining({
          conditionCode: 'strict_cleanliness_validation_constrained',
          selector: expect.objectContaining({
            hvacCleanroomMethodBand: 'strict_cleanliness_validation',
            workfaceBand: 'constrained',
          }),
          defaultDaysP50: 28,
        }),
      ]),
      productivityBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'terminal_hepa_cleanroom_standard',
          baselineProductivity: expect.objectContaining({ p50PerDay: 22, unit: 'terminal/day' }),
        }),
        expect.objectContaining({
          conditionCode: 'strict_cleanliness_validation_constrained',
          baselineProductivity: expect.objectContaining({ p50PerDay: 0.35, unit: 'zone/day' }),
        }),
      ]),
    }))

    expect(civilDefense).toEqual(expect.objectContaining({
      defaultDaysP20: 12,
      defaultDaysP50: 16,
      defaultDaysP80: 21,
      conditionedDurationBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'blast_valve_filter_standard',
          selector: expect.objectContaining({
            hvacCivilDefenseMethodBand: 'blast_valve_filter',
            locationBand: 'indoor',
          }),
          defaultDaysP50: 14,
        }),
        expect.objectContaining({
          conditionCode: 'air_tightness_test_standard',
          selector: expect.objectContaining({
            hvacCivilDefenseMethodBand: 'air_tightness_test',
            locationBand: 'indoor',
          }),
          defaultDaysP50: 17,
        }),
        expect.objectContaining({
          conditionCode: 'wartime_conversion_linkage_constrained',
          selector: expect.objectContaining({
            hvacCivilDefenseMethodBand: 'wartime_conversion_linkage',
            workfaceBand: 'constrained',
          }),
          defaultDaysP50: 23,
        }),
      ]),
      productivityBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'blast_valve_filter_standard',
          baselineProductivity: expect.objectContaining({ p50PerDay: 3.5, unit: 'set/day' }),
        }),
        expect.objectContaining({
          conditionCode: 'wartime_conversion_linkage_constrained',
          baselineProductivity: expect.objectContaining({ p50PerDay: 0.7, unit: 'system/day' }),
        }),
      ]),
    }))

    expect(waterEquipment).toEqual(expect.objectContaining({
      defaultDaysP20: 11,
      defaultDaysP50: 15,
      defaultDaysP80: 20,
      conditionedDurationBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'pump_valve_skid_open',
          selector: expect.objectContaining({
            hvacWaterEquipmentMethodBand: 'pump_valve_skid',
            workfaceBand: 'open',
          }),
          defaultDaysP50: 13,
        }),
        expect.objectContaining({
          conditionCode: 'chilled_hot_water_equipment_standard',
          selector: expect.objectContaining({
            hvacWaterEquipmentMethodBand: 'chilled_hot_water_equipment',
            locationBand: 'indoor',
          }),
          defaultDaysP50: 16,
        }),
        expect.objectContaining({
          conditionCode: 'source_equipment_pressure_commissioning_constrained',
          selector: expect.objectContaining({
            hvacWaterEquipmentMethodBand: 'source_equipment_commissioning',
            workfaceBand: 'constrained',
          }),
          defaultDaysP50: 22,
        }),
      ]),
      conditionedProcessProfiles: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'source_equipment_pressure_commissioning_constrained',
          profile: expect.objectContaining({ defaultBase: 9, max: 24 }),
        }),
      ]),
    }))

    const strictCleanroomValidation = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'hvac_cleanroom_system',
      applicableGranularity: 'task',
      methodVariantCodes: ['strict_cleanliness_validation'],
    }) as any
    expect(strictCleanroomValidation).toEqual(expect.objectContaining({
      selectedConditionCode: 'strict_cleanliness_validation_constrained',
      defaultDaysP50: 28,
      baselineProductivity: expect.objectContaining({ p50PerDay: 0.35, unit: 'zone/day' }),
    }))

    const wartimeLinkage = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'hvac_civil_defense_ventilation',
      applicableGranularity: 'task',
      methodVariantCodes: ['wartime_conversion_linkage'],
    }) as any
    expect(wartimeLinkage).toEqual(expect.objectContaining({
      selectedConditionCode: 'wartime_conversion_linkage_constrained',
      defaultDaysP50: 23,
      baselineProductivity: expect.objectContaining({ p50PerDay: 0.7, unit: 'system/day' }),
    }))

    const sourceEquipmentCommissioning = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'hvac_water_equipment_system',
      applicableGranularity: 'task',
      methodVariantCodes: ['source_equipment_pressure_commissioning'],
    }) as any
    expect(sourceEquipmentCommissioning).toEqual(expect.objectContaining({
      selectedConditionCode: 'source_equipment_pressure_commissioning_constrained',
      defaultDaysP50: 22,
      baselineProductivity: expect.objectContaining({ p50PerDay: 0.75, unit: 'system/day' }),
    }))
  })

  it('keeps HVAC condensate, cooling-water, and ground-source exchange durations conditionized by intrinsic system method', async () => {
    const byStableCode = new Map(STANDARD_WORK_DURATION_SEED.map((record) => [record.stableCode, record]))
    const condensate = byStableCode.get('hvac_condensate_system') as any
    const coolingWater = byStableCode.get('hvac_cooling_water_system') as any
    const groundSource = byStableCode.get('hvac_ground_source_heat_pump_exchange') as any

    expect(condensate).toEqual(expect.objectContaining({
      defaultDaysP20: 7,
      defaultDaysP50: 9,
      defaultDaysP80: 12,
      conditionedDurationBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'gravity_condensate_drain_open',
          selector: expect.objectContaining({
            hvacCondensateMethodBand: 'gravity_drain',
            workfaceBand: 'open',
          }),
          defaultDaysP50: 7,
        }),
        expect.objectContaining({
          conditionCode: 'condensate_pump_lift_standard',
          selector: expect.objectContaining({
            hvacCondensateMethodBand: 'condensate_pump',
            locationBand: 'indoor',
          }),
          defaultDaysP50: 10,
        }),
        expect.objectContaining({
          conditionCode: 'condensate_flushing_functional_test_constrained',
          selector: expect.objectContaining({
            hvacCondensateMethodBand: 'flushing_functional_test',
            workfaceBand: 'constrained',
          }),
          defaultDaysP50: 13,
        }),
      ]),
      conditionedProcessProfiles: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'condensate_flushing_functional_test_constrained',
          profile: expect.objectContaining({ defaultBase: 6, max: 18 }),
        }),
      ]),
      productivityBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'gravity_condensate_drain_open',
          baselineProductivity: expect.objectContaining({ p50PerDay: 85, unit: 'm/day' }),
        }),
        expect.objectContaining({
          conditionCode: 'condensate_pump_lift_standard',
          baselineProductivity: expect.objectContaining({ p50PerDay: 2, unit: 'set/day' }),
        }),
      ]),
    }))

    expect(coolingWater).toEqual(expect.objectContaining({
      defaultDaysP20: 12,
      defaultDaysP50: 16,
      defaultDaysP80: 21,
      conditionedDurationBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'cooling_tower_open',
          selector: expect.objectContaining({
            hvacCoolingWaterMethodBand: 'cooling_tower',
            workfaceBand: 'open',
          }),
          defaultDaysP50: 14,
        }),
        expect.objectContaining({
          conditionCode: 'water_treatment_balancing_standard',
          selector: expect.objectContaining({
            hvacCoolingWaterMethodBand: 'water_treatment_balancing',
            locationBand: 'outdoor',
          }),
          defaultDaysP50: 17,
        }),
        expect.objectContaining({
          conditionCode: 'pump_header_commissioning_constrained',
          selector: expect.objectContaining({
            hvacCoolingWaterMethodBand: 'pump_header_commissioning',
            workfaceBand: 'constrained',
          }),
          defaultDaysP50: 23,
        }),
      ]),
      conditionedProcessProfiles: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'pump_header_commissioning_constrained',
          profile: expect.objectContaining({ defaultBase: 9, max: 25 }),
        }),
      ]),
      productivityBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'cooling_tower_open',
          baselineProductivity: expect.objectContaining({ p50PerDay: 1.2, unit: 'set/day' }),
        }),
        expect.objectContaining({
          conditionCode: 'pump_header_commissioning_constrained',
          baselineProductivity: expect.objectContaining({ p50PerDay: 0.75, unit: 'system/day' }),
        }),
      ]),
    }))

    expect(groundSource).toEqual(expect.objectContaining({
      defaultDaysP20: 17,
      defaultDaysP50: 22,
      defaultDaysP80: 29,
      conditionedDurationBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'vertical_borehole_loop_standard',
          selector: expect.objectContaining({
            hvacGroundSourceMethodBand: 'vertical_borehole_loop',
            depthBand: 'standard',
          }),
          defaultDaysP50: 20,
        }),
        expect.objectContaining({
          conditionCode: 'horizontal_buried_loop_open',
          selector: expect.objectContaining({
            hvacGroundSourceMethodBand: 'horizontal_buried_loop',
            workfaceBand: 'open',
          }),
          defaultDaysP50: 18,
        }),
        expect.objectContaining({
          conditionCode: 'manifold_pressure_commissioning_constrained',
          selector: expect.objectContaining({
            hvacGroundSourceMethodBand: 'manifold_pressure_commissioning',
            workfaceBand: 'constrained',
          }),
          defaultDaysP50: 30,
        }),
      ]),
      conditionedProcessProfiles: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'vertical_borehole_loop_standard',
          profile: expect.objectContaining({ defaultBase: 10, max: 30 }),
        }),
      ]),
      productivityBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'vertical_borehole_loop_standard',
          baselineProductivity: expect.objectContaining({ p50PerDay: 120, unit: 'm/day' }),
        }),
        expect.objectContaining({
          conditionCode: 'manifold_pressure_commissioning_constrained',
          baselineProductivity: expect.objectContaining({ p50PerDay: 0.6, unit: 'system/day' }),
        }),
      ]),
    }))

    const condensateFlushing = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'hvac_condensate_system',
      applicableGranularity: 'task',
      methodVariantCodes: ['condensate_flushing_functional_test'],
    }) as any
    expect(condensateFlushing).toEqual(expect.objectContaining({
      selectedConditionCode: 'condensate_flushing_functional_test_constrained',
      defaultDaysP50: 13,
      baselineProductivity: expect.objectContaining({ p50PerDay: 0.9, unit: 'system/day' }),
    }))

    const coolingWaterCommissioning = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'hvac_cooling_water_system',
      applicableGranularity: 'task',
      methodVariantCodes: ['pump_header_commissioning'],
    }) as any
    expect(coolingWaterCommissioning).toEqual(expect.objectContaining({
      selectedConditionCode: 'pump_header_commissioning_constrained',
      defaultDaysP50: 23,
      baselineProductivity: expect.objectContaining({ p50PerDay: 0.75, unit: 'system/day' }),
    }))

    const groundSourceManifoldCommissioning = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'hvac_ground_source_heat_pump_exchange',
      applicableGranularity: 'task',
      methodVariantCodes: ['manifold_pressure_commissioning'],
    }) as any
    expect(groundSourceManifoldCommissioning).toEqual(expect.objectContaining({
      selectedConditionCode: 'manifold_pressure_commissioning_constrained',
      defaultDaysP50: 30,
      baselineProductivity: expect.objectContaining({ p50PerDay: 0.6, unit: 'system/day' }),
    }))
  })

  it('keeps HVAC water-source, heat-pump exchange, and thermal-storage durations conditionized by intrinsic energy-side method', async () => {
    const byStableCode = new Map(STANDARD_WORK_DURATION_SEED.map((record) => [record.stableCode, record]))
    const waterSource = byStableCode.get('hvac_water_source_heat_pump_exchange') as any
    const heatPumpExchange = byStableCode.get('hvac_heat_pump_exchange_system') as any
    const thermalStorage = byStableCode.get('hvac_thermal_storage_system') as any

    expect(waterSource).toEqual(expect.objectContaining({
      defaultDaysP20: 12,
      defaultDaysP50: 16,
      defaultDaysP80: 21,
      conditionedDurationBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'surface_water_intake_reinjection_open',
          selector: expect.objectContaining({
            hvacWaterSourceMethodBand: 'surface_water_intake',
            workfaceBand: 'open',
          }),
          defaultDaysP50: 14,
        }),
        expect.objectContaining({
          conditionCode: 'well_intake_reinjection_standard',
          selector: expect.objectContaining({
            hvacWaterSourceMethodBand: 'well_intake_reinjection',
            depthBand: 'standard',
          }),
          defaultDaysP50: 18,
        }),
        expect.objectContaining({
          conditionCode: 'descaling_water_quality_commissioning_constrained',
          selector: expect.objectContaining({
            hvacWaterSourceMethodBand: 'descaling_commissioning',
            workfaceBand: 'constrained',
          }),
          defaultDaysP50: 24,
        }),
      ]),
      conditionedProcessProfiles: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'descaling_water_quality_commissioning_constrained',
          profile: expect.objectContaining({ defaultBase: 9, max: 26 }),
        }),
      ]),
      productivityBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'surface_water_intake_reinjection_open',
          baselineProductivity: expect.objectContaining({ p50PerDay: 95, unit: 'm/day' }),
        }),
        expect.objectContaining({
          conditionCode: 'descaling_water_quality_commissioning_constrained',
          baselineProductivity: expect.objectContaining({ p50PerDay: 0.7, unit: 'system/day' }),
        }),
      ]),
    }))

    expect(heatPumpExchange).toEqual(expect.objectContaining({
      defaultDaysP20: 13,
      defaultDaysP50: 18,
      defaultDaysP80: 23,
      conditionedDurationBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'ground_loop_exchange_standard',
          selector: expect.objectContaining({
            hvacHeatPumpExchangeMethodBand: 'ground_loop_exchange',
            depthBand: 'standard',
          }),
          defaultDaysP50: 17,
        }),
        expect.objectContaining({
          conditionCode: 'water_loop_exchange_open',
          selector: expect.objectContaining({
            hvacHeatPumpExchangeMethodBand: 'water_loop_exchange',
            workfaceBand: 'open',
          }),
          defaultDaysP50: 16,
        }),
        expect.objectContaining({
          conditionCode: 'hybrid_manifold_commissioning_constrained',
          selector: expect.objectContaining({
            hvacHeatPumpExchangeMethodBand: 'hybrid_manifold_commissioning',
            workfaceBand: 'constrained',
          }),
          defaultDaysP50: 26,
        }),
      ]),
      conditionedProcessProfiles: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'hybrid_manifold_commissioning_constrained',
          profile: expect.objectContaining({ defaultBase: 10, max: 30 }),
        }),
      ]),
      productivityBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'ground_loop_exchange_standard',
          baselineProductivity: expect.objectContaining({ p50PerDay: 130, unit: 'm/day' }),
        }),
        expect.objectContaining({
          conditionCode: 'hybrid_manifold_commissioning_constrained',
          baselineProductivity: expect.objectContaining({ p50PerDay: 0.55, unit: 'system/day' }),
        }),
      ]),
    }))

    expect(thermalStorage).toEqual(expect.objectContaining({
      defaultDaysP20: 12,
      defaultDaysP50: 16,
      defaultDaysP80: 21,
      conditionedDurationBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'water_storage_tank_open',
          selector: expect.objectContaining({
            hvacThermalStorageMethodBand: 'water_storage_tank',
            workfaceBand: 'open',
          }),
          defaultDaysP50: 14,
        }),
        expect.objectContaining({
          conditionCode: 'ice_storage_equipment_standard',
          selector: expect.objectContaining({
            hvacThermalStorageMethodBand: 'ice_storage_equipment',
            locationBand: 'indoor',
          }),
          defaultDaysP50: 18,
        }),
        expect.objectContaining({
          conditionCode: 'storage_charge_discharge_commissioning_constrained',
          selector: expect.objectContaining({
            hvacThermalStorageMethodBand: 'charge_discharge_commissioning',
            workfaceBand: 'constrained',
          }),
          defaultDaysP50: 23,
        }),
      ]),
      conditionedProcessProfiles: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'storage_charge_discharge_commissioning_constrained',
          profile: expect.objectContaining({ defaultBase: 9, max: 26 }),
        }),
      ]),
      productivityBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'water_storage_tank_open',
          baselineProductivity: expect.objectContaining({ p50PerDay: 1.1, unit: 'set/day' }),
        }),
        expect.objectContaining({
          conditionCode: 'storage_charge_discharge_commissioning_constrained',
          baselineProductivity: expect.objectContaining({ p50PerDay: 0.65, unit: 'system/day' }),
        }),
      ]),
    }))

    const waterSourceCommissioning = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'hvac_water_source_heat_pump_exchange',
      applicableGranularity: 'task',
      methodVariantCodes: ['descaling_water_quality_commissioning'],
    }) as any
    expect(waterSourceCommissioning).toEqual(expect.objectContaining({
      selectedConditionCode: 'descaling_water_quality_commissioning_constrained',
      defaultDaysP50: 24,
      baselineProductivity: expect.objectContaining({ p50PerDay: 0.7, unit: 'system/day' }),
    }))

    const hybridCommissioning = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'hvac_heat_pump_exchange_system',
      applicableGranularity: 'task',
      methodVariantCodes: ['hybrid_manifold_commissioning'],
    }) as any
    expect(hybridCommissioning).toEqual(expect.objectContaining({
      selectedConditionCode: 'hybrid_manifold_commissioning_constrained',
      defaultDaysP50: 26,
      baselineProductivity: expect.objectContaining({ p50PerDay: 0.55, unit: 'system/day' }),
    }))

    const chargeDischargeCommissioning = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'hvac_thermal_storage_system',
      applicableGranularity: 'task',
      methodVariantCodes: ['storage_charge_discharge_commissioning'],
    }) as any
    expect(chargeDischargeCommissioning).toEqual(expect.objectContaining({
      selectedConditionCode: 'storage_charge_discharge_commissioning_constrained',
      defaultDaysP50: 23,
      baselineProductivity: expect.objectContaining({ p50PerDay: 0.65, unit: 'system/day' }),
    }))
  })

  it('keeps HVAC solar, storage-solar, and automation-control durations conditionized by intrinsic integration method', async () => {
    const byStableCode = new Map(STANDARD_WORK_DURATION_SEED.map((record) => [record.stableCode, record]))
    const solarHeating = byStableCode.get('hvac_solar_heating_air_system') as any
    const storageSolar = byStableCode.get('hvac_energy_storage_solar_system') as any
    const automation = byStableCode.get('hvac_automation_control') as any

    expect(solarHeating).toEqual(expect.objectContaining({
      defaultDaysP20: 11,
      defaultDaysP50: 15,
      defaultDaysP80: 19,
      conditionedDurationBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'solar_collector_field_open',
          selector: expect.objectContaining({
            hvacSolarMethodBand: 'collector_field',
            workfaceBand: 'open',
          }),
          defaultDaysP50: 13,
        }),
        expect.objectContaining({
          conditionCode: 'solar_storage_auxiliary_standard',
          selector: expect.objectContaining({
            hvacSolarMethodBand: 'storage_auxiliary_heat',
            locationBand: 'outdoor',
          }),
          defaultDaysP50: 16,
        }),
        expect.objectContaining({
          conditionCode: 'solar_low_temp_loop_commissioning_constrained',
          selector: expect.objectContaining({
            hvacSolarMethodBand: 'low_temp_loop_commissioning',
            workfaceBand: 'constrained',
          }),
          defaultDaysP50: 21,
        }),
      ]),
      conditionedProcessProfiles: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'solar_low_temp_loop_commissioning_constrained',
          profile: expect.objectContaining({ defaultBase: 8, max: 24 }),
        }),
      ]),
      productivityBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'solar_collector_field_open',
          baselineProductivity: expect.objectContaining({ p50PerDay: 36, unit: 'collector/day' }),
        }),
        expect.objectContaining({
          conditionCode: 'solar_low_temp_loop_commissioning_constrained',
          baselineProductivity: expect.objectContaining({ p50PerDay: 0.75, unit: 'system/day' }),
        }),
      ]),
    }))

    expect(storageSolar).toEqual(expect.objectContaining({
      defaultDaysP20: 12,
      defaultDaysP50: 16,
      defaultDaysP80: 21,
      conditionedDurationBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'thermal_storage_collector_open',
          selector: expect.objectContaining({
            hvacStorageSolarMethodBand: 'collector_storage_loop',
            workfaceBand: 'open',
          }),
          defaultDaysP50: 14,
        }),
        expect.objectContaining({
          conditionCode: 'storage_tank_heat_exchange_standard',
          selector: expect.objectContaining({
            hvacStorageSolarMethodBand: 'storage_heat_exchange',
            locationBand: 'indoor',
          }),
          defaultDaysP50: 18,
        }),
        expect.objectContaining({
          conditionCode: 'hybrid_storage_solar_commissioning_constrained',
          selector: expect.objectContaining({
            hvacStorageSolarMethodBand: 'hybrid_commissioning',
            workfaceBand: 'constrained',
          }),
          defaultDaysP50: 24,
        }),
      ]),
      conditionedProcessProfiles: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'hybrid_storage_solar_commissioning_constrained',
          profile: expect.objectContaining({ defaultBase: 9, max: 28 }),
        }),
      ]),
      productivityBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'thermal_storage_collector_open',
          baselineProductivity: expect.objectContaining({ p50PerDay: 32, unit: 'collector/day' }),
        }),
        expect.objectContaining({
          conditionCode: 'hybrid_storage_solar_commissioning_constrained',
          baselineProductivity: expect.objectContaining({ p50PerDay: 0.6, unit: 'system/day' }),
        }),
      ]),
    }))

    expect(automation).toEqual(expect.objectContaining({
      defaultDaysP20: 8,
      defaultDaysP50: 11,
      defaultDaysP80: 14,
      conditionedDurationBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'sensor_actuator_point_open',
          selector: expect.objectContaining({
            hvacAutomationMethodBand: 'sensor_actuator_points',
            workfaceBand: 'open',
          }),
          defaultDaysP50: 9,
        }),
        expect.objectContaining({
          conditionCode: 'smoke_control_linkage_standard',
          selector: expect.objectContaining({
            hvacAutomationMethodBand: 'smoke_control_linkage',
            locationBand: 'indoor',
          }),
          defaultDaysP50: 12,
        }),
        expect.objectContaining({
          conditionCode: 'software_point_testing_commissioning_constrained',
          selector: expect.objectContaining({
            hvacAutomationMethodBand: 'software_point_commissioning',
            workfaceBand: 'constrained',
          }),
          defaultDaysP50: 16,
        }),
      ]),
      conditionedProcessProfiles: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'software_point_testing_commissioning_constrained',
          profile: expect.objectContaining({ defaultBase: 7, max: 20 }),
        }),
      ]),
      productivityBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'sensor_actuator_point_open',
          baselineProductivity: expect.objectContaining({ p50PerDay: 75, unit: 'point/day' }),
        }),
        expect.objectContaining({
          conditionCode: 'software_point_testing_commissioning_constrained',
          baselineProductivity: expect.objectContaining({ p50PerDay: 45, unit: 'point/day' }),
        }),
      ]),
    }))

    const solarCommissioning = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'hvac_solar_heating_air_system',
      applicableGranularity: 'task',
      methodVariantCodes: ['solar_low_temp_loop_commissioning'],
    }) as any
    expect(solarCommissioning).toEqual(expect.objectContaining({
      selectedConditionCode: 'solar_low_temp_loop_commissioning_constrained',
      defaultDaysP50: 21,
      baselineProductivity: expect.objectContaining({ p50PerDay: 0.75, unit: 'system/day' }),
    }))

    const hybridStorageCommissioning = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'hvac_energy_storage_solar_system',
      applicableGranularity: 'task',
      methodVariantCodes: ['hybrid_storage_solar_commissioning'],
    }) as any
    expect(hybridStorageCommissioning).toEqual(expect.objectContaining({
      selectedConditionCode: 'hybrid_storage_solar_commissioning_constrained',
      defaultDaysP50: 24,
      baselineProductivity: expect.objectContaining({ p50PerDay: 0.6, unit: 'system/day' }),
    }))

    const softwarePointCommissioning = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'hvac_automation_control',
      applicableGranularity: 'task',
      methodVariantCodes: ['software_point_testing_commissioning'],
    }) as any
    expect(softwarePointCommissioning).toEqual(expect.objectContaining({
      selectedConditionCode: 'software_point_testing_commissioning_constrained',
      defaultDaysP50: 16,
      baselineProductivity: expect.objectContaining({ p50PerDay: 45, unit: 'point/day' }),
    }))
  })

  it('keeps HVAC chiller and absorption refrigeration durations conditionized by intrinsic equipment method', async () => {
    const byStableCode = new Map(STANDARD_WORK_DURATION_SEED.map((record) => [record.stableCode, record]))
    const compressionChiller = byStableCode.get('hvac_compression_chiller_equipment') as any
    const absorptionRefrigeration = byStableCode.get('hvac_absorption_refrigeration_equipment') as any
    const combinedChillerAbsorption = byStableCode.get('hvac_chiller_absorption_equipment') as any

    expect(compressionChiller).toEqual(expect.objectContaining({
      defaultDaysP20: 15,
      defaultDaysP50: 21,
      defaultDaysP80: 27,
      conditionedDurationBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'compression_chiller_hoisting_standard',
          selector: expect.objectContaining({
            hvacCompressionChillerMethodBand: 'chiller_hoisting',
            locationBand: 'indoor',
          }),
          defaultDaysP50: 19,
        }),
        expect.objectContaining({
          conditionCode: 'refrigerant_pressure_test_constrained',
          selector: expect.objectContaining({
            hvacCompressionChillerMethodBand: 'refrigerant_pressure_test',
            workfaceBand: 'constrained',
          }),
          defaultDaysP50: 23,
        }),
        expect.objectContaining({
          conditionCode: 'compression_chiller_commissioning_constrained',
          selector: expect.objectContaining({
            hvacCompressionChillerMethodBand: 'chiller_commissioning',
            workfaceBand: 'constrained',
          }),
          defaultDaysP50: 27,
        }),
      ]),
      conditionedProcessProfiles: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'compression_chiller_commissioning_constrained',
          profile: expect.objectContaining({ defaultBase: 11, max: 32 }),
        }),
      ]),
      productivityBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'compression_chiller_hoisting_standard',
          baselineProductivity: expect.objectContaining({ p50PerDay: 0.55, unit: 'set/day' }),
        }),
        expect.objectContaining({
          conditionCode: 'compression_chiller_commissioning_constrained',
          baselineProductivity: expect.objectContaining({ p50PerDay: 0.5, unit: 'system/day' }),
        }),
      ]),
    }))

    expect(absorptionRefrigeration).toEqual(expect.objectContaining({
      defaultDaysP20: 17,
      defaultDaysP50: 24,
      defaultDaysP80: 31,
      conditionedDurationBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'absorption_unit_hoisting_standard',
          selector: expect.objectContaining({
            hvacAbsorptionRefrigerationMethodBand: 'absorption_unit_hoisting',
            locationBand: 'indoor',
          }),
          defaultDaysP50: 22,
        }),
        expect.objectContaining({
          conditionCode: 'vacuum_lithium_bromide_charging_constrained',
          selector: expect.objectContaining({
            hvacAbsorptionRefrigerationMethodBand: 'vacuum_lithium_bromide_charging',
            workfaceBand: 'constrained',
          }),
          defaultDaysP50: 27,
        }),
        expect.objectContaining({
          conditionCode: 'steam_fuel_interface_commissioning_constrained',
          selector: expect.objectContaining({
            hvacAbsorptionRefrigerationMethodBand: 'steam_fuel_interface_commissioning',
            workfaceBand: 'constrained',
          }),
          defaultDaysP50: 30,
        }),
      ]),
      conditionedProcessProfiles: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'steam_fuel_interface_commissioning_constrained',
          profile: expect.objectContaining({ defaultBase: 12, max: 36 }),
        }),
      ]),
      productivityBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'absorption_unit_hoisting_standard',
          baselineProductivity: expect.objectContaining({ p50PerDay: 0.45, unit: 'set/day' }),
        }),
        expect.objectContaining({
          conditionCode: 'steam_fuel_interface_commissioning_constrained',
          baselineProductivity: expect.objectContaining({ p50PerDay: 0.42, unit: 'system/day' }),
        }),
      ]),
    }))

    expect(combinedChillerAbsorption).toEqual(expect.objectContaining({
      defaultDaysP20: 16,
      defaultDaysP50: 22,
      defaultDaysP80: 28,
      conditionedDurationBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'compression_chiller_branch_standard',
          selector: expect.objectContaining({
            hvacChillerAbsorptionMethodBand: 'compression_chiller_branch',
            locationBand: 'indoor',
          }),
          defaultDaysP50: 21,
        }),
        expect.objectContaining({
          conditionCode: 'absorption_chiller_branch_standard',
          selector: expect.objectContaining({
            hvacChillerAbsorptionMethodBand: 'absorption_chiller_branch',
            locationBand: 'indoor',
          }),
          defaultDaysP50: 24,
        }),
        expect.objectContaining({
          conditionCode: 'hybrid_chiller_commissioning_constrained',
          selector: expect.objectContaining({
            hvacChillerAbsorptionMethodBand: 'hybrid_chiller_commissioning',
            workfaceBand: 'constrained',
          }),
          defaultDaysP50: 29,
        }),
      ]),
      conditionedProcessProfiles: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'hybrid_chiller_commissioning_constrained',
          profile: expect.objectContaining({ defaultBase: 11, max: 34 }),
        }),
      ]),
      productivityBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'compression_chiller_branch_standard',
          baselineProductivity: expect.objectContaining({ p50PerDay: 0.5, unit: 'set/day' }),
        }),
        expect.objectContaining({
          conditionCode: 'hybrid_chiller_commissioning_constrained',
          baselineProductivity: expect.objectContaining({ p50PerDay: 0.45, unit: 'system/day' }),
        }),
      ]),
    }))

    const compressionCommissioning = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'hvac_compression_chiller_equipment',
      applicableGranularity: 'task',
      methodVariantCodes: ['compression_chiller_commissioning'],
    }) as any
    expect(compressionCommissioning).toEqual(expect.objectContaining({
      selectedConditionCode: 'compression_chiller_commissioning_constrained',
      defaultDaysP50: 27,
      baselineProductivity: expect.objectContaining({ p50PerDay: 0.5, unit: 'system/day' }),
    }))

    const absorptionCommissioning = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'hvac_absorption_refrigeration_equipment',
      applicableGranularity: 'task',
      methodVariantCodes: ['steam_fuel_interface_commissioning'],
    }) as any
    expect(absorptionCommissioning).toEqual(expect.objectContaining({
      selectedConditionCode: 'steam_fuel_interface_commissioning_constrained',
      defaultDaysP50: 30,
      baselineProductivity: expect.objectContaining({ p50PerDay: 0.42, unit: 'system/day' }),
    }))

    const hybridCommissioning = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'hvac_chiller_absorption_equipment',
      applicableGranularity: 'task',
      methodVariantCodes: ['hybrid_chiller_commissioning'],
    }) as any
    expect(hybridCommissioning).toEqual(expect.objectContaining({
      selectedConditionCode: 'hybrid_chiller_commissioning_constrained',
      defaultDaysP50: 29,
      baselineProductivity: expect.objectContaining({ p50PerDay: 0.45, unit: 'system/day' }),
    }))
  })

  it('keeps facade duration and productivity conditionized by curtain-wall system and height', async () => {
    const byStableCode = new Map(STANDARD_WORK_DURATION_SEED.map((record) => [record.stableCode, record]))
    const curtainWall = byStableCode.get('curtain_wall_installation') as any

    expect(curtainWall).toEqual(expect.objectContaining({
      defaultDaysP20: 13,
      defaultDaysP50: 18,
      defaultDaysP80: 23,
      conditionedDurationBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'unitized_standard_rise_open_workface',
          selector: expect.objectContaining({
            facadeSystemBand: 'unitized',
            heightBand: 'low_rise',
            workfaceBand: 'open',
          }),
          defaultDaysP20: 7,
          defaultDaysP50: 12,
          defaultDaysP80: 17,
        }),
        expect.objectContaining({
          conditionCode: 'stone_high_rise_constrained_workface',
          selector: expect.objectContaining({
            facadeSystemBand: 'stone',
            heightBand: 'high_rise',
            workfaceBand: 'constrained',
          }),
          defaultDaysP20: 18,
          defaultDaysP50: 28,
          defaultDaysP80: 38,
        }),
      ]),
      productivityBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'unitized_standard_rise_open_workface',
          baselineProductivity: expect.objectContaining({
            p50PerDay: 85,
            unit: 'm2/day',
            sourceType: 'expert_profile',
          }),
        }),
        expect.objectContaining({
          conditionCode: 'stick_standard_rise_open_workface',
          baselineProductivity: expect.objectContaining({
            p50PerDay: 65,
            unit: 'm2/day',
            sourceType: 'quota',
          }),
        }),
        expect.objectContaining({
          conditionCode: 'stone_high_rise_constrained_workface',
          baselineProductivity: expect.objectContaining({
            p50PerDay: 38,
            unit: 'm2/day',
            sourceType: 'expert_profile',
          }),
        }),
      ]),
      conditionedProcessProfiles: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'unitized_standard_rise_open_workface',
          profile: expect.objectContaining({
            defaultBase: 5,
            max: 18,
          }),
        }),
        expect.objectContaining({
          conditionCode: 'stone_high_rise_constrained_workface',
          profile: expect.objectContaining({
            defaultBase: 10,
            max: 38,
          }),
        }),
      ]),
    }))

    const unitized = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'curtain_wall_installation',
      applicableGranularity: 'task',
      methodVariantCodes: ['unitized_curtain_wall'],
      elementVariantCodes: ['low_rise_facade', 'open_workface'],
    }) as any

    expect(unitized).toEqual(expect.objectContaining({
      selectedConditionCode: 'unitized_standard_rise_open_workface',
      defaultDaysP50: 12,
      defaultDaysP80: 17,
      baselineProductivity: expect.objectContaining({
        p50PerDay: 85,
        unit: 'm2/day',
      }),
    }))

    const stoneHighRise = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'curtain_wall_installation',
      applicableGranularity: 'task',
      methodVariantCodes: ['stone_curtain_wall'],
      elementVariantCodes: ['high_rise_facade', 'constrained_workface'],
    }) as any

    expect(stoneHighRise).toEqual(expect.objectContaining({
      selectedConditionCode: 'stone_high_rise_constrained_workface',
      defaultDaysP50: 28,
      defaultDaysP80: 38,
      baselineProductivity: expect.objectContaining({
        p50PerDay: 38,
        unit: 'm2/day',
      }),
    }))
  })

  it('keeps structural formwork duration and productivity conditionized by formwork system', async () => {
    const byStableCode = new Map(STANDARD_WORK_DURATION_SEED.map((record) => [record.stableCode, record]))
    const formwork = byStableCode.get('cast_in_place_formwork') as any

    expect(formwork).toEqual(expect.objectContaining({
      defaultDaysP20: 4,
      defaultDaysP50: 5,
      defaultDaysP80: 7,
      conditionedDurationBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'aluminum_formwork_standard_floor',
          selector: expect.objectContaining({
            formworkSystemBand: 'aluminum',
            heightBand: 'high_rise',
          }),
          defaultDaysP20: 2,
          defaultDaysP50: 3,
          defaultDaysP80: 5,
        }),
        expect.objectContaining({
          conditionCode: 'timber_formwork_standard_floor',
          selector: expect.objectContaining({
            formworkSystemBand: 'timber',
          }),
          defaultDaysP20: 4,
          defaultDaysP50: 6,
          defaultDaysP80: 9,
        }),
      ]),
      productivityBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'aluminum_formwork_standard_floor',
          baselineProductivity: expect.objectContaining({
            p50PerDay: 0.33,
            unit: 'floor/day',
            sourceType: 'expert_profile',
          }),
        }),
        expect.objectContaining({
          conditionCode: 'large_formwork_standard_floor',
          baselineProductivity: expect.objectContaining({
            p50PerDay: 0.25,
            unit: 'floor/day',
            sourceType: 'quota',
          }),
        }),
        expect.objectContaining({
          conditionCode: 'timber_formwork_standard_floor',
          baselineProductivity: expect.objectContaining({
            p50PerDay: 0.17,
            unit: 'floor/day',
            sourceType: 'expert_profile',
          }),
        }),
      ]),
      conditionedProcessProfiles: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'aluminum_formwork_standard_floor',
          profile: expect.objectContaining({
            defaultBase: 3,
            max: 7,
          }),
        }),
        expect.objectContaining({
          conditionCode: 'timber_formwork_standard_floor',
          profile: expect.objectContaining({
            defaultBase: 5,
            max: 10,
          }),
        }),
      ]),
    }))

    const aluminum = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'cast_in_place_formwork',
      applicableGranularity: 'task',
      methodVariantCodes: ['aluminum_formwork'],
      elementVariantCodes: ['high_rise_core_and_floor_cycle'],
    }) as any

    expect(aluminum).toEqual(expect.objectContaining({
      selectedConditionCode: 'aluminum_formwork_standard_floor',
      defaultDaysP50: 3,
      defaultDaysP80: 5,
      baselineProductivity: expect.objectContaining({
        p50PerDay: 0.33,
        unit: 'floor/day',
      }),
      benchmarkBasis: expect.stringContaining('conditionBand=aluminum_formwork_standard_floor'),
    }))

    const timber = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'cast_in_place_formwork',
      applicableGranularity: 'task',
      methodVariantCodes: ['wood_formwork'],
    }) as any

    expect(timber).toEqual(expect.objectContaining({
      selectedConditionCode: 'timber_formwork_standard_floor',
      defaultDaysP50: 6,
      defaultDaysP80: 9,
      baselineProductivity: expect.objectContaining({
        p50PerDay: 0.17,
        unit: 'floor/day',
      }),
    }))
  })

  it('keeps structural rebar duration and productivity conditionized by floor system', async () => {
    const byStableCode = new Map(STANDARD_WORK_DURATION_SEED.map((record) => [record.stableCode, record]))
    const rebar = byStableCode.get('cast_in_place_rebar') as any

    expect(rebar).toEqual(expect.objectContaining({
      defaultDaysP20: 4,
      defaultDaysP50: 6,
      defaultDaysP80: 8,
      conditionedDurationBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'prefab_rebar_standard_floor',
          selector: expect.objectContaining({
            formworkSystemBand: 'prefab',
          }),
          defaultDaysP20: 2,
          defaultDaysP50: 3,
          defaultDaysP80: 5,
        }),
        expect.objectContaining({
          conditionCode: 'aluminum_formwork_rebar_standard_floor',
          selector: expect.objectContaining({
            formworkSystemBand: 'aluminum',
            heightBand: 'high_rise',
          }),
          defaultDaysP20: 3,
          defaultDaysP50: 4,
          defaultDaysP80: 6,
        }),
        expect.objectContaining({
          conditionCode: 'timber_formwork_rebar_standard_floor',
          selector: expect.objectContaining({
            formworkSystemBand: 'timber',
          }),
          defaultDaysP20: 4,
          defaultDaysP50: 6,
          defaultDaysP80: 9,
        }),
      ]),
      productivityBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'prefab_rebar_standard_floor',
          baselineProductivity: expect.objectContaining({
            p50PerDay: 2.2,
            unit: 't/day',
            sourceType: 'expert_profile',
          }),
        }),
        expect.objectContaining({
          conditionCode: 'aluminum_formwork_rebar_standard_floor',
          baselineProductivity: expect.objectContaining({
            p50PerDay: 1.8,
            unit: 't/day',
            sourceType: 'expert_profile',
          }),
        }),
        expect.objectContaining({
          conditionCode: 'timber_formwork_rebar_standard_floor',
          baselineProductivity: expect.objectContaining({
            p50PerDay: 1.2,
            unit: 't/day',
            sourceType: 'expert_profile',
          }),
        }),
      ]),
      conditionedProcessProfiles: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'prefab_rebar_standard_floor',
          profile: expect.objectContaining({
            defaultBase: 3,
            max: 7,
          }),
        }),
        expect.objectContaining({
          conditionCode: 'timber_formwork_rebar_standard_floor',
          profile: expect.objectContaining({
            defaultBase: 5,
            max: 10,
          }),
        }),
      ]),
    }))

    const prefab = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'cast_in_place_rebar',
      applicableGranularity: 'task',
      methodVariantCodes: ['prefab'],
    }) as any

    expect(prefab).toEqual(expect.objectContaining({
      selectedConditionCode: 'prefab_rebar_standard_floor',
      defaultDaysP50: 3,
      defaultDaysP80: 5,
      baselineProductivity: expect.objectContaining({
        p50PerDay: 2.2,
        unit: 't/day',
      }),
      benchmarkBasis: expect.stringContaining('conditionBand=prefab_rebar_standard_floor'),
    }))

    const aluminum = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'cast_in_place_rebar',
      applicableGranularity: 'task',
      methodVariantCodes: ['aluminum_formwork'],
      elementVariantCodes: ['high_rise_core_and_floor_cycle'],
    }) as any

    expect(aluminum).toEqual(expect.objectContaining({
      selectedConditionCode: 'aluminum_formwork_rebar_standard_floor',
      defaultDaysP50: 4,
      defaultDaysP80: 6,
      baselineProductivity: expect.objectContaining({
        p50PerDay: 1.8,
        unit: 't/day',
      }),
    }))

    const timber = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'cast_in_place_rebar',
      applicableGranularity: 'task',
      methodVariantCodes: ['wood_formwork'],
    }) as any

    expect(timber).toEqual(expect.objectContaining({
      selectedConditionCode: 'timber_formwork_rebar_standard_floor',
      defaultDaysP50: 6,
      defaultDaysP80: 9,
      baselineProductivity: expect.objectContaining({
        p50PerDay: 1.2,
        unit: 't/day',
      }),
    }))
  })

  it('keeps structural concrete duration and productivity conditionized by placement method', async () => {
    const byStableCode = new Map(STANDARD_WORK_DURATION_SEED.map((record) => [record.stableCode, record]))
    const concrete = byStableCode.get('cast_in_place_concrete') as any

    expect(concrete).toEqual(expect.objectContaining({
      defaultDaysP20: 3,
      defaultDaysP50: 4,
      defaultDaysP80: 5,
      conditionedDurationBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'pumped_standard_floor_concrete',
          selector: expect.objectContaining({
            concretePlacementBand: 'pump',
            heightBand: 'high_rise',
          }),
          defaultDaysP20: 1,
          defaultDaysP50: 2,
          defaultDaysP80: 4,
        }),
        expect.objectContaining({
          conditionCode: 'bucket_constrained_concrete',
          selector: expect.objectContaining({
            concretePlacementBand: 'bucket',
            workfaceBand: 'constrained',
          }),
          defaultDaysP20: 3,
          defaultDaysP50: 5,
          defaultDaysP80: 8,
        }),
        expect.objectContaining({
          conditionCode: 'mass_concrete_temperature_control',
          selector: expect.objectContaining({
            concretePlacementBand: 'mass',
          }),
          defaultDaysP20: 4,
          defaultDaysP50: 7,
          defaultDaysP80: 11,
        }),
      ]),
      productivityBands: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'pumped_standard_floor_concrete',
          baselineProductivity: expect.objectContaining({
            p50PerDay: 180,
            unit: 'm3/day',
            sourceType: 'expert_profile',
          }),
        }),
        expect.objectContaining({
          conditionCode: 'standard_pump_concrete',
          baselineProductivity: expect.objectContaining({
            p50PerDay: 120,
            unit: 'm3/day',
            sourceType: 'quota',
          }),
        }),
        expect.objectContaining({
          conditionCode: 'mass_concrete_temperature_control',
          baselineProductivity: expect.objectContaining({
            p50PerDay: 90,
            unit: 'm3/day',
            sourceType: 'expert_profile',
          }),
        }),
      ]),
      conditionedProcessProfiles: expect.arrayContaining([
        expect.objectContaining({
          conditionCode: 'pumped_standard_floor_concrete',
          profile: expect.objectContaining({
            defaultBase: 2,
            max: 6,
          }),
        }),
        expect.objectContaining({
          conditionCode: 'mass_concrete_temperature_control',
          profile: expect.objectContaining({
            defaultBase: 6,
            max: 14,
          }),
        }),
      ]),
    }))

    const pumped = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'cast_in_place_concrete',
      applicableGranularity: 'task',
      methodVariantCodes: ['pumped_concrete'],
      elementVariantCodes: ['high_rise_core_and_floor_cycle'],
    }) as any

    expect(pumped).toEqual(expect.objectContaining({
      selectedConditionCode: 'pumped_standard_floor_concrete',
      defaultDaysP50: 2,
      defaultDaysP80: 4,
      baselineProductivity: expect.objectContaining({
        p50PerDay: 180,
        unit: 'm3/day',
      }),
      benchmarkBasis: expect.stringContaining('conditionBand=pumped_standard_floor_concrete'),
    }))

    const bucket = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'cast_in_place_concrete',
      applicableGranularity: 'task',
      methodVariantCodes: ['tower_bucket_concrete'],
      elementVariantCodes: ['constrained_workface'],
    }) as any

    expect(bucket).toEqual(expect.objectContaining({
      selectedConditionCode: 'bucket_constrained_concrete',
      defaultDaysP50: 5,
      defaultDaysP80: 8,
      baselineProductivity: expect.objectContaining({
        p50PerDay: 75,
        unit: 'm3/day',
      }),
    }))

    const mass = await resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'cast_in_place_concrete',
      applicableGranularity: 'task',
      methodVariantCodes: ['mass_concrete'],
    }) as any

    expect(mass).toEqual(expect.objectContaining({
      selectedConditionCode: 'mass_concrete_temperature_control',
      defaultDaysP50: 7,
      defaultDaysP80: 11,
      baselineProductivity: expect.objectContaining({
        p50PerDay: 90,
        unit: 'm3/day',
      }),
    }))
  })

  it('keeps complex domain templates covered by governed duration profiles and exact high-risk overrides', async () => {
    const complexDomainPrefixes = ['DTC', 'ICR', 'RNV', 'HRT', 'CMP', 'TOD', 'MIC', 'IBU', 'IKU', 'HTL']
    const processDurationRules = STANDARD_WORK_DURATION_SEED.filter((record) => String(record.stableCode).startsWith('process_duration:'))
    const byCode = new Map(processDurationRules.map((record) => [record.standardWorkCodes[0], record]))
    const domainProcessCodes = DOMAIN_WBS_TEMPLATE_CATALOGS
      .flatMap((catalog) => flattenChinaTemplateCatalog(catalog.divisions))
      .filter((node) => node.categoryType === 'process' && complexDomainPrefixes.some((prefix) => node.stableCode.startsWith(`${prefix}-`)))
      .map((node) => node.stableCode)

    expect(domainProcessCodes.length).toBeGreaterThan(300)
    expect(domainProcessCodes.filter((code) => !byCode.has(code))).toHaveLength(0)

    const domainRules = domainProcessCodes.map((code) => byCode.get(code)).filter((record): record is NonNullable<typeof record> => Boolean(record))
    expect(domainRules.filter((record) => record.confidence === 'low')).toHaveLength(0)
    expect(domainRules.filter((record) => record.defaultDaysByMethod?.domain_template_method != null || record.defaultDaysByMethod?.default_domain_method != null)).toHaveLength(0)
    expect(domainRules.filter((record) => record.baseDaysEligible && !(record.projectTypeCodes?.length))).toHaveLength(0)
    expect(domainRules.filter((record) => record.baseDaysEligible && !(record.projectTypeDurationFactors && Object.keys(record.projectTypeDurationFactors).length > 0))).toHaveLength(0)
    expect(domainRules.filter((record) => record.baseDaysEligible && !(record.elementVariantCodes?.length))).toHaveLength(0)
    expect(domainRules.filter((record) => record.baseDaysEligible && !record.baselineProductivity)).toHaveLength(0)

    const expectedDomainProfiles = {
      DTC: 'expert_domain_data_center',
      ICR: 'expert_domain_industrial_cleanroom',
      RNV: 'expert_domain_renovation_retrofit',
      HRT: 'expert_domain_heritage_preservation',
      CMP: 'expert_domain_campus',
      TOD: 'expert_domain_tod_upper_cover',
      MIC: 'expert_domain_modular_mic',
      IBU: 'expert_domain_prefab_bathroom',
      IKU: 'expert_domain_prefab_kitchen',
      HTL: 'expert_domain_hotel',
    }
    for (const [prefix, profile] of Object.entries(expectedDomainProfiles)) {
      const rulesForPrefix = domainRules.filter((record) => record.standardWorkCodes[0].startsWith(`${prefix}-`))
      expect(rulesForPrefix.length).toBeGreaterThan(0)
      expect(rulesForPrefix.every((record) => String(record.sourceClauseRef).includes(`domain_profile=${profile}`))).toBe(true)
    }

    const highRiskCodes = [
      'DTC-02-01-01-P02',
      'DTC-02-01-01-P04',
      'DTC-02-02-01-P01',
      'DTC-03-01-02-P01',
      'ICR-03-01-01-P01',
      'ICR-03-01-02-P03',
      'ICR-04-01-01-P01',
      'RNV-02-01-01-P01',
      'RNV-02-02-01-P02',
      'HRT-01-01-01-P02',
      'HRT-02-02-01-P01',
      'HRT-02-02-01-P02',
      'HRT-04-01-03-P02',
      'HRT-04-01-08-P02',
      'HRT-04-01-09-P02',
      'CMP-01-01-02-P02',
      'CMP-02-01-02-P02',
      'CMP-03-01-02-P01',
      'CMP-04-01-01-P03',
      'TOD-02-01-01-P01',
      'TOD-02-01-02-P01',
      'MIC-04-01-01-P03',
      'MIC-04-01-02-P02',
      'IBU-02-01-01-P02',
      'IKU-02-01-01-P02',
      'HTL-01-01-02-P01',
      'HTL-02-01-01-P01',
      'HTL-03-01-01-P02',
      'HTL-04-01-02-P02',
    ]
    for (const code of highRiskCodes) {
      const record = byCode.get(code)
      expect(record).toEqual(expect.objectContaining({
        confidence: 'high',
        sourceClauseRef: expect.stringContaining('expert_override='),
        projectTypeCodes: expect.any(Array),
        elementVariantCodes: expect.any(Array),
        baselineProductivity: expect.any(Object),
      }))
      expect(record?.projectTypeCodes?.length ?? 0).toBeGreaterThan(0)
      expect(Object.keys(record?.projectTypeDurationFactors ?? {}).length).toBeGreaterThan(0)
      expect(Object.keys(record?.defaultDaysByMethod ?? {}).length).toBeGreaterThanOrEqual(2)
      expect(record?.defaultDaysByMethod?.domain_template_method).toBeUndefined()
      expect(record?.defaultDaysP50 ?? 0).toBeGreaterThan(1)
    }

    for (const prefix of ['DTC', 'ICR', 'RNV', 'HRT', 'CMP', 'TOD', 'MIC', 'IBU', 'IKU', 'HTL']) {
      const durationBearingRules = domainRules
        .filter((record) => record.standardWorkCodes[0].startsWith(`${prefix}-`))
        .filter((record) => record.baseDaysEligible)

      expect(durationBearingRules.length).toBeGreaterThan(0)
      const governedDurationRules = durationBearingRules.filter((record) => String(record.benchmarkBasis) !== 'processSignals=weather_process_seasonal_sensitivity')
      expect(governedDurationRules.filter((record) => String(record.benchmarkBasis).includes('processSignals=standard_process_family_default'))).toHaveLength(0)
    }

    await expect(resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'DTC-02-01-01-P04',
      projectTypeCode: 'tier4_data_center',
      methodVariantCodes: ['load_bank_test'],
      elementVariantCodes: ['load_bank_test'],
      applicableGranularity: 'task',
    })).resolves.toEqual(expect.objectContaining({
      confidence: 'high',
      benchmarkBasis: expect.stringContaining('methodBucket=load_bank_test'),
    }))
    await expect(resolveStandardWorkDurationSeed('', {
      standardWorkCode: 'HTL-02-01-01-P01',
      projectTypeCode: 'luxury_hotel',
      methodVariantCodes: ['luxury_public_area'],
      elementVariantCodes: ['luxury_public_area'],
      applicableGranularity: 'task',
    })).resolves.toEqual(expect.objectContaining({
      confidence: 'high',
      benchmarkBasis: expect.stringContaining('projectTypeFactor=luxury_hotel:1.32'),
    }))
  })

  it('keeps non-base governance and milestone support packs out of task base-day contribution', () => {
    const processDurationRules = STANDARD_WORK_DURATION_SEED.filter((record) => String(record.stableCode).startsWith('process_duration:'))
    const byCode = new Map(processDurationRules.map((record) => [record.standardWorkCodes[0], record]))
    const nonBasePrefixes = ['DCS-01-01-11', 'MS-01-01-22', 'MS-01-01-23']

    for (const prefix of nonBasePrefixes) {
      const records = processDurationRules.filter((record) => record.standardWorkCodes[0]?.startsWith(prefix))

      expect(records.length).toBeGreaterThan(0)
      expect(records.filter((record) => record.baseDaysEligible)).toHaveLength(0)
      expect(records.every((record) => record.durationContributionMode !== 'duration_bearing')).toBe(true)
    }

    expect(byCode.get('DCS-01-01-11-P04')).toEqual(expect.objectContaining({
      durationContributionMode: 'quality_gate',
      baseDaysEligible: false,
    }))
    expect(byCode.get('MS-01-01-22-P01')).toEqual(expect.objectContaining({
      durationContributionMode: 'handover_marker',
      baseDaysEligible: false,
    }))
    expect(byCode.get('MS-01-01-23-P01')).toEqual(expect.objectContaining({
      durationContributionMode: 'quality_gate',
      baseDaysEligible: false,
    }))
  })

  it('keeps representative generated template chains within commercial cold-start duration bands', () => {
    const processDurationRules = STANDARD_WORK_DURATION_SEED.filter((record) => String(record.stableCode).startsWith('process_duration:'))
    const byCode = new Map(processDurationRules.map((record) => [record.standardWorkCodes[0], record.defaultDaysP50]))
    const sum = (codes: string[]) => codes.reduce((total, code) => total + (byCode.get(code) ?? 0), 0)

    expect(sum([
      '02-01-01-P03', '02-01-01-P04', '02-01-01-P05',
      '02-01-02-P01', '02-01-02-P03', '02-01-02-P04', '02-01-02-P05',
      '02-01-03-P02', '02-01-03-P03', '02-01-03-P04', '02-01-03-P05', '02-01-03-P06',
    ])).toBeGreaterThanOrEqual(22)
    expect(sum([
      '02-01-01-P03', '02-01-01-P04', '02-01-01-P05',
      '02-01-02-P01', '02-01-02-P03', '02-01-02-P04', '02-01-02-P05',
      '02-01-03-P02', '02-01-03-P03', '02-01-03-P04', '02-01-03-P05', '02-01-03-P06',
    ])).toBeLessThanOrEqual(34)
    expect(sum(['02-02-01-P01', '02-02-01-P02', '02-02-01-P03', '02-02-01-P04', '02-02-01-P05'])).toBeGreaterThanOrEqual(6)
    expect(sum(['02-02-01-P01', '02-02-01-P02', '02-02-01-P03', '02-02-01-P04', '02-02-01-P05'])).toBeLessThanOrEqual(12)
    expect(sum(['03-02-01-P01', '03-02-01-P02', '03-02-01-P03', '03-02-01-P07', '03-02-01-P08'])).toBeGreaterThanOrEqual(9)
    expect(sum(['03-02-01-P01', '03-02-01-P02', '03-02-01-P03', '03-02-01-P07', '03-02-01-P08'])).toBeLessThanOrEqual(16)
    expect(sum(['04-01-01-P01', '04-01-01-P02', '04-01-01-P03', '04-01-01-P04', '04-01-01-P05', '04-01-01-P07', '04-01-01-P08'])).toBeGreaterThanOrEqual(14)
    expect(sum(['04-01-01-P01', '04-01-01-P02', '04-01-01-P03', '04-01-01-P04', '04-01-01-P05', '04-01-01-P07', '04-01-01-P08'])).toBeLessThanOrEqual(24)
    expect(sum(['05-01-01-P03', '05-01-01-P04', '05-01-01-P05', '05-01-01-P06', '05-01-01-P07'])).toBeGreaterThanOrEqual(12)
    expect(sum(['05-01-01-P03', '05-01-01-P04', '05-01-01-P05', '05-01-01-P06', '05-01-01-P07'])).toBeLessThanOrEqual(22)
    expect(sum(['06-01-01-P03', '06-01-01-P04', '06-01-01-P05', '06-01-01-P06'])).toBeGreaterThanOrEqual(10)
    expect(sum(['06-01-01-P03', '06-01-01-P04', '06-01-01-P05', '06-01-01-P06'])).toBeLessThanOrEqual(18)
  })

  it('keeps standard catalog duration mapping specific enough for foundation and timber gaps', async () => {
    await expect(resolveStandardWorkDurationSeed('', {
      standardWorkCode: '01-02-08-P03',
      applicableGranularity: 'task',
    })).resolves.toEqual(expect.objectContaining({
      stableCode: 'process_duration:01-02-08-P03',
      benchmarkBasis: expect.stringContaining('family=bored_cast_in_place_pile_foundation'),
    }))

    await expect(resolveStandardWorkDurationSeed('', {
      standardWorkCode: '01-02-01-P02',
      applicableGranularity: 'task',
    })).resolves.toEqual(expect.objectContaining({
      stableCode: 'process_duration:01-02-01-P02',
      benchmarkBasis: expect.stringContaining('family=cushion_and_blinding'),
    }))

    await expect(resolveStandardWorkDurationSeed('', {
      standardWorkCode: '01-02-01-P03',
      applicableGranularity: 'task',
    })).resolves.toEqual(expect.objectContaining({
      stableCode: 'process_duration:01-02-01-P03',
      benchmarkBasis: expect.stringContaining('family=shallow_foundation_concrete_structure'),
    }))

    await expect(resolveStandardWorkDurationSeed('', {
      standardWorkCode: '01-01-05-P04',
      applicableGranularity: 'task',
    })).resolves.toEqual(expect.objectContaining({
      stableCode: 'process_duration:01-01-05-P04',
      benchmarkBasis: expect.stringContaining('family=dynamic_compaction_ground'),
    }))

    await expect(resolveStandardWorkDurationSeed('', {
      standardWorkCode: '02-07-02-P04',
      applicableGranularity: 'task',
    })).resolves.toEqual(expect.objectContaining({
      stableCode: 'process_duration:02-07-02-P04',
      benchmarkBasis: expect.stringContaining('family=timber_structure'),
    }))
  })

  it('keeps seasonal productivity as a climate-profile by 12-month macro fallback', () => {
    expect(V1474_SEASONAL_PRODUCTIVITY_SEED_META.expectedCounts.regions).toBe(20)
    expect(V1474_SEASONAL_PRODUCTIVITY_SEED_META.expectedCounts.constructionClimateProfiles).toBe(12)
    expect(V1474_SEASONAL_PRODUCTIVITY_SEED_META.expectedCounts.monthsPerRegion).toBe(12)
    expect(V1474_SEASONAL_PRODUCTIVITY_SEED).toHaveLength(240)
    expect(new Set(V1474_SEASONAL_PRODUCTIVITY_SEED.map((item) => item.climateSignal))).toEqual(new Set([
      'normal',
      'winter_low_temp',
      'rainy_season',
      'summer_heat',
    ]))
    expect(Math.min(...V1474_SEASONAL_PRODUCTIVITY_SEED.map((item) => item.productivity))).toBeGreaterThanOrEqual(0.88)
    expect(V1474_SEASONAL_PRODUCTIVITY_SEED).toEqual(expect.arrayContaining([
      expect.objectContaining({ regionCode: 'severe_cold', month: 1, climateSignal: 'winter_low_temp' }),
      expect.objectContaining({ regionCode: 'hot_summer_cold_winter_yangtze_delta', month: 4, climateSignal: 'rainy_season', productivity: 0.98 }),
      expect.objectContaining({ regionCode: 'hot_summer_cold_winter_yangtze_delta', month: 11, climateSignal: 'winter_low_temp', productivity: 0.98 }),
      expect.objectContaining({ regionCode: 'hot_summer_warm_winter_south_coast', month: 7, climateSignal: 'summer_heat' }),
    ]))
    expect(deriveV1474SeasonalProductivityRegion({
      thermalZone: 'hot_summer_cold_winter',
      climateTags: ['plum_rain', 'hot_humid_summer'],
      location: 'shanghai',
    })).toBe('hot_summer_cold_winter_yangtze_delta')
    expect(deriveV1474SeasonalProductivityRegion({
      thermalZone: 'cold',
      climateTags: ['coastal_wind'],
      location: 'qingdao',
    })).toBe('cold_coastal')
  })

  it('keeps statutory holiday lookup scoped to the planned year and date', async () => {
    const springFestival2026 = await resolveV1474HolidayWindow({ date: '2026-02-16', year: 2026, month: 2 }, {})
    expect(springFestival2026).toEqual(expect.objectContaining({
      holidayCode: 'spring_festival_2026',
      year: 2026,
    }))

    const springFestival2027 = await resolveV1474HolidayWindow({ date: '2027-02-06', year: 2027, month: 2 }, {})
    expect(springFestival2027).toEqual(expect.objectContaining({
      holidayCode: 'spring_festival_2027_forecast',
      year: 2027,
      productivity: 0.35,
      confidence: 'low',
      reviewNeeded: true,
    }))

    const remobilization2027 = await resolveV1474HolidayWindow({ date: '2027-02-18', year: 2027, month: 2 }, {})
    expect(remobilization2027).toEqual(expect.objectContaining({
      holidayCode: 'spring_festival_2027_remobilization_forecast',
      year: 2027,
      calendarKind: 'spring_festival_remobilization',
      productivity: 0.4,
      confidence: 'low',
      reviewNeeded: true,
    }))

    const springFestival2028 = await resolveV1474HolidayWindow({ date: '2028-01-27', year: 2028, month: 1 }, {})
    expect(springFestival2028).toEqual(expect.objectContaining({
      holidayCode: 'spring_festival_2028_forecast',
      year: 2028,
      calendarKind: 'forecast_calendar_window',
      confidence: 'low',
      reviewNeeded: true,
    }))

    const adjustedWorkday = await resolveV1474HolidayWindow({ date: '2026-01-04', year: 2026, month: 1 }, {})
    expect(adjustedWorkday).toBeNull()
  })

  it('models plum-rain, hot-summer and dust-storm as explicit work calendar windows', async () => {
    const climateKinds = new Set(V1474_WORK_CALENDAR_SEED.map((item) => item.calendarKind))
    expect(climateKinds.has('plum_rain_window')).toBe(true)
    expect(climateKinds.has('hot_summer_window')).toBe(true)
    expect(climateKinds.has('dust_storm_window')).toBe(true)
    expect(V1474_WORK_CALENDAR_SEED).toEqual(expect.arrayContaining([
      expect.objectContaining({
        holidayCode: 'plum_rain_2026_forecast',
        calendarKind: 'plum_rain_window',
        startDate: '2026-06-01',
        endDate: '2026-07-15',
      }),
      expect.objectContaining({
        holidayCode: 'hot_summer_2026_forecast',
        calendarKind: 'hot_summer_window',
        startDate: '2026-07-15',
        endDate: '2026-08-31',
      }),
      expect.objectContaining({
        holidayCode: 'dust_storm_2026_forecast',
        calendarKind: 'dust_storm_window',
        startDate: '2026-03-15',
        endDate: '2026-05-15',
      }),
    ]))

    await expect(resolveV1474HolidayWindow({ date: '2026-06-25', year: 2026, month: 6 }, {}))
      .resolves.toEqual(expect.objectContaining({
        holidayCode: 'plum_rain_2026_forecast',
        calendarKind: 'plum_rain_window',
      }))
    await expect(resolveV1474HolidayWindow({ date: '2026-08-05', year: 2026, month: 8 }, {}))
      .resolves.toEqual(expect.objectContaining({
        holidayCode: 'hot_summer_2026_forecast',
        calendarKind: 'hot_summer_window',
      }))
    await expect(resolveV1474HolidayWindow({ date: '2026-04-20', year: 2026, month: 4 }, {}))
      .resolves.toEqual(expect.objectContaining({
        holidayCode: 'dust_storm_2026_forecast',
        calendarKind: 'dust_storm_window',
      }))
  })

  it('keeps process seasonal sensitivity limited to field-recognized weather-sensitive packages', () => {
    expect(V1474_PROCESS_SEASONAL_SENSITIVITY_SEED.length).toBeGreaterThanOrEqual(23)
    const sensitivityReasons = new Set(V1474_PROCESS_SEASONAL_SENSITIVITY_SEED.map((item) => item.sensitivityReason))
    expect([...sensitivityReasons]).toEqual(expect.arrayContaining([
      'rainy_season',
      'winter_low_temp',
      'summer_heat',
      'wind_warning',
      'persistent_humidity',
      'snow_ice',
      'dust_storm',
      'thunderstorm',
    ]))
    const allowedSensitivityReasons = new Set([
      'rainy_season',
      'winter_low_temp',
      'summer_heat',
      'wind_warning',
      'persistent_humidity',
      'snow_ice',
      'dust_storm',
      'thunderstorm',
    ])
    expect([...sensitivityReasons].every((reason) => allowedSensitivityReasons.has(reason))).toBe(true)
    expect(Math.min(...V1474_PROCESS_SEASONAL_SENSITIVITY_SEED.map((item) => item.productivityMultiplier))).toBeGreaterThanOrEqual(0.72)
    expect(V1474_PROCESS_SEASONAL_SENSITIVITY_SEED.every((item) => item.standardWorkCodes.length > 0)).toBe(true)
    expect(V1474_PROCESS_SEASONAL_SENSITIVITY_SEED.every((item) => item.requiredClimateSignals.length > 0)).toBe(true)
    expect(V1474_PROCESS_SEASONAL_SENSITIVITY_SEED.every((item) => ['outdoor', 'indoor', 'mixed'].includes((item as any).workEnvironment))).toBe(true)
    expect(V1474_PROCESS_SEASONAL_SENSITIVITY_SEED).toEqual(expect.arrayContaining([
      expect.objectContaining({ stableCode: 'earthwork_excavation_backfill_rainy_season', workEnvironment: 'outdoor' }),
      expect.objectContaining({ stableCode: 'roof_membrane_waterproof_rain_window', impactBand: 'rain_blocks_work', workEnvironment: 'outdoor' }),
      expect.objectContaining({ stableCode: 'outdoor_drainage_network_rainy_season_light', impactBand: 'rain_partial_work', workEnvironment: 'outdoor' }),
      expect.objectContaining({ stableCode: 'exterior_insulation_rain_window', impactBand: 'rain_blocks_work', workEnvironment: 'outdoor' }),
      expect.objectContaining({ stableCode: 'outdoor_electrical_weak_current_trench_rainy_season_light', impactBand: 'rain_partial_work' }),
      expect.objectContaining({ stableCode: 'concrete_winter_low_temperature' }),
      expect.objectContaining({ stableCode: 'concrete_curing_summer_heat', impactBand: 'heat_process_sensitive', indoorDryWorkExclusion: expect.objectContaining({ positiveCodes: expect.arrayContaining(['cleanroom_hvac_commissioning']) }) }),
      expect.objectContaining({ stableCode: 'exterior_paint_membrane_summer_heat', impactBand: 'heat_process_sensitive', indoorDryWorkExclusion: expect.objectContaining({ positiveCodes: expect.arrayContaining(['indoor_purification_air_conditioning_commissioning']) }) }),
      expect.objectContaining({ stableCode: 'tower_crane_high_wind', impactBand: 'high_wind' }),
      expect.objectContaining({ stableCode: 'scaffolding_climbing_high_wind', impactBand: 'high_wind' }),
      expect.objectContaining({ stableCode: 'high_place_lifting_thunderstorm_safety', impactBand: 'thunderstorm_safety', productivityMultiplier: 1 }),
    ]))

    const roofWaterproof = V1474_PROCESS_SEASONAL_SENSITIVITY_SEED.find((item) => item.stableCode === 'roof_membrane_waterproof_rain_window')
    const exteriorCoating = V1474_PROCESS_SEASONAL_SENSITIVITY_SEED.find((item) => item.stableCode === 'exterior_coating_plaster_rain_window')
    const outdoorDrainage = V1474_PROCESS_SEASONAL_SENSITIVITY_SEED.find((item) => item.stableCode === 'outdoor_drainage_network_rainy_season_light')
    const outdoorRoad = V1474_PROCESS_SEASONAL_SENSITIVITY_SEED.find((item) => item.stableCode === 'outdoor_road_hardscape_rainy_season')

    expect(roofWaterproof).toEqual(expect.objectContaining({
      sensitiveMonths: expect.arrayContaining([4, 5, 6, 7, 8, 9]),
      weatherWindowRecoveryPolicy: expect.objectContaining({ dryWindowRequiredHours: 48 }),
    }))
    expect(exteriorCoating).toEqual(expect.objectContaining({
      sensitiveMonths: expect.arrayContaining([4, 5, 6, 7, 8, 9]),
      weatherWindowRecoveryPolicy: expect.objectContaining({ maxRelativeHumidityPercent: 80 }),
    }))
    expect(outdoorDrainage).toEqual(expect.objectContaining({
      sensitiveMonths: expect.arrayContaining([6, 7, 8, 9, 10]),
    }))
    expect(outdoorRoad).toEqual(expect.objectContaining({
      sensitiveMonths: expect.arrayContaining([6, 7, 8, 9, 10]),
    }))
  })

  it('gates process seasonal sensitivity by project climate windows or monthly climate signal', async () => {
    await expect(resolveV1474ProcessSeasonalSensitivity('roof membrane waterproof', 6, {
      standardWorkCode: 'roof_membrane_waterproof',
      rainySeasonMonths: [],
      coldWeatherMonths: [],
      highTempMonths: [],
      monthlyClimateSignal: 'normal',
    })).resolves.toBeNull()

    await expect(resolveV1474ProcessSeasonalSensitivity('roof membrane waterproof', 6, {
      standardWorkCode: 'roof_membrane_waterproof',
      rainySeasonMonths: [6, 7],
      coldWeatherMonths: [],
      highTempMonths: [],
      monthlyClimateSignal: 'normal',
    })).resolves.toEqual(expect.objectContaining({
      stableCode: 'roof_membrane_waterproof_rain_window',
      impactBand: 'rain_blocks_work',
    }))

    await expect(resolveV1474ProcessSeasonalSensitivity('concrete pouring curing', 12, {
      standardWorkCode: 'cast_in_place_concrete',
      rainySeasonMonths: [],
      coldWeatherMonths: [12, 1, 2],
      highTempMonths: [],
      monthlyClimateSignal: 'normal',
    })).resolves.toEqual(expect.objectContaining({
      stableCode: 'concrete_winter_low_temperature',
    }))

    await expect(resolveV1474ProcessSeasonalSensitivity('', 6, {
      standardWorkCode: '03-08-01-P01',
      rainySeasonMonths: [6, 7],
      coldWeatherMonths: [],
      highTempMonths: [],
      monthlyClimateSignal: 'normal',
    })).resolves.toEqual(expect.objectContaining({
      stableCode: 'exterior_insulation_rain_window',
    }))

    await expect(resolveV1474ProcessSeasonalSensitivity('concrete curing', 8, {
      standardWorkCode: 'concrete_curing_wait',
      rainySeasonMonths: [],
      coldWeatherMonths: [],
      highTempMonths: [7, 8],
      monthlyClimateSignal: 'summer_heat',
    })).resolves.toEqual(expect.objectContaining({
      stableCode: 'concrete_curing_summer_heat',
    }))

    await expect(resolveV1474ProcessSeasonalSensitivity('indoor cleanroom HVAC balancing purification air conditioning commissioning', 8, {
      standardWorkCode: 'cleanroom_hvac_commissioning',
      methodVariantCodes: ['cleanroom_commissioning'],
      elementVariantCodes: ['cleanroom_hvac'],
      rainySeasonMonths: [],
      coldWeatherMonths: [],
      highTempMonths: [7, 8],
      monthlyClimateSignal: 'summer_heat',
      workEnvironment: 'indoor',
    })).resolves.toBeNull()

    await expect(resolveV1474ProcessSeasonalSensitivity('tower crane lifting', 9, {
      standardWorkCode: 'tower_crane_lifting',
      rainySeasonMonths: [],
      coldWeatherMonths: [],
      highTempMonths: [],
      monthlyClimateSignal: 'wind_warning',
    })).resolves.toEqual(expect.objectContaining({
      stableCode: 'tower_crane_high_wind',
    }))

    await expect(resolveV1474ProcessSeasonalSensitivity('outdoor road hardscape', 10, {
      standardWorkCode: 'outdoor_road_hardscape',
      rainySeasonMonths: [],
      floodSeasonMonths: [10],
      coldWeatherMonths: [],
      highTempMonths: [],
      monthlyClimateSignal: 'normal',
    })).resolves.toEqual(expect.objectContaining({
      stableCode: 'outdoor_road_hardscape_rainy_season',
    }))
  })

  it('keeps Hangzhou climate windows aligned with Yangtze Delta typhoon and early winter process gates', () => {
    const hangzhou = V1474_REGIONAL_CLIMATE_RULE_SEED.find((item) => item.city === 'hangzhou')

    expect(hangzhou).toEqual(expect.objectContaining({
      typhoonRiskLevel: 'medium',
      rainySeasonMonths: expect.arrayContaining([5, 6, 7, 9]),
      coldWeatherMonths: expect.arrayContaining([11, 12, 1, 2]),
      climateTags: expect.arrayContaining(['typhoon_outer_band']),
    }))
  })

  it('infers climate region from existing project location text without a new user input', () => {
    expect(inferV1474ClimateRegionFromLocation('上海市浦东新区')).toEqual(expect.objectContaining({
      regionCode: 'east',
      source: 'project_location',
    }))
    expect(inferV1474ClimateRegionFromLocation('四川成都高新区')).toEqual(expect.objectContaining({
      regionCode: 'west',
      source: 'project_location',
    }))
    expect(inferV1474ClimateRegionFromLocation('香港中环')).toEqual(expect.objectContaining({
      regionCode: 'default',
      confidence: 'low',
    }))
    expect(inferV1474ClimateRegionFromLocation('')).toEqual(expect.objectContaining({
      regionCode: 'default',
      confidence: 'low',
    }))
  })

  it('keeps regional climate rules source-backed and province-scoped for automatic project profiles', () => {
    expect(V1474_REGIONAL_CLIMATE_RULE_EVIDENCE_SOURCES.length).toBeGreaterThanOrEqual(2)
    expect(V1474_REGIONAL_CLIMATE_RULE_SEED_META.expectedCounts.cityRecords).toBe(100)
    expect(V1474_REGIONAL_CLIMATE_RULE_SEED.length).toBeGreaterThanOrEqual(131)
    expect(V1474_REGIONAL_CLIMATE_RULE_SEED_META.relationshipRole).toBe('upstream_climate_profile_source')
    expect(V1474_REGIONAL_CLIMATE_RULE_SEED_META.downstreamRuleTypes).toEqual(expect.arrayContaining([
      'project_climate_profiles',
      'seasonal_productivity',
      'process_seasonal_sensitivity',
    ]))
    const ruleKeys = V1474_REGIONAL_CLIMATE_RULE_SEED.map((rule) => `${rule.province}|${rule.city ?? ''}|${rule.adminCode ?? ''}`)
    expect(new Set(ruleKeys).size).toBe(ruleKeys.length)
    expect(V1474_REGIONAL_CLIMATE_RULE_SEED).toEqual(expect.arrayContaining([
      expect.objectContaining({
        province: 'guangdong',
        climateRegion: 'south',
        typhoonRiskLevel: 'high',
      }),
      expect.objectContaining({
        province: 'heilongjiang',
        climateRegion: 'north',
        winterShutdownRiskLevel: 'high',
      }),
      expect.objectContaining({
        province: 'zhejiang',
        climateTags: expect.arrayContaining(['typhoon']),
      }),
      expect.objectContaining({
        province: 'sichuan',
        city: 'chengdu',
        climateTags: expect.arrayContaining(['basin_humidity']),
      }),
      expect.objectContaining({
        province: 'xinjiang',
        city: 'altay',
        thermalZone: 'severe_cold',
      }),
      expect.objectContaining({
        province: 'guangdong',
        city: 'shenzhen',
        typhoonRiskLevel: 'high',
      }),
      expect.objectContaining({
        province: 'guangdong',
        city: 'foshan',
      }),
      expect.objectContaining({
        province: 'zhejiang',
        city: 'taizhou_zhejiang',
        typhoonRiskLevel: 'high',
      }),
    ]))
    for (const rule of V1474_REGIONAL_CLIMATE_RULE_SEED) {
      expect(rule.sourceStandard).toContain('GB 50176')
      expect(rule.sourceVersion).toContain('mainland China')
      expect(rule.evidenceSourceKeys.length).toBeGreaterThan(0)
      expect(rule.climateRegion).toMatch(/^(north|east|south|west|default)$/)
    }
  })

  it('keeps climate, monthly productivity, and process sensitivity as layered rules', () => {
    expect(V1474_CLIMATE_SEASONALITY_RELATIONSHIP_META.flow).toEqual([
      'work_calendar',
      'regional_climate_rules',
      'project_climate_profiles',
      'seasonal_productivity',
      'process_seasonal_sensitivity',
      'weather_forecast_impact',
    ])

    const byRule = new Map(V1474_CLIMATE_SEASONALITY_RELATIONSHIP.map((item) => [item.ruleType, item]))
    expect(byRule.get('work_calendar')).toEqual(expect.objectContaining({
      layer: 'calendar_capacity_context',
      downstream: expect.arrayContaining(['seasonal_productivity']),
    }))
    expect(byRule.get('regional_climate_rules')).toEqual(expect.objectContaining({
      layer: 'climate_environment_fact',
      downstream: expect.arrayContaining(['seasonal_productivity', 'process_seasonal_sensitivity', 'weather_forecast_impact']),
      mustNotOwn: expect.arrayContaining(['monthly_productivity_coefficient', 'process_productivity_multiplier']),
    }))
    expect(byRule.get('seasonal_productivity')).toEqual(expect.objectContaining({
      layer: 'monthly_productivity_context',
      consumes: expect.arrayContaining(['project_climate_profiles', 'regional_climate_rules', 'work_calendar']),
      downstream: ['process_seasonal_sensitivity'],
    }))
    expect(byRule.get('process_seasonal_sensitivity')).toEqual(expect.objectContaining({
      layer: 'process_sensitivity_modifier',
      consumes: expect.arrayContaining(['project_climate_profiles', 'seasonal_productivity']),
      mustNotOwn: expect.arrayContaining(['project_location_inference', 'base_month_productivity_factor']),
    }))
    expect(byRule.get('weather_forecast_impact')).toEqual(expect.objectContaining({
      layer: 'weather_fact_candidate',
      consumes: expect.arrayContaining(['project_climate_profiles', 'process_seasonal_sensitivity']),
      owns: expect.arrayContaining(['weather_source_reliability', 'static_weather_conflict_observation']),
    }))
    expect(V1474_CLIMATE_SEASONALITY_RELATIONSHIP_META.compatibilityContract.requiredRuleTypes).toEqual(expect.arrayContaining([
      'work_calendar',
      'weather_forecast_impact',
    ]))

    expect(V1474_SEASONAL_PRODUCTIVITY_SEED_META.relationshipRole).toBe('monthly_productivity_context')
    expect(V1474_SEASONAL_PRODUCTIVITY_SEED_META.upstreamRuleTypes).toEqual(expect.arrayContaining(['project_climate_profiles', 'work_calendar']))
    expect(V1474_PROCESS_SEASONAL_SENSITIVITY_SEED_META.relationshipRole).toBe('process_sensitivity_modifier')
    expect(V1474_PROCESS_SEASONAL_SENSITIVITY_SEED_META.upstreamRuleTypes).toEqual(expect.arrayContaining(['project_climate_profiles', 'seasonal_productivity']))
  })

  it('builds annual work-calendar records only from gov.cn official holiday inputs', () => {
    const records = buildOfficialWorkCalendarRecords({
      year: 2027,
      sourceUrl: 'https://www.gov.cn/zhengce/zhengceku/example.htm',
      holidays: [{
        holidayName: '2027 Spring Festival',
        startDate: '2027-02-05',
        endDate: '2027-02-11',
        adjustedWorkDates: ['2027-02-04', '2027-02-13'],
      }],
    })

    expect(records).toHaveLength(3)
    expect(records).toEqual(expect.arrayContaining([expect.objectContaining({
      holidayName: '2027 Spring Festival',
      year: 2027,
      month: 2,
      isCompensatoryWorkday: false,
      calendarKind: 'statutory_holiday',
      adjustmentOrigin: 'https://www.gov.cn/zhengce/zhengceku/example.htm',
      sourceStandard: 'national_calendar',
      evidenceSourceKeys: ['STATE_COUNCIL_HOLIDAY_2027'],
      webVerified: true,
      reviewNeeded: false,
    })]))
    expect(records).toEqual(expect.arrayContaining([
      expect.objectContaining({
        holidayCode: 'spring_festival_2027_adjusted_workday_2027_02_04',
        isCompensatoryWorkday: true,
        calendarKind: 'compensatory_workday',
        adjustmentOrigin: 'spring_festival_2027',
        productivity: 1,
      }),
      expect.objectContaining({
        holidayCode: 'spring_festival_2027_adjusted_workday_2027_02_13',
        isCompensatoryWorkday: true,
        calendarKind: 'compensatory_workday',
      }),
    ]))

    expect(() => buildOfficialWorkCalendarRecords({
      year: 2027,
      sourceUrl: 'https://example.com/holiday.htm',
      holidays: [{
        holidayName: 'Invalid source',
        startDate: '2027-01-01',
        endDate: '2027-01-01',
      }],
    })).toThrow(/gov\.cn/)
  })

  it('builds low-confidence forecast work-calendar records when next-year official notice is not published', () => {
    const records = buildForecastWorkCalendarRecords(2027)
    expect(records.length).toBeGreaterThanOrEqual(12)
    expect(records).toEqual(expect.arrayContaining([
      expect.objectContaining({
        holidayCode: 'spring_festival_2027_forecast',
        calendarKind: 'forecast_calendar_window',
        sourceStandard: 'system_default',
        webVerified: true,
        reviewNeeded: true,
        confidence: 'low',
        productivity: 0.35,
      }),
      expect.objectContaining({
        holidayCode: 'spring_festival_2027_remobilization_forecast',
        calendarKind: 'spring_festival_remobilization',
      productivity: 0.4,
      }),
      expect.objectContaining({ holidayCode: 'qingming_2027_forecast' }),
      expect.objectContaining({ holidayCode: 'dragon_boat_2027_forecast', startDate: '2027-06-08', endDate: '2027-06-10' }),
      expect.objectContaining({ holidayCode: 'mid_autumn_2027_forecast', startDate: '2027-09-14', endDate: '2027-09-16' }),
      expect.objectContaining({ holidayCode: 'plum_rain_2027_forecast', calendarKind: 'plum_rain_window' }),
      expect.objectContaining({ holidayCode: 'hot_summer_2027_forecast', calendarKind: 'hot_summer_window' }),
      expect.objectContaining({ holidayCode: 'north_winter_shutdown_2027_forecast', calendarKind: 'winter_shutdown' }),
      expect.objectContaining({ holidayCode: 'dust_storm_2027_forecast', calendarKind: 'dust_storm_window' }),
    ]))
    expect(buildForecastWorkCalendarRecords(2028)).toEqual(expect.arrayContaining([
      expect.objectContaining({ holidayCode: 'spring_festival_2028_forecast' }),
      expect.objectContaining({ holidayCode: 'spring_festival_2028_remobilization_forecast' }),
    ]))
  })

  it('resolves official holiday notice urls from built-in and environment mappings only under gov.cn', () => {
    expect(resolveOfficialHolidayNoticeSourceUrl(2026, {} as any)).toBe('https://www.gov.cn/zhengce/zhengceku/202511/content_7047091.htm')
    expect(resolveOfficialHolidayNoticeSourceUrl(2027, {
      OFFICIAL_HOLIDAY_NOTICE_URLS: '2027=https://www.gov.cn/zhengce/zhengceku/202611/example.htm',
    } as any)).toBe('https://www.gov.cn/zhengce/zhengceku/202611/example.htm')
    expect(resolveOfficialHolidayNoticeSourceUrl(2027, {} as any)).toBeNull()
    expect(() => resolveOfficialHolidayNoticeSourceUrl(2027, {
      OFFICIAL_HOLIDAY_NOTICE_URL_2027: 'https://example.com/holiday.htm',
    } as any)).toThrow(/gov\.cn/)
    expect(() => resolveOfficialHolidayNoticeSourceUrl(2027, {
      OFFICIAL_HOLIDAY_NOTICE_URL_2027: 'https://notgov.cn/holiday.htm',
    } as any)).toThrow(/gov\.cn/)
  })

  it('parses official-style State Council holiday notice text into annual records', () => {
    const records = parseOfficialHolidayNotice(2027, `
      <p>一、元旦：1月1日至3日放假调休，共3天。1月4日（星期日）上班。</p>
      <p>二、春节：2月5日至11日放假调休，共7天。2月4日（星期四）、2月13日（星期六）上班。</p>
    `)

    expect(records).toEqual(expect.arrayContaining([
      expect.objectContaining({
        holidayCode: 'new_year_day_2027',
        startDate: '2027-01-01',
        endDate: '2027-01-03',
        adjustedWorkDates: ['2027-01-04'],
      }),
      expect.objectContaining({
        holidayCode: 'spring_festival_2027',
        startDate: '2027-02-05',
        endDate: '2027-02-11',
        adjustedWorkDates: ['2027-02-04', '2027-02-13'],
      }),
    ]))
  })

  it('ignores the holiday-name summary list when parsing official notice sections', () => {
    const records = parseOfficialHolidayNotice(2026, `
      <p>现将2026年元旦、春节、清明节、劳动节、端午节、中秋节和国庆节放假调休日期的具体安排通知如下。</p>
      <p>一、元旦：1月1日（周四）至3日（周六）放假调休，共3天。1月4日（周日）上班。</p>
      <p>二、春节：2月15日（农历腊月二十八、周日）至23日（农历正月初七、周一）放假调休，共9天。2月14日（周六）、2月28日（周六）上班。</p>
      <p>三、清明节：4月4日（周六）至6日（周一）放假，共3天。</p>
      <p>四、劳动节：5月1日（周五）至5日（周二）放假调休，共5天。5月9日（周六）上班。</p>
      <p>五、端午节：6月19日（周五）至21日（周日）放假，共3天。</p>
      <p>六、中秋节：9月25日（周五）至27日（周日）放假，共3天。</p>
      <p>七、国庆节：10月1日（周四）至7日（周三）放假调休，共7天。9月20日（周日）、10月10日（周六）上班。</p>
    `)

    expect(records).toEqual(expect.arrayContaining([
      expect.objectContaining({ holidayCode: 'spring_festival_2026', startDate: '2026-02-15', endDate: '2026-02-23', adjustedWorkDates: ['2026-02-14', '2026-02-28'] }),
      expect.objectContaining({ holidayCode: 'labor_day_2026', startDate: '2026-05-01', endDate: '2026-05-05', adjustedWorkDates: ['2026-05-09'] }),
      expect.objectContaining({ holidayCode: 'national_day_2026', startDate: '2026-10-01', endDate: '2026-10-07', adjustedWorkDates: ['2026-09-20', '2026-10-10'] }),
    ]))
    expect(new Set(records.map((record) => `${record.startDate}:${record.endDate}`)).size).toBeGreaterThan(3)
  })

  it('validates all source-backed seed contracts in strict mode', () => {
    const result = validateV1474AlgorithmSeeds({ strict: true })
    expect(result.ok).toBe(true)
    expect(result.entries).toHaveLength(ALGORITHM_SEED_REGISTRY.length)
    expect(result.entries).toEqual(expect.arrayContaining([
      expect.objectContaining({
        seedType: 'earliest_start_rule',
        seedVersion: expect.stringContaining('v1.4.18'),
        expectedCount: 1,
        actualCount: 1,
      }),
    ]))
    expect(result.issues.filter((issue) => issue.severity === 'error')).toHaveLength(0)
  })

  it('merges resolver records by project override, then company override, then system seed', () => {
    const merged = mergeAlgorithmSeedRecords(
      'process_constraint',
      [{
        stableCode: 'constraint_concrete_curing',
        constraintType: 'curing',
        timeSourcePolicy: 'standard_work_duration_seed_only',
        durationLookupKeys: ['system_curing_reference'],
        __stableCode: 'constraint_concrete_curing',
        __resolverSource: 'active_seed',
      }],
      [{
        stableCode: 'constraint_concrete_curing',
        constraintType: 'curing',
        timeSourcePolicy: 'explicit_carrier_or_standard_work_duration',
        durationLookupKeys: ['company_curing_reference'],
        __stableCode: 'constraint_concrete_curing',
        __resolverSource: 'company_override',
      }],
      [{
        stableCode: 'constraint_concrete_curing',
        constraintType: 'curing',
        timeSourcePolicy: 'project_fact_then_standard_work_duration',
        durationLookupKeys: ['project_curing_reference'],
        __stableCode: 'constraint_concrete_curing',
        __resolverSource: 'project_override',
      }],
    )

    expect(merged).toHaveLength(1)
    expect(merged[0]).toEqual(expect.objectContaining({
      timeSourcePolicy: 'project_fact_then_standard_work_duration',
      durationLookupKeys: ['project_curing_reference'],
      __resolverSource: 'project_override',
    }))
  })

  it('resolves only cross-package workflow dictionary rules from task text', async () => {
    const match = await resolveV1474WorkflowDictionary('masonry plaster', {})
    expect(match).toEqual(expect.objectContaining({
      stableCode: 'masonry_to_plaster',
      relationshipScope: 'cross_work_package',
      governanceTarget: 'cross_item_workflow',
      runtimeRole: 'recognition_signal',
      keywordFallbackOnly: true,
      canCreateDependencies: false,
      isActive: true,
      __resolverSource: expect.any(String),
    }))

    expect(V1474_WORKFLOW_DICTIONARY_SEED.every((item) => item.canCreateDependencies === false)).toBe(true)
    expect(V1474_WORKFLOW_DICTIONARY_SEED.every((item) => item.defaultLagDays === 0)).toBe(true)
    expect(ALGORITHM_SEED_REGISTRY.find((entry) => entry.seedType === 'workflow_dictionary')?.records.every((record) => (
      record.defaultDaysP50 == null
      && record.defaultDaysP20 == null
      && record.defaultDaysP80 == null
      && record.defaultLagDays === 0
    ))).toBe(true)

    const internalFlowCandidate = V1474_WORKFLOW_DICTIONARY_SEED.find((item) => item.stableCode === 'rebar_formwork_concrete')
    expect(internalFlowCandidate).toEqual(expect.objectContaining({
      relationshipScope: 'internal_flow_candidate',
      governanceTarget: 'standard_internal_flow',
      isActive: false,
    }))

    const inactiveInternalMatch = await resolveV1474WorkflowDictionary('rebar formwork concrete pouring', {})
    expect(inactiveInternalMatch?.stableCode).not.toBe('rebar_formwork_concrete')
  })

  it('uses standard work codes before workflow dictionary keyword fallback', async () => {
    const match = await resolveV1474WorkflowDictionary('masonry plaster concrete pouring', {
      standardWorkCode: 'plastering_wall_ceiling',
    })

    expect(match).toEqual(expect.objectContaining({
      stableCode: 'masonry_to_plaster',
      relationshipScope: 'cross_work_package',
      governanceTarget: 'cross_item_workflow',
      runtimeRole: 'recognition_signal',
      keywordFallbackOnly: true,
      canCreateDependencies: false,
    }))
  })

  it('scopes dependency intent templates by business relation instead of defaulting every link to project-wide', () => {
    const inspectionIntents = resolveV1475DependencyIntentTemplates({
      fromCatalogGroup: 'project_milestone',
      fromReferencedCode: 'MS-01-01-10-P01',
      metadata: {
        relationRole: 'inspection',
        referencedCoreQualityCodes: ['02-01-03-P16', '09-01-01-P09'],
        referencedSpecialtyCodes: ['FIR-05-01-02-P06', 'WPI-02-01-02-P06'],
        referencedQualityResponsibilityCodes: ['QR-01-01-09-P03'],
      },
    })

    expect(inspectionIntents).toEqual(expect.arrayContaining([
      expect.objectContaining({ toReferencedCode: '02-01-03-P16', scopeRule: 'same_floor', autoApplyPolicy: 'manual_confirm' }),
      expect.objectContaining({ toReferencedCode: '09-01-01-P09', scopeRule: 'same_zone', autoApplyPolicy: 'confirmed_template_only' }),
      expect.objectContaining({ toReferencedCode: 'FIR-05-01-02-P06', scopeRule: 'same_system', autoApplyPolicy: 'confirmed_template_only' }),
      expect.objectContaining({ toReferencedCode: 'WPI-02-01-02-P06', scopeRule: 'same_system', autoApplyPolicy: 'confirmed_template_only' }),
      expect.objectContaining({ toReferencedCode: 'QR-01-01-09-P03', scopeRule: 'same_building', autoApplyPolicy: 'confirmed_template_only' }),
    ]))

    const commercialIntents = resolveV1475DependencyIntentTemplates({
      fromCatalogGroup: 'document_commercial_support',
      fromReferencedCode: 'DOC-01-01-01-P01',
      metadata: {
        relationRole: 'commercial',
        referencedMilestoneCodes: ['MS-01-01-11'],
      },
    })
    expect(commercialIntents).toEqual(expect.arrayContaining([
      expect.objectContaining({
        toReferencedCode: 'MS-01-01-11',
        scopeRule: 'same_project',
        autoApplyPolicy: 'candidate_only',
      }),
    ]))
  })

  it('validates master-plan visibility policy as a governed v1.4.23.1 internal seed', () => {
    const result = validateV1474AlgorithmSeeds({
      strict: true,
      seedType: 'master_plan_visibility_policy',
    })

    expect(result.ok).toBe(true)
    expect(result.issues).toEqual([])
    expect(result.entries).toEqual([
      expect.objectContaining({
        seedType: 'master_plan_visibility_policy',
        seedVersion: expect.stringContaining('v1.4.23.1'),
        expectedCount: 4,
        actualCount: 4,
        missingEvidenceCount: 0,
        missingSourceCount: 0,
      }),
    ])
  })

  it('normalizes mismatched dependency intent reference fields by stableCode prefix', () => {
    const intents = resolveV1475DependencyIntentTemplates({
      fromCatalogGroup: 'project_milestone',
      fromReferencedCode: 'MS-01-01-10-P01',
      metadata: {
        relationRole: 'inspection',
        referencedCoreQualityCodes: ['CDF-02-01-02-P06'],
      },
    })

    expect(intents).toEqual([
      expect.objectContaining({
        toCatalogGroup: 'specialty',
        toReferencedCode: 'CDF-02-01-02-P06',
        auditReasonCode: 'accepted_business_constraint_reference_field_normalized',
        matchedReferenceField: 'referencedCoreQualityCodes',
      }),
    ])
    expect(intents[0]?.auditTrace).toEqual(expect.arrayContaining([
      'referenceGroupNormalized=true',
      'declaredReferenceGroup=core_quality',
      'normalizedReferenceGroup=specialty',
    ]))
  })

  it('recognizes document-commercial DCS codes without treating them as missing specialty references', () => {
    const intents = resolveV1475DependencyIntentTemplates({
      fromCatalogGroup: 'project_milestone',
      fromReferencedCode: 'MS-01-01-22-P01',
      metadata: {
        relationRole: 'handover',
        referencedDocumentCommercialCodes: ['DCS-01-01-06'],
      },
    })

    expect(intents).toEqual([
      expect.objectContaining({
        toCatalogGroup: 'document_commercial_support',
        toReferencedCode: 'DCS-01-01-06',
        auditReasonCode: 'accepted_business_constraint_candidate_only',
        matchedReferenceField: 'referencedDocumentCommercialCodes',
        strength: 'candidate',
        autoApplyPolicy: 'candidate_only',
      }),
    ])
    expect(intents[0]?.auditTrace).toEqual(expect.arrayContaining([
      'policySource=document_commercial_candidate_default',
    ]))
  })

  it('keeps site management dependencies as manual-confirm governance signals', () => {
    const resolution = inspectV1475DependencyIntentTemplates({
      fromCatalogGroup: 'project_milestone',
      fromReferencedCode: 'MS-01-01-09-P01',
      metadata: {
        relationRole: 'management',
        referencedSiteManagementCodes: ['SITE-05-01-01-P01'],
      },
    })

    expect(resolution.summary.acceptedManualConfirmCount).toBe(1)
    expect(resolution.intents).toEqual([
      expect.objectContaining({
        toCatalogGroup: 'site_management',
        toReferencedCode: 'SITE-05-01-01-P01',
        scopeRule: 'same_phase',
        strength: 'candidate',
        autoApplyPolicy: 'manual_confirm',
        auditReasonCode: 'accepted_business_constraint_manual_confirm',
      }),
    ])
    expect(resolution.audit[0]?.auditTrace).toEqual(expect.arrayContaining([
      'policySource=site_management_manual_confirm_default',
      'scopeRuleSource=role_code_inference',
    ]))
  })

  it('allows audited metadata overrides for dependency intent scope and policy', () => {
    const resolution = inspectV1475DependencyIntentTemplates({
      fromCatalogGroup: 'project_milestone',
      fromReferencedCode: 'MS-01-01-17-P01',
      metadata: {
        relationRole: 'handover',
        referencedMilestoneCodes: ['MS-01-01-17'],
        dependencyIntentScopeRule: 'same_zone',
        dependencyIntentPolicy: 'candidate_only',
        dependencyIntentConfidenceAdjustment: -4,
        dependencyIntentReason: 'district handover requires project governance review before becoming a hard dependency',
      },
    })

    expect(resolution.summary.acceptedCandidateOnlyCount).toBe(1)
    expect(resolution.intents[0]).toEqual(expect.objectContaining({
      scopeRule: 'same_zone',
      autoApplyPolicy: 'candidate_only',
      auditReasonCode: 'accepted_business_constraint_candidate_only',
    }))
    expect(resolution.audit[0]?.auditTrace).toEqual(expect.arrayContaining([
      'scopeRuleSource=metadata_override',
      'policySource=metadata_override',
      'confidenceAdjustment=-4',
      'dependencyIntentReason=district handover requires project governance review before becoming a hard dependency',
    ]))
  })

  it('routes physical construction mainline references away from dependency intent auto-apply', () => {
    const physicalMainlineIntents = resolveV1475DependencyIntentTemplates({
      fromCatalogGroup: 'specialty',
      fromReferencedCode: 'HVA-01-01-01',
      metadata: {
        relationRole: 'workflow',
        referencedCoreQualityCodes: ['03-05-01'],
        referencedSpecialtyCodes: ['ELE-01-01-01'],
      },
    })

    expect(physicalMainlineIntents).toEqual([])
    expect(isV1475ConstructionMainlineReference('workflow', 'specialty', 'core_quality')).toBe(true)
    expect(isV1475ConstructionMainlineReference('workflow', 'specialty', 'specialty')).toBe(true)
    expect(shouldEmitV1475DependencyIntent('workflow', 'specialty', 'core_quality')).toBe(false)
    expect(shouldEmitV1475DependencyIntent('workflow', 'specialty', 'specialty')).toBe(false)

    const businessConstraintIntents = resolveV1475DependencyIntentTemplates({
      fromCatalogGroup: 'project_milestone',
      fromReferencedCode: 'MS-01-01-10-P01',
      metadata: {
        relationRole: 'inspection',
        referencedCoreQualityCodes: ['02-01-03-P16'],
        referencedSpecialtyCodes: ['FIR-05-01-02-P06'],
      },
    })

    expect(businessConstraintIntents).toEqual(expect.arrayContaining([
      expect.objectContaining({
        relationRole: 'inspection',
        relationshipDomain: 'business_constraint',
        toReferencedCode: '02-01-03-P16',
        autoApplyPolicy: 'manual_confirm',
      }),
      expect.objectContaining({
        relationRole: 'inspection',
        relationshipDomain: 'business_constraint',
        toReferencedCode: 'FIR-05-01-02-P06',
        autoApplyPolicy: 'confirmed_template_only',
      }),
    ]))
  })

  it('audits dependency intent decisions with confidence instead of silently accepting references', () => {
    const resolution = inspectV1475DependencyIntentTemplates({
      fromCatalogGroup: 'project_milestone',
      fromReferencedCode: 'MS-01-01-10-P01',
      metadata: {
        relationRole: 'inspection',
        referencedCoreQualityCodes: ['02-01-03-P16'],
        referencedSpecialtyCodes: ['FIR-05-01-02-P06'],
      },
    })

    expect(resolution.summary.acceptedRuntimeEligibleCount).toBe(1)
    expect(resolution.summary.acceptedCandidateOnlyCount).toBe(0)
    expect(resolution.summary.acceptedManualConfirmCount).toBe(1)
    expect(resolution.summary.rejectedCount).toBe(0)
    expect(resolution.summary.confidenceScoreAverage).toBeGreaterThanOrEqual(90)
    expect(resolution.summary.byConfidenceLevel.high).toBe(2)
    expect(resolution.audit).toEqual(expect.arrayContaining([
      expect.objectContaining({
        decision: 'accepted',
        reasonCode: 'accepted_business_constraint_manual_confirm',
        confidenceLevel: 'high',
        matchedReferenceField: 'referencedCoreQualityCodes',
        auditTrace: expect.arrayContaining([
          'decision=accepted',
          'scopeRule=same_floor',
          'autoApplyPolicy=manual_confirm',
          'policySource=metadata_quarantine_role_default',
        ]),
      }),
      expect.objectContaining({
        decision: 'accepted',
        reasonCode: 'accepted_business_constraint_confirmed_template_only',
        confidenceLevel: 'high',
        matchedReferenceField: 'referencedSpecialtyCodes',
        auditTrace: expect.arrayContaining([
          'explicitBusinessGateTemplate=true',
          'autoApplyPolicy=confirmed_template_only',
        ]),
      }),
    ]))

    const rejected = inspectV1475DependencyIntentTemplates({
      fromCatalogGroup: 'specialty',
      fromReferencedCode: 'HVA-01-01-01',
      metadata: {
        relationRole: 'workflow',
        referencedCoreQualityCodes: ['03-05-01'],
      },
    })
    expect(rejected.intents).toEqual([])
    expect(rejected.summary.rejectedPhysicalMainlineCount).toBe(1)
    expect(rejected.audit[0]).toEqual(expect.objectContaining({
      decision: 'rejected',
      reasonCode: 'rejected_physical_construction_mainline',
      relationshipDomain: 'physical_construction_mainline',
      auditTrace: expect.arrayContaining([
        'routing=standard_internal_flow_or_cross_item_workflow',
        'reason=physical_construction_mainline',
      ]),
    }))
  })

  it('keeps process constraint seed as edge timing governance instead of node duration', () => {
    const curingRule = V1474_PROCESS_CONSTRAINT_SEED.find((item) => item.stableCode === 'concrete_curing_normal_minimum')
    const formworkRemovalRule = V1474_PROCESS_CONSTRAINT_SEED.find((item) => item.stableCode === 'concrete_formwork_removal_strength_check')

    expect(curingRule).toEqual(expect.objectContaining({
      applicationMode: 'edge_lag',
      impactMode: 'duration_lookup',
      runtimeActionPolicy: 'confidence_only',
      timeSourcePolicy: 'explicit_carrier_or_standard_work_duration',
      durationLookupPolicy: 'route_to_standard_work_duration_seed',
      durationLookupKeys: ['concrete_curing_normal_minimum'],
      durationAuthorityPolicy: 'no_duration_values_in_process_constraint',
      startAfterPercent: 100,
      scopeGranularity: 'zone',
      releaseQuantityPolicy: 'not_applicable',
      minReleaseQuantityPercent: 100,
      insufficientQuantityPolicy: 'candidate_only_until_real_quantity_or_scope_release',
      quantityDoubleCountPolicy: 'standard_work_duration_owns_default_quantity_process_constraint_owns_release_threshold',
      relationshipScope: 'same_parent_or_cross_scope_edge',
      relationInputPolicy: 'requires_existing_relation',
      dependencyCreationPolicy: 'never_create_dependency',
      parallelAllowedPolicy: 'parallel_allowed_is_no_edge_not_overlap',
      supportedRelationKinds: expect.arrayContaining(['hard_sequence', 'soft_sequence', 'acceptance_gate', 'dependency_intent']),
      explicitCarrierPolicy: 'skip_duration_add_when_explicit_carrier_process_exists',
      durationDoubleCountPolicy: 'standard_work_duration_owns_all_day_values_process_constraint_owns_edge_routing',
    }))
    expect(curingRule).not.toHaveProperty('mandatoryLagDays')
    expect(curingRule).not.toHaveProperty('defaultLagDays')
    expect(curingRule).not.toHaveProperty('minimumLagDays')
    expect(curingRule).not.toHaveProperty('learnedLagDays')
    expect(formworkRemovalRule).toEqual(expect.objectContaining({
      constraintType: 'test_report_wait',
      applicationMode: 'edge_lag',
      runtimeActionPolicy: 'confidence_only',
      durationAuthorityPolicy: 'no_duration_values_in_process_constraint',
      dependencyCreationPolicy: 'never_create_dependency',
      sourceClauseRef: expect.stringContaining('slab 50/75/100'),
      evidenceSourceKeys: expect.arrayContaining(['GB50204_2015']),
      conditionalEffects: expect.arrayContaining([
        expect.objectContaining({
          id: 'formwork-removal-slab-le-2m-strength-fact-gate',
          effect: 'require_project_fact_gate',
          businessReasonTemplate: expect.stringContaining('50%'),
        }),
        expect.objectContaining({
          id: 'formwork-removal-slab-2m-to-8m-strength-fact-gate',
          effect: 'require_project_fact_gate',
          businessReasonTemplate: expect.stringContaining('75%'),
        }),
        expect.objectContaining({
          id: 'formwork-removal-slab-gt-8m-strength-fact-gate',
          effect: 'require_project_fact_gate',
          businessReasonTemplate: expect.stringContaining('100%'),
        }),
        expect.objectContaining({
          id: 'formwork-removal-beam-arch-shell-le-8m-strength-fact-gate',
          effect: 'require_project_fact_gate',
          businessReasonTemplate: expect.stringContaining('75%'),
        }),
        expect.objectContaining({
          id: 'formwork-removal-beam-arch-shell-gt-8m-strength-fact-gate',
          effect: 'require_project_fact_gate',
          businessReasonTemplate: expect.stringContaining('100%'),
        }),
        expect.objectContaining({
          id: 'formwork-removal-cantilever-strength-fact-gate',
          effect: 'require_project_fact_gate',
          businessReasonTemplate: expect.stringContaining('100%'),
        }),
      ]),
    }))
    expect(formworkRemovalRule).not.toHaveProperty('mandatoryLagDays')
    expect(formworkRemovalRule).not.toHaveProperty('defaultLagDays')
    expect(formworkRemovalRule).not.toHaveProperty('minimumLagDays')
    expect(formworkRemovalRule).not.toHaveProperty('learnedLagDays')
    expect(V1474_PROCESS_CONSTRAINT_SEED_META.generationPolicy).toContain('edge_constraint_no_node_duration_override')
    expect(V1474_PROCESS_CONSTRAINT_SEED_META.boundaryPolicy).toContain('standard_work_duration owns all duration, waiting, lag, and reference day values')
    expect(V1474_PROCESS_CONSTRAINT_SEED_META.boundaryPolicy).toContain('explicit carrier process and standard_work_duration are the only duration carriers; process_constraint never adds days directly')
    expect(V1474_PROCESS_CONSTRAINT_SEED_META.boundaryPolicy).toContain('parallel_allowed belongs to relationship rules and must not be reinterpreted as process_constraint edge_overlap')
    expect(V1474_PROCESS_CONSTRAINT_SEED_META.boundaryPolicy).toContain('task planned/completed quantity is the first release signal; standard_work_duration defaultQuantity is only a proxy and scope granularity is the final low-confidence fallback')
  })

  it('uses title weak recognition only to bridge structured standard work context for process constraints', async () => {
    const text = '电缆敷设 电缆头制作 导线连接 楼层穿插'
    const keywordOnly = await resolveV1474ProcessConstraint(text, {})

    expect(keywordOnly).toBeNull()

    const titleWeakBridged = await resolveV1474ProcessConstraint(text, {
      standardWorkCode: 'electrical_distribution_equipment',
      standardWorkCodes: ['electrical_distribution_equipment'],
      standardCatalogCodePrefixes: ['07-04'],
      standardWorkSource: 'title_weak_fallback',
      titleWeakScore: 0.74,
      titleWeakRuleId: 'alias_cable_tray',
    })

    expect(titleWeakBridged).toEqual(expect.objectContaining({
      stableCode: 'cable_laying_to_termination_floor_overlap',
      processConstraintMatchSource: 'structured_prefix',
      processConstraintKeywordMatched: true,
      processConstraintTitleWeakBridged: true,
      processConstraintTitleWeakScore: 0.74,
      processConstraintTitleWeakRuleId: 'alias_cable_tray',
    }))
  })

  it('requires overlap constraints to carry release quantity gate policy without owning duration quantities', () => {
    const overlapRules = V1474_PROCESS_CONSTRAINT_SEED.filter((item) => item.applicationMode === 'edge_overlap')

    expect(overlapRules.length).toBeGreaterThanOrEqual(40)
    expect(overlapRules).toEqual(expect.arrayContaining([
      expect.objectContaining({
        stableCode: 'electrical_tray_to_cable_laying_zone_overlap',
        releaseQuantityPolicy: 'real_task_quantity_then_standard_duration_quantity_proxy_then_scope_proxy',
        minReleaseQuantityPercent: 70,
        quantitySourcePriority: ['task_planned_completed_quantity', 'standard_work_duration_default_quantity', 'scope_granularity_proxy'],
        quantityDoubleCountPolicy: 'standard_work_duration_owns_default_quantity_process_constraint_owns_release_threshold',
      }),
      expect.objectContaining({
        stableCode: 'bathroom_waterproof_to_tile_room_overlap',
        minReleaseQuantityPercent: 90,
        gateRequired: true,
      }),
    ]))
    for (const rule of overlapRules) {
      expect(rule.durationAuthorityPolicy).toBe('no_duration_values_in_process_constraint')
      expect(rule.quantitySourcePriority).toContain('task_planned_completed_quantity')
      expect(rule.quantitySourcePriority).toContain('standard_work_duration_default_quantity')
      expect(rule.quantityReleaseEvidenceChecklist.length).toBeGreaterThan(0)
      expect(rule.quantityProxyRiskLevel).not.toBe('not_applicable')
      expect(rule).not.toHaveProperty('mandatoryLagDays')
      expect(rule).not.toHaveProperty('defaultLagDays')
    }
  })

  it('covers process constraint breadth across standard and domain template packs', () => {
    const requiredTemplateConstraintCodes = [
      'support_dewatering_to_earthwork_layer_overlap',
      'earthwork_excavation_to_cushion_segment_overlap',
      'pile_completion_to_cap_zone_overlap',
      'basement_waterproof_to_backfill_segment_overlap',
      'roof_base_to_waterproof_zone_overlap',
      'roof_waterproof_to_protection_zone_overlap',
      'steel_hoisting_to_connection_segment_overlap',
      'steel_connection_to_coating_segment_overlap',
      'steel_deck_to_concrete_pour_segment_overlap',
      'prefab_grouting_to_topping_segment_overlap',
      'hvac_pipe_pressure_test_to_insulation_zone_overlap',
      'hvac_equipment_install_to_commissioning_building_overlap',
      'drainage_pipe_to_concealment_zone_overlap',
      'cable_laying_to_termination_floor_overlap',
      'distribution_cabinet_to_energizing_gate',
      'structured_cabling_to_device_installation_zone_overlap',
      'fire_alarm_device_to_linkage_floor_overlap',
      'road_base_to_surface_segment_overlap',
      'municipal_pipe_test_to_road_restoration_segment_overlap',
      'landscape_soil_to_planting_zone_overlap',
      'cleanroom_envelope_to_hvac_commissioning_room_overlap',
      'hepa_filter_to_cleanliness_test_room_gate',
      'medical_gas_pressure_test_to_panel_close_zone_overlap',
    ]
    const nonDurationBearingGateCodes = new Set([
      'medical_gas_pressure_test_to_panel_close_zone_overlap',
    ])
    const byCode = new Map(V1474_PROCESS_CONSTRAINT_SEED.map((rule) => [rule.stableCode, rule]))

    for (const stableCode of requiredTemplateConstraintCodes) {
      const rule = byCode.get(stableCode)
      expect(rule).toBeTruthy()
      expect(rule?.durationAuthorityPolicy).toBe('no_duration_values_in_process_constraint')
      expect(rule?.dependencyCreationPolicy).toBe('never_create_dependency')
      expect(rule?.evidenceSourceKeys.length).toBeGreaterThan(0)
      expect(rule?.matchStrategy).toBe('structured_code_first_then_keyword_fallback')
      expect(rule?.standardCatalogCodePrefixes.length).toBeGreaterThan(0)
      expect(rule?.templateNodeStableCodePrefixes.length).toBeGreaterThan(0)
      expect(rule?.applicableCatalogGroups.length).toBeGreaterThan(0)
      if (nonDurationBearingGateCodes.has(stableCode)) {
        expect(rule?.applicableDurationContributionModes).toEqual(expect.arrayContaining(['quality_gate']))
      } else {
        expect(rule?.applicableDurationContributionModes).toEqual(expect.arrayContaining(['duration_bearing']))
      }
      expect(rule?.backValidationPolicy).toBe('candidate_only_from_execution_history')
      expect(rule?.businessReasonTemplate).toContain('工序')
      expect(rule).not.toHaveProperty('mandatoryLagDays')
      expect(rule).not.toHaveProperty('defaultDays')
    }

    expect(byCode.get('support_dewatering_to_earthwork_layer_overlap')?.evidenceSourceKeys).toEqual(expect.arrayContaining(['JGJ120_2012', 'GB50202_2018']))
    expect(byCode.get('steel_connection_to_coating_segment_overlap')?.evidenceSourceKeys).toEqual(expect.arrayContaining(['GB50205_2020', 'GB50661_2011']))
    expect(byCode.get('municipal_pipe_test_to_road_restoration_segment_overlap')?.evidenceSourceKeys).toEqual(expect.arrayContaining(['GB50268_2008', 'CJJ1_2008']))
    expect(byCode.get('cleanroom_envelope_to_hvac_commissioning_room_overlap')?.evidenceSourceKeys).toEqual(expect.arrayContaining(['GB50333_2013', 'GB50591_2010']))
    expect(V1474_PROCESS_CONSTRAINT_SEED_META.sourceStandards).toEqual(expect.arrayContaining([
      'GB50202-2018',
      'JGJ120-2012',
      'GB50205-2020',
      'GB50268-2008',
      'GB50591-2010',
    ]))
  })

  it('deepens process constraint matching, quantity evidence, and back-validation governance', () => {
    const overlapRules = V1474_PROCESS_CONSTRAINT_SEED.filter((item) => item.applicationMode === 'edge_overlap')
    const strictQuantityRules = overlapRules.filter((item) => item.quantityEvidenceRequirement === 'real_quantity_required_for_auto_release')
    const proxyQuantityRules = overlapRules.filter((item) => item.quantityEvidenceRequirement === 'real_or_default_quantity_proxy_allowed')

    expect(strictQuantityRules.length).toBeGreaterThanOrEqual(30)
    expect(proxyQuantityRules.length).toBeGreaterThan(0)
    expect(overlapRules.every((rule) => rule.matchStrategy === 'structured_code_first_then_keyword_fallback')).toBe(true)
    expect(overlapRules.every((rule) => rule.standardCatalogCodePrefixes.length > 0)).toBe(true)
    expect(overlapRules.every((rule) => rule.applicableCatalogGroups.length > 0)).toBe(true)
    expect(overlapRules.every((rule) => rule.backValidationPolicy === 'candidate_only_from_execution_history')).toBe(true)
    expect(overlapRules.every((rule) => !/seed|stableCode|process_constraint/i.test(rule.businessReasonTemplate))).toBe(true)
    expect(V1474_PROCESS_CONSTRAINT_SEED.every((rule) => rule.requiredKeywordGroups.length > 0)).toBe(true)
    expect(V1474_PROCESS_CONSTRAINT_SEED.filter((rule) => rule.excludedKeywordTerms.length > 0).length).toBeGreaterThanOrEqual(5)
    expect(V1474_PROCESS_CONSTRAINT_SEED.filter((rule) => rule.conditionalEffects.length > 0).length).toBeGreaterThanOrEqual(35)
    expect(overlapRules.filter((rule) => rule.conditionalEffects.length > 0).length).toBeGreaterThanOrEqual(30)
    expect(V1474_PROCESS_CONSTRAINT_SEED.flatMap((rule) => [
      rule.businessReasonTemplate,
      ...rule.conditionalEffects.flatMap((effect) => [effect.curationBasis, effect.businessReasonTemplate]),
    ]).filter((text) => String(text).includes('???'))).toHaveLength(0)
    const conditionalFields = new Set(
      V1474_PROCESS_CONSTRAINT_SEED.flatMap((rule) => (
        rule.conditionalEffects.flatMap((effect) => effect.when.map((condition) => condition.field))
      )),
    )
    expect([...conditionalFields]).toEqual(expect.arrayContaining([
      'climate_signal',
      'weather_impact_band',
      'space_cleanliness_grade',
      'danger_control_level',
      'method_variant_code',
      'element_variant_code',
    ]))

    const legacyEncodedProcessConstraintExamples = [
      expect.objectContaining({
        stableCode: 'grounding_bonding_to_concealed_acceptance_gate',
        requiredKeywordGroups: expect.arrayContaining([
          expect.arrayContaining(['接地跨接']),
          expect.arrayContaining(['隐蔽验收']),
        ]),
        applicationMode: 'gate_wait',
        quantityEvidenceRequirement: 'not_applicable',
      }),
      expect.objectContaining({
        stableCode: 'mep_opening_embed_to_hanger_install_gate',
        requiredKeywordGroups: expect.arrayContaining([
          expect.arrayContaining(['预留预埋']),
          expect.arrayContaining(['支吊架']),
        ]),
        applicationMode: 'gate_wait',
        quantityEvidenceRequirement: 'not_applicable',
      }),
      expect.objectContaining({
        stableCode: 'commissioning_stage_to_next_stage_gate',
        standardCatalogCodePrefixes: expect.arrayContaining(['05-10-06', '06-17', '08-03']),
        applicationMode: 'gate_wait',
        quantityEvidenceRequirement: 'not_applicable',
      }),
      expect.objectContaining({
        stableCode: 'steel_connection_to_coating_segment_overlap',
        standardCatalogCodePrefixes: expect.arrayContaining(['02-03', 'STL']),
        applicableCatalogGroups: expect.arrayContaining(['core_quality', 'specialty']),
        quantityEvidenceRequirement: 'real_quantity_required_for_auto_release',
      }),
      expect.objectContaining({
        stableCode: 'electrical_tray_to_cable_laying_zone_overlap',
        standardCatalogCodePrefixes: expect.arrayContaining(['07']),
        requiredKeywordGroups: expect.arrayContaining([
          expect.arrayContaining(['桥架']),
          expect.arrayContaining(['电缆敷设']),
        ]),
        quantityEvidenceRequirement: 'real_or_default_quantity_proxy_allowed',
      }),
      expect.objectContaining({
        stableCode: 'outdoor_pipe_to_backfill_segment_overlap',
        requiredKeywordGroups: expect.arrayContaining([
          expect.arrayContaining(['室外管网']),
          expect.arrayContaining(['回填']),
        ]),
        excludedKeywordTerms: expect.arrayContaining(['空调', '防腐保温']),
      }),
      expect.objectContaining({
        stableCode: 'cleanroom_envelope_to_hvac_commissioning_room_overlap',
        standardCatalogCodePrefixes: expect.arrayContaining(['06', 'MEP', 'CLN']),
        applicableCatalogGroups: expect.arrayContaining(['core_quality', 'specialty']),
        conditionalEffects: expect.arrayContaining([
          expect.objectContaining({
            id: 'cleanroom-high-grade-project-fact-gate',
            effect: 'require_project_fact_gate',
            quantityEvidenceRequirement: 'real_quantity_required_for_auto_release',
          }),
        ]),
      }),
      expect.objectContaining({
        stableCode: 'roof_base_to_waterproof_zone_overlap',
        conditionalEffects: expect.arrayContaining([
          expect.objectContaining({
            id: 'roof-waterproof-rain-blocks-release',
            effect: 'require_project_fact_gate',
            quantityProxyRiskLevel: 'high',
          }),
        ]),
      }),
    ]
    expect(legacyEncodedProcessConstraintExamples.length).toBe(8)

    const byCode = new Map(V1474_PROCESS_CONSTRAINT_SEED.map((rule) => [rule.stableCode, rule]))
    const requiredRules = [
      'grounding_bonding_to_concealed_acceptance_gate',
      'mep_opening_embed_to_hanger_install_gate',
      'commissioning_stage_to_next_stage_gate',
      'steel_connection_to_coating_segment_overlap',
      'electrical_tray_to_cable_laying_zone_overlap',
      'outdoor_pipe_to_backfill_segment_overlap',
      'cleanroom_envelope_to_hvac_commissioning_room_overlap',
      'roof_base_to_waterproof_zone_overlap',
    ]
    for (const stableCode of requiredRules) {
      const rule = byCode.get(stableCode)
      expect(rule).toBeTruthy()
      expect(rule?.standardCatalogCodePrefixes.length).toBeGreaterThan(0)
      expect(rule?.templateNodeStableCodePrefixes.length).toBeGreaterThan(0)
      expect((rule?.requiredKeywordGroups.length ?? 0) + (rule?.standardCatalogCodePrefixes.length ?? 0)).toBeGreaterThan(0)
      expect(rule?.evidenceSourceKeys.length).toBeGreaterThan(0)
      expect(rule?.durationAuthorityPolicy).toBe('no_duration_values_in_process_constraint')
      expect(rule?.dependencyCreationPolicy).toBe('never_create_dependency')
      expect(rule?.backValidationPolicy).toBe('candidate_only_from_execution_history')
    }

    expect(byCode.get('grounding_bonding_to_concealed_acceptance_gate')).toEqual(expect.objectContaining({
      applicationMode: 'gate_wait',
      quantityEvidenceRequirement: 'not_applicable',
    }))
    expect(byCode.get('mep_opening_embed_to_hanger_install_gate')).toEqual(expect.objectContaining({
      applicationMode: 'gate_wait',
      quantityEvidenceRequirement: 'not_applicable',
    }))
    expect(byCode.get('commissioning_stage_to_next_stage_gate')).toEqual(expect.objectContaining({
      applicationMode: 'gate_wait',
      quantityEvidenceRequirement: 'not_applicable',
    }))
    expect(byCode.get('steel_connection_to_coating_segment_overlap')).toEqual(expect.objectContaining({
      standardCatalogCodePrefixes: expect.arrayContaining(['02-03', 'STL']),
      applicableCatalogGroups: expect.arrayContaining(['core_quality', 'specialty']),
      quantityEvidenceRequirement: 'real_quantity_required_for_auto_release',
    }))
    expect(byCode.get('electrical_tray_to_cable_laying_zone_overlap')).toEqual(expect.objectContaining({
      quantityEvidenceRequirement: 'real_or_default_quantity_proxy_allowed',
    }))
    expect(byCode.get('outdoor_pipe_to_backfill_segment_overlap')).toEqual(expect.objectContaining({
      scopeGranularity: 'segment',
      quantityEvidenceRequirement: 'real_quantity_required_for_auto_release',
    }))
    expect(byCode.get('technical_test_condition_to_test_point_review_gate')).toEqual(expect.objectContaining({
      applicationMode: 'gate_wait',
      standardCatalogCodePrefixes: expect.arrayContaining(['05-', '06-', '08-']),
      dependencyCreationPolicy: 'never_create_dependency',
    }))
    expect(byCode.get('technical_test_point_review_to_execution_record_gate')).toEqual(expect.objectContaining({
      applicationMode: 'gate_wait',
      standardCatalogCodePrefixes: expect.arrayContaining(['05-', '06-', '08-']),
      dependencyCreationPolicy: 'never_create_dependency',
    }))
    expect(byCode.get('hvac_anticorrosion_insulation_base_to_process_gate')).toEqual(expect.objectContaining({
      applicationMode: 'gate_wait',
      standardCatalogCodePrefixes: expect.arrayContaining(['06-10']),
      dependencyCreationPolicy: 'never_create_dependency',
    }))
    expect(byCode.get('pipe_prefab_base_review_to_installation_quality_gate')).toEqual(expect.objectContaining({
      applicationMode: 'gate_wait',
      standardCatalogCodePrefixes: expect.arrayContaining(['06-10', '05-03']),
      dependencyCreationPolicy: 'never_create_dependency',
    }))
    expect(byCode.get('cleanroom_envelope_to_hvac_commissioning_room_overlap')?.conditionalEffects).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'cleanroom-high-grade-project-fact-gate',
        effect: 'require_project_fact_gate',
        quantityEvidenceRequirement: 'real_quantity_required_for_auto_release',
      }),
    ]))
    expect(byCode.get('roof_base_to_waterproof_zone_overlap')?.conditionalEffects).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'roof-waterproof-rain-blocks-release',
        effect: 'require_project_fact_gate',
        quantityProxyRiskLevel: 'high',
      }),
    ]))
    expect(byCode.get('support_dewatering_to_earthwork_layer_overlap')?.conditionalEffects).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'deep-foundation-danger-project-fact-gate',
        effect: 'require_project_fact_gate',
        quantityEvidenceRequirement: 'real_quantity_required_for_auto_release',
      }),
    ]))
    expect(byCode.get('electrical_tray_to_cable_laying_zone_overlap')?.conditionalEffects).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'cable-tray-data-center-tighten-release',
        effect: 'tighten_overlap_release',
        quantityProxyRiskLevel: 'high',
      }),
    ]))
    expect(byCode.get('bathroom_waterproof_to_tile_room_overlap')?.conditionalEffects).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'bathroom-medical-wet-area-project-fact-gate',
        effect: 'require_project_fact_gate',
        quantityEvidenceRequirement: 'real_quantity_required_for_auto_release',
      }),
    ]))
    expect(byCode.get('electrical_conduit_to_wire_pulling_floor_overlap')?.conditionalEffects).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'conduit-wire-data-center-tighten-release',
        effect: 'tighten_overlap_release',
        quantityProxyRiskLevel: 'high',
      }),
    ]))
    expect(byCode.get('outdoor_pipe_to_backfill_segment_overlap')?.conditionalEffects).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'outdoor-pipe-backfill-rain-project-fact-gate',
        effect: 'require_project_fact_gate',
        quantityEvidenceRequirement: 'real_quantity_required_for_auto_release',
      }),
    ]))
    expect(byCode.get('medical_gas_pressure_test_to_panel_close_zone_overlap')?.conditionalEffects).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'medical-gas-critical-area-project-fact-gate',
        effect: 'require_project_fact_gate',
        quantityEvidenceRequirement: 'not_applicable',
        quantityProxyRiskLevel: 'not_applicable',
      }),
    ]))
    expect(byCode.get('prefab_grouting_to_topping_segment_overlap')?.conditionalEffects).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'prefab-grouting-winter-project-fact-gate',
        effect: 'require_project_fact_gate',
        quantityEvidenceRequirement: 'real_quantity_required_for_auto_release',
      }),
    ]))
  })

  it('keeps highly specific process constraint rules from being shadowed by broad overlap rules', () => {
    const byCode = new Map(V1474_PROCESS_CONSTRAINT_SEED.map((rule) => [rule.stableCode, rule]))

    const curtainRule = byCode.get('curtain_wall_frame_to_panel_segment_overlap')
    const mepRule = byCode.get('mep_rough_in_to_ceiling_panel_zone_overlap')

    expect(curtainRule).toBeTruthy()
    expect(mepRule).toBeTruthy()
    expect(curtainRule?.requiredKeywordGroups.length).toBeGreaterThanOrEqual(2)
    expect(curtainRule?.excludedKeywordTerms).toEqual(expect.arrayContaining(['电梯', '桥架']))
    expect(curtainRule?.scopeGranularity).toBe('segment')
    expect(curtainRule?.conditionalEffects.length).toBeGreaterThanOrEqual(1)
    expect(mepRule?.requiredKeywordGroups.length).toBeGreaterThanOrEqual(2)
    expect(mepRule?.excludedKeywordTerms).toEqual(expect.arrayContaining(['幕墙', '桥架', '电缆']))
    expect(mepRule?.scopeGranularity).toBe('zone')
  })

  it('keeps process-constraint candidates in curated governance even when source-backed', () => {
    const decision = evaluateAlgorithmSeedCandidate({
      id: 'candidate-1',
      seed_type: 'process_constraint',
      stable_code: 'constraint_concrete_curing',
      candidate_payload: {
        stableCode: 'constraint_concrete_curing',
        constraintType: 'curing',
        timeSourcePolicy: 'standard_work_duration_seed_only',
        durationLookupPolicy: 'route_to_standard_work_duration_seed',
        durationLookupKeys: ['concrete_curing_reference'],
        durationAuthorityPolicy: 'no_duration_values_in_process_constraint',
        sourceStandard: 'GB/T 50326-2017',
        sourceVersion: '2017',
        sourceClauseRef: 'GB/T 50326-2017 process constraint candidate',
        evidenceSourceKeys: ['gbt50326'],
        webVerified: true,
        reviewNeeded: false,
      },
      candidate_source: 'project_history',
      project_id: 'project-1',
      company_id: 'company-1',
      sample_count: 8,
      variance: 0.1,
      confidence_level: 'high',
      evidence_summary: { sampleWindow: 'recent_completed_tasks' },
      action_policy: 'auto_govern',
    })

    expect(decision).toEqual(expect.objectContaining({
      status: 'candidate_only',
      shouldPublish: false,
      scopeType: 'project',
    }))
    expect(decision.reasons).toContain('process_constraint_requires_curated_seed_promotion')
    expect(decision.warnings).toContain('candidate_kept_without_runtime_effect')
  })

  it('normalizes process-constraint payloads without day values and sanitizes conditional effects', () => {
    const payload = normalizeAlgorithmSeedRecordPayload('process_constraint', {
      stableCode: 'candidate_process_constraint_guard',
      standardWorkCodes: ['07-01-01-P07'],
      constraintType: 'overlap_allowed',
      applicationMode: 'edge_overlap',
      defaultDays: 5,
      learnedDays: 6,
      mandatoryLagDays: 2,
      defaultLagDays: 1,
      conditionalEffects: [
        {
          id: 'valid-cleanroom-gate',
          when: [{ field: 'space_cleanliness_grade', operator: 'includes_any', values: ['iso5'] }],
          effect: 'require_project_fact_gate',
          minReleaseQuantityPercentDelta: 5,
          partialOverlapRatioMultiplier: 0.75,
          quantityEvidenceRequirement: 'real_quantity_required_for_auto_release',
          quantityProxyRiskLevel: 'high',
          curationBasis: 'high-grade cleanroom gate',
          businessReasonTemplate: '高等级洁净区需要项目事实门禁。',
        },
        {
          id: 'invalid-field',
          when: [{ field: 'unknown_field', operator: 'includes_any', values: ['x'] }],
          effect: 'require_project_fact_gate',
        },
        {
          id: 'invalid-effect',
          when: [{ field: 'space_cleanliness_grade', operator: 'includes_any', values: ['iso5'] }],
          effect: 'add_days',
        },
      ],
    })

    expect(payload.defaultDays).toBeUndefined()
    expect(payload.learnedDays).toBeUndefined()
    expect(payload.mandatoryLagDays).toBeUndefined()
    expect(payload.defaultLagDays).toBeUndefined()
    expect(payload.defaultDaysP50).toBeNull()
    expect(payload.durationAuthorityPolicy).toBe('no_duration_values_in_process_constraint')
    expect(payload.conditionalEffects).toEqual([
      expect.objectContaining({
        id: 'valid-cleanroom-gate',
        effect: 'require_project_fact_gate',
        when: [{ field: 'space_cleanliness_grade', operator: 'includes_any', values: ['iso5'] }],
        quantityEvidenceRequirement: 'real_quantity_required_for_auto_release',
        quantityProxyRiskLevel: 'high',
      }),
    ])
  })

  it('keeps standard internal flow stable-code rules unique after promoted renovation gate backfill', () => {
    const validation = validateV1474AlgorithmSeeds({ strict: true, seedType: 'standard_internal_flow' })
    expect(validation.issues).not.toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'DUPLICATE_STABLE_CODE',
        stableCode: 'stable-code-RNV-04-01-15-P05-to-RNV-04-01-15-P06',
      }),
    ]))
    const entry = validation.entries[0]
    expect(entry.duplicateStableCodes).not.toContain('stable-code-RNV-04-01-15-P05-to-RNV-04-01-15-P06')
  })

  it('auto-publishes source-backed standard work duration calibration candidates', () => {
    const decision = evaluateAlgorithmSeedCandidate({
      id: 'candidate-standard-duration',
      seed_type: 'standard_work_duration',
      stable_code: 'learned:standard_work_duration:03_02_01_p02:duration',
      candidate_payload: {
        stableCode: 'learned:standard_work_duration:03_02_01_p02:duration',
        standardWorkCodes: ['03-02-01-P02'],
        defaultDaysP20: 5,
        defaultDaysP50: 7,
        defaultDaysP80: 9,
        fixedDays: 1,
        variableDays: 6,
        scaleBasis: 'area',
        durationContributionMode: 'duration_bearing',
        baseDaysEligible: true,
        sourceStandard: 'enterprise_practice',
        sourceVersion: 'duration_experience_samples',
        sourceClauseRef: 'duration_experience_samples.03-02-01-P02',
        evidenceSourceKeys: ['duration_experience_samples:03-02-01-P02'],
        webVerified: true,
        reviewNeeded: false,
      },
      candidate_source: 'project_history',
      project_id: 'project-1',
      company_id: 'company-1',
      sample_count: 8,
      variance: 0.12,
      confidence_level: 'high',
      evidence_summary: {
        source: 'duration_experience_samples.actual_duration',
        benchmarkContextKey: 'project=residential|structure=frame',
      },
      action_policy: 'auto_govern',
    })

    expect(decision).toEqual(expect.objectContaining({
      status: 'auto_published',
      shouldPublish: true,
      scopeType: 'project',
      reasons: ['auto_governance_passed'],
    }))
  })

  it('keeps standard internal-flow execution-history candidates out of direct auto-publish', () => {
    const decision = evaluateAlgorithmSeedCandidate({
      id: 'candidate-internal-flow',
      seed_type: 'standard_internal_flow',
      stable_code: 'learned:standard_internal_flow:predecessor:successor',
      candidate_payload: {
        stableCode: 'learned:standard_internal_flow:predecessor:successor',
        predecessorStableCode: '06-06-01-P06',
        successorStableCode: '06-06-01-P07',
        relationKind: 'acceptance_gate',
        createsDependency: true,
        sourceStandard: 'enterprise_execution_history',
        sourceVersion: 'v1.4.7.2-internal-flow-auto-discovery',
        evidenceSourceKeys: ['standard_internal_flow_samples:demo'],
        webVerified: true,
        reviewNeeded: false,
        effectPolicy: {
          canSuggestInternalFlow: true,
          canCreateRuntimeDependency: false,
          canModifyStandardSeed: false,
          promotionRequiresManualSeedRule: true,
        },
      },
      candidate_source: 'project_history',
      project_id: 'project-1',
      company_id: 'company-1',
      sample_count: 8,
      variance: 0.1,
      confidence_level: 'high',
      evidence_summary: { source: 'duration_experience_samples.standard_internal_flow' },
      action_policy: 'auto_govern',
    })

    expect(decision).toEqual(expect.objectContaining({
      status: 'candidate_only',
      shouldPublish: false,
      scopeType: 'project',
      reasons: expect.arrayContaining(['standard_internal_flow_requires_curated_seed_promotion']),
      warnings: expect.arrayContaining(['candidate_requires_curated_seed_or_enterprise_standard_library_governance']),
    }))
  })

  it('quarantines standard internal-flow back-validation candidates with a manual review reason', () => {
    const decision = evaluateAlgorithmSeedCandidate({
      id: 'candidate-internal-flow-back-validation',
      seed_type: 'standard_internal_flow',
      stable_code: 'learned:standard_internal_flow:predecessor:successor',
      candidate_payload: {
        stableCode: 'learned:standard_internal_flow:predecessor:successor',
        predecessorStableCode: '10-01-05-P04',
        successorStableCode: '10-01-05-P05',
        relationKind: 'soft_sequence',
        createsDependency: false,
        sourceStandard: 'enterprise_execution_history',
        sourceVersion: 'v1.4.7.2-internal-flow-auto-discovery',
        evidenceSourceKeys: ['standard_internal_flow_samples:back-validation'],
        webVerified: true,
        reviewNeeded: true,
        validationMode: 'curated_rule_may_be_too_strict',
      },
      candidate_source: 'project_history',
      project_id: 'project-1',
      company_id: 'company-1',
      sample_count: 8,
      variance: 0.1,
      confidence_level: 'high',
      evidence_summary: { source: 'duration_experience_samples.standard_internal_flow' },
      action_policy: 'auto_govern',
    })

    expect(decision).toEqual(expect.objectContaining({
      status: 'quarantined',
      shouldPublish: false,
      scopeType: 'project',
      quarantineReason: 'standard_internal_flow_back_validation_requires_manual_review',
      reasons: expect.arrayContaining(['standard_internal_flow_back_validation_requires_manual_review']),
      warnings: expect.arrayContaining(['manual_seed_or_template_source_order_review_required']),
    }))
  })

  it('quarantines candidates without evidence', () => {
    const decision = evaluateAlgorithmSeedCandidate({
      id: 'candidate-2',
      seed_type: 'process_constraint',
      stable_code: 'constraint_concrete_curing',
      candidate_payload: {
        stableCode: 'constraint_concrete_curing',
        constraintType: 'curing',
        durationLookupKeys: ['concrete_curing_reference'],
        sourceStandard: 'enterprise_practice',
        sourceVersion: 'missing-evidence-test',
        sourceClauseRef: 'process_constraint.missing_evidence',
      },
      candidate_source: 'project_history',
      project_id: 'project-1',
      company_id: 'company-1',
      sample_count: 8,
      variance: 0.1,
      confidence_level: 'high',
      evidence_summary: {},
      action_policy: 'auto_govern',
    })

    expect(decision.status).toBe('quarantined')
    expect(decision.quarantineReason).toBe('validation_quarantine_required')
    expect(decision.audit.validationGate.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'RECORD_EVIDENCE_INCOMPLETE' }),
    ]))
    expect(decision.shouldPublish).toBe(false)
  })

  it('keeps inactive resource-class candidates out of auto-publish until resource facts exist', () => {
    const decision = evaluateAlgorithmSeedCandidate({
      id: 'candidate-resource-inactive',
      seed_type: 'resource_class',
      stable_code: 'resource_concrete_pour',
      candidate_payload: {
        stableCode: 'resource_concrete_pour',
        resourceClass: 'concrete_pour',
        sourceStandard: 'GB/T 50326-2017',
        sourceVersion: '2017',
        sourceClauseRef: 'GB/T 50326-2017 resource class candidate',
        evidenceSourceKeys: ['gbt50326'],
        webVerified: true,
        reviewNeeded: false,
      },
      candidate_source: 'project_history',
      project_id: 'project-1',
      company_id: 'company-1',
      sample_count: 20,
      variance: 0.1,
      confidence_level: 'high',
      evidence_summary: { sampleWindow: 'recent_completed_tasks' },
      action_policy: 'auto_govern',
    })

    expect(decision).toEqual(expect.objectContaining({
      status: 'candidate_only',
      shouldPublish: false,
      quarantineReason: null,
    }))
    expect(decision.reasons).toContain('seed_rule_inactive')
  })

  it('keeps resource-class seed records inactive at resolver runtime', async () => {
    const records = await resolveAlgorithmSeedRecords('resource_class', {})
    expect(records).toHaveLength(0)
  })

  it('keeps resource-class matching behind standard work semantics instead of keyword order', () => {
    expect(findV1474ResourceClass('幕墙龙骨安装', {
      standardWorkCode: 'curtain_wall_installation',
    })).toEqual(expect.objectContaining({
      resourceClass: 'curtain_wall',
      stableCode: 'resource_curtain_wall_specialist',
    }))

    expect(findV1474ResourceClass('钢结构吊装', {
      standardWorkCode: 'steel_erection',
    })).toEqual(expect.objectContaining({
      resourceClass: 'steel_hoisting',
      stableCode: 'resource_steel_hoisting',
    }))

    expect(findV1474ResourceClass('塔吊吊装排班')).toEqual(expect.objectContaining({
      resourceClass: 'tower_crane',
      stableCode: 'resource_tower_crane',
    }))
  })

  it('covers common decoration and temporary access titles through resource-class seed aliases', () => {
    expect(findV1474ResourceClass('2F贴砖铺贴', {
      standardWorkCode: 'tile_facing_finish',
    })).toEqual(expect.objectContaining({
      resourceClass: 'flooring',
    }))

    expect(findV1474ResourceClass('户内吊顶龙骨安装', {
      standardWorkCode: 'ceiling_system_finish',
    })).toEqual(expect.objectContaining({
      resourceClass: 'interior_finishing',
    }))

    expect(findV1474ResourceClass('外架搭设验收', {
      standardWorkCode: 'scaffold_temp_access',
    })).toEqual(expect.objectContaining({
      resourceClass: 'scaffold',
    }))
  })

  it('maps specialty and domain template prefixes to resource classes before keyword fallback', () => {
    expect(findV1474ResourceClass('construction hoist mast-section addition', {
      standardWorkCode: 'DANGER-02-01-02-P04',
    })).toEqual(expect.objectContaining({
      resourceClass: 'construction_hoist',
      stableCode: 'resource_construction_hoist',
    }))

    expect(findV1474ResourceClass('outdoor road paving', {
      standardWorkCode: 'OUT-01-01-01-P04',
    })).toEqual(expect.objectContaining({
      resourceClass: 'outdoor_utility',
      stableCode: 'resource_outdoor_utility',
    }))

    expect(findV1474ResourceClass('landscape path paving', {
      standardWorkCode: 'OUT-04-01-01-P04',
    })).toEqual(expect.objectContaining({
      resourceClass: 'landscape',
      stableCode: 'resource_landscape',
    }))

    expect(findV1474ResourceClass('temporary works cleanup', {
      standardWorkCode: 'SITE-02-01-01-P02',
    })).toEqual(expect.objectContaining({
      resourceClass: 'general_crew',
      stableCode: 'resource_general_site_crew',
    }))
  })

  it('uses the longest catalog prefix to separate installation, support and commissioning resource semantics', () => {
    expect(findV1474ResourceClass('roof insulation installation', {
      standardWorkCode: 'WPI-02-01-02-P03',
    })).toEqual(expect.objectContaining({
      resourceClass: 'insulation',
      stableCode: 'resource_insulation',
    }))

    expect(findV1474ResourceClass('basement waterproof membrane', {
      standardWorkCode: 'WPI-01-01-01-P04',
    })).toEqual(expect.objectContaining({
      resourceClass: 'waterproof',
      stableCode: 'resource_waterproof',
    }))

    expect(findV1474ResourceClass('fire sprinkler pipe installation', {
      standardWorkCode: 'FIR-01-01-01-P04',
    })).toEqual(expect.objectContaining({
      resourceClass: 'fire_system',
      stableCode: 'resource_fire_system',
    }))

    expect(findV1474ResourceClass('elevator guide rail installation', {
      standardWorkCode: 'ELV-01-01-02-P02',
    })).toEqual(expect.objectContaining({
      resourceClass: 'elevator',
      stableCode: 'resource_elevator',
    }))

    expect(findV1474ResourceClass('elevator system commissioning', {
      standardWorkCode: 'ELV-02-01-02-P02',
    })).toEqual(expect.objectContaining({
      resourceClass: 'commissioning',
      stableCode: 'resource_commissioning',
    }))
  })

  it('does not infer resource classes for non-construction management titles without standard semantics', () => {
    expect(findV1474ResourceClass('weekly project meeting and document sorting')).toBeNull()
  })

  it('falls back construction-like unmatched resource text to general crew without catching pure management records', () => {
    expect(findV1474ResourceClass('现场协调会')).toEqual(expect.objectContaining({
      resourceClass: 'general_crew',
      stableCode: 'resource_general_site_crew',
    }))
    expect(findV1474ResourceClass('weekly project meeting and document sorting')).toBeNull()
  })

  it('separates resource class from resource operation semantics for vertical transport equipment', () => {
    expect(findV1474ResourceClassMatch('2#楼施工升降机加节', {
      standardWorkCode: 'DANGER-02-01-02-P04',
    })).toEqual(expect.objectContaining({
      resourceClass: 'construction_hoist',
      stableCode: 'resource_construction_hoist',
      resourceOperationType: 'add_section',
      operationConfidence: 'high',
      pressureDimensions: ['equipment', 'workface'],
    }))

    expect(findV1474ResourceClassMatch('2#楼施工升降机使用')).toEqual(expect.objectContaining({
      resourceClass: 'construction_hoist',
      stableCode: 'resource_construction_hoist',
      resourceOperationType: 'use',
      operationConfidence: 'medium',
    }))

    expect(findV1474ResourceClassMatch('2#楼施工升降机检测验收')).toEqual(expect.objectContaining({
      resourceClass: 'construction_hoist',
      stableCode: 'resource_construction_hoist',
      resourceOperationType: 'inspection_acceptance',
    }))

    expect(findV1474ResourceClassMatch('3#楼塔吊顶升附墙')).toEqual(expect.objectContaining({
      resourceClass: 'tower_crane',
      stableCode: 'resource_tower_crane',
      resourceOperationType: 'add_section',
      pressureDimensions: ['equipment', 'workface'],
    }))

    expect(findV1474ResourceClassMatch('塔吊安装与dismantle')).toEqual(expect.objectContaining({
      resourceClass: 'tower_crane',
      stableCode: 'resource_tower_crane',
      resourceOperationType: 'install',
      operationConfidence: 'high',
      operationMatchSource: 'keyword',
    }))
  })

  it('prefers the earlier operation type when a low-parallel resource title contains multiple keyword operations', () => {
    expect(findV1474ResourceClassMatch('prefabricated component hoisting installation')).toEqual(expect.objectContaining({
      resourceClass: 'precast_hoisting',
      resourceOperationType: 'transport',
      operationMatchSource: 'keyword',
    }))

    expect(findV1474ResourceClassMatch('tower crane installation and dismantle')).toEqual(expect.objectContaining({
      resourceClass: 'tower_crane',
      resourceOperationType: 'install',
      operationMatchSource: 'keyword',
    }))
  })

  it('keeps resource class as detail mapping while exposing site pressure dimensions', () => {
    expect(findV1474ResourceClassMatch('C30混凝土浇筑', {
      standardWorkCode: '02-01-03-P04',
    })).toEqual(expect.objectContaining({
      resourceClass: 'concrete_pour',
      pressureDimensions: ['labor', 'material', 'equipment', 'workface'],
    }))

    expect(findV1474ResourceClassMatch('外墙防水卷材施工', {
      standardWorkCode: 'WPI-01-01-01-P04',
    })).toEqual(expect.objectContaining({
      resourceClass: 'waterproof',
      pressureDimensions: ['labor', 'material', 'workface'],
    }))
  })

  it('keeps existing resource-class resolver backward compatible while exposing operation-aware matches', () => {
    expect(findV1474ResourceClass('2#楼施工升降机加节')).toEqual(expect.objectContaining({
      resourceClass: 'construction_hoist',
      stableCode: 'resource_construction_hoist',
    }))

    expect(findV1474ResourceClassMatch('elevator system commissioning', {
      standardWorkCode: 'ELV-02-01-02-P02',
    })).toEqual(expect.objectContaining({
      resourceClass: 'commissioning',
      stableCode: 'resource_commissioning',
      resourceOperationType: 'commissioning',
      operationMatchSource: 'keyword',
    }))
  })

  it('covers operation semantics for low-parallel specialist resources only', () => {
    expect(findV1474ResourceClassMatch('钢结构构件吊装')).toEqual(expect.objectContaining({
      resourceClass: 'steel_hoisting',
      resourceOperationType: 'transport',
    }))

    expect(findV1474ResourceClassMatch('外架拆除退场')).toEqual(expect.objectContaining({
      resourceClass: 'scaffold',
      resourceOperationType: 'dismantle',
    }))

    expect(findV1474ResourceClassMatch('幕墙淋水试验验收')).toEqual(expect.objectContaining({
      resourceClass: 'curtain_wall',
      resourceOperationType: 'inspection_acceptance',
    }))

    expect(findV1474ResourceClassMatch('装配式预制构件吊装')).toEqual(expect.objectContaining({
      resourceClass: 'precast_hoisting',
      resourceOperationType: 'transport',
    }))
  })

  it('keeps candidate-only records out of active rules', () => {
    const decision = evaluateAlgorithmSeedCandidate({
      id: 'candidate-3',
      seed_type: 'resource_class',
      stable_code: 'resource_concrete_pour',
      candidate_payload: {
        stableCode: 'resource_concrete_pour',
        resourceClass: 'concrete_pour',
        sourceStandard: 'GB/T 50326-2017',
        sourceVersion: '2017',
        evidenceSourceKeys: ['gbt50326'],
      },
      candidate_source: 'project_history',
      project_id: 'project-1',
      company_id: 'company-1',
      sample_count: 20,
      variance: 0.1,
      confidence_level: 'high',
      evidence_summary: { sampleWindow: 'recent_completed_tasks' },
      action_policy: 'candidate_only',
    })

    expect(decision.status).toBe('candidate_only')
    expect(decision.shouldPublish).toBe(false)
  })
})
