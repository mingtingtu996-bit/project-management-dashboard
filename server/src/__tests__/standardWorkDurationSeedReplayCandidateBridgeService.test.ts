import { describe, expect, it, vi } from 'vitest'
import type { StandardWorkDurationSeedReplayGovernanceReport } from '../services/standardWorkDurationSeedReplayGovernanceService.js'

const mocks = vi.hoisted(() => ({
  createAlgorithmSeedUpgradeCandidate: vi.fn(async (input: any) => ({
    id: `candidate-${input.stableCode}`,
    status: input.actionPolicy === 'candidate_only' ? 'candidate_only' : 'pending',
    ...input,
  })),
}))

vi.mock('../services/algorithmSeedLearningService.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/algorithmSeedLearningService.js')>()
  return {
    ...actual,
    createAlgorithmSeedUpgradeCandidate: mocks.createAlgorithmSeedUpgradeCandidate,
  }
})

const {
  buildStandardWorkDurationSeedPublicationReadiness,
  createStandardWorkDurationReplayUpgradeCandidates,
} = await import('../services/standardWorkDurationSeedReplayCandidateBridgeService.js')
const {
  validateAlgorithmSeedRuntimePayload,
} = await import('../services/algorithmSeedValidationService.js')

describe('standardWorkDurationSeedReplayCandidateBridgeService', () => {
  const governanceReport: StandardWorkDurationSeedReplayGovernanceReport = {
    reportCode: 'standard_work_duration_seed_replay_governance' as const,
    generatedAt: '2026-06-14T00:00:00.000Z',
    companyId: 'company-1',
    projectId: 'project-1',
    source: {
      table: 'duration_experience_samples',
      filters: {
        sampleStatus: 'active',
        includedInBenchmark: true,
        wbsNodeType: 'process',
        companyId: 'company-1',
        projectId: 'project-1',
        maxSamples: 1000,
      },
    },
    replay: {
      reportCode: 'standard_work_duration_seed_p50_replay' as const,
      generatedAt: '2026-06-14T00:00:00.000Z',
      governancePolicy: {
        replayMode: 'report_only' as const,
        seedWritePolicy: 'never_write_seed_from_replay' as const,
        candidatePolicy: 'review_required_before_seed_promotion' as const,
      },
      summary: {
        inputSampleCount: 8,
        eligibleSampleCount: 8,
        matchedSampleCount: 5,
        evaluatedCodeCount: 2,
        trustedCodeCount: 0,
        reviewRequiredCodeCount: 1,
        unresolvedCodeCount: 1,
        insufficientSampleGroupCount: 1,
        overallWithinThirtyPercentRatio: 0.4,
      },
      calibrationQueues: {
        p50ReviewCandidates: [{
          standardWorkCode: '02-01-03-P07',
          replayContextKey: 'standard',
          queueStatus: 'manual_seed_review_required' as const,
          recommendation: 'review_p50_or_split_condition_band' as const,
          sampleCount: 5,
          seedStableCode: 'process_duration:cast_in_place_concrete',
          seedP50Days: 6,
          medianActualDays: 9,
          medianAbsolutePercentageError: 0.5,
          withinThirtyPercentRatio: 0.2,
          biasDirection: 'seed_underestimates_actual' as const,
          selectedConditionCode: 'standard',
          seedConfidence: 'high',
          sampleIds: ['sample-1', 'sample-2', 'sample-3', 'sample-4', 'sample-5'],
          promotionPolicy: 'review_required_before_seed_promotion' as const,
          seedWritePolicy: 'never_write_seed_from_replay' as const,
        }],
        missingSeedCandidates: [{
          standardWorkCode: '07-01-01-P07',
          replayContextKey: 'standard',
          queueStatus: 'seed_authoring_required' as const,
          recommendation: 'add_or_import_standard_work_duration_seed' as const,
          sampleCount: 3,
          seedStableCode: null,
          seedP50Days: null,
          medianActualDays: 4,
          medianAbsolutePercentageError: null,
          withinThirtyPercentRatio: null,
          biasDirection: null,
          selectedConditionCode: null,
          seedConfidence: null,
          sampleIds: ['sample-6', 'sample-7', 'sample-8'],
          promotionPolicy: 'review_required_before_seed_promotion' as const,
          seedWritePolicy: 'never_write_seed_from_replay' as const,
        }],
        evidenceCollectionCandidates: [{
          standardWorkCode: 'thin-code',
          replayContextKey: 'standard',
          queueStatus: 'collect_more_samples' as const,
          recommendation: 'collect_more_samples' as const,
          sampleCount: 2,
          seedStableCode: null,
          seedP50Days: null,
          medianActualDays: 5,
          medianAbsolutePercentageError: null,
          withinThirtyPercentRatio: null,
          biasDirection: null,
          selectedConditionCode: null,
          seedConfidence: null,
          sampleIds: ['sample-9', 'sample-10'],
          promotionPolicy: 'review_required_before_seed_promotion' as const,
          seedWritePolicy: 'never_write_seed_from_replay' as const,
        }],
      },
      byStandardWorkCode: [],
    },
    governanceBoundary: {
      reportOnly: true,
      seedWritePolicy: 'never_write_seed_from_replay' as const,
      promotionPolicy: 'review_required_before_seed_promotion' as const,
      allowedUse: 'backend_governance_report' as const,
    },
  }

  it('turns replay review and missing-seed queues into candidate-only seed upgrade candidates', async () => {
    const result = await createStandardWorkDurationReplayUpgradeCandidates(governanceReport)

    expect(result).toEqual(expect.objectContaining({
      attemptedCandidateCount: 2,
      candidateOnlyUpsertedCount: 2,
      p50ReviewCandidateOnlyCount: 1,
      missingSeedCandidateOnlyCount: 1,
      evidenceCollectionSkippedCount: 1,
      seedWritesBlocked: 1,
      failedCandidateCount: 0,
    }))
    expect(mocks.createAlgorithmSeedUpgradeCandidate).toHaveBeenCalledTimes(2)
    const firstInput = mocks.createAlgorithmSeedUpgradeCandidate.mock.calls[0][0]
    expect(validateAlgorithmSeedRuntimePayload('standard_work_duration', firstInput.candidatePayload, {
      stableCode: firstInput.stableCode,
      strict: true,
    }).ok).toBe(true)
    expect(firstInput.candidatePayload.evidenceQuality).toEqual(expect.objectContaining({
      last_review_date: '2026-05-16',
    }))
    expect(firstInput.evidenceSummary).not.toHaveProperty('replayGeneratedAt')
    expect(firstInput.evidenceSummary).not.toHaveProperty('governanceGeneratedAt')
    expect(firstInput.evidenceSummary).not.toHaveProperty('sourceFilters')
    expect(mocks.createAlgorithmSeedUpgradeCandidate).toHaveBeenCalledWith(expect.objectContaining({
      seedType: 'standard_work_duration',
      stableCode: 'process_duration:cast_in_place_concrete',
      candidateSource: 'project_history',
      projectId: 'project-1',
      companyId: 'company-1',
      sampleCount: 5,
      variance: 0.5,
      confidenceLevel: 'medium',
      actionPolicy: 'candidate_only',
      candidatePayload: expect.objectContaining({
        stableCode: 'process_duration:cast_in_place_concrete',
        standardWorkCodes: ['02-01-03-P07'],
        defaultDaysP50: 9,
        durationContributionMode: 'duration_bearing',
        baseDaysEligible: true,
        sourceVersion: 'v1.4.18-replay-candidate-bridge',
      }),
      evidenceSummary: expect.objectContaining({
        replayReportCode: 'standard_work_duration_seed_p50_replay',
        seedWritePolicy: 'never_write_seed_from_replay',
        promotionPolicy: 'review_required_before_seed_promotion',
        runtimeEffectPolicy: 'candidate_only_no_runtime_effect_until_governed',
      }),
    }))
    expect(mocks.createAlgorithmSeedUpgradeCandidate).toHaveBeenCalledWith(expect.objectContaining({
      stableCode: 'replay:standard_work_duration:07_01_01_P07:standard',
      actionPolicy: 'candidate_only',
      candidatePayload: expect.objectContaining({
        stableCode: 'replay:standard_work_duration:07_01_01_P07:standard',
        standardWorkCodes: ['07-01-01-P07'],
        defaultDaysP50: 4,
      }),
    }))
  })

  it('builds a release-exit publication readiness package for approved replay candidates without writing seeds', () => {
    const readiness = buildStandardWorkDurationSeedPublicationReadiness({
      report: governanceReport,
      bridgeResult: {
        attemptedCandidateCount: 2,
        candidateOnlyUpsertedCount: 2,
        p50ReviewCandidateOnlyCount: 1,
        missingSeedCandidateOnlyCount: 1,
        evidenceCollectionSkippedCount: 1,
        failedCandidateCount: 0,
        seedWritesBlocked: 1,
        failed: [],
      },
      approvedCandidateIds: ['candidate-process_duration:cast_in_place_concrete'],
      seedVersionId: 'seed-version-standard-work-duration-v2',
      runtimePublicationKey: 'algorithm_seed_versions:seed-version-standard-work-duration-v2',
      rollbackTarget: 'algorithm_seed_versions:seed-version-standard-work-duration-v1',
      enabledLearningScopes: ['system', 'industry_baseline', 'company', 'project'],
      releaseExitApproved: true,
      impactMonitoringReady: true,
      accuracyMetricsAvailable: true,
    })

    expect(readiness).toEqual({
      status: 'standard_work_seed_publication_ready',
      liveLearningEvidence: {
        assetClassificationRegistered: true,
        predictionEventRecorded: true,
        actualOutcomeEventRecorded: true,
        tieredLearningPolicyRegistered: true,
        enabledLearningScopes: ['global', 'industry', 'company', 'project'],
        runtimeConsumerUsesPublishedArtifact: true,
        trustedReplayOrReviewCandidatePresent: true,
        approvedReplayCandidateRecorded: true,
        seedReplayReportOnly: true,
        seedWritePolicyPreserved: true,
        seedPublicationWriterReady: true,
        seedVersionLineageRecorded: true,
        releaseExitApproved: true,
        impactMonitoringReady: true,
        rollbackTargetReady: true,
        accuracyMetricsAvailable: true,
      },
      seedVersionLineage: {
        seedType: 'standard_work_duration',
        seedVersionId: 'seed-version-standard-work-duration-v2',
        runtimePublicationKey: 'algorithm_seed_versions:seed-version-standard-work-duration-v2',
        rollbackTarget: 'algorithm_seed_versions:seed-version-standard-work-duration-v1',
        replayReportCode: 'standard_work_duration_seed_p50_replay',
        governanceReportCode: 'standard_work_duration_seed_replay_governance',
        approvedCandidateIds: ['candidate-process_duration:cast_in_place_concrete'],
        sourceSampleIds: ['sample-1', 'sample-2', 'sample-3', 'sample-4', 'sample-5', 'sample-6', 'sample-7', 'sample-8'],
      },
      missingReasons: [],
    })
  })

  it('keeps publication readiness blocked without approval, lineage, runtime consumer, or release gates', () => {
    const readiness = buildStandardWorkDurationSeedPublicationReadiness({
      report: governanceReport,
      bridgeResult: {
        attemptedCandidateCount: 2,
        candidateOnlyUpsertedCount: 2,
        p50ReviewCandidateOnlyCount: 1,
        missingSeedCandidateOnlyCount: 1,
        evidenceCollectionSkippedCount: 1,
        failedCandidateCount: 0,
        seedWritesBlocked: 1,
        failed: [],
      },
      approvedCandidateIds: [],
      seedVersionId: null,
      runtimePublicationKey: null,
      rollbackTarget: null,
      enabledLearningScopes: ['system'],
      releaseExitApproved: false,
      impactMonitoringReady: false,
      accuracyMetricsAvailable: false,
    })

    expect(readiness.status).toBe('standard_work_seed_publication_not_ready')
    expect(readiness.liveLearningEvidence).toEqual(expect.objectContaining({
      approvedReplayCandidateRecorded: false,
      seedPublicationWriterReady: false,
      seedVersionLineageRecorded: false,
      runtimeConsumerUsesPublishedArtifact: false,
      releaseExitApproved: false,
      impactMonitoringReady: false,
      rollbackTargetReady: false,
      accuracyMetricsAvailable: false,
    }))
    expect(readiness.missingReasons).toEqual(expect.arrayContaining([
      'approved_replay_candidate_required',
      'seed_publication_writer_required',
      'seed_version_lineage_required',
      'runtime_consumer_publication_required',
      'global_industry_company_project_learning_scopes_required',
      'release_exit_required',
      'impact_monitoring_required',
      'rollback_target_required',
      'accuracy_metrics_required',
    ]))
  })
})
