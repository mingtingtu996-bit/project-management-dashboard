import type { DurationContextActionPolicy, DurationContextFactorKey } from '../types/durationContext.js'
import {
  getDurationContextFactorAutomationPolicy,
  type DurationContextAutomationRiskTier,
} from './durationContextGovernanceService.js'
import {
  createAndPersistAlgorithmAssetCandidateEvent,
  type AlgorithmAssetCandidateEvent,
} from './algorithmAssetCandidateEventAdapterService.js'
import type {
  AlgorithmAssetGovernanceQueryExec,
  PersistAlgorithmAssetCandidateEventResult,
} from './algorithmAssetGovernancePersistenceService.js'

export type DurationContextPolicyModelFamily = 'contextual_bandit_v1'

export type DurationContextPolicyActionKey =
  | 'keep_rule_baseline'
  | 'publish_low_risk_calibration_threshold'
  | 'hold_high_risk_candidate_for_review'
  | 'recommend_weather_recovery_overtime'
  | 'recommend_resequence_workfaces'

export type DurationContextPolicyRuntimePolicy =
  | 'shadow_run'
  | 'candidate_only'
  | 'canary_candidate'
  | 'auto_publish_eligible'

export interface DurationContextPolicyFactorSignal {
  factorKey: DurationContextFactorKey
  multiplier?: number | null
  extraDays?: number | null
  actionPolicy?: DurationContextActionPolicy | null
}

export interface DurationContextPolicyState {
  projectType?: string | null
  city?: string | null
  yearMonth?: string | null
  maturityDays?: number | null
  ruleBaselineP?: number | null
  currentP?: number | null
  scheduleState?: string | null
  isCriticalPath?: boolean | null
  hardConstraintActive?: boolean | null
  factorSignals?: DurationContextPolicyFactorSignal[] | null
}

export interface DurationContextPolicyReplayEvidence {
  maeBefore?: number | null
  maeAfter?: number | null
  overcompensationRate?: number | null
  sampleCount?: number | null
  scheduleStabilityDelta?: number | null
}

export interface DurationContextPolicyRewardInput {
  maeBefore?: number | null
  maeAfter?: number | null
  overcompensationRate?: number | null
  scheduleStabilityDelta?: number | null
  hardConstraintViolation?: boolean | null
  highRiskRuntimeAutoPublishAttempted?: boolean | null
}

export interface DurationContextPolicyReward {
  totalReward: number
  components: {
    maeImprovement: number
    scheduleStability: number
  }
  penalties: {
    overcompensation: number
    hardConstraintViolation: number
    highRiskRuntimeAutoPublish: number
  }
}

export interface DurationContextPolicyStateVector {
  maturityDays: number
  maturityTier: 'cold_start' | 'warm_30d' | 'stable_50d' | 'mature_90d'
  ruleBaselineP: number
  currentP: number
  pressureScore: number
  compensationScore: number
  highRiskFactorCount: number
  mediumRiskFactorCount: number
  lowRiskFactorCount: number
  candidateOnlyFactorCount: number
  autoApplyFactorCount: number
  criticalPathFlag: boolean
  hardConstraintActive: boolean
  scheduleState: string | null
}

export interface DurationContextPolicyActionCandidate {
  actionKey: DurationContextPolicyActionKey
  runtimePolicy: DurationContextPolicyRuntimePolicy
  runtimeAutoPublishEligible: boolean
  expectedReward: number
  reward: DurationContextPolicyReward
  guardrailViolations: string[]
  rationale: string[]
}

export interface DurationContextPolicyRecommendation {
  modelFamily: DurationContextPolicyModelFamily
  companyId: string | null
  projectId: string | null
  generatedAt: string
  stateVector: DurationContextPolicyStateVector
  candidateActions: DurationContextPolicyActionCandidate[]
  recommendedAction: DurationContextPolicyActionCandidate
  governance: {
    policyLayerRole: 'strategy_candidate_layer_only'
    productionBoundary: 'rule_layer_remains_authoritative_high_risk_manual_promotion'
    learningMode: 'offline_shadow_or_candidate_only'
  }
}

export interface BuildAndPersistDurationContextPolicyRecommendationInput {
  companyId?: string | null
  projectId?: string | null
  state: DurationContextPolicyState
  replayEvidence?: DurationContextPolicyReplayEvidence | null
  queryExec?: AlgorithmAssetGovernanceQueryExec
}

export interface BuildAndPersistDurationContextPolicyRecommendationResult {
  recommendation: DurationContextPolicyRecommendation
  event: AlgorithmAssetCandidateEvent
  persistence: PersistAlgorithmAssetCandidateEventResult
}

function readNumber(value: unknown, fallback = 0) {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function round(value: number, precision = 3) {
  const factor = 10 ** precision
  return Math.round(value * factor) / factor
}

function maturityTier(days: number): DurationContextPolicyStateVector['maturityTier'] {
  if (days >= 90) return 'mature_90d'
  if (days >= 50) return 'stable_50d'
  if (days >= 30) return 'warm_30d'
  return 'cold_start'
}

function countByRisk(
  factors: DurationContextPolicyFactorSignal[],
  riskTier: DurationContextAutomationRiskTier,
) {
  return factors.filter((factor) => getDurationContextFactorAutomationPolicy(factor.factorKey).riskTier === riskTier).length
}

function buildStateVector(state: DurationContextPolicyState): DurationContextPolicyStateVector {
  const factors = state.factorSignals ?? []
  const pressureScore = factors.reduce((sum, factor) => {
    const multiplierPressure = Math.max(0, readNumber(factor.multiplier, 1) - 1)
    const extraDayPressure = Math.max(0, readNumber(factor.extraDays, 0)) / 30
    return sum + multiplierPressure + extraDayPressure
  }, 0)
  const compensationScore = factors.reduce((sum, factor) => {
    const multiplier = readNumber(factor.multiplier, 1)
    return sum + Math.max(0, 1 - multiplier)
  }, 0)
  const maturityDays = Math.max(0, Math.trunc(readNumber(state.maturityDays, 0)))
  return {
    maturityDays,
    maturityTier: maturityTier(maturityDays),
    ruleBaselineP: round(clamp(readNumber(state.ruleBaselineP, 1), 0.2, 1.4)),
    currentP: round(clamp(readNumber(state.currentP ?? state.ruleBaselineP, 1), 0.2, 1.4)),
    pressureScore: round(pressureScore),
    compensationScore: round(compensationScore),
    highRiskFactorCount: countByRisk(factors, 'high'),
    mediumRiskFactorCount: countByRisk(factors, 'medium'),
    lowRiskFactorCount: countByRisk(factors, 'low'),
    candidateOnlyFactorCount: factors.filter((factor) => factor.actionPolicy === 'candidate_only').length,
    autoApplyFactorCount: factors.filter((factor) => factor.actionPolicy === 'auto_apply').length,
    criticalPathFlag: state.isCriticalPath === true,
    hardConstraintActive: state.hardConstraintActive === true,
    scheduleState: state.scheduleState ? String(state.scheduleState) : null,
  }
}

export function evaluateDurationContextPolicyReward(
  input: DurationContextPolicyRewardInput,
): DurationContextPolicyReward {
  const maeBefore = Math.max(0, readNumber(input.maeBefore, 0))
  const maeAfter = Math.max(0, readNumber(input.maeAfter, maeBefore))
  const maeImprovement = clamp(maeBefore - maeAfter, -1, 1)
  const scheduleStability = clamp(readNumber(input.scheduleStabilityDelta, 0), -0.5, 0.5)
  const overcompensation = -clamp(readNumber(input.overcompensationRate, 0), 0, 1) * 1.5
  const hardConstraintViolation = input.hardConstraintViolation ? -1 : 0
  const highRiskRuntimeAutoPublish = input.highRiskRuntimeAutoPublishAttempted ? -1 : 0
  const totalReward = round(
    maeImprovement * 2
    + scheduleStability
    + overcompensation
    + hardConstraintViolation
    + highRiskRuntimeAutoPublish,
  )
  return {
    totalReward,
    components: {
      maeImprovement: round(maeImprovement),
      scheduleStability: round(scheduleStability),
    },
    penalties: {
      overcompensation: round(overcompensation),
      hardConstraintViolation,
      highRiskRuntimeAutoPublish,
    },
  }
}

function rewardFromEvidence(
  evidence: DurationContextPolicyReplayEvidence | null | undefined,
  options: {
    hardConstraintViolation?: boolean
    highRiskRuntimeAutoPublishAttempted?: boolean
  } = {},
) {
  return evaluateDurationContextPolicyReward({
    maeBefore: evidence?.maeBefore,
    maeAfter: evidence?.maeAfter,
    overcompensationRate: evidence?.overcompensationRate,
    scheduleStabilityDelta: evidence?.scheduleStabilityDelta,
    hardConstraintViolation: options.hardConstraintViolation,
    highRiskRuntimeAutoPublishAttempted: options.highRiskRuntimeAutoPublishAttempted,
  })
}

function counterfactualRewardForAction(input: {
  actionKey: DurationContextPolicyActionKey
  evidence: DurationContextPolicyReplayEvidence | null | undefined
  stateVector: DurationContextPolicyStateVector
  runtimeAutoPublishEligible?: boolean
  hasHighRisk?: boolean
  hardConstraintActive?: boolean
}) {
  const evidence = input.evidence
  const maeBefore = Math.max(0, readNumber(evidence?.maeBefore, 0))
  const maeAfter = Math.max(0, readNumber(evidence?.maeAfter, maeBefore))
  const improvement = clamp(maeBefore - maeAfter, -1, 1)
  const overcompensationRate = Math.max(0, readNumber(evidence?.overcompensationRate, 0))
  const scheduleStabilityDelta = readNumber(evidence?.scheduleStabilityDelta, 0)
  const pressure = input.stateVector.pressureScore
  const compensation = input.stateVector.compensationScore

  switch (input.actionKey) {
    case 'keep_rule_baseline':
      return evaluateDurationContextPolicyReward({
        maeBefore,
        maeAfter: maeBefore,
        overcompensationRate: overcompensationRate * 0.5,
        scheduleStabilityDelta: Math.max(0, scheduleStabilityDelta * 0.25),
      })
    case 'hold_high_risk_candidate_for_review':
      return evaluateDurationContextPolicyReward({
        maeBefore,
        maeAfter,
        overcompensationRate,
        scheduleStabilityDelta: scheduleStabilityDelta + 0.08,
        hardConstraintViolation: false,
        highRiskRuntimeAutoPublishAttempted: false,
      })
    case 'publish_low_risk_calibration_threshold': {
      const allowed = input.runtimeAutoPublishEligible === true && !input.hasHighRisk && !input.hardConstraintActive
      return evaluateDurationContextPolicyReward({
        maeBefore,
        maeAfter: allowed ? maeAfter : Math.max(0, maeBefore - improvement * 0.45),
        overcompensationRate: allowed ? overcompensationRate : overcompensationRate + 0.08,
        scheduleStabilityDelta: scheduleStabilityDelta
          + (allowed ? 0.04 : -0.04)
          + Math.min(0.08, compensation * 0.2 + input.stateVector.lowRiskFactorCount * 0.015),
        hardConstraintViolation: input.hardConstraintActive === true,
        highRiskRuntimeAutoPublishAttempted: input.hasHighRisk === true,
      })
    }
    case 'recommend_resequence_workfaces':
      return evaluateDurationContextPolicyReward({
        maeBefore,
        maeAfter: Math.max(0, maeBefore - improvement * (0.55 + Math.min(0.25, pressure * 0.2))),
        overcompensationRate: overcompensationRate + 0.04 + Math.min(0.08, pressure * 0.05),
        scheduleStabilityDelta: scheduleStabilityDelta - 0.02 + Math.min(0.06, pressure * 0.04),
      })
    case 'recommend_weather_recovery_overtime':
      return evaluateDurationContextPolicyReward({
        maeBefore,
        maeAfter: Math.max(0, maeBefore - improvement * (0.4 + Math.min(0.2, pressure * 0.15))),
        overcompensationRate: overcompensationRate + 0.07,
        scheduleStabilityDelta: scheduleStabilityDelta - 0.04,
      })
    default:
      return rewardFromEvidence(evidence)
  }
}

function buildActionCandidate(input: {
  actionKey: DurationContextPolicyActionKey
  runtimePolicy: DurationContextPolicyRuntimePolicy
  runtimeAutoPublishEligible: boolean
  reward: DurationContextPolicyReward
  guardrailViolations?: string[]
  rationale: string[]
}): DurationContextPolicyActionCandidate {
  return {
    actionKey: input.actionKey,
    runtimePolicy: input.runtimePolicy,
    runtimeAutoPublishEligible: input.runtimeAutoPublishEligible,
    expectedReward: input.reward.totalReward,
    reward: input.reward,
    guardrailViolations: input.guardrailViolations ?? [],
    rationale: input.rationale,
  }
}

export function buildDurationContextPolicyRecommendation(input: {
  companyId?: string | null
  projectId?: string | null
  state: DurationContextPolicyState
  replayEvidence?: DurationContextPolicyReplayEvidence | null
}): DurationContextPolicyRecommendation {
  const stateVector = buildStateVector(input.state)
  const evidence = input.replayEvidence ?? null
  const matureSafeEvidence = stateVector.maturityDays >= 50
    && readNumber(evidence?.sampleCount, 0) >= 50
    && readNumber(evidence?.maeAfter, Number.POSITIVE_INFINITY) < readNumber(evidence?.maeBefore, Number.NEGATIVE_INFINITY)
    && readNumber(evidence?.overcompensationRate, 1) <= 0.08
  const hasHighRisk = stateVector.highRiskFactorCount > 0
  const hardConstraintActive = stateVector.hardConstraintActive

  const baselineReward = counterfactualRewardForAction({
    actionKey: 'keep_rule_baseline',
    evidence,
    stateVector,
  })
  const candidateActions: DurationContextPolicyActionCandidate[] = [
    buildActionCandidate({
      actionKey: 'keep_rule_baseline',
      runtimePolicy: 'shadow_run',
      runtimeAutoPublishEligible: false,
      reward: baselineReward,
      rationale: ['Keep deterministic duration-context synthesis as the safe baseline.'],
    }),
  ]

  if (hasHighRisk || hardConstraintActive) {
    candidateActions.push(buildActionCandidate({
      actionKey: 'hold_high_risk_candidate_for_review',
      runtimePolicy: 'candidate_only',
      runtimeAutoPublishEligible: false,
      reward: counterfactualRewardForAction({
        actionKey: 'hold_high_risk_candidate_for_review',
        evidence,
        stateVector,
      }),
      guardrailViolations: [
        ...(hasHighRisk ? ['manual_runtime_promotion_required'] : []),
        ...(hardConstraintActive ? ['hard_constraint_active'] : []),
      ],
      rationale: [
        'High-risk or hard-constraint signals can be discovered and replayed automatically.',
        'They cannot be unattended runtime publications.',
      ],
    }))
  }

  if (stateVector.lowRiskFactorCount > 0) {
    const runtimeAutoPublishEligible = matureSafeEvidence && !hasHighRisk && !hardConstraintActive
    candidateActions.push(buildActionCandidate({
      actionKey: 'publish_low_risk_calibration_threshold',
      runtimePolicy: runtimeAutoPublishEligible
        ? 'auto_publish_eligible'
        : 'candidate_only',
      runtimeAutoPublishEligible,
      reward: counterfactualRewardForAction({
        actionKey: 'publish_low_risk_calibration_threshold',
        evidence,
        stateVector,
        runtimeAutoPublishEligible,
        hasHighRisk,
        hardConstraintActive,
      }),
      guardrailViolations: [
        ...(!matureSafeEvidence ? ['insufficient_mature_safe_replay_evidence'] : []),
        ...(hasHighRisk ? ['manual_runtime_promotion_required'] : []),
        ...(hardConstraintActive ? ['hard_constraint_active'] : []),
      ],
      rationale: [
        'Low-risk calibration may publish only with mature safe replay evidence.',
        'Runtime consumption remains published-row only.',
      ],
    }))
  }

  if (stateVector.pressureScore > 0.15 && stateVector.scheduleState === 'accelerating') {
    candidateActions.push(buildActionCandidate({
      actionKey: 'recommend_resequence_workfaces',
      runtimePolicy: 'candidate_only',
      runtimeAutoPublishEligible: false,
      reward: counterfactualRewardForAction({
        actionKey: 'recommend_resequence_workfaces',
        evidence,
        stateVector,
      }),
      rationale: ['Acceleration with active pressure should become a strategy candidate, not a silent rule rewrite.'],
    }))
  }

  if (stateVector.pressureScore > 0.15 && !hardConstraintActive) {
    candidateActions.push(buildActionCandidate({
      actionKey: 'recommend_weather_recovery_overtime',
      runtimePolicy: 'candidate_only',
      runtimeAutoPublishEligible: false,
      reward: counterfactualRewardForAction({
        actionKey: 'recommend_weather_recovery_overtime',
        evidence,
        stateVector,
      }),
      rationale: ['Weather or pressure recovery can suggest overtime/makeup work while keeping hard shutdowns protected.'],
    }))
  }

  const recommendedAction = candidateActions
    .slice()
    .sort((left, right) => {
      if (left.actionKey === 'hold_high_risk_candidate_for_review' && (hasHighRisk || hardConstraintActive)) return -1
      if (right.actionKey === 'hold_high_risk_candidate_for_review' && (hasHighRisk || hardConstraintActive)) return 1
      if (left.runtimeAutoPublishEligible !== right.runtimeAutoPublishEligible) return left.runtimeAutoPublishEligible ? -1 : 1
      return right.expectedReward - left.expectedReward
    })[0]

  return {
    modelFamily: 'contextual_bandit_v1',
    companyId: input.companyId ? String(input.companyId) : null,
    projectId: input.projectId ? String(input.projectId) : null,
    generatedAt: new Date().toISOString(),
    stateVector,
    candidateActions,
    recommendedAction,
    governance: {
      policyLayerRole: 'strategy_candidate_layer_only',
      productionBoundary: 'rule_layer_remains_authoritative_high_risk_manual_promotion',
      learningMode: 'offline_shadow_or_candidate_only',
    },
  }
}

function normalizeText(value: unknown) {
  const text = String(value ?? '').trim()
  return text || null
}

function durationContextPolicyAssetKey(recommendation: DurationContextPolicyRecommendation) {
  return [
    'duration.context.policy',
    recommendation.modelFamily,
    recommendation.projectId || 'system_observation',
  ].join('.')
}

export async function buildAndPersistDurationContextPolicyRecommendation(
  input: BuildAndPersistDurationContextPolicyRecommendationInput,
): Promise<BuildAndPersistDurationContextPolicyRecommendationResult> {
  const companyId = normalizeText(input.companyId)
  const projectId = companyId ? normalizeText(input.projectId) : null
  const recommendation = buildDurationContextPolicyRecommendation({
    companyId,
    projectId: input.projectId,
    state: input.state,
    replayEvidence: input.replayEvidence,
  })

  const result = await createAndPersistAlgorithmAssetCandidateEvent({
    assetKey: durationContextPolicyAssetKey(recommendation),
    sourceSystem: 'durationContextPolicyLearningService',
    assetType: 'calibration',
    companyId,
    projectId,
    candidatePayload: {
      originalProjectId: normalizeText(input.projectId),
      experienceTier: 'T3',
      experienceAssetType: 'project_efficiency_model',
      reuseScope: projectId ? 'project' : companyId ? 'company' : 'industry',
      factSource: 'hybrid',
      companyId,
      projectId,
      modelFamily: recommendation.modelFamily,
      generatedAt: recommendation.generatedAt,
      stateVector: recommendation.stateVector,
      candidateActions: recommendation.candidateActions,
      recommendedAction: recommendation.recommendedAction,
      governance: recommendation.governance,
      replayEvidence: input.replayEvidence ?? null,
    },
    learningTarget: 'candidate_weight',
    learningMaturity: 'governed_candidate',
    publishAnchor: 'manual_governance_required',
    automationMaturity: 'auto_review_package',
    requestedRuntimeEffect: 'candidate_only',
    generatedBy: 'service',
    evidence: {
      replayPassed: input.replayEvidence
        ? readNumber(input.replayEvidence.maeAfter, Number.POSITIVE_INFINITY) < readNumber(input.replayEvidence.maeBefore, Number.NEGATIVE_INFINITY)
        : false,
      conflictFree: recommendation.recommendedAction.guardrailViolations.length === 0,
      rollbackTarget: null,
    },
    queryExec: input.queryExec,
  })

  return {
    recommendation,
    event: result.event,
    persistence: result.persistence,
  }
}
