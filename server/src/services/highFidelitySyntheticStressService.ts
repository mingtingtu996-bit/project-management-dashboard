import { performance } from 'node:perf_hooks'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

import type {
  DurationContextFactorKey,
  DurationContextInput,
  DurationContextSummary,
} from './durationContextService.js'
import { summarizeEffectiveDurationContextContributions } from './durationContextService.js'
import type {
  AlgorithmSeedResolveContext,
  V1474BuildingPatternMatches,
} from './algorithmSeedResolver.js'
import {
  buildProjectScheduleState,
  toProjectScheduleStateRow,
} from './projectScheduleStateService.js'
import { buildForecastWorkCalendarRecords } from './workCalendarForecastBuilder.js'
import { inclusiveDurationDays, orderedInclusiveDurationDays } from '../utils/durationDays.js'

type Row = Record<string, unknown>

export interface MiniHighFidelityDatasetOptions {
  projectId?: string
  taskCount?: number
  startDate?: string
  months?: number
  progressSnapshotMode?: 'weekly' | 'daily'
  durationExperienceSampleCount?: number
}

export interface MiniHighFidelitySyntheticDataset {
  projectId: string
  projectName: string
  scenarioVersion: string
  startDate: string
  months: number
  representativeContextCount: number
  tables: Record<string, Row[]>
  stressCases: Array<{
    taskId: string
    scenarioCode: string
    month: string
    expectedSignals: string[]
  }>
  groundTruth: {
    expectedLowProductivityMonths: string[]
    expectedCompensatedMonths: string[]
    expectedBuildingPatternTexts: string[]
  }
}

export interface MiniHighFidelityStressResult {
  projectId: string
  scenarioVersion: string
  datasetProfile: {
    taskCount: number
    progressSnapshotCount: number
    weatherForecastCount: number
    durationExperienceSampleCount: number
    scheduleStateCount: number
    dataQualityFindingCount: number
  }
  executedCaseCount: number
  ruleCoverage: Record<string, number>
  monthlyProductivity: Record<string, number>
  monthlyProductivityIndependent: Record<string, number>
  monthlyProductivityCompensated: Record<string, number>
  monthlyProductivityStats: Record<string, {
    maxP: number
    minP: number
    p90: number
    accelerationCaseRatio: number
    compensationSignalRatio: number
    scheduleStateAccelerationRatio: number
    averageCompensationUplift: number
    maxCompensationUplift: number
    caseCount: number
  }>
  monthlyImpactedProductivityStats: Record<string, {
    climateSignal: string
    averageP: number
    maxP: number
    minP: number
    p90: number
    caseCount: number
  }>
  monthlyCompensationUplift: Record<string, number>
  observations: {
    extraDaysCapHitCount: number
    velocitySkippedDueToZeroProgressCount: number
    weightedBuildingPatternCycleCount: number
    scheduleStateCombinationCount: number
    productivityCompensationAppliedCount: number
    pmRecoveryCompensationAppliedCount: number
    climateCapAppliedCount: number
    accelerationProductivitySignalCount: number
    finalProductivityAboveOneCount: number
    scheduleStateAccelerationSignalCount: number
    strongAccelerationProductivitySignalCount: number
    overcompressionProductivityWarningCount: number
    externalReadinessExpectedCaseCount: number
    externalReadinessExpectedHitCount: number
    lowConfidenceCount: number
  }
  buildingPatternCoverage: Record<string, number>
  scenarioFindings: Array<{
    scenarioCode: string
    taskId: string
    month: string
    multiplier: number
    productivity: number
    independentProductivity: number
    compensationUplift: number
    compensationSignal: boolean
    scheduleStateAccelerationSignal: boolean
    finalProductivityAboveOne: boolean
    extraDays: number
    adjustedBy: DurationContextFactorKey[]
    factorKeys: string[]
    buildingPatternCodes: string[]
    notes: string[]
  }>
  performance: {
    totalMs: number
    averageCaseMs: number
    maxCaseMs: number
    slowCaseTopN: Array<{
      taskId: string
      month: string
      scenarioCode: string
      elapsedMs: number
      durationContextCacheStatus: 'miss' | 'pending_hit' | 'settled_hit'
      durationContextWaitMs: number
      buildingPatternCacheStatus: 'miss' | 'pending_hit' | 'settled_hit'
      buildingPatternWaitMs: number
      cacheSharedWaitLikely: boolean
      factorKeys: string[]
      productivity: number
      multiplier: number
      extraDays: number
    }>
    scenarioPerformance: Array<{
      scenarioCode: string
      caseCount: number
      averageMs: number
      maxMs: number
      averageDurationContextWaitMs: number
      maxDurationContextWaitMs: number
      pendingDurationContextCacheHitCount: number
      durationContextCacheMissCount: number
    }>
    cacheDiagnostics: {
      durationContextMissCount: number
      durationContextPendingHitCount: number
      durationContextSettledHitCount: number
      buildingPatternMissCount: number
      buildingPatternPendingHitCount: number
      buildingPatternSettledHitCount: number
    }
    projectedFullScaleHours2500x540: number
    projectedRepresentativeContextHours: number
    representativeContextCount: number
    sourceProgressSnapshotRows: number
    projectionBasis: string
    cacheOptimizationPolicy: string
  }
}

type RunnerDeps = {
  buildDurationContext: (input: DurationContextInput) => Promise<DurationContextSummary>
  resolveBuildingPatternMatches: (
    text: string,
    context?: AlgorithmSeedResolveContext,
    options?: { limit?: number },
  ) => Promise<V1474BuildingPatternMatches>
}

type RunnerOptions = {
  maxCases?: number
  asOfDate?: string | Date
  concurrency?: number
}

type PromiseCacheStatus = 'miss' | 'pending_hit' | 'settled_hit'

type PromiseCacheEntry<T> = {
  promise: Promise<T>
  settled: boolean
}

type CaseRuntimePlan = {
  item: MiniHighFidelitySyntheticDataset['stressCases'][number]
  task: Row
  input: DurationContextInput
  month: string
  scenarioCacheKey: string
  buildingPatternCacheKey: string
  durationContextCacheKey: string
  buildingPatternText: string
  buildingPatternContext: AlgorithmSeedResolveContext
}

type SyntheticBusinessUnit = {
  unitId: string
  businessType: string
  taskRatio: number
  climateCity: 'hangzhou' | 'harbin' | 'guangzhou'
  metadata: {
    projectTypeCode: string
    structureTypeCode: string
    elementVariantCodes: string[]
    spaceCleanlinessGrade?: string
    dangerControlLevel?: string
    methodVariantCodes?: string[]
  }
}

type SyntheticStandardWork = {
  code: string
  name: string
  processConstraintTitleSuffix?: string
  processConstraintExpected?: boolean
}

const DAY_MS = 86_400_000
const SCENARIO_VERSION = 'mini-high-fidelity-v1-2026-05-26'
const FULL_SCALE_TASK_COUNT = 2_500
const PRODUCTIVITY_OUTPUT_SAFETY_MAX = 1.4
const REPRESENTATIVE_PREWARM_CASE_THRESHOLD = 120
const REPRESENTATIVE_PREWARM_CONCURRENCY = 4
const PROJECT_NAME = '示范云台府 mini 高保真压测'

const DEFAULT_BUSINESS_TYPE_MATRIX: SyntheticBusinessUnit[] = [
  {
    unitId: 'Y1#',
    businessType: 'residential',
    taskRatio: 160,
    climateCity: 'hangzhou',
    metadata: {
      projectTypeCode: 'residential',
      structureTypeCode: 'shear_wall',
      elementVariantCodes: ['dwelling_unit'],
    },
  },
  {
    unitId: 'Y2#',
    businessType: 'commercial_office',
    taskRatio: 80,
    climateCity: 'hangzhou',
    metadata: {
      projectTypeCode: 'commercial',
      structureTypeCode: 'frame_core_tube',
      elementVariantCodes: ['office_floor'],
    },
  },
  {
    unitId: 'Y3#',
    businessType: 'public_exhibition',
    taskRatio: 50,
    climateCity: 'hangzhou',
    metadata: {
      projectTypeCode: 'public_building',
      structureTypeCode: 'steel_frame',
      elementVariantCodes: ['large_span_hall', 'large_span', 'beam_span_gt_8m'],
    },
  },
  {
    unitId: 'Y4#',
    businessType: 'hospital',
    taskRatio: 80,
    climateCity: 'hangzhou',
    metadata: {
      projectTypeCode: 'hospital',
      structureTypeCode: 'frame_shear_wall',
      elementVariantCodes: ['cleanroom', 'hospital_ward'],
      spaceCleanlinessGrade: 'iso5',
    },
  },
  {
    unitId: 'Y5#',
    businessType: 'data_center',
    taskRatio: 60,
    climateCity: 'hangzhou',
    metadata: {
      projectTypeCode: 'data_center',
      structureTypeCode: 'steel_frame',
      elementVariantCodes: ['data_center_room', 'data_center', 'mission_critical_room'],
    },
  },
  {
    unitId: 'Y6#',
    businessType: 'renovation',
    taskRatio: 30,
    climateCity: 'hangzhou',
    metadata: {
      projectTypeCode: 'renovation',
      structureTypeCode: 'masonry_timber',
      elementVariantCodes: ['heritage_room'],
    },
  },
  {
    unitId: 'Y7#',
    businessType: 'tod_mixed_use',
    taskRatio: 80,
    climateCity: 'hangzhou',
    metadata: {
      projectTypeCode: 'mixed_use',
      structureTypeCode: 'composite',
      elementVariantCodes: ['transfer_deck'],
    },
  },
  {
    unitId: 'Y8#',
    businessType: 'basement_garage',
    taskRatio: 30,
    climateCity: 'hangzhou',
    metadata: {
      projectTypeCode: 'basement_garage',
      structureTypeCode: 'reinforced_concrete',
      elementVariantCodes: ['shared_basement'],
    },
  },
  {
    unitId: 'Y9#',
    businessType: 'prefab_severe_cold_residential',
    taskRatio: 15,
    climateCity: 'harbin',
    metadata: {
      projectTypeCode: 'residential',
      structureTypeCode: 'prefabricated_concrete',
      elementVariantCodes: ['prefab_grouting'],
      methodVariantCodes: ['prefab_grouting', 'prefabricated_concrete', 'prefabricated'],
      dangerControlLevel: 'critical',
    },
  },
  {
    unitId: 'Y10#',
    businessType: 'humid_south_residential',
    taskRatio: 15,
    climateCity: 'guangzhou',
    metadata: {
      projectTypeCode: 'residential',
      structureTypeCode: 'shear_wall',
      elementVariantCodes: ['humid_interior'],
    },
  },
]

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function round(value: number, precision = 3) {
  const factor = 10 ** precision
  return Math.round(value * factor) / factor
}

function percentile(values: number[], ratio: number) {
  if (values.length === 0) return 0
  const sorted = [...values].sort((left, right) => left - right)
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1))
  return sorted[index] ?? 0
}

function readRecord(value: unknown): Row {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Row
    : {}
}

function addDays(dateText: string, days: number) {
  const date = new Date(`${dateText}T00:00:00.000Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

function monthKey(dateText: string) {
  return dateText.slice(0, 7)
}

function cycle<T>(items: T[], index: number) {
  return items[index % items.length]!
}

function asRecord(value: unknown): Row {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Row : {}
}

function readStringArray(value: unknown) {
  if (Array.isArray(value)) return value.map((item) => String(item ?? '').trim()).filter(Boolean)
  const text = String(value ?? '').trim()
  return text ? text.split(',').map((item) => item.trim()).filter(Boolean) : []
}

function syntheticBusinessUnitForIndex(index: number, taskCount: number) {
  const totalWeight = DEFAULT_BUSINESS_TYPE_MATRIX.reduce((sum, unit) => sum + unit.taskRatio, 0)
  const cursor = (index / Math.max(1, taskCount)) * totalWeight
  let accumulated = 0
  for (const unit of DEFAULT_BUSINESS_TYPE_MATRIX) {
    accumulated += unit.taskRatio
    if (cursor < accumulated) return unit
  }
  return DEFAULT_BUSINESS_TYPE_MATRIX[DEFAULT_BUSINESS_TYPE_MATRIX.length - 1]!
}

function scopedClimateMetadata(unit: SyntheticBusinessUnit, month: string) {
  const monthNumber = Number(month.slice(5, 7))
  if (unit.climateCity === 'harbin') {
    return {
      climateCity: 'harbin',
      thermalZone: 'severe_cold',
      climateSignal: [11, 12, 1, 2, 3].includes(monthNumber) ? 'winter_low_temp' : monthNumber === 4 ? 'freeze_thaw' : 'short_building_season',
      weatherImpactBand: [11, 12, 1, 2, 3].includes(monthNumber) ? 'snow_ice_block' : undefined,
    }
  }
  if (unit.climateCity === 'guangzhou') {
    return {
      climateCity: 'guangzhou',
      thermalZone: 'hot_summer_warm_winter',
      climateSignal: [2, 3, 4].includes(monthNumber)
        ? 'persistent_humidity'
        : [4, 5, 6, 7, 8, 9].includes(monthNumber)
          ? 'rainy_season'
          : undefined,
      weatherImpactBand: [2, 3, 4].includes(monthNumber) ? 'humidity_dry_window' : undefined,
    }
  }
  return {
    climateCity: 'hangzhou',
    thermalZone: 'hot_summer_cold_winter',
    climateSignal: [5, 6, 7].includes(monthNumber)
      ? 'rainy_season'
      : [7, 8].includes(monthNumber)
        ? 'summer_heat'
        : [12, 1, 2].includes(monthNumber)
          ? 'winter_low_temp'
          : undefined,
    weatherImpactBand: undefined,
  }
}

function plannedEnd(startDate: string, durationDays: number) {
  return addDays(startDate, Math.max(1, durationDays) - 1)
}

function compactMonthIndex(index: number, taskCount: number, months: number) {
  if (taskCount <= 1) return 0
  return Math.min(months - 1, Math.floor(index * months / taskCount))
}

function scenarioForMonth(month: string, index: number) {
  if (month === '2026-04') return 'earliest_external_unknown_blocker'
  if (month === '2026-05') return 'resource_tower_crane_plum_rain'
  if (month === '2026-06') return 'finishing_stagnation_dragon_boat'
  if (month === '2026-07') return 'material_delay_heat_bottom_slab'
  if (month === '2026-08') return 'progress_quality_rollback_heat'
  if (month === '2026-09') return 'same_zone_parallel_typhoon'
  if (month.endsWith('-02')) return 'spring_festival_zero_progress'
  if (month === '2027-03') return 'schedule_state_accelerating'
  if (month === '2027-07') return 'summer_roof_outdoor_heat'
  if (month === '2027-09') return index % 2 === 0 ? 'multi_factor_cap' : 'compensated_mature_execution'
  if (month >= '2028-04' && month <= '2028-11') return 'compensated_mature_execution'
  if (month.endsWith('-04')) return index % 2 === 0 ? 'exterior_coating_spring_rain' : 'roof_membrane_spring_rain'
  if (month.endsWith('-05')) return index % 2 === 0 ? 'exterior_coating_plum_rain' : 'normal_structural_cycle'
  if (month.endsWith('-06')) return index % 2 === 0 ? 'curtain_wall_plum_rain_wind' : 'finishing_stagnation_dragon_boat'
  if (month.endsWith('-07')) return index % 2 === 0 ? 'summer_roof_outdoor_heat' : 'exterior_coating_summer_heat'
  if (month.endsWith('-08')) return index % 3 === 0 ? 'curtain_wall_typhoon_wind' : 'progress_quality_rollback_heat'
  return index % 9 === 0 ? 'prefab_mixed_building_pattern' : 'normal_structural_cycle'
}

function processConstraintWorkForBusinessUnit(unit: SyntheticBusinessUnit): SyntheticStandardWork | null {
  if (unit.businessType === 'public_exhibition') {
    return {
      code: 'STL-03',
      name: 'large span steel deck stud welding concrete pour',
      processConstraintTitleSuffix: 'large span steel deck stud welding composite slab concrete pour segment',
      processConstraintExpected: true,
    }
  }
  if (unit.businessType === 'hospital') {
    return {
      code: 'CLN-02-01-01',
      name: 'cleanroom envelope HVAC commissioning',
      processConstraintTitleSuffix: 'cleanroom envelope pressure boundary HVAC commissioning overlap',
      processConstraintExpected: true,
    }
  }
  if (unit.businessType === 'data_center') {
    return {
      code: '07-03',
      name: 'data center cable tray cable laying',
      processConstraintTitleSuffix: 'data center cable tray cable laying mission critical room overlap',
      processConstraintExpected: true,
    }
  }
  if (unit.businessType === 'basement_garage') {
    return {
      code: 'FND-02-01-02',
      name: 'foundation support dewatering earthwork excavation',
      processConstraintTitleSuffix: 'shared basement support dewatering earthwork excavation layer overlap',
      processConstraintExpected: true,
    }
  }
  if (unit.businessType === 'prefab_severe_cold_residential') {
    return {
      code: '02-01-06',
      name: 'prefab sleeve grouting topping slab',
      processConstraintTitleSuffix: 'prefab sleeve grouting topping slab winter concrete release segment',
      processConstraintExpected: true,
    }
  }
  return null
}

function taskTitleForScenario(scenario: string, index: number, processWork?: SyntheticStandardWork | null) {
  const building = cycle(['B1#', 'B2#', 'B3#'], index)
  const floor = (index % 26) + 1
  const titles: Record<string, string> = {
    earliest_external_unknown_blocker: `${building} ${floor}F masonry start condition unknown blocker`,
    resource_tower_crane_plum_rain: `${building} ${floor}F pile rig concrete pour tower crane same floor`,
    finishing_stagnation_dragon_boat: `${building} finishing closeout rectification 90 percent stagnant`,
    material_delay_heat_bottom_slab: `${building} mass concrete bottom slab material delayed extreme heat`,
    progress_quality_rollback_heat: `${building} facade coating progress rollback quality anomaly extreme heat`,
    same_zone_parallel_typhoon: `${building} ${floor}F concrete pouring tower crane high wind same zone`,
    spring_festival_zero_progress: `${building} post festival remobilization zero progress masonry`,
    schedule_state_accelerating: `${building} standard floor rebar binding organized acceleration`,
    summer_roof_outdoor_heat: `${building} roof membrane waterproof outdoor road network summer heat`,
    exterior_coating_spring_rain: `${building} facade exterior coating spring rain humidity`,
    roof_membrane_spring_rain: `${building} roof membrane waterproof spring rain work window`,
    exterior_coating_plum_rain: `${building} exterior coating plum rain persistent humidity`,
    curtain_wall_plum_rain_wind: `${building} curtain wall facade installation plum rain strong wind`,
    exterior_coating_summer_heat: `${building} exterior coating outdoor summer heat`,
    curtain_wall_typhoon_wind: `${building} curtain wall facade installation typhoon high wind`,
    multi_factor_cap: `${building} public area decoration closeout material delay same zone stagnant 90 percent`,
    compensated_mature_execution: `${building} clear weather catch-up overtime standard floor`,
    prefab_mixed_building_pattern: `${building} ${floor}F PC precast slab sleeve grouting cast in place core post cast joint tower standard floor`,
    normal_structural_cycle: `${building} ${floor}F concrete standard floor cycle rebar formwork`,
  }
  const baseTitle = titles[scenario] ?? titles.normal_structural_cycle
  return processWork?.processConstraintTitleSuffix
    ? `${baseTitle} ${processWork.processConstraintTitleSuffix}`
    : baseTitle
}

function standardWorkForScenario(scenario: string, businessUnit?: SyntheticBusinessUnit): SyntheticStandardWork {
  const processWork = businessUnit ? processConstraintWorkForBusinessUnit(businessUnit) : null
  if (processWork) return processWork
  if (scenario.includes('roof')) return { code: 'roof_membrane_waterproof', name: 'roof membrane waterproof' }
  if (scenario.includes('facade')) return { code: 'exterior_coating', name: 'exterior coating' }
  if (scenario.includes('curtain_wall')) return { code: 'curtain_wall_installation', name: 'curtain wall facade high wind' }
  if (scenario === 'resource_tower_crane_plum_rain') return { code: 'pile_foundation', name: 'bored pile foundation rainy season' }
  if (scenario.includes('pile')) return { code: 'pile_foundation', name: 'pile foundation' }
  if (scenario.includes('decoration') || scenario.includes('finishing')) return { code: 'fine_decoration', name: 'fine decoration closeout' }
  if (scenario.includes('prefab')) return { code: 'PFB-01-01-02', name: 'PC precast slab sleeve grouting' }
  if (scenario.includes('masonry')) return { code: 'masonry', name: 'masonry work' }
  if (scenario === 'same_zone_parallel_typhoon') return { code: 'curtain_wall_installation', name: 'curtain wall facade high wind' }
  return { code: 'concrete_pour', name: 'concrete pouring' }
}

function progressForScenario(scenario: string, index: number) {
  if (scenario === 'spring_festival_zero_progress') return 0
  if (scenario === 'multi_factor_cap' || scenario === 'finishing_stagnation_dragon_boat') return 90
  if (scenario === 'progress_quality_rollback_heat') return 55
  if (scenario === 'schedule_state_accelerating' || scenario === 'compensated_mature_execution') return 72
  return 12 + (index % 7) * 8
}

function plannedStartForTask(startDate: string, monthIndex: number, index: number) {
  return addDays(startDate, monthIndex * 30 + (index % 20))
}

function plannedStartForScenario(scenario: string, nominalStart: string, index: number) {
  if (scenario === 'spring_festival_zero_progress') {
    const year = new Date(`${nominalStart}T00:00:00.000Z`).getUTCFullYear()
    const springFestivalWindow = buildForecastWorkCalendarRecords(year)
      .filter((record) => String(record.holidayCode).includes('spring_festival'))
      .filter((record) => Number(record.month) === 2)
      .sort((left, right) => String(left.startDate).localeCompare(String(right.startDate)))[0]
    const start = springFestivalWindow?.startDate ?? `${year}-02-06`
    const end = springFestivalWindow?.endDate ?? addDays(start, 7)
    const spanDays = inclusiveDurationDays(start, end) ?? 1
    return addDays(start, index % Math.max(1, spanDays))
  }
  if (scenario === 'schedule_state_accelerating') return addDays('2027-03-08', index % 8)
  if (scenario === 'summer_roof_outdoor_heat') return addDays('2027-07-08', index % 8)
  if (scenario === 'multi_factor_cap') return addDays('2027-09-01', index % 5)
  if (scenario === 'compensated_mature_execution') return addDays(`${nominalStart.slice(0, 7)}-22`, index % 5)
  return nominalStart
}

function buildTaskRows(options: Required<Pick<MiniHighFidelityDatasetOptions, 'projectId' | 'taskCount' | 'startDate' | 'months'>>) {
  const tasks: Row[] = []
  const stressCases: MiniHighFidelitySyntheticDataset['stressCases'] = []
  for (let index = 0; index < options.taskCount; index += 1) {
    const businessUnit = syntheticBusinessUnitForIndex(index, options.taskCount)
    const taskMonthIndex = compactMonthIndex(index, options.taskCount, options.months)
    const nominalStart = plannedStartForTask(options.startDate, taskMonthIndex, index)
    const scenario = scenarioForMonth(monthKey(nominalStart), index)
    const start = plannedStartForScenario(scenario, nominalStart, index)
    const month = monthKey(start)
    const duration = scenario === 'multi_factor_cap' ? 10 : scenario.includes('foundation') ? 18 : 14 + (index % 5)
    const standardWork = standardWorkForScenario(scenario, businessUnit)
    const taskId = `hf-task-${String(index + 1).padStart(3, '0')}`
    const progress = progressForScenario(scenario, index)
    const actualStartDate = progress > 0
      ? scenario === 'multi_factor_cap'
        ? addDays(start, 7)
        : start
      : null
    const climateMetadata = scopedClimateMetadata(businessUnit, month)
    const methodVariantCodes = Array.from(new Set([
      ...(businessUnit.metadata.methodVariantCodes ?? []),
      ...(scenario.includes('prefab') ? ['prefabricated_concrete'] : []),
    ]))
    const metadata = {
      scenario,
      businessType: businessUnit.businessType,
      unitId: businessUnit.unitId,
      workEnvironment: scenario.includes('roof') || scenario.includes('facade') || scenario.includes('curtain_wall') || scenario.includes('pile') ? 'outdoor' : 'mixed',
      durationContributionMode: 'duration_bearing',
      methodVariantCodes: methodVariantCodes.length > 0 ? methodVariantCodes : undefined,
      elementVariantCodes: businessUnit.metadata.elementVariantCodes,
      projectTypeCode: businessUnit.metadata.projectTypeCode,
      structureTypeCode: businessUnit.metadata.structureTypeCode,
      spaceCleanlinessGrade: businessUnit.metadata.spaceCleanlinessGrade,
      dangerControlLevel: businessUnit.metadata.dangerControlLevel,
      ...climateMetadata,
      scopeDimensions: ['building', 'floor', 'zone', 'phase'],
      rhythmDrivers: scenario.includes('prefab') ? ['standard_floor_cycle', 'factory_site_flow'] : ['standard_floor_cycle'],
    }
    tasks.push({
      id: taskId,
      project_id: options.projectId,
      title: taskTitleForScenario(scenario, index, standardWork),
      planned_start_date: start,
      planned_end_date: plannedEnd(start, duration),
      start_date: start,
      end_date: plannedEnd(start, duration),
      actual_start_date: actualStartDate,
      actual_end_date: null,
      progress,
      status: progress > 0 ? 'in_progress' : 'not_started',
      planned_quantity: 100,
      completed_quantity: progress,
      quantity_unit: 'unit',
      standard_work_code: standardWork.code,
      standard_work_name: standardWork.name,
      building_object_id: businessUnit.unitId,
      floor_object_id: `floor-${(index % 26) + 1}`,
      physical_zone_object_id: cycle(['zone-east', 'zone-west', 'zone-core'], index),
      participant_unit_id: `${businessUnit.unitId}-unit-${cycle(['structure', 'decoration', 'mep', 'general'], index)}`,
      acceptance_required: scenario.includes('finishing') || scenario.includes('decoration'),
      material_required: scenario.includes('material') || scenario === 'multi_factor_cap',
      standard_task_metadata: metadata,
    })
    if ([
      'multi_factor_cap',
      'spring_festival_zero_progress',
      'schedule_state_accelerating',
      'prefab_mixed_building_pattern',
      'progress_quality_rollback_heat',
      'same_zone_parallel_typhoon',
      'summer_roof_outdoor_heat',
      'exterior_coating_spring_rain',
      'roof_membrane_spring_rain',
      'exterior_coating_plum_rain',
      'curtain_wall_plum_rain_wind',
      'exterior_coating_summer_heat',
      'curtain_wall_typhoon_wind',
      'compensated_mature_execution',
    ].includes(scenario)) {
      stressCases.push({
        taskId,
        scenarioCode: scenario,
        month,
        expectedSignals: [
          'duration_context',
          'building_pattern',
          ...(standardWork.processConstraintExpected ? ['process_constraint'] : []),
          ...(expectedExternalReadinessScenarioCodes.has(scenario) ? ['external_readiness'] : []),
        ],
      })
    }
  }
  return { tasks, stressCases }
}

const expectedExternalReadinessScenarioCodes = new Set([
  'earliest_external_unknown_blocker',
  'resource_tower_crane_plum_rain',
  'finishing_stagnation_dragon_boat',
  'material_delay_heat_bottom_slab',
  'progress_quality_rollback_heat',
  'same_zone_parallel_typhoon',
  'spring_festival_zero_progress',
  'summer_roof_outdoor_heat',
  'multi_factor_cap',
  'prefab_mixed_building_pattern',
])

function buildProgressSnapshots(tasks: Row[], options: { mode?: 'weekly' | 'daily'; months?: number } = {}) {
  const rows: Row[] = []
  const mode = options.mode ?? 'weekly'
  for (const task of tasks) {
    const taskId = String(task.id)
    const start = String(task.planned_start_date)
    const progress = Number(task.progress ?? 0)
    const scenario = String((task.standard_task_metadata as Row)?.scenario ?? '')
    const stepCount = mode === 'daily' ? Math.max(30, Math.trunc(options.months ?? 18) * 30) : 16
    const dayStep = mode === 'daily' ? 1 : 7
    for (let step = 0; step < stepCount; step += 1) {
      const date = addDays(start, step * dayStep)
      let value = progress <= 0 ? 0 : clamp(Math.round(progress * (step + 1) / stepCount), 0, progress)
      if (scenario === 'multi_factor_cap' && step >= Math.floor(stepCount * 0.7)) value = step < Math.floor(stepCount * 0.88) ? 88 : 90
      if (scenario === 'finishing_stagnation_dragon_boat' && step >= Math.floor(stepCount * 0.65)) value = 89
      if (scenario === 'progress_quality_rollback_heat' && step === Math.floor(stepCount * 0.75)) value = Math.max(0, value - 18)
      rows.push({
        task_id: taskId,
        project_id: task.project_id,
        progress: value,
        snapshot_date: date,
        created_at: `${date}T08:00:00.000Z`,
        event_source: scenario === 'progress_quality_rollback_heat' && step === Math.floor(stepCount * 0.75) ? 'manual_backfill' : 'daily_snapshot',
        notes: scenario,
      })
    }
  }
  return rows
}

function buildReadinessRows(tasks: Row[]) {
  const conditions: Row[] = []
  const obstacles: Row[] = []
  const materials: Row[] = []
  for (const task of tasks) {
    const taskId = String(task.id)
    const projectId = String(task.project_id)
    const scenario = String((task.standard_task_metadata as Row)?.scenario ?? '')
    const start = String(task.planned_start_date)
    if (scenario === 'earliest_external_unknown_blocker' || scenario === 'spring_festival_zero_progress') {
      conditions.push({
        id: `cond-${taskId}`,
        project_id: projectId,
        task_id: taskId,
        status: 'pending',
        is_satisfied: false,
        condition_type: 'drawing',
        blocking_level: 'hard',
        required_for_start: true,
        source_type: 'drawing',
        target_date: addDays(start, 5),
        created_at: `${start}T08:00:00.000Z`,
        title: 'drawing readiness gate',
      })
    }
    if (scenario === 'spring_festival_zero_progress') {
      const materialId = `labor-${taskId}`
      conditions.push({
        id: `cond-${materialId}`,
        project_id: projectId,
        task_id: taskId,
        status: 'pending',
        is_satisfied: false,
        condition_type: 'labor',
        blocking_level: 'hard',
        required_for_start: true,
        source_type: 'project_material',
        source_ref_id: materialId,
        target_date: addDays(start, 8),
        created_at: `${start}T08:00:00.000Z`,
        title: 'post-festival labor remobilization gate',
      })
      materials.push({
        id: materialId,
        project_id: projectId,
        linked_task_id: taskId,
        expected_arrival_date: addDays(start, 8),
        actual_arrival_date: null,
        record_status: 'active',
        lifecycle_status: 'active',
      })
      obstacles.push({
        id: `obs-labor-${taskId}`,
        project_id: projectId,
        task_id: taskId,
        status: 'active',
        obstacle_type: 'labor remobilization',
        blocking_level: 'hard',
        impact_level: 'blocked',
        progress_impact_level: 'blocked',
        severity: 'critical',
        estimated_resolve_date: addDays(start, 8),
        created_at: `${start}T08:00:00.000Z`,
        title: 'post-festival labor return blocker',
      })
    }
    if (scenario === 'material_delay_heat_bottom_slab' || scenario === 'multi_factor_cap') {
      const materialId = `mat-${taskId}`
      conditions.push({
        id: `cond-${materialId}`,
        project_id: projectId,
        task_id: taskId,
        status: 'pending',
        is_satisfied: false,
        condition_type: 'material',
        blocking_level: 'hard',
        required_for_start: true,
        source_type: 'project_material',
        source_ref_id: materialId,
        target_date: addDays(start, 8),
        created_at: `${start}T08:00:00.000Z`,
        title: 'material arrival gate',
      })
      materials.push({
        id: materialId,
        project_id: projectId,
        linked_task_id: null,
        expected_arrival_date: addDays(start, scenario === 'multi_factor_cap' ? 12 : 8),
        actual_arrival_date: null,
        record_status: 'active',
        lifecycle_status: 'active',
      })
    }
    if ([
      'resource_tower_crane_plum_rain',
      'same_zone_parallel_typhoon',
      'summer_roof_outdoor_heat',
      'progress_quality_rollback_heat',
      'prefab_mixed_building_pattern',
      'curtain_wall_plum_rain_wind',
      'exterior_coating_plum_rain',
      'exterior_coating_spring_rain',
      'roof_membrane_spring_rain',
    ].includes(scenario)) {
      conditions.push({
        id: `cond-workface-${taskId}`,
        project_id: projectId,
        task_id: taskId,
        status: 'pending',
        is_satisfied: false,
      condition_type: scenario.includes('roof') || scenario.includes('facade') || scenario.includes('curtain_wall') ? 'weather_window' : 'workface',
        blocking_level: scenario === 'prefab_mixed_building_pattern' ? 'soft' : 'hard',
        required_for_start: true,
        source_type: 'context',
        target_date: addDays(start, scenario === 'prefab_mixed_building_pattern' ? 2 : 4),
        created_at: `${start}T08:00:00.000Z`,
        title: 'synthetic weather/workface readiness gate',
      })
    }
    if ([
      'resource_tower_crane_plum_rain',
      'same_zone_parallel_typhoon',
      'summer_roof_outdoor_heat',
      'progress_quality_rollback_heat',
      'curtain_wall_plum_rain_wind',
      'exterior_coating_plum_rain',
    ].includes(scenario)) {
      obstacles.push({
        id: `obs-weather-${taskId}`,
        project_id: projectId,
        task_id: taskId,
        status: 'active',
        obstacle_type: scenario.includes('roof') || scenario.includes('facade') || scenario.includes('curtain_wall') ? 'weather window' : 'workface coordination',
        blocking_level: 'medium',
        impact_level: 'partial',
        progress_impact_level: 'partial',
        severity: 'high',
        estimated_resolve_date: addDays(start, 4),
        created_at: `${start}T08:00:00.000Z`,
        title: 'synthetic weather/workface obstacle',
      })
    }
    if (scenario === 'finishing_stagnation_dragon_boat' || scenario === 'multi_factor_cap') {
      obstacles.push({
        id: `obs-${taskId}`,
        project_id: projectId,
        task_id: taskId,
        status: 'active',
        obstacle_type: 'rectification',
        blocking_level: 'hard',
        impact_level: 'blocked',
        progress_impact_level: 'blocked',
        severity: 'critical',
        estimated_resolve_date: addDays(start, 7),
        created_at: `${start}T08:00:00.000Z`,
        title: 'closeout rectification blocker',
      })
    }
  }
  return { conditions, obstacles, materials }
}

function buildDataQualityFindings(tasks: Row[]) {
  return tasks
    .filter((task) => String((task.standard_task_metadata as Row)?.scenario ?? '') === 'progress_quality_rollback_heat')
    .map((task) => ({
      id: `dq-${task.id}`,
      project_id: task.project_id,
      task_id: task.id,
      rule_code: 'PROGRESS_ROLLBACK',
      severity: 'critical',
      status: 'open',
      summary: 'Synthetic rollback signal for progress quality suppression.',
      details_json: { source: 'high_fidelity_synthetic' },
    }))
}

function buildWeatherForecasts(projectId: string, startDate: string, months: number) {
  const rows: Row[] = []
  const cityConfigs = [
    { cityKey: 'hangzhou', city: '杭州' },
    { cityKey: 'harbin', city: '哈尔滨' },
    { cityKey: 'guangzhou', city: '广州' },
  ] as const
  for (const cityConfig of cityConfigs) {
    for (let offset = 0; offset < months * 30; offset += 1) {
      const date = addDays(startDate, offset)
      const month = monthKey(date)
      const monthNumber = Number(month.slice(5, 7))
      const day = Number(date.slice(8, 10))
      let maxTemp = 28
      let minTemp = 18
      let precipitation = 0
      let humidity = 72
      let windLevel = '3'
      const warningTags: string[] = []

      if (cityConfig.cityKey === 'harbin') {
        maxTemp = [11, 12, 1, 2, 3].includes(monthNumber) ? -6 : monthNumber === 4 ? 7 : 22
        minTemp = [11, 12, 1, 2, 3].includes(monthNumber) ? -18 : monthNumber === 4 ? -2 : 12
        humidity = [11, 12, 1, 2, 3].includes(monthNumber) ? 58 : 68
        if ([11, 12, 1, 2, 3].includes(monthNumber)) {
          precipitation = day % 4 === 0 ? 6 : 0
          warningTags.push('low temperature', 'snow ice', 'winter shutdown')
        }
        if (monthNumber === 4) warningTags.push('freeze thaw')
      } else if (cityConfig.cityKey === 'guangzhou') {
        maxTemp = [7, 8, 9].includes(monthNumber) ? 38 : 30
        minTemp = [2, 3, 4].includes(monthNumber) ? 18 : 24
        humidity = [2, 3, 4].includes(monthNumber) ? 96 : 82
        if ([2, 3, 4].includes(monthNumber)) warningTags.push('persistent_humidity', 'returning damp')
        if ([4, 5, 6, 7, 8, 9].includes(monthNumber)) {
          precipitation = day <= 20 ? 28 : 12
          warningTags.push('heavy rain')
        }
        if ([7, 8, 9].includes(monthNumber) && day >= 10 && day <= 18) {
          windLevel = '8'
          warningTags.push('red typhoon', 'strong wind')
        }
      } else {
        if (['2026-05', '2026-06', '2027-05', '2027-06', '2028-04', '2028-05', '2028-06', '2029-04', '2029-05', '2029-06'].includes(month) && day <= 20) {
          precipitation = month.endsWith('-06') ? 35 : 22
          humidity = 92
          warningTags.push('heavy rain', 'persistent_humidity')
        }
        if (['2026-07', '2026-08', '2027-07', '2027-08', '2028-07', '2028-08', '2029-07', '2029-08'].includes(month)) {
          maxTemp = day <= 12 ? 41 : 38
          minTemp = 29
          warningTags.push('extreme heat')
        }
        if (['2026-09', '2027-08', '2027-09', '2028-08', '2028-09', '2029-08', '2029-09'].includes(month) && day >= 12 && day <= 18) {
          windLevel = day % 2 === 0 ? '8' : '6'
          warningTags.push('strong wind', 'typhoon peripheral')
        }
        if (['2027-06', '2028-06', '2029-06'].includes(month) && day >= 12 && day <= 14) {
          windLevel = '6'
          warningTags.push('strong wind', 'plum rain wind window')
        }
        if (month.endsWith('-02') && day >= 8 && day <= 25) {
          maxTemp = 4
          minTemp = -4
          warningTags.push('low temperature', 'snow ice')
        }
      }

      rows.push({
        project_id: projectId,
        city: cityConfig.city,
        city_key: cityConfig.cityKey,
        forecast_date: date,
        min_temp_c: minTemp,
        max_temp_c: maxTemp,
        precipitation_mm: precipitation,
        relative_humidity_percent: humidity,
        snow_depth_cm: cityConfig.cityKey === 'harbin' && [11, 12, 1, 2, 3].includes(monthNumber) && day % 5 === 0 ? 5 : 0,
        wind_level: windLevel,
        warning_tags: warningTags,
        provider: 'configured_reference',
        source_url: 'https://example.test/synthetic-weather',
        raw_payload: { scenarioVersion: SCENARIO_VERSION, cityKey: cityConfig.cityKey },
      })
    }
  }
  return rows
}

function buildDurationExperienceSamples(projectId: string, sampleCount = 64) {
  const rows: Row[] = []
  for (let index = 0; index < Math.max(0, Math.trunc(sampleCount)); index += 1) {
    const planned = 10 + (index % 8)
    const efficiency = index % 5 === 0 ? 0.94 : 0.88
    rows.push({
      id: `dur-sample-${index + 1}`,
      project_id: projectId,
      task_id: `sample-task-${index + 1}`,
      planned_duration: planned,
      actual_duration: Math.max(1, Math.round(planned * efficiency)),
      sample_strength: index % 4 === 0 ? 'medium' : 'strong',
      sample_status: 'active',
      confidence_level: index % 6 === 0 ? 'medium' : 'high',
      included_in_benchmark: true,
      duration_calibration_source: 'high_fidelity_synthetic',
      completed_at: addDays('2027-03-01', index * 4),
      created_at: `${addDays('2027-03-01', index * 4)}T08:00:00.000Z`,
      metadata: { scenarioVersion: SCENARIO_VERSION },
    })
  }
  return rows
}

function buildDailySnapshots(projectId: string, startDate: string, months: number) {
  const rows: Row[] = []
  const totalDays = months * 30
  for (let offset = 0; offset < totalDays; offset += 1) {
    const date = addDays(startDate, offset)
    const progress = round(clamp(offset / totalDays * 100, 0, 100), 2)
    const lifecycleDelayBase = Math.max(0, 22 - offset * 0.035)
    const rollingRecoveryDelay = Math.max(0, 12 - (offset % 180) * 0.07)
    const delayBase = Math.max(lifecycleDelayBase, rollingRecoveryDelay)
    rows.push({
      project_id: projectId,
      snapshot_date: date,
      overall_progress: progress,
      task_progress: progress,
      delay_days: round(delayBase),
      active_obstacle_count: Math.max(0, 10 - Math.floor(offset / 45)),
      pending_condition_count: Math.max(0, 16 - Math.floor(offset / 35)),
      active_risk_count: Math.max(0, 7 - Math.floor(offset / 70)),
      shifted_milestone_count: offset > 300 ? 1 : 3,
      critical_path_affected_tasks: offset > 330 ? 1 : 4,
      attention_required: offset % 31 === 0,
      metadata: { scenarioVersion: SCENARIO_VERSION },
    })
  }
  return rows
}

function buildScheduleStates(projectId: string) {
  const states = [
    buildProjectScheduleState({
      projectId,
      scopeType: 'project',
      scopeId: 'project',
      windowDays: 14,
      windowStartDate: '2027-03-01',
      windowEndDate: '2027-03-14',
      previous: {
        progressDeltaWeightedDays: 20,
        completedPlannedDurationDays: 15,
        completedTaskCount: 8,
        activeTaskCount: 40,
        updatedTaskCount: 36,
        snapshotCount: 14,
        parallelDensity: 1,
        blockerCount: 8,
        forecastDelayDays: 12,
        dataQualityScore: 0.86,
      },
      current: {
        progressDeltaWeightedDays: 36,
        completedPlannedDurationDays: 25,
        completedTaskCount: 16,
        criticalPathProgressDeltaWeightedDays: 8,
        criticalPathCompletedPlannedDurationDays: 6,
        milestoneProgressDeltaWeightedDays: 7,
        milestoneCompletedPlannedDurationDays: 4,
        standardFloorProgressDeltaWeightedDays: 10,
        standardFloorCompletedPlannedDurationDays: 8,
        activeTaskCount: 48,
        updatedTaskCount: 45,
        snapshotCount: 14,
        parallelDensity: 1.32,
        blockerCount: 4,
        clearedBlockerCount: 4,
        qualityAnomalyCount: 0,
        forecastDelayDays: 5,
        dataQualityScore: 0.9,
      },
    }),
    buildProjectScheduleState({
      projectId,
      scopeType: 'building',
      scopeId: 'Y1#',
      windowDays: 14,
      windowStartDate: '2027-03-01',
      windowEndDate: '2027-03-14',
      previous: {
        progressDeltaWeightedDays: 8,
        completedPlannedDurationDays: 5,
        completedTaskCount: 3,
        activeTaskCount: 15,
        updatedTaskCount: 12,
        snapshotCount: 14,
        parallelDensity: 1,
        blockerCount: 2,
        forecastDelayDays: 6,
        dataQualityScore: 0.82,
      },
      current: {
        progressDeltaWeightedDays: 16,
        completedPlannedDurationDays: 12,
        completedTaskCount: 7,
        standardFloorProgressDeltaWeightedDays: 8,
        standardFloorCompletedPlannedDurationDays: 5,
        activeTaskCount: 18,
        updatedTaskCount: 18,
        snapshotCount: 14,
        parallelDensity: 1.45,
        blockerCount: 1,
        clearedBlockerCount: 1,
        qualityAnomalyCount: 0,
        forecastDelayDays: 2,
        dataQualityScore: 0.87,
      },
    }),
    buildProjectScheduleState({
      projectId,
      scopeType: 'specialty',
      scopeId: 'mep',
      windowDays: 14,
      windowStartDate: '2027-03-01',
      windowEndDate: '2027-03-14',
      previous: {
        progressDeltaWeightedDays: 9,
        completedPlannedDurationDays: 8,
        completedTaskCount: 5,
        activeTaskCount: 18,
        updatedTaskCount: 16,
        snapshotCount: 14,
        parallelDensity: 1,
        blockerCount: 2,
        forecastDelayDays: 5,
        dataQualityScore: 0.82,
      },
      current: {
        progressDeltaWeightedDays: 4,
        completedPlannedDurationDays: 2,
        completedTaskCount: 2,
        activeTaskCount: 18,
        updatedTaskCount: 15,
        snapshotCount: 14,
        parallelDensity: 1.2,
        blockerCount: 5,
        hardBlockerCount: 1,
        qualityAnomalyCount: 0,
        resourcePressureScore: 9,
        forecastDelayDays: 9,
        dataQualityScore: 0.8,
      },
    }),
  ]
  return states.map(toProjectScheduleStateRow)
}

function buildClimateProfiles(projectId: string) {
  const shared = {
    project_id: projectId,
    confidence: 'high',
    location_consensus_status: 'city_consensus',
    observation_count: 3,
    distinct_user_count: 3,
    source: 'multi_user_location',
    resolved_at: '2026-04-01T00:00:00.000Z',
  }
  return [
    {
      ...shared,
      province: '浙江省',
      city: '杭州',
      admin_code: '330100',
      climate_region: 'east',
      thermal_zone: 'hot_summer_cold_winter',
      climate_tags: ['plum_rain', 'hot_humid_summer'],
      rainy_season_months: [5, 6, 7],
      high_temp_months: [7, 8],
      cold_weather_months: [12, 1, 2],
      typhoon_risk_level: 'medium',
      flood_season_months: [6, 7, 8, 9],
      winter_shutdown_risk_level: 'low',
      soft_soil_level: 2,
      mountain_terrain: false,
      terrain_difficulty_level: 0,
      seismic_intensity: 7,
      source_rule_id: 'synthetic-hangzhou',
      metadata: { scenarioVersion: SCENARIO_VERSION, cityKey: 'hangzhou' },
    },
    {
      ...shared,
      province: '黑龙江省',
      city: '哈尔滨',
      admin_code: '230100',
      climate_region: 'northeast',
      thermal_zone: 'severe_cold',
      climate_tags: ['severe_cold', 'snow_ice', 'freeze_thaw'],
      rainy_season_months: [7, 8],
      high_temp_months: [],
      cold_weather_months: [11, 12, 1, 2, 3],
      typhoon_risk_level: 'low',
      flood_season_months: [7, 8],
      winter_shutdown_risk_level: 'high',
      soft_soil_level: 1,
      mountain_terrain: false,
      terrain_difficulty_level: 1,
      seismic_intensity: 6,
      source_rule_id: 'synthetic-harbin',
      metadata: { scenarioVersion: SCENARIO_VERSION, cityKey: 'harbin' },
    },
    {
      ...shared,
      province: '广东省',
      city: '广州',
      admin_code: '440100',
      climate_region: 'south',
      thermal_zone: 'hot_summer_warm_winter',
      climate_tags: ['persistent_humidity', 'long_rainy_season', 'typhoon'],
      rainy_season_months: [4, 5, 6, 7, 8, 9],
      high_temp_months: [7, 8, 9],
      cold_weather_months: [],
      typhoon_risk_level: 'high',
      flood_season_months: [4, 5, 6, 7, 8, 9],
      winter_shutdown_risk_level: 'low',
      soft_soil_level: 2,
      mountain_terrain: false,
      terrain_difficulty_level: 0,
      seismic_intensity: 7,
      source_rule_id: 'synthetic-guangzhou',
      metadata: { scenarioVersion: SCENARIO_VERSION, cityKey: 'guangzhou' },
    },
  ]
}

function buildProjects(projectId: string) {
  return [{
    id: projectId,
    name: PROJECT_NAME,
    location: '浙江省杭州市',
  }]
}

export function generateMiniHighFidelitySyntheticDataset(
  options: MiniHighFidelityDatasetOptions = {},
): MiniHighFidelitySyntheticDataset {
  const projectId = options.projectId ?? 'synthetic-yuntaifu-mini'
  const taskCount = Math.max(24, Math.trunc(options.taskCount ?? 96))
  const startDate = options.startDate ?? '2026-04-01'
  const months = Math.max(3, Math.trunc(options.months ?? 18))
  const progressSnapshotMode = options.progressSnapshotMode ?? 'weekly'
  const durationExperienceSampleCount = Math.max(0, Math.trunc(options.durationExperienceSampleCount ?? 64))
  const { tasks, stressCases } = buildTaskRows({ projectId, taskCount, startDate, months })
  const readiness = buildReadinessRows(tasks)
  const tables: Record<string, Row[]> = {
    projects: buildProjects(projectId),
    project_climate_profiles: buildClimateProfiles(projectId),
    tasks,
    task_progress_snapshots: buildProgressSnapshots(tasks, { mode: progressSnapshotMode, months }),
    task_conditions: readiness.conditions,
    task_obstacles: readiness.obstacles,
    project_materials: readiness.materials,
    data_quality_findings: buildDataQualityFindings(tasks),
    project_weather_forecasts: buildWeatherForecasts(projectId, startDate, months),
    duration_experience_samples: buildDurationExperienceSamples(projectId, durationExperienceSampleCount),
    project_daily_snapshot: buildDailySnapshots(projectId, startDate, months),
    project_schedule_states: buildScheduleStates(projectId),
    task_dependencies: [],
    algorithm_seed_versions: [],
    algorithm_seed_records: [],
    algorithm_seed_overrides: [],
    project_productivity_compensation_calibrations: [],
    site_shutdown_events: [],
  }
  return {
    projectId,
    projectName: PROJECT_NAME,
    scenarioVersion: SCENARIO_VERSION,
    startDate,
    months,
    representativeContextCount: taskCount,
    tables,
    stressCases: stressCases.length > 0 ? stressCases : tasks.slice(0, 12).map((task) => ({
      taskId: String(task.id),
      scenarioCode: String((task.standard_task_metadata as Row)?.scenario ?? 'unknown'),
      month: monthKey(String(task.planned_start_date)),
      expectedSignals: ['duration_context'],
    })),
    groundTruth: {
      expectedLowProductivityMonths: ['2027-02', '2027-07'],
      expectedCompensatedMonths: ['2027-03', '2027-09'],
      expectedBuildingPatternTexts: [
        'PC precast slab sleeve grouting cast in place core post cast joint tower standard floor',
      ],
    },
  }
}

function selectStressCases(dataset: MiniHighFidelitySyntheticDataset, maxCases: number) {
  const byTask = new Map(dataset.stressCases.map((item) => [item.taskId, item]))
  const tasks = dataset.tables.tasks ?? []
  for (const task of tasks) {
    const taskId = String(task.id ?? '')
    if (!taskId || byTask.has(taskId)) continue
    byTask.set(taskId, {
      taskId,
      scenarioCode: String((task.standard_task_metadata as Row)?.scenario ?? 'normal'),
      month: monthKey(String(task.planned_start_date ?? '')),
      expectedSignals: ['duration_context'],
    })
  }
  const allCases = [...byTask.values()]
  const priority = new Set(dataset.stressCases.map((item) => item.taskId))
  allCases.sort((left, right) => Number(priority.has(right.taskId)) - Number(priority.has(left.taskId)) || left.month.localeCompare(right.month) || left.taskId.localeCompare(right.taskId))
  const limit = Math.max(1, maxCases)
  const selected: typeof allCases = []
  const selectedIds = new Set<string>()
  const add = (item: typeof allCases[number]) => {
    if (selectedIds.has(item.taskId) || selected.length >= limit) return
    selected.push(item)
    selectedIds.add(item.taskId)
  }
  const groups = new Map<string, typeof allCases>()
  for (const item of allCases) {
    const key = `${item.month}:${item.scenarioCode}`
    groups.set(key, [...(groups.get(key) ?? []), item])
  }
  for (const group of groups.values()) add(group[0]!)
  for (const item of allCases) add(item)
  return selected
}

function taskInputFromRow(task: Row): DurationContextInput {
  const metadata = asRecord(task.standard_task_metadata)
  const methodVariantCodes = readStringArray(
    metadata.methodVariantCodes
      ?? metadata.method_variant_codes
      ?? metadata.methodVariantCode
      ?? metadata.method_variant_code,
  )
  const elementVariantCodes = readStringArray(
    metadata.elementVariantCodes
      ?? metadata.element_variant_codes
      ?? metadata.elementVariantCode
      ?? metadata.element_variant_code,
  )
  return {
    taskId: String(task.id),
    projectId: String(task.project_id),
    taskTitle: String(task.title ?? ''),
    plannedStartDate: String(task.planned_start_date ?? ''),
    plannedEndDate: String(task.planned_end_date ?? ''),
    actualStartDate: task.actual_start_date ? String(task.actual_start_date) : null,
    actualEndDate: task.actual_end_date ? String(task.actual_end_date) : null,
    progress: Number(task.progress ?? 0),
    plannedQuantity: Number(task.planned_quantity ?? 0),
    completedQuantity: Number(task.completed_quantity ?? 0),
    quantityUnit: String(task.quantity_unit ?? ''),
    standardWorkCode: String(task.standard_work_code ?? ''),
    standardWorkName: String(task.standard_work_name ?? ''),
    buildingObjectId: String(task.building_object_id ?? ''),
    floorObjectId: String(task.floor_object_id ?? ''),
    zoneObjectId: String(task.physical_zone_object_id ?? task.functional_area_object_id ?? ''),
    responsibleUnitId: String(task.participant_unit_id ?? ''),
    standardTaskMetadata: metadata,
    methodVariantCodes: methodVariantCodes.length > 0 ? methodVariantCodes : null,
    elementVariantCodes: elementVariantCodes.length > 0 ? elementVariantCodes : null,
    projectTypeCode: String(metadata.projectTypeCode ?? metadata.project_type_code ?? 'residential'),
    structureTypeCode: String(metadata.structureTypeCode ?? metadata.structure_type_code ?? 'shear_wall'),
    durationSource: 'standard',
  }
}

function caseRuntimePlanFromItem(
  dataset: MiniHighFidelitySyntheticDataset,
  taskById: Map<string, Row>,
  item: MiniHighFidelitySyntheticDataset['stressCases'][number],
): CaseRuntimePlan | null {
  const task = taskById.get(item.taskId)
  if (!task) return null
  const input = taskInputFromRow(task)
  const taskMetadata = asRecord(task.standard_task_metadata)
  const scenarioCacheKey = typeof taskMetadata.scenario === 'string' && taskMetadata.scenario
    ? taskMetadata.scenario
    : String(task.title ?? '')
  const month = item.month || monthKey(String(task.planned_start_date ?? ''))
  const buildingPatternCacheKey = JSON.stringify({
    scenario: scenarioCacheKey,
    standardWorkCode: input.standardWorkCode,
    methodVariantCodes: input.methodVariantCodes,
    projectTypeCode: input.projectTypeCode,
    structureTypeCode: input.structureTypeCode,
  })
  const durationContextCacheKey = JSON.stringify(durationContextRepresentativeBucket({
    scenarioCode: scenarioCacheKey,
    month,
    workPackage: input.standardWorkCode || input.standardWorkName || scenarioCacheKey,
  }))
  return {
    item,
    task,
    input,
    month,
    scenarioCacheKey,
    buildingPatternCacheKey,
    durationContextCacheKey,
    buildingPatternText: String(task.title ?? ''),
    buildingPatternContext: {
      projectId: dataset.projectId,
      standardWorkCode: input.standardWorkCode,
      standardWorkCodes: [input.standardWorkCode].filter(Boolean) as string[],
      methodVariantCodes: input.methodVariantCodes,
      projectTypeCode: input.projectTypeCode,
      structureTypeCode: input.structureTypeCode,
      scopeDimensions: ['building', 'floor', 'zone', 'phase'],
      rhythmDrivers: ['standard_floor_cycle', 'method_variant'],
    },
  }
}

function cacheStatusForEntry<T>(entry: PromiseCacheEntry<T> | undefined): PromiseCacheStatus {
  if (!entry) return 'miss'
  return entry.settled ? 'settled_hit' : 'pending_hit'
}

function createPromiseCacheEntry<T>(promise: Promise<T>): PromiseCacheEntry<T> {
  const entry = { promise, settled: false }
  entry.promise.finally(() => {
    entry.settled = true
  }).catch(() => undefined)
  return entry
}

function getOrCreateBuildingPatternEntry(
  cache: Map<string, PromiseCacheEntry<V1474BuildingPatternMatches>>,
  deps: RunnerDeps,
  plan: CaseRuntimePlan,
) {
  const existing = cache.get(plan.buildingPatternCacheKey)
  if (existing) return existing
  const entry = createPromiseCacheEntry(deps.resolveBuildingPatternMatches(
    plan.buildingPatternText,
    plan.buildingPatternContext,
    { limit: 8 },
  ))
  cache.set(plan.buildingPatternCacheKey, entry)
  return entry
}

function getOrCreateDurationContextEntry(
  cache: Map<string, PromiseCacheEntry<DurationContextSummary>>,
  deps: RunnerDeps,
  plan: CaseRuntimePlan,
) {
  const existing = cache.get(plan.durationContextCacheKey)
  if (existing) return existing
  const entry = createPromiseCacheEntry(deps.buildDurationContext(plan.input))
  cache.set(plan.durationContextCacheKey, entry)
  return entry
}

async function prewarmRepresentativeCaches(
  plans: CaseRuntimePlan[],
  deps: RunnerDeps,
  caches: {
    buildingPatternCache: Map<string, PromiseCacheEntry<V1474BuildingPatternMatches>>
    durationContextCache: Map<string, PromiseCacheEntry<DurationContextSummary>>
  },
) {
  const buildingPatternPlans = [...new Map(plans.map((plan) => [plan.buildingPatternCacheKey, plan])).values()]
  const durationContextPlans = [...new Map(plans.map((plan) => [plan.durationContextCacheKey, plan])).values()]
  await runWithConcurrency(buildingPatternPlans, REPRESENTATIVE_PREWARM_CONCURRENCY, async (plan) => {
    await getOrCreateBuildingPatternEntry(caches.buildingPatternCache, deps, plan).promise
  })
  await runWithConcurrency(durationContextPlans, REPRESENTATIVE_PREWARM_CONCURRENCY, async (plan) => {
    await getOrCreateDurationContextEntry(caches.durationContextCache, deps, plan).promise
  })
}

function summarizeCoverage(result: MiniHighFidelityStressResult, context: DurationContextSummary, buildingPatterns: V1474BuildingPatternMatches) {
  const factorKeys = new Set(context.factors.map((factor) => factor.key))
  for (const key of factorKeys) {
    result.ruleCoverage[key] = (result.ruleCoverage[key] ?? 0) + 1
  }
  if (buildingPatterns.length > 0) {
    result.ruleCoverage.building_pattern = (result.ruleCoverage.building_pattern ?? 0) + 1
  }
  for (const match of buildingPatterns) {
    for (const code of match.mergedPatternCodes ?? [match.patternCode].filter(Boolean) as string[]) {
      result.buildingPatternCoverage[code] = (result.buildingPatternCoverage[code] ?? 0) + 1
    }
  }
}

function summarizeObservations(
  result: MiniHighFidelityStressResult,
  context: DurationContextSummary,
  item: MiniHighFidelitySyntheticDataset['stressCases'][number],
) {
  const candidateScenario = readRecord(context.calculationContext.candidate_duration_context)
  const committedCapHit = context.calculationContext.extra_days_cap_applied === true
  const candidateRawExtraDays = Number(candidateScenario.rawExtraDays ?? 0)
  const candidateExtraDays = Number(candidateScenario.extraDays ?? 0)
  const candidateCapHit = Number.isFinite(candidateRawExtraDays)
    && Number.isFinite(candidateExtraDays)
    && candidateRawExtraDays > candidateExtraDays
  if (committedCapHit || candidateCapHit) result.observations.extraDaysCapHitCount += 1
  if (context.calculationContext.velocity_skipped_due_to_zero_progress) result.observations.velocitySkippedDueToZeroProgressCount += 1
  if (context.calculationContext.building_pattern_weighted_mid_floor_days) result.observations.weightedBuildingPatternCycleCount += 1
  if (context.calculationContext.productivity_compensation_applied) result.observations.productivityCompensationAppliedCount += 1
  if (context.calculationContext.pm_recovery_applied) result.observations.pmRecoveryCompensationAppliedCount += 1
  if (context.calculationContext.climate_cap_applied) result.observations.climateCapAppliedCount += 1
  if (context.hasLowConfidenceSignal) result.observations.lowConfidenceCount += 1
  if (item.expectedSignals.includes('external_readiness')) {
    result.observations.externalReadinessExpectedCaseCount += 1
    if (context.factors.some((factor) => factor.key === 'external_readiness')) {
      result.observations.externalReadinessExpectedHitCount += 1
    }
  }
  const stateFactor = context.factors.find((factor) => factor.key === 'project_schedule_state')
  const stateMetadata = readRecord(stateFactor?.metadata)
  const state = String(stateMetadata.state ?? '')
  const downstreamPolicy = readRecord(stateMetadata.downstreamPolicy)
  if (
    state === 'accelerating'
    || state === 'recovery'
    || Number(stateMetadata.localAccelerationFactor ?? downstreamPolicy.localAccelerationFactor ?? 1) < 0.999
    || downstreamPolicy.canAdjustRemainingDuration === true
  ) {
    result.observations.scheduleStateAccelerationSignalCount += 1
  }
  const applicableStates = (stateFactor?.metadata as Row | undefined)?.applicableStates
  if (Array.isArray(applicableStates) && applicableStates.length >= 2) {
    result.observations.scheduleStateCombinationCount += 1
  }
}

function plannedDurationDaysFromInput(input: DurationContextInput) {
  if (!input.plannedStartDate || !input.plannedEndDate) return null
  return orderedInclusiveDurationDays(input.plannedStartDate, input.plannedEndDate)
}

function durationContextRepresentativeBucket(input: {
  scenarioCode: string
  month: string
  workPackage: string
}) {
  const scenario = input.scenarioCode
  const monthNumber = Number(input.month.slice(5, 7))
  const monthBucket = monthNumber === 2
    ? 'february_calendar'
    : [4, 5, 6].includes(monthNumber)
      ? 'spring_rain'
      : [7, 8].includes(monthNumber)
        ? 'summer_heat'
        : [9].includes(monthNumber)
          ? 'typhoon_transition'
          : [11, 12, 1].includes(monthNumber)
            ? 'winter_transition'
            : 'normal'
  if (
    scenario === 'prefab_mixed_building_pattern'
    || scenario === 'normal_structural_cycle'
    || scenario === 'schedule_state_accelerating'
  ) {
    return {
      scenario,
      workPackage: input.workPackage,
      monthBucket,
      weatherBucket: 'non_weather_representative_context',
    }
  }
  if (scenario === 'compensated_mature_execution') {
    return {
      scenario,
      workPackage: input.workPackage,
      monthBucket,
      weatherBucket: 'non_weather_representative_context',
    }
  }
  if (scenario.includes('plum_rain') || scenario.includes('spring_rain')) {
    return {
      scenario,
      workPackage: input.workPackage,
      weatherBucket: 'rain_window',
    }
  }
  if (scenario.includes('heat')) {
    return {
      scenario,
      workPackage: input.workPackage,
      weatherBucket: 'heat_window',
    }
  }
  if (scenario.includes('typhoon') || scenario.includes('wind')) {
    return {
      scenario,
      workPackage: input.workPackage,
      weatherBucket: 'wind_window',
    }
  }
  if (scenario.includes('spring_festival')) {
    return {
      scenario,
      month: input.month,
      workPackage: input.workPackage,
      weatherBucket: 'spring_festival_calendar_window',
    }
  }
  return {
    scenario,
    month: input.month,
    workPackage: input.workPackage,
  }
}

function productivityFromContext(context: DurationContextSummary, input: DurationContextInput) {
  const plannedDuration = plannedDurationDaysFromInput(input)
  if (!plannedDuration) return round(clamp(1 / Math.max(0.01, context.multiplier), 0, PRODUCTIVITY_OUTPUT_SAFETY_MAX))
  const adjustedDuration = Math.max(1, plannedDuration * Math.max(0.01, context.multiplier) + Math.max(0, context.extraDays))
  return round(clamp(plannedDuration / adjustedDuration, 0, PRODUCTIVITY_OUTPUT_SAFETY_MAX))
}

function independentProductivityFromContext(context: DurationContextSummary, input: DurationContextInput) {
  const plannedDuration = plannedDurationDaysFromInput(input)
  const summary = summarizeEffectiveDurationContextContributions(context, {
    excludeFactorKeys: ['productivity_compensation', 'pm_recovery_compensation'],
  })
  const independentMultiplier = summary.multiplier
  const independentExtraDays = summary.extraDays
  if (!plannedDuration) return round(clamp(1 / Math.max(0.01, independentMultiplier), 0, 1))
  const cappedExtraDays = Math.min(Math.max(1, Math.ceil(plannedDuration)), independentExtraDays)
  const adjustedDuration = Math.max(1, plannedDuration * Math.max(0.01, independentMultiplier) + cappedExtraDays)
  return round(clamp(plannedDuration / adjustedDuration, 0, 1))
}

function buildCaseNotes(context: DurationContextSummary) {
  const notes: string[] = []
  const candidateScenario = readRecord(context.calculationContext.candidate_duration_context)
  const candidateRawExtraDays = Number(candidateScenario.rawExtraDays ?? 0)
  const candidateExtraDays = Number(candidateScenario.extraDays ?? 0)
  const candidateCapHit = Number.isFinite(candidateRawExtraDays)
    && Number.isFinite(candidateExtraDays)
    && candidateRawExtraDays > candidateExtraDays
  if (context.calculationContext.extra_days_cap_applied || candidateCapHit) notes.push('extra_days_cap_applied')
  if (context.calculationContext.productivity_compensation_applied) notes.push('productivity_compensation_applied')
  if (context.calculationContext.pm_recovery_applied) notes.push('pm_recovery_compensation_applied')
  if (context.calculationContext.velocity_skipped_due_to_zero_progress) notes.push('velocity_skipped_due_to_zero_progress')
  if (context.calculationContext.project_schedule_state_resource_relaxation) notes.push('resource_pressure_relaxed_by_schedule_state')
  if (context.calculationContext.building_pattern_weighted_mid_floor_days) notes.push('weighted_building_pattern_cycle_days')
  return notes
}

function summarizeProductivitySignal(result: MiniHighFidelityStressResult, productivity: number) {
  if (productivity > 1) {
    result.observations.accelerationProductivitySignalCount += 1
    result.observations.finalProductivityAboveOneCount += 1
  }
  if (productivity > 1.15) result.observations.strongAccelerationProductivitySignalCount += 1
  if (productivity >= PRODUCTIVITY_OUTPUT_SAFETY_MAX) result.observations.overcompressionProductivityWarningCount += 1
}

function hasCompensationSignal(
  context: DurationContextSummary,
  compensatedProductivity: number,
  independentProductivity: number,
) {
  const factors = context.factors as Array<{ key?: string }>
  return Boolean(
    compensatedProductivity - independentProductivity > 0.005
    || context.calculationContext.productivity_compensation_applied
    || context.calculationContext.pm_recovery_applied
    || factors.some((factor) => factor.key === 'productivity_compensation' || factor.key === 'pm_recovery_compensation'),
  )
}

function hasScheduleStateAccelerationSignal(context: DurationContextSummary) {
  const stateFactor = context.factors.find((factor) => factor.key === 'project_schedule_state')
  const metadata = readRecord(stateFactor?.metadata)
  const downstreamPolicy = readRecord(metadata.downstreamPolicy)
  const state = String(metadata.state ?? '')
  return state === 'accelerating'
    || state === 'recovery'
    || Number(metadata.localAccelerationFactor ?? downstreamPolicy.localAccelerationFactor ?? 1) < 0.999
    || downstreamPolicy.canAdjustRemainingDuration === true
}

function isRainySeasonImpactedContext(context: DurationContextSummary, scenarioCode: string) {
  const climateTexts = context.factors
    .filter((factor) => (
      factor.key === 'seasonal_productivity'
      || factor.key === 'process_seasonal_sensitivity'
      || factor.key === 'weather_forecast_impact'
    ))
    .flatMap((factor) => {
      const metadata = readRecord(factor.metadata)
      const coupling = readRecord(metadata.weatherStaticCoupling)
      return [
        factor.key,
        factor.label,
        factor.reason,
        metadata.climateSignal,
        metadata.monthlyClimateSignal,
        metadata.impactType,
        metadata.impactBand,
        metadata.stableCode,
        metadata.processSeasonalStableCode,
        coupling.weatherSignal,
        coupling.weatherImpactBand,
        coupling.processImpactBand,
      ]
    })
    .map((value) => String(value ?? '').toLowerCase())
  const scenario = scenarioCode.toLowerCase()
  return scenario.includes('plum_rain')
    || climateTexts.some((text) => (
      text.includes('rainy_season')
      || text.includes('rain_blocks_work')
      || text.includes('persistent_humidity')
      || text.includes('heavy_rain')
      || text.includes('plum_rain')
    ))
}

function createEmptyResult(dataset: MiniHighFidelitySyntheticDataset): MiniHighFidelityStressResult {
  return {
    projectId: dataset.projectId,
    scenarioVersion: dataset.scenarioVersion,
    datasetProfile: {
      taskCount: dataset.tables.tasks?.length ?? 0,
      progressSnapshotCount: dataset.tables.task_progress_snapshots?.length ?? 0,
      weatherForecastCount: dataset.tables.project_weather_forecasts?.length ?? 0,
      durationExperienceSampleCount: dataset.tables.duration_experience_samples?.length ?? 0,
      scheduleStateCount: dataset.tables.project_schedule_states?.length ?? 0,
      dataQualityFindingCount: dataset.tables.data_quality_findings?.length ?? 0,
    },
    executedCaseCount: 0,
    ruleCoverage: {
      seasonal_productivity: 0,
      process_seasonal_sensitivity: 0,
      weather_forecast_impact: 0,
      process_constraint: 0,
      external_readiness: 0,
      resource_conflict: 0,
      progress_velocity: 0,
      progress_quality: 0,
      workflow_sequence: 0,
      project_schedule_state: 0,
      productivity_compensation: 0,
      project_baseline_calibration: 0,
      building_pattern: 0,
    },
    monthlyProductivity: {},
    monthlyProductivityIndependent: {},
    monthlyProductivityCompensated: {},
    monthlyProductivityStats: {},
    monthlyImpactedProductivityStats: {},
    monthlyCompensationUplift: {},
    observations: {
      extraDaysCapHitCount: 0,
      velocitySkippedDueToZeroProgressCount: 0,
      weightedBuildingPatternCycleCount: 0,
      scheduleStateCombinationCount: 0,
      productivityCompensationAppliedCount: 0,
      pmRecoveryCompensationAppliedCount: 0,
      climateCapAppliedCount: 0,
      accelerationProductivitySignalCount: 0,
      finalProductivityAboveOneCount: 0,
      scheduleStateAccelerationSignalCount: 0,
      strongAccelerationProductivitySignalCount: 0,
      overcompressionProductivityWarningCount: 0,
      externalReadinessExpectedCaseCount: 0,
      externalReadinessExpectedHitCount: 0,
      lowConfidenceCount: 0,
    },
    buildingPatternCoverage: {},
    scenarioFindings: [],
    performance: {
      totalMs: 0,
      averageCaseMs: 0,
      maxCaseMs: 0,
      slowCaseTopN: [],
      scenarioPerformance: [],
      cacheDiagnostics: {
        durationContextMissCount: 0,
        durationContextPendingHitCount: 0,
        durationContextSettledHitCount: 0,
        buildingPatternMissCount: 0,
        buildingPatternPendingHitCount: 0,
        buildingPatternSettledHitCount: 0,
      },
      projectedFullScaleHours2500x540: 0,
      projectedRepresentativeContextHours: 0,
      representativeContextCount: 0,
      sourceProgressSnapshotRows: dataset.tables.task_progress_snapshots?.length ?? 0,
      projectionBasis: 'not_measured',
      cacheOptimizationPolicy: 'scenario_month_work_package_context_cache_v2',
    },
  }
}

function installFixedClock(asOfDate?: string | Date) {
  if (!asOfDate) return null
  const fixedDate = new Date(asOfDate)
  if (Number.isNaN(fixedDate.getTime())) return null
  const RealDate = Date
  const fixedTime = fixedDate.getTime()
  const FixedDate = class extends RealDate {
    constructor(
      value?: string | number | Date,
      monthIndex?: number,
      date?: number,
      hours?: number,
      minutes?: number,
      seconds?: number,
      ms?: number,
    ) {
      if (arguments.length === 0) {
        super(fixedTime)
      } else if (arguments.length === 1) {
        super(value as string | number | Date)
      } else {
        super(
          value as number,
          monthIndex as number,
          date ?? 1,
          hours ?? 0,
          minutes ?? 0,
          seconds ?? 0,
          ms ?? 0,
        )
      }
    }

    static now() {
      return fixedTime
    }
  }
  globalThis.Date = FixedDate as DateConstructor
  return () => {
    globalThis.Date = RealDate
  }
}

async function runWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R | null>,
) {
  const results: Array<R | null> = new Array(items.length).fill(null)
  let cursor = 0
  const workerCount = Math.max(1, Math.min(items.length, Math.trunc(concurrency)))
  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (cursor < items.length) {
      const index = cursor
      cursor += 1
      results[index] = await worker(items[index]!, index)
    }
  }))
  return results.filter((item): item is R => item != null)
}

export async function runMiniHighFidelitySyntheticStressTest(
  dataset: MiniHighFidelitySyntheticDataset,
  deps: RunnerDeps,
  options: RunnerOptions = {},
): Promise<MiniHighFidelityStressResult> {
  const restoreClock = installFixedClock(options.asOfDate)
  const cases = selectStressCases(dataset, options.maxCases ?? 40)
  const taskById = new Map((dataset.tables.tasks ?? []).map((task) => [String(task.id), task]))
  const casePlans = cases
    .map((item) => caseRuntimePlanFromItem(dataset, taskById, item))
    .filter((plan): plan is CaseRuntimePlan => plan != null)
  const result = createEmptyResult(dataset)
  const monthly: Record<string, number[]> = {}
  const monthlyIndependent: Record<string, number[]> = {}
  const monthlyCompensated: Record<string, number[]> = {}
  const monthlyCompensationSignals: Record<string, number[]> = {}
  const monthlyScheduleStateAccelerationSignals: Record<string, number[]> = {}
  const monthlyCompensationUpliftSamples: Record<string, number[]> = {}
  const monthlyImpacted: Record<string, number[]> = {}
  const startTime = performance.now()
  const buildingPatternCache = new Map<string, PromiseCacheEntry<V1474BuildingPatternMatches>>()
  const durationContextCache = new Map<string, PromiseCacheEntry<DurationContextSummary>>()

  try {
    const shouldPrewarmRepresentativeCaches = casePlans.length >= REPRESENTATIVE_PREWARM_CASE_THRESHOLD
    if (shouldPrewarmRepresentativeCaches) {
      await prewarmRepresentativeCaches(casePlans, deps, {
        buildingPatternCache,
        durationContextCache,
      })
      result.performance.cacheOptimizationPolicy = 'scenario_month_work_package_context_cache_v3_with_representative_prewarm'
    }

    const findings = await runWithConcurrency(casePlans, options.concurrency ?? 8, async (plan) => {
      const { item, task, input, month } = plan
      const caseStart = performance.now()
      const buildingPatternEntryBefore = buildingPatternCache.get(plan.buildingPatternCacheKey)
      const buildingPatternCacheStatus = cacheStatusForEntry(buildingPatternEntryBefore)
      const buildingPatternEntry = getOrCreateBuildingPatternEntry(buildingPatternCache, deps, plan)
      const durationContextEntryBefore = durationContextCache.get(plan.durationContextCacheKey)
      const durationContextCacheStatus = cacheStatusForEntry(durationContextEntryBefore)
      const durationContextEntry = getOrCreateDurationContextEntry(durationContextCache, deps, plan)
      const durationContextPromise = durationContextEntry.promise
      const buildingPatternPromise = buildingPatternEntry.promise
      const durationContextTimedPromise = (async () => {
        const waitStart = performance.now()
        const value = await durationContextPromise
        return { value, waitMs: performance.now() - waitStart }
      })()
      const buildingPatternTimedPromise = (async () => {
        const waitStart = performance.now()
        const value = await buildingPatternPromise
        return { value, waitMs: performance.now() - waitStart }
      })()
      const [contextResult, buildingPatternResult] = await Promise.all([
        durationContextTimedPromise,
        buildingPatternTimedPromise,
      ])
      const context = contextResult.value
      const buildingPatterns = buildingPatternResult.value
      const durationContextWaitMs = contextResult.waitMs
      const buildingPatternWaitMs = buildingPatternResult.waitMs
      const elapsed = performance.now() - caseStart
      summarizeCoverage(result, context, buildingPatterns)
      summarizeObservations(result, context, item)

      const compensatedProductivity = productivityFromContext(context, input)
      const independentProductivity = independentProductivityFromContext(context, input)
      const compensationUplift = round(Math.max(0, compensatedProductivity - independentProductivity), 3)
      const compensationSignal = hasCompensationSignal(context, compensatedProductivity, independentProductivity)
      const scheduleStateAccelerationSignal = hasScheduleStateAccelerationSignal(context)
      const productivity = compensatedProductivity
      summarizeProductivitySignal(result, productivity)
      monthly[month] = [...(monthly[month] ?? []), productivity]
      monthlyIndependent[month] = [...(monthlyIndependent[month] ?? []), independentProductivity]
      monthlyCompensated[month] = [...(monthlyCompensated[month] ?? []), compensatedProductivity]
      monthlyCompensationSignals[month] = [...(monthlyCompensationSignals[month] ?? []), compensationSignal ? 1 : 0]
      monthlyScheduleStateAccelerationSignals[month] = [...(monthlyScheduleStateAccelerationSignals[month] ?? []), scheduleStateAccelerationSignal ? 1 : 0]
      monthlyCompensationUpliftSamples[month] = [...(monthlyCompensationUpliftSamples[month] ?? []), compensationUplift]
      if (isRainySeasonImpactedContext(context, item.scenarioCode)) {
        monthlyImpacted[month] = [...(monthlyImpacted[month] ?? []), productivity]
      }
      const factorKeys = context.factors.map((factor) => factor.key)
      const buildingPatternCodes = Array.from(new Set(buildingPatterns.flatMap((match) => match.mergedPatternCodes ?? [match.patternCode].filter(Boolean) as string[])))
      return {
        scenarioCode: item.scenarioCode,
        taskId: item.taskId,
        month,
        multiplier: context.multiplier,
        productivity,
        independentProductivity,
        compensationUplift,
        compensationSignal,
        scheduleStateAccelerationSignal,
        finalProductivityAboveOne: productivity > 1,
        extraDays: context.extraDays,
        adjustedBy: context.adjustedBy,
        factorKeys,
        buildingPatternCodes,
        notes: buildCaseNotes(context),
        elapsedMs: elapsed,
        durationContextCacheStatus,
        durationContextWaitMs,
        buildingPatternCacheStatus,
        buildingPatternWaitMs,
        cacheSharedWaitLikely: durationContextCacheStatus === 'pending_hit' || buildingPatternCacheStatus === 'pending_hit',
      }
    })
    result.executedCaseCount = findings.length
    result.scenarioFindings = findings.map(({
      elapsedMs: _elapsedMs,
      durationContextCacheStatus: _durationContextCacheStatus,
      durationContextWaitMs: _durationContextWaitMs,
      buildingPatternCacheStatus: _buildingPatternCacheStatus,
      buildingPatternWaitMs: _buildingPatternWaitMs,
      cacheSharedWaitLikely: _cacheSharedWaitLikely,
      ...finding
    }) => finding)
    result.performance.maxCaseMs = round(findings.reduce((max, finding) => Math.max(max, finding.elapsedMs), 0), 2)
    result.performance.slowCaseTopN = [...findings]
      .sort((left, right) => right.elapsedMs - left.elapsedMs)
      .slice(0, 10)
      .map((finding) => ({
        taskId: finding.taskId,
        month: finding.month,
        scenarioCode: finding.scenarioCode,
        elapsedMs: round(finding.elapsedMs, 2),
        durationContextCacheStatus: finding.durationContextCacheStatus,
        durationContextWaitMs: round(finding.durationContextWaitMs, 2),
        buildingPatternCacheStatus: finding.buildingPatternCacheStatus,
        buildingPatternWaitMs: round(finding.buildingPatternWaitMs, 2),
        cacheSharedWaitLikely: finding.cacheSharedWaitLikely,
        factorKeys: finding.factorKeys,
        productivity: finding.productivity,
        multiplier: finding.multiplier,
        extraDays: finding.extraDays,
      }))

    const scenarioPerformance = new Map<string, {
      count: number
      totalMs: number
      maxMs: number
      durationContextWaitTotalMs: number
      durationContextWaitMaxMs: number
      pendingDurationContextCacheHitCount: number
      durationContextCacheMissCount: number
    }>()
    for (const finding of findings) {
      const current = scenarioPerformance.get(finding.scenarioCode) ?? {
        count: 0,
        totalMs: 0,
        maxMs: 0,
        durationContextWaitTotalMs: 0,
        durationContextWaitMaxMs: 0,
        pendingDurationContextCacheHitCount: 0,
        durationContextCacheMissCount: 0,
      }
      current.count += 1
      current.totalMs += finding.elapsedMs
      current.maxMs = Math.max(current.maxMs, finding.elapsedMs)
      current.durationContextWaitTotalMs += finding.durationContextWaitMs
      current.durationContextWaitMaxMs = Math.max(current.durationContextWaitMaxMs, finding.durationContextWaitMs)
      if (finding.durationContextCacheStatus === 'pending_hit') current.pendingDurationContextCacheHitCount += 1
      if (finding.durationContextCacheStatus === 'miss') current.durationContextCacheMissCount += 1
      scenarioPerformance.set(finding.scenarioCode, current)
    }
    result.performance.scenarioPerformance = [...scenarioPerformance.entries()]
      .map(([scenarioCode, stats]) => ({
        scenarioCode,
        caseCount: stats.count,
        averageMs: round(stats.totalMs / Math.max(1, stats.count), 2),
        maxMs: round(stats.maxMs, 2),
        averageDurationContextWaitMs: round(stats.durationContextWaitTotalMs / Math.max(1, stats.count), 2),
        maxDurationContextWaitMs: round(stats.durationContextWaitMaxMs, 2),
        pendingDurationContextCacheHitCount: stats.pendingDurationContextCacheHitCount,
        durationContextCacheMissCount: stats.durationContextCacheMissCount,
      }))
      .sort((left, right) => right.maxMs - left.maxMs || right.averageMs - left.averageMs || left.scenarioCode.localeCompare(right.scenarioCode))

    result.performance.cacheDiagnostics = findings.reduce((summary, finding) => {
      if (finding.durationContextCacheStatus === 'miss') summary.durationContextMissCount += 1
      if (finding.durationContextCacheStatus === 'pending_hit') summary.durationContextPendingHitCount += 1
      if (finding.durationContextCacheStatus === 'settled_hit') summary.durationContextSettledHitCount += 1
      if (finding.buildingPatternCacheStatus === 'miss') summary.buildingPatternMissCount += 1
      if (finding.buildingPatternCacheStatus === 'pending_hit') summary.buildingPatternPendingHitCount += 1
      if (finding.buildingPatternCacheStatus === 'settled_hit') summary.buildingPatternSettledHitCount += 1
      return summary
    }, {
      durationContextMissCount: 0,
      durationContextPendingHitCount: 0,
      durationContextSettledHitCount: 0,
      buildingPatternMissCount: 0,
      buildingPatternPendingHitCount: 0,
      buildingPatternSettledHitCount: 0,
    })

    for (const [month, values] of Object.entries(monthly)) {
      const compensationSignals = monthlyCompensationSignals[month] ?? []
      const scheduleStateSignals = monthlyScheduleStateAccelerationSignals[month] ?? []
      const compensationUplifts = monthlyCompensationUpliftSamples[month] ?? []
      result.monthlyProductivity[month] = round(values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length), 2)
      result.monthlyProductivityStats[month] = {
        maxP: round(Math.max(...values), 3),
        minP: round(Math.min(...values), 3),
        p90: round(percentile(values, 0.9), 3),
        accelerationCaseRatio: round(values.filter((value) => value > 1).length / Math.max(1, values.length), 3),
        compensationSignalRatio: round(compensationSignals.reduce((sum, value) => sum + value, 0) / Math.max(1, compensationSignals.length), 3),
        scheduleStateAccelerationRatio: round(scheduleStateSignals.reduce((sum, value) => sum + value, 0) / Math.max(1, scheduleStateSignals.length), 3),
        averageCompensationUplift: round(compensationUplifts.reduce((sum, value) => sum + value, 0) / Math.max(1, compensationUplifts.length), 3),
        maxCompensationUplift: round(Math.max(0, ...compensationUplifts), 3),
        caseCount: values.length,
      }
    }
    for (const [month, values] of Object.entries(monthlyImpacted)) {
      result.monthlyImpactedProductivityStats[month] = {
        climateSignal: 'rainy_season',
        averageP: round(values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length), 3),
        maxP: round(Math.max(...values), 3),
        minP: round(Math.min(...values), 3),
        p90: round(percentile(values, 0.9), 3),
        caseCount: values.length,
      }
    }
    for (const [month, values] of Object.entries(monthlyIndependent)) {
      result.monthlyProductivityIndependent[month] = round(values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length), 2)
    }
    for (const [month, values] of Object.entries(monthlyCompensated)) {
      result.monthlyProductivityCompensated[month] = round(values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length), 2)
    }
    for (const month of Object.keys(result.monthlyProductivityCompensated)) {
      result.monthlyCompensationUplift[month] = round(
        (result.monthlyProductivityCompensated[month] ?? 0) - (result.monthlyProductivityIndependent[month] ?? 0),
        3,
      )
    }
  } finally {
    restoreClock?.()
  }
  result.performance.totalMs = round(performance.now() - startTime, 2)
  result.performance.averageCaseMs = round(result.performance.totalMs / Math.max(1, result.executedCaseCount), 2)
  result.performance.sourceProgressSnapshotRows = dataset.tables.task_progress_snapshots?.length ?? 0
  result.performance.representativeContextCount = Math.min(FULL_SCALE_TASK_COUNT, Math.max(result.executedCaseCount, dataset.representativeContextCount))
  result.performance.projectedRepresentativeContextHours = round((result.performance.representativeContextCount * result.performance.averageCaseMs) / 3_600_000, 4)
  result.performance.projectedFullScaleHours2500x540 = round((FULL_SCALE_TASK_COUNT * result.performance.averageCaseMs) / 3_600_000, 2)
  result.performance.projectionBasis = 'representative_task_contexts_only_with_scenario_cache; progress snapshots are high-fidelity source data volume, not per-day duration-context executions'
  return result
}

function formatCoverage(result: MiniHighFidelityStressResult) {
  return Object.entries(result.ruleCoverage)
    .filter(([, count]) => count > 0)
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([key, count]) => `- ${key}: ${count}`)
    .join('\n')
}

function formatMonthlyProductivity(result: MiniHighFidelityStressResult) {
  return Object.entries(result.monthlyProductivity)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([month, value]) => `- ${month}: ${value}`)
    .join('\n')
}

function formatMonthlySeries(values: Record<string, number>) {
  return Object.entries(values)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([month, value]) => `- ${month}: ${value}`)
    .join('\n')
}

function formatMonthlyProductivityDiagnostics(result: MiniHighFidelityStressResult) {
  return Object.entries(result.monthlyProductivityStats)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([month, stats]) => {
      const uplift = result.monthlyCompensationUplift[month] ?? 0
      return `- ${month}: maxP=${stats.maxP}, minP=${stats.minP}, p90=${stats.p90}, accelerationCaseRatio=${stats.accelerationCaseRatio}, compensationSignalRatio=${stats.compensationSignalRatio}, scheduleStateAccelerationRatio=${stats.scheduleStateAccelerationRatio}, averageCompensationUplift=${stats.averageCompensationUplift}, maxCompensationUplift=${stats.maxCompensationUplift}, compensationUplift=${uplift}, caseCount=${stats.caseCount}`
    })
    .join('\n')
}

function formatMonthlyImpactedProductivity(result: MiniHighFidelityStressResult) {
  return Object.entries(result.monthlyImpactedProductivityStats)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([month, stats]) => `- ${month}: climateSignal=${stats.climateSignal}, averageP=${stats.averageP}, maxP=${stats.maxP}, minP=${stats.minP}, p90=${stats.p90}, caseCount=${stats.caseCount}`)
    .join('\n')
}

function formatSlowCaseTopN(result: MiniHighFidelityStressResult) {
  return result.performance.slowCaseTopN
    .map((item) => `- ${item.month} ${item.scenarioCode} ${item.taskId}: elapsedMs=${item.elapsedMs}, durationCache=${item.durationContextCacheStatus}/${item.durationContextWaitMs}ms, buildingPatternCache=${item.buildingPatternCacheStatus}/${item.buildingPatternWaitMs}ms, sharedWait=${item.cacheSharedWaitLikely}, P=${item.productivity}, multiplier=${item.multiplier}, extraDays=${item.extraDays}, factors=${item.factorKeys.join(',')}`)
    .join('\n')
}

function formatScenarioPerformance(result: MiniHighFidelityStressResult) {
  return result.performance.scenarioPerformance
    .map((item) => `- ${item.scenarioCode}: cases=${item.caseCount}, avgMs=${item.averageMs}, maxMs=${item.maxMs}, avgDurationWaitMs=${item.averageDurationContextWaitMs}, maxDurationWaitMs=${item.maxDurationContextWaitMs}, durationPendingHits=${item.pendingDurationContextCacheHitCount}, durationMisses=${item.durationContextCacheMissCount}`)
    .join('\n')
}

export function summarizeMiniHighFidelityStressReport(result: MiniHighFidelityStressResult) {
  const topFindings = result.scenarioFindings
    .slice(0, 12)
    .map((finding) => `- ${finding.month} ${finding.scenarioCode}: P=${finding.productivity}, extraDays=${finding.extraDays}, factors=${finding.factorKeys.join(',')}`)
    .join('\n')
  return [
    '# Mini High-Fidelity Synthetic Stress Test',
    '',
    `Project: ${result.projectId}`,
    `Scenario version: ${result.scenarioVersion}`,
    `Executed cases: ${result.executedCaseCount}`,
    '',
    '## Dataset',
    `- tasks: ${result.datasetProfile.taskCount}`,
    `- progress snapshots: ${result.datasetProfile.progressSnapshotCount}`,
    `- weather forecasts: ${result.datasetProfile.weatherForecastCount}`,
    `- duration samples: ${result.datasetProfile.durationExperienceSampleCount}`,
    `- schedule states: ${result.datasetProfile.scheduleStateCount}`,
    '',
    '## Rule Coverage',
    formatCoverage(result),
    '',
    '## Monthly Productivity',
    formatMonthlyProductivity(result),
    '',
    '## Monthly Productivity (Independent)',
    formatMonthlySeries(result.monthlyProductivityIndependent),
    '',
    '## Monthly Productivity (Compensated)',
    formatMonthlySeries(result.monthlyProductivityCompensated),
    '',
    '## Monthly Productivity Diagnostics',
    formatMonthlyProductivityDiagnostics(result),
    '',
    '## Monthly Impacted Productivity Diagnostics',
    formatMonthlyImpactedProductivity(result),
    '',
    '## Observations',
    `- extraDays cap hits: ${result.observations.extraDaysCapHitCount}`,
    `- zero-progress velocity skips: ${result.observations.velocitySkippedDueToZeroProgressCount}`,
    `- weighted building-pattern cycle hits: ${result.observations.weightedBuildingPatternCycleCount}`,
    `- schedule-state combinations: ${result.observations.scheduleStateCombinationCount}`,
    `- productivity compensation applied: ${result.observations.productivityCompensationAppliedCount}`,
    `- pm recovery compensation applied: ${result.observations.pmRecoveryCompensationAppliedCount}`,
    `- acceleration productivity signals: ${result.observations.accelerationProductivitySignalCount}`,
    `- final productivity > 1 signals: ${result.observations.finalProductivityAboveOneCount}`,
    `- schedule-state acceleration signals: ${result.observations.scheduleStateAccelerationSignalCount}`,
    `- strong acceleration productivity signals: ${result.observations.strongAccelerationProductivitySignalCount}`,
    `- overcompression productivity warnings: ${result.observations.overcompressionProductivityWarningCount}`,
    `- external readiness expected hits: ${result.observations.externalReadinessExpectedHitCount}/${result.observations.externalReadinessExpectedCaseCount}`,
    '',
    '## Representative Cases',
    topFindings,
    '',
    '## Slow Case TopN',
    formatSlowCaseTopN(result),
    '',
    '## Scenario Performance',
    formatScenarioPerformance(result),
    '',
    '## Performance',
    `- totalMs: ${result.performance.totalMs}`,
    `- averageCaseMs: ${result.performance.averageCaseMs}`,
    `- maxCaseMs: ${result.performance.maxCaseMs}`,
    `- projectedFullScaleHours2500x540: ${result.performance.projectedFullScaleHours2500x540}`,
    `- projectedRepresentativeContextHours: ${result.performance.projectedRepresentativeContextHours}`,
    `- representativeContextCount: ${result.performance.representativeContextCount}`,
    `- sourceProgressSnapshotRows: ${result.performance.sourceProgressSnapshotRows}`,
    `- cacheDiagnostics: ${JSON.stringify(result.performance.cacheDiagnostics)}`,
    `- projectionBasis: ${result.performance.projectionBasis}`,
    '',
  ].join('\n')
}

export async function writeMiniHighFidelityStressArtifacts(
  result: MiniHighFidelityStressResult,
  options: {
    outputDir?: string
    fileBase?: string
  } = {},
) {
  const outputDir = options.outputDir ?? path.resolve(process.cwd(), 'artifacts/reports')
  const fileBase = options.fileBase ?? `high-fidelity-synthetic-stress-mini-${new Date().toISOString().slice(0, 10)}`
  const markdownPath = path.join(outputDir, `${fileBase}.md`)
  const jsonPath = path.join(outputDir, `${fileBase}.json`)
  await mkdir(outputDir, { recursive: true })
  await writeFile(markdownPath, summarizeMiniHighFidelityStressReport(result), 'utf8')
  await writeFile(jsonPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8')
  return { markdownPath, jsonPath }
}
