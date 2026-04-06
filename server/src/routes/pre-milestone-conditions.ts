// 前期证照条件关联 API 路由

import { Router } from 'express'
import { asyncHandler } from '../middleware/errorHandler.js'
import { authenticate } from '../middleware/auth.js'
import { logger } from '../middleware/logger.js'
import { executeSQL, executeSQLOne } from '../services/dbService.js'
import { v4 as uuidv4 } from 'uuid'
import type { ApiResponse } from '../types/index.js'
import type { PreMilestoneCondition } from '../types/db.js'

const router = Router()
router.use(authenticate)

// 获取证照的所有条件
router.get('/', asyncHandler(async (req, res) => {
  const preMilestoneId = req.query.preMilestoneId as string

  if (!preMilestoneId) {
    const response: ApiResponse = {
      success: false,
      error: { code: 'MISSING_PRE_MILESTONE_ID', message: '证照ID不能为空' },
      timestamp: new Date().toISOString(),
    }
    return res.status(400).json(response)
  }

  logger.info('Fetching pre-milestone conditions', { preMilestoneId })

  const data = await executeSQL(
    'SELECT * FROM pre_milestone_conditions WHERE pre_milestone_id = ? ORDER BY created_at ASC',
    [preMilestoneId]
  )

  const response: ApiResponse<PreMilestoneCondition[]> = {
    success: true,
    data: data || [],
    timestamp: new Date().toISOString(),
  }
  res.json(response)
}))

// 获取单个条件
router.get('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params
  logger.info('Fetching pre-milestone condition', { id })

  const data = await executeSQLOne(
    'SELECT * FROM pre_milestone_conditions WHERE id = ? LIMIT 1',
    [id]
  )

  if (!data) {
    const response: ApiResponse = {
      success: false,
      error: { code: 'CONDITION_NOT_FOUND', message: '证照条件不存在' },
      timestamp: new Date().toISOString(),
    }
    return res.status(404).json(response)
  }

  const response: ApiResponse<PreMilestoneCondition> = {
    success: true,
    data,
    timestamp: new Date().toISOString(),
  }
  res.json(response)
}))

// 创建条件
router.post('/', asyncHandler(async (req, res) => {
  logger.info('Creating pre-milestone condition', req.body)

  const { pre_milestone_id, condition_type, condition_name, description } = req.body

  if (!pre_milestone_id || !condition_type || !condition_name) {
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'pre_milestone_id, condition_type, condition_name 不能为空'
      },
      timestamp: new Date().toISOString(),
    }
    return res.status(400).json(response)
  }

  const id = uuidv4()
  const now = new Date().toISOString()

  await executeSQL(
    `INSERT INTO pre_milestone_conditions
     (id, pre_milestone_id, condition_type, condition_name, description, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [id, pre_milestone_id, condition_type, condition_name, description || null, now]
  )

  const data = await executeSQLOne(
    'SELECT * FROM pre_milestone_conditions WHERE id = ? LIMIT 1',
    [id]
  )

  const response: ApiResponse<PreMilestoneCondition> = {
    success: true,
    data,
    timestamp: new Date().toISOString(),
  }
  res.status(201).json(response)
}))

// 更新条件
router.put('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params
  logger.info('Updating pre-milestone condition', { id })

  // 获取当前状态
  const current = await executeSQLOne(
    'SELECT status FROM pre_milestone_conditions WHERE id = ? LIMIT 1',
    [id]
  )

  if (!current) {
    const response: ApiResponse = {
      success: false,
      error: { code: 'CONDITION_NOT_FOUND', message: '证照条件不存在' },
      timestamp: new Date().toISOString(),
    }
    return res.status(404).json(response)
  }

  // 验证状态转换
  if (req.body.status && req.body.status !== current.status) {
    const validTransitions: Record<string, string[]> = {
      '待处理': ['已满足', '未满足'],
      '已满足': ['已确认'],
      '未满足': ['待处理', '已满足'],
      '已确认': []
    }

    if (!validTransitions[current.status]?.includes(req.body.status)) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'INVALID_STATUS_TRANSITION',
          message: `状态不能从 ${current.status} 转换为 ${req.body.status}`
        },
        timestamp: new Date().toISOString(),
      }
      return res.status(400).json(response)
    }

    // 如果标记为已完成，设置完成信息
    if (req.body.status === '已满足' || req.body.status === '已确认') {
      req.body.completed_date = req.body.completed_date || new Date().toISOString().split('T')[0]
    }
  }

  // 构建动态 UPDATE（始终更新 updated_at）
  const updateData = { ...req.body, updated_at: new Date().toISOString() }
  const setClauses: string[] = []
  const setValues: any[] = []

  for (const [key, val] of Object.entries(updateData)) {
    setClauses.push(`${key} = ?`)
    setValues.push(val)
  }

  await executeSQL(
    `UPDATE pre_milestone_conditions SET ${setClauses.join(', ')} WHERE id = ?`,
    [...setValues, id]
  )

  const data = await executeSQLOne(
    'SELECT * FROM pre_milestone_conditions WHERE id = ? LIMIT 1',
    [id]
  )

  const response: ApiResponse<PreMilestoneCondition> = {
    success: true,
    data,
    timestamp: new Date().toISOString(),
  }
  res.json(response)
}))

// 删除条件
router.delete('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params
  logger.info('Deleting pre-milestone condition', { id })

  await executeSQL('DELETE FROM pre_milestone_conditions WHERE id = ?', [id])

  const response: ApiResponse = {
    success: true,
    timestamp: new Date().toISOString(),
  }
  res.json(response)
}))

// 批量创建条件（当创建证照时，自动创建默认条件）
router.post('/batch', asyncHandler(async (req, res) => {
  const { pre_milestone_id, conditions } = req.body

  if (!pre_milestone_id || !Array.isArray(conditions) || conditions.length === 0) {
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'pre_milestone_id 和 conditions 数组不能为空'
      },
      timestamp: new Date().toISOString(),
    }
    return res.status(400).json(response)
  }

  logger.info('Batch creating pre-milestone conditions', { pre_milestone_id, count: conditions.length })

  const now = new Date().toISOString()
  const insertedIds: string[] = []

  for (const condition of conditions) {
    const id = uuidv4()
    await executeSQL(
      `INSERT INTO pre_milestone_conditions
       (id, pre_milestone_id, condition_type, condition_name, description, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        id,
        pre_milestone_id,
        condition.condition_type,
        condition.condition_name,
        condition.description || null,
        now
      ]
    )
    insertedIds.push(id)
  }

  // 查询插入的记录
  const placeholders = insertedIds.map(() => '?').join(', ')
  const data = await executeSQL(
    `SELECT * FROM pre_milestone_conditions WHERE id IN (${placeholders})`,
    insertedIds
  )

  const response: ApiResponse<PreMilestoneCondition[]> = {
    success: true,
    data: data || [],
    timestamp: new Date().toISOString(),
  }
  res.status(201).json(response)
}))

export default router
