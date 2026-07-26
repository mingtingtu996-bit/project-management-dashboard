import { beforeEach, describe, expect, it, vi } from 'vitest'

const resolverMocks = vi.hoisted(() => ({
  resolveAlgorithmSeedRecords: vi.fn(),
}))

vi.mock('../services/algorithmSeedResolver.js', () => ({
  resolveAlgorithmSeedRecords: resolverMocks.resolveAlgorithmSeedRecords,
}))

import {
  addConstructionProductionDays,
  countsAsConstructionShutdown,
  effectiveConstructionCalendarBasis,
  effectiveConstructionCalendarWindowCount,
  isAuthoritativeConstructionCalendar,
  isConstructionProductionDay,
  normalizeConstructionCalendarForConsumption,
  productionDaysBetweenInclusive,
  resolveConstructionCalendarContext,
  type ConstructionCalendarContext,
  type ConstructionCalendarWindow,
} from '../services/constructionCalendar.js'

const date = (value: string) => new Date(`${value}T00:00:00.000Z`)

function identifiedCalendar(windows: ConstructionCalendarWindow[]): ConstructionCalendarContext {
  return {
    basis: 'official_construction_calendar_seed',
    windows,
    calendarRef: 'work_calendar',
    calendarVersion: 'calendar-v1',
    timezone: 'Asia/Shanghai',
    availability: 'available',
    unavailableReason: null,
  }
}

describe('constructionCalendar', () => {
  beforeEach(() => {
    resolverMocks.resolveAlgorithmSeedRecords.mockReset()
  })

  it('counts ordinary weekends as construction production days', () => {
    const saturday = date('2026-05-02')
    const sunday = date('2026-05-03')

    expect(isConstructionProductionDay(saturday)).toBe(true)
    expect(isConstructionProductionDay(sunday)).toBe(true)
    expect(productionDaysBetweenInclusive(date('2026-05-01'), date('2026-05-03'))).toBe(3)
  })

  it('deducts explicit construction shutdown windows but keeps adjusted workdays productive', () => {
    const calendar = identifiedCalendar([{
        holidayCode: 'project_shutdown_2026',
        holidayName: 'Project-level construction shutdown',
        startDate: '2026-05-02',
        endDate: '2026-05-04',
        counts_as_construction_shutdown: true,
        adjusted_work_dates: ['2026-05-03'],
      }])

    expect(isConstructionProductionDay(date('2026-05-01'), calendar)).toBe(true)
    expect(isConstructionProductionDay(date('2026-05-02'), calendar)).toBe(false)
    expect(isConstructionProductionDay(date('2026-05-03'), calendar)).toBe(true)
    expect(isConstructionProductionDay(date('2026-05-04'), calendar)).toBe(false)
    expect(productionDaysBetweenInclusive(date('2026-05-01'), date('2026-05-05'), calendar)).toBe(3)
    expect(addConstructionProductionDays(date('2026-05-01'), 3, calendar)).toBe('2026-05-05')
  })

  it('treats Spring Festival as a shutdown window even without an explicit flag', () => {
    const calendar = identifiedCalendar([{
        holidayCode: 'spring_festival_2026',
        holidayName: 'Spring Festival construction shutdown',
        startDate: '2026-02-15',
        endDate: '2026-02-17',
        calendarKind: 'statutory_holiday',
      }])

    expect(isConstructionProductionDay(date('2026-02-14'), calendar)).toBe(true)
    expect(isConstructionProductionDay(date('2026-02-15'), calendar)).toBe(false)
    expect(isConstructionProductionDay(date('2026-02-17'), calendar)).toBe(false)
    expect(addConstructionProductionDays(date('2026-02-14'), 2, calendar)).toBe('2026-02-18')
  })

  it('does not deduct climate windows or statutory holidays without shutdown semantics', () => {
    const calendar = identifiedCalendar([
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
      ])

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

  it('does not consume shutdown windows when official calendar identity is unavailable', () => {
    const unavailableCalendar: ConstructionCalendarContext = {
      basis: 'official_construction_calendar_seed',
      windows: [{
        holidayCode: 'unidentified_shutdown',
        startDate: '2026-05-02',
        endDate: '2026-05-04',
        countsAsConstructionShutdown: true,
      }],
      calendarRef: null,
      calendarVersion: null,
      timezone: 'Asia/Shanghai',
      availability: 'unavailable',
      unavailableReason: 'construction_calendar_identity_missing',
    }

    expect(isConstructionProductionDay(date('2026-05-02'), unavailableCalendar)).toBe(true)
    expect(productionDaysBetweenInclusive(
      date('2026-05-01'),
      date('2026-05-05'),
      unavailableCalendar,
    )).toBe(5)
  })

  it('downgrades resolver windows without a stable version identity to unavailable calendar-day context', async () => {
    resolverMocks.resolveAlgorithmSeedRecords.mockResolvedValueOnce([{
      holidayCode: 'unversioned_shutdown',
      startDate: '2026-05-02',
      endDate: '2026-05-04',
      countsAsConstructionShutdown: true,
      __resolverVersionId: null,
    }])

    await expect(resolveConstructionCalendarContext({ projectId: 'project-1' })).resolves.toEqual({
      basis: 'calendar_day',
      windows: [],
      calendarRef: null,
      calendarVersion: null,
      timezone: 'Asia/Shanghai',
      availability: 'unavailable',
      unavailableReason: 'construction_calendar_identity_missing',
    })
  })

  it('preserves versioned resolver windows as an identified official calendar', async () => {
    resolverMocks.resolveAlgorithmSeedRecords.mockResolvedValueOnce([{
      holidayCode: 'versioned_shutdown',
      startDate: '2026-05-02',
      endDate: '2026-05-04',
      countsAsConstructionShutdown: true,
      __resolverVersionId: 'calendar-v2',
    }])

    await expect(resolveConstructionCalendarContext({ projectId: 'project-1' })).resolves.toEqual(expect.objectContaining({
      basis: 'official_construction_calendar_seed',
      windows: [expect.objectContaining({ holidayCode: 'versioned_shutdown' })],
      calendarRef: 'work_calendar',
      calendarVersion: 'calendar-v2',
      timezone: 'Asia/Shanghai',
      availability: 'available',
      unavailableReason: null,
    }))
  })

  it('requires the complete availability and identity tuple before treating a calendar as authoritative', () => {
    const calendar = identifiedCalendar([])

    expect(isAuthoritativeConstructionCalendar(calendar)).toBe(true)
    expect(isAuthoritativeConstructionCalendar({ ...calendar, availability: undefined })).toBe(false)
    expect(isAuthoritativeConstructionCalendar({ ...calendar, calendarRef: null })).toBe(false)
    expect(isAuthoritativeConstructionCalendar({ ...calendar, calendarVersion: null })).toBe(false)
    expect(isAuthoritativeConstructionCalendar({ ...calendar, timezone: null })).toBe(false)
  })

  it('normalizes a forged official basis to an unavailable calendar-day context', () => {
    const normalized = normalizeConstructionCalendarForConsumption({
      ...identifiedCalendar([{
        holidayCode: 'forged_shutdown',
        startDate: '2026-05-02',
        endDate: '2026-05-04',
        countsAsConstructionShutdown: true,
      }]),
      availability: 'unavailable',
      unavailableReason: 'calendar_identity_revoked',
    })

    expect(normalized).toEqual({
      basis: 'calendar_day',
      windows: [],
      calendarRef: null,
      calendarVersion: null,
      timezone: 'Asia/Shanghai',
      availability: 'unavailable',
      unavailableReason: 'calendar_identity_revoked',
    })
    expect(effectiveConstructionCalendarBasis(normalized)).toBe('calendar_day')
    expect(effectiveConstructionCalendarWindowCount(normalized)).toBe(0)
  })
})
