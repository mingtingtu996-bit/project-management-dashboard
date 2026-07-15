import { describe, expect, it } from 'vitest'

import {
  evaluateT2RhythmTemplateReplayAcceptance,
} from '../services/t2RhythmTemplateReplayAcceptanceService.js'

describe('t2RhythmTemplateReplayAcceptanceService', () => {
  it('keeps thin or inaccurate T2 actual replay evidence as data collection only', () => {
    const result = evaluateT2RhythmTemplateReplayAcceptance({
      templateId: 't2-residential-standard-floor-structure-rhythm-v1',
      sampleCount: 6,
      comparableWorkfaceWindowCount: 6,
      p80CaptureRate: 0.58,
      medianAbsoluteErrorDays: 4.8,
      gateSlipMedianDays: 3.2,
      dependencyViolationRate: 0.18,
      evidenceRefs: ['duration_experience_samples:t2-thin-001'],
    })

    expect(result.status).toBe('data_collection_open')
    expect(result.readyForShadow).toBe(false)
    expect(result.readyForPublish).toBe(false)
    expect(result.directSeedMutationAllowed).toBe(false)
    expect(result.writesPlanDates).toBe(false)
    expect(result.writesTaskDependencies).toBe(false)
    expect(result.blockingReasons).toEqual(expect.arrayContaining([
      'sample_gate_not_met',
      'p80_capture_below_threshold',
      'mae_above_threshold',
      'gate_slip_above_threshold',
      'dependency_violation_rate_above_threshold',
    ]))
  })

  it('promotes accurate T2 replay evidence only to governed shadow candidate', () => {
    const result = evaluateT2RhythmTemplateReplayAcceptance({
      templateId: 't2-residential-standard-floor-structure-rhythm-v1',
      sampleCount: 18,
      comparableWorkfaceWindowCount: 18,
      p80CaptureRate: 0.82,
      medianAbsoluteErrorDays: 1.6,
      gateSlipMedianDays: 0.8,
      dependencyViolationRate: 0.02,
      evidenceRefs: [
        'duration_experience_samples:t2-floor-001',
        'project_daily_snapshot:project-1:2026-05-10',
        'task_dependencies:standard-floor-chain',
      ],
    })

    expect(result.status).toBe('shadow_candidate')
    expect(result.readyForShadow).toBe(true)
    expect(result.readyForPublish).toBe(false)
    expect(result.directSeedMutationAllowed).toBe(false)
    expect(result.writesPlanDates).toBe(false)
    expect(result.writesTaskDependencies).toBe(false)
    expect(result.acceptanceMetrics).toEqual(expect.objectContaining({
      sampleCount: 18,
      comparableWorkfaceWindowCount: 18,
      p80CaptureRate: 0.82,
      medianAbsoluteErrorDays: 1.6,
    }))
    expect(result.governance).toEqual(expect.objectContaining({
      releasePath: 'replay_candidate_shadow_gate_publish_rollback',
      manualReviewRequiredBeforePublish: true,
      l5PublicationRequired: true,
    }))
  })
})
