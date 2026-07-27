export type AlgorithmAssetRuntimePromotionState =
  | 'not_published'
  | 'published'

export type AlgorithmAssetRuntimeRollbackState =
  | 'rollback_pending'
  | 'rolled_back'

export type AlgorithmAssetPromotionCompletionInput = {
  assetKey: string
  releaseExitStatus?: string | null
  releaseExitHandoffReady?: boolean
  releasePackageId?: string | null
  targetSurface?: string | null
  rollbackTarget?: string | null
  domainWriterExecution?: {
    writerKey?: string | null
    status?: string | null
    wroteRuntimeProjection?: boolean
  } | null
  releaseRecord?: {
    releaseRecordId?: string | null
    publicationStatus?: string | null
  } | null
  consumerVerification?: {
    consumerKey?: string | null
    status?: string | null
    readsPublishedVersion?: boolean
  } | null
  impactMonitoring?: {
    status?: string | null
  } | null
}

export type AlgorithmAssetPromotionCompletionResult = {
  status: 'runtime_promotion_confirmed' | 'promotion_blocked'
  canDeclareRuntimePublished: boolean
  runtimePublicationState: AlgorithmAssetRuntimePromotionState
  reasons: string[]
}

export type AlgorithmAssetRollbackCompletionInput = {
  assetKey: string
  sourcePublicationKey?: string | null
  rollbackTarget?: string | null
  rollbackAuditRecorded?: boolean
  rollbackEventRecorded?: boolean
  rollbackWriterExecution?: {
    writerKey?: string | null
    status?: string | null
    disabledRuntimeProjection?: boolean
  } | null
  consumerVerification?: {
    consumerKey?: string | null
    status?: string | null
    noLongerReadsRolledBackVersion?: boolean
  } | null
}

export type AlgorithmAssetRollbackCompletionResult = {
  status: 'runtime_rollback_confirmed' | 'rollback_blocked'
  canDeclareRollbackComplete: boolean
  runtimePublicationState: AlgorithmAssetRuntimeRollbackState
  reasons: string[]
}

function hasText(value: unknown) {
  return String(value ?? '').trim().length > 0
}

function validReleaseExitStatus(value: unknown) {
  return value === 'release_package_ready' || value === 'canary_package_ready'
}

export function evaluateAlgorithmAssetPromotionCompletion(
  input: AlgorithmAssetPromotionCompletionInput,
): AlgorithmAssetPromotionCompletionResult {
  const reasons: string[] = []

  if (!validReleaseExitStatus(input.releaseExitStatus) || !input.releaseExitHandoffReady || !hasText(input.releasePackageId)) {
    reasons.push('release_exit_handoff_required')
  }
  if (!hasText(input.targetSurface)) reasons.push('target_surface_required')
  if (!hasText(input.rollbackTarget)) reasons.push('rollback_target_required')

  const writer = input.domainWriterExecution
  const writerExecuted = hasText(writer?.writerKey) && writer?.status === 'runtime_written'
  if (!writerExecuted) {
    reasons.push('domain_writer_execution_required')
  }
  if (writerExecuted && !writer?.wroteRuntimeProjection) {
    reasons.push('domain_writer_runtime_projection_required')
  }

  const releaseRecord = input.releaseRecord
  if (!hasText(releaseRecord?.releaseRecordId) || !hasText(releaseRecord?.publicationStatus)) {
    reasons.push('release_record_required')
  }

  const consumer = input.consumerVerification
  if (!hasText(consumer?.consumerKey) || consumer?.status !== 'verified' || !consumer.readsPublishedVersion) {
    reasons.push('consumer_verification_required')
  }

  if (input.impactMonitoring?.status !== 'monitoring_armed') {
    reasons.push('impact_monitoring_required')
  }

  if (reasons.length > 0) {
    return {
      status: 'promotion_blocked',
      canDeclareRuntimePublished: false,
      runtimePublicationState: 'not_published',
      reasons: Array.from(new Set(reasons)),
    }
  }

  return {
    status: 'runtime_promotion_confirmed',
    canDeclareRuntimePublished: true,
    runtimePublicationState: 'published',
    reasons: [],
  }
}

export function evaluateAlgorithmAssetRollbackCompletion(
  input: AlgorithmAssetRollbackCompletionInput,
): AlgorithmAssetRollbackCompletionResult {
  const reasons: string[] = []

  if (!hasText(input.sourcePublicationKey)) reasons.push('source_publication_key_required')
  if (!hasText(input.rollbackTarget)) reasons.push('rollback_target_required')
  if (!input.rollbackAuditRecorded) reasons.push('rollback_audit_record_required')
  if (!input.rollbackEventRecorded) reasons.push('rollback_event_record_required')

  const writer = input.rollbackWriterExecution
  if (!hasText(writer?.writerKey) || writer?.status !== 'runtime_rolled_back') {
    reasons.push('rollback_writer_execution_required')
  }
  if (!writer?.disabledRuntimeProjection) {
    reasons.push('rollback_disable_or_degrade_required')
  }

  const consumer = input.consumerVerification
  if (!hasText(consumer?.consumerKey) || consumer?.status !== 'verified' || !consumer.noLongerReadsRolledBackVersion) {
    reasons.push('consumer_no_longer_reads_rolled_back_version_required')
  }

  if (reasons.length > 0) {
    return {
      status: 'rollback_blocked',
      canDeclareRollbackComplete: false,
      runtimePublicationState: 'rollback_pending',
      reasons: Array.from(new Set(reasons)),
    }
  }

  return {
    status: 'runtime_rollback_confirmed',
    canDeclareRollbackComplete: true,
    runtimePublicationState: 'rolled_back',
    reasons: [],
  }
}
