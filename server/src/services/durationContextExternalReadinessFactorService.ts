import { inclusiveDurationDays, normalizeDurationDateUtc, signedDurationDayDelta } from '../utils/durationDays.js'
import {
  inferDurationContributionModeFromResolver,
  inferExecutionNatureFromResolver,
  inferTitleWeakStandardWorkMatchesFromResolver,
  inferWorkEnvironmentFromResolver,
  isDurationBearingContributionModeFromResolver,
  normalizeExecutionNatureFromResolver,
  normalizeWorkEnvironmentFromResolver,
  resolveDurationContributionModeFromResolver,
  resolveStandardWorkDurationSeed,
  type AlgorithmSeedResolveContext,
  type DurationContributionMode,
  type ExecutionNature,
  type WorkEnvironment,
} from './algorithmSeedResolver.js'
import {
  readDurationContextTaskMaterialRows,
  readDurationContextTaskProgressSnapshotRows,
  readDurationContextTaskReadinessSignalRows,
} from './durationContextFactReadModelService.js'
import { loadPublishedProjectProductivityCalibration } from './projectProductivityCalibrationStore.js'
import type {
  DurationContextFactor,
  DurationContextInput,
} from '../types/durationContext.js'
import type {
  ActiveReadinessRows,
  ProgressSnapshotFacts,
} from '../types/durationContext.js'

type DurationContextRuntimeCache = {
  activeReadinessRowsByTaskId: Map<string, Promise<ActiveReadinessRows>>
  progressSnapshotFactsByTaskId: Map<string, Promise<ProgressSnapshotFacts>>
  externalReadinessCalibrationByProjectId: Map<string, Promise<ExternalReadinessCalibrationOverlay>>
}

type DurationContextProgressCurve = 'linear' | 'front_heavy' | 'back_heavy' | 's_curve' | 'hold'

type EffectiveStandardWorkContext = {
  standardWorkCode: string | null
  standardWorkName: string | null
  standardWorkSource: 'explicit' | 'title_weak_fallback' | 'unresolved'
  titleWeakScore: number | null
  titleWeakRuleId: string | null
  standardCatalogCodePrefixes: string[]
  templateNodeStableCodePrefixes: string[]
  durationContributionMode: DurationContributionMode
  executionNature: ExecutionNature
  progressCurve: DurationContextProgressCurve | null
  progressCurveSource: string | null
  workEnvironment: WorkEnvironment
  resourcePressureEligibility: 'strong' | 'limited' | 'weak_fallback' | 'non_duration'
  resourcePressureWeight: number
  resourceContextText: string
  durationSeedStableCode: string | null
  durationSeedResolverSource: string | null
}

type ReadinessSignalSummary = {
  hardConditionCount: number
  startHardConditionCount: number
  processHardConditionCount: number
  finishHardConditionCount: number
  drawingHardConditionCount: number
  softConditionCount: number
  startSoftConditionCount: number
  processSoftConditionCount: number
  finishSoftConditionCount: number
  staleConditionDowngradedCount: number
  unknownConditionTargetDateCount: number
  obstacleImpactCount: number
  obstacleObservationCount: number
  recoveredObstacleCount: number
  unknownObstacleResolutionDateCount: number
  materialPendingWithDateCount: number
  materialPendingWithoutDateCount: number
  materialOverdueCount: number
  materialStartDelayDays: number
  maxMaterialExpectedArrivalDate: string | null
  explicitMaterialLinkCount: number
  fallbackMaterialLinkCount: number
  primaryBusinessReasonType: string | null
}

export type ExternalReadinessCalibrationOverlay = {
  applied: boolean
  calibrationId: string | null
  source: string
  weightScale: {
    impactScore: number
    extraDays: number
    confidencePenalty: number
  }
}

const OPEN_CONDITION_STATUSES = ['pending', 'open', 'active', 'blocked', 'not_satisfied', '\u5f85\u6ee1\u8db3', '\u672a\u6ee1\u8db3', '\u53d7\u963b']
const OPEN_OBSTACLE_STATUSES = ['pending', 'open', 'active', 'resolving', 'in_progress', 'blocked', '\u5f85\u5904\u7406', '\u5904\u7406\u4e2d', '\u53d7\u963b']

const EXTERNAL_READINESS_SCORING_POLICY = {
  startHardConditionWeight: 2,
  processHardConditionWeight: 0.6,
  finishHardConditionWeightByProgress: [
    { progress: 70, weight: 1 },
    { progress: 50, weight: 0.6 },
    { progress: 20, weight: 0.3 },
  ],
  drawingHardConditionWeight: 1.2,
  softConditionObservationWeight: 0.4,
  obstacleImpactWeight: 2,
  materialOverdueExplicitWeight: 2,
  materialOverdueFallbackWeight: 1,
  materialStartDelayWeight: 2,
  multiplierKneeScore: 5,
  multiplierPrimarySlope: 0.04,
  multiplierSecondarySlope: 0.02,
  multiplierMax: 1.35,
  materialExtraDaysMax: 21,
  confidencePenaltyMax: 35,
}

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

function normalizeId(value: unknown) {
  const text = normalizeText(value)
  return text || null
}

function normalizeLower(value: unknown) {
  return normalizeText(value).toLowerCase()
}

function normalizeDate(value: unknown) {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString().slice(0, 10)
  const text = normalizeText(value)
  if (!text) return null
  const normalized = normalizeDurationDateUtc(text)
  return normalized ? normalized.toISOString().slice(0, 10) : null
}

function parseDate(value: unknown) {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value
  const normalized = normalizeDate(value)
  if (!normalized) return null
  const parsed = new Date(`${normalized}T00:00:00.000Z`)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function readNumber(value: unknown, fallback: number) {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

function readBoolean(value: unknown, fallback = false) {
  if (value === true || value === 1 || value === 'true' || value === '1') return true
  if (value === false || value === 0 || value === 'false' || value === '0') return false
  return fallback
}

function readNormalizedTextArray(value: unknown) {
  if (Array.isArray(value)) return value.map(normalizeText).filter(Boolean)
  const text = normalizeText(value)
  if (!text) return []
  return text.split(',').map((item) => item.trim()).filter(Boolean)
}

function uniqueTextArray(values: unknown[]) {
  const items = values.flatMap((value) => readNormalizedTextArray(value))
  return Array.from(new Set(items))
}

function uniqueIds(values: Array<unknown>) {
  return [...new Set(values.map(normalizeId).filter(Boolean) as string[])]
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

function resolveResourcePressureEligibility(input: {
  standardWorkSource: EffectiveStandardWorkContext['standardWorkSource']
  durationContributionMode: DurationContributionMode
  executionNature: ExecutionNature
}) {
  const isDurationBearing = isDurationBearingContributionModeFromResolver(input.durationContributionMode)
  if (!isDurationBearing) {
    return {
      resourcePressureEligibility: 'non_duration' as const,
      resourcePressureWeight: 0.25,
    }
  }

  const baseWeight = input.executionNature === 'physical_work'
    ? 1
    : input.executionNature === 'technical_preparation'
      ? 0.6
      : 0.4

  if (input.standardWorkSource === 'title_weak_fallback') {
    return {
      resourcePressureEligibility: baseWeight >= 1 ? 'weak_fallback' as const : 'limited' as const,
      resourcePressureWeight: Math.min(baseWeight, 0.65),
    }
  }

  return {
    resourcePressureEligibility: baseWeight >= 1 ? 'strong' as const : 'limited' as const,
    resourcePressureWeight: baseWeight,
  }
}

function normalizeProgressCurve(value: unknown): DurationContextProgressCurve | null {
  const text = normalizeText(value).toLowerCase().replace(/[\s-]+/g, '_')
  if (!text) return null
  if (['linear', 'line'].includes(text)) return 'linear'
  if (['front_heavy', 'frontloaded', 'front_loaded', 'early_heavy'].includes(text)) return 'front_heavy'
  if (['back_heavy', 'backloaded', 'back_loaded', 'late_heavy'].includes(text)) return 'back_heavy'
  if (['s_curve', 'scurve', 's'].includes(text)) return 's_curve'
  if (['hold', 'wait', 'waiting', 'acceptance_hold', 'curing_hold'].includes(text)) return 'hold'
  return null
}

function readProgressCurveFromRecord(record: Record<string, unknown>) {
  const profile = readRecord(
    record.progressProfile
      ?? record.progress_profile
      ?? record.progressPressureProfile
      ?? record.progress_pressure_profile,
  )
  return normalizeProgressCurve(
    record.progressCurve
      ?? record.progress_curve
      ?? record.durationProgressCurve
      ?? record.duration_progress_curve
      ?? profile.curve
      ?? profile.progressCurve
      ?? profile.progress_curve,
  )
}

async function resolveEffectiveStandardWorkContext(
  task: Record<string, unknown>,
  baseContext: AlgorithmSeedResolveContext,
): Promise<EffectiveStandardWorkContext> {
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
  let standardWorkSource: EffectiveStandardWorkContext['standardWorkSource'] = standardWorkCode ? 'explicit' : 'unresolved'
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
  const { resourcePressureEligibility, resourcePressureWeight } = resolveResourcePressureEligibility({
    standardWorkSource,
    durationContributionMode,
    executionNature,
  })
  const seedKeywords = Array.isArray(seedMetadata.keywords)
    ? seedMetadata.keywords.map(normalizeText).filter(Boolean)
    : []
  const taskProgressCurve = readProgressCurveFromRecord(metadata)
  const seedProgressCurve = readProgressCurveFromRecord(seedMetadata)
  const progressCurve = taskProgressCurve ?? seedProgressCurve
  const progressCurveSource = taskProgressCurve
    ? 'task_metadata'
    : seedProgressCurve
      ? 'duration_seed'
      : null
  const workEnvironment = normalizeWorkEnvironmentFromResolver(metadata.workEnvironment ?? metadata.work_environment)
    ?? normalizeWorkEnvironmentFromResolver(seedMetadata.workEnvironment ?? seedMetadata.work_environment)
    ?? inferWorkEnvironmentFromResolver(rawText, { ...seedMetadata, ...metadata })

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
    progressCurve,
    progressCurveSource,
    workEnvironment,
    resourcePressureEligibility,
    resourcePressureWeight,
    resourceContextText: [
      rawText,
      standardWorkCode,
      standardWorkName,
      ...seedKeywords,
    ].map(normalizeText).filter(Boolean).join(' '),
    durationSeedStableCode: normalizeId(seedMetadata.stableCode ?? seedMetadata.__stableCode),
    durationSeedResolverSource: normalizeId(seedMetadata.__resolverSource),
  }
}

function compactSourceEntityKeys(rows: Array<Record<string, unknown>>, fallbackType: string) {
  const keys = rows
    .map((row) => {
      const entityType = normalizeId(row.source_entity_type ?? row.sourceType ?? row.source_type) ?? fallbackType
      const entityId = normalizeId(row.source_entity_id ?? row.source_ref_id ?? row.sourceEntityId ?? row.id)
      return entityId ? `${entityType}:${entityId}` : null
    })
    .filter((key): key is string => Boolean(key))
  return Array.from(new Set(keys)).slice(0, 20)
}

function isOpenCondition(row: Record<string, unknown>) {
  const status = normalizeId(row.status)
  if (status && !OPEN_CONDITION_STATUSES.includes(status)) return false
  if (row.is_satisfied === true || row.is_satisfied === 1 || row.is_satisfied === 'true') return false
  return true
}

function isOpenObstacle(row: Record<string, unknown>) {
  const status = normalizeId(row.status)
  if (!status) return true
  return OPEN_OBSTACLE_STATUSES.includes(status)
}

function isHardCondition(row: Record<string, unknown>) {
  const blockingLevel = normalizeLower(row.blocking_level)
  if (['hard', 'blocked', 'critical', '\u786c\u6761\u4ef6', '\u53d7\u963b'].includes(blockingLevel)) return true
  if (blockingLevel === 'soft' || blockingLevel === 'info') return false
  return readBoolean(row.required_for_start, false)
}

function isStrongObstacle(row: Record<string, unknown>) {
  const level = normalizeLower(row.progress_impact_level ?? row.impact_level ?? row.blocking_level)
  const severity = normalizeLower(row.severity)
  return ['blocked', 'severe', 'critical', '\u53d7\u963b', '\u4e25\u91cd'].includes(level)
    || ['critical', 'high', '\u4e25\u91cd', '\u9ad8'].includes(severity)
}

function isDrawingCondition(row: Record<string, unknown>) {
  const text = [
    row.condition_type,
    row.source_type,
    row.source_entity_type,
    row.description,
    row.title,
  ].map(normalizeLower).join(' ')
  return ['drawing', 'shop_drawing', 'design', '\u56fe\u7eb8', '\u6df1\u5316', '\u8bbe\u8ba1'].some((token) => text.includes(token))
}

function isMaterialCondition(row: Record<string, unknown>) {
  const text = [
    row.condition_type,
    row.source_type,
    row.source_entity_type,
    row.description,
    row.title,
  ].map(normalizeLower).join(' ')
  return ['material', 'project_material', 'materials', '\u6750\u6599', '\u5230\u8d27', '\u5c01\u6837'].some((token) => text.includes(token))
}

function classifyConditionPhase(row: Record<string, unknown>): 'start' | 'process' | 'finish' {
  if (readBoolean(row.required_for_start, false)) return 'start'
  const text = [
    row.condition_type,
    row.source_type,
    row.source_entity_type,
    row.description,
    row.title,
  ].map(normalizeLower).join(' ')
  if ([
    'acceptance', 'inspection', 'test', 'commission', 'handover', 'closeout', 'document', 'rectification',
    '\u9a8c\u6536', '\u62a5\u9a8c', '\u68c0\u6d4b', '\u8bd5\u9a8c', '\u8c03\u8bd5', '\u79fb\u4ea4', '\u8d44\u6599', '\u6574\u6539', '\u6536\u5c3e',
  ].some((token) => text.includes(token))) return 'finish'
  if ([
    'process', 'hold_point', 'quality_control', 'sample', 'mockup',
    '\u8fc7\u7a0b', '\u6837\u677f', '\u6837\u677f\u95f4', '\u8d28\u91cf\u63a7\u5236', '\u65c1\u7ad9',
  ].some((token) => text.includes(token))) return 'process'
  return 'start'
}

function finishConditionTimingWeight(progress: number | null | undefined) {
  const value = Number(progress ?? 0)
  for (const tier of EXTERNAL_READINESS_SCORING_POLICY.finishHardConditionWeightByProgress) {
    if (value >= tier.progress) return tier.weight
  }
  return 0
}

function externalReadinessMultiplier(impactScore: number) {
  if (impactScore <= 0) return 1
  const policy = EXTERNAL_READINESS_SCORING_POLICY
  const primaryScore = Math.min(impactScore, policy.multiplierKneeScore)
  const secondaryScore = Math.max(0, impactScore - policy.multiplierKneeScore)
  return clamp(
    1 + primaryScore * policy.multiplierPrimarySlope + secondaryScore * policy.multiplierSecondarySlope,
    1.03,
    policy.multiplierMax,
  )
}

function normalizeExternalReadinessCalibrationOverlay(
  calibration: Awaited<ReturnType<typeof loadPublishedProjectProductivityCalibration>>,
): ExternalReadinessCalibrationOverlay {
  const payload = readRecord(calibration?.parameterPayload)
  const scale = readRecord(payload.externalReadinessWeightScale ?? payload.external_readiness_weight_scale)
  const weightScale = {
    impactScore: clamp(readNumber(scale.impactScore ?? scale.impact_score, 1), 0.4, 1.4),
    extraDays: clamp(readNumber(scale.extraDays ?? scale.extra_days, 1), 0.4, 1.4),
    confidencePenalty: clamp(readNumber(scale.confidencePenalty ?? scale.confidence_penalty, 1), 0.4, 1.4),
  }
  return {
    applied: Boolean(calibration && Object.keys(scale).length > 0),
    calibrationId: calibration?.id ?? null,
    source: calibration && Object.keys(scale).length > 0
      ? 'published_project_productivity_calibration'
      : 'default_policy_no_published_overlay',
    weightScale,
  }
}

async function loadExternalReadinessCalibrationOverlay(projectId?: string | null, runtimeCache?: DurationContextRuntimeCache) {
  const normalizedProjectId = normalizeId(projectId)
  if (!normalizedProjectId) return normalizeExternalReadinessCalibrationOverlay(null)
  if (runtimeCache) {
    const current = runtimeCache.externalReadinessCalibrationByProjectId.get(normalizedProjectId)
    if (current) return current
    const promise = loadExternalReadinessCalibrationOverlay(normalizedProjectId)
    runtimeCache.externalReadinessCalibrationByProjectId.set(normalizedProjectId, promise)
    return promise
  }
  const calibration = await loadPublishedProjectProductivityCalibration(normalizedProjectId).catch(() => null)
  return normalizeExternalReadinessCalibrationOverlay(calibration)
}

function isActiveMaterial(row: Record<string, unknown>) {
  const recordStatus = normalizeLower(row.record_status)
  const lifecycleStatus = normalizeLower(row.lifecycle_status)
  if (recordStatus && recordStatus !== 'active') return false
  if (['archived', 'voided', 'deleted', 'inactive'].includes(lifecycleStatus)) return false
  return !row.actual_arrival_date
}

export async function loadActiveReadinessRows(input: DurationContextInput, runtimeCache?: DurationContextRuntimeCache): Promise<ActiveReadinessRows> {
  const taskId = normalizeId(input.taskId)
  if (!taskId) return { conditions: [] as Record<string, unknown>[], obstacles: [] as Record<string, unknown>[], materials: [] as Record<string, unknown>[] }
  if (runtimeCache) {
    const cacheKey = taskId || '__none__'
    const current = runtimeCache.activeReadinessRowsByTaskId.get(cacheKey)
    if (current) return current
    const promise = loadActiveReadinessRows(input)
    runtimeCache.activeReadinessRowsByTaskId.set(cacheKey, promise)
    return promise
  }

  const rawReadinessRows = await readDurationContextTaskReadinessSignalRows({ taskId })
  const conditions = rawReadinessRows.conditions.filter(isOpenCondition)
  const obstacles = rawReadinessRows.obstacles.filter(isOpenObstacle)

  const explicitMaterialIds = uniqueIds((conditions as Array<Record<string, unknown>>).flatMap((condition) => {
    if (!isMaterialCondition(condition)) return []
    return [
      condition.source_ref_id,
      condition.sourceRefId,
      condition.source_entity_id,
      condition.sourceEntityId,
    ]
  }))

  const materialRows = await readDurationContextTaskMaterialRows({ taskId, explicitMaterialIds })
  const materials = materialRows.filter(isActiveMaterial).map((row: Record<string, unknown>) => ({
    ...row,
    __linkage_quality: explicitMaterialIds.length > 0 ? 'explicit_condition' : 'linked_task_fallback',
  }))

  return {
    conditions: conditions as Record<string, unknown>[],
    obstacles: obstacles as Record<string, unknown>[],
    materials: materials as Record<string, unknown>[],
  }
}

export async function loadTaskProgressSnapshotFacts(taskId: string | null, runtimeCache?: DurationContextRuntimeCache): Promise<ProgressSnapshotFacts> {
  const empty: ProgressSnapshotFacts = {
    snapshotCount: 0,
    firstProgressDate: null,
    firstProgressDateText: null,
    recentSpanDays: 0,
    recentProgressDelta: 0,
    recoveredByTrend: false,
    stagnantByTrend: false,
    recentRecoveredByTrend: false,
    progressOscillationByTrend: false,
    recoverySegmentCount: 0,
    stagnantOrRegressionSegmentCount: 0,
  }
  if (!taskId) return empty
  if (runtimeCache) {
    const cacheKey = taskId || '__none__'
    const current = runtimeCache.progressSnapshotFactsByTaskId.get(cacheKey)
    if (current) return current
    const promise = loadTaskProgressSnapshotFacts(taskId)
    runtimeCache.progressSnapshotFactsByTaskId.set(cacheKey, promise)
    return promise
  }

  const data = await readDurationContextTaskProgressSnapshotRows({ taskId, limit: 30 })
  if (data.length === 0) return empty

  const snapshots = data
    .map((row) => ({
      date: parseDate(row.snapshot_date ?? row.created_at),
      progress: clamp(Number(row.progress ?? 0), 0, 100),
    }))
    .filter((row): row is { date: Date; progress: number } => Boolean(row.date))
    .sort((a, b) => a.date.getTime() - b.date.getTime())

  if (snapshots.length === 0) return empty

  const firstProgress = snapshots.find((snapshot) => snapshot.progress > 0) ?? null
  const recent = snapshots.slice(-3)
  const firstRecent = recent[0]
  const lastRecent = recent[recent.length - 1]
  const recentSpanDays = firstRecent && lastRecent ? inclusiveDurationDays(firstRecent.date, lastRecent.date) ?? 1 : 0
  const recentProgressDelta = firstRecent && lastRecent ? lastRecent.progress - firstRecent.progress : 0
  const recentRecoveredByTrend = recent.length >= 2
    && recentSpanDays >= 2
    && recentProgressDelta >= 8
    && lastRecent.progress > (recent[recent.length - 2]?.progress ?? 0)
  const recentStagnantByTrend = recent.length >= 2
    && recentSpanDays >= 5
    && recentProgressDelta <= 2
    && lastRecent.progress > 0
    && lastRecent.progress < 100
  const progressSegments = snapshots.slice(1).map((snapshot, index) => {
    const previous = snapshots[index]
    const spanDays = inclusiveDurationDays(previous.date, snapshot.date) ?? 1
    const progressDelta = snapshot.progress - previous.progress
    return { spanDays, progressDelta, progress: snapshot.progress }
  })
  const recoverySegmentCount = progressSegments.filter((segment) => (
    segment.spanDays >= 2 && segment.progressDelta >= 8
  )).length
  const stagnantOrRegressionSegmentCount = progressSegments.filter((segment) => (
    (segment.spanDays >= 5 && segment.progressDelta <= 2 && segment.progress > 0 && segment.progress < 100)
    || segment.progressDelta <= -3
  )).length
  const progressOscillationByTrend = snapshots.length >= 4
    && recoverySegmentCount >= 2
    && stagnantOrRegressionSegmentCount >= 1
  const recoveredByTrend = recentRecoveredByTrend && !progressOscillationByTrend
  const stagnantByTrend = recentStagnantByTrend || progressOscillationByTrend

  return {
    snapshotCount: snapshots.length,
    firstProgressDate: firstProgress?.date ?? null,
    firstProgressDateText: firstProgress ? firstProgress.date.toISOString().slice(0, 10) : null,
    recentSpanDays,
    recentProgressDelta,
    recoveredByTrend,
    stagnantByTrend,
    recentRecoveredByTrend,
    progressOscillationByTrend,
    recoverySegmentCount,
    stagnantOrRegressionSegmentCount,
  }
}

export function summarizeExternalReadinessCause(
  rows: ActiveReadinessRows,
  timing: ReturnType<typeof buildProgressTimingAssessment> | null,
  progressFacts?: ProgressSnapshotFacts | null,
) {
  const progressLooksRecovered = Boolean(progressFacts?.recoveredByTrend)
  const plannedStart = parseDate((timing as any)?.plannedStart)
  let materialCause = false
  let drawingCause = false
  let hardConditionCause = false
  let obstacleCause = false
  let softConditionCause = false

  for (const material of rows.materials) {
    const expected = parseDate(material.expected_arrival_date)
    if (expected || material.__linkage_quality === 'explicit_condition') materialCause = true
    if (plannedStart && expected && expected > plannedStart) materialCause = true
  }

  for (const condition of rows.conditions) {
    const hard = isHardCondition(condition)
    if (isDrawingCondition(condition) && hard) drawingCause = true
    if (hard && classifyConditionPhase(condition) === 'start') hardConditionCause = true
    if (!hard) softConditionCause = true
  }

  for (const obstacle of rows.obstacles) {
    if (!progressLooksRecovered && isStrongObstacle(obstacle)) obstacleCause = true
  }

  const primaryBusinessReasonType = materialCause
    ? 'material'
    : drawingCause
      ? 'drawing'
      : hardConditionCause
        ? 'hard_condition'
        : obstacleCause
          ? 'obstacle'
          : softConditionCause
            ? 'soft_condition'
            : null

  return {
    hasExternalTimingCause: Boolean(materialCause || drawingCause || hardConditionCause || obstacleCause),
    primaryBusinessReasonType,
  }
}

function resolveProgressPressureProfile(task: Record<string, unknown>, workContext?: EffectiveStandardWorkContext | null): {
  curve: DurationContextProgressCurve
  minElapsedRatio: number
  minExpectedProgress: number
  deficitThreshold: number
  reason: string
} {
  if (workContext && !isDurationBearingContributionModeFromResolver(workContext.durationContributionMode)) {
    return { curve: 'hold', minElapsedRatio: 0.7, minExpectedProgress: 60, deficitThreshold: 35, reason: `non_duration_${workContext.durationContributionMode}` }
  }
  if (workContext?.progressCurve) {
    const curve = workContext.progressCurve
    if (curve === 'hold') return { curve, minElapsedRatio: 0.65, minExpectedProgress: 55, deficitThreshold: 30, reason: `explicit_${workContext.progressCurveSource}` }
    if (curve === 'front_heavy') return { curve, minElapsedRatio: 0.25, minExpectedProgress: 25, deficitThreshold: 18, reason: `explicit_${workContext.progressCurveSource}` }
    if (curve === 's_curve') return { curve, minElapsedRatio: 0.35, minExpectedProgress: 25, deficitThreshold: 18, reason: `explicit_${workContext.progressCurveSource}` }
    if (curve === 'back_heavy') return { curve, minElapsedRatio: 0.45, minExpectedProgress: 25, deficitThreshold: 20, reason: `explicit_${workContext.progressCurveSource}` }
    return { curve, minElapsedRatio: 0.25, minExpectedProgress: 25, deficitThreshold: 15, reason: `explicit_${workContext.progressCurveSource}` }
  }

  const text = [
    workContext?.standardWorkCode,
    workContext?.standardWorkName,
    task.standard_work_code,
    task.standard_work_name,
    task.title,
    workContext?.resourceContextText,
  ].map((item) => normalizeText(item).toLowerCase()).join(' ')
  const includes = (tokens: string[]) => tokens.some((token) => text.includes(token))

  if (includes([
    'acceptance', 'commission', 'closeout', 'punch', 'curing', 'cure', 'drying', 'wait', 'inspection', 'test', 'approval', 'permit',
    '\u9a8c\u6536', '\u8c03\u8bd5', '\u6536\u5c3e', '\u79fb\u4ea4', '\u517b\u62a4', '\u9f84\u671f', '\u7b49\u5f85', '\u667e\u7f6e', '\u56fa\u5316', '\u5e72\u71e5', '\u68c0\u6d4b', '\u8bd5\u9a8c', '\u9001\u68c0', '\u62a5\u9a8c', '\u5ba1\u6279',
  ])) {
    return { curve: 'hold', minElapsedRatio: 0.65, minExpectedProgress: 55, deficitThreshold: 30, reason: 'hold_or_acceptance_like' }
  }

  if (includes([
    'rebar', 'masonry', 'plaster', 'waterproof',
    '\u94a2\u7b4b', '\u780c\u4f53', '\u780c\u7b51', '\u62b9\u7070', '\u9632\u6c34',
  ])) {
    return { curve: 'front_heavy', minElapsedRatio: 0.25, minExpectedProgress: 25, deficitThreshold: 18, reason: 'front_heavy_process' }
  }

  if (includes([
    'mep', 'installation', 'fitout', 'ceiling', 'partition', 'tile', 'putty',
    '\u673a\u7535', '\u5b89\u88c5', '\u88c5\u9970', '\u7cbe\u88c5', '\u540a\u9876', '\u9694\u5899', '\u5899\u5730\u7816', '\u8d34\u7816', '\u817b\u5b50',
  ])) {
    return { curve: 's_curve', minElapsedRatio: 0.35, minExpectedProgress: 25, deficitThreshold: 18, reason: 's_curve_installation_or_fitout' }
  }

  return { curve: 'linear', minElapsedRatio: 0.25, minExpectedProgress: 25, deficitThreshold: 15, reason: 'linear_default' }
}

function expectedProgressForCurve(curve: DurationContextProgressCurve, elapsedRatio: number) {
  const ratio = clamp(elapsedRatio, 0, 1)
  if (curve === 'front_heavy') return (1 - ((1 - ratio) ** 1.35)) * 100
  if (curve === 'back_heavy' || curve === 'hold') return (ratio ** 1.45) * 100
  if (curve === 's_curve') return ((3 * ratio * ratio) - (2 * ratio * ratio * ratio)) * 100
  return ratio * 100
}

function buildProgressTimingAssessment(
  task: Record<string, unknown>,
  workContext?: EffectiveStandardWorkContext | null,
  progressFacts?: ProgressSnapshotFacts | null,
) {
  const progress = clamp(Number(task.progress ?? 0), 0, 100)
  const plannedStart = parseDate(task.plannedStartDate ?? task.planned_start_date ?? task.start_date)
  const plannedEnd = parseDate(task.plannedEndDate ?? task.planned_end_date ?? task.end_date)
  const explicitActualStart = parseDate(task.actualStartDate ?? task.actual_start_date)
  const actualStart = explicitActualStart ?? progressFacts?.firstProgressDate ?? (progress > 0 ? plannedStart : null)
  if (!plannedStart || !plannedEnd || !actualStart || progress <= 0 || progress >= 100) return null

  const today = new Date()
  if (today < actualStart) return null
  const plannedDuration = inclusiveDurationDays(plannedStart, plannedEnd) ?? 1
  const elapsedDays = inclusiveDurationDays(actualStart, today) ?? 1
  const elapsedRatio = clamp(elapsedDays / plannedDuration, 0, 1)
  const profile = resolveProgressPressureProfile(task, workContext)
  const expectedProgress = clamp(expectedProgressForCurve(profile.curve, elapsedRatio), 0, 100)
  const progressDeficit = Math.max(0, expectedProgress - progress)
  const progressSurplus = Math.max(0, progress - expectedProgress)
  const canJudgePressure = elapsedRatio >= profile.minElapsedRatio && expectedProgress >= profile.minExpectedProgress
  const isProgressPressure = canJudgePressure && progressDeficit > profile.deficitThreshold
  const overdueDays = today > plannedEnd ? Math.max(0, (inclusiveDurationDays(plannedEnd, today) ?? 1) - 1) : 0
  const isFinishingStalled = progress >= 90 && progress < 100 && overdueDays > 0

  return {
    progress,
    plannedStart,
    plannedEnd,
    actualStart,
    actualStartSource: explicitActualStart ? 'actual_start_date' : progressFacts?.firstProgressDate ? 'progress_snapshot' : 'planned_start_fallback',
    plannedDuration,
    elapsedDays,
    elapsedRatio,
    expectedProgress,
    progressDeficit,
    progressSurplus,
    overdueDays,
    isFinishingStalled,
    isProgressPressure,
    isProgressNormal: !isProgressPressure && !isFinishingStalled,
    profile,
  }
}

export async function buildExternalReadinessFactor(input: DurationContextInput, runtimeCache?: DurationContextRuntimeCache): Promise<DurationContextFactor | null> {
  const rows = await loadActiveReadinessRows(input, runtimeCache)
  const total = rows.conditions.length + rows.obstacles.length + rows.materials.length
  if (total <= 0) return null

  const calibrationOverlay = await loadExternalReadinessCalibrationOverlay(input.projectId, runtimeCache)
  const seedContext = buildSeedResolveContext(input)
  const workContext = await resolveEffectiveStandardWorkContext(input as Record<string, unknown>, seedContext)
  const progressFacts = await loadTaskProgressSnapshotFacts(normalizeId(input.taskId), runtimeCache)
  const timing = buildProgressTimingAssessment(input as Record<string, unknown>, workContext, progressFacts)
  const progressLooksNormal = Boolean(timing?.isProgressNormal && !timing.isFinishingStalled) || progressFacts.recoveredByTrend
  const plannedStart = parseDate(input.plannedStartDate)
  const today = new Date()

  const summary: ReadinessSignalSummary = {
    hardConditionCount: 0,
    startHardConditionCount: 0,
    processHardConditionCount: 0,
    finishHardConditionCount: 0,
    drawingHardConditionCount: 0,
    softConditionCount: 0,
    startSoftConditionCount: 0,
    processSoftConditionCount: 0,
    finishSoftConditionCount: 0,
    staleConditionDowngradedCount: 0,
    unknownConditionTargetDateCount: 0,
    obstacleImpactCount: 0,
    obstacleObservationCount: 0,
    recoveredObstacleCount: 0,
    unknownObstacleResolutionDateCount: 0,
    materialPendingWithDateCount: 0,
    materialPendingWithoutDateCount: 0,
    materialOverdueCount: 0,
    materialStartDelayDays: 0,
    maxMaterialExpectedArrivalDate: null,
    explicitMaterialLinkCount: 0,
    fallbackMaterialLinkCount: 0,
    primaryBusinessReasonType: null,
  }

  for (const condition of rows.conditions) {
    const hard = isHardCondition(condition)
    const phase = classifyConditionPhase(condition)
    if (!parseDate(condition.target_date)) summary.unknownConditionTargetDateCount += 1
    if (progressLooksNormal) {
      summary.staleConditionDowngradedCount += 1
    } else if (hard) {
      summary.hardConditionCount += 1
      if (phase === 'start') summary.startHardConditionCount += 1
      if (phase === 'process') summary.processHardConditionCount += 1
      if (phase === 'finish') summary.finishHardConditionCount += 1
      if (isDrawingCondition(condition)) summary.drawingHardConditionCount += 1
    } else {
      summary.softConditionCount += 1
      if (phase === 'start') summary.startSoftConditionCount += 1
      if (phase === 'process') summary.processSoftConditionCount += 1
      if (phase === 'finish') summary.finishSoftConditionCount += 1
    }
  }

  for (const obstacle of rows.obstacles) {
    if (!parseDate(obstacle.estimated_resolve_date ?? obstacle.expected_resolution_date)) {
      summary.unknownObstacleResolutionDateCount += 1
    }
    if (progressLooksNormal) {
      summary.recoveredObstacleCount += 1
    } else if (isStrongObstacle(obstacle)) {
      summary.obstacleImpactCount += 1
    } else {
      summary.obstacleObservationCount += 1
    }
  }

  for (const material of rows.materials) {
    if (material.__linkage_quality === 'explicit_condition') summary.explicitMaterialLinkCount += 1
    if (material.__linkage_quality === 'linked_task_fallback') summary.fallbackMaterialLinkCount += 1
    const expected = parseDate(material.expected_arrival_date)
    if (!expected) {
      summary.materialPendingWithoutDateCount += 1
      continue
    }
    summary.materialPendingWithDateCount += 1
    const expectedDate = normalizeDate(material.expected_arrival_date)
    if (expectedDate && (!summary.maxMaterialExpectedArrivalDate || expectedDate > summary.maxMaterialExpectedArrivalDate)) {
      summary.maxMaterialExpectedArrivalDate = expectedDate
    }
    if (expected < today) summary.materialOverdueCount += 1
    if (!progressLooksNormal && plannedStart && expected > plannedStart) {
      const delayDays = signedDurationDayDelta(plannedStart, expected) ?? 0
      summary.materialStartDelayDays = Math.max(summary.materialStartDelayDays, delayDays)
    }
  }

  const finishTimingWeight = finishConditionTimingWeight(timing?.progress)
  const processConditionTimingWeight = timing && timing.progress > 0 && timing.progress < 100
    ? EXTERNAL_READINESS_SCORING_POLICY.processHardConditionWeight
    : 0
  const explicitMaterialWeight = summary.explicitMaterialLinkCount > 0
    ? EXTERNAL_READINESS_SCORING_POLICY.materialOverdueExplicitWeight
    : EXTERNAL_READINESS_SCORING_POLICY.materialOverdueFallbackWeight
  const timingHardConditionScore = summary.startHardConditionCount * EXTERNAL_READINESS_SCORING_POLICY.startHardConditionWeight
    + summary.processHardConditionCount * processConditionTimingWeight
    + summary.finishHardConditionCount * finishTimingWeight
    + summary.drawingHardConditionCount * (EXTERNAL_READINESS_SCORING_POLICY.drawingHardConditionWeight - 1)
  const impactScore = timingHardConditionScore
    + summary.obstacleImpactCount * EXTERNAL_READINESS_SCORING_POLICY.obstacleImpactWeight
    + summary.materialOverdueCount * explicitMaterialWeight
    + (summary.materialStartDelayDays > 0 ? EXTERNAL_READINESS_SCORING_POLICY.materialStartDelayWeight : 0)
  const confidenceOnlySignals = summary.softConditionCount * EXTERNAL_READINESS_SCORING_POLICY.softConditionObservationWeight
    + summary.obstacleObservationCount
    + summary.recoveredObstacleCount
    + summary.staleConditionDowngradedCount
    + summary.materialPendingWithoutDateCount
    + (progressLooksNormal ? summary.materialPendingWithDateCount : 0)
  const hasTimingImpact = impactScore > 0 || summary.materialStartDelayDays > 0
  const externalCause = summarizeExternalReadinessCause(rows, timing, progressFacts)
  summary.primaryBusinessReasonType = externalCause.primaryBusinessReasonType
  const effectiveImpactScore = Number((impactScore * calibrationOverlay.weightScale.impactScore).toFixed(3))
  const multiplier = hasTimingImpact ? externalReadinessMultiplier(effectiveImpactScore) : 1
  const extraDays = hasTimingImpact
    ? Math.floor(clamp(
      summary.materialStartDelayDays * calibrationOverlay.weightScale.extraDays,
      0,
      EXTERNAL_READINESS_SCORING_POLICY.materialExtraDaysMax,
    ))
    : 0
  const confidencePenalty = Math.min(
    EXTERNAL_READINESS_SCORING_POLICY.confidencePenaltyMax,
    (impactScore * 5 + confidenceOnlySignals * 3) * calibrationOverlay.weightScale.confidencePenalty,
  )

  return {
    key: 'external_readiness',
    label: 'external readiness',
    multiplier,
    extraDays,
    confidenceDelta: -confidencePenalty,
    actionPolicy: hasTimingImpact ? 'candidate_only' : 'confidence_only',
    dataDependencies: ['task_conditions', 'task_obstacles', 'project_materials'],
    reason: hasTimingImpact
      ? 'Readiness facts with business timing impact were included as candidate duration context, with material, drawing, hard condition and obstacle causes kept separate.'
      : 'Open readiness facts are retained as confidence signals because current execution facts do not prove a timing impact.',
    source: 'external_readiness',
    metadata: {
      ...summary,
      progressLooksNormal,
      progressCurve: timing?.profile.curve ?? null,
      progressProfileReason: timing?.profile.reason ?? null,
      expectedProgress: timing?.expectedProgress ?? null,
      actualProgress: timing?.progress ?? null,
      progressSnapshotCount: progressFacts.snapshotCount,
      progressRecoveredByTrend: progressFacts.recoveredByTrend,
      materialLinkagePolicy: summary.explicitMaterialLinkCount > 0 ? 'explicit_condition_first' : 'linked_task_fallback',
      conditionPhasePolicy: 'start_affects_earliest_start_process_and_finish_affect_running_or_closeout',
      readinessReasonPriority: ['material', 'drawing', 'hard_condition', 'obstacle', 'soft_condition'],
      readinessScoringPolicy: EXTERNAL_READINESS_SCORING_POLICY,
      finishConditionTimingWeight: finishTimingWeight,
      processConditionTimingWeight,
      timingHardConditionScore,
      impactScore,
      effectiveImpactScore,
      confidenceOnlySignals,
      confidencePenalty,
      materialExtraDaysCap: EXTERNAL_READINESS_SCORING_POLICY.materialExtraDaysMax,
      externalReadinessCalibration: {
        applied: calibrationOverlay.applied,
        calibrationId: calibrationOverlay.calibrationId,
        source: calibrationOverlay.source,
        weightScale: calibrationOverlay.weightScale,
      },
      sourceEntityKeys: [
        ...compactSourceEntityKeys(rows.conditions, 'task_condition'),
        ...compactSourceEntityKeys(rows.obstacles, 'task_obstacle'),
        ...compactSourceEntityKeys(rows.materials, 'project_material'),
      ].slice(0, 30),
    },
  }
}
