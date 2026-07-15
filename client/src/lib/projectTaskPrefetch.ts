import { apiGet } from '@/lib/apiClient'
import type { Task } from '@/lib/supabase'

type ApiTask = Partial<Task> & Record<string, unknown> & {
  assignee_id?: string | null
  assignee_name?: string | null
  progress?: number | string | null
  is_milestone?: boolean | null
}

const PROJECT_TASK_PREFETCH_TTL_MS = 60_000
const PROJECT_TASK_PREFETCH_TIMEOUT_MS = 12_000
type ProjectTaskCacheEntry = {
  tasks: Task[]
  cachedAt: number
}

const projectTaskPrefetchCache = new Map<string, ProjectTaskCacheEntry>()
const projectTaskPrefetchInflight = new Map<string, Promise<Task[]>>()

function normalizeTask(task: ApiTask): Task {
  return {
    ...task,
    title: task.title ?? '',
    start_date: task.start_date ?? task.planned_start_date ?? null,
    end_date: task.end_date ?? task.planned_end_date ?? null,
    planned_start_date: task.planned_start_date ?? task.start_date ?? null,
    planned_end_date: task.planned_end_date ?? task.end_date ?? null,
    assignee: task.assignee_name ?? '',
    assignee_user_id: task.assignee_user_id ?? task.assignee_id ?? null,
    assignee_name: task.assignee_name ?? '',
    participant_unit_name: task.participant_unit_name ?? null,
    progress: Number(task.progress ?? 0),
  }
}

function getCachedTasks(projectId: string) {
  const cached = projectTaskPrefetchCache.get(projectId)
  if (!cached) {
    return null
  }

  if (Date.now() - cached.cachedAt > PROJECT_TASK_PREFETCH_TTL_MS) {
    projectTaskPrefetchCache.delete(projectId)
    return null
  }

  return cached.tasks
}

function createPrefetchSignal(parentSignal?: AbortSignal): { signal: AbortSignal; didTimeout: () => boolean; cleanup: () => void } {
  const controller = new AbortController()
  let timedOut = false
  const abortFromParent = () => controller.abort()
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, PROJECT_TASK_PREFETCH_TIMEOUT_MS)

  if (parentSignal?.aborted) {
    controller.abort()
  } else if (parentSignal) {
    parentSignal.addEventListener('abort', abortFromParent, { once: true })
  }

  return {
    signal: controller.signal,
    didTimeout: () => timedOut,
    cleanup: () => {
      clearTimeout(timer)
      parentSignal?.removeEventListener('abort', abortFromParent)
    },
  }
}

export function getPrefetchedProjectTasks(projectId: string) {
  return getCachedTasks(projectId)
}

export async function prefetchProjectTasks(
  projectId: string,
  options?: { signal?: AbortSignal; force?: boolean; includeAcceptanceImpact?: boolean },
) {
  if (!projectId) return [] as Task[]

  if (!options?.force) {
    const cached = getCachedTasks(projectId)
    if (cached) {
      return cached
    }

    const inflight = projectTaskPrefetchInflight.get(projectId)
    if (inflight) {
      return inflight
    }
  }

  const params = new URLSearchParams({ projectId, surface: 'task_list' })
  if (options?.includeAcceptanceImpact === false) {
    params.set('acceptance_impact', 'false')
  }

  const timedRequest = createPrefetchSignal(options?.signal)
  const request = apiGet<ApiTask[]>(
    `/api/tasks?${params.toString()}`,
    { signal: timedRequest.signal },
  )
    .then((data) => {
      const tasks = (Array.isArray(data) ? data : []).map(normalizeTask)
      projectTaskPrefetchCache.set(projectId, {
        tasks,
        cachedAt: Date.now(),
      })
      return tasks
    })
    .catch((error) => {
      if (timedRequest.didTimeout() && !options?.signal?.aborted) {
        throw new Error('任务列表加载超时，请稍后重试')
      }
      throw error
    })
    .finally(() => {
      timedRequest.cleanup()
      if (projectTaskPrefetchInflight.get(projectId) === request) {
        projectTaskPrefetchInflight.delete(projectId)
      }
    })

  projectTaskPrefetchInflight.set(projectId, request)
  return request
}
