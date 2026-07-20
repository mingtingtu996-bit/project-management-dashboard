import type { BaselineDiffItem } from '@/components/planning/baseline'
import {
  normalizeDurationMetricDto,
  type DurationMetricDto,
} from '@/lib/durationMetric'

type JsonRecord = Record<string, unknown>

export type BaselineGenerationCandidateReason = {
  code: string
  label: string
  detail: string
  severity: 'info' | 'warning' | 'critical'
}

export type BaselineGenerationCandidate = {
  baselineId: string
  projectId: string
  sourceVersionLabel: string
  candidateVersionLabel: string
  recommended: boolean
  summary: string
  reasons: BaselineGenerationCandidateReason[]
  metrics: {
    baselineTaskCount: number
    candidateTaskCount: number
    affectedTaskCount: number
    affectedTaskRatio: number
    addedItemCount: number
    removedItemCount: number
    changedItemCount: number
    structureChangeRatio: number
    milestoneMaxShift: DurationMetricDto | null
    totalFinishShift: DurationMetricDto | null
  }
  diffCounts: Record<string, number>
  diffItems: BaselineDiffItem[]
}

export type BaselineValidityDetails = {
  deviatedTaskRatio: number
  shiftedMilestoneCount: number
  averageMilestoneShift: DurationMetricDto | null
  totalDurationDeviationRatio: number
  triggeredRules: string[]
}

function readRecord(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord
    : {}
}

function readText(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function readNumber(value: unknown, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function normalizeCalendarDayMetric(value: unknown) {
  const metric = normalizeDurationMetricDto(value)
  if (!metric || metric.unit !== 'calendar_day') return null
  if (metric.calendarRef !== 'gregorian' || metric.calendarVersion !== 'ISO-8601') return null
  return metric
}

function normalizeReasons(value: unknown): BaselineGenerationCandidateReason[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((entry) => {
    const reason = readRecord(entry)
    const severity = reason.severity
    if (severity !== 'info' && severity !== 'warning' && severity !== 'critical') return []
    return [{
      code: readText(reason.code),
      label: readText(reason.label),
      detail: readText(reason.detail),
      severity,
    }]
  })
}

function normalizeCounts(value: unknown) {
  const record = readRecord(value)
  return Object.fromEntries(
    Object.entries(record)
      .map(([key, count]) => [key, readNumber(count)]),
  )
}

export function normalizeBaselineGenerationCandidate(value: unknown): BaselineGenerationCandidate | null {
  const raw = readRecord(value)
  const metrics = readRecord(raw.metrics)
  const baselineId = readText(raw.baselineId)
  const projectId = readText(raw.projectId)
  if (!baselineId || !projectId) return null

  return {
    baselineId,
    projectId,
    sourceVersionLabel: readText(raw.sourceVersionLabel),
    candidateVersionLabel: readText(raw.candidateVersionLabel),
    recommended: raw.recommended === true,
    summary: readText(raw.summary),
    reasons: normalizeReasons(raw.reasons),
    metrics: {
      baselineTaskCount: readNumber(metrics.baselineTaskCount),
      candidateTaskCount: readNumber(metrics.candidateTaskCount),
      affectedTaskCount: readNumber(metrics.affectedTaskCount),
      affectedTaskRatio: readNumber(metrics.affectedTaskRatio),
      addedItemCount: readNumber(metrics.addedItemCount),
      removedItemCount: readNumber(metrics.removedItemCount),
      changedItemCount: readNumber(metrics.changedItemCount),
      structureChangeRatio: readNumber(metrics.structureChangeRatio),
      milestoneMaxShift: normalizeCalendarDayMetric(metrics.milestoneMaxShift),
      totalFinishShift: normalizeCalendarDayMetric(metrics.totalFinishShift),
    },
    diffCounts: normalizeCounts(raw.diffCounts),
    diffItems: Array.isArray(raw.diffItems) ? raw.diffItems as BaselineDiffItem[] : [],
  }
}

export function normalizeBaselineValidityDetails(value: unknown): BaselineValidityDetails | null {
  const raw = readRecord(value)
  if (Object.keys(raw).length === 0) return null
  return {
    deviatedTaskRatio: readNumber(raw.deviatedTaskRatio),
    shiftedMilestoneCount: readNumber(raw.shiftedMilestoneCount),
    averageMilestoneShift: normalizeCalendarDayMetric(raw.averageMilestoneShift),
    totalDurationDeviationRatio: readNumber(raw.totalDurationDeviationRatio),
    triggeredRules: Array.isArray(raw.triggeredRules)
      ? raw.triggeredRules.map(readText).filter(Boolean)
      : [],
  }
}
