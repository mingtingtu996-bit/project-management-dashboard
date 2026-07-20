import { createHash } from 'node:crypto'
import { withDatabaseTransaction } from '../database.js'

import {
  recordCommittedDurationSuggestionPredictionEvidence,
  type CommittedDurationSuggestionPredictionEvidence,
} from './durationSuggestionService.js'
import {
  recordWbsTemplateCandidateEventStrict,
  type RecordWbsTemplateCandidateEventInput,
} from './wbsTemplateCandidateEventService.js'
import type {
  GeneratedTemplateRow,
  WbsTemplateGenerationRuntimeArtifactPublication,
} from './wbsTemplateGenerationService.js'
import type {
  DurationLearningRuntimePublicationQueryExec,
  DurationLearningRuntimeScope,
} from './durationLearningRuntimePublicationService.js'

export type DurationLearningRuntimeEvidenceEventType = 'duration_prediction' | 'wbs_candidate'
export type DurationLearningRuntimeEvidenceSubjectType = 'task' | 'baseline_item'

export interface DurationLearningRuntimeEvidenceOutboxEvent {
  eventType: DurationLearningRuntimeEvidenceEventType
  companyId: string
  projectId: string
  subjectType: DurationLearningRuntimeEvidenceSubjectType
  subjectId: string
  assetKey?: string | null
  publicationKey?: string | null
  artifactKey?: string | null
  scopeLevel?: string | null
  industryKey?: string | null
  inputSubjectIds?: string[]
  inputTaskIds?: string[]
  payload: CommittedDurationSuggestionPredictionEvidence | RecordWbsTemplateCandidateEventInput | Record<string, unknown>
}

type EvidenceOutboxRow = {
  event_key?: unknown
  event_type?: unknown
  company_id?: unknown
  project_id?: unknown
  subject_type?: unknown
  subject_id?: unknown
  asset_key?: unknown
  publication_key?: unknown
  artifact_key?: unknown
  scope_level?: unknown
  industry_key?: unknown
  input_subject_ids?: unknown
  input_task_ids?: unknown
  payload?: unknown
}

type ProcessEvidenceOutboxInput = {
  queryExec: DurationLearningRuntimePublicationQueryExec
  ownerId: string
  now?: string
  limit?: number
  recordDurationPrediction?: typeof recordCommittedDurationSuggestionPredictionEvidence
  recordWbsCandidate?: typeof recordWbsTemplateCandidateEventStrict
  transactionRunner?: <T>(work: () => Promise<T>) => Promise<T>
}

export type ProcessDurationLearningRuntimeEvidenceOutboxResult = {
  claimed: number
  completed: number
  failed: number
  failureKeys: string[]
}

function text(value: unknown) {
  return String(value ?? '').trim()
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function list(value: unknown) {
  return Array.isArray(value) ? value : []
}

function uniqueTexts(values: readonly unknown[]) {
  return Array.from(new Set(values.map(text).filter(Boolean))).sort()
}

function canonical(value: unknown): unknown {
  if (value == null || typeof value === 'string' || typeof value === 'boolean') return value
  if (typeof value === 'number') return Number.isFinite(value) ? value : String(value)
  if (Array.isArray(value)) return value.map(canonical)
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, item]) => item !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonical(item)]),
    )
  }
  return String(value)
}

function evidenceEventKey(event: DurationLearningRuntimeEvidenceOutboxEvent) {
  const digest = createHash('sha256').update(JSON.stringify(canonical(event))).digest('hex')
  return `duration-learning-runtime-evidence:${event.eventType}:${digest}`
}

function normalizeEvent(event: DurationLearningRuntimeEvidenceOutboxEvent) {
  const eventType = text(event.eventType) as DurationLearningRuntimeEvidenceEventType
  const companyId = text(event.companyId)
  const projectId = text(event.projectId)
  const subjectType = text(event.subjectType) as DurationLearningRuntimeEvidenceSubjectType
  const subjectId = text(event.subjectId)
  const assetKey = text(event.assetKey) || null
  const publicationKey = text(event.publicationKey) || null
  const artifactKey = text(event.artifactKey) || null
  const scopeLevel = text(event.scopeLevel) || null
  const industryKey = text(event.industryKey) || null
  const inputSubjectIds = uniqueTexts(event.inputSubjectIds ?? [subjectId])
  const inputTaskIds = uniqueTexts(event.inputTaskIds ?? [])
  if (
    !['duration_prediction', 'wbs_candidate'].includes(eventType)
    || !companyId
    || !projectId
    || !['task', 'baseline_item'].includes(subjectType)
    || !subjectId
    || !inputSubjectIds.includes(subjectId)
  ) {
    throw new Error('duration_learning_runtime_evidence_outbox_identity_invalid')
  }
  if (
    eventType === 'duration_prediction'
    && (
      subjectType !== 'task'
      || !assetKey
      || !publicationKey
      || !artifactKey
      || !scopeLevel
      || (scopeLevel === 'industry' && !industryKey)
      || !inputTaskIds.includes(subjectId)
    )
  ) {
    throw new Error('duration_learning_runtime_prediction_outbox_lineage_invalid')
  }
  const normalized: DurationLearningRuntimeEvidenceOutboxEvent = {
    eventType,
    companyId,
    projectId,
    subjectType,
    subjectId,
    assetKey,
    publicationKey,
    artifactKey,
    scopeLevel,
    industryKey,
    inputSubjectIds,
    inputTaskIds,
    payload: canonical(event.payload) as Record<string, unknown>,
  }
  return {
    event_key: evidenceEventKey(normalized),
    event_type: eventType,
    company_id: companyId,
    project_id: projectId,
    subject_type: subjectType,
    subject_id: subjectId,
    asset_key: assetKey,
    publication_key: publicationKey,
    artifact_key: artifactKey,
    scope_level: scopeLevel,
    industry_key: industryKey,
    input_subject_ids: inputSubjectIds,
    input_task_ids: inputTaskIds,
    payload: normalized.payload,
  }
}

export async function enqueueDurationLearningRuntimeEvidenceBatch(input: {
  queryExec: DurationLearningRuntimePublicationQueryExec
  events: readonly DurationLearningRuntimeEvidenceOutboxEvent[]
}) {
  const rows = [...new Map(input.events.map((event) => {
    const row = normalizeEvent(event)
    return [row.event_key, row]
  })).values()]
  if (rows.length === 0) return { requestedCount: 0, persistedCount: 0, eventKeys: [] as string[] }
  const persisted = await input.queryExec<{ event_key?: unknown }>(
    `/* duration-learning-runtime-evidence-outbox:enqueue */
     with requested as materialized (
       select *
         from jsonb_to_recordset($1::jsonb) as row(
           event_key text,
           event_type text,
           company_id uuid,
           project_id uuid,
           subject_type text,
           subject_id uuid,
           asset_key text,
           publication_key text,
           artifact_key text,
           scope_level text,
           industry_key text,
           input_subject_ids jsonb,
           input_task_ids jsonb,
           payload jsonb
         )
     ), authorized as materialized (
       select requested.*
         from requested
         join public.projects project
           on project.id = requested.project_id
          and project.company_id = requested.company_id
        where requested.input_subject_ids ? requested.subject_id::text
          and not exists (
            select 1
              from jsonb_array_elements_text(requested.input_subject_ids) input_subject(subject_id)
             where (
               requested.subject_type = 'task'
               and not exists (
                 select 1 from public.tasks task
                  where task.id = input_subject.subject_id::uuid
                    and task.project_id = requested.project_id
               )
             ) or (
               requested.subject_type = 'baseline_item'
               and not exists (
                 select 1 from public.task_baseline_items baseline_item
                  where baseline_item.id = input_subject.subject_id::uuid
                    and baseline_item.project_id = requested.project_id
               )
             )
          )
          and (
            (
              requested.event_type = 'duration_prediction'
              and requested.subject_type = 'task'
              and requested.asset_key is not null
              and requested.publication_key is not null
              and requested.artifact_key is not null
              and requested.scope_level is not null
              and not exists (
                select 1
                  from jsonb_array_elements_text(requested.input_task_ids) input_task(task_id)
                  left join public.tasks task
                    on task.id = input_task.task_id::uuid
                   and task.project_id = requested.project_id
                 where task.id is null
               )
              and jsonb_typeof(requested.payload->'runtimeApplications') = 'array'
              and jsonb_array_length(requested.payload->'runtimeApplications') > 0
              and not exists (
                select 1
                  from jsonb_array_elements(requested.payload->'runtimeApplications') application
                 where not exists (
                   select 1
                     from public.duration_learning_runtime_publications publication
                    where publication.publication_key = application->>'publicationKey'
                      and publication.asset_key = application->>'assetKey'
                      and publication.artifact_key = application->>'artifactKey'
                      and publication.scope_level = application->>'scopeLevel'
                      and (
                        (publication.publication_stage = 'canary' and publication.monitoring_status in ('pending', 'collecting', 'passed'))
                        or (publication.publication_stage = 'stable' and publication.monitoring_status = 'passed')
                      )
                      and (
                        (
                          publication.scope_level = 'project'
                          and publication.company_id = requested.company_id
                          and publication.project_id = requested.project_id
                        )
                        or (
                          publication.scope_level = 'company'
                          and publication.company_id = requested.company_id
                        )
                        or (
                          publication.scope_level = 'industry'
                          and publication.industry_key = application->>'industryKey'
                        )
                        or publication.scope_level = 'global'
                      )
                      and (
                        publication.scope_level <> 'industry'
                        or nullif(application->>'industryKey', '') is not null
                      )
                 )
              )
              and exists (
                select 1
                  from public.duration_learning_runtime_publications publication
                 where publication.publication_key = requested.publication_key
                   and publication.asset_key = requested.asset_key
                   and publication.artifact_key = requested.artifact_key
                   and publication.scope_level = requested.scope_level
                   and (
                     (publication.publication_stage = 'canary' and publication.monitoring_status in ('pending', 'collecting', 'passed'))
                     or (publication.publication_stage = 'stable' and publication.monitoring_status = 'passed')
                   )
                   and (
                     (
                       publication.scope_level = 'project'
                       and publication.company_id = requested.company_id
                       and publication.project_id = requested.project_id
                     )
                     or (
                       publication.scope_level = 'company'
                       and publication.company_id = requested.company_id
                     )
                     or (
                       publication.scope_level = 'industry'
                       and publication.industry_key = requested.industry_key
                     )
                     or publication.scope_level = 'global'
                   )
              )
            )
            or requested.event_type = 'wbs_candidate'
          )
     ), persisted as (
       insert into public.duration_learning_runtime_evidence_outbox (
         event_key, event_type, company_id, project_id, subject_type, subject_id,
         asset_key, publication_key, artifact_key, scope_level, industry_key,
         input_subject_ids, input_task_ids, payload,
         processing_status, attempt_count, next_attempt_at, created_at, updated_at
       )
       select event_key, event_type, company_id, project_id, subject_type, subject_id,
              asset_key, publication_key, artifact_key, scope_level, industry_key,
              input_subject_ids, input_task_ids, payload,
              'pending', 0, now(), now(), now()
         from authorized
       on conflict (event_key) do update set event_key = excluded.event_key
       returning event_key
     )
     select event_key from persisted`,
    [rows],
  )
  if (persisted.length !== rows.length) {
    throw new Error(`duration_learning_runtime_evidence_outbox_authority_mismatch:${rows.length}:${persisted.length}`)
  }
  return {
    requestedCount: rows.length,
    persistedCount: persisted.length,
    eventKeys: persisted.map((row) => text(row.event_key)).filter(Boolean),
  }
}

function authorityArtifactKey(publication: WbsTemplateGenerationRuntimeArtifactPublication) {
  const context = record(publication.observationContext)
  return text(context.artifactKey ?? context.artifact_key ?? context.templateId ?? context.template_id)
}

function authorityScopeLevel(value: unknown): DurationLearningRuntimeScope['level'] | null {
  const level = text(value)
  return ['project', 'company', 'industry', 'global'].includes(level)
    ? level as DurationLearningRuntimeScope['level']
    : null
}

function isCanonicalAuthority(publication: WbsTemplateGenerationRuntimeArtifactPublication) {
  const publicationKey = text(publication.publicationKey)
  return Boolean(publicationKey) && (publication.sourceEvidenceRefs ?? [])
    .map(text)
    .includes(`duration_learning_runtime_publications:${publicationKey}`)
}

export function buildGeneratedDurationPredictionOutboxEvents(input: {
  companyId: string
  projectId: string
  generationBatchId?: string | null
  rows: readonly GeneratedTemplateRow[]
  runtimeArtifactPublications: readonly WbsTemplateGenerationRuntimeArtifactPublication[]
  subjectType: DurationLearningRuntimeEvidenceSubjectType
  subjectIdByClientRowId: ReadonlyMap<string, string>
}) {
  if (input.subjectType !== 'task') return []
  const authorities = new Map(input.runtimeArtifactPublications
    .filter(isCanonicalAuthority)
    .map((publication) => [[
      text(publication.assetKey),
      text(publication.publicationKey),
      authorityArtifactKey(publication),
    ].join('\u0000'), publication]))
  const events: DurationLearningRuntimeEvidenceOutboxEvent[] = []
  for (const row of input.rows) {
    const taskId = text(input.subjectIdByClientRowId.get(row.clientRowId))
    if (!taskId) continue
    const values = record(row.values)
    const metadata = record(values.standard_task_metadata)
    const suggestion = record(row.durationSuggestion ?? values.duration_suggestion ?? metadata.durationSuggestion)
    const recommendedDurationDays = Number(suggestion.recommendedDurationDays)
    if (!Number.isFinite(recommendedDurationDays) || recommendedDurationDays <= 0) continue
    const runtimeApplications = list(metadata.durationLearningConsumptions)
      .map(record)
      .flatMap((consumption) => {
        const assetKey = text(consumption.assetKey)
        const publicationKey = text(consumption.publicationKey)
        const artifactKey = text(consumption.artifactKey)
        const authority = authorities.get([assetKey, publicationKey, artifactKey].join('\u0000'))
        if (!authority) return []
        const authorityContext = record(authority.observationContext)
        const scopeLevel = authorityScopeLevel(authorityContext.scopeLevel ?? authorityContext.scope_level)
        const industryKey = text(authorityContext.industryKey ?? authorityContext.industry_key) || null
        if (!scopeLevel || (scopeLevel === 'industry' && !industryKey)) return []
        return [{
          assetKey,
          publicationKey,
          artifactKey,
          scopeLevel,
          industryKey,
          inputTaskIds: [taskId],
        }]
      })
    if (runtimeApplications.length === 0) continue
    const primary = runtimeApplications[0]
    const payload: CommittedDurationSuggestionPredictionEvidence = {
      companyId: input.companyId,
      projectId: input.projectId,
      taskId,
      generationBatchId: input.generationBatchId,
      standardWorkCode: text(values.standard_work_code ?? metadata.standardWorkCode) || null,
      plannedStartDate: text(values.planned_start_date ?? values.start_date) || null,
      plannedEndDate: text(values.planned_end_date ?? values.end_date) || null,
      recommendedDurationDays,
      forecastSource: text(suggestion.forecastSource) || null,
      confidenceLevel: text(suggestion.confidenceLevel) || null,
      confidenceScore: Number.isFinite(Number(suggestion.confidenceScore)) ? Number(suggestion.confidenceScore) : null,
      runtimeApplications,
    }
    events.push({
      eventType: 'duration_prediction',
      companyId: input.companyId,
      projectId: input.projectId,
      subjectType: 'task',
      subjectId: taskId,
      assetKey: primary.assetKey,
      publicationKey: primary.publicationKey,
      artifactKey: primary.artifactKey,
      scopeLevel: primary.scopeLevel,
      industryKey: primary.industryKey,
      inputSubjectIds: [taskId],
      inputTaskIds: [taskId],
      payload,
    })
  }
  return events
}

export function buildWbsCandidateOutboxEvent(input: {
  companyId: string
  projectId: string
  subjectType: DurationLearningRuntimeEvidenceSubjectType
  subjectId: string
  candidate: RecordWbsTemplateCandidateEventInput
  runtimeArtifactPublications?: readonly WbsTemplateGenerationRuntimeArtifactPublication[]
}): DurationLearningRuntimeEvidenceOutboxEvent {
  const nodes = list(input.candidate.durationCandidateNodes).map(record)
  const publicationKeys = uniqueTexts(nodes.map((node) => node.runtimePublicationKey))
  const generatedEntityIds = uniqueTexts(input.candidate.generatedEntityIds ?? [])
  const canonicalLineages = [...new Map((input.runtimeArtifactPublications ?? [])
    .filter(isCanonicalAuthority)
    .filter((publication) => publication.assetKey === 'special_work_duration_seed')
    .filter((publication) => publicationKeys.includes(text(publication.publicationKey)))
    .flatMap((publication) => {
      const context = record(publication.observationContext)
      const scopeLevel = authorityScopeLevel(context.scopeLevel ?? context.scope_level)
      const industryKey = text(context.industryKey ?? context.industry_key) || null
      const artifactKey = authorityArtifactKey(publication)
      if (!scopeLevel || !artifactKey || (scopeLevel === 'industry' && !industryKey)) return []
      const lineage = {
        assetKey: publication.assetKey,
        publicationKey: text(publication.publicationKey),
        artifactKey,
        scopeLevel,
        industryKey,
        inputTaskIds: input.subjectType === 'task' ? generatedEntityIds : [],
      }
      return [[[lineage.assetKey, lineage.publicationKey, lineage.artifactKey].join('\u0000'), lineage] as const]
    })).values()]
  const authoritativeRuntimeLineage = canonicalLineages.length === 1 ? canonicalLineages[0] : null
  return {
    eventType: 'wbs_candidate',
    companyId: input.companyId,
    projectId: input.projectId,
    subjectType: input.subjectType,
    subjectId: input.subjectId,
    assetKey: authoritativeRuntimeLineage?.assetKey ?? (nodes.length > 0 ? 'special_work_duration_seed' : null),
    publicationKey: authoritativeRuntimeLineage?.publicationKey ?? null,
    artifactKey: authoritativeRuntimeLineage?.artifactKey ?? (text(input.candidate.templateId) || null),
    scopeLevel: authoritativeRuntimeLineage?.scopeLevel ?? null,
    industryKey: authoritativeRuntimeLineage?.industryKey ?? null,
    inputSubjectIds: generatedEntityIds,
    inputTaskIds: input.subjectType === 'task' ? generatedEntityIds : [],
    payload: {
      ...input.candidate,
      companyId: input.companyId,
      projectId: input.projectId,
      generatedEntityIds,
      materializationSubjectType: input.subjectType,
      materializationSubjectId: input.subjectId,
      authoritativeRuntimeLineage,
    },
  }
}

function mapOutboxRow(row: EvidenceOutboxRow) {
  return {
    eventKey: text(row.event_key),
    eventType: text(row.event_type) as DurationLearningRuntimeEvidenceEventType,
    companyId: text(row.company_id),
    projectId: text(row.project_id),
    subjectType: text(row.subject_type) as DurationLearningRuntimeEvidenceSubjectType,
    subjectId: text(row.subject_id),
    assetKey: text(row.asset_key) || null,
    publicationKey: text(row.publication_key) || null,
    artifactKey: text(row.artifact_key) || null,
    scopeLevel: text(row.scope_level) || null,
    industryKey: text(row.industry_key) || null,
    inputSubjectIds: uniqueTexts(list(row.input_subject_ids)),
    inputTaskIds: uniqueTexts(list(row.input_task_ids)),
    payload: record(row.payload),
  }
}

function assertClaimedEventAuthority(event: ReturnType<typeof mapOutboxRow>) {
  const payload = event.payload
  if (
    !event.eventKey
    || !event.companyId
    || !event.projectId
    || text(payload.companyId) !== event.companyId
    || text(payload.projectId) !== event.projectId
    || !event.inputSubjectIds.includes(event.subjectId)
  ) throw new Error('duration_learning_runtime_evidence_claim_scope_mismatch')
  if (event.eventType === 'duration_prediction') {
    const applications = list(payload.runtimeApplications).map(record)
    const exact = applications.some((application) => (
      text(application.publicationKey) === event.publicationKey
      && text(application.assetKey) === event.assetKey
      && text(application.artifactKey) === event.artifactKey
      && text(application.scopeLevel) === event.scopeLevel
      && (event.scopeLevel !== 'industry' || text(application.industryKey) === event.industryKey)
      && uniqueTexts(list(application.inputTaskIds)).includes(event.subjectId)
    ))
    if (event.subjectType !== 'task' || text(payload.taskId) !== event.subjectId || !exact) {
      throw new Error('duration_learning_runtime_prediction_claim_lineage_mismatch')
    }
  } else if (event.eventType === 'wbs_candidate') {
    const generatedEntityIds = uniqueTexts(list(payload.generatedEntityIds))
    if (
      generatedEntityIds.length !== event.inputSubjectIds.length
      || generatedEntityIds.some((subjectId, index) => subjectId !== event.inputSubjectIds[index])
      || (event.subjectType === 'baseline_item' && event.inputTaskIds.length > 0)
    ) {
      throw new Error('duration_learning_runtime_wbs_candidate_claim_lineage_mismatch')
    }
  }
}

export async function processDurationLearningRuntimeEvidenceOutbox(
  input: ProcessEvidenceOutboxInput,
): Promise<ProcessDurationLearningRuntimeEvidenceOutboxResult> {
  const ownerId = text(input.ownerId)
  if (!ownerId) throw new Error('duration_learning_runtime_evidence_outbox_owner_required')
  const now = input.now ?? new Date().toISOString()
  const limit = Math.max(1, Math.min(100, Math.trunc(Number(input.limit) || 50)))
  const claimedRows = await input.queryExec<EvidenceOutboxRow>(
    `/* duration-learning-runtime-evidence-outbox:claim */
     with selected as (
       select event_key
         from public.duration_learning_runtime_evidence_outbox
        where (
          processing_status in ('pending', 'failed')
          and next_attempt_at <= $1::timestamptz
        ) or (
          processing_status = 'processing'
          and lease_expires_at <= $1::timestamptz
        )
        order by attempt_count asc, created_at asc, event_key asc
        for update skip locked
        limit $2
     )
     update public.duration_learning_runtime_evidence_outbox outbox
        set processing_status = 'processing',
            attempt_count = outbox.attempt_count + 1,
            lease_owner = $3,
            lease_expires_at = $1::timestamptz + interval '10 minutes',
            last_error = null,
            updated_at = $1::timestamptz
       from selected
      where outbox.event_key = selected.event_key
     returning outbox.*`,
    [now, limit, ownerId],
  )
  const result = { claimed: claimedRows.length, completed: 0, failed: 0, failureKeys: [] as string[] }
  const recordDurationPrediction = input.recordDurationPrediction ?? recordCommittedDurationSuggestionPredictionEvidence
  const recordWbsCandidate = input.recordWbsCandidate ?? recordWbsTemplateCandidateEventStrict
  const transactionRunner = input.transactionRunner
    ?? (input.recordDurationPrediction || input.recordWbsCandidate
      ? async <T>(work: () => Promise<T>) => work()
      : withDatabaseTransaction)
  for (const row of claimedRows) {
    const event = mapOutboxRow(row)
    try {
      await transactionRunner(async () => {
        assertClaimedEventAuthority(event)
        if (event.eventType === 'duration_prediction') {
          await recordDurationPrediction(event.payload as unknown as CommittedDurationSuggestionPredictionEvidence)
        } else if (event.eventType === 'wbs_candidate') {
          await recordWbsCandidate({
            ...(event.payload as unknown as RecordWbsTemplateCandidateEventInput),
            generatedEntityIds: event.inputSubjectIds,
            materializationSubjectType: event.subjectType,
            materializationSubjectId: event.subjectId,
            authoritativeRuntimeLineage: event.publicationKey
              ? {
                  assetKey: event.assetKey,
                  publicationKey: event.publicationKey,
                  artifactKey: event.artifactKey,
                  scopeLevel: event.scopeLevel,
                  industryKey: event.industryKey,
                  inputTaskIds: event.inputTaskIds,
                }
              : null,
            idempotencyKey: event.eventKey,
            governanceQueryExec: input.queryExec,
          })
        } else {
          throw new Error(`duration_learning_runtime_evidence_type_unsupported:${event.eventType}`)
        }
        const completed = await input.queryExec<{ event_key?: unknown }>(
          `/* duration-learning-runtime-evidence-outbox:complete */
           update public.duration_learning_runtime_evidence_outbox
              set processing_status = 'completed',
                  lease_owner = null,
                  lease_expires_at = null,
                  completed_at = $3::timestamptz,
                  updated_at = $3::timestamptz
            where event_key = $1
              and processing_status = 'processing'
              and lease_owner = $2
          returning event_key`,
          [event.eventKey, ownerId, now],
        )
        if (completed.length !== 1) {
          throw new Error('duration_learning_runtime_evidence_outbox_completion_cas_failed')
        }
      })
      result.completed += 1
    } catch (error) {
      await input.queryExec(
        `/* duration-learning-runtime-evidence-outbox:fail */
         update public.duration_learning_runtime_evidence_outbox
            set processing_status = 'failed',
                lease_owner = null,
                lease_expires_at = null,
                next_attempt_at = $3::timestamptz,
                last_error = $4,
                updated_at = $3::timestamptz
          where event_key = $1
            and processing_status = 'processing'
            and lease_owner = $2`,
        [event.eventKey, ownerId, now, error instanceof Error ? error.message : String(error)],
      )
      result.failed += 1
      result.failureKeys.push(event.eventKey)
    }
  }
  return result
}
