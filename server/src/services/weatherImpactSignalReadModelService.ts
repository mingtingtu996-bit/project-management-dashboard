import { logger } from '../middleware/logger.js'
import { normalizeDateOnlyText, signedDurationDayDelta } from '../utils/durationDays.js'
import { supabase } from './dbService.js'

export type WeatherImpactType =
  | 'site_shutdown_event'
  | 'heavy_rain'
  | 'extreme_heat'
  | 'low_temperature'
  | 'wind_warning'
  | 'persistent_humidity'
  | 'snow_ice'
  | 'thunderstorm'
  | 'dust_storm'
export type WeatherImpactSeverity = 'low' | 'medium' | 'high'
export type WeatherSourceReliability =
  | 'official_authorized'
  | 'official_public'
  | 'public_web_reference'
  | 'configured_reference'
  | 'unknown'

export type WeatherForecastImpactRow = {
  id?: string | null
  project_id?: string | null
  forecast_date?: string | null
  min_temp_c?: number | string | null
  max_temp_c?: number | string | null
  precipitation_mm?: number | string | null
  relative_humidity_percent?: number | string | null
  snow_depth_cm?: number | string | null
  wind_level?: string | null
  warning_tags?: string[] | null
  provider?: string | null
  source_url?: string | null
  impact_multiplier_config?: WeatherImpactMultiplierConfig | null
  raw_payload?: Record<string, unknown> | null
}

export type WeatherImpactMultiplierConfig = Partial<Record<WeatherImpactType, Partial<Record<WeatherImpactSeverity, number>>>> & {
  window?: Partial<Record<WeatherImpactType, Partial<Record<WeatherImpactSeverity, number>>>>
}

export type WeatherImpactSignal = {
  impactType: WeatherImpactType
  climateSignal:
    | 'rainy_season'
    | 'summer_heat'
    | 'winter_low_temp'
    | 'wind_warning'
    | 'persistent_humidity'
    | 'snow_ice'
    | 'dust_storm'
    | 'thunderstorm'
  severity: WeatherImpactSeverity
  forecastDate: string
  multiplier: number
  confidenceDelta: number
  sourceReliability: WeatherSourceReliability
  sourceReliabilityScore: number
  actionPolicy: 'candidate_only' | 'confidence_only'
  siteShutdownEvent?: {
    eventType: 'red_rainstorm' | 'red_typhoon' | 'compound_red_weather'
    eventDate: string
    shutdownDays: number
    status: 'candidate'
  }
  reason: string
  evidence: Record<string, unknown>
}

export type WeatherImpactSignalDiagnostics = {
  signals: WeatherImpactSignal[]
  sourceStatus: 'ok' | 'not_configured_or_no_forecast' | 'load_failed'
  confidenceReason?: string
}

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

function normalizeLower(value: unknown) {
  return normalizeText(value).toLowerCase()
}

function normalizeNumber(value: unknown, fallback = 0) {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

function normalizeTags(value: unknown) {
  return Array.isArray(value) ? value.map(normalizeLower).filter(Boolean) : []
}

function tagIncludes(tags: string[], needles: string[]) {
  return tags.some((tag) => needles.some((needle) => tag.includes(needle)))
}

function hasRedRainstormWarning(tags: string[]) {
  return tagIncludes(tags, ['暴雨红色', '红色暴雨', 'red rainstorm', 'rainstorm red', 'severe rainstorm red'])
}

function hasRedTyphoonWarning(tags: string[]) {
  return tagIncludes(tags, ['台风红色', '红色台风', 'typhoon red', 'red typhoon'])
}

function clampConfidenceDelta(value: number) {
  return Math.max(-20, Math.min(0, Math.round(value)))
}

function resolveWeatherSourceCredibility(row: WeatherForecastImpactRow): {
  reliability: WeatherSourceReliability
  score: number
  confidenceDeltaAdjustment: number
  label: string
} {
  const provider = normalizeLower(row.provider)
  const sourceUrl = normalizeLower(row.source_url)

  if (provider.includes('smartweatherapi') || provider.includes('china_weather')) {
    return {
      reliability: 'official_authorized',
      score: 0.95,
      confidenceDeltaAdjustment: 0,
      label: 'authorized_weather_provider',
    }
  }

  if (provider.includes('cma') || sourceUrl.includes('weather.cma.cn') || sourceUrl.includes('cma.gov.cn')) {
    return {
      reliability: 'official_public',
      score: 0.88,
      confidenceDeltaAdjustment: -1,
      label: 'official_public_weather_reference',
    }
  }

  if (provider.includes('open_meteo') || provider.includes('on_demand') || sourceUrl.includes('open-meteo.com')) {
    return {
      reliability: 'public_web_reference',
      score: 0.72,
      confidenceDeltaAdjustment: -4,
      label: 'on_demand_city_weather_reference',
    }
  }

  if (provider.includes('configured') || provider.includes('generic') || sourceUrl) {
    return {
      reliability: 'configured_reference',
      score: 0.65,
      confidenceDeltaAdjustment: -5,
      label: 'configured_weather_reference',
    }
  }

  return {
    reliability: 'unknown',
    score: 0.5,
    confidenceDeltaAdjustment: -6,
    label: 'unknown_weather_reference',
  }
}

function sourceEvidence(row: WeatherForecastImpactRow, credibility: ReturnType<typeof resolveWeatherSourceCredibility>) {
  return {
    sourceForecastId: row.id ?? null,
    provider: row.provider ?? null,
    sourceUrl: row.source_url ?? null,
    weatherSourceReliability: credibility.reliability,
    weatherSourceReliabilityScore: credibility.score,
    weatherSourceCredibilityLabel: credibility.label,
    sourceCredibilityPolicy: 'internal_algorithm_only',
  }
}

export const DEFAULT_WEATHER_IMPACT_MULTIPLIERS: Record<WeatherImpactType, Record<WeatherImpactSeverity, number>> = {
  site_shutdown_event: { low: 1, medium: 1, high: 1 },
  heavy_rain: { low: 1.04, medium: 1.08, high: 1.14 },
  extreme_heat: { low: 1.02, medium: 1.04, high: 1.08 },
  low_temperature: { low: 1.04, medium: 1.06, high: 1.08 },
  wind_warning: { low: 1.03, medium: 1.06, high: 1.12 },
  persistent_humidity: { low: 1.02, medium: 1.04, high: 1.08 },
  snow_ice: { low: 1.04, medium: 1.07, high: 1.12 },
  thunderstorm: { low: 1, medium: 1, high: 1 },
  dust_storm: { low: 1.03, medium: 1.05, high: 1.08 },
}

const WEATHER_IMPACT_MULTIPLIER_VERSION = 'v1.4.7.4-weather-impact-multiplier-config-20260524'

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function normalizeMultiplierConfig(row: WeatherForecastImpactRow): WeatherImpactMultiplierConfig {
  const direct = readRecord(row.impact_multiplier_config)
  const raw = readRecord(row.raw_payload)
  const fromRaw = readRecord(raw.impact_multiplier_config ?? raw.weatherImpactMultiplierConfig ?? raw.weather_impact_multiplier_config)
  return {
    ...fromRaw,
    ...direct,
    window: {
      ...readRecord(fromRaw.window),
      ...readRecord(direct.window),
    },
  } as WeatherImpactMultiplierConfig
}

function clampMultiplier(value: unknown, fallback: number) {
  const number = Number(value)
  if (!Number.isFinite(number) || number <= 0) return fallback
  return Math.max(0.5, Math.min(2.5, Number(number.toFixed(3))))
}

function resolveWeatherImpactMultiplier(
  impactType: WeatherImpactType,
  severity: WeatherImpactSeverity,
  config: WeatherImpactMultiplierConfig = {},
  options: { window?: boolean; defaultMultiplier?: number } = {},
) {
  const defaultMultiplier = options.defaultMultiplier ?? DEFAULT_WEATHER_IMPACT_MULTIPLIERS[impactType]?.[severity] ?? 1
  const scopedConfig = options.window
    ? readRecord(readRecord(config.window)[impactType])
    : readRecord((config as Record<string, unknown>)[impactType])
  const override = scopedConfig[severity]
  const multiplier = clampMultiplier(override, defaultMultiplier)
  return {
    multiplier,
    overrideSource: override === undefined ? null : options.window ? 'row.impact_multiplier_config.window' : 'row.impact_multiplier_config',
  }
}

function multiplierEvidence(overrideSource?: string | null) {
  return {
    multiplierPolicy: 'configurable_weather_impact_multiplier',
    multiplierConfigVersion: WEATHER_IMPACT_MULTIPLIER_VERSION,
    multiplierOverrideSource: overrideSource ?? null,
  }
}

function applySourceCredibility(baseConfidenceDelta: number, credibility: ReturnType<typeof resolveWeatherSourceCredibility>) {
  return clampConfidenceDelta(baseConfidenceDelta + credibility.confidenceDeltaAdjustment)
}

function severityRank(severity: WeatherImpactSeverity) {
  if (severity === 'high') return 3
  if (severity === 'medium') return 2
  return 1
}

function impactScore(signal: WeatherImpactSignal) {
  return (signal.impactType === 'site_shutdown_event' ? 10000 : 0)
    + severityRank(signal.severity) * 100
    + Math.round((signal.multiplier - 1) * 100)
    + Math.abs(signal.confidenceDelta)
}

function applyWeatherMultiplierConfig(
  signals: WeatherImpactSignal[],
  config: WeatherImpactMultiplierConfig,
) {
  return signals.map((signal) => {
    if (signal.impactType === 'site_shutdown_event'
      || readRecord(signal.evidence).shutdownModel === 'owned_by_site_shutdown_event') {
      return {
        ...signal,
        evidence: {
          ...signal.evidence,
          ...multiplierEvidence(null),
        },
      }
    }
    const resolved = resolveWeatherImpactMultiplier(signal.impactType, signal.severity, config, {
      defaultMultiplier: signal.multiplier,
    })
    return {
      ...signal,
      multiplier: resolved.multiplier,
      evidence: {
        ...signal.evidence,
        ...multiplierEvidence(resolved.overrideSource),
      },
    }
  })
}

export function classifyWeatherForecastImpacts(row: WeatherForecastImpactRow): WeatherImpactSignal[] {
  const forecastDate = normalizeText(row.forecast_date)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(forecastDate)) return []

  const tags = normalizeTags(row.warning_tags)
  const precipitation = normalizeNumber(row.precipitation_mm, 0)
  const humidity = normalizeNumber(row.relative_humidity_percent, NaN)
  const snowDepth = normalizeNumber(row.snow_depth_cm, NaN)
  const maxTemp = normalizeNumber(row.max_temp_c, NaN)
  const minTemp = normalizeNumber(row.min_temp_c, NaN)
  const windLevelText = normalizeLower(row.wind_level)
  const signals: WeatherImpactSignal[] = []
  const credibility = resolveWeatherSourceCredibility(row)
  const baseEvidence = sourceEvidence(row, credibility)
  const multiplierConfig = normalizeMultiplierConfig(row)
  const redRainstorm = precipitation >= 100 || hasRedRainstormWarning(tags)
  const redTyphoon = hasRedTyphoonWarning(tags)

  if (redRainstorm || redTyphoon) {
    const eventType = redRainstorm && redTyphoon
      ? 'compound_red_weather'
      : redTyphoon
        ? 'red_typhoon'
        : 'red_rainstorm'
    signals.push({
      impactType: 'site_shutdown_event',
      climateSignal: redTyphoon ? 'wind_warning' : 'rainy_season',
      severity: 'high',
      forecastDate,
      multiplier: 1,
      confidenceDelta: applySourceCredibility(-15, credibility),
      sourceReliability: credibility.reliability,
      sourceReliabilityScore: credibility.score,
      actionPolicy: 'candidate_only',
      siteShutdownEvent: {
        eventType,
        eventDate: forecastDate,
        shutdownDays: 1,
        status: 'candidate',
      },
      reason: 'Red-level weather warning requires an explicit site-wide shutdown candidate instead of stacked productivity multipliers.',
      evidence: {
        precipitationMm: precipitation,
        windLevel: row.wind_level ?? null,
        warningTags: tags,
        sourceForecastId: row.id ?? null,
        shutdownModel: 'site_shutdown_event',
        ...baseEvidence,
      },
    })
  }

  const hasRainWarning = tagIncludes(tags, ['暴雨', '大雨', 'rainstorm', 'heavy_rain', 'rain warning'])
  if (precipitation >= 25 || hasRainWarning) {
    const high = precipitation >= 50 || tagIncludes(tags, ['暴雨红色', 'red rainstorm', 'severe rainstorm'])
    signals.push({
      impactType: 'heavy_rain',
      climateSignal: 'rainy_season',
      severity: redRainstorm || high ? 'high' : 'medium',
      forecastDate,
      multiplier: redRainstorm ? 1 : high ? 1.14 : 1.08,
      confidenceDelta: applySourceCredibility(redRainstorm || high ? -12 : -8, credibility),
      sourceReliability: credibility.reliability,
      sourceReliabilityScore: credibility.score,
      actionPolicy: redRainstorm ? 'confidence_only' : 'candidate_only',
      reason: high
        ? '未来窗口存在强降雨或暴雨预警，外墙、防水、土方、室外管网等任务应进入计划修订候选。'
        : '未来窗口存在明显降雨信号，天气事实优先于静态季节规则进入候选影响。',
      evidence: {
        precipitationMm: precipitation,
        warningTags: tags,
        redRainstormOwnedByShutdownEvent: redRainstorm,
        shutdownModel: redRainstorm ? 'owned_by_site_shutdown_event' : null,
        ...baseEvidence,
      },
    })
  }

  const hasHeatWarning = tagIncludes(tags, ['高温', 'heat', 'hot weather'])
  if ((Number.isFinite(maxTemp) && maxTemp >= 40) || hasHeatWarning) {
    const high = Number.isFinite(maxTemp) && maxTemp >= 40
    signals.push({
      impactType: 'extreme_heat',
      climateSignal: 'summer_heat',
      severity: high ? 'high' : 'medium',
      forecastDate,
      multiplier: high ? 1.08 : 1.04,
      confidenceDelta: applySourceCredibility(high ? -8 : -4, credibility),
      sourceReliability: credibility.reliability,
      sourceReliabilityScore: credibility.score,
      actionPolicy: 'candidate_only',
      reason: high
        ? '未来窗口存在 40℃ 级别高温信号，混凝土养护、外墙涂料和防水卷材等工序应进入计划修订候选。'
        : '未来窗口存在高温预警，按天气事实进入宏观产能候选影响。',
      evidence: { maxTempC: Number.isFinite(maxTemp) ? maxTemp : null, warningTags: tags, ...baseEvidence },
    })
  }

  const hasColdWarning = tagIncludes(tags, ['寒潮', '低温', 'cold wave', 'freeze', 'frost'])
  if ((Number.isFinite(minTemp) && minTemp <= 5) || hasColdWarning) {
    const high = Number.isFinite(minTemp) && minTemp <= 0
    const severe = Number.isFinite(minTemp) && minTemp <= -5
    signals.push({
      impactType: 'low_temperature',
      climateSignal: 'winter_low_temp',
      severity: high || severe ? 'high' : 'medium',
      forecastDate,
      multiplier: severe ? 1.1 : high ? 1.08 : 1.06,
      confidenceDelta: applySourceCredibility(severe ? -10 : high ? -8 : -6, credibility),
      sourceReliability: credibility.reliability,
      sourceReliabilityScore: credibility.score,
      actionPolicy: 'candidate_only',
      reason: '未来窗口存在低温或寒潮信号，混凝土、湿作业、防水材料等任务应进入候选影响。',
      evidence: { minTempC: Number.isFinite(minTemp) ? minTemp : null, warningTags: tags, ...baseEvidence },
    })
  }

  const windLevelNumber = Number((windLevelText.match(/\d+/) ?? [])[0] ?? NaN)
  const hasWindWarning = tagIncludes(tags, ['大风', 'gale', 'strong wind', 'wind warning'])
  if ((Number.isFinite(windLevelNumber) && windLevelNumber >= 6) || hasWindWarning) {
    const high = Number.isFinite(windLevelNumber) && windLevelNumber >= 8
    signals.push({
      impactType: 'wind_warning',
      climateSignal: 'wind_warning',
      severity: high ? 'high' : 'medium',
      forecastDate,
      multiplier: high ? 1.12 : 1.06,
      confidenceDelta: applySourceCredibility(high ? -10 : -6, credibility),
      sourceReliability: credibility.reliability,
      sourceReliabilityScore: credibility.score,
      actionPolicy: 'candidate_only',
      reason: high
        ? '未来窗口存在高等级大风信号，塔吊、吊装、外架、爬架和外立面作业应进入计划修订候选。'
        : '未来窗口存在大风预警，涉及吊装、高处和外立面作业时应进入候选影响。',
      evidence: { windLevel: row.wind_level ?? null, warningTags: tags, ...baseEvidence },
    })
  }

  const hasHumidityWarning = tagIncludes(tags, ['回南天', '潮湿', '湿度', 'humidity', 'damp'])
  if ((Number.isFinite(humidity) && humidity >= 90) || hasHumidityWarning) {
    const high = Number.isFinite(humidity) && humidity >= 95
    signals.push({
      impactType: 'persistent_humidity',
      climateSignal: 'persistent_humidity',
      severity: high ? 'high' : 'medium',
      forecastDate,
      multiplier: high ? 1.08 : 1.04,
      confidenceDelta: applySourceCredibility(high ? -8 : -5, credibility),
      sourceReliability: credibility.reliability,
      sourceReliabilityScore: credibility.score,
      actionPolicy: 'candidate_only',
      reason: high
        ? '未来窗口存在持续高湿或回南天信号，涂料、防水、腻子和抹灰等需进入基面干燥窗口复核。'
        : '未来窗口存在明显高湿信号，应作为涂料、防水和湿作业干燥窗口的候选影响。',
      evidence: { relativeHumidityPercent: Number.isFinite(humidity) ? humidity : null, warningTags: tags, ...baseEvidence },
    })
  }

  const hasSnowWarning = tagIncludes(tags, ['雪', '积雪', 'snow', 'blizzard', 'sleet', 'ice'])
  if ((Number.isFinite(snowDepth) && snowDepth > 0) || hasSnowWarning) {
    const high = (Number.isFinite(snowDepth) && snowDepth >= 5) || tagIncludes(tags, ['暴雪', 'blizzard'])
    signals.push({
      impactType: 'snow_ice',
      climateSignal: 'snow_ice',
      severity: high ? 'high' : 'medium',
      forecastDate,
      multiplier: high ? 1.12 : 1.07,
      confidenceDelta: applySourceCredibility(high ? -12 : -7, credibility),
      sourceReliability: credibility.reliability,
      sourceReliabilityScore: credibility.score,
      actionPolicy: 'candidate_only',
      reason: high
        ? '未来窗口存在积雪或暴雪信号，屋面、高处、道路和室外湿作业应进入计划修订候选。'
        : '未来窗口存在降雪或结冰信号，应作为冬施和室外作业候选影响。',
      evidence: { snowDepthCm: Number.isFinite(snowDepth) ? snowDepth : null, warningTags: tags, ...baseEvidence },
    })
  }

  const hasThunderWarning = tagIncludes(tags, ['雷电', '雷暴', 'thunder', 'lightning'])
  if (hasThunderWarning) {
    signals.push({
      impactType: 'thunderstorm',
      climateSignal: 'thunderstorm',
      severity: 'medium',
      forecastDate,
      multiplier: 1,
      confidenceDelta: applySourceCredibility(-5, credibility),
      sourceReliability: credibility.reliability,
      sourceReliabilityScore: credibility.score,
      actionPolicy: 'confidence_only',
      reason: '未来窗口存在雷电或雷暴信号；该影响通常为小时级停工，当前按置信度和安全提示处理，不直接放大日级工期。',
      evidence: { warningTags: tags, granularityPolicy: 'hourly_safety_signal_not_daily_productivity_multiplier', ...baseEvidence },
    })
  }

  const hasDustWarning = tagIncludes(tags, ['沙尘', '扬沙', 'dust', 'sandstorm'])
  if (hasDustWarning) {
    signals.push({
      impactType: 'dust_storm',
      climateSignal: 'dust_storm',
      severity: 'medium',
      forecastDate,
      multiplier: 1.05,
      confidenceDelta: applySourceCredibility(-6, credibility),
      sourceReliability: credibility.reliability,
      sourceReliabilityScore: credibility.score,
      actionPolicy: 'candidate_only',
      reason: '未来窗口存在沙尘或扬沙信号，西北地区土方、外墙、屋面和测量放线等室外作业应进入候选影响。',
      evidence: { warningTags: tags, ...baseEvidence },
    })
  }

  return applyWeatherMultiplierConfig(signals, multiplierConfig)
    .sort((left, right) => impactScore(right) - impactScore(left))
}

type HumidityWindowCandidate = {
  rows: WeatherForecastImpactRow[]
  dates: string[]
  humidities: number[]
}

function utcDayIndex(dateText: string) {
  return signedDurationDayDelta('1970-01-01', dateText)
}

function rowHasHumiditySignal(row: WeatherForecastImpactRow) {
  const humidity = normalizeNumber(row.relative_humidity_percent, NaN)
  const tags = normalizeTags(row.warning_tags)
  return (Number.isFinite(humidity) && humidity >= 90)
    || tagIncludes(tags, ['humidity', 'damp', 'return_south', 'persistent_humidity'])
}

function rowHumidityPercent(row: WeatherForecastImpactRow) {
  const humidity = normalizeNumber(row.relative_humidity_percent, NaN)
  return Number.isFinite(humidity) ? humidity : null
}

function sourceCredibilityForWindow(rows: WeatherForecastImpactRow[]) {
  return rows
    .map(resolveWeatherSourceCredibility)
    .sort((left, right) => right.score - left.score)[0]
    ?? resolveWeatherSourceCredibility({})
}

function buildHumidityWindowSignal(window: HumidityWindowCandidate): WeatherImpactSignal | null {
  if (window.rows.length < 3) return null
  const rows = window.rows.slice(0, 7)
  const dates = window.dates.slice(0, 7)
  const humidities = window.humidities.slice(0, 7)
  const maxHumidity = humidities.length > 0 ? Math.max(...humidities) : null
  const severity: WeatherImpactSeverity = (maxHumidity !== null && maxHumidity >= 95) || rows.length >= 5 ? 'high' : 'medium'
  const firstRow = rows[0]!
  const credibility = sourceCredibilityForWindow(rows)
  const multiplierConfig = rows.reduce((merged, row) => {
    const next = normalizeMultiplierConfig(row)
    return {
      ...merged,
      ...next,
      window: {
        ...readRecord((merged as WeatherImpactMultiplierConfig).window),
        ...readRecord(next.window),
      },
    }
  }, {} as WeatherImpactMultiplierConfig)
  const defaultMultiplier = severity === 'high' ? 1.1 : 1.06
  const resolvedMultiplier = resolveWeatherImpactMultiplier('persistent_humidity', severity, multiplierConfig, {
    window: true,
    defaultMultiplier,
  })
  const baseEvidence = sourceEvidence(firstRow, credibility)
  return {
    impactType: 'persistent_humidity',
    climateSignal: 'persistent_humidity',
    severity,
    forecastDate: dates[0]!,
    multiplier: resolvedMultiplier.multiplier,
    confidenceDelta: applySourceCredibility(severity === 'high' ? -10 : -7, credibility),
    sourceReliability: credibility.reliability,
    sourceReliabilityScore: credibility.score,
    actionPolicy: 'candidate_only',
    reason: 'Continuous 3-7 day high-humidity forecast window requires a dry-window review for humidity-sensitive finishes, waterproofing, curing and coating work.',
    evidence: {
      relativeHumidityPercent: maxHumidity,
      maxRelativeHumidityPercent: maxHumidity,
      humidityWindowDays: dates.length,
      humidityWindowStartDate: dates[0],
      humidityWindowEndDate: dates[dates.length - 1],
      highHumidityForecastDates: dates,
      windowAggregationPolicy: 'continuous_3_to_7_day_humidity_window',
      singleDayHumidityPolicy: 'single-day persistent_humidity remains evidence; window signal owns continuous humidity aggregation',
      warningTags: Array.from(new Set(rows.flatMap((row) => normalizeTags(row.warning_tags)))),
      ...multiplierEvidence(resolvedMultiplier.overrideSource),
      ...baseEvidence,
    },
  }
}

export function classifyWeatherForecastImpactWindows(rows: WeatherForecastImpactRow[]): WeatherImpactSignal[] {
  const sortedRows = [...rows]
    .filter((row) => /^\d{4}-\d{2}-\d{2}$/.test(normalizeText(row.forecast_date)))
    .sort((left, right) => normalizeText(left.forecast_date).localeCompare(normalizeText(right.forecast_date)))
  const allSignals = sortedRows.flatMap((row) => classifyWeatherForecastImpacts(row))
  const windows: HumidityWindowCandidate[] = []
  let current: HumidityWindowCandidate | null = null
  let previousDay: number | null = null

  for (const row of sortedRows) {
    const date = normalizeText(row.forecast_date)
    const day = utcDayIndex(date)
    if (day === null || !rowHasHumiditySignal(row)) {
      if (current && current.rows.length >= 3) windows.push(current)
      current = null
      previousDay = day
      continue
    }

    if (!current || previousDay === null || day !== previousDay + 1) {
      if (current && current.rows.length >= 3) windows.push(current)
      current = { rows: [], dates: [], humidities: [] }
    }

    current.rows.push(row)
    current.dates.push(date)
    const humidity = rowHumidityPercent(row)
    if (humidity !== null) current.humidities.push(humidity)
    previousDay = day
  }

  if (current && current.rows.length >= 3) windows.push(current)

  const windowSignals = windows
    .map(buildHumidityWindowSignal)
    .filter((signal): signal is WeatherImpactSignal => Boolean(signal))

  return [...allSignals, ...windowSignals]
    .sort((left, right) => impactScore(right) - impactScore(left))
}

export async function loadProjectWeatherImpactSignals(input: {
  projectId?: string | null
  startDate?: string | null
  endDate?: string | null
  limit?: number
}) {
  const result = await loadProjectWeatherImpactSignalsWithDiagnostics(input)
  return result.signals
}

export async function loadProjectWeatherImpactSignalsWithDiagnostics(input: {
  projectId?: string | null
  startDate?: string | null
  endDate?: string | null
  limit?: number
}): Promise<WeatherImpactSignalDiagnostics> {
  const projectId = normalizeText(input.projectId)
  const rawStartDate = normalizeText(input.startDate)
  const rawEndDate = normalizeText(input.endDate || input.startDate)
  if (!projectId || !rawStartDate) {
    return {
      signals: [],
      sourceStatus: 'not_configured_or_no_forecast',
      confidenceReason: 'weather_forecast_lookup_missing_project_or_date',
    }
  }

  const startDate = normalizeDateOnlyText(rawStartDate)
  const endDate = normalizeDateOnlyText(rawEndDate)
  if (!startDate || !endDate) {
    return {
      signals: [],
      sourceStatus: 'not_configured_or_no_forecast',
      confidenceReason: 'weather_forecast_lookup_invalid_date',
    }
  }

  try {
    let query = (supabase as any)
      .from('project_weather_forecasts')
      .select('*')
      .eq('project_id', projectId)
      .gte('forecast_date', startDate)
      .order('forecast_date', { ascending: true })
      .limit(Math.max(1, Math.min(30, Math.trunc(Number(input.limit ?? 15)))))

    if (endDate) query = query.lte('forecast_date', endDate)

    const { data, error } = await query
    if (error) throw error
    const rows = Array.isArray(data) ? data : []
    const signals = classifyWeatherForecastImpactWindows(rows as WeatherForecastImpactRow[])
    return {
      signals,
      sourceStatus: signals.length > 0 ? 'ok' : 'not_configured_or_no_forecast',
      confidenceReason: signals.length > 0 ? undefined : 'weather_forecast_source_missing_or_no_impact_signal',
    }
  } catch (error) {
    logger.warn('[weatherImpactSignalReadModel] failed to load project weather impact signals', {
      projectId,
      startDate,
      endDate,
      error,
    })
    return {
      signals: [],
      sourceStatus: 'load_failed',
      confidenceReason: 'weather_forecast_load_failed',
    }
  }
}
