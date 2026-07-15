import { supabase } from './dbService.js'
import type { DurationContextPolicyActionKey, DurationContextPolicyModelFamily } from './durationContextPolicyLearningService.js'
import {
  buildDurationContextPolicyStateBucket as buildUnifiedDurationContextPolicyStateBucket,
  validateDurationContextPolicyStateBucket,
  type DurationContextPolicyExperienceTier,
} from './durationContextPolicyStateBucketService.js'

export interface DurationContextPolicyParameterStateBucketInput {
  maturityTier?: string | null
  scheduleState?: string | null
  highRiskFactorCount?: number | null
  mediumRiskFactorCount?: number | null
  lowRiskFactorCount?: number | null
  hardConstraintActive?: boolean | null
  experienceTier?: DurationContextPolicyExperienceTier | string | null
}

export interface DurationContextPolicyLearnedParameter {
  modelFamily: DurationContextPolicyModelFamily
  modelVersion: 'contextual_bandit_v1'
  companyId: string | null
  projectId: string | null
  stateBucket: string
  actionKey: DurationContextPolicyActionKey
  sampleCount: number
  averageReward: number
  positiveRewardRate: number
  learnedWeight: number
  parameterStatus: 'candidate'
  runtimeAutoPublishEligible: boolean
  guardrails: string[]
}

export interface LearnDurationContextPolicyParametersInput {
  projectIds?: string[] | null
  minSamples?: number | null
  limit?: number | null
  persist?: boolean | null
}

const DEFAULT_DURATION_CONTEXT_POLICY_PARAMETER_EXPERIENCE_TIER: DurationContextPolicyExperienceTier = 'T3'

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

function normalizeId(value: unknown) {
  const text = normalizeText(value)
  return text || null
}

function readNumber(value: unknown, fallback = 0) {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

function round(value: number, precision = 3) {
  const factor = 10 ** precision
  return Math.round(value * factor) / factor
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function projectFilterSet(projectIds?: string[] | null) {
  const values = Array.isArray(projectIds)
    ? projectIds.map((projectId) => normalizeId(projectId)).filter((projectId): projectId is string => Boolean(projectId))
    : []
  return values.length > 0 ? new Set(values) : null
}

function readRiskTier(stateVector: DurationContextPolicyParameterStateBucketInput) {
  if (readNumber(stateVector.highRiskFactorCount, 0) > 0) return 'high'
  if (readNumber(stateVector.mediumRiskFactorCount, 0) > 0) return 'medium'
  if (readNumber(stateVector.lowRiskFactorCount, 0) > 0) return 'low'
  return 'none'
}

function resolveExperienceTier(stateVector: DurationContextPolicyParameterStateBucketInput): DurationContextPolicyExperienceTier {
  const tier = normalizeText(stateVector.experienceTier ?? (stateVector as Record<string, unknown>).experience_tier).toUpperCase()
  if (tier === 'T1' || tier === 'T2' || tier === 'T3') return tier
  return DEFAULT_DURATION_CONTEXT_POLICY_PARAMETER_EXPERIENCE_TIER
}

export function buildDurationContextPolicyStateBucket(stateVector: DurationContextPolicyParameterStateBucketInput) {
  return buildUnifiedDurationContextPolicyStateBucket({
    maturityTier: stateVector.maturityTier,
    scheduleState: stateVector.scheduleState,
    highRiskFactorCount: stateVector.highRiskFactorCount,
    mediumRiskFactorCount: stateVector.mediumRiskFactorCount,
    lowRiskFactorCount: stateVector.lowRiskFactorCount,
    hardConstraintActive: stateVector.hardConstraintActive,
    experienceTier: resolveExperienceTier(stateVector),
  })
}

function addReasonCount(counts: Record<string, number>, reasonCode: string) {
  counts[reasonCode] = (counts[reasonCode] ?? 0) + 1
}

function explicitStateBucketFromStateVector(stateVector: Record<string, unknown>) {
  return normalizeText(stateVector.state_bucket ?? stateVector.stateBucket)
}

function resolveDurationContextPolicyParameterStateBucket(stateVector: Record<string, unknown>) {
  const explicitBucket = explicitStateBucketFromStateVector(stateVector)
  const stateBucket = explicitBucket || buildDurationContextPolicyStateBucket(stateVector)
  const validation = validateDurationContextPolicyStateBucket(stateBucket, {
    expectedExperienceTier: resolveExperienceTier(stateVector),
  })
  return {
    stateBucket,
    validation,
  }
}

async function loadEvaluatedPolicyDecisions(input: LearnDurationContextPolicyParametersInput) {
  const limit = Math.max(1, Math.min(2_000, Math.trunc(readNumber(input.limit, 1_000))))
  const { data, error } = await (supabase as any)
    .from('duration_context_policy_decisions')
    .select('id, company_id, project_id, model_family, model_version, state_vector, recommended_action, reward_payload, reward_status')
    .eq('model_family', 'contextual_bandit_v1')
    .eq('reward_status', 'evaluated')
    .order('reward_evaluated_at', { ascending: false })
    .limit(limit)
  if (error || !Array.isArray(data)) return [] as Record<string, unknown>[]
  const projectIds = projectFilterSet(input.projectIds)
  return projectIds
    ? (data as Record<string, unknown>[]).filter((row) => {
      const projectId = normalizeId(row.project_id)
      return projectId ? projectIds.has(projectId) : false
    })
    : data as Record<string, unknown>[]
}

function actionKeyFromRow(row: Record<string, unknown>) {
  const recommendedAction = readRecord(row.recommended_action)
  return normalizeText(recommendedAction.actionKey) as DurationContextPolicyActionKey
}

function rewardFromRow(row: Record<string, unknown>) {
  const rewardPayload = readRecord(row.reward_payload)
  return readNumber(rewardPayload.totalReward, Number.NaN)
}

function parameterGuardrails(stateVector: Record<string, unknown>) {
  const guardrails = ['offline_candidate_parameter_only', 'published_runtime_rules_remain_authoritative']
  if (readNumber(stateVector.highRiskFactorCount, 0) > 0) guardrails.push('manual_runtime_promotion_required')
  if (stateVector.hardConstraintActive === true) guardrails.push('hard_constraint_active')
  return guardrails
}

function buildParameterFromGroup(input: {
  companyId: string | null
  projectId: string | null
  stateBucket: string
  actionKey: DurationContextPolicyActionKey
  rewards: number[]
  stateVector: Record<string, unknown>
}): DurationContextPolicyLearnedParameter {
  const sampleCount = input.rewards.length
  const averageReward = round(input.rewards.reduce((sum, reward) => sum + reward, 0) / Math.max(1, sampleCount))
  const positiveRewardRate = round(input.rewards.filter((reward) => reward > 0).length / Math.max(1, sampleCount))
  const highRisk = readNumber(input.stateVector.highRiskFactorCount, 0) > 0
  const hardConstraint = input.stateVector.hardConstraintActive === true
  return {
    modelFamily: 'contextual_bandit_v1',
    modelVersion: 'contextual_bandit_v1',
    companyId: input.companyId,
    projectId: input.projectId,
    stateBucket: input.stateBucket,
    actionKey: input.actionKey,
    sampleCount,
    averageReward,
    positiveRewardRate,
    learnedWeight: round(clamp(averageReward, -1, 1)),
    parameterStatus: 'candidate',
    runtimeAutoPublishEligible: false,
    guardrails: parameterGuardrails(input.stateVector).concat(
      highRisk || hardConstraint ? [] : ['low_or_medium_risk_still_requires_candidate_review_before_runtime_use'],
    ),
  }
}

function mapParameterToRow(parameter: DurationContextPolicyLearnedParameter) {
  return {
    model_family: parameter.modelFamily,
    model_version: parameter.modelVersion,
    company_id: parameter.companyId,
    project_id: parameter.projectId,
    parameter_status: parameter.parameterStatus,
    runtime_mutation_policy: 'none_candidate_parameters_only',
    runtime_auto_publish_eligible: parameter.runtimeAutoPublishEligible,
    state_bucket: parameter.stateBucket,
    action_key: parameter.actionKey,
    sample_count: parameter.sampleCount,
    average_reward: parameter.averageReward,
    positive_reward_rate: parameter.positiveRewardRate,
    learned_weight: parameter.learnedWeight,
    reward_summary: {
      guardrails: parameter.guardrails,
      learningMode: 'offline_parameter_candidate_only',
    },
  }
}

export async function learnDurationContextPolicyParameters(input: LearnDurationContextPolicyParametersInput = {}) {
  const minSamples = Math.max(1, Math.trunc(readNumber(input.minSamples, 5)))
  const decisions = await loadEvaluatedPolicyDecisions(input)
  const groups = new Map<string, {
    companyId: string | null
    projectId: string | null
    stateBucket: string
    actionKey: DurationContextPolicyActionKey
    rewards: number[]
    stateVector: Record<string, unknown>
  }>()
  const rejectedStateBucketReasonCounts: Record<string, number> = {}
  let rejectedStateBucketDecisionCount = 0

  for (const row of decisions) {
    const actionKey = actionKeyFromRow(row)
    const reward = rewardFromRow(row)
    if (!actionKey || !Number.isFinite(reward)) continue
    const companyId = normalizeId(row.company_id)
    const projectId = normalizeId(row.project_id)
    const stateVector = readRecord(row.state_vector)
    const stateBucketResolution = resolveDurationContextPolicyParameterStateBucket(stateVector)
    if (!stateBucketResolution.validation.isValid) {
      rejectedStateBucketDecisionCount += 1
      for (const reasonCode of stateBucketResolution.validation.reasonCodes) {
        addReasonCount(rejectedStateBucketReasonCounts, reasonCode)
      }
      continue
    }
    const stateBucket = stateBucketResolution.stateBucket
    const groupKey = `company:${companyId ?? 'global'}|project:${projectId ?? 'global'}|${stateBucket}|action:${actionKey}`
    const group = groups.get(groupKey) ?? {
      companyId,
      projectId,
      stateBucket,
      actionKey,
      rewards: [],
      stateVector,
    }
    group.rewards.push(reward)
    groups.set(groupKey, group)
  }

  const parameters = Array.from(groups.values())
    .filter((group) => group.rewards.length >= minSamples)
    .map(buildParameterFromGroup)
    .sort((left, right) => right.learnedWeight - left.learnedWeight || right.sampleCount - left.sampleCount)

  let persistedParameterCount = 0
  if (input.persist === true && parameters.length > 0) {
    const rows = parameters.map(mapParameterToRow)
    const { data, error } = await (supabase as any)
      .from('duration_context_policy_parameters')
      .upsert(rows, {
        onConflict: 'model_family,model_version,company_id,project_id,parameter_status,state_bucket,action_key',
      })
      .select('*')
    if (error) throw new Error(`Failed to persist duration context policy parameters: ${error.message}`)
    persistedParameterCount = Array.isArray(data) ? data.length : rows.length
  }

  return {
    modelFamily: 'contextual_bandit_v1' as const,
    learningMode: 'offline_parameter_candidate_only' as const,
    runtimeMutationPolicy: 'none_candidate_parameters_only' as const,
    policyParameterBucketValidation: 'duration_context_policy_state_bucket_tier_aware' as const,
    evaluatedDecisionCount: decisions.length,
    rejectedStateBucketDecisionCount,
    rejectedStateBucketReasonCounts,
    minSamples,
    candidateParameterCount: parameters.length,
    persistedParameterCount,
    parameters,
  }
}
