import type {
  DurationContextActionPolicy,
  DurationContextFactor,
  DurationContextFactorKey,
  DurationContextInput,
} from '../types/durationContext.js'
import type { DurationContextSummary } from './durationContextService.js'

export const DURATION_CONTEXT_FACTOR_SYNTHESIS_MULTIPLIER_SAFETY_MAX = 2.5
export const DURATION_CONTEXT_FACTOR_SYNTHESIS_CONFIDENCE_DELTA_MIN = -30
export const DURATION_CONTEXT_FACTOR_SYNTHESIS_CONFIDENCE_DELTA_MAX = 20

type DurationContextInterferenceRelation = 'independent' | 'partial_overlap' | 'mutex' | 'causal'

type DurationContextInterferenceRule = {
  relation: DurationContextInterferenceRelation
  primary: DurationContextFactorKey
  secondary: DurationContextFactorKey
  policy: string
  requireSharedSourceEntity?: boolean
}

export type FactorContributionLedgerEntry = NonNullable<DurationContextSummary['calculationContext']['factor_contribution_ledger']>[number]

const DURATION_CONTEXT_INTERFERENCE_RULES: DurationContextInterferenceRule[] = [
  {
    relation: 'mutex',
    primary: 'pm_recovery_compensation',
    secondary: 'productivity_compensation',
    policy: 'pm_recovery_candidate_owns_local_recovery_candidate_path',
  },
  {
    relation: 'causal',
    primary: 'seasonal_productivity',
    secondary: 'external_readiness',
    policy: 'statutory_or_calendar_window_overrides_readiness_delay_when_sources_overlap_or_calendar_signal_is_forced',
  },
  {
    relation: 'causal',
    primary: 'weather_forecast_impact',
    secondary: 'external_readiness',
    policy: 'site_weather_shutdown_or_red_weather_overrides_readiness_delay_for_shared_weather_source',
  },
  {
    relation: 'causal',
    primary: 'external_readiness',
    secondary: 'progress_velocity',
    policy: 'external_readiness_is_root_cause_when_progress_lag_is_explained_by_open_conditions',
  },
  {
    relation: 'causal',
    primary: 'external_readiness',
    secondary: 'resource_conflict',
    policy: 'external_readiness_is_root_cause_when_resource_pressure_shares_condition_or_material_source',
    requireSharedSourceEntity: true,
  },
  {
    relation: 'partial_overlap',
    primary: 'weather_forecast_impact',
    secondary: 'process_seasonal_sensitivity',
    policy: 'weather_and_process_sensitivity_share_climate_signal_take_weather_as_primary_for_duplicate_physical_weather',
  },
  {
    relation: 'mutex',
    primary: 'seasonal_productivity',
    secondary: 'process_seasonal_sensitivity',
    policy: 'holiday_or_winter_shutdown_calendar_signal_can_make process sensitivity secondary for same physical window',
  },
]

export const CLIMATE_DURATION_FACTOR_KEYS = new Set<DurationContextFactorKey>([
  'seasonal_productivity',
  'process_seasonal_sensitivity',
  'weather_forecast_impact',
])

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

function readPositiveNumberOrNull(value: unknown) {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? number : null
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function factorImpactScore(factor: Pick<DurationContextFactor, 'multiplier' | 'extraDays' | 'confidenceDelta'>) {
  return Math.abs(Number(factor.multiplier ?? 1) - 1) * 100
    + Math.max(0, Number(factor.extraDays ?? 0))
    + Math.abs(Number(factor.confidenceDelta ?? 0))
}

export function buildScopeContext(input: DurationContextInput) {
  return {
    projectId: normalizeId(input.projectId),
    taskId: normalizeId(input.taskId),
    buildingObjectId: normalizeId(input.buildingObjectId),
    floorObjectId: normalizeId(input.floorObjectId),
    zoneObjectId: normalizeId(input.zoneObjectId),
    responsibleUnitId: normalizeId(input.responsibleUnitId),
    standardWorkCode: normalizeText(input.standardWorkCode) || null,
    standardWorkName: normalizeText(input.standardWorkName) || null,
  }
}

function buildScopeFingerprint(input: DurationContextInput) {
  const scope = buildScopeContext(input)
  return [
    `project:${scope.projectId ?? 'none'}`,
    `task:${scope.taskId ?? 'none'}`,
    `building:${scope.buildingObjectId ?? 'none'}`,
    `floor:${scope.floorObjectId ?? 'none'}`,
    `zone:${scope.zoneObjectId ?? 'none'}`,
    `unit:${scope.responsibleUnitId ?? 'none'}`,
    `work:${scope.standardWorkCode ?? scope.standardWorkName ?? 'none'}`,
  ].join('|')
}

function readFactorSourceEntityKeys(factor: DurationContextFactor) {
  const metadata = readRecord(factor.metadata)
  const direct = metadata.sourceEntityKeys ?? metadata.source_entity_keys
  if (Array.isArray(direct)) {
    return Array.from(new Set(direct.map((item) => normalizeText(item)).filter(Boolean))).slice(0, 20)
  }
  const sourceEntityType = normalizeId(metadata.sourceEntityType ?? metadata.source_entity_type)
  const sourceEntityId = normalizeId(metadata.sourceEntityId ?? metadata.source_entity_id)
  if (sourceEntityType && sourceEntityId) return [`${sourceEntityType}:${sourceEntityId}`]
  const stableCode = normalizeId(metadata.stableCode ?? metadata.stable_code)
  return stableCode ? [`seed:${stableCode}`] : []
}

function factorContributionMode(factor: DurationContextFactor) {
  const hasMultiplier = Math.abs(Number(factor.multiplier ?? 1) - 1) > 0.001
  const hasExtraDays = Math.max(0, Number(factor.extraDays ?? 0)) > 0
  if (factor.actionPolicy === 'confidence_only') return 'confidence_only'
  if (hasMultiplier && hasExtraDays) return 'extra_days_and_multiplier'
  if (hasExtraDays) return 'extra_days'
  if (hasMultiplier) return 'multiplier'
  return factor.confidenceDelta !== 0 ? 'confidence_delta' : 'observability'
}

export function buildFactorContributionLedger(input: DurationContextInput, factors: DurationContextFactor[]): FactorContributionLedgerEntry[] {
  const scopeFingerprint = buildScopeFingerprint(input)
  return factors.map((factor) => {
    const sourceEntityKeys = readFactorSourceEntityKeys(factor)
    const primarySource = sourceEntityKeys[0] ?? factor.source
    return {
      key: factor.key,
      label: factor.label,
      multiplier: Number(factor.multiplier ?? 1),
      extraDays: Math.max(0, Number(factor.extraDays ?? 0)),
      confidenceDelta: Number(factor.confidenceDelta ?? 0),
      actionPolicy: factor.actionPolicy,
      source: factor.source,
      contributionMode: factorContributionMode(factor),
      scopeFingerprint,
      sourceEntityKeys,
      dedupeKey: `${factor.key}:${primarySource}`,
      dataDependencies: [...(factor.dataDependencies ?? [])],
      reason: factor.reason,
    }
  })
}

export function buildReadinessGraph(input: DurationContextInput, factors: DurationContextFactor[]) {
  const readinessFactor = factors.find((factor) => factor.key === 'external_readiness')
  const readinessSourceKeys = readinessFactor ? readFactorSourceEntityKeys(readinessFactor) : []
  const relatedFactorKeys = factors
    .filter((factor) => factor.key !== 'external_readiness')
    .filter((factor) => {
      const keys = readFactorSourceEntityKeys(factor)
      return keys.some((key) => readinessSourceKeys.includes(key))
        || (factor.key === 'progress_velocity' && readinessFactor)
        || (factor.key === 'resource_conflict' && readinessFactor)
    })
    .map((factor) => factor.key)
  return {
    primaryFactorKey: readinessFactor ? 'external_readiness' as DurationContextFactorKey : null,
    rootCauseEntityKeys: readinessSourceKeys,
    relatedFactorKeys: Array.from(new Set(relatedFactorKeys)),
    scopeFingerprint: buildScopeFingerprint(input),
    policy: 'readiness_primary_cause_graph',
  }
}

export function buildCausalDedupeDiagnostics(factors: DurationContextFactor[]) {
  const primaryBySourceEntity: Record<string, DurationContextFactorKey> = {}
  const duplicateSourceEntityKeys: string[] = []
  const suppressedFactorKeys = new Set<DurationContextFactorKey>()
  const seen = new Map<string, DurationContextFactorKey>()
  const suppressionByFactorKey: Record<string, DurationContextFactorKey> = {}

  for (const factor of factors) {
    for (const sourceKey of readFactorSourceEntityKeys(factor)) {
      const previous = seen.get(sourceKey)
      if (!previous) {
        seen.set(sourceKey, factor.key)
        primaryBySourceEntity[sourceKey] = factor.key
        continue
      }
      duplicateSourceEntityKeys.push(sourceKey)
      const primary = previous === 'external_readiness' || factor.key !== 'external_readiness'
        ? previous
        : factor.key
      primaryBySourceEntity[sourceKey] = primary
      if (factor.key !== primary) {
        suppressedFactorKeys.add(factor.key)
        suppressionByFactorKey[factor.key] = primary
      }
      if (previous !== primary) {
        suppressedFactorKeys.add(previous)
        suppressionByFactorKey[previous] = primary
      }
      seen.set(sourceKey, primary)
    }
  }

  return {
    policy: 'source_entity_scope_primary_cause',
    duplicateSourceEntityCount: Array.from(new Set(duplicateSourceEntityKeys)).length,
    duplicateSourceEntityKeys: Array.from(new Set(duplicateSourceEntityKeys)),
    suppressedFactorKeys: Array.from(suppressedFactorKeys),
    primaryBySourceEntity,
    appliedToSynthesis: suppressedFactorKeys.size > 0,
    suppressionByFactorKey,
  }
}

function sourceEntityOverlap(left: FactorContributionLedgerEntry, right: FactorContributionLedgerEntry) {
  const rightKeys = new Set(right.sourceEntityKeys ?? [])
  return (left.sourceEntityKeys ?? []).some((key) => rightKeys.has(key))
}

function factorHasStrongPhysicalSignal(entry: FactorContributionLedgerEntry) {
  const text = [
    entry.reason,
    ...(entry.sourceEntityKeys ?? []),
  ].join(' ').toLowerCase()
  return [
    'spring_festival',
    'winter_shutdown',
    'red_rainstorm',
    'red-weather',
    'red_weather',
    'site_shutdown',
    'weather_event',
  ].some((token) => text.includes(token))
}

function factorHasActionableWeatherSignal(entry: FactorContributionLedgerEntry) {
  if (entry.key !== 'weather_forecast_impact') return false
  if (entry.actionPolicy === 'confidence_only') return false
  const text = [
    entry.reason,
    entry.label,
    entry.source,
    ...(entry.sourceEntityKeys ?? []),
  ].join(' ').toLowerCase()
  const hasWeatherToken = [
    'weather',
    'forecast',
    'rain',
    'rainstorm',
    'typhoon',
    'wind',
    'cold',
    'heat',
    'dust',
    'sandstorm',
    '寒潮',
    '暴雨',
    '台风',
    '大风',
    '高温',
    '沙尘',
  ].some((token) => text.includes(token))
  return hasWeatherToken && (
    Math.abs(Number(entry.multiplier ?? 1) - 1) > 0.001
    || Math.max(0, Number(entry.extraDays ?? 0)) > 0
    || Number(entry.confidenceDelta ?? 0) < 0
  )
}

function shouldApplyInterferenceRule(
  primary: FactorContributionLedgerEntry,
  secondary: FactorContributionLedgerEntry,
  rule: DurationContextInterferenceRule,
) {
  const hasSharedSourceEntity = sourceEntityOverlap(primary, secondary)
  if (rule.primary === 'pm_recovery_compensation' && rule.secondary === 'productivity_compensation') return true
  if (primary.actionPolicy !== 'auto_apply' && secondary.actionPolicy === 'auto_apply') return false
  if (rule.primary === 'weather_forecast_impact' && !factorHasActionableWeatherSignal(primary)) return false
  if (rule.requireSharedSourceEntity && !hasSharedSourceEntity) return false
  if (rule.primary === 'seasonal_productivity' && rule.secondary === 'external_readiness') {
    return hasSharedSourceEntity || factorHasStrongPhysicalSignal(primary) || factorHasStrongPhysicalSignal(secondary)
  }
  if (rule.primary === 'weather_forecast_impact' && rule.secondary === 'external_readiness') {
    return hasSharedSourceEntity || factorHasStrongPhysicalSignal(primary)
  }
  if (hasSharedSourceEntity) return true
  if (rule.primary === 'external_readiness' && rule.secondary === 'progress_velocity') return true
  return false
}

export function resolveDurationContextInterferenceMatrix(ledger: FactorContributionLedgerEntry[]) {
  const suppressionByFactorKey: Record<string, {
    primaryFactorKey: DurationContextFactorKey
    relation: DurationContextInterferenceRelation
    policy: string
    suppressionMode: 'full' | 'half'
  }> = {}
  const appliedRelations: Array<Record<string, unknown>> = []
  for (const rule of DURATION_CONTEXT_INTERFERENCE_RULES) {
    const primary = ledger.find((entry) => entry.key === rule.primary)
    const secondary = ledger.find((entry) => entry.key === rule.secondary)
    if (!primary || !secondary) continue
    if (!shouldApplyInterferenceRule(primary, secondary, rule)) continue
    const suppressionMode = rule.relation === 'partial_overlap' || rule.relation === 'causal'
      ? 'half'
      : 'full'
    const existing = suppressionByFactorKey[secondary.key]
    if (!existing || factorImpactScore(primary) > factorImpactScore({ multiplier: 1, extraDays: 0, confidenceDelta: 0 })) {
      suppressionByFactorKey[secondary.key] = {
        primaryFactorKey: primary.key,
        relation: rule.relation,
        policy: rule.policy,
        suppressionMode,
      }
    }
    appliedRelations.push({
      relation: rule.relation,
      primaryFactorKey: primary.key,
      secondaryFactorKey: secondary.key,
      policy: rule.policy,
      sharedSourceEntity: sourceEntityOverlap(primary, secondary),
      suppressionMode,
    })
  }
  return {
    policy: 'explicit_duration_context_interference_matrix',
    defaultRelation: 'independent',
    relationCatalog: ['independent', 'partial_overlap', 'mutex', 'causal'],
    ruleCount: DURATION_CONTEXT_INTERFERENCE_RULES.length,
    appliedRelationCount: appliedRelations.length,
    appliedRelations,
    suppressionByFactorKey,
  }
}

export function buildEffectiveFactorContributionLedger(
  ledger: FactorContributionLedgerEntry[],
  dedupe: ReturnType<typeof buildCausalDedupeDiagnostics>,
  interferenceMatrix?: ReturnType<typeof resolveDurationContextInterferenceMatrix>,
) {
  const baselineCalibration = ledger.find((entry) => (
    entry.key === 'project_baseline_calibration'
    && entry.actionPolicy === 'auto_apply'
    && Number(entry.multiplier ?? 1) > 1
  ))
  return ledger.map((entry) => {
    const interference = interferenceMatrix?.suppressionByFactorKey[entry.key]
    const suppressedByFactorKey = interference?.primaryFactorKey ?? dedupe.suppressionByFactorKey[entry.key]
    if (!suppressedByFactorKey || entry.actionPolicy === 'confidence_only') return entry
    const contributionMode = interference ? 'interference_secondary' : 'deduped_secondary'
    const confidenceDelta = interference?.suppressionMode === 'full'
      ? 0
      : Math.min(0, Math.trunc(entry.confidenceDelta / 2))
    return {
      ...entry,
      diagnosticOriginalMultiplier: entry.multiplier,
      diagnosticOriginalExtraDays: entry.extraDays,
      diagnosticOriginalConfidenceDelta: entry.confidenceDelta,
      multiplier: 1,
      extraDays: 0,
      confidenceDelta,
      contributionMode,
      suppressedByFactorKey,
      interferenceRelation: interference?.relation,
      interferencePolicy: interference?.policy,
      suppressionMode: interference?.suppressionMode ?? 'full',
    }
  }).map((entry) => {
    if (!baselineCalibration) return entry
    if (!isScenarioDurationAction(entry.actionPolicy)) return entry
    if (!['seasonal_productivity', 'resource_conflict'].includes(entry.key)) return entry
    if (['deduped_secondary', 'interference_secondary'].includes(entry.contributionMode)) return entry
    const originalMultiplier = Number(entry.multiplier ?? 1)
    if (!Number.isFinite(originalMultiplier) || originalMultiplier <= 1) return entry
    const multiplier = Number((1 + (originalMultiplier - 1) * 0.6).toFixed(3))
    return {
      ...entry,
      diagnosticOriginalMultiplier: entry.diagnosticOriginalMultiplier ?? originalMultiplier,
      multiplier,
      contributionMode: 'baseline_overlap_secondary',
      suppressedByFactorKey: 'project_baseline_calibration' as DurationContextFactorKey,
      interferenceRelation: 'partial_overlap' as DurationContextInterferenceRelation,
      interferencePolicy: 'project_baseline_calibration_already_contains_average_seasonal_or_resource_bias',
      suppressionMode: 'baseline_partial_overlap',
    }
  })
}

function isCommittedDurationAction(actionPolicy: DurationContextActionPolicy) {
  return actionPolicy === 'auto_apply'
}

function isScenarioDurationAction(actionPolicy: DurationContextActionPolicy) {
  return actionPolicy === 'auto_apply' || actionPolicy === 'candidate_only'
}

export function fallbackContributionLedgerFromFactors(factors: DurationContextFactor[]): FactorContributionLedgerEntry[] {
  return factors.map((factor) => ({
    key: factor.key,
    label: factor.label,
    multiplier: Number(factor.multiplier ?? 1),
    extraDays: Math.max(0, Number(factor.extraDays ?? 0)),
    confidenceDelta: Number(factor.confidenceDelta ?? 0),
    actionPolicy: factor.actionPolicy,
    source: factor.source,
    contributionMode: factorContributionMode(factor),
    scopeFingerprint: 'legacy_context_without_effective_ledger',
    sourceEntityKeys: readFactorSourceEntityKeys(factor),
    dedupeKey: `${factor.key}:${factor.source}`,
    dataDependencies: [...(factor.dataDependencies ?? [])],
    reason: factor.reason,
  }))
}

export function summarizeLedgerDurationScenario(input: {
  ledger: FactorContributionLedgerEntry[]
  policy: 'auto_apply_only' | 'auto_apply_plus_candidate_only'
  extraDaysCap: { plannedDuration: number; cap: number; cappedExtraDays: number; policy: string }
}) {
  const entries = applyClimateDurationMutex(input.ledger.filter((entry) => (
    input.policy === 'auto_apply_only'
      ? isCommittedDurationAction(entry.actionPolicy)
      : isScenarioDurationAction(entry.actionPolicy)
  )))
  const rawMultiplier = Number(entries
    .reduce((value, entry) => value * clamp(entry.multiplier || 1, 0.4, DURATION_CONTEXT_FACTOR_SYNTHESIS_MULTIPLIER_SAFETY_MAX), 1)
    .toFixed(3))
  const rawExtraDays = entries.reduce((sum, entry) => sum + Math.max(0, Number(entry.extraDays ?? 0)), 0)
  const adjustedBy = Array.from(new Set(entries
    .filter((entry) => !['deduped_secondary', 'interference_secondary'].includes(entry.contributionMode))
    .map((entry) => entry.key))).slice(0, 3)
  return {
    policy: input.policy,
    multiplier: Math.min(rawMultiplier, DURATION_CONTEXT_FACTOR_SYNTHESIS_MULTIPLIER_SAFETY_MAX),
    rawMultiplier,
    extraDays: Math.min(input.extraDaysCap.cap, rawExtraDays),
    rawExtraDays,
    extraDaysCap: input.extraDaysCap.cap,
    extraDaysCapPolicy: input.extraDaysCap.policy,
    adjustedBy,
    factorKeys: Array.from(new Set(entries.map((entry) => entry.key))),
  }
}

function isClimateDurationEntry(entry: FactorContributionLedgerEntry) {
  return CLIMATE_DURATION_FACTOR_KEYS.has(entry.key)
    && entry.actionPolicy !== 'confidence_only'
    && (
      Math.abs(Number(entry.multiplier ?? 1) - 1) > 0.001
      || Math.max(0, Number(entry.extraDays ?? 0)) > 0
    )
}

function climateDurationPriority(entry: FactorContributionLedgerEntry) {
  if (entry.key === 'weather_forecast_impact') return 3
  if (entry.key === 'process_seasonal_sensitivity') return 2
  return 1
}

function climateDurationImpactScore(entry: FactorContributionLedgerEntry) {
  return Math.abs(Number(entry.multiplier ?? 1) - 1) * 100
    + Math.max(0, Number(entry.extraDays ?? 0))
}

function selectDominantClimateDurationEntry(entries: FactorContributionLedgerEntry[]) {
  return [...entries].sort((left, right) => {
    const scoreDelta = climateDurationImpactScore(right) - climateDurationImpactScore(left)
    if (Math.abs(scoreDelta) > 0.001) return scoreDelta
    return climateDurationPriority(right) - climateDurationPriority(left)
  })[0] ?? null
}

function applyClimateDurationMutex(entries: FactorContributionLedgerEntry[]) {
  const climateEntries = entries.filter(isClimateDurationEntry)
  if (climateEntries.length <= 1) return entries
  const primary = selectDominantClimateDurationEntry(climateEntries)
  if (!primary) return entries
  return entries.filter((entry) => !isClimateDurationEntry(entry) || entry === primary)
}

export function buildExplainPackage(input: {
  ledger: FactorContributionLedgerEntry[]
  readinessGraph: NonNullable<DurationContextSummary['calculationContext']['readiness_graph']>
  causalDedupe: NonNullable<DurationContextSummary['calculationContext']['causal_dedupe']>
  inputCoverage: Record<string, boolean>
  scheduleComposition?: Record<string, unknown>
  externalReadinessCalibration?: DurationContextSummary['calculationContext']['external_readiness_calibration']
  multiplier: number
  extraDays: number
  confidenceDelta: number
  runtimeCache?: Record<string, unknown>
}) {
  const metadataPolicy = {
    mode: 'compact_backend_admin_payload',
    maxPrimaryDrivers: 5,
    maxCompanionSignals: 8,
    maxSuppressedSignals: 12,
    rawMetadataLocation: 'calculationContext.factor_contribution_ledger',
  }
  const synthesisOrderPolicy = {
    policy: 'base_then_pm_recovery_then_schedule_state_then_productivity_compensation',
    orderedStages: [
      'base_factors',
      'pm_recovery_compensation',
      'project_schedule_state_policy',
      'productivity_compensation',
      'interference_matrix',
      'committed_auto_apply_synthesis',
      'candidate_scenario_synthesis',
    ],
    committedPath: 'auto_apply_only',
    candidatePath: 'auto_apply_plus_candidate_only',
  }
  const primaryDrivers = input.ledger
    .filter((entry) => !['deduped_secondary', 'interference_secondary'].includes(entry.contributionMode))
    .filter((entry) => entry.actionPolicy !== 'confidence_only' || entry.confidenceDelta < 0)
    .slice(0, 5)
    .map((entry) => ({
      key: entry.key,
      label: entry.label,
      contributionMode: entry.contributionMode,
      multiplier: entry.multiplier,
      extraDays: entry.extraDays,
      confidenceDelta: entry.confidenceDelta,
      reason: entry.reason,
    }))
  const companionSignals = input.ledger
    .filter((entry) => entry.actionPolicy === 'confidence_only' && entry.contributionMode !== 'deduped_secondary')
    .slice(0, 8)
    .map((entry) => ({
      key: entry.key,
      label: entry.label,
      confidenceDelta: entry.confidenceDelta,
      reason: entry.reason,
    }))
  const suppressedSignals = input.ledger
    .filter((entry) => ['deduped_secondary', 'interference_secondary'].includes(entry.contributionMode))
    .slice(0, 12)
    .map((entry) => ({
      key: entry.key,
      label: entry.label,
      suppressedByFactorKey: entry.suppressedByFactorKey,
      contributionMode: entry.contributionMode,
      effectiveMultiplier: entry.multiplier,
      effectiveExtraDays: entry.extraDays,
      effectiveConfidenceDelta: entry.confidenceDelta,
      reason: entry.reason,
    }))
  const diagnosticSuppressedSignals = input.ledger
    .filter((entry) => ['deduped_secondary', 'interference_secondary'].includes(entry.contributionMode))
    .slice(0, 12)
    .map((entry) => ({
      key: entry.key,
      label: entry.label,
      suppressedByFactorKey: entry.suppressedByFactorKey,
      diagnosticOriginalMultiplier: entry.diagnosticOriginalMultiplier,
      diagnosticOriginalExtraDays: entry.diagnosticOriginalExtraDays,
      diagnosticOriginalConfidenceDelta: entry.diagnosticOriginalConfidenceDelta,
      reason: entry.reason,
    }))
  return {
    version: 'duration_context_explain_v1',
    metadataPolicy,
    synthesisOrderPolicy,
    primaryDrivers,
    companionSignals,
    suppressedSignals,
    diagnosticSuppressedSignals,
    readinessGraph: input.readinessGraph,
    scopeComposition: input.scheduleComposition ?? null,
    calibration: {
      externalReadiness: input.externalReadinessCalibration ?? null,
    },
    pSemantics: {
      rangePolicy: 'p_can_exceed_1_when_acceleration_or_compensation_is_real',
      upperGuardrail: 1.4,
      lowerGuardrail: 0.2,
      multiplier: input.multiplier,
      extraDays: input.extraDays,
      confidenceDelta: input.confidenceDelta,
    },
    inputCoverage: input.inputCoverage,
    causalDedupe: input.causalDedupe,
    runtimeCache: input.runtimeCache ?? null,
  }
}

export function buildInputCoverage(factors: DurationContextFactor[]) {
  const coverage: Record<string, boolean> = {}
  for (const factor of factors) {
    for (const dependency of factor.dataDependencies ?? []) {
      coverage[dependency] = true
    }
    coverage[factor.key] = true
  }
  const readiness = factors.find((factor) => factor.key === 'external_readiness')
  if (readiness) {
    const metadata = readRecord(readiness.metadata)
    coverage.task_conditions = Boolean(readPositiveNumberOrNull(metadata.hardConditionCount) || readPositiveNumberOrNull(metadata.softConditionCount) || readPositiveNumberOrNull(metadata.drawingHardConditionCount))
    coverage.task_obstacles = Boolean(readPositiveNumberOrNull(metadata.obstacleImpactCount) || readPositiveNumberOrNull(metadata.obstacleObservationCount) || readPositiveNumberOrNull(metadata.recoveredObstacleCount))
    coverage.project_materials = Boolean(readPositiveNumberOrNull(metadata.materialPendingWithDateCount) || readPositiveNumberOrNull(metadata.materialPendingWithoutDateCount))
    coverage.drawing_package_schedule_impact = Boolean(readPositiveNumberOrNull(metadata.drawingHardConditionCount))
    coverage.certificate_work_item_gate = (metadata.sourceEntityKeys as unknown[] | undefined)?.some((key) => String(key).includes('certificate') || String(key).includes('pre_milestone')) ?? false
  }
  return coverage
}
