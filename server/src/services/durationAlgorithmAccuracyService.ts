import * as dbService from './dbService.js'
import { logger } from '../middleware/logger.js'
import { orderedInclusiveDurationDays, signedDurationDayDelta, type DurationDateInput } from '../utils/durationDays.js'
import { buildStandardWorkDurationSeedReplayGovernanceReport } from './standardWorkDurationSeedReplayGovernanceService.js'
import {
  parseConstructionCalendarDate,
  productionDaysBetweenInclusive,
  type ConstructionCalendarContext,
} from './constructionCalendar.js'
import {
  CONSTRUCTION_ORGANIZATION_PLAN_NETWORK_ASSET_KEY,
} from './constructionOrganizationRuntimeLineageService.js'

export type DurationAlgorithmEngineCode =
  | 'standard_duration_reference'
  | 'task_remaining_forecast'
  | 'critical_path_cpm'
  | 'project_remaining_forecast'
  | 'schedule_acceleration_target'

export type DurationAccuracyMetric = {
  engineCode: DurationAlgorithmEngineCode | string
  outputKind: string
  metricBasis: string
  predictionBasis: string | null
  modelVersion: string | null
  sampleCount: number
  maeDays: number | null
  mdAeDays: number | null
  biasDays: number | null
  mape: number | null
  overcompensationRate: number | null
  hitRate: number | null
  status: string
  lastBacktestedAt: string | null
  source: 'duration_algorithm_accuracy_events' | 'duration_forecast_project_overlays' | 'standard_work_duration_seed_replay'
}

export type DurationAccuracySourceError = {
  source: DurationAccuracyMetric['source']
  code: string
}

export type DurationAccuracySummary = {
  projectId: string | null
  projectIds?: string[]
  engineCode: string | null
  engineCount: number
  generatedAt: string
  metrics: DurationAccuracyMetric[]
  dataStatus: 'ok' | 'partial' | 'unavailable'
  sourceErrors: DurationAccuracySourceError[]
  step2Readiness?: DurationAlgorithmStep2Readiness
}

export type DurationAlgorithmStep2Gate = {
  code: string
  label: string
  status: 'passed' | 'blocked' | 'waiting'
  severity: 'CLASS_A' | 'CLASS_B' | 'DATA'
  evidence: string
  requiredEngineCodes?: string[]
}

export type DurationAlgorithmStep2Readiness = {
  readyForStep2: boolean
  structuralReady: boolean
  directionalBiasesCorrected: boolean
  classABlockerCount: number
  gates: DurationAlgorithmStep2Gate[]
  parameterDataStatus: {
    status: 'data_collection_open' | 'enough_samples_for_parameter_calibration'
    minimumBacktestSampleCount: number
    enginesWithAccuracySamples: string[]
    missingSampleEngineCodes: string[]
  }
}

export type DurationAccuracyPredictionInput = {
  engineCode: DurationAlgorithmEngineCode | string
  outputKind: string
  projectId?: string | null
  taskId?: string | null
  dedupeKey?: string | null
  predictionBasis?: string | null
  predictionSource?: string | null
  modelVersion?: string | null
  predictedAt?: string | Date | null
  predictedStartDate?: string | Date | null
  predictedFinishDate?: string | Date | null
  predictedDurationDays?: number | null
  predictionContext?: Record<string, unknown> | null
  runtimeConsumptionState?: string | null
  seedLineage?: Record<string, unknown> | null
  networkLineage?: Record<string, unknown> | null
}

export type DurationAccuracyBacktestInput = {
  predictionId?: string | null
  engineCode?: DurationAlgorithmEngineCode | string | null
  dedupeKey?: string | null
  actualStartDate?: string | Date | null
  actualFinishDate?: string | Date | null
  actualDurationDays?: number | null
  actualContext?: Record<string, unknown> | null
  baselineAbsoluteErrorDays?: number | null
}

export type DurationAccuracyPendingBacktestInput = DurationAccuracyBacktestInput & {
  projectId?: string | null
  taskId?: string | null
  engineCode: DurationAlgorithmEngineCode | string
}

export type DurationPredictionEvent = DurationAccuracyPredictionInput
export type DurationActualOutcome = DurationAccuracyBacktestInput
export type DurationPredictionError = {
  predictionId?: string | null
  signedErrorDays: number | null
  absoluteErrorDays: number | null
  baselineAbsoluteErrorDays?: number | null
  overcompensated?: boolean | null
}

type AccuracyEventRow = {
  id?: string | null
  project_id?: string | null
  task_id?: string | null
  engine_code?: string | null
  output_kind?: string | null
  prediction_basis?: string | null
  model_version?: string | null
  predicted_start_date?: string | null
  predicted_duration_days?: number | string | null
  predicted_finish_date?: string | null
  predicted_at?: string | null
  dedupe_key?: string | null
  prediction_context?: Record<string, unknown> | null
  actual_duration_days?: number | string | null
  signed_error_days?: number | string | null
  absolute_error_days?: number | string | null
  baseline_absolute_error_days?: number | string | null
  overcompensated?: boolean | string | null
  backtest_status?: string | null
  backtested_at?: string | null
  updated_at?: string | null
  runtime_consumption_state?: string | null
  seed_lineage?: Record<string, unknown> | null
  network_lineage?: Record<string, unknown> | null
}

type ForecastOverlayRow = {
  project_id?: string | null
  model_key?: string | null
  model_version?: string | null
  overlay_status?: string | null
  sample_count?: number | string | null
  mean_absolute_error_days?: number | string | null
  bias_error_days?: number | string | null
  overcompensation_rate?: number | string | null
  updated_at?: string | null
  generated_at?: string | null
}

const ENGINE_ACCURACY_DEFAULTS: Record<DurationAlgorithmEngineCode, Omit<DurationAccuracyMetric, 'engineCode'>> = {
  standard_duration_reference: {
    outputKind: 'standard_duration_reference',
    metricBasis: 'standardWorkDurationSeedReplayService.medianAbsolutePercentageError',
    predictionBasis: 'seed_replay_report_only',
    modelVersion: 'standard_duration_seed_replay',
    sampleCount: 0,
    maeDays: null,
    mdAeDays: null,
    biasDays: null,
    mape: null,
    overcompensationRate: null,
    hitRate: null,
    status: 'report_only_replay_not_runtime_backtest',
    lastBacktestedAt: null,
    source: 'standard_work_duration_seed_replay',
  },
  task_remaining_forecast: {
    outputKind: 'remaining_duration_forecast',
    metricBasis: 'task_duration_forecasts.forecast_error_days',
    predictionBasis: 'runtime_forecast_overlay',
    modelVersion: 'remaining_duration_forecast',
    sampleCount: 0,
    maeDays: null,
    mdAeDays: null,
    biasDays: null,
    mape: null,
    overcompensationRate: null,
    hitRate: null,
    status: 'no_accuracy_samples',
    lastBacktestedAt: null,
    source: 'duration_forecast_project_overlays',
  },
  critical_path_cpm: {
    outputKind: 'critical_path_project_duration',
    metricBasis: 'duration_algorithm_accuracy_events.signed_error_days',
    predictionBasis: 'runtime_snapshot',
    modelVersion: 'critical_path_cpm_v1',
    sampleCount: 0,
    maeDays: null,
    mdAeDays: null,
    biasDays: null,
    mape: null,
    overcompensationRate: null,
    hitRate: null,
    status: 'no_accuracy_samples',
    lastBacktestedAt: null,
    source: 'duration_algorithm_accuracy_events',
  },
  project_remaining_forecast: {
    outputKind: 'project_remaining_forecast',
    metricBasis: 'duration_algorithm_accuracy_events.signed_error_days',
    predictionBasis: 'runtime_snapshot',
    modelVersion: 'project_remaining_forecast_v1',
    sampleCount: 0,
    maeDays: null,
    mdAeDays: null,
    biasDays: null,
    mape: null,
    overcompensationRate: null,
    hitRate: null,
    status: 'no_accuracy_samples',
    lastBacktestedAt: null,
    source: 'duration_algorithm_accuracy_events',
  },
  schedule_acceleration_target: {
    outputKind: 'acceleration_target',
    metricBasis: 'duration_algorithm_accuracy_events.signed_error_days',
    predictionBasis: 'runtime_snapshot',
    modelVersion: 'schedule_acceleration_target_v1',
    sampleCount: 0,
    maeDays: null,
    mdAeDays: null,
    biasDays: null,
    mape: null,
    overcompensationRate: null,
    hitRate: null,
    status: 'no_accuracy_samples',
    lastBacktestedAt: null,
    source: 'duration_algorithm_accuracy_events',
  },
}

function getSupabase(): any | null {
  return (dbService as any).supabase ?? null
}

function normalizeText(value: unknown) {
  const text = String(value ?? '').trim()
  return text || null
}

function normalizeDate(value: unknown) {
  const text = normalizeText(value)
  if (!text) return null
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : text.slice(0, 10)
}

function normalizeTimestamp(value: unknown) {
  if (value instanceof Date) return value.toISOString()
  const text = normalizeText(value)
  return text ?? new Date().toISOString()
}

function readNumber(value: unknown): number | null {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function readPositiveInt(value: unknown): number | null {
  const parsed = readNumber(value)
  return parsed !== null && parsed > 0 ? Math.ceil(parsed) : null
}

function round(value: number | null, digits = 2) {
  if (value === null || !Number.isFinite(value)) return null
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

function average(values: number[]) {
  if (values.length === 0) return null
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function median(values: number[]) {
  if (values.length === 0) return null
  const sorted = [...values].sort((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2
}

function maxTimestamp(values: Array<string | null | undefined>) {
  return values
    .map(normalizeText)
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1) ?? null
}

function buildPredictedDuration(input: DurationAccuracyPredictionInput) {
  return readPositiveInt(input.predictedDurationDays)
    ?? orderedInclusiveDurationDays(input.predictedStartDate, input.predictedFinishDate)
}

function buildActualDuration(input: DurationAccuracyBacktestInput) {
  return readPositiveInt(input.actualDurationDays)
    ?? orderedInclusiveDurationDays(input.actualStartDate, input.actualFinishDate)
}

function readPredictionDurationDayUnit(value: unknown) {
  const text = normalizeText(value)
  return text === 'construction_production_day' || text === 'production_day' || text === 'production_days'
    ? 'construction_production_day'
    : 'calendar_day'
}

function readBoolean(value: unknown): boolean | null {
  if (value === true || value === false) return value
  const text = normalizeText(value)?.toLowerCase()
  if (text === 'true' || text === '1' || text === 'yes') return true
  if (text === 'false' || text === '0' || text === 'no') return false
  return null
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? { ...(value as Record<string, unknown>) }
    : null
}

function isConstructionOrganizationPlanNetworkContext(value: Record<string, unknown> | null) {
  return normalizeText(value?.assetKey) === CONSTRUCTION_ORGANIZATION_PLAN_NETWORK_ASSET_KEY
}

function hasStructuredBusinessType(value: Record<string, unknown> | null) {
  return Boolean(normalizeText(value?.businessType))
}

function buildActualDurationForPrediction(input: DurationAccuracyBacktestInput, prediction: AccuracyEventRow) {
  const explicitActual = readPositiveInt(input.actualDurationDays)
  if (explicitActual !== null) return explicitActual

  const context = readRecord(prediction.prediction_context)
  const actualStart = parseConstructionCalendarDate(input.actualStartDate)
  const actualFinish = parseConstructionCalendarDate(input.actualFinishDate)
  if (
    context
    && readPredictionDurationDayUnit(context.durationDayUnit) === 'construction_production_day'
    && actualStart
    && actualFinish
  ) {
    const calendar = readRecord(context.constructionCalendar) as ConstructionCalendarContext | null
    return productionDaysBetweenInclusive(actualStart, actualFinish, calendar)
  }

  return buildActualDuration(input)
}

function buildPredictionContext(input: DurationAccuracyPredictionInput) {
  const context = readRecord(input.predictionContext) ?? {}
  const seedLineage = readRecord(input.seedLineage)
  const networkLineage = readRecord(input.networkLineage)
  if (seedLineage) context.seedLineage = seedLineage
  if (networkLineage) context.networkLineage = networkLineage
  return {
    context,
    seedLineage: seedLineage ?? {},
    networkLineage: networkLineage ?? {},
  }
}

function buildSignedError(params: {
  predictedDurationDays?: number | null
  actualDurationDays?: number | null
  predictedFinishDate?: DurationDateInput
  actualFinishDate?: DurationDateInput
  requireActualDuration?: boolean
}) {
  if (params.predictedDurationDays && params.actualDurationDays) {
    return params.actualDurationDays - params.predictedDurationDays
  }
  if (params.requireActualDuration) return null
  return signedDurationDayDelta(params.predictedFinishDate, params.actualFinishDate)
}

function requiresActualDurationForSignedError(prediction: AccuracyEventRow, actualDurationDays: number | null) {
  if (actualDurationDays !== null) return false
  const context = readRecord(prediction.prediction_context)
  return readPredictionDurationDayUnit(context?.durationDayUnit) === 'construction_production_day'
}

async function maybeSingle(query: any) {
  if (!query) return null
  const result = typeof query.maybeSingle === 'function'
    ? await query.maybeSingle()
    : await query
  if (result?.error) throw result.error
  return result?.data ?? null
}

async function loadPredictionForBacktest(input: DurationAccuracyBacktestInput): Promise<AccuracyEventRow | null> {
  if (dbService.usesDirectSqlRuntimePath()) {
    const predictionId = normalizeText(input.predictionId)
    const engineCode = normalizeText(input.engineCode)
    const dedupeKey = normalizeText(input.dedupeKey)
    const rows = predictionId
      ? await dbService.executeSQL<AccuracyEventRow>(
          `SELECT id, engine_code, dedupe_key, predicted_duration_days, predicted_finish_date, prediction_context
             FROM public.duration_algorithm_accuracy_events
            WHERE id = ?
            LIMIT 1`,
          [predictionId],
        )
      : engineCode && dedupeKey
        ? await dbService.executeSQL<AccuracyEventRow>(
            `SELECT id, engine_code, dedupe_key, predicted_duration_days, predicted_finish_date, prediction_context
               FROM public.duration_algorithm_accuracy_events
              WHERE engine_code = ?
                AND dedupe_key = ?
              LIMIT 1`,
            [engineCode, dedupeKey],
          )
        : []
    return rows[0] ?? null
  }

  const supabase = getSupabase()
  const table = supabase?.from?.('duration_algorithm_accuracy_events')
  if (!table?.select) return null

  let query = table.select('id, engine_code, dedupe_key, predicted_duration_days, predicted_finish_date, prediction_context')
  if (normalizeText(input.predictionId)) {
    query = query.eq('id', normalizeText(input.predictionId))
  } else if (normalizeText(input.engineCode) && normalizeText(input.dedupeKey)) {
    query = query.eq('engine_code', normalizeText(input.engineCode)).eq('dedupe_key', normalizeText(input.dedupeKey))
  } else {
    return null
  }
  return await maybeSingle(query) as AccuracyEventRow | null
}

async function loadEarliestPendingPredictionForBacktest(input: DurationAccuracyPendingBacktestInput): Promise<AccuracyEventRow | null> {
  if (dbService.usesDirectSqlRuntimePath()) {
    const projectId = normalizeText(input.projectId)
    const taskId = normalizeText(input.taskId)
    const engineCode = normalizeText(input.engineCode)
    if (!projectId || !engineCode) return null
    const rows = taskId
      ? await dbService.executeSQL<AccuracyEventRow>(
        `SELECT id, engine_code, dedupe_key, predicted_start_date, predicted_duration_days,
                predicted_finish_date, predicted_at, prediction_context
           FROM public.duration_algorithm_accuracy_events
          WHERE project_id = ?
            AND engine_code = ?
            AND task_id = ?
            AND backtest_status = 'prediction_pending'
          ORDER BY predicted_at ASC
          LIMIT 1`,
        [projectId, engineCode, taskId],
      )
      : await dbService.executeSQL<AccuracyEventRow>(
        `SELECT id, engine_code, dedupe_key, predicted_start_date, predicted_duration_days,
                predicted_finish_date, predicted_at, prediction_context
           FROM public.duration_algorithm_accuracy_events
          WHERE project_id = ?
            AND engine_code = ?
            AND backtest_status = 'prediction_pending'
          ORDER BY predicted_at ASC
          LIMIT 1`,
        [projectId, engineCode],
      )
    return rows[0] ?? null
  }

  const supabase = getSupabase()
  const table = supabase?.from?.('duration_algorithm_accuracy_events')
  const projectId = normalizeText(input.projectId)
  const taskId = normalizeText(input.taskId)
  const engineCode = normalizeText(input.engineCode)
  if (!table?.select || !projectId || !engineCode) return null

  let query = table
    .select('id, engine_code, dedupe_key, predicted_start_date, predicted_duration_days, predicted_finish_date, predicted_at, prediction_context')
    .eq('project_id', projectId)
    .eq('engine_code', engineCode)
    .eq('backtest_status', 'prediction_pending')
  if (taskId) query = query.eq('task_id', taskId)
  query = query
    .order('predicted_at', { ascending: true })
    .limit(1)

  return await maybeSingle(query) as AccuracyEventRow | null
}

export async function recordDurationAccuracyPrediction(input: DurationAccuracyPredictionInput) {
  const supabase = getSupabase()
  const table = supabase?.from?.('duration_algorithm_accuracy_events')
  const useDirectSql = dbService.usesDirectSqlRuntimePath()
  if (!useDirectSql && !table?.insert) return null

  const engineCode = normalizeText(input.engineCode)
  const outputKind = normalizeText(input.outputKind)
  if (!engineCode || !outputKind) return null

  const now = new Date().toISOString()
  const predictedDurationDays = buildPredictedDuration(input)
  const lineage = buildPredictionContext(input)
  if (
    isConstructionOrganizationPlanNetworkContext(lineage.context)
    && !hasStructuredBusinessType(lineage.context)
  ) return null
  const payload = {
    project_id: normalizeText(input.projectId),
    task_id: normalizeText(input.taskId),
    engine_code: engineCode,
    output_kind: outputKind,
    dedupe_key: normalizeText(input.dedupeKey),
    prediction_basis: normalizeText(input.predictionBasis) ?? 'runtime_snapshot',
    prediction_source: normalizeText(input.predictionSource) ?? 'runtime',
    model_version: normalizeText(input.modelVersion) ?? 'unknown',
    predicted_start_date: normalizeDate(input.predictedStartDate),
    predicted_finish_date: normalizeDate(input.predictedFinishDate),
    predicted_duration_days: predictedDurationDays,
    predicted_at: normalizeTimestamp(input.predictedAt),
    runtime_consumption_state: normalizeText(input.runtimeConsumptionState) ?? normalizeText(input.predictionBasis) ?? 'runtime_snapshot',
    seed_lineage: lineage.seedLineage,
    network_lineage: lineage.networkLineage,
    backtest_status: 'prediction_pending',
    prediction_context: lineage.context,
    updated_at: now,
  }

  try {
    if (useDirectSql) {
      const rows = await dbService.executeSQL<Record<string, unknown>>(
        `INSERT INTO public.duration_algorithm_accuracy_events (
           project_id,
           task_id,
           engine_code,
           output_kind,
           dedupe_key,
           prediction_basis,
           prediction_source,
           model_version,
           predicted_start_date,
           predicted_finish_date,
           predicted_duration_days,
           predicted_at,
           runtime_consumption_state,
           seed_lineage,
           network_lineage,
           backtest_status,
           prediction_context,
           updated_at
         ) VALUES (
           ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?::jsonb, ?::jsonb, ?, ?::jsonb, ?
         )
         ON CONFLICT (engine_code, dedupe_key) DO UPDATE SET
           project_id = EXCLUDED.project_id,
           task_id = EXCLUDED.task_id,
           output_kind = EXCLUDED.output_kind,
           prediction_basis = EXCLUDED.prediction_basis,
           prediction_source = EXCLUDED.prediction_source,
           model_version = EXCLUDED.model_version,
           predicted_start_date = EXCLUDED.predicted_start_date,
           predicted_finish_date = EXCLUDED.predicted_finish_date,
           predicted_duration_days = EXCLUDED.predicted_duration_days,
           predicted_at = EXCLUDED.predicted_at,
           runtime_consumption_state = EXCLUDED.runtime_consumption_state,
           seed_lineage = EXCLUDED.seed_lineage,
           network_lineage = EXCLUDED.network_lineage,
           backtest_status = EXCLUDED.backtest_status,
           prediction_context = EXCLUDED.prediction_context,
           updated_at = EXCLUDED.updated_at
         RETURNING *`,
        [
          payload.project_id,
          payload.task_id,
          payload.engine_code,
          payload.output_kind,
          payload.dedupe_key,
          payload.prediction_basis,
          payload.prediction_source,
          payload.model_version,
          payload.predicted_start_date,
          payload.predicted_finish_date,
          payload.predicted_duration_days,
          payload.predicted_at,
          payload.runtime_consumption_state,
          JSON.stringify(payload.seed_lineage),
          JSON.stringify(payload.network_lineage),
          payload.backtest_status,
          JSON.stringify(payload.prediction_context),
          payload.updated_at,
        ],
      )
      return rows[0] ?? payload
    }
    if (payload.dedupe_key && typeof table.upsert === 'function') {
      const { data, error } = await table.upsert(payload, {
        onConflict: 'engine_code,dedupe_key',
        ignoreDuplicates: false,
      })
      if (error) throw error
      return data ?? payload
    }
    const { data, error } = await table.insert(payload)
    if (error) throw error
    return data ?? payload
  } catch (error) {
    logger.warn('[durationAlgorithmAccuracyService] failed to record prediction snapshot', {
      engineCode,
      outputKind,
      projectId: payload.project_id,
      error: error instanceof Error ? error.message : String(error),
    })
    return null
  }
}

export async function recordDurationAccuracyBacktest(input: DurationAccuracyBacktestInput) {
  const supabase = getSupabase()
  const table = supabase?.from?.('duration_algorithm_accuracy_events')
  const useDirectSql = dbService.usesDirectSqlRuntimePath()
  if (!useDirectSql && !table?.update) return null

  const existing = await loadPredictionForBacktest(input)
  if (!existing?.id) return null

  const actualDurationDays = buildActualDurationForPrediction(input, existing)
  const predictedDurationDays = readPositiveInt(existing.predicted_duration_days)
  const signedErrorDays = buildSignedError({
    predictedDurationDays,
    actualDurationDays,
    predictedFinishDate: (existing as any).predicted_finish_date,
    actualFinishDate: input.actualFinishDate,
    requireActualDuration: requiresActualDurationForSignedError(existing, actualDurationDays),
  })
  const absoluteErrorDays = signedErrorDays == null ? null : Math.abs(signedErrorDays)
  const baselineAbsoluteErrorDays = readPositiveInt(input.baselineAbsoluteErrorDays)
  const now = new Date().toISOString()
  const payload = {
    actual_start_date: normalizeDate(input.actualStartDate),
    actual_finish_date: normalizeDate(input.actualFinishDate),
    actual_duration_days: actualDurationDays,
    signed_error_days: signedErrorDays,
    absolute_error_days: absoluteErrorDays,
    baseline_absolute_error_days: baselineAbsoluteErrorDays,
    overcompensated: baselineAbsoluteErrorDays !== null && absoluteErrorDays !== null
      ? absoluteErrorDays > baselineAbsoluteErrorDays
      : null,
    backtest_status: signedErrorDays == null ? 'actual_recorded_without_error' : 'backtested',
    actual_context: input.actualContext ?? {},
    backtested_at: now,
    updated_at: now,
  }

  try {
    if (useDirectSql) {
      const rows = await dbService.executeSQL<Record<string, unknown>>(
        `UPDATE public.duration_algorithm_accuracy_events
            SET actual_start_date = ?,
                actual_finish_date = ?,
                actual_duration_days = ?,
                signed_error_days = ?,
                absolute_error_days = ?,
                baseline_absolute_error_days = ?,
                overcompensated = ?,
                backtest_status = ?,
                actual_context = ?::jsonb,
                backtested_at = ?,
                updated_at = ?
          WHERE id = ?
          RETURNING *`,
        [
          payload.actual_start_date,
          payload.actual_finish_date,
          payload.actual_duration_days,
          payload.signed_error_days,
          payload.absolute_error_days,
          payload.baseline_absolute_error_days,
          payload.overcompensated,
          payload.backtest_status,
          JSON.stringify(payload.actual_context),
          payload.backtested_at,
          payload.updated_at,
          existing.id,
        ],
      )
      return rows[0] ?? payload
    }
    const { data, error } = await table.update(payload).eq('id', existing.id)
    if (error) throw error
    return data ?? payload
  } catch (error) {
    logger.warn('[durationAlgorithmAccuracyService] failed to record backtest result', {
      predictionId: existing.id,
      error: error instanceof Error ? error.message : String(error),
    })
    return null
  }
}

export async function backtestEarliestPendingDurationAccuracyPrediction(input: DurationAccuracyPendingBacktestInput) {
  const existing = await loadEarliestPendingPredictionForBacktest(input)
  if (!existing?.id) return null
  return await recordDurationAccuracyBacktest({
    ...input,
    predictionId: existing.id,
    actualStartDate: input.actualStartDate ?? existing.predicted_start_date ?? null,
  })
}

function groupEventRows(rows: AccuracyEventRow[]): DurationAccuracyMetric[] {
  const groups = new Map<string, AccuracyEventRow[]>()
  for (const row of rows) {
    const key = [
      normalizeText(row.engine_code) ?? 'unknown',
      normalizeText(row.output_kind) ?? 'unknown',
      normalizeText(row.model_version) ?? 'unknown',
      normalizeText(row.prediction_basis) ?? 'runtime_snapshot',
    ].join('|')
    groups.set(key, [...(groups.get(key) ?? []), row])
  }

  return [...groups.values()].map((group) => {
    const completed = group
      .map((row) => ({
        signed: readNumber(row.signed_error_days),
        absolute: readNumber(row.absolute_error_days),
        actual: readNumber(row.actual_duration_days),
        baselineAbsolute: readNumber(row.baseline_absolute_error_days),
        overcompensated: readBoolean(row.overcompensated),
      }))
      .filter((row) => row.signed !== null || row.absolute !== null)
    const absoluteErrors = completed
      .map((row) => row.absolute ?? Math.abs(row.signed ?? 0))
      .filter((value) => Number.isFinite(value))
    const signedErrors = completed
      .map((row) => row.signed)
      .filter((value): value is number => value !== null && Number.isFinite(value))
    const overcompensationValues = completed
      .map((row) => {
        if (row.overcompensated !== null) return row.overcompensated ? 1 : 0
        const absolute = row.absolute ?? Math.abs(row.signed ?? 0)
        return row.baselineAbsolute !== null && Number.isFinite(absolute)
          ? (absolute > row.baselineAbsolute ? 1 : 0)
          : null
      })
      .filter((value): value is 0 | 1 => value !== null)
    const mapeValues = completed
      .map((row) => {
        const absolute = row.absolute ?? Math.abs(row.signed ?? 0)
        return row.actual && row.actual > 0 ? absolute / row.actual * 100 : null
      })
      .filter((value): value is number => value !== null && Number.isFinite(value))
    const hitValues = completed
      .map((row) => {
        const absolute = row.absolute ?? Math.abs(row.signed ?? 0)
        return Number.isFinite(absolute) ? (absolute <= 3 ? 1 : 0) : null
      })
      .filter((value): value is 0 | 1 => value !== null)
    const first = group[0]
    return {
      engineCode: normalizeText(first.engine_code) ?? 'unknown',
      outputKind: normalizeText(first.output_kind) ?? 'unknown',
      metricBasis: 'duration_algorithm_accuracy_events.signed_error_days',
      predictionBasis: normalizeText(first.prediction_basis),
      modelVersion: normalizeText(first.model_version),
      sampleCount: completed.length,
      maeDays: round(average(absoluteErrors)),
      mdAeDays: round(median(absoluteErrors)),
      biasDays: round(average(signedErrors)),
      mape: round(average(mapeValues)),
      overcompensationRate: round(average(overcompensationValues), 3),
      hitRate: round(average(hitValues), 3),
      status: completed.length > 0 ? 'backtested' : 'prediction_pending',
      lastBacktestedAt: maxTimestamp(group.map((row) => row.backtested_at ?? row.updated_at)),
      source: 'duration_algorithm_accuracy_events' as const,
    }
  })
}

function overlayRowsToMetrics(rows: ForecastOverlayRow[]): DurationAccuracyMetric[] {
  return rows.map((row) => ({
    engineCode: 'task_remaining_forecast',
    outputKind: 'remaining_duration_forecast',
    metricBasis: 'task_duration_forecasts.forecast_error_days',
    predictionBasis: 'runtime_forecast_overlay',
    modelVersion: normalizeText(row.model_version),
    sampleCount: Math.max(0, Math.trunc(readNumber(row.sample_count) ?? 0)),
    maeDays: round(readNumber(row.mean_absolute_error_days)),
    mdAeDays: null,
    biasDays: round(readNumber(row.bias_error_days)),
    mape: null,
    overcompensationRate: round(readNumber(row.overcompensation_rate), 3),
    hitRate: null,
    status: normalizeText(row.overlay_status) ?? 'candidate',
    lastBacktestedAt: normalizeText(row.updated_at ?? row.generated_at),
    source: 'duration_forecast_project_overlays',
  }))
}

async function loadDirectAccuracyEventRows(
  projectId: string | null,
  projectIds: string[],
  engineCode: string | null,
): Promise<AccuracyEventRow[]> {
  const scopedProjectIds = projectId ? [projectId] : projectIds.length > 0 ? projectIds : null
  if (scopedProjectIds && engineCode) {
    return await dbService.executeSQL<AccuracyEventRow>(
      `SELECT id, project_id, task_id, engine_code, output_kind, prediction_basis, model_version,
              predicted_duration_days, actual_duration_days, signed_error_days, absolute_error_days,
              baseline_absolute_error_days, overcompensated, backtest_status, backtested_at, updated_at
         FROM public.duration_algorithm_accuracy_events
        WHERE project_id = ANY(?::uuid[])
          AND engine_code = ?`,
      [scopedProjectIds, engineCode],
    )
  }
  if (scopedProjectIds) {
    return await dbService.executeSQL<AccuracyEventRow>(
      `SELECT id, project_id, task_id, engine_code, output_kind, prediction_basis, model_version,
              predicted_duration_days, actual_duration_days, signed_error_days, absolute_error_days,
              baseline_absolute_error_days, overcompensated, backtest_status, backtested_at, updated_at
         FROM public.duration_algorithm_accuracy_events
        WHERE project_id = ANY(?::uuid[])`,
      [scopedProjectIds],
    )
  }
  if (engineCode) {
    return await dbService.executeSQL<AccuracyEventRow>(
      `SELECT id, project_id, task_id, engine_code, output_kind, prediction_basis, model_version,
              predicted_duration_days, actual_duration_days, signed_error_days, absolute_error_days,
              baseline_absolute_error_days, overcompensated, backtest_status, backtested_at, updated_at
         FROM public.duration_algorithm_accuracy_events
        WHERE engine_code = ?`,
      [engineCode],
    )
  }
  return await dbService.executeSQL<AccuracyEventRow>(
    `SELECT id, project_id, task_id, engine_code, output_kind, prediction_basis, model_version,
            predicted_duration_days, actual_duration_days, signed_error_days, absolute_error_days,
            baseline_absolute_error_days, overcompensated, backtest_status, backtested_at, updated_at
       FROM public.duration_algorithm_accuracy_events`,
  )
}

async function loadDirectForecastOverlayRows(
  projectId: string | null,
  projectIds: string[],
): Promise<ForecastOverlayRow[]> {
  const scopedProjectIds = projectId ? [projectId] : projectIds.length > 0 ? projectIds : null
  if (scopedProjectIds) {
    return await dbService.executeSQL<ForecastOverlayRow>(
      `SELECT project_id, model_key, model_version, overlay_status, sample_count,
              mean_absolute_error_days, bias_error_days, updated_at, generated_at
         FROM public.duration_forecast_project_overlays
        WHERE project_id = ANY(?::uuid[])`,
      [scopedProjectIds],
    )
  }
  return await dbService.executeSQL<ForecastOverlayRow>(
    `SELECT project_id, model_key, model_version, overlay_status, sample_count,
            mean_absolute_error_days, bias_error_days, updated_at, generated_at
       FROM public.duration_forecast_project_overlays`,
  )
}

async function loadStandardDurationReferenceReplayMetric(
  companyId: string | null,
  projectId: string | null,
  onError?: () => void,
): Promise<DurationAccuracyMetric | null> {
  try {
    const report = await buildStandardWorkDurationSeedReplayGovernanceReport({
      companyId,
      projectId,
    })
    const replay = report.replay
    const byCode = Array.isArray(replay.byStandardWorkCode) ? replay.byStandardWorkCode : []
    const weighted = byCode
      .map((item) => ({
        sampleCount: Math.max(0, Math.trunc(readNumber((item as any).sampleCount) ?? 0)),
        mape: readNumber((item as any).medianAbsolutePercentageError),
      }))
      .filter((item) => item.sampleCount > 0 && item.mape !== null)
    const totalWeight = weighted.reduce((sum, item) => sum + item.sampleCount, 0)
    const weightedMapeRatio = totalWeight > 0
      ? weighted.reduce((sum, item) => sum + (item.mape ?? 0) * item.sampleCount, 0) / totalWeight
      : null
    const eligibleSampleCount = Math.max(0, Math.trunc(readNumber((replay.summary as any)?.eligibleSampleCount) ?? totalWeight))
    const hitRate = readNumber((replay.summary as any)?.overallWithinThirtyPercentRatio)
    if (eligibleSampleCount <= 0 && weightedMapeRatio === null && hitRate === null) return null
    return {
      engineCode: 'standard_duration_reference',
      outputKind: 'standard_duration_reference',
      metricBasis: 'standardWorkDurationSeedReplayService.medianAbsolutePercentageError',
      predictionBasis: 'seed_replay_report_only',
      modelVersion: 'standard_duration_seed_replay',
      sampleCount: eligibleSampleCount,
      maeDays: null,
      mdAeDays: null,
      biasDays: null,
      mape: weightedMapeRatio === null ? null : round(weightedMapeRatio * 100),
      overcompensationRate: null,
      hitRate: round(hitRate, 3),
      status: weightedMapeRatio === null ? 'report_only_replay_not_runtime_backtest' : 'report_only_replay_backtested',
      lastBacktestedAt: report.generatedAt ?? null,
      source: 'standard_work_duration_seed_replay',
    }
  } catch (error) {
    onError?.()
    logger.warn('[durationAlgorithmAccuracyService] failed to load standard duration replay accuracy', { companyId, projectId, error })
    return null
  }
}

function withEngineDefaults(metrics: DurationAccuracyMetric[], engineCode: string | null) {
  const requestedEngines = engineCode
    ? [engineCode]
    : Object.keys(ENGINE_ACCURACY_DEFAULTS)

  const knownMetrics = [...metrics]
  for (const requestedEngine of requestedEngines) {
    if (knownMetrics.some((metric) => metric.engineCode === requestedEngine)) continue
    const defaults = ENGINE_ACCURACY_DEFAULTS[requestedEngine as DurationAlgorithmEngineCode]
    if (!defaults) continue
    knownMetrics.push({
      engineCode: requestedEngine,
      ...defaults,
    })
  }

  return knownMetrics
}

type DurationAlgorithmStep2GateRequirement = Omit<DurationAlgorithmStep2Gate, 'status'> & {
  requiredEngineCodes: DurationAlgorithmEngineCode[]
}

const STEP2_STRUCTURAL_GATE_REQUIREMENTS: DurationAlgorithmStep2GateRequirement[] = [
  {
    code: 'e1_project_company_system_benchmark_blend',
    label: 'E1 project/company/system benchmark candidates blend into one reference path',
    severity: 'CLASS_A',
    evidence: 'durationSuggestionService.collectBenchmarkCandidates + benchmarkBlendScopes',
    requiredEngineCodes: ['standard_duration_reference'],
  },
  {
    code: 'e2_curve_aware_spi_and_velocity_candidates',
    label: 'E2 reference, SPI/EAC, velocity and probability candidates consume progress-curve remaining effort',
    severity: 'CLASS_A',
    evidence: 'taskDurationForecastService.remainingEffortRatioForCurve + buildSpiCandidate(curveType) + curveAwareVelocityDays',
    requiredEngineCodes: ['task_remaining_forecast'],
  },
  {
    code: 'e2_back_heavy_structural_tail_reserve',
    label: 'E2 back-heavy work carries structural tail reserve before stuck/plateau signals',
    severity: 'CLASS_A',
    evidence: 'taskDurationForecastService.backHeavyRemainingEffortRatio applies structural tail + variable work before stuckFinishingFloorDays',
    requiredEngineCodes: ['task_remaining_forecast'],
  },
  {
    code: 'e2_generic_benchmark_variance_column',
    label: 'E2 consumes duration benchmark variance dedicated columns before metadata/default spread fallback',
    severity: 'CLASS_B',
    evidence: 'templateDurationGovernanceService writes duration_benchmarks.variance/coefficient_of_variation; durationSuggestionService selects and surfaces benchmarkVariance; taskDurationForecastService reads probabilityDuration variance',
    requiredEngineCodes: ['task_remaining_forecast'],
  },
  {
    code: 'e3_cpm_construction_calendar_day_unit_alignment',
    label: 'E3 CPM backtest keeps calendar span and construction production-day semantics aligned',
    severity: 'CLASS_A',
    evidence: 'projectCriticalPathService.cpmSpanDays + durationAlgorithmAccuracyService.buildActualDurationForPrediction(durationDayUnit=construction_production_day)',
    requiredEngineCodes: ['critical_path_cpm'],
  },
  {
    code: 'e5_confidence_band_feasibility_verdict',
    label: 'E5 conservative recoverable confidence band participates in feasibility and proposal verdicts',
    severity: 'CLASS_A',
    evidence: 'scheduleAccelerationService.confidenceAdjustedUnrecoverableDays feeds resolveTargetFeasibilityVerdict and proposal verdict',
    requiredEngineCodes: ['schedule_acceleration_target'],
  },
  {
    code: 'e5_network_slack_recovery_budget_factor',
    label: 'E5 network slack facts affect runtime recovery budget',
    severity: 'CLASS_A',
    evidence: 'scheduleAccelerationService.networkSlackRecoveryFactor feeds recoveryBudgetFactor',
    requiredEngineCodes: ['schedule_acceleration_target'],
  },
]

const DIRECTIONAL_BIAS_GATE_CODES = new Set([
  'e2_curve_aware_spi_and_velocity_candidates',
  'e2_back_heavy_structural_tail_reserve',
  'e5_confidence_band_feasibility_verdict',
])

const STRUCTURAL_EVIDENCE_BLOCKED_STATUSES = new Set([
  'blocked',
  'failed',
  'rejected',
  'accuracy_failed',
  'replay_failed',
  'runtime_evidence_failed',
])

function hasStructuralAccuracyEvidence(metric: DurationAccuracyMetric) {
  return metric.sampleCount > 0
    || metric.maeDays !== null
    || metric.mdAeDays !== null
    || metric.biasDays !== null
    || metric.mape !== null
    || metric.overcompensationRate !== null
    || metric.hitRate !== null
}

function hasBlockedStructuralEvidence(metric: DurationAccuracyMetric) {
  const status = normalizeText(metric.status)?.toLowerCase()
  return status ? STRUCTURAL_EVIDENCE_BLOCKED_STATUSES.has(status) : false
}

function buildStep2StructuralGates(metrics: DurationAccuracyMetric[]): DurationAlgorithmStep2Gate[] {
  return STEP2_STRUCTURAL_GATE_REQUIREMENTS.map((requirement) => {
    const candidateMetrics = metrics.filter((metric) => requirement.requiredEngineCodes.includes(metric.engineCode as DurationAlgorithmEngineCode))
    const status: DurationAlgorithmStep2Gate['status'] = candidateMetrics.some(hasBlockedStructuralEvidence)
      ? 'blocked'
      : candidateMetrics.some(hasStructuralAccuracyEvidence)
        ? 'passed'
        : 'waiting'

    return {
      ...requirement,
      status,
    }
  })
}

function buildStep2Readiness(metrics: DurationAccuracyMetric[]): DurationAlgorithmStep2Readiness {
  const minimumBacktestSampleCount = 5
  const enginesWithAccuracySamples = metrics
    .filter((metric) => metric.sampleCount >= minimumBacktestSampleCount)
    .map((metric) => metric.engineCode)
  const missingSampleEngineCodes = metrics
    .filter((metric) => metric.sampleCount < minimumBacktestSampleCount)
    .map((metric) => metric.engineCode)
  const gates = buildStep2StructuralGates(metrics)
  const classABlockerCount = gates.filter((gate) => gate.severity === 'CLASS_A' && gate.status === 'blocked').length
  const structuralReady = gates
    .filter((gate) => gate.severity === 'CLASS_A')
    .every((gate) => gate.status === 'passed')
  const directionalBiasesCorrected = gates
    .filter((gate) => DIRECTIONAL_BIAS_GATE_CODES.has(gate.code))
    .every((gate) => gate.status === 'passed')

  return {
    readyForStep2: structuralReady && directionalBiasesCorrected && classABlockerCount === 0,
    structuralReady,
    directionalBiasesCorrected,
    classABlockerCount,
    gates,
    parameterDataStatus: {
      status: missingSampleEngineCodes.length === 0
        ? 'enough_samples_for_parameter_calibration'
        : 'data_collection_open',
      minimumBacktestSampleCount,
      enginesWithAccuracySamples,
      missingSampleEngineCodes,
    },
  }
}

export async function getDurationAlgorithmAccuracySummary(params: {
  companyId?: string | null
  projectId?: string | null
  projectIds?: string[] | null
  engineCode?: string | null
} = {}): Promise<DurationAccuracySummary> {
  const supabase = getSupabase()
  const useDirectSql = dbService.usesDirectSqlRuntimePath()
  const companyId = normalizeText(params.companyId)
  const projectId = normalizeText(params.projectId)
  const hasExplicitProjectScope = !projectId && Array.isArray(params.projectIds)
  const projectIds = projectId
    ? []
    : Array.from(new Set((params.projectIds ?? []).map(normalizeText).filter((value): value is string => Boolean(value))))
  const hasExplicitEmptyProjectScope = hasExplicitProjectScope && projectIds.length === 0
  const engineCode = normalizeText(params.engineCode)
  const generatedAt = new Date().toISOString()
  const metrics: DurationAccuracyMetric[] = []
  const sourceErrors: DurationAccuracySourceError[] = []
  const configuredSources: Array<DurationAccuracyMetric['source']> = ['duration_algorithm_accuracy_events']
  if (!engineCode || engineCode === 'task_remaining_forecast') {
    configuredSources.push('duration_forecast_project_overlays')
  }
  if (!engineCode || engineCode === 'standard_duration_reference') {
    configuredSources.push('standard_work_duration_seed_replay')
  }

  try {
    if (hasExplicitEmptyProjectScope) {
      // An explicit empty allow-list must remain empty.
    } else if (useDirectSql) {
      const rows = await loadDirectAccuracyEventRows(projectId, projectIds, engineCode)
      metrics.push(...groupEventRows(rows))
    } else {
      const table = supabase?.from?.('duration_algorithm_accuracy_events')
      if (!table?.select) throw new Error('duration_algorithm_accuracy_events_read_unavailable')
      let query = table.select('id, project_id, task_id, engine_code, output_kind, prediction_basis, model_version, predicted_duration_days, actual_duration_days, signed_error_days, absolute_error_days, baseline_absolute_error_days, overcompensated, backtest_status, backtested_at, updated_at')
      if (projectId) query = query.eq('project_id', projectId)
      else if (projectIds.length > 0) query = query.in('project_id', projectIds)
      if (engineCode) query = query.eq('engine_code', engineCode)
      const { data, error } = await query
      if (error) throw error
      metrics.push(...groupEventRows(Array.isArray(data) ? data as AccuracyEventRow[] : []))
    }
  } catch (error) {
    sourceErrors.push({
      source: 'duration_algorithm_accuracy_events',
      code: 'duration_accuracy_events_read_failed',
    })
    logger.warn('[durationAlgorithmAccuracyService] failed to summarize accuracy event rows', { projectId, engineCode, error })
  }

  if (!engineCode || engineCode === 'task_remaining_forecast') {
    try {
      if (hasExplicitEmptyProjectScope) {
        // An explicit empty allow-list must remain empty.
      } else if (useDirectSql) {
        const rows = await loadDirectForecastOverlayRows(projectId, projectIds)
        metrics.push(...overlayRowsToMetrics(rows))
      } else {
        const table = supabase?.from?.('duration_forecast_project_overlays')
        if (!table?.select) throw new Error('duration_forecast_project_overlays_read_unavailable')
        let query = table.select('project_id, model_key, model_version, overlay_status, sample_count, mean_absolute_error_days, bias_error_days, updated_at, generated_at')
        if (projectId) query = query.eq('project_id', projectId)
        else if (projectIds.length > 0) query = query.in('project_id', projectIds)
        const { data, error } = await query
        if (error) throw error
        metrics.push(...overlayRowsToMetrics(Array.isArray(data) ? data as ForecastOverlayRow[] : []))
      }
    } catch (error) {
      sourceErrors.push({
        source: 'duration_forecast_project_overlays',
        code: 'duration_forecast_overlay_read_failed',
      })
      logger.warn('[durationAlgorithmAccuracyService] failed to summarize remaining forecast overlay', { projectId, error })
    }
  }

  if (!engineCode || engineCode === 'standard_duration_reference') {
    const standardReplayMetric = await loadStandardDurationReferenceReplayMetric(companyId, projectId, () => {
      sourceErrors.push({
        source: 'standard_work_duration_seed_replay',
        code: 'standard_duration_replay_read_failed',
      })
    })
    if (standardReplayMetric) metrics.push(standardReplayMetric)
  }

  const failedSourceCount = new Set(sourceErrors.map((item) => item.source)).size
  const dataStatus: DurationAccuracySummary['dataStatus'] = failedSourceCount === 0
    ? 'ok'
    : failedSourceCount >= configuredSources.length
      ? 'unavailable'
      : 'partial'
  const completedMetrics = withEngineDefaults(metrics, engineCode)
  const engineCount = new Set(completedMetrics.map((metric) => metric.engineCode)).size
  return {
    projectId,
    projectIds: projectIds.length > 0 ? projectIds : undefined,
    engineCode,
    engineCount,
    generatedAt,
    metrics: completedMetrics.sort((left, right) => String(left.engineCode).localeCompare(String(right.engineCode))),
    dataStatus,
    sourceErrors,
    step2Readiness: engineCode ? undefined : buildStep2Readiness(completedMetrics),
  }
}
