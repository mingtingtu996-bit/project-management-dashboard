import { evaluateDurationContextCanaryActivationReadiness } from './durationContextPolicyActivationGateService.js'

export interface BuildDurationContextCanaryTrialReleasePlanInput {
  projectIds?: string[] | null
  asOfDate?: string | null
  limit?: number | null
  minMatchedCases?: number | null
  minProjectedRewardDelta?: number | null
  maxBlockedCaseRatio?: number | null
  requestedTrafficPercent?: number | null
  trialDays?: number | null
  requestedBy?: string | null
}

export interface DurationContextCanaryTrialReleasePlanBlocker {
  code: string
  severity: 'P0' | 'P1' | 'P2'
  message: string
  details?: Record<string, unknown>
}

function normalizeId(value: unknown) {
  const text = String(value ?? '').trim()
  return text || null
}

function normalizeDate(value: unknown) {
  const text = String(value ?? '').trim()
  return /^\d{4}-\d{2}-\d{2}/.test(text) ? text.slice(0, 10) : new Date().toISOString().slice(0, 10)
}

function readNumber(value: unknown, fallback: number) {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

function clampTrafficPercent(value: unknown) {
  return Math.max(1, Math.min(10, Math.trunc(readNumber(value, 5))))
}

function clampTrialDays(value: unknown) {
  return Math.max(3, Math.min(30, Math.trunc(readNumber(value, 14))))
}

function addDays(isoDate: string, days: number) {
  const date = new Date(`${isoDate}T00:00:00.000Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

function normalizeProjectIds(projectIds: string[] | null | undefined) {
  return Array.isArray(projectIds)
    ? projectIds.map((projectId) => normalizeId(projectId)).filter((projectId): projectId is string => Boolean(projectId))
    : []
}

export async function buildDurationContextCanaryTrialReleasePlan(
  input: BuildDurationContextCanaryTrialReleasePlanInput = {},
) {
  const asOfDate = normalizeDate(input.asOfDate)
  const projectIds = normalizeProjectIds(input.projectIds)
  const requestedTrafficPercent = clampTrafficPercent(input.requestedTrafficPercent)
  const trialDays = clampTrialDays(input.trialDays)
  const requestedBy = normalizeId(input.requestedBy)

  const activationReadiness = await evaluateDurationContextCanaryActivationReadiness({
    projectIds,
    asOfDate,
    limit: input.limit,
    minMatchedCases: input.minMatchedCases,
    minProjectedRewardDelta: input.minProjectedRewardDelta,
    maxBlockedCaseRatio: input.maxBlockedCaseRatio,
  })

  const runtimePChanged = activationReadiness.summary.runtimePChanged === true
  const durationContextFactorsChanged = activationReadiness.summary.durationContextFactorsChanged === true
  const readyForReleaseRequest = activationReadiness.summary.readyForControlledRuntimeTrial === true
    && !runtimePChanged
    && !durationContextFactorsChanged

  const blockers: DurationContextCanaryTrialReleasePlanBlocker[] = []
  if (!activationReadiness.summary.readyForControlledRuntimeTrial) {
    blockers.push({
      code: 'activation_readiness_not_ready',
      severity: 'P0',
      message: 'Controlled trial release planning requires a ready activation-readiness gate.',
      details: {
        readiness: activationReadiness.summary.readiness,
        activationBlockers: activationReadiness.blockers,
      },
    })
  }
  if (runtimePChanged || durationContextFactorsChanged) {
    blockers.push({
      code: 'runtime_mutation_boundary_changed',
      severity: 'P0',
      message: 'Trial release planning must not mutate runtime P or duration context factor outputs.',
      details: { runtimePChanged, durationContextFactorsChanged },
    })
  }

  const releasePlan = readyForReleaseRequest
    ? {
      status: 'draft_review_required' as const,
      approvalRequired: true,
      runtimeActivationPolicy: 'manual_release_required' as const,
      requestedBy,
      trafficPercent: requestedTrafficPercent,
      trialDays,
      scope: {
        projectIds,
        startDate: asOfDate,
        endDate: addDays(asOfDate, trialDays),
      },
      rollbackRequired: true,
      rollbackTriggers: [
        'negative_reward_delta',
        'overcompensation_rate_increase',
        'hard_constraint_or_high_risk_signal',
        'duration_context_factor_mutation_detected',
        'manual_admin_rollback',
      ],
      monitoringSignals: [
        'projected_reward_delta',
        'overcompensation_rate',
        'blocked_case_ratio',
        'hard_constraint_signal_count',
        'runtime_boundary_integrity',
      ],
    }
    : null

  return {
    planCode: 'duration_context_canary_controlled_trial_release_plan' as const,
    frontendExposurePolicy: 'backend_admin_api_only' as const,
    runtimeMutationPolicy: 'none_trial_release_plan_only' as const,
    releaseMode: 'controlled_runtime_trial_review_request' as const,
    summary: {
      readyForReleaseRequest,
      releaseReadiness: readyForReleaseRequest
        ? 'draft_release_plan_ready_for_admin_review'
        : 'blocked_by_activation_readiness_gate',
      runtimePChanged,
      durationContextFactorsChanged,
      requestedTrafficPercent,
      trialDays,
      rollbackRequired: true,
    },
    releasePlan,
    blockers,
    activationReadiness,
  }
}
