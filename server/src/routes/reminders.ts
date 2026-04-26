// 弹窗提醒API路由 - Phase 2

import { Router } from 'express'
import { WarningService } from '../services/warningService.js'
import { findNotification, insertNotification } from '../services/notificationStore.js'
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

const REMINDER_SETTINGS_SOURCE_ENTITY_TYPE = 'reminder_settings'
const REMINDER_SETTINGS_NOTIFICATION_TYPE = 'reminder_settings_updated'

const DEFAULT_REMINDER_SETTINGS = {
  condition_reminder_days: [3, 1],
  obstacle_reminder_days: [3, 7],
  acceptance_reminder_days: [7, 3, 1],
  enable_popup: true,
  enable_notification: true,
} as const

type ReminderSettings = {
  condition_reminder_days: number[]
  obstacle_reminder_days: number[]
  acceptance_reminder_days: number[]
  enable_popup: boolean
  enable_notification: boolean
}

function normalizeReminderDayList(value: unknown, fallback: readonly number[]) {
  if (!Array.isArray(value)) return [...fallback]
  const normalized = value
    .map((item) => Number(item))
    .filter((item) => Number.isInteger(item) && item > 0)
  return Array.from(new Set(normalized)).sort((left, right) => right - left)
}

function normalizeReminderSettings(value: Partial<ReminderSettings> | null | undefined): ReminderSettings {
  return {
    condition_reminder_days: normalizeReminderDayList(value?.condition_reminder_days, DEFAULT_REMINDER_SETTINGS.condition_reminder_days),
    obstacle_reminder_days: normalizeReminderDayList(value?.obstacle_reminder_days, DEFAULT_REMINDER_SETTINGS.obstacle_reminder_days),
    acceptance_reminder_days: normalizeReminderDayList(value?.acceptance_reminder_days, DEFAULT_REMINDER_SETTINGS.acceptance_reminder_days),
    enable_popup: typeof value?.enable_popup === 'boolean' ? value.enable_popup : DEFAULT_REMINDER_SETTINGS.enable_popup,
    enable_notification: typeof value?.enable_notification === 'boolean' ? value.enable_notification : DEFAULT_REMINDER_SETTINGS.enable_notification,
  }
}

function parseReminderSettingsContent(content?: string | null): ReminderSettings {
  if (!content) return normalizeReminderSettings(null)

  try {
    const parsed = JSON.parse(content) as Partial<ReminderSettings>
    return normalizeReminderSettings(parsed)
  } catch {
    return normalizeReminderSettings(null)
  }
}

function buildReminderSettingsScope(projectId?: string) {
  const sourceEntityId = projectId || 'company'
  return {
    projectId: projectId || null,
    sourceEntityId,
  }
}

async function loadStoredReminderSettings(projectId?: string): Promise<ReminderSettings> {
  const scope = buildReminderSettingsScope(projectId)

  const projectSettings = await findNotification({
    projectId: scope.projectId ?? undefined,
    sourceEntityType: REMINDER_SETTINGS_SOURCE_ENTITY_TYPE,
    sourceEntityId: scope.sourceEntityId,
    type: REMINDER_SETTINGS_NOTIFICATION_TYPE,
  })

  if (projectSettings) {
    return parseReminderSettingsContent(projectSettings.content)
  }

  if (projectId) {
    const companySettings = await findNotification({
      sourceEntityType: REMINDER_SETTINGS_SOURCE_ENTITY_TYPE,
      sourceEntityId: 'company',
      type: REMINDER_SETTINGS_NOTIFICATION_TYPE,
    })

    if (companySettings) {
      return parseReminderSettingsContent(companySettings.content)
    }
  }

  return normalizeReminderSettings(null)
}

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
  const settings = await loadStoredReminderSettings(projectId)

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
  const scope = buildReminderSettingsScope(projectId || undefined)
  await insertNotification({
    project_id: scope.projectId,
    type: REMINDER_SETTINGS_NOTIFICATION_TYPE,
    notification_type: 'flow-reminder',
    severity: 'info',
    title: '提醒设置已更新',
    content: JSON.stringify(settings),
    is_read: true,
    is_broadcast: false,
    source_entity_type: REMINDER_SETTINGS_SOURCE_ENTITY_TYPE,
    source_entity_id: scope.sourceEntityId,
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
