import type {
  RuntimeExecutionEvidenceContribution,
  RuntimeExecutionEvidenceObject,
  RuntimeExecutionFacts,
  RuntimeExecutionInferenceSummary,
} from './algorithmFactContextService.js'
import type {
  ProjectScheduleStateEvidence,
  ProjectScheduleStateResult,
} from './projectScheduleStateService.js'
import { isLiveCriticalOrNearCriticalTask } from './taskCriticalityProjectionService.js'
import { signedDurationDayDelta } from '../utils/durationDays.js'

export type RuntimeExecutionInferenceRow = {
  id?: string | null
  clientRowId?: string | null
  status?: string | null
  progress?: number | string | null
  planned_start_date?: string | null
  planned_end_date?: string | null
  start_date?: string | null
  end_date?: string | null
  actual_start_date?: string | null
  actual_end_date?: string | null
  is_milestone?: boolean | null
  is_critical?: boolean | null
  total_float_days?: number | string | null
  free_float_days?: number | string | null
}

export type RuntimeExecutionCommercialReadinessStatus =
  | 'commercial_ready'
  | 'advisory_only'
  | 'low_confidence'

export type RuntimeExecutionInferenceResult = {
  sourcePolicy: 'existing_execution_state_only'
  inputPolicy: {
    requiredUserSiteInputs: string[]
    forbiddenSyntheticInputs: string[]
  }
  commercialReadiness: {
    status: RuntimeExecutionCommercialReadinessStatus
    confidence: number
    reasonCodes: string[]
  }
  facts: RuntimeExecutionFacts
  evidenceObjects: RuntimeExecutionEvidenceObject[]
  boundaryPolicy: string[]
}

const FORBIDDEN_SYNTHETIC_SITE_INPUTS = [
  'crewCount',
  'actualWorkfaceCount',
  'towerCraneUtilizationHours',
  'hoistUtilizationHours',
  'dailyLaborCurve',
]

const COMMERCIAL_INFERENCE_BOUNDARY_POLICY = [
  'does_not_require_manual_site_resource_inputs',
  'uses_existing_progress_task_blocker_milestone_and_schedule_state_only',
  'does_not_rewrite_task_dates_or_static_project_facts',
]

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

function normalizeId(value: unknown) {
  const text = normalizeText(value)
  return text || null
}

function readOptionalNumber(value: unknown): number | null {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function round(value: number, digits = 3) {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

function unique(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map(normalizeText).filter(Boolean)))
}

function statusOf(row: RuntimeExecutionInferenceRow) {
  return normalizeText(row.status).toLowerCase()
}

function progressOf(row: RuntimeExecutionInferenceRow) {
  return readOptionalNumber(row.progress) ?? 0
}

function rowId(row: RuntimeExecutionInferenceRow, index: number) {
  return normalizeId(row.id ?? row.clientRowId) ?? `runtime-row-${index + 1}`
}

function isCompleted(row: RuntimeExecutionInferenceRow) {
  return statusOf(row) === 'completed'
    || normalizeText(row.actual_end_date) !== ''
    || progressOf(row) >= 100
}

function isInProgress(row: RuntimeExecutionInferenceRow) {
  const progress = progressOf(row)
  return statusOf(row) === 'in_progress'
    || Boolean(normalizeText(row.actual_start_date) && !normalizeText(row.actual_end_date))
    || (progress > 0 && progress < 100)
}

function isBlocked(row: RuntimeExecutionInferenceRow) {
  return statusOf(row) === 'blocked'
}

function isCriticalOrNearCritical(row: RuntimeExecutionInferenceRow) {
  return isLiveCriticalOrNearCriticalTask(row)
}

function isFloating(row: RuntimeExecutionInferenceRow) {
  const totalFloat = readOptionalNumber(row.total_float_days)
  return totalFloat !== null && totalFloat > 7
}

function milestoneDueSoonScore(rows: RuntimeExecutionInferenceRow[], asOfDate: string | null | undefined) {
  const milestoneRows = rows.filter((row) => row.is_milestone && !isCompleted(row))
  if (milestoneRows.length === 0) return { score: 0, count: 0 }
  const dueSoonCount = milestoneRows.filter((row) => {
    const targetDate = normalizeText(row.planned_end_date ?? row.end_date)
    const delta = signedDurationDayDelta(asOfDate, targetDate)
    return delta !== null && delta >= 0 && delta <= 30
  }).length
  return {
    score: round(clamp(dueSoonCount / Math.max(1, milestoneRows.length), 0, 1), 3),
    count: dueSoonCount,
  }
}

function evidenceValue(evidence: ProjectScheduleStateEvidence[] | null | undefined, code: string) {
  const value = evidence?.find((item) => item.code === code)?.value
  return readOptionalNumber(value)
}

function mapStateEvidenceContribution(item: ProjectScheduleStateEvidence): RuntimeExecutionEvidenceContribution {
  const code = normalizeText(item.code)
  const weight = readOptionalNumber(item.weight) ?? 0
  return {
    code,
    label: normalizeText(item.label) || code,
    weight: round(weight),
    value: item.value ?? null,
    sourceType: 'project_schedule_state_evidence',
  }
}

function deriveTaskContributions(params: {
  rows: RuntimeExecutionInferenceRow[]
  criticalOrNearCriticalTaskCount: number
  blockedTaskCount: number
  inProgressTaskCount: number
  milestoneDueSoonCount: number
}): RuntimeExecutionEvidenceContribution[] {
  const taskCount = Math.max(1, params.rows.length)
  return [
    {
      code: 'critical_task_backlog',
      label: 'Critical or near-critical task backlog inferred from CPM fields.',
      weight: 0.25,
      value: round(params.criticalOrNearCriticalTaskCount / taskCount),
      sourceType: 'task_runtime_fields',
    },
    {
      code: 'blocker_pressure',
      label: 'Blocked task pressure inferred from task status.',
      weight: 0.25,
      value: params.blockedTaskCount,
      sourceType: 'task_runtime_fields',
    },
    {
      code: 'active_execution_density',
      label: 'Active execution density inferred from in-progress task count.',
      weight: 0.2,
      value: round(params.inProgressTaskCount / taskCount),
      sourceType: 'task_runtime_fields',
    },
    {
      code: 'milestone_due_soon',
      label: 'Unfinished milestone due soon inferred from planned target dates.',
      weight: 0.3,
      value: params.milestoneDueSoonCount,
      sourceType: 'task_milestone_dates',
    },
  ]
}

function deriveFallbackResourcePressure(params: {
  blockedTaskCount: number
  hardBlockerCount: number
  criticalOrNearCriticalTaskCount: number
  inProgressTaskCount: number
  taskCount: number
}) {
  if (params.taskCount <= 0) return null
  const blockedPressure = (params.blockedTaskCount + params.hardBlockerCount * 2) * 2
  const criticalPressure = (params.criticalOrNearCriticalTaskCount / params.taskCount) * 4
  const activePressure = (params.inProgressTaskCount / params.taskCount) * 3
  return round(clamp(blockedPressure + criticalPressure + activePressure, 0, 15), 3)
}

function deriveFallbackParallelDensityRatio(params: {
  inProgressTaskCount: number
  criticalOrNearCriticalTaskCount: number
  taskCount: number
}) {
  if (params.taskCount <= 1 || params.inProgressTaskCount <= 0) return null
  const baseline = Math.max(1, params.criticalOrNearCriticalTaskCount)
  return round(clamp(params.inProgressTaskCount / baseline, 0.2, 3), 3)
}

function readinessStatus(params: {
  confidence: number
  hasScheduleState: boolean
  rowCount: number
  evidenceCount: number
}): RuntimeExecutionCommercialReadinessStatus {
  if (params.confidence < 0.35 || params.rowCount === 0) return 'low_confidence'
  if (params.hasScheduleState && params.confidence >= 0.7 && params.evidenceCount >= 3) return 'commercial_ready'
  return 'advisory_only'
}

function buildEvidenceObject(params: {
  code: string
  value?: number | string | boolean | null
  sourceType: string
  sourceIds: string[]
  scopeType: string
  scopeId: string
  windowDays: number
  confidence: number
  contributions: RuntimeExecutionEvidenceContribution[]
  readiness: RuntimeExecutionCommercialReadinessStatus
}): RuntimeExecutionEvidenceObject {
  const boundaryPolicy = [
    ...COMMERCIAL_INFERENCE_BOUNDARY_POLICY,
    ...(params.readiness !== 'commercial_ready'
      ? ['confidence_only_when_source_window_is_sparse']
      : []),
  ]
  return {
    code: params.code,
    factType: 'inferred',
    strength: params.readiness === 'low_confidence' ? 'low_confidence' : 'inferred',
    sourceType: params.sourceType,
    sourceIds: params.sourceIds,
    scope: {
      type: params.scopeType,
      id: params.scopeId,
    },
    windowDays: params.windowDays,
    confidence: params.confidence,
    value: params.value ?? null,
    contributions: params.contributions,
    boundaryPolicy,
  }
}

export function buildRuntimeExecutionInference(params: {
  projectId?: string | null
  asOfDate?: string | null
  windowDays?: number | null
  rows: RuntimeExecutionInferenceRow[]
  scheduleState?: ProjectScheduleStateResult | null
}): RuntimeExecutionInferenceResult {
  const rows = params.rows ?? []
  const taskCount = Math.max(1, rows.length)
  const completedCount = rows.filter(isCompleted).length
  const inProgressTaskCount = rows.filter(isInProgress).length
  const blockedTaskCount = rows.filter(isBlocked).length
  const criticalOrNearCriticalTaskCount = rows.filter(isCriticalOrNearCritical).length
  const floatingTaskCount = rows.filter(isFloating).length
  const hardBlockerCount = readOptionalNumber(params.scheduleState?.metrics.hardBlockerCount) ?? blockedTaskCount
  const resourcePressureScore = readOptionalNumber(params.scheduleState?.metrics.resourcePressureScore)
    ?? deriveFallbackResourcePressure({
      blockedTaskCount,
      hardBlockerCount,
      criticalOrNearCriticalTaskCount,
      inProgressTaskCount,
      taskCount: rows.length,
    })
  const parallelDensityRatio = readOptionalNumber(params.scheduleState?.parallelDensityRatio)
    ?? deriveFallbackParallelDensityRatio({
      inProgressTaskCount,
      criticalOrNearCriticalTaskCount,
      taskCount: rows.length,
    })
  const milestoneDueSoon = milestoneDueSoonScore(rows, params.asOfDate)
  const milestonePressureScore = evidenceValue(params.scheduleState?.evidence, 'milestone_pressure')
    ?? (milestoneDueSoon.score > 0 ? milestoneDueSoon.score : null)
  const evidenceFromScheduleState = params.scheduleState?.evidence ?? []
  const confidence = round(clamp(
    (readOptionalNumber(params.scheduleState?.confidence)
      ?? readOptionalNumber(params.scheduleState?.metrics.dataQualityScore)
      ?? (rows.some((row) => isInProgress(row) || isCompleted(row) || isBlocked(row)) ? 0.45 : 0.46))
      - (rows.length <= 1 && !params.scheduleState ? 0.1 : 0),
    0.05,
    0.95,
  ), 3)
  const readiness = readinessStatus({
    confidence,
    hasScheduleState: Boolean(params.scheduleState),
    rowCount: rows.length,
    evidenceCount: evidenceFromScheduleState.length,
  })
  const reasonCodes = [
    readiness === 'commercial_ready' ? 'source_window_explainable' : null,
    readiness !== 'commercial_ready' ? 'execution_update_sparse' : null,
    params.scheduleState ? 'schedule_state_window_available' : 'schedule_state_window_missing',
  ].filter((item): item is string => Boolean(item))
  const scheduleContributions = evidenceFromScheduleState.map(mapStateEvidenceContribution)
  const taskContributions = deriveTaskContributions({
    rows,
    criticalOrNearCriticalTaskCount,
    blockedTaskCount,
    inProgressTaskCount,
    milestoneDueSoonCount: milestoneDueSoon.count,
  })
  const allContributions = [...scheduleContributions, ...taskContributions]
  const sourceType = params.scheduleState ? 'project_schedule_state_window' : 'task_execution_state_window'
  const scopeType = params.scheduleState?.scopeType ?? 'project'
  const scopeId = params.scheduleState?.scopeId ?? normalizeId(params.projectId) ?? 'project'
  const windowDays = Math.max(1, Math.ceil(Number(params.windowDays ?? params.scheduleState?.windowDays ?? 14)))
  const sourceIds = rows.map(rowId)
  const evidenceObjects = [
    resourcePressureScore !== null
      ? buildEvidenceObject({
        code: resourcePressureScore >= 8 ? 'resource_pressure_high' : 'resource_pressure_controlled',
        value: resourcePressureScore,
        sourceType,
        sourceIds,
        scopeType,
        scopeId,
        windowDays,
        confidence,
        contributions: allContributions.filter((item) => [
          'critical_path_throughput_down',
          'resource_pressure_high',
          'resource_pressure_controlled',
          'critical_task_backlog',
          'blocker_pressure',
          'active_execution_density',
        ].includes(item.code)),
        readiness,
      })
      : null,
    parallelDensityRatio !== null
      ? buildEvidenceObject({
        code: 'parallel_density_up',
        value: parallelDensityRatio,
        sourceType,
        sourceIds,
        scopeType,
        scopeId,
        windowDays,
        confidence,
        contributions: allContributions.filter((item) => [
          'parallel_density_up',
          'active_execution_density',
          'critical_task_backlog',
        ].includes(item.code)),
        readiness,
      })
      : null,
    milestonePressureScore !== null
      ? buildEvidenceObject({
        code: 'milestone_pressure',
        value: milestonePressureScore,
        sourceType,
        sourceIds,
        scopeType,
        scopeId,
        windowDays,
        confidence,
        contributions: allContributions.filter((item) => [
          'milestone_pressure',
          'milestone_window_throughput_down',
          'milestone_due_soon',
        ].includes(item.code)),
        readiness,
      })
      : null,
  ].filter((item): item is RuntimeExecutionEvidenceObject => Boolean(item))
  const impactBoundary: RuntimeExecutionInferenceSummary['impactBoundary'] = readiness === 'commercial_ready'
    ? (params.scheduleState?.downstreamPolicy.confidenceOnly ? 'candidate_only' : 'runtime_adjustment_allowed')
    : 'confidence_only'
  const inferredSignalCodes = evidenceObjects.map((item) => item.code)
  const evidenceCodes = unique([
    ...evidenceFromScheduleState.map((item) => item.code),
    ...inferredSignalCodes,
    readiness === 'commercial_ready' ? 'runtime_inference_commercial_ready' : null,
    readiness === 'advisory_only' ? 'runtime_inference_advisory_only' : null,
    readiness === 'low_confidence' ? 'runtime_inference_low_confidence' : null,
    ...reasonCodes,
  ])
  const runtimeInferenceSummary: RuntimeExecutionInferenceSummary = {
    factType: 'inferred',
    sourcePolicy: 'existing_execution_state_only',
    confidence,
    readinessStatus: readiness,
    impactBoundary,
    sourceWindowDays: windowDays,
    inferredSignalCodes,
  }
  const facts: RuntimeExecutionFacts = {
    progressCompletionRatio: rows.length > 0 ? round(completedCount / taskCount) : null,
    inProgressTaskCount,
    blockedTaskCount,
    hardBlockerCount,
    resourcePressureScore,
    parallelDensityRatio,
    milestonePressureScore,
    forecastDelayDays: null,
    baselineDeviationDays: params.scheduleState?.deviationRecoveryDays != null
      ? Math.max(0, -params.scheduleState.deviationRecoveryDays)
      : null,
    criticalOrNearCriticalTaskCount,
    floatingTaskCount,
    scheduleState: params.scheduleState?.state ?? null,
    localAccelerationFactor: params.scheduleState?.localAccelerationFactor ?? null,
    evidenceCodes,
    evidenceObjects,
    runtimeInferenceSummary,
  }
  return {
    sourcePolicy: 'existing_execution_state_only',
    inputPolicy: {
      requiredUserSiteInputs: [],
      forbiddenSyntheticInputs: FORBIDDEN_SYNTHETIC_SITE_INPUTS,
    },
    commercialReadiness: {
      status: readiness,
      confidence,
      reasonCodes,
    },
    facts,
    evidenceObjects,
    boundaryPolicy: [
      ...COMMERCIAL_INFERENCE_BOUNDARY_POLICY,
      'inferred_runtime_facts_may_adjust_forecast_only_with_confidence_and_downstream_policy',
      'inferred_runtime_facts_are_not_confirmed_site_resource_counts',
    ],
  }
}
