import { buildProjectProductivityCompensation } from './projectProductivityCompensationService.js'
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

function normalizeDate(value: unknown) {
  const text = normalizeText(value)
  if (!text) return null
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : text.slice(0, 10)
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
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

function productivityFromAppliedPenaltyFactors(factors: DurationContextFactor[]) {
  return clamp(
    factors.reduce((productivity, factor) => {
      if (factor.key === 'productivity_compensation' || factor.actionPolicy !== 'auto_apply') return productivity
      if (!['seasonal_productivity', 'process_seasonal_sensitivity', 'weather_forecast_impact'].includes(factor.key)) {
        return productivity
      }
      const multiplier = clamp(Number(factor.multiplier ?? 1) || 1, 1, 2.5)
      return productivity / multiplier
    }, 1),
    0.25,
    1.1,
  )
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

export async function buildProductivityCompensationFactor(
  input: DurationContextInput,
  factors: DurationContextFactor[],
): Promise<DurationContextFactor | null> {
  const projectId = normalizeId(input.projectId)
  if (!projectId) return null
  const pmRecoveryFactor = factors.find((factor) => factor.key === 'pm_recovery_compensation' && factor.actionPolicy !== 'confidence_only')
  if (pmRecoveryFactor) {
    return {
      key: 'productivity_compensation',
      label: 'project productivity compensation',
      multiplier: 1,
      extraDays: 0,
      confidenceDelta: 0,
      actionPolicy: 'confidence_only',
      dataDependencies: ['duration_experience_samples', 'project_daily_snapshot', 'project_schedule_states'],
      reason: 'PM recovery compensation already owns the local recovery candidate path, so project productivity compensation is retained only as suppressed governance context to avoid double compensation.',
      source: 'project_history',
      metadata: {
        suppressedByCompensationMutex: 'pm_recovery_compensation',
        compensationMutexPolicy: 'pm_recovery_candidate_owns_local_recovery_candidate_path',
        primaryFactorMultiplier: pmRecoveryFactor.multiplier,
        primaryFactorActionPolicy: pmRecoveryFactor.actionPolicy,
      },
    }
  }
  const appliedFactors = factors.filter((factor) => factor.actionPolicy === 'auto_apply')
  const baseProductivity = productivityFromAppliedPenaltyFactors(appliedFactors)
  const date = parseDate(input.plannedStartDate) ?? new Date()
  const seasonalFactor = factors.find((factor) => factor.key === 'seasonal_productivity')
  const seasonalMetadata = readRecord(seasonalFactor?.metadata)
  const stateFactor = factors.find((factor) => factor.key === 'project_schedule_state')
  const stateMetadata = readRecord(stateFactor?.metadata)
  const externalReadinessFactor = factors.find((factor) => factor.key === 'external_readiness')
  const externalMetadata = readRecord(externalReadinessFactor?.metadata)
  const hasExplicitProgress = typeof input.progress === 'number' && Number.isFinite(input.progress)
  const progress = hasExplicitProgress ? clamp(Number(input.progress), 0, 100) : null
  const shutdownSignals = factors
    .flatMap(factorClimateSignals)
    .concat(
      normalizeText(seasonalMetadata.calendarKind),
      normalizeText(seasonalMetadata.holidayCode),
      normalizeText(externalMetadata.primaryBusinessReasonType),
      normalizeText(externalMetadata.externalReadinessPrimaryReasonType),
      normalizeText(input.taskTitle),
      progress != null && progress <= 0 ? 'velocity_skipped_due_to_zero_progress' : '',
    )
    .filter(Boolean)
  const activeWeatherSignals = factors
    .filter((factor) => (
      factor.key === 'seasonal_productivity'
      || factor.key === 'process_seasonal_sensitivity'
      || factor.key === 'weather_forecast_impact'
    ))
    .flatMap(factorActiveWeatherSignals)
  const compensation = await buildProjectProductivityCompensation({
    projectId,
    scopeIds: [
      input.buildingObjectId,
      input.floorObjectId,
      input.zoneObjectId,
      input.standardWorkCode,
      input.standardWorkName,
      input.templateNodeId,
      input.engineeringCategoryId,
    ],
    baseProductivity,
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    calendarKind: normalizeText(seasonalMetadata.calendarKind) || null,
    holidayCode: normalizeText(seasonalMetadata.holidayCode) || null,
    appliedFactorKeys: appliedFactors.map((factor) => factor.key),
    currentProgress: progress,
    shutdownSignals,
    activeWeatherSignals,
    skipDurationExperienceContribution: appliedFactors.some((factor) => factor.key === 'project_baseline_calibration'),
    skipScheduleStateContribution: Number(stateFactor?.multiplier ?? 1) < 0.999
      || Boolean(readRecord(stateMetadata.downstreamPolicy).canAdjustRemainingDuration),
  })

  if (compensation.notAppliedReason || compensation.productivityUplift <= 0) {
    if (compensation.notAppliedReason === 'cold_start_observation_only') {
      return {
        key: 'productivity_compensation',
        label: 'project productivity compensation',
        multiplier: 1,
        extraDays: 0,
        confidenceDelta: -3,
        actionPolicy: 'confidence_only',
        dataDependencies: compensation.dataDependencies,
        reason: 'Project-level productivity compensation is in cold-start observation mode until enough real execution samples or daily snapshots exist.',
        source: 'project_history',
        metadata: compensation.metadata,
      }
    }
    return null
  }

  return {
    key: 'productivity_compensation',
    label: 'project productivity compensation',
    multiplier: compensation.durationMultiplier,
    extraDays: 0,
    confidenceDelta: compensation.confidenceLevel === 'high' ? 4 : 2,
    actionPolicy: compensation.actionPolicy,
    dataDependencies: compensation.dataDependencies,
    reason: 'Project-level historical execution evidence and applicable schedule states indicate bounded recovery capacity, so weather/calendar productivity is compensated within the controlled cap.',
    source: 'project_history',
    metadata: {
      ...compensation.metadata,
      productivityUplift: compensation.productivityUplift,
      productivityMultiplier: compensation.productivityMultiplier,
      adjustedProductivity: compensation.adjustedProductivity,
      baseProductivity: compensation.baseProductivity,
      durationMultiplier: compensation.durationMultiplier,
      maturityTier: compensation.maturityTier,
      maturityScoreDays: compensation.maturityScoreDays,
      compensationCap: compensation.compensationCap,
      confidenceLevel: compensation.confidenceLevel,
      sourceBreakdown: compensation.sourceBreakdown,
      actionPolicy: compensation.actionPolicy,
    },
  }
}
