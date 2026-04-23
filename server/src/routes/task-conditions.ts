// 任务开工条件 API 路由

import { Router } from 'express'
import { executeSQL, executeSQLOne, supabase } from '../services/dbService.js'
import { query as rawQuery } from '../database.js'
import { asyncHandler } from '../middleware/errorHandler.js'
import { authenticate, requireProjectEditor, requireProjectMember } from '../middleware/auth.js'
import { validate, conditionSchema, conditionUpdateSchema } from '../middleware/validation.js'
import { logger } from '../middleware/logger.js'
import { writeLifecycleLog, writeLog, writeStatusTransitionLog } from '../services/changeLogs.js'
import { enqueueProjectHealthUpdate } from '../services/projectHealthService.js'
import { ensureTaskConditionDrawingPackageColumns } from '../services/taskConditionLinkageService.js'
import type { ApiResponse } from '../types/index.js'
import type { TaskCondition } from '../types/db.js'
import { v4 as uuidv4 } from 'uuid'

const router = Router()

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
  is_satisfied?: boolean | number | string | null
  satisfied_reason?: string | null
  satisfied_reason_note?: string | null
  confirmed_by?: string | null
  confirmed_at?: string | null
  attachments?: unknown
  preceding_task_id?: string | null
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

async function loadConditionTaskId(id: string) {
  const row = await executeSQLOne<TaskProjectRow>(
    'SELECT task_id FROM task_conditions WHERE id = ?',
    [id]
  )
  return row?.task_id ? String(row.task_id) : null
}

function extractMissingTaskConditionColumn(error: unknown) {
  const message = [
    typeof error === 'object' && error !== null && 'message' in error ? String((error as { message?: unknown }).message ?? '') : '',
    typeof error === 'object' && error !== null && 'details' in error ? String((error as { details?: unknown }).details ?? '') : '',
  ]
    .filter(Boolean)
    .join('\n')

  if (!message) return null

  const patterns = [
    /Could not find the '([^']+)' column of 'task_conditions'/i,
    /column \"([^\"]+)\" of relation \"task_conditions\" does not exist/i,
    /column \"([^\"]+)\" does not exist/i,
  ]

  for (const pattern of patterns) {
    const match = message.match(pattern)
    if (!match?.[1]) continue
    return match[1]
  }

  return null
}

async function insertTaskConditionRow(insertRow: Record<string, unknown>) {
  const workingRow = { ...insertRow }

  for (let attempt = 0; attempt < Object.keys(workingRow).length; attempt += 1) {
    try {
      const columns = Object.keys(workingRow)
      const placeholders = columns.map(() => '?').join(', ')
      await executeSQL(
        `INSERT INTO task_conditions (${columns.join(', ')}) VALUES (${placeholders})`,
        columns.map((column) => workingRow[column]),
      )
      return
    } catch (error) {
      const missing = extractMissingTaskConditionColumn(error)
      if (!missing) throw error

      if (missing === 'drawing_package_id' || missing === 'drawing_package_code') {
        logger.warn(`[task-conditions POST] missing task_conditions column "${missing}", reconciling schema before retry`, { attempt })
        await ensureTaskConditionDrawingPackageColumns()
        const columns = Object.keys(workingRow)
        const placeholders = columns.map((_, index) => `$${index + 1}`).join(', ')
        await rawQuery(
          `INSERT INTO public.task_conditions (${columns.join(', ')}) VALUES (${placeholders})`,
          columns.map((column) => workingRow[column]),
        )
        return
      }

      if (missing in workingRow) {
        logger.warn(`[task-conditions POST] schema cache missing column "${missing}", retrying without it`, { attempt })
        delete workingRow[missing]
        continue
      }

      throw error
    }
  }

  throw new Error('创建任务条件失败')
}

async function loadTaskLevelPrecedingTaskRowByCondition(id: string) {
  const conditionTaskId = await loadConditionTaskId(id)
  if (!conditionTaskId) return null

  try {
    const row = await executeSQLOne<{ preceding_task_id?: string | null }>(
      'SELECT preceding_task_id FROM tasks WHERE id = ?',
      [conditionTaskId]
    )
    if (!row?.preceding_task_id) return null
    return loadPrecedingTaskRow(row.preceding_task_id)
  } catch (error) {
    if (!isMissingRelationError(error, 'preceding_task_id')) {
      throw error
    }
    logger.warn('tasks.preceding_task_id missing, returning empty preceding task list', { id, conditionTaskId })
    return null
  }
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

function isMissingRelationError(error: unknown, relation: string) {
  const message = String((error as Error | undefined)?.message || '')
  const lowerMessage = message.toLowerCase()
  const lowerRelation = relation.toLowerCase()

  return lowerMessage.includes(lowerRelation) && (
    lowerMessage.includes('does not exist') ||
    lowerMessage.includes('不存在') ||
    lowerMessage.includes('schema cache') ||
    lowerMessage.includes('could not find the table') ||
    lowerMessage.includes('could not find the column')
  )
}

let ensureTaskPrecedingRelationsTablePromise: Promise<void> | null = null

async function ensureTaskPrecedingRelationsTable() {
  if (!ensureTaskPrecedingRelationsTablePromise) {
    ensureTaskPrecedingRelationsTablePromise = (async () => {
      await rawQuery(`
        CREATE TABLE IF NOT EXISTS public.task_preceding_relations (
          id UUID PRIMARY KEY,
          condition_id UUID NOT NULL REFERENCES public.task_conditions(id) ON DELETE CASCADE,
          task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `)
      await rawQuery(`
        CREATE UNIQUE INDEX IF NOT EXISTS uk_task_preceding_relations_condition_task
          ON public.task_preceding_relations(condition_id, task_id)
      `)
      await rawQuery(`
        CREATE INDEX IF NOT EXISTS idx_task_preceding_relations_condition_id
          ON public.task_preceding_relations(condition_id)
      `)
      await rawQuery(`
        CREATE INDEX IF NOT EXISTS idx_task_preceding_relations_task_id
          ON public.task_preceding_relations(task_id)
      `)
    })().catch((error) => {
      ensureTaskPrecedingRelationsTablePromise = null
      throw error
    })
  }

  return ensureTaskPrecedingRelationsTablePromise
}

function mapPrecedingRelationRows(rows: unknown[]) {
  return rows
    .map((row) => ({ task_id: String((row as { task_id?: string | null })?.task_id ?? '').trim() }))
    .filter((row) => Boolean(row.task_id))
}

async function probeTaskPrecedingRelationsTable() {
  try {
    await executeSQLOne('SELECT task_id FROM task_preceding_relations LIMIT 1')
    return
  } catch (error) {
    if (!isMissingRelationError(error, 'task_preceding_relations')) {
      throw error
    }
  }

  await rawQuery('SELECT task_id FROM public.task_preceding_relations LIMIT 1')
}

async function loadPrecedingRelationRowsByCondition(conditionId: string) {
  try {
    return await executeSQL<PrecedingRelationRow>(
      'SELECT task_id FROM task_preceding_relations WHERE condition_id = ?',
      [conditionId]
    )
  } catch (error) {
    if (!isMissingRelationError(error, 'task_preceding_relations')) {
      throw error
    }
  }

  const result = await rawQuery(
    'SELECT task_id FROM public.task_preceding_relations WHERE condition_id = $1',
    [conditionId]
  )
  return mapPrecedingRelationRows(result.rows)
}

async function clearPrecedingRelationRowsByCondition(conditionId: string) {
  try {
    await executeSQL('DELETE FROM task_preceding_relations WHERE condition_id = ?', [conditionId])
    return
  } catch (error) {
    if (!isMissingRelationError(error, 'task_preceding_relations')) {
      throw error
    }
  }

  await rawQuery('DELETE FROM public.task_preceding_relations WHERE condition_id = $1', [conditionId])
}

async function insertPrecedingRelationRow(conditionId: string, taskId: string) {
  const relationId = uuidv4()

  try {
    await executeSQL(
      `INSERT INTO task_preceding_relations (id, condition_id, task_id)
       VALUES (?, ?, ?)`,
      [relationId, conditionId, taskId]
    )
    return
  } catch (error) {
    if (!isMissingRelationError(error, 'task_preceding_relations')) {
      throw error
    }
  }

  await rawQuery(
    `INSERT INTO public.task_preceding_relations (id, condition_id, task_id)
     VALUES ($1, $2, $3)
     ON CONFLICT (condition_id, task_id) DO NOTHING`,
    [relationId, conditionId, taskId]
  )
}

async function deletePrecedingRelationRow(conditionId: string, taskId: string) {
  try {
    await executeSQL(
      'DELETE FROM task_preceding_relations WHERE condition_id = ? AND task_id = ?',
      [conditionId, taskId]
    )
    return
  } catch (error) {
    if (!isMissingRelationError(error, 'task_preceding_relations')) {
      throw error
    }
  }

  await rawQuery(
    'DELETE FROM public.task_preceding_relations WHERE condition_id = $1 AND task_id = $2',
    [conditionId, taskId]
  )
}

// 所有路由都需要认证
router.use(authenticate)

// 获取任务的所有开工条件（支持 taskId 和 projectId 两种查询方式）
router.get('/', asyncHandler(async (req, res) => {
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
    data = await executeSQL<ConditionRow>(
      'SELECT * FROM task_conditions WHERE task_id = ? ORDER BY created_at ASC LIMIT ? OFFSET ?',
      [taskId, limit, offset]
    )
  } else {
    logger.info('Fetching task conditions by projectId', { projectId, limit, offset })
    data = await executeSQL<ConditionRow>(
      'SELECT * FROM task_conditions WHERE project_id = ? ORDER BY created_at ASC LIMIT ? OFFSET ?',
      [projectId, limit, offset]
    )
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
router.post('/batch-satisfy', asyncHandler(async (req, res) => {
  const { task_id } = req.body
  if (!task_id) {
    return res.status(400).json({
      success: false,
      error: { code: 'MISSING_TASK_ID', message: '任务ID不能为空' },
      timestamp: new Date().toISOString()
    })
  }

  // 批量更新该任务所有 is_satisfied=false 的条件
  const pendingRows = await executeSQL<TaskIdRow>(
    'SELECT id FROM task_conditions WHERE task_id = ? AND is_satisfied = 0',
    [task_id]
  )
  const count = pendingRows.length
  if (count > 0) {
    await executeSQL(
      'UPDATE task_conditions SET is_satisfied = 1 WHERE task_id = ? AND is_satisfied = 0',
      [task_id]
    )
  }
  const taskRows = await executeSQL<TaskProjectRow>('SELECT project_id FROM tasks WHERE id = ?', [task_id])
  const projectId = taskRows?.[0]?.project_id ?? null
  if (projectId) {
    enqueueProjectHealthUpdate(projectId, 'task_condition_batch_satisfied')
  }

  const response: ApiResponse<{ count: number }> = {
    success: true,
    data: { count },
    timestamp: new Date().toISOString(),
  }
  res.json(response)
}))

// 获取单个开工条件
router.get('/:id', asyncHandler(async (req, res) => {
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
router.post('/', authenticate, requireProjectEditor(req => req.body.project_id), validate(conditionSchema), asyncHandler(async (req, res) => {
  logger.info('Creating task condition', req.body)

  const id = uuidv4()
  const ts = new Date().toISOString().slice(0, 19).replace('T', ' ')

  // [G3]: 从 tasks 表获取 project_id（如果没有传入）
  let projectId = req.body.project_id
  if (!projectId) {
    const taskRows = await executeSQL('SELECT project_id FROM tasks WHERE id = ?', [req.body.task_id])
    projectId = taskRows?.[0]?.project_id ?? null
  }

  const conditionType = normalizeConditionType(req.body.condition_type)

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
    responsible_unit: req.body.responsible_unit ?? null,
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
    'SELECT id, project_id, is_satisfied, satisfied_reason, satisfied_reason_note FROM task_conditions WHERE id = ? LIMIT 1',
    [id]
  )

  if (
    req.body.change_source === 'admin_force'
    && req.body.is_satisfied === true
    && !String(req.body.change_reason ?? '').trim()
  ) {
    const response: ApiResponse = {
      success: false,
      error: { code: 'FORCE_SATISFY_REASON_REQUIRED', message: '管理员强制满足必须填写原因' },
      timestamp: new Date().toISOString(),
    }
    return res.status(422).json(response)
  }

  // 如果标记为已满足，自动记录确认时间
  if (req.body.is_satisfied === true && !req.body.confirmed_at) {
    req.body.confirmed_at = new Date().toISOString().slice(0, 19).replace('T', ' ')
  }

  if (req.body.change_source === 'admin_force' && req.body.is_satisfied === true) {
    req.body.satisfied_reason = 'admin_force'
    req.body.satisfied_reason_note = String(req.body.change_reason ?? '').trim()
  }

  if (req.body.is_satisfied === false) {
    req.body.satisfied_reason = null
    req.body.satisfied_reason_note = null
  }

  const ts = new Date().toISOString().slice(0, 19).replace('T', ' ')
  const setClauses: string[] = ['updated_at = ?']
  const params: any[] = [ts]

  const fieldMap: Record<string, string> = {
    condition_name: 'name',
    name: 'name',
    condition_type: 'condition_type',
    description: 'description',
    drawing_package_id: 'drawing_package_id',
    drawing_package_code: 'drawing_package_code',
    target_date: 'target_date',
    is_satisfied: 'is_satisfied',
    satisfied_reason: 'satisfied_reason',
    satisfied_reason_note: 'satisfied_reason_note',
    attachments: 'attachments',
    confirmed_by: 'confirmed_by',
    confirmed_at: 'confirmed_at',
  }

  for (const [key, col] of Object.entries(fieldMap)) {
    if (req.body[key] !== undefined) {
      setClauses.push(`${col} = ?`)
      if (key === 'is_satisfied') {
        params.push(req.body[key] ? 1 : 0)
      } else if (key === 'condition_type') {
        params.push(normalizeConditionType(req.body[key]))
      } else {
        params.push(req.body[key])
      }
    }
  }

  params.push(id)
  await executeSQL(`UPDATE task_conditions SET ${setClauses.join(', ')} WHERE id = ?`, params)

  const data = await executeSQLOne<ConditionRow>('SELECT * FROM task_conditions WHERE id = ? LIMIT 1', [id])
  if (!data) {
    const response: ApiResponse = {
      success: false,
      error: { code: 'CONDITION_NOT_FOUND', message: '开工条件不存在' },
      timestamp: new Date().toISOString(),
    }
    return res.status(404).json(response)
  }

  if (
    previous &&
    req.body.change_source === 'admin_force' &&
    typeof req.body.is_satisfied === 'boolean' &&
    Boolean(previous.is_satisfied) !== Boolean(req.body.is_satisfied)
  ) {
    await writeLog({
      project_id: previous.project_id ?? data.project_id ?? null,
      entity_type: 'task_condition',
      entity_id: id,
      field_name: 'force_satisfy',
      old_value: Boolean(previous.is_satisfied),
      new_value: Boolean(req.body.is_satisfied),
      change_reason: String(req.body.change_reason ?? '').trim(),
      changed_by: req.user?.id ?? null,
      change_source: 'admin_force',
    })
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
      change_source: req.body.change_source === 'admin_force' ? 'admin_force' : 'manual_adjusted',
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
  const existing = await executeSQLOne('SELECT project_id FROM task_conditions WHERE id = ? LIMIT 1', [id]) as { project_id?: string | null } | null

  const { data, error } = await supabase.rpc('delete_task_condition_with_source_backfill_atomic', {
    p_condition_id: id,
  })

  if (error) throw error
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
      confirmed_by: confirmed_by || userId
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

    // P1修复：条件完成后重新计算任务的业务状态
    const businessStatus = await BusinessStatusService.calculateBusinessStatus(condition.task_id)

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
router.get('/:id/preceding-tasks', asyncHandler(async (req, res) => {
  const { id } = req.params
  logger.info('Fetching preceding tasks for condition', { id })

  // 优先从 junction 表读取多对多关系（两步查询避免 JOIN 正则截断）
  let precedingRows: PrecedingRelationRow[] = []
  try {
    precedingRows = await loadPrecedingRelationRowsByCondition(id)
  } catch (error) {
    if (!isMissingRelationError(error, 'task_preceding_relations')) {
      throw error
    }
    logger.warn('task_preceding_relations missing, attempting runtime self-heal before falling back', { id })
    try {
      await ensureTaskPrecedingRelationsTable()
      precedingRows = await loadPrecedingRelationRowsByCondition(id)
    } catch (ensureError) {
      logger.warn('Failed to self-heal task_preceding_relations during preceding-task fetch, falling back to legacy fields', {
        id,
        error: ensureError instanceof Error ? ensureError.message : String(ensureError),
      })
    }
  }
  const relations: PrecedingTaskRow[] = []
  for (const row of precedingRows) {
    const task = await loadPrecedingTaskRow(row.task_id)
    if (task) relations.push(task)
  }

  // 兼容旧数据：如果 junction 表无数据，尝试从 task_conditions.preceding_task_id 读取
  if (relations.length === 0) {
    try {
      const condition = await executeSQLOne<ConditionSnapshot>(
        'SELECT preceding_task_id FROM task_conditions WHERE id = ?',
        [id]
      )
      if (condition?.preceding_task_id) {
        const legacyTask = await loadPrecedingTaskRow(condition.preceding_task_id)
        if (legacyTask) relations.push(legacyTask)
      }
    } catch (error) {
      if (!isMissingRelationError(error, 'preceding_task_id')) {
        throw error
      }
      logger.warn('task_conditions.preceding_task_id missing, falling back to tasks.preceding_task_id', { id })
      const taskLevelPreceding = await loadTaskLevelPrecedingTaskRowByCondition(id)
      if (taskLevelPreceding) relations.push(taskLevelPreceding)
    }
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

  // 优先走 junction 表；若 relation 表缺失则尝试运行时自愈，实在无法自愈时再降级到旧字段。
  let relationTableAvailable = true
  try {
    await probeTaskPrecedingRelationsTable()
  } catch (error) {
    if (isMissingRelationError(error, 'task_preceding_relations')) {
      logger.warn('task_preceding_relations missing, attempting runtime self-heal before legacy fallback', {
        id,
        requestedCount: precedingTaskIds.length,
      })
      try {
        await ensureTaskPrecedingRelationsTable()
        await probeTaskPrecedingRelationsTable()
      } catch (ensureError) {
        relationTableAvailable = false
        logger.warn('Failed to self-heal task_preceding_relations, falling back to legacy preceding_task_id persistence', {
          id,
          requestedCount: precedingTaskIds.length,
          error: ensureError instanceof Error ? ensureError.message : String(ensureError),
        })
      }
    } else {
      throw error
    }
  }

  if (!relationTableAvailable) {
    const fallbackTaskId = precedingTaskIds[0] ?? null
    try {
      await executeSQL(
        'UPDATE task_conditions SET preceding_task_id = ?, updated_at = ? WHERE id = ?',
        [fallbackTaskId, new Date().toISOString().slice(0, 19).replace('T', ' '), id]
      )
    } catch (legacyError) {
      if (!isMissingRelationError(legacyError, 'preceding_task_id')) {
        throw legacyError
      }
      logger.warn('task_conditions.preceding_task_id missing during preceding-task fallback persistence', {
        id,
        fallbackTaskId,
        error: legacyError instanceof Error ? legacyError.message : String(legacyError),
      })
      const conditionTaskId = await loadConditionTaskId(id)
      if (!conditionTaskId) {
        logger.warn('Could not locate task_conditions.task_id during preceding-task fallback persistence', { id })
        return res.status(500).json({
          success: false,
          error: {
            code: 'RELATION_TABLE_MISSING',
            message: '前置任务关系表缺失，且无法定位条件所属任务',
          },
          timestamp: new Date().toISOString(),
        } satisfies ApiResponse<never>)
      }

      try {
        const { error: taskFallbackError } = await supabase
          .from('tasks')
          .update({
            preceding_task_id: fallbackTaskId,
            updated_at: new Date().toISOString().slice(0, 19).replace('T', ' '),
          })
          .eq('id', conditionTaskId)

        if (taskFallbackError) {
          throw new Error(taskFallbackError.message)
        }
      } catch (taskFallbackError) {
        if (!isMissingRelationError(taskFallbackError, 'preceding_task_id')) {
          throw taskFallbackError
        }
        logger.warn('tasks.preceding_task_id missing during preceding-task fallback persistence', {
          id,
          conditionTaskId,
          fallbackTaskId,
          error: taskFallbackError instanceof Error ? taskFallbackError.message : String(taskFallbackError),
        })

        return res.status(500).json({
          success: false,
          error: {
            code: 'RELATION_TABLE_MISSING',
            message: '前置任务关系表与旧字段均缺失，无法保存前置任务',
          },
          timestamp: new Date().toISOString(),
        } satisfies ApiResponse<never>)
      }
    }

    const fallbackTask = await loadPrecedingTaskRow(fallbackTaskId)
    const response: ApiResponse<PrecedingTaskRow[]> = {
      success: true,
      data: fallbackTask ? [fallbackTask] : [],
      timestamp: new Date().toISOString(),
    }
    return res.json(response)
  }

  // 1. 兼容旧数据：如果旧字段有值，先写入 junction 表（迁一次）
  let existingCondition: ConditionSnapshot | null = null
  try {
    existingCondition = await executeSQLOne<ConditionSnapshot>(
      'SELECT preceding_task_id FROM task_conditions WHERE id = ?',
      [id]
    )
  } catch (error) {
    if (!isMissingRelationError(error, 'preceding_task_id')) {
      throw error
    }
  }
  if (existingCondition?.preceding_task_id) {
    await insertPrecedingRelationRow(id, existingCondition.preceding_task_id)
    try {
      await executeSQL(
        'UPDATE task_conditions SET preceding_task_id = NULL WHERE id = ?',
        [id]
      )
    } catch (error) {
      if (!isMissingRelationError(error, 'preceding_task_id')) {
        throw error
      }
    }
  }

  // 2. 清空 junction 表中该条件的所有关系
  await clearPrecedingRelationRowsByCondition(id)

  // 3. 批量写入新的前置任务关系
  if (precedingTaskIds.length > 0) {
    for (const taskId of precedingTaskIds) {
      await insertPrecedingRelationRow(id, taskId)
    }
  }

  // 4. 返回更新后的前置任务列表（两步查询避免 JOIN 正则截断）
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
