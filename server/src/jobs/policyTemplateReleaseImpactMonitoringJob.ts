import { logger } from '../middleware/logger.js'
import { executeSQL } from '../services/dbService.js'
import {
  loadLatestStableAcceptancePolicyAutoPublishRun,
  type AcceptancePolicyAutoPublishRun,
} from '../services/acceptanceTemplatePolicyUpdateService.js'
import {
  loadLatestStableCertificatePolicyAutoPublishRun,
  type CertificatePolicyAutoPublishRun,
} from '../services/certificateTemplatePolicyUpdateService.js'
import { runJobWithRetry } from '../services/jobRuntime.js'
import {
  executePolicyTemplateReleaseRollback,
  recordPolicyTemplateReleaseImpactMonitoring,
  type PolicyTemplateReleaseExecutionQueryExec,
} from '../services/policyTemplateReleaseExecutionService.js'
import { PersistentWallClockJobTimer } from '../services/persistentJobScheduleService.js'
import type { PolicyTemplateReleaseTargetTable } from '../services/policyTemplateReleaseAdapterService.js'

const DEFAULT_MONITORING_WINDOW_HOURS = 72

function createJobId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

export type PolicyTemplateReleaseMonitoringCandidate = {
  sourceRunId: string
  targetTable: PolicyTemplateReleaseTargetTable
  rollbackTarget: string
  monitoredAssetCount: number
  monitoringWindowHours?: number
  metrics?: Record<string, unknown>
  thresholdViolations?: string[]
}

export type PolicyTemplateReleaseImpactMonitoringSweepResult = {
  total: number
  monitored: number
  monitoringPassed: number
  monitoringFailed: number
  rollbackEvents: number
  failed: number
}

export type PolicyTemplateReleaseImpactMonitoringSweepInput = {
  queryExec?: PolicyTemplateReleaseExecutionQueryExec
  candidates?: PolicyTemplateReleaseMonitoringCandidate[] | null
  candidateProvider?: () => Promise<PolicyTemplateReleaseMonitoringCandidate[]>
  thresholdEvaluator?: (candidate: PolicyTemplateReleaseMonitoringCandidate) => string[]
  executedAt?: string
}

export type PolicyTemplateReleaseImpactMonitoringJobOptions = {
  queryExec?: PolicyTemplateReleaseExecutionQueryExec
  candidateProvider?: () => Promise<PolicyTemplateReleaseMonitoringCandidate[]>
  thresholdEvaluator?: (candidate: PolicyTemplateReleaseMonitoringCandidate) => string[]
}

function emptyResult(total = 0): PolicyTemplateReleaseImpactMonitoringSweepResult {
  return {
    total,
    monitored: 0,
    monitoringPassed: 0,
    monitoringFailed: 0,
    rollbackEvents: 0,
    failed: 0,
  }
}

function readThresholdViolations(
  candidate: PolicyTemplateReleaseMonitoringCandidate,
  thresholdEvaluator?: (candidate: PolicyTemplateReleaseMonitoringCandidate) => string[],
) {
  if (thresholdEvaluator) return thresholdEvaluator(candidate)
  return candidate.thresholdViolations ?? []
}

function buildCandidateFromRun(
  run: CertificatePolicyAutoPublishRun | AcceptancePolicyAutoPublishRun | null,
  targetTable: PolicyTemplateReleaseTargetTable,
  rollbackPrefix: 'certificate-template-policy' | 'acceptance-template-policy',
): PolicyTemplateReleaseMonitoringCandidate | null {
  if (!run) return null
  return {
    sourceRunId: run.runId,
    targetTable,
    rollbackTarget: `${rollbackPrefix}:${run.seedVersion}`,
    monitoredAssetCount: run.summary.autoPublishedUpdateCount,
    monitoringWindowHours: DEFAULT_MONITORING_WINDOW_HOURS,
    metrics: {
      autoPublishedUpdateCount: run.summary.autoPublishedUpdateCount,
      blockedUpdateCount: run.summary.blockedUpdateCount,
      policyOpsDecision: run.policyOpsDecision,
    },
    thresholdViolations: [],
  }
}

export async function collectStablePolicyTemplateReleaseMonitoringCandidates() {
  const [certificateRun, acceptanceRun] = await Promise.all([
    loadLatestStableCertificatePolicyAutoPublishRun(),
    loadLatestStableAcceptancePolicyAutoPublishRun(),
  ])
  return [
    buildCandidateFromRun(
      certificateRun,
      'certificate_template_policy_auto_publish_runs',
      'certificate-template-policy',
    ),
    buildCandidateFromRun(
      acceptanceRun,
      'acceptance_template_policy_auto_publish_runs',
      'acceptance-template-policy',
    ),
  ].filter((candidate): candidate is PolicyTemplateReleaseMonitoringCandidate => Boolean(candidate))
}

export async function runPolicyTemplateReleaseImpactMonitoringSweep(
  input: PolicyTemplateReleaseImpactMonitoringSweepInput = {},
) {
  const queryExec = input.queryExec ?? executeSQL
  const candidates = input.candidates ?? (
    input.candidateProvider
      ? await input.candidateProvider()
      : await collectStablePolicyTemplateReleaseMonitoringCandidates()
  )
  const result = emptyResult(candidates.length)
  const executedAt = input.executedAt ?? new Date().toISOString()

  for (const candidate of candidates) {
    try {
      const thresholdViolations = readThresholdViolations(candidate, input.thresholdEvaluator)
      const monitoring = await recordPolicyTemplateReleaseImpactMonitoring({
        queryExec,
        sourceRunId: candidate.sourceRunId,
        targetTable: candidate.targetTable,
        monitoredAssetCount: candidate.monitoredAssetCount,
        monitoringWindowHours: candidate.monitoringWindowHours ?? DEFAULT_MONITORING_WINDOW_HOURS,
        metrics: candidate.metrics,
        thresholdViolations,
        executedAt,
      })

      result.monitored += 1
      if (monitoring.status === 'monitoring_failed') {
        result.monitoringFailed += 1
        const rollback = await executePolicyTemplateReleaseRollback({
          queryExec,
          sourceRunId: candidate.sourceRunId,
          targetTable: candidate.targetTable,
          rollbackTarget: candidate.rollbackTarget,
          reason: 'impact_monitoring_failed',
          executedAt,
        })
        if (rollback.status === 'rollback_executed') result.rollbackEvents += 1
      } else {
        result.monitoringPassed += 1
      }
    } catch (error) {
      result.failed += 1
      logger.warn('policyTemplateReleaseImpactMonitoringJob candidate failed', {
        sourceRunId: candidate.sourceRunId,
        targetTable: candidate.targetTable,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  return result
}

export class PolicyTemplateReleaseImpactMonitoringJob {
  private isRunning = false
  private lastRun: Date | null = null
  private nextRun: Date | null = null
  private wallClockTimer: PersistentWallClockJobTimer

  constructor(private readonly options: PolicyTemplateReleaseImpactMonitoringJobOptions = {}) {
    this.wallClockTimer = new PersistentWallClockJobTimer({
      jobName: 'policyTemplateReleaseImpactMonitoringJob',
      schedule: { kind: 'daily', hour: 6, minute: 45 },
      execute: () => this.execute('scheduler'),
      onScheduled: ({ nextRun, delayMs }) => {
        this.nextRun = nextRun
        logger.info('policyTemplateReleaseImpactMonitoringJob scheduled', {
          nextRun: nextRun.toISOString(),
          trigger: 'daily_06_45',
          initialDelay: delayMs,
        })
      },
      onError: (error) => logger.error('policyTemplateReleaseImpactMonitoringJob scheduler failed', {
        error: error instanceof Error ? error.message : String(error),
      }),
    })
  }

  start() {
    if (!this.wallClockTimer.start()) {
      logger.warn('policyTemplateReleaseImpactMonitoringJob is already running')
    }
  }

  stop() {
    this.wallClockTimer.stop()
    this.nextRun = null
    logger.info('policyTemplateReleaseImpactMonitoringJob stopped')
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
      logger.warn('policyTemplateReleaseImpactMonitoringJob is already running, skip tick', { triggeredBy })
      return emptyResult()
    }

    this.isRunning = true
    const jobId = createJobId()
    try {
      this.lastRun = new Date()
      const { attempts, value } = await runJobWithRetry(
        {
          jobName: 'policyTemplateReleaseImpactMonitoringJob',
          triggeredBy,
          jobId,
        },
        async () => runPolicyTemplateReleaseImpactMonitoringSweep(this.options),
      )

      logger.info('policyTemplateReleaseImpactMonitoringJob completed', {
        triggeredBy,
        jobId,
        attempts,
        ...value,
      })
      return value
    } catch (error) {
      logger.error('policyTemplateReleaseImpactMonitoringJob failed', {
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

export const policyTemplateReleaseImpactMonitoringJob = new PolicyTemplateReleaseImpactMonitoringJob()
