// 验收节点 API 路由

import { Router } from 'express'
import { asyncHandler } from '../middleware/errorHandler.js'
import { authenticate } from '../middleware/auth.js'
import { logger } from '../middleware/logger.js'
import { validate } from '../middleware/validation.js'
import { executeSQL, executeSQLOne, getTask, updateTask } from '../services/dbService.js'
import { v4 as uuidv4 } from 'uuid'
import { z } from 'zod'
import type { ApiResponse } from '../types/index.js'
import type { AcceptanceNode } from '../types/db.js'
import {
  ACCEPTANCE_STATUS_TRANSITIONS,
  normalizeAcceptanceStatus,
  parseAcceptanceStatus,
} from '../utils/acceptanceStatus.js'
import {
  buildSyncBatchLimitError,
  REQUEST_TIMEOUT_BUDGETS,
  runWithRequestBudget,
} from '../services/requestBudgetService.js'
import {
  ACCEPTANCE_NODE_COLUMNS,
  ACCEPTANCE_PLAN_COLUMNS,
} from '../services/sqlColumns.js'

const router = Router()
router.use(authenticate)
const ACCEPTANCE_PLAN_SELECT = `SELECT ${ACCEPTANCE_PLAN_COLUMNS} FROM acceptance_plans`
const ACCEPTANCE_NODE_SELECT = `SELECT ${ACCEPTANCE_NODE_COLUMNS} FROM acceptance_nodes`

const nodeIdParamSchema = z.object({
  id: z.string().trim().min(1, 'id 不能为空'),
})

const batchNodeBodySchema = z.object({
  planIds: z.array(z.string().trim().min(1)).optional(),
  limit: z.union([z.string(), z.number()]).optional(),
  offset: z.union([z.string(), z.number()]).optional(),
}).passthrough()

const nodeListQuerySchema = z.object({
  planId: z.string().trim().min(1).optional(),
  plan_id: z.string().trim().min(1).optional(),
  limit: z.union([z.string(), z.number()]).optional(),
  offset: z.union([z.string(), z.number()]).optional(),
}).passthrough()

const nodeCreateBodySchema = z.object({
  acceptance_plan_id: z.string().trim().optional(),
  node_name: z.string().trim().optional(),
  result: z.unknown().optional(),
  documents: z.unknown().optional(),
}).passthrough()

const nodeUpdateBodySchema = z.object({
  status: z.string().trim().optional(),
  actual_date: z.string().trim().optional().nullable(),
  accepted_by: z.string().trim().optional().nullable(),
  accepted_at: z.string().trim().optional().nullable(),
  user_id: z.string().trim().optional().nullable(),
  result: z.unknown().optional().nullable(),
  documents: z.unknown().optional().nullable(),
}).passthrough()

function normalizeAcceptanceNodeStatus(status?: string | null) {
  return normalizeAcceptanceStatus(status)
}

function validateNodeStatusTransition(currentStatus: string, newStatus: string): boolean {
  const current = parseAcceptanceStatus(currentStatus)
  const next = parseAcceptanceStatus(newStatus)
  if (!current || !next) return false
  if (current === next) return true
  const allowedTransitions = ACCEPTANCE_STATUS_TRANSITIONS[current]
  return allowedTransitions ? allowedTransitions.includes(next) : false
}

function isPassedAcceptanceStatus(status?: string | null) {
  return ['passed', 'archived'].includes(normalizeAcceptanceNodeStatus(status))
}

function isRectificationAcceptanceStatus(status?: string | null) {
  return normalizeAcceptanceNodeStatus(status) === 'rectifying'
}

function normalizeNodeStatusPayload(status?: string | null) {
  if (!status) return status
  return normalizeAcceptanceNodeStatus(status)
}

// 验证状态转换是否合法
function getNormalizedStatusErrorMessage(currentStatus: string, newStatus: string) {
  const current = normalizeAcceptanceNodeStatus(currentStatus)
  const next = normalizeAcceptanceNodeStatus(newStatus)
  return `状态不能从"${current}"直接变更为"${next}"`
}

async function syncLinkedTaskForAcceptedPlan(planId: string) {
  const plan = await executeSQLOne<any>(
    `${ACCEPTANCE_PLAN_SELECT} WHERE id = ? LIMIT 1`,
    [planId]
  )

  if (!plan || !plan.task_id) return
  if (!isPassedAcceptanceStatus(plan.status)) return

  const linkedTask = await getTask(String(plan.task_id))
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

  await updateTask(String(plan.task_id), updates)
}

// 批量查询验收节点接口（解决N+1查询问题，支持分页）
router.post('/batch', validate(batchNodeBodySchema), asyncHandler(async (req, res) => {
  const { planIds, limit = 100, offset = 0 } = req.body

  if (!Array.isArray(planIds) || planIds.length === 0) {
    const response: ApiResponse = {
      success: false,
      error: { code: 'INVALID_IDS', message: 'planIds必须是字符串数组' },
      timestamp: new Date().toISOString(),
    }
    return res.status(400).json(response)
  }

  if (planIds.length > 100) {
    const error = buildSyncBatchLimitError(planIds.length, { operation: 'acceptance_nodes.batch' })
    const response: ApiResponse = {
      success: false,
      error: {
        code: error.code ?? 'BATCH_ASYNC_REQUIRED',
        message: error.message,
        details: error.details,
      },
      timestamp: new Date().toISOString(),
    }
    return res.status(error.statusCode ?? 413).json(response)
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

  const { total, data } = await runWithRequestBudget(
    {
      operation: 'acceptance_nodes.batch',
      timeoutMs: REQUEST_TIMEOUT_BUDGETS.boardReadMs,
    },
    async () => {
      const placeholders = planIds.map(() => '?').join(', ')

      const countRow = await executeSQLOne(
        `SELECT COUNT(*) AS total FROM acceptance_nodes WHERE acceptance_plan_id IN (${placeholders})`,
        planIds
      )
      const totalCount = countRow ? Number(countRow.total) : 0

      const rows = await executeSQL(
        `${ACCEPTANCE_NODE_SELECT}
         WHERE acceptance_plan_id IN (${placeholders})
         ORDER BY planned_date ASC
         LIMIT ? OFFSET ?`,
        [...planIds, limitNum, offsetNum]
      )

      return {
        total: totalCount,
        data: rows,
      }
    },
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
router.get('/', validate(nodeListQuerySchema, 'query'), asyncHandler(async (req, res) => {
  const { planId = req.query.plan_id, limit = 50, offset = 0 } = req.query

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
    `${ACCEPTANCE_NODE_SELECT}
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
router.get('/:id', validate(nodeIdParamSchema, 'params'), asyncHandler(async (req, res) => {
  const { id } = req.params
  logger.info('Fetching acceptance node', { id })

  const data = await executeSQLOne(
    `${ACCEPTANCE_NODE_SELECT} WHERE id = ? LIMIT 1`,
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
router.post('/', validate(nodeCreateBodySchema), asyncHandler(async (req, res) => {
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
    `${ACCEPTANCE_NODE_SELECT} WHERE id = ? LIMIT 1`,
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
router.put('/:id', validate(nodeIdParamSchema, 'params'), validate(nodeUpdateBodySchema), asyncHandler(async (req, res) => {
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
          message: getNormalizedStatusErrorMessage(current.status, req.body.status),
        },
        timestamp: new Date().toISOString(),
      }
      return res.status(400).json(response)
    }
  }

  if (req.body.status) {
    req.body.status = normalizeNodeStatusPayload(req.body.status)
  }

  // Auto-populate acceptance metadata once the node reaches a terminal acceptance state.
  if (req.body.status && (isPassedAcceptanceStatus(req.body.status) || isRectificationAcceptanceStatus(req.body.status))) {
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
      `${ACCEPTANCE_NODE_SELECT} WHERE id = ? LIMIT 1`,
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

  // 自动检查验收计划状态：当所有节点都通过时，更新计划状态
  if (req.body.status && (isPassedAcceptanceStatus(req.body.status) || isRectificationAcceptanceStatus(req.body.status))) {
    const nodeInfo = await executeSQLOne(
      'SELECT acceptance_plan_id FROM acceptance_nodes WHERE id = ? LIMIT 1',
      [id]
    )
    if (nodeInfo) {
      const allNodes = await executeSQL(
        'SELECT status FROM acceptance_nodes WHERE acceptance_plan_id = ?',
        [nodeInfo.acceptance_plan_id]
      )
      const allPassed = (allNodes || []).every((n: any) => isPassedAcceptanceStatus(n.status))
      const anyFailed = (allNodes || []).some((n: any) => isRectificationAcceptanceStatus(n.status))
      if (allPassed) {
        const ts = new Date().toISOString().slice(0, 19).replace('T', ' ')
        await executeSQL(
          "UPDATE acceptance_plans SET status = 'passed', actual_date = ?, updated_at = ? WHERE id = ?",
          [new Date().toISOString().split('T')[0], ts, nodeInfo.acceptance_plan_id]
        )
        await syncLinkedTaskForAcceptedPlan(String(nodeInfo.acceptance_plan_id))
        logger.info('Acceptance plan auto-completed', { planId: nodeInfo.acceptance_plan_id })
      } else if (anyFailed) {
        const ts = new Date().toISOString().slice(0, 19).replace('T', ' ')
        await executeSQL(
          "UPDATE acceptance_plans SET status = 'rectifying', updated_at = ? WHERE id = ?",
          [ts, nodeInfo.acceptance_plan_id]
        )
        logger.info('Acceptance plan auto-failed', { planId: nodeInfo.acceptance_plan_id })
      }
    }
  }

  const data = await executeSQLOne(
    `${ACCEPTANCE_NODE_SELECT} WHERE id = ? LIMIT 1`,
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
router.delete('/:id', validate(nodeIdParamSchema, 'params'), asyncHandler(async (req, res) => {
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
