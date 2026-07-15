import { logger } from '../middleware/logger.js'
import {
  loadLatestCertificatePolicyAutoPublishRun,
  persistCertificatePolicyAutoPublishRun,
  publishCertificatePolicyAutoPublishPlanWithSourceSnapshots,
  type BuildCertificatePolicyUpdateOptions,
  type CertificatePolicyReplayCalibrationSample,
} from '../services/certificateTemplatePolicyUpdateService.js'
import { collectCertificatePolicyReplayCalibrationSamples } from '../services/certificatePolicyReplayCalibrationService.js'
import { runJobWithRetry } from '../services/jobRuntime.js'
import { PersistentWallClockJobTimer } from '../services/persistentJobScheduleService.js'

function createJobId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

export interface CertificateTemplatePolicyAutoPublishJobOptions {
  useLiveSourceSnapshots?: boolean
  sourceSnapshotProvider?: BuildCertificatePolicyUpdateOptions['sourceSnapshotProvider']
  replaySampleProvider?: () => Promise<CertificatePolicyReplayCalibrationSample[]>
  replaySampleLimit?: number
}

export class CertificateTemplatePolicyAutoPublishJob {
  private isRunning = false
  private lastRun: Date | null = null
  private nextRun: Date | null = null
  private wallClockTimer: PersistentWallClockJobTimer

  constructor(private readonly options: CertificateTemplatePolicyAutoPublishJobOptions = {}) {
    this.wallClockTimer = new PersistentWallClockJobTimer({
      jobName: 'certificateTemplatePolicyAutoPublishJob',
      schedule: { kind: 'daily', hour: 5, minute: 25 },
      execute: () => this.execute('scheduler'),
      onScheduled: ({ nextRun, delayMs }) => {
        this.nextRun = nextRun
        logger.info('certificateTemplatePolicyAutoPublishJob scheduled', {
          nextRun: nextRun.toISOString(),
          trigger: 'daily_05_25',
          initialDelay: delayMs,
        })
      },
      onError: (error) => logger.error('certificateTemplatePolicyAutoPublishJob scheduler failed', {
        error: error instanceof Error ? error.message : String(error),
      }),
    })
  }

  start() {
    if (!this.wallClockTimer.start()) {
      logger.warn('certificateTemplatePolicyAutoPublishJob is already running')
    }
  }

  stop() {
    this.wallClockTimer.stop()
    this.nextRun = null
    logger.info('certificateTemplatePolicyAutoPublishJob stopped')
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
      logger.warn('certificateTemplatePolicyAutoPublishJob is already running, skip tick', { triggeredBy })
      return null
    }

    this.isRunning = true
    const jobId = createJobId()
    try {
      this.lastRun = new Date()
      const { attempts, value } = await runJobWithRetry(
        {
          jobName: 'certificateTemplatePolicyAutoPublishJob',
          triggeredBy,
          jobId,
        },
        async () => {
          let previousAutoPublishRun = null
          try {
            previousAutoPublishRun = await loadLatestCertificatePolicyAutoPublishRun()
          } catch (error) {
            logger.warn('certificateTemplatePolicyAutoPublishJob latest run lookup skipped', {
              triggeredBy,
              jobId,
              error: error instanceof Error ? error.message : String(error),
            })
          }
          let replaySamples: CertificatePolicyReplayCalibrationSample[] = []
          try {
            replaySamples = this.options.replaySampleProvider
              ? await this.options.replaySampleProvider()
              : await collectCertificatePolicyReplayCalibrationSamples({
                maxSamples: this.options.replaySampleLimit,
                includeOfficialPublicSamples: true,
                systemJob: true,
              })
          } catch (error) {
            logger.warn('certificateTemplatePolicyAutoPublishJob replay sample lookup skipped', {
              triggeredBy,
              jobId,
              error: error instanceof Error ? error.message : String(error),
            })
          }
          const run = await publishCertificatePolicyAutoPublishPlanWithSourceSnapshots({
            asOfDate: asOfDate ?? undefined,
            useLiveSourceSnapshots: this.options.useLiveSourceSnapshots ?? true,
            sourceSnapshotProvider: this.options.sourceSnapshotProvider,
            previousAutoPublishRun,
            replaySamples,
          })
          try {
            await persistCertificatePolicyAutoPublishRun(run)
          } catch (error) {
            logger.warn('certificateTemplatePolicyAutoPublishJob audit persistence skipped', {
              triggeredBy,
              jobId,
              runId: run.runId,
              error: error instanceof Error ? error.message : String(error),
            })
          }
          return run
        },
      )

      logger.info('certificateTemplatePolicyAutoPublishJob completed', {
        triggeredBy,
        jobId,
        attempts,
        publicationStatus: value.publicationStatus,
        autoPublishedUpdateCount: value.summary.autoPublishedUpdateCount,
        blockedUpdateCount: value.summary.blockedUpdateCount,
      })
      return value
    } catch (error) {
      logger.error('certificateTemplatePolicyAutoPublishJob failed', {
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

export const certificateTemplatePolicyAutoPublishJob = new CertificateTemplatePolicyAutoPublishJob()
