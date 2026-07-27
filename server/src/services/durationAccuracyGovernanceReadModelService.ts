import { query as databaseQuery } from '../database.js'

export type DurationAccuracyGovernanceReadQueryExec = <T = Record<string, unknown>>(
  sql: string,
  params?: unknown[],
) => Promise<T[]>

type DurationAccuracyGovernanceRawQuery = (
  sql: string,
  params?: unknown[],
) => Promise<{ rows?: unknown[] | null }>

export function createDurationAccuracyGovernanceReadQueryExec(
  rawQuery: DurationAccuracyGovernanceRawQuery = databaseQuery,
): DurationAccuracyGovernanceReadQueryExec {
  return async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => {
    const result = await rawQuery(sql, params)
    return (result.rows ?? []) as T[]
  }
}

const executeDurationAccuracyGovernanceReadQuery = createDurationAccuracyGovernanceReadQueryExec()

type SourceKey = 'samples' | 'publications' | 'runtimeCalls' | 'observations'
type SourceStatus = 'available' | 'unavailable'

export interface DurationAccuracyGovernanceReadModel {
  source: 'duration_accuracy_governance_read_model'
  generatedAt: string
  scope: {
    companyId: string
    projectId: string | null
    projectIds: string[]
  }
  samples: Array<{
    id: string
    projectId: string
    engineCode: string
    outputKind: string
    predictionBasis: string
    modelVersion: string
    predictedDurationDays: number | null
    actualDurationDays: number | null
    signedErrorDays: number | null
    backtestStatus: string
    backtestedAt: string | null
  }>
  publications: Array<{
    publicationKey: string
    assetKey: string
    scopeLevel: string
    companyId: string | null
    projectId: string | null
    publicationStage: string
    trafficPercent: number
    monitoringStatus: string
    publishedAt: string | null
  }>
  runtimeCalls: Array<{
    id: string
    consumerKey: string
    runtimeEntryRef: string
    callStatus: string
    calledAt: string | null
  }>
  observations: Array<{
    id: string
    assetKey: string
    publicationKey: string
    consumerKey: string
    consumerSurface: string
    observationStatus: string
    observedAt: string | null
  }>
  sourceStatus: Record<SourceKey, SourceStatus>
  sourceErrors: Partial<Record<SourceKey, string>>
}

type ReadModelInput = {
  companyId: string
  projectId?: string | null
  projectIds: string[]
  limit?: number
  now?: string
  queryExec?: DurationAccuracyGovernanceReadQueryExec
}

function text(value: unknown) {
  return String(value ?? '').trim()
}

function nullableText(value: unknown) {
  return text(value) || null
}

function nullableDateTime(value: unknown) {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString()
  return nullableText(value)
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function nullableNumber(value: unknown) {
  if (value === null || value === undefined || value === '') return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function uniqueText(values: readonly unknown[]) {
  return Array.from(new Set(values.map(text).filter(Boolean)))
}

function matchesScopedContext(
  value: unknown,
  companyId: string,
  visibleProjectIds: ReadonlySet<string>,
) {
  const context = record(value)
  if (!context) return false
  const companyIds = uniqueText([context.companyId, context.company_id])
  const projectIds = uniqueText([context.projectId, context.project_id])
  if (companyIds.length > 1 || projectIds.length > 1) return false
  const scopedCompanyId = companyIds[0] ?? null
  const scopedProjectId = projectIds[0] ?? null
  if (scopedProjectId) {
    return visibleProjectIds.has(scopedProjectId)
      && (!scopedCompanyId || scopedCompanyId === companyId)
  }
  return scopedCompanyId === companyId
}

function matchesPublicationScope(
  row: Record<string, unknown>,
  companyId: string,
  visibleProjectIds: ReadonlySet<string>,
) {
  const scopeLevel = text(row.scope_level)
  const scopedCompanyId = nullableText(row.company_id)
  const scopedProjectId = nullableText(row.project_id)
  if (scopeLevel === 'project') {
    return scopedCompanyId === companyId
      && Boolean(scopedProjectId && visibleProjectIds.has(scopedProjectId))
  }
  if (scopeLevel === 'company') return scopedCompanyId === companyId && !scopedProjectId
  if (scopeLevel === 'global') return !scopedCompanyId && !scopedProjectId
  return false
}

function readLimit(value: unknown) {
  const number = Number(value)
  return Number.isFinite(number) ? Math.max(1, Math.min(100, Math.trunc(number))) : 25
}

async function loadSource<T>(
  key: SourceKey,
  load: () => Promise<T[]>,
): Promise<{ key: SourceKey; rows: T[]; status: SourceStatus; error?: string }> {
  try {
    return { key, rows: await load(), status: 'available' }
  } catch {
    return {
      key,
      rows: [],
      status: 'unavailable',
      error: `duration_accuracy_${key.replace(/[A-Z]/g, (character) => `_${character.toLowerCase()}`)}_unavailable`,
    }
  }
}

export async function getDurationAccuracyGovernanceReadModel(
  input: ReadModelInput,
): Promise<DurationAccuracyGovernanceReadModel> {
  const companyId = text(input.companyId)
  const visibleProjectIds = uniqueText(input.projectIds)
  const projectId = nullableText(input.projectId)
  const scopedProjectIds = projectId
    ? visibleProjectIds.includes(projectId) ? [projectId] : []
    : visibleProjectIds
  const scopedProjectIdSet = new Set(scopedProjectIds)
  const limit = readLimit(input.limit)
  const queryExec = input.queryExec ?? executeDurationAccuracyGovernanceReadQuery
  const generatedAt = input.now ?? new Date().toISOString()

  const emptyResult = (): DurationAccuracyGovernanceReadModel => ({
    source: 'duration_accuracy_governance_read_model',
    generatedAt,
    scope: { companyId, projectId, projectIds: scopedProjectIds },
    samples: [],
    publications: [],
    runtimeCalls: [],
    observations: [],
    sourceStatus: {
      samples: 'available',
      publications: 'available',
      runtimeCalls: 'available',
      observations: 'available',
    },
    sourceErrors: {},
  })

  if (!companyId || scopedProjectIds.length === 0) return emptyResult()

  const [samplesResult, publicationsResult, callsResult, observationsResult] = await Promise.all([
    // workspace-isolation-capability-read-approved: company-admin route supplies the visible-project allow-list; SQL and the response mapper both bind every accuracy sample to that set.
    loadSource('samples', () => queryExec<Record<string, unknown>>(
      `SELECT id, project_id, engine_code, output_kind, prediction_basis, model_version,
              predicted_duration_days, actual_duration_days, signed_error_days,
              backtest_status, backtested_at
         FROM public.duration_algorithm_accuracy_events
        WHERE project_id = ANY($1::uuid[])
        ORDER BY COALESCE(backtested_at, updated_at) DESC
        LIMIT $2`,
      [scopedProjectIds, limit],
    )),
    // workspace-isolation-capability-read-approved: company/project publications are bound to the authenticated company and visible projects; only tenant-free global rows are additionally readable.
    loadSource('publications', () => queryExec<Record<string, unknown>>(
      `SELECT publication_key, asset_key, scope_level, company_id, project_id,
              publication_stage, traffic_percent, monitoring_status, published_at
         FROM public.duration_learning_runtime_publications
        WHERE (
          (scope_level = 'project' AND company_id = $1::uuid AND project_id = ANY($2::uuid[]))
          OR (scope_level = 'company' AND company_id = $1::uuid AND project_id IS NULL)
          OR (scope_level = 'global' AND company_id IS NULL AND project_id IS NULL)
        )
        ORDER BY published_at DESC
        LIMIT $3`,
      [companyId, scopedProjectIds, limit],
    )),
    // workspace-isolation-capability-read-approved: backend-only runtime calls are selected by current company or visible project context and pass a second fail-closed context check before response mapping.
    loadSource('runtimeCalls', () => queryExec<Record<string, unknown>>(
      `SELECT id, consumer_key, runtime_entry_ref, call_status, call_context, called_at
         FROM public.runtime_consumer_runtime_calls
        WHERE (
          (
            (
              NULLIF(call_context ->> 'projectId', '') = ANY($2::text[])
              OR NULLIF(call_context ->> 'project_id', '') = ANY($2::text[])
            )
            AND (
              (NULLIF(call_context ->> 'companyId', '') IS NULL AND NULLIF(call_context ->> 'company_id', '') IS NULL)
              OR NULLIF(call_context ->> 'companyId', '') = $1::text
              OR NULLIF(call_context ->> 'company_id', '') = $1::text
            )
          )
          OR (
            NULLIF(call_context ->> 'projectId', '') IS NULL
            AND NULLIF(call_context ->> 'project_id', '') IS NULL
            AND (
              NULLIF(call_context ->> 'companyId', '') = $1::text
              OR NULLIF(call_context ->> 'company_id', '') = $1::text
            )
          )
        )
        ORDER BY called_at DESC
        LIMIT $3`,
      [companyId, scopedProjectIds, limit],
    )),
    // workspace-isolation-capability-read-approved: backend-only observations are selected by current company or visible project context and pass a second fail-closed context check before response mapping.
    loadSource('observations', () => queryExec<Record<string, unknown>>(
      `SELECT observation.id, observation.asset_key, observation.publication_key,
              observation.consumer_key, observation.consumer_surface,
              observation.observation_status, observation.observation_context,
              observation.observed_at
         FROM public.runtime_consumer_observations observation
        WHERE (
          (
            (
              NULLIF(observation.observation_context ->> 'projectId', '') = ANY($2::text[])
              OR NULLIF(observation.observation_context ->> 'project_id', '') = ANY($2::text[])
            )
            AND (
              (NULLIF(observation.observation_context ->> 'companyId', '') IS NULL AND NULLIF(observation.observation_context ->> 'company_id', '') IS NULL)
              OR NULLIF(observation.observation_context ->> 'companyId', '') = $1::text
              OR NULLIF(observation.observation_context ->> 'company_id', '') = $1::text
            )
          )
          OR (
            NULLIF(observation.observation_context ->> 'projectId', '') IS NULL
            AND NULLIF(observation.observation_context ->> 'project_id', '') IS NULL
            AND (
              NULLIF(observation.observation_context ->> 'companyId', '') = $1::text
              OR NULLIF(observation.observation_context ->> 'company_id', '') = $1::text
            )
          )
        )
        ORDER BY observation.observed_at DESC
        LIMIT $3`,
      [companyId, scopedProjectIds, limit],
    )),
  ])

  const results = [samplesResult, publicationsResult, callsResult, observationsResult]
  const sourceStatus = Object.fromEntries(results.map((result) => [result.key, result.status])) as Record<SourceKey, SourceStatus>
  const sourceErrors = Object.fromEntries(
    results.filter((result) => result.error).map((result) => [result.key, result.error]),
  ) as Partial<Record<SourceKey, string>>

  return {
    source: 'duration_accuracy_governance_read_model',
    generatedAt,
    scope: { companyId, projectId, projectIds: scopedProjectIds },
    samples: samplesResult.rows.filter((row) => scopedProjectIdSet.has(text(row.project_id))).map((row) => ({
      id: text(row.id),
      projectId: text(row.project_id),
      engineCode: text(row.engine_code),
      outputKind: text(row.output_kind),
      predictionBasis: text(row.prediction_basis),
      modelVersion: text(row.model_version),
      predictedDurationDays: nullableNumber(row.predicted_duration_days),
      actualDurationDays: nullableNumber(row.actual_duration_days),
      signedErrorDays: nullableNumber(row.signed_error_days),
      backtestStatus: text(row.backtest_status),
      backtestedAt: nullableDateTime(row.backtested_at),
    })),
    publications: publicationsResult.rows.filter((row) => matchesPublicationScope(
      row,
      companyId,
      scopedProjectIdSet,
    )).map((row) => ({
      publicationKey: text(row.publication_key),
      assetKey: text(row.asset_key),
      scopeLevel: text(row.scope_level),
      companyId: nullableText(row.company_id),
      projectId: nullableText(row.project_id),
      publicationStage: text(row.publication_stage),
      trafficPercent: nullableNumber(row.traffic_percent) ?? 0,
      monitoringStatus: text(row.monitoring_status),
      publishedAt: nullableDateTime(row.published_at),
    })),
    runtimeCalls: callsResult.rows.filter((row) => matchesScopedContext(
      row.call_context,
      companyId,
      scopedProjectIdSet,
    )).map((row) => ({
      id: text(row.id),
      consumerKey: text(row.consumer_key),
      runtimeEntryRef: text(row.runtime_entry_ref),
      callStatus: text(row.call_status),
      calledAt: nullableDateTime(row.called_at),
    })),
    observations: observationsResult.rows.filter((row) => matchesScopedContext(
      row.observation_context,
      companyId,
      scopedProjectIdSet,
    )).map((row) => ({
      id: text(row.id),
      assetKey: text(row.asset_key),
      publicationKey: text(row.publication_key),
      consumerKey: text(row.consumer_key),
      consumerSurface: text(row.consumer_surface),
      observationStatus: text(row.observation_status),
      observedAt: nullableDateTime(row.observed_at),
    })),
    sourceStatus,
    sourceErrors,
  }
}
