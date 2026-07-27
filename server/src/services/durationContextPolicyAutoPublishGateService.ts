import { getClient } from '../database.js'
import type {
  DurationContextPolicyActionKey,
  DurationContextPolicyModelFamily,
} from './durationContextPolicyLearningService.js'
import {
  resolveDurationLearningScopeCoverage,
  type DurationLearningScope,
  type DurationLearningScopeEvidence,
} from './durationLiveLearningClosureService.js'
import { isLowRiskDurationContextPolicyStateBucket } from './durationContextPolicyStateBucketService.js'
import { insertRowReturning } from './transactionInsertService.js'
import { buildDurationContextPolicyLearningIdempotencyUuid } from './durationContextPolicyLearningCheckpointService.js'
import {
  evaluateDurationLearningAssetAutomationPolicy,
  getDurationLearningAutomationHardFloors,
  type DurationLearningAssetAutomationPolicyDecision,
  type DurationLearningAutomationThresholds,
  type DurationLearningExperienceTier,
  type DurationLearningFactSource,
  type DurationLearningReuseScope,
} from './durationLearningAssetAutomationPolicyService.js'

export type DurationContextPolicyAutoPublishPromotionDecision =
  | 'auto_publish_canary'
  | 'hold_as_candidate_for_more_evidence'
  | 'hold_as_candidate_for_manual_review'
  | 'block_and_retain_previous'

export type DurationContextPolicyAutoPublishRuntimeConsumptionStatus =
  | 'canary_auto_published'
  | 'candidate_only'
  | 'blocked_retain_previous'

export interface DurationContextPolicyAutoPublishEvidence {
  evidenceRefs?: readonly string[] | null
  enabledLearningScopes?: readonly DurationLearningScopeEvidence[] | null
  scopeSampleCounts?: Partial<Record<DurationLearningScope | 'system' | 'industry_baseline' | 'segment_baseline', number>> | null
  sampleCount?: number | null
  maeBefore?: number | null
  maeAfter?: number | null
  overcompensationRate?: number | null
  durationRatio?: number | null
  uniqueChangeKeys?: readonly string[] | null
  validChangeCount?: number | null
  taskIds?: readonly string[] | null
  distinctTaskCount?: number | null
  projectIds?: readonly string[] | null
  distinctProjectCount?: number | null
  companyIds?: readonly string[] | null
  distinctCompanyCount?: number | null
  realOutcomeCount?: number | null
  observationWindowDays?: number | null
  conflictRate?: number | null
  rollbackReady?: boolean | null
  tenantScopeValid?: boolean | null
  structuralMutation?: boolean | null
  recentRollback?: boolean | null
  exceptionalConflict?: boolean | null
}

export interface DurationContextPolicyAutoPublishCandidate {
  modelFamily: DurationContextPolicyModelFamily
  status: 'candidate'
  experienceTier: DurationLearningExperienceTier
  experienceAssetType: string
  reuseScope: DurationLearningReuseScope
  factSource: DurationLearningFactSource
  companyId?: string | null
  projectId?: string | null
  projectIds?: readonly string[] | null
  stateBucket: string
  actionKey: DurationContextPolicyActionKey
  requiresReview: boolean
  runtimeAutoPublishEligible: boolean
  replayCaseCount: number
  averageProjectedRewardDelta: number
  sourceDecisionIds: readonly string[]
  guardrails: readonly string[]
  autoPublishEvidence?: DurationContextPolicyAutoPublishEvidence | null
  runtimeParameterProposals?: readonly unknown[] | null
}

export interface BuildDurationContextPolicyAutoPublishDecisionInput {
  asOfDate: string
  candidate: DurationContextPolicyAutoPublishCandidate
  minReplayCases?: number | null
  minTotalSampleCount?: number | null
  minScopeSampleCounts?: Partial<Record<DurationLearningScope, number>> | null
  maxOvercompensationRate?: number | null
  automationThresholdOverrides?: Partial<DurationLearningAutomationThresholds> | null
}

export interface DurationContextPolicyAutoPublishDecision {
  gateCode: 'duration_context_policy_auto_publish_gate'
  asOfDate: string
  promotionDecision: DurationContextPolicyAutoPublishPromotionDecision
  runtimeConsumptionStatus: DurationContextPolicyAutoPublishRuntimeConsumptionStatus
  humanReviewPolicy: 'zero_human_review_when_gate_passes'
  runtimeMutationPolicy: 'canary_version_registry_only_when_gate_passes'
  autoCanaryPublicationAllowed: boolean
  effectivePublicationScope: DurationLearningScope
  reasonCodes: string[]
  assetReleasePolicy: DurationLearningAssetReleasePolicy
  automationPolicyDecision: DurationLearningAssetAutomationPolicyDecision
  candidate: DurationContextPolicyAutoPublishCandidate
  thresholds: DurationLearningAutomationThresholds & { requireMaeStrictImprovement: true }
  observedQuality: {
    replayCaseCount: number
    totalSampleCount: number
    scopeSampleCounts: Record<DurationLearningScope, number>
    normalizedLearningScopes: DurationLearningScope[]
    missingLearningScopes: DurationLearningScope[]
    maeBefore: number | null
    maeAfter: number | null
    overcompensationRate: number | null
    conflictRate: number | null
    validChangeCount: number
    distinctTaskCount: number
    distinctProjectCount: number
    distinctCompanyCount: number
    realOutcomeCount: number
    observationWindowDays: number
    rollbackReady: boolean | null
    tenantScopeValid: boolean | null
  }
}

export interface AutoPublishDurationContextPolicyCandidatesInput {
  asOfDate: string
  candidates?: readonly DurationContextPolicyAutoPublishCandidate[] | null
  persist?: boolean | null
  operationId?: string | null
  idempotencyStage?: string | null
}

export interface AutoPublishDurationContextPolicyCandidatesResult {
  gateCode: 'duration_context_policy_auto_publish_gate'
  asOfDate: string
  humanReviewPolicy: 'zero_human_review_when_gate_passes'
  runtimeMutationPolicy: 'canary_version_registry_only_when_gate_passes'
  candidateCount: number
  autoPublishedVersionCount: number
  manualReviewCandidateCount: number
  evidencePendingCandidateCount: number
  blockedCandidateCount: number
  decisions: DurationContextPolicyAutoPublishDecision[]
}

export type DurationLearningAssetReleaseGovernanceMode =
  | 'auto_canary_with_observation_window'
  | 'batch_manual_approval_required'

export interface ClassifyDurationLearningAssetReleasePolicyInput {
  assetType: string
  scopeLevel?: string | null
  stateBucket?: string | null
  guardrails?: readonly string[] | null
}

export interface DurationLearningAssetReleasePolicy {
  assetRiskTier: 'low' | 'medium' | 'high'
  releaseGovernanceMode: DurationLearningAssetReleaseGovernanceMode
  observationWindowDays: number
  rollbackPolicy:
    | 'auto_rollback_on_mae_bias_overcompensation_or_coverage_regression'
    | 'manual_release_with_auto_monitoring_and_rollback_recommendation'
  reasonCodes: string[]
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

function readOptionalNumber(value: unknown) {
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function round(value: number, precision = 4) {
  const factor = 10 ** precision
  return Math.round(value * factor) / factor
}

function readStringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => normalizeText(item)).filter(Boolean)
    : []
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function normalizeScopeSampleCounts(
  value: DurationContextPolicyAutoPublishEvidence['scopeSampleCounts'],
): Record<DurationLearningScope, number> {
  return {
    global: Math.max(0, Math.trunc(readNumber(value?.global ?? value?.system, 0))),
    industry: Math.max(0, Math.trunc(readNumber(value?.industry ?? value?.industry_baseline ?? value?.segment_baseline, 0))),
    company: Math.max(0, Math.trunc(readNumber(value?.company, 0))),
    project: Math.max(0, Math.trunc(readNumber(value?.project, 0))),
  }
}

function hasHardGuardrail(candidate: DurationContextPolicyAutoPublishCandidate) {
  return candidate.guardrails.some((guardrail) => {
    const normalized = normalizeText(guardrail)
    return normalized === 'manual_runtime_promotion_required'
      || normalized === 'hard_constraint_active'
      || normalized.includes('high_risk')
      || normalized.includes('runtime_promotion_required')
      || normalized.includes('structural_mutation')
      || normalized.includes('tenant_scope')
  })
}

function normalizeLowerText(value: unknown) {
  return normalizeText(value).toLowerCase()
}

export function classifyDurationLearningAssetReleasePolicy(
  input: ClassifyDurationLearningAssetReleasePolicyInput,
): DurationLearningAssetReleasePolicy {
  const assetType = normalizeLowerText(input.assetType)
  const scopeLevel = normalizeLowerText(input.scopeLevel)
  const guardrails = readStringList(input.guardrails).map((guardrail) => guardrail.toLowerCase())
  const reasonCodes: string[] = []
  const isLowRadiusForecastAsset = (
    ['forecast_residual_overlay', 'forecast_confidence_weight', 'duration_context_policy', 'duration_forecast_adjustment', 'project_efficiency_model'].includes(assetType)
    && ['project', 'company'].includes(scopeLevel)
    && isLowRiskDurationContextPolicyStateBucket(input.stateBucket)
  )
  const isHighImpactScheduleNetworkAsset = (
    assetType.includes('base_duration')
    || assetType.includes('critical_path')
    || assetType.includes('dependency_rule')
    || assetType.includes('standard_work_duration_seed')
    || assetType.includes('special_work_duration_seed')
    || assetType.includes('wbs_reference_days')
    || assetType.includes('schedule_network')
    || assetType.includes('benchmark')
  )
  const hasExceptionGuardrail = guardrails.some((guardrail) =>
    guardrail.includes('manual')
    || guardrail.includes('hard_constraint')
    || guardrail.includes('high_risk')
    || guardrail.includes('structural_mutation')
    || guardrail.includes('tenant_scope')
  )

  if (isHighImpactScheduleNetworkAsset) reasonCodes.push('high_impact_schedule_network_asset')
  if (hasExceptionGuardrail) reasonCodes.push('structural_or_hard_guardrail_present')
  if (isLowRadiusForecastAsset && !isHighImpactScheduleNetworkAsset && !hasExceptionGuardrail) {
    reasonCodes.push('low_radius_project_or_company_forecast_asset')
  }

  const automatic = !hasExceptionGuardrail
  const scope = ['project', 'company', 'industry', 'global'].includes(scopeLevel)
    ? scopeLevel as DurationLearningReuseScope
    : 'project'
  const observationWindowDays = getDurationLearningAutomationHardFloors()[scope].canary.minObservationDays
  return {
    assetRiskTier: isLowRadiusForecastAsset && !isHighImpactScheduleNetworkAsset
      ? 'low'
      : isHighImpactScheduleNetworkAsset || hasExceptionGuardrail
        ? 'high'
        : 'medium',
    releaseGovernanceMode: automatic
      ? 'auto_canary_with_observation_window'
      : 'batch_manual_approval_required',
    observationWindowDays,
    rollbackPolicy: automatic
      ? 'auto_rollback_on_mae_bias_overcompensation_or_coverage_regression'
      : 'manual_release_with_auto_monitoring_and_rollback_recommendation',
    reasonCodes: Array.from(new Set(reasonCodes)),
  }
}

function resolveCandidateProjectIds(candidate: DurationContextPolicyAutoPublishCandidate) {
  const projectIds = readStringList(candidate.projectIds)
  const projectId = normalizeId(candidate.projectId)
  return Array.from(new Set([
    ...(projectId ? [projectId] : []),
    ...projectIds,
  ]))
}

function buildAutoCanaryScope(
  candidate: DurationContextPolicyAutoPublishCandidate,
  decision: DurationContextPolicyAutoPublishDecision,
) {
  const projectIds = resolveCandidateProjectIds(candidate)
  return {
    publicationScope: decision.effectivePublicationScope,
    projectIds: decision.effectivePublicationScope === 'project' ? projectIds : [],
    startDate: decision.asOfDate,
    trafficPercent: 5,
    gateCode: decision.gateCode,
    gateDecision: decision.promotionDecision,
    assetRiskTier: decision.assetReleasePolicy.assetRiskTier,
    releaseGovernanceMode: decision.assetReleasePolicy.releaseGovernanceMode,
    observationWindowDays: decision.assetReleasePolicy.observationWindowDays,
    rollbackPolicy: decision.assetReleasePolicy.rollbackPolicy,
    observedQuality: decision.observedQuality,
    thresholds: decision.thresholds,
  }
}

export function buildDurationContextPolicyAutoPublishDecision(
  input: BuildDurationContextPolicyAutoPublishDecisionInput,
): DurationContextPolicyAutoPublishDecision {
  const candidate = input.candidate
  const evidence = candidate.autoPublishEvidence ?? null
  const scopeCoverage = resolveDurationLearningScopeCoverage(evidence?.enabledLearningScopes ?? [])
  const scopeSampleCounts = normalizeScopeSampleCounts(evidence?.scopeSampleCounts)
  const effectivePublicationScope = candidate.reuseScope
  const totalSampleCount = Math.max(0, Math.trunc(readNumber(evidence?.sampleCount, 0)))
  const replayCaseCount = Math.max(0, Math.trunc(readNumber(candidate.replayCaseCount, 0)))
  const projectIds = evidence?.projectIds ?? resolveCandidateProjectIds(candidate)
  const companyIds = evidence?.companyIds ?? (normalizeId(candidate.companyId) ? [normalizeId(candidate.companyId) as string] : [])
  const thresholdOverrides: Partial<DurationLearningAutomationThresholds> = {
    ...(input.automationThresholdOverrides ?? {}),
    ...(input.minReplayCases != null ? { minReplayCases: input.minReplayCases } : {}),
    ...(input.minTotalSampleCount != null ? { minValidChanges: input.minTotalSampleCount } : {}),
    ...(input.maxOvercompensationRate != null ? { maxOvercompensationRate: input.maxOvercompensationRate } : {}),
  }
  const automationPolicyDecision = evaluateDurationLearningAssetAutomationPolicy({
    experienceTier: candidate.experienceTier,
    reuseScope: candidate.reuseScope,
    factSource: candidate.factSource,
    targetStage: 'canary',
    thresholdOverrides,
    evidence: {
      uniqueChangeKeys: evidence?.uniqueChangeKeys,
      validChangeCount: evidence?.validChangeCount ?? totalSampleCount,
      taskIds: evidence?.taskIds,
      distinctTaskCount: evidence?.distinctTaskCount,
      projectIds,
      distinctProjectCount: evidence?.distinctProjectCount,
      companyIds,
      distinctCompanyCount: evidence?.distinctCompanyCount,
      realOutcomeCount: evidence?.realOutcomeCount ?? totalSampleCount,
      replayCaseCount,
      observationWindowDays: evidence?.observationWindowDays,
      maeBefore: evidence?.maeBefore,
      maeAfter: evidence?.maeAfter,
      conflictRate: evidence?.conflictRate,
      overcompensationRate: evidence?.overcompensationRate,
      rollbackReady: evidence?.rollbackReady,
      tenantScopeValid: evidence?.tenantScopeValid ?? (
        Boolean(normalizeId(candidate.companyId))
        && (candidate.reuseScope !== 'project' || projectIds.length > 0)
      ),
      structuralMutation: evidence?.structuralMutation ?? hasHardGuardrail(candidate),
      recentRollback: evidence?.recentRollback,
      exceptionalConflict: evidence?.exceptionalConflict,
    },
  })
  const assetReleasePolicy = classifyDurationLearningAssetReleasePolicy({
    assetType: candidate.experienceAssetType,
    scopeLevel: candidate.reuseScope,
    stateBucket: candidate.stateBucket,
    guardrails: candidate.guardrails,
  })
  const reasonCodes = [...automationPolicyDecision.reasonCodes]
  const autoCanaryPublicationAllowed = automationPolicyDecision.stage === 'auto_canary'
  const promotionDecision: DurationContextPolicyAutoPublishPromotionDecision = autoCanaryPublicationAllowed
    ? 'auto_publish_canary'
    : automationPolicyDecision.stage === 'exception_review'
      ? 'hold_as_candidate_for_manual_review'
      : automationPolicyDecision.stage === 'collecting'
        ? 'hold_as_candidate_for_more_evidence'
        : 'block_and_retain_previous'
  const runtimeConsumptionStatus: DurationContextPolicyAutoPublishRuntimeConsumptionStatus = autoCanaryPublicationAllowed
    ? 'canary_auto_published'
    : automationPolicyDecision.stage === 'blocked_retain_previous'
      ? 'blocked_retain_previous'
      : 'candidate_only'

  return {
    gateCode: 'duration_context_policy_auto_publish_gate',
    asOfDate: input.asOfDate,
    promotionDecision,
    runtimeConsumptionStatus,
    humanReviewPolicy: 'zero_human_review_when_gate_passes',
    runtimeMutationPolicy: 'canary_version_registry_only_when_gate_passes',
    autoCanaryPublicationAllowed,
    effectivePublicationScope,
    reasonCodes: Array.from(new Set(reasonCodes)),
    assetReleasePolicy,
    automationPolicyDecision,
    candidate,
    thresholds: {
      ...automationPolicyDecision.thresholds,
      requireMaeStrictImprovement: true,
    },
    observedQuality: {
      replayCaseCount,
      totalSampleCount,
      scopeSampleCounts,
      normalizedLearningScopes: scopeCoverage.normalizedScopes,
      missingLearningScopes: scopeCoverage.missingScopes,
      maeBefore: automationPolicyDecision.observed.maeBefore == null ? null : round(automationPolicyDecision.observed.maeBefore),
      maeAfter: automationPolicyDecision.observed.maeAfter == null ? null : round(automationPolicyDecision.observed.maeAfter),
      overcompensationRate: automationPolicyDecision.observed.overcompensationRate == null
        ? null
        : round(automationPolicyDecision.observed.overcompensationRate),
      conflictRate: automationPolicyDecision.observed.conflictRate == null
        ? null
        : round(automationPolicyDecision.observed.conflictRate),
      validChangeCount: automationPolicyDecision.observed.validChangeCount,
      distinctTaskCount: automationPolicyDecision.observed.distinctTaskCount,
      distinctProjectCount: automationPolicyDecision.observed.distinctProjectCount,
      distinctCompanyCount: automationPolicyDecision.observed.distinctCompanyCount,
      realOutcomeCount: automationPolicyDecision.observed.realOutcomeCount,
      observationWindowDays: automationPolicyDecision.observed.observationWindowDays,
      rollbackReady: automationPolicyDecision.observed.rollbackReady,
      tenantScopeValid: automationPolicyDecision.observed.tenantScopeValid,
    },
  }
}

function mapCandidateToRow(
  decision: DurationContextPolicyAutoPublishDecision,
  idempotency?: { operationId: string; stage: string } | null,
) {
  const candidate = decision.candidate
  const projectId = normalizeId(candidate.projectId) ?? resolveCandidateProjectIds(candidate)[0] ?? null
  const approved = decision.promotionDecision === 'auto_publish_canary'
  const blocked = decision.promotionDecision === 'block_and_retain_previous'
  const requiresReview = decision.promotionDecision === 'hold_as_candidate_for_manual_review'
  const businessKey = [
    normalizeId(candidate.companyId) ?? 'global',
    projectId ?? 'global',
    candidate.stateBucket,
    candidate.actionKey,
  ].join('|')
  return {
    ...(idempotency ? {
      id: buildDurationContextPolicyLearningIdempotencyUuid(
        idempotency.operationId,
        idempotency.stage,
        businessKey,
      ),
    } : {}),
    model_family: candidate.modelFamily,
    model_version: candidate.modelFamily,
    candidate_status: approved ? 'approved_for_canary' : blocked ? 'rejected' : 'candidate',
    runtime_mutation_policy: 'none_canary_candidate_only',
    runtime_auto_publish_eligible: approved,
    requires_review: requiresReview,
    company_id: normalizeId(candidate.companyId),
    project_id: projectId,
    state_bucket: candidate.stateBucket,
    action_key: candidate.actionKey,
    replay_case_count: Math.max(0, Math.trunc(readNumber(candidate.replayCaseCount, 0))),
    average_projected_reward_delta: readNumber(candidate.averageProjectedRewardDelta, 0),
    source_decision_ids: [...candidate.sourceDecisionIds],
    guardrails: [...candidate.guardrails],
    review_metadata: {
      autoPublishGateCode: decision.gateCode,
      autoPublishGateDecision: decision.promotionDecision,
      autoPublishGateEvaluatedAt: new Date().toISOString(),
      autoPublishGateReasonCodes: decision.reasonCodes,
      humanReviewPolicy: decision.humanReviewPolicy,
      assetIdentity: {
        experienceTier: candidate.experienceTier,
        experienceAssetType: candidate.experienceAssetType,
        reuseScope: candidate.reuseScope,
        factSource: candidate.factSource,
      },
      automationPolicyDecision: decision.automationPolicyDecision,
      observedQuality: decision.observedQuality,
      thresholds: decision.thresholds,
      runtimeParameterProposals: candidate.runtimeParameterProposals ?? [],
      ...(idempotency ? {
        learningOperationId: idempotency.operationId,
        learningStageKey: idempotency.stage,
        idempotencyBusinessKey: businessKey,
      } : {}),
    },
  }
}

function mapVersionToRow(
  decision: DurationContextPolicyAutoPublishDecision,
  candidateRow: Record<string, unknown>,
  idempotency?: { operationId: string; stage: string } | null,
) {
  const candidate = decision.candidate
  return {
    ...(idempotency ? {
      id: buildDurationContextPolicyLearningIdempotencyUuid(
        idempotency.operationId,
        `${idempotency.stage}:version`,
        normalizeText(candidateRow.id),
      ),
    } : {}),
    model_family: candidate.modelFamily,
    model_version: candidate.modelFamily,
    source_candidate_id: normalizeText(candidateRow.id),
    version_status: 'canary',
    activation_mode: 'auto_publish_gate_canary',
    runtime_mutation_policy: 'none_version_registry_only',
    runtime_auto_publish_eligible: false,
    rollback_policy: 'auto_or_manual_rollback_on_mae_regression_or_guardrail_drift',
    company_id: normalizeId(candidateRow.company_id),
    project_id: normalizeId(candidateRow.project_id),
    state_bucket: candidate.stateBucket,
    action_key: candidate.actionKey,
    canary_scope: buildAutoCanaryScope(candidate, decision),
    approved_by: null,
    approved_at: new Date().toISOString(),
    expires_at: null,
    replay_case_count: decision.observedQuality.replayCaseCount,
    average_projected_reward_delta: readNumber(candidate.averageProjectedRewardDelta, 0),
    source_decision_ids: [...candidate.sourceDecisionIds],
    guardrails: [...candidate.guardrails],
    approval_reason: 'auto_publish_gate_passed_zero_human_review',
  }
}

async function markCandidateAsVersionPersistenceFailedInTransaction(
  client: { query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }> },
  candidateRow: Record<string, unknown>,
  versionError: { message?: unknown },
) {
  const candidateId = normalizeText(candidateRow.id)
  if (!candidateId) return

  const existingMetadata = readRecord(candidateRow.review_metadata)
  const reasonCodes = Array.from(new Set([
    ...readStringList(existingMetadata.autoPublishGateReasonCodes),
    'version_persistence_failed',
  ]))
  const errorMessage = normalizeText(versionError.message) || 'unknown version persistence error'

  await client.query(
    `UPDATE duration_context_policy_canary_candidates
        SET candidate_status = $1,
            runtime_auto_publish_eligible = $2,
            requires_review = $3,
            review_metadata = $4,
            updated_at = $5
      WHERE id = $6`,
    [
      'rejected',
      false,
      true,
      {
        ...existingMetadata,
        autoPublishGateDecision: 'auto_publish_canary_failed_version_persistence',
        autoPublishGateReasonCodes: reasonCodes,
        autoPublishGateFailedAt: new Date().toISOString(),
        versionPersistenceError: errorMessage,
      },
      new Date().toISOString(),
      candidateId,
    ],
  )
}

async function persistDecision(
  decision: DurationContextPolicyAutoPublishDecision,
  idempotency?: { operationId: string; stage: string } | null,
) {
  const client = await getClient()
  let committed = false
  let deferredError: Error | null = null
  try {
    await client.query('BEGIN')

    const candidateInsert = mapCandidateToRow(decision, idempotency)
    const candidateId = normalizeText(candidateInsert.id)
    const existingCandidate = candidateId
      ? (await client.query(
          'select * from duration_context_policy_canary_candidates where id = $1 limit 1',
          [candidateId],
        )).rows[0] as Record<string, unknown> | undefined
      : null
    const candidateRow = existingCandidate ?? await insertRowReturning<Record<string, unknown>>(
      client,
      'duration_context_policy_canary_candidates',
      candidateInsert,
    )
    if (!candidateRow) {
      throw new Error('Failed to persist duration context policy auto-publish candidate: empty insert result')
    }

    if (decision.promotionDecision === 'auto_publish_canary') {
      await client.query('SAVEPOINT duration_context_policy_auto_publish_version_insert')
      try {
        const versionInsert = mapVersionToRow(decision, candidateRow, idempotency)
        const versionId = normalizeText(versionInsert.id)
        const activeVersion = idempotency
          ? (await client.query(
              `select * from duration_context_policy_versions
                where model_family = $1
                  and state_bucket = $2
                  and action_key = $3
                  and coalesce(company_id, '00000000-0000-0000-0000-000000000000'::uuid)
                    = coalesce($4::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
                  and coalesce(project_id, '00000000-0000-0000-0000-000000000000'::uuid)
                    = coalesce($5::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
                  and version_status in ('canary', 'published')
                order by approved_at desc
                limit 1`,
              [
                versionInsert.model_family,
                versionInsert.state_bucket,
                versionInsert.action_key,
                versionInsert.company_id,
                versionInsert.project_id,
              ],
            )).rows[0] as Record<string, unknown> | undefined
          : null
        const existingVersion = activeVersion ?? (versionId
          ? (await client.query(
              'select * from duration_context_policy_versions where id = $1 limit 1',
              [versionId],
            )).rows[0] as Record<string, unknown> | undefined
          : null)
        if (!existingVersion) {
          await insertRowReturning<Record<string, unknown>>(
            client,
            'duration_context_policy_versions',
            versionInsert,
          )
        }
      } catch (versionError) {
        await client.query('ROLLBACK TO SAVEPOINT duration_context_policy_auto_publish_version_insert')
        await markCandidateAsVersionPersistenceFailedInTransaction(
          client,
          candidateRow,
          versionError as { message?: unknown },
        )
        deferredError = new Error(
          `Failed to persist duration context policy auto-published canary version: ${String((versionError as { message?: unknown } | null)?.message ?? versionError)}`,
        )
      }
    }

    await client.query('COMMIT')
    committed = true
  } catch (error) {
    if (!committed) {
      await client.query('ROLLBACK').catch(() => undefined)
    }
    throw error
  } finally {
    client.release()
  }

  if (deferredError) {
    throw deferredError
  }
}

export async function autoPublishDurationContextPolicyCandidates(
  input: AutoPublishDurationContextPolicyCandidatesInput,
): Promise<AutoPublishDurationContextPolicyCandidatesResult> {
  const candidates = Array.isArray(input.candidates) ? input.candidates : []
  const decisions = candidates.map((candidate) => buildDurationContextPolicyAutoPublishDecision({
    asOfDate: input.asOfDate,
    candidate,
  }))

  if (input.persist === true) {
    const operationId = normalizeText(input.operationId)
    const idempotency = operationId
      ? { operationId, stage: normalizeText(input.idempotencyStage) || 'decision_persistence' }
      : null
    for (const decision of decisions) {
      await persistDecision(decision, idempotency)
    }
  }

  return {
    gateCode: 'duration_context_policy_auto_publish_gate',
    asOfDate: input.asOfDate,
    humanReviewPolicy: 'zero_human_review_when_gate_passes',
    runtimeMutationPolicy: 'canary_version_registry_only_when_gate_passes',
    candidateCount: decisions.length,
    autoPublishedVersionCount: decisions.filter((decision) => decision.promotionDecision === 'auto_publish_canary').length,
    manualReviewCandidateCount: decisions.filter((decision) => decision.promotionDecision === 'hold_as_candidate_for_manual_review').length,
    evidencePendingCandidateCount: decisions.filter((decision) => decision.promotionDecision === 'hold_as_candidate_for_more_evidence').length,
    blockedCandidateCount: decisions.filter((decision) => decision.promotionDecision === 'block_and_retain_previous').length,
    decisions,
  }
}
