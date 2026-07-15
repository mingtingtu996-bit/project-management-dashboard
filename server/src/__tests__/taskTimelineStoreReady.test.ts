import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  loggerWarn: vi.fn(),
}))

vi.mock('../database.js', () => ({
  query: mocks.query,
}))

vi.mock('../middleware/logger.js', () => ({
  logger: {
    warn: mocks.loggerWarn,
  },
}))

import { isTaskTimelineEventStoreReady } from '../services/taskTimelineService.js'

describe('isTaskTimelineEventStoreReady', () => {
  it('returns true when the task timeline event store is reachable', async () => {
    mocks.query.mockResolvedValueOnce({ rows: [{ id: 'evt-1' }] })

    await expect(isTaskTimelineEventStoreReady('project-1')).resolves.toBe(true)
    expect(mocks.loggerWarn).not.toHaveBeenCalled()
  })

  it('returns false when the task timeline event store probe fails', async () => {
    mocks.query.mockRejectedValueOnce(new Error('table missing'))

    await expect(isTaskTimelineEventStoreReady('project-1')).resolves.toBe(false)
    expect(mocks.loggerWarn).toHaveBeenCalled()
  })
})
