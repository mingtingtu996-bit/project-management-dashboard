import { createHash } from 'node:crypto'

import type {
  GeneratedTemplateRow,
  WbsTemplateGenerationRuntimeArtifactPublication,
} from './wbsTemplateGenerationService.js'
import type {
  DurationLearningRuntimePublicationQueryExec,
} from './durationLearningRuntimePublicationService.js'

type GeneratedDurationLearningAssetKey =
  | 'base_duration_benchmark'
  | 'standard_work_duration_seed'
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
  company_id?: unknown
  project_id?: unknown
  task_id?: unknown
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
  source_evidence_refs?: unknown
  consumption_context?: unknown
  publication_stage?: unknown
  monitoring_status?: unknown
  publication_scope_level?: unknown
  publication_company_id?: unknown
  publication_project_id?: unknown
  publication_industry_key?: unknown
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
  return assetKey === 'base_duration_benchmark'
    || assetKey === 'standard_work_duration_seed'
    || assetKey === 'special_work_duration_seed'
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
  const {
    authoritySource: _authoritySource,
    scopeLevel: _scopeLevel,
    generationBatchId: _generationBatchId,
    inputTaskIds: _inputTaskIds,
    ...callerContext
  } = record.consumptionContext
  return {
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
    duration_day_basis: record.durationDayBasis,
    applied_duration_days: record.appliedDurationDays,
    consumption_context: callerContext,
  }
}

export async function persistDurationLearningRuntimeConsumptions(input: {
  queryExec: DurationLearningRuntimePublicationQueryExec
  build: BuildGeneratedTemplateRuntimeConsumptionsInput
}) {
  const records = buildGeneratedTemplateRuntimeConsumptions(input.build)
  if (records.length === 0) return { requestedCount: 0, insertedCount: 0, records: [] }
  const rows = await input.queryExec<{ consumption_key?: unknown }>(
    `/* duration-learning-runtime-consumption:authoritative-rpc
        insert into public.duration_learning_runtime_consumptions is owned by
        public.persist_duration_learning_runtime_consumptions */
     select consumption_key
       from public.persist_duration_learning_runtime_consumptions($1::jsonb) as writer(consumption_key)`,
    [JSON.stringify(records.map(persistenceRow))],
  )
  const consumptionKeys = uniqueText(rows.map((row) => row.consumption_key))
  if (consumptionKeys.length !== records.length) {
    throw Object.assign(new Error('duration learning runtime consumption RPC did not resolve every requested row'), {
      code: 'DURATION_LEARNING_RUNTIME_CONSUMPTION_DATABASE_VALIDATION_FAILED',
      requestedCount: records.length,
      resolvedCount: consumptionKeys.length,
    })
  }
  return {
    requestedCount: records.length,
    insertedCount: consumptionKeys.length,
    consumptionKeys,
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

function trustedTaskConsumptionMatchesAuthority(
  row: TrustedConsumptionRow,
  input: { companyId: string; projectId: string; taskId: string },
) {
  const companyId = normalizeText(input.companyId)
  const projectId = normalizeText(input.projectId)
  const taskId = normalizeText(input.taskId)
  const publicationKey = normalizeText(row.publication_key)
  const assetKey = normalizeText(row.asset_key)
  const artifactKey = normalizeText(row.artifact_key)
  const publicationStage = normalizeText(row.publication_stage)
  const monitoringStatus = normalizeText(row.monitoring_status)
  const context = readRecord(row.consumption_context)
  const sourceEvidenceRefs = uniqueText(readArray(row.source_evidence_refs))
  const scopeLevel = normalizeText(row.publication_scope_level)
  const scopeMatches = scopeLevel === 'project'
    ? normalizeText(row.publication_company_id) === companyId
      && normalizeText(row.publication_project_id) === projectId
      && !normalizeText(row.publication_industry_key)
    : scopeLevel === 'company'
      ? normalizeText(row.publication_company_id) === companyId
        && !normalizeText(row.publication_project_id)
        && !normalizeText(row.publication_industry_key)
      : scopeLevel === 'industry'
        ? !normalizeText(row.publication_company_id)
          && !normalizeText(row.publication_project_id)
          && Boolean(normalizeText(row.publication_industry_key))
          && normalizeText(row.publication_industry_key) === normalizeText(context.industryKey)
        : scopeLevel === 'global'
          ? !normalizeText(row.publication_company_id)
            && !normalizeText(row.publication_project_id)
            && !normalizeText(row.publication_industry_key)
          : false
  return normalizeText(row.company_id) === companyId
    && normalizeText(row.project_id) === projectId
    && normalizeText(row.task_id) === taskId
    && Boolean(publicationKey && assetKey && artifactKey && normalizeText(row.consumption_key))
    && ((publicationStage === 'canary' && ['pending', 'collecting', 'passed'].includes(monitoringStatus))
      || (publicationStage === 'stable' && monitoringStatus === 'passed'))
    && sourceEvidenceRefs.includes(`duration_learning_runtime_publications:${publicationKey}`)
    && normalizeText(context.authoritySource) === 'runtime_resolver_publication_set'
    && scopeMatches
}

export async function readTrustedDurationLearningRuntimeConsumptionsForTask(input: {
  queryExec: DurationLearningRuntimePublicationQueryExec
  companyId: string
  projectId: string
  taskId: string
}) {
  const rows = await input.queryExec<TrustedConsumptionRow>(
    `select consumption.company_id,
            consumption.project_id,
            consumption.task_id,
            consumption.consumption_key,
            consumption.publication_key,
            consumption.asset_key,
            consumption.artifact_key,
            consumption.consumer_key,
            consumption.consumer_surface,
            consumption.duration_day_basis,
            consumption.applied_duration_days,
            consumption.generation_batch_id,
            consumption.template_id,
            consumption.source_evidence_refs,
            consumption.consumption_context,
            publication.publication_stage,
            publication.monitoring_status,
            publication.scope_level as publication_scope_level,
            publication.company_id as publication_company_id,
            publication.project_id as publication_project_id,
            publication.industry_key as publication_industry_key,
            consumption.consumed_at
       from public.duration_learning_runtime_consumptions consumption
       join public.duration_learning_runtime_publications publication
         on publication.publication_key = consumption.publication_key
        and publication.asset_key = consumption.asset_key
        and publication.artifact_key = consumption.artifact_key
      where consumption.company_id = $1::uuid
        and consumption.project_id = $2::uuid
        and consumption.task_id = $3::uuid
        and (
          (
            publication.publication_stage = 'canary'
            and publication.monitoring_status in ('pending', 'collecting', 'passed')
          )
          or (
            publication.publication_stage = 'stable'
            and publication.monitoring_status = 'passed'
          )
        )
        and consumption.source_evidence_refs ? (
          'duration_learning_runtime_publications:' || consumption.publication_key
        )
        and consumption.consumption_context ->> 'authoritySource'
              = 'runtime_resolver_publication_set'
        and (
          (
            publication.scope_level = 'project'
            and publication.company_id = consumption.company_id
            and publication.project_id = consumption.project_id
            and publication.industry_key is null
          )
          or (
            publication.scope_level = 'company'
            and publication.company_id = consumption.company_id
            and publication.project_id is null
            and publication.industry_key is null
          )
          or (
            publication.scope_level = 'industry'
            and publication.company_id is null
            and publication.project_id is null
            and publication.industry_key = nullif(
              consumption.consumption_context ->> 'industryKey',
              ''
            )
          )
          or (
            publication.scope_level = 'global'
            and publication.company_id is null
            and publication.project_id is null
            and publication.industry_key is null
          )
        )
      order by consumption.consumed_at asc, consumption.consumption_key asc`,
    [normalizeText(input.companyId), normalizeText(input.projectId), normalizeText(input.taskId)],
  )
  return rows
    .filter((row) => trustedTaskConsumptionMatchesAuthority(row, input))
    .map(trustedConsumptionFromRow)
}
