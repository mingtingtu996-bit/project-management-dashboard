import { v4 as uuidv4 } from 'uuid'
import { logger } from '../middleware/logger.js'
import { normalizeProjectPermissionLevel } from '../auth/access.js'
import { getClient, query as rawQuery } from '../database.js'
import { supabase } from './dbService.js'
import { notificationTouchpointService } from './notificationTouchpointService.js'
import {
  PLANNING_DRAFT_LOCK_REMINDER_MINUTES,
  PLANNING_DRAFT_LOCK_TIMEOUT_MINUTES,
  type PlanningDraftLock,
  type PlanningDraftLockConflictCode,
  type PlanningDraftLockKind,
} from '../types/planning.js'
import type { PlanningDraftLockRecord } from '../types/db.js'

export { PLANNING_DRAFT_LOCK_REMINDER_MINUTES, PLANNING_DRAFT_LOCK_TIMEOUT_MINUTES }

export class PlanningDraftLockServiceError extends Error {
  code: 'LOCK_HELD' | 'LOCK_EXPIRED' | 'FORBIDDEN' | 'NOT_FOUND'
  statusCode: number

  constructor(code: 'LOCK_HELD' | 'LOCK_EXPIRED' | 'FORBIDDEN' | 'NOT_FOUND', message: string, statusCode = 409) {
    super(message)
    this.name = 'PlanningDraftLockServiceError'
    this.code = code
    this.statusCode = statusCode
  }
}
function toIso(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : value
}

function normalizeRow(row: any): PlanningDraftLockRecord {
  return {
    id: String(row.id ?? ''),
    project_id: String(row.project_id ?? ''),
    draft_type: row.draft_type as PlanningDraftLock['draft_type'],
    resource_id: String(row.resource_id ?? ''),
    locked_by: row.locked_by ?? null,
    locked_at: toIso(row.locked_at ?? new Date()),
    lock_expires_at: toIso(row.lock_expires_at ?? new Date()),
    reminder_sent_at: row.reminder_sent_at ?? null,
    released_at: row.released_at ?? null,
    released_by: row.released_by ?? null,
    release_reason: row.release_reason ?? null,
    is_locked: Boolean(row.is_locked),
    version: Number(row.version ?? 0),
    created_at: toIso(row.created_at ?? new Date()),
    updated_at: toIso(row.updated_at ?? new Date()),
  }
}

function minutesToMs(minutes: number): number {
  return minutes * 60_000
}

export function buildDraftLockNotificationRecipients(params: {
  lockedBy?: string | null
  actorUserId?: string | null
  includeActor?: boolean
}): string[] {
  const recipients = [params.lockedBy ?? null]
  if (params.includeActor) {
    recipients.push(params.actorUserId ?? null)
  }

  return Array.from(new Set(recipients.filter((recipient): recipient is string => Boolean(recipient))))
}

export function resolveDraftLockReleasedBy(reason: 'timeout' | 'manual_release', actorUserId: string | null): string | null {
  return reason === 'timeout' ? null : actorUserId
}

export function isDraftLockExpired(lock: Pick<PlanningDraftLock, 'lock_expires_at'>, now = new Date()): boolean {
  return new Date(lock.lock_expires_at).getTime() <= now.getTime()
}

export function shouldSendDraftLockReminder(
  lock: Pick<PlanningDraftLock, 'lock_expires_at' | 'reminder_sent_at'>,
  now = new Date()
): boolean {
  if (lock.reminder_sent_at) return false
  const expiresAt = new Date(lock.lock_expires_at).getTime()
  if (Number.isNaN(expiresAt)) return false
  const remaining = expiresAt - now.getTime()
  return remaining > 0 && remaining <= minutesToMs(PLANNING_DRAFT_LOCK_REMINDER_MINUTES)
}

export function classifyDraftLockConflict(
  lock: Pick<PlanningDraftLock, 'is_locked' | 'lock_expires_at'>,
  now = new Date()
): PlanningDraftLockConflictCode {
  if (!lock.is_locked) return 'AVAILABLE'
  return isDraftLockExpired(lock, now) ? 'LOCK_EXPIRED' : 'LOCK_HELD'
}

async function writeNotification(params: {
  projectId: string
  type: string
  severity: 'info' | 'warning' | 'critical'
  title: string
  content: string
  recipients: string[]
  metadata?: Record<string, unknown>
}) {
  try {
    await notificationTouchpointService.emit({
      id: uuidv4(),
      project_id: params.projectId,
      type: params.type,
      notification_type: 'flow-reminder',
      severity: params.severity,
      title: params.title,
      content: params.content,
      recipients: params.recipients,
      is_read: false,
      metadata: params.metadata ?? null,
      touchpoint_type: 'dashboard_todo',
      scope_type: 'project',
      dedupe_key: `planning_draft_lock:${params.projectId}:${params.type}:${String(params.metadata?.resource_id ?? '')}`,
      target_route: `/projects/${params.projectId}/planning`,
      target_label: '查看计划草稿',
      created_at: new Date().toISOString(),
    })
  } catch (error) {
    logger.warn('Failed to write planning lock notification', {
      projectId: params.projectId,
      type: params.type,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

export class PlanningDraftLockService {
  async getDraftLock(projectId: string, draftType: PlanningDraftLockKind, resourceId: string) {
    const result = await rawQuery(
      `SELECT *
         FROM public.planning_draft_locks
        WHERE project_id = $1
          AND draft_type = $2
          AND resource_id = $3
        LIMIT 1`,
      [projectId, draftType, resourceId],
    )
    const row = result.rows?.[0]
    return row ? normalizeRow(row) : null
  }

  async getProjectRole(projectId: string, userId: string): Promise<'owner' | 'editor' | null> {
    const result = await rawQuery(
      `SELECT p.owner_id, pm.permission_level
         FROM public.projects p
         LEFT JOIN public.project_members pm
           ON pm.project_id = p.id
          AND pm.user_id = $2
        WHERE p.id = $1
        LIMIT 1`,
      [projectId, userId],
    )
    const row = result.rows?.[0]
    if (row?.owner_id === userId) return 'owner'
    const permissionLevel = row?.permission_level
      ? normalizeProjectPermissionLevel(row.permission_level)
      : null
    return permissionLevel === 'owner' || permissionLevel === 'editor' ? permissionLevel : null
  }

  async acquireDraftLock(params: {
    projectId: string
    draftType: PlanningDraftLockKind
    resourceId: string
    actorUserId: string
  }): Promise<PlanningDraftLockRecord> {
    const now = new Date()
    const lockedAt = now.toISOString()
    const lockExpiresAt = new Date(
      now.getTime() + minutesToMs(PLANNING_DRAFT_LOCK_TIMEOUT_MINUTES),
    ).toISOString()
    const client = await getClient()
    let expiredLock: PlanningDraftLockRecord | null = null
    let acquired: PlanningDraftLockRecord | null = null
    try {
      await client.query('BEGIN')
      await client.query(
        'SELECT pg_advisory_xact_lock(hashtext($1))',
        [`${params.projectId}:${params.draftType}:${params.resourceId}`],
      )
      const existingResult = await client.query(
        `SELECT *
           FROM public.planning_draft_locks
          WHERE project_id = $1
            AND draft_type = $2
            AND resource_id = $3
          FOR UPDATE`,
        [params.projectId, params.draftType, params.resourceId],
      )
      const existing = existingResult.rows?.[0]
        ? normalizeRow(existingResult.rows[0])
        : null

      if (existing?.is_locked) {
        const conflict = classifyDraftLockConflict(existing, now)
        if (conflict === 'LOCK_HELD' && existing.locked_by && existing.locked_by !== params.actorUserId) {
          throw new PlanningDraftLockServiceError('LOCK_HELD', '草稿正在被其他人编辑', 409)
        }
        if (conflict === 'LOCK_EXPIRED') expiredLock = existing
      }

      const writeResult = existing
        ? await client.query(
            `UPDATE public.planning_draft_locks
                SET locked_by = $5,
                    locked_at = $6,
                    lock_expires_at = $7,
                    reminder_sent_at = NULL,
                    released_at = NULL,
                    released_by = NULL,
                    release_reason = NULL,
                    is_locked = TRUE,
                    version = COALESCE(version, 0) + 1,
                    updated_at = $6
              WHERE id = $1
                AND project_id = $2
                AND draft_type = $3
                AND resource_id = $4
              RETURNING *`,
            [
              existing.id,
              params.projectId,
              params.draftType,
              params.resourceId,
              params.actorUserId,
              lockedAt,
              lockExpiresAt,
            ],
          )
        : await client.query(
            `INSERT INTO public.planning_draft_locks (
               id, project_id, draft_type, resource_id, locked_by, locked_at,
               lock_expires_at, reminder_sent_at, released_at, released_by,
               release_reason, is_locked, version, created_at, updated_at
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, NULL, NULL, NULL, NULL, TRUE, 1, $6, $6)
             RETURNING *`,
            [
              uuidv4(),
              params.projectId,
              params.draftType,
              params.resourceId,
              params.actorUserId,
              lockedAt,
              lockExpiresAt,
            ],
          )
      const row = writeResult.rows?.[0]
      if (!row) throw new Error('planning draft lock write returned no row')
      acquired = normalizeRow(row)
      await client.query('COMMIT')
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined)
      throw error
    } finally {
      client.release()
    }

    if (expiredLock) {
      await writeNotification({
        projectId: expiredLock.project_id,
        type: 'planning_draft_lock_timeout',
        severity: 'warning',
        title: '草稿锁已超时释放',
        content: '草稿锁在 30 分钟无操作后已自动释放，请重新确认后继续编辑。',
        recipients: buildDraftLockNotificationRecipients({ lockedBy: expiredLock.locked_by }),
        metadata: {
          draft_type: expiredLock.draft_type,
          resource_id: expiredLock.resource_id,
          locked_by: expiredLock.locked_by,
          lock_expires_at: expiredLock.lock_expires_at,
        },
      })
    }

    return acquired!
  }

  async releaseDraftLock(params: {
    projectId: string
    draftType: PlanningDraftLockKind
    resourceId: string
    actorUserId: string
    actorRole?: string | null
    reason?: 'manual_release'
  }): Promise<PlanningDraftLockRecord | null> {
    const lock = await this.getDraftLock(params.projectId, params.draftType, params.resourceId)
    if (!lock) return null
    if (!lock.is_locked) return lock

    if (lock.locked_by !== params.actorUserId) {
      throw new PlanningDraftLockServiceError('FORBIDDEN', '只有当前编辑人可以释放草稿锁', 403)
    }

    return this.releaseLockRow(lock, params.reason ?? 'manual_release', params.actorUserId, true)
  }

  async sweepTimedOutLocks(now = new Date(), projectIds?: string[] | null) {
    const scopedProjectIds = Array.isArray(projectIds)
      ? [...new Set(projectIds.map((projectId) => String(projectId ?? '').trim()).filter(Boolean))]
      : null
    if (scopedProjectIds && scopedProjectIds.length === 0) {
      return {
        scanned: 0,
        expired: 0,
        reminded: 0,
        released: [],
        reminderLocks: [],
      }
    }

    let query = supabase
      .from('planning_draft_locks')
      .select('*')
      .eq('is_locked', true)

    if (scopedProjectIds) {
      query = query.in('project_id', scopedProjectIds)
    }

    const { data, error } = await query

    if (error) throw error

    const locks = (data ?? []).map(normalizeRow)
    const expiredLocks = locks.filter((lock) => isDraftLockExpired(lock, now))
    const reminderLocks = locks.filter((lock) => shouldSendDraftLockReminder(lock, now))

    const released: PlanningDraftLockRecord[] = []
    for (const lock of expiredLocks) {
      const releasedLock = await this.releaseLockRow(lock, 'timeout', null, true)
      if (releasedLock) released.push(releasedLock)

      await writeNotification({
        projectId: lock.project_id,
        type: 'planning_draft_lock_timeout',
        severity: 'warning',
        title: '草稿锁已超时释放',
        content: '草稿锁在 30 分钟无操作后已自动释放，请重新确认后继续编辑。',
        recipients: buildDraftLockNotificationRecipients({
          lockedBy: lock.locked_by,
        }),
        metadata: {
          draft_type: lock.draft_type,
          resource_id: lock.resource_id,
          locked_by: lock.locked_by,
          lock_expires_at: lock.lock_expires_at,
        },
      })
    }

    const reminded: PlanningDraftLockRecord[] = []
    for (const lock of reminderLocks) {
      const reminderAt = now.toISOString()
      const { data: updated, error: reminderError } = await supabase
        .from('planning_draft_locks')
        .update({ reminder_sent_at: reminderAt, updated_at: reminderAt })
        .eq('id', lock.id)
        .eq('project_id', lock.project_id)
        .select('*')
        .single()

      if (reminderError) throw reminderError
      reminded.push(normalizeRow(updated))

      await writeNotification({
        projectId: lock.project_id,
        type: 'planning_draft_lock_reminder',
        severity: 'info',
        title: '草稿锁即将超时',
        content: '编辑会话还有 5 分钟将自动释放，请保存并继续操作。',
        recipients: buildDraftLockNotificationRecipients({
          lockedBy: lock.locked_by,
        }),
        metadata: {
          draft_type: lock.draft_type,
          resource_id: lock.resource_id,
          locked_by: lock.locked_by,
          lock_expires_at: lock.lock_expires_at,
        },
      })
    }

    return {
      scanned: locks.length,
      expired: expiredLocks.length,
      reminded: reminderLocks.length,
      released,
      reminderLocks: reminded,
    }
  }

  private async releaseLockRow(
    lock: PlanningDraftLockRecord,
    reason: 'timeout' | 'manual_release',
    actorUserId: string | null,
    emitNotification = false
  ): Promise<PlanningDraftLockRecord> {
    const releasedAt = new Date().toISOString()
    const releasedBy = resolveDraftLockReleasedBy(reason, actorUserId)
    const result = await rawQuery(
      `UPDATE public.planning_draft_locks
          SET is_locked = FALSE,
              released_at = $5,
              released_by = $6,
              release_reason = $7,
              updated_at = $5
        WHERE id = $1
          AND project_id = $2
          AND draft_type = $3
          AND resource_id = $4
        RETURNING *`,
      [
        lock.id,
        lock.project_id,
        lock.draft_type,
        lock.resource_id,
        releasedAt,
        releasedBy,
        reason,
      ],
    )
    const row = result.rows?.[0]
    if (!row) throw new PlanningDraftLockServiceError('NOT_FOUND', 'draft lock not found', 404)

    const normalized = normalizeRow(row)
    if (emitNotification) {
      const recipients =
        reason === 'timeout'
          ? buildDraftLockNotificationRecipients({
              lockedBy: lock.locked_by,
            })
          : buildDraftLockNotificationRecipients({
              lockedBy: lock.locked_by,
              actorUserId,
              includeActor: true,
            })

      await writeNotification({
        projectId: lock.project_id,
        type: 'planning_draft_lock_released',
        severity: 'info',
        title: '草稿锁已释放',
        content: '草稿锁已释放，你可以继续创建新的编辑会话。',
        recipients,
        metadata: {
          draft_type: lock.draft_type,
          resource_id: lock.resource_id,
          locked_by: lock.locked_by,
          release_reason: reason,
        },
      })
    }

    return normalized
  }
}
