import { apiGet, getAuthHeaders } from '@/lib/apiClient'
import type { Task, TaskCondition } from '../GanttViewTypes'
import { extractApiErrorMessage } from './deleteProtection'
import { withCredentials, withRequestContext } from './ganttViewUtils'

export type TaskConditionPrecedingTask = {
  task_id: string
  title?: string
  status?: string
}

type CreateTaskConditionInput = {
  task: Task
  name: string
  type: string
  targetDate?: string | null
  description?: string | null
  participantUnitId?: string | null
  precedingTaskIds?: string[]
}

type UpdateTaskConditionInput = {
  conditionId: string
  values: Record<string, unknown>
  fallback?: TaskCondition
  errorMessage?: string
}

export async function listProjectTaskConditions(projectId: string, signal?: AbortSignal): Promise<TaskCondition[]> {
  return apiGet<TaskCondition[]>(
    `/api/task-conditions?projectId=${encodeURIComponent(projectId)}`,
    signal ? { signal } : undefined,
  )
}

export async function fetchTaskConditionPrecedingTasks(conditionId: string): Promise<TaskConditionPrecedingTask[]> {
  const response = await fetch(`/api/task-conditions/${conditionId}/preceding-tasks`, withRequestContext())
  const json = await response.json()
  return Array.isArray(json.data) ? json.data : []
}

export async function fetchTaskConditionPrecedingTaskMap(conditions: Array<Pick<TaskCondition, 'id'>>) {
  const entries = await Promise.all(
    conditions.map(async (condition) => {
      try {
        return [condition.id, await fetchTaskConditionPrecedingTasks(condition.id)] as const
      } catch {
        return [condition.id, []] as const
      }
    }),
  )
  return Object.fromEntries(entries) as Record<string, TaskConditionPrecedingTask[]>
}

export async function createTaskCondition({
  task,
  name,
  type,
  targetDate,
  description,
  participantUnitId,
  precedingTaskIds = [],
}: CreateTaskConditionInput): Promise<TaskCondition> {
  const body: Record<string, unknown> = {
    task_id: task.id,
    project_id: task.project_id,
    name: name.trim(),
    is_satisfied: false,
    condition_type: type,
  }
  if (targetDate) body.target_date = targetDate
  if (description?.trim()) body.description = description.trim()
  if (participantUnitId) body.participant_unit_id = participantUnitId

  const response = await fetch('/api/task-conditions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify(body),
    ...withCredentials(),
  })
  const json = await response.json()
  if (!json.success) {
    throw new Error(extractApiErrorMessage(json, '新增开工条件失败'))
  }

  const nextCondition = json.data as TaskCondition
  if (type === 'preceding' && precedingTaskIds.length > 0) {
    await fetch(`/api/task-conditions/${nextCondition.id}/preceding-tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      body: JSON.stringify({ preceding_task_ids: precedingTaskIds }),
      ...withCredentials(),
    })
  }
  return nextCondition
}

export async function updateTaskCondition({
  conditionId,
  values,
  fallback,
  errorMessage = '更新开工条件失败',
}: UpdateTaskConditionInput): Promise<TaskCondition> {
  const response = await fetch(`/api/task-conditions/${conditionId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify(values),
    ...withCredentials(),
  })
  const json = await response.json()
  if (!json.success) {
    throw new Error(extractApiErrorMessage(json, errorMessage))
  }
  return (json.data ?? fallback) as TaskCondition
}

export async function deleteTaskConditionRecord(conditionId: string) {
  const response = await fetch(
    `/api/task-conditions/${conditionId}`,
    withRequestContext({
      method: 'DELETE',
    }),
  )
  const json = await response.json()
  if (!json.success) {
    throw new Error(extractApiErrorMessage(json, '删除条件失败'))
  }
}
