// 证照审批进度跟踪 API 路由

import { Router } from 'express'
import { asyncHandler } from '../middleware/errorHandler.js'
import { authenticate } from '../middleware/auth.js'
import { logger } from '../middleware/logger.js'
import { executeSQL, executeSQLOne } from '../services/dbService.js'
import { v4 as uuidv4 } from 'uuid'
import type { ApiResponse } from '../types/index.js'

const router = Router()
router.use(authenticate)

// 获取证照的审批进度列表
router.get('/milestone/:milestoneId', asyncHandler(async (req, res) => {
  const { milestoneId } = req.params
  logger.info('Fetching certificate approvals', { milestoneId })

  const data = await executeSQL(
    'SELECT * FROM certificate_approvals WHERE pre_milestone_id = ? ORDER BY sort_order ASC',
    [milestoneId]
  )

  const response: ApiResponse<typeof data> = {
    success: true,
    data: data || [],
    timestamp: new Date().toISOString(),
  }
  res.json(response)
}))

// 创建审批步骤
router.post('/', asyncHandler(async (req, res) => {
  logger.info('Creating certificate approval', req.body)

  const id = uuidv4()
  const now = new Date().toISOString()

  const fields: string[] = ['id', 'created_at']
  const values: any[] = [id, now]
  const placeholders: string[] = ['?', '?']

  for (const [key, val] of Object.entries(req.body)) {
    fields.push(key)
    values.push(val)
    placeholders.push('?')
  }

  await executeSQL(
    `INSERT INTO certificate_approvals (${fields.join(', ')}) VALUES (${placeholders.join(', ')})`,
    values
  )

  const data = await executeSQLOne(
    'SELECT * FROM certificate_approvals WHERE id = ? LIMIT 1',
    [id]
  )

  const response: ApiResponse<typeof data> = {
    success: true,
    data,
    timestamp: new Date().toISOString(),
  }
  res.json(response)
}))

// 更新审批步骤状态
router.put('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params
  logger.info('Updating certificate approval', { id, ...req.body })

  const setClauses: string[] = []
  const setValues: any[] = []

  for (const [key, val] of Object.entries(req.body)) {
    setClauses.push(`${key} = ?`)
    setValues.push(val)
  }

  if (setClauses.length > 0) {
    await executeSQL(
      `UPDATE certificate_approvals SET ${setClauses.join(', ')} WHERE id = ?`,
      [...setValues, id]
    )
  }

  const data = await executeSQLOne(
    'SELECT * FROM certificate_approvals WHERE id = ? LIMIT 1',
    [id]
  )

  const response: ApiResponse<typeof data> = {
    success: true,
    data,
    timestamp: new Date().toISOString(),
  }
  res.json(response)
}))

// 删除审批步骤
router.delete('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params
  logger.info('Deleting certificate approval', { id })

  await executeSQL('DELETE FROM certificate_approvals WHERE id = ?', [id])

  const response: ApiResponse = {
    success: true,
    timestamp: new Date().toISOString(),
  }
  res.json(response)
}))

export default router
