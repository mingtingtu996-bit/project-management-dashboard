import type {
  T2RhythmStandardLibraryTrustGate,
} from './t2RhythmStandardLibraryTrustGateService.js'

export type T2RhythmStandardLibraryL5Evidence = {
  releaseExitApproved?: boolean
  releaseExitEvidenceRefs?: string[]
  canaryPlanApproved?: boolean
  canaryEvidenceRefs?: string[]
  canaryMinimumSampleCount?: number
  canaryDurationDays?: number
  canaryBlastRadius?: {
    maxProjectCount?: number
    maxCompanyCount?: number
    maxTemplateCount?: number
    scopeLocked?: boolean
  }
  canarySuccessCriteria?: {
    minimumP80CaptureRate?: number
    maximumMedianAbsoluteErrorDays?: number
    maximumGateSlipMedianDays?: number
    maximumDependencyViolationRate?: number
  }
  runtimeConsumerVerified?: boolean
  runtimeConsumerEvidenceRefs?: string[]
  impactMonitoringReady?: boolean
  impactMonitoringEvidenceRefs?: string[]
  impactMonitoringMetrics?: Array<{
    metricCode?: string
    comparator?: 'lte' | 'gte'
    threshold?: number
    windowDays?: number
  }>
  rollbackTargetReady?: boolean
  rollbackEvidenceRefs?: string[]
  rollbackDrill?: {
    executed?: boolean
    recoveryTimeMinutes?: number
    rollbackTargetVersion?: string
    evidenceRefs?: string[]
  }
}

export type T2RhythmStandardLibraryReleaseScope = {
  scopeType?: 'project' | 'company' | 'system' | null
  companyId?: string | null
  projectId?: string | null
}

export type T2RhythmStandardLibraryL5ReleasePackage = {
  packageType: 't2_standard_library_canary_handoff'
  releaseMode: 'canary_only'
  selectedTemplateIds: string[]
  scopeType: 'project' | 'company' | 'system'
  companyId: string | null
  projectId: string | null
  evidenceRefs: string[]
  rollbackTargetEvidenceRefs: string[]
  consumerVerificationEvidenceRefs: string[]
  impactMonitoringEvidenceRefs: string[]
  canaryPlan: {
    minimumSampleCount: number
    durationDays: number
    blastRadius: {
      maxProjectCount: number
      maxCompanyCount: number
      maxTemplateCount: number
      scopeLocked: boolean
    }
    successCriteria: {
      minimumP80CaptureRate: number
      maximumMedianAbsoluteErrorDays: number
      maximumGateSlipMedianDays: number
      maximumDependencyViolationRate: number
    }
  }
  impactMonitoringPlan: {
    metrics: Array<{
      metricCode: string
      comparator: 'lte' | 'gte'
      threshold: number
      windowDays: number
    }>
  }
  rollbackPlan: {
    drillExecuted: boolean
    recoveryTimeMinutes: number
    rollbackTargetVersion: string
    drillEvidenceRefs: string[]
  }
}

export type T2RhythmStandardLibraryL5ReleaseGate = {
  source: 't2_rhythm_standard_library_l5_release_gate'
  status: 'l5_canary_handoff_ready' | 'l5_release_blocked'
  canEnterCanary: boolean
  canPublishRuntimeExperience: false
  canMaterializeTaskDependencies: false
  canWritePlanDates: false
  canAutoPublishRuntimeExperience: false
  releaseBlockers: string[]
  releasePackage: T2RhythmStandardLibraryL5ReleasePackage | null
  mutationBoundary: {
    writesTaskDependencies: false
    writesPlanDates: false
    writesCriticalPathFacts: false
    writesSeed: false
    writesBaseline: false
    writesRuntimePublications: false
  }
}

export type T2RhythmStandardLibraryL5ReleaseGateInput = {
  trustGate: T2RhythmStandardLibraryTrustGate
  selectedTemplateIds: string[]
  releaseScope?: T2RhythmStandardLibraryReleaseScope | null
  l5Evidence?: T2RhythmStandardLibraryL5Evidence | null
}

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

function unique(values: string[]) {
  return Array.from(new Set(values.map(normalizeText).filter(Boolean)))
}

function refs(values: string[] | undefined) {
  return unique(values ?? [])
}

function hasRefs(values: string[] | undefined) {
  return refs(values).length > 0
}

function positiveNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}

function nonNegativeNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

function normalizeMetric(metric: NonNullable<T2RhythmStandardLibraryL5Evidence['impactMonitoringMetrics']>[number]) {
  const metricCode = normalizeText(metric.metricCode)
  const comparator = metric.comparator === 'lte' || metric.comparator === 'gte' ? metric.comparator : null
  const threshold = metric.threshold
  const windowDays = metric.windowDays
  if (!metricCode || !comparator || !positiveNumber(threshold) || !positiveNumber(windowDays)) return null
  return {
    metricCode,
    comparator,
    threshold,
    windowDays,
  }
}

function normalizeImpactMetrics(metrics: T2RhythmStandardLibraryL5Evidence['impactMonitoringMetrics']) {
  return (metrics ?? [])
    .map(normalizeMetric)
    .filter((metric): metric is NonNullable<ReturnType<typeof normalizeMetric>> => Boolean(metric))
}

function canarySuccessCriteriaReady(criteria: T2RhythmStandardLibraryL5Evidence['canarySuccessCriteria']) {
  return Boolean(
    criteria
    && positiveNumber(criteria.minimumP80CaptureRate)
    && criteria.minimumP80CaptureRate <= 1
    && positiveNumber(criteria.maximumMedianAbsoluteErrorDays)
    && positiveNumber(criteria.maximumGateSlipMedianDays)
    && nonNegativeNumber(criteria.maximumDependencyViolationRate)
    && criteria.maximumDependencyViolationRate <= 1,
  )
}

function canaryBlastRadiusReady(blastRadius: T2RhythmStandardLibraryL5Evidence['canaryBlastRadius']) {
  return Boolean(
    blastRadius
    && positiveNumber(blastRadius.maxProjectCount)
    && positiveNumber(blastRadius.maxCompanyCount)
    && positiveNumber(blastRadius.maxTemplateCount)
    && blastRadius.scopeLocked === true,
  )
}

function rollbackDrillReady(drill: T2RhythmStandardLibraryL5Evidence['rollbackDrill']) {
  return Boolean(
    drill
    && drill.executed === true
    && positiveNumber(drill.recoveryTimeMinutes)
    && normalizeText(drill.rollbackTargetVersion)
    && hasRefs(drill.evidenceRefs),
  )
}

function mutationBoundary(): T2RhythmStandardLibraryL5ReleaseGate['mutationBoundary'] {
  return {
    writesTaskDependencies: false,
    writesPlanDates: false,
    writesCriticalPathFacts: false,
    writesSeed: false,
    writesBaseline: false,
    writesRuntimePublications: false,
  }
}

function scopeType(scope: T2RhythmStandardLibraryReleaseScope | null | undefined) {
  const value = normalizeText(scope?.scopeType)
  return value === 'project' || value === 'company' || value === 'system' ? value : null
}

export function evaluateT2RhythmStandardLibraryL5ReleaseGate(
  input: T2RhythmStandardLibraryL5ReleaseGateInput,
): T2RhythmStandardLibraryL5ReleaseGate {
  const evidence = input.l5Evidence ?? {}
  const selectedTemplateIds = unique(input.selectedTemplateIds)
  const impactMetrics = normalizeImpactMetrics(evidence.impactMonitoringMetrics)
  const blockers: string[] = []

  if (!input.trustGate.canTrustForRealScheduleCalibration) {
    blockers.push('standard_library_shadow_replay_trust_gate_required')
  }
  if (selectedTemplateIds.length === 0) blockers.push('selected_t2_template_required')
  if (!evidence.releaseExitApproved || !hasRefs(evidence.releaseExitEvidenceRefs)) {
    blockers.push('release_exit_approval_required')
  }
  if (!evidence.canaryPlanApproved || !hasRefs(evidence.canaryEvidenceRefs)) {
    blockers.push('l5_canary_plan_required')
  }
  if (!positiveNumber(evidence.canaryMinimumSampleCount)) {
    blockers.push('canary_minimum_sample_size_required')
  }
  if (!positiveNumber(evidence.canaryDurationDays)) {
    blockers.push('canary_duration_required')
  }
  if (!canaryBlastRadiusReady(evidence.canaryBlastRadius)) {
    blockers.push('canary_blast_radius_limit_required')
  }
  if (!canarySuccessCriteriaReady(evidence.canarySuccessCriteria)) {
    blockers.push('canary_success_criteria_required')
  }
  if (!evidence.runtimeConsumerVerified || !hasRefs(evidence.runtimeConsumerEvidenceRefs)) {
    blockers.push('runtime_consumer_verification_required')
  }
  if (!evidence.impactMonitoringReady || !hasRefs(evidence.impactMonitoringEvidenceRefs)) {
    blockers.push('impact_monitoring_required')
  }
  if (impactMetrics.length === 0) {
    blockers.push('impact_monitoring_metric_thresholds_required')
  }
  if (!evidence.rollbackTargetReady || !hasRefs(evidence.rollbackEvidenceRefs)) {
    blockers.push('rollback_target_required')
  }
  if (!rollbackDrillReady(evidence.rollbackDrill)) {
    blockers.push('rollback_drill_required')
  }

  const resolvedScopeType = scopeType(input.releaseScope)
  if (blockers.length === 0 && !resolvedScopeType) blockers.push('release_scope_required')

  const releaseBlockers = unique(blockers)
  if (releaseBlockers.length > 0 || !resolvedScopeType) {
    return {
      source: 't2_rhythm_standard_library_l5_release_gate',
      status: 'l5_release_blocked',
      canEnterCanary: false,
      canPublishRuntimeExperience: false,
      canMaterializeTaskDependencies: false,
      canWritePlanDates: false,
      canAutoPublishRuntimeExperience: false,
      releaseBlockers,
      releasePackage: null,
      mutationBoundary: mutationBoundary(),
    }
  }

  return {
    source: 't2_rhythm_standard_library_l5_release_gate',
    status: 'l5_canary_handoff_ready',
    canEnterCanary: true,
    canPublishRuntimeExperience: false,
    canMaterializeTaskDependencies: false,
    canWritePlanDates: false,
    canAutoPublishRuntimeExperience: false,
    releaseBlockers: [
      'manual_promotion_after_canary_required',
      'domain_writer_runtime_publication_required',
    ],
    releasePackage: {
      packageType: 't2_standard_library_canary_handoff',
      releaseMode: 'canary_only',
      selectedTemplateIds,
      scopeType: resolvedScopeType,
      companyId: normalizeText(input.releaseScope?.companyId) || null,
      projectId: normalizeText(input.releaseScope?.projectId) || null,
      evidenceRefs: unique([
        ...refs(evidence.releaseExitEvidenceRefs),
        ...refs(evidence.canaryEvidenceRefs),
        ...refs(evidence.runtimeConsumerEvidenceRefs),
        ...refs(evidence.impactMonitoringEvidenceRefs),
        ...refs(evidence.rollbackEvidenceRefs),
        ...refs(evidence.rollbackDrill?.evidenceRefs),
      ]),
      rollbackTargetEvidenceRefs: refs(evidence.rollbackEvidenceRefs),
      consumerVerificationEvidenceRefs: refs(evidence.runtimeConsumerEvidenceRefs),
      impactMonitoringEvidenceRefs: refs(evidence.impactMonitoringEvidenceRefs),
      canaryPlan: {
        minimumSampleCount: evidence.canaryMinimumSampleCount ?? 0,
        durationDays: evidence.canaryDurationDays ?? 0,
        blastRadius: {
          maxProjectCount: evidence.canaryBlastRadius?.maxProjectCount ?? 0,
          maxCompanyCount: evidence.canaryBlastRadius?.maxCompanyCount ?? 0,
          maxTemplateCount: evidence.canaryBlastRadius?.maxTemplateCount ?? 0,
          scopeLocked: evidence.canaryBlastRadius?.scopeLocked === true,
        },
        successCriteria: {
          minimumP80CaptureRate: evidence.canarySuccessCriteria?.minimumP80CaptureRate ?? 0,
          maximumMedianAbsoluteErrorDays: evidence.canarySuccessCriteria?.maximumMedianAbsoluteErrorDays ?? 0,
          maximumGateSlipMedianDays: evidence.canarySuccessCriteria?.maximumGateSlipMedianDays ?? 0,
          maximumDependencyViolationRate: evidence.canarySuccessCriteria?.maximumDependencyViolationRate ?? 0,
        },
      },
      impactMonitoringPlan: {
        metrics: impactMetrics,
      },
      rollbackPlan: {
        drillExecuted: evidence.rollbackDrill?.executed === true,
        recoveryTimeMinutes: evidence.rollbackDrill?.recoveryTimeMinutes ?? 0,
        rollbackTargetVersion: normalizeText(evidence.rollbackDrill?.rollbackTargetVersion),
        drillEvidenceRefs: refs(evidence.rollbackDrill?.evidenceRefs),
      },
    },
    mutationBoundary: mutationBoundary(),
  }
}
