import type {
  BuildingPatternExecutionFactInput,
  BuildingPatternExecutionMode,
  BuildingPatternExecutionProfile,
} from './buildingPatternExecutionProfileService.js'
import type { ConstructionRhythmArbitrationResult } from './constructionRhythmArbitrationService.js'
import type { ConstructionRhythmCoordinationResult } from './constructionRhythmCoordinationService.js'
import type { ConstructionRhythmExpansionResult } from './constructionRhythmExpansionService.js'
import type { PlanningBusinessReason } from './planningGenerationReasonService.js'

export type BuildingPatternExecutionPlanVariant = 'recommended' | 'conservative' | 'compressed' | 'low_confidence'

export type BuildingPatternExecutionPlanCandidate = {
  variant: BuildingPatternExecutionPlanVariant
  actionPolicy: 'candidate_only' | 'confidence_only'
  label: string
  confidenceScore: number
  riskLevel: 'low' | 'medium' | 'high'
  modeCodes: string[]
  rhythmUnits: string[]
  activeChannels: string[]
  workfaceCount: number
  expectedUse: string
  evidenceCodes: string[]
  cautionCodes: string[]
  autoApply: false
}

export type BuildingPatternExecutionPlanCandidateResult = {
  projectId: string | null
  candidateCount: number
  recommendedCandidateCount: number
  conservativeCandidateCount: number
  compressedCandidateCount: number
  lowConfidenceCandidateCount: number
  primaryVariant: BuildingPatternExecutionPlanVariant | null
  maxConfidenceScore: number
  candidates: BuildingPatternExecutionPlanCandidate[]
  metrics: {
    buildingPatternExecutionPlanCandidateCount: number
    buildingPatternExecutionRecommendedPlanCandidateCount: number
    buildingPatternExecutionConservativePlanCandidateCount: number
    buildingPatternExecutionCompressedPlanCandidateCount: number
    buildingPatternExecutionLowConfidencePlanCandidateCount: number
    buildingPatternExecutionPlanCandidateMaxConfidenceScore: number
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

function modeList(profile: BuildingPatternExecutionProfile) {
  return [
    profile.modeCombination.primaryProjectMode,
    ...profile.modeCombination.phaseModes,
    ...profile.modeCombination.specialtyDomainModes,
    ...profile.modeCombination.handoverModes,
    ...profile.modeCombination.supportingModes,
  ].filter((mode): mode is BuildingPatternExecutionMode => Boolean(mode))
}

function isExecutableFact(fact: BuildingPatternExecutionFactInput) {
  if (fact.is_executable === false || fact.is_wbs_summary === true) return false
  const status = normalizeLower(fact.status)
  return !['deleted', 'cancelled', 'canceled', 'closed', 'archived'].includes(status)
}

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)))
}

function riskLevel(score: number, cautionCount: number): BuildingPatternExecutionPlanCandidate['riskLevel'] {
  if (score < 55 || cautionCount >= 4) return 'high'
  if (score < 75 || cautionCount >= 2) return 'medium'
  return 'low'
}

function topModeCodes(profile: BuildingPatternExecutionProfile, limit = 6) {
  return modeList(profile)
    .sort((left, right) => (
      right.confidenceScore - left.confidenceScore
      || right.patternPriority - left.patternPriority
      || left.patternCode.localeCompare(right.patternCode)
    ))
    .slice(0, limit)
    .map((mode) => mode.patternCode)
}

function hasHighPressureContext(coordination: ConstructionRhythmCoordinationResult) {
  return coordination.siteCapacityCoordinationSignalCount > 0
    || coordination.readinessCoordinationSignalCount > 0
    || coordination.qualityCoordinationSignalCount > 0
}

function buildBaseConfidence(params: {
  profile: BuildingPatternExecutionProfile
  expansion: ConstructionRhythmExpansionResult
  arbitration: ConstructionRhythmArbitrationResult
  coordination: ConstructionRhythmCoordinationResult
}) {
  return clampScore(
    params.profile.engineReadinessScore * 0.35
    + params.arbitration.rhythmArbitrationScore * 0.25
    + params.coordination.coordinationScore * 0.25
    + Math.min(100, params.expansion.backendConsumableCandidateCount * 12) * 0.15,
  )
}

function buildEvidenceCodes(params: {
  profile: BuildingPatternExecutionProfile
  expansion: ConstructionRhythmExpansionResult
  arbitration: ConstructionRhythmArbitrationResult
  coordination: ConstructionRhythmCoordinationResult
}) {
  return unique([
    params.profile.engineReadiness !== 'limited' ? `profile:${params.profile.engineReadiness}` : null,
    params.profile.metrics.buildingPatternExecutionModeCount > 0 ? `modes:${params.profile.metrics.buildingPatternExecutionModeCount}` : null,
    params.expansion.candidateCount > 0 ? `workfaces:${params.expansion.workfaceCandidateCount}` : null,
    params.arbitration.candidateDependencySignalCount > 0 ? `dependency:${params.arbitration.candidateDependencySignalCount}` : null,
    params.arbitration.candidateEarliestStartSignalCount > 0 ? `earliest_start:${params.arbitration.candidateEarliestStartSignalCount}` : null,
    params.arbitration.candidateDurationContextSignalCount > 0 ? `duration_context:${params.arbitration.candidateDurationContextSignalCount}` : null,
    params.coordination.activeChannels.length > 0 ? `channels:${params.coordination.activeChannels.length}` : null,
  ])
}

function buildCautionCodes(params: {
  profile: BuildingPatternExecutionProfile
  expansion: ConstructionRhythmExpansionResult
  arbitration: ConstructionRhythmArbitrationResult
  coordination: ConstructionRhythmCoordinationResult
  executableFactCount: number
}) {
  return unique([
    params.profile.engineReadiness === 'limited' ? 'limited_project_profile' : null,
    params.profile.metrics.buildingPatternExecutionLowConfidenceModeCount > 0 ? 'low_confidence_modes' : null,
    params.expansion.limitedCandidateCount > 0 ? 'limited_rhythm_candidates' : null,
    params.arbitration.confidenceOnlySignalCount > 0 ? 'confidence_only_signals' : null,
    params.coordination.confidenceOnlySignalCount > 0 ? 'confidence_only_coordination' : null,
    params.executableFactCount > 0 && params.expansion.workfaceCandidateCount === 0 ? 'missing_workface_support' : null,
    hasHighPressureContext(params.coordination) ? 'site_pressure_or_readiness_context' : null,
  ])
}

function buildCandidate(params: {
  variant: BuildingPatternExecutionPlanVariant
  label: string
  baseConfidence: number
  confidenceDelta: number
  expectedUse: string
  profile: BuildingPatternExecutionProfile
  expansion: ConstructionRhythmExpansionResult
  arbitration: ConstructionRhythmArbitrationResult
  coordination: ConstructionRhythmCoordinationResult
  evidenceCodes: string[]
  cautionCodes: string[]
}): BuildingPatternExecutionPlanCandidate {
  const confidenceScore = clampScore(params.baseConfidence + params.confidenceDelta)
  return {
    variant: params.variant,
    actionPolicy: params.variant === 'low_confidence' ? 'confidence_only' : 'candidate_only',
    label: params.label,
    confidenceScore,
    riskLevel: riskLevel(confidenceScore, params.cautionCodes.length),
    modeCodes: topModeCodes(params.profile),
    rhythmUnits: params.expansion.dominantRhythmUnits,
    activeChannels: params.coordination.activeChannels,
    workfaceCount: params.expansion.workfaceCandidateCount,
    expectedUse: params.expectedUse,
    evidenceCodes: params.evidenceCodes,
    cautionCodes: params.cautionCodes,
    autoApply: false,
  }
}

export function buildBuildingPatternExecutionPlanCandidates(params: {
  profile: BuildingPatternExecutionProfile
  expansion: ConstructionRhythmExpansionResult
  arbitration: ConstructionRhythmArbitrationResult
  coordination: ConstructionRhythmCoordinationResult
  facts: BuildingPatternExecutionFactInput[]
}): BuildingPatternExecutionPlanCandidateResult {
  const executableFactCount = params.facts.filter(isExecutableFact).length
  const baseConfidence = buildBaseConfidence(params)
  const evidenceCodes = buildEvidenceCodes(params)
  const cautionCodes = buildCautionCodes({ ...params, executableFactCount })
  const candidates: BuildingPatternExecutionPlanCandidate[] = []

  if (params.profile.metrics.buildingPatternExecutionModeCount > 0 && params.expansion.candidateCount > 0) {
    candidates.push(buildCandidate({
      ...params,
      variant: 'recommended',
      label: 'Recommended organization plan',
      baseConfidence,
      confidenceDelta: 0,
      expectedUse: 'Use the most supported mode combination as backend context for baseline or monthly-plan generation.',
      evidenceCodes,
      cautionCodes,
    }))
  }

  if (hasHighPressureContext(params.coordination) || params.arbitration.parallelCautionSignalCount > 0 || cautionCodes.length > 0) {
    candidates.push(buildCandidate({
      ...params,
      variant: 'conservative',
      label: 'Conservative organization plan',
      baseConfidence,
      confidenceDelta: -8,
      expectedUse: 'Prefer safer sequencing, stricter readiness checks, and site-capacity buffers when pressure signals are present.',
      evidenceCodes: unique([...evidenceCodes, 'policy:buffer_pressure']),
      cautionCodes,
    }))
  }

  if (
    params.profile.engineReadiness === 'strong'
    && params.expansion.backendConsumableCandidateCount > 0
    && params.arbitration.parallelCautionSignalCount === 0
    && params.coordination.siteCapacityCoordinationSignalCount === 0
  ) {
    candidates.push(buildCandidate({
      ...params,
      variant: 'compressed',
      label: 'Compressed organization plan',
      baseConfidence,
      confidenceDelta: -12,
      expectedUse: 'Allow controlled parallel workface assumptions only when rhythm evidence is strong and pressure signals are low.',
      evidenceCodes: unique([...evidenceCodes, 'policy:controlled_parallel']),
      cautionCodes: unique([...cautionCodes, 'compressed_plan_requires_manual_review']),
    }))
  }

  if (params.profile.engineReadiness === 'limited' || params.arbitration.confidenceOnlySignalCount > 0 || params.coordination.confidenceOnlySignalCount > 0) {
    candidates.push(buildCandidate({
      ...params,
      variant: 'low_confidence',
      label: 'Low-confidence fallback',
      baseConfidence,
      confidenceDelta: -18,
      expectedUse: 'Keep current dates as primary truth and use building-pattern execution output only as explanation or confidence downgrade.',
      evidenceCodes,
      cautionCodes: unique([...cautionCodes, 'do_not_optimize_dates_from_low_confidence_profile']),
    }))
  }

  const sortedCandidates = candidates
    .filter((candidate, index, list) => list.findIndex((item) => item.variant === candidate.variant) === index)
    .sort((left, right) => (
      right.confidenceScore - left.confidenceScore
      || left.variant.localeCompare(right.variant)
    ))

  const maxConfidenceScore = sortedCandidates.reduce((max, candidate) => Math.max(max, candidate.confidenceScore), 0)
  const primaryVariant = sortedCandidates[0]?.variant ?? null
  const countVariant = (variant: BuildingPatternExecutionPlanVariant) => sortedCandidates.filter((candidate) => candidate.variant === variant).length

  return {
    projectId: params.profile.projectId,
    candidateCount: sortedCandidates.length,
    recommendedCandidateCount: countVariant('recommended'),
    conservativeCandidateCount: countVariant('conservative'),
    compressedCandidateCount: countVariant('compressed'),
    lowConfidenceCandidateCount: countVariant('low_confidence'),
    primaryVariant,
    maxConfidenceScore,
    candidates: sortedCandidates,
    metrics: {
      buildingPatternExecutionPlanCandidateCount: sortedCandidates.length,
      buildingPatternExecutionRecommendedPlanCandidateCount: countVariant('recommended'),
      buildingPatternExecutionConservativePlanCandidateCount: countVariant('conservative'),
      buildingPatternExecutionCompressedPlanCandidateCount: countVariant('compressed'),
      buildingPatternExecutionLowConfidencePlanCandidateCount: countVariant('low_confidence'),
      buildingPatternExecutionPlanCandidateMaxConfidenceScore: maxConfidenceScore,
    },
  }
}

export function buildBuildingPatternExecutionPlanCandidateReason(result: BuildingPatternExecutionPlanCandidateResult): PlanningBusinessReason | null {
  if (result.candidateCount === 0) return null
  const variants = result.candidates
    .slice(0, 3)
    .map((candidate) => `${candidate.variant}:${candidate.confidenceScore}`)
    .join(', ')
  return {
    code: 'building_pattern_execution_plan_candidates',
    label: 'Building-pattern execution plan candidates prepared',
    detail: `Prepared ${result.candidateCount} backend-only organization plan candidate(s): ${variants}. They explain recommended/conservative/compressed planning assumptions and do not overwrite task dates or dependencies.`,
    severity: result.lowConfidenceCandidateCount > 0 ? 'info' : 'info',
  }
}
