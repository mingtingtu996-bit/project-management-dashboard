import { apiGet, apiPost } from '@/lib/apiClient'
import {
  normalizeDurationMetricDto,
  readAvailableDurationValue,
  type DurationMetricDto,
} from '@/lib/durationMetric'

export type DurationConfidenceLevel = 'high' | 'medium' | 'low' | 'unavailable' | 'data_pending' | string
export type DurationDataMaturityLevel = 'L0' | 'L1' | 'L2' | string
export type DurationQuantitySource =
  | 'explicit_task_quantity'
  | 'task_saved_quantity'
  | 'engineering_object_proxy'
  | 'scope_proxy'
  | 'seed_default_quantity'
  | 'none'
  | string
export type DurationQuantityConfidence = 'high' | 'medium' | 'low' | 'unavailable' | string

export type BenchmarkScope = 'project' | 'company' | 'industry' | 'global' | 'mixed'
export type BenchmarkProvenanceReasonCode =
  | 'benchmark_provenance_missing'
  | 'benchmark_version_missing'
  | 'benchmark_generated_at_missing'
  | 'benchmark_source_as_of_missing'
  | 'benchmark_source_window_start_missing'
  | 'benchmark_sample_count_invalid'
  | 'benchmark_day_basis_unavailable'
  | 'benchmark_scope_unavailable'
  | 'benchmark_calendar_identity_missing'
  | 'benchmark_runtime_publication_key_missing'
  | 'benchmark_cause_identity_missing'
  | 'benchmark_blend_weight_invalid'

export interface BenchmarkProvenanceEntry {
  source: 'persisted_benchmark' | 'runtime_publication' | 'cause_segment'
  benchmarkId: string | null
  publicationKey: string | null
  benchmarkVersion: string | null
  scope: Exclude<BenchmarkScope, 'mixed'> | null
  'generatedAt': string | null
  sourceAsOf: string | null
  sourceWindowStart: string | null
  sampleCount: number | null
  dayBasis: 'construction_production_day' | null
  calendarRef: string | null
  calendarVersion: string | null
  aggregateCalendarIdentities: Array<{ calendarRef: string; calendarVersion: string }>
  causeSegment: { causeCode: string; taxonomyVersion: string } | null
  blendWeight: number | null
  availability: 'available' | 'unavailable'
  reasonCodes: BenchmarkProvenanceReasonCode[]
}

export interface BenchmarkProvenanceSet {
  mode: 'single' | 'blended'
  entries: BenchmarkProvenanceEntry[]
}

export interface TaskDurationForecast {
  taskId?: string | null
  durationOutputCode?: string | null
  durationOutputSemanticFieldName?: string | null
  remainingForecastDays?: number | null
  remainingDuration: DurationMetricDto | null
  conservativeDurationDays: number | null
  forecastFinishDate: string | null
  forecastDelay: DurationMetricDto | null
  forecastDelayDays: number | null
  probabilityDurationMetrics: {
    p20RemainingDuration: DurationMetricDto | null
    p50RemainingDuration: DurationMetricDto | null
    p80RemainingDuration: DurationMetricDto | null
  } | null
  delayRiskIndex?: number | null
  confidenceLevel: DurationConfidenceLevel | null
  confidenceScore: number | null
  forecastSource: string | null
  durationCalibrationSource?: string | null
  durationProvenance?: string | null
  businessReason: string | null
  businessReasonCode?: string | null
  businessReasonCodes?: string[] | null
  businessReasonParams?: Record<string, unknown> | null
  displaySummary?: string | null
  durationBoundaryRole?: string | null
  parentDurationBoundaryPolicy?: string | null
  nonAdditiveWithParentDuration?: boolean | null
  parentReferenceDurationDays?: number | null
  parentTaskTitle?: string | null
  independentReferenceDurationDays?: number | null
  packageChildPlanDurationDays?: number | null
  packageChildRhythmWindowStartDay?: number | null
  packageChildRhythmWindowEndDay?: number | null
  packageChildRhythmWindowRole?: string | null
  planDurationTruthSource?: string | null
  dataMaturity?: DurationDataMaturityLevel | null
  quantitySource?: DurationQuantitySource | null
  quantityConfidence?: DurationQuantityConfidence | null
  topFactors?: string[] | null
  businessFactorBadges?: Array<{
    type: string
    label: string
    severity: 'low' | 'medium' | 'high' | string
  }> | null
}

function normalizeTaskDurationForecast(raw: any): TaskDurationForecast {
  const remainingDuration = normalizeDurationMetricDto(raw?.remainingDuration)
  const forecastDelay = normalizeDurationMetricDto(raw?.forecastDelay)
  const rawProbabilityDurationMetrics = raw?.probabilityDurationMetrics
  const probabilityDurationMetrics = rawProbabilityDurationMetrics
    && typeof rawProbabilityDurationMetrics === 'object'
    && !Array.isArray(rawProbabilityDurationMetrics)
    ? {
        p20RemainingDuration: normalizeDurationMetricDto(rawProbabilityDurationMetrics.p20RemainingDuration),
        p50RemainingDuration: normalizeDurationMetricDto(rawProbabilityDurationMetrics.p50RemainingDuration),
        p80RemainingDuration: normalizeDurationMetricDto(rawProbabilityDurationMetrics.p80RemainingDuration),
      }
    : null
  const remainingForecastDays = readAvailableDurationValue(remainingDuration, 'construction_production_day')
  const durationOutputCode = raw?.durationOutputCode ?? null
  const normalizedOutputCode = String(durationOutputCode ?? '').trim()
  const semanticReferenceDays = normalizedOutputCode === 'remaining_forecast'
    ? remainingForecastDays
    : null
  return {
    taskId: raw?.taskId ?? null,
    durationOutputCode,
    durationOutputSemanticFieldName: raw?.durationOutputSemanticFieldName ?? null,
    remainingForecastDays,
    remainingDuration,
    conservativeDurationDays: semanticReferenceDays == null ? null : raw?.conservativeDurationDays ?? null,
    forecastFinishDate: raw?.forecastFinishDate ?? null,
    forecastDelay,
    forecastDelayDays: readAvailableDurationValue(forecastDelay, 'construction_production_day'),
    probabilityDurationMetrics,
    delayRiskIndex: raw?.delayRiskIndex ?? null,
    confidenceLevel: raw?.confidenceLevel ?? null,
    confidenceScore: raw?.confidenceScore ?? null,
    forecastSource: raw?.forecastSource ?? null,
    businessReason: raw?.businessReason ?? null,
    businessReasonCode: raw?.businessReasonCode ?? null,
    businessReasonCodes: raw?.businessReasonCodes ?? null,
    businessReasonParams: raw?.businessReasonParams ?? null,
    displaySummary: raw?.displaySummary ?? null,
    durationBoundaryRole: raw?.durationBoundaryRole ?? null,
    parentDurationBoundaryPolicy: raw?.parentDurationBoundaryPolicy ?? null,
    nonAdditiveWithParentDuration: raw?.nonAdditiveWithParentDuration ?? null,
    parentReferenceDurationDays: raw?.parentReferenceDurationDays ?? null,
    parentTaskTitle: raw?.parentTaskTitle ?? null,
    independentReferenceDurationDays: raw?.independentReferenceDurationDays ?? raw?.businessReasonParams?.independentReferenceDurationDays ?? null,
    packageChildPlanDurationDays: raw?.packageChildPlanDurationDays ?? raw?.businessReasonParams?.packageChildPlanDurationDays ?? null,
    packageChildRhythmWindowStartDay: raw?.packageChildRhythmWindowStartDay ?? raw?.businessReasonParams?.rhythmWindowStartDay ?? null,
    packageChildRhythmWindowEndDay: raw?.packageChildRhythmWindowEndDay ?? raw?.businessReasonParams?.rhythmWindowEndDay ?? null,
    packageChildRhythmWindowRole: raw?.packageChildRhythmWindowRole ?? raw?.businessReasonParams?.rhythmWindowRole ?? null,
    planDurationTruthSource: raw?.planDurationTruthSource ?? raw?.businessReasonParams?.planDurationTruthSource ?? null,
    dataMaturity: raw?.dataMaturity ?? null,
    quantitySource: raw?.quantitySource ?? null,
    quantityConfidence: raw?.quantityConfidence ?? null,
    topFactors: raw?.topFactors ?? null,
    businessFactorBadges: raw?.businessFactorBadges ?? null,
  }
}

export interface DurationSuggestion {
  durationOutputCode?: string | null
  durationOutputSemanticFieldName?: string | null
  planReferenceDays?: number | null
  contextualReferenceDays?: number | null
  remainingForecastDays?: number | null
  riskP20DurationDays?: number | null
  riskP50DurationDays?: number | null
  riskP80DurationDays?: number | null
  durationRiskRange?: {
    source?: string | null
    evidenceLevel?: string | null
    p20Days?: number | null
    p50Days?: number | null
    p80Days?: number | null
    p20_days?: number | null
    p50_days?: number | null
    p80_days?: number | null
    uncertaintyBandDays?: number | null
    mutationBoundary?: string | null
    mutation_boundary?: string | null
    [key: string]: unknown
  } | null
  conservativeDurationDays: number | null
  confidenceLevel: DurationConfidenceLevel | null
  confidenceScore: number | null
  confidence?: number | null
  forecastSource: string | null
  durationCalibrationSource?: string | null
  durationProvenance?: string | null
  businessReason: string | null
  businessReasonCode?: string | null
  businessReasonCodes?: string[] | null
  businessReasonParams?: Record<string, unknown> | null
  displaySummary?: string | null
  durationBoundaryRole?: string | null
  parentDurationBoundaryPolicy?: string | null
  nonAdditiveWithParentDuration?: boolean | null
  parentReferenceDurationDays?: number | null
  parentTaskTitle?: string | null
  independentReferenceDurationDays?: number | null
  packageChildPlanDurationDays?: number | null
  packageChildRhythmWindowStartDay?: number | null
  packageChildRhythmWindowEndDay?: number | null
  packageChildRhythmWindowRole?: string | null
  planDurationTruthSource?: string | null
  sampleSize?: number | null
  benchmarkGeneratedAt?: string | null
  benchmarkAsOf?: string | null
  benchmarkWindowStart?: string | null
  benchmarkVersion?: string | null
  benchmarkSampleCount?: number | null
  benchmarkDayBasis?: 'construction_production_day' | null
  benchmarkScope?: BenchmarkScope | null
  benchmarkProvenance?: BenchmarkProvenanceSet | null
  benchmarkProvenanceAvailability?: 'available' | 'partial' | 'unavailable' | null
  benchmarkProvenanceReasonCodes?: BenchmarkProvenanceReasonCode[]
  benchmarkProvenanceUnavailableReason?: BenchmarkProvenanceReasonCode | null
  sourceBreakdown?: Record<string, unknown> | null
  dataMaturity?: DurationDataMaturityLevel | null
  dataMaturityReasons?: string[] | null
  dataUpgradePath?: string[] | null
  dataUpgradeBlockedBy?: string[] | null
  factorAvailability?: Record<string, boolean> | null
  quantitySource?: DurationQuantitySource | null
  quantityConfidence?: DurationQuantityConfidence | null
}

const BENCHMARK_PROVENANCE_REASON_CODES = new Set<BenchmarkProvenanceReasonCode>([
  'benchmark_provenance_missing',
  'benchmark_version_missing',
  'benchmark_generated_at_missing',
  'benchmark_source_as_of_missing',
  'benchmark_source_window_start_missing',
  'benchmark_sample_count_invalid',
  'benchmark_day_basis_unavailable',
  'benchmark_scope_unavailable',
  'benchmark_calendar_identity_missing',
  'benchmark_runtime_publication_key_missing',
  'benchmark_cause_identity_missing',
  'benchmark_blend_weight_invalid',
])

const BENCHMARK_SCOPES = new Set<BenchmarkScope>(['project', 'company', 'industry', 'global', 'mixed'])

function nullableString(value: unknown) {
  return value == null ? null : typeof value === 'string' ? value : undefined
}

const STRICT_RFC3339_TIMESTAMP_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T([01]\d|2[0-3]):([0-5]\d):([0-5]\d)(?:\.(\d{1,6}))?(Z|[+-](?:0\d|1[0-4]):[0-5]\d)$/

function nullableTimestamp(value: unknown) {
  const normalized = nullableString(value)
  if (normalized === null || normalized === undefined) return normalized
  const match = STRICT_RFC3339_TIMESTAMP_PATTERN.exec(normalized)
  if (!match) return undefined

  const [, yearText, monthText, dayText, hourText, minuteText, secondText, fractionText = '', timezoneText] = match
  const year = Number(yearText)
  const month = Number(monthText)
  const day = Number(dayText)
  const hour = Number(hourText)
  const minute = Number(minuteText)
  const second = Number(secondText)
  const millisecond = Number(`${fractionText}000`.slice(0, 3))
  if (month < 1 || month > 12) return undefined
  if (day < 1 || day > new Date(Date.UTC(year, month, 0)).getUTCDate()) return undefined
  if (timezoneText.startsWith('+14:') || timezoneText.startsWith('-14:')) {
    if (!timezoneText.endsWith(':00')) return undefined
  }

  const parsed = new Date(normalized)
  if (!Number.isFinite(parsed.getTime())) return undefined
  const localShape = new Date(Date.UTC(year, month - 1, day, hour, minute, second, millisecond))
  if (
    localShape.getUTCFullYear() !== year
    || localShape.getUTCMonth() !== month - 1
    || localShape.getUTCDate() !== day
    || localShape.getUTCHours() !== hour
    || localShape.getUTCMinutes() !== minute
    || localShape.getUTCSeconds() !== second
  ) return undefined

  return parsed.toISOString()
}

function normalizeBenchmarkProvenanceEntry(raw: unknown): BenchmarkProvenanceEntry | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const value = raw as Record<string, unknown>
  const source = value.source
  if (source !== 'persisted_benchmark' && source !== 'runtime_publication' && source !== 'cause_segment') return null
  const scope = value.scope == null ? null : value.scope
  if (scope !== null && (typeof scope !== 'string' || !BENCHMARK_SCOPES.has(scope as BenchmarkScope) || scope === 'mixed')) return null
  const availability = value.availability
  if (availability !== 'available' && availability !== 'unavailable') return null
  if (!Array.isArray(value.aggregateCalendarIdentities)) return null
  const aggregateCalendarIdentities: Array<{ calendarRef: string; calendarVersion: string }> = []
  for (const rawIdentity of value.aggregateCalendarIdentities) {
    if (!rawIdentity || typeof rawIdentity !== 'object' || Array.isArray(rawIdentity)) return null
    const identity = rawIdentity as Record<string, unknown>
    if (typeof identity.calendarRef !== 'string' || !identity.calendarRef.trim()) return null
    if (typeof identity.calendarVersion !== 'string' || !identity.calendarVersion.trim()) return null
    aggregateCalendarIdentities.push({
      calendarRef: identity.calendarRef,
      calendarVersion: identity.calendarVersion,
    })
  }
  if (!Array.isArray(value.reasonCodes) || value.reasonCodes.some((reason) => (
    typeof reason !== 'string' || !BENCHMARK_PROVENANCE_REASON_CODES.has(reason as BenchmarkProvenanceReasonCode)
  ))) return null
  const causeSegment = value.causeSegment
  let normalizedCauseSegment: BenchmarkProvenanceEntry['causeSegment'] = null
  if (causeSegment != null) {
    if (typeof causeSegment !== 'object' || Array.isArray(causeSegment)) return null
    const cause = causeSegment as Record<string, unknown>
    if (typeof cause.causeCode !== 'string' || !cause.causeCode.trim()) return null
    if (typeof cause.taxonomyVersion !== 'string' || !cause.taxonomyVersion.trim()) return null
    normalizedCauseSegment = {
      causeCode: cause.causeCode,
      taxonomyVersion: cause.taxonomyVersion,
    }
  }
  const benchmarkId = nullableString(value.benchmarkId)
  const publicationKey = nullableString(value.publicationKey)
  const benchmarkVersion = nullableString(value.benchmarkVersion)
  const generatedAt = nullableTimestamp(value['generatedAt'])
  const sourceAsOf = nullableTimestamp(value.sourceAsOf)
  const sourceWindowStart = nullableTimestamp(value.sourceWindowStart)
  const dayBasis = value.dayBasis == null ? null : value.dayBasis === 'construction_production_day' ? value.dayBasis : undefined
  const calendarRef = nullableString(value.calendarRef)
  const calendarVersion = nullableString(value.calendarVersion)
  const sampleCount = value.sampleCount == null
    ? null
    : typeof value.sampleCount === 'number' && Number.isInteger(value.sampleCount) && value.sampleCount > 0
      ? value.sampleCount
      : undefined
  const blendWeight = value.blendWeight == null
    ? null
    : typeof value.blendWeight === 'number' && Number.isFinite(value.blendWeight) && value.blendWeight > 0 && value.blendWeight <= 1
      ? value.blendWeight
      : undefined
  if (
    benchmarkId === undefined
    || publicationKey === undefined
    || benchmarkVersion === undefined
    || generatedAt === undefined
    || sourceAsOf === undefined
    || sourceWindowStart === undefined
    || dayBasis === undefined
    || calendarRef === undefined
    || calendarVersion === undefined
    || sampleCount === undefined
    || blendWeight === undefined
  ) return null
  return {
    source,
    benchmarkId,
    publicationKey,
    benchmarkVersion,
    scope: scope as BenchmarkProvenanceEntry['scope'],
    'generatedAt': generatedAt,
    sourceAsOf,
    sourceWindowStart,
    sampleCount,
    dayBasis,
    calendarRef,
    calendarVersion,
    aggregateCalendarIdentities,
    causeSegment: normalizedCauseSegment,
    blendWeight,
    availability,
    reasonCodes: [...value.reasonCodes] as BenchmarkProvenanceReasonCode[],
  }
}

function failedBenchmarkProvenance() {
  return {
    benchmarkGeneratedAt: null,
    benchmarkAsOf: null,
    benchmarkWindowStart: null,
    benchmarkVersion: null,
    benchmarkSampleCount: null,
    benchmarkDayBasis: null,
    benchmarkScope: null,
    benchmarkProvenanceAvailability: null,
    benchmarkProvenanceReasonCodes: [],
    benchmarkProvenanceUnavailableReason: null,
    benchmarkProvenance: null,
  }
}

function sameReasonCodes(
  actual: readonly BenchmarkProvenanceReasonCode[],
  expected: readonly BenchmarkProvenanceReasonCode[],
) {
  return actual.length === expected.length && actual.every((reason, index) => reason === expected[index])
}

function semanticBenchmarkEntryReasonCodes(
  entry: BenchmarkProvenanceEntry,
  blendWeightRequired: boolean,
) {
  const reasons: BenchmarkProvenanceReasonCode[] = []
  const sourceIdentityAvailable = entry.source === 'runtime_publication'
    ? Boolean(entry.publicationKey?.trim())
    : Boolean(entry.benchmarkId?.trim())
  if (!sourceIdentityAvailable) reasons.push('benchmark_provenance_missing')
  if (!entry.benchmarkVersion?.trim()) reasons.push('benchmark_version_missing')
  if (!entry.generatedAt) reasons.push('benchmark_generated_at_missing')
  if (!entry.sourceAsOf) reasons.push('benchmark_source_as_of_missing')
  if (!entry.sourceWindowStart) reasons.push('benchmark_source_window_start_missing')
  if (!entry.sampleCount) reasons.push('benchmark_sample_count_invalid')
  if (entry.dayBasis !== 'construction_production_day') reasons.push('benchmark_day_basis_unavailable')
  if (!entry.scope) reasons.push('benchmark_scope_unavailable')
  const exactCalendarIdentity = Boolean(entry.calendarRef?.trim() && entry.calendarVersion?.trim())
  if (!exactCalendarIdentity && entry.aggregateCalendarIdentities.length === 0) {
    reasons.push('benchmark_calendar_identity_missing')
  }
  if (entry.source === 'runtime_publication' && !entry.publicationKey?.trim()) {
    reasons.push('benchmark_runtime_publication_key_missing')
  }
  if (entry.source === 'cause_segment' && !entry.causeSegment) {
    reasons.push('benchmark_cause_identity_missing')
  }
  const validBlendWeight = entry.blendWeight !== null
    && Number.isFinite(entry.blendWeight)
    && entry.blendWeight > 0
    && entry.blendWeight <= 1
  if (blendWeightRequired ? !validBlendWeight : entry.blendWeight !== null) {
    reasons.push('benchmark_blend_weight_invalid')
  }
  return [...new Set(reasons)].sort() as BenchmarkProvenanceReasonCode[]
}

function benchmarkProvenanceSemanticsMatch(input: {
  mode: BenchmarkProvenanceSet['mode']
  entries: BenchmarkProvenanceEntry[]
  availability: 'available' | 'partial' | 'unavailable'
  reasonCodes: BenchmarkProvenanceReasonCode[]
  unavailableReason: BenchmarkProvenanceReasonCode | null
  benchmarkGeneratedAt: string | null
  benchmarkAsOf: string | null
  benchmarkWindowStart: string | null
  benchmarkVersion: string | null
  benchmarkSampleCount: number | null
  benchmarkDayBasis: 'construction_production_day' | null
  benchmarkScope: BenchmarkScope | null
}) {
  const blended = input.mode === 'blended'
  if (blended ? input.entries.length < 2 : input.entries.length > 1) return false
  if (blended) {
    const totalWeight = input.entries.reduce((sum, entry) => sum + Number(entry.blendWeight ?? 0), 0)
    if (!Number.isFinite(totalWeight) || Math.abs(totalWeight - 1) > 1e-9) return false
  }

  for (const entry of input.entries) {
    const runtimeAggregate = entry.source === 'runtime_publication'
      && (entry.scope === 'company' || entry.scope === 'industry' || entry.scope === 'global')
    if (runtimeAggregate && entry.benchmarkId !== null) return false
    const expectedReasons = semanticBenchmarkEntryReasonCodes(entry, blended)
    if (!sameReasonCodes(entry.reasonCodes, expectedReasons)) return false
    if (entry.availability !== (expectedReasons.length === 0 ? 'available' : 'unavailable')) return false
  }

  const expectedReasonCodes = input.entries.length === 0
    ? ['benchmark_provenance_missing'] as BenchmarkProvenanceReasonCode[]
    : [...new Set(input.entries.flatMap((entry) => entry.reasonCodes))].sort() as BenchmarkProvenanceReasonCode[]
  const availableCount = input.entries.filter((entry) => entry.availability === 'available').length
  const expectedAvailability = input.entries.length === 0 || availableCount === 0
    ? 'unavailable'
    : availableCount === input.entries.length
      ? 'available'
      : 'partial'
  if (input.availability !== expectedAvailability) return false
  if (!sameReasonCodes(input.reasonCodes, expectedReasonCodes)) return false
  if (input.unavailableReason !== (expectedReasonCodes[0] ?? null)) return false

  if (expectedAvailability !== 'available') {
    return input.benchmarkGeneratedAt === null
      && input.benchmarkAsOf === null
      && input.benchmarkWindowStart === null
      && input.benchmarkVersion === null
      && input.benchmarkSampleCount === null
      && input.benchmarkDayBasis === null
      && input.benchmarkScope === null
  }

  const generatedAt = input.entries.map((entry) => entry.generatedAt as string)
    .sort((left, right) => left.localeCompare(right))
  const sourceAsOf = input.entries.map((entry) => entry.sourceAsOf as string)
    .sort((left, right) => left.localeCompare(right))
  const sourceWindowStart = input.entries.map((entry) => entry.sourceWindowStart as string)
    .sort((left, right) => left.localeCompare(right))
  const scopes = [...new Set(input.entries.map((entry) => entry.scope as Exclude<BenchmarkScope, 'mixed'>))]
  const expectedScope: BenchmarkScope = scopes.length === 1 ? scopes[0] : 'mixed'
  return input.benchmarkGeneratedAt === generatedAt.at(-1)
    && input.benchmarkAsOf === sourceAsOf[0]
    && input.benchmarkWindowStart === sourceWindowStart[0]
    && input.benchmarkVersion === (blended ? null : input.entries[0].benchmarkVersion)
    && input.benchmarkSampleCount === input.entries.reduce((sum, entry) => sum + Number(entry.sampleCount), 0)
    && input.benchmarkDayBasis === 'construction_production_day'
    && input.benchmarkScope === expectedScope
}

function normalizeBenchmarkProvenance(raw: any) {
  const rawSet = raw?.benchmarkProvenance
  const availability = raw?.benchmarkProvenanceAvailability
  const reasonCodes = raw?.benchmarkProvenanceReasonCodes
  const unavailableReason = raw?.benchmarkProvenanceUnavailableReason
  if (
    !rawSet
    || typeof rawSet !== 'object'
    || (rawSet.mode !== 'single' && rawSet.mode !== 'blended')
    || !Array.isArray(rawSet.entries)
    || (availability !== 'available' && availability !== 'partial' && availability !== 'unavailable')
    || !Array.isArray(reasonCodes)
    || reasonCodes.some((reason: unknown) => typeof reason !== 'string' || !BENCHMARK_PROVENANCE_REASON_CODES.has(reason as BenchmarkProvenanceReasonCode))
    || (unavailableReason != null && !BENCHMARK_PROVENANCE_REASON_CODES.has(unavailableReason as BenchmarkProvenanceReasonCode))
  ) {
    return failedBenchmarkProvenance()
  }
  const entries = rawSet.entries.map(normalizeBenchmarkProvenanceEntry)
  if (entries.some((entry: BenchmarkProvenanceEntry | null) => !entry)) {
    return failedBenchmarkProvenance()
  }
  const benchmarkGeneratedAt = nullableTimestamp(raw?.benchmarkGeneratedAt)
  const benchmarkAsOf = nullableTimestamp(raw?.benchmarkAsOf)
  const benchmarkWindowStart = nullableTimestamp(raw?.benchmarkWindowStart)
  const benchmarkVersion = nullableString(raw?.benchmarkVersion)
  const benchmarkSampleCount = raw?.benchmarkSampleCount == null
    ? null
    : typeof raw.benchmarkSampleCount === 'number' && Number.isInteger(raw.benchmarkSampleCount) && raw.benchmarkSampleCount > 0
      ? raw.benchmarkSampleCount
      : undefined
  const benchmarkDayBasis = raw?.benchmarkDayBasis == null
    ? null
    : raw.benchmarkDayBasis === 'construction_production_day' ? raw.benchmarkDayBasis : undefined
  const benchmarkScope = raw?.benchmarkScope == null
    ? null
    : typeof raw.benchmarkScope === 'string' && BENCHMARK_SCOPES.has(raw.benchmarkScope as BenchmarkScope)
      ? raw.benchmarkScope
      : undefined
  if (
    benchmarkGeneratedAt === undefined
    || benchmarkAsOf === undefined
    || benchmarkWindowStart === undefined
    || benchmarkVersion === undefined
    || benchmarkSampleCount === undefined
    || benchmarkDayBasis === undefined
    || benchmarkScope === undefined
  ) {
    return failedBenchmarkProvenance()
  }
  const normalizedEntries = entries as BenchmarkProvenanceEntry[]
  const normalizedReasonCodes = [...reasonCodes] as BenchmarkProvenanceReasonCode[]
  const normalizedUnavailableReason = unavailableReason == null
    ? null
    : unavailableReason as BenchmarkProvenanceReasonCode
  if (!benchmarkProvenanceSemanticsMatch({
    mode: rawSet.mode,
    entries: normalizedEntries,
    availability,
    reasonCodes: normalizedReasonCodes,
    unavailableReason: normalizedUnavailableReason,
    benchmarkGeneratedAt,
    benchmarkAsOf,
    benchmarkWindowStart,
    benchmarkVersion,
    benchmarkSampleCount,
    benchmarkDayBasis,
    benchmarkScope: benchmarkScope as BenchmarkScope | null,
  })) return failedBenchmarkProvenance()
  return {
    benchmarkGeneratedAt,
    benchmarkAsOf,
    benchmarkWindowStart,
    benchmarkVersion,
    benchmarkSampleCount,
    benchmarkDayBasis,
    benchmarkScope: benchmarkScope as BenchmarkScope | null,
    benchmarkProvenanceAvailability: availability,
    benchmarkProvenanceReasonCodes: normalizedReasonCodes,
    benchmarkProvenanceUnavailableReason: normalizedUnavailableReason,
    benchmarkProvenance: {
      mode: rawSet.mode,
      entries: normalizedEntries,
    },
  }
}

export interface DurationSuggestionQuery {
  suggestionPurpose?: 'new_task_reference' | 'execution_reference' | 'monthly_commitment_window' | string | null
  taskId?: string | null
  templateNodeId?: string | null
  wbsNodeType?: string | null
  projectId?: string | null
  engineeringCategoryId?: string | null
  standardWorkCode?: string | null
  standardWorkName?: string | null
  taskTitle?: string | null
  engineeringObjectId?: string | null
  plannedStartDate?: string | null
  plannedEndDate?: string | null
  currentProgress?: number | string | null
  targetProgress?: number | string | null
  buildingObjectId?: string | null
  floorObjectId?: string | null
  zoneObjectId?: string | null
  coveredBuildingIds?: string[] | null
  coveredFloorIds?: string[] | null
  taskQuantity?: number | string | null
  taskQuantityUnit?: string | null
  defaultQuantity?: number | string | null
  defaultQuantityUnit?: string | null
  childTaskCount?: number | string | null
  projectTypeCode?: string | null
  structureTypeCode?: string | null
  methodVariantCodes?: string[] | null
  methodVariantSource?: string | null
  elementVariantCodes?: string[] | null
  elementVariantSource?: string | null
  responsibleUnitId?: string | null
  acceptanceRequired?: boolean | null
  materialRequired?: boolean | null
  parentStandardWorkCode?: string | null
  parentTaskTitle?: string | null
  parentDurationBoundaryPolicy?: string | null
  parentDurationPolicySource?: string | null
  parentReferenceDurationDays?: number | string | null
}

function normalizeDurationSuggestion(raw: any): DurationSuggestion {
  const durationOutputCode = raw?.durationOutputCode ?? null
  const planReferenceDays = raw?.planReferenceDays ?? null
  const contextualReferenceDays = raw?.contextualReferenceDays ?? null
  const remainingForecastDays = raw?.remainingForecastDays ?? null
  return {
    durationOutputCode,
    durationOutputSemanticFieldName: raw?.durationOutputSemanticFieldName ?? null,
    planReferenceDays,
    contextualReferenceDays,
    remainingForecastDays,
    riskP20DurationDays: raw?.riskP20DurationDays ?? raw?.risk_p20_duration_days ?? null,
    riskP50DurationDays: raw?.riskP50DurationDays ?? raw?.risk_p50_duration_days ?? null,
    riskP80DurationDays: raw?.riskP80DurationDays ?? raw?.risk_p80_duration_days ?? null,
    durationRiskRange: raw?.durationRiskRange ?? raw?.duration_risk_range ?? null,
    conservativeDurationDays: raw?.conservativeDurationDays ?? null,
    confidenceLevel: raw?.confidenceLevel ?? null,
    confidenceScore: raw?.confidenceScore ?? raw?.confidence ?? null,
    confidence: raw?.confidence ?? raw?.confidenceScore ?? null,
    forecastSource: raw?.forecastSource ?? null,
    durationCalibrationSource: raw?.durationCalibrationSource ?? null,
    durationProvenance: raw?.durationProvenance ?? null,
    businessReason: raw?.businessReason ?? null,
    businessReasonCode: raw?.businessReasonCode ?? null,
    businessReasonCodes: raw?.businessReasonCodes ?? null,
    businessReasonParams: raw?.businessReasonParams ?? null,
    displaySummary: raw?.displaySummary ?? null,
    durationBoundaryRole: raw?.durationBoundaryRole ?? null,
    parentDurationBoundaryPolicy: raw?.parentDurationBoundaryPolicy ?? null,
    nonAdditiveWithParentDuration: raw?.nonAdditiveWithParentDuration ?? null,
    parentReferenceDurationDays: raw?.parentReferenceDurationDays ?? null,
    parentTaskTitle: raw?.parentTaskTitle ?? null,
    independentReferenceDurationDays: raw?.independentReferenceDurationDays ?? raw?.businessReasonParams?.independentReferenceDurationDays ?? null,
    packageChildPlanDurationDays: raw?.packageChildPlanDurationDays ?? raw?.businessReasonParams?.packageChildPlanDurationDays ?? null,
    packageChildRhythmWindowStartDay: raw?.packageChildRhythmWindowStartDay ?? raw?.businessReasonParams?.rhythmWindowStartDay ?? null,
    packageChildRhythmWindowEndDay: raw?.packageChildRhythmWindowEndDay ?? raw?.businessReasonParams?.rhythmWindowEndDay ?? null,
    packageChildRhythmWindowRole: raw?.packageChildRhythmWindowRole ?? raw?.businessReasonParams?.rhythmWindowRole ?? null,
    planDurationTruthSource: raw?.planDurationTruthSource ?? raw?.businessReasonParams?.planDurationTruthSource ?? null,
    sampleSize: raw?.sampleSize ?? null,
    ...normalizeBenchmarkProvenance(raw),
    sourceBreakdown: raw?.sourceBreakdown ?? null,
    dataMaturity: raw?.dataMaturity ?? null,
    dataMaturityReasons: raw?.dataMaturityReasons ?? null,
    dataUpgradePath: raw?.dataUpgradePath ?? null,
    dataUpgradeBlockedBy: raw?.dataUpgradeBlockedBy ?? null,
    factorAvailability: raw?.factorAvailability ?? null,
    quantitySource: raw?.quantitySource ?? null,
    quantityConfidence: raw?.quantityConfidence ?? null,
  }
}

export async function getTaskDurationForecast(taskId: string, options?: RequestInit) {
  const raw = await apiGet<any>(
    `/api/duration-suggestions/tasks/${encodeURIComponent(taskId)}/duration-forecast`,
    options,
  )
  return normalizeTaskDurationForecast(raw)
}

export async function getTaskDurationForecasts(taskIds: string[], options?: RequestInit) {
  const uniqueTaskIds = [...new Set(taskIds.map((id) => String(id ?? '').trim()).filter(Boolean))]
  if (uniqueTaskIds.length === 0) return []
  const raw = await apiPost<any[]>('/api/duration-suggestions/batch', { task_ids: uniqueTaskIds }, options)
  return raw.map(normalizeTaskDurationForecast)
}

export async function getCurrentTaskDurationForecasts(taskIds: string[], options?: RequestInit) {
  const uniqueTaskIds = [...new Set(taskIds.map((id) => String(id ?? '').trim()).filter(Boolean))]
  if (uniqueTaskIds.length === 0) return []
  const raw = await apiPost<any[]>('/api/duration-suggestions/current-batch', { task_ids: uniqueTaskIds }, options)
  return raw.map(normalizeTaskDurationForecast)
}

export async function getDurationSuggestion(query: DurationSuggestionQuery, options?: RequestInit) {
  const params = new URLSearchParams()
  Object.entries(query).forEach(([key, value]) => {
    if (value == null || value === '') return
    if (Array.isArray(value)) {
      if (value.length > 0) params.set(key, value.join(','))
      return
    }
    params.set(key, String(value))
  })

  const raw = await apiGet<any>(`/api/duration-suggestions${params.toString() ? `?${params.toString()}` : ''}`, options)
  return normalizeDurationSuggestion(raw)
}
