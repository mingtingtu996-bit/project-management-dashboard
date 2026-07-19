import { describe, expect, it } from 'vitest'

import {
  formatDurationMetric,
  readAvailableDurationValue,
  type DurationMetricDto,
} from '../durationMetric'

const productionMetric: DurationMetricDto = {
  value: -4,
  unit: 'construction_production_day',
  calendarRef: 'work_calendar',
  calendarVersion: 'calendar-v1',
  timezone: 'Asia/Shanghai',
  asOf: '2026-07-20',
  availability: 'available',
  unavailableReason: null,
}

describe('durationMetric', () => {
  it('formats only the unit carried by an available DTO', () => {
    expect(formatDurationMetric(productionMetric)).toBe('-4 个生产日')
    expect(formatDurationMetric(productionMetric, { absolute: true })).toBe('4 个生产日')
    expect(readAvailableDurationValue(productionMetric, 'construction_production_day')).toBe(-4)
    expect(readAvailableDurationValue(productionMetric, 'calendar_day')).toBeNull()
  })

  it('renders an explicit unavailable state and never guesses a numeric unit', () => {
    const unavailable: DurationMetricDto = {
      ...productionMetric,
      value: null,
      calendarRef: null,
      calendarVersion: null,
      availability: 'unavailable',
      unavailableReason: 'construction_calendar_identity_missing',
    }

    expect(formatDurationMetric(unavailable)).toBe('生产日口径不可用')
    expect(formatDurationMetric(null)).toBe('工期口径不可用')
    expect(readAvailableDurationValue(unavailable, 'construction_production_day')).toBeNull()
  })

  it('uses 日历天 for natural-day windows', () => {
    expect(formatDurationMetric({
      ...productionMetric,
      value: 30,
      unit: 'calendar_day',
      calendarRef: 'gregorian',
      calendarVersion: 'ISO-8601',
    })).toBe('30 个日历天')
  })
})
