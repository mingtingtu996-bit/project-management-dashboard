import { describe, expect, it } from 'vitest'

import {
  decideAlgorithmAssetColdStartRuntime,
  evaluateAlgorithmAssetColdStartBaselineUpdate,
  evaluateAlgorithmAssetColdStartLiveLearningEvidence,
} from '../services/algorithmAssetColdStartBaselineService.js'

describe('algorithmAssetColdStartBaselineService', () => {
  it('uses an eligible anonymized segment baseline as reference when company samples are insufficient', () => {
    const decision = decideAlgorithmAssetColdStartRuntime({
      companyId: 'company-a',
      projectId: 'project-a1',
      workCode: 'WBS-001',
      scenarioKeys: ['residential', 'concrete'],
      systemSeedValue: 12,
      companyAcceptedSampleCount: 2,
      minCompanySamplesForOverride: 5,
      baselines: [
        {
          baselineId: 'segment-residential-concrete',
          baselineScope: 'segment_baseline',
          value: 10,
          applicableScenarioKeys: ['residential', 'concrete'],
          disabledScenarioKeys: [],
          anonymizationPolicy: 'k_anonymous_multi_company',
          contributingCompanyCount: 5,
          minCompanyCount: 3,
          contributingProjectCount: 18,
          minProjectCount: 10,
          singleCompanyShare: 0.28,
          maxSingleCompanyShare: 0.4,
          sourceAggregation: 'aggregate_summary_only',
          rollbackTarget: 'cold-start-baseline:v1',
        },
      ],
    })

    expect(decision).toEqual(expect.objectContaining({
      status: 'shared_baseline_reference',
      runtimeConsumable: true,
      canWriteCompanyOverride: false,
      canWriteSharedBaseline: false,
      selectedBaselineId: 'segment-residential-concrete',
      runtimeValue: 10,
      fallbackSystemSeedValue: 12,
    }))
    expect(decision.runtimeSources).toEqual(['system_seed', 'segment_baseline'])
    expect(decision.reasons).toEqual(expect.arrayContaining([
      'company_sample_count_below_override_threshold',
      'shared_baseline_reference_only_no_company_override_write',
    ]))
    expect(decision.rejectedBaselines).toEqual([])
  })

  it('does not select shared baselines that consume other company private artifacts or details', () => {
    const decision = decideAlgorithmAssetColdStartRuntime({
      companyId: 'company-a',
      projectId: 'project-a1',
      workCode: 'WBS-001',
      scenarioKeys: ['residential'],
      systemSeedValue: 12,
      companyAcceptedSampleCount: 0,
      minCompanySamplesForOverride: 5,
      baselines: [
        {
          baselineId: 'private-contaminated-baseline',
          baselineScope: 'industry_baseline',
          value: 11,
          applicableScenarioKeys: ['residential'],
          disabledScenarioKeys: [],
          anonymizationPolicy: 'k_anonymous_multi_company',
          contributingCompanyCount: 8,
          minCompanyCount: 3,
          contributingProjectCount: 20,
          minProjectCount: 10,
          singleCompanyShare: 0.25,
          maxSingleCompanyShare: 0.4,
          sourceAggregation: 'contains_private_details',
          rollbackTarget: 'cold-start-baseline:v1',
          consumesCompanyOverrides: true,
          consumesProjectSampleDetails: true,
          consumesCandidateResults: true,
          consumesReplaySamples: true,
        },
      ],
    })

    expect(decision).toEqual(expect.objectContaining({
      status: 'cold_start_review_required',
      runtimeConsumable: false,
      selectedBaselineId: null,
      runtimeValue: 12,
      fallbackSystemSeedValue: 12,
    }))
    expect(decision.rejectedBaselines).toEqual([
      expect.objectContaining({
        baselineId: 'private-contaminated-baseline',
        reasons: expect.arrayContaining([
          'aggregate_summary_only_required',
          'company_override_read_forbidden',
          'project_sample_detail_read_forbidden',
          'candidate_result_read_forbidden',
          'replay_sample_detail_read_forbidden',
        ]),
      }),
    ])
  })

  it('does not select shared baselines that were runtime rolled back', () => {
    const decision = decideAlgorithmAssetColdStartRuntime({
      companyId: 'company-a',
      projectId: 'project-a1',
      workCode: 'WBS-001',
      scenarioKeys: ['residential'],
      systemSeedValue: 12,
      companyAcceptedSampleCount: 0,
      minCompanySamplesForOverride: 5,
      baselines: [
        {
          baselineId: 'rolled-back-baseline',
          baselineScope: 'segment_baseline',
          value: 10,
          applicableScenarioKeys: ['residential'],
          disabledScenarioKeys: [],
          anonymizationPolicy: 'k_anonymous_multi_company',
          contributingCompanyCount: 5,
          minCompanyCount: 3,
          contributingProjectCount: 18,
          minProjectCount: 10,
          singleCompanyShare: 0.25,
          maxSingleCompanyShare: 0.4,
          sourceAggregation: 'aggregate_summary_only',
          rollbackTarget: 'cold-start-baseline:v1',
          runtimePublicationStatus: 'runtime_rolled_back',
        } as any,
      ],
    })

    expect(decision).toEqual(expect.objectContaining({
      status: 'cold_start_review_required',
      runtimeConsumable: false,
      selectedBaselineId: null,
      runtimeValue: 12,
    }))
    expect(decision.rejectedBaselines).toEqual([
      expect.objectContaining({
        baselineId: 'rolled-back-baseline',
        reasons: expect.arrayContaining([
          'runtime_rolled_back_shared_baseline_not_consumable',
        ]),
      }),
    ])
  })

  it('rejects shared baseline updates that are sourced from a single company', () => {
    const decision = evaluateAlgorithmAssetColdStartBaselineUpdate({
      baselineScope: 'segment_baseline',
      sourceAggregation: 'aggregate_summary_only',
      anonymizationPolicy: 'k_anonymous_multi_company',
      contributingCompanyCount: 1,
      minCompanyCount: 3,
      contributingProjectCount: 12,
      minProjectCount: 10,
      singleCompanyShare: 1,
      maxSingleCompanyShare: 0.4,
      rollbackTarget: 'cold-start-baseline:v1',
    })

    expect(decision).toEqual(expect.objectContaining({
      status: 'rejected',
      updateAllowed: false,
    }))
    expect(decision.reasons).toEqual(expect.arrayContaining([
      'shared_baseline_requires_multi_company_aggregation',
      'single_company_samples_cannot_update_shared_baseline',
      'single_company_share_exceeds_cap',
    ]))
  })

  it('uses company override only after company sample coverage reaches the local threshold', () => {
    const decision = decideAlgorithmAssetColdStartRuntime({
      companyId: 'company-a',
      projectId: 'project-a1',
      workCode: 'WBS-001',
      scenarioKeys: ['residential'],
      systemSeedValue: 12,
      companyOverrideValue: 9,
      companyAcceptedSampleCount: 6,
      minCompanySamplesForOverride: 5,
      baselines: [
        {
          baselineId: 'segment-residential',
          baselineScope: 'segment_baseline',
          value: 10,
          applicableScenarioKeys: ['residential'],
          disabledScenarioKeys: [],
          anonymizationPolicy: 'k_anonymous_multi_company',
          contributingCompanyCount: 5,
          minCompanyCount: 3,
          contributingProjectCount: 18,
          minProjectCount: 10,
          singleCompanyShare: 0.28,
          maxSingleCompanyShare: 0.4,
          sourceAggregation: 'aggregate_summary_only',
          rollbackTarget: 'cold-start-baseline:v1',
        },
      ],
    })

    expect(decision).toEqual(expect.objectContaining({
      status: 'company_override',
      runtimeConsumable: true,
      runtimeValue: 9,
      selectedBaselineId: null,
    }))
    expect(decision.runtimeSources).toEqual(['company_override'])
    expect(decision.reasons).toEqual(expect.arrayContaining([
      'company_override_has_sufficient_local_samples',
    ]))
  })

  it('marks cold-start live learning ready only after outcome, tiered shrinkage and release safety all pass', () => {
    const decision = decideAlgorithmAssetColdStartRuntime({
      companyId: 'company-a',
      projectId: 'project-a1',
      workCode: 'WBS-001',
      scenarioKeys: ['residential'],
      systemSeedValue: 12,
      companyAcceptedSampleCount: 2,
      minCompanySamplesForOverride: 5,
      baselines: [
        {
          baselineId: 'segment-residential',
          baselineScope: 'segment_baseline',
          value: 10,
          applicableScenarioKeys: ['residential'],
          disabledScenarioKeys: [],
          anonymizationPolicy: 'k_anonymous_multi_company',
          contributingCompanyCount: 5,
          minCompanyCount: 3,
          contributingProjectCount: 18,
          minProjectCount: 10,
          singleCompanyShare: 0.28,
          maxSingleCompanyShare: 0.4,
          sourceAggregation: 'aggregate_summary_only',
          rollbackTarget: 'cold-start-baseline:v1',
          runtimePublicationStatus: 'published',
        },
      ],
    })

    const evidence = evaluateAlgorithmAssetColdStartLiveLearningEvidence({
      runtimeDecision: decision,
      actualOutcomeRecorded: true,
      actualSampleHealth: 'accepted',
      companyAcceptedSampleCount: 6,
      minCompanySamplesForOverride: 5,
      projectAcceptedSampleCount: 3,
      minProjectSamplesForOverlay: 3,
      releaseExitApproved: true,
      impactMonitoringReady: true,
      rollbackTargetReady: true,
      accuracyMetricsAvailable: true,
    })

    expect(evidence).toEqual({
      status: 'cold_start_live_learning_ready',
      liveLearningEvidence: {
        assetClassificationRegistered: true,
        predictionEventRecorded: true,
        actualOutcomeEventRecorded: true,
        tieredLearningPolicyRegistered: true,
        enabledLearningScopes: ['system', 'segment_baseline', 'company', 'project'],
        runtimeConsumerUsesPublishedArtifact: true,
        releaseExitApproved: true,
        impactMonitoringReady: true,
        rollbackTargetReady: true,
        accuracyMetricsAvailable: true,
      },
      missingReasons: [],
    })
  })

  it('keeps cold-start live learning not ready when outcome or release safety is missing', () => {
    const decision = decideAlgorithmAssetColdStartRuntime({
      companyId: 'company-a',
      projectId: 'project-a1',
      workCode: 'WBS-001',
      scenarioKeys: ['residential'],
      systemSeedValue: 12,
      companyAcceptedSampleCount: 1,
      minCompanySamplesForOverride: 5,
      baselines: [],
    })

    const evidence = evaluateAlgorithmAssetColdStartLiveLearningEvidence({
      runtimeDecision: decision,
      actualOutcomeRecorded: false,
      actualSampleHealth: 'weak',
      companyAcceptedSampleCount: 1,
      minCompanySamplesForOverride: 5,
      projectAcceptedSampleCount: 0,
      minProjectSamplesForOverlay: 3,
      releaseExitApproved: false,
      impactMonitoringReady: false,
      rollbackTargetReady: false,
      accuracyMetricsAvailable: false,
    })

    expect(evidence.status).toBe('cold_start_live_learning_not_ready')
    expect(evidence.liveLearningEvidence).toEqual(expect.objectContaining({
      actualOutcomeEventRecorded: false,
      runtimeConsumerUsesPublishedArtifact: false,
      releaseExitApproved: false,
      impactMonitoringReady: false,
      rollbackTargetReady: false,
      accuracyMetricsAvailable: false,
    }))
    expect(evidence.missingReasons).toEqual(expect.arrayContaining([
      'accepted_actual_outcome_required',
      'shared_baseline_or_company_override_runtime_required',
      'company_scope_samples_required_for_shrinkage',
      'project_scope_samples_required_for_overlay',
      'release_exit_required',
      'impact_monitoring_required',
      'rollback_target_required',
      'accuracy_metrics_required',
    ]))
  })
})
