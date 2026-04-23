import { v4 as uuidv4 } from 'uuid'

import { supabase } from './dbService.js'
import type { Notification } from '../types/db.js'
import { broadcastRealtimeEvent } from './realtimeServer.js'

export type NotificationInput = Partial<Notification> & Pick<Notification, 'type' | 'title' | 'content'>

interface NotificationQueryOptions {
  id?: string
  ids?: string[]
  projectId?: string
  sourceEntityType?: string
  sourceEntityId?: string
  type?: string
  limit?: number
}

function toBoolean(value: unknown) {
  return value === true || value === 1 || value === '1'
}

function stripUndefined<T extends Record<string, unknown>>(value: T) {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined))
}

function groupNotificationIdsByProject(rows: Array<Pick<Notification, 'id' | 'project_id'>>) {
  const grouped = new Map<string | null, string[]>()

  for (const row of rows) {
    const key = row.project_id ?? null
    const list = grouped.get(key) ?? []
    list.push(row.id)
    grouped.set(key, list)
  }

  return grouped
}

function broadcastNotificationMutation(
  action: 'insert' | 'update' | 'delete',
  rows: Array<Pick<Notification, 'id' | 'project_id'>>,
) {
  const grouped = groupNotificationIdsByProject(rows)

  for (const [projectId, ids] of grouped.entries()) {
    broadcastRealtimeEvent({
      channel: 'notifications',
      type: 'notification.changed',
      projectId,
      entityType: 'notification',
      ids,
      payload: { action },
    })
  }
}

export function normalizeNotificationInput(notification: NotificationInput): Notification {
  const now = notification.created_at ?? new Date().toISOString()
  const isRead = toBoolean(notification.is_read)
  const isBroadcast = toBoolean(notification.is_broadcast)

  return {
    id: notification.id ?? uuidv4(),
    project_id: notification.project_id ?? null,
    task_id: notification.task_id ?? null,
    risk_id: notification.risk_id,
    type: notification.type,
    notification_type: notification.notification_type ?? null,
    severity: notification.severity ?? notification.level ?? null,
    level: notification.level ?? notification.severity ?? null,
    title: notification.title,
    content: notification.content,
    is_read: isRead,
    is_broadcast: isBroadcast,
    source_entity_type: notification.source_entity_type ?? null,
    source_entity_id: notification.source_entity_id ?? null,
    category: notification.category ?? null,
    delay_request_id: notification.delay_request_id ?? null,
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
    created_at: now,
    updated_at: notification.updated_at ?? now,
  }
}

export async function listNotifications(options: NotificationQueryOptions = {}): Promise<Notification[]> {
  let query = supabase
    .from('notifications')
    .select('*')
    .order('created_at', { ascending: false })

  if (options.id) {
    query = query.eq('id', options.id)
  }

  if (options.projectId) {
    query = query.eq('project_id', options.projectId)
  }

  if (options.sourceEntityType) {
    query = query.eq('source_entity_type', options.sourceEntityType)
  }

  if (options.sourceEntityId) {
    query = query.eq('source_entity_id', options.sourceEntityId)
  }

  if (options.type) {
    query = query.eq('type', options.type)
  }

  if (options.ids && options.ids.length > 0) {
    query = query.in('id', options.ids)
  }

  if (options.limit) {
    query = query.limit(options.limit)
  }

  const { data, error } = await query
  if (error) throw new Error(error.message)

  return (data ?? []) as Notification[]
}

export async function findNotification(options: NotificationQueryOptions): Promise<Notification | null> {
  const rows = await listNotifications({ ...options, limit: 1 })
  return rows[0] ?? null
}

export async function insertNotification(notification: NotificationInput): Promise<Notification> {
  const row = normalizeNotificationInput(notification)
  const { error } = await supabase.from('notifications').insert(row)
  if (error) throw new Error(error.message)
  broadcastNotificationMutation('insert', [row])
  return row
}

export async function updateNotificationById(id: string, patch: Partial<Notification>): Promise<void> {
  const current = await findNotification({ id })
  const updates = stripUndefined({
    ...patch,
    is_read: patch.is_read === undefined ? undefined : toBoolean(patch.is_read),
    is_broadcast: patch.is_broadcast === undefined ? undefined : toBoolean(patch.is_broadcast),
    updated_at: patch.updated_at ?? new Date().toISOString(),
  })

  const { error } = await supabase
    .from('notifications')
    .update(updates)
    .eq('id', id)

  if (error) throw new Error(error.message)

  if (current) {
    broadcastNotificationMutation('update', [{ id: current.id, project_id: current.project_id ?? null }])
  }
}

export async function updateNotificationsByIds(ids: string[], patch: Partial<Notification>): Promise<void> {
  if (ids.length === 0) return
  const currentRows = await listNotifications({ ids })

  const updates = stripUndefined({
    ...patch,
    is_read: patch.is_read === undefined ? undefined : toBoolean(patch.is_read),
    is_broadcast: patch.is_broadcast === undefined ? undefined : toBoolean(patch.is_broadcast),
    updated_at: patch.updated_at ?? new Date().toISOString(),
  })

  const { error } = await supabase
    .from('notifications')
    .update(updates)
    .in('id', ids)

  if (error) throw new Error(error.message)

  if (currentRows.length > 0) {
    broadcastNotificationMutation(
      'update',
      currentRows.map((row) => ({ id: row.id, project_id: row.project_id ?? null })),
    )
  }
}

export async function deleteNotificationById(id: string): Promise<void> {
  const current = await findNotification({ id })
  const { error } = await supabase
    .from('notifications')
    .delete()
    .eq('id', id)

  if (error) throw new Error(error.message)

  if (current) {
    broadcastNotificationMutation('delete', [{ id: current.id, project_id: current.project_id ?? null }])
  }
}
