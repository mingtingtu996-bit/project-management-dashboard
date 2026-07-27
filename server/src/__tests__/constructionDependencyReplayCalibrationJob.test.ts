import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  listActiveProjectIds: vi.fn(async (projectIds?: string[] | null) => projectIds ?? ['project-1', 'project-2']),
  collectConstructionDependencyReplayCalibrationReport: vi.fn(async ({ projectIds }: { projectIds?: string[] }) => ({
    reportCode: 'construction_dependency_replay_calibration',
    governancePolicy: {
      replayMode: 'report_only',
      seedWritePolicy: 'never_write_seed_from_replay',
      taskDependencyWritePolicy: 'never_write_task_dependencies_from_replay',
      promotionPolicy: 'manual_seed_review_required',
    },
    summary: {
      inputDependencyCount: projectIds?.[0] === 'project-1' ? 4 : 2,
      matchedDependencyCount: projectIds?.[0] === 'project-1' ? 3 : 1,
      comparableActualDateCount: projectIds?.[0] === 'project-1' ? 3 : 1,
      l3MatchedDependencyCount: projectIds?.[0] === 'project-1' ? 2 : 1,
      l4MatchedDependencyCount: projectIds?.[0] === 'project-1' ? 1 : 0,
      validatedDependencyCount: projectIds?.[0] === 'project-1' ? 1 : 0,
      reviewRequiredDependencyCount: projectIds?.[0] === 'project-1' ? 2 : 1,
      conflictDependencyCount: projectIds?.[0] === 'project-1' ? 1 : 0,
      insufficientActualDateCount: 0,
      unmatchedSeedCount: projectIds?.[0] === 'project-1' ? 1 : 1,
    },
    calibrationQueues: {
      l3LagCalibrationCandidates: projectIds?.[0] === 'project-1' ? [{ matchedSeedCode: 'l3-seed-a' }, { matchedSeedCode: 'l3-seed-b' }] : [{ matchedSeedCode: 'l3-seed-a' }],
      l4ConflictQuarantineCandidates: projectIds?.[0] === 'project-1' ? [{ matchedSeedCode: 'l4-gate-a' }] : [],
      evidenceCollectionCandidates: [],
    },
    items: [],
  })),
  persistConstructionDependencyReplayCalibrationReport: vi.fn(async () => ({
    persisted: true,
    reportId: 'report-row-1',
  })),
  persistConstructionDependencyReplayCalibrationCandidatesFromReport: vi.fn(async () => ({
    persistedEventCount: 1,
    recordedOutcomeCount: 1,
  })),
}))

vi.mock('../services/activeProjectService.js', () => ({
  listActiveProjectIds: mocks.listActiveProjectIds,
}))

vi.mock('../services/jobRuntime.js', () => ({
  runJobWithRetry: async (_context: any, runner: () => Promise<any>) => ({
    attempts: 1,
    value: await runner(),
  }),
}))

vi.mock('../services/constructionDependencyReplayCalibrationService.js', () => ({
  collectConstructionDependencyReplayCalibrationReport: mocks.collectConstructionDependencyReplayCalibrationReport,
  persistConstructionDependencyReplayCalibrationCandidatesFromReport: mocks.persistConstructionDependencyReplayCalibrationCandidatesFromReport,
}))

vi.mock('../services/constructionDependencyReplayCalibrationPersistenceService.js', () => ({
  persistConstructionDependencyReplayCalibrationReport: mocks.persistConstructionDependencyReplayCalibrationReport,
}))

const {
  ConstructionDependencyReplayCalibrationJob,
  runConstructionDependencyReplayCalibrationSweep,
} = await import('../jobs/constructionDependencyReplayCalibrationJob.js')

describe('constructionDependencyReplayCalibrationJob', () => {
  beforeEach(() => {
    mocks.listActiveProjectIds.mockClear()
    mocks.collectConstructionDependencyReplayCalibrationReport.mockClear()
    mocks.persistConstructionDependencyReplayCalibrationReport.mockClear()
    mocks.persistConstructionDependencyReplayCalibrationCandidatesFromReport.mockReset()
    mocks.persistConstructionDependencyReplayCalibrationCandidatesFromReport.mockResolvedValue({
      persistedEventCount: 1,
      recordedOutcomeCount: 1,
    })
  })

  it('persists real dependency candidates and project-scoped network outcomes without writing seeds or task dependencies', async () => {
    const result = await runConstructionDependencyReplayCalibrationSweep({ projectIds: ['project-1', 'project-2'] })

    expect(mocks.listActiveProjectIds).toHaveBeenCalledWith(['project-1', 'project-2'])
    expect(mocks.collectConstructionDependencyReplayCalibrationReport).toHaveBeenCalledTimes(2)
    expect(mocks.collectConstructionDependencyReplayCalibrationReport).toHaveBeenCalledWith(expect.objectContaining({
      projectIds: ['project-1'],
      maxSamples: 1000,
      zeroLagReviewThresholdDays: 2,
    }))
    expect(mocks.persistConstructionDependencyReplayCalibrationReport).toHaveBeenCalledTimes(2)
    expect(mocks.persistConstructionDependencyReplayCalibrationCandidatesFromReport).toHaveBeenCalledTimes(2)
    expect(mocks.persistConstructionDependencyReplayCalibrationCandidatesFromReport).toHaveBeenCalledWith(
      expect.objectContaining({ report: expect.any(Object), projectId: 'project-1' }),
    )
    expect(mocks.persistConstructionDependencyReplayCalibrationReport).toHaveBeenCalledWith(expect.objectContaining({
      projectId: 'project-1',
      triggeredBy: 'scheduled_or_manual_governance_job',
      report: expect.objectContaining({
        reportCode: 'construction_dependency_replay_calibration',
        governancePolicy: expect.objectContaining({
          seedWritePolicy: 'never_write_seed_from_replay',
          taskDependencyWritePolicy: 'never_write_task_dependencies_from_replay',
        }),
      }),
    }))
    expect(result).toEqual({
      scannedProjects: 2,
      completedReports: 2,
      failedReports: 0,
      persistedReportCount: 2,
      reportPersistenceFailedCount: 0,
      producerCandidateEventCount: 2,
      producerOutcomeCount: 2,
      producerFailedCount: 0,
      inputDependencyCount: 6,
      matchedDependencyCount: 4,
      comparableActualDateCount: 4,
      l3MatchedDependencyCount: 3,
      l4MatchedDependencyCount: 1,
      l3LagCalibrationCandidateCount: 3,
      l4ConflictQuarantineCandidateCount: 1,
      evidenceCollectionCandidateCount: 0,
      seedWritesBlocked: 2,
      taskDependencyWritesBlocked: 2,
    })
  })

  it('can skip the report snapshot while still producing project-scoped candidates and outcomes', async () => {
    const result = await runConstructionDependencyReplayCalibrationSweep({
      projectIds: ['project-1'],
      writeReports: false,
    })

    expect(mocks.persistConstructionDependencyReplayCalibrationReport).not.toHaveBeenCalled()
    expect(mocks.persistConstructionDependencyReplayCalibrationCandidatesFromReport).toHaveBeenCalledOnce()
    expect(result.completedReports).toBe(1)
    expect(result.producerCandidateEventCount).toBe(1)
    expect(result.producerOutcomeCount).toBe(1)
    expect(result.persistedReportCount).toBe(0)
    expect(result.reportPersistenceFailedCount).toBe(0)
  })

  it('fails the sweep when any project producer cannot persist its outcome so the outer job can retry', async () => {
    mocks.persistConstructionDependencyReplayCalibrationCandidatesFromReport
      .mockResolvedValueOnce({ persistedEventCount: 1, recordedOutcomeCount: 1 })
      .mockRejectedValueOnce(new Error('outcome insert failed'))

    await expect(runConstructionDependencyReplayCalibrationSweep({
      projectIds: ['project-1', 'project-2'],
    })).rejects.toMatchObject({
      code: 'CONSTRUCTION_DEPENDENCY_REPLAY_PARTIAL_FAILURE',
      result: expect.objectContaining({
        producerFailedCount: 1,
        failedReports: 1,
      }),
    })
  })

  it('is schedulable, manually executable, and exposes last-run status', async () => {
    const job = new ConstructionDependencyReplayCalibrationJob()

    expect(job.getStatus()).toMatchObject({
      isRunning: false,
      isScheduled: false,
      lastRun: null,
      nextRun: null,
    })

    const result = await job.executeNow(['project-1'])

    expect(result?.completedReports).toBe(1)
    expect(job.getStatus()).toEqual(expect.objectContaining({
      isRunning: false,
      isScheduled: false,
      lastRun: expect.any(String),
    }))
  })
})
