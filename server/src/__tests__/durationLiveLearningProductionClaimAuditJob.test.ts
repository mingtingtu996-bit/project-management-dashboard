import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  audit: {
    status: 'duration_live_learning_production_claim_not_ready',
    allowedClaim: 'not_ready_for_live_self_learning_claim',
    prohibitedClaim: 'all_duration_assets_are_live_self_learning',
    completionAudit: {
      status: 'duration_live_learning_completion_not_ready',
      blockedAssetKeys: ['forecast_residual_overlay', 'critical_path_rule_candidate'],
      factRewriteBlockedAssetKeys: [],
    },
    productionGate: {
      status: 'duration_live_learning_production_evidence_not_ready',
      missingEvidenceByAsset: [
        {
          assetKey: 'forecast_residual_overlay',
          missingReasonCodes: ['impact_monitoring_evidence_required'],
        },
        {
          assetKey: 'critical_path_rule_candidate',
          missingReasonCodes: ['rollback_drill_evidence_required'],
        },
      ],
    },
    runtimeConsumerObservationCoverage: {
      status: 'runtime_consumer_observation_coverage_not_ready',
      missingConsumerObservations: [
        { assetKey: 'forecast_residual_overlay', consumerKey: 'projectRemainingDurationForecastService' },
      ],
    },
    runtimeConsumerObservationIntegrationCoverage: {
      status: 'runtime_consumer_observation_integration_ready',
      missingContracts: [],
      rejectedRegistrations: [],
    },
    runtimeConsumerRuntimeCallCoverage: {
      status: 'runtime_consumer_observation_runtime_calls_not_ready',
      missingRuntimeCalls: [
        {
          consumerKey: 'projectRemainingDurationForecastService',
          runtimeEntryRef: 'projectRemainingDurationForecastService:buildProjectRemainingDurationForecast',
        },
      ],
      rejectedRuntimeCalls: [],
      unlinkedConsumerObservations: [],
    },
    runtimeConsumerBusinessPathIntegrationCoverage: {
      status: 'runtime_consumer_business_path_integration_not_ready',
      missingIntegrations: [
        {
          consumerKey: 'projectRemainingDurationForecastService',
          sourcePath: 'server/src/services/projectRemainingDurationForecastService.ts',
          facadeFunctionName: 'recordProjectRemainingDurationForecastConsumedArtifacts',
          runtimeEntryRef: 'projectRemainingDurationForecastService:buildProjectRemainingDurationForecast',
          requiredAssetKeys: ['forecast_residual_overlay', 'forecast_confidence_weight'],
          missingAssetKeys: ['forecast_residual_overlay'],
        },
      ],
    },
    sourceRowsProvenanceGate: {
      status: 'canonical_source_rows_provenance_ready',
    },
    sourceQuery: {
      sourceRows: Array.from({ length: 12 }, (_, index) => ({
        sourceTable: 'duration_experience_samples',
        row: { id: `row-${index}` },
      })),
    },
  },
  buildDurationLiveLearningProductionClaimAuditFromDb: vi.fn(),
}))

vi.mock('../middleware/logger.js', () => ({
  logger: {
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}))

vi.mock('../services/jobRuntime.js', () => ({
  runJobWithRetry: async (_context: unknown, runner: () => Promise<unknown>) => ({
    attempts: 1,
    value: await runner(),
  }),
}))

vi.mock('../services/durationLiveLearningProductionEvidenceReaderService.js', () => ({
  buildDurationLiveLearningProductionClaimAuditFromDb:
    mocks.buildDurationLiveLearningProductionClaimAuditFromDb,
}))

describe('durationLiveLearningProductionClaimAuditJob', () => {
  beforeEach(() => {
    mocks.buildDurationLiveLearningProductionClaimAuditFromDb.mockReset()
    mocks.buildDurationLiveLearningProductionClaimAuditFromDb.mockResolvedValue(mocks.audit)
  })

  it('runs the canonical DB production claim audit as audit-only evidence without mutating runtime or fact assets', async () => {
    const {
      runDurationLiveLearningProductionClaimAuditSweep,
    } = await import('../jobs/durationLiveLearningProductionClaimAuditJob.js')

    const result = await runDurationLiveLearningProductionClaimAuditSweep({
      maxRowsPerSourceTable: 250,
    })

    expect(mocks.buildDurationLiveLearningProductionClaimAuditFromDb).toHaveBeenCalledWith({
      maxRowsPerSourceTable: 250,
      requestedFactRewriteAssetKeys: [],
    })
    expect(result).toEqual({
      jobCode: 'duration_live_learning_production_claim_audit',
      runtimeMutationPolicy: 'none_audit_only',
      factMutationPolicy: 'fact_and_commitment_assets_locked',
      status: 'duration_live_learning_production_claim_not_ready',
      allowedClaim: 'not_ready_for_live_self_learning_claim',
      prohibitedClaim: 'all_duration_assets_are_live_self_learning',
      completionStatus: 'duration_live_learning_completion_not_ready',
      productionEvidenceStatus: 'duration_live_learning_production_evidence_not_ready',
      sourceRowCount: 12,
      blockedAssetCount: 2,
      missingProductionEvidenceAssetCount: 2,
      missingRuntimeConsumerObservationCount: 1,
      missingRuntimeCallCount: 1,
      missingBusinessPathIntegrationCount: 1,
      sourceRowsProvenanceStatus: 'canonical_source_rows_provenance_ready',
      factRewriteBlockedAssetCount: 0,
      blockedAssets: ['forecast_residual_overlay', 'critical_path_rule_candidate'],
      missingProductionEvidence: [
        {
          assetKey: 'forecast_residual_overlay',
          missingReasonCodes: ['impact_monitoring_evidence_required'],
        },
        {
          assetKey: 'critical_path_rule_candidate',
          missingReasonCodes: ['rollback_drill_evidence_required'],
        },
      ],
      missingRuntimeConsumerObservations: [
        { assetKey: 'forecast_residual_overlay', consumerKey: 'projectRemainingDurationForecastService' },
      ],
      missingRuntimeCalls: [
        {
          consumerKey: 'projectRemainingDurationForecastService',
          runtimeEntryRef: 'projectRemainingDurationForecastService:buildProjectRemainingDurationForecast',
        },
      ],
      missingBusinessPathIntegrations: [
        {
          consumerKey: 'projectRemainingDurationForecastService',
          sourcePath: 'server/src/services/projectRemainingDurationForecastService.ts',
          facadeFunctionName: 'recordProjectRemainingDurationForecastConsumedArtifacts',
          runtimeEntryRef: 'projectRemainingDurationForecastService:buildProjectRemainingDurationForecast',
          requiredAssetKeys: ['forecast_residual_overlay', 'forecast_confidence_weight'],
          missingAssetKeys: ['forecast_residual_overlay'],
        },
      ],
      factRewriteBlockedAssets: [],
    })
  })

  it('is manually executable and exposes last-run status', async () => {
    const {
      DurationLiveLearningProductionClaimAuditJob,
    } = await import('../jobs/durationLiveLearningProductionClaimAuditJob.js')
    const job = new DurationLiveLearningProductionClaimAuditJob()

    expect(job.getStatus()).toMatchObject({
      isRunning: false,
      isScheduled: false,
      lastRun: null,
      nextRun: null,
    })

    const result = await job.executeNow()

    expect(result?.jobCode).toBe('duration_live_learning_production_claim_audit')
    expect(job.getStatus()).toEqual(expect.objectContaining({
      isRunning: false,
      isScheduled: false,
      lastRun: expect.any(String),
    }))
  })
}
)
