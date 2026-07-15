import { supabase } from './dbService.js'
import { runDurationContextLearnedPolicyReplay } from './durationContextLearnedPolicyReplayService.js'
import type { DurationContextPolicyActionKey } from './durationContextPolicyLearningService.js'
import type { DurationContextPolicyAutoPublishEvidence } from './durationContextPolicyAutoPublishGateService.js'
import { buildDurationContextPolicyLearningIdempotencyUuid } from './durationContextPolicyLearningCheckpointService.js'
import { getAlgorithmAssetLearnableParameter } from './algorithmAssetLearnableParameterRegistryService.js'
import type { DurationContextPolicyRuntimeParameterProposal } from './durationContextPolicyRuntimePublicationBridgeService.js'

export interface GenerateDurationContextPolicyCanaryCandidatesInput {
  projectIds?: string[] | null
  minReplayCases?: number | null
  minProjectedRewardDelta?: number | null
  persist?: boolean | null
  operationId?: string | null
  idempotencyStage?: string | null
}

export interface DurationContextPolicyCanaryCandidate {
  modelFamily: 'contextual_bandit_v1'
  status: 'candidate'
  experienceTier: 'T3'
  experienceAssetType: 'project_efficiency_model'
  reuseScope: 'project' | 'company' | 'industry'
  factSource: 'replay' | 'hybrid'
  companyId: string | null
  projectIds: string[]
  stateBucket: string
  actionKey: DurationContextPolicyActionKey
  requiresReview: false
  runtimeAutoPublishEligible: false
  replayCaseCount: number
  averageProjectedRewardDelta: number
  sourceDecisionIds: string[]
  guardrails: string[]
  autoPublishEvidence?: DurationContextPolicyAutoPublishEvidence | null
  runtimeParameterProposals?: DurationContextPolicyRuntimeParameterProposal[]
}

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

function readNumber(value: unknown, fallback = 0) {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

function readOptionalNumber(value: unknown) {
  if (value == null || value === '') return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function readOptionalStringList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  const values = value.map((item) => normalizeText(item)).filter(Boolean)
  return values.length > 0 ? values : undefined
}

function readOptionalBoolean(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null
}

function round(value: number, precision = 3) {
  const factor = 10 ** precision
  return Math.round(value * factor) / factor
}

function isLowRiskBucket(bucket: string) {
  return bucket.includes('|risk:low|')
}

function candidateGroupKey(item: {
  companyId?: string | null
  projectId?: string | null
  stateBucket: string
  learnedActionKey: string | null
}) {
  return [
    `company:${normalizeText(item.companyId) || 'global'}`,
    `project:${normalizeText(item.projectId) || 'global'}`,
    `bucket:${item.stateBucket}`,
    `action:${item.learnedActionKey ?? 'none'}`,
  ].join('|')
}

function readAutoPublishEvidence(value: unknown): DurationContextPolicyAutoPublishEvidence | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  const evidenceRefs = readOptionalStringList(record.evidenceRefs)
  const enabledLearningScopes = readOptionalStringList(record.enabledLearningScopes)
  const scopeSampleCounts = record.scopeSampleCounts && typeof record.scopeSampleCounts === 'object' && !Array.isArray(record.scopeSampleCounts)
    ? record.scopeSampleCounts as DurationContextPolicyAutoPublishEvidence['scopeSampleCounts']
    : undefined
  const sampleCount = readOptionalNumber(record.sampleCount)
  const maeBefore = readOptionalNumber(record.maeBefore)
  const maeAfter = readOptionalNumber(record.maeAfter)
  const overcompensationRate = readOptionalNumber(record.overcompensationRate)
  const durationRatio = readOptionalNumber(record.durationRatio)
  const conflictRate = readOptionalNumber(record.conflictRate)

  return {
    evidenceRefs,
    enabledLearningScopes,
    scopeSampleCounts,
    sampleCount,
    maeBefore,
    maeAfter,
    overcompensationRate,
    durationRatio,
    uniqueChangeKeys: readOptionalStringList(record.uniqueChangeKeys),
    validChangeCount: readOptionalNumber(record.validChangeCount),
    taskIds: readOptionalStringList(record.taskIds),
    distinctTaskCount: readOptionalNumber(record.distinctTaskCount),
    projectIds: readOptionalStringList(record.projectIds),
    distinctProjectCount: readOptionalNumber(record.distinctProjectCount),
    companyIds: readOptionalStringList(record.companyIds),
    distinctCompanyCount: readOptionalNumber(record.distinctCompanyCount),
    realOutcomeCount: readOptionalNumber(record.realOutcomeCount),
    observationWindowDays: readOptionalNumber(record.observationWindowDays),
    conflictRate,
    rollbackReady: readOptionalBoolean(record.rollbackReady),
    tenantScopeValid: readOptionalBoolean(record.tenantScopeValid),
    structuralMutation: readOptionalBoolean(record.structuralMutation),
    recentRollback: readOptionalBoolean(record.recentRollback),
    exceptionalConflict: readOptionalBoolean(record.exceptionalConflict),
  }
}

function autoPublishEvidenceKey(evidence: DurationContextPolicyAutoPublishEvidence) {
  const refs = evidence.evidenceRefs ?? []
  if (refs.length > 0) return refs.slice().sort().join('|')
  return JSON.stringify({
    enabledLearningScopes: evidence.enabledLearningScopes ?? [],
    scopeSampleCounts: evidence.scopeSampleCounts ?? {},
    sampleCount: evidence.sampleCount ?? null,
    maeBefore: evidence.maeBefore ?? null,
    maeAfter: evidence.maeAfter ?? null,
    overcompensationRate: evidence.overcompensationRate ?? null,
    durationRatio: evidence.durationRatio ?? null,
  })
}

function autoPublishEvidenceSampleKey(evidence: DurationContextPolicyAutoPublishEvidence) {
  const refs = evidence.evidenceRefs ?? []
  const calibrationRef = refs.find((ref) => ref.startsWith('project_productivity_compensation_calibrations:'))
  return calibrationRef ?? autoPublishEvidenceKey(evidence)
}

function aggregateAutoPublishEvidence(items: Array<{ autoPublishEvidence?: unknown }>) {
  const evidences = items.map((item) => readAutoPublishEvidence(item.autoPublishEvidence))
  if (evidences.length === 0 || evidences.some((evidence) => !evidence)) return null

  const definedEvidence = Array.from(
    new Map(
      evidences
        .filter((evidence): evidence is DurationContextPolicyAutoPublishEvidence => Boolean(evidence))
        .map((evidence) => [autoPublishEvidenceSampleKey(evidence), evidence] as const),
    ).values(),
  )
  if (definedEvidence.length === 0) return null

  const scopeSampleCounts = definedEvidence.reduce((acc, evidence) => {
    const source = evidence.scopeSampleCounts ?? {}
    return {
      global: acc.global + Math.max(0, Math.trunc(readNumber(source.global ?? source.system, 0))),
      industry: acc.industry + Math.max(0, Math.trunc(readNumber(source.industry ?? source.industry_baseline ?? source.segment_baseline, 0))),
      company: acc.company + Math.max(0, Math.trunc(readNumber(source.company, 0))),
      project: acc.project + Math.max(0, Math.trunc(readNumber(source.project, 0))),
    }
  }, {
    global: 0,
    industry: 0,
    company: 0,
    project: 0,
  })

  const enabledLearningScopes = Array.from(new Set(
    definedEvidence.flatMap((evidence) => evidence.enabledLearningScopes ?? []),
  ))
  const evidenceRefs = Array.from(new Set(
    definedEvidence.flatMap((evidence) => evidence.evidenceRefs ?? []),
  ))

  const totalSampleCount = definedEvidence.reduce((sum, evidence) => sum + Math.max(0, Math.trunc(readNumber(evidence.sampleCount, 0))), 0)
  const maeBeforeValues = definedEvidence.map((evidence) => readOptionalNumber(evidence.maeBefore)).filter((value): value is number => value !== null)
  const maeAfterValues = definedEvidence.map((evidence) => readOptionalNumber(evidence.maeAfter)).filter((value): value is number => value !== null)
  const overcompensationValues = definedEvidence.map((evidence) => readOptionalNumber(evidence.overcompensationRate)).filter((value): value is number => value !== null)
  const durationRatioValues = definedEvidence.map((evidence) => readOptionalNumber(evidence.durationRatio)).filter((value): value is number => value !== null)
  const conflictRateValues = definedEvidence.map((evidence) => readOptionalNumber(evidence.conflictRate)).filter((value): value is number => value !== null)
  const observationWindowValues = definedEvidence.map((evidence) => readOptionalNumber(evidence.observationWindowDays)).filter((value): value is number => value !== null)
  const unique = (values: Array<readonly string[] | null | undefined>) => Array.from(new Set(values.flatMap((value) => value ?? [])))
  const uniqueChangeKeys = unique(definedEvidence.map((evidence) => evidence.uniqueChangeKeys))
  const taskIds = unique(definedEvidence.map((evidence) => evidence.taskIds))
  const projectIds = unique(definedEvidence.map((evidence) => evidence.projectIds))
  const companyIds = unique(definedEvidence.map((evidence) => evidence.companyIds))
  const validChangeValues = definedEvidence.map((evidence) => readOptionalNumber(evidence.validChangeCount)).filter((value): value is number => value !== null)
  const distinctTaskValues = definedEvidence.map((evidence) => readOptionalNumber(evidence.distinctTaskCount)).filter((value): value is number => value !== null)
  const distinctProjectValues = definedEvidence.map((evidence) => readOptionalNumber(evidence.distinctProjectCount)).filter((value): value is number => value !== null)
  const distinctCompanyValues = definedEvidence.map((evidence) => readOptionalNumber(evidence.distinctCompanyCount)).filter((value): value is number => value !== null)
  const rollbackValues = definedEvidence.map((evidence) => readOptionalBoolean(evidence.rollbackReady)).filter((value): value is boolean => value !== null)
  const tenantValues = definedEvidence.map((evidence) => readOptionalBoolean(evidence.tenantScopeValid)).filter((value): value is boolean => value !== null)

  return {
    ...(evidenceRefs.length > 0 ? { evidenceRefs } : {}),
    enabledLearningScopes,
    scopeSampleCounts,
    sampleCount: totalSampleCount,
    maeBefore: maeBeforeValues.length > 0 ? round(maeBeforeValues.reduce((sum, value) => sum + value, 0) / maeBeforeValues.length) : null,
    maeAfter: maeAfterValues.length > 0 ? round(maeAfterValues.reduce((sum, value) => sum + value, 0) / maeAfterValues.length) : null,
    overcompensationRate: overcompensationValues.length > 0 ? round(overcompensationValues.reduce((sum, value) => sum + value, 0) / overcompensationValues.length) : null,
    durationRatio: durationRatioValues.length > 0 ? round(durationRatioValues.reduce((sum, value) => sum + value, 0) / durationRatioValues.length) : null,
    ...(uniqueChangeKeys.length > 0 ? { uniqueChangeKeys } : {}),
    ...(taskIds.length > 0 ? { taskIds } : {}),
    ...(projectIds.length > 0 ? { projectIds } : {}),
    ...(companyIds.length > 0 ? { companyIds } : {}),
    ...(validChangeValues.length > 0 ? { validChangeCount: validChangeValues.reduce((sum, value) => sum + Math.max(0, Math.trunc(value)), 0) } : {}),
    ...(taskIds.length > 0 || distinctTaskValues.length > 0 ? { distinctTaskCount: taskIds.length || distinctTaskValues.reduce((sum, value) => sum + Math.max(0, Math.trunc(value)), 0) } : {}),
    ...(projectIds.length > 0 || distinctProjectValues.length > 0 ? { distinctProjectCount: projectIds.length || distinctProjectValues.reduce((sum, value) => sum + Math.max(0, Math.trunc(value)), 0) } : {}),
    ...(companyIds.length > 0 || distinctCompanyValues.length > 0 ? { distinctCompanyCount: companyIds.length || distinctCompanyValues.reduce((sum, value) => sum + Math.max(0, Math.trunc(value)), 0) } : {}),
    realOutcomeCount: definedEvidence.reduce((sum, evidence) => sum + Math.max(0, Math.trunc(readNumber(evidence.realOutcomeCount ?? evidence.sampleCount, 0))), 0),
    ...(observationWindowValues.length > 0 ? { observationWindowDays: Math.min(...observationWindowValues) } : {}),
    ...(conflictRateValues.length > 0 ? { conflictRate: round(conflictRateValues.reduce((sum, value) => sum + value, 0) / conflictRateValues.length) } : {}),
    ...(rollbackValues.length > 0 ? { rollbackReady: rollbackValues.every(Boolean) } : {}),
    ...(tenantValues.length > 0 ? { tenantScopeValid: tenantValues.every(Boolean) } : {}),
    ...(definedEvidence.some((evidence) => evidence.structuralMutation === true) ? { structuralMutation: true } : {}),
    ...(definedEvidence.some((evidence) => evidence.recentRollback === true) ? { recentRollback: true } : {}),
    ...(definedEvidence.some((evidence) => evidence.exceptionalConflict === true) ? { exceptionalConflict: true } : {}),
  } satisfies DurationContextPolicyAutoPublishEvidence
}

function buildRuntimeParameterProposals(
  candidate: Omit<DurationContextPolicyCanaryCandidate, 'runtimeParameterProposals'>,
): DurationContextPolicyRuntimeParameterProposal[] {
  if (candidate.actionKey !== 'publish_low_risk_calibration_threshold') return []
  const evidence = candidate.autoPublishEvidence
  if (!evidence) return []
  const parameter = getAlgorithmAssetLearnableParameter('duration.benchmark_blend_weight')
  if (!parameter || typeof parameter.currentValue !== 'number') return []
  const maeBefore = readOptionalNumber(evidence.maeBefore)
  const maeAfter = readOptionalNumber(evidence.maeAfter)
  if (maeBefore == null || maeAfter == null || maeAfter > maeBefore) return []
  const boundedPositiveDelta = Math.min(
    parameter.maxDeltaPerRelease,
    Math.max(0.01, Math.min(0.05, candidate.averageProjectedRewardDelta * 0.25)),
  )
  const proposedValue = round(Math.min(1, parameter.currentValue + boundedPositiveDelta), 4)
  const scopeKey = [
    candidate.companyId ?? 'global',
    candidate.projectIds.slice().sort().join(',') || 'global',
    candidate.stateBucket,
  ].join('|')
  const proposals: DurationContextPolicyRuntimeParameterProposal[] = [{
    proposalId: `duration-benchmark-blend:${scopeKey}`,
    parameterKey: parameter.parameterKey,
    companyId: candidate.companyId,
    projectId: candidate.projectIds.length === 1 ? candidate.projectIds[0] : null,
    currentValue: parameter.currentValue,
    proposedValue,
    changeKind: 'duration',
    sourceDecisionIds: candidate.sourceDecisionIds,
    evidence: {
      sampleCount: evidence.sampleCount,
      replayPassed: true,
      conflictFree: candidate.guardrails.every((guardrail) => !guardrail.includes('hard') && !guardrail.includes('high_risk')),
      rollbackTarget: parameter.rollbackTarget,
      maeBefore,
      maeAfter,
      maeImprovement: round(maeBefore - maeAfter, 4),
      overcompensationRate: evidence.overcompensationRate,
      evidenceRefs: evidence.evidenceRefs ? [...evidence.evidenceRefs] : [],
    },
    metadata: {
      derivationPolicy: 'bounded_empirical_weight_increase_after_positive_low_risk_replay',
      maxDeltaPerRelease: parameter.maxDeltaPerRelease,
      projectedRewardDelta: candidate.averageProjectedRewardDelta,
      stateBucket: candidate.stateBucket,
    },
  }]

  const projectId = candidate.projectIds.length === 1 ? candidate.projectIds[0] : null
  const durationRatio = readOptionalNumber(evidence.durationRatio)
  const velocityParameter = getAlgorithmAssetLearnableParameter('duration.project_progress_velocity_multiplier')
  if (
    projectId
    && durationRatio != null
    && durationRatio > 0
    && velocityParameter
    && typeof velocityParameter.currentValue === 'number'
  ) {
    const proposedVelocity = round(Math.max(
      velocityParameter.currentValue - velocityParameter.maxDeltaPerRelease,
      Math.min(
        velocityParameter.currentValue + velocityParameter.maxDeltaPerRelease,
        Math.max(0.75, Math.min(1.35, durationRatio)),
      ),
    ), 4)
    if (Math.abs(proposedVelocity - velocityParameter.currentValue) >= 0.01) {
      proposals.push({
        proposalId: `duration-progress-velocity:${scopeKey}`,
        parameterKey: velocityParameter.parameterKey,
        experienceTier: candidate.experienceTier,
        experienceAssetType: candidate.experienceAssetType,
        reuseScope: 'project',
        factSource: candidate.factSource,
        companyId: candidate.companyId,
        projectId,
        currentValue: velocityParameter.currentValue,
        proposedValue: proposedVelocity,
        changeKind: 'duration',
        sourceDecisionIds: candidate.sourceDecisionIds,
        evidence: {
          sampleCount: evidence.sampleCount,
          replayPassed: true,
          conflictFree: candidate.guardrails.every((guardrail) => !guardrail.includes('hard') && !guardrail.includes('high_risk')),
          rollbackTarget: velocityParameter.rollbackTarget,
          maeBefore,
          maeAfter,
          maeImprovement: round(maeBefore - maeAfter, 4),
          overcompensationRate: evidence.overcompensationRate,
          evidenceRefs: evidence.evidenceRefs ? [...evidence.evidenceRefs] : [],
        },
        metadata: {
          derivationPolicy: 'governed_project_duration_ratio_bounded_by_registered_release_delta',
          observedDurationRatio: durationRatio,
          maxDeltaPerRelease: velocityParameter.maxDeltaPerRelease,
          stateBucket: candidate.stateBucket,
        },
      })
    }
  }

  return proposals
}

function mapCandidateToRow(
  candidate: DurationContextPolicyCanaryCandidate,
  idempotency?: { operationId: string; stage: string } | null,
) {
  const businessKey = [
    candidate.companyId ?? 'global',
    candidate.projectIds.slice().sort().join(',') || 'global',
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
    model_version: 'contextual_bandit_v1',
    candidate_status: candidate.status,
    runtime_mutation_policy: 'none_canary_candidate_only',
    runtime_auto_publish_eligible: candidate.runtimeAutoPublishEligible,
    requires_review: candidate.requiresReview,
    state_bucket: candidate.stateBucket,
    action_key: candidate.actionKey,
    company_id: candidate.companyId,
    project_id: candidate.projectIds[0] ?? null,
    replay_case_count: candidate.replayCaseCount,
    average_projected_reward_delta: candidate.averageProjectedRewardDelta,
    source_decision_ids: candidate.sourceDecisionIds,
    guardrails: candidate.guardrails,
    review_metadata: {
      assetIdentity: {
        experienceTier: candidate.experienceTier,
        experienceAssetType: candidate.experienceAssetType,
        reuseScope: candidate.reuseScope,
        factSource: candidate.factSource,
      },
      autoPublishEvidence: candidate.autoPublishEvidence ?? null,
      autoPublishEvidencePolicy: candidate.autoPublishEvidence
        ? 'forwarded_to_duration_context_policy_auto_publish_gate'
        : 'missing_or_incomplete_replay_evidence_keeps_candidate_collecting',
      runtimeParameterProposals: candidate.runtimeParameterProposals ?? [],
      ...(idempotency ? {
        learningOperationId: idempotency.operationId,
        learningStageKey: idempotency.stage,
        idempotencyBusinessKey: businessKey,
      } : {}),
    },
  }
}

export async function generateDurationContextPolicyCanaryCandidates(
  input: GenerateDurationContextPolicyCanaryCandidatesInput = {},
) {
  const minReplayCases = Math.max(1, Math.trunc(readNumber(input.minReplayCases, 20)))
  const minProjectedRewardDelta = Math.max(0, readNumber(input.minProjectedRewardDelta, 0.03))
  const replay = await runDurationContextLearnedPolicyReplay({
    projectIds: input.projectIds,
    minReplayCases,
  })
  const groups = new Map<string, Array<(typeof replay.cases)[number]>>()
  let blockedCount = 0

  for (const item of replay.cases) {
    const isLowRisk = isLowRiskBucket(item.stateBucket)
    const deltaOk = item.projectedRewardDelta >= minProjectedRewardDelta
    if (!item.canaryEligible || !isLowRisk || !deltaOk || !item.learnedActionKey) {
      blockedCount += 1
      continue
    }
    const key = candidateGroupKey({
      companyId: (item as { companyId?: string | null }).companyId ?? null,
      projectId: item.projectId,
      stateBucket: item.stateBucket,
      learnedActionKey: item.learnedActionKey,
    })
    const group = groups.get(key) ?? []
    group.push(item)
    groups.set(key, group)
  }

  const candidates: DurationContextPolicyCanaryCandidate[] = Array.from(groups.values())
    .map((items) => {
      const first = items[0]
      const averageProjectedRewardDelta = round(
        items.reduce((sum, item) => sum + item.projectedRewardDelta, 0) / Math.max(1, items.length),
      )
      const candidate = {
        modelFamily: 'contextual_bandit_v1' as const,
        status: 'candidate' as const,
        experienceTier: 'T3' as const,
        experienceAssetType: 'project_efficiency_model' as const,
        reuseScope: normalizeText(first.projectId) ? 'project' as const : normalizeText((first as { companyId?: string | null }).companyId) ? 'company' as const : 'industry' as const,
        factSource: aggregateAutoPublishEvidence(items as Array<{ autoPublishEvidence?: unknown }>) ? 'hybrid' as const : 'replay' as const,
        companyId: normalizeText((first as { companyId?: string | null }).companyId) || null,
        projectIds: Array.from(new Set(items.map((item) => normalizeText(item.projectId)).filter(Boolean))),
        stateBucket: first.stateBucket,
        actionKey: normalizeText(first.learnedActionKey) as DurationContextPolicyActionKey,
        requiresReview: false as const,
        runtimeAutoPublishEligible: false as const,
        replayCaseCount: items.length,
        averageProjectedRewardDelta,
        sourceDecisionIds: items.map((item) => normalizeText(item.decisionId)).filter(Boolean),
        guardrails: [
          'published_runtime_rules_remain_authoritative',
          'central_automation_policy_required',
        ],
        autoPublishEvidence: aggregateAutoPublishEvidence(items as Array<{ autoPublishEvidence?: unknown }>),
      }
      return {
        ...candidate,
        runtimeParameterProposals: buildRuntimeParameterProposals(candidate),
      }
    })
    .filter((candidate) => candidate.replayCaseCount >= minReplayCases && candidate.averageProjectedRewardDelta >= minProjectedRewardDelta)
    .sort((left, right) => right.averageProjectedRewardDelta - left.averageProjectedRewardDelta)

  let persistedCandidateCount = 0
  if (input.persist === true && candidates.length > 0) {
    const operationId = normalizeText(input.operationId)
    const idempotencyStage = normalizeText(input.idempotencyStage) || 'candidate_persistence'
    const rows = candidates.map((candidate) => mapCandidateToRow(
      candidate,
      operationId ? { operationId, stage: idempotencyStage } : null,
    ))
    const table = (supabase as any).from('duration_context_policy_canary_candidates')
    const mutation = operationId
      ? table.upsert(rows, { onConflict: 'id', ignoreDuplicates: true })
      : table.insert(rows)
    const { data, error } = await mutation.select('*')
    if (error) throw new Error(`Failed to persist duration context policy canary candidates: ${error.message}`)
    persistedCandidateCount = Array.isArray(data) ? data.length : candidates.length
  }

  const underSampledGroups = Array.from(groups.values())
    .filter((items) => items.length < minReplayCases)
    .reduce((count, items) => count + items.length, 0)

  return {
    gateCode: 'duration_context_policy_canary_gate' as const,
    frontendExposurePolicy: 'backend_admin_api_only' as const,
    runtimeMutationPolicy: 'none_canary_candidate_only' as const,
    replayCaseCount: replay.cases.length,
    candidateCount: candidates.length,
    persistedCandidateCount,
    blockedCount: blockedCount + underSampledGroups,
    thresholds: {
      minReplayCases,
      minProjectedRewardDelta,
    },
    replaySummary: replay.summary,
    candidates,
  }
}
