import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getClient: vi.fn(),
  getTask: vi.fn(),
  updateTaskInMainChain: vi.fn(),
}))

vi.mock('../database.js', () => ({ getClient: mocks.getClient }))
vi.mock('../services/dbService.js', () => ({ getTask: mocks.getTask }))
vi.mock('../services/taskWriteChainService.js', () => ({
  updateTaskInMainChain: mocks.updateTaskInMainChain,
}))

import {
  createTaskBatchUpdateJob,
  processTaskBatchUpdateJob,
} from '../services/taskBatchUpdateService.js'

function createClient(queryImpl: (sql: string, params?: unknown[]) => Promise<unknown>) {
  return {
    query: vi.fn(queryImpl),
    release: vi.fn(),
  }
}

describe('task batch update service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('stores absolute date targets and returns the existing idempotent job without duplicating items', async () => {
    let existingLookupCount = 0
    let persistedRequestHash = ''
    const client = createClient(async (sql, params) => {
      if (sql === 'BEGIN' || sql === 'COMMIT') return { rows: [], rowCount: 0 }
      if (sql.includes('pg_advisory_xact_lock')) return { rows: [], rowCount: 1 }
      if (sql.includes('FROM public.task_batch_update_jobs') && sql.includes('idempotency_key')) {
        existingLookupCount += 1
        return existingLookupCount === 1
          ? { rows: [], rowCount: 0 }
          : {
              rows: [{
                id: 'job-1', project_id: 'project-1', status: 'pending', accepted_count: 1,
                request_hash: persistedRequestHash,
              }],
              rowCount: 1,
            }
      }
      if (sql.includes('FROM public.tasks') && sql.includes('ANY($1::uuid[])')) {
        return {
          rows: [{
            id: 'task-1', project_id: 'project-1', version: 7,
            start_date: '2026-04-01', end_date: '2026-04-05',
            planned_start_date: '2026-04-01', planned_end_date: '2026-04-05',
          }],
          rowCount: 1,
        }
      }
      if (sql.includes('INSERT INTO public.task_batch_update_jobs')) {
        persistedRequestHash = String(params?.[4] ?? '')
        return { rows: [{ id: 'job-1', project_id: 'project-1', status: 'pending', accepted_count: 1 }], rowCount: 1 }
      }
      if (sql.includes('INSERT INTO public.task_batch_update_items')) return { rows: [], rowCount: 1 }
      throw new Error(`unexpected query: ${sql}`)
    })
    mocks.getClient.mockResolvedValue(client)

    const first = await createTaskBatchUpdateJob({
      projectId: 'project-1',
      taskIds: ['task-1'],
      requestedBy: 'user-1',
      idempotencyKey: 'request-1',
      dateShiftDays: 2,
      status: 'in_progress',
    })
    const second = await createTaskBatchUpdateJob({
      projectId: 'project-1',
      taskIds: ['task-1'],
      requestedBy: 'user-1',
      idempotencyKey: 'request-1',
      dateShiftDays: 2,
      status: 'in_progress',
    })

    expect(first.id).toBe('job-1')
    expect(second.id).toBe('job-1')
    const itemInsert = client.query.mock.calls.find(([sql]) => String(sql).includes('INSERT INTO public.task_batch_update_items'))
    expect(itemInsert).toBeDefined()
    expect(JSON.stringify(itemInsert?.[1])).toContain('2026-04-03')
    expect(JSON.stringify(itemInsert?.[1])).toContain('2026-04-07')
    expect(client.query.mock.calls.filter(([sql]) => String(sql).includes('INSERT INTO public.task_batch_update_items'))).toHaveLength(1)
  })

  it('rejects reuse of an idempotency key for a different request payload', async () => {
    const client = createClient(async (sql) => {
      if (sql === 'BEGIN' || sql === 'ROLLBACK') return { rows: [], rowCount: 0 }
      if (sql.includes('pg_advisory_xact_lock')) return { rows: [], rowCount: 1 }
      if (sql.includes('FROM public.task_batch_update_jobs') && sql.includes('idempotency_key')) {
        return {
          rows: [{
            id: 'job-1', project_id: 'project-1', status: 'succeeded', accepted_count: 1,
            request_hash: 'hash-for-another-request',
          }],
          rowCount: 1,
        }
      }
      throw new Error(`unexpected query: ${sql}`)
    })
    mocks.getClient.mockResolvedValue(client)

    await expect(createTaskBatchUpdateJob({
      projectId: 'project-1',
      taskIds: ['task-2'],
      requestedBy: 'user-1',
      idempotencyKey: 'request-1',
      status: 'completed',
    })).rejects.toMatchObject({
      code: 'IDEMPOTENCY_KEY_REUSED',
      statusCode: 409,
    })
  })

  it('recovers a post-commit status-write interruption by comparing the absolute target patch', async () => {
    const client = createClient(async (sql) => {
      if (sql === 'BEGIN' || sql === 'COMMIT') return { rows: [], rowCount: 0 }
      if (sql.includes('UPDATE public.task_batch_update_jobs') && sql.includes("status = 'running'")) {
        return { rows: [{ id: 'job-1', project_id: 'project-1', status: 'running' }], rowCount: 1 }
      }
      if (sql.includes('UPDATE public.task_batch_update_items') && sql.includes("status = 'running'")) {
        return {
          rows: [{
            id: 'item-1', job_id: 'job-1', project_id: 'project-1', task_id: 'task-1',
            expected_version: 7, target_patch: { status: 'in_progress', planned_start_date: '2026-04-03' },
          }],
          rowCount: 1,
        }
      }
      if (sql.includes('FROM public.tasks') && sql.includes('project_id = $2::uuid')) {
        return {
          rows: [{
            id: 'task-1', project_id: 'project-1', version: 8,
            status: 'in_progress', planned_start_date: '2026-04-03',
          }],
          rowCount: 1,
        }
      }
      if (sql.includes("status = 'succeeded'") && sql.includes('task_batch_update_items')) return { rows: [], rowCount: 1 }
      if (sql.includes('COUNT(*) FILTER')) {
        return { rows: [{ accepted_count: 1, succeeded_count: 1, failed_count: 0, pending_count: 0 }], rowCount: 1 }
      }
      if (sql.includes('UPDATE public.task_batch_update_jobs') && sql.includes('succeeded_count')) {
        return { rows: [{ id: 'job-1', project_id: 'project-1', status: 'succeeded', accepted_count: 1, succeeded_count: 1, failed_count: 0 }], rowCount: 1 }
      }
      throw new Error(`unexpected query: ${sql}`)
    })
    mocks.getClient.mockResolvedValue(client)
    mocks.updateTaskInMainChain.mockRejectedValue(Object.assign(new Error('VERSION_MISMATCH'), { code: 'VERSION_MISMATCH' }))
    const result = await processTaskBatchUpdateJob('job-1', { workerId: 'worker-1', systemJob: true })

    expect(result?.status).toBe('succeeded')
    expect(mocks.updateTaskInMainChain).toHaveBeenCalledWith(
      'task-1',
      expect.objectContaining({ status: 'in_progress', planned_start_date: '2026-04-03' }),
      7,
    )
    expect(client.query.mock.calls.some(([sql]) => (
      String(sql).includes('task_batch_update_items') && String(sql).includes("status = 'succeeded'")
    ))).toBe(true)
  })

  it('rejects direct processing without the system worker capability', async () => {
    await expect(processTaskBatchUpdateJob('job-1', { workerId: 'worker-1' })).rejects.toMatchObject({
      code: 'SYSTEM_JOB_CAPABILITY_REQUIRED',
      statusCode: 403,
    })
    expect(mocks.getClient).not.toHaveBeenCalled()
  })
})
