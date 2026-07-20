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
