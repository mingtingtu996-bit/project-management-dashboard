import { executeSQL, getTasks } from './dbService.js'
import {
  evaluateRuntimeDelayRecoveryWithCriticalPath,
  type ScheduleAccelerationContext,
  type ScheduleAccelerationDependency,
  type ScheduleAccelerationMode,
  type ScheduleAccelerationRow,
  type ScheduleTargetFeasibility,
} from './scheduleAccelerationService.js'
import { loadEffectiveProjectScheduleState } from './projectScheduleStateService.js'
import {
  buildProjectRemainingDurationForecast,
  buildProjectRemainingForecastPredictionEvent,
  type ProjectMonthlyCommitmentSummary,
  type ProjectRemainingDurationForecast,
} from './projectRemainingDurationForecastService.js'
import { getProjectCriticalPathSnapshot } from './projectCriticalPathService.js'
import { listCurrentTaskDurationForecasts } from './taskDurationForecastService.js'
import { getTaskDurationSuggestion } from './durationSuggestionService.js'
import { buildRuntimeExecutionInference } from './runtimeExecutionInferenceService.js'
import {
  backtestEarliestPendingDurationAccuracyPrediction,
  recordDurationAccuracyPrediction,
} from './durationAlgorithmAccuracyService.js'
import {
  recordScheduleAccelerationRuntimeConsumedArtifacts,
  type DurationRuntimeConsumerFacadeArtifactsResult,
} from './durationRuntimeConsumerObservationAdapterService.js'
import type {
  DurationRuntimeConsumerObservationQueryExec,
  DurationRuntimeConsumerObservedArtifact,
} from './durationRuntimeConsumerObservationService.js'
import type { Task, TaskDependency } from '../types/db.js'
import { logger } from '../middleware/logger.js'
import { orderedInclusiveDurationDays, signedDurationDayDelta } from '../utils/durationDays.js'

const CURRENT_EXECUTION_BASELINE_STATUSES = new Set(['confirmed', 'pending_realign'])

export interface ScheduleAccelerationRuntimeArtifactPublication {
  assetKey: DurationRuntimeConsumerObservedArtifact['assetKey']
  publicationKey: string
  publicationStatus?: string | null
  sourceEvidenceRefs?: string[] | null
  observationContext?: Record<string, unknown> | null
}

export interface RecordScheduleAccelerationRuntimeConsumptionInput {
  queryExec: DurationRuntimeConsumerObservationQueryExec
  runtimeArtifactPublications: readonly ScheduleAccelerationRuntimeArtifactPublication[]
  projectId?: string | null
  runtimeEntryRef?: string
  observedAt?: string
}

const SCHEDULE_ACCELERATION_RUNTIME_CONSUMER_ASSET_KEYS = new Set([
  'critical_path_rule_candidate',
])

const RUNTIME_TASK_COLUMNS = [
  'id',
  'project_id',
  'title',
  'planned_start_date',
  'planned_end_date',
  'start_date',
  'end_date',
  'status',
  'progress',
  'actual_start_date',
  'actual_end_date',
  'phase_object_id',
  'wbs_node_type',
  'standard_work_code',
  'standard_work_name',
  'is_milestone',
  'is_critical',
  'total_float_days',
  'free_float_days',
  'standard_task_metadata',
] as const

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

export function buildScheduleAccelerationRuntimeConsumedArtifacts(input: {
  runtimeArtifactPublications: readonly ScheduleAccelerationRuntimeArtifactPublication[]
  projectId?: string | null
}): DurationRuntimeConsumerObservedArtifact[] {
  const projectId = normalizeText(input.projectId)
  return input.runtimeArtifactPublications
    .filter((publication) => SCHEDULE_ACCELERATION_RUNTIME_CONSUMER_ASSET_KEYS.has(publication.assetKey))
    .filter((publication) => normalizeText(publication.publicationKey))
    .map((publication) => ({
      assetKey: publication.assetKey,
      publicationKey: normalizeText(publication.publicationKey),
      publicationStatus: publication.publicationStatus,
      sourceEvidenceRefs: publication.sourceEvidenceRefs,
      observationContext: {
        ...(publication.observationContext ?? {}),
        projectId: projectId || null,
        runtimeConsumer: 'scheduleAccelerationRuntimeService',
      },
    }))
}

export function recordScheduleAccelerationRuntimeConsumption(
  input: RecordScheduleAccelerationRuntimeConsumptionInput,
): Promise<DurationRuntimeConsumerFacadeArtifactsResult> {
  const projectId = normalizeText(input.projectId)
  return recordScheduleAccelerationRuntimeConsumedArtifacts({
    queryExec: input.queryExec,
    runtimeEntryRef: input.runtimeEntryRef,
    observedAt: input.observedAt,
    callContext: {
      projectId: projectId || null,
      runtimeConsumer: 'scheduleAccelerationRuntimeService',
    },
    sourceEvidenceRefs: [
      ['schedule_acceleration_runtime', projectId || 'no_project'].join(':'),
    ],
    artifacts: buildScheduleAccelerationRuntimeConsumedArtifacts({
      runtimeArtifactPublications: input.runtimeArtifactPublications,
      projectId,
    }),
  })
}

function normalizeDependencyType(value: unknown): ScheduleAccelerationDependency['dependencyType'] {
  const dependencyType = normalizeText(value).toUpperCase()
  if (dependencyType === 'SS' || dependencyType === 'FF' || dependencyType === 'SF') return dependencyType
  return 'FS'
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function readRuntimeRowProjectionMode(task: Task, metadata: Record<string, unknown>) {
  const mode = normalizeText(metadata.rowProjectionMode ?? metadata.row_projection_mode)
  return mode || 'schedule_row'
}

function readRuntimeDurationContributionMode(task: Task, metadata: Record<string, unknown>) {
  const mode = normalizeText(metadata.durationContributionMode ?? metadata.duration_contribution_mode)
  if (mode) return mode
  if (task.is_milestone) return 'handover_marker'
  return 'duration_bearing'
}

function mapDependencySourceType(sourceType: unknown): ScheduleAccelerationDependency['source'] {
  const source = normalizeText(sourceType)
  if (source === 'cross_item_workflow' || source === 'dependency_intent_template' || source === 'sibling_sequence' || source === 'phase_chain') {
    return source
  }
  return source || 'manual'
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
    .sort()
    .at(-1) ?? null
}

function addInclusiveRemainingDays(anchorDate: string | null | undefined, days: number | null | undefined) {
  const anchor = normalizeDate(anchorDate)
  const normalizedDays = Math.max(0, Math.ceil(Number(days ?? 0)))
  if (!anchor || normalizedDays <= 0) return anchor
  const next = new Date(`${anchor}T00:00:00.000Z`)
  next.setUTCDate(next.getUTCDate() + normalizedDays - 1)
  return next.toISOString().slice(0, 10)
}

function earliestDate(dates: Array<string | null | undefined>) {
  return dates
    .map(normalizeDate)
    .filter((date): date is string => Boolean(date))
    .sort()
    .at(0) ?? null
}

function readOptionalNumber(value: unknown): number | null {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

async function loadActiveTaskDependencies(projectId: string, taskIds: string[]) {
  if (taskIds.length === 0) return []
  const placeholders = taskIds.map(() => '?').join(', ')
  return executeSQL<TaskDependency>(
    `SELECT task_id, dependency_task_id, dependency_type, lag_days, source_type
       FROM task_dependencies
      WHERE project_id = ?
        AND status = 'active'
        AND task_id IN (${placeholders})
      ORDER BY created_at ASC, id ASC`,
    [projectId, ...taskIds],
  )
}

export async function buildRuntimeScheduleAccelerationRows(projectId: string): Promise<ScheduleAccelerationRow[]> {
  const normalizedProjectId = normalizeText(projectId)
  if (!normalizedProjectId) return []

  const tasks = await getTasks(normalizedProjectId, { columns: RUNTIME_TASK_COLUMNS })
  const taskIds = tasks.map((task) => normalizeText(task.id)).filter(Boolean)
  const taskIdSet = new Set(taskIds)
  const dependencies = await loadActiveTaskDependencies(normalizedProjectId, taskIds)
  const dependenciesByTaskId = new Map<string, ScheduleAccelerationDependency[]>()

  for (const dependency of dependencies) {
    const taskId = normalizeText(dependency.task_id)
    const dependencyTaskId = normalizeText(dependency.dependency_task_id)
    if (!taskId || !dependencyTaskId || !taskIdSet.has(taskId) || !taskIdSet.has(dependencyTaskId)) continue
    dependenciesByTaskId.set(taskId, [
      ...(dependenciesByTaskId.get(taskId) ?? []),
      {
        clientRowId: dependencyTaskId,
        dependencyType: normalizeDependencyType(dependency.dependency_type),
        lagDays: Number(dependency.lag_days ?? 0) || 0,
        source: mapDependencySourceType(dependency.source_type),
        relationRole: 'workflow',
      },
    ])
  }

  return tasks.map((task) => {
    const metadata = readRecord(task.standard_task_metadata)
    return {
      clientRowId: normalizeText(task.id),
      values: {
        title: task.title,
        project_id: task.project_id ?? normalizedProjectId,
        planned_start_date: normalizeDate(task.planned_start_date ?? task.start_date),
        planned_end_date: normalizeDate(task.planned_end_date ?? task.end_date),
        start_date: normalizeDate(task.start_date),
        end_date: normalizeDate(task.end_date),
        actual_start_date: normalizeDate(task.actual_start_date),
        actual_end_date: normalizeDate(task.actual_end_date),
        status: task.status,
        progress: task.progress ?? 0,
        duration_contribution_mode: readRuntimeDurationContributionMode(task, metadata),
        row_projection_mode: readRuntimeRowProjectionMode(task, metadata),
        standard_work_code: task.standard_work_code ?? null,
        standard_work_name: task.standard_work_name ?? null,
        wbs_node_type: task.wbs_node_type ?? null,
        is_milestone: task.is_milestone ?? false,
        is_critical: task.is_critical ?? false,
        phase_object_id: task.phase_object_id ?? null,
        total_float_days: readOptionalNumber(task.total_float_days),
        free_float_days: readOptionalNumber(task.free_float_days),
        standard_task_metadata: {
          ...metadata,
          criticalPathEligible: metadata.criticalPathEligible ?? metadata.critical_path_eligible ?? Boolean(task.is_critical),
        },
      },
      predecessorDependencies: dependenciesByTaskId.get(normalizeText(task.id)) ?? [],
      rowProjectionMode: readRuntimeRowProjectionMode(task, metadata) as ScheduleAccelerationRow['rowProjectionMode'],
      executionPhase: normalizeText(metadata.executionPhase ?? metadata.execution_phase) || null,
      executionLane: normalizeText(metadata.executionLane ?? metadata.execution_lane) || null,
    }
  })
}

async function buildRuntimeForecastInputs(projectId: string, context?: ScheduleAccelerationContext, asOfDate?: string | null) {
  const hydrated = await hydrateRuntimeRowsWithEngineSignals(projectId, await buildRuntimeScheduleAccelerationRows(projectId), asOfDate)
  const runtimeContext = await buildRuntimeRecoveryContext(projectId, hydrated.rows)
  const mergedRuntimeContext = {
    ...runtimeContext,
    ...context?.runtime,
  }
  const monthlyCommitments = await loadRuntimeMonthlyCommitmentSummary(projectId)
  const constructionCalendar = context?.constructionCalendar ?? context?.workCalendar ?? null
  return {
    rows: hydrated.rows,
    criticalPathSnapshot: hydrated.criticalPathSnapshot,
    constructionCalendar,
    mergedRuntimeContext,
    monthlyCommitments,
  }
}

function isRuntimeDurationBearingRow(row: ScheduleAccelerationRow) {
  const mode = normalizeText(row.rowProjectionMode ?? row.values.row_projection_mode)
  const contributionMode = normalizeText(row.values.duration_contribution_mode)
  return (!mode || mode === 'schedule_row') && contributionMode === 'duration_bearing'
}

async function loadRuntimeDurationSuggestion(projectId: string, row: ScheduleAccelerationRow) {
  if (!isRuntimeDurationBearingRow(row)) return null
  const taskId = normalizeText(row.clientRowId)
  if (!taskId) return null
  try {
    return await getTaskDurationSuggestion({
      projectId,
      taskId,
      taskTitle: normalizeText(row.values.title) || null,
      standardWorkCode: normalizeText(row.values.standard_work_code) || null,
      standardWorkName: normalizeText(row.values.standard_work_name) || null,
      wbsNodeType: normalizeText(row.values.wbs_node_type) || null,
      plannedStartDate: normalizeDate(row.values.planned_start_date ?? row.values.start_date),
      plannedEndDate: normalizeDate(row.values.planned_end_date ?? row.values.end_date),
      actualStartDate: normalizeDate(row.values.actual_start_date),
      actualEndDate: normalizeDate(row.values.actual_end_date),
      progress: readOptionalNumber(row.values.progress),
      suggestionPurpose: 'execution_reference',
    })
  } catch {
    return null
  }
}

async function hydrateRuntimeRowsWithEngineSignals(projectId: string, rows: ScheduleAccelerationRow[], asOfDate?: string | null) {
  const taskIds = rows.map((row) => normalizeText(row.clientRowId)).filter(Boolean)
  if (taskIds.length === 0) {
    return {
      rows,
      criticalPathSnapshot: null as Awaited<ReturnType<typeof getProjectCriticalPathSnapshot>> | null,
    }
  }

  const [criticalPathResult, forecastsResult] = await Promise.allSettled([
    getProjectCriticalPathSnapshot(projectId),
    listCurrentTaskDurationForecasts(taskIds, { maxAgeMs: null }),
  ])
  const criticalPath = criticalPathResult.status === 'fulfilled' ? criticalPathResult.value : null
  const forecasts = forecastsResult.status === 'fulfilled' ? forecastsResult.value : []
  const forecastByTaskId = new Map(forecasts.map((forecast) => [normalizeText(forecast.taskId), forecast]))
  const suggestionResults = await Promise.allSettled(rows.map(async (row) => ({
    taskId: normalizeText(row.clientRowId),
    suggestion: await loadRuntimeDurationSuggestion(projectId, row),
  })))
  const suggestionByTaskId = new Map<string, unknown>()
  for (const result of suggestionResults) {
    if (result.status !== 'fulfilled') continue
    if (!result.value.taskId || !result.value.suggestion) continue
    suggestionByTaskId.set(result.value.taskId, result.value.suggestion)
  }
  const criticalTaskIds = new Set([
    ...(criticalPath?.displayTaskIds ?? []),
    ...(criticalPath?.autoTaskIds ?? []),
  ].map(normalizeText).filter(Boolean))
  const criticalTaskById = new Map((criticalPath?.tasks ?? []).map((task) => [normalizeText(task.taskId), task]))
  const primaryChainTaskIds = new Set((criticalPath?.primaryChain?.taskIds ?? []).map(normalizeText).filter(Boolean))
  const primaryChainSpanDays = readOptionalNumber(criticalPath?.primaryChain?.totalDurationDays)
  const hasCriticalPathProjection = criticalTaskIds.size > 0 || criticalTaskById.size > 0

  const hydratedRows = rows.map((row) => {
    const taskId = normalizeText(row.clientRowId)
    const forecast = forecastByTaskId.get(taskId)
    const suggestion = suggestionByTaskId.get(taskId)
    const criticalTask = criticalTaskById.get(taskId)
    const p20RemainingDays = readOptionalNumber(forecast?.probabilityDuration?.p20RemainingDays)
    const p80RemainingDays = readOptionalNumber(forecast?.probabilityDuration?.p80RemainingDays)
    const values: ScheduleAccelerationRow['values'] = {
      ...row.values,
      ...(forecast?.forecastFinishDate ? { forecast_finish_date: forecast.forecastFinishDate } : {}),
      ...(forecast?.remainingDurationDays != null ? { remaining_duration_days: forecast.remainingDurationDays } : {}),
      ...(p20RemainingDays != null ? { forecast_p20_finish_date: addInclusiveRemainingDays(asOfDate, p20RemainingDays) } : {}),
      ...(p80RemainingDays != null ? { forecast_p80_finish_date: addInclusiveRemainingDays(asOfDate, p80RemainingDays) } : {}),
      ...(primaryChainTaskIds.has(taskId) && primaryChainSpanDays != null && primaryChainSpanDays > 0
        ? { critical_path_span_days: primaryChainSpanDays }
        : {}),
      ...(suggestion ? { duration_suggestion: suggestion } : {}),
    }
    if (hasCriticalPathProjection) {
      values.is_critical = criticalTaskIds.has(taskId)
      if (criticalTask?.floatDays != null) {
        values.total_float_days = criticalTask.floatDays
        if (criticalTaskIds.has(taskId)) values.free_float_days = 0
      }
    }
    return {
      ...row,
      values,
    }
  })

  return {
    rows: hydratedRows,
    criticalPathSnapshot: criticalPath,
  }
}

function isCompletedScheduleAccelerationRow(row: ScheduleAccelerationRow) {
  return normalizeText(row.values.status) === 'completed' ||
    normalizeDate(row.values.actual_end_date) !== null ||
    Number(row.values.progress ?? 0) >= 100
}

function buildCompletedProjectActualRemainingWindow(rows: ScheduleAccelerationRow[], asOfDate: string) {
  const scheduleRows = rows.filter((row) => {
    const mode = normalizeText(row.rowProjectionMode ?? row.values.row_projection_mode)
    return !mode || mode === 'schedule_row'
  })
  if (scheduleRows.length === 0) return null
  if (!scheduleRows.every(isCompletedScheduleAccelerationRow)) return null

  const actualFinishDate = latestDate(scheduleRows.map((row) => normalizeDate(row.values.actual_end_date)))
  const actualDurationDays = orderedInclusiveDurationDays(asOfDate, actualFinishDate)
  if (!actualFinishDate || !actualDurationDays) return null
  return { actualStartDate: asOfDate, actualFinishDate, actualDurationDays }
}

function isAccelerationRecommendationAdopted(runtime?: ScheduleAccelerationContext['runtime']) {
  if (runtime?.accelerationRecommendationAdopted === true) return true
  return (runtime?.evidenceCodes ?? []).some((code) => normalizeText(code) === 'acceleration_recommendation_adopted')
}

async function recordProjectRemainingAccuracySnapshot(params: {
  projectId: string
  rows: ScheduleAccelerationRow[]
  forecast: ProjectRemainingDurationForecast
  asOfDate?: string | null
}) {
  const asOfDate = normalizeDate(params.asOfDate) ?? new Date().toISOString().slice(0, 10)
  const dedupeKey = `${params.projectId}:${asOfDate}:project_remaining_forecast`
  const actualSpan = buildCompletedProjectActualRemainingWindow(params.rows, asOfDate)
  if (actualSpan) {
    await backtestEarliestPendingDurationAccuracyPrediction({
      projectId: params.projectId,
      engineCode: 'project_remaining_forecast',
      actualStartDate: actualSpan.actualStartDate,
      actualFinishDate: actualSpan.actualFinishDate,
      actualDurationDays: actualSpan.actualDurationDays,
      actualContext: {
        source: 'completed_runtime_schedule_rows',
        durationBasis: 'as_of_to_actual_finish_remaining_window',
        skippedCurrentDedupeKey: dedupeKey,
      },
    })
    return
  }

  await recordDurationAccuracyPrediction(buildProjectRemainingForecastPredictionEvent({
    forecast: params.forecast,
    rows: params.rows,
    asOfDate,
    projectId: params.projectId,
  }))

}

async function recordAccelerationAccuracySnapshot(params: {
  projectId: string
  rows: ScheduleAccelerationRow[]
  targetFeasibility?: ScheduleTargetFeasibility
  runtimeContext?: ScheduleAccelerationContext['runtime']
  asOfDate?: string | null
}) {
  const proposal = params.targetFeasibility?.accelerationProposal
  if (!proposal?.accelerationTargetDays) return
  const asOfDate = normalizeDate(params.asOfDate) ?? new Date().toISOString().slice(0, 10)
  const targetEndDate = normalizeDate(proposal.targetEndDate)
  const dedupeKey = `${params.projectId}:${asOfDate}:acceleration_target:${targetEndDate ?? 'no-target'}`
  const actualSpan = buildCompletedProjectActualRemainingWindow(params.rows, asOfDate)
  if (actualSpan) {
    if (isAccelerationRecommendationAdopted(params.runtimeContext)) {
      const naturalFinishDate = normalizeDate(proposal.naturalEndDate)
      const actualRecoveryDays = Math.max(0, signedDurationDayDelta(actualSpan.actualFinishDate, naturalFinishDate) ?? 0)
      await backtestEarliestPendingDurationAccuracyPrediction({
        projectId: params.projectId,
        engineCode: 'schedule_acceleration_target',
        actualStartDate: actualSpan.actualStartDate,
        actualFinishDate: actualSpan.actualFinishDate,
        actualDurationDays: actualSpan.actualDurationDays,
        actualContext: {
          source: 'completed_runtime_schedule_rows',
          attribution: 'adopted_acceleration_recovery',
          durationBasis: 'as_of_to_actual_finish_remaining_window',
          skippedCurrentDedupeKey: dedupeKey,
          naturalFinishDate,
          targetEndDate,
          actualRecoveryDays,
          targetHit: targetEndDate && actualSpan.actualFinishDate ? actualSpan.actualFinishDate <= targetEndDate : null,
        },
      })
    }
    return
  }

  await recordDurationAccuracyPrediction({
    engineCode: 'schedule_acceleration_target',
    outputKind: 'acceleration_target',
    projectId: params.projectId,
    dedupeKey,
    predictionBasis: 'runtime_acceleration_target',
    modelVersion: 'schedule_acceleration_target_v1',
    predictedStartDate: earliestDate(params.rows.map((row) => normalizeDate(row.values.planned_start_date ?? row.values.start_date))) ?? asOfDate,
    predictedFinishDate: targetEndDate,
    predictedDurationDays: proposal.accelerationTargetDays,
    predictionContext: {
      mode: proposal.mode,
      source: proposal.source,
      naturalEndDate: proposal.naturalEndDate,
      overshootDays: proposal.overshootDays,
      totalRecoverDays: proposal.totalRecoverDays,
      remainingGapDays: proposal.remainingGapDays,
      verdict: proposal.verdict,
      actionTypes: proposal.actions.map((action) => action.type),
    },
  })

}

async function buildRuntimeRecoveryContext(projectId: string, rows: ScheduleAccelerationRow[]): Promise<ScheduleAccelerationContext['runtime']> {
  const taskRows = rows.map((row) => row.values)
  const scheduleState = await loadEffectiveProjectScheduleState({ projectId }).catch(() => null)
  return buildRuntimeExecutionInference({
    projectId,
    rows: taskRows,
    scheduleState,
  }).facts
}

async function loadRuntimeMonthlyCommitmentSummary(projectId: string): Promise<ProjectMonthlyCommitmentSummary> {
  const normalizedProjectId = normalizeText(projectId)
  if (!normalizedProjectId) return {}

  try {
    const rows = await executeSQL<{
      planned_end_date?: string | null
      commitment_status?: string | null
      carryover_from_item_id?: string | null
    }>(
      'SELECT planned_end_date, commitment_status, carryover_from_item_id FROM monthly_plan_items WHERE project_id = ?',
      [normalizedProjectId],
    )

    let activeCommitmentCount = 0
    let carryoverCommitmentCount = 0
    let latestCommitmentFinishDate: string | null = null
    for (const row of rows) {
      const status = normalizeText(row.commitment_status || 'planned')
      if (status === 'completed' || status === 'cancelled') continue
      activeCommitmentCount += 1
      if (status === 'carried_over' || normalizeText(row.carryover_from_item_id)) {
        carryoverCommitmentCount += 1
      }
      const finishDate = normalizeDate(row.planned_end_date)
      if (finishDate && (!latestCommitmentFinishDate || finishDate > latestCommitmentFinishDate)) {
        latestCommitmentFinishDate = finishDate
      }
    }

    return {
      activeCommitmentCount,
      carryoverCommitmentCount,
      latestCommitmentFinishDate,
    }
  } catch {
    return {}
  }
}

function getNumericVersion(version: unknown) {
  const value = Number(version)
  return Number.isFinite(value) ? value : null
}

function chooseCurrentExecutionBaseline(rows: Array<Record<string, unknown>>) {
  return rows
    .filter((row) => CURRENT_EXECUTION_BASELINE_STATUSES.has(normalizeText(row.status)))
    .filter((row) => getNumericVersion(row.version) !== null)
    .sort((left, right) => {
      const versionDiff = (getNumericVersion(right.version) ?? 0) - (getNumericVersion(left.version) ?? 0)
      if (versionDiff !== 0) return versionDiff
      return normalizeText(right.confirmed_at ?? right.updated_at).localeCompare(normalizeText(left.confirmed_at ?? left.updated_at))
    })[0] ?? null
}

export async function loadFrozenBaselineTargetEndDate(projectId: string): Promise<string | null> {
  const normalizedProjectId = normalizeText(projectId)
  if (!normalizedProjectId) return null

  const baselines = await executeSQL<Record<string, unknown>>(
    'SELECT id, status, version, confirmed_at, updated_at FROM task_baselines WHERE project_id = ?',
    [normalizedProjectId],
  ).catch(() => [])
  const baseline = chooseCurrentExecutionBaseline(baselines)
  const baselineId = normalizeText(baseline?.id)
  if (!baselineId) return null

  const items = await executeSQL<{ planned_end_date?: string | null }>(
    'SELECT planned_end_date FROM task_baseline_items WHERE baseline_version_id = ?',
    [baselineId],
  ).catch(() => [])
  return latestDate(items.map((item) => item.planned_end_date))
}

async function resolveRuntimeTargetEndDate(projectId: string, explicitTargetEndDate?: string | null) {
  return normalizeDate(explicitTargetEndDate) ?? await loadFrozenBaselineTargetEndDate(projectId)
}

export async function evaluateRuntimeScheduleAcceleration(params: {
  projectId: string
  targetEndDate?: string | null
  asOfDate?: string | null
  mode?: ScheduleAccelerationMode
  context?: ScheduleAccelerationContext
  runtimeConsumerObservationQueryExec?: DurationRuntimeConsumerObservationQueryExec | null
  runtimeArtifactPublications?: readonly ScheduleAccelerationRuntimeArtifactPublication[] | null
  runtimeConsumerObservedAt?: string | null
  runtimeConsumerErrorHandler?: (error: unknown) => void
}): Promise<{
  rowsEvaluated: number
  projectRemainingForecast: ProjectRemainingDurationForecast
  targetFeasibility?: ScheduleTargetFeasibility
}> {
  const {
    rows,
    criticalPathSnapshot,
    constructionCalendar,
    mergedRuntimeContext,
    monthlyCommitments,
  } = await buildRuntimeForecastInputs(params.projectId, params.context, params.asOfDate)
  const targetEndDate = await resolveRuntimeTargetEndDate(params.projectId, params.targetEndDate)
  const projectRemainingForecast = buildProjectRemainingDurationForecast({
    rows,
    asOfDate: params.asOfDate,
    targetEndDate,
    criticalPathSnapshot,
    constructionCalendar,
    runtimeExecutionFacts: mergedRuntimeContext,
    monthlyCommitments,
  })
  const targetFeasibility = targetEndDate
    ? await evaluateRuntimeDelayRecoveryWithCriticalPath({
        projectId: params.projectId,
        rows,
        targetEndDate,
        mode: params.mode ?? 'compression_preview',
        context: {
          ...params.context,
          runtime: {
            ...mergedRuntimeContext,
            projectRemainingForecastFinishDate: projectRemainingForecast.forecastFinishDate,
          },
        },
      })
    : undefined
  await recordProjectRemainingAccuracySnapshot({
    projectId: params.projectId,
    rows,
    forecast: projectRemainingForecast,
    asOfDate: params.asOfDate,
  })
  await recordAccelerationAccuracySnapshot({
    projectId: params.projectId,
    rows,
    targetFeasibility,
    runtimeContext: mergedRuntimeContext,
    asOfDate: params.asOfDate,
  })
  const runtimeArtifactPublications = params.runtimeArtifactPublications ?? []
  if (params.runtimeConsumerObservationQueryExec && runtimeArtifactPublications.length > 0) {
    try {
      await recordScheduleAccelerationRuntimeConsumedArtifacts({
        queryExec: params.runtimeConsumerObservationQueryExec,
        observedAt: normalizeText(params.runtimeConsumerObservedAt) || undefined,
        callContext: {
          projectId: normalizeText(params.projectId) || null,
          runtimeConsumer: 'scheduleAccelerationRuntimeService',
        },
        sourceEvidenceRefs: [
          ['schedule_acceleration_runtime', normalizeText(params.projectId) || 'no_project'].join(':'),
        ],
        artifacts: buildScheduleAccelerationRuntimeConsumedArtifacts({
          runtimeArtifactPublications,
          projectId: params.projectId,
        }),
      })
    } catch (error) {
      if (params.runtimeConsumerErrorHandler) {
        params.runtimeConsumerErrorHandler(error)
      } else {
        logger.warn('[scheduleAccelerationRuntimeService] failed to record schedule acceleration runtime consumer evidence', {
          projectId: params.projectId,
          error,
        })
      }
    }
  }
  return {
    rowsEvaluated: rows.length,
    projectRemainingForecast,
    targetFeasibility,
  }
}

export async function buildRuntimeProjectRemainingDurationForecast(params: {
  projectId: string
  targetEndDate?: string | null
  asOfDate?: string | null
  context?: ScheduleAccelerationContext
}): Promise<{
  rowsEvaluated: number
  projectRemainingForecast: ProjectRemainingDurationForecast
}> {
  const {
    rows,
    criticalPathSnapshot,
    constructionCalendar,
    mergedRuntimeContext,
    monthlyCommitments,
  } = await buildRuntimeForecastInputs(params.projectId, params.context, params.asOfDate)
  const targetEndDate = await resolveRuntimeTargetEndDate(params.projectId, params.targetEndDate)
  const projectRemainingForecast = buildProjectRemainingDurationForecast({
    rows,
    asOfDate: params.asOfDate,
    targetEndDate,
    criticalPathSnapshot,
    constructionCalendar,
    runtimeExecutionFacts: mergedRuntimeContext,
    monthlyCommitments,
  })
  await recordProjectRemainingAccuracySnapshot({
    projectId: params.projectId,
    rows,
    forecast: projectRemainingForecast,
    asOfDate: params.asOfDate,
  })
  return {
    rowsEvaluated: rows.length,
    projectRemainingForecast,
  }
}
