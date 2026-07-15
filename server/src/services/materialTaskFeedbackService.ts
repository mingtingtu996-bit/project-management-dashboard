// v1.4.21: reflect task execution facts back to explicitly linked materials.

import type { Task } from '../types/db.js'
import { query as rawQuery } from '../database.js'
import { logger } from '../middleware/logger.js'
import { isCompletedTask } from '../utils/taskStatus.js'
import { writeLogs } from './changeLogs.js'

type MaterialLifecycleRow = {
  id: string
  lifecycle_status?: string | null
}

type TaskMaterialFeedbackEvent = 'task_started' | 'task_completed' | 'task_reopened'

const MATERIAL_CONDITION_TYPES = ['material', '材料']
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

function normalizeUuid(value: unknown) {
  const normalized = normalizeText(value)
  return UUID_PATTERN.test(normalized) ? normalized : null
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => Boolean(value && value.trim())))]
}

function isTaskStarted(task?: Task | null) {
  if (!task) return false
  const status = normalizeText(task.status).toLowerCase()
  if (status === 'in_progress' || status === 'completed' || status === '进行中' || status === '已完成') return true
  if (normalizeText(task.actual_start_date)) return true
  return Number(task.progress ?? 0) > 0
}

function resolveFeedbackEvent(previousTask?: Task | null, task?: Task | null): TaskMaterialFeedbackEvent | null {
  if (!task) return null
  const previousCompleted = isCompletedTask({ status: previousTask?.status ?? null, progress: previousTask?.progress ?? null })
  const nextCompleted = isCompletedTask({ status: task.status, progress: task.progress })
  if (!previousCompleted && nextCompleted) return 'task_completed'
  if (previousCompleted && !nextCompleted) return 'task_reopened'

  const previousStarted = isTaskStarted(previousTask)
  const nextStarted = isTaskStarted(task)
  if (!previousStarted && nextStarted) return 'task_started'

  return null
}

async function loadLinkedMaterialIds(projectId: string, taskId: string) {
  const result = await rawQuery(
    `SELECT source_ref_id::text AS source_ref_id, source_entity_id
       FROM public.task_conditions
      WHERE project_id = $1::uuid
        AND task_id = $2::uuid
        AND condition_type = ANY($3::text[])
        AND (
          source_type = 'material'
          OR source_entity_type = 'project_material'
        )
        AND (
          source_ref_id IS NOT NULL
          OR COALESCE(source_entity_id, '') <> ''
        )`,
    [projectId, taskId, MATERIAL_CONDITION_TYPES],
  )

  return uniqueStrings(
    result.rows.flatMap((row: { source_ref_id?: string | null; source_entity_id?: string | null }) => [
      normalizeUuid(row.source_ref_id),
      normalizeUuid(row.source_entity_id),
    ]),
  )
}

async function loadActiveMaterials(projectId: string, materialIds: string[]) {
  if (materialIds.length === 0) return []
  const result = await rawQuery(
    `SELECT id::text AS id, lifecycle_status
       FROM public.project_materials
      WHERE project_id = $1::uuid
        AND id = ANY($2::uuid[])
        AND COALESCE(record_status, 'active') = 'active'`,
    [projectId, materialIds],
  )
  return result.rows as MaterialLifecycleRow[]
}

function filterLifecycleTargets(rows: MaterialLifecycleRow[], nextStatus: string) {
  return rows.filter((row) => {
    const current = normalizeText(row.lifecycle_status || 'active').toLowerCase()
    if (['archived', 'voided', 'inactive', 'cancelled'].includes(current)) return false
    if (nextStatus === 'used') return current !== 'used'
    return current !== 'consumed'
  })
}

export async function applyTaskMaterialLifecycleFeedback(params: {
  previousTask?: Task | null
  task: Task
  actorId?: string | null
}) {
  const projectId = normalizeUuid(params.task.project_id)
  const taskId = normalizeUuid(params.task.id)
  if (!projectId || !taskId) return { event: null, updatedCount: 0, materialIds: [] as string[] }

  const event = resolveFeedbackEvent(params.previousTask, params.task)
  if (!event) return { event: null, updatedCount: 0, materialIds: [] as string[] }

  const nextStatus = event === 'task_completed' ? 'consumed' : 'used'
  const materialIds = await loadLinkedMaterialIds(projectId, taskId)
  if (materialIds.length === 0) return { event, updatedCount: 0, materialIds: [] as string[] }

  const materialRows = await loadActiveMaterials(projectId, materialIds)
  const targets = filterLifecycleTargets(materialRows, nextStatus)
  if (targets.length === 0) return { event, updatedCount: 0, materialIds: [] as string[] }

  const targetSnapshots = targets.map((row) => ({ ...row }))
  const targetIds = targetSnapshots.map((row) => row.id)
  await rawQuery(
    `UPDATE public.project_materials
        SET lifecycle_status = $3,
            updated_at = now()
      WHERE project_id = $1::uuid
        AND id = ANY($2::uuid[])
        AND COALESCE(record_status, 'active') = 'active'`,
    [projectId, targetIds, nextStatus],
  )

  await writeLogs(targetSnapshots.map((row) => ({
    project_id: projectId,
    entity_type: 'project_material',
    entity_id: row.id,
    field_name: 'lifecycle_status',
    old_value: normalizeText(row.lifecycle_status || 'active'),
    new_value: nextStatus,
    change_reason: event,
    changed_by: params.actorId ?? null,
    change_source: 'system_auto',
    action_type: 'material_task_feedback',
    action_group: 'material_task_linkage',
    visibility: 'governance',
    metadata: {
      task_id: taskId,
      feedback_event: event,
    },
  })))

  logger.info('[materialTaskFeedbackService] reflected task execution into linked materials', {
    projectId,
    taskId,
    event,
    updatedCount: targetIds.length,
  })

  return { event, updatedCount: targetIds.length, materialIds: targetIds }
}
