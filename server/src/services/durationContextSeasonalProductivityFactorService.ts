import {
  deriveSeasonalProductivityRegionFromResolver,
  hasV1474WorkCalendarForYear,
  resolveV1474HolidayWindow,
  resolveV1474SeasonalProductivity,
} from './algorithmSeedResolver.js'
import {
  resolveProjectClimateRegion,
  type ProjectClimateRegionResult,
} from './projectClimateRegionReadModelService.js'
import type {
  DurationContextFactor,
  DurationContextInput,
} from '../types/durationContext.js'

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

function normalizeDate(value: unknown) {
  const text = normalizeText(value)
  if (!text) return null
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : text.slice(0, 10)
}

function readNumber(value: unknown, fallback: number) {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

function parseDate(value: unknown) {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value
  const normalized = normalizeDate(value)
  if (!normalized) return null
  const parsed = new Date(`${normalized}T00:00:00.000Z`)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function isSpringFestivalHoliday(record: Record<string, unknown> | null | undefined) {
  if (!record) return false
  const code = normalizeText(record.holidayCode ?? record.holiday_code ?? record.stableCode).toLowerCase()
  const name = normalizeText(record.holidayName ?? record.holiday_name).toLowerCase()
  return code.includes('spring_festival')
    || code.includes('chunjie')
    || name.includes('spring festival')
    || name.includes('春节')
}

function deriveSeasonalProductivityRegionFromClimate(climateRegion: ProjectClimateRegionResult) {
  return deriveSeasonalProductivityRegionFromResolver({
    thermalZone: climateRegion.thermalZone,
    regionCode: climateRegion.regionCode,
    climateTags: climateRegion.climateTags,
    location: climateRegion.location,
  })
}

export async function buildSeasonalFactor(input: DurationContextInput): Promise<DurationContextFactor | null> {
  const start = parseDate(input.plannedStartDate)
  if (!start) return null
  const month = start.getUTCMonth() + 1
  const plannedDate = start.toISOString().slice(0, 10)
  const year = start.getUTCFullYear()
  const seedContext = { projectId: input.projectId }
  const climateRegion = await resolveProjectClimateRegion(input.projectId)
  const seasonalRegion = deriveSeasonalProductivityRegionFromClimate(climateRegion)
  const seasonal = await resolveV1474SeasonalProductivity(seasonalRegion, month, seedContext)
  if (!seasonal) return null

  const holidayCalendarAvailable = await hasV1474WorkCalendarForYear(year, seedContext)
  const holiday = holidayCalendarAvailable
    ? await resolveV1474HolidayWindow({ date: plannedDate, year, month }, seedContext)
    : null
  if (isSpringFestivalHoliday(holiday as Record<string, unknown> | null)) {
    const holidayProductivity = clamp(readNumber((holiday as Record<string, unknown>).productivity, 0.4), 0.3, 1)
    return {
      key: 'seasonal_productivity',
      label: '春节停工窗口',
      multiplier: clamp(1 / holidayProductivity, 1, 2.5),
      extraDays: 0,
      confidenceDelta: 0,
      actionPolicy: 'auto_apply',
      dataDependencies: ['algorithm_seed_records.work_calendar'],
      reason: 'Plan dates hit a Spring Festival shutdown or restart window; candidate low-productivity impact should be confirmed with actual workforce return and site organization.',
      source: 'v1.4.7.4_seed',
      metadata: {
        plannedDate,
        year,
        month,
        climateRegion: climateRegion.regionCode,
        thermalZone: climateRegion.thermalZone,
        seasonalProductivityRegion: seasonalRegion,
        climateRegionSource: climateRegion.source,
        climateRegionReason: climateRegion.reason,
        holidayCalendarAvailable,
        holidayCode: holiday?.holidayCode ?? null,
        calendarKind: holiday?.calendarKind ?? (holiday as Record<string, unknown> | null)?.calendar_kind ?? null,
        productivity: holidayProductivity,
        holidayResolverSource: holiday?.__resolverSource ?? null,
        calendarInterpretation: 'construction_productivity_calendar',
        sourceEntityKeys: holiday?.holidayCode ? [`holiday_window:${holiday.holidayCode}`] : [],
      },
    }
  }
  const productivity = holiday ? Math.min(seasonal.productivity, holiday.productivity) : seasonal.productivity
  if (productivity >= 0.98 && holidayCalendarAvailable && climateRegion.confidence !== 'low') return null

  if (productivity >= 0.98 && !holidayCalendarAvailable) {
    return {
      key: 'calendar_missing',
      label: '官方日历缺失',
      multiplier: 1,
      extraDays: 0,
      confidenceDelta: -5,
      actionPolicy: 'confidence_only',
      dataDependencies: ['algorithm_seed_records.work_calendar'],
      reason: 'Official calendar seed is missing for the plan year; the system only lowers confidence and does not reuse an old-year calendar.',
      source: 'v1.4.7.4_seed',
      metadata: {
        plannedDate,
        year,
        month,
        climateRegion: climateRegion.regionCode,
        thermalZone: climateRegion.thermalZone,
        seasonalProductivityRegion: seasonalRegion,
        climateRegionSource: climateRegion.source,
        climateRegionReason: climateRegion.reason,
        embeddedUnderFactor: 'seasonal_productivity',
        forecastOnlySubRule: 'calendar_missing',
        runtimeAuthority: 'confidence_only',
        governancePath: 'duration_context_governance.factor_consumption_matrix.calendar_missing',
      },
    }
  }

  if (productivity >= 0.98 && climateRegion.confidence === 'low') {
    return {
      key: 'seasonal_productivity',
      label: '地区气候画像置信度不足',
      multiplier: 1,
      extraDays: 0,
      confidenceDelta: -5,
      actionPolicy: 'confidence_only',
      dataDependencies: ['project_climate_profiles', 'algorithm_seed_records.regional_climate_rules', 'algorithm_seed_records.seasonal_productivity'],
      reason: 'Project climate profile confidence is insufficient; the system does not adjust duration and only lowers confidence.',
      source: 'v1.4.7.4_seed',
      metadata: {
        plannedDate,
        year,
        month,
        productivity,
        climateRegion: climateRegion.regionCode,
        thermalZone: climateRegion.thermalZone,
        seasonalProductivityRegion: seasonalRegion,
        climateRegionSource: climateRegion.source,
        climateRegionReason: climateRegion.reason,
        holidayCalendarAvailable,
        resolverSource: seasonal.__resolverSource,
      },
    }
  }

  return {
    key: 'seasonal_productivity',
    label: '季节产能影响',
    multiplier: clamp(1 / productivity, 1, 1.35),
    extraDays: 0,
    confidenceDelta: seasonal.confidence === 'low' || climateRegion.confidence === 'low' || !holidayCalendarAvailable ? -5 : 0,
    actionPolicy: 'auto_apply',
    dataDependencies: ['algorithm_seed_records.seasonal_productivity', 'project_climate_profiles', 'algorithm_seed_records.work_calendar'],
    reason: holiday
      ? 'Plan dates hit a holiday or low-productivity window; reference duration has been adjusted by site rhythm.'
      : !holidayCalendarAvailable
        ? 'Plan dates are in a seasonal low-productivity month, but official calendar seed is missing; only seasonal productivity is applied with lower confidence.'
        : 'Plan dates are in a seasonal low-productivity month; reference duration has been adjusted by site rhythm.',
    source: 'v1.4.7.4_seed',
    metadata: {
      plannedDate,
      year,
      month,
      productivity,
      climateRegion: climateRegion.regionCode,
      thermalZone: climateRegion.thermalZone,
      seasonalProductivityRegion: seasonalRegion,
      climateRegionSource: climateRegion.source,
      climateRegionReason: climateRegion.reason,
      holidayCalendarAvailable,
      holidayCode: holiday?.holidayCode ?? null,
      calendarKind: holiday?.calendarKind ?? (holiday as Record<string, unknown> | null)?.calendar_kind ?? null,
      resolverSource: seasonal.__resolverSource,
      holidayResolverSource: holiday?.__resolverSource ?? null,
    },
  }
}
