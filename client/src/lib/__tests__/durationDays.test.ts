import { describe, expect, it } from 'vitest'

import { inclusiveDurationDays, normalizeDurationDateUtc } from '../durationDays'

describe('durationDays', () => {
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

  it('returns null for missing or invalid dates', () => {
    expect(inclusiveDurationDays(null, '2026-04-01')).toBeNull()
    expect(inclusiveDurationDays('not-a-date', '2026-04-01')).toBeNull()
  })

  it('normalizes Date values to UTC date boundaries', () => {
    expect(normalizeDurationDateUtc(new Date('2026-04-01T23:30:00.000Z'))?.toISOString()).toBe('2026-04-01T00:00:00.000Z')
  })
})
