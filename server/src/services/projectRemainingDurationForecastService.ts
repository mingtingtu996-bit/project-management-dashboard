import {
  buildAlgorithmFactContext,
  summarizeAlgorithmFactContext,
  type RuntimeExecutionFacts,
} from './algorithmFactContextService.js'
import type { DurationAccuracyPredictionInput } from './durationAlgorithmAccuracyService.js'
import { getDurationOutputContract } from './durationOutputGovernanceService.js'
import type { CriticalPathSnapshot } from './projectCriticalPathService.js'
import type { ScheduleAccelerationRow } from './scheduleAccelerationService.js'
import {
  recordProjectRemainingDurationForecastConsumedArtifacts,
  type DurationRuntimeConsumerFacadeArtifactsResult,
} from './durationRuntimeConsumerObservationAdapterService.js'
import {
  evaluateDurationPlausibility,
  orderDurationBand,
  type DurationPlausibilityWarning,
} from './durationEngineeringPlausibilityGuardrailService.js'
import type {
  DurationRuntimeConsumerObservationQueryExec,
  DurationRuntimeConsumerObservedArtifact,
} from './durationRuntimeConsumerObservationService.js'
import { normalizeDurationDateUtc, orderedInclusiveDurationDays, signedDurationDayDelta } from '../utils/durationDays.js'
import {
  addConstructionProductionDays,
  parseConstructionCalendarDate,
  productionDaysBetweenInclusive,
  type ConstructionCalendarContext,
} from './constructionCalendar.js'
import { buildDownstreamDurationAssetConsumption } from './durationAssetDownstreamConsumptionService.js'
import {
  simulateDurationNetworkProbability,
  type DurationNetworkProbabilityResult,
} from './durationNetworkMonteCarloService.js'
import type {
  DurationAssetConsumptionReceipt,
  DurationAssetConsumptionSummary,
} from './durationAssetConsumptionReceiptService.js'

export type ProjectMonthlyCommitmentSummary = {
  activeCommitmentCount?: number | null
  carryoverCommitmentCount?: number | null
  latestCommitmentFinishDate?: string | null
}

export type ProjectMonthlyCommitmentSoftSignalPolicy = 'status_only_not_finish_boundary'

export type ProjectRemainingDurationForecast = {
  durationOutputCode: 'project_remaining_forecast'
  durationOutputSemanticFieldName: 'projectRemainingForecastDays'
  durationOutputContract?: Record<string, unknown> | null
  projectRemainingForecastDays: number
  forecastFinishDate: string | null
  targetEndDate?: string | null
  targetGapDays?: number | null
  rowsEvaluated: number
  calculationContext: {
    primaryLayer: 'projectGenerationFacts' | 'runtimeExecutionFacts'
    factWeights: {
      projectGenerationFacts: number
      runtimeExecutionFacts: number
    }
    projectFactsRole: 'primary' | 'background'
    runtimeFactsRole: 'primary' | 'background'
    criticalPath: {
      remainingTaskCount: number
      latestCriticalFinishDate: string | null
      optimisticBandFinishDate?: string | null
      confidenceBandFinishDate?: string | null
      criticalPathSpanFinishDate?: string | null
      mergeBiasDays?: number
      mergeBiasChainCount?: number
      mergeBiasedFinishDate?: string | null
      probabilityBasis?: 'monte_carlo' | 'pert_analytic'
      networkProbability?: DurationNetworkProbabilityResult & {
        p20RemainingDays: number | null
        p50RemainingDays: number | null
        p80RemainingDays: number | null
        p20FinishDate: string | null
        p50FinishDate: string | null
        p80FinishDate: string | null
      }
      confidenceBandDecision?: {
        status: 'applied' | 'observed' | 'missing_confidence_band' | 'not_applicable'
        governingFinishSource: 'confidence_band' | 'merge_bias' | 'deterministic_finish'
        governingFinishDate: string | null
        mergeBiasApplied: boolean
        confidenceBandAvailableCount: number
        confidenceBandMissingCount: number
        probabilityBasis: 'monte_carlo' | 'pert_analytic'
      }
    }
    runtimeAdjustment?: {
      pressureProgressExtraDays: number
      adjustedInternalFinishDate: string | null
      evidenceObjects?: RuntimeExecutionFacts['evidenceObjects']
      runtimeInferenceSummary?: RuntimeExecutionFacts['runtimeInferenceSummary']
    }
    monthlyCommitments: {
      activeCommitmentCount: number
      carryoverCommitmentCount: number
      latestCommitmentFinishDate: string | null
      commitmentFinishSoftSignalDate: string | null
      commitmentFinishBeyondForecastDays: number
      softSignalPolicy: ProjectMonthlyCommitmentSoftSignalPolicy
    }
    externalInterfaces: {
      hardGateCount: number
      latestGateFinishDate: string | null
      gateRelationSummary?: {
        parallelWaitCount: number
        startGateCount?: number
        finishGateCount: number
        handoverGateCount?: number
        mixedGateCount?: number
        totalCount: number
        relationKinds?: string[]
      }
      serialRemainingDays?: number
      overlappedRemainingDays?: number
      startGateFinishDate?: string | null
      overlappedGateFinishDate?: string | null
      finishGateFinishDate?: string | null
      handoverGateFinishDate?: string | null
      gateTailDaysAfterInternal?: number
      serializedGateFinishDate?: string | null
    }
    t2RhythmScheduleEvidence?: {
      source: 'project_remaining_duration_forecast_e4_row_evidence'
      evidenceRowCount: number
      selectedTemplateIds: string[]
      canEnterC1913Phase1Selection: boolean
      requiresManualReview: boolean
      writesTaskDependencies: false
      writesPlanDates: false
      writesCriticalPathFacts: false
      t2RhythmScheduleCandidatePackage?: Record<string, unknown>
      t2RhythmScheduleCandidateNetworkEvaluation?: Record<string, unknown>
      durationInputAssembly?: Record<string, unknown>
      conflictCodes?: string[]
    }
    durationInputAssembly?: Record<string, unknown>
    upstreamAssetConsumptionReceipts?: DurationAssetConsumptionReceipt[]
    assetConsumptionReceipts?: DurationAssetConsumptionReceipt[]
    assetConsumptionSummary?: DurationAssetConsumptionSummary
    boundaryPolicy: string[]
  }
}

export interface ProjectRemainingDurationRuntimeArtifactPublication {
  assetKey: DurationRuntimeConsumerObservedArtifact['assetKey']
  publicationKey: string
  publicationStatus?: string | null
  sourceEvidenceRefs?: string[] | null
  observationContext?: Record<string, unknown> | null
}

export interface RecordProjectRemainingDurationForecastRuntimeConsumptionInput {
  queryExec: DurationRuntimeConsumerObservationQueryExec
  forecast: ProjectRemainingDurationForecast
  runtimeArtifactPublications: readonly ProjectRemainingDurationRuntimeArtifactPublication[]
  projectId?: string | null
  observedAt?: string
}

const PROJECT_REMAINING_RUNTIME_CONSUMER_ASSET_KEYS = new Set([
  'forecast_residual_overlay',
  'wbs_reference_days',
  'critical_path_rule_candidate',
])

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

function normalizeDate(value: unknown) {
  const text = normalizeText(value)
  if (!text) return null
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : text.slice(0, 10)
}

function latestDate(dates: Array<string | null | undefined>) {
  return dates
    .map(normalizeDate)
    .filter((date): date is string => Boolean(date))
    .sort((left, right) => signedDurationDayDelta(right, left) ?? 0)
    .at(-1) ?? null
}

function formatDurationDateUtc(date: Date) {
  return date.toISOString().slice(0, 10)
}

function addCalendarDays(date: string | null | undefined, days: number) {
  const anchor = normalizeDurationDateUtc(date)
  if (!anchor || days <= 0) return normalizeDate(date)
  const next = new Date(anchor)
  next.setUTCDate(next.getUTCDate() + days)
  return formatDurationDateUtc(next)
}

function hasConstructionCalendarRules(calendar?: ConstructionCalendarContext | null) {
  return Boolean(calendar?.windows?.length)
}

function addProductionDays(
  anchorDate: string | null | undefined,
  days: number | null | undefined,
  calendar?: ConstructionCalendarContext | null,
) {
  const anchor = normalizeDurationDateUtc(anchorDate)
  const normalizedDays = Math.max(0, Math.ceil(Number(days ?? 0)))
  if (!anchor || normalizedDays <= 0) return normalizeDate(anchorDate)
  if (hasConstructionCalendarRules(calendar)) {
    return addConstructionProductionDays(anchor, normalizedDays, calendar)
  }
  const next = new Date(anchor)
  next.setUTCDate(next.getUTCDate() + normalizedDays - 1)
  return formatDurationDateUtc(next)
}

function addExtraProductionDays(
  date: string | null | undefined,
  days: number,
  calendar?: ConstructionCalendarContext | null,
) {
  if (!date || days <= 0) return normalizeDate(date)
  if (hasConstructionCalendarRules(calendar)) {
    return addProductionDays(date, days + 1, calendar)
  }
  return addCalendarDays(date, days)
}

function projectRemainingDurationDays(
  startDate: string | null | undefined,
  finishDate: string | null | undefined,
  calendar?: ConstructionCalendarContext | null,
) {
  if (!hasConstructionCalendarRules(calendar)) return orderedInclusiveDurationDays(startDate, finishDate) ?? 0
  const start = parseConstructionCalendarDate(startDate)
  const finish = parseConstructionCalendarDate(finishDate)
  if (!start || !finish) return 0
  return productionDaysBetweenInclusive(start, finish, calendar)
}

function projectRemainingGapDays(
  targetEndDate: string | null | undefined,
  forecastFinishDate: string | null | undefined,
  calendar?: ConstructionCalendarContext | null,
) {
  if (!targetEndDate || !forecastFinishDate) return null
  if (!hasConstructionCalendarRules(calendar)) {
    return Math.max(0, signedDurationDayDelta(targetEndDate, forecastFinishDate) ?? 0)
  }
  const target = parseConstructionCalendarDate(targetEndDate)
  const forecast = parseConstructionCalendarDate(forecastFinishDate)
  if (!target || !forecast || forecast <= target) return 0
  const next = new Date(target)
  next.setUTCDate(next.getUTCDate() + 1)
  return productionDaysBetweenInclusive(next, forecast, calendar)
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function readArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function readNumber(value: unknown): number | null {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function isNonEmptyRecord(value: Record<string, unknown>) {
  return Object.keys(value).length > 0
}

function uniqueStrings(values: unknown[]) {
  return [...new Set(values
    .flatMap((value) => Array.isArray(value) ? value : [value])
    .map((value) => normalizeText(value))
    .filter(Boolean))]
}

function firstProjectId(rows: ScheduleAccelerationRow[]) {
  for (const row of rows) {
    const projectId = normalizeText(row.values.project_id ?? row.values.projectId)
    if (projectId) return projectId
  }
  return null
}

function readRowForecastFinish(row: ScheduleAccelerationRow) {
  return normalizeDate(
    row.values.forecast_finish_date
      ?? row.values.forecastFinishDate
      ?? row.values.duration_forecast_finish_date
      ?? readRecord(row.values.durationForecast).forecastFinishDate
      ?? readRecord(row.values.duration_forecast).forecast_finish_date
  )
}

function readRowConfidenceBandFinish(row: ScheduleAccelerationRow) {
  return normalizeDate(
    row.values.forecast_p80_finish_date
      ?? row.values.forecastP80FinishDate
      ?? row.values.forecast_confidence_band_finish_date
      ?? readRecord(row.values.durationForecast).forecastP80FinishDate
      ?? readRecord(row.values.duration_forecast).forecast_p80_finish_date,
  )
}

function readRowOptimisticBandFinish(row: ScheduleAccelerationRow) {
  return normalizeDate(
    row.values.forecast_p20_finish_date
      ?? row.values.forecastP20FinishDate
      ?? row.values.forecast_optimistic_band_finish_date
      ?? readRecord(row.values.durationForecast).forecastP20FinishDate
      ?? readRecord(row.values.duration_forecast).forecast_p20_finish_date,
  )
}

function addProductionDaysOrNull(
  date: string | null | undefined,
  days: number | null | undefined,
  calendar?: ConstructionCalendarContext | null,
) {
  if (!date || days == null || days <= 0) return null
  return addProductionDays(date, days, calendar)
}

function orderCriticalBandFinishDates(
  row: ScheduleAccelerationRow,
  asOfDate: string,
  calendar?: ConstructionCalendarContext | null,
): {
  optimisticBandFinishDate: string | null
  medianFinishDate: string | null
  confidenceBandFinishDate: string | null
  warnings: DurationPlausibilityWarning[]
} {
  const medianFinish = readRowGoverningFinish(row, asOfDate, calendar)
  const optimisticFinish = readRowOptimisticBandFinish(row)
  const confidenceFinish = readRowConfidenceBandFinish(row)
  if (!medianFinish && !optimisticFinish && !confidenceFinish) {
    return {
      optimisticBandFinishDate: null,
      medianFinishDate: null,
      confidenceBandFinishDate: null,
      warnings: [],
    }
  }
  const optimisticDays = optimisticFinish ? projectRemainingDurationDays(asOfDate, optimisticFinish, calendar) : null
  const medianDays = medianFinish ? projectRemainingDurationDays(asOfDate, medianFinish, calendar) : null
  const confidenceDays = confidenceFinish ? projectRemainingDurationDays(asOfDate, confidenceFinish, calendar) : null
  const ordered = orderDurationBand({
    engineCode: 'project_remaining_forecast',
    p20Days: optimisticDays,
    p50Days: medianDays,
    p80Days: confidenceDays,
    taskId: row.clientRowId,
  })
  return {
    optimisticBandFinishDate: addProductionDaysOrNull(asOfDate, ordered.band.p20Days, calendar),
    medianFinishDate: addProductionDaysOrNull(asOfDate, ordered.band.p50Days, calendar) ?? medianFinish,
    confidenceBandFinishDate: addProductionDaysOrNull(asOfDate, ordered.band.p80Days, calendar),
    warnings: ordered.warnings,
  }
}

function readRowRemainingDurationDays(row: ScheduleAccelerationRow) {
  return readNumber(
    row.values.remaining_duration_days
      ?? row.values.remainingDurationDays
      ?? row.values.forecast_remaining_days
      ?? row.values.duration_forecast_remaining_days
      ?? readRecord(row.values.durationForecast).remainingDurationDays
      ?? readRecord(row.values.duration_forecast).remaining_duration_days,
  )
}

function readRowCriticalPathSpanDays(row: ScheduleAccelerationRow) {
  return readNumber(
    row.values.critical_path_span_days
      ?? row.values.criticalPathSpanDays
      ?? readRecord(row.values.durationForecast).criticalPathSpanDays
      ?? readRecord(row.values.duration_forecast).critical_path_span_days,
  )
}

function readRowGoverningFinish(
  row: ScheduleAccelerationRow,
  asOfDate?: string | null,
  calendar?: ConstructionCalendarContext | null,
) {
  const forecastFinish = readRowForecastFinish(row)
  if (forecastFinish) return forecastFinish

  const remainingDays = readRowRemainingDurationDays(row)
  if (remainingDays !== null && remainingDays > 0 && normalizeDate(asOfDate)) {
    return addProductionDays(asOfDate, remainingDays, calendar)
  }

  return normalizeDate(
    row.values.planned_finish_date
      ?? row.values.planned_end_date
      ?? row.values.end_date,
  )
}

function readRowForecastSources(row: ScheduleAccelerationRow) {
  const durationForecast = readRecord(row.values.durationForecast)
  const snakeDurationForecast = readRecord(row.values.duration_forecast)
  return readRecord(
    durationForecast.forecastSources
      ?? durationForecast.forecast_sources
      ?? snakeDurationForecast.forecastSources
      ?? snakeDurationForecast.forecast_sources
      ?? row.values.forecastSources
      ?? row.values.forecast_sources,
  )
}

function buildT2RhythmScheduleEvidence(rows: ScheduleAccelerationRow[]) {
  let evidenceRowCount = 0
  let t2RhythmScheduleCandidatePackage: Record<string, unknown> | null = null
  let t2RhythmScheduleCandidateNetworkEvaluation: Record<string, unknown> | null = null
  let durationInputAssembly: Record<string, unknown> | null = null
  const selectedTemplateIds: unknown[] = []
  const conflictCodes: unknown[] = []

  for (const row of rows) {
    const sources = readRowForecastSources(row)
    const rowPackage = readRecord(
      sources.t2RhythmScheduleCandidatePackage
        ?? sources.t2_rhythm_schedule_candidate_package,
    )
    const rowEvaluation = readRecord(
      sources.t2RhythmScheduleCandidateNetworkEvaluation
        ?? sources.t2_rhythm_schedule_candidate_network_evaluation,
    )
    const rowAssembly = readRecord(
      sources.durationInputAssembly
        ?? sources.duration_input_assembly,
    )
    const hasT2Evidence = isNonEmptyRecord(rowPackage)
      || isNonEmptyRecord(rowEvaluation)
      || isNonEmptyRecord(rowAssembly)
    if (!hasT2Evidence) continue

    evidenceRowCount += 1
    if (!t2RhythmScheduleCandidatePackage && isNonEmptyRecord(rowPackage)) {
      t2RhythmScheduleCandidatePackage = rowPackage
    }
    if (!t2RhythmScheduleCandidateNetworkEvaluation && isNonEmptyRecord(rowEvaluation)) {
      t2RhythmScheduleCandidateNetworkEvaluation = rowEvaluation
    }
    if (!durationInputAssembly && isNonEmptyRecord(rowAssembly)) {
      durationInputAssembly = rowAssembly
    }

    selectedTemplateIds.push(rowPackage.selectedTemplateIds)
    selectedTemplateIds.push(readRecord(rowEvaluation.scheduleTrustEvidence).selectedTemplateIds)
    selectedTemplateIds.push(readRecord(readRecord(rowAssembly.inputChannels).t2RhythmScheduleCandidatePackage).selectedTemplateIds)
    conflictCodes.push(readRecord(rowAssembly.assemblyGate).conflictCodes)
  }

  if (evidenceRowCount <= 0) return null

  const assemblyGate = readRecord(durationInputAssembly?.assemblyGate)
  const evaluationCanEnter = t2RhythmScheduleCandidateNetworkEvaluation?.canEnterC1913Phase1Selection === true
  const assemblyCanEnter = assemblyGate.canEnterC1913Phase1Selection === true
  const normalizedConflictCodes = uniqueStrings(conflictCodes)
  const requiresManualReview = assemblyGate.requiresManualReview === true
    || normalizeText(t2RhythmScheduleCandidatePackage?.status) === 'candidate_conflict'
    || normalizeText(t2RhythmScheduleCandidateNetworkEvaluation?.status) === 'candidate_conflict'
    || normalizedConflictCodes.length > 0

  return {
    source: 'project_remaining_duration_forecast_e4_row_evidence' as const,
    evidenceMode: 'row_projection_only' as const,
    evidenceRowCount,
    selectedTemplateIds: uniqueStrings(selectedTemplateIds),
    canEnterC1913Phase1Selection: (assemblyCanEnter || evaluationCanEnter) && !requiresManualReview,
    releaseEvidenceReady: false,
    missingReleaseEvidenceReasons: [
      'archived_phase1_selector_replay_required',
      'runtime_publication_evidence_required',
    ],
    requiresManualReview,
    writesTaskDependencies: false as const,
    writesPlanDates: false as const,
    writesCriticalPathFacts: false as const,
    ...(t2RhythmScheduleCandidatePackage ? { t2RhythmScheduleCandidatePackage } : {}),
    ...(t2RhythmScheduleCandidateNetworkEvaluation ? { t2RhythmScheduleCandidateNetworkEvaluation } : {}),
    ...(durationInputAssembly ? { durationInputAssembly } : {}),
    ...(normalizedConflictCodes.length > 0 ? { conflictCodes: normalizedConflictCodes } : {}),
  }
}

function readRuntimeDurationInputAssembly(runtimeExecutionFacts?: RuntimeExecutionFacts | null) {
  const runtime = readRecord(runtimeExecutionFacts)
  const t2Evidence = readRecord(
    runtime.t2RhythmScheduleEvidence
      ?? runtime.t2_rhythm_schedule_evidence,
  )
  return readRecord(
    t2Evidence.durationInputAssembly
      ?? t2Evidence.duration_input_assembly,
  )
}

function readExternalGateFinishDate(
  row: ScheduleAccelerationRow,
  asOfDate: string,
  calendar?: ConstructionCalendarContext | null,
) {
  const explicitFinishDate = normalizeDate(
    row.values.forecast_finish_date
      ?? row.values.forecastFinishDate
      ?? row.values.duration_forecast_finish_date
      ?? readRecord(row.values.durationForecast).forecastFinishDate
      ?? readRecord(row.values.duration_forecast).forecast_finish_date
      ?? row.values.planned_finish_date
      ?? row.values.planned_end_date
      ?? row.values.end_date,
  )
  const remainingDays = readRowRemainingDurationDays(row)
  const remainingFinishDate = remainingDays !== null && remainingDays > 0
    ? addProductionDays(asOfDate, remainingDays, calendar)
    : null
  return latestDate([explicitFinishDate, remainingFinishDate])
}

function readExternalGateRemainingDays(
  row: ScheduleAccelerationRow,
  asOfDate: string,
  calendar?: ConstructionCalendarContext | null,
) {
  const explicitRemainingDays = readRowRemainingDurationDays(row)
  if (explicitRemainingDays !== null && explicitRemainingDays > 0) return Math.ceil(explicitRemainingDays)

  const finishDate = readRowGoverningFinish(row, asOfDate, calendar)
  if (!finishDate) return 0
  const plannedStartDate = normalizeDate(row.values.planned_start_date ?? row.values.start_date)
  const startDate = plannedStartDate && (signedDurationDayDelta(asOfDate, plannedStartDate) ?? 0) > 0
    ? plannedStartDate
    : asOfDate
  return projectRemainingDurationDays(startDate, finishDate, calendar)
}

function readExplicitExternalGateFinishDate(row: ScheduleAccelerationRow) {
  return normalizeDate(
    row.values.forecast_finish_date
      ?? row.values.forecastFinishDate
      ?? row.values.duration_forecast_finish_date
      ?? readRecord(row.values.durationForecast).forecastFinishDate
      ?? readRecord(row.values.duration_forecast).forecast_finish_date
      ?? row.values.planned_finish_date
      ?? row.values.planned_end_date
      ?? row.values.end_date,
  )
}

function computeCriticalMergeBiasDays(
  rows: ScheduleAccelerationRow[],
  asOfDate: string,
  calendar?: ConstructionCalendarContext | null,
) {
  const evaluatedCriticalChainCount = rows.length
  const spreads = rows
    .map((row) => {
      const medianFinish = readRowGoverningFinish(row, asOfDate, calendar)
      const confidenceFinish = readRowConfidenceBandFinish(row)
      if (!medianFinish || !confidenceFinish) return null
      const spread = projectRemainingGapDays(medianFinish, confidenceFinish, calendar)
      return spread !== null && spread > 0 ? spread : null
    })
    .filter((value): value is number => value !== null)

  if (spreads.length <= 1) {
    return {
      mergeBiasDays: 0,
      mergeBiasChainCount: spreads.length,
      evaluatedCriticalChainCount,
      confidenceBandAvailableCount: spreads.length,
      confidenceBandMissingCount: Math.max(0, evaluatedCriticalChainCount - spreads.length),
    }
  }

  const averageSpread = spreads.reduce((sum, value) => sum + value, 0) / spreads.length
  const mergeFactor = Math.min(0.5, Math.max(0.15, Math.log2(spreads.length) / 4))
  return {
    mergeBiasDays: Math.max(1, Math.ceil(averageSpread * mergeFactor)),
    mergeBiasChainCount: spreads.length,
    evaluatedCriticalChainCount,
    confidenceBandAvailableCount: spreads.length,
    confidenceBandMissingCount: Math.max(0, evaluatedCriticalChainCount - spreads.length),
  }
}

function readRowProbabilityDuration(row: ScheduleAccelerationRow) {
  const durationForecast = readRecord(row.values.durationForecast)
  const snakeDurationForecast = readRecord(row.values.duration_forecast)
  return readRecord(
    row.values.probabilityDuration
      ?? row.values.probability_duration
      ?? durationForecast.probabilityDuration
      ?? durationForecast.probability_duration
      ?? snakeDurationForecast.probabilityDuration
      ?? snakeDurationForecast.probability_duration,
  )
}

function readRowProbabilityRemainingDays(
  row: ScheduleAccelerationRow,
  percentile: 'p20' | 'p50' | 'p80',
) {
  const probability = readRowProbabilityDuration(row)
  const keys = percentile === 'p20'
    ? ['p20RemainingDays', 'p20_remaining_days']
    : percentile === 'p50'
      ? ['p50RemainingDays', 'p50_remaining_days']
      : ['p80RemainingDays', 'p80_remaining_days']
  for (const key of keys) {
    const value = readNumber(probability[key])
    if (value !== null && value > 0) return value
  }
  return percentile === 'p50' ? readRowRemainingDurationDays(row) : null
}

function releaseOffsetDays(
  row: ScheduleAccelerationRow,
  asOfDate: string,
  calendar?: ConstructionCalendarContext | null,
) {
  const plannedStart = normalizeDate(row.values.planned_start_date ?? row.values.start_date)
  if (!plannedStart || (signedDurationDayDelta(asOfDate, plannedStart) ?? 0) <= 0) return 0
  return Math.max(0, projectRemainingDurationDays(asOfDate, plannedStart, calendar) - 1)
}

function buildNetworkProbability(params: {
  rows: ScheduleAccelerationRow[]
  projectId: string | null
  asOfDate: string
  calendar?: ConstructionCalendarContext | null
}) {
  const rowIds = new Set(params.rows.map((row) => row.clientRowId))
  const tasks = params.rows.map((row) => ({
    id: row.clientRowId,
    p20Days: readRowProbabilityRemainingDays(row, 'p20'),
    p50Days: readRowProbabilityRemainingDays(row, 'p50'),
    p80Days: readRowProbabilityRemainingDays(row, 'p80'),
    releaseOffsetDays: releaseOffsetDays(row, params.asOfDate, params.calendar),
  }))
  const dependencies = params.rows.flatMap((row) => row.predecessorDependencies
    .filter((dependency) => rowIds.has(dependency.clientRowId))
    .map((dependency) => ({
      predecessorTaskId: dependency.clientRowId,
      successorTaskId: row.clientRowId,
      dependencyType: dependency.dependencyType,
      lagDays: dependency.lagDays,
    })))
  return simulateDurationNetworkProbability({
    seed: [
      params.projectId ?? 'no_project',
      params.asOfDate,
      ...tasks.map((task) => task.id).sort(),
    ].join(':'),
    tasks,
    dependencies,
    simulationCount: 1000,
    scenarioCorrelation: 0.35,
  })
}

function buildConfidenceBandDecision(params: {
  deterministicFinishDate: string | null
  mergeBiasedFinishDate: string | null
  confidenceBandFinishDate: string | null
  mergeBias: ReturnType<typeof computeCriticalMergeBiasDays>
  probabilityBasis: 'monte_carlo' | 'pert_analytic'
}) {
  const mergeBiasApplied = Number(params.mergeBias.mergeBiasDays ?? 0) > 0
  const governingCandidates = [
    { source: 'deterministic_finish' as const, date: params.deterministicFinishDate },
    { source: 'merge_bias' as const, date: mergeBiasApplied ? params.mergeBiasedFinishDate : null },
    { source: 'confidence_band' as const, date: params.confidenceBandFinishDate },
  ].filter((item): item is { source: 'confidence_band' | 'merge_bias' | 'deterministic_finish'; date: string } => Boolean(item.date))

  const governing = governingCandidates
    .sort((left, right) => signedDurationDayDelta(right.date, left.date) ?? 0)
    .at(-1) ?? { source: 'deterministic_finish' as const, date: params.deterministicFinishDate }

  const hasConfidenceBand = Boolean(params.confidenceBandFinishDate)
  const status = hasConfidenceBand
    ? governing.source === 'confidence_band' ? 'applied' as const : 'observed' as const
    : params.mergeBias.evaluatedCriticalChainCount > 1 ? 'missing_confidence_band' as const : 'not_applicable' as const

  return {
    status,
    governingFinishSource: governing.source,
    governingFinishDate: governing.date ?? params.deterministicFinishDate,
    mergeBiasApplied,
    confidenceBandAvailableCount: params.mergeBias.confidenceBandAvailableCount,
    confidenceBandMissingCount: params.mergeBias.confidenceBandMissingCount,
    probabilityBasis: params.probabilityBasis,
  }
}

function readRowStatus(row: ScheduleAccelerationRow) {
  return normalizeText(row.values.status).toLowerCase()
}

function isCompletedRow(row: ScheduleAccelerationRow) {
  const progress = readNumber(row.values.progress)
  return readRowStatus(row) === 'completed'
    || normalizeDate(row.values.actual_end_date) !== null
    || (progress !== null && progress >= 100)
}

function isScheduleRow(row: ScheduleAccelerationRow) {
  const metadata = readRecord(row.values.standard_task_metadata ?? row.values.metadata)
  const summaryValue = row.values.is_wbs_summary ?? metadata.isWbsSummary ?? metadata.is_wbs_summary
  const isSummary = summaryValue === true
    || summaryValue === 1
    || normalizeText(summaryValue).toLowerCase() === 'true'
  const durationContributionMode = normalizeText(
    row.values.duration_contribution_mode ?? metadata.durationContributionMode ?? metadata.duration_contribution_mode,
  )
  const mode = normalizeText(row.rowProjectionMode ?? row.values.row_projection_mode ?? metadata.rowProjectionMode ?? metadata.row_projection_mode)
  return !(isSummary && durationContributionMode === 'record_only') && (!mode || mode === 'schedule_row')
}

function isCriticalOrNearCriticalRow(row: ScheduleAccelerationRow) {
  const totalFloat = readNumber(row.values.total_float_days)
  const freeFloat = readNumber(row.values.free_float_days)
  return (totalFloat !== null && totalFloat <= 3)
    || (freeFloat !== null && freeFloat <= 1)
}

type GateRelationKind = 'parallel_wait' | 'start_gate' | 'finish_gate' | 'handover_gate' | 'mixed_gate'

function deriveExternalGateRelation(row: ScheduleAccelerationRow): GateRelationKind | null {
  const metadata = readRecord(row.values.standard_task_metadata ?? row.values.metadata)
  const contributionMode = normalizeText(row.values.duration_contribution_mode ?? metadata.durationContributionMode ?? metadata.duration_contribution_mode).toLowerCase()
  const constraintType = normalizeText(metadata.constraintType ?? metadata.constraint_type).toLowerCase()
  const gateRelation = normalizeText(
    row.values.gateRelation
      ?? row.values.gate_relation
      ?? metadata.gateRelation
      ?? metadata.gate_relation
      ?? metadata.internalFlowRelationKind
      ?? metadata.internal_flow_relation_kind,
  ).toLowerCase()
  const externalInterfaces = [
    ...readArray(metadata.externalInterfaceCodes),
    ...readArray(metadata.external_interface_codes),
    ...readArray(row.values.externalInterfaceCodes),
    ...readArray(row.values.external_interface_codes),
  ].map(normalizeText).filter(Boolean)
  const hardConstraints = [
    ...readArray(metadata.hardConstraintCodes),
    ...readArray(metadata.hard_constraint_codes),
  ].map(normalizeText).filter(Boolean)
  const documentEvidenceRole = normalizeText(
    row.values.documentEvidenceRole
      ?? row.values.document_evidence_role
      ?? metadata.documentEvidenceRole
      ?? metadata.document_evidence_role,
  ).toLowerCase()
  const blockingLevel = normalizeText(
    row.values.blockingLevel
      ?? row.values.blocking_level
      ?? metadata.blockingLevel
      ?? metadata.blocking_level,
  ).toLowerCase()
  const certificateType = normalizeText(
    row.values.certificateType
      ?? row.values.certificate_type
      ?? metadata.certificateType
      ?? metadata.certificate_type,
  ).toLowerCase()

  const relationText = [
    contributionMode,
    gateRelation,
    constraintType,
    documentEvidenceRole,
    blockingLevel,
    certificateType,
    normalizeText(row.values.title),
    ...externalInterfaces,
    ...hardConstraints,
  ].join(' ').toLowerCase()
  const finishSignalText = [
    contributionMode,
    gateRelation,
    constraintType,
    documentEvidenceRole,
    blockingLevel,
    certificateType,
    ...externalInterfaces,
    ...hardConstraints,
  ].join(' ').toLowerCase()

  const hasExplicitStartGateSignals = [
    'start_gate',
    'startup_gate',
    'commencement',
    'precondition',
    'pre_start',
  ].some((term) => gateRelation.includes(term) || blockingLevel.includes(term))
    || (certificateType.includes('construction_permit') && blockingLevel.includes('startup'))
    || (certificateType.includes('construction_permit') && gateRelation.includes('startup'))

  const hasExplicitHandoverGateSignals = [
    'handover_gate',
    'handover_marker',
    'handover_document',
    'document_transfer',
    'archive_transfer',
  ].some((term) => gateRelation.includes(term)
      || contributionMode.includes(term)
      || documentEvidenceRole.includes(term)
      || constraintType.includes(term))
    || row.values.handover_required === true
    || metadata.handoverRequired === true
    || metadata.handover_required === true

  const hasFinishGateSignals = [
    'acceptance',
    'delivery_acceptance',
    'final_acceptance',
    'closeout',
    'completion',
    'certificate_issue',
    'certificate_acceptance',
  ].some((term) => finishSignalText.includes(term))
    || row.values.acceptance_required === true
    || metadata.acceptanceRequired === true
    || metadata.acceptance_required === true

  const hasParallelWaitSignals = [
    'approval_wait',
    'external_wait',
    'material_wait',
    'certificate_wait',
    'interface_wait',
    'outbound_wait',
    'utility_wait',
  ].some((term) => relationText.includes(term))
    || row.values.material_required === true
    || metadata.materialRequired === true
    || metadata.material_required === true
    || (!hasFinishGateSignals && relationText.includes('external'))

  if (hasExplicitStartGateSignals && !hasFinishGateSignals && !hasExplicitHandoverGateSignals) return 'start_gate'
  if (hasExplicitHandoverGateSignals && !hasFinishGateSignals && !hasParallelWaitSignals) return 'handover_gate'
  if (!hasFinishGateSignals && !hasParallelWaitSignals && !hasExplicitHandoverGateSignals) return null
  if (hasExplicitHandoverGateSignals && hasParallelWaitSignals) return 'mixed_gate'
  if (hasFinishGateSignals && hasParallelWaitSignals && (
    row.values.acceptance_required === true
    || metadata.acceptanceRequired === true
    || metadata.acceptance_required === true
  )) return 'mixed_gate'
  if (hasExplicitHandoverGateSignals) return 'handover_gate'
  if (hasFinishGateSignals) return 'finish_gate'
  return 'parallel_wait'
}

function isExternalHardGateRow(row: ScheduleAccelerationRow) {
  return deriveExternalGateRelation(row) !== null
}

function isFinishGateRow(row: ScheduleAccelerationRow) {
  return deriveExternalGateRelation(row) === 'finish_gate'
}

function isParallelWaitGateRow(row: ScheduleAccelerationRow) {
  return deriveExternalGateRelation(row) === 'parallel_wait'
}

function isStartGateRow(row: ScheduleAccelerationRow) {
  return deriveExternalGateRelation(row) === 'start_gate'
}

function isHandoverGateRow(row: ScheduleAccelerationRow) {
  return deriveExternalGateRelation(row) === 'handover_gate'
}

function isMixedGateRow(row: ScheduleAccelerationRow) {
  return deriveExternalGateRelation(row) === 'mixed_gate'
}

function applyFreshCriticalPathSnapshotToRows(
  rows: ScheduleAccelerationRow[],
  snapshot: CriticalPathSnapshot | null | undefined,
) {
  if (!snapshot || snapshot.calculationStatus !== 'fresh') return rows
  const criticalTaskIds = new Set([
    ...(snapshot.displayTaskIds ?? []),
    ...(snapshot.autoTaskIds ?? []),
  ].map(normalizeText).filter(Boolean))
  const criticalTaskById = new Map((snapshot.tasks ?? []).map((task) => [normalizeText(task.taskId), task]))
  if (criticalTaskIds.size === 0 && criticalTaskById.size === 0) return rows

  return rows.map((row) => {
    const taskId = normalizeText(row.clientRowId)
    const criticalTask = criticalTaskById.get(taskId)
    const isCritical = criticalTaskIds.has(taskId)
    return {
      ...row,
      values: {
        ...row.values,
        is_critical: isCritical,
        total_float_days: criticalTask?.floatDays ?? (isCritical ? 0 : undefined),
        free_float_days: isCritical ? 0 : undefined,
      },
    }
  })
}

function buildDurationOutputContractSummary() {
  const contract = getDurationOutputContract('project_remaining_forecast')
  if (!contract) return null
  return {
    code: contract.code,
    semanticFieldName: contract.semanticFieldName,
    ownerService: contract.ownerService,
    algorithmFactContextPhase: contract.algorithmFactContextPhase,
    allowedWriteTargets: contract.allowedWriteTargets,
    boundaryPolicy: contract.boundaryPolicy,
  }
}

function normalizeFactRole(value: unknown): 'primary' | 'background' {
  return value === 'primary' ? 'primary' : 'background'
}

export function buildProjectRemainingDurationForecastConsumedArtifacts(input: {
  forecast: ProjectRemainingDurationForecast
  runtimeArtifactPublications: readonly ProjectRemainingDurationRuntimeArtifactPublication[]
  projectId?: string | null
}): DurationRuntimeConsumerObservedArtifact[] {
  const projectId = normalizeText(input.projectId)
  return input.runtimeArtifactPublications
    .filter((publication) => PROJECT_REMAINING_RUNTIME_CONSUMER_ASSET_KEYS.has(publication.assetKey))
    .filter((publication) => normalizeText(publication.publicationKey))
    .map((publication) => ({
      assetKey: publication.assetKey,
      publicationKey: normalizeText(publication.publicationKey),
      publicationStatus: publication.publicationStatus,
      sourceEvidenceRefs: publication.sourceEvidenceRefs,
      observationContext: {
        ...(publication.observationContext ?? {}),
        projectId: projectId || null,
        durationOutputCode: input.forecast.durationOutputCode,
        forecastFinishDate: input.forecast.forecastFinishDate,
        projectRemainingForecastDays: input.forecast.projectRemainingForecastDays,
      },
    }))
}

export function recordProjectRemainingDurationForecastRuntimeConsumption(
  input: RecordProjectRemainingDurationForecastRuntimeConsumptionInput,
): Promise<DurationRuntimeConsumerFacadeArtifactsResult> {
  const projectId = normalizeText(input.projectId)
  return recordProjectRemainingDurationForecastConsumedArtifacts({
    queryExec: input.queryExec,
    observedAt: input.observedAt,
    callContext: {
      projectId: projectId || null,
      durationOutputCode: input.forecast.durationOutputCode,
      forecastFinishDate: input.forecast.forecastFinishDate,
      projectRemainingForecastDays: input.forecast.projectRemainingForecastDays,
    },
    sourceEvidenceRefs: [
      [
        'project_remaining_forecast',
        projectId || 'no_project',
        input.forecast.forecastFinishDate ?? 'no_finish',
      ].join(':'),
    ],
    artifacts: buildProjectRemainingDurationForecastConsumedArtifacts({
      forecast: input.forecast,
      runtimeArtifactPublications: input.runtimeArtifactPublications,
      projectId,
    }),
  })
}

export function buildProjectRemainingForecastPredictionEvent(input: {
  forecast: ProjectRemainingDurationForecast
  rows: ScheduleAccelerationRow[]
  asOfDate: string
  projectId?: string | null
  constructionCalendar?: ConstructionCalendarContext | null
}): DurationAccuracyPredictionInput {
  const rowIds = input.rows.map((row) => normalizeText(row.clientRowId)).filter(Boolean)
  const projectId = normalizeText(input.projectId) || firstProjectId(input.rows)
  return {
    engineCode: 'project_remaining_forecast',
    outputKind: 'project_remaining_forecast',
    projectId,
    dedupeKey: [
      projectId ?? 'no_project',
      input.asOfDate,
      'project_remaining_forecast',
    ].join(':'),
    predictionBasis: 'runtime_project_remaining_forecast',
    predictionSource: 'projectRemainingDurationForecastService',
    modelVersion: 'project_remaining_forecast_v1',
    predictedAt: input.asOfDate,
    predictedStartDate: input.asOfDate,
    predictedFinishDate: input.forecast.forecastFinishDate,
    predictedDurationDays: input.forecast.projectRemainingForecastDays,
    runtimeConsumptionState: 'runtime_snapshot',
    seedLineage: {
      durationOutputCode: input.forecast.durationOutputCode,
      durationOutputSemanticFieldName: input.forecast.durationOutputSemanticFieldName,
      durationOutputContract: input.forecast.durationOutputContract ?? null,
    },
    networkLineage: {
      rowCount: input.forecast.rowsEvaluated,
      rowIds,
      criticalRemainingTaskCount: input.forecast.calculationContext.criticalPath.remainingTaskCount,
      latestCriticalFinishDate: input.forecast.calculationContext.criticalPath.latestCriticalFinishDate,
      optimisticBandFinishDate: input.forecast.calculationContext.criticalPath.optimisticBandFinishDate ?? null,
      confidenceBandFinishDate: input.forecast.calculationContext.criticalPath.confidenceBandFinishDate ?? null,
      criticalPathSpanFinishDate: input.forecast.calculationContext.criticalPath.criticalPathSpanFinishDate ?? null,
      externalHardGateCount: input.forecast.calculationContext.externalInterfaces.hardGateCount,
      latestGateFinishDate: input.forecast.calculationContext.externalInterfaces.latestGateFinishDate,
      serialRemainingDays: input.forecast.calculationContext.externalInterfaces.serialRemainingDays ?? 0,
      serializedGateFinishDate: input.forecast.calculationContext.externalInterfaces.serializedGateFinishDate ?? null,
      activeMonthlyCommitmentCount: input.forecast.calculationContext.monthlyCommitments.activeCommitmentCount,
      carryoverMonthlyCommitmentCount: input.forecast.calculationContext.monthlyCommitments.carryoverCommitmentCount,
      latestCommitmentFinishDate: input.forecast.calculationContext.monthlyCommitments.latestCommitmentFinishDate,
    },
    predictionContext: {
      sourceService: 'projectRemainingDurationForecastService',
      durationOutputCode: input.forecast.durationOutputCode,
      durationDayUnit: 'construction_production_day',
      constructionCalendar: input.constructionCalendar ?? null,
      projectRemainingForecastDays: input.forecast.projectRemainingForecastDays,
      targetGapDays: input.forecast.targetGapDays,
      calculationContext: input.forecast.calculationContext,
    },
  }
}

function computeRuntimePressureExtraDays(
  runtimeExecutionFacts: RuntimeExecutionFacts | null | undefined,
  criticalRemainingCount: number,
) {
  if (!runtimeExecutionFacts || criticalRemainingCount <= 0) return 0
  const pressureScore = readNumber(runtimeExecutionFacts.resourcePressureScore)
  const progressRatio = readNumber(runtimeExecutionFacts.progressCompletionRatio)
  const criticalFactCount = readNumber(runtimeExecutionFacts.criticalOrNearCriticalTaskCount)
  if (pressureScore === null || progressRatio === null) return 0
  if (pressureScore <= 10 || progressRatio >= 0.3) return 0
  const effectiveCriticalCount = Math.max(criticalRemainingCount, Math.ceil(criticalFactCount ?? 0))
  if (effectiveCriticalCount <= 0) return 0
  return Math.max(1, Math.ceil((pressureScore - 10) / 5))
}

export function buildProjectRemainingDurationForecast(params: {
  rows: ScheduleAccelerationRow[]
  asOfDate?: string | null
  targetEndDate?: string | null
  projectId?: string | null
  criticalPathSnapshot?: CriticalPathSnapshot | null
  runtimeExecutionFacts?: RuntimeExecutionFacts | null
  monthlyCommitments?: ProjectMonthlyCommitmentSummary | null
  constructionCalendar?: ConstructionCalendarContext | null
  predictionEventRecorder?: (event: DurationAccuracyPredictionInput) => void
  runtimeConsumerObservationQueryExec?: DurationRuntimeConsumerObservationQueryExec | null
  runtimeArtifactPublications?: readonly ProjectRemainingDurationRuntimeArtifactPublication[] | null
  runtimeConsumerObservedAt?: string | null
  runtimeConsumerErrorHandler?: (error: unknown) => void
}): ProjectRemainingDurationForecast {
  const asOfDate = normalizeDate(params.asOfDate) ?? new Date().toISOString().slice(0, 10)
  const constructionCalendar = params.constructionCalendar ?? null
  const scheduleRows = applyFreshCriticalPathSnapshotToRows(params.rows.filter(isScheduleRow), params.criticalPathSnapshot)
  const remainingRows = scheduleRows.filter((row) => !isCompletedRow(row))
  const criticalRows = remainingRows.filter(isCriticalOrNearCriticalRow)
  const externalGateRows = remainingRows.filter(isExternalHardGateRow)
  const internalRemainingRows = remainingRows.filter((row) => !isExternalHardGateRow(row))
  const internalCriticalRows = criticalRows.filter((row) => !isExternalHardGateRow(row))
  const criticalBandOrders = internalCriticalRows.map((row) => orderCriticalBandFinishDates(row, asOfDate, constructionCalendar))
  const durationPlausibilityWarnings: DurationPlausibilityWarning[] = criticalBandOrders.flatMap((item) => item.warnings)
  const monthlyCommitments = params.monthlyCommitments ?? {}
  const gateRelationByRow = new Map<ScheduleAccelerationRow, GateRelationKind>()
  for (const row of externalGateRows) {
    const relation = deriveExternalGateRelation(row)
    if (relation) gateRelationByRow.set(row, relation)
  }
  const relationKinds = Array.from(new Set(Array.from(gateRelationByRow.values())))
  const parallelGateRows = externalGateRows.filter((row) => isParallelWaitGateRow(row) || isMixedGateRow(row))
  const startGateRows = externalGateRows.filter(isStartGateRow)
  const finishGateRows = externalGateRows.filter((row) => isFinishGateRow(row) || isMixedGateRow(row))
  const handoverGateRows = externalGateRows.filter(isHandoverGateRow)
  const latestRemainingFinishDate = latestDate(internalRemainingRows.map((row) => readRowGoverningFinish(row, asOfDate, constructionCalendar)))
  const latestCriticalFinishDate = latestDate(internalCriticalRows.map((row) => readRowGoverningFinish(row, asOfDate, constructionCalendar)))
  const optimisticBandFinishDate = latestDate(criticalBandOrders.map((item) => item.optimisticBandFinishDate))
  const confidenceBandFinishDate = latestDate(criticalBandOrders.map((item) => item.confidenceBandFinishDate))
  const criticalPathSpanDays = internalCriticalRows
    .map(readRowCriticalPathSpanDays)
    .filter((days): days is number => days !== null && days > 0)
  const criticalPathSpanFinishDate = criticalPathSpanDays.length > 0
    ? addProductionDays(asOfDate, Math.max(...criticalPathSpanDays), constructionCalendar)
    : null
  const latestGateFinishDate = latestDate(externalGateRows.map((row) => readExternalGateFinishDate(row, asOfDate, constructionCalendar)))
  const latestParallelGateFinishDate = latestDate(parallelGateRows.map((row) => readExternalGateFinishDate(row, asOfDate, constructionCalendar)))
  const latestStartGateFinishDate = latestDate(startGateRows.map((row) => readExternalGateFinishDate(row, asOfDate, constructionCalendar)))
  const latestFinishGateFinishDate = latestDate(finishGateRows.map((row) => readExplicitExternalGateFinishDate(row)))
  const latestCommitmentFinishDate = normalizeDate(monthlyCommitments.latestCommitmentFinishDate)
  const networkProbabilityResult = buildNetworkProbability({
    rows: internalRemainingRows,
    projectId: normalizeText(params.projectId) || firstProjectId(scheduleRows),
    asOfDate,
    calendar: constructionCalendar,
  })
  const monteCarloApplied = networkProbabilityResult.probabilityBasis === 'monte_carlo'
    && networkProbabilityResult.p20DurationDays !== null
    && networkProbabilityResult.p50DurationDays !== null
    && networkProbabilityResult.p80DurationDays !== null
  const networkP20FinishDate = monteCarloApplied
    ? addProductionDays(asOfDate, networkProbabilityResult.p20DurationDays, constructionCalendar)
    : null
  const networkP50FinishDate = monteCarloApplied
    ? addProductionDays(asOfDate, networkProbabilityResult.p50DurationDays, constructionCalendar)
    : null
  const networkP80FinishDate = monteCarloApplied
    ? addProductionDays(asOfDate, networkProbabilityResult.p80DurationDays, constructionCalendar)
    : null
  const analyticMergeBias = computeCriticalMergeBiasDays(internalCriticalRows, asOfDate, constructionCalendar)
  const mergeBias = monteCarloApplied
    ? {
        ...analyticMergeBias,
        mergeBiasDays: 0,
        mergeBiasChainCount: 0,
      }
    : analyticMergeBias
  const deterministicInternalFinishDate = latestDate([
    latestRemainingFinishDate,
    latestCriticalFinishDate,
    criticalPathSpanFinishDate,
    networkP50FinishDate,
    asOfDate,
  ])
  const mergeBiasedFinishDate = mergeBias.mergeBiasDays > 0
    ? addExtraProductionDays(deterministicInternalFinishDate, mergeBias.mergeBiasDays, constructionCalendar)
    : deterministicInternalFinishDate
  const confidenceBandDecision = buildConfidenceBandDecision({
    deterministicFinishDate: deterministicInternalFinishDate,
    mergeBiasedFinishDate,
    confidenceBandFinishDate: networkP80FinishDate ?? confidenceBandFinishDate,
    mergeBias,
    probabilityBasis: monteCarloApplied ? 'monte_carlo' : 'pert_analytic',
  })
  const rawInternalWorkFinishDate = confidenceBandDecision.governingFinishDate
  const pressureProgressExtraDays = computeRuntimePressureExtraDays(params.runtimeExecutionFacts, internalCriticalRows.length)
  const adjustedInternalFinishDate = pressureProgressExtraDays > 0
    ? addExtraProductionDays(rawInternalWorkFinishDate, pressureProgressExtraDays, constructionCalendar)
    : rawInternalWorkFinishDate
  const internalWorkFinishDate = adjustedInternalFinishDate
  const parallelGateRemainingDays = parallelGateRows
    .map((row) => readExternalGateRemainingDays(row, asOfDate, constructionCalendar))
    .filter((days) => days > 0)
  const startGateRemainingDays = startGateRows
    .map((row) => readExternalGateRemainingDays(row, asOfDate, constructionCalendar))
    .filter((days) => days > 0)
  const finishGateRemainingDays = finishGateRows
    .filter((row) => !readExplicitExternalGateFinishDate(row))
    .map((row) => readExternalGateRemainingDays(row, asOfDate, constructionCalendar))
    .filter((days) => days > 0)
  const handoverGateRemainingDays = handoverGateRows
    .filter((row) => !readExplicitExternalGateFinishDate(row))
    .map((row) => readExternalGateRemainingDays(row, asOfDate, constructionCalendar))
    .filter((days) => days > 0)
  const overlappedRemainingDays = parallelGateRemainingDays.length > 0
    ? Math.max(...parallelGateRemainingDays)
    : 0
  const gateRemainingFinishDate = overlappedRemainingDays > 0
    ? addProductionDays(asOfDate, overlappedRemainingDays, constructionCalendar)
    : null
  const startGateRemainingFinishDate = startGateRemainingDays.length > 0
    ? addProductionDays(asOfDate, Math.max(...startGateRemainingDays), constructionCalendar)
    : null
  const startGateFinishDate = latestDate([latestStartGateFinishDate, startGateRemainingFinishDate])
  const parallelGateFinishDate = latestDate([latestParallelGateFinishDate, gateRemainingFinishDate])
  const finishGateFinishDate = latestDate([
    latestFinishGateFinishDate,
    internalWorkFinishDate && finishGateRemainingDays.length > 0
      ? addProductionDays(internalWorkFinishDate, Math.max(...finishGateRemainingDays), constructionCalendar)
      : null,
  ])
  const latestHandoverGateFinishDate = latestDate(handoverGateRows.map((row) => readExplicitExternalGateFinishDate(row)))
  const handoverBaseFinishDate = latestDate([finishGateFinishDate, internalWorkFinishDate])
  const handoverGateFinishDate = latestDate([
    latestHandoverGateFinishDate,
    handoverBaseFinishDate && handoverGateRemainingDays.length > 0
      ? addProductionDays(handoverBaseFinishDate, Math.max(...handoverGateRemainingDays), constructionCalendar)
      : null,
  ])
  const serializedGateFinishCandidate = latestDate([finishGateFinishDate, handoverGateFinishDate])
  const gateTailDaysAfterInternal = internalWorkFinishDate && serializedGateFinishCandidate
    ? Math.max(0, signedDurationDayDelta(internalWorkFinishDate, serializedGateFinishCandidate) ?? 0)
    : 0
  const serialRemainingDays = gateTailDaysAfterInternal
  const serializedGateFinishDate = gateTailDaysAfterInternal > 0 ? serializedGateFinishCandidate : null
  const rawForecastFinishDate = latestDate([
    internalWorkFinishDate,
    startGateFinishDate,
    parallelGateFinishDate,
    serializedGateFinishCandidate,
    asOfDate,
  ])
  const forecastDurationGuard = evaluateDurationPlausibility({
    engineCode: 'project_remaining_forecast',
    durationDays: rawForecastFinishDate ? projectRemainingDurationDays(asOfDate, rawForecastFinishDate, constructionCalendar) : null,
    title: 'project remaining forecast',
    clamp: true,
  })
  durationPlausibilityWarnings.push(...forecastDurationGuard.warnings)
  const forecastFinishDate = forecastDurationGuard.durationDays
    ? addProductionDays(asOfDate, forecastDurationGuard.durationDays, constructionCalendar)
    : rawForecastFinishDate
  const commitmentFinishBeyondForecastDays = Math.max(
    0,
    signedDurationDayDelta(forecastFinishDate, latestCommitmentFinishDate) ?? 0,
  )
  const targetEndDate = normalizeDate(params.targetEndDate)
  const factContext = buildAlgorithmFactContext({
    phase: 'runtime_forecast',
    rows: params.rows,
    runtimeExecutionFacts: params.runtimeExecutionFacts,
  })
  const factSummary = summarizeAlgorithmFactContext(factContext)
  const durationOutputContract = buildDurationOutputContractSummary()
  const t2RhythmScheduleEvidence = buildT2RhythmScheduleEvidence(scheduleRows)
  const rowDurationInputAssembly = readRecord(t2RhythmScheduleEvidence?.durationInputAssembly)
  const runtimeDurationInputAssembly = readRuntimeDurationInputAssembly(params.runtimeExecutionFacts)
  const durationInputAssembly = isNonEmptyRecord(rowDurationInputAssembly)
    ? rowDurationInputAssembly
    : runtimeDurationInputAssembly
  const upstreamAssetConsumptionReceipts = Array.isArray(durationInputAssembly.assetConsumptionReceipts)
    ? durationInputAssembly.assetConsumptionReceipts as DurationAssetConsumptionReceipt[]
    : []
  const finalProjectRemainingForecastDays = projectRemainingDurationDays(
    asOfDate,
    forecastFinishDate,
    constructionCalendar,
  )
  const downstreamAssetConsumption = buildDownstreamDurationAssetConsumption({
    consumer: 'project_remaining_duration_forecast',
    upstreamReceipts: upstreamAssetConsumptionReceipts,
    before: {
      durationDays: null,
      dates: null,
      confidence: null,
    },
    after: {
      durationDays: finalProjectRemainingForecastDays,
      dates: {
        forecastFinishDate,
        targetEndDate,
      },
      confidence: confidenceBandDecision,
    },
    targetRowIds: scheduleRows.map((row) => row.clientRowId),
  })

  const forecast: ProjectRemainingDurationForecast = {
    durationOutputCode: 'project_remaining_forecast',
    durationOutputSemanticFieldName: 'projectRemainingForecastDays',
    durationOutputContract,
    projectRemainingForecastDays: finalProjectRemainingForecastDays,
    forecastFinishDate,
    targetEndDate,
    targetGapDays: projectRemainingGapDays(targetEndDate, forecastFinishDate, constructionCalendar),
    rowsEvaluated: scheduleRows.length,
    calculationContext: {
      primaryLayer: factContext.primaryLayer,
      factWeights: factContext.weights,
      projectFactsRole: normalizeFactRole(factSummary.projectFactsRole),
      runtimeFactsRole: normalizeFactRole(factSummary.runtimeFactsRole),
      criticalPath: {
        remainingTaskCount: internalCriticalRows.length,
        latestCriticalFinishDate,
        optimisticBandFinishDate: networkP20FinishDate ?? optimisticBandFinishDate,
        confidenceBandFinishDate: networkP80FinishDate ?? confidenceBandFinishDate,
        criticalPathSpanFinishDate,
        mergeBiasDays: mergeBias.mergeBiasDays,
        mergeBiasChainCount: mergeBias.mergeBiasChainCount,
        mergeBiasedFinishDate,
        probabilityBasis: monteCarloApplied ? 'monte_carlo' : 'pert_analytic',
        networkProbability: {
          ...networkProbabilityResult,
          p20RemainingDays: networkProbabilityResult.p20DurationDays,
          p50RemainingDays: networkProbabilityResult.p50DurationDays,
          p80RemainingDays: networkProbabilityResult.p80DurationDays,
          p20FinishDate: networkP20FinishDate ?? optimisticBandFinishDate,
          p50FinishDate: networkP50FinishDate ?? deterministicInternalFinishDate,
          p80FinishDate: networkP80FinishDate ?? confidenceBandFinishDate,
        },
        confidenceBandDecision,
      },
      runtimeAdjustment: {
        pressureProgressExtraDays,
        adjustedInternalFinishDate,
        evidenceObjects: params.runtimeExecutionFacts?.evidenceObjects ?? [],
        runtimeInferenceSummary: params.runtimeExecutionFacts?.runtimeInferenceSummary,
      },
      monthlyCommitments: {
        activeCommitmentCount: Number(monthlyCommitments.activeCommitmentCount ?? 0) || 0,
        carryoverCommitmentCount: Number(monthlyCommitments.carryoverCommitmentCount ?? 0) || 0,
        latestCommitmentFinishDate,
        commitmentFinishSoftSignalDate: latestCommitmentFinishDate,
        commitmentFinishBeyondForecastDays,
        softSignalPolicy: 'status_only_not_finish_boundary',
      },
      externalInterfaces: {
        hardGateCount: externalGateRows.length,
        latestGateFinishDate,
        gateRelationSummary: {
          parallelWaitCount: parallelGateRows.length,
          startGateCount: startGateRows.length,
          finishGateCount: finishGateRows.length,
          handoverGateCount: handoverGateRows.length,
          mixedGateCount: externalGateRows.filter(isMixedGateRow).length,
          totalCount: externalGateRows.length,
          relationKinds,
        },
        serialRemainingDays,
        overlappedRemainingDays,
        startGateFinishDate,
        overlappedGateFinishDate: parallelGateFinishDate,
        finishGateFinishDate,
        handoverGateFinishDate,
        gateTailDaysAfterInternal,
        serializedGateFinishDate,
      },
      ...(t2RhythmScheduleEvidence ? { t2RhythmScheduleEvidence } : {}),
      ...(isNonEmptyRecord(durationInputAssembly) ? { durationInputAssembly } : {}),
      ...(upstreamAssetConsumptionReceipts.length > 0
        ? { upstreamAssetConsumptionReceipts }
        : {}),
      ...(downstreamAssetConsumption.receipts.length > 0
        ? {
            assetConsumptionReceipts: downstreamAssetConsumption.receipts,
            assetConsumptionSummary: downstreamAssetConsumption.summary,
          }
        : {}),
      boundaryPolicy: [
        ...(durationOutputContract?.boundaryPolicy ?? []),
        'project_remaining_window_arbitrates_deterministic_merge_bias_and_confidence_band_finish',
        'external_hard_gates_are_relation_aware_parallel_wait_or_finish_gates',
        'monthly_commitments_are_status_pressure_soft_signals_not_finish_boundaries',
      ],
      ...(durationPlausibilityWarnings.length > 0 ? { durationPlausibilityWarnings } : {}),
    },
  }

  params.predictionEventRecorder?.(buildProjectRemainingForecastPredictionEvent({
    forecast,
    rows: scheduleRows,
    asOfDate,
  }))

  const runtimeArtifactPublications = params.runtimeArtifactPublications ?? []
  if (params.runtimeConsumerObservationQueryExec) {
    const projectId = normalizeText(params.projectId) || firstProjectId(scheduleRows)
    void recordProjectRemainingDurationForecastConsumedArtifacts({
      queryExec: params.runtimeConsumerObservationQueryExec,
      observedAt: normalizeText(params.runtimeConsumerObservedAt) || undefined,
      callContext: {
        projectId: projectId || null,
        durationOutputCode: forecast.durationOutputCode,
        forecastFinishDate: forecast.forecastFinishDate,
        projectRemainingForecastDays: forecast.projectRemainingForecastDays,
      },
      sourceEvidenceRefs: [
        [
          'project_remaining_forecast',
          projectId || 'no_project',
          forecast.forecastFinishDate ?? 'no_finish',
        ].join(':'),
      ],
      artifacts: buildProjectRemainingDurationForecastConsumedArtifacts({
        forecast,
        runtimeArtifactPublications,
        projectId,
      }),
    }).catch((error) => {
      params.runtimeConsumerErrorHandler?.(error)
    })
  }

  return forecast
}
