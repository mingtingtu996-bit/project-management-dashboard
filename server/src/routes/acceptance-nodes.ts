// 验收节点 API 路由

import { Router } from 'express'
import { asyncHandler } from '../middleware/errorHandler.js'
import { authenticate } from '../middleware/auth.js'
import { logger } from '../middleware/logger.js'
import { executeSQL, executeSQLOne } from '../services/dbService.js'
import { v4 as uuidv4 } from 'uuid'
import type { ApiResponse } from '../types/index.js'
import type { AcceptanceNode } from '../types/db.js'
import { ValidationService } from '../services/validationService.js'

const router = Router()
router.use(authenticate)

// 验收节点状态转换验证（8类验收节点状态）
const ACCEPTANCE_NODE_STATUS_TRANSITIONS: Record<string, string[]> = {
  '待验收': ['验收中', '已通过'],
  '验收中': ['已通过', '未通过', '需补充'],
  '已通过': [],  // 终态，不允许变更
  '未通过': ['待验收'],
  '需补充': ['待验收']
}

// 验证状态转换是否合法
function validateNodeStatusTransition(currentStatus: string, newStatus: string): boolean {
  if (currentStatus === newStatus) return true
  const allowedTransitions = ACCEPTANCE_NODE_STATUS_TRANSITIONS[currentStatus]
  return allowedTransitions ? allowedTransitions.includes(newStatus) : false
}

// 批量查询验收节点接口（解决N+1查询问题，支持分页）
router.post('/batch', asyncHandler(async (req, res) => {
  const { planIds, limit = 100, offset = 0 } = req.body

  if (!Array.isArray(planIds) || planIds.length === 0) {
    const response: ApiResponse = {
      success: false,
      error: { code: 'INVALID_IDS', message: 'planIds必须是字符串数组' },
      timestamp: new Date().toISOString(),
    }
    return res.status(400).json(response)
  }

  // P1-3修复：验证分页参数
  const limitNum = parseInt(limit as string, 10)
  const offsetNum = parseInt(offset as string, 10)

  if (isNaN(limitNum) || limitNum < 1 || limitNum > 200) {
    const response: ApiResponse = {
      success: false,
      error: { code: 'INVALID_LIMIT', message: 'limit必须在1-200之间' },
      timestamp: new Date().toISOString(),
    }
    return res.status(400).json(response)
  }

  if (isNaN(offsetNum) || offsetNum < 0) {
    const response: ApiResponse = {
      success: false,
      error: { code: 'INVALID_OFFSET', message: 'offset必须是非负整数' },
      timestamp: new Date().toISOString(),
    }
    return res.status(400).json(response)
  }

  logger.info('Batch fetching acceptance nodes', { planIds, limit: limitNum, offset: offsetNum })

  const placeholders = planIds.map(() => '?').join(', ')

  // 获取总数
  const countRow = await executeSQLOne(
    `SELECT COUNT(*) AS total FROM acceptance_nodes WHERE acceptance_plan_id IN (${placeholders})`,
    planIds
  )
  const total = countRow ? Number(countRow.total) : 0

  // 分页查询
  const data = await executeSQL(
    `SELECT * FROM acceptance_nodes
     WHERE acceptance_plan_id IN (${placeholders})
     ORDER BY planned_date ASC
     LIMIT ? OFFSET ?`,
    [...planIds, limitNum, offsetNum]
  )

  // 按计划ID分组
  const grouped = (data || []).reduce((acc: Record<string, AcceptanceNode[]>, node: any) => {
    if (!acc[node.acceptance_plan_id]) {
      acc[node.acceptance_plan_id] = []
    }
    acc[node.acceptance_plan_id].push(node)
    return acc
  }, {})

  const response: ApiResponse<Record<string, AcceptanceNode[]>> & { total?: number } = {
    success: true,
    data: grouped,
    total,
    timestamp: new Date().toISOString(),
  }
  res.json(response)
}))

// 获取验收计划的所有节点（支持分页）
router.get('/', asyncHandler(async (req, res) => {
  const { planId, limit = 50, offset = 0 } = req.query

  if (!planId) {
    const response: ApiResponse = {
      success: false,
      error: { code: 'MISSING_PLAN_ID', message: '验收计划ID不能为空' },
      timestamp: new Date().toISOString(),
    }
    return res.status(400).json(response)
  }

  // P1-3修复：验证分页参数
  const limitNum = parseInt(limit as string, 10)
  const offsetNum = parseInt(offset as string, 10)

  if (isNaN(limitNum) || limitNum < 1 || limitNum > 100) {
    const response: ApiResponse = {
      success: false,
      error: { code: 'INVALID_LIMIT', message: 'limit必须在1-100之间' },
      timestamp: new Date().toISOString(),
    }
    return res.status(400).json(response)
  }

  if (isNaN(offsetNum) || offsetNum < 0) {
    const response: ApiResponse = {
      success: false,
      error: { code: 'INVALID_OFFSET', message: 'offset必须是非负整数' },
      timestamp: new Date().toISOString(),
    }
    return res.status(400).json(response)
  }

  logger.info('Fetching acceptance nodes', { planId, limit: limitNum, offset: offsetNum })

  // 获取总数
  const countRow = await executeSQLOne(
    'SELECT COUNT(*) AS total FROM acceptance_nodes WHERE acceptance_plan_id = ?',
    [planId]
  )
  const total = countRow ? Number(countRow.total) : 0

  // 分页查询
  const data = await executeSQL(
    `SELECT * FROM acceptance_nodes
     WHERE acceptance_plan_id = ?
     ORDER BY planned_date ASC
     LIMIT ? OFFSET ?`,
    [planId, limitNum, offsetNum]
  )

  const response: ApiResponse<AcceptanceNode[]> & { total?: number } = {
    success: true,
    data: data || [],
    total,
    timestamp: new Date().toISOString(),
  }
  res.json(response)
}))

// 获取单个验收节点
router.get('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params
  logger.info('Fetching acceptance node', { id })

  const data = await executeSQLOne(
    'SELECT * FROM acceptance_nodes WHERE id = ? LIMIT 1',
    [id]
  )

  if (!data) {
    const response: ApiResponse = {
      success: false,
      error: { code: 'NODE_NOT_FOUND', message: '验收节点不存在' },
      timestamp: new Date().toISOString(),
    }
    return res.status(404).json(response)
  }

  const response: ApiResponse<AcceptanceNode> = {
    success: true,
    data,
    timestamp: new Date().toISOString(),
  }
  res.json(response)
}))

// 创建验收节点
router.post('/', asyncHandler(async (req, res) => {
  logger.info('Creating acceptance node', req.body)

  // 验证必需字段
  const { acceptance_plan_id, node_name } = req.body
  if (!acceptance_plan_id || !node_name) {
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'acceptance_plan_id 和 node_name 是必需字段'
      },
      timestamp: new Date().toISOString(),
    }
    return res.status(400).json(response)
  }

  const id = uuidv4()
  const now = new Date().toISOString()
  const result = req.body.result ? JSON.stringify(req.body.result) : JSON.stringify({})
  const documents = req.body.documents ? JSON.stringify(req.body.documents) : JSON.stringify([])

  // 构建 INSERT（排除 result/documents，单独处理 JSON 序列化）
  const skipKeys = new Set(['result', 'documents'])
  const fields: string[] = ['id', 'created_at', 'result', 'documents']
  const values: any[] = [id, now, result, documents]
  const placeholders: string[] = ['?', '?', '?', '?']

  for (const [key, val] of Object.entries(req.body)) {
    if (!skipKeys.has(key)) {
      fields.push(key)
      values.push(val)
      placeholders.push('?')
    }
  }

  await executeSQL(
    `INSERT INTO acceptance_nodes (${fields.join(', ')}) VALUES (${placeholders.join(', ')})`,
    values
  )

  const data = await executeSQLOne(
    'SELECT * FROM acceptance_nodes WHERE id = ? LIMIT 1',
    [id]
  )

  const response: ApiResponse<AcceptanceNode> = {
    success: true,
    data,
    timestamp: new Date().toISOString(),
  }
  res.status(201).json(response)
}))

// 更新验收节点
router.put('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params
  logger.info('Updating acceptance node', { id })

  // 获取当前状态
  const current = await executeSQLOne(
    'SELECT status, actual_date, accepted_by, accepted_at FROM acceptance_nodes WHERE id = ? LIMIT 1',
    [id]
  )

  if (!current) {
    const response: ApiResponse = {
      success: false,
      error: { code: 'NODE_NOT_FOUND', message: '验收节点不存在' },
      timestamp: new Date().toISOString(),
    }
    return res.status(404).json(response)
  }

  // P0-2修复：验证状态转换合法性
  if (req.body.status && req.body.status !== current.status) {
    if (!validateNodeStatusTransition(current.status, req.body.status)) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'INVALID_STATUS_TRANSITION',
          message: `状态不能从"${current.status}"直接变更为"${req.body.status}"`
        },
        timestamp: new Date().toISOString(),
      }
      return res.status(400).json(response)
    }
  }

  // 如果状态变更为"已通过"或"未通过"，自动设置验收信息
  if (req.body.status && (req.body.status === '已通过' || req.body.status === '未通过')) {
    if (!req.body.actual_date) {
      req.body.actual_date = new Date().toISOString().split('T')[0]
    }
    if (!req.body.accepted_by && req.body.user_id) {
      req.body.accepted_by = req.body.user_id
    }
    if (!req.body.accepted_at) {
      req.body.accepted_at = new Date().toISOString()
    }
  }

  // 构建动态 UPDATE（序列化 JSON 字段）
  const setClauses: string[] = []
  const setValues: any[] = []
  const jsonFields = new Set(['result', 'documents'])

  for (const [key, val] of Object.entries(req.body)) {
    if (key === 'user_id') continue
    setClauses.push(`${key} = ?`)
    setValues.push(jsonFields.has(key) && val !== null && typeof val === 'object'
      ? JSON.stringify(val)
      : val)
  }

  if (setClauses.length === 0) {
    const data = await executeSQLOne(
      'SELECT * FROM acceptance_nodes WHERE id = ? LIMIT 1',
      [id]
    )
    const response: ApiResponse<AcceptanceNode> = {
      success: true,
      data,
      timestamp: new Date().toISOString(),
    }
    return res.json(response)
  }

  await executeSQL(
    `UPDATE acceptance_nodes SET ${setClauses.join(', ')} WHERE id = ?`,
    [...setValues, id]
  )

  // 自动检查验收计划状态：当所有节点都通过时，更新计划为"已通过"
  if (req.body.status === '已通过') {
    const nodeInfo = await executeSQLOne(
      'SELECT acceptance_plan_id FROM acceptance_nodes WHERE id = ? LIMIT 1',
      [id]
    )
    if (nodeInfo) {
      const allNodes = await executeSQL(
        'SELECT status FROM acceptance_nodes WHERE acceptance_plan_id = ?',
        [nodeInfo.acceptance_plan_id]
      )
      const allPassed = (allNodes || []).every((n: any) => n.status === '已通过')
      const anyFailed = (allNodes || []).some((n: any) => n.status === '未通过')
      if (allPassed) {
        const ts = new Date().toISOString().slice(0, 19).replace('T', ' ')
        await executeSQL(
          "UPDATE acceptance_plans SET status = '已通过', actual_date = ?, updated_at = ? WHERE id = ?",
          [new Date().toISOString().split('T')[0], ts, nodeInfo.acceptance_plan_id]
        )
        logger.info('Acceptance plan auto-completed', { planId: nodeInfo.acceptance_plan_id })
      } else if (anyFailed) {
        const ts = new Date().toISOString().slice(0, 19).replace('T', ' ')
        await executeSQL(
          "UPDATE acceptance_plans SET status = '未通过', updated_at = ? WHERE id = ?",
          [ts, nodeInfo.acceptance_plan_id]
        )
        logger.info('Acceptance plan auto-failed', { planId: nodeInfo.acceptance_plan_id })
      }
    }
  }

  const data = await executeSQLOne(
    'SELECT * FROM acceptance_nodes WHERE id = ? LIMIT 1',
    [id]
  )

  const response: ApiResponse<AcceptanceNode> = {
    success: true,
    data,
    timestamp: new Date().toISOString(),
  }
  res.json(response)
}))

// 删除验收节点
router.delete('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params
  logger.info('Deleting acceptance node', { id })

  await executeSQL('DELETE FROM acceptance_nodes WHERE id = ?', [id])

  const response: ApiResponse = {
    success: true,
    timestamp: new Date().toISOString(),
  }
  res.json(response)
}))

export default router
