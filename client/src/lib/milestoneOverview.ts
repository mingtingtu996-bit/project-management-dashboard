import type { Task } from './supabase'
import { isCompletedTask, normalizeStatus } from './taskBusinessStatus'

export type MilestoneLifecycleStatus = 'completed' | 'overdue' | 'soon' | 'upcoming'

export interface MilestoneOverviewItem {
  id: string
  name: string
  description: string
  targetDate: string | null
  progress: number
  status: MilestoneLifecycleStatus
  statusLabel: string
  updatedAt: string
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

export function buildMilestoneOverview(tasks: Task[] = []): MilestoneOverview {
  const items = tasks
    .filter((task) => task.is_milestone)
    .map((task) => {
      const status = getMilestoneLifecycleStatus(task)
      const targetDate = pickTargetDate(task)
      return {
        id: String(task.id ?? ''),
        name: String(task.title || task.name || '未命名里程碑').trim() || '未命名里程碑',
        description: String(task.description || '').trim(),
        targetDate,
        progress: isCompletedTask(task) ? 100 : Math.max(0, Math.min(100, Number(task.progress ?? 0))),
        status,
        statusLabel: getStatusLabel(status),
        updatedAt: String(task.updated_at || task.created_at || '').trim(),
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
  }
}

export function formatMilestoneStatus(status: string): string {
  const normalized = normalizeStatus(status)
  if (normalized === 'completed') return '已完成'
  if (normalized === 'overdue') return '已逾期'
  if (normalized === 'soon') return '即将到期'
  return '待完成'
}
