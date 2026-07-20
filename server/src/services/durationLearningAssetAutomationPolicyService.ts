export type DurationLearningExperienceTier = 'T1' | 'T2' | 'T3'
export type DurationLearningReuseScope = 'project' | 'company' | 'industry' | 'global'
export type DurationLearningFactSource = 'actual_outcome' | 'behavioral_change' | 'replay' | 'hybrid'
export type DurationLearningAutomationTargetStage = 'canary' | 'stable'
export type DurationLearningAutomationQualityModel =
  | 'numeric_holdout'
  | 'numeric_replay'
  | 'structural_replay'

export type DurationLearningAutomationStage =
  | 'collecting'
  | 'auto_canary'
  | 'auto_stable'
  | 'exception_review'
  | 'blocked_retain_previous'

export interface DurationLearningAutomationThresholds {
  minValidChanges: number
  minDistinctTasks: number
  minDistinctProjects: number
  minDistinctCompanies: number
  minRealOutcomes: number
  minReplayCases: number
  minObservationDays: number
  maxConflictRate: number
  maxOvercompensationRate: number
}

export interface DurationLearningAutomationEvidence {
  uniqueChangeKeys?: readonly string[] | null
  validChangeCount?: number | null
  taskIds?: readonly string[] | null
  distinctTaskCount?: number | null
  projectIds?: readonly string[] | null
  distinctProjectCount?: number | null
  companyIds?: readonly string[] | null
  distinctCompanyCount?: number | null
  realOutcomeCount?: number | null
  replayCaseCount?: number | null
  observationWindowDays?: number | null
  holdoutSampleCount?: number | null
  maeBefore?: number | null
  maeAfter?: number | null
  conflictRate?: number | null
  overcompensationRate?: number | null
  replayPassRate?: number | null
  outcomeAcceptanceRate?: number | null
  qualityConsistencyRate?: number | null
  rollbackReady?: boolean | null
  tenantScopeValid?: boolean | null
  structuralMutation?: boolean | null
  recentRollback?: boolean | null
  exceptionalConflict?: boolean | null
}

export interface EvaluateDurationLearningAssetAutomationPolicyInput {
  experienceTier: DurationLearningExperienceTier
  reuseScope: DurationLearningReuseScope
  factSource: DurationLearningFactSource
  targetStage: DurationLearningAutomationTargetStage
  qualityModel?: DurationLearningAutomationQualityModel
  evidence: DurationLearningAutomationEvidence
  thresholdOverrides?: Partial<DurationLearningAutomationThresholds> | null
}

export interface DurationLearningAutomationObservedEvidence {
  validChangeCount: number
  distinctTaskCount: number
  distinctProjectCount: number
  distinctCompanyCount: number
  realOutcomeCount: number
  replayCaseCount: number
  observationWindowDays: number
  holdoutSampleCount: number
  maeBefore: number | null
  maeAfter: number | null
  conflictRate: number | null
  overcompensationRate: number | null
  replayPassRate: number | null
  outcomeAcceptanceRate: number | null
  qualityConsistencyRate: number | null
  rollbackReady: boolean | null
  tenantScopeValid: boolean | null
}

export interface DurationLearningAssetAutomationPolicyDecision {
  policyCode: 'duration_learning_asset_automation_policy_v1'
  experienceTier: DurationLearningExperienceTier
  reuseScope: DurationLearningReuseScope
  factSource: DurationLearningFactSource
  targetStage: DurationLearningAutomationTargetStage
  qualityModel: DurationLearningAutomationQualityModel
  stage: DurationLearningAutomationStage
  autoPromotionAllowed: boolean
  manualReviewRequired: boolean
  retainPreviousStable: boolean
  reasonCodes: string[]
  thresholds: DurationLearningAutomationThresholds
  observed: DurationLearningAutomationObservedEvidence
}

type DurationLearningAutomationHardFloors = Record<
  DurationLearningReuseScope,
  Record<DurationLearningAutomationTargetStage, DurationLearningAutomationThresholds>
>

const QUALITY_FLOORS = {
  maxConflictRate: 0.05,
  maxOvercompensationRate: 0.08,
} as const

const HARD_FLOORS: DurationLearningAutomationHardFloors = {
  project: {
    canary: {
      minValidChanges: 20,
      minDistinctTasks: 10,
      minDistinctProjects: 1,
      minDistinctCompanies: 1,
      minRealOutcomes: 10,
      minReplayCases: 20,
      minObservationDays: 14,
      ...QUALITY_FLOORS,
    },
    stable: {
      minValidChanges: 50,
      minDistinctTasks: 20,
      minDistinctProjects: 1,
      minDistinctCompanies: 1,
      minRealOutcomes: 25,
      minReplayCases: 50,
      minObservationDays: 30,
      ...QUALITY_FLOORS,
    },
  },
  company: {
    canary: {
      minValidChanges: 100,
      minDistinctTasks: 50,
      minDistinctProjects: 20,
      minDistinctCompanies: 1,
      minRealOutcomes: 50,
      minReplayCases: 100,
      minObservationDays: 30,
      ...QUALITY_FLOORS,
    },
    stable: {
      minValidChanges: 200,
      minDistinctTasks: 100,
      minDistinctProjects: 40,
      minDistinctCompanies: 1,
      minRealOutcomes: 100,
      minReplayCases: 200,
      minObservationDays: 60,
      ...QUALITY_FLOORS,
    },
  },
  industry: {
    canary: {
      minValidChanges: 300,
      minDistinctTasks: 150,
      minDistinctProjects: 75,
      minDistinctCompanies: 5,
      minRealOutcomes: 150,
      minReplayCases: 300,
      minObservationDays: 60,
      ...QUALITY_FLOORS,
    },
    stable: {
      minValidChanges: 600,
      minDistinctTasks: 300,
      minDistinctProjects: 150,
      minDistinctCompanies: 10,
      minRealOutcomes: 300,
      minReplayCases: 600,
      minObservationDays: 90,
      ...QUALITY_FLOORS,
    },
  },
  global: {
    canary: {
      minValidChanges: 500,
      minDistinctTasks: 250,
      minDistinctProjects: 100,
      minDistinctCompanies: 10,
      minRealOutcomes: 250,
      minReplayCases: 500,
      minObservationDays: 90,
      ...QUALITY_FLOORS,
    },
    stable: {
      minValidChanges: 1000,
      minDistinctTasks: 500,
      minDistinctProjects: 250,
      minDistinctCompanies: 20,
      minRealOutcomes: 500,
      minReplayCases: 1000,
      minObservationDays: 120,
      ...QUALITY_FLOORS,
    },
  },
}

function copyThresholds(value: DurationLearningAutomationThresholds): DurationLearningAutomationThresholds {
  return { ...value }
}

export function getDurationLearningAutomationHardFloors(): DurationLearningAutomationHardFloors {
  return {
    project: {
      canary: copyThresholds(HARD_FLOORS.project.canary),
      stable: copyThresholds(HARD_FLOORS.project.stable),
    },
    company: {
      canary: copyThresholds(HARD_FLOORS.company.canary),
      stable: copyThresholds(HARD_FLOORS.company.stable),
    },
    industry: {
      canary: copyThresholds(HARD_FLOORS.industry.canary),
      stable: copyThresholds(HARD_FLOORS.industry.stable),
    },
    global: {
      canary: copyThresholds(HARD_FLOORS.global.canary),
      stable: copyThresholds(HARD_FLOORS.global.stable),
    },
  }
}

function finiteNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function boundedRate(value: unknown): number | null {
  const parsed = finiteNumber(value)
  return parsed == null ? null : Math.max(0, Math.min(1, parsed))
}

function nonNegativeInteger(value: unknown): number {
  const parsed = finiteNumber(value)
  return parsed == null ? 0 : Math.max(0, Math.trunc(parsed))
}

function uniqueNonBlankCount(values: readonly string[] | null | undefined): number | null {
  if (!Array.isArray(values)) return null
  return new Set(values.map((value) => String(value ?? '').trim()).filter(Boolean)).size
}

function observedCount(values: readonly string[] | null | undefined, fallback: unknown): number {
  return uniqueNonBlankCount(values) ?? nonNegativeInteger(fallback)
}

function tightenThresholds(
  floor: DurationLearningAutomationThresholds,
  overrides?: Partial<DurationLearningAutomationThresholds> | null,
): DurationLearningAutomationThresholds {
  const minimumKeys: Array<keyof Omit<DurationLearningAutomationThresholds, 'maxConflictRate' | 'maxOvercompensationRate'>> = [
    'minValidChanges',
    'minDistinctTasks',
    'minDistinctProjects',
    'minDistinctCompanies',
    'minRealOutcomes',
    'minReplayCases',
    'minObservationDays',
  ]
  const result = copyThresholds(floor)
  for (const key of minimumKeys) {
    const override = finiteNumber(overrides?.[key])
    if (override != null) result[key] = Math.max(floor[key], Math.trunc(override))
  }

  const conflictOverride = finiteNumber(overrides?.maxConflictRate)
  if (conflictOverride != null) {
    result.maxConflictRate = Math.max(0, Math.min(floor.maxConflictRate, conflictOverride))
  }
  const overcompensationOverride = finiteNumber(overrides?.maxOvercompensationRate)
  if (overcompensationOverride != null) {
    result.maxOvercompensationRate = Math.max(0, Math.min(floor.maxOvercompensationRate, overcompensationOverride))
  }
  return result
}

function buildObserved(evidence: DurationLearningAutomationEvidence): DurationLearningAutomationObservedEvidence {
  return {
    validChangeCount: observedCount(evidence.uniqueChangeKeys, evidence.validChangeCount),
    distinctTaskCount: observedCount(evidence.taskIds, evidence.distinctTaskCount),
    distinctProjectCount: observedCount(evidence.projectIds, evidence.distinctProjectCount),
    distinctCompanyCount: observedCount(evidence.companyIds, evidence.distinctCompanyCount),
    realOutcomeCount: nonNegativeInteger(evidence.realOutcomeCount),
    replayCaseCount: nonNegativeInteger(evidence.replayCaseCount),
    observationWindowDays: nonNegativeInteger(evidence.observationWindowDays),
    holdoutSampleCount: nonNegativeInteger(evidence.holdoutSampleCount),
    maeBefore: finiteNumber(evidence.maeBefore),
    maeAfter: finiteNumber(evidence.maeAfter),
    conflictRate: boundedRate(evidence.conflictRate),
    overcompensationRate: boundedRate(evidence.overcompensationRate),
    replayPassRate: boundedRate(evidence.replayPassRate),
    outcomeAcceptanceRate: boundedRate(evidence.outcomeAcceptanceRate),
    qualityConsistencyRate: boundedRate(evidence.qualityConsistencyRate),
    rollbackReady: typeof evidence.rollbackReady === 'boolean' ? evidence.rollbackReady : null,
    tenantScopeValid: typeof evidence.tenantScopeValid === 'boolean' ? evidence.tenantScopeValid : null,
  }
}

function floorReason(metric: string, scope: DurationLearningReuseScope, stage: DurationLearningAutomationTargetStage) {
  return `${metric}_below_${scope}_${stage}_floor`
}

export function evaluateDurationLearningAssetAutomationPolicy(
  input: EvaluateDurationLearningAssetAutomationPolicyInput,
): DurationLearningAssetAutomationPolicyDecision {
  const qualityModel = input.qualityModel ?? 'numeric_holdout'
  const floor = HARD_FLOORS[input.reuseScope][input.targetStage]
  const thresholds = tightenThresholds(floor, input.thresholdOverrides)
  const observed = buildObserved(input.evidence)
  const evidenceReasons: string[] = []
  const qualityBlockReasons: string[] = []
  const exceptionReasons: string[] = []

  if (observed.validChangeCount < thresholds.minValidChanges) {
    evidenceReasons.push(floorReason('valid_change_count', input.reuseScope, input.targetStage))
  }
  if (observed.distinctTaskCount < thresholds.minDistinctTasks) {
    evidenceReasons.push(floorReason('distinct_task_count', input.reuseScope, input.targetStage))
  }
  if (observed.distinctProjectCount < thresholds.minDistinctProjects) {
    evidenceReasons.push(floorReason('distinct_project_count', input.reuseScope, input.targetStage))
  }
  if (observed.distinctCompanyCount < thresholds.minDistinctCompanies) {
    evidenceReasons.push(floorReason('distinct_company_count', input.reuseScope, input.targetStage))
  }
  const replayOnlyCanary = input.targetStage === 'canary'
    && (input.factSource === 'behavioral_change' || qualityModel === 'numeric_replay')
  if (!replayOnlyCanary && observed.realOutcomeCount < thresholds.minRealOutcomes) {
    evidenceReasons.push(floorReason('real_outcome_count', input.reuseScope, input.targetStage))
  }
  if (observed.replayCaseCount < thresholds.minReplayCases) {
    evidenceReasons.push(floorReason('replay_case_count', input.reuseScope, input.targetStage))
  }
  if (!replayOnlyCanary && observed.observationWindowDays < thresholds.minObservationDays) {
    evidenceReasons.push(floorReason('observation_window_days', input.reuseScope, input.targetStage))
  }

  if (input.targetStage === 'stable' && !['actual_outcome', 'hybrid'].includes(input.factSource)) {
    evidenceReasons.push('actual_outcome_required_for_stable')
  }
  const numericAccuracyRequired = qualityModel === 'numeric_holdout'
    || (qualityModel === 'numeric_replay' && input.targetStage === 'stable')
  if (numericAccuracyRequired) {
    const minimumHoldoutSamples = Math.max(3, Math.ceil(thresholds.minRealOutcomes * 0.2))
    if (input.qualityModel && observed.holdoutSampleCount < minimumHoldoutSamples) {
      evidenceReasons.push(floorReason('holdout_sample_count', input.reuseScope, input.targetStage))
    }
    if (observed.maeBefore == null || observed.maeAfter == null) {
      evidenceReasons.push('mae_evidence_required')
    } else if (observed.maeAfter > observed.maeBefore) {
      qualityBlockReasons.push('mae_regression_detected')
    } else if (observed.maeAfter === observed.maeBefore) {
      qualityBlockReasons.push('mae_strict_improvement_required')
    }
  } else {
    if (observed.replayPassRate == null) {
      evidenceReasons.push('replay_pass_rate_evidence_required')
    } else if (observed.replayPassRate < 0.95) {
      qualityBlockReasons.push('replay_pass_rate_below_limit')
    }
    if (observed.outcomeAcceptanceRate == null) {
      evidenceReasons.push('outcome_acceptance_rate_evidence_required')
    } else if (observed.outcomeAcceptanceRate < 0.95) {
      qualityBlockReasons.push('outcome_acceptance_rate_below_limit')
    }
    if (observed.qualityConsistencyRate == null) {
      evidenceReasons.push('quality_consistency_rate_evidence_required')
    } else if (observed.qualityConsistencyRate < 0.95) {
      qualityBlockReasons.push('quality_consistency_rate_below_limit')
    }
  }
  if (observed.conflictRate == null) {
    evidenceReasons.push('conflict_rate_evidence_required')
  } else if (observed.conflictRate > thresholds.maxConflictRate) {
    qualityBlockReasons.push('conflict_rate_exceeds_limit')
  }
  if (numericAccuracyRequired) {
    if (observed.overcompensationRate == null) {
      evidenceReasons.push('overcompensation_evidence_required')
    } else if (observed.overcompensationRate > thresholds.maxOvercompensationRate) {
      qualityBlockReasons.push('overcompensation_rate_exceeds_limit')
    }
  }
  if (observed.rollbackReady == null) {
    evidenceReasons.push('rollback_readiness_evidence_required')
  } else if (!observed.rollbackReady) {
    qualityBlockReasons.push('rollback_target_not_ready')
  }
  if (observed.tenantScopeValid == null) {
    evidenceReasons.push('tenant_scope_evidence_required')
  } else if (!observed.tenantScopeValid) {
    exceptionReasons.push('tenant_scope_requires_exception_review')
  }
  if (input.evidence.structuralMutation === true) {
    exceptionReasons.push('structural_mutation_requires_exception_review')
  }
  if (input.evidence.exceptionalConflict === true) {
    exceptionReasons.push('evidence_conflict_requires_exception_review')
  }
  if (input.evidence.recentRollback === true) {
    qualityBlockReasons.push('recent_rollback_blocks_automatic_promotion')
  }

  const reasonCodes = Array.from(new Set([
    ...exceptionReasons,
    ...qualityBlockReasons,
    ...evidenceReasons,
  ]))
  const stage: DurationLearningAutomationStage = exceptionReasons.length > 0
    ? 'exception_review'
    : qualityBlockReasons.length > 0
      ? 'blocked_retain_previous'
      : evidenceReasons.length > 0
        ? 'collecting'
        : input.targetStage === 'stable'
          ? 'auto_stable'
          : 'auto_canary'

  return {
    policyCode: 'duration_learning_asset_automation_policy_v1',
    experienceTier: input.experienceTier,
    reuseScope: input.reuseScope,
    factSource: input.factSource,
    targetStage: input.targetStage,
    qualityModel,
    stage,
    autoPromotionAllowed: stage === 'auto_canary' || stage === 'auto_stable',
    manualReviewRequired: stage === 'exception_review',
    retainPreviousStable: input.targetStage === 'stable' && stage !== 'auto_stable'
      ? true
      : stage === 'exception_review' || stage === 'blocked_retain_previous',
    reasonCodes,
    thresholds,
    observed,
  }
}
