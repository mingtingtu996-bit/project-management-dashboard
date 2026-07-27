import { logger } from '../middleware/logger.js'
import { query as rawQuery } from '../database.js'
import { supabase } from './dbService.js'
import {
  buildConditionImpactSignals,
  buildObstacleImpactSignals,
  summarizeDelayImpactSignals,
} from './executionImpactSignals.js'

type ConstraintStatus = 'satisfied' | 'blocking' | 'not_applicable'
type ObstacleStatus = 'clear' | 'warning' | 'partial_impact' | 'blocked' | 'not_applicable'
type ProgressImpactLevel = 'none' | 'warning' | 'partial' | 'blocked'

const CALCULATION_VERSION = 'v1.4.8.1'
const START_BLOCKING_DEPENDENCY_SOURCES = new Set(['manual', 'current_task_fact', 'explicit', 'user', 'user_manual'])

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

function normalizeStatus(value: unknown) {
  return normalizeText(value).toLowerCase()
}

function normalizeNullableText(value: unknown) {
  const normalized = normalizeText(value)
  return normalized || null
}

function toSqlTimestamp(value?: string | null) {
  const normalized = normalizeNullableText(value)
  if (!normalized) return new Date().toISOString()
  return normalized
}

function isTruthy(value: unknown) {
  return value === true || value === 1 || value === '1' || normalizeStatus(value) === 'true'
}

function isCompletedTaskLike(task: Record<string, unknown> | null | undefined) {
  const status = normalizeStatus(task?.status)
  return status === 'completed' || status === 'done' || status === '已完成' || Number(task?.progress ?? 0) >= 100
}

function isStartBlockingDependency(dependency: Record<string, unknown>) {
  const sourceType = normalizeStatus(dependency.source_type)
  if (!sourceType) return true
  return START_BLOCKING_DEPENDENCY_SOURCES.has(sourceType)
}

function isOpenObstacle(obstacle: Record<string, unknown>) {
  if (isTruthy(obstacle.is_resolved)) return false
  const status = normalizeStatus(obstacle.status)
  return !['resolved', 'closed', 'deleted', 'archived', '已解决', '已关闭'].includes(status)
}

function normalizeProgressImpact(value: unknown): ProgressImpactLevel | null {
  const normalized = normalizeStatus(value)
  if (normalized === 'blocked' || normalized === 'severe' || normalized === 'critical' || normalized === '严重') return 'blocked'
  if (normalized === 'partial' || normalized === 'partial_impact' || normalized === 'medium' || normalized === '中') return 'partial'
  if (normalized === 'warning' || normalized === 'low' || normalized === '低') return 'warning'
  if (normalized === 'none' || normalized === 'clear') return 'none'
  return null
}

function inferObstacleImpact(obstacle: Record<string, unknown>): ProgressImpactLevel {
  const explicit = normalizeProgressImpact(obstacle.progress_impact_level ?? obstacle.impact_level ?? obstacle.blocking_level)
  if (explicit) return explicit

  const severity = normalizeProgressImpact(obstacle.severity)
  if (severity) return severity === 'none' ? 'warning' : severity

  const expectedDate = normalizeText(obstacle.expected_resolution_date ?? obstacle.estimated_resolve_date)
  if (expectedDate) {
    const expectedTime = new Date(expectedDate).getTime()
    if (Number.isFinite(expectedTime) && expectedTime < Date.now()) return 'partial'
  }

  return 'warning'
}

function maxProgressImpact(levels: ProgressImpactLevel[]): ProgressImpactLevel {
  if (levels.includes('blocked')) return 'blocked'
  if (levels.includes('partial')) return 'partial'
  if (levels.includes('warning')) return 'warning'
  return 'none'
}

function obstacleStatusFromImpact(impact: ProgressImpactLevel): ObstacleStatus {
  if (impact === 'blocked') return 'blocked'
  if (impact === 'partial') return 'partial_impact'
  if (impact === 'warning') return 'warning'
  return 'clear'
}

async function readRows(table: string, filters: Record<string, unknown>) {
  let query = supabase.from(table).select('*')
  for (const [key, value] of Object.entries(filters)) {
    query = query.eq(key, value)
  }
  const { data, error } = await query
  if (error) throw error
  return (Array.isArray(data) ? data : []) as Array<Record<string, unknown>>
}

async function writeTaskConstraintSnapshot(input: {
  projectId: string
  taskId: string
  sourceEventType: string
  summary: Record<string, unknown>
}) {
  const sourceEventKey = `${input.sourceEventType}:${input.taskId}:${JSON.stringify(input.summary)}`
  const { error } = await supabase.from('task_constraint_snapshots').upsert({
    project_id: input.projectId,
    task_id: input.taskId,
    ready_for_start: input.summary.readyForStart,
    dependency_status: input.summary.dependencyStatus,
    condition_status: input.summary.conditionStatus,
    obstacle_status: input.summary.obstacleStatus,
    progress_impact_level: input.summary.progressImpactLevel,
    blocked_for_progress: input.summary.blockedForProgress,
    readiness_summary: input.summary,
    source_event_type: input.sourceEventType,
    source_event_key: sourceEventKey,
    calculation_version: CALCULATION_VERSION,
  }, { onConflict: 'source_event_key' })

  if (error) {
    logger.warn('[taskConstraintGovernance] failed to write snapshot', {
      taskId: input.taskId,
      error: error.message,
    })
  }
}

export async function evaluateTaskConstraint(
  taskId: string,
  options: { projectId: string; sourceEventType?: string },
) {
  const normalizedTaskId = normalizeText(taskId)
  if (!normalizedTaskId) return null
  const projectId = normalizeText(options.projectId)
  if (!projectId) throw new Error('task constraint evaluation requires projectId')

  const { data: task, error: taskError } = await supabase
    .from('tasks')
    .select('*')
    .eq('id', normalizedTaskId)
    .eq('project_id', projectId)
    .maybeSingle()

  if (taskError) throw taskError
  if (!task) return null

  const [dependencies, conditions, obstacles] = await Promise.all([
    readRows('task_dependencies', { project_id: projectId, task_id: normalizedTaskId, status: 'active' }),
    readRows('task_conditions', { project_id: projectId, task_id: normalizedTaskId }),
    readRows('task_obstacles', { project_id: projectId, task_id: normalizedTaskId }),
  ])

  const requiredDependencies = dependencies.filter((item) => item.required_for_start !== false)
  const blockingDependencies = requiredDependencies.filter(isStartBlockingDependency)
  const advisoryDependencyCount = Math.max(0, requiredDependencies.length - blockingDependencies.length)
  const dependencyTaskIds = [...new Set(blockingDependencies.map((item) => normalizeText(item.dependency_task_id)).filter(Boolean))]
  let unmetDependencyCount = 0
  let dependencyStatus: ConstraintStatus = blockingDependencies.length > 0 ? 'satisfied' : 'not_applicable'

  if (dependencyTaskIds.length > 0) {
    const { data: dependencyTasks, error } = await supabase
      .from('tasks')
      .select('id,status,progress,actual_end_date')
      .in('id', dependencyTaskIds)
      .eq('project_id', projectId)
    if (error) throw error

    const dependencyById = new Map((dependencyTasks ?? []).map((item: any) => [String(item.id), item as Record<string, unknown>]))
    unmetDependencyCount = dependencyTaskIds.filter((id) => !isCompletedTaskLike(dependencyById.get(id))).length
    dependencyStatus = unmetDependencyCount > 0 ? 'blocking' : 'satisfied'
  }

  const relevantConditions = conditions.filter((item) => normalizeStatus(item.status) !== 'deleted')
  const hardConditions = relevantConditions.filter((item) => {
    const blockingLevel = normalizeStatus(item.blocking_level)
    return item.required_for_start !== false && (blockingLevel === 'hard' || !blockingLevel)
  })
  const hasUnmetHardCondition = hardConditions.some((item) => !isTruthy(item.is_satisfied))
  const conditionStatus: ConstraintStatus = hardConditions.length === 0
    ? 'not_applicable'
    : hasUnmetHardCondition
      ? 'blocking'
      : 'satisfied'

  const openObstacles = obstacles.filter(isOpenObstacle)
  const progressImpactLevel = maxProgressImpact(openObstacles.map(inferObstacleImpact))
  const obstacleStatus = openObstacles.length === 0 ? 'clear' : obstacleStatusFromImpact(progressImpactLevel)
  const blockedForProgress = progressImpactLevel === 'blocked'
  const readyForStart = dependencyStatus !== 'blocking' && conditionStatus !== 'blocking'
  const conditionImpactSignals = buildConditionImpactSignals(relevantConditions)
  const obstacleImpactSignals = buildObstacleImpactSignals(openObstacles, new Date())
  const impactSignalSummary = summarizeDelayImpactSignals([...conditionImpactSignals, ...obstacleImpactSignals])

  const summary = {
    readyForStart,
    dependencyStatus,
    conditionStatus,
    obstacleStatus,
    progressImpactLevel,
    blockedForProgress,
    dependencyCount: blockingDependencies.length,
    advisoryDependencyCount,
    totalDependencyCount: requiredDependencies.length,
    unmetDependencyCount,
    hardConditionCount: hardConditions.length,
    unmetHardConditionCount: hardConditions.filter((item) => !isTruthy(item.is_satisfied)).length,
    openObstacleCount: openObstacles.length,
    impactSignals: impactSignalSummary.signals,
    impactSignalSummary: {
      rawCount: impactSignalSummary.rawCount,
      dedupedCount: impactSignalSummary.dedupedCount,
      duplicates: impactSignalSummary.duplicates,
      weightedRiskScore: impactSignalSummary.weightedRiskScore,
      criticality: impactSignalSummary.criticality,
      responsibilityBreakdown: impactSignalSummary.responsibilityBreakdown,
      uncertaintyIndex: impactSignalSummary.uncertaintyIndex,
      uncertaintyReasons: impactSignalSummary.uncertaintyReasons,
    },
    evaluatedAt: new Date().toISOString(),
    calculationVersion: CALCULATION_VERSION,
  }

  const { error: updateError } = await supabase
    .from('tasks')
    .update({
      ready_for_start: readyForStart,
      dependency_status: dependencyStatus,
      condition_status: conditionStatus,
      obstacle_status: obstacleStatus,
      progress_impact_level: progressImpactLevel,
      blocked_for_progress: blockedForProgress,
      readiness_summary: summary,
      constraint_evaluated_at: summary.evaluatedAt,
    })
    .eq('id', normalizedTaskId)
    .eq('project_id', projectId)

  if (updateError) {
    logger.warn('[taskConstraintGovernance] failed to update task constraint cache', {
      taskId: normalizedTaskId,
      error: updateError.message,
    })
  }

  await writeTaskConstraintSnapshot({
    projectId,
    taskId: normalizedTaskId,
    sourceEventType: options.sourceEventType ?? 'task_constraint_recalculate',
    summary,
  })

  return summary
}

export async function satisfyCondition(
  conditionId: string,
  options: {
    reason?: string | null
    reasonNote?: string | null
    satisfiedAt?: string | null
    confirmedBy?: string | null
    sourceEventType?: string
  } = {},
) {
  const normalizedConditionId = normalizeNullableText(conditionId)
  if (!normalizedConditionId) return null

  const { data: condition, error } = await (supabase as any)
    .from('task_conditions')
    .select('id, project_id, task_id, is_satisfied')
    .eq('id', normalizedConditionId)
    .maybeSingle()

  if (error) throw error
  if (!condition) return null

  const projectId = normalizeNullableText(condition.project_id)
  const taskId = normalizeNullableText(condition.task_id)
  if (!projectId || !taskId) return null

  const timestamp = toSqlTimestamp(options.satisfiedAt)
  await rawQuery(
    `UPDATE public.task_conditions
        SET is_satisfied = TRUE,
            status = CASE
              WHEN status IS NULL OR status IN ('open', 'pending', '未满足', '待满足', 'blocked')
                THEN 'met'
              ELSE status
            END,
            satisfied_reason = $1,
            satisfied_reason_note = $2,
            confirmed_at = COALESCE(confirmed_at, $3::timestamptz),
            confirmed_by = COALESCE(confirmed_by, $4),
            updated_at = $3::timestamptz
      WHERE id = $5::uuid
        AND project_id = $6::uuid`,
    [
      normalizeNullableText(options.reason) ?? 'source_condition_satisfied',
      normalizeNullableText(options.reasonNote),
      timestamp,
      normalizeNullableText(options.confirmedBy),
      normalizedConditionId,
      projectId,
    ],
  )

  const summary = await evaluateTaskConstraint(taskId, {
    projectId,
    sourceEventType: options.sourceEventType ?? 'task_condition_satisfied',
  })

  return {
    conditionId: normalizedConditionId,
    projectId,
    taskId,
    wasAlreadySatisfied: isTruthy(condition.is_satisfied),
    summary,
  }
}
