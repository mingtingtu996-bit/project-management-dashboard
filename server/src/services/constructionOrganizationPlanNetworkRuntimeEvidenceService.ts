import {
  constructionOrganizationProductOutcomeProjectionOnlyContextReasons,
} from './constructionOrganizationProductOutcomeEvidenceActionGuard.js'
import {
  type DurationRuntimeConsumerObservationResult,
} from './durationRuntimeConsumerObservationService.js'
import {
  recordProjectWizardConsumedArtifacts,
  recordScheduleAccelerationRuntimeConsumedArtifacts,
  type DurationRuntimeConsumerFacadeArtifactsResult,
} from './durationRuntimeConsumerObservationAdapterService.js'

export type ConstructionOrganizationPlanNetworkRuntimeEvidenceQueryExec = <T = Record<string, unknown>>(
  sql: string,
  params?: unknown[],
) => Promise<T[]>

export type ConstructionOrganizationPlanNetworkRecordableRuntimeEventType =
  | 'impact_monitoring'
  | 'rollback_execution'

export type ConstructionOrganizationPlanNetworkRuntimeEventType =
  | ConstructionOrganizationPlanNetworkRecordableRuntimeEventType
  | 'plan_network_runtime_apply'

export type RecordConstructionOrganizationPlanNetworkRuntimeEventInput = {
  queryExec: ConstructionOrganizationPlanNetworkRuntimeEvidenceQueryExec
  projectId: string
  eventType: ConstructionOrganizationPlanNetworkRuntimeEventType | string
  eventStatus: string
  publicationKey: string
  publicationStatus?: string | null
  eventPayload?: Record<string, unknown> | null
  executedAt?: string | null
}

export type RecordConstructionOrganizationPlanNetworkRuntimeEventResult = {
  source: 'construction_organization_plan_network_runtime_evidence_service'
  status: 'runtime_event_recorded' | 'runtime_event_blocked'
  eventType: ConstructionOrganizationPlanNetworkRuntimeEventType | string | null
  eventStatus: string | null
  sourcePublicationKey: string | null
  eventPersisted: boolean
  writesTaskDependencies: false
  writesPlanDates: false
  writesSeed: false
  writesBaseline: false
  writesCriticalPathFacts: false
  writesAccelerationDraft: false
  reasons: string[]
  boundaryPolicy: string[]
}

export type RecordConstructionOrganizationPlanNetworkRuntimeConsumerObservationInput = {
  queryExec: ConstructionOrganizationPlanNetworkRuntimeEvidenceQueryExec
  projectId: string
  publicationKey: string
  publicationStatus?: string | null
  consumerKey?: 'projectWizard' | string | null
  consumerSurface?: string | null
  observedAt?: string | null
  calledAt?: string | null
  runtimeEntryRef?: string | null
  observationContext?: Record<string, unknown> | null
  callContext?: Record<string, unknown> | null
  sourceEvidenceRefs?: string[] | null
}

export type RecordConstructionOrganizationPlanNetworkRuntimeConsumerObservationResult = {
  source: 'construction_organization_plan_network_runtime_evidence_service'
  status: 'runtime_consumer_observation_recorded' | 'runtime_consumer_observation_blocked'
  publicationKey: string | null
  consumerKey: string | null
  observationPersisted: boolean
  observationResult: DurationRuntimeConsumerObservationResult | DurationRuntimeConsumerFacadeArtifactsResult | null
  writesTaskDependencies: false
  writesPlanDates: false
  writesSeed: false
  writesBaseline: false
  writesCriticalPathFacts: false
  writesAccelerationDraft: false
  reasons: string[]
  boundaryPolicy: string[]
}

export type ConstructionOrganizationPlanNetworkSavedOutcomeStatus =
  | 'accepted'
  | 'weak'

export type ConstructionOrganizationPlanNetworkRecommendationDecisionAction =
  | 'adopted'
  | 'declined'

export type RecordConstructionOrganizationPlanNetworkSavedOutcomeInput = {
  queryExec: ConstructionOrganizationPlanNetworkRuntimeEvidenceQueryExec
  publicationKey: string
  outcomeStatus: ConstructionOrganizationPlanNetworkSavedOutcomeStatus | string
  outcomeRef: string
  companyId?: string | null
  projectId?: string | null
  metadata?: Record<string, unknown> | null
  observedAt?: string | null
}

export type RecordConstructionOrganizationPlanNetworkSavedOutcomeResult = {
  source: 'construction_organization_plan_network_runtime_evidence_service'
  status: 'saved_network_outcome_recorded' | 'saved_network_outcome_blocked'
  publicationKey: string | null
  outcomeStatus: string | null
  outcomePersisted: boolean
  writesTaskDependencies: false
  writesPlanDates: false
  writesSeed: false
  writesBaseline: false
  writesCriticalPathFacts: false
  writesAccelerationDraft: false
  reasons: string[]
  boundaryPolicy: string[]
}

export type RecordConstructionOrganizationPlanNetworkRecommendationDecisionInput = {
  queryExec: ConstructionOrganizationPlanNetworkRuntimeEvidenceQueryExec
  projectId?: string | null
  companyId?: string | null
  actionType: ConstructionOrganizationPlanNetworkRecommendationDecisionAction | string
  optionId?: string | null
  draftNetworkKey?: string | null
  publicationKey?: string | null
  selectedScenarioIds?: string[] | null
  decidedBy?: string | null
  decidedAt?: string | null
  decisionContext?: Record<string, unknown> | null
}

export type RecordConstructionOrganizationPlanNetworkRecommendationDecisionResult = {
  source: 'construction_organization_plan_network_runtime_evidence_service'
  status: 'recommendation_decision_recorded' | 'recommendation_decision_blocked'
  recommendationKind: 'construction_organization_plan_network'
  recommendationKey: string | null
  actionType: string | null
  decisionPersisted: boolean
  writesTaskDependencies: false
  writesPlanDates: false
  writesSeed: false
  writesBaseline: false
  writesCriticalPathFacts: false
  writesAccelerationDraft: false
  reasons: string[]
  boundaryPolicy: string[]
}

export type ConstructionOrganizationPlanNetworkRuntimeEngineCode =
  | 'standard_duration_reference'
  | 'critical_path_cpm'
  | 'schedule_acceleration_target'

export type ConstructionOrganizationPlanNetworkUseCaseKey =
  | 'newProjectPlanning'
  | 'startingLineOnboarding'
  | 'accelerationRecovery'

export type RecordConstructionOrganizationPlanNetworkRuntimeEngineEvidenceInput = {
  queryExec: ConstructionOrganizationPlanNetworkRuntimeEvidenceQueryExec
  publicationKey: string
  engineCode: ConstructionOrganizationPlanNetworkRuntimeEngineCode | string
  projectId?: string | null
  taskId?: string | null
  dedupeKey?: string | null
  predictedDurationDays?: number | null
  actualDurationDays?: number | null
  predictedAt?: string | null
  observedAt?: string | null
  metadata?: Record<string, unknown> | null
}

export type RecordConstructionOrganizationPlanNetworkRuntimeEngineEvidenceResult = {
  source: 'construction_organization_plan_network_runtime_evidence_service'
  status: 'runtime_engine_evidence_recorded' | 'runtime_engine_evidence_blocked'
  publicationKey: string | null
  engineCode: string | null
  evidencePersisted: boolean
  writesTaskDependencies: false
  writesPlanDates: false
  writesSeed: false
  writesBaseline: false
  writesCriticalPathFacts: false
  writesAccelerationDraft: false
  reasons: string[]
  boundaryPolicy: string[]
}

const CONSTRUCTION_ORGANIZATION_PLAN_NETWORK_ASSET_KEY = 'construction_organization_plan_network'
const CONSTRUCTION_ORGANIZATION_PLAN_NETWORK_ENGINE_OUTPUT_KIND: Record<
  ConstructionOrganizationPlanNetworkRuntimeEngineCode,
  string
> = {
  standard_duration_reference: 'standard_duration_reference',
  critical_path_cpm: 'critical_path_project_duration',
  schedule_acceleration_target: 'acceleration_target',
}

const CONSTRUCTION_ORGANIZATION_PLAN_NETWORK_ENGINE_MODEL_VERSION: Record<
  ConstructionOrganizationPlanNetworkRuntimeEngineCode,
  string
> = {
  standard_duration_reference: 'standard_duration_reference_v1',
  critical_path_cpm: 'critical_path_cpm_v1',
  schedule_acceleration_target: 'schedule_acceleration_target_v1',
}

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

function readStructuredBusinessType(value: Record<string, unknown> | null | undefined) {
  return normalizeText(value?.businessType)
}

function readStructuredProjectId(value: Record<string, unknown> | null | undefined) {
  return normalizeText(value?.projectId)
}

function readStructuredUseCase(value: Record<string, unknown> | null | undefined): ConstructionOrganizationPlanNetworkUseCaseKey | null {
  const useCase = normalizeText(value?.useCase)
  return useCase === 'newProjectPlanning'
    || useCase === 'startingLineOnboarding'
    || useCase === 'accelerationRecovery'
    ? useCase
    : null
}

function hasStructuredOptionNetworkIdentity(value: Record<string, unknown> | null | undefined) {
  return Boolean(normalizeText(value?.draftNetworkKey) || normalizeText(value?.optionId))
}

function buildOptionNetworkIdentityKey(input: {
  publicationKey?: string | null
  draftNetworkKey?: string | null
  optionId?: string | null
  useCase?: string | null
}) {
  return [
    normalizeText(input.publicationKey),
    normalizeText(input.draftNetworkKey),
    normalizeText(input.optionId),
    normalizeText(input.useCase),
  ].filter(Boolean).join(':')
}

function uniqueReasons(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)))
}

function normalizeEvidenceRefs(value: string[] | null | undefined) {
  return Array.from(new Set((value ?? []).map((item) => normalizeText(item)).filter(Boolean)))
}

function boundaryPolicy() {
  return [
    'runtime_evidence_service_records_observation_followup_only',
    'plan_network_runtime_apply_is_owned_by_domain_writer',
    'does_not_write_task_dependencies_or_plan_dates',
    'does_not_write_seed_baseline_task_fact_acceleration_draft_or_critical_path_facts',
  ]
}

function isRecordableEventType(value: string): value is ConstructionOrganizationPlanNetworkRecordableRuntimeEventType {
  return value === 'impact_monitoring' || value === 'rollback_execution'
}

function isRecordableOutcomeStatus(value: string): value is ConstructionOrganizationPlanNetworkSavedOutcomeStatus {
  return value === 'accepted' || value === 'weak'
}

function isRecordableRecommendationDecisionAction(value: string): value is ConstructionOrganizationPlanNetworkRecommendationDecisionAction {
  return value === 'adopted' || value === 'declined'
}

function isRecordableEngineCode(value: string): value is ConstructionOrganizationPlanNetworkRuntimeEngineCode {
  return value === 'standard_duration_reference'
    || value === 'critical_path_cpm'
    || value === 'schedule_acceleration_target'
}

function readPositiveDays(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? Math.ceil(parsed) : null
}

function blocked(input: {
  eventType: string | null
  eventStatus: string | null
  publicationKey: string | null
  reasons: string[]
}): RecordConstructionOrganizationPlanNetworkRuntimeEventResult {
  return {
    source: 'construction_organization_plan_network_runtime_evidence_service',
    status: 'runtime_event_blocked',
    eventType: input.eventType,
    eventStatus: input.eventStatus,
    sourcePublicationKey: input.publicationKey,
    eventPersisted: false,
    writesTaskDependencies: false,
    writesPlanDates: false,
    writesSeed: false,
    writesBaseline: false,
    writesCriticalPathFacts: false,
    writesAccelerationDraft: false,
    reasons: uniqueReasons(input.reasons),
    boundaryPolicy: boundaryPolicy(),
  }
}

function blockedRuntimeConsumerObservation(input: {
  publicationKey: string | null
  consumerKey: string | null
  reasons: string[]
}): RecordConstructionOrganizationPlanNetworkRuntimeConsumerObservationResult {
  return {
    source: 'construction_organization_plan_network_runtime_evidence_service',
    status: 'runtime_consumer_observation_blocked',
    publicationKey: input.publicationKey,
    consumerKey: input.consumerKey,
    observationPersisted: false,
    observationResult: null,
    writesTaskDependencies: false,
    writesPlanDates: false,
    writesSeed: false,
    writesBaseline: false,
    writesCriticalPathFacts: false,
    writesAccelerationDraft: false,
    reasons: uniqueReasons(input.reasons),
    boundaryPolicy: boundaryPolicy(),
  }
}

function blockedOutcome(input: {
  publicationKey: string | null
  outcomeStatus: string | null
  reasons: string[]
}): RecordConstructionOrganizationPlanNetworkSavedOutcomeResult {
  return {
    source: 'construction_organization_plan_network_runtime_evidence_service',
    status: 'saved_network_outcome_blocked',
    publicationKey: input.publicationKey,
    outcomeStatus: input.outcomeStatus,
    outcomePersisted: false,
    writesTaskDependencies: false,
    writesPlanDates: false,
    writesSeed: false,
    writesBaseline: false,
    writesCriticalPathFacts: false,
    writesAccelerationDraft: false,
    reasons: uniqueReasons(input.reasons),
    boundaryPolicy: boundaryPolicy(),
  }
}

function blockedEngineEvidence(input: {
  publicationKey: string | null
  engineCode: string | null
  reasons: string[]
}): RecordConstructionOrganizationPlanNetworkRuntimeEngineEvidenceResult {
  return {
    source: 'construction_organization_plan_network_runtime_evidence_service',
    status: 'runtime_engine_evidence_blocked',
    publicationKey: input.publicationKey,
    engineCode: input.engineCode,
    evidencePersisted: false,
    writesTaskDependencies: false,
    writesPlanDates: false,
    writesSeed: false,
    writesBaseline: false,
    writesCriticalPathFacts: false,
    writesAccelerationDraft: false,
    reasons: uniqueReasons(input.reasons),
    boundaryPolicy: boundaryPolicy(),
  }
}

function blockedRecommendationDecision(input: {
  recommendationKey: string | null
  actionType: string | null
  reasons: string[]
}): RecordConstructionOrganizationPlanNetworkRecommendationDecisionResult {
  return {
    source: 'construction_organization_plan_network_runtime_evidence_service',
    status: 'recommendation_decision_blocked',
    recommendationKind: CONSTRUCTION_ORGANIZATION_PLAN_NETWORK_ASSET_KEY,
    recommendationKey: input.recommendationKey,
    actionType: input.actionType,
    decisionPersisted: false,
    writesTaskDependencies: false,
    writesPlanDates: false,
    writesSeed: false,
    writesBaseline: false,
    writesCriticalPathFacts: false,
    writesAccelerationDraft: false,
    reasons: uniqueReasons(input.reasons),
    boundaryPolicy: boundaryPolicy(),
  }
}

function buildConstructionOrganizationRecommendationKey(input: {
  optionId: string
  draftNetworkKey: string
  publicationKey: string
  useCase?: string | null
}) {
  const scopedIdentity = buildOptionNetworkIdentityKey(input)
  const identity = scopedIdentity || input.optionId || input.draftNetworkKey || input.publicationKey
  return identity ? `${CONSTRUCTION_ORGANIZATION_PLAN_NETWORK_ASSET_KEY}:${identity}` : null
}

export async function recordConstructionOrganizationPlanNetworkRuntimeConsumerObservation(
  input: RecordConstructionOrganizationPlanNetworkRuntimeConsumerObservationInput,
): Promise<RecordConstructionOrganizationPlanNetworkRuntimeConsumerObservationResult> {
  const publicationKey = normalizeText(input.publicationKey)
  const consumerKey = normalizeText(input.consumerKey) || 'projectWizard'
  const consumerSurface = normalizeText(input.consumerSurface) || 'project_wizard_commit'
  const observedAt = normalizeText(input.observedAt) || new Date().toISOString()
  const businessType = readStructuredBusinessType(input.observationContext)
  const projectId = normalizeText(input.projectId)
  const contextProjectId = readStructuredProjectId(input.observationContext)
  const useCase = readStructuredUseCase(input.observationContext)
  const hasOptionNetworkIdentity = hasStructuredOptionNetworkIdentity(input.observationContext)
  const reasons = [
    publicationKey ? null : 'publication_key_required',
    consumerKey ? null : 'consumer_key_required',
    consumerSurface ? null : 'consumer_surface_required',
    businessType ? null : 'business_type_required',
    projectId ? null : 'project_id_required',
    !projectId || !contextProjectId || projectId === contextProjectId ? null : 'project_scope_mismatch',
    useCase ? null : 'use_case_required',
    hasOptionNetworkIdentity ? null : 'option_network_identity_required',
    ...constructionOrganizationProductOutcomeProjectionOnlyContextReasons(input.observationContext),
  ].filter((item): item is string => Boolean(item))

  if (reasons.length > 0) {
    return blockedRuntimeConsumerObservation({
      publicationKey: publicationKey || null,
      consumerKey: consumerKey || null,
      reasons,
    })
  }

  const observationContext = {
    ...(input.observationContext ?? {}),
    projectId,
    source: 'construction_organization_plan_network_runtime_evidence_service',
    assetKey: CONSTRUCTION_ORGANIZATION_PLAN_NETWORK_ASSET_KEY,
    publicationKey,
    runtimePublicationKey: publicationKey,
    consumerKey,
    consumerSurface,
    writesRuntimeDirectly: false,
    writesFactDirectly: false,
    writesTaskDependencies: false,
    writesPlanDates: false,
    writesSeed: false,
    writesBaseline: false,
    writesCriticalPathFacts: false,
    writesAccelerationDraft: false,
    boundaryPolicy: boundaryPolicy(),
  }
  const sourceEvidenceRefs = normalizeEvidenceRefs(input.sourceEvidenceRefs)
  const publicationStatus = normalizeText(input.publicationStatus)
  const hasObservablePublication = ['published', 'canary', 'runtime_published'].includes(publicationStatus)
  const recordConsumedArtifacts = consumerKey === 'scheduleAccelerationRuntimeService'
    ? recordScheduleAccelerationRuntimeConsumedArtifacts
    : recordProjectWizardConsumedArtifacts
  const observationResult = await recordConsumedArtifacts({
    queryExec: input.queryExec,
    runtimeEntryRef: normalizeText(input.runtimeEntryRef) || undefined,
    calledAt: normalizeText(input.calledAt) || observedAt,
    observedAt,
    callContext: {
      ...(input.callContext ?? {}),
      projectId,
      consumerSurface,
    },
    sourceEvidenceRefs,
    artifacts: hasObservablePublication
      ? [{
        assetKey: CONSTRUCTION_ORGANIZATION_PLAN_NETWORK_ASSET_KEY,
        publicationKey,
        publicationStatus,
        observationContext,
        sourceEvidenceRefs,
      }]
      : [],
  })
  const reasonsFromObservation = uniqueReasons(observationResult.reasons)
  const observationPersisted = observationResult.status === 'runtime_consumer_observations_recorded'
    && observationResult.recordedCount === 1
  if (!observationPersisted) {
    return {
      source: 'construction_organization_plan_network_runtime_evidence_service',
      status: 'runtime_consumer_observation_blocked',
      publicationKey,
      consumerKey,
      observationPersisted: false,
      observationResult,
      writesTaskDependencies: false,
      writesPlanDates: false,
      writesSeed: false,
      writesBaseline: false,
      writesCriticalPathFacts: false,
      writesAccelerationDraft: false,
      reasons: reasonsFromObservation.length > 0
        ? reasonsFromObservation
        : [hasObservablePublication
          ? 'runtime_consumer_observation_not_recorded'
          : 'runtime_consumer_observation_published_or_canary_artifact_required'],
      boundaryPolicy: boundaryPolicy(),
    }
  }

  return {
    source: 'construction_organization_plan_network_runtime_evidence_service',
    status: 'runtime_consumer_observation_recorded',
    publicationKey,
    consumerKey,
    observationPersisted: true,
    observationResult,
    writesTaskDependencies: false,
    writesPlanDates: false,
    writesSeed: false,
    writesBaseline: false,
    writesCriticalPathFacts: false,
    writesAccelerationDraft: false,
    reasons: [],
    boundaryPolicy: boundaryPolicy(),
  }
}

export async function recordConstructionOrganizationPlanNetworkRuntimeEvent(
  input: RecordConstructionOrganizationPlanNetworkRuntimeEventInput,
): Promise<RecordConstructionOrganizationPlanNetworkRuntimeEventResult> {
  const eventType = normalizeText(input.eventType)
  const eventStatus = normalizeText(input.eventStatus)
  const publicationKey = normalizeText(input.publicationKey)
  const businessType = readStructuredBusinessType(input.eventPayload)
  const projectId = normalizeText(input.projectId)
  const payloadProjectId = readStructuredProjectId(input.eventPayload)
  const useCase = readStructuredUseCase(input.eventPayload)
  const hasOptionNetworkIdentity = hasStructuredOptionNetworkIdentity(input.eventPayload)
  const reasons = [
    publicationKey ? null : 'publication_key_required',
    eventStatus ? null : 'event_status_required',
    businessType ? null : 'business_type_required',
    projectId ? null : 'project_id_required',
    !projectId || !payloadProjectId || projectId === payloadProjectId ? null : 'project_scope_mismatch',
    useCase ? null : 'use_case_required',
    hasOptionNetworkIdentity ? null : 'option_network_identity_required',
    isRecordableEventType(eventType) ? null : 'runtime_event_type_not_recordable_here',
    ...constructionOrganizationProductOutcomeProjectionOnlyContextReasons(input.eventPayload),
  ].filter((item): item is string => Boolean(item))

  if (reasons.length > 0) {
    return blocked({
      eventType: eventType || null,
      eventStatus: eventStatus || null,
      publicationKey: publicationKey || null,
      reasons,
    })
  }

  const executedAt = normalizeText(input.executedAt) || new Date().toISOString()
  const eventPayload = {
    ...(input.eventPayload ?? {}),
    projectId,
    source: 'construction_organization_plan_network_runtime_evidence_service',
    writesTaskDependencies: false,
    writesPlanDates: false,
    writesSeed: false,
    writesBaseline: false,
    writesCriticalPathFacts: false,
    writesAccelerationDraft: false,
    boundaryPolicy: boundaryPolicy(),
  }

  await input.queryExec(
    `INSERT INTO public.construction_organization_plan_network_runtime_events (
       event_type,
       event_status,
       source_publication_key,
       event_payload,
       record_visibility_policy,
       executed_at
     ) VALUES ($1, $2, $3, $4::jsonb, 'backend_admin_governance_only', $5::timestamptz)
     RETURNING id`,
    [
      eventType,
      eventStatus,
      publicationKey,
      eventPayload,
      executedAt,
    ],
  )

  return {
    source: 'construction_organization_plan_network_runtime_evidence_service',
    status: 'runtime_event_recorded',
    eventType,
    eventStatus,
    sourcePublicationKey: publicationKey,
    eventPersisted: true,
    writesTaskDependencies: false,
    writesPlanDates: false,
    writesSeed: false,
    writesBaseline: false,
    writesCriticalPathFacts: false,
    writesAccelerationDraft: false,
    reasons: [],
    boundaryPolicy: boundaryPolicy(),
  }
}

export async function recordConstructionOrganizationPlanNetworkRuntimeEngineEvidence(
  input: RecordConstructionOrganizationPlanNetworkRuntimeEngineEvidenceInput,
): Promise<RecordConstructionOrganizationPlanNetworkRuntimeEngineEvidenceResult> {
  const publicationKey = normalizeText(input.publicationKey)
  const engineCode = normalizeText(input.engineCode)
  const predictedDurationDays = readPositiveDays(input.predictedDurationDays)
  const actualDurationDays = readPositiveDays(input.actualDurationDays)
  const businessType = readStructuredBusinessType(input.metadata)
  const projectId = normalizeText(input.projectId) || readStructuredProjectId(input.metadata)
  const useCase = readStructuredUseCase(input.metadata)
  const hasOptionNetworkIdentity = hasStructuredOptionNetworkIdentity(input.metadata)
  const reasons = [
    publicationKey ? null : 'publication_key_required',
    isRecordableEngineCode(engineCode) ? null : 'engine_code_not_allowed_for_construction_organization_plan_network',
    businessType ? null : 'business_type_required',
    projectId ? null : 'project_id_required',
    useCase ? null : 'use_case_required',
    hasOptionNetworkIdentity ? null : 'option_network_identity_required',
    predictedDurationDays !== null ? null : 'predicted_duration_days_required',
    actualDurationDays !== null ? null : 'actual_duration_days_required',
    ...constructionOrganizationProductOutcomeProjectionOnlyContextReasons(input.metadata),
  ].filter((item): item is string => Boolean(item))

  if (reasons.length > 0) {
    return blockedEngineEvidence({
      publicationKey: publicationKey || null,
      engineCode: engineCode || null,
      reasons,
    })
  }

  const observedAt = normalizeText(input.observedAt) || new Date().toISOString()
  const predictedAt = normalizeText(input.predictedAt) || observedAt
  const dedupeKey = normalizeText(input.dedupeKey) || buildOptionNetworkIdentityKey({
    publicationKey: `${publicationKey}:${engineCode}`,
    draftNetworkKey: normalizeText(input.metadata?.draftNetworkKey),
    optionId: normalizeText(input.metadata?.optionId),
    useCase,
  })
  const signedErrorDays = (actualDurationDays as number) - (predictedDurationDays as number)
  const absoluteErrorDays = Math.abs(signedErrorDays)
  const evidenceContext = {
    ...(input.metadata ?? {}),
    source: 'construction_organization_plan_network_runtime_evidence_service',
    assetKey: CONSTRUCTION_ORGANIZATION_PLAN_NETWORK_ASSET_KEY,
    publicationKey,
    runtimePublicationKey: publicationKey,
    writesRuntimeDirectly: false,
    writesFactDirectly: false,
    writesTaskDependencies: false,
    writesPlanDates: false,
    writesSeed: false,
    writesBaseline: false,
    writesCriticalPathFacts: false,
    writesAccelerationDraft: false,
    boundaryPolicy: boundaryPolicy(),
  }

  await input.queryExec(
    `INSERT INTO public.duration_algorithm_accuracy_events (
       project_id,
       task_id,
       engine_code,
       output_kind,
       dedupe_key,
       prediction_basis,
       prediction_source,
       model_version,
       predicted_duration_days,
       predicted_at,
       runtime_consumption_state,
       prediction_context,
       actual_duration_days,
       signed_error_days,
       absolute_error_days,
       backtest_status,
       actual_context,
       backtested_at,
       updated_at
     ) VALUES (
       $1, $2, $3, $4, $5,
       'construction_organization_plan_network_runtime_evidence',
       'construction_organization_plan_network_runtime_evidence_service',
       $6,
       $7, $8,
       'construction_organization_plan_network_runtime_evidence',
       $9::jsonb,
       $10, $11, $12,
       $13,
       $14::jsonb,
       $15, $15
     )
     ON CONFLICT (engine_code, dedupe_key) DO UPDATE SET
       project_id = EXCLUDED.project_id,
       task_id = EXCLUDED.task_id,
       output_kind = EXCLUDED.output_kind,
       prediction_basis = EXCLUDED.prediction_basis,
       prediction_source = EXCLUDED.prediction_source,
       model_version = EXCLUDED.model_version,
       predicted_duration_days = EXCLUDED.predicted_duration_days,
       predicted_at = EXCLUDED.predicted_at,
       runtime_consumption_state = EXCLUDED.runtime_consumption_state,
       prediction_context = EXCLUDED.prediction_context,
       actual_duration_days = EXCLUDED.actual_duration_days,
       signed_error_days = EXCLUDED.signed_error_days,
       absolute_error_days = EXCLUDED.absolute_error_days,
       backtest_status = EXCLUDED.backtest_status,
       actual_context = EXCLUDED.actual_context,
       backtested_at = EXCLUDED.backtested_at,
       updated_at = EXCLUDED.updated_at
     RETURNING id`,
    [
      normalizeText(input.projectId) || null,
      normalizeText(input.taskId) || null,
      engineCode,
      CONSTRUCTION_ORGANIZATION_PLAN_NETWORK_ENGINE_OUTPUT_KIND[engineCode],
      dedupeKey,
      CONSTRUCTION_ORGANIZATION_PLAN_NETWORK_ENGINE_MODEL_VERSION[engineCode],
      predictedDurationDays,
      predictedAt,
      evidenceContext,
      actualDurationDays,
      signedErrorDays,
      absoluteErrorDays,
      'backtested',
      evidenceContext,
      observedAt,
    ],
  )

  return {
    source: 'construction_organization_plan_network_runtime_evidence_service',
    status: 'runtime_engine_evidence_recorded',
    publicationKey,
    engineCode,
    evidencePersisted: true,
    writesTaskDependencies: false,
    writesPlanDates: false,
    writesSeed: false,
    writesBaseline: false,
    writesCriticalPathFacts: false,
    writesAccelerationDraft: false,
    reasons: [],
    boundaryPolicy: boundaryPolicy(),
  }
}

export async function recordConstructionOrganizationPlanNetworkSavedOutcome(
  input: RecordConstructionOrganizationPlanNetworkSavedOutcomeInput,
): Promise<RecordConstructionOrganizationPlanNetworkSavedOutcomeResult> {
  const publicationKey = normalizeText(input.publicationKey)
  const outcomeStatus = normalizeText(input.outcomeStatus)
  const outcomeRef = normalizeText(input.outcomeRef)
  const businessType = readStructuredBusinessType(input.metadata)
  const projectId = normalizeText(input.projectId) || readStructuredProjectId(input.metadata)
  const useCase = readStructuredUseCase(input.metadata)
  const hasOptionNetworkIdentity = hasStructuredOptionNetworkIdentity(input.metadata)
  const reasons = [
    publicationKey ? null : 'publication_key_required',
    isRecordableOutcomeStatus(outcomeStatus) ? null : 'outcome_status_not_recordable',
    outcomeRef ? null : 'outcome_ref_required',
    businessType ? null : 'business_type_required',
    projectId ? null : 'project_id_required',
    useCase ? null : 'use_case_required',
    hasOptionNetworkIdentity ? null : 'option_network_identity_required',
    ...constructionOrganizationProductOutcomeProjectionOnlyContextReasons(input.metadata),
  ].filter((item): item is string => Boolean(item))

  if (reasons.length > 0) {
    return blockedOutcome({
      publicationKey: publicationKey || null,
      outcomeStatus: outcomeStatus || null,
      reasons,
    })
  }

  const observedAt = normalizeText(input.observedAt) || new Date().toISOString()
  const outcomeId = `construction-organization-plan-network-outcome:${buildOptionNetworkIdentityKey({
    publicationKey,
    draftNetworkKey: normalizeText(input.metadata?.draftNetworkKey),
    optionId: normalizeText(input.metadata?.optionId),
    useCase,
  })}`
  const metadata = {
    ...(input.metadata ?? {}),
    source: 'construction_organization_plan_network_runtime_evidence_service',
    assetKey: CONSTRUCTION_ORGANIZATION_PLAN_NETWORK_ASSET_KEY,
    publicationKey,
    duration_basis: 'published_network_identity_no_duration_recalculation',
    durationBasis: 'published_network_identity_no_duration_recalculation',
    production_day_conversion_applied: false,
    writesRuntimeDirectly: false,
    writesFactDirectly: false,
    writesTaskDependencies: false,
    writesPlanDates: false,
    writesSeed: false,
    writesBaseline: false,
    writesCriticalPathFacts: false,
    writesAccelerationDraft: false,
    boundaryPolicy: boundaryPolicy(),
  }

  await input.queryExec(
    `INSERT INTO public.duration_plan_network_outcomes (
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
       observed_at,
       writes_runtime_directly,
       writes_fact_directly
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11::timestamptz, false, false)
     ON CONFLICT (id) DO UPDATE SET
       outcome_status = EXCLUDED.outcome_status,
       outcome_ref = EXCLUDED.outcome_ref,
       learning_scope = EXCLUDED.learning_scope,
       learning_scope_source = EXCLUDED.learning_scope_source,
       company_id = EXCLUDED.company_id,
       project_id = EXCLUDED.project_id,
       publication_key = EXCLUDED.publication_key,
       metadata = EXCLUDED.metadata,
       observed_at = EXCLUDED.observed_at,
       writes_runtime_directly = false,
       writes_fact_directly = false
     RETURNING id`,
    [
      outcomeId,
      CONSTRUCTION_ORGANIZATION_PLAN_NETWORK_ASSET_KEY,
      outcomeStatus,
      outcomeRef,
      'project',
      'construction_organization_plan_network_runtime_evidence_service',
      input.companyId ?? null,
      input.projectId ?? null,
      publicationKey,
      metadata,
      observedAt,
    ],
  )

  return {
    source: 'construction_organization_plan_network_runtime_evidence_service',
    status: 'saved_network_outcome_recorded',
    publicationKey,
    outcomeStatus,
    outcomePersisted: true,
    writesTaskDependencies: false,
    writesPlanDates: false,
    writesSeed: false,
    writesBaseline: false,
    writesCriticalPathFacts: false,
    writesAccelerationDraft: false,
    reasons: [],
    boundaryPolicy: boundaryPolicy(),
  }
}

export async function recordConstructionOrganizationPlanNetworkRecommendationDecision(
  input: RecordConstructionOrganizationPlanNetworkRecommendationDecisionInput,
): Promise<RecordConstructionOrganizationPlanNetworkRecommendationDecisionResult> {
  const projectId = normalizeText(input.projectId)
  const companyId = normalizeText(input.companyId) || null
  const actionType = normalizeText(input.actionType)
  const optionId = normalizeText(input.optionId)
  const draftNetworkKey = normalizeText(input.draftNetworkKey)
  const publicationKey = normalizeText(input.publicationKey)
  const hasOptionNetworkIdentity = Boolean(optionId || draftNetworkKey)
  const businessType = readStructuredBusinessType(input.decisionContext)
  const useCase = readStructuredUseCase(input.decisionContext)
  const recommendationKey = buildConstructionOrganizationRecommendationKey({
    optionId,
    draftNetworkKey,
    publicationKey,
    useCase,
  })
  const reasons = [
    projectId ? null : 'project_id_required',
    publicationKey ? null : 'publication_key_required',
    hasOptionNetworkIdentity ? null : 'option_network_identity_required',
    recommendationKey ? null : 'recommendation_option_identity_required',
    isRecordableRecommendationDecisionAction(actionType) ? null : 'recommendation_decision_action_not_supported',
    businessType ? null : 'business_type_required',
    useCase ? null : 'use_case_required',
    ...constructionOrganizationProductOutcomeProjectionOnlyContextReasons(input.decisionContext),
  ].filter((item): item is string => Boolean(item))

  if (reasons.length > 0) {
    return blockedRecommendationDecision({
      recommendationKey,
      actionType: actionType || null,
      reasons,
    })
  }

  const decidedAt = normalizeText(input.decidedAt) || new Date().toISOString()
  const decidedBy = normalizeText(input.decidedBy) || null
  const actionContext = {
    ...(input.decisionContext ?? {}),
    source: 'construction_organization_plan_network_runtime_evidence_service',
    assetKey: CONSTRUCTION_ORGANIZATION_PLAN_NETWORK_ASSET_KEY,
    companyId,
    projectId,
    optionId: optionId || null,
    draftNetworkKey: draftNetworkKey || null,
    publicationKey: publicationKey || null,
    selectedScenarioIds: Array.isArray(input.selectedScenarioIds)
      ? input.selectedScenarioIds.map((item) => normalizeText(item)).filter(Boolean)
      : [],
    decisionAction: actionType,
    decidedBy,
    decidedAt,
    writesRuntimeDirectly: false,
    writesFactDirectly: false,
    writesTaskDependencies: false,
    writesPlanDates: false,
    writesSeed: false,
    writesBaseline: false,
    writesCriticalPathFacts: false,
    writesAccelerationDraft: false,
    boundaryPolicy: boundaryPolicy(),
  }

  await input.queryExec(
    `INSERT INTO public.recommendation_actions (
       project_id,
       recommendation_kind,
       recommendation_key,
       action_type,
       target_end_date,
       natural_end_date,
       total_recover_days,
       acceleration_target_days,
       adopted_at,
       adopted_by,
       action_context,
       created_at
     ) VALUES ($1, $2, $3, $4, null, null, null, null, $5::timestamptz, $6, $7::jsonb, $5::timestamptz)
     ON CONFLICT (project_id, recommendation_kind, recommendation_key, action_type) DO UPDATE SET
       adopted_at = EXCLUDED.adopted_at,
       adopted_by = EXCLUDED.adopted_by,
       action_context = EXCLUDED.action_context
     RETURNING id`,
    [
      projectId,
      CONSTRUCTION_ORGANIZATION_PLAN_NETWORK_ASSET_KEY,
      recommendationKey,
      actionType,
      decidedAt,
      decidedBy,
      actionContext,
    ],
  )

  return {
    source: 'construction_organization_plan_network_runtime_evidence_service',
    status: 'recommendation_decision_recorded',
    recommendationKind: CONSTRUCTION_ORGANIZATION_PLAN_NETWORK_ASSET_KEY,
    recommendationKey,
    actionType,
    decisionPersisted: true,
    writesTaskDependencies: false,
    writesPlanDates: false,
    writesSeed: false,
    writesBaseline: false,
    writesCriticalPathFacts: false,
    writesAccelerationDraft: false,
    reasons: [],
    boundaryPolicy: boundaryPolicy(),
  }
}
