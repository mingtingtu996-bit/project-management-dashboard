import type { BuildingPatternExecutionFactInput } from './buildingPatternExecutionProfileService.js'
import type {
  ConstructionRhythmArbitrationResult,
  ConstructionRhythmArbitrationSignal,
} from './constructionRhythmArbitrationService.js'
import type { PlanningBusinessReason } from './planningGenerationReasonService.js'

type CoordinationChannel =
  | 'workflow_sequence'
  | 'process_constraint'
  | 'earliest_start_rule'
  | 'resource_conflict'
  | 'progress_velocity'
  | 'external_readiness'
  | 'progress_quality'
  | 'duration_experience'

type CoordinationPolicy = 'candidate_only' | 'confidence_only'

export type ConstructionRhythmCoordinationSignal = {
  channel: CoordinationChannel
  actionPolicy: CoordinationPolicy
  policy: CoordinationPolicy
  patternCode: string
  patternName: string
  sourceSignalType: ConstructionRhythmArbitrationSignal['signalType']
  reasonCode: string
  confidenceScore: number
  impactWeight: number
  factSupportCount: number
  precedencePolicy: string
  backendConsumable: boolean
  autoApply: false
}

export type ConstructionRhythmCoordinationResult = {
  projectId: string | null
  signalCount: number
  backendConsumableSignalCount: number
  confidenceOnlySignalCount: number
  dependencyCoordinationSignalCount: number
  earliestStartCoordinationSignalCount: number
  durationContextCoordinationSignalCount: number
  siteCapacityCoordinationSignalCount: number
  progressCoordinationSignalCount: number
  readinessCoordinationSignalCount: number
  qualityCoordinationSignalCount: number
  durationExperienceCoordinationSignalCount: number
  coordinationScore: number
  activeChannels: CoordinationChannel[]
  signals: ConstructionRhythmCoordinationSignal[]
  metrics: {
    constructionRhythmCoordinationSignalCount: number
    constructionRhythmCoordinationBackendConsumableSignalCount: number
    constructionRhythmCoordinationConfidenceOnlySignalCount: number
    constructionRhythmDependencyCoordinationSignalCount: number
    constructionRhythmEarliestStartCoordinationSignalCount: number
    constructionRhythmDurationContextCoordinationSignalCount: number
    constructionRhythmSiteCapacityCoordinationSignalCount: number
    constructionRhythmProgressCoordinationSignalCount: number
    constructionRhythmReadinessCoordinationSignalCount: number
    constructionRhythmQualityCoordinationSignalCount: number
    constructionRhythmDurationExperienceCoordinationSignalCount: number
    constructionRhythmCoordinationScore: number
  }
}

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

function normalizeLower(value: unknown) {
  return normalizeText(value).toLowerCase()
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function readArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function unique<T extends string>(values: Array<T | null | undefined>) {
  return Array.from(new Set(values.filter(Boolean) as T[]))
}

function isExecutableFact(fact: BuildingPatternExecutionFactInput) {
  if (fact.is_executable === false || fact.is_wbs_summary === true) return false
  const status = normalizeLower(fact.status)
  return !['deleted', 'cancelled', 'canceled', 'closed', 'archived'].includes(status)
}

function factStatus(fact: BuildingPatternExecutionFactInput) {
  return normalizeLower(fact.status)
}

function hasDependencyFact(fact: BuildingPatternExecutionFactInput) {
  const metadata = readRecord(fact.standard_task_metadata)
  const generationMetadata = readRecord(fact.generation_metadata)
  return Boolean(
    normalizeText(fact.dependency_task_id)
    || normalizeText(fact.predecessor_task_id)
    || readArray(fact.dependencies).length > 0
    || readArray(metadata.crossItemWorkflow).length > 0
    || readArray(metadata.cross_item_workflow).length > 0
    || readArray(metadata.standardInternalFlow).length > 0
    || readArray(metadata.standard_internal_flow).length > 0
    || readArray(generationMetadata.dependencyCandidates).length > 0
    || readArray(generationMetadata.dependency_candidates).length > 0
  )
}

function hasExternalReadinessFact(fact: BuildingPatternExecutionFactInput) {
  const metadata = readRecord(fact.standard_task_metadata)
  const generationMetadata = readRecord(fact.generation_metadata)
  return Boolean(
    fact.acceptance_required === true
    || fact.material_required === true
    || fact.drawing_required === true
    || normalizeText(fact.condition_status)
    || normalizeText(fact.blocking_level)
    || normalizeText(fact.obstacle_status)
    || readArray(fact.conditions).length > 0
    || readArray(fact.obstacles).length > 0
    || readArray(metadata.startConditions).length > 0
    || readArray(metadata.start_conditions).length > 0
    || readArray(generationMetadata.blocking_factors).length > 0
  )
}

function hasProgressFact(fact: BuildingPatternExecutionFactInput) {
  const progress = Number(fact.progress ?? fact.current_progress)
  return Boolean(Number.isFinite(progress) || factStatus(fact) === 'in_progress' || normalizeText(fact.actual_start_date))
}

function hasProgressQualityFact(fact: BuildingPatternExecutionFactInput) {
  const metadata = readRecord(fact.standard_task_metadata)
  const generationMetadata = readRecord(fact.generation_metadata)
  return Boolean(
    normalizeText(fact.progress_updated_at)
    || normalizeText(fact.last_progress_reported_at)
    || Number.isFinite(Number(fact.completed_quantity))
    || Number.isFinite(Number(fact.planned_quantity))
    || readRecord(metadata.progressQuality).observationType
    || readRecord(metadata.progress_quality).observation_type
    || readArray(generationMetadata.data_quality_flags).length > 0
  )
}

function hasDurationExperienceFact(fact: BuildingPatternExecutionFactInput) {
  const metadata = readRecord(fact.standard_task_metadata)
  const generationMetadata = readRecord(fact.generation_metadata)
  return Boolean(
    normalizeText(fact.standard_work_code)
    || normalizeText(fact.template_node_id)
    || normalizeText(metadata.durationBaselineCode)
    || normalizeText(metadata.duration_baseline_code)
    || normalizeText(generationMetadata.durationProvenance)
    || normalizeText(generationMetadata.duration_provenance)
  )
}

function hasResourcePressureFact(fact: BuildingPatternExecutionFactInput) {
  return Boolean(
    normalizeText(fact.participant_unit_id)
    || normalizeText(fact.responsible_unit_id)
    || normalizeText(fact.building_object_id)
    || normalizeText(fact.floor_object_id)
    || normalizeText(fact.physical_zone_object_id)
    || normalizeText(fact.functional_area_object_id)
    || normalizeText(fact.engineering_object_id)
    || hasExternalReadinessFact(fact)
  )
}

function factSupportCount(facts: BuildingPatternExecutionFactInput[], predicate: (fact: BuildingPatternExecutionFactInput) => boolean) {
  return facts.filter((fact) => isExecutableFact(fact) && predicate(fact)).length
}

function channelImpactWeight(channel: CoordinationChannel, signal: ConstructionRhythmArbitrationSignal, supportCount: number) {
  const base = signal.backendConsumable ? 1 : 0.55
  const confidence = Math.max(0.35, Math.min(1, signal.confidenceScore / 100))
  const support = supportCount > 0 ? Math.min(1.25, 0.75 + supportCount * 0.08) : 0.55
  const channelWeight: Record<CoordinationChannel, number> = {
    workflow_sequence: 1.15,
    process_constraint: 1,
    earliest_start_rule: 1.1,
    resource_conflict: 1.2,
    progress_velocity: 1.15,
    external_readiness: 1,
    progress_quality: 0.9,
    duration_experience: 1.05,
  }
  return Number((base * confidence * support * channelWeight[channel]).toFixed(3))
}

function precedencePolicyForChannel(channel: CoordinationChannel, signal: ConstructionRhythmArbitrationSignal) {
  if (channel === 'resource_conflict') {
    return signal.signalType === 'parallel_caution'
      ? 'resource_conflict_uses_actual_progress_and_site_capacity_as_primary; building_pattern.parallelPolicy is a caution hint only'
      : 'building_pattern duration rhythm may enrich resource context, but resource_conflict owns final pressure judgement'
  }
  if (channel === 'external_readiness') {
    return 'external_readiness owns hard/soft condition judgement; building_pattern supplies workface handover context only'
  }
  if (channel === 'progress_velocity') {
    return 'progress_velocity owns task execution curve judgement; building_pattern supplies rhythm curve context only'
  }
  return 'existing schedule-rule channel owns final judgement; building_pattern remains backend context'
}

function buildCoordinationSignal(
  channel: CoordinationChannel,
  signal: ConstructionRhythmArbitrationSignal,
  factSupportCountValue: number,
  forceConfidenceOnly = false,
): ConstructionRhythmCoordinationSignal {
  const policy: CoordinationPolicy = forceConfidenceOnly || !signal.backendConsumable ? 'confidence_only' : 'candidate_only'
  return {
    channel,
    actionPolicy: policy,
    policy,
    patternCode: signal.patternCode,
    patternName: signal.patternName,
    sourceSignalType: signal.signalType,
    reasonCode: `${signal.reasonCode}:${channel}`,
    confidenceScore: signal.confidenceScore,
    impactWeight: channelImpactWeight(channel, signal, factSupportCountValue),
    factSupportCount: factSupportCountValue,
    precedencePolicy: precedencePolicyForChannel(channel, signal),
    backendConsumable: signal.backendConsumable && policy === 'candidate_only',
    autoApply: false,
  }
}

function channelsForSignal(signal: ConstructionRhythmArbitrationSignal) {
  const channels: CoordinationChannel[] = []
  if (signal.signalType === 'candidate_dependency') {
    channels.push('workflow_sequence', 'process_constraint')
  }
  if (signal.signalType === 'candidate_earliest_start') {
    channels.push('earliest_start_rule', 'external_readiness')
  }
  if (signal.signalType === 'candidate_duration_context') {
    channels.push('progress_velocity', 'resource_conflict', 'duration_experience')
  }
  if (signal.signalType === 'parallel_caution') {
    channels.push('resource_conflict')
  }
  if (signal.signalType === 'confidence_only') {
    channels.push('progress_quality')
  }
  return unique(channels)
}

function supportForChannel(channel: CoordinationChannel, facts: BuildingPatternExecutionFactInput[]) {
  switch (channel) {
    case 'workflow_sequence':
    case 'process_constraint':
      return factSupportCount(facts, hasDependencyFact)
    case 'earliest_start_rule':
    case 'external_readiness':
      return factSupportCount(facts, hasExternalReadinessFact)
    case 'resource_conflict':
      return factSupportCount(facts, hasResourcePressureFact)
    case 'progress_velocity':
      return factSupportCount(facts, hasProgressFact)
    case 'progress_quality':
      return factSupportCount(facts, hasProgressQualityFact)
    case 'duration_experience':
      return factSupportCount(facts, hasDurationExperienceFact)
    default:
      return 0
  }
}

function countChannel(signals: ConstructionRhythmCoordinationSignal[], channel: CoordinationChannel) {
  return signals.filter((signal) => signal.channel === channel).length
}

function buildCoordinationScore(signals: ConstructionRhythmCoordinationSignal[]) {
  if (signals.length === 0) return 0
  const averageImpact = signals.reduce((sum, signal) => sum + signal.impactWeight, 0) / signals.length
  const backendRatio = signals.filter((signal) => signal.backendConsumable).length / signals.length
  const channelDiversity = unique(signals.map((signal) => signal.channel)).length
  return Math.min(100, Math.round(averageImpact * 55 + backendRatio * 25 + Math.min(20, channelDiversity * 2.5)))
}

export function buildConstructionRhythmCoordination(
  arbitration: ConstructionRhythmArbitrationResult,
  facts: BuildingPatternExecutionFactInput[],
): ConstructionRhythmCoordinationResult {
  const signals = arbitration.signals
    .flatMap((signal) => channelsForSignal(signal).map((channel) => {
      const supportCount = supportForChannel(channel, facts)
      const forceConfidenceOnly = supportCount === 0 && channel !== 'progress_quality'
      return buildCoordinationSignal(channel, signal, supportCount, forceConfidenceOnly)
    }))
    .sort((left, right) => (
      Number(right.backendConsumable) - Number(left.backendConsumable)
      || right.impactWeight - left.impactWeight
      || left.channel.localeCompare(right.channel)
      || left.patternCode.localeCompare(right.patternCode)
    ))

  const backendConsumableSignalCount = signals.filter((signal) => signal.backendConsumable).length
  const confidenceOnlySignalCount = signals.filter((signal) => signal.policy === 'confidence_only').length
  const dependencyCoordinationSignalCount = countChannel(signals, 'workflow_sequence') + countChannel(signals, 'process_constraint')
  const earliestStartCoordinationSignalCount = countChannel(signals, 'earliest_start_rule')
  const durationContextCoordinationSignalCount = countChannel(signals, 'progress_velocity')
    + countChannel(signals, 'resource_conflict')
    + countChannel(signals, 'external_readiness')
    + countChannel(signals, 'progress_quality')
    + countChannel(signals, 'duration_experience')
  const siteCapacityCoordinationSignalCount = countChannel(signals, 'resource_conflict')
  const progressCoordinationSignalCount = countChannel(signals, 'progress_velocity')
  const readinessCoordinationSignalCount = countChannel(signals, 'external_readiness')
  const qualityCoordinationSignalCount = countChannel(signals, 'progress_quality')
  const durationExperienceCoordinationSignalCount = countChannel(signals, 'duration_experience')
  const coordinationScore = buildCoordinationScore(signals)

  return {
    projectId: arbitration.projectId,
    signalCount: signals.length,
    backendConsumableSignalCount,
    confidenceOnlySignalCount,
    dependencyCoordinationSignalCount,
    earliestStartCoordinationSignalCount,
    durationContextCoordinationSignalCount,
    siteCapacityCoordinationSignalCount,
    progressCoordinationSignalCount,
    readinessCoordinationSignalCount,
    qualityCoordinationSignalCount,
    durationExperienceCoordinationSignalCount,
    coordinationScore,
    activeChannels: unique(signals.map((signal) => signal.channel)),
    signals,
    metrics: {
      constructionRhythmCoordinationSignalCount: signals.length,
      constructionRhythmCoordinationBackendConsumableSignalCount: backendConsumableSignalCount,
      constructionRhythmCoordinationConfidenceOnlySignalCount: confidenceOnlySignalCount,
      constructionRhythmDependencyCoordinationSignalCount: dependencyCoordinationSignalCount,
      constructionRhythmEarliestStartCoordinationSignalCount: earliestStartCoordinationSignalCount,
      constructionRhythmDurationContextCoordinationSignalCount: durationContextCoordinationSignalCount,
      constructionRhythmSiteCapacityCoordinationSignalCount: siteCapacityCoordinationSignalCount,
      constructionRhythmProgressCoordinationSignalCount: progressCoordinationSignalCount,
      constructionRhythmReadinessCoordinationSignalCount: readinessCoordinationSignalCount,
      constructionRhythmQualityCoordinationSignalCount: qualityCoordinationSignalCount,
      constructionRhythmDurationExperienceCoordinationSignalCount: durationExperienceCoordinationSignalCount,
      constructionRhythmCoordinationScore: coordinationScore,
    },
  }
}

export function buildConstructionRhythmCoordinationReason(
  result: ConstructionRhythmCoordinationResult,
): PlanningBusinessReason | null {
  if (result.signalCount === 0) return null
  const channels = result.activeChannels.slice(0, 5).join(', ')
  return {
    code: 'construction_rhythm_coordination',
    label: 'Construction rhythm coordinated with schedule rules',
    detail: `Coordinated ${result.signalCount} rhythm signal(s) with existing schedule-rule channels: ${channels}. Dependency, earliest-start, duration, site-capacity, progress, readiness, quality, and duration-experience channels remain candidate/context only and do not rewrite task dates or dependencies.`,
    severity: 'info',
  }
}
