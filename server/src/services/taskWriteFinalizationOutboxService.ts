import { query } from '../database.js'
import type { Task } from '../types/db.js'

export type TaskWriteFinalizationQueryExec = (
  sql: string,
  params?: unknown[],
) => Promise<any[]>

type TaskWriteFinalizer = (
  task: Task,
  previousTask?: Task | null,
  actorId?: string | null,
) => Promise<unknown> | unknown

type TaskWriteFinalizationOutboxRow = {
  id: unknown
  previous_task: unknown
  next_task: unknown
  actor_user_id?: unknown
}

type DrainInput = {
  queryExec?: TaskWriteFinalizationQueryExec
  finalize: TaskWriteFinalizer
  ownerId: string
  now?: string
  limit?: number
  maxBatches?: number
  backlogAgeGateMs?: number
  signal?: AbortSignal
}

export type DrainTaskWriteFinalizationOutboxResult = {
  claimed: number
  completed: number
  failed: number
  failureIds: string[]
  batches: number
  maxBatches: number
  backlogCount: number
  readyBacklogCount: number
  failedBacklogCount: number
  expiredProcessingCount: number
  oldestPendingAt: string | null
  oldestPendingAgeSeconds: number | null
  backlogAgeExceeded: boolean
}

const DEFAULT_BACKLOG_AGE_GATE_MS = 5 * 60 * 1_000

const defaultQueryExec: TaskWriteFinalizationQueryExec = async (sql: string, params: unknown[] = []) => {
  const result = await query(sql, params)
  return result.rows
}

function boundedInteger(value: unknown, fallback: number, maximum: number) {
  const parsed = Math.trunc(Number(value))
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, maximum) : fallback
}

function text(value: unknown) {
  return String(value ?? '').trim()
}

function throwIfAborted(signal?: AbortSignal) {
  if (!signal?.aborted) return
  throw signal.reason instanceof Error
    ? signal.reason
    : new Error('task_write_finalization_outbox_drain_aborted')
}

function asTask(value: unknown, label: string): Task {
  if (!value || typeof value !== 'object' || !text((value as { id?: unknown }).id)) {
    throw new Error(`task_write_finalization_outbox_${label}_invalid`)
  }
  return value as Task
}

async function claimRows(input: Required<Pick<DrainInput, 'ownerId' | 'now' | 'limit'>> & {
  queryExec: TaskWriteFinalizationQueryExec
}) {
  return await input.queryExec(
    `/* task-write-finalization-outbox:claim */
     with selected as (
       select outbox.id
         from public.task_write_finalization_outbox outbox
        where (
          (outbox.processing_status in ('pending', 'failed')
            and outbox.next_attempt_at <= $1::timestamptz)
          or (outbox.processing_status = 'processing'
            and outbox.lease_expires_at <= $1::timestamptz)
        )
          and not exists (
            select 1
              from public.task_write_finalization_outbox earlier
             where earlier.task_id = outbox.task_id
               and earlier.processing_status <> 'completed'
               and earlier.sequence_id < outbox.sequence_id
          )
        order by outbox.sequence_id asc
        for update skip locked
        limit $2
     )
     update public.task_write_finalization_outbox outbox
        set processing_status = 'processing',
            attempt_count = outbox.attempt_count + 1,
            lease_owner = $3,
            lease_expires_at = $1::timestamptz + interval '10 minutes',
            last_error = null,
            updated_at = $1::timestamptz
       from selected
      where outbox.id = selected.id
     returning outbox.*`,
    [input.now, input.limit, input.ownerId],
  ) as TaskWriteFinalizationOutboxRow[]
}

export async function drainTaskWriteFinalizationOutbox(
  input: DrainInput,
): Promise<DrainTaskWriteFinalizationOutboxResult> {
  throwIfAborted(input.signal)
  const ownerId = text(input.ownerId)
  if (!ownerId) throw new Error('task_write_finalization_outbox_owner_required')
  const now = input.now ?? new Date().toISOString()
  const limit = boundedInteger(input.limit, 50, 100)
  const maxBatches = boundedInteger(input.maxBatches, 1, 20)
  const queryExec = input.queryExec ?? defaultQueryExec
  const result: DrainTaskWriteFinalizationOutboxResult = {
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
    const rows = await claimRows({
      queryExec,
      ownerId,
      now,
      limit,
    })
    result.batches += 1
    result.claimed += rows.length
    if (rows.length === 0) break

    for (const row of rows) {
      throwIfAborted(input.signal)
      const id = text(row.id)
      const previousTask = asTask(row.previous_task, 'previous_task')
      const nextTask = asTask(row.next_task, 'next_task')
      const actorId = text(row.actor_user_id) || null
      try {
        await input.finalize(nextTask, previousTask, actorId)
        throwIfAborted(input.signal)
        const completed = await queryExec(
          `/* task-write-finalization-outbox:complete */
           update public.task_write_finalization_outbox
              set processing_status = 'completed',
                  lease_owner = null,
                  lease_expires_at = null,
                  completed_at = $3::timestamptz,
                  updated_at = $3::timestamptz
            where id = $1::uuid
              and processing_status = 'processing'
              and lease_owner = $2
          returning id`,
          [id, ownerId, now],
        )
        if (completed.length !== 1) {
          throw new Error('task_write_finalization_outbox_completion_cas_failed')
        }
        result.completed += 1
      } catch (error) {
        throwIfAborted(input.signal)
        const errorMessage = error instanceof Error ? error.message : String(error)
        const failed = await queryExec(
          `/* task-write-finalization-outbox:fail */
           update public.task_write_finalization_outbox
              set processing_status = 'failed',
                  lease_owner = null,
                  lease_expires_at = null,
                  next_attempt_at = $3::timestamptz + interval '1 minute',
                  last_error = $4,
                  updated_at = $3::timestamptz
            where id = $1::uuid
              and processing_status = 'processing'
              and lease_owner = $2
          returning id`,
          [id, ownerId, now, errorMessage.slice(0, 2000)],
        )
        if (failed.length !== 1) throw error
        result.failed += 1
        result.failureIds.push(id)
      }
    }
  }

  throwIfAborted(input.signal)
  const backlogRows = await queryExec(
    `/* task-write-finalization-outbox:backlog */
     select count(*) filter (
              where processing_status in ('pending', 'failed')
            )::integer as backlog_count,
            count(*) filter (
              where processing_status in ('pending', 'failed')
                and next_attempt_at <= $1::timestamptz
                and not exists (
                  select 1
                    from public.task_write_finalization_outbox earlier
                   where earlier.task_id = outbox.task_id
                     and earlier.processing_status <> 'completed'
                     and earlier.sequence_id < outbox.sequence_id
                )
            )::integer as ready_backlog_count,
            count(*) filter (
              where processing_status = 'failed'
            )::integer as failed_backlog_count,
            count(*) filter (
              where processing_status = 'processing'
                and lease_expires_at <= $1::timestamptz
                and not exists (
                  select 1
                    from public.task_write_finalization_outbox earlier
                   where earlier.task_id = outbox.task_id
                     and earlier.processing_status <> 'completed'
                     and earlier.sequence_id < outbox.sequence_id
                )
            )::integer as expired_processing_count,
            min(created_at) filter (
              where processing_status in ('pending', 'failed')
            ) as oldest_pending_at
       from public.task_write_finalization_outbox outbox
      where processing_status in ('pending', 'failed')
         or (processing_status = 'processing' and lease_expires_at <= $1::timestamptz)`,
    [now],
  )
  throwIfAborted(input.signal)
  const backlog = (backlogRows[0] ?? {}) as {
    backlog_count?: unknown
    ready_backlog_count?: unknown
    failed_backlog_count?: unknown
    expired_processing_count?: unknown
    oldest_pending_at?: unknown
  }
  result.backlogCount = Number(backlog.backlog_count ?? 0)
  result.readyBacklogCount = Number(backlog.ready_backlog_count ?? 0)
  result.failedBacklogCount = Number(backlog.failed_backlog_count ?? 0)
  result.expiredProcessingCount = Number(backlog.expired_processing_count ?? 0)
  result.oldestPendingAt = text(backlog.oldest_pending_at) || null
  if (result.oldestPendingAt) {
    const oldestMs = Date.parse(result.oldestPendingAt)
    const nowMs = Date.parse(now)
    if (Number.isFinite(oldestMs) && Number.isFinite(nowMs) && nowMs >= oldestMs) {
      result.oldestPendingAgeSeconds = Math.floor((nowMs - oldestMs) / 1_000)
      result.backlogAgeExceeded = nowMs - oldestMs > boundedInteger(
        input.backlogAgeGateMs,
        DEFAULT_BACKLOG_AGE_GATE_MS,
        24 * 60 * 60 * 1_000,
      )
    }
  }
  return result
}
