import type { AcceptancePlan, Task } from '../types/db.js'
import { executeSQL, getTask, updateTask } from './dbService.js'
import { ExecutionFactIntent } from './planningScheduleGovernanceService.js'
import { isCompletedTask } from '../utils/taskStatus.js'
import { normalizeAcceptanceStatus } from '../utils/acceptanceStatus.js'

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

function normalizeDate(value: unknown) {
  const text = normalizeText(value)
  return text ? text.slice(0, 10) : ''
}

function readRecord(value: unknown): Record<string, unknown> {
  if (!value) return {}
  if (typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {}
    } catch {
      return {}
    }
  }
  return {}
}

function isAcceptanceProjectionSource(value: unknown) {
  const source = readRecord(value)
  const sourceType = normalizeText(source.sourceType ?? source.source_type).toLowerCase()
  return sourceType === 'acceptance_plan' || sourceType === 'acceptance_timeline'
}

export function isAcceptanceTimelineCanonicalTask(task: Partial<Task> | null | undefined) {
  if (!task) return false
  const metadata = readRecord(task.standard_task_metadata)
  const planItemKind = normalizeText(metadata.planItemKind ?? metadata.plan_item_kind).toLowerCase()
  const completionRule = normalizeText(task.completion_rule).toLowerCase()
  const acceptanceLinkRule = readRecord(metadata.acceptanceLinkRule ?? metadata.acceptance_link_rule)

  return completionRule === 'acceptance_passed'
    || planItemKind === 'linked_projection'
    || Boolean(metadata.isAcceptanceMilestone ?? metadata.is_acceptance_milestone)
    || Object.keys(acceptanceLinkRule).length > 0
    || isAcceptanceProjectionSource(metadata.linkedProjectionSource ?? metadata.linked_projection_source)
}

export async function syncAcceptancePlansFromCanonicalTask(params: {
  previousTask: Partial<Task>
  nextTask: Partial<Task>
  actorId?: string | null
  intent?: ExecutionFactIntent
}) {
  const { previousTask, nextTask, intent } = params
  const taskId = normalizeText(nextTask.id)
  const projectId = normalizeText(nextTask.project_id ?? previousTask.project_id)
  if (!taskId || !projectId || !isAcceptanceTimelineCanonicalTask(nextTask)) return { updated: false }

  const nextPlannedDate = normalizeDate(nextTask.planned_end_date ?? nextTask.end_date)
  const previousPlannedDate = normalizeDate(previousTask.planned_end_date ?? previousTask.end_date)
  if (!nextPlannedDate || nextPlannedDate === previousPlannedDate) return { updated: false }

  const links = await executeSQL<{ source_entity_id?: string | null }>(
    `SELECT source_entity_id
       FROM project_entity_links
      WHERE project_id = ?
        AND source_entity_type = 'acceptance_plan'
        AND target_entity_type = 'task'
        AND target_entity_id = ?
        AND relation_type = 'covers_task'
        AND status = 'active'`,
    [projectId, taskId],
  )
  const planIds = [...new Set(
    (Array.isArray(links) ? links : [])
      .map((link) => normalizeText(link.source_entity_id))
      .filter(Boolean),
  )]
  if (planIds.length === 0) return { updated: false }

  await executeSQL(
    `UPDATE acceptance_plans
        SET planned_date = ?, updated_at = ?
      WHERE project_id = ?
        AND id IN (${planIds.map(() => '?').join(', ')})`,
    [nextPlannedDate, new Date().toISOString(), projectId, ...planIds],
  )
  return { updated: true }
}

export async function syncCanonicalTaskFromAcceptancePlan(params: {
  previousPlan: AcceptancePlan
  nextPlan: AcceptancePlan
  actorId?: string | null
}) {
  const { previousPlan, nextPlan, actorId } = params
  const projectId = normalizeText(nextPlan.project_id)
  const taskIds = [...new Set((nextPlan.covered_task_ids ?? []).map(normalizeText).filter(Boolean))]
  if (!projectId || taskIds.length === 0) return null

  const updatedTasks: Task[] = []
  for (const taskId of taskIds) {
    const task = await getTask(taskId)
    if (!task || normalizeText(task.project_id) !== projectId || !isAcceptanceTimelineCanonicalTask(task)) continue

    const patch: Record<string, unknown> = {}
    const nextPlannedDate = normalizeDate(nextPlan.planned_date)
    if (nextPlannedDate && nextPlannedDate !== normalizeDate(previousPlan.planned_date)) {
      const metadata = readRecord(task.standard_task_metadata)
      const isLinkedProjection = normalizeText(metadata.planItemKind ?? metadata.plan_item_kind).toLowerCase() === 'linked_projection'
      if (isLinkedProjection) {
        patch.planned_start_date = nextPlannedDate
        patch.start_date = nextPlannedDate
      }
      patch.planned_end_date = nextPlannedDate
      patch.end_date = nextPlannedDate
    }

    const currentStatus = normalizeAcceptanceStatus(previousPlan.status)
    const nextStatus = normalizeAcceptanceStatus(nextPlan.status)
    const actualDate = normalizeDate(nextPlan.actual_date)
    const wasPassed = currentStatus === 'passed'
    const movedOutOfPassed = wasPassed && nextStatus !== 'passed'
    if (currentStatus !== nextStatus && nextStatus === 'passed' && actualDate) {
      patch.status = 'completed'
      patch.progress = 100
      patch.updated_by = actorId ?? null
    } else if (movedOutOfPassed && isCompletedTask(task)) {
      patch.status = 'in_progress'
      patch.progress = Math.min(Number(task.progress ?? 80) || 80, 80)
      patch.actual_end_date = null
      patch.updated_by = actorId ?? null
    }
    if (
      nextStatus === 'passed'
      && actualDate
      && actualDate !== normalizeDate(task.actual_end_date)
    ) {
      patch.actual_end_date = actualDate
      patch.updated_by = actorId ?? null
    }

    if (Object.keys(patch).length === 0) continue
    const updatedTask = await updateTask(taskId, patch as any, undefined, {
      executionFactIntent: nextStatus === 'passed' ? ExecutionFactIntent.AcceptancePass : ExecutionFactIntent.SystemBackfill,
      executionFactEventDate: actualDate || nextPlannedDate || normalizeDate(previousPlan.planned_date) || undefined,
      allowManualActualDates: (nextStatus === 'passed' && Boolean(actualDate)) || movedOutOfPassed,
      ...(movedOutOfPassed ? { allowReopen: true } : {}),
    })
    if (updatedTask) updatedTasks.push(updatedTask)
  }

  return updatedTasks.at(-1) ?? null
}
