import { supabase } from './dbService.js'

export type DurationExperienceSampleRow = {
  id?: string | null
  company_id?: string | null
  project_id?: string | null
  task_id?: string | null
  template_node_id?: string | null
  standard_work_code?: string | null
  standard_work_name?: string | null
  engineering_category_id?: string | null
  wbs_node_type?: string | null
  planned_duration?: number | string | null
  actual_duration?: number | string | null
  duration_day_basis?: string | null
  actual_duration_calendar_days?: number | string | null
  actual_duration_production_days?: number | string | null
  planned_duration_calendar_days?: number | string | null
  planned_duration_production_days?: number | string | null
  construction_calendar_basis?: string | null
  sample_strength?: string | null
  sample_status?: string | null
  confidence_level?: string | null
  confidence_score?: number | string | null
  included_in_benchmark?: boolean | null
  duration_calibration_source?: string | null
  completed_at?: string | Date | null
  created_at?: string | Date | null
  experience_tier?: string | null
  reuse_scope?: string | null
  fact_source?: string | null
  evidence_fingerprint?: string | null
  source_lineage?: Record<string, unknown> | null
  metadata?: Record<string, unknown> | null
}

type DurationExperienceSampleSupabaseLike = {
  from: (table: string) => {
    select: (columns: string) => unknown
  }
}

type DurationExperienceSampleQuery = {
  projectId: string
  companyId?: string
  limit: number
  orderCompletedAt?: 'asc' | 'desc'
}

export type ProgressVelocityProjectSampleQuery = {
  companyId: string
  projectId: string
  limit?: number
}

export type ProgressVelocityCompanySampleQuery = {
  companyId: string
  excludeProjectId?: string | null
  limit?: number
}

export type TemplateDurationGovernanceSampleQuery = {
  limit?: number
  companyId?: string | null
  projectId?: string | null
}

export type ProjectProductivityCalibrationSampleQuery = {
  companyId: string
  projectId: string
  windowStartDate: string
  windowEndDate: string
  limit?: number
}

const DURATION_EXPERIENCE_SAMPLE_COLUMNS = [
  'id',
  'company_id',
  'project_id',
  'task_id',
  'template_node_id',
  'standard_work_code',
  'standard_work_name',
  'engineering_category_id',
  'wbs_node_type',
  'planned_duration',
  'actual_duration',
  'duration_day_basis',
  'actual_duration_calendar_days',
  'actual_duration_production_days',
  'planned_duration_calendar_days',
  'planned_duration_production_days',
  'construction_calendar_basis',
  'sample_strength',
  'sample_status',
  'confidence_level',
  'confidence_score',
  'included_in_benchmark',
  'duration_calibration_source',
  'completed_at',
  'created_at',
  'experience_tier',
  'reuse_scope',
  'fact_source',
  'evidence_fingerprint',
  'source_lineage',
  'metadata',
].join(', ')

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

function normalizeDateText(value: unknown) {
  const text = normalizeText(value)
  return text ? text.slice(0, 10) : ''
}

function hasGovernedProjectSampleIdentity(row: DurationExperienceSampleRow) {
  const sourceLineage = row.source_lineage
  return Boolean(
    normalizeText(row.company_id)
    && normalizeText(row.project_id)
    && normalizeText(row.task_id)
    && normalizeText(row.evidence_fingerprint)
    && sourceLineage
    && typeof sourceLineage === 'object'
    && Object.keys(sourceLineage).length > 0
    && normalizeText(row.experience_tier) === 'T1'
    && normalizeText(row.reuse_scope) === 'project'
    && ['actual_outcome', 'hybrid'].includes(normalizeText(row.fact_source)),
  )
}

function chainCall(target: unknown, method: string, ...args: unknown[]) {
  const fn = (target as Record<string, unknown>)?.[method]
  if (typeof fn !== 'function') return target
  return fn.apply(target, args)
}

async function resolveQueryResult(query: unknown): Promise<{ data?: unknown; error?: unknown }> {
  const result = await Promise.resolve(query)
  return result && typeof result === 'object'
    ? result as { data?: unknown; error?: unknown }
    : {}
}

async function loadDurationExperienceSamples(
  supabaseLike: DurationExperienceSampleSupabaseLike,
  query: DurationExperienceSampleQuery,
): Promise<DurationExperienceSampleRow[]> {
  const projectId = normalizeText(query.projectId)
  if (!projectId) return []

  let sampleQuery = supabaseLike
    .from('duration_experience_samples')
    .select(DURATION_EXPERIENCE_SAMPLE_COLUMNS)
  sampleQuery = chainCall(sampleQuery, 'eq', 'project_id', projectId)
  if (normalizeText(query.companyId)) {
    sampleQuery = chainCall(sampleQuery, 'eq', 'company_id', normalizeText(query.companyId))
  }
  sampleQuery = chainCall(sampleQuery, 'eq', 'sample_status', 'active')
  sampleQuery = chainCall(sampleQuery, 'eq', 'included_in_benchmark', true)
  sampleQuery = chainCall(sampleQuery, 'eq', 'duration_day_basis', 'construction_production_day')
  sampleQuery = chainCall(sampleQuery, 'not', 'actual_duration', 'is', null)
  if (query.orderCompletedAt) {
    sampleQuery = chainCall(sampleQuery, 'order', 'completed_at', { ascending: query.orderCompletedAt === 'asc' })
  }
  const limit = Number(query.limit)
  sampleQuery = chainCall(sampleQuery, 'limit', Number.isFinite(limit) ? Math.max(1, Math.floor(limit)) : 1)

  const result = await resolveQueryResult(sampleQuery)
  if (result.error || !Array.isArray(result.data)) return []
  return result.data as DurationExperienceSampleRow[]
}

async function loadTenantScopedProgressVelocitySamples(input: {
  companyId: string
  projectId?: string | null
  excludeProjectId?: string | null
  limit?: number
}) {
  const companyId = normalizeText(input.companyId)
  const projectId = normalizeText(input.projectId)
  if (!companyId || (input.projectId != null && !projectId)) return []

  let sampleQuery = (supabase as DurationExperienceSampleSupabaseLike)
    .from('duration_experience_samples')
    .select(DURATION_EXPERIENCE_SAMPLE_COLUMNS)
  sampleQuery = chainCall(sampleQuery, 'eq', 'company_id', companyId)
  if (projectId) sampleQuery = chainCall(sampleQuery, 'eq', 'project_id', projectId)
  sampleQuery = chainCall(sampleQuery, 'eq', 'sample_status', 'active')
  sampleQuery = chainCall(sampleQuery, 'eq', 'included_in_benchmark', true)
  sampleQuery = chainCall(sampleQuery, 'eq', 'duration_day_basis', 'construction_production_day')
  sampleQuery = chainCall(sampleQuery, 'not', 'actual_duration', 'is', null)
  const requestedLimit = Number(input.limit ?? 200)
  sampleQuery = chainCall(sampleQuery, 'limit', Number.isFinite(requestedLimit) ? Math.max(1, Math.floor(requestedLimit)) : 200)

  const result = await resolveQueryResult(sampleQuery)
  if (result.error || !Array.isArray(result.data)) return []
  const excludedProjectId = normalizeText(input.excludeProjectId)
  return (result.data as DurationExperienceSampleRow[])
    .filter((row) => normalizeText(row.company_id) === companyId)
    .filter((row) => !projectId || normalizeText(row.project_id) === projectId)
    .filter((row) => !excludedProjectId || normalizeText(row.project_id) !== excludedProjectId)
}

export async function loadProgressVelocityProjectDurationExperienceSamples(
  input: ProgressVelocityProjectSampleQuery,
) {
  const companyId = normalizeText(input.companyId)
  const projectId = normalizeText(input.projectId)
  if (!companyId || !projectId) return []
  return loadTenantScopedProgressVelocitySamples({
    companyId,
    projectId,
    limit: input.limit,
  })
}

export async function loadProgressVelocityCompanyDurationExperienceSamples(
  input: ProgressVelocityCompanySampleQuery,
) {
  const companyId = normalizeText(input.companyId)
  if (!companyId) return []
  return loadTenantScopedProgressVelocitySamples({
    companyId,
    excludeProjectId: input.excludeProjectId,
    limit: input.limit,
  })
}

export async function loadTemplateDurationGovernanceSamples(
  input: TemplateDurationGovernanceSampleQuery = {},
) {
  const companyId = normalizeText(input.companyId)
  const projectId = normalizeText(input.projectId)
  const requestedLimit = Number(input.limit ?? 1000)
  const pageSize = Number.isFinite(requestedLimit) ? Math.max(1, Math.floor(requestedLimit)) : 1000
  const rows: DurationExperienceSampleRow[] = []
  const seenIds = new Set<string>()

  for (let from = 0; ; from += pageSize) {
    let sampleQuery = (supabase as DurationExperienceSampleSupabaseLike)
      .from('duration_experience_samples')
      .select(DURATION_EXPERIENCE_SAMPLE_COLUMNS)
    if (companyId) sampleQuery = chainCall(sampleQuery, 'eq', 'company_id', companyId)
    if (projectId) sampleQuery = chainCall(sampleQuery, 'eq', 'project_id', projectId)
    sampleQuery = chainCall(sampleQuery, 'eq', 'sample_status', 'active')
    sampleQuery = chainCall(sampleQuery, 'eq', 'included_in_benchmark', true)
    sampleQuery = chainCall(sampleQuery, 'eq', 'experience_tier', 'T1')
    sampleQuery = chainCall(sampleQuery, 'eq', 'reuse_scope', 'project')
    sampleQuery = chainCall(sampleQuery, 'eq', 'duration_day_basis', 'construction_production_day')
    sampleQuery = chainCall(sampleQuery, 'not', 'actual_duration', 'is', null)
    sampleQuery = chainCall(sampleQuery, 'order', 'company_id', { ascending: true })
    sampleQuery = chainCall(sampleQuery, 'order', 'project_id', { ascending: true })
    sampleQuery = chainCall(sampleQuery, 'order', 'completed_at', { ascending: true })
    sampleQuery = chainCall(sampleQuery, 'order', 'id', { ascending: true })
    sampleQuery = chainCall(sampleQuery, 'range', from, from + pageSize - 1)

    const result = await resolveQueryResult(sampleQuery)
    if (result.error || !Array.isArray(result.data)) return []
    const page = (result.data as DurationExperienceSampleRow[]).filter(hasGovernedProjectSampleIdentity)
    let added = 0
    for (const row of page) {
      const id = normalizeText(row.id)
      if (!id || seenIds.has(id)) continue
      seenIds.add(id)
      rows.push(row)
      added += 1
    }
    if (result.data.length < pageSize || added === 0) break
  }

  return rows
}

export async function loadProjectProductivityCalibrationDurationExperienceSamples(
  input: ProjectProductivityCalibrationSampleQuery,
) {
  const companyId = normalizeText(input.companyId)
  const projectId = normalizeText(input.projectId)
  const windowStartDate = normalizeDateText(input.windowStartDate)
  const windowEndDate = normalizeDateText(input.windowEndDate)
  if (!companyId || !projectId || !windowStartDate || !windowEndDate || windowStartDate > windowEndDate) return []

  let sampleQuery = (supabase as DurationExperienceSampleSupabaseLike)
    .from('duration_experience_samples')
    .select(DURATION_EXPERIENCE_SAMPLE_COLUMNS)
  sampleQuery = chainCall(sampleQuery, 'eq', 'company_id', companyId)
  sampleQuery = chainCall(sampleQuery, 'eq', 'project_id', projectId)
  sampleQuery = chainCall(sampleQuery, 'in', 'sample_status', ['active', 'accepted'])
  sampleQuery = chainCall(sampleQuery, 'eq', 'included_in_benchmark', true)
  sampleQuery = chainCall(sampleQuery, 'eq', 'experience_tier', 'T1')
  sampleQuery = chainCall(sampleQuery, 'eq', 'reuse_scope', 'project')
  sampleQuery = chainCall(sampleQuery, 'eq', 'duration_day_basis', 'construction_production_day')
  sampleQuery = chainCall(sampleQuery, 'not', 'actual_duration', 'is', null)
  sampleQuery = chainCall(sampleQuery, 'order', 'completed_at', { ascending: true })
  const requestedLimit = Number(input.limit ?? 180)
  sampleQuery = chainCall(sampleQuery, 'limit', Number.isFinite(requestedLimit) ? Math.max(1, Math.floor(requestedLimit)) : 180)

  const result = await resolveQueryResult(sampleQuery)
  if (result.error || !Array.isArray(result.data)) return []
  return (result.data as DurationExperienceSampleRow[])
    .filter((row) => normalizeText(row.company_id) === companyId && normalizeText(row.project_id) === projectId)
    .filter(hasGovernedProjectSampleIdentity)
    .filter((row) => {
      const completedDate = normalizeDateText(row.completed_at ?? row.created_at)
      return completedDate >= windowStartDate && completedDate <= windowEndDate
    })
}

export async function loadProjectBaselineCalibrationDurationExperienceSamples(projectId: string) {
  return loadDurationExperienceSamples(supabase as DurationExperienceSampleSupabaseLike, {
    projectId,
    limit: 80,
    orderCompletedAt: 'desc',
  })
}

export async function loadPmRecoveryEligibilityDurationExperienceSamples(projectId: string) {
  return loadDurationExperienceSamples(supabase as DurationExperienceSampleSupabaseLike, {
    projectId,
    limit: 30,
  })
}
