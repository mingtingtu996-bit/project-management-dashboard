import { v4 as uuidv4 } from 'uuid'

import { supabase } from './dbService.js'
import { writeLog } from './changeLogs.js'
import { planningStateMachine } from './planningStateMachine.js'
import type { Milestone, Task, TaskBaseline, TaskBaselineItem } from '../types/db.js'
import type {
  ObservationPoolReadResponse,
  ObservationPoolSubmitRequest,
  ObservationPoolSubmitResponse,
  RevisionPoolCandidate,
  RevisionSubmitResponse,
} from '../types/planning.js'

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

export interface ProjectBaselineValiditySnapshot {
  comparedTaskCount: number
  deviatedTaskCount: number
  deviatedTaskRatio: number
  shiftedMilestoneCount: number
  averageMilestoneShiftDays: number
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
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date.toISOString().slice(0, 10)
}

function diffDaysAbs(left: string, right: string) {
  const leftTime = new Date(`${left}T00:00:00.000Z`).getTime()
  const rightTime = new Date(`${right}T00:00:00.000Z`).getTime()
  return Math.abs(Math.round((leftTime - rightTime) / 86_400_000))
}

function computeDurationDays(startDate: string | null, endDate: string | null) {
  if (!startDate || !endDate) return 0
  const start = new Date(`${startDate}T00:00:00.000Z`).getTime()
  const end = new Date(`${endDate}T00:00:00.000Z`).getTime()
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return 0
  return Math.max(1, Math.round((end - start) / 86_400_000) + 1)
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
    durationDays: computeDurationDays(startDate, endDate),
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

export function evaluateProjectBaselineValidity(params: {
  baselineItems: TaskBaselineItem[]
  tasks: Array<Pick<Task, 'id' | 'planned_start_date' | 'planned_end_date' | 'start_date' | 'end_date'>>
  milestones: Array<Pick<Milestone, 'id' | 'baseline_date' | 'current_plan_date'>>
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

  const milestoneShifts = params.baselineItems.flatMap((item) => {
    if (!item.source_milestone_id) return []
    const milestone = milestonesById.get(item.source_milestone_id)
    const baselineDate = normalizeDateOnly(milestone?.baseline_date ?? null)
    const currentPlanDate = normalizeDateOnly(milestone?.current_plan_date ?? null)
    if (!baselineDate || !currentPlanDate) return []
    return [diffDaysAbs(currentPlanDate, baselineDate)]
  })

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
  const averageMilestoneShiftDays =
    shiftedMilestoneCount > 0
      ? round2(shiftedMilestones.reduce((sum, days) => sum + days, 0) / shiftedMilestoneCount)
      : 0
  const totalDurationDeviationRatio =
    baselineSpan.durationDays > 0 && currentSpan.durationDays > 0
      ? round2(Math.abs(currentSpan.durationDays - baselineSpan.durationDays) / baselineSpan.durationDays)
      : 0

  const triggeredRules: ProjectBaselineValiditySnapshot['triggeredRules'] = []
  if (deviatedTaskRatio >= 0.4) {
    triggeredRules.push('task_deviation_ratio')
  }
  if (shiftedMilestoneCount >= 3 && averageMilestoneShiftDays >= 30) {
    triggeredRules.push('milestone_shift')
  }
  if (totalDurationDeviationRatio >= 0.1) {
    triggeredRules.push('duration_deviation')
  }

  const hasComparableData =
    comparedTaskCount > 0 || shiftedMilestoneCount > 0 || (baselineSpan.durationDays > 0 && currentSpan.durationDays > 0)

  return {
    comparedTaskCount,
    deviatedTaskCount,
    deviatedTaskRatio,
    shiftedMilestoneCount,
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

async function getLatestBaselineVersion(projectId: string) {
  const { data, error } = await supabase
    .from('task_baselines')
    .select('version')
    .eq('project_id', projectId)
    .order('version', { ascending: false })
    .limit(1)

  if (error) throw error
  return Number((data?.[0] as any)?.version ?? 0)
}

async function loadBaselineItems(baselineId: string): Promise<TaskBaselineItem[]> {
  const { data, error } = await supabase
    .from('task_baseline_items')
    .select('*')
    .eq('baseline_version_id', baselineId)
    .order('sort_order', { ascending: true })

  if (error) throw error
  return (data ?? []) as TaskBaselineItem[]
}

export async function listRevisionPoolCandidates(baselineId: string): Promise<ObservationPoolReadResponse> {
  const { data, error } = await supabase
    .from('revision_pool_candidates')
    .select('*')
    .eq('baseline_version_id', baselineId)
    .order('created_at', { ascending: false })

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
}): Promise<ObservationPoolSubmitResponse> {
  if (!Array.isArray(params.payload.items) || params.payload.items.length === 0) {
    throw new PlanningRevisionPoolServiceError('VALIDATION_ERROR', '观测池条目不能为空', 400)
  }

  const timestamp = nowIso()
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
      id: uuidv4(),
      project_id: params.baseline.project_id,
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

  const { data, error } = await supabase
    .from('revision_pool_candidates')
    .insert(rows)
    .select('id')

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
}): Promise<RevisionSubmitResponse> {
  const sourceBaseline = params.baseline
  const existingPool = await listRevisionPoolCandidates(sourceBaseline.id)
  const selectedCandidateIds = Array.from(
    new Set((params.sourceCandidateIds ?? []).map((candidateId) => String(candidateId ?? '').trim()).filter(Boolean)),
  )
  const chosenCandidates =
    selectedCandidateIds.length > 0
      ? existingPool.items.filter((item) => selectedCandidateIds.includes(item.id))
      : existingPool.items.filter((item) => item.status === 'open')

  if (chosenCandidates.length === 0) {
    throw new PlanningRevisionPoolServiceError('OBSERVATION_POOL_EMPTY', '观测池为空，无法发起修订', 409)
  }

  let nextStatus: TaskBaseline['status']
  try {
    nextStatus = planningStateMachine.transition(sourceBaseline.status, 'START_REVISION', {
      revision_ready: true,
    })
  } catch (error) {
    throw new PlanningRevisionPoolServiceError('INVALID_STATE', error instanceof Error ? error.message : '当前状态无法发起修订', 409)
  }

  const sourceItems = await loadBaselineItems(sourceBaseline.id)
  const nextVersion = (await getLatestBaselineVersion(sourceBaseline.project_id)) + 1
  const timestamp = nowIso()
  const revisionId = uuidv4()

  const { error: baselineInsertError } = await supabase
    .from('task_baselines')
    .insert({
      id: revisionId,
      project_id: sourceBaseline.project_id,
      version: nextVersion,
      status: nextStatus,
      title: `${sourceBaseline.title} 修订版`,
      description: params.reason,
      source_type: 'carryover',
      source_version_id: sourceBaseline.id,
      source_version_label: `v${sourceBaseline.version}`,
      effective_from: sourceBaseline.effective_from ?? null,
      effective_to: sourceBaseline.effective_to ?? null,
      confirmed_at: null,
      confirmed_by: null,
      created_at: timestamp,
      updated_at: timestamp,
    })

  if (baselineInsertError) throw baselineInsertError

  if (sourceItems.length > 0) {
    const idMap = new Map(sourceItems.map((item) => [item.id, uuidv4()]))
    const clonedItems = sourceItems.map((item) => ({
      ...item,
      id: idMap.get(item.id)!,
      baseline_version_id: revisionId,
      parent_item_id: item.parent_item_id ? idMap.get(item.parent_item_id) ?? null : null,
      created_at: timestamp,
      updated_at: timestamp,
    }))

    const { error: itemInsertError } = await supabase.from('task_baseline_items').insert(clonedItems)
    if (itemInsertError) throw itemInsertError
  }

  const candidateIds = chosenCandidates.map((candidate) => candidate.id)
  if (candidateIds.length > 0) {
    const { error: candidateUpdateError } = await supabase
      .from('revision_pool_candidates')
      .update({
        status: 'submitted',
        submitted_at: timestamp,
        updated_at: timestamp,
      })
      .in('id', candidateIds)

    if (candidateUpdateError) throw candidateUpdateError
  }

  await writeLog({
    project_id: sourceBaseline.project_id,
    entity_type: 'baseline' as any,
    entity_id: revisionId,
    field_name: 'status',
    old_value: sourceBaseline.status,
    new_value: nextStatus,
    changed_by: params.actorUserId ?? null,
    change_source: 'manual_adjusted',
  })

  return {
    revision_id: revisionId,
    status: 'revising',
    source_version_id: sourceBaseline.id,
    created_at: timestamp,
  }
}
