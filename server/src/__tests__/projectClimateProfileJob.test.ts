import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  syncAllProjectClimateProfiles: vi.fn(),
  loggerInfo: vi.fn(),
  loggerWarn: vi.fn(),
  loggerError: vi.fn(),
}))

vi.mock('../services/projectClimateProfileService.js', () => ({
  syncAllProjectClimateProfiles: mocks.syncAllProjectClimateProfiles,
}))

vi.mock('../services/jobRuntime.js', () => ({
  runJobWithRetry: vi.fn(async (_metadata, execute) => ({
    attempts: 1,
    value: await execute(1, { signal: new AbortController().signal }),
  })),
}))

vi.mock('../services/persistentJobScheduleService.js', () => ({
  PersistentWallClockJobTimer: class {
    start() { return true }
    stop() {}
    getStatus() { return { isScheduled: false } }
  },
}))

vi.mock('../middleware/logger.js', () => ({
  logger: {
    info: mocks.loggerInfo,
    warn: mocks.loggerWarn,
    error: mocks.loggerError,
  },
}))

import { ProjectClimateProfileJob } from '../jobs/projectClimateProfileJob.js'

describe('projectClimateProfileJob', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('fails the run when any project profile synchronization reports an error', async () => {
    mocks.syncAllProjectClimateProfiles.mockResolvedValue([
      { projectId: 'project-ok', profile: { projectId: 'project-ok' }, weather: null },
      { projectId: 'project-failed', profile: null, weather: null, error: 'row-level security violation' },
    ])
    const job = new ProjectClimateProfileJob()

    await expect(job.executeNow()).rejects.toMatchObject({
      code: 'PROJECT_CLIMATE_PROFILE_SYNC_PARTIAL_FAILURE',
      failedCount: 1,
    })
    expect(mocks.loggerError).toHaveBeenCalledWith(
      'projectClimateProfileJob failed',
      expect.objectContaining({
        triggeredBy: 'manual',
        error: expect.stringContaining('PROJECT_CLIMATE_PROFILE_SYNC_PARTIAL_FAILURE'),
      }),
    )
  })

  it('returns the synchronized project results when every project succeeds', async () => {
    const rows = [{ projectId: 'project-ok', profile: { projectId: 'project-ok' }, weather: null }]
    mocks.syncAllProjectClimateProfiles.mockResolvedValue(rows)
    const job = new ProjectClimateProfileJob()

    await expect(job.executeNow()).resolves.toEqual(rows)
  })

  it('does not treat an unexpected weather synchronization failure as a successful run', async () => {
    mocks.syncAllProjectClimateProfiles.mockResolvedValue([{
      projectId: 'project-weather-failed',
      profile: { projectId: 'project-weather-failed' },
      weather: { status: 'failed', reason: 'database write failed' },
    }])
    const job = new ProjectClimateProfileJob()

    await expect(job.executeNow()).rejects.toMatchObject({
      code: 'PROJECT_CLIMATE_PROFILE_SYNC_PARTIAL_FAILURE',
      failedCount: 1,
    })
  })
})
