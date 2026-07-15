import type { Notification } from '../types/db.js'

export type TouchpointType = 'persistent' | 'dashboard_todo' | 'popup' | 'page_banner' | 'system_record'
export type ScopeType = 'project' | 'company' | 'workspace' | 'system'
export type LifecycleStatus = 'active' | 'resolved' | 'archived'

export const TOUCHPOINT_PROJECTION_SOURCE = 'notification_touchpoint_service'
export const TOUCHPOINT_PROJECTION_RULE_VERSION = 'v1.4.13-attention-governance'

export const NOTIFICATION_TOUCHPOINT_RULE_REGISTRY = {
  version: TOUCHPOINT_PROJECTION_RULE_VERSION,
  source: TOUCHPOINT_PROJECTION_SOURCE,
  touchpoints: {
    persistent: { contributesToAttention: true, contributesToTodayTodo: false, requiresDedupe: true },
    dashboard_todo: { contributesToAttention: true, contributesToTodayTodo: true, requiresDedupe: true },
    popup: { contributesToAttention: true, contributesToTodayTodo: false, requiresDedupe: true },
    page_banner: { contributesToAttention: true, contributesToTodayTodo: false, requiresDedupe: true },
    system_record: { contributesToAttention: false, contributesToTodayTodo: false, requiresDedupe: false },
  },
  dedupe: {
    activeUniqueIndex: 'uq_notifications_active_touchpoint_dedupe',
    canonicalParts: ['company_id', 'project_id', 'source_entity_type', 'source_entity_id', 'type'],
  },
} as const

export const NOTIFICATION_TOUCHPOINT_TYPES = Object.keys(
  NOTIFICATION_TOUCHPOINT_RULE_REGISTRY.touchpoints,
) as TouchpointType[]

export function isNotificationTouchpointType(value: unknown): value is TouchpointType {
  return NOTIFICATION_TOUCHPOINT_TYPES.includes(String(value ?? '') as TouchpointType)
}

export function isNotificationAttentionTouchpointType(value: unknown) {
  if (!isNotificationTouchpointType(value)) return false
  return NOTIFICATION_TOUCHPOINT_RULE_REGISTRY.touchpoints[value].contributesToAttention
}

export function isNotificationTodayTodoTouchpointType(value: unknown) {
  if (!isNotificationTouchpointType(value)) return false
  return NOTIFICATION_TOUCHPOINT_RULE_REGISTRY.touchpoints[value].contributesToTodayTodo
}

type NotificationLike = Partial<Notification> & {
  warning_type?: string | null
}

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

function normalizeNullableText(value: unknown) {
  const normalized = normalizeText(value)
  return normalized || null
}

function normalizeTouchpointType(value: unknown): TouchpointType | null {
  const normalized = normalizeText(value)
  return isNotificationTouchpointType(normalized) ? normalized : null
}

function normalizeScopeType(value: unknown): ScopeType | null {
  const normalized = normalizeText(value)
  if (normalized === 'project' || normalized === 'company' || normalized === 'workspace' || normalized === 'system') {
    return normalized
  }
  return null
}

function normalizeLifecycleStatus(value: unknown): LifecycleStatus | null {
  const normalized = normalizeText(value)
  if (normalized === 'active' || normalized === 'resolved' || normalized === 'archived') return normalized
  return null
}

export function inferNotificationType(notification: NotificationLike) {
  const explicit = normalizeNullableText(notification.notification_type)
  if (explicit) return explicit

  const token = [
    notification.type,
    notification.category,
    notification.warning_type,
    notification.source_entity_type,
    notification.title,
    notification.content,
  ].filter(Boolean).join(' ').toLowerCase()

  if (/(planning|baseline|monthly|closeout|milestone|reminder|draft_lock|flow)/.test(token)) {
    return 'flow-reminder'
  }
  if (/(risk|issue|problem|warning|condition|obstacle|acceptance|delay|permit|material)/.test(token)) {
    return 'business-warning'
  }
  return 'system-exception'
}

export function inferTouchpointType(notification: NotificationLike): TouchpointType {
  const explicit = normalizeTouchpointType(notification.touchpoint_type)
  if (explicit) return explicit

  const notificationType = inferNotificationType(notification)
  if (notificationType === 'flow-reminder' || notificationType === 'business-warning') {
    return 'dashboard_todo'
  }
  if (notificationType === 'system-exception') return 'system_record'
  return 'persistent'
}

export function inferScopeType(notification: NotificationLike): ScopeType {
  const explicit = normalizeScopeType(notification.scope_type)
  if (explicit) return explicit
  if (notification.project_id) return 'project'
  if (notification.user_id) return 'workspace'
  if (notification.company_id) return 'company'
  return 'system'
}

export function inferLifecycleStatus(notification: NotificationLike): LifecycleStatus {
  const explicit = normalizeLifecycleStatus(notification.lifecycle_status)
  if (explicit) return explicit
  const status = normalizeText(notification.status).toLowerCase()
  if (status === 'resolved' || status === 'closed') return 'resolved'
  if (status === 'archived') return 'archived'
  return 'active'
}

export function buildNotificationDedupeKey(notification: NotificationLike) {
  const explicit = normalizeNullableText(notification.dedupe_key)
  if (explicit) return explicit

  const sourceEntityType = normalizeNullableText(notification.source_entity_type)
  const sourceEntityId = normalizeNullableText(notification.source_entity_id)
  if (!sourceEntityType || !sourceEntityId) return null

  return [
    normalizeNullableText(notification.company_id) ?? 'no-company',
    normalizeNullableText(notification.project_id) ?? 'no-project',
    sourceEntityType,
    sourceEntityId,
    normalizeNullableText(notification.type) ?? 'notification',
  ].join(':')
}

export function inferNotificationTarget(notification: NotificationLike) {
  if (notification.target_route || notification.target_label) {
    return {
      target_route: notification.target_route ?? null,
      target_label: notification.target_label ?? null,
    }
  }

  const projectId = normalizeNullableText(notification.project_id)
  if (!projectId) {
    return { target_route: null, target_label: null }
  }

  const token = [
    notification.type,
    notification.category,
    notification.source_entity_type,
  ].filter(Boolean).join(' ').toLowerCase()

  if (token.includes('material')) {
    return { target_route: `/projects/${projectId}/materials`, target_label: '查看材料' }
  }
  if (/(risk|issue|problem|warning|obstacle)/.test(token)) {
    return { target_route: `/projects/${projectId}/risks`, target_label: '查看风险问题' }
  }
  if (/(planning|baseline|monthly|closeout|deviation)/.test(token)) {
    return { target_route: `/projects/${projectId}/planning`, target_label: '查看计划' }
  }
  if (token.includes('milestone')) {
    return { target_route: `/projects/${projectId}/milestones`, target_label: '查看里程碑' }
  }
  if (token.includes('acceptance')) {
    return { target_route: `/projects/${projectId}/acceptance`, target_label: '查看验收' }
  }
  if (notification.task_id) {
    return { target_route: `/projects/${projectId}/gantt?task=${encodeURIComponent(String(notification.task_id))}`, target_label: '查看任务' }
  }

  return { target_route: `/projects/${projectId}/notifications`, target_label: '查看通知' }
}

export function buildNotificationTouchpointFields(notification: NotificationLike) {
  const target = inferNotificationTarget(notification)
  return {
    notification_type: inferNotificationType(notification),
    lifecycle_status: inferLifecycleStatus(notification),
    touchpoint_type: inferTouchpointType(notification),
    scope_type: inferScopeType(notification),
    dedupe_key: buildNotificationDedupeKey(notification),
    target_route: target.target_route,
    target_label: target.target_label,
  }
}
