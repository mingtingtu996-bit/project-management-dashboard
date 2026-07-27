import { supabase } from './dbService.js'
import { buildDurationContextPolicyStateBucket } from './durationContextPolicyParameterLearningService.js'
import { previewDurationContextPolicySelection } from './durationContextPolicySelectorService.js'

export interface RunDurationContextApprovedCanaryShadowReplayInput {
  projectIds?: string[] | null
  asOfDate?: string | null
  limit?: number | null
}

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

function normalizeId(value: unknown) {
  const text = normalizeText(value)
  return text || null
}

function normalizeDate(value: unknown) {
  const text = normalizeText(value)
  if (!text) return null
  return /^\d{4}-\d{2}-\d{2}/.test(text) ? text.slice(0, 10) : null
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

function projectFilterSet(projectIds?: string[] | null) {
  const values = Array.isArray(projectIds)
    ? projectIds.map((projectId) => normalizeId(projectId)).filter((projectId): projectId is string => Boolean(projectId))
    : []
  return values.length > 0 ? new Set(values) : null
}

async function loadEvaluatedDecisions(input: RunDurationContextApprovedCanaryShadowReplayInput) {
  const limit = Math.max(1, Math.min(2_000, Math.trunc(readNumber(input.limit, 1_000))))
  const { data, error } = await (supabase as any)
    .from('duration_context_policy_decisions')
    .select('id, project_id, model_family, decision_date, state_vector, candidate_actions, reward_payload, reward_status')
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

function rewardForAction(decision: Record<string, unknown>, actionKey: string | null) {
  if (!actionKey) return null
  const action = readArray(decision.candidate_actions)
    .map(readRecord)
    .find((item) => normalizeText(item.actionKey) === actionKey)
  if (!action) return null
  const reward = readRecord(action.reward)
  const totalReward = readNumber(reward.totalReward, Number.NaN)
  if (Number.isFinite(totalReward)) return totalReward
  const expectedReward = readNumber(action.expectedReward, Number.NaN)
  return Number.isFinite(expectedReward) ? expectedReward : null
}

export async function runDurationContextApprovedCanaryShadowReplay(
  input: RunDurationContextApprovedCanaryShadowReplayInput = {},
) {
  const asOfDate = normalizeDate(input.asOfDate) ?? new Date().toISOString().slice(0, 10)
  const decisions = await loadEvaluatedDecisions(input)
  const cases = []

  for (const decision of decisions) {
    const decisionId = normalizeId(decision.id)
    const projectId = normalizeId(decision.project_id)
    const stateVector = readRecord(decision.state_vector)
    const stateBucket = buildDurationContextPolicyStateBucket(stateVector)
    const selector = await previewDurationContextPolicySelection({
      projectId,
      stateBucket,
      asOfDate,
      decisionId,
    } as any)
    const baselineReward = round(baselineRewardFromDecision(decision))
    const version = selector.wouldApplyPolicyVersion
    const canaryReward = version ? rewardForAction(decision, version.actionKey) : null
    const blockedBy = [
      ...selector.blockedReasons,
      ...(version && canaryReward == null ? ['matching_action_reward_not_found'] : []),
    ]
    const matched = Boolean(version && canaryReward != null && blockedBy.length === 0)
    cases.push({
      decisionId,
      projectId,
      stateBucket,
      canaryVersionId: matched ? version!.id : null,
      canaryActionKey: matched ? version!.actionKey : null,
      baselineReward,
      canaryProjectedReward: matched ? round(canaryReward!) : null,
      projectedRewardDelta: matched ? round(canaryReward! - baselineReward) : 0,
      blockedBy,
      runtimeMutationPolicy: 'none_shadow_replay_only' as const,
    })
  }

  const matchedCases = cases.filter((item) => item.canaryVersionId)
  const averageBaselineReward = round(cases.reduce((sum, item) => sum + item.baselineReward, 0) / Math.max(1, cases.length))
  const averageCanaryReward = round(matchedCases.reduce((sum, item) => sum + Number(item.canaryProjectedReward ?? 0), 0) / Math.max(1, matchedCases.length))
  const projectedRewardDelta = round(averageCanaryReward - averageBaselineReward)
  const readiness = matchedCases.length > 0 && projectedRewardDelta > 0
    ? 'shadow_replay_positive_review_required'
    : matchedCases.length > 0
      ? 'shadow_replay_non_positive'
      : 'no_matching_canary_cases'

  return {
    replayCode: 'duration_context_approved_canary_shadow_replay' as const,
    frontendExposurePolicy: 'backend_admin_api_only' as const,
    runtimeMutationPolicy: 'none_shadow_replay_only' as const,
    evaluatedDecisionCount: decisions.length,
    matchedCanaryCaseCount: matchedCases.length,
    blockedCaseCount: cases.length - matchedCases.length,
    summary: {
      averageBaselineReward,
      averageCanaryReward,
      projectedRewardDelta,
      runtimePChanged: false,
      durationContextFactorsChanged: false,
      readiness,
    },
    cases,
  }
}
