import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  listActiveProjectIds: vi.fn(async (_projectIds?: string[] | null) => ['project-1', 'project-2']),
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
  })

  it('runs and persists report-only L3/L4 replay calibration queues across active projects without writing seeds or task dependencies', async () => {
    const result = await runConstructionDependencyReplayCalibrationSweep({ projectIds: ['project-1', 'project-2'] })

    expect(mocks.listActiveProjectIds).toHaveBeenCalledWith(['project-1', 'project-2'])
    expect(mocks.collectConstructionDependencyReplayCalibrationReport).toHaveBeenCalledTimes(2)
    expect(mocks.collectConstructionDependencyReplayCalibrationReport).toHaveBeenCalledWith(expect.objectContaining({
      projectIds: ['project-1'],
      maxSamples: 1000,
      zeroLagReviewThresholdDays: 2,
    }))
    expect(mocks.persistConstructionDependencyReplayCalibrationReport).toHaveBeenCalledTimes(2)
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

  it('can run without persistence for dry-run governance checks', async () => {
    const result = await runConstructionDependencyReplayCalibrationSweep({
      projectIds: ['project-1'],
      writeReports: false,
    })

    expect(mocks.persistConstructionDependencyReplayCalibrationReport).not.toHaveBeenCalled()
    expect(result.persistedReportCount).toBe(0)
    expect(result.reportPersistenceFailedCount).toBe(0)
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

    expect(result?.completedReports).toBe(2)
    expect(job.getStatus()).toEqual(expect.objectContaining({
      isRunning: false,
      isScheduled: false,
      lastRun: expect.any(String),
    }))
  })
})
