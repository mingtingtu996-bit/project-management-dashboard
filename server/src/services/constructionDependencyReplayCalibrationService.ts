import { query as rawQuery } from '../database.js'
import {
  V1475_CROSS_ITEM_WORKFLOW_SEED,
  type V1475CrossItemWorkflowRule,
} from '../seeds/v1475CrossItemWorkflowSeed.js'
import {
  V1475_EXPLICIT_BUSINESS_GATE_SOURCE_ID,
  V1475_EXPLICIT_BUSINESS_GATE_TEMPLATES,
} from '../seeds/v1475DependencyIntentTemplates.js'
import { delayDayDelta, inclusiveDurationDays } from '../utils/durationDays.js'
import { logger } from '../middleware/logger.js'
import {
  isAuthoritativeConstructionCalendar,
  type ConstructionCalendarContext,
} from './constructionCalendar.js'
import { createAndPersistAlgorithmAssetCandidateEvent } from './algorithmAssetCandidateEventAdapterService.js'
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

type QueryRows = <T = Record<string, unknown>>(sql: string, params?: unknown[]) => Promise<T[]>

export type ConstructionDependencyReplayLayer =
  | 'cross_item_workflow'
  | 'cross_business_domain_dependency_intent'
  | 'unmatched'

export type ConstructionDependencyReplayStatus =
  | 'validated'
  | 'needs_lag_calibration'
  | 'actual_order_conflict'
  | 'insufficient_actual_dates'
  | 'unmatched_seed'

export type ConstructionDependencyReplayRecommendation =
  | 'keep_seed_rule'
  | 'review_nonzero_lag_or_condition_profile'
  | 'quarantine_or_manual_review'
  | 'collect_actual_date_evidence'
  | 'map_dependency_to_l3_or_l4_seed'

export interface ConstructionDependencyReplayRow {
  id: string
  project_id: string
  dependency_type?: string | null
  lag_days?: number | string | null
  source_type?: string | null
  metadata?: unknown
  predecessor_task_id?: string | null
  predecessor_task_code?: string | null
  predecessor_standard_work_code?: string | null
  predecessor_template_node_id?: string | null
  predecessor_title?: string | null
  predecessor_standard_task_metadata?: unknown
  predecessor_actual_start_date?: string | null
  predecessor_actual_end_date?: string | null
  successor_task_id?: string | null
  successor_task_code?: string | null
  successor_standard_work_code?: string | null
  successor_template_node_id?: string | null
  successor_title?: string | null
  successor_standard_task_metadata?: unknown
  successor_actual_start_date?: string | null
  successor_actual_end_date?: string | null
}

export interface ConstructionDependencyReplayItem {
  dependencyId: string
  projectId: string
  matchedLayer: ConstructionDependencyReplayLayer
  matchedSeedCode: string | null
  dependencyType: 'FS' | 'SS' | 'FF' | 'SF'
  dependencyLagDays: number
  seedLagDays: number | null
  observedWaitDays: number | null
  replayStatus: ConstructionDependencyReplayStatus
  recommendation: ConstructionDependencyReplayRecommendation
  runtimePublicationKey?: string | null
  runtimePublicationArtifactKey?: string | null
  runtimePublicationStage?: string | null
  runtimePublicationSelectionBasis?: string | null
  predecessor: {
    taskId: string | null
    taskCode: string | null
    title: string | null
    actualStartDate: string | null
    actualEndDate: string | null
  }
  successor: {
    taskId: string | null
    taskCode: string | null
    title: string | null
    actualStartDate: string | null
    actualEndDate: string | null
  }
  evidence: {
    sourceType: string | null
    sourceSeedRuleIds: string[]
    matchBasis: string
    calibrationPolicy: string
  }
}

export interface ConstructionDependencyReplayQueueItem {
  matchedLayer: ConstructionDependencyReplayLayer
  matchedSeedCode: string
  predecessorStableCode?: string | null
  successorStableCode?: string | null
  dependencyType?: 'FS' | 'SS' | 'FF' | 'SF'
  runtimePublicationKey?: string | null
  runtimePublicationArtifactKey?: string | null
  runtimePublicationStage?: string | null
  runtimePublicationSelectionBasis?: string | null
  sampleCount: number
  projectCount: number
  conflictCount: number
  seedLagDays: number | null
  medianObservedWaitDays: number | null
  suggestedLagDays: number | null
  queueStatus: 'manual_review_required' | 'quarantine_review_required' | 'evidence_collection_required'
  recommendation: ConstructionDependencyReplayRecommendation
  promotionPolicy: string
  sampleDependencyIds: string[]
  inputTaskIds?: string[]
  projectIds: string[]
  replayPassCount?: number
  qualityConsistentCount?: number
  observationStartedAt?: string | null
  observationEndedAt?: string | null
  observationWindowDays?: number
}

type DependencyTrustedRuntimeConsumptionRow = {
  consumption_key?: unknown
  company_id?: unknown
  project_id?: unknown
  publication_key?: unknown
  asset_key?: unknown
  artifact_key?: unknown
  task_id?: unknown
  baseline_item_id?: unknown
  generation_batch_id?: unknown
  source_evidence_refs?: unknown
  consumption_context?: unknown
  publication_stage?: unknown
  monitoring_status?: unknown
  publication_scope_level?: unknown
  publication_company_id?: unknown
  publication_project_id?: unknown
  publication_industry_key?: unknown
}

type DependencyRuntimeConsumptionLineage = {
  publicationKey: string
  artifactKey: string
  generationBatchId: string
  inputTaskIds: string[]
  consumptionKeys: string[]
  sourceEvidenceRefs: string[]
  publicationStage: string
}

export interface ConstructionDependencyReplayCalibrationReport {
  reportCode: 'construction_dependency_replay_calibration'
  generatedAt: string
  governancePolicy: {
    replayMode: 'report_only'
    seedWritePolicy: 'never_write_seed_from_replay'
    taskDependencyWritePolicy: 'never_write_task_dependencies_from_replay'
    promotionPolicy: 'manual_seed_review_required'
  }
  summary: {
    inputDependencyCount: number
    matchedDependencyCount: number
    comparableActualDateCount: number
    l3MatchedDependencyCount: number
    l4MatchedDependencyCount: number
    validatedDependencyCount: number
    reviewRequiredDependencyCount: number
    conflictDependencyCount: number
    insufficientActualDateCount: number
    unmatchedSeedCount: number
  }
  calibrationQueues: {
    l3LagCalibrationCandidates: ConstructionDependencyReplayQueueItem[]
    l4ConflictQuarantineCandidates: ConstructionDependencyReplayQueueItem[]
    evidenceCollectionCandidates: ConstructionDependencyReplayQueueItem[]
    dependencyRuleGapCandidates?: ConstructionDependencyReplayQueueItem[]
  }
  items: ConstructionDependencyReplayItem[]
}

export interface CollectConstructionDependencyReplayCalibrationOptions {
  projectIds?: string[]
  maxSamples?: number
  zeroLagReviewThresholdDays?: number
  constructionCalendar?: ConstructionCalendarContext | null
  queryRows?: QueryRows
}

export interface CollectAndPersistConstructionDependencyReplayCalibrationCandidatesOptions
  extends CollectConstructionDependencyReplayCalibrationOptions {
  companyId?: string | null
  maxCandidateEvents?: number
  queryExec?: AlgorithmAssetGovernanceQueryExec
}

export interface PersistConstructionDependencyReplayCalibrationCandidatesFromReportOptions
  extends Pick<CollectAndPersistConstructionDependencyReplayCalibrationCandidatesOptions, 'companyId' | 'maxCandidateEvents' | 'queryExec' | 'constructionCalendar'> {
  report: ConstructionDependencyReplayCalibrationReport
  projectId: string
}

export type ConstructionDependencyRuleLearningScopeEvidence =
  | 'global'
  | 'industry'
  | 'company'
  | 'project'
  | 'system'
  | 'industry_baseline'
  | 'segment_baseline'
  | string

export interface ConstructionDependencyRuleCandidateLiveLearningEvidenceInput {
  replayReport: ConstructionDependencyReplayCalibrationReport
  dependencyOutcomeEventRecorded: boolean
  approvedDependencyRuleCandidateRecorded: boolean
  enabledLearningScopes: readonly ConstructionDependencyRuleLearningScopeEvidence[]
  runtimeConsumerUsesPublishedArtifact: boolean
  dependencyRulePublicationWriterReady: boolean
  dependencyRuleLineageRecorded: boolean
  releaseExitApproved: boolean
  impactMonitoringReady: boolean
  rollbackTargetReady: boolean
  accuracyMetricsAvailable: boolean
}

export interface ConstructionDependencyRuleCandidateLiveLearningEvidence {
  assetClassificationRegistered: true
  predictionEventRecorded: boolean
  actualOutcomeEventRecorded: boolean
  tieredLearningPolicyRegistered: boolean
  enabledLearningScopes: Array<'global' | 'industry' | 'company' | 'project'>
  runtimeConsumerUsesPublishedArtifact: boolean
  replayReportOnly: boolean
  dependencyWritePolicyPreserved: boolean
  dependencyRuleCandidatePresent: boolean
  approvedDependencyRuleCandidateRecorded: boolean
  dependencyRulePublicationWriterReady: boolean
  dependencyRuleLineageRecorded: boolean
  releaseExitApproved: boolean
  impactMonitoringReady: boolean
  rollbackTargetReady: boolean
  accuracyMetricsAvailable: boolean
  comparableActualDateCount: number
}

export interface ConstructionDependencyRuleCandidateLiveLearningEvidenceDecision {
  status: 'dependency_rule_candidate_live_learning_ready' | 'dependency_rule_candidate_live_learning_not_ready'
  liveLearningEvidence: ConstructionDependencyRuleCandidateLiveLearningEvidence
  missingReasons: string[]
}

export interface ConstructionDependencyRulePublicationReadinessInput {
  replayReport: ConstructionDependencyReplayCalibrationReport
  dependencyOutcomeEventRecorded: boolean
  approvedCandidateEventIds: readonly string[]
  dependencyRuleVersionId?: string | null
  runtimePublicationKey?: string | null
  runtimeConsumerObservationRef?: string | null
  runtimeConsumerPublicationKey?: string | null
  rollbackTarget?: string | null
  enabledLearningScopes: readonly ConstructionDependencyRuleLearningScopeEvidence[]
  releaseExitApproved: boolean
  impactMonitoringReady: boolean
  accuracyMetricsAvailable: boolean
}

export interface ConstructionDependencyRulePublicationReadinessFromProductionRowsInput {
  replayReport: ConstructionDependencyReplayCalibrationReport
  approvedCandidateEventIds: readonly string[]
  enabledLearningScopes: readonly ConstructionDependencyRuleLearningScopeEvidence[]
  sourceRows?: readonly DurationLiveLearningProductionEvidenceSourceRow[]
  records?: readonly DurationLiveLearningProductionEvidenceRecord[]
}

export interface ConstructionDependencyRuleLineage {
  assetType: 'dependency_rule_candidate'
  dependencyRuleVersionId: string | null
  runtimePublicationKey: string | null
  rollbackTarget: string | null
  approvedCandidateEventIds: string[]
  sourceDependencyIds: string[]
  matchedSeedCodes: string[]
  replayReportCode: ConstructionDependencyReplayCalibrationReport['reportCode']
  comparableActualDateCount: number
}

export interface ConstructionDependencyRuleProductionLineage {
  evidenceRefs: DurationLiveLearningProductionEvidenceRef
  rejectedRows: DurationLiveLearningRejectedProductionEvidenceSourceRow[]
  rejectedRecords: DurationLiveLearningRejectedProductionEvidenceRecord[]
}

export interface ConstructionDependencyRulePublicationReadiness {
  status: 'dependency_rule_publication_ready' | 'dependency_rule_publication_not_ready'
  liveLearningEvidence: ConstructionDependencyRuleCandidateLiveLearningEvidence
  dependencyRuleLineage: ConstructionDependencyRuleLineage
  missingReasons: string[]
}

export type ConstructionDependencyRuleProductionPublicationReadiness =
  ConstructionDependencyRulePublicationReadiness & {
    productionLineage: ConstructionDependencyRuleProductionLineage
  }

const DEFAULT_MAX_SAMPLES = 200
const DEFAULT_ZERO_LAG_REVIEW_THRESHOLD_DAYS = 2
const DEPENDENCY_RULE_CANDIDATE_ASSET_KEY = 'dependency_rule_candidate'
const DEPENDENCY_RULE_ACCEPTED_SAMPLE_THRESHOLD = 3

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

function normalizeNullableText(value: unknown): string | null {
  const normalized = normalizeText(value)
  return normalized || null
}

function normalizeUpper(value: unknown) {
  return normalizeText(value).toUpperCase()
}

function normalizeLower(value: unknown) {
  return normalizeText(value).toLowerCase()
}

function uniqueValues<T extends string>(values: T[]): T[] {
  return [...new Set(values.filter(Boolean))]
}

function dependencyRuleObservationMatchesPublication(
  evidenceRefs: DurationLiveLearningProductionEvidenceRef,
) {
  const publicationKey = normalizeNullableText(evidenceRefs.publicationExecutionRef)
  const observedPublicationKey = normalizeNullableText(evidenceRefs.runtimeConsumerPublicationKey)
  return Boolean(publicationKey)
    && Boolean(observedPublicationKey)
    && (
      publicationKey === observedPublicationKey
      || publicationKey.endsWith(`:${observedPublicationKey}`)
    )
}

function dependencyRuleRuntimePublicationKeyFromExecutionRef(value: unknown) {
  const executionRef = normalizeNullableText(value)
  if (!executionRef) return null
  const prefix = 'duration_learning_runtime_publications:'
  return executionRef.startsWith(prefix) ? executionRef.slice(prefix.length) : executionRef
}

function normalizeStringList(values: readonly unknown[] | undefined): string[] {
  return uniqueValues((values ?? []).map((value) => normalizeText(value)).filter(Boolean))
}

function readRowText(row: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = row[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return ''
}

function findCurrentPublishedDependencyRuleVersionId(
  sourceRows: readonly DurationLiveLearningProductionEvidenceSourceRow[] | undefined,
) {
  for (const source of sourceRows ?? []) {
    if (source.sourceTable !== 'duration_learning_runtime_publications') continue
    const row = source.row
    const dependencyRuleVersionId = readRowText(row, 'artifact_key', 'artifactKey')
    if (
      dependencyRuleVersionId
      && readRowText(row, 'publication_key', 'publicationKey')
      && readRowText(row, 'asset_key', 'assetKey') === DEPENDENCY_RULE_CANDIDATE_ASSET_KEY
      && ['canary', 'stable'].includes(readRowText(row, 'publication_stage', 'publicationStage'))
    ) {
      return dependencyRuleVersionId
    }
  }
  return null
}

function dependencyRuleProductionLineageFromProductionInput(
  input: Pick<ConstructionDependencyRulePublicationReadinessFromProductionRowsInput, 'sourceRows' | 'records'>,
): ConstructionDependencyRuleProductionLineage {
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
    evidence.assetKey === DEPENDENCY_RULE_CANDIDATE_ASSET_KEY)
    ?? { assetKey: DEPENDENCY_RULE_CANDIDATE_ASSET_KEY }

  return {
    evidenceRefs,
    rejectedRows: rowCollection.rejectedRows,
    rejectedRecords: [
      ...evidenceCollection.rejectedRecords,
      ...directRecordCollection.rejectedRecords,
    ],
  }
}

const CONSTRUCTION_DEPENDENCY_RULE_LEARNING_SCOPE_ORDER = ['global', 'industry', 'company', 'project'] as const

function normalizeConstructionDependencyRuleLearningScopes(
  scopes: readonly ConstructionDependencyRuleLearningScopeEvidence[] | undefined,
): Array<typeof CONSTRUCTION_DEPENDENCY_RULE_LEARNING_SCOPE_ORDER[number]> {
  const normalized = new Set<typeof CONSTRUCTION_DEPENDENCY_RULE_LEARNING_SCOPE_ORDER[number]>()
  for (const scope of scopes ?? []) {
    const value = normalizeLower(scope)
    if (value === 'system' || value === 'global') normalized.add('global')
    if (value === 'industry' || value === 'industry_baseline' || value === 'segment_baseline') normalized.add('industry')
    if (value === 'company') normalized.add('company')
    if (value === 'project') normalized.add('project')
  }
  return CONSTRUCTION_DEPENDENCY_RULE_LEARNING_SCOPE_ORDER.filter((scope) => normalized.has(scope))
}

function normalizeDependencyType(value: unknown): 'FS' | 'SS' | 'FF' | 'SF' {
  const text = normalizeUpper(value)
  return ['FS', 'SS', 'FF', 'SF'].includes(text) ? text as 'FS' | 'SS' | 'FF' | 'SF' : 'FS'
}

function normalizeLagDays(value: unknown) {
  const days = Number(value)
  return Number.isFinite(days) ? Math.trunc(days) : 0
}

function readRecord(value: unknown): Record<string, unknown> {
  if (typeof value === 'string') {
    try {
      return readRecord(JSON.parse(value))
    } catch {
      return {}
    }
  }
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function readStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return Array.from(new Set(value.map(normalizeText).filter(Boolean)))
  const text = normalizeText(value)
  return text ? [text] : []
}

function taskMetadataCodes(metadata: unknown) {
  const record = readRecord(metadata)
  const generationFacts = readRecord(record.projectGenerationFacts ?? record.project_generation_facts)
  return [
    record.stableCode,
    record.stable_code,
    record.taskCode,
    record.task_code,
    record.standardWorkCode,
    record.standard_work_code,
    record.templateNodeId,
    record.template_node_id,
    generationFacts.stableCode,
    generationFacts.stable_code,
  ].map(normalizeText).filter(Boolean)
}

function predecessorCodes(row: ConstructionDependencyReplayRow) {
  return Array.from(new Set([
    row.predecessor_task_code,
    row.predecessor_standard_work_code,
    row.predecessor_template_node_id,
    ...taskMetadataCodes(row.predecessor_standard_task_metadata),
  ].map(normalizeText).filter(Boolean)))
}

function successorCodes(row: ConstructionDependencyReplayRow) {
  return Array.from(new Set([
    row.successor_task_code,
    row.successor_standard_work_code,
    row.successor_template_node_id,
    ...taskMetadataCodes(row.successor_standard_task_metadata),
  ].map(normalizeText).filter(Boolean)))
}

function startsWithAnyPrefix(codes: string[], prefixes: string[]) {
  const normalizedCodes = codes.map(normalizeUpper).filter(Boolean)
  return prefixes.some((prefix) => {
    const normalizedPrefix = normalizeUpper(prefix)
    return normalizedPrefix && normalizedCodes.some((code) => code.startsWith(normalizedPrefix))
  })
}

function matchesPattern(codes: string[], pattern: RegExp) {
  return codes.some((code) => pattern.test(code))
}

function readMetadata(row: ConstructionDependencyReplayRow) {
  return readRecord(row.metadata)
}

function readRuntimePublicationLineage(row: ConstructionDependencyReplayRow) {
  const metadata = readMetadata(row)
  const runtimePublicationKey = normalizeNullableText(metadata.publicationKey ?? metadata.publication_key)
  return {
    runtimePublicationKey,
    runtimePublicationArtifactKey: runtimePublicationKey
      ? normalizeNullableText(metadata.artifactKey ?? metadata.artifact_key)
      : null,
    runtimePublicationStage: runtimePublicationKey
      ? normalizeNullableText(metadata.publicationStage ?? metadata.publication_stage)
      : null,
    runtimePublicationSelectionBasis: runtimePublicationKey
      ? normalizeNullableText(metadata.selectionBasis ?? metadata.selection_basis)
      : null,
  }
}

function readSourceSeedRuleIds(row: ConstructionDependencyReplayRow) {
  const metadata = readMetadata(row)
  return Array.from(new Set([
    ...readStringArray(metadata.sourceSeedRuleIds ?? metadata.source_seed_rule_ids),
    ...readStringArray(metadata.seedRuleId ?? metadata.seed_rule_id),
    ...readStringArray(metadata.intentCode ?? metadata.intent_code),
  ]))
}

function findL3Rule(row: ConstructionDependencyReplayRow) {
  const metadataSeedIds = new Set(readSourceSeedRuleIds(row))
  const activeRules = V1475_CROSS_ITEM_WORKFLOW_SEED.filter((rule) => rule.isActive !== false)
  const explicit = activeRules.find((rule) => metadataSeedIds.has(rule.stableCode))
  if (explicit) return { rule: explicit, matchBasis: 'metadata_seed_rule_id' }

  const predecessor = predecessorCodes(row)
  const successor = successorCodes(row)
  const prefixMatched = activeRules.find((rule) => (
    startsWithAnyPrefix(predecessor, rule.predecessorCodePrefixes)
    && startsWithAnyPrefix(successor, rule.successorCodePrefixes)
  ))
  return prefixMatched ? { rule: prefixMatched, matchBasis: 'stable_code_prefix_match' } : null
}

function findL4Template(row: ConstructionDependencyReplayRow) {
  const metadata = readMetadata(row)
  const sourceSeedRuleIds = readSourceSeedRuleIds(row)
  const metadataTemplateCode = normalizeText(metadata.explicitBusinessGateTemplateCode ?? metadata.explicit_business_gate_template_code ?? metadata.templateCode ?? metadata.template_code)
  const byCode = V1475_EXPLICIT_BUSINESS_GATE_TEMPLATES.find((template) => template.templateCode === metadataTemplateCode)
  if (byCode) return { template: byCode, matchBasis: 'metadata_explicit_business_gate_template_code' }

  const hasExplicitSource = sourceSeedRuleIds.includes(V1475_EXPLICIT_BUSINESS_GATE_SOURCE_ID)
    || metadata.explicitBusinessGateTemplate === true
    || metadata.explicit_business_gate_template === true
    || normalizeText(row.source_type).includes('dependency_intent')
  const predecessor = predecessorCodes(row)
  const successor = successorCodes(row)
  const patternMatched = V1475_EXPLICIT_BUSINESS_GATE_TEMPLATES.find((template) => (
    matchesPattern(predecessor, template.fromReferencedCodePattern)
    && matchesPattern(successor, template.toReferencedCodePattern)
  ))
  if (patternMatched) {
    return {
      template: patternMatched,
      matchBasis: hasExplicitSource ? 'explicit_l4_source_and_referenced_code_pattern' : 'referenced_code_pattern',
    }
  }
  return null
}

function observedWaitDays(
  row: ConstructionDependencyReplayRow,
  dependencyType: ConstructionDependencyReplayItem['dependencyType'],
  constructionCalendar?: ConstructionCalendarContext | null,
) {
  if (dependencyType === 'SS') {
    return delayDayDelta(row.predecessor_actual_start_date, row.successor_actual_start_date, constructionCalendar)
  }
  if (dependencyType === 'FF') {
    return delayDayDelta(row.predecessor_actual_end_date, row.successor_actual_end_date, constructionCalendar)
  }
  if (dependencyType === 'SF') {
    return delayDayDelta(row.predecessor_actual_start_date, row.successor_actual_end_date, constructionCalendar)
  }
  return delayDayDelta(row.predecessor_actual_end_date, row.successor_actual_start_date, constructionCalendar)
}

function classifyReplay(params: {
  matchedLayer: ConstructionDependencyReplayLayer
  observedWaitDays: number | null
  dependencyLagDays: number
  seedLagDays: number | null
  zeroLagReviewThresholdDays: number
}): Pick<ConstructionDependencyReplayItem, 'replayStatus' | 'recommendation'> {
  if (params.matchedLayer === 'unmatched') {
    return {
      replayStatus: 'unmatched_seed',
      recommendation: 'map_dependency_to_l3_or_l4_seed',
    }
  }
  if (params.observedWaitDays == null || params.seedLagDays == null) {
    return {
      replayStatus: 'insufficient_actual_dates',
      recommendation: 'collect_actual_date_evidence',
    }
  }
  if (params.observedWaitDays < params.seedLagDays) {
    return {
      replayStatus: 'actual_order_conflict',
      recommendation: 'quarantine_or_manual_review',
    }
  }
  if (
    params.matchedLayer === 'cross_item_workflow'
    && params.dependencyLagDays === 0
    && params.observedWaitDays >= params.zeroLagReviewThresholdDays
  ) {
    return {
      replayStatus: 'needs_lag_calibration',
      recommendation: 'review_nonzero_lag_or_condition_profile',
    }
  }
  return {
    replayStatus: 'validated',
    recommendation: 'keep_seed_rule',
  }
}

function median(values: number[]) {
  if (values.length === 0) return null
  const sorted = [...values].sort((left, right) => left - right)
  return sorted[Math.floor(sorted.length / 2)] ?? null
}

function groupQueueItems(
  items: ConstructionDependencyReplayItem[],
  filter: (item: ConstructionDependencyReplayItem) => boolean,
  buildStatus: (groupItems: ConstructionDependencyReplayItem[]) => Pick<ConstructionDependencyReplayQueueItem, 'queueStatus' | 'recommendation' | 'promotionPolicy'>,
) {
  const groups = new Map<string, ConstructionDependencyReplayItem[]>()
  for (const item of items) {
    if (!filter(item) || !item.matchedSeedCode || item.matchedLayer === 'unmatched') continue
    const key = [
      item.matchedLayer,
      item.matchedSeedCode,
      item.runtimePublicationKey ?? 'cold-start-or-manual',
      item.runtimePublicationArtifactKey ?? 'no-artifact',
    ].join(':')
    const group = groups.get(key) ?? []
    group.push(item)
    groups.set(key, group)
  }

  return Array.from(groups.values()).map((groupItems) => {
    const first = groupItems[0]
    const observedWaits = groupItems
      .map((item) => item.observedWaitDays)
      .filter((value): value is number => value != null)
    const medianObservedWaitDays = median(observedWaits)
    const conflictCount = groupItems.filter((item) => item.replayStatus === 'actual_order_conflict').length
    const status = buildStatus(groupItems)
    const observationDates = groupItems.flatMap((item) => [
      item.predecessor.actualEndDate,
      item.successor.actualStartDate,
    ])
      .map((value) => {
        const parsed = new Date(normalizeText(value))
        return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null
      })
      .filter((value): value is string => Boolean(value))
      .sort()
    const observationStartedAt = observationDates[0] ?? null
    const observationEndedAt = observationDates[observationDates.length - 1] ?? null

    return {
      matchedLayer: first.matchedLayer as Exclude<ConstructionDependencyReplayLayer, 'unmatched'>,
      matchedSeedCode: first.matchedSeedCode ?? '',
      predecessorStableCode: first.predecessor.taskCode,
      successorStableCode: first.successor.taskCode,
      dependencyType: first.dependencyType,
      runtimePublicationKey: first.runtimePublicationKey ?? null,
      runtimePublicationArtifactKey: first.runtimePublicationArtifactKey ?? null,
      runtimePublicationStage: first.runtimePublicationStage ?? null,
      runtimePublicationSelectionBasis: first.runtimePublicationSelectionBasis ?? null,
      sampleCount: groupItems.length,
      projectCount: new Set(groupItems.map((item) => item.projectId).filter(Boolean)).size,
      conflictCount,
      seedLagDays: first.seedLagDays,
      medianObservedWaitDays,
      suggestedLagDays: status.queueStatus === 'manual_review_required' && medianObservedWaitDays != null
        ? Math.max(first.seedLagDays ?? 0, medianObservedWaitDays)
        : null,
      ...status,
      sampleDependencyIds: groupItems.map((item) => item.dependencyId).filter(Boolean).slice(0, 20),
      inputTaskIds: uniqueValues(groupItems.flatMap((item) => [
        item.predecessor.taskId ?? '',
        item.successor.taskId ?? '',
      ])).sort(),
      projectIds: Array.from(new Set(groupItems.map((item) => item.projectId).filter(Boolean))).slice(0, 20),
      replayPassCount: groupItems.filter((item) => (
        item.observedWaitDays != null && item.replayStatus !== 'actual_order_conflict'
      )).length,
      qualityConsistentCount: groupItems.filter((item) => Boolean(
        item.predecessor.taskId
          && item.successor.taskId
          && item.predecessor.taskCode
          && item.successor.taskCode,
      )).length,
      observationStartedAt,
      observationEndedAt,
      observationWindowDays: observationStartedAt && observationEndedAt
        ? inclusiveDurationDays(observationStartedAt, observationEndedAt) ?? 0
        : 0,
    }
  }).sort((left, right) => {
    if (right.sampleCount !== left.sampleCount) return right.sampleCount - left.sampleCount
    if (right.conflictCount !== left.conflictCount) return right.conflictCount - left.conflictCount
    return left.matchedSeedCode.localeCompare(right.matchedSeedCode)
  })
}

function buildCalibrationQueues(items: ConstructionDependencyReplayItem[]) {
  return {
    l3LagCalibrationCandidates: groupQueueItems(
      items,
      (item) => item.matchedLayer === 'cross_item_workflow' && item.replayStatus === 'needs_lag_calibration',
      () => ({
        queueStatus: 'manual_review_required',
        recommendation: 'review_nonzero_lag_or_condition_profile',
        promotionPolicy: 'Manual seed review required before changing L3 lagDays, strength, or conditionalLagProfiles; replay never writes cross_item_workflow seeds directly.',
      }),
    ),
    l4ConflictQuarantineCandidates: groupQueueItems(
      items,
      (item) => item.matchedLayer === 'cross_business_domain_dependency_intent' && item.replayStatus === 'actual_order_conflict',
      () => ({
        queueStatus: 'quarantine_review_required',
        recommendation: 'quarantine_or_manual_review',
        promotionPolicy: 'Quarantine or manually review L4 template/scope mapping before continuing to trust this business gate in runtime suggestions.',
      }),
    ),
    evidenceCollectionCandidates: groupQueueItems(
      items,
      (item) => item.replayStatus === 'insufficient_actual_dates',
      () => ({
        queueStatus: 'evidence_collection_required',
        recommendation: 'collect_actual_date_evidence',
        promotionPolicy: 'Collect actual start/end, acceptance/handover, and dependency edit evidence before considering seed promotion or quarantine.',
      }),
    ),
    dependencyRuleGapCandidates: buildDependencyRuleGapCandidates(items),
  }
}

function buildDependencyRuleGapCandidates(items: ConstructionDependencyReplayItem[]) {
  const groups = new Map<string, ConstructionDependencyReplayItem[]>()
  for (const item of items) {
    if (item.matchedLayer !== 'unmatched') continue
    if (normalizeLower(item.evidence.sourceType) !== 'manual') continue
    const predecessorCode = normalizeUpper(item.predecessor.taskCode)
    const successorCode = normalizeUpper(item.successor.taskCode)
    if (!predecessorCode || !successorCode) continue
    const candidateKey = `candidate:${predecessorCode}->${successorCode}:${item.dependencyType}`
    groups.set(candidateKey, [...(groups.get(candidateKey) ?? []), item])
  }

  return [...groups.entries()].map(([candidateKey, groupItems]) => {
    const observedWaits = groupItems
      .map((item) => item.observedWaitDays)
      .filter((value): value is number => value != null)
    const observationDates = groupItems.flatMap((item) => [
      item.predecessor.actualEndDate,
      item.successor.actualStartDate,
    ])
      .map((value) => {
        const parsed = new Date(normalizeText(value))
        return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null
      })
      .filter((value): value is string => Boolean(value))
      .sort()
    const observationStartedAt = observationDates[0] ?? null
    const observationEndedAt = observationDates[observationDates.length - 1] ?? null
    return {
      matchedLayer: 'unmatched' as const,
      matchedSeedCode: candidateKey,
      predecessorStableCode: groupItems[0]?.predecessor.taskCode ?? null,
      successorStableCode: groupItems[0]?.successor.taskCode ?? null,
      dependencyType: groupItems[0]?.dependencyType ?? 'FS',
      runtimePublicationKey: groupItems[0]?.runtimePublicationKey ?? null,
      runtimePublicationArtifactKey: groupItems[0]?.runtimePublicationArtifactKey ?? null,
      runtimePublicationStage: groupItems[0]?.runtimePublicationStage ?? null,
      runtimePublicationSelectionBasis: groupItems[0]?.runtimePublicationSelectionBasis ?? null,
      sampleCount: groupItems.length,
      projectCount: new Set(groupItems.map((item) => item.projectId).filter(Boolean)).size,
      conflictCount: 0,
      seedLagDays: null,
      medianObservedWaitDays: median(observedWaits),
      suggestedLagDays: median(observedWaits),
      queueStatus: 'evidence_collection_required' as const,
      recommendation: 'map_dependency_to_l3_or_l4_seed' as const,
      promotionPolicy: 'Aggregate manual dependency corrections by stable predecessor/successor code, then require replay, conflict checks, canary, monitoring, and rollback before publishing a reusable rule.',
      sampleDependencyIds: groupItems.map((item) => item.dependencyId).filter(Boolean).slice(0, 20),
      inputTaskIds: uniqueValues(groupItems.flatMap((item) => [
        item.predecessor.taskId ?? '',
        item.successor.taskId ?? '',
      ])).sort(),
      projectIds: Array.from(new Set(groupItems.map((item) => item.projectId).filter(Boolean))).slice(0, 20),
      replayPassCount: groupItems.filter((item) => item.observedWaitDays != null).length,
      qualityConsistentCount: groupItems.filter((item) => Boolean(
        item.predecessor.taskId
          && item.successor.taskId
          && item.predecessor.taskCode
          && item.successor.taskCode,
      )).length,
      observationStartedAt,
      observationEndedAt,
      observationWindowDays: observationStartedAt && observationEndedAt
        ? inclusiveDurationDays(observationStartedAt, observationEndedAt) ?? 0
        : 0,
    }
  }).sort((left, right) => (
    right.sampleCount - left.sampleCount
      || left.matchedSeedCode.localeCompare(right.matchedSeedCode)
  ))
}

function buildReplayItem(
  row: ConstructionDependencyReplayRow,
  options: {
    zeroLagReviewThresholdDays: number
    constructionCalendar?: ConstructionCalendarContext | null
  },
): ConstructionDependencyReplayItem {
  const dependencyType = normalizeDependencyType(row.dependency_type)
  const l4Match = findL4Template(row)
  const l3Match = l4Match ? null : findL3Rule(row)
  const matchedLayer: ConstructionDependencyReplayLayer = l4Match
    ? 'cross_business_domain_dependency_intent'
    : l3Match
      ? 'cross_item_workflow'
      : 'unmatched'
  const seedLagDays = l4Match?.template.lagDays ?? l3Match?.rule.lagDays ?? null
  const dependencyLagDays = normalizeLagDays(row.lag_days)
  const waitDays = observedWaitDays(row, dependencyType, options.constructionCalendar)
  const replay = classifyReplay({
    matchedLayer,
    observedWaitDays: waitDays,
    dependencyLagDays,
    seedLagDays,
    zeroLagReviewThresholdDays: options.zeroLagReviewThresholdDays,
  })
  const sourceSeedRuleIds = readSourceSeedRuleIds(row)
  const runtimePublicationLineage = readRuntimePublicationLineage(row)
  const matchedSeedCode = l4Match?.template.templateCode ?? l3Match?.rule.stableCode ?? null
  const l3Rule: V1475CrossItemWorkflowRule | null = l3Match?.rule ?? null

  return {
    dependencyId: normalizeText(row.id),
    projectId: normalizeText(row.project_id),
    matchedLayer,
    matchedSeedCode,
    dependencyType,
    dependencyLagDays,
    seedLagDays,
    observedWaitDays: waitDays,
    ...replay,
    ...runtimePublicationLineage,
    predecessor: {
      taskId: normalizeText(row.predecessor_task_id) || null,
      taskCode: predecessorCodes(row)[0] ?? null,
      title: normalizeText(row.predecessor_title) || null,
      actualStartDate: normalizeText(row.predecessor_actual_start_date) || null,
      actualEndDate: normalizeText(row.predecessor_actual_end_date) || null,
    },
    successor: {
      taskId: normalizeText(row.successor_task_id) || null,
      taskCode: successorCodes(row)[0] ?? null,
      title: normalizeText(row.successor_title) || null,
      actualStartDate: normalizeText(row.successor_actual_start_date) || null,
      actualEndDate: normalizeText(row.successor_actual_end_date) || null,
    },
    evidence: {
      sourceType: normalizeText(row.source_type) || null,
      sourceSeedRuleIds,
      matchBasis: l4Match?.matchBasis ?? l3Match?.matchBasis ?? 'no_l3_or_l4_seed_match',
      calibrationPolicy: l4Match
        ? 'Use actual order, acceptance or approval records, dependency edits, and manual review before changing explicit L4 business gate templates.'
        : l3Rule
          ? 'Use actual start/finish history, handover evidence, scope facts, and duration seed resolution before changing L3 lagDays, strength, or conditional profiles.'
          : 'Map the dependency to an L3/L4 seed or keep it as manual project-specific evidence.',
    },
  }
}

function buildReport(
  rows: ConstructionDependencyReplayRow[],
  options: {
    zeroLagReviewThresholdDays: number
    constructionCalendar?: ConstructionCalendarContext | null
  },
): ConstructionDependencyReplayCalibrationReport {
  const items = rows.map((row) => buildReplayItem(row, options))
  const calibrationQueues = buildCalibrationQueues(items)
  return {
    reportCode: 'construction_dependency_replay_calibration',
    generatedAt: new Date().toISOString(),
    governancePolicy: {
      replayMode: 'report_only',
      seedWritePolicy: 'never_write_seed_from_replay',
      taskDependencyWritePolicy: 'never_write_task_dependencies_from_replay',
      promotionPolicy: 'manual_seed_review_required',
    },
    summary: {
      inputDependencyCount: rows.length,
      matchedDependencyCount: items.filter((item) => item.matchedLayer !== 'unmatched').length,
      comparableActualDateCount: items.filter((item) => item.observedWaitDays != null).length,
      l3MatchedDependencyCount: items.filter((item) => item.matchedLayer === 'cross_item_workflow').length,
      l4MatchedDependencyCount: items.filter((item) => item.matchedLayer === 'cross_business_domain_dependency_intent').length,
      validatedDependencyCount: items.filter((item) => item.replayStatus === 'validated').length,
      reviewRequiredDependencyCount: items.filter((item) => item.replayStatus === 'needs_lag_calibration').length,
      conflictDependencyCount: items.filter((item) => item.replayStatus === 'actual_order_conflict').length,
      insufficientActualDateCount: items.filter((item) => item.replayStatus === 'insufficient_actual_dates').length,
      unmatchedSeedCount: items.filter((item) => item.replayStatus === 'unmatched_seed').length,
    },
    calibrationQueues,
    items,
  }
}

async function loadDependencyReplayRows(
  queryRows: QueryRows,
  options: { projectIds: string[]; maxSamples: number },
) {
  const projectIds = options.projectIds.map(normalizeText).filter(Boolean)
  const sql = `
    SELECT
      dependency.id,
      dependency.project_id,
      dependency.dependency_type,
      dependency.lag_days,
      dependency.source_type,
      dependency.metadata,
      dependency.dependency_task_id AS predecessor_task_id,
      dependency.task_id AS successor_task_id,
      dependency_task.task_code AS predecessor_task_code,
      dependency_task.standard_work_code AS predecessor_standard_work_code,
      dependency_task.template_node_id AS predecessor_template_node_id,
      dependency_task.title AS predecessor_title,
      dependency_task.standard_task_metadata AS predecessor_standard_task_metadata,
      dependency_task.actual_start_date AS predecessor_actual_start_date,
      dependency_task.actual_end_date AS predecessor_actual_end_date,
      successor_task.task_code AS successor_task_code,
      successor_task.standard_work_code AS successor_standard_work_code,
      successor_task.template_node_id AS successor_template_node_id,
      successor_task.title AS successor_title,
      successor_task.standard_task_metadata AS successor_standard_task_metadata,
      successor_task.actual_start_date AS successor_actual_start_date,
      successor_task.actual_end_date AS successor_actual_end_date
    FROM task_dependencies dependency
    JOIN tasks dependency_task ON dependency_task.id = dependency.dependency_task_id
    JOIN tasks successor_task ON successor_task.id = dependency.task_id
    WHERE dependency.status = 'active'
      AND ($1::uuid[] IS NULL OR dependency.project_id = ANY($1::uuid[]))
    ORDER BY dependency.updated_at DESC NULLS LAST, dependency.created_at DESC NULLS LAST
    LIMIT $2
  `
  return queryRows<ConstructionDependencyReplayRow>(sql, [projectIds.length > 0 ? projectIds : null, options.maxSamples])
}

async function loadDependencyReplayRowsDirect(
  options: { projectIds: string[]; maxSamples: number },
) {
  const projectIds = options.projectIds.map(normalizeText).filter(Boolean)
  const result = await rawQuery(`
    SELECT
      dependency.id,
      dependency.project_id,
      dependency.dependency_type,
      dependency.lag_days,
      dependency.source_type,
      dependency.metadata,
      dependency.dependency_task_id AS predecessor_task_id,
      dependency.task_id AS successor_task_id,
      dependency_task.task_code AS predecessor_task_code,
      dependency_task.standard_work_code AS predecessor_standard_work_code,
      dependency_task.template_node_id AS predecessor_template_node_id,
      dependency_task.title AS predecessor_title,
      dependency_task.standard_task_metadata AS predecessor_standard_task_metadata,
      dependency_task.actual_start_date AS predecessor_actual_start_date,
      dependency_task.actual_end_date AS predecessor_actual_end_date,
      successor_task.task_code AS successor_task_code,
      successor_task.standard_work_code AS successor_standard_work_code,
      successor_task.template_node_id AS successor_template_node_id,
      successor_task.title AS successor_title,
      successor_task.standard_task_metadata AS successor_standard_task_metadata,
      successor_task.actual_start_date AS successor_actual_start_date,
      successor_task.actual_end_date AS successor_actual_end_date
    FROM task_dependencies dependency
    JOIN tasks dependency_task ON dependency_task.id = dependency.dependency_task_id
    JOIN tasks successor_task ON successor_task.id = dependency.task_id
    WHERE dependency.status = 'active'
      AND ($1::uuid[] IS NULL OR dependency.project_id = ANY($1::uuid[]))
    ORDER BY dependency.updated_at DESC NULLS LAST, dependency.created_at DESC NULLS LAST
    LIMIT $2
  `, [projectIds.length > 0 ? projectIds : null, options.maxSamples] as any[])
  return result.rows as ConstructionDependencyReplayRow[]
}

export async function collectConstructionDependencyReplayCalibrationReport(
  options: CollectConstructionDependencyReplayCalibrationOptions = {},
): Promise<ConstructionDependencyReplayCalibrationReport> {
  const maxSamples = Math.max(1, Math.floor(options.maxSamples ?? DEFAULT_MAX_SAMPLES))
  const zeroLagReviewThresholdDays = Math.max(1, Math.floor(options.zeroLagReviewThresholdDays ?? DEFAULT_ZERO_LAG_REVIEW_THRESHOLD_DAYS))
  const queryOptions = {
    projectIds: options.projectIds ?? [],
    maxSamples,
  }
  const rows = options.queryRows
    ? await loadDependencyReplayRows(options.queryRows, queryOptions)
    : await loadDependencyReplayRowsDirect(queryOptions)
  return buildReport(rows, {
    zeroLagReviewThresholdDays,
    constructionCalendar: options.constructionCalendar,
  })
}

function flattenCalibrationQueueCandidates(report: ConstructionDependencyReplayCalibrationReport) {
  return [
    ...report.calibrationQueues.l3LagCalibrationCandidates,
    ...report.calibrationQueues.l4ConflictQuarantineCandidates,
    ...report.calibrationQueues.evidenceCollectionCandidates,
    ...(report.calibrationQueues.dependencyRuleGapCandidates ?? []),
  ]
}

function buildDependencyReplayExperienceGroupKeys(queueItem: ConstructionDependencyReplayQueueItem) {
  return Array.from(new Set([
    'T1:dependency_order',
    `T1:dependency_layer:${queueItem.matchedLayer}`,
    `T1:dependency_seed:${queueItem.matchedSeedCode}`,
    ...queueItem.projectIds.map((projectId) => `project:${projectId}`),
  ].map(normalizeText).filter(Boolean)))
}

function dependencyRuleOutcomeStatus(queueItem: ConstructionDependencyReplayQueueItem): 'accepted' | 'weak' | null {
  if (queueItem.sampleCount <= 0 || queueItem.sampleDependencyIds.length <= 0) return null
  return queueItem.conflictCount === 0 && queueItem.sampleCount >= DEPENDENCY_RULE_ACCEPTED_SAMPLE_THRESHOLD
    ? 'accepted'
    : 'weak'
}

function scopedProjectId(projectIds: readonly string[]) {
  const uniqueProjectIds = uniqueValues(projectIds.map(normalizeText))
  return uniqueProjectIds.length === 1 ? uniqueProjectIds[0]! : null
}

function buildDependencyRuleOutcomeId(
  queueItem: ConstructionDependencyReplayQueueItem,
  companyId: string | null,
  projectId: string | null,
  generationBatchId?: string | null,
) {
  return [
    'dependency-rule-candidate',
    queueItem.matchedLayer,
    queueItem.matchedSeedCode,
    companyId ?? 'no-company',
    projectId ?? 'multi-project',
    ...(queueItem.runtimePublicationKey ? [queueItem.runtimePublicationKey] : []),
    ...(generationBatchId ? [generationBatchId] : []),
  ].join(':')
}

const TRUSTED_DEPENDENCY_RUNTIME_CONSUMPTIONS_SQL = `
    SELECT
      consumption.consumption_key,
      consumption.company_id,
      consumption.project_id,
      consumption.publication_key,
      consumption.asset_key,
      consumption.artifact_key,
      consumption.task_id,
      consumption.baseline_item_id,
      consumption.generation_batch_id,
      consumption.source_evidence_refs,
      consumption.consumption_context,
      publication.publication_stage,
      publication.monitoring_status,
      publication.scope_level AS publication_scope_level,
      publication.company_id AS publication_company_id,
      publication.project_id AS publication_project_id,
      publication.industry_key AS publication_industry_key
    FROM public.duration_learning_runtime_consumptions consumption
    JOIN public.projects project
      ON project.id = consumption.project_id
     AND project.company_id = consumption.company_id
    JOIN public.duration_learning_runtime_publications publication
      ON publication.publication_key = consumption.publication_key
     AND publication.asset_key = consumption.asset_key
     AND publication.artifact_key = consumption.artifact_key
    WHERE consumption.company_id = $1::uuid
      AND consumption.project_id = $2::uuid
      AND consumption.publication_key = $3::text
      AND consumption.asset_key = 'dependency_rule_candidate'
      AND consumption.artifact_key = $4::text
      AND consumption.task_id IS NOT NULL
      AND consumption.baseline_item_id IS NULL
      AND NULLIF(consumption.generation_batch_id, '') IS NOT NULL
      AND (
        (
          publication.publication_stage = 'canary'
          AND publication.monitoring_status IN ('pending', 'collecting', 'passed')
        )
        OR (
          publication.publication_stage = 'stable'
          AND publication.monitoring_status = 'passed'
        )
      )
      AND consumption.source_evidence_refs ? (
        'duration_learning_runtime_publications:' || consumption.publication_key
      )
      AND consumption.consumption_context ->> 'authoritySource'
            = 'runtime_resolver_publication_set'
      AND (
        (
          publication.scope_level = 'project'
          AND publication.company_id = consumption.company_id
          AND publication.project_id = consumption.project_id
          AND publication.industry_key IS NULL
        )
        OR (
          publication.scope_level = 'company'
          AND publication.company_id = consumption.company_id
          AND publication.project_id IS NULL
          AND publication.industry_key IS NULL
        )
        OR (
          publication.scope_level = 'industry'
          AND publication.company_id IS NULL
          AND publication.project_id IS NULL
          AND publication.industry_key = NULLIF(
            consumption.consumption_context ->> 'industryKey',
            ''
          )
        )
        OR (
          publication.scope_level = 'global'
          AND publication.company_id IS NULL
          AND publication.project_id IS NULL
          AND publication.industry_key IS NULL
        )
      )
    ORDER BY consumption.generation_batch_id,
             consumption.consumed_at,
             consumption.consumption_key`

function sortedUniqueText(values: readonly unknown[]) {
  return uniqueValues(values.map(normalizeText).filter(Boolean)).sort()
}

function dependencyRuntimeConsumptionRowIsTrusted(
  row: DependencyTrustedRuntimeConsumptionRow,
  companyId: string,
  projectId: string,
  publicationKey: string,
  artifactKey: string,
) {
  const sourceEvidenceRefs = readStringArray(row.source_evidence_refs)
  const context = readRecord(row.consumption_context)
  const publicationStage = normalizeText(row.publication_stage)
  const monitoringStatus = normalizeText(row.monitoring_status)
  const scopeLevel = normalizeText(row.publication_scope_level)
  const scopeMatches = scopeLevel === 'project'
    ? normalizeText(row.publication_company_id) === companyId
      && normalizeText(row.publication_project_id) === projectId
      && !normalizeText(row.publication_industry_key)
    : scopeLevel === 'company'
      ? normalizeText(row.publication_company_id) === companyId
        && !normalizeText(row.publication_project_id)
        && !normalizeText(row.publication_industry_key)
      : scopeLevel === 'industry'
        ? !normalizeText(row.publication_company_id)
          && !normalizeText(row.publication_project_id)
          && Boolean(normalizeText(row.publication_industry_key))
          && normalizeText(row.publication_industry_key) === normalizeText(context.industryKey)
        : scopeLevel === 'global'
          ? !normalizeText(row.publication_company_id)
            && !normalizeText(row.publication_project_id)
            && !normalizeText(row.publication_industry_key)
          : false
  return normalizeText(row.company_id) === companyId
    && normalizeText(row.project_id) === projectId
    && normalizeText(row.publication_key) === publicationKey
    && normalizeText(row.asset_key) === DEPENDENCY_RULE_CANDIDATE_ASSET_KEY
    && normalizeText(row.artifact_key) === artifactKey
    && Boolean(normalizeText(row.task_id))
    && !normalizeText(row.baseline_item_id)
    && Boolean(normalizeText(row.generation_batch_id))
    && ((publicationStage === 'canary' && ['pending', 'collecting', 'passed'].includes(monitoringStatus))
      || (publicationStage === 'stable' && monitoringStatus === 'passed'))
    && sourceEvidenceRefs.includes(`duration_learning_runtime_publications:${publicationKey}`)
    && normalizeText(context.authoritySource) === 'runtime_resolver_publication_set'
    && scopeMatches
}

async function readDependencyRuntimeConsumptionLineage(input: {
  queueItem: ConstructionDependencyReplayQueueItem
  companyId: string | null
  projectId: string | null
  queryExec?: AlgorithmAssetGovernanceQueryExec
}): Promise<DependencyRuntimeConsumptionLineage | null> {
  const publicationKey = normalizeNullableText(input.queueItem.runtimePublicationKey)
  const artifactKey = normalizeNullableText(input.queueItem.runtimePublicationArtifactKey)
  const companyId = normalizeNullableText(input.companyId)
  const projectId = normalizeNullableText(input.projectId)
  const expectedTaskIds = sortedUniqueText(input.queueItem.inputTaskIds ?? [])
  if (!publicationKey || !artifactKey || !companyId || !projectId || expectedTaskIds.length === 0) return null

  const rows = input.queryExec
    ? await input.queryExec<DependencyTrustedRuntimeConsumptionRow>(
      TRUSTED_DEPENDENCY_RUNTIME_CONSUMPTIONS_SQL,
      [companyId, projectId, publicationKey, artifactKey],
    )
    // database-query-dynamic-approved: dependency replay owns this fixed, parameterized trusted-consumption SELECT; callers only supply bound scope values.
    : (await rawQuery(
      TRUSTED_DEPENDENCY_RUNTIME_CONSUMPTIONS_SQL,
      [companyId, projectId, publicationKey, artifactKey] as any[],
    )).rows as DependencyTrustedRuntimeConsumptionRow[]

  const groupedByBatch = new Map<string, DependencyTrustedRuntimeConsumptionRow[]>()
  for (const row of rows) {
    if (!dependencyRuntimeConsumptionRowIsTrusted(row, companyId, projectId, publicationKey, artifactKey)) continue
    const context = readRecord(row.consumption_context)
    const inputTaskIds = sortedUniqueText(readStringArray(context.inputTaskIds ?? context.input_task_ids))
    if (inputTaskIds.length === 0 || inputTaskIds.some((taskId) => !expectedTaskIds.includes(taskId))) continue
    const batchId = normalizeText(row.generation_batch_id)
    const batchRows = groupedByBatch.get(batchId) ?? []
    batchRows.push(row)
    groupedByBatch.set(batchId, batchRows)
  }

  const candidates: DependencyRuntimeConsumptionLineage[] = []
  for (const [generationBatchId, batchRows] of groupedByBatch) {
    const inputTaskIds = sortedUniqueText(batchRows.flatMap((row) => {
      const context = readRecord(row.consumption_context)
      return readStringArray(context.inputTaskIds ?? context.input_task_ids)
    }))
    if (inputTaskIds.length !== expectedTaskIds.length
      || inputTaskIds.some((taskId, index) => taskId !== expectedTaskIds[index])) continue
    const consumptionKeys = sortedUniqueText(batchRows.map((row) => row.consumption_key))
    if (consumptionKeys.length === 0) continue
    const sourceEvidenceRefs = sortedUniqueText(batchRows.flatMap((row) => readStringArray(row.source_evidence_refs)))
    candidates.push({
      publicationKey,
      artifactKey,
      generationBatchId,
      inputTaskIds,
      consumptionKeys,
      sourceEvidenceRefs,
      publicationStage: normalizeText(batchRows[0]?.publication_stage),
    })
  }

  return candidates.length === 1 ? candidates[0]! : null
}

async function resolveDependencyRuntimeLineages(input: {
  queueItems: readonly ConstructionDependencyReplayQueueItem[]
  companyId: string | null
  queryExec?: AlgorithmAssetGovernanceQueryExec
}) {
  const runtimeLineageByQueueItem = new Map<
    ConstructionDependencyReplayQueueItem,
    DependencyRuntimeConsumptionLineage
  >()
  for (const queueItem of input.queueItems) {
    if (!dependencyRuleOutcomeStatus(queueItem)) continue
    if (!queueItem.runtimePublicationKey || !queueItem.runtimePublicationArtifactKey) continue
    const lineage = await readDependencyRuntimeConsumptionLineage({
      queueItem,
      companyId: input.companyId,
      projectId: scopedProjectId(queueItem.projectIds),
      queryExec: input.queryExec,
    })
    if (!lineage) {
      throw Object.assign(new Error('dependency replay outcome requires one exact trusted runtime consumption batch'), {
        code: 'DEPENDENCY_REPLAY_RUNTIME_CONSUMPTION_LINEAGE_REQUIRED',
        publicationKey: queueItem.runtimePublicationKey,
        artifactKey: queueItem.runtimePublicationArtifactKey,
        projectId: scopedProjectId(queueItem.projectIds),
        inputTaskIds: queueItem.inputTaskIds ?? [],
      })
    }
    runtimeLineageByQueueItem.set(queueItem, lineage)
  }
  return runtimeLineageByQueueItem
}

async function recordDependencyRulePlanNetworkOutcomes(
  report: ConstructionDependencyReplayCalibrationReport,
  options: Pick<CollectAndPersistConstructionDependencyReplayCalibrationCandidatesOptions, 'companyId' | 'queryExec' | 'constructionCalendar'> & {
    runtimeLineageByQueueItem?: ReadonlyMap<
      ConstructionDependencyReplayQueueItem,
      DependencyRuntimeConsumptionLineage
    >
  },
) {
  const companyId = normalizeNullableText(options.companyId)
  const queueItems = flattenCalibrationQueueCandidates(report)
  const durationDayUnit = isAuthoritativeConstructionCalendar(options.constructionCalendar)
    ? 'construction_production_day'
    : 'calendar_day_no_construction_calendar_context'

  const runtimeLineageByQueueItem = options.runtimeLineageByQueueItem
    ?? await resolveDependencyRuntimeLineages({
      queueItems,
      companyId,
      queryExec: options.queryExec,
    })

  let recordedOutcomeCount = 0
  for (const queueItem of queueItems) {
    const outcomeStatus = dependencyRuleOutcomeStatus(queueItem)
    if (!outcomeStatus) continue

    const runtimeLineage = runtimeLineageByQueueItem.get(queueItem)
    // Manual/cold-start dependency evidence remains a candidate event only.
    // It must not create an unlinked network outcome that can later be treated
    // as a publication-backed runtime fact.
    if (!runtimeLineage) continue

    const projectId = scopedProjectId(queueItem.projectIds)
    const replayPassRate = queueItem.sampleCount > 0
      ? Number(((queueItem.replayPassCount ?? 0) / queueItem.sampleCount).toFixed(6))
      : null
    const outcomeAcceptanceRate = outcomeStatus === 'accepted' ? 1 : 0
    const qualityConsistencyRate = queueItem.sampleCount > 0
      ? Number(((queueItem.qualityConsistentCount ?? 0) / queueItem.sampleCount).toFixed(6))
      : null
    const conflictRate = queueItem.sampleCount > 0
      ? Number((queueItem.conflictCount / queueItem.sampleCount).toFixed(6))
      : null
    const metadata = {
      source: 'construction_dependency_replay_calibration',
      report_code: report.reportCode,
      matched_layer: queueItem.matchedLayer,
      matched_seed_code: queueItem.matchedSeedCode,
      predecessor_stable_code: queueItem.predecessorStableCode,
      successor_stable_code: queueItem.successorStableCode,
      dependency_type: queueItem.dependencyType,
      sample_count: queueItem.sampleCount,
      project_count: queueItem.projectCount,
      conflict_count: queueItem.conflictCount,
      seed_lag_days: queueItem.seedLagDays,
      median_observed_wait_days: queueItem.medianObservedWaitDays,
      suggested_lag_days: queueItem.suggestedLagDays,
      duration_day_unit: durationDayUnit,
      durationDayUnit,
      construction_calendar: options.constructionCalendar ?? null,
      constructionCalendar: options.constructionCalendar ?? null,
      queue_status: queueItem.queueStatus,
      recommendation: queueItem.recommendation,
      sample_dependency_ids: queueItem.sampleDependencyIds,
      project_ids: queueItem.projectIds,
      comparable_actual_date_count: report.summary.comparableActualDateCount,
      generation_batch_id: runtimeLineage.generationBatchId,
      runtime_publication_key: runtimeLineage.publicationKey,
      runtime_publication_artifact_key: runtimeLineage.artifactKey,
      runtime_publication_input_task_ids: runtimeLineage.inputTaskIds,
      runtime_publication_input_subject_ids: runtimeLineage.inputTaskIds,
      runtime_publication_stage: runtimeLineage.publicationStage,
      runtime_publication_selection_basis: queueItem.runtimePublicationSelectionBasis ?? null,
      runtime_publication_consumption_keys: runtimeLineage.consumptionKeys,
      runtime_publication_source_evidence_refs: runtimeLineage.sourceEvidenceRefs,
      runtime_publication_authority_source: 'runtime_resolver_publication_set',
      source_evidence_refs: sortedUniqueText([
        ...queueItem.sampleDependencyIds.map((dependencyId) => (
          `task_dependencies:${dependencyId}:replay`
        )),
        ...runtimeLineage.sourceEvidenceRefs,
        `duration_learning_runtime_publications:${runtimeLineage.publicationKey}`,
      ]),
      task_ids: runtimeLineage.inputTaskIds,
      real_outcome_count: queueItem.replayPassCount ?? 0,
      replay_case_count: queueItem.sampleCount,
      observation_started_at: queueItem.observationStartedAt ?? null,
      observation_ended_at: queueItem.observationEndedAt ?? null,
      observation_window_days: queueItem.observationWindowDays ?? 0,
      quality_model: 'structural_replay',
      replay_pass_rate: replayPassRate,
      outcome_acceptance_rate: outcomeAcceptanceRate,
      quality_consistency_rate: qualityConsistencyRate,
      conflict_rate: conflictRate,
      rollback_ready: true,
      tenant_scope_valid: Boolean(companyId && projectId),
      writes_runtime_directly: false,
      writes_fact_directly: false,
    }

    const params = [
        buildDependencyRuleOutcomeId(queueItem, companyId, projectId, runtimeLineage.generationBatchId),
        DEPENDENCY_RULE_CANDIDATE_ASSET_KEY,
        outcomeStatus,
        `${report.reportCode}:${queueItem.matchedLayer}:${queueItem.matchedSeedCode}:${runtimeLineage.generationBatchId}`,
        'project',
        'project_business_outcome_writer',
        companyId,
        projectId,
        runtimeLineage.publicationKey,
        metadata,
        false,
        false,
      ]
    const sql = `INSERT INTO public.duration_plan_network_outcomes (
          id,
          asset_key,
          outcome_status,
          outcome_ref,
          learning_scope,
          learning_scope_source,
          company_id,
          project_id,
          publication_key,
          metadata,
          writes_runtime_directly,
          writes_fact_directly
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        ON CONFLICT (id) DO UPDATE SET
          outcome_status = EXCLUDED.outcome_status,
          outcome_ref = EXCLUDED.outcome_ref,
          learning_scope = EXCLUDED.learning_scope,
          learning_scope_source = EXCLUDED.learning_scope_source,
          company_id = EXCLUDED.company_id,
          project_id = EXCLUDED.project_id,
          publication_key = EXCLUDED.publication_key,
          observed_at = now(),
          metadata = EXCLUDED.metadata,
          writes_runtime_directly = false,
          writes_fact_directly = false`
    if (options.queryExec) {
      await options.queryExec(sql, params)
    } else {
      await rawQuery(`INSERT INTO public.duration_plan_network_outcomes (
          id,
          asset_key,
          outcome_status,
          outcome_ref,
          learning_scope,
          learning_scope_source,
          company_id,
          project_id,
          publication_key,
          metadata,
          writes_runtime_directly,
          writes_fact_directly
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        ON CONFLICT (id) DO UPDATE SET
          outcome_status = EXCLUDED.outcome_status,
          outcome_ref = EXCLUDED.outcome_ref,
          learning_scope = EXCLUDED.learning_scope,
          learning_scope_source = EXCLUDED.learning_scope_source,
          company_id = EXCLUDED.company_id,
          project_id = EXCLUDED.project_id,
          publication_key = EXCLUDED.publication_key,
          observed_at = now(),
          metadata = EXCLUDED.metadata,
          writes_runtime_directly = false,
          writes_fact_directly = false`, params as any[])
    }
    recordedOutcomeCount += 1
  }
  return recordedOutcomeCount
}

async function resolveReplayProjectCompanyId(
  projectId: string,
  options: Pick<PersistConstructionDependencyReplayCalibrationCandidatesFromReportOptions, 'companyId' | 'queryExec'>,
) {
  const explicit = normalizeNullableText(options.companyId)
  if (explicit) return explicit
  const result = options.queryExec
    ? await options.queryExec('SELECT company_id FROM public.projects WHERE id = $1::uuid LIMIT 1', [projectId])
    : await rawQuery('SELECT company_id FROM public.projects WHERE id = $1::uuid LIMIT 1', [projectId])
  const rows = Array.isArray(result) ? result : result.rows
  const companyId = normalizeNullableText(rows[0]?.company_id)
  if (!companyId) {
    throw Object.assign(new Error('dependency replay project company authority is required'), {
      code: 'DEPENDENCY_REPLAY_PROJECT_COMPANY_AUTHORITY_REQUIRED',
      projectId,
    })
  }
  return companyId
}

export async function persistConstructionDependencyReplayCalibrationCandidatesFromReport(
  options: PersistConstructionDependencyReplayCalibrationCandidatesFromReportOptions,
) {
  const projectId = normalizeText(options.projectId)
  if (!projectId) throw new Error('dependency replay projectId is required')
  const reportQueueItems = flattenCalibrationQueueCandidates(options.report)
  const projectScopeMismatch = reportQueueItems.some((item) => {
    const candidateProjectIds = uniqueValues(item.projectIds.map(normalizeText))
    return candidateProjectIds.length !== 1 || candidateProjectIds[0] !== projectId
  })
  if (projectScopeMismatch) {
    throw Object.assign(new Error('dependency replay report scope does not match the requested project'), {
      code: 'DEPENDENCY_REPLAY_PROJECT_SCOPE_MISMATCH',
      projectId,
    })
  }
  const companyId = await resolveReplayProjectCompanyId(projectId, options)
  const report = options.report
  const maxCandidateEvents = Math.max(1, Math.floor(options.maxCandidateEvents ?? 20))
  const queueItems = reportQueueItems.slice(0, maxCandidateEvents)
  const runtimeLineageByQueueItem = await resolveDependencyRuntimeLineages({
    queueItems,
    companyId,
    queryExec: options.queryExec,
  })

  const persistedEvents = []
  for (const queueItem of queueItems) {
    const result = await createAndPersistAlgorithmAssetCandidateEvent({
      assetKey: `wbs.dependency.${queueItem.matchedLayer}.${queueItem.matchedSeedCode}`,
      sourceSystem: 'constructionDependencyReplayCalibrationService',
      assetType: 'rule',
      companyId,
      candidatePayload: {
        reportCode: report.reportCode,
        generatedAt: report.generatedAt,
        experienceTier: 'T1',
        reuseScope: 'project',
        learningScope: 'project',
        wbsNodeTypes: ['process', 'activity_step', 'task'],
        experienceAssetType: 'dependency_order',
        experienceGroupKeys: buildDependencyReplayExperienceGroupKeys(queueItem),
        experienceTierRegistryCandidate: {
          tier: 'T1',
          reusableAtNodeTypes: ['process', 'activity_step', 'task'],
          groupKeyStrategy: 'dependency_order_seed_rule',
          prohibitsCrossTierBucketMixing: true,
          requiredRegistry: 'experienceTierRegistry',
          registryStatus: 'candidate_payload_ready_pending_registry_materialization',
        },
        queueStatus: queueItem.queueStatus,
        recommendation: queueItem.recommendation,
        promotionPolicy: queueItem.promotionPolicy,
        matchedLayer: queueItem.matchedLayer,
        matchedSeedCode: queueItem.matchedSeedCode,
        sampleCount: queueItem.sampleCount,
        projectCount: queueItem.projectCount,
        conflictCount: queueItem.conflictCount,
        seedLagDays: queueItem.seedLagDays,
        medianObservedWaitDays: queueItem.medianObservedWaitDays,
        suggestedLagDays: queueItem.suggestedLagDays,
        sampleDependencyIds: queueItem.sampleDependencyIds,
        projectIds: queueItem.projectIds,
        summary: report.summary,
        governancePolicy: report.governancePolicy,
      },
      learningTarget: 'dependency_order',
      learningMaturity: 'governed_candidate',
      publishAnchor: 'candidate_only',
      automationMaturity: 'auto_shadow',
      requestedRuntimeEffect: 'candidate_only',
      generatedBy: 'service',
      evidence: { singleCandidateOnly: true },
      queryExec: options.queryExec,
    })
    persistedEvents.push(result)
  }
  const recordedOutcomeCount = await recordDependencyRulePlanNetworkOutcomes(report, {
    companyId,
    queryExec: options.queryExec,
    constructionCalendar: options.constructionCalendar,
    runtimeLineageByQueueItem,
  })

  return {
    report,
    persistedEvents,
    persistedEventCount: persistedEvents.length,
    recordedOutcomeCount,
  }
}

export async function collectAndPersistConstructionDependencyReplayCalibrationCandidates(
  options: CollectAndPersistConstructionDependencyReplayCalibrationCandidatesOptions = {},
) {
  const report = await collectConstructionDependencyReplayCalibrationReport(options)
  const projectIds = uniqueValues(options.projectIds ?? flattenCalibrationQueueCandidates(report).flatMap((item) => item.projectIds))
  if (projectIds.length !== 1) {
    throw new Error('dependency replay candidate producer requires exactly one project scope')
  }
  return persistConstructionDependencyReplayCalibrationCandidatesFromReport({
    report,
    projectId: projectIds[0]!,
    companyId: options.companyId,
    maxCandidateEvents: options.maxCandidateEvents,
    queryExec: options.queryExec,
    constructionCalendar: options.constructionCalendar,
  })
}

export function evaluateConstructionDependencyRuleCandidateLiveLearningEvidence(
  input: ConstructionDependencyRuleCandidateLiveLearningEvidenceInput,
): ConstructionDependencyRuleCandidateLiveLearningEvidenceDecision {
  const report = input.replayReport
  const missingReasons: string[] = []
  const enabledLearningScopes = normalizeConstructionDependencyRuleLearningScopes(input.enabledLearningScopes)
  const tieredLearningPolicyRegistered = CONSTRUCTION_DEPENDENCY_RULE_LEARNING_SCOPE_ORDER
    .every((scope) => enabledLearningScopes.includes(scope))
  const replayReportOnly = report.governancePolicy.replayMode === 'report_only'
  const dependencyWritePolicyPreserved = report.governancePolicy.seedWritePolicy === 'never_write_seed_from_replay'
    && report.governancePolicy.taskDependencyWritePolicy === 'never_write_task_dependencies_from_replay'
  const predictionEventRecorded = report.reportCode === 'construction_dependency_replay_calibration'
    && report.summary.inputDependencyCount > 0
  const actualOutcomeEventRecorded = input.dependencyOutcomeEventRecorded
    && report.summary.comparableActualDateCount > 0
  const dependencyRuleCandidatePresent = report.calibrationQueues.l3LagCalibrationCandidates.length > 0
    || report.calibrationQueues.l4ConflictQuarantineCandidates.length > 0
    || (report.calibrationQueues.dependencyRuleGapCandidates?.length ?? 0) > 0

  if (!predictionEventRecorded) missingReasons.push('dependency_replay_report_required')
  if (!actualOutcomeEventRecorded) missingReasons.push('dependency_actual_outcome_required')
  if (!dependencyRuleCandidatePresent) missingReasons.push('dependency_replay_candidate_required')
  if (!input.approvedDependencyRuleCandidateRecorded) missingReasons.push('approved_dependency_rule_candidate_required')
  if (!replayReportOnly) missingReasons.push('dependency_replay_must_remain_report_only')
  if (!dependencyWritePolicyPreserved) missingReasons.push('dependency_replay_write_policy_required')
  if (!input.dependencyRulePublicationWriterReady) missingReasons.push('dependency_rule_publication_writer_required')
  if (!input.dependencyRuleLineageRecorded) missingReasons.push('dependency_rule_lineage_required')
  if (!tieredLearningPolicyRegistered) missingReasons.push('global_industry_company_project_learning_scopes_required')
  if (!input.runtimeConsumerUsesPublishedArtifact) missingReasons.push('runtime_consumer_publication_required')
  if (!input.releaseExitApproved) missingReasons.push('release_exit_required')
  if (!input.impactMonitoringReady) missingReasons.push('impact_monitoring_required')
  if (!input.rollbackTargetReady) missingReasons.push('rollback_target_required')
  if (!input.accuracyMetricsAvailable) missingReasons.push('accuracy_metrics_required')

  const liveLearningEvidence: ConstructionDependencyRuleCandidateLiveLearningEvidence = {
    assetClassificationRegistered: true,
    predictionEventRecorded,
    actualOutcomeEventRecorded,
    tieredLearningPolicyRegistered,
    enabledLearningScopes,
    runtimeConsumerUsesPublishedArtifact: input.runtimeConsumerUsesPublishedArtifact,
    replayReportOnly,
    dependencyWritePolicyPreserved,
    dependencyRuleCandidatePresent,
    approvedDependencyRuleCandidateRecorded: input.approvedDependencyRuleCandidateRecorded,
    dependencyRulePublicationWriterReady: input.dependencyRulePublicationWriterReady,
    dependencyRuleLineageRecorded: input.dependencyRuleLineageRecorded,
    releaseExitApproved: input.releaseExitApproved,
    impactMonitoringReady: input.impactMonitoringReady,
    rollbackTargetReady: input.rollbackTargetReady,
    accuracyMetricsAvailable: input.accuracyMetricsAvailable,
    comparableActualDateCount: report.summary.comparableActualDateCount,
  }

  return {
    status: missingReasons.length === 0
      ? 'dependency_rule_candidate_live_learning_ready'
      : 'dependency_rule_candidate_live_learning_not_ready',
    liveLearningEvidence,
    missingReasons: uniqueValues(missingReasons),
  }
}

export function buildConstructionDependencyRulePublicationReadiness(
  input: ConstructionDependencyRulePublicationReadinessInput,
): ConstructionDependencyRulePublicationReadiness {
  const candidateQueues = [
    ...input.replayReport.calibrationQueues.l3LagCalibrationCandidates,
    ...input.replayReport.calibrationQueues.l4ConflictQuarantineCandidates,
    ...(input.replayReport.calibrationQueues.dependencyRuleGapCandidates ?? []),
  ]
  const approvedCandidateEventIds = normalizeStringList(input.approvedCandidateEventIds)
  const sourceDependencyIds = normalizeStringList(candidateQueues.flatMap((candidate) => candidate.sampleDependencyIds))
  const matchedSeedCodes = normalizeStringList(candidateQueues.map((candidate) => candidate.matchedSeedCode))
  const dependencyRuleVersionId = normalizeNullableText(input.dependencyRuleVersionId)
  const runtimePublicationKey = normalizeNullableText(input.runtimePublicationKey)
  const runtimeConsumerObservationRef = normalizeNullableText(input.runtimeConsumerObservationRef)
  const runtimeConsumerPublicationKey = normalizeNullableText(input.runtimeConsumerPublicationKey)
  const rollbackTarget = normalizeNullableText(input.rollbackTarget)
  const dependencyRulePublicationWriterReady = Boolean(dependencyRuleVersionId && runtimePublicationKey)
  const dependencyRuleLineageRecorded = Boolean(dependencyRuleVersionId)
    && approvedCandidateEventIds.length > 0
    && sourceDependencyIds.length > 0
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

  const readiness = evaluateConstructionDependencyRuleCandidateLiveLearningEvidence({
    replayReport: input.replayReport,
    dependencyOutcomeEventRecorded: input.dependencyOutcomeEventRecorded,
    approvedDependencyRuleCandidateRecorded: approvedCandidateEventIds.length > 0,
    enabledLearningScopes: input.enabledLearningScopes,
    runtimeConsumerUsesPublishedArtifact: runtimeConsumerObservationMatchesPublication,
    dependencyRulePublicationWriterReady,
    dependencyRuleLineageRecorded,
    releaseExitApproved: input.releaseExitApproved,
    impactMonitoringReady: input.impactMonitoringReady,
    rollbackTargetReady: Boolean(rollbackTarget),
    accuracyMetricsAvailable: input.accuracyMetricsAvailable,
  })

  return {
    status: readiness.status === 'dependency_rule_candidate_live_learning_ready'
      ? 'dependency_rule_publication_ready'
      : 'dependency_rule_publication_not_ready',
    liveLearningEvidence: readiness.liveLearningEvidence,
    dependencyRuleLineage: {
      assetType: 'dependency_rule_candidate',
      dependencyRuleVersionId,
      runtimePublicationKey,
      rollbackTarget,
      approvedCandidateEventIds,
      sourceDependencyIds,
      matchedSeedCodes,
      replayReportCode: input.replayReport.reportCode,
      comparableActualDateCount: input.replayReport.summary.comparableActualDateCount,
    },
    missingReasons: uniqueValues([
      ...readiness.missingReasons,
      runtimeConsumerPublicationMismatched ? 'runtime_consumer_publication_mismatch' : '',
    ]),
  }
}

export function buildConstructionDependencyRulePublicationReadinessFromProductionRows(
  input: ConstructionDependencyRulePublicationReadinessFromProductionRowsInput,
): ConstructionDependencyRuleProductionPublicationReadiness {
  const candidateQueues = [
    ...input.replayReport.calibrationQueues.l3LagCalibrationCandidates,
    ...input.replayReport.calibrationQueues.l4ConflictQuarantineCandidates,
    ...(input.replayReport.calibrationQueues.dependencyRuleGapCandidates ?? []),
  ]
  const approvedCandidateEventIds = normalizeStringList(input.approvedCandidateEventIds)
  const sourceDependencyIds = normalizeStringList(candidateQueues.flatMap((candidate) => candidate.sampleDependencyIds))
  const matchedSeedCodes = normalizeStringList(candidateQueues.map((candidate) => candidate.matchedSeedCode))
  const productionLineage = dependencyRuleProductionLineageFromProductionInput(input)
  const evidenceRefs = productionLineage.evidenceRefs
  const dependencyRuleVersionId = findCurrentPublishedDependencyRuleVersionId(input.sourceRows)
  const runtimePublicationKey = dependencyRuleRuntimePublicationKeyFromExecutionRef(
    evidenceRefs.publicationExecutionRef,
  )
  const rollbackTarget = normalizeNullableText(evidenceRefs.rollbackDrillEvidenceRef)
  const hasRuntimeConsumerObservation = Boolean(evidenceRefs.runtimeConsumerObservationRef)
  const runtimeConsumerObservationMatchesPublication = hasRuntimeConsumerObservation
    && dependencyRuleObservationMatchesPublication(evidenceRefs)
  const dependencyRulePublicationWriterReady = Boolean(dependencyRuleVersionId && runtimePublicationKey)
  const dependencyRuleLineageRecorded = Boolean(dependencyRuleVersionId)
    && approvedCandidateEventIds.length > 0
    && sourceDependencyIds.length > 0

  const readiness = evaluateConstructionDependencyRuleCandidateLiveLearningEvidence({
    replayReport: input.replayReport,
    dependencyOutcomeEventRecorded: Boolean(evidenceRefs.productionSampleEvidenceRef),
    approvedDependencyRuleCandidateRecorded: approvedCandidateEventIds.length > 0,
    enabledLearningScopes: input.enabledLearningScopes,
    runtimeConsumerUsesPublishedArtifact: runtimeConsumerObservationMatchesPublication,
    dependencyRulePublicationWriterReady,
    dependencyRuleLineageRecorded,
    releaseExitApproved: Boolean(evidenceRefs.publicationExecutionRef),
    impactMonitoringReady: Boolean(evidenceRefs.impactMonitoringEvidenceRef),
    rollbackTargetReady: Boolean(evidenceRefs.rollbackDrillEvidenceRef),
    accuracyMetricsAvailable: Boolean(evidenceRefs.accuracyEvidenceRef),
  })

  return {
    status: readiness.status === 'dependency_rule_candidate_live_learning_ready'
      ? 'dependency_rule_publication_ready'
      : 'dependency_rule_publication_not_ready',
    liveLearningEvidence: readiness.liveLearningEvidence,
    dependencyRuleLineage: {
      assetType: 'dependency_rule_candidate',
      dependencyRuleVersionId,
      runtimePublicationKey,
      rollbackTarget,
      approvedCandidateEventIds,
      sourceDependencyIds,
      matchedSeedCodes,
      replayReportCode: input.replayReport.reportCode,
      comparableActualDateCount: input.replayReport.summary.comparableActualDateCount,
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
