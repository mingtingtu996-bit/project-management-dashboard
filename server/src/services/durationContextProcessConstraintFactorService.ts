import {
  inferDurationContributionModeFromResolver,
  inferExecutionNatureFromResolver,
  inferTitleWeakStandardWorkMatchesFromResolver,
  inferWorkEnvironmentFromResolver,
  isDurationBearingContributionModeFromResolver,
  normalizeExecutionNatureFromResolver,
  resolveDurationContributionModeFromResolver,
  resolveStandardWorkDurationSeed,
  resolveV1474ProcessConstraint,
  type AlgorithmSeedResolveContext,
  type DurationContributionMode,
  type ExecutionNature,
  type V1474ProcessConstraintCondition,
  type V1474ProcessConstraintConditionalEffect,
} from './algorithmSeedResolver.js'
import { resolveProjectClimateRegion } from './projectClimateRegionReadModelService.js'
import {
  loadProjectWeatherImpactSignals,
  type WeatherImpactSignal,
} from './weatherImpactSignalReadModelService.js'
import type {
  DurationContextActionPolicy,
  DurationContextFactor,
  DurationContextInput,
} from '../types/durationContext.js'

type ProcessConstraintWorkContext = {
  standardWorkCode: string | null
  standardWorkName: string | null
  standardWorkSource: 'explicit' | 'title_weak_fallback' | 'unresolved'
  titleWeakScore: number | null
  titleWeakRuleId: string | null
  standardCatalogCodePrefixes: string[]
  templateNodeStableCodePrefixes: string[]
  durationContributionMode: DurationContributionMode
  executionNature: ExecutionNature
  resourceContextText: string
}

type ProcessConstraintConditionContext = {
  climateSignal: string[]
  weatherImpactBand: string[]
  thermalZone: string[]
  methodVariantCode: string[]
  elementVariantCode: string[]
  projectTypeCode: string[]
  structureTypeCode: string[]
  spaceCleanlinessGrade: string[]
  dangerControlLevel: string[]
}

type AppliedProcessConstraintEffectSummary = {
  id: string
  effect: V1474ProcessConstraintConditionalEffect['effect']
  curationBasis: string | null
  businessReasonTemplate: string | null
  adjustments: string[]
}

const PROCESS_CONSTRAINT_MULTIPLIER_CAP_POLICY = {
  min: 1,
  max: 1.3,
  policy: 'process_constraint_pressure_cap',
}

const QUANTITY_EVIDENCE_REQUIREMENT_ORDER: Array<NonNullable<V1474ProcessConstraintConditionalEffect['quantityEvidenceRequirement']>> = [
  'not_applicable',
  'scope_proxy_allowed_as_low_confidence',
  'real_or_default_quantity_proxy_allowed',
  'real_quantity_required_for_auto_release',
]

const QUANTITY_PROXY_RISK_LEVEL_ORDER: Array<NonNullable<V1474ProcessConstraintConditionalEffect['quantityProxyRiskLevel']>> = [
  'not_applicable',
  'low',
  'medium',
  'high',
]

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

function readNormalizedTextArray(value: unknown) {
  if (Array.isArray(value)) return value.map(normalizeText).filter(Boolean)
  const text = normalizeText(value)
  if (!text) return []
  return text.split(',').map((item) => item.trim()).filter(Boolean)
}

function readMetadataTextArray(metadata: Record<string, unknown> | null | undefined, keys: string[]) {
  const values: string[] = []
  for (const key of keys) {
    const raw = metadata?.[key]
    if (Array.isArray(raw)) {
      values.push(...raw.map(normalizeText).filter(Boolean))
      continue
    }
    const text = normalizeText(raw)
    if (!text) continue
    values.push(...readNormalizedTextArray(text))
  }
  return [...new Set(values.filter(Boolean))]
}

function readNumber(value: unknown, fallback: number) {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

function readPositiveNumberOrNull(value: unknown) {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? number : null
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

function round(value: number, precision = 3) {
  const factor = 10 ** precision
  return Math.round(value * factor) / factor
}

function uniqueTextArray(values: unknown[]) {
  return Array.from(new Set(values.flatMap(readNormalizedTextArray).map(normalizeText).filter(Boolean)))
}

function normalizeProcessConstraintMultiplier(multiplier: number) {
  const safeMultiplier = Number.isFinite(multiplier) ? multiplier : 1
  const normalized = round(clamp(
    safeMultiplier,
    PROCESS_CONSTRAINT_MULTIPLIER_CAP_POLICY.min,
    PROCESS_CONSTRAINT_MULTIPLIER_CAP_POLICY.max,
  ))
  return {
    multiplier: normalized,
    capMetadata: {
      multiplierMin: PROCESS_CONSTRAINT_MULTIPLIER_CAP_POLICY.min,
      multiplierMax: PROCESS_CONSTRAINT_MULTIPLIER_CAP_POLICY.max,
      originalMultiplier: safeMultiplier,
      normalizedMultiplier: normalized,
      capApplied: Math.abs(normalized - safeMultiplier) > 0.001,
      policy: PROCESS_CONSTRAINT_MULTIPLIER_CAP_POLICY.policy,
    },
  }
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

async function resolveEffectiveProcessConstraintWorkContext(
  task: Record<string, unknown>,
  baseContext: AlgorithmSeedResolveContext,
): Promise<ProcessConstraintWorkContext> {
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
  let standardWorkSource: ProcessConstraintWorkContext['standardWorkSource'] = standardWorkCode ? 'explicit' : 'unresolved'
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
  const durationContributionMode = resolveDurationContributionModeFromResolver(
    metadata.durationContributionMode
      ?? metadata.duration_contribution_mode
      ?? seedMetadata.durationContributionMode
      ?? seedMetadata.duration_contribution_mode,
  ) ?? inferDurationContributionModeFromResolver({
    text: rawText,
    metadata: { ...seedMetadata, ...metadata },
  })
  const executionNature = normalizeExecutionNatureFromResolver(
    metadata.executionNature
      ?? metadata.execution_nature
      ?? seedMetadata.executionNature
      ?? seedMetadata.execution_nature,
  ) ?? inferExecutionNatureFromResolver({
    text: rawText,
    metadata: { ...seedMetadata, ...metadata },
    durationContributionMode,
  })
  const seedKeywords = Array.isArray(seedMetadata.keywords)
    ? seedMetadata.keywords.map(normalizeText).filter(Boolean)
    : []

  return {
    standardWorkCode,
    standardWorkName,
    standardWorkSource,
    titleWeakScore,
    titleWeakRuleId,
    standardCatalogCodePrefixes: uniqueTextArray([
      seedMetadata.standardCatalogCodePrefixes,
      seedMetadata.standard_catalog_code_prefixes,
    ]),
    templateNodeStableCodePrefixes: uniqueTextArray([
      seedMetadata.templateNodeStableCodePrefixes,
      seedMetadata.template_node_stable_code_prefixes,
    ]),
    durationContributionMode,
    executionNature,
    resourceContextText: [
      rawText,
      standardWorkCode,
      standardWorkName,
      ...seedKeywords,
    ].map(normalizeText).filter(Boolean).join(' '),
  }
}

function stricterQuantityEvidenceRequirement(
  current: V1474ProcessConstraintConditionalEffect['quantityEvidenceRequirement'] | null | undefined,
  next: V1474ProcessConstraintConditionalEffect['quantityEvidenceRequirement'] | null | undefined,
) {
  const currentIndex = QUANTITY_EVIDENCE_REQUIREMENT_ORDER.indexOf(current ?? 'not_applicable')
  const nextIndex = QUANTITY_EVIDENCE_REQUIREMENT_ORDER.indexOf(next ?? 'not_applicable')
  if (currentIndex < 0) return next ?? current ?? 'not_applicable'
  if (nextIndex < 0) return current ?? next ?? 'not_applicable'
  return QUANTITY_EVIDENCE_REQUIREMENT_ORDER[Math.max(currentIndex, nextIndex)]
}

function stricterQuantityProxyRiskLevel(
  current: V1474ProcessConstraintConditionalEffect['quantityProxyRiskLevel'] | null | undefined,
  next: V1474ProcessConstraintConditionalEffect['quantityProxyRiskLevel'] | null | undefined,
) {
  const currentIndex = QUANTITY_PROXY_RISK_LEVEL_ORDER.indexOf(current ?? 'not_applicable')
  const nextIndex = QUANTITY_PROXY_RISK_LEVEL_ORDER.indexOf(next ?? 'not_applicable')
  if (currentIndex < 0) return next ?? current ?? 'not_applicable'
  if (nextIndex < 0) return current ?? next ?? 'not_applicable'
  return QUANTITY_PROXY_RISK_LEVEL_ORDER[Math.max(currentIndex, nextIndex)]
}

function processConstraintConditionValues(
  condition: V1474ProcessConstraintCondition,
  context: ProcessConstraintConditionContext,
) {
  const field = normalizeText(condition.field)
  if (field === 'climate_signal' || field === 'monthly_climate_signal') return context.climateSignal
  if (field === 'weather_impact_band') return context.weatherImpactBand
  if (field === 'thermal_zone') return context.thermalZone
  if (field === 'method_variant_code') return context.methodVariantCode
  if (field === 'element_variant_code') return context.elementVariantCode
  if (field === 'project_type_code') return context.projectTypeCode
  if (field === 'structure_type_code') return context.structureTypeCode
  if (field === 'space_cleanliness_grade') return context.spaceCleanlinessGrade
  if (field === 'danger_control_level') return context.dangerControlLevel
  return []
}

function processConstraintConditionMatches(
  condition: V1474ProcessConstraintCondition,
  context: ProcessConstraintConditionContext,
) {
  const actualValues = processConstraintConditionValues(condition, context)
    .map((item) => normalizeText(item).toLowerCase())
    .filter(Boolean)
  const expectedValues = readNormalizedTextArray(condition.values ?? [])
    .map((item) => normalizeText(item).toLowerCase())
    .filter(Boolean)
  if (expectedValues.length === 0) return false
  const hasMatch = expectedValues.some((expected) => actualValues.includes(expected))
  return normalizeText(condition.operator) === 'equals_any'
    ? hasMatch
    : hasMatch
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

function buildProcessConstraintConditionContext(
  input: DurationContextInput,
  _workContext: ProcessConstraintWorkContext,
): Promise<ProcessConstraintConditionContext> {
  const metadata = readRecord(input.standardTaskMetadata)
  const plannedStart = parseDate(input.plannedStartDate) ?? parseDate(input.actualStartDate) ?? new Date()
  const month = plannedStart.getUTCMonth() + 1
  return Promise.all([
    resolveProjectClimateRegion(input.projectId),
    input.projectId && normalizeDate(input.plannedStartDate)
      ? loadProjectWeatherImpactSignals({
        projectId: input.projectId,
        startDate: normalizeDate(input.plannedStartDate),
        endDate: normalizeDate(input.plannedEndDate) ?? normalizeDate(input.plannedStartDate),
        limit: 10,
      })
      : Promise.resolve([] as WeatherImpactSignal[]),
  ]).then(([climateRegion, weatherSignals]) => {
    const climateSignal = new Set<string>(readMetadataTextArray(metadata, [
      'climateSignal',
      'climate_signal',
      'monthlyClimateSignal',
      'monthly_climate_signal',
    ]))
    const weatherImpactBand = new Set<string>(readMetadataTextArray(metadata, [
      'weatherImpactBand',
      'weather_impact_band',
      'weatherImpactBands',
      'weather_impact_bands',
    ]))

    const rainySeasonMonths = Array.isArray(climateRegion.rainySeasonMonths) ? climateRegion.rainySeasonMonths : []
    const floodSeasonMonths = Array.isArray((climateRegion as any).floodSeasonMonths) ? (climateRegion as any).floodSeasonMonths : []
    const highTempMonths = Array.isArray(climateRegion.highTempMonths) ? climateRegion.highTempMonths : []
    const coldWeatherMonths = Array.isArray(climateRegion.coldWeatherMonths) ? climateRegion.coldWeatherMonths : []
    if (rainySeasonMonths.includes(month) || floodSeasonMonths.includes(month)) climateSignal.add('rainy_season')
    if (highTempMonths.includes(month)) climateSignal.add('summer_heat')
    if (coldWeatherMonths.includes(month)) climateSignal.add('winter_low_temp')
    if (normalizeText(climateRegion.thermalZone)) climateSignal.add(normalizeText(climateRegion.thermalZone))

    for (const signal of weatherSignals) {
      climateSignal.add(signal.climateSignal)
      const band = weatherImpactBandFromSignal(signal)
      if (band) weatherImpactBand.add(band)
    }

    const projectTypeCode = [
      ...readNormalizedTextArray(input.projectTypeCode),
      ...readMetadataTextArray(metadata, ['projectTypeCode', 'project_type_code', 'projectType', 'project_type']),
    ]
    const structureTypeCode = [
      ...readNormalizedTextArray(input.structureTypeCode),
      ...readMetadataTextArray(metadata, ['structureTypeCode', 'structure_type_code', 'structureType', 'structure_type']),
    ]
    const methodVariantCode = [
      ...readNormalizedTextArray(input.methodVariantCodes),
      ...readMetadataTextArray(metadata, ['methodVariantCodes', 'method_variant_codes', 'methodVariantCode', 'method_variant_code']),
    ]
    const elementVariantCode = [
      ...readNormalizedTextArray(input.elementVariantCodes),
      ...readMetadataTextArray(metadata, ['elementVariantCodes', 'element_variant_codes', 'elementVariantCode', 'element_variant_code']),
    ]
    const spaceCleanlinessGrade = readMetadataTextArray(metadata, [
      'spaceCleanlinessGrade',
      'space_cleanliness_grade',
      'cleanroomLevel',
      'cleanroom_level',
      'cleanlinessGrade',
      'cleanliness_grade',
    ])
    const dangerControlLevel = readMetadataTextArray(metadata, [
      'dangerControlLevel',
      'danger_control_level',
      'dangerLevel',
      'danger_level',
      'dangerClassCodes',
      'danger_class_codes',
    ])

    return {
      climateSignal: [...climateSignal],
      weatherImpactBand: [...weatherImpactBand],
      thermalZone: [normalizeText(climateRegion.thermalZone)].filter(Boolean),
      methodVariantCode: [...new Set(methodVariantCode.map((item) => normalizeText(item)).filter(Boolean))],
      elementVariantCode: [...new Set(elementVariantCode.map((item) => normalizeText(item)).filter(Boolean))],
      projectTypeCode: [...new Set(projectTypeCode.map((item) => normalizeText(item)).filter(Boolean))],
      structureTypeCode: [...new Set(structureTypeCode.map((item) => normalizeText(item)).filter(Boolean))],
      spaceCleanlinessGrade: [...new Set(spaceCleanlinessGrade.map((item) => normalizeText(item)).filter(Boolean))],
      dangerControlLevel: [...new Set(dangerControlLevel.map((item) => normalizeText(item)).filter(Boolean))],
    }
  })
}

function applyProcessConstraintConditionalEffects(
  match: Record<string, unknown>,
  context: ProcessConstraintConditionContext,
) {
  const effects = Array.isArray(match.conditionalEffects ?? match.conditional_effects)
    ? (match.conditionalEffects ?? match.conditional_effects) as V1474ProcessConstraintConditionalEffect[]
    : []
  if (effects.length === 0) {
    return {
      match,
      appliedEffects: [] as AppliedProcessConstraintEffectSummary[],
      conditionalConfidenceDelta: 0,
      hasConditionalCandidateOnly: false,
    }
  }

  let effectiveMatch = { ...match }
  let conditionalConfidenceDelta = 0
  let hasConditionalCandidateOnly = false
  const appliedEffects: AppliedProcessConstraintEffectSummary[] = []

  for (const effect of effects) {
    const conditions = Array.isArray(effect.when) ? effect.when : []
    if (conditions.length === 0 || !conditions.every((condition) => processConstraintConditionMatches(condition, context))) continue

    const effectType = normalizeText(effect.effect)
    const adjustments: string[] = []
    const readNumeric = (value: unknown) => {
      const number = Number(value)
      return Number.isFinite(number) ? number : null
    }
    const tightenOverlapRelease = () => {
      const currentPartialOverlapRatio = clamp(
        readNumeric(effectiveMatch.partialOverlapRatio ?? effectiveMatch.partial_overlap_ratio) ?? 0,
        0,
        0.9,
      )
      const multiplier = clamp(readNumeric(effect.partialOverlapRatioMultiplier) ?? 1, 0.1, 1)
      const nextPartialOverlapRatio = clamp(currentPartialOverlapRatio * multiplier, 0, 0.9)
      effectiveMatch.partialOverlapRatio = nextPartialOverlapRatio
      effectiveMatch.partial_overlap_ratio = nextPartialOverlapRatio
      effectiveMatch.startAfterPercent = clamp(
        Math.max(
          readNumeric(effectiveMatch.startAfterPercent ?? effectiveMatch.start_after_percent) ?? 0,
          Math.round((1 - nextPartialOverlapRatio) * 100),
        ),
        0,
        100,
      )
      effectiveMatch.start_after_percent = effectiveMatch.startAfterPercent
      adjustments.push(`partialOverlapRatio=${nextPartialOverlapRatio}`)
      adjustments.push(`startAfterPercent=${effectiveMatch.startAfterPercent}`)
      if (effect.minReleaseQuantityPercentDelta != null) {
        const currentMinReleaseQuantityPercent = clamp(
          readNumeric(effectiveMatch.minReleaseQuantityPercent ?? effectiveMatch.min_release_quantity_percent) ?? 0,
          0,
          100,
        )
        const nextMinReleaseQuantityPercent = clamp(
          currentMinReleaseQuantityPercent + Number(effect.minReleaseQuantityPercentDelta ?? 0),
          0,
          100,
        )
        effectiveMatch.minReleaseQuantityPercent = nextMinReleaseQuantityPercent
        effectiveMatch.min_release_quantity_percent = nextMinReleaseQuantityPercent
        adjustments.push(`minReleaseQuantityPercent=${nextMinReleaseQuantityPercent}`)
      }
      if (effect.quantityEvidenceRequirement) {
        const nextRequirement = stricterQuantityEvidenceRequirement(
          normalizeText(effectiveMatch.quantityEvidenceRequirement) as V1474ProcessConstraintConditionalEffect['quantityEvidenceRequirement'],
          effect.quantityEvidenceRequirement,
        )
        effectiveMatch.quantityEvidenceRequirement = nextRequirement
        effectiveMatch.quantity_evidence_requirement = nextRequirement
        adjustments.push(`quantityEvidenceRequirement=${nextRequirement}`)
      }
      if (effect.quantityProxyRiskLevel) {
        const nextRisk = stricterQuantityProxyRiskLevel(
          normalizeText(effectiveMatch.quantityProxyRiskLevel) as V1474ProcessConstraintConditionalEffect['quantityProxyRiskLevel'],
          effect.quantityProxyRiskLevel,
        )
        effectiveMatch.quantityProxyRiskLevel = nextRisk
        effectiveMatch.quantity_proxy_risk_level = nextRisk
        adjustments.push(`quantityProxyRiskLevel=${nextRisk}`)
      }
    }

    if (effectType === 'tighten_overlap_release') {
      tightenOverlapRelease()
      conditionalConfidenceDelta -= 2
      hasConditionalCandidateOnly = true
    } else if (effectType === 'require_project_fact_gate') {
      if (effect.partialOverlapRatioMultiplier != null || effect.minReleaseQuantityPercentDelta != null) {
        tightenOverlapRelease()
      }
      effectiveMatch.gateRequired = true
      effectiveMatch.gate_required = true
      effectiveMatch.timeSourcePolicy = 'project_fact_then_standard_work_duration'
      effectiveMatch.time_source_policy = 'project_fact_then_standard_work_duration'
      const nextRequirement = stricterQuantityEvidenceRequirement(
        normalizeText(effectiveMatch.quantityEvidenceRequirement) as V1474ProcessConstraintConditionalEffect['quantityEvidenceRequirement'],
        effect.quantityEvidenceRequirement ?? 'real_quantity_required_for_auto_release',
      )
      effectiveMatch.quantityEvidenceRequirement = nextRequirement
      effectiveMatch.quantity_evidence_requirement = nextRequirement
      const nextRisk = stricterQuantityProxyRiskLevel(
        normalizeText(effectiveMatch.quantityProxyRiskLevel) as V1474ProcessConstraintConditionalEffect['quantityProxyRiskLevel'],
        effect.quantityProxyRiskLevel ?? 'high',
      )
      effectiveMatch.quantityProxyRiskLevel = nextRisk
      effectiveMatch.quantity_proxy_risk_level = nextRisk
      adjustments.push('gateRequired=true')
      adjustments.push('timeSourcePolicy=project_fact_then_standard_work_duration')
      adjustments.push(`quantityEvidenceRequirement=${nextRequirement}`)
      adjustments.push(`quantityProxyRiskLevel=${nextRisk}`)
      conditionalConfidenceDelta -= 4
      hasConditionalCandidateOnly = true
    } else if (effectType === 'confidence_down') {
      conditionalConfidenceDelta -= 6
    } else if (effectType === 'candidate_only') {
      conditionalConfidenceDelta -= 3
      hasConditionalCandidateOnly = true
    }

    appliedEffects.push({
      id: normalizeText(effect.id) || `conditional-effect-${appliedEffects.length + 1}`,
      effect: effect.effect,
      curationBasis: normalizeText(effect.curationBasis) || null,
      businessReasonTemplate: normalizeText(effect.businessReasonTemplate) || null,
      adjustments,
    })
  }

  if (appliedEffects.length > 0) {
    effectiveMatch.conditionalEffectIds = appliedEffects.map((item) => item.id)
    effectiveMatch.appliedConditionalEffectIds = appliedEffects.map((item) => item.id)
    effectiveMatch.conditionalEffectsApplied = appliedEffects
  }

  return {
    match: effectiveMatch,
    appliedEffects,
    conditionalConfidenceDelta,
    hasConditionalCandidateOnly,
  }
}

function normalizeRuntimeActionPolicy(value: unknown): DurationContextActionPolicy {
  const text = normalizeText(value).toLowerCase()
  if (text === 'confidence_only') return 'confidence_only'
  if (text === 'candidate_only') return 'candidate_only'
  return 'auto_apply'
}

function hasExplicitProcessConstraintCarrier(
  input: DurationContextInput,
  workContext: ProcessConstraintWorkContext,
  match: Record<string, unknown>,
) {
  if (!isDurationBearingContributionModeFromResolver(workContext.durationContributionMode)) return true

  const text = [
    compactFactorText(input),
    workContext.standardWorkName,
    workContext.standardWorkCode,
    workContext.resourceContextText,
  ].map(normalizeText).join(' ').toLowerCase()
  const constraintType = normalizeText(match.constraintType).toLowerCase()
  const hasAny = (terms: string[]) => terms.some((term) => text.includes(term.toLowerCase()))

  if (constraintType.includes('curing')) return hasAny(['curing', '\u517b\u62a4'])
  if (constraintType.includes('acceptance')) return hasAny(['acceptance', 'inspection', '\u9a8c\u6536', '\u9690\u853d'])
  if (constraintType.includes('test_report')) return hasAny(['test report', 'report', '\u8bd5\u9a8c\u62a5\u544a', '\u68c0\u6d4b\u62a5\u544a', '\u590d\u9a8c\u62a5\u544a'])
  if (constraintType.includes('handover')) return hasAny(['handover', '\u79fb\u4ea4', '\u4ea4\u63a5'])
  if (constraintType.includes('commissioning')) return hasAny(['commissioning', '\u8c03\u8bd5', '\u8bd5\u8fd0\u884c', '\u8054\u52a8'])
  if (constraintType.includes('technical_interval')) return hasAny(['test', 'inspection', '\u8bd5\u9a8c', '\u68c0\u6d4b', '\u95ed\u6c34', '\u6dcb\u6c34', '\u4fdd\u538b', '\u56fa\u5316'])

  if (constraintType.includes('weather_window')) return hasAny(['weather', 'rain', 'winter', 'temperature'])
  if (constraintType.includes('work_hour_window')) return hasAny(['night', 'noise', 'permit'])
  if (constraintType.includes('environment_control')) return hasAny(['dust', 'environment'])
  if (constraintType.includes('municipal_connection')) return hasAny(['municipal', 'utility', 'connection'])
  if (constraintType.includes('safety_control')) return hasAny(['safety', 'danger', 'high formwork', 'formwork', 'approval', 'release'])
  if (constraintType.includes('monitoring_observation')) return hasAny(['monitoring', 'observation', 'foundation pit', 'deep pit', 'settlement'])
  if (constraintType.includes('temperature_control')) return hasAny(['hot', 'heat', 'temperature', 'concrete'])

  return false
}

function normalizeQuantityUnit(value: unknown) {
  return normalizeText(value).toLowerCase().replace(/\u33a1/g, 'm2').replace(/\u00b2/g, '2').replace(/\s+/g, '')
}

function quantityUnitsCompatible(left: unknown, right: unknown) {
  const leftUnit = normalizeQuantityUnit(left)
  const rightUnit = normalizeQuantityUnit(right)
  if (!leftUnit || !rightUnit) return false
  if (leftUnit === rightUnit) return true
  const aliases: string[][] = [
    ['m', 'meter', 'metre', '\u7c73'],
    ['m2', 'sqm', '\u5e73\u7c73', '\u5e73\u65b9\u7c73'],
    ['m3', 'cbm', '\u7acb\u65b9', '\u7acb\u65b9\u7c73'],
    ['t', 'ton', 'tons', '\u5428'],
    ['set', 'sets', '\u53f0', '\u5957'],
    ['point', 'points', '\u70b9', '\u4e2a'],
    ['floor', '\u5c42'],
    ['zone', '\u533a', '\u6bb5'],
    ['system', '\u7cfb\u7edf'],
    ['shaft', '\u4e95\u9053'],
    ['workface', '\u5de5\u4f5c\u9762'],
  ]
  return aliases.some((group) => group.includes(leftUnit) && group.includes(rightUnit))
}

function readPositiveSeedNumber(record: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = readPositiveNumberOrNull(record[key])
    if (value != null) return value
  }
  return null
}

function readReleaseQuantitySourcePriority(match: Record<string, unknown>) {
  const allowed = [
    'task_planned_completed_quantity',
    'standard_work_duration_default_quantity',
    'scope_granularity_proxy',
  ]
  const configured = readNormalizedTextArray(match.quantitySourcePriority ?? match.quantity_source_priority)
    .map((item) => item.toLowerCase())
    .filter((item) => allowed.includes(item))
  return allowed.filter((item) => item === 'task_planned_completed_quantity' || configured.includes(item) || configured.length === 0)
}

async function buildReleaseQuantityGate(
  input: DurationContextInput,
  match: Record<string, unknown>,
  seedContext: AlgorithmSeedResolveContext,
  contextText: string,
) {
  const applicationMode = normalizeText(match.applicationMode ?? match.application_mode)
  const releaseQuantityPolicy = normalizeText(match.releaseQuantityPolicy ?? match.release_quantity_policy)
  if (applicationMode !== 'edge_overlap' || releaseQuantityPolicy === 'not_applicable') {
    return {
      releaseQuantityPolicy: releaseQuantityPolicy || 'not_applicable',
      releaseDecision: 'not_applicable',
    }
  }

  const minReleaseQuantityPercent = clamp(
    readNumber(
      match.minReleaseQuantityPercent ?? match.min_release_quantity_percent,
      readNumber(match.startAfterPercent ?? match.start_after_percent, 100),
    ),
    0,
    100,
  )
  const plannedQuantity = readPositiveNumberOrNull(input.plannedQuantity)
  const completedQuantity = readPositiveNumberOrNull(input.completedQuantity)
  const taskQuantityUnit = normalizeText(input.quantityUnit) || null
  const quantityEvidenceRequirement = normalizeText(
    match.quantityEvidenceRequirement ?? match.quantity_evidence_requirement,
  )
  const realQuantityRequired = quantityEvidenceRequirement === 'real_quantity_required_for_auto_release'
  const quantitySourcePriority = readReleaseQuantitySourcePriority(match)
  const rawDurationLookupKeys = match.durationLookupKeys ?? match.duration_lookup_keys
  const durationLookupKeys: unknown[] = Array.isArray(rawDurationLookupKeys)
    ? rawDurationLookupKeys
    : []
  let durationSeed: Record<string, unknown> | null = null
  for (const source of quantitySourcePriority) {
    if (source === 'task_planned_completed_quantity' && plannedQuantity && completedQuantity != null) {
      const completionPercent = clamp((completedQuantity / plannedQuantity) * 100, 0, 999)
      const satisfied = completionPercent >= minReleaseQuantityPercent
      return {
        releaseQuantityPolicy,
        releaseDecision: satisfied ? 'real_quantity_satisfied' : 'real_quantity_not_satisfied',
        releaseActionPolicy: satisfied ? 'candidate_only' : 'confidence_only',
        minReleaseQuantityPercent,
        quantitySourcePriority,
        actualReleasePercent: Number(completionPercent.toFixed(1)),
        plannedQuantity,
        completedQuantity,
        quantityUnit: taskQuantityUnit,
        releaseReason: satisfied
          ? `已完成工程量 ${Number(completionPercent.toFixed(1))}%，达到搭接释放门槛 ${minReleaseQuantityPercent}%`
          : `已完成工程量 ${Number(completionPercent.toFixed(1))}%，未达到搭接释放门槛 ${minReleaseQuantityPercent}%`,
      }
    }

    if (realQuantityRequired && source !== 'task_planned_completed_quantity') {
      break
    }

    if (source === 'standard_work_duration_default_quantity') {
      durationSeed ??= await resolveStandardWorkDurationSeed(contextText, {
        ...seedContext,
        contextKeywords: [
          ...(Array.isArray(seedContext.contextKeywords) ? seedContext.contextKeywords : []),
          ...durationLookupKeys,
        ].map(normalizeText).filter(Boolean),
      })
      const defaultQuantity = durationSeed ? readPositiveSeedNumber(durationSeed, 'defaultQuantity', 'default_quantity') : null
      const defaultQuantityUnit = durationSeed
        ? normalizeText(durationSeed.defaultQuantityUnit ?? durationSeed.default_quantity_unit ?? durationSeed.quantityUnitHint ?? durationSeed.quantity_unit_hint) || null
        : null
      if (defaultQuantity && (!taskQuantityUnit || quantityUnitsCompatible(taskQuantityUnit, defaultQuantityUnit))) {
        return {
          releaseQuantityPolicy,
          releaseDecision: 'standard_duration_quantity_proxy',
          releaseActionPolicy: 'candidate_only',
          minReleaseQuantityPercent,
          quantitySourcePriority,
          defaultQuantity,
          defaultQuantityUnit,
          proxyReleaseQuantity: Number((defaultQuantity * (minReleaseQuantityPercent / 100)).toFixed(2)),
          proxyConfidence: 'low',
          durationSeedStableCode: durationSeed?.stableCode ?? durationSeed?.stable_code ?? durationSeed?.__stableCode ?? null,
          releaseReason: 'Missing measured quantity; using default seed quantity as a low-confidence release proxy until measured quantity or workface facts are confirmed.',
        }
      }
    }

    if (source === 'scope_granularity_proxy') {
      break
    }
  }

  return {
    releaseQuantityPolicy,
    releaseDecision: realQuantityRequired ? 'real_quantity_required_missing' : 'scope_granularity_proxy',
    releaseActionPolicy: realQuantityRequired ? 'confidence_only' : 'candidate_only',
    minReleaseQuantityPercent,
    quantitySourcePriority,
    scopeGranularity: match.scopeGranularity ?? match.scope_granularity ?? null,
    proxyConfidence: 'low',
    quantityEvidenceRequirement,
    releaseReason: `Missing measured quantity and compatible default quantity; using ${normalizeText(match.scopeGranularity ?? match.scope_granularity) || 'scope'} workface only as a low-confidence overlap candidate`,
  }
}

export async function buildProcessConstraintFactor(input: DurationContextInput): Promise<DurationContextFactor | null> {
  const seedContext = buildSeedResolveContext(input)
  const workContext = await resolveEffectiveProcessConstraintWorkContext(input as Record<string, unknown>, seedContext)
  const contextText = [
    compactFactorText(input),
    workContext.resourceContextText,
    workContext.standardWorkName,
    workContext.standardWorkCode,
  ].map(normalizeText).filter(Boolean).join(' ')
  const rawMatch = await resolveV1474ProcessConstraint(contextText, {
    ...seedContext,
    standardWorkCode: workContext.standardWorkCode ?? seedContext.standardWorkCode,
    standardWorkCodes: Array.from(new Set([
      ...(Array.isArray(seedContext.standardWorkCodes) ? seedContext.standardWorkCodes : []),
      workContext.standardWorkCode,
    ].map(normalizeId).filter(Boolean) as string[])),
    standardCatalogCodePrefixes: workContext.standardCatalogCodePrefixes,
    templateNodeStableCodePrefixes: workContext.templateNodeStableCodePrefixes,
    standardWorkSource: workContext.standardWorkSource,
    titleWeakScore: workContext.titleWeakScore,
    titleWeakRuleId: workContext.titleWeakRuleId,
    contextKeywords: [workContext.resourceContextText],
  })
  if (!rawMatch) return null

  const conditionContext = await buildProcessConstraintConditionContext(input, workContext)
  const conditionAwareMatch = applyProcessConstraintConditionalEffects(rawMatch, conditionContext)
  const match = conditionAwareMatch.match

  const partialOverlapRatio = clamp(Number(match.partialOverlapRatio ?? match.partial_overlap_ratio ?? 0) || 0, 0, 0.9)
  const startAfterPercent = clamp(Number(match.startAfterPercent ?? match.start_after_percent ?? Math.round((1 - partialOverlapRatio) * 100)) || 100, 0, 100)
  const impactMode = normalizeText(match.impactMode ?? match.impact_mode)
  const applicationMode = normalizeText(match.applicationMode ?? match.application_mode)
  const explicitCarrierDetected = hasExplicitProcessConstraintCarrier(input, workContext, match)
  const releaseGate = await buildReleaseQuantityGate(input, match, seedContext, contextText)
  const releaseActionPolicy = normalizeRuntimeActionPolicy((releaseGate as Record<string, unknown>).releaseActionPolicy)
  const rawActionPolicy = normalizeRuntimeActionPolicy(match.runtimeActionPolicy ?? match.runtime_action_policy)
  const actionPolicy = explicitCarrierDetected || conditionAwareMatch.hasConditionalCandidateOnly || applicationMode === 'confidence_only' || applicationMode !== 'edge_overlap'
    ? 'confidence_only'
    : releaseActionPolicy === 'confidence_only'
      ? 'confidence_only'
      : rawActionPolicy === 'confidence_only'
        ? 'confidence_only'
        : 'candidate_only'
  const rawMultiplier = impactMode === 'multiplier'
    ? readNumber(match.multiplier ?? match.durationMultiplier ?? match.duration_multiplier, 1)
    : 1
  const processConstraintMultiplier = normalizeProcessConstraintMultiplier(rawMultiplier)
  const extraDays = 0
  const reason = explicitCarrierDetected
    ? 'This constraint is already answered by an explicit carrier process or duration seed; process_constraint records routing and confidence only, without adding duplicate days.'
    : applicationMode === 'edge_overlap'
      ? 'This dependency edge allows scope overlap; concrete duration and wait days are answered by standard duration seeds or project facts.'
      : 'This dependency edge has gate or technical constraints; process_constraint routes timing source only, without storing or adding concrete wait days.'

  return {
    key: 'process_constraint',
    label: '工序约束',
    multiplier: actionPolicy === 'confidence_only' ? 1 : processConstraintMultiplier.multiplier,
    extraDays: Math.max(0, extraDays),
    confidenceDelta: (match.confidence === 'low' ? -5 : 0)
      + (explicitCarrierDetected ? -2 : 0)
      + (workContext.standardWorkSource === 'title_weak_fallback' ? -3 : 0)
      + conditionAwareMatch.conditionalConfidenceDelta,
    actionPolicy,
    dataDependencies: ['algorithm_seed_records.process_constraint'],
    reason,
    source: 'v1.4.7.4_seed',
    metadata: {
      stableCode: match.stableCode,
      factorCapPolicy: processConstraintMultiplier.capMetadata,
      constraintType: match.constraintType,
      applicationMode,
      impactMode,
      blockingLevel: match.blockingLevel ?? null,
      progressImpact: match.progressImpact ?? null,
      timeNature: match.timeNature ?? null,
      relationshipScope: match.relationshipScope ?? match.relationship_scope ?? null,
      relationInputPolicy: match.relationInputPolicy ?? match.relation_input_policy ?? null,
      dependencyCreationPolicy: match.dependencyCreationPolicy ?? match.dependency_creation_policy ?? null,
      parallelAllowedPolicy: match.parallelAllowedPolicy ?? match.parallel_allowed_policy ?? null,
      supportedRelationKinds: match.supportedRelationKinds ?? match.supported_relation_kinds ?? [],
      timeSourcePolicy: match.timeSourcePolicy ?? match.time_source_policy ?? null,
      durationLookupPolicy: match.durationLookupPolicy ?? match.duration_lookup_policy ?? null,
      durationLookupKeys: match.durationLookupKeys ?? match.duration_lookup_keys ?? [],
      carrierProcessHints: match.carrierProcessHints ?? match.carrier_process_hints ?? [],
      durationAuthorityPolicy: match.durationAuthorityPolicy ?? match.duration_authority_policy ?? null,
      partialOverlapRatio,
      startAfterPercent,
      scopeGranularity: match.scopeGranularity ?? match.scope_granularity ?? null,
      gateRequired: match.gateRequired ?? match.gate_required ?? null,
      releaseQuantityPolicy: match.releaseQuantityPolicy ?? match.release_quantity_policy ?? null,
      minReleaseQuantityPercent: match.minReleaseQuantityPercent ?? match.min_release_quantity_percent ?? null,
      quantitySourcePriority: match.quantitySourcePriority ?? match.quantity_source_priority ?? [],
      quantityEvidenceRequirement: match.quantityEvidenceRequirement ?? match.quantity_evidence_requirement ?? null,
      quantityProxyRiskLevel: match.quantityProxyRiskLevel ?? match.quantity_proxy_risk_level ?? null,
      insufficientQuantityPolicy: match.insufficientQuantityPolicy ?? match.insufficient_quantity_policy ?? null,
      quantityDoubleCountPolicy: match.quantityDoubleCountPolicy ?? match.quantity_double_count_policy ?? null,
      releaseGate,
      explicitCarrierDetected,
      explicitCarrierPolicy: match.explicitCarrierPolicy ?? match.explicit_carrier_policy ?? null,
      durationDoubleCountPolicy: match.durationDoubleCountPolicy ?? match.duration_double_count_policy ?? null,
      conditionalEffectCount: conditionAwareMatch.appliedEffects.length,
      conditionalEffectsApplied: conditionAwareMatch.appliedEffects,
      conditionContext,
      standardWorkSource: workContext.standardWorkSource,
      standardWorkCode: workContext.standardWorkCode,
      standardCatalogCodePrefixes: workContext.standardCatalogCodePrefixes,
      templateNodeStableCodePrefixes: workContext.templateNodeStableCodePrefixes,
      titleWeakScore: workContext.titleWeakScore,
      titleWeakRuleId: workContext.titleWeakRuleId,
      matchSource: match.processConstraintMatchSource ?? null,
      keywordMatched: match.processConstraintKeywordMatched ?? null,
      titleWeakBridged: match.processConstraintTitleWeakBridged ?? null,
      durationContributionMode: workContext.durationContributionMode,
      executionNature: workContext.executionNature,
      resolverSource: match.__resolverSource,
    },
  }
}
