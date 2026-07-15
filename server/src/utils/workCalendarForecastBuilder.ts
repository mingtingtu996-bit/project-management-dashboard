import type { V1474HolidayWindow } from '../seeds/v1474WorkCalendarSeed.js'

export const CONSTRUCTION_CALENDAR_KINDS = [
  'statutory_holiday',
  'compensatory_workday',
  'forecast_calendar_window',
  'spring_festival_remobilization',
  'winter_shutdown',
  'plum_rain_window',
  'hot_summer_window',
  'dust_storm_window',
] as const

export type ConstructionCalendarKind = typeof CONSTRUCTION_CALENDAR_KINDS[number]

function dateTextFromUtc(date: Date) {
  return date.toISOString().slice(0, 10)
}

function addUtcDays(date: Date, days: number) {
  const next = new Date(date)
  next.setUTCDate(next.getUTCDate() + days)
  return next
}

function findChineseCalendarDate(year: number, lunarMonth: number, lunarDay: number) {
  const formatter = new Intl.DateTimeFormat('en-u-ca-chinese', {
    month: 'numeric',
    day: 'numeric',
    timeZone: 'UTC',
  })
  for (let date = new Date(Date.UTC(year, 0, 1)); date.getUTCFullYear() === year; date.setUTCDate(date.getUTCDate() + 1)) {
    const parts = formatter.formatToParts(date)
    const month = Number(parts.find((part) => part.type === 'month')?.value)
    const day = Number(parts.find((part) => part.type === 'day')?.value)
    if (month === lunarMonth && day === lunarDay) return new Date(date)
  }
  return null
}

function centeredForecastWindow(date: Date | null, fallbackStart: string, fallbackEnd: string) {
  if (!date) return { startDate: fallbackStart, endDate: fallbackEnd }
  return {
    startDate: dateTextFromUtc(addUtcDays(date, -1)),
    endDate: dateTextFromUtc(addUtcDays(date, 1)),
  }
}

function annualForecastEvidenceKey(year: number) {
  return `SYSTEM_FORECAST_WORK_CALENDAR_${year}`
}

function annualForecastSourceVersion(year: number) {
  return `system forecast work_calendar ${year}; replaced when State Council notice is published`
}

function forecastRecord(
  year: number,
  input: Pick<V1474HolidayWindow, 'holidayCode' | 'holidayName' | 'month' | 'startDate' | 'endDate' | 'productivity'> & {
    calendarKind?: ConstructionCalendarKind
    sourceClauseRef?: string
    evidenceSourceKeys?: string[]
    confidence?: V1474HolidayWindow['confidence']
  },
): V1474HolidayWindow {
  return {
    holidayCode: input.holidayCode,
    holidayName: input.holidayName,
    year,
    month: input.month,
    startDate: input.startDate,
    endDate: input.endDate,
    adjustedWorkDates: [],
    productivity: input.productivity,
    isCompensatoryWorkday: false,
    adjustmentOrigin: 'system_forecast_until_official_notice',
    calendarKind: input.calendarKind ?? 'forecast_calendar_window',
    sourceStandard: 'system_default',
    sourceVersion: annualForecastSourceVersion(year),
    sourceClauseRef: input.sourceClauseRef ?? `${input.holidayName}: low-confidence planning placeholder, not an official holiday notice`,
    evidenceSourceKeys: input.evidenceSourceKeys ?? [annualForecastEvidenceKey(year)],
    webVerified: true,
    reviewNeeded: true,
    confidence: input.confidence ?? 'low',
  }
}

export function buildForecastWorkCalendarRecords(year: number): V1474HolidayWindow[] {
  if (!Number.isInteger(year) || year < 2026 || year > 2100) {
    throw Object.assign(new Error('Forecast work calendar year is invalid'), { code: 'INVALID_HOLIDAY_YEAR' })
  }
  const springFestival = findChineseCalendarDate(year, 1, 1)
  const springFestivalStart = springFestival ? dateTextFromUtc(addUtcDays(springFestival, -1)) : `${year}-02-01`
  const springFestivalEnd = springFestival ? dateTextFromUtc(addUtcDays(springFestival, 6)) : `${year}-02-14`
  const springFestivalRemobilizationStart = springFestival ? dateTextFromUtc(addUtcDays(springFestival, 7)) : `${year}-02-15`
  const springFestivalRemobilizationEnd = springFestival ? dateTextFromUtc(addUtcDays(springFestival, 20)) : `${year}-02-28`
  const dragonBoat = centeredForecastWindow(
    findChineseCalendarDate(year, 5, 5),
    `${year}-06-01`,
    `${year}-06-03`,
  )
  const midAutumn = centeredForecastWindow(
    findChineseCalendarDate(year, 8, 15),
    `${year}-09-29`,
    `${year}-10-01`,
  )
  const windows: Array<Pick<V1474HolidayWindow, 'holidayCode' | 'holidayName' | 'month' | 'startDate' | 'endDate' | 'productivity'> & {
    calendarKind?: ConstructionCalendarKind
    sourceClauseRef?: string
    confidence?: V1474HolidayWindow['confidence']
  }> = [
    {
      holidayCode: `new_year_day_${year}_forecast`,
      holidayName: `${year} New Year forecast window`,
      month: 1,
      startDate: `${year}-01-01`,
      endDate: `${year}-01-03`,
      productivity: 0.9,
    },
    {
      holidayCode: `spring_festival_${year}_forecast`,
      holidayName: `${year} Spring Festival construction forecast window`,
      month: Number(springFestivalStart.slice(5, 7)),
      startDate: springFestivalStart,
      endDate: springFestivalEnd,
      productivity: 0.35,
      sourceClauseRef: `${year} Spring Festival construction low-productivity forecast from Chinese-calendar New Year; replace after State Council notice.`,
    },
    {
      holidayCode: `spring_festival_${year}_remobilization_forecast`,
      holidayName: `${year} Spring Festival labor remobilization forecast window`,
      month: Number(springFestivalRemobilizationStart.slice(5, 7)),
      startDate: springFestivalRemobilizationStart,
      endDate: springFestivalRemobilizationEnd,
      productivity: 0.4,
      calendarKind: 'spring_festival_remobilization',
      sourceClauseRef: 'Construction labor return-to-site low-productivity buffer after Spring Festival; candidate-only planning window for real project schedules.',
    },
    {
      holidayCode: `qingming_${year}_forecast`,
      holidayName: `${year} Qingming forecast window`,
      month: 4,
      startDate: `${year}-04-03`,
      endDate: `${year}-04-05`,
      productivity: 0.9,
    },
    {
      holidayCode: `labor_day_${year}_forecast`,
      holidayName: `${year} Labor Day forecast window`,
      month: 5,
      startDate: `${year}-05-01`,
      endDate: `${year}-05-05`,
      productivity: 0.84,
    },
    {
      holidayCode: `dragon_boat_${year}_forecast`,
      holidayName: `${year} Dragon Boat Festival forecast window`,
      month: Number(dragonBoat.startDate.slice(5, 7)),
      startDate: dragonBoat.startDate,
      endDate: dragonBoat.endDate,
      productivity: 0.9,
    },
    {
      holidayCode: `mid_autumn_${year}_forecast`,
      holidayName: `${year} Mid-Autumn Festival forecast window`,
      month: Number(midAutumn.startDate.slice(5, 7)),
      startDate: midAutumn.startDate,
      endDate: midAutumn.endDate,
      productivity: 0.9,
    },
    {
      holidayCode: `national_day_${year}_forecast`,
      holidayName: `${year} National Day forecast window`,
      month: 10,
      startDate: `${year}-10-01`,
      endDate: `${year}-10-07`,
      productivity: 0.77,
    },
    {
      holidayCode: `plum_rain_${year}_forecast`,
      holidayName: `${year} Yangtze Delta plum-rain planning window`,
      month: 6,
      startDate: `${year}-06-01`,
      endDate: `${year}-07-15`,
      productivity: 0.97,
      calendarKind: 'plum_rain_window',
      sourceClauseRef: 'Optional climate calendar window for exposed waterproof, facade and earthwork planning; process/weather rules own stronger impacts.',
    },
    {
      holidayCode: `hot_summer_${year}_forecast`,
      holidayName: `${year} hot-summer planning window`,
      month: 7,
      startDate: `${year}-07-15`,
      endDate: `${year}-08-31`,
      productivity: 0.97,
      calendarKind: 'hot_summer_window',
      sourceClauseRef: 'Optional extreme-heat planning window for work-hour rhythm; weather facts own shutdown or process candidates.',
    },
    {
      holidayCode: `north_winter_shutdown_${year}_forecast`,
      holidayName: `${year} severe-cold winter shutdown planning window`,
      month: 12,
      startDate: `${year}-12-15`,
      endDate: `${year}-12-31`,
      productivity: 0.65,
      calendarKind: 'winter_shutdown',
      sourceClauseRef: 'Optional severe-cold regional winter-shutdown placeholder; only applies when regional climate profile indicates winter shutdown risk.',
    },
    {
      holidayCode: `dust_storm_${year}_forecast`,
      holidayName: `${year} northwest dust-storm planning window`,
      month: 4,
      startDate: `${year}-03-15`,
      endDate: `${year}-05-15`,
      productivity: 0.97,
      calendarKind: 'dust_storm_window',
      sourceClauseRef: 'Optional northwest wind-sand planning window; weather facts and project climate tags own actual process candidates.',
    },
  ]

  return windows.map((window) => forecastRecord(year, window))
}
