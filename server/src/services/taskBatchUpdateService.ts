import { createHash, randomUUID } from 'node:crypto'

import { getClient } from '../database.js'
import { logger } from '../middleware/logger.js'
import type { Task } from '../types/db.js'
import { broadcastProjectTasksChanged } from './planningRealtimeEventService.js'
import { updateTaskInMainChain } from './taskWriteChainService.js'

const JOB_LEASE_SECONDS = 120
const ITEM_LEASE_SECONDS = 120

type QueryClient = Awaited<ReturnType<typeof getClient>>

type TaskBatchUpdateJobStatus = 'pending' | 'running' | 'succeeded' | 'partial_failed' | 'failed'
type TaskBatchUpdateItemStatus = 'pending' | 'running' | 'succeeded' | 'failed' | 'conflict'

type TaskBatchUpdateJobRow = {
  id: string
  project_id: string
  requested_by?: string | null
  idempotency_key?: string | null
  request_hash?: string | null
  status: TaskBatchUpdateJobStatus
  accepted_count?: number | string | null
  succeeded_count?: number | string | null
  failed_count?: number | string | null
  attempt_count?: number | string | null
  last_error?: string | null
  created_at?: string | Date | null
  started_at?: string | Date | null
  completed_at?: string | Date | null
  updated_at?: string | Date | null
}

type TaskBatchUpdateItemRow = {
  id: string
  job_id: string
  project_id: string
  task_id: string
  status: TaskBatchUpdateItemStatus
  expected_version: number | string
  target_patch: Record<string, unknown> | string
  result_version?: number | string | null
  attempt_count?: number | string | null
  error_code?: string | null
  error_message?: string | null
  created_at?: string | Date | null
  completed_at?: string | Date | null
  updated_at?: string | Date | null
}

type SourceTaskRow = Pick<
  Task,
  | 'id'
  | 'project_id'
  | 'version'
  | 'start_date'
  | 'end_date'
  | 'planned_start_date'
  | 'planned_end_date'
>

export type CreateTaskBatchUpdateJobInput = {
  projectId: string
  taskIds: string[]
  requestedBy?: string | null
  idempotencyKey: string
  status?: string | null
  assigneeName?: string | null
  assigneeUserId?: string | null
  participantUnitId?: string | null
  dateShiftDays?: number | null
}

export type TaskBatchUpdateItem = {
  id: string
  jobId: string
  projectId: string
  taskId: string
  status: TaskBatchUpdateItemStatus
  expectedVersion: number
  targetPatch: Record<string, unknown>
  resultVersion: number | null
  attemptCount: number
  errorCode: string | null
  errorMessage: string | null
  createdAt: string | null
  completedAt: string | null
  updatedAt: string | null
}

export type TaskBatchUpdateJob = {
  id: string
  projectId: string
  requestedBy: string | null
  idempotencyKey: string | null
  requestHash: string | null
  status: TaskBatchUpdateJobStatus
  acceptedCount: number
  succeededCount: number
  failedCount: number
  attemptCount: number
  lastError: string | null
  createdAt: string | null
  startedAt: string | null
  completedAt: string | null
  updatedAt: string | null
  items?: TaskBatchUpdateItem[]
  updatedTaskIds?: string[]
}

function toNumber(value: number | string | null | undefined, fallback = 0): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function toIsoString(value: string | Date | null | undefined): string | null {
  if (!value) return null
  if (value instanceof Date) return value.toISOString()
  return String(value)
}

function mapJobRow(row: TaskBatchUpdateJobRow): TaskBatchUpdateJob {
  return {
    id: String(row.id),
    projectId: String(row.project_id),
    requestedBy: row.requested_by ? String(row.requested_by) : null,
    idempotencyKey: row.idempotency_key ? String(row.idempotency_key) : null,
    requestHash: row.request_hash ? String(row.request_hash) : null,
    status: row.status,
    acceptedCount: toNumber(row.accepted_count),
    succeededCount: toNumber(row.succeeded_count),
    failedCount: toNumber(row.failed_count),
    attemptCount: toNumber(row.attempt_count),
    lastError: row.last_error ? String(row.last_error) : null,
    createdAt: toIsoString(row.created_at),
    startedAt: toIsoString(row.started_at),
    completedAt: toIsoString(row.completed_at),
    updatedAt: toIsoString(row.updated_at),
  }
}

function parseTargetPatch(value: TaskBatchUpdateItemRow['target_patch']): Record<string, unknown> {
  if (value && typeof value === 'object') return value
  try {
    const parsed = JSON.parse(String(value ?? '{}'))
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {}
  } catch {
    return {}
  }
}

function mapItemRow(row: TaskBatchUpdateItemRow): TaskBatchUpdateItem {
  return {
    id: String(row.id),
    jobId: String(row.job_id),
    projectId: String(row.project_id),
    taskId: String(row.task_id),
    status: row.status,
    expectedVersion: toNumber(row.expected_version, 1),
    targetPatch: parseTargetPatch(row.target_patch),
    resultVersion: row.result_version == null ? null : toNumber(row.result_version),
    attemptCount: toNumber(row.attempt_count),
    errorCode: row.error_code ? String(row.error_code) : null,
    errorMessage: row.error_message ? String(row.error_message) : null,
    createdAt: toIsoString(row.created_at),
    completedAt: toIsoString(row.completed_at),
    updatedAt: toIsoString(row.updated_at),
  }
}

function createHttpError(message: string, code: string, statusCode: number): Error {
  return Object.assign(new Error(message), { code, statusCode })
}

function shiftDateOnly(value: string | null | undefined, days: number): string | null {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

function buildTargetPatch(
  task: SourceTaskRow,
  input: CreateTaskBatchUpdateJobInput,
): Record<string, unknown> {
  const patch: Record<string, unknown> = {}

  if (typeof input.status === 'string' && input.status.trim()) {
    patch.status = input.status.trim()
  }
  if (input.assigneeName !== undefined) {
    patch.assignee_name = input.assigneeName ?? null
    patch.assignee = input.assigneeName ?? null
  }
  if (input.assigneeUserId !== undefined) {
    patch.assignee_user_id = input.assigneeUserId ?? null
  }
  if (input.participantUnitId !== undefined) {
    patch.participant_unit_id = input.participantUnitId ?? null
  }

  const shiftDays = Number(input.dateShiftDays ?? 0)
  if (Number.isFinite(shiftDays) && shiftDays !== 0) {
    patch.start_date = shiftDateOnly(task.start_date ?? task.planned_start_date ?? null, shiftDays)
    patch.end_date = shiftDateOnly(task.end_date ?? task.planned_end_date ?? null, shiftDays)
    patch.planned_start_date = shiftDateOnly(task.planned_start_date ?? task.start_date ?? null, shiftDays)
    patch.planned_end_date = shiftDateOnly(task.planned_end_date ?? task.end_date ?? null, shiftDays)
  }

  return patch
}

function buildRequestHash(input: CreateTaskBatchUpdateJobInput, taskIds: string[]): string {
  const optionalValue = (value: unknown) => value === undefined
    ? { provided: false }
    : { provided: true, value: value ?? null }
  const normalizedStatus = typeof input.status === 'string' && input.status.trim()
    ? input.status.trim()
    : null
  const shiftDays = Number(input.dateShiftDays ?? 0)
  const payload = {
    projectId: String(input.projectId).trim(),
    requestedBy: input.requestedBy ?? null,
    taskIds: [...taskIds].sort(),
    status: normalizedStatus,
    assigneeName: optionalValue(input.assigneeName),
    assigneeUserId: optionalValue(input.assigneeUserId),
    participantUnitId: optionalValue(input.participantUnitId),
    dateShiftDays: Number.isFinite(shiftDays) ? shiftDays : 0,
  }
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex')
}

function normalizedComparable(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}(?:T|$)/.test(value)) {
    return value.slice(0, 10)
  }
  return value ?? null
}

function taskMatchesTarget(task: Task, patch: Record<string, unknown>): boolean {
  const record = task as unknown as Record<string, unknown>
  return Object.entries(patch).every(([key, expected]) => (
    normalizedComparable(record[key]) === normalizedComparable(expected)
  ))
}

function isVersionMismatch(error: unknown): boolean {
  const record = error as { code?: unknown; message?: unknown }
  return record?.code === 'VERSION_MISMATCH'
    || String(record?.message ?? error ?? '').includes('VERSION_MISMATCH')
}

function errorDetails(error: unknown): { code: string; message: string } {
  const record = error as { code?: unknown; message?: unknown }
  const message = String(record?.message ?? error ?? 'Task batch update failed').slice(0, 2_000)
  return {
    code: String(record?.code ?? (isVersionMismatch(error) ? 'VERSION_MISMATCH' : 'TASK_BATCH_UPDATE_FAILED')),
    message,
  }
}

async function rollbackQuietly(client: QueryClient): Promise<void> {
  try {
    await client.query('ROLLBACK')
  } catch {
    // Preserve the original transaction error.
  }
}

export async function createTaskBatchUpdateJob(
  input: CreateTaskBatchUpdateJobInput,
): Promise<TaskBatchUpdateJob> {
  const projectId = String(input.projectId ?? '').trim()
  const idempotencyKey = String(input.idempotencyKey ?? '').trim()
  const taskIds = [...new Set(input.taskIds.map((taskId) => String(taskId).trim()).filter(Boolean))]

  if (!projectId || !idempotencyKey || taskIds.length === 0) {
    throw createHttpError('projectId、taskIds 和 idempotencyKey 不能为空', 'INVALID_BATCH_UPDATE_REQUEST', 400)
  }
  const requestHash = buildRequestHash(input, taskIds)

  const client = await getClient()
  let inTransaction = false
  try {
    await client.query('BEGIN')
    inTransaction = true
    await client.query(
      'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
      [`task-batch-update:${projectId}:${idempotencyKey}`],
    )

    const existing = await client.query<TaskBatchUpdateJobRow>(
      `SELECT *
       FROM public.task_batch_update_jobs
       WHERE project_id = $1::uuid
         AND idempotency_key = $2
       LIMIT 1`,
      [projectId, idempotencyKey],
    )
    if (existing.rows[0]) {
      if (String(existing.rows[0].request_hash ?? '') !== requestHash) {
        throw createHttpError(
          '同一 Idempotency-Key 已用于不同的批量更新请求',
          'IDEMPOTENCY_KEY_REUSED',
          409,
        )
      }
      await client.query('COMMIT')
      inTransaction = false
      return mapJobRow(existing.rows[0])
    }

    const taskResult = await client.query<SourceTaskRow>(
      `SELECT id, project_id, version,
              start_date, end_date, planned_start_date, planned_end_date
       FROM public.tasks
       WHERE id = ANY($1::uuid[])
         AND project_id = $2::uuid
       FOR SHARE`,
      [taskIds, projectId],
    )
    if (taskResult.rows.length !== taskIds.length) {
      throw createHttpError(
        '批量更新包含不存在或不属于当前项目的任务',
        'TASK_BATCH_SCOPE_MISMATCH',
        400,
      )
    }

    const taskById = new Map(taskResult.rows.map((task) => [String(task.id), task]))
    const jobId = randomUUID()
    const jobInsert = await client.query<TaskBatchUpdateJobRow>(
      `INSERT INTO public.task_batch_update_jobs (
         id, project_id, requested_by, idempotency_key, request_hash, status, accepted_count
       ) VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, 'pending', $6)
       RETURNING *`,
      [jobId, projectId, input.requestedBy ?? null, idempotencyKey, requestHash, taskIds.length],
    )

    const itemValues: string[] = []
    const itemParams: unknown[] = []
    for (const taskId of taskIds) {
      const task = taskById.get(taskId)
      if (!task) {
        throw createHttpError('批量任务读取不完整', 'TASK_BATCH_SCOPE_MISMATCH', 400)
      }
      const offset = itemParams.length
      itemValues.push(
        `($${offset + 1}::uuid, $${offset + 2}::uuid, $${offset + 3}::uuid, $${offset + 4}::uuid, $${offset + 5}, $${offset + 6}::jsonb)`,
      )
      itemParams.push(
        randomUUID(),
        jobId,
        projectId,
        taskId,
        toNumber(task.version, 1),
        JSON.stringify(buildTargetPatch(task, input)),
      )
    }

    await client.query(
      `INSERT INTO public.task_batch_update_items (
         id, job_id, project_id, task_id, expected_version, target_patch
       ) VALUES ${itemValues.join(', ')}`,
      itemParams,
    )

    await client.query('COMMIT')
    inTransaction = false
    const row = jobInsert.rows[0]
    if (!row) throw new Error('Task batch update job insert did not return a row')
    return mapJobRow(row)
  } catch (error) {
    if (inTransaction) await rollbackQuietly(client)
    throw error
  } finally {
    client.release()
  }
}

async function markItemSucceeded(
  client: QueryClient,
  itemId: string,
  resultVersion: number | null,
): Promise<void> {
  await client.query(
    `UPDATE public.task_batch_update_items
     SET status = 'succeeded',
         result_version = $2,
         lease_owner = NULL,
         lease_expires_at = NULL,
         error_code = NULL,
         error_message = NULL,
         completed_at = NOW(),
         updated_at = NOW()
     WHERE id = $1::uuid`,
    [itemId, resultVersion],
  )
}

async function markItemFailed(
  client: QueryClient,
  itemId: string,
  status: 'failed' | 'conflict',
  error: unknown,
): Promise<void> {
  const details = errorDetails(error)
  await client.query(
    `UPDATE public.task_batch_update_items
     SET status = $2,
         lease_owner = NULL,
         lease_expires_at = NULL,
         error_code = $3,
         error_message = $4,
         completed_at = NOW(),
         updated_at = NOW()
     WHERE id = $1::uuid`,
    [itemId, status, details.code, details.message],
  )
}

// workspace-isolation-system-job-approved: durable job ids are consumed only by the explicit in-process worker capability.
export async function processTaskBatchUpdateJob(
  jobId: string,
  options: { workerId?: string; systemJob?: boolean } = {},
): Promise<TaskBatchUpdateJob | null> {
  const normalizedJobId = String(jobId ?? '').trim()
  if (!normalizedJobId) return null
  if (options.systemJob !== true) {
    throw createHttpError('task batch processing requires systemJob capability', 'SYSTEM_JOB_CAPABILITY_REQUIRED', 403)
  }
  const workerId = String(options.workerId ?? `task-batch-worker-${process.pid}-${randomUUID()}`)
  const client = await getClient()
  let inTransaction = false

  try {
    await client.query('BEGIN')
    inTransaction = true
    const claimedJobResult = await client.query<TaskBatchUpdateJobRow>(
      `UPDATE public.task_batch_update_jobs
       SET status = 'running',
           attempt_count = attempt_count + 1,
           lease_owner = $2,
           lease_expires_at = NOW() + ($3 * INTERVAL '1 second'),
           started_at = COALESCE(started_at, NOW()),
           updated_at = NOW()
       WHERE id = $1::uuid
         AND (
           status = 'pending'
           OR (status = 'running' AND lease_expires_at < NOW())
         )
       RETURNING *`,
      [normalizedJobId, workerId, JOB_LEASE_SECONDS],
    )
    await client.query('COMMIT')
    inTransaction = false

    const claimedJobRow = claimedJobResult.rows[0]
    if (!claimedJobRow) {
      const existing = await client.query<TaskBatchUpdateJobRow>(
        'SELECT * FROM public.task_batch_update_jobs WHERE id = $1::uuid LIMIT 1',
        [normalizedJobId],
      )
      return existing.rows[0] ? mapJobRow(existing.rows[0]) : null
    }

    await client.query('BEGIN')
    inTransaction = true
    const claimedItemsResult = await client.query<TaskBatchUpdateItemRow>(
      `WITH claimable AS (
         SELECT id
         FROM public.task_batch_update_items
         WHERE job_id = $1::uuid
           AND (
             status = 'pending'
             OR (status = 'running' AND lease_expires_at < NOW())
           )
         ORDER BY created_at, id
         FOR UPDATE SKIP LOCKED
       )
       UPDATE public.task_batch_update_items AS item
       SET status = 'running',
           attempt_count = item.attempt_count + 1,
           lease_owner = $2,
           lease_expires_at = NOW() + ($3 * INTERVAL '1 second'),
           started_at = COALESCE(item.started_at, NOW()),
           updated_at = NOW()
       FROM claimable
       WHERE item.id = claimable.id
       RETURNING item.*`,
      [normalizedJobId, workerId, ITEM_LEASE_SECONDS],
    )
    await client.query('COMMIT')
    inTransaction = false

    const updatedTaskIds: string[] = []
    for (const row of claimedItemsResult.rows) {
      const item = mapItemRow(row)
      const patch = {
        ...item.targetPatch,
        updated_by: claimedJobRow.requested_by ?? null,
      } as Partial<Task> & { updated_by?: string | null }

      try {
        const writeResult = await updateTaskInMainChain(item.taskId, patch, item.expectedVersion)
        if (!writeResult?.task) {
          throw Object.assign(new Error('任务不存在'), { code: 'TASK_NOT_FOUND' })
        }
        await markItemSucceeded(client, item.id, toNumber(writeResult.task.version, item.expectedVersion + 1))
        updatedTaskIds.push(item.taskId)
      } catch (error) {
        if (isVersionMismatch(error)) {
          const currentTaskResult = await client.query<Task>(
            'SELECT * FROM public.tasks WHERE id = $1::uuid AND project_id = $2::uuid LIMIT 1',
            [item.taskId, item.projectId],
          )
          const currentTask = currentTaskResult.rows[0] ?? null
          if (
            currentTask
            && String(currentTask.project_id ?? '') === item.projectId
            && taskMatchesTarget(currentTask, item.targetPatch)
          ) {
            await markItemSucceeded(client, item.id, toNumber(currentTask.version, item.expectedVersion + 1))
            updatedTaskIds.push(item.taskId)
            continue
          }
          await markItemFailed(client, item.id, 'conflict', error)
          continue
        }
        await markItemFailed(client, item.id, 'failed', error)
      }
    }

    const aggregate = await client.query<{
      accepted_count: number | string
      succeeded_count: number | string
      failed_count: number | string
      pending_count: number | string
    }>(
      `SELECT
         COUNT(*)::int AS accepted_count,
         COUNT(*) FILTER (WHERE status = 'succeeded')::int AS succeeded_count,
         COUNT(*) FILTER (WHERE status IN ('failed', 'conflict'))::int AS failed_count,
         COUNT(*) FILTER (WHERE status IN ('pending', 'running'))::int AS pending_count
       FROM public.task_batch_update_items
       WHERE job_id = $1::uuid`,
      [normalizedJobId],
    )
    const counts = aggregate.rows[0] ?? {
      accepted_count: 0,
      succeeded_count: 0,
      failed_count: 0,
      pending_count: 0,
    }
    const acceptedCount = toNumber(counts.accepted_count)
    const succeededCount = toNumber(counts.succeeded_count)
    const failedCount = toNumber(counts.failed_count)
    const pendingCount = toNumber(counts.pending_count)
    const finalStatus: TaskBatchUpdateJobStatus = pendingCount > 0
      ? 'running'
      : failedCount === 0
        ? 'succeeded'
        : succeededCount === 0
          ? 'failed'
          : 'partial_failed'

    const finalJobResult = await client.query<TaskBatchUpdateJobRow>(
      `UPDATE public.task_batch_update_jobs
       SET status = $2,
           accepted_count = $3,
           succeeded_count = $4,
           failed_count = $5,
           lease_owner = CASE WHEN $2 = 'running' THEN lease_owner ELSE NULL END,
           lease_expires_at = CASE WHEN $2 = 'running' THEN lease_expires_at ELSE NULL END,
           completed_at = CASE WHEN $2 = 'running' THEN NULL ELSE NOW() END,
           updated_at = NOW()
       WHERE id = $1::uuid
       RETURNING *`,
      [normalizedJobId, finalStatus, acceptedCount, succeededCount, failedCount],
    )
    const finalRow = finalJobResult.rows[0]
    return finalRow
      ? { ...mapJobRow(finalRow), updatedTaskIds }
      : null
  } catch (error) {
    if (inTransaction) await rollbackQuietly(client)
    throw error
  } finally {
    client.release()
  }
}

export async function getTaskBatchUpdateJob(jobId: string): Promise<TaskBatchUpdateJob | null> {
  const normalizedJobId = String(jobId ?? '').trim()
  if (!normalizedJobId) return null
  const client = await getClient()
  try {
    const jobResult = await client.query<TaskBatchUpdateJobRow>(
      'SELECT * FROM public.task_batch_update_jobs WHERE id = $1::uuid LIMIT 1',
      [normalizedJobId],
    )
    const row = jobResult.rows[0]
    if (!row) return null
    const itemResult = await client.query<TaskBatchUpdateItemRow>(
      `SELECT *
       FROM public.task_batch_update_items
       WHERE job_id = $1::uuid
       ORDER BY created_at, id`,
      [normalizedJobId],
    )
    return {
      ...mapJobRow(row),
      items: itemResult.rows.map(mapItemRow),
    }
  } finally {
    client.release()
  }
}

const scheduledJobs = new Set<string>()

export function scheduleTaskBatchUpdateJob(jobId: string): void {
  const normalizedJobId = String(jobId ?? '').trim()
  if (!normalizedJobId || scheduledJobs.has(normalizedJobId)) return
  scheduledJobs.add(normalizedJobId)

  queueMicrotask(() => {
    let retryAfterLease = false
    void processTaskBatchUpdateJob(normalizedJobId, { systemJob: true })
      .then((job) => {
        if (!job) return
        if (job.updatedTaskIds && job.updatedTaskIds.length > 0) {
          broadcastProjectTasksChanged({
            projectId: job.projectId,
            changedTaskIds: job.updatedTaskIds,
            source: 'task_api',
            revision: Date.now(),
          })
        }
        logger.info('Durable task batch update job processed', {
          jobId: job.id,
          projectId: job.projectId,
          status: job.status,
          acceptedCount: job.acceptedCount,
          succeededCount: job.succeededCount,
          failedCount: job.failedCount,
        })
      })
      .catch((error) => {
        retryAfterLease = true
        logger.error('Durable task batch update job processing failed', {
          jobId: normalizedJobId,
          error: error instanceof Error ? error.message : String(error),
        })
      })
      .finally(() => {
        scheduledJobs.delete(normalizedJobId)
        if (retryAfterLease) {
          const retryTimer = setTimeout(() => {
            scheduleTaskBatchUpdateJob(normalizedJobId)
          }, (JOB_LEASE_SECONDS + 1) * 1_000)
          retryTimer.unref()
        }
      })
  })
}

export async function recoverTaskBatchUpdateJobs(): Promise<number> {
  const client = await getClient()
  try {
    const result = await client.query<{ id: string }>(
      `SELECT id
       FROM public.task_batch_update_jobs
       WHERE status = 'pending'
          OR (status = 'running' AND lease_expires_at < NOW())
       ORDER BY created_at`,
    )
    for (const row of result.rows) scheduleTaskBatchUpdateJob(String(row.id))
    return result.rows.length
  } finally {
    client.release()
  }
}
