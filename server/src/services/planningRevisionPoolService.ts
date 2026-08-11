import { v4 as uuidv4 } from 'uuid'

import { supabase } from './dbService.js'
import { getClient } from '../database.js'
import { writeLog } from './changeLogs.js'
import { insertRowReturning, insertRowsReturning } from './transactionInsertService.js'
import { planningStateMachine } from './planningStateMachine.js'
import type { Milestone, Task, TaskBaseline, TaskBaselineItem } from '../types/db.js'
import type {
  ObservationPoolReadResponse,
  ObservationPoolSubmitRequest,
  ObservationPoolSubmitResponse,
  RevisionPoolCandidate,
  RevisionSubmitResponse,
} from '../types/planning.js'
import {
  normalizeDateOnlyText,
  orderedInclusiveDurationDays,
  signedDurationDayDelta,
} from '../utils/durationDays.js'
import { buildDurationContextPolicyLearningIdempotencyUuid } from './durationContextPolicyLearningCheckpointService.js'
import {
  buildCalendarDayDurationMetric,
  businessDateKey,
  DEFAULT_DURATION_TIMEZONE,
  type DurationMetricDto,
} from './durationMetricService.js'

const TASK_BASELINE_ITEM_JSON_COLUMNS = [
  'scope_snapshot',
  'wbs_snapshot',
  'task_fact_snapshot',
  'status_snapshot',
  'seed_versions',
  'manual_override_fields',
  'generation_metadata',
] as const

export class PlanningRevisionPoolServiceError extends Error {
  code: 'NOT_FOUND' | 'VALIDATION_ERROR' | 'OBSERVATION_POOL_EMPTY' | 'INVALID_STATE'
  statusCode: number

  constructor(
    code: 'NOT_FOUND' | 'VALIDATION_ERROR' | 'OBSERVATION_POOL_EMPTY' | 'INVALID_STATE',
    message: string,
    statusCode = 400,
  ) {
    super(message)
    this.name = 'PlanningRevisionPoolServiceError'
    this.code = code
    this.statusCode = statusCode
  }
}

export interface BaselinePublishReadinessSnapshot {
  totalItems: number
  scheduledItems: number
  mappedItems: number
  scheduledRatio: number
  mappedRatio: number
  isReady: boolean
}

export type BaselineConfirmationGateBlockerCode =
  | 'milestone_order_reversed'
  | 'resource_peak_over_limit'
  | 'total_duration_compression_over_cap'
  | 'mutually_exclusive_process_overlap'

export interface BaselineConfirmationGateBlocker {
  code: BaselineConfirmationGateBlockerCode
  title: string
  detail: string
  severity: 'error'
  itemIds: string[]
}

export interface BaselineConfirmationGateSnapshot {
  isReady: boolean
  blockers: BaselineConfirmationGateBlocker[]
}

export interface ProjectBaselineValiditySnapshot {
  comparedTaskCount: number
  deviatedTaskCount: number
  deviatedTaskRatio: number
  shiftedMilestoneCount: number
  averageMilestoneShift: DurationMetricDto
  /** @deprecated Consume averageMilestoneShift; removed after one compatibility release. */
  averageMilestoneShiftDays: number | null
  totalDurationDeviationRatio: number
  triggeredRules: Array<'task_deviation_ratio' | 'milestone_shift' | 'duration_deviation'>
  state: 'valid' | 'needs_realign' | 'insufficient_data'
  isValid: boolean
}

const REVISION_POOL_SEVERITIES = ['low', 'medium', 'high', 'critical'] as const
const REVISION_POOL_SOURCE_TYPES = ['observation', 'deviation', 'manual'] as const

function isRevisionPoolSeverity(value: string): value is (typeof REVISION_POOL_SEVERITIES)[number] {
  return (REVISION_POOL_SEVERITIES as readonly string[]).includes(value)
}

function isRevisionPoolSourceType(value: string): value is (typeof REVISION_POOL_SOURCE_TYPES)[number] {
  return (REVISION_POOL_SOURCE_TYPES as readonly string[]).includes(value)
}

function nowIso() {
  return new Date().toISOString()
}

function round2(value: number) {
  return Math.round(value * 100) / 100
}

function normalizeDateOnly(value?: string | null) {
  return normalizeDateOnlyText(value)
}

function diffDaysAbs(left: string, right: string) {
  return Math.abs(signedDurationDayDelta(right, left) ?? 0)
}

function readRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function readText(value: unknown) {
  return String(value ?? '').trim()
}

function rangesOverlap(leftStart?: string | null, leftEnd?: string | null, rightStart?: string | null, rightEnd?: string | null) {
  const aStart = normalizeDateOnly(leftStart ?? null)
  const aEnd = normalizeDateOnly(leftEnd ?? leftStart ?? null)
  const bStart = normalizeDateOnly(rightStart ?? null)
  const bEnd = normalizeDateOnly(rightEnd ?? rightStart ?? null)
  if (!aStart || !aEnd || !bStart || !bEnd) return false
  return aStart <= bEnd && bStart <= aEnd
}

function collectDateSpan(values: Array<string | null>) {
  const normalized = values.filter((value): value is string => Boolean(value)).sort()
  if (normalized.length === 0) {
    return { startDate: null, endDate: null, durationDays: 0 }
  }

  const startDate = normalized[0] ?? null
  const endDate = normalized[normalized.length - 1] ?? null
  return {
    startDate,
    endDate,
    durationDays: orderedInclusiveDurationDays(startDate, endDate) ?? 0,
  }
}

function normalizeCandidate(row: any): RevisionPoolCandidate {
  const priority = row.priority ?? row.severity ?? 'medium'
  return {
    id: String(row.id ?? ''),
    project_id: String(row.project_id ?? ''),
    baseline_version_id: row.baseline_version_id ?? null,
    monthly_plan_version_id: row.monthly_plan_version_id ?? null,
    source_type: row.source_type ?? 'manual',
    source_id: row.source_id ?? null,
    title: String(row.title ?? ''),
    reason: String(row.reason ?? ''),
    severity: row.severity ?? 'medium',
    priority,
    observation_window_start: row.observation_window_start ?? null,
    observation_window_end: row.observation_window_end ?? null,
    affects_critical_milestone: row.affects_critical_milestone ?? null,
    consecutive_cross_month_count: row.consecutive_cross_month_count ?? null,
    deferred_reason: row.deferred_reason ?? null,
    review_due_at: row.review_due_at ?? null,
    reviewed_by: row.reviewed_by ?? null,
    status: row.status ?? 'open',
    submitted_at: row.submitted_at ?? null,
    reviewed_at: row.reviewed_at ?? null,
    created_at: row.created_at ?? null,
    updated_at: row.updated_at ?? null,
  }
}

function buildRevisionPoolSummary(items: RevisionPoolCandidate[]) {
  const sortedByUpdatedAt = [...items].sort((left, right) => {
    const leftStamp = new Date(left.updated_at ?? left.created_at ?? 0).getTime()
    const rightStamp = new Date(right.updated_at ?? right.created_at ?? 0).getTime()
    return rightStamp - leftStamp
  })

  return {
    high_priority_count: items.filter((item) => String(item.priority ?? item.severity ?? '').toLowerCase() === 'high' || String(item.priority ?? item.severity ?? '').toLowerCase() === 'critical').length,
    consecutive_cross_month_count: items.filter((item) => Number(item.consecutive_cross_month_count ?? 0) > 0).length,
    critical_milestone_count: items.filter((item) => Boolean(item.affects_critical_milestone)).length,
    last_reviewed_at:
      sortedByUpdatedAt[0]?.reviewed_at
      ?? sortedByUpdatedAt[0]?.updated_at
      ?? sortedByUpdatedAt[0]?.created_at
      ?? null,
  }
}

export function evaluateBaselinePublishReadiness(items: TaskBaselineItem[]): BaselinePublishReadinessSnapshot {
  const totalItems = items.length
  const scheduledItems = items.filter((item) => Boolean(item.planned_start_date || item.planned_end_date)).length
  const mappedItems = items.filter((item) => !['pending', 'missing'].includes(String(item.mapping_status ?? 'mapped'))).length
  const scheduledRatio = totalItems > 0 ? round2(scheduledItems / totalItems) : 0
  const mappedRatio = totalItems > 0 ? round2(mappedItems / totalItems) : 0

  return {
    totalItems,
    scheduledItems,
    mappedItems,
    scheduledRatio,
    mappedRatio,
    isReady: totalItems > 0 && scheduledRatio >= 0.8 && mappedRatio >= 0.7,
  }
}

function itemDateRange(item: Pick<TaskBaselineItem, 'planned_start_date' | 'planned_end_date'>) {
  return {
    start: normalizeDateOnly(item.planned_start_date ?? item.planned_end_date ?? null),
    end: normalizeDateOnly(item.planned_end_date ?? item.planned_start_date ?? null),
  }
}

function getItemMetadata(item: Partial<TaskBaselineItem>) {
  return readRecord(item.generation_metadata)
}

function readResourceClass(item: Partial<TaskBaselineItem>) {
  const metadata = getItemMetadata(item)
  return readText(metadata.resource_class ?? metadata.resourceClass)
}

function readScopeKey(item: Partial<TaskBaselineItem>) {
  const metadata = getItemMetadata(item)
  const scope = readRecord(metadata.scope_key ?? metadata.scope_keys)
  return [
    readText(scope.building ?? metadata.building_object_id),
    readText(scope.floor ?? metadata.floor_object_id),
    readText(scope.zone ?? metadata.physical_zone_object_id ?? metadata.functional_area_object_id),
    readText(scope.workface ?? metadata.engineering_object_id),
  ].filter(Boolean).join('|') || 'global'
}

function readScopeValue(item: Partial<TaskBaselineItem>, ...keys: string[]) {
  const metadata = getItemMetadata(item)
  const scope = readRecord(metadata.scope_keys ?? metadata.scope_key)
  for (const key of keys) {
    const value = readText(scope[key] ?? metadata[key])
    if (value) return value
  }
  return null
}

function readPositiveResourceLimit(...values: unknown[]) {
  for (const value of values) {
    const parsed = Number(value)
    if (Number.isFinite(parsed) && parsed > 0) return Math.floor(parsed)
  }
  return null
}

function readResourceLimitBuckets(item: Partial<TaskBaselineItem>) {
  const metadata = getItemMetadata(item)
  const limits = readRecord(metadata.resource_limits ?? metadata.resourceLimits)
  const buckets: Array<{ dimension: string; scopeValue: string; limit: number }> = []
  const addBucket = (dimension: string, scopeValue: string | null, ...rawLimits: unknown[]) => {
    const limit = readPositiveResourceLimit(...rawLimits)
    if (!scopeValue || !limit) return
    buckets.push({ dimension, scopeValue, limit })
  }

  addBucket('global', 'global', limits.parallelCapacity, limits.parallel_capacity)
  addBucket(
    'building',
    readScopeValue(item, 'building', 'building_object_id', 'buildingObjectId'),
    limits.sameBuildingDailyLimit,
    limits.same_building_daily_limit,
  )
  addBucket(
    'unit',
    readScopeValue(item, 'unit', 'participant_unit_id', 'participantUnitId', 'responsible_unit_id', 'responsibleUnitId'),
    limits.sameUnitDailyLimit,
    limits.same_unit_daily_limit,
  )
  addBucket(
    'floor',
    readScopeValue(item, 'floor', 'floor_object_id', 'floorObjectId'),
    limits.sameFloorDailyLimit,
    limits.same_floor_daily_limit,
  )
  addBucket(
    'zone',
    readScopeValue(item, 'zone', 'physical_zone_object_id', 'physicalZoneObjectId', 'functional_area_object_id', 'functionalAreaObjectId'),
    limits.sameZoneDailyLimit,
    limits.same_zone_daily_limit,
    limits.sameFunctionalAreaDailyLimit,
    limits.same_functional_area_daily_limit,
  )
  addBucket(
    'system',
    readScopeValue(item, 'system', 'system_object_id', 'systemObjectId', 'functional_area_object_id', 'functionalAreaObjectId'),
    limits.sameSystemDailyLimit,
    limits.same_system_daily_limit,
  )

  return buckets
}

function nextDateText(value: string) {
  const date = new Date(`${value}T00:00:00.000Z`)
  if (Number.isNaN(date.getTime())) return null
  date.setUTCDate(date.getUTCDate() + 1)
  return date.toISOString().slice(0, 10)
}

function dateTextsBetweenInclusive(start: string, end: string) {
  if (end < start) return []
  const dates: string[] = []
  let cursor: string | null = start
  for (let guard = 0; cursor && cursor <= end && guard < 3660; guard += 1) {
    dates.push(cursor)
    cursor = nextDateText(cursor)
  }
  return dates
}

function readProcessConstraint(item: Partial<TaskBaselineItem>) {
  const metadata = getItemMetadata(item)
  const constraint = readRecord(metadata.process_constraint ?? metadata.processConstraint)
  const stableCode = readText(constraint.stableCode ?? constraint.stable_code)
  if (!stableCode) return null
  return {
    stableCode,
    source: readText(constraint.source) || 'v1474ProcessConstraintSeed',
    overlapAllowed: constraint.overlapAllowed === true || constraint.overlap_allowed === true,
    scopeKey: readText(constraint.scope_key ?? constraint.scopeKey) || readScopeKey(item),
  }
}

export function evaluateBaselineConfirmationGate(params: {
  baselineItems: TaskBaselineItem[]
  sourceItems?: TaskBaselineItem[]
  maxCompressionRatio?: number
}): BaselineConfirmationGateSnapshot {
  const blockers: BaselineConfirmationGateBlocker[] = []
  const items = params.baselineItems ?? []

  const milestones = items
    .filter((item) => Boolean(item.is_milestone))
    .sort((left, right) => Number(left.sort_order ?? 0) - Number(right.sort_order ?? 0))
  for (let index = 1; index < milestones.length; index += 1) {
    const previous = milestones[index - 1]
    const current = milestones[index]
    const previousDate = itemDateRange(previous).end
    const currentDate = itemDateRange(current).end
    if (previousDate && currentDate && currentDate < previousDate) {
      blockers.push({
        code: 'milestone_order_reversed',
        title: 'Milestone order is reversed',
        detail: `Milestone "${current.title}" is dated ${currentDate}, earlier than previous milestone "${previous.title}" (${previousDate}).`,
        severity: 'error',
        itemIds: [String(previous.id), String(current.id)].filter(Boolean),
      })
      break
    }
  }

  const resourceBuckets = new Map<string, { limit: number, items: TaskBaselineItem[] }>()
  for (const item of items) {
    const resourceClass = readResourceClass(item)
    const limitBuckets = readResourceLimitBuckets(item)
    const range = itemDateRange(item)
    if (!resourceClass || limitBuckets.length === 0 || !range.start || !range.end) continue
    for (const dateText of dateTextsBetweenInclusive(range.start, range.end)) {
      for (const limitBucket of limitBuckets) {
        const key = `${resourceClass}:${limitBucket.dimension}:${limitBucket.scopeValue}:${dateText}`
        const bucket = resourceBuckets.get(key)
        if (bucket) {
          bucket.items.push(item)
          bucket.limit = Math.min(bucket.limit, limitBucket.limit)
        } else {
          resourceBuckets.set(key, { limit: limitBucket.limit, items: [item] })
        }
      }
    }
  }
  for (const [key, bucket] of resourceBuckets.entries()) {
    if (bucket.items.length <= bucket.limit) continue
    blockers.push({
      code: 'resource_peak_over_limit',
      title: 'Resource peak exceeds E3 RCPSP limit',
      detail: `${key} has ${bucket.items.length} concurrent baseline item(s), exceeding limit ${bucket.limit}.`,
      severity: 'error',
      itemIds: bucket.items.map((item) => String(item.id)).filter(Boolean),
    })
  }

  const sourceSpan = collectDateSpan((params.sourceItems ?? []).flatMap((item) => [
    normalizeDateOnly(item.planned_start_date ?? null),
    normalizeDateOnly(item.planned_end_date ?? null),
  ]))
  const nextSpan = collectDateSpan(items.flatMap((item) => [
    normalizeDateOnly(item.planned_start_date ?? null),
    normalizeDateOnly(item.planned_end_date ?? null),
  ]))
  const maxCompressionRatio = params.maxCompressionRatio ?? 0.2
  if (sourceSpan.durationDays > 0 && nextSpan.durationDays > 0 && nextSpan.durationDays < sourceSpan.durationDays) {
    const ratio = round2((sourceSpan.durationDays - nextSpan.durationDays) / sourceSpan.durationDays)
    if (ratio > maxCompressionRatio) {
      blockers.push({
        code: 'total_duration_compression_over_cap',
        title: 'Total duration compression exceeds cap',
        detail: `Baseline duration compressed by ${Math.round(ratio * 100)}%, above ${Math.round(maxCompressionRatio * 100)}% cap.`,
        severity: 'error',
        itemIds: items.map((item) => String(item.id)).filter(Boolean).slice(0, 20),
      })
    }
  }

  const constrained = items
    .map((item) => ({ item, constraint: readProcessConstraint(item) }))
    .filter((entry): entry is { item: TaskBaselineItem, constraint: NonNullable<ReturnType<typeof readProcessConstraint>> } => Boolean(entry.constraint))
  for (let i = 0; i < constrained.length; i += 1) {
    for (let j = i + 1; j < constrained.length; j += 1) {
      const left = constrained[i]
      const right = constrained[j]
      if (left.constraint.stableCode !== right.constraint.stableCode) continue
      if (left.constraint.scopeKey !== right.constraint.scopeKey) continue
      if (left.constraint.overlapAllowed || right.constraint.overlapAllowed) continue
      if (!rangesOverlap(left.item.planned_start_date, left.item.planned_end_date, right.item.planned_start_date, right.item.planned_end_date)) continue
      blockers.push({
        code: 'mutually_exclusive_process_overlap',
        title: 'Mutually exclusive process overlap',
        detail: `${left.constraint.source} rule ${left.constraint.stableCode} blocks overlap within ${left.constraint.scopeKey}.`,
        severity: 'error',
        itemIds: [String(left.item.id), String(right.item.id)].filter(Boolean),
      })
    }
  }

  return {
    isReady: blockers.length === 0,
    blockers,
  }
}

export function evaluateProjectBaselineValidity(params: {
  baselineItems: TaskBaselineItem[]
  tasks: Array<Pick<Task, 'id' | 'planned_start_date' | 'planned_end_date' | 'start_date' | 'end_date'>>
  milestones: Array<Pick<Milestone, 'id' | 'baseline_date' | 'current_plan_date'>>
  asOf?: string
  timezone?: string | null
}): ProjectBaselineValiditySnapshot {
  const tasksById = new Map(params.tasks.map((task) => [task.id, task]))
  const milestonesById = new Map(params.milestones.map((milestone) => [milestone.id, milestone]))

  const taskDeviations = params.baselineItems.flatMap((item) => {
    if (!item.source_task_id) return []
    const task = tasksById.get(item.source_task_id)
    const baselineDate = normalizeDateOnly(item.planned_end_date ?? item.planned_start_date ?? null)
    const currentDate = normalizeDateOnly(
      task?.planned_end_date ?? task?.end_date ?? task?.planned_start_date ?? task?.start_date ?? null
    )
    if (!baselineDate || !currentDate) return []

    return [{ itemId: item.id, deviationDays: diffDaysAbs(currentDate, baselineDate) }]
  })

  const milestoneComparisons = params.baselineItems.reduce<Array<{
    available: boolean
    shiftDays: number | null
  }>>((comparisons, item) => {
    if (!item.source_milestone_id) return comparisons
    const milestone = milestonesById.get(item.source_milestone_id)
    const baselineDate = normalizeDateOnly(milestone?.baseline_date ?? null)
    const currentPlanDate = normalizeDateOnly(milestone?.current_plan_date ?? null)
    comparisons.push(!baselineDate || !currentPlanDate
      ? { available: false, shiftDays: null }
      : { available: true, shiftDays: diffDaysAbs(currentPlanDate, baselineDate) })
    return comparisons
  }, [])
  const milestoneShifts = milestoneComparisons.flatMap((comparison) => (
    comparison.available && comparison.shiftDays !== null ? [comparison.shiftDays] : []
  ))

  const baselineSpan = collectDateSpan(
    params.baselineItems.flatMap((item) => [
      normalizeDateOnly(item.planned_start_date ?? null),
      normalizeDateOnly(item.planned_end_date ?? null),
    ])
  )
  const currentSpan = collectDateSpan(
    params.baselineItems.flatMap((item) => {
      if (!item.source_task_id) return []
      const task = tasksById.get(item.source_task_id)
      return [
        normalizeDateOnly(task?.planned_start_date ?? task?.start_date ?? null),
        normalizeDateOnly(task?.planned_end_date ?? task?.end_date ?? null),
      ]
    })
  )

  const deviatedTaskCount = taskDeviations.filter((item) => item.deviationDays >= 14).length
  const comparedTaskCount = taskDeviations.length
  const deviatedTaskRatio = comparedTaskCount > 0 ? round2(deviatedTaskCount / comparedTaskCount) : 0
  const shiftedMilestones = milestoneShifts.filter((days) => days > 0)
  const shiftedMilestoneCount = shiftedMilestones.length
  const hasCompleteMilestoneDateMetadata = milestoneComparisons.length > 0
    && milestoneComparisons.every((comparison) => comparison.available)
  const averageMilestoneShiftValue = !hasCompleteMilestoneDateMetadata
    ? null
    : shiftedMilestoneCount > 0
      ? round2(shiftedMilestones.reduce((sum, days) => sum + days, 0) / shiftedMilestoneCount)
      : 0
  const timezone = String(params.timezone ?? '').trim() || DEFAULT_DURATION_TIMEZONE
  const asOf = params.asOf === undefined ? businessDateKey(new Date(), timezone) : params.asOf
  const averageMilestoneShift = buildCalendarDayDurationMetric(averageMilestoneShiftValue, { asOf, timezone })
  const averageMilestoneShiftDays = averageMilestoneShift.availability === 'available'
    ? averageMilestoneShift.value
    : null
  const totalDurationDeviationRatio =
    baselineSpan.durationDays > 0 && currentSpan.durationDays > 0
      ? round2(Math.abs(currentSpan.durationDays - baselineSpan.durationDays) / baselineSpan.durationDays)
      : 0

  const triggeredRules: ProjectBaselineValiditySnapshot['triggeredRules'] = []
  if (deviatedTaskRatio >= 0.4) {
    triggeredRules.push('task_deviation_ratio')
  }
  if (
    shiftedMilestoneCount >= 3
    && averageMilestoneShift.availability === 'available'
    && (averageMilestoneShift.value ?? 0) >= 30
  ) {
    triggeredRules.push('milestone_shift')
  }
  if (totalDurationDeviationRatio >= 0.1) {
    triggeredRules.push('duration_deviation')
  }

  const hasComparableData =
    comparedTaskCount > 0
    || milestoneComparisons.some((comparison) => comparison.available)
    || (baselineSpan.durationDays > 0 && currentSpan.durationDays > 0)

  return {
    comparedTaskCount,
    deviatedTaskCount,
    deviatedTaskRatio,
    shiftedMilestoneCount,
    averageMilestoneShift,
    averageMilestoneShiftDays,
    totalDurationDeviationRatio,
    triggeredRules,
    state: !hasComparableData
      ? 'insufficient_data'
      : triggeredRules.length > 0
        ? 'needs_realign'
        : 'valid',
    isValid: triggeredRules.length === 0,
  }
}

export function buildProjectBaselineValidityDetails(validity: ProjectBaselineValiditySnapshot) {
  return {
    validity: {
      deviatedTaskRatio: validity.deviatedTaskRatio,
      shiftedMilestoneCount: validity.shiftedMilestoneCount,
      averageMilestoneShift: validity.averageMilestoneShift,
      averageMilestoneShiftDays: validity.averageMilestoneShiftDays,
      totalDurationDeviationRatio: validity.totalDurationDeviationRatio,
      triggeredRules: validity.triggeredRules,
    },
  }
}

export function buildProjectBaselineValidityMessage(validity: ProjectBaselineValiditySnapshot) {
  const ruleLabels: Record<string, string> = {
    task_deviation_ratio: 'task deviation ratio reached 40%',
    milestone_shift: 'at least 3 milestones shifted by an average of 30 calendar days',
    duration_deviation: 'total duration deviation reached 10%',
  }
  const triggeredSummary = validity.triggeredRules
    .map((rule) => ruleLabels[rule] ?? rule)
    .join(', ')
  const averageShiftSummary = validity.averageMilestoneShift.availability === 'available'
    ? `${Math.round(validity.averageMilestoneShift.value ?? 0)} calendar day(s)`
    : 'calendar-day metric unavailable'

  return `Baseline validity has crossed the realignment threshold: deviated task ratio ${Math.round(
    validity.deviatedTaskRatio * 100,
  )}%, shifted milestones ${validity.shiftedMilestoneCount}, average ${averageShiftSummary}, total duration deviation ${Math.round(
    validity.totalDurationDeviationRatio * 100,
  )}%. Triggered rules: ${triggeredSummary}. Please realign or revise before confirming.`
}

async function loadBaselineItems(client: any, baselineId: string, projectId: string): Promise<TaskBaselineItem[]> {
  const result = await client.query(
    `SELECT *
       FROM public.task_baseline_items
      WHERE baseline_version_id = $1
        AND project_id = $2
      ORDER BY sort_order ASC, id ASC
      FOR SHARE`,
    [baselineId, projectId],
  )
  return result.rows as TaskBaselineItem[]
}

function formatBusinessVersionLabel(baseline: TaskBaseline) {
  const version = Number(baseline.version)
  return Number.isFinite(version) && version > 0 ? `v${version}` : '无版本'
}

export async function listRevisionPoolCandidates(
  baselineId: string,
  projectId: string,
): Promise<ObservationPoolReadResponse> {
  const normalizedProjectId = readText(projectId)
  if (!normalizedProjectId) {
    throw new PlanningRevisionPoolServiceError('VALIDATION_ERROR', 'revision pool requires projectId', 400)
  }
  const query = supabase
    .from('revision_pool_candidates')
    .select('*')
    .eq('baseline_version_id', baselineId)
    .eq('project_id', normalizedProjectId)
    .order('created_at', { ascending: false })

  const { data, error } = await query
  if (error) throw error

  const items = (data ?? []).map(normalizeCandidate)
  return {
    items,
    total: items.length,
    summary: buildRevisionPoolSummary(items),
  }
}

export async function submitObservationPoolItems(params: {
  baseline: TaskBaseline
  payload: ObservationPoolSubmitRequest
  idempotencyKey?: string | null
}): Promise<ObservationPoolSubmitResponse> {
  if (!Array.isArray(params.payload.items) || params.payload.items.length === 0) {
    throw new PlanningRevisionPoolServiceError('VALIDATION_ERROR', '观测池条目不能为空', 400)
  }

  const projectId = readText(params.baseline.project_id)
  if (!projectId) {
    throw new PlanningRevisionPoolServiceError('VALIDATION_ERROR', 'revision pool requires projectId', 400)
  }

  const timestamp = nowIso()
  const idempotencyKey = readText(params.idempotencyKey)
  const rows = params.payload.items.map((item, index) => {
    const title = String(item.title ?? '').trim()
    const reason = String(item.reason ?? '').trim()
    const severity = String(item.severity ?? 'medium').trim().toLowerCase()
    const sourceType = String(item.source_type ?? 'manual').trim().toLowerCase()
    const priority = String(item.priority ?? severity).trim().toLowerCase()
    if (!title || !reason) {
      throw new PlanningRevisionPoolServiceError('VALIDATION_ERROR', `第 ${index + 1} 条观测池条目缺少标题或原因`, 400)
    }
    if (!isRevisionPoolSeverity(severity)) {
      throw new PlanningRevisionPoolServiceError(
        'VALIDATION_ERROR',
        `第 ${index + 1} 条观测池条目的 severity 非法，必须是 ${REVISION_POOL_SEVERITIES.join('/')}`,
        422,
      )
    }
    if (!isRevisionPoolSourceType(sourceType)) {
      throw new PlanningRevisionPoolServiceError(
        'VALIDATION_ERROR',
        `第 ${index + 1} 条观测池条目的 source_type 非法，必须是 ${REVISION_POOL_SOURCE_TYPES.join('/')}`,
        422,
      )
    }

    return {
      id: idempotencyKey
        ? buildDurationContextPolicyLearningIdempotencyUuid(
            idempotencyKey,
            'revision_pool_candidate',
            `${readText(item.source_id) || 'item'}:${index}`,
          )
        : uuidv4(),
      project_id: projectId,
      baseline_version_id: params.baseline.id,
      monthly_plan_version_id: null,
      source_type: sourceType,
      source_id: item.source_id ?? null,
      title,
      reason,
      severity,
      priority,
      observation_window_start: item.observation_window_start ?? null,
      observation_window_end: item.observation_window_end ?? null,
      affects_critical_milestone: Boolean(item.affects_critical_milestone ?? false),
      consecutive_cross_month_count: Number(item.consecutive_cross_month_count ?? 0),
      deferred_reason: item.deferred_reason ?? null,
      review_due_at: item.review_due_at ?? null,
      reviewed_by: item.reviewed_by ?? null,
      status: item.deferred_reason ? 'deferred' : 'open',
      submitted_at: null,
      reviewed_at: null,
      created_at: timestamp,
      updated_at: timestamp,
    }
  })

  const scopedRows = rows.map((row) => ({ ...row, project_id: projectId }))
  const mutation = idempotencyKey
    ? supabase.from('revision_pool_candidates').upsert(scopedRows, { onConflict: 'id', ignoreDuplicates: true })
    : supabase.from('revision_pool_candidates').insert(scopedRows)
  const { data, error } = await mutation.select('id')

  if (error) throw error

  return {
    submitted_count: rows.length,
    candidate_ids: (data ?? []).map((row: any) => String(row.id)),
  }
}

export async function startRevisionFromBaseline(params: {
  baseline: TaskBaseline
  actorUserId?: string | null
  reason: string
  sourceCandidateIds?: string[]
  idempotencyKey?: string | null
}): Promise<RevisionSubmitResponse> {
  const sourceBaseline = params.baseline
  const existingPool = await listRevisionPoolCandidates(sourceBaseline.id, sourceBaseline.project_id)
  const selectedCandidateIds = Array.from(
    new Set((params.sourceCandidateIds ?? []).map((candidateId) => String(candidateId ?? '').trim()).filter(Boolean)),
  )
  const chosenCandidates =
    selectedCandidateIds.length > 0
      ? existingPool.items.filter((item) => selectedCandidateIds.includes(item.id))
      : existingPool.items.filter((item) => item.status === 'open')

  if (selectedCandidateIds.length > 0 && chosenCandidates.length !== selectedCandidateIds.length) {
    throw new PlanningRevisionPoolServiceError('VALIDATION_ERROR', '系统建议不存在或不在当前池中', 422)
  }

  let nextStatus: TaskBaseline['status']
  try {
    nextStatus = planningStateMachine.transition(sourceBaseline.status, 'START_REVISION', {
      revision_ready: true,
    })
  } catch (error) {
    throw new PlanningRevisionPoolServiceError('INVALID_STATE', error instanceof Error ? error.message : '当前状态无法发起修订', 409)
  }

  const timestamp = nowIso()
  const idempotencyKey = readText(params.idempotencyKey)
  const revisionId = idempotencyKey
    ? buildDurationContextPolicyLearningIdempotencyUuid(
        idempotencyKey,
        'revision_draft',
        sourceBaseline.id,
      )
    : uuidv4()
  const baselineRow = {
      id: revisionId,
      project_id: sourceBaseline.project_id,
      version: null,
      status: nextStatus,
      title: `${sourceBaseline.title} 修订版`,
      description: params.reason,
      source_type: 'carryover',
      source_version_id: sourceBaseline.id,
      source_version_label: formatBusinessVersionLabel(sourceBaseline),
      effective_from: sourceBaseline.effective_from ?? null,
      effective_to: sourceBaseline.effective_to ?? null,
      confirmed_at: null,
      confirmed_by: null,
      created_at: timestamp,
      updated_at: timestamp,
  }
  const candidateIds = chosenCandidates.map((candidate) => candidate.id)
  const client = await getClient()
  let existingRevision: Record<string, unknown> | null = null
  let createdRevision = false
  try {
    await client.query('BEGIN')
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
      `task-baseline-revision:${sourceBaseline.project_id}:${revisionId}`,
    ])
    const sourceItems = await loadBaselineItems(client, sourceBaseline.id, sourceBaseline.project_id)
    const idMap = new Map(sourceItems.map((item) => [
      item.id,
      idempotencyKey
        ? buildDurationContextPolicyLearningIdempotencyUuid(idempotencyKey, 'revision_draft_item', item.id)
        : uuidv4(),
    ]))
    const clonedItems = sourceItems.map((item) => ({
      ...item,
      id: idMap.get(item.id)!,
      baseline_version_id: revisionId,
      parent_item_id: item.parent_item_id ? idMap.get(item.parent_item_id) ?? null : null,
      created_at: timestamp,
      updated_at: timestamp,
    }))
    const existingResult = await client.query(
      `SELECT *
         FROM public.task_baselines
        WHERE id = $1
          AND project_id = $2
        FOR UPDATE`,
      [revisionId, sourceBaseline.project_id],
    )
    existingRevision = existingResult.rows[0] as Record<string, unknown> | undefined ?? null

    if (existingRevision) {
      if (
        !idempotencyKey
        || readText(existingRevision.source_version_id) !== sourceBaseline.id
        || readText(existingRevision.status) !== 'revising'
      ) {
        throw new PlanningRevisionPoolServiceError('INVALID_STATE', 'Revision draft identity already exists', 409)
      }
      const existingItemCountResult = await client.query(
        `SELECT COUNT(*)::int AS item_count
           FROM public.task_baseline_items
          WHERE baseline_version_id = $1
            AND project_id = $2`,
        [revisionId, sourceBaseline.project_id],
      )
      const existingItemCount = Number(existingItemCountResult.rows[0]?.item_count ?? 0)
      if (existingItemCount !== sourceItems.length) {
        throw new PlanningRevisionPoolServiceError(
          'INVALID_STATE',
          'Revision draft item clone is incomplete',
          409,
        )
      }
    } else {
      await insertRowReturning(client, 'task_baselines', baselineRow)
      if (clonedItems.length > 0) {
        const insertedItems = await insertRowsReturning(client, 'task_baseline_items', clonedItems, {
          jsonColumns: TASK_BASELINE_ITEM_JSON_COLUMNS,
          maxRowsPerQuery: 10,
        })
        if (insertedItems.length !== clonedItems.length) {
          throw new PlanningRevisionPoolServiceError(
            'INVALID_STATE',
            'Revision draft item clone is incomplete',
            409,
          )
        }
      }
      createdRevision = true
    }

    if (candidateIds.length > 0 && createdRevision) {
      const candidateUpdate = await client.query(
        `UPDATE public.revision_pool_candidates
            SET status = 'submitted',
                submitted_at = $4,
                updated_at = $4
          WHERE project_id = $1
            AND baseline_version_id = $2
            AND id::text = ANY($3::text[])
            AND status = 'open'
        RETURNING id`,
        [sourceBaseline.project_id, sourceBaseline.id, candidateIds, timestamp],
      )
      if (candidateUpdate.rows.length !== candidateIds.length) {
        throw new PlanningRevisionPoolServiceError(
          'INVALID_STATE',
          'Revision pool changed before the revision draft was created',
          409,
        )
      }
    }

    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw error
  } finally {
    client.release()
  }

  if (createdRevision) {
    await writeLog({
      project_id: sourceBaseline.project_id,
      entity_type: 'baseline' as any,
      entity_id: revisionId,
      field_name: 'status',
      old_value: sourceBaseline.status,
      new_value: nextStatus,
      changed_by: params.actorUserId ?? null,
      change_source: params.actorUserId ? 'manual_adjusted' : 'system_auto',
    })
  }

  return {
    revision_id: revisionId,
    status: 'revising',
    source_version_id: sourceBaseline.id,
    created_at: readText(existingRevision?.created_at) || timestamp,
  }
}
