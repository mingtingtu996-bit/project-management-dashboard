// 任务开工条件 API 路由

import { Router } from 'express'
import { executeDatabaseRpc, executeSQL, executeSQLOne, supabase } from '../services/dbService.js'
import { query as rawQuery } from '../database.js'
import { asyncHandler } from '../middleware/errorHandler.js'
import { authenticate, requireProjectEditor, requireProjectMember } from '../middleware/auth.js'
import { validate, conditionSchema, conditionUpdateSchema } from '../middleware/validation.js'
import { logger } from '../middleware/logger.js'
import { writeLifecycleLog, writeStatusTransitionLog } from '../services/changeLogs.js'
import { enqueueProjectHealthUpdate } from '../services/projectHealthService.js'
import { evaluateTaskConstraint } from '../services/taskConstraintGovernanceService.js'
import type { ApiResponse } from '../types/index.js'
import type { TaskCondition } from '../types/db.js'
import { v4 as uuidv4 } from 'uuid'

const router = Router()

async function readConditionRowsByTaskId(taskId: string, limit: number, offset: number) {
  if (process.env.NODE_ENV === 'test') {
    return await executeSQL<ConditionRow>(
      'SELECT * FROM task_conditions WHERE task_id = ? ORDER BY created_at ASC LIMIT ? OFFSET ?',
      [taskId, limit, offset],
    )
  }

  const result = await rawQuery(
    'SELECT * FROM task_conditions WHERE task_id = $1 ORDER BY created_at ASC LIMIT $2 OFFSET $3',
    [taskId, limit, offset],
  )
  return result.rows as ConditionRow[]
}

async function readConditionRowsByProjectId(projectId: string, limit: number, offset: number) {
  if (process.env.NODE_ENV === 'test') {
    return await executeSQL<ConditionRow>(
      'SELECT * FROM task_conditions WHERE project_id = ? ORDER BY created_at ASC LIMIT ? OFFSET ?',
      [projectId, limit, offset],
    )
  }

  const result = await rawQuery(
    'SELECT * FROM task_conditions WHERE project_id = $1 ORDER BY created_at ASC LIMIT $2 OFFSET $3',
    [projectId, limit, offset],
  )
  return result.rows as ConditionRow[]
}

type TaskProjectRow = {
  project_id?: string | null
  task_id?: string | null
}

type TaskIdRow = {
  id: string
}

type ConditionSnapshot = {
  project_id?: string | null
  name?: string | null
  condition_name?: string | null
  condition_type?: string | null
  description?: string | null
  drawing_package_id?: string | null
  drawing_package_code?: string | null
  participant_unit_id?: string | null
  target_date?: string | null
  is_satisfied?: boolean | number | string | null
  satisfied_reason?: string | null
  satisfied_reason_note?: string | null
  confirmed_by?: string | null
  confirmed_at?: string | null
  attachments?: unknown
}

type ConditionRow = TaskCondition & ConditionSnapshot

type PrecedingRelationRow = {
  task_id: string
}

type PrecedingTaskRow = {
  task_id: string
  title?: string | null
  name?: string | null
  status?: string | null
  progress?: number | null
}

function normalizePrecedingTaskIds(value: unknown) {
  if (!Array.isArray(value)) return [] as string[]
  return [...new Set(value.map((item) => String(item ?? '').trim()).filter(Boolean))]
}

async function loadPrecedingTaskRow(taskId?: string | null) {
  if (!taskId) return null
  return executeSQLOne<PrecedingTaskRow>(
    'SELECT id AS task_id, title, name, status, progress FROM tasks WHERE id = ?',
    [taskId]
  )
}

async function resolveTaskProjectId(taskId?: string | null) {
  const normalizedTaskId = String(taskId ?? '').trim()
  if (!normalizedTaskId) return undefined
  const task = await executeSQLOne<TaskProjectRow>('SELECT project_id FROM tasks WHERE id = ? LIMIT 1', [normalizedTaskId])
  return task?.project_id ?? undefined
}

async function resolveConditionProjectId(conditionId?: string | null) {
  const normalizedConditionId = String(conditionId ?? '').trim()
  if (!normalizedConditionId) return undefined
  const condition = await executeSQLOne<TaskProjectRow>('SELECT project_id FROM task_conditions WHERE id = ? LIMIT 1', [normalizedConditionId])
  return condition?.project_id ?? undefined
}

async function resolveConditionListProjectId(req: any) {
  const projectId = String(req.query.projectId ?? req.query.project_id ?? '').trim()
  if (projectId) return projectId
  const taskId = String(req.query.taskId ?? req.query.task_id ?? '').trim()
  return resolveTaskProjectId(taskId)
}

async function validateParticipantUnitForProject(projectId?: string | null, participantUnitId?: string | null) {
  const normalizedProjectId = String(projectId ?? '').trim()
  const normalizedUnitId = String(participantUnitId ?? '').trim()
  if (!normalizedUnitId) return null
  if (!normalizedProjectId) {
    return {
      code: 'MISSING_PROJECT_ID',
      participant_unit_id: 'participant_unit_id',
      message: 'project_id is required when participant_unit_id is provided',
    }
  }

  const unit = await executeSQLOne<{ id?: string; unit_status?: string | null }>(
    `SELECT id, unit_status FROM participant_units
      WHERE id = ? AND project_id = ?
      LIMIT 1`,
    [normalizedUnitId, normalizedProjectId],
  )
  const unitStatus = String(unit?.unit_status ?? 'active').trim() || 'active'
  if (!unit || unitStatus !== 'active') {
    return {
      code: 'PARTICIPANT_UNIT_NOT_FOUND',
      participant_unit_id: 'participant_unit_id',
      message: 'participant_unit_id must reference an active participant unit in the current project',
    }
  }
  return null
}

async function validatePrecedingTasksForCondition(conditionId: string, precedingTaskIds: string[]) {
  if (precedingTaskIds.length === 0) return null

  const condition = await executeSQLOne<TaskProjectRow>(
    'SELECT project_id FROM task_conditions WHERE id = ? LIMIT 1',
    [conditionId],
  )
  const projectId = String(condition?.project_id ?? '').trim()
  if (!projectId) {
    return {
      code: 'CONDITION_NOT_FOUND',
      message: 'condition project could not be resolved',
    }
  }

  const rows = await executeSQL<TaskProjectRow & { id?: string | null }>(
    `SELECT id, project_id FROM tasks WHERE id IN (${precedingTaskIds.map(() => '?').join(', ')})`,
    precedingTaskIds,
  )
  const projectByTaskId = new Map(
    (rows || []).map((row) => [String(row.id ?? ''), String(row.project_id ?? '')]),
  )
  const invalidTaskIds = precedingTaskIds.filter((taskId) => projectByTaskId.get(taskId) !== projectId)
  if (invalidTaskIds.length > 0) {
    return {
      code: 'PRECEDING_TASK_PROJECT_MISMATCH',
      message: 'preceding_task_ids must belong to the same project as the condition',
      details: { invalidTaskIds },
    }
  }

  return null
}

async function insertTaskConditionRow(insertRow: Record<string, unknown>) {
  const values = [
    insertRow.id,
    insertRow.task_id,
    insertRow.project_id,
    insertRow.condition_type,
    insertRow.name,
    insertRow.description,
    insertRow.drawing_package_id,
    insertRow.drawing_package_code,
    insertRow.participant_unit_id,
    insertRow.target_date,
    insertRow.is_satisfied,
    insertRow.satisfied_reason,
    insertRow.satisfied_reason_note,
    insertRow.attachments,
    insertRow.confirmed_by,
    insertRow.confirmed_at,
    insertRow.created_by,
    insertRow.created_at,
    insertRow.updated_at,
  ]

  await executeSQL(
    `INSERT INTO task_conditions (
       id, task_id, project_id, condition_type, name, description,
       drawing_package_id, drawing_package_code, participant_unit_id,
       target_date, is_satisfied, satisfied_reason, satisfied_reason_note,
       attachments, confirmed_by, confirmed_at, created_by, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    values,
  )
}

const CONDITION_TYPE_BLUEPRINT = '\u56fe\u7eb8'
const CONDITION_TYPE_MATERIAL = '\u6750\u6599'
const CONDITION_TYPE_PERSONNEL = '\u4eba\u5458'
const CONDITION_TYPE_EQUIPMENT = '\u8bbe\u5907'
const CONDITION_TYPE_PROCEDURE = '\u624b\u7eed'
const CONDITION_TYPE_OTHER = '\u5176\u4ed6'

const CONDITION_TYPE_MAP: Record<string, string> = {
  material: CONDITION_TYPE_MATERIAL,
  personnel: CONDITION_TYPE_PERSONNEL,
  weather: CONDITION_TYPE_OTHER,
  'design-change': CONDITION_TYPE_OTHER,
  preceding: CONDITION_TYPE_OTHER,
  other: CONDITION_TYPE_OTHER,
  [CONDITION_TYPE_BLUEPRINT]: CONDITION_TYPE_BLUEPRINT,
  [CONDITION_TYPE_MATERIAL]: CONDITION_TYPE_MATERIAL,
  [CONDITION_TYPE_PERSONNEL]: CONDITION_TYPE_PERSONNEL,
  [CONDITION_TYPE_EQUIPMENT]: CONDITION_TYPE_EQUIPMENT,
  [CONDITION_TYPE_PROCEDURE]: CONDITION_TYPE_PROCEDURE,
  [CONDITION_TYPE_OTHER]: CONDITION_TYPE_OTHER,
}

function normalizeConditionType(value: unknown): string {
  if (typeof value !== 'string') return CONDITION_TYPE_OTHER
  return CONDITION_TYPE_MAP[value] || CONDITION_TYPE_OTHER
}

function isTruthyLike(value: unknown) {
  return value === true || value === 1 || value === '1'
}

function hasOwn(source: Record<string, unknown>, key: string) {
  return Object.prototype.hasOwnProperty.call(source, key)
}

function mapConditionRecord(record: ConditionRow | null) {
  if (!record) return record
  const isSatisfied = isTruthyLike(record.is_satisfied)

  return {
    ...record,
    condition_name: record.condition_name ?? record.name ?? '',
    name: record.name ?? record.condition_name ?? '',
    drawing_package_id: record.drawing_package_id ?? null,
    drawing_package_code: record.drawing_package_code ?? null,
    satisfied_reason: record.satisfied_reason ?? null,
    satisfied_reason_note: record.satisfied_reason_note ?? null,
    is_satisfied: isSatisfied,
    status: isSatisfied ? '已确认' : '未满足',
  }
}

async function loadPrecedingRelationRowsByCondition(conditionId: string) {
  return executeSQL<PrecedingRelationRow>(
    'SELECT task_id FROM task_preceding_relations WHERE condition_id = ?',
    [conditionId]
  )
}

async function clearPrecedingRelationRowsByCondition(conditionId: string) {
  await executeSQL('DELETE FROM task_preceding_relations WHERE condition_id = ?', [conditionId])
}

async function insertPrecedingRelationRow(conditionId: string, taskId: string) {
  const relationId = uuidv4()

  await executeSQL(
    `INSERT INTO task_preceding_relations (id, condition_id, task_id)
     VALUES (?, ?, ?)`,
    [relationId, conditionId, taskId]
  )
}

async function deletePrecedingRelationRow(conditionId: string, taskId: string) {
  await executeSQL(
    'DELETE FROM task_preceding_relations WHERE condition_id = ? AND task_id = ?',
    [conditionId, taskId]
  )
}

// 所有路由都需要认证
router.use(authenticate)

// 获取任务的所有开工条件（支持 taskId 和 projectId 两种查询方式）
router.get('/', requireProjectMember(resolveConditionListProjectId), asyncHandler(async (req, res) => {
  const taskId = req.query.taskId as string
  const projectId = req.query.projectId as string
  const limit = parseInt(req.query.limit as string) || 200
  const offset = parseInt(req.query.offset as string) || 0

  if (!taskId && !projectId) {
    const response: ApiResponse = {
      success: false,
      error: { code: 'MISSING_ID', message: '任务ID或项目ID不能为空' },
      timestamp: new Date().toISOString(),
    }
    return res.status(400).json(response)
  }

  let data: ConditionRow[]
  if (taskId) {
    logger.info('Fetching task conditions by taskId', { taskId, limit, offset })
    data = await readConditionRowsByTaskId(taskId, limit, offset)
  } else {
    logger.info('Fetching task conditions by projectId', { projectId, limit, offset })
    data = await readConditionRowsByProjectId(projectId, limit, offset)
  }

  const response: ApiResponse<TaskCondition[]> = {
    success: true,
    data: (data || []).map(mapConditionRecord),
    timestamp: new Date().toISOString(),
  }
  res.json(response)
}))

// P0-2: 显式批量满足任务的所有未满足开工条件。
// 任务首次 0 -> >0 的进度填报允许豁免条件拦截，但不会在 updateTask 内隐式替当前任务自动满足条件；
// 后续继续推进进度时，仍需先解除未满足条件。
router.post('/batch-satisfy', requireProjectEditor((req) => resolveTaskProjectId(req.body?.task_id)), asyncHandler(async (req, res) => {
  const { task_id } = req.body
  if (!task_id) {
    return res.status(400).json({
      success: false,
      error: { code: 'MISSING_TASK_ID', message: '任务ID不能为空' },
      timestamp: new Date().toISOString()
    })
  }

  const taskRows = await executeSQL<TaskProjectRow>('SELECT project_id FROM tasks WHERE id = ?', [task_id])
  const projectId = taskRows?.[0]?.project_id ?? null

  // 批量更新该任务所有 is_satisfied=false 的条件
  const pendingRows = await executeSQL<TaskIdRow>(
    'SELECT id FROM task_conditions WHERE task_id = ? AND project_id = ? AND is_satisfied = 0',
    [task_id, projectId]
  )
  const count = pendingRows.length
  if (count > 0) {
    await executeSQL(
      'UPDATE task_conditions SET is_satisfied = 1 WHERE task_id = ? AND project_id = ? AND is_satisfied = 0',
      [task_id, projectId]
    )
  }
  if (projectId) {
    enqueueProjectHealthUpdate(projectId, 'task_condition_batch_satisfied')
  }
  await evaluateTaskConstraint(task_id, { projectId: String(projectId ?? ''), sourceEventType: 'task_conditions_batch_satisfied' })

  const response: ApiResponse<{ count: number }> = {
    success: true,
    data: { count },
    timestamp: new Date().toISOString(),
  }
  res.json(response)
}))

// 获取单个开工条件
router.get('/:id', requireProjectMember((req) => resolveConditionProjectId(req.params.id)), asyncHandler(async (req, res) => {
  const { id } = req.params
  logger.info('Fetching task condition', { id })

  const data = await executeSQLOne('SELECT * FROM task_conditions WHERE id = ? LIMIT 1', [id])

  if (!data) {
    const response: ApiResponse = {
      success: false,
      error: { code: 'CONDITION_NOT_FOUND', message: '开工条件不存在' },
      timestamp: new Date().toISOString(),
    }
    return res.status(404).json(response)
  }

  const response: ApiResponse<TaskCondition> = {
    success: true,
    data: mapConditionRecord(data),
    timestamp: new Date().toISOString(),
  }
  res.json(response)
}))

// 创建开工条件
// P1修复：添加XSS防护验证
router.post('/', authenticate, requireProjectEditor(req => req.body.project_id || resolveTaskProjectId(req.body.task_id)), validate(conditionSchema), asyncHandler(async (req, res) => {
  logger.info('Creating task condition', req.body)

  const id = uuidv4()
  const ts = new Date().toISOString().slice(0, 19).replace('T', ' ')

  let projectId = req.body.project_id
  const taskProjectId = await resolveTaskProjectId(req.body.task_id)
  if (!taskProjectId) {
    return res.status(400).json({
      success: false,
      error: { code: 'TASK_NOT_FOUND', message: 'task_id must reference an existing task' },
      timestamp: new Date().toISOString(),
    })
  }
  if (projectId && projectId !== taskProjectId) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'TASK_PROJECT_MISMATCH',
        message: 'task_id must belong to the submitted project_id',
        details: { taskId: req.body.task_id, taskProjectId, projectId },
      },
      timestamp: new Date().toISOString(),
    })
  }
  projectId = taskProjectId

  const conditionType = normalizeConditionType(req.body.condition_type)
  const participantUnitId = String(req.body.participant_unit_id ?? '').trim() || null
  const participantUnitError = await validateParticipantUnitForProject(projectId, participantUnitId)
  if (participantUnitError) {
    return res.status(422).json({
      success: false,
      error: participantUnitError,
      timestamp: new Date().toISOString(),
    })
  }

  // schema-cache-safe insert: strip unrecognised columns and retry (mirrors createProject pattern)
  const insertRow: Record<string, unknown> = {
    id,
    task_id: req.body.task_id,
    project_id: projectId,
    condition_type: conditionType,
    name: req.body.condition_name ?? req.body.name ?? '',
    description: req.body.description ?? null,
    drawing_package_id: req.body.drawing_package_id ?? null,
    drawing_package_code: req.body.drawing_package_code ?? null,
    participant_unit_id: participantUnitId,
    target_date: req.body.target_date ?? null,
    is_satisfied: req.body.is_satisfied ? true : false,
    satisfied_reason: req.body.satisfied_reason ?? null,
    satisfied_reason_note: req.body.satisfied_reason_note ?? null,
    attachments: req.body.attachments ? JSON.stringify(req.body.attachments) : '[]',
    confirmed_by: req.body.confirmed_by ?? null,
    confirmed_at: req.body.confirmed_at ?? null,
    created_by: req.user!.id,
    created_at: ts,
    updated_at: ts,
  }

  await insertTaskConditionRow(insertRow)

  const data = await executeSQLOne('SELECT * FROM task_conditions WHERE id = ? LIMIT 1', [id])

  await writeLifecycleLog({
    project_id: projectId ?? data?.project_id ?? null,
    entity_type: 'task_condition',
    entity_id: id,
    action: 'created',
    changed_by: req.user?.id ?? null,
    change_source: 'manual_adjusted',
  })

  const response: ApiResponse<TaskCondition> = {
    success: true,
    data: mapConditionRecord(data),
    timestamp: new Date().toISOString(),
  }
  if (projectId) {
    enqueueProjectHealthUpdate(projectId, 'task_condition_created')
  }
  if (data?.task_id) {
    await evaluateTaskConstraint(String(data.task_id), { projectId: String(data.project_id ?? projectId ?? ''), sourceEventType: 'task_condition_created' })
  }
  res.status(201).json(response)
}))

// 更新开工条件
// P1修复：添加XSS防护验证
router.put('/:id', authenticate, requireProjectEditor(async (req) => {
  const condition = await executeSQLOne<TaskProjectRow>(
    'SELECT project_id FROM task_conditions WHERE id = ? LIMIT 1',
    [req.params.id]
  )
  return condition?.project_id
}), validate(conditionUpdateSchema), asyncHandler(async (req, res) => {
  const { id } = req.params
  logger.info('Updating task condition', { id })
  const previous = await executeSQLOne<ConditionSnapshot>(
    'SELECT * FROM task_conditions WHERE id = ? LIMIT 1',
    [id]
  )
  const previousProjectId = String(previous?.project_id ?? '').trim()
  if (!previousProjectId) {
    const response: ApiResponse = {
      success: false,
      error: { code: 'CONDITION_NOT_FOUND', message: '开工条件不存在' },
      timestamp: new Date().toISOString(),
    }
    return res.status(404).json(response)
  }
  const participantUnitId = req.body.participant_unit_id === undefined
    ? undefined
    : String(req.body.participant_unit_id ?? '').trim() || null
  if (participantUnitId !== undefined) {
    const participantUnitError = await validateParticipantUnitForProject(previous?.project_id, participantUnitId)
    if (participantUnitError) {
      return res.status(422).json({
        success: false,
        error: participantUnitError,
        timestamp: new Date().toISOString(),
      })
    }
  }

  // 如果标记为已满足，自动记录确认时间
  if (req.body.is_satisfied === true && !req.body.confirmed_at) {
    req.body.confirmed_at = new Date().toISOString().slice(0, 19).replace('T', ' ')
  }

  if (req.body.is_satisfied === false) {
    req.body.satisfied_reason = null
    req.body.satisfied_reason_note = null
  }

  const ts = new Date().toISOString().slice(0, 19).replace('T', ' ')
  const body = req.body as Record<string, unknown>
  const nextName = hasOwn(body, 'condition_name')
    ? req.body.condition_name
    : hasOwn(body, 'name')
      ? req.body.name
      : previous.name ?? previous.condition_name ?? ''
  const nextIsSatisfied = hasOwn(body, 'is_satisfied')
    ? (req.body.is_satisfied ? 1 : 0)
    : previous.is_satisfied ?? false

  await executeSQL(
    `UPDATE task_conditions
     SET name = ?,
         condition_type = ?,
         description = ?,
         drawing_package_id = ?,
         drawing_package_code = ?,
         participant_unit_id = ?,
         target_date = ?,
         is_satisfied = ?,
         satisfied_reason = ?,
         satisfied_reason_note = ?,
         attachments = ?,
         confirmed_by = ?,
         confirmed_at = ?,
         updated_at = ?
     WHERE id = ? AND project_id = ?`,
    [
      nextName,
      hasOwn(body, 'condition_type') ? normalizeConditionType(req.body.condition_type) : previous.condition_type ?? CONDITION_TYPE_OTHER,
      hasOwn(body, 'description') ? req.body.description : previous.description ?? null,
      hasOwn(body, 'drawing_package_id') ? req.body.drawing_package_id : previous.drawing_package_id ?? null,
      hasOwn(body, 'drawing_package_code') ? req.body.drawing_package_code : previous.drawing_package_code ?? null,
      participantUnitId !== undefined ? participantUnitId : previous.participant_unit_id ?? null,
      hasOwn(body, 'target_date') ? req.body.target_date : previous.target_date ?? null,
      nextIsSatisfied,
      hasOwn(body, 'satisfied_reason') ? req.body.satisfied_reason : previous.satisfied_reason ?? null,
      hasOwn(body, 'satisfied_reason_note') ? req.body.satisfied_reason_note : previous.satisfied_reason_note ?? null,
      hasOwn(body, 'attachments') ? req.body.attachments : previous.attachments ?? '[]',
      hasOwn(body, 'confirmed_by') ? req.body.confirmed_by : previous.confirmed_by ?? null,
      hasOwn(body, 'confirmed_at') ? req.body.confirmed_at : previous.confirmed_at ?? null,
      ts,
      id,
      previousProjectId,
    ],
  )

  const data = await executeSQLOne<ConditionRow>('SELECT * FROM task_conditions WHERE id = ? AND project_id = ? LIMIT 1', [id, previousProjectId])
  if (!data) {
    const response: ApiResponse = {
      success: false,
      error: { code: 'CONDITION_NOT_FOUND', message: '开工条件不存在' },
      timestamp: new Date().toISOString(),
    }
    return res.status(404).json(response)
  }

  const oldConditionStatus = Boolean(previous?.is_satisfied) ? '已确认' : '未满足'
  const newConditionStatus = Boolean(data.is_satisfied) ? '已确认' : '未满足'
  if (previous && oldConditionStatus !== newConditionStatus) {
    await writeStatusTransitionLog({
      project_id: previous.project_id ?? data.project_id ?? null,
      entity_type: 'task_condition',
      entity_id: id,
      old_status: oldConditionStatus,
      new_status: newConditionStatus,
      changed_by: req.user?.id ?? null,
      change_source: req.body.change_source ?? 'manual_adjusted',
    })
  }

  const response: ApiResponse<TaskCondition> = {
    success: true,
    data: mapConditionRecord(data),
    timestamp: new Date().toISOString(),
  }
  const refreshProjectId = previous?.project_id ?? data.project_id ?? null
  if (refreshProjectId) {
    enqueueProjectHealthUpdate(refreshProjectId, 'task_condition_updated')
  }
  if (data?.task_id) {
    await evaluateTaskConstraint(String(data.task_id), { projectId: String(data.project_id ?? refreshProjectId ?? ''), sourceEventType: 'task_condition_updated' })
  }
  res.json(response)
}))

// 删除开工条件
router.delete('/:id', authenticate, requireProjectEditor(async (req) => {
  const condition = await executeSQLOne<TaskProjectRow>(
    'SELECT project_id FROM task_conditions WHERE id = ? LIMIT 1',
    [req.params.id]
  )
  return condition?.project_id ?? (req.query.projectId as string | undefined)
}), asyncHandler(async (req, res) => {
  const { id } = req.params
  logger.info('Deleting task condition', { id })
  const existing = await executeSQLOne('SELECT project_id, task_id FROM task_conditions WHERE id = ? LIMIT 1', [id]) as { project_id?: string | null; task_id?: string | null } | null

  await supabase
    .from('project_entity_links')
    .update({ status: 'inactive', updated_at: new Date().toISOString() })
    .eq('target_entity_type', 'task_condition')
    .eq('target_entity_id', id)
    .eq('status', 'active')
    .eq('project_id', existing?.project_id ?? '')

  // v1.4.15: retention decision must block unsafe physical deletes.
  const { enforceRetentionOrBlock, buildRetentionBlockedApiError, buildRetentionBlockedHttpStatus } = await import('../services/deletionRetentionGovernanceService.js')
  const retention = await enforceRetentionOrBlock({
    entityType: 'task_condition',
    entityId: id,
    projectId: existing?.project_id ?? null,
    userId: req.user?.id ?? null,
    userAction: 'delete',
  })
  if (retention.blocked) {
    return res.status(buildRetentionBlockedHttpStatus(retention.result)).json({ success: false, error: buildRetentionBlockedApiError(retention.reason, retention.result), timestamp: new Date().toISOString() })
  }

  const data = await executeDatabaseRpc<boolean>('delete_task_condition_with_source_backfill_atomic', {
    p_condition_id: id,
  })

  if (!data) {
    const response: ApiResponse = {
      success: false,
      error: { code: 'CONDITION_NOT_FOUND', message: '开工条件不存在' },
      timestamp: new Date().toISOString(),
    }
    return res.status(404).json(response)
  }

  await writeLifecycleLog({
    project_id: existing?.project_id ?? null,
    entity_type: 'task_condition',
    entity_id: id,
    action: 'deleted',
    changed_by: req.user?.id ?? null,
    change_source: 'manual_adjusted',
  })

  const response: ApiResponse = {
    success: true,
    timestamp: new Date().toISOString(),
  }
  if (existing?.project_id) {
    enqueueProjectHealthUpdate(existing.project_id, 'task_condition_deleted')
  }
  if (existing?.task_id) {
    await evaluateTaskConstraint(String(existing.task_id), { projectId: String(existing.project_id ?? ''), sourceEventType: 'task_condition_deleted' })
  }
  res.json(response)
}))

// 完成开工条件（标记为"已确认"）
router.put('/:id/complete', authenticate, requireProjectEditor(async (req) => {
  const condition = await executeSQLOne<TaskProjectRow>(
    'SELECT project_id FROM task_conditions WHERE id = ? LIMIT 1',
    [req.params.id]
  )
  return condition?.project_id
}), asyncHandler(async (req, res) => {
  const { id } = req.params
  const { confirmed_by } = req.body
  const userId = req.user?.id

  logger.info('Completing task condition', { id, confirmed_by })

  if (!confirmed_by && !userId) {
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'MISSING_CONFIRMED_BY',
        message: '必须指定确认人ID'
      },
      timestamp: new Date().toISOString(),
    }
    return res.status(400).json(response)
  }

  try {
    const { BusinessStatusService } = await import('../services/businessStatusService.js')

    // 1. 完成条件
    const previousCondition = await executeSQLOne<ConditionSnapshot>(
      'SELECT id, project_id, is_satisfied FROM task_conditions WHERE id = ? LIMIT 1',
      [id]
    )
    const condition = await BusinessStatusService.completeCondition({
      id,
      confirmed_by: confirmed_by || userId,
      project_id: previousCondition?.project_id ?? null,
    })

    const oldConditionStatus = Boolean(previousCondition?.is_satisfied) ? '已确认' : '未满足'
    const newConditionStatus = Boolean(condition.is_satisfied) ? '已确认' : '未满足'
    if (oldConditionStatus !== newConditionStatus) {
      await writeStatusTransitionLog({
        project_id: previousCondition?.project_id ?? condition.project_id ?? null,
        entity_type: 'task_condition',
        entity_id: id,
        old_status: oldConditionStatus,
        new_status: newConditionStatus,
        changed_by: confirmed_by || userId || null,
        change_source: 'manual_adjusted',
      })
    }

    const task = await executeSQLOne(
      `SELECT id, project_id, status, progress,
              ready_for_start, dependency_status, condition_status,
              obstacle_status, progress_impact_level, blocked_for_progress,
              readiness_summary, planned_start_date, planned_end_date, start_date, end_date
         FROM tasks
        WHERE id = ? AND project_id = ?
        LIMIT 1`,
      [condition.task_id, condition.project_id],
    )
    const businessStatus = await BusinessStatusService.evaluateBusinessStatusForTaskFromLoadedFact(
      condition.task_id,
      {
        task: task as any,
        conditions: [condition],
        projectId: condition.project_id,
      },
    )

    logger.info('Business status recalculated after condition completed', {
      taskId: condition.task_id,
      status: businessStatus.display,
      reason: businessStatus.reason
    })

    // 返回条件 + 业务状态
    const response: ApiResponse<{
      condition: TaskCondition
      businessStatus: any
    }> = {
      success: true,
      data: {
        condition,
        businessStatus
      },
      timestamp: new Date().toISOString(),
    }
    if (condition.project_id) {
      enqueueProjectHealthUpdate(condition.project_id, 'task_condition_completed')
    }
    if (condition.task_id) {
      await evaluateTaskConstraint(String(condition.task_id), { projectId: String(condition.project_id ?? ''), sourceEventType: 'task_condition_completed' })
    }
    res.json(response)
  } catch (error: any) {
    logger.error('Failed to complete condition', { id, error })
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'COMPLETE_CONDITION_FAILED',
        message: error.message || '完成条件失败'
      },
      timestamp: new Date().toISOString(),
    }
    res.status(400).json(response)
  }
}))

// P2-9: 获取条件的所有前置任务（通过 junction 表）
router.get('/:id/preceding-tasks', requireProjectMember((req) => resolveConditionProjectId(req.params.id)), asyncHandler(async (req, res) => {
  const { id } = req.params
  logger.info('Fetching preceding tasks for condition', { id })

  const precedingRows = await loadPrecedingRelationRowsByCondition(id)
  const relations: PrecedingTaskRow[] = []
  for (const row of precedingRows) {
    const task = await loadPrecedingTaskRow(row.task_id)
    if (task) relations.push(task)
  }

  const response: ApiResponse<PrecedingTaskRow[]> = {
    success: true,
    data: relations || [],
    timestamp: new Date().toISOString(),
  }
  res.json(response)
}))

// P2-9: 设置条件的前置任务（批量替换）
router.post('/:id/preceding-tasks', authenticate, requireProjectEditor(async (req) => {
  const cond = await executeSQLOne<TaskProjectRow>('SELECT project_id FROM task_conditions WHERE id = ?', [req.params.id])
  return cond?.project_id
}), asyncHandler(async (req, res) => {
  const { id } = req.params
  const precedingTaskIds = normalizePrecedingTaskIds(req.body?.preceding_task_ids)

  logger.info('Setting preceding tasks for condition', { id, preceding_task_ids: precedingTaskIds })
  const precedingTaskValidation = await validatePrecedingTasksForCondition(id, precedingTaskIds)
  if (precedingTaskValidation) {
    return res.status(400).json({
      success: false,
      error: precedingTaskValidation,
      timestamp: new Date().toISOString(),
    })
  }
  const conditionProject = await executeSQLOne<TaskProjectRow>(
    'SELECT project_id FROM task_conditions WHERE id = ? LIMIT 1',
    [id],
  )
  const conditionProjectId = String(conditionProject?.project_id ?? '').trim()
  if (!conditionProjectId) {
    return res.status(404).json({
      success: false,
      error: { code: 'CONDITION_NOT_FOUND', message: '开工条件不存在' },
      timestamp: new Date().toISOString(),
    } satisfies ApiResponse<never>)
  }

  // 1. 清空关系表中该条件的所有关系
  await clearPrecedingRelationRowsByCondition(id)

  // 2. 批量写入新的前置任务关系
  if (precedingTaskIds.length > 0) {
    for (const taskId of precedingTaskIds) {
      await insertPrecedingRelationRow(id, taskId)
    }
  }

  // 3. 返回更新后的前置任务列表（两步查询避免 JOIN 正则截断）
  const updatedRows = await loadPrecedingRelationRowsByCondition(id)
  const relations: PrecedingTaskRow[] = []
  for (const row of updatedRows) {
    const task = await loadPrecedingTaskRow(row.task_id)
    if (task) relations.push(task)
  }

  const response: ApiResponse<PrecedingTaskRow[]> = {
    success: true,
    data: relations || [],
    timestamp: new Date().toISOString(),
  }
  res.json(response)
}))

// P2-9: 移除单条前置任务关系
router.delete('/:conditionId/preceding-tasks/:taskId', authenticate, requireProjectEditor(async (req) => {
  const cond = await executeSQLOne<TaskProjectRow>('SELECT project_id FROM task_conditions WHERE id = ?', [req.params.conditionId])
  return cond?.project_id
}), asyncHandler(async (req, res) => {
  const { conditionId, taskId } = req.params
  logger.info('Removing preceding task relation', { conditionId, taskId })

  await deletePrecedingRelationRow(conditionId, taskId)

  const response: ApiResponse = {
    success: true,
    timestamp: new Date().toISOString(),
  }
  res.json(response)
}))

export default router
