import type { Notification, Warning } from '../types/db.js'
import { insertNotification, listNotifications } from './notificationStore.js'
import { generateId } from '../utils/id.js'

export interface WarningChainNotification extends Partial<Notification> {
  notification_type?: string | null
  category?: string | null
  task_id?: string | null
  delay_request_id?: string | null
  warning_type?: string | null
}

const PLANNING_NOTIFICATION_SOURCE_TYPES = new Set([
  'planning',
  'baseline',
  'monthly_plan',
  'closeout',
  'task',
  'milestone',
])

const UUID_LIKE_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function toNaturalDay(value?: string | null) {
  return String(value ?? '').trim().slice(0, 10)
}

function asUuidLikeOrNull(value: unknown) {
  const normalized = String(value ?? '').trim()
  return UUID_LIKE_PATTERN.test(normalized) ? normalized : null
}

export function inferNotificationType(notification: WarningChainNotification): string {
  const explicit = typeof notification.notification_type === 'string'
    ? notification.notification_type.trim()
    : ''
  if (explicit) return explicit

  if (notification.source_entity_type && PLANNING_NOTIFICATION_SOURCE_TYPES.has(notification.source_entity_type)) {
    return 'flow-reminder'
  }

  const token = [
    notification.category,
    notification.type,
    notification.warning_type,
    notification.source_entity_type,
    notification.title,
    notification.content,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()

  if (/(risk|problem|warning|condition|obstacle|acceptance|delay|permit)/.test(token)) {
    return 'business-warning'
  }

  return 'system-exception'
}

export interface AutoUpgradeWindow {
  acknowledged_at?: string | null
  muted_until?: string | null
  now?: string | Date
}

export interface NaturalClearanceInput {
  task_id?: string | null
  task_status?: string | null
  warning_type?: string | null
  source_id?: string | null
}

export interface PendingDelayWarningInput {
  warning_level: 'info' | 'warning' | 'critical'
  has_pending_request?: boolean
}

export interface ObstacleSeverityUpgradeInput {
  severity: 'low' | 'medium' | 'high' | 'warning' | 'critical'
  status?: string | null
  expected_resolution_date?: string | null
  now?: string | Date
}

export function buildNotificationIdentity(notification: WarningChainNotification) {
  const warningType = notification.warning_type || notification.category || notification.type || ''
  const warningTaskId = notification.task_id || notification.source_entity_id || ''
  const warningDay = toNaturalDay(notification.created_at)

  if (
    notification.source_entity_type === 'warning'
    || notification.notification_type === 'business-warning'
    || Boolean(notification.warning_type)
  ) {
    return [warningType, warningTaskId, warningDay].join('|')
  }

  return [
    notification.category || notification.type || '',
    notification.task_id || notification.source_entity_id || '',
    notification.delay_request_id || '',
  ].join('|')
}

function warningSeverityRank(value?: string | null) {
  const normalized = String(value ?? '').trim().toLowerCase()
  if (normalized === 'critical') return 3
  if (normalized === 'warning') return 2
  return 1
}

function sortWarningsByPriority<T extends Pick<Warning, 'warning_level' | 'created_at'>>(warnings: T[]) {
  return [...warnings].sort((left, right) => {
    const severityDiff = warningSeverityRank(right.warning_level) - warningSeverityRank(left.warning_level)
    if (severityDiff !== 0) return severityDiff
    return String(right.created_at ?? '').localeCompare(String(left.created_at ?? ''))
  })
}

function buildTaskDayKey(warning: Pick<Warning, 'task_id' | 'created_at'>) {
  return [String(warning.task_id ?? '').trim(), toNaturalDay(warning.created_at)].join('|')
}

function mergeDelayRiskWarning(
  stagnation: Warning,
  delayExceeded: Warning,
): Warning {
  const warningLevel = warningSeverityRank(stagnation.warning_level) >= warningSeverityRank(delayExceeded.warning_level)
    ? stagnation.warning_level
    : delayExceeded.warning_level
  const createdAt = [stagnation.created_at, delayExceeded.created_at]
    .filter(Boolean)
    .sort((left, right) => String(right).localeCompare(String(left)))[0] ?? stagnation.created_at

  return {
    ...stagnation,
    warning_level: warningLevel,
    title: warningSeverityRank(warningLevel) >= warningSeverityRank('critical')
      ? '关键路径任务停滞且延期风险持续累积'
      : '关键路径任务停滞且延期风险需关注',
    description: `${stagnation.description}；同时${delayExceeded.description}`,
    created_at: createdAt,
  }
}

export function collapseWarningRedundancy(warnings: Warning[]): Warning[] {
  const grouped = new Map<string, Warning[]>()
  const collapsed: Warning[] = []

  for (const warning of warnings) {
    const taskId = String(warning.task_id ?? '').trim()
    if (!taskId) {
      collapsed.push(warning)
      continue
    }

    const key = buildTaskDayKey(warning)
    const current = grouped.get(key) ?? []
    current.push(warning)
    grouped.set(key, current)
  }

  for (const group of grouped.values()) {
    const sortedGroup = sortWarningsByPriority(group)
    const stagnation = sortedGroup.find((warning) => warning.warning_type === 'critical_path_stagnation')
    if (!stagnation) {
      collapsed.push(...sortedGroup)
      continue
    }

    const delayExceeded = sortedGroup.find((warning) => warning.warning_type === 'delay_exceeded')
    collapsed.push(delayExceeded ? mergeDelayRiskWarning(stagnation, delayExceeded) : stagnation)

    for (const warning of sortedGroup) {
      if (warning === stagnation) continue
      if (delayExceeded && warning === delayExceeded) continue
      if (warning.warning_type === 'progress_trend_delay') continue
      if (warning.warning_type === 'critical_path_stagnation') continue
      collapsed.push(warning)
    }
  }

  return sortWarningsByPriority(collapsed)
}

export function normalizeNotificationRecord<T extends WarningChainNotification>(notification: T): T {
  return {
    ...notification,
    notification_type: inferNotificationType(notification),
    category: notification.category ?? notification.type ?? notification.warning_type ?? null,
    task_id: notification.task_id ?? asUuidLikeOrNull(notification.source_entity_id),
    delay_request_id: notification.delay_request_id ?? null,
    source_entity_type: notification.source_entity_type ?? notification.category ?? notification.type ?? null,
    source_entity_id: notification.source_entity_id ?? notification.task_id ?? null,
  } as T
}

export function dedupeNotifications<T extends WarningChainNotification>(notifications: T[]): T[] {
  const seen = new Map<string, T>()

  const sorted = [...notifications].map((notification) => normalizeNotificationRecord(notification)).sort((left, right) => {
    const leftTime = String(left.created_at || '')
    const rightTime = String(right.created_at || '')
    return rightTime.localeCompare(leftTime)
  })

  for (const notification of sorted) {
    const identity = buildNotificationIdentity(notification)
    if (!seen.has(identity)) {
      seen.set(identity, notification)
    }
  }

  return Array.from(seen.values())
}

export function normalizeNotificationPayload(
  warning: Warning & {
    category?: string | null
    delay_request_id?: string | null
    source_entity_id?: string | null
  },
): WarningChainNotification {
  return {
    id: warning.id,
    project_id: warning.project_id,
    type: warning.warning_type,
    warning_type: warning.warning_type,
    category: warning.category ?? warning.warning_type,
    task_id: warning.task_id ?? asUuidLikeOrNull(warning.source_entity_id),
    delay_request_id: warning.delay_request_id ?? null,
    severity: warning.warning_level,
    title: warning.title,
    content: warning.description,
    is_read: false,
    is_broadcast: warning.warning_level === 'critical',
    source_entity_type: 'warning',
    source_entity_id: warning.task_id ?? warning.source_entity_id ?? null,
    created_at: warning.created_at,
  }
}

async function insertNotificationRow(
  notification: WarningChainNotification,
): Promise<Notification | null> {
  const normalized = normalizeNotificationRecord(notification)
  const now = normalized.created_at || new Date().toISOString()
  return await insertNotification({
    id: normalized.id || generateId(),
    project_id: normalized.project_id ?? null,
    type: normalized.type || normalized.warning_type || 'system',
    notification_type: normalized.notification_type ?? inferNotificationType(normalized),
    severity: normalized.severity ?? null,
    level: normalized.level ?? normalized.severity ?? null,
    title: normalized.title || '',
    content: normalized.content || '',
    is_read: normalized.is_read === true,
    is_broadcast: normalized.is_broadcast === true,
    source_entity_type: normalized.source_entity_type ?? null,
    source_entity_id: normalized.source_entity_id ?? null,
    category: normalized.category ?? null,
    task_id: normalized.task_id ?? null,
    delay_request_id: normalized.delay_request_id ?? null,
    recipients: normalized.recipients ?? [],
    status: normalized.status ?? (normalized.is_read === true ? 'read' : 'unread'),
    metadata: normalized.metadata ?? null,
    channel: normalized.channel ?? 'in_app',
    chain_id: normalized.chain_id ?? null,
    first_seen_at: normalized.first_seen_at ?? now,
    acknowledged_at: normalized.acknowledged_at ?? null,
    muted_until: normalized.muted_until ?? null,
    escalated_to_risk_id: normalized.escalated_to_risk_id ?? null,
    escalated_at: normalized.escalated_at ?? null,
    is_escalated: normalized.is_escalated ?? false,
    resolved_at: normalized.resolved_at ?? null,
    resolved_source: normalized.resolved_source ?? null,
    created_at: now,
  })
}

export async function persistNotification(
  notification: WarningChainNotification,
): Promise<Notification | null> {
  const normalized = normalizeNotificationRecord(notification)
  const existing = await listNotifications(
    normalized.project_id
      ? { projectId: normalized.project_id }
      : {},
  )

  const existingMatch = existing
    .map((item) => normalizeNotificationRecord(item))
    .find((item) => buildNotificationIdentity(item) === buildNotificationIdentity(normalized))

  if (existingMatch) {
    return existingMatch as Notification
  }

  return await insertNotificationRow(normalized)
}

export async function persistNotifications(
  notifications: WarningChainNotification[],
): Promise<Notification[]> {
  const persisted: Notification[] = []
  for (const notification of dedupeNotifications(notifications)) {
    const row = await persistNotification(notification)
    if (row) {
      persisted.push(row)
    }
  }
  return persisted
}

export class WarningChainService {
  buildNotificationIdentity(notification: WarningChainNotification) {
    return buildNotificationIdentity(notification)
  }

  normalizeNotificationRecord<T extends WarningChainNotification>(notification: T) {
    return normalizeNotificationRecord(notification)
  }

  dedupeNotifications<T extends WarningChainNotification>(notifications: T[]) {
    return dedupeNotifications(notifications)
  }

  collapseWarningRedundancy(warnings: Warning[]) {
    return collapseWarningRedundancy(warnings)
  }

  normalizeNotificationPayload(
    warning: Warning & {
      category?: string | null
      delay_request_id?: string | null
      source_entity_id?: string | null
    },
  ) {
    return normalizeNotificationPayload(warning)
  }

  shouldSkipAutoUpgrade(window: AutoUpgradeWindow) {
    return shouldSkipAutoUpgrade(window)
  }

  resolveWarningsForTaskCompletion<T extends WarningChainNotification & { resolved?: boolean }>(
    warnings: T[],
    input: NaturalClearanceInput,
  ) {
    return resolveWarningsForTaskCompletion(warnings, input)
  }

  resolvePendingDelayWarningSeverity(input: PendingDelayWarningInput) {
    return resolvePendingDelayWarningSeverity(input)
  }

  escalateObstacleSeverity(input: ObstacleSeverityUpgradeInput) {
    return escalateObstacleSeverity(input)
  }

  persistNotification(notification: WarningChainNotification) {
    return persistNotification(notification)
  }

  persistNotifications(notifications: WarningChainNotification[]) {
    return persistNotifications(notifications)
  }
}

export function shouldSkipAutoUpgrade(window: AutoUpgradeWindow) {
  if (window.acknowledged_at) return true

  if (!window.muted_until) return false

  const mutedUntil = new Date(window.muted_until).getTime()
  const now = new Date(window.now ?? new Date()).getTime()
  return Number.isFinite(mutedUntil) && mutedUntil > now
}

export function resolveWarningsForTaskCompletion<T extends WarningChainNotification & { resolved?: boolean }>(
  warnings: T[],
  input: NaturalClearanceInput,
): T[] {
  if (input.task_status !== 'completed') {
    return warnings
  }

  return warnings.map((warning) => {
    const warningTaskId = warning.task_id || warning.source_entity_id || null
    if (warningTaskId && input.task_id && warningTaskId === input.task_id) {
      return {
        ...warning,
        resolved: true,
        status: 'resolved',
      }
    }
    return warning
  })
}

export function resolvePendingDelayWarningSeverity(input: PendingDelayWarningInput) {
  if (!input.has_pending_request) {
    return {
      severity: input.warning_level,
      note: null,
      escalated: false,
    }
  }

  return {
    severity: 'info' as const,
    note: '延期审批中',
    escalated: false,
  }
}

export function escalateObstacleSeverity(input: ObstacleSeverityUpgradeInput) {
  const expectedResolution = input.expected_resolution_date
    ? new Date(input.expected_resolution_date).getTime()
    : Number.NaN
  const currentTime = new Date(input.now ?? new Date()).getTime()
  const isOverdue = Number.isFinite(expectedResolution) && expectedResolution < currentTime
  const isResolved = input.status === '已解决' || input.status === 'resolved'

  if (!isOverdue || isResolved) {
    return {
      severity: input.severity,
      escalated: false,
    }
  }

  if (input.severity === 'critical') {
    return {
      severity: input.severity,
      escalated: false,
    }
  }

  return {
    severity: 'critical' as const,
    escalated: true,
  }
}
