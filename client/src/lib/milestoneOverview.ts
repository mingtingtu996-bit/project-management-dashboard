import { isCompletedTask, normalizeStatus } from './taskBusinessStatus'
import type { Task } from './supabase'

export type MilestoneLifecycleStatus = 'completed' | 'overdue' | 'soon' | 'upcoming'

export interface MilestoneSummaryStats {
  shiftedCount: number
  baselineOnTimeCount: number
  dueSoon30dCount: number
  highRiskCount: number
}

export interface MilestoneHealthSummary {
  status: 'normal' | 'needs_attention' | 'abnormal'
  needsAttentionCount: number
  mappingPendingCount: number
  mergedCount: number
  excessiveDeviationCount: number
  incompleteDataCount: number
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
  healthSummary?: MilestoneHealthSummary
}

function pickTargetDate(task: Pick<Task, 'planned_end_date' | 'end_date'>): string | null {
  return String(task.planned_end_date || task.end_date || '').trim() || null
}

function toTime(value: string | null): number {
  if (!value) return Number.POSITIVE_INFINITY
  const time = new Date(value).getTime()
  return Number.isNaN(time) ? Number.POSITIVE_INFINITY : time
}

export function getMilestoneLifecycleStatus(
  task: Pick<Task, 'status' | 'planned_end_date' | 'end_date'>,
  now = Date.now(),
): MilestoneLifecycleStatus {
  if (isCompletedTask(task)) return 'completed'

  const targetDate = pickTargetDate(task)
  if (!targetDate) return 'upcoming'

  const targetTime = new Date(targetDate).getTime()
  if (Number.isNaN(targetTime)) return 'upcoming'

  const daysUntil = Math.ceil((targetTime - now) / 86400000)
  if (daysUntil < 0) return 'overdue'
  if (daysUntil <= 7) return 'soon'
  return 'upcoming'
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

function isShiftedMilestone(task: Pick<Task, 'is_milestone' | 'planned_end_date' | 'end_date' | 'actual_end_date' | 'status' | 'progress'>): boolean {
  if (!task.is_milestone) return false

  const targetDate = pickTargetDate(task)
  if (!targetDate) return false

  const plannedTime = new Date(targetDate).getTime()
  if (Number.isNaN(plannedTime)) return false

  const actualEnd = String(task.actual_end_date || '').trim() || null
  if (actualEnd) {
    const actualTime = new Date(actualEnd).getTime()
    return Number.isFinite(actualTime) && actualTime > plannedTime
  }

  return !isCompletedTask(task) && plannedTime < Date.now()
}

function buildNonBaseLabels(task: Task): string[] {
  const labels: string[] = []
  const targetDate = pickTargetDate(task)
  const baselineDate = String(task.baseline_end || task.baseline_start || '').trim() || null

  if (task.status === 'completed' && Number(task.progress ?? 0) < 100) {
    labels.push('执行层已关闭')
  }

  if (!(task.baseline_end || task.baseline_start) || !task.planned_end_date) {
    labels.push('数据不完整')
  }

  if (task.is_milestone && !task.baseline_item_id) {
    labels.push('未关联基线')
  }

  if (baselineDate && String(task.actual_end_date || '').trim()) {
    const actualTime = new Date(String(task.actual_end_date)).getTime()
    const baselineTime = new Date(baselineDate).getTime()
    if (Number.isFinite(actualTime) && Number.isFinite(baselineTime)) {
      const deviationDays = Math.abs((actualTime - baselineTime) / 86400000)
      if (deviationDays > 30) {
        labels.push('偏差过大')
      }
    }
  }

  if (!baselineDate && targetDate) {
    labels.push('未关联基线')
  }

  return [...new Set(labels)]
}

export function buildMilestoneOverview(tasks: Task[] = []): MilestoneOverview {
  const items = tasks
    .filter((task) => task.is_milestone)
    .map((task) => {
      const status = getMilestoneLifecycleStatus(task)
      const targetDate = pickTargetDate(task)
      const non_base_labels = buildNonBaseLabels(task)
      return {
        id: String(task.id ?? ''),
        name: String(task.title || task.name || '未命名里程碑').trim() || '未命名里程碑',
        description: String(task.description || '').trim(),
        targetDate,
        planned_date: String(task.baseline_end || task.baseline_start || '').trim() || null,
        current_planned_date: String(task.planned_end_date || task.end_date || '').trim() || null,
        actual_date: String(task.actual_end_date || '').trim() || null,
        progress: isCompletedTask(task) ? 100 : Math.max(0, Math.min(100, Number(task.progress ?? 0))),
        status,
        statusLabel: getStatusLabel(status),
        updatedAt: String(task.updated_at || task.created_at || '').trim(),
        parent_id: task.parent_id ? String(task.parent_id) : null,
        mapping_pending: Boolean(task.is_milestone && !task.baseline_item_id),
        merged_into: null,
        merged_into_name: null,
        non_base_labels,
      }
    })
    .sort((left, right) => {
      const statusOrder: Record<MilestoneLifecycleStatus, number> = {
        overdue: 0,
        soon: 1,
        upcoming: 2,
        completed: 3,
      }

      const statusDiff = statusOrder[left.status] - statusOrder[right.status]
      if (statusDiff !== 0) return statusDiff

      const dateDiff = toTime(left.targetDate) - toTime(right.targetDate)
      if (dateDiff !== 0) return dateDiff

      return left.name.localeCompare(right.name, 'zh-Hans-CN')
    })

  const completed = items.filter((item) => item.status === 'completed').length
  const overdue = items.filter((item) => item.status === 'overdue').length
  const upcomingSoon = items.filter((item) => item.status === 'soon').length
  const pending = items.length - completed
  const summaryStats: MilestoneSummaryStats = {
    shiftedCount: tasks.filter((task) => isShiftedMilestone(task)).length,
    baselineOnTimeCount: tasks.filter(
      (task) =>
        task.is_milestone
        && isCompletedTask(task)
        && Boolean(String(task.actual_end_date || '').trim())
        && !isShiftedMilestone(task),
    ).length,
    dueSoon30dCount: tasks.filter((task) => {
      if (!task.is_milestone || isCompletedTask(task)) return false
      const targetDate = pickTargetDate(task)
      if (!targetDate) return false
      const targetTime = new Date(targetDate).getTime()
      if (Number.isNaN(targetTime)) return false
      const daysUntil = Math.ceil((targetTime - Date.now()) / 86400000)
      return daysUntil >= 0 && daysUntil <= 30
    }).length,
    highRiskCount: items.filter((item) =>
      item.status === 'overdue'
      || (item.non_base_labels ?? []).some((label) => label !== '未关联基线'),
    ).length,
  }

  const healthSummary: MilestoneHealthSummary = {
    status: summaryStats.highRiskCount === 0 && items.length > 0 ? 'normal' : summaryStats.highRiskCount > 3 ? 'abnormal' : summaryStats.highRiskCount > 0 ? 'needs_attention' : 'normal',
    needsAttentionCount: items.filter((item) => (item.non_base_labels ?? []).length > 0).length,
    mappingPendingCount: items.filter((item) => item.mapping_pending).length,
    mergedCount: items.filter((item) => item.merged_into !== null).length,
    excessiveDeviationCount: items.filter((item) => (item.non_base_labels ?? []).includes('偏差过大')).length,
    incompleteDataCount: items.filter((item) => (item.non_base_labels ?? []).includes('数据不完整')).length,
  }

  return {
    items,
    stats: {
      total: items.length,
      pending,
      completed,
      overdue,
      upcomingSoon,
      completionRate: items.length > 0 ? Math.round((completed / items.length) * 100) : 0,
    },
    summaryStats,
    healthSummary,
  }
}

export function formatMilestoneStatus(status: string): string {
  const normalized = normalizeStatus(status)
  if (normalized === 'completed') return '已完成'
  if (normalized === 'overdue') return '已逾期'
  if (normalized === 'soon') return '即将到期'
  return '待完成'
}
