import {
  persistAlgorithmAssetSampleHealthReport,
  type AlgorithmAssetGovernanceQueryExec,
  type PersistAlgorithmAssetSampleHealthReportResult,
} from './algorithmAssetGovernancePersistenceService.js'
import type { AlgorithmAssetLearningTarget } from './algorithmAssetGovernanceProtocolService.js'
import { orderedInclusiveDurationDays } from '../utils/durationDays.js'

export type AlgorithmAssetSampleQualitySignal =
  | 'verified'
  | 'low_confidence_match'
  | 'progress_quality_degraded'
  | 'unusable'

export type AlgorithmAssetSampleInput = {
  sampleId: string
  companyId?: string | null
  projectId?: string | null
  workCode?: string | null
  status?: 'completed' | 'in_progress' | 'planned' | string
  actualStartDate?: string | null
  actualEndDate?: string | null
  plannedStartDate?: string | null
  firstProgressAt?: string | null
  completionEventAt?: string | null
  updatedAt?: string | null
  qualitySignal?: AlgorithmAssetSampleQualitySignal
  benchmarkEligible?: boolean
  metadata?: Record<string, unknown>
}

export type AlgorithmAssetSampleHealthStatus = 'accepted' | 'weak' | 'rejected'

export type AlgorithmAssetSampleHealthReason =
  | 'missing_scope'
  | 'missing_work_code'
  | 'actual_start_derived_from_first_progress'
  | 'actual_start_derived_from_planned_start'
  | 'actual_end_derived_from_completion_event'
  | 'actual_end_derived_from_updated_at'
  | 'missing_actual_start'
  | 'missing_actual_end'
  | 'date_anomaly'
  | 'low_confidence_match'
  | 'progress_quality_degraded'
  | 'quality_unusable'

export type AlgorithmAssetSampleCompletionHint =
  | 'fill_company_or_project_scope'
  | 'map_work_code'
  | 'fill_actual_start_date'
  | 'fill_actual_end_date'
  | 'check_actual_dates'
  | 'confirm_work_code_mapping'
  | 'review_sample_quality'

export type AlgorithmAssetSampleHealthEvent = {
  sampleId: string
  companyId?: string
  projectId?: string
  workCode: string
  status: AlgorithmAssetSampleHealthStatus
  reasons: AlgorithmAssetSampleHealthReason[]
  completionHints: AlgorithmAssetSampleCompletionHint[]
  derivedStartDate: string | null
  derivedEndDate: string | null
  derivedActualDurationDays: number | null
  benchmarkEligible: boolean
  candidateEvidenceEligible: boolean
  metadata?: Record<string, unknown>
}

export type AlgorithmAssetSampleHealthGroup = {
  groupKey: string
  companyId: string
  projectId: string
  workCode: string
  totalSampleCount: number
  acceptedSampleCount: number
  weakSampleCount: number
  rejectedSampleCount: number
  sampleAvailabilityRate: number
  weakSampleRate: number
  rejectionReasons: Partial<Record<AlgorithmAssetSampleHealthReason, number>>
  longTailFrozen: boolean
  coldStartCovered: boolean
  completionHints: AlgorithmAssetSampleCompletionHint[]
}

export type AlgorithmAssetSampleHealthReport = {
  events: AlgorithmAssetSampleHealthEvent[]
  groups: AlgorithmAssetSampleHealthGroup[]
  summary: {
    totalSampleCount: number
    acceptedSampleCount: number
    weakSampleCount: number
    rejectedSampleCount: number
    sampleAvailabilityRate: number
    weakSampleRate: number
    rejectionReasons: Partial<Record<AlgorithmAssetSampleHealthReason, number>>
    longTailFreezeCount: number
    coldStartCoveredGroupCount: number
  }
}

export type AlgorithmAssetSampleHealthReportInput = {
  samples: AlgorithmAssetSampleInput[]
  minAcceptedSamplesForColdStartCoverage?: number
}

export type BuildAndPersistAlgorithmAssetSampleHealthReportInput =
  AlgorithmAssetSampleHealthReportInput & {
    assetKey: string
    sourceModule: string
    learningTarget: AlgorithmAssetLearningTarget
    queryExec?: AlgorithmAssetGovernanceQueryExec
  }

export type BuildAndPersistAlgorithmAssetSampleHealthReportResult = {
  report: AlgorithmAssetSampleHealthReport
  persistence: PersistAlgorithmAssetSampleHealthReportResult
}

function normalizeId(value: string | null | undefined) {
  const trimmed = String(value ?? '').trim()
  return trimmed || undefined
}

function normalizeWorkCode(value: string | null | undefined) {
  return normalizeId(value) ?? 'unknown_work_code'
}

function daysBetween(startDate: string | null, endDate: string | null) {
  const days = orderedInclusiveDurationDays(startDate, endDate)
  return days === null ? null : Math.max(0, days - 1)
}

function pushUnique<T>(items: T[], item: T) {
  if (!items.includes(item)) items.push(item)
}

function deriveStartDate(
  input: AlgorithmAssetSampleInput,
  reasons: AlgorithmAssetSampleHealthReason[],
  completionHints: AlgorithmAssetSampleCompletionHint[],
) {
  const actualStartDate = normalizeId(input.actualStartDate)
  if (actualStartDate) return actualStartDate

  const firstProgressAt = normalizeId(input.firstProgressAt)
  if (firstProgressAt) {
    reasons.push('actual_start_derived_from_first_progress')
    completionHints.push('fill_actual_start_date')
    return firstProgressAt
  }

  const plannedStartDate = normalizeId(input.plannedStartDate)
  if (plannedStartDate) {
    reasons.push('actual_start_derived_from_planned_start')
    completionHints.push('fill_actual_start_date')
    return plannedStartDate
  }

  reasons.push('missing_actual_start')
  completionHints.push('fill_actual_start_date')
  return null
}

function deriveEndDate(
  input: AlgorithmAssetSampleInput,
  reasons: AlgorithmAssetSampleHealthReason[],
  completionHints: AlgorithmAssetSampleCompletionHint[],
) {
  const actualEndDate = normalizeId(input.actualEndDate)
  if (actualEndDate) return actualEndDate

  const completionEventAt = normalizeId(input.completionEventAt)
  if (completionEventAt && input.status === 'completed') {
    reasons.push('actual_end_derived_from_completion_event')
    completionHints.push('fill_actual_end_date')
    return completionEventAt
  }

  const updatedAt = normalizeId(input.updatedAt)
  if (updatedAt && input.status === 'completed') {
    reasons.push('actual_end_derived_from_updated_at')
    completionHints.push('fill_actual_end_date')
    return updatedAt
  }

  reasons.push('missing_actual_end')
  completionHints.push('fill_actual_end_date')
  return null
}

export function classifyAlgorithmAssetSampleHealth(input: AlgorithmAssetSampleInput): AlgorithmAssetSampleHealthEvent {
  const reasons: AlgorithmAssetSampleHealthReason[] = []
  const completionHints: AlgorithmAssetSampleCompletionHint[] = []
  const companyId = normalizeId(input.companyId)
  const projectId = normalizeId(input.projectId)
  const workCode = normalizeWorkCode(input.workCode)

  if (!companyId && !projectId) {
    reasons.push('missing_scope')
    completionHints.push('fill_company_or_project_scope')
  }
  if (workCode === 'unknown_work_code') {
    reasons.push('missing_work_code')
    completionHints.push('map_work_code')
  }

  const derivedStartDate = deriveStartDate(input, reasons, completionHints)
  const derivedEndDate = deriveEndDate(input, reasons, completionHints)
  const derivedActualDurationDays = daysBetween(derivedStartDate, derivedEndDate)
  if (derivedStartDate && derivedEndDate && derivedActualDurationDays === null) {
    reasons.push('date_anomaly')
    completionHints.push('check_actual_dates')
  }

  if (input.qualitySignal === 'low_confidence_match') {
    reasons.push('low_confidence_match')
    completionHints.push('confirm_work_code_mapping')
  }
  if (input.qualitySignal === 'progress_quality_degraded') {
    reasons.push('progress_quality_degraded')
    completionHints.push('review_sample_quality')
  }
  if (input.qualitySignal === 'unusable') {
    reasons.push('quality_unusable')
    completionHints.push('review_sample_quality')
  }

  const hardRejectReasons = new Set<AlgorithmAssetSampleHealthReason>([
    'missing_scope',
    'missing_work_code',
    'missing_actual_start',
    'missing_actual_end',
    'date_anomaly',
    'quality_unusable',
  ])
  const status: AlgorithmAssetSampleHealthStatus = reasons.some((reason) => hardRejectReasons.has(reason))
    ? 'rejected'
    : reasons.length > 0
      ? 'weak'
      : 'accepted'

  return {
    sampleId: input.sampleId,
    companyId,
    projectId,
    workCode,
    status,
    reasons,
    completionHints,
    derivedStartDate,
    derivedEndDate,
    derivedActualDurationDays: status === 'rejected' ? null : derivedActualDurationDays,
    benchmarkEligible: status === 'accepted' && input.benchmarkEligible !== false,
    candidateEvidenceEligible: status === 'accepted' || status === 'weak',
    metadata: input.metadata,
  }
}

function incrementReason(
  target: Partial<Record<AlgorithmAssetSampleHealthReason, number>>,
  reason: AlgorithmAssetSampleHealthReason,
) {
  target[reason] = (target[reason] ?? 0) + 1
}

function rate(numerator: number, denominator: number) {
  if (denominator === 0) return 0
  return numerator / denominator
}

function buildGroup(
  events: AlgorithmAssetSampleHealthEvent[],
  minAcceptedSamplesForColdStartCoverage: number,
): AlgorithmAssetSampleHealthGroup {
  const first = events[0]
  const rejectionReasons: Partial<Record<AlgorithmAssetSampleHealthReason, number>> = {}
  const completionHints: AlgorithmAssetSampleCompletionHint[] = []
  let acceptedSampleCount = 0
  let weakSampleCount = 0
  let rejectedSampleCount = 0

  for (const event of events) {
    if (event.status === 'accepted') acceptedSampleCount += 1
    if (event.status === 'weak') weakSampleCount += 1
    if (event.status === 'rejected') rejectedSampleCount += 1
    for (const reason of event.reasons) incrementReason(rejectionReasons, reason)
    for (const hint of event.completionHints) pushUnique(completionHints, hint)
  }

  return {
    groupKey: [first.companyId ?? 'unknown_company', first.projectId ?? 'unknown_project', first.workCode].join(':'),
    companyId: first.companyId ?? 'unknown_company',
    projectId: first.projectId ?? 'unknown_project',
    workCode: first.workCode,
    totalSampleCount: events.length,
    acceptedSampleCount,
    weakSampleCount,
    rejectedSampleCount,
    sampleAvailabilityRate: rate(acceptedSampleCount + weakSampleCount, events.length),
    weakSampleRate: rate(weakSampleCount, events.length),
    rejectionReasons,
    longTailFrozen: acceptedSampleCount < minAcceptedSamplesForColdStartCoverage,
    coldStartCovered: acceptedSampleCount >= minAcceptedSamplesForColdStartCoverage,
    completionHints,
  }
}

export function buildAlgorithmAssetSampleHealthReport(
  input: AlgorithmAssetSampleHealthReportInput,
): AlgorithmAssetSampleHealthReport {
  const minAcceptedSamplesForColdStartCoverage = input.minAcceptedSamplesForColdStartCoverage ?? 3
  const events = input.samples.map(classifyAlgorithmAssetSampleHealth)
  const grouped = new Map<string, AlgorithmAssetSampleHealthEvent[]>()
  const rejectionReasons: Partial<Record<AlgorithmAssetSampleHealthReason, number>> = {}
  let acceptedSampleCount = 0
  let weakSampleCount = 0
  let rejectedSampleCount = 0

  for (const event of events) {
    if (event.status === 'accepted') acceptedSampleCount += 1
    if (event.status === 'weak') weakSampleCount += 1
    if (event.status === 'rejected') rejectedSampleCount += 1
    for (const reason of event.reasons) incrementReason(rejectionReasons, reason)
    const groupKey = [event.companyId ?? 'unknown_company', event.projectId ?? 'unknown_project', event.workCode].join(':')
    grouped.set(groupKey, [...(grouped.get(groupKey) ?? []), event])
  }

  const groups = [...grouped.values()]
    .map((groupEvents) => buildGroup(groupEvents, minAcceptedSamplesForColdStartCoverage))
    .sort((a, b) => a.groupKey.localeCompare(b.groupKey))

  return {
    events,
    groups,
    summary: {
      totalSampleCount: events.length,
      acceptedSampleCount,
      weakSampleCount,
      rejectedSampleCount,
      sampleAvailabilityRate: rate(acceptedSampleCount + weakSampleCount, events.length),
      weakSampleRate: rate(weakSampleCount, events.length),
      rejectionReasons,
      longTailFreezeCount: groups.filter((group) => group.longTailFrozen).length,
      coldStartCoveredGroupCount: groups.filter((group) => group.coldStartCovered).length,
    },
  }
}

export async function buildAndPersistAlgorithmAssetSampleHealthReport(
  input: BuildAndPersistAlgorithmAssetSampleHealthReportInput,
): Promise<BuildAndPersistAlgorithmAssetSampleHealthReportResult> {
  const report = buildAlgorithmAssetSampleHealthReport(input)
  const persistence = await persistAlgorithmAssetSampleHealthReport({
    assetKey: input.assetKey,
    sourceModule: input.sourceModule,
    learningTarget: input.learningTarget,
    report,
    queryExec: input.queryExec,
  })

  return {
    report,
    persistence,
  }
}
