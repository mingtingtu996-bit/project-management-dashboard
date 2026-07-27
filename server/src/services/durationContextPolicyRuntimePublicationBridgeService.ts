import { executeSQL } from './dbService.js'
import {
  executeAlgorithmAssetLearnableParameterRuntimeRollback,
  persistAlgorithmAssetLearnableParameterRuntimePublication,
  recordAlgorithmAssetLearnableParameterImpactMonitoring,
  type AlgorithmAssetLearnableParameterImpactMonitoringResult,
  type AlgorithmAssetLearnableParameterPublicationResult,
  type AlgorithmAssetLearnableParameterRuntimeRollbackResult,
  type AlgorithmAssetLearnableParameterReleaseExecutionQueryExec,
} from './algorithmAssetLearnableParameterReleaseExecutionService.js'
import {
  loadAlgorithmAssetLearnableParameterRuntimeValue,
  type AlgorithmAssetLearnableParameterRuntimeConsumptionResult,
} from './algorithmAssetLearnableParameterRuntimeConsumptionService.js'
import {
  getAlgorithmAssetLearnableParameter,
  type AlgorithmAssetParameterRuntimeUseEvidence,
} from './algorithmAssetLearnableParameterRegistryService.js'
import { buildAlgorithmAssetLearnableParameterSuggestionRelease } from './algorithmAssetLearnableParameterSuggestionService.js'
import type { AlgorithmAssetReleaseExitResult } from './algorithmAssetReleaseExitService.js'
import {
  evaluateDurationLearningAssetAutomationPolicy,
  type DurationLearningAssetAutomationPolicyDecision,
  type DurationLearningExperienceTier,
  type DurationLearningFactSource,
  type DurationLearningReuseScope,
} from './durationLearningAssetAutomationPolicyService.js'

export type DurationContextPolicyRuntimeProposalChangeKind =
  | 'display_threshold'
  | 'confidence'
  | 'ranking'
  | 'duration'
  | 'lag'
  | 'overlap'
  | 'productivity'
  | 'task_structure'
  | 'dependency_structure'
  | 'contract_milestone'
  | 'baseline_replacement'

export type DurationContextPolicyRuntimeParameterEvidence = AlgorithmAssetParameterRuntimeUseEvidence & {
  maeBefore?: number | null
  maeAfter?: number | null
  evidenceRefs?: string[] | null
}

export type DurationContextPolicyRuntimeParameterProposal = {
  proposalId: string
  parameterKey: string
  experienceTier?: DurationLearningExperienceTier | null
  experienceAssetType?: string | null
  reuseScope?: DurationLearningReuseScope | null
  factSource?: DurationLearningFactSource | null
  companyId?: string | null
  projectId?: string | null
  currentValue: number
  proposedValue: number
  changeKind: DurationContextPolicyRuntimeProposalChangeKind
  sourceDecisionIds?: string[] | null
  evidence: DurationContextPolicyRuntimeParameterEvidence
  metadata?: Record<string, unknown> | null
}

export type DurationContextPolicyRuntimeProposalRisk = {
  riskTier: 'low' | 'medium' | 'high'
  releasePolicy:
    | 'stable_after_automated_gates'
    | 'bounded_canary_before_stable'
    | 'manual_professional_approval_required'
  reasonCodes: string[]
}

export type DurationContextPolicyRuntimeMonitoringObservation = {
  proposalId: string
  monitoredAssetCount: number
  monitoringWindowHours?: number | null
  metrics?: Record<string, unknown> | null
  thresholdViolations?: string[] | null
}

export type DurationContextPolicyRuntimePublicationBridgeAdapters = {
  persistPublication: typeof persistAlgorithmAssetLearnableParameterRuntimePublication
  recordMonitoring: typeof recordAlgorithmAssetLearnableParameterImpactMonitoring
  executeRollback: typeof executeAlgorithmAssetLearnableParameterRuntimeRollback
  loadRuntimeValue: typeof loadAlgorithmAssetLearnableParameterRuntimeValue
}

export type DurationContextPolicyRuntimePublicationBridgeResultItem = {
  proposalId: string
  parameterKey: string
  riskTier: DurationContextPolicyRuntimeProposalRisk['riskTier']
  status:
    | 'manual_professional_approval_required'
    | 'blocked_retain_previous_stable'
    | 'stable_already_active'
    | 'stable_published'
    | 'canary_already_active'
    | 'canary_published'
    | 'canary_promoted_to_stable'
    | 'canary_rolled_back'
  reasonCodes: string[]
  publicationKey: string | null
  sourceCanaryPublicationKey: string | null
  rollbackTarget: string | null
  runtimeBoundary: {
    trafficPercent: number
    trialDays: number
    scope: Record<string, unknown> | null
  } | null
  publication: AlgorithmAssetLearnableParameterPublicationResult | null
  monitoring: AlgorithmAssetLearnableParameterImpactMonitoringResult | null
  rollback: AlgorithmAssetLearnableParameterRuntimeRollbackResult | null
  automationPolicyDecision: DurationLearningAssetAutomationPolicyDecision | null
}

const HIGH_RISK_CHANGE_KINDS = new Set<DurationContextPolicyRuntimeProposalChangeKind>([
  'task_structure',
  'dependency_structure',
  'contract_milestone',
  'baseline_replacement',
])

const MEDIUM_RISK_CHANGE_KINDS = new Set<DurationContextPolicyRuntimeProposalChangeKind>([
  'duration',
  'lag',
  'overlap',
  'productivity',
])

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function readStringList(value: unknown) {
  return Array.isArray(value) ? value.map(normalizeText).filter(Boolean) : []
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

function runtimeTargetSurface(proposal: DurationContextPolicyRuntimeParameterProposal) {
  if (normalizeText(proposal.projectId)) return 'project_override' as const
  if (normalizeText(proposal.companyId)) return 'company_override' as const
  return 'system_seed' as const
}

export function classifyDurationContextPolicyRuntimeProposalRisk(
  proposal: DurationContextPolicyRuntimeParameterProposal,
): DurationContextPolicyRuntimeProposalRisk {
  const parameter = getAlgorithmAssetLearnableParameter(proposal.parameterKey)
  const reasonCodes: string[] = []
  if (HIGH_RISK_CHANGE_KINDS.has(proposal.changeKind)) {
    reasonCodes.push('structural_plan_change_requires_professional_approval')
    return {
      riskTier: 'high',
      releasePolicy: 'manual_professional_approval_required',
      reasonCodes,
    }
  }
  if (!parameter) {
    return {
      riskTier: 'high',
      releasePolicy: 'manual_professional_approval_required',
      reasonCodes: ['unregistered_runtime_parameter_requires_professional_approval'],
    }
  }
  if (parameter.riskLevel === 'high') {
    return {
      riskTier: 'high',
      releasePolicy: 'manual_professional_approval_required',
      reasonCodes: ['registered_parameter_risk_is_high'],
    }
  }
  if (MEDIUM_RISK_CHANGE_KINDS.has(proposal.changeKind) || parameter.riskLevel === 'medium') {
    return {
      riskTier: 'medium',
      releasePolicy: 'bounded_canary_before_stable',
      reasonCodes: ['duration_or_relationship_parameter_requires_bounded_canary'],
    }
  }
  return {
    riskTier: 'low',
    releasePolicy: 'bounded_canary_before_stable',
    reasonCodes: ['registered_low_risk_non_structural_parameter'],
  }
}

function activationGateReasons(value: unknown) {
  const gate = readRecord(value)
  const summary = readRecord(gate.summary)
  const reasons: string[] = []
  if (summary.readyForControlledRuntimeTrial !== true) reasons.push('activation_readiness_gate_not_ready')
  if (summary.runtimePChanged === true || summary.durationContextFactorsChanged === true) {
    reasons.push('activation_readiness_runtime_boundary_changed')
  }
  if (Array.isArray(gate.blockers) && gate.blockers.length > 0) reasons.push('activation_readiness_has_blockers')
  return reasons
}

function autoPublishGateReasons(value: unknown, proposal: DurationContextPolicyRuntimeParameterProposal) {
  const gate = readRecord(value)
  const sourceDecisionIds = new Set(readStringList(proposal.sourceDecisionIds))
  const matchingDecision = (Array.isArray(gate.decisions) ? gate.decisions : [])
    .map(readRecord)
    .find((decision) => {
      if (normalizeText(decision.promotionDecision) !== 'auto_publish_canary') return false
      const candidateIds = readStringList(readRecord(decision.candidate).sourceDecisionIds)
      return sourceDecisionIds.size === 0 || candidateIds.some((id) => sourceDecisionIds.has(id))
    })
  return matchingDecision ? [] : ['auto_publish_gate_did_not_approve_proposal']
}

function trialBoundary(value: unknown) {
  const trial = readRecord(value)
  const summary = readRecord(trial.summary)
  const releasePlan = readRecord(trial.releasePlan)
  const reasons: string[] = []
  if (summary.readyForReleaseRequest !== true) reasons.push('bounded_canary_trial_plan_not_ready')
  if (normalizeText(releasePlan.status) !== 'draft_review_required') reasons.push('bounded_canary_release_plan_required')
  if (releasePlan.rollbackRequired !== true) reasons.push('bounded_canary_rollback_required')
  return {
    reasons,
    boundary: reasons.length === 0
      ? {
          trafficPercent: Math.max(1, Math.min(10, Math.trunc(readNumber(releasePlan.trafficPercent, 5)))),
          trialDays: Math.max(3, Math.min(30, Math.trunc(readNumber(releasePlan.trialDays, 14)))),
          scope: Object.keys(readRecord(releasePlan.scope)).length > 0 ? readRecord(releasePlan.scope) : null,
        }
      : null,
  }
}

function normalizedEvidence(proposal: DurationContextPolicyRuntimeParameterProposal): AlgorithmAssetParameterRuntimeUseEvidence {
  const evidence = proposal.evidence
  const maeBefore = Number(evidence.maeBefore)
  const maeAfter = Number(evidence.maeAfter)
  return {
    sampleCount: evidence.sampleCount,
    replayPassed: evidence.replayPassed,
    conflictFree: evidence.conflictFree,
    rollbackTarget: evidence.rollbackTarget,
    crossCompanyReplayPassed: evidence.crossCompanyReplayPassed,
    maeImprovement: typeof evidence.maeImprovement === 'number'
      ? evidence.maeImprovement
      : Number.isFinite(maeBefore) && Number.isFinite(maeAfter)
        ? maeBefore - maeAfter
        : null,
    overcompensationRate: evidence.overcompensationRate,
  }
}

function buildReleaseExit(input: {
  operationId: string
  proposal: DurationContextPolicyRuntimeParameterProposal
  phase: 'stable' | 'canary' | 'stable_promotion'
  runtimeBoundary?: ReturnType<typeof trialBoundary>['boundary']
}) {
  const targetSurface = runtimeTargetSurface(input.proposal)
  const release = buildAlgorithmAssetLearnableParameterSuggestionRelease({
    parameterKey: input.proposal.parameterKey,
    sourceSystem: `durationContextPolicyRuntimePublicationBridge:${input.operationId}:${input.phase}`,
    companyId: input.proposal.companyId,
    projectId: input.proposal.projectId,
    allowSystemReleaseScope: targetSurface === 'system_seed',
    currentValue: input.proposal.currentValue,
    proposedValue: input.proposal.proposedValue,
    evidence: normalizedEvidence(input.proposal),
    metadata: {
      ...(input.proposal.metadata ?? {}),
      learningOperationId: input.operationId,
      learningStageKey: `runtime_publication:${input.phase}`,
      proposalId: input.proposal.proposalId,
      changeKind: input.proposal.changeKind,
      sourceDecisionIds: input.proposal.sourceDecisionIds ?? [],
      ...(input.runtimeBoundary ? {
        runtimeBoundary: {
          ...input.runtimeBoundary,
          scopeBoundary: normalizeText(input.proposal.projectId)
            ? 'project'
            : normalizeText(input.proposal.companyId)
              ? 'company'
              : 'system',
          allowedConsumerKeys: input.proposal.parameterKey === 'duration.project_progress_velocity_multiplier'
            ? [
                'durationSuggestionService.similar_task_rhythm',
                'durationContextProjectBaselineCalibrationFactorService.published_velocity',
                'durationContextPmRecoveryCompensationFactorService.published_velocity',
                'taskDurationForecastService.history_velocity',
                'durationContextPolicyRuntimePublicationBridge.monitor_and_promote',
              ]
            : [
                'durationSuggestionService.company_benchmark_blend',
                'durationContextPolicyRuntimePublicationBridge.monitor_and_promote',
              ],
          stopConditionKeys: [
            'duration_parameter_mae_regression',
            'duration_parameter_overcompensation',
            'duration_parameter_scope_drift',
          ],
        },
      } : {}),
    },
    conflictResult: 'supersede_with_rollback_target',
    replaySummary: {
      replayPassed: true,
      runtimeImpact: 'publish_gate_evidence',
    },
    releaseAdapter: {
      adapterKey: `durationContextPolicy${targetSurface}RuntimeReleaseAdapter`,
      targetSurface,
      supportsRollback: true,
    },
    platformPolicy: {
      systemAutoPublishPolicyReady: targetSurface === 'system_seed',
      impactMonitoringReady: true,
      platformReleaseExitReady: targetSurface === 'system_seed',
    },
  })
  if (!release.releaseExit.releasePackage || !release.releaseExit.canHandoffToRuntimeAdapter) return release.releaseExit
  if (input.phase === 'canary') {
    return {
      ...release.releaseExit,
      status: 'canary_package_ready',
      releaseAction: 'handoff_to_domain_canary_adapter',
    } satisfies AlgorithmAssetReleaseExitResult
  }
  if (input.phase !== 'stable_promotion') return release.releaseExit
  return {
    ...release.releaseExit,
    status: 'release_package_ready',
    releaseAction: 'handoff_to_domain_release_adapter',
  } satisfies AlgorithmAssetReleaseExitResult
}

function emptyResult(
  proposal: DurationContextPolicyRuntimeParameterProposal,
  risk: DurationContextPolicyRuntimeProposalRisk,
  status: DurationContextPolicyRuntimePublicationBridgeResultItem['status'],
  reasonCodes: string[],
): DurationContextPolicyRuntimePublicationBridgeResultItem {
  return {
    proposalId: proposal.proposalId,
    parameterKey: proposal.parameterKey,
    riskTier: risk.riskTier,
    status,
    reasonCodes: Array.from(new Set(reasonCodes)),
    publicationKey: null,
    sourceCanaryPublicationKey: null,
    rollbackTarget: normalizeText(proposal.evidence.rollbackTarget) || null,
    runtimeBoundary: null,
    publication: null,
    monitoring: null,
    rollback: null,
    automationPolicyDecision: null,
  }
}

function resolveProposalReuseScope(proposal: DurationContextPolicyRuntimeParameterProposal): DurationLearningReuseScope {
  if (proposal.reuseScope) return proposal.reuseScope
  if (normalizeText(proposal.projectId)) return 'project'
  if (normalizeText(proposal.companyId)) return 'company'
  return 'global'
}

function buildStableAutomationPolicyDecision(
  proposal: DurationContextPolicyRuntimeParameterProposal,
  observation: DurationContextPolicyRuntimeMonitoringObservation,
) {
  const metrics = readRecord(observation.metrics)
  const reuseScope = resolveProposalReuseScope(proposal)
  return evaluateDurationLearningAssetAutomationPolicy({
    experienceTier: proposal.experienceTier ?? 'T3',
    reuseScope,
    factSource: proposal.factSource ?? 'hybrid',
    targetStage: 'stable',
    evidence: {
      validChangeCount: readOptionalNumber(metrics.validChangeCount),
      distinctTaskCount: readOptionalNumber(metrics.distinctTaskCount) ?? observation.monitoredAssetCount,
      distinctProjectCount: readOptionalNumber(metrics.distinctProjectCount),
      distinctCompanyCount: readOptionalNumber(metrics.distinctCompanyCount),
      realOutcomeCount: readOptionalNumber(metrics.realOutcomeCount) ?? observation.monitoredAssetCount,
      replayCaseCount: readOptionalNumber(metrics.replayCaseCount),
      observationWindowDays: readOptionalNumber(metrics.observationWindowDays)
        ?? Math.floor(readNumber(observation.monitoringWindowHours, 0) / 24),
      maeBefore: readOptionalNumber(metrics.maeBefore) ?? proposal.evidence.maeBefore,
      maeAfter: readOptionalNumber(metrics.maeAfter) ?? proposal.evidence.maeAfter,
      conflictRate: readOptionalNumber(metrics.conflictRate) ?? (proposal.evidence.conflictFree ? 0 : 1),
      overcompensationRate: readOptionalNumber(metrics.overcompensationRate) ?? proposal.evidence.overcompensationRate,
      rollbackReady: Boolean(normalizeText(proposal.evidence.rollbackTarget)),
      tenantScopeValid: reuseScope === 'project'
        ? Boolean(normalizeText(proposal.companyId) && normalizeText(proposal.projectId))
        : reuseScope === 'company'
          ? Boolean(normalizeText(proposal.companyId))
          : true,
      structuralMutation: HIGH_RISK_CHANGE_KINDS.has(proposal.changeKind),
      exceptionalConflict: readStringList(observation.thresholdViolations).some((reason) => reason.includes('conflict')),
    },
  })
}

function canaryRuntimeBoundary(proposal: DurationContextPolicyRuntimeParameterProposal, boundary: ReturnType<typeof trialBoundary>['boundary']) {
  return {
    consumerKey: 'durationContextPolicyRuntimePublicationBridge.monitor_and_promote',
    scopeBoundary: normalizeText(proposal.projectId) ? 'project' : normalizeText(proposal.companyId) ? 'company' : 'system',
    stopConditionKeys: [
      'duration_parameter_mae_regression',
      'duration_parameter_overcompensation',
      'duration_parameter_scope_drift',
    ],
    monitoringWindowHours: Math.max(72, (boundary?.trialDays ?? 14) * 24),
    trafficSubjectKey: proposal.proposalId,
  }
}

export async function collectDurationContextPolicyRuntimeMonitoringObservation(input: {
  proposal: DurationContextPolicyRuntimeParameterProposal
  publicationKey: string
  queryExec?: AlgorithmAssetLearnableParameterReleaseExecutionQueryExec
}): Promise<DurationContextPolicyRuntimeMonitoringObservation | null> {
  const queryExec = input.queryExec ?? executeSQL
  const projectId = normalizeText(input.proposal.projectId) || null
  const companyId = normalizeText(input.proposal.companyId) || null
  const scopeLevel = projectId ? 'project' : companyId ? 'company' : 'system'
  const rows = await queryExec<Record<string, unknown>>(
    `with publication as (
       select publication_key, published_at, impact_monitoring
         from public.algorithm_learnable_parameter_runtime_publications publication
        where publication.publication_key = $1
          and publication.publication_status = 'canary'
          and publication.scope_level = $2
          and publication.company_id is not distinct from $3::uuid
          and publication.project_id is not distinct from $4::uuid
        limit 1
     ),
     scoped_observations as (
       select observation.*,
              observed_project.id as observed_project_id,
              nullif(observation.observation_context ->> 'taskId', '')::uuid as observed_task_id
         from public.runtime_consumer_observations observation
         join public.projects observed_project
           on observed_project.id = nullif(observation.observation_context ->> 'projectId', '')::uuid
        where observation.publication_key = $1
          and observation.observation_status = 'observed'
          and nullif(observation.observation_context ->> 'taskId', '') is not null
          and (
            $2 = 'system'
            or ($2 = 'company' and observed_project.company_id = $3::uuid)
            or (
              $2 = 'project'
              and observed_project.company_id = $3::uuid
              and observed_project.id = $4::uuid
            )
          )
     ),
     consumer_scopes as (
       select distinct observed_project_id as project_id, observed_task_id as task_id
         from scoped_observations
     ),
     accuracy_rows as (
       select distinct on (accuracy.id)
              accuracy.id,
              accuracy.absolute_error_days,
              accuracy.baseline_absolute_error_days,
              accuracy.overcompensated
         from public.duration_algorithm_accuracy_events accuracy
         join consumer_scopes scope
           on accuracy.project_id = scope.project_id
          and accuracy.task_id = scope.task_id
        cross join publication
        where accuracy.backtest_status = 'backtested'
          and accuracy.backtested_at >= publication.published_at
          and accuracy.absolute_error_days is not null
        order by accuracy.id
     )
     select publication.publication_key,
            extract(epoch from (now() - publication.published_at)) / 3600.0 as monitoring_elapsed_hours,
            coalesce((publication.impact_monitoring ->> 'monitoringWindowHours')::numeric, 72) as monitoring_window_hours,
            (select count(*) from scoped_observations) as consumer_count,
            count(accuracy_rows.id) as sample_count,
            avg(accuracy_rows.baseline_absolute_error_days) as mae_before,
            avg(accuracy_rows.absolute_error_days) as mae_after,
            avg(case when accuracy_rows.overcompensated is true then 1.0 else 0.0 end) as overcompensation_rate
       from publication
       left join accuracy_rows on true
      group by publication.publication_key, publication.published_at, publication.impact_monitoring`,
    [input.publicationKey, scopeLevel, companyId, projectId],
  )
  const row = rows[0]
  if (!row) return null
  const parameter = getAlgorithmAssetLearnableParameter(input.proposal.parameterKey)
  const monitoringElapsedHours = readNumber(row.monitoring_elapsed_hours, 0)
  const monitoringWindowHours = Math.max(1, readNumber(row.monitoring_window_hours, 72))
  const consumerCount = Math.max(0, Math.trunc(readNumber(row.consumer_count, 0)))
  const sampleCount = Math.max(0, Math.trunc(readNumber(row.sample_count, 0)))
  const minimumSamples = Math.max(5, parameter?.evidenceRequired.minSampleCount ?? 20)
  const maeBefore = readOptionalNumber(row.mae_before)
  const maeAfter = readOptionalNumber(row.mae_after)
  const overcompensationRate = readOptionalNumber(row.overcompensation_rate)
  if (
    monitoringElapsedHours < monitoringWindowHours
    || consumerCount === 0
    || sampleCount < minimumSamples
    || maeBefore == null
    || maeAfter == null
    || overcompensationRate == null
  ) return null
  const thresholdViolations = [
    ...(maeAfter > maeBefore ? ['mae_regression'] : []),
    ...(
      typeof parameter?.evidenceRequired.maxOvercompensationRate === 'number'
      && overcompensationRate > parameter.evidenceRequired.maxOvercompensationRate
        ? ['overcompensation_rate_above_parameter_threshold']
        : []
    ),
  ]
  return {
    proposalId: input.proposal.proposalId,
    monitoredAssetCount: sampleCount,
    monitoringWindowHours,
    metrics: {
      publicationKey: input.publicationKey,
      consumerCount,
      sampleCount,
      maeBefore,
      maeAfter,
      overcompensationRate,
      monitoringElapsedHours,
    },
    thresholdViolations,
  }
}

async function loadRuntime(
  proposal: DurationContextPolicyRuntimeParameterProposal,
  mode: 'stable' | 'canary',
  queryExec: AlgorithmAssetLearnableParameterReleaseExecutionQueryExec,
  adapters: DurationContextPolicyRuntimePublicationBridgeAdapters,
  boundary: ReturnType<typeof trialBoundary>['boundary'],
): Promise<AlgorithmAssetLearnableParameterRuntimeConsumptionResult> {
  return adapters.loadRuntimeValue({
    parameterKey: proposal.parameterKey,
    companyId: proposal.companyId,
    projectId: proposal.projectId,
    allowSystemScope: !normalizeText(proposal.companyId) && !normalizeText(proposal.projectId),
    consumptionMode: mode,
    ...(mode === 'canary' ? { canaryRuntimeBoundary: canaryRuntimeBoundary(proposal, boundary) } : {}),
    queryExec,
  })
}

async function processProposal(input: {
  operationId: string
  proposal: DurationContextPolicyRuntimeParameterProposal
  autoPublishGate: unknown
  activationReadiness: unknown
  trialReleasePlan: unknown
  monitoringObservation: DurationContextPolicyRuntimeMonitoringObservation | null
  queryExec: AlgorithmAssetLearnableParameterReleaseExecutionQueryExec
  adapters: DurationContextPolicyRuntimePublicationBridgeAdapters
}): Promise<DurationContextPolicyRuntimePublicationBridgeResultItem> {
  const risk = classifyDurationContextPolicyRuntimeProposalRisk(input.proposal)
  if (risk.riskTier === 'high') {
    return emptyResult(input.proposal, risk, 'manual_professional_approval_required', risk.reasonCodes)
  }
  const gateReasons = [
    ...activationGateReasons(input.activationReadiness),
    ...autoPublishGateReasons(input.autoPublishGate, input.proposal),
  ]
  const trial = trialBoundary(input.trialReleasePlan)
  gateReasons.push(...trial.reasons)
  if (gateReasons.length > 0) {
    return emptyResult(input.proposal, risk, 'blocked_retain_previous_stable', gateReasons)
  }

  const stable = await loadRuntime(input.proposal, 'stable', input.queryExec, input.adapters, trial.boundary)
  if (stable.runtimeConsumable) {
    return {
      ...emptyResult(input.proposal, risk, 'stable_already_active', []),
      publicationKey: stable.publicationKey,
      rollbackTarget: stable.rollbackTarget,
    }
  }

  const canary = await loadRuntime(input.proposal, 'canary', input.queryExec, input.adapters, trial.boundary)
  if (!canary.runtimeConsumable) {
    const releaseExit = buildReleaseExit({
      operationId: input.operationId,
      proposal: input.proposal,
      phase: 'canary',
      runtimeBoundary: trial.boundary,
    })
    const publication = await input.adapters.persistPublication({
      releaseExit,
      queryExec: input.queryExec,
      idempotencyKey: `${input.operationId}:runtime_publication:${input.proposal.proposalId}:canary`,
      impactMonitoring: {
        monitoredAssetCount: input.monitoringObservation?.monitoredAssetCount ?? 0,
        monitoringWindowHours: input.monitoringObservation?.monitoringWindowHours ?? (trial.boundary!.trialDays * 24),
      },
    })
    if (!publication.writesParameterRuntime || publication.publicationStatus !== 'canary') {
      return {
        ...emptyResult(input.proposal, risk, 'blocked_retain_previous_stable', publication.reasons),
        runtimeBoundary: trial.boundary,
        publication,
      }
    }
    return {
      ...emptyResult(input.proposal, risk, 'canary_published', []),
      publicationKey: publication.publicationKey,
      rollbackTarget: publication.rollbackTarget,
      runtimeBoundary: trial.boundary,
      publication,
    }
  }

  const monitoringObservation = input.monitoringObservation
    ?? await collectDurationContextPolicyRuntimeMonitoringObservation({
      proposal: input.proposal,
      publicationKey: canary.publicationKey!,
      queryExec: input.queryExec,
    })
  if (!monitoringObservation) {
    return {
      ...emptyResult(input.proposal, risk, 'canary_already_active', ['runtime_monitoring_observation_required_before_stable']),
      publicationKey: canary.publicationKey,
      sourceCanaryPublicationKey: canary.publicationKey,
      rollbackTarget: canary.rollbackTarget,
      runtimeBoundary: trial.boundary,
    }
  }

  const observation = monitoringObservation
  const automationPolicyDecision = buildStableAutomationPolicyDecision(input.proposal, observation)
  const automaticRollbackReasons = automationPolicyDecision.stage === 'blocked_retain_previous'
    || automationPolicyDecision.stage === 'exception_review'
    ? automationPolicyDecision.reasonCodes
    : []
  const effectiveThresholdViolations = Array.from(new Set([
    ...readStringList(observation.thresholdViolations),
    ...automaticRollbackReasons,
  ]))
  const monitoring = await input.adapters.recordMonitoring({
    queryExec: input.queryExec,
    sourcePublicationKey: canary.publicationKey!,
    monitoredAssetCount: observation.monitoredAssetCount,
    monitoringWindowHours: observation.monitoringWindowHours ?? (trial.boundary!.trialDays * 24),
    metrics: observation.metrics ?? {},
    thresholdViolations: effectiveThresholdViolations,
    idempotencyKey: `${input.operationId}:impact_monitoring:${input.proposal.proposalId}`,
  })
  if (monitoring.rollbackRecommended || automaticRollbackReasons.length > 0) {
    const rollback = await input.adapters.executeRollback({
      queryExec: input.queryExec,
      sourcePublicationKey: canary.publicationKey!,
      rollbackTarget: canary.rollbackTarget ?? normalizeText(input.proposal.evidence.rollbackTarget),
      reason: 'duration_context_policy_runtime_monitoring_failed',
      idempotencyKey: `${input.operationId}:runtime_rollback:${input.proposal.proposalId}`,
    })
    return {
      ...emptyResult(input.proposal, risk, 'canary_rolled_back', effectiveThresholdViolations),
      sourceCanaryPublicationKey: canary.publicationKey,
      rollbackTarget: rollback.rollbackTarget,
      runtimeBoundary: trial.boundary,
      monitoring,
      rollback,
      automationPolicyDecision,
    }
  }

  if (automationPolicyDecision.stage !== 'auto_stable') {
    return {
      ...emptyResult(input.proposal, risk, 'canary_already_active', automationPolicyDecision.reasonCodes),
      publicationKey: canary.publicationKey,
      sourceCanaryPublicationKey: canary.publicationKey,
      rollbackTarget: canary.rollbackTarget,
      runtimeBoundary: trial.boundary,
      monitoring,
      automationPolicyDecision,
    }
  }

  const releaseExit = buildReleaseExit({
    operationId: input.operationId,
    proposal: input.proposal,
    phase: 'stable_promotion',
  })
  const publication = await input.adapters.persistPublication({
    releaseExit,
    queryExec: input.queryExec,
    idempotencyKey: `${input.operationId}:runtime_publication:${input.proposal.proposalId}:stable_promotion`,
    impactMonitoring: {
      monitoredAssetCount: observation.monitoredAssetCount,
      monitoringWindowHours: observation.monitoringWindowHours ?? (trial.boundary!.trialDays * 24),
    },
  })
  if (!publication.writesParameterRuntime || publication.publicationStatus !== 'published') {
    return {
      ...emptyResult(input.proposal, risk, 'blocked_retain_previous_stable', publication.reasons),
      sourceCanaryPublicationKey: canary.publicationKey,
      runtimeBoundary: trial.boundary,
      publication,
      monitoring,
      automationPolicyDecision,
    }
  }
  return {
    ...emptyResult(input.proposal, risk, 'canary_promoted_to_stable', []),
    publicationKey: publication.publicationKey,
    sourceCanaryPublicationKey: canary.publicationKey,
    rollbackTarget: publication.rollbackTarget,
    runtimeBoundary: trial.boundary,
    publication,
    monitoring,
    automationPolicyDecision,
  }
}

export async function runDurationContextPolicyRuntimePublicationBridge(input: {
  operationId: string
  proposals?: readonly DurationContextPolicyRuntimeParameterProposal[] | null
  autoPublishGate: unknown
  activationReadiness: unknown
  trialReleasePlan: unknown
  monitoringObservations?: readonly DurationContextPolicyRuntimeMonitoringObservation[] | null
  queryExec?: AlgorithmAssetLearnableParameterReleaseExecutionQueryExec
  adapters?: Partial<DurationContextPolicyRuntimePublicationBridgeAdapters>
}) {
  const queryExec = input.queryExec ?? executeSQL
  const adapters: DurationContextPolicyRuntimePublicationBridgeAdapters = {
    persistPublication: input.adapters?.persistPublication ?? persistAlgorithmAssetLearnableParameterRuntimePublication,
    recordMonitoring: input.adapters?.recordMonitoring ?? recordAlgorithmAssetLearnableParameterImpactMonitoring,
    executeRollback: input.adapters?.executeRollback ?? executeAlgorithmAssetLearnableParameterRuntimeRollback,
    loadRuntimeValue: input.adapters?.loadRuntimeValue ?? loadAlgorithmAssetLearnableParameterRuntimeValue,
  }
  const observations = new Map(
    (input.monitoringObservations ?? []).map((observation) => [observation.proposalId, observation] as const),
  )
  const results: DurationContextPolicyRuntimePublicationBridgeResultItem[] = []
  for (const proposal of input.proposals ?? []) {
    results.push(await processProposal({
      operationId: input.operationId,
      proposal,
      autoPublishGate: input.autoPublishGate,
      activationReadiness: input.activationReadiness,
      trialReleasePlan: input.trialReleasePlan,
      monitoringObservation: observations.get(proposal.proposalId) ?? null,
      queryExec,
      adapters,
    }))
  }
  return {
    bridgeCode: 'duration_context_policy_runtime_publication_bridge' as const,
    operationId: input.operationId,
    proposalCount: input.proposals?.length ?? 0,
    stablePublishedCount: results.filter((result) => ['stable_published', 'canary_promoted_to_stable'].includes(result.status)).length,
    canaryPublishedCount: results.filter((result) => result.status === 'canary_published').length,
    rollbackCount: results.filter((result) => result.status === 'canary_rolled_back').length,
    manualApprovalCount: results.filter((result) => result.status === 'manual_professional_approval_required').length,
    blockedCount: results.filter((result) => result.status === 'blocked_retain_previous_stable').length,
    writesSeedRuntimeDirectly: false as const,
    results,
  }
}

export function extractDurationContextPolicyRuntimeParameterProposals(autoPublishGate: unknown) {
  const gate = readRecord(autoPublishGate)
  const proposals: DurationContextPolicyRuntimeParameterProposal[] = []
  for (const decisionValue of Array.isArray(gate.decisions) ? gate.decisions : []) {
    const decision = readRecord(decisionValue)
    const candidate = readRecord(decision.candidate)
    const rawProposals = [
      ...(
        Array.isArray(candidate.runtimeParameterProposals)
          ? candidate.runtimeParameterProposals
          : []
      ),
      ...(candidate.runtimeParameterProposal ? [candidate.runtimeParameterProposal] : []),
    ]
    for (const rawValue of rawProposals) {
      const raw = readRecord(rawValue)
      const proposalId = normalizeText(raw.proposalId)
      const parameterKey = normalizeText(raw.parameterKey)
      const currentValue = Number(raw.currentValue)
      const proposedValue = Number(raw.proposedValue)
      const changeKind = normalizeText(raw.changeKind) as DurationContextPolicyRuntimeProposalChangeKind
      if (!proposalId || !parameterKey || !Number.isFinite(currentValue) || !Number.isFinite(proposedValue) || !changeKind) continue
      proposals.push({
        proposalId,
        parameterKey,
        experienceTier: normalizeText(raw.experienceTier ?? candidate.experienceTier) as DurationLearningExperienceTier || null,
        experienceAssetType: normalizeText(raw.experienceAssetType ?? candidate.experienceAssetType) || null,
        reuseScope: normalizeText(raw.reuseScope ?? candidate.reuseScope) as DurationLearningReuseScope || null,
        factSource: normalizeText(raw.factSource ?? candidate.factSource) as DurationLearningFactSource || null,
        companyId: normalizeText(raw.companyId ?? candidate.companyId) || null,
        projectId: normalizeText(raw.projectId ?? candidate.projectId) || null,
        currentValue,
        proposedValue,
        changeKind,
        sourceDecisionIds: readStringList(raw.sourceDecisionIds ?? candidate.sourceDecisionIds),
        evidence: readRecord(raw.evidence) as DurationContextPolicyRuntimeParameterEvidence,
        metadata: readRecord(raw.metadata),
      })
    }
  }
  return proposals
}
