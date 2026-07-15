import { describe, expect, it } from 'vitest'
import {
  buildAlgorithmFactContext,
  summarizeAlgorithmFactContext,
} from '../services/algorithmFactContextService.js'

describe('algorithmFactContextService', () => {
  it('keeps static project facts dominant for baseline and new task references', () => {
    const baseline = buildAlgorithmFactContext({
      phase: 'baseline_generation',
      projectGenerationFacts: {
        businessType: 'residential',
        buildingPatternCodes: ['high_rise_cast_in_place'],
      },
      runtimeExecutionFacts: {
        progressCompletionRatio: 0.42,
        blockedTaskCount: 3,
      },
    })
    const newTask = buildAlgorithmFactContext({
      phase: 'new_task_reference',
      projectGenerationFacts: {
        businessType: 'residential',
      },
      runtimeExecutionFacts: {
        progressCompletionRatio: 0.42,
      },
    })

    expect(baseline.primaryLayer).toBe('projectGenerationFacts')
    expect(baseline.weights.projectGenerationFacts).toBeGreaterThan(baseline.weights.runtimeExecutionFacts)
    expect(newTask.primaryLayer).toBe('projectGenerationFacts')
    expect(newTask.boundaryPolicy).toContain('project_generation_facts_bound_template_and_reference_duration_scale')
  })

  it('makes runtime facts dominant for monthly planning, context factors and remaining duration forecasts', () => {
    const runtimeFacts = {
      progressCompletionRatio: 0.36,
      blockedTaskCount: 2,
      forecastDelayDays: 18,
      scheduleState: 'delayed',
      evidenceCodes: ['runtime_delay'],
    }

    const monthly = buildAlgorithmFactContext({
      phase: 'monthly_plan',
      projectGenerationFacts: { businessType: 'hospital' },
      runtimeExecutionFacts: runtimeFacts,
    })
    const durationContext = buildAlgorithmFactContext({
      phase: 'duration_context',
      projectGenerationFacts: { businessType: 'hospital' },
      runtimeExecutionFacts: runtimeFacts,
    })
    const forecast = buildAlgorithmFactContext({
      phase: 'runtime_forecast',
      projectGenerationFacts: { businessType: 'hospital' },
      runtimeExecutionFacts: runtimeFacts,
    })

    expect(monthly.primaryLayer).toBe('runtimeExecutionFacts')
    expect(monthly.weights.runtimeExecutionFacts).toBeGreaterThan(monthly.weights.projectGenerationFacts)
    expect(durationContext.primaryLayer).toBe('runtimeExecutionFacts')
    expect(forecast.weights.runtimeExecutionFacts).toBeGreaterThanOrEqual(0.7)
    expect(summarizeAlgorithmFactContext(forecast)).toEqual(expect.objectContaining({
      phase: 'runtime_forecast',
      primaryLayer: 'runtimeExecutionFacts',
      runtimeFactsRole: 'primary',
      projectFactsRole: 'background',
    }))
  })

  it('keeps confidence-only runtime inference from becoming the primary fact layer', () => {
    const context = buildAlgorithmFactContext({
      phase: 'runtime_forecast',
      projectGenerationFacts: {
        businessType: 'general_civil',
        buildingPatternCodes: ['high_rise_core_and_floor_cycle'],
      },
      runtimeExecutionFacts: {
        resourcePressureScore: 7,
        evidenceCodes: ['runtime_inference_advisory_only'],
        runtimeInferenceSummary: {
          factType: 'inferred',
          sourcePolicy: 'existing_execution_state_only',
          confidence: 0.46,
          readinessStatus: 'advisory_only',
          impactBoundary: 'confidence_only',
          sourceWindowDays: 14,
          inferredSignalCodes: ['resource_pressure_controlled'],
        },
      },
    })

    expect(context.primaryLayer).toBe('projectGenerationFacts')
    expect(context.weights.projectGenerationFacts).toBeGreaterThan(context.weights.runtimeExecutionFacts)
    expect(context.runtimeFactInputStrength).toBe('advisory_runtime_inference')
    expect(context.boundaryPolicy).toEqual(expect.arrayContaining([
      'runtime_execution_inference_confidence_only_cannot_override_static_project_facts',
    ]))
  })
})
