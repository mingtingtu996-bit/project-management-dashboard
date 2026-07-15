import { supabase } from './dbService.js'
import { logger } from '../middleware/logger.js'
import {
  createAndPersistAlgorithmAssetCandidateEvent,
} from './algorithmAssetCandidateEventAdapterService.js'
import type { AlgorithmAssetGovernanceQueryExec } from './algorithmAssetGovernancePersistenceService.js'
import {
  collectDurationLiveLearningProductionEvidenceRecordsFromRows,
  collectDurationLiveLearningProductionEvidenceRefs,
  splitPublicationReadinessDirectProductionEvidenceRecords,
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
  scheduleTrustGate?: GenerationDepthPolicyScheduleTrustGate | null
  governanceQueryExec?: AlgorithmAssetGovernanceQueryExec
}

export type GenerationDepthPolicyScheduleTrustGate = {
  source: 'generation_depth_policy'
  generationDepth: string
  status: 'trusted' | 'review_required' | 'blocked'
  trustedForScheduling: boolean
  totalScheduleRows: number
  durationBearingScheduleRows: number
  fallbackPolicyRowCount: number
  descendantRollupRequiredRowCount: number
  descendantRollupAppliedRowCount: number
  missingDescendantRollupRowCount: number
  rowsMissingReferenceDuration: number
  policyConfidenceCounts?: Record<string, number>
  reviewReasons?: string[]
  reviewRows?: Array<{
    stableCode?: string | null
    title?: string | null
    reasons?: string[]
    policyId?: string | null
    confidence?: string | null
  }>
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
  runtimeConsumerObservationRef?: string | null
  runtimeConsumerPublicationKey?: string | null
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

type WbsTemplateCandidateCounts = {
  generatedRowCount: number
  retainedRowCount: number
  rejectedRowCount: number
  pendingRowCount: number
}

type PlanNetworkOutcomeStatus = 'accepted' | 'weak'

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
  const directRecordCollection = splitPublicationReadinessDirectProductionEvidenceRecords(input.records)
  const evidenceCollection = collectDurationLiveLearningProductionEvidenceRefs({
    records: [
      ...rowCollection.records,
      ...directRecordCollection.allowedRecords,
    ],
  })
  const evidenceRefs = evidenceCollection.productionEvidence.find((evidence) =>
    evidence.assetKey === SPECIAL_WORK_DURATION_SEED_ASSET_KEY)
    ?? { assetKey: SPECIAL_WORK_DURATION_SEED_ASSET_KEY }

  return {
    evidenceRefs,
    rejectedRows: rowCollection.rejectedRows,
    rejectedRecords: [
      ...evidenceCollection.rejectedRecords,
      ...directRecordCollection.rejectedRecords,
    ],
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

function specialWorkDurationNetworkOutcomeStatus(
  counts: WbsTemplateCandidateCounts,
): PlanNetworkOutcomeStatus | null {
  if (counts.generatedRowCount <= 0) return null

  const resolvedRowCount = counts.retainedRowCount + counts.rejectedRowCount
  if (resolvedRowCount <= 0) return null

  return counts.pendingRowCount === 0 && resolvedRowCount >= counts.generatedRowCount
    ? 'accepted'
    : 'weak'
}

function buildWbsTemplateCandidateOutcomeId(input: RecordWbsTemplateCandidateEventInput) {
  const identity = normalizeString(input.generationBatchId)
    ?? normalizeString(input.templateId)
    ?? normalizeString(input.attachUnderRowId)
    ?? 'unbatched'
  return `wbs-template-candidate:${input.projectId}:${input.surface}:${identity}`
}

function readRuntimePublicationKeyFromMetadata(metadata: Record<string, unknown>) {
  return normalizeString(metadata.runtimePublicationKey)
    ?? normalizeString(metadata.runtime_publication_key)
    ?? normalizeString(metadata.publicationKey)
    ?? normalizeString(metadata.publication_key)
}

function readMetadataText(metadata: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = normalizeString(metadata[key])
    if (value) return value
  }
  return null
}

function stableCodePrefix(stableCode: string | null) {
  if (!stableCode) return null
  const segments = stableCode.split('-').map((segment) => segment.trim()).filter(Boolean)
  if (segments.length <= 1) return stableCode
  return segments.slice(0, Math.max(1, segments.length - 1)).join('-')
}

function buildGenerationDepthPolicyReplayRequirements(gate: GenerationDepthPolicyScheduleTrustGate) {
  return uniqueValues([
    'row_count_within_generation_budget',
    'schedule_trust_gate_improves_or_stays_trusted',
    'dependency_anchors_stable',
    'no_parent_child_duration_conflict',
    gate.rowsMissingReferenceDuration > 0 ? 'duration_reference_days_complete' : '',
    gate.missingDescendantRollupRowCount > 0 ? 'descendant_rollup_evidence_complete' : '',
    gate.fallbackPolicyRowCount > 0 ? 'explicit_policy_match_replaces_fallback' : '',
  ])
}

function buildGenerationDepthReviewRows(gate: GenerationDepthPolicyScheduleTrustGate) {
  return (gate.reviewRows ?? []).slice(0, 20).map((row) => {
    const stableCode = normalizeString(row.stableCode)
    return {
      stableCode,
      stableCodePrefix: stableCodePrefix(stableCode),
      title: normalizeString(row.title),
      reasons: normalizeStringList(row.reasons),
      policyId: normalizeString(row.policyId),
      confidence: normalizeString(row.confidence),
    }
  })
}

async function persistGenerationDepthPolicyCandidateEvent(
  input: RecordWbsTemplateCandidateEventInput,
  gate: GenerationDepthPolicyScheduleTrustGate | null | undefined,
) {
  if (!gate || gate.source !== 'generation_depth_policy' || gate.status === 'trusted') return
  const companyId = normalizeString(input.companyId)
  if (!companyId) return

  const templateId = normalizeString(input.templateId) ?? 'unknown'
  const metadata = normalizeObject(input.metadata)
  const reviewRows = buildGenerationDepthReviewRows(gate)
  const templateGroup = readMetadataText(metadata, 'templateGroup', 'template_group')
  const packType = readMetadataText(metadata, 'packType', 'pack_type')
  const domainScope = readMetadataText(metadata, 'domainScope', 'domain_scope')

  try {
    await createAndPersistAlgorithmAssetCandidateEvent({
      assetKey: `generation_depth_policy.${templateId}.${input.surface}`,
      sourceSystem: 'wbsTemplateCandidateEventService',
      assetType: 'rule',
      companyId,
      projectId: input.projectId,
      candidatePayload: {
        assetType: 'generation_depth_policy',
        source: 'schedule_trust_gate',
        templateId,
        templateGroup,
        packType,
        domainScope,
        surface: input.surface,
        generationBatchId: normalizeString(input.generationBatchId),
        generationDepth: gate.generationDepth,
        status: gate.status,
        trustedForScheduling: gate.trustedForScheduling,
        reviewReasons: normalizeStringList(gate.reviewReasons),
        reviewRows,
        selectedNodeIds: Array.isArray(input.selectedNodeIds)
          ? input.selectedNodeIds.map((item) => normalizeString(item)).filter((item): item is string => Boolean(item))
          : [],
        suggestedMatchFields: reviewRows.map((row) => ({
          templateId,
          templateGroup,
          packType,
          domainScope,
          stableCode: row.stableCode,
          stableCodePrefix: row.stableCodePrefix,
        })),
        scheduleTrustGate: {
          totalScheduleRows: gate.totalScheduleRows,
          durationBearingScheduleRows: gate.durationBearingScheduleRows,
          fallbackPolicyRowCount: gate.fallbackPolicyRowCount,
          descendantRollupRequiredRowCount: gate.descendantRollupRequiredRowCount,
          descendantRollupAppliedRowCount: gate.descendantRollupAppliedRowCount,
          missingDescendantRollupRowCount: gate.missingDescendantRollupRowCount,
          rowsMissingReferenceDuration: gate.rowsMissingReferenceDuration,
          policyConfidenceCounts: normalizeObject(gate.policyConfidenceCounts),
        },
        candidatePolicy: 'candidate_only_no_runtime_mutation',
        releasePolicy: 'high_impact_structural_rule_manual_or_batch_review_required',
        replayRequirements: buildGenerationDepthPolicyReplayRequirements(gate),
        runtimeMutationBoundary: {
          writesTasks: false,
          writesTaskDependencies: false,
          writesBaselines: false,
          writesMonthlyPlans: false,
          writesDurationSeeds: false,
          writesCriticalPathFacts: false,
        },
        metadata,
      },
      learningTarget: 'template_structure',
      learningMaturity: 'governed_candidate',
      publishAnchor: 'manual_governance_required',
      automationMaturity: 'manual_required',
      requestedRuntimeEffect: 'candidate_only',
      generatedBy: 'service',
      queryExec: input.governanceQueryExec,
    })
  } catch (error) {
    logger.warn('[wbs-template-candidate] failed to persist generation depth policy candidate event', {
      projectId: input.projectId,
      companyId,
      templateId,
      surface: input.surface,
      generationBatchId: input.generationBatchId,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

// workspace-isolation-capability-write-approved: the exported boundary validates projectId and every outcome row stores that exact project scope.
async function recordSpecialWorkDurationPlanNetworkOutcome(
  input: RecordWbsTemplateCandidateEventInput,
  counts: WbsTemplateCandidateCounts,
  selectedNodeIds: string[],
  generatedEntityIds: string[],
) {
  const outcomeStatus = specialWorkDurationNetworkOutcomeStatus(counts)
  if (!outcomeStatus) return

  try {
    const table = supabase.from('duration_plan_network_outcomes')
    if (typeof table?.upsert !== 'function') return

    const metadata = normalizeObject(input.metadata)
    const generationBatchId = normalizeString(input.generationBatchId)
    const outcomeId = buildWbsTemplateCandidateOutcomeId(input)
    const { error } = await table.upsert({
      id: outcomeId,
      asset_key: SPECIAL_WORK_DURATION_SEED_ASSET_KEY,
      outcome_status: outcomeStatus,
      outcome_ref: generationBatchId
        ? `wbs_template_candidate_event:${generationBatchId}`
        : `wbs_template_candidate_event:${outcomeId}`,
      learning_scope: 'project',
      learning_scope_source: 'project_business_outcome_writer',
      company_id: normalizeString(input.companyId),
      project_id: input.projectId,
      publication_key: readRuntimePublicationKeyFromMetadata(metadata),
      metadata: {
        ...metadata,
        source: 'wbs_template_candidate_event',
        surface: input.surface,
        template_id: normalizeString(input.templateId),
        generation_batch_id: generationBatchId,
        selected_node_ids: selectedNodeIds,
        generated_entity_ids: generatedEntityIds,
        generated_row_count: counts.generatedRowCount,
        retained_row_count: counts.retainedRowCount,
        rejected_row_count: counts.rejectedRowCount,
        pending_row_count: counts.pendingRowCount,
        resolved_row_count: counts.retainedRowCount + counts.rejectedRowCount,
        acceptance_rate_basis: 'retained_rows_divided_by_generated_rows',
      },
      writes_runtime_directly: false,
      writes_fact_directly: false,
    }, { onConflict: 'id', ignoreDuplicates: false })

    if (error) {
      logger.warn('[wbs-template-candidate] failed to record special work duration network outcome', {
        projectId: input.projectId,
        surface: input.surface,
        generationBatchId: input.generationBatchId,
        error: error.message,
      })
    }
  } catch (error) {
    logger.warn('[wbs-template-candidate] skipped special work duration network outcome', {
      projectId: input.projectId,
      surface: input.surface,
      generationBatchId: input.generationBatchId,
      error: error instanceof Error ? error.message : String(error),
    })
  }
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

// workspace-isolation-capability-write-approved: the exported boundary validates projectId; both aggregation lookup and upsert bind that project id.
async function updateWbsTemplateCandidateAggregation(
  input: RecordWbsTemplateCandidateEventInput,
  counts: WbsTemplateCandidateCounts,
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
  counts: WbsTemplateCandidateCounts,
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

// workspace-isolation-capability-write-approved: authenticated task/baseline commits provide projectId and every candidate write below persists that exact scope.
export async function recordWbsTemplateCandidateEvent(input: RecordWbsTemplateCandidateEventInput): Promise<void> {
  try {
    const projectId = normalizeString(input.projectId)
    if (!projectId) {
      logger.warn('[wbs-template-candidate] skipped candidate event without project scope')
      return
    }
    const scopedInput = { ...input, projectId }
    const insert = supabase.from('wbs_template_candidate_events')?.insert
    if (typeof insert !== 'function') return

    const selectedNodeIds = Array.isArray(scopedInput.selectedNodeIds)
      ? scopedInput.selectedNodeIds.map((item) => String(item ?? '').trim()).filter(Boolean)
      : []
    const generatedEntityIds = (scopedInput.generatedEntityIds ?? [])
      .map((item) => String(item ?? '').trim())
      .filter(Boolean)
    const generatedRowCount = Number.isFinite(Number(scopedInput.generatedRowCount))
      ? Math.max(0, Math.round(Number(scopedInput.generatedRowCount)))
      : generatedEntityIds.length
    const retainedRowCount = readBoundedInteger(scopedInput.retainedRowCount, generatedEntityIds.length || generatedRowCount, generatedRowCount)
    const explicitRejected = scopedInput.rejectedRowCount !== undefined
      ? readBoundedInteger(scopedInput.rejectedRowCount, 0, generatedRowCount)
      : Math.max(0, generatedRowCount - retainedRowCount)
    const pendingRowCount = readBoundedInteger(scopedInput.pendingRowCount, 0, Math.max(0, generatedRowCount - retainedRowCount - explicitRejected))
    const rejectedRowCount = Math.min(explicitRejected, Math.max(0, generatedRowCount - retainedRowCount - pendingRowCount))

    const error = await insertCandidateEventWithSchemaFallback({
      project_id: scopedInput.projectId,
      surface: scopedInput.surface,
      event_type: 'template_generate_commit',
      generation_batch_id: normalizeString(scopedInput.generationBatchId),
      template_id: normalizeString(scopedInput.templateId),
      selected_node_ids: selectedNodeIds,
      scope: normalizeObject(scopedInput.scope),
      attach_under_row_id: normalizeString(scopedInput.attachUnderRowId),
      generated_row_count: generatedRowCount,
      retained_row_count: retainedRowCount,
      rejected_row_count: rejectedRowCount,
      pending_row_count: pendingRowCount,
      generated_entity_ids: generatedEntityIds,
      created_by: normalizeString(scopedInput.actorId),
      metadata: {
        ...normalizeObject(scopedInput.metadata),
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

    await updateWbsTemplateCandidateAggregation(scopedInput, {
      generatedRowCount,
      retainedRowCount,
      rejectedRowCount,
      pendingRowCount,
    })
    await recordSpecialWorkDurationPlanNetworkOutcome(scopedInput, {
      generatedRowCount,
      retainedRowCount,
      rejectedRowCount,
      pendingRowCount,
    }, selectedNodeIds, generatedEntityIds)
    await persistUnifiedAlgorithmAssetCandidateEvent(scopedInput, {
      generatedRowCount,
      retainedRowCount,
      rejectedRowCount,
      pendingRowCount,
    }, selectedNodeIds, generatedEntityIds)
    await persistGenerationDepthPolicyCandidateEvent(scopedInput, scopedInput.scheduleTrustGate)
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
  const runtimeConsumerObservationRef = normalizeString(input.runtimeConsumerObservationRef)
  const runtimeConsumerPublicationKey = normalizeString(input.runtimeConsumerPublicationKey)
  const rollbackTarget = normalizeString(input.rollbackTarget)
  const specialSeedPublicationWriterReady = Boolean(seedVersionId && runtimePublicationKey)
  const seedVersionLineageRecorded = Boolean(seedVersionId)
    && approvedCandidateEventIds.length > 0
    && generatedRowCount > 0
  const runtimeConsumerPublicationMismatched = Boolean(
    runtimeConsumerObservationRef
      && runtimePublicationKey
      && runtimeConsumerPublicationKey
      && runtimeConsumerPublicationKey !== runtimePublicationKey,
  )
  const runtimeConsumerObservationMatchesPublication = Boolean(
    runtimeConsumerObservationRef
      && runtimePublicationKey
      && runtimeConsumerPublicationKey
      && runtimeConsumerPublicationKey === runtimePublicationKey,
  )

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
    runtimeConsumerUsesPublishedArtifact: runtimeConsumerObservationMatchesPublication,
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
    missingReasons: uniqueValues([
      ...readiness.missingReasons,
      runtimeConsumerPublicationMismatched ? 'runtime_consumer_publication_mismatch' : '',
    ]),
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
