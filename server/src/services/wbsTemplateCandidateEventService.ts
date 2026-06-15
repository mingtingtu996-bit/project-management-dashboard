import { supabase } from './dbService.js'
import { logger } from '../middleware/logger.js'
import {
  createAndPersistAlgorithmAssetCandidateEvent,
} from './algorithmAssetCandidateEventAdapterService.js'
import type { AlgorithmAssetGovernanceQueryExec } from './algorithmAssetGovernancePersistenceService.js'
import {
  collectDurationLiveLearningProductionEvidenceRecordsFromRows,
  collectDurationLiveLearningProductionEvidenceRefs,
  type DurationLiveLearningProductionEvidenceRecord,
  type DurationLiveLearningProductionEvidenceRef,
  type DurationLiveLearningProductionEvidenceSourceRow,
  type DurationLiveLearningRejectedProductionEvidenceRecord,
  type DurationLiveLearningRejectedProductionEvidenceSourceRow,
} from './durationLiveLearningProductionEvidenceGateService.js'

export interface RecordWbsTemplateCandidateEventInput {
  companyId?: string | null
  projectId: string
  surface: 'task_list' | 'baseline'
  generationBatchId?: string | null
  templateId?: string | null
  selectedNodeIds?: unknown[]
  scope?: Record<string, unknown> | null
  attachUnderRowId?: string | null
  generatedRowCount?: number
  retainedRowCount?: number
  rejectedRowCount?: number
  pendingRowCount?: number
  generatedEntityIds?: string[]
  actorId?: string | null
  metadata?: Record<string, unknown>
  governanceQueryExec?: AlgorithmAssetGovernanceQueryExec
}

export type SpecialWorkDurationSeedLearningScopeEvidence =
  | 'global'
  | 'industry'
  | 'company'
  | 'project'
  | 'system'
  | 'industry_baseline'
  | 'segment_baseline'
  | string

export interface SpecialWorkDurationSeedCandidateOutcomeEvidence {
  generatedRowCount: number
  retainedRowCount: number
  rejectedRowCount: number
  pendingRowCount: number
}

export interface SpecialWorkDurationSeedLiveLearningEvidenceInput {
  candidateOutcome: SpecialWorkDurationSeedCandidateOutcomeEvidence
  networkPredictionEventRecorded: boolean
  templateFeedbackOutcomeRecorded: boolean
  approvedSpecialSeedCandidateRecorded: boolean
  enabledLearningScopes: readonly SpecialWorkDurationSeedLearningScopeEvidence[]
  runtimeConsumerUsesPublishedArtifact: boolean
  specialSeedPublicationWriterReady: boolean
  seedVersionLineageRecorded: boolean
  releaseExitApproved: boolean
  impactMonitoringReady: boolean
  rollbackTargetReady: boolean
  accuracyMetricsAvailable: boolean
}

export interface SpecialWorkDurationSeedLiveLearningEvidence {
  assetClassificationRegistered: true
  predictionEventRecorded: boolean
  actualOutcomeEventRecorded: boolean
  tieredLearningPolicyRegistered: boolean
  enabledLearningScopes: Array<'global' | 'industry' | 'company' | 'project'>
  runtimeConsumerUsesPublishedArtifact: boolean
  governedCandidateOnlyBoundaryPreserved: true
  approvedSpecialSeedCandidateRecorded: boolean
  specialSeedPublicationWriterReady: boolean
  seedVersionLineageRecorded: boolean
  releaseExitApproved: boolean
  impactMonitoringReady: boolean
  rollbackTargetReady: boolean
  accuracyMetricsAvailable: boolean
  generatedRowCount: number
  retainedRowCount: number
  rejectedRowCount: number
  pendingRowCount: number
  resolvedOutcomeRatio: number | null
}

export interface SpecialWorkDurationSeedLiveLearningEvidenceDecision {
  status: 'special_work_seed_live_learning_ready' | 'special_work_seed_live_learning_not_ready'
  liveLearningEvidence: SpecialWorkDurationSeedLiveLearningEvidence
  missingReasons: string[]
}

export interface SpecialWorkDurationSeedPublicationReadinessInput {
  candidateOutcome: SpecialWorkDurationSeedCandidateOutcomeEvidence
  approvedCandidateEventIds: readonly string[]
  seedVersionId?: string | null
  runtimePublicationKey?: string | null
  rollbackTarget?: string | null
  generatedEntityIds?: readonly string[]
  enabledLearningScopes: readonly SpecialWorkDurationSeedLearningScopeEvidence[]
  releaseExitApproved: boolean
  impactMonitoringReady: boolean
  accuracyMetricsAvailable: boolean
}

export interface SpecialWorkDurationSeedPublicationReadinessFromProductionRowsInput {
  candidateOutcome: SpecialWorkDurationSeedCandidateOutcomeEvidence
  approvedCandidateEventIds: readonly string[]
  generatedEntityIds?: readonly string[]
  enabledLearningScopes: readonly SpecialWorkDurationSeedLearningScopeEvidence[]
  sourceRows?: readonly DurationLiveLearningProductionEvidenceSourceRow[]
  records?: readonly DurationLiveLearningProductionEvidenceRecord[]
}

export interface SpecialWorkDurationSeedVersionLineage {
  seedType: 'special_work_duration'
  seedVersionId: string | null
  runtimePublicationKey: string | null
  rollbackTarget: string | null
  approvedCandidateEventIds: string[]
  generatedEntityIds: string[]
  generatedRowCount: number
  retainedRowCount: number
  rejectedRowCount: number
  pendingRowCount: number
}

export interface SpecialWorkDurationSeedProductionLineage {
  evidenceRefs: DurationLiveLearningProductionEvidenceRef
  rejectedRows: DurationLiveLearningRejectedProductionEvidenceSourceRow[]
  rejectedRecords: DurationLiveLearningRejectedProductionEvidenceRecord[]
}

export interface SpecialWorkDurationSeedPublicationReadiness {
  status: 'special_work_seed_publication_ready' | 'special_work_seed_publication_not_ready'
  liveLearningEvidence: SpecialWorkDurationSeedLiveLearningEvidence
  seedVersionLineage: SpecialWorkDurationSeedVersionLineage
  missingReasons: string[]
}

export type SpecialWorkDurationSeedProductionPublicationReadiness =
  SpecialWorkDurationSeedPublicationReadiness & {
    productionLineage: SpecialWorkDurationSeedProductionLineage
  }

const SPECIAL_WORK_DURATION_SEED_ASSET_KEY = 'special_work_duration_seed'

function normalizeString(value: unknown): string | null {
  const normalized = String(value ?? '').trim()
  return normalized || null
}

function normalizeLower(value: unknown): string {
  return String(value ?? '').trim().toLowerCase()
}

function normalizeObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function readPositiveInteger(value: unknown, fallback = 0) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(0, Math.round(parsed))
}

function readBoundedInteger(value: unknown, fallback: number, max: number) {
  return Math.min(max, readPositiveInteger(value, fallback))
}

function uniqueValues<T extends string>(values: T[]): T[] {
  return [...new Set(values.filter(Boolean))]
}

function normalizeStringList(values: readonly unknown[] | undefined): string[] {
  return uniqueValues((values ?? [])
    .map((value) => normalizeString(value))
    .filter((value): value is string => Boolean(value)))
}

function specialWorkSeedObservationMatchesPublication(
  evidenceRefs: DurationLiveLearningProductionEvidenceRef,
) {
  const publicationKey = normalizeString(evidenceRefs.publicationExecutionRef)
  const observedPublicationKey = normalizeString(evidenceRefs.runtimeConsumerPublicationKey)
  return Boolean(publicationKey)
    && Boolean(observedPublicationKey)
    && publicationKey === observedPublicationKey
}

function readRowText(row: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = row[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return ''
}

function findCurrentPublishedSpecialWorkSeedVersionId(
  sourceRows: readonly DurationLiveLearningProductionEvidenceSourceRow[] | undefined,
) {
  for (const source of sourceRows ?? []) {
    if (source.sourceTable !== 'wbs_template_runtime_publications') continue
    const row = source.row
    const seedVersionId = readRowText(row, 'asset_version_id', 'assetVersionId')
    if (
      seedVersionId
      && readRowText(row, 'asset_kind', 'assetKind') === SPECIAL_WORK_DURATION_SEED_ASSET_KEY
      && readRowText(row, 'publication_key', 'publicationKey')
      && readRowText(row, 'runtime_publication_status', 'runtimePublicationStatus') === 'runtime_published'
    ) {
      return seedVersionId
    }
  }
  return null
}

function specialWorkSeedProductionLineageFromProductionInput(
  input: Pick<SpecialWorkDurationSeedPublicationReadinessFromProductionRowsInput, 'sourceRows' | 'records'>,
): SpecialWorkDurationSeedProductionLineage {
  const rowCollection = collectDurationLiveLearningProductionEvidenceRecordsFromRows({
    rows: input.sourceRows,
  })
  const evidenceCollection = collectDurationLiveLearningProductionEvidenceRefs({
    records: [
      ...rowCollection.records,
      ...(input.records ?? []),
    ],
  })
  const evidenceRefs = evidenceCollection.productionEvidence.find((evidence) =>
    evidence.assetKey === SPECIAL_WORK_DURATION_SEED_ASSET_KEY)
    ?? { assetKey: SPECIAL_WORK_DURATION_SEED_ASSET_KEY }

  return {
    evidenceRefs,
    rejectedRows: rowCollection.rejectedRows,
    rejectedRecords: evidenceCollection.rejectedRecords,
  }
}

const SPECIAL_WORK_DURATION_LEARNING_SCOPE_ORDER = ['global', 'industry', 'company', 'project'] as const

function normalizeSpecialWorkDurationLearningScopes(
  scopes: readonly SpecialWorkDurationSeedLearningScopeEvidence[] | undefined,
): Array<typeof SPECIAL_WORK_DURATION_LEARNING_SCOPE_ORDER[number]> {
  const normalized = new Set<typeof SPECIAL_WORK_DURATION_LEARNING_SCOPE_ORDER[number]>()
  for (const scope of scopes ?? []) {
    const value = normalizeLower(scope)
    if (value === 'system' || value === 'global') normalized.add('global')
    if (value === 'industry' || value === 'industry_baseline' || value === 'segment_baseline') normalized.add('industry')
    if (value === 'company') normalized.add('company')
    if (value === 'project') normalized.add('project')
  }
  return SPECIAL_WORK_DURATION_LEARNING_SCOPE_ORDER.filter((scope) => normalized.has(scope))
}

function roundRatio(value: number) {
  return Number(value.toFixed(6))
}

function getCurrentPeriodMonth() {
  return new Date().toISOString().slice(0, 7)
}

function extractMissingColumn(error: unknown, tableName: string) {
  const message = String((error as { message?: unknown })?.message ?? '')
  const patterns = [
    new RegExp(`Could not find the '([^']+)' column of '${tableName}'`, 'i'),
    new RegExp(`column "([^"]+)" of relation "${tableName}" does not exist`, 'i'),
    /column "([^"]+)" does not exist/i,
  ]
  for (const pattern of patterns) {
    const match = message.match(pattern)
    if (match?.[1]) return match[1]
  }
  return null
}

async function insertCandidateEventWithSchemaFallback(row: Record<string, unknown>) {
  const workingRow = { ...row }
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const { error } = await supabase.from('wbs_template_candidate_events').insert(workingRow)
    if (!error) return null
    const missingColumn = extractMissingColumn(error, 'wbs_template_candidate_events')
    if (!missingColumn || !(missingColumn in workingRow)) return error
    delete workingRow[missingColumn]
  }
  return null
}

async function updateWbsTemplateCandidateAggregation(
  input: RecordWbsTemplateCandidateEventInput,
  counts: {
    generatedRowCount: number
    retainedRowCount: number
    rejectedRowCount: number
    pendingRowCount: number
  },
) {
  const templateId = normalizeString(input.templateId) ?? 'unknown'
  const periodMonth = getCurrentPeriodMonth()

  try {
    const table = supabase.from('wbs_template_candidate_aggregations')
    if (typeof table?.select !== 'function' || typeof table?.upsert !== 'function') return

    const existingQuery = table
      .select('total_candidates, accepted_candidates, rejected_candidates, pending_candidates, metadata')
      .eq('project_id', input.projectId)
      .eq('template_id', templateId)
      .eq('period_month', periodMonth)

    const { data: existing, error: selectError } = typeof existingQuery.maybeSingle === 'function'
      ? await existingQuery.maybeSingle()
      : { data: null, error: null }

    if (selectError) {
      logger.warn('[wbs-template-candidate] failed to read template candidate aggregation', {
        projectId: input.projectId,
        templateId,
        error: selectError.message,
      })
      return
    }

    const previous = existing && typeof existing === 'object' ? existing as Record<string, unknown> : {}
    const nextTotal = readPositiveInteger(previous.total_candidates) + counts.generatedRowCount
    const nextAccepted = readPositiveInteger(previous.accepted_candidates) + counts.retainedRowCount
    const nextRejected = readPositiveInteger(previous.rejected_candidates) + counts.rejectedRowCount
    const nextPending = readPositiveInteger(previous.pending_candidates) + counts.pendingRowCount

    const { error: upsertError } = await table.upsert({
      project_id: input.projectId,
      template_id: templateId,
      period_month: periodMonth,
      total_candidates: nextTotal,
      accepted_candidates: nextAccepted,
      rejected_candidates: nextRejected,
      pending_candidates: nextPending,
      acceptance_rate: nextTotal > 0 ? nextAccepted / nextTotal : null,
      metadata: {
        ...normalizeObject(previous.metadata),
        last_generation_batch_id: normalizeString(input.generationBatchId),
        last_generated_row_count: counts.generatedRowCount,
        last_retained_row_count: counts.retainedRowCount,
        last_rejected_row_count: counts.rejectedRowCount,
        last_pending_row_count: counts.pendingRowCount,
        last_surface: input.surface,
        updated_from: 'template_generate_commit',
        acceptance_rate_basis: 'retained_rows_divided_by_generated_rows',
      },
      updated_at: new Date().toISOString(),
    }, { onConflict: 'project_id,template_id,period_month', ignoreDuplicates: false })

    if (upsertError) {
      logger.warn('[wbs-template-candidate] failed to update template candidate aggregation', {
        projectId: input.projectId,
        templateId,
        error: upsertError.message,
      })
    }
  } catch (error) {
    logger.warn('[wbs-template-candidate] skipped template candidate aggregation', {
      projectId: input.projectId,
      templateId,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

async function persistUnifiedAlgorithmAssetCandidateEvent(
  input: RecordWbsTemplateCandidateEventInput,
  counts: {
    generatedRowCount: number
    retainedRowCount: number
    rejectedRowCount: number
    pendingRowCount: number
  },
  selectedNodeIds: string[],
  generatedEntityIds: string[],
) {
  const companyId = normalizeString(input.companyId)
  if (!companyId) return

  const templateId = normalizeString(input.templateId) ?? 'unknown'

  try {
    await createAndPersistAlgorithmAssetCandidateEvent({
      assetKey: `wbs.template.${templateId}.${input.surface}`,
      sourceSystem: 'wbsTemplateCandidateEventService',
      assetType: 'template',
      companyId,
      projectId: input.projectId,
      candidatePayload: {
        templateId,
        surface: input.surface,
        generationBatchId: normalizeString(input.generationBatchId),
        selectedNodeIds,
        scope: normalizeObject(input.scope),
        attachUnderRowId: normalizeString(input.attachUnderRowId),
        generatedRowCount: counts.generatedRowCount,
        retainedRowCount: counts.retainedRowCount,
        rejectedRowCount: counts.rejectedRowCount,
        pendingRowCount: counts.pendingRowCount,
        generatedEntityIds,
        metadata: normalizeObject(input.metadata),
      },
      learningTarget: 'template_structure',
      learningMaturity: 'governed_candidate',
      publishAnchor: 'candidate_only',
      automationMaturity: 'manual_required',
      requestedRuntimeEffect: 'candidate_only',
      generatedBy: 'service',
      queryExec: input.governanceQueryExec,
    })
  } catch (error) {
    logger.warn('[wbs-template-candidate] failed to persist unified algorithm asset candidate event', {
      projectId: input.projectId,
      companyId,
      templateId,
      surface: input.surface,
      generationBatchId: input.generationBatchId,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

export async function recordWbsTemplateCandidateEvent(input: RecordWbsTemplateCandidateEventInput): Promise<void> {
  try {
    const insert = supabase.from('wbs_template_candidate_events')?.insert
    if (typeof insert !== 'function') return

    const selectedNodeIds = Array.isArray(input.selectedNodeIds)
      ? input.selectedNodeIds.map((item) => String(item ?? '').trim()).filter(Boolean)
      : []
    const generatedEntityIds = (input.generatedEntityIds ?? [])
      .map((item) => String(item ?? '').trim())
      .filter(Boolean)
    const generatedRowCount = Number.isFinite(Number(input.generatedRowCount))
      ? Math.max(0, Math.round(Number(input.generatedRowCount)))
      : generatedEntityIds.length
    const retainedRowCount = readBoundedInteger(input.retainedRowCount, generatedEntityIds.length || generatedRowCount, generatedRowCount)
    const explicitRejected = input.rejectedRowCount !== undefined
      ? readBoundedInteger(input.rejectedRowCount, 0, generatedRowCount)
      : Math.max(0, generatedRowCount - retainedRowCount)
    const pendingRowCount = readBoundedInteger(input.pendingRowCount, 0, Math.max(0, generatedRowCount - retainedRowCount - explicitRejected))
    const rejectedRowCount = Math.min(explicitRejected, Math.max(0, generatedRowCount - retainedRowCount - pendingRowCount))

    const error = await insertCandidateEventWithSchemaFallback({
      project_id: input.projectId,
      surface: input.surface,
      event_type: 'template_generate_commit',
      generation_batch_id: normalizeString(input.generationBatchId),
      template_id: normalizeString(input.templateId),
      selected_node_ids: selectedNodeIds,
      scope: normalizeObject(input.scope),
      attach_under_row_id: normalizeString(input.attachUnderRowId),
      generated_row_count: generatedRowCount,
      retained_row_count: retainedRowCount,
      rejected_row_count: rejectedRowCount,
      pending_row_count: pendingRowCount,
      generated_entity_ids: generatedEntityIds,
      created_by: normalizeString(input.actorId),
      metadata: {
        ...normalizeObject(input.metadata),
        retained_row_count: retainedRowCount,
        rejected_row_count: rejectedRowCount,
        pending_row_count: pendingRowCount,
        acceptance_rate_basis: 'retained_rows_divided_by_generated_rows',
      },
    })

    if (error) {
      logger.warn('[wbs-template-candidate] failed to record template candidate event', {
        projectId: input.projectId,
        surface: input.surface,
        generationBatchId: input.generationBatchId,
        error: error.message,
      })
      return
    }

    await updateWbsTemplateCandidateAggregation(input, {
      generatedRowCount,
      retainedRowCount,
      rejectedRowCount,
      pendingRowCount,
    })
    await persistUnifiedAlgorithmAssetCandidateEvent(input, {
      generatedRowCount,
      retainedRowCount,
      rejectedRowCount,
      pendingRowCount,
    }, selectedNodeIds, generatedEntityIds)
  } catch (error) {
    logger.warn('[wbs-template-candidate] skipped template candidate event', {
      projectId: input.projectId,
      surface: input.surface,
      generationBatchId: input.generationBatchId,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

export function evaluateSpecialWorkDurationSeedLiveLearningEvidence(
  input: SpecialWorkDurationSeedLiveLearningEvidenceInput,
): SpecialWorkDurationSeedLiveLearningEvidenceDecision {
  const missingReasons: string[] = []
  const generatedRowCount = readPositiveInteger(input.candidateOutcome.generatedRowCount)
  const retainedRowCount = readBoundedInteger(input.candidateOutcome.retainedRowCount, 0, generatedRowCount)
  const rejectedRowCount = readBoundedInteger(input.candidateOutcome.rejectedRowCount, 0, generatedRowCount)
  const pendingRowCount = readBoundedInteger(input.candidateOutcome.pendingRowCount, 0, generatedRowCount)
  const resolvedRowCount = Math.min(generatedRowCount, retainedRowCount + rejectedRowCount)
  const resolvedOutcomeRatio = generatedRowCount > 0 ? roundRatio(resolvedRowCount / generatedRowCount) : null
  const allCandidateRowsResolved = generatedRowCount > 0
    && pendingRowCount === 0
    && retainedRowCount + rejectedRowCount >= generatedRowCount
  const enabledLearningScopes = normalizeSpecialWorkDurationLearningScopes(input.enabledLearningScopes)
  const tieredLearningPolicyRegistered = SPECIAL_WORK_DURATION_LEARNING_SCOPE_ORDER
    .every((scope) => enabledLearningScopes.includes(scope))
  const predictionEventRecorded = input.networkPredictionEventRecorded && generatedRowCount > 0
  const actualOutcomeEventRecorded = input.templateFeedbackOutcomeRecorded
    && generatedRowCount > 0
    && resolvedRowCount > 0
    && allCandidateRowsResolved

  if (!predictionEventRecorded) missingReasons.push('network_prediction_event_required')
  if (!actualOutcomeEventRecorded) missingReasons.push('network_outcome_event_required')
  if (!allCandidateRowsResolved) missingReasons.push('all_candidate_rows_must_have_user_outcome')
  if (!input.approvedSpecialSeedCandidateRecorded) missingReasons.push('approved_special_seed_candidate_required')
  if (!input.specialSeedPublicationWriterReady) missingReasons.push('special_seed_publication_writer_required')
  if (!input.seedVersionLineageRecorded) missingReasons.push('seed_version_lineage_required')
  if (!tieredLearningPolicyRegistered) missingReasons.push('global_industry_company_project_learning_scopes_required')
  if (!input.runtimeConsumerUsesPublishedArtifact) missingReasons.push('runtime_consumer_publication_required')
  if (!input.releaseExitApproved) missingReasons.push('release_exit_required')
  if (!input.impactMonitoringReady) missingReasons.push('impact_monitoring_required')
  if (!input.rollbackTargetReady) missingReasons.push('rollback_target_required')
  if (!input.accuracyMetricsAvailable) missingReasons.push('accuracy_metrics_required')

  const liveLearningEvidence: SpecialWorkDurationSeedLiveLearningEvidence = {
    assetClassificationRegistered: true,
    predictionEventRecorded,
    actualOutcomeEventRecorded,
    tieredLearningPolicyRegistered,
    enabledLearningScopes,
    runtimeConsumerUsesPublishedArtifact: input.runtimeConsumerUsesPublishedArtifact,
    governedCandidateOnlyBoundaryPreserved: true,
    approvedSpecialSeedCandidateRecorded: input.approvedSpecialSeedCandidateRecorded,
    specialSeedPublicationWriterReady: input.specialSeedPublicationWriterReady,
    seedVersionLineageRecorded: input.seedVersionLineageRecorded,
    releaseExitApproved: input.releaseExitApproved,
    impactMonitoringReady: input.impactMonitoringReady,
    rollbackTargetReady: input.rollbackTargetReady,
    accuracyMetricsAvailable: input.accuracyMetricsAvailable,
    generatedRowCount,
    retainedRowCount,
    rejectedRowCount,
    pendingRowCount,
    resolvedOutcomeRatio,
  }

  return {
    status: missingReasons.length === 0
      ? 'special_work_seed_live_learning_ready'
      : 'special_work_seed_live_learning_not_ready',
    liveLearningEvidence,
    missingReasons: uniqueValues(missingReasons),
  }
}

export function buildSpecialWorkDurationSeedPublicationReadiness(
  input: SpecialWorkDurationSeedPublicationReadinessInput,
): SpecialWorkDurationSeedPublicationReadiness {
  const generatedRowCount = readPositiveInteger(input.candidateOutcome.generatedRowCount)
  const retainedRowCount = readBoundedInteger(input.candidateOutcome.retainedRowCount, 0, generatedRowCount)
  const rejectedRowCount = readBoundedInteger(input.candidateOutcome.rejectedRowCount, 0, generatedRowCount)
  const pendingRowCount = readBoundedInteger(input.candidateOutcome.pendingRowCount, 0, generatedRowCount)
  const approvedCandidateEventIds = normalizeStringList(input.approvedCandidateEventIds)
  const generatedEntityIds = normalizeStringList(input.generatedEntityIds)
  const seedVersionId = normalizeString(input.seedVersionId)
  const runtimePublicationKey = normalizeString(input.runtimePublicationKey)
  const rollbackTarget = normalizeString(input.rollbackTarget)
  const specialSeedPublicationWriterReady = Boolean(seedVersionId && runtimePublicationKey)
  const seedVersionLineageRecorded = Boolean(seedVersionId)
    && approvedCandidateEventIds.length > 0
    && generatedRowCount > 0

  const readiness = evaluateSpecialWorkDurationSeedLiveLearningEvidence({
    candidateOutcome: {
      generatedRowCount,
      retainedRowCount,
      rejectedRowCount,
      pendingRowCount,
    },
    networkPredictionEventRecorded: generatedRowCount > 0,
    templateFeedbackOutcomeRecorded: generatedRowCount > 0,
    approvedSpecialSeedCandidateRecorded: approvedCandidateEventIds.length > 0,
    enabledLearningScopes: input.enabledLearningScopes,
    runtimeConsumerUsesPublishedArtifact: Boolean(runtimePublicationKey),
    specialSeedPublicationWriterReady,
    seedVersionLineageRecorded,
    releaseExitApproved: input.releaseExitApproved,
    impactMonitoringReady: input.impactMonitoringReady,
    rollbackTargetReady: Boolean(rollbackTarget),
    accuracyMetricsAvailable: input.accuracyMetricsAvailable,
  })

  return {
    status: readiness.status === 'special_work_seed_live_learning_ready'
      ? 'special_work_seed_publication_ready'
      : 'special_work_seed_publication_not_ready',
    liveLearningEvidence: readiness.liveLearningEvidence,
    seedVersionLineage: {
      seedType: 'special_work_duration',
      seedVersionId,
      runtimePublicationKey,
      rollbackTarget,
      approvedCandidateEventIds,
      generatedEntityIds,
      generatedRowCount,
      retainedRowCount,
      rejectedRowCount,
      pendingRowCount,
    },
    missingReasons: readiness.missingReasons,
  }
}

export function buildSpecialWorkDurationSeedPublicationReadinessFromProductionRows(
  input: SpecialWorkDurationSeedPublicationReadinessFromProductionRowsInput,
): SpecialWorkDurationSeedProductionPublicationReadiness {
  const generatedRowCount = readPositiveInteger(input.candidateOutcome.generatedRowCount)
  const retainedRowCount = readBoundedInteger(input.candidateOutcome.retainedRowCount, 0, generatedRowCount)
  const rejectedRowCount = readBoundedInteger(input.candidateOutcome.rejectedRowCount, 0, generatedRowCount)
  const pendingRowCount = readBoundedInteger(input.candidateOutcome.pendingRowCount, 0, generatedRowCount)
  const approvedCandidateEventIds = normalizeStringList(input.approvedCandidateEventIds)
  const generatedEntityIds = normalizeStringList(input.generatedEntityIds)
  const productionLineage = specialWorkSeedProductionLineageFromProductionInput(input)
  const evidenceRefs = productionLineage.evidenceRefs
  const seedVersionId = findCurrentPublishedSpecialWorkSeedVersionId(input.sourceRows)
  const runtimePublicationKey = normalizeString(evidenceRefs.publicationExecutionRef)
  const rollbackTarget = normalizeString(evidenceRefs.rollbackDrillEvidenceRef)
  const hasRuntimeConsumerObservation = Boolean(evidenceRefs.runtimeConsumerObservationRef)
  const runtimeConsumerObservationMatchesPublication = hasRuntimeConsumerObservation
    && specialWorkSeedObservationMatchesPublication(evidenceRefs)
  const specialSeedPublicationWriterReady = Boolean(seedVersionId && runtimePublicationKey)
  const seedVersionLineageRecorded = Boolean(seedVersionId)
    && approvedCandidateEventIds.length > 0
    && generatedRowCount > 0

  const readiness = evaluateSpecialWorkDurationSeedLiveLearningEvidence({
    candidateOutcome: {
      generatedRowCount,
      retainedRowCount,
      rejectedRowCount,
      pendingRowCount,
    },
    networkPredictionEventRecorded: Boolean(evidenceRefs.productionSampleEvidenceRef),
    templateFeedbackOutcomeRecorded: Boolean(evidenceRefs.productionSampleEvidenceRef),
    approvedSpecialSeedCandidateRecorded: approvedCandidateEventIds.length > 0,
    enabledLearningScopes: input.enabledLearningScopes,
    runtimeConsumerUsesPublishedArtifact: runtimeConsumerObservationMatchesPublication,
    specialSeedPublicationWriterReady,
    seedVersionLineageRecorded,
    releaseExitApproved: Boolean(evidenceRefs.publicationExecutionRef),
    impactMonitoringReady: Boolean(evidenceRefs.impactMonitoringEvidenceRef),
    rollbackTargetReady: Boolean(evidenceRefs.rollbackDrillEvidenceRef),
    accuracyMetricsAvailable: Boolean(evidenceRefs.accuracyEvidenceRef),
  })

  return {
    status: readiness.status === 'special_work_seed_live_learning_ready'
      ? 'special_work_seed_publication_ready'
      : 'special_work_seed_publication_not_ready',
    liveLearningEvidence: readiness.liveLearningEvidence,
    seedVersionLineage: {
      seedType: 'special_work_duration',
      seedVersionId,
      runtimePublicationKey,
      rollbackTarget,
      approvedCandidateEventIds,
      generatedEntityIds,
      generatedRowCount,
      retainedRowCount,
      rejectedRowCount,
      pendingRowCount,
    },
    missingReasons: uniqueValues([
      ...readiness.missingReasons,
      hasRuntimeConsumerObservation && !runtimeConsumerObservationMatchesPublication
        ? 'runtime_consumer_publication_mismatch'
        : '',
    ]),
    productionLineage,
  }
}
