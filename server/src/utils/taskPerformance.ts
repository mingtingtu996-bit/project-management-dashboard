import { isCompletedTask } from './taskStatus.js'
import { delayDayDelta } from './durationDays.js'
import type { ConstructionCalendarContext } from '../services/constructionCalendar.js'

export type TaskDelayLike = {
  status?: string | null
  status_label?: string | null
  progress?: number | null
  planned_end_date?: string | null
  end_date?: string | null
  actual_end_date?: string | null
  completed_at?: string | null
  updated_at?: string | null
  delay_total_days?: number | null
}

function normalizeText(value?: string | null) {
  return String(value ?? '').trim()
}

export function getDateOnly(value?: string | null) {
  const normalized = normalizeText(value).slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : null
}

function isExplicitlyDelayed(task: TaskDelayLike) {
  const status = normalizeText(task.status_label ?? task.status).toLowerCase()
  return status === 'delayed' || Number(task.delay_total_days ?? 0) > 0
}

export function isCompletedTaskDelayedAgainstPlan(
  task: TaskDelayLike,
  calendar?: ConstructionCalendarContext | null,
) {
  const planned = getDateOnly(task.planned_end_date ?? task.end_date)
  const actual = getDateOnly(task.actual_end_date ?? task.completed_at)
  const computedDelay = delayDayDelta(planned, actual, calendar)
  if (computedDelay !== null) return computedDelay > 0
  return isExplicitlyDelayed(task)
}

export function isOpenTaskDelayedAgainstPlan(
  task: TaskDelayLike,
  referenceDate = new Date(),
  calendar?: ConstructionCalendarContext | null,
) {
  const planned = getDateOnly(task.planned_end_date ?? task.end_date)
  if (!planned) return false

  const today = new Date(referenceDate)
  today.setUTCHours(0, 0, 0, 0)
  return (delayDayDelta(planned, today, calendar) ?? 0) > 0
}

export function isTaskDelayedAgainstPlan(
  task: TaskDelayLike,
  referenceDate = new Date(),
  calendar?: ConstructionCalendarContext | null,
) {
  if (isCompletedTask(task)) {
    return isCompletedTaskDelayedAgainstPlan(task, calendar)
  }

  return isOpenTaskDelayedAgainstPlan(task, referenceDate, calendar)
}
