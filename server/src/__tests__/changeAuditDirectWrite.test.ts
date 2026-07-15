import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  from: vi.fn(() => {
    throw new Error('business audit writes must not use anonymous Supabase REST')
  }),
}))

vi.mock('../database.js', () => ({
  isDatabaseTransactionActive: vi.fn(() => false),
  query: mocks.query,
}))

vi.mock('../services/dbService.js', () => ({
  supabase: { from: mocks.from },
}))

vi.mock('../middleware/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

import { writeChangeLog } from '../services/changeAuditService.js'

describe('change audit direct runtime persistence', () => {
  beforeEach(() => {
    mocks.query.mockReset().mockResolvedValue({ rows: [], rowCount: 1 })
    mocks.from.mockClear()
  })

  it('uses the backend database role outside a transaction and matches the live schema', async () => {
    await expect(writeChangeLog({
      projectId: '11111111-1111-4111-8111-111111111111',
      entityType: 'construction_drawing',
      entityId: '22222222-2222-4222-8222-222222222222',
      actionType: 'retention_decision',
      changedBy: '33333333-3333-4333-8333-333333333333',
    })).resolves.toEqual(expect.any(String))

    expect(mocks.from).not.toHaveBeenCalled()
    expect(mocks.query).toHaveBeenCalledTimes(1)
    const [sql, params] = mocks.query.mock.calls[0]
    expect(String(sql)).toContain('INSERT INTO public.change_logs')
    expect(String(sql)).not.toMatch(/\bcreated_at\b/)
    expect(params).toHaveLength(19)
    expect(params[6]).toBe('retention_decision')
  })
})
