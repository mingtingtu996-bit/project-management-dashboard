import { isDatabaseTransactionActive, query } from '../database.js'
import { buildCanonicalJsonHash } from '../utils/canonicalJsonHash.js'

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
  recommendation_id?: string | null
  recommendation_hash?: string | null
  operations_hash?: string | null
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

export function buildTaskCommitRequestHash(input: unknown): string {
  return buildCanonicalJsonHash(input)
}

export function buildTaskCommitOperationsHash(operations: unknown): string {
  return buildCanonicalJsonHash(operations)
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
  recommendationId?: string | null
  recommendationHash?: string | null
  operationsHash?: string | null
}): Promise<TaskCommitReservation> {
  requireTransaction()

  const recommendationId = String(input.recommendationId ?? '').trim() || null
  const recommendationHash = String(input.recommendationHash ?? '').trim() || null
  const operationsHash = String(input.operationsHash ?? '').trim() || null
  const bindingParts = [recommendationId, recommendationHash, operationsHash].filter(Boolean)
  if (bindingParts.length > 0 && bindingParts.length !== 3) {
    throw createHttpError(
      'Acceleration recommendation commit binding must include identity, proposal hash, and operations hash.',
      'ACCELERATION_RECOMMENDATION_BINDING_INVALID',
      400,
    )
  }

  let inserted
  try {
    inserted = await query(`
      INSERT INTO public.task_commit_requests (
        project_id,
        request_id,
        request_hash,
        requested_by,
        status,
        recommendation_id,
        recommendation_hash,
        operations_hash
      )
      VALUES ($1, $2, $3, $4, 'running', $5, $6, $7)
      ON CONFLICT (project_id, request_id) DO NOTHING
      RETURNING id, project_id, request_id, request_hash, status, result_summary,
                recommendation_id, recommendation_hash, operations_hash
    `, [
      input.projectId,
      input.requestId,
      input.requestHash,
      input.requestedBy ?? null,
      recommendationId,
      recommendationHash,
      operationsHash,
    ])
  } catch (error) {
    const errorRecord = error && typeof error === 'object' ? error as Record<string, unknown> : {}
    const message = error instanceof Error ? error.message : String(error ?? '')
    if (String(errorRecord.code ?? '') === '23503' || /foreign key|recommendation/i.test(message)) {
      throw createHttpError(
        'The acceleration recommendation does not match the submitted task operations.',
        'ACCELERATION_RECOMMENDATION_BINDING_INVALID',
        409,
      )
    }
    throw error
  }

  const insertedRow = inserted.rows[0] as TaskCommitRequestRow | undefined
  if (insertedRow) return { kind: 'reserved', id: String(insertedRow.id) }

  const existing = await query(`
    SELECT id, project_id, request_id, request_hash, status, result_summary,
           recommendation_id, recommendation_hash, operations_hash
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
  if (
    String(row.recommendation_id ?? '').trim() !== (recommendationId ?? '')
    || String(row.recommendation_hash ?? '').trim() !== (recommendationHash ?? '')
    || String(row.operations_hash ?? '').trim() !== (operationsHash ?? '')
  ) {
    throw createHttpError(
      'The idempotency key has already been used with a different acceleration recommendation binding.',
      'ACCELERATION_RECOMMENDATION_BINDING_MISMATCH',
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
