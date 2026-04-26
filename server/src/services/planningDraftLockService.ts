import { v4 as uuidv4 } from 'uuid'
import { normalizeProjectPermissionLevel } from '../auth/access.js'
import { logger } from '../middleware/logger.js'
import { supabase } from './dbService.js'
import { writeLog } from './changeLogs.js'
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

export function resolveDraftLockReleasedBy(
  reason: 'timeout' | 'force_unlock' | 'manual_release',
  actorUserId: string | null
): string | null {
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

export function canForceUnlockDraftLock(role?: string | null): boolean {
  return normalizeProjectPermissionLevel(role) === 'owner'
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
  const { error } = await supabase.from('notifications').insert({
    id: uuidv4(),
    project_id: params.projectId,
    type: params.type,
    notification_type: params.type,
    severity: params.severity,
    title: params.title,
    content: params.content,
    recipients: params.recipients,
    is_read: false,
    metadata: params.metadata ?? null,
    created_at: new Date().toISOString(),
  })

  if (error) {
    logger.warn('Failed to write planning lock notification', {
      projectId: params.projectId,
      type: params.type,
      error: error.message,
    })
  }
}

export class PlanningDraftLockService {
  async getDraftLock(projectId: string, draftType: PlanningDraftLockKind, resourceId: string) {
    const { data, error } = await supabase
      .from('planning_draft_locks')
      .select('*')
      .eq('project_id', projectId)
      .eq('draft_type', draftType)
      .eq('resource_id', resourceId)
      .limit(1)

    if (error) throw error
    if (!data || data.length === 0) return null
    return normalizeRow(data[0])
  }

  async getProjectRole(projectId: string, userId: string): Promise<'owner' | 'editor' | 'viewer' | null> {
    const { data: projectRows, error: projectError } = await supabase
      .from('projects')
      .select('owner_id')
      .eq('id', projectId)
      .limit(1)

    if (projectError) throw projectError
    const project = Array.isArray(projectRows) ? projectRows[0] : projectRows
    if (project?.owner_id === userId) return 'owner'

    const { data: memberRows, error: memberError } = await supabase
      .from('project_members')
      .select('permission_level')
      .eq('project_id', projectId)
      .eq('user_id', userId)
      .limit(1)

    if (memberError) throw memberError
    const member = Array.isArray(memberRows) ? memberRows[0] : memberRows
    return member?.permission_level ? normalizeProjectPermissionLevel(member.permission_level) : null
  }

  async acquireDraftLock(params: {
    projectId: string
    draftType: PlanningDraftLockKind
    resourceId: string
    actorUserId: string
  }): Promise<PlanningDraftLockRecord> {
    const now = new Date()
    const existing = await this.getDraftLock(params.projectId, params.draftType, params.resourceId)

    if (existing?.is_locked) {
      const conflict = classifyDraftLockConflict(existing, now)
      if (conflict === 'LOCK_HELD' && existing.locked_by && existing.locked_by !== params.actorUserId) {
        throw new PlanningDraftLockServiceError('LOCK_HELD', '草稿正在被其他人编辑', 409)
      }
      if (conflict === 'LOCK_EXPIRED') {
        await this.releaseLockRow(existing, 'timeout', null, true)
      }
    }

    const payload = {
      id: existing?.id ?? uuidv4(),
      project_id: params.projectId,
      draft_type: params.draftType,
      resource_id: params.resourceId,
      locked_by: params.actorUserId,
      locked_at: now.toISOString(),
      lock_expires_at: new Date(now.getTime() + minutesToMs(PLANNING_DRAFT_LOCK_TIMEOUT_MINUTES)).toISOString(),
      reminder_sent_at: null,
      released_at: null,
      released_by: null,
      release_reason: null,
      is_locked: true,
      version: (existing?.version ?? 0) + 1,
      created_at: existing?.created_at ?? now.toISOString(),
      updated_at: now.toISOString(),
    }

    const { data, error } = await supabase
      .from('planning_draft_locks')
      .upsert(payload, { onConflict: 'project_id,draft_type,resource_id' })
      .select('*')
      .single()

    if (error) throw error
    return normalizeRow(data)
  }

  async releaseDraftLock(params: {
    projectId: string
    draftType: PlanningDraftLockKind
    resourceId: string
    actorUserId: string
    actorRole?: string | null
    reason?: 'manual_release' | 'force_unlock'
  }): Promise<PlanningDraftLockRecord | null> {
    const lock = await this.getDraftLock(params.projectId, params.draftType, params.resourceId)
    if (!lock) return null
    if (!lock.is_locked) return lock

    const canUnlock = lock.locked_by === params.actorUserId || canForceUnlockDraftLock(params.actorRole)
    if (!canUnlock) {
      throw new PlanningDraftLockServiceError('FORBIDDEN', '只有项目负责人可以强制解锁', 403)
    }

    return this.releaseLockRow(lock, params.reason ?? 'manual_release', params.actorUserId, true)
  }

  async forceUnlockDraftLock(params: {
    projectId: string
    draftType: PlanningDraftLockKind
    resourceId: string
    actorUserId: string
    reason?: string
  }): Promise<PlanningDraftLockRecord> {
    const actorRole = await this.getProjectRole(params.projectId, params.actorUserId)
    if (!canForceUnlockDraftLock(actorRole)) {
      throw new PlanningDraftLockServiceError('FORBIDDEN', '只有项目负责人可以强制解锁', 403)
    }

    const lock = await this.getDraftLock(params.projectId, params.draftType, params.resourceId)
    if (!lock) {
      throw new PlanningDraftLockServiceError('NOT_FOUND', '草稿锁不存在', 404)
    }

    return this.releaseLockRow(lock, 'force_unlock', params.actorUserId, true, params.reason)
  }

  async sweepTimedOutLocks(now = new Date()) {
    const { data, error } = await supabase
      .from('planning_draft_locks')
      .select('*')
      .eq('is_locked', true)

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
    reason: 'timeout' | 'force_unlock' | 'manual_release',
    actorUserId: string | null,
    emitNotification = false,
    note?: string
  ): Promise<PlanningDraftLockRecord> {
    const releasedAt = new Date().toISOString()
    const releasedBy = resolveDraftLockReleasedBy(reason, actorUserId)
    const { data, error } = await supabase
      .from('planning_draft_locks')
      .update({
        is_locked: false,
        released_at: releasedAt,
        released_by: releasedBy,
        release_reason: reason,
        updated_at: releasedAt,
      })
      .eq('id', lock.id)
      .select('*')
      .single()

    if (error) throw error

    const normalized = normalizeRow(data)
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
        type: reason === 'force_unlock' ? 'planning_draft_lock_forced_unlock' : 'planning_draft_lock_released',
        severity: reason === 'force_unlock' ? 'warning' : 'info',
        title: reason === 'force_unlock' ? '草稿锁已被强制解锁' : '草稿锁已释放',
        content:
          reason === 'force_unlock'
            ? note || '您的编辑会话已被项目负责人中断，草稿已自动暂存。'
            : '草稿锁已释放，可以继续进行新的编辑会话。',
        recipients,
        metadata: {
          draft_type: lock.draft_type,
          resource_id: lock.resource_id,
          locked_by: lock.locked_by,
          release_reason: reason,
        },
      })
    }

    if (reason === 'force_unlock') {
      await writeLog({
        project_id: lock.project_id,
        entity_type: 'draft_lock',
        entity_id: lock.resource_id,
        field_name: 'force_unlock',
        old_value: lock.locked_by,
        new_value: 'unlocked',
        change_reason: note ?? 'force_unlock',
        changed_by: actorUserId,
        change_source: 'manual_adjusted',
      })
    }

    return normalized
  }
}
