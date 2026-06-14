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

function hasRef(value: string | null | undefined) {
  return typeof value === 'string' && value.trim().length > 0
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
