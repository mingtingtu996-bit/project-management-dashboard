import {
  inferExecutionProfileFromProjectFacts,
  isLowRiseMultiBuildingParallelScenario,
  normalizeProjectScenarioMethodCode,
  type BuildingPatternExecutionArchetype,
  type BuildingPatternExecutionArchetypeProfile,
  type ProjectScenarioFacts,
} from './projectScenarioTaxonomyService.js'

export type StandardWorkDurationScaleBasis =
  | 'none'
  | 'workface'
  | 'floor'
  | 'building'
  | 'area'
  | 'volume'
  | 'tonnage'
  | 'system'
  | 'shaft'
  | string

export type StandardWorkDurationSeedRule = {
  stableCode?: string | null
  standardWorkCode?: string | null
  scaleBasis?: StandardWorkDurationScaleBasis | null
  defaultQuantity?: number | null
  variableDays?: number
  defaultDaysP50?: number
  [key: string]: unknown
}

export type DurationProjectFactScaleProfile = {
  businessType?: string | null
  projectTypeCode?: string | null
  structureTypeCode?: string | null
  templateStableCode?: string | null
  standardWorkCode?: string | null
  methodVariantCodes?: unknown[] | null
  buildingPatternCodes?: unknown[] | null
  totalAreaM2?: number | null
  basementAreaM2?: number | null
  buildingCount?: number | null
  standardFloorCount?: number | null
  highestBuildingFloorCount?: number | null
  basementLevelCount?: number | null
  foundationDepthM?: number | null
  prefabRate?: number | null
  towerCraneCount?: number | null
  constructionHoistCount?: number | null
  [key: string]: unknown
}

export type ProjectFactDurationScalingResult = {
  days: number
  applied: boolean
  factor: number
  quantity: number | null
  defaultQuantity: number | null
  basis: StandardWorkDurationSeedRule['scaleBasis'] | string | null
  source: string | null
  projectScaleRatio: number | null
  baseline: Record<string, unknown> | null
}

type ProjectFactDurationScaleProxy = {
  source: 'project_fact_scale_proxy'
  quantity: number
  defaultQuantity: number
  ratio: number
  baseline: Record<string, number | string | null>
}

type PrefabRateDurationFactor = {
  factor: number
  profile: string
}

type ConstructionSchedulePhaseKind =
  | 'foundation'
  | 'basement'
  | 'superstructure'
  | 'mep'
  | 'finishing'
  | 'facade'
  | 'commissioning'
  | 'outdoor'
  | 'control'
  | 'prefab'
  | 'general'

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

function readOptionalNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function normalizeRate01(value: unknown): number | null {
  const parsed = readOptionalNumber(value)
  if (parsed === null || parsed <= 0) return null
  return clampNumber(parsed > 1 ? parsed / 100 : parsed, 0, 1)
}

function normalizeCodeArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return [...new Set(value.map((item) => normalizeText(item).toLowerCase()).filter(Boolean))]
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}

function toProjectScenarioFacts(featureProfile: DurationProjectFactScaleProfile): ProjectScenarioFacts {
  return {
    businessType: featureProfile.businessType,
    projectTypeCode: featureProfile.projectTypeCode,
    structureTypeCode: featureProfile.structureTypeCode,
    methodVariantCodes: normalizeCodeArray(featureProfile.methodVariantCodes),
    buildingPatternCodes: normalizeCodeArray(featureProfile.buildingPatternCodes),
    projectFeatures: readRecord(featureProfile.projectFeatures),
    totalAreaM2: featureProfile.totalAreaM2,
    basementAreaM2: featureProfile.basementAreaM2,
    buildingCount: featureProfile.buildingCount,
    standardFloorCount: featureProfile.standardFloorCount,
    highestBuildingFloorCount: featureProfile.highestBuildingFloorCount,
    basementLevelCount: featureProfile.basementLevelCount,
    foundationDepthM: featureProfile.foundationDepthM,
    prefabRate: featureProfile.prefabRate,
  }
}

function normalizeFloorMethodCode(value: unknown) {
  const code = normalizeText(value).toLowerCase()
  if (code === 'aluminum_formwork') return 'aluminum_form_early_strip'
  if (code === 'large_formwork') return 'large_form'
  if (code === 'wood_formwork') return 'wood_form'
  if (code === 'climbing_formwork') return 'climbing_form'
  return code
}

function normalizeDurationMethodCode(value: unknown) {
  const normalized = normalizeProjectScenarioMethodCode(normalizeFloorMethodCode(value))
  if (normalized === 'aluminum_formwork') return 'aluminum_form_early_strip'
  if (normalized === 'large_formwork') return 'large_form'
  if (normalized === 'wood_formwork' || normalized === 'timber_formwork') return 'wood_form'
  if (normalized === 'prefab_concrete') return 'prefab'
  if (normalized === 'mic_modular') return 'mic'
  return normalized
}

function readSeedScaleQuantity(seedRule: StandardWorkDurationSeedRule, featureProfile: DurationProjectFactScaleProfile): number | null {
  const buildingCount = readOptionalNumber(featureProfile.buildingCount)
  const standardFloorCount = readOptionalNumber(featureProfile.standardFloorCount)
  const highestFloorCount = readOptionalNumber(featureProfile.highestBuildingFloorCount)
  const basementLevelCount = readOptionalNumber(featureProfile.basementLevelCount)
  const totalArea = readOptionalNumber(featureProfile.totalAreaM2)
  const basementArea = readOptionalNumber(featureProfile.basementAreaM2)
  const foundationDepth = readOptionalNumber(featureProfile.foundationDepthM)
  const towerCraneCount = readOptionalNumber(featureProfile.towerCraneCount)
  const constructionHoistCount = readOptionalNumber(featureProfile.constructionHoistCount)

  if (seedRule.scaleBasis === 'floor') {
    const floorCount = standardFloorCount ?? highestFloorCount
    if (floorCount && floorCount > 0) return floorCount
  }
  if (seedRule.scaleBasis === 'building' && buildingCount && buildingCount > 0) return buildingCount
  if (seedRule.scaleBasis === 'shaft') {
    const shaftCount = constructionHoistCount ?? towerCraneCount
    if (shaftCount && shaftCount > 0) return shaftCount
  }
  if (seedRule.scaleBasis === 'area') {
    const code = normalizeText(seedRule.stableCode).toLowerCase()
    if ((code.includes('basement') || code.includes('foundation') || code.includes('pit')) && basementArea && basementArea > 0) return basementArea
    if (totalArea && totalArea > 0) return totalArea
  }
  if (seedRule.scaleBasis === 'volume') {
    if (basementArea && foundationDepth && basementArea > 0 && foundationDepth > 0) return basementArea * foundationDepth
    if (totalArea && basementLevelCount && totalArea > 0 && basementLevelCount > 0) return totalArea * Math.min(basementLevelCount, 4) * 0.18
  }
  if (seedRule.scaleBasis === 'workface') {
    const workfaces = Math.max(1, Math.ceil((buildingCount ?? 1) * Math.max(1, Math.min(standardFloorCount ?? highestFloorCount ?? 1, 6)) / 3))
    if (workfaces > 1) return workfaces
  }
  if (seedRule.scaleBasis === 'system') {
    const systems = Math.max(1, Math.ceil((buildingCount ?? 1) / 2))
    if (systems > 1) return systems
  }
  return null
}

function readProjectFactScaleProxy(
  seedRule: StandardWorkDurationSeedRule,
  featureProfile: DurationProjectFactScaleProfile,
): ProjectFactDurationScaleProxy | null {
  const projectType = normalizeText(featureProfile.projectTypeCode ?? featureProfile.businessType).toLowerCase()
  const buildingCount = readOptionalNumber(featureProfile.buildingCount)
  const standardFloorCount = readOptionalNumber(featureProfile.standardFloorCount)
  const highestFloorCount = readOptionalNumber(featureProfile.highestBuildingFloorCount)
  const floorCount = standardFloorCount ?? highestFloorCount
  const basementLevelCount = readOptionalNumber(featureProfile.basementLevelCount)
  const totalArea = readOptionalNumber(featureProfile.totalAreaM2)
  const basementArea = readOptionalNumber(featureProfile.basementAreaM2)
  const foundationDepth = readOptionalNumber(featureProfile.foundationDepthM)
  const towerCraneCount = readOptionalNumber(featureProfile.towerCraneCount)
  const constructionHoistCount = readOptionalNumber(featureProfile.constructionHoistCount)

  const baselineArea = projectType.includes('commercial') || projectType.includes('hospital') || projectType.includes('public')
    ? 90_000
    : projectType.includes('industrial')
      ? 80_000
      : 120_000
  const baselineBuildings = 3
  const baselineFloors = projectType.includes('industrial') ? 6 : 26
  const baselineBasementArea = Math.max(18_000, baselineArea * 0.28)
  const baselineFoundationDepth = 7
  const floorRatio = floorCount && floorCount > 0 ? floorCount / baselineFloors : 1
  const buildingRatio = buildingCount && buildingCount > 0 ? buildingCount / baselineBuildings : 1
  const areaRatio = totalArea && totalArea > 0 ? totalArea / baselineArea : Math.max(0.35, buildingRatio * Math.max(0.45, floorRatio))
  const basementRatio = basementArea && basementArea > 0
    ? basementArea / baselineBasementArea
    : totalArea && basementLevelCount && basementLevelCount > 0
      ? (totalArea * Math.min(basementLevelCount, 4) * 0.18) / baselineBasementArea
      : areaRatio
  const depthRatio = foundationDepth && foundationDepth > 0 ? foundationDepth / baselineFoundationDepth : 1
  const sourceBaseline = {
    projectType: projectType || null,
    baselineAreaM2: baselineArea,
    baselineBuildingCount: baselineBuildings,
    baselineFloorCount: baselineFloors,
    baselineBasementAreaM2: Math.round(baselineBasementArea),
    baselineFoundationDepthM: baselineFoundationDepth,
  }

  let ratio: number | null = null
  let quantity = 1
  let defaultQuantity = 1
  if (seedRule.scaleBasis === 'area') {
    const code = normalizeText(seedRule.stableCode).toLowerCase()
    const usesBasementArea = code.includes('basement') || code.includes('foundation') || code.includes('pit')
    ratio = usesBasementArea
      ? basementRatio * Math.pow(depthRatio, 0.25)
      : areaRatio * Math.pow(floorRatio, 0.12) * Math.pow(buildingRatio, 0.08)
    quantity = usesBasementArea ? (basementArea ?? Math.round(basementRatio * baselineBasementArea)) : (totalArea ?? Math.round(areaRatio * baselineArea))
    defaultQuantity = usesBasementArea ? baselineBasementArea : baselineArea
  } else if (seedRule.scaleBasis === 'volume') {
    ratio = basementRatio * Math.pow(depthRatio, 0.45)
    quantity = basementArea && foundationDepth ? basementArea * foundationDepth : Math.round(ratio * baselineBasementArea * baselineFoundationDepth)
    defaultQuantity = baselineBasementArea * baselineFoundationDepth
  } else if (seedRule.scaleBasis === 'floor') {
    ratio = (floorCount && floorCount > 0 ? floorCount / baselineFloors : areaRatio) * Math.pow(buildingRatio, 0.35)
    quantity = floorCount ?? Math.round(ratio * baselineFloors)
    defaultQuantity = baselineFloors
  } else if (seedRule.scaleBasis === 'building') {
    ratio = buildingRatio
    quantity = buildingCount ?? Math.round(ratio * baselineBuildings)
    defaultQuantity = baselineBuildings
  } else if (seedRule.scaleBasis === 'shaft') {
    const shaftCount = constructionHoistCount ?? towerCraneCount ?? buildingCount
    if (shaftCount && shaftCount > 0) {
      ratio = shaftCount / baselineBuildings
      quantity = shaftCount
      defaultQuantity = baselineBuildings
    }
  } else if (seedRule.scaleBasis === 'workface') {
    ratio = Math.pow(areaRatio, 0.45) * Math.pow(buildingRatio, 0.3) * Math.pow(floorRatio, 0.18)
    quantity = Math.max(1, Math.round(ratio * 6))
    defaultQuantity = 6
  } else if (seedRule.scaleBasis === 'system') {
    ratio = Math.pow(buildingRatio, 0.35) * Math.pow(areaRatio, 0.2)
    quantity = Math.max(1, Math.round(ratio * 2))
    defaultQuantity = 2
  }

  if (!ratio || !Number.isFinite(ratio) || ratio <= 0) return null
  const clampedRatio = clampNumber(ratio, 0.35, 3.2)
  return {
    source: 'project_fact_scale_proxy',
    quantity,
    defaultQuantity,
    ratio: clampedRatio,
    baseline: sourceBaseline,
  }
}

function readExecutionProfileFromProjectFacts(featureProfile: DurationProjectFactScaleProfile): BuildingPatternExecutionArchetypeProfile {
  return inferExecutionProfileFromProjectFacts(toProjectScenarioFacts(featureProfile))
}

function executionProfileHasArchetype(
  profile: BuildingPatternExecutionArchetypeProfile,
  archetype: BuildingPatternExecutionArchetype,
) {
  return profile.primaryArchetype === archetype
    || profile.crossCuttingArchetypes.includes(archetype)
    || profile.allArchetypes.includes(archetype)
}

function inferSchedulePhaseKindFromText(value: unknown): ConstructionSchedulePhaseKind {
  const text = normalizeText(value).toLowerCase()
  if (!text) return 'general'
  if (text.includes('site') || text.includes('danger') || text.includes('quality') || text.includes('doc') || text.includes('milestone')) return 'control'
  if (text.includes('prefab') || text.includes('factory') || text.includes('module') || text.includes('mic') || text.includes('hoist')) return 'prefab'
  if (text.includes('foundation') || text.includes('pit') || text.includes('pile')) return 'foundation'
  if (text.includes('basement') || text.includes('waterproof')) return 'basement'
  if (text.includes('superstructure') || text.includes('structure-core') || text.includes('structure')) return 'superstructure'
  if (text.includes('mep') || text.includes('plumbing') || text.includes('electrical') || text.includes('hvac') || text.includes('fire')) return 'mep'
  if (text.includes('finish') || text.includes('decoration') || text.includes('fitout') || text.includes('interior')) return 'finishing'
  if (text.includes('facade') || text.includes('curtain') || text.includes('window')) return 'facade'
  if (text.includes('commission') || text.includes('acceptance') || text.includes('testing')) return 'commissioning'
  if (text.includes('outdoor') || text.includes('landscape') || text.includes('utility')) return 'outdoor'
  return 'general'
}

function readConstructionArchetypeDurationFactor(
  stableCodeValue: unknown,
  featureProfile: DurationProjectFactScaleProfile,
  scaleBasis: StandardWorkDurationSeedRule['scaleBasis'] | string | null,
) {
  const executionProfile = readExecutionProfileFromProjectFacts(featureProfile)
  const stableCode = normalizeText(stableCodeValue).toLowerCase()
  const phaseKind = inferSchedulePhaseKindFromText(stableCode)
  const floorCount = Math.max(
    readOptionalNumber(featureProfile.standardFloorCount) ?? 0,
    readOptionalNumber(featureProfile.highestBuildingFloorCount) ?? 0,
  )
  const compactLowRiseParallel = floorCount > 0 && floorCount <= 13
  const isMainDurationScope = stableCode.startsWith('01-')
    || stableCode.startsWith('02-')
    || stableCode.startsWith('03-')
    || stableCode.startsWith('04-')
    || stableCode.startsWith('05-')
    || stableCode.startsWith('06-')
    || stableCode.startsWith('07-')
    || stableCode.startsWith('08-')
    || stableCode.startsWith('10-')
    || stableCode.startsWith('fac-')
    || stableCode.startsWith('dec-')
    || stableCode.startsWith('plu-')
    || stableCode.startsWith('ele-')
    || stableCode.startsWith('hva-')
    || stableCode.startsWith('fir-')
    || stableCode.startsWith('int-')
    || stableCode.includes('bdt-')
    || scaleBasis === 'area'
    || scaleBasis === 'floor'
    || scaleBasis === 'workface'
    || scaleBasis === 'building'
    || scaleBasis === 'system'

  if (!isMainDurationScope) return null

  if (executionProfileHasArchetype(executionProfile, 'mic_modular_fast_track')) {
    return {
      factor: phaseKind === 'commissioning' ? 0.42 : phaseKind === 'mep' ? 0.36 : phaseKind === 'finishing' || phaseKind === 'facade' ? 0.34 : 0.26,
      profile: 'mic_modular_wet_work_replacement',
    }
  }
  if (executionProfileHasArchetype(executionProfile, 'steel_assembly_fast_track')) {
    return {
      factor: phaseKind === 'commissioning' ? 0.65 : phaseKind === 'mep' ? 0.55 : phaseKind === 'finishing' || phaseKind === 'facade' ? 0.52 : 0.58,
      profile: 'steel_assembly_wet_work_replacement',
    }
  }
  if (
    executionProfileHasArchetype(executionProfile, 'lowrise_multi_building_parallel')
    || isLowRiseMultiBuildingParallelScenario(toProjectScenarioFacts(featureProfile))
  ) {
    if (!compactLowRiseParallel) {
      return {
        factor: phaseKind === 'commissioning' ? 0.9 : phaseKind === 'mep' ? 0.95 : phaseKind === 'finishing' || phaseKind === 'facade' ? 0.88 : stableCode.startsWith('01-') ? 0.94 : 0.88,
        profile: 'midrise_multi_building_parallel_workfaces',
      }
    }
    return {
      factor: phaseKind === 'commissioning' ? 0.68 : phaseKind === 'mep' ? 0.78 : phaseKind === 'finishing' || phaseKind === 'facade' ? 0.7 : stableCode.startsWith('01-') ? 0.82 : 0.72,
      profile: 'lowrise_multi_building_parallel_workfaces',
    }
  }

  return null
}

function readPrefabRateFactorForStableCode(
  stableCodeValue: unknown,
  featureProfile: DurationProjectFactScaleProfile,
  scaleBasis: StandardWorkDurationSeedRule['scaleBasis'] | string | null,
): PrefabRateDurationFactor | null {
  const prefabRate = normalizeRate01(featureProfile.prefabRate)
  if (prefabRate === null) return null

  const stableCode = normalizeText(stableCodeValue).toLowerCase()
  const methodCodes = normalizeCodeArray(featureProfile.methodVariantCodes).map(normalizeDurationMethodCode)
  const isPrefabMethod = methodCodes.some((code) => code === 'prefab')
    || normalizeText(featureProfile.structureTypeCode).toLowerCase().includes('prefab')
    || normalizeText(featureProfile.structureTypeCode).toLowerCase().includes('prefabricated')

  if (stableCode.startsWith('pfb-00')) {
    return {
      factor: clampNumber(0.94 + prefabRate * 0.45, 0.95, 1.34),
      profile: 'prefab_factory_supply_chain',
    }
  }
  if (stableCode.startsWith('pfb-02')) {
    return {
      factor: clampNumber(0.98 + prefabRate * 0.34, 0.98, 1.28),
      profile: 'prefab_grouting_connection_control',
    }
  }
  if (stableCode.startsWith('pfb-01')) {
    return {
      factor: clampNumber(0.98 + prefabRate * 0.24, 0.98, 1.2),
      profile: 'prefab_site_hoisting_control',
    }
  }
  if (stableCode.startsWith('pfb-03')) {
    return {
      factor: clampNumber(0.98 + prefabRate * 0.18, 0.98, 1.16),
      profile: 'prefab_acceptance_traceability_control',
    }
  }
  if (stableCode.startsWith('pfb-')) {
    return {
      factor: clampNumber(0.98 + prefabRate * 0.26, 0.98, 1.22),
      profile: 'prefab_specialty_general_control',
    }
  }

  const isCastInPlaceStructureScope = stableCode.startsWith('02-01')
    || stableCode.startsWith('02-03')
    || stableCode.startsWith('02-04')
    || stableCode.startsWith('02-05')
    || stableCode.includes('bdt-04')
    || scaleBasis === 'floor'
  if (isPrefabMethod && isCastInPlaceStructureScope) {
    return {
      factor: clampNumber(1 - prefabRate * 0.14, 0.86, 1),
      profile: 'prefab_reduces_cast_in_place_structure_scope',
    }
  }

  return null
}

export function resolveProjectFactDurationScaling(
  baseDays: number,
  seedRule: StandardWorkDurationSeedRule | null | undefined,
  featureProfile: DurationProjectFactScaleProfile | null | undefined,
): ProjectFactDurationScalingResult {
  if (!seedRule || !featureProfile || baseDays <= 0) {
    return {
      days: baseDays,
      applied: false,
      factor: 1,
      quantity: null,
      defaultQuantity: null,
      basis: seedRule?.scaleBasis ?? null,
      source: null,
      projectScaleRatio: null,
      baseline: null,
    }
  }

  const proxy = readProjectFactScaleProxy(seedRule, featureProfile)
  const quantity = proxy?.quantity ?? readSeedScaleQuantity(seedRule, featureProfile)
  const defaultQuantity = proxy?.defaultQuantity ?? readOptionalNumber(seedRule.defaultQuantity)
  if (!quantity || !defaultQuantity || quantity <= 0 || defaultQuantity <= 0) {
    return {
      days: baseDays,
      applied: false,
      factor: 1,
      quantity,
      defaultQuantity: defaultQuantity ?? null,
      basis: seedRule.scaleBasis,
      source: proxy?.source ?? null,
      projectScaleRatio: proxy?.ratio ?? null,
      baseline: proxy?.baseline ?? null,
    }
  }

  const ratio = proxy?.ratio ?? (quantity / defaultQuantity)
  if (!Number.isFinite(ratio) || ratio <= 0) {
    return {
      days: baseDays,
      applied: false,
      factor: 1,
      quantity,
      defaultQuantity,
      basis: seedRule.scaleBasis,
      source: proxy?.source ?? null,
      projectScaleRatio: proxy?.ratio ?? null,
      baseline: proxy?.baseline ?? null,
    }
  }

  const variableRatio = seedRule.variableDays > 0 && seedRule.defaultDaysP50 > 0
    ? Math.min(1, Math.max(0, seedRule.variableDays / seedRule.defaultDaysP50))
    : 0.65
  const elasticity = seedRule.scaleBasis === 'floor'
    ? 1
    : seedRule.scaleBasis === 'area' || seedRule.scaleBasis === 'volume'
      ? 0.45
      : seedRule.scaleBasis === 'building'
        ? 0.6
        : 0.5
  const scaledVariableFactor = Math.pow(ratio, elasticity)
  let factor = (1 - variableRatio) + (variableRatio * scaledVariableFactor)
  const durationSignalCode = normalizeText(
    featureProfile.templateStableCode
      ?? featureProfile.standardWorkCode
      ?? seedRule.stableCode,
  ) || seedRule.stableCode

  const archetypeDurationFactor = readConstructionArchetypeDurationFactor(durationSignalCode, featureProfile, seedRule.scaleBasis)
  if (archetypeDurationFactor) factor *= archetypeDurationFactor.factor

  const prefabRateFactor = readPrefabRateFactorForStableCode(durationSignalCode, featureProfile, seedRule.scaleBasis)
  if (prefabRateFactor) factor *= prefabRateFactor.factor

  const depth = readOptionalNumber(featureProfile.foundationDepthM)
  if (depth && depth > 6 && ['workface', 'volume', 'area'].includes(seedRule.scaleBasis)) {
    const code = normalizeText(seedRule.stableCode).toLowerCase()
    if (code.includes('foundation') || code.includes('pit') || code.includes('earthwork') || code.includes('basement')) {
      factor *= Math.min(1.45, 1 + ((depth - 6) * 0.035))
    }
  }

  const clampedFactor = clampNumber(factor, 0.25, 4)
  const days = Math.max(1, Math.ceil(baseDays * clampedFactor))
  return {
    days,
    applied: days !== baseDays,
    factor: clampedFactor,
    quantity,
    defaultQuantity,
    basis: seedRule.scaleBasis,
    source: proxy?.source ?? 'duration_seed_quantity',
    projectScaleRatio: proxy?.ratio ?? null,
    baseline: proxy?.baseline ?? null,
  }
}
