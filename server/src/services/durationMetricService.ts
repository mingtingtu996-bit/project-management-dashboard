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

export type DurationRiskDistributionDto = {
  p20Duration: DurationMetricDto
  p50Duration: DurationMetricDto
  p80Duration: DurationMetricDto
  reserveDuration: DurationMetricDto
  source: string | null
  scope: string | null
  sampleCount: number | null
  generatedAt: string | null
  sourceAsOf: string | null
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

function sameDurationMetricIdentity(left: DurationMetricDto, right: DurationMetricDto) {
  return left.unit === right.unit
    && left.calendarRef === right.calendarRef
    && left.calendarVersion === right.calendarVersion
    && left.timezone === right.timezone
    && left.asOf === right.asOf
}

export function normalizeDurationRiskDistributionDto(value: unknown): DurationRiskDistributionDto | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const raw = value as Record<string, unknown>
  const availability = raw.availability
  if (availability !== 'available' && availability !== 'unavailable') return null

  const p20Duration = normalizeDurationMetricDto(raw.p20Duration)
  const p50Duration = normalizeDurationMetricDto(raw.p50Duration)
  const p80Duration = normalizeDurationMetricDto(raw.p80Duration)
  const reserveDuration = normalizeDurationMetricDto(raw.reserveDuration)
  const source = normalizeText(raw.source) || null
  const scope = normalizeText(raw.scope) || null
  const rawSampleCount = Number(raw.sampleCount)
  const sampleCount = Number.isInteger(rawSampleCount) && rawSampleCount > 0 ? rawSampleCount : null
  const generatedAt = normalizeTimestamp(raw.generatedAt) || null
  const sourceAsOf = normalizeTimestamp(raw.sourceAsOf) || null
  const unavailableReason = normalizeText(raw.unavailableReason) || null

  if (availability === 'unavailable') {
    if (!p20Duration || !p50Duration || !p80Duration || !reserveDuration) return null
    if ([p20Duration, p50Duration, p80Duration, reserveDuration].some((metric) => metric.availability !== 'unavailable')) return null
    return {
      p20Duration,
      p50Duration,
      p80Duration,
      reserveDuration,
      source,
      scope,
      sampleCount,
      generatedAt,
      sourceAsOf,
      availability,
      unavailableReason,
    }
  }

  if (!source || !scope || !generatedAt || !sourceAsOf) return null
  if (source === 'duration_benchmarks' && sampleCount === null) return null
  if (!p20Duration || !p50Duration || !p80Duration || !reserveDuration) return null
  const requiredMetrics = [p20Duration, p50Duration, p80Duration, reserveDuration]
  if (requiredMetrics.some((metric) => (
    metric.availability !== 'available'
    || metric.unit !== 'construction_production_day'
  ))) return null
  if (!sameDurationMetricIdentity(p50Duration, p80Duration) || !sameDurationMetricIdentity(p50Duration, reserveDuration)) return null
  if (!sameDurationMetricIdentity(p50Duration, p20Duration)) return null
  if (p50Duration.asOf !== sourceAsOf.slice(0, 10)) return null

  const p20 = Number(p20Duration.value)
  const p50 = Number(p50Duration.value)
  const p80 = Number(p80Duration.value)
  const reserve = Number(reserveDuration.value)
  if (p20 <= 0 || p50 <= 0 || p80 < p50 || p20 > p50) return null
  if (Math.abs(reserve - Math.max(0, p80 - p50)) > 1e-9) return null

  return {
    p20Duration,
    p50Duration,
    p80Duration,
    reserveDuration,
    source,
    scope,
    sampleCount,
    generatedAt,
    sourceAsOf,
    availability,
    unavailableReason: null,
  }
}

type DurationMetricOptions = {
  asOf: string
  timezone?: string | null
}

type ProductionDurationMetricOptions = DurationMetricOptions & {
  calendar?: ConstructionCalendarContext | null
}

type ProductionDurationRiskDistributionOptions = {
  p20?: number | null
  p50?: number | null
  p80?: number | null
  source?: string | null
  scope?: string | null
  sampleCount?: number | null
  generatedAt?: string | null
  sourceAsOf?: string | null
  calendar?: ConstructionCalendarContext | null
  provenanceAvailability?: 'available' | 'partial' | 'unavailable' | null
  unavailableReason?: string | null
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

const STRICT_RFC3339_TIMESTAMP_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T([01]\d|2[0-3]):([0-5]\d):([0-5]\d)(?:\.(\d{1,6}))?(Z|[+-](?:0\d|1[0-4]):[0-5]\d)$/

function normalizeTimestamp(value: unknown) {
  const text = typeof value === 'string' ? value : ''
  const match = STRICT_RFC3339_TIMESTAMP_PATTERN.exec(text)
  if (!match) return ''
  const [, yearText, monthText, dayText, hourText, minuteText, secondText, fractionText = '', timezoneText] = match
  const year = Number(yearText)
  const month = Number(monthText)
  const day = Number(dayText)
  const hour = Number(hourText)
  const minute = Number(minuteText)
  const second = Number(secondText)
  const millisecond = Number(`${fractionText}000`.slice(0, 3))
  if (month < 1 || month > 12 || day < 1 || day > new Date(Date.UTC(year, month, 0)).getUTCDate()) return ''
  if ((timezoneText.startsWith('+14:') || timezoneText.startsWith('-14:')) && !timezoneText.endsWith(':00')) return ''
  const parsed = new Date(text)
  if (!Number.isFinite(parsed.getTime())) return ''
  const localShape = new Date(Date.UTC(year, month - 1, day, hour, minute, second, millisecond))
  if (
    localShape.getUTCFullYear() !== year
    || localShape.getUTCMonth() !== month - 1
    || localShape.getUTCDate() !== day
    || localShape.getUTCHours() !== hour
    || localShape.getUTCMinutes() !== minute
    || localShape.getUTCSeconds() !== second
  ) return ''
  return parsed.toISOString()
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

export function buildConstructionProductionDayRiskDistribution(
  options: ProductionDurationRiskDistributionOptions,
): DurationRiskDistributionDto {
  const generatedAt = normalizeTimestamp(options.generatedAt) || null
  const sourceAsOf = normalizeTimestamp(options.sourceAsOf) || null
  const metricAsOf = (sourceAsOf ?? generatedAt)?.slice(0, 10) ?? ''
  const source = normalizeText(options.source) || null
  const scope = normalizeText(options.scope) || null
  const sampleCount = Number(options.sampleCount)
  const normalizedSampleCount = Number.isInteger(sampleCount) && sampleCount > 0 ? sampleCount : null
  const sampleCountRequired = source === 'duration_benchmarks'
  const p20 = normalizeValue(options.p20)
  const p50 = normalizeValue(options.p50)
  const p80 = normalizeValue(options.p80)
  const requestedReason = normalizeText(options.unavailableReason)
  const invalidReason = options.provenanceAvailability !== 'available'
    ? requestedReason || 'duration_risk_provenance_unavailable'
    : !source
      ? 'duration_risk_source_missing'
      : !scope
        ? 'duration_risk_scope_missing'
        : sampleCountRequired && normalizedSampleCount === null
          ? 'duration_risk_sample_count_invalid'
          : !generatedAt
            ? 'duration_risk_generated_at_invalid'
            : !sourceAsOf
              ? 'duration_risk_source_as_of_invalid'
              : !hasIdentifiedConstructionCalendar(options.calendar)
                ? normalizeText(options.calendar?.unavailableReason) || 'construction_calendar_identity_missing'
                : p50 === null || p80 === null || p80 < p50
                  ? 'duration_risk_percentiles_invalid'
                  : null

  const metricOptions = {
    asOf: metricAsOf,
    timezone: options.calendar?.timezone,
    calendar: options.calendar,
  }
  if (invalidReason) {
    const unavailableCalendar: ConstructionCalendarContext = {
      basis: 'calendar_day',
      windows: [],
      calendarRef: options.calendar?.calendarRef ?? null,
      calendarVersion: options.calendar?.calendarVersion ?? null,
      timezone: options.calendar?.timezone ?? DEFAULT_DURATION_TIMEZONE,
      availability: 'unavailable',
      unavailableReason: invalidReason,
    }
    const unavailableOptions = { ...metricOptions, calendar: unavailableCalendar }
    return {
      p20Duration: buildConstructionProductionDayDurationMetric(null, unavailableOptions),
      p50Duration: buildConstructionProductionDayDurationMetric(null, unavailableOptions),
      p80Duration: buildConstructionProductionDayDurationMetric(null, unavailableOptions),
      reserveDuration: buildConstructionProductionDayDurationMetric(null, unavailableOptions),
      source,
      scope,
      sampleCount: normalizedSampleCount,
      generatedAt,
      sourceAsOf,
      availability: 'unavailable',
      unavailableReason: invalidReason,
    }
  }

  return {
    p20Duration: buildConstructionProductionDayDurationMetric(p20, metricOptions),
    p50Duration: buildConstructionProductionDayDurationMetric(p50, metricOptions),
    p80Duration: buildConstructionProductionDayDurationMetric(p80, metricOptions),
    reserveDuration: buildConstructionProductionDayDurationMetric(Math.max(0, p80! - p50!), metricOptions),
    source,
    scope,
    sampleCount: normalizedSampleCount,
    generatedAt,
    sourceAsOf,
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
