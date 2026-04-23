// 验收计划 API 路由

import { Router } from 'express'
import { asyncHandler } from '../middleware/errorHandler.js'
import { authenticate, requireProjectEditor } from '../middleware/auth.js'
import { logger } from '../middleware/logger.js'
import { executeSQL, executeSQLOne, getMembers, getTask, updateTask } from '../services/dbService.js'
import { v4 as uuidv4 } from 'uuid'
import type { ApiResponse } from '../types/index.js'
import type { AcceptancePlan, AcceptanceNode } from '../types/db.js'
import { ValidationService } from '../services/validationService.js'
import { persistNotification } from '../services/warningChainService.js'
import {
  filterAcceptanceFlowSnapshot,
  getAcceptanceFlowSnapshot,
  listAcceptanceRequirements,
  type AcceptanceFlowFilters,
} from '../services/acceptanceFlowService.js'
import {
  ACCEPTANCE_STATUS_TRANSITIONS,
  acceptanceStatusLabel,
  normalizeAcceptanceStatus,
  parseAcceptanceStatus,
} from '../utils/acceptanceStatus.js'
import {
  ACCEPTANCE_NODE_COLUMNS,
  ACCEPTANCE_PLAN_COLUMNS,
} from '../services/sqlColumns.js'

const router = Router()
router.use(authenticate)
const ACCEPTANCE_PLAN_SELECT = `SELECT ${ACCEPTANCE_PLAN_COLUMNS} FROM acceptance_plans`
const ACCEPTANCE_NODE_SELECT = `SELECT ${ACCEPTANCE_NODE_COLUMNS} FROM acceptance_nodes`

const ACCEPTANCE_JSON_FIELDS = ['documents']
const ACCEPTANCE_PERSISTED_FIELDS = new Set([
  'project_id',
  'task_id',
  'building_id',
  'scope_level',
  'participant_unit_id',
  'responsible_user_id',
  'catalog_id',
  'type_id',
  'type_name',
  'acceptance_type',
  'acceptance_name',
  'planned_date',
  'actual_date',
  'status',
  'phase',
  'phase_order',
  'sort_order',
  'parallel_group_id',
  'documents',
  'notes',
  'created_by',
  'type_id',
  'type_name',
  'type_color',
  'description',
])

function normalizeAcceptanceValue(key: string, value: unknown) {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (trimmed === '') return null
    if (ACCEPTANCE_JSON_FIELDS.includes(key)) return trimmed
    return trimmed
  }

  if (value == null) return null

  if (ACCEPTANCE_JSON_FIELDS.includes(key) && (Array.isArray(value) || typeof value === 'object')) {
    return JSON.stringify(value)
  }

  return value
}

function normalizeAcceptanceBody(body: Record<string, any>) {
  const payload: Record<string, any> = { ...body }

  if (payload.milestone_id && !payload.task_id) {
    payload.task_id = payload.milestone_id
  }

  if (payload.name && !payload.acceptance_name) {
    payload.acceptance_name = payload.name
  }

  if (payload.type_name && !payload.acceptance_type) {
    payload.acceptance_type = payload.type_name
  }

  if (payload.phase_code && !payload.phase) {
    payload.phase = payload.phase_code
  }

  delete payload.name
  delete payload.milestone_id
  delete payload.is_system
  delete payload.nodes
  delete payload.phase_code

  if (payload.status) {
    payload.status = normalizeAcceptanceStatus(payload.status)
  }

  return Object.fromEntries(
    Object.entries(payload)
      .filter(([key]) => ACCEPTANCE_PERSISTED_FIELDS.has(key))
      .map(([key, value]) => [key, normalizeAcceptanceValue(key, value)]),
  )
}

function uniqueRecipients(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => Boolean(value && value.trim())))]
}

function parseCsvQueryValue(value: unknown) {
  if (Array.isArray(value)) {
    return value
      .flatMap((item) => String(item ?? '').split(','))
      .map((item) => item.trim())
      .filter(Boolean)
  }
  return String(value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

function parseBooleanQueryValue(value: unknown) {
  const normalized = String(value ?? '').trim().toLowerCase()
  return ['1', 'true', 'yes', 'y', 'on'].includes(normalized)
}

function buildAcceptanceFlowFilters(query: Record<string, unknown>): AcceptanceFlowFilters {
  return {
    task_id: String(query.taskId ?? query.task_id ?? '').trim() || null,
    building_id: String(query.buildingId ?? query.building_id ?? '').trim() || null,
    scope_level: String(query.scopeLevel ?? query.scope_level ?? '').trim() || null,
    participant_unit_id: String(query.participantUnitId ?? query.participant_unit_id ?? '').trim() || null,
    catalog_id: String(query.catalogId ?? query.catalog_id ?? '').trim() || null,
    phase_code: String(query.phaseCode ?? query.phase_code ?? '').trim() || null,
    statuses: parseCsvQueryValue(query.status ?? query.statuses).map((status) => normalizeAcceptanceStatus(status)),
    overlay_tag: String(query.overlayTag ?? query.overlay_tag ?? '').trim() || null,
    blocked_only: parseBooleanQueryValue(query.blockedOnly ?? query.blocked_only),
  }
}

function validateAcceptanceStatusTransition(currentStatus: string, nextStatus: string, actualDate?: string) {
  const current = parseAcceptanceStatus(currentStatus)
  const next = parseAcceptanceStatus(nextStatus)
  const errors: string[] = []

  if (!current) {
    errors.push('当前验收状态无效，无法执行状态流转')
  }
  if (!next) {
    errors.push('验收状态无效，必须使用标准状态枚举')
  }
  if (!current || !next) {
    return { valid: false, errors, normalizedStatus: null }
  }

  if (current === next) {
    return { valid: true, errors: [] as string[], normalizedStatus: next }
  }

  const allowedNext = ACCEPTANCE_STATUS_TRANSITIONS[current] || []

  if (!allowedNext.includes(next)) {
    errors.push(`不允许从"${acceptanceStatusLabel(current)}"变更为"${acceptanceStatusLabel(next)}"`)
  }

  if (next === 'passed' && !actualDate) {
    errors.push('已通过状态必须提供实际验收日期')
  }

  return {
    valid: errors.length === 0,
    errors,
    normalizedStatus: next,
  }
}

async function notifyAcceptanceStatusChange(current: AcceptancePlan, next: AcceptancePlan) {
  const currentStatus = normalizeAcceptanceStatus(current.status)
  const nextStatus = normalizeAcceptanceStatus(next.status)
  if (currentStatus === nextStatus) return

  const members = await getMembers(next.project_id)
  const recipients = uniqueRecipients(
    members
      .filter((member) => member.role === 'owner')
      .map((member) => member.user_id),
  )

  if (recipients.length === 0) return

  await persistNotification({
    project_id: next.project_id,
    type: 'acceptance_status_changed',
    notification_type: 'flow-reminder',
    severity: nextStatus === 'rectifying' ? 'warning' : 'info',
    title: '验收状态已更新',
    content: `验收“${next.plan_name || next.acceptance_name || next.id}”已从${acceptanceStatusLabel(currentStatus)}变更为${acceptanceStatusLabel(nextStatus)}。`,
    is_read: false,
    is_broadcast: false,
    source_entity_type: 'acceptance_plan',
    source_entity_id: next.id,
    task_id: next.task_id,
    category: 'acceptance',
    recipients,
    created_at: new Date().toISOString(),
  })
}

async function syncLinkedTaskOnAcceptancePass(plan: AcceptancePlan) {
  const status = normalizeAcceptanceStatus(plan.status)
  if (!['passed', 'archived'].includes(status) || !plan.task_id) return

  const linkedTask = await getTask(plan.task_id)
  if (!linkedTask) return

  const updates: Record<string, unknown> = {}
  if (!['completed', '已完成'].includes(String(linkedTask.status ?? '').trim())) {
    updates.status = 'completed'
  }
  if (Number(linkedTask.progress ?? 0) < 100) {
    updates.progress = 100
  }
  if (!linkedTask.actual_end_date) {
    updates.actual_end_date = plan.actual_date || new Date().toISOString().split('T')[0]
  }

  if (Object.keys(updates).length === 0) return

  await updateTask(plan.task_id, updates)
}

async function validateAcceptanceStatusPreconditions(planId: string, nextStatus: string) {
  const requirements = await listAcceptanceRequirements(planId)
  return ValidationService.validateAcceptanceStatusPreconditions(nextStatus, requirements || [])
}

// P0-3修复：批量查询验收节点接口（解决N+1查询问题）
router.get('/batch/nodes', asyncHandler(async (req, res) => {
  const { planIds } = req.query

  if (!planIds || typeof planIds !== 'string') {
    const response: ApiResponse = {
      success: false,
      error: { code: 'INVALID_IDS', message: 'planIds必须是字符串数组格式' },
      timestamp: new Date().toISOString(),
    }
    return res.status(400).json(response)
  }

  // 解析planIds（支持逗号分隔的字符串）
  const planIdArray = planIds.split(',').filter(id => id.trim())

  if (planIdArray.length === 0) {
    const response: ApiResponse<Record<string, AcceptanceNode[]>> = {
      success: true,
      data: {},
      timestamp: new Date().toISOString(),
    }
    return res.json(response)
  }

  logger.info('Batch fetching acceptance nodes', { planIds: planIdArray })

  // 批量查询所有计划的所有节点
  const placeholders = planIdArray.map(() => '?').join(', ')
  const data = await executeSQL(
    `${ACCEPTANCE_NODE_SELECT}
     WHERE acceptance_plan_id IN (${placeholders})
     ORDER BY planned_date ASC`,
    planIdArray
  )

  // 按计划ID分组
  const grouped = (data || []).reduce((acc: Record<string, AcceptanceNode[]>, node: any) => {
    if (!acc[node.acceptance_plan_id]) {
      acc[node.acceptance_plan_id] = []
    }
    acc[node.acceptance_plan_id].push(node)
    return acc
  }, {})

  const response: ApiResponse<Record<string, AcceptanceNode[]>> = {
    success: true,
    data: grouped,
    timestamp: new Date().toISOString(),
  }
  res.json(response)
}))

// 获取项目的所有验收计划
router.get('/', asyncHandler(async (req, res) => {
  const projectId = req.query.projectId as string
  const taskId = req.query.taskId as string
  const filters = buildAcceptanceFlowFilters(req.query as Record<string, unknown>)

  if (!projectId && !taskId) {
    const response: ApiResponse = {
      success: false,
      error: { code: 'MISSING_ID', message: '项目ID或任务ID不能为空' },
      timestamp: new Date().toISOString(),
    }
    return res.status(400).json(response)
  }

  logger.info('Fetching acceptance plans', { projectId, taskId, filters })

  let data: AcceptancePlan[] = []
  if (projectId) {
    const snapshot = await getAcceptanceFlowSnapshot(projectId)
    data = filterAcceptanceFlowSnapshot(snapshot, filters).plans
  } else {
    const rows = await executeSQL<AcceptancePlan>(
      `${ACCEPTANCE_PLAN_SELECT} WHERE task_id = ? ORDER BY planned_date ASC, created_at ASC`,
      [taskId]
    )
    const normalizedRows = (rows || []).map((row) => ({
      ...row,
      status: normalizeAcceptanceStatus(row.status),
      phase_code: (row as any).phase_code ?? row.phase ?? null,
      overlay_tags: Array.isArray((row as any).overlay_tags) ? (row as any).overlay_tags : [],
      display_badges: Array.isArray((row as any).display_badges) ? (row as any).display_badges : [],
    }))
    data = filterAcceptanceFlowSnapshot({
      catalogs: [],
      plans: normalizedRows,
      dependencies: [],
      requirements: [],
      records: [],
    }, filters).plans
  }

  const response: ApiResponse<AcceptancePlan[]> = {
    success: true,
    data: data || [],
    timestamp: new Date().toISOString(),
  }
  res.json(response)
}))

router.get('/flow-snapshot', asyncHandler(async (req, res) => {
  const projectId = String(req.query.projectId ?? req.query.project_id ?? '').trim()
  if (!projectId) {
    const response: ApiResponse = {
      success: false,
      error: { code: 'MISSING_PROJECT_ID', message: 'projectId 不能为空' },
      timestamp: new Date().toISOString(),
    }
    return res.status(400).json(response)
  }

  const filters = buildAcceptanceFlowFilters(req.query as Record<string, unknown>)
  logger.info('Fetching acceptance flow snapshot', { projectId, filters })

  const snapshot = filterAcceptanceFlowSnapshot(await getAcceptanceFlowSnapshot(projectId), filters)
  const response: ApiResponse<typeof snapshot> = {
    success: true,
    data: snapshot,
    timestamp: new Date().toISOString(),
  }
  res.json(response)
}))

// 获取单个验收计划
router.get('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params
  logger.info('Fetching acceptance plan', { id })

  const data = await executeSQLOne(
    `${ACCEPTANCE_PLAN_SELECT} WHERE id = ? LIMIT 1`,
    [id]
  )

  if (!data) {
    const response: ApiResponse = {
      success: false,
      error: { code: 'ACCEPTANCE_NOT_FOUND', message: '验收计划不存在' },
      timestamp: new Date().toISOString(),
    }
    return res.status(404).json(response)
  }

  const response: ApiResponse<AcceptancePlan> = {
    success: true,
    data,
    timestamp: new Date().toISOString(),
  }
  res.json(response)
}))

// 创建验收计划
router.post('/', requireProjectEditor(req => req.body.project_id), asyncHandler(async (req, res) => {
  logger.info('Creating acceptance plan', req.body)

  // 验证数据
  const validation = ValidationService.validateAcceptancePlan(req.body)
  if (!validation.valid) {
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: validation.errors.join('; ')
      },
      timestamp: new Date().toISOString(),
    }
    return res.status(400).json(response)
  }

  const id = uuidv4()
  const now = new Date().toISOString()
  // F-7修复：优先使用认证用户ID，确保在users表中存在
  let createdBy = req.body.created_by || req.body.user_id || req.user?.id || null
  if (createdBy) {
    // 确认用户存在于 users 表
    const user = await executeSQLOne('SELECT id FROM users WHERE id = ? LIMIT 1', [createdBy])
    if (!user) createdBy = null
  }
  // 兜底：如果created_by仍为null，尝试使用dev-user-id（开发环境常用）
  if (!createdBy && req.user?.id) {
    const devUser = await executeSQLOne('SELECT id FROM users WHERE id = ? LIMIT 1', [req.user.id])
    createdBy = devUser?.id ?? null
  }

  // 兜底：acceptance_type 在迁移033执行前是 NOT NULL 字段且有 CHECK 约束
  // 只允许：'分项', '分部', '竣工', '消防', '环保', '规划', '节能', '智能', '其他'
  // 迁移033执行后可为 NULL，此兜底值不影响
  const DB_VALID_ACCEPTANCE_TYPES = ['分项', '分部', '竣工', '消防', '环保', '规划', '节能', '智能', '其他']
  const rawType = req.body.acceptance_type || ''
  const resolvedAcceptanceType = DB_VALID_ACCEPTANCE_TYPES.includes(rawType) ? rawType : '其他'

  // 构建动态 INSERT
  const fields: string[] = ['id', 'created_at', 'updated_at']
  const values: any[] = [id, now, now]
  const placeholders: string[] = ['?', '?', '?']

  // 合并 body，确保 acceptance_type 始终有值（兼容迁移033执行前的旧数据库）
  const mergedBody = {
    ...req.body,
    acceptance_type: resolvedAcceptanceType
  }

  const normalizedBody = normalizeAcceptanceBody(mergedBody)

  for (const [key, val] of Object.entries(normalizedBody)) {
    fields.push(key)
    values.push(val)
    placeholders.push('?')
  }
  // 只有当 createdBy 是有效 UUID 时才添加到 INSERT
  if (createdBy) {
    fields.push('created_by')
    values.push(createdBy)
    placeholders.push('?')
  }

  await executeSQL(
    `INSERT INTO acceptance_plans (${fields.join(', ')}) VALUES (${placeholders.join(', ')})`,
    values
  )

  const data = await executeSQLOne(
    `${ACCEPTANCE_PLAN_SELECT} WHERE id = ? LIMIT 1`,
    [id]
  )

  const response: ApiResponse<AcceptancePlan> = {
    success: true,
    data,
    timestamp: new Date().toISOString(),
  }
  res.status(201).json(response)
}))

// 更新验收计划
router.put('/:id', requireProjectEditor(async (req) => {
  const row = await executeSQLOne(
    'SELECT project_id FROM acceptance_plans WHERE id = ? LIMIT 1',
    [req.params.id]
  ) as any
  return row?.project_id
}), asyncHandler(async (req, res) => {
  const { id } = req.params
  logger.info('Updating acceptance plan', { id })

  // 获取当前状态
  const current = await executeSQLOne(
    `${ACCEPTANCE_PLAN_SELECT} WHERE id = ? LIMIT 1`,
    [id]
  )

  if (!current) {
    const response: ApiResponse = {
      success: false,
      error: { code: 'ACCEPTANCE_NOT_FOUND', message: '验收计划不存在' },
      timestamp: new Date().toISOString(),
    }
    return res.status(404).json(response)
  }

  // 如果更新状态，验证状态转换
  if (req.body.status && req.body.status !== current.status) {
    const statusValidation = validateAcceptanceStatusTransition(
      current.status,
      req.body.status,
      req.body.actual_date
    )
    if (!statusValidation.valid) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'STATUS_TRANSITION_ERROR',
          message: statusValidation.errors.join('; ')
        },
        timestamp: new Date().toISOString(),
      }
      return res.status(400).json(response)
    }

    const preconditionValidation = await validateAcceptanceStatusPreconditions(id, statusValidation.normalizedStatus)
    if (!preconditionValidation.valid) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'PRECONDITION_NOT_MET',
          message: preconditionValidation.errors.join('; '),
        },
        timestamp: new Date().toISOString(),
      }
      return res.status(400).json(response)
    }

    req.body.status = statusValidation.normalizedStatus
  }

  const updateBody = normalizeAcceptanceBody(req.body)

  if (Object.keys(updateBody).length === 0) {
    const response: ApiResponse<AcceptancePlan> = {
      success: true,
      data: current,
      timestamp: new Date().toISOString(),
    }
    return res.json(response)
  }

  // 验证其他数据。优先基于规范化后的持久字段做校验，避免旧兼容字段重新污染新模型写入。
  const validation = ValidationService.validateAcceptancePlan({
    ...current,
    ...updateBody,
  })
  if (!validation.valid) {
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: validation.errors.join('; ')
      },
      timestamp: new Date().toISOString(),
    }
    return res.status(400).json(response)
  }

  // 构建动态 UPDATE
  const setClauses: string[] = []
  const setValues: any[] = []

  for (const [key, val] of Object.entries(updateBody)) {
    setClauses.push(`${key} = ?`)
    setValues.push(val)
  }

  if (setClauses.length === 0) {
    const response: ApiResponse<AcceptancePlan> = {
      success: true,
      data: current,
      timestamp: new Date().toISOString(),
    }
    return res.json(response)
  }

  await executeSQL(
    `UPDATE acceptance_plans SET ${setClauses.join(', ')} WHERE id = ?`,
    [...setValues, id]
  )

  const data = await executeSQLOne(
    `${ACCEPTANCE_PLAN_SELECT} WHERE id = ? LIMIT 1`,
    [id]
  )

  const response: ApiResponse<AcceptancePlan> = {
    success: true,
    data,
    timestamp: new Date().toISOString(),
  }
  if (data) {
    await notifyAcceptanceStatusChange(current, data)
    await syncLinkedTaskOnAcceptancePass(data)
  }
  res.json(response)
}))

router.patch('/:id/status', asyncHandler(async (req, res) => {
  const { id } = req.params
  const { status, actual_date } = req.body ?? {}
  logger.info('Updating acceptance plan status', { id, status })

  const current = await executeSQLOne<AcceptancePlan>(
    `${ACCEPTANCE_PLAN_SELECT} WHERE id = ? LIMIT 1`,
    [id]
  )

  if (!current) {
    const response: ApiResponse = {
      success: false,
      error: { code: 'ACCEPTANCE_NOT_FOUND', message: '验收计划不存在' },
      timestamp: new Date().toISOString(),
    }
    return res.status(404).json(response)
  }

  if (!status) {
    const response: ApiResponse = {
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'status 不能为空' },
      timestamp: new Date().toISOString(),
    }
    return res.status(400).json(response)
  }

  const statusValidation = validateAcceptanceStatusTransition(
    current.status,
    status,
    actual_date
  )

  if (!statusValidation.valid) {
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'STATUS_TRANSITION_ERROR',
        message: statusValidation.errors.join('; ')
      },
      timestamp: new Date().toISOString(),
    }
    return res.status(400).json(response)
  }

  const preconditionValidation = await validateAcceptanceStatusPreconditions(id, statusValidation.normalizedStatus)
  if (!preconditionValidation.valid) {
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'PRECONDITION_NOT_MET',
        message: preconditionValidation.errors.join('; '),
      },
      timestamp: new Date().toISOString(),
    }
    return res.status(400).json(response)
  }

  const updates: Record<string, unknown> = {
    status: statusValidation.normalizedStatus,
    updated_at: new Date().toISOString(),
  }

  if (actual_date !== undefined) {
    updates.actual_date = actual_date || null
  }

  const setClauses = Object.keys(updates).map((key) => `${key} = ?`)
  await executeSQL(
    `UPDATE acceptance_plans SET ${setClauses.join(', ')} WHERE id = ?`,
    [...Object.values(updates), id]
  )

  const data = await executeSQLOne<AcceptancePlan>(
    `${ACCEPTANCE_PLAN_SELECT} WHERE id = ? LIMIT 1`,
    [id]
  )

  const response: ApiResponse<AcceptancePlan> = {
    success: true,
    data,
    timestamp: new Date().toISOString(),
  }
  if (data) {
    await notifyAcceptanceStatusChange(current, data)
    await syncLinkedTaskOnAcceptancePass(data)
  }
  res.json(response)
}))

// 删除验收计划
router.delete('/:id', requireProjectEditor(async (req) => {
  const row = await executeSQLOne(
    'SELECT project_id FROM acceptance_plans WHERE id = ? LIMIT 1',
    [req.params.id]
  ) as any
  return row?.project_id
}), asyncHandler(async (req, res) => {
  const { id } = req.params
  logger.info('Deleting acceptance plan', { id })

  await executeSQL('DELETE FROM acceptance_plans WHERE id = ?', [id])

  const response: ApiResponse = {
    success: true,
    timestamp: new Date().toISOString(),
  }
  res.json(response)
}))

export default router
