import type { Task } from '../types/db.js'
import { inclusiveDurationDays, normalizeDurationDateUtc } from '../utils/durationDays.js'

export type TaskLagLevel = 'none' | 'mild' | 'moderate' | 'severe'
export type TaskLagStatus = '正常' | '轻度滞后' | '中度滞后' | '严重滞后'

export type TaskLagFields = {
  lagLevel: TaskLagLevel
  lagStatus: TaskLagStatus
}

type TaskLagSource = Pick<
  Task,
  | 'status'
  | 'progress'
  | 'start_date'
  | 'end_date'
  | 'planned_start_date'
  | 'planned_end_date'
> & {
  lagLevel?: unknown
  lagStatus?: unknown
}

const TASK_LAG_STATUS_BY_LEVEL: Record<TaskLagLevel, TaskLagStatus> = {
  none: '正常',
  mild: '轻度滞后',
  moderate: '中度滞后',
  severe: '严重滞后',
}

function normalizeStatus(value: unknown): string {
  return String(value ?? '').trim().toLowerCase()
}

function normalizeLagLevel(value: unknown): TaskLagLevel | null {
  const normalized = String(value ?? '').trim().toLowerCase()
  switch (normalized) {
    case 'none':
    case 'normal':
    case '正常':
      return 'none'
    case 'mild':
    case '轻度滞后':
      return 'mild'
    case 'moderate':
    case '中度滞后':
      return 'moderate'
    case 'severe':
    case '严重滞后':
      return 'severe'
    default:
      return null
  }
}

function normalizeLagStatus(value: unknown): TaskLagStatus | null {
  const normalized = String(value ?? '').trim()
  switch (normalized) {
    case '正常':
      return '正常'
    case '轻度滞后':
      return '轻度滞后'
    case '中度滞后':
      return '中度滞后'
    case '严重滞后':
      return '严重滞后'
    default:
      return null
  }
}

function getPlannedStartDate(task: TaskLagSource): string | null {
  return task.planned_start_date || task.start_date || null
}

function getPlannedEndDate(task: TaskLagSource): string | null {
  return task.planned_end_date || task.end_date || null
}

function calculateLegacyLagLevel(task: TaskLagSource): TaskLagLevel {
  const status = normalizeStatus(task.status)
  if (status !== 'in_progress' && status !== 'blocked') return 'none'

  const plannedStart = getPlannedStartDate(task)
  const plannedEnd = getPlannedEndDate(task)
  if (!plannedStart || !plannedEnd) return 'none'

  const start = normalizeDurationDateUtc(plannedStart)
  const end = normalizeDurationDateUtc(plannedEnd)
  if (!start || !end) return 'none'

  const duration = inclusiveDurationDays(start, end)
  if (!duration) return 'none'

  const now = normalizeDurationDateUtc(new Date(Date.now()))
  if (!now || now.getTime() > end.getTime()) return 'none'
  if (now.getTime() <= start.getTime()) return 'none'

  const elapsed = Math.min(duration, inclusiveDurationDays(start, now) ?? 0)
  const timeRatio = elapsed / duration
  if (timeRatio <= 0) return 'none'

  const progress = Number(task.progress ?? 0)
  const biasRatio = (progress / 100) / timeRatio
  const remaining = inclusiveDurationDays(now, end) ?? 0
  const threshold = 0.7

  if (biasRatio < 0.5 && remaining < 3) return 'severe'
  if (biasRatio < 0.5) return 'moderate'
  if (biasRatio < threshold) return 'mild'
  return 'none'
}

export function getTaskLagLevel(task: TaskLagSource): TaskLagLevel | null {
  const explicitLagLevel = normalizeLagLevel(task.lagLevel)
  if (explicitLagLevel !== null) {
    return explicitLagLevel === 'none' ? null : explicitLagLevel
  }

  const explicitLagStatus = normalizeLagStatus(task.lagStatus)
  if (explicitLagStatus) {
    switch (explicitLagStatus) {
      case '轻度滞后':
        return 'mild'
      case '中度滞后':
        return 'moderate'
      case '严重滞后':
        return 'severe'
      default:
        return null
    }
  }

  const legacyLagLevel = calculateLegacyLagLevel(task)
  return legacyLagLevel === 'none' ? null : legacyLagLevel
}

export function getTaskLagStatus(task: TaskLagSource): TaskLagStatus {
  const explicitLagStatus = normalizeLagStatus(task.lagStatus)
  if (explicitLagStatus) {
    return explicitLagStatus
  }

  const lagLevel = getTaskLagLevel(task) ?? 'none'
  return TASK_LAG_STATUS_BY_LEVEL[lagLevel]
}

export function attachTaskLagStatus<T extends TaskLagSource>(task: T): T & TaskLagFields {
  const lagLevel = getTaskLagLevel(task) ?? 'none'
  return {
    ...task,
    lagLevel,
    lagStatus: getTaskLagStatus(task),
  }
}

export function attachTasksLagStatus<T extends TaskLagSource>(tasks: T[]): Array<T & TaskLagFields> {
  return tasks.map((task) => attachTaskLagStatus(task))
}
