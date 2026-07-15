import { createHash } from 'node:crypto'

import { isDatabaseTransactionActive, query } from '../database.js'

export interface TaskCommitReplaySummary {
  createdRowCount: number
  deletedRowCount: number
  changedRowCount: number
  tempIdMap: Record<string, string>
  deletionResults: Array<Record<string, unknown>>
}

type TaskCommitRequestRow = {
  id: string
  project_id: string
  request_id: string
  request_hash: string
  status: 'running' | 'succeeded'
  result_summary?: unknown
}

export type TaskCommitReservation =
  | { kind: 'reserved'; id: string }
  | { kind: 'replay'; id: string; summary: TaskCommitReplaySummary }

export function buildTaskCommitReplaySummary(input: {
  changedTaskIds: ReadonlySet<string>
  deletedTaskIds: ReadonlySet<string>
  tempIdMap: ReadonlyMap<string, string>
  deletionResults: Array<Record<string, unknown>>
}): TaskCommitReplaySummary {
  return {
    createdRowCount: input.tempIdMap.size,
    deletedRowCount: input.deletedTaskIds.size,
    changedRowCount: input.changedTaskIds.size + input.deletedTaskIds.size,
    tempIdMap: Object.fromEntries(input.tempIdMap.entries()),
    deletionResults: input.deletionResults,
  }
}

function createHttpError(message: string, code: string, statusCode: number): Error {
  return Object.assign(new Error(message), { code, statusCode })
}

function requireTransaction(): void {
  if (isDatabaseTransactionActive()) return
  throw createHttpError(
    'Task commit idempotency must run inside the task mutation transaction.',
    'TASK_COMMIT_TRANSACTION_REQUIRED',
    500,
  )
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (value instanceof Date) return value.toISOString()
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, item]) => item !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalize(item)]),
    )
  }
  if (typeof value === 'number' && !Number.isFinite(value)) return null
  if (typeof value === 'bigint') return value.toString()
  return value
}

export function buildTaskCommitRequestHash(input: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(canonicalize(input)))
    .digest('hex')
}

function normalizeCount(value: unknown): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? Math.trunc(parsed) : 0
}

function normalizeReplaySummary(value: unknown): TaskCommitReplaySummary {
  const record = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
  const rawTempIdMap = record.tempIdMap && typeof record.tempIdMap === 'object' && !Array.isArray(record.tempIdMap)
    ? record.tempIdMap as Record<string, unknown>
    : {}

  return {
    createdRowCount: normalizeCount(record.createdRowCount),
    deletedRowCount: normalizeCount(record.deletedRowCount),
    changedRowCount: normalizeCount(record.changedRowCount),
    tempIdMap: Object.fromEntries(
      Object.entries(rawTempIdMap)
        .map(([clientId, taskId]) => [String(clientId), String(taskId ?? '').trim()])
        .filter(([, taskId]) => Boolean(taskId)),
    ),
    deletionResults: Array.isArray(record.deletionResults)
      ? record.deletionResults.filter((item): item is Record<string, unknown> => (
        Boolean(item) && typeof item === 'object' && !Array.isArray(item)
      ))
      : [],
  }
}

export async function reserveTaskCommitRequest(input: {
  projectId: string
  requestId: string
  requestHash: string
  requestedBy?: string | null
}): Promise<TaskCommitReservation> {
  requireTransaction()

  const inserted = await query(`
    INSERT INTO public.task_commit_requests (
      project_id,
      request_id,
      request_hash,
      requested_by,
      status
    )
    VALUES ($1, $2, $3, $4, 'running')
    ON CONFLICT (project_id, request_id) DO NOTHING
    RETURNING id, project_id, request_id, request_hash, status, result_summary
  `, [input.projectId, input.requestId, input.requestHash, input.requestedBy ?? null])

  const insertedRow = inserted.rows[0] as TaskCommitRequestRow | undefined
  if (insertedRow) return { kind: 'reserved', id: String(insertedRow.id) }

  const existing = await query(`
    SELECT id, project_id, request_id, request_hash, status, result_summary
      FROM public.task_commit_requests
     WHERE project_id = $1
       AND request_id = $2
     LIMIT 1
  `, [input.projectId, input.requestId])
  const row = existing.rows[0] as TaskCommitRequestRow | undefined
  if (!row) {
    throw createHttpError(
      'Task commit reservation could not be read after an idempotency conflict.',
      'TASK_COMMIT_RESERVATION_MISSING',
      500,
    )
  }
  if (String(row.request_hash) !== input.requestHash) {
    throw createHttpError(
      'The idempotency key has already been used for a different task commit.',
      'IDEMPOTENCY_KEY_REUSED',
      409,
    )
  }
  if (row.status === 'succeeded') {
    return {
      kind: 'replay',
      id: String(row.id),
      summary: normalizeReplaySummary(row.result_summary),
    }
  }
  throw createHttpError(
    'A task commit with this idempotency key is already in progress.',
    'TASK_COMMIT_IN_PROGRESS',
    409,
  )
}

export async function completeTaskCommitRequest(input: {
  projectId: string
  requestId: string
  requestHash: string
  summary: TaskCommitReplaySummary
}): Promise<void> {
  requireTransaction()

  const completed = await query(`
    UPDATE public.task_commit_requests
       SET status = 'succeeded',
           result_summary = $4::jsonb,
           completed_at = NOW(),
           updated_at = NOW()
     WHERE project_id = $1
       AND request_id = $2
       AND request_hash = $3
       AND status = 'running'
    RETURNING id
  `, [
    input.projectId,
    input.requestId,
    input.requestHash,
    JSON.stringify(normalizeReplaySummary(input.summary)),
  ])

  if (completed.rows[0]) return
  throw createHttpError(
    'Task commit idempotency reservation is not in a completable state.',
    'TASK_COMMIT_RESERVATION_STATE_CONFLICT',
    409,
  )
}
