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
  enabledLearningScopes?: readonly DurationLearningScope[]
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

const ALL_LEARNING_SCOPES: DurationLearningScope[] = ['global', 'industry', 'company', 'project']

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

function hasAllRequiredScopes(
  requiredScopes: DurationLearningScope[],
  enabledScopes: readonly DurationLearningScope[] | undefined,
): boolean {
  if (requiredScopes.length === 0) return true
  const enabled = new Set(enabledScopes ?? [])
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
