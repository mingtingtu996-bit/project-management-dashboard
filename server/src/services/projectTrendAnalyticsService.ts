import { supabase } from './dbService.js'
import {
  getMetricRegistryEntry,
  type MetricGranularity,
  type MetricGroupBy,
  type MetricKey,
} from '../analytics/metricRegistry.js'

const TREND_GRANULARITIES: MetricGranularity[] = ['day', 'week', 'month']
const TREND_GROUP_BY_VALUES: MetricGroupBy[] = ['none', 'building', 'specialty', 'phase', 'region']

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
  active_delay_requests: number | null
  monthly_close_status: string | null
  attention_required: boolean | null
  highest_warning_level: string | null
  shifted_milestone_count: number | null
  critical_path_affected_tasks: number | null
}

type ProjectMetadataRow = {
  id: string
  building_type?: string | null
  structure_type?: string | null
  current_phase?: string | null
}

type ProjectScopeDimensionRow = {
  dimension_key: 'building' | 'specialty' | 'phase' | 'region'
  scope_dimension_label: string | null
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
    case 'active_delay_requests':
      return toNumber(row.active_delay_requests)
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

export async function loadTrendSnapshotRows(options: {
  projectId?: string
  projectIds?: string[]
  from: string
  to: string
}): Promise<TrendSnapshotRow[]> {
  if (options.projectIds && options.projectIds.length === 0) {
    return []
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
      active_delay_requests,
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
    throw new Error(`读取 project_daily_snapshot 失败: ${error.message}`)
  }

  return (data ?? []) as TrendSnapshotRow[]
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
  const { data, error } = await supabase
    .from('project_scope_dimensions')
    .select('dimension_key, scope_dimension_label')
    .eq('project_id', projectId)

  if (error) {
    throw new Error(`读取项目维度绑定失败: ${error.message}`)
  }

  const labels = new Map<MetricGroupBy, string[]>()
  for (const key of TREND_GROUP_BY_VALUES) {
    labels.set(key, [])
  }

  for (const row of (data ?? []) as ProjectScopeDimensionRow[]) {
    const key = normalizeText(row.dimension_key) as MetricGroupBy
    if (!labels.has(key)) {
      continue
    }

    const current = labels.get(key) ?? []
    current.push(normalizeText(row.scope_dimension_label))
    labels.set(key, current)
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

  const aggregates = aggregateTrendRows(rows, metric, granularity)
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
    projectIds?: string[] | null
  } = {},
): Promise<CompanyTrendResponse> {
  const entry = getMetricRegistryEntry(metric)
  const dateRange = resolveTrendDateRange(options.from, options.to)
  const granularity = options.granularity ?? entry?.defaultGranularity ?? 'day'

  const rows = await loadTrendSnapshotRows({
    from: dateRange.from,
    to: dateRange.to,
    projectIds: options.projectIds ?? undefined,
  })

  const aggregates = aggregateTrendRows(rows, metric, granularity)
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
