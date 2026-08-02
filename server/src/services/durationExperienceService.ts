// v1.4.18: collect real task completion durations back into the enterprise duration base.

import { createHash } from 'node:crypto'

import { query } from '../database.js'
import type { Task } from '../types/db.js'
import { getProjectCompanyId } from '../auth/access.js'
import { logger } from '../middleware/logger.js'
import { isCompletedTask } from '../utils/taskStatus.js'
import { buildDurationContext, type DurationContextFactor } from './durationContextService.js'
import { resolveV1474BuildingPatternMatch } from './algorithmSeedResolver.js'
import {
  buildAndPersistAlgorithmAssetSampleHealthReport,
  type AlgorithmAssetSampleQualitySignal,
} from './algorithmAssetSampleHealthService.js'
import { buildConstructionSeedScopeContext, inferConstructionScopeFromFact } from './constructionScopeInferenceService.js'
import { supabase } from './dbService.js'
import { resolveProjectClimateRegion } from './projectClimateResolver.js'
import { readProjectGenerationFactsSnapshot } from './projectGenerationFactsSnapshotService.js'
import { buildAlgorithmFactContext, summarizeAlgorithmFactContext } from './algorithmFactContextService.js'
import { backtestEarliestPendingDurationAccuracyPrediction } from './durationAlgorithmAccuracyService.js'
import {
  mergeConstructionOrganizationLineageIntoContext,
  readConstructionOrganizationPlanNetworkRuntimeLineage,
} from './constructionOrganizationRuntimeLineageService.js'
import {
  effectiveConstructionCalendarBasis,
  effectiveConstructionCalendarWindowCount,
  isAuthoritativeConstructionCalendar,
  productionDaysBetweenInclusive,
  resolveConstructionCalendarContext,
  type ConstructionCalendarContext,
} from './constructionCalendar.js'
import { normalizeDurationDateUtc, orderedInclusiveDurationDays } from '../utils/durationDays.js'
import {
  businessDateKey,
  normalizeDurationMetricDto,
  normalizeRfc3339Timestamp,
} from './durationMetricService.js'
import { readTrustedDurationLearningRuntimeConsumptionsForTask } from './durationLearningRuntimeConsumptionService.js'
import { readTaskStructuredCauseAuthority } from './taskStructuredCauseAuthorityService.js'
import {
  listCurrentExecutionFacts,
} from './executionFactGovernanceService.js'
import {
  applyTaskExecutionFactAuthority as applyTaskExecutionFactAuthorityProjection,
  hasTaskExecutionFactAuthority,
  TASK_EXECUTION_FACT_AUTHORITY_TYPES,
} from './taskExecutionFactAuthorityService.js'

type SampleStrength = 'strong' | 'medium' | 'weak' | 'unusable'

export interface DurationExperienceCollectionOptions {
  previousTask?: Task | null
  actorId?: string | null
  trigger?: string
}

function toDurationDate(value?: string | null): Date | null {
  return normalizeDurationDateUtc(value)
}

function readPositiveInt(value: unknown): number | null {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? Math.ceil(parsed) : null
}

function readPositiveNumber(value: unknown): number | null {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

async function applyTaskExecutionFactAuthority(task: Task): Promise<Task> {
  const projectId = normalizeText(task.project_id)
  const taskId = normalizeText(task.id)
  if (!projectId || !taskId) return task
  const facts = await listCurrentExecutionFacts({
    projectId,
    entityType: 'task',
    entityIds: [taskId],
    factTypes: [...TASK_EXECUTION_FACT_AUTHORITY_TYPES],
  })
  return applyTaskExecutionFactAuthorityProjection([task], facts)[0] ?? task
}

function buildDurationExperienceEvidenceFingerprint(input: {
  companyId: string
  projectId: string
  taskId: string
  actualStartDate: string
  actualEndDate: string
  actualDuration: number
  plannedDuration: number
  standardWorkCode: string | null
}) {
  const digest = createHash('sha256')
    .update(JSON.stringify([
      'duration_experience.task_completion.v1',
      input.companyId,
      input.projectId,
      input.taskId,
      input.actualStartDate,
      input.actualEndDate,
      input.actualDuration,
      input.plannedDuration,
      input.standardWorkCode,
    ]))
    .digest('hex')
  return `sha256:${digest}`
}

function readCodeArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return [...new Set(value.map((item) => normalizeText(item).toLowerCase()).filter(Boolean))]
}

function readRecordArray(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return []
  return value
    .map(readRecord)
    .filter((item) => Object.keys(item).length > 0)
}

function resolveClimateSignal(month: number, climate: Awaited<ReturnType<typeof resolveProjectClimateRegion>>) {
  if (climate.coldWeatherMonths.includes(month)) return 'winter_low_temp'
  if (climate.rainySeasonMonths.includes(month)) return 'rainy_season'
  if (climate.highTempMonths.includes(month)) return 'summer_heat'
  return 'normal'
}

async function buildForecastLearningObservation(params: {
  task: Task
  actualStart: Date
  actualEnd: Date
  actualStartSource: string
  actualEndSource: string
  plannedDuration: number
  actualDuration: number
  constructionCalendar: ConstructionCalendarContext
}) {
  if (params.actualStartSource !== 'actual_start_date' || params.actualEndSource !== 'actual_end_date') return null
  if (!isAuthoritativeConstructionCalendar(params.constructionCalendar)) return null

  const taskId = normalizeText(params.task.id)
  if (!taskId) return null
  try {
    const table = (supabase as any).from?.('task_duration_forecasts')
    if (!table?.select) return null
    let query = table
      .select('id, generated_at, forecast_finish_date, remaining_duration_days, execution_reference_days, metadata, forecast_error_days, model_version, forecast_source, duration_calibration_source')
      .eq('task_id', taskId)
    if (typeof query.order === 'function') query = query.order('generated_at', { ascending: false })
    if (typeof query.limit === 'function') query = query.limit(1)
    const result = typeof query.maybeSingle === 'function'
      ? await query.maybeSingle()
      : await query
    if (result?.error) throw result.error
    const forecast = result?.data
    if (!forecast) return null

    const generatedAt = normalizeRfc3339Timestamp(forecast.generated_at)
    if (!generatedAt) return null
    const generatedAtDate = new Date(generatedAt)
    const expectedAsOf = businessDateKey(generatedAtDate, params.constructionCalendar.timezone)
    const metadata = readRecord(forecast.metadata)
    const executionReferenceDuration = normalizeDurationMetricDto(
      metadata.executionReferenceDuration ?? metadata.execution_reference_duration,
    )
    if (
      !executionReferenceDuration
      || executionReferenceDuration.availability !== 'available'
      || executionReferenceDuration.unit !== 'construction_production_day'
      || executionReferenceDuration.calendarRef !== params.constructionCalendar.calendarRef
      || executionReferenceDuration.calendarVersion !== params.constructionCalendar.calendarVersion
      || executionReferenceDuration.timezone !== params.constructionCalendar.timezone
      || executionReferenceDuration.asOf !== expectedAsOf
    ) return null

    const forecastDurationDays = readPositiveInt(executionReferenceDuration.value)
    if (!forecastDurationDays) return null
    const executionReferenceDays = readPositiveInt(forecast.execution_reference_days)
    const remainingDurationDays = readPositiveInt(forecast.remaining_duration_days)
    const forecastFinishDate = normalizeText(forecast.forecast_finish_date)

    const forecastRatio = readPositiveNumber(params.actualDuration / forecastDurationDays)
    const planRatio = readPositiveNumber(params.actualDuration / params.plannedDuration)
    return {
      learning_target: 'forecast_ratio_velocity_multiplier',
      production_consumption_policy: 'active_velocity_multiplier_input',
      forecast_id: normalizeText(forecast.id),
      forecast_generated_at: normalizeText(forecast.generated_at),
      forecast_finish_date: forecastFinishDate,
      forecast_duration_days: forecastDurationDays,
      forecast_duration_source: 'execution_reference_duration',
      remaining_duration_days: remainingDurationDays,
      execution_reference_days: executionReferenceDays,
      forecast_error_days: readPositiveNumber(forecast.forecast_error_days),
      model_version: normalizeText(forecast.model_version),
      forecast_source: normalizeText(forecast.forecast_source),
      duration_calibration_source: normalizeText(forecast.duration_calibration_source),
      actual_start_source: params.actualStartSource,
      actual_end_source: params.actualEndSource,
      actual_duration_source: 'actual_start_date_to_actual_end_date',
      actual_duration_days: params.actualDuration,
      planned_duration_days: params.plannedDuration,
      forecast_ratio: forecastRatio == null ? null : Number(forecastRatio.toFixed(3)),
      plan_ratio: planRatio == null ? null : Number(planRatio.toFixed(3)),
    }
  } catch (error) {
    logger.warn('[durationExperienceService] failed to build forecast learning sidecar observation', {
      taskId,
      error: error instanceof Error ? error.message : String(error),
    })
    return null
  }
}

async function buildBuildingPatternObservation(task: Task, standardMetadata: Record<string, unknown>, context: {
  projectId: string
  standardWorkCode: string | null
  standardWorkCodes: string[]
  templateNodeId: string | null
  methodVariantCodes: string[]
  elementVariantCodes: string[]
}) {
  try {
    const taskLike = task as any
    const factContext = buildAlgorithmFactContext({
      phase: 'duration_context',
      projectGenerationFacts: readProjectGenerationFactsSnapshot(standardMetadata),
      runtimeExecutionFacts: {
        progressCompletionRatio: task.progress == null ? undefined : Number(task.progress) / 100,
        evidenceCodes: ['completed_task_duration_experience'],
      },
    })
    const projectGenerationFacts = factContext.projectGenerationFacts
    const scopeInference = inferConstructionScopeFromFact(taskLike)
    const inferredSeedContext = buildConstructionSeedScopeContext(taskLike, {
      scopeDimensions: [
        taskLike.building_object_id ? 'building' : null,
        taskLike.floor_object_id ? 'floor' : null,
        taskLike.physical_zone_object_id || taskLike.functional_area_object_id ? 'zone' : null,
        taskLike.section_object_id ? 'section' : null,
        taskLike.engineering_object_id ? 'workface' : null,
      ].filter((item): item is string => Boolean(item)),
    })
    const match = await resolveV1474BuildingPatternMatch(
      [
        normalizeText(task.title),
        normalizeText(task.standard_work_name),
        normalizeText(task.standard_work_code),
        normalizeText(projectGenerationFacts.businessType),
        normalizeText(projectGenerationFacts.structureTypeCode),
      ].filter(Boolean).join(' '),
      {
        projectId: context.projectId,
        standardWorkCode: context.standardWorkCode,
        standardWorkCodes: context.standardWorkCodes,
        templateNodeId: context.templateNodeId,
        methodVariantCodes: context.methodVariantCodes,
        elementVariantCodes: context.elementVariantCodes,
        projectTypeCode: normalizeText(projectGenerationFacts.businessType) || null,
        structureTypeCode: normalizeText(projectGenerationFacts.structureTypeCode) || null,
        algorithmFactContext: summarizeAlgorithmFactContext(factContext),
        scopeDimensions: inferredSeedContext.scopeDimensions,
        rhythmDrivers: [
          ...(inferredSeedContext.rhythmDrivers ?? []),
          taskLike.floor_object_id ? 'floor_count' : null,
          taskLike.building_object_id ? 'building_count' : null,
          taskLike.physical_zone_object_id || taskLike.functional_area_object_id ? 'zone_count' : null,
          taskLike.section_object_id ? 'section_count' : null,
          taskLike.engineering_object_id ? 'workface_count' : null,
          task.acceptance_required ? 'acceptance_gate' : null,
          task.material_required ? 'readiness_gate' : null,
          taskLike.participant_unit_id ? 'resource_capacity' : null,
        ].filter((item): item is string => Boolean(item)),
        primaryWorkfaceType: normalizeText(readRecord(standardMetadata.buildingPatternObservation).primaryWorkfaceType)
          || inferredSeedContext.primaryWorkfaceType
          || (taskLike.floor_object_id ? 'standard_floor' : null)
          || (taskLike.building_object_id ? 'building_zone' : null),
        phaseWindow: normalizeText(readRecord(standardMetadata.buildingPatternObservation).phaseWindow)
          || inferredSeedContext.phaseWindow
          || null,
        expansionStrategy: normalizeText(readRecord(standardMetadata.buildingPatternObservation).expansionStrategy)
          || inferredSeedContext.expansionStrategy
          || null,
      },
    )
    if (!match.record) return null
    return {
      pattern_code: match.patternCode ?? match.record.patternCode ?? null,
      pattern_name: normalizeText(match.record.patternName) || null,
      match_score: match.matchScore,
      confidence_score: match.confidenceScore,
      confidence_level: match.confidenceLevel,
      matched_signals: match.matchedSignals,
      missing_signals: match.missingSignals,
      action_policy: match.actionPolicy,
      rhythm_strategy_codes: Array.isArray((match.record as any).rhythmStrategyCodes) ? (match.record as any).rhythmStrategyCodes : [],
      expansion_strategy: normalizeText((match.record as any).expansionStrategy) || null,
      rhythm_unit: normalizeText((match.record as any).rhythmUnit) || null,
      primary_workface_type: normalizeText((match.record as any).primaryWorkfaceType) || null,
      phase_window: normalizeText((match.record as any).phaseWindow) || null,
      inferred_system_key: scopeInference.systemKey,
      inferred_workface_key: scopeInference.workfaceKey,
      inferred_scope_dimensions: scopeInference.scopeDimensions,
      inferred_rhythm_drivers: scopeInference.rhythmDrivers,
      inference_source_policy: 'explicit_scope_then_standard_seed_then_feature_profile_then_title_weak',
      matched_standard_work_codes: Array.isArray((match.record as any).applicableStandardWorkCodes) ? (match.record as any).applicableStandardWorkCodes : [],
      backend_only_confidence_policy: true,
      runtime_effect: 'candidate_only_until_governed',
    }
  } catch (error) {
    logger.warn('[durationExperienceService] failed to resolve building pattern observation for duration sample', {
      taskId: task.id,
      error: error instanceof Error ? error.message : String(error),
    })
    return null
  }
}

function resolveActualStart(task: Task): { date: Date | null; source: string; strength: SampleStrength } {
  const actualStart = toDurationDate(task.actual_start_date)
  if (actualStart) return { date: actualStart, source: 'actual_start_date', strength: 'strong' }

  const firstProgress = toDurationDate(task.first_progress_at)
  if (firstProgress) return { date: firstProgress, source: 'first_progress_at', strength: 'medium' }

  const plannedLikeStart = toDurationDate(task.start_date ?? task.planned_start_date ?? null)
  if (plannedLikeStart) return { date: plannedLikeStart, source: 'planned_or_schedule_start', strength: 'weak' }

  return { date: null, source: 'missing', strength: 'weak' }
}

function resolveActualEnd(task: Task): { date: Date | null; source: string; strength: SampleStrength } {
  const actualEnd = toDurationDate(task.actual_end_date)
  if (actualEnd) return { date: actualEnd, source: 'actual_end_date', strength: 'strong' }

  const updatedAtCompletionEvent = toDurationDate(task.updated_at)
  if (updatedAtCompletionEvent) {
    return { date: updatedAtCompletionEvent, source: 'updated_at_completion_event', strength: 'weak' }
  }

  return { date: null, source: 'missing', strength: 'weak' }
}

function confidenceForStrength(strength: SampleStrength) {
  if (strength === 'strong') return { level: 'high', score: 85 }
  if (strength === 'medium') return { level: 'medium', score: 65 }
  if (strength === 'unusable') return { level: 'low', score: 15 }
  return { level: 'low', score: 45 }
}

function sampleQualitySignalForStrength(strength: SampleStrength): AlgorithmAssetSampleQualitySignal {
  if (strength === 'unusable') return 'unusable'
  if (strength === 'weak') return 'low_confidence_match'
  return 'verified'
}

async function resolveCompanyId(projectId: string) {
  try {
    return await getProjectCompanyId(projectId)
  } catch (error) {
    logger.warn('[durationExperienceService] failed to resolve project company for duration sample', {
      projectId,
      error: error instanceof Error ? error.message : String(error),
    })
    return null
  }
}

function rankSampleStrength(strength: SampleStrength) {
  if (strength === 'strong') return 3
  if (strength === 'medium') return 2
  if (strength === 'weak') return 1
  return 0
}

function weakerSampleStrength(left: SampleStrength, right: SampleStrength): SampleStrength {
  return rankSampleStrength(left) <= rankSampleStrength(right) ? left : right
}

async function persistDurationExperienceSampleHealthEvent(params: {
  task: Task
  companyId: string | null
  actualStartDate: Date
  actualEnd: Date
  actualEndSource: string
  sampleStrength: SampleStrength
}) {
  await buildAndPersistAlgorithmAssetSampleHealthReport({
    assetKey: 'duration_experience.task_completion',
    sourceModule: 'durationExperienceService',
    learningTarget: 'base_duration',
    samples: [
      {
        sampleId: `duration_experience:${params.task.id}:task_completion`,
        companyId: params.companyId,
        projectId: String(params.task.project_id),
        workCode: normalizeText(params.task.standard_work_code) || null,
        status: params.task.status ?? 'completed',
        actualStartDate: params.actualStartDate.toISOString(),
        actualEndDate: params.actualEndSource === 'actual_end_date' ? params.actualEnd.toISOString() : null,
        plannedStartDate: normalizeText(params.task.planned_start_date ?? params.task.start_date) || null,
        firstProgressAt: normalizeText(params.task.first_progress_at) || null,
        completionEventAt: normalizeText(params.task.actual_end_date) || null,
        updatedAt: normalizeText(params.task.updated_at) || null,
        qualitySignal: sampleQualitySignalForStrength(params.sampleStrength),
        benchmarkEligible: params.sampleStrength !== 'weak' && params.sampleStrength !== 'unusable',
        metadata: {
          actual_end_source: params.actualEndSource,
        },
      },
    ],
  })
}

function sampleHealthStatusForStrength(strength: SampleStrength) {
  if (strength === 'unusable') return 'rejected'
  if (strength === 'weak') return 'weak'
  return 'accepted'
}

function trustedDurationLearningRuntimeConsumptions(metadata: Record<string, unknown>) {
  const value = metadata.duration_learning_runtime_consumptions
  if (!Array.isArray(value)) return []
  return value
    .map(readRecord)
    .filter((consumption) => (
      normalizeText(consumption.consumptionKey ?? consumption.consumption_key)
      && normalizeText(consumption.publicationKey ?? consumption.publication_key)
      && normalizeText(consumption.assetKey ?? consumption.asset_key)
      && normalizeText(consumption.artifactKey ?? consumption.artifact_key)
    ))
}

async function backtestTaskRemainingForecastPrediction(params: {
  task: Task
  companyId: string | null
  actualStartDate: Date
  actualEnd: Date
  actualDuration: number
  plannedDuration: number
  sampleStrength: SampleStrength
  metadata: Record<string, unknown>
}) {
  const sampleHealthStatus = sampleHealthStatusForStrength(params.sampleStrength)
  if (sampleHealthStatus !== 'accepted') return
  try {
    await backtestEarliestPendingDurationAccuracyPrediction({
      projectId: String(params.task.project_id),
      taskId: String(params.task.id),
      engineCode: 'task_remaining_forecast',
      actualStartDate: params.actualStartDate,
      actualFinishDate: params.actualEnd,
      actualDurationDays: params.actualDuration,
      baselineAbsoluteErrorDays: Math.abs(params.actualDuration - params.plannedDuration),
      actualContext: {
        sourceService: 'durationExperienceService',
        sourceType: 'task_completion',
        sampleStrength: params.sampleStrength,
        sampleHealthStatus,
        companyId: params.companyId,
        projectId: String(params.task.project_id),
        taskId: String(params.task.id),
        standardWorkCode: normalizeText(params.task.standard_work_code) || null,
        templateNodeId: normalizeText(params.task.template_node_id) || null,
        wbsNodeType: normalizeText(params.task.wbs_node_type) || null,
        plannedDurationDays: params.plannedDuration,
        actualDurationDays: params.actualDuration,
        actualStartSource: normalizeText(params.metadata.actual_start_source) || null,
        actualEndSource: normalizeText(params.metadata.actual_end_source) || null,
        benchmarkContextKey: normalizeText(params.metadata.benchmark_context_key) || null,
        durationLearningRuntimeConsumptions: trustedDurationLearningRuntimeConsumptions(params.metadata),
      },
    })
  } catch (error) {
    logger.warn('[durationExperienceService] failed to backtest task remaining duration prediction', {
      taskId: params.task.id,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

function buildTaskCompletionBacktestContext(params: {
  task: Task
  companyId: string | null
  actualDuration: number
  plannedDuration: number
  sampleStrength: SampleStrength
  sampleHealthStatus: ReturnType<typeof sampleHealthStatusForStrength>
  metadata: Record<string, unknown>
}) {
  const standardMetadata = readRecord(params.task.standard_task_metadata)
  const lineage = readConstructionOrganizationPlanNetworkRuntimeLineage(
    standardMetadata,
    'durationExperienceService.standardTaskMetadata',
  )
  return mergeConstructionOrganizationLineageIntoContext({
    sourceService: 'durationExperienceService',
    sourceType: 'task_completion',
    sampleStrength: params.sampleStrength,
    sampleHealthStatus: params.sampleHealthStatus,
    companyId: params.companyId,
    projectId: String(params.task.project_id),
    taskId: String(params.task.id),
    standardWorkCode: normalizeText(params.task.standard_work_code) || null,
    templateNodeId: normalizeText(params.task.template_node_id) || null,
    wbsNodeType: normalizeText(params.task.wbs_node_type) || null,
    plannedDurationDays: params.plannedDuration,
    actualDurationDays: params.actualDuration,
    actualStartSource: normalizeText(params.metadata.actual_start_source) || null,
    actualEndSource: normalizeText(params.metadata.actual_end_source) || null,
    benchmarkContextKey: normalizeText(params.metadata.benchmark_context_key) || null,
    durationLearningRuntimeConsumptions: trustedDurationLearningRuntimeConsumptions(params.metadata),
  }, lineage)
}

async function backtestStandardDurationReferencePrediction(params: {
  task: Task
  companyId: string | null
  actualStartDate: Date
  actualEnd: Date
  actualDuration: number
  plannedDuration: number
  sampleStrength: SampleStrength
  metadata: Record<string, unknown>
}) {
  const sampleHealthStatus = sampleHealthStatusForStrength(params.sampleStrength)
  if (sampleHealthStatus !== 'accepted') return
  try {
    await backtestEarliestPendingDurationAccuracyPrediction({
      projectId: String(params.task.project_id),
      taskId: String(params.task.id),
      engineCode: 'standard_duration_reference',
      actualStartDate: params.actualStartDate,
      actualFinishDate: params.actualEnd,
      actualDurationDays: params.actualDuration,
      baselineAbsoluteErrorDays: Math.abs(params.actualDuration - params.plannedDuration),
      actualContext: buildTaskCompletionBacktestContext({
        task: params.task,
        companyId: params.companyId,
        actualDuration: params.actualDuration,
        plannedDuration: params.plannedDuration,
        sampleStrength: params.sampleStrength,
        sampleHealthStatus,
        metadata: params.metadata,
      }),
    })
  } catch (error) {
    logger.warn('[durationExperienceService] failed to backtest standard duration reference prediction', {
      taskId: params.task.id,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

function readProgressQualityLearningObservation(factor: DurationContextFactor | null | undefined) {
  const observation = factor?.metadata?.learningObservation
  return observation && typeof observation === 'object' && !Array.isArray(observation)
    ? observation as Record<string, unknown>
    : {}
}

function readPlanLearningSignal(metadata: Record<string, unknown>, key: string) {
  return readRecord(
    metadata[key]
      ?? readRecord(metadata.plan_learning_observation)[key]
      ?? readRecord(metadata.planLearningObservation)[key],
  )
}

function buildPlanLearningObservation(task: Task, options: DurationExperienceCollectionOptions) {
  const taskLike = task as any
  const metadata = readRecord(task.standard_task_metadata)
  const existingPlanLearning = readRecord(metadata.planLearningObservation ?? metadata.plan_learning_observation)
  const editDistance = readPlanLearningSignal(metadata, 'generated_plan_edit_distance')
  const userDateAdjustment = readPlanLearningSignal(metadata, 'user_date_adjustment')
  const manualOverrideFields = readRecord(taskLike.manual_override_fields ?? metadata.manual_override_fields)
  const adjustedDateFields = ['planned_start_date', 'planned_end_date', 'start_date', 'end_date']
    .filter((field) => manualOverrideFields[field] === true || manualOverrideFields[field.replace('_date', '')] === true)
  const generatedPlanEditDistance = {
    ...editDistance,
    changed_field_count: Number(editDistance.changed_field_count ?? editDistance.changedFieldCount ?? adjustedDateFields.length),
    changed_fields: Array.isArray(editDistance.changed_fields ?? editDistance.changedFields)
      ? editDistance.changed_fields ?? editDistance.changedFields
      : adjustedDateFields,
    source: normalizeText(editDistance.source) || (adjustedDateFields.length > 0 ? 'manual_override_fields' : null),
  }
  const dateAdjustmentDays = readPositiveInt(userDateAdjustment.adjustment_days ?? userDateAdjustment.adjustmentDays)
    ?? readPositiveInt(existingPlanLearning.user_date_adjustment_days)
    ?? null
  const userDateAdjustmentPayload = {
    ...userDateAdjustment,
    adjustment_days: dateAdjustmentDays,
    adjusted_fields: Array.isArray(userDateAdjustment.adjusted_fields ?? userDateAdjustment.adjustedFields)
      ? userDateAdjustment.adjusted_fields ?? userDateAdjustment.adjustedFields
      : adjustedDateFields,
    source: normalizeText(userDateAdjustment.source) || (adjustedDateFields.length > 0 ? 'manual_override_fields' : null),
  }
  return {
    generated_plan_edit_distance: Object.keys(generatedPlanEditDistance).some((key) => generatedPlanEditDistance[key] != null && generatedPlanEditDistance[key] !== '')
      ? generatedPlanEditDistance
      : null,
    user_date_adjustment: Object.keys(userDateAdjustmentPayload).some((key) => userDateAdjustmentPayload[key] != null && userDateAdjustmentPayload[key] !== '')
      ? userDateAdjustmentPayload
      : null,
    collection_trigger: options.trigger ?? 'task_completion',
    runtime_effect: 'candidate_only_until_algorithm_seed_governance',
  }
}

function progressQualitySampleStrength(factor: DurationContextFactor | null | undefined): SampleStrength | null {
  if (!factor) return null
  const confidenceDelta = Number(factor.confidenceDelta ?? 0)
  const observation = readProgressQualityLearningObservation(factor)
  const sampleEligibility = normalizeText(observation.sampleEligibility)
  if (sampleEligibility === 'exclude_duration_learning' || confidenceDelta <= -18) return 'unusable'
  if (sampleEligibility === 'downgrade_duration_learning' || confidenceDelta <= -10) return 'weak'
  if (confidenceDelta < 0) return 'medium'
  return null
}

async function resolveProgressQualityForSample(task: Task) {
  try {
    const context = await buildDurationContext({
      taskId: task.id,
      projectId: task.project_id,
      taskTitle: task.title,
      plannedStartDate: task.planned_start_date ?? task.start_date ?? null,
      plannedEndDate: task.planned_end_date ?? task.end_date ?? null,
      actualStartDate: task.actual_start_date ?? null,
      actualEndDate: task.actual_end_date ?? null,
      progress: typeof task.progress === 'number' ? task.progress : Number(task.progress ?? 0),
      templateNodeId: task.template_node_id ?? null,
      engineeringCategoryId: task.engineering_category_id ?? null,
      wbsNodeType: task.wbs_node_type ?? null,
      standardWorkCode: task.standard_work_code ?? null,
      standardWorkName: task.standard_work_name ?? null,
      responsibleUnitId: (task as any).participant_unit_id ?? (task as any).responsible_unit_id ?? null,
    })
    const factor = context.factors.find((item) => item.key === 'progress_quality') ?? null
    return {
      factor,
      contextConfidenceLevel: context.calculationContext.confidence_level,
      contextConfidenceDelta: context.confidenceDelta,
      sampleStrength: progressQualitySampleStrength(factor),
    }
  } catch (error) {
    logger.warn('[durationExperienceService] failed to resolve progress quality for duration sample', {
      taskId: task.id,
      error: error instanceof Error ? error.message : String(error),
    })
    return {
      factor: null,
      contextConfidenceLevel: null,
      contextConfidenceDelta: null,
      sampleStrength: null,
    }
  }
}

export async function collectDurationExperienceSampleFromTask(
  task: Task,
  options: DurationExperienceCollectionOptions = {},
): Promise<boolean> {
  if (!task?.id || !task.project_id) return false
  task = await applyTaskExecutionFactAuthority(task)
  if (!hasTaskExecutionFactAuthority(task)) return false
  if (!isCompletedTask({
    status: task.status,
    progress: task.progress,
    actual_end_date: task.actual_end_date,
  })) return false

  const actualEnd = resolveActualEnd(task)
  const actualStart = resolveActualStart(task)
  const actualDurationCalendarDays = orderedInclusiveDurationDays(actualStart.date, actualEnd.date)
  if (!actualEnd.date || !actualDurationCalendarDays || !actualStart.date) return false
  const actualStartDate = actualStart.date
  const actualEndDate = actualEnd.date
  const plannedStartDate = toDurationDate(task.planned_start_date ?? task.start_date ?? null)
  const plannedEndDate = toDurationDate(task.planned_end_date ?? task.end_date ?? null)
  const plannedDurationCalendarDays = orderedInclusiveDurationDays(plannedStartDate, plannedEndDate)
    ?? actualDurationCalendarDays
  const constructionCalendar = await resolveConstructionCalendarContext({
    projectId: String(task.project_id),
    standardWorkCode: normalizeText(task.standard_work_code) || null,
    templateNodeId: normalizeText(task.template_node_id) || null,
    onError: (error) => logger.warn('[durationExperienceService] failed to resolve construction calendar for duration sample', {
      projectId: task.project_id,
      taskId: task.id,
      error: error instanceof Error ? error.message : String(error),
    }),
  })
  const hasAuthoritativeCalendar = isAuthoritativeConstructionCalendar(constructionCalendar)
  const durationDayBasis = hasAuthoritativeCalendar
    ? 'construction_production_day' as const
    : 'calendar_day' as const
  const actualDurationProductionDays = hasAuthoritativeCalendar
    ? Math.max(1, productionDaysBetweenInclusive(actualStartDate, actualEndDate, constructionCalendar))
    : null
  const plannedDurationProductionDays = hasAuthoritativeCalendar
    ? plannedStartDate && plannedEndDate
      ? Math.max(1, productionDaysBetweenInclusive(plannedStartDate, plannedEndDate, constructionCalendar))
      : actualDurationProductionDays
    : null
  const actualDuration = actualDurationProductionDays ?? actualDurationCalendarDays
  const plannedDuration = plannedDurationProductionDays ?? plannedDurationCalendarDays
  const constructionCalendarAsOf = actualEndDate.toISOString().slice(0, 10)
  const progressQuality = await resolveProgressQualityForSample(task)
  const dateSampleStrength = weakerSampleStrength(actualStart.strength, actualEnd.strength)
  const measuredSampleStrength = progressQuality.sampleStrength
    ? weakerSampleStrength(dateSampleStrength, progressQuality.sampleStrength)
    : dateSampleStrength
  const finalSampleStrength: SampleStrength = hasAuthoritativeCalendar
    ? measuredSampleStrength
    : 'unusable'
  const confidence = confidenceForStrength(finalSampleStrength)
  const companyId = await resolveCompanyId(String(task.project_id))
  if (!companyId) {
    throw new Error('Duration experience sample tenant ownership could not be resolved.')
  }
  const structuredCauseRead = await readTaskStructuredCauseAuthority({
    companyId,
    projectId: String(task.project_id),
    taskId: String(task.id),
  })
  const structuredCauseSnapshot = structuredCauseRead.snapshot
  const structuredCauseResolution = structuredCauseRead.resolution
  const durationLearningRuntimeConsumptions = await readTrustedDurationLearningRuntimeConsumptionsForTask({
    queryExec: async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => {
      // database-query-dynamic-approved: the canonical 315 consumption reader owns fixed parameterized SELECTs; this adapter only supplies the database executor.
      const result = await query(sql, params as any[])
      const rows = Array.isArray(result) ? result : result.rows ?? []
      return rows as T[]
    },
    companyId,
    projectId: String(task.project_id),
    taskId: String(task.id),
  })
  const climate = await resolveProjectClimateRegion(String(task.project_id))
  const forecastLearningObservation = await buildForecastLearningObservation({
    task,
    actualStart: actualStartDate,
    actualEnd: actualEndDate,
    actualStartSource: actualStart.source,
    actualEndSource: actualEnd.source,
    plannedDuration,
    actualDuration,
    constructionCalendar,
  })
  const now = new Date().toISOString()
  const actualStartMonth = actualStartDate.getUTCMonth() + 1
  const standardMetadata = readRecord(task.standard_task_metadata)
  const backendStandardMapping = readRecord(standardMetadata.backendStandardMapping)
  const internalFlow = readRecord(standardMetadata.internalFlow ?? standardMetadata.internal_flow)
  const factContext = buildAlgorithmFactContext({
    phase: 'duration_context',
    projectGenerationFacts: readProjectGenerationFactsSnapshot(standardMetadata),
    runtimeExecutionFacts: {
      progressCompletionRatio: task.progress == null ? undefined : Number(task.progress) / 100,
      evidenceCodes: ['completed_task_duration_experience'],
    },
  })
  const projectGenerationFacts = factContext.projectGenerationFacts
  const elementVariant = readRecord(standardMetadata.elementVariant)
  const projectTypeCode = normalizeText((task as any).project_type_code ?? projectGenerationFacts.businessType) || null
  const structureTypeCode = normalizeText((task as any).structure_type_code ?? projectGenerationFacts.structureTypeCode) || null
  const participantUnitId = normalizeText((task as any).participant_unit_id ?? (task as any).responsible_unit_id) || null
  const methodVariantCodes = readCodeArray((task as any).method_variant_codes ?? projectGenerationFacts.methodVariantCodes)
  const elementVariantCodes = readCodeArray(
    (task as any).element_variant_code
      ? [(task as any).element_variant_code]
      : (projectGenerationFacts.elementVariantCodes ?? (elementVariant.code ? [elementVariant.code] : [])),
  )
  const metadata = {
    company_id: companyId,
    collected_by: options.actorId ?? null,
    collected_trigger: options.trigger ?? 'task_completion',
    participant_unit_id: participantUnitId,
    project_type_code: projectTypeCode,
    structure_type_code: structureTypeCode,
    method_variant_codes: methodVariantCodes,
    element_variant_codes: elementVariantCodes,
    structured_cause_snapshot: structuredCauseSnapshot,
    structuredCauseAvailability: structuredCauseResolution.availability,
    structuredCauseCode: structuredCauseResolution.causeCode,
    structuredCauseTaxonomyVersion: structuredCauseResolution.taxonomyVersion,
    duration_learning_runtime_consumptions: durationLearningRuntimeConsumptions,
    algorithm_fact_context: summarizeAlgorithmFactContext(factContext),
    climate_region: climate.regionCode,
    thermal_zone: climate.thermalZone,
    climate_tags: climate.climateTags,
    climate_region_source: climate.source,
    rainy_season_months: climate.rainySeasonMonths,
    high_temp_months: climate.highTempMonths,
    cold_weather_months: climate.coldWeatherMonths,
    actual_start_month: actualStartMonth,
    actual_start_climate_signal: resolveClimateSignal(actualStartMonth, climate),
    building_pattern_observation: await buildBuildingPatternObservation(task, standardMetadata, {
      projectId: String(task.project_id),
      standardWorkCode: normalizeText(task.standard_work_code) || null,
      standardWorkCodes: normalizeText(task.standard_work_code) ? [normalizeText(task.standard_work_code).toLowerCase()] : [],
      templateNodeId: normalizeText(task.template_node_id) || null,
      methodVariantCodes,
      elementVariantCodes,
    }),
    plan_learning_observation: buildPlanLearningObservation(task, options),
    forecast_learning_observation: forecastLearningObservation,
    benchmark_context_key: [
      projectTypeCode ? `project=${projectTypeCode}` : '',
      structureTypeCode ? `structure=${structureTypeCode}` : '',
      methodVariantCodes.length > 0 ? `method=${methodVariantCodes.join('+')}` : '',
      elementVariantCodes.length > 0 ? `element=${elementVariantCodes.join('+')}` : '',
      climate.thermalZone ? `thermal=${climate.thermalZone}` : '',
      participantUnitId ? `unit=${participantUnitId}` : '',
    ].filter(Boolean).join('|') || 'all',
    actual_start_source: actualStart.source,
    actual_end_source: actualEnd.source,
    actual_end_completion_event_at: normalizeText(task.updated_at) || null,
    previous_status: options.previousTask?.status ?? null,
    previous_progress: options.previousTask?.progress ?? null,
    completed_status: task.status ?? null,
    completed_progress: task.progress ?? null,
    duration_day_basis: durationDayBasis,
    actual_duration_calendar_days: actualDurationCalendarDays,
    actual_duration_production_days: actualDurationProductionDays,
    planned_duration_calendar_days: plannedDurationCalendarDays,
    planned_duration_production_days: plannedDurationProductionDays,
    construction_calendar_basis: effectiveConstructionCalendarBasis(constructionCalendar),
    construction_calendar_window_count: effectiveConstructionCalendarWindowCount(constructionCalendar),
    construction_calendar_ref: constructionCalendar.calendarRef ?? null,
    construction_calendar_version: constructionCalendar.calendarVersion ?? null,
    construction_calendar_timezone: constructionCalendar.timezone ?? null,
    construction_calendar_as_of: constructionCalendarAsOf,
    construction_calendar_availability: constructionCalendar.availability ?? 'unavailable',
    construction_calendar_unavailable_reason: constructionCalendar.unavailableReason ?? null,
    raw_task_title: task.title ?? null,
    title_weak_alias: normalizeText(backendStandardMapping.source) === 'algorithm_seed_rule'
      ? task.title ?? null
      : null,
    title_standard_mapping_source: normalizeText(backendStandardMapping.source) || null,
    title_standard_mapping_status: normalizeText(backendStandardMapping.status) || null,
    title_standard_mapping_reason: normalizeText(backendStandardMapping.reason) || null,
    title_standard_mapping_seed_code: normalizeText(backendStandardMapping.seedCode) || null,
    title_standard_mapping_confidence: normalizeText(backendStandardMapping.confidence) || null,
    title_standard_mapping_match_score: backendStandardMapping.matchScore ?? null,
    title_standard_mapping_match_quality: normalizeText(backendStandardMapping.matchQuality) || null,
    title_standard_mapping_rule_id: normalizeText(backendStandardMapping.matchRuleId) || null,
    title_standard_mapping_data_quality_issue: normalizeText(backendStandardMapping.dataQualityIssue) || null,
    title_standard_mapping_candidate_text: normalizeText(backendStandardMapping.candidateText).slice(0, 500) || null,
    title_standard_mapping_weak_codes: readCodeArray(backendStandardMapping.weakStandardWorkCodes),
    title_standard_mapping_feedback_type: normalizeText(backendStandardMapping.feedbackType) || null,
    title_standard_mapping_predicted_code: normalizeText(backendStandardMapping.predictedStandardWorkCode) || null,
    title_standard_mapping_corrected_code: normalizeText(backendStandardMapping.correctedStandardWorkCode) || null,
    title_standard_mapping_previous_rule_id: normalizeText(backendStandardMapping.previousMatchRuleId) || null,
    progress_quality: progressQuality.factor
      ? {
          confidence_delta: progressQuality.factor.confidenceDelta,
          action_policy: progressQuality.factor.actionPolicy,
          anomaly_codes: Array.isArray(progressQuality.factor.metadata?.anomalyCodes)
            ? progressQuality.factor.metadata.anomalyCodes
            : [],
          data_quality_rule_codes: Array.isArray(progressQuality.factor.metadata?.dataQualityRuleCodes)
            ? progressQuality.factor.metadata.dataQualityRuleCodes
            : [],
          excluded_from_velocity_learning: progressQuality.factor.metadata?.excludedFromVelocityLearning === true,
          sample_eligibility: readProgressQualityLearningObservation(progressQuality.factor).sampleEligibility ?? null,
          learning_observation: readProgressQualityLearningObservation(progressQuality.factor),
          context_confidence_level: progressQuality.contextConfidenceLevel,
          context_confidence_delta: progressQuality.contextConfidenceDelta,
        }
      : null,
    standard_internal_flow: Object.keys(internalFlow).length > 0
      ? {
          source: normalizeText(internalFlow.source) || null,
          source_type: normalizeText(internalFlow.sourceType) || null,
          scope: normalizeText(internalFlow.scope) || null,
          seed_rule_id: normalizeText(internalFlow.seedRuleId) || null,
          curation_status: normalizeText(internalFlow.curationStatus) || null,
          curation_method: normalizeText(internalFlow.curationMethod) || null,
          review_needed: internalFlow.reviewNeeded === true,
          relation_kind: normalizeText(internalFlow.relationKind) || null,
          creates_dependency: internalFlow.createsDependency === true,
          dependency_type: normalizeText(internalFlow.dependencyType) || null,
          lag_days: readPositiveInt(internalFlow.lagDays) ?? 0,
          schedule_mode: normalizeText(internalFlow.scheduleMode) || null,
          requires_all_previous_siblings: internalFlow.requiresAllPreviousSiblings === true,
          predecessor_stable_code: normalizeText(internalFlow.predecessorStableCode) || null,
          predecessor_stable_codes: readCodeArray(internalFlow.predecessorStableCodes),
          predecessor_name: normalizeText(internalFlow.predecessorName) || null,
          predecessor_names: Array.isArray(internalFlow.predecessorNames)
            ? [...new Set(internalFlow.predecessorNames.map(normalizeText).filter(Boolean))]
            : [],
          successor_stable_code: normalizeText(internalFlow.successorStableCode ?? task.standard_work_code) || null,
          successor_name: normalizeText(internalFlow.successorName ?? task.standard_work_name ?? task.title) || null,
          evidence_codes: readCodeArray(internalFlow.evidenceCodes),
          evidence_refs: readRecordArray(internalFlow.evidenceRefs ?? internalFlow.evidence_refs),
          applicable_when: readRecordArray(internalFlow.applicableWhen ?? internalFlow.applicable_when),
          conditional_effects: readRecordArray(internalFlow.conditionalEffects ?? internalFlow.conditional_effects),
          applied_conditional_effect_ids: readCodeArray(
            internalFlow.appliedConditionalEffectIds ?? internalFlow.applied_conditional_effect_ids,
          ),
          generalization_hint: Object.keys(readRecord(internalFlow.generalizationHint ?? internalFlow.generalization_hint)).length > 0
            ? readRecord(internalFlow.generalizationHint ?? internalFlow.generalization_hint)
            : null,
          governance_priority: normalizeText(internalFlow.governancePriority) || null,
          reason_code: normalizeText(internalFlow.reasonCode) || null,
        }
      : null,
  }

  const payload = {
    company_id: companyId,
    project_id: task.project_id,
    task_id: task.id,
    template_node_id: task.template_node_id ?? null,
    wbs_node_type: task.wbs_node_type ?? 'process',
    generation_depth: task.wbs_level ?? null,
    standard_work_code: task.standard_work_code ?? null,
    standard_work_name: task.standard_work_name ?? task.title ?? null,
    engineering_category_id: task.engineering_category_id ?? null,
    duration_day_basis: durationDayBasis,
    actual_duration_calendar_days: actualDurationCalendarDays,
    actual_duration_production_days: actualDurationProductionDays,
    planned_duration_calendar_days: plannedDurationCalendarDays,
    planned_duration_production_days: plannedDurationProductionDays,
    construction_calendar_basis: effectiveConstructionCalendarBasis(constructionCalendar),
    planned_duration: plannedDuration,
    actual_duration: actualDuration,
    started_at: actualStartDate.toISOString(),
    completed_at: actualEndDate.toISOString(),
    source_type: 'task_completion',
    experience_tier: 'T1',
    reuse_scope: 'project',
    fact_source: 'actual_outcome',
    evidence_fingerprint: buildDurationExperienceEvidenceFingerprint({
      companyId,
      projectId: String(task.project_id),
      taskId: String(task.id),
      actualStartDate: actualStartDate.toISOString(),
      actualEndDate: actualEndDate.toISOString(),
      actualDuration,
      plannedDuration,
      standardWorkCode: normalizeText(task.standard_work_code) || null,
    }),
    source_lineage: {
      schemaVersion: 'duration_experience.task_completion.v2',
      sourceService: 'durationExperienceService',
      sourceType: 'task_completion',
      companyId,
      projectId: String(task.project_id),
      taskId: String(task.id),
      actualStartSource: actualStart.source,
      actualEndSource: actualEnd.source,
      durationDayBasis,
      constructionCalendarBasis: effectiveConstructionCalendarBasis(constructionCalendar),
      constructionCalendarWindowCount: effectiveConstructionCalendarWindowCount(constructionCalendar),
      constructionCalendarRef: constructionCalendar.calendarRef ?? null,
      constructionCalendarVersion: constructionCalendar.calendarVersion ?? null,
      constructionCalendarTimezone: constructionCalendar.timezone ?? null,
      constructionCalendarAsOf,
      constructionCalendarAvailability: constructionCalendar.availability ?? 'unavailable',
      constructionCalendarUnavailableReason: constructionCalendar.unavailableReason ?? null,
      collectedTrigger: options.trigger ?? 'task_completion',
      collectedBy: options.actorId ?? null,
    },
    duration_calibration_source: 'project_history_sample',
    sample_strength: finalSampleStrength,
    sample_status: 'active',
    confidence_level: confidence.level,
    confidence_score: confidence.score,
    included_in_benchmark: finalSampleStrength !== 'weak'
      && finalSampleStrength !== 'unusable'
      && structuredCauseRead.causeBenchmarkEligible,
    metadata,
    updated_at: now,
  }

  const { data: existing, error: lookupError } = await (supabase as any)
    .from('duration_experience_samples')
    .select('id')
    .eq('task_id', task.id)
    .eq('source_type', 'task_completion')
    .eq('sample_status', 'active')
    .maybeSingle()

  if (lookupError) {
    logger.warn('[durationExperienceService] failed to lookup existing duration sample', {
      taskId: task.id,
      error: lookupError.message,
    })
  }

  if (existing?.id) {
    const { error } = await (supabase as any)
      .from('duration_experience_samples')
      .update(payload)
      .eq('id', existing.id)
    if (error) throw new Error(`更新经验工期样本失败: ${error.message}`)
    await persistDurationExperienceSampleHealthEvent({
      task,
      companyId,
      actualStartDate,
      actualEnd: actualEndDate,
      actualEndSource: actualEnd.source,
      sampleStrength: finalSampleStrength,
    })
    await backtestTaskRemainingForecastPrediction({
      task,
      companyId,
      actualStartDate,
      actualEnd: actualEndDate,
      actualDuration,
      plannedDuration,
      sampleStrength: finalSampleStrength,
      metadata,
    })
    await backtestStandardDurationReferencePrediction({
      task,
      companyId,
      actualStartDate,
      actualEnd: actualEndDate,
      actualDuration,
      plannedDuration,
      sampleStrength: finalSampleStrength,
      metadata,
    })
    return true
  }

  const { error } = await (supabase as any)
    .from('duration_experience_samples')
    .insert({ ...payload, created_at: now })
  if (error) throw new Error(`写入经验工期样本失败: ${error.message}`)
  await persistDurationExperienceSampleHealthEvent({
    task,
    companyId,
    actualStartDate,
    actualEnd: actualEndDate,
    actualEndSource: actualEnd.source,
    sampleStrength: finalSampleStrength,
  })
  await backtestTaskRemainingForecastPrediction({
    task,
    companyId,
    actualStartDate,
    actualEnd: actualEndDate,
    actualDuration,
    plannedDuration,
    sampleStrength: finalSampleStrength,
    metadata,
  })
  await backtestStandardDurationReferencePrediction({
    task,
    companyId,
    actualStartDate,
    actualEnd: actualEndDate,
    actualDuration,
    plannedDuration,
    sampleStrength: finalSampleStrength,
    metadata,
  })
  return true
}

export async function retireDurationExperienceSampleForTask(
  taskId: string,
  options: { actorId?: string | null; trigger?: string } = {},
): Promise<boolean> {
  if (!taskId) return false
  const { error } = await (supabase as any)
    .from('duration_experience_samples')
    .update({
      sample_status: 'superseded',
      included_in_benchmark: false,
      metadata: {
        retired_by: options.actorId ?? null,
        retired_trigger: options.trigger ?? 'task_reopened',
      },
      updated_at: new Date().toISOString(),
    })
    .eq('task_id', taskId)
    .eq('source_type', 'task_completion')
    .eq('sample_status', 'active')

  if (error) throw new Error(`停用经验工期样本失败: ${error.message}`)
  return true
}
