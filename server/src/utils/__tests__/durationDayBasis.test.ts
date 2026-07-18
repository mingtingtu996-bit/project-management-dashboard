import { describe, expect, it } from 'vitest'

import {
  readCalendarDurationDays,
  readProductionDurationDays,
  resolveDurationDayBasis,
} from '../durationDayBasis.js'

describe('duration day basis', () => {
  it('treats an unlabelled legacy value as calendar days instead of production days', () => {
    const row = { actual_duration: 12 }

    expect(resolveDurationDayBasis(row)).toBe('calendar_day')
    expect(readCalendarDurationDays(row, 'actual')).toBe(12)
    expect(readProductionDurationDays(row, 'actual')).toBeNull()
  })

  it('reads explicit production and calendar values from a governed sample', () => {
    const row = {
      duration_day_basis: 'construction_production_day',
      actual_duration: 9,
      actual_duration_calendar_days: 12,
      actual_duration_production_days: 9,
      planned_duration: 10,
      planned_duration_calendar_days: 13,
      planned_duration_production_days: 10,
    }

    expect(readProductionDurationDays(row, 'actual')).toBe(9)
    expect(readProductionDurationDays(row, 'planned')).toBe(10)
    expect(readCalendarDurationDays(row, 'actual')).toBe(12)
    expect(readCalendarDurationDays(row, 'planned')).toBe(13)
  })

  it('accepts basis metadata during a rolling migration but keeps explicit columns authoritative', () => {
    expect(resolveDurationDayBasis({
      metadata: { duration_day_basis: 'construction_production_day' },
      actual_duration: 7,
    })).toBe('construction_production_day')

    expect(resolveDurationDayBasis({
      duration_day_basis: 'calendar_day',
      metadata: { duration_day_basis: 'construction_production_day' },
    })).toBe('calendar_day')
  })
})
