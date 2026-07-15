export type T2RhythmTemplateReplayAcceptanceInput = {
  templateId: string
  sampleCount: number
  comparableWorkfaceWindowCount: number
  p80CaptureRate: number
  medianAbsoluteErrorDays: number
  gateSlipMedianDays: number
  dependencyViolationRate: number
  evidenceRefs: string[]
}

export type T2RhythmTemplateReplayAcceptanceResult = {
  templateId: string
  status: 'data_collection_open' | 'shadow_candidate'
  readyForShadow: boolean
  readyForPublish: false
  directSeedMutationAllowed: false
  writesPlanDates: false
  writesTaskDependencies: false
  blockingReasons: string[]
  acceptanceMetrics: {
    sampleCount: number
    comparableWorkfaceWindowCount: number
    p80CaptureRate: number
    medianAbsoluteErrorDays: number
    gateSlipMedianDays: number
    dependencyViolationRate: number
  }
  evidenceRefs: string[]
  governance: {
    releasePath: 'replay_candidate_shadow_gate_publish_rollback'
    manualReviewRequiredBeforePublish: true
    l5PublicationRequired: true
    policy: 'candidate_only_no_seed_or_plan_mutation'
  }
}

export const T2_RHYTHM_REPLAY_ACCEPTANCE_THRESHOLDS = {
  minimumSampleCount: 12,
  minimumComparableWorkfaceWindowCount: 12,
  minimumP80CaptureRate: 0.72,
  maximumMedianAbsoluteErrorDays: 2.5,
  maximumGateSlipMedianDays: 1.5,
  maximumDependencyViolationRate: 0.05,
} as const

function finiteNumber(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

export function evaluateT2RhythmTemplateReplayAcceptance(
  input: T2RhythmTemplateReplayAcceptanceInput,
): T2RhythmTemplateReplayAcceptanceResult {
  const metrics = {
    sampleCount: Math.max(0, Math.floor(finiteNumber(input.sampleCount))),
    comparableWorkfaceWindowCount: Math.max(0, Math.floor(finiteNumber(input.comparableWorkfaceWindowCount))),
    p80CaptureRate: finiteNumber(input.p80CaptureRate),
    medianAbsoluteErrorDays: finiteNumber(input.medianAbsoluteErrorDays),
    gateSlipMedianDays: finiteNumber(input.gateSlipMedianDays),
    dependencyViolationRate: finiteNumber(input.dependencyViolationRate),
  }
  const blockingReasons: string[] = []
  if (
    metrics.sampleCount < T2_RHYTHM_REPLAY_ACCEPTANCE_THRESHOLDS.minimumSampleCount
    || metrics.comparableWorkfaceWindowCount < T2_RHYTHM_REPLAY_ACCEPTANCE_THRESHOLDS.minimumComparableWorkfaceWindowCount
  ) {
    blockingReasons.push('sample_gate_not_met')
  }
  if (metrics.p80CaptureRate < T2_RHYTHM_REPLAY_ACCEPTANCE_THRESHOLDS.minimumP80CaptureRate) {
    blockingReasons.push('p80_capture_below_threshold')
  }
  if (metrics.medianAbsoluteErrorDays > T2_RHYTHM_REPLAY_ACCEPTANCE_THRESHOLDS.maximumMedianAbsoluteErrorDays) {
    blockingReasons.push('mae_above_threshold')
  }
  if (metrics.gateSlipMedianDays > T2_RHYTHM_REPLAY_ACCEPTANCE_THRESHOLDS.maximumGateSlipMedianDays) {
    blockingReasons.push('gate_slip_above_threshold')
  }
  if (metrics.dependencyViolationRate > T2_RHYTHM_REPLAY_ACCEPTANCE_THRESHOLDS.maximumDependencyViolationRate) {
    blockingReasons.push('dependency_violation_rate_above_threshold')
  }

  const readyForShadow = blockingReasons.length === 0
  return {
    templateId: input.templateId,
    status: readyForShadow ? 'shadow_candidate' : 'data_collection_open',
    readyForShadow,
    readyForPublish: false,
    directSeedMutationAllowed: false,
    writesPlanDates: false,
    writesTaskDependencies: false,
    blockingReasons,
    acceptanceMetrics: metrics,
    evidenceRefs: input.evidenceRefs,
    governance: {
      releasePath: 'replay_candidate_shadow_gate_publish_rollback',
      manualReviewRequiredBeforePublish: true,
      l5PublicationRequired: true,
      policy: 'candidate_only_no_seed_or_plan_mutation',
    },
  }
}
