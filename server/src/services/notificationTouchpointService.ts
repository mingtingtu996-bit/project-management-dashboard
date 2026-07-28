import { v4 as uuidv4 } from 'uuid'

import type { Notification } from '../types/db.js'
import { registerDatabasePostCommitEffect } from '../database.js'
import { supabase } from './dbService.js'
import {
  compareAndSetNotificationById,
  findNotification,
  insertNotification,
  type NotificationInput,
} from './notificationStore.js'
import { clearAttentionSummaryCache } from './todoTouchpointService.js'
import { applyNotificationProducerContract } from './notificationProducerContract.js'
import { applyNotificationDeliveryGovernance } from './notificationDeliveryGovernanceService.js'
import {
  NOTIFICATION_TOUCHPOINT_RULE_REGISTRY,
  TOUCHPOINT_PROJECTION_RULE_VERSION,
  TOUCHPOINT_PROJECTION_SOURCE,
  buildNotificationDedupeKey,
} from './notificationTouchpointRules.js'

type TouchpointType = 'persistent' | 'dashboard_todo' | 'popup' | 'page_banner' | 'system_record'
type ScopeType = 'project' | 'company' | 'workspace' | 'system'
type LifecycleStatus = 'active' | 'resolved' | 'archived'
type NotificationIntent =
  | 'business-warning'
  | 'business_warning'
  | 'flow-reminder'
  | 'flow_reminder'
  | 'system-exception'
  | 'system_exception'

type EmitTouchpointType = TouchpointType | NotificationIntent | string

export type NotificationTouchpointInput = NotificationInput & {
  company_id?: string | null
  project_id?: string | null
  user_id?: string | null
  touchpoint_type?: EmitTouchpointType | null
  scope_type?: ScopeType | string | null
  lifecycle_status?: LifecycleStatus | string | null
  dedupe_key?: string | null
  target_route?: string | null
  target_label?: string | null
  source?: string | null
  occurred_at?: string | null
}

export type NotificationTouchpointResolveInput = Pick<
  NotificationTouchpointInput,
  | 'company_id'
  | 'project_id'
  | 'user_id'
  | 'touchpoint_type'
  | 'scope_type'
  | 'dedupe_key'
  | 'source_entity_type'
  | 'source_entity_id'
  | 'type'
  | 'resolved_source'
  | 'occurred_at'
  | 'metadata'
  | 'created_at'
  | 'updated_at'
>

type NotificationMutationResult = {
  notification: Notification
  mutated: boolean
}

const TOUCHPOINT_EVENT_OCCURRED_AT_KEY = 'touchpoint_event_occurred_at'
const TOUCHPOINT_LIFECYCLE_EVENT_KEY = 'touchpoint_lifecycle_event'
const MAX_LIFECYCLE_CAS_ATTEMPTS = 5

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

function normalizeNullableText(value: unknown) {
  const normalized = normalizeText(value)
  return normalized || null
}

function normalizeTouchpointType(value: unknown): TouchpointType {
  const normalized = normalizeText(value)
  if (normalized === 'dashboard_todo' || normalized === 'popup' || normalized === 'page_banner' || normalized === 'system_record') {
    return normalized
  }
  return 'persistent'
}

function normalizeIntent(value: unknown): 'business-warning' | 'flow-reminder' | 'system-exception' | null {
  const normalized = normalizeText(value).replace(/_/g, '-')
  if (normalized === 'business-warning' || normalized === 'flow-reminder' || normalized === 'system-exception') {
    return normalized
  }
  return null
}

function resolveEmitFields(input: NotificationTouchpointInput) {
  const rawTouchpoint = normalizeText(input.touchpoint_type)
  const intent = normalizeIntent(input.notification_type) ?? normalizeIntent(input.touchpoint_type) ?? normalizeIntent(input.type)
  const explicitVisualTouchpoint = ['persistent', 'dashboard_todo', 'popup', 'page_banner', 'system_record'].includes(rawTouchpoint)
    ? normalizeTouchpointType(rawTouchpoint)
    : null

  const notificationType = input.notification_type ?? intent ?? input.type
  const touchpointType = explicitVisualTouchpoint
    ?? (intent === 'system-exception'
      ? 'system_record'
      : intent === 'business-warning' || intent === 'flow-reminder'
        ? 'dashboard_todo'
        : normalizeTouchpointType(input.touchpoint_type))

  return {
    notification_type: notificationType,
    touchpoint_type: touchpointType,
  }
}

function normalizeScopeType(value: unknown, input: NotificationTouchpointInput): ScopeType {
  const normalized = normalizeText(value)
  if (normalized === 'company' || normalized === 'workspace' || normalized === 'system' || normalized === 'project') {
    return normalized
  }
  if (input.project_id) return 'project'
  if (input.user_id) return 'workspace'
  if (input.company_id) return 'company'
  return 'system'
}

function normalizeLifecycleStatus(value: unknown): LifecycleStatus {
  const normalized = normalizeText(value)
  if (normalized === 'resolved' || normalized === 'archived') return normalized
  return 'active'
}

function buildDedupeKey(input: NotificationTouchpointInput) {
  return buildNotificationDedupeKey(input)
}

function getDedupeStrategy(input: NotificationTouchpointInput, dedupeKey: string | null) {
  if (normalizeNullableText(input.dedupe_key)) return 'explicit'
  if (normalizeNullableText(input.source_entity_type) && normalizeNullableText(input.source_entity_id)) return 'source_entity'
  if (dedupeKey) return 'content_fingerprint'
  return 'none'
}

function shouldRequireDedupe(touchpointType: TouchpointType) {
  return NOTIFICATION_TOUCHPOINT_RULE_REGISTRY.touchpoints[touchpointType].requiresDedupe
}

function normalizeIsoDate(value: unknown) {
  const normalized = normalizeNullableText(value)
  if (!normalized) return null
  const date = new Date(normalized)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function readMetadata(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function resolveEventOccurredAt(input: NotificationTouchpointInput, fallback: string) {
  const metadata = readMetadata(input.metadata)
  return normalizeIsoDate(input.occurred_at)
    ?? normalizeIsoDate((input as Record<string, unknown>).occurredAt)
    ?? normalizeIsoDate(metadata[TOUCHPOINT_EVENT_OCCURRED_AT_KEY])
    ?? normalizeIsoDate(metadata.occurred_at)
    ?? normalizeIsoDate(metadata.occurredAt)
    ?? normalizeIsoDate(input.updated_at)
    ?? normalizeIsoDate(input.created_at)
    ?? fallback
}

function readNotificationEventOccurredAt(notification: Notification) {
  const metadata = readMetadata(notification.metadata)
  return normalizeIsoDate(metadata[TOUCHPOINT_EVENT_OCCURRED_AT_KEY])
    ?? normalizeIsoDate(metadata.occurred_at)
    ?? normalizeIsoDate(metadata.occurredAt)
    ?? normalizeIsoDate(notification.updated_at)
    ?? normalizeIsoDate(notification.created_at)
}

function shouldApplyLifecycleEvent(
  existing: Notification,
  eventOccurredAt: string,
  lifecycleStatus: LifecycleStatus,
) {
  const existingOccurredAt = readNotificationEventOccurredAt(existing)
  if (!existingOccurredAt) return true
  const incomingTime = new Date(eventOccurredAt).getTime()
  const existingTime = new Date(existingOccurredAt).getTime()
  if (incomingTime > existingTime) return true
  if (incomingTime < existingTime) return false
  return lifecycleStatus === 'resolved' && normalizeLifecycleStatus(existing.lifecycle_status) === 'active'
}

function buildLifecycleEventMetadata(
  existing: Notification | null,
  input: NotificationTouchpointInput,
  eventOccurredAt: string,
  lifecycleEvent: 'emit' | 'resolve',
) {
  return {
    ...readMetadata(existing?.metadata),
    ...readMetadata(input.metadata),
    [TOUCHPOINT_EVENT_OCCURRED_AT_KEY]: eventOccurredAt,
    [TOUCHPOINT_LIFECYCLE_EVENT_KEY]: lifecycleEvent,
  }
}

function nextLifecycleVersion(existing: Notification, now: string) {
  const nowTime = new Date(now).getTime()
  const currentTime = new Date(existing.updated_at ?? existing.created_at).getTime()
  return new Date(Math.max(nowTime, currentTime + 1)).toISOString()
}

function resolveActionDueAt(input: NotificationTouchpointInput) {
  const metadata = (input.metadata ?? {}) as Record<string, unknown>
  return normalizeIsoDate(input.action_due_at)
    ?? normalizeIsoDate((input as Record<string, unknown>).due_at)
    ?? normalizeIsoDate((input as Record<string, unknown>).dueAt)
    ?? normalizeIsoDate(metadata.action_due_at)
    ?? normalizeIsoDate(metadata.actionDueAt)
    ?? normalizeIsoDate(metadata.due_at)
    ?? normalizeIsoDate(metadata.dueAt)
    ?? normalizeIsoDate(metadata.expected_resolution_date)
}

function buildTouchpointMetadata(input: NotificationTouchpointInput, touchpointType: TouchpointType, dedupeKey: string | null) {
  const existingMetadata = (input.metadata ?? {}) as Record<string, unknown>
  const dedupeRequired = shouldRequireDedupe(touchpointType)
  return {
    ...existingMetadata,
    touchpoint_source: input.source ?? existingMetadata.touchpoint_source ?? TOUCHPOINT_PROJECTION_SOURCE,
    projection_source: TOUCHPOINT_PROJECTION_SOURCE,
    projection_rule_version: TOUCHPOINT_PROJECTION_RULE_VERSION,
    dedupe_strategy: getDedupeStrategy(input, dedupeKey),
    dedupe_required: dedupeRequired,
    dedupe_missing: dedupeRequired && !dedupeKey,
  }
}

function buildFindOptions(
  input: NotificationTouchpointInput,
  dedupeKey: string,
  lifecycleStatus: LifecycleStatus | null = 'active',
) {
  return {
    companyId: normalizeNullableText(input.company_id),
    projectId: normalizeNullableText(input.project_id) ?? undefined,
    userId: normalizeNullableText(input.user_id),
    sourceEntityType: normalizeNullableText(input.source_entity_type) ?? undefined,
    sourceEntityId: normalizeNullableText(input.source_entity_id) ?? undefined,
    type: normalizeNullableText(input.type) ?? undefined,
    touchpointType: normalizeTouchpointType(input.touchpoint_type),
    scopeType: normalizeScopeType(input.scope_type, input),
    dedupeKey,
    lifecycleStatus: lifecycleStatus ?? undefined,
  }
}

function stripUndefined<T extends Record<string, unknown>>(value: T) {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as T
}

function isUniqueViolation(error: unknown) {
  const code = String((error as { code?: unknown } | null)?.code ?? '')
  const message = String((error as Error | null | undefined)?.message ?? '').toLowerCase()
  return code === '23505' || message.includes('duplicate key') || message.includes('unique constraint')
}

function normalizeRecipientIds(input: NotificationTouchpointInput, notification: Notification) {
  const recipients = Array.isArray(input.recipients)
    ? input.recipients
    : Array.isArray(notification.recipients)
      ? notification.recipients
      : []

  return [...new Set([
    normalizeNullableText(input.user_id),
    normalizeNullableText(notification.user_id),
    ...recipients.map(normalizeNullableText),
  ].filter((value): value is string => Boolean(value)))]
}

async function initializeUserStates(input: NotificationTouchpointInput, notification: Notification) {
  const notificationType = normalizeIntent(notification.notification_type) ?? normalizeIntent(input.notification_type)
  const touchpointType = normalizeTouchpointType(notification.touchpoint_type)
  if (notificationType === 'system-exception' || touchpointType === 'system_record') return

  const userIds = normalizeRecipientIds(input, notification)
  if (userIds.length === 0) return

  const now = new Date().toISOString()
  const rows = userIds.map((userId) => ({
    notification_id: notification.id,
    user_id: userId,
    is_read: false,
    is_acknowledged: false,
    is_muted: false,
    is_hidden: false,
    updated_at: now,
  }))

  const { error } = await (supabase as any)
    .from('notification_user_states')
    .upsert(rows, { onConflict: 'notification_id,user_id' })

  if (error) {
    // Older environments can run without the per-user table; notification row is still authoritative.
    return
  }
}

export class NotificationTouchpointService {
  async emit(input: NotificationTouchpointInput): Promise<Notification> {
    const eventOccurredAt = resolveEventOccurredAt(input, new Date().toISOString())
    const contractInput = applyNotificationProducerContract(input)
    const projectedFields = resolveEmitFields(contractInput)
    const governedInput = applyNotificationDeliveryGovernance({
      ...contractInput,
      notification_type: projectedFields.notification_type,
      touchpoint_type: projectedFields.touchpoint_type,
    })
    const emitFields = resolveEmitFields(governedInput)
    const dedupeKey = buildDedupeKey(governedInput)
    const result = await this.upsertWithMutation({
      ...governedInput,
      occurred_at: eventOccurredAt,
      notification_type: emitFields.notification_type,
      touchpoint_type: emitFields.touchpoint_type,
      dedupe_key: dedupeKey,
      action_due_at: resolveActionDueAt(governedInput),
      metadata: buildTouchpointMetadata(governedInput, emitFields.touchpoint_type, dedupeKey),
    })
    if (result.mutated) {
      await registerDatabasePostCommitEffect(
        `notification-touchpoint:${result.notification.id}`,
        async () => {
          await initializeUserStates(governedInput, result.notification)
          clearAttentionSummaryCache()
        },
      )
    }
    return result.notification
  }

  async upsert(input: NotificationTouchpointInput): Promise<Notification> {
    return (await this.upsertWithMutation(input)).notification
  }

  private async upsertWithMutation(input: NotificationTouchpointInput): Promise<NotificationMutationResult> {
    const now = new Date().toISOString()
    const eventOccurredAt = resolveEventOccurredAt(input, now)
    const touchpointType = normalizeTouchpointType(input.touchpoint_type)
    const scopeType = normalizeScopeType(input.scope_type, input)
    const lifecycleStatus = normalizeLifecycleStatus(input.lifecycle_status)
    const dedupeKey = buildDedupeKey(input)
    const actionDueAt = resolveActionDueAt(input)

    const patchExisting = async (initial: Notification): Promise<NotificationMutationResult> => {
      let existing = initial
      for (let attempt = 0; attempt < MAX_LIFECYCLE_CAS_ATTEMPTS; attempt += 1) {
        if (!shouldApplyLifecycleEvent(existing, eventOccurredAt, lifecycleStatus)) {
          return { notification: existing, mutated: false }
        }
        const updatedAt = nextLifecycleVersion(existing, now)
        const reopeningResolved = lifecycleStatus === 'active'
          && normalizeLifecycleStatus(existing.lifecycle_status) === 'resolved'
        const patch = stripUndefined({
          company_id: input.company_id ?? undefined,
          project_id: input.project_id ?? undefined,
          user_id: input.user_id ?? undefined,
          task_id: input.task_id ?? undefined,
          risk_id: input.risk_id ?? undefined,
          type: input.type,
          notification_type: input.notification_type ?? input.type,
          severity: input.severity ?? input.level ?? undefined,
          level: input.level ?? input.severity ?? undefined,
          title: input.title,
          content: input.content,
          is_read: reopeningResolved ? false : undefined,
          is_broadcast: input.is_broadcast ?? undefined,
          source_entity_type: input.source_entity_type ?? undefined,
          source_entity_id: input.source_entity_id ?? undefined,
          category: input.category ?? undefined,
          recipients: input.recipients ?? undefined,
          channel: input.channel ?? undefined,
          status: existing.status === 'muted' ? 'muted' : input.status ?? 'unread',
          metadata: buildLifecycleEventMetadata(existing, input, eventOccurredAt, lifecycleStatus === 'resolved' ? 'resolve' : 'emit'),
          chain_id: input.chain_id ?? undefined,
          lifecycle_status: lifecycleStatus,
          touchpoint_type: touchpointType,
          scope_type: scopeType,
          dedupe_key: dedupeKey,
          target_route: input.target_route ?? undefined,
          target_label: input.target_label ?? undefined,
          expires_at: input.expires_at ?? undefined,
          action_due_at: actionDueAt ?? undefined,
          resolved_at: lifecycleStatus === 'resolved' ? eventOccurredAt : null,
          resolved_source: lifecycleStatus === 'resolved' ? input.resolved_source ?? 'source_resolved' : null,
          updated_at: updatedAt,
        })
        let updated = false
        try {
          updated = await compareAndSetNotificationById(existing.id, patch, existing)
        } catch (error) {
          if (!dedupeKey || !isUniqueViolation(error)) throw error
          const active = await findNotification(buildFindOptions(input, dedupeKey))
          if (!active) throw error
          existing = active
          continue
        }
        if (updated) {
          return {
            notification: {
              ...existing,
              ...patch,
              updated_at: updatedAt,
            } as Notification,
            mutated: true,
          }
        }
        if (!dedupeKey) break
        const authoritative = await findNotification(buildFindOptions(input, dedupeKey, null))
        if (!authoritative) break
        existing = authoritative
      }
      throw new Error('notification lifecycle changed repeatedly during emit')
    }

    if (dedupeKey) {
      const existing = await findNotification(buildFindOptions(input, dedupeKey, null))
      if (existing) {
        return patchExisting(existing)
      }
    }

    try {
      const notification = await insertNotification({
        ...input,
        id: input.id || uuidv4(),
        notification_type: input.notification_type ?? input.type,
        lifecycle_status: lifecycleStatus,
        touchpoint_type: touchpointType,
        scope_type: scopeType,
        dedupe_key: dedupeKey,
        action_due_at: actionDueAt,
        metadata: buildLifecycleEventMetadata(null, input, eventOccurredAt, lifecycleStatus === 'resolved' ? 'resolve' : 'emit'),
        status: input.status ?? 'unread',
        created_at: input.created_at ?? now,
        updated_at: input.updated_at ?? now,
      })
      return { notification, mutated: true }
    } catch (error) {
      if (!dedupeKey || !isUniqueViolation(error)) throw error
      const existing = await findNotification(buildFindOptions(input, dedupeKey))
      if (!existing) throw error
      return patchExisting(existing)
    }
  }

  async resolve(input: NotificationTouchpointResolveInput): Promise<boolean> {
    const dedupeKey = buildDedupeKey(input as NotificationTouchpointInput)
    if (!dedupeKey) return false

    const now = new Date().toISOString()
    const eventOccurredAt = resolveEventOccurredAt(input as NotificationTouchpointInput, now)
    let existing = await findNotification(buildFindOptions(input as NotificationTouchpointInput, dedupeKey))
    if (!existing) return false

    for (let attempt = 0; attempt < MAX_LIFECYCLE_CAS_ATTEMPTS; attempt += 1) {
      if (!shouldApplyLifecycleEvent(existing, eventOccurredAt, 'resolved')) {
        return normalizeLifecycleStatus(existing.lifecycle_status) === 'resolved'
      }
      const updatedAt = nextLifecycleVersion(existing, now)
      const patch = {
        lifecycle_status: 'resolved' as const,
        status: 'read',
        is_read: true,
        metadata: buildLifecycleEventMetadata(existing, input as NotificationTouchpointInput, eventOccurredAt, 'resolve'),
        resolved_at: eventOccurredAt,
        resolved_source: input.resolved_source ?? 'source_resolved',
        updated_at: updatedAt,
      }
      const updated = await compareAndSetNotificationById(existing.id, patch, existing)
      if (updated) {
        await registerDatabasePostCommitEffect(
          `notification-touchpoint-resolve:${existing.id}`,
          async () => clearAttentionSummaryCache(),
        )
        return true
      }
      const authoritative = await findNotification(buildFindOptions(input as NotificationTouchpointInput, dedupeKey, null))
      if (!authoritative) return false
      existing = authoritative
    }
    throw new Error('notification lifecycle changed repeatedly during resolve')
  }
}

export const notificationTouchpointService = new NotificationTouchpointService()
