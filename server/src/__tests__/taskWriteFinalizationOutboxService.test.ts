import { beforeEach, describe, expect, it, vi } from 'vitest'

import { drainTaskWriteFinalizationOutbox } from '../services/taskWriteFinalizationOutboxService.js'

type OutboxRow = Record<string, any>

const previousTask = {
  id: '11111111-1111-4111-8111-111111111111',
  project_id: '22222222-2222-4222-8222-222222222222',
  status: 'in_progress',
  progress: 80,
  updated_at: '2026-07-25T01:00:00.000Z',
}
const nextTask = {
  ...previousTask,
  status: 'completed',
  progress: 100,
  actual_end_date: '2026-07-25',
  updated_at: '2026-07-25T02:00:00.000Z',
}

function createHarness() {
  const rows: OutboxRow[] = [{
    id: '33333333-3333-4333-8333-333333333333',
    company_id: '44444444-4444-4444-8444-444444444444',
    project_id: nextTask.project_id,
    task_id: nextTask.id,
    previous_task: previousTask,
    next_task: nextTask,
    actor_user_id: '55555555-5555-4555-8555-555555555555',
    processing_status: 'pending',
    attempt_count: 0,
    next_attempt_at: '2026-07-25T02:00:00.000Z',
    lease_owner: null,
    lease_expires_at: null,
    created_at: '2026-07-25T02:00:00.000Z',
  }]
  const queryExec = vi.fn(async (sql: string, params: unknown[] = []) => {
    if (sql.includes('task-write-finalization-outbox:claim')) {
      const row = rows.find((candidate) => ['pending', 'failed'].includes(candidate.processing_status))
      if (!row) return []
      row.processing_status = 'processing'
      row.attempt_count += 1
      row.lease_owner = params[2]
      return [{ ...row }]
    }
    if (sql.includes('task-write-finalization-outbox:complete')) {
      const row = rows.find((candidate) => candidate.id === params[0] && candidate.lease_owner === params[1])
      if (!row) return []
      row.processing_status = 'completed'
      row.lease_owner = null
      return [{ id: row.id }]
    }
    if (sql.includes('task-write-finalization-outbox:fail')) {
      const row = rows.find((candidate) => candidate.id === params[0] && candidate.lease_owner === params[1])
      if (!row) return []
      row.processing_status = 'failed'
      row.lease_owner = null
      row.last_error = params[3]
      return [{ id: row.id }]
    }
    if (sql.includes('task-write-finalization-outbox:backlog')) {
      const pending = rows.filter((candidate) => candidate.processing_status !== 'completed')
      return [{
        backlog_count: pending.length,
        ready_backlog_count: pending.filter((candidate) => ['pending', 'failed'].includes(candidate.processing_status)).length,
        oldest_pending_at: pending[0]?.created_at ?? null,
      }]
    }
    throw new Error(`unexpected SQL: ${sql}`)
  })
  return { rows, queryExec }
}

describe('task write finalization outbox service', () => {
  beforeEach(() => vi.clearAllMocks())

  it('claims, finalizes and completes a durable task mutation', async () => {
    const harness = createHarness()
    const finalize = vi.fn(async () => undefined)

    const result = await drainTaskWriteFinalizationOutbox({
      queryExec: harness.queryExec,
      finalize,
      ownerId: 'worker-1',
      now: '2026-07-25T02:01:00.000Z',
      limit: 10,
    })

    expect(finalize).toHaveBeenCalledWith(nextTask, previousTask, '55555555-5555-4555-8555-555555555555')
    expect(result).toEqual(expect.objectContaining({ claimed: 1, completed: 1, failed: 0, backlogCount: 0 }))
    expect(harness.rows[0].processing_status).toBe('completed')
    const claimSql = String(harness.queryExec.mock.calls.find(([sql]) => String(sql).includes(':claim'))?.[0] ?? '')
    expect(claimSql).toMatch(/for update skip locked/i)
    expect(claimSql).toMatch(/not exists/i)
    expect(claimSql).toMatch(/lease_expires_at\s*<=/i)
    expect(claimSql).toMatch(/earlier\.sequence_id\s*<\s*outbox\.sequence_id/i)
    expect(claimSql).toMatch(/order by outbox\.sequence_id asc/i)
    const backlogSql = String(harness.queryExec.mock.calls.find(([sql]) => String(sql).includes(':backlog'))?.[0] ?? '')
    expect(backlogSql).toMatch(/ready_backlog_count/i)
    expect(backlogSql).toMatch(/not exists/i)
  })

  it('persists processor failure and retries it on the next drain', async () => {
    const harness = createHarness()
    const finalize = vi.fn()
      .mockRejectedValueOnce(new Error('finalizer unavailable'))
      .mockResolvedValueOnce(undefined)

    const first = await drainTaskWriteFinalizationOutbox({
      queryExec: harness.queryExec,
      finalize,
      ownerId: 'worker-1',
      now: '2026-07-25T02:01:00.000Z',
      limit: 10,
    })
    expect(first).toEqual(expect.objectContaining({ claimed: 1, completed: 0, failed: 1, backlogCount: 1 }))
    expect(harness.rows[0]).toEqual(expect.objectContaining({ processing_status: 'failed', last_error: 'finalizer unavailable' }))

    const second = await drainTaskWriteFinalizationOutbox({
      queryExec: harness.queryExec,
      finalize,
      ownerId: 'worker-2',
      now: '2026-07-25T02:03:00.000Z',
      limit: 10,
    })
    expect(second).toEqual(expect.objectContaining({ claimed: 1, completed: 1, failed: 0, backlogCount: 0 }))
    expect(finalize).toHaveBeenCalledTimes(2)
  })

  it('fails fast on an aborted drain before claiming rows', async () => {
    const harness = createHarness()
    const controller = new AbortController()
    const reason = new Error('deadline reached')
    controller.abort(reason)

    await expect(drainTaskWriteFinalizationOutbox({
      queryExec: harness.queryExec,
      finalize: vi.fn(),
      ownerId: 'worker-1',
      now: '2026-07-25T02:01:00.000Z',
      limit: 10,
      signal: controller.signal,
    })).rejects.toBe(reason)
    expect(harness.queryExec).not.toHaveBeenCalled()
  })
})
