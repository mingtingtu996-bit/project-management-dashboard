import { logger } from '../middleware/logger.js'
import { runJobWithRetry } from '../services/jobRuntime.js'
import { PersistentWallClockJobTimer } from '../services/persistentJobScheduleService.js'
import {
  runTemplateDurationGovernance,
  type TemplateDurationGovernanceResult,
} from '../services/templateDurationGovernanceService.js'
import { runWbsTemplateFeedbackGovernanceSweep } from '../services/wbsTemplateFeedback.js'

function createJobId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

export async function runTemplateDurationGovernanceSweep(params: {
  companyId?: string | null
} = {}): Promise<{
  durationBenchmarks: TemplateDurationGovernanceResult
  wbsTemplateFeedback: Awaited<ReturnType<typeof runWbsTemplateFeedbackGovernanceSweep>>
}> {
  const companyId = params.companyId ?? undefined
  const durationBenchmarks = await runTemplateDurationGovernance({
    companyId,
  })
  const wbsTemplateFeedback = await runWbsTemplateFeedbackGovernanceSweep({
    companyId,
  })
  return {
    durationBenchmarks,
    wbsTemplateFeedback,
  }
}

export class TemplateDurationGovernanceJob {
  private isRunning = false
  private lastRun: Date | null = null
  private nextRun: Date | null = null
  private wallClockTimer = new PersistentWallClockJobTimer({
    jobName: 'templateDurationGovernanceJob',
    schedule: { kind: 'daily', hour: 6, minute: 10 },
    execute: () => this.execute('scheduler'),
    onScheduled: ({ nextRun, delayMs }) => {
      this.nextRun = nextRun
      logger.info('templateDurationGovernanceJob scheduled', {
        nextRun: nextRun.toISOString(),
        trigger: 'daily_06_10',
        initialDelay: delayMs,
      })
    },
    onError: (error) => logger.error('templateDurationGovernanceJob scheduler failed', {
      error: error instanceof Error ? error.message : String(error),
    }),
  })

  start() {
    if (!this.wallClockTimer.start()) {
      logger.warn('templateDurationGovernanceJob is already running')
    }
  }

  stop() {
    this.wallClockTimer.stop()
    this.nextRun = null
    logger.info('templateDurationGovernanceJob stopped')
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      isScheduled: this.wallClockTimer.getStatus().isScheduled,
      lastRun: this.lastRun ? this.lastRun.toISOString() : null,
      nextRun: this.nextRun ? this.nextRun.toISOString() : null,
    }
  }

  async executeNow(companyId?: string | null) {
    return this.execute('manual', companyId)
  }

  private async execute(triggeredBy: 'scheduler' | 'manual', companyId?: string | null) {
    if (this.isRunning) {
      logger.warn('templateDurationGovernanceJob is already running, skip tick', { triggeredBy })
      return null
    }

    this.isRunning = true
    const jobId = createJobId()
    try {
      this.lastRun = new Date()
      const { attempts, value } = await runJobWithRetry(
        {
          jobName: 'templateDurationGovernanceJob',
          triggeredBy,
          jobId,
        },
        async () => runTemplateDurationGovernanceSweep({ companyId }),
      )

      logger.info('templateDurationGovernanceJob completed', {
        triggeredBy,
        jobId,
        attempts,
        ...value,
      })
      return value
    } catch (error) {
      logger.error('templateDurationGovernanceJob failed', {
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

export const templateDurationGovernanceJob = new TemplateDurationGovernanceJob()
