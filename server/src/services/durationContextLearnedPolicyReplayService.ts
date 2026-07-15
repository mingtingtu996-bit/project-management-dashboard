import { supabase } from './dbService.js'
import type { DurationContextPolicyActionKey } from './durationContextPolicyLearningService.js'
import { buildDurationContextPolicyStateBucket } from './durationContextPolicyParameterLearningService.js'
import type { DurationContextPolicyAutoPublishEvidence } from './durationContextPolicyAutoPublishGateService.js'

export interface RunDurationContextLearnedPolicyReplayInput {
  projectIds?: string[] | null
  minReplayCases?: number | null
  limit?: number | null
}

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

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function readArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function readOptionalNumber(value: unknown) {
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function projectFilterSet(projectIds?: string[] | null) {
  const values = Array.isArray(projectIds)
    ? projectIds.map((projectId) => normalizeId(projectId)).filter((projectId): projectId is string => Boolean(projectId))
    : []
  return values.length > 0 ? new Set(values) : null
}

async function loadCandidateParameters() {
  const { data, error } = await (supabase as any)
    .from('duration_context_policy_parameters')
    .select('*')
    .eq('model_family', 'contextual_bandit_v1')
    .eq('parameter_status', 'candidate')
    .order('learned_weight', { ascending: false })
    .limit(2_000)
  if (error || !Array.isArray(data)) return [] as Record<string, unknown>[]
  return data as Record<string, unknown>[]
}

async function loadEvaluatedDecisions(input: RunDurationContextLearnedPolicyReplayInput) {
  const limit = Math.max(1, Math.min(2_000, Math.trunc(readNumber(input.limit, 1_000))))
  const { data, error } = await (supabase as any)
    .from('duration_context_policy_decisions')
    .select('id, company_id, project_id, model_family, state_vector, candidate_actions, reward_payload, reward_status, reward_source_calibration_id')
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

async function loadRewardCalibrationEvidenceById(
  decisions: Record<string, unknown>[],
  visibleProjectIds: string[],
) {
  const ids = Array.from(new Set(
    decisions
      .map((decision) => normalizeId(decision.reward_source_calibration_id))
      .filter((id): id is string => Boolean(id)),
  ))
  if (ids.length === 0 || visibleProjectIds.length === 0) return new Map<string, Record<string, unknown>>()

  const { data, error } = await (supabase as any)
    .from('project_productivity_compensation_calibrations')
    .select('id, sample_count, snapshot_count, mae_before, mae_after, overcompensation_rate, parameter_payload, evidence_summary')
    .in('id', ids)
    .in('project_id', visibleProjectIds)
    .limit(ids.length)
  if (error || !Array.isArray(data)) return new Map<string, Record<string, unknown>>()
  return new Map((data as Record<string, unknown>[])
    .map((row) => [normalizeId(row.id), row] as const)
    .filter((entry): entry is [string, Record<string, unknown>] => Boolean(entry[0])))
}

function readScopeSampleCounts(value: Record<string, unknown>) {
  return {
    global: Math.max(0, Math.trunc(readNumber(value.global ?? value.system, 0))),
    industry: Math.max(0, Math.trunc(readNumber(value.industry ?? value.industry_baseline ?? value.segment_baseline, 0))),
    company: Math.max(0, Math.trunc(readNumber(value.company, 0))),
    project: Math.max(0, Math.trunc(readNumber(value.project, 0))),
  }
}

function autoPublishEvidenceFromCalibration(
  decision: Record<string, unknown>,
  calibration: Record<string, unknown> | null,
): DurationContextPolicyAutoPublishEvidence | null {
  if (!calibration) return null
  const evidenceSummary = readRecord(calibration.evidence_summary)
  const autoPublishEvidence = readRecord(evidenceSummary.autoPublishEvidence)
  const scopeEvidence = readRecord(autoPublishEvidence.scopeSampleCounts ?? evidenceSummary.scopeSampleCounts)
  const scopeSampleCounts = readScopeSampleCounts(scopeEvidence)
  const parameterPayload = readRecord(calibration.parameter_payload)
  const compensation = readRecord(evidenceSummary.compensation)
  const compensationMetadata = readRecord(compensation.metadata)
  const durationExperience = readRecord(compensationMetadata.durationExperience)
  const enabledLearningScopes = readArray(autoPublishEvidence.enabledLearningScopes ?? evidenceSummary.enabledLearningScopes)
    .map((scope) => normalizeText(scope))
    .filter(Boolean)
  const sampleCount = readOptionalNumber(autoPublishEvidence.sampleCount)
    ?? Math.max(
      readNumber(calibration.sample_count, 0),
      readNumber(calibration.snapshot_count, 0),
    )

  return {
    evidenceRefs: [
      `duration_context_policy_decisions:${normalizeText(decision.id)}`,
      `project_productivity_compensation_calibrations:${normalizeText(calibration.id)}`,
    ],
    enabledLearningScopes,
    scopeSampleCounts,
    sampleCount,
    maeBefore: readOptionalNumber(autoPublishEvidence.maeBefore) ?? readOptionalNumber(calibration.mae_before),
    maeAfter: readOptionalNumber(autoPublishEvidence.maeAfter) ?? readOptionalNumber(calibration.mae_after),
    overcompensationRate: readOptionalNumber(autoPublishEvidence.overcompensationRate) ?? readOptionalNumber(calibration.overcompensation_rate),
    durationRatio: readOptionalNumber(
      autoPublishEvidence.durationRatio
        ?? parameterPayload.durationRatio
        ?? evidenceSummary.durationRatio
        ?? durationExperience.durationRatio,
    ),
  }
}

function baselineRewardFromDecision(decision: Record<string, unknown>) {
  const baseline = readArray(decision.candidate_actions)
    .map(readRecord)
    .find((action) => normalizeText(action.actionKey) === 'keep_rule_baseline')
  if (baseline) {
    const reward = readRecord(baseline.reward)
    const totalReward = readNumber(reward.totalReward, Number.NaN)
    if (Number.isFinite(totalReward)) return totalReward
    const expectedReward = readNumber(baseline.expectedReward, Number.NaN)
    if (Number.isFinite(expectedReward)) return expectedReward
  }
  const rewardPayload = readRecord(decision.reward_payload)
  return readNumber(rewardPayload.totalReward, 0)
}

function guardrailsFromParameter(parameter: Record<string, unknown>) {
  const summary = readRecord(parameter.reward_summary)
  return readArray(summary.guardrails).map((value) => normalizeText(value)).filter(Boolean)
}

function scopedBucketKey(input: {
  companyId: string | null
  projectId: string | null
  stateBucket: string
}) {
  return [
    `company:${input.companyId ?? 'global'}`,
    `project:${input.projectId ?? 'global'}`,
    `bucket:${input.stateBucket}`,
  ].join('|')
}

function stateBucketLookupVariants(stateBucket: string) {
  const legacyBucket = stateBucket.replace(/\|experience:[^|]+$/, '')
  return Array.from(new Set([stateBucket, legacyBucket].filter(Boolean)))
}

function candidateParameterLookupKeys(input: {
  companyId: string | null
  projectId: string | null
  stateBucket: string
}) {
  const keys: string[] = []
  for (const stateBucket of stateBucketLookupVariants(input.stateBucket)) {
    keys.push(scopedBucketKey({ ...input, stateBucket }))
    if (input.companyId && input.projectId) {
      keys.push(scopedBucketKey({ companyId: input.companyId, projectId: null, stateBucket }))
    }
    if (!input.companyId && input.projectId) {
      keys.push(scopedBucketKey({ companyId: null, projectId: input.projectId, stateBucket }))
    }
    keys.push(scopedBucketKey({ companyId: null, projectId: null, stateBucket }))
  }
  return Array.from(new Set(keys))
}

function indexBestParameterByScope(parameters: Record<string, unknown>[]) {
  const map = new Map<string, Record<string, unknown>>()
  for (const parameter of parameters) {
    const bucket = normalizeText(parameter.state_bucket)
    if (!bucket) continue
    const key = scopedBucketKey({
      companyId: normalizeId(parameter.company_id),
      projectId: normalizeId(parameter.project_id),
      stateBucket: bucket,
    })
    const current = map.get(key)
    if (!current || readNumber(parameter.learned_weight, 0) > readNumber(current.learned_weight, 0)) {
      map.set(key, parameter)
    }
  }
  return map
}

function findBestParameterForDecision(
  parameterByScope: Map<string, Record<string, unknown>>,
  input: {
    companyId: string | null
    projectId: string | null
    stateBucket: string
  },
) {
  for (const key of candidateParameterLookupKeys(input)) {
    const parameter = parameterByScope.get(key)
    if (parameter) return parameter
  }
  return null
}

function canaryBlockedBy(input: {
  stateVector: Record<string, unknown>
  parameter: Record<string, unknown>
  projectedRewardDelta: number
}) {
  const blockedBy: string[] = []
  const guardrails = guardrailsFromParameter(input.parameter)
  if (guardrails.includes('manual_runtime_promotion_required')) blockedBy.push('manual_runtime_promotion_required')
  if (input.stateVector.hardConstraintActive === true) blockedBy.push('hard_constraint_active')
  if (readNumber(input.stateVector.highRiskFactorCount, 0) > 0) blockedBy.push('manual_runtime_promotion_required')
  if (input.projectedRewardDelta <= 0) blockedBy.push('no_positive_projected_reward_delta')
  return Array.from(new Set(blockedBy))
}

export async function runDurationContextLearnedPolicyReplay(input: RunDurationContextLearnedPolicyReplayInput = {}) {
  const minReplayCases = Math.max(1, Math.trunc(readNumber(input.minReplayCases, 20)))
  const [parameters, decisions] = await Promise.all([
    loadCandidateParameters(),
    loadEvaluatedDecisions(input),
  ])
  const decisionProjectIds = Array.from(new Set(
    decisions
      .map((decision) => normalizeId(decision.project_id))
      .filter((projectId): projectId is string => Boolean(projectId)),
  ))
  const calibrationEvidenceById = await loadRewardCalibrationEvidenceById(decisions, decisionProjectIds)
  const parameterByScope = indexBestParameterByScope(parameters)
  const cases = decisions.map((decision) => {
    const stateVector = readRecord(decision.state_vector)
    const stateBucket = buildDurationContextPolicyStateBucket(stateVector)
    const companyId = normalizeId(decision.company_id)
    const projectId = normalizeId(decision.project_id)
    const parameter = findBestParameterForDecision(parameterByScope, {
      companyId,
      projectId,
      stateBucket,
    })
    const baselineReward = baselineRewardFromDecision(decision)
    const learnedReward = parameter ? readNumber(parameter.learned_weight, 0) : baselineReward
    const projectedRewardDelta = round(learnedReward - baselineReward)
    const blockedBy = parameter ? canaryBlockedBy({ stateVector, parameter, projectedRewardDelta }) : ['missing_learned_parameter']
    const rewardCalibrationId = normalizeId(decision.reward_source_calibration_id)
    const rewardCalibration = rewardCalibrationId ? calibrationEvidenceById.get(rewardCalibrationId) ?? null : null
    return {
      decisionId: normalizeId(decision.id),
      companyId,
      projectId,
      stateBucket,
      baselineActionKey: 'keep_rule_baseline' as const,
      baselineReward: round(baselineReward),
      learnedActionKey: parameter ? normalizeText(parameter.action_key) as DurationContextPolicyActionKey : null,
      learnedParameterScope: parameter
        ? {
            companyId: normalizeId(parameter.company_id),
            projectId: normalizeId(parameter.project_id),
          }
        : null,
      learnedProjectedReward: round(learnedReward),
      projectedRewardDelta,
      matchedParameter: Boolean(parameter),
      canaryEligible: Boolean(parameter) && blockedBy.length === 0,
      blockedBy,
      autoPublishEvidence: autoPublishEvidenceFromCalibration(decision, rewardCalibration),
      runtimeMutationPolicy: 'none_replay_report_only' as const,
    }
  })
  const matchedCases = cases.filter((item) => item.matchedParameter)
  const canaryEligibleCases = cases.filter((item) => item.canaryEligible)
  const averageBaselineReward = round(cases.reduce((sum, item) => sum + item.baselineReward, 0) / Math.max(1, cases.length))
  const averageLearnedReward = round(matchedCases.reduce((sum, item) => sum + item.learnedProjectedReward, 0) / Math.max(1, matchedCases.length))
  const projectedRewardDelta = round(averageLearnedReward - averageBaselineReward)
  const guardrailBlockedCount = matchedCases.length - canaryEligibleCases.length
  const canaryReadiness = canaryEligibleCases.length >= minReplayCases && projectedRewardDelta > 0
    ? 'candidate_ready_for_low_risk_canary_review'
    : guardrailBlockedCount > 0
      ? 'blocked_by_guardrails'
      : 'insufficient_positive_replay_evidence'

  return {
    reportCode: 'duration_context_learned_policy_replay' as const,
    frontendExposurePolicy: 'backend_admin_api_only' as const,
    runtimeMutationPolicy: 'none_replay_report_only' as const,
    evaluatedDecisionCount: decisions.length,
    candidateParameterCount: parameters.length,
    matchedParameterCaseCount: matchedCases.length,
    canaryEligibleCaseCount: canaryEligibleCases.length,
    summary: {
      averageBaselineReward,
      averageLearnedReward,
      projectedRewardDelta,
      guardrailBlockedCount,
      minReplayCases,
      canaryReadiness,
    },
    cases,
  }
}
