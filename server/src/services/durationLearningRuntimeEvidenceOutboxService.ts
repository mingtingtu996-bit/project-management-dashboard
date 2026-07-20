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

type TrustedWbsConsumptionRow = {
  company_id?: unknown
  project_id?: unknown
  consumption_key?: unknown
  publication_key?: unknown
  asset_key?: unknown
  artifact_key?: unknown
  task_id?: unknown
  baseline_item_id?: unknown
  generation_batch_id?: unknown
  source_evidence_refs?: unknown
  consumption_context?: unknown
  publication_stage?: unknown
  monitoring_status?: unknown
  publication_scope_level?: unknown
  publication_company_id?: unknown
  publication_project_id?: unknown
  publication_industry_key?: unknown
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

const UNLINKED_WBS_LINEAGE_REASONS = new Set([
  'no_runtime_publication_lineage',
  'no_trusted_consumption',
  'missing_generation_batch_id',
])

function exactTextSet(left: readonly unknown[], right: readonly unknown[]) {
  const normalizedLeft = uniqueTexts(left)
  const normalizedRight = uniqueTexts(right)
  return normalizedLeft.length === normalizedRight.length
    && normalizedLeft.every((value, index) => value === normalizedRight[index])
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
  const payload = record(event.payload)
  if (eventType === 'duration_prediction') {
    const generationBatchId = text(payload.generationBatchId ?? payload.generation_batch_id)
    const applications = list(payload.runtimeApplications).map(record)
    const primaryApplicationPresent = applications.some((application) => (
      text(application.assetKey) === assetKey
      && text(application.publicationKey) === publicationKey
      && text(application.artifactKey) === artifactKey
      && text(application.scopeLevel) === scopeLevel
      && (scopeLevel !== 'industry' || text(application.industryKey) === industryKey)
    ))
    if (
      !generationBatchId
      || applications.length === 0
      || !primaryApplicationPresent
      || applications.some((application) => (
        !text(application.assetKey)
        || !text(application.publicationKey)
        || !text(application.artifactKey)
        || !['project', 'company', 'industry', 'global'].includes(text(application.scopeLevel))
        || (text(application.scopeLevel) === 'industry' && !text(application.industryKey))
        || !uniqueTexts(list(application.inputTaskIds)).includes(subjectId)
      ))
    ) {
      throw new Error('duration_learning_runtime_prediction_outbox_physical_lineage_invalid')
    }
  }
  if (eventType === 'wbs_candidate') {
    const linked = Boolean(assetKey || publicationKey || artifactKey || scopeLevel || industryKey)
    const generatedEntityIds = uniqueTexts(list(payload.generatedEntityIds))
    const lineages = list(payload.authoritativeRuntimeLineages).map(record)
    const lineage = record(payload.authoritativeRuntimeLineage)
    if (!exactTextSet(generatedEntityIds, inputSubjectIds)) {
      throw new Error('duration_learning_runtime_wbs_candidate_subject_lineage_invalid')
    }
    if (!linked) {
      if (
        inputTaskIds.length > 0
        || !UNLINKED_WBS_LINEAGE_REASONS.has(text(payload.lineageResolution))
        || Object.keys(lineage).length > 0
        || lineages.length > 0
        || list(payload.runtimeConsumptionKeys).length > 0
        || list(payload.runtimeSourceEvidenceRefs).length > 0
      ) {
        throw new Error('duration_learning_runtime_wbs_candidate_unlinked_contract_invalid')
      }
    } else {
      const sourceRefs = uniqueTexts(list(payload.runtimeSourceEvidenceRefs))
      if (
        assetKey !== 'special_work_duration_seed'
        || !publicationKey
        || !artifactKey
        || !scopeLevel
        || (scopeLevel === 'industry' && !industryKey)
        || !text(payload.generationBatchId ?? payload.generation_batch_id)
        || text(payload.lineageResolution) !== 'physical_runtime_consumption'
        || lineages.length !== 1
        || text(lineage.assetKey) !== assetKey
        || text(lineage.publicationKey) !== publicationKey
        || text(lineage.artifactKey) !== artifactKey
        || text(lineage.scopeLevel) !== scopeLevel
        || (scopeLevel === 'industry' && text(lineage.industryKey) !== industryKey)
        || uniqueTexts(list(payload.runtimeConsumptionKeys)).length === 0
        || !sourceRefs.includes(`duration_learning_runtime_publications:${publicationKey}`)
        || (subjectType === 'task' && !exactTextSet(inputTaskIds, inputSubjectIds))
        || (subjectType === 'baseline_item' && inputTaskIds.length > 0)
      ) {
        throw new Error('duration_learning_runtime_wbs_candidate_linked_contract_invalid')
      }
    }
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
    payload: canonical(payload) as Record<string, unknown>,
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
  const expandedEvents: DurationLearningRuntimeEvidenceOutboxEvent[] = []
  for (const event of input.events) {
    if (event.eventType === 'wbs_candidate') {
      expandedEvents.push(...await expandWbsCandidateOutboxEventsForTrustedConsumption({
        event,
        queryExec: input.queryExec,
      }))
    } else {
      expandedEvents.push(event)
    }
  }
  const rows = [...new Map(expandedEvents.map((event) => {
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
            or (
              requested.event_type = 'wbs_candidate'
              and jsonb_typeof(requested.payload) = 'object'
            )
          )
          and public.duration_learning_runtime_evidence_outbox_row_is_authorized(
            requested.event_type,
            requested.company_id,
            requested.project_id,
            requested.subject_type,
            requested.subject_id,
            requested.asset_key,
            requested.publication_key,
            requested.artifact_key,
            requested.scope_level,
            requested.industry_key,
            requested.input_subject_ids,
            requested.input_task_ids,
            requested.payload
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

type WbsCandidateLineage = {
  assetKey: string
  publicationKey: string
  artifactKey: string
  scopeLevel: string
  industryKey: string | null
  inputTaskIds: string[]
  inputSubjectIds?: string[]
  consumptionKeys?: string[]
  sourceEvidenceRefs?: string[]
}

function candidateOwnedSubjectIds(event: DurationLearningRuntimeEvidenceOutboxEvent) {
  const payload = record(event.payload)
  const generatedEntityIds = uniqueTexts(list(payload.generatedEntityIds))
  return generatedEntityIds.length > 0
    ? generatedEntityIds
    : uniqueTexts(event.inputSubjectIds ?? [event.subjectId])
}

function trustedConsumptionRowMatchesContract(
  row: TrustedWbsConsumptionRow,
  event: DurationLearningRuntimeEvidenceOutboxEvent,
  lineage: WbsCandidateLineage,
) {
  const sourceRefs = row.source_evidence_refs
  if (!Array.isArray(sourceRefs)
    || !sourceRefs.map(text).includes(`duration_learning_runtime_publications:${lineage.publicationKey}`)) return false
  const context = record(row.consumption_context)
  if (text(context.authoritySource) !== 'runtime_resolver_publication_set') return false
  if (text(row.company_id) !== text(event.companyId) || text(row.project_id) !== text(event.projectId)) return false
  if (!((text(row.publication_stage) === 'canary' && ['pending', 'collecting', 'passed'].includes(text(row.monitoring_status)))
    || (text(row.publication_stage) === 'stable' && text(row.monitoring_status) === 'passed'))) return false
  if (text(row.publication_scope_level) !== lineage.scopeLevel) return false
  if (lineage.scopeLevel === 'project'
    && (text(row.publication_company_id) !== text(event.companyId)
      || text(row.publication_project_id) !== text(event.projectId)
      || text(row.publication_industry_key))) return false
  if (lineage.scopeLevel === 'company'
    && (text(row.publication_company_id) !== text(event.companyId)
      || text(row.publication_project_id)
      || text(row.publication_industry_key))) return false
  if (lineage.scopeLevel === 'industry'
    && (text(row.publication_company_id)
      || text(row.publication_project_id)
      || !lineage.industryKey
      || text(row.publication_industry_key) !== lineage.industryKey
      || text(context.industryKey) !== lineage.industryKey)) return false
  if (lineage.scopeLevel === 'global'
    && (text(row.publication_company_id) || text(row.publication_project_id) || text(row.publication_industry_key))) return false
  return true
}

function wbsCandidateLineages(event: DurationLearningRuntimeEvidenceOutboxEvent): WbsCandidateLineage[] {
  const payload = record(event.payload)
  const payloadLineages = list(payload.authoritativeRuntimeLineages).map(record).flatMap((lineage) => {
    const assetKey = text(lineage.assetKey)
    const publicationKey = text(lineage.publicationKey)
    const artifactKey = text(lineage.artifactKey)
    const scopeLevel = text(lineage.scopeLevel)
    if (!assetKey || !publicationKey || !artifactKey || !scopeLevel) return []
    return [{
      assetKey,
      publicationKey,
      artifactKey,
      scopeLevel,
      industryKey: text(lineage.industryKey) || null,
      inputTaskIds: uniqueTexts(list(lineage.inputTaskIds)),
      inputSubjectIds: uniqueTexts(list(lineage.inputSubjectIds)),
      consumptionKeys: uniqueTexts(list(lineage.consumptionKeys)),
      sourceEvidenceRefs: uniqueTexts(list(lineage.sourceEvidenceRefs)),
    }]
  })
  if (payloadLineages.length > 0) return payloadLineages
  if (event.publicationKey && event.artifactKey && event.assetKey && event.scopeLevel) {
    return [{
      assetKey: event.assetKey,
      publicationKey: event.publicationKey,
      artifactKey: event.artifactKey,
      scopeLevel: event.scopeLevel,
      industryKey: event.industryKey,
      inputTaskIds: event.inputTaskIds,
      inputSubjectIds: event.inputSubjectIds,
      consumptionKeys: [],
      sourceEvidenceRefs: [],
    }]
  }
  return []
}

function unlinkedWbsCandidateEvent(
  event: DurationLearningRuntimeEvidenceOutboxEvent,
  reason: string,
) {
  const payload = record(event.payload)
  const subjectIds = candidateOwnedSubjectIds(event)
  const subjectId = subjectIds.includes(event.subjectId) ? event.subjectId : subjectIds[0] ?? event.subjectId
  return {
    ...event,
    subjectId,
    assetKey: null,
    publicationKey: null,
    artifactKey: null,
    scopeLevel: null,
    industryKey: null,
    inputSubjectIds: subjectIds,
    inputTaskIds: [],
    payload: {
      ...payload,
      generatedEntityIds: subjectIds,
      materializationSubjectType: event.subjectType,
      materializationSubjectId: subjectId,
      aggregationMode: 'once',
      authoritativeRuntimeLineage: null,
      authoritativeRuntimeLineages: [],
      lineageResolution: reason,
    },
  } satisfies DurationLearningRuntimeEvidenceOutboxEvent
}

async function readTrustedWbsConsumptionRows(input: {
  event: DurationLearningRuntimeEvidenceOutboxEvent
  queryExec: DurationLearningRuntimePublicationQueryExec
  lineages: readonly WbsCandidateLineage[]
}) {
  const payload = record(input.event.payload)
  const generationBatchId = text(payload.generationBatchId)
  if (!generationBatchId) return [] as TrustedWbsConsumptionRow[]
  const publicationKeys = uniqueTexts(input.lineages.map((lineage) => lineage.publicationKey))
  if (publicationKeys.length === 0) return [] as TrustedWbsConsumptionRow[]
  const ownedSubjectIds = candidateOwnedSubjectIds(input.event)
  if (ownedSubjectIds.length === 0) return [] as TrustedWbsConsumptionRow[]
  return input.queryExec<TrustedWbsConsumptionRow>(
    `/* duration-learning-runtime-evidence-outbox:trusted-consumption-lineage */
     select consumption.company_id,
            consumption.project_id,
            consumption.consumption_key,
            consumption.publication_key,
            consumption.asset_key,
            consumption.artifact_key,
            consumption.task_id,
            consumption.baseline_item_id,
            consumption.generation_batch_id,
            consumption.source_evidence_refs,
            consumption.consumption_context,
            publication.publication_stage,
            publication.monitoring_status,
            publication.scope_level as publication_scope_level,
            publication.company_id as publication_company_id,
            publication.project_id as publication_project_id,
            publication.industry_key as publication_industry_key
       from public.duration_learning_runtime_consumptions consumption
       join public.duration_learning_runtime_publications publication
         on publication.publication_key = consumption.publication_key
        and publication.asset_key = consumption.asset_key
        and publication.artifact_key = consumption.artifact_key
       join jsonb_to_recordset($7::jsonb) as requested_lineage(
         asset_key text,
         publication_key text,
         artifact_key text,
         scope_level text,
         industry_key text
       )
         on requested_lineage.asset_key = publication.asset_key
        and requested_lineage.publication_key = publication.publication_key
        and requested_lineage.artifact_key = publication.artifact_key
        and requested_lineage.scope_level = publication.scope_level
        and coalesce(requested_lineage.industry_key, '') = coalesce(publication.industry_key, '')
      where consumption.company_id = $1::uuid
        and consumption.project_id = $2::uuid
        and consumption.publication_key = any($3::text[])
        and consumption.generation_batch_id = $4::text
        and consumption.source_evidence_refs ? ('duration_learning_runtime_publications:' || consumption.publication_key)
        and consumption.consumption_context ->> 'authoritySource' = 'runtime_resolver_publication_set'
        and (
          (publication.publication_stage = 'canary' and publication.monitoring_status in ('pending', 'collecting', 'passed'))
          or (publication.publication_stage = 'stable' and publication.monitoring_status = 'passed')
        )
        and (
          (publication.scope_level = 'project'
           and publication.company_id = consumption.company_id
           and publication.project_id = consumption.project_id
           and publication.industry_key is null)
          or (publication.scope_level = 'company'
           and publication.company_id = consumption.company_id
           and publication.project_id is null
           and publication.industry_key is null)
          or (publication.scope_level = 'industry'
           and publication.company_id is null
           and publication.project_id is null
           and publication.industry_key = consumption.consumption_context ->> 'industryKey')
          or (publication.scope_level = 'global'
           and publication.company_id is null
           and publication.project_id is null
           and publication.industry_key is null)
        )
        and (
          ($5::text = 'task' and consumption.task_id = any($6::uuid[]))
          or ($5::text = 'baseline_item' and consumption.baseline_item_id = any($6::uuid[]))
        )
        and (
          (consumption.task_id is not null and consumption.baseline_item_id is null and $5::text = 'task')
          or (consumption.task_id is null and consumption.baseline_item_id is not null and $5::text = 'baseline_item')
        )
      order by consumption.publication_key, consumption.artifact_key,
               consumption.task_id, consumption.baseline_item_id, consumption.consumption_key`,
    [
      input.event.companyId,
      input.event.projectId,
      publicationKeys,
      generationBatchId,
      input.event.subjectType,
      ownedSubjectIds,
      JSON.stringify(input.lineages.map((lineage) => ({
        asset_key: lineage.assetKey,
        publication_key: lineage.publicationKey,
        artifact_key: lineage.artifactKey,
        scope_level: lineage.scopeLevel,
        industry_key: lineage.industryKey,
      }))),
    ],
  )
}

export async function expandWbsCandidateOutboxEventsForTrustedConsumption(input: {
  event: DurationLearningRuntimeEvidenceOutboxEvent
  queryExec: DurationLearningRuntimePublicationQueryExec
}) {
  if (input.event.eventType !== 'wbs_candidate') return [input.event]
  const lineages = wbsCandidateLineages(input.event)
  if (lineages.length === 0) return [unlinkedWbsCandidateEvent(input.event, 'no_runtime_publication_lineage')]
  const rows = await readTrustedWbsConsumptionRows({ ...input, lineages })
  const payload = record(input.event.payload)
  const linkedEvents: DurationLearningRuntimeEvidenceOutboxEvent[] = []
  const ownedSubjectIds = new Set(candidateOwnedSubjectIds(input.event))
  const originalNodes = list(payload.durationCandidateNodes).map(record)
  const originalCounts = {
    generatedRowCount: Number(payload.generatedRowCount ?? ownedSubjectIds.size) || ownedSubjectIds.size,
    retainedRowCount: Number(payload.retainedRowCount ?? ownedSubjectIds.size) || ownedSubjectIds.size,
    rejectedRowCount: Number(payload.rejectedRowCount ?? 0) || 0,
    pendingRowCount: Number(payload.pendingRowCount ?? 0) || 0,
  }
  let aggregationAssigned = false

  for (const lineage of lineages) {
    const matchingRows = rows.filter((row) => (
      text(row.publication_key) === lineage.publicationKey
      && text(row.asset_key) === lineage.assetKey
      && text(row.artifact_key) === lineage.artifactKey
      && text(row.generation_batch_id) === text(payload.generationBatchId)
      && trustedConsumptionRowMatchesContract(row, input.event, lineage)
      && ownedSubjectIds.has(text(input.event.subjectType === 'task' ? row.task_id : row.baseline_item_id))
    ))
    const inputSubjectIds = uniqueTexts(matchingRows.map((row) => (
      input.event.subjectType === 'task' ? row.task_id : row.baseline_item_id
    )))
    if (inputSubjectIds.length === 0) continue
    const inputTaskIds = input.event.subjectType === 'task'
      ? uniqueTexts(matchingRows.map((row) => row.task_id))
      : []
    const subjectId = inputSubjectIds.includes(input.event.subjectId)
      ? input.event.subjectId
      : inputSubjectIds[0]!
    const resolvedLineage = {
      ...lineage,
      inputTaskIds,
      inputSubjectIds,
      consumptionKeys: uniqueTexts(matchingRows.map((row) => row.consumption_key)),
      sourceEvidenceRefs: uniqueTexts(matchingRows.flatMap((row) => list(row.source_evidence_refs))),
    }
    const publicationNodes = originalNodes.filter((node) => (
      text(node.runtimePublicationKey) === lineage.publicationKey
      || (lineages.length === 1 && !text(node.runtimePublicationKey))
    ))
    const eventPayload = {
      ...payload,
      generatedEntityIds: inputSubjectIds,
      materializationSubjectType: input.event.subjectType,
      materializationSubjectId: subjectId,
      generatedRowCount: inputSubjectIds.length,
      retainedRowCount: inputSubjectIds.length,
      rejectedRowCount: 0,
      pendingRowCount: 0,
      durationCandidateNodes: publicationNodes,
      aggregationMode: aggregationAssigned ? 'skip' : 'once',
      ...(!aggregationAssigned ? { aggregationCounts: originalCounts } : {}),
    }
    aggregationAssigned = true
    linkedEvents.push({
      ...input.event,
      subjectId,
      assetKey: lineage.assetKey,
      publicationKey: lineage.publicationKey,
      artifactKey: lineage.artifactKey,
      scopeLevel: lineage.scopeLevel,
      industryKey: lineage.industryKey,
      inputSubjectIds,
      inputTaskIds,
      payload: {
        ...eventPayload,
        authoritativeRuntimeLineage: resolvedLineage,
        authoritativeRuntimeLineages: [resolvedLineage],
        lineageResolution: 'physical_runtime_consumption',
        runtimePublicationInputSubjectType: input.event.subjectType,
        runtimePublicationInputSubjectIds: inputSubjectIds,
        runtimePublicationInputTaskIds: inputTaskIds,
        runtimeConsumptionKeys: resolvedLineage.consumptionKeys,
        runtimeSourceEvidenceRefs: resolvedLineage.sourceEvidenceRefs,
      },
    })
  }

  return linkedEvents.length > 0
    ? linkedEvents
    : [unlinkedWbsCandidateEvent(
        input.event,
        text(payload.generationBatchId) ? 'no_trusted_consumption' : 'missing_generation_batch_id',
      )]
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
  const generationBatchId = text(input.generationBatchId)
  if (!generationBatchId) return []
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
      generationBatchId,
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
      const lineage: WbsCandidateLineage = {
        assetKey: publication.assetKey,
        publicationKey: text(publication.publicationKey),
        artifactKey,
        scopeLevel,
        industryKey,
        inputTaskIds: [],
        inputSubjectIds: [],
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
    inputSubjectIds: generatedEntityIds.length > 0 ? generatedEntityIds : [input.subjectId],
    inputTaskIds: [],
    payload: {
      ...input.candidate,
      companyId: input.companyId,
      projectId: input.projectId,
      generatedEntityIds,
      materializationSubjectType: input.subjectType,
      materializationSubjectId: input.subjectId,
      authoritativeRuntimeLineage,
      authoritativeRuntimeLineages: canonicalLineages,
      lineageResolution: canonicalLineages.length > 0
        ? 'pending_physical_consumption_resolution'
        : 'no_runtime_publication_lineage',
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

function runtimeEvidenceAuthorityParams(event: ReturnType<typeof mapOutboxRow>) {
  return [
    event.eventType,
    event.companyId,
    event.projectId,
    event.subjectType,
    event.subjectId,
    event.assetKey,
    event.publicationKey,
    event.artifactKey,
    event.scopeLevel,
    event.industryKey,
    JSON.stringify(event.inputSubjectIds),
    JSON.stringify(event.inputTaskIds),
    JSON.stringify(event.payload),
  ]
}

async function runtimeEvidenceDatabaseAuthorityMatches(
  event: ReturnType<typeof mapOutboxRow>,
  queryExec: DurationLearningRuntimePublicationQueryExec,
) {
  const authorityRows = await queryExec<{ authorized?: unknown }>(
    `/* duration-learning-runtime-evidence-outbox:authority */
     select public.duration_learning_runtime_evidence_outbox_row_is_authorized(
       $1::text, $2::uuid, $3::uuid, $4::text, $5::uuid,
       $6::text, $7::text, $8::text, $9::text, $10::text,
       $11::jsonb, $12::jsonb, $13::jsonb
     ) as authorized`,
    runtimeEvidenceAuthorityParams(event),
  )
  return authorityRows.length === 1 && authorityRows[0]?.authorized === true
}

async function assertClaimedEventAuthority(
  event: ReturnType<typeof mapOutboxRow>,
  queryExec: DurationLearningRuntimePublicationQueryExec,
) {
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
    if (
      event.subjectType !== 'task'
      || text(payload.taskId) !== event.subjectId
      || !text(payload.generationBatchId ?? payload.generation_batch_id)
      || !exact
    ) {
      throw new Error('duration_learning_runtime_prediction_claim_lineage_mismatch')
    }
  } else if (event.eventType === 'wbs_candidate') {
    const generatedEntityIds = uniqueTexts(list(payload.generatedEntityIds))
    const linked = Boolean(event.assetKey || event.publicationKey || event.artifactKey || event.scopeLevel || event.industryKey)
    if (
      generatedEntityIds.length !== event.inputSubjectIds.length
      || generatedEntityIds.some((subjectId, index) => subjectId !== event.inputSubjectIds[index])
      || (event.subjectType === 'baseline_item' && event.inputTaskIds.length > 0)
      || (!linked && (
        event.inputTaskIds.length > 0
        || !UNLINKED_WBS_LINEAGE_REASONS.has(text(payload.lineageResolution))
        || Object.keys(record(payload.authoritativeRuntimeLineage)).length > 0
        || list(payload.authoritativeRuntimeLineages).length > 0
      ))
      || (linked && (
        event.assetKey !== 'special_work_duration_seed'
        || !event.publicationKey
        || !event.artifactKey
        || !event.scopeLevel
        || !text(payload.generationBatchId ?? payload.generation_batch_id)
        || text(payload.lineageResolution) !== 'physical_runtime_consumption'
        || uniqueTexts(list(payload.runtimeConsumptionKeys)).length === 0
        || !uniqueTexts(list(payload.runtimeSourceEvidenceRefs))
          .includes(`duration_learning_runtime_publications:${event.publicationKey}`)
        || (event.subjectType === 'task' && !exactTextSet(event.inputTaskIds, event.inputSubjectIds))
      ))
    ) {
      throw new Error('duration_learning_runtime_wbs_candidate_claim_lineage_mismatch')
    }
  }
  if (!await runtimeEvidenceDatabaseAuthorityMatches(event, queryExec)) {
    throw new Error('duration_learning_runtime_evidence_claim_database_authority_mismatch')
  }
}

async function cancelClaimedRuntimeEvidenceEvent(input: {
  queryExec: DurationLearningRuntimePublicationQueryExec
  eventKey: string
  ownerId: string
  now: string
  reason: string
}) {
  return input.queryExec<{ event_key?: unknown }>(
    `/* duration-learning-runtime-evidence-outbox:cancel-claimed */
     update public.duration_learning_runtime_evidence_outbox outbox
        set processing_status = 'cancelled',
            cancellation_reason = $4,
            cancelled_at = $3::timestamptz,
            lease_owner = null,
            lease_expires_at = null,
            cancellation_scope_snapshot = jsonb_build_object(
              'eventKey', outbox.event_key,
              'companyId', outbox.company_id::text,
              'projectId', outbox.project_id::text,
              'subjectType', outbox.subject_type,
              'subjectId', outbox.subject_id::text,
              'assetKey', outbox.asset_key,
              'publicationKey', outbox.publication_key,
              'artifactKey', outbox.artifact_key,
              'scopeLevel', outbox.scope_level,
              'industryKey', outbox.industry_key,
              'inputSubjectIds', outbox.input_subject_ids,
              'inputTaskIds', outbox.input_task_ids,
              'generationBatchId', coalesce(
                outbox.payload ->> 'generationBatchId',
                outbox.payload ->> 'generation_batch_id'
              ),
              'payload', outbox.payload,
              'reason', $4,
              'cancelledAt', $3::timestamptz::text
            ),
            last_error = $4,
            updated_at = $3::timestamptz
      where outbox.event_key = $1
        and outbox.processing_status = 'processing'
        and outbox.lease_owner = $2
     returning outbox.event_key`,
    [input.eventKey, input.ownerId, input.now, input.reason],
  )
}

export async function processDurationLearningRuntimeEvidenceOutbox(
  input: ProcessEvidenceOutboxInput,
): Promise<ProcessDurationLearningRuntimeEvidenceOutboxResult> {
  const ownerId = text(input.ownerId)
  if (!ownerId) throw new Error('duration_learning_runtime_evidence_outbox_owner_required')
  const now = input.now ?? new Date().toISOString()
  const limit = Math.max(1, Math.min(100, Math.trunc(Number(input.limit) || 50)))
  await input.queryExec<{ event_key?: unknown }>(
    `/* duration-learning-runtime-evidence-outbox:quarantine-unsafe */
     update public.duration_learning_runtime_evidence_outbox outbox
        set processing_status = 'cancelled',
            cancellation_reason = 'runtime_authority_invalidated',
            cancelled_at = $1::timestamptz,
            lease_owner = null,
            lease_expires_at = null,
            cancellation_scope_snapshot = jsonb_build_object(
              'eventKey', outbox.event_key,
              'companyId', outbox.company_id::text,
              'projectId', outbox.project_id::text,
              'subjectType', outbox.subject_type,
              'subjectId', outbox.subject_id::text,
              'assetKey', outbox.asset_key,
              'publicationKey', outbox.publication_key,
              'artifactKey', outbox.artifact_key,
              'scopeLevel', outbox.scope_level,
              'industryKey', outbox.industry_key,
              'inputSubjectIds', outbox.input_subject_ids,
              'inputTaskIds', outbox.input_task_ids,
              'generationBatchId', coalesce(
                outbox.payload ->> 'generationBatchId',
                outbox.payload ->> 'generation_batch_id'
              ),
              'payload', outbox.payload,
              'reason', 'runtime_authority_invalidated',
              'cancelledAt', $1::timestamptz::text
            ),
            updated_at = $1::timestamptz
      where (
        (outbox.processing_status in ('pending', 'failed') and outbox.next_attempt_at <= $1::timestamptz)
        or (outbox.processing_status = 'processing' and outbox.lease_expires_at <= $1::timestamptz)
      )
        and not public.duration_learning_runtime_evidence_outbox_row_is_authorized(
          outbox.event_type,
          outbox.company_id,
          outbox.project_id,
          outbox.subject_type,
          outbox.subject_id,
          outbox.asset_key,
          outbox.publication_key,
          outbox.artifact_key,
          outbox.scope_level,
          outbox.industry_key,
          outbox.input_subject_ids,
          outbox.input_task_ids,
          outbox.payload
        )
     returning outbox.event_key`,
    [now],
  )
  const claimedRows = await input.queryExec<EvidenceOutboxRow>(
    `/* duration-learning-runtime-evidence-outbox:claim */
     with selected as (
       select outbox.event_key
         from public.duration_learning_runtime_evidence_outbox outbox
        where (
          (outbox.processing_status in ('pending', 'failed') and outbox.next_attempt_at <= $1::timestamptz)
          or (outbox.processing_status = 'processing' and outbox.lease_expires_at <= $1::timestamptz)
        )
          and public.duration_learning_runtime_evidence_outbox_row_is_authorized(
            outbox.event_type,
            outbox.company_id,
            outbox.project_id,
            outbox.subject_type,
            outbox.subject_id,
            outbox.asset_key,
            outbox.publication_key,
            outbox.artifact_key,
            outbox.scope_level,
            outbox.industry_key,
            outbox.input_subject_ids,
            outbox.input_task_ids,
            outbox.payload
          )
        order by outbox.attempt_count asc, outbox.created_at asc, outbox.event_key asc
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
        await assertClaimedEventAuthority(event, input.queryExec)
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
                   inputSubjectIds: event.inputSubjectIds,
                   consumptionKeys: uniqueTexts(list(event.payload.runtimeConsumptionKeys)),
                   sourceEvidenceRefs: uniqueTexts(list(event.payload.runtimeSourceEvidenceRefs)),
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
           update public.duration_learning_runtime_evidence_outbox outbox
              set processing_status = 'completed',
                  lease_owner = null,
                  lease_expires_at = null,
                  completed_at = $3::timestamptz,
                  updated_at = $3::timestamptz
            where outbox.event_key = $1
              and outbox.processing_status = 'processing'
              and outbox.lease_owner = $2
              and public.duration_learning_runtime_evidence_outbox_row_is_authorized(
                outbox.event_type,
                outbox.company_id,
                outbox.project_id,
                outbox.subject_type,
                outbox.subject_id,
                outbox.asset_key,
                outbox.publication_key,
                outbox.artifact_key,
                outbox.scope_level,
                outbox.industry_key,
                outbox.input_subject_ids,
                outbox.input_task_ids,
                outbox.payload
              )
          returning outbox.event_key`,
          [event.eventKey, ownerId, now],
        )
        if (completed.length !== 1) {
          throw new Error('duration_learning_runtime_evidence_outbox_completion_cas_failed')
        }
      })
      result.completed += 1
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      let authorityStillValid = false
      try {
        authorityStillValid = await runtimeEvidenceDatabaseAuthorityMatches(event, input.queryExec)
      } catch {
        authorityStillValid = false
      }
      if (!authorityStillValid) {
        await cancelClaimedRuntimeEvidenceEvent({
          queryExec: input.queryExec,
          eventKey: event.eventKey,
          ownerId,
          now,
          reason: `runtime_authority_invalidated:${errorMessage}`.slice(0, 1000),
        })
      } else {
        await input.queryExec(
          `/* duration-learning-runtime-evidence-outbox:fail */
           update public.duration_learning_runtime_evidence_outbox
              set processing_status = 'failed',
                  lease_owner = null,
                  lease_expires_at = null,
                  next_attempt_at = $3::timestamptz + interval '1 minute',
                  last_error = $4,
                  updated_at = $3::timestamptz
            where event_key = $1
              and processing_status = 'processing'
              and lease_owner = $2`,
          [event.eventKey, ownerId, now, errorMessage],
        )
      }
      result.failed += 1
      result.failureKeys.push(event.eventKey)
    }
  }
  return result
}

export type DrainDurationLearningRuntimeEvidenceOutboxResult =
  ProcessDurationLearningRuntimeEvidenceOutboxResult & {
    batches: number
    maxBatches: number
    backlogCount: number
    readyBacklogCount: number
    failedBacklogCount: number
    expiredProcessingCount: number
    oldestPendingAt: string | null
    oldestPendingAgeSeconds: number | null
    backlogAgeExceeded: boolean
  }

export async function drainDurationLearningRuntimeEvidenceOutbox(
  input: ProcessEvidenceOutboxInput & { maxBatches?: number; backlogAgeGateMs?: number },
): Promise<DrainDurationLearningRuntimeEvidenceOutboxResult> {
  const maxBatches = Math.max(1, Math.min(20, Math.trunc(Number(input.maxBatches) || 4)))
  const aggregate: DrainDurationLearningRuntimeEvidenceOutboxResult = {
    claimed: 0,
    completed: 0,
    failed: 0,
    failureKeys: [],
    batches: 0,
    maxBatches,
    backlogCount: 0,
    readyBacklogCount: 0,
    failedBacklogCount: 0,
    expiredProcessingCount: 0,
    oldestPendingAt: null,
    oldestPendingAgeSeconds: null,
    backlogAgeExceeded: false,
  }

  for (let batch = 0; batch < maxBatches; batch += 1) {
    const result = await processDurationLearningRuntimeEvidenceOutbox(input)
    aggregate.batches += 1
    aggregate.claimed += result.claimed
    aggregate.completed += result.completed
    aggregate.failed += result.failed
    aggregate.failureKeys.push(...result.failureKeys)
    // A failed row receives backoff in processDurationLearningRuntimeEvidenceOutbox.
    // Continue the bounded drain so one transient failure cannot starve later events.
    if (result.claimed === 0) break
  }

  const backlogRows = await input.queryExec<{
    pending_count?: unknown
    ready_pending_count?: unknown
    failed_count?: unknown
    expired_processing_count?: unknown
    oldest_pending_at?: unknown
  }>(
    `/* duration-learning-runtime-evidence-outbox:backlog */
     select count(*) filter (where processing_status in ('pending', 'failed'))::integer as pending_count,
            count(*) filter (
              where processing_status in ('pending', 'failed')
                and next_attempt_at <= $1::timestamptz
            )::integer as ready_pending_count,
            count(*) filter (where processing_status = 'failed')::integer as failed_count,
            count(*) filter (
              where processing_status = 'processing'
                and lease_expires_at <= $1::timestamptz
            )::integer as expired_processing_count,
            min(created_at) filter (where processing_status in ('pending', 'failed')) as oldest_pending_at
       from public.duration_learning_runtime_evidence_outbox
      where processing_status in ('pending', 'failed')
         or (processing_status = 'processing' and lease_expires_at <= $1::timestamptz)`,
    [input.now ?? new Date().toISOString()],
  )
  aggregate.backlogCount = Number(backlogRows[0]?.pending_count ?? 0)
  aggregate.readyBacklogCount = Number(backlogRows[0]?.ready_pending_count ?? 0)
  aggregate.failedBacklogCount = Number(backlogRows[0]?.failed_count ?? 0)
  aggregate.expiredProcessingCount = Number(backlogRows[0]?.expired_processing_count ?? 0)
  aggregate.oldestPendingAt = text(backlogRows[0]?.oldest_pending_at) || null
  if (aggregate.oldestPendingAt) {
    const oldestMs = Date.parse(aggregate.oldestPendingAt)
    const nowMs = Date.parse(input.now ?? new Date().toISOString())
    if (Number.isFinite(oldestMs) && Number.isFinite(nowMs) && nowMs >= oldestMs) {
      aggregate.oldestPendingAgeSeconds = Math.floor((nowMs - oldestMs) / 1000)
      const backlogAgeGateMs = Math.max(
        0,
        Number(input.backlogAgeGateMs ?? 60 * 60 * 1_000),
      )
      aggregate.backlogAgeExceeded = nowMs - oldestMs > backlogAgeGateMs
    }
  }
  return aggregate
}
