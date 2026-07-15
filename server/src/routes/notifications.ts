// 通知中心API路由 - Phase 2

import { Router, type Request, type Response } from 'express'
import { persistNotification } from '../services/warningChainService.js'
import { supabase } from '../services/dbService.js'
import { query as rawQuery } from '../database.js'
import {
  findNotification,
  listNotifications,
  updateNotificationById,
} from '../services/notificationStore.js'
import { asyncHandler } from '../middleware/errorHandler.js'
import { getRequestCompanyId } from '../auth/companyContext.js'
import { authenticate } from '../middleware/auth.js'
import { logger } from '../middleware/logger.js'
import { validate } from '../middleware/validation.js'
import { canAccessProject, getCurrentCompanyMembership, getVisibleProjectIds } from '../auth/access.js'
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
import { getNotificationAnalytics } from '../services/notificationAnalyticsService.js'
import { clearAttentionSummaryCache } from '../services/todoTouchpointService.js'
import { getNotificationProducerAudit } from '../services/notificationProducerAuditService.js'
import { getNotificationReconciliationCoverageMatrix } from '../services/notificationReconciliationService.js'
import { getNotificationDeliveryGovernanceDiagnostics } from '../services/notificationDeliveryGovernanceService.js'
import { planningGovernanceService } from '../services/planningGovernanceService.js'

const router = Router()
router.use(authenticate)
const DEFAULT_PAGE_SIZE = 20
const MAX_PAGE_SIZE = 100
const NOTIFICATION_FAST_CACHE_TTL_MS = 10_000
const GOVERNANCE_NOTIFICATION_SYNC_TTL_MS = 60_000
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type ResponseCacheEntry<T> = {
  expiresAt: number
  promise: Promise<T>
}

const notificationListFastCache = new Map<string, ResponseCacheEntry<Notification[]>>()
const notificationSummaryFastCache = new Map<string, ResponseCacheEntry<Notification[]>>()
const governanceNotificationSyncCache = new Map<string, ResponseCacheEntry<unknown>>()

function clearNotificationFastCaches() {
  notificationListFastCache.clear()
  notificationSummaryFastCache.clear()
}

async function syncProjectGovernanceNotificationsForRead(projectId?: string | null) {
  if (!projectId) return
  const now = Date.now()
  const cached = governanceNotificationSyncCache.get(projectId)
  if (cached && cached.expiresAt > now) {
    return cached.promise
  }
  if (cached) {
    governanceNotificationSyncCache.delete(projectId)
  }

  const promise = planningGovernanceService.persistProjectGovernanceNotifications(projectId)
    .catch((error) => {
      governanceNotificationSyncCache.delete(projectId)
      throw error
    })
  governanceNotificationSyncCache.set(projectId, { expiresAt: now + GOVERNANCE_NOTIFICATION_SYNC_TTL_MS, promise })
  return promise
}

async function readThroughCache<T>(
  cache: Map<string, ResponseCacheEntry<T>>,
  key: string,
  loader: () => Promise<T>,
) {
  const now = Date.now()
  const cached = cache.get(key)
  if (cached && cached.expiresAt > now) {
    return cached.promise
  }
  if (cached) {
    cache.delete(key)
  }

  const promise = loader().catch((error) => {
    const current = cache.get(key)
    if (current?.promise === promise) {
      cache.delete(key)
    }
    throw error
  })
  cache.set(key, { expiresAt: now + NOTIFICATION_FAST_CACHE_TTL_MS, promise })
  return promise
}

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
  touchpointType: z.string().trim().optional(),
  touchpoint_type: z.string().trim().optional(),
  category: z.string().trim().optional(),
  type: z.string().trim().optional(),
  types: z.union([z.string(), z.array(z.string())]).optional(),
}).passthrough()

const notificationSummaryQuerySchema = z.object({
  projectId: z.string().trim().min(1).optional(),
  project_id: z.string().trim().min(1).optional(),
  userId: z.string().trim().min(1).optional(),
  user_id: z.string().trim().min(1).optional(),
}).passthrough()

const notificationAnalyticsQuerySchema = z.object({
  projectId: z.string().trim().min(1).optional(),
  project_id: z.string().trim().min(1).optional(),
  since: z.string().trim().optional(),
  until: z.string().trim().optional(),
  limit: z.union([z.string(), z.number()]).optional(),
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

function getNotificationUserId(notification: Notification) {
  return String(notification.user_id ?? '').trim()
}

function isDirectNotificationRecipient(notification: Notification, userId: string) {
  if (!userId) return false
  if (getNotificationUserId(notification) === userId) return true
  return normalizeRecipients(notification.recipients).includes(userId)
}

function isNotificationRecipient(notification: Notification, userId: string) {
  if (isDirectNotificationRecipient(notification, userId)) return true
  return Boolean(notification.is_broadcast && !notification.project_id)
}

function matchesNotificationRecipient(notification: Notification, userId?: string) {
  if (!userId) return true
  return isNotificationRecipient(notification, userId)
}

type PersonalNotificationState = {
  actor_id?: string
  is_read?: boolean
  is_acknowledged?: boolean
  is_muted?: boolean
  is_hidden?: boolean
  read_at?: string
  acknowledged_at?: string
  muted_at?: string
  hidden_at?: string
  muted_until?: string
  muted_hours?: number
  mute_duration?: string
  updated_at?: string
}

async function fetchUserNotificationStates(userId: string, notificationIds: string[]): Promise<Map<string, PersonalNotificationState>> {
  const map = new Map<string, PersonalNotificationState>()
  if (!notificationIds.length) return map
  if (!UUID_PATTERN.test(userId)) return map

  try {
    const result = await rawQuery(
      `
        SELECT notification_id, is_read, is_acknowledged, is_muted, is_hidden, read_at, acknowledged_at, muted_at, muted_until, hidden_at
        FROM public.notification_user_states
        WHERE user_id = $1
          AND notification_id::text = ANY($2::text[])
      `,
      [userId, notificationIds],
    )

    for (const row of (result.rows ?? [])) {
      const mutedUntil = row.muted_until ?? (row.is_muted ? '9999-12-31' : undefined)
      map.set(String(row.notification_id), {
        is_read: row.is_read,
        is_acknowledged: row.is_acknowledged,
        is_muted: row.is_muted,
        is_hidden: row.is_hidden,
        read_at: row.read_at,
        acknowledged_at: row.acknowledged_at,
        muted_at: row.muted_at,
        hidden_at: row.hidden_at,
        muted_until: mutedUntil,
      })
    }
    return map
  } catch {
    // Fall back for test databases that do not include the v1.4.13 state table.
  }

  let rows: Array<Record<string, any>> = []
  try {
    const result = await (supabase as any)
      .from('notification_user_states')
      .select('notification_id, is_read, is_acknowledged, is_muted, is_hidden, read_at, acknowledged_at, muted_at, muted_until, hidden_at')
      .eq('user_id', userId)
      .in('notification_id', notificationIds)
    rows = result.data ?? []
  } catch {
    return map
  }

  for (const row of rows) {
    const mutedUntil = row.muted_until ?? (row.is_muted ? '9999-12-31' : undefined)
    map.set(row.notification_id, {
      is_read: row.is_read,
      is_acknowledged: row.is_acknowledged,
      is_muted: row.is_muted,
      is_hidden: row.is_hidden,
      read_at: row.read_at,
      acknowledged_at: row.acknowledged_at,
      muted_at: row.muted_at,
      hidden_at: row.hidden_at,
      muted_until: mutedUntil,
    })
  }
  return map
}

async function upsertUserNotificationState(userId: string, notificationId: string, patch: Record<string, unknown>) {
  await (supabase as any)
    .from('notification_user_states')
    .upsert({ notification_id: notificationId, user_id: userId, ...patch, updated_at: new Date().toISOString() },
      { onConflict: 'notification_id,user_id' })
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

function isPlanningMappingNotification(notification: Notification) {
  const token = `${notification.category ?? ''} ${notification.notification_type ?? ''} ${notification.type ?? ''} ${notification.title ?? ''} ${notification.content ?? ''}`.toLowerCase()
  return (
    notification.category === 'planning_mapping_orphan' ||
    notification.notification_type === 'planning-governance-mapping' ||
    notification.type === 'planning_gov_mapping_orphan_pointer' ||
    (notification.source_entity_type === 'planning_governance' && /(mapping|orphan|孤立|映射)/.test(token))
  )
}

function getReminderTab(notification: Notification): 'business-warning' | 'system-exception' | 'flow-reminder' {
  if (isPlanningMappingNotification(notification)) {
    return 'system-exception'
  }

  if (
    notification.notification_type === 'business-warning' ||
    notification.notification_type === 'system-exception' ||
    notification.notification_type === 'flow-reminder'
  ) {
    return notification.notification_type
  }

  const token = `${notification.category ?? ''} ${notification.type ?? ''} ${notification.title ?? ''} ${notification.content ?? ''}`.toLowerCase()

  if (
    notification.category === 'risk' ||
    notification.category === 'problem' ||
    /(风险|问题|预警|告警)/.test(token)
  ) {
    return 'business-warning'
  }

  if (
    notification.category === 'materials' ||
    notification.source_entity_type === 'project_material' ||
    notification.notification_type === 'material_arrival_reminder' ||
    notification.notification_type === 'material_arrival_overdue' ||
    notification.type === 'material_arrival_reminder' ||
    notification.type === 'material_arrival_overdue' ||
    /(材料|到场|逾期未到)/.test(token)
  ) {
    return 'flow-reminder'
  }

  if (
    /(任务|wbs|条件|阻碍|延期|里程碑|证照|验收|图纸|许可)/.test(token) ||
    Boolean(notification.task_id) ||
    Boolean(((notification as unknown) as Record<string, unknown>).milestone_id ?? ((notification as unknown) as Record<string, unknown>).milestoneId)
  ) {
    return 'flow-reminder'
  }

  return 'system-exception'
}

function isReminderNotification(notification: Notification) {
  if (isPlanningMappingNotification(notification)) {
    return true
  }

  if (
    notification.notification_type === 'business-warning' ||
    notification.notification_type === 'system-exception' ||
    notification.notification_type === 'flow-reminder'
  ) {
    return true
  }

  const token = `${notification.category ?? ''} ${notification.type ?? ''} ${notification.title ?? ''} ${notification.content ?? ''}`.toLowerCase()
  return (
    notification.category === 'materials' ||
    notification.source_entity_type === 'project_material' ||
    notification.notification_type === 'material_arrival_reminder' ||
    notification.notification_type === 'material_arrival_overdue' ||
    notification.type === 'material_arrival_reminder' ||
    notification.type === 'material_arrival_overdue' ||
    notification.category === 'system' ||
    notification.category === 'risk' ||
    notification.category === 'problem' ||
    !notification.category ||
    /(材料|到场|逾期未到)/.test(token) ||
    token.includes('reminder') ||
    token.includes('warning') ||
    token.includes('risk') ||
    token.includes('problem') ||
    token.includes('condition') ||
    token.includes('obstacle') ||
    token.includes('acceptance') ||
    token.includes('delay') ||
    token.includes('notice')
  )
}

type NotificationSummary = {
  pendingCount: number
  processedCount: number
  businessWarningCount: number
  systemExceptionCount: number
  systemExceptionMappingCount: number
  flowReminderCount: number
  linkedProjectCount: number
  allCount: number
}

function buildNotificationSummary(notifications: Notification[]): NotificationSummary {
  const reminders = notifications.filter(isReminderNotification)
  const counts: NotificationSummary = {
    pendingCount: 0,
    processedCount: 0,
    businessWarningCount: 0,
    systemExceptionCount: 0,
    systemExceptionMappingCount: 0,
    flowReminderCount: 0,
    linkedProjectCount: 0,
    allCount: 0,
  }

  for (const item of reminders) {
    counts.allCount += 1
    if (isUnreadNotification(item)) counts.pendingCount += 1
    if (!isUnreadNotification(item)) counts.processedCount += 1
    if (Boolean(item.project_id)) counts.linkedProjectCount += 1

    const reminderTab = getReminderTab(item)
    if (reminderTab === 'business-warning') counts.businessWarningCount += 1
    if (reminderTab === 'system-exception') {
      counts.systemExceptionCount += 1
      if (isPlanningMappingNotification(item)) {
        counts.systemExceptionMappingCount += 1
      }
    }
    if (reminderTab === 'flow-reminder') counts.flowReminderCount += 1
  }

  return counts
}

function serializeNotification(notification: Notification) {
  return {
    ...notification,
    message: notification.content,
    body: notification.content,
  }
}

function isNotificationCurrentlyVisible(notification: Notification) {
  if (String(notification.status ?? '').trim().toLowerCase() === 'hidden') return false
  const expiresAt = notification.expires_at
  if (!expiresAt) return true
  const expiresAtMs = new Date(expiresAt).getTime()
  return Number.isNaN(expiresAtMs) || expiresAtMs > Date.now()
}

function applyPersonalStateToNotification(
  notification: Notification,
  state?: PersonalNotificationState,
): Notification {
  if (!state) return notification
  const stateRead = Boolean(state.is_read || state.is_acknowledged || state.read_at || state.acknowledged_at)
  const mutedUntil = state.muted_until ?? (state.is_muted ? '9999-12-31' : undefined)
  return {
    ...notification,
    is_read: stateRead ? true : notification.is_read,
    status: state.is_muted ? 'muted' : stateRead ? 'read' : notification.status,
    muted_until: mutedUntil ?? notification.muted_until,
  }
}

function applyPersonalStatesToNotifications(
  notifications: Notification[],
  userId: string | undefined,
  states: Map<string, PersonalNotificationState>,
) {
  if (!userId || states.size === 0) return notifications
  return notifications.map((item) => applyPersonalStateToNotification(item, states.get(item.id)))
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

function getNotificationTypeFilters(req: Request) {
  const category = String(req.query.category ?? '').trim() || undefined
  const type = String(req.query.type ?? '').trim() || undefined
  const rawTypes = req.query.types
  const types = Array.isArray(rawTypes)
    ? rawTypes.map((item) => String(item ?? '').trim()).filter(Boolean)
    : String(rawTypes ?? '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)

  return { category, type, types: types.length > 0 ? types : undefined }
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

async function listVisibleNotificationsFast(options: {
  req: Request
  projectId?: string
  touchpointType?: string
  category?: string
  type?: string
  types?: string[]
  limit?: number
  offset?: number
}) {
  const userId = options.req.user?.id
  if (!userId) return null

  const requestedCompanyId = getRequestCompanyId(options.req)
  const membership = await getCurrentCompanyMembership(userId, requestedCompanyId)
  const companyId = membership?.companyId ?? null
  const visibleProjectIds = await getVisibleProjectIds(userId, options.req.user?.globalRole, companyId)
  const canSeeAllProjects = visibleProjectIds === null
  const projectIds = canSeeAllProjects ? null : visibleProjectIds

  const cacheKey = JSON.stringify({
    userId,
    companyId,
    projectIds,
    projectId: options.projectId ?? null,
    touchpointType: options.touchpointType ?? null,
    category: options.category ?? null,
    type: options.type ?? null,
    types: options.types ?? null,
    limit: options.limit ?? null,
    offset: options.offset ?? 0,
  })

  const cache = options.limit === undefined && !options.offset
    ? notificationSummaryFastCache
    : notificationListFastCache

  return readThroughCache(cache, cacheKey, async () => {
    const result = await rawQuery(
      `
        SELECT n.*
          FROM public.notifications n
         WHERE COALESCE(n.lifecycle_status, 'active') <> 'archived'
           AND COALESCE(n.status, '') <> 'hidden'
           AND (n.expires_at IS NULL OR n.expires_at > now())
           AND ($5::text IS NULL OR n.touchpoint_type = $5::text)
           AND ($6::text IS NULL OR n.category = $6::text)
           AND ($7::text IS NULL OR n.type = $7::text)
           AND ($8::text[] IS NULL OR n.type = ANY($8::text[]))
           AND ($11::text IS NULL OR n.project_id::text = $11::text)
           AND (
             n.user_id::text = $1::text
             OR (to_jsonb(n.recipients) ? $1::text)
             OR (
               n.project_id IS NOT NULL
               AND ($3::boolean = true OR n.project_id::text = ANY($4::text[]))
             )
             OR (
               n.project_id IS NULL
               AND COALESCE(n.is_broadcast, false) = true
               AND (
                 (n.company_id IS NOT NULL AND $2::text IS NOT NULL AND n.company_id::text = $2::text)
                 OR (n.company_id IS NULL AND COALESCE(n.is_system, false) = true)
               )
             )
           )
         ORDER BY n.created_at DESC
         LIMIT COALESCE($9::int, 2147483647)
         OFFSET $10::int
      `,
      [
        userId,
        companyId,
        canSeeAllProjects,
        projectIds ?? [],
        options.touchpointType ?? null,
        options.category ?? null,
        options.type ?? null,
        options.types ?? null,
        options.limit ?? null,
        options.offset ?? 0,
        options.projectId ?? null,
      ],
    )

    return (result.rows ?? []) as Notification[]
  })
}

async function listPersistedNotificationsForScope(req: Request, projectId?: string, touchpointType?: string) {
  const { category, type, types } = getNotificationTypeFilters(req)

  if (projectId) {
    return await listNotifications({ projectId, touchpointType, category, type, types })
  }

  const membership = req.user?.id
    ? await getCurrentCompanyMembership(req.user.id, getRequestCompanyId(req))
    : null
  return await listNotifications({
    companyId: membership?.companyId ?? null,
    scopeUserId: req.user?.id,
    touchpointType,
    category,
    type,
    types,
  })
}

function notificationNotFound(res: Response) {
  return res.status(404).json({
    success: false,
    error: { code: 'NOT_FOUND', message: '通知不存在' },
    timestamp: new Date().toISOString(),
  })
}

function notificationForbidden(res: Response) {
  return res.status(403).json({
    success: false,
    error: { code: 'FORBIDDEN', message: '当前账号不能处理该通知' },
    timestamp: new Date().toISOString(),
  })
}

function isInternalNotificationMutation(req: Request) {
  const serviceToken = String(req.headers['x-service-token'] ?? '').trim()
  return (serviceToken === process.env.INTERNAL_SERVICE_TOKEN) || ((req as any).isService === true)
}

async function canHandleNotification(req: Request, notification: Notification) {
  const userId = req.user?.id
  if (!userId) return false
  const membership = await getCurrentCompanyMembership(userId, getRequestCompanyId(req))
  const currentCompanyId = String(membership?.companyId ?? '').trim()
  const notificationCompanyId = String(notification.company_id ?? '').trim()

  if (notification.project_id) {
    return await canAccessProject(userId, notification.project_id, notificationCompanyId || currentCompanyId || null)
  }

  if (notificationCompanyId && notificationCompanyId !== currentCompanyId) {
    return false
  }

  if (isDirectNotificationRecipient(notification, userId)) return true
  if (notification.is_broadcast) {
    if (!notificationCompanyId) return Boolean(notification.is_system)
    return notificationCompanyId === currentCompanyId
  }
  return false
}

async function filterVisibleNotifications(req: Request, notifications: Notification[]) {
  const visible: Notification[] = []
  for (const item of notifications) {
    if (!isNotificationCurrentlyVisible(item)) continue
    if (await canHandleNotification(req, item)) {
      visible.push(item)
    }
  }
  return visible
}

async function resolveNotificationUserFilter(req: Request, res: Response, requestedUserId?: string) {
  if (!requestedUserId) return undefined
  if (requestedUserId === req.user?.id) return requestedUserId
  const membership = req.user?.id
    ? await getCurrentCompanyMembership(req.user.id, getRequestCompanyId(req))
    : null
  if (membership?.role === 'company_admin') return requestedUserId
  res.status(403).json({
    success: false,
    error: { code: 'FORBIDDEN', message: '当前账号不能查看其他用户的提醒' },
    timestamp: new Date().toISOString(),
  })
  return null
}

async function loadNotificationForPersonalAction(req: Request, res: Response, id: string) {
  const notification = await findNotification({ id })
  if (!notification) {
    notificationNotFound(res)
    return null
  }

  if (!await canHandleNotification(req, notification)) {
    notificationForbidden(res)
    return null
  }

  return notification
}

async function markNotificationPersonalRead(notification: Notification, userId: string, timestamp = new Date().toISOString()) {
  await upsertUserNotificationState(userId, notification.id, { is_read: true, read_at: timestamp })
  clearNotificationFastCaches()
  clearAttentionSummaryCache()
}

async function acknowledgeNotificationPersonally(notification: Notification, userId: string, timestamp = new Date().toISOString()) {
  await upsertUserNotificationState(userId, notification.id, { is_read: true, is_acknowledged: true, read_at: timestamp, acknowledged_at: timestamp })
  clearNotificationFastCaches()
  clearAttentionSummaryCache()
}

async function muteNotificationPersonally(
  notification: Notification,
  userId: string,
  options: { mutedUntil: string; muteHours: number; muteDuration: string; timestamp?: string },
) {
  const timestamp = options.timestamp ?? new Date().toISOString()
  await upsertUserNotificationState(userId, notification.id, { is_muted: true, muted_at: timestamp, muted_until: options.mutedUntil })
  clearNotificationFastCaches()
  clearAttentionSummaryCache()
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
  const requestedTouchpointType = String(req.query.touchpointType ?? req.query.touchpoint_type ?? 'persistent').trim()
  const touchpointType = requestedTouchpointType && requestedTouchpointType !== 'all' ? requestedTouchpointType : undefined

  logger.info('Fetching notifications', { projectId, userId, limit, offset, unreadOnly, touchpointType })

  const userFilter = await resolveNotificationUserFilter(req, res, userId)
  if (userFilter === null) return

  const category = String(req.query.category ?? '').trim() || undefined
  const type = String(req.query.type ?? '').trim() || undefined
  const rawTypes = req.query.types
  const types = Array.isArray(rawTypes)
    ? rawTypes.map((item) => String(item ?? '').trim()).filter(Boolean)
    : String(rawTypes ?? '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)

  if (projectId && req.user?.id && !userFilter) {
    const canReadProject = await canAccessProject(req.user.id, projectId, getRequestCompanyId(req))
    if (!canReadProject) {
      return res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: '当前账号不能查看此项目提醒' },
        timestamp: new Date().toISOString(),
      })
    }
  }

  if (!projectId && req.user?.id && (!userFilter || userFilter === req.user.id)) {
    try {
      const fastRows = await listVisibleNotificationsFast({
        req,
        touchpointType,
        category,
        type,
        types,
        limit: unreadOnly || userFilter ? undefined : limit,
        offset: unreadOnly || userFilter ? undefined : offset,
      })
      if (fastRows) {
        const effectiveUserId = userFilter ?? req.user.id
        const userStates = await fetchUserNotificationStates(effectiveUserId, fastRows.map((n) => n.id))
        const rowsWithState = applyPersonalStatesToNotifications(fastRows, effectiveUserId, userStates)
        const notifications = unreadOnly || userFilter
          ? applyNotificationFilters(rowsWithState, {
            projectId,
            userId: userFilter,
            unreadOnly,
            limit,
            offset,
          })
          : rowsWithState

        return res.json({
          success: true,
          data: notifications.map((item) => serializeNotification(item)),
          timestamp: new Date().toISOString(),
        } satisfies ApiResponse<Array<Notification & { message: string; body: string }>>)
      }
    } catch (error) {
      logger.warn('[notifications] fast list path failed, falling back to store path', { error })
    }
  }

  let notifications: Notification[]
  try {
    const persistedNotifications = await listPersistedNotificationsForScope(req, projectId, touchpointType)
    const visibleNotifications = await filterVisibleNotifications(req, persistedNotifications)
    notifications = applyNotificationFilters(visibleNotifications, {
      projectId,
      userId: userFilter,
      unreadOnly,
      limit,
      offset,
    })
  } catch (error) {
    logger.error('[notifications] store list path failed', {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    })
    throw error
  }

  // v1.4.13: pre-fetch notification_user_states to enrich serialized output
  const effectiveUserId = userFilter ?? req.user?.id
  const userStates = effectiveUserId ? await fetchUserNotificationStates(effectiveUserId, notifications.map((n) => n.id)) : new Map()
  const notificationsWithState = applyPersonalStatesToNotifications(notifications, effectiveUserId, userStates)

  const response: ApiResponse<Array<Notification & { message: string; body: string }>> = {
    success: true,
    data: notificationsWithState.map((item) => {
      const serialized = serializeNotification(item)
      const state = effectiveUserId ? userStates.get(item.id) : undefined
      if (state) {
        serialized.is_read = state.is_read ? true : serialized.is_read
        if (state.is_muted) serialized.status = 'muted'
        else if (state.is_read) serialized.status = 'read'
      }
      return serialized
    }),
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

  const userFilter = await resolveNotificationUserFilter(req, res, userId)
  if (userFilter === null) return

  const notifications = await listPersistedNotificationsForScope(req, projectId)
  const visibleNotifications = await filterVisibleNotifications(req, notifications)
  const effectiveUserId = userFilter ?? req.user?.id
  const userStates = effectiveUserId
    ? await fetchUserNotificationStates(effectiveUserId, visibleNotifications.map((item) => item.id))
    : new Map<string, PersonalNotificationState>()
  const visibleNotificationsWithState = applyPersonalStatesToNotifications(
    visibleNotifications,
    effectiveUserId,
    userStates,
  )
  // eslint-disable-next-line -- route-level-aggregation-approved; endpoint-owned scoped unread count after visibility and recipient checks
  const count = visibleNotificationsWithState
    .filter((item) => !projectId || item.project_id === projectId)
    .filter((item) => matchesNotificationRecipient(item, userFilter))
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
 * 获取提醒中心摘要统计
 * GET /api/notifications/summary?projectId=xxx&userId=xxx
 */
router.get('/summary', validate(notificationSummaryQuerySchema, 'query'), asyncHandler(async (req, res) => {
  const projectId = String(req.query.projectId ?? req.query.project_id ?? '').trim() || undefined
  const userId = String(req.query.userId ?? req.query.user_id ?? '').trim() || undefined

  logger.info('Fetching notification summary', { projectId, userId })

  const userFilter = await resolveNotificationUserFilter(req, res, userId)
  if (userFilter === null) return

  if (projectId) {
    syncProjectGovernanceNotificationsForRead(projectId).catch((error) => {
      logger.warn('[notifications] governance notification background sync failed', { projectId, error })
    })
  }

  if (req.user?.id && (!userFilter || userFilter === req.user.id)) {
    try {
      const fastRows = await listVisibleNotificationsFast({ req, projectId })
      if (fastRows) {
        const effectiveUserId = userFilter ?? req.user.id
        const userStates = await fetchUserNotificationStates(effectiveUserId, fastRows.map((n) => n.id))
        const rowsWithState = applyPersonalStatesToNotifications(fastRows, effectiveUserId, userStates)
        const summary = buildNotificationSummary(
          rowsWithState.filter((item) => matchesNotificationRecipient(item, userFilter)),
        )

        return res.json({
          success: true,
          data: summary,
          timestamp: new Date().toISOString(),
        } satisfies ApiResponse<NotificationSummary>)
      }
    } catch (error) {
      logger.warn('[notifications] fast summary path failed, falling back to store path', { error })
    }
  }

  const notifications = await listPersistedNotificationsForScope(req, projectId)
  const visibleNotifications = await filterVisibleNotifications(req, notifications)
  const effectiveUserId = userFilter ?? req.user?.id
  const userStates = effectiveUserId ? await fetchUserNotificationStates(effectiveUserId, visibleNotifications.map((n) => n.id)) : new Map()
  const visibleNotificationsWithState = applyPersonalStatesToNotifications(visibleNotifications, effectiveUserId, userStates)
  const summary = buildNotificationSummary(
    visibleNotificationsWithState.filter((item) => !projectId || item.project_id === projectId)
      .filter((item) => matchesNotificationRecipient(item, userFilter)),
  )

  const response: ApiResponse<NotificationSummary> = {
    success: true,
    data: summary,
    timestamp: new Date().toISOString(),
  }

  res.json(response)
}))

/**
 * 获取触达分析后台摘要
 * GET /api/notifications/analytics?projectId=xxx&since=2026-05-01
 */
router.get('/analytics', validate(notificationAnalyticsQuerySchema, 'query'), asyncHandler(async (req, res) => {
  const userId = req.user?.id
  if (!userId) {
    return res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: '请先登录' },
      timestamp: new Date().toISOString(),
    })
  }

  const projectId = String(req.query.projectId ?? req.query.project_id ?? '').trim() || null
  const requestedCompanyId = getRequestCompanyId(req)
  const membership = await getCurrentCompanyMembership(userId, requestedCompanyId)
  const effectiveCompanyId = membership?.companyId ?? requestedCompanyId ?? null

  if (projectId) {
    const allowed = await canAccessProject(userId, projectId, effectiveCompanyId)
    if (!allowed) {
      return res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: '无权查看该项目触达分析' },
        timestamp: new Date().toISOString(),
      })
    }
  } else if (!effectiveCompanyId || !membership) {
    return res.status(403).json({
      success: false,
      error: { code: 'FORBIDDEN', message: '无可用公司上下文' },
      timestamp: new Date().toISOString(),
    })
  }

  const limit = Math.min(Math.max(parseInt(String(req.query.limit ?? '5000'), 10), 1), 10000)
  const analytics = await getNotificationAnalytics({
    companyId: projectId ? null : effectiveCompanyId,
    projectId,
    since: String(req.query.since ?? '').trim() || null,
    until: String(req.query.until ?? '').trim() || null,
    limit,
  })

  res.json({
    success: true,
    data: analytics,
    timestamp: new Date().toISOString(),
  } satisfies ApiResponse)
}))

/**
 * 获取通知触点治理诊断
 * GET /api/notifications/diagnostics?projectId=xxx&since=2026-05-01
 */
router.get('/diagnostics', validate(notificationAnalyticsQuerySchema, 'query'), asyncHandler(async (req, res) => {
  const userId = req.user?.id
  if (!userId) {
    return res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: '请先登录' },
      timestamp: new Date().toISOString(),
    })
  }

  const projectId = String(req.query.projectId ?? req.query.project_id ?? '').trim() || null
  const requestedCompanyId = getRequestCompanyId(req)
  const membership = await getCurrentCompanyMembership(userId, requestedCompanyId)
  const effectiveCompanyId = membership?.companyId ?? requestedCompanyId ?? null

  if (projectId) {
    const allowed = await canAccessProject(userId, projectId, effectiveCompanyId)
    if (!allowed) {
      return res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: '无权查看该项目通知治理诊断' },
        timestamp: new Date().toISOString(),
      })
    }
  } else if (!effectiveCompanyId || !membership) {
    return res.status(403).json({
      success: false,
      error: { code: 'FORBIDDEN', message: '无可用公司上下文' },
      timestamp: new Date().toISOString(),
    })
  }

  const limit = Math.min(Math.max(parseInt(String(req.query.limit ?? '5000'), 10), 1), 10000)
  const analytics = await getNotificationAnalytics({
    companyId: projectId ? null : effectiveCompanyId,
    projectId,
    since: String(req.query.since ?? '').trim() || null,
    until: String(req.query.until ?? '').trim() || null,
    limit,
  })

  res.json({
    success: true,
    data: {
      analytics,
      producerAudit: getNotificationProducerAudit(process.cwd()),
      reconciliationCoverage: getNotificationReconciliationCoverageMatrix(),
      deliveryGovernance: getNotificationDeliveryGovernanceDiagnostics(),
    },
    timestamp: new Date().toISOString(),
  } satisfies ApiResponse)
}))

/**
 * 标记单个通知已读
 * PUT /api/notifications/:id/read
 */
router.put('/:id/read', validate(notificationIdParamSchema, 'params'), asyncHandler(async (req, res) => {
  const { id } = req.params

  logger.info('Marking notification as read', { id })

  const notification = await loadNotificationForPersonalAction(req, res, id)
  if (!notification) return

  await markNotificationPersonalRead(notification, req.user!.id)

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

  const notification = await loadNotificationForPersonalAction(req, res, id)
  if (!notification) return

  await acknowledgeNotificationPersonally(notification, req.user!.id)

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
      const foundIds = new Set(notifications.map((item) => item.id))
      const missingIds = ids.filter((id) => !foundIds.has(id))
      if (missingIds.length > 0) {
        const error = new Error(`通知不存在: ${missingIds.join(', ')}`)
        ;(error as Error & { statusCode?: number; code?: string }).statusCode = 404
        ;(error as Error & { statusCode?: number; code?: string }).code = 'NOT_FOUND'
        throw error
      }

      for (const notification of notifications) {
        if (!await canHandleNotification(req, notification)) {
          const error = new Error('当前账号不能处理该通知')
          ;(error as Error & { statusCode?: number; code?: string }).statusCode = 403
          ;(error as Error & { statusCode?: number; code?: string }).code = 'FORBIDDEN'
          throw error
        }
      }

      const timestamp = new Date().toISOString()
      await Promise.all(
        notifications.map((notification) => acknowledgeNotificationPersonally(notification, req.user!.id, timestamp)),
      )
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

  const currentNotification = await loadNotificationForPersonalAction(req, res, id)
  if (!currentNotification) return

  await muteNotificationPersonally(currentNotification, req.user!.id, {
    mutedUntil,
    muteHours,
    muteDuration: muteMeta.label,
  })

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
  const userId = req.user?.id

  logger.info('Marking all notifications as read', { projectId, userId })

  const notifications = await listPersistedNotificationsForScope(req, projectId)
  const userStates = userId
    ? await fetchUserNotificationStates(userId, notifications.map((item) => item.id))
    : new Map<string, PersonalNotificationState>()
  const notificationsWithState = applyPersonalStatesToNotifications(notifications, userId, userStates)
  const targetNotifications = []
  for (const item of notificationsWithState) {
    if (projectId && item.project_id !== projectId) continue
    if (!isUnreadCountCandidate(item)) continue
    if (!await canHandleNotification(req, item)) continue
    targetNotifications.push(item)
  }

  const timestamp = new Date().toISOString()
  await Promise.all(targetNotifications.map((item) => markNotificationPersonalRead(item, userId!, timestamp)))

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
  // v1.4.12: notification creation is internal-only (service token / job / governance service)
  // Normal frontend users should not create notifications directly
  if (!isInternalNotificationMutation(req)) {
    return res.status(403).json({
      success: false,
      error: { code: 'FORBIDDEN', message: '通知创建仅限内部服务调用' },
      timestamp: new Date().toISOString(),
    })
  }

  const notificationData = req.body

  logger.info('Creating notification', notificationData)

  const created: Notification | null = await persistNotification({
    ...notificationData,
    is_read: notificationData.is_read ?? false,
    is_broadcast: notificationData.is_broadcast ?? false,
  })
  clearNotificationFastCaches()
  clearAttentionSummaryCache()

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

  if (!isInternalNotificationMutation(req)) {
    return res.status(403).json({
      success: false,
      error: { code: 'FORBIDDEN', message: '通知删除仅限内部治理服务处理' },
      timestamp: new Date().toISOString(),
    })
  }

  // v1.4.12: upgrade chain protection — cannot physically delete escalated/chain-linked warnings
  const notification = await findNotification({ id })
  if (notification?.source_entity_type === 'warning') {
    if (notification.is_escalated || notification.escalated_to_risk_id) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'UPGRADE_CHAIN_PROTECTED',
          message: '该预警已进入升级链，请改为关闭',
        },
        timestamp: new Date().toISOString(),
      })
    }
  }

  // v1.4.15: notifications are hidden/resolved, not physically deleted by
  // ordinary lifecycle handling.
  const { enforceRetentionOrBlock, buildRetentionBlockedApiError, buildRetentionBlockedHttpStatus } = await import('../services/deletionRetentionGovernanceService.js')
  const retention = await enforceRetentionOrBlock({
    entityType: 'notification',
    entityId: id,
    projectId: notification?.project_id ?? null,
    userId: req.user?.id ?? null,
    userAction: 'hide',
  })
  if (retention.blocked) {
    return res.status(buildRetentionBlockedHttpStatus(retention.result)).json({
      success: false,
      error: buildRetentionBlockedApiError(retention.reason, retention.result),
      timestamp: new Date().toISOString(),
    })
  }

  await updateNotificationById(id, {
    status: 'hidden',
    resolved_at: new Date().toISOString(),
    resolved_source: 'user_hide',
    updated_at: new Date().toISOString(),
  } as Partial<Notification>, notification as Notification)
  clearNotificationFastCaches()
  clearAttentionSummaryCache()

  const response: ApiResponse<{ message: string }> = {
    success: true,
    data: { message: '通知已隐藏' },
    timestamp: new Date().toISOString(),
  }

  res.json(response)
}))

// ============================================================
// v1.4.13: Unified attention summary for Header, Sidebar, Dashboard
// GET /api/notifications/attention-summary?projectId=&companyId=
// ============================================================
router.get(
  '/attention-summary',
  asyncHandler(async (req, res) => {
    const projectId = String(req.query.projectId ?? req.query.project_id ?? '').trim() || null
    const userId = req.user?.id ?? null

    if (projectId && userId && !await canAccessProject(userId, projectId, getRequestCompanyId(req))) {
      return res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: '当前账号不能查看该项目提醒摘要' },
        timestamp: new Date().toISOString(),
      })
    }

    const membership = !projectId && userId
      ? await getCurrentCompanyMembership(userId, getRequestCompanyId(req))
      : null
    const companyId = projectId ? null : membership?.companyId ?? null

    const { buildAttentionSummary } = await import('../services/todoTouchpointService.js')
    const summary = await buildAttentionSummary(projectId, companyId, userId)

    res.json({
      success: true,
      data: summary,
      timestamp: new Date().toISOString(),
    })
  }),
)

export default router
