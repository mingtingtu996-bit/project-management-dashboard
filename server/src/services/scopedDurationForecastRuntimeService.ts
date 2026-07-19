import { buildRuntimeScheduleAccelerationRowsWithDiagnostics } from './scheduleAccelerationRuntimeService.js'
import { listCurrentTaskDurationForecasts } from './taskDurationForecastService.js'
import { getProjectCriticalPathSnapshot } from './projectCriticalPathService.js'
import {
  resolveConstructionCalendarContext,
  type ConstructionCalendarContext,
} from './constructionCalendar.js'
import { buildProjectTaskAttributionProjection } from './taskAttributionProjectionService.js'
import {
  buildScopedDurationForecasts,
  type ScopedDurationForecastResponse,
} from './scopedDurationForecastService.js'

export type ScopedDurationForecastRuntimeDependencies = {
  buildRuntimeScheduleAccelerationRowsWithDiagnostics: typeof buildRuntimeScheduleAccelerationRowsWithDiagnostics
  listCurrentTaskDurationForecasts: typeof listCurrentTaskDurationForecasts
  getProjectCriticalPathSnapshot: typeof getProjectCriticalPathSnapshot
  resolveConstructionCalendarContext: typeof resolveConstructionCalendarContext
}

export type ScopedDurationForecastRuntimeOptions = {
  asOfDate?: string | null
}

const defaultDependencies: ScopedDurationForecastRuntimeDependencies = {
  buildRuntimeScheduleAccelerationRowsWithDiagnostics,
  listCurrentTaskDurationForecasts,
  getProjectCriticalPathSnapshot,
  resolveConstructionCalendarContext,
}

const DEFAULT_SCOPED_FORECAST_MAX_AGE_MS = 36 * 60 * 60 * 1000
const BUSINESS_TIME_ZONE = 'Asia/Shanghai'

function normalizeText(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function unique(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map(normalizeText).filter(Boolean)))
}

function currentBusinessDate() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: BUSINESS_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())
  const values = new Map(parts.map((part) => [part.type, part.value]))
  return `${values.get('year')}-${values.get('month')}-${values.get('day')}`
}

export function isValidScopedDurationForecastDate(value: unknown): value is string {
  const text = normalizeText(value)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false
  const parsed = new Date(`${text}T00:00:00.000Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === text
}

export async function buildRuntimeScopedDurationForecast(
  projectId: string,
  options: ScopedDurationForecastRuntimeOptions = {},
  dependencies: ScopedDurationForecastRuntimeDependencies = defaultDependencies,
): Promise<ScopedDurationForecastResponse> {
  const normalizedProjectId = normalizeText(projectId)
  if (!normalizedProjectId) throw new TypeError('projectId is required')

  const asOfDate = normalizeText(options.asOfDate) || currentBusinessDate()
  if (!isValidScopedDurationForecastDate(asOfDate)) {
    throw new TypeError('asOfDate must be a valid YYYY-MM-DD date')
  }

  // Project rows are mandatory and loaded before optional evidence so a failed task read
  // cannot leak or partially calculate another project's forecast.
  const runtimeRows = await dependencies.buildRuntimeScheduleAccelerationRowsWithDiagnostics(normalizedProjectId)
  const rows = runtimeRows.rows
  const taskIds = unique(rows.map((row) => row.clientRowId))

  const [forecastResult, criticalPathResult, calendarResult] = await Promise.allSettled([
    taskIds.length > 0
      ? dependencies.listCurrentTaskDurationForecasts(taskIds, {
          projectId: normalizedProjectId,
          maxAgeMs: DEFAULT_SCOPED_FORECAST_MAX_AGE_MS,
        })
      : Promise.resolve([]),
    dependencies.getProjectCriticalPathSnapshot(normalizedProjectId),
    dependencies.resolveConstructionCalendarContext({ projectId: normalizedProjectId }),
  ])

  const globalDegradationReasons: string[] = [...runtimeRows.degradationReasons]
  const forecasts = forecastResult.status === 'fulfilled' ? forecastResult.value : []
  if (forecastResult.status === 'rejected') globalDegradationReasons.push('task_forecasts_unavailable')

  const criticalPath = criticalPathResult.status === 'fulfilled' ? criticalPathResult.value : null
  if (criticalPathResult.status === 'rejected') globalDegradationReasons.push('critical_path_unavailable')

  const constructionCalendar: ConstructionCalendarContext = calendarResult.status === 'fulfilled'
    ? calendarResult.value
    : {
        basis: 'calendar_day',
        windows: [],
        calendarRef: null,
        calendarVersion: null,
        timezone: BUSINESS_TIME_ZONE,
        availability: 'unavailable',
        unavailableReason: 'construction_calendar_unavailable',
      }
  if (calendarResult.status === 'rejected') globalDegradationReasons.push('construction_calendar_unavailable')

  const criticalTaskIds = new Set(unique([
    ...(criticalPath?.displayTaskIds ?? []),
    ...(criticalPath?.autoTaskIds ?? []),
    ...(criticalPath?.tasks ?? [])
      .filter((task) => task.isAutoCritical)
      .map((task) => task.taskId),
  ]))
  const attributions = buildProjectTaskAttributionProjection(rows.map((row) => ({
    id: normalizeText(row.clientRowId),
    title: normalizeText(row.values.title) || null,
    parent_id: normalizeText(row.values.parent_id) || null,
    wbs_level: row.values.wbs_level as number | string | null | undefined,
    sort_order: row.values.sort_order as number | string | null | undefined,
    engineering_category_id: normalizeText(row.values.engineering_category_id) || null,
    engineering_category_name: normalizeText(row.values.engineering_category_name) || null,
    specialty_type: normalizeText(row.values.specialty_type) || null,
  })))

  return buildScopedDurationForecasts({
    projectId: normalizedProjectId,
    asOfDate,
    rows,
    forecasts,
    attributions,
    criticalTaskIds,
    constructionCalendar,
    globalDegradationReasons,
  })
}
