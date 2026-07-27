import { getProjectCompanyId, isUuidLike } from '../auth/access.js'
import { logger } from '../middleware/logger.js'
import { supabase } from './dbService.js'
import {
  getAlgorithmSeedEntry,
  getAlgorithmSeedStableCode,
  isAlgorithmSeedPayloadActive,
  normalizeAlgorithmSeedRecordPayload,
  type AlgorithmSeedRecordPayload,
  type AlgorithmSeedType,
} from './algorithmSeedRegistry.js'
import {
  getTitleWeakRecognizability,
  inferTitleWeakScaleSignal,
  matchTitleWeakRecognitionRule,
  sanitizeTitleWeakRecognitionText,
  type TitleWeakScaleSignal,
} from '../seeds/v1472TitleWeakRecognitionSeed.js'
import {
  describeDurationContributionMode,
  isDurationBearingContributionMode,
  inferDurationContributionMode,
  normalizeDurationContributionMode,
  type DurationContributionMode,
} from '../seeds/durationContributionMode.js'
import {
  SCHEDULE_ACCELERATION_DEFAULT_PROFILE_CODE,
  SCHEDULE_ACCELERATION_DEFAULT_RESOURCE_CRASH_CAP,
  SCHEDULE_ACCELERATION_HARD_CONSTRAINT_TYPES,
  SCHEDULE_ACCELERATION_MIN_RESOURCE_CRASH_CAP,
  SCHEDULE_ACCELERATION_PROFILE_SEED,
  SCHEDULE_ACCELERATION_PROFILE_SOURCE,
  SCHEDULE_ACCELERATION_RESOURCE_CRASH_CAP_SEED,
  SCHEDULE_ACCELERATION_SEASONAL_FACTOR_SEED,
} from '../seeds/scheduleAccelerationProfileSeed.js'
import {
  deriveV1474SeasonalProductivityRegion,
  normalizeV1474SeasonalProductivityRegion,
} from '../seeds/v1474SeasonalProductivitySeed.js'
import {
  findV1474ResourceClassMatch,
  inferV1474ResourcePressureDimensions,
  type V1474PressureDimension,
} from '../seeds/v1474ResourceClassSeed.js'
import {
  inferExecutionNature,
  normalizeExecutionNature,
  type ExecutionNature,
} from '../seeds/executionNature.js'
import {
  isV1474ProcessSeasonalSensitivityClimateEligible,
  type V1474ProcessSeasonalEligibilityContext,
} from '../seeds/v1474ProcessSeasonalSensitivitySeed.js'
import { workEnvironmentMatches, inferWorkEnvironment, normalizeWorkEnvironment, type WorkEnvironment } from '../seeds/workEnvironment.js'
import type {
  V1474ProcessConstraintCondition,
  V1474ProcessConstraintConditionalEffect,
} from '../seeds/v1474ProcessConstraintSeed.js'
import {
  buildForecastWorkCalendarRecords,
} from '../utils/workCalendarForecastBuilder.js'
import type { DefaultMasterPlanVisibilityPolicyRecord } from './defaultMasterPlanVisibilityService.js'
import {
  classifyAlgorithmSeedRuntimeRole,
  mapAlgorithmSeedResolverSource,
  type DurationAssetRole,
  type EffectiveDurationAssetSource,
} from './durationAssetRuntimeContractService.js'

export type ResolvedAlgorithmSeedRecord<T extends AlgorithmSeedRecordPayload = AlgorithmSeedRecordPayload> = T & {
  __stableCode: string
  __resolverSource: 'project_override' | 'company_override' | 'active_seed' | 'ts_seed_fallback'
  __resolverVersionId?: string | null
  __runtimeRole?: DurationAssetRole
  __effectiveRuntimeSource?: EffectiveDurationAssetSource
}

export type StandardWorkDurationSeedResolverProductivity = {
  p50PerDay?: number
  p50_per_day?: number
  unit?: string
  basis?: string
} | null

export type StandardWorkDurationSeedResolverProductivityBand = {
  conditionCode?: string
  condition_code?: string
  baselineProductivity?: StandardWorkDurationSeedResolverProductivity
  baseline_productivity?: StandardWorkDurationSeedResolverProductivity
}

export type StandardWorkDurationSeedResolverRecord = ResolvedAlgorithmSeedRecord<AlgorithmSeedRecordPayload & {
  stableCode?: string
  stable_code?: string
  standardWorkCode?: string
  standard_work_code?: string
  defaultDaysP20?: number
  default_days_p20?: number
  defaultDaysP50?: number
  default_days_p50?: number
  defaultDaysP80?: number
  default_days_p80?: number
  durationCoverageMode?: string
  duration_coverage_mode?: string
  scaleBasis?: string
  scale_basis?: string
  baselineProductivity?: StandardWorkDurationSeedResolverProductivity
  baseline_productivity?: StandardWorkDurationSeedResolverProductivity
  productivityBands?: StandardWorkDurationSeedResolverProductivityBand[]
  productivity_bands?: StandardWorkDurationSeedResolverProductivityBand[]
}>

export type T2DivisionRhythmTemplateResolverRecord = ResolvedAlgorithmSeedRecord<AlgorithmSeedRecordPayload & {
  stableCode?: string
  stable_code?: string
  templateId?: string
  template_id?: string
  rhythm?: Record<string, unknown>
  sourceVersion?: string
  source_version?: string
}>

export type AlgorithmSeedResolverSource = ResolvedAlgorithmSeedRecord['__resolverSource']
export type {
  DurationContributionMode,
  ExecutionNature,
  V1474PressureDimension,
  V1474ProcessConstraintCondition,
  V1474ProcessConstraintConditionalEffect,
  WorkEnvironment,
}

export type AlgorithmSeedResolverStableCodeDiagnostics = {
  stableCode: string
  effectiveSource: AlgorithmSeedResolverSource
  suppressedSources: AlgorithmSeedResolverSource[]
  priorityOrder: AlgorithmSeedResolverSource[]
  sourcePrecedenceTrace: Array<{
    source: AlgorithmSeedResolverSource
    decision: 'effective' | 'suppressed_by_higher_priority'
    versionIds: Array<string | null>
  }>
  conflictReason: 'higher_priority_project_override' | 'higher_priority_company_override' | 'higher_priority_active_seed' | null
  sourceCount: number
  versionIds: Array<string | null>
}

export type AlgorithmSeedResolverDiagnostics = {
  seedType: AlgorithmSeedType
  projectId: string | null
  companyId: string | null
  fallbackUsed: boolean
  fallbackReason: 'explicit_built_in_only' | 'governed_records_empty' | 'schema_missing' | 'resolver_error' | null
  fallbackRiskLevel: 'none' | 'low' | 'medium' | 'high'
  recommendedAction: 'none' | 'import_active_seed_version' | 'check_seed_schema' | 'inspect_resolver_error'
  sourcesByStableCode: Record<string, AlgorithmSeedResolverStableCodeDiagnostics>
  sourcePrecedenceTrace: Array<{
    stableCode: string
    effectiveSource: AlgorithmSeedResolverSource
    suppressedSources: AlgorithmSeedResolverSource[]
    conflictReason: AlgorithmSeedResolverStableCodeDiagnostics['conflictReason']
  }>
  sourceCounts: Partial<Record<AlgorithmSeedResolverSource, number>>
  generatedAt: string
}

export type AlgorithmSeedResolutionWithDiagnostics<T extends AlgorithmSeedRecordPayload = AlgorithmSeedRecordPayload> = {
  records: ResolvedAlgorithmSeedRecord<T>[]
  diagnostics: AlgorithmSeedResolverDiagnostics
}

export type V1475SeedMatchContext = {
  standardWorkCode?: string | null
  standardWorkCodes?: string[] | null
  standardCatalogCodePrefixes?: string[] | null
  templateNodeStableCodePrefixes?: string[] | null
  templateNodeId?: string | null
  standardWorkSource?: string | null
  titleWeakScore?: number | null
  titleWeakRuleId?: string | null
  methodVariantCodes?: string[] | null
  elementVariantCodes?: string[] | null
  projectTypeCode?: string | null
  structureTypeCode?: string | null
  applicableGranularity?: string | null
  contextKeywords?: string[] | null
  scopeDimensions?: string[] | null
  rhythmDrivers?: string[] | null
  primaryWorkfaceType?: string | null
  phaseWindow?: string | null
  expansionStrategy?: string | null
  workEnvironment?: string | null
  algorithmFactContext?: Record<string, unknown> | null
  featureProfile?: Record<string, unknown> | null
  monthlyClimateSignal?: string | null
  rainySeasonMonths?: number[] | null
  floodSeasonMonths?: number[] | null
  highTempMonths?: number[] | null
  coldWeatherMonths?: number[] | null
}

export type AlgorithmSeedResolveContext = V1475SeedMatchContext & {
  projectId?: string | null
  companyId?: string | null
  algorithmSeedLookupStableCodes?: string[] | null
  sourcePolicy?: 'governed_runtime' | 'built_in_only'
}

export type V1474HolidayWindowLookup = number | {
  date?: string | null
  year?: number | string | null
  month?: number | string | null
}

export type V1474BuildingPatternMatchConfidence = 'high' | 'medium' | 'low'

export type V1474BuildingPatternMatch = {
  record: ResolvedAlgorithmSeedRecord | null
  patternCode: string | null
  matchScore: number
  matchWeight?: number
  confidenceScore: number
  confidenceLevel: V1474BuildingPatternMatchConfidence
  matchedSignals: string[]
  missingSignals: string[]
  actionPolicy: 'backend_consume' | 'confidence_only' | 'candidate_only'
  mergedPatternCodes?: string[]
  secondaryMatches?: Array<{
    patternCode: string | null
    matchScore: number
    matchWeight: number
    confidenceScore: number
    confidenceLevel: V1474BuildingPatternMatchConfidence
  }>
  mergedDurationCurveProfile?: Record<string, unknown>
  durationProfileContributions?: Array<{
    patternCode: string | null
    weight: number
    durationCurveProfile: Record<string, unknown>
  }>
  weightedTypicalCycleDays?: {
    firstFloor: number
    midFloors: number
    lastFloors: number
  } | null
  hardDeadlinePriority?: number
  staggerMergePolicy?: 'dedupe_by_rule_code_then_hard_deadline_priority'
  mergedStaggerRules?: Array<{
    ruleCode: string
    predecessor: string
    successor: string
    lagUnit: string
    lagValue: number
    relation: string
    sourcePatternCode: string | null
    priority: number
  }>
  staggerRuleContributions?: Array<{
    patternCode: string | null
    weight: number
    hardDeadlinePriority: number
    staggerRules: Array<{
      ruleCode: string
      predecessor: string
      successor: string
      lagUnit: string
      lagValue: number
      relation: string
      priority: number
    }>
  }>
  typicalCycleDayContributions?: Array<{
    patternCode: string | null
    methodCode: string | null
    weight: number
    cycleDays: {
      firstFloor: number
      midFloors: number
      lastFloors: number
    }
  }>
}

export type V1474BuildingPatternMatches = V1474BuildingPatternMatch[]

type V1474BuildingPatternCandidate = {
  record: ResolvedAlgorithmSeedRecord
  score: number
  index: number
  confidenceScore: number
  hardDeadlinePriority: number
  matchedSignals: string[]
  missingSignals: string[]
}

type AlgorithmSeedResolverCacheEntry = {
  expiresAt: number
  value: Promise<ResolvedAlgorithmSeedRecord[]>
}

const BUILDING_PATTERN_METHOD_VARIANT_ALIASES: Record<string, string[]> = {
  aluminum_form_early_strip: ['aluminum_form_early_strip', 'aluminum_formwork'],
  aluminum_formwork: ['aluminum_formwork', 'aluminum_form_early_strip'],
  wood_form: ['wood_form', 'wood_formwork', 'timber_formwork'],
  wood_formwork: ['wood_formwork', 'wood_form', 'timber_formwork'],
  timber_formwork: ['timber_formwork', 'wood_form', 'wood_formwork'],
  large_form: ['large_form', 'large_formwork', 'full_steel_large_formwork', 'steel_formwork'],
  large_formwork: ['large_formwork', 'large_form', 'full_steel_large_formwork', 'steel_formwork'],
  full_steel_large_formwork: ['full_steel_large_formwork', 'large_form', 'large_formwork', 'steel_formwork'],
  climbing_form: ['climbing_form', 'climbing_formwork'],
  climbing_formwork: ['climbing_formwork', 'climbing_form'],
  flying_form: ['flying_form', 'flying_formwork'],
  flying_formwork: ['flying_formwork', 'flying_form'],
}

const ALGORITHM_SEED_RESOLVER_CACHE_TTL_MS = 30_000
const ALGORITHM_SEED_RESOLVER_CACHE_MAX = 200
const ACTIVE_SYSTEM_SEED_CACHE_TTL_MS = 5 * 60_000
const ACTIVE_SYSTEM_SEED_CACHE_MAX = 500
const DEFAULT_ALGORITHM_SEED_RESOLVER_READ_TIMEOUT_MS = 4_000
const algorithmSeedResolverCache = new Map<string, AlgorithmSeedResolverCacheEntry>()
const activeSystemSeedRecordCache = new Map<string, AlgorithmSeedResolverCacheEntry>()
const activeSystemSeedVersionCache = new Map<string, { expiresAt: number; value: Promise<string | null> }>()
const algorithmSeedOverrideCache = new Map<string, AlgorithmSeedResolverCacheEntry>()

class AlgorithmSeedResolverReadTimeoutError extends Error {
  readonly code = 'ALGORITHM_SEED_RESOLVER_READ_TIMEOUT'

  constructor(readonly operation: string, readonly timeoutMs: number) {
    super(`${operation} timed out after ${timeoutMs}ms`)
    this.name = 'AlgorithmSeedResolverReadTimeoutError'
  }
}

function readPositiveIntegerEnv(name: string, fallback: number) {
  const value = Number(process.env[name])
  return Number.isFinite(value) && value >= 0 ? Math.floor(value) : fallback
}

async function withAlgorithmSeedResolverReadBudget<T>(
  operation: string,
  promiseLike: PromiseLike<T>,
): Promise<T> {
  const timeoutMs = readPositiveIntegerEnv(
    'ALGORITHM_SEED_RESOLVER_READ_TIMEOUT_MS',
    DEFAULT_ALGORITHM_SEED_RESOLVER_READ_TIMEOUT_MS,
  )
  if (timeoutMs <= 0) return Promise.resolve(promiseLike)

  let timeout: ReturnType<typeof setTimeout> | null = null
  try {
    return await Promise.race([
      Promise.resolve(promiseLike),
      new Promise<T>((_resolve, reject) => {
        timeout = setTimeout(() => {
          reject(new AlgorithmSeedResolverReadTimeoutError(operation, timeoutMs))
        }, timeoutMs)
      }),
    ])
  } finally {
    if (timeout) clearTimeout(timeout)
  }
}

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

function normalizeNumber(value: unknown) {
  const numberValue = Number(value)
  return Number.isFinite(numberValue) ? numberValue : null
}

function normalizeDateText(value: unknown) {
  const text = normalizeText(value)
  return /^\d{4}-\d{2}-\d{2}/.test(text) ? text.slice(0, 10) : null
}

function normalizeTextArray(value: unknown) {
  const values = Array.isArray(value) ? value : [value]
  return Array.from(new Set(values.map(normalizeText).filter(Boolean)))
}

function normalizeMethodVariantCode(value: unknown) {
  return normalizeText(value).toLowerCase().replace(/[\s-]+/g, '_')
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function expandMethodVariantCodes(values: unknown) {
  const normalized = normalizeTextArray(values).map(normalizeMethodVariantCode)
  return Array.from(new Set(normalized.flatMap((item) => BUILDING_PATTERN_METHOD_VARIANT_ALIASES[item] ?? [item])))
}

function isTitleWeakMethodVariantHint(record: AlgorithmSeedRecordPayload) {
  return normalizeText(record.signalType ?? record.signal_type).toLowerCase() === 'method_variant_hint'
}

async function inferTitleWeakMethodVariantCodesFromResolver(text: string, context: AlgorithmSeedResolveContext = {}) {
  const records = await resolveTitleWeakRecognitionRules(text, context)
  return normalizeTextArray(records
    .filter(isTitleWeakMethodVariantHint)
    .map((record) => record.code ?? record.stableCode ?? record.stable_code ?? record.__stableCode))
}

async function enrichBuildingPatternContextFromTitle(text: string, context: AlgorithmSeedResolveContext = {}): Promise<AlgorithmSeedResolveContext> {
  const explicitMethods = normalizeTextArray(context.methodVariantCodes)
  const weakMethods = await inferTitleWeakMethodVariantCodesFromResolver(text, context)
  const methodVariantCodes = expandMethodVariantCodes([...explicitMethods, ...weakMethods])
  const contextKeywords = normalizeTextArray([
    ...(context.contextKeywords ?? []),
    ...weakMethods.map((code) => `method:${code}`),
  ])
  const rhythmDrivers = normalizeTextArray([
    ...(context.rhythmDrivers ?? []),
    methodVariantCodes.length > 0 ? 'method_variant' : null,
  ])
  return {
    ...context,
    methodVariantCodes,
    contextKeywords,
    rhythmDrivers,
  }
}

function readHolidayYear(record: AlgorithmSeedRecordPayload) {
  const explicit = normalizeNumber(record.year)
  if (explicit) return explicit
  const fromStart = normalizeDateText(record.startDate)?.slice(0, 4)
  const parsedStart = normalizeNumber(fromStart)
  if (parsedStart) return parsedStart
  const fromCode = normalizeText(record.holidayCode).match(/(?:^|_)(\d{4})$/)?.[1]
  return normalizeNumber(fromCode)
}

function readHolidayLookup(lookup: V1474HolidayWindowLookup) {
  if (typeof lookup === 'number') {
    return { date: null, year: null, month: lookup }
  }
  const date = normalizeDateText(lookup.date)
  const year = normalizeNumber(lookup.year) ?? normalizeNumber(date?.slice(0, 4))
  const month = normalizeNumber(lookup.month) ?? normalizeNumber(date?.slice(5, 7))
  return { date, year, month }
}

function isDateInHolidayWindow(record: AlgorithmSeedRecordPayload, date: string) {
  if (normalizeText(record.calendarKind ?? record.calendar_kind) === 'compensatory_workday'
    || record.isCompensatoryWorkday === true
    || record.is_compensatory_workday === true) {
    return false
  }
  if (Array.isArray(record.adjustedWorkDates)
    && record.adjustedWorkDates.some((item: unknown) => normalizeDateText(item) === date)) {
    return false
  }
  const start = normalizeDateText(record.startDate)
  const end = normalizeDateText(record.endDate)
  if (start && end && date >= start && date <= end) return true
  return false
}

function isCompensatoryWorkdayRecord(record: AlgorithmSeedRecordPayload) {
  return normalizeText(record.calendarKind ?? record.calendar_kind) === 'compensatory_workday'
    || record.isCompensatoryWorkday === true
    || record.is_compensatory_workday === true
}

function readCalendarProductivity(record: AlgorithmSeedRecordPayload) {
  const productivity = normalizeNumber(record.productivity) ?? 1
  return Number.isFinite(productivity) && productivity > 0 ? productivity : 1
}

function isMissingAlgorithmSeedSchema(error: unknown) {
  const code = String((error as { code?: unknown } | null)?.code ?? '')
  if (code === 'ALGORITHM_SEED_RESOLVER_READ_TIMEOUT') return false
  const message = String((error as Error | null | undefined)?.message ?? '').toLowerCase()
  if (message.includes('timed out after')) return false
  return code === '42P01'
    || code === '42703'
    || message.includes('algorithm_seed_versions')
    || message.includes('algorithm_seed_records')
    || message.includes('algorithm_seed_overrides')
}

function withResolverMeta<T extends AlgorithmSeedRecordPayload>(
  seedType: AlgorithmSeedType,
  payload: T,
  source: ResolvedAlgorithmSeedRecord['__resolverSource'],
  versionId?: string | null,
): ResolvedAlgorithmSeedRecord<T> {
  const normalized = normalizeAlgorithmSeedRecordPayload(seedType, payload) as T
  return {
    ...normalized,
    __stableCode: getAlgorithmSeedStableCode(seedType, normalized),
    __resolverSource: source,
    __resolverVersionId: versionId ?? null,
    __runtimeRole: classifyAlgorithmSeedRuntimeRole(seedType, source),
    __effectiveRuntimeSource: mapAlgorithmSeedResolverSource(source),
  }
}

const fallbackSeedRecordCache = new Map<AlgorithmSeedType, ResolvedAlgorithmSeedRecord[]>()

function fallbackSeedRecords<T extends AlgorithmSeedRecordPayload>(seedType: AlgorithmSeedType): ResolvedAlgorithmSeedRecord<T>[] {
  const cached = fallbackSeedRecordCache.get(seedType)
  if (cached) return [...cached] as ResolvedAlgorithmSeedRecord<T>[]
  const entry = getAlgorithmSeedEntry(seedType)
  const records = (entry?.records ?? []).map((payload) => withResolverMeta(seedType, payload as T, 'ts_seed_fallback'))
  fallbackSeedRecordCache.set(seedType, records as ResolvedAlgorithmSeedRecord[])
  return [...records]
}

function forecastWorkCalendarFallbackRecords<T extends AlgorithmSeedRecordPayload>(year: number | null | undefined) {
  if (!year) return [] as ResolvedAlgorithmSeedRecord<T>[]
  try {
    return buildForecastWorkCalendarRecords(year).map((payload) => withResolverMeta('work_calendar', payload as unknown as T, 'ts_seed_fallback'))
  } catch {
    return [] as ResolvedAlgorithmSeedRecord<T>[]
  }
}

function resolverSourceRank(source: AlgorithmSeedResolverSource) {
  if (source === 'project_override') return 4
  if (source === 'company_override') return 3
  if (source === 'active_seed') return 2
  return 1
}

function sortResolverSources(sources: AlgorithmSeedResolverSource[]) {
  return [...sources].sort((left, right) => resolverSourceRank(left) - resolverSourceRank(right))
}

function resolverConflictReason(
  effectiveSource: AlgorithmSeedResolverSource,
  suppressedSources: AlgorithmSeedResolverSource[],
): AlgorithmSeedResolverStableCodeDiagnostics['conflictReason'] {
  if (suppressedSources.length === 0) return null
  if (effectiveSource === 'project_override') return 'higher_priority_project_override'
  if (effectiveSource === 'company_override') return 'higher_priority_company_override'
  if (effectiveSource === 'active_seed') return 'higher_priority_active_seed'
  return null
}

function fallbackRiskLevel(reason: AlgorithmSeedResolverDiagnostics['fallbackReason']): AlgorithmSeedResolverDiagnostics['fallbackRiskLevel'] {
  if (!reason) return 'none'
  if (reason === 'explicit_built_in_only') return 'none'
  if (reason === 'schema_missing' || reason === 'resolver_error') return 'high'
  return 'medium'
}

function fallbackRecommendedAction(reason: AlgorithmSeedResolverDiagnostics['fallbackReason']): AlgorithmSeedResolverDiagnostics['recommendedAction'] {
  if (!reason) return 'none'
  if (reason === 'explicit_built_in_only') return 'none'
  if (reason === 'schema_missing') return 'check_seed_schema'
  if (reason === 'resolver_error') return 'inspect_resolver_error'
  return 'import_active_seed_version'
}

function buildResolverDiagnostics<T extends AlgorithmSeedRecordPayload>(
  seedType: AlgorithmSeedType,
  context: AlgorithmSeedResolveContext,
  sourceRecords: ResolvedAlgorithmSeedRecord<T>[],
  effectiveRecords: ResolvedAlgorithmSeedRecord<T>[],
  fallbackReason: AlgorithmSeedResolverDiagnostics['fallbackReason'],
  companyId: string | null,
): AlgorithmSeedResolverDiagnostics {
  const sourcesByStableCode: AlgorithmSeedResolverDiagnostics['sourcesByStableCode'] = {}
  const sourcePrecedenceTrace: AlgorithmSeedResolverDiagnostics['sourcePrecedenceTrace'] = []
  const sourceCounts: Partial<Record<AlgorithmSeedResolverSource, number>> = {}
  const effectiveByStableCode = new Map(effectiveRecords.map((record) => [record.__stableCode, record]))
  const grouped = new Map<string, ResolvedAlgorithmSeedRecord<T>[]>()

  for (const record of sourceRecords) {
    const stableCode = record.__stableCode || getAlgorithmSeedStableCode(seedType, record)
    if (!stableCode) continue
    grouped.set(stableCode, [...(grouped.get(stableCode) ?? []), record])
    sourceCounts[record.__resolverSource] = (sourceCounts[record.__resolverSource] ?? 0) + 1
  }

  for (const [stableCode, records] of grouped.entries()) {
    const effective = effectiveByStableCode.get(stableCode)
      ?? [...records].sort((left, right) => resolverSourceRank(right.__resolverSource) - resolverSourceRank(left.__resolverSource))[0]
    const priorityOrder = sortResolverSources(Array.from(new Set(records.map((record) => record.__resolverSource))))
    const suppressedSources = priorityOrder.filter((source) => source !== effective.__resolverSource)
    const conflictReason = resolverConflictReason(effective.__resolverSource, suppressedSources)
    const trace = priorityOrder.map((source) => ({
      source,
      decision: source === effective.__resolverSource ? 'effective' as const : 'suppressed_by_higher_priority' as const,
      versionIds: Array.from(new Set(records
        .filter((record) => record.__resolverSource === source)
        .map((record) => record.__resolverVersionId ?? null))),
    }))
    sourcesByStableCode[stableCode] = {
      stableCode,
      effectiveSource: effective.__resolverSource,
      suppressedSources,
      priorityOrder,
      sourcePrecedenceTrace: trace,
      conflictReason,
      sourceCount: records.length,
      versionIds: Array.from(new Set(records.map((record) => record.__resolverVersionId ?? null))),
    }
    sourcePrecedenceTrace.push({
      stableCode,
      effectiveSource: effective.__resolverSource,
      suppressedSources,
      conflictReason,
    })
  }

  return {
    seedType,
    projectId: normalizeText(context.projectId) || null,
    companyId: companyId || normalizeText(context.companyId) || null,
    fallbackUsed: effectiveRecords.some((record) => record.__resolverSource === 'ts_seed_fallback'),
    fallbackReason,
    fallbackRiskLevel: fallbackRiskLevel(fallbackReason),
    recommendedAction: fallbackRecommendedAction(fallbackReason),
    sourcesByStableCode,
    sourcePrecedenceTrace,
    sourceCounts,
    generatedAt: new Date().toISOString(),
  }
}

async function resolveCompanyId(context: AlgorithmSeedResolveContext) {
  if (isUuidLike(context.companyId)) return context.companyId!
  if (isUuidLike(context.projectId)) {
    return await withAlgorithmSeedResolverReadBudget(
      'project_company_lookup',
      getProjectCompanyId(context.projectId!),
    )
  }
  return null
}

function buildResolverCacheKey(seedType: AlgorithmSeedType, context: AlgorithmSeedResolveContext) {
  return [
    seedType,
    context.sourcePolicy ?? 'governed_runtime',
    normalizeText(context.projectId),
    normalizeText(context.companyId),
    readAlgorithmSeedLookupStableCodes(context).join(','),
  ].join('|')
}

function readAlgorithmSeedLookupStableCodes(context: AlgorithmSeedResolveContext) {
  return Array.from(new Set(normalizeTextArray(context.algorithmSeedLookupStableCodes)
    .map((value) => value.toLowerCase())
    .filter(Boolean)))
    .sort()
}

function trimResolverCache() {
  if (algorithmSeedResolverCache.size <= ALGORITHM_SEED_RESOLVER_CACHE_MAX) return
  const overflow = algorithmSeedResolverCache.size - ALGORITHM_SEED_RESOLVER_CACHE_MAX
  for (const key of Array.from(algorithmSeedResolverCache.keys()).slice(0, overflow)) {
    algorithmSeedResolverCache.delete(key)
  }
}

export function clearAlgorithmSeedResolverCache(seedType?: AlgorithmSeedType) {
  if (!seedType) {
    algorithmSeedResolverCache.clear()
    activeSystemSeedRecordCache.clear()
    activeSystemSeedVersionCache.clear()
    algorithmSeedOverrideCache.clear()
    return
  }

  const prefix = `${seedType}|`
  for (const key of Array.from(algorithmSeedResolverCache.keys())) {
    if (key.startsWith(prefix)) algorithmSeedResolverCache.delete(key)
  }
  for (const key of Array.from(activeSystemSeedRecordCache.keys())) {
    if (key.startsWith(prefix)) activeSystemSeedRecordCache.delete(key)
  }
  activeSystemSeedVersionCache.delete(seedType)
  for (const key of Array.from(algorithmSeedOverrideCache.keys())) {
    if (key.startsWith(prefix)) algorithmSeedOverrideCache.delete(key)
  }
}

async function loadActiveSystemSeedVersionUncached(seedType: AlgorithmSeedType) {
  const { data: version, error: versionError } = await withAlgorithmSeedResolverReadBudget(
    `algorithm_seed_versions:${seedType}`,
    supabase
      .from('algorithm_seed_versions')
      .select('id')
      .eq('seed_type', seedType)
      .eq('status', 'active')
      .eq('is_current', true)
      .maybeSingle(),
  )

  if (versionError) throw versionError
  return normalizeText((version as any)?.id) || null
}

async function loadActiveSystemSeedVersion(seedType: AlgorithmSeedType) {
  const now = Date.now()
  const cached = activeSystemSeedVersionCache.get(seedType)
  if (cached && cached.expiresAt > now) return cached.value
  if (cached) activeSystemSeedVersionCache.delete(seedType)

  const value = loadActiveSystemSeedVersionUncached(seedType)
  activeSystemSeedVersionCache.set(seedType, {
    expiresAt: now + ACTIVE_SYSTEM_SEED_CACHE_TTL_MS,
    value,
  })
  value.catch(() => {
    const current = activeSystemSeedVersionCache.get(seedType)
    if (current?.value === value) activeSystemSeedVersionCache.delete(seedType)
  })
  return value
}

function buildActiveSystemSeedRecordCacheKey(seedType: AlgorithmSeedType, lookupStableCodes: string[]) {
  return `${seedType}|${lookupStableCodes.join(',')}`
}

function trimActiveSystemSeedRecordCache() {
  if (activeSystemSeedRecordCache.size <= ACTIVE_SYSTEM_SEED_CACHE_MAX) return
  const overflow = activeSystemSeedRecordCache.size - ACTIVE_SYSTEM_SEED_CACHE_MAX
  for (const key of Array.from(activeSystemSeedRecordCache.keys()).slice(0, overflow)) {
    activeSystemSeedRecordCache.delete(key)
  }
}

async function loadActiveSystemRecordsUncached<T extends AlgorithmSeedRecordPayload>(
  seedType: AlgorithmSeedType,
  lookupStableCodes: string[] = [],
) {
  const versionId = await loadActiveSystemSeedVersion(seedType)
  if (!versionId) return []

  const recordsQuery = supabase
    .from('algorithm_seed_records')
    .select('stable_code, rule_payload')
    .eq('seed_version_id', versionId)
    .eq('seed_type', seedType)
    .eq('status', 'active')
  if (lookupStableCodes.length > 0) recordsQuery.in('stable_code', lookupStableCodes)

  const { data, error } = await withAlgorithmSeedResolverReadBudget(
    `algorithm_seed_records:${seedType}`,
    recordsQuery,
  )

  if (error) throw error
  return (Array.isArray(data) ? data : []).map((row: any) => {
    const payload = {
      ...(row.rule_payload ?? {}),
      stableCode: normalizeText(row.rule_payload?.stableCode) || normalizeText(row.stable_code),
    } as T
    return withResolverMeta(seedType, payload, 'active_seed', versionId)
  })
}

async function loadActiveSystemRecords<T extends AlgorithmSeedRecordPayload>(
  seedType: AlgorithmSeedType,
  lookupStableCodes: string[] = [],
) {
  if (lookupStableCodes.length === 0) {
    return loadActiveSystemRecordsUncached<T>(seedType, lookupStableCodes)
  }

  const key = buildActiveSystemSeedRecordCacheKey(seedType, lookupStableCodes)
  const now = Date.now()
  const cached = activeSystemSeedRecordCache.get(key)
  if (cached && cached.expiresAt > now) return cached.value as Promise<ResolvedAlgorithmSeedRecord<T>[]>
  if (cached) activeSystemSeedRecordCache.delete(key)

  const value = loadActiveSystemRecordsUncached<T>(seedType, lookupStableCodes)
  activeSystemSeedRecordCache.set(key, {
    expiresAt: now + ACTIVE_SYSTEM_SEED_CACHE_TTL_MS,
    value: value as Promise<ResolvedAlgorithmSeedRecord[]>,
  })
  value.catch(() => {
    const current = activeSystemSeedRecordCache.get(key)
    if (current?.value === value) activeSystemSeedRecordCache.delete(key)
  })
  trimActiveSystemSeedRecordCache()
  return value
}

function buildAlgorithmSeedOverrideCacheKey(
  seedType: AlgorithmSeedType,
  source: 'project_override' | 'company_override',
  id: string,
) {
  return `${seedType}|${source}|${id}`
}

async function loadOverridesUncached<T extends AlgorithmSeedRecordPayload>(
  seedType: AlgorithmSeedType,
  source: 'project_override' | 'company_override',
  workspaceScope: { projectId: string | null } | { companyId: string | null },
) {
  const id = source === 'project_override'
    ? ('projectId' in workspaceScope ? workspaceScope.projectId : null)
    : ('companyId' in workspaceScope ? workspaceScope.companyId : null)
  if (!id) return []
  const scopeType = source === 'project_override' ? 'project' : 'company'
  const column = scopeType === 'project' ? 'project_id' : 'company_id'
  const today = new Date().toISOString().slice(0, 10)
  const overridesQuery = supabase
    .from('algorithm_seed_overrides')
    .select('stable_code, override_payload, effective_from, effective_to')
    .eq('seed_type', seedType)
    .eq('scope_type', scopeType)
    .eq(column, id)
    .eq('status', 'active')

  const { data, error } = await withAlgorithmSeedResolverReadBudget(
    `algorithm_seed_overrides:${seedType}:${scopeType}`,
    overridesQuery,
  )

  if (error) throw error
  return (Array.isArray(data) ? data : [])
    .filter((row: any) => {
      const from = normalizeText(row.effective_from)
      const to = normalizeText(row.effective_to)
      return (!from || from <= today) && (!to || to >= today)
    })
    .map((row: any) => {
      const payload = {
        ...(row.override_payload ?? {}),
        stableCode: normalizeText(row.override_payload?.stableCode) || normalizeText(row.stable_code),
      } as T
      return withResolverMeta(seedType, payload, source, null)
    })
}

async function loadOverrides<T extends AlgorithmSeedRecordPayload>(
  seedType: AlgorithmSeedType,
  source: 'project_override' | 'company_override',
  id: string | null,
  lookupStableCodes: string[] = [],
) {
  if (!id) return []
  const key = buildAlgorithmSeedOverrideCacheKey(seedType, source, id)
  const now = Date.now()
  const cached = algorithmSeedOverrideCache.get(key)
  let records: ResolvedAlgorithmSeedRecord<T>[]
  if (cached && cached.expiresAt > now) {
    records = await cached.value as ResolvedAlgorithmSeedRecord<T>[]
  } else {
    if (cached) algorithmSeedOverrideCache.delete(key)
    const workspaceScope = source === 'project_override'
      ? { projectId: id }
      : { companyId: id }
    const value = loadOverridesUncached<T>(seedType, source, workspaceScope)
    algorithmSeedOverrideCache.set(key, {
      expiresAt: now + ALGORITHM_SEED_RESOLVER_CACHE_TTL_MS,
      value: value as Promise<ResolvedAlgorithmSeedRecord[]>,
    })
    value.catch(() => {
      const current = algorithmSeedOverrideCache.get(key)
      if (current?.value === value) algorithmSeedOverrideCache.delete(key)
    })
    records = await value
  }
  if (lookupStableCodes.length === 0) return records
  const acceptedCodes = new Set(lookupStableCodes)
  return records.filter((record) => acceptedCodes.has(normalizeText(record.__stableCode).toLowerCase()))
}

export function mergeAlgorithmSeedRecords<T extends AlgorithmSeedRecordPayload>(
  seedType: AlgorithmSeedType,
  systemRecords: ResolvedAlgorithmSeedRecord<T>[],
  companyOverrides: ResolvedAlgorithmSeedRecord<T>[],
  projectOverrides: ResolvedAlgorithmSeedRecord<T>[],
) {
  const byCode = new Map<string, ResolvedAlgorithmSeedRecord<T>>()
  for (const record of systemRecords) byCode.set(record.__stableCode || getAlgorithmSeedStableCode(seedType, record), record)
  for (const record of companyOverrides) byCode.set(record.__stableCode || getAlgorithmSeedStableCode(seedType, record), record)
  for (const record of projectOverrides) byCode.set(record.__stableCode || getAlgorithmSeedStableCode(seedType, record), record)
  return Array.from(byCode.values())
    .filter((record) => isAlgorithmSeedPayloadActive(seedType, record))
}

async function resolveAlgorithmSeedRecordsUncached<T extends AlgorithmSeedRecordPayload>(
  seedType: AlgorithmSeedType,
  context: AlgorithmSeedResolveContext = {},
): Promise<ResolvedAlgorithmSeedRecord<T>[]> {
  return (await resolveAlgorithmSeedRecordsWithDiagnostics<T>(seedType, context)).records
}

export async function resolveAlgorithmSeedRecordsWithDiagnostics<T extends AlgorithmSeedRecordPayload>(
  seedType: AlgorithmSeedType,
  context: AlgorithmSeedResolveContext = {},
): Promise<AlgorithmSeedResolutionWithDiagnostics<T>> {
  const fallback = fallbackSeedRecords<T>(seedType).filter((record) => isAlgorithmSeedPayloadActive(seedType, record))
  if (context.sourcePolicy === 'built_in_only') {
    return {
      records: fallback,
      diagnostics: buildResolverDiagnostics(
        seedType,
        context,
        fallback,
        fallback,
        'explicit_built_in_only',
        normalizeText(context.companyId) || null,
      ),
    }
  }
  const lookupStableCodes = readAlgorithmSeedLookupStableCodes(context)
  try {
    const [companyId, systemRecords, projectOverrides] = await Promise.all([
      resolveCompanyId(context),
      loadActiveSystemRecords<T>(seedType, lookupStableCodes),
      isUuidLike(context.projectId) ? loadOverrides<T>(seedType, 'project_override', context.projectId!, lookupStableCodes) : Promise.resolve([]),
    ])
    const companyOverrides = await loadOverrides<T>(seedType, 'company_override', companyId, lookupStableCodes)
    const governedSourceRecords = [...systemRecords, ...companyOverrides, ...projectOverrides]
    if (systemRecords.length === 0 && companyOverrides.length === 0 && projectOverrides.length === 0) {
      const records = fallback
      return {
        records,
        diagnostics: buildResolverDiagnostics(seedType, context, records, records, 'governed_records_empty', companyId),
      }
    }
    const baseRecords = systemRecords.length > 0 ? systemRecords : fallback
    const records = mergeAlgorithmSeedRecords(seedType, baseRecords, companyOverrides, projectOverrides)
    return {
      records,
      diagnostics: buildResolverDiagnostics(
        seedType,
        context,
        [...baseRecords, ...companyOverrides, ...projectOverrides],
        records,
        systemRecords.length > 0 ? null : 'governed_records_empty',
        companyId,
      ),
    }
  } catch (error) {
    if (!isMissingAlgorithmSeedSchema(error)) {
      logger.warn('[algorithmSeedResolver] failed to resolve active algorithm seeds, falling back to TS seed', {
        seedType,
        error,
      })
    }
    const records = fallback
    return {
      records,
      diagnostics: buildResolverDiagnostics(
        seedType,
        context,
        records,
        records,
        isMissingAlgorithmSeedSchema(error) ? 'schema_missing' : 'resolver_error',
        normalizeText(context.companyId) || null,
      ),
    }
  }
}

export async function resolveAlgorithmSeedRecords<T extends AlgorithmSeedRecordPayload>(
  seedType: AlgorithmSeedType,
  context: AlgorithmSeedResolveContext = {},
): Promise<ResolvedAlgorithmSeedRecord<T>[]> {
  const key = buildResolverCacheKey(seedType, context)
  const now = Date.now()
  const cached = algorithmSeedResolverCache.get(key)
  if (cached && cached.expiresAt > now) {
    return cached.value as Promise<ResolvedAlgorithmSeedRecord<T>[]>
  }
  if (cached) algorithmSeedResolverCache.delete(key)

  const value = resolveAlgorithmSeedRecordsUncached<T>(seedType, context)
  algorithmSeedResolverCache.set(key, {
    expiresAt: now + ALGORITHM_SEED_RESOLVER_CACHE_TTL_MS,
    value: value as Promise<ResolvedAlgorithmSeedRecord[]>,
  })
  value.catch(() => {
    const current = algorithmSeedResolverCache.get(key)
    if (current?.value === value) algorithmSeedResolverCache.delete(key)
  })
  trimResolverCache()
  return value
}

const normalizedRecordKeywordCache = new WeakMap<object, string[]>()

function readNormalizedRecordKeywords(record: AlgorithmSeedRecordPayload) {
  const cached = normalizedRecordKeywordCache.get(record)
  if (cached) return cached
  const normalized = normalizeTextArray(record.keywords).map((keyword) => keyword.toLowerCase())
  normalizedRecordKeywordCache.set(record, normalized)
  return normalized
}

function hasKeywordMatch(record: AlgorithmSeedRecordPayload, text: string) {
  const normalized = text.toLowerCase()
  return readNormalizedRecordKeywords(record).some((keyword) => normalized.includes(keyword))
}

function hasAnyKeywordMatch(keywords: unknown, text: string) {
  const normalized = text.toLowerCase()
  return Array.isArray(keywords)
    && keywords.some((keyword: unknown) => normalized.includes(normalizeText(keyword).toLowerCase()))
}

function hasNegativeKeywordMatch(record: AlgorithmSeedRecordPayload, text: string) {
  const normalized = normalizeText(text).toLowerCase()
  return Boolean(normalized) && hasAnyKeywordMatch(record.negativeKeywords ?? record.negative_keywords, normalized)
}

function readContextKeywords(context: V1475SeedMatchContext = {}) {
  return normalizeTextArray(context.contextKeywords).map((item) => item.toLowerCase())
}

function readBuildingPatternSignals(record: AlgorithmSeedRecordPayload, key: 'applicable' | 'exclusion') {
  const payloadKey = key === 'applicable' ? record.applicableSignals ?? record.applicable_signals : record.exclusionSignals ?? record.exclusion_signals
  return normalizeTextArray(payloadKey).map((item) => item.toLowerCase())
}

function hasBuildingPatternExclusionSignal(record: AlgorithmSeedRecordPayload, text: string, context: V1475SeedMatchContext = {}) {
  const normalized = normalizeText(text).toLowerCase()
  const contextKeywords = readContextKeywords(context)
  const exclusionSignals = readBuildingPatternSignals(record, 'exclusion')
  const signalSet = new Set(exclusionSignals)
  const hasText = (term: string) => normalized.includes(term)
  const hasKeyword = (term: string) => contextKeywords.includes(term)
  const isMinorNoScaffoldRepair = (
    (hasText('minor repair') || hasText('surface repair') || hasText('repair') || hasText('\u4fee\u8865') || hasText('\u5c0f\u4fee'))
    && (
      hasText('without exterior access')
      || hasText('no scaffold')
      || hasText('without scaffold')
      || hasText('\u65e0\u811a\u624b\u67b6')
      || hasText('\u65e0\u5916\u67b6')
      || hasKeyword('minor_repair_without_exterior_access')
    )
  )

  if (isMinorNoScaffoldRepair) {
    const recordCode = readBuildingPatternCode(record)
    return recordCode !== 'generic_construction_management_coordination_flow'
  }
  if (exclusionSignals.length === 0) return false

  if (signalSet.has('minor_repair_without_exterior_access')) {
    if (isMinorNoScaffoldRepair) return true
  }
  if (signalSet.has('roof_machine_room') && (hasText('roof machine room') || hasText('屋顶机房') || hasKeyword('roof_machine_room'))) return true
  if (signalSet.has('basement_workface')) {
    const explicitBasement = hasText('basement') || hasText('地下室') || hasKeyword('basement_workface')
    const basementOnly = hasText('basement only') || hasText('only basement') || hasText('pure basement') || hasText('basement shared slab') || hasText('地下室专项') || hasKeyword('basement_only')
    if (explicitBasement && basementOnly) return true
  }
  if (signalSet.has('indoor_only') && (hasText('indoor only') || hasText('室内') || hasKeyword('indoor_only'))) return true
  if (signalSet.has('outdoor_only') && (hasText('outdoor only') || hasText('室外专项') || hasKeyword('outdoor_only'))) return true
  if (signalSet.has('single_building_scope') && (hasText('single building') || hasText('single tower') || hasText('单栋') || hasText('单体') || hasKeyword('single_building_scope'))) return true
  if (signalSet.has('multi_building_scope') && (hasText('multi-building') || hasText('multiple building') || hasText('多楼栋') || hasText('多栋') || hasKeyword('multi_building_scope'))) return true
  if (signalSet.has('shared_basement_workface')) {
    const explicitSharedBasement = hasText('shared basement') || hasText('整体地库') || hasText('共享底板') || hasKeyword('shared_basement_workface')
    const explicitlyBlocksAllBuildings = hasText('one shared basement') || hasText('blocks all') || hasText('single critical') || hasText('整体地库阻断') || hasText('共享底板阻断') || hasKeyword('shared_basement_blocks_all')
    if (explicitSharedBasement && explicitlyBlocksAllBuildings) return true
  }
  return false
}

const contextStandardWorkCodesCache = new WeakMap<object, string[]>()
const recordStandardWorkCodesCache = new WeakMap<object, string[]>()
const recordStandardCatalogCodePrefixesCache = new WeakMap<object, string[]>()
const recordTemplateNodeIdsCache = new WeakMap<object, string[]>()

function readContextStandardWorkCodes(context: V1475SeedMatchContext = {}) {
  const cached = contextStandardWorkCodesCache.get(context)
  if (cached) return cached
  const normalized = normalizeTextArray([
    ...normalizeTextArray(context.standardWorkCodes),
    context.standardWorkCode,
  ]).map((item) => item.toLowerCase())
  contextStandardWorkCodesCache.set(context, normalized)
  return normalized
}

function readRecordStandardWorkCodes(record: AlgorithmSeedRecordPayload) {
  const cached = recordStandardWorkCodesCache.get(record)
  if (cached) return cached
  const normalized = normalizeTextArray(
    [
      ...normalizeTextArray(record.standardWorkCodes ?? record.standard_work_codes),
      ...normalizeTextArray(record.applicableStandardWorkCodes ?? record.applicable_standard_work_codes),
      ...normalizeTextArray(record.standardCatalogCodes ?? record.standard_catalog_codes),
      ...normalizeTextArray(record.templateNodeStableCodes ?? record.template_node_stable_codes),
    ],
  ).map((item) => item.toLowerCase())
  recordStandardWorkCodesCache.set(record, normalized)
  return normalized
}

function readRecordStandardCatalogCodePrefixes(record: AlgorithmSeedRecordPayload) {
  const cached = recordStandardCatalogCodePrefixesCache.get(record)
  if (cached) return cached
  const normalized = normalizeTextArray(
    record.standardCatalogCodePrefixes
      ?? record.standard_catalog_code_prefixes
      ?? record.templateNodeStableCodePrefixes
      ?? record.template_node_stable_code_prefixes,
  ).map((item) => item.toLowerCase())
  recordStandardCatalogCodePrefixesCache.set(record, normalized)
  return normalized
}

function readRecordTemplateNodeIds(record: AlgorithmSeedRecordPayload) {
  const cached = recordTemplateNodeIdsCache.get(record)
  if (cached) return cached
  const normalized = normalizeTextArray(
    record.templateNodeIds
      ?? record.template_node_ids
      ?? record.templateNodeId
      ?? record.template_node_id,
  ).map((item) => item.toLowerCase())
  recordTemplateNodeIdsCache.set(record, normalized)
  return normalized
}

function readRecordAllCatalogAndTemplatePrefixes(record: AlgorithmSeedRecordPayload) {
  return normalizeTextArray([
    ...normalizeTextArray(record.standardCatalogCodePrefixes ?? record.standard_catalog_code_prefixes),
    ...normalizeTextArray(record.templateNodeStableCodePrefixes ?? record.template_node_stable_code_prefixes),
  ]).map((item) => item.toLowerCase())
}

function hasStandardWorkCodeMatch(record: AlgorithmSeedRecordPayload, context: V1475SeedMatchContext = {}) {
  return standardWorkCodeMatchScore(record, context) > 0
}

function standardWorkCodeMatchScore(record: AlgorithmSeedRecordPayload, context: V1475SeedMatchContext = {}) {
  const explicitStandardWorkCode = normalizeText(context.standardWorkCode).toLowerCase()
  const contextCodes = readContextStandardWorkCodes(context)
  if (contextCodes.length === 0) return 0
  const recordCodes = readRecordStandardWorkCodes(record)
  if (explicitStandardWorkCode && recordCodes.includes(explicitStandardWorkCode)) return 260
  const directMatchIndex = contextCodes.findIndex((contextCode) => recordCodes.includes(contextCode))
  if (directMatchIndex >= 0) return 140 - Math.min(directMatchIndex, 20)
  const catalogPrefixes = readRecordStandardCatalogCodePrefixes(record)
  const matchedPrefixLength = catalogPrefixes.reduce((max, prefix) => {
    const matched = contextCodes.some((code) => code === prefix || code.startsWith(`${prefix}-`))
    return matched ? Math.max(max, prefix.length) : max
  }, 0)
  return matchedPrefixLength > 0 ? 80 + matchedPrefixLength : 0
}

function standardWorkCodeSpecificityScore(record: AlgorithmSeedRecordPayload, context: V1475SeedMatchContext = {}) {
  const contextCodes = readContextStandardWorkCodes(context)
  if (contextCodes.length === 0) return 0
  const recordCodes = readRecordStandardWorkCodes(record)
  const directMatchIndex = contextCodes.findIndex((contextCode) => recordCodes.includes(contextCode))
  if (directMatchIndex >= 0) return 5
  const catalogPrefixes = readRecordStandardCatalogCodePrefixes(record)
  let bestSpecificity = 0
  for (const prefix of catalogPrefixes) {
    const prefixText = normalizeText(prefix).toLowerCase()
    if (!prefixText) continue
    const matched = contextCodes.some((code) => code === prefixText || code.startsWith(`${prefixText}-`))
    if (!matched) continue
    const segments = prefixText.split('-').filter(Boolean).length
    bestSpecificity = Math.max(bestSpecificity, segments)
  }
  if (bestSpecificity <= 1) return -4
  if (bestSpecificity === 2) return 1
  return Math.min(4, bestSpecificity)
}

function readTitleWeakContextKeywordsByStandardWorkCode(record: AlgorithmSeedRecordPayload) {
  const source = record.contextKeywordsByStandardWorkCode ?? record.context_keywords_by_standard_work_code
  return source && typeof source === 'object' && !Array.isArray(source)
    ? source as Record<string, unknown>
    : {}
}

function orderTitleWeakStandardWorkCodesByContext(record: AlgorithmSeedRecordPayload, text: string) {
  const codes = readRecordStandardWorkCodes(record)
  const contextKeywordsByCode = readTitleWeakContextKeywordsByStandardWorkCode(record)
  if (codes.length <= 1 || Object.keys(contextKeywordsByCode).length === 0) return codes
  const normalized = normalizeText(text).toLowerCase()
  return [...codes].sort((a, b) => {
    const scoreA = hasAnyKeywordMatch(contextKeywordsByCode[a], normalized) ? 1 : 0
    const scoreB = hasAnyKeywordMatch(contextKeywordsByCode[b], normalized) ? 1 : 0
    return scoreB - scoreA
  })
}

function buildTitleWeakContextText(text: string, context: V1475SeedMatchContext = {}) {
  return normalizeTextArray([
    text,
    ...normalizeTextArray(context.contextKeywords),
  ]).join(' ')
}

function hasTemplateNodeMatch(record: AlgorithmSeedRecordPayload, context: V1475SeedMatchContext = {}) {
  const templateNodeId = normalizeText(context.templateNodeId).toLowerCase()
  if (!templateNodeId) return false
  return readRecordTemplateNodeIds(record).includes(templateNodeId)
}

function readProcessConstraintContextCodes(context: V1475SeedMatchContext = {}) {
  return normalizeTextArray([
    ...normalizeTextArray(context.standardWorkCodes),
    context.standardWorkCode,
    ...normalizeTextArray(context.standardCatalogCodePrefixes),
    ...normalizeTextArray(context.templateNodeStableCodePrefixes),
    context.templateNodeId,
  ]).map((item) => item.toLowerCase())
}

function processConstraintPrefixMatchScore(record: AlgorithmSeedRecordPayload, context: V1475SeedMatchContext = {}) {
  const contextCodes = readProcessConstraintContextCodes(context)
  if (contextCodes.length === 0) return 0
  const prefixes = readRecordAllCatalogAndTemplatePrefixes(record)
    .filter((prefix) => !/^\d{2}$/.test(prefix))
  let bestLength = 0
  for (const prefix of prefixes) {
    const matched = contextCodes.some((code) => code === prefix || code.startsWith(`${prefix}-`) || code.startsWith(prefix))
    if (matched) bestLength = Math.max(bestLength, prefix.length)
  }
  return bestLength > 0 ? 80 + bestLength : 0
}

function processConstraintKeywordGate(record: AlgorithmSeedRecordPayload, text: string) {
  const normalized = normalizeText(text).toLowerCase()
  if (!normalized) return false
  if (hasAnyKeywordMatch(record.excludedKeywordTerms ?? record.excluded_keyword_terms, normalized)) return false
  const groups = record.requiredKeywordGroups ?? record.required_keyword_groups
  if (Array.isArray(groups) && groups.length > 0) {
    return groups.every((group: unknown) => (
      Array.isArray(group)
      && group.some((term) => normalized.includes(normalizeText(term).toLowerCase()))
    ))
  }
  return hasKeywordMatch(record, normalized)
    || hasAnyKeywordMatch(record.durationLookupKeys ?? record.duration_lookup_keys, normalized)
    || hasAnyKeywordMatch(record.carrierProcessHints ?? record.carrier_process_hints, normalized)
}

function granularityMatches(record: AlgorithmSeedRecordPayload, context: V1475SeedMatchContext = {}) {
  const required = normalizeText(context.applicableGranularity).toLowerCase()
  if (!required) return true
  const granularity = normalizeText(record.applicableGranularity ?? record.applicable_granularity ?? 'both').toLowerCase()
  if (granularity === 'both') return true
  const normalizeRuntimeGranularity = (value: string) => {
    if (value === 'task' || value === 'process') return 'process_task'
    if (value === 'operation' || value === 'activity' || value === 'activity_step') return 'operation'
    return value
  }
  return normalizeRuntimeGranularity(granularity) === normalizeRuntimeGranularity(required)
}

type SeedMatchRecordScoreProjection = {
  methodCodes: string[]
  elementVariantCodes: string[]
  projectTypeCodes: string[]
  structureTypeCodes: string[]
}

type SeedMatchContextScoreProjection = SeedMatchRecordScoreProjection

const seedMatchRecordScoreProjectionCache = new WeakMap<object, SeedMatchRecordScoreProjection>()
const seedMatchContextScoreProjectionCache = new WeakMap<object, SeedMatchContextScoreProjection>()

function readSeedMatchRecordScoreProjection(record: AlgorithmSeedRecordPayload): SeedMatchRecordScoreProjection {
  const cached = seedMatchRecordScoreProjectionCache.get(record)
  if (cached) return cached
  const projection = {
    methodCodes: normalizeTextArray(record.applicableMethodCodes ?? record.applicable_method_codes).map((item) => item.toLowerCase()),
    elementVariantCodes: normalizeTextArray(record.elementVariantCodes ?? record.element_variant_codes).map((item) => item.toLowerCase()),
    projectTypeCodes: normalizeTextArray(record.projectTypeCodes ?? record.project_type_codes).map((item) => item.toLowerCase()),
    structureTypeCodes: normalizeTextArray(record.structureTypeCodes ?? record.structure_type_codes).map((item) => item.toLowerCase()),
  }
  seedMatchRecordScoreProjectionCache.set(record, projection)
  return projection
}

function readSeedMatchContextScoreProjection(context: V1475SeedMatchContext): SeedMatchContextScoreProjection {
  const cached = seedMatchContextScoreProjectionCache.get(context)
  if (cached) return cached
  const projection = {
    methodCodes: expandMethodVariantCodes(context.methodVariantCodes),
    elementVariantCodes: normalizeTextArray(context.elementVariantCodes).map((item) => item.toLowerCase()),
    projectTypeCodes: expandFeatureCode('project', context.projectTypeCode),
    structureTypeCodes: expandFeatureCode('structure', context.structureTypeCode),
  }
  seedMatchContextScoreProjectionCache.set(context, projection)
  return projection
}

function methodScore(record: AlgorithmSeedRecordPayload, context: V1475SeedMatchContext = {}) {
  const recordMethods = readSeedMatchRecordScoreProjection(record).methodCodes
  if (recordMethods.length === 0) return 0
  const contextMethods = readSeedMatchContextScoreProjection(context).methodCodes
  if (contextMethods.length === 0) return -1
  return recordMethods.some((method) => contextMethods.includes(method)) ? 10 : -20
}

function elementVariantScore(record: AlgorithmSeedRecordPayload, context: V1475SeedMatchContext = {}) {
  const recordVariants = readSeedMatchRecordScoreProjection(record).elementVariantCodes
  if (recordVariants.length === 0) return 0
  const contextVariants = readSeedMatchContextScoreProjection(context).elementVariantCodes
  if (contextVariants.length === 0) return -1
  return recordVariants.some((variant) => contextVariants.includes(variant)) ? 6 : -12
}

function projectTypeScore(record: AlgorithmSeedRecordPayload, context: V1475SeedMatchContext = {}) {
  const recordTypes = readSeedMatchRecordScoreProjection(record).projectTypeCodes
  if (recordTypes.length === 0) return 0
  const projectTypes = readSeedMatchContextScoreProjection(context).projectTypeCodes
  if (projectTypes.length === 0) return -1
  return includesAnyFeatureCode(recordTypes, projectTypes) ? 6 : -12
}

function structureTypeScore(record: AlgorithmSeedRecordPayload, context: V1475SeedMatchContext = {}) {
  const recordTypes = readSeedMatchRecordScoreProjection(record).structureTypeCodes
  if (recordTypes.length === 0) return 0
  const structureTypes = readSeedMatchContextScoreProjection(context).structureTypeCodes
  if (structureTypes.length === 0) return -1
  return includesAnyFeatureCode(recordTypes, structureTypes) ? 5 : -10
}

const PROJECT_TYPE_ALIASES: Record<string, string[]> = {
  data_center: ['data_center', 'idc', 'tier4_data_center', 'computer_room', 'mission_critical'],
  idc: ['idc', 'data_center', 'tier4_data_center', 'computer_room', 'mission_critical'],
  tier4_data_center: ['tier4_data_center', 'data_center', 'idc', 'mission_critical'],
  hospital: ['hospital', 'medical', 'clinical'],
  industrial_cleanroom: ['industrial_cleanroom', 'clean_industrial', 'battery_factory', 'semiconductor', 'pharmaceutical'],
  battery_factory: ['battery_factory', 'industrial_cleanroom', 'clean_industrial'],
  semiconductor: ['semiconductor', 'industrial_cleanroom', 'clean_industrial'],
  industrial_general: ['industrial_general', 'industrial', 'factory', 'workshop'],
  industrial: ['industrial', 'industrial_general', 'factory', 'workshop'],
  logistics: ['logistics', 'industrial_logistics', 'warehouse', 'distribution_center'],
  industrial_logistics: ['industrial_logistics', 'logistics', 'warehouse', 'distribution_center'],
  cold_storage: ['cold_storage', 'cold_chain', 'refrigerated_warehouse', 'logistics'],
  mall: ['mall', 'retail', 'commercial', 'shopping_center'],
  retail: ['retail', 'mall', 'commercial', 'shopping_center'],
  commercial_opening: ['commercial_opening', 'commercial', 'mall', 'retail', 'office'],
  hotel: ['hotel', 'luxury_hotel', 'chain_hotel', 'hotel_complex'],
  luxury_hotel: ['luxury_hotel', 'hotel', 'hotel_complex'],
  tod: ['tod', 'tod_upper_cover', 'metro_upper_cover', 'rail_transit_specialty'],
  tod_upper_cover: ['tod_upper_cover', 'tod', 'metro_upper_cover', 'rail_transit_specialty'],
  mic: ['mic', 'modular_construction', 'modular_hotel', 'modular_apartment'],
  modular_construction: ['modular_construction', 'mic', 'modular_hotel', 'modular_apartment'],
  prefab_bathroom: ['prefab_bathroom', 'modular_construction', 'mic', 'integrated_bathroom'],
  prefab_kitchen: ['prefab_kitchen', 'modular_construction', 'mic', 'integrated_kitchen'],
  campus: ['campus', 'university', 'school'],
  university: ['university', 'campus', 'school'],
  school: ['school', 'campus', 'university'],
  renovation: ['renovation', 'heritage', 'historic_preservation', 'energy_retrofit'],
  heritage: ['heritage', 'heritage_preservation', 'historic_preservation', 'renovation'],
  heritage_preservation: ['heritage_preservation', 'heritage', 'historic_preservation'],
}

const STRUCTURE_TYPE_ALIASES: Record<string, string[]> = {
  large_span_steel: ['large_span_steel', 'steel', 'steel_structure', 'space_truss'],
  steel: ['steel', 'steel_structure', 'large_span_steel'],
  steel_structure: ['steel_structure', 'steel', 'large_span_steel'],
  prefabricated_concrete: ['prefabricated_concrete', 'prefab_with_cast_in_place_core', 'precast_assembly'],
  prefab_with_cast_in_place_core: ['prefab_with_cast_in_place_core', 'prefabricated_concrete'],
  data_center_building: ['data_center_building', 'mission_critical_room', 'mep_integrated'],
  mission_critical_room: ['mission_critical_room', 'data_center_building', 'mep_integrated'],
  medical_cleanroom_system: ['medical_cleanroom_system', 'hospital_public_building', 'mep_integrated'],
  industrial_cleanroom_building: ['industrial_cleanroom_building', 'process_utility_system', 'mep_integrated'],
  industrial_building: ['industrial_building', 'steel_structure', 'logistics_warehouse', 'heavy_floor_system'],
  logistics_warehouse: ['logistics_warehouse', 'industrial_building', 'steel_structure', 'warehouse'],
  cold_storage_building: ['cold_storage_building', 'logistics_warehouse', 'mep_integrated', 'cold_chain_envelope'],
  commercial_public_area: ['commercial_public_area', 'large_public_system', 'mep_integrated', 'interior_fitout'],
  office_fitout: ['office_fitout', 'interior_fitout', 'mep_integrated'],
  prefab_bathroom_module: ['prefab_bathroom_module', 'factory_integrated_module', 'interior_fitout'],
  prefab_kitchen_module: ['prefab_kitchen_module', 'factory_integrated_module', 'interior_fitout'],
  tod_transfer_deck: ['tod_transfer_deck', 'metro_upper_cover', 'steel_concrete_composite'],
  existing_building: ['existing_building', 'heritage_structure', 'reinforced_existing_structure'],
  heritage_structure: ['heritage_structure', 'existing_building', 'masonry', 'timber_structure'],
}

function expandFeatureCode(kind: 'project' | 'structure', value: unknown) {
  const code = normalizeText(value).toLowerCase()
  if (!code) return []
  const aliases = kind === 'project' ? PROJECT_TYPE_ALIASES : STRUCTURE_TYPE_ALIASES
  return Array.from(new Set([code, ...(aliases[code] ?? [])]))
}

function includesAnyFeatureCode(recordValues: string[], contextValues: string[]) {
  return contextValues.some((value) => recordValues.includes(value))
}

function buildingPatternFeatureSignalBreakdown(record: AlgorithmSeedRecordPayload, context: V1475SeedMatchContext = {}) {
  let score = 0
  let provided = 0
  let matched = 0
  let conflicts = 0
  const matchedSignals = new Set<string>()
  const missingSignals = new Set<string>()

  const evaluateSingle = (options: {
    signal: string
    missingSignal: string
    recordValues: string[]
    contextValues: string[]
    matchScore: number
    conflictScore: number
  }) => {
    if (options.contextValues.length === 0) {
      if (options.recordValues.length > 0) missingSignals.add(options.missingSignal)
      return
    }
    provided += 1
    if (options.recordValues.length === 0) {
      conflicts += 1
      score += Math.round(options.conflictScore / 2)
      missingSignals.add(options.missingSignal)
      return
    }
    if (includesAnyFeatureCode(options.recordValues, options.contextValues)) {
      matched += 1
      score += options.matchScore
      matchedSignals.add(options.signal)
      return
    }
    conflicts += 1
    score += options.conflictScore
    missingSignals.add(options.missingSignal)
  }

  evaluateSingle({
    signal: 'project_type',
    missingSignal: 'project_type_conflict',
    recordValues: normalizeTextArray(record.projectTypeCodes ?? record.project_type_codes).map((item) => item.toLowerCase()),
    contextValues: expandFeatureCode('project', context.projectTypeCode),
    matchScore: 12,
    conflictScore: -22,
  })
  evaluateSingle({
    signal: 'structure_type',
    missingSignal: 'structure_type_conflict',
    recordValues: normalizeTextArray(record.structureTypeCodes ?? record.structure_type_codes).map((item) => item.toLowerCase()),
    contextValues: expandFeatureCode('structure', context.structureTypeCode),
    matchScore: 10,
    conflictScore: -16,
  })
  evaluateSingle({
    signal: 'method_variant',
    missingSignal: 'method_variant_conflict',
    recordValues: normalizeTextArray(record.applicableMethodCodes ?? record.applicable_method_codes).map((item) => item.toLowerCase()),
    contextValues: expandMethodVariantCodes(context.methodVariantCodes),
    matchScore: 10,
    conflictScore: -18,
  })
  evaluateSingle({
    signal: 'element_variant',
    missingSignal: 'element_variant_conflict',
    recordValues: normalizeTextArray(record.elementVariantCodes ?? record.element_variant_codes).map((item) => item.toLowerCase()),
    contextValues: normalizeTextArray(context.elementVariantCodes).map((item) => item.toLowerCase()),
    matchScore: 8,
    conflictScore: -12,
  })

  if (provided >= 3 && matched >= 3) {
    score += 14
    matchedSignals.add('project_generation_facts')
  } else if (provided >= 2 && conflicts >= 2) {
    score -= 18
    missingSignals.add('engineering_feature_conflict')
  }

  return {
    score,
    provided,
    matched,
    conflicts,
    matchedSignals: [...matchedSignals],
    missingSignals: [...missingSignals],
  }
}

function readContextScopeDimensions(context: V1475SeedMatchContext = {}) {
  return normalizeTextArray(context.scopeDimensions).map((item) => item.toLowerCase())
}

function readContextRhythmDrivers(context: V1475SeedMatchContext = {}) {
  return normalizeTextArray(context.rhythmDrivers).map((item) => item.toLowerCase())
}

function buildingPatternContextSignalBreakdown(record: AlgorithmSeedRecordPayload, context: V1475SeedMatchContext = {}) {
  let score = 0
  const matchedSignals = new Set<string>()
  const missingSignals = new Set<string>()
  const contextDimensions = readContextScopeDimensions(context)
  const requiredDimensions = normalizeTextArray(record.requiredScopeDimensions ?? record.required_scope_dimensions)
    .map((item) => item.toLowerCase())
  const optionalDimensions = normalizeTextArray(record.optionalScopeDimensions ?? record.optional_scope_dimensions)
    .map((item) => item.toLowerCase())
  if (requiredDimensions.length > 0 && contextDimensions.length > 0) {
    const requiredMatches = requiredDimensions.filter((dimension) => contextDimensions.includes(dimension)).length
    const missingRequired = requiredDimensions.length - requiredMatches
    score += requiredMatches * 14
    score -= missingRequired * 18
    if (requiredMatches > 0) matchedSignals.add('scope_dimension')
    if (missingRequired > 0) missingSignals.add('required_scope_dimension')
  } else if (requiredDimensions.length > 0) {
    missingSignals.add('required_scope_dimension')
  }
  if (optionalDimensions.length > 0 && contextDimensions.length > 0) {
    const optionalMatches = optionalDimensions.filter((dimension) => contextDimensions.includes(dimension)).length
    score += optionalMatches * 4
    if (optionalMatches > 0) matchedSignals.add('optional_scope_dimension')
  }

  const contextDrivers = readContextRhythmDrivers(context)
  const recordDrivers = normalizeTextArray(record.rhythmDrivers ?? record.rhythm_drivers)
    .map((item) => item.toLowerCase())
  if (recordDrivers.length > 0 && contextDrivers.length > 0) {
    const driverMatches = recordDrivers.filter((driver) => contextDrivers.includes(driver)).length
    score += driverMatches * 6
    if (driverMatches > 0) matchedSignals.add('rhythm_driver')
  } else if (recordDrivers.length > 0) {
    missingSignals.add('rhythm_driver')
  }

  const primaryWorkfaceType = normalizeText(context.primaryWorkfaceType).toLowerCase()
  const recordWorkfaceType = normalizeText(record.primaryWorkfaceType ?? record.primary_workface_type).toLowerCase()
  if (primaryWorkfaceType && recordWorkfaceType) {
    score += primaryWorkfaceType === recordWorkfaceType ? 16 : -8
    if (primaryWorkfaceType === recordWorkfaceType) matchedSignals.add('primary_workface')
    else missingSignals.add('primary_workface')
  } else if (recordWorkfaceType) {
    missingSignals.add('primary_workface')
  }

  const phaseWindow = normalizeText(context.phaseWindow).toLowerCase()
  const recordPhaseWindow = normalizeText(record.phaseWindow ?? record.phase_window).toLowerCase()
  if (phaseWindow && recordPhaseWindow) {
    if (phaseWindow === recordPhaseWindow) {
      score += 12
      matchedSignals.add('phase_window')
    } else if (recordPhaseWindow === 'full_project') {
      score += 3
      matchedSignals.add('phase_window_broad')
    } else {
      score -= 6
      missingSignals.add('phase_window')
    }
  } else if (recordPhaseWindow) {
    missingSignals.add('phase_window')
  }

  const expansionStrategy = normalizeText(context.expansionStrategy).toLowerCase()
  const recordExpansionStrategy = normalizeText(record.expansionStrategy ?? record.expansion_strategy).toLowerCase()
  if (expansionStrategy && recordExpansionStrategy) {
    score += expansionStrategy === recordExpansionStrategy ? 8 : -4
    if (expansionStrategy === recordExpansionStrategy) matchedSignals.add('expansion_strategy')
    else missingSignals.add('expansion_strategy')
  } else if (recordExpansionStrategy) {
    missingSignals.add('expansion_strategy')
  }

  const applicableSignals = readBuildingPatternSignals(record, 'applicable')
  if (applicableSignals.length > 0) {
    const contextSignalSet = new Set([
      ...contextDimensions,
      ...contextDrivers,
      ...readContextKeywords(context),
      normalizeText(context.workEnvironment).toLowerCase(),
      normalizeText(context.monthlyClimateSignal).toLowerCase(),
      normalizeText(context.primaryWorkfaceType).toLowerCase(),
      normalizeText(context.phaseWindow).toLowerCase(),
    ].filter(Boolean))
    const applicableMatches = applicableSignals.filter((signal) => contextSignalSet.has(signal))
    if (applicableMatches.length > 0) {
      score += applicableMatches.length * 5
      matchedSignals.add('applicable_signal')
    } else if (applicableSignals.includes('weather_window') && (
      normalizeText(context.monthlyClimateSignal)
      || (context.rainySeasonMonths?.length ?? 0) > 0
      || (context.floodSeasonMonths?.length ?? 0) > 0
      || (context.highTempMonths?.length ?? 0) > 0
      || (context.coldWeatherMonths?.length ?? 0) > 0
    )) {
      score += 5
      matchedSignals.add('applicable_signal')
    } else {
      missingSignals.add('applicable_signal')
    }
  }

  return {
    score,
    matchedSignals: [...matchedSignals],
    missingSignals: [...missingSignals],
  }
}

function buildingPatternContextScore(record: AlgorithmSeedRecordPayload, context: V1475SeedMatchContext = {}) {
  return buildingPatternContextSignalBreakdown(record, context).score
}

function buildingPatternSpecificitySignalBreakdown(record: AlgorithmSeedRecordPayload, context: V1475SeedMatchContext = {}) {
  let score = 0
  const matchedSignals = new Set<string>()
  const missingSignals = new Set<string>()
  const role = normalizeText(record.patternRole ?? record.pattern_role)
  const conflictGroup = normalizeText(record.conflictGroup ?? record.conflict_group)
  const phaseWindow = normalizeText(context.phaseWindow).toLowerCase()
  const recordPhaseWindow = normalizeText(record.phaseWindow ?? record.phase_window).toLowerCase()
  const priority = normalizeNumber(record.patternPriority ?? record.pattern_priority) ?? 0
  const hasProjectType = Boolean(normalizeText(context.projectTypeCode))
  const hasStructureType = Boolean(normalizeText(context.structureTypeCode))
  const hasMethod = normalizeTextArray(context.methodVariantCodes).length > 0
  const hasElement = normalizeTextArray(context.elementVariantCodes).length > 0
  const hasSpecificProfile = hasProjectType || hasStructureType || hasMethod || hasElement
  const controlChains = Array.isArray(record.controlChains ?? record.control_chains)
    ? record.controlChains ?? record.control_chains
    : []
  const durationCurveProfile = record.durationCurveProfile ?? record.duration_curve_profile

  if (priority > 0 && hasSpecificProfile) {
    score += Math.min(12, Math.max(1, Math.round(priority / 10)))
    matchedSignals.add('pattern_priority')
  }

  if ((role === 'specialty_domain_mode' || role === 'handover_mode') && hasSpecificProfile) {
    score += 8
    matchedSignals.add('specific_pattern_role')
  } else if (role === 'phase_mode' && hasSpecificProfile) {
    score += 5
    matchedSignals.add('specific_pattern_role')
  } else if (role === 'primary_project_mode') {
    score += phaseWindow && phaseWindow !== 'full_project' ? -4 : 2
    if (phaseWindow && phaseWindow !== 'full_project') missingSignals.add('specific_pattern_role')
  }

  if (phaseWindow && recordPhaseWindow) {
    if (phaseWindow === recordPhaseWindow && (role === 'handover_mode' || role === 'specialty_domain_mode' || role === 'phase_mode') && hasSpecificProfile) {
      score += 10
      matchedSignals.add('specific_phase_role')
    } else if (recordPhaseWindow === 'full_project' && phaseWindow !== 'full_project') {
      score -= 6
      missingSignals.add('specific_phase_role')
    }
  }

  if ((conflictGroup === 'specialty_domain' || conflictGroup === 'handover_opening') && hasSpecificProfile) {
    score += 4
    matchedSignals.add('conflict_group_specificity')
  } else if (conflictGroup === 'project_rhythm' && phaseWindow && phaseWindow !== 'full_project') {
    score -= 3
  }

  if (controlChains.length > 0) {
    score += hasSpecificProfile ? Math.min(6, controlChains.length * 3) : 1
    matchedSignals.add('control_chain')
  } else {
    missingSignals.add('control_chain')
  }

  if (durationCurveProfile && typeof durationCurveProfile === 'object') {
    const positionBasis = normalizeText((durationCurveProfile as any).positionBasis ?? (durationCurveProfile as any).position_basis)
    if (positionBasis) {
      score += hasSpecificProfile ? 4 : 1
      matchedSignals.add('duration_curve_profile')
      const contextDimensions = readContextScopeDimensions(context)
      if (contextDimensions.includes(positionBasis.toLowerCase())) {
        score += 4
        matchedSignals.add('duration_curve_basis')
      }
    }
  } else {
    missingSignals.add('duration_curve_profile')
  }

  return {
    score,
    matchedSignals: [...matchedSignals],
    missingSignals: [...missingSignals],
  }
}

function buildingPatternConfidenceLevel(score: number): V1474BuildingPatternMatchConfidence {
  if (score >= 70) return 'high'
  if (score >= 45) return 'medium'
  return 'low'
}

function buildingPatternActionPolicy(level: V1474BuildingPatternMatchConfidence): V1474BuildingPatternMatch['actionPolicy'] {
  if (level === 'high') return 'backend_consume'
  if (level === 'medium') return 'confidence_only'
  return 'candidate_only'
}

function computeBuildingPatternConfidence(input: {
  record: ResolvedAlgorithmSeedRecord
  standardMatchScore: number
  templateMatched: boolean
  keywordMatched: boolean
  contextSignals: string[]
  featureSignals: string[]
  methodMatchScore: number
  elementMatchScore: number
  projectTypeMatchScore: number
  structureTypeMatchScore: number
  featureProfileProvided: number
  featureProfileMatched: number
  featureProfileConflicts: number
  specificitySignals: string[]
  specificityScore: number
}) {
  const matchedSignals = new Set([...input.contextSignals, ...input.featureSignals, ...input.specificitySignals])
  let score = confidenceScore(input.record) === 3 ? 8 : confidenceScore(input.record) === 2 ? 5 : 2
  if (input.standardMatchScore >= 260) {
    score += 42
    matchedSignals.add('explicit_standard_work_code')
  } else if (input.standardMatchScore >= 140) {
    score += 34
    matchedSignals.add('standard_work_code')
  } else if (input.standardMatchScore > 0) {
    score += 24
    matchedSignals.add('standard_catalog_prefix')
  }
  if (input.templateMatched) {
    score += 14
    matchedSignals.add('template_node')
  }
  if (input.keywordMatched) {
    score += 6
    matchedSignals.add('text_keyword')
  }
  const weightedSignals: Record<string, number> = {
    scope_dimension: 12,
    optional_scope_dimension: 4,
    rhythm_driver: 10,
    primary_workface: 12,
    phase_window: 10,
    expansion_strategy: 8,
  }
  for (const signal of input.contextSignals) score += weightedSignals[signal] ?? 0
  if (input.methodMatchScore > 0) {
    score += 6
    matchedSignals.add('method_variant')
  }
  if (input.elementMatchScore > 0) {
    score += 4
    matchedSignals.add('element_variant')
  }
  if (input.projectTypeMatchScore > 0) {
    score += 5
    matchedSignals.add('project_type')
  }
  if (input.structureTypeMatchScore > 0) {
    score += 5
    matchedSignals.add('structure_type')
  }
  if (input.featureProfileProvided >= 3 && input.featureProfileMatched >= 3) {
    score += 12
    matchedSignals.add('project_generation_facts')
  } else if (input.featureProfileConflicts >= 2) {
    score -= 16
  }
  if (input.specificityScore > 0) {
    score += Math.min(12, Math.round(input.specificityScore / 2))
  } else if (input.specificityScore < 0) {
    score += Math.max(-8, Math.round(input.specificityScore / 2))
  }
  if (input.record.__resolverSource === 'project_override') {
    score += 5
    matchedSignals.add('project_overlay')
  } else if (input.record.__resolverSource === 'company_override') {
    score += 4
    matchedSignals.add('company_overlay')
  } else if (input.record.__resolverSource === 'active_seed') {
    score += 3
    matchedSignals.add('active_seed')
  }
  return {
    confidenceScore: Math.max(0, Math.min(95, Math.round(score))),
    matchedSignals: [...matchedSignals],
  }
}

function readMethodBucketDays(record: AlgorithmSeedRecordPayload, context: V1475SeedMatchContext = {}) {
  const buckets = record.defaultDaysByMethod ?? record.default_days_by_method
  if (!buckets || typeof buckets !== 'object' || Array.isArray(buckets)) return null
  const contextMethods = normalizeTextArray(context.methodVariantCodes).map((item) => item.toLowerCase())
  for (const method of contextMethods) {
    const value = normalizeNumber((buckets as Record<string, unknown>)[method])
    if (value != null && value > 0) return { method, days: value }
  }
  return null
}

function readProjectTypeDurationFactor(record: AlgorithmSeedRecordPayload, context: V1475SeedMatchContext = {}) {
  const projectType = normalizeText(context.projectTypeCode).toLowerCase()
  if (!projectType) return null
  const factors = record.projectTypeDurationFactors ?? record.project_type_duration_factors
  if (!factors || typeof factors !== 'object' || Array.isArray(factors)) return null
  const value = normalizeNumber((factors as Record<string, unknown>)[projectType])
  if (!value || value <= 0 || value === 1) return null
  return { projectType, factor: value }
}

function readStructureTypeDurationFactor(record: AlgorithmSeedRecordPayload, context: V1475SeedMatchContext = {}) {
  const structureType = normalizeText(context.structureTypeCode).toLowerCase()
  if (!structureType) return null
  const factors = record.structureTypeDurationFactors ?? record.structure_type_duration_factors
  if (!factors || typeof factors !== 'object' || Array.isArray(factors)) return null
  const value = normalizeNumber((factors as Record<string, unknown>)[structureType])
  if (!value || value <= 0 || value === 1) return null
  return { structureType, factor: value }
}

function readElementVariantDurationFactor(record: AlgorithmSeedRecordPayload, context: V1475SeedMatchContext = {}) {
  const contextVariants = normalizeTextArray(context.elementVariantCodes).map((item) => item.toLowerCase())
  if (contextVariants.length === 0) return null
  const factors = record.elementVariantDurationFactors ?? record.element_variant_duration_factors
  if (!factors || typeof factors !== 'object' || Array.isArray(factors)) return null
  for (const elementVariant of contextVariants) {
    const value = normalizeNumber((factors as Record<string, unknown>)[elementVariant])
    if (value && value > 0 && value !== 1) return { elementVariant, factor: value }
  }
  return null
}

function readStandardWorkConditionBand(record: AlgorithmSeedRecordPayload, context: V1475SeedMatchContext = {}) {
  const contextSignals = new Set([
    ...normalizeTextArray(context.elementVariantCodes),
    ...normalizeTextArray(context.methodVariantCodes),
    ...normalizeTextArray(context.scopeDimensions),
    ...normalizeTextArray(context.rhythmDrivers),
    normalizeText(context.primaryWorkfaceType),
    normalizeText(context.workEnvironment),
  ].map((item) => item.toLowerCase()).filter(Boolean))

  if (contextSignals.size === 0) return null

  const hasAny = (values: string[]) => values.some((value) => contextSignals.has(value))
  const depthBand = hasAny(['deep_depth', 'long_pile', 'pile_depth_deep', 'deep_pile']) ? 'deep'
    : hasAny(['short_depth', 'shallow_depth', 'shallow_dynamic_compaction', 'shallow_pile', 'pile_depth_short']) ? 'short'
      : hasAny(['standard_depth', 'normal_depth', 'standard_dynamic_compaction']) ? 'standard'
        : null
  const diameterBand = hasAny(['large_diameter', 'large_diameter_pile', 'pile_diameter_large']) ? 'large'
    : hasAny(['standard_diameter', 'normal_diameter']) ? 'standard'
      : null
  const geologyBand = hasAny(['complex_geology', 'karst_geology', 'soft_interlayer', 'high_water_table', 'thick_soft_soil']) ? 'complex'
    : hasAny(['normal_geology', 'standard_geology']) ? 'normal'
      : null
  const facadeSystemBand = hasAny(['unitized_curtain_wall', 'unitized_panel', 'unitized_facade']) ? 'unitized'
    : hasAny(['stone_curtain_wall', 'stone_facade', 'stone_panel_curtain_wall']) ? 'stone'
      : hasAny(['glass_curtain_wall', 'glass_facade']) ? 'glass'
        : hasAny(['metal_panel_curtain_wall', 'metal_facade', 'metal_panel']) ? 'metal'
          : hasAny(['stick_curtain_wall', 'stick_facade', 'frame_curtain_wall']) ? 'stick'
            : null
  const formworkSystemBand = hasAny(['aluminum_formwork', 'aluminum_form_early_strip', 'aluminum_form']) ? 'aluminum'
    : hasAny(['large_form', 'large_formwork', 'full_steel_large_formwork', 'steel_formwork']) ? 'large_form'
      : hasAny(['wood_form', 'wood_formwork', 'timber_formwork', 'timber_form']) ? 'timber'
        : hasAny(['climbing_form', 'climbing_formwork']) ? 'climbing'
          : hasAny(['prefab', 'prefabricated_formwork']) ? 'prefab'
            : null
  const concretePlacementBand = hasAny(['pumped_concrete', 'pump_concrete', 'concrete_pump', 'pump_placement']) ? 'pump'
    : hasAny(['tower_bucket_concrete', 'bucket_concrete', 'skip_concrete', 'crane_bucket_concrete']) ? 'bucket'
      : hasAny(['mass_concrete', 'large_volume_concrete', 'temperature_control_concrete']) ? 'mass'
        : null
  const concreteCuringMethodBand = hasAny(['mass_concrete_temperature_monitoring', 'mass_temperature_monitoring', 'temperature_control_curing', 'mass_concrete_curing']) ? 'mass_temperature_monitoring'
    : hasAny(['early_strength_form_removal', 'early_strength', 'form_removal_strength', 'early_formwork_removal']) ? 'early_strength_form_removal'
      : hasAny(['standard_strength_report', 'strength_report', 'standard_curing', 'concrete_curing', 'test_cube_strength']) ? 'standard_strength_report'
        : null
  const accessSystemBand = hasAny(['floor_standing_scaffold', 'standing_scaffold', 'double_row_scaffold', '落地架']) ? 'floor_standing'
    : hasAny(['cantilever_scaffold', 'cantilevered_scaffold', '悬挑架']) ? 'cantilever'
      : hasAny(['climbing_scaffold', 'climbing_frame', 'climbing_access', '爬架']) ? 'climbing'
        : hasAny(['basket_access', 'suspended_basket', '吊篮']) ? 'basket'
          : null
  const replacementMaterialBand = hasAny(['plain_soil_cushion', 'lime_soil_cushion', 'soil_lime_cushion', 'plain_soil', 'lime_soil']) ? 'soil_lime'
    : hasAny(['sand_gravel_cushion', 'gravel_cushion', 'sand_cushion']) ? 'sand_gravel'
      : hasAny(['geosynthetic_cushion', 'geotextile_cushion', 'flyash_cushion', 'fly_ash_cushion']) ? 'geosynthetic_flyash'
        : null
  const siteSetupMethodBand = hasAny(['laydown_logistics_dust_control', 'laydown_area', 'material_yard', 'dust_control', 'wash_bay', 'spray_dust_control']) ? 'laydown_logistics_dust_control'
    : hasAny(['temporary_utilities', 'temporary_water_power', 'temporary_water', 'temporary_power', 'temp_water_power']) ? 'temporary_utilities'
      : hasAny(['site_mobilization', 'temporary_fencing', 'site_fencing', 'mobilization_fencing', 'site_gate']) ? 'mobilization_fencing'
        : null
  const groutingMethodBand = hasAny(['permeation_grouting', 'seepage_grouting', 'infiltration_grouting']) ? 'permeation'
    : hasAny(['compaction_grouting', 'pressure_grouting', 'split_grouting', 'fracture_grouting']) ? 'compaction'
      : hasAny(['curtain_grouting', 'cutoff_grouting', 'waterproof_curtain_grouting']) ? 'curtain'
        : null
  const hasSurchargePreloading = hasAny(['surcharge_preloading', 'heap_preloading', 'fill_preloading', 'surcharge_load'])
  const hasVacuumPreloading = hasAny(['vacuum_preloading', 'vacuum_consolidation'])
  const preloadingMethodBand = hasAny(['combined_preloading', 'vacuum_surcharge_preloading', 'surcharge_vacuum_preloading'])
    || (hasSurchargePreloading && hasVacuumPreloading) ? 'combined'
      : hasSurchargePreloading ? 'surcharge'
        : hasVacuumPreloading ? 'vacuum'
          : null
  const compositeGroundMethodBand = hasAny(['sand_gravel_pile', 'sand_pile', 'gravel_pile', 'vibro_replacement']) ? 'sand_gravel_pile'
    : hasAny(['lime_soil_compaction_pile', 'lime_soil_pile', 'lime_soil_compaction', 'compaction_lime_soil_pile']) ? 'lime_soil_compaction'
      : hasAny(['compacted_cement_soil_pile', 'cement_soil_compaction_pile', 'cement_soil_pile', 'compacted_soil_cement_pile']) ? 'cement_soil_compaction'
        : null
  const jetGroutingMethodBand = hasAny(['single_tube_jet_grouting', 'single_tube_jet', 'single_pipe_jet_grouting']) ? 'single_tube'
    : hasAny(['double_tube_jet_grouting', 'double_tube_jet', 'double_pipe_jet_grouting']) ? 'double_tube'
      : hasAny(['triple_tube_jet_grouting', 'triple_tube_jet', 'triple_pipe_jet_grouting', 'high_pressure_jet_grouting']) ? 'triple_tube'
        : null
  const cementSoilMixingMethodBand = hasAny(['deep_mixing_single_axis', 'single_axis_mixing', 'single_axis_cement_soil_mixing']) ? 'single_axis'
    : hasAny(['wet_method_mixing', 'wet_deep_mixing', 'deep_wet_mixing']) ? 'wet_deep'
      : hasAny(['deep_mixing_multi_axis', 'multi_axis_mixing', 'two_axis_mixing', 'double_axis_mixing', 'cement_soil_mixing']) ? 'multi_axis'
        : null
  const cfgMethodBand = hasAny(['long_spiral_cfg', 'long_spiral_pile', 'long_spiral_drilled_cfg']) ? 'long_spiral'
    : hasAny(['vibro_cfg', 'vibration_cfg', 'vibro_compaction_cfg']) ? 'vibro'
      : hasAny(['dense_cfg_layout', 'dense_pile_layout', 'small_spacing_cfg']) ? 'dense_layout'
        : null
  const earthworkMethodBand = hasAny(['bulk_excavation', 'earthwork_excavation', 'excavation_transport', 'open_cut_excavation']) ? 'bulk_excavation'
    : hasAny(['deep_pit_excavation', 'foundation_pit_excavation', 'pit_excavation', 'basement_excavation']) ? 'pit_excavation'
      : hasAny(['layered_backfill', 'backfill_compaction', 'earthwork_backfill', 'compacted_backfill']) ? 'layered_backfill'
        : null
  const foundationPitSupportMethodBand = hasAny(['diaphragm_wall', 'underground_diaphragm_wall', 'slurry_wall']) ? 'diaphragm_wall'
    : hasAny(['anchor_cable_support', 'anchor_support', 'internal_strut_support', 'strut_support', 'anchor_strut_support']) ? 'anchor_strut'
      : hasAny(['soil_nail_wall', 'soil_nail', 'shotcrete_soil_nail']) ? 'soil_nail'
        : null
  const boredPileSupportMethodBand = hasAny(['dense_pile_spacing', 'crown_beam_dense', 'dense_bored_pile_support']) ? 'dense_spacing'
    : hasAny(['rotary_drilling_support_pile', 'rotary_bored_pile', 'rotary_bored_support']) ? 'rotary'
      : hasAny(['bored_retaining_pile', 'bored_pile_support', 'support_pile', 'bored_support_pile']) ? 'standard_bored'
        : null
  const sheetPileMethodBand = hasAny(['lock_water_check', 'confined_urban_workface', 'urban_sheet_pile', 'lock_water_sheet_pile']) ? 'lock_water_urban'
    : hasAny(['concrete_sheet_pile', 'precast_sheet_pile']) ? 'concrete_sheet'
      : hasAny(['steel_sheet_pile', 'sheet_pile_wall', 'sheet_pile']) ? 'steel_sheet'
        : null
  const secantPileMethodBand = hasAny(['hard_interlock_sequence', 'hard_interlock', 'secant_interlock_tolerance']) ? 'hard_interlock'
    : hasAny(['full_casing_drilling', 'full_casing', 'casing_drilling_secant']) ? 'full_casing'
      : hasAny(['primary_secondary_pile', 'primary_secondary_secant', 'secant_pile_wall', 'secant_wall']) ? 'primary_secondary'
        : null
  const smwMethodBand = hasAny(['dense_cement_soil_wall', 'dense_smw', 'thick_cement_soil_wall']) ? 'dense_cement_soil'
    : hasAny(['h_steel_insert', 'h_steel_smw', 'h_section_steel', 'steel_insertion']) ? 'h_steel_insert'
      : hasAny(['three_axis_mixing_pile', 'three_axis_smw', 'smw_wall', 'smw']) ? 'three_axis'
        : null
  const soilNailMethodBand = hasAny(['dense_nail_spacing', 'dense_soil_nail', 'small_spacing_soil_nail']) ? 'dense_nail_spacing'
    : hasAny(['staged_excavation', 'layered_excavation', 'soil_nail_wall']) ? 'staged_excavation'
      : hasAny(['shotcrete_mesh', 'mesh_shotcrete', 'sprayed_concrete_mesh', 'shotcrete_soil_nail']) ? 'shotcrete_mesh'
        : null
  const diaphragmWallMethodBand = hasAny(['deep_panel', 'deep_diaphragm_panel', 'deep_panel_diaphragm']) ? 'deep_panel'
    : hasAny(['strict_slurry_recycling', 'slurry_recycling_strict', 'slurry_recycling_control']) ? 'strict_slurry_recycling'
      : hasAny(['standard_panel', 'diaphragm_wall', 'standard_diaphragm_panel']) ? 'standard_panel'
        : null
  const cementSoilWallMethodBand = hasAny(['jet_grouting_cutoff', 'jet_grouting_wall', 'cutoff_jet_grouting']) ? 'jet_grouting_cutoff'
    : hasAny(['gravity_cement_soil_wall', 'cement_soil_gravity_wall', 'gravity_wall']) ? 'gravity_wall'
      : hasAny(['mixing_cement_soil_wall', 'cement_soil_wall', 'mixing_wall']) ? 'mixing_wall'
        : null
  const internalStrutMethodBand = hasAny(['multi_level_strut', 'multi_level_prestressed_strut', 'prestress_locking', 'prestressed_strut']) ? 'multi_level_prestressed'
    : hasAny(['concrete_strut', 'reinforced_concrete_strut']) ? 'concrete_strut'
      : hasAny(['steel_strut', 'single_level_steel_strut', 'internal_strut_support']) ? 'steel_strut'
        : null
  const hasSecondaryGrouting = hasAny(['secondary_grouting', 'post_grouting', 'secondary_pressure_grouting'])
  const hasPrestressTensioning = hasAny(['prestress_tensioning', 'prestressed_anchor', 'tensioning_lockoff'])
  const anchorSupportMethodBand = (hasSecondaryGrouting && hasPrestressTensioning) ? 'secondary_grouting_prestressed'
    : hasSecondaryGrouting ? 'secondary_grouting_prestressed'
      : hasAny(['anchor_cable', 'anchor_cable_support', 'prestressed_anchor_cable']) ? 'anchor_cable'
        : hasAny(['anchor_rod', 'anchor_support', 'soil_anchor_rod']) ? 'anchor_rod'
          : null
  const hasSupportRemoval = hasAny(['support_removal_condition', 'support_removal', 'strut_removal'])
  const hasLoadTransfer = hasAny(['load_transfer_check', 'load_transfer', 'force_transfer_check'])
  const interfaceSupportMethodBand = (hasSupportRemoval && hasLoadTransfer) ? 'support_removal_transfer'
    : hasSupportRemoval ? 'support_removal_transfer'
      : hasAny(['waterproof_interface', 'waterproof_load_transfer']) || hasLoadTransfer ? 'waterproof_load_transfer'
        : hasAny(['basement_interface_handover', 'basement_handover', 'interface_handover']) ? 'basement_handover'
          : null
  const hasRechargeWell = hasAny(['recharge_well', 'recharge_dewatering', 'recharge_well_system'])
  const hasContinuousMonitoring = hasAny(['continuous_pumping_monitoring', 'continuous_monitoring', 'operation_monitoring'])
  const dewateringMethodBand = (hasRechargeWell || hasContinuousMonitoring) ? 'recharge_monitoring'
    : hasAny(['deep_well_dewatering', 'deep_well', 'tube_well_dewatering']) ? 'deep_well'
      : hasAny(['wellpoint_dewatering', 'wellpoint', 'light_wellpoint']) ? 'wellpoint'
        : null
  const slopeSupportMethodBand = hasAny(['retaining_wall_slope', 'slope_drainage', 'retaining_wall_drainage']) ? 'retaining_wall_drainage'
    : hasAny(['shotcrete_anchor_slope', 'shotcrete_anchor', 'sprayed_anchor_slope']) ? 'shotcrete_anchor'
      : hasAny(['slope_excavation', 'open_slope_excavation']) ? 'slope_excavation'
        : null
  const precastPileMethodBand = hasAny(['precast_square_pile', 'pile_jointing', 'jointed_precast_pile']) ? 'precast_square_jointed'
    : hasAny(['hammer_driven_precast_pile', 'driven_precast_pile']) ? 'hammer_driven'
      : hasAny(['phc_static_press_pile', 'static_pressed_pile', 'phc_pile']) ? 'phc_static_press'
        : null
  const dryBoredPileMethodBand = hasAny(['manual_dug_pile', 'manual_dug_complex']) ? 'manual_dug_complex'
    : hasAny(['rotary_dry_drilling', 'dry_rotary_pile']) ? 'rotary_dry'
      : hasAny(['auger_dry_drilling', 'dry_bored_pile']) ? 'auger_dry'
        : null
  const pileFoundationMethodBand = hasAny(['static_load_test', 'low_strain_test', 'high_strain_test', 'pile_testing', 'pile_test_closeout']) ? 'testing_closeout'
    : hasAny(['bored_cast_in_place_pile', 'cast_in_place_pile', 'rotary_drilling_pile', 'slurry_supported_bored_pile']) ? 'bored_cast_in_place'
      : hasAny(['phc_static_press_pile', 'static_pressed_pile', 'precast_static_press_pile', 'phc_pile']) ? 'precast_static_press'
        : null
  const longSpiralPileMethodBand = hasAny(['post_inserted_cage', 'post_inserted_rebar_cage', 'post_cage_insertion']) ? 'post_inserted_cage'
    : hasAny(['pressure_grouted_pile', 'long_spiral_pressure_grouted', 'pressure_grouting_long_spiral']) ? 'pressure_grouted'
      : hasAny(['cfa_pile', 'long_spiral_drilled_pile', 'continuous_drilling_pumping']) ? 'cfa_continuous'
        : null
  const drivenCastInPlacePileMethodBand = hasAny(['pipe_withdrawal_control', 'withdrawal_control', 'complex_tube_withdrawal']) ? 'withdrawal_complex'
    : hasAny(['vibration_sunk_tube_pile', 'vibration_sunk_tube', 'vibro_sunk_tube']) ? 'vibration_sunk_tube'
      : hasAny(['hammer_sunk_tube_pile', 'hammer_sunk_tube', 'driven_cast_in_place_pile']) ? 'hammer_sunk_tube'
        : null
  const steelPileMethodBand = hasAny(['welded_splice_steel_pile', 'welded_splice', 'deep_spliced_steel_pile']) ? 'welded_splice'
    : hasAny(['steel_pipe_pile', 'steel_pipe', 'pipe_steel_pile']) ? 'steel_pipe'
      : hasAny(['h_steel_pile', 'h_steel', 'h_section_steel_pile']) ? 'h_steel'
        : null
  const anchorStaticPressurePileMethodBand = hasAny(['confined_reinforcement_pile', 'confined_reinforcement', 'settlement_control_static_pile']) ? 'confined_reinforcement'
    : hasAny(['underpinning_static_pile', 'underpinning_static_pressure_pile', 'underpinning_pile']) ? 'underpinning'
      : hasAny(['reaction_frame_static_press', 'reaction_frame_static_pile', 'anchor_static_pressure_pile']) ? 'reaction_frame'
        : null
  const rockAnchorFoundationMethodBand = hasAny(['hard_rock_drilling', 'hard_rock_anchor', 'deep_rock_anchor']) ? 'hard_rock_deep'
    : hasAny(['prestressed_anchor', 'prestressed_rock_anchor', 'tensioned_rock_anchor']) ? 'prestressed'
      : hasAny(['non_prestressed_anchor', 'rock_bolt', 'rock_anchor']) ? 'non_prestressed'
        : null
  const foundationCushionMethodBand = hasAny(['thick_raft_blinding', 'thick_blinding', 'raft_blinding']) ? 'thick_raft'
    : hasAny(['sand_gravel_cushion', 'gravel_cushion', 'sand_cushion']) ? 'sand_gravel'
      : hasAny(['lean_concrete_blinding', 'concrete_blinding', 'blinding_concrete']) ? 'lean_concrete'
        : null
  const shallowFoundationMethodBand = hasAny(['box_foundation', 'mass_concrete_foundation', 'box_mass_foundation']) ? 'box_mass'
    : hasAny(['raft_foundation', 'mat_foundation', 'raft_slab_foundation']) ? 'raft'
      : hasAny(['isolated_footing', 'strip_footing', 'spread_footing', 'independent_foundation']) ? 'isolated_strip'
        : null
  const caissonFoundationMethodBand = hasAny(['wet_sinking_caisson', 'wet_sinking', 'underwater_sinking_caisson']) ? 'wet_sinking'
    : hasAny(['box_caisson', 'box_well_foundation']) ? 'box_caisson'
      : hasAny(['dry_open_caisson', 'dry_sinking_caisson', 'open_caisson']) ? 'dry_open'
        : null
  const basementStructureMethodBand = hasAny(['deep_topdown_basement', 'topdown_basement', 'deep_basement', 'reverse_construction_basement']) ? 'deep_topdown'
    : hasAny(['multi_level_basement', 'two_level_basement', 'multiple_basement_levels']) ? 'multi_level'
      : hasAny(['single_level_basement', 'one_level_basement', 'basement_structure']) ? 'single_level'
        : null
  const basementWaterproofMethodBand = hasAny(['layered_backfill_dewatering', 'dewatering_backfill', 'staged_backfill_dewatering']) ? 'layered_backfill_dewatering'
    : hasAny(['composite_tanking', 'tanking_protection', 'external_tanking_protection']) ? 'tanking_protection'
      : hasAny(['membrane_backfill', 'basement_membrane_waterproof', 'waterproof_backfill']) ? 'membrane_backfill'
        : null
  const pcHoistingMethodBand = hasAny(['heavy_integrated_pc_hoist', 'heavy_integrated_component', 'large_pc_component', 'integrated_bathroom_module']) ? 'heavy_integrated'
    : hasAny(['wall_column_panel', 'pc_wall_panel', 'precast_wall_column', 'vertical_pc_component']) ? 'wall_column_panel'
      : hasAny(['composite_slab', 'precast_slab', 'stair_balcony_component', 'pc_stair_balcony']) ? 'slab_stair_balcony'
        : null
  const pcJointMethodBand = hasAny(['pressure_grouting_reinspection', 'pressure_grouting_joint', 'grouting_reinspection', 'joint_reinspection']) ? 'pressure_reinspection'
    : hasAny(['dense_wall_column_joint', 'dense_pc_joint', 'wall_column_grouting', 'vertical_joint_grouting']) ? 'dense_wall_column'
      : hasAny(['standard_sleeve_grouting', 'sleeve_grouting', 'pc_grouting_joint']) ? 'standard_sleeve'
        : null
  const steelFabricationMethodBand = hasAny(['large_span_preassembly', 'preassembly_steel', 'factory_preassembly', 'trial_assembly']) ? 'large_span_preassembly'
    : hasAny(['complex_node_deepening', 'complex_steel_node', 'node_deepening', 'connection_detail_deepening']) ? 'complex_node'
      : hasAny(['standard_shop_drawing', 'shop_drawing', 'steel_fabrication_deepening']) ? 'standard_shop_drawing'
        : null
  const steelErectionMethodBand = hasAny(['large_span_heavy_lift', 'heavy_lift_steel', 'large_span_roof_lift', 'segment_lifting']) ? 'large_span_heavy_lift'
    : hasAny(['multi_crane_frame', 'multi_crane_erection', 'frame_steel_erection', 'synchronized_lifting']) ? 'multi_crane_frame'
      : hasAny(['single_crane_bay', 'single_crane_erection', 'bay_erection', 'steel_erection']) ? 'single_crane_bay'
        : null
  const steelTubeConcreteMethodBand = hasAny(['dense_joint_cfsteel_tube', 'dense_joint_steel_tube', 'constrained_cfsteel_tube']) ? 'dense_joint_constrained'
    : hasAny(['large_diameter_cfsteel_tube', 'large_diameter_tube_concrete', 'pumped_cfsteel_tube']) ? 'large_diameter_pumped'
      : hasAny(['standard_cfsteel_tube', 'concrete_filled_steel_tube', 'steel_tube_concrete_structure']) ? 'standard_cfsteel_tube'
        : null
  const steelReinforcedConcreteMethodBand = hasAny(['dense_src_transfer', 'src_transfer_beam', 'transfer_src_joint', 'dense_steel_reinforced_concrete']) ? 'dense_transfer'
    : hasAny(['src_core_joint', 'core_joint_src', 'complex_src_joint']) ? 'core_joint'
      : hasAny(['standard_src_frame', 'steel_reinforced_concrete_frame', 'steel_reinforced_concrete_structure']) ? 'standard_src_frame'
        : null
  const steelConnectionMethodBand = hasAny(['thick_plate_welding_reinspection', 'thick_plate_welding', 'weld_reinspection', 'welding_reinspection']) ? 'thick_plate_reinspection'
    : hasAny(['standard_welding', 'site_welding', 'steel_welding']) ? 'standard_welding'
      : hasAny(['high_strength_bolting', 'high_strength_bolt', 'steel_bolting', 'bolting']) ? 'high_strength_bolting'
        : null
  const largeSpanRoofMethodBand = hasAny(['reticulated_shell_heavy_lift', 'reticulated_shell', 'space_shell_heavy_lift', 'large_span_roof_heavy_lift']) ? 'reticulated_shell_heavy_lift'
    : hasAny(['truss_segmental_lift', 'segmental_truss_roof', 'large_span_truss', 'roof_truss_segment']) ? 'truss_segmental_lift'
      : hasAny(['space_frame_modular', 'modular_space_frame', 'space_frame', 'grid_roof']) ? 'space_frame_modular'
        : null
  const timberStructureMethodBand = hasAny(['traditional_timber', 'traditional_wood_structure', 'heritage_timber', 'mortise_tenon_timber']) ? 'traditional_timber'
    : hasAny(['glulam_frame', 'glulam', 'laminated_timber_frame', 'engineered_timber']) ? 'glulam_frame'
      : hasAny(['light_timber_panel', 'light_timber', 'timber_panel', 'wood_panelized']) ? 'light_timber_panel'
        : null
  const steelEnvelopeMethodBand = hasAny(['curved_metal_roof', 'curved_roof_panel', 'standing_seam_curved', 'curved_steel_roof']) ? 'curved_metal_roof'
    : hasAny(['sandwich_panel', 'insulated_metal_panel', 'composite_roof_panel']) ? 'sandwich_panel'
      : hasAny(['single_skin_panel', 'single_skin_metal_panel', 'metal_wall_panel', 'profiled_steel_sheet']) ? 'single_skin_panel'
        : null
  const masonryWallMethodBand = hasAny(['secondary_structure_dense', 'dense_secondary_structure', 'constructible_column_dense', 'ring_beam_dense']) ? 'secondary_structure_dense'
    : hasAny(['concrete_block', 'hollow_concrete_block', 'small_concrete_block']) ? 'concrete_block'
      : hasAny(['aac_block', 'alc_block', 'autoclaved_aerated_block', 'aerated_block']) ? 'aac_block'
        : null
  const plasteringMethodBand = hasAny(['exterior_base_coat', 'external_plaster_base', 'facade_base_coat', 'outside_plaster']) ? 'exterior_base_coat'
    : hasAny(['cement_mortar', 'cement_mortar_plaster', 'mortar_plaster']) ? 'cement_mortar'
      : hasAny(['gypsum_skim', 'skim_coat', 'gypsum_plaster', 'putty_skim']) ? 'gypsum_skim'
        : null
  const roofWaterproofMethodBand = hasAny(['inverted_roof_ponding_test', 'inverted_roof', 'ponding_test_roof', 'water_test_roof']) ? 'inverted_roof_ponding_test'
    : hasAny(['insulation_membrane', 'thermal_insulation_membrane', 'insulated_membrane_roof']) ? 'insulation_membrane'
      : hasAny(['membrane_waterproof', 'roof_membrane', 'sheet_membrane_roof', 'waterproof_membrane']) ? 'membrane_waterproof'
        : null
  const roofInsulationMethodBand = hasAny(['spray_foam_thermal_bridge', 'spray_foam_insulation', 'foam_insulation', 'thermal_bridge_treatment', 'thermal_bridge']) ? 'spray_foam_thermal_bridge'
    : hasAny(['tapered_slope_insulation', 'tapered_insulation', 'slope_insulation', 'roof_slope_layer', 'slope_layer']) ? 'tapered_slope_insulation'
      : hasAny(['board_insulation', 'insulation_board', 'xps_board', 'eps_board', 'rigid_insulation_board', 'roof_insulation_board']) ? 'board_insulation'
        : null
  const roofMembraneMethodBand = hasAny(['multi_layer_ponding_test', 'multi_layer_membrane', 'double_layer_membrane', 'ponding_test_roof', 'water_test_roof', 'flood_test_required']) ? 'multi_layer_ponding_test'
    : hasAny(['coating_membrane', 'waterproof_coating', 'coating_waterproof', 'polyurethane_coating', 'js_coating', 'roof_coating']) ? 'coating_membrane'
      : hasAny(['sheet_membrane', 'sbs_roof_membrane', 'tpo_membrane', 'pvc_membrane', 'roof_membrane', 'waterproof_membrane']) ? 'sheet_membrane'
        : null
  const roofTilePanelMethodBand = hasAny(['dense_ridge_eave_nodes', 'dense_roof_nodes', 'ridge_eave_nodes', 'flashing_dense', 'roof_node_dense']) ? 'dense_ridge_eave_nodes'
    : hasAny(['metal_panel_roof', 'metal_roof_panel', 'standing_seam_panel', 'profiled_metal_roof', 'roof_panel']) ? 'metal_panel'
      : hasAny(['clay_concrete_tile', 'clay_tile', 'concrete_tile', 'roof_tile', 'tile_roof']) ? 'clay_concrete_tile'
        : null
  const roofDetailMethodBand = hasAny(['equipment_root_dense', 'equipment_root', 'pipe_root_dense', 'roof_equipment_base', 'dense_equipment_roof']) ? 'equipment_root_dense'
    : hasAny(['gutter_drainage_nodes', 'roof_gutter', 'rainwater_outlet', 'drainage_outlet', 'gutter_node']) ? 'gutter_drainage_nodes'
      : hasAny(['standard_flashing', 'roof_flashing', 'parapet_flashing', 'flashing_closure', 'roof_detail']) ? 'standard_flashing'
        : null
  const exteriorWallWaterproofMethodBand = hasAny(['spray_test_high_rise', 'spray_water_test', 'water_spray_test', 'high_rise_spray_test', 'facade_spray_test']) ? 'spray_test_high_rise'
    : hasAny(['membrane_window_node', 'window_node_waterproof', 'exterior_window_node', 'facade_window_node', 'window_perimeter_waterproof']) ? 'membrane_window_node'
      : hasAny(['coating_waterproof', 'exterior_wall_coating', 'facade_waterproof_coating', 'waterproof_coating']) ? 'coating_waterproof'
        : null
  const floorFinishMethodBand = hasAny(['timber_floor_protected', 'wood_floor_protected', 'timber_floor', 'wood_floor', 'finished_product_protection']) ? 'timber_floor_protected'
    : hasAny(['tile_stone', 'floor_tile', 'stone_floor', 'ceramic_tile_floor', 'tile_paving']) ? 'tile_stone'
      : hasAny(['self_leveling', 'floor_leveling', 'self_leveling_floor', 'screed_leveling', 'leveling_layer']) ? 'self_leveling'
        : null
  const exteriorInsulationMethodBand = hasAny(['thick_insulation_node', 'thick_insulation', 'insulation_node_dense', 'external_insulation_node']) ? 'thick_insulation_node'
    : hasAny(['insulated_panel', 'external_insulated_panel', 'insulation_decorative_panel', 'facade_insulation_panel']) ? 'insulated_panel'
      : hasAny(['thin_plaster_eps', 'eps_thin_plaster', 'external_insulation_thin_plaster', 'thin_plaster_insulation']) ? 'thin_plaster_eps'
        : null
  const ceilingSystemMethodBand = hasAny(['complex_mep_terminal', 'dense_mep_terminal', 'access_panel_dense', 'ceiling_mep_coordination']) ? 'complex_mep_terminal'
    : hasAny(['gypsum_board', 'plasterboard_ceiling', 'gypsum_ceiling']) ? 'gypsum_board'
      : hasAny(['mineral_board', 'mineral_wool_board', 'acoustic_ceiling', 'lay_in_ceiling']) ? 'mineral_board'
        : null
  const doorWindowRailingMethodBand = hasAny(['railing_louver', 'railing', 'louver', 'balustrade']) ? 'railing_louver'
    : hasAny(['system_window', 'high_rise_system_window', 'aluminum_system_window']) ? 'system_window'
      : hasAny(['standard_door_window', 'door_window', 'standard_window', 'standard_door']) ? 'standard_door_window'
        : null
  const interiorDetailMethodBand = hasAny(['handrail_guardrail', 'handrail', 'guardrail', 'interior_railing', 'stair_handrail']) ? 'handrail_guardrail'
    : hasAny(['stone_metal_trim', 'metal_trim', 'stone_trim', 'dense_trim_node', 'decorative_trim']) ? 'stone_metal_trim'
      : hasAny(['cabinet_curtain_box', 'curtain_box', 'cabinet_detail', 'window_board', 'door_window_casing']) ? 'cabinet_curtain_box'
        : null
  const interiorPublicFinishMethodBand = hasAny(['renovation_constrained_finish', 'public_finish_renovation', 'occupied_public_finish', 'renovation_public_area']) ? 'renovation_constrained_finish'
    : hasAny(['complex_lobby_finish', 'lobby_public_finish', 'atrium_lobby_finish', 'public_lobby_finish']) ? 'complex_lobby_finish'
      : hasAny(['standard_corridor_finish', 'corridor_public_finish', 'public_area_finish', 'standard_public_finish']) ? 'standard_corridor_finish'
        : null
  const interiorUnitFinishMethodBand = hasAny(['renovation_occupied_finish', 'occupied_unit_finish', 'unit_finish_renovation', 'residential_renovation_finish']) ? 'renovation_occupied_finish'
    : hasAny(['wet_area_finish', 'kitchen_bath_finish', 'bathroom_finish', 'kitchen_finish', 'unit_wet_area_finish']) ? 'wet_area_finish'
      : hasAny(['standard_repeated_finish', 'repeated_unit_finish', 'standard_unit_finish', 'typical_unit_finish']) ? 'standard_repeated_finish'
        : null
  const lightweightPartitionWallMethodBand = hasAny(['glass_partition_constrained', 'constrained_glass_partition', 'glass_partition', 'frameless_glass_partition']) ? 'glass_partition_constrained'
    : hasAny(['alc_panel_partition', 'alc_partition_panel', 'aac_panel_partition', 'precast_lightweight_panel']) ? 'alc_panel_partition'
      : hasAny(['stud_board_partition', 'light_steel_stud_partition', 'gypsum_board_partition', 'keel_partition']) ? 'stud_board_partition'
        : null
  const wallPanelFinishMethodBand = hasAny(['feature_wall_constrained_node', 'feature_wall_panel', 'complex_wall_panel_node', 'dense_trim_wall_panel']) ? 'feature_wall_constrained_node'
    : hasAny(['stone_ceramic_panel', 'stone_wall_panel', 'ceramic_wall_panel', 'heavy_wall_panel']) ? 'stone_ceramic_panel'
      : hasAny(['wood_metal_panel', 'wood_wall_panel', 'metal_wall_panel', 'decorative_wall_panel']) ? 'wood_metal_panel'
        : null
  const tileFacingMethodBand = hasAny(['wet_area_pattern_tile', 'wet_area_tile', 'pattern_tile', 'bathroom_tile', 'kitchen_tile', 'slope_drain_tile']) ? 'wet_area_pattern_tile'
    : hasAny(['exterior_tile', 'external_tile', 'facade_tile', 'outdoor_tile']) ? 'exterior_tile'
      : hasAny(['standard_indoor_tile', 'indoor_tile', 'wall_floor_tile', 'ceramic_tile']) ? 'standard_indoor_tile'
        : null
  const coatingPaintFinishMethodBand = hasAny(['epoxy_solvent_high_requirement', 'epoxy_paint', 'solvent_paint', 'high_requirement_paint', 'floor_epoxy_paint']) ? 'epoxy_solvent_high_requirement'
    : hasAny(['exterior_weatherproof_coating', 'exterior_weatherproof', 'facade_coating', 'external_paint', 'outdoor_coating']) ? 'exterior_weatherproof'
      : hasAny(['interior_emulsion_paint', 'interior_emulsion', 'emulsion_paint', 'latex_paint', 'indoor_paint']) ? 'interior_emulsion'
        : null
  const wallpaperSoftFinishMethodBand = hasAny(['soft_package_constrained', 'soft_package', 'upholstered_panel', 'padded_wall_panel', 'dense_soft_package_node']) ? 'soft_package_constrained'
    : hasAny(['wall_fabric_dense_joint', 'wall_fabric', 'wall_cloth', 'fabric_wall_covering', 'dense_wall_covering_joint']) ? 'wall_fabric_dense_joint'
      : hasAny(['standard_wallpaper', 'wallpaper', 'wall_paper', 'standard_wall_covering']) ? 'standard_wallpaper'
        : null
  const outdoorUtilitiesMethodBand = hasAny(['existing_utility_relocation', 'utility_relocation', 'existing_utility_conversion', 'utility_protection_relocation', 'live_utility_relocation']) ? 'existing_utility_relocation'
    : hasAny(['multi_network_crossing', 'multi_utility_crossing', 'utility_crossing_interface', 'road_crossing_utility', 'pipe_cable_crossing']) ? 'multi_network_crossing'
      : hasAny(['standard_outdoor_utility_handover', 'standard_handover', 'outdoor_utility_handover', 'utility_connection_handover']) ? 'standard_handover'
        : null
  const outdoorWaterSupplyNetworkMethodBand = hasAny(['municipal_tie_in_hydrant', 'municipal_tie_in', 'outdoor_hydrant_system', 'hydrant_dense_zone', 'water_authority_tie_in']) ? 'municipal_tie_in_hydrant'
    : hasAny(['ductile_iron_main_pressure', 'ductile_iron_pipe', 'di_pipe', 'water_main_pressure_test', 'pressure_test_main']) ? 'ductile_iron_main_pressure'
      : hasAny(['pe_pipe_standard_trench', 'pe_pipe', 'hdpe_pipe', 'standard_water_trench', 'open_trench_water_supply']) ? 'pe_pipe_standard_trench'
        : null
  const outdoorDrainageNetworkMethodBand = hasAny(['manhole_gully_dense_network', 'manhole_dense_network', 'gully_dense_network', 'dense_manhole', 'inspection_chamber_dense']) ? 'manhole_gully_dense_network'
    : hasAny(['combined_rain_sewage_closed_water', 'combined_rain_sewage', 'rain_sewage_combined', 'closed_water_test', 'sewage_closed_water']) ? 'combined_rain_sewage_closed_water'
      : hasAny(['rainwater_pipe_standard_trench', 'rainwater_pipe', 'stormwater_pipe', 'standard_drainage_trench', 'open_trench_drainage']) ? 'rainwater_pipe_standard_trench'
        : null
  const outdoorHeatingNetworkMethodBand = hasAny(['pipe_gallery_insulation_jacket', 'pipe_gallery_heating', 'insulation_jacket', 'gallery_heat_pipe', 'constrained_heat_insulation']) ? 'pipe_gallery_insulation_jacket'
    : hasAny(['welded_steel_pressure_anticorrosion', 'welded_steel_heat_pipe', 'heat_pipe_pressure_test', 'anticorrosion_insulation', 'welded_heat_network']) ? 'welded_steel_pressure_anticorrosion'
      : hasAny(['direct_buried_prefab_heat_pipe', 'direct_buried_heat_pipe', 'prefab_insulated_heat_pipe', 'direct_buried_heating', 'preinsulated_heat_pipe']) ? 'direct_buried_prefab_heat_pipe'
        : null
  const outdoorRoadHardscapeMethodBand = hasAny(['hardscape_paving_curb_dense', 'curb_dense_hardscape_paving', 'dense_curb_paving', 'paving_curb_dense', 'kerb_dense_paving', 'curbstone_dense']) ? 'hardscape_paving_curb_dense'
    : hasAny(['asphalt_surface_paving', 'asphalt_pavement', 'road_surface_paving', 'pavement_surface', 'surface_paving', 'asphalt_testing']) ? 'asphalt_surface_paving'
      : hasAny(['road_base_compaction', 'road_base', 'base_course', 'subbase_compaction', 'roadbed_compaction', 'base_leveling_compaction']) ? 'road_base_compaction'
        : null
  const landscapeGreeneryMethodBand = hasAny(['turf_groundcover_slope', 'slope_groundcover_dense', 'groundcover_slope', 'slope_turf', 'dense_groundcover', 'anti_erosion_groundcover']) ? 'turf_groundcover_slope'
    : hasAny(['tree_shrub_planting_support', 'tree_shrub_planting', 'tree_planting', 'shrub_planting', 'staking_support', 'nursery_stock_planting']) ? 'tree_shrub_planting_support'
      : hasAny(['planting_soil_improvement', 'planting_soil', 'soil_improvement', 'landscape_soil_backfill', 'planting_soil_backfill']) ? 'planting_soil_improvement'
        : null
  const singleSystemCommissioningMethodBand = hasAny(['control_loop_linkage_debugging', 'control_loop_debugging', 'loop_linkage_debugging', 'system_point_commissioning', 'controller_actuator_linkage']) ? 'control_loop_linkage_debugging'
    : hasAny(['water_air_balancing_subsystem', 'water_air_balancing', 'hydronic_air_balancing', 'subsystem_balancing', 'air_water_balancing']) ? 'water_air_balancing_subsystem'
      : hasAny(['standalone_equipment_function_test', 'standalone_equipment_test', 'equipment_function_test', 'single_machine_test', 'local_function_test']) ? 'standalone_equipment_function_test'
        : null
  const integratedCommissioningMethodBand = hasAny(['data_platform_integrated', 'data_platform_integrated_acceptance', 'bms_platform_integration', 'dashboard_bms_integration', 'platform_integrated_acceptance']) ? 'data_platform_integrated'
    : hasAny(['life_safety_linkage', 'life_safety_linkage_integrated', 'fire_smoke_elevator_linkage', 'fire_smoke_power_linkage', 'emergency_mode_linkage']) ? 'life_safety_linkage'
      : hasAny(['mep_multi_system_joint', 'mep_multi_system_joint_commissioning', 'multi_system_joint_commissioning', 'mep_integrated_commissioning', 'cross_system_commissioning']) ? 'mep_multi_system_joint'
        : null
  const energyHvacSystemMethodBand = hasAny(['energy_acceptance_balancing', 'energy_acceptance_balancing_constrained', 'energy_witness_balancing', 'hvac_energy_acceptance', 'rectification_retest_balancing']) ? 'energy_acceptance_balancing'
    : hasAny(['equipment_pipe_network', 'hvac_equipment_pipe_network', 'pipe_network_energy_inspection', 'source_pipe_network_inspection', 'hvac_equipment_network']) ? 'equipment_pipe_network'
      : hasAny(['heat_metering_balance', 'heat_metering_balance_standard', 'heat_metering', 'hydronic_energy_balance', 'metering_balancing']) ? 'heat_metering_balance'
        : null
  const energyElectricalLightingMethodBand = hasAny(['emergency_egress_acceptance', 'emergency_egress_lighting_acceptance', 'emergency_lighting_acceptance', 'egress_lighting_acceptance', 'backup_lighting_test']) ? 'emergency_egress_acceptance'
    : hasAny(['scene_control_debugging', 'lighting_scene_control_debugging', 'lighting_scene_control', 'dimming_control_debugging', 'sensor_schedule_debugging']) ? 'scene_control_debugging'
      : hasAny(['power_density_metering', 'lighting_power_density_metering', 'lighting_power_density', 'lpd_metering', 'sub_metering_lighting']) ? 'power_density_metering'
        : null
  const energyMonitoringControlMethodBand = hasAny(['dense_linkage_acceptance', 'dense_monitoring_linkage_acceptance', 'monitoring_linkage_acceptance', 'alarm_trend_acceptance', 'cross_subsystem_monitoring_linkage']) ? 'dense_linkage_acceptance'
    : hasAny(['control_strategy_integration', 'control_strategy_platform_integration', 'energy_control_strategy', 'platform_strategy_integration', 'dashboard_alarm_trend_validation']) ? 'control_strategy_integration'
      : hasAny(['metering_data_acquisition', 'metering_data_acquisition_points', 'energy_metering_points', 'data_acquisition_points', 'gateway_metering_acquisition']) ? 'metering_data_acquisition'
        : null
  const energyRenewableSystemMethodBand = hasAny(['ground_source_hybrid_commissioning', 'ground_source_heat_pump_hybrid_commissioning', 'ground_source_heat_pump_commissioning', 'hybrid_renewable_commissioning', 'ground_loop_heat_pump_commissioning']) ? 'ground_source_hybrid_commissioning'
    : hasAny(['solar_thermal_storage_loop', 'solar_thermal_collector_storage_loop', 'solar_thermal_loop', 'collector_storage_loop', 'solar_hot_water_storage']) ? 'solar_thermal_storage_loop'
      : hasAny(['photovoltaic_grid_interface', 'photovoltaic_array_grid_interface', 'pv_grid_interface', 'pv_inverter_grid', 'photovoltaic_metering_commissioning']) ? 'photovoltaic_grid_interface'
        : null
  const plumbingWaterSupplyPipeMethodBand = hasAny(['renovation_tie_in_pipe', 'existing_pipe_tie_in', 'pipe_tie_in', 'water_supply_tie_in', 'shutdown_tie_in']) ? 'renovation_tie_in'
    : hasAny(['steel_riser_pressure_test', 'steel_riser', 'main_riser_pressure', 'water_supply_riser', 'pressure_test_riser']) ? 'steel_riser_pressure'
      : hasAny(['ppr_branch_pipe', 'ppr_branch', 'water_supply_branch', 'branch_pipe', 'ppr_pipe']) ? 'ppr_branch'
        : null
  const plumbingFirePipeMethodBand = hasAny(['fire_linkage_commissioning', 'fire_water_linkage', 'fire_pump_linkage', 'alarm_valve_linkage', 'fire_acceptance_commissioning']) ? 'fire_linkage_commissioning'
    : hasAny(['sprinkler_dense_terminal', 'dense_sprinkler', 'sprinkler_terminal', 'sprinkler_head_dense', 'sprinkler_branch_dense']) ? 'sprinkler_dense_terminal'
      : hasAny(['hydrant_pipe', 'fire_hydrant_pipe', 'hydrant_riser', 'fire_hydrant', 'hydrant_branch']) ? 'hydrant_pipe'
        : null
  const plumbingDrainageMethodBand = hasAny(['cast_iron_drainage_renovation', 'cast_iron_renovation', 'existing_drainage_tie_in', 'drainage_renovation_tie_in']) ? 'cast_iron_renovation'
    : hasAny(['rainwater_riser_closed_water', 'rainwater_riser_test', 'rainwater_riser', 'closed_water_test', 'ball_passing_test']) ? 'rainwater_riser_test'
      : hasAny(['pvc_branch_drainage', 'pvc_branch', 'drainage_branch', 'pvc_drainage_pipe']) ? 'pvc_branch'
        : null
  const plumbingSupplyDrainageMethodBand = hasAny(['supply_drainage_renovation_tie_in', 'renovation_supply_drainage', 'existing_supply_drainage_tie_in', 'supply_drainage_tie_in']) ? 'renovation_tie_in'
    : hasAny(['supply_drainage_combined', 'water_supply_drainage_combined', 'combined_supply_drainage']) ? 'supply_drainage_combined'
      : hasAny(['indoor_supply_branch', 'water_supply_branch', 'supply_branch', 'supply_branch_pipe']) ? 'supply_branch'
        : null
  const plumbingSpecialWaterMethodBand = hasAny(['instrumentation_sampling_commissioning', 'sampling_commissioning', 'water_quality_instrumentation', 'instrumentation_sampling']) ? 'instrumentation_sampling_commissioning'
    : hasAny(['tank_pump_package', 'special_water_tank_pump', 'water_tank_pump']) ? 'tank_pump_package'
      : hasAny(['drinking_water_purification', 'direct_drinking_water', 'purified_water']) ? 'drinking_water_purification'
        : null
  const plumbingReclaimedRainwaterMethodBand = hasAny(['reuse_quality_commissioning', 'reclaimed_quality_commissioning', 'water_quality_commissioning']) ? 'quality_commissioning'
    : hasAny(['rainwater_storage_filtration', 'rainwater_reuse_filter', 'rainwater_reuse_storage_filtration', 'first_flush_filter']) ? 'rainwater_storage_filtration'
      : hasAny(['reclaimed_water_treatment', 'reclaimed_treatment', 'reuse_treatment']) ? 'reclaimed_treatment'
        : null
  const plumbingPoolBathMethodBand = hasAny(['pool_waterproof_commissioning', 'pool_commissioning', 'pool_waterproof_test', 'bath_pool_commissioning']) ? 'waterproof_commissioning'
    : hasAny(['public_bath_hot_water_dosing', 'bath_hot_water_dosing', 'bath_dosing', 'public_bath_water_system']) ? 'bath_hot_water_dosing'
      : hasAny(['pool_circulation_filtration', 'pool_filter_circulation', 'swimming_pool_filtration', 'pool_circulation']) ? 'pool_circulation_filtration'
        : null
  const plumbingWaterFeatureMethodBand = hasAny(['waterproof_lighting_commissioning', 'fountain_lighting_commissioning', 'water_feature_commissioning', 'underwater_lighting_commissioning']) ? 'waterproof_lighting_commissioning'
    : hasAny(['water_feature_pump_filtration', 'pump_filtration', 'fountain_pump_filter', 'landscape_water_filter']) ? 'pump_filtration'
      : hasAny(['fountain_nozzle_pipe', 'fountain_nozzle', 'nozzle_pipe', 'water_feature_nozzle']) ? 'fountain_nozzle_pipe'
        : null
  const plumbingWaterSupplyEquipmentMethodBand = hasAny(['renovation_pump_room', 'pump_room_renovation', 'existing_pump_room', 'pump_replacement_constrained']) ? 'renovation_pump_room'
    : hasAny(['tank_meter_standard', 'water_tank_meter', 'meter_group', 'water_tank', 'water_meter_group']) ? 'tank_meter'
      : hasAny(['pump_set', 'water_pump_set', 'domestic_pump_set', 'booster_pump_set', 'pump_group']) ? 'pump_set'
        : null
  const plumbingPipeAnticorrosionMethodBand = hasAny(['confined_derusting', 'confined_pipe_derusting', 'renovation_derusting', 'rust_removal_confined']) ? 'confined_derusting'
    : hasAny(['buried_full_coating', 'buried_pipe_coating', 'full_anticorrosion_coating', 'pipe_full_coating', 'holiday_check']) ? 'buried_full_coating'
      : hasAny(['indoor_touchup', 'visible_pipe_touchup', 'anticorrosion_touchup', 'indoor_pipe_anticorrosion']) ? 'indoor_touchup'
        : null
  const plumbingPipeInsulationMethodBand = hasAny(['condensation_control', 'anti_condensation_insulation', 'vapor_barrier_insulation', 'dense_fitting_insulation']) ? 'condensation_control'
    : hasAny(['outdoor_protection', 'outdoor_thermal_protection', 'protective_jacket', 'weatherproof_insulation']) ? 'outdoor_protection'
      : hasAny(['hot_water_standard', 'hot_water_insulation', 'indoor_hot_water_insulation', 'pipe_insulation']) ? 'hot_water_standard'
        : null
  const plumbingPipeFlushingMethodBand = hasAny(['water_quality_reflush', 'reflush', 'repeat_flushing', 'sampling_reflush']) ? 'water_quality_reflush'
    : hasAny(['main_riser_flushing', 'riser_flushing', 'main_pipe_flushing', 'sectional_flushing']) ? 'main_riser_flushing'
      : hasAny(['branch_flushing', 'branch_pipe_flushing', 'pipe_flushing', 'indoor_branch_flush']) ? 'branch_flushing'
        : null
  const plumbingWaterTestMethodBand = hasAny(['renovation_retest', 'retest_commissioning', 'leakage_rectification_retest', 'repeat_pressure_test']) ? 'renovation_retest'
    : hasAny(['main_riser_functional_test', 'main_riser_test', 'functional_test', 'water_supply_commissioning', 'system_commissioning']) ? 'main_riser_functional_test'
      : hasAny(['branch_pressure_test', 'pressure_test_branch', 'branch_pipe_pressure_test', 'water_pressure_test']) ? 'branch_pressure_test'
        : null
  const plumbingHotWaterMethodBand = hasAny(['hot_water_renovation_tie_in', 'renovation_hot_water_tie_in', 'hot_water_tie_in', 'existing_hot_water_loop']) ? 'renovation_tie_in'
    : hasAny(['hot_water_equipment_loop', 'equipment_loop', 'heater_loop', 'recirculation_loop']) ? 'equipment_loop'
      : hasAny(['hot_water_branch_pipe', 'hot_water_branch', 'branch_pipe_hot_water']) ? 'branch_pipe'
        : null
  const heatingRadiatorMethodBand = hasAny(['retrofit_radiator', 'radiator_retrofit', 'radiator_replacement', 'existing_radiator_replacement']) ? 'retrofit'
    : hasAny(['cast_iron_radiator', 'cast_iron_heating_radiator', 'heavy_radiator']) ? 'cast_iron'
      : hasAny(['steel_panel_radiator', 'panel_radiator', 'steel_radiator', 'radiator_heating']) ? 'steel_panel'
        : null
  const heatingHydronicFloorMethodBand = hasAny(['dense_pipe_spacing', 'dense_floor_heating_pipe', 'small_spacing_floor_heating', 'renovation_floor_heating']) ? 'dense_pipe_spacing'
    : hasAny(['dry_floor_heating', 'dry_floor_heating_panel', 'dry_floor_system']) ? 'dry_floor'
      : hasAny(['wet_floor_heating', 'wet_floor_system', 'hydronic_floor_heating', 'floor_heating_pipe']) ? 'wet_floor'
        : null
  const heatingElectricFloorMethodBand = hasAny(['thermostat_dense', 'dense_thermostat', 'multi_zone_thermostat', 'dense_circuit_thermostat']) ? 'thermostat_dense'
    : hasAny(['heating_cable_wet_fill', 'heating_cable', 'electric_heating_cable', 'wet_fill_layer']) ? 'heating_cable_wet_fill'
      : hasAny(['electric_heating_film', 'heating_film', 'electric_film', 'floor_heating_film']) ? 'heating_film'
        : null
  const heatingIndoorSystemMethodBand = hasAny(['renovation_heating_balancing', 'heating_renovation_balancing', 'existing_heating_tie_in', 'heating_rebalance']) ? 'renovation_balancing'
    : hasAny(['terminal_balancing', 'heating_balancing', 'radiator_floor_heating_balancing']) ? 'terminal_balancing'
      : hasAny(['indoor_heating_pipe', 'heating_pipe_network', 'heating_pipe', 'heating_riser']) ? 'pipe_network'
        : null
  const heatingGasRadiantMethodBand = hasAny(['safety_interlock_dense', 'dense_safety_interlock', 'gas_safety_interlock', 'interlock_dense']) ? 'safety_interlock_dense'
    : hasAny(['gas_radiant_heater', 'radiant_heater']) ? 'radiant_heater'
      : hasAny(['gas_radiant_tube', 'radiant_tube', 'high_bay_radiant_tube']) ? 'radiant_tube'
        : null
  const heatingSourceEquipmentMethodBand = hasAny(['industrial_heat_source_auxiliary_dense', 'industrial_auxiliary_dense', 'dense_heat_source_auxiliary']) ? 'industrial_auxiliary_dense'
    : hasAny(['heat_exchanger_station', 'heat_exchange_station', 'heating_station']) ? 'heat_exchanger_station'
      : hasAny(['boiler_room', 'boiler_equipment', 'heat_source_boiler']) ? 'boiler_room'
        : null
  const hvacSupplyAirMethodBand = hasAny(['composite_fabric_duct', 'fabric_duct', 'composite_duct', 'dense_air_outlet', 'dense_supply_terminal']) ? 'composite_fabric_dense'
    : hasAny(['ahu_balancing', 'air_handling_unit', 'ahu_installation', 'supply_air_balancing']) ? 'ahu_balancing'
      : hasAny(['galvanized_duct', 'supply_air_duct', 'duct_installation']) ? 'galvanized_duct'
        : null
  const hvacExhaustAirMethodBand = hasAny(['anti_corrosion_exhaust', 'corrosion_resistant_exhaust', 'acid_exhaust', 'chemical_exhaust']) ? 'anti_corrosion'
    : hasAny(['kitchen_hood_exhaust', 'kitchen_exhaust', 'exhaust_hood', 'hood_exhaust']) ? 'kitchen_hood'
      : hasAny(['general_exhaust', 'bathroom_exhaust', 'exhaust_duct']) ? 'general_exhaust'
        : null
  const hvacAirDistributionMethodBand = hasAny(['dense_air_terminal', 'dense_diffuser', 'dense_grille', 'terminal_density_high']) ? 'dense_terminal'
    : hasAny(['air_terminal_balancing', 'diffuser_balancing', 'air_outlet_balancing']) ? 'terminal_balancing'
      : hasAny(['duct_main', 'main_duct', 'air_distribution_duct']) ? 'duct_main'
        : null
  const hvacSmokeControlMethodBand = hasAny(['fire_damper_fan_linkage', 'fire_damper_linkage', 'smoke_fan_linkage', 'fire_smoke_linkage']) ? 'fire_damper_fan_linkage'
    : hasAny(['positive_pressure_linkage', 'positive_pressure_smoke_control', 'pressurized_stairwell', 'positive_pressure_fan']) ? 'positive_pressure_linkage'
      : hasAny(['smoke_exhaust_duct', 'smoke_control_duct', 'smoke_exhaust_fan', 'smoke_exhaust']) ? 'smoke_exhaust_duct'
        : null
  const hvacDustExhaustMethodBand = hasAny(['explosion_proof_dust', 'explosion_proof_dust_exhaust', 'combustible_dust_exhaust', 'spark_proof_dust']) ? 'explosion_proof_dust'
    : hasAny(['bag_filter_collector', 'baghouse_collector', 'dust_collector', 'filter_collector']) ? 'bag_filter_collector'
      : hasAny(['general_dust', 'general_dust_exhaust', 'dust_exhaust_duct', 'workshop_dust_exhaust']) ? 'general_dust'
        : null
  const hvacVacuumCleaningMethodBand = hasAny(['plant_filter_fan', 'vacuum_plant_filter', 'vacuum_fan_filter', 'central_vacuum_plant']) ? 'plant_filter_fan'
    : hasAny(['dense_vacuum_inlet', 'dense_inlet_terminal', 'vacuum_inlet_dense', 'quick_inlet_dense']) ? 'dense_inlet_terminal'
      : hasAny(['vacuum_pipe_network', 'central_vacuum_pipe', 'vacuum_pipe', 'vacuum_branch_pipe']) ? 'pipe_network'
        : null
  const hvacComfortAirMethodBand = hasAny(['dense_comfort_terminal', 'dense_fan_coil', 'dense_comfort_outlet', 'comfort_terminal_density_high']) ? 'dense_terminal'
    : hasAny(['comfort_ahu_terminal_balancing', 'ahu_terminal_balancing', 'comfort_air_balancing', 'ahu_air_terminal']) ? 'ahu_terminal_balancing'
      : hasAny(['fan_coil_terminal', 'fan_coil_unit', 'fcu_terminal', 'comfort_terminal']) ? 'fan_coil_terminal'
        : null
  const hvacVrfMethodBand = hasAny(['multi_outdoor_unit_commissioning', 'multi_outdoor_commissioning', 'vrf_commissioning', 'vrf_addressing_commissioning']) ? 'multi_outdoor_commissioning'
    : hasAny(['refrigerant_pipe_pressure', 'vrf_refrigerant_pipe', 'copper_pipe_pressure_test', 'refrigerant_pressure_hold']) ? 'refrigerant_pipe_pressure'
      : hasAny(['vrf_indoor_unit', 'vrf_indoor', 'multi_split_indoor_unit', 'indoor_unit']) ? 'indoor_unit'
        : null
  const hvacConstantHumidityMethodBand = hasAny(['strict_temp_humidity_commissioning', 'strict_commissioning', 'temperature_humidity_stability_test', 'precision_humidity_commissioning']) ? 'strict_commissioning'
    : hasAny(['humidification_dehumidification_loop', 'humidification_loop', 'dehumidification_loop', 'humidity_control_loop']) ? 'humidification_loop'
      : hasAny(['precision_ac_equipment', 'precision_air_conditioner', 'constant_humidity_ac', 'constant_temp_humidity_equipment']) ? 'precision_ac_equipment'
        : null
  const hvacCleanroomMethodBand = hasAny(['strict_cleanliness_validation', 'cleanliness_validation_strict', 'particle_count_validation', 'cleanroom_strict_validation']) ? 'strict_cleanliness_validation'
    : hasAny(['cleanroom_air_balance_validation', 'air_balance_validation', 'cleanroom_air_balancing', 'pressure_cascade_validation']) ? 'air_balance_validation'
      : hasAny(['terminal_hepa', 'hepa_terminal', 'hepa_filter_terminal', 'cleanroom_hepa_terminal']) ? 'terminal_hepa'
        : null
  const hvacCivilDefenseMethodBand = hasAny(['wartime_conversion_linkage', 'wartime_conversion', 'civil_defense_linkage', 'defense_mode_switching']) ? 'wartime_conversion_linkage'
    : hasAny(['air_tightness_test', 'airtightness_test', 'civil_defense_pressure_hold', 'sealed_pressure_test']) ? 'air_tightness_test'
      : hasAny(['blast_valve_filter', 'blast_valve', 'civil_defense_filter', 'poison_filter']) ? 'blast_valve_filter'
        : null
  const hvacWaterEquipmentMethodBand = hasAny(['source_equipment_pressure_commissioning', 'source_equipment_commissioning', 'pressure_commissioning', 'heat_source_commissioning']) ? 'source_equipment_commissioning'
    : hasAny(['chilled_hot_water_equipment', 'chilled_water_equipment', 'hot_water_equipment', 'water_side_equipment']) ? 'chilled_hot_water_equipment'
      : hasAny(['pump_valve_skid', 'pump_skid', 'valve_group_skid', 'water_pump_valve']) ? 'pump_valve_skid'
        : null
  const hvacCondensateMethodBand = hasAny(['condensate_flushing_functional_test', 'condensate_flushing', 'condensate_functional_test', 'drainage_functional_test']) ? 'flushing_functional_test'
    : hasAny(['condensate_pump_lift', 'condensate_pump', 'lift_condensate_pump', 'drain_pump']) ? 'condensate_pump'
      : hasAny(['gravity_condensate_drain', 'gravity_drain', 'condensate_gravity_drain', 'condensate_drain_pipe']) ? 'gravity_drain'
        : null
  const hvacCoolingWaterMethodBand = hasAny(['pump_header_commissioning', 'cooling_pump_header_commissioning', 'pump_header_pressure_commissioning', 'cooling_water_commissioning']) ? 'pump_header_commissioning'
    : hasAny(['water_treatment_balancing', 'cooling_water_treatment', 'cooling_water_balancing', 'water_quality_balancing']) ? 'water_treatment_balancing'
      : hasAny(['cooling_tower', 'cooling_tower_installation', 'open_cooling_tower']) ? 'cooling_tower'
        : null
  const hvacGroundSourceMethodBand = hasAny(['manifold_pressure_commissioning', 'ground_source_manifold_commissioning', 'loop_pressure_commissioning', 'ground_loop_balancing']) ? 'manifold_pressure_commissioning'
    : hasAny(['horizontal_buried_loop', 'horizontal_ground_loop', 'buried_loop_open', 'horizontal_loop']) ? 'horizontal_buried_loop'
      : hasAny(['vertical_borehole_loop', 'borehole_loop', 'vertical_ground_loop', 'ground_source_borehole']) ? 'vertical_borehole_loop'
        : null
  const hvacWaterSourceMethodBand = hasAny(['descaling_water_quality_commissioning', 'descaling_commissioning', 'water_quality_commissioning', 'anti_scaling_commissioning']) ? 'descaling_commissioning'
    : hasAny(['well_intake_reinjection', 'well_reinjection', 'deep_well_intake', 'water_source_well_loop']) ? 'well_intake_reinjection'
      : hasAny(['surface_water_intake', 'surface_water_reinjection', 'river_lake_intake', 'intake_reinjection_pipe']) ? 'surface_water_intake'
        : null
  const hvacHeatPumpExchangeMethodBand = hasAny(['hybrid_manifold_commissioning', 'hybrid_loop_commissioning', 'heat_pump_manifold_commissioning', 'source_side_manifold_commissioning']) ? 'hybrid_manifold_commissioning'
    : hasAny(['water_loop_exchange', 'water_source_exchange', 'water_source_loop', 'surface_water_loop']) ? 'water_loop_exchange'
      : hasAny(['ground_loop_exchange', 'ground_source_exchange', 'borehole_exchange', 'ground_heat_exchange']) ? 'ground_loop_exchange'
        : null
  const hvacThermalStorageMethodBand = hasAny(['storage_charge_discharge_commissioning', 'charge_discharge_commissioning', 'thermal_storage_commissioning', 'storage_mode_commissioning']) ? 'charge_discharge_commissioning'
    : hasAny(['ice_storage_equipment', 'ice_storage_tank', 'ice_storage_chiller', 'ice_storage_system']) ? 'ice_storage_equipment'
      : hasAny(['water_storage_tank', 'chilled_water_storage_tank', 'thermal_storage_tank', 'water_thermal_storage']) ? 'water_storage_tank'
        : null
  const hvacSolarMethodBand = hasAny(['solar_low_temp_loop_commissioning', 'low_temp_loop_commissioning', 'solar_loop_commissioning', 'solar_system_commissioning']) ? 'low_temp_loop_commissioning'
    : hasAny(['solar_storage_auxiliary_heat', 'storage_auxiliary_heat', 'solar_storage_tank_auxiliary', 'auxiliary_heat_source']) ? 'storage_auxiliary_heat'
      : hasAny(['solar_collector_field', 'collector_field', 'solar_collector_array', 'solar_collector_installation']) ? 'collector_field'
        : null
  const hvacStorageSolarMethodBand = hasAny(['hybrid_storage_solar_commissioning', 'hybrid_solar_storage_commissioning', 'storage_solar_commissioning', 'hybrid_commissioning']) ? 'hybrid_commissioning'
    : hasAny(['storage_tank_heat_exchange', 'storage_heat_exchange', 'solar_heat_exchange', 'storage_heat_exchanger']) ? 'storage_heat_exchange'
      : hasAny(['thermal_storage_collector', 'collector_storage_loop', 'solar_storage_collector_loop', 'collector_storage']) ? 'collector_storage_loop'
        : null
  const hvacAutomationMethodBand = hasAny(['software_point_testing_commissioning', 'software_point_commissioning', 'point_testing_commissioning', 'control_software_commissioning']) ? 'software_point_commissioning'
    : hasAny(['smoke_control_linkage', 'fire_smoke_control_linkage', 'smoke_control_function', 'smoke_linkage_test']) ? 'smoke_control_linkage'
      : hasAny(['sensor_actuator_point', 'sensor_actuator_points', 'hvac_control_point', 'actuator_sensor']) ? 'sensor_actuator_points'
        : null
  const hvacCompressionChillerMethodBand = hasAny(['compression_chiller_commissioning', 'chiller_commissioning', 'compressor_chiller_commissioning', 'refrigeration_commissioning']) ? 'chiller_commissioning'
    : hasAny(['refrigerant_pressure_test', 'refrigerant_pressure_hold', 'chiller_pressure_test', 'refrigerant_pipe_pressure']) ? 'refrigerant_pressure_test'
      : hasAny(['compression_chiller_hoisting', 'chiller_hoisting', 'compression_chiller_setting', 'chiller_equipment_hoisting']) ? 'chiller_hoisting'
        : null
  const hvacAbsorptionRefrigerationMethodBand = hasAny(['steam_fuel_interface_commissioning', 'steam_interface_commissioning', 'fuel_interface_commissioning', 'absorption_commissioning']) ? 'steam_fuel_interface_commissioning'
    : hasAny(['vacuum_lithium_bromide_charging', 'lithium_bromide_charging', 'vacuum_test_charging', 'absorption_vacuum_test']) ? 'vacuum_lithium_bromide_charging'
      : hasAny(['absorption_unit_hoisting', 'absorption_chiller_hoisting', 'absorption_unit_setting', 'lithium_bromide_unit_hoisting']) ? 'absorption_unit_hoisting'
        : null
  const hvacChillerAbsorptionMethodBand = hasAny(['hybrid_chiller_commissioning', 'compression_absorption_commissioning', 'dual_chiller_commissioning', 'hybrid_refrigeration_commissioning']) ? 'hybrid_chiller_commissioning'
    : hasAny(['absorption_chiller_branch', 'absorption_refrigeration_branch', 'lithium_bromide_chiller_branch', 'absorption_branch']) ? 'absorption_chiller_branch'
      : hasAny(['compression_chiller_branch', 'compression_refrigeration_branch', 'compressor_chiller_branch', 'compression_branch']) ? 'compression_chiller_branch'
        : null
  const electricalOutdoorDistributionMethodBand = hasAny(['outdoor_grounding_energization', 'grounding_energization', 'outdoor_energization_test', 'outdoor_grounding_test']) ? 'grounding_energization'
    : hasAny(['outdoor_transformer_cabinet', 'transformer_cabinet', 'outdoor_distribution_cabinet', 'outdoor_switchgear']) ? 'transformer_cabinet'
      : hasAny(['outdoor_cable_lighting', 'outdoor_cable', 'site_lighting_cable', 'outdoor_lighting_distribution']) ? 'outdoor_cable_lighting'
        : null
  const electricalPowerRoomMethodBand = hasAny(['power_room_integrated_commissioning', 'distribution_room_commissioning', 'integrated_power_commissioning', 'power_distribution_room_testing']) ? 'integrated_commissioning'
    : hasAny(['ups_emergency_power', 'standby_power_ups', 'emergency_power', 'ups_power_room']) ? 'ups_emergency_power'
      : hasAny(['distribution_room', 'power_distribution_room', 'switchgear_room', 'transformer_distribution_room']) ? 'distribution_room'
        : null
  const electricalFeederMethodBand = hasAny(['feeder_termination_insulation_test', 'termination_insulation_test', 'cable_termination_test', 'feeder_insulation_test']) ? 'termination_insulation_test'
    : hasAny(['busway_tray', 'busway', 'cable_tray', 'feeder_busway']) ? 'busway_tray'
      : hasAny(['cable_feeder', 'feeder_cable', 'power_feeder_cable', 'main_feeder_cable']) ? 'cable_feeder'
        : null
  const electricalDistributionEquipmentMethodBand = hasAny(['circuit_test_debugging', 'circuit_debugging', 'loop_test_debugging', 'power_circuit_test']) ? 'circuit_test_debugging'
    : hasAny(['motor_control_wiring', 'motor_wiring', 'mcc_wiring', 'motor_control_center']) ? 'motor_control_wiring'
      : hasAny(['power_cabinet', 'distribution_cabinet', 'power_distribution_cabinet', 'power_box']) ? 'power_cabinet'
        : null
  const electricalLightingTerminalMethodBand = hasAny(['lighting_control_debugging', 'lighting_debugging', 'lighting_control_test', 'lighting_scene_debugging']) ? 'control_debugging'
    : hasAny(['switch_socket', 'switches_sockets', 'socket_switch', 'wiring_device']) ? 'switch_socket'
      : hasAny(['lighting_fixture', 'light_fixture', 'luminaire', 'lighting_terminal']) ? 'lighting_fixture'
        : null
  const electricalStandbyPowerMethodBand = hasAny(['standby_power_load_test', 'load_test_commissioning', 'generator_load_test', 'ups_load_test']) ? 'load_test_commissioning'
    : hasAny(['ups_battery', 'battery_ups', 'battery_string', 'ups_installation']) ? 'ups_battery'
      : hasAny(['diesel_generator', 'generator_set', 'standby_generator', 'emergency_generator']) ? 'diesel_generator'
        : null
  const electricalGroundingLightningMethodBand = hasAny(['ground_resistance_test', 'grounding_resistance_test', 'earth_resistance_test', 'grounding_test']) ? 'ground_resistance_test'
    : hasAny(['lightning_down_conductor', 'down_conductor', 'lightning_conductor', 'air_termination_downlead']) ? 'lightning_down_conductor'
      : hasAny(['grounding_grid', 'earthing_grid', 'ground_grid', 'grounding_network']) ? 'grounding_grid'
        : null
  const elevatorInstallationMethodBand = hasAny(['hydraulic_elevator', 'hydraulic_heavy_load', 'heavy_load_elevator', 'freight_elevator_heavy_load']) ? 'hydraulic_heavy_load'
    : hasAny(['machine_roomless_elevator', 'machine_roomless', 'mrl_elevator']) ? 'machine_roomless'
      : hasAny(['traction_elevator', 'passenger_elevator', 'standard_traction', 'elevator_traction_installation']) ? 'traction'
        : null
  const elevatorTractionInstallationMethodBand = hasAny(['high_speed_group_control', 'high_speed_elevator', 'group_control_elevator', 'destination_control_elevator']) ? 'high_speed_group_control'
    : hasAny(['machine_roomless_traction', 'machine_roomless_elevator', 'mrl_traction', 'mrl_elevator']) ? 'machine_roomless'
      : hasAny(['passenger_elevator', 'standard_traction', 'traction_elevator', 'traction_passenger']) ? 'passenger_standard'
        : null
  const elevatorMachineDriveMethodBand = hasAny(['gearless_machine_drive', 'gearless_machine', 'high_speed_drive', 'gearless_high_speed']) ? 'gearless_high_speed_drive'
    : hasAny(['machine_roomless_drive', 'mrl_drive', 'machine_roomless_machine']) ? 'machine_roomless_drive'
      : hasAny(['machine_room_drive', 'traction_machine', 'drive_machine', 'control_cabinet_drive']) ? 'machine_room_drive'
        : null
  const elevatorGuideRailMethodBand = hasAny(['high_speed_guide_rail_alignment', 'high_speed_alignment', 'guide_rail_precision_alignment']) ? 'high_speed_alignment'
    : hasAny(['high_rise_multi_section_rail', 'multi_section_guide_rail', 'long_guide_rail', 'high_rise_guide_rail']) ? 'high_rise_multi_section'
      : hasAny(['standard_guide_rail', 'guide_rail', 'rail_bracket', 'template_frame']) ? 'standard_rail'
        : null
  const elevatorDoorSystemMethodBand = hasAny(['multi_opening_door_adjustment', 'multi_opening_door', 'dense_landing_door_adjustment']) ? 'multi_opening_adjustment'
    : hasAny(['car_door_operator', 'door_operator', 'car_door_machine']) ? 'car_door_operator'
      : hasAny(['landing_door', 'hall_door', 'elevator_door_system']) ? 'landing_door'
        : null
  const elevatorCarAssemblyMethodBand = hasAny(['high_speed_decorated_car', 'decorated_car', 'high_speed_car_assembly']) ? 'high_speed_decorated_car'
    : hasAny(['hospital_large_car', 'bed_elevator_car', 'large_car_assembly']) ? 'hospital_large_car'
      : hasAny(['standard_car', 'car_assembly', 'elevator_car']) ? 'standard_car'
        : null
  const elevatorCounterweightMethodBand = hasAny(['high_speed_counterweight_clearance', 'counterweight_clearance', 'high_speed_clearance']) ? 'high_speed_clearance'
    : hasAny(['heavy_load_counterweight', 'freight_counterweight', 'large_counterweight']) ? 'heavy_load_counterweight'
      : hasAny(['standard_counterweight', 'counterweight', 'counterweight_block', 'counterweight_frame']) ? 'standard_counterweight'
        : null
  const elevatorSafetyComponentMethodBand = hasAny(['high_speed_strict_safety_test', 'strict_safety_test', 'overspeed_safety_test']) ? 'high_speed_strict_test'
    : hasAny(['safety_linkage_test', 'linkage_test', 'governor_safety_gear_linkage']) ? 'linkage_test'
      : hasAny(['standard_safety_components', 'safety_components', 'governor', 'safety_gear', 'buffer_limit_switch']) ? 'standard_safety'
        : null
  const elevatorSuspensionRopeMethodBand = hasAny(['high_speed_tension_balancing', 'precision_tension_balancing', 'rope_tension_balancing']) ? 'high_speed_tension_balancing'
    : hasAny(['long_travel_multi_rope', 'long_travel_rope', 'multi_rope', 'high_rise_suspension_rope']) ? 'long_travel_multi_rope'
      : hasAny(['standard_suspension_rope', 'suspension_rope', 'traction_rope', 'rope_socket']) ? 'standard_rope'
        : null
  const elevatorTravelingCableMethodBand = hasAny(['shielded_safety_loop_cable', 'shielded_cable', 'safety_loop_cable']) ? 'shielded_safety_loop'
    : hasAny(['long_travel_traveling_cable', 'long_travel_cable', 'high_rise_traveling_cable']) ? 'long_travel_cable'
      : hasAny(['standard_traveling_cable', 'traveling_cable', 'shaft_cable', 'cable_support']) ? 'standard_cable'
        : null
  const elevatorCompensationDeviceMethodBand = hasAny(['anti_sway_tensioning', 'anti_sway_compensation', 'compensation_tensioning']) ? 'anti_sway_tensioning'
    : hasAny(['long_travel_compensation_rope', 'compensation_rope_long_travel', 'compensation_rope']) ? 'compensation_rope_long_travel'
      : hasAny(['standard_compensation_chain', 'compensation_chain', 'compensation_device']) ? 'standard_chain'
        : null
  const elevatorElectricalDeviceMethodBand = hasAny(['destination_control_high_speed', 'destination_control', 'high_speed_controller']) ? 'destination_control_high_speed'
    : hasAny(['controller_safety_loop', 'safety_loop_commissioning', 'control_cabinet_safety_loop']) ? 'controller_safety_loop'
      : hasAny(['shaft_wiring', 'shaft_trunking', 'elevator_electrical_device', 'control_wiring']) ? 'shaft_wiring'
        : null
  const elevatorHydraulicGuideRailMethodBand = hasAny(['renovation_hydraulic_rail_alignment', 'renovation_rail_alignment', 'hydraulic_rail_rework']) ? 'renovation_alignment'
    : hasAny(['high_travel_hydraulic_rail', 'high_travel_rail', 'high_rise_hydraulic_rail']) ? 'high_travel_rail'
      : hasAny(['standard_hydraulic_rail', 'hydraulic_guide_rail', 'cylinder_guide_rail']) ? 'standard_rail'
        : null
  const elevatorHydraulicDoorSystemMethodBand = hasAny(['heavy_load_forced_closing', 'heavy_load_hydraulic_door', 'forced_closing_door']) ? 'heavy_load_forced_closing'
    : hasAny(['many_landings_hydraulic_door', 'many_landings', 'multi_landing_door']) ? 'many_landings'
      : hasAny(['standard_hydraulic_landing_door', 'hydraulic_landing_door', 'landing_door_hydraulic']) ? 'standard_landing_door'
        : null
  const elevatorHydraulicCarAssemblyMethodBand = hasAny(['hospital_heavy_load_car', 'hospital_bed_hydraulic_car', 'heavy_load_hydraulic_car']) ? 'hospital_heavy_load_car'
    : hasAny(['roped_hydraulic_car', 'roped_hydraulic', 'hydraulic_rope_car']) ? 'roped_hydraulic_car'
      : hasAny(['standard_plunger_car', 'direct_plunger_car', 'hydraulic_car_assembly']) ? 'standard_plunger_car'
        : null
  const elevatorHydraulicBalanceWeightMethodBand = hasAny(['heavy_load_balance_weight', 'heavy_load_balance', 'heavy_balance_weight']) ? 'heavy_load_balance'
    : hasAny(['roped_hydraulic_balance_weight', 'roped_balance_weight', 'roped_balance']) ? 'roped_balance'
      : hasAny(['standard_hydraulic_balance_weight', 'standard_balance_weight', 'hydraulic_balance_weight']) ? 'standard_balance'
        : null
  const elevatorHydraulicSafetyMethodBand = hasAny(['heavy_load_strict_safety_test', 'strict_hydraulic_safety_test', 'heavy_load_safety_linkage']) ? 'heavy_load_strict_test'
    : hasAny(['roped_rupture_valve_linkage', 'rupture_valve_linkage', 'roped_safety_linkage']) ? 'roped_rupture_valve_linkage'
      : hasAny(['standard_hydraulic_safety_components', 'hydraulic_safety_components', 'rupture_valve_buffer']) ? 'standard_safety'
        : null
  const elevatorHydraulicSuspensionMethodBand = hasAny(['anti_sway_suspension_tensioning', 'anti_sway_tensioning', 'suspension_tensioning']) ? 'anti_sway_tensioning'
    : hasAny(['roped_hydraulic_suspension_long_travel', 'roped_long_travel_suspension', 'hydraulic_long_travel_rope']) ? 'roped_long_travel'
      : hasAny(['standard_hydraulic_suspension_chain', 'standard_suspension_chain', 'hydraulic_suspension_chain']) ? 'standard_chain'
        : null
  const elevatorHydraulicTravelingCableMethodBand = hasAny(['machine_roomless_safety_loop_cable', 'mrl_safety_loop_cable', 'hydraulic_safety_loop_cable']) ? 'mrl_safety_loop_cable'
    : hasAny(['roped_long_travel_hydraulic_cable', 'roped_long_travel_cable', 'hydraulic_long_travel_cable']) ? 'roped_long_travel_cable'
      : hasAny(['standard_hydraulic_traveling_cable', 'hydraulic_traveling_cable', 'hydraulic_cable_support']) ? 'standard_cable'
        : null
  const elevatorHydraulicElectricalMethodBand = hasAny(['destination_control_hydraulic_safety_loop', 'destination_control_safety_loop', 'hydraulic_destination_control']) ? 'destination_control_safety_loop'
    : hasAny(['machine_roomless_hydraulic_controller', 'mrl_hydraulic_controller', 'machine_roomless_controller']) ? 'machine_roomless_controller'
      : hasAny(['standard_hydraulic_control_wiring', 'hydraulic_control_wiring', 'hydraulic_electrical_device']) ? 'standard_control_wiring'
        : null
  const elevatorHydraulicInstallationMethodBand = hasAny(['renovation_heavy_load_hydraulic', 'renovation_hydraulic_heavy_load', 'heavy_load_hydraulic_renovation']) ? 'renovation_heavy_load'
    : hasAny(['roped_hydraulic_multi_stop', 'roped_multi_stop', 'multi_stop_hydraulic']) ? 'roped_multi_stop'
      : hasAny(['direct_plunger_hydraulic_3_stop', 'direct_plunger_hydraulic', 'hydraulic_3_stop']) ? 'direct_plunger_3_stop'
        : null
  const escalatorMovingWalkMethodBand = hasAny(['long_span_moving_walk', 'moving_walk_long_span', 'moving_walk_constrained']) ? 'long_span_moving_walk'
    : hasAny(['public_transport_heavy_duty_escalator', 'heavy_duty_escalator', 'transit_escalator']) ? 'public_transport_heavy_duty'
      : hasAny(['standard_indoor_escalator', 'indoor_escalator', 'standard_escalator', 'escalator_installation']) ? 'standard_indoor_escalator'
        : null
  const intelligentIntegrationMethodBand = hasAny(['data_center_integration', 'idc_integration', 'data_center_platform_integration']) ? 'data_center_integration'
    : hasAny(['multi_subsystem_platform', 'multi_subsystem_integration', 'ibms_platform_integration']) ? 'multi_subsystem_platform'
      : hasAny(['standard_integration', 'intelligent_integration_network', 'system_integration']) ? 'standard_integration'
        : null
  const intelligentNetworkMethodBand = hasAny(['data_center_core_network', 'idc_core_network', 'core_network_redundant']) ? 'data_center_core'
    : hasAny(['dense_wireless_ap', 'wireless_ap_dense', 'wifi_dense_ap', 'ap_roaming_tuning']) ? 'dense_wireless_ap'
      : hasAny(['standard_lan', 'lan_network', 'information_network', 'standard_network_system']) ? 'standard_lan'
        : null
  const intelligentStructuredCablingMethodBand = hasAny(['data_center_high_density_cabling', 'high_density_cabling', 'data_center_cabling_dense']) ? 'data_center_high_density'
    : hasAny(['fiber_backbone_rack_cabling', 'fiber_backbone', 'rack_cabling', 'optical_backbone']) ? 'fiber_backbone_rack'
      : hasAny(['standard_structured_cabling', 'standard_cabling', 'structured_cabling']) ? 'standard_cabling'
        : null
  const intelligentApplicationMethodBand = hasAny(['multi_platform_integration_application', 'multi_platform_integration', 'cross_platform_application']) ? 'multi_platform_integration'
    : hasAny(['workflow_interface_application', 'workflow_interface', 'interface_application']) ? 'workflow_interface'
      : hasAny(['standard_information_application', 'standard_application', 'information_application']) ? 'standard_application'
        : null
  const intelligentAccessMethodBand = hasAny(['multi_carrier_access', 'multi_carrier_constrained', 'carrier_multi_access']) ? 'multi_carrier_constrained'
    : hasAny(['access_room_readiness_handover', 'access_room_handover', 'carrier_room_handover']) ? 'access_room_handover'
      : hasAny(['standard_carrier_access', 'carrier_access', 'information_access']) ? 'standard_carrier_access'
        : null
  const intelligentMobileSignalMethodBand = hasAny(['dense_basement_signal_coverage', 'basement_signal_dense', 'basement_coverage_dense', 'dense_basement_coverage']) ? 'dense_basement_coverage'
    : hasAny(['public_area_carrier_coverage', 'public_area_coverage', 'carrier_public_area', 'public_area_carrier']) ? 'public_area_carrier'
      : hasAny(['standard_indoor_das_coverage', 'indoor_das', 'distributed_antenna', 'mobile_signal_coverage']) ? 'standard_indoor_das'
        : null
  const intelligentSatelliteMethodBand = hasAny(['strict_grounding_satellite_commissioning', 'strict_grounding_test', 'satellite_grounding_commissioning']) ? 'strict_grounding_commissioning'
    : hasAny(['multi_receiver_satellite_system', 'multi_receiver_system', 'multi_receiver_satellite']) ? 'multi_receiver_system'
      : hasAny(['roof_satellite_antenna_alignment', 'roof_satellite_antenna', 'satellite_antenna_alignment']) ? 'roof_antenna_alignment'
        : null
  const intelligentTelecomAccessMethodBand = hasAny(['mobile_satellite_interface', 'satellite_mobile_interface', 'mobile_satellite_access']) ? 'mobile_satellite_interface'
    : hasAny(['mobile_signal_access_coverage', 'mobile_signal_access', 'mobile_coverage_access']) ? 'mobile_signal_access'
      : hasAny(['carrier_access_only_coverage', 'carrier_access_only', 'telecom_carrier_access']) ? 'carrier_access_only'
        : null
  const intelligentTelephoneExchangeMethodBand = hasAny(['operator_console_redundant', 'hospital_operator_exchange', 'redundant_operator_console', 'emergency_call_console']) ? 'operator_console_redundant'
    : hasAny(['ip_pbx_gateway', 'pbx_gateway', 'sip_gateway', 'voice_gateway']) ? 'ip_pbx_gateway'
      : hasAny(['standard_voice_exchange', 'telephone_exchange', 'voice_exchange']) ? 'standard_voice_exchange'
        : null
  const intelligentCommunicationMediaMethodBand = hasAny(['multi_source_media_headend', 'multi_source_headend', 'media_headend', 'source_switching_headend']) ? 'multi_source_headend'
    : hasAny(['satellite_tv_receiver_distribution', 'satellite_tv_distribution', 'satellite_tv_receiver']) ? 'satellite_tv_distribution'
      : hasAny(['standard_cable_tv_distribution', 'standard_cable_tv', 'cable_tv_distribution', 'cable_television']) ? 'standard_cable_tv'
        : null
  const intelligentPublicBroadcastMethodBand = hasAny(['emergency_linkage_broadcast', 'emergency_broadcast_linkage', 'fire_alarm_broadcast_linkage', 'evacuation_broadcast']) ? 'emergency_linkage'
    : hasAny(['zoned_public_broadcast', 'zoned_broadcast', 'zone_paging', 'multi_zone_broadcast']) ? 'zoned_broadcast'
      : hasAny(['standard_public_broadcast_loop', 'standard_broadcast_loop', 'public_broadcast_loop']) ? 'standard_loop'
        : null
  const intelligentConferenceMethodBand = hasAny(['multi_room_central_control', 'multi_room_control', 'central_control_conference', 'multi_room_av']) ? 'multi_room_control'
    : hasAny(['video_conference_matrix', 'video_matrix', 'conference_matrix', 'codec_matrix']) ? 'video_matrix'
      : hasAny(['standard_meeting_room_av', 'standard_meeting_room', 'meeting_room_av', 'conference_system']) ? 'standard_meeting_room'
        : null
  const intelligentDisplayMethodBand = hasAny(['large_screen_splicing_display', 'large_screen_splicing', 'display_splicing', 'video_wall_splicing']) ? 'large_screen_splicing'
    : hasAny(['media_server_publishing', 'publishing_server', 'content_publishing_system', 'media_server']) ? 'media_server_publishing'
      : hasAny(['standard_guidance_display', 'standard_guidance', 'information_guidance_display', 'wayfinding_display']) ? 'standard_guidance'
        : null
  const intelligentClockMethodBand = hasAny(['multi_zone_time_sync', 'multi_zone_sync', 'multi_zone_time_acceptance', 'time_sync_acceptance']) ? 'multi_zone_sync'
    : hasAny(['ntp_network_time', 'network_time_system', 'ntp_time_source', 'network_clock']) ? 'ntp_network_time'
      : hasAny(['standard_master_slave_clock', 'master_slave_clock', 'clock_system']) ? 'master_slave_clock'
        : null
  const intelligentBaControlMethodBand = hasAny(['integrated_ba_commissioning', 'ba_integrated_commissioning', 'ba_system_commissioning', 'building_automation_integration']) ? 'integrated_ba_commissioning'
    : hasAny(['ddc_controller_strategy', 'ddc_strategy', 'ba_ddc_controller', 'controller_strategy']) ? 'ddc_controller_strategy'
      : hasAny(['sensor_actuator_points', 'ba_sensor_actuator', 'ba_point_installation', 'ba_control_points', 'ba_control']) ? 'sensor_actuator_points'
        : null
  const intelligentFireAlarmMethodBand = hasAny(['fire_linkage_commissioning', 'fire_alarm_linkage', 'linkage_commissioning', 'fire_control_linkage']) ? 'fire_linkage_commissioning'
    : hasAny(['alarm_controller_matrix', 'fire_alarm_matrix', 'controller_matrix', 'alarm_host_matrix']) ? 'alarm_controller_matrix'
      : hasAny(['detector_loop', 'fire_detector_loop', 'fire_alarm_detector', 'smoke_detector_loop', 'fire_alarm']) ? 'detector_loop'
        : null
  const intelligentSecurityTechnicalMethodBand = hasAny(['integrated_security_platform', 'security_platform_integration', 'integrated_security_system', 'security_platform']) ? 'integrated_security_platform'
    : hasAny(['access_control_intrusion', 'access_control_intrusion_system', 'door_access_intrusion', 'intrusion_alarm_access']) ? 'access_control_intrusion'
      : hasAny(['video_surveillance_points', 'video_surveillance_point', 'camera_points', 'cctv_camera_points', 'security_camera']) ? 'video_surveillance_points'
        : null
  const intelligentLightningGroundingMethodBand = hasAny(['strict_grounding_acceptance', 'strict_grounding_test', 'grounding_acceptance_retest', 'strict_ground_resistance_acceptance']) ? 'strict_grounding_acceptance'
    : hasAny(['spd_shielding_interface', 'surge_protection_device', 'spd_interface', 'shielding_interface', 'screen_bonding']) ? 'spd_shielding_interface'
      : hasAny(['equipotential_bonding', 'intelligent_equipotential', 'cabinet_bonding', 'weak_current_bonding']) ? 'equipotential_bonding'
        : null
  const intelligentEmergencyResponseMethodBand = hasAny(['command_platform_trial', 'command_platform_trial_operation', 'emergency_command_platform', 'emergency_drill_trial']) ? 'command_platform_trial'
    : hasAny(['software_interface_emergency_response', 'emergency_software_interface', 'emergency_interface_mapping', 'software_interface']) ? 'software_interface'
      : hasAny(['emergency_terminal_points', 'emergency_terminal_point', 'emergency_endpoint', 'emergency_response_terminal']) ? 'emergency_terminal_points'
        : null
  const intelligentSecurityEmergencyMethodBand = hasAny(['integrated_security_emergency_platform', 'security_emergency_platform', 'integrated_emergency_security', 'security_emergency_command_platform']) ? 'integrated_security_emergency_platform'
    : hasAny(['security_event_linkage', 'security_alarm_linkage', 'security_emergency_linkage', 'event_linkage_security']) ? 'security_event_linkage'
      : hasAny(['emergency_security_terminal', 'security_emergency_terminal', 'emergency_button_intercom', 'security_emergency_endpoint']) ? 'emergency_security_terminal'
        : null
  const intelligentDataCenterRoomMethodBand = hasAny(['full_load_integrated_commissioning', 'data_center_full_load_test', 'load_bank_integrated_test', 'data_center_failover_drill']) ? 'full_load_integrated_commissioning'
    : hasAny(['mep_integration_interface', 'data_center_mep_integration', 'power_cooling_cabling_interface', 'data_center_system_interface']) ? 'mep_integration_interface'
      : hasAny(['room_fitout_infrastructure', 'data_center_room_fitout', 'data_center_infrastructure_ready', 'machine_room_infrastructure']) ? 'room_fitout_infrastructure'
        : null
  const intelligentDataCenterPowerMethodBand = hasAny(['load_test_redundancy_commissioning', 'data_center_load_test', 'load_bank_test', 'redundancy_commissioning', 'ups_failover_test']) ? 'load_test_redundancy_commissioning'
    : hasAny(['pdu_sts_interface', 'pdu_sts', 'sts_interface', 'pdu_interface', 'static_transfer_switch_interface']) ? 'pdu_sts_interface'
      : hasAny(['ups_power_distribution', 'data_center_ups_distribution', 'ups_distribution', 'data_center_power_distribution']) ? 'ups_power_distribution'
        : null
  const intelligentDataCenterGroundingMethodBand = hasAny(['strict_ground_resistance_acceptance', 'strict_resistance_test', 'ground_resistance_acceptance', 'grounding_acceptance_retest']) ? 'strict_ground_resistance_acceptance'
    : hasAny(['raised_floor_grounding_grid_test', 'raised_floor_grounding', 'grounding_grid_resistance_test', 'cabinet_bonding_grid']) ? 'raised_floor_grounding_grid_test'
      : hasAny(['equipotential_bonding', 'data_center_equipotential', 'cabinet_equipotential', 'bonding_bar']) ? 'equipotential_bonding'
        : null
  const intelligentDataCenterPrecisionAirMethodBand = hasAny(['thermal_stabilization_integrated_commissioning', 'thermal_stabilization', 'precision_air_integrated_commissioning', 'hot_cold_aisle_thermal_test']) ? 'thermal_stabilization_integrated_commissioning'
    : hasAny(['fresh_air_condensate_leak_detection', 'fresh_air_condensate_interface', 'condensate_leak_detection', 'leak_detection_interface']) ? 'fresh_air_condensate_leak_detection'
      : hasAny(['precision_air_unit_installation', 'precision_ac_unit_installation', 'crac_unit_installation', 'precision_air_equipment']) ? 'precision_air_unit_installation'
        : null
  const intelligentDataCenterCablingMethodBand = hasAny(['high_density_cross_connect_certification', 'high_density_rack_certification', 'cross_connect_certification', 'dense_patch_certification']) ? 'high_density_cross_connect_certification'
    : hasAny(['fiber_backbone_certification', 'fiber_backbone', 'optical_fiber_certification', 'fiber_link_certification']) ? 'fiber_backbone_certification'
      : hasAny(['copper_rack_cabling', 'copper_cabling', 'rack_copper_cabling', 'data_center_copper_patch']) ? 'copper_rack_cabling'
        : null
  const intelligentDataCenterSecurityMonitoringMethodBand = hasAny(['integrated_monitoring_platform', 'data_center_monitoring_platform', 'security_monitoring_platform', 'monitoring_platform_integration']) ? 'integrated_monitoring_platform'
    : hasAny(['access_security_endpoints', 'access_control_security_endpoint', 'data_center_access_control', 'door_access_security']) ? 'access_security_endpoints'
      : hasAny(['environment_monitoring_points', 'environment_monitoring_point', 'temperature_humidity_monitoring', 'environment_sensor_points']) ? 'environment_monitoring_points'
        : null
  const intelligentDataCenterFireSuppressionMethodBand = hasAny(['integrated_fire_suppression_test', 'integrated_fire_test', 'fire_suppression_integrated_test', 'gas_release_fire_linkage_test']) ? 'integrated_fire_suppression_test'
    : hasAny(['gas_suppression_release', 'gas_suppression_system', 'gas_release_system', 'fire_gas_suppression']) ? 'gas_suppression_release'
      : hasAny(['fire_alarm_interface', 'fire_alarm_interface_test', 'data_center_fire_alarm', 'fire_alarm_linkage_interface']) ? 'fire_alarm_interface'
        : null
  const intelligentDataCenterInteriorFitoutMethodBand = hasAny(['micro_module_fitout', 'micro_module', 'data_center_micro_module', 'modular_data_center_fitout']) ? 'micro_module_fitout'
    : hasAny(['cold_aisle_containment', 'cold_aisle', 'hot_cold_aisle_containment', 'containment_aisle']) ? 'cold_aisle_containment'
      : hasAny(['raised_floor', 'anti_static_floor', 'data_center_raised_floor', 'machine_room_raised_floor']) ? 'raised_floor'
        : null
  const intelligentDataCenterCommissioningMethodBand = hasAny(['integrated_issue_closure', 'issue_closure', 'defect_closure_commissioning', 'punch_list_retest']) ? 'integrated_issue_closure'
    : hasAny(['load_simulation_commissioning', 'load_simulation', 'data_center_load_simulation', 'load_bank_commissioning']) ? 'load_simulation_commissioning'
      : hasAny(['subsystem_commissioning', 'single_system_commissioning', 'data_center_subsystem_test', 'system_point_commissioning']) ? 'subsystem_commissioning'
        : null
  const heightBand = hasAny(['high_rise_facade', 'high_rise', 'tower_facade', 'super_high_rise', 'high_rise_core_and_floor_cycle']) ? 'high_rise'
    : hasAny(['low_rise_facade', 'standard_rise_facade', 'low_rise', 'standard_height']) ? 'low_rise'
      : null
  const locationBand = hasAny(['indoor_installation', 'indoor', 'interior', 'inside', 'decoration_room_zone']) ? 'indoor'
    : hasAny(['outdoor_installation', 'outdoor', 'external', 'exterior', 'outside']) ? 'outdoor'
      : null
  const renovationBand = hasAny(['renovation', 'occupied_workface', 'renovation_shaft', 'retrofit', 'existing_building', 'refurbishment']) ? 'renovation'
    : hasAny(['new_build', 'new_construction', 'greenfield', 'new_project']) ? 'new_build'
      : null
  const workfaceBand = hasAny(['constrained_workface', 'limited_workface', 'renovation_shaft', 'occupied_workface']) ? 'constrained'
    : hasAny(['open_workface', 'standard_workface']) ? 'open'
      : null

  const scoreSelector = (selector: Record<string, unknown>) => {
    let score = 0
    let unmatchedSpecificity = 0
    const dimensions = [
      { key: 'depthBand', value: depthBand, weight: 3 },
      { key: 'diameterBand', value: diameterBand, weight: 3 },
      { key: 'geologyBand', value: geologyBand, weight: 3 },
      { key: 'facadeSystemBand', value: facadeSystemBand, weight: 3 },
      { key: 'formworkSystemBand', value: formworkSystemBand, weight: 3 },
      { key: 'concretePlacementBand', value: concretePlacementBand, weight: 3 },
      { key: 'concreteCuringMethodBand', value: concreteCuringMethodBand, weight: 3 },
      { key: 'accessSystemBand', value: accessSystemBand, weight: 3 },
      { key: 'siteSetupMethodBand', value: siteSetupMethodBand, weight: 3 },
      { key: 'replacementMaterialBand', value: replacementMaterialBand, weight: 3 },
      { key: 'groutingMethodBand', value: groutingMethodBand, weight: 3 },
      { key: 'preloadingMethodBand', value: preloadingMethodBand, weight: 3 },
      { key: 'compositeGroundMethodBand', value: compositeGroundMethodBand, weight: 3 },
      { key: 'jetGroutingMethodBand', value: jetGroutingMethodBand, weight: 3 },
      { key: 'cementSoilMixingMethodBand', value: cementSoilMixingMethodBand, weight: 3 },
      { key: 'cfgMethodBand', value: cfgMethodBand, weight: 3 },
      { key: 'earthworkMethodBand', value: earthworkMethodBand, weight: 3 },
      { key: 'foundationPitSupportMethodBand', value: foundationPitSupportMethodBand, weight: 3 },
      { key: 'boredPileSupportMethodBand', value: boredPileSupportMethodBand, weight: 3 },
      { key: 'sheetPileMethodBand', value: sheetPileMethodBand, weight: 3 },
      { key: 'secantPileMethodBand', value: secantPileMethodBand, weight: 3 },
      { key: 'smwMethodBand', value: smwMethodBand, weight: 3 },
      { key: 'soilNailMethodBand', value: soilNailMethodBand, weight: 3 },
      { key: 'diaphragmWallMethodBand', value: diaphragmWallMethodBand, weight: 3 },
      { key: 'cementSoilWallMethodBand', value: cementSoilWallMethodBand, weight: 3 },
      { key: 'internalStrutMethodBand', value: internalStrutMethodBand, weight: 3 },
      { key: 'anchorSupportMethodBand', value: anchorSupportMethodBand, weight: 3 },
      { key: 'interfaceSupportMethodBand', value: interfaceSupportMethodBand, weight: 3 },
      { key: 'dewateringMethodBand', value: dewateringMethodBand, weight: 3 },
      { key: 'slopeSupportMethodBand', value: slopeSupportMethodBand, weight: 3 },
      { key: 'precastPileMethodBand', value: precastPileMethodBand, weight: 3 },
      { key: 'pileFoundationMethodBand', value: pileFoundationMethodBand, weight: 3 },
      { key: 'dryBoredPileMethodBand', value: dryBoredPileMethodBand, weight: 3 },
      { key: 'longSpiralPileMethodBand', value: longSpiralPileMethodBand, weight: 3 },
      { key: 'drivenCastInPlacePileMethodBand', value: drivenCastInPlacePileMethodBand, weight: 3 },
      { key: 'steelPileMethodBand', value: steelPileMethodBand, weight: 3 },
      { key: 'anchorStaticPressurePileMethodBand', value: anchorStaticPressurePileMethodBand, weight: 3 },
      { key: 'rockAnchorFoundationMethodBand', value: rockAnchorFoundationMethodBand, weight: 3 },
      { key: 'foundationCushionMethodBand', value: foundationCushionMethodBand, weight: 3 },
      { key: 'shallowFoundationMethodBand', value: shallowFoundationMethodBand, weight: 3 },
      { key: 'caissonFoundationMethodBand', value: caissonFoundationMethodBand, weight: 3 },
      { key: 'basementStructureMethodBand', value: basementStructureMethodBand, weight: 3 },
      { key: 'basementWaterproofMethodBand', value: basementWaterproofMethodBand, weight: 3 },
      { key: 'pcHoistingMethodBand', value: pcHoistingMethodBand, weight: 3 },
      { key: 'pcJointMethodBand', value: pcJointMethodBand, weight: 3 },
      { key: 'steelFabricationMethodBand', value: steelFabricationMethodBand, weight: 3 },
      { key: 'steelErectionMethodBand', value: steelErectionMethodBand, weight: 3 },
      { key: 'steelTubeConcreteMethodBand', value: steelTubeConcreteMethodBand, weight: 3 },
      { key: 'steelReinforcedConcreteMethodBand', value: steelReinforcedConcreteMethodBand, weight: 3 },
      { key: 'steelConnectionMethodBand', value: steelConnectionMethodBand, weight: 3 },
      { key: 'largeSpanRoofMethodBand', value: largeSpanRoofMethodBand, weight: 3 },
      { key: 'timberStructureMethodBand', value: timberStructureMethodBand, weight: 3 },
      { key: 'steelEnvelopeMethodBand', value: steelEnvelopeMethodBand, weight: 3 },
      { key: 'masonryWallMethodBand', value: masonryWallMethodBand, weight: 3 },
      { key: 'plasteringMethodBand', value: plasteringMethodBand, weight: 3 },
      { key: 'roofWaterproofMethodBand', value: roofWaterproofMethodBand, weight: 3 },
      { key: 'roofInsulationMethodBand', value: roofInsulationMethodBand, weight: 3 },
      { key: 'roofMembraneMethodBand', value: roofMembraneMethodBand, weight: 3 },
      { key: 'roofTilePanelMethodBand', value: roofTilePanelMethodBand, weight: 3 },
      { key: 'roofDetailMethodBand', value: roofDetailMethodBand, weight: 3 },
      { key: 'exteriorWallWaterproofMethodBand', value: exteriorWallWaterproofMethodBand, weight: 3 },
      { key: 'floorFinishMethodBand', value: floorFinishMethodBand, weight: 3 },
      { key: 'exteriorInsulationMethodBand', value: exteriorInsulationMethodBand, weight: 3 },
      { key: 'ceilingSystemMethodBand', value: ceilingSystemMethodBand, weight: 3 },
      { key: 'doorWindowRailingMethodBand', value: doorWindowRailingMethodBand, weight: 3 },
      { key: 'interiorDetailMethodBand', value: interiorDetailMethodBand, weight: 3 },
      { key: 'interiorPublicFinishMethodBand', value: interiorPublicFinishMethodBand, weight: 3 },
      { key: 'interiorUnitFinishMethodBand', value: interiorUnitFinishMethodBand, weight: 3 },
      { key: 'lightweightPartitionWallMethodBand', value: lightweightPartitionWallMethodBand, weight: 3 },
      { key: 'wallPanelFinishMethodBand', value: wallPanelFinishMethodBand, weight: 3 },
      { key: 'tileFacingMethodBand', value: tileFacingMethodBand, weight: 3 },
      { key: 'coatingPaintFinishMethodBand', value: coatingPaintFinishMethodBand, weight: 3 },
      { key: 'wallpaperSoftFinishMethodBand', value: wallpaperSoftFinishMethodBand, weight: 3 },
      { key: 'outdoorUtilitiesMethodBand', value: outdoorUtilitiesMethodBand, weight: 3 },
      { key: 'outdoorWaterSupplyNetworkMethodBand', value: outdoorWaterSupplyNetworkMethodBand, weight: 3 },
      { key: 'outdoorDrainageNetworkMethodBand', value: outdoorDrainageNetworkMethodBand, weight: 3 },
      { key: 'outdoorHeatingNetworkMethodBand', value: outdoorHeatingNetworkMethodBand, weight: 3 },
      { key: 'outdoorRoadHardscapeMethodBand', value: outdoorRoadHardscapeMethodBand, weight: 3 },
      { key: 'landscapeGreeneryMethodBand', value: landscapeGreeneryMethodBand, weight: 3 },
      { key: 'singleSystemCommissioningMethodBand', value: singleSystemCommissioningMethodBand, weight: 3 },
      { key: 'integratedCommissioningMethodBand', value: integratedCommissioningMethodBand, weight: 3 },
      { key: 'energyHvacSystemMethodBand', value: energyHvacSystemMethodBand, weight: 3 },
      { key: 'energyElectricalLightingMethodBand', value: energyElectricalLightingMethodBand, weight: 3 },
      { key: 'energyMonitoringControlMethodBand', value: energyMonitoringControlMethodBand, weight: 3 },
      { key: 'energyRenewableSystemMethodBand', value: energyRenewableSystemMethodBand, weight: 3 },
      { key: 'plumbingWaterSupplyPipeMethodBand', value: plumbingWaterSupplyPipeMethodBand, weight: 3 },
      { key: 'plumbingFirePipeMethodBand', value: plumbingFirePipeMethodBand, weight: 3 },
      { key: 'plumbingDrainageMethodBand', value: plumbingDrainageMethodBand, weight: 3 },
      { key: 'plumbingSupplyDrainageMethodBand', value: plumbingSupplyDrainageMethodBand, weight: 3 },
      { key: 'plumbingSpecialWaterMethodBand', value: plumbingSpecialWaterMethodBand, weight: 3 },
      { key: 'plumbingReclaimedRainwaterMethodBand', value: plumbingReclaimedRainwaterMethodBand, weight: 3 },
      { key: 'plumbingPoolBathMethodBand', value: plumbingPoolBathMethodBand, weight: 3 },
      { key: 'plumbingWaterFeatureMethodBand', value: plumbingWaterFeatureMethodBand, weight: 3 },
      { key: 'plumbingWaterSupplyEquipmentMethodBand', value: plumbingWaterSupplyEquipmentMethodBand, weight: 3 },
      { key: 'plumbingPipeAnticorrosionMethodBand', value: plumbingPipeAnticorrosionMethodBand, weight: 3 },
      { key: 'plumbingPipeInsulationMethodBand', value: plumbingPipeInsulationMethodBand, weight: 3 },
      { key: 'plumbingPipeFlushingMethodBand', value: plumbingPipeFlushingMethodBand, weight: 3 },
      { key: 'plumbingWaterTestMethodBand', value: plumbingWaterTestMethodBand, weight: 3 },
      { key: 'plumbingHotWaterMethodBand', value: plumbingHotWaterMethodBand, weight: 3 },
      { key: 'heatingRadiatorMethodBand', value: heatingRadiatorMethodBand, weight: 3 },
      { key: 'heatingHydronicFloorMethodBand', value: heatingHydronicFloorMethodBand, weight: 3 },
      { key: 'heatingElectricFloorMethodBand', value: heatingElectricFloorMethodBand, weight: 3 },
      { key: 'heatingIndoorSystemMethodBand', value: heatingIndoorSystemMethodBand, weight: 3 },
      { key: 'heatingGasRadiantMethodBand', value: heatingGasRadiantMethodBand, weight: 3 },
      { key: 'heatingSourceEquipmentMethodBand', value: heatingSourceEquipmentMethodBand, weight: 3 },
      { key: 'hvacSupplyAirMethodBand', value: hvacSupplyAirMethodBand, weight: 3 },
      { key: 'hvacExhaustAirMethodBand', value: hvacExhaustAirMethodBand, weight: 3 },
      { key: 'hvacAirDistributionMethodBand', value: hvacAirDistributionMethodBand, weight: 3 },
      { key: 'hvacSmokeControlMethodBand', value: hvacSmokeControlMethodBand, weight: 3 },
      { key: 'hvacDustExhaustMethodBand', value: hvacDustExhaustMethodBand, weight: 3 },
      { key: 'hvacVacuumCleaningMethodBand', value: hvacVacuumCleaningMethodBand, weight: 3 },
      { key: 'hvacComfortAirMethodBand', value: hvacComfortAirMethodBand, weight: 3 },
      { key: 'hvacVrfMethodBand', value: hvacVrfMethodBand, weight: 3 },
      { key: 'hvacConstantHumidityMethodBand', value: hvacConstantHumidityMethodBand, weight: 3 },
      { key: 'hvacCleanroomMethodBand', value: hvacCleanroomMethodBand, weight: 3 },
      { key: 'hvacCivilDefenseMethodBand', value: hvacCivilDefenseMethodBand, weight: 3 },
      { key: 'hvacWaterEquipmentMethodBand', value: hvacWaterEquipmentMethodBand, weight: 3 },
      { key: 'hvacCondensateMethodBand', value: hvacCondensateMethodBand, weight: 3 },
      { key: 'hvacCoolingWaterMethodBand', value: hvacCoolingWaterMethodBand, weight: 3 },
      { key: 'hvacGroundSourceMethodBand', value: hvacGroundSourceMethodBand, weight: 3 },
      { key: 'hvacWaterSourceMethodBand', value: hvacWaterSourceMethodBand, weight: 3 },
      { key: 'hvacHeatPumpExchangeMethodBand', value: hvacHeatPumpExchangeMethodBand, weight: 3 },
      { key: 'hvacThermalStorageMethodBand', value: hvacThermalStorageMethodBand, weight: 3 },
      { key: 'hvacSolarMethodBand', value: hvacSolarMethodBand, weight: 3 },
      { key: 'hvacStorageSolarMethodBand', value: hvacStorageSolarMethodBand, weight: 3 },
      { key: 'hvacAutomationMethodBand', value: hvacAutomationMethodBand, weight: 3 },
      { key: 'hvacCompressionChillerMethodBand', value: hvacCompressionChillerMethodBand, weight: 3 },
      { key: 'hvacAbsorptionRefrigerationMethodBand', value: hvacAbsorptionRefrigerationMethodBand, weight: 3 },
      { key: 'hvacChillerAbsorptionMethodBand', value: hvacChillerAbsorptionMethodBand, weight: 3 },
      { key: 'electricalOutdoorDistributionMethodBand', value: electricalOutdoorDistributionMethodBand, weight: 3 },
      { key: 'electricalPowerRoomMethodBand', value: electricalPowerRoomMethodBand, weight: 3 },
      { key: 'electricalFeederMethodBand', value: electricalFeederMethodBand, weight: 3 },
      { key: 'electricalDistributionEquipmentMethodBand', value: electricalDistributionEquipmentMethodBand, weight: 3 },
      { key: 'electricalLightingTerminalMethodBand', value: electricalLightingTerminalMethodBand, weight: 3 },
      { key: 'electricalStandbyPowerMethodBand', value: electricalStandbyPowerMethodBand, weight: 3 },
      { key: 'electricalGroundingLightningMethodBand', value: electricalGroundingLightningMethodBand, weight: 3 },
      { key: 'elevatorInstallationMethodBand', value: elevatorInstallationMethodBand, weight: 3 },
      { key: 'elevatorTractionInstallationMethodBand', value: elevatorTractionInstallationMethodBand, weight: 3 },
      { key: 'elevatorMachineDriveMethodBand', value: elevatorMachineDriveMethodBand, weight: 3 },
      { key: 'elevatorGuideRailMethodBand', value: elevatorGuideRailMethodBand, weight: 3 },
      { key: 'elevatorDoorSystemMethodBand', value: elevatorDoorSystemMethodBand, weight: 3 },
      { key: 'elevatorCarAssemblyMethodBand', value: elevatorCarAssemblyMethodBand, weight: 3 },
      { key: 'elevatorCounterweightMethodBand', value: elevatorCounterweightMethodBand, weight: 3 },
      { key: 'elevatorSafetyComponentMethodBand', value: elevatorSafetyComponentMethodBand, weight: 3 },
      { key: 'elevatorSuspensionRopeMethodBand', value: elevatorSuspensionRopeMethodBand, weight: 3 },
      { key: 'elevatorTravelingCableMethodBand', value: elevatorTravelingCableMethodBand, weight: 3 },
      { key: 'elevatorCompensationDeviceMethodBand', value: elevatorCompensationDeviceMethodBand, weight: 3 },
      { key: 'elevatorElectricalDeviceMethodBand', value: elevatorElectricalDeviceMethodBand, weight: 3 },
      { key: 'elevatorHydraulicGuideRailMethodBand', value: elevatorHydraulicGuideRailMethodBand, weight: 3 },
      { key: 'elevatorHydraulicDoorSystemMethodBand', value: elevatorHydraulicDoorSystemMethodBand, weight: 3 },
      { key: 'elevatorHydraulicCarAssemblyMethodBand', value: elevatorHydraulicCarAssemblyMethodBand, weight: 3 },
      { key: 'elevatorHydraulicBalanceWeightMethodBand', value: elevatorHydraulicBalanceWeightMethodBand, weight: 3 },
      { key: 'elevatorHydraulicSafetyMethodBand', value: elevatorHydraulicSafetyMethodBand, weight: 3 },
      { key: 'elevatorHydraulicSuspensionMethodBand', value: elevatorHydraulicSuspensionMethodBand, weight: 3 },
      { key: 'elevatorHydraulicTravelingCableMethodBand', value: elevatorHydraulicTravelingCableMethodBand, weight: 3 },
      { key: 'elevatorHydraulicElectricalMethodBand', value: elevatorHydraulicElectricalMethodBand, weight: 3 },
      { key: 'elevatorHydraulicInstallationMethodBand', value: elevatorHydraulicInstallationMethodBand, weight: 3 },
      { key: 'escalatorMovingWalkMethodBand', value: escalatorMovingWalkMethodBand, weight: 3 },
      { key: 'intelligentIntegrationMethodBand', value: intelligentIntegrationMethodBand, weight: 3 },
      { key: 'intelligentNetworkMethodBand', value: intelligentNetworkMethodBand, weight: 3 },
      { key: 'intelligentStructuredCablingMethodBand', value: intelligentStructuredCablingMethodBand, weight: 3 },
      { key: 'intelligentApplicationMethodBand', value: intelligentApplicationMethodBand, weight: 3 },
      { key: 'intelligentAccessMethodBand', value: intelligentAccessMethodBand, weight: 3 },
      { key: 'intelligentMobileSignalMethodBand', value: intelligentMobileSignalMethodBand, weight: 3 },
      { key: 'intelligentSatelliteMethodBand', value: intelligentSatelliteMethodBand, weight: 3 },
      { key: 'intelligentTelecomAccessMethodBand', value: intelligentTelecomAccessMethodBand, weight: 3 },
      { key: 'intelligentTelephoneExchangeMethodBand', value: intelligentTelephoneExchangeMethodBand, weight: 3 },
      { key: 'intelligentCommunicationMediaMethodBand', value: intelligentCommunicationMediaMethodBand, weight: 3 },
      { key: 'intelligentPublicBroadcastMethodBand', value: intelligentPublicBroadcastMethodBand, weight: 3 },
      { key: 'intelligentConferenceMethodBand', value: intelligentConferenceMethodBand, weight: 3 },
      { key: 'intelligentDisplayMethodBand', value: intelligentDisplayMethodBand, weight: 3 },
      { key: 'intelligentClockMethodBand', value: intelligentClockMethodBand, weight: 3 },
      { key: 'intelligentBaControlMethodBand', value: intelligentBaControlMethodBand, weight: 3 },
      { key: 'intelligentFireAlarmMethodBand', value: intelligentFireAlarmMethodBand, weight: 3 },
      { key: 'intelligentSecurityTechnicalMethodBand', value: intelligentSecurityTechnicalMethodBand, weight: 3 },
      { key: 'intelligentLightningGroundingMethodBand', value: intelligentLightningGroundingMethodBand, weight: 3 },
      { key: 'intelligentEmergencyResponseMethodBand', value: intelligentEmergencyResponseMethodBand, weight: 3 },
      { key: 'intelligentSecurityEmergencyMethodBand', value: intelligentSecurityEmergencyMethodBand, weight: 3 },
      { key: 'intelligentDataCenterRoomMethodBand', value: intelligentDataCenterRoomMethodBand, weight: 3 },
      { key: 'intelligentDataCenterPowerMethodBand', value: intelligentDataCenterPowerMethodBand, weight: 3 },
      { key: 'intelligentDataCenterGroundingMethodBand', value: intelligentDataCenterGroundingMethodBand, weight: 3 },
      { key: 'intelligentDataCenterPrecisionAirMethodBand', value: intelligentDataCenterPrecisionAirMethodBand, weight: 3 },
      { key: 'intelligentDataCenterCablingMethodBand', value: intelligentDataCenterCablingMethodBand, weight: 3 },
      { key: 'intelligentDataCenterSecurityMonitoringMethodBand', value: intelligentDataCenterSecurityMonitoringMethodBand, weight: 3 },
      { key: 'intelligentDataCenterFireSuppressionMethodBand', value: intelligentDataCenterFireSuppressionMethodBand, weight: 3 },
      { key: 'intelligentDataCenterInteriorFitoutMethodBand', value: intelligentDataCenterInteriorFitoutMethodBand, weight: 3 },
      { key: 'intelligentDataCenterCommissioningMethodBand', value: intelligentDataCenterCommissioningMethodBand, weight: 3 },
      { key: 'heightBand', value: heightBand, weight: 2 },
      { key: 'locationBand', value: locationBand, weight: 2 },
      { key: 'renovationBand', value: renovationBand, weight: 2 },
      { key: 'workfaceBand', value: workfaceBand, weight: 2 },
    ]
    for (const dimension of dimensions) {
      const selectorValue = selector[dimension.key]
      if (dimension.value) {
        if (selectorValue && selectorValue !== dimension.value) return null
        if (selectorValue === dimension.value) score += dimension.weight
      } else if (selectorValue) {
        unmatchedSpecificity += 1
      }
    }
    return { score, unmatchedSpecificity }
  }

  const durationBands = Array.isArray(record.conditionedDurationBands) ? record.conditionedDurationBands : []
  const bands = Array.isArray(record.productivityBands) ? record.productivityBands : []
  const profiles = Array.isArray(record.conditionedProcessProfiles) ? record.conditionedProcessProfiles : []
  const candidates = [...durationBands, ...bands, ...profiles]
    .map((item: any) => {
      const scored = scoreSelector(readRecord(item?.selector))
      return scored ? { item, ...scored } : null
    })
    .filter((candidate): candidate is { item: any; score: number; unmatchedSpecificity: number } => Boolean(candidate && candidate.score > 0))
    .sort((left, right) => (right.score - left.score) || (left.unmatchedSpecificity - right.unmatchedSpecificity))

  const selectedCode = normalizeText(candidates[0]?.item?.conditionCode)
  if (!selectedCode) return null

  return {
    conditionCode: selectedCode,
    durationBand: durationBands.find((band: any) => normalizeText(band?.conditionCode) === selectedCode) ?? null,
    productivityBand: bands.find((band: any) => normalizeText(band?.conditionCode) === selectedCode) ?? null,
    profileBand: profiles.find((profile: any) => normalizeText(profile?.conditionCode) === selectedCode) ?? null,
    score: candidates[0].score,
  }
}

function applyStandardWorkConditionBand<T extends ResolvedAlgorithmSeedRecord>(record: T | null, context: V1475SeedMatchContext = {}): T | null {
  if (!record) return record
  const selected = readStandardWorkConditionBand(record, context)
  if (!selected) return record
  const durationBand = readRecord(selected.durationBand)
  const productivity = readRecord(selected.productivityBand?.baselineProductivity)
  const selectedP50 = normalizeNumber(durationBand.defaultDaysP50)
  const nextP50 = selectedP50 && selectedP50 > 0 ? selectedP50 : normalizeNumber(record.defaultDaysP50 ?? record.default_days_p50 ?? record.defaultDays ?? record.default_days)
  if (!nextP50 || nextP50 <= 0) return record
  const p20 = Math.max(1, normalizeNumber(durationBand.defaultDaysP20) ?? Math.round(nextP50 * 0.7))
  const p80 = Math.max(nextP50, normalizeNumber(durationBand.defaultDaysP80) ?? Math.round(nextP50 * 1.3))
  const fixedDays = Math.min(nextP50, Math.max(0, normalizeNumber(durationBand.fixedDays) ?? Math.round(nextP50 * 0.25)))
  const normalizedProductivity = Object.keys(productivity).length > 0 ? productivity : record.baselineProductivity
  return {
    ...record,
    selectedConditionCode: selected.conditionCode,
    selectedConditionScore: selected.score,
    defaultDays: nextP50,
    defaultDaysP20: Math.min(p20, nextP50),
    defaultDaysP50: nextP50,
    defaultDaysP80: p80,
    fixedDays,
    variableDays: Math.max(0, nextP50 - fixedDays),
    baselineProductivity: normalizedProductivity,
    benchmarkBasis: [
      normalizeText(record.benchmarkBasis ?? record.benchmark_basis),
      `conditionBand=${selected.conditionCode}`,
    ].filter(Boolean).join('; '),
  }
}

function applyMethodDurationBucket<T extends ResolvedAlgorithmSeedRecord>(record: T | null, context: V1475SeedMatchContext = {}): T | null {
  if (!record) return record
  const selected = readMethodBucketDays(record, context)
  if (!selected) return record
  const baseP50 = normalizeNumber(record.defaultDaysP50 ?? record.default_days_p50 ?? record.defaultDays ?? record.default_days)
  if (!baseP50 || baseP50 <= 0 || selected.days === baseP50) return record
  const ratio = selected.days / baseP50
  const baseFixed = Math.max(0, normalizeNumber(record.fixedDays ?? record.fixed_days) ?? 0)
  const fixedDays = Math.min(selected.days, Math.max(0, Math.round(baseFixed * ratio)))
  const p20 = Math.max(1, Math.round((normalizeNumber(record.defaultDaysP20 ?? record.default_days_p20) ?? Math.max(1, baseP50 * 0.75)) * ratio))
  const p80 = Math.max(selected.days, Math.round((normalizeNumber(record.defaultDaysP80 ?? record.default_days_p80) ?? Math.max(baseP50 + 1, baseP50 * 1.35)) * ratio))
  return {
    ...record,
    defaultDays: selected.days,
    defaultDaysP20: Math.min(p20, selected.days),
    defaultDaysP50: selected.days,
    defaultDaysP80: p80,
    fixedDays,
    variableDays: Math.max(0, selected.days - fixedDays),
    benchmarkBasis: [
      normalizeText(record.benchmarkBasis ?? record.benchmark_basis),
      `methodBucket=${selected.method}:${selected.days}`,
    ].filter(Boolean).join('; '),
  }
}

function applyElementVariantDurationFactor<T extends ResolvedAlgorithmSeedRecord>(record: T | null, context: V1475SeedMatchContext = {}): T | null {
  if (!record) return record
  const selected = readElementVariantDurationFactor(record, context)
  if (!selected) return record
  const baseP50 = normalizeNumber(record.defaultDaysP50 ?? record.default_days_p50 ?? record.defaultDays ?? record.default_days)
  if (!baseP50 || baseP50 <= 0) return record
  const nextP50 = Math.max(1, Math.round(baseP50 * selected.factor))
  const baseFixed = Math.max(0, normalizeNumber(record.fixedDays ?? record.fixed_days) ?? 0)
  const fixedDays = Math.min(nextP50, Math.max(0, Math.round(baseFixed * selected.factor)))
  const p20 = Math.max(1, Math.round((normalizeNumber(record.defaultDaysP20 ?? record.default_days_p20) ?? Math.max(1, baseP50 * 0.78)) * selected.factor))
  const p80 = Math.max(nextP50, Math.round((normalizeNumber(record.defaultDaysP80 ?? record.default_days_p80) ?? Math.max(baseP50 + 1, baseP50 * 1.28)) * selected.factor))
  return {
    ...record,
    defaultDays: nextP50,
    defaultDaysP20: Math.min(p20, nextP50),
    defaultDaysP50: nextP50,
    defaultDaysP80: p80,
    fixedDays,
    variableDays: Math.max(0, nextP50 - fixedDays),
    benchmarkBasis: [
      normalizeText(record.benchmarkBasis ?? record.benchmark_basis),
      `elementVariantFactor=${selected.elementVariant}:${selected.factor}`,
    ].filter(Boolean).join('; '),
  }
}

function applyProjectTypeDurationFactor<T extends ResolvedAlgorithmSeedRecord>(record: T | null, context: V1475SeedMatchContext = {}): T | null {
  if (!record) return record
  const selected = readProjectTypeDurationFactor(record, context)
  if (!selected) return record
  const baseP50 = normalizeNumber(record.defaultDaysP50 ?? record.default_days_p50 ?? record.defaultDays ?? record.default_days)
  if (!baseP50 || baseP50 <= 0) return record
  const nextP50 = Math.max(1, Math.round(baseP50 * selected.factor))
  const baseFixed = Math.max(0, normalizeNumber(record.fixedDays ?? record.fixed_days) ?? 0)
  const fixedDays = Math.min(nextP50, Math.max(0, Math.round(baseFixed * selected.factor)))
  const p20 = Math.max(1, Math.round((normalizeNumber(record.defaultDaysP20 ?? record.default_days_p20) ?? Math.max(1, baseP50 * 0.75)) * selected.factor))
  const p80 = Math.max(nextP50, Math.round((normalizeNumber(record.defaultDaysP80 ?? record.default_days_p80) ?? Math.max(baseP50 + 1, baseP50 * 1.35)) * selected.factor))
  return {
    ...record,
    defaultDays: nextP50,
    defaultDaysP20: Math.min(p20, nextP50),
    defaultDaysP50: nextP50,
    defaultDaysP80: p80,
    fixedDays,
    variableDays: Math.max(0, nextP50 - fixedDays),
    benchmarkBasis: [
      normalizeText(record.benchmarkBasis ?? record.benchmark_basis),
      `projectTypeFactor=${selected.projectType}:${selected.factor}`,
    ].filter(Boolean).join('; '),
  }
}

function applyStructureTypeDurationFactor<T extends ResolvedAlgorithmSeedRecord>(record: T | null, context: V1475SeedMatchContext = {}): T | null {
  if (!record) return record
  const selected = readStructureTypeDurationFactor(record, context)
  if (!selected) return record
  const baseP50 = normalizeNumber(record.defaultDaysP50 ?? record.default_days_p50 ?? record.defaultDays ?? record.default_days)
  if (!baseP50 || baseP50 <= 0) return record
  const nextP50 = Math.max(1, Math.round(baseP50 * selected.factor))
  const baseFixed = Math.max(0, normalizeNumber(record.fixedDays ?? record.fixed_days) ?? 0)
  const fixedDays = Math.min(nextP50, Math.max(0, Math.round(baseFixed * selected.factor)))
  const p20 = Math.max(1, Math.round((normalizeNumber(record.defaultDaysP20 ?? record.default_days_p20) ?? Math.max(1, baseP50 * 0.75)) * selected.factor))
  const p80 = Math.max(nextP50, Math.round((normalizeNumber(record.defaultDaysP80 ?? record.default_days_p80) ?? Math.max(baseP50 + 1, baseP50 * 1.35)) * selected.factor))
  return {
    ...record,
    defaultDays: nextP50,
    defaultDaysP20: Math.min(p20, nextP50),
    defaultDaysP50: nextP50,
    defaultDaysP80: p80,
    fixedDays,
    variableDays: Math.max(0, nextP50 - fixedDays),
    benchmarkBasis: [
      normalizeText(record.benchmarkBasis ?? record.benchmark_basis),
      `structureTypeFactor=${selected.structureType}:${selected.factor}`,
    ].filter(Boolean).join('; '),
  }
}

function confidenceScore(record: AlgorithmSeedRecordPayload) {
  const confidence = normalizeText(record.confidence).toLowerCase()
  if (confidence === 'high') return 3
  if (confidence === 'medium') return 2
  if (confidence === 'low') return 1
  return 0
}

function resolverSourceScore(record: ResolvedAlgorithmSeedRecord) {
  if (record.__resolverSource === 'project_override') return 4
  if (record.__resolverSource === 'company_override') return 3
  if (record.__resolverSource === 'active_seed') return 2
  return 1
}

type SeedMatchRecordIndex = {
  byStandardWorkCode: Map<string, number[]>
  byStandardCatalogPrefix: Map<string, number[]>
  byTemplateNodeId: Map<string, number[]>
}

const seedMatchRecordIndexCache = new WeakMap<object, SeedMatchRecordIndex>()
const MAX_UNINDEXED_KEYWORD_ONLY_SCORE = 20 + 10 + 6 + 6 + 5 + 3 + 4

function appendSeedMatchRecordIndex(index: Map<string, number[]>, key: string, recordIndex: number) {
  if (!key) return
  const existing = index.get(key)
  if (existing) {
    existing.push(recordIndex)
    return
  }
  index.set(key, [recordIndex])
}

function readSeedMatchRecordIndex<T extends ResolvedAlgorithmSeedRecord>(records: T[]): SeedMatchRecordIndex {
  const cached = seedMatchRecordIndexCache.get(records)
  if (cached) return cached
  const index: SeedMatchRecordIndex = {
    byStandardWorkCode: new Map(),
    byStandardCatalogPrefix: new Map(),
    byTemplateNodeId: new Map(),
  }
  records.forEach((record, recordIndex) => {
    for (const code of readRecordStandardWorkCodes(record)) {
      appendSeedMatchRecordIndex(index.byStandardWorkCode, code, recordIndex)
    }
    for (const prefix of readRecordStandardCatalogCodePrefixes(record)) {
      appendSeedMatchRecordIndex(index.byStandardCatalogPrefix, prefix, recordIndex)
    }
    for (const templateNodeId of readRecordTemplateNodeIds(record)) {
      appendSeedMatchRecordIndex(index.byTemplateNodeId, templateNodeId, recordIndex)
    }
  })
  seedMatchRecordIndexCache.set(records, index)
  return index
}

function readHierarchicalCodePrefixes(code: string) {
  const parts = code.split('-').filter(Boolean)
  if (parts.length <= 1) return code ? [code] : []
  return parts.map((_, index) => parts.slice(0, index + 1).join('-'))
}

function collectIndexedSeedMatchCandidateIndices<T extends ResolvedAlgorithmSeedRecord>(
  records: T[],
  context: V1475SeedMatchContext,
) {
  if (records.length < 256) return []
  const recordIndex = readSeedMatchRecordIndex(records)
  const candidateIndices = new Set<number>()
  for (const code of readContextStandardWorkCodes(context)) {
    for (const index of recordIndex.byStandardWorkCode.get(code) ?? []) candidateIndices.add(index)
    for (const prefix of readHierarchicalCodePrefixes(code)) {
      for (const index of recordIndex.byStandardCatalogPrefix.get(prefix) ?? []) candidateIndices.add(index)
    }
  }
  const templateNodeId = normalizeText(context.templateNodeId).toLowerCase()
  if (templateNodeId) {
    for (const index of recordIndex.byTemplateNodeId.get(templateNodeId) ?? []) candidateIndices.add(index)
  }
  return [...candidateIndices].sort((left, right) => left - right)
}

function scoreSeedMatchRecord<T extends ResolvedAlgorithmSeedRecord>(
  record: T,
  normalizedText: string,
  context: V1475SeedMatchContext,
  keywordMatch: (record: T, text: string) => boolean,
) {
  if (!granularityMatches(record, context)) return null
  let score = 0
  const standardMatchScore = standardWorkCodeMatchScore(record, context)
  const standardMatched = standardMatchScore > 0
  const templateMatched = hasTemplateNodeMatch(record, context)
  const keywordMatched = normalizedText ? keywordMatch(record, normalizedText) : false

  if (standardMatched) score += standardMatchScore
  if (templateMatched) score += 80
  if (keywordMatched) score += 20
  if (!standardMatched && !templateMatched && !keywordMatched) return null

  score += methodScore(record, context)
  score += elementVariantScore(record, context)
  score += projectTypeScore(record, context)
  score += structureTypeScore(record, context)
  score += confidenceScore(record)
  score += resolverSourceScore(record)
  return score
}

function bestSeedMatch<T extends ResolvedAlgorithmSeedRecord>(
  records: T[],
  text: string,
  context: V1475SeedMatchContext,
  keywordMatch: (record: T, text: string) => boolean,
) {
  const normalizedText = normalizeText(text)
  const indexedCandidateIndices = collectIndexedSeedMatchCandidateIndices(records, context)
  let bestRecord: T | null = null
  let bestScore = Number.NEGATIVE_INFINITY
  for (const recordIndex of indexedCandidateIndices) {
    const record = records[recordIndex]
    const score = scoreSeedMatchRecord(record, normalizedText, context, keywordMatch)
    if (score === null) continue
    if (score > bestScore) {
      bestRecord = record
      bestScore = score
    }
  }
  if (bestRecord && bestScore > MAX_UNINDEXED_KEYWORD_ONLY_SCORE) return bestRecord

  bestRecord = null
  bestScore = Number.NEGATIVE_INFINITY
  for (const record of records) {
    const score = scoreSeedMatchRecord(record, normalizedText, context, keywordMatch)
    if (score === null) continue
    if (score > bestScore) {
      bestRecord = record
      bestScore = score
    }
  }
  return bestRecord
}

function resourceOperationRuleMatchScore(rule: AlgorithmSeedRecordPayload, text: string, context: V1475SeedMatchContext = {}) {
  const contextCodes = readContextStandardWorkCodes(context)
  const ruleCodes = normalizeTextArray(rule.standardWorkCodes ?? rule.standard_work_codes).map((item) => item.toLowerCase())
  const explicitStandardWorkCode = normalizeText(context.standardWorkCode).toLowerCase()
  if (explicitStandardWorkCode && ruleCodes.includes(explicitStandardWorkCode)) {
    return { score: 260, matchSource: 'standard_work_code' }
  }
  const directMatchIndex = contextCodes.findIndex((code) => ruleCodes.includes(code))
  if (directMatchIndex >= 0) {
    return { score: 140 - Math.min(directMatchIndex, 20), matchSource: 'standard_work_code' }
  }

  const catalogPrefixes = normalizeTextArray(rule.standardCatalogCodePrefixes ?? rule.standard_catalog_code_prefixes)
    .map((item) => item.toLowerCase())
  const matchedPrefixLength = catalogPrefixes.reduce((max, prefix) => {
    const matched = contextCodes.some((code) => code === prefix || code.startsWith(`${prefix}-`))
    return matched ? Math.max(max, prefix.length) : max
  }, 0)
  if (matchedPrefixLength > 0) {
    return { score: 80 + matchedPrefixLength, matchSource: 'standard_catalog_prefix' }
  }

  return hasAnyKeywordMatch(rule.keywords, text)
    ? { score: 20, matchSource: 'keyword' }
    : { score: 0, matchSource: 'keyword' }
}

function applyResourceOperationMatch<T extends ResolvedAlgorithmSeedRecord>(record: T | null, text: string, context: V1475SeedMatchContext = {}): T | null {
  if (!record || !Array.isArray(record.operationRules)) return record
  const normalizedText = normalizeText(text).toLowerCase()
  const operation = record.operationRules
    .map((rule: unknown, index: number) => {
      if (!rule || typeof rule !== 'object' || Array.isArray(rule)) return null
      const match = resourceOperationRuleMatchScore(rule as AlgorithmSeedRecordPayload, normalizedText, context)
      return match.score > 0 ? { rule: rule as AlgorithmSeedRecordPayload, index, ...match } : null
    })
    .filter((item): item is { rule: AlgorithmSeedRecordPayload; index: number; score: number; matchSource: string } => Boolean(item))
    .sort((left, right) => right.score - left.score || left.index - right.index)[0]
  if (!operation) return record
  return {
    ...record,
    resourceOperationType: normalizeText(operation.rule.operationType ?? operation.rule.operation_type),
    resourceOperationConfidence: normalizeText(operation.rule.confidence),
    resourceOperationMatchSource: operation.matchSource,
  }
}

function buildResourceClassStaticFallbackRecord(
  text: string,
  context: V1475SeedMatchContext = {},
): ResolvedAlgorithmSeedRecord | null {
  const match = findV1474ResourceClassMatch(text, context)
  if (!match) return null
  return {
    ...match.mapping,
    __stableCode: match.stableCode,
    __resolverSource: 'ts_seed_fallback',
    pressureDimensions: match.pressureDimensions,
    resourceOperationType: match.resourceOperationType,
    resourceOperationConfidence: match.operationConfidence,
    resourceOperationMatchSource: match.operationMatchSource,
  }
}

export async function resolveV1474SeasonalProductivity(
  regionCode: string | null | undefined,
  month: number,
  context: AlgorithmSeedResolveContext = {},
) {
  const records = await resolveAlgorithmSeedRecords('seasonal_productivity', context)
  const normalizedRegion = normalizeV1474SeasonalProductivityRegion(regionCode)
  return records.find((item) => item.regionCode === normalizedRegion && item.month === month)
    ?? records.find((item) => item.regionCode === 'default' && item.month === month)
    ?? null
}

export async function hasV1474WorkCalendarForYear(year: number | string | null | undefined, context: AlgorithmSeedResolveContext = {}) {
  const records = await resolveAlgorithmSeedRecords('work_calendar', context)
  const normalizedYear = normalizeNumber(year)
  if (!normalizedYear) return false
  return records.some((item) => readHolidayYear(item) === normalizedYear)
    || forecastWorkCalendarFallbackRecords(normalizedYear).length > 0
}

export async function resolveV1474HolidayWindow(lookup: V1474HolidayWindowLookup, context: AlgorithmSeedResolveContext = {}) {
  const records = await resolveAlgorithmSeedRecords('work_calendar', context)
  const normalizedLookup = readHolidayLookup(lookup)
  const yearLookupSupplementRecords = normalizedLookup.year
    ? forecastWorkCalendarFallbackRecords(normalizedLookup.year).filter((item) => {
      const kind = normalizeText(item.calendarKind ?? item.calendar_kind)
      const code = normalizeText(item.holidayCode ?? item.holiday_code)
      const isCalendarSupplement = ['plum_rain_window', 'hot_summer_window', 'dust_storm_window', 'spring_festival_remobilization'].includes(kind)
      if (!isCalendarSupplement) return false
      return !records.some((record) => normalizeText(record.holidayCode ?? record.holiday_code) === code)
    })
    : []
  const withForecastFallback = normalizedLookup.year
    && !records.some((item) => readHolidayYear(item) === normalizedLookup.year)
    ? [...records, ...forecastWorkCalendarFallbackRecords(normalizedLookup.year)]
    : [...records, ...yearLookupSupplementRecords]
  const candidates = withForecastFallback.filter((item) => {
    const recordYear = readHolidayYear(item)
    const recordMonth = normalizeNumber(item.month)
    if (normalizedLookup.year && recordYear && recordYear !== normalizedLookup.year) return false
    if (normalizedLookup.date) return true
    return !normalizedLookup.month || recordMonth === normalizedLookup.month
  })
  if (normalizedLookup.date) {
    return candidates.find((item) => isDateInHolidayWindow(item, normalizedLookup.date!)) ?? null
  }
  return candidates
    .filter((item) => !isCompensatoryWorkdayRecord(item))
    .sort((left, right) => readCalendarProductivity(left) - readCalendarProductivity(right))[0]
    ?? null
}

export async function resolveV1474ProcessSeasonalSensitivity(text: string, month: number, context: AlgorithmSeedResolveContext = {}) {
  const records = await resolveAlgorithmSeedRecords('process_seasonal_sensitivity', context)
  const climateContext: V1474ProcessSeasonalEligibilityContext = {
    month,
    monthlyClimateSignal: context.monthlyClimateSignal,
    rainySeasonMonths: context.rainySeasonMonths,
    floodSeasonMonths: context.floodSeasonMonths,
    highTempMonths: context.highTempMonths,
    coldWeatherMonths: context.coldWeatherMonths,
  }
  const monthRecords = records.filter((item) => (
    Array.isArray(item.sensitiveMonths)
    && item.sensitiveMonths.includes(month)
    && isV1474ProcessSeasonalSensitivityClimateEligible(item as any, climateContext)
    && workEnvironmentMatches((item as any).workEnvironment ?? (item as any).work_environment, context.workEnvironment)
  ))
  return bestSeedMatch(monthRecords, text, context, hasKeywordMatch) ?? null
}

export async function resolveV1474ProcessConstraint(text: string, context: AlgorithmSeedResolveContext = {}) {
  const records = await resolveAlgorithmSeedRecords('process_constraint', context)
  const normalizedText = normalizeText(text)
  const scored = records
    .map((record, index) => {
      if (!granularityMatches(record, context)) return null

      const standardMatchScore = standardWorkCodeMatchScore(record, context)
      const prefixMatchScore = processConstraintPrefixMatchScore(record, context)
      const templateMatched = hasTemplateNodeMatch(record, context)
      const structuredScore = Math.max(standardMatchScore, prefixMatchScore, templateMatched ? 80 : 0)

      // process_constraint is a runtime edge constraint. Keywords may refine ranking,
      // but they must not create a runtime match without structured task/template context.
      if (structuredScore <= 0) return null

      const keywordMatched = processConstraintKeywordGate(record, normalizedText)
      if (!keywordMatched) return null

      let score = structuredScore
      score += 20
      score += methodScore(record, context)
      score += elementVariantScore(record, context)
      score += projectTypeScore(record, context)
      score += structureTypeScore(record, context)
      score += confidenceScore(record)
      score += resolverSourceScore(record)
      return {
        record: {
          ...record,
          processConstraintMatchSource: standardMatchScore > 0
            ? 'standard_work_code'
            : prefixMatchScore > 0
              ? 'structured_prefix'
              : 'template_node_id',
          processConstraintKeywordMatched: keywordMatched,
          processConstraintTitleWeakBridged: normalizeText(context.standardWorkSource) === 'title_weak_fallback',
          processConstraintTitleWeakScore: context.titleWeakScore ?? null,
          processConstraintTitleWeakRuleId: normalizeText(context.titleWeakRuleId) || null,
        },
        score,
        index,
      }
    })
    .filter(Boolean) as Array<{ record: ResolvedAlgorithmSeedRecord; score: number; index: number }>

  scored.sort((a, b) => b.score - a.score || a.index - b.index)
  return scored[0]?.record ?? null
}

function buildEmptyBuildingPatternMatch(): V1474BuildingPatternMatch {
  return {
    record: null,
    patternCode: null,
    matchScore: 0,
    confidenceScore: 0,
    confidenceLevel: 'low',
    matchedSignals: [],
    missingSignals: [],
    actionPolicy: 'candidate_only',
  }
}

function readBuildingPatternCode(record: AlgorithmSeedRecordPayload) {
  return normalizeText(record.patternCode ?? record.pattern_code ?? (record as any).__stableCode)
}

function readBuildingPatternConflictGroup(record: AlgorithmSeedRecordPayload) {
  return normalizeText(record.conflictGroup ?? record.conflict_group).toLowerCase()
}

function readBuildingPatternCoexistGroups(record: AlgorithmSeedRecordPayload) {
  return normalizeTextArray(record.coexistsWithGroups ?? record.coexists_with_groups).map((item) => item.toLowerCase())
}

function readBuildingPatternPriority(record: AlgorithmSeedRecordPayload) {
  return normalizeNumber(record.patternPriority ?? record.pattern_priority) ?? 0
}

function readBuildingPatternHardDeadlinePriority(record: AlgorithmSeedRecordPayload) {
  const policy = readRecord(record.hardDeadlinePolicy ?? record.hard_deadline_policy)
  const explicit = normalizeNumber(policy.hardDeadlinePriority ?? policy.hard_deadline_priority)
  if (explicit !== null) return explicit
  const code = readBuildingPatternCode(record)
  const source = [
    code,
    record.patternName,
    record.pattern_name,
    normalizeTextArray(record.applicableKeywords ?? record.applicable_keywords).join(' '),
    normalizeTextArray(record.applicableMethodCodes ?? record.applicable_method_codes).join(' '),
    normalizeTextArray(record.elementVariantCodes ?? record.element_variant_codes).join(' '),
  ].map(normalizeText).join(' ').toLowerCase()
  if (/\b(hard[_ -]?date|deadline|opening_deadline|term_handover|school opening|september 1|christmas|shopping festival)\b/.test(source)) return 60
  return 0
}

function activeBuildingPatternHardDeadlinePriority(record: AlgorithmSeedRecordPayload, text: string, context: AlgorithmSeedResolveContext = {}) {
  const recordPriority = readBuildingPatternHardDeadlinePriority(record)
  if (recordPriority <= 0) return 0
  const source = [
    text,
    ...(context.methodVariantCodes ?? []),
    ...(context.elementVariantCodes ?? []),
    ...(context.contextKeywords ?? []),
  ].map(normalizeText).join(' ').toLowerCase()
  return /\b(hard[_ -]?date|deadline|opening_deadline|term_handover|school[_ -]?term|school opening|september 1|christmas|shopping festival|formal opening)\b/.test(source)
    ? recordPriority
    : 0
}

function readBuildingPatternPhaseWindow(record: AlgorithmSeedRecordPayload) {
  return normalizeText(record.phaseWindow ?? record.phase_window).toLowerCase()
}

function readBuildingPatternDurationCurveProfile(record: AlgorithmSeedRecordPayload | null | undefined) {
  if (!record) return {}
  return readRecord(record.durationCurveProfile ?? record.duration_curve_profile)
}

const BUILDING_PATTERN_PHASE_SEQUENCE_ORDER: Record<string, number> = {
  factory: 0,
  foundation: 10,
  basement: 20,
  superstructure: 30,
  envelope: 40,
  mep: 50,
  decoration: 60,
  outdoor: 65,
  commissioning: 70,
  renovation: 75,
  trial_operation: 80,
  handover: 90,
  opening: 95,
}

const BUILDING_PATTERN_WORKFACE_FAMILIES: Record<string, string[]> = {
  single_building_vertical_flow: ['single_building', 'vertical', 'floor'],
  multi_building_parallel_flow: ['multi_building', 'parallel', 'building'],
  prefabricated_concrete_floor_cycle: ['prefab', 'floor', 'concrete', 'site'],
  prefabricated_factory_coordination_flow: ['prefab', 'factory', 'coordination'],
  high_rise_core_and_floor_cycle: ['cast_in_place', 'floor', 'concrete', 'core'],
  steel_structure_bay_zone_flow: ['steel', 'structure', 'bay'],
  large_span_public_steel_integration_flow: ['steel', 'large_span', 'public'],
  public_tensile_membrane_roof_flow: ['membrane', 'large_span', 'public'],
  public_large_space_hvac_energy_flow: ['large_space_hvac', 'public', 'energy'],
  public_venue_intelligent_system_flow: ['venue_intelligent', 'public', 'system'],
  public_transfer_vip_finish_flow: ['transfer_floor', 'vip_finish', 'public'],
  public_green_building_energy_certification_flow: ['green_certification', 'public', 'energy'],
  public_special_acceptance_load_operation_flow: ['special_acceptance', 'load_test', 'public'],
  basement_podium_tower_sequence: ['basement', 'podium', 'interface'],
  foundation_pit_to_foundation_sequence: ['foundation', 'pit', 'section'],
  roof_and_facade_weather_window_flow: ['envelope', 'weather', 'facade'],
  mep_system_zone_commissioning: ['mep', 'system', 'commissioning'],
  fine_decoration_floor_zone_flow: ['decoration', 'fitout', 'floor'],
  large_public_building_system_integration_flow: ['public', 'system', 'integration'],
  outdoor_utility_to_landscape_handover_flow: ['outdoor', 'utility', 'landscape'],
  hospital_medical_cleanroom_integration_flow: ['hospital', 'cleanroom', 'clinical'],
  hospital_cleanroom_grade_control_flow: ['hospital', 'cleanroom_grade', 'clinical'],
  hospital_radiation_shielding_flow: ['hospital', 'radiation_shielding', 'clinical'],
  hospital_linear_accelerator_neutron_maze_flow: ['hospital', 'linac_neutron', 'clinical'],
  hospital_medical_gas_source_terminal_flow: ['hospital', 'medical_gas', 'clinical'],
  hospital_clinical_information_system_flow: ['hospital', 'clinical_information', 'clinical'],
  hospital_infection_control_negative_pressure_flow: ['hospital', 'infection_control', 'clinical'],
  hospital_special_room_process_flow: ['hospital', 'special_room', 'clinical'],
  hospital_medical_wastewater_waste_flow: ['hospital', 'medical_waste', 'clinical'],
  hospital_helipad_airworthiness_flow: ['hospital', 'helipad', 'clinical'],
  data_center_room_commissioning_flow: ['data_center', 'room', 'commissioning'],
  data_center_power_redundancy_flow: ['data_center', 'power_redundancy', 'commissioning'],
  data_center_generator_black_start_flow: ['data_center', 'generator_black_start', 'commissioning'],
  data_center_chilled_water_free_cooling_flow: ['data_center', 'free_cooling', 'commissioning'],
  data_center_airflow_cooling_flow: ['data_center', 'airflow_cooling', 'commissioning'],
  data_center_fire_suppression_early_warning_flow: ['data_center', 'fire_suppression', 'commissioning'],
  data_center_certification_security_acceptance_flow: ['data_center', 'certification', 'handover'],
  industrial_cleanroom_validation_flow: ['industrial_cleanroom', 'validation', 'process_utility'],
  industrial_cleanroom_grade_precision_flow: ['industrial_cleanroom', 'grade_precision', 'process_utility'],
  semiconductor_process_utility_piping_flow: ['industrial_cleanroom', 'semiconductor_utility', 'process_utility'],
  renovation_heritage_protection_flow: ['renovation', 'protection', 'workface'],
  campus_term_handover_flow: ['campus', 'term', 'handover'],
  tod_upper_cover_interface_flow: ['tod', 'transfer_deck', 'interface'],
  tod_metro_operation_protection_flow: ['tod', 'metro_operation', 'interface'],
  tod_multi_owner_interface_handover_flow: ['tod', 'multi_owner', 'handover'],
  tod_hard_date_opening_constraint_flow: ['tod', 'hard_date', 'handover'],
  tod_rail_podium_interface_foundation_flow: ['tod', 'rail_podium', 'interface'],
  tod_multi_asset_zone_handover_flow: ['tod', 'multi_asset', 'handover'],
  tod_podium_special_facility_readiness_flow: ['tod', 'podium_facility', 'handover'],
  mic_module_factory_site_flow: ['mic', 'module', 'factory'],
  heritage_preservation_micro_workface_flow: ['heritage', 'micro_workface', 'protection'],
  heritage_craft_subprocess_flow: ['heritage', 'craft_subprocess', 'protection'],
  heritage_traditional_material_supply_flow: ['heritage', 'material_supply', 'protection'],
  heritage_authority_hold_point_flow: ['heritage', 'authority_hold_point', 'protection'],
  heritage_newbuild_interface_monitoring_flow: ['heritage', 'newbuild_interface', 'protection'],
  heritage_scaffold_protection_shed_flow: ['heritage', 'scaffold_protection', 'protection'],
  industrial_logistics_warehouse_commissioning_flow: ['logistics', 'warehouse', 'commissioning'],
  industrial_logistics_asrs_cold_chain_flow: ['logistics', 'asrs_cold_chain', 'commissioning'],
  hotel_room_public_area_opening_flow: ['hotel', 'room', 'opening'],
  residential_owner_delivery_flow: ['residential', 'owner_delivery', 'handover'],
  commercial_office_opening_readiness_flow: ['commercial', 'tenant', 'opening'],
  generic_construction_management_coordination_flow: ['management', 'coordination', 'workface'],
}

const BUILDING_PATTERN_BROAD_WORKFACE_FAMILY_TAGS = new Set([
  'building',
  'concrete',
  'floor',
  'public',
  'site',
  'steel',
  'structure',
  'workface',
])

const BUILDING_PATTERN_DOMAIN_TIE_BREAK_SCORE: Record<string, number> = {
  hospital_cleanroom_grade_control_flow: 1420,
  hospital_radiation_shielding_flow: 1410,
  hospital_linear_accelerator_neutron_maze_flow: 1400,
  hospital_medical_gas_source_terminal_flow: 1390,
  hospital_clinical_information_system_flow: 1380,
  hospital_infection_control_negative_pressure_flow: 1370,
  hospital_special_room_process_flow: 1360,
  hospital_medical_wastewater_waste_flow: 1350,
  hospital_helipad_airworthiness_flow: 1340,
  data_center_power_redundancy_flow: 1330,
  data_center_generator_black_start_flow: 1320,
  data_center_chilled_water_free_cooling_flow: 1310,
  data_center_airflow_cooling_flow: 1300,
  industrial_cleanroom_grade_precision_flow: 1290,
  semiconductor_process_utility_piping_flow: 1280,
  industrial_logistics_asrs_cold_chain_flow: 1270,
  data_center_fire_suppression_early_warning_flow: 1260,
  data_center_certification_security_acceptance_flow: 1250,
  public_tensile_membrane_roof_flow: 1240,
  public_large_space_hvac_energy_flow: 1230,
  public_venue_intelligent_system_flow: 1220,
  public_transfer_vip_finish_flow: 1210,
  public_green_building_energy_certification_flow: 1200,
  public_special_acceptance_load_operation_flow: 1190,
  heritage_craft_subprocess_flow: 1180,
  heritage_traditional_material_supply_flow: 1170,
  heritage_authority_hold_point_flow: 1160,
  heritage_newbuild_interface_monitoring_flow: 1150,
  heritage_scaffold_protection_shed_flow: 1140,
  tod_metro_operation_protection_flow: 1130,
  tod_multi_owner_interface_handover_flow: 1120,
  tod_hard_date_opening_constraint_flow: 1110,
  tod_rail_podium_interface_foundation_flow: 1100,
  tod_multi_asset_zone_handover_flow: 1090,
  tod_podium_special_facility_readiness_flow: 1080,
  prefabricated_concrete_floor_cycle: 980,
  mic_module_factory_site_flow: 970,
  prefabricated_factory_coordination_flow: 960,
  large_span_public_steel_integration_flow: 940,
  renovation_heritage_protection_flow: 930,
  foundation_pit_to_foundation_sequence: 920,
  basement_podium_tower_sequence: 910,
  high_rise_core_and_floor_cycle: 900,
  steel_structure_bay_zone_flow: 890,
  mep_system_zone_commissioning: 880,
  roof_and_facade_weather_window_flow: 870,
  fine_decoration_floor_zone_flow: 860,
  outdoor_utility_to_landscape_handover_flow: 850,
  large_public_building_system_integration_flow: 840,
  multi_building_parallel_flow: 830,
  single_building_vertical_flow: 820,
  hospital_medical_cleanroom_integration_flow: 810,
  data_center_room_commissioning_flow: 800,
  industrial_cleanroom_validation_flow: 790,
  tod_upper_cover_interface_flow: 780,
  heritage_preservation_micro_workface_flow: 770,
  industrial_logistics_warehouse_commissioning_flow: 760,
  hotel_room_public_area_opening_flow: 750,
  residential_owner_delivery_flow: 740,
  commercial_office_opening_readiness_flow: 730,
  campus_term_handover_flow: 720,
}

function buildingPatternDomainTieBreakScore(record: AlgorithmSeedRecordPayload) {
  const code = readBuildingPatternCode(record)
  if (BUILDING_PATTERN_DOMAIN_TIE_BREAK_SCORE[code] !== undefined) {
    return BUILDING_PATTERN_DOMAIN_TIE_BREAK_SCORE[code]
  }
  return Array.from(code).reduce((total, char) => total + char.charCodeAt(0), 0) / 10_000
}

function readBuildingPatternParentCode(record: AlgorithmSeedRecordPayload) {
  return normalizeText(record.parentPatternCode ?? record.parent_pattern_code)
}

function isDetailedBuildingPattern(record: AlgorithmSeedRecordPayload) {
  return Boolean(normalizeText(record.detailedGapCode ?? record.detailed_gap_code))
}

function buildingPatternCanonicalCode(record: AlgorithmSeedRecordPayload) {
  return readBuildingPatternParentCode(record) || readBuildingPatternCode(record)
}

function buildingPatternSpecificityTieBreakScore(record: AlgorithmSeedRecordPayload) {
  return (
    normalizeTextArray(record.applicableStandardWorkCodes ?? record.applicable_standard_work_codes).length * 6
    + normalizeTextArray(record.standardCatalogCodePrefixes ?? record.standard_catalog_code_prefixes).length * 5
    + normalizeTextArray(record.templateNodeStableCodePrefixes ?? record.template_node_stable_code_prefixes).length * 4
    + normalizeTextArray(record.applicableMethodCodes ?? record.applicable_method_codes).length * 3
    + normalizeTextArray(record.elementVariantCodes ?? record.element_variant_codes).length * 3
    + normalizeTextArray(record.requiredScopeDimensions ?? record.required_scope_dimensions).length * 2
    + normalizeTextArray(record.rhythmDrivers ?? record.rhythm_drivers).length
    + buildingPatternDomainTieBreakScore(record)
  )
}

function compareV1474BuildingPatternCandidates(left: V1474BuildingPatternCandidate, right: V1474BuildingPatternCandidate) {
  return (
    right.hardDeadlinePriority - left.hardDeadlinePriority
    || right.score - left.score
    || readBuildingPatternPriority(right.record) - readBuildingPatternPriority(left.record)
    || right.confidenceScore - left.confidenceScore
    || buildingPatternSpecificityTieBreakScore(right.record) - buildingPatternSpecificityTieBreakScore(left.record)
    || resolverSourceScore(right.record) - resolverSourceScore(left.record)
    || readBuildingPatternCode(left.record).localeCompare(readBuildingPatternCode(right.record))
  )
}

function isPhaseSequenceCompatible(left: AlgorithmSeedRecordPayload, right: AlgorithmSeedRecordPayload, text: string, context: AlgorithmSeedResolveContext = {}) {
  const leftCode = readBuildingPatternCode(left)
  const rightCode = readBuildingPatternCode(right)
  const leftPhase = readBuildingPatternPhaseWindow(left)
  const rightPhase = readBuildingPatternPhaseWindow(right)
  const leftFamilies = BUILDING_PATTERN_WORKFACE_FAMILIES[leftCode] ?? []
  const rightFamilies = BUILDING_PATTERN_WORKFACE_FAMILIES[rightCode] ?? []
  const leftSpecificFamilies = leftFamilies.filter((family) => !BUILDING_PATTERN_BROAD_WORKFACE_FAMILY_TAGS.has(family))
  const rightSpecificFamilies = rightFamilies.filter((family) => !BUILDING_PATTERN_BROAD_WORKFACE_FAMILY_TAGS.has(family))
  const samePhaseDifferentWorkfaceFamily = leftPhase
    && rightPhase
    && leftPhase === rightPhase
    && leftCode !== rightCode
    && leftSpecificFamilies.length > 0
    && rightSpecificFamilies.length > 0
    && !leftSpecificFamilies.some((family) => rightSpecificFamilies.includes(family))
  if (samePhaseDifferentWorkfaceFamily) return true
  const leftOrder = BUILDING_PATTERN_PHASE_SEQUENCE_ORDER[leftPhase]
  const rightOrder = BUILDING_PATTERN_PHASE_SEQUENCE_ORDER[rightPhase]
  if (!Number.isFinite(leftOrder) || !Number.isFinite(rightOrder)) return false
  if (leftOrder === rightOrder) return false
  return true
}

function isHandoverSequenceCompatible(left: AlgorithmSeedRecordPayload, right: AlgorithmSeedRecordPayload, text: string, context: AlgorithmSeedResolveContext = {}) {
  const leftCode = readBuildingPatternCode(left)
  const rightCode = readBuildingPatternCode(right)
  if (!leftCode || !rightCode || leftCode === rightCode) return false
  if (activeBuildingPatternHardDeadlinePriority(left, text, context) > 0 || activeBuildingPatternHardDeadlinePriority(right, text, context) > 0) return true
  const leftFamilies = BUILDING_PATTERN_WORKFACE_FAMILIES[leftCode] ?? []
  const rightFamilies = BUILDING_PATTERN_WORKFACE_FAMILIES[rightCode] ?? []
  const leftSpecificFamilies = leftFamilies.filter((family) => !BUILDING_PATTERN_BROAD_WORKFACE_FAMILY_TAGS.has(family))
  const rightSpecificFamilies = rightFamilies.filter((family) => !BUILDING_PATTERN_BROAD_WORKFACE_FAMILY_TAGS.has(family))
  if (leftSpecificFamilies.length > 0 && rightSpecificFamilies.length > 0 && !leftSpecificFamilies.some((family) => rightSpecificFamilies.includes(family))) return true
  const contextDimensions = normalizeTextArray(context.scopeDimensions).map((item) => item.toLowerCase())
  return contextDimensions.includes('building') && contextDimensions.includes('zone') && /handover|opening|owner|deadline|交付|移交/.test(text.toLowerCase())
}

function normalizeBuildingPatternWeights(candidates: V1474BuildingPatternCandidate[]) {
  const rawWeights = candidates.map((candidate) => {
    const priorityBoost = 1 + (readBuildingPatternPriority(candidate.record) / 200)
    const confidenceBoost = 0.5 + Math.max(0, candidate.confidenceScore) / 100
    return Math.max(1, candidate.score) * priorityBoost * confidenceBoost
  })
  const total = rawWeights.reduce((sum, value) => sum + value, 0) || 1
  return rawWeights.map((value) => Number((value / total).toFixed(4)))
}

function chooseWeightedCategory<T extends string>(
  contributions: Array<{ profile: Record<string, unknown>; weight: number }>,
  key: string,
  conservativeOrder: T[],
): T | null {
  const scores = new Map<T, number>()
  for (const { profile, weight } of contributions) {
    const value = normalizeText(profile[key])
    if (!value) continue
    scores.set(value as T, (scores.get(value as T) ?? 0) + weight)
  }
  if (scores.size === 0) return null
  return [...scores.entries()]
    .sort((left, right) => (
      right[1] - left[1]
      || conservativeOrder.indexOf(left[0]) - conservativeOrder.indexOf(right[0])
      || left[0].localeCompare(right[0])
    ))[0]?.[0] ?? null
}

function buildMergedDurationCurveProfile(candidates: V1474BuildingPatternCandidate[], weights: number[]) {
  const contributions = candidates
    .map((candidate, index) => ({
      patternCode: readBuildingPatternCode(candidate.record) || null,
      weight: weights[index] ?? 0,
      profile: readBuildingPatternDurationCurveProfile(candidate.record),
    }))
    .filter((item) => Object.keys(item.profile).length > 0)

  if (contributions.length === 0) return {}
  const primary = contributions[0]?.profile ?? {}
  const calibrationPriority = contributions.reduce((sum, item) => {
    const value = normalizeNumber(item.profile.calibrationPriority ?? item.profile.calibration_priority) ?? 0
    return sum + value * item.weight
  }, 0)
  const firstUnitBias = chooseWeightedCategory(contributions, 'firstUnitBias', ['higher', 'normal'])
    ?? chooseWeightedCategory(contributions, 'first_unit_bias', ['higher', 'normal'])
  const middleUnitBias = chooseWeightedCategory(contributions, 'middleUnitBias', ['variable', 'stable'])
    ?? chooseWeightedCategory(contributions, 'middle_unit_bias', ['variable', 'stable'])
  const tailUnitBias = chooseWeightedCategory(contributions, 'tailUnitBias', ['higher', 'normal'])
    ?? chooseWeightedCategory(contributions, 'tail_unit_bias', ['higher', 'normal'])
  const resourceSensitivity = chooseWeightedCategory(contributions, 'resourceSensitivity', ['high', 'medium', 'low'])
    ?? chooseWeightedCategory(contributions, 'resource_sensitivity', ['high', 'medium', 'low'])
  const readinessSensitivity = chooseWeightedCategory(contributions, 'readinessSensitivity', ['high', 'medium', 'low'])
    ?? chooseWeightedCategory(contributions, 'readiness_sensitivity', ['high', 'medium', 'low'])

  return {
    curveCode: `merged_${contributions.map((item) => item.patternCode).filter(Boolean).slice(0, 4).join('_')}`,
    positionBasis: normalizeText(primary.positionBasis ?? primary.position_basis) || 'project',
    firstUnitBias: firstUnitBias ?? 'normal',
    middleUnitBias: middleUnitBias ?? 'stable',
    tailUnitBias: tailUnitBias ?? 'normal',
    resourceSensitivity: resourceSensitivity ?? 'medium',
    readinessSensitivity: readinessSensitivity ?? 'medium',
    calibrationPriority: Math.max(1, Math.min(10, Math.round(calibrationPriority || 1))),
    source: 'top_n_weighted_building_pattern_merge',
  }
}

function buildDurationProfileContributions(candidates: V1474BuildingPatternCandidate[], weights: number[]) {
  return candidates
    .map((candidate, index) => ({
      patternCode: readBuildingPatternCode(candidate.record) || null,
      weight: weights[index] ?? 0,
      durationCurveProfile: readBuildingPatternDurationCurveProfile(candidate.record),
    }))
    .filter((item) => Object.keys(item.durationCurveProfile).length > 0)
}

function readTypicalCycleDaysByMethod(record: AlgorithmSeedRecordPayload) {
  return readRecord(record.typicalCycleDaysByMethod ?? record.typical_cycle_days_by_method)
}

function readCycleDays(value: unknown) {
  const record = readRecord(value)
  const firstFloor = normalizeNumber(record.firstFloor ?? record.first_floor ?? record.first)
  const midFloors = normalizeNumber(record.midFloors ?? record.mid_floors ?? record.middleFloors ?? record.middle_floors ?? record.middle ?? record.standard)
  const lastFloors = normalizeNumber(record.lastFloors ?? record.last_floors ?? record.lastFloor ?? record.last_floor ?? record.last)
  if (!firstFloor || !midFloors || !lastFloors) return null
  return { firstFloor, midFloors, lastFloors }
}

function chooseTypicalCycleMethod(record: AlgorithmSeedRecordPayload, context: AlgorithmSeedResolveContext = {}) {
  const curves = readTypicalCycleDaysByMethod(record)
  const methods = expandMethodVariantCodes(context.methodVariantCodes)
  const method = methods.find((item) => readCycleDays(curves[item]))
    ?? (methods.some((item) => item.includes('prefab')) && readCycleDays(curves.prefab) ? 'prefab' : null)
    ?? (readCycleDays(curves.default) ? 'default' : null)
  return method
}

function buildTypicalCycleDayContributions(candidates: V1474BuildingPatternCandidate[], weights: number[], context: AlgorithmSeedResolveContext = {}) {
  return candidates
    .map((candidate, index) => {
      const curves = readTypicalCycleDaysByMethod(candidate.record)
      const methodCode = chooseTypicalCycleMethod(candidate.record, context)
      const cycleDays = methodCode ? readCycleDays(curves[methodCode]) : null
      if (!cycleDays) return null
      return {
        patternCode: readBuildingPatternCode(candidate.record) || null,
        methodCode,
        weight: weights[index] ?? 0,
        cycleDays,
      }
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
}

function buildWeightedTypicalCycleDays(contributions: ReturnType<typeof buildTypicalCycleDayContributions>) {
  const totalWeight = contributions.reduce((sum, item) => sum + item.weight, 0)
  if (totalWeight <= 0) return null
  const weighted = contributions.reduce((result, item) => {
    result.firstFloor += item.cycleDays.firstFloor * item.weight
    result.midFloors += item.cycleDays.midFloors * item.weight
    result.lastFloors += item.cycleDays.lastFloors * item.weight
    return result
  }, { firstFloor: 0, midFloors: 0, lastFloors: 0 })
  return {
    firstFloor: Number((weighted.firstFloor / totalWeight).toFixed(2)),
    midFloors: Number((weighted.midFloors / totalWeight).toFixed(2)),
    lastFloors: Number((weighted.lastFloors / totalWeight).toFixed(2)),
  }
}

function readBuildingPatternStaggerRules(record: AlgorithmSeedRecordPayload) {
  const patternCode = readBuildingPatternCode(record) || null
  const hardDeadlinePriority = readBuildingPatternHardDeadlinePriority(record)
  const patternPriority = readBuildingPatternPriority(record)
  const rules = Array.isArray(record.staggerRules ?? record.stagger_rules)
    ? (record.staggerRules ?? record.stagger_rules) as unknown[]
    : []
  return rules
    .map((value) => {
      const rule = readRecord(value)
      const ruleCode = normalizeText(rule.ruleCode ?? rule.rule_code)
      if (!ruleCode) return null
      return {
        ruleCode,
        predecessor: normalizeText(rule.predecessor),
        successor: normalizeText(rule.successor),
        lagUnit: normalizeText(rule.lagUnit ?? rule.lag_unit) || 'day',
        lagValue: normalizeNumber(rule.lagValue ?? rule.lag_value) ?? 0,
        relation: normalizeText(rule.relation) || 'candidate',
        sourcePatternCode: patternCode,
        priority: hardDeadlinePriority * 10 + patternPriority,
      }
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
}

function buildStaggerRuleContributions(candidates: V1474BuildingPatternCandidate[], weights: number[]) {
  return candidates
    .map((candidate, index) => {
      const rules = readBuildingPatternStaggerRules(candidate.record)
      if (rules.length === 0) return null
      return {
        patternCode: buildingPatternCanonicalCode(candidate.record) || null,
        weight: weights[index] ?? 0,
        hardDeadlinePriority: readBuildingPatternHardDeadlinePriority(candidate.record),
        staggerRules: rules.map((rule) => ({
          ruleCode: rule.ruleCode,
          predecessor: rule.predecessor,
          successor: rule.successor,
          lagUnit: rule.lagUnit,
          lagValue: rule.lagValue,
          relation: rule.relation,
          priority: rule.priority,
        })),
      }
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
}

function buildMergedStaggerRules(contributions: ReturnType<typeof buildStaggerRuleContributions>) {
  const byCode = new Map<string, ReturnType<typeof readBuildingPatternStaggerRules>[number]>()
  for (const contribution of contributions) {
    for (const rule of contribution.staggerRules) {
      const key = rule.ruleCode.toLowerCase()
      const candidate = {
        ...rule,
        sourcePatternCode: contribution.patternCode,
      }
      const existing = byCode.get(key)
      if (!existing || candidate.priority > existing.priority || (
        candidate.priority === existing.priority
        && String(candidate.sourcePatternCode ?? '').localeCompare(String(existing.sourcePatternCode ?? '')) < 0
      )) {
        byCode.set(key, candidate)
      }
    }
  }
  return [...byCode.values()]
    .sort((left, right) => (
      right.priority - left.priority
      || left.ruleCode.localeCompare(right.ruleCode)
      || String(left.sourcePatternCode ?? '').localeCompare(String(right.sourcePatternCode ?? ''))
    ))
    .slice(0, 8)
}

function buildingPatternCandidatesToMatches(candidates: V1474BuildingPatternCandidate[], context: AlgorithmSeedResolveContext = {}) {
  const weights = normalizeBuildingPatternWeights(candidates)
  const mergedPatternCodes = candidates.map((candidate) => readBuildingPatternCode(candidate.record)).filter(Boolean)
  const mergedDurationCurveProfile = buildMergedDurationCurveProfile(candidates, weights)
  const durationProfileContributions = buildDurationProfileContributions(candidates, weights)
  const typicalCycleDayContributions = buildTypicalCycleDayContributions(candidates, weights, context)
  const weightedTypicalCycleDays = buildWeightedTypicalCycleDays(typicalCycleDayContributions)
  const staggerRuleContributions = buildStaggerRuleContributions(candidates, weights)
  const mergedStaggerRules = buildMergedStaggerRules(staggerRuleContributions)
  const hardDeadlinePriority = candidates.reduce((max, candidate) => Math.max(max, candidate.hardDeadlinePriority), 0)
  return candidates.map((candidate, index) => buildingPatternCandidateToMatch(candidate, {
    matchWeight: weights[index] ?? 0,
    mergedPatternCodes,
    mergedDurationCurveProfile,
    durationProfileContributions,
    typicalCycleDayContributions,
    weightedTypicalCycleDays,
    staggerRuleContributions,
    mergedStaggerRules,
    staggerMergePolicy: 'dedupe_by_rule_code_then_hard_deadline_priority',
    hardDeadlinePriority,
    secondaryMatches: candidates
      .filter((_, candidateIndex) => candidateIndex !== index)
      .map((secondary, secondaryIndex) => {
        const originalIndex = candidates.indexOf(secondary)
        return {
          patternCode: readBuildingPatternCode(secondary.record) || null,
          matchScore: secondary.score,
          matchWeight: weights[originalIndex] ?? weights[secondaryIndex] ?? 0,
          confidenceScore: secondary.confidenceScore,
          confidenceLevel: buildingPatternConfidenceLevel(secondary.confidenceScore),
        }
      }),
  }))
}

function buildingPatternCandidatesCompatible(
  selected: V1474BuildingPatternCandidate,
  candidate: V1474BuildingPatternCandidate,
  text: string,
  context: AlgorithmSeedResolveContext = {},
) {
  const selectedGroup = readBuildingPatternConflictGroup(selected.record)
  const candidateGroup = readBuildingPatternConflictGroup(candidate.record)
  if (!selectedGroup || !candidateGroup) return false
  if (selectedGroup === 'supporting_signal' || candidateGroup === 'supporting_signal') return true
  if (selectedGroup === candidateGroup) {
    if (selectedGroup === 'phase_rhythm') return isPhaseSequenceCompatible(selected.record, candidate.record, text, context)
    if (selectedGroup === 'handover_opening') return isHandoverSequenceCompatible(selected.record, candidate.record, text, context)
    return false
  }
  return (
    readBuildingPatternCoexistGroups(selected.record).includes(candidateGroup)
    && readBuildingPatternCoexistGroups(candidate.record).includes(selectedGroup)
  )
}

function buildingPatternCandidateToMatch(
  candidate: V1474BuildingPatternCandidate | null | undefined,
  mergeContext: Partial<Pick<
    V1474BuildingPatternMatch,
    'matchWeight' | 'mergedPatternCodes' | 'secondaryMatches' | 'mergedDurationCurveProfile' | 'durationProfileContributions' | 'typicalCycleDayContributions' | 'weightedTypicalCycleDays' | 'hardDeadlinePriority' | 'staggerMergePolicy' | 'mergedStaggerRules' | 'staggerRuleContributions'
  >> = {},
): V1474BuildingPatternMatch {
  if (!candidate) return buildEmptyBuildingPatternMatch()
  const confidenceLevel = buildingPatternConfidenceLevel(candidate.confidenceScore)
  const matchedSignals = candidate.hardDeadlinePriority > 0
    ? [...new Set([...candidate.matchedSignals, 'hard_deadline_priority'])]
    : candidate.matchedSignals
  return {
    record: candidate.record,
    patternCode: readBuildingPatternCode(candidate.record) || null,
    matchScore: candidate.score,
    matchWeight: mergeContext.matchWeight,
    confidenceScore: candidate.confidenceScore,
    confidenceLevel,
    matchedSignals,
    missingSignals: candidate.missingSignals,
    actionPolicy: buildingPatternActionPolicy(confidenceLevel),
    mergedPatternCodes: mergeContext.mergedPatternCodes,
    secondaryMatches: mergeContext.secondaryMatches,
    mergedDurationCurveProfile: mergeContext.mergedDurationCurveProfile,
    durationProfileContributions: mergeContext.durationProfileContributions,
    typicalCycleDayContributions: mergeContext.typicalCycleDayContributions,
    weightedTypicalCycleDays: mergeContext.weightedTypicalCycleDays,
    hardDeadlinePriority: mergeContext.hardDeadlinePriority,
    staggerMergePolicy: mergeContext.staggerMergePolicy,
    mergedStaggerRules: mergeContext.mergedStaggerRules,
    staggerRuleContributions: mergeContext.staggerRuleContributions,
  }
}

async function resolveV1474BuildingPatternCandidates(text: string, context: AlgorithmSeedResolveContext = {}): Promise<V1474BuildingPatternCandidate[]> {
  const enrichedContext = await enrichBuildingPatternContextFromTitle(text, context)
  const records = await resolveAlgorithmSeedRecords('building_pattern', enrichedContext)
  const normalizedText = normalizeText(text)
  const eligibleRecords = normalizeText(text)
    ? records.filter((item) => !hasNegativeKeywordMatch(item, text) && !hasBuildingPatternExclusionSignal(item, text, enrichedContext))
    : records
  const scored = eligibleRecords
    .map((record, index) => {
      let score = 0
      const standardMatchScore = standardWorkCodeMatchScore(record, enrichedContext)
      const templateMatched = hasTemplateNodeMatch(record, enrichedContext)
      const keywordMatched = normalizedText
        ? hasAnyKeywordMatch(record.applicableKeywords, normalizedText)
        : false
      const contextBreakdown = buildingPatternContextSignalBreakdown(record, enrichedContext)
      const contextScore = contextBreakdown.score
      const featureBreakdown = buildingPatternFeatureSignalBreakdown(record, enrichedContext)
      const specificityBreakdown = buildingPatternSpecificitySignalBreakdown(record, enrichedContext)

      if (standardMatchScore > 0) score += standardMatchScore
      score += standardWorkCodeSpecificityScore(record, enrichedContext)
      if (templateMatched) score += 80
      if (keywordMatched) score += 20
      score += contextScore
      score += featureBreakdown.score
      score += specificityBreakdown.score
      if (standardMatchScore <= 0 && !templateMatched && !keywordMatched && contextScore <= 0 && featureBreakdown.score <= 0) return null
      if (
        isDetailedBuildingPattern(record)
        && standardMatchScore <= 0
        && !templateMatched
        && !keywordMatched
        && featureBreakdown.matched === 0
      ) {
        return null
      }

      const methodMatchScore = methodScore(record, enrichedContext)
      const elementMatchScore = elementVariantScore(record, enrichedContext)
      const projectTypeMatchScore = projectTypeScore(record, enrichedContext)
      const structureTypeMatchScore = structureTypeScore(record, enrichedContext)
      score += methodMatchScore
      score += elementMatchScore
      score += projectTypeMatchScore
      score += structureTypeMatchScore
      score += confidenceScore(record)
      score += resolverSourceScore(record)
      const confidence = computeBuildingPatternConfidence({
        record,
        standardMatchScore,
        templateMatched,
        keywordMatched,
        contextSignals: contextBreakdown.matchedSignals,
        featureSignals: featureBreakdown.matchedSignals,
        methodMatchScore,
        elementMatchScore,
        projectTypeMatchScore,
        structureTypeMatchScore,
        featureProfileProvided: featureBreakdown.provided,
        featureProfileMatched: featureBreakdown.matched,
        featureProfileConflicts: featureBreakdown.conflicts,
        specificitySignals: specificityBreakdown.matchedSignals,
        specificityScore: specificityBreakdown.score,
      })
      return {
        record,
        score,
        index,
        confidenceScore: confidence.confidenceScore,
        hardDeadlinePriority: activeBuildingPatternHardDeadlinePriority(record, normalizedText, enrichedContext),
        matchedSignals: confidence.matchedSignals,
        missingSignals: [...new Set([
          ...contextBreakdown.missingSignals,
          ...featureBreakdown.missingSignals,
          ...specificityBreakdown.missingSignals,
        ])],
      }
    })
    .filter((item): item is V1474BuildingPatternCandidate => Boolean(item))

  scored.sort(compareV1474BuildingPatternCandidates)
  return scored
}

export async function resolveV1474BuildingPatternMatches(
  text: string,
  context: AlgorithmSeedResolveContext = {},
  options: { limit?: number } = {},
): Promise<V1474BuildingPatternMatches> {
  const limit = Math.max(1, Math.min(12, Number(options.limit ?? 8) || 8))
  const candidates = await resolveV1474BuildingPatternCandidates(text, context)
  if (candidates.length === 0) return []
  const selected: V1474BuildingPatternCandidate[] = []
  for (const candidate of candidates) {
    if (selected.some((item) => readBuildingPatternCode(item.record) === readBuildingPatternCode(candidate.record))) continue
    if (selected.length === 0 || selected.every((item) => buildingPatternCandidatesCompatible(item, candidate, text, context))) {
      selected.push(candidate)
    }
    if (selected.length >= limit) break
  }
  return buildingPatternCandidatesToMatches(selected, context)
}

export async function resolveV1474BuildingPatternMatch(text: string, context: AlgorithmSeedResolveContext = {}): Promise<V1474BuildingPatternMatch> {
  const matches = await resolveV1474BuildingPatternMatches(text, context, { limit: 6 })
  return matches[0] ?? buildEmptyBuildingPatternMatch()
}

export async function resolveV1474BuildingPattern(text: string, context: AlgorithmSeedResolveContext = {}) {
  const match = await resolveV1474BuildingPatternMatch(text, context)
  return match.record
}

export async function resolveV1474ResourceClass(text: string, context: AlgorithmSeedResolveContext = {}) {
  const records = await resolveAlgorithmSeedRecords('resource_class', context)
  const normalized = normalizeText(text).toLowerCase()
  if (!normalized && readContextStandardWorkCodes(context).length === 0 && !normalizeText(context.templateNodeId)) return null
  return applyResourceOperationMatch(bestSeedMatch(records, normalized, context, hasKeywordMatch), normalized, context)
    ?? buildResourceClassStaticFallbackRecord(normalized, context)
}

export async function resolveV1474WorkflowDictionary(text: string, context: AlgorithmSeedResolveContext = {}) {
  const records = await resolveAlgorithmSeedRecords('workflow_dictionary', context)
  const normalized = normalizeText(text).toLowerCase()
  if (!normalized && readContextStandardWorkCodes(context).length === 0 && !normalizeText(context.templateNodeId)) return null
  const hasStructuredWorkContext = readContextStandardWorkCodes(context).length > 0 || Boolean(normalizeText(context.templateNodeId))

  return bestSeedMatch(records, normalized, context, (item: any, value) => (
    !hasStructuredWorkContext
    && (
      hasAnyKeywordMatch(item.successorKeywords, value)
      || hasAnyKeywordMatch(item.predecessorKeywords, value)
    )
  ))
}

export async function resolveV1475CrossItemWorkflow(text: string, context: AlgorithmSeedResolveContext = {}) {
  const records = await resolveAlgorithmSeedRecords('cross_item_workflow', context)
  const normalized = normalizeText(text).toLowerCase()
  if (!normalized && readContextStandardWorkCodes(context).length === 0 && !normalizeText(context.templateNodeId)) return null

  const contextCodes = readContextStandardWorkCodes(context)
  const matchCrossItemCodePrefix = (item: any) => {
    const prefixes = normalizeTextArray([
      ...normalizeTextArray(item.successorCodePrefixes ?? item.successor_code_prefixes),
      ...normalizeTextArray(item.predecessorCodePrefixes ?? item.predecessor_code_prefixes),
    ]).map((value) => value.toLowerCase())
    return prefixes.some((prefix) => contextCodes.some((code) => code === prefix || code.startsWith(`${prefix}-`)))
  }

  return bestSeedMatch(records, normalized, context, (item: any, value) => (
    matchCrossItemCodePrefix(item)
    || hasAnyKeywordMatch(item.successorCodePrefixes, value)
    || hasAnyKeywordMatch(item.predecessorCodePrefixes, value)
  ))
}

export async function resolveWorkflowSequenceSignal(text: string, context: AlgorithmSeedResolveContext = {}) {
  return resolveV1475CrossItemWorkflow(text, context)
}

export async function resolveStandardWorkDurationSeed(text: string, context: AlgorithmSeedResolveContext = {}) {
  const records = await resolveAlgorithmSeedRecords('standard_work_duration', context)
  const normalized = normalizeText(text).toLowerCase()
  if (!normalized && readContextStandardWorkCodes(context).length === 0 && !normalizeText(context.templateNodeId)) return null
  return applyProjectTypeDurationFactor(
    applyStructureTypeDurationFactor(
      applyElementVariantDurationFactor(
        applyStandardWorkConditionBand(
          applyMethodDurationBucket(bestSeedMatch(records, normalized, context, hasKeywordMatch), context),
          context,
        ),
        context,
      ),
      context,
    ),
    context,
  )
}

export async function resolveDefaultMasterPlanVisibilityPolicy(
  context: AlgorithmSeedResolveContext = {},
): Promise<Array<ResolvedAlgorithmSeedRecord<DefaultMasterPlanVisibilityPolicyRecord>>> {
  return resolveAlgorithmSeedRecords<DefaultMasterPlanVisibilityPolicyRecord>(
    'master_plan_visibility_policy',
    context,
  )
}

export function readStandardWorkDurationSeedVersion() {
  return getAlgorithmSeedEntry('standard_work_duration')?.meta.seedVersion ?? null
}

export async function resolveStandardWorkDurationSeedByStableCode(
  stableCode: string | null | undefined,
  context: AlgorithmSeedResolveContext = {},
): Promise<StandardWorkDurationSeedResolverRecord | null> {
  const normalized = normalizeText(stableCode).toLowerCase()
  if (!normalized) return null
  const records = await resolveAlgorithmSeedRecords<StandardWorkDurationSeedResolverRecord>('standard_work_duration', {
    ...context,
    algorithmSeedLookupStableCodes: [normalized],
  })
  return records.find((record) => {
    const candidates = [
      record.__stableCode,
      record.stableCode,
      record.stable_code,
      record.standardWorkCode,
      record.standard_work_code,
    ]
    return candidates.some((candidate) => normalizeText(candidate).toLowerCase() === normalized)
  }) ?? null
}

export async function resolveT2DivisionRhythmTemplateByTemplateId(
  templateId: string | null | undefined,
  context: AlgorithmSeedResolveContext = {},
): Promise<T2DivisionRhythmTemplateResolverRecord | null> {
  const normalized = normalizeText(templateId).toLowerCase()
  if (!normalized) return null
  const records = await resolveAlgorithmSeedRecords<T2DivisionRhythmTemplateResolverRecord>('t2_division_rhythm_template', {
    ...context,
    algorithmSeedLookupStableCodes: [normalized],
  })
  return records.find((record) => {
    const candidates = [
      record.__stableCode,
      record.stableCode,
      record.stable_code,
      record.templateId,
      record.template_id,
    ]
    return candidates.some((candidate) => normalizeText(candidate).toLowerCase() === normalized)
  }) ?? null
}

function titleWeakRuleMatches(record: AlgorithmSeedRecordPayload, text: string) {
  return matchTitleWeakRecognitionRule(text, record as any).matched
}

function isTitleWeakStandardWorkHint(record: AlgorithmSeedRecordPayload) {
  return normalizeText(record.signalType ?? record.signal_type).toLowerCase() === 'standard_work_hint'
    && (record.effectPolicy as any)?.canInferStandardWork === true
}

export async function resolveTitleWeakRecognitionRules(text: string, context: AlgorithmSeedResolveContext = {}) {
  const records = await resolveAlgorithmSeedRecords('title_weak_recognition', context)
  const normalized = sanitizeTitleWeakRecognitionText(text)
  if (!getTitleWeakRecognizability(normalized).recognizable) return []
  return records.filter((record) => titleWeakRuleMatches(record, normalized))
}

export async function inferTitleWeakStandardWorkMatchesFromResolver(text: string, context: AlgorithmSeedResolveContext = {}) {
  const records = await resolveTitleWeakRecognitionRules(text, context)
  const contextText = buildTitleWeakContextText(text, context)
  const matches = records
    .filter(isTitleWeakStandardWorkHint)
    .flatMap((record, recordIndex) => {
      const match = matchTitleWeakRecognitionRule(contextText, record as any)
      if (!match.matched) return []
      return orderTitleWeakStandardWorkCodesByContext(record, contextText)
        .filter((code) => !code.startsWith('legacy:'))
        .map((standardWorkCode, codeIndex) => ({
          standardWorkCode,
          score: match.score,
          quality: match.quality,
          ruleId: normalizeText(record.ruleId ?? record.rule_id ?? record.stableCode ?? record.stable_code ?? record.__stableCode),
          seedCode: normalizeText(record.code ?? record.__stableCode),
          confidence: normalizeText(record.confidence) || 'low',
          matchedTerms: match.matchedTerms,
          reason: match.reason,
          recordIndex,
          codeIndex,
        }))
    })

  const byCode = new Map<string, typeof matches[number]>()
  for (const match of matches) {
    const existing = byCode.get(match.standardWorkCode)
    if (!existing || match.score > existing.score || (match.score === existing.score && match.recordIndex < existing.recordIndex)) {
      byCode.set(match.standardWorkCode, match)
    }
  }
  return [...byCode.values()]
    .sort((left, right) => right.score - left.score || left.recordIndex - right.recordIndex || left.codeIndex - right.codeIndex)
}

export async function inferTitleWeakStandardWorkCodesFromResolver(text: string, context: AlgorithmSeedResolveContext = {}) {
  return normalizeTextArray((await inferTitleWeakStandardWorkMatchesFromResolver(text, context))
    .map((match) => match.standardWorkCode))
}

export async function expandTitleWeakStandardWorkSearchTextFromResolver(text: string, context: AlgorithmSeedResolveContext = {}) {
  const normalized = sanitizeTitleWeakRecognitionText(text)
  if (!normalized) return ''
  const records = await resolveTitleWeakRecognitionRules(normalized, context)
  const aliases = records.flatMap((record) => [
    record.label,
    ...(Array.isArray(record.aliases) ? record.aliases : []),
    ...(Array.isArray(record.keywords) ? record.keywords : []),
  ])
  return normalizeTextArray([normalized, ...aliases]).join(' ')
}

export async function inferTitleWeakScaleSignalFromResolver(
  text: string,
  context: AlgorithmSeedResolveContext = {},
): Promise<TitleWeakScaleSignal> {
  const expandedText = await expandTitleWeakStandardWorkSearchTextFromResolver(text, context)
  return inferTitleWeakScaleSignal(expandedText || text)
}

export function resolveDurationContributionModeFromResolver(value: unknown) {
  return normalizeDurationContributionMode(value)
}

export function inferDurationContributionModeFromResolver(input: {
  text?: unknown
  metadata?: Record<string, unknown> | null
  name?: unknown
  planItemKind?: unknown
  relationRole?: unknown
} = {}) {
  return inferDurationContributionMode({
    name: input.name ?? input.text,
    metadata: input.metadata,
    planItemKind: input.planItemKind,
    relationRole: input.relationRole,
  })
}

export function isDurationBearingContributionModeFromResolver(value: unknown) {
  return isDurationBearingContributionMode(value)
}

export function describeDurationContributionModeFromResolver(mode: DurationContributionMode) {
  return describeDurationContributionMode(mode)
}

export function normalizeExecutionNatureFromResolver(value: unknown) {
  return normalizeExecutionNature(value)
}

export function inferExecutionNatureFromResolver(input: {
  text?: unknown
  metadata?: Record<string, unknown> | null
  name?: unknown
  planItemKind?: unknown
  relationRole?: unknown
  durationContributionMode?: unknown
} = {}) {
  return inferExecutionNature({
    name: input.name ?? input.text,
    metadata: input.metadata,
    planItemKind: input.planItemKind,
    relationRole: input.relationRole,
    durationContributionMode: input.durationContributionMode,
  })
}

export function normalizeWorkEnvironmentFromResolver(value: unknown) {
  return normalizeWorkEnvironment(value)
}

export function inferWorkEnvironmentFromResolver(
  text: unknown,
  metadata?: Record<string, unknown> | null,
) {
  return inferWorkEnvironment(text, metadata)
}

export function inferResourcePressureDimensionsFromResolver(resourceClass: string | null | undefined): V1474PressureDimension[] {
  return inferV1474ResourcePressureDimensions(resourceClass)
}

export function deriveSeasonalProductivityRegionFromResolver(input: {
  thermalZone?: string | null
  regionCode?: string | null
  climateTags?: string[] | null
  location?: string | null
}) {
  return deriveV1474SeasonalProductivityRegion(input)
}

export const SCHEDULE_ACCELERATION_PROFILE_SOURCE_FROM_RESOLVER = SCHEDULE_ACCELERATION_PROFILE_SOURCE
export const SCHEDULE_ACCELERATION_DEFAULT_PROFILE_CODE_FROM_RESOLVER = SCHEDULE_ACCELERATION_DEFAULT_PROFILE_CODE
export const SCHEDULE_ACCELERATION_DEFAULT_RESOURCE_CRASH_CAP_FROM_RESOLVER = SCHEDULE_ACCELERATION_DEFAULT_RESOURCE_CRASH_CAP
export const SCHEDULE_ACCELERATION_MIN_RESOURCE_CRASH_CAP_FROM_RESOLVER = SCHEDULE_ACCELERATION_MIN_RESOURCE_CRASH_CAP

export function getScheduleAccelerationProfileSeedFromResolver() {
  return SCHEDULE_ACCELERATION_PROFILE_SEED
}

export function getScheduleAccelerationSeasonalFactorSeedFromResolver() {
  return SCHEDULE_ACCELERATION_SEASONAL_FACTOR_SEED
}

export function getScheduleAccelerationResourceCrashCapSeedFromResolver() {
  return SCHEDULE_ACCELERATION_RESOURCE_CRASH_CAP_SEED
}

export function getScheduleAccelerationHardConstraintTypesFromResolver() {
  return SCHEDULE_ACCELERATION_HARD_CONSTRAINT_TYPES
}
