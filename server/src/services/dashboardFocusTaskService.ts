import type { ConstructionCalendarContext } from './constructionCalendar.js'
import { deriveTaskUnifiedStatus } from './taskStatusDerivationService.js'
import type { DurationMetricDto } from './durationMetricService.js'
import { isCompletedTask } from '../utils/taskStatus.js'

export type DashboardFocusTaskFilter = 'today' | '3days' | 'week' | '30days' | 'urgent'
export type DashboardFocusTaskDueStatus = 'overdue' | 'urgent' | 'approaching' | 'normal'
type AnyRow = Record<string, any>

export type DashboardFocusTaskItem = {
  id: string
  title: string
  status: 'pending' | 'in_progress' | 'blocked' | 'completed'
  statusLabel: string
  progress: number
  assignee?: string
  assigneeUnit?: string
  endDate?: string
  dueDuration: DurationMetricDto
  /** @deprecated Use dueDuration. Removed after the v1.5 compatibility window. */
  daysUntilDue: number | null
  dueStatus: DashboardFocusTaskDueStatus
  dueLabel: string
  updatedAt?: string
  isTodayTodo?: boolean
}

export function normalizeDashboardFocusTaskFilter(value: unknown): DashboardFocusTaskFilter {
  const normalized = String(value ?? '').trim().toLowerCase()
  return normalized === 'today' || normalized === '3days' || normalized === '30days' || normalized === 'urgent'
    ? normalized
    : 'week'
}

export function normalizeDashboardFocusTaskLimit(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.min(50, Math.max(1, Math.floor(parsed))) : 6
}

function firstText(row: AnyRow, keys: string[], fallback = '') {
  for (const key of keys) {
    const value = String(row[key] ?? '').trim()
    if (value) return value
  }
  return fallback
}

function normalizeStatus(row: AnyRow): DashboardFocusTaskItem['status'] {
  const status = String(row.status ?? '').trim().toLowerCase()
  if (isCompletedTask(row)) return 'completed'
  if (['in_progress', 'active', '进行中'].includes(status)) return 'in_progress'
  if (['blocked', '阻塞', '受阻'].includes(status)) return 'blocked'
  return 'pending'
}

function statusLabel(row: AnyRow) {
  const raw = firstText(row, ['status'])
  if (raw) return raw
  const status = normalizeStatus(row)
  if (status === 'completed') return '已完成'
  if (status === 'in_progress') return '进行中'
  if (status === 'blocked') return '受阻'
  return '未开始'
}

function toItem(
  row: AnyRow,
  now: Date,
  calendar?: ConstructionCalendarContext | null,
  todayTodoTaskIds?: Set<string>,
): DashboardFocusTaskItem {
  const derived = deriveTaskUnifiedStatus({
    status: row.status,
    progress: row.progress,
    planned_end_date: row.planned_end_date ?? row.due_date,
    end_date: row.end_date,
    duePolicy: row.duePolicy ?? row.due_policy,
    due_policy: row.due_policy,
    due_urgent_days: row.due_urgent_days,
    due_approaching_days: row.due_approaching_days,
  }, { currentDate: now, calendar }).dueStatus
  const id = String(row.id ?? '')
  const endDate = String(row.planned_end_date ?? row.end_date ?? row.due_date ?? '').trim().slice(0, 10) || undefined
  return {
    id,
    title: firstText(row, ['title'], '未命名任务'),
    status: normalizeStatus(row),
    statusLabel: statusLabel(row),
    progress: Math.max(0, Math.min(100, Number(row.progress ?? 0))),
    assignee: firstText(row, ['assignee_name', 'assignee']),
    assigneeUnit: firstText(row, ['participant_unit_name']),
    endDate,
    dueDuration: derived.duration,
    daysUntilDue: derived.daysUntilDue,
    dueStatus: derived.status,
    dueLabel: derived.label,
    updatedAt: firstText(row, ['updated_at', 'created_at']),
    isTodayTodo: todayTodoTaskIds?.has(id) ?? false,
  }
}

function include(item: DashboardFocusTaskItem, filter: DashboardFocusTaskFilter) {
  const duration = item.dueDuration
  const futureCalendarDays = duration.availability === 'available' && duration.unit === 'calendar_day'
    ? duration.value
    : null
  if (filter === 'today') return item.isTodayTodo === true
  if (filter === 'urgent') return item.dueStatus === 'urgent' || item.dueStatus === 'overdue'
  const maximum = filter === '3days' ? 3 : filter === '30days' ? 30 : 7
  return futureCalendarDays !== null && futureCalendarDays >= 0 && futureCalendarDays <= maximum
}

function compare(left: DashboardFocusTaskItem, right: DashboardFocusTaskItem) {
  const priority: Record<DashboardFocusTaskDueStatus, number> = { overdue: 0, urgent: 1, approaching: 2, normal: 3 }
  const priorityDiff = priority[left.dueStatus] - priority[right.dueStatus]
  if (priorityDiff !== 0) return priorityDiff
  const leftValue = left.dueDuration.availability === 'available' ? left.dueDuration.value : null
  const rightValue = right.dueDuration.availability === 'available' ? right.dueDuration.value : null
  if (leftValue !== rightValue) return (leftValue ?? Number.POSITIVE_INFINITY) - (rightValue ?? Number.POSITIVE_INFINITY)
  return new Date(right.updatedAt ?? 0).getTime() - new Date(left.updatedAt ?? 0).getTime()
}

export function buildDashboardFocusTasksResponse(input: {
  rows: AnyRow[]
  filter: DashboardFocusTaskFilter
  limit: number
  now: Date
  calendar?: ConstructionCalendarContext | null
  todayTodoTaskIds?: Set<string>
}) {
  const allItems = input.rows
    .filter((task) => !isCompletedTask(task))
    .map((task) => toItem(task, input.now, input.calendar, input.todayTodoTaskIds))
    .sort(compare)
  const filteredItems = allItems.filter((item) => include(item, input.filter))
  const items = filteredItems.slice(0, input.limit)
  return {
    filter: input.filter,
    stats: {
      total: allItems.length,
      overdue: allItems.filter((item) => item.dueStatus === 'overdue').length,
      urgent: allItems.filter((item) => item.dueStatus === 'urgent').length,
      approaching: allItems.filter((item) => item.dueStatus === 'approaching').length,
      normal: allItems.filter((item) => item.dueStatus === 'normal').length,
    },
    items,
    totalCount: filteredItems.length,
    allItems,
  }
}
