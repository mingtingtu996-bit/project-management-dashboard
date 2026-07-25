import type { Task } from '../types/db.js'
import { query as databaseQuery } from '../database.js'

const DEFAULT_LEASE_MS = 10 * 60 * 1_000

type QueryResultLike<T> = {
  rows?: T[]
  rowCount?: number | null
}

export type TaskWriteFinalizationQueryExecutor = <T = Record<string, unknown>>(
  text: string,
  params?: unknown[],
) => Promise<QueryResultLike<T>>

export type TaskWriteFinalizationOutboxItem = {
  id: string
  companyId: string
  projectId: string
  taskId: string
  actorId: string | null
  previousTask: Task
  nextTask: Task
  attemptCount: number
  createdAt: string
}

export type TaskWriteFinalizationBacklog = {
  backlogCount: number
  readyBacklogCount: number
  failedBacklogCount: number
  expiredProcessingCount: number
  oldestPendingAt: string | null
}

export interface TaskWriteFinalizationOutboxStore {
  claim(input: {
    ownerId: string
    now: string
    limit: number
    taskId?: string | null
  }): Promise<TaskWriteFinalizationOutboxItem[]>
  complete(input: { id: string; ownerId: string; now: string }): Promise<boolean>
  fail(input: {
    id: string
    ownerId: string
    now: string
    nextAttemptAt: string
    error: string
  }): Promise<boolean>
  backlog(input: { now: string; taskId?: string | null }): Promise<TaskWriteFinalizationBacklog>
}

export type FinalizeTaskWrite = (
  task: Task,
  previousTask?: Task | null,
  actorId?: string | null,
) => Promise<unknown> | unknown

export type ProcessTaskWriteFinalizationOutboxResult = {
  claimed: number
  completed: number
  failed: number
  failureIds: string[]
}

export type DrainTaskWriteFinalizationOutboxResult = ProcessTaskWriteFinalizationOutboxResult
  & TaskWriteFinalizationBacklog
  & {
    batches: number
    maxBatches: number
    oldestPendingAgeSeconds: number | null
    backlogAgeExceeded: boolean
  }

type ProcessTaskWriteFinalizationOutboxInput = {
  store?: TaskWriteFinalizationOutboxStore
  ownerId: string
  now?: string
  limit?: number
  taskId?: string | null
  finalize: FinalizeTaskWrite
  signal?: AbortSignal
}

type DrainTaskWriteFinalizationOutboxInput = ProcessTaskWriteFinalizationOutboxInput & {
  maxBatches?: number
  backlogAgeGateMs?: number
}

type TaskWriteFinalizationOutboxRow = Record<string, unknown> & {
  id?: unknown
  company_id?: unknown
  project_id?: unknown
  task_id?: unknown
  actor_id?: unknown
  previous_task?: unknown
  next_task?: unknown
  attempt_count?: unknown
  created_at?: unknown
}

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

function positiveInteger(value: unknown, fallback: number, maximum: number) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback
  return Math.min(maximum, Math.max(1, Math.trunc(parsed)))
}

function errorMessage(error: unknown) {
  return (error instanceof Error ? error.message : String(error ?? 'unknown error')).slice(0, 2_000)
}

function throwIfAborted(signal?: AbortSignal) {
  if (!signal?.aborted) return
  if (signal.reason instanceof Error) throw signal.reason
  throw new Error(normalizeText(signal.reason) || 'task_write_finalization_outbox_aborted')
}

function retryAt(now: string, attemptCount: number) {
  const nowMs = Date.parse(now)
  const baseMs = Number.isFinite(nowMs) ? nowMs : Date.now()
  const delayMs = Math.min(24 * 60 * 60 * 1_000, 60 * 1_000 * (2 ** Math.max(0, attemptCount - 1)))
  return new Date(baseMs + delayMs).toISOString()
}

function mapOutboxItem(row: TaskWriteFinalizationOutboxRow): TaskWriteFinalizationOutboxItem {
  return {
    id: normalizeText(row.id),
    companyId: normalizeText(row.company_id),
    projectId: normalizeText(row.project_id),
    taskId: normalizeText(row.task_id),
    actorId: normalizeText(row.actor_id) || null,
    previousTask: row.previous_task as Task,
    nextTask: row.next_task as Task,
    attemptCount: Math.max(0, Number(row.attempt_count) || 0),
    createdAt: normalizeText(row.created_at),
  }
}

export function createDatabaseTaskWriteFinalizationOutboxStore(
  queryExec: TaskWriteFinalizationQueryExecutor = databaseQuery as TaskWriteFinalizationQueryExecutor,
): TaskWriteFinalizationOutboxStore {
  return {
    async claim(input) {
      const result = await queryExec<TaskWriteFinalizationOutboxRow>(
        `/* task-write-finalization-outbox:claim */
         with selected as (
           select outbox.id
             from public.task_write_finalization_outbox outbox
            where (
              (outbox.processing_status in ('pending', 'failed') and outbox.next_attempt_at <= $1::timestamptz)
              or (outbox.processing_status = 'processing' and outbox.lease_expires_at <= $1::timestamptz)
            )
              and ($4::uuid is null or outbox.task_id = $4::uuid)
              and not exists (
                select 1
                  from public.task_write_finalization_outbox older
                 where older.task_id = outbox.task_id
                   and older.processing_status <> 'completed'
                   and (older.created_at, older.id) < (outbox.created_at, outbox.id)
              )
            order by outbox.attempt_count asc, outbox.created_at asc, outbox.id asc
            for update skip locked
            limit $2
         )
         update public.task_write_finalization_outbox outbox
            set processing_status = 'processing',
                attempt_count = outbox.attempt_count + 1,
                lease_owner = $3,
                lease_expires_at = $1::timestamptz + ($5 * interval '1 millisecond'),
                last_error = null,
                updated_at = $1::timestamptz
           from selected
          where outbox.id = selected.id
         returning outbox.*`,
        [input.now, input.limit, input.ownerId, input.taskId ?? null, DEFAULT_LEASE_MS],
      )
      return (result.rows ?? []).map(mapOutboxItem)
    },

    async complete(input) {
      const result = await queryExec<{ id?: unknown }>(
        `/* task-write-finalization-outbox:complete */
         update public.task_write_finalization_outbox
            set processing_status = 'completed',
                lease_owner = null,
                lease_expires_at = null,
                completed_at = $3::timestamptz,
                last_error = null,
                updated_at = $3::timestamptz
          where id = $1::uuid
            and processing_status = 'processing'
            and lease_owner = $2
         returning id`,
        [input.id, input.ownerId, input.now],
      )
      return (result.rowCount ?? result.rows?.length ?? 0) === 1
    },

    async fail(input) {
      const result = await queryExec<{ id?: unknown }>(
        `/* task-write-finalization-outbox:fail */
         update public.task_write_finalization_outbox
            set processing_status = 'failed',
                lease_owner = null,
                lease_expires_at = null,
                next_attempt_at = $4::timestamptz,
                last_error = $5,
                updated_at = $3::timestamptz
          where id = $1::uuid
            and processing_status = 'processing'
            and lease_owner = $2
         returning id`,
        [input.id, input.ownerId, input.now, input.nextAttemptAt, input.error],
      )
      return (result.rowCount ?? result.rows?.length ?? 0) === 1
    },

    async backlog(input) {
      const result = await queryExec<Record<string, unknown>>(
        `/* task-write-finalization-outbox:backlog */
         select count(*) filter (where processing_status in ('pending', 'failed'))::integer as pending_count,
                count(*) filter (
                  where processing_status in ('pending', 'failed')
                    and next_attempt_at <= $1::timestamptz
                )::integer as ready_pending_count,
                count(*) filter (where processing_status = 'failed')::integer as failed_count,
                count(*) filter (
                  where processing_status = 'processing'
                    and lease_expires_at <= $1::timestamptz
                )::integer as expired_processing_count,
                min(created_at) filter (where processing_status in ('pending', 'failed')) as oldest_pending_at
           from public.task_write_finalization_outbox
          where ($2::uuid is null or task_id = $2::uuid)
            and (
              processing_status in ('pending', 'failed')
              or (processing_status = 'processing' and lease_expires_at <= $1::timestamptz)
            )`,
        [input.now, input.taskId ?? null],
      )
      const row = result.rows?.[0] ?? {}
      return {
        backlogCount: Number(row.pending_count ?? 0),
        readyBacklogCount: Number(row.ready_pending_count ?? 0),
        failedBacklogCount: Number(row.failed_count ?? 0),
        expiredProcessingCount: Number(row.expired_processing_count ?? 0),
        oldestPendingAt: normalizeText(row.oldest_pending_at) || null,
      }
    },
  }
}

export async function processTaskWriteFinalizationOutbox(
  input: ProcessTaskWriteFinalizationOutboxInput,
): Promise<ProcessTaskWriteFinalizationOutboxResult> {
  throwIfAborted(input.signal)
  const ownerId = normalizeText(input.ownerId)
  if (!ownerId) throw new Error('task_write_finalization_outbox_owner_required')
  const now = input.now ?? new Date().toISOString()
  const limit = positiveInteger(input.limit, 50, 100)
  const store = input.store ?? createDatabaseTaskWriteFinalizationOutboxStore()
  const finalize = input.finalize
  const claimed = await store.claim({
    ownerId,
    now,
    limit,
    taskId: normalizeText(input.taskId) || null,
  })
  throwIfAborted(input.signal)

  const result: ProcessTaskWriteFinalizationOutboxResult = {
    claimed: claimed.length,
    completed: 0,
    failed: 0,
    failureIds: [],
  }

  for (const item of claimed) {
    throwIfAborted(input.signal)
    try {
      if (!item.id || !item.taskId || !item.previousTask || !item.nextTask) {
        throw new Error('task_write_finalization_outbox_payload_invalid')
      }
      if (normalizeText(item.nextTask.id) !== item.taskId || normalizeText(item.previousTask.id) !== item.taskId) {
        throw new Error('task_write_finalization_outbox_task_identity_mismatch')
      }
      await finalize(item.nextTask, item.previousTask, item.actorId)
      throwIfAborted(input.signal)
      const completed = await store.complete({ id: item.id, ownerId, now })
      if (!completed) throw new Error(`task_write_finalization_outbox_lease_lost:${item.id}`)
      result.completed += 1
    } catch (error) {
      const failure = errorMessage(error)
      await store.fail({
        id: item.id,
        ownerId,
        now,
        nextAttemptAt: retryAt(now, item.attemptCount),
        error: failure,
      })
      result.failed += 1
      result.failureIds.push(item.id)
      throwIfAborted(input.signal)
    }
  }

  return result
}

export async function drainTaskWriteFinalizationOutbox(
  input: DrainTaskWriteFinalizationOutboxInput,
): Promise<DrainTaskWriteFinalizationOutboxResult> {
  throwIfAborted(input.signal)
  const store = input.store ?? createDatabaseTaskWriteFinalizationOutboxStore()
  const now = input.now ?? new Date().toISOString()
  const maxBatches = positiveInteger(input.maxBatches, 4, 20)
  const aggregate: DrainTaskWriteFinalizationOutboxResult = {
    claimed: 0,
    completed: 0,
    failed: 0,
    failureIds: [],
    batches: 0,
    maxBatches,
    backlogCount: 0,
    readyBacklogCount: 0,
    failedBacklogCount: 0,
    expiredProcessingCount: 0,
    oldestPendingAt: null,
    oldestPendingAgeSeconds: null,
    backlogAgeExceeded: false,
  }

  for (let batch = 0; batch < maxBatches; batch += 1) {
    throwIfAborted(input.signal)
    const result = await processTaskWriteFinalizationOutbox({ ...input, store, now })
    aggregate.batches += 1
    aggregate.claimed += result.claimed
    aggregate.completed += result.completed
    aggregate.failed += result.failed
    aggregate.failureIds.push(...result.failureIds)
    if (result.claimed === 0) break
  }

  throwIfAborted(input.signal)
  const backlog = await store.backlog({ now, taskId: normalizeText(input.taskId) || null })
  throwIfAborted(input.signal)
  Object.assign(aggregate, backlog)
  if (backlog.oldestPendingAt) {
    const oldestMs = Date.parse(backlog.oldestPendingAt)
    const nowMs = Date.parse(now)
    if (Number.isFinite(oldestMs) && Number.isFinite(nowMs) && nowMs >= oldestMs) {
      aggregate.oldestPendingAgeSeconds = Math.floor((nowMs - oldestMs) / 1_000)
      const ageGateMs = Math.max(0, Number(input.backlogAgeGateMs ?? 60 * 60 * 1_000))
      aggregate.backlogAgeExceeded = nowMs - oldestMs > ageGateMs
    }
  }
  return aggregate
}
