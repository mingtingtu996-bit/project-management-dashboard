import { createHash } from 'node:crypto'

import type {
  GeneratedTemplateRow,
  WbsTemplateGenerationRuntimeArtifactPublication,
} from './wbsTemplateGenerationService.js'
import type {
  DurationLearningRuntimePublicationQueryExec,
} from './durationLearningRuntimePublicationService.js'

type GeneratedDurationLearningAssetKey =
  | 'special_work_duration_seed'
  | 'wbs_reference_days'
  | 'dependency_rule_candidate'
type RuntimeConsumptionSubjectType = 'task' | 'baseline_item'

export interface DurationLearningRuntimeConsumptionRecord {
  consumptionKey: string
  companyId: string
  projectId: string
  publicationKey: string
  assetKey: GeneratedDurationLearningAssetKey
  artifactKey: string
  consumerKey: string
  consumerSurface: string
  taskId: string | null
  baselineItemId: string | null
  generationBatchId: string | null
  templateId: string | null
  durationDayBasis: 'construction_production_day'
  appliedDurationDays: number | null
  sourceEvidenceRefs: string[]
  consumptionContext: Record<string, unknown>
  consumedAt: string
}

export interface BuildGeneratedTemplateRuntimeConsumptionsInput {
  companyId: string
  projectId: string
  consumerKey: string
  consumerSurface: string
  generationBatchId?: string | null
  templateIds?: readonly string[] | null
  rows: readonly GeneratedTemplateRow[]
  runtimeArtifactPublications: readonly WbsTemplateGenerationRuntimeArtifactPublication[]
  subjectType: RuntimeConsumptionSubjectType
  subjectIdByClientRowId: ReadonlyMap<string, string>
  consumedAt?: string
}

type TrustedConsumptionRow = {
  consumption_key?: unknown
  publication_key?: unknown
  asset_key?: unknown
  artifact_key?: unknown
  consumer_key?: unknown
  consumer_surface?: unknown
  duration_day_basis?: unknown
  applied_duration_days?: unknown
  generation_batch_id?: unknown
  template_id?: unknown
  consumed_at?: unknown
}

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function readArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function uniqueText(values: readonly unknown[]) {
  return Array.from(new Set(values.map(normalizeText).filter(Boolean)))
}

function positiveDays(value: unknown) {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? number : null
}

function generatedAssetKey(value: unknown): GeneratedDurationLearningAssetKey | null {
  const assetKey = normalizeText(value)
  return assetKey === 'special_work_duration_seed'
    || assetKey === 'wbs_reference_days'
    || assetKey === 'dependency_rule_candidate'
    ? assetKey
    : null
}

function authorityArtifactKey(publication: WbsTemplateGenerationRuntimeArtifactPublication) {
  const context = readRecord(publication.observationContext)
  return normalizeText(context.artifactKey ?? context.artifact_key ?? context.templateId ?? context.template_id)
}

function authorityKey(assetKey: string, publicationKey: string, artifactKey: string) {
  return `${assetKey}\u0000${publicationKey}\u0000${artifactKey}`
}

function buildConsumptionKey(record: Omit<DurationLearningRuntimeConsumptionRecord, 'consumptionKey'>) {
  return `duration-learning-consumption:${createHash('sha256').update(JSON.stringify({
    companyId: record.companyId,
    projectId: record.projectId,
    publicationKey: record.publicationKey,
    assetKey: record.assetKey,
    artifactKey: record.artifactKey,
    consumerKey: record.consumerKey,
    consumerSurface: record.consumerSurface,
    taskId: record.taskId,
    baselineItemId: record.baselineItemId,
    generationBatchId: record.generationBatchId,
    templateId: record.templateId,
    durationDayBasis: record.durationDayBasis,
    appliedDurationDays: record.appliedDurationDays,
    inputTaskIds: uniqueText(readArray(record.consumptionContext.inputTaskIds)),
  })).digest('hex')}`
}

function authorityMismatch(details: Record<string, unknown>) {
  return Object.assign(new Error('duration learning runtime consumption is not backed by the resolver publication set'), {
    code: 'DURATION_LEARNING_RUNTIME_CONSUMPTION_AUTHORITY_MISMATCH',
    ...details,
  })
}

export function buildGeneratedTemplateRuntimeConsumptions(
  input: BuildGeneratedTemplateRuntimeConsumptionsInput,
): DurationLearningRuntimeConsumptionRecord[] {
  const companyId = normalizeText(input.companyId)
  const projectId = normalizeText(input.projectId)
  const consumerKey = normalizeText(input.consumerKey)
  const consumerSurface = normalizeText(input.consumerSurface)
  if (!companyId || !projectId || !consumerKey || !consumerSurface) {
    throw authorityMismatch({ reason: 'trusted_writer_scope_required' })
  }

  const authorities = new Map<string, WbsTemplateGenerationRuntimeArtifactPublication>()
  for (const publication of input.runtimeArtifactPublications) {
    const assetKey = generatedAssetKey(publication.assetKey)
    const publicationKey = normalizeText(publication.publicationKey)
    const artifactKey = authorityArtifactKey(publication)
    if (!assetKey || !publicationKey || !artifactKey) continue
    authorities.set(authorityKey(assetKey, publicationKey, artifactKey), publication)
  }

  const consumedAt = input.consumedAt ?? new Date().toISOString()
  const templateIds = uniqueText(input.templateIds ?? [])
  const records: DurationLearningRuntimeConsumptionRecord[] = []
  for (const row of input.rows) {
    const metadata = readRecord(readRecord(row.values).standard_task_metadata)
    const durationConsumptions = readArray(metadata.durationLearningConsumptions).map(readRecord)
    const runtimeDependencies = row.predecessorDependencies.filter((dependency) => (
      dependency.source === 'duration_learning_runtime_publication'
    ))
    if (durationConsumptions.length === 0 && runtimeDependencies.length === 0) continue
    const subjectId = normalizeText(input.subjectIdByClientRowId.get(row.clientRowId))
    if (!subjectId) {
      throw authorityMismatch({ reason: 'materialized_subject_required', clientRowId: row.clientRowId })
    }

    const dependencyConsumptions: Record<string, unknown>[] = runtimeDependencies.map((dependency) => {
      const predecessorSubjectId = normalizeText(input.subjectIdByClientRowId.get(dependency.clientRowId))
      if (!predecessorSubjectId) {
        throw authorityMismatch({
          reason: 'materialized_dependency_predecessor_required',
          clientRowId: row.clientRowId,
          predecessorClientRowId: dependency.clientRowId,
        })
      }
      return {
        assetKey: 'dependency_rule_candidate',
        publicationKey: dependency.publicationKey,
        artifactKey: dependency.artifactKey,
        publicationStage: dependency.publicationStage,
        selectionBasis: dependency.selectionBasis,
        durationDayBasis: 'construction_production_day',
        appliedDurationDays: null,
        inputTaskIds: [predecessorSubjectId, subjectId],
      }
    })
    const consumptions: Record<string, unknown>[] = [...durationConsumptions, ...dependencyConsumptions]

    for (const consumption of consumptions) {
      const assetKey = generatedAssetKey(consumption.assetKey)
      const publicationKey = normalizeText(consumption.publicationKey)
      const artifactKey = normalizeText(consumption.artifactKey)
      const durationDayBasis = normalizeText(consumption.durationDayBasis ?? consumption.duration_day_basis)
      if (!assetKey || !publicationKey || !artifactKey || durationDayBasis !== 'construction_production_day') {
        throw authorityMismatch({
          reason: 'consumption_contract_invalid',
          clientRowId: row.clientRowId,
          assetKey,
          publicationKey,
          artifactKey,
          durationDayBasis,
        })
      }
      const authority = authorities.get(authorityKey(assetKey, publicationKey, artifactKey))
      if (!authority) {
        throw authorityMismatch({
          reason: 'resolver_publication_not_found',
          clientRowId: row.clientRowId,
          assetKey,
          publicationKey,
          artifactKey,
        })
      }

      const authorityContext = readRecord(authority.observationContext)
      const inputTaskIds = uniqueText(readArray(consumption.inputTaskIds ?? consumption.input_task_ids))
      const templateId = normalizeText(
        authorityContext.templateId
          ?? authorityContext.template_id
          ?? artifactKey,
      ) || templateIds[0] || null
      const baseRecord: Omit<DurationLearningRuntimeConsumptionRecord, 'consumptionKey'> = {
        companyId,
        projectId,
        publicationKey,
        assetKey,
        artifactKey,
        consumerKey,
        consumerSurface,
        taskId: input.subjectType === 'task' ? subjectId : null,
        baselineItemId: input.subjectType === 'baseline_item' ? subjectId : null,
        generationBatchId: normalizeText(input.generationBatchId) || null,
        templateId,
        durationDayBasis: 'construction_production_day',
        appliedDurationDays: positiveDays(consumption.appliedDurationDays ?? consumption.applied_duration_days),
        sourceEvidenceRefs: uniqueText([
          ...(authority.sourceEvidenceRefs ?? []),
          `duration_learning_runtime_publications:${publicationKey}`,
        ]),
        consumptionContext: {
          clientRowId: row.clientRowId,
          scopeLevel: normalizeText(authorityContext.scopeLevel ?? authorityContext.scope_level) || null,
          industryKey: normalizeText(authorityContext.industryKey ?? authorityContext.industry_key) || null,
          selectionBasis: normalizeText(consumption.selectionBasis ?? consumption.selection_basis) || null,
          publicationStage: normalizeText(consumption.publicationStage ?? consumption.publication_stage) || null,
          templateIds,
          ...(inputTaskIds.length > 0 ? { inputTaskIds } : {}),
          authoritySource: 'runtime_resolver_publication_set',
        },
        consumedAt,
      }
      records.push({
        consumptionKey: buildConsumptionKey(baseRecord),
        ...baseRecord,
      })
    }
  }

  return [...new Map(records.map((record) => [record.consumptionKey, record])).values()]
}

function persistenceRow(record: DurationLearningRuntimeConsumptionRecord) {
  return {
    consumption_key: record.consumptionKey,
    company_id: record.companyId,
    project_id: record.projectId,
    publication_key: record.publicationKey,
    asset_key: record.assetKey,
    artifact_key: record.artifactKey,
    consumer_key: record.consumerKey,
    consumer_surface: record.consumerSurface,
    task_id: record.taskId,
    baseline_item_id: record.baselineItemId,
    generation_batch_id: record.generationBatchId,
    template_id: record.templateId,
    duration_day_basis: record.durationDayBasis,
    applied_duration_days: record.appliedDurationDays,
    source_evidence_refs: record.sourceEvidenceRefs,
    consumption_context: record.consumptionContext,
    consumed_at: record.consumedAt,
  }
}

export async function persistDurationLearningRuntimeConsumptions(input: {
  queryExec: DurationLearningRuntimePublicationQueryExec
  build: BuildGeneratedTemplateRuntimeConsumptionsInput
}) {
  const records = buildGeneratedTemplateRuntimeConsumptions(input.build)
  if (records.length === 0) return { requestedCount: 0, insertedCount: 0, records: [] }
  const rows = await input.queryExec<{ consumption_key?: unknown }>(
    `with requested as materialized (
       select *
         from jsonb_to_recordset($1::jsonb) as row(
           consumption_key text,
           company_id uuid,
           project_id uuid,
           publication_key text,
           asset_key text,
           artifact_key text,
           consumer_key text,
           consumer_surface text,
           task_id uuid,
           baseline_item_id uuid,
           generation_batch_id text,
           template_id text,
           duration_day_basis text,
           applied_duration_days numeric,
           source_evidence_refs jsonb,
           consumption_context jsonb,
           consumed_at timestamptz
         )
     ), validated as materialized (
       select requested.*
         from requested
         join public.duration_learning_runtime_publications publication
           on publication.publication_key = requested.publication_key
          and publication.asset_key = requested.asset_key
          and publication.artifact_key = requested.artifact_key
          and publication.publication_stage in ('canary', 'stable')
        where requested.duration_day_basis = 'construction_production_day'
          and ((requested.task_id is not null)::integer + (requested.baseline_item_id is not null)::integer) = 1
          and (
            publication.scope_level = 'global'
            or (
              publication.scope_level = 'industry'
              and publication.industry_key = requested.consumption_context ->> 'industryKey'
            )
            or (publication.scope_level = 'company' and publication.company_id = requested.company_id)
            or (
              publication.scope_level = 'project'
              and publication.company_id = requested.company_id
              and publication.project_id = requested.project_id
            )
          )
     ), validation as materialized (
       select count(*) = jsonb_array_length($1::jsonb) as valid
         from validated
     ), inserted as (
       insert into public.duration_learning_runtime_consumptions (
         consumption_key,
         company_id,
         project_id,
         publication_key,
         asset_key,
         artifact_key,
         consumer_key,
         consumer_surface,
         task_id,
         baseline_item_id,
         generation_batch_id,
         template_id,
         duration_day_basis,
         applied_duration_days,
         source_evidence_refs,
         consumption_context,
         consumed_at
       )
       select validated.consumption_key,
              validated.company_id,
              validated.project_id,
              validated.publication_key,
              validated.asset_key,
              validated.artifact_key,
              validated.consumer_key,
              validated.consumer_surface,
              validated.task_id,
              validated.baseline_item_id,
              validated.generation_batch_id,
              validated.template_id,
              validated.duration_day_basis,
              validated.applied_duration_days,
              validated.source_evidence_refs,
              validated.consumption_context,
              validated.consumed_at
         from validated
         cross join validation
        where validation.valid
       on conflict (consumption_key) do nothing
       returning consumption_key
     )
     select consumption_key from inserted
     union all
     select '__duration_learning_runtime_consumption_validation_failed__'
       from validation
      where not validation.valid`,
    [JSON.stringify(records.map(persistenceRow))],
  )
  if (rows.some((row) => normalizeText(row.consumption_key) === '__duration_learning_runtime_consumption_validation_failed__')) {
    throw Object.assign(new Error('duration learning runtime consumption failed database authority validation'), {
      code: 'DURATION_LEARNING_RUNTIME_CONSUMPTION_DATABASE_VALIDATION_FAILED',
    })
  }
  return {
    requestedCount: records.length,
    insertedCount: rows.length,
    records,
  }
}

function trustedConsumptionFromRow(row: TrustedConsumptionRow) {
  return {
    consumptionKey: normalizeText(row.consumption_key),
    publicationKey: normalizeText(row.publication_key),
    assetKey: normalizeText(row.asset_key) as GeneratedDurationLearningAssetKey,
    artifactKey: normalizeText(row.artifact_key),
    consumerKey: normalizeText(row.consumer_key),
    consumerSurface: normalizeText(row.consumer_surface),
    durationDayBasis: normalizeText(row.duration_day_basis) as 'construction_production_day',
    appliedDurationDays: positiveDays(row.applied_duration_days),
    generationBatchId: normalizeText(row.generation_batch_id) || null,
    templateId: normalizeText(row.template_id) || null,
    consumedAt: normalizeText(row.consumed_at) || null,
  }
}

export async function readTrustedDurationLearningRuntimeConsumptionsForTask(input: {
  queryExec: DurationLearningRuntimePublicationQueryExec
  companyId: string
  projectId: string
  taskId: string
}) {
  const rows = await input.queryExec<TrustedConsumptionRow>(
    `select consumption_key,
            publication_key,
            asset_key,
            artifact_key,
            consumer_key,
            consumer_surface,
            duration_day_basis,
            applied_duration_days,
            generation_batch_id,
            template_id,
            consumed_at
       from public.duration_learning_runtime_consumptions
      where company_id = $1::uuid
        and project_id = $2::uuid
        and task_id = $3::uuid
      order by consumed_at asc, consumption_key asc`,
    [normalizeText(input.companyId), normalizeText(input.projectId), normalizeText(input.taskId)],
  )
  return rows.map(trustedConsumptionFromRow)
}
