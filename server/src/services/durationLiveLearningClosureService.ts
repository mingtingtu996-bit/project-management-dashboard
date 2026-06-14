export type DurationLiveLearningAssetKey =
  | 'base_duration_benchmark'
  | 'duration_cold_start_baseline'
  | 'forecast_residual_overlay'
  | 'forecast_confidence_weight'
  | 'standard_work_duration_seed'
  | 'special_work_duration_seed'
  | 'wbs_reference_days'
  | 'dependency_rule_candidate'
  | 'critical_path_rule_candidate'
  | 'baseline_commitment'
  | 'monthly_plan_commitment'
  | 'actual_duration_outcome'
  | 'progress_snapshot'

export type DurationLiveLearningAssetClass =
  | 'learnable_duration_prediction'
  | 'learnable_plan_network'
  | 'business_fact_lock'

export type DurationLearningScope = 'global' | 'industry' | 'company' | 'project'

export type DurationLearningScopeEvidence =
  | DurationLearningScope
  | 'system'
  | 'industry_baseline'
  | 'segment_baseline'
  | string

export type DurationLiveLearningClosureCondition =
  | 'asset_classification_required'
  | 'prediction_event_required'
  | 'actual_outcome_event_required'
  | 'tiered_learning_policy_required'
  | 'global_industry_company_project_learning_scopes_required'
  | 'runtime_consumer_must_use_published_or_canary_artifact'
  | 'release_exit_required'
  | 'impact_monitoring_required'
  | 'rollback_target_required'
  | 'accuracy_metrics_required'
  | 'business_fact_must_not_be_self_learning_runtime_writer'

export type DurationLiveLearningAssetContract = {
  assetKey: DurationLiveLearningAssetKey
  assetClass: DurationLiveLearningAssetClass
  canLearn: boolean
  factLocked: boolean
  selfLearningPublishAllowed: boolean
  runtimeWriterRequired: boolean
  publishGateRequired: boolean
  requiredLearningScopes: DurationLearningScope[]
  boundaryPolicy: string[]
}

export type DurationLiveLearningEvidence = {
  assetClassificationRegistered?: boolean
  predictionEventRecorded?: boolean
  actualOutcomeEventRecorded?: boolean
  tieredLearningPolicyRegistered?: boolean
  enabledLearningScopes?: readonly DurationLearningScopeEvidence[]
  runtimeConsumerUsesPublishedArtifact?: boolean
  releaseExitApproved?: boolean
  impactMonitoringReady?: boolean
  rollbackTargetReady?: boolean
  accuracyMetricsAvailable?: boolean
}

export type DurationLiveLearningAssetEvaluationInput = {
  assetKey: DurationLiveLearningAssetKey
  evidence?: DurationLiveLearningEvidence
  requestedFactRewrite?: boolean
}

export type DurationLiveLearningAssetStatus =
  | 'live_self_learning_ready'
  | 'not_ready'
  | 'fact_locked_closed'

export type DurationLiveLearningAssetEvaluation = {
  assetKey: DurationLiveLearningAssetKey
  assetClass: DurationLiveLearningAssetClass
  status: DurationLiveLearningAssetStatus
  canLearn: boolean
  factLocked: boolean
  selfLearningPublishAllowed: boolean
  allowedLiveLearningClaim: boolean
  claimScope: 'learnable_duration_asset_only' | 'business_fact_locked_not_learnable'
  missingClosureConditions: DurationLiveLearningClosureCondition[]
  blockedReasonCodes: string[]
  contract: DurationLiveLearningAssetContract
}

export type DurationLiveLearningPortfolioItem = DurationLiveLearningAssetEvaluationInput

export type DurationLiveLearningPortfolioEvaluation = {
  status: 'portfolio_live_self_learning_ready' | 'portfolio_not_ready'
  allowedClaim:
    | 'all_learnable_duration_prediction_and_network_assets_are_live_self_learning;facts_and_commitments_remain_locked'
    | 'not_ready_for_live_self_learning_claim'
  prohibitedClaim: 'all_duration_assets_are_live_self_learning'
  learnableAssets: DurationLiveLearningAssetEvaluation[]
  factLockedAssets: DurationLiveLearningAssetEvaluation[]
  missingClosureConditions: DurationLiveLearningClosureCondition[]
}

export type DurationLiveLearningRolloutBatch = 'duration_prediction_core_a' | 'plan_network_core_b'

export type DurationLiveLearningImplementationAnchors = {
  primaryService: string
  runtimeConsumers: string[]
  predictionEventAnchors: string[]
  outcomeEventAnchors: string[]
  releaseGateAnchors: string[]
}

export type DurationLiveLearningManifest = {
  rolloutBatch: DurationLiveLearningRolloutBatch
  assetKey: DurationLiveLearningAssetKey
  assetFamily: string
  implementationAnchors: DurationLiveLearningImplementationAnchors
  currentEvidence: DurationLiveLearningEvidence
  nextRuntimeSteps: string[]
}

export type DurationLiveLearningManifestEvaluation = {
  rolloutBatch: DurationLiveLearningRolloutBatch
  status: 'manifest_live_self_learning_ready' | 'manifest_not_ready'
  allowedClaim:
    | 'first_batch_live_self_learning_ready_for_learnable_assets'
    | 'first_batch_manifest_established_not_ready_for_live_self_learning_claim'
    | 'batch_live_self_learning_ready_for_learnable_assets'
    | 'batch_manifest_established_not_ready_for_live_self_learning_claim'
  prohibitedClaim: 'all_duration_assets_are_live_self_learning'
  totalAssets: number
  readyAssets: number
  assetEvaluations: DurationLiveLearningAssetEvaluation[]
  missingClosureConditions: DurationLiveLearningClosureCondition[]
}

export type DurationLiveLearningExecutionGateKey =
  | 'prediction_and_outcome_events'
  | 'tiered_learning_scope'
  | 'runtime_consumer_publication'
  | 'release_monitoring_rollback'
  | 'accuracy_metrics'

export type DurationLiveLearningExecutionGate = {
  gateKey: DurationLiveLearningExecutionGateKey
  status: 'passed' | 'blocked'
  assetKeys: DurationLiveLearningAssetKey[]
  missingClosureConditions: DurationLiveLearningClosureCondition[]
  requiredActions: string[]
}

export type DurationLiveLearningExecutionPlanEvaluation = {
  status: 'execution_plan_ready' | 'execution_plan_not_ready'
  prohibitedClaim: 'all_duration_assets_are_live_self_learning'
  rolloutBatches: DurationLiveLearningRolloutBatch[]
  gates: DurationLiveLearningExecutionGate[]
  nextRecommendedAssetKeys: DurationLiveLearningAssetKey[]
}

export type DurationLearningScopeCoverage = {
  normalizedScopes: DurationLearningScope[]
  unknownScopes: string[]
  hasFullCoverage: boolean
  missingScopes: DurationLearningScope[]
}

const ALL_LEARNING_SCOPES: DurationLearningScope[] = ['global', 'industry', 'company', 'project']

const EXECUTION_GATE_DEFINITIONS: Array<{
  gateKey: DurationLiveLearningExecutionGateKey
  conditions: DurationLiveLearningClosureCondition[]
  requiredActions: string[]
}> = [
  {
    gateKey: 'prediction_and_outcome_events',
    conditions: ['prediction_event_required', 'actual_outcome_event_required'],
    requiredActions: [
      'record_prediction_event_for_each_runtime_prediction',
      'record_actual_outcome_or_network_outcome_before_live_claim',
    ],
  },
  {
    gateKey: 'tiered_learning_scope',
    conditions: [
      'tiered_learning_policy_required',
      'global_industry_company_project_learning_scopes_required',
    ],
    requiredActions: [
      'register_global_industry_company_project_learning_policy_or_explicit_scope_exception',
      'keep_low_sample_scopes_shrunk_to_upper_level_baselines',
    ],
  },
  {
    gateKey: 'runtime_consumer_publication',
    conditions: ['runtime_consumer_must_use_published_or_canary_artifact'],
    requiredActions: [
      'wire_runtime_consumer_to_published_or_canary_artifact',
      'keep_shadow_and_candidate_artifacts_evidence_only',
    ],
  },
  {
    gateKey: 'release_monitoring_rollback',
    conditions: [
      'release_exit_required',
      'impact_monitoring_required',
      'rollback_target_required',
    ],
    requiredActions: [
      'pass_v14223_release_exit_before_runtime_consumption',
      'bind_impact_monitoring_and_rollback_target_to_publication',
    ],
  },
  {
    gateKey: 'accuracy_metrics',
    conditions: ['accuracy_metrics_required'],
    requiredActions: [
      'bind_mae_bias_and_overcompensation_metrics_to_runtime_consumed_artifact',
    ],
  },
]

const NEXT_ASSET_RECOMMENDATION_ORDER: DurationLiveLearningAssetKey[] = [
  'duration_cold_start_baseline',
  'standard_work_duration_seed',
  'special_work_duration_seed',
  'wbs_reference_days',
  'dependency_rule_candidate',
  'critical_path_rule_candidate',
  'base_duration_benchmark',
  'forecast_residual_overlay',
  'forecast_confidence_weight',
]

const DURATION_LIVE_LEARNING_ASSET_CONTRACTS: DurationLiveLearningAssetContract[] = [
  {
    assetKey: 'base_duration_benchmark',
    assetClass: 'learnable_duration_prediction',
    canLearn: true,
    factLocked: false,
    selfLearningPublishAllowed: true,
    runtimeWriterRequired: true,
    publishGateRequired: true,
    requiredLearningScopes: ALL_LEARNING_SCOPES,
    boundaryPolicy: [
      'base_duration_can_learn_through_runtime_benchmark_blend',
      'standard_work_duration_seed_must_not_be_silently_rewritten',
    ],
  },
  {
    assetKey: 'duration_cold_start_baseline',
    assetClass: 'learnable_duration_prediction',
    canLearn: true,
    factLocked: false,
    selfLearningPublishAllowed: true,
    runtimeWriterRequired: true,
    publishGateRequired: true,
    requiredLearningScopes: ALL_LEARNING_SCOPES,
    boundaryPolicy: [
      'cold_start_uses_global_or_industry_or_segment_baseline_before_company_samples_mature',
      'shared_baseline_must_be_labelled_as_reference_not_company_experience',
    ],
  },
  {
    assetKey: 'forecast_residual_overlay',
    assetClass: 'learnable_duration_prediction',
    canLearn: true,
    factLocked: false,
    selfLearningPublishAllowed: true,
    runtimeWriterRequired: true,
    publishGateRequired: true,
    requiredLearningScopes: ALL_LEARNING_SCOPES,
    boundaryPolicy: [
      'residual_overlay_can_adjust_runtime_forecast_only_after_publication',
      'shadow_or_candidate_overlay_is_evidence_only',
    ],
  },
  {
    assetKey: 'forecast_confidence_weight',
    assetClass: 'learnable_duration_prediction',
    canLearn: true,
    factLocked: false,
    selfLearningPublishAllowed: true,
    runtimeWriterRequired: true,
    publishGateRequired: true,
    requiredLearningScopes: ALL_LEARNING_SCOPES,
    boundaryPolicy: [
      'confidence_weight_learning_requires_runtime_consumption_evidence',
      'high_risk_structure_parameters_require_guarded_release',
    ],
  },
  {
    assetKey: 'standard_work_duration_seed',
    assetClass: 'learnable_duration_prediction',
    canLearn: true,
    factLocked: false,
    selfLearningPublishAllowed: true,
    runtimeWriterRequired: true,
    publishGateRequired: true,
    requiredLearningScopes: ALL_LEARNING_SCOPES,
    boundaryPolicy: [
      'standard_work_duration_seed_replay_can_create_candidates',
      'seed_rewrite_requires_dedicated_published_writer_not_replay_job',
    ],
  },
  {
    assetKey: 'special_work_duration_seed',
    assetClass: 'learnable_plan_network',
    canLearn: true,
    factLocked: false,
    selfLearningPublishAllowed: true,
    runtimeWriterRequired: true,
    publishGateRequired: true,
    requiredLearningScopes: ALL_LEARNING_SCOPES,
    boundaryPolicy: [
      'special_work_duration_seed_can_learn_as_plan_network_candidate',
      'reference_days_or_standard_work_code_changes_need_lineage_to_duration_prediction',
    ],
  },
  {
    assetKey: 'wbs_reference_days',
    assetClass: 'learnable_plan_network',
    canLearn: true,
    factLocked: false,
    selfLearningPublishAllowed: true,
    runtimeWriterRequired: true,
    publishGateRequired: true,
    requiredLearningScopes: ALL_LEARNING_SCOPES,
    boundaryPolicy: [
      'wbs_reference_days_require_network_prediction_event_and_outcome_reconciliation',
      'template_feedback_is_not_live_reference_days_without_publication',
    ],
  },
  {
    assetKey: 'dependency_rule_candidate',
    assetClass: 'learnable_plan_network',
    canLearn: true,
    factLocked: false,
    selfLearningPublishAllowed: true,
    runtimeWriterRequired: true,
    publishGateRequired: true,
    requiredLearningScopes: ALL_LEARNING_SCOPES,
    boundaryPolicy: [
      'dependency_replay_can_create_candidates_not_live_rules',
      'live_dependency_rules_require_release_exit_runtime_writer_and_rollback',
    ],
  },
  {
    assetKey: 'critical_path_rule_candidate',
    assetClass: 'learnable_plan_network',
    canLearn: true,
    factLocked: false,
    selfLearningPublishAllowed: true,
    runtimeWriterRequired: true,
    publishGateRequired: true,
    requiredLearningScopes: ALL_LEARNING_SCOPES,
    boundaryPolicy: [
      'critical_path_candidates_require_network_outcome_reconciliation',
      'confirmed_critical_path_facts_are_not_auto_rewritten',
    ],
  },
  {
    assetKey: 'baseline_commitment',
    assetClass: 'business_fact_lock',
    canLearn: false,
    factLocked: true,
    selfLearningPublishAllowed: false,
    runtimeWriterRequired: false,
    publishGateRequired: false,
    requiredLearningScopes: [],
    boundaryPolicy: [
      'baseline_commitment_is_fact_layer_and_sample_basis_only',
      'learning_system_must_not_auto_rewrite_baseline_commitment',
    ],
  },
  {
    assetKey: 'monthly_plan_commitment',
    assetClass: 'business_fact_lock',
    canLearn: false,
    factLocked: true,
    selfLearningPublishAllowed: false,
    runtimeWriterRequired: false,
    publishGateRequired: false,
    requiredLearningScopes: [],
    boundaryPolicy: [
      'monthly_plan_commitment_is_fact_layer_and_sample_basis_only',
      'learning_system_must_not_auto_rewrite_monthly_plan_commitment',
    ],
  },
  {
    assetKey: 'actual_duration_outcome',
    assetClass: 'business_fact_lock',
    canLearn: false,
    factLocked: true,
    selfLearningPublishAllowed: false,
    runtimeWriterRequired: false,
    publishGateRequired: false,
    requiredLearningScopes: [],
    boundaryPolicy: [
      'actual_duration_outcome_is_truth_input_for_learning',
      'actual_start_end_and_completion_status_must_not_be_synthesized_by_learning',
    ],
  },
  {
    assetKey: 'progress_snapshot',
    assetClass: 'business_fact_lock',
    canLearn: false,
    factLocked: true,
    selfLearningPublishAllowed: false,
    runtimeWriterRequired: false,
    publishGateRequired: false,
    requiredLearningScopes: [],
    boundaryPolicy: [
      'progress_snapshot_is_fact_signal_and_outcome_evidence',
      'learning_system_must_not_rewrite_progress_snapshot',
    ],
  },
]

const CONTRACT_BY_ASSET_KEY = new Map(
  DURATION_LIVE_LEARNING_ASSET_CONTRACTS.map((contract) => [contract.assetKey, contract]),
)

const DURATION_LIVE_LEARNING_MANIFESTS: DurationLiveLearningManifest[] = [
  {
    rolloutBatch: 'duration_prediction_core_a',
    assetKey: 'base_duration_benchmark',
    assetFamily: 'base_duration_and_benchmark_blend',
    implementationAnchors: {
      primaryService: 'durationSuggestionService.ts',
      runtimeConsumers: ['durationSuggestionService.ts'],
      predictionEventAnchors: ['duration_prediction_events'],
      outcomeEventAnchors: ['durationExperienceService.ts', 'projectProductivityCalibrationService.ts'],
      releaseGateAnchors: [
        'algorithmAssetLearnableParameterRuntimeConsumptionService.ts',
        'algorithmAssetLearnableParameterReleaseExecutionService.ts',
      ],
    },
    currentEvidence: {
      assetClassificationRegistered: true,
      predictionEventRecorded: true,
      actualOutcomeEventRecorded: true,
      tieredLearningPolicyRegistered: true,
      enabledLearningScopes: ['company', 'project'],
      runtimeConsumerUsesPublishedArtifact: true,
      releaseExitApproved: true,
      impactMonitoringReady: false,
      rollbackTargetReady: true,
      accuracyMetricsAvailable: true,
    },
    nextRuntimeSteps: [
      'prove_global_industry_company_project_scope_chain_for_base_duration_benchmark',
      'bind_impact_monitoring_to_base_duration_runtime_publication',
    ],
  },
  {
    rolloutBatch: 'duration_prediction_core_a',
    assetKey: 'duration_cold_start_baseline',
    assetFamily: 'cold_start_shared_baseline',
    implementationAnchors: {
      primaryService: 'algorithmAssetColdStartBaselineService.ts',
      runtimeConsumers: ['durationSuggestionService.ts'],
      predictionEventAnchors: ['duration_prediction_events'],
      outcomeEventAnchors: ['durationExperienceService.ts'],
      releaseGateAnchors: ['algorithmAssetColdStartBaselineService.ts'],
    },
    currentEvidence: {
      assetClassificationRegistered: true,
      predictionEventRecorded: true,
      actualOutcomeEventRecorded: false,
      tieredLearningPolicyRegistered: true,
      enabledLearningScopes: ['global', 'industry'],
      runtimeConsumerUsesPublishedArtifact: true,
      releaseExitApproved: false,
      impactMonitoringReady: false,
      rollbackTargetReady: false,
      accuracyMetricsAvailable: false,
    },
    nextRuntimeSteps: [
      'record_cold_start_actual_outcome_after_project_completion',
      'add_company_and_project_shrinkage_path_after_cold_start_baseline',
      'route_cold_start_baseline_through_release_exit_and_rollback',
    ],
  },
  {
    rolloutBatch: 'duration_prediction_core_a',
    assetKey: 'forecast_residual_overlay',
    assetFamily: 'task_remaining_residual_overlay',
    implementationAnchors: {
      primaryService: 'algorithmAssetForecastResidualOverlayService.ts',
      runtimeConsumers: ['taskDurationForecastService.ts', 'projectRemainingDurationForecastService.ts'],
      predictionEventAnchors: ['duration_prediction_events'],
      outcomeEventAnchors: ['durationAlgorithmAccuracyService.ts', 'durationAccuracyReplayAcceptanceService.ts'],
      releaseGateAnchors: [
        'algorithmAssetLearnableParameterReleaseExecutionService.ts',
        'algorithmAssetForecastResidualOverlayService.ts',
      ],
    },
    currentEvidence: {
      assetClassificationRegistered: true,
      predictionEventRecorded: true,
      actualOutcomeEventRecorded: true,
      tieredLearningPolicyRegistered: true,
      enabledLearningScopes: ['company', 'project'],
      runtimeConsumerUsesPublishedArtifact: true,
      releaseExitApproved: true,
      impactMonitoringReady: true,
      rollbackTargetReady: true,
      accuracyMetricsAvailable: true,
    },
    nextRuntimeSteps: [
      'add_global_and_industry_residual_overlay_fallback_or_document_scope_exception',
    ],
  },
  {
    rolloutBatch: 'duration_prediction_core_a',
    assetKey: 'forecast_confidence_weight',
    assetFamily: 'forecast_confidence_runtime_weight',
    implementationAnchors: {
      primaryService: 'algorithmAssetLearnableParameterRuntimeConsumptionService.ts',
      runtimeConsumers: ['taskDurationForecastService.ts'],
      predictionEventAnchors: ['duration_prediction_events'],
      outcomeEventAnchors: ['durationAlgorithmAccuracyService.ts'],
      releaseGateAnchors: ['algorithmAssetLearnableParameterReleaseExecutionService.ts'],
    },
    currentEvidence: {
      assetClassificationRegistered: true,
      predictionEventRecorded: true,
      actualOutcomeEventRecorded: true,
      tieredLearningPolicyRegistered: true,
      enabledLearningScopes: ['company', 'project'],
      runtimeConsumerUsesPublishedArtifact: true,
      releaseExitApproved: true,
      impactMonitoringReady: true,
      rollbackTargetReady: true,
      accuracyMetricsAvailable: true,
    },
    nextRuntimeSteps: [
      'add_global_and_industry_confidence_weight_fallback_or_document_scope_exception',
    ],
  },
  {
    rolloutBatch: 'plan_network_core_b',
    assetKey: 'standard_work_duration_seed',
    assetFamily: 'standard_work_seed_reference_days',
    implementationAnchors: {
      primaryService: 'standardWorkDurationSeedReplayService.ts',
      runtimeConsumers: ['durationSuggestionService.ts'],
      predictionEventAnchors: ['duration_prediction_events', 'standard_work_duration_seed_replay'],
      outcomeEventAnchors: ['durationExperienceService.ts'],
      releaseGateAnchors: [
        'standardWorkDurationSeedReplayGovernanceService.ts',
        'standardWorkDurationSeedReplayCandidateBridgeService.ts',
      ],
    },
    currentEvidence: {
      assetClassificationRegistered: true,
      predictionEventRecorded: true,
      actualOutcomeEventRecorded: true,
      tieredLearningPolicyRegistered: false,
      enabledLearningScopes: ['system'],
      runtimeConsumerUsesPublishedArtifact: false,
      releaseExitApproved: false,
      impactMonitoringReady: false,
      rollbackTargetReady: false,
      accuracyMetricsAvailable: false,
    },
    nextRuntimeSteps: [
      'add_dedicated_seed_publication_writer_after_replay_candidate_approval',
      'record_seed_version_lineage_in_duration_prediction_events',
      'bind_seed_replay_accuracy_to_release_exit_and_rollback',
    ],
  },
  {
    rolloutBatch: 'plan_network_core_b',
    assetKey: 'special_work_duration_seed',
    assetFamily: 'special_work_seed_and_template_reference_days',
    implementationAnchors: {
      primaryService: 'wbsTemplateGenerationService.ts',
      runtimeConsumers: ['wbsTemplateGenerationService.ts', 'durationSuggestionService.ts'],
      predictionEventAnchors: ['network_prediction_events', 'wbs_template_generation_trace'],
      outcomeEventAnchors: ['wbsTemplateFeedbackGovernance.test.ts'],
      releaseGateAnchors: ['wbsTemplateCandidateEventService.ts'],
    },
    currentEvidence: {
      assetClassificationRegistered: true,
      predictionEventRecorded: false,
      actualOutcomeEventRecorded: false,
      tieredLearningPolicyRegistered: false,
      enabledLearningScopes: ['system'],
      runtimeConsumerUsesPublishedArtifact: false,
      releaseExitApproved: false,
      impactMonitoringReady: false,
      rollbackTargetReady: false,
      accuracyMetricsAvailable: false,
    },
    nextRuntimeSteps: [
      'record_special_work_network_prediction_event',
      'record_user_keep_delete_adjust_outcome_for_special_seed_rows',
      'publish_special_seed_candidates_through_release_exit_before_runtime_consumption',
    ],
  },
  {
    rolloutBatch: 'plan_network_core_b',
    assetKey: 'wbs_reference_days',
    assetFamily: 'wbs_reference_days_and_template_rhythm',
    implementationAnchors: {
      primaryService: 'wbsTemplateGoldenBenchmarkReplayService.ts',
      runtimeConsumers: ['wbsTemplateGenerationService.ts', 'projectRemainingDurationForecastService.ts'],
      predictionEventAnchors: ['network_prediction_events', 'wbs_reference_days_lineage'],
      outcomeEventAnchors: ['wbsTemplateFeedbackGovernance.test.ts', 'durationAccuracyReplayAcceptanceService.ts'],
      releaseGateAnchors: ['wbsTemplateGoldenBenchmarkGateService.ts'],
    },
    currentEvidence: {
      assetClassificationRegistered: true,
      predictionEventRecorded: false,
      actualOutcomeEventRecorded: false,
      tieredLearningPolicyRegistered: false,
      enabledLearningScopes: ['system'],
      runtimeConsumerUsesPublishedArtifact: false,
      releaseExitApproved: false,
      impactMonitoringReady: false,
      rollbackTargetReady: false,
      accuracyMetricsAvailable: false,
    },
    nextRuntimeSteps: [
      'create_wbs_reference_days_runtime_writer',
      'record_template_reference_days_prediction_and_outcome_events',
      'bind_template_feedback_to_accuracy_metrics_without_seed_silent_rewrite',
    ],
  },
  {
    rolloutBatch: 'plan_network_core_b',
    assetKey: 'dependency_rule_candidate',
    assetFamily: 'construction_dependency_rule_candidate',
    implementationAnchors: {
      primaryService: 'constructionDependencyReplayCalibrationService.ts',
      runtimeConsumers: ['wbsTemplateGenerationService.ts', 'scheduleAccelerationService.ts'],
      predictionEventAnchors: ['network_prediction_events', 'dependency_replay_calibration'],
      outcomeEventAnchors: ['constructionDependencyReplayCalibrationJob.ts'],
      releaseGateAnchors: ['constructionDependencyReplayCalibrationService.ts'],
    },
    currentEvidence: {
      assetClassificationRegistered: true,
      predictionEventRecorded: false,
      actualOutcomeEventRecorded: false,
      tieredLearningPolicyRegistered: false,
      enabledLearningScopes: ['system'],
      runtimeConsumerUsesPublishedArtifact: false,
      releaseExitApproved: false,
      impactMonitoringReady: false,
      rollbackTargetReady: false,
      accuracyMetricsAvailable: false,
    },
    nextRuntimeSteps: [
      'create_dependency_rule_runtime_writer_after_replay_candidate_approval',
      'record_dependency_prediction_event_and_actual_predecessor_fulfillment_outcome',
      'bind_dependency_accuracy_to_release_exit_and_rollback',
    ],
  },
  {
    rolloutBatch: 'plan_network_core_b',
    assetKey: 'critical_path_rule_candidate',
    assetFamily: 'critical_path_and_float_rule_candidate',
    implementationAnchors: {
      primaryService: 'projectCriticalPathService.ts',
      runtimeConsumers: ['projectRemainingDurationForecastService.ts', 'scheduleAccelerationRuntimeService.ts'],
      predictionEventAnchors: ['network_prediction_events', 'critical_path_projection_lineage'],
      outcomeEventAnchors: ['projectDailySnapshotService.ts', 'projectExecutionSummaryService.ts'],
      releaseGateAnchors: ['durationAccuracyReplayAcceptanceService.ts'],
    },
    currentEvidence: {
      assetClassificationRegistered: true,
      predictionEventRecorded: false,
      actualOutcomeEventRecorded: false,
      tieredLearningPolicyRegistered: false,
      enabledLearningScopes: ['system'],
      runtimeConsumerUsesPublishedArtifact: false,
      releaseExitApproved: false,
      impactMonitoringReady: false,
      rollbackTargetReady: false,
      accuracyMetricsAvailable: false,
    },
    nextRuntimeSteps: [
      'record_critical_path_prediction_event_and_float_outcome',
      'separate_user_confirmed_critical_path_fact_from_learned_projection_candidate',
      'publish_critical_path_rule_candidate_only_after_release_exit',
    ],
  },
]

function cloneContract(contract: DurationLiveLearningAssetContract): DurationLiveLearningAssetContract {
  return {
    ...contract,
    requiredLearningScopes: [...contract.requiredLearningScopes],
    boundaryPolicy: [...contract.boundaryPolicy],
  }
}

function uniqueConditions(values: DurationLiveLearningClosureCondition[]): DurationLiveLearningClosureCondition[] {
  return [...new Set(values)]
}

function normalizeScopeEvidence(value: DurationLearningScopeEvidence): DurationLearningScope | null {
  const scope = String(value ?? '').trim()
  if (scope === 'global' || scope === 'system') return 'global'
  if (scope === 'industry' || scope === 'industry_baseline' || scope === 'segment_baseline') return 'industry'
  if (scope === 'company') return 'company'
  if (scope === 'project') return 'project'
  return null
}

export function resolveDurationLearningScopeCoverage(
  scopes: readonly DurationLearningScopeEvidence[] | undefined,
): DurationLearningScopeCoverage {
  const normalized = new Set<DurationLearningScope>()
  const unknownScopes: string[] = []
  for (const scope of scopes ?? []) {
    const normalizedScope = normalizeScopeEvidence(scope)
    if (normalizedScope) {
      normalized.add(normalizedScope)
      continue
    }
    const raw = String(scope ?? '').trim()
    if (raw && !unknownScopes.includes(raw)) unknownScopes.push(raw)
  }
  const normalizedScopes = ALL_LEARNING_SCOPES.filter((scope) => normalized.has(scope))
  const missingScopes = ALL_LEARNING_SCOPES.filter((scope) => !normalized.has(scope))
  return {
    normalizedScopes,
    unknownScopes,
    hasFullCoverage: missingScopes.length === 0,
    missingScopes,
  }
}

function hasAllRequiredScopes(
  requiredScopes: DurationLearningScope[],
  enabledScopes: readonly DurationLearningScopeEvidence[] | undefined,
): boolean {
  if (requiredScopes.length === 0) return true
  const enabled = new Set(resolveDurationLearningScopeCoverage(enabledScopes).normalizedScopes)
  return requiredScopes.every((scope) => enabled.has(scope))
}

function evaluateLearnableAssetMissingConditions(
  contract: DurationLiveLearningAssetContract,
  evidence: DurationLiveLearningEvidence | undefined,
): DurationLiveLearningClosureCondition[] {
  const missing: DurationLiveLearningClosureCondition[] = []
  if (!evidence?.assetClassificationRegistered) missing.push('asset_classification_required')
  if (!evidence?.predictionEventRecorded) missing.push('prediction_event_required')
  if (!evidence?.actualOutcomeEventRecorded) missing.push('actual_outcome_event_required')
  if (!evidence?.tieredLearningPolicyRegistered) missing.push('tiered_learning_policy_required')
  if (!hasAllRequiredScopes(contract.requiredLearningScopes, evidence?.enabledLearningScopes)) {
    missing.push('global_industry_company_project_learning_scopes_required')
  }
  if (!evidence?.runtimeConsumerUsesPublishedArtifact) {
    missing.push('runtime_consumer_must_use_published_or_canary_artifact')
  }
  if (contract.publishGateRequired && !evidence?.releaseExitApproved) missing.push('release_exit_required')
  if (!evidence?.impactMonitoringReady) missing.push('impact_monitoring_required')
  if (!evidence?.rollbackTargetReady) missing.push('rollback_target_required')
  if (!evidence?.accuracyMetricsAvailable) missing.push('accuracy_metrics_required')
  return uniqueConditions(missing)
}

export function listDurationLiveLearningAssetContracts(): DurationLiveLearningAssetContract[] {
  return DURATION_LIVE_LEARNING_ASSET_CONTRACTS.map(cloneContract)
}

export function classifyDurationLiveLearningAsset(assetKey: DurationLiveLearningAssetKey): DurationLiveLearningAssetContract {
  const contract = CONTRACT_BY_ASSET_KEY.get(assetKey)
  if (!contract) {
    throw new Error(`Unknown duration live learning asset: ${assetKey}`)
  }
  return cloneContract(contract)
}

export function evaluateDurationLiveLearningAsset(
  input: DurationLiveLearningAssetEvaluationInput,
): DurationLiveLearningAssetEvaluation {
  const contract = classifyDurationLiveLearningAsset(input.assetKey)
  if (contract.factLocked) {
    return {
      assetKey: contract.assetKey,
      assetClass: contract.assetClass,
      status: 'fact_locked_closed',
      canLearn: contract.canLearn,
      factLocked: contract.factLocked,
      selfLearningPublishAllowed: contract.selfLearningPublishAllowed,
      allowedLiveLearningClaim: false,
      claimScope: 'business_fact_locked_not_learnable',
      missingClosureConditions: ['business_fact_must_not_be_self_learning_runtime_writer'],
      blockedReasonCodes: input.requestedFactRewrite
        ? ['duration_fact_auto_rewrite_blocked']
        : ['duration_fact_locked_as_learning_outcome_only'],
      contract,
    }
  }

  const missingClosureConditions = evaluateLearnableAssetMissingConditions(contract, input.evidence)
  const ready = missingClosureConditions.length === 0
  return {
    assetKey: contract.assetKey,
    assetClass: contract.assetClass,
    status: ready ? 'live_self_learning_ready' : 'not_ready',
    canLearn: contract.canLearn,
    factLocked: contract.factLocked,
    selfLearningPublishAllowed: contract.selfLearningPublishAllowed,
    allowedLiveLearningClaim: ready,
    claimScope: 'learnable_duration_asset_only',
    missingClosureConditions,
    blockedReasonCodes: ready ? [] : missingClosureConditions.map((condition) => `missing_${condition}`),
    contract,
  }
}

export function evaluateDurationLiveLearningPortfolio(
  items: DurationLiveLearningPortfolioItem[],
): DurationLiveLearningPortfolioEvaluation {
  const evaluations = items.map(evaluateDurationLiveLearningAsset)
  const learnableAssets = evaluations.filter((asset) => asset.canLearn)
  const factLockedAssets = evaluations.filter((asset) => asset.factLocked)
  const missingClosureConditions = uniqueConditions(
    learnableAssets.flatMap((asset) => asset.missingClosureConditions),
  )
  const ready = learnableAssets.length > 0
    && learnableAssets.every((asset) => asset.allowedLiveLearningClaim)
    && factLockedAssets.every((asset) => asset.status === 'fact_locked_closed')

  return {
    status: ready ? 'portfolio_live_self_learning_ready' : 'portfolio_not_ready',
    allowedClaim: ready
      ? 'all_learnable_duration_prediction_and_network_assets_are_live_self_learning;facts_and_commitments_remain_locked'
      : 'not_ready_for_live_self_learning_claim',
    prohibitedClaim: 'all_duration_assets_are_live_self_learning',
    learnableAssets,
    factLockedAssets,
    missingClosureConditions,
  }
}

function cloneManifest(manifest: DurationLiveLearningManifest): DurationLiveLearningManifest {
  return {
    ...manifest,
    implementationAnchors: {
      primaryService: manifest.implementationAnchors.primaryService,
      runtimeConsumers: [...manifest.implementationAnchors.runtimeConsumers],
      predictionEventAnchors: [...manifest.implementationAnchors.predictionEventAnchors],
      outcomeEventAnchors: [...manifest.implementationAnchors.outcomeEventAnchors],
      releaseGateAnchors: [...manifest.implementationAnchors.releaseGateAnchors],
    },
    currentEvidence: {
      ...manifest.currentEvidence,
      enabledLearningScopes: manifest.currentEvidence.enabledLearningScopes
        ? [...manifest.currentEvidence.enabledLearningScopes]
        : undefined,
    },
    nextRuntimeSteps: [...manifest.nextRuntimeSteps],
  }
}

export function listDurationLiveLearningManifests(
  rolloutBatch?: DurationLiveLearningRolloutBatch,
): DurationLiveLearningManifest[] {
  return DURATION_LIVE_LEARNING_MANIFESTS
    .filter((manifest) => !rolloutBatch || manifest.rolloutBatch === rolloutBatch)
    .map(cloneManifest)
}

export function evaluateDurationLiveLearningManifest(
  rolloutBatch: DurationLiveLearningRolloutBatch,
): DurationLiveLearningManifestEvaluation {
  const manifests = listDurationLiveLearningManifests(rolloutBatch)
  const assetEvaluations = manifests.map((manifest) => evaluateDurationLiveLearningAsset({
    assetKey: manifest.assetKey,
    evidence: manifest.currentEvidence,
  }))
  const missingClosureConditions = uniqueConditions(
    assetEvaluations.flatMap((evaluation) => evaluation.missingClosureConditions),
  )
  const readyAssets = assetEvaluations.filter((evaluation) => evaluation.allowedLiveLearningClaim).length
  const ready = manifests.length > 0 && readyAssets === manifests.length

  return {
    rolloutBatch,
    status: ready ? 'manifest_live_self_learning_ready' : 'manifest_not_ready',
    allowedClaim: rolloutBatch === 'duration_prediction_core_a'
      ? ready
        ? 'first_batch_live_self_learning_ready_for_learnable_assets'
        : 'first_batch_manifest_established_not_ready_for_live_self_learning_claim'
      : ready
        ? 'batch_live_self_learning_ready_for_learnable_assets'
        : 'batch_manifest_established_not_ready_for_live_self_learning_claim',
    prohibitedClaim: 'all_duration_assets_are_live_self_learning',
    totalAssets: manifests.length,
    readyAssets,
    assetEvaluations,
    missingClosureConditions,
  }
}

export function evaluateDurationLiveLearningExecutionPlan(
  rolloutBatches: DurationLiveLearningRolloutBatch[],
): DurationLiveLearningExecutionPlanEvaluation {
  const manifests = rolloutBatches.flatMap((batch) => listDurationLiveLearningManifests(batch))
  const evaluationsByAssetKey = new Map(
    manifests.map((manifest) => [
      manifest.assetKey,
      evaluateDurationLiveLearningAsset({
        assetKey: manifest.assetKey,
        evidence: manifest.currentEvidence,
      }),
    ]),
  )

  const gates = EXECUTION_GATE_DEFINITIONS.map((definition): DurationLiveLearningExecutionGate => {
    const assetKeys: DurationLiveLearningAssetKey[] = []
    const missingClosureConditions: DurationLiveLearningClosureCondition[] = []
    for (const [assetKey, evaluation] of evaluationsByAssetKey) {
      const matchedConditions = evaluation.missingClosureConditions.filter((condition) => (
        definition.conditions.includes(condition)
      ))
      if (matchedConditions.length === 0) continue
      assetKeys.push(assetKey)
      missingClosureConditions.push(...matchedConditions)
    }
    return {
      gateKey: definition.gateKey,
      status: assetKeys.length > 0 ? 'blocked' : 'passed',
      assetKeys,
      missingClosureConditions: uniqueConditions(missingClosureConditions),
      requiredActions: [...definition.requiredActions],
    }
  })

  const blockedAssetKeys = new Set<DurationLiveLearningAssetKey>()
  for (const gate of gates) {
    for (const assetKey of gate.assetKeys) blockedAssetKeys.add(assetKey)
  }

  const nextRecommendedAssetKeys = NEXT_ASSET_RECOMMENDATION_ORDER
    .filter((assetKey) => blockedAssetKeys.has(assetKey))
    .slice(0, 3)

  return {
    status: gates.some((gate) => gate.status === 'blocked')
      ? 'execution_plan_not_ready'
      : 'execution_plan_ready',
    prohibitedClaim: 'all_duration_assets_are_live_self_learning',
    rolloutBatches: [...rolloutBatches],
    gates,
    nextRecommendedAssetKeys,
  }
}
