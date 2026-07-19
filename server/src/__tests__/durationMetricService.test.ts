import { describe, expect, it } from 'vitest'

import {
  buildCalendarDayDurationMetric,
  buildConstructionProductionDayDurationMetric,
} from '../services/durationMetricService.js'

describe('durationMetricService', () => {
  it('builds an identified calendar-day metric with an explicit as-of date', () => {
    expect(buildCalendarDayDurationMetric(30, {
      asOf: '2026-07-20',
      timezone: 'Asia/Shanghai',
    })).toEqual({
      value: 30,
      unit: 'calendar_day',
      calendarRef: 'gregorian',
      calendarVersion: 'ISO-8601',
      timezone: 'Asia/Shanghai',
      asOf: '2026-07-20',
      availability: 'available',
      unavailableReason: null,
    })
  })

  it('fails closed when a production-day value lacks calendar identity', () => {
    expect(buildConstructionProductionDayDurationMetric(4, {
      asOf: '2026-07-20',
      timezone: 'Asia/Shanghai',
      calendar: { basis: 'calendar_day', windows: [] },
    })).toEqual(expect.objectContaining({
      value: null,
      unit: 'construction_production_day',
      calendarRef: null,
      calendarVersion: null,
      asOf: '2026-07-20',
      availability: 'unavailable',
      unavailableReason: 'construction_calendar_identity_missing',
    }))
  })

  it('preserves production-day calendar identity when the metric is available', () => {
    expect(buildConstructionProductionDayDurationMetric(-3, {
      asOf: '2026-07-20',
      timezone: 'Asia/Shanghai',
      calendar: {
        basis: 'official_construction_calendar_seed',
        windows: [],
        calendarRef: 'work_calendar',
        calendarVersion: 'calendar-v1',
        timezone: 'Asia/Shanghai',
        availability: 'available',
        unavailableReason: null,
      },
    })).toEqual(expect.objectContaining({
      value: -3,
      unit: 'construction_production_day',
      calendarRef: 'work_calendar',
      calendarVersion: 'calendar-v1',
      timezone: 'Asia/Shanghai',
      asOf: '2026-07-20',
      availability: 'available',
      unavailableReason: null,
    }))
  })

  it('accepts a real leap day as a strict date-only as-of value', () => {
    expect(buildCalendarDayDurationMetric(1, {
      asOf: '2028-02-29',
      timezone: 'Asia/Shanghai',
    })).toEqual(expect.objectContaining({
      value: 1,
      asOf: '2028-02-29',
      availability: 'available',
    }))
  })

  it.each(['2026-99-99', '2026-02-30', '2026-04-31'])('fails closed for invalid date-only as-of %s', (asOf) => {
    expect(buildCalendarDayDurationMetric(1, {
      asOf,
      timezone: 'Asia/Shanghai',
    })).toEqual(expect.objectContaining({
      value: null,
      asOf: '',
      availability: 'unavailable',
      unavailableReason: 'as_of_missing',
    }))
  })
})
