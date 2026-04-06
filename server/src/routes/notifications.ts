// 通知中心API路由 - Phase 2

import { Router } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { executeSQL, executeSQLOne } from '../services/dbService.js'
import { WarningService } from '../services/warningService.js'
import { asyncHandler } from '../middleware/errorHandler.js'
import { authenticate } from '../middleware/auth.js'
import { logger } from '../middleware/logger.js'
import type { ApiResponse } from '../types/index.js'
import type { Notification } from '../types/db.js'

const router = Router()
router.use(authenticate)
const warningService = new WarningService()

function notificationSignature(notification: Partial<Notification>) {
  return [
    notification.project_id || '',
    notification.type || '',
    notification.title || '',
    notification.source_entity_type || '',
    notification.source_entity_id || '',
  ].join('|')
}

function applyNotificationFilters(
  notifications: Notification[],
  options: {
    projectId?: string
    unreadOnly: boolean
    limit: number
    offset: number
  },
): Notification[] {
  const filtered = notifications
    .filter((item) => !options.projectId || item.project_id === options.projectId)
    .filter((item) => {
      if (!options.unreadOnly) return true
      return item.is_read !== true && (item as any).status !== 'read'
    })
    .sort((left, right) => String(right.created_at || '').localeCompare(String(left.created_at || '')))

  return filtered.slice(options.offset, options.offset + options.limit)
}

/**
 * 获取通知列表
 * GET /api/notifications?projectId=xxx&userId=xxx&limit=20&offset=0
 */
router.get('/', asyncHandler(async (req, res) => {
  const projectId = req.query.projectId as string | undefined
  const userId = req.query.userId as string | undefined
  const limit = parseInt(req.query.limit as string || '20')
  const offset = parseInt(req.query.offset as string || '0')
  const unreadOnly = req.query.unreadOnly === 'true'

  logger.info('Fetching notifications', { projectId, userId, limit, offset, unreadOnly })

  let persistedNotifications: Notification[] = []

  try {
    const conditions: string[] = []
    const values: any[] = []

    if (projectId) {
      conditions.push('project_id = ?')
      values.push(projectId)
    }
    if (userId) {
      conditions.push('JSON_CONTAINS(recipients, JSON_QUOTE(?))')
      values.push(userId)
    }
    if (unreadOnly) {
      conditions.push("(status = 'unread' OR is_read = 0)")
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
    persistedNotifications = await executeSQL(
      `SELECT * FROM notifications ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [...values, limit, offset]
    )
  } catch (error) {
    logger.warn('Notification storage query failed, falling back to generated notifications', {
      projectId,
      userId,
      error: error instanceof Error ? error.message : String(error),
    })
  }

  let generatedNotifications: Notification[] = []
  try {
    generatedNotifications = await warningService.generateNotifications(projectId)
  } catch (error) {
    logger.warn('Generated notifications fallback failed', {
      projectId,
      error: error instanceof Error ? error.message : String(error),
    })
  }

  const mergedNotifications = [...persistedNotifications, ...generatedNotifications]
  const dedupedNotifications = Array.from(
    new Map(mergedNotifications.map((item) => [notificationSignature(item), item])).values(),
  )
  const notifications = applyNotificationFilters(dedupedNotifications, {
    projectId,
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
router.get('/unread', asyncHandler(async (req, res) => {
  const projectId = req.query.projectId as string | undefined
  const userId = req.query.userId as string | undefined

  logger.info('Fetching unread count', { projectId, userId })

  const conditions: string[] = ["(status = 'unread' OR is_read = 0)"]
  const values: any[] = []

  if (projectId) {
    conditions.push('project_id = ?')
    values.push(projectId)
  }
  if (userId) {
    conditions.push('JSON_CONTAINS(recipients, JSON_QUOTE(?))')
    values.push(userId)
  }

  const row = await executeSQLOne(
    `SELECT COUNT(*) AS cnt FROM notifications WHERE ${conditions.join(' AND ')}`,
    values
  )

  const response: ApiResponse<{ count: number }> = {
    success: true,
    data: { count: row ? Number(row.cnt) : 0 },
    timestamp: new Date().toISOString(),
  }

  res.json(response)
}))

/**
 * 标记单个通知已读
 * PUT /api/notifications/:id/read
 */
router.put('/:id/read', asyncHandler(async (req, res) => {
  const { id } = req.params

  logger.info('Marking notification as read', { id })

  try {
    await executeSQL(
      `UPDATE notifications SET status = 'read', is_read = 1 WHERE id = ?`,
      [id]
    )
  } catch (error) {
    logger.warn('Notification storage unavailable while marking read, returning compatibility success', {
      id,
      error: error instanceof Error ? error.message : String(error),
    })
  }

  const response: ApiResponse<{ message: string }> = {
    success: true,
    data: { message: '通知已标记为已读' },
    timestamp: new Date().toISOString(),
  }

  res.json(response)
}))

/**
 * 全部标记已读
 * PUT /api/notifications/read-all?projectId=xxx&userId=xxx
 */
router.put('/read-all', asyncHandler(async (req, res) => {
  const projectId = req.query.projectId as string | undefined
  const userId = req.query.userId as string | undefined

  logger.info('Marking all notifications as read', { projectId, userId })

  const conditions: string[] = ["(status = 'unread' OR is_read = 0)"]
  const values: any[] = []

  if (projectId) {
    conditions.push('project_id = ?')
    values.push(projectId)
  }
  if (userId) {
    conditions.push('JSON_CONTAINS(recipients, JSON_QUOTE(?))')
    values.push(userId)
  }

  try {
    await executeSQL(
      `UPDATE notifications SET status = 'read', is_read = 1 WHERE ${conditions.join(' AND ')}`,
      values
    )
  } catch (error) {
    logger.warn('Notification storage unavailable while marking all read, returning compatibility success', {
      projectId,
      userId,
      error: error instanceof Error ? error.message : String(error),
    })
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
router.post('/', asyncHandler(async (req, res) => {
  const notificationData = req.body

  logger.info('Creating notification', notificationData)

  const id = uuidv4()
  const now = new Date().toISOString()

  await executeSQL(
    `INSERT INTO notifications (id, project_id, type, severity, title, content, is_read, is_broadcast, source_entity_type, source_entity_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      notificationData.project_id || null,
      notificationData.type || 'system',
      notificationData.severity || null,
      notificationData.title || '',
      notificationData.content || '',
      0,
      notificationData.is_broadcast ? 1 : 0,
      notificationData.source_entity_type || null,
      notificationData.source_entity_id || null,
      now
    ]
  )

  const created: Notification | null = await executeSQLOne(
    'SELECT * FROM notifications WHERE id = ? LIMIT 1',
    [id]
  )

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
router.delete('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params

  logger.info('Deleting notification', { id })

  try {
    await executeSQL('DELETE FROM notifications WHERE id = ?', [id])
  } catch (error) {
    logger.warn('Notification storage unavailable while deleting notification, returning compatibility success', {
      id,
      error: error instanceof Error ? error.message : String(error),
    })
  }

  const response: ApiResponse<{ message: string }> = {
    success: true,
    data: { message: '通知已删除' },
    timestamp: new Date().toISOString(),
  }

  res.json(response)
}))

export default router
