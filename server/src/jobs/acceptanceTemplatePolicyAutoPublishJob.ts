import { logger } from '../middleware/logger.js'
import {
  type AcceptancePolicyAutoPublishRun,
  loadLatestAcceptancePolicyAutoPublishRun,
  persistAcceptancePolicyAutoPublishRun,
  publishAcceptancePolicyAutoPublishPlanWithSourceSnapshots,
  type AcceptancePolicyReplayCalibrationSample,
  type BuildAcceptancePolicyUpdateOptions,
  type PublishAcceptancePolicyAutoPublishOptions,
} from '../services/acceptanceTemplatePolicyUpdateService.js'
import { collectAcceptancePolicyReplayCalibrationSamples } from '../services/acceptancePolicyReplayCalibrationService.js'
import { runJobWithRetry } from '../services/jobRuntime.js'
import { PersistentWallClockJobTimer } from '../services/persistentJobScheduleService.js'

function createJobId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

export interface AcceptanceTemplatePolicyAutoPublishJobOptions {
  useLiveSourceSnapshots?: boolean
  sourceSnapshotProvider?: BuildAcceptancePolicyUpdateOptions['sourceSnapshotProvider']
  replaySampleProvider?: () => Promise<AcceptancePolicyReplayCalibrationSample[]>
  replaySampleLimit?: number
  latestRunLoader?: () => Promise<AcceptancePolicyAutoPublishRun | null>
  runPublisher?: (options: PublishAcceptancePolicyAutoPublishOptions) => Promise<AcceptancePolicyAutoPublishRun>
  runPersister?: (run: AcceptancePolicyAutoPublishRun) => Promise<unknown>
}

export class AcceptanceTemplatePolicyAutoPublishJob {
  private isRunning = false
  private lastRun: Date | null = null
  private nextRun: Date | null = null
  private wallClockTimer: PersistentWallClockJobTimer

  constructor(private readonly options: AcceptanceTemplatePolicyAutoPublishJobOptions = {}) {
    this.wallClockTimer = new PersistentWallClockJobTimer({
      jobName: 'acceptanceTemplatePolicyAutoPublishJob',
      schedule: { kind: 'daily', hour: 5, minute: 35 },
      execute: () => this.execute('scheduler'),
      onScheduled: ({ nextRun, delayMs }) => {
        this.nextRun = nextRun
        logger.info('acceptanceTemplatePolicyAutoPublishJob scheduled', {
          nextRun: nextRun.toISOString(),
          trigger: 'daily_05_35',
          initialDelay: delayMs,
        })
      },
      onError: (error) => logger.error('acceptanceTemplatePolicyAutoPublishJob scheduler failed', {
        error: error instanceof Error ? error.message : String(error),
      }),
    })
  }

  start() {
    if (!this.wallClockTimer.start()) {
      logger.warn('acceptanceTemplatePolicyAutoPublishJob is already running')
    }
  }

  stop() {
    this.wallClockTimer.stop()
    this.nextRun = null
    logger.info('acceptanceTemplatePolicyAutoPublishJob stopped')
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

  private async execute(triggeredBy: 'scheduler' | 'manual', asOfDate?: string | Date | null) {
    if (this.isRunning) {
      logger.warn('acceptanceTemplatePolicyAutoPublishJob is already running, skip tick', { triggeredBy })
      return null
    }

    this.isRunning = true
    const jobId = createJobId()
    try {
      this.lastRun = new Date()
      const { attempts, value } = await runJobWithRetry(
        {
          jobName: 'acceptanceTemplatePolicyAutoPublishJob',
          triggeredBy,
          jobId,
        },
        async () => {
          let previousAutoPublishRun = null
          try {
            previousAutoPublishRun = this.options.latestRunLoader
              ? await this.options.latestRunLoader()
              : await loadLatestAcceptancePolicyAutoPublishRun()
          } catch (error) {
            logger.warn('acceptanceTemplatePolicyAutoPublishJob latest run lookup skipped', {
              triggeredBy,
              jobId,
              error: error instanceof Error ? error.message : String(error),
            })
          }
          let replaySamples: AcceptancePolicyReplayCalibrationSample[] = []
          try {
            replaySamples = this.options.replaySampleProvider
              ? await this.options.replaySampleProvider()
              : await collectAcceptancePolicyReplayCalibrationSamples({
                maxSamples: this.options.replaySampleLimit,
                includeOfficialPublicSamples: true,
                systemJob: true,
              })
          } catch (error) {
            logger.warn('acceptanceTemplatePolicyAutoPublishJob replay sample lookup skipped', {
              triggeredBy,
              jobId,
              error: error instanceof Error ? error.message : String(error),
            })
          }
          const run = await (this.options.runPublisher ?? publishAcceptancePolicyAutoPublishPlanWithSourceSnapshots)({
            asOfDate: asOfDate ?? undefined,
            useLiveSourceSnapshots: this.options.useLiveSourceSnapshots ?? true,
            sourceSnapshotProvider: this.options.sourceSnapshotProvider,
            previousAutoPublishRun,
            replaySamples,
          })
          try {
            await (this.options.runPersister ?? persistAcceptancePolicyAutoPublishRun)(run)
          } catch (error) {
            logger.warn('acceptanceTemplatePolicyAutoPublishJob audit persistence skipped', {
              triggeredBy,
              jobId,
              runId: run.runId,
              error: error instanceof Error ? error.message : String(error),
            })
          }
          return run
        },
      )

      logger.info('acceptanceTemplatePolicyAutoPublishJob completed', {
        triggeredBy,
        jobId,
        attempts,
        publicationStatus: value.publicationStatus,
        autoPublishedUpdateCount: value.summary.autoPublishedUpdateCount,
        blockedUpdateCount: value.summary.blockedUpdateCount,
      })
      return value
    } catch (error) {
      logger.error('acceptanceTemplatePolicyAutoPublishJob failed', {
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

export const acceptanceTemplatePolicyAutoPublishJob = new AcceptanceTemplatePolicyAutoPublishJob()
