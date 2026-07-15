import { describe, expect, it } from 'vitest'

import {
  capDurationRelativeToBaseline,
  evaluateDurationPlausibility,
  orderDurationBand,
} from '../services/durationEngineeringPlausibilityGuardrailService.js'

describe('durationEngineeringPlausibilityGuardrailService', () => {
  it('warns on concrete curing lower bounds without rewriting early-strength durations', () => {
    const result = evaluateDurationPlausibility({
      engineCode: 'duration_suggestion',
      durationDays: 5,
      title: 'Concrete curing and test block retention',
      standardWorkCode: 'concrete_curing_normal_minimum',
      standardWorkName: 'concrete curing',
      clamp: true,
    })

    expect(result.durationDays).toBe(5)
    expect(result.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        ruleId: 'duration.min.concrete_curing_normal',
        severity: 'warning',
        originalDays: 5,
        adjustedDays: 5,
      }),
    ]))
  })

  it('flags but does not clamp standard-floor rhythm outside the empirical band by default', () => {
    const result = evaluateDurationPlausibility({
      engineCode: 'critical_path_cpm',
      durationDays: 12,
      title: 'standard floor structure rhythm package',
      standardWorkCode: 'standard_floor_structure_rhythm',
    })

    expect(result.durationDays).toBe(12)
    expect(result.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        ruleId: 'duration.range.standard_floor_rhythm',
        severity: 'warning',
        minDays: 4,
        maxDays: 7,
      }),
    ]))
  })

  it('orders probabilistic duration bands and exposes ordering diagnostics', () => {
    const result = orderDurationBand({
      p20Days: 18,
      p50Days: 12,
      p80Days: 9,
      engineCode: 'project_remaining_forecast',
    })

    expect(result.band).toEqual({
      p20Days: 9,
      p50Days: 12,
      p80Days: 18,
    })
    expect(result.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        ruleId: 'duration.band.order',
        severity: 'warning',
      }),
    ]))
  })

  it('caps durations against a relative baseline and reports diagnostics', () => {
    const result = capDurationRelativeToBaseline({
      engineCode: 'task_remaining_forecast',
      durationDays: 365,
      baselineDays: 5,
      multiplier: 10,
      ruleId: 'duration.max.task_remaining_relative_to_plan',
      taskId: 'task-relative-cap',
    })

    expect(result.durationDays).toBe(50)
    expect(result.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        ruleId: 'duration.max.task_remaining_relative_to_plan',
        severity: 'clamped',
        originalDays: 365,
        adjustedDays: 50,
        maxDays: 50,
        metadata: expect.objectContaining({
          baselineDays: 5,
          multiplier: 10,
        }),
      }),
    ]))
  })
})
