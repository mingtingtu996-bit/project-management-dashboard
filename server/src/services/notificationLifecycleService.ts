import { logger } from '../middleware/logger.js'
import type { Notification } from '../types/db.js'
import {
  deleteNotificationById,
  listNotifications,
  updateNotificationById,
} from './notificationStore.js'

const DAY_MS = 24 * 60 * 60 * 1000
const ARCHIVE_AFTER_DAYS = 90
const PURGE_AFTER_DAYS = 180

function nowIso() {
  return new Date().toISOString()
}

function daysOld(value?: string | null) {
  if (!value) return 0
  const timestamp = new Date(value).getTime()
  if (!Number.isFinite(timestamp)) return 0
  return Math.floor((Date.now() - timestamp) / DAY_MS)
}

function mergeMetadata(notification: Notification, patch: Record<string, unknown>) {
  const current = typeof notification.metadata === 'object' && notification.metadata
    ? notification.metadata
    : {}
  return {
    ...current,
    ...patch,
  }
}

export interface NotificationLifecycleResult {
  archived: number
  deleted: number
}

export class NotificationLifecycleService {
  async runRetentionPolicy(): Promise<NotificationLifecycleResult> {
    const notifications = await listNotifications()
    const timestamp = nowIso()
    let archived = 0
    let deleted = 0

    for (const notification of notifications) {
      const age = daysOld(notification.created_at)
      const normalizedStatus = String(notification.status ?? '').trim().toLowerCase()

      if (age >= PURGE_AFTER_DAYS && normalizedStatus === 'archived') {
        await deleteNotificationById(notification.id)
        deleted += 1
        continue
      }

      if (age < ARCHIVE_AFTER_DAYS || normalizedStatus === 'archived') {
        continue
      }

      await updateNotificationById(notification.id, {
        status: 'archived',
        is_read: true,
        resolved_at: notification.resolved_at ?? timestamp,
        metadata: mergeMetadata(notification, {
          archived_at: timestamp,
          archived_reason: 'retention_90d',
        }),
        updated_at: timestamp,
      })
      archived += 1
    }

    logger.info('[notificationLifecycleService] retention policy executed', {
      archived,
      deleted,
    })

    return { archived, deleted }
  }
}
