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
