// 弹窗提醒API路由 - Phase 2

import { Router } from 'express'
import { WarningService } from '../services/warningService.js'
import { executeSQL } from '../services/dbService.js'
import { asyncHandler } from '../middleware/errorHandler.js'
import { authenticate } from '../middleware/auth.js'
import { logger } from '../middleware/logger.js'
import type { ApiResponse } from '../types/index.js'
import type { Reminder } from '../types/db.js'
import { v4 as uuidv4 } from 'uuid'

const router = Router()
router.use(authenticate)
const warningService = new WarningService()

/**
 * 获取当前有效弹窗提醒
 * GET /api/reminders/active?projectId=xxx
 */
router.get('/active', asyncHandler(async (req, res) => {
  const projectId = req.query.projectId as string | undefined

  logger.info('Fetching active reminders', { projectId })

  // 生成弹窗提醒
  const reminders = await warningService.generateReminders(projectId)

  // 筛选未关闭的提醒
  const activeReminders = reminders.filter(r => !r.is_dismissed)

  const response: ApiResponse<Reminder[]> = {
    success: true,
    data: activeReminders,
    timestamp: new Date().toISOString(),
  }

  res.json(response)
}))

/**
 * 关闭弹窗
 * PUT /api/reminders/:id/dismiss
 */
router.put('/:id/dismiss', asyncHandler(async (req, res) => {
  const { id } = req.params
  const { dismissed_by } = req.body

  logger.info('Dismissing reminder', { id, dismissed_by })

  // 将关闭状态写入 notifications 表作为持久化记录
  const now = new Date().toISOString()
  const notificationId = uuidv4()
  await executeSQL(
    `INSERT INTO notifications (id, project_id, type, severity, title, content, is_read, is_broadcast, source_entity_type, source_entity_id, created_at, status)
     VALUES (?, NULL, 'reminder_dismissed', 'info', '弹窗已关闭', ?, 1, 0, 'reminder', ?, ?, 'read')`,
    [notificationId, dismissed_by ? `由 ${dismissed_by} 关闭` : '已关闭', id, now]
  ).catch((e: any) => logger.warn('Failed to persist reminder dismiss', { error: e.message }))

  const response: ApiResponse<{ message: string }> = {
    success: true,
    data: {
      message: '弹窗已关闭',
    },
    timestamp: new Date().toISOString(),
  }

  res.json(response)
}))

/**
 * 获取提醒设置
 * GET /api/reminders/settings?projectId=xxx
 */
router.get('/settings', asyncHandler(async (req, res) => {
  const projectId = req.query.projectId as string | undefined

  logger.info('Fetching reminder settings', { projectId })

  // 默认设置
  const settings = {
    condition_reminder_days: [3, 1], // 条件到期前3天、1天提醒
    obstacle_reminder_days: [3, 7], // 阻碍持续3天、7天提醒
    acceptance_reminder_days: [7, 3, 1], // 验收到期前7天、3天、1天提醒
    enable_popup: true, // 启用弹窗提醒
    enable_notification: true, // 启用通知
  }

  const response: ApiResponse<typeof settings> = {
    success: true,
    data: settings,
    timestamp: new Date().toISOString(),
  }

  res.json(response)
}))

/**
 * 更新提醒设置
 * PUT /api/reminders/settings
 */
router.put('/settings', asyncHandler(async (req, res) => {
  const settings = req.body
  const { projectId } = req.query

  logger.info('Updating reminder settings', settings)

  // 将设置序列化后写入 notifications 表持久化
  const now = new Date().toISOString()
  const notificationId = uuidv4()
  await executeSQL(
    `INSERT INTO notifications (id, project_id, type, severity, title, content, is_read, is_broadcast, source_entity_type, created_at, status)
     VALUES (?, ?, 'reminder_settings_updated', 'info', '提醒设置已更新', ?, 1, 0, 'settings', ?, 'read')`,
    [notificationId, projectId ?? null, JSON.stringify(settings), now]
  ).catch((e: any) => logger.warn('Failed to persist reminder settings', { error: e.message }))

  const response: ApiResponse<{ message: string }> = {
    success: true,
    data: {
      message: '提醒设置已更新',
    },
    timestamp: new Date().toISOString(),
  }

  res.json(response)
}))

export default router
