import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  writeChangeLog: vi.fn(),
  from: vi.fn(),
}))

function emptyReferenceQuery() {
  const chain: any = {
    eq: vi.fn(() => chain),
    or: vi.fn(() => chain),
    contains: vi.fn(() => chain),
    maybeSingle: vi.fn(async () => ({ data: null, error: null })),
    then: (resolve: (value: unknown) => unknown) => Promise.resolve({ count: 0, data: [], error: null }).then(resolve),
  }
  return {
    select: vi.fn(() => chain),
    insert: vi.fn(() => {
      throw new Error('retention audit writes must not use anonymous Supabase REST')
    }),
  }
}

vi.mock('../database.js', () => ({
  isDatabaseTransactionActive: vi.fn(() => false),
  query: mocks.query,
}))

vi.mock('../services/changeAuditService.js', () => ({
  writeChangeLog: mocks.writeChangeLog,
}))

vi.mock('../services/dbService.js', () => ({
  supabase: { from: mocks.from },
}))

vi.mock('../middleware/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

import { executeRetention } from '../services/deletionRetentionGovernanceService.js'

describe('deletion retention direct runtime persistence', () => {
  beforeEach(() => {
    mocks.query.mockReset().mockResolvedValue({ rows: [], rowCount: 1 })
    mocks.writeChangeLog.mockReset().mockResolvedValue('44444444-4444-4444-8444-444444444444')
    mocks.from.mockReset().mockImplementation(() => emptyReferenceQuery())
  })

  it('persists the retention ledger with the backend database role', async () => {
    await executeRetention({
      entityType: 'notification',
      entityId: '55555555-5555-4555-8555-555555555555',
      projectId: '11111111-1111-4111-8111-111111111111',
      userId: '33333333-3333-4333-8333-333333333333',
      userAction: 'delete',
    })

    expect(mocks.query).toHaveBeenCalledTimes(1)
    expect(String(mocks.query.mock.calls[0][0])).toContain('INSERT INTO public.deletion_retention_events')
  })

  it('blocks the governed operation when the retention ledger cannot be persisted', async () => {
    mocks.query.mockRejectedValueOnce(new Error('retention ledger unavailable'))

    await expect(executeRetention({
      entityType: 'notification',
      entityId: '55555555-5555-4555-8555-555555555555',
      projectId: '11111111-1111-4111-8111-111111111111',
      userId: '33333333-3333-4333-8333-333333333333',
      userAction: 'delete',
    })).rejects.toThrow('retention ledger unavailable')
  })

  it('blocks the governed operation when its business change audit cannot be persisted', async () => {
    mocks.writeChangeLog.mockResolvedValueOnce(null)

    await expect(executeRetention({
      entityType: 'notification',
      entityId: '55555555-5555-4555-8555-555555555555',
      projectId: '11111111-1111-4111-8111-111111111111',
      userId: '33333333-3333-4333-8333-333333333333',
      userAction: 'delete',
    })).rejects.toThrow('RETENTION_CHANGE_AUDIT_WRITE_FAILED')

    expect(mocks.query).not.toHaveBeenCalled()
  })
})
