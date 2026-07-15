import type {
  BuildingPatternExecutionFactInput,
  BuildingPatternExecutionMode,
  BuildingPatternExecutionProfile,
} from './buildingPatternExecutionProfileService.js'
import { readConstructionDimensionValue } from './constructionScopeInferenceService.js'

export type ConstructionRhythmExpansionCandidate = {
  patternCode: string
  patternName: string
  patternRole: BuildingPatternExecutionMode['patternRole']
  actionPolicy: BuildingPatternExecutionMode['actionPolicy']
  confidenceScore: number
  rhythmUnit: string
  expansionStrategy: string
  workfaceCount: number
  evidenceFactCount: number
  backendConsumable: boolean
  workfaceKeys: string[]
  rhythmStrategyCodes: string[]
  allowedParallelAcross: string[]
  cautionParallelAcross: string[]
  resourceClassMergePolicy: string | null
  controlChainCount: number
  staggerRuleCount: number
  durationCurveAvailable: boolean
}

export type ConstructionRhythmExpansionResult = {
  projectId: string | null
  candidateCount: number
  backendConsumableCandidateCount: number
  limitedCandidateCount: number
  workfaceCandidateCount: number
  rhythmStrategyCount: number
  dominantRhythmUnits: string[]
  mergePolicy: {
    policy: 'role_layered_scope_merge' | 'single_pattern' | 'no_pattern'
    primaryRhythmUnit: string | null
    combinedRhythmUnits: string[]
    expansionOrder: string[]
    cartesianExpansionAllowed: boolean
    cartesianExpansionGuard: string
    reason: string
  }
  candidates: ConstructionRhythmExpansionCandidate[]
  metrics: {
    constructionRhythmExpansionCandidateCount: number
    constructionRhythmBackendConsumableCandidateCount: number
    constructionRhythmLimitedCandidateCount: number
    constructionRhythmWorkfaceCandidateCount: number
    constructionRhythmStrategyCount: number
  }
}

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

function normalizeNumber(value: unknown) {
  const numberValue = Number(value)
  return Number.isFinite(numberValue) ? numberValue : null
}

function readArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function unique(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map((value) => normalizeText(value)).filter(Boolean)))
}

function modeList(profile: BuildingPatternExecutionProfile) {
  return [
    profile.modeCombination.primaryProjectMode,
    ...profile.modeCombination.phaseModes,
    ...profile.modeCombination.specialtyDomainModes,
    ...profile.modeCombination.handoverModes,
    ...profile.modeCombination.supportingModes,
  ].filter((mode): mode is BuildingPatternExecutionMode => Boolean(mode))
}

function readFactDimensionValue(fact: BuildingPatternExecutionFactInput, unit: string) {
  return readConstructionDimensionValue(fact, unit)
}

function inferFallbackDimension(mode: BuildingPatternExecutionMode) {
  if (mode.rhythmUnit) return mode.rhythmUnit
  if (mode.expansionStrategy === 'floor_ordered') return 'floor'
  if (mode.expansionStrategy === 'zone_ordered') return 'zone'
  if (mode.expansionStrategy === 'section_ordered') return 'section'
  if (mode.expansionStrategy === 'system_zone') return 'system'
  if (mode.expansionStrategy === 'workface_ordered') return 'workface'
  if (mode.expansionStrategy === 'factory_lot_ordered') return 'factory_lot'
  if (mode.expansionStrategy === 'building') return 'building'
  return 'project'
}

function buildModeWorkfaceKeys(mode: BuildingPatternExecutionMode, facts: BuildingPatternExecutionFactInput[]) {
  const rhythmUnit = inferFallbackDimension(mode)
  const keys = unique(facts.map((fact) => readFactDimensionValue(fact, rhythmUnit)))
  if (keys.length > 0) return keys

  const fallbackDimensions = ['floor', 'zone', 'section', 'system', 'workface', 'factory_lot', 'building']
  for (const dimension of fallbackDimensions) {
    const fallbackKeys = unique(facts.map((fact) => readFactDimensionValue(fact, dimension)))
    if (fallbackKeys.length > 0) return fallbackKeys
  }
  return facts.length > 0 ? ['project'] : []
}

function readParallelPolicyValues(policy: Record<string, unknown>, key: string) {
  return readArray(policy[key]).map(normalizeText).filter(Boolean)
}

function readPositiveLimit(value: unknown) {
  const limit = normalizeNumber(value)
  return limit && limit > 0 ? limit : null
}

export type ConstructionParallelPolicyMergeResult = {
  policy: 'resource_class_hard_limit_overrides_building_pattern_hint'
  allowedAcross: string[]
  cautionAcross: string[]
  crewLimitHint: number | null
  effectiveCrewLimit: number | null
  hardLimits: {
    sameBuildingDailyLimit: number | null
    sameUnitDailyLimit: number | null
    sameFloorDailyLimit: number | null
    sameZoneDailyLimit: number | null
    sameSystemDailyLimit: number | null
  }
  sourcePrecedence: string[]
}

export function mergeConstructionParallelPolicy(
  buildingPatternPolicy: Record<string, unknown> | null | undefined,
  resourceClassPolicy: Record<string, unknown> | null | undefined = null,
): ConstructionParallelPolicyMergeResult {
  const patternPolicy = buildingPatternPolicy ?? {}
  const resourcePolicy = resourceClassPolicy ?? {}
  const crewLimitHint = readPositiveLimit(patternPolicy.crewLimitHint ?? patternPolicy.crew_limit_hint)
  const hardLimits = {
    sameBuildingDailyLimit: readPositiveLimit(resourcePolicy.sameBuildingDailyLimit ?? resourcePolicy.same_building_daily_limit),
    sameUnitDailyLimit: readPositiveLimit(resourcePolicy.sameUnitDailyLimit ?? resourcePolicy.same_unit_daily_limit),
    sameFloorDailyLimit: readPositiveLimit(resourcePolicy.sameFloorDailyLimit ?? resourcePolicy.same_floor_daily_limit),
    sameZoneDailyLimit: readPositiveLimit(resourcePolicy.sameZoneDailyLimit ?? resourcePolicy.same_zone_daily_limit ?? resourcePolicy.sameZone ?? resourcePolicy.same_zone ?? resourcePolicy.sameFloorDailyLimit ?? resourcePolicy.same_floor_daily_limit),
    sameSystemDailyLimit: readPositiveLimit(resourcePolicy.sameSystemDailyLimit ?? resourcePolicy.same_system_daily_limit),
  }
  const hardLimitValues = Object.values(hardLimits).filter((value): value is number => Boolean(value))
  const effectiveCrewLimit = hardLimitValues.length > 0
    ? Math.min(...hardLimitValues, crewLimitHint ?? Number.POSITIVE_INFINITY)
    : crewLimitHint
  const hardLimitCautions = unique([
    hardLimits.sameBuildingDailyLimit ? 'building' : null,
    hardLimits.sameUnitDailyLimit ? 'unit' : null,
    hardLimits.sameFloorDailyLimit ? 'floor' : null,
    hardLimits.sameZoneDailyLimit ? 'zone' : null,
    hardLimits.sameSystemDailyLimit ? 'system' : null,
  ])

  return {
    policy: 'resource_class_hard_limit_overrides_building_pattern_hint',
    allowedAcross: readParallelPolicyValues(patternPolicy, 'allowedAcross'),
    cautionAcross: unique([
      ...readParallelPolicyValues(patternPolicy, 'cautionAcross'),
      ...hardLimitCautions,
    ]),
    crewLimitHint,
    effectiveCrewLimit: Number.isFinite(effectiveCrewLimit ?? Number.NaN) ? effectiveCrewLimit ?? null : null,
    hardLimits,
    sourcePrecedence: [
      'resource_class.same*DailyLimit',
      'building_pattern.parallelPolicy.crewLimitHint',
      'building_pattern.parallelPolicy.allowedAcross',
    ],
  }
}

function buildCandidate(mode: BuildingPatternExecutionMode, facts: BuildingPatternExecutionFactInput[]): ConstructionRhythmExpansionCandidate | null {
  const expansionStrategy = normalizeText(mode.expansionStrategy) || 'none'
  const rhythmUnit = inferFallbackDimension(mode)
  const workfaceKeys = buildModeWorkfaceKeys(mode, facts)
  if (workfaceKeys.length === 0 && expansionStrategy === 'none') return null
  const backendConsumable = mode.backendConsumable || mode.confidenceScore >= 70
  const parallelPolicy = mergeConstructionParallelPolicy(mode.parallelPolicy)
  return {
    patternCode: mode.patternCode,
    patternName: mode.patternName,
    patternRole: mode.patternRole,
    actionPolicy: mode.actionPolicy,
    confidenceScore: mode.confidenceScore,
    rhythmUnit,
    expansionStrategy,
    workfaceCount: workfaceKeys.length,
    evidenceFactCount: mode.evidenceCount,
    backendConsumable,
    workfaceKeys: workfaceKeys.slice(0, 12),
    rhythmStrategyCodes: mode.rhythmStrategyCodes,
    allowedParallelAcross: parallelPolicy.allowedAcross,
    cautionParallelAcross: parallelPolicy.cautionAcross,
    resourceClassMergePolicy: parallelPolicy.policy,
    controlChainCount: mode.controlChainCount,
    staggerRuleCount: mode.staggerRuleCount,
    durationCurveAvailable: Object.keys(mode.durationCurveProfile).length > 0,
  }
}

function mostFrequent(values: string[], limit: number) {
  const counts = new Map<string, number>()
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1)
  }
  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, limit)
    .map(([value]) => value)
}

function buildMergePolicy(candidates: ConstructionRhythmExpansionCandidate[]): ConstructionRhythmExpansionResult['mergePolicy'] {
  if (candidates.length === 0) {
    return {
      policy: 'no_pattern',
      primaryRhythmUnit: null,
      combinedRhythmUnits: [],
      expansionOrder: [],
      cartesianExpansionAllowed: false,
    cartesianExpansionGuard: 'No building pattern matched; downstream generation must keep current explicit scope only. Method variants filter process packages and must not add rows.',
      reason: 'No building-pattern execution rhythm candidate is available.',
    }
  }
  const primary = candidates.find((candidate) => candidate.patternRole === 'primary_project_mode') ?? candidates[0]
  const phaseUnits = unique(candidates.filter((candidate) => candidate.patternRole === 'phase_mode').map((candidate) => candidate.rhythmUnit))
  const specialtyUnits = unique(candidates.filter((candidate) => candidate.patternRole === 'specialty_domain_mode').map((candidate) => candidate.rhythmUnit))
  const handoverUnits = unique(candidates.filter((candidate) => candidate.patternRole === 'handover_mode').map((candidate) => candidate.rhythmUnit))
  const combinedRhythmUnits = unique([
    primary?.rhythmUnit ?? null,
    ...phaseUnits,
    ...specialtyUnits,
    ...handoverUnits,
  ])
  const expansionOrder = unique([
    primary?.rhythmUnit ?? null,
    ...(['section', 'zone', 'floor', 'factory_lot', 'system', 'workface'] as const).filter((unit) => combinedRhythmUnits.includes(unit)),
  ])
  const hasBuildingAndFloor = combinedRhythmUnits.includes('building') && combinedRhythmUnits.includes('floor')
  return {
    policy: candidates.length === 1 ? 'single_pattern' : 'role_layered_scope_merge',
    primaryRhythmUnit: primary?.rhythmUnit ?? null,
    combinedRhythmUnits,
    expansionOrder,
    cartesianExpansionAllowed: hasBuildingAndFloor,
    cartesianExpansionGuard: hasBuildingAndFloor
      ? 'Building x floor expansion is allowed only when both building and floor scope facts exist; method variants filter process packages but must not add rows.'
      : 'Do not create extra scope rows beyond explicit workface keys from the selected pattern; method variants filter process packages and must not add rows.',
    reason: candidates.length === 1
      ? 'A single rhythm candidate owns expansion for its rhythm unit.'
      : 'Project, phase, specialty, and handover modes merge by role; primary project mode sets the outer rhythm and phase/specialty/handover modes add inner workface units.',
  }
}

export function buildConstructionRhythmExpansion(
  profile: BuildingPatternExecutionProfile,
  facts: BuildingPatternExecutionFactInput[],
): ConstructionRhythmExpansionResult {
  const executableFacts = facts.filter((fact) => {
    if (fact.is_executable === false || fact.is_wbs_summary === true) return false
    const status = normalizeText(fact.status).toLowerCase()
    return !['deleted', 'cancelled', 'canceled', 'closed', 'archived'].includes(status)
  })
  const candidates = modeList(profile)
    .map((mode) => buildCandidate(mode, executableFacts))
    .filter((candidate): candidate is ConstructionRhythmExpansionCandidate => Boolean(candidate))
    .filter((candidate, index, list) => list.findIndex((item) => item.patternCode === candidate.patternCode) === index)
    .sort((left, right) => (
      Number(right.backendConsumable) - Number(left.backendConsumable)
      || right.confidenceScore - left.confidenceScore
      || right.workfaceCount - left.workfaceCount
      || left.patternCode.localeCompare(right.patternCode)
    ))

  const backendConsumableCandidateCount = candidates.filter((candidate) => candidate.backendConsumable).length
  const limitedCandidateCount = candidates.filter((candidate) => !candidate.backendConsumable).length
  const workfaceCandidateCount = candidates.reduce((total, candidate) => total + candidate.workfaceCount, 0)
  const rhythmStrategyCount = unique(candidates.flatMap((candidate) => candidate.rhythmStrategyCodes)).length

  return {
    projectId: profile.projectId,
    candidateCount: candidates.length,
    backendConsumableCandidateCount,
    limitedCandidateCount,
    workfaceCandidateCount,
    rhythmStrategyCount,
    dominantRhythmUnits: mostFrequent(candidates.map((candidate) => candidate.rhythmUnit), 5),
    mergePolicy: buildMergePolicy(candidates),
    candidates,
    metrics: {
      constructionRhythmExpansionCandidateCount: candidates.length,
      constructionRhythmBackendConsumableCandidateCount: backendConsumableCandidateCount,
      constructionRhythmLimitedCandidateCount: limitedCandidateCount,
      constructionRhythmWorkfaceCandidateCount: workfaceCandidateCount,
      constructionRhythmStrategyCount: rhythmStrategyCount,
    },
  }
}

export function buildConstructionRhythmExpansionReason(result: ConstructionRhythmExpansionResult) {
  if (result.candidateCount === 0) return null
  const topCandidates = result.candidates.slice(0, 3).map((candidate) => `${candidate.patternName}(${candidate.workfaceCount})`).join(', ')
  return {
    code: 'construction_rhythm_expansion',
    label: 'Construction workface rhythm candidates prepared',
    detail: `Prepared ${result.candidateCount} construction rhythm candidate(s) across ${result.workfaceCandidateCount} workface scope(s): ${topCandidates}. These candidates remain backend context and do not overwrite task dates.`,
    severity: 'info' as const,
  }
}
