import { describe, expect, it } from 'vitest'

import {
  evaluateDurationLearningAssetAutomationPolicy,
  getDurationLearningAutomationHardFloors,
} from '../services/durationLearningAssetAutomationPolicyService.js'

function projectEvidence(overrides: Record<string, unknown> = {}) {
  return {
    uniqueChangeKeys: Array.from({ length: 50 }, (_, index) => `change-${index + 1}`),
    taskIds: Array.from({ length: 20 }, (_, index) => `task-${index + 1}`),
    projectIds: ['project-a'],
    companyIds: ['company-a'],
    realOutcomeCount: 25,
    replayCaseCount: 50,
    observationWindowDays: 30,
    maeBefore: 0.18,
    maeAfter: 0.11,
    conflictRate: 0.02,
    overcompensationRate: 0.03,
    rollbackReady: true,
    tenantScopeValid: true,
    ...overrides,
  }
}

describe('durationLearningAssetAutomationPolicyService', () => {
  it('uses strict immutable hard floors for each reuse scope and stage', () => {
    const floors = getDurationLearningAutomationHardFloors()

    expect(floors.project.canary).toEqual(expect.objectContaining({
      minValidChanges: 20,
      minDistinctTasks: 10,
      minDistinctProjects: 1,
      minDistinctCompanies: 1,
      minRealOutcomes: 10,
      minReplayCases: 20,
      minObservationDays: 14,
    }))
    expect(floors.project.stable).toEqual(expect.objectContaining({
      minValidChanges: 50,
      minRealOutcomes: 25,
      minObservationDays: 30,
    }))
    expect(floors.company.stable.minDistinctProjects).toBe(40)
    expect(floors.industry.stable.minDistinctCompanies).toBe(10)
    expect(floors.global.stable).toEqual(expect.objectContaining({
      minValidChanges: 1000,
      minDistinctProjects: 250,
      minDistinctCompanies: 20,
      minRealOutcomes: 500,
      minReplayCases: 1000,
      minObservationDays: 120,
    }))

    floors.project.canary.minValidChanges = 1
    expect(getDurationLearningAutomationHardFloors().project.canary.minValidChanges).toBe(20)
  })

  it('automatically promotes a project asset to stable only after strict improvement and rollback readiness', () => {
    const result = evaluateDurationLearningAssetAutomationPolicy({
      experienceTier: 'T3',
      reuseScope: 'project',
      factSource: 'hybrid',
      targetStage: 'stable',
      evidence: projectEvidence(),
    })

    expect(result).toEqual(expect.objectContaining({
      stage: 'auto_stable',
      autoPromotionAllowed: true,
      manualReviewRequired: false,
      reasonCodes: [],
    }))
  })

  it('deduplicates repeated edits, tasks, projects, and companies before comparing consensus floors', () => {
    const result = evaluateDurationLearningAssetAutomationPolicy({
      experienceTier: 'T3',
      reuseScope: 'project',
      factSource: 'hybrid',
      targetStage: 'canary',
      evidence: projectEvidence({
        uniqueChangeKeys: Array.from({ length: 200 }, () => 'same-bulk-edit'),
        taskIds: Array.from({ length: 30 }, () => 'same-task'),
        projectIds: ['project-a', 'project-a'],
        companyIds: ['company-a', 'company-a'],
      }),
    })

    expect(result.stage).toBe('collecting')
    expect(result.observed).toEqual(expect.objectContaining({
      validChangeCount: 1,
      distinctTaskCount: 1,
      distinctProjectCount: 1,
      distinctCompanyCount: 1,
    }))
    expect(result.reasonCodes).toEqual(expect.arrayContaining([
      'valid_change_count_below_project_canary_floor',
      'distinct_task_count_below_project_canary_floor',
    ]))
    expect(result.manualReviewRequired).toBe(false)
  })

  it('keeps pure behavioral evidence out of stable while allowing a bounded canary', () => {
    const stable = evaluateDurationLearningAssetAutomationPolicy({
      experienceTier: 'T3',
      reuseScope: 'project',
      factSource: 'behavioral_change',
      targetStage: 'stable',
      evidence: projectEvidence({ realOutcomeCount: 0 }),
    })
    const canary = evaluateDurationLearningAssetAutomationPolicy({
      experienceTier: 'T3',
      reuseScope: 'project',
      factSource: 'behavioral_change',
      targetStage: 'canary',
      evidence: projectEvidence({
        uniqueChangeKeys: Array.from({ length: 20 }, (_, index) => `change-${index + 1}`),
        taskIds: Array.from({ length: 10 }, (_, index) => `task-${index + 1}`),
        realOutcomeCount: 0,
        replayCaseCount: 20,
        observationWindowDays: 14,
      }),
    })

    expect(stable).toEqual(expect.objectContaining({
      stage: 'collecting',
      autoPromotionAllowed: false,
      manualReviewRequired: false,
      reasonCodes: expect.arrayContaining(['actual_outcome_required_for_stable']),
    }))
    expect(canary).toEqual(expect.objectContaining({
      stage: 'auto_canary',
      autoPromotionAllowed: true,
      manualReviewRequired: false,
    }))
  })

  it('requires strict MAE improvement and retains the previous stable asset on regression', () => {
    const equal = evaluateDurationLearningAssetAutomationPolicy({
      experienceTier: 'T3',
      reuseScope: 'project',
      factSource: 'actual_outcome',
      targetStage: 'stable',
      evidence: projectEvidence({ maeBefore: 0.11, maeAfter: 0.11 }),
    })
    const regressed = evaluateDurationLearningAssetAutomationPolicy({
      experienceTier: 'T3',
      reuseScope: 'project',
      factSource: 'actual_outcome',
      targetStage: 'stable',
      evidence: projectEvidence({ maeBefore: 0.11, maeAfter: 0.14 }),
    })

    expect(equal.stage).toBe('blocked_retain_previous')
    expect(equal.reasonCodes).toContain('mae_strict_improvement_required')
    expect(regressed.stage).toBe('blocked_retain_previous')
    expect(regressed.reasonCodes).toContain('mae_regression_detected')
  })

  it('sends only exceptional conditions to human review', () => {
    const structural = evaluateDurationLearningAssetAutomationPolicy({
      experienceTier: 'T2',
      reuseScope: 'company',
      factSource: 'hybrid',
      targetStage: 'canary',
      evidence: projectEvidence({ structuralMutation: true }),
    })
    const ambiguousTenant = evaluateDurationLearningAssetAutomationPolicy({
      experienceTier: 'T3',
      reuseScope: 'project',
      factSource: 'hybrid',
      targetStage: 'canary',
      evidence: projectEvidence({ tenantScopeValid: false }),
    })

    expect(structural).toEqual(expect.objectContaining({
      stage: 'exception_review',
      manualReviewRequired: true,
      reasonCodes: expect.arrayContaining(['structural_mutation_requires_exception_review']),
    }))
    expect(ambiguousTenant).toEqual(expect.objectContaining({
      stage: 'exception_review',
      manualReviewRequired: true,
      reasonCodes: expect.arrayContaining(['tenant_scope_requires_exception_review']),
    }))
  })

  it('allows configuration to tighten but never weaken a hard floor', () => {
    const weakened = evaluateDurationLearningAssetAutomationPolicy({
      experienceTier: 'T3',
      reuseScope: 'company',
      factSource: 'hybrid',
      targetStage: 'stable',
      thresholdOverrides: {
        minValidChanges: 1,
        minDistinctProjects: 1,
        minObservationDays: 1,
      },
      evidence: projectEvidence(),
    })
    const tightened = evaluateDurationLearningAssetAutomationPolicy({
      experienceTier: 'T3',
      reuseScope: 'project',
      factSource: 'hybrid',
      targetStage: 'stable',
      thresholdOverrides: { minValidChanges: 75 },
      evidence: projectEvidence(),
    })

    expect(weakened.thresholds).toEqual(expect.objectContaining({
      minValidChanges: 200,
      minDistinctProjects: 40,
      minObservationDays: 60,
    }))
    expect(weakened.stage).toBe('collecting')
    expect(tightened.thresholds.minValidChanges).toBe(75)
    expect(tightened.reasonCodes).toContain('valid_change_count_below_project_stable_floor')
  })
})
