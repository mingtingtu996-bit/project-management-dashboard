import { query as rawQuery } from '../database.js'
import { logger } from '../middleware/logger.js'
import { supabase } from './dbService.js'
import {
  resolveConstructionCalendarContext,
  type ConstructionCalendarContext,
} from './constructionCalendar.js'
import {
  buildConstructionProductionDayDurationMetric,
  businessDateKey,
  type DurationMetricDto,
} from './durationMetricService.js'

type WeeklyDigestDelayedTask = Record<string, unknown> & {
  delay: DurationMetricDto
  /** @deprecated Use delay. Removed after the v1.5 compatibility window. */
  delay_days?: number | null
}

export type WeeklyDigestReadModel = Record<string, unknown> & {
  critical_nearest_delay: DurationMetricDto
  /** @deprecated Use critical_nearest_delay. Removed after the v1.5 compatibility window. */
  critical_nearest_delay_days?: number | null
  top_delayed_tasks: WeeklyDigestDelayedTask[]
}

const WEEKLY_DIGEST_CACHE_TTL_MS = Number(process.env.WEEKLY_DIGEST_CACHE_TTL_MS ?? 300_000)
const latestDigestCache = new Map<string, { expiresAt: number; promise: Promise<WeeklyDigestReadModel | null> }>()

function normalizeDigestRow(row: Record<string, unknown> | null | undefined) {
  if (!row) return null
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [
      key,
      value instanceof Date ? value.toISOString() : value,
    ]),
  )
}

function readAsOf(row: Record<string, unknown>, calendar?: ConstructionCalendarContext | null) {
  const timezone = calendar?.timezone || 'Asia/Shanghai'
  const generatedAt = new Date(String(row.generated_at ?? ''))
  if (!Number.isNaN(generatedAt.getTime())) return businessDateKey(generatedAt, timezone)
  const weekStart = String(row.week_start ?? '').slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(weekStart) ? weekStart : businessDateKey(new Date(), timezone)
}

function readDelayedTasks(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object' && !Array.isArray(item))
    : []
}

export function buildWeeklyDigestReadModel(
  row: Record<string, unknown> | null | undefined,
  calendar?: ConstructionCalendarContext | null,
): WeeklyDigestReadModel | null {
  const normalized = normalizeDigestRow(row)
  if (!normalized) return null
  const asOf = readAsOf(normalized, calendar)
  const metric = (value: unknown) => buildConstructionProductionDayDurationMetric(
    typeof value === 'number' ? value : Number(value),
    { asOf, timezone: calendar?.timezone, calendar },
  )
  return {
    ...normalized,
    critical_nearest_delay: metric(normalized.critical_nearest_delay_days),
    top_delayed_tasks: readDelayedTasks(normalized.top_delayed_tasks).map((task) => ({
      ...task,
      delay: metric(task.delay_days),
    })),
  }
}

async function fetchLatestDigestRow(projectId: string) {
  try {
    const { rows } = await rawQuery(
      `
        SELECT *
        FROM public.weekly_digests
        WHERE project_id::text = $1
        ORDER BY week_start DESC NULLS LAST, generated_at DESC NULLS LAST
        LIMIT 1
      `,
      [projectId],
    )
    return normalizeDigestRow(rows[0] as Record<string, unknown> | undefined)
  } catch (error) {
    logger.warn('Direct weekly digest query failed, falling back to Supabase REST', {
      projectId,
      error: error instanceof Error ? error.message : String(error),
    })
    const { data, error: fallbackError } = await supabase
      .from('weekly_digests')
      .select('*')
      .eq('project_id', projectId)
      .order('week_start', { ascending: false })
      .limit(1)
      .single()
    if (fallbackError && fallbackError.code !== 'PGRST116') throw new Error(fallbackError.message)
    return normalizeDigestRow(data as Record<string, unknown> | null)
  }
}

export function getLatestWeeklyDigestReadModel(projectId: string) {
  const cached = latestDigestCache.get(projectId)
  if (cached && cached.expiresAt > Date.now()) return cached.promise
  const promise = Promise.all([
    fetchLatestDigestRow(projectId),
    resolveConstructionCalendarContext({ projectId }),
  ]).then(([row, calendar]) => buildWeeklyDigestReadModel(row, calendar))
  latestDigestCache.set(projectId, { expiresAt: Date.now() + WEEKLY_DIGEST_CACHE_TTL_MS, promise })
  promise.catch(() => {
    if (latestDigestCache.get(projectId)?.promise === promise) latestDigestCache.delete(projectId)
  })
  return promise
}

export async function warmLatestWeeklyDigestReadModel(projectId: string) {
  return getLatestWeeklyDigestReadModel(projectId)
}
