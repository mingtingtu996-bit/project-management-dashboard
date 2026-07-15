import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  from: vi.fn(() => {
    throw new Error('legacy change logs must not use anonymous Supabase REST')
  }),
  broadcastRealtimeEvent: vi.fn(),
}))

vi.mock('../database.js', () => ({
  isDatabaseTransactionActive: vi.fn(() => false),
  query: mocks.query,
}))

vi.mock('../services/dbService.js', () => ({
  supabase: { from: mocks.from },
}))

vi.mock('../services/realtimeServer.js', () => ({
  broadcastRealtimeEvent: mocks.broadcastRealtimeEvent,
}))

vi.mock('../middleware/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

const { getEntityLogs, hasChangeLog, hasManualEdit, writeLog } = await import('../services/changeLogs.js')

describe('legacy change log direct runtime persistence', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.query.mockReset()
  })

  it('delegates writes to the backend change audit persistence path', async () => {
    mocks.query.mockResolvedValueOnce({ rows: [], rowCount: 1 })

    await writeLog({
      project_id: 'project-1',
      entity_type: 'task_condition',
      entity_id: 'condition-1',
      field_name: 'status',
      old_value: 'unsatisfied',
      new_value: 'confirmed',
      change_reason: 'operator confirmation',
      changed_by: 'user-1',
      change_source: 'manual_adjusted',
    })

    expect(String(mocks.query.mock.calls[0][0])).toContain('INSERT INTO public.change_logs')
    expect(mocks.query.mock.calls[0][1]).toContain('operator confirmation')
    expect(mocks.broadcastRealtimeEvent).toHaveBeenCalledOnce()
    expect(mocks.from).not.toHaveBeenCalled()
  })

  it('reads change logs and existence checks through backend SQL', async () => {
    mocks.query
      .mockResolvedValueOnce({ rows: [{ id: 'log-1', entity_id: 'condition-1' }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ id: 'log-1' }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ id: 'log-1' }], rowCount: 1 })

    await expect(getEntityLogs('task_condition', 'condition-1')).resolves.toHaveLength(1)
    await expect(hasManualEdit('task_condition', 'condition-1')).resolves.toBe(true)
    await expect(hasChangeLog({
      entity_type: 'task_condition',
      entity_id: 'condition-1',
      field_name: 'status',
      new_value: 'confirmed',
    })).resolves.toBe(true)

    expect(mocks.query).toHaveBeenCalledTimes(3)
    expect(mocks.from).not.toHaveBeenCalled()
  })
})
