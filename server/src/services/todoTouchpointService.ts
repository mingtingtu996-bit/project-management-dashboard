// v1.4.13: Unified attention/todo/touchpoint aggregation service
// Single source for Header red dot, Sidebar badge, Dashboard today-todo

import { supabase } from './dbService.js'
import { query as rawQuery } from '../database.js'
import { logger } from '../middleware/logger.js'
import {
  isNotificationAttentionTouchpointType,
  isNotificationTodayTodoTouchpointType,
  NOTIFICATION_TOUCHPOINT_RULE_REGISTRY,
  type TouchpointType,
} from './notificationTouchpointRules.js'

export interface AttentionSummary {
  totalAttentionCount: number
  unreadNotificationCount: number
  todayTodoCount: number
  notificationTodayTodoCount: number
  criticalCount: number
  warningCount: number
  attentionWarningCount: number
  workspacePendingCount: number
  byTouchpointType?: Record<string, number>
}

type NotificationTouchpointRow = {
  id: string
  touchpoint_type: string | null
  is_read: boolean | null
  severity: string | null
  created_at: string | null
  action_due_at?: string | null
  expires_at?: string | null
}

type ProjectAttentionAggregateRow = {
  touchpoint_type: string | null
  total_count: number | string | null
  unread_count: number | string | null
  today_todo_count: number | string | null
  critical_count: number | string | null
  warning_count: number | string | null
}

function toCount(value: unknown): number {
  const count = Number(value ?? 0)
  return Number.isFinite(count) && count > 0 ? Math.floor(count) : 0
}

function buildShanghaiDayBounds(now = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  const parts = Object.fromEntries(formatter.formatToParts(now).map((part) => [part.type, part.value]))
  const year = Number(parts.year)
  const month = Number(parts.month)
  const day = Number(parts.day)
  const startUtcMs = Date.UTC(year, month - 1, day) - 8 * 60 * 60 * 1000
  return {
    startIso: new Date(startUtcMs).toISOString(),
    endIso: new Date(startUtcMs + 24 * 60 * 60 * 1000).toISOString(),
  }
}

const ATTENTION_SUMMARY_CACHE_TTL_MS = 3_000
const SUMMARY_TOUCHPOINT_TYPES = Object.keys(
  NOTIFICATION_TOUCHPOINT_RULE_REGISTRY.touchpoints,
) as TouchpointType[]
const TODAY_TODO_TOUCHPOINT_TYPES = SUMMARY_TOUCHPOINT_TYPES.filter(isNotificationTodayTodoTouchpointType)

const attentionSummaryCache = new Map<string, { expiresAt: number; summary: AttentionSummary }>()

function createEmptySummary(): AttentionSummary {
  return {
    totalAttentionCount: 0,
    unreadNotificationCount: 0,
    todayTodoCount: 0,
    notificationTodayTodoCount: 0,
    criticalCount: 0,
    warningCount: 0,
    attentionWarningCount: 0,
    workspacePendingCount: 0,
    byTouchpointType: Object.fromEntries(SUMMARY_TOUCHPOINT_TYPES.map((type) => [type, 0])),
  }
}

function cloneSummary(summary: AttentionSummary): AttentionSummary {
  return {
    ...summary,
    byTouchpointType: { ...(summary.byTouchpointType ?? {}) },
  }
}

function finalizeSummaryAliases(summary: AttentionSummary) {
  summary.notificationTodayTodoCount = summary.todayTodoCount
  summary.attentionWarningCount = summary.warningCount
}

function isActiveMute(row: { is_muted?: boolean | null; muted_until?: string | null }) {
  if (row.is_muted !== true) return false
  if (!row.muted_until) return true
  const mutedUntilMs = new Date(row.muted_until).getTime()
  return !Number.isNaN(mutedUntilMs) && mutedUntilMs > Date.now()
}

function isUnexpired(expiresAt?: string | null) {
  if (!expiresAt) return true
  const expiresAtMs = new Date(expiresAt).getTime()
  return Number.isNaN(expiresAtMs) || expiresAtMs > Date.now()
}

function buildCacheKey(projectId?: string | null, companyId?: string | null, userId?: string | null) {
  return [
    `project:${projectId ?? ''}`,
    `company:${companyId ?? ''}`,
    `user:${userId ?? ''}`,
  ].join('|')
}

export async function buildAttentionSummary(
  projectId?: string | null,
  companyId?: string | null,
  userId?: string | null,
): Promise<AttentionSummary> {
  const cacheKey = buildCacheKey(projectId, companyId, userId)
  const cached = attentionSummaryCache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) {
    return cloneSummary(cached.summary)
  }

  const summary = createEmptySummary()

  try {
    const { startIso: todayStartIso, endIso: tomorrowStartIso } = buildShanghaiDayBounds()
    const projectSummaryPromise = projectId
      ? (async () => {
          try {
            const result = await rawQuery(
              `SELECT COALESCE(n.touchpoint_type, 'system_record') AS touchpoint_type,
                      COUNT(*)::int AS total_count,
                      COUNT(*) FILTER (WHERE n.touchpoint_type = 'persistent' AND COALESCE(nus.is_read, n.is_read, false) = false)::int AS unread_count,
                      COUNT(*) FILTER (WHERE n.touchpoint_type = ANY($5::text[]) AND COALESCE(n.action_due_at, n.created_at) >= $2::timestamptz AND COALESCE(n.action_due_at, n.created_at) < $3::timestamptz)::int AS today_todo_count,
                      COUNT(*) FILTER (WHERE n.severity = 'critical')::int AS critical_count,
                      COUNT(*) FILTER (WHERE n.severity = 'warning')::int AS warning_count
                 FROM public.notifications n
                 LEFT JOIN public.notification_user_states nus
                   ON nus.notification_id = n.id
                  AND nus.user_id::text = $4::text
                WHERE n.project_id = $1
                  AND COALESCE(n.lifecycle_status, 'active') = 'active'
                  AND (n.expires_at IS NULL OR n.expires_at > now())
                  AND COALESCE(nus.is_hidden, false) = false
                  AND NOT (COALESCE(nus.is_muted, false) = true AND (nus.muted_until IS NULL OR nus.muted_until > now()))
                GROUP BY COALESCE(touchpoint_type, 'system_record')`,
              [projectId, todayStartIso, tomorrowStartIso, userId ?? null, TODAY_TODO_TOUCHPOINT_TYPES],
            )
            for (const row of result.rows as ProjectAttentionAggregateRow[]) {
              const touchpointType = row.touchpoint_type ?? 'system_record'
              const totalCount = toCount(row.total_count)
              if (summary.byTouchpointType && touchpointType in summary.byTouchpointType) {
                summary.byTouchpointType[touchpointType] += totalCount
              }
              if (isNotificationAttentionTouchpointType(touchpointType)) {
                summary.totalAttentionCount += totalCount
              }
              summary.unreadNotificationCount += toCount(row.unread_count)
              summary.todayTodoCount += toCount(row.today_todo_count)
              summary.criticalCount += toCount(row.critical_count)
              summary.warningCount += toCount(row.warning_count)
            }
            summary.warningCount += summary.criticalCount
            return
          } catch (error) {
            logger.warn('[todoTouchpointService] direct project attention summary failed, falling back to Supabase REST', {
              projectId,
              error: error instanceof Error ? error.message : String(error),
            })
          }

          const { data, error } = await (supabase as any)
            .from('notifications')
            .select('id,touchpoint_type,is_read,severity,created_at,action_due_at,expires_at')
            .eq('project_id', projectId)
            .eq('lifecycle_status', 'active')

          if (error) throw error

          const rows = Array.isArray(data) ? data as NotificationTouchpointRow[] : []
          for (const row of rows) {
            if (!isUnexpired(row.expires_at)) continue
            const touchpointType = row.touchpoint_type ?? 'system_record'
            if (summary.byTouchpointType && touchpointType in summary.byTouchpointType) {
              summary.byTouchpointType[touchpointType] += 1
            }

            if (isNotificationAttentionTouchpointType(touchpointType)) {
              summary.totalAttentionCount += 1
            }
            if (touchpointType === 'persistent' && row.is_read === false) {
              summary.unreadNotificationCount += 1
            }
            if (isNotificationTodayTodoTouchpointType(touchpointType)) {
              const actionAt = String(row.action_due_at ?? row.created_at ?? '')
              if (actionAt >= todayStartIso && actionAt < tomorrowStartIso) {
                summary.todayTodoCount += 1
              }
            }
            if (row.severity === 'critical') {
              summary.criticalCount += 1
            }
            if (row.severity === 'warning') {
              summary.warningCount += 1
            }
          }
          summary.warningCount += summary.criticalCount
        })()
      : Promise.resolve()

    const workspaceSummaryPromise = companyId && userId
      ? (async () => {
          try {
            const result = await rawQuery(
              `SELECT COUNT(*)::int AS count
                 FROM public.notifications n
                 LEFT JOIN public.notification_user_states nus
                   ON nus.notification_id = n.id
                  AND nus.user_id::text = $2::text
                WHERE n.company_id = $1
                  AND n.scope_type = 'workspace'
                  AND COALESCE(n.lifecycle_status, 'active') = 'active'
                  AND (n.expires_at IS NULL OR n.expires_at > now())
                  AND COALESCE(nus.is_hidden, false) = false
                  AND NOT (COALESCE(nus.is_muted, false) = true AND (nus.muted_until IS NULL OR nus.muted_until > now()))
                  AND COALESCE(nus.is_read, n.is_read, false) = false
                  AND (n.user_id = $2 OR n.is_broadcast = true)`,
              [companyId, userId],
            )
            summary.workspacePendingCount = toCount(result.rows[0]?.count)
            return
          } catch (error) {
            logger.warn('[todoTouchpointService] direct workspace attention summary failed, falling back to Supabase REST', {
              companyId,
              userId,
              error: error instanceof Error ? error.message : String(error),
            })
          }

          const { count: workspaceCount } = await (supabase as any)
          .from('notifications')
          .select('id', { count: 'exact', head: true })
          .eq('company_id', companyId)
          .eq('scope_type', 'workspace')
          .eq('lifecycle_status', 'active')
          .eq('is_read', false)
          .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
          .or(`user_id.eq.${userId},is_broadcast.eq.true`)
          summary.workspacePendingCount = workspaceCount ?? 0
        })()
      : Promise.resolve()

    await Promise.all([projectSummaryPromise, workspaceSummaryPromise])
    finalizeSummaryAliases(summary)
    attentionSummaryCache.set(cacheKey, {
      expiresAt: Date.now() + ATTENTION_SUMMARY_CACHE_TTL_MS,
      summary: cloneSummary(summary),
    })
  } catch (error) {
    logger.error('Failed to build attention summary', { error })
  }

  return summary
}

export function clearAttentionSummaryCacheForTests() {
  attentionSummaryCache.clear()
}

export function clearAttentionSummaryCache() {
  attentionSummaryCache.clear()
}
