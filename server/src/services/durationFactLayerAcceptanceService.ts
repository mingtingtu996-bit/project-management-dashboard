export type DurationFactLayerAssetCode =
  | 'project_generation_facts'
  | 'building_pattern_schedule_trust'
  | 'project_schedule_state'
  | 'runtime_execution_inference'
  | 'progress_deviation'
  | 'monthly_plan_closeout'
  | 'project_daily_snapshot'
  | 'project_execution_summary'
  | 'baseline_generation'
  | 'monthly_plan_generation'
  | 'baseline_commitment_snapshot'
  | 'monthly_plan_commitment_snapshot'
  | 'planning_table_commitment'
  | 'task_progress_snapshot'

export type DurationFactLayerRole =
  | 'static_project_fact_source'
  | 'static_schedule_context_gate'
  | 'runtime_fact_source'
  | 'error_decomposition_source'
  | 'actual_outcome_source'
  | 'summary_fact_source'
  | 'summary_truth_exit'
  | 'basis_record_only'
  | 'business_commitment_snapshot'
  | 'sample_health_source'

export type DurationPrecisionUse =
  | 'plan_creation_input'
  | 'reference_duration_input'
  | 'schedule_rhythm_context'
  | 'controlled_schedule_input'
  | 'runtime_adjustment_input'
  | 'actual_outcome_source'
  | 'sample_health_signal'
  | 'replay_acceptance_source'
  | 'accuracy_report_source'
  | 'accuracy_display_source'
  | 'basis_lineage_record'
  | 'fulfillment_evidence'
  | 'error_decomposition_input'

export type DurationFactLayerAction =
  | 'use_as_plan_creation_input'
  | 'use_as_reference_duration_input'
  | 'use_as_schedule_rhythm_context'
  | 'use_as_controlled_schedule_input'
  | 'use_as_runtime_adjustment_input'
  | 'use_as_actual_outcome'
  | 'use_as_sample_health_signal'
  | 'use_as_replay_acceptance_source'
  | 'use_as_accuracy_report_source'
  | 'use_as_accuracy_display_source'
  | 'use_as_error_decomposition_input'
  | 'record_basis_lineage'
  | 'record_fulfillment_evidence'
  | 'publish_learning_update'
  | 'auto_rewrite_fact'

export type DurationFactLayerContract = {
  code: DurationFactLayerAssetCode
  label: string
  ownerService: string
  role: DurationFactLayerRole
  allowedPrecisionUses: DurationPrecisionUse[]
  recordGenerationBasisRequired: boolean
  fulfillmentTrackingRequired: boolean
  autoRewriteAllowed: boolean
  selfLearningPublishAllowed: boolean
  boundaryPolicy: string[]
}

export type DurationFactLayerActionEvaluation = {
  allowed: boolean
  assetCode: string
  action: DurationFactLayerAction | string
  contract?: DurationFactLayerContract
  findingCode?:
    | 'duration_fact_layer_contract_unknown'
    | 'duration_fact_layer_auto_rewrite_blocked'
    | 'duration_fact_layer_learning_publish_blocked'
    | 'duration_fact_layer_input_strength_not_sufficient'
    | 'duration_fact_layer_precision_use_not_allowed'
  message?: string
}

const ACTION_TO_PRECISION_USE: Partial<Record<DurationFactLayerAction, DurationPrecisionUse>> = {
  use_as_plan_creation_input: 'plan_creation_input',
  use_as_reference_duration_input: 'reference_duration_input',
  use_as_schedule_rhythm_context: 'schedule_rhythm_context',
  use_as_controlled_schedule_input: 'controlled_schedule_input',
  use_as_runtime_adjustment_input: 'runtime_adjustment_input',
  use_as_actual_outcome: 'actual_outcome_source',
  use_as_sample_health_signal: 'sample_health_signal',
  use_as_replay_acceptance_source: 'replay_acceptance_source',
  use_as_accuracy_report_source: 'accuracy_report_source',
  use_as_accuracy_display_source: 'accuracy_display_source',
  use_as_error_decomposition_input: 'error_decomposition_input',
  record_basis_lineage: 'basis_lineage_record',
  record_fulfillment_evidence: 'fulfillment_evidence',
}

const DURATION_FACT_LAYER_CONTRACTS: DurationFactLayerContract[] = [
  {
    code: 'project_generation_facts',
    label: 'Project generation facts',
    ownerService: 'projectGenerationFactsStoreService/projectGenerationFactsConsumerRegistry',
    role: 'static_project_fact_source',
    allowedPrecisionUses: ['plan_creation_input', 'reference_duration_input', 'basis_lineage_record', 'accuracy_report_source'],
    recordGenerationBasisRequired: true,
    fulfillmentTrackingRequired: false,
    autoRewriteAllowed: false,
    selfLearningPublishAllowed: false,
    boundaryPolicy: [
      'project_generation_facts_are_static_project_identity_and_scale_inputs',
      'static_facts_must_enter_consumer_matrix_before_algorithm_consumption',
      'learning_must_not_rewrite_project_static_facts',
    ],
  },
  {
    code: 'building_pattern_schedule_trust',
    label: 'Building-pattern schedule trust gate',
    ownerService: 'buildingPatternScheduleTrustService',
    role: 'static_schedule_context_gate',
    allowedPrecisionUses: ['schedule_rhythm_context', 'controlled_schedule_input', 'basis_lineage_record'],
    recordGenerationBasisRequired: true,
    fulfillmentTrackingRequired: false,
    autoRewriteAllowed: false,
    selfLearningPublishAllowed: false,
    boundaryPolicy: [
      'building_pattern_is_schedule_rhythm_context_before_trust_gate',
      'building_pattern_controlled_schedule_input_requires_real_project_benchmark_bound',
      'building_pattern_never_creates_hard_dependency_or_planned_date_without_five_layer_dependency_authority',
    ],
  },
  {
    code: 'project_schedule_state',
    label: 'Project schedule state',
    ownerService: 'projectScheduleStateService',
    role: 'runtime_fact_source',
    allowedPrecisionUses: ['actual_outcome_source', 'sample_health_signal', 'error_decomposition_input'],
    recordGenerationBasisRequired: false,
    fulfillmentTrackingRequired: false,
    autoRewriteAllowed: false,
    selfLearningPublishAllowed: false,
    boundaryPolicy: [
      'schedule_state_is_runtime_fact_input',
      'learning_must_not_rewrite_business_status',
    ],
  },
  {
    code: 'runtime_execution_inference',
    label: 'Runtime execution inference',
    ownerService: 'runtimeExecutionInferenceService',
    role: 'runtime_fact_source',
    allowedPrecisionUses: ['basis_lineage_record', 'error_decomposition_input', 'accuracy_report_source', 'runtime_adjustment_input'],
    recordGenerationBasisRequired: true,
    fulfillmentTrackingRequired: false,
    autoRewriteAllowed: false,
    selfLearningPublishAllowed: false,
    boundaryPolicy: [
      'runtime_inference_uses_existing_execution_state_only',
      'runtime_inference_is_not_actual_outcome_source',
      'runtime_inference_must_keep_fact_type_confidence_window_and_evidence_objects',
      'learning_must_not_rewrite_task_dates_or_static_facts_from_inference',
    ],
  },
  {
    code: 'progress_deviation',
    label: 'Progress deviation',
    ownerService: 'progressDeviationService',
    role: 'error_decomposition_source',
    allowedPrecisionUses: ['error_decomposition_input', 'accuracy_report_source', 'replay_acceptance_source'],
    recordGenerationBasisRequired: false,
    fulfillmentTrackingRequired: false,
    autoRewriteAllowed: false,
    selfLearningPublishAllowed: false,
    boundaryPolicy: [
      'deviation_thresholds_are_not_auto_tuned_in_v14224',
      'deviation_results_may_explain_forecast_error',
    ],
  },
  {
    code: 'monthly_plan_closeout',
    label: 'Monthly plan closeout',
    ownerService: 'monthlyPlanCloseoutService',
    role: 'actual_outcome_source',
    allowedPrecisionUses: ['actual_outcome_source', 'sample_health_signal', 'fulfillment_evidence'],
    recordGenerationBasisRequired: false,
    fulfillmentTrackingRequired: true,
    autoRewriteAllowed: false,
    selfLearningPublishAllowed: false,
    boundaryPolicy: [
      'closeout_is_actual_outcome_evidence',
      'closeout_decision_must_not_be_overwritten_by_learning',
    ],
  },
  {
    code: 'project_daily_snapshot',
    label: 'Project daily snapshot',
    ownerService: 'projectDailySnapshotService',
    role: 'summary_fact_source',
    allowedPrecisionUses: ['accuracy_report_source', 'replay_acceptance_source', 'error_decomposition_input'],
    recordGenerationBasisRequired: false,
    fulfillmentTrackingRequired: false,
    autoRewriteAllowed: false,
    selfLearningPublishAllowed: false,
    boundaryPolicy: [
      'snapshot_is_fact_layer_for_trends_and_backtests',
      'snapshot_values_are_evidence_not_learning_parameters',
    ],
  },
  {
    code: 'project_execution_summary',
    label: 'Project execution summary',
    ownerService: 'projectExecutionSummaryService',
    role: 'summary_truth_exit',
    allowedPrecisionUses: ['accuracy_display_source', 'accuracy_report_source'],
    recordGenerationBasisRequired: false,
    fulfillmentTrackingRequired: false,
    autoRewriteAllowed: false,
    selfLearningPublishAllowed: false,
    boundaryPolicy: [
      'summary_service_is_display_truth_exit',
      'front_end_must_not_recompute_precision_metrics',
    ],
  },
  {
    code: 'baseline_generation',
    label: 'Baseline generation',
    ownerService: 'baselineGenerationService',
    role: 'basis_record_only',
    allowedPrecisionUses: ['basis_lineage_record', 'fulfillment_evidence'],
    recordGenerationBasisRequired: true,
    fulfillmentTrackingRequired: true,
    autoRewriteAllowed: false,
    selfLearningPublishAllowed: false,
    boundaryPolicy: [
      'baseline_generation_records_basis_only',
      'baseline_generation_does_not_self_publish_learning',
      'learning_must_not_rewrite_published_baseline_commitment',
    ],
  },
  {
    code: 'monthly_plan_generation',
    label: 'Monthly plan generation',
    ownerService: 'monthlyPlanGenerationService',
    role: 'basis_record_only',
    allowedPrecisionUses: ['basis_lineage_record', 'fulfillment_evidence'],
    recordGenerationBasisRequired: true,
    fulfillmentTrackingRequired: true,
    autoRewriteAllowed: false,
    selfLearningPublishAllowed: false,
    boundaryPolicy: [
      'monthly_generation_records_basis_only',
      'monthly_generation_does_not_self_publish_learning',
      'learning_must_not_rewrite_monthly_commitment',
    ],
  },
  {
    code: 'baseline_commitment_snapshot',
    label: 'Baseline commitment snapshot',
    ownerService: 'baselineGovernanceService/planningSnapshotService',
    role: 'business_commitment_snapshot',
    allowedPrecisionUses: ['basis_lineage_record', 'fulfillment_evidence', 'replay_acceptance_source'],
    recordGenerationBasisRequired: true,
    fulfillmentTrackingRequired: true,
    autoRewriteAllowed: false,
    selfLearningPublishAllowed: false,
    boundaryPolicy: [
      'baseline_snapshot_is_business_commitment',
      'precision_learning_may_measure_against_it_but_not_mutate_it',
    ],
  },
  {
    code: 'monthly_plan_commitment_snapshot',
    label: 'Monthly plan commitment snapshot',
    ownerService: 'monthlyPlanGenerationService/planningSnapshotService',
    role: 'business_commitment_snapshot',
    allowedPrecisionUses: ['basis_lineage_record', 'fulfillment_evidence', 'replay_acceptance_source'],
    recordGenerationBasisRequired: true,
    fulfillmentTrackingRequired: true,
    autoRewriteAllowed: false,
    selfLearningPublishAllowed: false,
    boundaryPolicy: [
      'monthly_snapshot_is_business_commitment',
      'precision_learning_may_measure_fulfillment_but_not_rewrite_commitment',
    ],
  },
  {
    code: 'planning_table_commitment',
    label: 'Planning table commitment',
    ownerService: 'planningTableCommitService',
    role: 'business_commitment_snapshot',
    allowedPrecisionUses: ['actual_outcome_source', 'basis_lineage_record', 'fulfillment_evidence'],
    recordGenerationBasisRequired: true,
    fulfillmentTrackingRequired: true,
    autoRewriteAllowed: false,
    selfLearningPublishAllowed: false,
    boundaryPolicy: [
      'planning_commit_is_business_fact_event',
      'learning_must_not_override_user_submitted_plan',
    ],
  },
  {
    code: 'task_progress_snapshot',
    label: 'Task progress snapshot',
    ownerService: 'taskWriteChainService/task_progress_snapshots',
    role: 'sample_health_source',
    allowedPrecisionUses: ['actual_outcome_source', 'sample_health_signal', 'replay_acceptance_source'],
    recordGenerationBasisRequired: false,
    fulfillmentTrackingRequired: false,
    autoRewriteAllowed: false,
    selfLearningPublishAllowed: false,
    boundaryPolicy: [
      'progress_snapshot_is_actual_progress_evidence',
      'learning_must_not_rewrite_progress_history',
    ],
  },
]

const CONTRACT_BY_CODE = new Map(DURATION_FACT_LAYER_CONTRACTS.map((contract) => [contract.code, contract]))

function cloneContract(contract: DurationFactLayerContract): DurationFactLayerContract {
  return {
    ...contract,
    allowedPrecisionUses: [...contract.allowedPrecisionUses],
    boundaryPolicy: [...contract.boundaryPolicy],
  }
}

export function listDurationFactLayerContracts(): DurationFactLayerContract[] {
  return DURATION_FACT_LAYER_CONTRACTS.map(cloneContract)
}

export function getDurationFactLayerContract(code: DurationFactLayerAssetCode | string): DurationFactLayerContract | undefined {
  const normalizedCode = String(code ?? '').trim()
  const contract = CONTRACT_BY_CODE.get(normalizedCode as DurationFactLayerAssetCode)
  return contract ? cloneContract(contract) : undefined
}

export function evaluateDurationFactLayerAction(input: {
  assetCode: DurationFactLayerAssetCode | string
  action: DurationFactLayerAction | string
  runtimeInferenceSummary?: {
    readinessStatus?: string | null
    impactBoundary?: string | null
  } | null
  buildingPatternTrustLevel?: string | null
}): DurationFactLayerActionEvaluation {
  const assetCode = String(input.assetCode ?? '').trim()
  const action = String(input.action ?? '').trim() as DurationFactLayerAction
  const contract = getDurationFactLayerContract(assetCode)
  if (!contract) {
    return {
      allowed: false,
      assetCode,
      action,
      findingCode: 'duration_fact_layer_contract_unknown',
      message: `Duration fact-layer asset ${assetCode || '<empty>'} is not governed.`,
    }
  }
  if (action === 'auto_rewrite_fact' && !contract.autoRewriteAllowed) {
    return {
      allowed: false,
      assetCode,
      action,
      contract,
      findingCode: 'duration_fact_layer_auto_rewrite_blocked',
      message: `Duration precision learning cannot auto-rewrite ${assetCode}.`,
    }
  }
  if (action === 'publish_learning_update' && !contract.selfLearningPublishAllowed) {
    return {
      allowed: false,
      assetCode,
      action,
      contract,
      findingCode: 'duration_fact_layer_learning_publish_blocked',
      message: `Duration fact-layer asset ${assetCode} is not a self-learning publish target.`,
    }
  }
  const precisionUse = ACTION_TO_PRECISION_USE[action]
  if (precisionUse && contract.allowedPrecisionUses.includes(precisionUse)) {
    if (
      action === 'use_as_runtime_adjustment_input'
      && (
        input.runtimeInferenceSummary?.readinessStatus !== 'commercial_ready'
        || input.runtimeInferenceSummary?.impactBoundary !== 'runtime_adjustment_allowed'
      )
    ) {
      return {
        allowed: false,
        assetCode,
        action,
        contract,
        findingCode: 'duration_fact_layer_input_strength_not_sufficient',
        message: `Runtime execution inference cannot drive runtime duration adjustment without commercial-ready evidence and runtime-adjustment boundary.`,
      }
    }
    if (
      action === 'use_as_controlled_schedule_input'
      && input.buildingPatternTrustLevel !== 'controlled_schedule_input'
    ) {
      return {
        allowed: false,
        assetCode,
        action,
        contract,
        findingCode: 'duration_fact_layer_input_strength_not_sufficient',
        message: `Building-pattern schedule context cannot become a controlled schedule input before the trust gate is controlled_schedule_input.`,
      }
    }
    return {
      allowed: true,
      assetCode,
      action,
      contract,
    }
  }
  return {
    allowed: false,
    assetCode,
    action,
    contract,
    findingCode: 'duration_fact_layer_precision_use_not_allowed',
    message: `Duration fact-layer asset ${assetCode} cannot be used for ${action}.`,
  }
}
