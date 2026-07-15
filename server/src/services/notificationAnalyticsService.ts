// v1.4.13 P2: operational analytics for notification/todo touchpoints.

import type { Notification } from '../types/db.js'
import { supabase } from './dbService.js'

export interface NotificationAnalyticsQuery {
  companyId?: string | null
  projectId?: string | null
  since?: string | null
  until?: string | null
  limit?: number
}

export interface NotificationAnalyticsSummary {
  totalCount: number
  byTouchpointType: Record<string, number>
  byNotificationType: Record<string, number>
  byLifecycleStatus: Record<string, number>
  byProjectionRuleVersion: Record<string, number>
  byProducerContractVersion: Record<string, number>
  dedupeKeyCount: number
  dedupeCoverageRate: number
  duplicateDedupeKeyRate: number
  userStateCount: number
  readRate: number
  acknowledgedRate: number
  muteRate: number
  hiddenRate: number
  actionConversionRate: number
  metricValues: Record<string, number>
}

type NotificationUserStateRow = {
  notification_id: string
  is_read?: boolean | null
  is_acknowledged?: boolean | null
  is_muted?: boolean | null
  is_hidden?: boolean | null
}

function normalizeText(value: unknown, fallback: string) {
  const normalized = String(value ?? '').trim()
  return normalized || fallback
}

function roundRate(numerator: number, denominator: number) {
  if (denominator <= 0) return 0
  return Math.round((numerator / denominator) * 100)
}

function increment(target: Record<string, number>, key: string) {
  target[key] = (target[key] ?? 0) + 1
}

function normalizeDate(value?: string | null) {
  const normalized = String(value ?? '').trim()
  if (!normalized) return null
  const date = new Date(normalized)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

export async function getNotificationAnalytics(query: NotificationAnalyticsQuery = {}): Promise<NotificationAnalyticsSummary> {
  const limit = Math.min(Math.max(Number(query.limit ?? 5000), 1), 10000)
  const since = normalizeDate(query.since)
  const until = normalizeDate(query.until)
  let builder = (supabase as any)
    .from('notifications')
    .select('id, company_id, project_id, type, notification_type, touchpoint_type, lifecycle_status, dedupe_key, status, is_read, metadata, created_at')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (query.companyId) builder = builder.eq('company_id', query.companyId)
  if (query.projectId) builder = builder.eq('project_id', query.projectId)
  if (since) builder = builder.gte('created_at', since)
  if (until) builder = builder.lte('created_at', until)

  const { data, error } = await builder
  if (error) throw new Error(error.message)

  const notifications = (data ?? []) as Notification[]
  const ids = notifications.map((item) => item.id).filter(Boolean)
  const byTouchpointType: Record<string, number> = {}
  const byNotificationType: Record<string, number> = {}
  const byLifecycleStatus: Record<string, number> = {}
  const byProjectionRuleVersion: Record<string, number> = {}
  const byProducerContractVersion: Record<string, number> = {}
  const dedupeKeyCounts = new Map<string, number>()

  for (const notification of notifications) {
    increment(byTouchpointType, normalizeText(notification.touchpoint_type, 'persistent'))
    increment(byNotificationType, normalizeText(notification.notification_type ?? notification.type, 'notification'))
    increment(byLifecycleStatus, normalizeText(notification.lifecycle_status ?? notification.status, 'active'))
    const metadata = notification.metadata && typeof notification.metadata === 'object'
      ? notification.metadata as Record<string, unknown>
      : {}
    increment(byProjectionRuleVersion, normalizeText(metadata.projection_rule_version, 'unknown'))
    increment(byProducerContractVersion, normalizeText(metadata.producer_contract_version, 'unknown'))

    const dedupeKey = String(notification.dedupe_key ?? '').trim()
    if (dedupeKey) dedupeKeyCounts.set(dedupeKey, (dedupeKeyCounts.get(dedupeKey) ?? 0) + 1)
  }

  let userStates: NotificationUserStateRow[] = []
  if (ids.length > 0) {
    const { data: stateRows, error: stateError } = await (supabase as any)
      .from('notification_user_states')
      .select('notification_id, is_read, is_acknowledged, is_muted, is_hidden')
      .in('notification_id', ids)
    if (!stateError) userStates = (stateRows ?? []) as NotificationUserStateRow[]
  }

  // eslint-disable-next-line -- summary-service-aggregation-approved; ssot: service-owned-summary
  const readCount = userStates.filter((state) => state.is_read).length
  // eslint-disable-next-line -- summary-service-aggregation-approved; ssot: service-owned-summary
  const acknowledgedCount = userStates.filter((state) => state.is_acknowledged).length
  // eslint-disable-next-line -- summary-service-aggregation-approved; ssot: service-owned-summary
  const mutedCount = userStates.filter((state) => state.is_muted).length
  // eslint-disable-next-line -- summary-service-aggregation-approved; ssot: service-owned-summary
  const hiddenCount = userStates.filter((state) => state.is_hidden).length
  const dedupeKeyCount = dedupeKeyCounts.size
  const duplicateDedupeKeys = [...dedupeKeyCounts.values()].filter((count) => count > 1).length
  const totalCount = notifications.length
  const userStateCount = userStates.length
  const readRate = roundRate(readCount, userStateCount)
  const acknowledgedRate = roundRate(acknowledgedCount, userStateCount)
  const muteRate = roundRate(mutedCount, userStateCount)
  const hiddenRate = roundRate(hiddenCount, userStateCount)
  const dedupeCoverageRate = roundRate(dedupeKeyCount, totalCount)
  const duplicateDedupeKeyRate = roundRate(duplicateDedupeKeys, Math.max(dedupeKeyCount, 1))

  return {
    totalCount,
    byTouchpointType,
    byNotificationType,
    byLifecycleStatus,
    byProjectionRuleVersion,
    byProducerContractVersion,
    dedupeKeyCount,
    dedupeCoverageRate,
    duplicateDedupeKeyRate,
    userStateCount,
    readRate,
    acknowledgedRate,
    muteRate,
    hiddenRate,
    actionConversionRate: acknowledgedRate,
    metricValues: {
      notification_total_count: totalCount,
      notification_read_rate: readRate,
      notification_mute_rate: muteRate,
      notification_hidden_rate: hiddenRate,
      notification_dedupe_coverage_rate: dedupeCoverageRate,
      notification_action_conversion_rate: acknowledgedRate,
      notification_projection_rule_version_count: Object.keys(byProjectionRuleVersion).length,
      notification_producer_contract_version_count: Object.keys(byProducerContractVersion).length,
    },
  }
}
