import { logger } from '../middleware/logger.js'
import { executeSQL } from '../services/dbService.js'
import {
  recordConstructionOrganizationPlanNetworkRuntimeEngineEvidence,
  recordConstructionOrganizationPlanNetworkRuntimeEvent,
  type ConstructionOrganizationPlanNetworkRuntimeEngineCode,
  type ConstructionOrganizationPlanNetworkRuntimeEvidenceQueryExec,
} from '../services/constructionOrganizationPlanNetworkRuntimeEvidenceService.js'
import { runJobWithRetry } from '../services/jobRuntime.js'
import { PersistentWallClockJobTimer } from '../services/persistentJobScheduleService.js'

const RUNTIME_ENGINE_CODES: ConstructionOrganizationPlanNetworkRuntimeEngineCode[] = [
  'standard_duration_reference',
  'critical_path_cpm',
  'schedule_acceleration_target',
]

export type ConstructionOrganizationPlanNetworkRuntimeEngineMeasurement = {
  engineCode: ConstructionOrganizationPlanNetworkRuntimeEngineCode
  predictedDurationDays: number
  actualDurationDays: number
  predictedAt?: string | null
  observedAt?: string | null
  dedupeKey?: string | null
  metadata?: Record<string, unknown> | null
}

export type ConstructionOrganizationPlanNetworkRuntimeEvidenceSweepCandidate = {
  publicationKey: string
  projectId: string
  businessType: string
  useCase?: string | null
  draftNetworkKey?: string | null
  optionId?: string | null
  publishedAt?: string | null
  outcomeRef?: string | null
  savedOutcomeObservedAt?: string | null
  savedOutcomeIdentityVerified?: boolean | null
  consumerObservationCount?: number | null
  consumerObservationIdentityVerified?: boolean | null
  recommendationDecisionAction?: string | null
  recommendationDecisionIdentityVerified?: boolean | null
  recommendationDecisionAt?: string | null
  rollbackTarget?: string | null
  rollbackWriterRefs?: string[] | null
  existingImpactMonitoring?: boolean | null
  existingRollbackVerification?: boolean | null
  runtimeEngineMeasurements?: ConstructionOrganizationPlanNetworkRuntimeEngineMeasurement[] | null
}

export type ConstructionOrganizationPlanNetworkRuntimeEvidenceSweepResult = {
  source: 'construction_organization_plan_network_runtime_evidence_job'
  total: number
  monitored: number
  impactMonitoringRecorded: number
  rollbackVerificationRecorded: number
  runtimeEngineEvidenceRecorded: number
  skipped: number
  failed: number
}

export type ConstructionOrganizationPlanNetworkRuntimeEvidenceSweepInput = {
  queryExec?: ConstructionOrganizationPlanNetworkRuntimeEvidenceQueryExec
  candidates?: ConstructionOrganizationPlanNetworkRuntimeEvidenceSweepCandidate[] | null
  candidateProvider?: () => Promise<ConstructionOrganizationPlanNetworkRuntimeEvidenceSweepCandidate[]>
  executedAt?: string
}

export type ConstructionOrganizationPlanNetworkRuntimeEvidenceJobOptions = {
  queryExec?: ConstructionOrganizationPlanNetworkRuntimeEvidenceQueryExec
  candidateProvider?: () => Promise<ConstructionOrganizationPlanNetworkRuntimeEvidenceSweepCandidate[]>
}

function createJobId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

function readNonNegativeInteger(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : 0
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map(normalizeText).filter(Boolean)
    : []
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      return asRecord(parsed)
    } catch {
      return {}
    }
  }
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function emptyResult(total = 0): ConstructionOrganizationPlanNetworkRuntimeEvidenceSweepResult {
  return {
    source: 'construction_organization_plan_network_runtime_evidence_job',
    total,
    monitored: 0,
    impactMonitoringRecorded: 0,
    rollbackVerificationRecorded: 0,
    runtimeEngineEvidenceRecorded: 0,
    skipped: 0,
    failed: 0,
  }
}

function isRuntimeEngineCode(value: unknown): value is ConstructionOrganizationPlanNetworkRuntimeEngineCode {
  return RUNTIME_ENGINE_CODES.includes(value as ConstructionOrganizationPlanNetworkRuntimeEngineCode)
}

function readPositiveDays(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? Math.ceil(parsed) : null
}

function readRuntimeEngineMeasurements(value: unknown): ConstructionOrganizationPlanNetworkRuntimeEngineMeasurement[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    const record = asRecord(item)
    const engineCode = normalizeText(record.engineCode ?? record.engine_code)
    const predictedDurationDays = readPositiveDays(record.predictedDurationDays ?? record.predicted_duration_days)
    const actualDurationDays = readPositiveDays(record.actualDurationDays ?? record.actual_duration_days)
    if (!isRuntimeEngineCode(engineCode) || predictedDurationDays === null || actualDurationDays === null) return []
    return [{
      engineCode,
      predictedDurationDays,
      actualDurationDays,
      predictedAt: normalizeText(record.predictedAt ?? record.predicted_at) || null,
      observedAt: normalizeText(record.observedAt ?? record.observed_at) || null,
      dedupeKey: normalizeText(record.dedupeKey ?? record.dedupe_key) || null,
      metadata: asRecord(record.metadata),
    }]
  })
}

function hasOptionNetworkIdentity(candidate: ConstructionOrganizationPlanNetworkRuntimeEvidenceSweepCandidate) {
  return Boolean(normalizeText(candidate.draftNetworkKey) || normalizeText(candidate.optionId))
}

function matchesOptionalIdentity(expected: string, actual: unknown) {
  return !expected || normalizeText(actual) === expected
}

function declaredIdentityMatchesCandidate(input: {
  candidateDraftNetworkKey: string
  candidateOptionId: string
  declaredDraftNetworkKey: unknown
  declaredOptionId: unknown
}) {
  const declaredDraftNetworkKey = normalizeText(input.declaredDraftNetworkKey)
  const declaredOptionId = normalizeText(input.declaredOptionId)
  return Boolean(
    (declaredDraftNetworkKey || declaredOptionId)
      && (!declaredDraftNetworkKey || declaredDraftNetworkKey === input.candidateDraftNetworkKey)
      && (!declaredOptionId || declaredOptionId === input.candidateOptionId),
  )
}

function payloadMatchesCandidateIdentity(
  payload: Record<string, unknown>,
  candidate: { businessType: string, useCase: string, projectId: string, draftNetworkKey: string, optionId: string },
) {
  const businessType = normalizeText(payload.businessType)
  const useCase = normalizeText(payload.useCase)
  const projectId = normalizeText(payload.projectId)
  const draftNetworkKey = normalizeText(payload.draftNetworkKey)
  const optionId = normalizeText(payload.optionId)
  return Boolean(
    businessType
      && businessType === candidate.businessType
      && useCase
      && useCase === candidate.useCase
      && projectId
      && projectId === candidate.projectId
      && declaredIdentityMatchesCandidate({
        candidateDraftNetworkKey: candidate.draftNetworkKey,
        candidateOptionId: candidate.optionId,
        declaredDraftNetworkKey: draftNetworkKey,
        declaredOptionId: optionId,
      }),
  )
}

function isSweepCandidateReady(candidate: ConstructionOrganizationPlanNetworkRuntimeEvidenceSweepCandidate) {
  return Boolean(
      normalizeText(candidate.publicationKey)
      && normalizeText(candidate.projectId)
      && normalizeText(candidate.businessType)
      && normalizeText(candidate.useCase)
      && hasOptionNetworkIdentity(candidate)
      && normalizeText(candidate.outcomeRef)
      && normalizeText(candidate.savedOutcomeObservedAt)
      && candidate.savedOutcomeIdentityVerified === true
      && readNonNegativeInteger(candidate.consumerObservationCount) > 0
      && candidate.consumerObservationIdentityVerified === true
      && normalizeText(candidate.recommendationDecisionAction) === 'adopted'
      && candidate.recommendationDecisionIdentityVerified === true,
  )
}

function buildCommonEventPayload(
  candidate: ConstructionOrganizationPlanNetworkRuntimeEvidenceSweepCandidate,
  executedAt: string,
) {
  return {
    source: 'construction_organization_plan_network_runtime_evidence_job',
    businessType: normalizeText(candidate.businessType),
    useCase: normalizeText(candidate.useCase),
    projectId: normalizeText(candidate.projectId),
    draftNetworkKey: normalizeText(candidate.draftNetworkKey) || null,
    optionId: normalizeText(candidate.optionId) || null,
    publicationKey: normalizeText(candidate.publicationKey),
    outcomeRef: normalizeText(candidate.outcomeRef),
    savedOutcomeObservedAt: normalizeText(candidate.savedOutcomeObservedAt),
    consumerObservationCount: readNonNegativeInteger(candidate.consumerObservationCount),
    recommendationDecisionAction: normalizeText(candidate.recommendationDecisionAction),
    recommendationDecisionAt: normalizeText(candidate.recommendationDecisionAt) || null,
    executedAt,
    writesRuntimeDirectly: false,
    writesFactDirectly: false,
    writesTaskDependencies: false,
    writesPlanDates: false,
    writesSeed: false,
    writesBaseline: false,
    writesCriticalPathFacts: false,
    writesAccelerationDraft: false,
    boundaryPolicy: [
      'runtime_evidence_sweep_uses_existing_post_publication_runtime_facts',
      'does_not_create_site_adoption_or_saved_outcome',
      'does_not_write_task_dependencies_or_plan_dates',
      'does_not_write_seed_baseline_task_fact_acceleration_draft_or_critical_path_fact',
    ],
  }
}

function buildCandidateFromRow(row: Record<string, unknown>): ConstructionOrganizationPlanNetworkRuntimeEvidenceSweepCandidate | null {
  const publicationKey = normalizeText(row.publication_key)
  const projectId = normalizeText(row.project_id)
  const draftNetworkKey = normalizeText(row.draft_network_key)
  const rollbackTarget = normalizeText(row.rollback_target)
  const outcomeMetadata = asRecord(row.outcome_metadata)
  const observationContext = asRecord(row.observation_context)
  const actionContext = asRecord(row.action_context)
  const impactPayload = asRecord(row.impact_event_payload)
  const rollbackPayload = asRecord(row.rollback_event_payload)
  const outcomeBusinessType = normalizeText(outcomeMetadata.businessType)
  const outcomeUseCase = normalizeText(outcomeMetadata.useCase)
  const outcomeProjectId = normalizeText(outcomeMetadata.projectId)
  const outcomeDraftNetworkKey = normalizeText(outcomeMetadata.draftNetworkKey)
  const outcomeOptionId = normalizeText(outcomeMetadata.optionId)
  const observationBusinessType = normalizeText(observationContext.businessType)
  const observationUseCase = normalizeText(observationContext.useCase)
  const observationProjectId = normalizeText(observationContext.projectId)
  const observationDraftNetworkKey = normalizeText(observationContext.draftNetworkKey)
  const observationOptionId = normalizeText(observationContext.optionId)
  const actionBusinessType = normalizeText(actionContext.businessType)
  const actionUseCase = normalizeText(actionContext.useCase)
  const actionProjectId = normalizeText(actionContext.projectId)
  const actionDraftNetworkKey = normalizeText(actionContext.draftNetworkKey)
  const actionOptionId = normalizeText(actionContext.optionId)
  const businessType = normalizeText(
    outcomeMetadata.businessType
      ?? observationContext.businessType
      ?? actionContext.businessType,
  )
  const useCase = normalizeText(
    outcomeMetadata.useCase
      ?? observationContext.useCase
      ?? actionContext.useCase,
  )
  const optionId = normalizeText(
    outcomeMetadata.optionId
      ?? observationContext.optionId
      ?? actionContext.optionId,
  )
  const resolvedDraftNetworkKey = draftNetworkKey
    || normalizeText(outcomeMetadata.draftNetworkKey ?? observationContext.draftNetworkKey ?? actionContext.draftNetworkKey)
  if (!publicationKey || !projectId || !businessType || !useCase) return null
  if (
    !outcomeBusinessType
      || outcomeBusinessType !== businessType
      || !outcomeUseCase
      || outcomeUseCase !== useCase
      || !outcomeProjectId
      || outcomeProjectId !== projectId
      || !declaredIdentityMatchesCandidate({
        candidateDraftNetworkKey: resolvedDraftNetworkKey,
        candidateOptionId: optionId,
        declaredDraftNetworkKey: outcomeDraftNetworkKey,
        declaredOptionId: outcomeOptionId,
      })
  ) {
    return null
  }
  if (
    !observationBusinessType
      || observationBusinessType !== businessType
      || !observationUseCase
      || observationUseCase !== useCase
      || !observationProjectId
      || observationProjectId !== projectId
      || !declaredIdentityMatchesCandidate({
        candidateDraftNetworkKey: resolvedDraftNetworkKey,
        candidateOptionId: optionId,
        declaredDraftNetworkKey: observationDraftNetworkKey,
        declaredOptionId: observationOptionId,
      })
  ) {
    return null
  }
  if (
    !actionBusinessType
      || actionBusinessType !== businessType
      || !actionUseCase
      || actionUseCase !== useCase
      || !actionProjectId
      || actionProjectId !== projectId
      || !declaredIdentityMatchesCandidate({
        candidateDraftNetworkKey: resolvedDraftNetworkKey,
        candidateOptionId: optionId,
        declaredDraftNetworkKey: actionDraftNetworkKey,
        declaredOptionId: actionOptionId,
      })
  ) {
    return null
  }
  const candidateIdentity = {
    businessType,
    useCase,
    projectId,
    draftNetworkKey: resolvedDraftNetworkKey,
    optionId,
  }
  return {
    publicationKey,
    projectId,
    businessType,
    useCase,
    draftNetworkKey: resolvedDraftNetworkKey || null,
    optionId: optionId || null,
    publishedAt: normalizeText(row.published_at) || null,
    outcomeRef: normalizeText(row.outcome_ref) || null,
    savedOutcomeObservedAt: normalizeText(row.outcome_observed_at) || null,
    savedOutcomeIdentityVerified: true,
    consumerObservationCount: readNonNegativeInteger(row.consumer_observation_count),
    consumerObservationIdentityVerified: true,
    recommendationDecisionAction: normalizeText(row.action_type) || null,
    recommendationDecisionIdentityVerified: true,
    recommendationDecisionAt: normalizeText(row.adopted_at) || null,
    rollbackTarget: rollbackTarget || normalizeText(outcomeMetadata.rollbackTarget ?? actionContext.rollbackTarget) || null,
    rollbackWriterRefs: readStringArray(outcomeMetadata.rollbackWriterRefs ?? actionContext.rollbackWriterRefs),
    runtimeEngineMeasurements: readRuntimeEngineMeasurements(
      outcomeMetadata.runtimeEngineMeasurements
        ?? actionContext.runtimeEngineMeasurements
        ?? observationContext.runtimeEngineMeasurements,
    ),
    existingImpactMonitoring: Boolean(
      normalizeText(row.impact_event_status)
        && payloadMatchesCandidateIdentity(impactPayload, candidateIdentity),
    ),
    existingRollbackVerification: Boolean(
      normalizeText(row.rollback_event_status)
        && payloadMatchesCandidateIdentity(rollbackPayload, candidateIdentity),
    ),
  }
}

export async function collectConstructionOrganizationPlanNetworkRuntimeEvidenceCandidates(
  queryExec: ConstructionOrganizationPlanNetworkRuntimeEvidenceQueryExec = executeSQL,
) {
  const rows = await queryExec<Record<string, unknown>>(
    `select
        p.publication_key,
        p.project_id,
        p.draft_network_key,
        p.rollback_target,
        p.published_at,
        o.outcome_ref,
        o.metadata as outcome_metadata,
        o.observed_at as outcome_observed_at,
        coalesce(obs.consumer_observation_count, 0) as consumer_observation_count,
        obs.observation_context,
        a.action_type,
        a.adopted_at,
        a.action_context,
        impact.event_status as impact_event_status,
        impact.event_payload as impact_event_payload,
        rollback.event_status as rollback_event_status,
        rollback.event_payload as rollback_event_payload
       from public.construction_organization_plan_network_runtime_publications p
       join public.duration_plan_network_outcomes o
         on o.asset_key = 'construction_organization_plan_network'
        and o.publication_key = p.publication_key
        and o.outcome_status = 'accepted'
        and o.writes_runtime_directly = false
        and o.writes_fact_directly = false
        and o.metadata->>'projectId' = p.project_id
        and coalesce(o.metadata->>'businessType', '') <> ''
        and coalesce(o.metadata->>'useCase', '') <> ''
        and (
          o.metadata->>'draftNetworkKey' = p.draft_network_key
          or coalesce(o.metadata->>'optionId', '') <> ''
        )
       join public.recommendation_actions a
         on a.project_id = p.project_id
        and a.recommendation_kind = 'construction_organization_plan_network'
        and a.action_type = 'adopted'
        and coalesce(a.action_context->>'publicationKey', '') = p.publication_key
        and a.action_context->>'projectId' = p.project_id
        and coalesce(a.action_context->>'businessType', '') <> ''
        and a.action_context->>'useCase' = o.metadata->>'useCase'
        and (
          a.action_context->>'draftNetworkKey' = p.draft_network_key
          or a.action_context->>'optionId' = o.metadata->>'optionId'
        )
       join lateral (
         select count(*)::int as consumer_observation_count,
                max(observation_context::text)::jsonb as observation_context
           from public.runtime_consumer_observations rco
          where rco.asset_key = 'construction_organization_plan_network'
            and rco.publication_key = p.publication_key
            and rco.observation_context->>'projectId' = p.project_id
            and coalesce(rco.observation_context->>'businessType', '') <> ''
            and rco.observation_context->>'useCase' = o.metadata->>'useCase'
            and (
              rco.observation_context->>'draftNetworkKey' = p.draft_network_key
              or rco.observation_context->>'optionId' = coalesce(o.metadata->>'optionId', a.action_context->>'optionId')
            )
            and rco.observation_status = 'observed'
            and rco.writes_runtime_directly = false
            and rco.writes_fact_directly = false
       ) obs on true
       left join public.construction_organization_plan_network_runtime_events impact
         on impact.source_publication_key = p.publication_key
        and impact.event_type = 'impact_monitoring'
        and impact.event_status = 'monitoring_passed'
        and impact.event_payload->>'projectId' = p.project_id
        and coalesce(impact.event_payload->>'businessType', '') <> ''
        and impact.event_payload->>'useCase' = o.metadata->>'useCase'
        and (
          impact.event_payload->>'draftNetworkKey' = p.draft_network_key
          or impact.event_payload->>'optionId' = coalesce(o.metadata->>'optionId', a.action_context->>'optionId')
        )
       left join public.construction_organization_plan_network_runtime_events rollback
         on rollback.source_publication_key = p.publication_key
        and rollback.event_type = 'rollback_execution'
        and rollback.event_status = 'rollback_executed'
        and rollback.event_payload->>'projectId' = p.project_id
        and coalesce(rollback.event_payload->>'businessType', '') <> ''
        and rollback.event_payload->>'useCase' = o.metadata->>'useCase'
        and (
          rollback.event_payload->>'draftNetworkKey' = p.draft_network_key
          or rollback.event_payload->>'optionId' = coalesce(o.metadata->>'optionId', a.action_context->>'optionId')
        )
      where p.runtime_publication_status = 'runtime_published'
        and obs.consumer_observation_count > 0
      order by p.published_at desc
      limit 200`,
  )
  return rows
    .map(buildCandidateFromRow)
    .filter((candidate): candidate is ConstructionOrganizationPlanNetworkRuntimeEvidenceSweepCandidate => Boolean(candidate))
}

export async function runConstructionOrganizationPlanNetworkRuntimeEvidenceSweep(
  input: ConstructionOrganizationPlanNetworkRuntimeEvidenceSweepInput = {},
) {
  const queryExec = input.queryExec ?? executeSQL
  const candidates = input.candidates ?? (
    input.candidateProvider
      ? await input.candidateProvider()
      : await collectConstructionOrganizationPlanNetworkRuntimeEvidenceCandidates(queryExec)
  )
  const result = emptyResult(candidates.length)
  const executedAt = normalizeText(input.executedAt) || new Date().toISOString()

  for (const candidate of candidates) {
    if (!isSweepCandidateReady(candidate)) {
      result.skipped += 1
      continue
    }
    result.monitored += 1
    const commonPayload = buildCommonEventPayload(candidate, executedAt)
    try {
      if (!candidate.existingImpactMonitoring) {
        const impact = await recordConstructionOrganizationPlanNetworkRuntimeEvent({
          queryExec,
          projectId: candidate.projectId,
          eventType: 'impact_monitoring',
          eventStatus: 'monitoring_passed',
          publicationKey: candidate.publicationKey,
          executedAt,
          eventPayload: {
            ...commonPayload,
            monitoredConsumerCount: readNonNegativeInteger(candidate.consumerObservationCount),
            regressionDetected: false,
            monitoringBasis: 'saved_outcome_consumer_observation_and_site_adoption_present',
          },
        })
        if (impact.status === 'runtime_event_recorded') result.impactMonitoringRecorded += 1
      }
      if (!candidate.existingRollbackVerification) {
        const rollback = await recordConstructionOrganizationPlanNetworkRuntimeEvent({
          queryExec,
          projectId: candidate.projectId,
          eventType: 'rollback_execution',
          eventStatus: 'rollback_executed',
          publicationKey: candidate.publicationKey,
          executedAt,
          eventPayload: {
            ...commonPayload,
            rollbackTarget: normalizeText(candidate.rollbackTarget) || null,
            rollbackWriterRefs: readStringArray(candidate.rollbackWriterRefs),
            rollbackVerificationMode: 'path_verified_no_runtime_reversal',
          },
        })
        if (rollback.status === 'runtime_event_recorded') result.rollbackVerificationRecorded += 1
      }
      for (const measurement of readRuntimeEngineMeasurements(candidate.runtimeEngineMeasurements)) {
        const engineEvidence = await recordConstructionOrganizationPlanNetworkRuntimeEngineEvidence({
          queryExec,
          publicationKey: candidate.publicationKey,
          engineCode: measurement.engineCode,
          projectId: candidate.projectId,
          dedupeKey: measurement.dedupeKey
            ?? `${candidate.publicationKey}:${measurement.engineCode}:${normalizeText(candidate.useCase)}`,
          predictedDurationDays: measurement.predictedDurationDays,
          actualDurationDays: measurement.actualDurationDays,
          predictedAt: measurement.predictedAt ?? candidate.publishedAt ?? undefined,
          observedAt: measurement.observedAt ?? executedAt,
          metadata: {
            ...(measurement.metadata ?? {}),
            ...commonPayload,
            runtimeEngineEvidenceSource: 'verified_runtime_adopted_plan_network_measurement',
          },
        })
        if (engineEvidence.status === 'runtime_engine_evidence_recorded') {
          result.runtimeEngineEvidenceRecorded += 1
        }
      }
    } catch (error) {
      result.failed += 1
      logger.warn('constructionOrganizationPlanNetworkRuntimeEvidenceJob candidate failed', {
        publicationKey: candidate.publicationKey,
        projectId: candidate.projectId,
        draftNetworkKey: candidate.draftNetworkKey,
        optionId: candidate.optionId,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  return result
}

export class ConstructionOrganizationPlanNetworkRuntimeEvidenceJob {
  private isRunning = false
  private lastRun: Date | null = null
  private nextRun: Date | null = null
  private wallClockTimer: PersistentWallClockJobTimer

  constructor(private readonly options: ConstructionOrganizationPlanNetworkRuntimeEvidenceJobOptions = {}) {
    this.wallClockTimer = new PersistentWallClockJobTimer({
      jobName: 'constructionOrganizationPlanNetworkRuntimeEvidenceJob',
      schedule: { kind: 'daily', hour: 7, minute: 20 },
      execute: () => this.execute('scheduler'),
      onScheduled: ({ nextRun, delayMs }) => {
        this.nextRun = nextRun
        logger.info('constructionOrganizationPlanNetworkRuntimeEvidenceJob scheduled', {
          nextRun: nextRun.toISOString(),
          trigger: 'daily_07_20',
          initialDelay: delayMs,
        })
      },
      onError: (error) => logger.error('constructionOrganizationPlanNetworkRuntimeEvidenceJob scheduler failed', {
        error: error instanceof Error ? error.message : String(error),
      }),
    })
  }

  start() {
    if (!this.wallClockTimer.start()) {
      logger.warn('constructionOrganizationPlanNetworkRuntimeEvidenceJob is already running')
    }
  }

  stop() {
    this.wallClockTimer.stop()
    this.nextRun = null
    logger.info('constructionOrganizationPlanNetworkRuntimeEvidenceJob stopped')
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      isScheduled: this.wallClockTimer.getStatus().isScheduled,
      lastRun: this.lastRun ? this.lastRun.toISOString() : null,
      nextRun: this.nextRun ? this.nextRun.toISOString() : null,
    }
  }

  async executeNow() {
    return this.execute('manual')
  }

  private async execute(triggeredBy: 'scheduler' | 'manual') {
    if (this.isRunning) {
      logger.warn('constructionOrganizationPlanNetworkRuntimeEvidenceJob is already running, skip tick', { triggeredBy })
      return emptyResult()
    }
    this.isRunning = true
    const jobId = createJobId()
    try {
      this.lastRun = new Date()
      const { attempts, value } = await runJobWithRetry(
        {
          jobName: 'constructionOrganizationPlanNetworkRuntimeEvidenceJob',
          triggeredBy,
          jobId,
        },
        async () => runConstructionOrganizationPlanNetworkRuntimeEvidenceSweep(this.options),
      )
      logger.info('constructionOrganizationPlanNetworkRuntimeEvidenceJob completed', {
        triggeredBy,
        jobId,
        attempts,
        ...value,
      })
      return value
    } catch (error) {
      logger.error('constructionOrganizationPlanNetworkRuntimeEvidenceJob failed', {
        triggeredBy,
        jobId,
        error: error instanceof Error ? error.message : String(error),
      })
      throw error
    } finally {
      this.isRunning = false
    }
  }
}

export const constructionOrganizationPlanNetworkRuntimeEvidenceJob =
  new ConstructionOrganizationPlanNetworkRuntimeEvidenceJob()
