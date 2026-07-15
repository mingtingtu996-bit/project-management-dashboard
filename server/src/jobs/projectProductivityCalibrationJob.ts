import { logger } from '../middleware/logger.js'
import { listActiveProjectIds } from '../services/activeProjectService.js'
import { runJobWithRetry } from '../services/jobRuntime.js'
import { PersistentWallClockJobTimer } from '../services/persistentJobScheduleService.js'
import { runProjectProductivityCalibration } from '../services/projectProductivityCalibrationService.js'

function createJobId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10)
}

export type ProjectProductivityCalibrationJobResult = {
  scanned: number
  shadowRuns: number
  candidates: number
  published: number
  auditReplayRuns: number
  thresholdCandidates: number
  auditWarnings: number
  skipped: number
  failed: number
}

function emptyResult(): ProjectProductivityCalibrationJobResult {
  return {
    scanned: 0,
    shadowRuns: 0,
    candidates: 0,
    published: 0,
    auditReplayRuns: 0,
    thresholdCandidates: 0,
    auditWarnings: 0,
    skipped: 0,
    failed: 0,
  }
}

function addStatus(result: ProjectProductivityCalibrationJobResult, status?: string | null) {
  if (status === 'shadow') result.shadowRuns += 1
  else if (status === 'candidate') result.candidates += 1
  else if (status === 'published') result.published += 1
  else result.skipped += 1
}

function addGovernanceOutputs(result: ProjectProductivityCalibrationJobResult, calibration: {
  evidenceSummary?: Record<string, unknown>
  parameterPayload?: Record<string, unknown>
} | null | undefined) {
  const evidence = calibration?.evidenceSummary ?? {}
  const payload = calibration?.parameterPayload ?? {}
  const auditReplay = evidence.auditReplay as Record<string, unknown> | undefined
  if (auditReplay) {
    result.auditReplayRuns += 1
    const attribution = auditReplay.attribution as Record<string, unknown> | undefined
    const validation = auditReplay.jsonContractValidation as Record<string, unknown> | undefined
    const hasAuditWarning = attribution?.status === 'insufficient_observed_cases'
      || validation?.status === 'failed'
      || validation?.status === 'not_run_no_factor_summary_payload'
    if (hasAuditWarning) result.auditWarnings += 1
  }

  const thresholdCandidate = (payload.thresholdEvolutionCandidate ?? evidence.thresholdEvolutionCandidate) as Record<string, unknown> | undefined
  if (thresholdCandidate?.status === 'candidate') {
    result.thresholdCandidates += 1
  }
}

export async function runProjectProductivityCalibrationSweep(params: {
  projectIds?: string[] | null
  windowEndDate?: string | null
} = {}) {
  const projectIds = await listActiveProjectIds(params.projectIds)
  const result = emptyResult()
  const windowEndDate = params.windowEndDate || todayIsoDate()

  for (const projectId of projectIds) {
    result.scanned += 1
    try {
      const shadow = await runProjectProductivityCalibration({
        projectId,
        windowEndDate,
        windowDays: 30,
        actionPolicy: 'shadow_run',
      })
      addStatus(result, shadow?.status)
      addGovernanceOutputs(result, shadow)

      const governed = await runProjectProductivityCalibration({
        projectId,
        windowEndDate,
        windowDays: 90,
        actionPolicy: 'auto_publish',
      })
      addStatus(result, governed?.status)
      addGovernanceOutputs(result, governed)
    } catch (error) {
      result.failed += 1
      logger.warn('[projectProductivityCalibrationJob] project calibration failed', {
        projectId,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  return result
}

export class ProjectProductivityCalibrationJob {
  private isRunning = false
  private lastRun: Date | null = null
  private nextRun: Date | null = null
  private wallClockTimer = new PersistentWallClockJobTimer({
    jobName: 'projectProductivityCalibrationJob',
    schedule: { kind: 'daily', hour: 5, minute: 55 },
    execute: () => this.execute('scheduler'),
    onScheduled: ({ nextRun, delayMs }) => {
      this.nextRun = nextRun
      logger.info('projectProductivityCalibrationJob scheduled', {
        nextRun: nextRun.toISOString(),
        trigger: 'daily_05_55',
        initialDelay: delayMs,
      })
    },
    onError: (error) => logger.error('projectProductivityCalibrationJob scheduler failed', {
      error: error instanceof Error ? error.message : String(error),
    }),
  })

  start() {
    if (!this.wallClockTimer.start()) {
      logger.warn('projectProductivityCalibrationJob is already running')
    }
  }

  stop() {
    this.wallClockTimer.stop()
    this.nextRun = null
    logger.info('projectProductivityCalibrationJob stopped')
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
      logger.warn('projectProductivityCalibrationJob is already running, skip tick', { triggeredBy })
      return null
    }

    this.isRunning = true
    const jobId = createJobId()
    try {
      this.lastRun = new Date()
      const { attempts, value } = await runJobWithRetry(
        {
          jobName: 'projectProductivityCalibrationJob',
          triggeredBy,
          jobId,
        },
        async () => runProjectProductivityCalibrationSweep({
          projectIds: Array.isArray(projectIds) ? projectIds : null,
        }),
      )

      logger.info('projectProductivityCalibrationJob completed', {
        triggeredBy,
        jobId,
        attempts,
        ...value,
      })
      return value
    } catch (error) {
      logger.error('projectProductivityCalibrationJob failed', {
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

export const projectProductivityCalibrationJob = new ProjectProductivityCalibrationJob()
