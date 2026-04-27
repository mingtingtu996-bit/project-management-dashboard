import type { Task } from '../types/db.js'
import { logger } from '../middleware/logger.js'
import { query as rawQuery } from '../database.js'
import { SystemAnomalyService } from './systemAnomalyService.js'
import { WarningService } from './warningService.js'
import { isCompletedTask } from '../utils/taskStatus.js'
import {
  createTask as createTaskRecord,
  executeSQL,
  getMembers,
  getTask,
  recordTaskProgressSnapshot,
  reopenTask as reopenTaskRecord,
  supabase,
  updateTask as updateTaskRecord,
} from './dbService.js'
import { persistNotification } from './warningChainService.js'

type ParticipantUnitRecord = {
  id: string
  unit_name: string
}

type AutoSatisfiedDependentCondition = {
  condition_id: string
  task_id: string
}

type AutoResolvedDependentObstacle = {
  obstacle_id: string
  task_id: string
}

type AutoResolvableTaskObstacle = {
  id: string
  task_id: string
  project_id?: string | null
  title?: string | null
  description?: string | null
  severity?: string | null
  status?: string | null
  expected_resolution_date?: string | null
  estimated_resolve_date?: string | null
}

type TaskCreateChainInput = Parameters<typeof createTaskRecord>[0] & {
  created_by?: string | null
}

type TaskWritePatch = Partial<Task> & {
  updated_by?: string | null
}

type TaskWriteResult = {
  task: Task
  participantUnit: ParticipantUnitRecord | null
}

const warningService = new WarningService()
const systemAnomalyService = new SystemAnomalyService()

function normalizeUnitLabel(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function isMissingRelationError(error: unknown, relation: string) {
  const message = String((error as Error | undefined)?.message || '')
  const lowerMessage = message.toLowerCase()
  const lowerRelation = relation.toLowerCase()

  return lowerMessage.includes(lowerRelation) && (
    lowerMessage.includes('does not exist')
    || lowerMessage.includes('不存在')
    || lowerMessage.includes('schema cache')
    || lowerMessage.includes('could not find the table')
    || lowerMessage.includes('could not find the column')
  )
}

function uniqueRecipients(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => Boolean(value && value.trim())))]
}

function normalizeObstacleWarningSeverity(value: unknown) {
  const normalized = String(value ?? '').trim().toLowerCase()
  if (normalized === 'critical' || normalized === '严重') return 'critical'
  if (normalized === 'high' || normalized === 'medium' || normalized === 'low' || normalized === 'warning') {
    return normalized
  }
  return 'warning'
}

function readTaskAssigneeUserId(task?: Task | null) {
  const extendedTask = task as (Task & { assignee_id?: string | null }) | null | undefined
  return String(extendedTask?.assignee_user_id ?? extendedTask?.assignee_id ?? '').trim()
}

function readTaskAssigneeLabel(task?: Task | null) {
  return String(task?.assignee_name ?? task?.assignee ?? '').trim()
}

function justCompletedTask(previousTask?: Task | null, nextTask?: Task | null) {
  const previousCompleted =
    isCompletedTask({ status: previousTask?.status ?? null, progress: previousTask?.progress ?? null })
  const nextCompleted =
    isCompletedTask({ status: nextTask?.status ?? null, progress: nextTask?.progress ?? null })

  return !previousCompleted && nextCompleted
}

function shouldRecordTaskSnapshot(previousTask?: Task | null, nextTask?: Task | null) {
  if (!nextTask) return false
  if (!previousTask) return true

  return (
    Number(previousTask.progress ?? 0) !== Number(nextTask.progress ?? 0)
    || String(previousTask.status ?? '') !== String(nextTask.status ?? '')
    || String(previousTask.actual_start_date ?? '') !== String(nextTask.actual_start_date ?? '')
    || String(previousTask.actual_end_date ?? '') !== String(nextTask.actual_end_date ?? '')
    || String(previousTask.first_progress_at ?? '') !== String(nextTask.first_progress_at ?? '')
  )
}

function queuePassiveReorderDetection(projectId: string, taskId: string) {
  void systemAnomalyService.enqueuePassiveReorderDetection(projectId)
  logger.debug('Passive reorder detection queued', { projectId, taskId })
}

async function lookupParticipantUnitByName(projectId: string, unitName: string) {
  const rows = await executeSQL<ParticipantUnitRecord>(
    'SELECT id, unit_name FROM participant_units WHERE project_id = ? AND unit_name = ?',
    [projectId, unitName],
  )
  if (rows[0]) return rows[0]

  const legacyRows = await executeSQL<ParticipantUnitRecord>(
    'SELECT id, unit_name FROM participant_units WHERE project_id IS NULL AND unit_name = ?',
    [unitName],
  )
  return legacyRows[0] ?? null
}

async function lookupParticipantUnitById(projectId: string, unitId: string) {
  const { data, error } = await supabase
    .from('participant_units')
    .select('id, unit_name, project_id')
    .eq('id', unitId)
    .single()

  if (error) {
    const message = String(error.message ?? '').trim().toLowerCase()
    if (message.includes('no rows')) {
      return null
    }
    throw new Error(error.message ?? 'Failed to load participant unit')
  }

  const row = data as { id?: string | null; unit_name?: string | null; project_id?: string | null } | null
  if (!row?.id) {
    return null
  }

  const rowProjectId = normalizeUnitLabel(row.project_id)
  if (rowProjectId && rowProjectId !== projectId) {
    return null
  }

  return {
    id: String(row.id),
    unit_name: normalizeUnitLabel(row.unit_name),
  }
}

async function persistTaskParticipantUnit(
  taskId: string,
  projectId: string,
  unitId?: string | null,
  unitName?: string | null,
  userId?: string | null,
) {
  if (!projectId) return null

  const normalizedUnitId = normalizeUnitLabel(unitId)
  const normalizedUnitName = normalizeUnitLabel(unitName)
  const matched = normalizedUnitId
    ? await lookupParticipantUnitById(projectId, normalizedUnitId) ?? await lookupParticipantUnitByName(projectId, normalizedUnitName)
    : await lookupParticipantUnitByName(projectId, normalizedUnitName)

  const { error } = await supabase
    .from('tasks')
    .update({
      participant_unit_id: matched?.id ?? null,
      updated_by: userId ?? null,
    })
    .eq('id', taskId)

  if (error) throw new Error(error.message)
  return matched ?? null
}

async function loadAutoSatisfiedDependentConditions(completedTaskId: string) {
  const [legacyDependentTasks, relationRows] = await Promise.all([
    executeSQL<{ id: string }>(
      'SELECT id FROM tasks WHERE preceding_task_id = ?',
      [completedTaskId],
    ).catch((error) => {
      if (!isMissingRelationError(error, 'preceding_task_id')) {
        throw error
      }

      logger.warn('tasks.preceding_task_id missing in schema cache, skipping legacy dependent-task lookup', {
        completedTaskId,
      })
      return [] as Array<{ id: string }>
    }),
    executeSQL<{ condition_id: string }>(
      'SELECT condition_id FROM task_preceding_relations WHERE task_id = ?',
      [completedTaskId],
    ).catch((error) => {
      if (!isMissingRelationError(error, 'task_preceding_relations')) {
        throw error
      }

      logger.warn('task_preceding_relations missing in schema cache, retrying via direct pg query', {
        completedTaskId,
      })

      return rawQuery(
        'SELECT condition_id FROM public.task_preceding_relations WHERE task_id = $1',
        [completedTaskId],
      )
        .then((result) => result.rows as Array<{ condition_id: string }>)
        .catch((fallbackError) => {
          if (!isMissingRelationError(fallbackError, 'task_preceding_relations')) {
            throw fallbackError
          }

          logger.warn('task_preceding_relations missing in direct pg fallback too, skipping relation-based auto-satisfied conditions', {
            completedTaskId,
          })
          return [] as Array<{ condition_id: string }>
        })
    }),
  ])

  const legacyTaskIds = [...new Set(legacyDependentTasks.map((task) => String(task.id)).filter(Boolean))]
  const relationConditionIds = [...new Set(relationRows.map((row) => String(row.condition_id)).filter(Boolean))]

  const [legacyConditions, relationConditions] = await Promise.all([
    legacyTaskIds.length > 0
      ? executeSQL<{ id: string; task_id: string }>(
        `SELECT id, task_id FROM task_conditions WHERE task_id IN (${legacyTaskIds.map(() => '?').join(', ')}) AND is_satisfied = ?`,
        [...legacyTaskIds, false],
      )
      : Promise.resolve([] as Array<{ id: string; task_id: string }>),
    relationConditionIds.length > 0
      ? executeSQL<{ id: string; task_id: string }>(
        `SELECT id, task_id FROM task_conditions WHERE id IN (${relationConditionIds.map(() => '?').join(', ')}) AND is_satisfied = ?`,
        [...relationConditionIds, false],
      )
      : Promise.resolve([] as Array<{ id: string; task_id: string }>),
  ])

  return [...legacyConditions, ...relationConditions]
    .map((item) => ({
      condition_id: String(item.id),
      task_id: String(item.task_id),
    }))
    .filter((item, index, rows) => rows.findIndex((row) => row.condition_id === item.condition_id) === index)
}

async function autoSatisfyDependentConditions(completedTaskId: string, projectId?: string | null) {
  const dependentConditions = await loadAutoSatisfiedDependentConditions(completedTaskId)
  if (dependentConditions.length === 0) return dependentConditions

  const conditionIds = dependentConditions.map((item) => item.condition_id)
  const placeholders = conditionIds.map(() => '?').join(', ')
  const timestamp = new Date().toISOString().slice(0, 19).replace('T', ' ')

  await executeSQL(
    `UPDATE task_conditions SET is_satisfied = true, updated_at = ? WHERE id IN (${placeholders})`,
    [timestamp, ...conditionIds],
  )

  logger.info('Auto-satisfied preceding-task conditions', {
    completedTaskId,
    affectedConditions: conditionIds.length,
    taskIds: [...new Set(dependentConditions.map((item) => item.task_id))],
  })

  if (projectId) {
    void import('./projectHealthService.js')
      .then(({ enqueueProjectHealthUpdate }) => enqueueProjectHealthUpdate(projectId, 'task_condition_auto_satisfied'))
      .catch((error) => {
        logger.warn('Failed to enqueue health refresh after auto-satisfying task conditions', {
          projectId,
          completedTaskId,
          error: error instanceof Error ? error.message : String(error),
        })
      })
  }

  return dependentConditions
}

async function notifyAutoSatisfiedConditions(projectId: string, dependents: AutoSatisfiedDependentCondition[]) {
  if (!projectId || dependents.length === 0) return

  const members = await getMembers(projectId)
  const recipients = uniqueRecipients(
    members
      .filter((member) => member.role === 'owner')
      .map((member) => member.user_id),
  )

  if (recipients.length === 0) return

  const taskIds = [...new Set(dependents.map((item) => item.task_id).filter(Boolean))]
  const tasks = taskIds.length > 0
    ? await executeSQL<{ id: string; title?: string | null }>(
      `SELECT id, title FROM tasks WHERE id IN (${taskIds.map(() => '?').join(', ')})`,
      taskIds,
    )
    : []
  const taskTitleMap = new Map(tasks.map((task) => [task.id, task.title?.trim() || '任务']))

  for (const dependent of dependents) {
    await persistNotification({
      project_id: projectId,
      type: 'condition_auto_satisfied',
      notification_type: 'flow-reminder',
      severity: 'info',
      title: '前置条件已自动满足',
      content: `任务“${taskTitleMap.get(dependent.task_id) || '任务'}”的前置条件已因关联任务完成自动满足。`,
      is_read: false,
      is_broadcast: false,
      source_entity_type: 'task_condition',
      source_entity_id: dependent.condition_id,
      task_id: dependent.task_id,
      category: 'condition',
      recipients,
      created_at: new Date().toISOString(),
    })
  }
}

async function notifyTaskAssignmentChange(previousTask: Task | null | undefined, nextTask: Task | null | undefined) {
  if (!previousTask || !nextTask) return

  const nextAssigneeUserId = readTaskAssigneeUserId(nextTask)
  const previousAssigneeUserId = readTaskAssigneeUserId(previousTask)
  const nextAssigneeLabel = readTaskAssigneeLabel(nextTask)
  const previousAssigneeLabel = readTaskAssigneeLabel(previousTask)

  if (!nextAssigneeUserId) return

  const assigneeChanged = previousAssigneeUserId
    ? previousAssigneeUserId !== nextAssigneeUserId
    : previousAssigneeLabel !== nextAssigneeLabel

  if (!assigneeChanged) return

  const taskTitle = String(nextTask.title ?? previousTask.title ?? '').trim() || '任务'
  const projectId = String(nextTask.project_id ?? previousTask.project_id ?? '').trim()
  if (!projectId) return

  const title = previousAssigneeLabel ? '任务责任人已变更' : '任务已分配'
  const content = previousAssigneeLabel
    ? `任务“${taskTitle}”责任人已由“${previousAssigneeLabel}”变更为“${nextAssigneeLabel || '未指定'}”。`
    : `任务“${taskTitle}”已分配给“${nextAssigneeLabel || '未指定'}”。`

  await persistNotification({
    project_id: projectId,
    type: 'task_assignment_changed',
    notification_type: 'flow-reminder',
    severity: 'info',
    title,
    content,
    is_read: false,
    is_broadcast: false,
    source_entity_type: 'task',
    source_entity_id: `${nextTask.id}:${nextAssigneeUserId}`,
    category: 'task',
    recipients: uniqueRecipients([nextAssigneeUserId]),
    metadata: {
      task_id: nextTask.id,
      previous_assignee_user_id: previousAssigneeUserId || null,
      previous_assignee_name: previousAssigneeLabel || null,
      next_assignee_user_id: nextAssigneeUserId,
      next_assignee_name: nextAssigneeLabel || null,
    },
    created_at: new Date().toISOString(),
  })
}

async function autoResolveDependentObstacles(
  dependents: AutoSatisfiedDependentCondition[],
  completedTaskId: string,
  actorId?: string | null,
) {
  const taskIds = [...new Set(dependents.map((item) => item.task_id).filter(Boolean))]
  if (taskIds.length === 0) return [] as AutoResolvedDependentObstacle[]

  const obstacles = await executeSQL<AutoResolvableTaskObstacle>(
    `SELECT id, task_id, project_id, title, description, severity, status, expected_resolution_date, estimated_resolve_date
       FROM task_obstacles
      WHERE task_id IN (${taskIds.map(() => '?').join(', ')})
        AND status IN (?, ?)`,
    [...taskIds, '待处理', '处理中'],
  )

  if (obstacles.length === 0) return [] as AutoResolvedDependentObstacle[]

  const { BusinessStatusService } = await import('./businessStatusService.js')
  const resolved: AutoResolvedDependentObstacle[] = []
  const projectIds = new Set<string>()
  const resolvedBy = actorId ?? 'system_auto'

  for (const obstacle of obstacles) {
    try {
      const updated = await BusinessStatusService.resolveObstacle({
        id: obstacle.id,
        resolution: '关联前置任务已完成，系统自动解除依赖型阻碍',
        resolved_by: resolvedBy,
      })

      await warningService.evaluate({
        type: 'obstacle',
        obstacle: {
          id: updated.id,
          project_id: obstacle.project_id ?? null,
          task_id: updated.task_id ?? obstacle.task_id,
          title: String(obstacle.title ?? obstacle.description ?? '').trim() || null,
          description: String(obstacle.description ?? obstacle.title ?? '').trim() || null,
          severity: normalizeObstacleWarningSeverity(updated.severity ?? obstacle.severity),
          status: updated.status ?? '已解决',
          expected_resolution_date:
            obstacle.expected_resolution_date
            ?? obstacle.estimated_resolve_date
            ?? null,
        },
      })

      const projectId = String(obstacle.project_id ?? '').trim()
      if (projectId) projectIds.add(projectId)

      resolved.push({
        obstacle_id: obstacle.id,
        task_id: obstacle.task_id,
      })
    } catch (error) {
      logger.warn('Failed to auto-resolve dependency obstacle after preceding-task completion', {
        completedTaskId,
        obstacleId: obstacle.id,
        taskId: obstacle.task_id,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  if (resolved.length > 0) {
    logger.info('Auto-resolved dependency obstacles after preceding-task completion', {
      completedTaskId,
      affectedObstacles: resolved.length,
      taskIds,
    })

    void import('./projectHealthService.js')
      .then(({ enqueueProjectHealthUpdate }) => {
        for (const projectId of projectIds) {
          enqueueProjectHealthUpdate(projectId, 'task_obstacle_resolved')
        }
      })
      .catch((error) => {
        logger.warn('Failed to enqueue health refresh after auto-resolving dependency obstacles', {
          completedTaskId,
          error: error instanceof Error ? error.message : String(error),
        })
      })
  }

  return resolved
}

async function finalizeTaskWrite(task: Task, previousTask?: Task | null) {
  await warningService.evaluate({
    type: 'task',
    task: {
      id: task.id,
      status: task.status,
      progress: task.progress,
    },
  })

  if (justCompletedTask(previousTask, task)) {
    try {
      const { closeDelaySourceRisksForCompletedTask } = await import('./upgradeChainService.js')
      await closeDelaySourceRisksForCompletedTask(task.id)
    } catch (error) {
      logger.warn('Failed to auto-close delay source risks after task completion', {
        taskId: task.id,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  queuePassiveReorderDetection(task.project_id, task.id)
}

export async function createTaskInMainChain(
  input: TaskCreateChainInput,
  actorId?: string | null,
): Promise<TaskWriteResult> {
  const effectiveActorId = actorId ?? input.created_by ?? null
  const task = await createTaskRecord(input, { skipSnapshotWrite: true })
  const selectedUnitName =
    normalizeUnitLabel(input.responsible_unit) ||
    normalizeUnitLabel(input.assignee_unit)
  const participantUnit = await persistTaskParticipantUnit(
    task.id,
    task.project_id,
    input.participant_unit_id ?? null,
    selectedUnitName,
    effectiveActorId,
  )

  await recordTaskProgressSnapshot(task, {
    recordedBy: effectiveActorId,
    notes: Boolean(task.is_milestone)
      ? '里程碑已创建并纳入快照链路'
      : '任务已创建并纳入快照链路',
  })

  queuePassiveReorderDetection(task.project_id, task.id)
  return { task, participantUnit }
}

export async function updateTaskInMainChain(
  taskId: string,
  updates: TaskWritePatch,
  expectedVersion?: number,
): Promise<TaskWriteResult | null> {
  const previousTask = await getTask(taskId)
  if (!previousTask) return null

  const task = await updateTaskRecord(taskId, updates, expectedVersion, { skipSnapshotWrite: true })
  if (!task) return null

  const selectedUnitId = 'participant_unit_id' in updates
    ? updates.participant_unit_id ?? null
    : previousTask.participant_unit_id ?? null
  const selectedUnitName =
    ('responsible_unit' in updates
      ? normalizeUnitLabel(updates.responsible_unit)
      : normalizeUnitLabel(updates.assignee_unit))
    || normalizeUnitLabel(previousTask.responsible_unit)
    || normalizeUnitLabel(previousTask.assignee_unit)
  const participantUnit = await persistTaskParticipantUnit(
    task.id,
    String(previousTask.project_id ?? task.project_id ?? ''),
    selectedUnitId,
    selectedUnitName,
    updates.updated_by ?? null,
  )

  if (justCompletedTask(previousTask, task)) {
    try {
      const autoSatisfiedDependents = await autoSatisfyDependentConditions(task.id, task.project_id)
      await notifyAutoSatisfiedConditions(task.project_id, autoSatisfiedDependents)
      await autoResolveDependentObstacles(autoSatisfiedDependents, task.id, updates.updated_by ?? null)
    } catch (error) {
      logger.error('Failed to auto-satisfy preceding-task conditions', {
        taskId,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  if (shouldRecordTaskSnapshot(previousTask, task)) {
    await recordTaskProgressSnapshot(task, {
      recordedBy: updates.updated_by ?? null,
    }, previousTask)
  }

  await notifyTaskAssignmentChange(previousTask, task)

  await finalizeTaskWrite(task, previousTask)
  return { task, participantUnit }
}

export async function closeTaskInMainChain(
  taskId: string,
  expectedVersion: number | undefined,
  actorId?: string | null,
) {
  return updateTaskInMainChain(
    taskId,
    {
      status: 'completed',
      updated_by: actorId ?? null,
    } as Partial<Task>,
    expectedVersion,
  )
}

export async function reopenTaskInMainChain(
  taskId: string,
  progress: number,
  expectedVersion: number | undefined,
  actorId?: string | null,
) {
  const previousTask = await getTask(taskId)
  if (!previousTask) return null

  const task = await reopenTaskRecord(
    taskId,
    {
      progress,
      updated_by: actorId ?? null,
    } as Partial<Task>,
    expectedVersion,
    { skipSnapshotWrite: true },
  )
  if (!task) return null

  if (shouldRecordTaskSnapshot(previousTask, task)) {
    await recordTaskProgressSnapshot(task, {
      recordedBy: actorId ?? null,
    }, previousTask)
  }

  await finalizeTaskWrite(task, previousTask)
  return { task, participantUnit: null }
}
