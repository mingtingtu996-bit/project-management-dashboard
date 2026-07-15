import type {
  DurationContextFactor,
  DurationContextInput,
} from '../types/durationContext.js'

export type ActiveWeatherProductivityCeiling = {
  maxProductivity: number
  minimumMultiplier: number
  reason: string
  matchedSignals: string[]
}

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function factorActiveWeatherSignals(factor: DurationContextFactor) {
  const metadata = readRecord(factor.metadata)
  const weatherStaticCoupling = readRecord(metadata.weatherStaticCoupling)
  const signals = [
    factor.key,
    metadata.climateSignal,
    metadata.monthlyClimateSignal,
    metadata.impactType,
    metadata.impactBand,
    metadata.calendarKind,
    metadata.holidayCode,
    metadata.stableCode,
    metadata.processSeasonalStableCode,
    weatherStaticCoupling.weatherSignal,
    weatherStaticCoupling.weatherImpactBand,
    weatherStaticCoupling.processImpactBand,
    weatherStaticCoupling.overlapPolicy,
  ]
  return signals.map((item) => normalizeText(item).toLowerCase()).filter(Boolean)
}

export function resolveActiveWeatherProductivityCeiling(
  input: DurationContextInput,
  factors: DurationContextFactor[],
): ActiveWeatherProductivityCeiling | null {
  const signals = [
    normalizeText(input.taskTitle),
    normalizeText(input.standardWorkName),
    ...factors.flatMap(factorActiveWeatherSignals),
  ].map((item) => item.toLowerCase()).filter(Boolean)
  const joined = signals.join(' ')
  const match = (tokens: string[]) => tokens.some((token) => joined.includes(token))
  const ceiling = match(['red_rainstorm', 'red rainstorm', 'site_shutdown', 'site shutdown', 'typhoon_red', 'red_weather'])
    ? { maxProductivity: 0.5, reason: 'active_severe_weather_shutdown_ceiling' }
    : match(['rain_blocks_work', 'rain blocks work', 'persistent_humidity', 'persistent humidity', 'plum_rain', 'plum rain', 'heavy_rain', 'heavy rain'])
      ? { maxProductivity: 0.82, reason: 'active_rain_window_productivity_ceiling' }
      : match(['wind_warning', 'wind warning', 'high_wind', 'high wind', 'typhoon peripheral'])
        ? { maxProductivity: 0.86, reason: 'active_wind_window_productivity_ceiling' }
        : match(['summer_heat', 'summer heat', 'extreme_heat', 'extreme heat'])
          ? { maxProductivity: 0.9, reason: 'active_heat_window_productivity_ceiling' }
          : null
  if (!ceiling) return null
  return {
    ...ceiling,
    minimumMultiplier: Number((1 / ceiling.maxProductivity).toFixed(3)),
    matchedSignals: signals.filter((signal) => (
      signal.includes('rain')
      || signal.includes('humidity')
      || signal.includes('heat')
      || signal.includes('wind')
      || signal.includes('typhoon')
      || signal.includes('shutdown')
    )).slice(0, 12),
  }
}

export function applyProductivityCeilingToScenario<T extends Record<string, unknown>>(
  scenario: T,
  ceiling: ActiveWeatherProductivityCeiling | null,
) {
  if (!ceiling) return scenario
  const factorKeys = Array.isArray(scenario.factorKeys)
    ? scenario.factorKeys.map((key) => normalizeText(key))
    : []
  const hasRecoveryOrCompensationSignal = factorKeys.some((key) => (
    key === 'productivity_compensation'
    || key === 'pm_recovery_compensation'
    || key === 'project_baseline_calibration'
    || key === 'project_schedule_state'
  ))
  if (!hasRecoveryOrCompensationSignal) return scenario
  const currentMultiplier = Number(scenario.multiplier ?? 1)
  if (!Number.isFinite(currentMultiplier) || currentMultiplier >= ceiling.minimumMultiplier) return scenario
  const multiplier = Math.max(currentMultiplier, ceiling.minimumMultiplier)
  return {
    ...scenario,
    multiplier: Number(multiplier.toFixed(3)),
    productivityCeiling: {
      maxProductivity: ceiling.maxProductivity,
      minimumMultiplier: ceiling.minimumMultiplier,
      reason: ceiling.reason,
      appliedTo: 'recovery_or_compensation_scenario',
    },
  }
}
