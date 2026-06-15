import {
  buildAlgorithmFactContext,
  summarizeAlgorithmFactContext,
  type RuntimeExecutionFacts,
} from './algorithmFactContextService.js'
import type { DurationAccuracyPredictionInput } from './durationAlgorithmAccuracyService.js'
import { getDurationOutputContract } from './durationOutputGovernanceService.js'
import type { ScheduleAccelerationRow } from './scheduleAccelerationService.js'
import {
  recordProjectRemainingDurationForecastConsumedArtifacts,
  type DurationRuntimeConsumerFacadeArtifactsResult,
} from './durationRuntimeConsumerObservationAdapterService.js'
import type {
  DurationRuntimeConsumerObservationQueryExec,
  DurationRuntimeConsumerObservedArtifact,
} from './durationRuntimeConsumerObservationService.js'
import { normalizeDurationDateUtc, orderedInclusiveDurationDays, signedDurationDayDelta } from '../utils/durationDays.js'

export type ProjectMonthlyCommitmentSummary = {
  activeCommitmentCount?: number | null
  carryoverCommitmentCount?: number | null
  latestCommitmentFinishDate?: string | null
}

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
    }
    externalInterfaces: {
      hardGateCount: number
      latestGateFinishDate: string | null
      serialRemainingDays?: number
      overlappedRemainingDays?: number
      serializedGateFinishDate?: string | null
    }
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

function addInclusiveRemainingDays(anchorDate: string | null | undefined, days: number | null | undefined) {
  const anchor = normalizeDurationDateUtc(anchorDate)
  const normalizedDays = Math.max(0, Math.ceil(Number(days ?? 0)))
  if (!anchor || normalizedDays <= 0) return normalizeDate(anchorDate)
  const next = new Date(anchor)
  next.setUTCDate(next.getUTCDate() + normalizedDays - 1)
  return formatDurationDateUtc(next)
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

function readRowGoverningFinish(row: ScheduleAccelerationRow, asOfDate?: string | null) {
  const forecastFinish = readRowForecastFinish(row)
  if (forecastFinish) return forecastFinish

  const remainingDays = readRowRemainingDurationDays(row)
  if (remainingDays !== null && remainingDays > 0 && normalizeDate(asOfDate)) {
    return addInclusiveRemainingDays(asOfDate, remainingDays)
  }

  return normalizeDate(
    row.values.planned_finish_date
      ?? row.values.planned_end_date
      ?? row.values.end_date,
  )
}

function readExternalGateRemainingDays(row: ScheduleAccelerationRow, asOfDate: string) {
  const explicitRemainingDays = readRowRemainingDurationDays(row)
  if (explicitRemainingDays !== null && explicitRemainingDays > 0) return Math.ceil(explicitRemainingDays)

  const finishDate = readRowGoverningFinish(row, asOfDate)
  if (!finishDate) return 0
  const plannedStartDate = normalizeDate(row.values.planned_start_date ?? row.values.start_date)
  const startDate = plannedStartDate && (signedDurationDayDelta(asOfDate, plannedStartDate) ?? 0) > 0
    ? plannedStartDate
    : asOfDate
  return orderedInclusiveDurationDays(startDate, finishDate) ?? 0
}

function computeCriticalMergeBiasDays(rows: ScheduleAccelerationRow[], asOfDate: string) {
  const spreads = rows
    .map((row) => {
      const medianFinish = readRowGoverningFinish(row, asOfDate)
      const confidenceFinish = readRowConfidenceBandFinish(row)
      if (!medianFinish || !confidenceFinish) return null
      const spread = signedDurationDayDelta(medianFinish, confidenceFinish)
      return spread !== null && spread > 0 ? spread : null
    })
    .filter((value): value is number => value !== null)

  if (spreads.length <= 1) {
    return {
      mergeBiasDays: 0,
      mergeBiasChainCount: spreads.length,
    }
  }

  const averageSpread = spreads.reduce((sum, value) => sum + value, 0) / spreads.length
  const mergeFactor = Math.min(0.5, Math.max(0.15, Math.log2(spreads.length) / 4))
  return {
    mergeBiasDays: Math.max(1, Math.ceil(averageSpread * mergeFactor)),
    mergeBiasChainCount: spreads.length,
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
  const mode = normalizeText(row.rowProjectionMode ?? row.values.row_projection_mode ?? metadata.rowProjectionMode ?? metadata.row_projection_mode)
  return !mode || mode === 'schedule_row'
}

function isCriticalOrNearCriticalRow(row: ScheduleAccelerationRow) {
  const totalFloat = readNumber(row.values.total_float_days)
  const freeFloat = readNumber(row.values.free_float_days)
  return row.values.is_critical === true
    || (totalFloat !== null && totalFloat <= 3)
    || (freeFloat !== null && freeFloat <= 1)
}

function isExternalHardGateRow(row: ScheduleAccelerationRow) {
  const metadata = readRecord(row.values.standard_task_metadata ?? row.values.metadata)
  const contributionMode = normalizeText(row.values.duration_contribution_mode ?? metadata.durationContributionMode ?? metadata.duration_contribution_mode).toLowerCase()
  const constraintType = normalizeText(metadata.constraintType ?? metadata.constraint_type).toLowerCase()
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
  return contributionMode.includes('external')
    || constraintType.includes('external')
    || externalInterfaces.length > 0
    || hardConstraints.length > 0
    || row.values.acceptance_required === true
    || row.values.material_required === true
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
  runtimeExecutionFacts?: RuntimeExecutionFacts | null
  monthlyCommitments?: ProjectMonthlyCommitmentSummary | null
  predictionEventRecorder?: (event: DurationAccuracyPredictionInput) => void
  runtimeConsumerObservationQueryExec?: DurationRuntimeConsumerObservationQueryExec | null
  runtimeArtifactPublications?: readonly ProjectRemainingDurationRuntimeArtifactPublication[] | null
  runtimeConsumerObservedAt?: string | null
  runtimeConsumerErrorHandler?: (error: unknown) => void
}): ProjectRemainingDurationForecast {
  const asOfDate = normalizeDate(params.asOfDate) ?? new Date().toISOString().slice(0, 10)
  const scheduleRows = params.rows.filter(isScheduleRow)
  const remainingRows = scheduleRows.filter((row) => !isCompletedRow(row))
  const criticalRows = remainingRows.filter(isCriticalOrNearCriticalRow)
  const externalGateRows = remainingRows.filter(isExternalHardGateRow)
  const internalRemainingRows = remainingRows.filter((row) => !isExternalHardGateRow(row))
  const internalCriticalRows = criticalRows.filter((row) => !isExternalHardGateRow(row))
  const monthlyCommitments = params.monthlyCommitments ?? {}
  const latestRemainingFinishDate = latestDate(internalRemainingRows.map((row) => readRowGoverningFinish(row, asOfDate)))
  const latestCriticalFinishDate = latestDate(internalCriticalRows.map((row) => readRowGoverningFinish(row, asOfDate)))
  const optimisticBandFinishDate = latestDate(internalCriticalRows.map(readRowOptimisticBandFinish))
  const confidenceBandFinishDate = latestDate(internalCriticalRows.map(readRowConfidenceBandFinish))
  const criticalPathSpanDays = internalCriticalRows
    .map(readRowCriticalPathSpanDays)
    .filter((days): days is number => days !== null && days > 0)
  const criticalPathSpanFinishDate = criticalPathSpanDays.length > 0
    ? addInclusiveRemainingDays(asOfDate, Math.max(...criticalPathSpanDays))
    : null
  const latestGateFinishDate = latestDate(externalGateRows.map((row) => readRowGoverningFinish(row, asOfDate)))
  const latestCommitmentFinishDate = normalizeDate(monthlyCommitments.latestCommitmentFinishDate)
  const mergeBias = computeCriticalMergeBiasDays(internalCriticalRows, asOfDate)
  const confidenceBandGoverningFinishDate = mergeBias.mergeBiasDays > 0 ? null : confidenceBandFinishDate
  const rawInternalWorkFinishDate = latestDate([
    latestRemainingFinishDate,
    latestCriticalFinishDate,
    confidenceBandGoverningFinishDate,
    criticalPathSpanFinishDate,
    asOfDate,
  ])
  const mergeBiasedFinishDate = mergeBias.mergeBiasDays > 0
    ? addCalendarDays(rawInternalWorkFinishDate, mergeBias.mergeBiasDays)
    : rawInternalWorkFinishDate
  const pressureProgressExtraDays = computeRuntimePressureExtraDays(params.runtimeExecutionFacts, internalCriticalRows.length)
  const adjustedInternalFinishDate = pressureProgressExtraDays > 0
    ? addCalendarDays(mergeBiasedFinishDate, pressureProgressExtraDays)
    : mergeBiasedFinishDate
  const internalWorkFinishDate = adjustedInternalFinishDate
  const externalGateRemainingDays = externalGateRows
    .map((row) => readExternalGateRemainingDays(row, asOfDate))
    .filter((days) => days > 0)
  const overlappedRemainingDays = externalGateRemainingDays.length > 0
    ? Math.max(...externalGateRemainingDays)
    : 0
  const serialRemainingDays = overlappedRemainingDays
  const serializedGateFinishDate = overlappedRemainingDays > 0
    ? addInclusiveRemainingDays(internalWorkFinishDate, overlappedRemainingDays)
    : null
  const forecastFinishDate = latestDate([
    internalWorkFinishDate,
    serializedGateFinishDate,
    latestCommitmentFinishDate,
    asOfDate,
  ])
  const targetEndDate = normalizeDate(params.targetEndDate)
  const factContext = buildAlgorithmFactContext({
    phase: 'runtime_forecast',
    rows: params.rows,
    runtimeExecutionFacts: params.runtimeExecutionFacts,
  })
  const factSummary = summarizeAlgorithmFactContext(factContext)
  const durationOutputContract = buildDurationOutputContractSummary()

  const forecast: ProjectRemainingDurationForecast = {
    durationOutputCode: 'project_remaining_forecast',
    durationOutputSemanticFieldName: 'projectRemainingForecastDays',
    durationOutputContract,
    projectRemainingForecastDays: orderedInclusiveDurationDays(asOfDate, forecastFinishDate) ?? 0,
    forecastFinishDate,
    targetEndDate,
    targetGapDays: targetEndDate && forecastFinishDate ? Math.max(0, signedDurationDayDelta(targetEndDate, forecastFinishDate) ?? 0) : null,
    rowsEvaluated: scheduleRows.length,
    calculationContext: {
      primaryLayer: factContext.primaryLayer,
      factWeights: factContext.weights,
      projectFactsRole: normalizeFactRole(factSummary.projectFactsRole),
      runtimeFactsRole: normalizeFactRole(factSummary.runtimeFactsRole),
      criticalPath: {
        remainingTaskCount: internalCriticalRows.length,
        latestCriticalFinishDate,
        optimisticBandFinishDate,
        confidenceBandFinishDate,
        criticalPathSpanFinishDate,
        mergeBiasDays: mergeBias.mergeBiasDays,
        mergeBiasChainCount: mergeBias.mergeBiasChainCount,
        mergeBiasedFinishDate,
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
      },
      externalInterfaces: {
        hardGateCount: externalGateRows.length,
        latestGateFinishDate,
        serialRemainingDays,
        overlappedRemainingDays,
        serializedGateFinishDate,
      },
      boundaryPolicy: [
        ...(durationOutputContract?.boundaryPolicy ?? []),
        'project_remaining_window_adds_merge_bias_for_parallel_near_critical_uncertainty',
        'external_hard_gates_overlap_by_max_remaining_window_after_internal_finish',
      ],
    },
  }

  params.predictionEventRecorder?.(buildProjectRemainingForecastPredictionEvent({
    forecast,
    rows: scheduleRows,
    asOfDate,
  }))

  const runtimeArtifactPublications = params.runtimeArtifactPublications ?? []
  if (params.runtimeConsumerObservationQueryExec && runtimeArtifactPublications.length > 0) {
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
