import { logger } from '../middleware/logger.js'
import { runJobWithRetry } from '../services/jobRuntime.js'
import { PersistentWallClockJobTimer } from '../services/persistentJobScheduleService.js'
import {
  buildDurationLiveLearningProductionClaimAuditFromDb,
  type DurationLiveLearningProductionClaimAuditFromDb,
} from '../services/durationLiveLearningProductionEvidenceReaderService.js'

function createJobId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

export interface DurationLiveLearningProductionClaimAuditJobResult {
  jobCode: 'duration_live_learning_production_claim_audit'
  runtimeMutationPolicy: 'none_audit_only'
  factMutationPolicy: 'fact_and_commitment_assets_locked'
  status: DurationLiveLearningProductionClaimAuditFromDb['status']
  allowedClaim: DurationLiveLearningProductionClaimAuditFromDb['allowedClaim']
  prohibitedClaim: DurationLiveLearningProductionClaimAuditFromDb['prohibitedClaim']
  completionStatus: DurationLiveLearningProductionClaimAuditFromDb['completionAudit']['status']
  productionEvidenceStatus: DurationLiveLearningProductionClaimAuditFromDb['productionGate']['status']
  sourceRowCount: number
  blockedAssetCount: number
  missingProductionEvidenceAssetCount: number
  missingRuntimeConsumerObservationCount: number
  missingRuntimeCallCount: number
  missingBusinessPathIntegrationCount: number
  sourceRowsProvenanceStatus: DurationLiveLearningProductionClaimAuditFromDb['sourceRowsProvenanceGate']['status']
  factRewriteBlockedAssetCount: number
  rejectedProductionSourceRowCount: number
  rejectedProductionEvidenceRecordCount: number
  blockedAssets: DurationLiveLearningProductionClaimAuditFromDb['completionAudit']['blockedAssetKeys']
  missingProductionEvidence: DurationLiveLearningProductionClaimAuditFromDb['productionGate']['missingEvidenceByAsset']
  missingRuntimeConsumerObservations:
    DurationLiveLearningProductionClaimAuditFromDb['runtimeConsumerObservationCoverage']['missingConsumerObservations']
  missingRuntimeCalls:
    DurationLiveLearningProductionClaimAuditFromDb['runtimeConsumerRuntimeCallCoverage']['missingRuntimeCalls']
  missingBusinessPathIntegrations:
    DurationLiveLearningProductionClaimAuditFromDb['runtimeConsumerBusinessPathIntegrationCoverage']['missingIntegrations']
  factRewriteBlockedAssets:
    DurationLiveLearningProductionClaimAuditFromDb['completionAudit']['factRewriteBlockedAssetKeys']
  rejectedProductionSourceRows:
    DurationLiveLearningProductionClaimAuditFromDb['evidenceRowCollection']['rejectedRows']
  rejectedProductionEvidenceRecords:
    DurationLiveLearningProductionClaimAuditFromDb['evidenceCollection']['rejectedRecords']
}

function countArray(value: unknown) {
  return Array.isArray(value) ? value.length : 0
}

function summarizeAudit(
  audit: DurationLiveLearningProductionClaimAuditFromDb,
): DurationLiveLearningProductionClaimAuditJobResult {
  return {
    jobCode: 'duration_live_learning_production_claim_audit',
    runtimeMutationPolicy: 'none_audit_only',
    factMutationPolicy: 'fact_and_commitment_assets_locked',
    status: audit.status,
    allowedClaim: audit.allowedClaim,
    prohibitedClaim: audit.prohibitedClaim,
    completionStatus: audit.completionAudit.status,
    productionEvidenceStatus: audit.productionGate.status,
    sourceRowCount: audit.sourceQuery.sourceRows.length,
    blockedAssetCount: audit.completionAudit.blockedAssetKeys.length,
    missingProductionEvidenceAssetCount: audit.productionGate.missingEvidenceByAsset.length,
    missingRuntimeConsumerObservationCount: audit.runtimeConsumerObservationCoverage.missingConsumerObservations.length,
    missingRuntimeCallCount: countArray(audit.runtimeConsumerRuntimeCallCoverage.missingRuntimeCalls),
    missingBusinessPathIntegrationCount: countArray(
      audit.runtimeConsumerBusinessPathIntegrationCoverage.missingIntegrations,
    ),
    sourceRowsProvenanceStatus: audit.sourceRowsProvenanceGate.status,
    factRewriteBlockedAssetCount: audit.completionAudit.factRewriteBlockedAssetKeys.length,
    rejectedProductionSourceRowCount: audit.evidenceRowCollection.rejectedRows.length,
    rejectedProductionEvidenceRecordCount: audit.evidenceCollection.rejectedRecords.length,
    blockedAssets: audit.completionAudit.blockedAssetKeys,
    missingProductionEvidence: audit.productionGate.missingEvidenceByAsset,
    missingRuntimeConsumerObservations: audit.runtimeConsumerObservationCoverage.missingConsumerObservations,
    missingRuntimeCalls: audit.runtimeConsumerRuntimeCallCoverage.missingRuntimeCalls,
    missingBusinessPathIntegrations:
      audit.runtimeConsumerBusinessPathIntegrationCoverage.missingIntegrations,
    factRewriteBlockedAssets: audit.completionAudit.factRewriteBlockedAssetKeys,
    rejectedProductionSourceRows: audit.evidenceRowCollection.rejectedRows,
    rejectedProductionEvidenceRecords: audit.evidenceCollection.rejectedRecords,
  }
}

export async function runDurationLiveLearningProductionClaimAuditSweep(params: {
  maxRowsPerSourceTable?: number
} = {}): Promise<DurationLiveLearningProductionClaimAuditJobResult> {
  const audit = await buildDurationLiveLearningProductionClaimAuditFromDb({
    maxRowsPerSourceTable: params.maxRowsPerSourceTable,
    requestedFactRewriteAssetKeys: [],
  })
  return summarizeAudit(audit)
}

export class DurationLiveLearningProductionClaimAuditJob {
  private isRunning = false
  private lastRun: Date | null = null
  private nextRun: Date | null = null
  private lastResult: DurationLiveLearningProductionClaimAuditJobResult | null = null
  private wallClockTimer = new PersistentWallClockJobTimer({
    jobName: 'durationLiveLearningProductionClaimAuditJob',
    schedule: { kind: 'daily', hour: 6, minute: 45 },
    execute: () => this.execute('scheduler'),
    onScheduled: ({ nextRun, delayMs }) => {
      this.nextRun = nextRun
      logger.info('durationLiveLearningProductionClaimAuditJob scheduled', {
        nextRun: nextRun.toISOString(),
        trigger: 'daily_06_45',
        initialDelay: delayMs,
      })
    },
    onError: (error) => logger.error('durationLiveLearningProductionClaimAuditJob scheduler failed', {
      error: error instanceof Error ? error.message : String(error),
    }),
  })

  start() {
    if (!this.wallClockTimer.start()) {
      logger.warn('durationLiveLearningProductionClaimAuditJob is already running')
    }
  }

  stop() {
    this.wallClockTimer.stop()
    this.nextRun = null
    logger.info('durationLiveLearningProductionClaimAuditJob stopped')
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      isScheduled: this.wallClockTimer.getStatus().isScheduled,
      lastRun: this.lastRun ? this.lastRun.toISOString() : null,
      nextRun: this.nextRun ? this.nextRun.toISOString() : null,
      lastResult: this.lastResult,
    }
  }

  async executeNow() {
    return this.execute('manual')
  }

  private async execute(triggeredBy: 'scheduler' | 'manual') {
    if (this.isRunning) {
      logger.warn('durationLiveLearningProductionClaimAuditJob is already running, skip tick', { triggeredBy })
      return null
    }

    this.isRunning = true
    const jobId = createJobId()
    try {
      this.lastRun = new Date()
      const { attempts, value } = await runJobWithRetry(
        {
          jobName: 'durationLiveLearningProductionClaimAuditJob',
          triggeredBy,
          jobId,
        },
        async () => runDurationLiveLearningProductionClaimAuditSweep(),
      )

      logger.info('durationLiveLearningProductionClaimAuditJob completed', {
        triggeredBy,
        jobId,
        attempts,
        ...value,
      })
      this.lastResult = value
      return value
    } catch (error) {
      logger.error('durationLiveLearningProductionClaimAuditJob failed', {
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

export const durationLiveLearningProductionClaimAuditJob = new DurationLiveLearningProductionClaimAuditJob()
