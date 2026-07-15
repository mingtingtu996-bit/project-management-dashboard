import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  expirePendingRetentionDecisions: vi.fn(async () => ({
    expired: 2,
    cutoff: '2026-05-27T00:00:00.000Z',
  })),
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

vi.mock('../services/deletionRetentionGovernanceService.js', () => ({
  expirePendingRetentionDecisions: mocks.expirePendingRetentionDecisions,
}))

vi.mock('../middleware/logger.js', () => ({
  logger: mocks.logger,
}))

describe('deletion retention cleanup job', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('expires stale pending retention confirmations through the shared service', async () => {
    const { DeletionRetentionCleanupJob } = await import('../jobs/deletionRetentionCleanupJob.js')
    const job = new DeletionRetentionCleanupJob()

    const result = await job.executeNow()

    expect(result).toEqual({ expired: 2, cutoff: '2026-05-27T00:00:00.000Z' })
    expect(mocks.expirePendingRetentionDecisions).toHaveBeenCalledTimes(1)
  })
})
