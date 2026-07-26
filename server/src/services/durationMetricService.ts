import {
  isAuthoritativeConstructionCalendar,
  type ConstructionCalendarContext,
} from './constructionCalendar.js'

export type DurationMetricUnit = 'calendar_day' | 'construction_production_day'
export type DurationMetricAvailability = 'available' | 'unavailable'

export type DurationMetricDto = {
  value: number | null
  unit: DurationMetricUnit
  calendarRef: string | null
  calendarVersion: string | null
  timezone: string
  asOf: string
  availability: DurationMetricAvailability
  unavailableReason: string | null
}

export function normalizeDurationMetricDto(value: unknown): DurationMetricDto | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const raw = value as Record<string, unknown>
  const unit = raw.unit
  const availability = raw.availability
  if (unit !== 'calendar_day' && unit !== 'construction_production_day') return null
  if (availability !== 'available' && availability !== 'unavailable') return null

  const normalizedAsOf = normalizeAsOf(raw.asOf)
  const timezone = normalizeText(raw.timezone)
  if (!normalizedAsOf || !timezone) return null

  const calendarRef = normalizeText(raw.calendarRef) || null
  const calendarVersion = normalizeText(raw.calendarVersion) || null
  const normalizedValue = normalizeValue(raw.value)
  if (availability === 'available' && (normalizedValue === null || !calendarRef || !calendarVersion)) return null

  return {
    value: availability === 'available' ? normalizedValue : null,
    unit,
    calendarRef,
    calendarVersion,
    timezone,
    asOf: normalizedAsOf,
    availability,
    unavailableReason: normalizeText(raw.unavailableReason) || null,
  }
}

type DurationMetricOptions = {
  asOf: string
  timezone?: string | null
}

type ProductionDurationMetricOptions = DurationMetricOptions & {
  calendar?: ConstructionCalendarContext | null
}

export const DEFAULT_DURATION_TIMEZONE = 'Asia/Shanghai'

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

function normalizeValue(value: unknown) {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function normalizeAsOf(value: unknown) {
  const text = normalizeText(value)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return ''
  const [year, month, day] = text.split('-').map(Number)
  const parsed = new Date(Date.UTC(year, month - 1, day))
  return parsed.getUTCFullYear() === year
    && parsed.getUTCMonth() === month - 1
    && parsed.getUTCDate() === day
    ? text
    : ''
}

function unavailableMetric(
  unit: DurationMetricUnit,
  options: DurationMetricOptions,
  reason: string,
  identity: { calendarRef?: string | null; calendarVersion?: string | null } = {},
): DurationMetricDto {
  return {
    value: null,
    unit,
    calendarRef: normalizeText(identity.calendarRef) || null,
    calendarVersion: normalizeText(identity.calendarVersion) || null,
    timezone: normalizeText(options.timezone) || DEFAULT_DURATION_TIMEZONE,
    asOf: normalizeAsOf(options.asOf),
    availability: 'unavailable',
    unavailableReason: reason,
  }
}

export function buildCalendarDayDurationMetric(
  value: number | null | undefined,
  options: DurationMetricOptions,
): DurationMetricDto {
  const asOf = normalizeAsOf(options.asOf)
  if (!asOf) return unavailableMetric('calendar_day', options, 'as_of_missing')
  const normalizedValue = normalizeValue(value)
  if (normalizedValue === null) {
    return unavailableMetric('calendar_day', options, 'duration_value_missing', {
      calendarRef: 'gregorian',
      calendarVersion: 'ISO-8601',
    })
  }
  return {
    value: normalizedValue,
    unit: 'calendar_day',
    calendarRef: 'gregorian',
    calendarVersion: 'ISO-8601',
    timezone: normalizeText(options.timezone) || DEFAULT_DURATION_TIMEZONE,
    asOf,
    availability: 'available',
    unavailableReason: null,
  }
}

export function hasIdentifiedConstructionCalendar(
  calendar: ConstructionCalendarContext | null | undefined,
): boolean {
  return isAuthoritativeConstructionCalendar(calendar)
}

export function buildConstructionProductionDayDurationMetric(
  value: number | null | undefined,
  options: ProductionDurationMetricOptions,
): DurationMetricDto {
  const calendar = options.calendar
  const identity = {
    calendarRef: calendar?.calendarRef ?? null,
    calendarVersion: calendar?.calendarVersion ?? null,
  }
  if (!normalizeAsOf(options.asOf)) {
    return unavailableMetric('construction_production_day', options, 'as_of_missing', identity)
  }
  if (!hasIdentifiedConstructionCalendar(calendar)) {
    return unavailableMetric(
      'construction_production_day',
      { ...options, timezone: calendar?.timezone ?? options.timezone },
      normalizeText(calendar?.unavailableReason) || 'construction_calendar_identity_missing',
      identity,
    )
  }
  const normalizedValue = normalizeValue(value)
  if (normalizedValue === null) {
    return unavailableMetric(
      'construction_production_day',
      { ...options, timezone: calendar?.timezone ?? options.timezone },
      'duration_value_missing',
      identity,
    )
  }
  return {
    value: normalizedValue,
    unit: 'construction_production_day',
    calendarRef: normalizeText(calendar?.calendarRef) || null,
    calendarVersion: normalizeText(calendar?.calendarVersion) || null,
    timezone: normalizeText(calendar?.timezone) || normalizeText(options.timezone) || DEFAULT_DURATION_TIMEZONE,
    asOf: normalizeAsOf(options.asOf),
    availability: 'available',
    unavailableReason: null,
  }
}

export function businessDateKey(value: Date, timezone = DEFAULT_DURATION_TIMEZONE) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(value)
}
