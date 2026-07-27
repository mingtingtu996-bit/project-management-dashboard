import { createHash } from 'crypto'

import { logger } from '../middleware/logger.js'
import {
  autoGovernAlgorithmSeedUpgradeCandidate,
} from './algorithmSeedAutoGovernanceService.js'
import {
  createAlgorithmSeedUpgradeCandidate,
  type AlgorithmSeedCandidateSource,
} from './algorithmSeedLearningService.js'
import {
  normalizeAlgorithmSeedRecordPayload,
  type AlgorithmSeedType,
} from './algorithmSeedRegistry.js'
import { supabase } from './dbService.js'
import {
  inferDurationContributionMode,
  isDurationBearingContributionMode,
  normalizeDurationContributionMode,
} from '../seeds/durationContributionMode.js'
import { V1474_BUILDING_PATTERN_SEED } from '../seeds/v1474BuildingPatternSeed.js'

export type AlgorithmSeedDiscoveryScope = 'project' | 'company'

export interface AlgorithmSeedDiscoverySample {
  id?: string | null
  company_id?: string | null
  project_id?: string | null
  task_id?: string | null
  template_node_id?: string | null
  standard_work_code?: string | null
  standard_work_name?: string | null
  wbs_node_type?: string | null
  actual_duration?: number | null
  planned_duration?: number | null
  duration_day_basis?: string | null
  actual_duration_calendar_days?: number | null
  actual_duration_production_days?: number | null
  planned_duration_calendar_days?: number | null
  planned_duration_production_days?: number | null
  started_at?: string | null
  completed_at?: string | null
  confidence_score?: number | null
  metadata?: Record<string, unknown> | null
}

export interface AlgorithmSeedDiscoveryOptions {
  companyId?: string | null
  projectId?: string | null
  projectIds?: string[] | null
  minProjectSamples?: number
  minCompanySamples?: number
  maxSamples?: number
  autoGovern?: boolean
  triggeredBy?: string | null
}

export interface BuiltAlgorithmSeedDiscoveryCandidate {
  seedType: AlgorithmSeedType
  stableCode: string
  candidatePayload: Record<string, unknown>
  candidateSource: AlgorithmSeedCandidateSource
  projectId: string | null
  companyId: string | null
  sampleCount: number
  variance: number
  confidenceLevel: 'high' | 'medium' | 'low'
  evidenceSummary: Record<string, unknown>
}

export interface TitleWeakUnmatchedDiagnostic {
  scope: AlgorithmSeedDiscoveryScope
  aliasText: string
  aliasSignature: string
  projectId: string | null
  companyId: string | null
  sampleCount: number
  reasons: string[]
  weakStandardWorkCodes: string[]
  sampleIds: string[]
  taskIds: string[]
}

export interface AlgorithmSeedDiscoveryResult {
  sampleCount: number
  discovered: number
  unmatchedDiagnostics: number
  created: number
  skippedDuplicates: number
  governed: number
  failed: Array<{ stableCode: string; reason: string }>
}

const DEFAULT_MAX_SAMPLES = 5000
const DEFAULT_PROJECT_MIN_SAMPLES = 5
const DEFAULT_COMPANY_MIN_SAMPLES = 20
const ACTIVE_CANDIDATE_STATUSES = ['pending', 'candidate_only', 'auto_published', 'quarantined']
const STANDARD_DURATION_STRICT_P50_WINDOW_RATIO = 0.3
const STANDARD_DURATION_WIDE_DISTRIBUTION_RATIO = 4

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

function normalizeLower(value: unknown) {
  return normalizeText(value).toLowerCase()
}

function normalizeUuid(value: unknown) {
  const text = normalizeText(value)
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text)
    ? text
    : null
}

function normalizeNumber(value: unknown, fallback = 0) {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

function normalizePositiveDays(value: unknown) {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? Math.ceil(number) : null
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function readArray(value: unknown) {
  const raw = Array.isArray(value)
    ? value
    : normalizeText(value)
      ? normalizeText(value).split(/[,\s]+/)
      : []
  return Array.from(new Set(raw.map((item) => normalizeText(item)).filter(Boolean)))
}

function readRecordArray(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return []
  return value
    .map(readRecord)
    .filter((item) => Object.keys(item).length > 0)
}

function readNestedTextArray(value: unknown): string[][] {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => readArray(item))
    .filter((group) => group.length > 0)
}

function uniqueRecordArray(values: Array<Record<string, unknown> | null | undefined>) {
  const seen = new Set<string>()
  const output: Record<string, unknown>[] = []
  for (const value of values) {
    const record = readRecord(value)
    if (!Object.keys(record).length) continue
    const key = JSON.stringify(record)
    if (seen.has(key)) continue
    seen.add(key)
    output.push(record)
  }
  return output
}

function readCompanyId(sample: AlgorithmSeedDiscoverySample) {
  return normalizeText(sample.company_id ?? sample.metadata?.company_id) || null
}

function readProjectId(sample: AlgorithmSeedDiscoverySample) {
  return normalizeText(sample.project_id) || null
}

function readBenchmarkContextKey(sample: AlgorithmSeedDiscoverySample) {
  const metadata = readRecord(sample.metadata)
  const explicit = normalizeText(metadata.benchmark_context_key)
  if (explicit) return explicit

  const projectTypeCode = readSampleProjectTypeCode(sample)
  const structureTypeCode = readSampleStructureTypeCode(sample)
  const methodVariantCodes = readSampleMethodVariantCodes(sample)
  const elementVariantCodes = readSampleElementVariantCodes(sample)
  const responsibilityRole = readSampleResponsibilityRole(sample)
  const parts = [
    projectTypeCode ? `project=${projectTypeCode}` : '',
    structureTypeCode ? `structure=${structureTypeCode}` : '',
    methodVariantCodes.length > 0 ? `method=${methodVariantCodes.join('+')}` : '',
    elementVariantCodes.length > 0 ? `element=${elementVariantCodes.join('+')}` : '',
    responsibilityRole ? `role=${responsibilityRole}` : '',
  ].filter(Boolean)
  return parts.length > 0 ? parts.join('|') : 'all'
}

function readSampleProjectTypeCode(sample: AlgorithmSeedDiscoverySample) {
  const metadata = readRecord(sample.metadata)
  return normalizeText(metadata.project_type_code ?? metadata.projectTypeCode).toLowerCase()
}

function readSampleStructureTypeCode(sample: AlgorithmSeedDiscoverySample) {
  const metadata = readRecord(sample.metadata)
  return normalizeText(metadata.structure_type_code ?? metadata.structureTypeCode).toLowerCase()
}

function readSampleMethodVariantCodes(sample: AlgorithmSeedDiscoverySample) {
  const metadata = readRecord(sample.metadata)
  return readArray(metadata.method_variant_codes ?? metadata.methodVariantCodes).map((item) => item.toLowerCase())
}

function readSampleElementVariantCodes(sample: AlgorithmSeedDiscoverySample) {
  const metadata = readRecord(sample.metadata)
  return readArray(metadata.element_variant_codes ?? metadata.elementVariantCodes).map((item) => item.toLowerCase())
}

function readSampleResponsibilityRole(sample: AlgorithmSeedDiscoverySample) {
  const metadata = readRecord(sample.metadata)
  return normalizeText(
    metadata.typical_responsibility_role
      ?? metadata.typicalResponsibilityRole
      ?? metadata.responsibility_role
      ?? metadata.responsibilityRole,
  ).toLowerCase()
}

function uniqueFromFacts<T extends { sample: AlgorithmSeedDiscoverySample }>(
  facts: T[],
  reader: (sample: AlgorithmSeedDiscoverySample) => string | null | undefined,
) {
  return Array.from(new Set(facts.map((fact) => normalizeText(reader(fact.sample)).toLowerCase()).filter(Boolean)))
}

function uniqueArrayFromFacts<T extends { sample: AlgorithmSeedDiscoverySample }>(
  facts: T[],
  reader: (sample: AlgorithmSeedDiscoverySample) => string[],
) {
  return Array.from(new Set(facts.flatMap((fact) => reader(fact.sample)).map((item) => normalizeText(item).toLowerCase()).filter(Boolean)))
}

function dominantValue(values: string[]) {
  if (values.length === 0) return null
  const counts = new Map<string, number>()
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1)
  return [...counts.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0]?.[0] ?? null
}

function readApplicableGranularity(sample: AlgorithmSeedDiscoverySample) {
  const wbsNodeType = normalizeLower(sample.wbs_node_type)
  if (['operation', 'activity', 'activity_step'].includes(wbsNodeType)) return 'operation'
  if (['process', 'task'].includes(wbsNodeType)) return 'process'
  return 'both'
}

function slugPart(value: unknown) {
  return normalizeLower(value)
    .replace(/[^a-z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48) || 'unknown'
}

function shortHash(value: string) {
  return createHash('sha1').update(value).digest('hex').slice(0, 10)
}

function percentile(sortedValues: number[], percentileValue: number) {
  if (sortedValues.length === 0) return 0
  const index = Math.max(0, Math.ceil(sortedValues.length * percentileValue) - 1)
  return sortedValues[Math.min(sortedValues.length - 1, index)]
}

function coefficientOfVariation(values: number[]) {
  if (values.length === 0) return 0
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length
  if (mean <= 0) return 0
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length
  return Math.round((Math.sqrt(variance) / mean) * 1000) / 1000
}

function buildStandardDurationPrecisionGovernance(input: {
  p20: number
  p50: number
  p80: number
}) {
  const p80P20Ratio = input.p20 > 0 ? Math.round((input.p80 / input.p20) * 1000) / 1000 : null
  const lowerBoundDays = Math.max(1, Math.round(input.p50 * (1 - STANDARD_DURATION_STRICT_P50_WINDOW_RATIO)))
  const upperBoundDays = Math.max(lowerBoundDays, Math.round(input.p50 * (1 + STANDARD_DURATION_STRICT_P50_WINDOW_RATIO)))
  const issueCodes = [
    p80P20Ratio !== null && p80P20Ratio >= STANDARD_DURATION_WIDE_DISTRIBUTION_RATIO
      ? 'p80_p20_distribution_too_wide'
      : null,
    input.p20 < lowerBoundDays || input.p80 > upperBoundDays
      ? 'p50_precision_window_exceeded'
      : null,
  ].filter((item): item is string => Boolean(item))
  return {
    strictP50WindowRatio: STANDARD_DURATION_STRICT_P50_WINDOW_RATIO,
    lowerBoundDays,
    upperBoundDays,
    p80P20Ratio,
    strictP50WindowPassed: !issueCodes.includes('p50_precision_window_exceeded'),
    wideDistributionPassed: !issueCodes.includes('p80_p20_distribution_too_wide'),
    issueCodes,
    promotionPolicy: issueCodes.length > 0
      ? 'review_required_before_seed_or_override_promotion'
      : 'eligible_for_auto_governance_thresholds',
  }
}

function normalizeConfidence(value: unknown) {
  const number = normalizeNumber(value, 0)
  if (number <= 0) return 0.45
  return Math.max(0, Math.min(1, number > 1 ? number / 100 : number))
}

function confidenceLevel(score: number): 'high' | 'medium' | 'low' {
  if (score >= 0.8) return 'high'
  if (score >= 0.6) return 'medium'
  return 'low'
}

function calculateConfidenceScore(input: {
  scope: AlgorithmSeedDiscoveryScope
  sampleCount: number
  cv: number
  averageSampleConfidence: number
  hasEvidence: boolean
  minProjectSamples: number
  minCompanySamples: number
}) {
  const minSamples = input.scope === 'project' ? input.minProjectSamples : input.minCompanySamples
  const sampleFactor = Math.min(1, input.sampleCount / Math.max(minSamples, 1))
  const cvFactor = Math.max(0, 1 - Math.min(1, input.cv / 0.6))
  const evidenceFactor = input.hasEvidence ? 1 : 0
  const score = (sampleFactor * 0.35)
    + (cvFactor * 0.3)
    + (input.averageSampleConfidence * 0.25)
    + (evidenceFactor * 0.1)
  return Math.round(Math.max(0, Math.min(1, score)) * 1000) / 1000
}

type SampleMaturity = 'cold_start' | 'usable' | 'stable' | 'mature'

function buildSampleMaturityProfile(input: {
  seedType: AlgorithmSeedType
  scope: AlgorithmSeedDiscoveryScope
  sampleCount: number
  cv: number
  confidenceScore: number
  crossProjects: number
  crossCompanies: number
}) {
  const isCompany = input.scope === 'company'
  const baseThreshold = isCompany
    ? { minSamples: 20, maxCv: 0.3, minConfidence: 0.8, minCrossProjects: 3 }
    : { minSamples: 5, maxCv: 0.35, minConfidence: 0.75, minCrossProjects: 0 }
  const stableMinSamples = isCompany ? 40 : input.seedType === 'building_pattern' ? 10 : 12
  const matureMinSamples = isCompany ? 80 : input.seedType === 'building_pattern' ? 20 : 25
  const stableMaxCv = input.seedType === 'site_capacity_pressure' ? 0.32 : 0.28
  const matureMaxCv = input.seedType === 'site_capacity_pressure' ? 0.28 : input.seedType === 'building_pattern' ? 0.22 : 0.24
  const hasStableBreadth = !isCompany || input.crossProjects >= 3
  const hasMatureBreadth = !isCompany || input.crossProjects >= 5
  let sampleMaturity: SampleMaturity = 'usable'
  const maturityReasonCodes: string[] = []

  if (input.sampleCount < baseThreshold.minSamples) {
    sampleMaturity = 'cold_start'
    maturityReasonCodes.push('sample_count_below_minimum')
  } else if (
    input.sampleCount >= matureMinSamples
    && input.cv <= matureMaxCv
    && input.confidenceScore >= 0.85
    && hasMatureBreadth
  ) {
    sampleMaturity = 'mature'
    maturityReasonCodes.push('sample_volume_mature', 'variance_low', 'confidence_high')
    if (isCompany) maturityReasonCodes.push('cross_project_breadth_mature')
  } else if (
    input.sampleCount >= stableMinSamples
    && input.cv <= stableMaxCv
    && input.confidenceScore >= 0.8
    && hasStableBreadth
  ) {
    sampleMaturity = 'stable'
    maturityReasonCodes.push('sample_volume_stable', 'variance_controlled', 'confidence_sufficient')
    if (isCompany) maturityReasonCodes.push('cross_project_breadth_stable')
  } else {
    sampleMaturity = 'usable'
    maturityReasonCodes.push('minimum_sample_gate_passed')
    if (input.cv > stableMaxCv) maturityReasonCodes.push('variance_not_yet_stable')
    if (input.confidenceScore < 0.8) maturityReasonCodes.push('confidence_not_yet_stable')
    if (isCompany && input.crossProjects < 3) maturityReasonCodes.push('cross_project_breadth_missing')
  }

  const stableThreshold = isCompany
    ? { minSamples: 40, maxCv: input.seedType === 'site_capacity_pressure' ? 0.28 : 0.26, minConfidence: 0.84, minCrossProjects: 4 }
    : { minSamples: stableMinSamples, maxCv: stableMaxCv, minConfidence: input.seedType === 'building_pattern' ? 0.82 : 0.8, minCrossProjects: 0 }
  const matureThreshold = isCompany
    ? { minSamples: 80, maxCv: input.seedType === 'site_capacity_pressure' ? 0.24 : input.seedType === 'building_pattern' ? 0.2 : 0.22, minConfidence: input.seedType === 'building_pattern' ? 0.88 : 0.87, minCrossProjects: 5 }
    : { minSamples: matureMinSamples, maxCv: matureMaxCv, minConfidence: input.seedType === 'building_pattern' ? 0.88 : 0.85, minCrossProjects: 0 }
  const recommendedGovernanceThresholds = sampleMaturity === 'mature'
    ? matureThreshold
    : sampleMaturity === 'stable'
      ? stableThreshold
      : baseThreshold

  return {
    sampleMaturity,
    maturityReasonCodes,
    recommendedGovernanceThresholds,
    thresholdCalibrationPolicy: 'sample_volume_variance_confidence_bounded_strict_overlay_only',
  }
}

function buildStableCode(seedType: AlgorithmSeedType, standardWorkCode: string, subtype: string, contextKey: string) {
  return [
    'learned',
    seedType,
    slugPart(standardWorkCode),
    slugPart(subtype),
    shortHash(contextKey),
  ].join(':')
}

function readProcessConstraintFact(sample: AlgorithmSeedDiscoverySample) {
  const metadata = readRecord(sample.metadata)
  const observation = readRecord(metadata.process_constraint_observation ?? metadata.processConstraintObservation)
  const constraintType = normalizeText(
    observation.constraintType
    ?? observation.constraint_type
    ?? observation.ruleCode
    ?? observation.rule_code
    ?? metadata.process_constraint_type
    ?? metadata.constraint_type
    ?? metadata.technical_interval_type
    ?? metadata.observed_constraint_type,
  )
  const days = normalizePositiveDays(
    metadata.technical_interval_days
    ?? metadata.constraint_days
    ?? metadata.waiting_days
    ?? metadata.lag_days,
  )
  const hasExecutionObservation = Object.keys(observation).length > 0
    || normalizeText(metadata.process_constraint_back_validation) === 'true'
    || normalizeText(metadata.observed_application_mode)
    || normalizeText(metadata.observed_relation_kind)
    || normalizeText(metadata.release_quantity_evidence_source)
  if (!constraintType || (!days && !hasExecutionObservation)) return null
  return { subtype: constraintType, days: days ?? 1 }
}

type CandidateFact = {
  seedType: 'process_constraint' | 'standard_work_duration'
  subtype: string
  days: number
  sample: AlgorithmSeedDiscoverySample
}

type SeasonalProductivityFact = {
  seedType: 'seasonal_productivity'
  regionCode: string
  thermalZone: string | null
  month: number
  climateSignal: 'rainy_season' | 'winter_low_temp' | 'summer_heat'
  productivity: number
  sample: AlgorithmSeedDiscoverySample
}

type ProcessSeasonalSensitivityFact = {
  seedType: 'process_seasonal_sensitivity'
  standardWorkCode: string
  standardWorkName: string | null
  month: number
  climateSignal: 'rainy_season' | 'winter_low_temp'
  productivity: number
  sample: AlgorithmSeedDiscoverySample
}

type SiteCapacityPressureFact = {
  seedType: 'site_capacity_pressure'
  signalType: string
  predictedExtraDays: number
  actualDelayDays: number
  multiplier: number
  confidenceDelta: number
  pressureScore: number
  resourceOperationType: string | null
  durationImpactMode: string | null
  sample: AlgorithmSeedDiscoverySample
}

type BuildingPatternFact = {
  seedType: 'building_pattern'
  patternCode: string
  matchScore: number
  confidenceScore: number
  confidenceLevel: 'high' | 'medium' | 'low'
  matchedSignals: string[]
  missingSignals: string[]
  actionPolicy: string | null
  rhythmStrategyCodes: string[]
  expansionStrategy: string | null
  rhythmUnit: string | null
  primaryWorkfaceType: string | null
  phaseWindow: string | null
  projectTypeCode: string | null
  structureTypeCode: string | null
  methodVariantCodes: string[]
  elementVariantCodes: string[]
  inferredSystemKeys: string[]
  inferredWorkfaceKeys: string[]
  generatedPlanEditDistanceAvg: number | null
  userDateAdjustmentAvgDays: number | null
  sample: AlgorithmSeedDiscoverySample
}

function readMonthFromSample(sample: AlgorithmSeedDiscoverySample) {
  const metadata = readRecord(sample.metadata)
  const explicitMonth = normalizeNumber(metadata.actual_start_month ?? metadata.planned_start_month, 0)
  if (Number.isInteger(explicitMonth) && explicitMonth >= 1 && explicitMonth <= 12) return explicitMonth
  const dateText = normalizeText(sample.started_at ?? metadata.started_at ?? metadata.planned_start_at)
  const parsed = /^\d{4}-\d{2}/.test(dateText) ? Number(dateText.slice(5, 7)) : 0
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 12 ? parsed : null
}

function readDurationProductivity(sample: AlgorithmSeedDiscoverySample) {
  const planned = normalizePositiveDays(sample.planned_duration)
  const actual = normalizePositiveDays(sample.actual_duration)
  if (!planned || !actual) return null
  return Math.max(0.6, Math.min(1.05, Math.round((planned / actual) * 1000) / 1000))
}

function readClimateSignal(sample: AlgorithmSeedDiscoverySample): 'normal' | 'rainy_season' | 'winter_low_temp' | 'summer_heat' | null {
  const metadata = readRecord(sample.metadata)
  const signal = normalizeText(metadata.actual_start_climate_signal ?? metadata.climate_signal ?? metadata.monthly_climate_signal)
  if (signal === 'rainy_season' || signal === 'winter_low_temp' || signal === 'summer_heat' || signal === 'normal') return signal
  return null
}

function readSeasonalProductivityFact(sample: AlgorithmSeedDiscoverySample): SeasonalProductivityFact | null {
  const metadata = readRecord(sample.metadata)
  const month = readMonthFromSample(sample)
  const climateSignal = readClimateSignal(sample)
  const productivity = readDurationProductivity(sample)
  const regionCode = normalizeText(metadata.thermal_zone ?? metadata.climate_region)
  if (!month || !climateSignal || climateSignal === 'normal' || !productivity || !regionCode || productivity >= 0.98) return null
  return {
    seedType: 'seasonal_productivity',
    regionCode,
    thermalZone: normalizeText(metadata.thermal_zone) || null,
    month,
    climateSignal,
    productivity,
    sample,
  }
}

function readProcessSeasonalSensitivityFact(sample: AlgorithmSeedDiscoverySample): ProcessSeasonalSensitivityFact | null {
  const standardWorkCode = normalizeText(sample.standard_work_code)
  const month = readMonthFromSample(sample)
  const climateSignal = readClimateSignal(sample)
  const productivity = readDurationProductivity(sample)
  if (!standardWorkCode || !month || !productivity || productivity >= 0.98) return null
  if (climateSignal !== 'rainy_season' && climateSignal !== 'winter_low_temp') return null
  return {
    seedType: 'process_seasonal_sensitivity',
    standardWorkCode,
    standardWorkName: normalizeText(sample.standard_work_name) || null,
    month,
    climateSignal,
    productivity,
    sample,
  }
}

function readFactorSummary(metadata: Record<string, unknown>) {
  return readRecord(metadata.factor_summary ?? metadata.factorSummary ?? metadata.duration_factor_summary)
}

function readSiteCapacityPressureFact(sample: AlgorithmSeedDiscoverySample): SiteCapacityPressureFact | null {
  const metadata = readRecord(sample.metadata)
  const explicit = readRecord(metadata.site_capacity_pressure ?? metadata.siteCapacityPressure)
  const factorSummary = readFactorSummary(metadata)
  const factors = Array.isArray(factorSummary.factors) ? factorSummary.factors : []
  const factor = factors
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object' && !Array.isArray(item))
    .find((item) => normalizeText(item.key) === 'resource_conflict')
  const source = Object.keys(explicit).length > 0 ? explicit : factor
  if (!source || Object.keys(source).length === 0) return null

  const predictedExtraDays = Math.max(0, normalizeNumber(source.extraDays ?? source.extra_days, 0))
  const multiplier = normalizeNumber(source.multiplier, 1)
  const confidenceDelta = normalizeNumber(source.confidenceDelta ?? source.confidence_delta, 0)
  const sourceMetadata = readRecord(source.metadata)
  const pressureScore = normalizeNumber(sourceMetadata.pressureScore ?? explicit.pressureScore ?? explicit.pressure_score, 0)
  const resourceOperationType = normalizeText(sourceMetadata.resourceOperationType ?? explicit.resourceOperationType ?? explicit.resource_operation_type) || null
  const durationImpactMode = normalizeText(sourceMetadata.durationImpactMode ?? explicit.durationImpactMode ?? explicit.duration_impact_mode) || null
  const actual = normalizePositiveDays(sample.actual_duration)
  const planned = normalizePositiveDays(sample.planned_duration)
  const explicitDelay = normalizeNumber(metadata.actual_delay_days ?? metadata.actualDelayDays, NaN)
  const actualDelayDays = Number.isFinite(explicitDelay)
    ? Math.max(0, explicitDelay)
    : actual && planned ? Math.max(0, actual - planned) : 0
  if (actualDelayDays <= 0 && predictedExtraDays <= 0 && multiplier <= 1.01 && pressureScore <= 0) return null

  const signalTypes = [
    sourceMetadata.resourceConditionCount ? 'resource_condition' : null,
    sourceMetadata.resourceObstacleCount ? 'resource_obstacle' : null,
    sourceMetadata.overdueMaterialCount ? 'overdue_material' : null,
    sourceMetadata.sameResponsibleUnitCount ? 'same_responsible_unit' : null,
    sourceMetadata.sameBuildingCount ? 'same_building' : null,
    sourceMetadata.sameResourceClassCount ? 'same_resource_class' : null,
    sourceMetadata.progressPressureCount ? 'progress_pressure' : null,
    sourceMetadata.longTermResourceSignalCount ? 'long_term_signal' : null,
    resourceOperationType ? `resource_operation:${resourceOperationType}` : null,
    durationImpactMode ? `duration_impact:${durationImpactMode}` : null,
  ].filter(Boolean)
  const signalType = normalizeText(explicit.signalType ?? explicit.signal_type) || signalTypes.join('+') || 'site_capacity_pressure'

  return {
    seedType: 'site_capacity_pressure',
    signalType,
    predictedExtraDays,
    actualDelayDays,
    multiplier,
    confidenceDelta,
    pressureScore,
    resourceOperationType,
    durationImpactMode,
    sample,
  }
}

function readBuildingPatternFact(sample: AlgorithmSeedDiscoverySample): BuildingPatternFact | null {
  const metadata = readRecord(sample.metadata)
  const planLearning = readRecord(metadata.plan_learning_observation ?? metadata.planLearningObservation)
  const editDistance = readRecord(
    planLearning.generated_plan_edit_distance
      ?? planLearning.generatedPlanEditDistance
      ?? metadata.generated_plan_edit_distance
      ?? metadata.generatedPlanEditDistance,
  )
  const userDateAdjustment = readRecord(
    planLearning.user_date_adjustment
      ?? planLearning.userDateAdjustment
      ?? metadata.user_date_adjustment
      ?? metadata.userDateAdjustment,
  )
  const explicit = readRecord(
    metadata.building_pattern_observation
      ?? metadata.buildingPatternObservation
      ?? metadata.building_pattern
      ?? metadata.buildingPattern,
  )
  const patternCode = normalizeText(
    explicit.pattern_code
      ?? explicit.patternCode
      ?? metadata.building_pattern_code
      ?? metadata.buildingPatternCode,
  )
  if (!patternCode) return null
  const rawConfidence = explicit.confidence_score
    ?? explicit.confidenceScore
    ?? metadata.building_pattern_confidence_score
    ?? metadata.buildingPatternConfidenceScore
  const normalizedConfidence = normalizeConfidence(rawConfidence ?? (
    normalizeText(explicit.confidence_level ?? explicit.confidenceLevel) === 'high'
      ? 0.85
      : normalizeText(explicit.confidence_level ?? explicit.confidenceLevel) === 'medium'
        ? 0.65
        : 0.45
  ))
  const confidence = confidenceLevel(normalizedConfidence)
  return {
    seedType: 'building_pattern',
    patternCode,
    matchScore: normalizeNumber(explicit.match_score ?? explicit.matchScore ?? metadata.building_pattern_match_score, 0),
    confidenceScore: normalizedConfidence,
    confidenceLevel: normalizeText(explicit.confidence_level ?? explicit.confidenceLevel) as 'high' | 'medium' | 'low' || confidence,
    matchedSignals: readArray(explicit.matched_signals ?? explicit.matchedSignals),
    missingSignals: readArray(explicit.missing_signals ?? explicit.missingSignals),
    actionPolicy: normalizeText(explicit.action_policy ?? explicit.actionPolicy) || null,
    rhythmStrategyCodes: readArray(explicit.rhythm_strategy_codes ?? explicit.rhythmStrategyCodes),
    expansionStrategy: normalizeText(explicit.expansion_strategy ?? explicit.expansionStrategy) || null,
    rhythmUnit: normalizeText(explicit.rhythm_unit ?? explicit.rhythmUnit) || null,
    primaryWorkfaceType: normalizeText(explicit.primary_workface_type ?? explicit.primaryWorkfaceType) || null,
    phaseWindow: normalizeText(explicit.phase_window ?? explicit.phaseWindow) || null,
    projectTypeCode: normalizeText(
      explicit.project_type_code
        ?? explicit.projectTypeCode
        ?? metadata.project_type_code
        ?? metadata.projectTypeCode,
    ).toLowerCase() || null,
    structureTypeCode: normalizeText(
      explicit.structure_type_code
        ?? explicit.structureTypeCode
        ?? metadata.structure_type_code
        ?? metadata.structureTypeCode,
    ).toLowerCase() || null,
    methodVariantCodes: readArray(
      explicit.method_variant_codes
        ?? explicit.methodVariantCodes
        ?? metadata.method_variant_codes
        ?? metadata.methodVariantCodes,
    ).map((item) => item.toLowerCase()),
    elementVariantCodes: readArray(
      explicit.element_variant_codes
        ?? explicit.elementVariantCodes
        ?? metadata.element_variant_codes
        ?? metadata.elementVariantCodes,
    ).map((item) => item.toLowerCase()),
    inferredSystemKeys: readArray(
      explicit.inferred_system_keys
        ?? explicit.inferredSystemKeys
        ?? explicit.inferred_system_key
        ?? explicit.inferredSystemKey,
    ),
    inferredWorkfaceKeys: readArray(
      explicit.inferred_workface_keys
        ?? explicit.inferredWorkfaceKeys
        ?? explicit.inferred_workface_key
        ?? explicit.inferredWorkfaceKey,
    ),
    generatedPlanEditDistanceAvg: normalizeNumber(
      editDistance.changed_field_count
        ?? editDistance.changedFieldCount
        ?? editDistance.edit_distance
        ?? editDistance.editDistance,
      NaN,
    ),
    userDateAdjustmentAvgDays: normalizeNumber(
      userDateAdjustment.adjustment_days
        ?? userDateAdjustment.adjustmentDays
        ?? userDateAdjustment.date_delta_days
        ?? userDateAdjustment.dateDeltaDays,
      NaN,
    ),
    sample,
  }
}

type TitleWeakCandidateFact = {
  seedType: 'title_weak_recognition'
  subtype: 'standard_work_hint'
  aliasText: string
  standardWorkCode: string
  standardWorkName: string | null
  mappingSource: string | null
  mappingStatus: string | null
  matchScore: number | null
  sample: AlgorithmSeedDiscoverySample
}

type TitleWeakUnmatchedFact = {
  aliasText: string
  reason: string | null
  weakStandardWorkCodes: string[]
  sample: AlgorithmSeedDiscoverySample
}

type TitleWeakFalsePositiveFact = {
  aliasText: string
  predictedStandardWorkCode: string
  correctedStandardWorkCode: string
  previousRuleId: string | null
  sample: AlgorithmSeedDiscoverySample
}

type StandardInternalFlowFact = {
  predecessorStableCode: string
  successorStableCode: string
  predecessorName: string
  successorName: string
  relationKind: string
  curationStatus: string
  curationMethod: string
  scheduleMode: string
  createsDependency: boolean
  reviewNeeded: boolean
  evidenceCodes: string[]
  evidenceRefs: Record<string, unknown>[]
  appliedConditionalEffectIds: string[]
  generalizationHint: Record<string, unknown> | null
  predecessorCompletedBeforeSuccessorStart: boolean | null
  predecessorStartedBeforeSuccessorStart: boolean | null
  sourceCompleteness: 'paired_actual_dates' | 'successor_metadata_only'
  predecessorSampleId: string | null
  sample: AlgorithmSeedDiscoverySample
}

type CrossItemWorkflowFact = {
  predecessorCodePrefixes: string[]
  successorCodePrefixes: string[]
  predecessorCategoryTypes: string[]
  successorCategoryTypes: string[]
  dependencyType: 'FS' | 'SS' | 'FF' | 'SF'
  scopeRule: string
  strength: 'hard' | 'recommended' | 'candidate'
  sourceStandard: string
  sourceClauseRef: string
  evidenceSourceKeys: string[]
  predecessorCompletedBeforeSuccessorStart: boolean | null
  predecessorStartedBeforeSuccessorStart: boolean | null
  predecessorSampleId: string | null
  sample: AlgorithmSeedDiscoverySample
}

function readTitleWeakAliasText(sample: AlgorithmSeedDiscoverySample) {
  const metadata = readRecord(sample.metadata)
  return normalizeText(
    metadata.title_weak_alias
      ?? metadata.raw_task_title
      ?? metadata.task_title
      ?? metadata.source_task_name
      ?? metadata.original_title
      ?? metadata.row_title,
  )
}

function normalizeAliasSignature(value: unknown) {
  return normalizeLower(value)
    .replace(/\s+/g, '')
    .slice(0, 80)
}

function readTitleWeakFact(sample: AlgorithmSeedDiscoverySample): TitleWeakCandidateFact | null {
  const aliasText = readTitleWeakAliasText(sample)
  const standardWorkCode = normalizeText(sample.standard_work_code)
  if (!aliasText || !standardWorkCode) return null
  const metadata = readRecord(sample.metadata)
  const rawMatchScore = normalizeText(metadata.title_standard_mapping_match_score)
  return {
    seedType: 'title_weak_recognition',
    subtype: 'standard_work_hint',
    aliasText,
    standardWorkCode,
    standardWorkName: normalizeText(sample.standard_work_name) || null,
    mappingSource: normalizeText(metadata.title_standard_mapping_source) || null,
    mappingStatus: normalizeText(metadata.title_standard_mapping_status) || null,
    matchScore: rawMatchScore && Number.isFinite(Number(rawMatchScore))
      ? Number(rawMatchScore)
      : null,
    sample,
  }
}

function readTitleWeakUnmatchedFact(sample: AlgorithmSeedDiscoverySample): TitleWeakUnmatchedFact | null {
  const metadata = readRecord(sample.metadata)
  const source = normalizeLower(metadata.title_standard_mapping_source)
  const status = normalizeLower(metadata.title_standard_mapping_status)
  if (source !== 'algorithm_seed_unmatched' && status !== 'unmatched') return null
  const aliasText = readTitleWeakAliasText(sample)
  if (!aliasText) return null
  return {
    aliasText,
    reason: normalizeText(metadata.title_standard_mapping_reason) || null,
    weakStandardWorkCodes: readArray(metadata.title_standard_mapping_weak_codes),
    sample,
  }
}

function readTitleWeakFalsePositiveFact(sample: AlgorithmSeedDiscoverySample): TitleWeakFalsePositiveFact | null {
  const metadata = readRecord(sample.metadata)
  if (normalizeLower(metadata.title_standard_mapping_feedback_type) !== 'false_positive') return null
  const aliasText = readTitleWeakAliasText(sample)
  const predictedStandardWorkCode = normalizeText(metadata.title_standard_mapping_predicted_code)
  const correctedStandardWorkCode = normalizeText(metadata.title_standard_mapping_corrected_code ?? sample.standard_work_code)
  if (!aliasText || !predictedStandardWorkCode || !correctedStandardWorkCode || predictedStandardWorkCode === correctedStandardWorkCode) return null
  return {
    aliasText,
    predictedStandardWorkCode,
    correctedStandardWorkCode,
    previousRuleId: normalizeText(metadata.title_standard_mapping_previous_rule_id) || null,
    sample,
  }
}

function toTime(value: unknown) {
  const text = normalizeText(value)
  if (!text) return null
  const time = new Date(text).getTime()
  return Number.isFinite(time) ? time : null
}

function readStandardInternalFlowRecord(sample: AlgorithmSeedDiscoverySample) {
  const metadata = readRecord(sample.metadata)
  return readRecord(
    metadata.standard_internal_flow
      ?? metadata.standardInternalFlow
      ?? metadata.internal_flow
      ?? metadata.internalFlow,
  )
}

function readCrossItemWorkflowRecord(sample: AlgorithmSeedDiscoverySample) {
  const metadata = readRecord(sample.metadata)
  return readRecord(
    metadata.cross_item_workflow
      ?? metadata.crossItemWorkflow
      ?? metadata.cross_package_workflow
      ?? metadata.crossPackageWorkflow,
  )
}

function readSampleWorkCodes(sample: AlgorithmSeedDiscoverySample) {
  return Array.from(new Set([
    normalizeText(sample.standard_work_code),
    normalizeText(sample.template_node_id),
  ].filter(Boolean)))
}

function sampleKey(projectId: string | null, code: string) {
  return `${projectId ?? 'no_project'}::${code}`
}

function buildSampleLookup(samples: AlgorithmSeedDiscoverySample[]) {
  const lookup = new Map<string, AlgorithmSeedDiscoverySample[]>()
  for (const sample of samples) {
    const projectId = readProjectId(sample)
    for (const code of readSampleWorkCodes(sample)) {
      const key = sampleKey(projectId, code)
      lookup.set(key, [...(lookup.get(key) ?? []), sample])
    }
  }
  return lookup
}

function findPairedPredecessorSample(
  sample: AlgorithmSeedDiscoverySample,
  predecessorStableCode: string,
  lookup: Map<string, AlgorithmSeedDiscoverySample[]>,
) {
  const projectId = readProjectId(sample)
  const candidates = lookup.get(sampleKey(projectId, predecessorStableCode)) ?? []
  if (candidates.length === 0) return null
  const successorStart = toTime(sample.started_at)
  if (successorStart == null) return candidates[0]
  const completedBeforeStart = candidates
    .filter((candidate) => {
      const completedAt = toTime(candidate.completed_at)
      return completedAt != null && completedAt <= successorStart
    })
    .sort((left, right) => (toTime(right.completed_at) ?? 0) - (toTime(left.completed_at) ?? 0))
  if (completedBeforeStart.length > 0) return completedBeforeStart[0]
  return candidates
    .slice()
    .sort((left, right) => {
      const leftCompleted = toTime(left.completed_at) ?? Number.NEGATIVE_INFINITY
      const rightCompleted = toTime(right.completed_at) ?? Number.NEGATIVE_INFINITY
      const leftDistance = Math.abs(successorStart - leftCompleted)
      const rightDistance = Math.abs(successorStart - rightCompleted)
      return leftDistance - rightDistance
    })[0]
}

function readStandardInternalFlowFact(
  sample: AlgorithmSeedDiscoverySample,
  lookup: Map<string, AlgorithmSeedDiscoverySample[]>,
): StandardInternalFlowFact | null {
  const record = readStandardInternalFlowRecord(sample)
  if (!Object.keys(record).length) return null
  const predecessorStableCode = normalizeText(record.predecessor_stable_code ?? record.predecessorStableCode)
  const successorStableCode = normalizeText(record.successor_stable_code ?? record.successorStableCode ?? sample.standard_work_code ?? sample.template_node_id)
  const predecessorName = normalizeText(record.predecessor_name ?? record.predecessorName)
  const successorName = normalizeText(record.successor_name ?? record.successorName ?? sample.standard_work_name)
  if (!predecessorStableCode || !successorStableCode || !predecessorName || !successorName) return null

  const predecessorSample = findPairedPredecessorSample(sample, predecessorStableCode, lookup)
  const predecessorCompleted = toTime(predecessorSample?.completed_at)
  const predecessorStarted = toTime(predecessorSample?.started_at)
  const successorStart = toTime(sample.started_at)
  const hasPairedDates = predecessorCompleted != null && successorStart != null
  const generalizationHint = readRecord(record.generalization_hint ?? record.generalizationHint)

  return {
    predecessorStableCode,
    successorStableCode,
    predecessorName,
    successorName,
    relationKind: normalizeText(record.relation_kind ?? record.relationKind) || 'soft_sequence',
    curationStatus: normalizeText(record.curation_status ?? record.curationStatus) || 'unknown',
    curationMethod: normalizeText(record.curation_method ?? record.curationMethod) || 'unknown',
    scheduleMode: normalizeText(record.schedule_mode ?? record.scheduleMode) || 'sequential',
    createsDependency: record.creates_dependency === true || record.createsDependency === true,
    reviewNeeded: record.review_needed === true || record.reviewNeeded === true,
    evidenceCodes: readArray(record.evidence_codes ?? record.evidenceCodes),
    evidenceRefs: readRecordArray(record.evidence_refs ?? record.evidenceRefs),
    appliedConditionalEffectIds: readArray(record.applied_conditional_effect_ids ?? record.appliedConditionalEffectIds),
    generalizationHint: Object.keys(generalizationHint).length > 0 ? generalizationHint : null,
    predecessorCompletedBeforeSuccessorStart: hasPairedDates ? predecessorCompleted <= successorStart : null,
    predecessorStartedBeforeSuccessorStart: predecessorStarted != null && successorStart != null
      ? predecessorStarted <= successorStart
      : null,
    sourceCompleteness: hasPairedDates ? 'paired_actual_dates' : 'successor_metadata_only',
    predecessorSampleId: normalizeText(predecessorSample?.id) || null,
    sample,
  }
}

function normalizeDependencyType(value: unknown): 'FS' | 'SS' | 'FF' | 'SF' {
  const text = normalizeText(value).toUpperCase()
  return ['FS', 'SS', 'FF', 'SF'].includes(text) ? text as 'FS' | 'SS' | 'FF' | 'SF' : 'FS'
}

function normalizeWorkflowStrength(value: unknown): 'hard' | 'recommended' | 'candidate' {
  const text = normalizeLower(value)
  if (text === 'hard') return 'hard'
  if (text === 'candidate') return 'candidate'
  return 'recommended'
}

function readCrossItemWorkflowFact(
  sample: AlgorithmSeedDiscoverySample,
  lookup: Map<string, AlgorithmSeedDiscoverySample[]>,
): CrossItemWorkflowFact | null {
  const record = readCrossItemWorkflowRecord(sample)
  if (!Object.keys(record).length) return null
  const predecessorCodePrefixes = readArray(record.predecessor_code_prefixes ?? record.predecessorCodePrefixes ?? record.predecessor_code_prefix ?? record.predecessorCodePrefix)
  const successorCodePrefixes = readArray(record.successor_code_prefixes ?? record.successorCodePrefixes ?? record.successor_code_prefix ?? record.successorCodePrefix)
  if (predecessorCodePrefixes.length === 0 || successorCodePrefixes.length === 0) return null

  const predecessorSample = findPairedPredecessorSample(sample, predecessorCodePrefixes[0], lookup)
  const predecessorCompleted = toTime(predecessorSample?.completed_at)
  const predecessorStarted = toTime(predecessorSample?.started_at)
  const successorStart = toTime(sample.started_at)
  const hasPairedDates = predecessorCompleted != null && successorStart != null

  return {
    predecessorCodePrefixes,
    successorCodePrefixes,
    predecessorCategoryTypes: readArray(record.predecessor_category_types ?? record.predecessorCategoryTypes),
    successorCategoryTypes: readArray(record.successor_category_types ?? record.successorCategoryTypes),
    dependencyType: normalizeDependencyType(record.dependency_type ?? record.dependencyType),
    scopeRule: normalizeText(record.scope_rule ?? record.scopeRule) || 'same_project',
    strength: normalizeWorkflowStrength(record.strength),
    sourceStandard: normalizeText(record.source_standard ?? record.sourceStandard) || 'enterprise_method',
    sourceClauseRef: normalizeText(record.source_clause_ref ?? record.sourceClauseRef) || 'duration_experience_samples.cross_item_workflow',
    evidenceSourceKeys: readArray(record.evidence_source_keys ?? record.evidenceSourceKeys),
    predecessorCompletedBeforeSuccessorStart: hasPairedDates ? predecessorCompleted <= successorStart : null,
    predecessorStartedBeforeSuccessorStart: predecessorStarted != null && successorStart != null
      ? predecessorStarted <= successorStart
      : null,
    predecessorSampleId: normalizeText(predecessorSample?.id) || null,
    sample,
  }
}

function extractCandidateFacts(sample: AlgorithmSeedDiscoverySample): CandidateFact[] {
  const standardWorkCode = normalizeText(sample.standard_work_code)
  if (!standardWorkCode) return []

  const facts: CandidateFact[] = []
  const actualDuration = normalizePositiveDays(sample.actual_duration)
  const applicableGranularity = readApplicableGranularity(sample)
  if (
    actualDuration
    && applicableGranularity === 'process'
    && isDurationBearingContributionMode(readSampleDurationContributionMode(sample))
  ) {
    facts.push({ seedType: 'standard_work_duration', subtype: 'duration', days: actualDuration, sample })
  }

  const processConstraint = readProcessConstraintFact(sample)
  if (processConstraint) {
    facts.push({ seedType: 'process_constraint', ...processConstraint, sample })
  }

  return facts
}

function readSampleDurationContributionMode(sample: AlgorithmSeedDiscoverySample) {
  const metadata = readRecord(sample.metadata)
  return normalizeDurationContributionMode(
    metadata.durationContributionMode
      ?? metadata.duration_contribution_mode
      ?? metadata.durationMode
      ?? metadata.duration_mode,
  ) ?? inferDurationContributionMode({
    name: [
      sample.standard_work_name,
      sample.standard_work_code,
      metadata.planItemKind,
      metadata.plan_item_kind,
    ].map(normalizeText).filter(Boolean).join(' '),
    metadata,
    planItemKind: metadata.planItemKind ?? metadata.plan_item_kind,
    relationRole: metadata.relationRole ?? metadata.relation_role,
  })
}

function buildCandidateFromFacts(
  scope: AlgorithmSeedDiscoveryScope,
  facts: CandidateFact[],
  options: Required<Pick<AlgorithmSeedDiscoveryOptions, 'minProjectSamples' | 'minCompanySamples'>>,
): BuiltAlgorithmSeedDiscoveryCandidate | null {
  if (facts.length === 0) return null
  const first = facts[0]
  const firstSample = first.sample
  const standardWorkCode = normalizeText(firstSample.standard_work_code)
  if (!standardWorkCode) return null

  const days = facts.map((fact) => fact.days).sort((left, right) => left - right)
  const minSamples = scope === 'project' ? options.minProjectSamples : options.minCompanySamples
  if (days.length < minSamples) return null

  const projectIds = Array.from(new Set(facts.map((fact) => readProjectId(fact.sample)).filter(Boolean)))
  const companyIds = Array.from(new Set(facts.map((fact) => readCompanyId(fact.sample)).filter(Boolean)))
  if (scope === 'company' && projectIds.length < 3) return null

  const mean = days.reduce((sum, value) => sum + value, 0) / days.length
  const p20 = percentile(days, 0.2)
  const p50 = percentile(days, 0.5)
  const p80 = percentile(days, 0.8)
  const cv = coefficientOfVariation(days)
  const precisionGovernance = first.seedType === 'standard_work_duration'
    ? buildStandardDurationPrecisionGovernance({ p20, p50, p80 })
    : null
  const sampleConfidence = facts.reduce((sum, fact) => sum + normalizeConfidence(fact.sample.confidence_score), 0) / facts.length
  const contextKey = readBenchmarkContextKey(firstSample)
  const stableCode = buildStableCode(first.seedType, standardWorkCode, first.subtype, contextKey)
  const evidenceSourceKeys = [`duration_experience_samples:${stableCode}`]
  const confidence = calculateConfidenceScore({
    scope,
    sampleCount: days.length,
    cv,
    averageSampleConfidence: sampleConfidence,
    hasEvidence: true,
    minProjectSamples: options.minProjectSamples,
    minCompanySamples: options.minCompanySamples,
  })
  const maturityProfile = buildSampleMaturityProfile({
    seedType: first.seedType,
    scope,
    sampleCount: days.length,
    cv,
    confidenceScore: confidence,
    crossProjects: projectIds.length,
    crossCompanies: companyIds.length,
  })
  const projectTypeCodes = uniqueFromFacts(facts, readSampleProjectTypeCode)
  const structureTypeCodes = uniqueFromFacts(facts, readSampleStructureTypeCode)
  const methodCodes = uniqueArrayFromFacts(facts, readSampleMethodVariantCodes)
  const elementVariantCodes = uniqueArrayFromFacts(facts, readSampleElementVariantCodes)
  const responsibilityRole = dominantValue(facts.map((fact) => readSampleResponsibilityRole(fact.sample)).filter(Boolean))
    || 'general_contractor'
  const nowDate = new Date().toISOString().slice(0, 10)
  const commonPayload = {
    stableCode,
    seedRuleId: stableCode,
    ruleVersion: 1,
    isActive: true,
    standardWorkCodes: [standardWorkCode],
    typicalResponsibilityRole: responsibilityRole,
    projectTypeCodes,
    structureTypeCodes,
    applicableMethodCodes: methodCodes,
    elementVariantCodes,
    defaultDaysByMethod: methodCodes.length > 0
      ? Object.fromEntries(methodCodes.map((methodCode) => [methodCode, p50]))
      : {},
    applicableGranularity: readApplicableGranularity(firstSample),
    defaultDaysP20: p20,
    defaultDaysP50: p50,
    defaultDaysP80: p80,
    confidence,
    evidenceSourceKeys,
    webVerified: true,
    reviewNeeded: false,
    sourceStandard: 'enterprise_practice',
    sourceVersion: 'v1.4.7.5-auto-discovery',
    sourceClauseRef: first.seedType === 'standard_work_duration'
      ? 'duration_experience_samples.actual_duration'
      : 'duration_experience_samples.process_constraint_observation',
    evidenceQuality: {
      source_type: 'enterprise_practice',
      source_doc: 'duration_experience_samples',
      source_url: null,
      evidence_source_keys: evidenceSourceKeys,
      last_review_date: nowDate,
      applicable_region_scope: scope,
    },
  }

  const metadata = readRecord(firstSample.metadata)
  let candidatePayload: Record<string, unknown>
  if (first.seedType === 'standard_work_duration') {
    candidatePayload = normalizeAlgorithmSeedRecordPayload('standard_work_duration', {
      ...commonPayload,
      keywords: Array.from(new Set([
        normalizeText(firstSample.standard_work_name),
        standardWorkCode,
      ].filter(Boolean))),
      defaultDays: p50,
      defaultDaysP20: p20,
      defaultDaysP50: p50,
      defaultDaysP80: p80,
      durationContributionMode: 'duration_bearing',
      baseDaysEligible: true,
      fixedDays: normalizeNumber(metadata.fixed_days ?? metadata.fixedDays, 0),
      variableDays: Math.max(0, p50 - normalizeNumber(metadata.fixed_days ?? metadata.fixedDays, 0)),
      scaleBasis: normalizeText(metadata.scale_basis ?? metadata.scaleBasis) || 'workface',
      benchmarkBasis: `Learned from ${days.length} completed task duration samples.`,
      sampleMaturity: maturityProfile.sampleMaturity,
      recommendedGovernanceThresholds: maturityProfile.recommendedGovernanceThresholds,
      thresholdCalibrationPolicy: maturityProfile.thresholdCalibrationPolicy,
      precisionGovernance,
    })
  } else {
    const subtype = normalizeText(first.subtype)
    const observation = readRecord(metadata.process_constraint_observation ?? metadata.processConstraintObservation)
    const observedApplicationMode = normalizeText(
      observation.applicationMode
      ?? observation.application_mode
      ?? metadata.observed_application_mode
      ?? metadata.application_mode,
    )
    const isOverlapCandidate = observedApplicationMode === 'edge_overlap'
      || subtype.toLowerCase().includes('overlap')
      || Number.isFinite(normalizeNumber(observation.partialOverlapRatio ?? metadata.observed_partial_overlap_ratio, NaN))
    const releaseQuantityEvidenceSource = normalizeText(
      observation.releaseQuantityEvidenceSource
      ?? observation.release_quantity_evidence_source
      ?? metadata.release_quantity_evidence_source,
    )
    const quantityEvidenceRequirement = normalizeText(
      observation.quantityEvidenceRequirement
      ?? observation.quantity_evidence_requirement
      ?? metadata.quantity_evidence_requirement,
    ) || (releaseQuantityEvidenceSource === 'task_planned_completed_quantity'
      ? 'real_quantity_required_for_auto_release'
      : isOverlapCandidate
        ? 'real_or_default_quantity_proxy_allowed'
        : 'not_applicable')
    const releaseEvidenceChecklist = readArray(
      observation.quantityReleaseEvidenceChecklist
      ?? observation.quantity_release_evidence_checklist
      ?? metadata.quantity_release_evidence_checklist,
    )
    candidatePayload = normalizeAlgorithmSeedRecordPayload('process_constraint', {
      ...commonPayload,
      constraintType: subtype,
      applicationMode: observedApplicationMode || (isOverlapCandidate ? 'edge_overlap' : 'edge_lag'),
      impactMode: isOverlapCandidate ? 'overlap_ratio' : 'duration_lookup',
      runtimeActionPolicy: isOverlapCandidate ? 'candidate_only' : 'confidence_only',
      timeSourcePolicy: 'project_fact_then_standard_work_duration',
      durationLookupPolicy: 'route_to_standard_work_duration_seed',
      durationLookupKeys: Array.from(new Set([stableCode, standardWorkCode].map(normalizeText).filter(Boolean))),
      carrierProcessHints: Array.from(new Set([normalizeText(firstSample.standard_work_name), standardWorkCode].filter(Boolean))),
      durationAuthorityPolicy: 'no_duration_values_in_process_constraint',
      blockingLevel: normalizeText(metadata.blocking_level) || 'soft',
      progressImpact: normalizeText(metadata.progress_impact) || 'warning',
      partialOverlapRatio: normalizeNumber(observation.partialOverlapRatio ?? observation.partial_overlap_ratio ?? metadata.partial_overlap_ratio, 0),
      startAfterPercent: normalizeNumber(observation.startAfterPercent ?? observation.start_after_percent ?? metadata.start_after_percent, 100),
      minReleaseQuantityPercent: normalizeNumber(
        observation.releaseQuantityPercent
        ?? observation.release_quantity_percent
        ?? metadata.release_quantity_percent,
        isOverlapCandidate ? 70 : 100,
      ),
      quantityEvidenceRequirement,
      quantityReleaseEvidenceChecklist: releaseEvidenceChecklist.length > 0
        ? releaseEvidenceChecklist
        : (quantityEvidenceRequirement === 'not_applicable'
          ? []
          : quantityEvidenceRequirement === 'real_quantity_required_for_auto_release'
          ? ['task_planned_completed_quantity', 'accepted_workface_or_scope', 'gate_acceptance_or_test_record']
          : ['standard_work_duration_default_quantity_proxy', 'accepted_workface_or_scope']),
      quantityProxyRiskLevel: normalizeText(observation.quantityProxyRiskLevel ?? observation.quantity_proxy_risk_level ?? metadata.quantity_proxy_risk_level)
        || (quantityEvidenceRequirement === 'not_applicable'
          ? 'not_applicable'
          : quantityEvidenceRequirement === 'real_quantity_required_for_auto_release'
            ? 'high'
            : 'medium'),
      matchStrategy: 'structured_code_first_then_keyword_fallback',
      requiredKeywordGroups: readNestedTextArray(observation.requiredKeywordGroups ?? observation.required_keyword_groups ?? metadata.required_keyword_groups),
      excludedKeywordTerms: readArray(observation.excludedKeywordTerms ?? observation.excluded_keyword_terms ?? metadata.excluded_keyword_terms),
      conditionalEffects: readRecordArray(observation.conditionalEffects ?? observation.conditional_effects ?? metadata.conditional_effects),
      standardCatalogCodePrefixes: readArray(observation.standardCatalogCodePrefixes ?? observation.standard_catalog_code_prefixes ?? metadata.standard_catalog_code_prefixes),
      templateNodeStableCodePrefixes: readArray(observation.templateNodeStableCodePrefixes ?? observation.template_node_stable_code_prefixes ?? metadata.template_node_stable_code_prefixes),
      backValidationPolicy: 'candidate_only_from_execution_history',
      runtimeGovernancePolicy: 'candidate_only_no_runtime_effect_until_curated_seed_promotion',
      dependencyWritePolicy: 'never_write_task_dependencies_from_back_validation',
      durationWritePolicy: 'never_write_day_values_to_process_constraint',
      businessReasonTemplate: normalizeText(observation.businessReasonTemplate ?? observation.business_reason_template)
        || '系统从真实执行记录中发现该工序边存在稳定穿插或门禁特征，需进入治理候选，不直接改动既有计划。',
      applicableScopeRule: normalizeText(metadata.applicable_scope_rule) || 'same_zone',
      timeNature: normalizeText(metadata.time_nature) || 'mixed',
      sampleMaturity: maturityProfile.sampleMaturity,
      recommendedGovernanceThresholds: maturityProfile.recommendedGovernanceThresholds,
      thresholdCalibrationPolicy: maturityProfile.thresholdCalibrationPolicy,
    })
  }

  return {
    seedType: first.seedType,
    stableCode,
    candidatePayload,
    candidateSource: scope === 'project' ? 'project_history' : 'company_history',
    projectId: scope === 'project' ? readProjectId(firstSample) : null,
    companyId: scope === 'company' ? readCompanyId(firstSample) : readCompanyId(firstSample),
    sampleCount: days.length,
    variance: cv,
    confidenceLevel: confidenceLevel(confidence),
    evidenceSummary: {
      source: first.seedType === 'standard_work_duration'
        ? 'duration_experience_samples.actual_duration'
        : 'duration_experience_samples.process_constraint_observation',
      sampleCount: days.length,
      sampleIds: facts.map((fact) => normalizeText(fact.sample.id)).filter(Boolean).slice(0, 50),
      taskIds: facts.map((fact) => normalizeText(fact.sample.task_id)).filter(Boolean).slice(0, 50),
      p20Days: p20,
      p50Days: p50,
      p80Days: p80,
      meanDays: Math.round(mean * 10) / 10,
      coefficientOfVariation: cv,
      confidenceScore: confidence,
      sampleMaturity: maturityProfile.sampleMaturity,
      maturityReasonCodes: maturityProfile.maturityReasonCodes,
      recommendedGovernanceThresholds: maturityProfile.recommendedGovernanceThresholds,
      thresholdCalibrationPolicy: maturityProfile.thresholdCalibrationPolicy,
      ...(precisionGovernance ? { precisionGovernance } : {}),
      crossProjects: projectIds.length,
      crossCompanies: companyIds.length,
      benchmarkContextKey: contextKey,
      calibrationContext: {
        projectTypeCodes,
        structureTypeCodes,
        methodVariantCodes: methodCodes,
        elementVariantCodes,
        typicalResponsibilityRole: responsibilityRole,
      },
      standardWorkCode,
      standardWorkName: normalizeText(firstSample.standard_work_name) || null,
      ...(first.seedType === 'process_constraint'
        ? {
          durationValuesIgnored: true,
          backValidationPolicy: 'candidate_only_from_execution_history',
          runtimeGovernancePolicy: 'candidate_only_no_runtime_effect_until_curated_seed_promotion',
          dependencyWritePolicy: 'never_write_task_dependencies_from_back_validation',
          durationWritePolicy: 'never_write_day_values_to_process_constraint',
          releaseQuantityEvidenceSources: Array.from(new Set(facts.map((fact) => {
            const metadata = readRecord(fact.sample.metadata)
            const observation = readRecord(metadata.process_constraint_observation ?? metadata.processConstraintObservation)
            return normalizeText(
              observation.releaseQuantityEvidenceSource
              ?? observation.release_quantity_evidence_source
              ?? metadata.release_quantity_evidence_source,
            )
          }).filter(Boolean))),
        }
        : {}),
    },
  }
}

function buildSeasonalProductivityCandidate(
  scope: AlgorithmSeedDiscoveryScope,
  facts: SeasonalProductivityFact[],
  options: Required<Pick<AlgorithmSeedDiscoveryOptions, 'minProjectSamples' | 'minCompanySamples'>>,
): BuiltAlgorithmSeedDiscoveryCandidate | null {
  if (facts.length === 0) return null
  const first = facts[0]
  const minSamples = scope === 'project' ? options.minProjectSamples : options.minCompanySamples
  if (facts.length < minSamples) return null

  const projectIds = Array.from(new Set(facts.map((fact) => readProjectId(fact.sample)).filter(Boolean)))
  const companyIds = Array.from(new Set(facts.map((fact) => readCompanyId(fact.sample)).filter(Boolean)))
  if (scope === 'company' && projectIds.length < 3) return null

  const values = facts.map((fact) => fact.productivity).sort((left, right) => left - right)
  const p20 = percentile(values, 0.2)
  const p50 = percentile(values, 0.5)
  const p80 = percentile(values, 0.8)
  const cv = coefficientOfVariation(values)
  const sampleConfidence = facts.reduce((sum, fact) => sum + normalizeConfidence(fact.sample.confidence_score), 0) / facts.length
  const confidence = calculateConfidenceScore({
    scope,
    sampleCount: facts.length,
    cv,
    averageSampleConfidence: sampleConfidence,
    hasEvidence: true,
    minProjectSamples: options.minProjectSamples,
    minCompanySamples: options.minCompanySamples,
  })
  const stableCode = buildStableCode('seasonal_productivity', first.regionCode, `month_${first.month}_${first.climateSignal}`, 'climate-seasonal-productivity')
  const evidenceSourceKeys = [`duration_experience_samples:${stableCode}`]
  const nowDate = new Date().toISOString().slice(0, 10)
  const candidatePayload = normalizeAlgorithmSeedRecordPayload('seasonal_productivity', {
    stableCode,
    seedRuleId: stableCode,
    ruleVersion: 1,
    isActive: true,
    regionCode: first.regionCode,
    month: first.month,
    productivity: p50,
    climateSignal: first.climateSignal,
    classificationBasis: first.thermalZone ? 'gb50176_thermal_zone' : 'construction_operational_extension',
    sourceStandard: 'enterprise_method',
    sourceVersion: 'v1.4.7.5-auto-discovery',
    sourceClauseRef: 'duration_experience_samples.climate_month_productivity',
    evidenceSourceKeys,
    evidenceQuality: {
      source_type: 'enterprise_practice',
      source_doc: 'duration_experience_samples',
      source_url: null,
      evidence_source_keys: evidenceSourceKeys,
      last_review_date: nowDate,
      applicable_region_scope: scope,
    },
    webVerified: true,
    reviewNeeded: false,
    confidence: confidenceLevel(confidence),
  })

  return {
    seedType: 'seasonal_productivity',
    stableCode,
    candidatePayload,
    candidateSource: scope === 'project' ? 'project_history' : 'company_history',
    projectId: scope === 'project' ? readProjectId(first.sample) : null,
    companyId: readCompanyId(first.sample),
    sampleCount: facts.length,
    variance: cv,
    confidenceLevel: confidenceLevel(confidence),
    evidenceSummary: {
      source: 'duration_experience_samples.climate_month_productivity',
      sampleCount: facts.length,
      sampleIds: facts.map((fact) => normalizeText(fact.sample.id)).filter(Boolean).slice(0, 50),
      taskIds: facts.map((fact) => normalizeText(fact.sample.task_id)).filter(Boolean).slice(0, 50),
      regionCode: first.regionCode,
      thermalZone: first.thermalZone,
      month: first.month,
      climateSignal: first.climateSignal,
      p20Productivity: p20,
      p50Productivity: p50,
      p80Productivity: p80,
      coefficientOfVariation: cv,
      confidenceScore: confidence,
      crossProjects: projectIds.length,
      crossCompanies: companyIds.length,
    },
  }
}

function buildProcessSeasonalSensitivityCandidate(
  scope: AlgorithmSeedDiscoveryScope,
  facts: ProcessSeasonalSensitivityFact[],
  options: Required<Pick<AlgorithmSeedDiscoveryOptions, 'minProjectSamples' | 'minCompanySamples'>>,
): BuiltAlgorithmSeedDiscoveryCandidate | null {
  if (facts.length === 0) return null
  const first = facts[0]
  const minSamples = scope === 'project' ? options.minProjectSamples : options.minCompanySamples
  if (facts.length < minSamples) return null

  const projectIds = Array.from(new Set(facts.map((fact) => readProjectId(fact.sample)).filter(Boolean)))
  const companyIds = Array.from(new Set(facts.map((fact) => readCompanyId(fact.sample)).filter(Boolean)))
  if (scope === 'company' && projectIds.length < 3) return null

  const values = facts.map((fact) => fact.productivity).sort((left, right) => left - right)
  const p20 = percentile(values, 0.2)
  const p50 = percentile(values, 0.5)
  const p80 = percentile(values, 0.8)
  const cv = coefficientOfVariation(values)
  const sampleConfidence = facts.reduce((sum, fact) => sum + normalizeConfidence(fact.sample.confidence_score), 0) / facts.length
  const confidence = calculateConfidenceScore({
    scope,
    sampleCount: facts.length,
    cv,
    averageSampleConfidence: sampleConfidence,
    hasEvidence: true,
    minProjectSamples: options.minProjectSamples,
    minCompanySamples: options.minCompanySamples,
  })
  const stableCode = buildStableCode('process_seasonal_sensitivity', first.standardWorkCode, first.climateSignal, 'process-seasonal-sensitivity')
  const evidenceSourceKeys = [`duration_experience_samples:${stableCode}`]
  const months = Array.from(new Set(facts.map((fact) => fact.month))).sort((left, right) => left - right)
  const nowDate = new Date().toISOString().slice(0, 10)
  const candidatePayload = normalizeAlgorithmSeedRecordPayload('process_seasonal_sensitivity', {
    stableCode,
    seedRuleId: stableCode,
    ruleVersion: 1,
    isActive: true,
    keywords: Array.from(new Set([first.standardWorkName, first.standardWorkCode].filter(Boolean))),
    standardWorkCodes: [first.standardWorkCode],
    applicableMethodCodes: Array.from(new Set(facts.flatMap((fact) => readArray(readRecord(fact.sample.metadata).method_variant_codes)))),
    applicableGranularity: readApplicableGranularity(first.sample),
    sensitiveMonths: months,
    requiredClimateSignals: [first.climateSignal],
    impactBand: first.climateSignal === 'rainy_season' ? 'rain_partial_work' : 'winter_wet_trade',
    productivityMultiplier: p50,
    sensitivityReason: first.climateSignal,
    sourceStandard: 'enterprise_method',
    sourceVersion: 'v1.4.7.5-auto-discovery',
    sourceClauseRef: 'duration_experience_samples.process_climate_sensitivity',
    evidenceSourceKeys,
    triggerPolicy: 'requires project_climate_profiles season window or seasonal_productivity climate signal; weather facts override static seed',
    calibrationPolicy: 'candidate_only_from duration_experience_samples grouped by standard_work_code + climate_signal + month; no silent overwrite',
    evidenceQuality: {
      source_type: 'enterprise_practice',
      source_doc: 'duration_experience_samples',
      source_url: null,
      evidence_source_keys: evidenceSourceKeys,
      last_review_date: nowDate,
      applicable_region_scope: scope,
    },
    webVerified: true,
    reviewNeeded: false,
    confidence: confidenceLevel(confidence),
  })

  return {
    seedType: 'process_seasonal_sensitivity',
    stableCode,
    candidatePayload,
    candidateSource: scope === 'project' ? 'project_history' : 'company_history',
    projectId: scope === 'project' ? readProjectId(first.sample) : null,
    companyId: readCompanyId(first.sample),
    sampleCount: facts.length,
    variance: cv,
    confidenceLevel: confidenceLevel(confidence),
    evidenceSummary: {
      source: 'duration_experience_samples.process_climate_sensitivity',
      sampleCount: facts.length,
      sampleIds: facts.map((fact) => normalizeText(fact.sample.id)).filter(Boolean).slice(0, 50),
      taskIds: facts.map((fact) => normalizeText(fact.sample.task_id)).filter(Boolean).slice(0, 50),
      standardWorkCode: first.standardWorkCode,
      standardWorkName: first.standardWorkName,
      climateSignal: first.climateSignal,
      months,
      p20Productivity: p20,
      p50Productivity: p50,
      p80Productivity: p80,
      coefficientOfVariation: cv,
      confidenceScore: confidence,
      crossProjects: projectIds.length,
      crossCompanies: companyIds.length,
    },
  }
}

function buildSiteCapacityPressureCandidate(
  scope: AlgorithmSeedDiscoveryScope,
  facts: SiteCapacityPressureFact[],
  options: Required<Pick<AlgorithmSeedDiscoveryOptions, 'minProjectSamples' | 'minCompanySamples'>>,
): BuiltAlgorithmSeedDiscoveryCandidate | null {
  if (facts.length === 0) return null
  const first = facts[0]
  const minSamples = scope === 'project' ? options.minProjectSamples : options.minCompanySamples
  if (facts.length < minSamples) return null

  const projectIds = Array.from(new Set(facts.map((fact) => readProjectId(fact.sample)).filter(Boolean)))
  const companyIds = Array.from(new Set(facts.map((fact) => readCompanyId(fact.sample)).filter(Boolean)))
  if (scope === 'company' && projectIds.length < 3) return null

  const actualDelays = facts.map((fact) => fact.actualDelayDays).sort((left, right) => left - right)
  const predictionErrors = facts.map((fact) => Math.abs(fact.actualDelayDays - fact.predictedExtraDays))
  const meanError = predictionErrors.reduce((sum, value) => sum + value, 0) / predictionErrors.length
  const meanActualDelay = actualDelays.reduce((sum, value) => sum + value, 0) / actualDelays.length
  const p50Delay = percentile(actualDelays, 0.5)
  const p80Delay = percentile(actualDelays, 0.8)
  const cv = coefficientOfVariation(actualDelays.filter((value) => value > 0))
  const sampleConfidence = facts.reduce((sum, fact) => sum + normalizeConfidence(fact.sample.confidence_score), 0) / facts.length
  const confidence = calculateConfidenceScore({
    scope,
    sampleCount: facts.length,
    cv,
    averageSampleConfidence: sampleConfidence,
    hasEvidence: true,
    minProjectSamples: options.minProjectSamples,
    minCompanySamples: options.minCompanySamples,
  })
  const maturityProfile = buildSampleMaturityProfile({
    seedType: 'site_capacity_pressure',
    scope,
    sampleCount: facts.length,
    cv,
    confidenceScore: confidence,
    crossProjects: projectIds.length,
    crossCompanies: companyIds.length,
  })
  const action = meanActualDelay >= meanError && p80Delay >= 3
    ? 'raise_pressure_impact'
    : meanActualDelay <= 1 && facts.some((fact) => fact.predictedExtraDays >= 2 || fact.multiplier > 1.1)
      ? 'lower_pressure_impact'
      : 'stabilize_pressure_impact'
  const hasDurationCandidateEvidence = facts.some((fact) => (
    fact.durationImpactMode === 'conditional_duration_candidate'
    || fact.actualDelayDays > 0
    || fact.predictedExtraDays > 0
    || fact.multiplier > 1.01
  ))
  const stableCode = buildStableCode('site_capacity_pressure', first.signalType, action, `${scope}:${first.signalType}`)
  const evidenceSourceKeys = [`duration_experience_samples:${stableCode}`, `task_duration_forecasts:${stableCode}`]
  const nowDate = new Date().toISOString().slice(0, 10)
  const candidatePayload = normalizeAlgorithmSeedRecordPayload('site_capacity_pressure', {
    stableCode,
    seedRuleId: stableCode,
    ruleVersion: 1,
    isActive: true,
    label: `Learned site capacity pressure policy for ${first.signalType}`,
    signalType: first.signalType,
    learnedAdjustment: action,
    weights: {
      sameResponsibleUnit: 1,
      sameBuilding: 1,
      sameResourceClass: 1,
      progressPressure: action === 'raise_pressure_impact' ? 6 : action === 'lower_pressure_impact' ? 4 : 5,
      resourceCondition: action === 'raise_pressure_impact' ? 2 : 1,
      resourceObstacle: action === 'raise_pressure_impact' ? 3 : action === 'lower_pressure_impact' ? 1 : 2,
      overdueMaterial: action === 'raise_pressure_impact' ? 2 : 1,
      severeObstacle: 2,
      longTermSignal: action === 'raise_pressure_impact' ? 3 : 2,
      veryLongTermBonus: 2,
    },
    thresholds: {
      longTermSignalDays: action === 'raise_pressure_impact' ? 5 : 7,
      veryLongTermSignalDays: action === 'raise_pressure_impact' ? 10 : 14,
    },
    caps: {
      multiplierMax: action === 'raise_pressure_impact' ? 1.4 : action === 'lower_pressure_impact' ? 1.25 : 1.35,
      maxExtraDays: action === 'raise_pressure_impact' ? Math.min(30, Math.max(21, p80Delay)) : 21,
      maxConfidencePenalty: action === 'raise_pressure_impact' ? 30 : 25,
    },
    effectPolicy: {
      coldStartPolicy: 'observation_only',
      actionPolicy: 'candidate_only',
      canAffectNewTaskReference: hasDurationCandidateEvidence,
      canAffectRemainingForecast: true,
      canExplainDeviation: true,
      canCreateRiskIssue: false,
    },
    evidenceSourceKeys,
    webVerified: true,
    reviewNeeded: false,
    sourceStandard: 'enterprise_execution_history',
    sourceVersion: 'v1.4.7.5-auto-discovery',
    sourceClauseRef: 'duration_experience_samples.site_capacity_pressure',
    evidenceQuality: {
      source_type: 'enterprise_practice',
      source_doc: 'duration_experience_samples + task_duration_forecasts',
      source_url: null,
      evidence_source_keys: evidenceSourceKeys,
      last_review_date: nowDate,
      applicable_region_scope: scope,
    },
    confidence: confidenceLevel(confidence),
    sampleMaturity: maturityProfile.sampleMaturity,
    recommendedGovernanceThresholds: maturityProfile.recommendedGovernanceThresholds,
    thresholdCalibrationPolicy: maturityProfile.thresholdCalibrationPolicy,
  })

  return {
    seedType: 'site_capacity_pressure',
    stableCode,
    candidatePayload,
    candidateSource: scope === 'project' ? 'project_history' : 'company_history',
    projectId: scope === 'project' ? readProjectId(first.sample) : null,
    companyId: readCompanyId(first.sample),
    sampleCount: facts.length,
    variance: cv,
    confidenceLevel: confidenceLevel(confidence),
    evidenceSummary: {
      source: 'duration_experience_samples.site_capacity_pressure',
      observationSource: 'factor_summary.resource_conflict',
      sampleCount: facts.length,
      sampleIds: facts.map((fact) => normalizeText(fact.sample.id)).filter(Boolean).slice(0, 50),
      taskIds: facts.map((fact) => normalizeText(fact.sample.task_id)).filter(Boolean).slice(0, 50),
      signalType: first.signalType,
      learnedAdjustment: action,
      resourceOperationTypes: Array.from(new Set(facts.map((fact) => fact.resourceOperationType).filter(Boolean))),
      durationImpactModes: Array.from(new Set(facts.map((fact) => fact.durationImpactMode).filter(Boolean))),
      hasDurationCandidateEvidence,
      p50ActualDelayDays: p50Delay,
      p80ActualDelayDays: p80Delay,
      meanActualDelayDays: Math.round(meanActualDelay * 10) / 10,
      meanPredictionErrorDays: Math.round(meanError * 10) / 10,
      coefficientOfVariation: cv,
      confidenceScore: confidence,
      sampleMaturity: maturityProfile.sampleMaturity,
      maturityReasonCodes: maturityProfile.maturityReasonCodes,
      recommendedGovernanceThresholds: maturityProfile.recommendedGovernanceThresholds,
      thresholdCalibrationPolicy: maturityProfile.thresholdCalibrationPolicy,
      crossProjects: projectIds.length,
      crossCompanies: companyIds.length,
      runtimeEffect: 'candidate_only_until_algorithm_seed_governance_publishes_policy',
    },
  }
}

function buildBuildingPatternCandidate(
  scope: AlgorithmSeedDiscoveryScope,
  facts: BuildingPatternFact[],
  options: Required<Pick<AlgorithmSeedDiscoveryOptions, 'minProjectSamples' | 'minCompanySamples'>>,
): BuiltAlgorithmSeedDiscoveryCandidate | null {
  if (facts.length === 0) return null
  const first = facts[0]
  const minSamples = scope === 'project' ? options.minProjectSamples : options.minCompanySamples
  if (facts.length < minSamples) return null

  const projectIds = Array.from(new Set(facts.map((fact) => readProjectId(fact.sample)).filter(Boolean)))
  const companyIds = Array.from(new Set(facts.map((fact) => readCompanyId(fact.sample)).filter(Boolean)))
  if (scope === 'company' && projectIds.length < 3) return null

  const sourceRecord = V1474_BUILDING_PATTERN_SEED.find((record) => record.patternCode === first.patternCode)
  if (!sourceRecord) return null
  const confidenceValues = facts.map((fact) => fact.confidenceScore).sort((left, right) => left - right)
  const cv = coefficientOfVariation(confidenceValues)
  const sampleConfidence = confidenceValues.reduce((sum, value) => sum + value, 0) / confidenceValues.length
  const confidence = calculateConfidenceScore({
    scope,
    sampleCount: facts.length,
    cv,
    averageSampleConfidence: sampleConfidence,
    hasEvidence: true,
    minProjectSamples: options.minProjectSamples,
    minCompanySamples: options.minCompanySamples,
  })
  const maturityProfile = buildSampleMaturityProfile({
    seedType: 'building_pattern',
    scope,
    sampleCount: facts.length,
    cv,
    confidenceScore: confidence,
    crossProjects: projectIds.length,
    crossCompanies: companyIds.length,
  })
  const projectTypeCodes = uniqueFromFacts(facts, readSampleProjectTypeCode)
  const structureTypeCodes = uniqueFromFacts(facts, readSampleStructureTypeCode)
  const methodCodes = uniqueArrayFromFacts(facts, readSampleMethodVariantCodes)
  const elementVariantCodes = uniqueArrayFromFacts(facts, readSampleElementVariantCodes)
  const standardWorkCodes = Array.from(new Set(facts.map((fact) => normalizeText(fact.sample.standard_work_code)).filter(Boolean)))
  const templateNodeStableCodes = Array.from(new Set(facts.map((fact) => normalizeText(fact.sample.template_node_id)).filter(Boolean)))
  const matchedSignals = Array.from(new Set(facts.flatMap((fact) => fact.matchedSignals))).sort()
  const missingSignals = Array.from(new Set(facts.flatMap((fact) => fact.missingSignals))).sort()
  const inferredSystemKeys = Array.from(new Set(facts.flatMap((fact) => fact.inferredSystemKeys))).sort()
  const inferredWorkfaceKeys = Array.from(new Set(facts.flatMap((fact) => fact.inferredWorkfaceKeys))).sort()
  const editDistanceValues = facts
    .map((fact) => fact.generatedPlanEditDistanceAvg)
    .filter((value): value is number => Number.isFinite(value))
  const userDateAdjustmentValues = facts
    .map((fact) => fact.userDateAdjustmentAvgDays)
    .filter((value): value is number => Number.isFinite(value))
  const meanGeneratedPlanEditDistance = editDistanceValues.length > 0
    ? Math.round((editDistanceValues.reduce((sum, value) => sum + value, 0) / editDistanceValues.length) * 10) / 10
    : null
  const meanUserDateAdjustmentDays = userDateAdjustmentValues.length > 0
    ? Math.round((userDateAdjustmentValues.reduce((sum, value) => sum + value, 0) / userDateAdjustmentValues.length) * 10) / 10
    : null
  const rhythmStrategyCodes = Array.from(new Set([
    ...facts.flatMap((fact) => fact.rhythmStrategyCodes),
    ...(sourceRecord.rhythmStrategyCodes ?? []),
  ].map(normalizeText).filter(Boolean)))
  const stableCode = `learned:building_pattern:${slugPart(first.patternCode)}:${shortHash([
    scope,
    first.patternCode,
    projectTypeCodes.join('+'),
    structureTypeCodes.join('+'),
    methodCodes.join('+'),
    elementVariantCodes.join('+'),
  ].join('|'))}`
  const evidenceSourceKeys = [`duration_experience_samples:${stableCode}`, ...(sourceRecord.evidenceSourceKeys ?? [])]
  const nowDate = new Date().toISOString().slice(0, 10)
  const candidatePayload = normalizeAlgorithmSeedRecordPayload('building_pattern', {
    ...sourceRecord,
    stableCode,
    patternCode: first.patternCode,
    patternName: `${sourceRecord.patternName} learned calibration`,
    rhythmHint: sourceRecord.rhythmHint,
    ruleVersion: 1,
    isActive: true,
    applicableStandardWorkCodes: standardWorkCodes.length > 0 ? standardWorkCodes : sourceRecord.applicableStandardWorkCodes,
    templateNodeStableCodePrefixes: templateNodeStableCodes.length > 0 ? templateNodeStableCodes : sourceRecord.templateNodeStableCodePrefixes,
    projectTypeCodes: projectTypeCodes.length > 0 ? projectTypeCodes : sourceRecord.projectTypeCodes,
    structureTypeCodes: structureTypeCodes.length > 0 ? structureTypeCodes : sourceRecord.structureTypeCodes,
    applicableMethodCodes: methodCodes.length > 0 ? methodCodes : sourceRecord.applicableMethodCodes,
    elementVariantCodes: elementVariantCodes.length > 0 ? elementVariantCodes : sourceRecord.elementVariantCodes,
    rhythmStrategyCodes,
    expansionStrategy: first.expansionStrategy ?? sourceRecord.expansionStrategy,
    rhythmUnit: first.rhythmUnit ?? sourceRecord.rhythmUnit,
    primaryWorkfaceType: first.primaryWorkfaceType ?? sourceRecord.primaryWorkfaceType,
    phaseWindow: first.phaseWindow ?? sourceRecord.phaseWindow,
    inferredSystemKeys,
    inferredWorkfaceKeys,
    generatedPlanEditDistanceAvg: meanGeneratedPlanEditDistance,
    userDateAdjustmentAvgDays: meanUserDateAdjustmentDays,
    confidence: confidenceLevel(confidence),
    evidenceSourceKeys,
    webVerified: true,
    reviewNeeded: false,
    sourceStandard: 'enterprise_method',
    sourceVersion: 'v1.4.7.4-building-pattern-auto-discovery',
    sourceClauseRef: 'duration_experience_samples.building_pattern_observation',
    calibrationPolicy: 'project_or_company_overlay_only_no_ts_seed_mutation',
    backendOnlyConfidencePolicy: true,
    sampleMaturity: maturityProfile.sampleMaturity,
    recommendedGovernanceThresholds: maturityProfile.recommendedGovernanceThresholds,
    thresholdCalibrationPolicy: maturityProfile.thresholdCalibrationPolicy,
    evidenceQuality: {
      source_type: 'enterprise_practice',
      source_doc: 'duration_experience_samples',
      source_url: null,
      evidence_source_keys: evidenceSourceKeys,
      last_review_date: nowDate,
      applicable_region_scope: scope,
    },
  })

  return {
    seedType: 'building_pattern',
    stableCode,
    candidatePayload,
    candidateSource: scope === 'project' ? 'project_history' : 'company_history',
    projectId: scope === 'project' ? readProjectId(first.sample) : null,
    companyId: readCompanyId(first.sample),
    sampleCount: facts.length,
    variance: cv,
    confidenceLevel: confidenceLevel(confidence),
    evidenceSummary: {
      source: 'duration_experience_samples.building_pattern_observation',
      patternCode: first.patternCode,
      sampleCount: facts.length,
      sampleIds: facts.map((fact) => normalizeText(fact.sample.id)).filter(Boolean).slice(0, 50),
      taskIds: facts.map((fact) => normalizeText(fact.sample.task_id)).filter(Boolean).slice(0, 50),
      p50ConfidenceScore: percentile(confidenceValues, 0.5),
      p80ConfidenceScore: percentile(confidenceValues, 0.8),
      meanConfidenceScore: Math.round(sampleConfidence * 1000) / 1000,
      coefficientOfVariation: cv,
      confidenceScore: confidence,
      sampleMaturity: maturityProfile.sampleMaturity,
      maturityReasonCodes: maturityProfile.maturityReasonCodes,
      recommendedGovernanceThresholds: maturityProfile.recommendedGovernanceThresholds,
      thresholdCalibrationPolicy: maturityProfile.thresholdCalibrationPolicy,
      matchedSignals,
      missingSignals,
      rhythmStrategyCodes,
      crossProjects: projectIds.length,
      crossCompanies: companyIds.length,
      calibrationContext: {
        projectTypeCodes,
        structureTypeCodes,
        methodVariantCodes: methodCodes,
        elementVariantCodes,
        standardWorkCodes,
        templateNodeStableCodes,
        inferredSystemKeys,
        inferredWorkfaceKeys,
      },
      generatedPlanEditDistanceAvg: meanGeneratedPlanEditDistance,
      userDateAdjustmentAvgDays: meanUserDateAdjustmentDays,
      runtimeEffect: 'backend_algorithm_overlay_after_auto_governance',
      frontendDisplay: false,
    },
  }
}

function uniqueFromBuildingPatternFacts(facts: BuildingPatternFact[], reader: (fact: BuildingPatternFact) => string | null | undefined) {
  return Array.from(new Set(facts.map((fact) => normalizeText(reader(fact)).toLowerCase()).filter(Boolean)))
}

function uniqueArrayFromBuildingPatternFacts(facts: BuildingPatternFact[], reader: (fact: BuildingPatternFact) => string[]) {
  return Array.from(new Set(facts.flatMap((fact) => reader(fact)).map((item) => normalizeText(item).toLowerCase()).filter(Boolean)))
}

function buildTitleWeakCandidateFromFacts(
  scope: AlgorithmSeedDiscoveryScope,
  facts: TitleWeakCandidateFact[],
  options: Required<Pick<AlgorithmSeedDiscoveryOptions, 'minProjectSamples' | 'minCompanySamples'>>,
): BuiltAlgorithmSeedDiscoveryCandidate | null {
  if (facts.length === 0) return null
  const first = facts[0]
  const minSamples = scope === 'project' ? options.minProjectSamples : options.minCompanySamples
  if (facts.length < minSamples) return null

  const projectIds = Array.from(new Set(facts.map((fact) => readProjectId(fact.sample)).filter(Boolean)))
  const companyIds = Array.from(new Set(facts.map((fact) => readCompanyId(fact.sample)).filter(Boolean)))
  if (scope === 'company' && projectIds.length < 3) return null

  const aliasSignature = normalizeAliasSignature(first.aliasText)
  const standardWorkCode = first.standardWorkCode
  const contextKey = `${aliasSignature}|${standardWorkCode}|${scope}`
  const stableCode = buildStableCode('title_weak_recognition', standardWorkCode, aliasSignature || 'alias', contextKey)
  const evidenceSourceKeys = [`title_weak_samples:${stableCode}`, `keyword_match_observation:${stableCode}`]
  const sampleConfidence = facts.reduce((sum, fact) => {
    const matchScore = fact.matchScore != null ? Math.round(fact.matchScore * 100) : null
    return sum + (matchScore ?? normalizeConfidence(fact.sample.confidence_score))
  }, 0) / facts.length
  const confidence = calculateConfidenceScore({
    scope,
    sampleCount: facts.length,
    cv: 0,
    averageSampleConfidence: sampleConfidence,
    hasEvidence: true,
    minProjectSamples: options.minProjectSamples,
    minCompanySamples: options.minCompanySamples,
  })
  const nowDate = new Date().toISOString().slice(0, 10)
  const aliases = Array.from(new Set(facts.map((fact) => normalizeText(fact.aliasText)).filter(Boolean))).slice(0, 20)
  const keywords = Array.from(new Set(aliases.flatMap((alias) => [
    alias,
    ...alias.split(/[,\s/|]+/).map(normalizeText).filter((item) => item.length >= 2),
  ]))).slice(0, 30)
  const candidatePayload = normalizeAlgorithmSeedRecordPayload('title_weak_recognition', {
    stableCode,
    ruleId: stableCode,
    signalType: 'standard_work_hint',
    code: `learned_alias_${shortHash(`${aliasSignature}:${standardWorkCode}`)}`,
    standardWorkCodes: [standardWorkCode],
    label: first.standardWorkName ?? standardWorkCode,
    keywords,
    aliases,
    confidence,
    source: 'row_name_suggestion',
    templateSeedReferences: ['standard_work_duration_seed', 'duration_experience_samples'],
    effectPolicy: {
      canInferStandardWork: true,
      canAffectBaseDays: false,
      canAffectScale: false,
      canGenerateRows: false,
    },
    evidenceSourceKeys,
    webVerified: true,
    reviewNeeded: false,
    sourceStandard: 'enterprise_practice',
    sourceVersion: 'v1.4.7.2-title-weak-auto-discovery',
    sourceClauseRef: 'duration_experience_samples.keyword_match_observation',
    evidenceQuality: {
      source_type: 'enterprise_practice',
      source_doc: 'duration_experience_samples',
      source_url: null,
      evidence_source_keys: evidenceSourceKeys,
      last_review_date: nowDate,
      applicable_region_scope: scope,
    },
  })

  return {
    seedType: 'title_weak_recognition',
    stableCode,
    candidatePayload,
    candidateSource: scope === 'project' ? 'project_history' : 'company_history',
    projectId: scope === 'project' ? readProjectId(first.sample) : null,
    companyId: scope === 'company' ? readCompanyId(first.sample) : readCompanyId(first.sample),
    sampleCount: facts.length,
    variance: 0,
    confidenceLevel: confidenceLevel(confidence),
    evidenceSummary: {
      source: 'duration_experience_samples.title_to_standard_work',
      observationSource: 'keyword_match_observation',
      sampleCount: facts.length,
      sampleIds: facts.map((fact) => normalizeText(fact.sample.id)).filter(Boolean).slice(0, 50),
      taskIds: facts.map((fact) => normalizeText(fact.sample.task_id)).filter(Boolean).slice(0, 50),
      aliasText: first.aliasText,
      aliases,
      standardWorkCode,
      standardWorkName: first.standardWorkName,
      mappingSources: Array.from(new Set(facts.map((fact) => normalizeText(fact.mappingSource)).filter(Boolean))),
      mappingStatuses: Array.from(new Set(facts.map((fact) => normalizeText(fact.mappingStatus)).filter(Boolean))),
      confidenceScore: confidence,
      crossProjects: projectIds.length,
      crossCompanies: companyIds.length,
    },
  }
}

function buildTitleWeakFalsePositiveCandidate(
  scope: AlgorithmSeedDiscoveryScope,
  facts: TitleWeakFalsePositiveFact[],
  options: Required<Pick<AlgorithmSeedDiscoveryOptions, 'minProjectSamples' | 'minCompanySamples'>>,
): BuiltAlgorithmSeedDiscoveryCandidate | null {
  if (facts.length === 0) return null
  const first = facts[0]
  const minSamples = scope === 'project' ? options.minProjectSamples : options.minCompanySamples
  if (facts.length < minSamples) return null

  const projectIds = Array.from(new Set(facts.map((fact) => readProjectId(fact.sample)).filter(Boolean)))
  const companyIds = Array.from(new Set(facts.map((fact) => readCompanyId(fact.sample)).filter(Boolean)))
  if (scope === 'company' && projectIds.length < 3) return null

  const aliasSignature = normalizeAliasSignature(first.aliasText)
  const predictedCode = first.predictedStandardWorkCode
  const correctedCode = first.correctedStandardWorkCode
  const stableCode = buildStableCode('title_weak_recognition', predictedCode, 'false_positive', `${aliasSignature}:${correctedCode}:${scope}`)
  const evidenceSourceKeys = [`title_weak_false_positive:${stableCode}`]
  const nowDate = new Date().toISOString().slice(0, 10)
  const aliases = Array.from(new Set(facts.map((fact) => normalizeText(fact.aliasText)).filter(Boolean))).slice(0, 20)
  const confidence = calculateConfidenceScore({
    scope,
    sampleCount: facts.length,
    cv: 0,
    averageSampleConfidence: facts.reduce((sum, fact) => sum + normalizeConfidence(fact.sample.confidence_score), 0) / facts.length,
    hasEvidence: true,
    minProjectSamples: options.minProjectSamples,
    minCompanySamples: options.minCompanySamples,
  })
  const candidatePayload = normalizeAlgorithmSeedRecordPayload('title_weak_recognition', {
    stableCode,
    ruleId: stableCode,
    signalType: 'standard_work_hint',
    code: `learned_negative_${shortHash(`${aliasSignature}:${predictedCode}:${correctedCode}`)}`,
    standardWorkCodes: [predictedCode],
    label: `False positive guard for ${predictedCode}`,
    keywords: aliases,
    aliases,
    negativeKeywords: aliases,
    confidence,
    source: 'row_name_suggestion',
    templateSeedReferences: ['standard_work_duration_seed', 'duration_experience_samples'],
    effectPolicy: {
      canInferStandardWork: true,
      canAffectBaseDays: false,
      canAffectScale: false,
      canGenerateRows: false,
    },
    evidenceSourceKeys,
    webVerified: true,
    reviewNeeded: false,
    sourceStandard: 'enterprise_practice',
    sourceVersion: 'v1.4.7.2-title-weak-auto-discovery',
    sourceClauseRef: 'duration_experience_samples.title_false_positive_feedback',
    evidenceQuality: {
      source_type: 'enterprise_practice',
      source_doc: 'duration_experience_samples',
      source_url: null,
      evidence_source_keys: evidenceSourceKeys,
      last_review_date: nowDate,
      applicable_region_scope: scope,
    },
    falsePositivePolicy: {
      predictedStandardWorkCode: predictedCode,
      correctedStandardWorkCode: correctedCode,
      previousRuleIds: Array.from(new Set(facts.map((fact) => normalizeText(fact.previousRuleId)).filter(Boolean))).slice(0, 20),
      action: 'add_negative_keyword_or_quarantine_rule',
    },
  })

  return {
    seedType: 'title_weak_recognition',
    stableCode,
    candidatePayload,
    candidateSource: scope === 'project' ? 'project_history' : 'company_history',
    projectId: scope === 'project' ? readProjectId(first.sample) : null,
    companyId: scope === 'company' ? readCompanyId(first.sample) : readCompanyId(first.sample),
    sampleCount: facts.length,
    variance: 0,
    confidenceLevel: confidenceLevel(confidence),
    evidenceSummary: {
      source: 'duration_experience_samples.title_false_positive_feedback',
      observationSource: 'title_false_positive_feedback',
      sampleCount: facts.length,
      sampleIds: facts.map((fact) => normalizeText(fact.sample.id)).filter(Boolean).slice(0, 50),
      taskIds: facts.map((fact) => normalizeText(fact.sample.task_id)).filter(Boolean).slice(0, 50),
      aliasText: first.aliasText,
      aliases,
      predictedStandardWorkCode: predictedCode,
      correctedStandardWorkCode: correctedCode,
      previousRuleIds: Array.from(new Set(facts.map((fact) => normalizeText(fact.previousRuleId)).filter(Boolean))).slice(0, 20),
      confidenceScore: confidence,
      crossProjects: projectIds.length,
      crossCompanies: companyIds.length,
    },
  }
}

function suggestInternalFlowRelationKind(facts: StandardInternalFlowFact[]) {
  const comparableFacts = facts.filter((fact) => fact.predecessorCompletedBeforeSuccessorStart != null)
  const completedBeforeRatio = comparableFacts.length > 0
    ? comparableFacts.filter((fact) => fact.predecessorCompletedBeforeSuccessorStart === true).length / comparableFacts.length
    : 0
  const startedBeforeRatio = comparableFacts.length > 0
    ? comparableFacts.filter((fact) => fact.predecessorStartedBeforeSuccessorStart !== false).length / comparableFacts.length
    : 0
  const first = facts[0]
  const successorText = normalizeLower(first.successorName)
  const looksLikeGate = ['验收', '复核', '检查', '测试', '试验', '记录', '签认', '移交', '校验'].some((keyword) => successorText.includes(keyword))

  if (completedBeforeRatio >= 0.8) return looksLikeGate ? 'acceptance_gate' : 'hard_sequence'
  if (startedBeforeRatio >= 0.8) return first.scheduleMode === 'parallel_with_previous' ? 'parallel_allowed' : 'soft_sequence'
  return 'soft_sequence'
}

function internalFlowCreatesDependency(relationKind: string) {
  return relationKind === 'hard_sequence' || relationKind === 'acceptance_gate'
}

function buildStandardInternalFlowCandidate(
  scope: AlgorithmSeedDiscoveryScope,
  facts: StandardInternalFlowFact[],
  options: Required<Pick<AlgorithmSeedDiscoveryOptions, 'minProjectSamples' | 'minCompanySamples'>>,
): BuiltAlgorithmSeedDiscoveryCandidate | null {
  if (facts.length === 0) return null
  const first = facts[0]
  const minSamples = scope === 'project' ? options.minProjectSamples : options.minCompanySamples
  if (facts.length < minSamples) return null

  const projectIds = Array.from(new Set(facts.map((fact) => readProjectId(fact.sample)).filter(Boolean)))
  const companyIds = Array.from(new Set(facts.map((fact) => readCompanyId(fact.sample)).filter(Boolean)))
  if (scope === 'company' && projectIds.length < 3) return null

  const comparableFacts = facts.filter((fact) => fact.predecessorCompletedBeforeSuccessorStart != null)
  const pairedDateRatio = comparableFacts.length / facts.length
  const completedBeforeCount = comparableFacts.filter((fact) => fact.predecessorCompletedBeforeSuccessorStart === true).length
  const completedBeforeRatio = comparableFacts.length > 0 ? completedBeforeCount / comparableFacts.length : 0
  const startedBeforeCount = comparableFacts.filter((fact) => fact.predecessorStartedBeforeSuccessorStart !== false).length
  const startedBeforeRatio = comparableFacts.length > 0 ? startedBeforeCount / comparableFacts.length : 0
  const consistency = comparableFacts.length > 0 ? Math.max(completedBeforeRatio, 1 - completedBeforeRatio) : 0.45
  const sampleConfidence = facts.reduce((sum, fact) => sum + normalizeConfidence(fact.sample.confidence_score), 0) / facts.length
  const confidence = calculateConfidenceScore({
    scope,
    sampleCount: facts.length,
    cv: Math.max(0, 1 - consistency),
    averageSampleConfidence: Math.min(1, (sampleConfidence * 0.7) + (pairedDateRatio * 0.3)),
    hasEvidence: comparableFacts.length > 0,
    minProjectSamples: options.minProjectSamples,
    minCompanySamples: options.minCompanySamples,
  })
  const suggestedRelationKind = suggestInternalFlowRelationKind(facts)
  const sourceEvidenceCodes = Array.from(new Set(facts.flatMap((fact) => fact.evidenceCodes))).filter(Boolean)
  const sourceEvidenceRefs = uniqueRecordArray(facts.flatMap((fact) => fact.evidenceRefs)).slice(0, 50)
  const sourceEvidenceRefLevels = Array.from(new Set(sourceEvidenceRefs
    .map((item) => normalizeText(item.level))
    .filter(Boolean)))
  const sourceCurationMethods = Array.from(new Set(facts.map((fact) => fact.curationMethod).filter(Boolean)))
  const appliedConditionalEffectIds = Array.from(new Set(facts.flatMap((fact) => fact.appliedConditionalEffectIds))).filter(Boolean)
  const sourceGeneralizationHints = uniqueRecordArray(facts.map((fact) => fact.generalizationHint)).slice(0, 20)
  const includesReviewRequired = facts.some((fact) => fact.curationStatus === 'review_required' || fact.reviewNeeded)
  const originalCreatesDependency = facts.some((fact) => fact.createsDependency || internalFlowCreatesDependency(fact.relationKind))
  const suggestedCreatesDependency = internalFlowCreatesDependency(suggestedRelationKind)
  const hasEnoughComparableEvidence = comparableFacts.length >= minSamples
  const validationOutcome = includesReviewRequired
    ? 'review_required_candidate'
    : originalCreatesDependency && hasEnoughComparableEvidence && completedBeforeRatio <= 0.4 && startedBeforeRatio >= 0.6
      ? 'curated_rule_may_be_too_strict'
      : !originalCreatesDependency && hasEnoughComparableEvidence && completedBeforeRatio >= 0.8 && suggestedCreatesDependency
        ? 'curated_rule_may_be_too_weak'
        : null
  if (!validationOutcome) return null

  const createsDependency = suggestedRelationKind === 'hard_sequence' || suggestedRelationKind === 'acceptance_gate'
  const stableCode = [
    'learned',
    'standard_internal_flow',
    slugPart(first.predecessorStableCode),
    slugPart(first.successorStableCode),
    shortHash(`${first.predecessorName}->${first.successorName}:${scope}`),
  ].join(':')
  const evidenceSourceKeys = [`standard_internal_flow_samples:${stableCode}`]
  const nowDate = new Date().toISOString().slice(0, 10)
  const candidatePayload = normalizeAlgorithmSeedRecordPayload('standard_internal_flow', {
    stableCode,
    seedRuleId: stableCode,
    ruleVersion: 1,
    isActive: true,
    standardWorkCodes: [first.predecessorStableCode, first.successorStableCode],
    predecessorStableCode: first.predecessorStableCode,
    successorStableCode: first.successorStableCode,
    predecessorName: first.predecessorName,
    successorName: first.successorName,
    relationKind: suggestedRelationKind,
    createsDependency,
    dependencyType: createsDependency ? 'FS' : 'SS',
    lagDays: 0,
    relationRole: suggestedRelationKind === 'acceptance_gate' ? 'inspection' : 'workflow',
    strength: createsDependency ? 'recommended' : 'candidate',
    scheduleMode: createsDependency ? 'sequential' : 'parallel_with_previous',
    reasonCode: createsDependency
      ? 'EXECUTION_HISTORY_SUPPORTS_INTERNAL_FLOW_HANDOFF'
      : 'EXECUTION_HISTORY_SUPPORTS_NON_BLOCKING_INTERNAL_FLOW',
    confidence,
    sourceStandard: 'enterprise_execution_history',
    sourceVersion: 'v1.4.7.2-internal-flow-auto-discovery',
    sourceClauseRef: 'duration_experience_samples.standard_internal_flow',
    evidenceSourceKeys,
    evidenceCodes: sourceEvidenceCodes,
    evidenceRefs: sourceEvidenceRefs,
    sourceCurationMethods,
    appliedConditionalEffectIds,
    sourceGeneralizationHints,
    webVerified: true,
    reviewNeeded: validationOutcome !== 'review_required_candidate',
    validationMode: validationOutcome,
    originalRuleEvidence: {
      curationStatuses: Array.from(new Set(facts.map((fact) => fact.curationStatus).filter(Boolean))),
      relationKinds: Array.from(new Set(facts.map((fact) => fact.relationKind).filter(Boolean))),
      scheduleModes: Array.from(new Set(facts.map((fact) => fact.scheduleMode).filter(Boolean))),
      createsDependency: originalCreatesDependency,
    },
    executionBackValidation: {
      pairedActualDateCount: comparableFacts.length,
      predecessorCompletedBeforeSuccessorStartRatio: Math.round(completedBeforeRatio * 1000) / 1000,
      predecessorStartedBeforeSuccessorStartRatio: Math.round(startedBeforeRatio * 1000) / 1000,
      suggestedRelationKind,
      suggestedCreatesDependency,
    },
    impactScope: {
      backendOnly: true,
      canModifyRuntimeTasks: false,
      affectedTemplateNodeStableCodes: Array.from(new Set(facts.flatMap((fact) => [
        fact.predecessorStableCode,
        fact.successorStableCode,
      ]))).filter(Boolean).slice(0, 100),
      sampleTaskIds: facts.map((fact) => normalizeText(fact.sample.task_id)).filter(Boolean).slice(0, 100),
      projectIds,
      companyIds,
    },
    effectPolicy: {
      canSuggestInternalFlow: true,
      canCreateRuntimeDependency: false,
      canModifyStandardSeed: false,
      promotionRequiresManualSeedRule: true,
      canFlagCuratedRuleForReview: validationOutcome !== 'review_required_candidate',
      canSuggestSourceOrderCorrection: validationOutcome !== 'review_required_candidate',
    },
    evidenceQuality: {
      source_type: 'enterprise_practice',
      source_doc: 'duration_experience_samples',
      source_url: null,
      evidence_source_keys: evidenceSourceKeys,
      last_review_date: nowDate,
      applicable_region_scope: scope,
    },
  })

  return {
    seedType: 'standard_internal_flow',
    stableCode,
    candidatePayload,
    candidateSource: scope === 'project' ? 'project_history' : 'company_history',
    projectId: scope === 'project' ? readProjectId(first.sample) : null,
    companyId: readCompanyId(first.sample),
    sampleCount: facts.length,
    variance: Math.round(Math.max(0, 1 - consistency) * 1000) / 1000,
    confidenceLevel: confidenceLevel(confidence),
    evidenceSummary: {
      source: 'duration_experience_samples.standard_internal_flow',
      observationSource: 'same_parent_internal_flow_execution_history',
      sampleCount: facts.length,
      pairedActualDateCount: comparableFacts.length,
      predecessorCompletedBeforeSuccessorStartCount: completedBeforeCount,
      predecessorCompletedBeforeSuccessorStartRatio: Math.round(completedBeforeRatio * 1000) / 1000,
      predecessorStartedBeforeSuccessorStartCount: startedBeforeCount,
      predecessorStartedBeforeSuccessorStartRatio: Math.round(startedBeforeRatio * 1000) / 1000,
      suggestedRelationKind,
      validationOutcome,
      originalCurationStatuses: Array.from(new Set(facts.map((fact) => fact.curationStatus).filter(Boolean))),
      originalCurationMethods: sourceCurationMethods,
      originalRelationKinds: Array.from(new Set(facts.map((fact) => fact.relationKind).filter(Boolean))),
      originalCreatesDependency,
      sourceEvidenceCodes,
      sourceEvidenceRefLevels,
      sourceEvidenceRefs,
      appliedConditionalEffectIds,
      sourceGeneralizationHints,
      impactScope: {
        backendOnly: true,
        canModifyRuntimeTasks: false,
        affectedTemplateNodeStableCodes: Array.from(new Set(facts.flatMap((fact) => [
          fact.predecessorStableCode,
          fact.successorStableCode,
        ]))).filter(Boolean).slice(0, 100),
      },
      sampleIds: facts.map((fact) => normalizeText(fact.sample.id)).filter(Boolean).slice(0, 50),
      predecessorSampleIds: facts.map((fact) => normalizeText(fact.predecessorSampleId)).filter(Boolean).slice(0, 50),
      taskIds: facts.map((fact) => normalizeText(fact.sample.task_id)).filter(Boolean).slice(0, 50),
      predecessorStableCode: first.predecessorStableCode,
      successorStableCode: first.successorStableCode,
      predecessorName: first.predecessorName,
      successorName: first.successorName,
      confidenceScore: confidence,
      crossProjects: projectIds.length,
      crossCompanies: companyIds.length,
      runtimeEffect: validationOutcome === 'review_required_candidate'
        ? 'candidate_only_until_promoted_to_standardInternalFlowSeed'
        : 'candidate_only_until_manual_seed_review_or_template_source_order_fix',
    },
  }
}

function buildCrossItemWorkflowCandidate(
  scope: AlgorithmSeedDiscoveryScope,
  facts: CrossItemWorkflowFact[],
  options: Required<Pick<AlgorithmSeedDiscoveryOptions, 'minProjectSamples' | 'minCompanySamples'>>,
): BuiltAlgorithmSeedDiscoveryCandidate | null {
  if (facts.length === 0) return null
  const first = facts[0]
  const minSamples = scope === 'project' ? options.minProjectSamples : options.minCompanySamples
  if (facts.length < minSamples) return null

  const projectIds = Array.from(new Set(facts.map((fact) => readProjectId(fact.sample)).filter(Boolean)))
  const companyIds = Array.from(new Set(facts.map((fact) => readCompanyId(fact.sample)).filter(Boolean)))
  if (scope === 'company' && projectIds.length < 3) return null

  const comparableFacts = facts.filter((fact) => fact.predecessorCompletedBeforeSuccessorStart != null)
  const pairedDateRatio = comparableFacts.length / facts.length
  const completedBeforeCount = comparableFacts.filter((fact) => fact.predecessorCompletedBeforeSuccessorStart === true).length
  const completedBeforeRatio = comparableFacts.length > 0 ? completedBeforeCount / comparableFacts.length : 0
  const startedBeforeCount = comparableFacts.filter((fact) => fact.predecessorStartedBeforeSuccessorStart !== false).length
  const startedBeforeRatio = comparableFacts.length > 0 ? startedBeforeCount / comparableFacts.length : 0
  if (completedBeforeRatio < 0.8) return null

  const consistency = comparableFacts.length > 0 ? Math.max(completedBeforeRatio, 1 - completedBeforeRatio) : 0.45
  const sampleConfidence = facts.reduce((sum, fact) => sum + normalizeConfidence(fact.sample.confidence_score), 0) / facts.length
  const confidence = calculateConfidenceScore({
    scope,
    sampleCount: facts.length,
    cv: Math.max(0, 1 - consistency),
    averageSampleConfidence: Math.min(1, (sampleConfidence * 0.7) + (pairedDateRatio * 0.3)),
    hasEvidence: comparableFacts.length > 0,
    minProjectSamples: options.minProjectSamples,
    minCompanySamples: options.minCompanySamples,
  })
  const stableCode = [
    'learned',
    'cross_item_workflow',
    slugPart(first.predecessorCodePrefixes.join('_')),
    slugPart(first.successorCodePrefixes.join('_')),
    shortHash(`${first.predecessorCodePrefixes.join('+')}->${first.successorCodePrefixes.join('+')}:${first.scopeRule}:${scope}`),
  ].join(':')
  const evidenceSourceKeys = Array.from(new Set([
    `cross_item_workflow_samples:${stableCode}`,
    ...facts.flatMap((fact) => fact.evidenceSourceKeys),
  ].filter(Boolean)))
  const nowDate = new Date().toISOString().slice(0, 10)
  const candidatePayload = normalizeAlgorithmSeedRecordPayload('cross_item_workflow', {
    stableCode,
    seedRuleId: stableCode,
    ruleVersion: 1,
    isActive: false,
    predecessorCodePrefixes: first.predecessorCodePrefixes,
    successorCodePrefixes: first.successorCodePrefixes,
    predecessorCategoryTypes: first.predecessorCategoryTypes,
    successorCategoryTypes: first.successorCategoryTypes,
    dependencyType: first.dependencyType,
    lagDays: 0,
    scopeRule: first.scopeRule,
    strength: first.strength,
    autoApplyPolicy: 'candidate_only',
    sourceStandard: first.sourceStandard,
    sourceVersion: 'v1.4.7.5-cross-item-workflow-auto-discovery',
    sourceClauseRef: 'duration_experience_samples.cross_item_workflow',
    evidenceSourceKeys,
    boundaryPolicy: 'Execution-history cross-item workflow candidate-only signal; candidate-only until promoted to curated cross_item_workflow seed, never writes runtime task dependencies directly.',
    confidence: confidenceLevel(confidence),
    webVerified: false,
    reviewNeeded: true,
    effectPolicy: {
      canSuggestCrossItemWorkflow: true,
      canCreateRuntimeDependency: false,
      canModifyStandardSeed: false,
      promotionRequiresManualSeedRule: true,
    },
    evidenceQuality: {
      source_type: 'enterprise_practice',
      source_doc: 'duration_experience_samples',
      source_url: null,
      evidence_source_keys: evidenceSourceKeys,
      last_review_date: nowDate,
      applicable_region_scope: scope,
    },
  })

  return {
    seedType: 'cross_item_workflow',
    stableCode,
    candidatePayload,
    candidateSource: scope === 'project' ? 'project_history' : 'company_history',
    projectId: scope === 'project' ? readProjectId(first.sample) : null,
    companyId: readCompanyId(first.sample),
    sampleCount: facts.length,
    variance: Math.round(Math.max(0, 1 - consistency) * 1000) / 1000,
    confidenceLevel: confidenceLevel(confidence),
    evidenceSummary: {
      source: 'duration_experience_samples.cross_item_workflow',
      observationSource: 'cross_package_execution_history',
      sampleCount: facts.length,
      pairedActualDateCount: comparableFacts.length,
      predecessorCompletedBeforeSuccessorStartCount: completedBeforeCount,
      predecessorCompletedBeforeSuccessorStartRatio: Math.round(completedBeforeRatio * 1000) / 1000,
      predecessorStartedBeforeSuccessorStartCount: startedBeforeCount,
      predecessorStartedBeforeSuccessorStartRatio: Math.round(startedBeforeRatio * 1000) / 1000,
      predecessorCodePrefixes: first.predecessorCodePrefixes,
      successorCodePrefixes: first.successorCodePrefixes,
      dependencyType: first.dependencyType,
      scopeRule: first.scopeRule,
      strength: first.strength,
      evidenceSourceKeys,
      sampleIds: facts.map((fact) => normalizeText(fact.sample.id)).filter(Boolean).slice(0, 50),
      predecessorSampleIds: facts.map((fact) => normalizeText(fact.predecessorSampleId)).filter(Boolean).slice(0, 50),
      taskIds: facts.map((fact) => normalizeText(fact.sample.task_id)).filter(Boolean).slice(0, 50),
      projectIds,
      companyIds,
      confidenceScore: confidence,
      runtimeEffect: 'candidate_only_until_promoted_to_crossItemWorkflowSeed',
      dependencyWritePolicy: 'never_write_task_dependencies_from_cross_item_workflow_learning',
      crossProjects: projectIds.length,
      crossCompanies: companyIds.length,
    },
  }
}

export function buildAlgorithmSeedDiscoveryCandidates(
  samples: AlgorithmSeedDiscoverySample[],
  options: AlgorithmSeedDiscoveryOptions = {},
): BuiltAlgorithmSeedDiscoveryCandidate[] {
  if (Array.isArray(options.projectIds) && options.projectIds.length === 0) return []

  const minProjectSamples = options.minProjectSamples ?? DEFAULT_PROJECT_MIN_SAMPLES
  const minCompanySamples = options.minCompanySamples ?? DEFAULT_COMPANY_MIN_SAMPLES
  const companyFilter = normalizeText(options.companyId) || null
  const projectFilter = normalizeText(options.projectId) || null
  const projectSet = new Set((options.projectIds ?? []).map(normalizeText).filter(Boolean))
  const groups = new Map<string, CandidateFact[]>()
  const seasonalProductivityGroups = new Map<string, SeasonalProductivityFact[]>()
  const processSeasonalGroups = new Map<string, ProcessSeasonalSensitivityFact[]>()
  const siteCapacityGroups = new Map<string, SiteCapacityPressureFact[]>()
  const buildingPatternGroups = new Map<string, BuildingPatternFact[]>()
  const titleWeakGroups = new Map<string, TitleWeakCandidateFact[]>()
  const titleWeakFalsePositiveGroups = new Map<string, TitleWeakFalsePositiveFact[]>()
  const standardInternalFlowGroups = new Map<string, StandardInternalFlowFact[]>()
  const crossItemWorkflowGroups = new Map<string, CrossItemWorkflowFact[]>()
  const sampleLookup = buildSampleLookup(samples)

  for (const sample of samples) {
    const projectId = readProjectId(sample)
    const companyId = readCompanyId(sample)
    if (companyFilter && companyId !== companyFilter) continue
    if (projectFilter && projectId !== projectFilter) continue
    if (projectSet.size > 0 && (!projectId || !projectSet.has(projectId))) continue

    for (const fact of extractCandidateFacts(sample)) {
      const contextKey = readBenchmarkContextKey(sample)
      const standardWorkCode = normalizeText(sample.standard_work_code)
      if (projectId) {
        const key = ['project', projectId, fact.seedType, standardWorkCode, fact.subtype, contextKey].join('::')
        groups.set(key, [...(groups.get(key) ?? []), fact])
      }
      if (companyId) {
        const key = ['company', companyId, fact.seedType, standardWorkCode, fact.subtype, contextKey].join('::')
        groups.set(key, [...(groups.get(key) ?? []), fact])
      }
    }

    const seasonalProductivityFact = readSeasonalProductivityFact(sample)
    if (seasonalProductivityFact) {
      const keyParts = [seasonalProductivityFact.regionCode, seasonalProductivityFact.month, seasonalProductivityFact.climateSignal]
      if (projectId) {
        const key = ['project', projectId, seasonalProductivityFact.seedType, ...keyParts].join('::')
        seasonalProductivityGroups.set(key, [...(seasonalProductivityGroups.get(key) ?? []), seasonalProductivityFact])
      }
      if (companyId) {
        const key = ['company', companyId, seasonalProductivityFact.seedType, ...keyParts].join('::')
        seasonalProductivityGroups.set(key, [...(seasonalProductivityGroups.get(key) ?? []), seasonalProductivityFact])
      }
    }

    const processSeasonalFact = readProcessSeasonalSensitivityFact(sample)
    if (processSeasonalFact) {
      const keyParts = [processSeasonalFact.standardWorkCode, processSeasonalFact.climateSignal]
      if (projectId) {
        const key = ['project', projectId, processSeasonalFact.seedType, ...keyParts].join('::')
        processSeasonalGroups.set(key, [...(processSeasonalGroups.get(key) ?? []), processSeasonalFact])
      }
      if (companyId) {
        const key = ['company', companyId, processSeasonalFact.seedType, ...keyParts].join('::')
        processSeasonalGroups.set(key, [...(processSeasonalGroups.get(key) ?? []), processSeasonalFact])
      }
    }

    const siteCapacityFact = readSiteCapacityPressureFact(sample)
    if (siteCapacityFact) {
      const keyParts = [siteCapacityFact.signalType]
      if (projectId) {
        const key = ['project', projectId, siteCapacityFact.seedType, ...keyParts].join('::')
        siteCapacityGroups.set(key, [...(siteCapacityGroups.get(key) ?? []), siteCapacityFact])
      }
      if (companyId) {
        const key = ['company', companyId, siteCapacityFact.seedType, ...keyParts].join('::')
        siteCapacityGroups.set(key, [...(siteCapacityGroups.get(key) ?? []), siteCapacityFact])
      }
    }

    const buildingPatternFact = readBuildingPatternFact(sample)
    if (buildingPatternFact) {
      const keyParts = [
        buildingPatternFact.patternCode,
        buildingPatternFact.projectTypeCode || readSampleProjectTypeCode(sample) || 'project:any',
        buildingPatternFact.structureTypeCode || readSampleStructureTypeCode(sample) || 'structure:any',
        (buildingPatternFact.methodVariantCodes.length > 0 ? buildingPatternFact.methodVariantCodes : readSampleMethodVariantCodes(sample)).join('+') || 'method:any',
        (buildingPatternFact.elementVariantCodes.length > 0 ? buildingPatternFact.elementVariantCodes : readSampleElementVariantCodes(sample)).join('+') || 'element:any',
        buildingPatternFact.primaryWorkfaceType || 'workface:any',
        buildingPatternFact.phaseWindow || 'phase:any',
      ]
      if (projectId) {
        const key = ['project', projectId, buildingPatternFact.seedType, ...keyParts].join('::')
        buildingPatternGroups.set(key, [...(buildingPatternGroups.get(key) ?? []), buildingPatternFact])
      }
      if (companyId) {
        const key = ['company', companyId, buildingPatternFact.seedType, ...keyParts].join('::')
        buildingPatternGroups.set(key, [...(buildingPatternGroups.get(key) ?? []), buildingPatternFact])
      }
    }

    const titleWeakFact = readTitleWeakFact(sample)
    if (titleWeakFact) {
      const aliasSignature = normalizeAliasSignature(titleWeakFact.aliasText)
      const standardWorkCode = normalizeText(titleWeakFact.standardWorkCode)
      if (projectId) {
        const key = ['project', projectId, titleWeakFact.seedType, aliasSignature, standardWorkCode].join('::')
        titleWeakGroups.set(key, [...(titleWeakGroups.get(key) ?? []), titleWeakFact])
      }
      if (companyId) {
        const key = ['company', companyId, titleWeakFact.seedType, aliasSignature, standardWorkCode].join('::')
        titleWeakGroups.set(key, [...(titleWeakGroups.get(key) ?? []), titleWeakFact])
      }
    }

    const falsePositiveFact = readTitleWeakFalsePositiveFact(sample)
    if (falsePositiveFact) {
      const aliasSignature = normalizeAliasSignature(falsePositiveFact.aliasText)
      const keyParts = [
        falsePositiveFact.predictedStandardWorkCode,
        falsePositiveFact.correctedStandardWorkCode,
        aliasSignature,
      ]
      if (projectId) {
        const key = ['project', projectId, 'title_weak_false_positive', ...keyParts].join('::')
        titleWeakFalsePositiveGroups.set(key, [...(titleWeakFalsePositiveGroups.get(key) ?? []), falsePositiveFact])
      }
      if (companyId) {
        const key = ['company', companyId, 'title_weak_false_positive', ...keyParts].join('::')
        titleWeakFalsePositiveGroups.set(key, [...(titleWeakFalsePositiveGroups.get(key) ?? []), falsePositiveFact])
      }
    }

    const internalFlowFact = readStandardInternalFlowFact(sample, sampleLookup)
    if (internalFlowFact) {
      const keyParts = [
        internalFlowFact.predecessorStableCode,
        internalFlowFact.successorStableCode,
        normalizeAliasSignature(`${internalFlowFact.predecessorName}->${internalFlowFact.successorName}`),
      ]
      if (projectId) {
        const key = ['project', projectId, 'standard_internal_flow', ...keyParts].join('::')
        standardInternalFlowGroups.set(key, [...(standardInternalFlowGroups.get(key) ?? []), internalFlowFact])
      }
      if (companyId) {
        const key = ['company', companyId, 'standard_internal_flow', ...keyParts].join('::')
        standardInternalFlowGroups.set(key, [...(standardInternalFlowGroups.get(key) ?? []), internalFlowFact])
      }
    }

    const crossItemWorkflowFact = readCrossItemWorkflowFact(sample, sampleLookup)
    if (crossItemWorkflowFact) {
      const keyParts = [
        crossItemWorkflowFact.predecessorCodePrefixes.join('+'),
        crossItemWorkflowFact.successorCodePrefixes.join('+'),
        crossItemWorkflowFact.dependencyType,
        crossItemWorkflowFact.scopeRule,
      ]
      if (projectId) {
        const key = ['project', projectId, 'cross_item_workflow', ...keyParts].join('::')
        crossItemWorkflowGroups.set(key, [...(crossItemWorkflowGroups.get(key) ?? []), crossItemWorkflowFact])
      }
      if (companyId) {
        const key = ['company', companyId, 'cross_item_workflow', ...keyParts].join('::')
        crossItemWorkflowGroups.set(key, [...(crossItemWorkflowGroups.get(key) ?? []), crossItemWorkflowFact])
      }
    }
  }

  const durationCandidates = [...groups.entries()]
    .map(([key, facts]) => buildCandidateFromFacts(key.startsWith('project::') ? 'project' : 'company', facts, {
      minProjectSamples,
      minCompanySamples,
    }))
    .filter((candidate): candidate is BuiltAlgorithmSeedDiscoveryCandidate => Boolean(candidate))
  const seasonalProductivityCandidates = [...seasonalProductivityGroups.entries()]
    .map(([key, facts]) => buildSeasonalProductivityCandidate(key.startsWith('project::') ? 'project' : 'company', facts, {
      minProjectSamples,
      minCompanySamples,
    }))
    .filter((candidate): candidate is BuiltAlgorithmSeedDiscoveryCandidate => Boolean(candidate))
  const processSeasonalCandidates = [...processSeasonalGroups.entries()]
    .map(([key, facts]) => buildProcessSeasonalSensitivityCandidate(key.startsWith('project::') ? 'project' : 'company', facts, {
      minProjectSamples,
      minCompanySamples,
    }))
    .filter((candidate): candidate is BuiltAlgorithmSeedDiscoveryCandidate => Boolean(candidate))
  const siteCapacityCandidates = [...siteCapacityGroups.entries()]
    .map(([key, facts]) => buildSiteCapacityPressureCandidate(key.startsWith('project::') ? 'project' : 'company', facts, {
      minProjectSamples,
      minCompanySamples,
    }))
    .filter((candidate): candidate is BuiltAlgorithmSeedDiscoveryCandidate => Boolean(candidate))
  const buildingPatternCandidates = [...buildingPatternGroups.entries()]
    .map(([key, facts]) => buildBuildingPatternCandidate(key.startsWith('project::') ? 'project' : 'company', facts, {
      minProjectSamples,
      minCompanySamples,
    }))
    .filter((candidate): candidate is BuiltAlgorithmSeedDiscoveryCandidate => Boolean(candidate))
  const titleWeakCandidates = [...titleWeakGroups.entries()]
    .map(([key, facts]) => buildTitleWeakCandidateFromFacts(key.startsWith('project::') ? 'project' : 'company', facts, {
      minProjectSamples,
      minCompanySamples,
    }))
    .filter((candidate): candidate is BuiltAlgorithmSeedDiscoveryCandidate => Boolean(candidate))
  const titleWeakNegativeCandidates = [...titleWeakFalsePositiveGroups.entries()]
    .map(([key, facts]) => buildTitleWeakFalsePositiveCandidate(key.startsWith('project::') ? 'project' : 'company', facts, {
      minProjectSamples,
      minCompanySamples,
    }))
    .filter((candidate): candidate is BuiltAlgorithmSeedDiscoveryCandidate => Boolean(candidate))
  const standardInternalFlowCandidates = [...standardInternalFlowGroups.entries()]
    .map(([key, facts]) => buildStandardInternalFlowCandidate(key.startsWith('project::') ? 'project' : 'company', facts, {
      minProjectSamples,
      minCompanySamples,
    }))
    .filter((candidate): candidate is BuiltAlgorithmSeedDiscoveryCandidate => Boolean(candidate))
  const crossItemWorkflowCandidates = [...crossItemWorkflowGroups.entries()]
    .map(([key, facts]) => buildCrossItemWorkflowCandidate(key.startsWith('project::') ? 'project' : 'company', facts, {
      minProjectSamples,
      minCompanySamples,
    }))
    .filter((candidate): candidate is BuiltAlgorithmSeedDiscoveryCandidate => Boolean(candidate))

  return [
    ...durationCandidates,
    ...seasonalProductivityCandidates,
    ...processSeasonalCandidates,
    ...siteCapacityCandidates,
    ...buildingPatternCandidates,
    ...titleWeakCandidates,
    ...titleWeakNegativeCandidates,
    ...standardInternalFlowCandidates,
    ...crossItemWorkflowCandidates,
  ].sort((left, right) => {
    const scopeOrder = Number(Boolean(left.projectId)) - Number(Boolean(right.projectId))
    if (scopeOrder !== 0) return -scopeOrder
    return left.stableCode.localeCompare(right.stableCode)
  })
}

export function buildTitleWeakUnmatchedDiagnostics(
  samples: AlgorithmSeedDiscoverySample[],
  options: AlgorithmSeedDiscoveryOptions = {},
): TitleWeakUnmatchedDiagnostic[] {
  if (Array.isArray(options.projectIds) && options.projectIds.length === 0) return []

  const minProjectSamples = options.minProjectSamples ?? DEFAULT_PROJECT_MIN_SAMPLES
  const minCompanySamples = options.minCompanySamples ?? DEFAULT_COMPANY_MIN_SAMPLES
  const companyFilter = normalizeText(options.companyId) || null
  const projectFilter = normalizeText(options.projectId) || null
  const projectSet = new Set((options.projectIds ?? []).map(normalizeText).filter(Boolean))
  const groups = new Map<string, TitleWeakUnmatchedFact[]>()

  for (const sample of samples) {
    const projectId = readProjectId(sample)
    const companyId = readCompanyId(sample)
    if (companyFilter && companyId !== companyFilter) continue
    if (projectFilter && projectId !== projectFilter) continue
    if (projectSet.size > 0 && (!projectId || !projectSet.has(projectId))) continue

    const fact = readTitleWeakUnmatchedFact(sample)
    if (!fact) continue
    const aliasSignature = normalizeAliasSignature(fact.aliasText)
    if (projectId) {
      const key = ['project', projectId, aliasSignature].join('::')
      groups.set(key, [...(groups.get(key) ?? []), fact])
    }
    if (companyId) {
      const key = ['company', companyId, aliasSignature].join('::')
      groups.set(key, [...(groups.get(key) ?? []), fact])
    }
  }

  const diagnostics: TitleWeakUnmatchedDiagnostic[] = []
  for (const [key, facts] of groups.entries()) {
    const scope: AlgorithmSeedDiscoveryScope = key.startsWith('project::') ? 'project' : 'company'
    const minSamples = scope === 'project' ? minProjectSamples : minCompanySamples
    if (facts.length < minSamples) continue
    const first = facts[0]
    diagnostics.push({
      scope,
      aliasText: first.aliasText,
      aliasSignature: normalizeAliasSignature(first.aliasText),
      projectId: scope === 'project' ? readProjectId(first.sample) : null,
      companyId: readCompanyId(first.sample),
      sampleCount: facts.length,
      reasons: Array.from(new Set(facts.map((fact) => normalizeText(fact.reason)).filter(Boolean))).slice(0, 10),
      weakStandardWorkCodes: Array.from(new Set(facts.flatMap((fact) => fact.weakStandardWorkCodes))).slice(0, 20),
      sampleIds: facts.map((fact) => normalizeText(fact.sample.id)).filter(Boolean).slice(0, 50),
      taskIds: facts.map((fact) => normalizeText(fact.sample.task_id)).filter(Boolean).slice(0, 50),
    })
  }

  return diagnostics.sort((left, right) => right.sampleCount - left.sampleCount || left.aliasSignature.localeCompare(right.aliasSignature))
}

async function loadDiscoverySamples(options: AlgorithmSeedDiscoveryOptions) {
  if (Array.isArray(options.projectIds) && options.projectIds.length === 0) {
    return []
  }

  let query = (supabase as any)
    .from('duration_experience_samples')
    .select('id, project_id, task_id, template_node_id, standard_work_code, standard_work_name, wbs_node_type, actual_duration, planned_duration, duration_day_basis, actual_duration_calendar_days, actual_duration_production_days, planned_duration_calendar_days, planned_duration_production_days, started_at, completed_at, confidence_score, metadata')
    .eq('sample_status', 'active')
    .eq('included_in_benchmark', true)
    .eq('duration_day_basis', 'construction_production_day')
    .order('completed_at', { ascending: false })
    .limit(options.maxSamples ?? DEFAULT_MAX_SAMPLES)

  if (options.projectId) query = query.eq('project_id', options.projectId)
  if (Array.isArray(options.projectIds) && options.projectIds.length > 0) {
    query = query.in('project_id', options.projectIds)
  }

  const { data, error } = await query
  if (error) throw new Error(`Failed to load algorithm seed discovery samples: ${error.message}`)
  return (Array.isArray(data) ? data : []) as AlgorithmSeedDiscoverySample[]
}

async function hasExistingCandidate(candidate: BuiltAlgorithmSeedDiscoveryCandidate) {
  let query = (supabase as any)
    .from('algorithm_seed_upgrade_candidates')
    .select('id')
    .eq('seed_type', candidate.seedType)
    .eq('stable_code', candidate.stableCode)
    .in('status', ACTIVE_CANDIDATE_STATUSES)
    .limit(1)

  query = candidate.projectId ? query.eq('project_id', candidate.projectId) : query.is('project_id', null)
  query = candidate.companyId ? query.eq('company_id', candidate.companyId) : query.is('company_id', null)

  const { data, error } = await query
  if (error) throw new Error(`Failed to check existing algorithm seed candidate: ${error.message}`)
  return Array.isArray(data) && data.length > 0
}

export async function discoverAlgorithmSeedUpgradeCandidates(
  options: AlgorithmSeedDiscoveryOptions = {},
): Promise<AlgorithmSeedDiscoveryResult> {
  const samples = await loadDiscoverySamples(options)
  const candidates = buildAlgorithmSeedDiscoveryCandidates(samples, options)
  const unmatchedDiagnostics = buildTitleWeakUnmatchedDiagnostics(samples, options)
  const actorId = normalizeUuid(options.triggeredBy)
  const result: AlgorithmSeedDiscoveryResult = {
    sampleCount: samples.length,
    discovered: candidates.length,
    unmatchedDiagnostics: unmatchedDiagnostics.length,
    created: 0,
    skippedDuplicates: 0,
    governed: 0,
    failed: [],
  }

  for (const candidate of candidates) {
    try {
      if (await hasExistingCandidate(candidate)) {
        result.skippedDuplicates += 1
        continue
      }

      const row = await createAlgorithmSeedUpgradeCandidate({
        seedType: candidate.seedType,
        stableCode: candidate.stableCode,
        candidatePayload: candidate.candidatePayload,
        candidateSource: candidate.candidateSource,
        projectId: candidate.projectId,
        companyId: candidate.companyId,
        sampleCount: candidate.sampleCount,
        variance: candidate.variance,
        confidenceLevel: candidate.confidenceLevel,
        evidenceSummary: candidate.evidenceSummary,
        actionPolicy: options.autoGovern === false ? 'candidate_only' : 'auto_govern',
        createdBy: actorId,
      })
      result.created += 1

      if (options.autoGovern !== false && (row as any)?.id) {
        await autoGovernAlgorithmSeedUpgradeCandidate((row as any).id, {
          triggeredBy: actorId,
          scopeType: candidate.projectId ? 'project' : 'company',
          projectId: candidate.projectId,
          companyId: candidate.companyId,
        })
        result.governed += 1
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      logger.warn('[algorithmSeedCandidateDiscoveryService] failed to persist candidate', {
        stableCode: candidate.stableCode,
        seedType: candidate.seedType,
        reason,
      })
      result.failed.push({ stableCode: candidate.stableCode, reason })
    }
  }

  return result
}
