import { apiGet } from '@/lib/apiClient'
import type { Task } from '@/lib/supabase'

type ApiTask = Partial<Task> & Record<string, unknown> & {
  assignee_id?: string | null
  assignee_name?: string | null
  assignee_unit?: string | null
  responsible_unit?: string | null
  progress?: number | string | null
  is_milestone?: boolean | null
}

const PROJECT_TASK_PREFETCH_TTL_MS = 15_000

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
    name: task.title ?? '',
    start_date: task.start_date ?? task.planned_start_date ?? null,
    end_date: task.end_date ?? task.planned_end_date ?? null,
    planned_start_date: task.planned_start_date ?? task.start_date ?? null,
    planned_end_date: task.planned_end_date ?? task.end_date ?? null,
    assignee: task.assignee_name ?? '',
    assignee_user_id: task.assignee_user_id ?? task.assignee_id ?? null,
    assignee_name: task.assignee_name ?? '',
    assignee_unit: task.assignee_unit ?? '',
    responsible_unit: task.responsible_unit ?? '',
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

export function getPrefetchedProjectTasks(projectId: string) {
  return getCachedTasks(projectId)
}

export async function prefetchProjectTasks(
  projectId: string,
  options?: { signal?: AbortSignal; force?: boolean },
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

  const request = apiGet<ApiTask[]>(
    `/api/tasks?projectId=${encodeURIComponent(projectId)}`,
    options?.signal ? { signal: options.signal } : undefined,
  )
    .then((data) => {
      const tasks = (Array.isArray(data) ? data : []).map(normalizeTask)
      projectTaskPrefetchCache.set(projectId, {
        tasks,
        cachedAt: Date.now(),
      })
      return tasks
    })
    .finally(() => {
      if (projectTaskPrefetchInflight.get(projectId) === request) {
        projectTaskPrefetchInflight.delete(projectId)
      }
    })

  projectTaskPrefetchInflight.set(projectId, request)
  return request
}
