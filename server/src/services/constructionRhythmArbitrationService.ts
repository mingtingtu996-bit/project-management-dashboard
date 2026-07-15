import type {
  BuildingPatternExecutionFactInput,
  BuildingPatternExecutionProfile,
} from './buildingPatternExecutionProfileService.js'
import type {
  ConstructionRhythmExpansionCandidate,
  ConstructionRhythmExpansionResult,
} from './constructionRhythmExpansionService.js'
import type { PlanningBusinessReason } from './planningGenerationReasonService.js'

export type ConstructionRhythmArbitrationSignalType =
  | 'candidate_dependency'
  | 'candidate_earliest_start'
  | 'candidate_duration_context'
  | 'parallel_caution'
  | 'confidence_only'

export type ConstructionRhythmArbitrationSignal = {
  patternCode: string
  patternName: string
  patternRole: ConstructionRhythmExpansionCandidate['patternRole']
  signalType: ConstructionRhythmArbitrationSignalType
  actionPolicy: 'candidate_only' | 'confidence_only'
  reasonCode: string
  reasonText: string
  confidenceScore: number
  backendConsumable: boolean
  rhythmUnit: string
  expansionStrategy: string
  workfaceCount: number
  evidenceFactCount: number
  workfaceKeys: string[]
  dependencyPolicy: 'candidate_only' | 'none'
  earliestStartPolicy: 'candidate_only' | 'confidence_only' | 'none'
  durationContextPolicy: 'context_factor_candidate' | 'confidence_only' | 'none'
  autoApply: false
}

export type ConstructionRhythmArbitrationResult = {
  projectId: string | null
  signalCount: number
  backendConsumableSignalCount: number
  confidenceOnlySignalCount: number
  candidateDependencySignalCount: number
  candidateEarliestStartSignalCount: number
  candidateDurationContextSignalCount: number
  parallelCautionSignalCount: number
  rhythmArbitrationScore: number
  dominantReasonCodes: string[]
  signals: ConstructionRhythmArbitrationSignal[]
  metrics: {
    constructionRhythmArbitrationSignalCount: number
    constructionRhythmBackendConsumableSignalCount: number
    constructionRhythmConfidenceOnlySignalCount: number
    constructionRhythmCandidateDependencySignalCount: number
    constructionRhythmCandidateEarliestStartSignalCount: number
    constructionRhythmCandidateDurationContextSignalCount: number
    constructionRhythmParallelCautionSignalCount: number
    constructionRhythmArbitrationScore: number
  }
}

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

function normalizeLower(value: unknown) {
  return normalizeText(value).toLowerCase()
}

function unique(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map((value) => normalizeText(value)).filter(Boolean)))
}

function isExecutableFact(fact: BuildingPatternExecutionFactInput) {
  if (fact.is_executable === false || fact.is_wbs_summary === true) return false
  const status = normalizeLower(fact.status)
  return !['deleted', 'cancelled', 'canceled', 'closed', 'archived'].includes(status)
}

function hasDependencyRhythm(candidate: ConstructionRhythmExpansionCandidate) {
  if (candidate.staggerRuleCount > 0 || candidate.controlChainCount > 0) return true
  return candidate.rhythmStrategyCodes.some((code) => (
    code.includes('sequence')
    || code.includes('before')
    || code.includes('after')
    || code.includes('following')
    || code.includes('handover')
    || code.includes('gate')
    || code.includes('acceptance')
    || code.includes('chain')
  ))
}

function hasEarliestStartRhythm(candidate: ConstructionRhythmExpansionCandidate) {
  if (candidate.staggerRuleCount > 0 || candidate.controlChainCount > 0) return true
  if (candidate.cautionParallelAcross.length > 0) return true
  return candidate.rhythmStrategyCodes.some((code) => (
    code.includes('before')
    || code.includes('readiness')
    || code.includes('window')
    || code.includes('gate')
    || code.includes('handover')
    || code.includes('first')
  ))
}

function hasDurationContextRhythm(candidate: ConstructionRhythmExpansionCandidate) {
  if (candidate.durationCurveAvailable) return true
  return candidate.rhythmStrategyCodes.some((code) => (
    code.includes('cycle')
    || code.includes('curve')
    || code.includes('capacity')
    || code.includes('weather')
    || code.includes('window')
    || code.includes('hoisting')
    || code.includes('curing')
  ))
}

function buildSignal(
  candidate: ConstructionRhythmExpansionCandidate,
  signalType: ConstructionRhythmArbitrationSignalType,
  reasonCode: string,
  reasonText: string,
): ConstructionRhythmArbitrationSignal {
  const backendConsumable = candidate.backendConsumable && signalType !== 'confidence_only'
  return {
    patternCode: candidate.patternCode,
    patternName: candidate.patternName,
    patternRole: candidate.patternRole,
    signalType,
    actionPolicy: backendConsumable ? 'candidate_only' : 'confidence_only',
    reasonCode,
    reasonText,
    confidenceScore: candidate.confidenceScore,
    backendConsumable,
    rhythmUnit: candidate.rhythmUnit,
    expansionStrategy: candidate.expansionStrategy,
    workfaceCount: candidate.workfaceCount,
    evidenceFactCount: candidate.evidenceFactCount,
    workfaceKeys: candidate.workfaceKeys,
    dependencyPolicy: signalType === 'candidate_dependency' ? 'candidate_only' : 'none',
    earliestStartPolicy: signalType === 'candidate_earliest_start'
      ? (backendConsumable ? 'candidate_only' : 'confidence_only')
      : 'none',
    durationContextPolicy: signalType === 'candidate_duration_context'
      ? (backendConsumable ? 'context_factor_candidate' : 'confidence_only')
      : 'none',
    autoApply: false,
  }
}

function buildCandidateSignals(candidate: ConstructionRhythmExpansionCandidate) {
  const signals: ConstructionRhythmArbitrationSignal[] = []
  if (hasDependencyRhythm(candidate)) {
    signals.push(buildSignal(
      candidate,
      'candidate_dependency',
      'rhythm_dependency_candidate',
      'Workface rhythm, stagger rules, or control chains suggest a dependency candidate. It must be reviewed by downstream planning logic before any dependency is written.',
    ))
  }
  if (hasEarliestStartRhythm(candidate)) {
    signals.push(buildSignal(
      candidate,
      'candidate_earliest_start',
      'rhythm_earliest_start_candidate',
      'Workface handover, readiness gate, or stagger rhythm may affect earliest start. The signal is candidate-only and does not rewrite planned dates.',
    ))
  }
  if (hasDurationContextRhythm(candidate)) {
    signals.push(buildSignal(
      candidate,
      'candidate_duration_context',
      'rhythm_duration_context_candidate',
      'Cycle, curve, capacity, or seasonal rhythm can enrich duration context. It is exposed as a context candidate rather than a direct duration override.',
    ))
  }
  if (candidate.cautionParallelAcross.length > 0) {
    signals.push(buildSignal(
      candidate,
      'parallel_caution',
      'rhythm_parallel_caution',
      'The pattern allows some parallel workfaces but marks other dimensions as caution zones for site capacity checks.',
    ))
  }
  if (!candidate.backendConsumable || candidate.confidenceScore < 70) {
    signals.push(buildSignal(
      candidate,
      'confidence_only',
      'rhythm_confidence_only',
      'The rhythm candidate has limited confidence or insufficient backend readiness, so it can only reduce confidence or support explanation.',
    ))
  }
  return signals
}

function countSignals(signals: ConstructionRhythmArbitrationSignal[], type: ConstructionRhythmArbitrationSignalType) {
  return signals.filter((signal) => signal.signalType === type).length
}

function buildArbitrationScore(
  profile: BuildingPatternExecutionProfile,
  expansion: ConstructionRhythmExpansionResult,
  signals: ConstructionRhythmArbitrationSignal[],
  executableFactCount: number,
) {
  if (signals.length === 0) return 0
  const backendRatio = signals.filter((signal) => signal.backendConsumable).length / signals.length
  const averageConfidence = signals.reduce((total, signal) => total + signal.confidenceScore, 0) / signals.length
  const factSupportScore = executableFactCount > 0
    ? Math.min(100, Math.round((expansion.workfaceCandidateCount / executableFactCount) * 100))
    : 0
  return Math.min(100, Math.round(
    profile.engineReadinessScore * 0.3
    + averageConfidence * 0.35
    + backendRatio * 20
    + factSupportScore * 0.15
  ))
}

function mostFrequentReasonCodes(signals: ConstructionRhythmArbitrationSignal[], limit = 5) {
  const counts = new Map<string, number>()
  for (const signal of signals) {
    counts.set(signal.reasonCode, (counts.get(signal.reasonCode) ?? 0) + 1)
  }
  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, limit)
    .map(([reasonCode]) => reasonCode)
}

export function buildConstructionRhythmArbitration(
  profile: BuildingPatternExecutionProfile,
  expansion: ConstructionRhythmExpansionResult,
  facts: BuildingPatternExecutionFactInput[],
): ConstructionRhythmArbitrationResult {
  const executableFactCount = facts.filter(isExecutableFact).length
  const signals = expansion.candidates
    .flatMap(buildCandidateSignals)
    .sort((left, right) => (
      Number(right.backendConsumable) - Number(left.backendConsumable)
      || right.confidenceScore - left.confidenceScore
      || left.patternCode.localeCompare(right.patternCode)
      || left.signalType.localeCompare(right.signalType)
    ))

  const backendConsumableSignalCount = signals.filter((signal) => signal.backendConsumable).length
  const confidenceOnlySignalCount = signals.filter((signal) => (
    signal.signalType === 'confidence_only'
    || signal.earliestStartPolicy === 'confidence_only'
    || signal.durationContextPolicy === 'confidence_only'
  )).length
  const candidateDependencySignalCount = countSignals(signals, 'candidate_dependency')
  const candidateEarliestStartSignalCount = countSignals(signals, 'candidate_earliest_start')
  const candidateDurationContextSignalCount = countSignals(signals, 'candidate_duration_context')
  const parallelCautionSignalCount = countSignals(signals, 'parallel_caution')
  const rhythmArbitrationScore = buildArbitrationScore(profile, expansion, signals, executableFactCount)

  return {
    projectId: profile.projectId,
    signalCount: signals.length,
    backendConsumableSignalCount,
    confidenceOnlySignalCount,
    candidateDependencySignalCount,
    candidateEarliestStartSignalCount,
    candidateDurationContextSignalCount,
    parallelCautionSignalCount,
    rhythmArbitrationScore,
    dominantReasonCodes: mostFrequentReasonCodes(signals),
    signals,
    metrics: {
      constructionRhythmArbitrationSignalCount: signals.length,
      constructionRhythmBackendConsumableSignalCount: backendConsumableSignalCount,
      constructionRhythmConfidenceOnlySignalCount: confidenceOnlySignalCount,
      constructionRhythmCandidateDependencySignalCount: candidateDependencySignalCount,
      constructionRhythmCandidateEarliestStartSignalCount: candidateEarliestStartSignalCount,
      constructionRhythmCandidateDurationContextSignalCount: candidateDurationContextSignalCount,
      constructionRhythmParallelCautionSignalCount: parallelCautionSignalCount,
      constructionRhythmArbitrationScore: rhythmArbitrationScore,
    },
  }
}

export function buildConstructionRhythmArbitrationReason(
  result: ConstructionRhythmArbitrationResult,
): PlanningBusinessReason | null {
  if (result.signalCount === 0) return null
  const reasonCodes = unique(result.dominantReasonCodes).slice(0, 3).join(', ')
  return {
    code: 'construction_rhythm_arbitration',
    label: 'Construction rhythm arbitration signals prepared',
    detail: `Prepared ${result.signalCount} rhythm arbitration signal(s): ${result.candidateDependencySignalCount} dependency candidate(s), ${result.candidateEarliestStartSignalCount} earliest-start candidate(s), and ${result.candidateDurationContextSignalCount} duration-context candidate(s). These signals are backend context only and do not overwrite task dates or dependencies. Main reason(s): ${reasonCodes}.`,
    severity: result.confidenceOnlySignalCount > result.backendConsumableSignalCount ? 'info' : 'info',
  }
}
