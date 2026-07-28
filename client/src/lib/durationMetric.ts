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
  p20Duration: DurationMetricDto | null
  p50Duration: DurationMetricDto | null
  p80Duration: DurationMetricDto | null
  reserveDuration: DurationMetricDto | null
  source: string | null
  scope: string | null
  sampleCount: number | null
  generatedAt: string | null
  sourceAsOf: string | null
  availability: DurationMetricAvailability
  unavailableReason: string | null
}

function normalizeDateOnly(value: unknown) {
  const text = typeof value === 'string' ? value.trim() : ''
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return ''
  const [year, month, day] = text.split('-').map(Number)
  const parsed = new Date(Date.UTC(year, month - 1, day))
  return parsed.getUTCFullYear() === year
    && parsed.getUTCMonth() === month - 1
    && parsed.getUTCDate() === day
    ? text
    : ''
}

export function normalizeDurationMetricDto(value: unknown): DurationMetricDto | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const raw = value as Record<string, unknown>
  const unit = raw.unit
  const availability = raw.availability
  if (unit !== 'calendar_day' && unit !== 'construction_production_day') return null
  if (availability !== 'available' && availability !== 'unavailable') return null
  const parsedValue = raw.value === null ? null : Number(raw.value)
  if (availability === 'available' && (parsedValue === null || !Number.isFinite(parsedValue))) return null
  const calendarRef = typeof raw.calendarRef === 'string' && raw.calendarRef.trim() ? raw.calendarRef.trim() : null
  const calendarVersion = typeof raw.calendarVersion === 'string' && raw.calendarVersion.trim() ? raw.calendarVersion.trim() : null
  if (availability === 'available' && (!calendarRef || !calendarVersion)) return null
  const timezone = typeof raw.timezone === 'string' ? raw.timezone.trim() : ''
  const asOf = normalizeDateOnly(raw.asOf)
  if (!timezone || !asOf) return null
  return {
    value: availability === 'available' ? parsedValue : null,
    unit,
    calendarRef,
    calendarVersion,
    timezone,
    asOf,
    availability,
    unavailableReason: typeof raw.unavailableReason === 'string' && raw.unavailableReason.trim()
      ? raw.unavailableReason.trim()
      : null,
  }
}

const STRICT_RFC3339_TIMESTAMP_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T([01]\d|2[0-3]):([0-5]\d):([0-5]\d)(?:\.(\d{1,6}))?(Z|[+-](?:0\d|1[0-4]):[0-5]\d)$/

function normalizeTimestamp(value: unknown) {
  if (typeof value !== 'string') return null
  const match = STRICT_RFC3339_TIMESTAMP_PATTERN.exec(value)
  if (!match) return null
  const [, yearText, monthText, dayText, hourText, minuteText, secondText, fractionText = '', timezoneText] = match
  const year = Number(yearText)
  const month = Number(monthText)
  const day = Number(dayText)
  const hour = Number(hourText)
  const minute = Number(minuteText)
  const second = Number(secondText)
  const millisecond = Number(`${fractionText}000`.slice(0, 3))
  if (month < 1 || month > 12 || day < 1 || day > new Date(Date.UTC(year, month, 0)).getUTCDate()) return null
  if ((timezoneText.startsWith('+14:') || timezoneText.startsWith('-14:')) && !timezoneText.endsWith(':00')) return null
  const parsed = new Date(value)
  if (!Number.isFinite(parsed.getTime())) return null
  const localShape = new Date(Date.UTC(year, month - 1, day, hour, minute, second, millisecond))
  if (
    localShape.getUTCFullYear() !== year
    || localShape.getUTCMonth() !== month - 1
    || localShape.getUTCDate() !== day
    || localShape.getUTCHours() !== hour
    || localShape.getUTCMinutes() !== minute
    || localShape.getUTCSeconds() !== second
  ) return null
  return parsed.toISOString()
}

function sameDurationMetricIdentity(left: DurationMetricDto, right: DurationMetricDto) {
  return left.unit === right.unit
    && left.calendarRef === right.calendarRef
    && left.calendarVersion === right.calendarVersion
    && left.timezone === right.timezone
    && left.asOf === right.asOf
}

export function normalizeDurationRiskDistribution(value: unknown): DurationRiskDistributionDto | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const raw = value as Record<string, unknown>
  const availability = raw.availability
  if (availability !== 'available' && availability !== 'unavailable') return null
  const p20Duration = normalizeDurationMetricDto(raw.p20Duration)
  const p50Duration = normalizeDurationMetricDto(raw.p50Duration)
  const p80Duration = normalizeDurationMetricDto(raw.p80Duration)
  const reserveDuration = normalizeDurationMetricDto(raw.reserveDuration)
  const source = typeof raw.source === 'string' && raw.source.trim() ? raw.source.trim() : null
  const scope = typeof raw.scope === 'string' && raw.scope.trim() ? raw.scope.trim() : null
  const sampleCount = typeof raw.sampleCount === 'number'
    && Number.isInteger(raw.sampleCount)
    && raw.sampleCount > 0
    ? raw.sampleCount
    : null
  const generatedAt = normalizeTimestamp(raw.generatedAt)
  const sourceAsOf = normalizeTimestamp(raw.sourceAsOf)
  const unavailableReason = typeof raw.unavailableReason === 'string' && raw.unavailableReason.trim()
    ? raw.unavailableReason.trim()
    : null
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

export function readAvailableDurationValue(
  metric: DurationMetricDto | null | undefined,
  expectedUnit?: DurationMetricUnit,
) {
  if (!metric || metric.availability !== 'available') return null
  if (expectedUnit && metric.unit !== expectedUnit) return null
  if (metric.value === null || !Number.isFinite(metric.value)) return null
  return metric.value
}

export function formatDurationMetric(
  metric: DurationMetricDto | null | undefined,
  options: {
    absolute?: boolean
    expectedUnit?: DurationMetricUnit
    unavailableLabel?: string
  } = {},
) {
  const value = readAvailableDurationValue(metric, options.expectedUnit)
  if (value === null) {
    if (options.unavailableLabel) return options.unavailableLabel
    if (metric?.unit === 'calendar_day') return '日历天口径不可用'
    if (metric?.unit === 'construction_production_day') return '生产日口径不可用'
    return '工期口径不可用'
  }
  const displayValue = options.absolute ? Math.abs(value) : value
  const unitLabel = metric?.unit === 'calendar_day' ? '日历天' : '生产日'
  return `${displayValue} 个${unitLabel}`
}

export function formatDurationRiskReserve(
  distribution: DurationRiskDistributionDto | unknown,
  unavailableLabel = '生产日口径不可用',
) {
  const normalized = normalizeDurationRiskDistribution(distribution)
  const value = readAvailableDurationValue(normalized?.reserveDuration, 'construction_production_day')
  return value === null ? unavailableLabel : `建议预留 ${value} 个生产日`
}
