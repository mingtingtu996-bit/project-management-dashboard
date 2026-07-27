import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  activeProjectIds: ['project-1'] as string[],
  calls: [] as Array<{ method: string; projectId: string; options?: Record<string, unknown> }>,
  failures: [] as Error[],
  leaseAcquired: true,
  leaseCalls: [] as Array<{ jobName: string; jobId?: string }>,
  leaseAssertions: 0,
}))

vi.mock('../middleware/logger.js', () => ({
  logger: {
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}))

vi.mock('../services/activeProjectService.js', () => ({
  listActiveProjectIds: vi.fn(async (projectIds?: string[] | null) => {
    if (Array.isArray(projectIds)) return mocks.activeProjectIds.filter((projectId) => projectIds.includes(projectId))
    return mocks.activeProjectIds
  }),
}))

vi.mock('../services/jobRuntime.js', () => ({
  runJobWithRetry: vi.fn(async (_options: unknown, runner: () => Promise<unknown>) => ({
    attempts: 1,
    value: await runner(),
  })),
  runWithJobLease: vi.fn(async (
    options: { jobName: string; jobId?: string },
    runner: (lease: { assertActive: () => void }) => Promise<unknown>,
  ) => {
    mocks.leaseCalls.push(options)
    if (!mocks.leaseAcquired) return { acquired: false, reason: 'lease_not_acquired' }
    return {
      acquired: true,
      value: await runner({
        assertActive: () => {
          mocks.leaseAssertions += 1
        },
      }),
    }
  }),
}))

vi.mock('../services/warningService.js', () => ({
  WarningService: vi.fn().mockImplementation(() => ({
    syncImpactSignalWarningLifecycle: vi.fn(async (projectId: string, options?: Record<string, unknown>) => {
      mocks.calls.push({ method: 'syncImpactSignalWarningLifecycle', projectId, options })
      const failure = mocks.failures.shift()
      if (failure) throw failure
      return { resolvedCount: 1, downgradedCount: 0 }
    }),
    recordImpactSignalGovernanceArtifacts: vi.fn(async (projectId: string, options?: Record<string, unknown>) => {
      mocks.calls.push({ method: 'recordImpactSignalGovernanceArtifacts', projectId, options })
      const failure = mocks.failures.shift()
      if (failure) throw failure
      return { coverageSnapshots: 1, thresholdCandidates: 1, ownerConfirmations: 1, ruleQualityEvents: 1 }
    }),
    applyOwnerConfirmationFeedback: vi.fn(async (projectId: string) => {
      mocks.calls.push({ method: 'applyOwnerConfirmationFeedback', projectId })
      const failure = mocks.failures.shift()
      if (failure) throw failure
      return { qualityFeedbackEvents: 1 }
    }),
  })),
}))

const {
  runWarningImpactSignalGovernanceSweep,
  warningImpactSignalGovernanceJob,
} = await import('../jobs/warningImpactSignalGovernanceJob.js')

describe('warningImpactSignalGovernanceJob', () => {
  beforeEach(() => {
    mocks.activeProjectIds = ['project-1']
    mocks.calls = []
    mocks.failures = []
    mocks.leaseAcquired = true
    mocks.leaseCalls = []
    mocks.leaseAssertions = 0
  })

  it('runs lifecycle sync and governance artifact recording for each active project', async () => {
    const result = await warningImpactSignalGovernanceJob.executeNow()

    expect(result).toMatchObject({ total: 1, scanned: 1, failed: 0 })
    expect(mocks.leaseCalls).toEqual([
      expect.objectContaining({ jobName: 'warningImpactSignalGovernanceJob' }),
    ])
    expect(mocks.leaseAssertions).toBeGreaterThanOrEqual(2)
    expect(mocks.calls).toEqual([
      { method: 'syncImpactSignalWarningLifecycle', projectId: 'project-1', options: expect.objectContaining({
        scanOptions: expect.objectContaining({
          changedSince: expect.any(String),
          limit: 500,
        }),
      }) },
      { method: 'recordImpactSignalGovernanceArtifacts', projectId: 'project-1', options: expect.objectContaining({
        scanOptions: expect.objectContaining({
          changedSince: expect.any(String),
          limit: 500,
        }),
      }) },
      { method: 'applyOwnerConfirmationFeedback', projectId: 'project-1' },
    ])
  })

  it('keeps sweeping remaining projects when one project governance sync fails', async () => {
    mocks.activeProjectIds = ['project-1', 'project-2']
    mocks.failures = [new Error('bad project')]

    const result = await runWarningImpactSignalGovernanceSweep()

    expect(result).toMatchObject({ total: 2, scanned: 2, failed: 1 })
    expect(mocks.calls.map((call) => call.projectId)).toContain('project-2')
  })

  it('allows manual sweeps to pass explicit incremental scan options', async () => {
    const result = await runWarningImpactSignalGovernanceSweep(['project-1'], {
      scanOptions: {
        taskIds: ['task-1'],
        changedSince: '2026-05-25T00:00:00.000Z',
        limit: 50,
      },
    })

    expect(result).toMatchObject({ total: 1, scanned: 1, failed: 0 })
    expect(mocks.calls).toContainEqual({
      method: 'syncImpactSignalWarningLifecycle',
      projectId: 'project-1',
      options: {
        scanOptions: {
          taskIds: ['task-1'],
          changedSince: '2026-05-25T00:00:00.000Z',
          limit: 50,
        },
      },
    })
    expect(mocks.calls).toContainEqual({
      method: 'recordImpactSignalGovernanceArtifacts',
      projectId: 'project-1',
      options: {
        scanOptions: {
          taskIds: ['task-1'],
          changedSince: '2026-05-25T00:00:00.000Z',
          limit: 50,
        },
      },
    })
  })

  it('skips the governance sweep when another instance owns the lease', async () => {
    mocks.leaseAcquired = false

    const result = await warningImpactSignalGovernanceJob.executeNow()

    expect(result).toEqual(expect.objectContaining({ total: 0, scanned: 0, failed: 0 }))
    expect(mocks.calls).toEqual([])
  })
})
