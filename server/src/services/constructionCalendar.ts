export type ConstructionCalendarWindow = Record<string, unknown> & {
  __stableCode?: string | null
  __resolverSource?: string | null
  __resolverVersionId?: string | null
  sourceVersion?: string | null
  source_version?: string | null
  holidayCode?: string | null
  holiday_code?: string | null
  stableCode?: string | null
  holidayName?: string | null
  holiday_name?: string | null
  startDate?: string | null
  start_date?: string | null
  endDate?: string | null
  end_date?: string | null
  adjustedWorkDates?: unknown
  adjusted_work_dates?: unknown
  calendarKind?: string | null
  calendar_kind?: string | null
  isCompensatoryWorkday?: boolean | null
  is_compensatory_workday?: boolean | null
}

export type ConstructionCalendarContext<TWindow extends ConstructionCalendarWindow = ConstructionCalendarWindow> = {
  basis: 'calendar_day' | 'official_construction_calendar_seed'
  windows: TWindow[]
  calendarRef?: string | null
  calendarVersion?: string | null
  timezone?: string | null
  availability?: 'available' | 'unavailable'
  unavailableReason?: string | null
}

export type AuthoritativeConstructionCalendarContext<
  TWindow extends ConstructionCalendarWindow = ConstructionCalendarWindow,
> = ConstructionCalendarContext<TWindow> & {
  basis: 'official_construction_calendar_seed'
  calendarRef: string
  calendarVersion: string
  timezone: string
  availability: 'available'
}

export type ResolveConstructionCalendarContextInput = {
  projectId?: string | null
  standardWorkCode?: string | null
  templateNodeId?: string | null
  onError?: (error: unknown) => void
}

const DAY_MS = 86_400_000
type AlgorithmSeedResolverModule = typeof import('./algorithmSeedResolver.js')
let algorithmSeedResolverModulePromise: Promise<AlgorithmSeedResolverModule> | null = null

function loadAlgorithmSeedResolverModule() {
  if (!algorithmSeedResolverModulePromise) {
    algorithmSeedResolverModulePromise = import('./algorithmSeedResolver.js').catch((error) => {
      algorithmSeedResolverModulePromise = null
      throw error
    })
  }
  return algorithmSeedResolverModulePromise
}

function normalizeId(value: unknown) {
  return String(value ?? '').trim().toLowerCase()
}

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

export function isAuthoritativeConstructionCalendar<
  TWindow extends ConstructionCalendarWindow = ConstructionCalendarWindow,
>(
  calendar: ConstructionCalendarContext<TWindow> | null | undefined,
): calendar is AuthoritativeConstructionCalendarContext<TWindow> {
  return calendar?.basis === 'official_construction_calendar_seed'
    && calendar.availability === 'available'
    && Boolean(normalizeText(calendar.calendarRef))
    && Boolean(normalizeText(calendar.calendarVersion))
    && Boolean(normalizeText(calendar.timezone))
    && Array.isArray(calendar.windows)
}

export function effectiveConstructionCalendarBasis(
  calendar: ConstructionCalendarContext | null | undefined,
): ConstructionCalendarContext['basis'] {
  return isAuthoritativeConstructionCalendar(calendar)
    ? 'official_construction_calendar_seed'
    : 'calendar_day'
}

export function effectiveConstructionCalendarWindowCount(
  calendar: ConstructionCalendarContext | null | undefined,
) {
  return isAuthoritativeConstructionCalendar(calendar) ? calendar.windows.length : 0
}

export function normalizeConstructionCalendarForConsumption<
  TWindow extends ConstructionCalendarWindow = ConstructionCalendarWindow,
>(calendar: ConstructionCalendarContext<TWindow>): ConstructionCalendarContext<TWindow> {
  if (isAuthoritativeConstructionCalendar(calendar)) {
    return {
      ...calendar,
      calendarRef: normalizeText(calendar.calendarRef),
      calendarVersion: normalizeText(calendar.calendarVersion),
      timezone: normalizeText(calendar.timezone),
      unavailableReason: null,
    }
  }
  return {
    basis: 'calendar_day',
    windows: [],
    calendarRef: null,
    calendarVersion: null,
    timezone: normalizeText(calendar.timezone) || 'Asia/Shanghai',
    availability: 'unavailable',
    unavailableReason: normalizeText(calendar.unavailableReason) || 'construction_calendar_identity_missing',
  }
}

function readBooleanFlag(window: ConstructionCalendarWindow, keys: string[]) {
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(window, key)) continue
    const value = window[key]
    if (typeof value === 'boolean') return value
    if (typeof value === 'string') {
      const normalized = normalizeId(value)
      if (['true', '1', 'yes', 'y'].includes(normalized)) return true
      if (['false', '0', 'no', 'n'].includes(normalized)) return false
    }
  }
  return null
}

function readStringList(value: unknown) {
  if (Array.isArray(value)) return value.map((item) => String(item ?? '').trim()).filter(Boolean)
  if (typeof value === 'string') return value.split(',').map((item) => item.trim()).filter(Boolean)
  return []
}

export function parseConstructionCalendarDate(value: unknown): Date | null {
  const text = String(value ?? '').trim()
  if (!text) return null
  const dateText = /^\d{4}-\d{2}-\d{2}/.test(text) ? text.slice(0, 10) : text
  const parsed = new Date(`${dateText}T00:00:00.000Z`)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

export function calendarDateText(date: Date) {
  return date.toISOString().slice(0, 10)
}

export function startOfUtcDay(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
}

function normalizedDateText(value: unknown) {
  const date = parseConstructionCalendarDate(value)
  return date ? calendarDateText(date) : null
}

export function isSpringFestivalWindow(window: ConstructionCalendarWindow) {
  const code = normalizeId(window.holidayCode ?? window.holiday_code ?? window.stableCode)
  const name = normalizeId(window.holidayName ?? window.holiday_name)
  return code.includes('spring_festival')
    || code.includes('chunjie')
    || name.includes('spring festival')
    || name.includes('春节')
}

export function isCompensatoryWorkdayWindow(window: ConstructionCalendarWindow) {
  return normalizeId(window.calendarKind ?? window.calendar_kind) === 'compensatory_workday'
    || window.isCompensatoryWorkday === true
    || window.is_compensatory_workday === true
}

function isClimateContextWindow(window: ConstructionCalendarWindow) {
  const kind = normalizeId(window.calendarKind ?? window.calendar_kind)
  return ['plum_rain_window', 'hot_summer_window', 'dust_storm_window'].includes(kind)
}

export function countsAsConstructionShutdown(window: ConstructionCalendarWindow) {
  const explicit = readBooleanFlag(window, [
    'countsAsConstructionShutdown',
    'counts_as_construction_shutdown',
    'constructionShutdown',
    'construction_shutdown',
    'isConstructionShutdown',
    'is_construction_shutdown',
    'shutdown',
    'isShutdown',
    'is_shutdown',
  ])
  if (explicit !== null) return explicit
  if (isCompensatoryWorkdayWindow(window)) return false
  if (isClimateContextWindow(window)) return false
  if (isSpringFestivalWindow(window)) return true

  const kind = normalizeId(window.calendarKind ?? window.calendar_kind)
  return kind === 'winter_shutdown'
}

export function windowEndDateWithDefault(window: ConstructionCalendarWindow, defaultDays = 13) {
  const start = normalizedDateText(window.startDate ?? window.start_date)
  const startDate = parseConstructionCalendarDate(start)
  if (!startDate) return null

  const explicitEnd = parseConstructionCalendarDate(window.endDate ?? window.end_date)
  if (explicitEnd) return explicitEnd

  const end = new Date(startDate)
  end.setUTCDate(end.getUTCDate() + (isSpringFestivalWindow(window) ? defaultDays : 0))
  return end
}

export function dateInConstructionCalendarWindow(date: Date | null | undefined, window: ConstructionCalendarWindow) {
  if (!date) return false
  const start = parseConstructionCalendarDate(window.startDate ?? window.start_date)
  const end = windowEndDateWithDefault(window)
  return Boolean(start && end && date >= start && date <= end)
}

export function isDateInConstructionShutdownWindow(window: ConstructionCalendarWindow, dateText: string) {
  if (!countsAsConstructionShutdown(window)) return false
  const adjustedWorkDates = [
    ...readStringList(window.adjustedWorkDates),
    ...readStringList(window.adjusted_work_dates),
  ].map((item) => normalizedDateText(item)).filter(Boolean)
  if (adjustedWorkDates.includes(dateText)) return false

  const start = normalizedDateText(window.startDate ?? window.start_date)
  if (!start) return false
  const end = windowEndDateWithDefault(window)
  if (!end) return false
  return dateText >= start && dateText <= calendarDateText(end)
}

export function isConstructionProductionDay(date: Date, calendar?: ConstructionCalendarContext | null) {
  const dateText = calendarDateText(date)
  if (isAuthoritativeConstructionCalendar(calendar)
    && calendar.windows.some((window) => isDateInConstructionShutdownWindow(window, dateText))) return false
  return true
}

export function nextConstructionProductionDay(date: Date, calendar?: ConstructionCalendarContext | null) {
  const next = startOfUtcDay(date)
  while (!isConstructionProductionDay(next, calendar)) {
    next.setUTCDate(next.getUTCDate() + 1)
  }
  return next
}

export function addConstructionProductionDays(date: Date, days: number, calendar?: ConstructionCalendarContext | null) {
  let remaining = Math.max(1, days)
  const cursor = nextConstructionProductionDay(date, calendar)
  remaining -= 1

  while (remaining > 0) {
    cursor.setUTCDate(cursor.getUTCDate() + 1)
    if (isConstructionProductionDay(cursor, calendar)) remaining -= 1
  }

  return cursor.toISOString().slice(0, 10)
}

export function productionDaysBetweenInclusive(start: Date, end: Date, calendar?: ConstructionCalendarContext | null) {
  const cursor = startOfUtcDay(start)
  const stop = startOfUtcDay(end)
  if (stop < cursor) return 0

  let count = 0
  while (cursor <= stop) {
    if (isConstructionProductionDay(cursor, calendar)) count += 1
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  return count
}

export async function resolveConstructionCalendarContext(
  input: ResolveConstructionCalendarContextInput = {},
): Promise<ConstructionCalendarContext> {
  try {
    const { resolveAlgorithmSeedRecords } = await loadAlgorithmSeedResolverModule()
    const windows = await resolveAlgorithmSeedRecords<ConstructionCalendarWindow>('work_calendar', {
      projectId: input.projectId ?? null,
      standardWorkCode: input.standardWorkCode ?? null,
      templateNodeId: input.templateNodeId ?? null,
    })
    const calendarVersions = Array.from(new Set(windows.flatMap((window) => [
      String(window.__resolverVersionId ?? '').trim(),
      String(window.sourceVersion ?? window.source_version ?? '').trim(),
    ]).filter(Boolean))).sort()
    const available = windows.length > 0 && calendarVersions.length > 0
    return {
      basis: available ? 'official_construction_calendar_seed' : 'calendar_day',
      windows: available ? windows : [],
      calendarRef: available ? 'work_calendar' : null,
      calendarVersion: available ? calendarVersions.join('|') : null,
      timezone: 'Asia/Shanghai',
      availability: available ? 'available' : 'unavailable',
      unavailableReason: available ? null : 'construction_calendar_identity_missing',
    }
  } catch (error) {
    input.onError?.(error)
    return {
      basis: 'calendar_day',
      windows: [],
      calendarRef: null,
      calendarVersion: null,
      timezone: 'Asia/Shanghai',
      availability: 'unavailable',
      unavailableReason: 'construction_calendar_unavailable',
    }
  }
}
