import {
  deriveSeasonalProductivityRegionFromResolver,
  inferTitleWeakStandardWorkMatchesFromResolver,
  inferWorkEnvironmentFromResolver,
  resolveStandardWorkDurationSeed,
  resolveV1474ProcessSeasonalSensitivity,
  resolveV1474SeasonalProductivity,
  type AlgorithmSeedResolveContext,
} from './algorithmSeedResolver.js'
import {
  resolveProjectClimateRegion,
  type ProjectClimateRegionResult,
} from './projectClimateRegionReadModelService.js'
import type {
  DurationContextFactor,
  DurationContextInput,
} from '../types/durationContext.js'

type ProcessSeasonalWorkContext = {
  standardWorkCode: string | null
  standardWorkName: string | null
  standardWorkSource: 'explicit' | 'title_weak_fallback' | 'unresolved'
  titleWeakScore: number | null
  titleWeakRuleId: string | null
  resourceContextText: string
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

function readNormalizedTextArray(value: unknown) {
  if (Array.isArray(value)) return value.map(normalizeText).filter(Boolean)
  const text = normalizeText(value)
  if (!text) return []
  return text.split(',').map((item) => item.trim()).filter(Boolean)
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

function deriveSeasonalProductivityRegionFromClimate(climateRegion: ProjectClimateRegionResult) {
  return deriveSeasonalProductivityRegionFromResolver({
    thermalZone: climateRegion.thermalZone,
    regionCode: climateRegion.regionCode,
    climateTags: climateRegion.climateTags,
    location: climateRegion.location,
  })
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

async function resolveProcessSeasonalWorkContext(
  task: Record<string, unknown>,
  baseContext: AlgorithmSeedResolveContext,
): Promise<ProcessSeasonalWorkContext> {
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
  let standardWorkSource: ProcessSeasonalWorkContext['standardWorkSource'] = standardWorkCode ? 'explicit' : 'unresolved'
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

  return {
    standardWorkCode,
    standardWorkName,
    standardWorkSource,
    titleWeakScore,
    titleWeakRuleId,
    resourceContextText: [
      rawText,
      standardWorkCode,
      standardWorkName,
      ...seedKeywords,
    ].map(normalizeText).filter(Boolean).join(' '),
  }
}

export async function buildProcessSeasonalFactor(input: DurationContextInput): Promise<DurationContextFactor | null> {
  const start = parseDate(input.plannedStartDate)
  if (!start) return null
  const month = start.getUTCMonth() + 1
  const climateRegion = await resolveProjectClimateRegion(input.projectId)
  const seedContext = buildSeedResolveContext(input)
  const workContext = await resolveProcessSeasonalWorkContext(input as Record<string, unknown>, seedContext)
  const seasonalRegion = deriveSeasonalProductivityRegionFromClimate(climateRegion)
  const seasonal = await resolveV1474SeasonalProductivity(
    seasonalRegion,
    month,
    { projectId: input.projectId },
  )
  const contextText = [
    compactFactorText(input),
    workContext.resourceContextText,
    workContext.standardWorkCode,
    workContext.standardWorkName,
  ].map(normalizeText).filter(Boolean).join(' ')
  const standardWorkCodes = Array.from(new Set([
    workContext.standardWorkCode,
    input.standardWorkCode,
  ].map(normalizeId).filter(Boolean) as string[]))
  const match = await resolveV1474ProcessSeasonalSensitivity(contextText, month, {
    ...seedContext,
    standardWorkCode: workContext.standardWorkCode ?? input.standardWorkCode,
    standardWorkCodes,
    contextKeywords: [workContext.resourceContextText],
    monthlyClimateSignal: seasonal?.climateSignal ?? null,
    rainySeasonMonths: climateRegion.rainySeasonMonths,
    floodSeasonMonths: climateRegion.floodSeasonMonths,
    highTempMonths: climateRegion.highTempMonths,
    coldWeatherMonths: climateRegion.coldWeatherMonths,
  })
  if (!match) return null

  return {
    key: 'process_seasonal_sensitivity',
    label: '工序季节敏感',
    multiplier: clamp(1 / match.productivityMultiplier, 1, 1.3),
    extraDays: 0,
    confidenceDelta: match.confidence === 'low' ? -5 : 0,
    actionPolicy: 'auto_apply',
    dataDependencies: ['algorithm_seed_records.process_seasonal_sensitivity', 'project_climate_profiles', 'algorithm_seed_records.seasonal_productivity'],
    reason: 'This work item is season-sensitive; reference duration has been adjusted by process sensitivity.',
    source: 'v1.4.7.4_seed',
    metadata: {
      stableCode: match.stableCode,
      month,
      climateSignal: match.sensitivityReason ?? seasonal?.climateSignal ?? null,
      impactBand: match.impactBand ?? null,
      climateRegion: climateRegion.regionCode,
      thermalZone: climateRegion.thermalZone,
      climateTags: climateRegion.climateTags,
      rainySeasonMonths: climateRegion.rainySeasonMonths,
      floodSeasonMonths: climateRegion.floodSeasonMonths,
      highTempMonths: climateRegion.highTempMonths,
      coldWeatherMonths: climateRegion.coldWeatherMonths,
      typhoonRiskLevel: climateRegion.typhoonRiskLevel,
      winterShutdownRiskLevel: climateRegion.winterShutdownRiskLevel,
      softSoilLevel: climateRegion.softSoilLevel,
      mountainTerrain: climateRegion.mountainTerrain,
      terrainDifficultyLevel: climateRegion.terrainDifficultyLevel,
      seismicIntensity: climateRegion.seismicIntensity,
      seasonalProductivityRegion: seasonalRegion,
      climateRegionSource: climateRegion.source,
      monthlyClimateSignal: seasonal?.climateSignal ?? null,
      climateCouplingSignals: {
        monthlyClimateSignal: seasonal?.climateSignal ?? null,
        processSensitivityReason: match.sensitivityReason ?? null,
        typhoonRiskLevel: climateRegion.typhoonRiskLevel,
        floodSeasonMonths: climateRegion.floodSeasonMonths,
        softSoilLevel: climateRegion.softSoilLevel,
        mountainTerrain: climateRegion.mountainTerrain,
      },
      resolverSource: match.__resolverSource,
      standardWorkSource: workContext.standardWorkSource,
      standardWorkCode: workContext.standardWorkCode,
      titleWeakScore: workContext.titleWeakScore,
      titleWeakRuleId: workContext.titleWeakRuleId,
    },
  }
}
