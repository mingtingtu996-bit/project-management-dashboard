import { describe, expect, it } from 'vitest'

import { daysUntilLocalDate, elapsedLocalDaysSince, normalizeLocalDateMidnight } from '../dateDistance'

describe('dateDistance', () => {
  it('counts date-only due dates by local calendar day', () => {
    const today = new Date(2026, 4, 1, 23, 30)

    expect(daysUntilLocalDate('2026-05-01', today)).toBe(0)
    expect(daysUntilLocalDate('2026-05-02', today)).toBe(1)
    expect(daysUntilLocalDate('2026-04-30', today)).toBe(-1)
  })

  it('normalizes Date values to local midnight before comparing day distance', () => {
    const today = new Date(2026, 4, 1, 8, 15)
    const target = new Date(2026, 4, 3, 21, 45)

    expect(normalizeLocalDateMidnight(target)?.getHours()).toBe(0)
    expect(daysUntilLocalDate(target, today)).toBe(2)
  })

  it('counts elapsed item age by local calendar boundaries instead of elapsed milliseconds', () => {
    const today = new Date(2026, 4, 2, 0, 10)
    const createdLateYesterday = new Date(2026, 4, 1, 23, 50)

    expect(elapsedLocalDaysSince(createdLateYesterday, today)).toBe(1)
    expect(elapsedLocalDaysSince(new Date(2026, 4, 2, 0, 5), today)).toBe(0)
  })

  it('returns null for missing or invalid dates', () => {
    expect(daysUntilLocalDate(null, new Date(2026, 4, 1))).toBeNull()
    expect(daysUntilLocalDate('not-a-date', new Date(2026, 4, 1))).toBeNull()
    expect(normalizeLocalDateMidnight('2026-02-31')).toBeNull()
  })
})
