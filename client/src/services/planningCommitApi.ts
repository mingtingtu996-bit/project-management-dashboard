import { apiPost } from '@/lib/apiClient'
import type {
  PlanningTableCommitRequest,
  PlanningTableCommitResponse,
} from '@/components/planning/PlanningCommitModel'

function createPlanningCommitRequestId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID()
  }
  return `planning-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export async function commitPlanningTable<T = unknown>(
  payload: PlanningTableCommitRequest,
  options?: RequestInit,
): Promise<PlanningTableCommitResponse<T>> {
  const resourceId = payload.resourceId ?? payload.surfaceId
  const endpoint = payload.surface === 'task_list'
    ? '/api/tasks/commit'
    : payload.surface === 'baseline'
      ? `/api/task-baselines/${resourceId}/commit`
      : `/api/monthly-plans/${resourceId}/commit`

  if (payload.surface !== 'task_list' && !resourceId) {
    throw new Error('planning commit resourceId is required for baseline and monthly plan surfaces')
  }

  if (payload.surface !== 'task_list') {
    return apiPost<PlanningTableCommitResponse<T>>(endpoint, payload, options)
  }

  const headers = new Headers(options?.headers)
  const bodyRequestId = typeof payload.clientContext?.requestId === 'string'
    ? payload.clientContext.requestId.trim()
    : ''
  const headerRequestId = String(headers.get('Idempotency-Key') ?? '').trim()
  if (bodyRequestId && headerRequestId && bodyRequestId !== headerRequestId) {
    throw new Error('planning commit idempotency key mismatch')
  }
  const requestId = bodyRequestId || headerRequestId || createPlanningCommitRequestId()
  headers.set('Idempotency-Key', requestId)

  return apiPost<PlanningTableCommitResponse<T>>(endpoint, {
    ...payload,
    clientContext: {
      ...(payload.clientContext ?? {}),
      requestId,
    },
  }, {
    ...options,
    headers,
  })
}

export async function commitTaskListTable<T = unknown>(
  payload: Omit<PlanningTableCommitRequest, 'surface'>,
  options?: RequestInit,
): Promise<PlanningTableCommitResponse<T>> {
  return commitPlanningTable<T>({ ...payload, surface: 'task_list' }, options)
}
