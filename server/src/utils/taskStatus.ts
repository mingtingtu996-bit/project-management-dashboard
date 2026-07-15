import { normalizeStatus } from './statusHelpers.js'

export type TaskStatusLike = {
  status?: string | null
  progress?: number | null
  is_milestone?: boolean | null
}

export type TaskConditionLike = {
  is_satisfied?: boolean | number | null
  status?: string | null
}

export type TaskObstacleLike = {
  is_resolved?: boolean | number | null
  status?: string | null
}

export const COMPLETED_TASK_STATUSES = new Set(['completed', 'done', '已完成'])
export const IN_PROGRESS_TASK_STATUSES = new Set(['in_progress', 'active', '进行中'])

// SQL 形式的已完成状态列表，供原始 SQL（如 task-summaries 的 CTE）引用，
// 与 COMPLETED_TASK_STATUSES 同源，避免手写副本再次漏掉 '已完成' 造成口径分叉。
export const COMPLETED_TASK_STATUS_SQL_LIST = Array.from(COMPLETED_TASK_STATUSES)
  .map((s) => `'${s.replace(/'/g, "''")}'`)
  .join(', ')

export function isCompletedTaskStatus(status?: string | null): boolean {
  return COMPLETED_TASK_STATUSES.has(normalizeStatus(status))
}

export function isCompletedTask(task: TaskStatusLike): boolean {
  return isCompletedTaskStatus(task.status) || Number(task.progress ?? 0) >= 100
}

export function isInProgressTask(task: TaskStatusLike): boolean {
  return IN_PROGRESS_TASK_STATUSES.has(normalizeStatus(task.status))
}

export function isCompletedMilestone(task: TaskStatusLike): boolean {
  return task.is_milestone !== false && isCompletedTask(task)
}
