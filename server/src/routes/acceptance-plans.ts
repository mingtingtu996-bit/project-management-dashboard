// 验收计划 API 路由

import { Router } from 'express'
import { asyncHandler } from '../middleware/errorHandler.js'
import { authenticate } from '../middleware/auth.js'
import { logger } from '../middleware/logger.js'
import { executeSQL, executeSQLOne } from '../services/dbService.js'
import { v4 as uuidv4 } from 'uuid'
import type { ApiResponse } from '../types/index.js'
import type { AcceptancePlan, AcceptanceNode } from '../types/db.js'
import { ValidationService } from '../services/validationService.js'

const router = Router()
router.use(authenticate)

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
    `SELECT * FROM acceptance_nodes
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

  if (!projectId && !taskId) {
    const response: ApiResponse = {
      success: false,
      error: { code: 'MISSING_ID', message: '项目ID或任务ID不能为空' },
      timestamp: new Date().toISOString(),
    }
    return res.status(400).json(response)
  }

  logger.info('Fetching acceptance plans', { projectId, taskId })

  let data: any[]
  if (projectId) {
    data = await executeSQL(
      'SELECT * FROM acceptance_plans WHERE project_id = ? ORDER BY planned_date ASC',
      [projectId]
    )
  } else {
    data = await executeSQL(
      'SELECT * FROM acceptance_plans WHERE task_id = ? ORDER BY planned_date ASC',
      [taskId]
    )
  }

  const response: ApiResponse<AcceptancePlan[]> = {
    success: true,
    data: data || [],
    timestamp: new Date().toISOString(),
  }
  res.json(response)
}))

// 获取单个验收计划
router.get('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params
  logger.info('Fetching acceptance plan', { id })

  const data = await executeSQLOne(
    'SELECT * FROM acceptance_plans WHERE id = ? LIMIT 1',
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
router.post('/', asyncHandler(async (req, res) => {
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

  // JSON 序列化字段（前端传数组/对象，数据库存 JSON 字符串）
  const JSON_FIELDS = ['depends_on', 'depended_by', 'position', 'documents', 'nodes']

  // 字段白名单（只写入数据库实际存在的列，防止多余字段导致 INSERT 报错）
  const ALLOWED_FIELDS = [
    'project_id', 'milestone_id',
    // 新模型字段
    'name', 'description', 'type_id', 'type_name', 'type_color',
    // 旧模型字段（兼容）
    'acceptance_type', 'acceptance_name',
    // 通用字段
    'planned_date', 'actual_date', 'status',
    'depends_on', 'depended_by', 'phase', 'phase_order', 'position',
    'responsible_user_id', 'documents', 'is_system'
  ]

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

  const bodyKeys = Object.keys(mergedBody).filter(k =>
    k !== 'created_by' && k !== 'user_id' && ALLOWED_FIELDS.includes(k)
  )
  for (const key of bodyKeys) {
    fields.push(key)
    const val = mergedBody[key]
    // 数组/对象类型字段序列化为 JSON 字符串
    values.push(JSON_FIELDS.includes(key) && (Array.isArray(val) || (val && typeof val === 'object'))
      ? JSON.stringify(val)
      : val)
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
    'SELECT * FROM acceptance_plans WHERE id = ? LIMIT 1',
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
router.put('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params
  logger.info('Updating acceptance plan', { id })

  // 获取当前状态
  const current = await executeSQLOne(
    'SELECT * FROM acceptance_plans WHERE id = ? LIMIT 1',
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
    const statusValidation = ValidationService.validateAcceptanceStatusUpdate(
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
  }

  // 验证其他数据
  const validation = ValidationService.validateAcceptancePlan({
    ...current,
    ...req.body
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
  const updateBody = req.body
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
    'SELECT * FROM acceptance_plans WHERE id = ? LIMIT 1',
    [id]
  )

  const response: ApiResponse<AcceptancePlan> = {
    success: true,
    data,
    timestamp: new Date().toISOString(),
  }
  res.json(response)
}))

// 删除验收计划
router.delete('/:id', asyncHandler(async (req, res) => {
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
