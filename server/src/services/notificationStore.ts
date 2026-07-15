import { v4 as uuidv4 } from 'uuid'

import { executeSQL, executeSQLOne } from './dbService.js'
import type { Notification } from '../types/db.js'
import { broadcastRealtimeEvent } from './realtimeServer.js'
import { buildNotificationTouchpointFields } from './notificationTouchpointRules.js'

export type NotificationInput = Partial<Notification> & Pick<Notification, 'type' | 'title' | 'content'>

interface NotificationQueryOptions {
  id?: string
  ids?: string[]
  companyId?: string | null
  projectId?: string
  projectIds?: string[] | null
  userId?: string | null
  scopeUserId?: string | null
  sourceEntityType?: string
  sourceEntityId?: string
  category?: string
  type?: string
  types?: string[]
  lifecycleStatus?: string
  touchpointType?: string
  scopeType?: string
  dedupeKey?: string
  limit?: number
  offset?: number
  _retryWithoutCompanyScope?: boolean
}

function toBoolean(value: unknown) {
  return value === true || value === 1 || value === '1'
}

function stripUndefined<T extends Record<string, unknown>>(value: T) {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined))
}

const NOTIFICATION_COLUMNS = new Set([
  'id', 'company_id', 'project_id', 'user_id', 'task_id', 'risk_id', 'type',
  'notification_type', 'severity', 'level', 'title', 'content', 'is_read',
  'is_broadcast', 'source_entity_type', 'source_entity_id', 'category', 'recipients',
  'channel', 'status', 'metadata', 'chain_id', 'first_seen_at', 'acknowledged_at',
  'muted_until', 'escalated_to_risk_id', 'escalated_at', 'is_escalated', 'resolved_at',
  'resolved_source', 'warning_lifecycle_status', 'warning_signature', 'source_hash',
  'is_system', 'lifecycle_status', 'touchpoint_type', 'scope_type', 'dedupe_key',
  'target_route', 'target_label', 'action_due_at', 'expires_at', 'reconciled_at',
  'reconciliation_source_status', 'created_at', 'updated_at',
])
const NOTIFICATION_JSON_COLUMNS = new Set(['recipients', 'metadata'])
const IMMUTABLE_NOTIFICATION_COLUMNS = new Set(['id', 'company_id', 'project_id', 'user_id', 'created_at'])

function notificationSqlValue(column: string, value: unknown) {
  return NOTIFICATION_JSON_COLUMNS.has(column) && value != null ? JSON.stringify(value) : value
}

function notificationPlaceholder(column: string) {
  return NOTIFICATION_JSON_COLUMNS.has(column) ? '?::jsonb' : '?'
}

function notificationUpdateEntries(patch: Record<string, unknown>) {
  return Object.entries(patch).filter(([column, value]) => (
    value !== undefined
    && NOTIFICATION_COLUMNS.has(column)
    && !IMMUTABLE_NOTIFICATION_COLUMNS.has(column)
  ))
}

async function executeScopedNotificationUpdate(
  id: string,
  updates: Record<string, unknown>,
  current: Pick<Notification, 'project_id' | 'company_id' | 'user_id'>,
) {
  const entries = notificationUpdateEntries(updates)
  if (entries.length === 0) return

  const assignments = entries.map(([column]) => `${column} = ${notificationPlaceholder(column)}`)
  const params = entries.map(([column, value]) => notificationSqlValue(column, value))
  const where = ['id = ?']
  params.push(id)

  if (current.project_id) {
    where.push('project_id = ?')
    params.push(current.project_id)
  } else {
    where.push('project_id IS NULL')
    if (current.company_id) {
      where.push('company_id = ?')
      params.push(current.company_id)
    } else {
      where.push('user_id = ?')
      params.push(current.user_id ?? null)
    }
  }

  await executeSQL(`UPDATE notifications SET ${assignments.join(', ')} WHERE ${where.join(' AND ')}`, params)
}

function normalizeIdList(values?: string[] | null) {
  if (!Array.isArray(values)) return null
  return Array.from(new Set(values.map((value) => String(value ?? '').trim()).filter(Boolean)))
}

function escapePostgrestValue(value: string) {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

function buildPostgrestIn(values: string[]) {
  return `(${values.map(escapePostgrestValue).join(',')})`
}

async function resolveProjectCompanyId(projectId?: string | null) {
  const id = String(projectId ?? '').trim()
  if (!id) return null

  const data = await executeSQLOne<{ company_id?: string | null }>(
    'SELECT company_id FROM projects WHERE id = ? LIMIT 1',
    [id],
  )
  return typeof data?.company_id === 'string' && data.company_id ? data.company_id : null
}

function groupNotificationIdsByScope(rows: Array<Pick<Notification, 'id' | 'project_id' | 'company_id'>>) {
  const grouped = new Map<string, { projectId: string | null; companyId: string | null; ids: string[] }>()

  for (const row of rows) {
    const projectId = row.project_id ?? null
    const companyId = row.company_id ?? null
    const key = `${companyId ?? 'no-company'}:${projectId ?? 'no-project'}`
    const current = grouped.get(key) ?? { projectId, companyId, ids: [] }
    current.ids.push(row.id)
    grouped.set(key, current)
  }

  return grouped
}

function broadcastNotificationMutation(
  action: 'insert' | 'update' | 'delete',
  rows: Array<Pick<Notification, 'id' | 'project_id' | 'company_id'>>,
) {
  const grouped = groupNotificationIdsByScope(rows)

  for (const { projectId, companyId, ids } of grouped.values()) {
    broadcastRealtimeEvent({
      channel: 'notifications',
      type: 'notification.changed',
      companyId,
      projectId,
      entityType: 'notification',
      ids,
      payload: { action },
    })
  }
}

function applyNotificationRecordScope<T extends { eq: (column: string, value: unknown) => T; is: (column: string, value: null) => T }>(
  query: T,
  current?: Pick<Notification, 'project_id' | 'company_id'> | null,
) {
  if (!current) return query

  if (current.project_id) {
    return query.eq('project_id', current.project_id)
  }

  let scoped = query.is('project_id', null)
  if (current.company_id) {
    scoped = scoped.eq('company_id', current.company_id)
  } else {
    scoped = scoped.is('company_id', null)
  }
  return scoped
}

export function normalizeNotificationInput(notification: NotificationInput): Notification {
  const now = notification.created_at ?? new Date().toISOString()
  const isRead = toBoolean(notification.is_read)
  const isBroadcast = toBoolean(notification.is_broadcast)
  const touchpointFields = buildNotificationTouchpointFields(notification)

  return {
    id: notification.id || uuidv4(),
    company_id: notification.company_id ?? null,
    project_id: notification.project_id ?? null,
    user_id: notification.user_id ?? null,
    task_id: notification.task_id ?? null,
    risk_id: notification.risk_id,
    type: notification.type,
    notification_type: notification.notification_type ?? touchpointFields.notification_type,
    severity: notification.severity ?? notification.level ?? null,
    level: notification.level ?? notification.severity ?? null,
    title: notification.title,
    content: notification.content,
    is_read: isRead,
    is_broadcast: isBroadcast,
    source_entity_type: notification.source_entity_type ?? null,
    source_entity_id: notification.source_entity_id ?? null,
    category: notification.category ?? null,
    recipients: notification.recipients ?? [],
    channel: notification.channel ?? 'in_app',
    status: notification.status ?? (isRead ? 'read' : 'unread'),
    metadata: notification.metadata ?? null,
    chain_id: notification.chain_id ?? null,
    first_seen_at: notification.first_seen_at ?? now,
    acknowledged_at: notification.acknowledged_at ?? null,
    muted_until: notification.muted_until ?? null,
    escalated_to_risk_id: notification.escalated_to_risk_id ?? null,
    escalated_at: notification.escalated_at ?? null,
    is_escalated: notification.is_escalated ?? false,
    resolved_at: notification.resolved_at ?? null,
    resolved_source: notification.resolved_source ?? null,
    warning_lifecycle_status: notification.source_entity_type === 'warning'
      ? notification.warning_lifecycle_status ?? 'active'
      : null,
    warning_signature: notification.source_entity_type === 'warning'
      ? notification.warning_signature ?? null
      : null,
    source_hash: notification.source_entity_type === 'warning'
      ? notification.source_hash ?? null
      : null,
    is_system: notification.is_system ?? false,
    // v1.4.13: lifecycle + touchpoint + dedupe fields
    lifecycle_status: notification.lifecycle_status ?? touchpointFields.lifecycle_status,
    touchpoint_type: notification.touchpoint_type ?? touchpointFields.touchpoint_type,
    scope_type: notification.scope_type ?? touchpointFields.scope_type,
    dedupe_key: notification.dedupe_key ?? touchpointFields.dedupe_key,
    target_route: notification.target_route ?? touchpointFields.target_route,
    target_label: notification.target_label ?? touchpointFields.target_label,
    action_due_at: notification.action_due_at ?? null,
    expires_at: notification.expires_at ?? null,
    reconciled_at: notification.reconciled_at ?? null,
    reconciliation_source_status: notification.reconciliation_source_status ?? null,
    created_at: now,
    updated_at: notification.updated_at ?? now,
  }
}

export async function listNotifications(options: NotificationQueryOptions = {}): Promise<Notification[]> {
  const where = ["COALESCE(lifecycle_status, 'active') <> ?", '(expires_at IS NULL OR expires_at > ?)']
  const params: unknown[] = ['archived', new Date().toISOString()]
  const addEquals = (column: string, value: unknown) => {
    where.push(`${column} = ?`)
    params.push(value)
  }

  if (options.id) addEquals('id', options.id)
  if (options.projectId) addEquals('project_id', options.projectId)

  const exactUserId = String(options.userId ?? '').trim()
  if (exactUserId) addEquals('user_id', exactUserId)

  const scopedProjectIds = normalizeIdList(options.projectIds)
  const scopeFilters: string[] = []
  const scopeParams: unknown[] = []
  const companyId = String(options.companyId ?? '').trim()
  const scopeUserId = String(options.scopeUserId ?? '').trim()

  if (!options.projectId && companyId) {
    scopeFilters.push('company_id = ?')
    scopeParams.push(companyId)
  }
  if (!options.projectId && scopedProjectIds && scopedProjectIds.length > 0) {
    scopeFilters.push(`project_id IN (${scopedProjectIds.map(() => '?').join(', ')})`)
    scopeParams.push(...scopedProjectIds)
  }
  if (!options.projectId && scopeUserId) {
    scopeFilters.push('user_id = ?')
    scopeParams.push(scopeUserId)
  }
  if (!options.projectId && scopeFilters.length > 0) {
    where.push(`(${scopeFilters.join(' OR ')})`)
    params.push(...scopeParams)
  }

  if (options.sourceEntityType) addEquals('source_entity_type', options.sourceEntityType)
  if (options.sourceEntityId) addEquals('source_entity_id', options.sourceEntityId)
  if (options.category) addEquals('category', options.category)
  if (options.type) addEquals('type', options.type)
  if (options.types && options.types.length > 0) {
    where.push(`type IN (${options.types.map(() => '?').join(', ')})`)
    params.push(...options.types)
  }
  if (options.lifecycleStatus) addEquals('lifecycle_status', options.lifecycleStatus)
  if (options.touchpointType) addEquals('touchpoint_type', options.touchpointType)
  if (options.scopeType) addEquals('scope_type', options.scopeType)
  if (options.dedupeKey) addEquals('dedupe_key', options.dedupeKey)
  if (options.ids && options.ids.length > 0) {
    where.push(`id IN (${options.ids.map(() => '?').join(', ')})`)
    params.push(...options.ids)
  }

  const limit = typeof options.limit === 'number' && Number.isFinite(options.limit) && options.limit > 0
    ? Math.floor(options.limit)
    : undefined
  const offset = typeof options.offset === 'number' && Number.isFinite(options.offset) && options.offset > 0
    ? Math.floor(options.offset)
    : 0
  let pagination = ''
  if (limit !== undefined) {
    pagination += ' LIMIT ?'
    params.push(limit)
  }
  if (offset > 0) {
    pagination += ' OFFSET ?'
    params.push(offset)
  }

  return executeSQL<Notification>(
    `SELECT * FROM notifications WHERE ${where.join(' AND ')} ORDER BY created_at DESC${pagination}`,
    params,
  )
}

export async function findNotification(options: NotificationQueryOptions): Promise<Notification | null> {
  const rows = await listNotifications({ ...options, limit: 1 })
  return rows[0] ?? null
}

export async function insertNotification(notification: NotificationInput): Promise<Notification> {
  const row = normalizeNotificationInput(notification)
  if (!row.company_id) {
    row.company_id = await resolveProjectCompanyId(row.project_id)
  }
  const projectId = String(row.project_id ?? '').trim() || null
  const companyId = String(row.company_id ?? '').trim() || null
  const userId = String(row.user_id ?? '').trim() || null
  if (!projectId && !companyId && !userId) {
    throw new Error('notification insert requires project, company, or user scope')
  }
  const scopedRow = {
    ...row,
    project_id: projectId,
    company_id: companyId,
    user_id: userId,
  }
  const entries = Object.entries(scopedRow).filter(([column, value]) => (
    value !== undefined && NOTIFICATION_COLUMNS.has(column)
  ))
  const columns = entries.map(([column]) => column)
  const placeholders = entries.map(([column]) => notificationPlaceholder(column))
  const values = entries.map(([column, value]) => notificationSqlValue(column, value))
  // execute-sql-dynamic-approved: column names come only from NOTIFICATION_COLUMNS and every value remains parameter-bound.
  await executeSQL(
    `INSERT INTO notifications (${columns.join(', ')}) VALUES (${placeholders.join(', ')})`,
    values,
  )
  broadcastNotificationMutation('insert', [row])
  return row
}

export async function updateNotificationById(
  id: string,
  patch: Partial<Notification>,
  current: Notification,
): Promise<void> {
  if (String(current?.id ?? '') !== String(id ?? '')) {
    throw new Error('notification update scope record does not match id')
  }
  const projectId = String(current.project_id ?? '').trim() || null
  const companyId = String(current.company_id ?? '').trim() || null
  const userId = String(current.user_id ?? '').trim() || null
  if (!projectId && !companyId && !userId) {
    throw new Error('notification update requires project, company, or user scope')
  }
  const touchpointFields = buildNotificationTouchpointFields({ ...current, ...patch })

  const updates = stripUndefined({
    ...patch,
    lifecycle_status: patch.lifecycle_status ?? current.lifecycle_status ?? touchpointFields.lifecycle_status,
    touchpoint_type: patch.touchpoint_type ?? current.touchpoint_type ?? touchpointFields.touchpoint_type,
    scope_type: patch.scope_type ?? current.scope_type ?? touchpointFields.scope_type,
    dedupe_key: patch.dedupe_key ?? current.dedupe_key ?? touchpointFields.dedupe_key,
    target_route: patch.target_route ?? current.target_route ?? touchpointFields.target_route,
    target_label: patch.target_label ?? current.target_label ?? touchpointFields.target_label,
    is_read: patch.is_read === undefined ? undefined : toBoolean(patch.is_read),
    is_broadcast: patch.is_broadcast === undefined ? undefined : toBoolean(patch.is_broadcast),
    updated_at: patch.updated_at ?? new Date().toISOString(),
  })

  await executeScopedNotificationUpdate(id, updates, current)

  if (current) {
    broadcastNotificationMutation('update', [{ id: current.id, project_id: current.project_id ?? null, company_id: current.company_id ?? null }])
  }
}

export async function updateNotificationsByIds(
  ids: string[],
  patch: Partial<Notification>,
  currentRows: Notification[],
): Promise<void> {
  if (ids.length === 0) return
  const requestedIds = new Set(ids.map((id) => String(id)))
  if (currentRows.some((row) => !requestedIds.has(String(row.id)))) {
    throw new Error('notification batch update scope records do not match ids')
  }

  const updates = stripUndefined({
    ...patch,
    is_read: patch.is_read === undefined ? undefined : toBoolean(patch.is_read),
    is_broadcast: patch.is_broadcast === undefined ? undefined : toBoolean(patch.is_broadcast),
    updated_at: patch.updated_at ?? new Date().toISOString(),
  })

  const grouped = new Map<string, Notification[]>()
  for (const row of currentRows) {
    const key = row.project_id ? `project:${row.project_id}` : `company:${row.company_id ?? 'none'}`
    grouped.set(key, [...(grouped.get(key) ?? []), row])
  }

  for (const rows of grouped.values()) {
    const projectId = String(rows[0]?.project_id ?? '').trim() || null
    const companyId = String(rows[0]?.company_id ?? '').trim() || null
    const userId = String(rows[0]?.user_id ?? '').trim() || null
    if (!projectId && !companyId && !userId) {
      throw new Error('notification batch update requires project, company, or user scope')
    }
    for (const row of rows) {
      await executeScopedNotificationUpdate(row.id, updates, row)
    }
  }

  if (currentRows.length > 0) {
    broadcastNotificationMutation(
      'update',
      currentRows.map((row) => ({ id: row.id, project_id: row.project_id ?? null, company_id: row.company_id ?? null })),
    )
  }
}

// v1.4.13: archive by setting lifecycle_status instead of physical delete
export async function deleteNotificationById(id: string, current: Notification): Promise<void> {
  if (String(current?.id ?? '') !== String(id ?? '')) {
    throw new Error('notification delete scope record does not match id')
  }
  const projectId = String(current.project_id ?? '').trim() || null
  const companyId = String(current.company_id ?? '').trim() || null
  const userId = String(current.user_id ?? '').trim() || null
  if (!projectId && !companyId && !userId) {
    throw new Error('notification delete requires project, company, or user scope')
  }

  const now = new Date().toISOString()
  await executeScopedNotificationUpdate(id, {
      lifecycle_status: 'archived',
      is_read: true,
      updated_at: now,
      expires_at: now,
    }, current)

  if (current) {
    broadcastNotificationMutation('delete', [{ id: current.id, project_id: current.project_id ?? null, company_id: current.company_id ?? null }])
  }
}
