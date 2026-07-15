import { describe, expect, it } from 'vitest'

import {
  calendarDaysToMilliseconds,
  delayDayDelta,
  inclusiveDurationDays,
  normalizeDateOnlyText,
  normalizeDurationDateUtc,
  orderedInclusiveDurationDays,
  signedDurationDayDelta,
} from '../durationDays.js'

describe('durationDays utilities', () => {
  it('converts bounded calendar-day infrastructure windows to milliseconds', () => {
    expect(calendarDaysToMilliseconds(1)).toBe(86_400_000)
    expect(calendarDaysToMilliseconds(14)).toBe(1_209_600_000)
    expect(calendarDaysToMilliseconds(-1)).toBe(0)
    expect(calendarDaysToMilliseconds(Number.NaN)).toBe(0)
  })

  it('returns one day for same-day inclusive duration', () => {
    expect(inclusiveDurationDays('2026-04-01', '2026-04-01')).toBe(1)
  })

  it('counts inclusive day ranges with UTC midnight normalization', () => {
    expect(inclusiveDurationDays('2026-04-01', '2026-04-03')).toBe(3)
    expect(inclusiveDurationDays('2026-04-01T15:30:00+08:00', '2026-04-03T03:00:00+08:00')).toBe(3)
  })

  it('clamps reversed ranges to one day', () => {
    expect(inclusiveDurationDays('2026-04-03', '2026-04-01')).toBe(1)
  })

  it('returns null for reversed ordered inclusive ranges', () => {
    expect(orderedInclusiveDurationDays('2026-04-01', '2026-04-03')).toBe(3)
    expect(orderedInclusiveDurationDays('2026-04-03', '2026-04-01')).toBeNull()
    expect(orderedInclusiveDurationDays(null, '2026-04-01')).toBeNull()
  })

  it('returns null for missing or invalid dates', () => {
    expect(inclusiveDurationDays(null, '2026-04-01')).toBeNull()
    expect(inclusiveDurationDays('not-a-date', '2026-04-01')).toBeNull()
  })

  it('normalizes Date values to UTC date boundaries', () => {
    expect(normalizeDurationDateUtc(new Date('2026-04-01T23:30:00.000Z'))?.toISOString()).toBe('2026-04-01T00:00:00.000Z')
  })

  it('preserves local calendar components for database DATE objects', () => {
    expect(normalizeDateOnlyText(new Date(2026, 3, 20))).toBe('2026-04-20')
    expect(normalizeDateOnlyText('2026-04-20T16:00:00.000Z')).toBe('2026-04-20')
    expect(normalizeDateOnlyText('Mon Apr 20')).toBeNull()
  })

  it('returns signed date-only deltas without inclusive duration semantics', () => {
    expect(signedDurationDayDelta('2026-04-10', '2026-04-10')).toBe(0)
    expect(signedDurationDayDelta('2026-04-10', '2026-04-12')).toBe(2)
    expect(signedDurationDayDelta('2026-04-12', '2026-04-10')).toBe(-2)
    expect(signedDurationDayDelta('2026-04-10T23:30:00+08:00', '2026-04-12T00:30:00+08:00')).toBe(2)
    expect(signedDurationDayDelta(null, '2026-04-12')).toBeNull()
  })

  it('keeps date-only duration stable across daylight-saving offset changes', () => {
    expect(orderedInclusiveDurationDays(
      '2026-03-08T00:30:00-05:00',
      '2026-03-09T00:30:00-04:00',
    )).toBe(2)
    expect(signedDurationDayDelta(
      '2026-11-01T00:30:00-04:00',
      '2026-11-02T00:30:00-05:00',
    )).toBe(1)
  })

  it('uses one signed delay helper for calendar-day and shutdown-aware delay semantics', () => {
    const calendar = {
      basis: 'official_construction_calendar_seed' as const,
      windows: [{
        holidayCode: 'project_shutdown_2026',
        holidayName: 'Project shutdown',
        startDate: '2026-05-04',
        endDate: '2026-05-05',
        counts_as_construction_shutdown: true,
      }],
    }

    expect(delayDayDelta('2026-05-03', '2026-05-03')).toBe(0)
    expect(delayDayDelta('2026-05-03', '2026-05-06')).toBe(3)
    expect(delayDayDelta('2026-05-06', '2026-05-03')).toBe(-3)
    expect(delayDayDelta('2026-05-03', '2026-05-06', calendar)).toBe(1)
    expect(delayDayDelta('2026-05-06', '2026-05-03', calendar)).toBe(-1)
  })
})
