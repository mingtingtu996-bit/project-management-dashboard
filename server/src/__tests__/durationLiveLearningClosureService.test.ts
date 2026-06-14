import { describe, expect, it } from 'vitest'

import {
  evaluateDurationLiveLearningAsset,
  evaluateDurationLiveLearningManifest,
  evaluateDurationLiveLearningPortfolio,
  listDurationLiveLearningAssetContracts,
  listDurationLiveLearningManifests,
  resolveDurationLearningScopeCoverage,
} from '../services/durationLiveLearningClosureService.js'

const completeLiveEvidence = {
  assetClassificationRegistered: true,
  predictionEventRecorded: true,
  actualOutcomeEventRecorded: true,
  tieredLearningPolicyRegistered: true,
  enabledLearningScopes: ['global', 'industry', 'company', 'project'],
  runtimeConsumerUsesPublishedArtifact: true,
  releaseExitApproved: true,
  impactMonitoringReady: true,
  rollbackTargetReady: true,
  accuracyMetricsAvailable: true,
} as const

describe('durationLiveLearningClosureService', () => {
  it('classifies learnable duration assets separately from locked fact assets', () => {
    const contracts = listDurationLiveLearningAssetContracts()

    expect(contracts.map((contract) => contract.assetKey)).toEqual(expect.arrayContaining([
      'base_duration_benchmark',
      'forecast_residual_overlay',
      'standard_work_duration_seed',
      'special_work_duration_seed',
      'dependency_rule_candidate',
      'critical_path_rule_candidate',
      'baseline_commitment',
      'monthly_plan_commitment',
      'actual_duration_outcome',
      'progress_snapshot',
    ]))

    expect(contracts.find((contract) => contract.assetKey === 'forecast_residual_overlay')).toEqual(expect.objectContaining({
      assetClass: 'learnable_duration_prediction',
      canLearn: true,
      factLocked: false,
      runtimeWriterRequired: true,
      publishGateRequired: true,
    }))
    expect(contracts.find((contract) => contract.assetKey === 'actual_duration_outcome')).toEqual(expect.objectContaining({
      assetClass: 'business_fact_lock',
      canLearn: false,
      factLocked: true,
      selfLearningPublishAllowed: false,
    }))
  })

  it('allows a live self-learning claim only when all five closure conditions are present', () => {
    expect(evaluateDurationLiveLearningAsset({
      assetKey: 'forecast_residual_overlay',
      evidence: completeLiveEvidence,
    })).toEqual(expect.objectContaining({
      assetKey: 'forecast_residual_overlay',
      status: 'live_self_learning_ready',
      allowedLiveLearningClaim: true,
      missingClosureConditions: [],
      claimScope: 'learnable_duration_asset_only',
    }))

    expect(evaluateDurationLiveLearningAsset({
      assetKey: 'forecast_residual_overlay',
      evidence: {
        ...completeLiveEvidence,
        actualOutcomeEventRecorded: false,
        runtimeConsumerUsesPublishedArtifact: false,
        rollbackTargetReady: false,
      },
    })).toEqual(expect.objectContaining({
      status: 'not_ready',
      allowedLiveLearningClaim: false,
      missingClosureConditions: expect.arrayContaining([
        'actual_outcome_event_required',
        'runtime_consumer_must_use_published_or_canary_artifact',
        'rollback_target_required',
      ]),
    }))
  })

  it('normalizes runtime publication scope labels into global industry company project learning coverage', () => {
    expect(resolveDurationLearningScopeCoverage([
      'system',
      'industry_baseline',
      'segment_baseline',
      'company',
      'project',
      'unknown_scope',
    ])).toEqual({
      normalizedScopes: ['global', 'industry', 'company', 'project'],
      unknownScopes: ['unknown_scope'],
      hasFullCoverage: true,
      missingScopes: [],
    })

    expect(resolveDurationLearningScopeCoverage(['system', 'company', 'project'])).toEqual({
      normalizedScopes: ['global', 'company', 'project'],
      unknownScopes: [],
      hasFullCoverage: false,
      missingScopes: ['industry'],
    })
  })

  it('keeps facts locked even when a caller supplies complete learning evidence', () => {
    expect(evaluateDurationLiveLearningAsset({
      assetKey: 'baseline_commitment',
      requestedFactRewrite: true,
      evidence: completeLiveEvidence,
    })).toEqual(expect.objectContaining({
      status: 'fact_locked_closed',
      assetClass: 'business_fact_lock',
      allowedLiveLearningClaim: false,
      selfLearningPublishAllowed: false,
      missingClosureConditions: ['business_fact_must_not_be_self_learning_runtime_writer'],
      blockedReasonCodes: expect.arrayContaining([
        'duration_fact_auto_rewrite_blocked',
      ]),
    }))
  })

  it('closes the portfolio claim only for learnable assets while requiring fact locks to stay closed', () => {
    const result = evaluateDurationLiveLearningPortfolio([
      { assetKey: 'base_duration_benchmark', evidence: completeLiveEvidence },
      { assetKey: 'forecast_residual_overlay', evidence: completeLiveEvidence },
      { assetKey: 'standard_work_duration_seed', evidence: completeLiveEvidence },
      { assetKey: 'special_work_duration_seed', evidence: completeLiveEvidence },
      { assetKey: 'dependency_rule_candidate', evidence: completeLiveEvidence },
      { assetKey: 'critical_path_rule_candidate', evidence: completeLiveEvidence },
      { assetKey: 'baseline_commitment', evidence: completeLiveEvidence },
      { assetKey: 'actual_duration_outcome', evidence: completeLiveEvidence },
      { assetKey: 'progress_snapshot', evidence: completeLiveEvidence },
    ])

    expect(result).toEqual(expect.objectContaining({
      status: 'portfolio_live_self_learning_ready',
      allowedClaim:
        'all_learnable_duration_prediction_and_network_assets_are_live_self_learning;facts_and_commitments_remain_locked',
      prohibitedClaim: 'all_duration_assets_are_live_self_learning',
    }))
    expect(result.learnableAssets.every((asset) => asset.allowedLiveLearningClaim)).toBe(true)
    expect(result.factLockedAssets.every((asset) => asset.status === 'fact_locked_closed')).toBe(true)
  })

  it('keeps the portfolio not ready when any learnable asset lacks tiered learning or runtime consumption', () => {
    const result = evaluateDurationLiveLearningPortfolio([
      { assetKey: 'base_duration_benchmark', evidence: completeLiveEvidence },
      {
        assetKey: 'dependency_rule_candidate',
        evidence: {
          ...completeLiveEvidence,
          enabledLearningScopes: ['company'],
          runtimeConsumerUsesPublishedArtifact: false,
        },
      },
      { assetKey: 'actual_duration_outcome', evidence: completeLiveEvidence },
    ])

    expect(result).toEqual(expect.objectContaining({
      status: 'portfolio_not_ready',
      allowedClaim: 'not_ready_for_live_self_learning_claim',
      prohibitedClaim: 'all_duration_assets_are_live_self_learning',
      missingClosureConditions: expect.arrayContaining([
        'global_industry_company_project_learning_scopes_required',
        'runtime_consumer_must_use_published_or_canary_artifact',
      ]),
    }))
  })

  it('publishes a first-batch manifest for base duration, cold-start, residual overlay and confidence weight assets', () => {
    const manifests = listDurationLiveLearningManifests('duration_prediction_core_a')

    expect(manifests.map((manifest) => manifest.assetKey)).toEqual([
      'base_duration_benchmark',
      'duration_cold_start_baseline',
      'forecast_residual_overlay',
      'forecast_confidence_weight',
    ])
    expect(manifests[0]).toEqual(expect.objectContaining({
      rolloutBatch: 'duration_prediction_core_a',
      implementationAnchors: expect.objectContaining({
        primaryService: 'durationSuggestionService.ts',
        runtimeConsumers: expect.arrayContaining(['durationSuggestionService.ts']),
        predictionEventAnchors: expect.arrayContaining(['duration_prediction_events']),
        outcomeEventAnchors: expect.arrayContaining(['durationExperienceService.ts']),
      }),
      currentEvidence: expect.objectContaining({
        assetClassificationRegistered: true,
        predictionEventRecorded: true,
      }),
      nextRuntimeSteps: expect.arrayContaining([
        'prove_global_industry_company_project_scope_chain_for_base_duration_benchmark',
      ]),
    }))
    expect(manifests.find((manifest) => manifest.assetKey === 'forecast_residual_overlay')).toEqual(expect.objectContaining({
      implementationAnchors: expect.objectContaining({
        primaryService: 'algorithmAssetForecastResidualOverlayService.ts',
        runtimeConsumers: expect.arrayContaining(['taskDurationForecastService.ts']),
        releaseGateAnchors: expect.arrayContaining(['algorithmAssetLearnableParameterReleaseExecutionService.ts']),
      }),
    }))
  })

  it('evaluates the first-batch manifest without over-claiming live self-learning readiness', () => {
    const result = evaluateDurationLiveLearningManifest('duration_prediction_core_a')

    expect(result).toEqual(expect.objectContaining({
      rolloutBatch: 'duration_prediction_core_a',
      status: 'manifest_not_ready',
      allowedClaim: 'first_batch_manifest_established_not_ready_for_live_self_learning_claim',
      prohibitedClaim: 'all_duration_assets_are_live_self_learning',
      totalAssets: 4,
      readyAssets: 0,
    }))
    expect(result.assetEvaluations.map((evaluation) => evaluation.assetKey)).toEqual([
      'base_duration_benchmark',
      'duration_cold_start_baseline',
      'forecast_residual_overlay',
      'forecast_confidence_weight',
    ])
    expect(result.missingClosureConditions).toEqual(expect.arrayContaining([
      'global_industry_company_project_learning_scopes_required',
      'actual_outcome_event_required',
      'impact_monitoring_required',
    ]))
  })

  it('publishes a second-batch manifest for standard seeds and plan-network assets', () => {
    const manifests = listDurationLiveLearningManifests('plan_network_core_b')

    expect(manifests.map((manifest) => manifest.assetKey)).toEqual([
      'standard_work_duration_seed',
      'special_work_duration_seed',
      'wbs_reference_days',
      'dependency_rule_candidate',
      'critical_path_rule_candidate',
    ])
    expect(manifests.find((manifest) => manifest.assetKey === 'standard_work_duration_seed')).toEqual(expect.objectContaining({
      implementationAnchors: expect.objectContaining({
        primaryService: 'standardWorkDurationSeedReplayService.ts',
        runtimeConsumers: expect.arrayContaining(['durationSuggestionService.ts']),
        outcomeEventAnchors: expect.arrayContaining(['durationExperienceService.ts']),
      }),
      nextRuntimeSteps: expect.arrayContaining([
        'add_dedicated_seed_publication_writer_after_replay_candidate_approval',
      ]),
    }))
    expect(manifests.find((manifest) => manifest.assetKey === 'dependency_rule_candidate')).toEqual(expect.objectContaining({
      implementationAnchors: expect.objectContaining({
        primaryService: 'constructionDependencyReplayCalibrationService.ts',
        runtimeConsumers: expect.arrayContaining(['wbsTemplateGenerationService.ts']),
        predictionEventAnchors: expect.arrayContaining(['network_prediction_events'],
        ),
      }),
    }))
  })

  it('keeps the second-batch plan-network manifest not ready until writers and network outcomes exist', () => {
    const result = evaluateDurationLiveLearningManifest('plan_network_core_b')

    expect(result).toEqual(expect.objectContaining({
      rolloutBatch: 'plan_network_core_b',
      status: 'manifest_not_ready',
      allowedClaim: 'batch_manifest_established_not_ready_for_live_self_learning_claim',
      prohibitedClaim: 'all_duration_assets_are_live_self_learning',
      totalAssets: 5,
      readyAssets: 0,
    }))
    expect(result.missingClosureConditions).toEqual(expect.arrayContaining([
      'actual_outcome_event_required',
      'runtime_consumer_must_use_published_or_canary_artifact',
      'release_exit_required',
      'rollback_target_required',
    ]))
  })
})
