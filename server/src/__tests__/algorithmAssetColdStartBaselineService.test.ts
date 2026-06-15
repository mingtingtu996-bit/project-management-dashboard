import { describe, expect, it } from 'vitest'

import {
  buildAlgorithmAssetColdStartLiveLearningEvidenceFromProductionRows,
  decideAlgorithmAssetColdStartRuntime,
  evaluateAlgorithmAssetColdStartBaselineUpdate,
  evaluateAlgorithmAssetColdStartLiveLearningEvidence,
} from '../services/algorithmAssetColdStartBaselineService.js'
import {
  evaluateDurationLiveLearningExecutionPlan,
} from '../services/durationLiveLearningClosureService.js'

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

  it('builds cold-start live evidence override from production source rows', () => {
    const runtimeDecision = decideAlgorithmAssetColdStartRuntime({
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

    const decision = buildAlgorithmAssetColdStartLiveLearningEvidenceFromProductionRows({
      runtimeDecision,
      minCompanySamplesForOverride: 2,
      minProjectSamplesForOverlay: 1,
      sourceRows: [
        {
          sourceTable: 'duration_experience_samples',
          row: {
            id: 'sample-company-1',
            sample_status: 'active',
            included_in_benchmark: true,
            actual_duration: 10,
            completed_at: '2026-06-01T00:00:00.000Z',
            metadata: {
              liveLearningAssetKey: 'duration_cold_start_baseline',
              learningScope: 'company',
            },
          },
        },
        {
          sourceTable: 'duration_experience_samples',
          row: {
            id: 'sample-company-2',
            sample_status: 'active',
            included_in_benchmark: true,
            actual_duration: 9,
            completed_at: '2026-06-02T00:00:00.000Z',
            metadata: {
              liveLearningAssetKey: 'duration_cold_start_baseline',
              learningScope: 'company',
            },
          },
        },
        {
          sourceTable: 'duration_experience_samples',
          row: {
            id: 'sample-project-1',
            sample_status: 'active',
            included_in_benchmark: true,
            actual_duration: 8,
            completed_at: '2026-06-03T00:00:00.000Z',
            metadata: {
              liveLearningAssetKey: 'duration_cold_start_baseline',
              learningScope: 'project',
            },
          },
        },
        {
          sourceTable: 'algorithm_learnable_parameter_runtime_publications',
          row: {
            publication_key: 'cold_start_baseline_runtime:segment-v1',
            asset_key: 'duration_cold_start_baseline',
            publication_status: 'published',
            impact_monitoring: {
              status: 'monitoring_armed',
              eventRef: 'impact_monitoring:cold_start_baseline_runtime:segment-v1',
            },
            rollback_execution: {
              status: 'rollback_verified',
              eventRef: 'rollback:cold_start_baseline_runtime:segment-v1',
            },
          },
        },
        {
          sourceTable: 'duration_algorithm_accuracy_events',
          row: {
            id: 'accuracy-cold-start-1',
            absolute_error_days: 1,
            prediction_context: {
              assetKey: 'duration_cold_start_baseline',
            },
            actual_context: {
              accuracyGateStatus: 'accuracy_passed',
            },
          },
        },
      ],
    })

    expect(decision.status).toBe('cold_start_live_learning_ready')
    expect(decision.liveLearningEvidence).toEqual(expect.objectContaining({
      actualOutcomeEventRecorded: true,
      tieredLearningPolicyRegistered: true,
      runtimeConsumerUsesPublishedArtifact: true,
      releaseExitApproved: true,
      impactMonitoringReady: true,
      rollbackTargetReady: true,
      accuracyMetricsAvailable: true,
    }))
    expect(decision.productionLineage.acceptedSampleCounts).toEqual({
      company: 2,
      project: 1,
    })
    expect(decision.productionLineage.evidenceRefs).toEqual(expect.objectContaining({
      productionSampleEvidenceRef: 'duration_samples:sample-company-1',
      publicationExecutionRef: 'algorithm_learnable_parameter_runtime_publications:cold_start_baseline_runtime:segment-v1',
      impactMonitoringEvidenceRef: 'impact_monitoring:cold_start_baseline_runtime:segment-v1',
      rollbackDrillEvidenceRef: 'rollback:cold_start_baseline_runtime:segment-v1',
      accuracyEvidenceRef: 'duration_algorithm_accuracy_events:accuracy-cold-start-1',
    }))

    const plan = evaluateDurationLiveLearningExecutionPlan(['duration_prediction_core_a'], [{
      assetKey: 'duration_cold_start_baseline',
      evidence: decision.liveLearningEvidence,
    }])
    expect(plan.gates.find((gate) => gate.gateKey === 'prediction_and_outcome_events')?.assetKeys)
      .not.toContain('duration_cold_start_baseline')
    expect(plan.gates.find((gate) => gate.gateKey === 'accuracy_metrics')?.assetKeys)
      .not.toContain('duration_cold_start_baseline')
  })
})
