import { runDurationContextApprovedCanaryShadowReplay } from './durationContextPolicyShadowReplayService.js'

export interface EvaluateDurationContextCanaryActivationReadinessInput {
  projectIds?: string[] | null
  asOfDate?: string | null
  limit?: number | null
  minMatchedCases?: number | null
  minProjectedRewardDelta?: number | null
  maxBlockedCaseRatio?: number | null
}

export interface DurationContextCanaryActivationBlocker {
  code:
    | 'guardrail_violation_detected'
    | 'insufficient_matched_canary_cases'
    | 'insufficient_projected_reward_delta'
    | 'blocked_case_ratio_exceeded'
    | 'runtime_mutation_boundary_changed'
  severity: 'P0' | 'P1' | 'P2'
  message: string
  details?: Record<string, unknown>
}

function readNumber(value: unknown, fallback = 0) {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

function round(value: number, precision = 3) {
  const factor = 10 ** precision
  return Math.round(value * factor) / factor
}

function isHardGuardrail(reason: string) {
  return (
    reason === 'manual_runtime_promotion_required' ||
    reason === 'hard_constraint_active' ||
    reason.includes('high_risk') ||
    reason.includes('runtime_promotion_required')
  )
}

export async function evaluateDurationContextCanaryActivationReadiness(
  input: EvaluateDurationContextCanaryActivationReadinessInput = {},
) {
  const minMatchedCases = Math.max(1, Math.trunc(readNumber(input.minMatchedCases, 20)))
  const minProjectedRewardDelta = Math.max(0, readNumber(input.minProjectedRewardDelta, 0.03))
  const maxBlockedCaseRatio = Math.max(0, Math.min(1, readNumber(input.maxBlockedCaseRatio, 0.2)))
  const replay = await runDurationContextApprovedCanaryShadowReplay({
    projectIds: input.projectIds,
    asOfDate: input.asOfDate,
    limit: input.limit,
  })

  const cases = Array.isArray(replay.cases) ? replay.cases : []
  const guardrailViolationCases = cases.filter((item) =>
    Array.isArray(item.blockedBy) && item.blockedBy.some((reason) => isHardGuardrail(String(reason))),
  )
  const evaluatedDecisionCount = Math.max(1, readNumber(replay.evaluatedDecisionCount, cases.length))
  const matchedCanaryCaseCount = readNumber(replay.matchedCanaryCaseCount, 0)
  const blockedCaseCount = readNumber(replay.blockedCaseCount, Math.max(0, evaluatedDecisionCount - matchedCanaryCaseCount))
  const blockedCaseRatio = round(blockedCaseCount / evaluatedDecisionCount)
  const projectedRewardDelta = readNumber(replay.summary?.projectedRewardDelta, 0)
  const runtimePChanged = replay.summary?.runtimePChanged === true
  const durationContextFactorsChanged = replay.summary?.durationContextFactorsChanged === true

  const blockers: DurationContextCanaryActivationBlocker[] = []
  if (guardrailViolationCases.length > 0) {
    blockers.push({
      code: 'guardrail_violation_detected',
      severity: 'P0',
      message: 'Approved canary shadow replay has hard or high-risk guardrail violations.',
      details: {
        guardrailViolationCount: guardrailViolationCases.length,
        decisionIds: guardrailViolationCases.map((item) => item.decisionId).filter(Boolean),
      },
    })
  }
  if (runtimePChanged || durationContextFactorsChanged) {
    blockers.push({
      code: 'runtime_mutation_boundary_changed',
      severity: 'P0',
      message: 'Activation readiness can only be reported when shadow replay leaves runtime factors unchanged.',
      details: { runtimePChanged, durationContextFactorsChanged },
    })
  }
  if (matchedCanaryCaseCount < minMatchedCases) {
    blockers.push({
      code: 'insufficient_matched_canary_cases',
      severity: 'P1',
      message: 'Matched approved-canary shadow replay cases are below the activation review threshold.',
      details: { matchedCanaryCaseCount, minMatchedCases },
    })
  }
  if (projectedRewardDelta < minProjectedRewardDelta) {
    blockers.push({
      code: 'insufficient_projected_reward_delta',
      severity: 'P1',
      message: 'Projected reward delta is below the activation review threshold.',
      details: { projectedRewardDelta, minProjectedRewardDelta },
    })
  }
  if (blockedCaseRatio > maxBlockedCaseRatio) {
    blockers.push({
      code: 'blocked_case_ratio_exceeded',
      severity: 'P2',
      message: 'Blocked shadow replay case ratio is above the activation review threshold.',
      details: { blockedCaseRatio, maxBlockedCaseRatio },
    })
  }

  const readyForControlledRuntimeTrial = blockers.length === 0
  const readiness = readyForControlledRuntimeTrial
    ? 'ready_for_controlled_runtime_trial_review'
    : guardrailViolationCases.length > 0
      ? 'blocked_by_guardrail_violations'
      : runtimePChanged || durationContextFactorsChanged
        ? 'blocked_by_runtime_mutation_boundary'
        : 'not_ready_for_controlled_runtime_trial_review'

  return {
    gateCode: 'duration_context_canary_activation_readiness_gate' as const,
    frontendExposurePolicy: 'backend_admin_api_only' as const,
    runtimeMutationPolicy: 'none_activation_readiness_report_only' as const,
    activationMode: 'controlled_runtime_trial_candidate' as const,
    thresholds: {
      minMatchedCases,
      minProjectedRewardDelta,
      maxBlockedCaseRatio,
    },
    summary: {
      readyForControlledRuntimeTrial,
      readiness,
      evaluatedDecisionCount,
      matchedCanaryCaseCount,
      blockedCaseCount,
      blockedCaseRatio,
      projectedRewardDelta,
      guardrailViolationCount: guardrailViolationCases.length,
      runtimePChanged,
      durationContextFactorsChanged,
    },
    blockers,
    replay,
  }
}
