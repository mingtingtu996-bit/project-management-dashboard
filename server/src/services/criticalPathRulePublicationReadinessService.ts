import {
  evaluateCriticalPathRuleCandidateLiveLearningEvidence,
  type CriticalPathRuleCandidateLiveLearningEvidence,
  type CriticalPathRuleLearningScopeEvidence,
  type CriticalPathSnapshot,
} from './projectCriticalPathService.js'
import {
  collectDurationLiveLearningProductionEvidenceRecordsFromRows,
  collectDurationLiveLearningProductionEvidenceRefs,
  type DurationLiveLearningProductionEvidenceRecord,
  type DurationLiveLearningProductionEvidenceRef,
  type DurationLiveLearningProductionEvidenceSourceRow,
  type DurationLiveLearningRejectedProductionEvidenceRecord,
  type DurationLiveLearningRejectedProductionEvidenceSourceRow,
} from './durationLiveLearningProductionEvidenceGateService.js'

export interface CriticalPathRulePublicationReadinessInput {
  criticalPathSnapshot: CriticalPathSnapshot
  criticalPathOutcomeEventRecorded: boolean
  approvedCandidateEventIds: readonly string[]
  criticalPathRuleVersionId?: string | null
  runtimePublicationKey?: string | null
  rollbackTarget?: string | null
  enabledLearningScopes: readonly CriticalPathRuleLearningScopeEvidence[]
  releaseExitApproved: boolean
  impactMonitoringReady: boolean
  accuracyMetricsAvailable: boolean
}

export interface CriticalPathRulePublicationReadinessFromProductionRowsInput {
  criticalPathSnapshot: CriticalPathSnapshot
  approvedCandidateEventIds: readonly string[]
  enabledLearningScopes: readonly CriticalPathRuleLearningScopeEvidence[]
  sourceRows?: readonly DurationLiveLearningProductionEvidenceSourceRow[]
  records?: readonly DurationLiveLearningProductionEvidenceRecord[]
}

export interface CriticalPathRuleLineage {
  assetType: 'critical_path_rule_candidate'
  criticalPathRuleVersionId: string | null
  runtimePublicationKey: string | null
  rollbackTarget: string | null
  approvedCandidateEventIds: string[]
  criticalPathInputHash: string | null
  criticalSetHash: string | null
  criticalPathAlgorithmVersion: string | null
  criticalTaskIds: string[]
  projectDurationDays: number
}

export interface CriticalPathRuleProductionLineage {
  evidenceRefs: DurationLiveLearningProductionEvidenceRef
  rejectedRows: DurationLiveLearningRejectedProductionEvidenceSourceRow[]
  rejectedRecords: DurationLiveLearningRejectedProductionEvidenceRecord[]
}

export interface CriticalPathRulePublicationReadiness {
  status: 'critical_path_rule_publication_ready' | 'critical_path_rule_publication_not_ready'
  liveLearningEvidence: CriticalPathRuleCandidateLiveLearningEvidence
  criticalPathRuleLineage: CriticalPathRuleLineage
  missingReasons: string[]
}

export type CriticalPathRuleProductionPublicationReadiness =
  CriticalPathRulePublicationReadiness & {
    productionLineage: CriticalPathRuleProductionLineage
  }

const CRITICAL_PATH_RULE_CANDIDATE_ASSET_KEY = 'critical_path_rule_candidate'

function normalizeText(value: unknown): string | null {
  const normalized = String(value ?? '').trim()
  return normalized || null
}

function normalizeStringList(values: readonly unknown[] | undefined): string[] {
  return [...new Set((values ?? [])
    .map((value) => String(value ?? '').trim())
    .filter(Boolean))]
}

function readRowText(row: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = row[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return ''
}

function readRowRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function findCurrentPublishedCriticalPathRuleVersionId(
  sourceRows: readonly DurationLiveLearningProductionEvidenceSourceRow[] | undefined,
) {
  for (const source of sourceRows ?? []) {
    if (source.sourceTable !== 'construction_dependency_rule_runtime_publications') continue
    const row = source.row
    const lineage = readRowRecord(row.dependency_rule_lineage ?? row.dependencyRuleLineage)
    const criticalPathRuleVersionId = readRowText(
      row,
      'critical_path_rule_version_id',
      'criticalPathRuleVersionId',
      'dependency_rule_version_id',
      'dependencyRuleVersionId',
    )
    const publicationKey = readRowText(row, 'publication_key', 'publicationKey')
    const lineageAssetType = readRowText(lineage, 'assetType', 'asset_type')
    if (
      criticalPathRuleVersionId
      && publicationKey
      && publicationKey.startsWith('critical_path_rule_runtime:')
      && readRowText(row, 'runtime_publication_status', 'runtimePublicationStatus') === 'runtime_published'
      && (!lineageAssetType || lineageAssetType === CRITICAL_PATH_RULE_CANDIDATE_ASSET_KEY)
    ) {
      return criticalPathRuleVersionId
    }
  }
  return null
}

function criticalPathRuleProductionLineageFromProductionInput(
  input: Pick<CriticalPathRulePublicationReadinessFromProductionRowsInput, 'sourceRows' | 'records'>,
): CriticalPathRuleProductionLineage {
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
    evidence.assetKey === CRITICAL_PATH_RULE_CANDIDATE_ASSET_KEY)
    ?? { assetKey: CRITICAL_PATH_RULE_CANDIDATE_ASSET_KEY }

  return {
    evidenceRefs,
    rejectedRows: rowCollection.rejectedRows,
    rejectedRecords: evidenceCollection.rejectedRecords,
  }
}

export function buildCriticalPathRulePublicationReadiness(
  input: CriticalPathRulePublicationReadinessInput,
): CriticalPathRulePublicationReadiness {
  const approvedCandidateEventIds = normalizeStringList(input.approvedCandidateEventIds)
  const criticalPathRuleVersionId = normalizeText(input.criticalPathRuleVersionId)
  const runtimePublicationKey = normalizeText(input.runtimePublicationKey)
  const rollbackTarget = normalizeText(input.rollbackTarget)
  const criticalTaskIds = normalizeStringList([
    ...input.criticalPathSnapshot.autoTaskIds,
    ...input.criticalPathSnapshot.displayTaskIds,
  ])
  const criticalPathInputHash = normalizeText(input.criticalPathSnapshot.networkLineage?.criticalPathInputHash)
  const criticalSetHash = normalizeText(input.criticalPathSnapshot.networkLineage?.criticalSetHash)
  const criticalPathAlgorithmVersion = normalizeText(
    input.criticalPathSnapshot.networkLineage?.criticalPathAlgorithmVersion,
  )
  const criticalPathRulePublicationWriterReady = Boolean(criticalPathRuleVersionId && runtimePublicationKey)
  const criticalPathRuleLineageRecorded = Boolean(
    criticalPathRuleVersionId
      && approvedCandidateEventIds.length > 0
      && criticalPathInputHash
      && criticalSetHash,
  )

  const readiness = evaluateCriticalPathRuleCandidateLiveLearningEvidence({
    criticalPathSnapshot: input.criticalPathSnapshot,
    criticalPathOutcomeEventRecorded: input.criticalPathOutcomeEventRecorded,
    approvedCriticalPathRuleCandidateRecorded: approvedCandidateEventIds.length > 0,
    enabledLearningScopes: input.enabledLearningScopes,
    runtimeConsumerUsesPublishedArtifact: Boolean(runtimePublicationKey),
    criticalPathRulePublicationWriterReady,
    criticalPathRuleLineageRecorded,
    releaseExitApproved: input.releaseExitApproved,
    impactMonitoringReady: input.impactMonitoringReady,
    rollbackTargetReady: Boolean(rollbackTarget),
    accuracyMetricsAvailable: input.accuracyMetricsAvailable,
  })

  return {
    status: readiness.status === 'critical_path_rule_candidate_live_learning_ready'
      ? 'critical_path_rule_publication_ready'
      : 'critical_path_rule_publication_not_ready',
    liveLearningEvidence: readiness.liveLearningEvidence,
    criticalPathRuleLineage: {
      assetType: 'critical_path_rule_candidate',
      criticalPathRuleVersionId,
      runtimePublicationKey,
      rollbackTarget,
      approvedCandidateEventIds,
      criticalPathInputHash,
      criticalSetHash,
      criticalPathAlgorithmVersion,
      criticalTaskIds,
      projectDurationDays: input.criticalPathSnapshot.projectDurationDays,
    },
    missingReasons: readiness.missingReasons,
  }
}

export function buildCriticalPathRulePublicationReadinessFromProductionRows(
  input: CriticalPathRulePublicationReadinessFromProductionRowsInput,
): CriticalPathRuleProductionPublicationReadiness {
  const approvedCandidateEventIds = normalizeStringList(input.approvedCandidateEventIds)
  const productionLineage = criticalPathRuleProductionLineageFromProductionInput(input)
  const evidenceRefs = productionLineage.evidenceRefs
  const criticalPathRuleVersionId = findCurrentPublishedCriticalPathRuleVersionId(input.sourceRows)
  const runtimePublicationKey = normalizeText(evidenceRefs.publicationExecutionRef)
  const rollbackTarget = normalizeText(evidenceRefs.rollbackDrillEvidenceRef)
  const criticalTaskIds = normalizeStringList([
    ...input.criticalPathSnapshot.autoTaskIds,
    ...input.criticalPathSnapshot.displayTaskIds,
  ])
  const criticalPathInputHash = normalizeText(input.criticalPathSnapshot.networkLineage?.criticalPathInputHash)
  const criticalSetHash = normalizeText(input.criticalPathSnapshot.networkLineage?.criticalSetHash)
  const criticalPathAlgorithmVersion = normalizeText(
    input.criticalPathSnapshot.networkLineage?.criticalPathAlgorithmVersion,
  )
  const criticalPathRulePublicationWriterReady = Boolean(criticalPathRuleVersionId && runtimePublicationKey)
  const criticalPathRuleLineageRecorded = Boolean(
    criticalPathRuleVersionId
      && approvedCandidateEventIds.length > 0
      && criticalPathInputHash
      && criticalSetHash,
  )

  const readiness = evaluateCriticalPathRuleCandidateLiveLearningEvidence({
    criticalPathSnapshot: input.criticalPathSnapshot,
    criticalPathOutcomeEventRecorded: Boolean(evidenceRefs.productionSampleEvidenceRef),
    approvedCriticalPathRuleCandidateRecorded: approvedCandidateEventIds.length > 0,
    enabledLearningScopes: input.enabledLearningScopes,
    runtimeConsumerUsesPublishedArtifact: Boolean(evidenceRefs.runtimeConsumerObservationRef),
    criticalPathRulePublicationWriterReady,
    criticalPathRuleLineageRecorded,
    releaseExitApproved: Boolean(evidenceRefs.publicationExecutionRef),
    impactMonitoringReady: Boolean(evidenceRefs.impactMonitoringEvidenceRef),
    rollbackTargetReady: Boolean(evidenceRefs.rollbackDrillEvidenceRef),
    accuracyMetricsAvailable: Boolean(evidenceRefs.accuracyEvidenceRef),
  })

  return {
    status: readiness.status === 'critical_path_rule_candidate_live_learning_ready'
      ? 'critical_path_rule_publication_ready'
      : 'critical_path_rule_publication_not_ready',
    liveLearningEvidence: readiness.liveLearningEvidence,
    criticalPathRuleLineage: {
      assetType: 'critical_path_rule_candidate',
      criticalPathRuleVersionId,
      runtimePublicationKey,
      rollbackTarget,
      approvedCandidateEventIds,
      criticalPathInputHash,
      criticalSetHash,
      criticalPathAlgorithmVersion,
      criticalTaskIds,
      projectDurationDays: input.criticalPathSnapshot.projectDurationDays,
    },
    missingReasons: readiness.missingReasons,
    productionLineage,
  }
}
