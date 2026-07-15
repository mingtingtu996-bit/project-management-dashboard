import { query as rawQuery } from '../database.js'
import { supabase } from './dbService.js'
import {
  getMetricRegistryEntry,
  type MetricGranularity,
  type MetricGroupBy,
  type MetricKey,
} from './metricRegistryService.js'

const TREND_GRANULARITIES: MetricGranularity[] = ['day', 'week', 'month']
const TREND_GROUP_BY_VALUES: MetricGroupBy[] = [
  'none',
  'building',
  'basement',
  'floor',
  'physical_zone',
  'functional_area',
  'section',
  'specialty',
  'phase',
  'division',
  'subdivision',
  'engineering_object',
  'wbs_node_type',
  'participant_unit',
  'assignee',
  'severity',
]

type TrendSnapshotRow = {
  project_id: string
  snapshot_date: string
  health_score: number | null
  health_status: string | null
  overall_progress: number | null
  task_progress: number | null
  delay_days: number | null
  delay_count: number | null
  active_risk_count: number | null
  pending_condition_count: number | null
  active_obstacle_count: number | null
  active_delayed_tasks: number | null
  monthly_close_status: string | null
  attention_required: boolean | null
  highest_warning_level: string | null
  shifted_milestone_count: number | null
  critical_path_affected_tasks: number | null
}

type MetricValueTrendRow = {
  project_id: string
  snapshot_date: string
  metric_value: number | string | null
  value_text: string | null
}

type ProjectMetadataRow = {
  id: string
  building_type?: string | null
  structure_type?: string | null
  current_phase?: string | null
}

type TrendAggregateBucket = {
  sum: number
  count: number
  projectIds: Set<string>
}

const HEALTH_STATUS_SCORE: Record<string, number> = {
  健康: 100,
  healthy: 100,
  亚健康: 75,
  needs_attention: 75,
  预警: 50,
  warning: 50,
  危险: 0,
  abnormal: 0,
}

const WARNING_LEVEL_SCORE: Record<string, number> = {
  info: 1,
  low: 1,
  warning: 2,
  medium: 2,
  critical: 3,
  high: 3,
  高: 3,
  中: 2,
  低: 1,
}

const MONTHLY_CLOSE_STATUS_SCORE: Record<string, number> = {
  未开始: 0,
  进行中: 1,
  已完成: 2,
  已超期: 3,
  not_started: 0,
  in_progress: 1,
  completed: 2,
  overdue: 3,
}

const PLANNING_ALIGNMENT_STATUS_SCORE: Record<string, number> = {
  aligned: 0,
  temporary_without_baseline: 1,
  needs_realign: 2,
}

const PHASE_LABELS: Record<string, string> = {
  'pre-construction': '前期',
  pre_construction: '前期',
  construction: '施工',
  completion: '验收',
  delivery: '交付',
}

export interface ProjectTrendPoint {
  date: string
  value: number | null
  group?: string | null
}

export interface ProjectTrendResponse {
  projectId: string
  metric: MetricKey
  from: string
  to: string
  groupBy: MetricGroupBy
  granularity: MetricGranularity
  points: ProjectTrendPoint[]
}

export interface CompanyTrendPoint {
  date: string
  value: number | null
  projectCount: number
}

export interface CompanyTrendResponse {
  metric: MetricKey
  from: string
  to: string
  granularity: MetricGranularity
  points: CompanyTrendPoint[]
}

export interface TrendDateRange {
  from: string
  to: string
}

function normalizeText(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }

  return null
}

function isDateKey(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
}

function normalizeDateInput(value: unknown) {
  const normalized = normalizeText(value)
  if (!normalized) {
    return null
  }

  if (!isDateKey(normalized)) {
    throw new Error(`无效日期格式: ${normalized}`)
  }

  return normalized
}

function parseDateKey(value: string) {
  if (!isDateKey(value)) {
    throw new Error(`无效日期格式: ${value}`)
  }

  const [year, month, day] = value.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day))
}

function formatDateKey(date: Date) {
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, '0'),
    String(date.getUTCDate()).padStart(2, '0'),
  ].join('-')
}

function shiftDateKey(dateKey: string, days: number) {
  const next = parseDateKey(dateKey)
  next.setUTCDate(next.getUTCDate() + days)
  return formatDateKey(next)
}

function bucketDate(dateKey: string, granularity: MetricGranularity) {
  if (granularity === 'month') {
    return dateKey.slice(0, 7)
  }

  if (granularity === 'week') {
    const date = parseDateKey(dateKey)
    const dayOfWeek = (date.getUTCDay() + 6) % 7
    date.setUTCDate(date.getUTCDate() - dayOfWeek)
    return formatDateKey(date)
  }

  return dateKey
}

function uniqLabels(values: unknown[]) {
  return Array.from(
    new Set(
      values
        .map((value) => normalizeText(value))
        .filter((value) => Boolean(value)),
    ),
  )
}

function getHealthStatusScore(value: unknown) {
  const normalized = normalizeText(value)
  return HEALTH_STATUS_SCORE[normalized] ?? HEALTH_STATUS_SCORE[normalized.toLowerCase()] ?? null
}

function getWarningLevelScore(value: unknown) {
  const normalized = normalizeText(value)
  return WARNING_LEVEL_SCORE[normalized] ?? WARNING_LEVEL_SCORE[normalized.toLowerCase()] ?? null
}

function getMonthlyCloseStatusScore(value: unknown) {
  const normalized = normalizeText(value)
  return MONTHLY_CLOSE_STATUS_SCORE[normalized] ?? MONTHLY_CLOSE_STATUS_SCORE[normalized.toLowerCase()] ?? null
}

function getMetricValueSnapshotScore(row: MetricValueTrendRow, metric: MetricKey): number | null {
  const numericValue = toNumber(row.metric_value)
  if (numericValue !== null) return numericValue

  if (metric === 'planning_alignment_status') {
    const status = normalizeText(row.value_text).toLowerCase()
    return PLANNING_ALIGNMENT_STATUS_SCORE[status] ?? null
  }

  return null
}

export function normalizeTrendGranularity(value: unknown): MetricGranularity | null {
  const normalized = normalizeText(value).toLowerCase()
  return TREND_GRANULARITIES.includes(normalized as MetricGranularity)
    ? (normalized as MetricGranularity)
    : null
}

export function normalizeTrendGroupBy(value: unknown): MetricGroupBy | null {
  const normalized = normalizeText(value).toLowerCase()
  return TREND_GROUP_BY_VALUES.includes(normalized as MetricGroupBy)
    ? (normalized as MetricGroupBy)
    : null
}

export function resolveTrendDateRange(fromInput: unknown, toInput: unknown, windowDays = 29): TrendDateRange {
  const resolvedTo = normalizeDateInput(toInput) ?? formatDateKey(new Date())

  const resolvedFrom = normalizeDateInput(fromInput) ?? shiftDateKey(resolvedTo, -windowDays)

  if (resolvedFrom > resolvedTo) {
    throw new Error('开始日期不能晚于结束日期')
  }

  return { from: resolvedFrom, to: resolvedTo }
}

export function resolveTrendMetricValue(row: TrendSnapshotRow, metric: MetricKey): number | null {
  switch (metric) {
    case 'health_score':
      return toNumber(row.health_score)
    case 'health_status':
      return getHealthStatusScore(row.health_status)
    case 'overall_progress':
      return toNumber(row.overall_progress)
    case 'task_progress':
      return toNumber(row.task_progress)
    case 'delay_days':
      return toNumber(row.delay_days)
    case 'delay_count':
      return toNumber(row.delay_count)
    case 'active_risk_count':
      return toNumber(row.active_risk_count)
    case 'pending_condition_count':
      return toNumber(row.pending_condition_count)
    case 'active_obstacle_count':
      return toNumber(row.active_obstacle_count)
    case 'active_delayed_tasks':
      return toNumber(row.active_delayed_tasks)
    case 'monthly_close_status':
      return getMonthlyCloseStatusScore(row.monthly_close_status)
    case 'attention_required':
      return row.attention_required === null || row.attention_required === undefined ? null : (row.attention_required ? 1 : 0)
    case 'highest_warning_level':
      return getWarningLevelScore(row.highest_warning_level)
    case 'shifted_milestone_count':
      return toNumber(row.shifted_milestone_count)
    case 'critical_path_affected_tasks':
      return toNumber(row.critical_path_affected_tasks)
    default:
      return null
  }
}

function normalizeSnapshotDate(value: unknown) {
  if (value instanceof Date) {
    return formatDateKey(value)
  }
  const normalized = normalizeText(value)
  return normalized.length >= 10 ? normalized.slice(0, 10) : normalized
}

function normalizeTrendSnapshotRows(rows: TrendSnapshotRow[]) {
  return rows.map((row) => ({
    ...row,
    snapshot_date: normalizeSnapshotDate(row.snapshot_date),
  }))
}

function normalizeMetricValueTrendRows(rows: MetricValueTrendRow[]) {
  return rows.map((row) => ({
    ...row,
    snapshot_date: normalizeSnapshotDate(row.snapshot_date),
  }))
}

async function loadTrendSnapshotRowsDirect(options: {
  projectId?: string
  projectIds?: string[]
  from: string
  to: string
}): Promise<TrendSnapshotRow[]> {
  if (options.projectId) {
    const result = await rawQuery(
      `
        SELECT project_id,
               snapshot_date,
               health_score,
               health_status,
               overall_progress,
               task_progress,
               delay_days,
               delay_count,
               active_risk_count,
               pending_condition_count,
               active_obstacle_count,
               active_delayed_tasks,
               monthly_close_status,
               attention_required,
               highest_warning_level,
               shifted_milestone_count,
               critical_path_affected_tasks
          FROM public.project_daily_snapshot
         WHERE snapshot_date >= $1
           AND snapshot_date <= $2
           AND project_id = $3
         ORDER BY snapshot_date ASC, project_id ASC
      `,
      [options.from, options.to, options.projectId],
    )
    return normalizeTrendSnapshotRows((result.rows ?? []) as TrendSnapshotRow[])
  }

  if (options.projectIds && options.projectIds.length > 0) {
    const result = await rawQuery(
      `
        SELECT project_id,
               snapshot_date,
               health_score,
               health_status,
               overall_progress,
               task_progress,
               delay_days,
               delay_count,
               active_risk_count,
               pending_condition_count,
               active_obstacle_count,
               active_delayed_tasks,
               monthly_close_status,
               attention_required,
               highest_warning_level,
               shifted_milestone_count,
               critical_path_affected_tasks
          FROM public.project_daily_snapshot
         WHERE snapshot_date >= $1
           AND snapshot_date <= $2
           AND project_id = ANY($3::uuid[])
         ORDER BY snapshot_date ASC, project_id ASC
      `,
      [options.from, options.to, options.projectIds],
    )
    return normalizeTrendSnapshotRows((result.rows ?? []) as TrendSnapshotRow[])
  }

  return []
}

export async function loadTrendSnapshotRows(options: {
  projectId?: string
  projectIds?: string[]
  from: string
  to: string
}): Promise<TrendSnapshotRow[]> {
  if (!options.projectId && !options.projectIds) {
    throw new Error('PROJECT_SCOPE_REQUIRED')
  }
  if (options.projectIds && options.projectIds.length === 0) {
    return []
  }

  if (process.env.NODE_ENV !== 'test') {
    try {
      return await loadTrendSnapshotRowsDirect(options)
    } catch (error) {
      console.warn('[projectTrendAnalyticsService] direct snapshot trend read failed, falling back to Supabase REST', {
        projectId: options.projectId,
        projectIds: options.projectIds?.length ?? null,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  let query = supabase
    .from('project_daily_snapshot')
    .select(`
      project_id,
      snapshot_date,
      health_score,
      health_status,
      overall_progress,
      task_progress,
      delay_days,
      delay_count,
      active_risk_count,
      pending_condition_count,
      active_obstacle_count,
      active_delayed_tasks,
      monthly_close_status,
      attention_required,
      highest_warning_level,
      shifted_milestone_count,
      critical_path_affected_tasks
    `)
    .gte('snapshot_date', options.from)
    .lte('snapshot_date', options.to)
    .order('snapshot_date', { ascending: true })
    .order('project_id', { ascending: true })

  if (options.projectId) {
    query = query.eq('project_id', options.projectId)
  }

  if (options.projectIds && options.projectIds.length > 0) {
    query = query.in('project_id', options.projectIds)
  }

  const { data, error } = await query
  if (error) {
    throw new Error(`Failed to read project_daily_snapshot: ${error.message}`)
  }

  return normalizeTrendSnapshotRows((data ?? []) as TrendSnapshotRow[])
}
function aggregateTrendRows(rows: TrendSnapshotRow[], metric: MetricKey, granularity: MetricGranularity) {
  const aggregates = new Map<string, TrendAggregateBucket>()

  for (const row of rows) {
    const value = resolveTrendMetricValue(row, metric)
    if (value === null) {
      continue
    }

    const bucketKey = bucketDate(row.snapshot_date, granularity)
    const current = aggregates.get(bucketKey) ?? {
      sum: 0,
      count: 0,
      projectIds: new Set<string>(),
    }

    current.sum += value
    current.count += 1
    current.projectIds.add(row.project_id)
    aggregates.set(bucketKey, current)
  }

  return aggregates
}

async function loadMetricValueTrendRowsDirect(options: {
  projectId?: string
  projectIds?: string[]
  metric: MetricKey
  from: string
  to: string
}): Promise<MetricValueTrendRow[]> {
  if (options.projectId) {
    const result = await rawQuery(
      `
        SELECT project_id, snapshot_date, metric_value, value_text
          FROM public.metric_value_snapshots
         WHERE metric_key = $1
           AND group_by = 'project'
           AND snapshot_date >= $2
           AND snapshot_date <= $3
           AND project_id = $4
         ORDER BY snapshot_date ASC, project_id ASC
      `,
      [options.metric, options.from, options.to, options.projectId],
    )
    return normalizeMetricValueTrendRows((result.rows ?? []) as MetricValueTrendRow[])
  }

  if (options.projectIds && options.projectIds.length > 0) {
    const result = await rawQuery(
      `
        SELECT project_id, snapshot_date, metric_value, value_text
          FROM public.metric_value_snapshots
         WHERE metric_key = $1
           AND group_by = 'project'
           AND snapshot_date >= $2
           AND snapshot_date <= $3
           AND project_id = ANY($4::uuid[])
         ORDER BY snapshot_date ASC, project_id ASC
      `,
      [options.metric, options.from, options.to, options.projectIds],
    )
    return normalizeMetricValueTrendRows((result.rows ?? []) as MetricValueTrendRow[])
  }

  return []
}

export async function loadMetricValueTrendRows(options: {
  projectId?: string
  projectIds?: string[]
  metric: MetricKey
  from: string
  to: string
}): Promise<MetricValueTrendRow[]> {
  if (!options.projectId && !options.projectIds) {
    throw new Error('PROJECT_SCOPE_REQUIRED')
  }
  if (options.projectIds && options.projectIds.length === 0) {
    return []
  }

  if (process.env.NODE_ENV !== 'test') {
    try {
      return await loadMetricValueTrendRowsDirect(options)
    } catch (error) {
      console.warn('[projectTrendAnalyticsService] direct metric trend read failed, falling back to Supabase REST', {
        metric: options.metric,
        projectId: options.projectId,
        projectIds: options.projectIds?.length ?? null,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  let query = supabase
    .from('metric_value_snapshots')
    .select('project_id, snapshot_date, metric_value, value_text')
    .eq('metric_key', options.metric)
    .eq('group_by', 'project')
    .gte('snapshot_date', options.from)
    .lte('snapshot_date', options.to)
    .order('snapshot_date', { ascending: true })
    .order('project_id', { ascending: true })

  if (options.projectId) {
    query = query.eq('project_id', options.projectId)
  }

  if (options.projectIds && options.projectIds.length > 0) {
    query = query.in('project_id', options.projectIds)
  }

  const { data, error } = await query
  if (error) {
    throw new Error(`Failed to read metric_value_snapshots: ${error.message}`)
  }

  return normalizeMetricValueTrendRows((data ?? []) as MetricValueTrendRow[])
}
function aggregateMetricValueRows(rows: MetricValueTrendRow[], metric: MetricKey, granularity: MetricGranularity) {
  const aggregates = new Map<string, TrendAggregateBucket>()

  for (const row of rows) {
    const value = getMetricValueSnapshotScore(row, metric)
    if (value === null) continue

    const bucketKey = bucketDate(row.snapshot_date, granularity)
    const current = aggregates.get(bucketKey) ?? {
      sum: 0,
      count: 0,
      projectIds: new Set<string>(),
    }

    current.sum += value
    current.count += 1
    current.projectIds.add(row.project_id)
    aggregates.set(bucketKey, current)
  }

  return aggregates
}

function buildTrendPoints(
  aggregates: Map<string, TrendAggregateBucket>,
): Array<{ date: string; value: number | null; projectCount?: number }> {
  return [...aggregates.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([date, bucket]) => ({
      date,
      value: bucket.count > 0 ? Math.round(bucket.sum / bucket.count) : null,
      projectCount: bucket.projectIds.size,
    }))
}

async function loadProjectMetadata(projectId: string): Promise<ProjectMetadataRow | null> {
  if (process.env.NODE_ENV !== 'test') {
    try {
      const result = await rawQuery(
        `
          SELECT id, building_type, structure_type, current_phase
            FROM public.projects
           WHERE id = $1
           LIMIT 1
        `,
        [projectId],
      )
      return (result.rows?.[0] ?? null) as ProjectMetadataRow | null
    } catch (error) {
      console.warn('[projectTrendAnalyticsService] direct project metadata read failed, falling back to Supabase REST', {
        projectId,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  const { data, error } = await supabase
    .from('projects')
    .select('id, building_type, structure_type, current_phase')
    .eq('id', projectId)
    .maybeSingle()

  if (error) {
    throw new Error(`读取项目元数据失败: ${error.message}`)
  }

  return (data ?? null) as ProjectMetadataRow | null
}

async function loadProjectScopeDimensions(projectId: string) {
  const { data: eoData, error: eoError } = await supabase
    .from('engineering_objects')
    .select('object_type, object_name')
    .eq('project_id', projectId)
    .eq('status', 'active')
    .in('object_type', ['phase', 'section', 'building', 'basement', 'floor', 'physical_zone', 'functional_area'])

  if (eoError) {
    throw new Error(`读取项目工程对象失败: ${eoError.message}`)
  }

  const labels = new Map<MetricGroupBy, string[]>()
  for (const key of TREND_GROUP_BY_VALUES) {
    labels.set(key, [])
  }

  const typeToDim: Record<string, string> = {
    phase: 'phase',
    section: 'section',
    building: 'building',
    basement: 'basement',
    floor: 'floor',
    physical_zone: 'physical_zone',
    functional_area: 'functional_area',
  }
  for (const row of eoData ?? []) {
    const dimKey = typeToDim[(row as any).object_type] as MetricGroupBy
    if (dimKey && labels.has(dimKey)) {
      labels.get(dimKey)!.push(normalizeText((row as any).object_name))
    }
  }

  return labels
}

function resolveProjectGroupLabel(
  project: ProjectMetadataRow,
  scopeLabels: Map<MetricGroupBy, string[]>,
  groupBy: MetricGroupBy,
) {
  if (groupBy === 'none') {
    return null
  }

  const labels: string[] = []

  if (groupBy === 'building') {
    labels.push(project.building_type ?? '')
  }

  if (groupBy === 'specialty') {
    labels.push(project.structure_type ?? '')
  }

  if (groupBy === 'phase') {
    const normalizedPhase = normalizeText(project.current_phase).toLowerCase()
    labels.push(PHASE_LABELS[normalizedPhase] ?? normalizeText(project.current_phase))
  }

  labels.push(...(scopeLabels.get(groupBy) ?? []))

  const resolved = uniqLabels(labels)
  return resolved.length > 0 ? resolved.join('、') : '未设置'
}

export async function getProjectTrendAnalytics(
  projectId: string,
  metric: MetricKey,
  options: {
    from?: unknown
    to?: unknown
    groupBy?: MetricGroupBy
    granularity?: MetricGranularity
  } = {},
): Promise<ProjectTrendResponse> {
  const entry = getMetricRegistryEntry(metric)
  const dateRange = resolveTrendDateRange(options.from, options.to)
  const granularity = options.granularity ?? entry?.defaultGranularity ?? 'day'
  const groupBy = options.groupBy ?? 'none'

  const [project, scopeLabels, rows] = await Promise.all([
    loadProjectMetadata(projectId),
    groupBy === 'none' ? Promise.resolve(new Map<MetricGroupBy, string[]>()) : loadProjectScopeDimensions(projectId),
    loadTrendSnapshotRows({ projectId, from: dateRange.from, to: dateRange.to }),
  ])

  if (!project) {
    throw new Error('PROJECT_NOT_FOUND')
  }

  let aggregates = aggregateTrendRows(rows, metric, granularity)
  if (aggregates.size === 0) {
    const metricRows = await loadMetricValueTrendRows({ projectId, metric, from: dateRange.from, to: dateRange.to })
    aggregates = aggregateMetricValueRows(metricRows, metric, granularity)
  }
  const groupLabel = groupBy === 'none' ? null : resolveProjectGroupLabel(project, scopeLabels, groupBy)
  const points = buildTrendPoints(aggregates).map((point) => (
    groupLabel
      ? { date: point.date, value: point.value, group: groupLabel }
      : { date: point.date, value: point.value }
  ))

  return {
    projectId,
    metric,
    from: dateRange.from,
    to: dateRange.to,
    groupBy,
    granularity,
    points,
  }
}

export async function getCompanyTrendAnalytics(
  metric: MetricKey,
  options: {
    from?: unknown
    to?: unknown
    granularity?: MetricGranularity
    projectIds: string[]
  },
): Promise<CompanyTrendResponse> {
  const entry = getMetricRegistryEntry(metric)
  const dateRange = resolveTrendDateRange(options.from, options.to)
  const granularity = options.granularity ?? entry?.defaultGranularity ?? 'day'

  const rows = await loadTrendSnapshotRows({
    from: dateRange.from,
    to: dateRange.to,
    projectIds: options.projectIds,
  })

  let aggregates = aggregateTrendRows(rows, metric, granularity)
  if (aggregates.size === 0) {
    const metricRows = await loadMetricValueTrendRows({
      metric,
      from: dateRange.from,
      to: dateRange.to,
      projectIds: options.projectIds,
    })
    aggregates = aggregateMetricValueRows(metricRows, metric, granularity)
  }
  const points = buildTrendPoints(aggregates).map((point) => ({
    date: point.date,
    value: point.value,
    projectCount: point.projectCount ?? 0,
  }))

  return {
    metric,
    from: dateRange.from,
    to: dateRange.to,
    granularity,
    points,
  }
}
