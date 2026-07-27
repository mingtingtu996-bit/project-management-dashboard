import { apiGet, getAuthHeaders } from '@/lib/apiClient'
import type { Task, TaskObstacle } from '../GanttViewTypes'
import { extractApiErrorMessage, isObjectRecord } from './deleteProtection'
import { withCredentials, withRequestContext } from './ganttViewUtils'

type CreateTaskObstacleInput = {
  task: Task
  projectId: string
  description: string
  severity: string
  expectedResolutionDate?: string | null
  resolutionNotes?: string | null
}

type TaskObstacleUpdateValues = {
  description?: string
  severity?: string | null
  expected_resolution_date?: string | null
  resolution_notes?: string | null
  status?: string
}

type UpdateTaskObstacleInput = {
  obstacleId: string
  values: TaskObstacleUpdateValues
  fallback?: TaskObstacle
}

type CloseTaskObstacleInput = {
  obstacleId: string
  endpoint?: string | null
  fallback?: TaskObstacle
}

type DeleteTaskObstacleResult = {
  blockedPayload?: unknown
}

function normalizeObstacleSeverityForApi(value?: string | null) {
  const normalized = String(value ?? '').trim().toLowerCase()
  if (['high', 'urgent', '高'].includes(normalized)) return '高'
  if (['critical', 'serious', '严重'].includes(normalized)) return '严重'
  if (['low', 'minor', '低'].includes(normalized)) return '低'
  return '中'
}

export async function listProjectTaskObstacles(projectId: string, signal?: AbortSignal): Promise<TaskObstacle[]> {
  return apiGet<TaskObstacle[]>(
    `/api/task-obstacles?projectId=${encodeURIComponent(projectId)}`,
    signal ? { signal } : undefined,
  )
}

export async function createTaskObstacle({
  task,
  projectId,
  description,
  severity,
  expectedResolutionDate,
  resolutionNotes,
}: CreateTaskObstacleInput) {
  const response = await fetch('/api/task-obstacles', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify({
      task_id: task.id,
      project_id: task.project_id || projectId,
      description,
      status: '待处理',
      severity: normalizeObstacleSeverityForApi(severity),
      expected_resolution_date: expectedResolutionDate?.trim() || null,
      resolution_notes: resolutionNotes?.trim() || null,
    }),
    ...withCredentials(),
  })
  const json = await response.json()
  if (!json.success) {
    throw new Error(extractApiErrorMessage(json, '新增阻碍失败'))
  }
  return json.data as TaskObstacle
}

export async function updateTaskObstacle({
  obstacleId,
  values,
  fallback,
}: UpdateTaskObstacleInput) {
  const payload = {
    ...values,
    ...(values.severity !== undefined ? { severity: values.severity ? normalizeObstacleSeverityForApi(values.severity) : null } : {}),
  }
  const response = await fetch(`/api/task-obstacles/${obstacleId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify(payload),
    ...withCredentials(),
  })
  const json = await response.json()
  if (!json.success) {
    throw new Error(extractApiErrorMessage(json, '更新阻碍失败'))
  }
  return (json.data ?? fallback) as TaskObstacle
}

export async function closeTaskObstacleRecord({
  obstacleId,
  endpoint,
  fallback,
}: CloseTaskObstacleInput) {
  const response = await fetch(
    endpoint || `/api/task-obstacles/${obstacleId}/close`,
    withRequestContext({
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    }),
  )
  const json = await response.json()
  if (!json.success) {
    throw new Error(extractApiErrorMessage(json, '关闭阻碍失败'))
  }
  const data = isObjectRecord(json.data) ? json.data.obstacle ?? json.data : json.data
  return (data ?? fallback) as TaskObstacle
}

export async function deleteTaskObstacleRecord(obstacleId: string): Promise<DeleteTaskObstacleResult> {
  const response = await fetch(
    `/api/task-obstacles/${obstacleId}`,
    withRequestContext({
      method: 'DELETE',
    }),
  )
  const json = await response.json()
  if (!json.success) {
    if (response.status === 422) {
      return { blockedPayload: json }
    }
    throw new Error(extractApiErrorMessage(json, '删除阻碍失败'))
  }
  return {}
}
