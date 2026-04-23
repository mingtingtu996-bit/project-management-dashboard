import { beforeEach, describe, expect, it, vi } from 'vitest'

const queryMock = vi.fn()
const cleanupJobFailuresMock = vi.fn()

vi.mock('../database.js', () => ({
  query: queryMock,
}))

vi.mock('../services/jobRuntime.js', () => ({
  cleanupJobFailures: cleanupJobFailuresMock,
}))

describe('DataRetentionService', () => {
  beforeEach(() => {
    vi.resetModules()
    queryMock.mockReset()
    cleanupJobFailuresMock.mockReset()

    queryMock
      .mockResolvedValueOnce({ rowCount: 3 })
    cleanupJobFailuresMock.mockResolvedValue(2)
  })

  it('applies the configured retention windows and preserves planning snapshots', async () => {
    const { DataRetentionService } = await import('../services/dataRetentionService.js')
    const service = new DataRetentionService()

    const result = await service.runRetentionPolicy()

    expect(result).toEqual({
      operationLogsDeleted: 3,
      taskProgressSnapshotsDeleted: 0,
      changeLogsDeleted: 0,
      jobFailuresDeleted: 2,
    })

    expect(queryMock).toHaveBeenCalledTimes(1)
    expect(queryMock.mock.calls[0]?.[0]).toContain('DELETE FROM public.operation_logs')
    expect(queryMock.mock.calls[0]?.[1]).toEqual([90])
    expect(cleanupJobFailuresMock).toHaveBeenCalledWith(30)
  })
})
