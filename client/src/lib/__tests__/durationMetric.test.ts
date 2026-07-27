import { describe, expect, it } from 'vitest'

import {
  formatDurationMetric,
  formatDurationRiskReserve,
  normalizeDurationMetricDto,
  normalizeDurationRiskDistribution,
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
    expect(formatDurationMetric(
      { ...productionMetric, unit: 'calendar_day' },
      { expectedUnit: 'construction_production_day', unavailableLabel: '生产日口径不可用' },
    )).toBe('生产日口径不可用')
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

  it('strictly rejects impossible asOf dates while accepting leap day', () => {
    expect(normalizeDurationMetricDto({ ...productionMetric, asOf: '2026-02-30' })).toBeNull()
    expect(normalizeDurationMetricDto({ ...productionMetric, asOf: '2026-99-01' })).toBeNull()
    expect(normalizeDurationMetricDto({ ...productionMetric, asOf: '2024-02-29' })).toEqual(
      expect.objectContaining({ asOf: '2024-02-29', availability: 'available' }),
    )
  })

  it('normalizes and formats a server-computed production-day risk reserve', () => {
    const distribution = {
      p20Duration: { ...productionMetric, value: 15, asOf: '2026-06-30' },
      p50Duration: { ...productionMetric, value: 18, asOf: '2026-06-30' },
      p80Duration: { ...productionMetric, value: 24, asOf: '2026-06-30' },
      reserveDuration: { ...productionMetric, value: 6, asOf: '2026-06-30' },
      source: 'duration_benchmarks',
      scope: 'company',
      sampleCount: 24,
      generatedAt: '2026-07-01T08:00:00.000Z',
      sourceAsOf: '2026-06-30T23:59:59.000Z',
      availability: 'available',
      unavailableReason: null,
    } as const

    expect(normalizeDurationRiskDistribution(distribution)).toEqual(expect.objectContaining({
      availability: 'available',
      reserveDuration: expect.objectContaining({ value: 6 }),
    }))
    expect(formatDurationRiskReserve(distribution)).toBe('建议预留 6 个生产日')
    expect(normalizeDurationRiskDistribution({
      ...distribution,
      reserveDuration: { ...productionMetric, value: 60, asOf: '2026-06-30' },
    })).toBeNull()
  })

  it('accepts a system-asset risk distribution without fabricating a history sample count', () => {
    const metric = { ...productionMetric, asOf: '2026-07-20' }
    const distribution = {
      p20Duration: { ...metric, value: 15 },
      p50Duration: { ...metric, value: 18 },
      p80Duration: { ...metric, value: 24 },
      reserveDuration: { ...metric, value: 6 },
      source: 'system_standard_duration_asset',
      scope: 'system',
      sampleCount: null,
      generatedAt: '2026-07-21T08:00:00.000Z',
      sourceAsOf: '2026-07-20T00:00:00.000Z',
      availability: 'available',
      unavailableReason: null,
    }

    expect(normalizeDurationRiskDistribution(distribution)).toEqual(expect.objectContaining({
      availability: 'available',
      sampleCount: null,
    }))
  })
})
