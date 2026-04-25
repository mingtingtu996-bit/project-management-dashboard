// 通知中心API路由 - Phase 2

import { Router } from 'express'
import { WarningService } from '../services/warningService.js'
import { OperationalNotificationService } from '../services/operationalNotificationService.js'
import { planningGovernanceService } from '../services/planningGovernanceService.js'
import { persistNotification } from '../services/warningChainService.js'
import {
  acknowledgeWarningNotification,
  muteWarningNotification,
} from '../services/upgradeChainService.js'
import {
  deleteNotificationById,
  findNotification,
  listNotifications,
  updateNotificationById,
  updateNotificationsByIds,
} from '../services/notificationStore.js'
import { asyncHandler } from '../middleware/errorHandler.js'
import { authenticate } from '../middleware/auth.js'
import { logger } from '../middleware/logger.js'
import { validate } from '../middleware/validation.js'
import { z } from 'zod'
import type { ApiResponse } from '../types/index.js'
import type { Notification } from '../types/db.js'
import {
  formatMuteDurationMessage,
  getAllowedMuteHours,
  getMuteDurationMeta,
  hasExplicitMuteDurationInRequest,
  parseMuteHoursFromRequest,
} from '../utils/muteDuration.js'
import {
  buildSyncBatchLimitError,
  REQUEST_TIMEOUT_BUDGETS,
  runWithRequestBudget,
} from '../services/requestBudgetService.js'

const router = Router()
router.use(authenticate)
const warningService = new WarningService()
const operationalNotificationService = new OperationalNotificationService()
const DEFAULT_PAGE_SIZE = 20
const MAX_PAGE_SIZE = 100
const DEFAULT_READ_SYNC_TTL_MS = process.env.NODE_ENV === 'test' ? 0 : 60_000
const DEFAULT_READ_SYNC_DELAY_MS = process.env.NODE_ENV === 'test' ? 0 : 250

interface NotificationReadSyncCacheEntry {
  lastAttemptAt: number
  pending?: Promise<void>
}

function parsePositiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

const notificationReadSyncTtlMs = parsePositiveInteger(
  process.env.NOTIFICATION_READ_SYNC_TTL_MS,
  DEFAULT_READ_SYNC_TTL_MS,
)
const notificationReadSyncDelayMs = parsePositiveInteger(
  process.env.NOTIFICATION_READ_SYNC_DELAY_MS,
  DEFAULT_READ_SYNC_DELAY_MS,
)
const notificationReadSyncCache = new Map<string, NotificationReadSyncCacheEntry>()
const shouldAwaitReadSync = process.env.NODE_ENV === 'test'

const notificationIdParamSchema = z.object({
  id: z.string().trim().min(1, 'id 不能为空'),
})

const notificationsQuerySchema = z.object({
  projectId: z.string().trim().min(1).optional(),
  project_id: z.string().trim().min(1).optional(),
  userId: z.string().trim().min(1).optional(),
  user_id: z.string().trim().min(1).optional(),
  limit: z.union([z.string(), z.number()]).optional(),
  offset: z.union([z.string(), z.number()]).optional(),
  unreadOnly: z.union([z.string(), z.number(), z.boolean()]).optional(),
  unread_only: z.union([z.string(), z.number(), z.boolean()]).optional(),
}).passthrough()

const acknowledgeGroupBodySchema = z.object({
  ids: z.array(z.string().trim().min(1)).optional(),
}).passthrough()

const notificationMuteBodySchema = z.object({
  muteHours: z.union([z.string(), z.number()]).optional(),
  mute_hours: z.union([z.string(), z.number()]).optional(),
}).passthrough()

const notificationCreateBodySchema = z.object({
  project_id: z.string().trim().optional().nullable(),
  type: z.string().trim().optional(),
  notification_type: z.string().trim().optional().nullable(),
  severity: z.string().trim().optional().nullable(),
  title: z.string().optional(),
  content: z.string().optional(),
  recipients: z.unknown().optional(),
  source_entity_type: z.string().trim().optional().nullable(),
  source_entity_id: z.string().trim().optional().nullable(),
  status: z.string().trim().optional().nullable(),
}).passthrough()

function normalizeRecipients(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => String(item ?? '').trim())
      .filter((item) => item.length > 0)
  }

  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return []

    try {
      const parsed = JSON.parse(trimmed)
      if (Array.isArray(parsed)) {
        return parsed
          .map((item) => String(item ?? '').trim())
          .filter((item) => item.length > 0)
      }
    } catch {
      return trimmed
        .split(',')
        .map((item) => item.trim())
        .filter((item) => item.length > 0)
    }
  }

  return []
}

function isReadFlag(value: unknown) {
  return value === true || value === 1 || value === '1'
}

function matchesNotificationRecipient(notification: Notification, userId?: string) {
  if (!userId) return true
  return normalizeRecipients(notification.recipients).includes(userId)
}

function isMutedNotification(notification: Notification) {
  if (String(notification.status ?? '').toLowerCase() === 'muted') return true
  if (notification.muted_until) {
    return new Date(notification.muted_until).getTime() > Date.now()
  }
  return false
}

function isUnreadNotification(notification: Notification) {
  if (isMutedNotification(notification)) return false
  return !isReadFlag(notification.is_read) && String(notification.status ?? '').toLowerCase() !== 'read'
}

function isUnreadCountCandidate(notification: Notification) {
  if (isMutedNotification(notification)) return false
  return String(notification.status ?? '').toLowerCase() === 'unread' || !isReadFlag(notification.is_read)
}

function buildValidationError(message: string, details?: unknown): ApiResponse {
  return {
    success: false,
    error: {
      code: 'VALIDATION_ERROR',
      message,
      details,
    },
    timestamp: new Date().toISOString(),
  }
}

function applyNotificationFilters(
  notifications: Notification[],
  options: {
    projectId?: string
    userId?: string
    unreadOnly: boolean
    limit: number
    offset: number
  },
): Notification[] {
  const filtered = notifications
    .filter((item) => !options.projectId || item.project_id === options.projectId)
    .filter((item) => matchesNotificationRecipient(item, options.userId))
    .filter((item) => (!options.unreadOnly ? true : isUnreadNotification(item)))
    .sort((left, right) => String(right.created_at || '').localeCompare(String(left.created_at || '')))

  return filtered.slice(options.offset, options.offset + options.limit)
}

async function listPersistedNotifications() {
  return await listNotifications()
}

async function listPersistedNotificationsForScope(projectId?: string) {
  return await listNotifications(projectId ? { projectId } : {})
}

async function syncNotificationState(projectId?: string) {
  const syncTasks = [
    ['condition_expired_issue_sync', () => warningService.syncConditionExpiredIssues(projectId)],
    ['acceptance_expired_issue_sync', () => warningService.syncAcceptanceExpiredIssues(projectId)],
    ['warning_auto_escalation', () => warningService.autoEscalateWarnings(projectId)],
    ['risk_auto_escalation', () => warningService.autoEscalateRisksToIssues(projectId)],
    ['warning_persistence_sync', () => warningService.syncActiveWarnings(projectId)],
    ['planning_governance_sync', () => planningGovernanceService.persistProjectGovernanceNotifications(projectId)],
    [
      'operational_notification_sync',
      () => (projectId
        ? operationalNotificationService.syncProjectNotifications(projectId)
        : operationalNotificationService.syncAllProjectNotifications()),
    ],
  ] as const

  const results = await Promise.allSettled(syncTasks.map(([, run]) => run()))
  for (const [index, result] of results.entries()) {
    if (result.status === 'fulfilled') continue
    logger.warn('Notification state sync step failed, falling back to persisted notifications', {
      step: syncTasks[index][0],
      projectId: projectId ?? null,
      error: result.reason instanceof Error ? result.reason.message : String(result.reason),
    })
  }
}

async function syncNotificationStateForRead(projectId?: string) {
  if (!projectId) {
    logger.info('Skipping on-read notification sync without project scope; using persisted notifications only')
    return
  }

  const now = Date.now()
  const cached = notificationReadSyncCache.get(projectId)
  if (cached?.pending) {
    if (shouldAwaitReadSync) {
      await cached.pending
    }
    return
  }

  if (cached && now - cached.lastAttemptAt < notificationReadSyncTtlMs) {
    logger.debug('Skipping on-read notification sync within freshness window', {
      projectId,
      ageMs: now - cached.lastAttemptAt,
      ttlMs: notificationReadSyncTtlMs,
    })
    return
  }

  const entry: NotificationReadSyncCacheEntry = { lastAttemptAt: now }
  const runSync = () => runWithRequestBudget(
    {
      operation: 'notifications.state_sync',
      timeoutMs: REQUEST_TIMEOUT_BUDGETS.notificationReadMs,
    },
    () => syncNotificationState(projectId),
  )
    .catch((error) => {
      logger.warn('Notification state sync budget exceeded, falling back to persisted notifications', {
        projectId,
        error: error instanceof Error ? error.message : String(error),
      })
    })
    .finally(() => {
      const latest = notificationReadSyncCache.get(projectId)
      if (latest) {
        latest.pending = undefined
      }
    })

  const pending = shouldAwaitReadSync
    ? runSync()
    : new Promise<void>((resolve) => {
      setTimeout(() => {
        runSync().then(resolve)
      }, notificationReadSyncDelayMs)
    })

  entry.pending = pending
  notificationReadSyncCache.set(projectId, entry)
  if (shouldAwaitReadSync) {
    await pending
  }
}

/**
 * 获取通知列表
 * GET /api/notifications?projectId=xxx&userId=xxx&limit=20&offset=0
 */
router.get('/', validate(notificationsQuerySchema, 'query'), asyncHandler(async (req, res) => {
  const projectId = String(req.query.projectId ?? req.query.project_id ?? '').trim() || undefined
  const userId = String(req.query.userId ?? req.query.user_id ?? '').trim() || undefined
  const limit = Math.min(Math.max(parseInt(req.query.limit as string || String(DEFAULT_PAGE_SIZE), 10), 1), MAX_PAGE_SIZE)
  const offset = Math.max(parseInt(req.query.offset as string || '0', 10), 0)
  const unreadOnly = ['1', 'true', 'yes', 'on'].includes(
    String(req.query.unreadOnly ?? req.query.unread_only ?? '').trim().toLowerCase(),
  )

  logger.info('Fetching notifications', { projectId, userId, limit, offset, unreadOnly })

  await syncNotificationStateForRead(projectId)
  const persistedNotifications = await listPersistedNotificationsForScope(projectId)
  const notifications = applyNotificationFilters(persistedNotifications, {
    projectId,
    userId,
    unreadOnly,
    limit,
    offset,
  })

  const response: ApiResponse<Notification[]> = {
    success: true,
    data: notifications,
    timestamp: new Date().toISOString(),
  }

  res.json(response)
}))

/**
 * 获取未读通知数
 * GET /api/notifications/unread?projectId=xxx&userId=xxx
 */
router.get('/unread', validate(notificationsQuerySchema, 'query'), asyncHandler(async (req, res) => {
  const projectId = String(req.query.projectId ?? req.query.project_id ?? '').trim() || undefined
  const userId = String(req.query.userId ?? req.query.user_id ?? '').trim() || undefined

  logger.info('Fetching unread count', { projectId, userId })

  await syncNotificationStateForRead(projectId)
  const notifications = await listPersistedNotificationsForScope(projectId)
  const count = notifications
    .filter((item) => !projectId || item.project_id === projectId)
    .filter((item) => matchesNotificationRecipient(item, userId))
    .filter((item) => isUnreadCountCandidate(item))
    .length

  const response: ApiResponse<{ count: number }> = {
    success: true,
    data: { count },
    timestamp: new Date().toISOString(),
  }

  res.json(response)
}))

/**
 * 标记单个通知已读
 * PUT /api/notifications/:id/read
 */
router.put('/:id/read', validate(notificationIdParamSchema, 'params'), asyncHandler(async (req, res) => {
  const { id } = req.params

  logger.info('Marking notification as read', { id })

  await updateNotificationById(id, { status: 'read', is_read: true })

  const response: ApiResponse<{ message: string }> = {
    success: true,
    data: { message: '通知已标记为已读' },
    timestamp: new Date().toISOString(),
  }

  res.json(response)
}))

/**
 * 确认通知
 * PUT /api/notifications/:id/acknowledge
 */
router.put('/:id/acknowledge', validate(notificationIdParamSchema, 'params'), asyncHandler(async (req, res) => {
  const { id } = req.params

  logger.info('Acknowledging notification', { id })

  const notification = await findNotification({ id })
  if (notification?.source_entity_type === 'warning') {
    await acknowledgeWarningNotification(id, req.user?.id ?? null)
  } else {
    await updateNotificationById(id, {
      status: 'acknowledged',
      is_read: true,
      acknowledged_at: new Date().toISOString(),
    })
  }

  const response: ApiResponse<{ message: string }> = {
    success: true,
    data: { message: '通知已知悉' },
    timestamp: new Date().toISOString(),
  }

  res.json(response)
}))

/**
 * 按组批量已知悉
 * PUT /api/notifications/acknowledge-group
 */
router.put('/acknowledge-group', validate(acknowledgeGroupBodySchema), asyncHandler(async (req, res) => {
  const ids = Array.isArray(req.body?.ids)
    ? req.body.ids.map((value: unknown) => String(value ?? '').trim()).filter(Boolean)
    : []

  if (ids.length === 0) {
    const response: ApiResponse = {
      success: false,
      error: { code: 'INVALID_NOTIFICATION_IDS', message: '通知分组缺少可处理的通知 ID' },
      timestamp: new Date().toISOString(),
    }
    return res.status(400).json(response)
  }

  logger.info('Acknowledging notification group', { ids, count: ids.length })

  if (ids.length > 100) {
    const error = buildSyncBatchLimitError(ids.length, { operation: 'notifications.acknowledge_group' })
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

  await runWithRequestBudget(
    {
      operation: 'notifications.acknowledge_group',
      timeoutMs: REQUEST_TIMEOUT_BUDGETS.fastReadMs,
    },
    async () => {
      const notifications = await listNotifications({ ids })
      const warningIds = notifications
        .filter((item) => item.source_entity_type === 'warning')
        .map((item) => item.id)
      const regularIds = notifications
        .filter((item) => item.source_entity_type !== 'warning')
        .map((item) => item.id)

      await Promise.all([
        ...warningIds.map((id) => acknowledgeWarningNotification(id, req.user?.id ?? null)),
        regularIds.length > 0
          ? updateNotificationsByIds(regularIds, {
            status: 'acknowledged',
            is_read: true,
            acknowledged_at: new Date().toISOString(),
          })
          : Promise.resolve(),
      ])
    },
  )

  const response: ApiResponse<{ message: string; count: number }> = {
    success: true,
    data: { message: '通知分组已知悉', count: ids.length },
    timestamp: new Date().toISOString(),
  }

  res.json(response)
}))

/**
 * 静音通知 24 小时
 * PUT /api/notifications/:id/mute
 */
router.put('/:id/mute', validate(notificationIdParamSchema, 'params'), validate(notificationMuteBodySchema), asyncHandler(async (req, res) => {
  const { id } = req.params
  const muteRequest = {
    body: req.body as Record<string, unknown> | null,
    query: req.query as Record<string, unknown> | null,
  }
  const parsedMuteHours = parseMuteHoursFromRequest(muteRequest)
  const muteHours = parsedMuteHours ?? 24
  const validMuteHours = getAllowedMuteHours()
  if ((parsedMuteHours == null && hasExplicitMuteDurationInRequest(muteRequest)) || !validMuteHours.includes(muteHours)) {
    return res.status(400).json(buildValidationError('静音时长仅支持 1h / 4h / 24h / 7d', {
      allowed_hours: validMuteHours,
    }))
  }
  const mutedUntil = new Date(Date.now() + muteHours * 60 * 60 * 1000).toISOString()
  const muteMeta = getMuteDurationMeta(muteHours)

  logger.info('Muting notification', { id, mutedUntil, muteHours })

  const currentNotification = await findNotification({ id })
  if (currentNotification?.source_entity_type === 'warning') {
    await muteWarningNotification(id, muteHours, req.user?.id ?? null)
  } else {
    const currentMetadata =
      currentNotification && typeof currentNotification.metadata === 'object' && currentNotification.metadata !== null
        ? currentNotification.metadata
        : {}

    await updateNotificationById(id, {
      status: 'muted',
      is_read: false,
      muted_until: mutedUntil,
      metadata: {
        ...currentMetadata,
        muted_until: mutedUntil,
        muted_hours: muteHours,
        mute_duration: muteMeta.label,
      },
    })
  }

  const response: ApiResponse<{ message: string }> = {
    success: true,
    data: { message: `通知已静音${formatMuteDurationMessage(muteHours)}` },
    timestamp: new Date().toISOString(),
  }

  res.json(response)
}))

/**
 * 全部标记已读
 * PUT /api/notifications/read-all?projectId=xxx&userId=xxx
 */
router.put('/read-all', validate(notificationsQuerySchema, 'query'), asyncHandler(async (req, res) => {
  const projectId = String(req.query.projectId ?? req.query.project_id ?? '').trim() || undefined
  const userId = String(req.query.userId ?? req.query.user_id ?? '').trim() || undefined

  logger.info('Marking all notifications as read', { projectId, userId })

  const notifications = await listPersistedNotificationsForScope(projectId)
  const targetIds = notifications
    .filter((item) => !projectId || item.project_id === projectId)
    .filter((item) => matchesNotificationRecipient(item, userId))
    .filter((item) => isUnreadCountCandidate(item))
    .map((item) => item.id)

  if (targetIds.length > 0) {
    await updateNotificationsByIds(targetIds, { status: 'read', is_read: true })
  }

  const response: ApiResponse<{ message: string }> = {
    success: true,
    data: { message: '已标记全部通知为已读' },
    timestamp: new Date().toISOString(),
  }

  res.json(response)
}))

/**
 * 创建通知（内部使用）
 * POST /api/notifications
 */
router.post('/', validate(notificationCreateBodySchema), asyncHandler(async (req, res) => {
  const notificationData = req.body

  logger.info('Creating notification', notificationData)

  const created: Notification | null = await persistNotification({
    ...notificationData,
    is_read: notificationData.is_read ?? false,
    is_broadcast: notificationData.is_broadcast ?? false,
  })

  const response: ApiResponse<Notification> = {
    success: true,
    data: created as Notification,
    timestamp: new Date().toISOString(),
  }

  res.status(201).json(response)
}))

/**
 * 删除通知
 * DELETE /api/notifications/:id
 */
router.delete('/:id', validate(notificationIdParamSchema, 'params'), asyncHandler(async (req, res) => {
  const { id } = req.params

  logger.info('Deleting notification', { id })

  await deleteNotificationById(id)

  const response: ApiResponse<{ message: string }> = {
    success: true,
    data: { message: '通知已删除' },
    timestamp: new Date().toISOString(),
  }

  res.json(response)
}))

export default router
