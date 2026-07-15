import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getClient: vi.fn(),
  query: vi.fn(),
  release: vi.fn(),
  on: vi.fn(),
  removeListener: vi.fn(),
}))

vi.mock('../database.js', () => ({
  getClient: mocks.getClient,
}))

vi.mock('../middleware/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

describe('scheduler leadership service', () => {
  beforeEach(() => {
    mocks.getClient.mockReset()
    mocks.query.mockReset()
    mocks.release.mockReset()
    mocks.on.mockReset()
    mocks.removeListener.mockReset()
    mocks.query.mockResolvedValue({ rows: [{ acquired: true, released: true }] })
    mocks.getClient.mockResolvedValue({
      query: mocks.query,
      release: mocks.release,
      on: mocks.on,
      removeListener: mocks.removeListener,
    })
  })

  it('holds one database session lock until the scheduler is stopped', async () => {
    const { acquireSchedulerLeadership } = await import('../services/schedulerLeadershipService.js')
    const leadership = await acquireSchedulerLeadership({ ownerId: 'worker-a' })

    expect(leadership).not.toBeNull()
    expect(mocks.query.mock.calls[0]?.[0]).toContain('pg_try_advisory_lock')
    expect(mocks.release).not.toHaveBeenCalled()

    await leadership?.release()

    expect(mocks.query.mock.calls.at(-1)?.[0]).toContain('pg_advisory_unlock')
    expect(mocks.release).toHaveBeenCalledOnce()
  })

  it('does not start a second scheduler when the leadership lock is held', async () => {
    mocks.query.mockResolvedValueOnce({ rows: [{ acquired: false }] })
    const { acquireSchedulerLeadership } = await import('../services/schedulerLeadershipService.js')

    await expect(acquireSchedulerLeadership({ ownerId: 'worker-b' })).resolves.toBeNull()
    expect(mocks.release).toHaveBeenCalledOnce()
  })

  it('reports leadership connection loss exactly once', async () => {
    const onLost = vi.fn()
    const { acquireSchedulerLeadership } = await import('../services/schedulerLeadershipService.js')
    await acquireSchedulerLeadership({ ownerId: 'worker-a', onLost })
    const errorListener = mocks.on.mock.calls.find((call) => call[0] === 'error')?.[1]
    const endListener = mocks.on.mock.calls.find((call) => call[0] === 'end')?.[1]

    errorListener?.(new Error('connection lost'))
    endListener?.()

    expect(onLost).toHaveBeenCalledOnce()
  })
})
