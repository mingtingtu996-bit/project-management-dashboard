import type { T2RhythmScheduleCandidateNetworkPhase1Evaluation } from './t2RhythmScheduleCandidateNetworkEvaluationService.js'
import type { T2RhythmPhase1MultiNetworkSelectionTrustGate } from './t2DivisionRhythmTemplateRegistryService.js'

export type T2RhythmSchedulePhase1SelectionInput = {
  selectionId: string
  evaluations: T2RhythmScheduleCandidateNetworkPhase1Evaluation[]
}

export type T2RhythmSchedulePhase1RejectedCandidate = {
  candidateId: string
  status: 'candidate_conflict' | 'receipt_missing' | 'selector_receipt_missing' | 'not_phase1_ready'
  reasonCodes: string[]
  conflictCodes: string[]
  priorityOverrideBlocked: boolean
}

export type T2RhythmSchedulePhase1Selection = {
  source: 't2_rhythm_schedule_phase1_selection'
  selectionId: string
  status: 'phase1_selection_ready' | 'manual_review_required'
  selectedCandidateId: string | null
  selectedEvaluation: T2RhythmScheduleCandidateNetworkPhase1Evaluation | null
  eligibleCandidateIds: string[]
  rejectedCandidates: T2RhythmSchedulePhase1RejectedCandidate[]
  combinationConsistencyGate: {
    receiptRequired: true
    selectorReceiptRequired: true
    liveReplayTrustGateRequired: true
    status: 'pass' | 'pass_with_manual_review_rejections' | 'blocked'
    rejectedConflictCandidateCount: number
    rejectedMissingReceiptCandidateCount: number
    rejectedMissingSelectorReceiptCandidateCount: number
    rejectedLiveReplayTrustGateCandidateCount: number
  }
  selectionBasis: {
    strategy: 'assembly_compatible_then_shorter_span'
    assemblyFeasibilityRequired: true
    linearPriorityCanOverrideAssemblyConflict: false
    selectorReceiptRequired: true
    liveReplayTrustGateRequired: true
    rankSignals: string[]
  }
  mutationBoundary: {
    writesTaskDependencies: false
    writesPlanDates: false
    writesCriticalPathFacts: false
    writesSeed: false
    writesBaseline: false
    writesRuntimePublications: false
  }
}

function hasAssemblyReceipt(evaluation: T2RhythmScheduleCandidateNetworkPhase1Evaluation) {
  return Boolean(evaluation.templateAssemblyCompatibilityReceipt)
}

function hasSelectorReceipt(evaluation: T2RhythmScheduleCandidateNetworkPhase1Evaluation) {
  return Boolean(
    evaluation.selectionReceipts?.length
    && evaluation.scheduleTrustEvidence.selectionReceiptCount === evaluation.selectionReceipts.length
    && evaluation.scheduleTrustEvidence.selectorReceiptAuditStatus === 'ready',
  )
}

function hasLiveReplayTrustGate(evaluation: T2RhythmScheduleCandidateNetworkPhase1Evaluation) {
  return Boolean(
    evaluation.scheduleTrustEvidence.standardLibraryTrustGateStatus === 'shadow_replay_ready_not_publishable'
    && evaluation.scheduleTrustEvidence.standardLibraryTrustBoundary === 'archived_live_shadow_replay_only'
    && evaluation.scheduleTrustEvidence.canTrustForRealScheduleCalibration === true,
  )
}

function rejectionFor(
  evaluation: T2RhythmScheduleCandidateNetworkPhase1Evaluation,
): T2RhythmSchedulePhase1RejectedCandidate | null {
  const receipt = evaluation.templateAssemblyCompatibilityReceipt
  if (!receipt) {
    return {
      candidateId: evaluation.candidateId,
      status: 'receipt_missing',
      reasonCodes: ['template_assembly_receipt_missing'],
      conflictCodes: [],
      priorityOverrideBlocked: false,
    }
  }
  if (!hasSelectorReceipt(evaluation)) {
    return {
      candidateId: evaluation.candidateId,
      status: 'selector_receipt_missing',
      reasonCodes: ['selector_receipt_missing'],
      conflictCodes: [],
      priorityOverrideBlocked: receipt.priorityOverrideBlocked,
    }
  }

  const conflictCodes = receipt.conflictCodes ?? []
  const reasonCodes: string[] = []
  if (receipt.compatibilityStatus !== 'compatible_candidate' || conflictCodes.length > 0) {
    reasonCodes.push('template_assembly_conflict')
  }
  if (receipt.priorityOverrideBlocked) {
    reasonCodes.push('priority_override_blocked')
  }
  if (!evaluation.canEnterC1913Phase1Selection || evaluation.status !== 'phase1_readonly_evaluation_ready') {
    reasonCodes.push('phase1_evaluation_not_ready')
  }
  if (!hasLiveReplayTrustGate(evaluation)) {
    reasonCodes.push('live_replay_trust_gate_not_ready')
  }

  if (reasonCodes.length === 0) return null
  return {
    candidateId: evaluation.candidateId,
    status: conflictCodes.length > 0 || receipt.compatibilityStatus === 'candidate_conflict'
      ? 'candidate_conflict'
      : 'not_phase1_ready',
    reasonCodes,
    conflictCodes,
    priorityOverrideBlocked: receipt.priorityOverrideBlocked,
  }
}

function isEligible(evaluation: T2RhythmScheduleCandidateNetworkPhase1Evaluation) {
  const receipt = evaluation.templateAssemblyCompatibilityReceipt
  return Boolean(
    receipt
    && receipt.compatibilityStatus === 'compatible_candidate'
    && !receipt.priorityOverrideBlocked
    && receipt.conflictCodes.length === 0
    && hasSelectorReceipt(evaluation)
    && hasLiveReplayTrustGate(evaluation)
    && evaluation.canEnterC1913Phase1Selection
    && evaluation.status === 'phase1_readonly_evaluation_ready',
  )
}

function compareEligibleEvaluations(
  left: T2RhythmScheduleCandidateNetworkPhase1Evaluation,
  right: T2RhythmScheduleCandidateNetworkPhase1Evaluation,
) {
  if (left.networkSpanDays !== right.networkSpanDays) return left.networkSpanDays - right.networkSpanDays
  if (left.criticalWindowCodes.length !== right.criticalWindowCodes.length) {
    return right.criticalWindowCodes.length - left.criticalWindowCodes.length
  }
  return left.candidateId.localeCompare(right.candidateId)
}

const REJECTED_CANDIDATE_REVIEW_PRIORITY: Record<T2RhythmSchedulePhase1RejectedCandidate['status'], number> = {
  candidate_conflict: 0,
  receipt_missing: 1,
  selector_receipt_missing: 2,
  not_phase1_ready: 3,
}

function compareRejectedCandidates(
  left: T2RhythmSchedulePhase1RejectedCandidate,
  right: T2RhythmSchedulePhase1RejectedCandidate,
) {
  const priorityDelta = REJECTED_CANDIDATE_REVIEW_PRIORITY[left.status] - REJECTED_CANDIDATE_REVIEW_PRIORITY[right.status]
  if (priorityDelta !== 0) return priorityDelta
  return left.candidateId.localeCompare(right.candidateId)
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map((value) => String(value ?? '').trim()).filter(Boolean)))
}

function phase1SelectionGateMutationBoundary(): T2RhythmPhase1MultiNetworkSelectionTrustGate['mutationBoundary'] {
  return {
    writesTaskDependencies: false,
    writesPlanDates: false,
    writesCriticalPathFacts: false,
    writesSeed: false,
    writesBaseline: false,
    writesRuntimePublications: false,
  }
}

export function buildT2RhythmPhase1MultiNetworkSelectionTrustGate(input: {
  selection: T2RhythmSchedulePhase1Selection
  evidenceMode: T2RhythmPhase1MultiNetworkSelectionTrustGate['evidenceMode']
  selectedTemplateIds?: string[]
  selectionEvidenceRefs?: string[]
  minimumSelectionCount?: number
  scenarioCoverageCount?: number
  minimumScenarioCoverageCount?: number
}): T2RhythmPhase1MultiNetworkSelectionTrustGate {
  const selectedTemplateIds = uniqueStrings([
    ...(input.selectedTemplateIds ?? []),
    ...(input.selection.selectedEvaluation?.scheduleTrustEvidence.selectedTemplateIds ?? []),
  ])
  const selectionEvidenceRefs = uniqueStrings(input.selectionEvidenceRefs ?? [])
  const readySelectionCount = input.selection.status === 'phase1_selection_ready' ? 1 : 0
  const minimumSelectionCount = Math.max(1, Math.trunc(input.minimumSelectionCount ?? 1))
  const scenarioCoverageCount = Math.max(0, Math.trunc(input.scenarioCoverageCount ?? readySelectionCount))
  const minimumScenarioCoverageCount = Math.max(1, Math.trunc(input.minimumScenarioCoverageCount ?? 1))
  const eligibleCandidateCount = input.selection.eligibleCandidateIds.length
  const rejectedConflictCandidateCount = input.selection.combinationConsistencyGate.rejectedConflictCandidateCount
  const archivedEvidenceMode = input.evidenceMode === 'archived_phase1_selector_replay'
  const selectorReady = Boolean(
    archivedEvidenceMode
      && input.selection.status === 'phase1_selection_ready'
      && input.selection.combinationConsistencyGate.status !== 'blocked'
      && input.selection.selectedEvaluation?.scheduleTrustEvidence.selectorReceiptAuditStatus === 'ready'
      && readySelectionCount >= minimumSelectionCount
      && scenarioCoverageCount >= minimumScenarioCoverageCount
      && eligibleCandidateCount > 0
      && rejectedConflictCandidateCount > 0
      && selectedTemplateIds.length > 0
      && selectionEvidenceRefs.length > 0,
  )

  return {
    source: 't2_rhythm_phase1_multinetwork_selection_trust_gate',
    status: selectorReady
      ? 'phase1_multinetwork_selection_ready_not_publishable'
      : 'not_trustworthy_for_real_schedule_selection',
    evidenceMode: input.evidenceMode,
    trustBoundary: archivedEvidenceMode
      ? 'archived_phase1_selector_replay_only'
      : 'representative_shadow_probe_only',
    canTrustForRealScheduleSelection: selectorReady,
    readySelectionCount,
    minimumSelectionCount,
    scenarioCoverageCount,
    minimumScenarioCoverageCount,
    eligibleCandidateCount,
    rejectedConflictCandidateCount,
    selectedTemplateIds,
    selectionEvidenceRefs,
    releaseBlockers: selectorReady
      ? []
      : uniqueStrings([
          'c19_13_phase1_multinetwork_selection_required',
          archivedEvidenceMode ? '' : 'archived_phase1_selector_replay_required',
          input.selection.status === 'phase1_selection_ready' ? '' : 'phase1_selection_not_ready',
          selectedTemplateIds.length > 0 ? '' : 'selected_t2_template_required',
          selectionEvidenceRefs.length > 0 ? '' : 'selector_replay_evidence_ref_required',
          eligibleCandidateCount > 0 ? '' : 'eligible_selector_candidate_required',
          rejectedConflictCandidateCount > 0 ? '' : 'rejected_conflict_candidate_required',
          scenarioCoverageCount >= minimumScenarioCoverageCount ? '' : 'scenario_coverage_required',
        ]),
    mutationBoundary: phase1SelectionGateMutationBoundary(),
  }
}

export function selectT2RhythmSchedulePhase1Network(
  input: T2RhythmSchedulePhase1SelectionInput,
): T2RhythmSchedulePhase1Selection {
  const rejectedCandidates = input.evaluations
    .map(rejectionFor)
    .filter((candidate): candidate is T2RhythmSchedulePhase1RejectedCandidate => candidate != null)
    .sort(compareRejectedCandidates)
  const eligibleEvaluations = input.evaluations
    .filter(isEligible)
    .sort(compareEligibleEvaluations)
  const selectedEvaluation = eligibleEvaluations[0] ?? null
  const rejectedConflictCandidateCount = rejectedCandidates
    .filter((candidate) => candidate.status === 'candidate_conflict').length
  const rejectedMissingReceiptCandidateCount = rejectedCandidates
    .filter((candidate) => candidate.status === 'receipt_missing').length
  const rejectedMissingSelectorReceiptCandidateCount = rejectedCandidates
    .filter((candidate) => candidate.status === 'selector_receipt_missing').length
  const rejectedLiveReplayTrustGateCandidateCount = rejectedCandidates
    .filter((candidate) => candidate.status === 'not_phase1_ready').length

  return {
    source: 't2_rhythm_schedule_phase1_selection',
    selectionId: input.selectionId,
    status: selectedEvaluation ? 'phase1_selection_ready' : 'manual_review_required',
    selectedCandidateId: selectedEvaluation?.candidateId ?? null,
    selectedEvaluation,
    eligibleCandidateIds: eligibleEvaluations.map((evaluation) => evaluation.candidateId),
    rejectedCandidates,
    combinationConsistencyGate: {
      receiptRequired: true,
      selectorReceiptRequired: true,
      liveReplayTrustGateRequired: true,
      status: selectedEvaluation
        ? rejectedCandidates.length > 0 ? 'pass_with_manual_review_rejections' : 'pass'
        : 'blocked',
      rejectedConflictCandidateCount,
      rejectedMissingReceiptCandidateCount,
      rejectedMissingSelectorReceiptCandidateCount,
      rejectedLiveReplayTrustGateCandidateCount,
    },
    selectionBasis: {
      strategy: 'assembly_compatible_then_shorter_span',
      assemblyFeasibilityRequired: true,
      linearPriorityCanOverrideAssemblyConflict: false,
      selectorReceiptRequired: true,
      liveReplayTrustGateRequired: true,
      rankSignals: [
        'template_assembly_compatibility_receipt',
        'selector_receipt_audit_trail',
        'standard_library_live_replay_trust_gate',
        'can_enter_c19_13_phase1_selection',
        'network_span_days',
        'critical_window_count',
      ],
    },
    mutationBoundary: {
      writesTaskDependencies: false,
      writesPlanDates: false,
      writesCriticalPathFacts: false,
      writesSeed: false,
      writesBaseline: false,
      writesRuntimePublications: false,
    },
  }
}
