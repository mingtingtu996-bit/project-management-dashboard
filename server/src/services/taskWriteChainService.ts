import { randomUUID } from 'crypto'
import type { Task } from '../types/db.js'
import { logger } from '../middleware/logger.js'
import {
  isDatabaseTransactionActive,
  query as rawQuery,
  registerDatabasePostCommitEffect,
} from '../database.js'
import { SystemAnomalyService } from './systemAnomalyService.js'
import { WarningService } from './warningService.js'
import { isCompletedTask } from '../utils/taskStatus.js'
import { shouldRecordTaskProgressSnapshot } from '../utils/taskProgressSnapshotPolicy.js'
import {
  ExecutionFactIntent,
  applyExecutionFactGovernance,
  stripExecutionFactManagedFields,
} from './planningScheduleGovernanceService.js'
import { hasAnyScopeObjectId, validateScopeObjectTypes, validateTaskScopeConsistency } from './engineeringObjectService.js'
import { validateTaskStandardFields } from './taskStandardModelService.js'
import { inferWbsNodeType, deriveWbsFlags, validateCategoryNodeTypeConsistency, type WbsNodeType } from './wbsSemanticService.js'
import { assertTransition } from './statusDictionaryService.js'
import { collectDurationExperienceSampleFromTask, retireDurationExperienceSampleForTask } from './durationExperienceService.js'
import { enqueueDurationExperienceCollectionFailure } from './durationExperienceReconciliationService.js'
import { taskWriteFinalizationOutboxDrainJob } from '../jobs/taskWriteFinalizationOutboxDrainJob.js'
import { applyTaskMaterialLifecycleFeedback } from './materialTaskFeedbackService.js'
import { createTaskWithCodeInTransaction, createTasksWithCodeInWizardBatchTransaction, reopenTaskWithCodeInTransaction, updateTaskWithCodeInTransaction } from './taskCodeTransactionService.js'
import {
  inferDurationContributionMode,
  normalizeDurationContributionMode,
} from '../seeds/durationContributionMode.js'
import {
  applyTaskStandardInferenceForWrite,
  attachTitleWeakFalsePositiveFeedback,
  buildTitleWeakFalsePositiveFeedback,
} from './taskStandardInferenceService.js'
import {
  createTask as createTaskRecord,
  deleteTask as deleteTaskRecord,
  executeSQL,
  getMembers,
  getTask,
  recordTaskProgressSnapshot,
  supabase,
} from './dbService.js'
import { persistNotification } from './warningChainService.js'
import { writeLog, writeLogs } from './changeLogs.js'
import { syncAcceptancePlansFromCanonicalTask } from './acceptanceTaskSyncService.js'
import { syncExecutionGateSeedTemplatesForTask } from './executionGateSeedService.js'
import { clearCriticalPathCache } from './criticalPathHelpers.js'
import { clearProjectCriticalPathSnapshotCache } from './projectCriticalPathService.js'

type TransactionClientLike = {
  query: (sql: string, params?: unknown[]) => Promise<{ rows?: unknown[]; rowCount?: number }>
  release?: () => void
}

function clearTaskCriticalPathReadCaches(projectId?: string | null): void {
  const normalizedProjectId = String(projectId ?? '').trim()
  if (!normalizedProjectId) return
  clearCriticalPathCache(normalizedProjectId)
  clearProjectCriticalPathSnapshotCache(normalizedProjectId)
}

type ParticipantUnitRecord = {
  id: string
  unit_name: string
}

type ParticipantUnitLookupRecord = ParticipantUnitRecord & {
  unit_status: string
}

type EngineeringCategoryLookupRecord = {
  id: string
  project_id?: string | null
  category_type?: string | null
  category_name?: string | null
  enabled?: boolean | null
  standard_work_code?: string | null
  standard_work_name?: string | null
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

type TaskWriteOptions = {
  executionFactIntent?: ExecutionFactIntent
  executionFactEventDate?: string | null
  allowManualActualDates?: boolean
}

type TaskCreateOptions = {
  deferPostCreateEffects?: boolean
  postCreateEffectReason?: string
  trustPrevalidatedScope?: boolean
  skipStandardInference?: boolean
  transactionClient?: TransactionClientLike | null
  externalParentContext?: {
    id: string
    clientRowId?: string
    wbsNodeType: WbsNodeType | null
    wbsCode: string
    wbsPath: string
    childCount: number
  } | null
}

export type WizardBatchTaskCreateItem = {
  clientRowId: string
  parentClientRowId?: string | null
  payload: TaskCreateChainInput
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

async function applyMilestoneUnmarkGovernance(previousTask: Task, task: Task, actorId?: string | null): Promise<void> {
  const projectId = String(task.project_id ?? previousTask.project_id ?? '').trim()
  const taskId = String(task.id ?? previousTask.id ?? '').trim()
  if (!projectId || !taskId) return

  await writeLogs([
    {
      project_id: projectId,
      entity_type: 'task',
      entity_id: taskId,
      field_name: 'is_milestone',
      old_value: true,
      new_value: false,
      change_reason: 'milestone_unmarked_current_fact',
      changed_by: actorId ?? null,
      change_source: 'manual_adjusted',
    },
    {
      project_id: projectId,
      entity_type: 'task',
      entity_id: taskId,
      field_name: 'milestone_level',
      old_value: previousTask.milestone_level ?? null,
      new_value: null,
      change_reason: 'milestone_unmarked_current_fact',
      changed_by: actorId ?? null,
      change_source: 'manual_adjusted',
    },
  ])

  const linkedTasks = await executeSQL<Array<{ id: string; milestone_id?: string | null }>[number]>(
    'SELECT id, milestone_id FROM tasks WHERE project_id = ? AND milestone_id = ?',
    [projectId, taskId],
  )
  if (linkedTasks.length === 0) return

  await executeSQL(
    'UPDATE tasks SET milestone_id = NULL, updated_at = ? WHERE project_id = ? AND milestone_id = ?',
    [new Date().toISOString(), projectId, taskId],
  )
  await writeLogs(linkedTasks.map((linkedTask) => ({
    project_id: projectId,
    entity_type: 'task',
    entity_id: String(linkedTask.id),
    field_name: 'milestone_id',
    old_value: taskId,
    new_value: null,
    change_reason: 'milestone_unmarked_relation_detached',
    changed_by: actorId ?? null,
    change_source: 'manual_adjusted',
  })))
}

const SCOPE_OBJECT_ALIAS_PAIRS = [
  ['engineering_object_id', 'engineeringObjectId'],
  ['phase_object_id', 'phaseObjectId'],
  ['section_object_id', 'sectionObjectId'],
  ['building_object_id', 'buildingObjectId'],
  ['basement_object_id', 'basementObjectId'],
  ['floor_object_id', 'floorObjectId'],
  ['physical_zone_object_id', 'physicalZoneObjectId'],
  ['functional_area_object_id', 'functionalAreaObjectId'],
] as const

function normalizeScopeObjectAliases(payload: Record<string, unknown>) {
  for (const [snake, camel] of SCOPE_OBJECT_ALIAS_PAIRS) {
    if (!(snake in payload) && camel in payload) {
      payload[snake] = payload[camel] ?? null
    }
  }
}

function readTaskWriteMetadata(payload: Record<string, unknown>) {
  const value = payload.standard_task_metadata
  if (value && typeof value === 'object' && !Array.isArray(value)) return { ...(value as Record<string, unknown>) }
  if (typeof value === 'string' && value.trim().startsWith('{')) {
    try {
      const parsed = JSON.parse(value)
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? { ...(parsed as Record<string, unknown>) }
        : {}
    } catch {
      return {}
    }
  }
  return {}
}

function ensureDurationContributionModeForWrite(payload: Record<string, unknown>) {
  const metadata = readTaskWriteMetadata(payload)
  const mode = normalizeDurationContributionMode(
    payload.duration_contribution_mode
      ?? payload.durationContributionMode
      ?? metadata.durationContributionMode
      ?? metadata.duration_contribution_mode,
  ) ?? inferDurationContributionMode({
    name: payload.title ?? payload.standard_work_name,
    metadata,
    planItemKind: payload.plan_item_kind ?? metadata.planItemKind ?? metadata.plan_item_kind,
    relationRole: payload.relation_role ?? metadata.relationRole ?? metadata.relation_role,
  })

  payload.duration_contribution_mode = mode
  payload.standard_task_metadata = {
    ...metadata,
    durationContributionMode: mode,
  }
  delete payload.durationContributionMode
}

function normalizeWbsNodeType(value: unknown): WbsNodeType | null {
  const normalized = typeof value === 'string' ? value.trim() : ''
  const allowed: WbsNodeType[] = ['division', 'sub_division', 'item_work', 'process', 'activity_step', 'custom']
  return allowed.includes(normalized as WbsNodeType) ? normalized as WbsNodeType : null
}

async function validateWbsCategoryConsistencyForWrite(
  projectId: string,
  payload: Record<string, unknown>,
  categoryLookup?: Map<string, EngineeringCategoryLookupRecord>,
): Promise<string | null> {
  if (
    payload.wbs_node_type !== undefined
    && payload.wbs_node_type !== null
    && String(payload.wbs_node_type).trim() !== ''
    && !normalizeWbsNodeType(payload.wbs_node_type)
  ) {
    return 'wbs_node_type 必须是 division/sub_division/item_work/process/activity_step/custom 之一'
  }

  const categoryId = typeof payload.engineering_category_id === 'string'
    ? payload.engineering_category_id.trim()
    : ''
  if (!categoryId) return null

  let data: unknown = categoryLookup?.get(categoryId) ?? null
  let error: { message?: string | null } | null = null
  if (!categoryLookup) {
    const result = await supabase
      .from('engineering_categories')
      .select('id, project_id, category_type, category_name, enabled, standard_work_code, standard_work_name')
      .eq('id', categoryId)
      .or(`project_id.eq.${projectId},project_id.is.null`)
      .maybeSingle()
    data = result.data
    error = result.error
  }

  if (error) return `engineering_category_id 校验失败: ${error.message}`
  if (!data) return `engineering_category_id 引用的工程分类不存在: ${categoryId}`

  const category = data as any
  if (category.project_id && String(category.project_id) !== projectId) {
    return `engineering_category_id 引用的工程分类不属于当前项目: ${categoryId}`
  }
  if (category.enabled === false) {
    return `engineering_category_id 引用的工程分类已停用: ${categoryId}`
  }

  const categoryType = normalizeWbsNodeType(category.category_type)
  const nodeType = normalizeWbsNodeType(payload.wbs_node_type)
  const consistencyError = validateCategoryNodeTypeConsistency(categoryType, nodeType)
  if (consistencyError) return consistencyError

  payload.standard_work_code = category.standard_work_code ?? null
  payload.standard_work_name = category.standard_work_name ?? category.category_name ?? null
  return null
}

async function buildEngineeringCategoryLookupForWizardBatch(
  projectId: string,
  inputs: TaskCreateChainInput[],
): Promise<Map<string, EngineeringCategoryLookupRecord> | undefined> {
  const categoryIds = uniqueStrings(inputs.map((input) => {
    const value = (input as unknown as Record<string, unknown>).engineering_category_id
    return typeof value === 'string' ? value : ''
  }))
  if (categoryIds.length === 0) return undefined

  const { data, error } = await supabase
    .from('engineering_categories')
    .select('id, project_id, category_type, category_name, enabled, standard_work_code, standard_work_name')
    .eq('project_id', projectId)
    .in('id', categoryIds)

  if (error) {
    throw Object.assign(new Error(`engineering_category_id 校验失败: ${error.message}`), {
      statusCode: 400,
      code: 'WBS_CATEGORY_CONFLICT',
    })
  }

  return new Map((data ?? []).map((row) => {
    const category = row as EngineeringCategoryLookupRecord
    return [String(category.id), category]
  }))
}

function uniqueRecipients(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => Boolean(value && value.trim())))]
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return [...new Set(values.map((value) => String(value ?? '').trim()).filter(Boolean))]
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

async function queuePassiveReorderDetection(projectId: string, taskId: string): Promise<void> {
  await systemAnomalyService.enqueuePassiveReorderDetection(projectId)
  logger.debug('Passive reorder detection queued', { projectId, taskId })
}

async function runPostCommitTaskSideEffect(label: string, taskId: string, effect: () => Promise<void>): Promise<void> {
  const guardedEffect = async () => {
    try {
      await effect()
    } catch (error) {
      logger.warn(`Post-commit task side effect failed: ${label}`, {
        taskId,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }
  if (isDatabaseTransactionActive()) {
    await registerDatabasePostCommitEffect(`task:${label}:${taskId}`, guardedEffect)
    return
  }
  await guardedEffect()
}

async function lookupParticipantUnitById(projectId: string, unitId: string) {
  const { data, error } = await supabase
    .from('participant_units')
    .select('id, unit_name, project_id, unit_status')
    .eq('id', unitId)
    .eq('project_id', projectId)
    .single()

  if (error) {
    const message = String(error.message ?? '').trim().toLowerCase()
    if (message.includes('no rows')) {
      return null
    }
    throw new Error(error.message ?? 'Failed to load participant unit')
  }

  const row = data as { id?: string | null; unit_name?: string | null; project_id?: string | null; unit_status?: string | null } | null
  if (!row?.id) {
    return null
  }

  const rowProjectId = normalizeUnitLabel(row.project_id)
  if (rowProjectId !== projectId) {
    return null
  }

  return {
    id: String(row.id),
    unit_name: normalizeUnitLabel(row.unit_name),
    unit_status: normalizeUnitLabel(row.unit_status) || 'active',
  }
}

async function resolveActiveParticipantUnit(projectId: string, unitId?: string | null): Promise<ParticipantUnitLookupRecord | null> {
  const normalizedUnitId = normalizeUnitLabel(unitId)
  if (!normalizedUnitId) return null

  const matched = await lookupParticipantUnitById(projectId, normalizedUnitId)
  if (!matched || matched.unit_status !== 'active') {
    throw Object.assign(new Error('participant_unit_id must reference an active participant unit in the current project'), {
      statusCode: 400,
      code: 'PARTICIPANT_UNIT_NOT_FOUND',
    })
  }

  return matched
}

async function persistTaskParticipantUnit(
  taskId: string,
  projectId: string,
  unitId?: string | null,
  userId?: string | null,
  prevalidatedUnit?: ParticipantUnitLookupRecord | null,
  transactionClient?: TransactionClientLike | null,
) {
  if (!projectId) return null

  const normalizedUnitId = normalizeUnitLabel(unitId)
  const matched = normalizedUnitId ? prevalidatedUnit ?? await resolveActiveParticipantUnit(projectId, normalizedUnitId) : null

  if (transactionClient || isDatabaseTransactionActive()) {
    const execute = transactionClient?.query.bind(transactionClient) ?? rawQuery
    await execute(
      'UPDATE tasks SET participant_unit_id = $1, updated_by = $2 WHERE id = $3 AND project_id = $4',
      [matched?.id ?? null, userId ?? null, taskId, projectId],
    )
  } else {
    const { error } = await supabase
      .from('tasks')
      .update({
        participant_unit_id: matched?.id ?? null,
        updated_by: userId ?? null,
      })
      .eq('id', taskId)
      .eq('project_id', projectId)

    if (error) throw new Error(error.message)
  }
  return matched ? { id: matched.id, unit_name: matched.unit_name } : null
}

async function loadAutoSatisfiedDependentConditions(completedTaskId: string, projectId: string) {
  const relationResult = await rawQuery(
    `SELECT relation.condition_id
       FROM public.task_preceding_relations relation
       JOIN public.task_conditions condition_row ON condition_row.id = relation.condition_id
      WHERE relation.task_id = $1
        AND condition_row.project_id = $2`,
    [completedTaskId, projectId],
  )
  const relationRows = relationResult.rows as Array<{ condition_id: string }>
  const relationConditionIds = [...new Set(relationRows.map((row) => String(row.condition_id)).filter(Boolean))]

  const relationConditions = relationConditionIds.length > 0
    ? await executeSQL<{ id: string; task_id: string }>(
        `SELECT id, task_id FROM task_conditions WHERE id IN (${relationConditionIds.map(() => '?').join(', ')}) AND is_satisfied = ? AND project_id = ?`,
        [...relationConditionIds, false, projectId],
      )
    : []

  return relationConditions
    .map((item) => ({
      condition_id: String(item.id),
      task_id: String(item.task_id),
    }))
    .filter((item, index, rows) => rows.findIndex((row) => row.condition_id === item.condition_id) === index)
}

async function autoSatisfyDependentConditions(completedTaskId: string, projectId: string) {
  const dependentConditions = await loadAutoSatisfiedDependentConditions(completedTaskId, projectId)
  if (dependentConditions.length === 0) return dependentConditions

  const conditionIds = dependentConditions.map((item) => item.condition_id)
  const placeholders = conditionIds.map(() => '?').join(', ')
  const timestamp = new Date().toISOString().slice(0, 19).replace('T', ' ')

  await executeSQL(
    `UPDATE task_conditions SET is_satisfied = true, updated_at = ? WHERE id IN (${placeholders}) AND project_id = ?`,
    [timestamp, ...conditionIds, projectId],
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
      .filter((member) => member.permission_level === 'owner')
      .map((member) => member.user_id),
  )

  if (recipients.length === 0) return

  const taskIds = [...new Set(dependents.map((item) => item.task_id).filter(Boolean))]
  const tasks = taskIds.length > 0
    ? await executeSQL<{ id: string; title?: string | null }>(
      `SELECT id, title FROM tasks WHERE id IN (${taskIds.map(() => '?').join(', ')}) AND project_id = ?`,
      [...taskIds, projectId],
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
  projectId: string,
  actorId?: string | null,
) {
  const taskIds = [...new Set(dependents.map((item) => item.task_id).filter(Boolean))]
  if (taskIds.length === 0) return [] as AutoResolvedDependentObstacle[]

  const obstacles = await executeSQL<AutoResolvableTaskObstacle>(
    `SELECT id, task_id, project_id, title, description, severity, status, estimated_resolve_date
       FROM task_obstacles
      WHERE task_id IN (${taskIds.map(() => '?').join(', ')})
        AND project_id = ?
        AND status IN (?, ?)`,
    [...taskIds, projectId, '待处理', '处理中'],
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
        project_id: obstacle.project_id ?? null,
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

type TaskWriteFinalizationStep =
  | 'evaluate_task_warning'
  | 'close_delay_source_risks'
  | 'infer_structured_causes'
  | 'collect_duration_experience'
  | 'enqueue_duration_experience_reconciliation'
  | 'retire_duration_experience'
  | 'apply_material_lifecycle_feedback'
  | 'queue_passive_reorder_detection'

export class TaskWriteFinalizationIncompleteError extends Error {
  readonly details: {
    taskId: string
    projectId: string | null
    failedSteps: Array<{ step: TaskWriteFinalizationStep; error: string }>
  }

  constructor(task: Task, failedSteps: Array<{ step: TaskWriteFinalizationStep; error: string }>) {
    super(`task_write_finalization_incomplete:${failedSteps.map(({ step }) => step).join(',')}`)
    this.name = 'TaskWriteFinalizationIncompleteError'
    this.details = {
      taskId: String(task.id),
      projectId: task.project_id ? String(task.project_id) : null,
      failedSteps,
    }
  }
}

async function finalizeTaskWrite(task: Task, previousTask?: Task | null, actorId?: string | null) {
  const failedSteps: Array<{ step: TaskWriteFinalizationStep; error: string }> = []
  const recordFailure = (step: TaskWriteFinalizationStep, error: unknown) => {
    failedSteps.push({
      step,
      error: (error instanceof Error ? error.message : String(error ?? 'unknown error')).slice(0, 2_000),
    })
  }

  try {
    await warningService.evaluate({
      type: 'task',
      task: {
        id: task.id,
        status: task.status,
        progress: task.progress,
      },
    })
  } catch (error) {
    logger.warn('Failed to evaluate warnings after task write', {
      taskId: task.id,
      error: error instanceof Error ? error.message : String(error),
    })
    recordFailure('evaluate_task_warning', error)
  }

  if (justCompletedTask(previousTask, task)) {
    try {
      const { closeDelaySourceRisksForCompletedTask } = await import('./upgradeChainService.js')
      await closeDelaySourceRisksForCompletedTask(task.id, task.project_id)
    } catch (error) {
      logger.warn('Failed to auto-close delay source risks after task completion', {
        taskId: task.id,
        error: error instanceof Error ? error.message : String(error),
      })
      recordFailure('close_delay_source_risks', error)
    }

    try {
      const { inferAndPersistTaskStructuredCauseAttributions } = await import('./structuredCauseAttributionService.js')
      await inferAndPersistTaskStructuredCauseAttributions({
        task: task as unknown as Record<string, unknown>,
      })
    } catch (error) {
      logger.warn('Failed to infer structured causes after task completion', {
        taskId: task.id,
        error: error instanceof Error ? error.message : String(error),
      })
      recordFailure('infer_structured_causes', error)
    }

    try {
      await collectDurationExperienceSampleFromTask(task, {
        previousTask,
        actorId,
        trigger: 'task_completion',
      })
    } catch (error) {
      logger.warn('Failed to collect duration experience sample after task completion', {
        taskId: task.id,
        error: error instanceof Error ? error.message : String(error),
      })
      recordFailure('collect_duration_experience', error)
      try {
        await enqueueDurationExperienceCollectionFailure({
          projectId: String(task.project_id ?? ''),
          taskId: String(task.id),
          actorId,
          trigger: 'task_completion',
          error,
        })
      } catch (enqueueError) {
        logger.warn('Failed to enqueue duration experience sample reconciliation', {
          taskId: task.id,
          error: enqueueError instanceof Error ? enqueueError.message : String(enqueueError),
        })
        recordFailure('enqueue_duration_experience_reconciliation', enqueueError)
      }
    }
  } else if (
    previousTask
    && isCompletedTask({ status: previousTask.status, progress: previousTask.progress })
    && !isCompletedTask({ status: task.status, progress: task.progress })
  ) {
    try {
      await retireDurationExperienceSampleForTask(task.id, {
        actorId,
        trigger: 'task_reopened_or_uncompleted',
      })
    } catch (error) {
      logger.warn('Failed to retire duration experience sample after task reopen', {
        taskId: task.id,
        error: error instanceof Error ? error.message : String(error),
      })
      recordFailure('retire_duration_experience', error)
    }
  }

  try {
    await applyTaskMaterialLifecycleFeedback({ previousTask, task, actorId })
  } catch (error) {
    logger.warn('Failed to reflect task execution into linked materials', {
      taskId: task.id,
      error: error instanceof Error ? error.message : String(error),
    })
    recordFailure('apply_material_lifecycle_feedback', error)
  }

  try {
    await queuePassiveReorderDetection(task.project_id, task.id)
  } catch (error) {
    logger.warn('Failed to queue passive reorder detection after task write', {
      taskId: task.id,
      error: error instanceof Error ? error.message : String(error),
    })
    recordFailure('queue_passive_reorder_detection', error)
  }

  if (failedSteps.length > 0) {
    throw new TaskWriteFinalizationIncompleteError(task, failedSteps)
  }
}

export async function finalizeTaskWriteFromLegacyMutation(
  task: Task,
  previousTask?: Task | null,
  actorId?: string | null,
) {
  await finalizeTaskWrite(task, previousTask, actorId)
}

async function syncExecutionGateSeedsBestEffort(task: Task, actorId?: string | null) {
  try {
    await syncExecutionGateSeedTemplatesForTask({
      task: task as unknown as Partial<Task> & Record<string, unknown>,
      actorId: actorId ?? null,
    })
  } catch (error) {
    logger.warn('Failed to sync seed-backed execution gates for task', {
      taskId: task.id,
      projectId: task.project_id,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

export async function createTaskInMainChain(
  input: TaskCreateChainInput,
  actorId?: string | null,
  options: TaskCreateOptions = {},
): Promise<TaskWriteResult> {
  const effectiveActorId = actorId ?? input.created_by ?? null
  const inputRecord = input as unknown as Record<string, unknown>
  normalizeScopeObjectAliases(inputRecord)

  // v1.4 range-tree: validate object types and parent chain.
  if (!options.trustPrevalidatedScope) {
    const typeError = await validateScopeObjectTypes(String(input.project_id ?? ''), input as unknown as Record<string, string | null | undefined>)
    if (typeError) {
      throw Object.assign(new Error(typeError), { statusCode: 400, code: 'SCOPE_OBJECT_TYPE_MISMATCH' })
    }

    const consistencyError = await validateTaskScopeConsistency(String(input.project_id ?? ''), input as unknown as Record<string, string | null | undefined>)
    if (consistencyError) {
      throw Object.assign(new Error(consistencyError), { statusCode: 400, code: 'SCOPE_CONSISTENCY_ERROR' })
    }
  }

  // v1.4.3: Standard model validation
  const stdResult = validateTaskStandardFields(input as any, 'normal')
  if (!stdResult.valid) {
    throw Object.assign(new Error(stdResult.errors.join('; ')), { statusCode: 400, code: 'TASK_STANDARD_VALIDATION_FAILED' })
  }
  if (stdResult.normalizedStatus) {
    (input as any).status = stdResult.normalizedStatus
  }

  // v1.4.2: WBS semantic computation
  const parentId = (input as any).parent_id ?? null
  let parentWbsType: any = null
  let parentWbsCode = ''
  let parentWbsPath: string | null = null
  let siblingCount = 0
  if (parentId) {
    const parentTask: any[] = await executeSQL<any>(
      'SELECT wbs_node_type, wbs_code, wbs_path FROM tasks WHERE id = ? AND project_id = ?',
      [parentId, String(input.project_id ?? '')],
    )
    if (parentTask[0]) {
      parentWbsType = parentTask[0].wbs_node_type ?? null
      parentWbsCode = String(parentTask[0].wbs_code ?? '')
      parentWbsPath = String(parentTask[0].wbs_path ?? null) || null
    }
    const sibs: any[] = await executeSQL<any>(
      'SELECT COUNT(*) as count FROM tasks WHERE parent_id = ? AND project_id = ?',
      [parentId, String(input.project_id ?? '')],
    )
    siblingCount = Number(sibs?.[0]?.count ?? 0)
  } else {
    const sibs: any[] = await executeSQL<any>(
      'SELECT COUNT(*) as count FROM tasks WHERE project_id = ? AND parent_id IS NULL',
      [String(input.project_id ?? '')],
    )
    siblingCount = Number(sibs?.[0]?.count ?? 0)
  }
  const rawWbsType = (input as any).wbs_node_type
  const explicitWbsType = normalizeWbsNodeType(rawWbsType)
  if (rawWbsType !== undefined && rawWbsType !== null && String(rawWbsType).trim() !== '' && !explicitWbsType) {
    throw Object.assign(
      new Error('wbs_node_type 必须是 division/sub_division/item_work/process/activity_step/custom 之一'),
      { statusCode: 400, code: 'WBS_NODE_TYPE_INVALID' },
    )
  }
  if (parentWbsType === 'process' && explicitWbsType !== 'activity_step') {
    throw Object.assign(
      new Error('process 下新增子级必须明确为 activity_step，请选择新增作业步骤或先转换父级类型'),
      { statusCode: 400, code: 'WBS_CHILD_TYPE_REQUIRES_ACTIVITY_STEP' },
    )
  }
  if (parentWbsType === 'activity_step') {
    throw Object.assign(
      new Error('activity_step 是最细执行层级，不允许继续新增子级'),
      { statusCode: 400, code: 'WBS_ACTIVITY_STEP_CHILD_NOT_ALLOWED' },
    )
  }
  const wbsType = inferWbsNodeType(parentWbsType, false, explicitWbsType)
  const wbsFlags = deriveWbsFlags(wbsType, false)
  // Pre-generate task ID so wbs_path uses the real ID
  const taskId = (input as any).id || randomUUID()
  ;(input as any).id = taskId
  const newWbsCode = parentWbsCode ? `${parentWbsCode}.${siblingCount + 1}` : `${siblingCount + 1}`
  const newWbsPath = parentWbsPath ? `${parentWbsPath}/${taskId}` : `/${taskId}`
  const newWbsLevel = parentWbsCode ? parentWbsCode.split('.').length + 1 : 1
  ;(input as any).wbs_node_type = wbsType
  ;(input as any).wbs_path = newWbsPath
  ;(input as any).wbs_level = newWbsLevel
  ;(input as any).wbs_code = newWbsCode
  ;(input as any).is_leaf = wbsFlags.is_leaf
  ;(input as any).is_wbs_summary = wbsFlags.is_wbs_summary
  ;(input as any).is_executable = wbsFlags.is_executable
  ensureDurationContributionModeForWrite(inputRecord)

  const createInference = options.skipStandardInference
    ? { standardMapped: Boolean((input as any).standard_work_code), scopeCoverageMapped: false }
    : await applyTaskStandardInferenceForWrite({
      projectId: String(input.project_id ?? ''),
      payload: inputRecord,
    })

  const wbsConsistencyError = await validateWbsCategoryConsistencyForWrite(
    String(input.project_id ?? ''),
    input as unknown as Record<string, unknown>,
  )
  if (wbsConsistencyError) {
    throw Object.assign(new Error(wbsConsistencyError), { statusCode: 400, code: 'WBS_CATEGORY_CONFLICT' })
  }
  if ((input as any).engineering_category_id) {
    delete (input as any).standardWorkCode
    delete (input as any).standardWorkName
  } else if (!(input as any).template_id && !createInference.standardMapped) {
    delete (input as any).standard_work_code
    delete (input as any).standard_work_name
    delete (input as any).standardWorkCode
    delete (input as any).standardWorkName
  }

  const stdAfterWbsResult = validateTaskStandardFields(input as any, 'normal')
  if (!stdAfterWbsResult.valid) {
    throw Object.assign(new Error(stdAfterWbsResult.errors.join('; ')), { statusCode: 400, code: 'TASK_STANDARD_VALIDATION_FAILED' })
  }

  // v1.4.1: Tasks must have at least one scope dimension
  if (!hasAnyScopeObjectId(input as unknown as Record<string, unknown>)) {
    throw Object.assign(
      new Error('任务必须至少归属一个工程范围对象（分期/标段/楼栋/楼层/区域/主要施工对象）'),
      { statusCode: 400, code: 'SCOPE_OBJECT_REQUIRED' },
    )
  }

  const prevalidatedParticipantUnit = await resolveActiveParticipantUnit(
    String(input.project_id ?? ''),
    input.participant_unit_id ?? null,
  )
  if ('participant_unit_id' in inputRecord) {
    ;(input as any).participant_unit_id = prevalidatedParticipantUnit?.id ?? null
  }

  const governedExecutionFacts = applyExecutionFactGovernance({
    intent: ExecutionFactIntent.TaskCommit,
    previousTask: {
      status: 'todo',
      progress: 0,
      actual_start_date: null,
      actual_end_date: null,
      first_progress_at: null,
    },
    patch: inputRecord,
    now: new Date().toISOString(),
  })
  for (const key of Object.keys(inputRecord)) delete inputRecord[key]
  Object.assign(inputRecord, governedExecutionFacts.patch)

  // v1.4.4: Single transaction for task + code + history + lineage
  const { task: taskData } = await createTaskWithCodeInTransaction(input as any, effectiveActorId)
  const task = taskData as unknown as Task

  if (parentId) {
    await refreshTaskWbsFlags(parentId)
  }
  const participantUnit = normalizeUnitLabel(input.participant_unit_id) || prevalidatedParticipantUnit
    ? await persistTaskParticipantUnit(
      task.id,
      task.project_id,
      input.participant_unit_id ?? null,
      effectiveActorId,
      prevalidatedParticipantUnit,
    )
    : null

  if (options.deferPostCreateEffects) {
    logger.debug('Deferred post-create task side effects for batch generation', {
      taskId: task.id,
      projectId: task.project_id,
      reason: options.postCreateEffectReason ?? null,
    })
  } else {
    await runPostCommitTaskSideEffect('sync_create_execution_gate_seeds', task.id, async () => {
      await syncExecutionGateSeedsBestEffort(task, effectiveActorId)
    })

    await runPostCommitTaskSideEffect('record_create_progress_snapshot', task.id, async () => {
      await recordTaskProgressSnapshot(task, {
        recordedBy: effectiveActorId,
        notes: Boolean(task.is_milestone)
          ? '里程碑已创建并纳入快照链路'
          : '任务已创建并纳入快照链路',
      })
    })

    await runPostCommitTaskSideEffect('queue_create_reorder_detection', task.id, async () => {
      await queuePassiveReorderDetection(task.project_id, task.id)
    })
  }
  clearTaskCriticalPathReadCaches(task.project_id)
  return { task, participantUnit }
}

export async function createTasksInWizardBatch(
  items: WizardBatchTaskCreateItem[],
  actorId?: string | null,
  options: TaskCreateOptions = {},
): Promise<TaskWriteResult[]> {
  if (items.length === 0) return []

  const effectiveActorId = actorId ?? items[0]?.payload.created_by ?? null
  const projectIds = uniqueStrings(items.map((item) => String(item.payload.project_id ?? '')))
  if (projectIds.length !== 1) {
    throw Object.assign(new Error('Wizard batch task creation requires exactly one project'), {
      statusCode: 400,
      code: 'WIZARD_BATCH_PROJECT_SCOPE_INVALID',
    })
  }
  const projectId = projectIds[0]

  const preparedInputs: TaskCreateChainInput[] = []
  const engineeringCategoryLookup = await buildEngineeringCategoryLookupForWizardBatch(
    projectId,
    items.map((item) => item.payload),
  )
  const participantUnits: Array<ParticipantUnitLookupRecord | null> = []
  const taskContextByClientRowId = new Map<string, {
    id: string
    wbsNodeType: WbsNodeType | null
    wbsCode: string
    wbsPath: string
    childCount: number
    hasChildren: boolean
  }>()
  const childCountByClientRowId = new Map<string, number>()
  for (const item of items) {
    const parentKey = String(item.parentClientRowId ?? '').trim()
    if (parentKey) childCountByClientRowId.set(parentKey, (childCountByClientRowId.get(parentKey) ?? 0) + 1)
  }
  const externalParentContext = options.externalParentContext
  if (externalParentContext) {
    const externalParentKey = String(
      externalParentContext.clientRowId ?? externalParentContext.id,
    ).trim()
    if (externalParentKey) {
      taskContextByClientRowId.set(externalParentKey, {
        id: externalParentContext.id,
        wbsNodeType: externalParentContext.wbsNodeType,
        wbsCode: externalParentContext.wbsCode,
        wbsPath: externalParentContext.wbsPath,
        childCount: Math.max(0, Math.floor(externalParentContext.childCount)),
        hasChildren: true,
      })
    }
  }

  for (const item of items) {
    const input = item.payload
    const inputRecord = input as unknown as Record<string, unknown>
    normalizeScopeObjectAliases(inputRecord)

    if (!options.trustPrevalidatedScope) {
      const typeError = await validateScopeObjectTypes(projectId, input as unknown as Record<string, string | null | undefined>)
      if (typeError) {
        throw Object.assign(new Error(typeError), { statusCode: 400, code: 'SCOPE_OBJECT_TYPE_MISMATCH' })
      }

      const consistencyError = await validateTaskScopeConsistency(projectId, input as unknown as Record<string, string | null | undefined>)
      if (consistencyError) {
        throw Object.assign(new Error(consistencyError), { statusCode: 400, code: 'SCOPE_CONSISTENCY_ERROR' })
      }
    }

    const stdResult = validateTaskStandardFields(input as any, 'normal')
    if (!stdResult.valid) {
      throw Object.assign(new Error(stdResult.errors.join('; ')), { statusCode: 400, code: 'TASK_STANDARD_VALIDATION_FAILED' })
    }
    if (stdResult.normalizedStatus) {
      ;(input as any).status = stdResult.normalizedStatus
    }

    const parentContext = item.parentClientRowId ? taskContextByClientRowId.get(item.parentClientRowId) ?? null : null
    const parentId = (input as any).parent_id ?? parentContext?.id ?? null
    const rawWbsType = (input as any).wbs_node_type
    const explicitWbsType = normalizeWbsNodeType(rawWbsType)
    if (rawWbsType !== undefined && rawWbsType !== null && String(rawWbsType).trim() !== '' && !explicitWbsType) {
      throw Object.assign(
        new Error('wbs_node_type 必须是 division/sub_division/item_work/process/activity_step/custom 之一'),
        { statusCode: 400, code: 'WBS_NODE_TYPE_INVALID' },
      )
    }
    if (parentContext?.wbsNodeType === 'process' && explicitWbsType !== 'activity_step') {
      throw Object.assign(
        new Error('process 下新增子级必须明确为 activity_step，请选择新增作业步骤或先转换父级类型'),
        { statusCode: 400, code: 'WBS_CHILD_TYPE_REQUIRES_ACTIVITY_STEP' },
      )
    }
    if (parentContext?.wbsNodeType === 'activity_step') {
      throw Object.assign(
        new Error('activity_step 是最细执行层级，不允许继续新增子级'),
        { statusCode: 400, code: 'WBS_ACTIVITY_STEP_CHILD_NOT_ALLOWED' },
      )
    }

    const taskId = (input as any).id || randomUUID()
    ;(input as any).id = taskId
    ;(input as any).parent_id = parentId
    const siblingIndex = parentContext
      ? parentContext.childCount + 1
      : preparedInputs.filter((previous) => !(previous as any).parent_id).length + 1
    if (parentContext) parentContext.childCount += 1
    const wbsCode = parentContext?.wbsCode ? `${parentContext.wbsCode}.${siblingIndex}` : `${siblingIndex}`
    const wbsPath = parentContext?.wbsPath ? `${parentContext.wbsPath}/${taskId}` : `/${taskId}`
    const wbsLevel = parentContext?.wbsCode ? parentContext.wbsCode.split('.').length + 1 : 1
    const hasChildren = (childCountByClientRowId.get(item.clientRowId) ?? 0) > 0
    const wbsType = inferWbsNodeType(parentContext?.wbsNodeType ?? null, hasChildren, explicitWbsType)
    const wbsFlags = deriveWbsFlags(wbsType, hasChildren)
    ;(input as any).wbs_node_type = wbsType
    ;(input as any).wbs_path = wbsPath
    ;(input as any).wbs_level = wbsLevel
    ;(input as any).wbs_code = wbsCode
    ;(input as any).is_leaf = wbsFlags.is_leaf
    ;(input as any).is_wbs_summary = wbsFlags.is_wbs_summary
    ;(input as any).is_executable = wbsFlags.is_executable
    ensureDurationContributionModeForWrite(inputRecord)

    const createInference = options.skipStandardInference
      ? { standardMapped: Boolean((input as any).standard_work_code), scopeCoverageMapped: false }
      : await applyTaskStandardInferenceForWrite({
        projectId,
        payload: inputRecord,
      })

    const wbsConsistencyError = await validateWbsCategoryConsistencyForWrite(
      projectId,
      input as unknown as Record<string, unknown>,
      engineeringCategoryLookup,
    )
    if (wbsConsistencyError) {
      throw Object.assign(new Error(wbsConsistencyError), { statusCode: 400, code: 'WBS_CATEGORY_CONFLICT' })
    }
    if ((input as any).engineering_category_id) {
      delete (input as any).standardWorkCode
      delete (input as any).standardWorkName
    } else if (!(input as any).template_id && !createInference.standardMapped) {
      delete (input as any).standard_work_code
      delete (input as any).standard_work_name
      delete (input as any).standardWorkCode
      delete (input as any).standardWorkName
    }

    const stdAfterWbsResult = validateTaskStandardFields(input as any, 'normal')
    if (!stdAfterWbsResult.valid) {
      throw Object.assign(new Error(stdAfterWbsResult.errors.join('; ')), { statusCode: 400, code: 'TASK_STANDARD_VALIDATION_FAILED' })
    }

    if (!hasAnyScopeObjectId(input as unknown as Record<string, unknown>)) {
      throw Object.assign(
        new Error('任务必须至少归属一个工程范围对象（分期/标段/楼栋/楼层/区域/主要施工对象）'),
        { statusCode: 400, code: 'SCOPE_OBJECT_REQUIRED' },
      )
    }

    const prevalidatedParticipantUnit = await resolveActiveParticipantUnit(
      projectId,
      input.participant_unit_id ?? null,
    )
    if ('participant_unit_id' in inputRecord) {
      ;(input as any).participant_unit_id = prevalidatedParticipantUnit?.id ?? null
    }
    participantUnits.push(prevalidatedParticipantUnit)

    const governedExecutionFacts = applyExecutionFactGovernance({
      intent: ExecutionFactIntent.TaskCommit,
      previousTask: {
        status: 'todo',
        progress: 0,
        actual_start_date: null,
        actual_end_date: null,
        first_progress_at: null,
      },
      patch: inputRecord,
      now: new Date().toISOString(),
    })
    for (const key of Object.keys(inputRecord)) delete inputRecord[key]
    Object.assign(inputRecord, governedExecutionFacts.patch)

    preparedInputs.push(input)
    taskContextByClientRowId.set(item.clientRowId, {
      id: taskId,
      wbsNodeType: wbsType,
      wbsCode,
      wbsPath,
      childCount: 0,
      hasChildren,
    })
  }

  const created = await createTasksWithCodeInWizardBatchTransaction(
    preparedInputs as any,
    effectiveActorId,
    options.transactionClient,
  )
  const results: TaskWriteResult[] = []
  for (let index = 0; index < created.length; index += 1) {
    const task = created[index].task as unknown as Task
    const prevalidatedParticipantUnit = participantUnits[index] ?? null
    const participantUnit = normalizeUnitLabel(preparedInputs[index].participant_unit_id) || prevalidatedParticipantUnit
      ? await persistTaskParticipantUnit(
        task.id,
        task.project_id,
        preparedInputs[index].participant_unit_id ?? null,
        effectiveActorId,
        prevalidatedParticipantUnit,
        options.transactionClient,
      )
      : null
    results.push({ task, participantUnit })
  }

  logger.debug('Created wizard batch tasks through main write governance', {
    projectId,
    taskCount: results.length,
    reason: options.postCreateEffectReason ?? null,
    deferredPostCreateEffects: Boolean(options.deferPostCreateEffects),
  })
  clearTaskCriticalPathReadCaches(projectId)
  return results
}

export async function updateTaskInMainChain(
  taskId: string,
  updates: TaskWritePatch,
  expectedVersion?: number,
  options: TaskWriteOptions = {},
): Promise<TaskWriteResult | null> {
  const previousTask = await getTask(taskId)
  if (!previousTask) return null
  const updatesRecord = updates as unknown as Record<string, unknown>
  normalizeScopeObjectAliases(updatesRecord)
  if (!options.allowManualActualDates) {
    const strippedExecutionFacts = stripExecutionFactManagedFields(updatesRecord)
    if (strippedExecutionFacts.strippedFields.length > 0) {
      for (const key of Object.keys(updatesRecord)) delete updatesRecord[key]
      Object.assign(updatesRecord, strippedExecutionFacts.sanitized)
    }
  }

  // v1.4.3: Standard model validation — check merged state for structure row protection
  const mergedForValidation = { ...previousTask, ...updatesRecord } as Record<string, unknown>
  if (
    'wbs_node_type' in updatesRecord
    || 'parent_id' in updatesRecord
    || 'engineering_category_id' in updatesRecord
  ) {
    const childRows = await executeSQL<{ count?: number; cnt?: number }>(
      'SELECT COUNT(*) as count FROM tasks WHERE parent_id = ? AND project_id = ?',
      [taskId, String(previousTask.project_id ?? '')],
    )
    const hasChildren = Number(childRows?.[0]?.count ?? childRows?.[0]?.cnt ?? 0) > 0
    const wbsType = normalizeWbsNodeType(mergedForValidation.wbs_node_type)
    const flags = deriveWbsFlags(wbsType, hasChildren)
    Object.assign(mergedForValidation, flags)
    Object.assign(updates, flags)
  }

  const updateInference = await applyTaskStandardInferenceForWrite({
    projectId: String(previousTask.project_id ?? ''),
    payload: updatesRecord,
    existingTask: previousTask,
  })
  Object.assign(mergedForValidation, updatesRecord)

  const wbsConsistencyError = await validateWbsCategoryConsistencyForWrite(
    String(previousTask.project_id ?? ''),
    mergedForValidation,
  )
  if (wbsConsistencyError) {
    throw Object.assign(new Error(wbsConsistencyError), { statusCode: 400, code: 'WBS_CATEGORY_CONFLICT' })
  }
  if ('engineering_category_id' in updatesRecord) {
    ;(updates as any).standard_work_code = mergedForValidation.standard_work_code ?? null
    ;(updates as any).standard_work_name = mergedForValidation.standard_work_name ?? null
    delete (updates as any).standardWorkCode
    delete (updates as any).standardWorkName
    const falsePositiveFeedback = buildTitleWeakFalsePositiveFeedback({
      previousTask,
      nextRecord: mergedForValidation,
    })
    if (falsePositiveFeedback) {
      attachTitleWeakFalsePositiveFeedback({
        payload: updatesRecord,
        merged: mergedForValidation,
        feedback: falsePositiveFeedback,
      })
      ;(updates as any).standard_task_metadata = updatesRecord.standard_task_metadata
      ;(mergedForValidation as any).standard_task_metadata = updatesRecord.standard_task_metadata
    }
  } else if (!updateInference.standardMapped) {
    delete (updates as any).standard_work_code
    delete (updates as any).standard_work_name
    delete (updates as any).standardWorkCode
    delete (updates as any).standardWorkName
    delete updatesRecord.standard_work_code
    delete updatesRecord.standard_work_name
    delete updatesRecord.standardWorkCode
    delete updatesRecord.standardWorkName
  }
  const stdUpdateResult = validateTaskStandardFields(mergedForValidation as any, 'normal')
  if (!stdUpdateResult.valid) {
    throw Object.assign(new Error(stdUpdateResult.errors.join('; ')), { statusCode: 400, code: 'TASK_STANDARD_VALIDATION_FAILED' })
  }
  if (stdUpdateResult.normalizedStatus) {
    (updates as any).status = stdUpdateResult.normalizedStatus
  }

  // v1.4 range-tree: validate object types and parent chain.
  const typeError = await validateScopeObjectTypes(String(previousTask.project_id ?? ''), updates as unknown as Record<string, string | null | undefined>)
  if (typeError) {
    throw Object.assign(new Error(typeError), { statusCode: 400, code: 'SCOPE_OBJECT_TYPE_MISMATCH' })
  }

  const consistencyError = await validateTaskScopeConsistency(String(previousTask.project_id ?? ''), updates as unknown as Record<string, string | null | undefined>)
  if (consistencyError) {
    throw Object.assign(new Error(consistencyError), { statusCode: 400, code: 'SCOPE_CONSISTENCY_ERROR' })
  }

  // v1.4.5: Validate status transition
  if ((updates as any).status !== undefined && String((updates as any).status) !== String(previousTask.status)) {
    await assertTransition('task.lifecycle', String(previousTask.status ?? ''), String((updates as any).status ?? ''))
  }

  const isUnmarkingMilestone = Boolean(previousTask.is_milestone) && updatesRecord.is_milestone === false
  if (isUnmarkingMilestone) {
    ;(updates as any).milestone_level = null
    ;(updates as any).milestone_order = null
    ;(updatesRecord as any).milestone_level = null
    ;(updatesRecord as any).milestone_order = null
  }
  ensureDurationContributionModeForWrite(mergedForValidation)
  if (
    'duration_contribution_mode' in updatesRecord
    || 'durationContributionMode' in updatesRecord
    || 'standard_task_metadata' in updatesRecord
    || 'title' in updatesRecord
    || 'wbs_node_type' in updatesRecord
    || 'is_wbs_summary' in updatesRecord
  ) {
    ;(updates as Record<string, unknown>).duration_contribution_mode = mergedForValidation.duration_contribution_mode
    ;(updates as Record<string, unknown>).standard_task_metadata = mergedForValidation.standard_task_metadata
    ;(updatesRecord as Record<string, unknown>).duration_contribution_mode = mergedForValidation.duration_contribution_mode
    ;(updatesRecord as Record<string, unknown>).standard_task_metadata = mergedForValidation.standard_task_metadata
  }

  // v1.4.1: Check that the merged state has at least one scope object
  const merged = { ...previousTask, ...updatesRecord } as Record<string, unknown>
  if (!hasAnyScopeObjectId(merged)) {
    throw Object.assign(
      new Error('任务必须至少归属一个工程范围对象（分期/标段/楼栋/楼层/区域/主要施工对象）'),
      { statusCode: 400, code: 'SCOPE_OBJECT_REQUIRED' },
    )
  }

  const participantUnitWasProvided = Object.prototype.hasOwnProperty.call(updatesRecord, 'participant_unit_id')
  const prevalidatedParticipantUnit = participantUnitWasProvided
    ? await resolveActiveParticipantUnit(
      String(previousTask.project_id ?? ''),
      updates.participant_unit_id ?? null,
    )
    : undefined
  if (participantUnitWasProvided) {
    ;(updates as any).participant_unit_id = prevalidatedParticipantUnit?.id ?? null
  }

  const governedExecutionFacts = applyExecutionFactGovernance({
    intent: options.executionFactIntent ?? ExecutionFactIntent.TaskApiUpdate,
    previousTask,
    patch: updatesRecord,
    now: new Date().toISOString(),
    eventDate: options.executionFactEventDate,
    allowManualActualDates: options.allowManualActualDates,
  })
  for (const key of Object.keys(updatesRecord)) delete updatesRecord[key]
  Object.assign(updatesRecord, governedExecutionFacts.patch)

  const { task: taskData } = await updateTaskWithCodeInTransaction(
    taskId,
    updates as Record<string, unknown>,
    expectedVersion,
    updates.updated_by ?? null,
    String(previousTask.project_id ?? ''),
  )
  const task = taskData as unknown as Task
  if (!task) return null
  const participantUnit = participantUnitWasProvided
    ? await persistTaskParticipantUnit(
      task.id,
      String(previousTask.project_id ?? task.project_id ?? ''),
      updates.participant_unit_id ?? null,
      updates.updated_by ?? null,
      prevalidatedParticipantUnit,
    )
    : null

  if (justCompletedTask(previousTask, task)) {
    await runPostCommitTaskSideEffect('auto_satisfy_dependent_conditions', task.id, async () => {
      const autoSatisfiedDependents = await autoSatisfyDependentConditions(task.id, task.project_id)
      await notifyAutoSatisfiedConditions(task.project_id, autoSatisfiedDependents)
      await autoResolveDependentObstacles(autoSatisfiedDependents, task.id, String(task.project_id ?? ''), updates.updated_by ?? null)
    })
  }

  if (shouldRecordTaskProgressSnapshot(previousTask, task)) {
    await runPostCommitTaskSideEffect('record_task_progress_snapshot', task.id, async () => {
      await recordTaskProgressSnapshot(task, {
        recordedBy: updates.updated_by ?? null,
      }, previousTask)
    })
  }

  await runPostCommitTaskSideEffect('sync_acceptance_plans', task.id, async () => {
    await syncAcceptancePlansFromCanonicalTask({
      previousTask,
      nextTask: task,
      actorId: updates.updated_by ?? null,
      intent: options.executionFactIntent ?? ExecutionFactIntent.TaskApiUpdate,
    })
  })
  await runPostCommitTaskSideEffect('sync_update_execution_gate_seeds', task.id, async () => {
    await syncExecutionGateSeedsBestEffort(task, updates.updated_by ?? null)
  })

  if (isUnmarkingMilestone) {
    await runPostCommitTaskSideEffect('apply_milestone_unmark_governance', task.id, async () => {
      await applyMilestoneUnmarkGovernance(previousTask, task, updates.updated_by ?? null)
    })
  }

  await runPostCommitTaskSideEffect('notify_task_assignment_change', task.id, async () => {
    await notifyTaskAssignmentChange(previousTask, task)
  })

  // v1.4.2: WBS recalculation — if parent or sort_order changed, recalc siblings
  const parentChanged = (updates as any).parent_id !== undefined && String((updates as any).parent_id) !== String(previousTask.parent_id)
  const sortChanged = (updates as any).sort_order !== undefined && Number((updates as any).sort_order) !== Number(previousTask.sort_order)
  if (parentChanged || sortChanged) {
    await runPostCommitTaskSideEffect('recalculate_wbs_projection', task.id, async () => {
      const changedParentId = parentChanged ? ((updates as any).parent_id ?? null) : previousTask.parent_id
      await recalcWbsForParent(String(previousTask.project_id ?? task.project_id ?? ''), changedParentId)
      if (parentChanged && previousTask.parent_id) {
        await recalcWbsForParent(String(previousTask.project_id ?? task.project_id ?? ''), previousTask.parent_id)
      }
      const parentIdsToRefresh = new Set<string>()
      if (changedParentId) parentIdsToRefresh.add(String(changedParentId))
      if (parentChanged && previousTask.parent_id) parentIdsToRefresh.add(String(previousTask.parent_id))
      for (const parentTaskId of parentIdsToRefresh) {
        await refreshTaskWbsFlags(parentTaskId)
      }
    })
  }

  await runPostCommitTaskSideEffect('finalize_task_write', task.id, async () => {
    await taskWriteFinalizationOutboxDrainJob.executeNow()
  })
  clearTaskCriticalPathReadCaches(task.project_id ?? previousTask.project_id)
  return { task, participantUnit }
}

export async function deleteTaskInMainChain(
  taskId: string,
  projectId: string,
  actorId?: string | null,
): Promise<Task | null> {
  const normalizedProjectId = String(projectId ?? '').trim()
  if (!normalizedProjectId) {
    throw new Error('task deletion requires projectId')
  }

  const [previousTask] = await executeSQL<Task>(
    'SELECT * FROM tasks WHERE id = ? AND project_id = ? LIMIT 1',
    [taskId, normalizedProjectId],
  )
  if (!previousTask) return null

  await rawQuery(
    `DELETE FROM public.task_preceding_relations relation
      USING public.task_conditions condition_row
      WHERE relation.condition_id = condition_row.id
        AND relation.task_id = $1
        AND condition_row.project_id = $2`,
    [taskId, normalizedProjectId],
  )

  await executeSQL(
    `UPDATE project_entity_links SET status = 'inactive', updated_at = ?
      WHERE target_entity_type = ? AND target_entity_id = ? AND status = ? AND project_id = ?`,
    [new Date().toISOString(), 'task', taskId, 'active', normalizedProjectId],
  )

  await deleteTaskRecord(taskId)

  if (normalizedProjectId) {
    const parentId = previousTask.parent_id ? String(previousTask.parent_id) : null
    await runPostCommitTaskSideEffect('finalize_task_delete', taskId, async () => {
      await recalcWbsForParent(normalizedProjectId, parentId)
      if (parentId) {
        await refreshTaskWbsFlags(parentId)
      }
      await queuePassiveReorderDetection(normalizedProjectId, taskId)
    })
  }

  logger.info('Task deleted through main write chain', {
    taskId,
    projectId: normalizedProjectId,
    actorId: actorId ?? null,
  })

  clearTaskCriticalPathReadCaches(normalizedProjectId)
  return previousTask
}

async function refreshTaskWbsFlags(taskId: string): Promise<void> {
  const rows = await executeSQL<{ project_id?: string | null; wbs_node_type?: string | null }>(
    'SELECT project_id, wbs_node_type FROM tasks WHERE id = ?',
    [taskId],
  )
  const task = rows[0]
  if (!task?.project_id) return

  const childRows = await executeSQL<{ count?: number; cnt?: number }>(
    'SELECT COUNT(*) as count FROM tasks WHERE parent_id = ? AND project_id = ?',
    [taskId, task.project_id],
  )
  const hasChildren = Number(childRows?.[0]?.count ?? childRows?.[0]?.cnt ?? 0) > 0
  const flags = deriveWbsFlags(normalizeWbsNodeType(task.wbs_node_type), hasChildren)

  await executeSQL(
    'UPDATE tasks SET is_leaf = ?, is_wbs_summary = ?, is_executable = ? WHERE id = ? AND project_id = ?',
    [flags.is_leaf, flags.is_wbs_summary, flags.is_executable, taskId, task.project_id],
  )
}

async function recalcWbsForParent(projectId: string, parentId: string | null): Promise<void> {
  let siblingsQuery = supabase
    .from('tasks')
    .select('id, sort_order, wbs_node_type')
    .eq('project_id', projectId)

  siblingsQuery = parentId
    ? siblingsQuery.eq('parent_id', parentId)
    : siblingsQuery.is('parent_id', null)

  const { data: siblingsData, error: siblingsError } = await siblingsQuery
    .order('sort_order', { ascending: true })
    .order('title', { ascending: true })

  if (siblingsError) {
    throw siblingsError
  }

  const siblings: any[] = siblingsData ?? []
  if (siblings.length === 0) return

  let parentCode = ''
  let parentPath: string | null = null
  if (parentId) {
    const parent: any = (await executeSQL<any>('SELECT wbs_code, wbs_path FROM tasks WHERE id = ? AND project_id = ?', [parentId, projectId]))[0]
    parentCode = parent?.wbs_code ?? ''
    parentPath = parent?.wbs_path ?? null
  }

  for (let i = 0; i < siblings.length; i++) {
    const sid = siblings[i].id
    const code = parentCode ? `${parentCode}.${i + 1}` : `${i + 1}`
    const path = parentPath ? `${parentPath}/${sid}` : `/${sid}`
    const level = parentCode ? parentCode.split('.').length + 1 : 1

    // Check actual children
    const childCount: any[] = await executeSQL<any>('SELECT COUNT(*) as cnt FROM tasks WHERE parent_id = ? AND project_id = ?', [sid, projectId])
    const hasChildren = Number(childCount?.[0]?.cnt ?? 0) > 0
    const wbsType = (siblings[i] as any).wbs_node_type || null
    const flags = deriveWbsFlags(wbsType, hasChildren)

    await executeSQL<any>(
      'UPDATE tasks SET wbs_code = ?, wbs_level = ?, wbs_path = ?, is_leaf = ?, is_wbs_summary = ?, is_executable = ? WHERE id = ? AND project_id = ?',
      [code, level, path, flags.is_leaf, flags.is_wbs_summary, flags.is_executable, sid, projectId],
    )

    // Cascade: if this node has children, recursively update their paths
    if (hasChildren) {
      await recalcWbsForParent(projectId, sid)
    }
  }
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
  const projectId = String(previousTask.project_id ?? '')
  const reopenedState = {
    ...previousTask,
    progress,
    status: 'in_progress',
    actual_end_date: null,
    updated_by: actorId ?? null,
  } as Record<string, unknown>

  if (!hasAnyScopeObjectId(reopenedState)) {
    throw Object.assign(
      new Error('任务必须至少归属一个工程范围对象（分期/标段/楼栋/楼层/区域/主要施工对象）'),
      { statusCode: 400, code: 'SCOPE_OBJECT_REQUIRED' },
    )
  }

  const typeError = await validateScopeObjectTypes(projectId, reopenedState as Record<string, string | null | undefined>)
  if (typeError) {
    throw Object.assign(new Error(typeError), { statusCode: 400, code: 'SCOPE_OBJECT_TYPE_MISMATCH' })
  }

  const consistencyError = await validateTaskScopeConsistency(projectId, reopenedState as Record<string, string | null | undefined>)
  if (consistencyError) {
    throw Object.assign(new Error(consistencyError), { statusCode: 400, code: 'SCOPE_CONSISTENCY_ERROR' })
  }

  const standardResult = validateTaskStandardFields(reopenedState as any, 'normal')
  if (!standardResult.valid) {
    throw Object.assign(new Error(standardResult.errors.join('; ')), { statusCode: 400, code: 'TASK_STANDARD_VALIDATION_FAILED' })
  }

  const { task: taskData } = await reopenTaskWithCodeInTransaction(
    taskId,
    progress,
    expectedVersion,
    actorId ?? null,
    projectId,
  )
  const task = taskData as unknown as Task
  if (!task) return null

  if (shouldRecordTaskProgressSnapshot(previousTask, task)) {
    await runPostCommitTaskSideEffect('record_reopen_progress_snapshot', task.id, async () => {
      await recordTaskProgressSnapshot(task, {
        recordedBy: actorId ?? null,
      }, previousTask)
    })
  }

  await runPostCommitTaskSideEffect('finalize_reopen_task_write', task.id, async () => {
    await taskWriteFinalizationOutboxDrainJob.executeNow()
  })
  return { task, participantUnit: null }
}
