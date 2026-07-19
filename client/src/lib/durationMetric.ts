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
    unavailableLabel?: string
  } = {},
) {
  const value = readAvailableDurationValue(metric)
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
