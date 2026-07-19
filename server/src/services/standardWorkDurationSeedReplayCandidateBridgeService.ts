import { logger } from '../middleware/logger.js'
import { normalizeAlgorithmSeedRecordPayload } from './algorithmSeedRegistry.js'
import {
  createAlgorithmSeedUpgradeCandidate,
  type AlgorithmSeedCandidateSource,
} from './algorithmSeedLearningService.js'
import type {
  StandardWorkDurationSeedReplayCalibrationQueueItem,
  StandardWorkDurationSeedLearningScopeEvidence,
  StandardWorkDurationSeedLiveLearningEvidence,
} from './standardWorkDurationSeedReplayService.js'
import {
  evaluateStandardWorkDurationSeedLiveLearningEvidence,
} from './standardWorkDurationSeedReplayService.js'
import type {
  StandardWorkDurationSeedReplayGovernanceReport,
} from './standardWorkDurationSeedReplayGovernanceService.js'
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

export interface StandardWorkDurationReplayCandidateBridgeResult {
  attemptedCandidateCount: number
  candidateOnlyUpsertedCount: number
  p50ReviewCandidateOnlyCount: number
  missingSeedCandidateOnlyCount: number
  evidenceCollectionSkippedCount: number
  failedCandidateCount: number
  seedWritesBlocked: number
  failed: Array<{ stableCode: string; standardWorkCode: string; reason: string }>
}

export interface StandardWorkDurationSeedPublicationReadinessInput {
  report: StandardWorkDurationSeedReplayGovernanceReport
  bridgeResult: StandardWorkDurationReplayCandidateBridgeResult
  approvedCandidateIds: readonly string[]
  seedVersionId?: string | null
  runtimePublicationKey?: string | null
  runtimeConsumerObservationRef?: string | null
  runtimeConsumerPublicationKey?: string | null
  rollbackTarget?: string | null
  enabledLearningScopes: readonly StandardWorkDurationSeedLearningScopeEvidence[]
  releaseExitApproved: boolean
  impactMonitoringReady: boolean
  accuracyMetricsAvailable: boolean
}

export interface StandardWorkDurationSeedPublicationReadinessFromProductionRowsInput {
  report: StandardWorkDurationSeedReplayGovernanceReport
  bridgeResult: StandardWorkDurationReplayCandidateBridgeResult
  approvedCandidateIds: readonly string[]
  enabledLearningScopes: readonly StandardWorkDurationSeedLearningScopeEvidence[]
  sourceRows?: readonly DurationLiveLearningProductionEvidenceSourceRow[]
  records?: readonly DurationLiveLearningProductionEvidenceRecord[]
}

export interface StandardWorkDurationSeedVersionLineage {
  seedType: 'standard_work_duration'
  seedVersionId: string | null
  runtimePublicationKey: string | null
  rollbackTarget: string | null
  replayReportCode: 'standard_work_duration_seed_p50_replay'
  governanceReportCode: 'standard_work_duration_seed_replay_governance'
  approvedCandidateIds: string[]
  sourceSampleIds: string[]
}

export interface StandardWorkDurationSeedProductionLineage {
  evidenceRefs: DurationLiveLearningProductionEvidenceRef
  rejectedRows: DurationLiveLearningRejectedProductionEvidenceSourceRow[]
  rejectedRecords: DurationLiveLearningRejectedProductionEvidenceRecord[]
}

export interface StandardWorkDurationSeedPublicationReadiness {
  status: 'standard_work_seed_publication_ready' | 'standard_work_seed_publication_not_ready'
  liveLearningEvidence: StandardWorkDurationSeedLiveLearningEvidence
  seedVersionLineage: StandardWorkDurationSeedVersionLineage
  missingReasons: string[]
}

export type StandardWorkDurationSeedProductionPublicationReadiness =
  StandardWorkDurationSeedPublicationReadiness & {
    productionLineage: StandardWorkDurationSeedProductionLineage
  }

type ReplayQueueKind = 'p50_review' | 'missing_seed'

const STANDARD_WORK_DURATION_SEED_ASSET_KEY = 'standard_work_duration_seed'

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

function readRowText(row: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = row[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return ''
}

function normalizeDays(value: unknown) {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? Math.max(1, Math.round(number)) : 1
}

function stableSegment(value: unknown) {
  return normalizeText(value)
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    || 'unknown'
}

function resolveCandidateSource(report: StandardWorkDurationSeedReplayGovernanceReport): AlgorithmSeedCandidateSource {
  if (report.projectId) return 'project_history'
  if (report.companyId) return 'company_history'
  return 'system_observation'
}

function resolveConfidenceLevel(item: StandardWorkDurationSeedReplayCalibrationQueueItem): 'high' | 'medium' | 'low' {
  if (item.sampleCount >= 20) return 'high'
  if (item.sampleCount >= 5) return 'medium'
  return 'low'
}

function assertReplayBridgeBoundary(report: StandardWorkDurationSeedReplayGovernanceReport) {
  const isSafeBoundary = report.governanceBoundary.reportOnly === true
    && report.governanceBoundary.seedWritePolicy === 'never_write_seed_from_replay'
    && report.replay.governancePolicy.replayMode === 'report_only'
    && report.replay.governancePolicy.seedWritePolicy === 'never_write_seed_from_replay'
    && report.replay.governancePolicy.candidatePolicy === 'review_required_before_seed_promotion'

  if (!isSafeBoundary) {
    throw Object.assign(new Error('standard work duration replay candidate bridge requires report-only replay governance'), {
      code: 'STANDARD_DURATION_REPLAY_CANDIDATE_BRIDGE_BOUNDARY_VIOLATION',
    })
  }
}

function buildStableCode(item: StandardWorkDurationSeedReplayCalibrationQueueItem) {
  return normalizeText(item.seedStableCode)
    || `replay:standard_work_duration:${stableSegment(item.standardWorkCode)}:${stableSegment(item.replayContextKey)}`
}

function buildEvidenceSourceKeys(item: StandardWorkDurationSeedReplayCalibrationQueueItem) {
  return item.sampleIds
    .map((id) => normalizeText(id))
    .filter(Boolean)
    .map((id) => `duration_experience_samples:${id}`)
}

function buildPublicationSourceSampleIds(report: StandardWorkDurationSeedReplayGovernanceReport) {
  return Array.from(new Set([
    ...report.replay.calibrationQueues.p50ReviewCandidates.flatMap((item) => item.sampleIds),
    ...report.replay.calibrationQueues.missingSeedCandidates.flatMap((item) => item.sampleIds),
  ].map(normalizeText).filter(Boolean)))
}

function findCurrentPublishedStandardWorkSeedVersionId(
  sourceRows: readonly DurationLiveLearningProductionEvidenceSourceRow[] | undefined,
) {
  for (const source of sourceRows ?? []) {
    if (source.sourceTable !== 'duration_learning_runtime_publications') continue
    const row = source.row
    const seedVersionId = readRowText(row, 'artifact_key', 'artifactKey')
    if (
      seedVersionId
      && readRowText(row, 'asset_key', 'assetKey') === STANDARD_WORK_DURATION_SEED_ASSET_KEY
      && readRowText(row, 'publication_key', 'publicationKey')
      && ['canary', 'stable'].includes(readRowText(row, 'publication_stage', 'publicationStage'))
    ) {
      return seedVersionId
    }
  }
  return null
}

function standardWorkSeedProductionLineageFromProductionInput(
  input: Pick<StandardWorkDurationSeedPublicationReadinessFromProductionRowsInput, 'sourceRows' | 'records'>,
): StandardWorkDurationSeedProductionLineage {
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
    evidence.assetKey === STANDARD_WORK_DURATION_SEED_ASSET_KEY)
    ?? { assetKey: STANDARD_WORK_DURATION_SEED_ASSET_KEY }

  return {
    evidenceRefs,
    rejectedRows: rowCollection.rejectedRows,
    rejectedRecords: [
      ...evidenceCollection.rejectedRecords,
      ...directRecordCollection.rejectedRecords,
    ],
  }
}

function standardWorkSeedObservationMatchesPublication(
  evidenceRefs: DurationLiveLearningProductionEvidenceRef,
) {
  const publicationKey = normalizeText(evidenceRefs.publicationExecutionRef)
  const observedPublicationKey = normalizeText(evidenceRefs.runtimeConsumerPublicationKey)
  return Boolean(publicationKey)
    && Boolean(observedPublicationKey)
    && (
      publicationKey === observedPublicationKey
      || publicationKey.endsWith(`:${observedPublicationKey}`)
    )
}

function standardWorkSeedRuntimePublicationKeyFromExecutionRef(value: unknown) {
  const executionRef = normalizeText(value)
  if (!executionRef) return null
  const prefix = 'duration_learning_runtime_publications:'
  return executionRef.startsWith(prefix) ? executionRef.slice(prefix.length) : executionRef
}

function buildCandidatePayload(
  report: StandardWorkDurationSeedReplayGovernanceReport,
  item: StandardWorkDurationSeedReplayCalibrationQueueItem,
  queueKind: ReplayQueueKind,
) {
  const p50Days = normalizeDays(item.medianActualDays)
  const fixedDays = Math.min(p50Days, Math.max(1, Math.floor(p50Days * 0.2)))
  const stableCode = buildStableCode(item)
  const evidenceSourceKeys = buildEvidenceSourceKeys(item)
  const scope = report.projectId ? 'project' : report.companyId ? 'company' : 'global'
  const standardWorkCode = normalizeText(item.standardWorkCode)
  const replayContextGroupKey = [standardWorkCode, normalizeText(item.replayContextKey)].filter(Boolean).join(':')
  const experienceGroupKeys = Array.from(new Set([
    `T1:standard_work:${standardWorkCode}`,
    `T1:replay_context:${replayContextGroupKey}`,
    `T1:seed_candidate:${stableCode}`,
  ].filter(Boolean)))
  const autoGovernEligible = queueKind === 'p50_review' && Boolean(report.projectId)

  return normalizeAlgorithmSeedRecordPayload('standard_work_duration', {
    stableCode,
    companyId: report.companyId ?? null,
    projectId: report.projectId ?? null,
    seedRuleId: stableCode,
    ruleVersion: 1,
    isActive: true,
    standardWorkCodes: [item.standardWorkCode],
    keywords: [item.standardWorkCode, item.replayContextKey].map(normalizeText).filter(Boolean),
    defaultDays: p50Days,
    defaultDaysP50: p50Days,
    durationContributionMode: 'duration_bearing',
    baseDaysEligible: true,
    fixedDays,
    variableDays: Math.max(0, p50Days - fixedDays),
    scaleBasis: 'workface',
    confidence: resolveConfidenceLevel(item),
    benchmarkBasis: `Replay median actual duration from ${item.sampleCount} completed benchmark samples.`,
    sourceStandard: 'enterprise_duration_replay',
    sourceVersion: 'v1.4.18-replay-candidate-bridge',
    sourceClauseRef: 'duration_experience_samples.actual_duration',
    evidenceSourceKeys,
    experienceTier: 'T1',
    reuseScope: scope,
    learningScope: scope,
    wbsNodeTypes: ['process', 'activity_step', 'task'],
    experienceAssetType: 'process_duration',
    experienceGroupKeys,
    experienceTierRegistryCandidate: {
      tier: 'T1',
      reusableAtNodeTypes: ['process', 'activity_step', 'task'],
      groupKeyStrategy: 'standard_work_process_dependency',
      prohibitsCrossTierBucketMixing: true,
      requiredRegistry: 'experienceTierRegistry',
      registryStatus: 'candidate_payload_ready_pending_registry_materialization',
    },
    evidenceQuality: {
      source_type: 'enterprise_practice',
      source_doc: 'duration_experience_samples',
      source_url: null,
      evidence_source_keys: evidenceSourceKeys,
      applicable_region_scope: scope,
    },
    webVerified: false,
    reviewNeeded: true,
    replayCandidateBridge: true,
    replayQueueKind: queueKind,
    runtimeGovernancePolicy: autoGovernEligible
      ? 'auto_govern_only_through_duration_learning_lifecycle'
      : 'candidate_only_no_runtime_effect_until_governed',
    seedWritePolicy: 'never_write_seed_from_replay',
    promotionPolicy: 'review_required_before_seed_promotion',
  })
}

function buildEvidenceSummary(
  report: StandardWorkDurationSeedReplayGovernanceReport,
  item: StandardWorkDurationSeedReplayCalibrationQueueItem,
  queueKind: ReplayQueueKind,
) {
  const autoGovernEligible = queueKind === 'p50_review' && Boolean(report.projectId)
  return {
    replayReportCode: report.replay.reportCode,
    governanceReportCode: report.reportCode,
    replayContextKey: item.replayContextKey,
    replayQueueKind: queueKind,
    queueStatus: item.queueStatus,
    recommendation: item.recommendation,
    seedStableCode: item.seedStableCode,
    seedP50Days: item.seedP50Days,
    replayMedianActualDays: item.medianActualDays,
    p50Days: normalizeDays(item.medianActualDays),
    sampleCount: item.sampleCount,
    sampleIds: item.sampleIds,
    medianAbsolutePercentageError: item.medianAbsolutePercentageError,
    withinThirtyPercentRatio: item.withinThirtyPercentRatio,
    biasDirection: item.biasDirection,
    selectedConditionCode: item.selectedConditionCode,
    seedConfidence: item.seedConfidence,
    sourceTable: report.source.table,
    seedWritePolicy: 'never_write_seed_from_replay',
    promotionPolicy: 'review_required_before_seed_promotion',
    runtimeEffectPolicy: autoGovernEligible
      ? 'auto_govern_only_through_duration_learning_lifecycle'
      : 'candidate_only_no_runtime_effect_until_governed',
  }
}

async function persistCandidate(
  report: StandardWorkDurationSeedReplayGovernanceReport,
  item: StandardWorkDurationSeedReplayCalibrationQueueItem,
  queueKind: ReplayQueueKind,
) {
  const stableCode = buildStableCode(item)
  const autoGovernEligible = queueKind === 'p50_review' && Boolean(report.projectId)
  return createAlgorithmSeedUpgradeCandidate({
    seedType: 'standard_work_duration',
    stableCode,
    candidatePayload: buildCandidatePayload(report, item, queueKind),
    candidateSource: resolveCandidateSource(report),
    projectId: report.projectId,
    companyId: report.companyId,
    sampleCount: item.sampleCount,
    variance: item.medianAbsolutePercentageError ?? null,
    confidenceLevel: resolveConfidenceLevel(item),
    evidenceSummary: buildEvidenceSummary(report, item, queueKind),
    actionPolicy: autoGovernEligible ? 'auto_govern' : 'candidate_only',
  })
}

export async function createStandardWorkDurationReplayUpgradeCandidates(
  report: StandardWorkDurationSeedReplayGovernanceReport,
): Promise<StandardWorkDurationReplayCandidateBridgeResult> {
  assertReplayBridgeBoundary(report)

  const result: StandardWorkDurationReplayCandidateBridgeResult = {
    attemptedCandidateCount: 0,
    candidateOnlyUpsertedCount: 0,
    p50ReviewCandidateOnlyCount: 0,
    missingSeedCandidateOnlyCount: 0,
    evidenceCollectionSkippedCount: report.replay.calibrationQueues.evidenceCollectionCandidates.length,
    failedCandidateCount: 0,
    seedWritesBlocked: 1,
    failed: [],
  }

  if (!normalizeText(report.projectId)) {
    result.evidenceCollectionSkippedCount += report.replay.calibrationQueues.p50ReviewCandidates.length
      + report.replay.calibrationQueues.missingSeedCandidates.length
    return result
  }

  const candidates: Array<{
    item: StandardWorkDurationSeedReplayCalibrationQueueItem
    queueKind: ReplayQueueKind
  }> = [
    ...report.replay.calibrationQueues.p50ReviewCandidates.map((item) => ({ item, queueKind: 'p50_review' as const })),
    ...report.replay.calibrationQueues.missingSeedCandidates.map((item) => ({ item, queueKind: 'missing_seed' as const })),
  ]

  for (const { item, queueKind } of candidates) {
    const stableCode = buildStableCode(item)
    result.attemptedCandidateCount += 1
    try {
      await persistCandidate(report, item, queueKind)
      result.candidateOnlyUpsertedCount += 1
      if (queueKind === 'p50_review') result.p50ReviewCandidateOnlyCount += 1
      if (queueKind === 'missing_seed') result.missingSeedCandidateOnlyCount += 1
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      result.failedCandidateCount += 1
      result.failed.push({ stableCode, standardWorkCode: item.standardWorkCode, reason })
      logger.warn('[standardWorkDurationSeedReplayCandidateBridgeService] failed to persist replay candidate', {
        stableCode,
        standardWorkCode: item.standardWorkCode,
        reason,
      })
    }
  }

  return result
}

export function buildStandardWorkDurationSeedPublicationReadiness(
  input: StandardWorkDurationSeedPublicationReadinessInput,
): StandardWorkDurationSeedPublicationReadiness {
  assertReplayBridgeBoundary(input.report)
  const approvedCandidateIds = Array.from(new Set(input.approvedCandidateIds.map(normalizeText).filter(Boolean)))
  const seedVersionId = normalizeText(input.seedVersionId) || null
  const runtimePublicationKey = normalizeText(input.runtimePublicationKey) || null
  const runtimeConsumerObservationRef = normalizeText(input.runtimeConsumerObservationRef) || null
  const runtimeConsumerPublicationKey = normalizeText(input.runtimeConsumerPublicationKey) || null
  const rollbackTarget = normalizeText(input.rollbackTarget) || null
  const sourceSampleIds = buildPublicationSourceSampleIds(input.report)
  const seedPublicationWriterReady = Boolean(seedVersionId && runtimePublicationKey)
    && input.bridgeResult.candidateOnlyUpsertedCount > 0
    && input.bridgeResult.failedCandidateCount === 0
  const seedVersionLineageRecorded = Boolean(seedVersionId)
    && approvedCandidateIds.length > 0
    && sourceSampleIds.length > 0
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
  const readiness = evaluateStandardWorkDurationSeedLiveLearningEvidence({
    replayReport: input.report.replay,
    actualOutcomeEventRecorded: input.report.replay.summary.eligibleSampleCount > 0
      && input.report.replay.summary.evaluatedCodeCount > 0,
    approvedReplayCandidateRecorded: approvedCandidateIds.length > 0,
    enabledLearningScopes: input.enabledLearningScopes,
    runtimeConsumerUsesPublishedArtifact: runtimeConsumerObservationMatchesPublication,
    seedPublicationWriterReady,
    seedVersionLineageRecorded,
    releaseExitApproved: input.releaseExitApproved,
    impactMonitoringReady: input.impactMonitoringReady,
    rollbackTargetReady: Boolean(rollbackTarget),
    accuracyMetricsAvailable: input.accuracyMetricsAvailable,
  })

  return {
    status: readiness.status === 'standard_work_seed_live_learning_ready'
      ? 'standard_work_seed_publication_ready'
      : 'standard_work_seed_publication_not_ready',
    liveLearningEvidence: readiness.liveLearningEvidence,
    seedVersionLineage: {
      seedType: 'standard_work_duration',
      seedVersionId,
      runtimePublicationKey,
      rollbackTarget,
      replayReportCode: input.report.replay.reportCode,
      governanceReportCode: input.report.reportCode,
      approvedCandidateIds,
      sourceSampleIds,
    },
    missingReasons: Array.from(new Set([
      ...readiness.missingReasons,
      runtimeConsumerPublicationMismatched ? 'runtime_consumer_publication_mismatch' : '',
    ].filter(Boolean))),
  }
}

export function buildStandardWorkDurationSeedPublicationReadinessFromProductionRows(
  input: StandardWorkDurationSeedPublicationReadinessFromProductionRowsInput,
): StandardWorkDurationSeedProductionPublicationReadiness {
  assertReplayBridgeBoundary(input.report)
  const approvedCandidateIds = Array.from(new Set(input.approvedCandidateIds.map(normalizeText).filter(Boolean)))
  const productionLineage = standardWorkSeedProductionLineageFromProductionInput(input)
  const evidenceRefs = productionLineage.evidenceRefs
  const seedVersionId = findCurrentPublishedStandardWorkSeedVersionId(input.sourceRows)
  const runtimePublicationKey = standardWorkSeedRuntimePublicationKeyFromExecutionRef(
    evidenceRefs.publicationExecutionRef,
  )
  const rollbackTarget = normalizeText(evidenceRefs.rollbackDrillEvidenceRef) || null
  const hasRuntimeConsumerObservation = Boolean(evidenceRefs.runtimeConsumerObservationRef)
  const runtimeConsumerObservationMatchesPublication = hasRuntimeConsumerObservation
    && standardWorkSeedObservationMatchesPublication(evidenceRefs)
  const sourceSampleIds = buildPublicationSourceSampleIds(input.report)
  const seedPublicationWriterReady = Boolean(seedVersionId && runtimePublicationKey)
    && input.bridgeResult.candidateOnlyUpsertedCount > 0
    && input.bridgeResult.failedCandidateCount === 0
  const seedVersionLineageRecorded = Boolean(seedVersionId)
    && approvedCandidateIds.length > 0
    && sourceSampleIds.length > 0
  const readiness = evaluateStandardWorkDurationSeedLiveLearningEvidence({
    replayReport: input.report.replay,
    actualOutcomeEventRecorded: Boolean(evidenceRefs.productionSampleEvidenceRef),
    approvedReplayCandidateRecorded: approvedCandidateIds.length > 0,
    enabledLearningScopes: input.enabledLearningScopes,
    runtimeConsumerUsesPublishedArtifact: runtimeConsumerObservationMatchesPublication,
    seedPublicationWriterReady,
    seedVersionLineageRecorded,
    releaseExitApproved: Boolean(evidenceRefs.publicationExecutionRef),
    impactMonitoringReady: Boolean(evidenceRefs.impactMonitoringEvidenceRef),
    rollbackTargetReady: Boolean(evidenceRefs.rollbackDrillEvidenceRef),
    accuracyMetricsAvailable: Boolean(evidenceRefs.accuracyEvidenceRef),
  })

  return {
    status: readiness.status === 'standard_work_seed_live_learning_ready'
      ? 'standard_work_seed_publication_ready'
      : 'standard_work_seed_publication_not_ready',
    liveLearningEvidence: readiness.liveLearningEvidence,
    seedVersionLineage: {
      seedType: 'standard_work_duration',
      seedVersionId,
      runtimePublicationKey,
      rollbackTarget,
      replayReportCode: input.report.replay.reportCode,
      governanceReportCode: input.report.reportCode,
      approvedCandidateIds,
      sourceSampleIds,
    },
    missingReasons: Array.from(new Set([
      ...readiness.missingReasons,
      hasRuntimeConsumerObservation && !runtimeConsumerObservationMatchesPublication
        ? 'runtime_consumer_publication_mismatch'
        : '',
    ].filter(Boolean))),
    productionLineage,
  }
}
