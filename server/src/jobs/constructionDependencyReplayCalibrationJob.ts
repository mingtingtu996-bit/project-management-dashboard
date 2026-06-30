import { logger } from '../middleware/logger.js'
import { listActiveProjectIds } from '../services/activeProjectService.js'
import {
  collectConstructionDependencyReplayCalibrationReport,
  type ConstructionDependencyReplayCalibrationReport,
} from '../services/constructionDependencyReplayCalibrationService.js'
import { persistConstructionDependencyReplayCalibrationReport } from '../services/constructionDependencyReplayCalibrationPersistenceService.js'
import { runJobWithRetry } from '../services/jobRuntime.js'

const DAY_IN_MS = 24 * 60 * 60 * 1000

function createJobId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function nextDailyRunAt(hour: number, minute: number) {
  const now = new Date()
  const nextRun = new Date(now)
  nextRun.setHours(hour, minute, 0, 0)
  if (nextRun <= now) nextRun.setDate(nextRun.getDate() + 1)
  return nextRun
}

export type ConstructionDependencyReplayCalibrationJobResult = {
  scannedProjects: number
  completedReports: number
  failedReports: number
  persistedReportCount: number
  reportPersistenceFailedCount: number
  inputDependencyCount: number
  matchedDependencyCount: number
  comparableActualDateCount: number
  l3MatchedDependencyCount: number
  l4MatchedDependencyCount: number
  l3LagCalibrationCandidateCount: number
  l4ConflictQuarantineCandidateCount: number
  evidenceCollectionCandidateCount: number
  seedWritesBlocked: number
  taskDependencyWritesBlocked: number
}

function emptyResult(): ConstructionDependencyReplayCalibrationJobResult {
  return {
    scannedProjects: 0,
    completedReports: 0,
    failedReports: 0,
    persistedReportCount: 0,
    reportPersistenceFailedCount: 0,
    inputDependencyCount: 0,
    matchedDependencyCount: 0,
    comparableActualDateCount: 0,
    l3MatchedDependencyCount: 0,
    l4MatchedDependencyCount: 0,
    l3LagCalibrationCandidateCount: 0,
    l4ConflictQuarantineCandidateCount: 0,
    evidenceCollectionCandidateCount: 0,
    seedWritesBlocked: 0,
    taskDependencyWritesBlocked: 0,
  }
}

function addReportSummary(
  result: ConstructionDependencyReplayCalibrationJobResult,
  report: ConstructionDependencyReplayCalibrationReport,
) {
  const summary = report.summary
  result.completedReports += 1
  result.inputDependencyCount += summary.inputDependencyCount
  result.matchedDependencyCount += summary.matchedDependencyCount
  result.comparableActualDateCount += summary.comparableActualDateCount
  result.l3MatchedDependencyCount += summary.l3MatchedDependencyCount
  result.l4MatchedDependencyCount += summary.l4MatchedDependencyCount
  result.l3LagCalibrationCandidateCount += report.calibrationQueues.l3LagCalibrationCandidates.length
  result.l4ConflictQuarantineCandidateCount += report.calibrationQueues.l4ConflictQuarantineCandidates.length
  result.evidenceCollectionCandidateCount += report.calibrationQueues.evidenceCollectionCandidates.length
  if (report.governancePolicy.seedWritePolicy === 'never_write_seed_from_replay') {
    result.seedWritesBlocked += 1
  }
  if (report.governancePolicy.taskDependencyWritePolicy === 'never_write_task_dependencies_from_replay') {
    result.taskDependencyWritesBlocked += 1
  }
}

export async function runConstructionDependencyReplayCalibrationSweep(params: {
  projectIds?: string[] | null
  maxSamples?: number
  zeroLagReviewThresholdDays?: number
  writeReports?: boolean
} = {}): Promise<ConstructionDependencyReplayCalibrationJobResult> {
  const projectIds = await listActiveProjectIds(params.projectIds)
  const result = emptyResult()
  const runId = `construction-dependency-replay-${Date.now()}`

  for (const projectId of projectIds) {
    result.scannedProjects += 1
    try {
      const report = await collectConstructionDependencyReplayCalibrationReport({
        projectIds: [projectId],
        maxSamples: params.maxSamples ?? 1000,
        zeroLagReviewThresholdDays: params.zeroLagReviewThresholdDays ?? 2,
      })
      addReportSummary(result, report)
      if (params.writeReports !== false) {
        try {
          await persistConstructionDependencyReplayCalibrationReport({
            projectId,
            runId,
            triggeredBy: 'scheduled_or_manual_governance_job',
            report,
          })
          result.persistedReportCount += 1
        } catch (error) {
          result.reportPersistenceFailedCount += 1
          logger.warn('[constructionDependencyReplayCalibrationJob] report persistence failed', {
            projectId,
            runId,
            error: error instanceof Error ? error.message : String(error),
          })
        }
      }
    } catch (error) {
      result.failedReports += 1
      logger.warn('[constructionDependencyReplayCalibrationJob] project replay calibration failed', {
        projectId,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  return result
}

export class ConstructionDependencyReplayCalibrationJob {
  private timer: NodeJS.Timeout | null = null
  private startTimer: NodeJS.Timeout | null = null
  private isRunning = false
  private lastRun: Date | null = null
  private nextRun: Date | null = null

  start() {
    if (this.timer || this.startTimer) {
      logger.warn('constructionDependencyReplayCalibrationJob is already running')
      return
    }

    const nextRun = nextDailyRunAt(6, 30)
    this.nextRun = nextRun
    const initialDelay = Math.max(nextRun.getTime() - Date.now(), 0)
    logger.info('constructionDependencyReplayCalibrationJob scheduled', {
      nextRun: nextRun.toISOString(),
      trigger: 'daily_06_30',
      initialDelay,
    })

    this.startTimer = setTimeout(() => {
      this.startTimer = null
      void this.execute('scheduler')
      this.timer = setInterval(() => {
        this.nextRun = new Date(Date.now() + DAY_IN_MS)
        void this.execute('scheduler')
      }, DAY_IN_MS)
    }, initialDelay)
  }

  stop() {
    if (this.startTimer) {
      clearTimeout(this.startTimer)
      this.startTimer = null
    }
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
    this.nextRun = null
    logger.info('constructionDependencyReplayCalibrationJob stopped')
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      isScheduled: this.timer !== null || this.startTimer !== null,
      lastRun: this.lastRun ? this.lastRun.toISOString() : null,
      nextRun: this.nextRun ? this.nextRun.toISOString() : null,
    }
  }

  async executeNow(projectIds?: string[] | null) {
    return this.execute('manual', projectIds)
  }

  private async execute(triggeredBy: 'scheduler' | 'manual', projectIds?: string[] | null) {
    if (this.isRunning) {
      logger.warn('constructionDependencyReplayCalibrationJob is already running, skip tick', { triggeredBy })
      return null
    }

    this.isRunning = true
    const jobId = createJobId()
    try {
      this.lastRun = new Date()
      const { attempts, value } = await runJobWithRetry(
        {
          jobName: 'constructionDependencyReplayCalibrationJob',
          triggeredBy,
          jobId,
        },
        async () => runConstructionDependencyReplayCalibrationSweep({
          projectIds: Array.isArray(projectIds) ? projectIds : null,
        }),
      )

      logger.info('constructionDependencyReplayCalibrationJob completed', {
        triggeredBy,
        jobId,
        attempts,
        ...value,
      })
      return value
    } catch (error) {
      logger.error('constructionDependencyReplayCalibrationJob failed', {
        triggeredBy,
        jobId,
        error: error instanceof Error ? error.message : String(error),
      })
      return null
    } finally {
      this.isRunning = false
    }
  }
}

export const constructionDependencyReplayCalibrationJob = new ConstructionDependencyReplayCalibrationJob()
