import {
  createAlgorithmAssetCandidateEvent,
  type AlgorithmAssetCandidateEvent,
  type AlgorithmAssetCandidateEventInput,
} from './algorithmAssetCandidateEventAdapterService.js'
import {
  arbitrateAlgorithmAssetConflict,
  type AlgorithmAssetConflictArbitration,
  type AlgorithmAssetExistingRule,
} from './algorithmAssetConflictService.js'
import {
  persistAlgorithmAssetReplayEvaluation,
  type AlgorithmAssetGovernanceQueryExec,
  type PersistAlgorithmAssetReplayEvaluationResult,
} from './algorithmAssetGovernancePersistenceService.js'
import type { AlgorithmAssetGovernanceEvidence } from './algorithmAssetGovernanceProtocolService.js'

export type AlgorithmAssetReplaySample = {
  sampleId: string
  companyId?: string | null
  projectId?: string | null
  originalPrediction: number
  actual: number
  overlayPrediction: number
}

export type AlgorithmAssetReplayRejectedReason =
  | 'missing_scope'
  | 'scope_mismatch'
  | 'missing_prediction_or_actual'

export type AlgorithmAssetReplayRuntimeImpact =
  | 'publish_gate_evidence'
  | 'shadow_report_only'
  | 'existing_published_rule_continues'
  | 'review_required'
  | 'quarantined'

export type AlgorithmAssetReplayRow = {
  sampleId: string
  companyId?: string
  projectId?: string
  originalPrediction: number
  actual: number
  originalError: number
  overlayPrediction: number
  overlayError: number
  maeImprovement: number
  overcompensated: boolean
  runtimeImpact: AlgorithmAssetReplayRuntimeImpact
}

export type AlgorithmAssetReplayRejectedSample = {
  sampleId: string
  reason: AlgorithmAssetReplayRejectedReason
}

export type AlgorithmAssetReplaySummary = {
  acceptedSampleCount: number
  rejectedSampleCount: number
  originalMae: number | null
  overlayMae: number | null
  maeImprovement: number | null
  overcompensationRate: number
  replayPassed: boolean
  runtimeImpact: AlgorithmAssetReplayRuntimeImpact
}

export type AlgorithmAssetReplayEvaluationInput = {
  candidate: AlgorithmAssetCandidateEventInput
  samples: AlgorithmAssetReplaySample[]
  minAcceptedSamples?: number
  maxOvercompensationRate?: number
  minMaeImprovement?: number
  rollbackTarget?: string | null
  conflictFree?: boolean
  existingRules?: AlgorithmAssetExistingRule[]
}

export type AlgorithmAssetReplayEvaluation = {
  summary: AlgorithmAssetReplaySummary
  rows: AlgorithmAssetReplayRow[]
  rejectedSamples: AlgorithmAssetReplayRejectedSample[]
  governanceEvidence: AlgorithmAssetGovernanceEvidence
  candidateEvent: AlgorithmAssetCandidateEvent
  conflictArbitration?: AlgorithmAssetConflictArbitration
}

export type EvaluateAndPersistAlgorithmAssetReplayInput = AlgorithmAssetReplayEvaluationInput & {
  runKey: string
  queryExec?: AlgorithmAssetGovernanceQueryExec
}

export type EvaluateAndPersistAlgorithmAssetReplayResult = {
  evaluation: AlgorithmAssetReplayEvaluation
  persistence: PersistAlgorithmAssetReplayEvaluationResult
}

function normalizeId(value: string | null | undefined) {
  const trimmed = String(value ?? '').trim()
  return trimmed || undefined
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function scopeRejectionReason(
  candidate: AlgorithmAssetCandidateEventInput,
  sample: AlgorithmAssetReplaySample,
): AlgorithmAssetReplayRejectedReason | null {
  const candidateCompanyId = normalizeId(candidate.companyId)
  const candidateProjectId = normalizeId(candidate.projectId)
  const sampleCompanyId = normalizeId(sample.companyId)
  const sampleProjectId = normalizeId(sample.projectId)

  if (candidateProjectId) {
    if (!sampleCompanyId || !sampleProjectId) return 'missing_scope'
    if (sampleCompanyId !== candidateCompanyId || sampleProjectId !== candidateProjectId) return 'scope_mismatch'
    return null
  }

  if (candidateCompanyId) {
    if (!sampleCompanyId) return 'missing_scope'
    if (sampleCompanyId !== candidateCompanyId) return 'scope_mismatch'
    return null
  }

  if (!sampleCompanyId && !sampleProjectId) return 'missing_scope'
  return null
}

function sampleValueRejectionReason(sample: AlgorithmAssetReplaySample): AlgorithmAssetReplayRejectedReason | null {
  if (
    !isFiniteNumber(sample.originalPrediction)
    || !isFiniteNumber(sample.actual)
    || !isFiniteNumber(sample.overlayPrediction)
  ) {
    return 'missing_prediction_or_actual'
  }
  return null
}

function mean(values: number[]) {
  if (values.length === 0) return null
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function buildRows(samples: AlgorithmAssetReplaySample[]): Omit<AlgorithmAssetReplayRow, 'runtimeImpact'>[] {
  return samples.map((sample) => {
    const originalError = Math.abs(sample.originalPrediction - sample.actual)
    const overlayError = Math.abs(sample.overlayPrediction - sample.actual)
    return {
      sampleId: sample.sampleId,
      companyId: normalizeId(sample.companyId),
      projectId: normalizeId(sample.projectId),
      originalPrediction: sample.originalPrediction,
      actual: sample.actual,
      originalError,
      overlayPrediction: sample.overlayPrediction,
      overlayError,
      maeImprovement: originalError - overlayError,
      overcompensated: overlayError > originalError,
    }
  })
}

function runtimeImpactFor(
  candidate: AlgorithmAssetCandidateEventInput,
  replayPassed: boolean,
  candidateEvent: AlgorithmAssetCandidateEvent,
  conflictArbitration?: AlgorithmAssetConflictArbitration,
): AlgorithmAssetReplayRuntimeImpact {
  if (candidateEvent.governanceDecision.status === 'quarantine_required') return 'quarantined'
  if (!replayPassed) return 'review_required'
  if (candidate.learningMaturity === 'shadow_report_only') return 'shadow_report_only'
  if (conflictArbitration?.activeRuleContinues) return 'existing_published_rule_continues'
  if (conflictArbitration?.runtimeRule === 'candidate_blocked_from_runtime') return 'review_required'
  if (candidateEvent.governanceDecision.canWriteRuntime) return 'publish_gate_evidence'
  return 'review_required'
}

function candidateInputForReplay(
  candidate: AlgorithmAssetCandidateEventInput,
  replayPassed: boolean,
  rollbackTarget: string | null | undefined,
  conflictFree: boolean | undefined,
): AlgorithmAssetCandidateEventInput {
  const isShadowReportOnly = candidate.learningMaturity === 'shadow_report_only'
  return {
    ...candidate,
    automationMaturity: isShadowReportOnly ? 'auto_shadow' : candidate.automationMaturity,
    evidence: {
      ...candidate.evidence,
      replayPassed,
      conflictFree: Boolean(conflictFree && replayPassed),
      rollbackTarget: rollbackTarget ?? candidate.evidence?.rollbackTarget ?? null,
    },
  }
}

export function evaluateAlgorithmAssetReplay(input: AlgorithmAssetReplayEvaluationInput): AlgorithmAssetReplayEvaluation {
  const minAcceptedSamples = input.minAcceptedSamples ?? 3
  const maxOvercompensationRate = input.maxOvercompensationRate ?? 0.25
  const minMaeImprovement = input.minMaeImprovement ?? 0
  const acceptedSamples: AlgorithmAssetReplaySample[] = []
  const rejectedSamples: AlgorithmAssetReplayRejectedSample[] = []

  for (const sample of input.samples) {
    const rejectionReason = sampleValueRejectionReason(sample) ?? scopeRejectionReason(input.candidate, sample)
    if (rejectionReason) {
      rejectedSamples.push({ sampleId: sample.sampleId, reason: rejectionReason })
    } else {
      acceptedSamples.push(sample)
    }
  }

  const rowDrafts = buildRows(acceptedSamples)
  const originalMae = mean(rowDrafts.map((row) => row.originalError))
  const overlayMae = mean(rowDrafts.map((row) => row.overlayError))
  const maeImprovement = originalMae === null || overlayMae === null ? null : originalMae - overlayMae
  const overcompensationRate = rowDrafts.length === 0
    ? 0
    : rowDrafts.filter((row) => row.overcompensated).length / rowDrafts.length
  const replayPassed = rowDrafts.length >= minAcceptedSamples
    && maeImprovement !== null
    && maeImprovement > minMaeImprovement
    && overcompensationRate <= maxOvercompensationRate

  const candidateEvent = createAlgorithmAssetCandidateEvent(candidateInputForReplay(
    input.candidate,
    replayPassed,
    input.rollbackTarget,
    input.conflictFree,
  ))
  if (input.candidate.learningMaturity === 'shadow_report_only') {
    candidateEvent.governanceDecision.reasons.push('shadow_report_only_replay_cannot_write_runtime')
  }

  const conflictArbitration = input.existingRules
    ? arbitrateAlgorithmAssetConflict({ candidate: candidateEvent, existingRules: input.existingRules })
    : undefined
  const runtimeImpact = runtimeImpactFor(input.candidate, replayPassed, candidateEvent, conflictArbitration)
  const rows = rowDrafts.map((row) => ({ ...row, runtimeImpact }))
  const governanceEvidence: AlgorithmAssetGovernanceEvidence = {
    replayPassed,
    conflictFree: Boolean(input.conflictFree && replayPassed),
    rollbackTarget: input.rollbackTarget ?? null,
  }

  return {
    summary: {
      acceptedSampleCount: acceptedSamples.length,
      rejectedSampleCount: rejectedSamples.length,
      originalMae,
      overlayMae,
      maeImprovement,
      overcompensationRate,
      replayPassed,
      runtimeImpact,
    },
    rows,
    rejectedSamples,
    governanceEvidence,
    candidateEvent,
    conflictArbitration,
  }
}

export async function evaluateAndPersistAlgorithmAssetReplay(
  input: EvaluateAndPersistAlgorithmAssetReplayInput,
): Promise<EvaluateAndPersistAlgorithmAssetReplayResult> {
  const evaluation = evaluateAlgorithmAssetReplay(input)
  const persistence = await persistAlgorithmAssetReplayEvaluation({
    runKey: input.runKey,
    evaluation,
    queryExec: input.queryExec,
  })

  return {
    evaluation,
    persistence,
  }
}
