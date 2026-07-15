import { apiGet, getAuthHeaders } from '@/lib/apiClient'
import { prefetchProjectTasks } from '@/lib/projectTaskPrefetch'
import type { ProjectMember } from '@/lib/supabase'
import type { Task } from '../GanttViewTypes'
import { withCredentials, withRequestContext } from './ganttViewUtils'

const GANTT_TASKS_REQUEST_TIMEOUT_MS = 12_000

export type BaselineVersionOption = {
  id: string
  version: number
  title: string
  status: string
}

export type GanttProjectMember = {
  userId: string
  displayName: string
  permissionLevel: string | null
}

type ListGanttTasksInput = {
  projectId: string
  viewMode: string
  timelineCompareMode: string
  timelineBaselineVersionId?: string | null
  signal?: AbortSignal
  force?: boolean
}

function createTimedSignal(parentSignal?: AbortSignal): { signal: AbortSignal; didTimeout: () => boolean; cleanup: () => void } {
  const controller = new AbortController()
  let timedOut = false
  const abortFromParent = () => controller.abort()
  const timer = window.setTimeout(() => {
    timedOut = true
    controller.abort()
  }, GANTT_TASKS_REQUEST_TIMEOUT_MS)

  if (parentSignal?.aborted) {
    controller.abort()
  } else if (parentSignal) {
    parentSignal.addEventListener('abort', abortFromParent, { once: true })
  }

  return {
    signal: controller.signal,
    didTimeout: () => timedOut,
    cleanup: () => {
      window.clearTimeout(timer)
      parentSignal?.removeEventListener('abort', abortFromParent)
    },
  }
}

export async function listProjectMembers(projectId: string, signal?: AbortSignal): Promise<GanttProjectMember[]> {
  const payload = await apiGet<{ success?: boolean; members?: ProjectMember[] }>(`/api/members/${projectId}`, signal ? { signal } : undefined)
  const members = Array.isArray(payload?.members) ? payload.members : []
  return members
    .map((member) => ({
      userId: String(member.userId ?? member.user_id ?? ''),
      displayName: String(member.displayName ?? member.username ?? '').trim(),
      permissionLevel: String(member.permissionLevel ?? member.permission_level ?? '').trim() || null,
    }))
    .filter((member) => member.userId && member.displayName)
}

export async function listBaselineVersionOptions(projectId: string, signal?: AbortSignal): Promise<BaselineVersionOption[]> {
  const response = await fetch(`/api/task-baselines?project_id=${encodeURIComponent(projectId)}`, {
    headers: getAuthHeaders(),
    signal,
    ...withCredentials(),
  })
  const json = await response.json()
  if (!json.success) {
    throw new Error(json.error?.message || '加载基线版本失败')
  }

  return Array.isArray(json.data)
    ? (json.data as Array<Record<string, unknown>>)
        .filter((row) => ['confirmed', 'pending_realign', 'closed'].includes(String(row.status ?? '').trim()))
        .map((row) => ({
          id: String(row.id ?? ''),
          version: Number(row.version ?? 0),
          title: String(row.title ?? '项目基线'),
          status: String(row.status ?? 'draft'),
        }))
        .filter((row) => row.id)
        .sort((left, right) => right.version - left.version)
    : []
}

export async function listGanttTasks({
  projectId,
  viewMode,
  timelineCompareMode,
  timelineBaselineVersionId,
  signal,
  force,
}: ListGanttTasksInput): Promise<Task[]> {
  if (viewMode !== 'gantt') {
    return prefetchProjectTasks(projectId, { signal, force, includeAcceptanceImpact: false }) as Promise<Task[]>
  }

  const requestParams = new URLSearchParams({ projectId, surface: 'task_list' })
  requestParams.set('timeline_projection', 'true')
  if (timelineCompareMode === 'baseline' && timelineBaselineVersionId) {
    requestParams.set('baseline_version_id', timelineBaselineVersionId)
  }

  const timedRequest = createTimedSignal(signal)
  try {
    const response = await fetch(
      `/api/tasks?${requestParams.toString()}`,
      withRequestContext({ signal: timedRequest.signal }),
    )
    const json = await response.json().catch(() => null)
    if (!response.ok || json?.success === false) {
      const message = typeof json?.error?.message === 'string'
        ? json.error.message
        : '任务列表加载失败'
      throw new Error(message)
    }
    return Array.isArray(json?.data) ? json.data : []
  } catch (error) {
    if (timedRequest.didTimeout() && !signal?.aborted) {
      throw new Error('任务列表加载超时，请稍后重试')
    }
    throw error
  } finally {
    timedRequest.cleanup()
  }
}
