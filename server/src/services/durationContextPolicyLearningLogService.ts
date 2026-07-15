import { supabase } from './dbService.js'
import {
  buildAndPersistDurationContextPolicyRecommendation,
  buildDurationContextPolicyRecommendation,
  evaluateDurationContextPolicyReward,
  type DurationContextPolicyReplayEvidence,
  type DurationContextPolicyFactorSignal,
  type DurationContextPolicyRecommendation,
  type DurationContextPolicyState,
} from './durationContextPolicyLearningService.js'
import { getProjectCompanyId } from '../auth/access.js'

export interface PersistDurationContextPolicyDecisionInput {
  recommendation: DurationContextPolicyRecommendation
  decisionDate?: string | null
  targetRewardDate?: string | null
  sourceCalibrationId?: string | null
  metadata?: Record<string, unknown> | null
}

export interface BackfillDurationContextPolicyRewardsInput {
  asOfDate?: string | null
  projectIds?: string[] | null
  limit?: number | null
}

export interface RunDurationContextPolicyOfflineReplayInput {
  projectIds?: string[] | null
  windowEndDate?: string | null
  limit?: number | null
  persistDecisions?: boolean | null
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
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : text.slice(0, 10)
}

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10)
}

function parseDate(value: unknown) {
  const normalized = normalizeDate(value)
  if (!normalized) return null
  const parsed = new Date(`${normalized}T00:00:00.000Z`)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function formatDate(date: Date) {
  return date.toISOString().slice(0, 10)
}

function addDays(date: Date, days: number) {
  const next = new Date(date)
  next.setUTCDate(next.getUTCDate() + days)
  return next
}

function readNumber(value: unknown, fallback = 0) {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function readRecommendationDecisionStatus(recommendation: DurationContextPolicyRecommendation) {
  if (recommendation.recommendedAction.runtimePolicy === 'auto_publish_eligible') return 'auto_publish_eligible'
  return recommendation.recommendedAction.runtimePolicy
}

function rewardTargetDate(decisionDate: string, explicit?: string | null) {
  const normalized = normalizeDate(explicit)
  if (normalized) return normalized
  return formatDate(addDays(parseDate(decisionDate) ?? new Date(), 30))
}

function projectFilterSet(projectIds?: string[] | null) {
  const values = Array.isArray(projectIds)
    ? projectIds.map((projectId) => normalizeId(projectId)).filter((projectId): projectId is string => Boolean(projectId))
    : []
  return values.length > 0 ? new Set(values) : null
}

function rowScheduleStabilityDelta(row: Record<string, unknown>) {
  const evidence = readRecord(row.evidence_summary)
  const explicit = readNumber(evidence.scheduleStabilityDelta, Number.NaN)
  if (Number.isFinite(explicit)) return explicit
  const biasBefore = Math.abs(readNumber(row.bias_before, Number.NaN))
  const biasAfter = Math.abs(readNumber(row.bias_after, Number.NaN))
  return Number.isFinite(biasBefore) && Number.isFinite(biasAfter) ? biasBefore - biasAfter : 0
}

function buildRewardFromCalibration(decision: Record<string, unknown>, calibration: Record<string, unknown>) {
  const stateVector = readRecord(decision.state_vector)
  const recommendedAction = readRecord(decision.recommended_action)
  return evaluateDurationContextPolicyReward({
    maeBefore: readNumber(calibration.mae_before, 0),
    maeAfter: readNumber(calibration.mae_after, readNumber(calibration.mae_before, 0)),
    overcompensationRate: readNumber(calibration.overcompensation_rate, 0),
    scheduleStabilityDelta: rowScheduleStabilityDelta(calibration),
    hardConstraintViolation: stateVector.hardConstraintActive === true && recommendedAction.runtimeAutoPublishEligible === true,
    highRiskRuntimeAutoPublishAttempted: readNumber(stateVector.highRiskFactorCount, 0) > 0
      && recommendedAction.runtimeAutoPublishEligible === true,
  })
}

async function loadPendingPolicyDecisions(input: BackfillDurationContextPolicyRewardsInput) {
  const asOfDate = normalizeDate(input.asOfDate) ?? todayIsoDate()
  const limit = Math.max(1, Math.min(500, Math.trunc(readNumber(input.limit, 200))))
  const { data, error } = await (supabase as any)
    .from('duration_context_policy_decisions')
    .select('*')
    .eq('reward_status', 'pending')
    .lte('target_reward_date', asOfDate)
    .order('target_reward_date', { ascending: true })
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

async function loadRewardCalibrationForDecision(decision: Record<string, unknown>) {
  const projectId = normalizeId(decision.project_id)
  if (!projectId) return null
  const targetRewardDate = normalizeDate(decision.target_reward_date) ?? normalizeDate(decision.decision_date) ?? todayIsoDate()
  const { data, error } = await (supabase as any)
    .from('project_productivity_compensation_calibrations')
    .select('id, project_id, status, action_policy, window_end_date, mae_before, mae_after, bias_before, bias_after, overcompensation_rate, evidence_summary')
    .eq('project_id', projectId)
    .gte('window_end_date', targetRewardDate)
    .order('window_end_date', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (error || !data) return null
  return data as Record<string, unknown>
}

export async function persistDurationContextPolicyDecision(input: PersistDurationContextPolicyDecisionInput) {
  const recommendation = input.recommendation
  const decisionDate = normalizeDate(input.decisionDate) ?? todayIsoDate()
  const row = {
    company_id: normalizeId(recommendation.companyId),
    project_id: recommendation.projectId,
    model_family: recommendation.modelFamily,
    model_version: recommendation.modelFamily,
    decision_status: readRecommendationDecisionStatus(recommendation),
    decision_date: decisionDate,
    target_reward_date: rewardTargetDate(decisionDate, input.targetRewardDate),
    source_calibration_id: normalizeId(input.sourceCalibrationId),
    state_vector: recommendation.stateVector,
    candidate_actions: recommendation.candidateActions,
    recommended_action: recommendation.recommendedAction,
    rule_baseline_p: recommendation.stateVector.ruleBaselineP,
    current_p: recommendation.stateVector.currentP,
    runtime_policy: recommendation.recommendedAction.runtimePolicy,
    runtime_auto_publish_eligible: recommendation.recommendedAction.runtimeAutoPublishEligible,
    runtime_mutation_policy: 'none_decision_log_only',
    reward_status: 'pending',
    metadata: {
      ...(input.metadata ?? {}),
      governance: recommendation.governance,
    },
  }
  const { data, error } = await (supabase as any)
    .from('duration_context_policy_decisions')
    .insert(row)
    .select('*')
    .single()
  if (error) throw new Error(`Failed to persist duration context policy decision: ${error.message}`)
  return data
}

export async function backfillDurationContextPolicyRewards(input: BackfillDurationContextPolicyRewardsInput = {}) {
  const decisions = await loadPendingPolicyDecisions(input)
  const result = {
    scanned: decisions.length,
    evaluated: 0,
    skipped: 0,
    failed: 0,
  }

  for (const decision of decisions) {
    try {
      const calibration = await loadRewardCalibrationForDecision(decision)
      if (!calibration) {
        result.skipped += 1
        continue
      }
      const reward = buildRewardFromCalibration(decision, calibration)
      const { error } = await (supabase as any)
        .from('duration_context_policy_decisions')
        .update({
          decision_status: 'reward_evaluated',
          reward_status: 'evaluated',
          reward_payload: reward,
          reward_source_calibration_id: normalizeId(calibration.id),
          reward_evaluated_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', decision.id)
      if (error) throw new Error(error.message)
      result.evaluated += 1
    } catch {
      result.failed += 1
    }
  }

  return result
}

async function loadReplayCalibrations(input: RunDurationContextPolicyOfflineReplayInput) {
  const limit = Math.max(1, Math.min(500, Math.trunc(readNumber(input.limit, 200))))
  const windowEndDate = normalizeDate(input.windowEndDate) ?? todayIsoDate()
  const { data, error } = await (supabase as any)
    .from('project_productivity_compensation_calibrations')
    .select('*')
    .lte('window_end_date', windowEndDate)
    .order('window_end_date', { ascending: false })
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

function policyRecommendationInputFromCalibration(row: Record<string, unknown>): {
  companyId?: string | null
  projectId: string | null
  state: DurationContextPolicyState
  replayEvidence: DurationContextPolicyReplayEvidence
} {
  const evidence = readRecord(row.evidence_summary)
  const compensation = readRecord(evidence.compensation)
  const metadata = readRecord(compensation.metadata)
  const factorSignals: DurationContextPolicyFactorSignal[] = [
    {
      factorKey: 'productivity_compensation',
      multiplier: readNumber(compensation.durationMultiplier, 1),
      extraDays: 0,
      actionPolicy: normalizeText(compensation.actionPolicy) === 'auto_apply' ? 'auto_apply' : 'candidate_only',
    },
  ]
  return {
    companyId: normalizeId(row.company_id),
    projectId: normalizeId(row.project_id),
    state: {
      maturityDays: readNumber(row.maturity_days, Math.max(readNumber(row.sample_count, 0), readNumber(row.snapshot_count, 0))),
      ruleBaselineP: readNumber(row.base_productivity, 1),
      currentP: readNumber(row.adjusted_productivity, readNumber(row.base_productivity, 1)),
      scheduleState: normalizeText(metadata.dominantScheduleState) || null,
      factorSignals,
    },
    replayEvidence: {
      maeBefore: readNumber(row.mae_before, 0),
      maeAfter: readNumber(row.mae_after, readNumber(row.mae_before, 0)),
      overcompensationRate: readNumber(row.overcompensation_rate, 0),
      sampleCount: Math.max(readNumber(row.sample_count, 0), readNumber(row.snapshot_count, 0)),
      scheduleStabilityDelta: rowScheduleStabilityDelta(row),
    },
  }
}

function recommendationFromCalibration(row: Record<string, unknown>) {
  return buildDurationContextPolicyRecommendation(policyRecommendationInputFromCalibration(row))
}

export async function runDurationContextPolicyOfflineReplay(input: RunDurationContextPolicyOfflineReplayInput = {}) {
  const rows = await loadReplayCalibrations(input)
  const recommendations = rows.map(recommendationFromCalibration)
  let persistedDecisionCount = 0
  if (input.persistDecisions === true) {
    for (let index = 0; index < rows.length; index += 1) {
      let recommendation = recommendations[index]
      const sourceRow = rows[persistedDecisionCount]
      const projectId = normalizeId(sourceRow.project_id)
      const companyId = normalizeId(sourceRow.company_id) ?? (projectId ? await getProjectCompanyId(projectId) : null)
      if (companyId && !recommendation.companyId) {
        recommendation = buildDurationContextPolicyRecommendation({
          ...policyRecommendationInputFromCalibration(sourceRow),
          companyId,
          projectId,
        })
        recommendations[index] = recommendation
      }
      await persistDurationContextPolicyDecision({
        recommendation,
        decisionDate: normalizeDate(sourceRow.window_end_date) ?? normalizeDate(input.windowEndDate) ?? todayIsoDate(),
        sourceCalibrationId: normalizeId(sourceRow.id),
        metadata: { source: 'duration_context_policy_offline_replay' },
      })
      if (companyId) {
        const policyInput = policyRecommendationInputFromCalibration(sourceRow)
        await buildAndPersistDurationContextPolicyRecommendation({
          companyId,
          projectId,
          state: policyInput.state,
          replayEvidence: policyInput.replayEvidence,
        })
      }
      persistedDecisionCount += 1
    }
  }

  return {
    replayCode: 'duration_context_policy_offline_replay',
    frontendExposurePolicy: 'backend_admin_api_only',
    runtimeMutationPolicy: 'none_candidate_report_only',
    scanned: rows.length,
    recommendationCount: recommendations.length,
    persistedDecisionCount,
    recommendations,
  }
}
