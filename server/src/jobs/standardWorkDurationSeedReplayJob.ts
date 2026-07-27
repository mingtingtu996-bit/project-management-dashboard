import { logger } from '../middleware/logger.js'
import { listActiveProjectIds } from '../services/activeProjectService.js'
import { runJobWithRetry } from '../services/jobRuntime.js'
import { PersistentWallClockJobTimer } from '../services/persistentJobScheduleService.js'
import { createStandardWorkDurationReplayUpgradeCandidates } from '../services/standardWorkDurationSeedReplayCandidateBridgeService.js'
import { buildStandardWorkDurationSeedReplayGovernanceReport } from '../services/standardWorkDurationSeedReplayGovernanceService.js'

function createJobId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

export type StandardWorkDurationSeedReplayJobResult = {
  scannedProjects: number
  completedReports: number
  failedReports: number
  evaluatedCodeCount: number
  trustedCodeCount: number
  reviewRequiredCodeCount: number
  unresolvedCodeCount: number
  insufficientSampleGroupCount: number
  p50ReviewCandidateCount: number
  missingSeedCandidateCount: number
  evidenceCollectionCandidateCount: number
  seedWritesBlocked: number
  replayUpgradeCandidateAttemptCount: number
  replayUpgradeCandidateOnlyUpsertedCount: number
  replayP50ReviewCandidateOnlyCount: number
  replayMissingSeedCandidateOnlyCount: number
  replayEvidenceCollectionSkippedCount: number
  replayUpgradeCandidateFailedCount: number
}

function emptyResult(): StandardWorkDurationSeedReplayJobResult {
  return {
    scannedProjects: 0,
    completedReports: 0,
    failedReports: 0,
    evaluatedCodeCount: 0,
    trustedCodeCount: 0,
    reviewRequiredCodeCount: 0,
    unresolvedCodeCount: 0,
    insufficientSampleGroupCount: 0,
    p50ReviewCandidateCount: 0,
    missingSeedCandidateCount: 0,
    evidenceCollectionCandidateCount: 0,
    seedWritesBlocked: 0,
    replayUpgradeCandidateAttemptCount: 0,
    replayUpgradeCandidateOnlyUpsertedCount: 0,
    replayP50ReviewCandidateOnlyCount: 0,
    replayMissingSeedCandidateOnlyCount: 0,
    replayEvidenceCollectionSkippedCount: 0,
    replayUpgradeCandidateFailedCount: 0,
  }
}

function addReportSummary(result: StandardWorkDurationSeedReplayJobResult, report: Awaited<ReturnType<typeof buildStandardWorkDurationSeedReplayGovernanceReport>>) {
  const summary = report.replay.summary
  result.completedReports += 1
  result.evaluatedCodeCount += summary.evaluatedCodeCount
  result.trustedCodeCount += summary.trustedCodeCount
  result.reviewRequiredCodeCount += summary.reviewRequiredCodeCount
  result.unresolvedCodeCount += summary.unresolvedCodeCount
  result.insufficientSampleGroupCount += summary.insufficientSampleGroupCount
  result.p50ReviewCandidateCount += report.replay.calibrationQueues.p50ReviewCandidates.length
  result.missingSeedCandidateCount += report.replay.calibrationQueues.missingSeedCandidates.length
  result.evidenceCollectionCandidateCount += report.replay.calibrationQueues.evidenceCollectionCandidates.length
  if (
    report.governanceBoundary.seedWritePolicy === 'never_write_seed_from_replay'
    && report.replay.governancePolicy.seedWritePolicy === 'never_write_seed_from_replay'
  ) {
    result.seedWritesBlocked += 1
  }
}

async function addReplayCandidateBridgeSummary(
  result: StandardWorkDurationSeedReplayJobResult,
  report: Awaited<ReturnType<typeof buildStandardWorkDurationSeedReplayGovernanceReport>>,
) {
  try {
    const bridge = await createStandardWorkDurationReplayUpgradeCandidates(report)
    result.replayUpgradeCandidateAttemptCount += bridge.attemptedCandidateCount
    result.replayUpgradeCandidateOnlyUpsertedCount += bridge.candidateOnlyUpsertedCount
    result.replayP50ReviewCandidateOnlyCount += bridge.p50ReviewCandidateOnlyCount
    result.replayMissingSeedCandidateOnlyCount += bridge.missingSeedCandidateOnlyCount
    result.replayEvidenceCollectionSkippedCount += bridge.evidenceCollectionSkippedCount
    result.replayUpgradeCandidateFailedCount += bridge.failedCandidateCount
  } catch (error) {
    const attemptedCandidateCount = report.replay.calibrationQueues.p50ReviewCandidates.length
      + report.replay.calibrationQueues.missingSeedCandidates.length
    result.replayUpgradeCandidateAttemptCount += attemptedCandidateCount
    result.replayUpgradeCandidateFailedCount += attemptedCandidateCount
    logger.warn('[standardWorkDurationSeedReplayJob] replay candidate bridge failed', {
      projectId: report.projectId,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

export async function runStandardWorkDurationSeedReplaySweep(params: {
  projectIds?: string[] | null
  minSamplesPerCode?: number
  maxSamples?: number
  toleranceRatio?: number
} = {}): Promise<StandardWorkDurationSeedReplayJobResult> {
  const projectIds = await listActiveProjectIds(params.projectIds)
  const result = emptyResult()

  for (const projectId of projectIds) {
    result.scannedProjects += 1
    try {
      const report = await buildStandardWorkDurationSeedReplayGovernanceReport({
        projectId,
        minSamplesPerCode: params.minSamplesPerCode ?? 5,
        maxSamples: params.maxSamples ?? 1000,
        toleranceRatio: params.toleranceRatio ?? 0.3,
      })
      addReportSummary(result, report)
      await addReplayCandidateBridgeSummary(result, report)
    } catch (error) {
      result.failedReports += 1
      logger.warn('[standardWorkDurationSeedReplayJob] project replay report failed', {
        projectId,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  return result
}

export class StandardWorkDurationSeedReplayJob {
  private isRunning = false
  private lastRun: Date | null = null
  private nextRun: Date | null = null
  private wallClockTimer = new PersistentWallClockJobTimer({
    jobName: 'standardWorkDurationSeedReplayJob',
    schedule: { kind: 'daily', hour: 6, minute: 15 },
    execute: () => this.execute('scheduler'),
    onScheduled: ({ nextRun, delayMs }) => {
      this.nextRun = nextRun
      logger.info('standardWorkDurationSeedReplayJob scheduled', {
        nextRun: nextRun.toISOString(),
        trigger: 'daily_06_15',
        initialDelay: delayMs,
      })
    },
    onError: (error) => logger.error('standardWorkDurationSeedReplayJob scheduler failed', {
      error: error instanceof Error ? error.message : String(error),
    }),
  })

  start() {
    if (!this.wallClockTimer.start()) {
      logger.warn('standardWorkDurationSeedReplayJob is already running')
    }
  }

  stop() {
    this.wallClockTimer.stop()
    this.nextRun = null
    logger.info('standardWorkDurationSeedReplayJob stopped')
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      isScheduled: this.wallClockTimer.getStatus().isScheduled,
      lastRun: this.lastRun ? this.lastRun.toISOString() : null,
      nextRun: this.nextRun ? this.nextRun.toISOString() : null,
    }
  }

  async executeNow(projectIds?: string[] | null) {
    return this.execute('manual', projectIds)
  }

  private async execute(triggeredBy: 'scheduler' | 'manual', projectIds?: string[] | null) {
    if (this.isRunning) {
      logger.warn('standardWorkDurationSeedReplayJob is already running, skip tick', { triggeredBy })
      return null
    }

    this.isRunning = true
    const jobId = createJobId()
    try {
      this.lastRun = new Date()
      const { attempts, value } = await runJobWithRetry(
        {
          jobName: 'standardWorkDurationSeedReplayJob',
          triggeredBy,
          jobId,
        },
        async () => runStandardWorkDurationSeedReplaySweep({
          projectIds: Array.isArray(projectIds) ? projectIds : null,
        }),
      )

      logger.info('standardWorkDurationSeedReplayJob completed', {
        triggeredBy,
        jobId,
        attempts,
        ...value,
      })
      return value
    } catch (error) {
      logger.error('standardWorkDurationSeedReplayJob failed', {
        triggeredBy,
        jobId,
        error: error instanceof Error ? error.message : String(error),
      })
      if (triggeredBy === 'scheduler') throw error
      return null
    } finally {
      this.isRunning = false
    }
  }
}

export const standardWorkDurationSeedReplayJob = new StandardWorkDurationSeedReplayJob()
