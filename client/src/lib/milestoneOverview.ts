import type { Task } from './supabase'
import { isCompletedTask } from './taskBusinessStatus'
import { daysUntilLocalDate } from './dateDistance'

export type MilestoneLifecycleStatus = 'completed' | 'overdue' | 'soon' | 'upcoming'

export interface MilestoneSummaryStats {
  shiftedCount: number
  baselineOnTimeCount: number
  dueSoon30dCount: number
  highRiskCount: number
}

export interface MilestoneKpiComparisonMetric {
  current: number
  previous: number | null
  delta: number | null
  periodLabel: '较上月'
  status: 'ready' | 'insufficient_history'
}

export interface MilestoneKpiComparisons {
  monthly: {
    shifted: MilestoneKpiComparisonMetric
    baselineOnTime: MilestoneKpiComparisonMetric
    dueSoon30d: MilestoneKpiComparisonMetric
    highRisk: MilestoneKpiComparisonMetric
  }
}

export interface MilestoneOverviewItem {
  id: string
  name: string
  description: string
  targetDate: string | null
  planned_date: string | null
  current_planned_date: string | null
  actual_date: string | null
  progress: number
  status: MilestoneLifecycleStatus
  statusLabel: string
  updatedAt: string
  milestone_level?: number | null
  wbs_level?: number | null
  wbs_code?: string | null
  parent_id?: string | null
  mapping_pending?: boolean
  merged_into?: string | null
  merged_into_name?: string | null
  non_base_labels?: string[]
}

export interface MilestoneOverviewStats {
  total: number
  pending: number
  completed: number
  overdue: number
  upcomingSoon: number
  completionRate: number
}

export interface MilestoneOverview {
  items: MilestoneOverviewItem[]
  stats: MilestoneOverviewStats
  summaryStats?: MilestoneSummaryStats
  kpiComparisons?: MilestoneKpiComparisons
}

function pickTargetDate(task: Pick<Task, 'planned_end_date' | 'end_date'>): string | null {
  return String(task.planned_end_date || task.end_date || '').trim() || null
}

function getStatusLabel(status: MilestoneLifecycleStatus): string {
  switch (status) {
    case 'completed':
      return '已完成'
    case 'overdue':
      return '已逾期'
    case 'soon':
      return '即将到期'
    default:
      return '待完成'
  }
}

export function getMilestoneLifecycleStatus(
  task: Pick<Task, 'status' | 'planned_end_date' | 'end_date'>,
  now = Date.now(),
): MilestoneLifecycleStatus {
  if (isCompletedTask(task)) return 'completed'

  const targetDate = pickTargetDate(task)
  if (!targetDate) return 'upcoming'

  const daysUntil = daysUntilLocalDate(targetDate, new Date(now))
  if (daysUntil == null) return 'upcoming'
  if (daysUntil < 0) return 'overdue'
  if (daysUntil <= 7) return 'soon'
  return 'upcoming'
}

function normalizeMilestoneStats(value?: Partial<MilestoneOverviewStats> | null): MilestoneOverviewStats {
  return {
    total: Number(value?.total ?? 0),
    pending: Number(value?.pending ?? 0),
    completed: Number(value?.completed ?? 0),
    overdue: Number(value?.overdue ?? 0),
    upcomingSoon: Number(value?.upcomingSoon ?? 0),
    completionRate: Number(value?.completionRate ?? 0),
  }
}

function normalizeSummaryStats(value?: Partial<MilestoneSummaryStats> | null): MilestoneSummaryStats | undefined {
  if (!value) return undefined

  return {
    shiftedCount: Number(value.shiftedCount ?? 0),
    baselineOnTimeCount: Number(value.baselineOnTimeCount ?? 0),
    dueSoon30dCount: Number(value.dueSoon30dCount ?? 0),
    highRiskCount: Number(value.highRiskCount ?? 0),
  }
}

export function createEmptyMilestoneOverview(): MilestoneOverview {
  return {
    items: [],
    stats: normalizeMilestoneStats(),
  }
}

export function normalizeMilestoneOverview(value?: Partial<MilestoneOverview> | null): MilestoneOverview {
  const items = Array.isArray(value?.items)
    ? value.items.map((item) => ({
      ...item,
      id: String(item.id ?? ''),
      name: String(item.name ?? '未命名里程碑').trim() || '未命名里程碑',
      description: String(item.description ?? '').trim(),
      targetDate: item.targetDate ?? null,
      planned_date: item.planned_date ?? null,
      current_planned_date: item.current_planned_date ?? null,
      actual_date: item.actual_date ?? null,
      progress: Number(item.progress ?? 0),
      status: item.status ?? 'upcoming',
      statusLabel: item.statusLabel ?? getStatusLabel(item.status ?? 'upcoming'),
      updatedAt: String(item.updatedAt ?? '').trim(),
      milestone_level: item.milestone_level ?? null,
      wbs_level: item.wbs_level ?? null,
      wbs_code: item.wbs_code ?? null,
      parent_id: item.parent_id ?? null,
      mapping_pending: Boolean(item.mapping_pending),
      merged_into: item.merged_into ?? null,
      merged_into_name: item.merged_into_name ?? null,
      non_base_labels: Array.isArray(item.non_base_labels) ? item.non_base_labels.map((label) => String(label)) : undefined,
    }))
    : []

  return {
    items,
    stats: normalizeMilestoneStats(value?.stats),
    summaryStats: normalizeSummaryStats(value?.summaryStats),
    kpiComparisons: value?.kpiComparisons,
  }
}
