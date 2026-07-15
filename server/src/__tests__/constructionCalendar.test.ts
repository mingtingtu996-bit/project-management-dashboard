import { describe, expect, it } from 'vitest'

import {
  addConstructionProductionDays,
  countsAsConstructionShutdown,
  isConstructionProductionDay,
  productionDaysBetweenInclusive,
  type ConstructionCalendarContext,
} from '../services/constructionCalendar.js'

const date = (value: string) => new Date(`${value}T00:00:00.000Z`)

describe('constructionCalendar', () => {
  it('counts ordinary weekends as construction production days', () => {
    const saturday = date('2026-05-02')
    const sunday = date('2026-05-03')

    expect(isConstructionProductionDay(saturday)).toBe(true)
    expect(isConstructionProductionDay(sunday)).toBe(true)
    expect(productionDaysBetweenInclusive(date('2026-05-01'), date('2026-05-03'))).toBe(3)
  })

  it('deducts explicit construction shutdown windows but keeps adjusted workdays productive', () => {
    const calendar: ConstructionCalendarContext = {
      basis: 'official_construction_calendar_seed',
      windows: [{
        holidayCode: 'project_shutdown_2026',
        holidayName: 'Project-level construction shutdown',
        startDate: '2026-05-02',
        endDate: '2026-05-04',
        counts_as_construction_shutdown: true,
        adjusted_work_dates: ['2026-05-03'],
      }],
    }

    expect(isConstructionProductionDay(date('2026-05-01'), calendar)).toBe(true)
    expect(isConstructionProductionDay(date('2026-05-02'), calendar)).toBe(false)
    expect(isConstructionProductionDay(date('2026-05-03'), calendar)).toBe(true)
    expect(isConstructionProductionDay(date('2026-05-04'), calendar)).toBe(false)
    expect(productionDaysBetweenInclusive(date('2026-05-01'), date('2026-05-05'), calendar)).toBe(3)
    expect(addConstructionProductionDays(date('2026-05-01'), 3, calendar)).toBe('2026-05-05')
  })

  it('treats Spring Festival as a shutdown window even without an explicit flag', () => {
    const calendar: ConstructionCalendarContext = {
      basis: 'official_construction_calendar_seed',
      windows: [{
        holidayCode: 'spring_festival_2026',
        holidayName: 'Spring Festival construction shutdown',
        startDate: '2026-02-15',
        endDate: '2026-02-17',
        calendarKind: 'statutory_holiday',
      }],
    }

    expect(isConstructionProductionDay(date('2026-02-14'), calendar)).toBe(true)
    expect(isConstructionProductionDay(date('2026-02-15'), calendar)).toBe(false)
    expect(isConstructionProductionDay(date('2026-02-17'), calendar)).toBe(false)
    expect(addConstructionProductionDays(date('2026-02-14'), 2, calendar)).toBe('2026-02-18')
  })

  it('does not deduct climate windows or statutory holidays without shutdown semantics', () => {
    const calendar: ConstructionCalendarContext = {
      basis: 'official_construction_calendar_seed',
      windows: [
        {
          holidayCode: 'plum_rain_2026_forecast',
          holidayName: 'Plum-rain construction calendar window',
          startDate: '2026-06-01',
          endDate: '2026-06-10',
          calendarKind: 'plum_rain_window',
        },
        {
          holidayCode: 'labor_day_2026',
          holidayName: 'Labor Day holiday',
          startDate: '2026-05-01',
          endDate: '2026-05-03',
          calendarKind: 'statutory_holiday',
        },
      ],
    }

    expect(countsAsConstructionShutdown(calendar.windows[0])).toBe(false)
    expect(countsAsConstructionShutdown(calendar.windows[1])).toBe(false)
    expect(productionDaysBetweenInclusive(date('2026-05-01'), date('2026-05-03'), calendar)).toBe(3)
    expect(productionDaysBetweenInclusive(date('2026-06-01'), date('2026-06-03'), calendar)).toBe(3)
  })

  it('lets explicit false flags override derived shutdown names', () => {
    expect(countsAsConstructionShutdown({
      holidayCode: 'spring_festival_2026',
      holidayName: 'Spring Festival construction window for metadata only',
      countsAsConstructionShutdown: false,
    })).toBe(false)
  })
})
