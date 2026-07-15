export type DurationPrecisionBoundaryAction =
  | 'register_asset'
  | 'evaluate_release_gate'
  | 'publish_runtime_parameter'
  | 'rollback_runtime_parameter'
  | 'block_fact_rewrite'
  | 'record_prediction_event'
  | 'record_actual_outcome'
  | 'calculate_accuracy_metrics'
  | 'produce_precision_candidate'
  | 'consume_published_runtime_overlay'
  | 'claim_accuracy_improved'
  | 'auto_rewrite_fact'

export type DurationPrecisionBoundaryOwnerPlane =
  | 'v1.4.22.3_governance_control'
  | 'v1.4.22.4_precision_learning'
  | 'business_fact_lock'

export type DurationPrecisionBoundaryActionContract = {
  action: DurationPrecisionBoundaryAction
  ownerPlane: DurationPrecisionBoundaryOwnerPlane
  requiresReleaseExit: boolean
  requiresAccuracyEvidence: boolean
  boundaryPolicy: string[]
}

export type DurationPrecisionBoundaryEvaluationInput = {
  action: DurationPrecisionBoundaryAction
  requestedByPlane?: DurationPrecisionBoundaryOwnerPlane
  releaseExitApproved?: boolean
  accuracyMetricsAvailable?: boolean
  factKind?: string
}

export type DurationPrecisionBoundaryEvaluation = {
  allowed: boolean
  action: DurationPrecisionBoundaryAction
  ownerPlane: DurationPrecisionBoundaryOwnerPlane
  contract?: DurationPrecisionBoundaryActionContract
  findingCode?:
    | 'duration_precision_boundary_action_unknown'
    | 'precision_learning_cannot_bypass_governance_release_exit'
    | 'governance_release_exit_required'
    | 'governance_control_cannot_claim_precision_without_metrics'
    | 'accuracy_metrics_required'
    | 'business_fact_auto_rewrite_blocked'
    | 'duration_precision_boundary_owner_mismatch'
  message?: string
}

const DURATION_PRECISION_BOUNDARY_ACTION_CONTRACTS: DurationPrecisionBoundaryActionContract[] = [
  {
    action: 'register_asset',
    ownerPlane: 'v1.4.22.3_governance_control',
    requiresReleaseExit: false,
    requiresAccuracyEvidence: false,
    boundaryPolicy: [
      'governance_registers_asset_scope_and_four_tuple',
      'registration_does_not_prove_accuracy_improvement',
    ],
  },
  {
    action: 'evaluate_release_gate',
    ownerPlane: 'v1.4.22.3_governance_control',
    requiresReleaseExit: false,
    requiresAccuracyEvidence: false,
    boundaryPolicy: [
      'governance_evaluates_release_exit_and_rollback_readiness',
      'release_gate_does_not_self_measure_forecast_error',
    ],
  },
  {
    action: 'publish_runtime_parameter',
    ownerPlane: 'v1.4.22.3_governance_control',
    requiresReleaseExit: true,
    requiresAccuracyEvidence: false,
    boundaryPolicy: [
      'runtime_publication_requires_v14223_release_exit',
      'precision_learning_must_not_self_publish_runtime_changes',
    ],
  },
  {
    action: 'rollback_runtime_parameter',
    ownerPlane: 'v1.4.22.3_governance_control',
    requiresReleaseExit: false,
    requiresAccuracyEvidence: false,
    boundaryPolicy: [
      'runtime_rollback_requires_governance_audit_and_domain_writer',
      'rollback_target_does_not_equal_rollback_executed',
    ],
  },
  {
    action: 'block_fact_rewrite',
    ownerPlane: 'v1.4.22.3_governance_control',
    requiresReleaseExit: false,
    requiresAccuracyEvidence: false,
    boundaryPolicy: [
      'governance_blocks_learning_from_rewriting_business_facts',
      'facts_remain_owned_by_business_write_chains',
    ],
  },
  {
    action: 'record_prediction_event',
    ownerPlane: 'v1.4.22.4_precision_learning',
    requiresReleaseExit: false,
    requiresAccuracyEvidence: false,
    boundaryPolicy: [
      'precision_learning_records_runtime_prediction_event',
      'prediction_event_is_evidence_not_publication',
    ],
  },
  {
    action: 'record_actual_outcome',
    ownerPlane: 'v1.4.22.4_precision_learning',
    requiresReleaseExit: false,
    requiresAccuracyEvidence: false,
    boundaryPolicy: [
      'precision_learning_records_actual_outcome_and_sample_health',
      'actual_outcome_must_not_be_fabricated_from_candidate_data',
    ],
  },
  {
    action: 'calculate_accuracy_metrics',
    ownerPlane: 'v1.4.22.4_precision_learning',
    requiresReleaseExit: false,
    requiresAccuracyEvidence: true,
    boundaryPolicy: [
      'precision_learning_owns_mae_bias_overcompensation_metrics',
      'metrics_are_required_before_accuracy_claims',
    ],
  },
  {
    action: 'produce_precision_candidate',
    ownerPlane: 'v1.4.22.4_precision_learning',
    requiresReleaseExit: false,
    requiresAccuracyEvidence: true,
    boundaryPolicy: [
      'precision_learning_can_generate_candidate_and_unlock_evidence',
      'candidate_does_not_change_runtime_until_v14223_publishes',
    ],
  },
  {
    action: 'consume_published_runtime_overlay',
    ownerPlane: 'v1.4.22.4_precision_learning',
    requiresReleaseExit: true,
    requiresAccuracyEvidence: true,
    boundaryPolicy: [
      'precision_learning_may_consume_only_governance_published_runtime_overlay',
      'shadow_or_candidate_overlay_must_not_change_runtime_prediction',
    ],
  },
  {
    action: 'claim_accuracy_improved',
    ownerPlane: 'v1.4.22.4_precision_learning',
    requiresReleaseExit: false,
    requiresAccuracyEvidence: true,
    boundaryPolicy: [
      'accuracy_improvement_claim_requires_v14224_metrics',
      'governance_safety_evidence_must_not_be_rebranded_as_precision_gain',
    ],
  },
  {
    action: 'auto_rewrite_fact',
    ownerPlane: 'business_fact_lock',
    requiresReleaseExit: false,
    requiresAccuracyEvidence: false,
    boundaryPolicy: [
      'learning_system_must_not_auto_rewrite_business_facts',
      'actual_baseline_monthly_plan_dependency_critical_path_progress_are_locked',
    ],
  },
]

const CONTRACT_BY_ACTION = new Map(
  DURATION_PRECISION_BOUNDARY_ACTION_CONTRACTS.map((contract) => [contract.action, contract]),
)

function cloneContract(contract: DurationPrecisionBoundaryActionContract): DurationPrecisionBoundaryActionContract {
  return {
    ...contract,
    boundaryPolicy: [...contract.boundaryPolicy],
  }
}

export function listDurationPrecisionBoundaryActionContracts(): DurationPrecisionBoundaryActionContract[] {
  return DURATION_PRECISION_BOUNDARY_ACTION_CONTRACTS.map(cloneContract)
}

export function classifyDurationPrecisionBoundaryAction(action: DurationPrecisionBoundaryAction): DurationPrecisionBoundaryActionContract | undefined {
  const contract = CONTRACT_BY_ACTION.get(action)
  return contract ? cloneContract(contract) : undefined
}

export function evaluateDurationPrecisionBoundaryAction(input: DurationPrecisionBoundaryEvaluationInput): DurationPrecisionBoundaryEvaluation {
  const contract = classifyDurationPrecisionBoundaryAction(input.action)
  if (!contract) {
    return {
      allowed: false,
      action: input.action,
      ownerPlane: 'v1.4.22.3_governance_control',
      findingCode: 'duration_precision_boundary_action_unknown',
      message: 'Unknown duration precision boundary action must not be treated as release or accuracy evidence.',
    }
  }

  if (contract.ownerPlane === 'business_fact_lock' || input.action === 'auto_rewrite_fact') {
    return {
      allowed: false,
      action: input.action,
      ownerPlane: 'business_fact_lock',
      contract,
      findingCode: 'business_fact_auto_rewrite_blocked',
      message: `${input.factKind ?? 'business_fact'} is locked from duration precision auto-rewrite.`,
    }
  }

  if (input.requestedByPlane && input.requestedByPlane !== contract.ownerPlane) {
    if (input.action === 'publish_runtime_parameter' && input.requestedByPlane === 'v1.4.22.4_precision_learning') {
      return {
        allowed: false,
        action: input.action,
        ownerPlane: contract.ownerPlane,
        contract,
        findingCode: 'precision_learning_cannot_bypass_governance_release_exit',
        message: 'v1.4.22.4 can produce precision evidence, but runtime publication remains owned by v1.4.22.3 release-exit.',
      }
    }
    if (input.action === 'claim_accuracy_improved' && input.requestedByPlane === 'v1.4.22.3_governance_control' && !input.accuracyMetricsAvailable) {
      return {
        allowed: false,
        action: input.action,
        ownerPlane: contract.ownerPlane,
        contract,
        findingCode: 'governance_control_cannot_claim_precision_without_metrics',
        message: 'v1.4.22.3 governance evidence cannot be used as an accuracy-improvement claim without v1.4.22.4 metrics.',
      }
    }
    return {
      allowed: false,
      action: input.action,
      ownerPlane: contract.ownerPlane,
      contract,
      findingCode: 'duration_precision_boundary_owner_mismatch',
      message: `${input.action} is owned by ${contract.ownerPlane}, not ${input.requestedByPlane}.`,
    }
  }

  if (contract.requiresReleaseExit && !input.releaseExitApproved) {
    return {
      allowed: false,
      action: input.action,
      ownerPlane: contract.ownerPlane,
      contract,
      findingCode: 'governance_release_exit_required',
      message: `${input.action} requires v1.4.22.3 release-exit approval before runtime consumption.`,
    }
  }

  if (contract.requiresAccuracyEvidence && !input.accuracyMetricsAvailable) {
    if (input.action === 'claim_accuracy_improved') {
      return {
        allowed: false,
        action: input.action,
        ownerPlane: contract.ownerPlane,
        contract,
        findingCode: 'governance_control_cannot_claim_precision_without_metrics',
        message: 'Accuracy-improvement claims require v1.4.22.4 MAE/Bias/overcompensation evidence.',
      }
    }
    return {
      allowed: false,
      action: input.action,
      ownerPlane: contract.ownerPlane,
      contract,
      findingCode: 'accuracy_metrics_required',
      message: `${input.action} requires v1.4.22.4 accuracy metrics evidence.`,
    }
  }

  return {
    allowed: true,
    action: input.action,
    ownerPlane: contract.ownerPlane,
    contract,
  }
}
