import { loadPublishedProgressVelocityRuntime } from './progressVelocityRuntimePublicationService.js'
import type {
  DurationContextFactor,
  DurationContextInput,
} from '../types/durationContext.js'

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

function normalizeId(value: unknown) {
  const text = normalizeText(value)
  return text || null
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function factorClimateSignals(factor: DurationContextFactor) {
  const metadata = readRecord(factor.metadata)
  const holidayCode = normalizeText(metadata.holidayCode ?? metadata.holiday_code)
  const holidayKind = normalizeText(metadata.calendarKind ?? metadata.calendar_kind)
  const holidayInterpretation = normalizeText(metadata.calendarInterpretation ?? metadata.calendar_interpretation)
  const siteShutdownEvent = readRecord(metadata.siteShutdownEvent)
  const weatherStaticCoupling = readRecord(metadata.weatherStaticCoupling)
  const signals = [
    metadata.climateSignal,
    metadata.monthlyClimateSignal,
    metadata.impactType,
    holidayCode,
    holidayKind,
    holidayInterpretation,
    siteShutdownEvent.eventType,
    siteShutdownEvent.event_type,
    weatherStaticCoupling.weatherSignal,
    weatherStaticCoupling.weather_signal,
  ]
  if (holidayCode.includes('spring_festival')) signals.push('spring_festival')
  if (holidayKind === 'spring_festival_remobilization') signals.push('spring_festival_remobilization')
  if (holidayKind === 'winter_shutdown') signals.push('winter_shutdown')
  return signals.map((item) => normalizeText(item).toLowerCase()).filter(Boolean)
}

function buildPmRecoveryCompensationFactor(appliedFactors: DurationContextFactor[]): DurationContextFactor | null {
  const climateFactors = appliedFactors.filter((factor) => (
    factor.key === 'seasonal_productivity'
    || factor.key === 'process_seasonal_sensitivity'
    || factor.key === 'weather_forecast_impact'
  ))
  const resourceOrProgressFactors = appliedFactors.filter((factor) => (
    factor.key === 'resource_conflict'
    || factor.key === 'progress_velocity'
    || factor.key === 'external_readiness'
  ))
  if (climateFactors.length < 2 && !(climateFactors.length >= 1 && resourceOrProgressFactors.length >= 2)) return null

  const signals = climateFactors.flatMap(factorClimateSignals)
  const has = (...needles: string[]) => signals.some((signal) => needles.some((needle) => signal.includes(needle)))
  if (has('spring_festival', 'spring_festival_restart_window', 'winter_shutdown', 'compound_red_weather')) return null

  let recoveryFactor = 1
  const levers: string[] = []
  if (has('rainy_season', 'heavy_rain', 'red_rainstorm', 'persistent_humidity')) {
    recoveryFactor -= 0.05
    levers.push('shift_weather_exposed_work_to_indoor_or_dry_workfaces')
  }
  if (has('dust_storm', 'sandstorm')) {
    recoveryFactor -= 0.08
    levers.push('resume_normal_work_after_short_dust_window')
  }
  if (has('wind_warning', 'high_wind')) {
    recoveryFactor -= 0.05
    levers.push('switch_lifting_or_facade_work_to_ground_or_indoor_tasks')
  }
  if (has('summer_heat', 'extreme_heat')) {
    recoveryFactor -= 0.04
    levers.push('shift_to_morning_evening_or_night_work_window')
  }
  if (resourceOrProgressFactors.length >= 2) {
    recoveryFactor -= 0.04
    levers.push('resequencing_resource_and_progress_pressure_with_pm_recovery_plan')
  }

  recoveryFactor = clamp(recoveryFactor, resourceOrProgressFactors.length >= 2 ? 0.86 : 0.9, 1)
  if (recoveryFactor >= 0.995 || levers.length === 0) return null

  return {
    key: 'pm_recovery_compensation',
    label: 'PM recovery compensation candidate',
    multiplier: recoveryFactor,
    extraDays: 0,
    confidenceDelta: -5,
    actionPolicy: 'candidate_only',
    dataDependencies: ['planning_revision_pool', 'algorithm_learnable_parameter_runtime_publications', 'task_progress_snapshots'],
    reason: 'Weather and seasonal penalties may be partially recovered by PM resequencing, overtime, workface switching, or off-peak execution; keep as a candidate until the plan revision is confirmed.',
    source: 'project_history',
    metadata: {
      recoveryFactor,
      recoveryLevers: Array.from(new Set(levers)),
      policy: 'candidate_only_until_pm_confirms_resequencing_capacity',
      climateSignals: Array.from(new Set(signals)),
      coupledFactorKeys: resourceOrProgressFactors.map((factor) => factor.key),
      couplingPolicy: resourceOrProgressFactors.length >= 2
        ? 'climate_resource_progress_pm_resequencing_candidate'
        : 'multi_climate_pm_resequencing_candidate',
    },
  }
}

export async function buildPmRecoveryCompensationFactorWithEligibility(
  input: DurationContextInput,
  appliedFactors: DurationContextFactor[],
): Promise<DurationContextFactor | null> {
  const base = buildPmRecoveryCompensationFactor(appliedFactors)
  if (!base) return null
  const projectId = normalizeId(input.projectId)
  if (!projectId) return null
  const publication = await loadPublishedProgressVelocityRuntime({
    projectId,
    consumerKey: 'durationContextPmRecoveryCompensationFactorService.published_velocity',
  })
  if (!publication || publication.confidenceLevel !== 'high') return null
  const sampleCount = publication.sampleCount
  const publicationMetadata = readRecord(publication.metadata)
  const climateFactors = appliedFactors.filter((factor) => (
    factor.key === 'seasonal_productivity'
    || factor.key === 'process_seasonal_sensitivity'
    || factor.key === 'weather_forecast_impact'
  ))
  const progressFactor = appliedFactors.find((factor) => factor.key === 'progress_velocity')
  const resourceFactor = appliedFactors.find((factor) => factor.key === 'resource_conflict')
  const readinessFactor = appliedFactors.find((factor) => factor.key === 'external_readiness')
  const scheduleStateFactor = appliedFactors.find((factor) => factor.key === 'project_schedule_state')
  const scheduleStateMetadata = readRecord(scheduleStateFactor?.metadata)
  const scheduleState = normalizeText(scheduleStateMetadata.state)
  const eligibilityScenario = climateFactors.length > 0 && progressFactor
    ? 'weather_recovery_with_progress_signal'
    : progressFactor && (scheduleState === 'accelerating' || scheduleState === 'recovery')
      ? 'progress_catchup_with_schedule_state'
      : resourceFactor && scheduleState === 'recovery'
        ? 'resource_relaxation_recovery'
        : 'mature_calibration_recovery_pattern'
  return {
    ...base,
    metadata: {
      ...(base.metadata ?? {}),
      eligibilityScenario,
      eligibilityPolicy: 'requires_stable_published_project_recovery_evidence',
      matureCalibrationSampleCount: sampleCount,
      eligibilityPublicationKey: publicationMetadata.publicationKey ?? null,
      eligibilityPublicationStatus: publicationMetadata.publicationStatus ?? null,
      eligibilityRuntimeAuthority: 'published_parameter_only',
      rawSampleConsumption: false,
      coupledFactorKeys: Array.from(new Set([
        ...(Array.isArray(readRecord(base.metadata).coupledFactorKeys) ? readRecord(base.metadata).coupledFactorKeys as string[] : []),
        progressFactor?.key,
        resourceFactor?.key,
        readinessFactor?.key,
        scheduleStateFactor?.key,
      ].filter(Boolean) as string[])),
    },
  }
}
