import { logger } from '../middleware/logger.js'
import {
  publishDrawingPackageExperienceIterationRunFromProjectExperience,
  type DrawingPackageExperienceIterationRun,
} from '../services/drawingPackageExperienceIterationService.js'
import { runJobWithRetry } from '../services/jobRuntime.js'
import { PersistentWallClockJobTimer } from '../services/persistentJobScheduleService.js'

function createJobId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

export class DrawingPackageExperienceIterationJob {
  private isRunning = false
  private lastRun: Date | null = null
  private nextRun: Date | null = null
  private wallClockTimer = new PersistentWallClockJobTimer({
    jobName: 'drawingPackageExperienceIterationJob',
    schedule: { kind: 'daily', hour: 5, minute: 45 },
    execute: () => this.execute('scheduler'),
    onScheduled: ({ nextRun, delayMs }) => {
      this.nextRun = nextRun
      logger.info('drawingPackageExperienceIterationJob scheduled', {
        nextRun: nextRun.toISOString(),
        trigger: 'daily_05_45',
        updateMode: 'real_project_experience_replay',
        initialDelay: delayMs,
      })
    },
    onError: (error) => logger.error('drawingPackageExperienceIterationJob scheduler failed', {
      error: error instanceof Error ? error.message : String(error),
    }),
  })

  start() {
    if (!this.wallClockTimer.start()) {
      logger.warn('drawingPackageExperienceIterationJob is already running')
    }
  }

  stop() {
    this.wallClockTimer.stop()
    this.nextRun = null
    logger.info('drawingPackageExperienceIterationJob stopped')
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      isScheduled: this.wallClockTimer.getStatus().isScheduled,
      lastRun: this.lastRun ? this.lastRun.toISOString() : null,
      nextRun: this.nextRun ? this.nextRun.toISOString() : null,
    }
  }

  async executeNow(asOfDate?: string | Date | null) {
    return this.execute('manual', asOfDate)
  }

  private async execute(triggeredBy: 'scheduler' | 'manual', asOfDate?: string | Date | null): Promise<DrawingPackageExperienceIterationRun | null> {
    if (this.isRunning) {
      logger.warn('drawingPackageExperienceIterationJob is already running, skip tick', { triggeredBy })
      return null
    }

    this.isRunning = true
    const jobId = createJobId()
    try {
      this.lastRun = new Date()
      const { attempts, value } = await runJobWithRetry(
        {
          jobName: 'drawingPackageExperienceIterationJob',
          triggeredBy,
          jobId,
        },
        async () => publishDrawingPackageExperienceIterationRunFromProjectExperience({
          asOfDate: asOfDate ?? undefined,
        }),
      )

      logger.info('drawingPackageExperienceIterationJob completed', {
        triggeredBy,
        jobId,
        attempts,
        publicationStatus: value.publicationStatus,
        updateMode: value.updateMode,
        additionalPackageCount: value.promotedOverlay.additionalPackageCodes.length,
      })
      return value
    } catch (error) {
      logger.error('drawingPackageExperienceIterationJob failed', {
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

export const drawingPackageExperienceIterationJob = new DrawingPackageExperienceIterationJob()
