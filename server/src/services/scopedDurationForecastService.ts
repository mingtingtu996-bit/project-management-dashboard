import type { ScheduleAccelerationRow } from './scheduleAccelerationService.js'
import type { TaskDurationForecast } from './taskDurationForecastService.js'
import type { ProjectTaskAttribution } from './taskAttributionProjectionService.js'
import {
  calendarDateText,
  isAuthoritativeConstructionCalendar,
  isConstructionProductionDay,
  parseConstructionCalendarDate,
  productionDaysBetweenInclusive,
  type ConstructionCalendarContext,
} from './constructionCalendar.js'
import { orderDurationBand } from './durationEngineeringPlausibilityGuardrailService.js'
import { delayDayDelta, normalizeDateOnlyText } from '../utils/durationDays.js'
import { isCompletedTask } from '../utils/taskStatus.js'
import {
  simulateDurationNetworkProbability,
  type DurationNetworkProbabilityResult,
} from './durationNetworkMonteCarloService.js'
import {
  buildConstructionProductionDayDurationMetric,
  type DurationMetricDto,
} from './durationMetricService.js'

export type ScopedDurationForecastDimension = 'division' | 'subdivision' | 'specialty'
export type ScopedDurationForecastState = 'not_started' | 'in_progress' | 'completed'
export type ScopedDurationForecastDataStatus = 'ready' | 'degraded' | 'insufficient_data'

export type ScopedDurationForecastGroup = {
  id: string
  dimension: ScopedDurationForecastDimension
  sourceId: string | null
  name: string
  sortOrder: number
  taskIds: string[]
  taskCount: number
  completedTaskCount: number
  remainingTaskCount: number
  criticalTaskCount: number
  boundaryPredecessorCount: number
  unresolvedBoundaryPredecessorCount: number
  targetFinishDate: string | null
  p20FinishDate: string | null
  p50FinishDate: string | null
  p80FinishDate: string | null
  expectedFinishDate: string | null
  remainingDuration: DurationMetricDto
  targetGap: DurationMetricDto
  delay: DurationMetricDto
  /** @deprecated Use remainingDuration. Removed after the v1.5 compatibility window. */
  remainingDurationDays: number | null
  /** @deprecated Use targetGap. Removed after the v1.5 compatibility window. */
  targetGapDays: number | null
  /** @deprecated Use delay. Removed after the v1.5 compatibility window. */
  delayDays: number | null
  confidenceLevel: string | null
  confidenceScore: number | null
  forecastCoverageRate: number
  probabilityCoverageRate: number
  probabilityBasis: 'monte_carlo' | 'pert_analytic' | 'deterministic_completed'
  networkProbability: (DurationNetworkProbabilityResult & {
    p20RemainingDuration: DurationMetricDto
    p50RemainingDuration: DurationMetricDto
    p80RemainingDuration: DurationMetricDto
    /** @deprecated Use p20RemainingDuration. */
    p20RemainingDays: number | null
    /** @deprecated Use p50RemainingDuration. */
    p50RemainingDays: number | null
    /** @deprecated Use p80RemainingDuration. */
    p80RemainingDays: number | null
    p20FinishDate: string | null
    p50FinishDate: string | null
    p80FinishDate: string | null
  }) | null
  forecastState: ScopedDurationForecastState
  dataStatus: ScopedDurationForecastDataStatus
  degradationReasons: string[]
  governingTaskIds: string[]
}

export type ScopedDurationForecastResponse = {
  projectId: string
  asOfDate: string
  dimensions: Record<ScopedDurationForecastDimension, ScopedDurationForecastGroup[]>
  summary: {
    groupCount: number
    readyCount: number
    degradedCount: number
    insufficientDataCount: number
  }
}

export type BuildScopedDurationForecastsInput = {
  projectId: string
  asOfDate: string
  rows: ScheduleAccelerationRow[]
  forecasts: TaskDurationForecast[]
  attributions: Map<string, ProjectTaskAttribution>
  criticalTaskIds: Set<string>
  constructionCalendar?: ConstructionCalendarContext | null
  globalDegradationReasons?: string[]
}

type EligibleTask = {
  id: string
  row: ScheduleAccelerationRow
  attribution: ProjectTaskAttribution | null
  completed: boolean
}

type GroupBucket = {
  id: string
  dimension: ScopedDurationForecastDimension
  sourceId: string | null
  name: string
  sortOrder: number
  tasks: EligibleTask[]
}

type TaskFinishBand = {
  taskId: string
  p20: string | null
  p50: string | null
  p80: string | null
  currentOverdueDays: number | null
  forecastCovered: boolean
  probabilityCovered: boolean
  degradationReasons: string[]
}

const DIMENSIONS: ScopedDurationForecastDimension[] = ['division', 'subdivision', 'specialty']
const UNASSIGNED_NAMES: Record<ScopedDurationForecastDimension, string> = {
  division: '未归属分部工程',
  subdivision: '未归属分项工程',
  specialty: '未归属专项工程',
}
const COMPLETED_STATUSES = new Set([
  'completed',
  'done',
  'closed',
  'finished',
  '已完成',
  '已关闭',
])
const IN_PROGRESS_STATUSES = new Set([
  'in_progress',
  'in progress',
  'active',
  'started',
  '进行中',
])
const EXCLUDED_TASK_STATUSES = new Set([
  'cancelled',
  'canceled',
  'deleted',
  'removed',
  'archived',
  'inactive',
  'void',
  'voided',
  '\u5df2\u53d6\u6d88',
  '\u5df2\u5220\u9664',
  '\u5df2\u79fb\u9664',
  '\u5df2\u5f52\u6863',
  '\u505c\u7528',
  '\u4f5c\u5e9f',
])
function normalizeText(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeDate(value: unknown) {
  return normalizeDateOnlyText(typeof value === 'string' || value instanceof Date ? value : null)
}

function readFiniteNumber(value: unknown) {
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function unique(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map(normalizeText).filter(Boolean)))
}

function latestDate(values: Array<string | null | undefined>) {
  return values.map(normalizeDate).filter((value): value is string => Boolean(value)).sort().at(-1) ?? null
}

function isCompleted(row: ScheduleAccelerationRow) {
  return isCompletedTask({
    status: normalizeText(row.values.status),
    progress: Number(row.values.progress ?? 0),
    actual_end_date: normalizeDate(row.values.actual_end_date),
  })
}

function isEligibleRow(row: ScheduleAccelerationRow) {
  const id = normalizeText(row.clientRowId)
  if (!id) return false
  const status = normalizeText(row.values.status).toLowerCase()
  if (EXCLUDED_TASK_STATUSES.has(status)) return false
  const projectionMode = normalizeText(row.rowProjectionMode ?? row.values.row_projection_mode)
  if (projectionMode && projectionMode !== 'schedule_row') return false

  const contributionMode = normalizeText(row.values.duration_contribution_mode)
  const isMilestone = row.values.is_milestone === true
  if (!contributionMode) return row.values.is_wbs_summary !== true && row.values.is_executable !== false
  return contributionMode === 'duration_bearing'
    || (contributionMode === 'handover_marker' && isMilestone)
}

function dimensionAttribution(
  dimension: ScopedDurationForecastDimension,
  attribution: ProjectTaskAttribution | null,
) {
  if (dimension === 'division') {
    return {
      sourceId: attribution?.divisionId ?? null,
      name: attribution?.divisionName ?? null,
      sortOrder: attribution?.divisionSortOrder ?? 0,
    }
  }
  if (dimension === 'subdivision') {
    return {
      sourceId: attribution?.subdivisionId ?? null,
      name: attribution?.subdivisionName ?? null,
      sortOrder: attribution?.subdivisionSortOrder ?? 0,
    }
  }
  return {
    sourceId: attribution?.specialtyId ?? null,
    name: attribution?.specialtyName ?? null,
    sortOrder: attribution?.specialtySortOrder ?? 0,
  }
}

function groupId(dimension: ScopedDurationForecastDimension, sourceId: string | null) {
  return `${dimension}-${sourceId ?? '__unassigned__'}`
}

function relevantAttributionReasons(
  dimension: ScopedDurationForecastDimension,
  attribution: ProjectTaskAttribution | null,
) {
  if (!attribution) {
    return [`missing_${dimension}_attribution`]
  }
  return attribution.degradationReasons.filter((reason) => {
    if (reason === 'wbs_parent_cycle') return dimension !== 'specialty'
    if (dimension === 'division') return reason === 'missing_division_attribution'
    if (dimension === 'subdivision') return reason === 'missing_subdivision_attribution'
    return reason === 'missing_specialty_attribution' || reason === 'specialty_business_label_fallback'
  })
}

function shiftProductionDays(
  value: string,
  delta: number,
  calendar?: ConstructionCalendarContext | null,
) {
  const start = parseConstructionCalendarDate(value)
  if (!start || !Number.isFinite(delta)) return null
  const steps = Math.abs(Math.round(delta))
  if (steps === 0) return calendarDateText(start)

  const direction = delta > 0 ? 1 : -1
  const cursor = new Date(start)
  let remaining = steps
  while (remaining > 0) {
    cursor.setUTCDate(cursor.getUTCDate() + direction)
    if (isConstructionProductionDay(cursor, calendar)) remaining -= 1
  }
  return calendarDateText(cursor)
}

function buildTaskFinishBand(
  task: EligibleTask,
  forecast: TaskDurationForecast | undefined,
  asOfDate: string,
  calendar?: ConstructionCalendarContext | null,
): TaskFinishBand {
  const forecastFinish = normalizeDate(forecast?.forecastFinishDate)
  const plannedFinish = normalizeDate(task.row.values.planned_end_date ?? task.row.values.end_date)
  const degradationReasons: string[] = []

  if (!forecastFinish) degradationReasons.push('missing_current_forecast')
  const forecastOverdueDays = forecastFinish
    ? delayDayDelta(forecastFinish, asOfDate, calendar)
    : null
  if (forecastOverdueDays !== null && forecastOverdueDays > 0) {
    degradationReasons.push('past_current_forecast_finish', 'missing_usable_finish')
    return {
      taskId: task.id,
      p20: null,
      p50: null,
      p80: null,
      currentOverdueDays: forecastOverdueDays,
      forecastCovered: false,
      probabilityCovered: false,
      degradationReasons,
    }
  }

  const currentOverdueDays = !forecastFinish && plannedFinish
    ? delayDayDelta(plannedFinish, asOfDate, calendar)
    : null
  if (currentOverdueDays !== null && currentOverdueDays > 0) {
    degradationReasons.push('overdue_without_current_forecast', 'missing_usable_finish')
    return {
      taskId: task.id,
      p20: null,
      p50: null,
      p80: null,
      currentOverdueDays,
      forecastCovered: false,
      probabilityCovered: false,
      degradationReasons,
    }
  }

  const p50 = forecastFinish ?? plannedFinish
  if (!forecastFinish && plannedFinish) degradationReasons.push('planned_finish_fallback')
  if (!p50) {
    degradationReasons.push('missing_usable_finish')
    return {
      taskId: task.id,
      p20: null,
      p50: null,
      p80: null,
      currentOverdueDays: null,
      forecastCovered: false,
      probabilityCovered: false,
      degradationReasons,
    }
  }

  const probability = forecastFinish ? forecast?.probabilityDuration : null
  const p20Remaining = readFiniteNumber(probability?.p20RemainingDays)
  const p50Remaining = readFiniteNumber(probability?.p50RemainingDays)
  const p80Remaining = readFiniteNumber(probability?.p80RemainingDays)
  const probabilityCovered = p20Remaining !== null && p50Remaining !== null && p80Remaining !== null
  if (!probabilityCovered) {
    degradationReasons.push('missing_probability_window')
    return {
      taskId: task.id,
      p20: p50,
      p50,
      p80: p50,
      currentOverdueDays: null,
      forecastCovered: Boolean(forecastFinish),
      probabilityCovered: false,
      degradationReasons,
    }
  }

  return {
    taskId: task.id,
    p20: shiftProductionDays(p50, p20Remaining - p50Remaining, calendar),
    p50,
    p80: shiftProductionDays(p50, p80Remaining - p50Remaining, calendar),
    currentOverdueDays: null,
    forecastCovered: true,
    probabilityCovered: true,
    degradationReasons,
  }
}

function dateTimestamp(value: string | null) {
  const date = parseConstructionCalendarDate(value)
  return date?.getTime() ?? null
}

function dateFromTimestamp(value: number | null) {
  if (value === null) return null
  return new Date(value).toISOString().slice(0, 10)
}

function orderFinishBand(p20: string | null, p50: string | null, p80: string | null) {
  const ordered = orderDurationBand({
    engineCode: 'scoped_duration_forecast',
    p20Days: dateTimestamp(p20),
    p50Days: dateTimestamp(p50),
    p80Days: dateTimestamp(p80),
  })
  return {
    p20: dateFromTimestamp(ordered.band.p20Days),
    p50: dateFromTimestamp(ordered.band.p50Days),
    p80: dateFromTimestamp(ordered.band.p80Days),
    reordered: ordered.warnings.length > 0,
  }
}

function productionDaysFromAsOf(
  asOfDate: string,
  finishDate: string | null,
  calendar?: ConstructionCalendarContext | null,
) {
  const asOf = parseConstructionCalendarDate(asOfDate)
  const finish = parseConstructionCalendarDate(finishDate)
  if (!asOf || !finish) return null
  if (finish < asOf) return 0
  return productionDaysBetweenInclusive(asOf, finish, calendar)
}

function forecastProbabilityRemainingDays(
  forecast: TaskDurationForecast | undefined,
  percentile: 'p20' | 'p50' | 'p80',
) {
  const probability = forecast?.probabilityDuration
  if (!probability) return null
  const value = percentile === 'p20'
    ? probability.p20RemainingDays
    : percentile === 'p50'
      ? probability.p50RemainingDays
      : probability.p80RemainingDays
  const normalized = readFiniteNumber(value)
  return normalized !== null && normalized > 0 ? normalized : null
}

function forecastState(tasks: EligibleTask[]): ScopedDurationForecastState {
  if (tasks.every((task) => task.completed)) return 'completed'
  if (tasks.some((task) => {
    if (task.completed) return true
    const status = normalizeText(task.row.values.status).toLowerCase()
    return IN_PROGRESS_STATUSES.has(status) || Number(task.row.values.progress ?? 0) > 0
  })) return 'in_progress'
  return 'not_started'
}

function hasUsablePredecessorTiming(
  predecessorId: string,
  rowById: Map<string, ScheduleAccelerationRow>,
  forecastByTaskId: Map<string, TaskDurationForecast>,
  asOfDate: string,
) {
  const row = rowById.get(predecessorId)
  if (normalizeDate(row?.values.actual_end_date)) return true

  const forecastFinish = normalizeDate(forecastByTaskId.get(predecessorId)?.forecastFinishDate)
  const plannedFinish = normalizeDate(row?.values.planned_end_date ?? row?.values.end_date)
  if (row && isCompleted(row)) return Boolean(forecastFinish || plannedFinish)

  return Boolean(
    (forecastFinish && forecastFinish >= asOfDate)
    || (plannedFinish && plannedFinish >= asOfDate),
  )
}

function buildBoundaryCounts(
  bucket: GroupBucket,
  dimension: ScopedDurationForecastDimension,
  attributions: Map<string, ProjectTaskAttribution>,
  rowById: Map<string, ScheduleAccelerationRow>,
  forecastByTaskId: Map<string, TaskDurationForecast>,
  asOfDate: string,
) {
  const boundaryKeys = new Map<string, string>()
  for (const task of bucket.tasks) {
    for (const dependency of task.row.predecessorDependencies ?? []) {
      const predecessorId = normalizeText(dependency.clientRowId)
      if (!predecessorId) continue
      const predecessorAttribution = attributions.get(predecessorId) ?? null
      const predecessorIdentity = dimensionAttribution(dimension, predecessorAttribution)
      if (groupId(dimension, predecessorIdentity.sourceId) === bucket.id) continue

      const dependencyType = normalizeText(dependency.dependencyType).toUpperCase() || 'FS'
      const lagDays = readFiniteNumber(dependency.lagDays) ?? 0
      const key = `${predecessorId}|${task.id}|${dependencyType}|${lagDays}`
      boundaryKeys.set(key, predecessorId)
    }
  }

  let unresolved = 0
  for (const predecessorId of boundaryKeys.values()) {
    if (!hasUsablePredecessorTiming(predecessorId, rowById, forecastByTaskId, asOfDate)) unresolved += 1
  }
  return { count: boundaryKeys.size, unresolved }
}

function governingTaskIds(
  bands: TaskFinishBand[],
  rawBand: { p20: string | null, p50: string | null, p80: string | null },
  orderedDates: Array<string | null>,
) {
  const rawBoundaries = (['p20', 'p50', 'p80'] as const).map((key) => ({
    date: rawBand[key],
    taskIds: rawBand[key]
      ? bands.filter((band) => band[key] === rawBand[key]).map((band) => band.taskId)
      : [],
  }))
  return unique(orderedDates.filter((date): date is string => Boolean(date)).flatMap((date) => {
    return rawBoundaries.filter((boundary) => boundary.date === date).flatMap((boundary) => boundary.taskIds)
  }))
}

function governingConfidence(
  taskIds: string[],
  forecastByTaskId: Map<string, TaskDurationForecast>,
) {
  if (taskIds.length === 0) return { level: null, score: null }
  const values = taskIds.map((taskId) => forecastByTaskId.get(taskId)).filter(Boolean) as TaskDurationForecast[]
  if (values.length !== taskIds.length) return { level: null, score: null }
  const lowest = [...values].sort((left, right) => left.confidenceScore - right.confidenceScore)[0]
  return {
    level: normalizeText(lowest?.confidenceLevel) || null,
    score: readFiniteNumber(lowest?.confidenceScore),
  }
}

function buildGroupForecast(input: {
  bucket: GroupBucket
  projectId: string
  asOfDate: string
  forecastByTaskId: Map<string, TaskDurationForecast>
  criticalTaskIds: Set<string>
  attributions: Map<string, ProjectTaskAttribution>
  rowById: Map<string, ScheduleAccelerationRow>
  calendar?: ConstructionCalendarContext | null
  globalDegradationReasons: string[]
}): ScopedDurationForecastGroup {
  const {
    bucket,
    asOfDate,
    forecastByTaskId,
    criticalTaskIds,
    attributions,
    rowById,
    calendar,
  } = input
  const durationMetric = (value: number | null) => buildConstructionProductionDayDurationMetric(value, {
    asOf: asOfDate,
    timezone: calendar?.timezone,
    calendar,
  })
  const completedTasks = bucket.tasks.filter((task) => task.completed)
  const activeTasks = bucket.tasks.filter((task) => !task.completed)
  const targetFinishDate = latestDate(bucket.tasks.map((task) => {
    return normalizeDate(task.row.values.planned_end_date ?? task.row.values.end_date)
  }))
  const boundary = buildBoundaryCounts(
    bucket,
    bucket.dimension,
    attributions,
    rowById,
    forecastByTaskId,
    asOfDate,
  )
  const reasons = unique([
    ...input.globalDegradationReasons,
    ...bucket.tasks.flatMap((task) => relevantAttributionReasons(bucket.dimension, task.attribution)),
    ...(boundary.unresolved > 0 ? ['unresolved_boundary_predecessor'] : []),
  ])

  if (activeTasks.length === 0) {
    const actualFinishDate = latestDate(completedTasks.map((task) => {
      return normalizeDate(task.row.values.actual_end_date)
    }))
    if (!actualFinishDate) reasons.push('missing_actual_completion')
    const completionFinishDate = actualFinishDate ?? latestDate(completedTasks.map((task) => {
      return normalizeDate(task.row.values.planned_end_date ?? task.row.values.end_date)
    }))
    const targetGapDays = delayDayDelta(targetFinishDate, completionFinishDate, calendar)
    const remainingDurationDays = completionFinishDate ? 0 : null
    const delayDays = targetGapDays === null ? null : Math.max(0, targetGapDays)
    return {
      id: bucket.id,
      dimension: bucket.dimension,
      sourceId: bucket.sourceId,
      name: bucket.name,
      sortOrder: bucket.sortOrder,
      taskIds: bucket.tasks.map((task) => task.id),
      taskCount: bucket.tasks.length,
      completedTaskCount: completedTasks.length,
      remainingTaskCount: 0,
      criticalTaskCount: bucket.tasks.filter((task) => criticalTaskIds.has(task.id)).length,
      boundaryPredecessorCount: boundary.count,
      unresolvedBoundaryPredecessorCount: boundary.unresolved,
      targetFinishDate,
      p20FinishDate: completionFinishDate,
      p50FinishDate: completionFinishDate,
      p80FinishDate: completionFinishDate,
      expectedFinishDate: completionFinishDate,
      remainingDuration: durationMetric(remainingDurationDays),
      targetGap: durationMetric(targetGapDays),
      delay: durationMetric(delayDays),
      remainingDurationDays,
      targetGapDays,
      delayDays,
      confidenceLevel: null,
      confidenceScore: null,
      forecastCoverageRate: 1,
      probabilityCoverageRate: 1,
      probabilityBasis: 'deterministic_completed',
      networkProbability: null,
      forecastState: 'completed',
      dataStatus: completionFinishDate
        ? (reasons.length > 0 ? 'degraded' : 'ready')
        : 'insufficient_data',
      degradationReasons: unique(reasons),
      governingTaskIds: [],
    }
  }

  const bands = activeTasks.map((task) => buildTaskFinishBand(
    task,
    forecastByTaskId.get(task.id),
    asOfDate,
    calendar,
  ))
  reasons.push(...bands.flatMap((band) => band.degradationReasons))
  const hasUnboundedActiveTask = bands.some((band) => !band.p50)
  const rawP20 = hasUnboundedActiveTask ? null : latestDate(bands.map((band) => band.p20))
  const rawP50 = hasUnboundedActiveTask ? null : latestDate(bands.map((band) => band.p50))
  const rawP80 = hasUnboundedActiveTask ? null : latestDate(bands.map((band) => band.p80))
  const analyticOrdered = orderFinishBand(rawP20, rawP50, rawP80)
  const activeTaskIds = new Set(activeTasks.map((task) => task.id))
  const networkDependencies = activeTasks.flatMap((task) => task.row.predecessorDependencies
    .filter((dependency) => activeTaskIds.has(normalizeText(dependency.clientRowId)))
    .map((dependency) => ({
      predecessorTaskId: normalizeText(dependency.clientRowId),
      successorTaskId: task.id,
      dependencyType: dependency.dependencyType,
      lagDays: dependency.lagDays,
    })))
  const networkProbabilityResult = simulateDurationNetworkProbability({
    seed: [input.projectId, bucket.dimension, bucket.id, asOfDate].join(':'),
    tasks: activeTasks.map((task) => {
      const forecast = forecastByTaskId.get(task.id)
      const plannedStart = normalizeDate(task.row.values.planned_start_date ?? task.row.values.start_date)
      const plannedReleaseDays = plannedStart
        ? productionDaysFromAsOf(asOfDate, plannedStart, calendar)
        : null
      return {
        id: task.id,
        p20Days: forecastProbabilityRemainingDays(forecast, 'p20'),
        p50Days: forecastProbabilityRemainingDays(forecast, 'p50'),
        p80Days: forecastProbabilityRemainingDays(forecast, 'p80'),
        releaseOffsetDays: plannedReleaseDays === null ? 0 : Math.max(0, plannedReleaseDays - 1),
      }
    }),
    dependencies: networkDependencies,
    simulationCount: 1000,
    scenarioCorrelation: 0.35,
  })
  const monteCarloApplied = networkProbabilityResult.probabilityBasis === 'monte_carlo'
    && networkProbabilityResult.p20DurationDays !== null
    && networkProbabilityResult.p50DurationDays !== null
    && networkProbabilityResult.p80DurationDays !== null
  const monteCarloBand = monteCarloApplied
    ? orderFinishBand(
        shiftProductionDays(asOfDate, networkProbabilityResult.p20DurationDays! - 1, calendar),
        shiftProductionDays(asOfDate, networkProbabilityResult.p50DurationDays! - 1, calendar),
        shiftProductionDays(asOfDate, networkProbabilityResult.p80DurationDays! - 1, calendar),
      )
    : null
  const ordered = monteCarloBand ?? analyticOrdered
  if (ordered.reordered) reasons.push('duration_band_reordered')

  const forecastCoverageRate = bands.filter((band) => band.forecastCovered).length / activeTasks.length
  const probabilityCoverageRate = bands.filter((band) => band.probabilityCovered).length / activeTasks.length
  const governingIds = monteCarloApplied
    ? activeTasks.map((task) => task.id)
    : governingTaskIds(
        bands,
        { p20: rawP20, p50: rawP50, p80: rawP80 },
        [ordered.p20, ordered.p50, ordered.p80],
      )
  const confidence = governingConfidence(governingIds, forecastByTaskId)
  const remainingDurationDays = productionDaysFromAsOf(asOfDate, ordered.p50, calendar)
  const targetGapDays = delayDayDelta(targetFinishDate, ordered.p50, calendar)
  const currentOverdueDays = bands.reduce<number | null>((maximum, band) => {
    if (band.currentOverdueDays === null) return maximum
    return maximum === null ? band.currentOverdueDays : Math.max(maximum, band.currentOverdueDays)
  }, null)
  const degradationReasons = unique(reasons)
  const dataStatus: ScopedDurationForecastDataStatus = !ordered.p50
    ? 'insufficient_data'
    : forecastCoverageRate === 1
      && probabilityCoverageRate === 1
      && boundary.unresolved === 0
      && degradationReasons.length === 0
      ? 'ready'
      : 'degraded'
  const delayDays = targetGapDays === null
    ? currentOverdueDays
    : Math.max(0, targetGapDays)

  return {
    id: bucket.id,
    dimension: bucket.dimension,
    sourceId: bucket.sourceId,
    name: bucket.name,
    sortOrder: bucket.sortOrder,
    taskIds: bucket.tasks.map((task) => task.id),
    taskCount: bucket.tasks.length,
    completedTaskCount: completedTasks.length,
    remainingTaskCount: activeTasks.length,
    criticalTaskCount: bucket.tasks.filter((task) => criticalTaskIds.has(task.id)).length,
    boundaryPredecessorCount: boundary.count,
    unresolvedBoundaryPredecessorCount: boundary.unresolved,
    targetFinishDate,
    p20FinishDate: ordered.p20,
    p50FinishDate: ordered.p50,
    p80FinishDate: ordered.p80,
    expectedFinishDate: ordered.p50,
    remainingDuration: durationMetric(remainingDurationDays),
    targetGap: durationMetric(targetGapDays),
    delay: durationMetric(delayDays),
    remainingDurationDays,
    targetGapDays,
    delayDays,
    confidenceLevel: confidence.level,
    confidenceScore: confidence.score,
    forecastCoverageRate,
    probabilityCoverageRate,
    probabilityBasis: monteCarloApplied ? 'monte_carlo' : 'pert_analytic',
    networkProbability: {
      ...networkProbabilityResult,
      p20RemainingDuration: durationMetric(networkProbabilityResult.p20DurationDays),
      p50RemainingDuration: durationMetric(networkProbabilityResult.p50DurationDays),
      p80RemainingDuration: durationMetric(networkProbabilityResult.p80DurationDays),
      p20RemainingDays: networkProbabilityResult.p20DurationDays,
      p50RemainingDays: networkProbabilityResult.p50DurationDays,
      p80RemainingDays: networkProbabilityResult.p80DurationDays,
      p20FinishDate: monteCarloBand?.p20 ?? analyticOrdered.p20,
      p50FinishDate: monteCarloBand?.p50 ?? analyticOrdered.p50,
      p80FinishDate: monteCarloBand?.p80 ?? analyticOrdered.p80,
    },
    forecastState: forecastState(bucket.tasks),
    dataStatus,
    degradationReasons,
    governingTaskIds: governingIds,
  }
}

function buildBuckets(
  tasks: EligibleTask[],
  dimension: ScopedDurationForecastDimension,
) {
  const buckets = new Map<string, GroupBucket>()
  for (const task of tasks) {
    const identity = dimensionAttribution(dimension, task.attribution)
    const id = groupId(dimension, identity.sourceId)
    const bucket = buckets.get(id) ?? {
      id,
      dimension,
      sourceId: identity.sourceId,
      name: normalizeText(identity.name) || UNASSIGNED_NAMES[dimension],
      sortOrder: identity.sourceId ? Number(identity.sortOrder ?? 0) : Number.MAX_SAFE_INTEGER,
      tasks: [],
    }
    if (!bucket.tasks.some((item) => item.id === task.id)) bucket.tasks.push(task)
    buckets.set(id, bucket)
  }
  return Array.from(buckets.values()).sort((left, right) => {
    return left.sortOrder - right.sortOrder
      || left.name.localeCompare(right.name, 'zh-CN')
      || left.id.localeCompare(right.id)
  })
}

export function buildScopedDurationForecasts(
  input: BuildScopedDurationForecastsInput,
): ScopedDurationForecastResponse {
  const asOfDate = normalizeDate(input.asOfDate) ?? input.asOfDate
  const rowById = new Map<string, ScheduleAccelerationRow>()
  for (const row of input.rows) {
    const id = normalizeText(row.clientRowId)
    if (id && !rowById.has(id)) rowById.set(id, row)
  }
  const eligibleTasks = Array.from(rowById.values())
    .filter(isEligibleRow)
    .map((row): EligibleTask => {
      const id = normalizeText(row.clientRowId)
      return {
        id,
        row,
        attribution: input.attributions.get(id) ?? null,
        completed: isCompleted(row),
      }
    })
  const forecastByTaskId = new Map(
    input.forecasts
      .filter((forecast) => normalizeText(forecast.taskId))
      .map((forecast) => [normalizeText(forecast.taskId), forecast] as const),
  )
  const globalDegradationReasons = unique([
    ...(input.globalDegradationReasons ?? []),
    ...(!input.constructionCalendar ? ['construction_calendar_fallback'] : []),
    ...(isAuthoritativeConstructionCalendar(input.constructionCalendar)
      ? []
      : ['construction_calendar_identity_missing']),
  ])
  const dimensions = {
    division: [] as ScopedDurationForecastGroup[],
    subdivision: [] as ScopedDurationForecastGroup[],
    specialty: [] as ScopedDurationForecastGroup[],
  }

  for (const dimension of DIMENSIONS) {
    dimensions[dimension] = buildBuckets(eligibleTasks, dimension).map((bucket) => {
      return buildGroupForecast({
        bucket,
        projectId: normalizeText(input.projectId),
        asOfDate,
        forecastByTaskId,
        criticalTaskIds: input.criticalTaskIds,
        attributions: input.attributions,
        rowById,
        calendar: input.constructionCalendar,
        globalDegradationReasons,
      })
    })
  }

  const allGroups = DIMENSIONS.flatMap((dimension) => dimensions[dimension])
  return {
    projectId: normalizeText(input.projectId),
    asOfDate,
    dimensions,
    summary: {
      groupCount: allGroups.length,
      readyCount: allGroups.filter((group) => group.dataStatus === 'ready').length,
      degradedCount: allGroups.filter((group) => group.dataStatus === 'degraded').length,
      insufficientDataCount: allGroups.filter((group) => group.dataStatus === 'insufficient_data').length,
    },
  }
}
