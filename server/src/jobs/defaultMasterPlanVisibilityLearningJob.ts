import { logger } from '../middleware/logger.js'
import { runDefaultMasterPlanVisibilityLearningSweep } from '../services/defaultMasterPlanVisibilityLearningService.js'
import { runJobWithRetry } from '../services/jobRuntime.js'
import { PersistentWallClockJobTimer } from '../services/persistentJobScheduleService.js'

function createJobId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

export class DefaultMasterPlanVisibilityLearningJob {
  private isRunning = false
  private lastRun: Date | null = null
  private nextRun: Date | null = null
  private wallClockTimer = new PersistentWallClockJobTimer({
    jobName: 'defaultMasterPlanVisibilityLearningJob',
    schedule: { kind: 'daily', hour: 6, minute: 35 },
    execute: () => this.execute('scheduler'),
    onScheduled: ({ nextRun, delayMs }) => {
      this.nextRun = nextRun
      logger.info('defaultMasterPlanVisibilityLearningJob scheduled', {
        nextRun: nextRun.toISOString(),
        trigger: 'daily_06_35',
        initialDelay: delayMs,
      })
    },
    onError: (error) => logger.error('defaultMasterPlanVisibilityLearningJob scheduler failed', {
      error: error instanceof Error ? error.message : String(error),
    }),
  })

  start() {
    if (!this.wallClockTimer.start()) {
      logger.warn('defaultMasterPlanVisibilityLearningJob is already running')
    }
  }

  stop() {
    this.wallClockTimer.stop()
    this.nextRun = null
    logger.info('defaultMasterPlanVisibilityLearningJob stopped')
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      isScheduled: this.wallClockTimer.getStatus().isScheduled,
      lastRun: this.lastRun ? this.lastRun.toISOString() : null,
      nextRun: this.nextRun ? this.nextRun.toISOString() : null,
    }
  }

  async executeNow() {
    return this.execute('manual')
  }

  private async execute(triggeredBy: 'scheduler' | 'manual') {
    if (this.isRunning) {
      logger.warn('defaultMasterPlanVisibilityLearningJob is already running, skip tick', { triggeredBy })
      return null
    }

    this.isRunning = true
    const jobId = createJobId()
    try {
      this.lastRun = new Date()
      const { attempts, value } = await runJobWithRetry(
        {
          jobName: 'defaultMasterPlanVisibilityLearningJob',
          triggeredBy,
          jobId,
        },
        async () => runDefaultMasterPlanVisibilityLearningSweep({}),
      )

      logger.info('defaultMasterPlanVisibilityLearningJob completed', {
        triggeredBy,
        jobId,
        attempts,
        ...value,
      })
      return value
    } catch (error) {
      logger.error('defaultMasterPlanVisibilityLearningJob failed', {
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

export const defaultMasterPlanVisibilityLearningJob = new DefaultMasterPlanVisibilityLearningJob()
