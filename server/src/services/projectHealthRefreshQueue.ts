import type {
  ProjectHealthRefreshFailure,
  ProjectHealthRefreshQueueStatus,
} from '../types/runtimeHealth.js'

export type {
  ProjectHealthRefreshFailure,
  ProjectHealthRefreshQueueStatus,
} from '../types/runtimeHealth.js'

type ProjectHealthRefreshQueueItem = {
  projectId: string
  triggers: Set<string>
}

type ProjectHealthRefreshQueueOptions = {
  refresh: (projectId: string) => Promise<unknown>
  maxAttempts?: number
  retryDelayMs?: number
  now?: () => Date
  sleep?: (delayMs: number) => Promise<void>
  onAttemptFailure?: (failure: ProjectHealthRefreshFailure) => void
}

function normalizePositiveInteger(value: number | undefined, fallback: number) {
  return Number.isFinite(value) && Number(value) > 0 ? Math.floor(Number(value)) : fallback
}

function normalizeNonNegativeInteger(value: number | undefined, fallback: number) {
  return Number.isFinite(value) && Number(value) >= 0 ? Math.floor(Number(value)) : fallback
}

function defaultSleep(delayMs: number) {
  if (delayMs <= 0) return Promise.resolve()
  return new Promise<void>((resolve) => setTimeout(resolve, delayMs))
}

export function createProjectHealthRefreshQueue(options: ProjectHealthRefreshQueueOptions) {
  const maxAttempts = normalizePositiveInteger(options.maxAttempts, 3)
  const retryDelayMs = normalizeNonNegativeInteger(options.retryDelayMs, 1_000)
  const now = options.now ?? (() => new Date())
  const sleep = options.sleep ?? defaultSleep
  const pending = new Map<string, ProjectHealthRefreshQueueItem>()
  const failedByProject = new Map<string, ProjectHealthRefreshFailure>()
  let activeItem: ProjectHealthRefreshQueueItem | null = null
  let processing: Promise<void> | null = null
  let lastFailure: ProjectHealthRefreshFailure | null = null

  const describeTrigger = (item: ProjectHealthRefreshQueueItem) => (
    Array.from(item.triggers).join(',') || 'event'
  )

  const runItem = async (item: ProjectHealthRefreshQueueItem) => {
    let attempt = 0
    while (attempt < maxAttempts) {
      attempt += 1
      try {
        await options.refresh(item.projectId)
        failedByProject.delete(item.projectId)
        return
      } catch (error) {
        const failure: ProjectHealthRefreshFailure = {
          projectId: item.projectId,
          trigger: describeTrigger(item),
          attempts: attempt,
          failedAt: now().toISOString(),
          error: error instanceof Error ? error.message : String(error),
        }
        lastFailure = failure
        options.onAttemptFailure?.(failure)
        if (attempt < maxAttempts) await sleep(retryDelayMs)
        else failedByProject.set(item.projectId, failure)
      }
    }
  }

  const runPending = async () => {
    while (pending.size > 0) {
      const next = pending.entries().next().value as [string, ProjectHealthRefreshQueueItem] | undefined
      if (!next) return
      const [projectId, item] = next
      pending.delete(projectId)
      activeItem = item
      try {
        await runItem(item)
      } finally {
        activeItem = null
      }
    }
  }

  const start = () => {
    if (processing || pending.size === 0) return
    processing = runPending().finally(() => {
      processing = null
      if (pending.size > 0) start()
    })
  }

  const enqueue = (projectIdValue: string, triggerValue = 'event') => {
    const projectId = String(projectIdValue ?? '').trim()
    if (!projectId) return
    const trigger = String(triggerValue ?? '').trim() || 'event'
    const queued = pending.get(projectId)
    if (queued) {
      queued.triggers.add(trigger)
      return
    }

    pending.set(projectId, { projectId, triggers: new Set([trigger]) })
    start()
  }

  const drain = async () => {
    while (processing || pending.size > 0) {
      if (!processing) start()
      if (processing) await processing
    }
  }

  const getStatus = (): ProjectHealthRefreshQueueStatus => ({
    healthy: failedByProject.size === 0,
    activeProjectId: activeItem?.projectId ?? null,
    queuedProjectCount: pending.size,
    failedProjectCount: failedByProject.size,
    lastFailure,
  })

  return { enqueue, drain, getStatus }
}
