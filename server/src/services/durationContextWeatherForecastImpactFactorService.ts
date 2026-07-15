import { getProjectCompanyId } from '../auth/access.js'
import { logger } from '../middleware/logger.js'
import {
  inferTitleWeakStandardWorkMatchesFromResolver,
  inferWorkEnvironmentFromResolver,
  normalizeWorkEnvironmentFromResolver,
  resolveStandardWorkDurationSeed,
  resolveV1474ProcessSeasonalSensitivity,
  type AlgorithmSeedResolveContext,
  type WorkEnvironment,
} from './algorithmSeedResolver.js'
import { loadAlgorithmAssetLearnableParameterRuntimeValue } from './algorithmAssetLearnableParameterRuntimeConsumptionService.js'
import type {
  DurationContextFactor,
  DurationContextInput,
} from '../types/durationContext.js'
import {
  loadProjectWeatherImpactSignalsWithDiagnostics,
  type WeatherImpactSignal,
} from './weatherImpactSignalReadModelService.js'

type WeatherForecastWorkContext = {
  standardWorkCode: string | null
  standardWorkName: string | null
  standardWorkSource: 'explicit' | 'title_weak_fallback' | 'unresolved'
  titleWeakScore: number | null
  titleWeakRuleId: string | null
  resourceContextText: string
  workEnvironment: WorkEnvironment
}

const WEATHER_MULTIPLIER_PARAMETER_KEY = 'duration.context.weather_multiplier'
const WEATHER_MULTIPLIER_CANARY_CONSUMER_KEY = 'durationContextService.weather_forecast_impact'
const WEATHER_MULTIPLIER_CANARY_BOUNDARY = {
  consumerKey: WEATHER_MULTIPLIER_CANARY_CONSUMER_KEY,
  scopeBoundary: 'company',
  stopConditionKeys: [
    'weather_context_overcompensation_rate',
    'weather_context_mae_regression',
  ],
  monitoringWindowHours: 72,
}

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

function compactFactorText(input: DurationContextInput) {
  const metadata = readRecord(input.standardTaskMetadata)
  return [
    input.taskTitle,
    input.standardWorkName,
    input.standardWorkCode,
    input.wbsNodeType,
    input.engineeringCategoryId,
    input.projectTypeCode,
    input.structureTypeCode,
    metadata.workEnvironment,
    metadata.work_environment,
    ...(Array.isArray(input.methodVariantCodes) ? input.methodVariantCodes : []),
    ...(Array.isArray(input.elementVariantCodes) ? input.elementVariantCodes : []),
  ].map(normalizeText).filter(Boolean).join(' ')
}

function buildSeedResolveContext(input: DurationContextInput): AlgorithmSeedResolveContext {
  const metadata = readRecord(input.standardTaskMetadata)
  const buildingPatternObservation = readRecord(metadata.buildingPatternObservation ?? metadata.building_pattern_observation)
  const observedPrimaryWorkfaceType = normalizeText(buildingPatternObservation.primaryWorkfaceType ?? buildingPatternObservation.primary_workface_type)
  const observedPhaseWindow = normalizeText(buildingPatternObservation.phaseWindow ?? buildingPatternObservation.phase_window)
  const observedExpansionStrategy = normalizeText(buildingPatternObservation.expansionStrategy ?? buildingPatternObservation.expansion_strategy)
  const scopeDimensions = [
    input.buildingObjectId ? 'building' : null,
    input.floorObjectId ? 'floor' : null,
    input.zoneObjectId ? 'zone' : null,
  ].filter((item): item is string => Boolean(item))
  const rhythmDrivers = [
    input.floorObjectId ? 'floor_count' : null,
    input.buildingObjectId ? 'building_count' : null,
    input.zoneObjectId ? 'zone_count' : null,
    (input.methodVariantCodes?.length ?? 0) > 0 ? 'method_variant' : null,
    input.acceptanceRequired ? 'acceptance_gate' : null,
    input.materialRequired ? 'readiness_gate' : null,
    input.responsibleUnitId ? 'resource_capacity' : null,
  ].filter((item): item is string => Boolean(item))
  return {
    projectId: input.projectId,
    standardWorkCode: input.standardWorkCode,
    standardWorkCodes: input.standardWorkCode ? [input.standardWorkCode] : [],
    templateNodeId: input.templateNodeId,
    methodVariantCodes: input.methodVariantCodes ?? [],
    elementVariantCodes: input.elementVariantCodes ?? [],
    projectTypeCode: input.projectTypeCode ?? null,
    structureTypeCode: input.structureTypeCode ?? null,
    applicableGranularity: input.applicableGranularity ?? null,
    workEnvironment: inferWorkEnvironmentFromResolver(compactFactorText(input), metadata),
    scopeDimensions,
    rhythmDrivers,
    primaryWorkfaceType: observedPrimaryWorkfaceType || (scopeDimensions.includes('floor')
      ? 'standard_floor'
      : scopeDimensions.includes('zone')
        ? 'building_zone'
        : scopeDimensions.includes('building')
          ? 'building_zone'
          : null),
    phaseWindow: observedPhaseWindow || (scopeDimensions.includes('floor') ? 'superstructure' : null),
    expansionStrategy: observedExpansionStrategy || (scopeDimensions.includes('floor')
      ? 'floor_ordered'
      : scopeDimensions.includes('zone')
        ? 'zone_ordered'
        : scopeDimensions.includes('building')
          ? 'building'
          : null),
  }
}

function readTaskWorkMetadata(task: Record<string, unknown>) {
  return readRecord(
    task.standard_task_metadata
      ?? task.standardTaskMetadata
      ?? task.metadata,
  )
}

function readTaskWorkText(task: Record<string, unknown>) {
  return {
    title: normalizeText(task.taskTitle ?? task.title),
    standardWorkCode: normalizeId(task.standardWorkCode ?? task.standard_work_code),
    standardWorkName: normalizeText(task.standardWorkName ?? task.standard_work_name) || null,
    templateNodeId: normalizeId(task.templateNodeId ?? task.template_node_id),
  }
}

function buildWorkContextResolveContext(
  task: Record<string, unknown>,
  baseContext: AlgorithmSeedResolveContext,
  standardWorkCode: string | null,
): AlgorithmSeedResolveContext {
  const workText = readTaskWorkText(task)
  return {
    ...baseContext,
    templateNodeId: workText.templateNodeId ?? baseContext.templateNodeId,
    standardWorkCode: standardWorkCode ?? baseContext.standardWorkCode,
    standardWorkCodes: standardWorkCode
      ? [standardWorkCode]
      : (Array.isArray(baseContext.standardWorkCodes) ? baseContext.standardWorkCodes : []),
  }
}

async function resolveWeatherForecastWorkContext(
  task: Record<string, unknown>,
  baseContext: AlgorithmSeedResolveContext,
): Promise<WeatherForecastWorkContext> {
  const workText = readTaskWorkText(task)
  const metadata = readTaskWorkMetadata(task)
  const rawText = [
    workText.title,
    workText.standardWorkName,
    workText.standardWorkCode,
    metadata.standardWorkCode,
    metadata.standard_work_code,
  ].map(normalizeText).filter(Boolean).join(' ')

  let standardWorkCode = workText.standardWorkCode
  let standardWorkName = workText.standardWorkName
  let standardWorkSource: WeatherForecastWorkContext['standardWorkSource'] = standardWorkCode ? 'explicit' : 'unresolved'
  let titleWeakScore: number | null = null
  let titleWeakRuleId: string | null = null

  if (!standardWorkCode && rawText) {
    const weakMatches = await inferTitleWeakStandardWorkMatchesFromResolver(rawText, baseContext)
    const firstWeakMatch = weakMatches[0] as any
    if (firstWeakMatch?.standardWorkCode) {
      standardWorkCode = normalizeId(firstWeakMatch.standardWorkCode)
      standardWorkSource = 'title_weak_fallback'
      titleWeakScore = Number.isFinite(Number(firstWeakMatch.score)) ? Number(firstWeakMatch.score) : null
      titleWeakRuleId = normalizeId(firstWeakMatch.ruleId)
    }
  }

  const scopedContext = buildWorkContextResolveContext(task, baseContext, standardWorkCode)
  const durationSeed = standardWorkCode
    ? await resolveStandardWorkDurationSeed(rawText, scopedContext) as Record<string, unknown> | null
    : null
  const seedMetadata = readRecord(durationSeed)
  const seedKeywords = Array.isArray(seedMetadata.keywords)
    ? seedMetadata.keywords.map(normalizeText).filter(Boolean)
    : []
  const workEnvironment = normalizeWorkEnvironmentFromResolver(metadata.workEnvironment ?? metadata.work_environment)
    ?? normalizeWorkEnvironmentFromResolver(seedMetadata.workEnvironment ?? seedMetadata.work_environment)
    ?? inferWorkEnvironmentFromResolver(rawText, { ...seedMetadata, ...metadata })

  return {
    standardWorkCode,
    standardWorkName,
    standardWorkSource,
    titleWeakScore,
    titleWeakRuleId,
    workEnvironment,
    resourceContextText: [
      rawText,
      standardWorkCode,
      standardWorkName,
      ...seedKeywords,
    ].map(normalizeText).filter(Boolean).join(' '),
  }
}

function weatherImpactBandFromSignal(signal: WeatherImpactSignal) {
  const severity = normalizeText(signal.severity).toLowerCase()
  if (signal.impactType === 'heavy_rain') return severity === 'high' ? 'rain_blocks_work' : 'rain_partial_work'
  if (signal.impactType === 'extreme_heat') return severity === 'high' ? 'heat_process_sensitive' : 'heat_macro_only'
  if (signal.impactType === 'low_temperature') return 'winter_wet_trade'
  if (signal.impactType === 'wind_warning') return severity === 'high' ? 'high_wind' : 'wind_warning'
  if (signal.impactType === 'persistent_humidity') return 'humidity_dry_window'
  if (signal.impactType === 'snow_ice') return 'snow_ice_block'
  if (signal.impactType === 'dust_storm') return 'dust_storm_partial'
  if (signal.impactType === 'thunderstorm') return 'thunderstorm_safety'
  return null
}

function dampenWeatherMultiplierForStaticSeason(input: {
  primary: WeatherImpactSignal
  processMatch: Record<string, unknown> | null
  multiplier: number
}) {
  const severity = normalizeText(input.primary.severity).toLowerCase()
  const impactType = normalizeText(input.primary.impactType).toLowerCase()
  const sameClimateSignal = normalizeText((input.processMatch as any)?.sensitivityReason) === normalizeText(input.primary.climateSignal)
  if (
    impactType === 'heavy_rain'
    && severity === 'medium'
    && sameClimateSignal
  ) {
    return Math.min(input.multiplier, 1.02)
  }
  return input.multiplier
}

function weatherStaticCouplingObservation(input: {
  primary: WeatherImpactSignal
  processMatch: Record<string, unknown> | null
  rawMultiplier: number
  multiplier: number
}) {
  const processSignal = normalizeText((input.processMatch as any)?.sensitivityReason)
  const weatherSignal = normalizeText(input.primary.climateSignal)
  const processImpactBand = normalizeText((input.processMatch as any)?.impactBand)
  const weatherImpactBand = normalizeText(weatherImpactBandFromSignal(input.primary))
  const sameSignal = Boolean(processSignal && weatherSignal && processSignal === weatherSignal)
  const conflictingSignal = Boolean(processSignal && weatherSignal && processSignal !== weatherSignal)
  return {
    climateSignalCoupled: sameSignal,
    conflictDetected: conflictingSignal,
    conflictType: conflictingSignal ? 'weather_signal_differs_from_static_process_signal' : null,
    processSignal: processSignal || null,
    weatherSignal: weatherSignal || null,
    processImpactBand: processImpactBand || null,
    weatherImpactBand: weatherImpactBand || null,
    rawWeatherMultiplier: input.rawMultiplier,
    dampenedWeatherMultiplier: input.multiplier,
    overlapPolicy: sameSignal && input.rawMultiplier > input.multiplier
      ? 'medium_weather_fact_dampened_because_static_season_already_counted'
      : 'no_static_weather_dampening',
  }
}

async function loadWeatherCanaryRuntimeMultiplier(input: {
  projectId: string
  originalMultiplier: number
}) {
  const companyId = await getProjectCompanyId(input.projectId)
  if (!companyId) return null

  try {
    const result = await loadAlgorithmAssetLearnableParameterRuntimeValue({
      parameterKey: WEATHER_MULTIPLIER_PARAMETER_KEY,
      companyId,
      projectId: input.projectId,
      consumptionMode: 'canary',
      canaryRuntimeBoundary: WEATHER_MULTIPLIER_CANARY_BOUNDARY,
    })
    if (!result.runtimeConsumable || typeof result.runtimeValue !== 'number') return null

    const runtimeMultiplier = clamp(result.runtimeValue, 1, 1.35)
    return {
      multiplier: runtimeMultiplier,
      metadata: {
        parameterKey: result.parameterKey,
        consumptionMode: result.consumptionMode,
        publicationStatus: result.publicationStatus,
        publicationKey: result.publicationKey,
        scopeLevel: result.scopeLevel,
        companyId: result.companyId,
        projectId: result.projectId,
        rollbackTarget: result.rollbackTarget,
        originalWeatherMultiplier: input.originalMultiplier,
        runtimeMultiplier,
        appliedTo: 'new_weather_forecast_impact_factor_only',
        consumerKey: WEATHER_MULTIPLIER_CANARY_CONSUMER_KEY,
      },
    }
  } catch (error) {
    logger.warn('[durationContextWeatherForecastImpactFactorService] failed to load canary weather multiplier runtime parameter', {
      projectId: input.projectId,
      parameterKey: WEATHER_MULTIPLIER_PARAMETER_KEY,
      error,
    })
    return null
  }
}

export async function buildWeatherForecastImpactFactor(input: DurationContextInput): Promise<DurationContextFactor | null> {
  const start = parseDate(input.plannedStartDate)
  if (!start || !normalizeId(input.projectId)) return null

  const end = parseDate(input.plannedEndDate) ?? start
  const startDate = start.toISOString().slice(0, 10)
  const endDate = end.toISOString().slice(0, 10)
  const month = start.getUTCMonth() + 1
  const seedContext = buildSeedResolveContext(input)
  const workContext = await resolveWeatherForecastWorkContext(input as Record<string, unknown>, seedContext)
  const diagnostics = await loadProjectWeatherImpactSignalsWithDiagnostics({
    projectId: input.projectId,
    startDate,
    endDate,
    limit: 15,
  })
  const signals = diagnostics.signals
  const primary = signals[0]
  if (!primary) {
    if (diagnostics.sourceStatus === 'ok') return null
    return {
      key: 'weather_forecast_impact',
      label: 'Weather forecast source status',
      multiplier: 1,
      extraDays: 0,
      confidenceDelta: -3,
      actionPolicy: 'confidence_only',
      dataDependencies: ['project_weather_forecasts'],
      reason: 'No usable weather forecast impact signal exists for the project date window; the system records source status only and does not adjust duration automatically.',
      source: 'weather_fact',
      metadata: {
        startDate,
        endDate,
        weatherSourceStatus: diagnostics.sourceStatus,
        weatherSourceConfidenceReason: diagnostics.confidenceReason ?? null,
        userTip: 'Configure a project city weather source or sync project_weather_forecasts before using weather impact candidates.',
      },
    }
  }

  if (primary.impactType === 'site_shutdown_event' || primary.siteShutdownEvent) {
    const shutdownDays = Math.max(1, Math.trunc(Number(primary.siteShutdownEvent?.shutdownDays ?? 1)))
    return {
      key: 'weather_forecast_impact',
      label: 'site-wide weather shutdown',
      multiplier: 1,
      extraDays: shutdownDays,
      confidenceDelta: primary.confidenceDelta,
      actionPolicy: 'candidate_only',
      dataDependencies: ['project_weather_forecasts', 'site_shutdown_events'],
      reason: primary.reason,
      source: 'weather_fact',
      metadata: {
        startDate,
        endDate,
        impactType: primary.impactType,
        climateSignal: primary.climateSignal,
        severity: primary.severity,
        workEnvironment: workContext.workEnvironment,
        siteShutdownEvent: primary.siteShutdownEvent ?? null,
        weatherSourceStatus: diagnostics.sourceStatus,
        weatherSourceConfidenceReason: diagnostics.confidenceReason ?? null,
        actionBoundary: 'candidate_only_until_user_confirmed_plan_revision',
        revisionCandidatePolicy: 'baseline_or_monthly_plan_revision_pool_when_governance_flow_requests_it',
        evidence: primary.evidence,
        sourceEntityKeys: Array.isArray(primary.evidence?.sourceEntityKeys)
          ? primary.evidence.sourceEntityKeys
          : [],
      },
    }
  }

  const processSignal = primary.climateSignal === 'rainy_season'
    || primary.climateSignal === 'winter_low_temp'
    || primary.climateSignal === 'summer_heat'
    || primary.climateSignal === 'wind_warning'
    || primary.climateSignal === 'persistent_humidity'
    || primary.climateSignal === 'snow_ice'
    || primary.climateSignal === 'dust_storm'
    || primary.climateSignal === 'thunderstorm'
    ? primary.climateSignal
    : null
  const processMatch = processSignal
    ? await resolveV1474ProcessSeasonalSensitivity([
      compactFactorText(input),
      workContext.resourceContextText,
      workContext.standardWorkCode,
      workContext.standardWorkName,
    ].map(normalizeText).filter(Boolean).join(' '), month, {
      ...seedContext,
      standardWorkCode: workContext.standardWorkCode ?? input.standardWorkCode,
      standardWorkCodes: Array.from(new Set([
        workContext.standardWorkCode,
        input.standardWorkCode,
      ].map(normalizeId).filter(Boolean) as string[])),
      contextKeywords: [workContext.resourceContextText],
      monthlyClimateSignal: processSignal,
      rainySeasonMonths: processSignal === 'rainy_season' || processSignal === 'persistent_humidity' ? [month] : [],
      floodSeasonMonths: processSignal === 'rainy_season' || processSignal === 'dust_storm' ? [month] : [],
      coldWeatherMonths: processSignal === 'winter_low_temp' || processSignal === 'snow_ice' ? [month] : [],
      highTempMonths: processSignal === 'summer_heat' ? [month] : [],
    })
    : null

  const processMultiplier = processMatch ? clamp(1 / processMatch.productivityMultiplier, 1, 1.3) : 1
  const weatherRuntimeParameter = primary.actionPolicy === 'candidate_only'
    ? await loadWeatherCanaryRuntimeMultiplier({
      projectId: normalizeId(input.projectId) as string,
      originalMultiplier: primary.multiplier,
    })
    : null
  const weatherSignalMultiplier = weatherRuntimeParameter?.multiplier ?? primary.multiplier
  const rawMultiplier = processMatch
    ? Math.max(weatherSignalMultiplier, processMultiplier)
    : primary.actionPolicy === 'candidate_only'
      ? weatherSignalMultiplier
      : 1
  const multiplier = dampenWeatherMultiplierForStaticSeason({
    primary,
    processMatch: processMatch as Record<string, unknown> | null,
    multiplier: rawMultiplier,
  })
  const staticCoupling = weatherStaticCouplingObservation({
    primary,
    processMatch: processMatch as Record<string, unknown> | null,
    rawMultiplier,
    multiplier,
  })
  const actionPolicy = multiplier > 1 ? 'candidate_only' : 'confidence_only'

  return {
    key: 'weather_forecast_impact',
    label: '天气预报影响',
    multiplier: clamp(multiplier, 1, 1.35),
    extraDays: 0,
    confidenceDelta: primary.confidenceDelta,
    actionPolicy,
    dataDependencies: [
      'project_weather_forecasts',
      'algorithm_seed_records.process_seasonal_sensitivity',
      ...(weatherRuntimeParameter ? ['algorithm_learnable_parameter_runtime_publications'] : []),
    ],
    reason: processMatch
      ? `${primary.reason} 已结合工序季节敏感规则生成候选影响，需用户在计划修订流程中确认。`
      : `${primary.reason} 当前仅作为天气事实候选信号，不静默回改已确认计划。`,
    source: 'weather_fact',
    metadata: {
      startDate,
      endDate,
      impactType: primary.impactType,
      climateSignal: primary.climateSignal,
      severity: primary.severity,
      processSensitive: Boolean(processMatch),
      processSeasonalStableCode: (processMatch as any)?.stableCode ?? null,
      workEnvironment: workContext.workEnvironment,
      processSeasonalWorkEnvironment: (processMatch as any)?.workEnvironment ?? null,
      weatherWindowRecoveryPolicy: (processMatch as any)?.weatherWindowRecoveryPolicy ?? null,
      schedulingAdvice: (processMatch as any)?.schedulingAdvice ?? null,
      weatherStaticCoupling: staticCoupling,
      learnableParameterRuntime: weatherRuntimeParameter?.metadata ?? null,
      weatherSourceStatus: diagnostics.sourceStatus,
      weatherSourceConfidenceReason: diagnostics.confidenceReason ?? null,
      actionBoundary: 'candidate_only_until_user_confirmed_plan_revision',
      revisionCandidatePolicy: 'baseline_or_monthly_plan_revision_pool_when_governance_flow_requests_it',
      evidence: primary.evidence,
      sourceEntityKeys: Array.isArray(primary.evidence?.sourceEntityKeys)
        ? primary.evidence.sourceEntityKeys
        : [],
    },
  }
}
