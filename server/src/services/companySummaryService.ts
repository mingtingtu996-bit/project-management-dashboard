import { logger } from '../middleware/logger.js'
import { supabase } from './dbService.js'
import type { ProjectExecutionSummary } from './projectExecutionSummaryService.js'

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

export type CompanySummaryResponse = {
  projectCount: number
  averageHealth: number
  averageProgress: number
  attentionProjectCount: number
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

function average(values: number[]) {
  if (values.length === 0) return null
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length)
}

function isAttentionRequired(summary: ProjectExecutionSummary) {
  return Boolean(
    summary.attentionRequired ||
      summary.healthScore < 60 ||
      (summary.milestoneOverview?.stats?.overdue ?? 0) > 0,
  )
}

function sortRanking(left: ProjectExecutionSummary, right: ProjectExecutionSummary) {
  const leftHealth = Number(left.healthScore ?? 0)
  const rightHealth = Number(right.healthScore ?? 0)
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

export async function loadCompanyHealthHistoryRows(now = new Date()) {
  const thisMonth = formatMonthKey(now)
  const lastMonth = getPreviousMonthKey(now)

  try {
    const { data, error } = await supabase
      .from('project_daily_snapshot')
      .select('project_id, snapshot_date, health_score')
      .gte('snapshot_date', monthStart(lastMonth))
      .lt('snapshot_date', nextMonthStart(thisMonth))
      .order('snapshot_date', { ascending: true })
      .order('project_id', { ascending: true })

    if (error) {
      throw error
    }

    return latestMonthlySnapshotRows((data || []) as ProjectDailySnapshotHealthRow[])
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
    ? Math.round(ranking.reduce((sum, summary) => sum + Number(summary.healthScore ?? 0), 0) / projectCount)
    : 0
  const averageProgress = projectCount > 0
    ? Math.round(ranking.reduce((sum, summary) => sum + Number(summary.overallProgress ?? 0), 0) / projectCount)
    : 0

  const attentionProjectCount = ranking.filter(isAttentionRequired).length
  const lowHealthProjectCount = ranking.filter((summary) => summary.healthScore < 60).length
  const overdueMilestoneProjectCount = ranking.filter(
    (summary) => (summary.milestoneOverview?.stats?.overdue ?? 0) > 0,
  ).length

  return {
    projectCount,
    averageHealth,
    averageProgress,
    attentionProjectCount,
    lowHealthProjectCount,
    overdueMilestoneProjectCount,
    healthHistory: buildCompanyHealthHistory(scopedHealthHistoryRows, now),
    ranking,
  }
}
