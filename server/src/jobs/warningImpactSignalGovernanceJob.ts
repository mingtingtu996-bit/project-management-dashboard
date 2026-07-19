import { logger } from '../middleware/logger.js'
import { listActiveProjectIds } from '../services/activeProjectService.js'
import { runJobWithRetry, runWithJobLease } from '../services/jobRuntime.js'
import { PersistentWallClockJobTimer } from '../services/persistentJobScheduleService.js'
import { WarningService } from '../services/warningService.js'

const DEFAULT_INCREMENTAL_LOOKBACK_MS = 48 * 60 * 60 * 1000
const DEFAULT_INCREMENTAL_SCAN_LIMIT = 500

function createJobId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

export type WarningImpactSignalGovernanceJobResult = {
  total: number
  scanned: number
  failed: number
  lifecycleResolved: number
  lifecycleDowngraded: number
  coverageSnapshots: number
  thresholdCandidates: number
  ownerConfirmations: number
  ruleQualityEvents: number
  qualityFeedbackEvents: number
}

export type WarningImpactSignalGovernanceSweepOptions = {
  scanOptions?: {
    taskIds?: string[] | null
    changedSince?: string | Date | null
    limit?: number | null
  } | null
}

function emptyResult(total = 0): WarningImpactSignalGovernanceJobResult {
  return {
    total,
    scanned: 0,
    failed: 0,
    lifecycleResolved: 0,
    lifecycleDowngraded: 0,
    coverageSnapshots: 0,
    thresholdCandidates: 0,
    ownerConfirmations: 0,
    ruleQualityEvents: 0,
    qualityFeedbackEvents: 0,
  }
}

function defaultScanOptions() {
  return {
    changedSince: new Date(Date.now() - DEFAULT_INCREMENTAL_LOOKBACK_MS).toISOString(),
    limit: DEFAULT_INCREMENTAL_SCAN_LIMIT,
  }
}

export async function runWarningImpactSignalGovernanceSweep(
  projectIds?: string[] | null,
  options: WarningImpactSignalGovernanceSweepOptions = {},
) {
  const activeProjectIds = await listActiveProjectIds(projectIds)
  const result = emptyResult(activeProjectIds.length)
  const warningService = new WarningService()
  const scanOptions = options.scanOptions ?? defaultScanOptions()

  for (const projectId of activeProjectIds) {
    result.scanned += 1
    try {
      const lifecycle = await warningService.syncImpactSignalWarningLifecycle(projectId, { scanOptions })
      const artifacts = await warningService.recordImpactSignalGovernanceArtifacts(projectId, { scanOptions })
      const feedback = await warningService.applyOwnerConfirmationFeedback(projectId)

      result.lifecycleResolved += Number(lifecycle.resolvedCount ?? 0)
      result.lifecycleDowngraded += Number(lifecycle.downgradedCount ?? 0)
      result.coverageSnapshots += Number(artifacts.coverageSnapshots ?? 0)
      result.thresholdCandidates += Number(artifacts.thresholdCandidates ?? 0)
      result.ownerConfirmations += Number(artifacts.ownerConfirmations ?? 0)
      result.ruleQualityEvents += Number(artifacts.ruleQualityEvents ?? 0)
      result.qualityFeedbackEvents += Number(feedback.qualityFeedbackEvents ?? 0)
    } catch (error) {
      result.failed += 1
      logger.warn('[warningImpactSignalGovernanceJob] project governance sync failed', {
        projectId,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  return result
}

export class WarningImpactSignalGovernanceJob {
  private isRunning = false
  private lastRun: Date | null = null
  private nextRun: Date | null = null
  private wallClockTimer = new PersistentWallClockJobTimer({
    jobName: 'warningImpactSignalGovernanceJob',
    schedule: { kind: 'daily', hour: 1, minute: 20 },
    execute: () => this.execute('scheduler'),
    onScheduled: ({ nextRun, delayMs }) => {
      this.nextRun = nextRun
      logger.info('warningImpactSignalGovernanceJob scheduled', {
        nextRun: nextRun.toISOString(),
        trigger: 'daily_01_20',
        initialDelay: delayMs,
      })
    },
    onError: (error) => logger.error('warningImpactSignalGovernanceJob scheduler failed', {
      error: error instanceof Error ? error.message : String(error),
    }),
  })

  start() {
    if (!this.wallClockTimer.start()) {
      logger.warn('warningImpactSignalGovernanceJob is already running')
    }
  }

  stop() {
    this.wallClockTimer.stop()
    this.nextRun = null
    logger.info('warningImpactSignalGovernanceJob stopped')
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
      logger.warn('warningImpactSignalGovernanceJob is already running, skip tick', { triggeredBy })
      return emptyResult()
    }

    this.isRunning = true
    const jobId = createJobId()
    try {
      this.lastRun = new Date()
      const lease = await runWithJobLease(
        {
          jobName: 'warningImpactSignalGovernanceJob',
          jobId,
        },
        async (lease) => runJobWithRetry(
          {
            jobName: 'warningImpactSignalGovernanceJob',
            triggeredBy,
            jobId,
          },
          async () => {
            lease.assertActive()
            const value = await runWarningImpactSignalGovernanceSweep(
              Array.isArray(projectIds) ? projectIds : null,
            )
            lease.assertActive()
            return value
          },
        ),
      )

      if (!lease.acquired) {
        logger.warn('warningImpactSignalGovernanceJob skipped because distributed lease was not acquired', {
          triggeredBy,
          jobId,
          reason: 'lease_not_acquired',
        })
        return emptyResult()
      }

      const { attempts, value } = lease.value
      logger.info('warningImpactSignalGovernanceJob completed', {
        triggeredBy,
        jobId,
        attempts,
        ...value,
      })
      return value
    } catch (error) {
      logger.error('warningImpactSignalGovernanceJob failed', {
        triggeredBy,
        jobId,
        error: error instanceof Error ? error.message : String(error),
      })
      if (triggeredBy === 'scheduler') throw error
      return emptyResult()
    } finally {
      this.isRunning = false
    }
  }
}

export const warningImpactSignalGovernanceJob = new WarningImpactSignalGovernanceJob()
