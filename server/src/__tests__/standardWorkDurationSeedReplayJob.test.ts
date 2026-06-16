import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  listActiveProjectIds: vi.fn(async (_projectIds?: string[] | null) => ['project-1', 'project-2']),
  buildStandardWorkDurationSeedReplayGovernanceReport: vi.fn(async ({ projectId }: { projectId?: string | null }) => ({
    reportCode: 'standard_work_duration_seed_replay_governance',
    projectId: projectId ?? null,
    replay: {
      summary: {
        evaluatedCodeCount: projectId === 'project-1' ? 2 : 1,
        trustedCodeCount: projectId === 'project-1' ? 1 : 0,
        reviewRequiredCodeCount: projectId === 'project-1' ? 1 : 1,
        unresolvedCodeCount: 0,
        insufficientSampleGroupCount: 0,
      },
      calibrationQueues: {
        p50ReviewCandidates: projectId === 'project-1'
          ? [{ standardWorkCode: 'review-code' }]
          : [{ standardWorkCode: 'review-code-2' }],
        missingSeedCandidates: projectId === 'project-1'
          ? [{ standardWorkCode: 'missing-code' }]
          : [],
        evidenceCollectionCandidates: projectId === 'project-1'
          ? []
          : [{ standardWorkCode: 'thin-code' }],
      },
      governancePolicy: {
        replayMode: 'report_only',
        seedWritePolicy: 'never_write_seed_from_replay',
        candidatePolicy: 'review_required_before_seed_promotion',
      },
    },
    governanceBoundary: {
      reportOnly: true,
      seedWritePolicy: 'never_write_seed_from_replay',
      promotionPolicy: 'review_required_before_seed_promotion',
      allowedUse: 'backend_governance_report',
    },
  })),
  createStandardWorkDurationReplayUpgradeCandidates: vi.fn(async (report: any) => ({
    attemptedCandidateCount: report.projectId === 'project-1' ? 2 : 1,
    candidateOnlyUpsertedCount: report.projectId === 'project-1' ? 2 : 1,
    p50ReviewCandidateOnlyCount: 1,
    missingSeedCandidateOnlyCount: report.projectId === 'project-1' ? 1 : 0,
    evidenceCollectionSkippedCount: report.projectId === 'project-1' ? 0 : 1,
    failedCandidateCount: 0,
    seedWritesBlocked: 1,
    failed: [],
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

vi.mock('../services/standardWorkDurationSeedReplayGovernanceService.js', () => ({
  buildStandardWorkDurationSeedReplayGovernanceReport: mocks.buildStandardWorkDurationSeedReplayGovernanceReport,
}))

vi.mock('../services/standardWorkDurationSeedReplayCandidateBridgeService.js', () => ({
  createStandardWorkDurationReplayUpgradeCandidates: mocks.createStandardWorkDurationReplayUpgradeCandidates,
}))

const {
  StandardWorkDurationSeedReplayJob,
  runStandardWorkDurationSeedReplaySweep,
} = await import('../jobs/standardWorkDurationSeedReplayJob.js')

describe('standardWorkDurationSeedReplayJob', () => {
  beforeEach(() => {
    mocks.listActiveProjectIds.mockClear()
    mocks.buildStandardWorkDurationSeedReplayGovernanceReport.mockClear()
    mocks.createStandardWorkDurationReplayUpgradeCandidates.mockClear()
  })

  it('runs report-only P50 replay for active projects and opens candidate-only replay promotion bridge', async () => {
    const result = await runStandardWorkDurationSeedReplaySweep({ projectIds: ['project-1', 'project-2'] })

    expect(mocks.listActiveProjectIds).toHaveBeenCalledWith(['project-1', 'project-2'])
    expect(mocks.buildStandardWorkDurationSeedReplayGovernanceReport).toHaveBeenCalledTimes(2)
    expect(mocks.buildStandardWorkDurationSeedReplayGovernanceReport).toHaveBeenCalledWith(expect.objectContaining({
      projectId: 'project-1',
      minSamplesPerCode: 5,
      maxSamples: 1000,
      toleranceRatio: 0.3,
    }))
    expect(mocks.createStandardWorkDurationReplayUpgradeCandidates).toHaveBeenCalledTimes(2)
    expect(mocks.createStandardWorkDurationReplayUpgradeCandidates).toHaveBeenCalledWith(expect.objectContaining({
      projectId: 'project-1',
      governanceBoundary: expect.objectContaining({
        reportOnly: true,
        seedWritePolicy: 'never_write_seed_from_replay',
      }),
    }))
    expect(result).toEqual({
      scannedProjects: 2,
      completedReports: 2,
      failedReports: 0,
      evaluatedCodeCount: 3,
      trustedCodeCount: 1,
      reviewRequiredCodeCount: 2,
      unresolvedCodeCount: 0,
      insufficientSampleGroupCount: 0,
      p50ReviewCandidateCount: 2,
      missingSeedCandidateCount: 1,
      evidenceCollectionCandidateCount: 1,
      seedWritesBlocked: 2,
      replayUpgradeCandidateAttemptCount: 3,
      replayUpgradeCandidateOnlyUpsertedCount: 3,
      replayP50ReviewCandidateOnlyCount: 2,
      replayMissingSeedCandidateOnlyCount: 1,
      replayEvidenceCollectionSkippedCount: 1,
      replayUpgradeCandidateFailedCount: 0,
    })
  })

  it('is schedulable, manually executable, and exposes last-run status', async () => {
    const job = new StandardWorkDurationSeedReplayJob()

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
