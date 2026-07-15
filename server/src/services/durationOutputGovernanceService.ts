import type { AlgorithmFactContextPhase } from './algorithmFactContextService.js'

export type DurationOutputCode =
  | 'template_fast_estimate'
  | 'plan_reference'
  | 'contextual_reference'
  | 'remaining_forecast'
  | 'project_remaining_forecast'
  | 'phase_window'
  | 'acceleration_target'

export type DurationOutputWriteTarget =
  | 'diagnostic_preview'
  | 'template_generation_metadata'
  | 'plan_task_duration'
  | 'plan_baseline_snapshot'
  | 'runtime_reference_api'
  | 'runtime_forecast_snapshot'
  | 'runtime_forecast_api'
  | 'phase_network_metadata'
  | 'schedule_acceleration_plan'
  | 'monthly_plan_commitment'

export type DurationOutputContract = {
  code: DurationOutputCode
  semanticFieldName: string
  label: string
  ownerService: string
  algorithmFactContextPhase: AlgorithmFactContextPhase
  allowedWriteTargets: DurationOutputWriteTarget[]
  boundaryPolicy: string[]
}

export type DurationOutputWriteEvaluation = {
  allowed: boolean
  outputCode: string
  target: DurationOutputWriteTarget | string
  contract?: DurationOutputContract
  findingCode?: 'duration_output_contract_unknown' | 'duration_output_write_target_not_allowed'
  message?: string
}

export type DurationOutputPromotionEvaluation = {
  fromOutputCode: DurationOutputCode | string
  toOutputCode: DurationOutputCode
  policyCode: string
  writeTarget: DurationOutputWriteTarget
  promotedByService: string
  sourceFieldName: string | null
  targetFieldName: string | null
  directWriteEvaluation: DurationOutputWriteEvaluation
  promotedWriteEvaluation: DurationOutputWriteEvaluation
  excludedContextFactors?: string[]
  quality?: string
}

export type DurationOutputPromotionPolicyEvaluation = DurationOutputPromotionEvaluation & {
  promotionAllowed: boolean
  promotionFindingCode?: 'duration_output_promotion_not_allowed' | 'duration_output_promoted_write_target_not_allowed'
  promotionMessage?: string
}

const DURATION_OUTPUT_PROMOTION_POLICY: Array<{
  fromOutputCode: DurationOutputCode
  toOutputCode: DurationOutputCode
  writeTarget: DurationOutputWriteTarget
  policyCode: string
}> = [
  {
    fromOutputCode: 'contextual_reference',
    toOutputCode: 'plan_reference',
    writeTarget: 'plan_task_duration',
    policyCode: 'contextual_reference_to_plan_reference_on_explicit_plan_generation',
  },
]

const DURATION_OUTPUT_CONTRACTS: DurationOutputContract[] = [
  {
    code: 'template_fast_estimate',
    semanticFieldName: 'templateFastEstimateDays',
    label: 'Template fast estimate',
    ownerService: 'wbsTemplateGenerationService',
    algorithmFactContextPhase: 'plan_creation',
    allowedWriteTargets: ['diagnostic_preview', 'template_generation_metadata'],
    boundaryPolicy: [
      'fast_estimate_is_performance_path_only',
      'must_not_write_final_plan_task_duration',
      'must_not_be_promoted_to_plan_task_duration',
    ],
  },
  {
    code: 'plan_reference',
    semanticFieldName: 'planReferenceDays',
    label: 'Plan reference duration',
    ownerService: 'durationSuggestionService/wbsTemplateGenerationService',
    algorithmFactContextPhase: 'plan_creation',
    allowedWriteTargets: ['plan_task_duration', 'plan_baseline_snapshot', 'template_generation_metadata'],
    boundaryPolicy: [
      'project_generation_facts_are_primary',
      'writes_new_plan_or_baseline_duration',
      'must_remain_consistent_with_phase_window_and_rollup_ledgers',
    ],
  },
  {
    code: 'contextual_reference',
    semanticFieldName: 'contextualReferenceDays',
    label: 'Contextual task reference duration',
    ownerService: 'durationSuggestionService',
    algorithmFactContextPhase: 'new_task_reference',
    allowedWriteTargets: ['runtime_reference_api', 'monthly_plan_commitment'],
    boundaryPolicy: [
      'new_task_reference_uses_project_facts_plus_current_context',
      'does_not_overwrite_existing_plan_baseline_without_user_commit',
    ],
  },
  {
    code: 'remaining_forecast',
    semanticFieldName: 'remainingForecastDays',
    label: 'Remaining execution forecast duration',
    ownerService: 'taskDurationForecastService',
    algorithmFactContextPhase: 'runtime_forecast',
    allowedWriteTargets: ['runtime_forecast_snapshot', 'runtime_forecast_api'],
    boundaryPolicy: [
      'runtime_execution_facts_are_primary',
      'forecast_only_until_committed_by_recovery_or_monthly_plan_flow',
      'must_not_rewrite_original_plan_reference_duration',
    ],
  },
  {
    code: 'project_remaining_forecast',
    semanticFieldName: 'projectRemainingForecastDays',
    label: 'Project remaining execution forecast duration',
    ownerService: 'projectRemainingDurationForecastService/scheduleAccelerationRuntimeService',
    algorithmFactContextPhase: 'runtime_forecast',
    allowedWriteTargets: ['runtime_forecast_api', 'schedule_acceleration_plan', 'monthly_plan_commitment'],
    boundaryPolicy: [
      'runtime_execution_facts_are_primary',
      'aggregates_critical_path_remaining_forecasts_monthly_commitments_and_external_gates',
      'must_not_rewrite_original_plan_reference_duration',
      'project_remaining_forecast_is_not_single_task_remaining_forecast',
    ],
  },
  {
    code: 'phase_window',
    semanticFieldName: 'phaseWindowDays',
    label: 'Phase network window duration',
    ownerService: 'projectScenarioTaxonomyService/wbsTemplateGenerationService',
    algorithmFactContextPhase: 'plan_creation',
    allowedWriteTargets: ['phase_network_metadata', 'plan_baseline_snapshot'],
    boundaryPolicy: [
      'global_duration_window_not_raw_task_sum',
      'compared_against_critical_path_rollup_and_milestone_gates',
    ],
  },
  {
    code: 'acceleration_target',
    semanticFieldName: 'accelerationTargetDays',
    label: 'Acceleration target duration',
    ownerService: 'scheduleAccelerationService',
    algorithmFactContextPhase: 'runtime_delay_recovery',
    allowedWriteTargets: ['schedule_acceleration_plan', 'monthly_plan_commitment'],
    boundaryPolicy: [
      'runtime_execution_facts_are_primary',
      'target_duration_is_recovery_commitment_not_seed_reference',
      'does_not_mutate_static_project_generation_facts',
    ],
  },
]

const CONTRACT_BY_CODE = new Map(DURATION_OUTPUT_CONTRACTS.map((contract) => [contract.code, contract]))

export function listDurationOutputContracts(): DurationOutputContract[] {
  return DURATION_OUTPUT_CONTRACTS.map((contract) => ({
    ...contract,
    allowedWriteTargets: [...contract.allowedWriteTargets],
    boundaryPolicy: [...contract.boundaryPolicy],
  }))
}

export function getDurationOutputContract(code: DurationOutputCode | string): DurationOutputContract | undefined {
  const contract = CONTRACT_BY_CODE.get(code as DurationOutputCode)
  if (!contract) return undefined
  return {
    ...contract,
    allowedWriteTargets: [...contract.allowedWriteTargets],
    boundaryPolicy: [...contract.boundaryPolicy],
  }
}

export function isGovernedDurationOutputCode(code: unknown): code is DurationOutputCode {
  return CONTRACT_BY_CODE.has(String(code ?? '').trim() as DurationOutputCode)
}

export function evaluateDurationOutputWrite(input: {
  outputCode: DurationOutputCode | string
  target: DurationOutputWriteTarget | string
}): DurationOutputWriteEvaluation {
  const outputCode = String(input.outputCode ?? '').trim()
  const target = String(input.target ?? '').trim()
  const contract = getDurationOutputContract(outputCode)
  if (!contract) {
    return {
      allowed: false,
      outputCode,
      target,
      findingCode: 'duration_output_contract_unknown',
      message: `Duration output ${outputCode || '<empty>'} is not governed.`,
    }
  }
  if (!contract.allowedWriteTargets.includes(target as DurationOutputWriteTarget)) {
    return {
      allowed: false,
      outputCode,
      target,
      contract,
      findingCode: 'duration_output_write_target_not_allowed',
      message: `Duration output ${outputCode} cannot write to ${target}.`,
    }
  }
  return {
    allowed: true,
    outputCode,
    target,
    contract,
  }
}

export function buildDurationOutputPromotionEvaluation(input: {
  fromOutputCode: DurationOutputCode | string
  toOutputCode: DurationOutputCode
  writeTarget: DurationOutputWriteTarget
  policyCode: string
  promotedByService: string
  sourceFieldName?: string | null
  targetFieldName?: string | null
  excludedContextFactors?: string[]
  quality?: string
}): DurationOutputPromotionEvaluation {
  const directWriteEvaluation = evaluateDurationOutputWrite({
    outputCode: input.fromOutputCode,
    target: input.writeTarget,
  })
  const promotedWriteEvaluation = evaluateDurationOutputWrite({
    outputCode: input.toOutputCode,
    target: input.writeTarget,
  })
  return {
    fromOutputCode: input.fromOutputCode,
    toOutputCode: input.toOutputCode,
    policyCode: input.policyCode,
    writeTarget: input.writeTarget,
    promotedByService: input.promotedByService,
    sourceFieldName: input.sourceFieldName ?? null,
    targetFieldName: input.targetFieldName ?? getDurationOutputContract(input.toOutputCode)?.semanticFieldName ?? null,
    directWriteEvaluation,
    promotedWriteEvaluation,
    excludedContextFactors: [...(input.excludedContextFactors ?? [])],
    quality: input.quality,
  }
}

export function evaluateDurationOutputPromotion(input: {
  fromOutputCode: DurationOutputCode | string
  toOutputCode: DurationOutputCode
  writeTarget: DurationOutputWriteTarget
  policyCode: string
  promotedByService: string
  sourceFieldName?: string | null
  targetFieldName?: string | null
  excludedContextFactors?: string[]
  quality?: string
}): DurationOutputPromotionPolicyEvaluation {
  const promotion = buildDurationOutputPromotionEvaluation(input)
  const fromOutputCode = String(input.fromOutputCode ?? '').trim()
  const policyAllowsPromotion = DURATION_OUTPUT_PROMOTION_POLICY.some((policy) => (
    policy.fromOutputCode === fromOutputCode
    && policy.toOutputCode === input.toOutputCode
    && policy.writeTarget === input.writeTarget
    && policy.policyCode === input.policyCode
  ))
  if (!policyAllowsPromotion) {
    return {
      ...promotion,
      promotionAllowed: false,
      promotionFindingCode: 'duration_output_promotion_not_allowed',
      promotionMessage: `Duration output ${fromOutputCode || '<empty>'} cannot be promoted to ${input.toOutputCode} through ${input.policyCode}.`,
    }
  }
  if (!promotion.promotedWriteEvaluation.allowed) {
    return {
      ...promotion,
      promotionAllowed: false,
      promotionFindingCode: 'duration_output_promoted_write_target_not_allowed',
      promotionMessage: promotion.promotedWriteEvaluation.message,
    }
  }
  return {
    ...promotion,
    promotionAllowed: true,
  }
}

export function assertDurationOutputWriteAllowed(input: {
  outputCode: DurationOutputCode | string
  target: DurationOutputWriteTarget | string
}): DurationOutputWriteEvaluation {
  const evaluation = evaluateDurationOutputWrite(input)
  if (!evaluation.allowed) {
    throw new Error(evaluation.message ?? `Duration output ${evaluation.outputCode} cannot write to ${evaluation.target}.`)
  }
  return evaluation
}
