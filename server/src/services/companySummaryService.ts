import { logger } from '../middleware/logger.js'
import { query as rawQuery } from '../database.js'
import { supabase } from './dbService.js'
import type { ProjectExecutionSummary } from './projectExecutionSummaryService.js'

const COMPANY_HEALTH_HISTORY_PAGE_SIZE = 1000

export type CompanySummaryHealthHistoryPoint = {
  period: string
  value: number | null
}

export type CompanySummaryHealthHistory = {
  thisMonth: number | null
  lastMonth: number | null
  change: number | null
  thisMonthPeriod: string | null
  lastMonthPeriod: string | null
  periods: CompanySummaryHealthHistoryPoint[]
}

export type CompanySummaryStatusCounts = {
  total: number
  inProgress: number
  completed: number
  paused: number
  notStarted: number
}

export type CompanySummaryResponse = {
  projectCount: number
  statusCounts: CompanySummaryStatusCounts
  averageHealth: number
  averageProgress: number
  attentionProjectCount: number
  totalUnreadWarningCount: number
  totalDelayedTaskCount: number
  lowHealthProjectCount: number
  overdueMilestoneProjectCount: number
  healthHistory: CompanySummaryHealthHistory
  ranking: ProjectExecutionSummary[]
}

type HealthHistoryRow = {
  project_id: string | null
  period: string | null
  health_score: number | null
}

type ProjectDailySnapshotHealthRow = {
  project_id: string | null
  snapshot_date: string | null
  health_score: number | null
}

function formatMonthKey(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  return `${year}-${month}`
}

function getPreviousMonthKey(date = new Date()) {
  const previous = new Date(date.getFullYear(), date.getMonth() - 1, 1)
  return formatMonthKey(previous)
}

function monthStart(monthKey: string) {
  return `${monthKey}-01`
}

function nextMonthStart(monthKey: string) {
  const [year, month] = monthKey.split('-').map(Number)
  return monthStart(formatMonthKey(new Date(year, month, 1)))
}

function snapshotDateToMonthKey(value: unknown) {
  const text = String(value ?? '').slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text.slice(0, 7) : null
}

function toFiniteNumber(value: unknown) {
  if (value === null || value === undefined || value === '') return null
  const next = Number(value)
  return Number.isFinite(next) ? next : null
}

function normalizeStatus(value: unknown): string {
  return String(value ?? '').trim().toLowerCase()
}

function average(values: number[]) {
  if (values.length === 0) return null
  // eslint-disable-next-line -- summary-service-aggregation-approved; ssot: service-owned-summary
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length)
}

function isAttentionRequired(summary: ProjectExecutionSummary) {
  return Boolean(
    summary.attentionRequired ||
      Number(summary.businessHealthScore ?? 0) < 60 ||
      (summary.milestoneOverview?.stats?.overdue ?? 0) > 0,
  )
}

function sortRanking(left: ProjectExecutionSummary, right: ProjectExecutionSummary) {
  const leftHealth = Number(left.businessHealthScore ?? 0)
  const rightHealth = Number(right.businessHealthScore ?? 0)
  if (leftHealth !== rightHealth) {
    return leftHealth - rightHealth
  }

  const leftAttention = Number(isAttentionRequired(left))
  const rightAttention = Number(isAttentionRequired(right))
  if (leftAttention !== rightAttention) {
    return rightAttention - leftAttention
  }

  return left.name.localeCompare(right.name, 'zh-Hans-CN')
}

function mapProjectStatusBucket(summary: ProjectExecutionSummary): keyof Omit<CompanySummaryStatusCounts, 'total'> {
  switch (normalizeStatus(summary.statusLabel || summary.status)) {
    case '已完成':
    case 'completed':
      return 'completed'
    case '已暂停':
    case 'paused':
    case 'archived':
      return 'paused'
    case '进行中':
    case 'active':
    case 'in_progress':
      return 'inProgress'
    default:
      return 'notStarted'
  }
}

function buildStatusCounts(ranking: ProjectExecutionSummary[]): CompanySummaryStatusCounts {
  const statusCounts: CompanySummaryStatusCounts = {
    total: ranking.length,
    inProgress: 0,
    completed: 0,
    paused: 0,
    notStarted: 0,
  }

  for (const summary of ranking) {
    statusCounts[mapProjectStatusBucket(summary)] += 1
  }

  return statusCounts
}

function latestMonthlySnapshotRows(rows: ProjectDailySnapshotHealthRow[]) {
  const latestRows = new Map<string, ProjectDailySnapshotHealthRow>()

  for (const row of rows) {
    const period = snapshotDateToMonthKey(row.snapshot_date)
    const projectId = String(row.project_id ?? '').trim()
    if (!period || !projectId) continue

    const key = `${period}::${projectId}`
    const current = latestRows.get(key)
    if (!current || String(row.snapshot_date) > String(current.snapshot_date)) {
      latestRows.set(key, row)
    }
  }

  return [...latestRows.values()]
}

function normalizeProjectIds(projectIds?: string[] | null): string[] | null {
  if (projectIds === undefined || projectIds === null) return null
  return Array.from(new Set(projectIds.map((id) => String(id ?? '').trim()).filter(Boolean)))
}

export async function loadCompanyHealthHistoryRows(
  options: { projectIds: string[]; now?: Date },
) {
  const now = options.now ?? new Date()
  const projectIds = normalizeProjectIds(options.projectIds) ?? []
  if (projectIds.length === 0) {
    return [] as HealthHistoryRow[]
  }

  const thisMonth = formatMonthKey(now)
  const lastMonth = getPreviousMonthKey(now)

  if (process.env.NODE_ENV !== 'test') {
    try {
      const params: unknown[] = [monthStart(lastMonth), nextMonthStart(thisMonth)]
      const projectScope = 'AND project_id = ANY($3::uuid[])'
      params.push(projectIds)
      const result = await rawQuery(
        `SELECT project_id, snapshot_date, health_score
           FROM project_daily_snapshot
          WHERE snapshot_date >= $1
            AND snapshot_date < $2
            ${projectScope}
          ORDER BY snapshot_date ASC, project_id ASC`,
        params,
      )
      return latestMonthlySnapshotRows(result.rows as ProjectDailySnapshotHealthRow[])
        .map((row): HealthHistoryRow => ({
          project_id: row.project_id,
          period: snapshotDateToMonthKey(row.snapshot_date),
          health_score: toFiniteNumber(row.health_score),
        }))
    } catch (error) {
      logger.warn('[companySummaryService] direct health history read failed, falling back to Supabase REST', {
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  try {
    let query = supabase
      .from('project_daily_snapshot')
      .select('project_id, snapshot_date, health_score')
      .gte('snapshot_date', monthStart(lastMonth))
      .lt('snapshot_date', nextMonthStart(thisMonth))
      .order('snapshot_date', { ascending: true })
      .order('project_id', { ascending: true })

    query = query.in('project_id', projectIds)

    const rows: ProjectDailySnapshotHealthRow[] = []
    let offset = 0
    while (true) {
      const { data, error } = await query.range(offset, offset + COMPANY_HEALTH_HISTORY_PAGE_SIZE - 1)

      if (error) {
        throw error
      }

      const pageRows = (data || []) as ProjectDailySnapshotHealthRow[]
      rows.push(...pageRows)
      if (pageRows.length < COMPANY_HEALTH_HISTORY_PAGE_SIZE) break
      offset += COMPANY_HEALTH_HISTORY_PAGE_SIZE
    }

    return latestMonthlySnapshotRows(rows)
      .map((row): HealthHistoryRow => ({
        project_id: row.project_id,
        period: snapshotDateToMonthKey(row.snapshot_date),
        health_score: toFiniteNumber(row.health_score),
      }))
  } catch (error) {
    logger.warn('[companySummaryService] failed to load company health history', {
      error: error instanceof Error ? error.message : String(error),
    })
    return [] as HealthHistoryRow[]
  }
}

export function buildCompanyHealthHistory(
  rows: HealthHistoryRow[],
  now = new Date(),
): CompanySummaryHealthHistory {
  const thisMonthPeriod = formatMonthKey(now)
  const lastMonthPeriod = getPreviousMonthKey(now)

  const thisMonthValues = rows
    .filter((row) => row.period === thisMonthPeriod)
    .map((row) => row.health_score)
    .filter((value): value is number => typeof value === 'number')

  const lastMonthValues = rows
    .filter((row) => row.period === lastMonthPeriod)
    .map((row) => row.health_score)
    .filter((value): value is number => typeof value === 'number')

  const thisMonth = average(thisMonthValues)
  const lastMonth = average(lastMonthValues)

  return {
    thisMonth,
    lastMonth,
    change: thisMonth !== null && lastMonth !== null ? thisMonth - lastMonth : null,
    thisMonthPeriod,
    lastMonthPeriod,
    periods: [
      { period: lastMonthPeriod, value: lastMonth },
      { period: thisMonthPeriod, value: thisMonth },
    ],
  }
}

export function buildCompanySummaryResponse(
  summaries: ProjectExecutionSummary[],
  healthHistoryRows: HealthHistoryRow[],
  now = new Date(),
): CompanySummaryResponse {
  const ranking = [...summaries].sort(sortRanking)
  const projectCount = ranking.length
  const visibleProjectIds = new Set(ranking.map((summary) => summary.id))
  const scopedHealthHistoryRows = healthHistoryRows.filter((row) => {
    const projectId = String(row.project_id ?? '').trim()
    return projectId.length > 0 && visibleProjectIds.has(projectId)
  })

  const averageHealth = projectCount > 0
    // eslint-disable-next-line -- summary-service-aggregation-approved; ssot: service-owned-summary
    ? Math.round(ranking.reduce((sum, summary) => sum + Number(summary.businessHealthScore ?? 0), 0) / projectCount)
    : 0
  const averageProgress = projectCount > 0
    // eslint-disable-next-line -- summary-service-aggregation-approved; ssot: service-owned-summary
    ? Math.round(ranking.reduce((sum, summary) => sum + Number(summary.overallProgress ?? 0), 0) / projectCount)
    : 0

  const attentionProjectCount = ranking.filter(isAttentionRequired).length
  // eslint-disable-next-line -- summary-service-aggregation-approved; ssot: service-owned-summary
  const totalUnreadWarningCount = ranking.reduce(
    (sum, summary) => sum + Number(summary.unreadWarningCount ?? 0),
    0,
  )
  // eslint-disable-next-line -- summary-service-aggregation-approved; ssot: service-owned-summary
  const totalDelayedTaskCount = ranking.reduce(
    (sum, summary) => sum + Number(summary.activeDelayedTasks ?? 0),
    0,
  )
  const lowHealthProjectCount = ranking.filter((summary) => Number(summary.businessHealthScore ?? 0) < 60).length
  // eslint-disable-next-line -- summary-service-aggregation-approved; ssot: service-owned-summary
  const overdueMilestoneProjectCount = ranking.filter(
    (summary) => (summary.milestoneOverview?.stats?.overdue ?? 0) > 0,
  ).length

  return {
    projectCount,
    statusCounts: buildStatusCounts(ranking),
    averageHealth,
    averageProgress,
    attentionProjectCount,
    totalUnreadWarningCount,
    totalDelayedTaskCount,
    lowHealthProjectCount,
    overdueMilestoneProjectCount,
    healthHistory: buildCompanyHealthHistory(scopedHealthHistoryRows, now),
    ranking,
  }
}
