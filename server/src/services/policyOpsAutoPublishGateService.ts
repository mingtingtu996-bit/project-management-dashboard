export type PolicyOpsTemplateDomain = 'pre_certificate' | 'acceptance_timeline'

export type PolicyOpsRuntimeConsumptionStatus =
  | 'stable_consumable'
  | 'candidate_only'
  | 'blocked_retain_previous'
  | 'rolled_back_to_previous'

export type PolicyOpsPromotionDecision =
  | 'promote_to_stable'
  | 'hold_as_candidate_overlay'
  | 'block_and_retain_previous'
  | 'rollback_to_previous_stable'

export interface PolicyOpsSourceCoverageQuality {
  coverageStatus: 'ready' | 'needs_source_expansion' | string
  coverageRate: number
  missingOrWeakSourceAssetCount: number
}

export interface PolicyOpsParseHitRateQuality {
  evaluatedSnapshotCount: number
  averageHitRate: number
  status: 'not_evaluated' | 'ready_for_rule_diff' | 'needs_parser_training' | string
}

export interface PolicyOpsReplayCalibrationQuality {
  sampleCount: number
  calibratedSampleCount: number
  status: 'needs_more_samples' | 'candidate_overlay_ready' | 'needs_human_review' | string
}

export interface PolicyOpsGoldenReplayBaselineQuality {
  status: 'baseline_ready' | 'baseline_needs_review' | string
}

export interface PolicyOpsAutoPublishSummary {
  candidateUpdateCount: number
  autoPublishedUpdateCount: number
  blockedUpdateCount: number
}

export interface BuildPolicyOpsAutoPublishDecisionInput {
  domain: PolicyOpsTemplateDomain
  asOfDate: string
  summary: PolicyOpsAutoPublishSummary
  sourceCoverage: PolicyOpsSourceCoverageQuality
  policyParseHitRate: PolicyOpsParseHitRateQuality
  projectReplayCalibration: PolicyOpsReplayCalibrationQuality
  goldenReplayBaseline?: PolicyOpsGoldenReplayBaselineQuality | null
  previousStableRunAvailable?: boolean
  minSourceCoverageRate?: number
  minPolicyParseHitRate?: number
}

export interface PolicyOpsAutoPublishDecision {
  decisionCode: 'policy_ops_auto_publish_gate'
  domain: PolicyOpsTemplateDomain
  asOfDate: string
  runtimeConsumptionStatus: PolicyOpsRuntimeConsumptionStatus
  promotionDecision: PolicyOpsPromotionDecision
  runtimeConsumptionPolicy:
    | 'consume_stable_auto_published_seed'
    | 'retain_previous_published_seed'
    | 'candidate_overlay_for_audit_only'
  humanReviewPolicy: 'zero_human_review_when_gate_passes'
  stableConsumptionAllowed: boolean
  reasonCodes: string[]
  thresholds: {
    minSourceCoverageRate: number
    minPolicyParseHitRate: number
    requirePolicyParseEvaluation: true
    requireReplayCandidateReady: true
    requireNoBlockedUpdates: true
    requireGoldenBaselineReady: boolean
  }
  observedQuality: {
    sourceCoverageRate: number
    policyParseHitRate: number
    evaluatedSnapshotCount: number
    replaySampleCount: number
    calibratedReplaySampleCount: number
    blockedUpdateCount: number
    autoPublishedUpdateCount: number
    goldenBaselineStatus?: string
  }
}

const DEFAULT_MIN_SOURCE_COVERAGE_RATE = 1
const DEFAULT_MIN_POLICY_PARSE_HIT_RATE = 0.8

function roundMetric(value: number) {
  if (!Number.isFinite(value)) return 0
  return Math.round(value * 1000) / 1000
}

export function buildPolicyOpsAutoPublishDecision(
  input: BuildPolicyOpsAutoPublishDecisionInput,
): PolicyOpsAutoPublishDecision {
  const minSourceCoverageRate = input.minSourceCoverageRate ?? DEFAULT_MIN_SOURCE_COVERAGE_RATE
  const minPolicyParseHitRate = input.minPolicyParseHitRate ?? DEFAULT_MIN_POLICY_PARSE_HIT_RATE
  const requireGoldenBaselineReady = Boolean(input.goldenReplayBaseline)
  const reasonCodes: string[] = []

  if (
    input.sourceCoverage.coverageStatus !== 'ready' ||
    input.sourceCoverage.coverageRate < minSourceCoverageRate ||
    input.sourceCoverage.missingOrWeakSourceAssetCount > 0
  ) {
    reasonCodes.push('source_coverage_not_ready')
  }

  if (input.policyParseHitRate.evaluatedSnapshotCount === 0) {
    reasonCodes.push('policy_parse_not_evaluated')
  } else if (
    input.policyParseHitRate.status !== 'ready_for_rule_diff' ||
    input.policyParseHitRate.averageHitRate < minPolicyParseHitRate
  ) {
    reasonCodes.push('policy_parse_below_threshold')
  }

  if (input.projectReplayCalibration.status === 'needs_more_samples') {
    reasonCodes.push('project_replay_needs_more_samples')
  } else if (input.projectReplayCalibration.status !== 'candidate_overlay_ready') {
    reasonCodes.push('project_replay_not_ready')
  }

  if (input.goldenReplayBaseline && input.goldenReplayBaseline.status !== 'baseline_ready') {
    reasonCodes.push('golden_replay_baseline_not_ready')
  }

  if (input.summary.blockedUpdateCount > 0) {
    reasonCodes.push('blocked_policy_updates_present')
  }

  const hardBlock = reasonCodes.some((reasonCode) => [
    'source_coverage_not_ready',
    'project_replay_not_ready',
    'golden_replay_baseline_not_ready',
    'blocked_policy_updates_present',
  ].includes(reasonCode))

  const stableConsumptionAllowed = reasonCodes.length === 0
  const runtimeConsumptionStatus: PolicyOpsRuntimeConsumptionStatus = stableConsumptionAllowed
    ? 'stable_consumable'
    : hardBlock && input.previousStableRunAvailable
    ? 'rolled_back_to_previous'
    : hardBlock
    ? 'blocked_retain_previous'
    : 'candidate_only'
  const promotionDecision: PolicyOpsPromotionDecision = stableConsumptionAllowed
    ? 'promote_to_stable'
    : runtimeConsumptionStatus === 'rolled_back_to_previous'
    ? 'rollback_to_previous_stable'
    : runtimeConsumptionStatus === 'blocked_retain_previous'
    ? 'block_and_retain_previous'
    : 'hold_as_candidate_overlay'

  return {
    decisionCode: 'policy_ops_auto_publish_gate',
    domain: input.domain,
    asOfDate: input.asOfDate,
    runtimeConsumptionStatus,
    promotionDecision,
    runtimeConsumptionPolicy: stableConsumptionAllowed
      ? 'consume_stable_auto_published_seed'
      : runtimeConsumptionStatus === 'candidate_only'
      ? 'candidate_overlay_for_audit_only'
      : 'retain_previous_published_seed',
    humanReviewPolicy: 'zero_human_review_when_gate_passes',
    stableConsumptionAllowed,
    reasonCodes,
    thresholds: {
      minSourceCoverageRate,
      minPolicyParseHitRate,
      requirePolicyParseEvaluation: true,
      requireReplayCandidateReady: true,
      requireNoBlockedUpdates: true,
      requireGoldenBaselineReady,
    },
    observedQuality: {
      sourceCoverageRate: roundMetric(input.sourceCoverage.coverageRate),
      policyParseHitRate: roundMetric(input.policyParseHitRate.averageHitRate),
      evaluatedSnapshotCount: input.policyParseHitRate.evaluatedSnapshotCount,
      replaySampleCount: input.projectReplayCalibration.sampleCount,
      calibratedReplaySampleCount: input.projectReplayCalibration.calibratedSampleCount,
      blockedUpdateCount: input.summary.blockedUpdateCount,
      autoPublishedUpdateCount: input.summary.autoPublishedUpdateCount,
      ...(input.goldenReplayBaseline ? { goldenBaselineStatus: input.goldenReplayBaseline.status } : {}),
    },
  }
}

export function isPolicyOpsStableAutoPublishRun(run: unknown): boolean {
  if (!run || typeof run !== 'object') return false
  const decision = (run as { policyOpsDecision?: Partial<PolicyOpsAutoPublishDecision> }).policyOpsDecision
  return Boolean(decision?.stableConsumptionAllowed && decision.runtimeConsumptionStatus === 'stable_consumable')
}
