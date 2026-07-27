// 弹窗提醒API路由 - Phase 2

import { Router, type Request } from 'express'
import { WarningService } from '../services/warningService.js'
import { asyncHandler } from '../middleware/errorHandler.js'
import { authenticate } from '../middleware/auth.js'
import { logger } from '../middleware/logger.js'
import { validate } from '../middleware/validation.js'
import { z } from 'zod'
import type { ApiResponse } from '../types/index.js'
import type { Reminder } from '../types/db.js'
import {
  getCurrentCompanyId,
  getCurrentCompanyMembership,
  getProjectPermissionLevel,
  getVisibleProjectIds,
} from '../auth/access.js'
import { getRequestCompanyId } from '../auth/companyContext.js'
import {
  dismissReminder,
  getReminderPreference,
  upsertReminderPreference,
} from '../services/reminderPreferencesService.js'

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

const REMINDER_SETTINGS_CACHE_TTL_MS = Number(process.env.REMINDER_SETTINGS_CACHE_TTL_MS ?? 300_000)
const REMINDER_COMPANY_ID_CACHE_TTL_MS = Number(process.env.REMINDER_COMPANY_ID_CACHE_TTL_MS ?? 300_000)
const reminderSettingsCache = new Map<string, { expiresAt: number; value: ReminderSettings }>()
const reminderCompanyIdCache = new Map<string, { expiresAt: number; value: string | null }>()

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

function normalizeReminderSettingsFromPreference(preference: Record<string, unknown> | null | undefined): ReminderSettings | null {
  if (!preference) return null
  const reminderDaysBefore = Number(preference.reminder_days_before)
  return normalizeReminderSettings({
    condition_reminder_days: Number.isInteger(reminderDaysBefore) && reminderDaysBefore > 0
      ? [reminderDaysBefore]
      : undefined,
    enable_popup: typeof preference.popup_enabled === 'boolean' ? preference.popup_enabled : undefined,
    enable_notification: typeof preference.email_enabled === 'boolean' ? preference.email_enabled : undefined,
  })
}

async function loadPreferenceSettings(userId: string | undefined, projectId?: string, companyId?: string | null) {
  if (!userId) return null
  const projectPreference = await getReminderPreference(userId, projectId ?? null, companyId ?? null)
  const projectSettings = normalizeReminderSettingsFromPreference(projectPreference)
  if (projectSettings) return projectSettings

  if (projectId) {
    const companyPreference = await getReminderPreference(userId, null, companyId ?? null)
    return normalizeReminderSettingsFromPreference(companyPreference)
  }
  return null
}

async function loadStoredReminderSettings(userId: string | undefined, projectId?: string, companyId?: string | null): Promise<ReminderSettings> {
  const cacheKey = JSON.stringify({ userId: userId ?? null, projectId: projectId ?? null, companyId: companyId ?? null })
  const cached = reminderSettingsCache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value
  }

  const settings = await loadPreferenceSettings(userId, projectId, companyId) ?? normalizeReminderSettings(null)

  reminderSettingsCache.set(cacheKey, {
    expiresAt: Date.now() + REMINDER_SETTINGS_CACHE_TTL_MS,
    value: settings,
  })
  return settings
}

async function resolveReminderCompanyIdForUser(userId: string | undefined, requestedCompanyId?: string | null) {
  if (!userId) return requestedCompanyId ?? null
  const normalizedRequestedCompanyId = requestedCompanyId?.trim() || null
  const cacheKey = JSON.stringify({ userId, requestedCompanyId: normalizedRequestedCompanyId })
  const cached = reminderCompanyIdCache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value
  }

  const companyId = await getCurrentCompanyId(userId, normalizedRequestedCompanyId)
  reminderCompanyIdCache.set(cacheKey, {
    expiresAt: Date.now() + REMINDER_COMPANY_ID_CACHE_TTL_MS,
    value: companyId ?? null,
  })
  return companyId ?? null
}

export async function warmReminderSettingsCache(userId: string | undefined, projectId?: string, companyId?: string | null) {
  const resolvedCompanyId = companyId === undefined
    ? await resolveReminderCompanyIdForUser(userId)
    : companyId
  return loadStoredReminderSettings(userId, projectId, resolvedCompanyId)
}

async function getReminderCompanyId(req: Request) {
  return resolveReminderCompanyIdForUser(
    req.user?.id,
    getRequestCompanyId(req) || req.user?.currentCompanyId || null,
  )
}

async function getVisibleReminderProjectIds(req: Request) {
  if (!req.user?.id) return []
  return getVisibleProjectIds(req.user.id, req.user.globalRole, getRequestCompanyId(req))
}

async function canEditReminderSettings(req: Request, projectId?: string | null) {
  const userId = req.user?.id
  if (!userId) return false

  const companyId = getRequestCompanyId(req)
  if (projectId) {
    const permission = await getProjectPermissionLevel(userId, projectId, companyId)
    return permission === 'owner' || permission === 'editor'
  }

  const membership = await getCurrentCompanyMembership(userId, companyId)
  return membership?.role === 'company_admin'
}

/**
 * 获取当前有效弹窗提醒
 * GET /api/reminders/active?projectId=xxx
 */
router.get('/active', validate(reminderProjectQuerySchema, 'query'), asyncHandler(async (req, res) => {
  const projectId = String(req.query.projectId ?? req.query.project_id ?? '').trim() || undefined

  logger.info('Fetching active reminders', { projectId })

  const visibleProjectIds = await getVisibleReminderProjectIds(req)
  if (visibleProjectIds !== null) {
    if (projectId && !visibleProjectIds.includes(projectId)) {
      return res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: '您没有权限访问此项目提醒' },
        timestamp: new Date().toISOString(),
      })
    }
    if (!projectId && visibleProjectIds.length === 0) {
      return res.json({ success: true, data: [], timestamp: new Date().toISOString() })
    }
  }

  const reminders = projectId
    ? await warningService.generateReminders(projectId)
    : visibleProjectIds === null
      ? await warningService.generateReminders()
      : (await Promise.all(visibleProjectIds.map((id) => warningService.generateReminders(id)))).flat()

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

  // v1.4.13: use reminder_dismissals table — no longer write notification records
  await dismissReminder(req.user?.id ?? 'system', id)

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
  if (projectId) {
    const visibleProjectIds = await getVisibleReminderProjectIds(req)
    if (visibleProjectIds !== null && !visibleProjectIds.includes(projectId)) {
      return res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: '您没有权限访问此项目提醒设置' },
        timestamp: new Date().toISOString(),
      })
    }
  }

  const companyId = getRequestCompanyId(req) || req.user?.currentCompanyId || await getReminderCompanyId(req)
  const settings = await loadStoredReminderSettings(req.user?.id, projectId, companyId)

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
  const visibleProjectIds = await getVisibleReminderProjectIds(req)
  if (projectId && visibleProjectIds !== null && !visibleProjectIds.includes(projectId)) {
    return res.status(403).json({
      success: false,
      error: { code: 'FORBIDDEN', message: '您没有权限更新此项目提醒设置' },
      timestamp: new Date().toISOString(),
    })
  }

  if (!await canEditReminderSettings(req, projectId)) {
    return res.status(403).json({
      success: false,
      error: { code: 'FORBIDDEN', message: projectId ? '您没有权限更新此项目提醒设置' : '只有公司管理员可以更新公司提醒设置' },
      timestamp: new Date().toISOString(),
    })
  }

  // v1.4.13: write to reminder_preferences, not notifications
  const companyId = await getReminderCompanyId(req)
  const normalizedSettings = normalizeReminderSettings(settings)
  await upsertReminderPreference({
    userId: req.user?.id ?? 'system',
    projectId: projectId || null,
    companyId: companyId || null,
    reminderDaysBefore: normalizedSettings.condition_reminder_days[0] ?? DEFAULT_REMINDER_SETTINGS.condition_reminder_days[0],
    popupEnabled: normalizedSettings.enable_popup,
    emailEnabled: normalizedSettings.enable_notification,
  })
  reminderSettingsCache.clear()
  reminderCompanyIdCache.clear()

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
