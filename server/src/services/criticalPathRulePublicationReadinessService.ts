import {
  evaluateCriticalPathRuleCandidateLiveLearningEvidence,
  type CriticalPathRuleCandidateLiveLearningEvidence,
  type CriticalPathRuleLearningScopeEvidence,
  type CriticalPathSnapshot,
} from './projectCriticalPathService.js'

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

export interface CriticalPathRulePublicationReadiness {
  status: 'critical_path_rule_publication_ready' | 'critical_path_rule_publication_not_ready'
  liveLearningEvidence: CriticalPathRuleCandidateLiveLearningEvidence
  criticalPathRuleLineage: CriticalPathRuleLineage
  missingReasons: string[]
}

function normalizeText(value: unknown): string | null {
  const normalized = String(value ?? '').trim()
  return normalized || null
}

function normalizeStringList(values: readonly unknown[] | undefined): string[] {
  return [...new Set((values ?? [])
    .map((value) => String(value ?? '').trim())
    .filter(Boolean))]
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
