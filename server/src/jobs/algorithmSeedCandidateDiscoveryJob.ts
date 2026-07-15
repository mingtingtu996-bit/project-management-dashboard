import { logger } from '../middleware/logger.js'
import { discoverAlgorithmSeedUpgradeCandidates } from '../services/algorithmSeedCandidateDiscoveryService.js'
import { runJobWithRetry } from '../services/jobRuntime.js'
import { PersistentWallClockJobTimer } from '../services/persistentJobScheduleService.js'

function createJobId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

export class AlgorithmSeedCandidateDiscoveryJob {
  private isRunning = false
  private lastRun: Date | null = null
  private nextRun: Date | null = null
  private wallClockTimer = new PersistentWallClockJobTimer({
    jobName: 'algorithmSeedCandidateDiscoveryJob',
    schedule: { kind: 'daily', hour: 5, minute: 40 },
    execute: () => this.execute('scheduler'),
    onScheduled: ({ nextRun, delayMs }) => {
      this.nextRun = nextRun
      logger.info('algorithmSeedCandidateDiscoveryJob scheduled', {
        nextRun: nextRun.toISOString(),
        trigger: 'daily_05_40',
        initialDelay: delayMs,
      })
    },
    onError: (error) => logger.error('algorithmSeedCandidateDiscoveryJob scheduler failed', {
      error: error instanceof Error ? error.message : String(error),
    }),
  })

  start() {
    if (!this.wallClockTimer.start()) {
      logger.warn('algorithmSeedCandidateDiscoveryJob is already running')
    }
  }

  stop() {
    this.wallClockTimer.stop()
    this.nextRun = null
    logger.info('algorithmSeedCandidateDiscoveryJob stopped')
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
      logger.warn('algorithmSeedCandidateDiscoveryJob is already running, skip tick', { triggeredBy })
      return null
    }

    this.isRunning = true
    const jobId = createJobId()
    try {
      this.lastRun = new Date()
      const { attempts, value } = await runJobWithRetry(
        {
          jobName: 'algorithmSeedCandidateDiscoveryJob',
          triggeredBy,
          jobId,
        },
        async () => discoverAlgorithmSeedUpgradeCandidates({
          projectIds: Array.isArray(projectIds) ? projectIds : null,
          triggeredBy: null,
          autoGovern: true,
        }),
      )

      logger.info('algorithmSeedCandidateDiscoveryJob completed', {
        triggeredBy,
        jobId,
        attempts,
        ...value,
      })
      return value
    } catch (error) {
      logger.error('algorithmSeedCandidateDiscoveryJob failed', {
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

export const algorithmSeedCandidateDiscoveryJob = new AlgorithmSeedCandidateDiscoveryJob()
