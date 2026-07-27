import { logger } from '../middleware/logger.js'
import { runJobWithRetry } from '../services/jobRuntime.js'
import { PersistentWallClockJobTimer } from '../services/persistentJobScheduleService.js'
import {
  recoverPendingWizardPostCommitDerivations,
  recoverStaleWizardGenerationAttempts,
} from '../services/wizardGenerationRecoveryService.js'

const DEFAULT_INTERVAL_MS = 5 * 60 * 1000

function readPositiveIntEnv(name: string, fallback: number) {
  const parsed = Number(process.env[name])
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

export class WizardGenerationRecoveryJob {
  private wallClockTimer: PersistentWallClockJobTimer | null = null
  private isRunning = false

  start(intervalMs = readPositiveIntEnv('WIZARD_GENERATION_RECOVERY_INTERVAL_MS', DEFAULT_INTERVAL_MS)) {
    if (this.wallClockTimer?.getStatus().isScheduled) {
      logger.warn('Wizard generation recovery job is already running')
      return
    }

    const intervalMinutes = Math.min(60, Math.max(1, Math.ceil(intervalMs / 60_000)))
    this.wallClockTimer = new PersistentWallClockJobTimer({
      jobName: 'wizardGenerationRecoveryJob',
      schedule: { kind: 'minute_interval', intervalMinutes },
      catchUp: { limit: 1, maxAgeMs: intervalMinutes * 2 * 60_000 },
      execute: () => this.execute('scheduler'),
      onScheduled: ({ nextRun, delayMs }) => logger.info('Wizard generation recovery job scheduled', {
        nextRun: nextRun.toISOString(),
        intervalMinutes,
        initialDelay: delayMs,
      }),
      onError: (error) => logger.error('Wizard generation recovery scheduler failed', {
        error: error instanceof Error ? error.message : String(error),
      }),
    })
    this.wallClockTimer.start()
  }

  stop() {
    if (!this.wallClockTimer) return
    this.wallClockTimer.stop()
    this.wallClockTimer = null
    logger.info('Wizard generation recovery job stopped')
  }

  async executeNow() {
    return this.execute('manual')
  }

  private async execute(triggeredBy: 'scheduler' | 'manual') {
    if (this.isRunning) {
      logger.warn('Wizard generation recovery job is already running, skip tick')
      return null
    }

    this.isRunning = true
    const jobId = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`

    try {
      const { attempts, value } = await runJobWithRetry(
        {
          jobName: 'wizardGenerationRecoveryJob',
          triggeredBy,
          jobId,
        },
        async () => {
          const staleGenerationAttempts = await recoverStaleWizardGenerationAttempts()
          const postCommitDerivations = await recoverPendingWizardPostCommitDerivations()
          return {
            ...staleGenerationAttempts,
            postCommitDerivations,
          }
        },
      )

      logger.info('Wizard generation recovery job completed', {
        triggeredBy,
        jobId,
        attempts,
        ...value,
      })

      return value
    } catch (error) {
      logger.error('Wizard generation recovery job failed', {
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

export const wizardGenerationRecoveryJob = new WizardGenerationRecoveryJob()
