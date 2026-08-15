import { logger } from '../middleware/logger.js'
import type { Notification } from '../types/db.js'
import {
  deleteNotificationById,
  listNotifications,
  updateNotificationById,
} from './notificationStore.js'
import { signedDurationDayDelta } from '../utils/durationDays.js'

const ARCHIVE_AFTER_DAYS = 90
const PURGE_AFTER_DAYS = 180

function nowIso() {
  return new Date().toISOString()
}

function daysOld(value?: string | null) {
  if (!value) return 0
  return Math.max(0, signedDurationDayDelta(value, new Date()) ?? 0)
}

function isActiveLifecycleStatus(value?: string | null) {
  const normalized = String(value ?? '').trim().toLowerCase()
  return normalized === ''
    || normalized === 'active'
    || normalized === 'muted'
    || normalized === 'escalated'
}

function isArchivableLifecycleStatus(value?: string | null) {
  const normalized = String(value ?? '').trim().toLowerCase()
  return normalized === 'resolved'
    || normalized === 'closed'
    || normalized === 'acknowledged'
    || normalized === 'dismissed'
    || normalized === 'read'
}

function readMetadataTimestamp(notification: Notification, key: string) {
  const metadata = typeof notification.metadata === 'object' && notification.metadata
    ? notification.metadata
    : null
  const value = metadata?.[key]
  return typeof value === 'string' && value.trim() ? value : null
}

function retentionClock(notification: Notification) {
  return notification.resolved_at
    ?? notification.acknowledged_at
    ?? notification.updated_at
    ?? notification.created_at
}

function purgeClock(notification: Notification) {
  return readMetadataTimestamp(notification, 'archived_at')
    ?? notification.updated_at
    ?? notification.resolved_at
    ?? notification.acknowledged_at
    ?? notification.created_at
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

function hasNotificationMutationScope(
  notification: Pick<Notification, 'project_id' | 'company_id' | 'user_id'>,
) {
  return Boolean(
    String(notification.project_id ?? '').trim()
    || String(notification.company_id ?? '').trim()
    || String(notification.user_id ?? '').trim(),
  )
}

export interface NotificationLifecycleResult {
  archived: number
  deleted: number
}

export class NotificationLifecycleService {
  async runRetentionPolicy(projectIds?: string[] | null): Promise<NotificationLifecycleResult> {
    const scopedProjectIds = Array.isArray(projectIds)
      ? [...new Set(projectIds.map((projectId) => String(projectId ?? '').trim()).filter(Boolean))]
      : null
    const notifications = scopedProjectIds
      ? (await Promise.all(scopedProjectIds.map((projectId) => listNotifications({ projectId })))).flat()
      : await listNotifications()
    const timestamp = nowIso()
    let archived = 0
    let deleted = 0
    let skippedUnscoped = 0

    for (const notification of notifications) {
      if (!hasNotificationMutationScope(notification)) {
        skippedUnscoped += 1
        continue
      }

      const normalizedStatus = String(notification.status ?? '').trim().toLowerCase()
      const normalizedWarningLifecycleStatus = String(notification.warning_lifecycle_status ?? '').trim().toLowerCase()

      if (daysOld(purgeClock(notification)) >= PURGE_AFTER_DAYS && normalizedStatus === 'archived') {
        await deleteNotificationById(notification.id, notification)
        deleted += 1
        continue
      }

      if (normalizedStatus === 'archived') {
        continue
      }

      const effectiveLifecycleStatus = normalizedWarningLifecycleStatus || normalizedStatus
      if (isActiveLifecycleStatus(effectiveLifecycleStatus)) {
        continue
      }

      if (!isArchivableLifecycleStatus(effectiveLifecycleStatus)) {
        continue
      }

      if (daysOld(retentionClock(notification)) < ARCHIVE_AFTER_DAYS) {
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
      }, notification)
      archived += 1
    }

    logger.info('[notificationLifecycleService] retention policy executed', {
      archived,
      deleted,
      skippedUnscoped,
    })

    return { archived, deleted }
  }
}
