import { describe, expect, it, vi } from 'vitest'

import {
  evaluateStandardWorkDurationSeedLiveLearningEvidence,
  replayStandardWorkDurationSeedAgainstSamples,
  type StandardWorkDurationSeedReplayResolver,
} from '../services/standardWorkDurationSeedReplayService.js'
import type { AlgorithmSeedDiscoverySample } from '../services/algorithmSeedCandidateDiscoveryService.js'

function sample(
  id: string,
  standardWorkCode: string,
  actualDuration: number,
  metadata: Record<string, unknown> = {},
): AlgorithmSeedDiscoverySample {
  return {
    id,
    company_id: 'company-1',
    project_id: 'project-1',
    task_id: `task-${id}`,
    standard_work_code: standardWorkCode,
    standard_work_name: standardWorkCode,
    wbs_node_type: 'process',
    actual_duration: actualDuration,
    confidence_score: 90,
    metadata,
  }
}

describe('standardWorkDurationSeedReplayService', () => {
  it('reports P50 replay precision, within-30 ratio, and bias without writing seed values', async () => {
    const resolver: StandardWorkDurationSeedReplayResolver = vi.fn(async (_text, context) => {
      const code = context.standardWorkCode
      if (code === '02-01-03-P07') {
        return {
          stableCode: 'process_duration:cast_in_place_concrete',
          standardWorkCodes: ['02-01-03-P07'],
          defaultDaysP50: 6,
          confidence: 'high',
          selectedConditionCode: 'standard',
        }
      }
      if (code === '01-02-02-P01') {
        return {
          stableCode: 'process_duration:bored_cast_in_place_pile_foundation',
          standardWorkCodes: ['01-02-02-P01'],
          defaultDaysP50: 12,
          confidence: 'high',
        }
      }
      return null
    })

    const report = await replayStandardWorkDurationSeedAgainstSamples([
      sample('a1', '02-01-03-P07', 5),
      sample('a2', '02-01-03-P07', 6),
      sample('a3', '02-01-03-P07', 7),
      sample('b1', '01-02-02-P01', 20),
      sample('b2', '01-02-02-P01', 22),
      sample('b3', '01-02-02-P01', 24),
    ], { minSamplesPerCode: 3, resolver })

    expect(report.governancePolicy).toEqual({
      replayMode: 'report_only',
      seedWritePolicy: 'never_write_seed_from_replay',
      candidatePolicy: 'review_required_before_seed_promotion',
    })
    expect(report.summary).toEqual(expect.objectContaining({
      evaluatedCodeCount: 2,
      matchedSampleCount: 6,
      trustedCodeCount: 1,
      reviewRequiredCodeCount: 1,
      overallWithinThirtyPercentRatio: 0.5,
    }))

    const trusted = report.byStandardWorkCode.find((item) => item.standardWorkCode === '02-01-03-P07')
    expect(trusted).toEqual(expect.objectContaining({
      standardWorkCode: '02-01-03-P07',
      sampleCount: 3,
      seedP50Days: 6,
      medianActualDays: 6,
      medianAbsolutePercentageError: 1 / 6,
      withinThirtyPercentRatio: 1,
      biasDirection: 'balanced',
      replayStatus: 'trusted',
      recommendation: 'keep_seed_p50',
    }))

    const drifted = report.byStandardWorkCode.find((item) => item.standardWorkCode === '01-02-02-P01')
    expect(drifted).toEqual(expect.objectContaining({
      sampleCount: 3,
      seedP50Days: 12,
      medianActualDays: 22,
      medianAbsolutePercentageError: 10 / 12,
      withinThirtyPercentRatio: 0,
      biasDirection: 'seed_underestimates_actual',
      replayStatus: 'needs_review',
      recommendation: 'review_p50_or_split_condition_band',
    }))
  })

  it('passes condition-band signals from samples into the seed resolver before judging P50 accuracy', async () => {
    const resolver: StandardWorkDurationSeedReplayResolver = vi.fn(async (_text, context) => ({
      stableCode: 'process_duration:cast_in_place_concrete',
      standardWorkCodes: ['02-01-03-P07'],
      defaultDaysP50: context.scopeDimensions?.includes('bucket_concrete')
        && context.scopeDimensions?.includes('constrained_workface')
        ? 5
        : 2,
      selectedConditionCode: context.scopeDimensions?.includes('bucket_concrete')
        ? 'bucket_constrained_concrete'
        : 'pumped_standard_floor_concrete',
      confidence: 'high',
    }))

    const report = await replayStandardWorkDurationSeedAgainstSamples([
      sample('c1', '02-01-03-P07', 5, {
        condition_selector: {
          concretePlacementBand: 'bucket',
          workfaceBand: 'constrained',
        },
      }),
      sample('c2', '02-01-03-P07', 5, {
        conditionSelector: {
          concretePlacementBand: 'bucket',
          workfaceBand: 'constrained',
        },
      }),
      sample('c3', '02-01-03-P07', 6, {
        concrete_placement_band: 'bucket',
        workface_band: 'constrained',
      }),
    ], { minSamplesPerCode: 3, resolver })

    expect(resolver).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
      standardWorkCode: '02-01-03-P07',
      standardWorkCodes: ['02-01-03-P07'],
      scopeDimensions: expect.arrayContaining(['bucket_concrete', 'constrained_workface']),
    }))
    expect(report.byStandardWorkCode[0]).toEqual(expect.objectContaining({
      seedP50Days: 5,
      selectedConditionCode: 'bucket_constrained_concrete',
      medianActualDays: 5,
      replayStatus: 'trusted',
    }))
  })

  it('turns replay outcomes into report-only calibration queues for seed review', async () => {
    const resolver: StandardWorkDurationSeedReplayResolver = vi.fn(async (_text, context) => {
      if (context.standardWorkCode === 'review-code') {
        return {
          stableCode: 'process_duration:review_code',
          standardWorkCodes: ['review-code'],
          defaultDaysP50: 6,
          confidence: 'medium',
        }
      }
      if (context.standardWorkCode === 'trusted-code') {
        return {
          stableCode: 'process_duration:trusted_code',
          standardWorkCodes: ['trusted-code'],
          defaultDaysP50: 5,
          confidence: 'high',
        }
      }
      return null
    })

    const report = await replayStandardWorkDurationSeedAgainstSamples([
      sample('r1', 'review-code', 10),
      sample('r2', 'review-code', 11),
      sample('r3', 'review-code', 12),
      sample('u1', 'unresolved-code', 4),
      sample('u2', 'unresolved-code', 5),
      sample('u3', 'unresolved-code', 6),
      sample('i1', 'thin-code', 7),
      sample('i2', 'thin-code', 8),
      sample('t1', 'trusted-code', 5),
      sample('t2', 'trusted-code', 5),
      sample('t3', 'trusted-code', 6),
    ], { minSamplesPerCode: 3, resolver })

    expect(report.calibrationQueues).toEqual({
      p50ReviewCandidates: [
        expect.objectContaining({
          standardWorkCode: 'review-code',
          replayContextKey: 'standard',
          queueStatus: 'manual_seed_review_required',
          recommendation: 'review_p50_or_split_condition_band',
          seedStableCode: 'process_duration:review_code',
          seedP50Days: 6,
          medianActualDays: 11,
          sampleCount: 3,
          promotionPolicy: 'review_required_before_seed_promotion',
          seedWritePolicy: 'never_write_seed_from_replay',
        }),
      ],
      missingSeedCandidates: [
        expect.objectContaining({
          standardWorkCode: 'unresolved-code',
          queueStatus: 'seed_authoring_required',
          recommendation: 'add_or_import_standard_work_duration_seed',
          seedStableCode: null,
          sampleCount: 3,
        }),
      ],
      evidenceCollectionCandidates: [
        expect.objectContaining({
          standardWorkCode: 'thin-code',
          queueStatus: 'collect_more_samples',
          recommendation: 'collect_more_samples',
          sampleCount: 2,
        }),
      ],
    })
    expect(report.calibrationQueues.p50ReviewCandidates[0].sampleIds).toEqual(['r1', 'r2', 'r3'])
    expect(report.calibrationQueues.p50ReviewCandidates).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ standardWorkCode: 'trusted-code' }),
    ]))
  })

  it('derives out-of-fold seed quality and task/window lineage from real replay samples', async () => {
    const replaySamples = Array.from({ length: 20 }, (_, index) => ({
      ...sample(`holdout-${index + 1}`, 'holdout-code', 9 + (index % 3)),
      completed_at: new Date(Date.UTC(2026, 0, index + 1)).toISOString(),
    }))
    const report = await replayStandardWorkDurationSeedAgainstSamples(replaySamples, {
      minSamplesPerCode: 5,
      resolver: vi.fn(async () => ({
        stableCode: 'process_duration:holdout_code',
        defaultDaysP50: 5,
        confidence: 'high',
      })),
    })

    const candidate = report.calibrationQueues.p50ReviewCandidates[0]
    expect(candidate).toEqual(expect.objectContaining({
      taskIds: replaySamples.map((row) => row.task_id),
      observationStartedAt: '2026-01-01T00:00:00.000Z',
      observationEndedAt: '2026-01-20T00:00:00.000Z',
      observationWindowDays: 20,
      automationQualityEvidence: expect.objectContaining({
        qualityModel: 'numeric_holdout',
        holdoutSampleCount: 20,
        maeBefore: expect.any(Number),
        maeAfter: expect.any(Number),
        conflictRate: 0,
        overcompensationRate: 0,
      }),
    }))
    expect(candidate.automationQualityEvidence.maeBefore)
      .toBeGreaterThan(candidate.automationQualityEvidence.maeAfter ?? Number.POSITIVE_INFINITY)
  })

  it('requires an approved replay candidate, dedicated writer, lineage, and release gates before standard seed live learning is ready', async () => {
    const resolver: StandardWorkDurationSeedReplayResolver = vi.fn(async () => ({
      stableCode: 'process_duration:cast_in_place_concrete',
      standardWorkCodes: ['02-01-03-P07'],
      defaultDaysP50: 6,
      confidence: 'high',
    }))

    const report = await replayStandardWorkDurationSeedAgainstSamples([
      sample('s1', '02-01-03-P07', 10),
      sample('s2', '02-01-03-P07', 11),
      sample('s3', '02-01-03-P07', 12),
      sample('s4', '02-01-03-P07', 10),
      sample('s5', '02-01-03-P07', 11),
    ], { minSamplesPerCode: 5, resolver })

    const decision = evaluateStandardWorkDurationSeedLiveLearningEvidence({
      replayReport: report,
      actualOutcomeEventRecorded: true,
      approvedReplayCandidateRecorded: true,
      enabledLearningScopes: ['system', 'industry_baseline', 'company', 'project'],
      runtimeConsumerUsesPublishedArtifact: true,
      seedPublicationWriterReady: true,
      seedVersionLineageRecorded: true,
      releaseExitApproved: true,
      impactMonitoringReady: true,
      rollbackTargetReady: true,
      accuracyMetricsAvailable: true,
    })

    expect(report.governancePolicy.seedWritePolicy).toBe('never_write_seed_from_replay')
    expect(report.calibrationQueues.p50ReviewCandidates).toHaveLength(1)
    expect(decision).toEqual({
      status: 'standard_work_seed_live_learning_ready',
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
      missingReasons: [],
    })
  })

  it('keeps standard seed live learning not ready when replay evidence is not publishable', async () => {
    const report = await replayStandardWorkDurationSeedAgainstSamples([
      sample('thin-1', 'thin-code', 7),
      sample('thin-2', 'thin-code', 8),
    ], { minSamplesPerCode: 5, resolver: vi.fn(async () => null) })

    const decision = evaluateStandardWorkDurationSeedLiveLearningEvidence({
      replayReport: report,
      actualOutcomeEventRecorded: false,
      approvedReplayCandidateRecorded: false,
      enabledLearningScopes: ['system'],
      runtimeConsumerUsesPublishedArtifact: false,
      seedPublicationWriterReady: false,
      seedVersionLineageRecorded: false,
      releaseExitApproved: false,
      impactMonitoringReady: false,
      rollbackTargetReady: false,
      accuracyMetricsAvailable: false,
    })

    expect(decision.status).toBe('standard_work_seed_live_learning_not_ready')
    expect(decision.liveLearningEvidence).toEqual(expect.objectContaining({
      predictionEventRecorded: true,
      actualOutcomeEventRecorded: false,
      tieredLearningPolicyRegistered: false,
      runtimeConsumerUsesPublishedArtifact: false,
      trustedReplayOrReviewCandidatePresent: false,
      approvedReplayCandidateRecorded: false,
      seedPublicationWriterReady: false,
      seedVersionLineageRecorded: false,
      releaseExitApproved: false,
      impactMonitoringReady: false,
      rollbackTargetReady: false,
      accuracyMetricsAvailable: false,
    }))
    expect(decision.missingReasons).toEqual(expect.arrayContaining([
      'actual_outcome_event_required',
      'trusted_replay_or_review_candidate_required',
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
