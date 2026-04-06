// 预警API路由 - Phase 2

import { Router } from 'express'
import { WarningService } from '../services/warningService.js'
import { executeSQL } from '../services/dbService.js'
import { asyncHandler } from '../middleware/errorHandler.js'
import { authenticate } from '../middleware/auth.js'
import { logger } from '../middleware/logger.js'
import type { ApiResponse } from '../types/index.js'
import type { Warning } from '../types/db.js'

const router = Router()
router.use(authenticate)
const warningService = new WarningService()

/**
 * 获取预警列表
 * GET /api/warnings?projectId=xxx&status=acknowledged
 */
router.get('/', asyncHandler(async (req, res) => {
  const projectId = req.query.projectId as string | undefined
  const status = req.query.status as string | undefined

  logger.info('Fetching warnings', { projectId, status })

  const conditionWarnings = await warningService.scanConditionWarnings(projectId)
  const obstacleWarnings = await warningService.scanObstacleWarnings(projectId)
  const acceptanceWarnings = await warningService.scanAcceptanceWarnings(projectId)
  const delayExceededWarnings = await warningService.scanDelayExceededWarnings(projectId)

  const allWarnings = [...conditionWarnings, ...obstacleWarnings, ...acceptanceWarnings, ...delayExceededWarnings]

  // 筛选状态
  let filteredWarnings = allWarnings
  if (status === 'acknowledged') {
    filteredWarnings = allWarnings.filter(w => w.is_acknowledged)
  } else if (status === 'unacknowledged') {
    filteredWarnings = allWarnings.filter(w => !w.is_acknowledged)
  }

  const response: ApiResponse<Warning[]> = {
    success: true,
    data: filteredWarnings,
    timestamp: new Date().toISOString(),
  }

  res.json(response)
}))

/**
 * 获取条件到期预警
 * GET /api/warnings/conditions?projectId=xxx
 */
router.get('/conditions', asyncHandler(async (req, res) => {
  const projectId = req.query.projectId as string | undefined

  logger.info('Fetching condition warnings', { projectId })

  const warnings = await warningService.scanConditionWarnings(projectId)

  const response: ApiResponse<Warning[]> = {
    success: true,
    data: warnings,
    timestamp: new Date().toISOString(),
  }

  res.json(response)
}))

/**
 * 获取阻碍超时预警
 * GET /api/warnings/obstacles?projectId=xxx
 */
router.get('/obstacles', asyncHandler(async (req, res) => {
  const projectId = req.query.projectId as string | undefined

  logger.info('Fetching obstacle warnings', { projectId })

  const warnings = await warningService.scanObstacleWarnings(projectId)

  const response: ApiResponse<Warning[]> = {
    success: true,
    data: warnings,
    timestamp: new Date().toISOString(),
  }

  res.json(response)
}))

/**
 * 获取验收到期预警
 * GET /api/warnings/acceptance?projectId=xxx
 */
router.get('/acceptance', asyncHandler(async (req, res) => {
  const projectId = req.query.projectId as string | undefined

  logger.info('Fetching acceptance warnings', { projectId })

  const warnings = await warningService.scanAcceptanceWarnings(projectId)

  const response: ApiResponse<Warning[]> = {
    success: true,
    data: warnings,
    timestamp: new Date().toISOString(),
  }

  res.json(response)
}))

/**
 * 获取延期超次预警
 * GET /api/warnings/delay-exceeded?projectId=xxx
 * 延期次数>=3时触发，3-4次为warning，>=5次为critical
 */
router.get('/delay-exceeded', asyncHandler(async (req, res) => {
  const projectId = req.query.projectId as string | undefined

  logger.info('Fetching delay exceeded warnings', { projectId })

  const warnings = await warningService.scanDelayExceededWarnings(projectId)

  const response: ApiResponse<Warning[]> = {
    success: true,
    data: warnings,
    timestamp: new Date().toISOString(),
  }

  res.json(response)
}))

/**
 * 确认预警
 * PUT /api/warnings/:id/acknowledge
 */
router.put('/:id/acknowledge', asyncHandler(async (req, res) => {
  const { id } = req.params
  const { acknowledged_by } = req.body

  logger.info('Acknowledging warning', { id, acknowledged_by })

  // 预警由 WarningService 实时扫描生成，确认状态通过 notifications 表记录
  const now = new Date().toISOString()
  const { v4: uuidv4 } = await import('uuid')
  const notificationId = uuidv4()

  await executeSQL(
    `INSERT INTO notifications (id, project_id, type, severity, title, content, is_read, is_broadcast, source_entity_type, source_entity_id, created_at, status)
     VALUES (?, NULL, 'warning_acknowledged', 'info', '预警已确认', '预警已被确认处理', 1, 0, 'warning', ?, ?, 'read')`,
    [notificationId, id, now]
  )

  const response: ApiResponse<{ message: string }> = {
    success: true,
    data: {
      message: '预警已确认',
    },
    timestamp: new Date().toISOString(),
  }

  res.json(response)
}))

/**
 * 删除预警记录
 * DELETE /api/warnings/:id
 */
router.delete('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params

  logger.info('Deleting warning', { id })

  // 预警由 WarningService 实时扫描生成，非持久化，直接返回成功
  // 如有对应的 notifications 记录，一并清理
  await executeSQL(
    `DELETE FROM notifications WHERE source_entity_type = 'warning' AND source_entity_id = ?`,
    [id]
  ).catch(() => {})

  const response: ApiResponse<{ message: string }> = {
    success: true,
    data: {
      message: '预警已删除',
    },
    timestamp: new Date().toISOString(),
  }

  res.json(response)
}))

export default router
