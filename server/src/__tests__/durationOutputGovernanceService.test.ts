import { describe, expect, it } from 'vitest'
import {
  evaluateDurationOutputPromotion,
  evaluateDurationOutputWrite,
  getDurationOutputContract,
  listDurationOutputContracts,
} from '../services/durationOutputGovernanceService.js'

describe('durationOutputGovernanceService', () => {
  it('publishes semantic contracts for every governed duration output', () => {
    const contracts = listDurationOutputContracts()
    const codes = contracts.map((contract) => contract.code)

    expect(codes).toEqual([
      'template_fast_estimate',
      'plan_reference',
      'contextual_reference',
      'remaining_forecast',
      'project_remaining_forecast',
      'phase_window',
      'acceleration_target',
    ])
    expect(getDurationOutputContract('template_fast_estimate')).toEqual(expect.objectContaining({
      semanticFieldName: 'templateFastEstimateDays',
      ownerService: 'wbsTemplateGenerationService',
      algorithmFactContextPhase: 'plan_creation',
      allowedWriteTargets: ['diagnostic_preview', 'template_generation_metadata'],
    }))
    expect(getDurationOutputContract('plan_reference')).toEqual(expect.objectContaining({
      semanticFieldName: 'planReferenceDays',
      algorithmFactContextPhase: 'plan_creation',
      allowedWriteTargets: expect.arrayContaining(['plan_task_duration']),
    }))
    expect(getDurationOutputContract('remaining_forecast')).toEqual(expect.objectContaining({
      semanticFieldName: 'remainingForecastDays',
      algorithmFactContextPhase: 'runtime_forecast',
      allowedWriteTargets: ['runtime_forecast_snapshot', 'runtime_forecast_api'],
    }))
    expect(getDurationOutputContract('project_remaining_forecast')).toEqual(expect.objectContaining({
      semanticFieldName: 'projectRemainingForecastDays',
      algorithmFactContextPhase: 'runtime_forecast',
      allowedWriteTargets: expect.arrayContaining(['runtime_forecast_api', 'schedule_acceleration_plan', 'monthly_plan_commitment']),
    }))
  })

  it('blocks fast estimates and remaining forecasts from writing into plan reference fields', () => {
    expect(evaluateDurationOutputWrite({
      outputCode: 'template_fast_estimate',
      target: 'plan_task_duration',
    })).toEqual(expect.objectContaining({
      allowed: false,
      findingCode: 'duration_output_write_target_not_allowed',
    }))

    expect(evaluateDurationOutputWrite({
      outputCode: 'remaining_forecast',
      target: 'plan_task_duration',
    })).toEqual(expect.objectContaining({
      allowed: false,
      findingCode: 'duration_output_write_target_not_allowed',
    }))

    expect(evaluateDurationOutputWrite({
      outputCode: 'plan_reference',
      target: 'plan_task_duration',
    })).toEqual(expect.objectContaining({
      allowed: true,
    }))
  })

  it('rejects fast estimates from being promoted into plan task duration', () => {
    const promotion = evaluateDurationOutputPromotion({
      fromOutputCode: 'template_fast_estimate',
      toOutputCode: 'plan_reference',
      writeTarget: 'plan_task_duration',
      policyCode: 'fast_template_promotion_denied_to_plan_reference',
      promotedByService: 'wbsTemplateGenerationService',
      sourceFieldName: 'templateFastEstimateDays',
      targetFieldName: 'planReferenceDays',
      excludedContextFactors: [
        'runtime_execution_facts',
        'db_backed_duration_context',
      ],
      quality: 'cold_start_reference',
    })

    expect(promotion.directWriteEvaluation).toEqual(expect.objectContaining({
      allowed: false,
      outputCode: 'template_fast_estimate',
      target: 'plan_task_duration',
      findingCode: 'duration_output_write_target_not_allowed',
    }))
    expect(promotion.promotedWriteEvaluation).toEqual(expect.objectContaining({
      allowed: true,
      outputCode: 'plan_reference',
      target: 'plan_task_duration',
    }))
    expect(promotion).toEqual(expect.objectContaining({
      promotionAllowed: false,
      promotionFindingCode: 'duration_output_promotion_not_allowed',
      fromOutputCode: 'template_fast_estimate',
      toOutputCode: 'plan_reference',
      policyCode: 'fast_template_promotion_denied_to_plan_reference',
      writeTarget: 'plan_task_duration',
      promotedByService: 'wbsTemplateGenerationService',
      sourceFieldName: 'templateFastEstimateDays',
      targetFieldName: 'planReferenceDays',
      quality: 'cold_start_reference',
    }))
  })

  it('rejects runtime remaining forecasts from being promoted back into original plan task duration', () => {
    const promotion = evaluateDurationOutputPromotion({
      fromOutputCode: 'remaining_forecast',
      toOutputCode: 'plan_reference',
      writeTarget: 'plan_task_duration',
      policyCode: 'duration_output_to_plan_reference',
      promotedByService: 'wbsTemplateGenerationService',
      sourceFieldName: 'remainingForecastDays',
      targetFieldName: 'planReferenceDays',
      quality: 'runtime_forecast_must_not_rewrite_plan',
    })

    expect(promotion).toEqual(expect.objectContaining({
      promotionAllowed: false,
      promotionFindingCode: 'duration_output_promotion_not_allowed',
      fromOutputCode: 'remaining_forecast',
      toOutputCode: 'plan_reference',
      directWriteEvaluation: expect.objectContaining({
        allowed: false,
        findingCode: 'duration_output_write_target_not_allowed',
      }),
      promotedWriteEvaluation: expect.objectContaining({
        allowed: true,
        outputCode: 'plan_reference',
      }),
    }))
  })
})
