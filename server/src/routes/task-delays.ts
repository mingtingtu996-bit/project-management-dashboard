// 任务延期历史 API 路由

import { Router } from 'express'
import { executeSQL, executeSQLOne } from '../services/dbService.js'
import { asyncHandler } from '../middleware/errorHandler.js'
import { authenticate } from '../middleware/auth.js'
import { logger } from '../middleware/logger.js'
import type { ApiResponse } from '../types/index.js'
import { ValidationService } from '../services/validationService.js'
import { v4 as uuidv4 } from 'uuid'

const router = Router()
router.use(authenticate)

// 获取任务的所有延期记录
router.get('/', asyncHandler(async (req, res) => {
  const taskId = req.query.taskId as string

  if (!taskId) {
    const response: ApiResponse = {
      success: false,
      error: { code: 'MISSING_TASK_ID', message: '任务ID不能为空' },
      timestamp: new Date().toISOString(),
    }
    return res.status(400).json(response)
  }

  logger.info('Fetching task delay history', { taskId })

  const data = await executeSQL(
    'SELECT * FROM task_delay_history WHERE task_id = ? ORDER BY created_at DESC',
    [taskId]
  )

  const response: ApiResponse = {
    success: true,
    data: data || [],
    timestamp: new Date().toISOString(),
  }
  res.json(response)
}))

// 创建延期记录
router.post('/', asyncHandler(async (req, res) => {
  logger.info('Creating task delay record', req.body)

  // 验证数据
  const validation = ValidationService.validateDelayHistory(req.body)
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

  // 获取任务当前信息
  const task = await executeSQLOne(
    'SELECT planned_end_date, version FROM tasks WHERE id = ? LIMIT 1',
    [req.body.task_id]
  )

  if (!task) {
    const response: ApiResponse = {
      success: false,
      error: { code: 'TASK_NOT_FOUND', message: '任务不存在' },
      timestamp: new Date().toISOString(),
    }
    return res.status(404).json(response)
  }

  const ts = new Date().toISOString().slice(0, 19).replace('T', ' ')

  // 更新任务的结束日期和版本号
  await executeSQL(
    'UPDATE tasks SET planned_end_date = ?, version = ?, updated_at = ? WHERE id = ?',
    [req.body.delayed_date, (task.version || 0) + 1, ts, req.body.task_id]
  )

  // 创建延期记录
  const id = uuidv4()
  await executeSQL(
    `INSERT INTO task_delay_history
       (id, task_id, original_date, delayed_date, delay_days, delay_type, reason, delay_reason, approved_by, approved_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      req.body.task_id,
      req.body.original_date ?? task.planned_end_date,
      req.body.delayed_date,
      req.body.delay_days ?? null,
      req.body.delay_type ?? '被动延期',
      req.body.reason ?? req.body.delay_reason ?? '未指定原因',
      req.body.delay_reason ?? null,
      req.body.approved_by ?? null,
      ts,
      ts,
    ]
  )

  const data = await executeSQLOne('SELECT * FROM task_delay_history WHERE id = ? LIMIT 1', [id])

  const response: ApiResponse = {
    success: true,
    data,
    timestamp: new Date().toISOString(),
  }
  res.status(201).json(response)
}))

// 删除延期记录（通常不允许删除，但提供接口）
router.delete('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params
  logger.info('Deleting task delay record', { id })

  await executeSQL('DELETE FROM task_delay_history WHERE id = ?', [id])

  const response: ApiResponse = {
    success: true,
    timestamp: new Date().toISOString(),
  }
  res.json(response)
}))

export default router
