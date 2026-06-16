import { query as rawQuery } from '../database.js'
import type { AlgorithmAssetCandidateEvent } from './algorithmAssetCandidateEventAdapterService.js'
import {
  evaluateAlgorithmAssetColdStartBaselineUpdate,
  type AlgorithmAssetColdStartBaselineUpdateInput,
} from './algorithmAssetColdStartBaselineService.js'
import type { AlgorithmAssetForecastResidualOverlayEvaluation } from './algorithmAssetForecastResidualOverlayService.js'
import type {
  AlgorithmAssetLearningTarget,
  AlgorithmAssetRequestedRuntimeEffect,
} from './algorithmAssetGovernanceProtocolService.js'
import type {
  AlgorithmAssetReplayEvaluation,
  AlgorithmAssetReplayRuntimeImpact,
} from './algorithmAssetReplayService.js'
import type {
  AlgorithmAssetSampleHealthEvent,
  AlgorithmAssetSampleHealthReport,
} from './algorithmAssetSampleHealthService.js'
import { sanitizeLegacyScopeObjectFields } from './legacyScopeObjectSanitizer.js'

export type AlgorithmAssetGovernanceQueryExec = <T = Record<string, unknown>>(
  sql: string,
  params?: unknown[],
) => Promise<T[]>

type PersistenceScopeLevel =
  | 'system'
  | 'industry_baseline'
  | 'segment_baseline'
  | 'company'
  | 'project'

type PersistedLearningTarget =
  | 'base_duration'
  | 'forecast_residual'
  | 'context_factor'
  | 'confidence'
  | 'candidate_weight'
  | 'template_structure'
  | 'dependency_order'
  | 'metric_caliber'
  | 'risk_warning'
  | 'governance_report'
  | 'governance_policy'

export interface PersistAlgorithmAssetCandidateEventParams {
  event: AlgorithmAssetCandidateEvent
  queryExec?: AlgorithmAssetGovernanceQueryExec
}

export interface PersistAlgorithmAssetCandidateEventResult {
  persisted: true
  candidateEventId: string | null
}

export interface PersistAlgorithmAssetReplayEvaluationParams {
  runKey: string
  evaluation: AlgorithmAssetReplayEvaluation
  queryExec?: AlgorithmAssetGovernanceQueryExec
}

export interface PersistAlgorithmAssetReplayEvaluationResult {
  persisted: true
  candidateEventId: string | null
  replayRunId: string | null
  replayResultCount: number
}

export interface PersistAlgorithmAssetSampleHealthReportParams {
  assetKey: string
  sourceModule: string
  learningTarget: AlgorithmAssetLearningTarget
  report: AlgorithmAssetSampleHealthReport
  queryExec?: AlgorithmAssetGovernanceQueryExec
}

export interface PersistAlgorithmAssetSampleHealthReportResult {
  persisted: true
  sampleHealthEventCount: number
}

export interface PersistAlgorithmAssetForecastResidualOverlayEvaluationParams {
  overlayKey: string
  evaluation: AlgorithmAssetForecastResidualOverlayEvaluation
  queryExec?: AlgorithmAssetGovernanceQueryExec
}

export interface PersistAlgorithmAssetForecastResidualOverlayEvaluationResult {
  persisted: true
  overlayId: string | null
}

export interface PersistAlgorithmAssetColdStartBaselineParams {
  baselineKey: string
  segmentKey: string
  value: number
  updateInput: AlgorithmAssetColdStartBaselineUpdateInput
  applicableScenarioKeys?: string[]
  disabledScenarioKeys?: string[]
  evidenceSummary?: Record<string, unknown>
  queryExec?: AlgorithmAssetGovernanceQueryExec
}

export interface PersistAlgorithmAssetColdStartBaselineResult {
  status: 'persisted' | 'blocked'
  persisted: boolean
  baselineId: string | null
  reasons: string[]
}

export interface RollbackAlgorithmAssetColdStartBaselineRuntimePublicationParams {
  baselineKey: string
  segmentKey: string
  rollbackTarget: string
  reason: string
  queryExec?: AlgorithmAssetGovernanceQueryExec
}

export interface RollbackAlgorithmAssetColdStartBaselineRuntimePublicationResult {
  status: 'rollback_executed' | 'rollback_blocked'
  baselineKey: string
  segmentKey: string
  rollbackTarget: string | null
  writesSharedBaseline: boolean
  writesCompanyOverride: false
  writesBaseDurationSeed: false
  reasons: string[]
}

export interface RollbackAlgorithmAssetForecastResidualOverlayRuntimePublicationParams {
  overlayKey: string
  rollbackTarget: string
  reason: string
  queryExec?: AlgorithmAssetGovernanceQueryExec
}

export interface RollbackAlgorithmAssetForecastResidualOverlayRuntimePublicationResult {
  status: 'rollback_executed' | 'rollback_blocked'
  overlayKey: string
  rollbackTarget: string | null
  writesRuntimeOverlay: boolean
  writesBaseDurationSeed: false
  reasons: string[]
}

function buildDefaultQueryExec(): AlgorithmAssetGovernanceQueryExec {
  return async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => {
    const result = await rawQuery(sql, params as any[])
    return result.rows as T[]
  }
}

function normalizeText(value: unknown) {
  const text = String(value ?? '').trim()
  return text || null
}

function residualOverlayPublicationKey(overlayKey: unknown) {
  const normalizedOverlayKey = normalizeText(overlayKey)
  if (!normalizedOverlayKey) return null
  if (normalizedOverlayKey.startsWith('forecast_residual_overlay_runtime:')) return normalizedOverlayKey
  return `forecast_residual_overlay_runtime:${normalizedOverlayKey}`
}

function learningTargetForPersistence(target: AlgorithmAssetLearningTarget): PersistedLearningTarget {
  return target
}

function candidateScopeLevel(event: Pick<AlgorithmAssetCandidateEvent, 'scopeType'>): PersistenceScopeLevel {
  if (event.scopeType === 'project') return 'project'
  if (event.scopeType === 'company') return 'company'
  return 'system'
}

function sampleScopeLevel(event: AlgorithmAssetSampleHealthEvent): Extract<PersistenceScopeLevel, 'company' | 'project'> {
  return event.projectId ? 'project' : 'company'
}

function requireCompanyScope(companyId: string | undefined, context: string) {
  if (!companyId) {
    throw new Error(`${context}_requires_company_id`)
  }
}

function eventStatusForPersistence(event: AlgorithmAssetCandidateEvent) {
  if (event.lifecycleStatus === 'quarantined') return 'quarantined'
  if (event.lifecycleStatus === 'review_required') return 'review_required'
  if (
    event.lifecycleStatus === 'shadow_ready'
    || event.lifecycleStatus === 'canary_ready'
    || event.lifecycleStatus === 'published_ready'
  ) {
    return 'replay_ready'
  }
  return 'candidate'
}

function rollbackTargetPayload(event: AlgorithmAssetCandidateEvent) {
  const rollbackTarget = event.governanceDecision.normalizedRequest.evidence?.rollbackTarget ?? null
  return rollbackTarget ? { rollbackTarget } : {}
}

function sanitizeCandidatePayloadForPersistence(payload: unknown) {
  return sanitizeLegacyScopeObjectFields(payload)
}

function candidatePayloadRecord(candidate: AlgorithmAssetCandidateEvent): Record<string, unknown> {
  return candidate.candidatePayload && typeof candidate.candidatePayload === 'object' && !Array.isArray(candidate.candidatePayload)
    ? candidate.candidatePayload as Record<string, unknown>
    : {}
}

function evidenceSummary(event: AlgorithmAssetCandidateEvent, sanitizedLegacyScopeFields: string[] = []) {
  const summary = {
    decisionStatus: event.governanceDecision.status,
    runtimeAction: event.governanceDecision.runtimeAction,
    canWriteRuntime: event.governanceDecision.canWriteRuntime,
    canModifyPublishAnchor: event.governanceDecision.canModifyPublishAnchor,
    reasons: event.governanceDecision.reasons,
    unlockCriteria: event.governanceDecision.unlockCriteria,
    evidence: event.governanceDecision.normalizedRequest.evidence ?? {},
  }

  if (sanitizedLegacyScopeFields.length > 0) {
    return {
      ...summary,
      sanitizedLegacyScopeFields,
    }
  }

  return summary
}

function replayMode(runtimeImpact: AlgorithmAssetReplayRuntimeImpact) {
  if (runtimeImpact === 'publish_gate_evidence') return 'release_gate'
  if (runtimeImpact === 'shadow_report_only') return 'shadow_report_only'
  return 'canary_evaluation'
}

function replayRunStatus(evaluation: AlgorithmAssetReplayEvaluation) {
  if (evaluation.summary.runtimeImpact === 'quarantined') return 'quarantined'
  if (evaluation.summary.replayPassed) return 'passed'
  if (evaluation.summary.runtimeImpact === 'review_required') return 'blocked'
  return 'failed'
}

function replayResultStatus(runtimeImpact: AlgorithmAssetReplayRuntimeImpact, replayPassed: boolean) {
  if (runtimeImpact === 'quarantined') return 'quarantined'
  if (runtimeImpact === 'shadow_report_only') return 'shadow_only'
  if (runtimeImpact === 'publish_gate_evidence' && replayPassed) return 'replay_passed'
  if (!replayPassed) return 'replay_failed'
  return 'review_required'
}

function replayRuntimeImpact(runtimeImpact: AlgorithmAssetReplayRuntimeImpact) {
  if (runtimeImpact === 'publish_gate_evidence') return 'published_version_candidate'
  if (runtimeImpact === 'shadow_report_only') return 'shadow_only'
  if (runtimeImpact === 'review_required') return 'canary_candidate'
  return 'none'
}

function maeImprovementRatio(originalError: number, maeImprovement: number) {
  if (!Number.isFinite(originalError) || originalError <= 0) return 0
  return maeImprovement / originalError
}

function overlayImprovementRatio(evaluation: AlgorithmAssetForecastResidualOverlayEvaluation) {
  const originalMae = evaluation.summary.originalMae ?? 0
  const improvement = evaluation.summary.maeImprovement ?? 0
  return originalMae > 0 ? improvement / originalMae : 0
}

function normalizeStringList(values: readonly string[] | undefined) {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))].sort()
}

async function insertCandidateEvent(
  event: AlgorithmAssetCandidateEvent,
  queryExec: AlgorithmAssetGovernanceQueryExec,
): Promise<string | null> {
  const scopeLevel = candidateScopeLevel(event)
  const sanitizedCandidatePayload = sanitizeCandidatePayloadForPersistence(event.candidatePayload)
  const rows = await queryExec<{ id?: string | null }>(`
    INSERT INTO public.algorithm_asset_candidate_events (
      asset_key,
      source_module,
      source_event_id,
      scope_level,
      company_id,
      project_id,
      learning_target,
      learning_maturity,
      publish_anchor,
      automation_maturity,
      event_status,
      candidate_payload,
      evidence_summary,
      runtime_effect,
      rollback_target
    ) VALUES (
      $1,
      $2,
      $3,
      $4,
      $5,
      $6,
      $7,
      $8,
      $9,
      $10,
      $11,
      $12::jsonb,
      $13::jsonb,
      $14,
      $15::jsonb
    )
    RETURNING id
  `, [
    event.assetKey,
    event.sourceSystem,
    event.eventKey,
    scopeLevel,
    event.companyId ?? null,
    event.projectId ?? null,
    learningTargetForPersistence(event.learningTarget),
    event.learningMaturity,
    event.publishAnchor,
    event.automationMaturity,
    eventStatusForPersistence(event),
    sanitizedCandidatePayload.payload,
    evidenceSummary(event, sanitizedCandidatePayload.strippedFields),
    event.runtimeEffectPolicy,
    rollbackTargetPayload(event),
  ])

  return rows[0]?.id ?? null
}

export async function persistAlgorithmAssetCandidateEvent(
  params: PersistAlgorithmAssetCandidateEventParams,
): Promise<PersistAlgorithmAssetCandidateEventResult> {
  const queryExec = params.queryExec ?? buildDefaultQueryExec()
  const candidateEventId = await insertCandidateEvent(params.event, queryExec)
  return {
    persisted: true,
    candidateEventId,
  }
}

export async function persistAlgorithmAssetReplayEvaluation(
  params: PersistAlgorithmAssetReplayEvaluationParams,
): Promise<PersistAlgorithmAssetReplayEvaluationResult> {
  const queryExec = params.queryExec ?? buildDefaultQueryExec()
  const candidateEventId = await insertCandidateEvent(params.evaluation.candidateEvent, queryExec)
  const candidate = params.evaluation.candidateEvent
  const scopeLevel = candidateScopeLevel(candidate)
  const persistedLearningTarget = learningTargetForPersistence(candidate.learningTarget)
  const rollbackTarget = rollbackTargetPayload(candidate)
  const rows = await queryExec<{ id?: string | null }>(`
    INSERT INTO public.algorithm_asset_replay_runs (
      run_key,
      asset_key,
      source_module,
      scope_level,
      company_id,
      project_id,
      learning_target,
      learning_maturity,
      publish_anchor,
      automation_maturity,
      replay_mode,
      sample_count,
      completed_at,
      run_status,
      replay_summary,
      rollback_target
    ) VALUES (
      $1,
      $2,
      $3,
      $4,
      $5,
      $6,
      $7,
      $8,
      $9,
      $10,
      $11,
      $12,
      now(),
      $13,
      $14::jsonb,
      $15::jsonb
    )
    RETURNING id
  `, [
    params.runKey,
    candidate.assetKey,
    candidate.sourceSystem,
    scopeLevel,
    candidate.companyId ?? null,
    candidate.projectId ?? null,
    persistedLearningTarget,
    candidate.learningMaturity,
    candidate.publishAnchor,
    candidate.automationMaturity,
    replayMode(params.evaluation.summary.runtimeImpact),
    params.evaluation.rows.length,
    replayRunStatus(params.evaluation),
    params.evaluation.summary,
    rollbackTarget,
  ])
  const replayRunId = rows[0]?.id ?? null

  for (const row of params.evaluation.rows) {
    await queryExec(`
      INSERT INTO public.algorithm_asset_replay_results (
        replay_run_id,
        candidate_event_id,
        asset_key,
        scope_level,
        company_id,
        project_id,
        learning_target,
        learning_maturity,
        publish_anchor,
        automation_maturity,
        original_error,
        overlay_error,
        mae_improvement_ratio,
        overcompensation_ratio,
        runtime_impact,
        result_status,
        result_summary,
        rollback_target
      ) VALUES (
        $1,
        $2,
        $3,
        $4,
        $5,
        $6,
        $7,
        $8,
        $9,
        $10,
        $11,
        $12,
        $13,
        $14,
        $15,
        $16,
        $17::jsonb,
        $18::jsonb
      )
    `, [
      replayRunId,
      candidateEventId,
      candidate.assetKey,
      scopeLevel,
      row.companyId ?? candidate.companyId ?? null,
      row.projectId ?? candidate.projectId ?? null,
      persistedLearningTarget,
      candidate.learningMaturity,
      candidate.publishAnchor,
      candidate.automationMaturity,
      row.originalError,
      row.overlayError,
      maeImprovementRatio(row.originalError, row.maeImprovement),
      row.overcompensated ? 1 : 0,
      replayRuntimeImpact(row.runtimeImpact),
      replayResultStatus(row.runtimeImpact, params.evaluation.summary.replayPassed),
      row,
      rollbackTarget,
    ])
  }

  return {
    persisted: true,
    candidateEventId,
    replayRunId,
    replayResultCount: params.evaluation.rows.length,
  }
}

export async function persistAlgorithmAssetSampleHealthReport(
  params: PersistAlgorithmAssetSampleHealthReportParams,
): Promise<PersistAlgorithmAssetSampleHealthReportResult> {
  const queryExec = params.queryExec ?? buildDefaultQueryExec()
  const learningTarget = learningTargetForPersistence(params.learningTarget)

  for (const event of params.report.events) {
    requireCompanyScope(event.companyId, 'algorithm_sample_health_event')
    const rejectionReason = event.status === 'rejected' ? event.reasons.join(',') || null : null
    const downgradeReason = event.status === 'weak' ? event.reasons.join(',') || null : null
    await queryExec(`
      INSERT INTO public.algorithm_sample_health_events (
        sample_key,
        asset_key,
        source_module,
        scope_level,
        company_id,
        project_id,
        learning_target,
        learning_maturity,
        sample_status,
        rejection_reason,
        downgrade_reason,
        completion_fact_quality,
        supplement_suggestions,
        publish_anchor,
        automation_maturity
      ) VALUES (
        $1,
        $2,
        $3,
        $4,
        $5,
        $6,
        $7,
        $8,
        $9,
        $10,
        $11,
        $12::jsonb,
        $13::jsonb,
        'candidate_only',
        'manual_required'
      )
    `, [
      event.sampleId,
      params.assetKey,
      params.sourceModule,
      sampleScopeLevel(event),
      event.companyId,
      event.projectId ?? null,
      learningTarget,
      event.benchmarkEligible ? 'guarded_live_tuning' : 'governed_candidate',
      event.status,
      rejectionReason,
      downgradeReason,
      {
        workCode: event.workCode,
        reasons: event.reasons,
        derivedStartDate: event.derivedStartDate,
        derivedEndDate: event.derivedEndDate,
        derivedActualDurationDays: event.derivedActualDurationDays,
        benchmarkEligible: event.benchmarkEligible,
        candidateEvidenceEligible: event.candidateEvidenceEligible,
        ...(event.metadata ?? {}),
      },
      event.completionHints,
    ])
  }

  return {
    persisted: true,
    sampleHealthEventCount: params.report.events.length,
  }
}

export async function persistAlgorithmAssetForecastResidualOverlayEvaluation(
  params: PersistAlgorithmAssetForecastResidualOverlayEvaluationParams,
): Promise<PersistAlgorithmAssetForecastResidualOverlayEvaluationResult> {
  const queryExec = params.queryExec ?? buildDefaultQueryExec()
  const candidate = params.evaluation.candidateEvent
  const candidatePayload = candidatePayloadRecord(candidate)
  const scopeLevel = candidateScopeLevel(candidate)
  if (scopeLevel !== 'company' && scopeLevel !== 'project') {
    throw new Error('forecast_residual_overlay_requires_company_or_project_scope')
  }
  requireCompanyScope(candidate.companyId, 'forecast_residual_overlay')

  const rows = await queryExec<{ id?: string | null }>(`
    INSERT INTO public.duration_forecast_residual_overlays (
      overlay_key,
      publication_key,
      asset_key,
      scope_level,
      company_id,
      project_id,
      learning_target,
      learning_maturity,
      publish_anchor,
      automation_maturity,
      original_mae,
      overlay_mae,
      mae_improvement_ratio,
      overcompensation_ratio,
      residual_payload,
      writes_base_duration_seed,
      target_table,
      rollback_target,
      runtime_publication_status
    ) VALUES (
      $1,
      $2,
      $3,
      $4,
      $5,
      $6,
      $7,
      $8,
      $9,
      $10,
      $11,
      $12,
      $13,
      $14,
      $15::jsonb,
      $16,
      $17,
      $18::jsonb,
      $19
    )
    RETURNING id
  `, [
    params.overlayKey,
    residualOverlayPublicationKey(params.overlayKey),
    candidate.assetKey,
    scopeLevel,
    candidate.companyId,
    candidate.projectId ?? null,
    'forecast_residual',
    candidate.learningMaturity,
    candidate.publishAnchor,
    candidate.automationMaturity,
    params.evaluation.summary.originalMae ?? 0,
    params.evaluation.summary.overlayMae ?? 0,
    overlayImprovementRatio(params.evaluation),
    params.evaluation.summary.overcompensationRate,
    {
      candidatePayload,
      replaySummary: params.evaluation.summary,
      sampleCount: params.evaluation.summary.acceptedSampleCount,
      minAcceptedSamples: candidatePayload.minAcceptedSamples ?? null,
      overlayWrite: params.evaluation.overlayWrite,
    },
    false,
    'duration_forecast_residual_overlays',
    rollbackTargetPayload(candidate),
    params.evaluation.overlayWrite.canWriteRuntimeOverlay
      ? (candidate.automationMaturity === 'auto_canary' ? 'canary' : 'published')
      : 'candidate',
  ])

  return {
    persisted: true,
    overlayId: rows[0]?.id ?? null,
  }
}

export async function persistAlgorithmAssetColdStartBaseline(
  params: PersistAlgorithmAssetColdStartBaselineParams,
): Promise<PersistAlgorithmAssetColdStartBaselineResult> {
  const queryExec = params.queryExec ?? buildDefaultQueryExec()
  const baselineKey = normalizeText(params.baselineKey)
  const segmentKey = normalizeText(params.segmentKey)
  const decision = evaluateAlgorithmAssetColdStartBaselineUpdate(params.updateInput)
  const reasons = [
    ...(baselineKey ? [] : ['baseline_key_required']),
    ...(segmentKey ? [] : ['segment_key_required']),
    ...(Number.isFinite(params.value) && params.value > 0 ? [] : ['positive_baseline_value_required']),
    ...decision.reasons,
  ]

  if (reasons.length > 0) {
    return {
      status: 'blocked',
      persisted: false,
      baselineId: null,
      reasons,
    }
  }

  const evidenceSummary = {
    ...(params.evidenceSummary ?? {}),
    anonymizationPolicy: params.updateInput.anonymizationPolicy,
    contributingCompanyCount: params.updateInput.contributingCompanyCount,
    contributingProjectCount: params.updateInput.contributingProjectCount,
    singleCompanyShare: params.updateInput.singleCompanyShare,
    sourceAggregation: params.updateInput.sourceAggregation,
    applicableScenarioKeys: normalizeStringList(params.applicableScenarioKeys),
  }

  const rows = await queryExec<{ id?: string | null }>(`
    INSERT INTO public.algorithm_cold_start_baselines (
      baseline_key,
      segment_key,
      scope_level,
      learning_target,
      learning_maturity,
      publish_anchor,
      automation_maturity,
      anonymization_policy,
      minimum_company_count,
      minimum_project_count,
      max_single_company_share,
      baseline_value,
      evidence_summary,
      disabled_scenarios,
      rollback_target
    ) VALUES (
      $1,
      $2,
      $3,
      $4,
      $5,
      $6,
      $7,
      $8,
      $9,
      $10,
      $11,
      $12::jsonb,
      $13::jsonb,
      $14::jsonb,
      $15::jsonb
    )
    ON CONFLICT (baseline_key, segment_key)
    DO UPDATE SET
      scope_level = excluded.scope_level,
      learning_target = excluded.learning_target,
      learning_maturity = excluded.learning_maturity,
      publish_anchor = excluded.publish_anchor,
      automation_maturity = excluded.automation_maturity,
      anonymization_policy = excluded.anonymization_policy,
      minimum_company_count = excluded.minimum_company_count,
      minimum_project_count = excluded.minimum_project_count,
      max_single_company_share = excluded.max_single_company_share,
      baseline_value = excluded.baseline_value,
      evidence_summary = excluded.evidence_summary,
      disabled_scenarios = excluded.disabled_scenarios,
      rollback_target = excluded.rollback_target,
      company_id = NULL,
      project_id = NULL,
      updated_at = NOW()
    RETURNING id
  `, [
    baselineKey,
    segmentKey,
    params.updateInput.baselineScope,
    'base_duration',
    'system_curated_learning',
    'system_curated_publish',
    'manual_required',
    'anonymized_multi_company_aggregation',
    params.updateInput.minCompanyCount,
    params.updateInput.minProjectCount,
    params.updateInput.maxSingleCompanyShare,
    {
      value: params.value,
      unit: 'days',
      sourcePolicy: 'anonymized_shared_cold_start_reference_only',
    },
    evidenceSummary,
    normalizeStringList(params.disabledScenarioKeys),
    { rollbackTarget: params.updateInput.rollbackTarget },
  ])

  return {
    status: 'persisted',
    persisted: true,
    baselineId: rows[0]?.id ?? null,
    reasons: [],
  }
}

export async function rollbackAlgorithmAssetColdStartBaselineRuntimePublicationRecord(
  params: RollbackAlgorithmAssetColdStartBaselineRuntimePublicationParams,
): Promise<RollbackAlgorithmAssetColdStartBaselineRuntimePublicationResult> {
  const queryExec = params.queryExec ?? buildDefaultQueryExec()
  const baselineKey = normalizeText(params.baselineKey)
  const segmentKey = normalizeText(params.segmentKey)
  const rollbackTarget = normalizeText(params.rollbackTarget)
  const reason = normalizeText(params.reason)
  const reasons = [
    ...(baselineKey ? [] : ['baseline_key_required']),
    ...(segmentKey ? [] : ['segment_key_required']),
    ...(rollbackTarget ? [] : ['rollback_target_required']),
    ...(reason ? [] : ['rollback_reason_required']),
  ]

  if (reasons.length > 0) {
    return {
      status: 'rollback_blocked',
      baselineKey: baselineKey ?? '',
      segmentKey: segmentKey ?? '',
      rollbackTarget,
      writesSharedBaseline: false,
      writesCompanyOverride: false,
      writesBaseDurationSeed: false,
      reasons,
    }
  }

  const rollbackExecution = {
    status: 'cold_start_baseline_runtime_rolled_back',
    reason,
    rollbackTarget,
    executedAt: new Date().toISOString(),
    writesCompanyOverride: false,
    writesBaseDurationSeed: false,
    targetTable: 'algorithm_cold_start_baselines',
  }

  const rows = await queryExec<{ id?: string | null, baseline_key?: string | null }>(`
    UPDATE public.algorithm_cold_start_baselines
       SET runtime_publication_status = 'runtime_rolled_back',
           rollback_execution = $1::jsonb,
           rolled_back_at = $2,
           updated_at = $2
     WHERE baseline_key = $3
       AND segment_key = $4
       AND rollback_target @> $5::jsonb
    RETURNING id, baseline_key
  `, [
    rollbackExecution,
    rollbackExecution.executedAt,
    baselineKey,
    segmentKey,
    { rollbackTarget },
  ])

  if (rows.length === 0) {
    return {
      status: 'rollback_blocked',
      baselineKey,
      segmentKey,
      rollbackTarget,
      writesSharedBaseline: false,
      writesCompanyOverride: false,
      writesBaseDurationSeed: false,
      reasons: ['matching_cold_start_baseline_runtime_publication_not_found'],
    }
  }

  return {
    status: 'rollback_executed',
    baselineKey,
    segmentKey,
    rollbackTarget,
    writesSharedBaseline: true,
    writesCompanyOverride: false,
    writesBaseDurationSeed: false,
    reasons: [],
  }
}

export async function rollbackAlgorithmAssetForecastResidualOverlayRuntimePublicationRecord(
  params: RollbackAlgorithmAssetForecastResidualOverlayRuntimePublicationParams,
): Promise<RollbackAlgorithmAssetForecastResidualOverlayRuntimePublicationResult> {
  const queryExec = params.queryExec ?? buildDefaultQueryExec()
  const overlayKey = normalizeText(params.overlayKey)
  const rollbackTarget = normalizeText(params.rollbackTarget)
  const reason = normalizeText(params.reason)
  const reasons = [
    ...(overlayKey ? [] : ['overlay_key_required']),
    ...(rollbackTarget ? [] : ['rollback_target_required']),
    ...(reason ? [] : ['rollback_reason_required']),
  ]

  if (reasons.length > 0) {
    return {
      status: 'rollback_blocked',
      overlayKey: overlayKey ?? '',
      rollbackTarget,
      writesRuntimeOverlay: false,
      writesBaseDurationSeed: false,
      reasons,
    }
  }

  const rollbackExecution = {
    status: 'forecast_residual_overlay_runtime_rolled_back',
    reason,
    rollbackTarget,
    executedAt: new Date().toISOString(),
    writesBaseDurationSeed: false,
    targetTable: 'duration_forecast_residual_overlays',
  }

  const rows = await queryExec<{ id?: string | null, overlay_key?: string | null }>(`
    UPDATE public.duration_forecast_residual_overlays
       SET runtime_publication_status = 'runtime_rolled_back',
           rollback_execution = $1::jsonb,
           rolled_back_at = $2,
           updated_at = $2
     WHERE overlay_key = $3
       AND target_table = 'duration_forecast_residual_overlays'
       AND writes_base_duration_seed = false
       AND rollback_target @> $4::jsonb
    RETURNING id, overlay_key
  `, [
    rollbackExecution,
    rollbackExecution.executedAt,
    overlayKey,
    { rollbackTarget },
  ])

  if (rows.length === 0) {
    return {
      status: 'rollback_blocked',
      overlayKey,
      rollbackTarget,
      writesRuntimeOverlay: false,
      writesBaseDurationSeed: false,
      reasons: ['matching_overlay_runtime_publication_not_found'],
    }
  }

  return {
    status: 'rollback_executed',
    overlayKey,
    rollbackTarget,
    writesRuntimeOverlay: true,
    writesBaseDurationSeed: false,
    reasons: [],
  }
}
