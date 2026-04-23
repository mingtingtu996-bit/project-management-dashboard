// 弹窗提醒API路由 - Phase 2

import { Router } from 'express'
import { WarningService } from '../services/warningService.js'
import { insertNotification } from '../services/notificationStore.js'
import { asyncHandler } from '../middleware/errorHandler.js'
import { authenticate } from '../middleware/auth.js'
import { logger } from '../middleware/logger.js'
import { validate } from '../middleware/validation.js'
import { z } from 'zod'
import type { ApiResponse } from '../types/index.js'
import type { Reminder } from '../types/db.js'

const router = Router()
router.use(authenticate)
const warningService = new WarningService()

const reminderIdParamSchema = z.object({
  id: z.string().trim().min(1, 'id 不能为空'),
})

const reminderProjectQuerySchema = z.object({
  projectId: z.string().trim().min(1).optional(),
  project_id: z.string().trim().min(1).optional(),
}).passthrough()

const dismissReminderBodySchema = z.object({
  dismissed_by: z.string().trim().optional().nullable(),
}).passthrough()

const reminderSettingsBodySchema = z.object({
  condition_reminder_days: z.array(z.number().int()).optional(),
  obstacle_reminder_days: z.array(z.number().int()).optional(),
  acceptance_reminder_days: z.array(z.number().int()).optional(),
  enable_popup: z.boolean().optional(),
  enable_notification: z.boolean().optional(),
}).passthrough()

/**
 * 获取当前有效弹窗提醒
 * GET /api/reminders/active?projectId=xxx
 */
router.get('/active', validate(reminderProjectQuerySchema, 'query'), asyncHandler(async (req, res) => {
  const projectId = String(req.query.projectId ?? req.query.project_id ?? '').trim() || undefined

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
router.put('/:id/dismiss', validate(reminderIdParamSchema, 'params'), validate(dismissReminderBodySchema), asyncHandler(async (req, res) => {
  const { id } = req.params
  const { dismissed_by } = req.body

  logger.info('Dismissing reminder', { id, dismissed_by })

  // 将关闭状态写入 notifications 表作为持久化记录
  const now = new Date().toISOString()
  await insertNotification({
    project_id: null,
    type: 'reminder_dismissed',
    notification_type: 'flow-reminder',
    severity: 'info',
    title: '弹窗已关闭',
    content: dismissed_by ? `由 ${dismissed_by} 关闭` : '已关闭',
    is_read: true,
    is_broadcast: false,
    source_entity_type: 'reminder',
    source_entity_id: id,
    status: 'read',
    created_at: now,
  })

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
router.get('/settings', validate(reminderProjectQuerySchema, 'query'), asyncHandler(async (req, res) => {
  const projectId = String(req.query.projectId ?? req.query.project_id ?? '').trim() || undefined

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
router.put('/settings', validate(reminderProjectQuerySchema, 'query'), validate(reminderSettingsBodySchema), asyncHandler(async (req, res) => {
  const settings = req.body
  const projectId = String(req.query.projectId ?? req.query.project_id ?? '').trim() || null

  logger.info('Updating reminder settings', settings)

  // 将设置序列化后写入 notifications 表持久化
  const now = new Date().toISOString()
  await insertNotification({
    project_id: projectId,
    type: 'reminder_settings_updated',
    notification_type: 'flow-reminder',
    severity: 'info',
    title: '提醒设置已更新',
    content: JSON.stringify(settings),
    is_read: true,
    is_broadcast: false,
    source_entity_type: 'settings',
    status: 'read',
    created_at: now,
  })

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
