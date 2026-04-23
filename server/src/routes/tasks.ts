// Tasks API 路由

import { Router } from 'express'
import { SupabaseService } from '../services/supabaseService.js'
import { asyncHandler } from '../middleware/errorHandler.js'
import {
  validate,
  validateIdParam,
  taskSchema,
  taskUpdateSchema,
  validateTaskDateWindow,
} from '../middleware/validation.js'
import { authenticate, requireProjectEditor, requireProjectMember } from '../middleware/auth.js'
import { logger } from '../middleware/logger.js'
import type { ApiResponse } from '../types/index.js'
import type { Task } from '../types/db.js'
import { executeSQL, supabase as db } from '../services/dbService.js'
import {
  closeTaskInMainChain,
  createTaskInMainChain,
  reopenTaskInMainChain,
  updateTaskInMainChain,
} from '../services/taskWriteChainService.js'
import {
  REQUEST_TIMEOUT_BUDGETS,
  runWithRequestBudget,
} from '../services/requestBudgetService.js'

const router = Router()
const supabase = new SupabaseService()

type TaskWithParticipantUnit = Task & {
  participant_unit_name?: string | null
}

type ParticipantUnitRecord = {
  id: string
  unit_name: string
}

type TaskBaselineProjection = {
  source_task_id?: string | null
  planned_start_date?: string | null
  planned_end_date?: string | null
  is_baseline_critical?: boolean | null
}

type TaskDeleteProtectionSummary = {
  child_task_count: number
  condition_count: number
  obstacle_count: number
  delay_request_count: number
  acceptance_plan_count: number
  has_execution_trail: boolean
}

function normalizeTimelineDate(value?: string | null) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function parseTimelineProjectionFlag(input: unknown) {
  return String(input ?? '').trim().toLowerCase() === 'true'
}

function compareTimelineOrder(left: Task, right: Task) {
  const leftSort = Number.isFinite(Number(left.sort_order)) ? Number(left.sort_order) : Number.MAX_SAFE_INTEGER
  const rightSort = Number.isFinite(Number(right.sort_order)) ? Number(right.sort_order) : Number.MAX_SAFE_INTEGER
  if (leftSort !== rightSort) return leftSort - rightSort

  const leftLevel = Number.isFinite(Number(left.wbs_level)) ? Number(left.wbs_level) : Number.MAX_SAFE_INTEGER
  const rightLevel = Number.isFinite(Number(right.wbs_level)) ? Number(right.wbs_level) : Number.MAX_SAFE_INTEGER
  if (leftLevel !== rightLevel) return leftLevel - rightLevel

  const leftDate =
    normalizeTimelineDate(left.start_date)
    ?? normalizeTimelineDate(left.planned_start_date)
    ?? normalizeTimelineDate(left.end_date)
    ?? normalizeTimelineDate(left.created_at)
    ?? '9999-12-31'
  const rightDate =
    normalizeTimelineDate(right.start_date)
    ?? normalizeTimelineDate(right.planned_start_date)
    ?? normalizeTimelineDate(right.end_date)
    ?? normalizeTimelineDate(right.created_at)
    ?? '9999-12-31'

  const dateCompare = leftDate.localeCompare(rightDate)
  if (dateCompare !== 0) return dateCompare

  const leftWbs = String(left.wbs_code ?? '')
  const rightWbs = String(right.wbs_code ?? '')
  const wbsCompare = leftWbs.localeCompare(rightWbs, 'zh-CN', { numeric: true, sensitivity: 'base' })
  if (wbsCompare !== 0) return wbsCompare

  const leftTitle = String(left.title ?? '')
  const rightTitle = String(right.title ?? '')
  const titleCompare = leftTitle.localeCompare(rightTitle, 'zh-CN', { sensitivity: 'base' })
  if (titleCompare !== 0) return titleCompare

  return String(left.id ?? '').localeCompare(String(right.id ?? ''), 'en', { sensitivity: 'base' })
}

async function loadBaselineProjectionMap(baselineVersionId: string) {
  const { data, error } = await db
    .from('task_baseline_items')
    .select('source_task_id, planned_start_date, planned_end_date, is_baseline_critical')
    .eq('baseline_version_id', baselineVersionId)

  if (error) {
    throw new Error(`获取基线任务投影失败: ${error.message}`)
  }

  return new Map(
    ((data ?? []) as TaskBaselineProjection[])
      .filter((row) => Boolean(row.source_task_id))
      .map((row) => [
        String(row.source_task_id),
        {
          baseline_start: normalizeTimelineDate(row.planned_start_date),
          baseline_end: normalizeTimelineDate(row.planned_end_date),
          baseline_is_critical: row.is_baseline_critical ?? null,
        },
      ]),
  )
}

async function attachTimelineProjectionFields(
  tasks: TaskWithParticipantUnit[],
  options: {
    includeTimelineProjection: boolean
    baselineVersionId?: string | null
  },
) {
  if (!options.includeTimelineProjection) {
    return tasks
  }

  const baselineMap =
    options.baselineVersionId && options.baselineVersionId.trim()
      ? await loadBaselineProjectionMap(options.baselineVersionId.trim())
      : new Map<string, { baseline_start: string | null; baseline_end: string | null; baseline_is_critical: boolean | null }>()

  return tasks.map((task) => {
    const baseline = baselineMap.get(task.id)
    return {
      ...task,
      baseline_start: baseline?.baseline_start ?? null,
      baseline_end: baseline?.baseline_end ?? null,
      baseline_is_critical: baseline?.baseline_is_critical ?? null,
    }
  })
}

function parseExpectedVersion(input: unknown) {
  if (input === undefined || input === null || input === '') return undefined
  const version = Number(input)
  return Number.isInteger(version) && version > 0 ? version : null
}

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

function buildTaskDeleteProtectionResponse(task: Task, summary: TaskDeleteProtectionSummary): ApiResponse {
  return {
    success: false,
    error: {
      code: 'TASK_DELETE_PROTECTED',
      message: '该任务已形成执行或流程记录，请改为关闭此记录。',
      details: {
        entity_type: 'task',
        entity_id: task.id,
        status: task.status,
        progress: Number(task.progress ?? 0),
        ...summary,
        close_action: {
          method: 'POST',
          endpoint: `/api/tasks/${task.id}/close`,
          label: '关闭此记录',
        },
      },
    },
    timestamp: new Date().toISOString(),
  }
}

async function lookupParticipantUnitByName(projectId: string, unitName: string) {
  const rows = await executeSQL<{ id: string; unit_name: string }>(
    'SELECT id, unit_name FROM participant_units WHERE project_id = ? AND unit_name = ?',
    [projectId, unitName]
  )
  if (rows[0]) return rows[0]

  const legacyRows = await executeSQL<{ id: string; unit_name: string }>(
    'SELECT id, unit_name FROM participant_units WHERE project_id IS NULL AND unit_name = ?',
    [unitName]
  )
  return legacyRows[0] ?? null
}

async function decorateTaskWithParticipantUnit(task: Task): Promise<TaskWithParticipantUnit> {
  const taskUnitName = normalizeUnitLabel(task.participant_unit_name)
    || normalizeUnitLabel(task.responsible_unit)
    || normalizeUnitLabel(task.assignee_unit)

  const base: TaskWithParticipantUnit = {
    ...task,
    responsible_unit: normalizeUnitLabel(task.responsible_unit) || normalizeUnitLabel(task.assignee_unit) || null,
    participant_unit_name: normalizeUnitLabel(task.participant_unit_name) || null,
  }

  if (!task.participant_unit_id) {
    return taskUnitName
      ? { ...base, participant_unit_name: taskUnitName }
      : base
  }

  const matched = await executeSQL<{ id: string; unit_name: string }>(
    'SELECT id, unit_name FROM participant_units WHERE id = ?',
    [task.participant_unit_id]
  )

  const unitName = matched[0]?.unit_name?.trim() || taskUnitName || null
  return {
    ...base,
    participant_unit_name: unitName,
    responsible_unit: unitName || base.responsible_unit || null,
  }
}

async function decorateTasksWithParticipantUnits(tasks: Task[]) {
  const taskMap = new Map<string, TaskWithParticipantUnit>()
  const participantUnitIds = Array.from(
    new Set(tasks.map((task) => task.participant_unit_id).filter((value): value is string => Boolean(value))),
  )

  let participantUnitNameMap = new Map<string, string>()
  if (participantUnitIds.length > 0) {
    const placeholders = participantUnitIds.map(() => '?').join(', ')
    const rows = await executeSQL<{ id: string; unit_name: string }>(
      `SELECT id, unit_name FROM participant_units WHERE id IN (${placeholders})`,
      participantUnitIds
    )
    participantUnitNameMap = new Map(
      rows.map((row) => [String(row.id), String(row.unit_name ?? '')]),
    )
  }

  for (const task of tasks) {
    const unitName = task.participant_unit_id ? participantUnitNameMap.get(task.participant_unit_id) || null : null
    taskMap.set(task.id, {
      ...task,
      responsible_unit: normalizeUnitLabel(task.responsible_unit) || normalizeUnitLabel(task.assignee_unit) || null,
      participant_unit_name: unitName || normalizeUnitLabel(task.participant_unit_name) || null,
    })
  }

  return Array.from(taskMap.values())
}

async function loadTaskDeleteProtectionSummary(task: Task): Promise<TaskDeleteProtectionSummary | null> {
  const [childTasks, conditions, obstacles, delayRequests, acceptancePlans] = await Promise.all([
    executeSQL<{ id: string }>('SELECT id FROM tasks WHERE parent_id = ?', [task.id]),
    executeSQL<{ id: string }>('SELECT id FROM task_conditions WHERE task_id = ?', [task.id]),
    executeSQL<{ id: string }>('SELECT id FROM task_obstacles WHERE task_id = ?', [task.id]),
    executeSQL<{ id: string }>('SELECT id FROM delay_requests WHERE task_id = ?', [task.id]),
    executeSQL<{ id: string }>('SELECT id FROM acceptance_plans WHERE task_id = ?', [task.id]),
  ])

  const summary: TaskDeleteProtectionSummary = {
    child_task_count: childTasks.length,
    condition_count: conditions.length,
    obstacle_count: obstacles.length,
    delay_request_count: delayRequests.length,
    acceptance_plan_count: acceptancePlans.length,
    has_execution_trail:
      Number(task.progress ?? 0) > 0 ||
      !['pending', 'todo'].includes(String(task.status ?? '').trim().toLowerCase()),
  }

  const hasBlockingRecords =
    summary.child_task_count > 0 ||
    summary.condition_count > 0 ||
    summary.obstacle_count > 0 ||
    summary.delay_request_count > 0 ||
    summary.acceptance_plan_count > 0 ||
    summary.has_execution_trail

  return hasBlockingRecords ? summary : null
}

// 所有路由都需要认证
router.use(authenticate)

// 获取任务列表
router.get('/', requireProjectMember(req => (req.query.projectId ?? req.query.project_id) as string | undefined), asyncHandler(async (req, res) => {
  const projectId = (req.query.projectId ?? req.query.project_id) as string | undefined
  const baselineVersionId = typeof req.query.baseline_version_id === 'string'
    ? req.query.baseline_version_id.trim()
    : ''
  const includeTimelineProjection =
    parseTimelineProjectionFlag(req.query.timeline_projection) || Boolean(baselineVersionId)

  logger.info('Fetching tasks', { projectId, baselineVersionId: baselineVersionId || null, includeTimelineProjection })
  
  const tasks = await supabase.getTasks(projectId)
  const sortedTasks = [...tasks].sort(compareTimelineOrder)
  const decoratedTasks = await decorateTasksWithParticipantUnits(sortedTasks)
  const responseTasks = await attachTimelineProjectionFields(decoratedTasks, {
    includeTimelineProjection,
    baselineVersionId: baselineVersionId || null,
  })
  
  const response: ApiResponse<TaskWithParticipantUnit[]> = {
    success: true,
    data: responseTasks,
    timestamp: new Date().toISOString(),
  }
  res.json(response)
}))

// 获取项目所有任务的进度快照（用于连续滞后分析）
router.get('/progress-snapshots', asyncHandler(async (req, res) => {
  const projectId = req.query.projectId as string

  if (!projectId) {
    const response: ApiResponse = {
      success: false,
      error: { code: 'MISSING_PROJECT_ID', message: '项目ID不能为空' },
      timestamp: new Date().toISOString(),
    }
    return res.status(400).json(response)
  }

  logger.info('Fetching progress snapshots', { projectId })

  const snapshots = await runWithRequestBudget(
    {
      operation: 'tasks.progress_snapshots',
      timeoutMs: REQUEST_TIMEOUT_BUDGETS.batchWriteMs,
    },
    async () => {
      const { data: taskRows, error: taskError } = await db
        .from('tasks')
        .select('id')
        .eq('project_id', projectId)

      if (taskError) {
        throw new Error(`获取项目任务失败: ${taskError.message}`)
      }

      const taskIds = (taskRows ?? []).map((row: any) => String(row.id)).filter(Boolean)
      if (taskIds.length === 0) {
        return []
      }

      const BATCH_SIZE = 200
      const allSnapshots: any[] = []
      for (let i = 0; i < taskIds.length; i += BATCH_SIZE) {
        const batch = taskIds.slice(i, i + BATCH_SIZE)
        const { data: snapshotRows, error: snapshotError } = await db
          .from('task_progress_snapshots')
          .select('*')
          .in('task_id', batch)

        if (snapshotError) {
          throw new Error(`获取任务进度快照失败: ${snapshotError.message}`)
        }
        if (snapshotRows) {
          allSnapshots.push(...snapshotRows)
        }
      }

      allSnapshots.sort((a, b) => {
        const cmp1 = String(a.task_id).localeCompare(String(b.task_id))
        if (cmp1 !== 0) return cmp1
        const cmp2 = String(b.snapshot_date).localeCompare(String(a.snapshot_date))
        if (cmp2 !== 0) return cmp2
        return String(b.created_at).localeCompare(String(a.created_at))
      })

      return allSnapshots
    },
  )

  const response: ApiResponse = {
    success: true,
    data: snapshots,
    timestamp: new Date().toISOString(),
  }
  res.json(response)
}))

// 获取单个任务
router.get('/:id', validateIdParam, requireProjectMember(async (req) => {
  const task = await supabase.getTask(req.params.id)
  return task?.project_id
}), asyncHandler(async (req, res) => {
  const { id } = req.params
  logger.info('Fetching task', { id })
  
  // 修复：使用 getTask 按 ID 直接查询，避免全表扫描
  const task = await supabase.getTask(id)
  
  if (!task) {
    const response: ApiResponse = {
      success: false,
      error: { code: 'TASK_NOT_FOUND', message: '任务不存在' },
      timestamp: new Date().toISOString(),
    }
    return res.status(404).json(response)
  }
  
  const responseTask = task ? await decorateTaskWithParticipantUnit(task) : null

  const response: ApiResponse<TaskWithParticipantUnit> = {
    success: true,
    data: responseTask as TaskWithParticipantUnit,
    timestamp: new Date().toISOString(),
  }
  res.json(response)
}))

// 创建任务
router.post('/', requireProjectEditor(req => req.body.project_id), validate(taskSchema), asyncHandler(async (req, res) => {
  logger.info('Creating task', { body: req.body, project_id: req.body.project_id, title: req.body.title })

  // 修复：确保 created_by 为有效 UUID 或 null，删除空字符串/undefined
  const taskBody = { ...req.body }
  if (!taskBody.created_by && !taskBody.user_id) {
    delete taskBody.created_by
    delete taskBody.user_id
  }

  try {
    const { task, participantUnit } = await createTaskInMainChain({
      ...taskBody,
      created_by: req.user?.id,
    }, req.user?.id ?? null)
    const responseTask = await decorateTaskWithParticipantUnit({
      ...task,
      participant_unit_id: participantUnit?.id ?? task.participant_unit_id ?? null,
      participant_unit_name: participantUnit?.unit_name ?? task.participant_unit_name ?? null,
      responsible_unit: participantUnit?.unit_name ?? task.responsible_unit ?? task.assignee_unit ?? null,
    })
  
    const response: ApiResponse<TaskWithParticipantUnit> = {
      success: true,
      data: responseTask,
      timestamp: new Date().toISOString(),
    }
    res.status(201).json(response)
  } catch (err) {
    logger.error('创建任务失败', { 
      error: (err as Error).message,
      stack: (err as Error).stack,
      taskBody: JSON.stringify(taskBody),
    })
    throw err
  }
}))

// 更新任务
router.put('/:id', validateIdParam, requireProjectEditor(async (req) => {
  const task = await supabase.getTask(req.params.id)
  return task?.project_id
}), validate(taskUpdateSchema), asyncHandler(async (req, res) => {
  const { id } = req.params
  const { version, ...updates } = req.body
  const appliedUpdates = { ...updates, updated_by: req.user?.id }

  logger.info('Updating task', { id, version })

  try {
    // 修复：使用 getTask 按 ID 直接查询，避免全表扫描
    const oldTask = await supabase.getTask(id)
    const mergedDateValidation = validateTaskDateWindow(
      {
        planned_start_date: 'planned_start_date' in updates
          ? updates.planned_start_date
          : oldTask?.planned_start_date ?? oldTask?.start_date ?? null,
        start_date: 'start_date' in updates
          ? updates.start_date
          : oldTask?.start_date ?? oldTask?.planned_start_date ?? null,
        planned_end_date: 'planned_end_date' in updates
          ? updates.planned_end_date
          : oldTask?.planned_end_date ?? oldTask?.end_date ?? null,
        end_date: 'end_date' in updates
          ? updates.end_date
          : oldTask?.end_date ?? oldTask?.planned_end_date ?? null,
      },
      { requireBothDates: true },
    )
    if (!mergedDateValidation.valid) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: mergedDateValidation.issues[0]?.message || '任务日期校验失败',
          details: mergedDateValidation.issues,
        },
        timestamp: new Date().toISOString(),
      }
      return res.status(400).json(response)
    }
    const result = await updateTaskInMainChain(id, appliedUpdates, version)
    const task = result?.task ?? null
    const participantUnit = result?.participantUnit ?? null

    if (!task) {
      const response: ApiResponse = {
        success: false,
        error: { code: 'TASK_NOT_FOUND', message: '任务不存在' },
        timestamp: new Date().toISOString(),
      }
      return res.status(404).json(response)
    }

    const responseTask = await decorateTaskWithParticipantUnit({
      ...task,
      participant_unit_id: participantUnit?.id ?? task.participant_unit_id ?? null,
      participant_unit_name: participantUnit?.unit_name ?? task.participant_unit_name ?? null,
      responsible_unit: participantUnit?.unit_name ?? task.responsible_unit ?? task.assignee_unit ?? null,
    })

    const response: ApiResponse<TaskWithParticipantUnit> = {
      success: true,
      data: responseTask,
      timestamp: new Date().toISOString(),
    }
    res.json(response)
  } catch (error: any) {
    if (
      error?.code === 'TASK_CONDITIONS_UNMET'
      || error?.code === 'TASK_REOPEN_REQUIRED'
      || error?.code === 'TASK_REOPEN_NOT_ALLOWED'
      || error?.code === 'TASK_REOPEN_PROGRESS_REQUIRED'
      || error?.code === 'TASK_REOPEN_PROGRESS_INVALID'
      || error?.code === 'INVALID_TASK_PROGRESS'
      || error?.statusCode === 422
      || error?.statusCode === 400
    ) {
      const response: ApiResponse = {
        success: false,
        error: { code: error.code || 'TASK_UPDATE_REJECTED', message: error.message },
        timestamp: new Date().toISOString(),
      }
      return res.status(error.statusCode || 422).json(response)
    }

    if (error.message && error.message.includes('VERSION_MISMATCH')) {
      const response: ApiResponse = {
        success: false,
        error: { code: 'VERSION_MISMATCH', message: error.message },
        timestamp: new Date().toISOString(),
      }
      return res.status(409).json(response)
    }
    throw error
  }
}))

// 删除任务
router.delete('/:id', validateIdParam, requireProjectEditor(async (req) => {
  const task = await supabase.getTask(req.params.id)
  return task?.project_id
}), asyncHandler(async (req, res) => {
  const { id } = req.params
  logger.info('Deleting task', { id })

  const existing = await supabase.getTask(id)
  if (!existing) {
    const response: ApiResponse = {
      success: false,
      error: { code: 'TASK_NOT_FOUND', message: '任务不存在' },
      timestamp: new Date().toISOString(),
    }
    return res.status(404).json(response)
  }

  const protectionSummary = await loadTaskDeleteProtectionSummary(existing)
  if (protectionSummary) {
    return res.status(422).json(buildTaskDeleteProtectionResponse(existing, protectionSummary))
  }

  // 防御式清理：即便底层库还未完全迁到 cascade，也先清掉“此任务作为前置任务”的关系边。
  try {
    await executeSQL('DELETE FROM task_preceding_relations WHERE task_id = ?', [id])
  } catch (error) {
    if (!isMissingRelationError(error, 'task_preceding_relations')) {
      throw error
    }
    logger.warn('Skipping task_preceding_relations cleanup because relation table is missing', { id })
  }
  
  await supabase.deleteTask(id)
  
  const response: ApiResponse = {
    success: true,
    timestamp: new Date().toISOString(),
  }
  res.json(response)
}))

router.post('/:id/close', validateIdParam, requireProjectEditor(async (req) => {
  const task = await supabase.getTask(req.params.id)
  return task?.project_id
}), asyncHandler(async (req, res) => {
  const { id } = req.params
  const version = parseExpectedVersion(req.body?.version)
  if (version === null) {
    return res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'version must be a positive integer' },
      timestamp: new Date().toISOString(),
    })
  }

  const existing = await supabase.getTask(id)
  if (!existing) {
    const response: ApiResponse = {
      success: false,
      error: { code: 'TASK_NOT_FOUND', message: '任务不存在' },
      timestamp: new Date().toISOString(),
    }
    return res.status(404).json(response)
  }

  logger.info('Closing task instead of deleting it', { id, version: version ?? existing.version })
  let closedTask: Task | null = null
  try {
    closedTask = (await closeTaskInMainChain(id, version ?? existing.version, req.user?.id ?? null))?.task ?? null
  } catch (error: any) {
    if (error?.message && String(error.message).includes('VERSION_MISMATCH')) {
      return res.status(409).json({
        success: false,
        error: { code: 'VERSION_MISMATCH', message: error.message },
        timestamp: new Date().toISOString(),
      })
    }
    throw error
  }

  if (!closedTask) {
    const response: ApiResponse = {
      success: false,
      error: { code: 'TASK_NOT_FOUND', message: '任务不存在' },
      timestamp: new Date().toISOString(),
    }
    return res.status(404).json(response)
  }

  const responseTask = await decorateTaskWithParticipantUnit(closedTask)

  const response: ApiResponse<TaskWithParticipantUnit> = {
    success: true,
    data: responseTask,
    timestamp: new Date().toISOString(),
  }
  res.json(response)
}))

router.post('/:id/reopen', validateIdParam, requireProjectEditor(async (req) => {
  const task = await supabase.getTask(req.params.id)
  return task?.project_id
}), asyncHandler(async (req, res) => {
  const { id } = req.params
  const version = parseExpectedVersion(req.body?.version)
  if (version === null) {
    return res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'version must be a positive integer' },
      timestamp: new Date().toISOString(),
    })
  }

  const progress = Number(req.body?.progress)
  if (!Number.isInteger(progress) || progress < 0 || progress >= 100) {
    return res.status(400).json({
      success: false,
      error: { code: 'TASK_REOPEN_PROGRESS_INVALID', message: 'reopen 必须提供 0-99 的整数进度' },
      timestamp: new Date().toISOString(),
    })
  }

  const existing = await supabase.getTask(id)
  if (!existing) {
    return res.status(404).json({
      success: false,
      error: { code: 'TASK_NOT_FOUND', message: '任务不存在' },
      timestamp: new Date().toISOString(),
    })
  }

  let reopenedTask: Task | null = null
  try {
    reopenedTask = (await reopenTaskInMainChain(id, progress, version ?? existing.version, req.user?.id ?? null))?.task ?? null
  } catch (error: any) {
    if (error?.message && String(error.message).includes('VERSION_MISMATCH')) {
      return res.status(409).json({
        success: false,
        error: { code: 'VERSION_MISMATCH', message: error.message },
        timestamp: new Date().toISOString(),
      })
    }
    if (error?.code || error?.statusCode) {
      return res.status(error.statusCode || 422).json({
        success: false,
        error: { code: error.code || 'TASK_REOPEN_FAILED', message: error.message || '任务 reopen 失败' },
        timestamp: new Date().toISOString(),
      })
    }
    throw error
  }

  if (!reopenedTask) {
    return res.status(404).json({
      success: false,
      error: { code: 'TASK_NOT_FOUND', message: '任务不存在' },
      timestamp: new Date().toISOString(),
    })
  }

  const responseTask = await decorateTaskWithParticipantUnit(reopenedTask)

  res.json({
    success: true,
    data: responseTask,
    timestamp: new Date().toISOString(),
  } satisfies ApiResponse<TaskWithParticipantUnit>)
}))

export default router
