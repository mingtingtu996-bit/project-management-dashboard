import {
  resolveV1474BuildingPatternMatches,
  type AlgorithmSeedResolveContext,
  type V1474BuildingPatternMatch,
} from './algorithmSeedResolver.js'
import { inferConstructionScopeFromFact } from './constructionScopeInferenceService.js'
import { readProjectGenerationFactsSnapshot } from './projectGenerationFactsSnapshotService.js'
import { buildAlgorithmFactContext, summarizeAlgorithmFactContext } from './algorithmFactContextService.js'

type ConstructionPatternRole =
  | 'primary_project_mode'
  | 'phase_mode'
  | 'specialty_domain_mode'
  | 'handover_mode'
  | 'supporting_mode'

export type BuildingPatternExecutionFactInput = Record<string, unknown>

export type BuildingPatternExecutionMode = {
  patternCode: string
  patternName: string
  patternRole: ConstructionPatternRole
  patternPriority: number
  conflictGroup: string | null
  coexistsWithGroups: string[]
  confidenceScore: number
  confidenceLevel: V1474BuildingPatternMatch['confidenceLevel']
  actionPolicy: 'candidate_only' | 'confidence_only'
  backendConsumable: boolean
  evidenceCount: number
  matchScoreAvg: number
  phaseWindow: string | null
  primaryWorkfaceType: string | null
  expansionStrategy: string | null
  rhythmUnit: string | null
  consumptionPolicy: Record<string, unknown>
  durationCurveProfile: Record<string, unknown>
  parallelPolicy: Record<string, unknown>
  rhythmStrategyCodes: string[]
  controlChainCount: number
  staggerRuleCount: number
  matchedSignals: string[]
  missingSignals: string[]
}

export type BuildingPatternExecutionProfile = {
  projectId: string | null
  profileSource: 'task_facts' | 'monthly_plan_items' | 'generic_facts'
  factCount: number
  executableFactCount: number
  engineReadiness: 'strong' | 'usable' | 'limited'
  engineReadinessScore: number
  dataSupport: {
    scopedFactRatio: number
    standardWorkRatio: number
    templateNodeRatio: number
    featureProfileRatio: number
    scopeDimensionCounts: Record<string, number>
    rhythmDriverCounts: Record<string, number>
  }
  inferredFeatureProfile: {
    projectTypeCodes: string[]
    structureTypeCodes: string[]
    methodVariantCodes: string[]
    elementVariantCodes: string[]
  }
  modeCombination: {
    primaryProjectMode: BuildingPatternExecutionMode | null
    phaseModes: BuildingPatternExecutionMode[]
    specialtyDomainModes: BuildingPatternExecutionMode[]
    handoverModes: BuildingPatternExecutionMode[]
    supportingModes: BuildingPatternExecutionMode[]
  }
  metrics: {
    buildingPatternExecutionModeCount: number
    buildingPatternExecutionBackendConsumableModeCount: number
    buildingPatternExecutionLowConfidenceModeCount: number
    buildingPatternExecutionReadinessScore: number
    buildingPatternExecutionScopeDimensionCount: number
    buildingPatternExecutionFeatureCoveragePercent: number
    buildingPatternExecutionStandardWorkCoveragePercent: number
  }
}

type FactContext = AlgorithmSeedResolveContext & {
  id: string
  text: string
  hasScope: boolean
  hasStandardWork: boolean
  hasTemplateNode: boolean
  hasFeatureProfile: boolean
}

type ModeAccumulator = {
  mode: BuildingPatternExecutionMode
  confidenceScoreTotal: number
  matchScoreTotal: number
  sortScore: number
}

const MAX_FACTS_FOR_PROFILE = 240

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

function normalizeLower(value: unknown) {
  return normalizeText(value).toLowerCase()
}

function normalizeNumber(value: unknown) {
  const numberValue = Number(value)
  return Number.isFinite(numberValue) ? numberValue : null
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function readArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function unique(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map((value) => normalizeText(value)).filter(Boolean)))
}

function readTextArrayFromRecord(record: Record<string, unknown>, keys: string[]) {
  const values: string[] = []
  for (const key of keys) {
    const value = record[key]
    if (Array.isArray(value)) {
      values.push(...value.map(normalizeText).filter(Boolean))
      continue
    }
    const text = normalizeText(value)
    if (text) values.push(text)
  }
  return values
}

function readNestedRecord(fact: BuildingPatternExecutionFactInput, keys: string[]) {
  for (const key of keys) {
    const record = readRecord(fact[key])
    if (Object.keys(record).length > 0) return record
  }
  return {}
}

function mergeFeatureProfile(fact: BuildingPatternExecutionFactInput) {
  const metadata = readRecord(fact.standard_task_metadata)
  const generationMetadata = readRecord(fact.generation_metadata)
  const wbsSnapshot = readRecord(fact.wbs_snapshot)
  const taskFactSnapshot = readRecord(fact.task_fact_snapshot)
  const projectGenerationFacts = readProjectGenerationFactsSnapshot(
    fact,
    metadata,
    generationMetadata,
    wbsSnapshot,
    taskFactSnapshot,
  )
  const factContext = buildAlgorithmFactContext({
    phase: 'duration_context',
    projectGenerationFacts,
    runtimeExecutionFacts: {
      progressCompletionRatio: fact.current_progress == null && fact.progress == null
        ? undefined
        : Number(fact.current_progress ?? fact.progress) / 100,
      evidenceCodes: Object.keys(taskFactSnapshot).length > 0 ? ['task_fact_snapshot'] : [],
    },
  })
  return {
    projectTypeCode: factContext.projectGenerationFacts.businessType,
    structureTypeCode: factContext.projectGenerationFacts.structureTypeCode,
    methodVariantCodes: factContext.projectGenerationFacts.methodVariantCodes,
    elementVariantCodes: factContext.projectGenerationFacts.elementVariantCodes,
    algorithmFactContext: summarizeAlgorithmFactContext(factContext),
    ...readNestedRecord(fact, ['featureProfile', 'feature_profile']),
    ...readNestedRecord(metadata, ['featureProfile', 'feature_profile']),
    ...readNestedRecord(generationMetadata, ['featureProfile', 'feature_profile']),
    ...readNestedRecord(wbsSnapshot, ['featureProfile', 'feature_profile']),
    ...readNestedRecord(taskFactSnapshot, ['featureProfile', 'feature_profile']),
  }
}

function mergeBuildingPatternObservation(fact: BuildingPatternExecutionFactInput) {
  const metadata = readRecord(fact.standard_task_metadata)
  const generationMetadata = readRecord(fact.generation_metadata)
  const wbsSnapshot = readRecord(fact.wbs_snapshot)
  const taskFactSnapshot = readRecord(fact.task_fact_snapshot)
  return {
    ...readNestedRecord(fact, ['buildingPatternObservation', 'building_pattern_observation']),
    ...readNestedRecord(metadata, ['buildingPatternObservation', 'building_pattern_observation']),
    ...readNestedRecord(generationMetadata, ['buildingPatternObservation', 'building_pattern_observation']),
    ...readNestedRecord(wbsSnapshot, ['buildingPatternObservation', 'building_pattern_observation']),
    ...readNestedRecord(taskFactSnapshot, ['buildingPatternObservation', 'building_pattern_observation']),
  }
}

function extractScopeDimensions(fact: BuildingPatternExecutionFactInput) {
  return inferConstructionScopeFromFact(fact).scopeDimensions
}

function inferPhaseWindow(fact: BuildingPatternExecutionFactInput, dimensions: string[], text: string, observation: Record<string, unknown>) {
  const explicit = normalizeLower(fact.phaseWindow ?? fact.phase_window ?? observation.phaseWindow ?? observation.phase_window)
  if (explicit) return explicit
  const standardCode = normalizeLower(fact.standard_work_code)
  const normalized = text.toLowerCase()
  if (normalized.includes('opening') || normalized.includes('开业')) return 'opening'
  if (normalized.includes('handover') || normalized.includes('delivery') || normalized.includes('交付')) return 'handover'
  if (normalized.includes('trial operation') || normalized.includes('试运营')) return 'trial_operation'
  if (normalized.includes('factory') || normalized.includes('mic') || normalized.includes('模块')) return 'factory'
  if (normalized.includes('renovation') || normalized.includes('改造') || normalized.includes('文保')) return 'renovation'
  if (dimensions.includes('section') || standardCode.startsWith('01') || normalized.includes('foundation') || normalized.includes('pile') || normalized.includes('excavation')) return 'foundation'
  if (dimensions.includes('system') || /^0[5-8]/.test(standardCode) || normalized.includes('mep') || normalized.includes('commission')) return 'mep'
  if (dimensions.includes('zone') && (standardCode.startsWith('out') || standardCode.startsWith('11') || normalized.includes('outdoor') || normalized.includes('landscape'))) return 'outdoor'
  if (dimensions.includes('floor') && (standardCode.startsWith('03') || normalized.includes('decoration') || normalized.includes('fitout'))) return 'decoration'
  if (dimensions.includes('floor') || standardCode.startsWith('02')) return 'superstructure'
  return null
}

function inferPrimaryWorkfaceType(
  fact: BuildingPatternExecutionFactInput,
  dimensions: string[],
  phaseWindow: string | null,
  text: string,
  observation: Record<string, unknown>,
) {
  const explicit = normalizeLower(fact.primaryWorkfaceType ?? fact.primary_workface_type ?? observation.primaryWorkfaceType ?? observation.primary_workface_type)
  if (explicit) return explicit
  const normalized = text.toLowerCase()
  if (phaseWindow === 'foundation') return 'foundation_section'
  if (phaseWindow === 'opening') return 'public_system_zone'
  if (phaseWindow === 'handover' && normalized.includes('owner')) return 'decoration_room_zone'
  if (phaseWindow === 'trial_operation') return 'hotel_room_public_zone'
  if (phaseWindow === 'factory') return 'mic_module_zone'
  if (phaseWindow === 'renovation') return 'renovation_protection_zone'
  if (normalized.includes('data center') || normalized.includes('idc')) return 'data_center_room_zone'
  if (normalized.includes('hospital') || normalized.includes('medical')) return 'medical_cleanroom_zone'
  if (normalized.includes('cleanroom') || normalized.includes('洁净')) return 'cleanroom_validation_zone'
  if (normalized.includes('steel') || normalized.includes('warehouse')) return 'steel_bay'
  if (phaseWindow === 'mep') return 'mep_system_zone'
  if (phaseWindow === 'outdoor') return 'outdoor_zone'
  if (phaseWindow === 'decoration') return 'decoration_room_zone'
  if (dimensions.includes('floor')) return 'standard_floor'
  if (dimensions.includes('building')) return 'building_zone'
  return null
}

function inferExpansionStrategy(fact: BuildingPatternExecutionFactInput, dimensions: string[], observation: Record<string, unknown>) {
  const explicit = normalizeLower(fact.expansionStrategy ?? fact.expansion_strategy ?? observation.expansionStrategy ?? observation.expansion_strategy)
  if (explicit) return explicit
  if (dimensions.includes('section')) return 'section_ordered'
  if (dimensions.includes('system')) return 'system_zone'
  if (dimensions.includes('floor')) return 'floor_ordered'
  if (dimensions.includes('zone')) return 'zone_ordered'
  if (dimensions.includes('building')) return 'building'
  if (dimensions.includes('workface')) return 'workface_ordered'
  return null
}

function compactFactText(fact: BuildingPatternExecutionFactInput) {
  return [
    fact.title,
    fact.name,
    fact.description,
    fact.standard_work_name,
    fact.standard_work_code,
    fact.wbs_node_type,
    fact.wbs_path,
    fact.engineering_category_id,
    fact.template_node_id,
  ].map(normalizeText).filter(Boolean).join(' ')
}

function buildFactContext(projectId: string | null, fact: BuildingPatternExecutionFactInput, index: number): FactContext {
  const featureProfile = mergeFeatureProfile(fact)
  const observation = mergeBuildingPatternObservation(fact)
  const scopeInference = inferConstructionScopeFromFact(fact)
  const dimensions = scopeInference.scopeDimensions
  const text = compactFactText(fact)
  const methodVariantCodes = unique([
    ...readTextArrayFromRecord(fact, ['methodVariantCode', 'method_variant_code', 'methodVariantCodes', 'method_variant_codes']),
    ...readTextArrayFromRecord(featureProfile, ['methodVariantCode', 'method_variant_code', 'methodVariantCodes', 'method_variant_codes']),
    ...readTextArrayFromRecord(observation, ['methodVariantCode', 'method_variant_code', 'methodVariantCodes', 'method_variant_codes']),
  ])
  const elementVariantCodes = unique([
    ...readTextArrayFromRecord(fact, ['elementVariantCode', 'element_variant_code', 'elementVariantCodes', 'element_variant_codes']),
    ...readTextArrayFromRecord(featureProfile, ['elementVariantCode', 'element_variant_code', 'elementVariantCodes', 'element_variant_codes']),
    ...readTextArrayFromRecord(observation, ['elementVariantCode', 'element_variant_code', 'elementVariantCodes', 'element_variant_codes']),
  ])
  const featureProfileRecord = readRecord(featureProfile)
  const observationRecord = readRecord(observation)
  const projectTypeCode = normalizeText(fact.project_type_code ?? fact.projectTypeCode)
    || normalizeText(featureProfile.projectTypeCode ?? featureProfileRecord.project_type_code)
    || normalizeText(observationRecord.projectTypeCode ?? observationRecord.project_type_code)
    || null
  const structureTypeCode = normalizeText(fact.structure_type_code ?? fact.structureTypeCode)
    || normalizeText(featureProfile.structureTypeCode ?? featureProfileRecord.structure_type_code)
    || normalizeText(observationRecord.structureTypeCode ?? observationRecord.structure_type_code)
    || null
  const phaseWindow = scopeInference.phaseWindow ?? inferPhaseWindow(fact, dimensions, text, observation)
  const primaryWorkfaceType = scopeInference.primaryWorkfaceType ?? inferPrimaryWorkfaceType(fact, dimensions, phaseWindow, text, observation)
  const expansionStrategy = scopeInference.expansionStrategy ?? inferExpansionStrategy(fact, dimensions, observation)
  const rhythmDrivers = unique([
    dimensions.includes('floor') ? 'floor_count' : null,
    dimensions.includes('building') ? 'building_count' : null,
    dimensions.includes('zone') ? 'zone_count' : null,
    dimensions.includes('section') ? 'section_count' : null,
    dimensions.includes('system') ? 'system_count' : null,
    dimensions.includes('workface') ? 'workface_count' : null,
    methodVariantCodes.length > 0 ? 'method_variant' : null,
    fact.acceptance_required === true || normalizeText(fact.acceptance_required) === 'true' ? 'acceptance_gate' : null,
    fact.material_required === true || normalizeText(fact.material_required) === 'true' ? 'readiness_gate' : null,
    normalizeText(fact.participant_unit_id) ? 'resource_capacity' : null,
  ])
  const standardWorkCode = normalizeText(fact.standard_work_code)
  const templateNodeId = normalizeText(fact.template_node_id)

  return {
    id: normalizeText(fact.id) || `fact-${index}`,
    projectId,
    text,
    standardWorkCode: standardWorkCode || null,
    standardWorkCodes: standardWorkCode ? [standardWorkCode] : [],
    templateNodeId: templateNodeId || null,
    projectTypeCode,
    structureTypeCode,
    methodVariantCodes,
    elementVariantCodes,
    scopeDimensions: dimensions,
    rhythmDrivers,
    primaryWorkfaceType,
    phaseWindow,
    expansionStrategy,
    algorithmFactContext: readRecord(featureProfile.algorithmFactContext),
    hasScope: dimensions.length > 0,
    hasStandardWork: Boolean(standardWorkCode),
    hasTemplateNode: Boolean(templateNodeId),
    hasFeatureProfile: Boolean(projectTypeCode || structureTypeCode || methodVariantCodes.length > 0 || elementVariantCodes.length > 0),
  }
}

function isExecutableFact(fact: BuildingPatternExecutionFactInput) {
  if (fact.is_executable === false || fact.is_wbs_summary === true) return false
  const status = normalizeLower(fact.status)
  return !['deleted', 'cancelled', 'canceled', 'closed', 'archived'].includes(status)
}

function addCount(target: Record<string, number>, values: string[] | null | undefined) {
  for (const value of values ?? []) {
    const key = normalizeText(value)
    if (key) target[key] = (target[key] ?? 0) + 1
  }
}

function mostFrequent(values: Array<string | null | undefined>, limit: number) {
  const counts = new Map<string, number>()
  for (const value of values) {
    const normalized = normalizeText(value)
    if (!normalized) continue
    counts.set(normalized, (counts.get(normalized) ?? 0) + 1)
  }
  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, limit)
    .map(([value]) => value)
}

function readPatternRole(record: Record<string, unknown>): ConstructionPatternRole {
  const role = normalizeText(record.patternRole ?? record.pattern_role)
  if (['primary_project_mode', 'phase_mode', 'specialty_domain_mode', 'handover_mode', 'supporting_mode'].includes(role)) {
    return role as ConstructionPatternRole
  }
  return 'supporting_mode'
}

function readObjectRecord(value: unknown) {
  return readRecord(value)
}

function addModeMatch(accumulators: Map<string, ModeAccumulator>, match: V1474BuildingPatternMatch) {
  if (!match.record || !match.patternCode) return
  const record = readObjectRecord(match.record)
  const code = match.patternCode
  const current = accumulators.get(code)
  const priority = normalizeNumber(record.patternPriority ?? record.pattern_priority) ?? 0
  const role = readPatternRole(record)
  const initialBackendConsumable = match.actionPolicy === 'backend_consume' || match.confidenceLevel === 'high'
  const nextMode: BuildingPatternExecutionMode = current?.mode ?? {
    patternCode: code,
    patternName: normalizeText(record.patternName ?? record.pattern_name) || code,
    patternRole: role,
    patternPriority: priority,
    conflictGroup: normalizeText(record.conflictGroup ?? record.conflict_group) || null,
    coexistsWithGroups: readArray(record.coexistsWithGroups ?? record.coexists_with_groups).map(normalizeText).filter(Boolean),
    confidenceScore: match.confidenceScore,
    confidenceLevel: match.confidenceLevel,
    actionPolicy: initialBackendConsumable ? 'candidate_only' : 'confidence_only',
    backendConsumable: initialBackendConsumable,
    evidenceCount: 0,
    matchScoreAvg: 0,
    phaseWindow: normalizeText(record.phaseWindow ?? record.phase_window) || null,
    primaryWorkfaceType: normalizeText(record.primaryWorkfaceType ?? record.primary_workface_type) || null,
    expansionStrategy: normalizeText(record.expansionStrategy ?? record.expansion_strategy) || null,
    rhythmUnit: normalizeText(record.rhythmUnit ?? record.rhythm_unit) || null,
    consumptionPolicy: readRecord(record.consumptionPolicy ?? record.consumption_policy),
    durationCurveProfile: readRecord(record.durationCurveProfile ?? record.duration_curve_profile),
    parallelPolicy: readRecord(record.parallelPolicy ?? record.parallel_policy),
    rhythmStrategyCodes: readArray(record.rhythmStrategyCodes ?? record.rhythm_strategy_codes).map(normalizeText).filter(Boolean),
    controlChainCount: readArray(record.controlChains ?? record.control_chains).length,
    staggerRuleCount: readArray(record.staggerRules ?? record.stagger_rules).length,
    matchedSignals: [],
    missingSignals: [],
  }
  const evidenceCount = nextMode.evidenceCount + 1
  const confidenceScoreTotal = (current?.confidenceScoreTotal ?? 0) + match.confidenceScore
  const matchScoreTotal = (current?.matchScoreTotal ?? 0) + match.matchScore
  const actionWeight = initialBackendConsumable ? 16 : match.actionPolicy === 'confidence_only' ? 8 : 2
  const sortScore = (current?.sortScore ?? 0) + match.confidenceScore + actionWeight + priority / 4

  nextMode.evidenceCount = evidenceCount
  nextMode.confidenceScore = Math.round(confidenceScoreTotal / evidenceCount)
  nextMode.matchScoreAvg = Math.round(matchScoreTotal / evidenceCount)
  nextMode.confidenceLevel = nextMode.confidenceScore >= 70 ? 'high' : nextMode.confidenceScore >= 45 ? 'medium' : 'low'
  nextMode.backendConsumable = nextMode.confidenceLevel === 'high'
  nextMode.actionPolicy = nextMode.backendConsumable ? 'candidate_only' : 'confidence_only'
  nextMode.matchedSignals = unique([...(nextMode.matchedSignals ?? []), ...match.matchedSignals])
  nextMode.missingSignals = unique([...(nextMode.missingSignals ?? []), ...match.missingSignals]).slice(0, 12)

  accumulators.set(code, {
    mode: nextMode,
    confidenceScoreTotal,
    matchScoreTotal,
    sortScore,
  })
}

function selectModes(accumulators: Map<string, ModeAccumulator>, role: ConstructionPatternRole, limit: number) {
  return [...accumulators.values()]
    .filter((item) => item.mode.patternRole === role)
    .sort((left, right) => (
      right.sortScore - left.sortScore
      || right.mode.evidenceCount - left.mode.evidenceCount
      || right.mode.patternPriority - left.mode.patternPriority
      || left.mode.patternCode.localeCompare(right.mode.patternCode)
    ))
    .slice(0, limit)
    .map((item) => item.mode)
}

function buildAggregateContext(projectId: string | null, contexts: FactContext[]): FactContext {
  const scopeDimensions = unique(contexts.flatMap((context) => context.scopeDimensions ?? []))
  const rhythmDrivers = unique(contexts.flatMap((context) => context.rhythmDrivers ?? []))
  const projectTypeCodes = mostFrequent(contexts.map((context) => context.projectTypeCode), 3)
  const structureTypeCodes = mostFrequent(contexts.map((context) => context.structureTypeCode), 3)
  const methodVariantCodes = mostFrequent(contexts.flatMap((context) => context.methodVariantCodes ?? []), 8)
  const elementVariantCodes = mostFrequent(contexts.flatMap((context) => context.elementVariantCodes ?? []), 8)
  const phaseWindow = mostFrequent(contexts.map((context) => context.phaseWindow), 1)[0] ?? null
  const primaryWorkfaceType = mostFrequent(contexts.map((context) => context.primaryWorkfaceType), 1)[0] ?? null
  const expansionStrategy = mostFrequent(contexts.map((context) => context.expansionStrategy), 1)[0] ?? null

  return {
    id: 'aggregate-project-context',
    projectId,
    text: contexts.map((context) => context.text).filter(Boolean).slice(0, 80).join(' '),
    projectTypeCode: projectTypeCodes[0] ?? null,
    structureTypeCode: structureTypeCodes[0] ?? null,
    methodVariantCodes,
    elementVariantCodes,
    scopeDimensions,
    rhythmDrivers,
    primaryWorkfaceType,
    phaseWindow,
    expansionStrategy,
    hasScope: scopeDimensions.length > 0,
    hasStandardWork: contexts.some((context) => context.hasStandardWork),
    hasTemplateNode: contexts.some((context) => context.hasTemplateNode),
    hasFeatureProfile: contexts.some((context) => context.hasFeatureProfile),
  }
}

function computeReadinessScore(input: {
  executableCount: number
  scopedCount: number
  standardWorkCount: number
  templateNodeCount: number
  featureProfileCount: number
  selectedModeCount: number
  backendConsumableModeCount: number
}) {
  const denominator = Math.max(input.executableCount, 1)
  const scoped = input.scopedCount / denominator
  const standardWork = input.standardWorkCount / denominator
  const templateNode = input.templateNodeCount / denominator
  const featureProfile = input.featureProfileCount / denominator
  const score = Math.round(
    scoped * 28
    + standardWork * 20
    + templateNode * 12
    + featureProfile * 18
    + Math.min(14, input.selectedModeCount * 4)
    + Math.min(8, input.backendConsumableModeCount * 4),
  )
  return Math.max(0, Math.min(100, score))
}

function readinessLevel(score: number): BuildingPatternExecutionProfile['engineReadiness'] {
  if (score >= 75) return 'strong'
  if (score >= 55) return 'usable'
  return 'limited'
}

export async function buildBuildingPatternExecutionProfile(
  projectId: string | null,
  facts: BuildingPatternExecutionFactInput[],
  profileSource: BuildingPatternExecutionProfile['profileSource'] = 'generic_facts',
): Promise<BuildingPatternExecutionProfile> {
  const executableFacts = facts.filter(isExecutableFact).slice(0, MAX_FACTS_FOR_PROFILE)
  const contexts = executableFacts.map((fact, index) => buildFactContext(projectId, fact, index))
  const scopeDimensionCounts: Record<string, number> = {}
  const rhythmDriverCounts: Record<string, number> = {}
  const projectTypeCodes: string[] = []
  const structureTypeCodes: string[] = []
  const methodVariantCodes: string[] = []
  const elementVariantCodes: string[] = []
  let scopedCount = 0
  let standardWorkCount = 0
  let templateNodeCount = 0
  let featureProfileCount = 0

  for (const context of contexts) {
    if (context.hasScope) scopedCount += 1
    if (context.hasStandardWork) standardWorkCount += 1
    if (context.hasTemplateNode) templateNodeCount += 1
    if (context.hasFeatureProfile) featureProfileCount += 1
    addCount(scopeDimensionCounts, context.scopeDimensions ?? [])
    addCount(rhythmDriverCounts, context.rhythmDrivers ?? [])
    projectTypeCodes.push(...unique([context.projectTypeCode]))
    structureTypeCodes.push(...unique([context.structureTypeCode]))
    methodVariantCodes.push(...(context.methodVariantCodes ?? []))
    elementVariantCodes.push(...(context.elementVariantCodes ?? []))
  }

  const aggregateContext = contexts.length > 0 ? buildAggregateContext(projectId, contexts) : null
  const accumulators = new Map<string, ModeAccumulator>()
  if (aggregateContext) {
    for (const match of await resolveV1474BuildingPatternMatches(aggregateContext.text, aggregateContext)) {
      addModeMatch(accumulators, match)
    }
  }
  for (const context of contexts.slice(0, 200)) {
    for (const match of await resolveV1474BuildingPatternMatches(context.text, context)) {
      addModeMatch(accumulators, match)
    }
  }

  const primaryProjectMode = selectModes(accumulators, 'primary_project_mode', 1)[0] ?? null
  const phaseModes = selectModes(accumulators, 'phase_mode', 8)
  const specialtyDomainModes = selectModes(accumulators, 'specialty_domain_mode', 5)
  const handoverModes = selectModes(accumulators, 'handover_mode', 3)
  const supportingModes = selectModes(accumulators, 'supporting_mode', 3)
  const selectedModes = [
    primaryProjectMode,
    ...phaseModes,
    ...specialtyDomainModes,
    ...handoverModes,
    ...supportingModes,
  ].filter((mode): mode is BuildingPatternExecutionMode => Boolean(mode))
  const backendConsumableModeCount = selectedModes.filter((mode) => mode.backendConsumable).length
  const lowConfidenceModeCount = selectedModes.filter((mode) => mode.confidenceLevel === 'low').length
  const readinessScore = computeReadinessScore({
    executableCount: executableFacts.length,
    scopedCount,
    standardWorkCount,
    templateNodeCount,
    featureProfileCount,
    selectedModeCount: selectedModes.length,
    backendConsumableModeCount,
  })
  const denominator = Math.max(executableFacts.length, 1)

  return {
    projectId,
    profileSource,
    factCount: facts.length,
    executableFactCount: executableFacts.length,
    engineReadiness: readinessLevel(readinessScore),
    engineReadinessScore: readinessScore,
    dataSupport: {
      scopedFactRatio: scopedCount / denominator,
      standardWorkRatio: standardWorkCount / denominator,
      templateNodeRatio: templateNodeCount / denominator,
      featureProfileRatio: featureProfileCount / denominator,
      scopeDimensionCounts,
      rhythmDriverCounts,
    },
    inferredFeatureProfile: {
      projectTypeCodes: mostFrequent(projectTypeCodes, 6),
      structureTypeCodes: mostFrequent(structureTypeCodes, 6),
      methodVariantCodes: mostFrequent(methodVariantCodes, 10),
      elementVariantCodes: mostFrequent(elementVariantCodes, 10),
    },
    modeCombination: {
      primaryProjectMode,
      phaseModes,
      specialtyDomainModes,
      handoverModes,
      supportingModes,
    },
    metrics: {
      buildingPatternExecutionModeCount: selectedModes.length,
      buildingPatternExecutionBackendConsumableModeCount: backendConsumableModeCount,
      buildingPatternExecutionLowConfidenceModeCount: lowConfidenceModeCount,
      buildingPatternExecutionReadinessScore: readinessScore,
      buildingPatternExecutionScopeDimensionCount: Object.keys(scopeDimensionCounts).length,
      buildingPatternExecutionFeatureCoveragePercent: Math.round((featureProfileCount / denominator) * 100),
      buildingPatternExecutionStandardWorkCoveragePercent: Math.round((standardWorkCount / denominator) * 100),
    },
  }
}

export function buildBuildingPatternExecutionProfileReason(profile: BuildingPatternExecutionProfile) {
  const modes = [
    profile.modeCombination.primaryProjectMode,
    ...profile.modeCombination.phaseModes,
    ...profile.modeCombination.specialtyDomainModes,
    ...profile.modeCombination.handoverModes,
  ].filter((mode): mode is BuildingPatternExecutionMode => Boolean(mode))
  if (modes.length === 0) return null
  const modeNames = modes.slice(0, 4).map((mode) => mode.patternName).join(', ')
  return {
    code: 'building_pattern_execution_profile',
    label: 'Building-pattern execution profile resolved',
    detail: `The project organization profile resolved ${modes.length} construction rhythm mode(s): ${modeNames}. Readiness score ${profile.engineReadinessScore}/100.`,
    severity: profile.engineReadiness === 'limited' ? 'info' as const : 'info' as const,
  }
}
