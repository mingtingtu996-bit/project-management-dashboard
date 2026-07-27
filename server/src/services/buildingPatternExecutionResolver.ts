import {
  V1474_BUILDING_PATTERN_SEED,
  type V1474BuildingPattern,
} from '../seeds/v1474BuildingPatternSeed.js'
import type { ProjectScenarioFacts } from './projectScenarioTaxonomyService.js'

export type BuildingPatternExecutionArchetype =
  | 'highrise_cast_in_place_tower'
  | 'lowrise_multi_building_parallel'
  | 'prefab_concrete_supply_chain'
  | 'steel_assembly_fast_track'
  | 'mic_modular_fast_track'
  | 'general_construction'

export type BuildingPatternExecutionArchetypeProfile = {
  source: 'v1474_building_pattern' | 'taxonomy_fallback'
  primaryArchetype: BuildingPatternExecutionArchetype
  crossCuttingArchetypes: BuildingPatternExecutionArchetype[]
  allArchetypes: BuildingPatternExecutionArchetype[]
  patternCodes: string[]
  confidence: 'high' | 'medium' | 'low'
  durationCurveProfile?: Record<string, unknown>
  parallelPolicy?: Record<string, unknown>
  phaseReleaseHints?: Record<string, unknown>
}

type PatternProjection = {
  archetype: BuildingPatternExecutionArchetype
  weight: number
}

function normalizeId(value: unknown) {
  return String(value ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_')
}

function hasNormalizedCodeToken(value: string, token: string) {
  return value === token
    || value.startsWith(`${token}_`)
    || value.endsWith(`_${token}`)
    || value.includes(`_${token}_`)
}

function normalizeNumber(value: unknown): number | null {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function normalizeRate01(value: unknown): number | null {
  const parsed = normalizeNumber(value)
  if (parsed === null) return null
  if (parsed > 1) return parsed / 100
  return parsed
}

function unique<T extends string>(values: Array<T | null | undefined>) {
  return [...new Set(values.filter(Boolean) as T[])]
}

function readArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function readStringArray(value: unknown) {
  return readArray(value).map((item) => String(item ?? '').trim()).filter(Boolean)
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function readFeatureNumber(facts: ProjectScenarioFacts, key: keyof ProjectScenarioFacts, featureKey: string) {
  return normalizeNumber(facts[key] ?? facts.projectFeatures?.[featureKey])
}

function normalizeMethodCode(value: unknown) {
  const normalized = normalizeId(value)
  if (['modular_mic', 'mic', 'modular', 'modular_building', 'modular_construction'].includes(normalized)) return 'mic_modular'
  if (['steel_frame', 'steel_structure', 'steel_assembly', 'prefabricated_steel'].includes(normalized)) return 'steel_assembly'
  if (['precast_concrete', 'prefab', 'prefabricated', 'prefabricated_concrete', 'pc', 'pc_prefab'].includes(normalized)) return 'prefab_concrete'
  if (['cast_in_situ', 'cast_in_place', 'cast_in_place_concrete', 'cast_in_place_tower'].includes(normalized)) return 'cast_in_place'
  return normalized
}

function readBuildingPatternCodes(facts: ProjectScenarioFacts) {
  return unique([
    ...readStringArray((facts as Record<string, unknown>).buildingPatternCodes),
    ...readStringArray((facts as Record<string, unknown>).building_pattern_codes),
    ...readStringArray(facts.projectFeatures?.buildingPatternCodes),
    ...readStringArray(facts.projectFeatures?.building_pattern_codes),
    normalizeId((facts as Record<string, unknown>).buildingPatternCode),
    normalizeId((facts as Record<string, unknown>).building_pattern_code),
    normalizeId(facts.projectFeatures?.buildingPatternCode),
    normalizeId(facts.projectFeatures?.building_pattern_code),
  ].map((item) => normalizeId(item)).filter(Boolean))
}

function getPattern(code: string) {
  return V1474_BUILDING_PATTERN_SEED_BY_CODE.get(normalizeId(code))
}

const V1474_BUILDING_PATTERN_SEED_BY_CODE = new Map(
  V1474_BUILDING_PATTERN_SEED.map((pattern) => [normalizeId(pattern.patternCode), pattern]),
)

const PATTERN_CODE_ARCHETYPE_OVERRIDES: Record<string, PatternProjection> = {
  high_rise_core_and_floor_cycle: { archetype: 'highrise_cast_in_place_tower', weight: 90 },
  prefabricated_concrete_floor_cycle: { archetype: 'prefab_concrete_supply_chain', weight: 100 },
  prefabricated_factory_coordination_flow: { archetype: 'prefab_concrete_supply_chain', weight: 86 },
  steel_structure_bay_zone_flow: { archetype: 'steel_assembly_fast_track', weight: 100 },
  large_span_public_steel_integration_flow: { archetype: 'steel_assembly_fast_track', weight: 92 },
  mic_module_factory_site_flow: { archetype: 'mic_modular_fast_track', weight: 100 },
  multi_building_parallel_flow: { archetype: 'lowrise_multi_building_parallel', weight: 82 },
  single_building_vertical_flow: { archetype: 'highrise_cast_in_place_tower', weight: 55 },
}

function inferPatternProjection(pattern: V1474BuildingPattern): PatternProjection | null {
  const code = normalizeId(pattern.patternCode)
  const explicit = PATTERN_CODE_ARCHETYPE_OVERRIDES[code]
  if (explicit) return explicit

  const haystack = [
    pattern.patternCode,
    pattern.patternName,
    pattern.rhythmHint,
    ...(pattern.applicableKeywords ?? []),
    ...(pattern.applicableMethodCodes ?? []),
    ...(pattern.structureTypeCodes ?? []),
    ...(pattern.projectTypeCodes ?? []),
    pattern.primaryWorkfaceType,
    pattern.phaseWindow,
  ].map(normalizeId).join(' ')

  if (haystack.includes('mic') || haystack.includes('module')) {
    return { archetype: 'mic_modular_fast_track', weight: 88 }
  }
  if (haystack.includes('steel') || haystack.includes('large_span')) {
    return { archetype: 'steel_assembly_fast_track', weight: 84 }
  }
  if (haystack.includes('prefab') || haystack.includes('precast') || haystack.includes('pc')) {
    return { archetype: 'prefab_concrete_supply_chain', weight: 82 }
  }
  if (code.includes('multi_building') || haystack.includes('multi_building')) {
    return { archetype: 'lowrise_multi_building_parallel', weight: 74 }
  }
  if (haystack.includes('high_rise') || haystack.includes('tower') || haystack.includes('standard_floor')) {
    return { archetype: 'highrise_cast_in_place_tower', weight: 70 }
  }
  return null
}

function scoreArchetypes(patternCodes: string[]) {
  const scores = new Map<BuildingPatternExecutionArchetype, number>()
  const resolvedPatterns: V1474BuildingPattern[] = []
  for (const code of unique(patternCodes.map(normalizeId))) {
    const pattern = getPattern(code)
    if (!pattern) continue
    resolvedPatterns.push(pattern)
    const projection = inferPatternProjection(pattern)
    if (!projection) continue
    const priority = normalizeNumber(pattern.patternPriority) ?? 50
    const confidenceWeight = pattern.confidence === 'high' ? 1.16 : pattern.confidence === 'medium' ? 1 : 0.82
    const score = projection.weight + Math.min(18, priority / 8)
    scores.set(projection.archetype, (scores.get(projection.archetype) ?? 0) + score * confidenceWeight)
  }
  return { scores, resolvedPatterns }
}

function selectPrimaryArchetype(scores: Map<BuildingPatternExecutionArchetype, number>) {
  return [...scores.entries()]
    .sort((left, right) => {
      const byScore = right[1] - left[1]
      if (byScore) return byScore
      return archetypePriority(right[0]) - archetypePriority(left[0])
    })[0]?.[0] ?? 'general_construction'
}

function archetypePriority(archetype: BuildingPatternExecutionArchetype) {
  switch (archetype) {
    case 'mic_modular_fast_track': return 50
    case 'steel_assembly_fast_track': return 45
    case 'prefab_concrete_supply_chain': return 40
    case 'highrise_cast_in_place_tower': return 30
    case 'lowrise_multi_building_parallel': return 20
    default: return 0
  }
}

function mergeFirstRecord(patterns: V1474BuildingPattern[], key: 'durationCurveProfile' | 'parallelPolicy') {
  return patterns
    .map((pattern) => readRecord(pattern[key]))
    .find((record) => Object.keys(record).length > 0)
}

export function deriveExecutionArchetypeFromBuildingPatterns(patternCodes: string[]) {
  const normalizedCodes = unique(patternCodes.map(normalizeId))
  const { scores, resolvedPatterns } = scoreArchetypes(normalizedCodes)
  const primaryArchetype = selectPrimaryArchetype(scores)
  const crossCuttingArchetypes = unique([...scores.keys()]
    .filter((archetype) => archetype !== primaryArchetype))
  return {
    primaryArchetype,
    crossCuttingArchetypes,
    allArchetypes: unique([primaryArchetype, ...crossCuttingArchetypes]),
    patternCodes: normalizedCodes.filter((code) => Boolean(getPattern(code))),
    confidence: resolvedPatterns.length > 0 && primaryArchetype !== 'general_construction'
      ? 'high' as const
      : 'low' as const,
    durationCurveProfile: mergeFirstRecord(resolvedPatterns, 'durationCurveProfile'),
    parallelPolicy: mergeFirstRecord(resolvedPatterns, 'parallelPolicy'),
  }
}

export function isLowRiseMultiBuildingParallelScenario(facts: ProjectScenarioFacts) {
  const features = facts.projectFeatures ?? {}
  const buildingCount = readFeatureNumber(facts, 'buildingCount', 'buildingCount') ?? 1
  const floorCount = readFeatureNumber(facts, 'standardFloorCount', 'standardFloorCount')
    ?? readFeatureNumber(facts, 'highestBuildingFloorCount', 'highestBuildingFloorCount')
    ?? 0
  const basementLevelCount = readFeatureNumber(facts, 'basementLevelCount', 'basementLevelCount') ?? 0
  return buildingCount >= 6
    && floorCount > 0
    && floorCount <= 13
    && basementLevelCount <= 1
    && normalizeId(features.forceHighriseRhythm) !== 'true'
}

function inferFallbackArchetype(facts: ProjectScenarioFacts) {
  const features = facts.projectFeatures ?? {}
  const projectType = normalizeId(facts.projectTypeCode ?? facts.businessType)
  const structureType = normalizeId(facts.structureTypeCode ?? features.structureTypeCode)
  const methods = (facts.methodVariantCodes ?? []).map(normalizeMethodCode)
  const floorCount = readFeatureNumber(facts, 'standardFloorCount', 'standardFloorCount')
    ?? readFeatureNumber(facts, 'highestBuildingFloorCount', 'highestBuildingFloorCount')
    ?? 0
  const prefabRate = normalizeRate01(facts.prefabRate ?? features.prefabRate ?? features.prefab_rate) ?? 0
  const isLowRise = isLowRiseMultiBuildingParallelScenario(facts)

  let primaryArchetype: BuildingPatternExecutionArchetype = 'general_construction'
  if (
    methods.includes('mic_modular')
    || hasNormalizedCodeToken(projectType, 'modular')
    || hasNormalizedCodeToken(projectType, 'mic')
  ) {
    primaryArchetype = 'mic_modular_fast_track'
  } else if (methods.includes('steel_assembly') || structureType.includes('steel_assembly') || structureType.includes('prefabricated_steel')) {
    primaryArchetype = 'steel_assembly_fast_track'
  } else if (prefabRate >= 0.2 || methods.includes('prefab_concrete') || structureType.includes('prefabricated') || structureType.includes('precast')) {
    primaryArchetype = 'prefab_concrete_supply_chain'
  } else if (isLowRise) {
    primaryArchetype = 'lowrise_multi_building_parallel'
  } else if (floorCount >= 18 && (structureType.includes('shear') || structureType.includes('wall'))) {
    primaryArchetype = 'highrise_cast_in_place_tower'
  }

  const crossCuttingArchetypes = unique([
    isLowRise && primaryArchetype !== 'lowrise_multi_building_parallel'
      ? 'lowrise_multi_building_parallel' as const
      : null,
  ])
  return {
    primaryArchetype,
    crossCuttingArchetypes,
    allArchetypes: unique([primaryArchetype, ...crossCuttingArchetypes]),
  }
}

export function resolveBuildingPatternExecutionArchetypeProfile(
  facts: ProjectScenarioFacts,
): BuildingPatternExecutionArchetypeProfile {
  const patternCodes = readBuildingPatternCodes(facts)
  const patternProjection = deriveExecutionArchetypeFromBuildingPatterns(patternCodes)
  if (patternProjection.patternCodes.length > 0 && patternProjection.primaryArchetype !== 'general_construction') {
    return {
      source: 'v1474_building_pattern',
      primaryArchetype: patternProjection.primaryArchetype,
      crossCuttingArchetypes: patternProjection.crossCuttingArchetypes,
      allArchetypes: patternProjection.allArchetypes,
      patternCodes: patternProjection.patternCodes,
      confidence: patternProjection.confidence,
      durationCurveProfile: patternProjection.durationCurveProfile,
      parallelPolicy: patternProjection.parallelPolicy,
    }
  }

  const fallback = inferFallbackArchetype(facts)
  return {
    source: 'taxonomy_fallback',
    ...fallback,
    patternCodes: [],
    confidence: fallback.primaryArchetype === 'general_construction' ? 'low' : 'medium',
  }
}
