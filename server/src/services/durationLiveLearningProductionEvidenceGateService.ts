import type {
  DurationLiveLearningCompletionAudit,
} from './durationLiveLearningCompletionAuditService.js'
import type {
  DurationLiveLearningAssetKey,
} from './durationLiveLearningClosureService.js'

export type DurationLiveLearningProductionEvidenceReasonCode =
  | 'completion_audit_ready_required'
  | 'production_sample_evidence_required'
  | 'publication_execution_evidence_required'
  | 'runtime_consumer_observation_required'
  | 'impact_monitoring_evidence_required'
  | 'rollback_drill_evidence_required'
  | 'accuracy_evidence_required'

export interface DurationLiveLearningProductionEvidenceRef {
  assetKey: DurationLiveLearningAssetKey
  productionSampleEvidenceRef?: string | null
  publicationExecutionRef?: string | null
  runtimeConsumerObservationRef?: string | null
  impactMonitoringEvidenceRef?: string | null
  rollbackDrillEvidenceRef?: string | null
  accuracyEvidenceRef?: string | null
}

export type DurationLiveLearningProductionEvidenceKind =
  | 'production_sample'
  | 'publication_execution'
  | 'runtime_consumer_observation'
  | 'impact_monitoring'
  | 'rollback_drill'
  | 'accuracy'

export interface DurationLiveLearningProductionEvidenceRecord {
  assetKey: DurationLiveLearningAssetKey
  evidenceKind: DurationLiveLearningProductionEvidenceKind
  evidenceRef?: string | null
  evidenceStatus?: string | null
}

export interface DurationLiveLearningRejectedProductionEvidenceRecord {
  assetKey: DurationLiveLearningAssetKey
  evidenceKind: DurationLiveLearningProductionEvidenceKind
  evidenceRef?: string | null
  evidenceStatus?: string | null
  reason:
    | 'production_evidence_ref_required'
    | 'production_evidence_status_not_accepted'
    | 'production_evidence_ref_source_not_allowed'
}

export interface DurationLiveLearningProductionEvidenceCollectionInput {
  records?: readonly DurationLiveLearningProductionEvidenceRecord[]
}

export interface DurationLiveLearningProductionEvidenceCollection {
  productionEvidence: DurationLiveLearningProductionEvidenceRef[]
  rejectedRecords: DurationLiveLearningRejectedProductionEvidenceRecord[]
}

export interface DurationLiveLearningProductionEvidenceGateInput {
  completionAudit: DurationLiveLearningCompletionAudit
  productionEvidence?: readonly DurationLiveLearningProductionEvidenceRef[]
}

export interface DurationLiveLearningProductionEvidenceGap {
  assetKey: DurationLiveLearningAssetKey
  missingReasonCodes: DurationLiveLearningProductionEvidenceReasonCode[]
}

export interface DurationLiveLearningProductionEvidenceGate {
  status:
    | 'duration_live_learning_production_evidence_ready'
    | 'duration_live_learning_production_evidence_not_ready'
  allowedClaim: DurationLiveLearningCompletionAudit['allowedClaim']
  prohibitedClaim: DurationLiveLearningCompletionAudit['prohibitedClaim']
  completionAuditStatus: DurationLiveLearningCompletionAudit['status']
  productionEvidenceAssetKeys: DurationLiveLearningAssetKey[]
  missingEvidenceByAsset: DurationLiveLearningProductionEvidenceGap[]
}

export interface DurationLiveLearningProductionClaimAuditInput {
  completionAudit: DurationLiveLearningCompletionAudit
  records?: readonly DurationLiveLearningProductionEvidenceRecord[]
}

export interface DurationLiveLearningProductionClaimAudit {
  status:
    | 'duration_live_learning_production_claim_ready'
    | 'duration_live_learning_production_claim_not_ready'
  allowedClaim: DurationLiveLearningCompletionAudit['allowedClaim']
  prohibitedClaim: DurationLiveLearningCompletionAudit['prohibitedClaim']
  completionAudit: DurationLiveLearningCompletionAudit
  evidenceCollection: DurationLiveLearningProductionEvidenceCollection
  productionGate: DurationLiveLearningProductionEvidenceGate
}

function hasRef(value: string | null | undefined) {
  return typeof value === 'string' && value.trim().length > 0
}

function normalizeText(value: string | null | undefined) {
  return typeof value === 'string' ? value.trim() : ''
}

function acceptedStatusesFor(kind: DurationLiveLearningProductionEvidenceKind) {
  if (kind === 'production_sample') return new Set(['accepted', 'weak'])
  if (kind === 'publication_execution') return new Set(['published', 'canary'])
  if (kind === 'runtime_consumer_observation') return new Set(['observed'])
  if (kind === 'impact_monitoring') return new Set(['monitoring_armed', 'monitoring_running', 'monitoring_passed'])
  if (kind === 'rollback_drill') return new Set(['rollback_verified', 'rollback_executed'])
  return new Set(['accuracy_passed'])
}

function acceptedRefPrefixesFor(kind: DurationLiveLearningProductionEvidenceKind) {
  if (kind === 'production_sample') return ['duration_samples:', 'duration_outcomes:', 'network_outcomes:']
  if (kind === 'publication_execution') {
    return [
      'release_execution:',
      'algorithm_seed_versions:',
      'algorithm_learnable_parameter_runtime_publications:',
      'wbs_reference_days_runtime:',
      'dependency_rule_runtime:',
      'critical_path_rule_runtime:',
      'duration_benchmark_runtime:',
    ]
  }
  if (kind === 'runtime_consumer_observation') return ['runtime_consumer:', 'runtime_consumption:']
  if (kind === 'impact_monitoring') return ['impact_monitoring:']
  if (kind === 'rollback_drill') return ['rollback:']
  return ['accuracy:', 'duration_algorithm_accuracy_events:', 'duration_accuracy_replay:']
}

function hasAcceptedRefSource(kind: DurationLiveLearningProductionEvidenceKind, evidenceRef: string) {
  return acceptedRefPrefixesFor(kind).some((prefix) => evidenceRef.startsWith(prefix))
}

function assignEvidenceRef(
  target: DurationLiveLearningProductionEvidenceRef,
  kind: DurationLiveLearningProductionEvidenceKind,
  evidenceRef: string,
) {
  if (kind === 'production_sample') target.productionSampleEvidenceRef ??= evidenceRef
  if (kind === 'publication_execution') target.publicationExecutionRef ??= evidenceRef
  if (kind === 'runtime_consumer_observation') target.runtimeConsumerObservationRef ??= evidenceRef
  if (kind === 'impact_monitoring') target.impactMonitoringEvidenceRef ??= evidenceRef
  if (kind === 'rollback_drill') target.rollbackDrillEvidenceRef ??= evidenceRef
  if (kind === 'accuracy') target.accuracyEvidenceRef ??= evidenceRef
}

export function collectDurationLiveLearningProductionEvidenceRefs(
  input: DurationLiveLearningProductionEvidenceCollectionInput,
): DurationLiveLearningProductionEvidenceCollection {
  const evidenceByAssetKey = new Map<DurationLiveLearningAssetKey, DurationLiveLearningProductionEvidenceRef>()
  const rejectedRecords: DurationLiveLearningRejectedProductionEvidenceRecord[] = []

  for (const record of input.records ?? []) {
    const evidenceRef = normalizeText(record.evidenceRef)
    if (!evidenceRef) {
      rejectedRecords.push({ ...record, reason: 'production_evidence_ref_required' })
      continue
    }

    const acceptedStatuses = acceptedStatusesFor(record.evidenceKind)
    if (!acceptedStatuses.has(normalizeText(record.evidenceStatus))) {
      rejectedRecords.push({ ...record, reason: 'production_evidence_status_not_accepted' })
      continue
    }
    if (!hasAcceptedRefSource(record.evidenceKind, evidenceRef)) {
      rejectedRecords.push({ ...record, reason: 'production_evidence_ref_source_not_allowed' })
      continue
    }

    const current = evidenceByAssetKey.get(record.assetKey) ?? { assetKey: record.assetKey }
    assignEvidenceRef(current, record.evidenceKind, evidenceRef)
    evidenceByAssetKey.set(record.assetKey, current)
  }

  return {
    productionEvidence: [...evidenceByAssetKey.values()],
    rejectedRecords,
  }
}

function buildProductionEvidenceMap(
  productionEvidence: readonly DurationLiveLearningProductionEvidenceRef[] | undefined,
) {
  const map = new Map<DurationLiveLearningAssetKey, DurationLiveLearningProductionEvidenceRef>()
  for (const evidence of productionEvidence ?? []) {
    map.set(evidence.assetKey, evidence)
  }
  return map
}

function evaluateAssetEvidence(
  assetKey: DurationLiveLearningAssetKey,
  evidence: DurationLiveLearningProductionEvidenceRef | undefined,
): DurationLiveLearningProductionEvidenceGap | null {
  const missingReasonCodes: DurationLiveLearningProductionEvidenceReasonCode[] = []

  if (!hasRef(evidence?.productionSampleEvidenceRef)) {
    missingReasonCodes.push('production_sample_evidence_required')
  }
  if (!hasRef(evidence?.publicationExecutionRef)) {
    missingReasonCodes.push('publication_execution_evidence_required')
  }
  if (!hasRef(evidence?.runtimeConsumerObservationRef)) {
    missingReasonCodes.push('runtime_consumer_observation_required')
  }
  if (!hasRef(evidence?.impactMonitoringEvidenceRef)) {
    missingReasonCodes.push('impact_monitoring_evidence_required')
  }
  if (!hasRef(evidence?.rollbackDrillEvidenceRef)) {
    missingReasonCodes.push('rollback_drill_evidence_required')
  }
  if (!hasRef(evidence?.accuracyEvidenceRef)) {
    missingReasonCodes.push('accuracy_evidence_required')
  }

  return missingReasonCodes.length > 0
    ? { assetKey, missingReasonCodes }
    : null
}

export function evaluateDurationLiveLearningProductionEvidenceGate(
  input: DurationLiveLearningProductionEvidenceGateInput,
): DurationLiveLearningProductionEvidenceGate {
  const productionEvidenceMap = buildProductionEvidenceMap(input.productionEvidence)
  const missingEvidenceByAsset = input.completionAudit.learnableAssetKeys
    .map((assetKey) => evaluateAssetEvidence(assetKey, productionEvidenceMap.get(assetKey)))
    .filter((gap): gap is DurationLiveLearningProductionEvidenceGap => Boolean(gap))

  if (input.completionAudit.status !== 'duration_live_learning_completion_ready') {
    missingEvidenceByAsset.unshift({
      assetKey: input.completionAudit.learnableAssetKeys[0] ?? 'base_duration_benchmark',
      missingReasonCodes: ['completion_audit_ready_required'],
    })
  }

  const ready = input.completionAudit.status === 'duration_live_learning_completion_ready'
    && missingEvidenceByAsset.length === 0

  return {
    status: ready
      ? 'duration_live_learning_production_evidence_ready'
      : 'duration_live_learning_production_evidence_not_ready',
    allowedClaim: ready
      ? input.completionAudit.allowedClaim
      : 'not_ready_for_live_self_learning_claim',
    prohibitedClaim: input.completionAudit.prohibitedClaim,
    completionAuditStatus: input.completionAudit.status,
    productionEvidenceAssetKeys: input.completionAudit.learnableAssetKeys.filter((assetKey) =>
      productionEvidenceMap.has(assetKey)),
    missingEvidenceByAsset,
  }
}

export function buildDurationLiveLearningProductionClaimAudit(
  input: DurationLiveLearningProductionClaimAuditInput,
): DurationLiveLearningProductionClaimAudit {
  const evidenceCollection = collectDurationLiveLearningProductionEvidenceRefs({
    records: input.records,
  })
  const productionGate = evaluateDurationLiveLearningProductionEvidenceGate({
    completionAudit: input.completionAudit,
    productionEvidence: evidenceCollection.productionEvidence,
  })
  const ready = productionGate.status === 'duration_live_learning_production_evidence_ready'

  return {
    status: ready
      ? 'duration_live_learning_production_claim_ready'
      : 'duration_live_learning_production_claim_not_ready',
    allowedClaim: productionGate.allowedClaim,
    prohibitedClaim: productionGate.prohibitedClaim,
    completionAudit: input.completionAudit,
    evidenceCollection,
    productionGate,
  }
}
