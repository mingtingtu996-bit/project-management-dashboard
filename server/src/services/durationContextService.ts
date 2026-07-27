import { logger } from '../middleware/logger.js'
import type {
  ActiveReadinessRows,
  DurationContextActionPolicy,
  DurationContextFactor,
  DurationContextFactorKey,
  DurationContextInput,
  ProgressSnapshotFacts,
} from '../types/durationContext.js'
export type {
  ActiveReadinessRows,
  DurationContextActionPolicy,
  DurationContextFactor,
  DurationContextFactorKey,
  DurationContextInput,
  ProgressSnapshotFacts,
} from '../types/durationContext.js'
import {
  inclusiveDurationDays,
  normalizeDurationDateUtc,
  orderedInclusiveDurationDays,
  signedDurationDayDelta,
} from '../utils/durationDays.js'
import {
  resolveAlgorithmSeedRecords,
  hasV1474WorkCalendarForYear,
  resolveV1474HolidayWindow,
  resolveV1474ResourceClass,
  resolveStandardWorkDurationSeed,
  inferTitleWeakStandardWorkMatchesFromResolver,
  inferDurationContributionModeFromResolver,
  inferExecutionNatureFromResolver,
  inferResourcePressureDimensionsFromResolver,
  inferWorkEnvironmentFromResolver,
  isDurationBearingContributionModeFromResolver,
  normalizeExecutionNatureFromResolver,
  normalizeWorkEnvironmentFromResolver,
  resolveDurationContributionModeFromResolver,
  type AlgorithmSeedResolveContext,
  type DurationContributionMode,
  type ExecutionNature,
  type V1474PressureDimension,
  type WorkEnvironment,
} from './algorithmSeedResolver.js'
import { getProjectCompanyId } from '../auth/access.js'
import { loadAlgorithmAssetLearnableParameterRuntimeValue } from './algorithmAssetLearnableParameterRuntimeConsumptionService.js'
import { readProjectGenerationFactsSnapshot } from './projectGenerationFactsSnapshotService.js'
import {
  buildAlgorithmFactContext,
  summarizeAlgorithmFactContext,
} from './algorithmFactContextService.js'
import {
  readDurationContextProgressTrendSnapshotRows,
  readDurationContextResourceConflictTaskRows,
  readDurationContextResourceReadinessRows,
  readDurationContextResponsibleUnitHistoryRows,
  readDurationContextTaskContextRow,
  readDurationContextTaskReadinessRows,
} from './durationContextFactReadModelService.js'
import {
  buildCausalDedupeDiagnostics,
  buildEffectiveFactorContributionLedger,
  buildExplainPackage,
  buildFactorContributionLedger,
  buildInputCoverage,
  buildReadinessGraph,
  buildScopeContext,
  CLIMATE_DURATION_FACTOR_KEYS,
  DURATION_CONTEXT_FACTOR_SYNTHESIS_CONFIDENCE_DELTA_MAX,
  DURATION_CONTEXT_FACTOR_SYNTHESIS_CONFIDENCE_DELTA_MIN,
  DURATION_CONTEXT_FACTOR_SYNTHESIS_MULTIPLIER_SAFETY_MAX,
  fallbackContributionLedgerFromFactors,
  resolveDurationContextInterferenceMatrix,
  summarizeLedgerDurationScenario,
} from './durationContextFactorSynthesisService.js'
import { buildProgressQualityFactor } from './durationContextProgressQualityFactorService.js'
import {
  applyProjectScheduleStatePolicy,
  buildProjectScheduleStateFactor,
} from './durationContextProjectScheduleStateFactorService.js'
import { buildProjectBaselineCalibrationFactor } from './durationContextProjectBaselineCalibrationFactorService.js'
import { buildProductivityCompensationFactor } from './durationContextProductivityCompensationFactorService.js'
import { buildWorkflowSequenceFactor } from './durationContextWorkflowSequenceFactorService.js'
import { buildPmRecoveryCompensationFactorWithEligibility } from './durationContextPmRecoveryCompensationFactorService.js'
import {
  applyProductivityCeilingToScenario,
  resolveActiveWeatherProductivityCeiling,
} from './durationContextActiveWeatherProductivityCeilingService.js'
import { buildSeasonalFactor } from './durationContextSeasonalProductivityFactorService.js'
import { buildProcessSeasonalFactor } from './durationContextProcessSeasonalSensitivityFactorService.js'
import { buildWeatherForecastImpactFactor } from './durationContextWeatherForecastImpactFactorService.js'
import { buildProcessConstraintFactor } from './durationContextProcessConstraintFactorService.js'
import {
  buildExternalReadinessFactor,
  loadActiveReadinessRows,
  loadTaskProgressSnapshotFacts,
  summarizeExternalReadinessCause,
  type ExternalReadinessCalibrationOverlay,
} from './durationContextExternalReadinessFactorService.js'

export interface DurationContextSummary {
  contextVersion: 'v1.4.7.4'
  multiplier: number
  extraDays: number
  confidenceDelta: number
  rawConfidenceDelta?: number
  adjustedBy: DurationContextFactorKey[]
  factors: DurationContextFactor[]
  businessReasons: string[]
  hasLowConfidenceSignal: boolean
  dataMaturity?: 'L0' | 'L1' | 'L2' | string
  factorAvailability?: Record<string, boolean>
  parentDurationBoundary?: Record<string, unknown>
  upgradePath?: string[]
  upgradeBlockedBy?: string[]
  dataDependencies?: string[]
  scaleFactor?: number
  scaleConfidence?: 'high' | 'medium' | 'low' | 'unavailable'
  scaleBasis?: string | null
  scaleSignals?: string[]
  scaleReason?: string | null
  calculationContext: {
    duration_source: 'standard' | 'benchmark' | 'forecast' | 'legacy'
    adjusted_by: DurationContextFactorKey[]
    confidence_level: 'high' | 'medium' | 'low'
    factor_summary_available: boolean
    raw_multiplier?: number
    climate_multiplier_cap?: number
    climate_productivity_floor?: number
    climate_productivity_floor_policy?: string
    climate_applied_factor_count?: number
    climate_cap_applied?: boolean
    pm_recovery_factor?: number
    pm_recovery_applied?: boolean
    compensation_mutex?: {
      applied: boolean
      policy: string
      primaryFactorKey?: DurationContextFactorKey
      suppressedFactorKey?: DurationContextFactorKey
      suppressedIn?: string
    }
    productivity_compensation_factor?: number
    productivity_compensation_uplift?: number
    productivity_compensation_adjusted_productivity?: number
    productivity_compensation_applied?: boolean
    productivity_compensation_sources?: Array<Record<string, unknown>>
    external_readiness_calibration?: {
      applied: boolean
      calibrationId: string | null
      source: string
      weightScale?: Record<string, number>
    }
    project_baseline_factor?: number
    project_baseline_calibration_applied?: boolean
    active_weather_productivity_ceiling?: {
      applied: boolean
      maxProductivity: number
      minimumMultiplier: number
      reason: string
      matchedSignals: string[]
    }
    project_schedule_state?: string
    project_schedule_scope_type?: string
    project_schedule_scope_id?: string
    project_schedule_state_confidence?: number
    project_schedule_state_factor?: number
    project_schedule_state_resource_relaxation?: boolean
    project_schedule_state_velocity_superseded?: boolean
    project_schedule_state_composition?: Record<string, unknown>
    factor_interference_matrix?: Record<string, unknown>
    factor_cap_policy?: Record<string, unknown>
    committed_duration_context?: Record<string, unknown>
    candidate_duration_context?: Record<string, unknown>
    synthesis_order_policy?: Record<string, unknown>
    calendar_missing_subrule?: Record<string, unknown>
    building_pattern_contribution?: Record<string, unknown>
    building_pattern_weighted_cycle_days?: {
      firstFloor: number
      midFloors: number
      lastFloors: number
    }
    building_pattern_weighted_mid_floor_days?: number
    raw_extra_days?: number
    extra_days_cap?: number
    extra_days_cap_policy?: string
    extra_days_cap_applied?: boolean
    raw_confidence_delta?: number
    confidence_delta_cap?: number | { min: number; max: number }
    confidence_delta_cap_applied?: boolean
    velocity_skipped_due_to_zero_progress?: boolean
    velocity_skip_reason?: string
    climate_coupling_observability?: Array<Record<string, unknown>>
    scope_context?: {
      projectId: string | null
      taskId: string | null
      buildingObjectId: string | null
      floorObjectId: string | null
      zoneObjectId: string | null
      responsibleUnitId: string | null
      standardWorkCode: string | null
      standardWorkName: string | null
    }
    input_coverage?: Record<string, boolean>
    factor_contribution_ledger?: Array<{
      key: DurationContextFactorKey
      label: string
      multiplier: number
      extraDays: number
      confidenceDelta: number
      actionPolicy: DurationContextActionPolicy
      source: DurationContextFactor['source']
      contributionMode: string
      scopeFingerprint: string
      sourceEntityKeys: string[]
      dedupeKey: string
      dataDependencies: string[]
      reason: string
      originalMultiplier?: number
      originalExtraDays?: number
      originalConfidenceDelta?: number
      diagnosticOriginalMultiplier?: number
      diagnosticOriginalExtraDays?: number
      diagnosticOriginalConfidenceDelta?: number
      suppressedByFactorKey?: DurationContextFactorKey
    }>
    readiness_graph?: {
      primaryFactorKey: DurationContextFactorKey | null
      rootCauseEntityKeys: string[]
      relatedFactorKeys: DurationContextFactorKey[]
      scopeFingerprint: string
      policy: string
    }
    causal_dedupe?: {
      policy: string
      duplicateSourceEntityCount: number
      duplicateSourceEntityKeys: string[]
      suppressedFactorKeys: DurationContextFactorKey[]
      primaryBySourceEntity: Record<string, DurationContextFactorKey>
      appliedToSynthesis?: boolean
      suppressionByFactorKey?: Record<string, DurationContextFactorKey>
    }
    explain_package?: Record<string, unknown>
    algorithm_fact_context?: Record<string, unknown>
    durationOutputContract?: Record<string, unknown>
  }
}

type TaskContextRow = {
  id?: string | null
  project_id?: string | null
  title?: string | null
  planned_start_date?: string | null
  planned_end_date?: string | null
  start_date?: string | null
  end_date?: string | null
  actual_start_date?: string | null
  actual_end_date?: string | null
  progress?: number | null
  planned_quantity?: number | null
  completed_quantity?: number | null
  quantity_unit?: string | null
  template_node_id?: string | null
  engineering_category_id?: string | null
  wbs_node_type?: string | null
  standard_work_code?: string | null
  standard_work_name?: string | null
  building_object_id?: string | null
  basement_object_id?: string | null
  floor_object_id?: string | null
  physical_zone_object_id?: string | null
  functional_area_object_id?: string | null
  participant_unit_id?: string | null
  acceptance_required?: boolean | null
  material_required?: boolean | null
  standard_task_metadata?: Record<string, unknown> | null
}

const OPEN_CONDITION_STATUSES = ['pending', 'open', 'active', 'blocked', 'not_satisfied', '\u5f85\u6ee1\u8db3', '\u672a\u6ee1\u8db3', '\u53d7\u963b']
const OPEN_OBSTACLE_STATUSES = ['pending', 'open', 'active', 'resolving', 'in_progress', 'blocked', '\u5f85\u5904\u7406', '\u5904\u7406\u4e2d', '\u53d7\u963b']
const RESOURCE_CONDITION_TYPES = ['personnel', 'equipment', 'material', '\u4eba\u5458', '\u8bbe\u5907', '\u6750\u6599']
const RESOURCE_OBSTACLE_TYPES = ['personnel', 'equipment', 'material', '\u4eba\u5458', '\u8bbe\u5907', '\u6750\u6599']
const DURATION_MULTIPLIER_SAFETY_MAX = DURATION_CONTEXT_FACTOR_SYNTHESIS_MULTIPLIER_SAFETY_MAX
const DURATION_CONTEXT_CONFIDENCE_DELTA_MIN = DURATION_CONTEXT_FACTOR_SYNTHESIS_CONFIDENCE_DELTA_MIN
const DURATION_CONTEXT_CONFIDENCE_DELTA_MAX = DURATION_CONTEXT_FACTOR_SYNTHESIS_CONFIDENCE_DELTA_MAX
type DurationContextProgressCurve = 'linear' | 'front_heavy' | 'back_heavy' | 's_curve' | 'hold'

const FACTOR_MULTIPLIER_CAP_POLICY: Partial<Record<DurationContextFactorKey, {
  min: number
  max: number
  policy: string
}>> = {
  seasonal_productivity: { min: 1, max: 1.35, policy: 'seasonal_pressure_cap' },
  process_seasonal_sensitivity: { min: 1, max: 1.3, policy: 'process_weather_sensitivity_cap' },
  weather_forecast_impact: { min: 1, max: 1.35, policy: 'weather_forecast_pressure_cap' },
  process_constraint: { min: 1, max: 1.3, policy: 'process_constraint_pressure_cap' },
  external_readiness: { min: 1, max: 1.35, policy: 'external_readiness_pressure_cap' },
  progress_velocity: { min: 0.85, max: 1.35, policy: 'progress_velocity_bidirectional_cap' },
  resource_conflict: { min: 1, max: 1.5, policy: 'site_capacity_pressure_cap' },
  workflow_sequence: { min: 1, max: 1.2, policy: 'workflow_sequence_cap' },
  project_schedule_state: { min: 0.85, max: 1.1, policy: 'schedule_state_bidirectional_cap' },
  productivity_compensation: { min: 0.7, max: 1, policy: 'productivity_compensation_acceleration_cap' },
  pm_recovery_compensation: { min: 0.86, max: 1, policy: 'pm_recovery_candidate_cap' },
  project_baseline_calibration: { min: 0.8, max: 1.2, policy: 'project_baseline_calibration_cap' },
}

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

const DEFAULT_SITE_CAPACITY_PRESSURE_POLICY = {
  weights: {
    sameResponsibleUnit: 1,
    sameBuilding: 1,
    sameFloor: 1.35,
    sameZone: 1.6,
    sameResourceClass: 1,
    lowParallelCapacity: 1.35,
    highParallelCapacity: 0.65,
    singleTaskProgressOnly: 0.35,
    trendPressure: 2,
    capacityLimitExcess: 1.2,
    responsibleUnitHistoryPressure: 1.2,
    progressPressure: 5,
    resourceCondition: 1,
    resourceObstacle: 2,
    overdueMaterial: 1,
    severeObstacle: 2,
    longTermSignal: 2,
    veryLongTermBonus: 2,
    verticalTransportLimited: 1.2,
    seasonWindowEmphasis: 1.15,
  },
  thresholds: {
    longTermSignalDays: 7,
    veryLongTermSignalDays: 14,
    trendWindowDays: 14,
    trendMinSpanDays: 3,
    trendSlowDeltaPercent: 6,
    trendStagnantDeltaPercent: 2,
    trendRecoveryDeltaPercent: 12,
    mediumScore: 6,
    highScore: 13,
    complexityLevel: {
      normal: { multiplierMax: 1.2 },
      complex: { multiplierMax: 1.35 },
      high_complex: { multiplierMax: 1.5 },
    },
  },
  caps: {
    multiplierMin: 1.03,
    multiplierMax: 1.35,
    multiplierStep: 0.018,
    maxExtraDays: 21,
    maxMaterialExtraDays: 3,
    maxConfidencePenalty: 25,
  },
  effectPolicy: {
    coldStartPolicy: 'observation_only',
    actionPolicy: 'candidate_only',
    minSamplesForActiveMode: 30,
    canAffectNewTaskReference: true,
    canAffectRemainingForecast: true,
    canExplainDeviation: true,
    canCreateRiskIssue: false,
  },
}

const SITE_PRESSURE_MULTIPLIER_PARAMETER_KEY = 'duration.context.site_pressure_multiplier'
const SITE_PRESSURE_MULTIPLIER_CANARY_CONSUMER_KEY = 'durationContextService.resource_conflict'
const SITE_PRESSURE_MULTIPLIER_CANARY_BOUNDARY = {
  consumerKey: SITE_PRESSURE_MULTIPLIER_CANARY_CONSUMER_KEY,
  scopeBoundary: 'company',
  stopConditionKeys: [
    'site_pressure_overcompensation_rate',
    'site_pressure_mae_regression',
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

function normalizeLower(value: unknown) {
  return normalizeText(value).toLowerCase()
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

function uniqueTextArray(values: unknown[]) {
  return Array.from(new Set(values.flatMap(readNormalizedTextArray).map(normalizeText).filter(Boolean)))
}

function readMetadataText(metadata: Record<string, unknown> | null | undefined, keys: string[]) {
  for (const key of keys) {
    const raw = metadata?.[key]
    if (Array.isArray(raw)) {
      const value = raw.map(normalizeText).filter(Boolean)[0]
      if (value) return value
      continue
    }
    const text = normalizeText(raw)
    if (text) return text
  }
  return null
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

const PRESSURE_DIMENSIONS: V1474PressureDimension[] = ['labor', 'material', 'equipment', 'workface']

function normalizePressureDimensions(value: unknown): V1474PressureDimension[] {
  const dimensions = readNormalizedTextArray(value)
    .map((item) => item.toLowerCase())
    .filter((item): item is V1474PressureDimension => (PRESSURE_DIMENSIONS as string[]).includes(item))
  return [...new Set(dimensions)]
}

function resolveResourcePressureDimensions(resource: Record<string, unknown> | null | undefined): V1474PressureDimension[] {
  const explicit = normalizePressureDimensions(
    resource?.pressureDimensions
      ?? resource?.pressure_dimensions
      ?? readRecord(resource?.mapping).pressureDimensions
      ?? readRecord(resource?.mapping).pressure_dimensions,
  )
  if (explicit.length > 0) return explicit
  return inferResourcePressureDimensionsFromResolver(normalizeText(resource?.resourceClass ?? resource?.resource_class) || null)
}

function pressureDimensionsForReadinessType(value: unknown): V1474PressureDimension[] {
  const normalized = normalizeText(value).toLowerCase()
  if (['personnel', '\u4eba\u5458', 'labor', 'crew'].includes(normalized)) return ['labor']
  if (['equipment', '\u8bbe\u5907', 'machine', 'machinery'].includes(normalized)) return ['equipment']
  if (['material', '\u6750\u6599'].includes(normalized)) return ['material']
  return ['workface']
}

function createPressureDimensionScores() {
  return PRESSURE_DIMENSIONS.reduce((record, dimension) => {
    record[dimension] = 0
    return record
  }, {} as Record<V1474PressureDimension, number>)
}

function addPressureDimensionScore(
  scores: Record<V1474PressureDimension, number>,
  dimensions: V1474PressureDimension[],
  value: number,
) {
  if (!Number.isFinite(value) || value <= 0) return
  const scopedDimensions = dimensions.length > 0 ? [...new Set(dimensions)] : ['workface' as V1474PressureDimension]
  const portion = value / scopedDimensions.length
  scopedDimensions.forEach((dimension) => {
    scores[dimension] += portion
  })
}

function dominantPressureDimensions(scores: Record<V1474PressureDimension, number>) {
  return PRESSURE_DIMENSIONS
    .map((dimension) => ({ dimension, score: Number(scores[dimension].toFixed(3)) }))
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score)
}

function isObservationOnlySiteCapacityColdStart(
  policy: Awaited<ReturnType<typeof loadSiteCapacityPressurePolicy>>,
  progressTrendPressure: ProgressTrendPressure,
  responsibleUnitHistoryPressure: { score: number; sampleCount: number; averageDurationRatio: number | null },
) {
  const sampleCount = progressTrendPressure.taskTrends.length + responsibleUnitHistoryPressure.sampleCount
  const minSamplesForActiveMode = Math.max(0, policy.effectPolicy.minSamplesForActiveMode)
  return policy.effectPolicy.coldStartPolicy === 'observation_only'
    && sampleCount < minSamplesForActiveMode
}

function readNumber(value: unknown, fallback: number) {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

function readPositiveNumberOrNull(value: unknown) {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? number : null
}

function readBoolean(value: unknown, fallback = false) {
  if (value === true || value === 1 || value === 'true' || value === '1') return true
  if (value === false || value === 0 || value === 'false' || value === '0') return false
  return fallback
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

function parseDate(value: unknown) {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value
  const normalized = normalizeDate(value)
  if (!normalized) return null
  const parsed = new Date(`${normalized}T00:00:00.000Z`)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function uniqueIds(values: Array<unknown>) {
  return [...new Set(values.map(normalizeId).filter(Boolean) as string[])]
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

function isResourceConditionType(value: unknown) {
  return RESOURCE_CONDITION_TYPES.includes(normalizeId(value) ?? '')
}

function isResourceObstacleType(value: unknown) {
  return RESOURCE_OBSTACLE_TYPES.includes(normalizeId(value) ?? '')
}

function daysSince(value: unknown) {
  const date = parseDate(value)
  if (!date) return 0
  return Math.max(0, signedDurationDayDelta(date, new Date()) ?? 0)
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function round(value: number, precision = 3) {
  const factor = 10 ** precision
  return Math.round(value * factor) / factor
}

function normalizeFactorMultiplier(
  key: DurationContextFactorKey,
  multiplier: number,
) {
  const policy = FACTOR_MULTIPLIER_CAP_POLICY[key]
  const safeMultiplier = Number.isFinite(multiplier) ? multiplier : 1
  if (!policy) {
    return {
      multiplier: safeMultiplier,
      capMetadata: {
        multiplierMin: null,
        multiplierMax: null,
        originalMultiplier: safeMultiplier,
        normalizedMultiplier: safeMultiplier,
        capApplied: false,
        policy: 'no_factor_specific_cap',
      },
    }
  }
  const normalized = round(clamp(safeMultiplier, policy.min, policy.max))
  return {
    multiplier: normalized,
    capMetadata: {
      multiplierMin: policy.min,
      multiplierMax: policy.max,
      originalMultiplier: safeMultiplier,
      normalizedMultiplier: normalized,
      capApplied: Math.abs(normalized - safeMultiplier) > 0.001,
      policy: policy.policy,
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

async function loadSitePressureCanaryRuntimeMultiplier(input: {
  projectId: string
  originalMultiplier: number
  multiplierMax: number
}) {
  const companyId = await getProjectCompanyId(input.projectId)
  if (!companyId) return null

  try {
    const result = await loadAlgorithmAssetLearnableParameterRuntimeValue({
      parameterKey: SITE_PRESSURE_MULTIPLIER_PARAMETER_KEY,
      companyId,
      projectId: input.projectId,
      consumptionMode: 'canary',
      canaryRuntimeBoundary: SITE_PRESSURE_MULTIPLIER_CANARY_BOUNDARY,
    })
    if (!result.runtimeConsumable || typeof result.runtimeValue !== 'number') return null

    const runtimeMultiplier = clamp(result.runtimeValue, 1, Math.max(1, input.multiplierMax))
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
        originalSitePressureMultiplier: input.originalMultiplier,
        runtimeMultiplier,
        appliedTo: 'new_resource_conflict_factor_only',
        consumerKey: SITE_PRESSURE_MULTIPLIER_CANARY_CONSUMER_KEY,
      },
    }
  } catch (error) {
    logger.warn('[durationContextService] failed to load canary site pressure multiplier runtime parameter', {
      projectId: input.projectId,
      parameterKey: SITE_PRESSURE_MULTIPLIER_PARAMETER_KEY,
      error,
    })
    return null
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

async function loadTaskContext(taskId: string | null): Promise<TaskContextRow | null> {
  if (!taskId) return null

  const { data, error } = await readDurationContextTaskContextRow({ taskId })

  if (error) {
    logger.warn('[durationContextService] failed to load task context', { taskId, error })
    return null
  }

  return (data ?? null) as TaskContextRow | null
}

function mergeTaskContext(input: DurationContextInput, task: TaskContextRow | null): DurationContextInput {
  if (!task) return input
  const standardTaskMetadata = readRecord(task.standard_task_metadata)
  const mergedMetadata = input.standardTaskMetadata ?? standardTaskMetadata
  const inputMethodVariantCodes = readNormalizedTextArray(input.methodVariantCodes)
  const inputElementVariantCodes = readNormalizedTextArray(input.elementVariantCodes)

  return {
    ...input,
    projectId: normalizeId(input.projectId) ?? normalizeId(task.project_id),
    taskId: normalizeId(input.taskId) ?? normalizeId(task.id),
    standardTaskMetadata: mergedMetadata,
    templateNodeId: normalizeId(input.templateNodeId) ?? normalizeId(task.template_node_id),
    engineeringCategoryId: normalizeId(input.engineeringCategoryId) ?? normalizeId(task.engineering_category_id),
    wbsNodeType: normalizeText(input.wbsNodeType) || normalizeText(task.wbs_node_type) || null,
    standardWorkCode: normalizeText(input.standardWorkCode) || normalizeText(task.standard_work_code) || null,
    standardWorkName: normalizeText(input.standardWorkName) || normalizeText(task.standard_work_name) || null,
    taskTitle: normalizeText(input.taskTitle) || normalizeText(task.title) || null,
    plannedStartDate: normalizeDate(input.plannedStartDate) ?? normalizeDate(task.planned_start_date ?? task.start_date),
    plannedEndDate: normalizeDate(input.plannedEndDate) ?? normalizeDate(task.planned_end_date ?? task.end_date),
    actualStartDate: normalizeDate(input.actualStartDate) ?? normalizeDate(task.actual_start_date),
    actualEndDate: normalizeDate(input.actualEndDate) ?? normalizeDate(task.actual_end_date),
    progress: typeof input.progress === 'number' ? input.progress : Number(task.progress ?? 0),
    plannedQuantity: readPositiveNumberOrNull(input.plannedQuantity) ?? readPositiveNumberOrNull(task.planned_quantity),
    completedQuantity: readPositiveNumberOrNull(input.completedQuantity) ?? readPositiveNumberOrNull(task.completed_quantity),
    quantityUnit: normalizeText(input.quantityUnit) || normalizeText(task.quantity_unit) || null,
    buildingObjectId: normalizeId(input.buildingObjectId) ?? normalizeId(task.building_object_id),
    floorObjectId: normalizeId(input.floorObjectId) ?? normalizeId(task.floor_object_id),
    zoneObjectId: normalizeId(input.zoneObjectId) ?? normalizeId(task.physical_zone_object_id) ?? normalizeId(task.functional_area_object_id),
    responsibleUnitId: normalizeId(input.responsibleUnitId) ?? normalizeId(task.participant_unit_id),
    projectTypeCode: normalizeText(input.projectTypeCode)
      || readMetadataText(mergedMetadata, ['projectTypeCode', 'project_type_code', 'projectType', 'project_type'])
      || null,
    structureTypeCode: normalizeText(input.structureTypeCode)
      || readMetadataText(mergedMetadata, ['structureTypeCode', 'structure_type_code', 'structureType', 'structure_type'])
      || null,
    methodVariantCodes: inputMethodVariantCodes.length > 0
      ? inputMethodVariantCodes
      : readMetadataTextArray(mergedMetadata, ['methodVariantCodes', 'method_variant_codes', 'methodVariantCode', 'method_variant_code']),
    elementVariantCodes: inputElementVariantCodes.length > 0
      ? inputElementVariantCodes
      : readMetadataTextArray(mergedMetadata, ['elementVariantCodes', 'element_variant_codes', 'elementVariantCode', 'element_variant_code']),
    acceptanceRequired: input.acceptanceRequired ?? task.acceptance_required ?? null,
    materialRequired: input.materialRequired ?? task.material_required ?? null,
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
type ResourceReadinessPressure = {
  resourceConditionCount: number
  resourceObstacleCount: number
  overdueMaterialCount: number
  severeObstacleCount: number
  longTermResourceSignalCount: number
  maxSignalAgeDays: number
  signalAges: number[]
  readinessDimensionCounts: Record<V1474PressureDimension, number>
  sourceEntityKeys: string[]
}

function emptyResourceReadinessPressure(): ResourceReadinessPressure {
  return {
    resourceConditionCount: 0,
    resourceObstacleCount: 0,
    overdueMaterialCount: 0,
    severeObstacleCount: 0,
    longTermResourceSignalCount: 0,
    maxSignalAgeDays: 0,
    signalAges: [] as number[],
    readinessDimensionCounts: createPressureDimensionScores(),
    sourceEntityKeys: [],
  }
}

function buildResourceReadinessPressureFromRows(rows: ActiveReadinessRows): ResourceReadinessPressure {
  const today = new Date()
  const signalAges: number[] = []
  const resourceConditions = rows.conditions
    .filter((row: Record<string, unknown>) => isOpenCondition(row) && isResourceConditionType(row.condition_type))
  const resourceObstacles = rows.obstacles
    .filter((row: Record<string, unknown>) => isOpenObstacle(row) && isResourceObstacleType(row.obstacle_type))
  const overdueMaterials = rows.materials
    .filter((row: Record<string, unknown>) => {
      if (row.actual_arrival_date) return false
      const expected = parseDate(row.expected_arrival_date)
      return Boolean(expected && expected < today)
    })

  resourceConditions.forEach((row: Record<string, unknown>) => {
    signalAges.push(Math.max(daysSince(row.target_date), daysSince(row.created_at)))
  })
  resourceObstacles.forEach((row: Record<string, unknown>) => {
    signalAges.push(Math.max(daysSince(row.expected_resolution_date ?? row.estimated_resolve_date), daysSince(row.created_at)))
  })
  overdueMaterials.forEach((row: Record<string, unknown>) => {
    signalAges.push(daysSince(row.expected_arrival_date))
  })

  const readinessDimensionCounts = createPressureDimensionScores()
  resourceConditions.forEach((row: Record<string, unknown>) => {
    addPressureDimensionScore(readinessDimensionCounts, pressureDimensionsForReadinessType(row.condition_type), 1)
  })
  resourceObstacles.forEach((row: Record<string, unknown>) => {
    addPressureDimensionScore(readinessDimensionCounts, pressureDimensionsForReadinessType(row.obstacle_type), 1)
  })
  addPressureDimensionScore(readinessDimensionCounts, ['material'], overdueMaterials.length)

  const severeObstacleCount = resourceObstacles.filter((row: Record<string, unknown>) => {
    const severity = normalizeText(row.severity).toLowerCase()
    return ['high', 'critical', 'warning', '\u9ad8', '\u4e25\u91cd'].includes(severity)
  }).length

  return {
    resourceConditionCount: resourceConditions.length,
    resourceObstacleCount: resourceObstacles.length,
    overdueMaterialCount: overdueMaterials.length,
    severeObstacleCount,
    longTermResourceSignalCount: signalAges.filter((age) => age >= 7).length,
    maxSignalAgeDays: signalAges.length > 0 ? Math.max(...signalAges) : 0,
    signalAges,
    readinessDimensionCounts,
    sourceEntityKeys: [
      ...compactSourceEntityKeys(resourceConditions as Array<Record<string, unknown>>, 'task_condition'),
      ...compactSourceEntityKeys(resourceObstacles as Array<Record<string, unknown>>, 'task_obstacle'),
      ...compactSourceEntityKeys(overdueMaterials as Array<Record<string, unknown>>, 'project_material'),
    ].slice(0, 30),
  }
}

function emptyActiveReadinessRows(): ActiveReadinessRows {
  return { conditions: [], obstacles: [], materials: [] }
}

function mergeActiveReadinessRows(rowSets: ActiveReadinessRows[]): ActiveReadinessRows {
  return rowSets.reduce((merged, rows) => ({
    conditions: [...merged.conditions, ...rows.conditions],
    obstacles: [...merged.obstacles, ...rows.obstacles],
    materials: [...merged.materials, ...rows.materials],
  }), emptyActiveReadinessRows())
}

export type DurationContextRuntimeCache = {
  activeReadinessRowsByTaskId: Map<string, Promise<ActiveReadinessRows>>
  progressSnapshotFactsByTaskId: Map<string, Promise<ProgressSnapshotFacts>>
  externalReadinessCalibrationByProjectId: Map<string, Promise<ExternalReadinessCalibrationOverlay>>
  resourceReadinessPressureByScope: Map<string, Promise<ResourceReadinessPressure>>
  resourceReadinessRowsByTaskId: Map<string, Promise<ActiveReadinessRows>>
}

function createDurationContextRuntimeCache(): DurationContextRuntimeCache {
  return {
    activeReadinessRowsByTaskId: new Map(),
    progressSnapshotFactsByTaskId: new Map(),
    externalReadinessCalibrationByProjectId: new Map(),
    resourceReadinessPressureByScope: new Map(),
    resourceReadinessRowsByTaskId: new Map(),
  }
}

function summarizeDurationContextRuntimeCache(runtimeCache: DurationContextRuntimeCache) {
  return {
    scope: 'single_build_duration_context_request',
    activeReadinessRowsCached: runtimeCache.activeReadinessRowsByTaskId.size,
    progressSnapshotFactsCached: runtimeCache.progressSnapshotFactsByTaskId.size,
    externalReadinessCalibrationCached: runtimeCache.externalReadinessCalibrationByProjectId.size,
    resourceReadinessPressureCached: runtimeCache.resourceReadinessPressureByScope.size,
    resourceReadinessTaskRowsCached: runtimeCache.resourceReadinessRowsByTaskId.size,
    policy: 'request_local_project_task_granular_promise_cache_no_cross_request_reuse',
  }
}

function cacheKeyFromId(value: unknown) {
  return normalizeId(value) ?? '__none__'
}

async function loadResourceReadinessPressure(
  projectId: string,
  taskIds: string[],
  runtimeCache?: DurationContextRuntimeCache,
): Promise<ResourceReadinessPressure> {
  const scopedTaskIds = uniqueIds(taskIds)
  if (!projectId || scopedTaskIds.length === 0) return emptyResourceReadinessPressure()

  if (runtimeCache) {
    const cacheKey = `${projectId}:${scopedTaskIds.slice().sort().join('|')}`
    const current = runtimeCache.resourceReadinessPressureByScope.get(cacheKey)
    if (current) return current
    const promise = loadResourceReadinessRowsForTasks(projectId, scopedTaskIds, runtimeCache)
      .then((rows) => buildResourceReadinessPressureFromRows(rows))
    runtimeCache.resourceReadinessPressureByScope.set(cacheKey, promise)
    return promise
  }

  const rawReadinessRows = await readDurationContextResourceReadinessRows({
    projectId,
    taskIds: scopedTaskIds,
  })

  const today = new Date()
  const signalAges: number[] = []
  const resourceConditions = rawReadinessRows.conditions
    .filter((row: Record<string, unknown>) => isOpenCondition(row) && isResourceConditionType(row.condition_type))
  const resourceObstacles = rawReadinessRows.obstacles
    .filter((row: Record<string, unknown>) => isOpenObstacle(row) && isResourceObstacleType(row.obstacle_type))
  const overdueMaterials = rawReadinessRows.materials
    .filter((row: Record<string, unknown>) => {
      if (row.actual_arrival_date) return false
      const recordStatus = normalizeId(row.record_status)
      const lifecycleStatus = normalizeId(row.lifecycle_status)
      if (recordStatus && !['active', 'normal'].includes(recordStatus)) return false
      if (lifecycleStatus && ['archived', 'voided', 'deleted'].includes(lifecycleStatus)) return false
      const expected = parseDate(row.expected_arrival_date)
      return Boolean(expected && expected < today)
    })

  resourceConditions.forEach((row: Record<string, unknown>) => {
    signalAges.push(Math.max(daysSince(row.target_date), daysSince(row.created_at)))
  })
  resourceObstacles.forEach((row: Record<string, unknown>) => {
    signalAges.push(Math.max(daysSince(row.expected_resolution_date ?? row.estimated_resolve_date), daysSince(row.created_at)))
  })
  overdueMaterials.forEach((row: Record<string, unknown>) => {
    signalAges.push(daysSince(row.expected_arrival_date))
  })

  const readinessDimensionCounts = createPressureDimensionScores()
  resourceConditions.forEach((row: Record<string, unknown>) => {
    addPressureDimensionScore(readinessDimensionCounts, pressureDimensionsForReadinessType(row.condition_type), 1)
  })
  resourceObstacles.forEach((row: Record<string, unknown>) => {
    addPressureDimensionScore(readinessDimensionCounts, pressureDimensionsForReadinessType(row.obstacle_type), 1)
  })
  addPressureDimensionScore(readinessDimensionCounts, ['material'], overdueMaterials.length)

  const longTermResourceSignalCount = signalAges.filter((age) => age >= 7).length
  const severeObstacleCount = resourceObstacles.filter((row: Record<string, unknown>) => {
    const severity = normalizeText(row.severity).toLowerCase()
    return ['high', 'critical', 'warning', '\u9ad8', '\u4e25\u91cd'].includes(severity)
  }).length

  return {
    resourceConditionCount: resourceConditions.length,
    resourceObstacleCount: resourceObstacles.length,
    overdueMaterialCount: overdueMaterials.length,
    severeObstacleCount,
    longTermResourceSignalCount,
    maxSignalAgeDays: signalAges.length > 0 ? Math.max(...signalAges) : 0,
    signalAges,
    readinessDimensionCounts,
    sourceEntityKeys: [
      ...compactSourceEntityKeys(resourceConditions as Array<Record<string, unknown>>, 'task_condition'),
      ...compactSourceEntityKeys(resourceObstacles as Array<Record<string, unknown>>, 'task_obstacle'),
      ...compactSourceEntityKeys(overdueMaterials as Array<Record<string, unknown>>, 'project_material'),
    ].slice(0, 30),
  }
}

async function loadResourceReadinessRowsForTasks(
  projectId: string,
  taskIds: string[],
  runtimeCache: DurationContextRuntimeCache,
): Promise<ActiveReadinessRows> {
  const normalizedProjectId = normalizeId(projectId)
  const normalizedTaskIds = uniqueIds(taskIds)
  if (!normalizedProjectId || normalizedTaskIds.length === 0) return emptyActiveReadinessRows()

  const rowPromises = normalizedTaskIds.map((taskId) => {
    const cacheKey = `${normalizedProjectId}:${taskId}`
    const activeRowsPromise = runtimeCache.activeReadinessRowsByTaskId.get(cacheKeyFromId(taskId))
    if (activeRowsPromise && !runtimeCache.resourceReadinessRowsByTaskId.has(cacheKey)) {
      runtimeCache.resourceReadinessRowsByTaskId.set(cacheKey, activeRowsPromise)
    }
    return {
      taskId,
      cacheKey,
      promise: runtimeCache.resourceReadinessRowsByTaskId.get(cacheKey) ?? null,
    }
  })
  const missing = rowPromises.filter((item) => !item.promise)
  if (missing.length > 0) {
    const missingIds = missing.map((item) => item.taskId)
    const batchPromise = loadResourceReadinessRowsForTasksUncached(normalizedProjectId, missingIds)
    for (const item of missing) {
      const taskRowsPromise = batchPromise.then((rowsByTaskId) => rowsByTaskId.get(item.taskId) ?? emptyActiveReadinessRows())
      runtimeCache.resourceReadinessRowsByTaskId.set(item.cacheKey, taskRowsPromise)
      item.promise = taskRowsPromise
    }
  }

  const rowSets = await Promise.all(rowPromises.map((item) => item.promise ?? Promise.resolve(emptyActiveReadinessRows())))
  return mergeActiveReadinessRows(rowSets)
}

async function loadResourceReadinessRowsForTasksUncached(
  projectId: string,
  taskIds: string[],
): Promise<Map<string, ActiveReadinessRows>> {
  const scopedTaskIds = uniqueIds(taskIds)
  const rowsByTaskId = new Map<string, ActiveReadinessRows>()
  scopedTaskIds.forEach((taskId) => rowsByTaskId.set(taskId, emptyActiveReadinessRows()))
  if (scopedTaskIds.length === 0) return rowsByTaskId

  const rawReadinessRows = await readDurationContextResourceReadinessRows({
    projectId,
    taskIds: scopedTaskIds,
  })

  for (const row of rawReadinessRows.conditions) {
    const taskId = normalizeId(row.task_id)
    if (taskId && rowsByTaskId.has(taskId)) rowsByTaskId.get(taskId)?.conditions.push(row)
  }
  for (const row of rawReadinessRows.obstacles) {
    const taskId = normalizeId(row.task_id)
    if (taskId && rowsByTaskId.has(taskId)) rowsByTaskId.get(taskId)?.obstacles.push(row)
  }
  for (const row of rawReadinessRows.materials) {
    const taskId = normalizeId(row.linked_task_id)
    if (taskId && rowsByTaskId.has(taskId)) rowsByTaskId.get(taskId)?.materials.push(row)
  }

  return rowsByTaskId
}

async function loadSiteCapacityPressurePolicy(context: AlgorithmSeedResolveContext) {
  const records = await resolveAlgorithmSeedRecords('site_capacity_pressure', context)
  const active = records.find((record: any) => record.isActive !== false) ?? records[0] ?? {}
  const weights = readRecord((active as any).weights)
  const thresholds = readRecord((active as any).thresholds)
  const caps = readRecord((active as any).caps)
  const effectPolicy = readRecord((active as any).effectPolicy ?? (active as any).effect_policy)

  return {
    stableCode: normalizeText((active as any).stableCode ?? (active as any).__stableCode) || 'default_site_capacity_pressure_policy',
    resolverSource: (active as any).__resolverSource ?? 'ts_seed_fallback',
    weights: {
      sameResponsibleUnit: readNumber(weights.sameResponsibleUnit, DEFAULT_SITE_CAPACITY_PRESSURE_POLICY.weights.sameResponsibleUnit),
      sameBuilding: readNumber(weights.sameBuilding, DEFAULT_SITE_CAPACITY_PRESSURE_POLICY.weights.sameBuilding),
      sameFloor: readNumber(weights.sameFloor, DEFAULT_SITE_CAPACITY_PRESSURE_POLICY.weights.sameFloor),
      sameZone: readNumber(weights.sameZone, DEFAULT_SITE_CAPACITY_PRESSURE_POLICY.weights.sameZone),
      sameResourceClass: readNumber(weights.sameResourceClass, DEFAULT_SITE_CAPACITY_PRESSURE_POLICY.weights.sameResourceClass),
      lowParallelCapacity: readNumber(weights.lowParallelCapacity, DEFAULT_SITE_CAPACITY_PRESSURE_POLICY.weights.lowParallelCapacity),
      highParallelCapacity: readNumber(weights.highParallelCapacity, DEFAULT_SITE_CAPACITY_PRESSURE_POLICY.weights.highParallelCapacity),
      singleTaskProgressOnly: readNumber(weights.singleTaskProgressOnly, DEFAULT_SITE_CAPACITY_PRESSURE_POLICY.weights.singleTaskProgressOnly),
      trendPressure: readNumber(weights.trendPressure, DEFAULT_SITE_CAPACITY_PRESSURE_POLICY.weights.trendPressure),
      capacityLimitExcess: readNumber(weights.capacityLimitExcess, DEFAULT_SITE_CAPACITY_PRESSURE_POLICY.weights.capacityLimitExcess),
      responsibleUnitHistoryPressure: readNumber(weights.responsibleUnitHistoryPressure, DEFAULT_SITE_CAPACITY_PRESSURE_POLICY.weights.responsibleUnitHistoryPressure),
      progressPressure: readNumber(weights.progressPressure, DEFAULT_SITE_CAPACITY_PRESSURE_POLICY.weights.progressPressure),
      resourceCondition: readNumber(weights.resourceCondition, DEFAULT_SITE_CAPACITY_PRESSURE_POLICY.weights.resourceCondition),
      resourceObstacle: readNumber(weights.resourceObstacle, DEFAULT_SITE_CAPACITY_PRESSURE_POLICY.weights.resourceObstacle),
      overdueMaterial: readNumber(weights.overdueMaterial, DEFAULT_SITE_CAPACITY_PRESSURE_POLICY.weights.overdueMaterial),
      severeObstacle: readNumber(weights.severeObstacle, DEFAULT_SITE_CAPACITY_PRESSURE_POLICY.weights.severeObstacle),
      longTermSignal: readNumber(weights.longTermSignal, DEFAULT_SITE_CAPACITY_PRESSURE_POLICY.weights.longTermSignal),
      veryLongTermBonus: readNumber(weights.veryLongTermBonus, DEFAULT_SITE_CAPACITY_PRESSURE_POLICY.weights.veryLongTermBonus),
      verticalTransportLimited: readNumber(weights.verticalTransportLimited, DEFAULT_SITE_CAPACITY_PRESSURE_POLICY.weights.verticalTransportLimited),
      seasonWindowEmphasis: readNumber(weights.seasonWindowEmphasis, DEFAULT_SITE_CAPACITY_PRESSURE_POLICY.weights.seasonWindowEmphasis),
    },
    thresholds: {
      longTermSignalDays: Math.max(1, readNumber(thresholds.longTermSignalDays, DEFAULT_SITE_CAPACITY_PRESSURE_POLICY.thresholds.longTermSignalDays)),
      veryLongTermSignalDays: Math.max(1, readNumber(thresholds.veryLongTermSignalDays, DEFAULT_SITE_CAPACITY_PRESSURE_POLICY.thresholds.veryLongTermSignalDays)),
      trendWindowDays: Math.max(3, readNumber(thresholds.trendWindowDays, DEFAULT_SITE_CAPACITY_PRESSURE_POLICY.thresholds.trendWindowDays)),
      trendMinSpanDays: Math.max(1, readNumber(thresholds.trendMinSpanDays, DEFAULT_SITE_CAPACITY_PRESSURE_POLICY.thresholds.trendMinSpanDays)),
      trendSlowDeltaPercent: Math.max(0, readNumber(thresholds.trendSlowDeltaPercent, DEFAULT_SITE_CAPACITY_PRESSURE_POLICY.thresholds.trendSlowDeltaPercent)),
      trendStagnantDeltaPercent: Math.max(0, readNumber(thresholds.trendStagnantDeltaPercent, DEFAULT_SITE_CAPACITY_PRESSURE_POLICY.thresholds.trendStagnantDeltaPercent)),
      trendRecoveryDeltaPercent: Math.max(0, readNumber(thresholds.trendRecoveryDeltaPercent, DEFAULT_SITE_CAPACITY_PRESSURE_POLICY.thresholds.trendRecoveryDeltaPercent)),
      mediumScore: readNumber(thresholds.mediumScore, DEFAULT_SITE_CAPACITY_PRESSURE_POLICY.thresholds.mediumScore),
      highScore: readNumber(thresholds.highScore, DEFAULT_SITE_CAPACITY_PRESSURE_POLICY.thresholds.highScore),
      complexityLevel: {
        normal: {
          multiplierMax: readNumber(
            readRecord(readRecord(thresholds.complexityLevel ?? thresholds.complexity_level).normal).multiplierMax
              ?? readRecord(readRecord(thresholds.complexityLevel ?? thresholds.complexity_level).normal).multiplier_max,
            DEFAULT_SITE_CAPACITY_PRESSURE_POLICY.thresholds.complexityLevel.normal.multiplierMax,
          ),
        },
        complex: {
          multiplierMax: readNumber(
            readRecord(readRecord(thresholds.complexityLevel ?? thresholds.complexity_level).complex).multiplierMax
              ?? readRecord(readRecord(thresholds.complexityLevel ?? thresholds.complexity_level).complex).multiplier_max,
            DEFAULT_SITE_CAPACITY_PRESSURE_POLICY.thresholds.complexityLevel.complex.multiplierMax,
          ),
        },
        high_complex: {
          multiplierMax: readNumber(
            readRecord(readRecord(thresholds.complexityLevel ?? thresholds.complexity_level).high_complex).multiplierMax
              ?? readRecord(readRecord(thresholds.complexityLevel ?? thresholds.complexity_level).high_complex).multiplier_max,
            DEFAULT_SITE_CAPACITY_PRESSURE_POLICY.thresholds.complexityLevel.high_complex.multiplierMax,
          ),
        },
      },
    },
    caps: {
      multiplierMin: readNumber(caps.multiplierMin, DEFAULT_SITE_CAPACITY_PRESSURE_POLICY.caps.multiplierMin),
      multiplierMax: readNumber(caps.multiplierMax, DEFAULT_SITE_CAPACITY_PRESSURE_POLICY.caps.multiplierMax),
      multiplierStep: readNumber(caps.multiplierStep, DEFAULT_SITE_CAPACITY_PRESSURE_POLICY.caps.multiplierStep),
      maxExtraDays: Math.max(0, readNumber(caps.maxExtraDays, DEFAULT_SITE_CAPACITY_PRESSURE_POLICY.caps.maxExtraDays)),
      maxMaterialExtraDays: Math.max(0, readNumber(caps.maxMaterialExtraDays, DEFAULT_SITE_CAPACITY_PRESSURE_POLICY.caps.maxMaterialExtraDays)),
      maxConfidencePenalty: Math.max(1, readNumber(caps.maxConfidencePenalty, DEFAULT_SITE_CAPACITY_PRESSURE_POLICY.caps.maxConfidencePenalty)),
    },
    effectPolicy: {
      coldStartPolicy: normalizeText(effectPolicy.coldStartPolicy ?? effectPolicy.cold_start_policy)
        || DEFAULT_SITE_CAPACITY_PRESSURE_POLICY.effectPolicy.coldStartPolicy,
      actionPolicy: normalizeText(effectPolicy.actionPolicy ?? effectPolicy.action_policy)
        || DEFAULT_SITE_CAPACITY_PRESSURE_POLICY.effectPolicy.actionPolicy,
      minSamplesForActiveMode: Math.max(0, readNumber(
        effectPolicy.minSamplesForActiveMode ?? effectPolicy.min_samples_for_active_mode,
        DEFAULT_SITE_CAPACITY_PRESSURE_POLICY.effectPolicy.minSamplesForActiveMode,
      )),
      canAffectNewTaskReference: readBoolean(
        effectPolicy.canAffectNewTaskReference ?? effectPolicy.can_affect_new_task_reference,
        DEFAULT_SITE_CAPACITY_PRESSURE_POLICY.effectPolicy.canAffectNewTaskReference,
      ),
      canAffectRemainingForecast: readBoolean(
        effectPolicy.canAffectRemainingForecast ?? effectPolicy.can_affect_remaining_forecast,
        DEFAULT_SITE_CAPACITY_PRESSURE_POLICY.effectPolicy.canAffectRemainingForecast,
      ),
      canExplainDeviation: readBoolean(
        effectPolicy.canExplainDeviation ?? effectPolicy.can_explain_deviation,
        DEFAULT_SITE_CAPACITY_PRESSURE_POLICY.effectPolicy.canExplainDeviation,
      ),
      canCreateRiskIssue: readBoolean(
        effectPolicy.canCreateRiskIssue ?? effectPolicy.can_create_risk_issue,
        DEFAULT_SITE_CAPACITY_PRESSURE_POLICY.effectPolicy.canCreateRiskIssue,
      ),
    },
  }
}

type ResourceParallelCapacity = 'low' | 'medium' | 'high'
type ResourcePressureComplexityLevel = 'normal' | 'complex' | 'high_complex'

function normalizeParallelCapacity(value: unknown): ResourceParallelCapacity | null {
  const normalized = normalizeText(value).toLowerCase()
  if (normalized === 'low' || normalized === 'medium' || normalized === 'high') return normalized
  return null
}

function inferResourceParallelCapacity(resource: Record<string, unknown> | null | undefined): ResourceParallelCapacity {
  const explicit = normalizeParallelCapacity(resource?.parallelCapacity ?? resource?.parallel_capacity)
  if (explicit) return explicit
  const resourceClass = normalizeText(resource?.resourceClass ?? resource?.resource_class).toLowerCase()
  if ([
    'concrete_pour',
    'tower_crane',
    'construction_hoist',
    'steel_hoisting',
    'precast_hoisting',
    'scaffold',
    'curtain_wall',
    'elevator',
    'commissioning',
  ].includes(resourceClass)) return 'low'
  if ([
    'electrical',
    'plumbing',
    'hvac',
    'intelligent_system',
    'outdoor_utility',
    'landscape',
    'general_crew',
  ].includes(resourceClass)) return 'high'
  return 'medium'
}

function normalizedResourceText(...values: unknown[]) {
  return values.map(normalizeText).filter(Boolean).join(' ').toLowerCase()
}

function resourceClassValue(resource: Record<string, unknown> | null | undefined) {
  return normalizeText(resource?.resourceClass ?? resource?.resource_class).toLowerCase()
}

function hasAnyText(text: string, tokens: string[]) {
  return tokens.some((token) => text.includes(token))
}

function inferResourcePressureComplexity(
  resource: Record<string, unknown> | null | undefined,
  workContext: EffectiveStandardWorkContext,
): ResourcePressureComplexityLevel {
  const explicit = normalizeText(resource?.complexityLevel ?? resource?.complexity_level).toLowerCase()
  if (explicit === 'normal' || explicit === 'complex' || explicit === 'high_complex') return explicit
  const resourceClass = resourceClassValue(resource)
  const text = normalizedResourceText(
    resourceClass,
    resource?.resourceOperationType,
    resource?.resource_operation_type,
    workContext.standardWorkCode,
    workContext.standardWorkName,
    workContext.resourceContextText,
    workContext.durationSeedStableCode,
  )
  if (
    ['precast_hoisting', 'tower_crane', 'construction_hoist', 'steel_hoisting'].includes(resourceClass)
    || hasAnyText(text, ['pfb', 'precast', 'prefabricated', 'pc_', 'pc-', 'hoisting', 'lifting', 'mast section', 'tower crane', 'construction hoist'])
    || hasAnyText(text, ['\u88c5\u914d', '\u9884\u5236', '\u6784\u4ef6\u540a\u88c5', '\u5854\u540a', '\u65bd\u5de5\u7535\u68af', '\u5347\u964d\u673a', '\u540a\u88c5'])
    || hasAnyText(text, ['cln', 'dcn', 'icr', 'cleanroom', 'data center', 'hospital', 'medical', '洁净', '数据中心', '医院'])
  ) {
    return 'high_complex'
  }
  if (
    ['curtain_wall', 'elevator', 'commissioning', 'scaffold', 'fire_system', 'intelligent_system'].includes(resourceClass)
    || hasAnyText(text, ['curtain wall', 'elevator', 'commissioning', 'scaffold', 'fire system', 'intelligent'])
    || hasAnyText(text, ['\u5e55\u5899', '\u7535\u68af', '\u8c03\u8bd5', '\u811a\u624b\u67b6', '\u6d88\u9632', '\u667a\u80fd\u5316'])
  ) {
    return 'complex'
  }
  return 'normal'
}

function complexityMultiplierMax(
  policy: Awaited<ReturnType<typeof loadSiteCapacityPressurePolicy>>,
  level: ResourcePressureComplexityLevel,
) {
  const configured = policy.thresholds.complexityLevel[level]?.multiplierMax
  return Math.max(policy.caps.multiplierMin, readNumber(configured, policy.caps.multiplierMax))
}

function isVerticalTransportLimitedResource(
  resource: Record<string, unknown> | null | undefined,
  dimensions: V1474PressureDimension[],
  operationType?: unknown,
) {
  const resourceClass = resourceClassValue(resource)
  const operation = normalizeText(operationType ?? resource?.resourceOperationType ?? resource?.resource_operation_type).toLowerCase()
  return ['tower_crane', 'construction_hoist', 'precast_hoisting', 'steel_hoisting', 'scaffold', 'elevator'].includes(resourceClass)
    || (dimensions.includes('equipment') && dimensions.includes('workface') && ['install', 'add_section', 'dismantle', 'transport'].includes(operation))
}

function isSeasonWindowSensitiveResource(
  resource: Record<string, unknown> | null | undefined,
  workContext: EffectiveStandardWorkContext,
) {
  const resourceClass = resourceClassValue(resource)
  const text = normalizedResourceText(resourceClass, workContext.resourceContextText, workContext.standardWorkName)
  return ['facade', 'curtain_wall', 'waterproof', 'outdoor_utility', 'landscape', 'insulation'].includes(resourceClass)
    || hasAnyText(text, ['outdoor', 'facade', 'curtain wall', 'waterproof', 'landscape', 'road', 'roof'])
    || hasAnyText(text, ['室外', '外墙', '幕墙', '防水', '景观', '道路', '屋面'])
}

function resourceParallelCapacityWeight(
  capacity: ResourceParallelCapacity,
  policy: Awaited<ReturnType<typeof loadSiteCapacityPressurePolicy>>,
) {
  if (capacity === 'low') return Math.max(1, policy.weights.lowParallelCapacity)
  if (capacity === 'high') return clamp(policy.weights.highParallelCapacity, 0.2, 1)
  return 1
}

type ResourceOperationPressureRole =
  | 'short_term_strong_occupancy'
  | 'long_term_background_capacity'
  | 'gate_or_closeout'
  | 'intermittent_support'
  | 'closeout_clearance'
  | 'general_resource_activity'

type ResourceOperationWindowImpactMode =
  | 'resource_window_impact'
  | 'background_capacity_window'
  | 'gate_window'
  | 'intermittent_window'
  | 'closeout_window'
  | 'general_window'

function resourceOperationPressureProfile(operationType: unknown): {
  role: ResourceOperationPressureRole
  multiplier: number
  windowImpactMode: ResourceOperationWindowImpactMode
  directDurationImpactAllowed: false
} {
  const normalized = normalizeText(operationType).toLowerCase()
  if (['install', 'add_section', 'dismantle', 'transport'].includes(normalized)) {
    return {
      role: 'short_term_strong_occupancy',
      multiplier: 1.15,
      windowImpactMode: 'resource_window_impact',
      directDurationImpactAllowed: false,
    }
  }
  if (['use', 'support'].includes(normalized)) {
    return {
      role: 'long_term_background_capacity',
      multiplier: 0.8,
      windowImpactMode: 'background_capacity_window',
      directDurationImpactAllowed: false,
    }
  }
  if (['inspection_acceptance', 'commissioning'].includes(normalized)) {
    return {
      role: 'gate_or_closeout',
      multiplier: 0.55,
      windowImpactMode: 'gate_window',
      directDurationImpactAllowed: false,
    }
  }
  if (normalized === 'maintenance') {
    return {
      role: 'intermittent_support',
      multiplier: 0.65,
      windowImpactMode: 'intermittent_window',
      directDurationImpactAllowed: false,
    }
  }
  if (normalized === 'cleanup') {
    return {
      role: 'closeout_clearance',
      multiplier: 0.45,
      windowImpactMode: 'closeout_window',
      directDurationImpactAllowed: false,
    }
  }
  return {
    role: 'general_resource_activity',
    multiplier: 1,
    windowImpactMode: 'general_window',
    directDurationImpactAllowed: false,
  }
}

function combineResourceOperationPressureProfiles(currentOperationType: unknown, otherOperationType: unknown) {
  const current = resourceOperationPressureProfile(currentOperationType)
  const other = resourceOperationPressureProfile(otherOperationType)
  const profiles = [current, other]
  const strongest = profiles.find((item) => item.role === 'short_term_strong_occupancy')
    ?? profiles.find((item) => item.role === 'long_term_background_capacity')
    ?? profiles.find((item) => item.role === 'intermittent_support')
    ?? profiles.find((item) => item.role === 'gate_or_closeout')
    ?? profiles.find((item) => item.role === 'closeout_clearance')
    ?? profiles[0]
  return {
    currentRole: current.role,
    otherRole: other.role,
    role: strongest.role,
    multiplier: strongest.multiplier,
    windowImpactMode: strongest.windowImpactMode,
    directDurationImpactAllowed: false,
  }
}

function readResourceDailyLimit(resource: Record<string, unknown> | null | undefined, key: string, capacity: ResourceParallelCapacity) {
  const value = Number(resource?.[key])
  if (Number.isFinite(value) && value > 0) return value
  if (capacity === 'low') return 1
  if (capacity === 'high') return 3
  return 2
}

function buildCapacityLimitSignal(
  resource: Record<string, unknown> | null | undefined,
  capacity: ResourceParallelCapacity,
  counts: {
    sameResourceBuilding: number
    sameResourceUnit: number
    sameResourceFloor: number
    sameResourceSystem: number
  },
) {
  const limits = {
    sameBuildingDailyLimit: readResourceDailyLimit(resource, 'sameBuildingDailyLimit', capacity),
    sameUnitDailyLimit: readResourceDailyLimit(resource, 'sameUnitDailyLimit', capacity),
    sameFloorDailyLimit: readResourceDailyLimit(resource, 'sameFloorDailyLimit', capacity),
    sameSystemDailyLimit: readResourceDailyLimit(resource, 'sameSystemDailyLimit', capacity),
  }
  const buildingExcess = Math.max(0, counts.sameResourceBuilding + 1 - limits.sameBuildingDailyLimit)
  const unitExcess = Math.max(0, counts.sameResourceUnit + 1 - limits.sameUnitDailyLimit)
  const floorExcess = Math.max(0, counts.sameResourceFloor + 1 - limits.sameFloorDailyLimit)
  const systemExcess = Math.max(0, counts.sameResourceSystem + 1 - limits.sameSystemDailyLimit)
  const excessScore = buildingExcess + unitExcess + floorExcess + systemExcess
  return {
    limits,
    buildingExcess,
    unitExcess,
    floorExcess,
    systemExcess,
    excessScore,
  }
}

function overlapDaysInclusive(startA: Date, endA: Date, startB: Date, endB: Date) {
  const start = startA > startB ? startA : startB
  const end = endA < endB ? endA : endB
  if (end < start) return 0
  return inclusiveDurationDays(start, end) ?? 1
}

type ProgressTrendPressure = {
  slowTaskCount: number
  stagnantTaskCount: number
  recoveredTaskCount: number
  trendPressureWeight: number
  taskTrends: Array<{
    taskId: string | null
    spanDays: number
    progressDelta: number
    trend: 'stagnant' | 'slow' | 'recovered'
  }>
}

async function loadProgressTrendPressure(
  taskIds: string[],
  policy: Awaited<ReturnType<typeof loadSiteCapacityPressurePolicy>>,
  runtimeCache?: DurationContextRuntimeCache,
): Promise<ProgressTrendPressure> {
  const scopedTaskIds = uniqueIds(taskIds)
  const empty: ProgressTrendPressure = {
    slowTaskCount: 0,
    stagnantTaskCount: 0,
    recoveredTaskCount: 0,
    trendPressureWeight: 0,
    taskTrends: [],
  }
  if (scopedTaskIds.length === 0) return empty
  if (runtimeCache && scopedTaskIds.length === 1) {
    const facts = await loadTaskProgressSnapshotFacts(scopedTaskIds[0] ?? null, runtimeCache)
    const taskTrends: ProgressTrendPressure['taskTrends'] = []
    let slowTaskCount = 0
    let stagnantTaskCount = 0
    let recoveredTaskCount = 0
    if (facts.recentSpanDays >= policy.thresholds.trendMinSpanDays) {
      if (facts.recentProgressDelta <= policy.thresholds.trendStagnantDeltaPercent) {
        stagnantTaskCount = 1
        taskTrends.push({ taskId: scopedTaskIds[0] ?? null, spanDays: facts.recentSpanDays, progressDelta: facts.recentProgressDelta, trend: 'stagnant' })
      } else if (facts.recentProgressDelta <= policy.thresholds.trendSlowDeltaPercent) {
        slowTaskCount = 1
        taskTrends.push({ taskId: scopedTaskIds[0] ?? null, spanDays: facts.recentSpanDays, progressDelta: facts.recentProgressDelta, trend: 'slow' })
      } else if (facts.recentProgressDelta >= policy.thresholds.trendRecoveryDeltaPercent) {
        recoveredTaskCount = 1
        taskTrends.push({ taskId: scopedTaskIds[0] ?? null, spanDays: facts.recentSpanDays, progressDelta: facts.recentProgressDelta, trend: 'recovered' })
      }
    }
    return {
      slowTaskCount,
      stagnantTaskCount,
      recoveredTaskCount,
      trendPressureWeight: Math.max(0, stagnantTaskCount * 1.2 + slowTaskCount * 0.75 - recoveredTaskCount * 0.5),
      taskTrends,
    }
  }

  const data = await readDurationContextProgressTrendSnapshotRows({ taskIds: scopedTaskIds })
  if (data.length === 0) return empty

  const cutoff = normalizeDurationDateUtc(new Date())
  if (!cutoff) return empty
  cutoff.setUTCDate(cutoff.getUTCDate() - policy.thresholds.trendWindowDays)
  const byTask = new Map<string, Array<{ date: Date; progress: number }>>()
  for (const row of data) {
    const taskId = normalizeId(row.task_id)
    const date = parseDate(row.snapshot_date ?? row.created_at)
    if (!taskId || !date || date < cutoff) continue
    const progress = clamp(Number(row.progress ?? 0), 0, 100)
    const list = byTask.get(taskId) ?? []
    list.push({ date, progress })
    byTask.set(taskId, list)
  }

  const taskTrends: ProgressTrendPressure['taskTrends'] = []
  let slowTaskCount = 0
  let stagnantTaskCount = 0
  let recoveredTaskCount = 0

  for (const [taskId, snapshots] of byTask.entries()) {
    const ordered = snapshots.sort((a, b) => a.date.getTime() - b.date.getTime())
    if (ordered.length < 2) continue
    const first = ordered[0]
    const last = ordered[ordered.length - 1]
    const spanDays = inclusiveDurationDays(first.date, last.date) ?? 1
    if (spanDays < policy.thresholds.trendMinSpanDays) continue
    const progressDelta = last.progress - first.progress
    if (progressDelta <= policy.thresholds.trendStagnantDeltaPercent) {
      stagnantTaskCount += 1
      taskTrends.push({ taskId, spanDays, progressDelta, trend: 'stagnant' })
    } else if (progressDelta <= policy.thresholds.trendSlowDeltaPercent) {
      slowTaskCount += 1
      taskTrends.push({ taskId, spanDays, progressDelta, trend: 'slow' })
    } else if (progressDelta >= policy.thresholds.trendRecoveryDeltaPercent) {
      recoveredTaskCount += 1
      taskTrends.push({ taskId, spanDays, progressDelta, trend: 'recovered' })
    }
  }

  const trendPressureWeight = Math.max(0, stagnantTaskCount * 1.2 + slowTaskCount * 0.75 - recoveredTaskCount * 0.5)
  return {
    slowTaskCount,
    stagnantTaskCount,
    recoveredTaskCount,
    trendPressureWeight,
    taskTrends,
  }
}

async function loadResponsibleUnitHistoryPressure(input: DurationContextInput, responsibleUnitId: string | null) {
  const projectId = normalizeId(input.projectId)
  if (!projectId || !responsibleUnitId) {
    return { score: 0, sampleCount: 0, averageDurationRatio: null as number | null }
  }

  const data = await readDurationContextResponsibleUnitHistoryRows({ projectId, responsibleUnitId })

  const ratios = (data as Array<Record<string, unknown>>).map((row) => {
    const plannedStart = parseDate(row.planned_start_date ?? row.start_date)
    const plannedEnd = parseDate(row.planned_end_date ?? row.end_date)
    const actualStart = parseDate(row.actual_start_date)
    const actualEnd = parseDate(row.actual_end_date)
    if (!plannedStart || !plannedEnd || !actualStart || !actualEnd) return null
    const plannedDays = inclusiveDurationDays(plannedStart, plannedEnd) ?? 1
    const actualDays = inclusiveDurationDays(actualStart, actualEnd) ?? 1
    return actualDays / plannedDays
  }).filter((value): value is number => Number.isFinite(value) && value > 0)

  if (ratios.length < 2) return { score: 0, sampleCount: ratios.length, averageDurationRatio: null as number | null }
  const averageDurationRatio = ratios.reduce((sum, value) => sum + value, 0) / ratios.length
  const score = averageDurationRatio > 1.08 ? clamp((averageDurationRatio - 1) * 6, 0, 2.5) : 0
  return {
    score,
    sampleCount: ratios.length,
    averageDurationRatio,
  }
}

async function buildResourceConflictFactor(input: DurationContextInput, runtimeCache?: DurationContextRuntimeCache): Promise<DurationContextFactor | null> {
  const projectId = normalizeId(input.projectId)
  const start = normalizeDate(input.plannedStartDate)
  const end = normalizeDate(input.plannedEndDate)
  if (!projectId || !start || !end) return null

  const seedContext = buildSeedResolveContext(input)
  const policy = await loadSiteCapacityPressurePolicy(seedContext)
  const currentWorkContext = await resolveEffectiveStandardWorkContext(input as Record<string, unknown>, seedContext)
  const resource = await resolveV1474ResourceClass(
    currentWorkContext.resourceContextText || compactFactorText(input),
    buildWorkContextResolveContext(input as Record<string, unknown>, seedContext, currentWorkContext.standardWorkCode),
  )
  const currentResourcePressureDimensions = resolveResourcePressureDimensions(resource as Record<string, unknown> | null)
  const currentResourceComplexityLevel = inferResourcePressureComplexity(resource as Record<string, unknown> | null, currentWorkContext)
  const currentResourceVerticalTransportLimited = isVerticalTransportLimitedResource(resource as Record<string, unknown> | null, currentResourcePressureDimensions)
  const currentResourceSeasonWindowSensitive = isSeasonWindowSensitiveResource(resource as Record<string, unknown> | null, currentWorkContext)
  const buildingId = normalizeId(input.buildingObjectId)
  const floorId = normalizeId(input.floorObjectId)
  const zoneId = normalizeId(input.zoneObjectId)
  const responsibleUnitId = normalizeId(input.responsibleUnitId)
  const currentTaskId = normalizeId(input.taskId)
  if (!resource && !buildingId && !floorId && !zoneId && !responsibleUnitId && !currentTaskId) return null

  const data = await readDurationContextResourceConflictTaskRows({
    projectId,
    excludedTaskId: input.taskId,
  })

  const currentStart = parseDate(start)
  const currentEnd = parseDate(end)
  if (!currentStart || !currentEnd) return null

  const overlapCandidates = (data as any[]).map((task) => {
    const otherStart = parseDate(task.planned_start_date ?? task.start_date)
    const otherEnd = parseDate(task.planned_end_date ?? task.end_date)
    if (!otherStart || !otherEnd) return null
    const overlapsDate = otherStart <= currentEnd && otherEnd >= currentStart
    if (!overlapsDate) return null
    const overlapDays = overlapDaysInclusive(currentStart, currentEnd, otherStart, otherEnd)
    if (overlapDays <= 0) return null
    const overlapRatio = clamp(overlapDays / (inclusiveDurationDays(currentStart, currentEnd) ?? 1), 0, 1)
    return { task, otherStart, otherEnd, overlapDays, overlapRatio }
  }).filter(Boolean) as Array<{
    task: Record<string, unknown>
    otherStart: Date
    otherEnd: Date
    overlapDays: number
    overlapRatio: number
  }>

  const overlapSignals = (await Promise.all(overlapCandidates.map(async ({ task, otherStart, otherEnd, overlapDays, overlapRatio }) => {
    const taskWorkContext = await resolveEffectiveStandardWorkContext(task, seedContext)
    const sameBuilding = buildingId && normalizeId(task.building_object_id) === buildingId
    const sameFloor = floorId && normalizeId(task.floor_object_id) === floorId
    const sameZone = zoneId && (
      normalizeId(task.physical_zone_object_id) === zoneId
      || normalizeId(task.functional_area_object_id) === zoneId
    )
    const sameUnit = responsibleUnitId && normalizeId(task.participant_unit_id) === responsibleUnitId
    const progressPressure = hasProgressPressure(task, otherStart, otherEnd, taskWorkContext)
    const progressPressureWeight = progressPressure
      ? taskWorkContext.resourcePressureWeight * (0.5 + (overlapRatio * 0.5))
      : 0
    const otherResource = resource
      ? await resolveV1474ResourceClass(
        taskWorkContext.resourceContextText || [task.title, task.standard_work_name, task.standard_work_code].map(normalizeText).join(' '),
        buildWorkContextResolveContext(task, seedContext, taskWorkContext.standardWorkCode),
      )
      : null
    const sameResourceClass = Boolean(otherResource && resource && otherResource.resourceClass === resource.resourceClass)
    if (sameBuilding || sameFloor || sameZone || sameUnit || sameResourceClass) {
      const parallelCapacity = inferResourceParallelCapacity((sameResourceClass ? otherResource : resource) as Record<string, unknown> | null)
      const otherResourcePressureDimensions = resolveResourcePressureDimensions(otherResource as Record<string, unknown> | null)
      const resourcePressureDimensions = sameResourceClass
        ? [...new Set([...currentResourcePressureDimensions, ...otherResourcePressureDimensions])]
        : []
      const operationPressureProfile = sameResourceClass
        ? combineResourceOperationPressureProfiles(resource?.resourceOperationType, otherResource?.resourceOperationType)
        : combineResourceOperationPressureProfiles(null, null)
      const verticalTransportLimited = sameResourceClass && (
        currentResourceVerticalTransportLimited
        || isVerticalTransportLimitedResource(otherResource as Record<string, unknown> | null, otherResourcePressureDimensions, otherResource?.resourceOperationType)
      )
      const seasonWindowSensitive = sameResourceClass && (
        currentResourceSeasonWindowSensitive
        || isSeasonWindowSensitiveResource(otherResource as Record<string, unknown> | null, taskWorkContext)
      )
      const verticalTransportMultiplier = verticalTransportLimited ? Math.max(1, policy.weights.verticalTransportLimited) : 1
      const seasonWindowMultiplier = seasonWindowSensitive ? Math.max(1, policy.weights.seasonWindowEmphasis) : 1
      return {
        task,
        overlapDays,
        overlapRatio,
        sameBuilding: Boolean(sameBuilding),
        sameFloor: Boolean(sameFloor),
        sameZone: Boolean(sameZone),
        sameResponsibleUnit: Boolean(sameUnit),
        sameResourceClass,
        progressPressure,
        progressPressureWeight,
        parallelCapacity,
        parallelCapacityWeight: sameResourceClass
          ? resourceParallelCapacityWeight(parallelCapacity, policy) * operationPressureProfile.multiplier * verticalTransportMultiplier * seasonWindowMultiplier
          : 1,
        verticalTransportLimited,
        verticalTransportMultiplier,
        seasonWindowSensitive,
        seasonWindowMultiplier,
        operationPressureRole: operationPressureProfile.role,
        operationPressureMultiplier: operationPressureProfile.multiplier,
        operationWindowImpactMode: operationPressureProfile.windowImpactMode,
        operationDirectDurationImpactAllowed: operationPressureProfile.directDurationImpactAllowed,
        currentResourceOperationType: resource?.resourceOperationType ?? null,
        resourceOperationType: otherResource?.resourceOperationType ?? null,
        resourceOperationConfidence: otherResource?.resourceOperationConfidence ?? null,
        resourcePressureDimensions,
        workContext: taskWorkContext,
      }
    }
    return null
  }))).filter(Boolean) as Array<{
    task: Record<string, unknown>
    overlapDays: number
    overlapRatio: number
    sameBuilding: boolean
    sameFloor: boolean
    sameZone: boolean
    sameResponsibleUnit: boolean
    sameResourceClass: boolean
    progressPressure: boolean
    progressPressureWeight: number
    parallelCapacity: ResourceParallelCapacity
    parallelCapacityWeight: number
    operationPressureRole: ResourceOperationPressureRole
    operationPressureMultiplier: number
    operationWindowImpactMode: ResourceOperationWindowImpactMode
    operationDirectDurationImpactAllowed: false
    verticalTransportLimited: boolean
    verticalTransportMultiplier: number
    seasonWindowSensitive: boolean
    seasonWindowMultiplier: number
    currentResourceOperationType: string | null
    resourceOperationType: string | null
    resourceOperationConfidence: string | null
    resourcePressureDimensions: V1474PressureDimension[]
    workContext: EffectiveStandardWorkContext
  }>

  const sameResponsibleUnitCount = overlapSignals.filter((item) => item.sameResponsibleUnit).length
  const sameBuildingCount = overlapSignals.filter((item) => item.sameBuilding).length
  const sameFloorCount = overlapSignals.filter((item) => item.sameFloor).length
  const sameZoneCount = overlapSignals.filter((item) => item.sameZone).length
  const sameResourceClassCount = overlapSignals.filter((item) => item.sameResourceClass).length
  const sameResourceBuildingCount = overlapSignals.filter((item) => item.sameResourceClass && item.sameBuilding).length
  const sameResourceUnitCount = overlapSignals.filter((item) => item.sameResourceClass && item.sameResponsibleUnit).length
  const sameResourceFloorCount = overlapSignals.filter((item) => item.sameResourceClass && item.sameFloor).length
  const sameResourceSystemCount = overlapSignals.filter((item) => item.sameResourceClass).length
  const overlapProgressPressureCount = overlapSignals.filter((item) => item.progressPressure).length
  const overlapStrength = overlapSignals.reduce((sum, item) => sum + item.overlapRatio, 0)
  const maxOverlapRatio = overlapSignals.reduce((max, item) => Math.max(max, item.overlapRatio), 0)
  const currentTaskProfile = resolveProgressPressureProfile({
    progress: input.progress,
    title: input.taskTitle,
    standard_work_name: input.standardWorkName,
    standard_work_code: input.standardWorkCode,
  }, currentWorkContext)
  const currentTaskProgressPressure = hasProgressPressure({
    progress: input.progress,
    title: input.taskTitle,
    standard_work_name: input.standardWorkName,
    standard_work_code: input.standardWorkCode,
  }, currentStart, currentEnd, currentWorkContext)
  const progressPressureCount = overlapProgressPressureCount + (currentTaskProgressPressure ? 1 : 0)
  const relatedTaskIds = uniqueIds([currentTaskId, ...overlapSignals.map((item) => item.task.id)])
  const [readinessPressure, progressTrendPressure, responsibleUnitHistoryPressure] = await Promise.all([
    loadResourceReadinessPressure(projectId, relatedTaskIds, runtimeCache),
    loadProgressTrendPressure(relatedTaskIds, policy, runtimeCache),
    loadResponsibleUnitHistoryPressure(input, responsibleUnitId),
  ])
  const currentTaskProgressPressureOnly = currentTaskProgressPressure
    && overlapProgressPressureCount === 0
    && progressTrendPressure.trendPressureWeight <= 0
    && readinessPressure.resourceConditionCount === 0
    && readinessPressure.resourceObstacleCount === 0
    && readinessPressure.overdueMaterialCount === 0
  const currentProgressPressureWeight = currentTaskProgressPressure
    ? currentWorkContext.resourcePressureWeight * (currentTaskProgressPressureOnly ? policy.weights.singleTaskProgressOnly : 1)
    : 0
  const progressPressureWeight = overlapSignals.reduce((sum, item) => sum + item.progressPressureWeight, 0)
    + currentProgressPressureWeight
  const longTermSignalCount = readinessPressure.signalAges.filter((age) => age >= policy.thresholds.longTermSignalDays).length
  const readinessScore = readinessPressure.resourceConditionCount * policy.weights.resourceCondition
    + readinessPressure.resourceObstacleCount * policy.weights.resourceObstacle
    + readinessPressure.overdueMaterialCount * policy.weights.overdueMaterial
    + readinessPressure.severeObstacleCount * policy.weights.severeObstacle
    + longTermSignalCount * policy.weights.longTermSignal
    + (readinessPressure.maxSignalAgeDays >= policy.thresholds.veryLongTermSignalDays ? policy.weights.veryLongTermBonus : 0)
  const responsibleUnitScore = overlapSignals.reduce((sum, item) => (
    sum + (item.sameResponsibleUnit ? policy.weights.sameResponsibleUnit * item.overlapRatio : 0)
  ), 0)
  const spatialScore = overlapSignals.reduce((sum, item) => {
    if (item.sameZone) return sum + policy.weights.sameZone * item.overlapRatio
    if (item.sameFloor) return sum + policy.weights.sameFloor * item.overlapRatio
    if (item.sameBuilding) return sum + policy.weights.sameBuilding * item.overlapRatio
    return sum
  }, 0)
  const resourceClassScore = overlapSignals.reduce((sum, item) => (
    sum + (item.sameResourceClass ? policy.weights.sameResourceClass * item.parallelCapacityWeight * item.overlapRatio : 0)
  ), 0)
  const currentResourceParallelCapacity = inferResourceParallelCapacity(resource as Record<string, unknown> | null)
  const capacityLimitSignal = buildCapacityLimitSignal(resource as Record<string, unknown> | null, currentResourceParallelCapacity, {
    sameResourceBuilding: sameResourceBuildingCount,
    sameResourceUnit: sameResourceUnitCount,
    sameResourceFloor: sameResourceFloorCount,
    sameResourceSystem: sameResourceSystemCount,
  })
  const currentResourceOperationProfile = resourceOperationPressureProfile(resource?.resourceOperationType)
  const capacityLimitScore = capacityLimitSignal.excessScore * policy.weights.capacityLimitExcess
  const overlapScore = responsibleUnitScore + spatialScore + resourceClassScore
  const progressScore = progressPressureWeight * policy.weights.progressPressure
  const trendScore = progressTrendPressure.trendPressureWeight * policy.weights.trendPressure
  const responsibleUnitHistoryScore = responsibleUnitHistoryPressure.score * policy.weights.responsibleUnitHistoryPressure
  const hasExecutionPressure = progressPressureCount > 0 || progressTrendPressure.trendPressureWeight > 0 || responsibleUnitHistoryPressure.score > 0
  const hasOverlapOrCapacityContext = overlapSignals.length > 0 || overlapScore > 0 || capacityLimitScore > 0
  const hasLongTermReadinessEvidence = longTermSignalCount > 0
    || readinessPressure.maxSignalAgeDays >= policy.thresholds.longTermSignalDays
  const hasReadinessDurationEvidence = readinessScore > 0 && (
    hasExecutionPressure
    || (
      hasOverlapOrCapacityContext
      && (hasLongTermReadinessEvidence || readinessPressure.severeObstacleCount > 0)
    )
  )
  const pressureDimensionScores = createPressureDimensionScores()
  addPressureDimensionScore(pressureDimensionScores, ['labor', 'workface'], responsibleUnitScore)
  addPressureDimensionScore(pressureDimensionScores, ['workface'], spatialScore)
  overlapSignals.forEach((item) => {
    const signalScore = item.sameResourceClass
      ? policy.weights.sameResourceClass * item.parallelCapacityWeight * item.overlapRatio
      : 0
    addPressureDimensionScore(pressureDimensionScores, item.resourcePressureDimensions, signalScore)
  })
  addPressureDimensionScore(pressureDimensionScores, currentResourcePressureDimensions, capacityLimitScore)
  addPressureDimensionScore(pressureDimensionScores, ['labor', 'workface'], progressScore + trendScore + responsibleUnitHistoryScore)
  const readinessDimensionTotal = PRESSURE_DIMENSIONS.reduce((sum, dimension) => (
    sum + (readinessPressure.readinessDimensionCounts[dimension] ?? 0)
  ), 0)
  if (readinessDimensionTotal > 0) {
    PRESSURE_DIMENSIONS.forEach((dimension) => {
      const ratio = (readinessPressure.readinessDimensionCounts[dimension] ?? 0) / readinessDimensionTotal
      addPressureDimensionScore(pressureDimensionScores, [dimension], readinessScore * ratio)
    })
  } else {
    addPressureDimensionScore(pressureDimensionScores, currentResourcePressureDimensions, readinessScore)
  }
  const normalizedPressureDimensionScores = PRESSURE_DIMENSIONS.reduce((record, dimension) => {
    record[dimension] = Number(pressureDimensionScores[dimension].toFixed(3))
    return record
  }, {} as Record<V1474PressureDimension, number>)
  const dominantPressureDimensionSignals = dominantPressureDimensions(normalizedPressureDimensionScores)
  const pressureScore = overlapScore + progressScore + trendScore + capacityLimitScore + responsibleUnitHistoryScore + readinessScore
  if (pressureScore <= 0) return null

  const chronicDelayDays = longTermSignalCount > 0
    ? Math.min(
      policy.caps.maxExtraDays,
      Math.max(1, Math.ceil(readinessPressure.maxSignalAgeDays / policy.thresholds.longTermSignalDays))
        + readinessPressure.severeObstacleCount
        + Math.min(policy.caps.maxMaterialExtraDays, readinessPressure.overdueMaterialCount),
    )
    : 0
  const hasResourceWindowDurationEvidence = hasExecutionPressure || hasReadinessDurationEvidence
  const observationOnlyColdStart = isObservationOnlySiteCapacityColdStart(
    policy,
    progressTrendPressure,
    responsibleUnitHistoryPressure,
  ) && hasResourceWindowDurationEvidence
  const durationImpactMode = hasResourceWindowDurationEvidence
    ? 'conditional_duration_candidate'
    : 'resource_window_impact_only'
  const canRaiseHighPressure = hasExecutionPressure || (hasReadinessDurationEvidence && longTermSignalCount >= 2)
  const pressureLevel = !hasResourceWindowDurationEvidence
    ? 'low'
    : pressureScore >= policy.thresholds.highScore && canRaiseHighPressure ? 'high' : pressureScore >= policy.thresholds.mediumScore ? 'medium' : 'low'
  const effectiveMultiplierScore = hasResourceWindowDurationEvidence
    ? hasExecutionPressure
      ? pressureScore
      : Math.min(pressureScore, policy.thresholds.mediumScore)
    : 0
  const resourceComplexityMultiplierMax = complexityMultiplierMax(policy, currentResourceComplexityLevel)
  const resourceFactorActionPolicy: DurationContextActionPolicy = hasResourceWindowDurationEvidence
    ? 'candidate_only'
    : 'confidence_only'
  const resourceFactorMultiplier = hasResourceWindowDurationEvidence
    ? clamp(1 + effectiveMultiplierScore * policy.caps.multiplierStep, policy.caps.multiplierMin, resourceComplexityMultiplierMax)
    : 1
  const pressureReasons = [
    sameResponsibleUnitCount > 0 ? `${sameResponsibleUnitCount} \u9879\u540c\u8d23\u4efb\u5355\u4f4d\u4efb\u52a1\u6392\u671f\u91cd\u53e0` : null,
    sameZoneCount > 0 ? `${sameZoneCount} \u9879\u540c\u533a\u57df\u4efb\u52a1\u6392\u671f\u91cd\u53e0` : sameFloorCount > 0 ? `${sameFloorCount} \u9879\u540c\u697c\u5c42\u4efb\u52a1\u6392\u671f\u91cd\u53e0` : sameBuildingCount > 0 ? `${sameBuildingCount} \u9879\u540c\u697c\u680b\u4efb\u52a1\u6392\u671f\u91cd\u53e0` : null,
    sameResourceClassCount > 0 ? `${sameResourceClassCount} \u9879\u540c\u7c7b\u65bd\u5de5\u8d44\u6e90\u4efb\u52a1\u6392\u671f\u91cd\u53e0` : null,
    capacityLimitSignal.excessScore > 0 ? `\u540c\u7c7b\u8d44\u6e90\u5e76\u884c\u6570\u91cf\u8d85\u8fc7\u7ecf\u9a8c\u627f\u8f7d\u4e0a\u9650 ${capacityLimitSignal.excessScore} \u9879` : null,
    progressPressureCount > 0 ? `${progressPressureCount} \u9879\u4efb\u52a1\u6309\u5de5\u5e8f\u66f2\u7ebf\u5224\u65ad\u63a8\u8fdb\u504f\u6162` : null,
    progressTrendPressure.stagnantTaskCount > 0 ? `${progressTrendPressure.stagnantTaskCount} \u9879\u4efb\u52a1\u8fd1 ${policy.thresholds.trendWindowDays} \u5929\u63a8\u8fdb\u505c\u6ede` : null,
    progressTrendPressure.slowTaskCount > 0 ? `${progressTrendPressure.slowTaskCount} \u9879\u4efb\u52a1\u8fd1 ${policy.thresholds.trendWindowDays} \u5929\u63a8\u8fdb\u504f\u6162` : null,
    responsibleUnitHistoryPressure.score > 0 ? '\u8be5\u8d23\u4efb\u5355\u4f4d\u5386\u53f2\u4efb\u52a1\u5b9e\u9645\u5de5\u671f\u504f\u957f' : null,
    readinessPressure.resourceConditionCount > 0 ? `${readinessPressure.resourceConditionCount} \u9879\u4eba\u5458/\u8bbe\u5907/\u6750\u6599\u5f00\u5de5\u6761\u4ef6\u4ecd\u672a\u6ee1\u8db3` : null,
    readinessPressure.resourceObstacleCount > 0 ? `${readinessPressure.resourceObstacleCount} \u9879\u4eba\u5458/\u8bbe\u5907/\u6750\u6599\u7c7b\u963b\u788d\u4ecd\u672a\u89e3\u9664` : null,
    readinessPressure.overdueMaterialCount > 0 ? `${readinessPressure.overdueMaterialCount} \u9879\u5173\u8054\u6750\u6599\u9884\u8ba1\u5230\u8d27\u5df2\u903e\u671f` : null,
    longTermSignalCount > 0 ? `${longTermSignalCount} \u9879\u8d44\u6e90\u7c7b\u4fe1\u53f7\u6301\u7eed\u8d85\u8fc7 ${policy.thresholds.longTermSignalDays} \u5929` : null,
  ].filter(Boolean).join('; ')
  const capacityLimitOnlyPressure = capacityLimitSignal.excessScore > 0
    && !hasExecutionPressure
    && readinessScore <= 0
    && chronicDelayDays <= 0
  const pressureLevelForDisplay = capacityLimitOnlyPressure ? 'low' : pressureLevel
  const durationImpactModeForDisplay = capacityLimitOnlyPressure ? 'resource_window_impact_only' : durationImpactMode
  const actionPolicyForDisplay = capacityLimitOnlyPressure || observationOnlyColdStart ? 'confidence_only' : resourceFactorActionPolicy
  const baseMultiplierForDisplay = capacityLimitOnlyPressure || observationOnlyColdStart ? 1 : resourceFactorMultiplier
  const sitePressureRuntimeParameter = input.projectId && actionPolicyForDisplay === 'candidate_only' && baseMultiplierForDisplay > 1
    ? await loadSitePressureCanaryRuntimeMultiplier({
      projectId: input.projectId,
      originalMultiplier: baseMultiplierForDisplay,
      multiplierMax: resourceComplexityMultiplierMax,
    })
    : null
  const multiplierForDisplay = sitePressureRuntimeParameter?.multiplier ?? baseMultiplierForDisplay
  const extraDaysForDisplay = hasResourceWindowDurationEvidence && !observationOnlyColdStart ? chronicDelayDays : 0

  return {
    key: 'resource_conflict',
    label: '\u73b0\u573a\u627f\u8f7d\u538b\u529b',
    multiplier: multiplierForDisplay,
    extraDays: extraDaysForDisplay,
    confidenceDelta: -Math.min(policy.caps.maxConfidencePenalty, Math.max(hasExecutionPressure ? 6 : 3, effectiveMultiplierScore * 2 + chronicDelayDays)),
    actionPolicy: actionPolicyForDisplay,
    dataDependencies: [
      'tasks',
      'task_progress_snapshots',
      'task_conditions',
      'task_obstacles',
      'project_materials',
      'algorithm_seed_records.resource_class',
      ...(sitePressureRuntimeParameter ? ['algorithm_learnable_parameter_runtime_publications'] : []),
    ],
    reason: `${pressureReasons || '\u540c\u4e00\u6392\u671f\u7a97\u53e3\u5b58\u5728\u73b0\u573a\u627f\u8f7d\u538b\u529b'}; ${observationOnlyColdStart ? '\u5f53\u524d\u9879\u76ee\u7f3a\u5c11\u73b0\u573a\u627f\u8f7d\u5386\u53f2\u6821\u51c6\u6837\u672c\uff0c\u6309 coldStartPolicy \u4ec5\u4f5c\u4e3a\u89c2\u5bdf\u548c\u7f6e\u4fe1\u5ea6\u4fe1\u53f7\uff1b' : ''}\u7cfb\u7edf\u4ec5\u4f5c\u4e3a\u5de5\u671f\u9884\u6d4b\u548c\u8ba1\u5212\u751f\u6210\u7684\u5019\u9009\u4fe1\u53f7\uff0c\u4e0d\u7b49\u540c\u4e8e\u5df2\u786e\u8ba4\u7684\u4eba\u6750\u673a\u8d44\u6e90\u51b2\u7a81\u3002`,
    source: 'task_fact',
    metadata: {
      learnableParameterRuntime: sitePressureRuntimeParameter?.metadata ?? null,
      signalType: 'site_capacity_pressure',
      pressureLevel: pressureLevelForDisplay,
      pressureScore,
      overlapScore,
      responsibleUnitScore,
      spatialScore,
      resourceClassScore,
      capacityLimitScore,
      overlapStrength,
      maxOverlapRatio,
      progressScore,
      trendScore,
      responsibleUnitHistoryScore,
      progressPressureWeight,
      currentProgressPressureWeight,
      currentTaskProgressPressureOnly,
      effectiveMultiplierScore,
      multiplierCap: resourceComplexityMultiplierMax,
      executionProgressIsPrimaryEvidence: hasExecutionPressure,
      hasOverlapOrCapacityContext,
      hasLongTermReadinessEvidence,
      hasReadinessDurationEvidence,
      hasResourceWindowDurationEvidence,
      coldStartPolicy: policy.effectPolicy.coldStartPolicy,
      coldStartObservationOnly: observationOnlyColdStart,
      coldStartHistoricalSampleCount: responsibleUnitHistoryPressure.sampleCount,
      coldStartTrendSampleCount: progressTrendPressure.taskTrends.length,
      coldStartTotalSampleCount: responsibleUnitHistoryPressure.sampleCount + progressTrendPressure.taskTrends.length,
      coldStartMinSamplesForActiveMode: policy.effectPolicy.minSamplesForActiveMode,
      effectPolicy: policy.effectPolicy,
      durationImpactMode: durationImpactModeForDisplay,
      readinessScore,
      pressureDimensionScores: normalizedPressureDimensionScores,
      dominantPressureDimensions: dominantPressureDimensionSignals.map((item) => item.dimension),
      pressureDimensionDetails: dominantPressureDimensionSignals,
      overlapCount: overlapSignals.length,
      sameResponsibleUnitCount,
      sameBuildingCount,
      sameFloorCount,
      sameZoneCount,
      sameResourceClassCount,
      sameResourceBuildingCount,
      sameResourceUnitCount,
      sameResourceFloorCount,
      sameResourceSystemCount,
      capacityLimitSignal,
      progressPressureCount,
      overlapProgressPressureCount,
      currentTaskProgressPressure,
      progressTrendPressure,
      responsibleUnitHistoryPressure,
      currentTaskProgressCurve: currentTaskProfile.curve,
      currentTaskProgressPressureProfile: currentTaskProfile.reason,
      currentTaskStandardWorkSource: currentWorkContext.standardWorkSource,
      currentTaskStandardWorkCode: currentWorkContext.standardWorkCode,
      currentTaskTitleWeakScore: currentWorkContext.titleWeakScore,
      currentTaskTitleWeakRuleId: currentWorkContext.titleWeakRuleId,
      currentTaskDurationContributionMode: currentWorkContext.durationContributionMode,
      currentTaskExecutionNature: currentWorkContext.executionNature,
      currentTaskResourcePressureEligibility: currentWorkContext.resourcePressureEligibility,
      currentTaskResourcePressureWeight: currentWorkContext.resourcePressureWeight,
      overlapWorkContextSummary: overlapSignals.map((item) => ({
        taskId: normalizeId(item.task.id),
        standardWorkSource: item.workContext.standardWorkSource,
        standardWorkCode: item.workContext.standardWorkCode,
        durationContributionMode: item.workContext.durationContributionMode,
        executionNature: item.workContext.executionNature,
        resourcePressureEligibility: item.workContext.resourcePressureEligibility,
        resourcePressureWeight: item.workContext.resourcePressureWeight,
        progressPressure: item.progressPressure,
        progressPressureWeight: item.progressPressureWeight,
        overlapDays: item.overlapDays,
        overlapRatio: item.overlapRatio,
        sameBuilding: item.sameBuilding,
        sameFloor: item.sameFloor,
        sameZone: item.sameZone,
        sameResponsibleUnit: item.sameResponsibleUnit,
        sameResourceClass: item.sameResourceClass,
        parallelCapacity: item.parallelCapacity,
        parallelCapacityWeight: item.parallelCapacityWeight,
        verticalTransportLimited: item.verticalTransportLimited,
        verticalTransportMultiplier: item.verticalTransportMultiplier,
        seasonWindowSensitive: item.seasonWindowSensitive,
        seasonWindowMultiplier: item.seasonWindowMultiplier,
        operationPressureRole: item.operationPressureRole,
        operationPressureMultiplier: item.operationPressureMultiplier,
        operationWindowImpactMode: item.operationWindowImpactMode,
        operationDirectDurationImpactAllowed: item.operationDirectDurationImpactAllowed,
        currentResourceOperationType: item.currentResourceOperationType,
        resourceOperationType: item.resourceOperationType,
        resourceOperationConfidence: item.resourceOperationConfidence,
        resourcePressureDimensions: item.resourcePressureDimensions,
      })),
      resourceConditionCount: readinessPressure.resourceConditionCount,
      resourceObstacleCount: readinessPressure.resourceObstacleCount,
      overdueMaterialCount: readinessPressure.overdueMaterialCount,
      sourceEntityKeys: readinessPressure.sourceEntityKeys,
      severeObstacleCount: readinessPressure.severeObstacleCount,
      longTermResourceSignalCount: longTermSignalCount,
      maxSignalAgeDays: readinessPressure.maxSignalAgeDays,
      chronicDelayDays,
      policyStableCode: policy.stableCode,
      policyResolverSource: policy.resolverSource,
      resourceClass: resource?.resourceClass ?? null,
      resourceComplexityLevel: currentResourceComplexityLevel,
      complexityMultiplierMax: resourceComplexityMultiplierMax,
      verticalTransportLimitedApplied: currentResourceVerticalTransportLimited || overlapSignals.some((item) => item.verticalTransportLimited),
      verticalTransportWeight: policy.weights.verticalTransportLimited,
      seasonWindowEmphasisApplied: currentResourceSeasonWindowSensitive || overlapSignals.some((item) => item.seasonWindowSensitive),
      seasonWindowEmphasisWeight: policy.weights.seasonWindowEmphasis,
      currentResourcePressureDimensions,
      resourceOperationType: resource?.resourceOperationType ?? null,
      resourceOperationConfidence: resource?.resourceOperationConfidence ?? null,
      resourceOperationMatchSource: resource?.resourceOperationMatchSource ?? null,
      resourceOperationPressureRole: currentResourceOperationProfile.role,
      resourceOperationPressureMultiplier: currentResourceOperationProfile.multiplier,
      resourceOperationWindowImpactMode: currentResourceOperationProfile.windowImpactMode,
      resourceOperationDirectDurationImpactAllowed: currentResourceOperationProfile.directDurationImpactAllowed,
      resourceParallelCapacity: inferResourceParallelCapacity(resource as Record<string, unknown> | null),
      resolverSource: resource?.__resolverSource ?? null,
    },
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

function hasProgressPressure(
  task: Record<string, unknown>,
  start: Date,
  end: Date,
  workContext?: EffectiveStandardWorkContext | null,
) {
  const progress = clamp(Number(task.progress ?? 0), 0, 100)
  if (progress >= 100) return false
  const today = new Date()
  if (today < start) return false
  const totalDays = inclusiveDurationDays(start, end) ?? 1
  const elapsedDays = inclusiveDurationDays(start, today) ?? 1
  const elapsedRatio = clamp(elapsedDays / totalDays, 0, 1)
  const profile = resolveProgressPressureProfile(task, workContext)
  if (elapsedRatio < profile.minElapsedRatio) return false
  const expectedProgress = clamp(expectedProgressForCurve(profile.curve, elapsedRatio), 0, 100)
  return expectedProgress >= profile.minExpectedProgress && progress + profile.deficitThreshold < expectedProgress
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
  const overdueDays = today > plannedEnd ? Math.max(0, signedDurationDayDelta(plannedEnd, today) ?? 0) : 0
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

function inferFinishingStagnationReason(rows: Awaited<ReturnType<typeof loadActiveReadinessRows>>) {
  const text = [
    ...rows.conditions,
    ...rows.obstacles,
  ].map((row) => [
    row.condition_type,
    row.obstacle_type,
    row.source_type,
    row.title,
    row.description,
  ].map(normalizeLower).join(' ')).join(' ')

  if (['\u6574\u6539', 'rectification', 'punch', 'rework'].some((token) => text.includes(token))) {
    return 'rectification'
  }
  if (['\u9a8c\u6536', '\u62a5\u9a8c', 'acceptance', 'inspection'].some((token) => text.includes(token))) {
    return 'acceptance_wait'
  }
  if (['\u8d44\u6599', '\u79fb\u4ea4', 'document', 'handover', 'closeout'].some((token) => text.includes(token))) {
    return 'documentation_closeout'
  }
  if (rows.materials.length > 0) return 'material_closeout'
  return 'physical_closeout'
}

async function buildProgressVelocityFactor(input: DurationContextInput, runtimeCache?: DurationContextRuntimeCache): Promise<DurationContextFactor | null> {
  const seedContext = buildSeedResolveContext(input)
  const workContext = await resolveEffectiveStandardWorkContext(input as Record<string, unknown>, seedContext)
  const [progressFacts, readinessRows] = await Promise.all([
    loadTaskProgressSnapshotFacts(normalizeId(input.taskId), runtimeCache),
    loadActiveReadinessRows(input, runtimeCache),
  ])
  const timing = buildProgressTimingAssessment(input as Record<string, unknown>, workContext, progressFacts)
  if (!timing) return null
  const externalCause = summarizeExternalReadinessCause(readinessRows, timing, progressFacts)

  const severeInternalDeficitThreshold = Math.max(35, timing.profile.deficitThreshold * 2)
  const deficitBeyondThreshold = Math.max(0, timing.progressDeficit - timing.profile.deficitThreshold)
  const finishingOverdueInternalPressure = timing.isFinishingStalled
    && timing.overdueDays >= 14
    && !externalCause.hasExternalTimingCause
    && !progressFacts.recoveredByTrend
  const hasSevereInternalProgressDeficit = (timing.isProgressPressure
    && deficitBeyondThreshold >= severeInternalDeficitThreshold)
    || finishingOverdueInternalPressure
  if (timing.isFinishingStalled) {
    const finishingReason = inferFinishingStagnationReason(readinessRows)
    const finishingMultiplierMax = hasSevereInternalProgressDeficit ? 1.35 : 1.25
    const finishingExtraDaysCap = hasSevereInternalProgressDeficit ? 14 : 7
    const finishingMultiplier = hasSevereInternalProgressDeficit
      ? clamp(1.08 + timing.overdueDays * 0.01 + deficitBeyondThreshold / 120, 1.08, finishingMultiplierMax)
      : clamp(1.08 + timing.overdueDays * 0.01, 1.08, finishingMultiplierMax)
    return {
      key: 'progress_velocity',
      label: 'progress velocity',
      multiplier: finishingMultiplier,
      extraDays: Math.min(finishingExtraDaysCap, timing.overdueDays),
      confidenceDelta: hasSevereInternalProgressDeficit ? -12 : -10,
      actionPolicy: 'candidate_only',
      dataDependencies: ['tasks.planned_end_date', 'tasks.actual_start_date', 'tasks.progress'],
      reason: 'Task is stuck in the 90-99% finishing band after the planned finish date, so finishing drag was included with the likely closeout reason separated.',
      source: 'task_fact',
      metadata: {
        ...timing,
        profile: timing.profile,
        finishingStagnation: true,
        finishingStagnationReason: finishingReason,
        severeInternalProgressDeficit: hasSevereInternalProgressDeficit,
        deficitBeyondThreshold,
        finishingMultiplierMax,
        finishingExtraDaysCap,
        progressSnapshotCount: progressFacts.snapshotCount,
        firstProgressDate: progressFacts.firstProgressDateText,
      },
    }
  }

  if (timing.profile.curve !== 'hold' && timing.progressSurplus > timing.profile.deficitThreshold && timing.progress < 80) {
    return {
      key: 'progress_velocity',
      label: 'progress velocity',
      multiplier: 0.95,
      extraDays: 0,
      confidenceDelta: 3,
      actionPolicy: 'candidate_only',
      dataDependencies: ['tasks.planned_start_date', 'tasks.planned_end_date', 'tasks.actual_start_date', 'tasks.progress'],
      reason: 'Current progress is ahead of the process curve, so remaining duration can be slightly tightened.',
      source: 'task_fact',
      metadata: {
        plannedDuration: timing.plannedDuration,
        elapsedDays: timing.elapsedDays,
        elapsedRatio: timing.elapsedRatio,
        actualStartSource: timing.actualStartSource,
        expectedProgress: timing.expectedProgress,
        progress: timing.progress,
        progressSurplus: timing.progressSurplus,
        curve: timing.profile.curve,
        profileReason: timing.profile.reason,
        progressSnapshotCount: progressFacts.snapshotCount,
        firstProgressDate: progressFacts.firstProgressDateText,
      },
    }
  }

  if (!timing.isProgressPressure) return null

  const recoveredByTrend = progressFacts.recoveredByTrend
  const mixedCauseDowngradeSuppressed = externalCause.hasExternalTimingCause && hasSevereInternalProgressDeficit
  const externalReadinessLikelyPrimaryCause = externalCause.hasExternalTimingCause && !mixedCauseDowngradeSuppressed
  const multiplier = externalReadinessLikelyPrimaryCause || recoveredByTrend
    ? clamp(1.03 + deficitBeyondThreshold / 200, 1.03, 1.12)
    : clamp(1.05 + deficitBeyondThreshold / 100, 1.05, 1.35)

  return {
    key: 'progress_velocity',
    label: 'progress velocity',
    multiplier,
    extraDays: 0,
    confidenceDelta: externalReadinessLikelyPrimaryCause || recoveredByTrend ? -5 : -8,
    actionPolicy: 'candidate_only',
    dataDependencies: ['tasks.planned_start_date', 'tasks.planned_end_date', 'tasks.actual_start_date', 'tasks.progress'],
    reason: externalReadinessLikelyPrimaryCause
      ? 'Current progress is slower than the process curve, but active readiness facts are likely the primary cause; velocity is kept as secondary evidence.'
      : recoveredByTrend
        ? 'Current progress is still behind the process curve, but recent snapshots show recovery; velocity impact is downgraded.'
        : 'Current progress is slower than the process curve, so execution speed was included in remaining duration.',
    source: 'task_fact',
    metadata: {
      plannedDuration: timing.plannedDuration,
      elapsedDays: timing.elapsedDays,
      elapsedRatio: timing.elapsedRatio,
      actualStartSource: timing.actualStartSource,
      expectedProgress: timing.expectedProgress,
      progress: timing.progress,
      progressDeficit: timing.progressDeficit,
      deficitThreshold: timing.profile.deficitThreshold,
      curve: timing.profile.curve,
      profileReason: timing.profile.reason,
      progressSnapshotCount: progressFacts.snapshotCount,
      firstProgressDate: progressFacts.firstProgressDateText,
      planReferenceFallbackPolicy: 'plan_reference_ratio_only',
      planReferenceFallbackRecommended: true,
      recentProgressDelta: progressFacts.recentProgressDelta,
      recentSpanDays: progressFacts.recentSpanDays,
      recoveredByTrend,
      recentRecoveredByTrend: progressFacts.recentRecoveredByTrend,
      stagnantByTrend: progressFacts.stagnantByTrend,
      progressOscillationByTrend: progressFacts.progressOscillationByTrend,
      recoverySegmentCount: progressFacts.recoverySegmentCount,
      stagnantOrRegressionSegmentCount: progressFacts.stagnantOrRegressionSegmentCount,
      externalReadinessLikelyPrimaryCause,
      externalReadinessPrimaryReasonType: externalCause.primaryBusinessReasonType,
      externalTimingCauseDetected: externalCause.hasExternalTimingCause,
      mixedCauseDowngradeSuppressed,
      severeInternalProgressDeficit: hasSevereInternalProgressDeficit,
      deficitBeyondThreshold,
    },
  }
}

export function scoreToDurationConfidenceLevel(score: number): 'high' | 'medium' | 'low' {
  if (score >= 75) return 'high'
  if (score >= 45) return 'medium'
  return 'low'
}

export function applyDurationContextToDays(days: number | null | undefined, context: DurationContextSummary) {
  const value = Number(days ?? 0)
  if (!Number.isFinite(value) || value <= 0) return null
  return Math.max(1, Math.ceil(value * context.multiplier + context.extraDays))
}

function factorImpactScore(factor: DurationContextFactor) {
  return Math.abs(Number(factor.multiplier ?? 1) - 1) * 100 + Math.max(0, Number(factor.extraDays ?? 0)) + Math.abs(Number(factor.confidenceDelta ?? 0))
}

function resolveClimateProductivityFloor(appliedFactors: DurationContextFactor[]) {
  const climateFactors = appliedFactors.filter((factor) => (
    factor.key === 'seasonal_productivity'
    || factor.key === 'process_seasonal_sensitivity'
    || factor.key === 'weather_forecast_impact'
  ))
  return {
    floor: 1 / DURATION_MULTIPLIER_SAFETY_MAX,
    policy: climateFactors.length >= 2
      ? 'none_observe_raw_climate_productivity'
      : 'not_applicable_single_climate_signal',
  }
}

function plannedDurationDaysFromInput(input: DurationContextInput) {
  const plannedStart = parseDate(input.plannedStartDate)
  const plannedEnd = parseDate(input.plannedEndDate)
  return orderedInclusiveDurationDays(plannedStart, plannedEnd)
}

function dynamicExtraDaysCap(plannedDuration: number | null) {
  if (plannedDuration == null) {
    return {
      cap: 7,
      policy: 'missing_planned_duration_conservative_cap_7',
    }
  }
  if (plannedDuration < 10) {
    return {
      cap: Math.max(1, Math.ceil(plannedDuration)),
      policy: 'planned_duration_dynamic_segment_cap',
    }
  }
  if (plannedDuration < 60) {
    return {
      cap: Math.max(1, Math.ceil(plannedDuration * 0.7)),
      policy: 'planned_duration_dynamic_segment_cap',
    }
  }
  return {
    cap: Math.max(1, Math.min(90, Math.ceil(plannedDuration * 0.5))),
    policy: 'planned_duration_dynamic_segment_cap',
  }
}

function buildExtraDaysCap(input: DurationContextInput, rawExtraDays: number) {
  const plannedDuration = plannedDurationDaysFromInput(input)
  const capPolicy = dynamicExtraDaysCap(plannedDuration)
  const cap = capPolicy.cap
  return {
    plannedDuration,
    cap,
    cappedExtraDays: Math.min(cap, rawExtraDays),
    policy: capPolicy.policy,
  }
}

export interface EffectiveDurationContextContributionOptions {
  includeConfidenceOnly?: boolean
  includeCandidateOnly?: boolean
  excludeFactorKeys?: DurationContextFactorKey[]
  includeDedupedSecondary?: boolean
}

function isCommittedDurationAction(actionPolicy: DurationContextActionPolicy) {
  return actionPolicy === 'auto_apply'
}

function isScenarioDurationAction(actionPolicy: DurationContextActionPolicy) {
  return actionPolicy === 'auto_apply' || actionPolicy === 'candidate_only'
}

export function listEffectiveDurationContextContributions(
  context: DurationContextSummary,
  options: EffectiveDurationContextContributionOptions = {},
) {
  const excludedKeys = new Set(options.excludeFactorKeys ?? [])
  const includeConfidenceOnly = options.includeConfidenceOnly === true
  const includeDedupedSecondary = options.includeDedupedSecondary !== false
  const ledger = context.calculationContext.factor_contribution_ledger?.length
    ? context.calculationContext.factor_contribution_ledger
    : fallbackContributionLedgerFromFactors(context.factors)

  return ledger
    .filter((entry) => includeConfidenceOnly || entry.actionPolicy !== 'confidence_only')
    .filter((entry) => options.includeCandidateOnly === true || entry.actionPolicy !== 'candidate_only')
    .filter((entry) => includeDedupedSecondary || entry.contributionMode !== 'deduped_secondary')
    .filter((entry) => !excludedKeys.has(entry.key))
}

export function summarizeEffectiveDurationContextContributions(
  context: DurationContextSummary,
  options: EffectiveDurationContextContributionOptions = {},
) {
  const contributions = listEffectiveDurationContextContributions(context, options)
  const multiplier = Number(contributions
    .filter((entry) => isCommittedDurationAction(entry.actionPolicy))
    .reduce((value, entry) => value * clamp(entry.multiplier || 1, 0.4, DURATION_MULTIPLIER_SAFETY_MAX), 1)
    .toFixed(3))
  const extraDays = contributions
    .filter((entry) => isCommittedDurationAction(entry.actionPolicy))
    .reduce((sum, entry) => sum + Math.max(0, Number(entry.extraDays ?? 0)), 0)
  const rawConfidenceDelta = contributions.reduce((sum, entry) => sum + Number(entry.confidenceDelta ?? 0), 0)
  return {
    contributions,
    multiplier,
    extraDays,
    rawConfidenceDelta,
    confidenceDelta: clamp(rawConfidenceDelta, DURATION_CONTEXT_CONFIDENCE_DELTA_MIN, DURATION_CONTEXT_CONFIDENCE_DELTA_MAX),
    adjustedBy: Array.from(new Set(contributions
      .filter((entry) => isCommittedDurationAction(entry.actionPolicy))
      .filter((entry) => entry.contributionMode !== 'deduped_secondary')
      .map((entry) => entry.key))).slice(0, 3),
  }
}

export async function buildDurationContext(input: DurationContextInput): Promise<DurationContextSummary> {
  const task = await loadTaskContext(normalizeId(input.taskId))
  const contextInput = mergeTaskContext(input, task)
  const runtimeCache = createDurationContextRuntimeCache()
  const algorithmFactContext = buildAlgorithmFactContext({
    phase: input.algorithmFactPhase ?? 'duration_context',
    projectGenerationFacts: input.projectGenerationFacts ?? readProjectGenerationFactsSnapshot(contextInput.standardTaskMetadata),
    runtimeExecutionFacts: {
      ...(input.runtimeExecutionFacts ?? {}),
      progressCompletionRatio: contextInput.progress == null ? undefined : Number(contextInput.progress) / 100,
    },
  })

  const asyncFactors = await Promise.all([
    buildSeasonalFactor(contextInput),
    buildProcessSeasonalFactor(contextInput),
    buildWeatherForecastImpactFactor(contextInput),
    buildProcessConstraintFactor(contextInput),
    buildExternalReadinessFactor(contextInput, runtimeCache),
    buildResourceConflictFactor(contextInput, runtimeCache),
    buildProjectBaselineCalibrationFactor(contextInput),
    buildProgressVelocityFactor(contextInput, runtimeCache),
    buildProgressQualityFactor(contextInput, runtimeCache),
    buildWorkflowSequenceFactor(contextInput),
    buildProjectScheduleStateFactor(contextInput),
  ])

  const baseFactors = asyncFactors.filter((factor): factor is DurationContextFactor => Boolean(factor))
  const initialAppliedFactors = baseFactors.filter((factor) => isScenarioDurationAction(factor.actionPolicy))
  const recoveryFactor = await buildPmRecoveryCompensationFactorWithEligibility(contextInput, initialAppliedFactors)
  const schedulePolicyFactors = applyProjectScheduleStatePolicy(recoveryFactor ? [...baseFactors, recoveryFactor] : baseFactors)
  const productivityCompensationFactor = await buildProductivityCompensationFactor(contextInput, schedulePolicyFactors)
  const factors = productivityCompensationFactor
    ? [...schedulePolicyFactors, productivityCompensationFactor]
    : schedulePolicyFactors
  const appliedFactors = factors.filter((factor) => isCommittedDurationAction(factor.actionPolicy))
  const scenarioFactors = factors.filter((factor) => isScenarioDurationAction(factor.actionPolicy))
  const projectBaselineFactor = appliedFactors.find((factor) => factor.key === 'project_baseline_calibration') ?? null
  const productivityCompensationAppliedFactor = scenarioFactors.find((factor) => factor.key === 'productivity_compensation') ?? null
  const productivityCompensationMetadata = readRecord(productivityCompensationAppliedFactor?.metadata)
  const workflowSequenceFactor = factors.find((factor) => factor.key === 'workflow_sequence') ?? null
  const workflowSequenceMetadata = readRecord(workflowSequenceFactor?.metadata)
  const buildingPatternWeightedCycleDays = readRecord(workflowSequenceMetadata.buildingPatternWeightedTypicalCycleDays)
  const buildingPatternContribution = readRecord(workflowSequenceMetadata.buildingPatternContribution)
  const sortedFactors = [...factors].sort((a, b) => factorImpactScore(b) - factorImpactScore(a))
  const baseFactorContributionLedger = buildFactorContributionLedger(contextInput, sortedFactors)
  const causalDedupe = buildCausalDedupeDiagnostics(sortedFactors)
  const factorInterferenceMatrix = resolveDurationContextInterferenceMatrix(baseFactorContributionLedger)
  const factorContributionLedger = buildEffectiveFactorContributionLedger(baseFactorContributionLedger, causalDedupe, factorInterferenceMatrix)
  const compensationMutexRelation = factorInterferenceMatrix.appliedRelations.find((relation) => (
    relation.primaryFactorKey === 'pm_recovery_compensation'
    && relation.secondaryFactorKey === 'productivity_compensation'
  ))
  const compensationMutex = compensationMutexRelation
    ? {
      applied: true,
      policy: normalizeText(compensationMutexRelation.policy) || 'pm_recovery_candidate_owns_local_recovery_candidate_path',
      primaryFactorKey: 'pm_recovery_compensation' as DurationContextFactorKey,
      suppressedFactorKey: 'productivity_compensation' as DurationContextFactorKey,
      suppressedIn: 'candidate_duration_context',
    }
    : {
      applied: false,
      policy: 'pm_recovery_candidate_owns_local_recovery_candidate_path',
    }
  const effectiveAppliedEntries = factorContributionLedger.filter((entry) => isCommittedDurationAction(entry.actionPolicy))
  const rawLedgerMultiplier = Number(effectiveAppliedEntries.reduce((value, factor) => value * clamp(factor.multiplier || 1, 0.4, DURATION_MULTIPLIER_SAFETY_MAX), 1).toFixed(3))
  const activeWeatherProductivityCeiling = resolveActiveWeatherProductivityCeiling(contextInput, sortedFactors)
  const rawMultiplier = rawLedgerMultiplier
  const climateFloor = resolveClimateProductivityFloor(appliedFactors)
  const climateProductivityFloor = climateFloor.floor
  const multiplierCap = DURATION_MULTIPLIER_SAFETY_MAX
  const multiplier = Math.min(rawMultiplier, multiplierCap)
  const rawExtraDays = effectiveAppliedEntries.reduce((sum, factor) => sum + Math.max(0, Number(factor.extraDays ?? 0)), 0)
  const extraDaysCap = buildExtraDaysCap(contextInput, rawExtraDays)
  const committedDurationContext = applyProductivityCeilingToScenario(summarizeLedgerDurationScenario({
    ledger: factorContributionLedger,
    policy: 'auto_apply_only',
    extraDaysCap,
  }), activeWeatherProductivityCeiling)
  const candidateDurationContext = applyProductivityCeilingToScenario(summarizeLedgerDurationScenario({
    ledger: factorContributionLedger,
    policy: 'auto_apply_plus_candidate_only',
    extraDaysCap,
  }), activeWeatherProductivityCeiling)
  const committedMultiplier = Number(committedDurationContext.multiplier ?? multiplier)
  const committedRawMultiplier = Number(committedDurationContext.rawMultiplier ?? rawMultiplier)
  const climateAppliedFactorCount = Array.isArray(committedDurationContext.factorKeys)
    ? committedDurationContext.factorKeys.filter((key) => CLIMATE_DURATION_FACTOR_KEYS.has(key as DurationContextFactorKey)).length
    : 0
  const rawConfidenceDelta = factorContributionLedger.reduce((sum, factor) => sum + Number(factor.confidenceDelta ?? 0), 0)
  const confidenceDelta = clamp(rawConfidenceDelta, DURATION_CONTEXT_CONFIDENCE_DELTA_MIN, DURATION_CONTEXT_CONFIDENCE_DELTA_MAX)
  const adjustedBy = Array.from(new Set(factorContributionLedger
    .filter((entry) => isCommittedDurationAction(entry.actionPolicy))
    .filter((entry) => !['deduped_secondary', 'interference_secondary'].includes(entry.contributionMode))
    .map((factor) => factor.key))).slice(0, 3)
  const confidenceLevel = scoreToDurationConfidenceLevel(60 + confidenceDelta)
  const progress = clamp(Number(contextInput.progress ?? 0), 0, 100)
  const velocitySkippedDueToZeroProgress = progress <= 0
    && !sortedFactors.some((factor) => factor.key === 'progress_velocity')
  const inputCoverage = buildInputCoverage(sortedFactors)
  const readinessGraph = buildReadinessGraph(contextInput, sortedFactors)
  const scheduleStateMetadata = readRecord(factors.find((factor) => factor.key === 'project_schedule_state')?.metadata)
  const projectScheduleStateComposition = readRecord(scheduleStateMetadata.scheduleStateComposition)
  const calendarMissingFactor = factors.find((factor) => factor.key === 'calendar_missing') ?? null
  const calendarMissingMetadata = readRecord(calendarMissingFactor?.metadata)
  const calendarMissingSubrule = calendarMissingFactor
    ? {
      code: 'calendar_missing',
      parentFactorKey: 'seasonal_productivity',
      runtimeAuthority: 'confidence_only',
      actionPolicy: calendarMissingFactor.actionPolicy,
      plannedDate: normalizeText(calendarMissingMetadata.plannedDate) || undefined,
      year: readPositiveNumberOrNull(calendarMissingMetadata.year) ?? undefined,
      governancePath: normalizeText(calendarMissingMetadata.governancePath)
        || 'duration_context_governance.factor_consumption_matrix.calendar_missing',
    }
    : undefined
  const externalReadinessCalibration = readRecord(readRecord(factors.find((factor) => factor.key === 'external_readiness')?.metadata).externalReadinessCalibration)
  const externalReadinessCalibrationContext = Object.keys(externalReadinessCalibration).length > 0
    ? {
      applied: externalReadinessCalibration.applied === true,
      calibrationId: normalizeId(externalReadinessCalibration.calibrationId),
      source: normalizeText(externalReadinessCalibration.source) || 'default_policy_no_published_overlay',
      weightScale: readRecord(externalReadinessCalibration.weightScale) as Record<string, number>,
    }
    : undefined
  const explainPackage = buildExplainPackage({
    ledger: factorContributionLedger,
    readinessGraph,
    causalDedupe,
    inputCoverage,
    scheduleComposition: Object.keys(projectScheduleStateComposition).length > 0 ? projectScheduleStateComposition : undefined,
    externalReadinessCalibration: externalReadinessCalibrationContext,
    multiplier: clamp(committedMultiplier, 0.4, DURATION_MULTIPLIER_SAFETY_MAX),
    extraDays: extraDaysCap.cappedExtraDays,
    confidenceDelta,
    runtimeCache: summarizeDurationContextRuntimeCache(runtimeCache),
  })

  return {
    contextVersion: 'v1.4.7.4',
    multiplier: clamp(committedMultiplier, 0.4, DURATION_MULTIPLIER_SAFETY_MAX),
    extraDays: extraDaysCap.cappedExtraDays,
    confidenceDelta,
    rawConfidenceDelta,
    adjustedBy,
    factors: sortedFactors,
    businessReasons: sortedFactors.slice(0, 3).map((factor) => factor.reason),
    hasLowConfidenceSignal: factors.some((factor) => factor.actionPolicy === 'confidence_only' || factor.confidenceDelta <= -10),
    calculationContext: {
      duration_source: input.durationSource ?? 'standard',
      adjusted_by: adjustedBy,
      confidence_level: confidenceLevel,
      factor_summary_available: factors.length > 0,
      raw_multiplier: committedRawMultiplier,
      climate_multiplier_cap: multiplierCap,
      climate_productivity_floor: undefined,
      climate_productivity_floor_policy: climateFloor.policy,
      climate_applied_factor_count: climateAppliedFactorCount,
      climate_cap_applied: rawMultiplier > multiplier || committedMultiplier > multiplier,
      committed_duration_context: committedDurationContext,
      candidate_duration_context: candidateDurationContext,
      synthesis_order_policy: (explainPackage.synthesisOrderPolicy as Record<string, unknown> | undefined),
      pm_recovery_factor: recoveryFactor ? recoveryFactor.multiplier : undefined,
      pm_recovery_applied: Boolean(recoveryFactor),
      compensation_mutex: compensationMutex,
      productivity_compensation_factor: productivityCompensationAppliedFactor ? productivityCompensationAppliedFactor.multiplier : undefined,
      productivity_compensation_uplift: readPositiveNumberOrNull(productivityCompensationMetadata.productivityUplift) ?? undefined,
      productivity_compensation_adjusted_productivity: readPositiveNumberOrNull(productivityCompensationMetadata.adjustedProductivity) ?? undefined,
      productivity_compensation_applied: Boolean(productivityCompensationAppliedFactor),
      productivity_compensation_sources: Array.isArray(productivityCompensationMetadata.sourceBreakdown)
        ? productivityCompensationMetadata.sourceBreakdown as Array<Record<string, unknown>>
        : undefined,
      project_baseline_factor: projectBaselineFactor ? projectBaselineFactor.multiplier : undefined,
      project_baseline_calibration_applied: Boolean(projectBaselineFactor),
      active_weather_productivity_ceiling: activeWeatherProductivityCeiling
        ? {
          applied: true,
          maxProductivity: activeWeatherProductivityCeiling.maxProductivity,
          minimumMultiplier: activeWeatherProductivityCeiling.minimumMultiplier,
          reason: activeWeatherProductivityCeiling.reason,
          matchedSignals: activeWeatherProductivityCeiling.matchedSignals,
        }
        : undefined,
      external_readiness_calibration: externalReadinessCalibrationContext,
      project_schedule_state: normalizeText(scheduleStateMetadata.state) || undefined,
      project_schedule_scope_type: normalizeText(scheduleStateMetadata.scopeType) || undefined,
      project_schedule_scope_id: normalizeText(scheduleStateMetadata.scopeId) || undefined,
      project_schedule_state_confidence: readPositiveNumberOrNull(scheduleStateMetadata.confidence) ?? undefined,
      project_schedule_state_factor: factors.find((factor) => factor.key === 'project_schedule_state')?.multiplier,
      project_schedule_state_resource_relaxation: factors.some((factor) => factor.key === 'resource_conflict' && readRecord(factor.metadata).projectScheduleStatePolicyApplied === true) || undefined,
      project_schedule_state_velocity_superseded: factors.some((factor) => factor.key === 'progress_velocity' && readRecord(factor.metadata).supersededByProjectScheduleState === true) || undefined,
      project_schedule_state_composition: Object.keys(projectScheduleStateComposition).length > 0
        ? projectScheduleStateComposition
        : undefined,
      calendar_missing_subrule: calendarMissingSubrule,
      building_pattern_contribution: Object.keys(buildingPatternContribution).length > 0
        ? buildingPatternContribution
        : undefined,
      factor_cap_policy: {
        policy: 'factor_specific_caps_with_synthesis_safety_backstop',
        synthesisMultiplierSafetyMax: DURATION_MULTIPLIER_SAFETY_MAX,
        confidenceDeltaMin: DURATION_CONTEXT_CONFIDENCE_DELTA_MIN,
        confidenceDeltaMax: DURATION_CONTEXT_CONFIDENCE_DELTA_MAX,
        factorSpecificCaps: FACTOR_MULTIPLIER_CAP_POLICY,
      },
      building_pattern_weighted_cycle_days: Object.keys(buildingPatternWeightedCycleDays).length > 0
        ? buildingPatternWeightedCycleDays as { firstFloor: number; midFloors: number; lastFloors: number }
        : undefined,
      building_pattern_weighted_mid_floor_days: readPositiveNumberOrNull(buildingPatternWeightedCycleDays.midFloors) ?? undefined,
      raw_extra_days: rawExtraDays,
      extra_days_cap: extraDaysCap.cap,
      extra_days_cap_policy: extraDaysCap.policy,
      extra_days_cap_applied: rawExtraDays > extraDaysCap.cappedExtraDays,
      raw_confidence_delta: rawConfidenceDelta,
      confidence_delta_cap: {
        min: DURATION_CONTEXT_CONFIDENCE_DELTA_MIN,
        max: DURATION_CONTEXT_CONFIDENCE_DELTA_MAX,
      },
      confidence_delta_cap_applied: rawConfidenceDelta !== confidenceDelta,
      velocity_skipped_due_to_zero_progress: velocitySkippedDueToZeroProgress || undefined,
      velocity_skip_reason: velocitySkippedDueToZeroProgress ? 'zero_progress_has_no_execution_velocity_sample' : undefined,
      scope_context: buildScopeContext(contextInput),
      input_coverage: inputCoverage,
      factor_contribution_ledger: factorContributionLedger,
      readiness_graph: readinessGraph,
      causal_dedupe: causalDedupe,
      factor_interference_matrix: factorInterferenceMatrix,
      explain_package: explainPackage,
      algorithm_fact_context: summarizeAlgorithmFactContext(algorithmFactContext),
      climate_coupling_observability: sortedFactors
        .filter((factor) => factor.key === 'seasonal_productivity' || factor.key === 'process_seasonal_sensitivity' || factor.key === 'weather_forecast_impact' || factor.key === 'pm_recovery_compensation')
        .map((factor) => ({
          key: factor.key,
          climateSignal: (factor.metadata as Record<string, unknown> | undefined)?.climateSignal ?? null,
          monthlyClimateSignal: (factor.metadata as Record<string, unknown> | undefined)?.monthlyClimateSignal ?? null,
          weatherStaticCoupling: (factor.metadata as Record<string, unknown> | undefined)?.weatherStaticCoupling ?? null,
          weatherSourceStatus: (factor.metadata as Record<string, unknown> | undefined)?.weatherSourceStatus ?? null,
        })),
    },
  }
}
