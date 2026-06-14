import { query as rawQuery } from '../database.js'
import {
  V1475_CROSS_ITEM_WORKFLOW_SEED,
  type V1475CrossItemWorkflowRule,
} from '../seeds/v1475CrossItemWorkflowSeed.js'
import {
  V1475_EXPLICIT_BUSINESS_GATE_SOURCE_ID,
  V1475_EXPLICIT_BUSINESS_GATE_TEMPLATES,
} from '../seeds/v1475DependencyIntentTemplates.js'
import { signedDurationDayDelta } from '../utils/durationDays.js'
import { createAndPersistAlgorithmAssetCandidateEvent } from './algorithmAssetCandidateEventAdapterService.js'
import type { AlgorithmAssetGovernanceQueryExec } from './algorithmAssetGovernancePersistenceService.js'

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
  matchedLayer: Exclude<ConstructionDependencyReplayLayer, 'unmatched'>
  matchedSeedCode: string
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
  projectIds: string[]
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
  }
  items: ConstructionDependencyReplayItem[]
}

export interface CollectConstructionDependencyReplayCalibrationOptions {
  projectIds?: string[]
  maxSamples?: number
  zeroLagReviewThresholdDays?: number
  queryRows?: QueryRows
}

export interface CollectAndPersistConstructionDependencyReplayCalibrationCandidatesOptions
  extends CollectConstructionDependencyReplayCalibrationOptions {
  companyId?: string | null
  maxCandidateEvents?: number
  queryExec?: AlgorithmAssetGovernanceQueryExec
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
  rollbackTarget?: string | null
  enabledLearningScopes: readonly ConstructionDependencyRuleLearningScopeEvidence[]
  releaseExitApproved: boolean
  impactMonitoringReady: boolean
  accuracyMetricsAvailable: boolean
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

export interface ConstructionDependencyRulePublicationReadiness {
  status: 'dependency_rule_publication_ready' | 'dependency_rule_publication_not_ready'
  liveLearningEvidence: ConstructionDependencyRuleCandidateLiveLearningEvidence
  dependencyRuleLineage: ConstructionDependencyRuleLineage
  missingReasons: string[]
}

const DEFAULT_MAX_SAMPLES = 200
const DEFAULT_ZERO_LAG_REVIEW_THRESHOLD_DAYS = 2

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

function normalizeStringList(values: readonly unknown[] | undefined): string[] {
  return uniqueValues((values ?? []).map((value) => normalizeText(value)).filter(Boolean))
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

function observedWaitDays(row: ConstructionDependencyReplayRow, dependencyType: ConstructionDependencyReplayItem['dependencyType']) {
  if (dependencyType === 'SS') {
    return signedDurationDayDelta(row.predecessor_actual_start_date, row.successor_actual_start_date)
  }
  if (dependencyType === 'FF') {
    return signedDurationDayDelta(row.predecessor_actual_end_date, row.successor_actual_end_date)
  }
  if (dependencyType === 'SF') {
    return signedDurationDayDelta(row.predecessor_actual_start_date, row.successor_actual_end_date)
  }
  return signedDurationDayDelta(row.predecessor_actual_end_date, row.successor_actual_start_date)
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
    const key = `${item.matchedLayer}:${item.matchedSeedCode}`
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

    return {
      matchedLayer: first.matchedLayer as Exclude<ConstructionDependencyReplayLayer, 'unmatched'>,
      matchedSeedCode: first.matchedSeedCode ?? '',
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
      projectIds: Array.from(new Set(groupItems.map((item) => item.projectId).filter(Boolean))).slice(0, 20),
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
  }
}

function buildReplayItem(
  row: ConstructionDependencyReplayRow,
  options: { zeroLagReviewThresholdDays: number },
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
  const waitDays = observedWaitDays(row, dependencyType)
  const replay = classifyReplay({
    matchedLayer,
    observedWaitDays: waitDays,
    dependencyLagDays,
    seedLagDays,
    zeroLagReviewThresholdDays: options.zeroLagReviewThresholdDays,
  })
  const sourceSeedRuleIds = readSourceSeedRuleIds(row)
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
  options: { zeroLagReviewThresholdDays: number },
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

function buildDefaultQueryRows(): QueryRows {
  return async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => {
    const result = await rawQuery(sql, params as any[])
    return result.rows as T[]
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

export async function collectConstructionDependencyReplayCalibrationReport(
  options: CollectConstructionDependencyReplayCalibrationOptions = {},
): Promise<ConstructionDependencyReplayCalibrationReport> {
  const maxSamples = Math.max(1, Math.floor(options.maxSamples ?? DEFAULT_MAX_SAMPLES))
  const zeroLagReviewThresholdDays = Math.max(1, Math.floor(options.zeroLagReviewThresholdDays ?? DEFAULT_ZERO_LAG_REVIEW_THRESHOLD_DAYS))
  const queryRows = options.queryRows ?? buildDefaultQueryRows()
  const rows = await loadDependencyReplayRows(queryRows, {
    projectIds: options.projectIds ?? [],
    maxSamples,
  })
  return buildReport(rows, { zeroLagReviewThresholdDays })
}

function flattenCalibrationQueueCandidates(report: ConstructionDependencyReplayCalibrationReport) {
  return [
    ...report.calibrationQueues.l3LagCalibrationCandidates,
    ...report.calibrationQueues.l4ConflictQuarantineCandidates,
    ...report.calibrationQueues.evidenceCollectionCandidates,
  ]
}

export async function collectAndPersistConstructionDependencyReplayCalibrationCandidates(
  options: CollectAndPersistConstructionDependencyReplayCalibrationCandidatesOptions = {},
) {
  const report = await collectConstructionDependencyReplayCalibrationReport(options)
  const maxCandidateEvents = Math.max(1, Math.floor(options.maxCandidateEvents ?? 20))
  const queueItems = flattenCalibrationQueueCandidates(report).slice(0, maxCandidateEvents)

  const persistedEvents = []
  for (const queueItem of queueItems) {
    const result = await createAndPersistAlgorithmAssetCandidateEvent({
      assetKey: `wbs.dependency.${queueItem.matchedLayer}.${queueItem.matchedSeedCode}`,
      sourceSystem: 'constructionDependencyReplayCalibrationService',
      assetType: 'rule',
      companyId: options.companyId,
      candidatePayload: {
        reportCode: report.reportCode,
        generatedAt: report.generatedAt,
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
      publishAnchor: 'manual_governance_required',
      automationMaturity: 'auto_review_package',
      requestedRuntimeEffect: 'candidate_only',
      generatedBy: 'service',
      evidence: {
        singleCandidateOnly: true,
      },
      queryExec: options.queryExec,
    })
    persistedEvents.push(result)
  }

  return {
    report,
    persistedEvents,
    persistedEventCount: persistedEvents.length,
  }
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
  ]
  const approvedCandidateEventIds = normalizeStringList(input.approvedCandidateEventIds)
  const sourceDependencyIds = normalizeStringList(candidateQueues.flatMap((candidate) => candidate.sampleDependencyIds))
  const matchedSeedCodes = normalizeStringList(candidateQueues.map((candidate) => candidate.matchedSeedCode))
  const dependencyRuleVersionId = normalizeNullableText(input.dependencyRuleVersionId)
  const runtimePublicationKey = normalizeNullableText(input.runtimePublicationKey)
  const rollbackTarget = normalizeNullableText(input.rollbackTarget)
  const dependencyRulePublicationWriterReady = Boolean(dependencyRuleVersionId && runtimePublicationKey)
  const dependencyRuleLineageRecorded = Boolean(dependencyRuleVersionId)
    && approvedCandidateEventIds.length > 0
    && sourceDependencyIds.length > 0

  const readiness = evaluateConstructionDependencyRuleCandidateLiveLearningEvidence({
    replayReport: input.replayReport,
    dependencyOutcomeEventRecorded: input.dependencyOutcomeEventRecorded,
    approvedDependencyRuleCandidateRecorded: approvedCandidateEventIds.length > 0,
    enabledLearningScopes: input.enabledLearningScopes,
    runtimeConsumerUsesPublishedArtifact: Boolean(runtimePublicationKey),
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
    missingReasons: readiness.missingReasons,
  }
}
