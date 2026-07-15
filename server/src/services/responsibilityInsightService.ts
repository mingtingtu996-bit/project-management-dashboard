import { persistNotification } from './warningChainService.js'
import { getMembers, supabase } from './dbService.js'
import { query as rawQuery } from '../database.js'
import { getCriticalPathTaskIds } from './criticalPathHelpers.js'
import {
  resolveConstructionCalendarContext,
  type ConstructionCalendarContext,
} from './constructionCalendar.js'
import { logger } from '../middleware/logger.js'
import { RESPONSIBILITY_HEALTH_RULE_SEED } from '../seeds/responsibilityHealthRuleSeed.js'
import { isCompletedTask } from '../utils/taskStatus.js'
import { getDateOnly, isTaskDelayedAgainstPlan } from '../utils/taskPerformance.js'
import { signedDurationDayDelta } from '../utils/durationDays.js'
import type {
  ProjectMember,
  ResponsibilityAlertState,
  ResponsibilityWatchlist,
  Risk,
  Task,
  TaskObstacle,
} from '../types/db.js'

export type ResponsibilityDimension = 'person' | 'unit'
export type ResponsibilityStateLevel = 'healthy' | 'abnormal' | 'recovered'
export type ResponsibilityWatchStatus = 'active' | 'suggested_to_clear' | 'cleared' | null
const RESPONSIBILITY_DIRECT_SQL_ENABLED = process.env.NODE_ENV !== 'test' && process.env.VITEST !== 'true'
const responsibilityInsightInFlight = new Map<string, Promise<ResponsibilityInsightsResponse>>()

export const RESPONSIBILITY_HEALTH_RULES = {
  source: RESPONSIBILITY_HEALTH_RULE_SEED.source,
  ruleVersion: RESPONSIBILITY_HEALTH_RULE_SEED.ruleVersion,
  ...RESPONSIBILITY_HEALTH_RULE_SEED.thresholds,
  pressureWeights: RESPONSIBILITY_HEALTH_RULE_SEED.pressureWeights,
  explainOnlyPressureSignals: RESPONSIBILITY_HEALTH_RULE_SEED.explainOnlyPressureSignals,
  riskPressurePolicy: RESPONSIBILITY_HEALTH_RULE_SEED.riskPressurePolicy,
} as const

export const RESPONSIBILITY_INSIGHT_SCOPE = {
  model: 'execution_performance_insight',
  taskOwnershipBasis: 'tasks.execution_owner_fields',
  causalAttributionPolicy: 'excluded_use_progress_deviation_service',
  causalAttributionSource: 'progressDeviationService.responsibility_contribution',
} as const

const RESPONSIBILITY_QUALITY_BUCKET_KEYS = new Set(['unresolved_unit', 'unassigned_unit'])

export interface ResponsibilityTaskDetail {
  id: string
  title: string
  assignee: string
  assignee_user_id?: string | null
  unit: string
  participant_unit_id?: string | null
  completed: boolean
  status_label: string
  planned_end_date?: string | null
  actual_end_date?: string | null
  is_delayed: boolean
  is_critical_path: boolean
  is_milestone: boolean
}

export interface ResponsibilitySubjectInsightRow {
  key: string
  label: string
  dimension: ResponsibilityDimension
  insight_basis: typeof RESPONSIBILITY_INSIGHT_SCOPE.taskOwnershipBasis
  causal_attribution_policy: typeof RESPONSIBILITY_INSIGHT_SCOPE.causalAttributionPolicy
  causal_attribution_source: typeof RESPONSIBILITY_INSIGHT_SCOPE.causalAttributionSource
  subject_user_id?: string | null
  subject_unit_id?: string | null
  primary_unit_key?: string | null
  primary_unit_label?: string | null
  total_tasks: number
  completed_count: number
  on_time_count: number
  delayed_count: number
  active_delayed_count: number
  current_in_hand_count: number
  open_risk_count: number
  open_obstacle_count: number
  risk_pressure: number
  key_commitment_gap_count: number
  on_time_rate: number
  current_week_completed_count: number
  current_week_on_time_rate: number
  previous_week_completed_count: number
  previous_week_on_time_rate: number
  trend_delta: number
  trend_direction: 'up' | 'down' | 'flat'
  alert_reasons: string[]
  state_level: ResponsibilityStateLevel
  watch_status: ResponsibilityWatchStatus
  watch_id?: string | null
  alert_state_id?: string | null
  last_message_id?: string | null
  suggest_recovery_confirmation: boolean
  tasks: ResponsibilityTaskDetail[]
}

export interface ResponsibilityInsightsResponse {
  project_id: string
  generated_at: string
  analysis_scope: typeof RESPONSIBILITY_INSIGHT_SCOPE
  person_rows: ResponsibilitySubjectInsightRow[]
  unit_rows: ResponsibilitySubjectInsightRow[]
  watchlist: ResponsibilityWatchlist[]
}

export interface ResponsibilityTrendPoint {
  date: string
  completion_rate: number
  delay_rate: number
  completed_count: number
  delayed_count: number
  active_count: number
}

export interface ResponsibilityTrendSeries {
  key: string
  label: string
  dimension: ResponsibilityDimension
  subject_user_id?: string | null
  subject_unit_id?: string | null
  total_tasks: number
  latest_completion_rate: number
  latest_delay_rate: number
  points: ResponsibilityTrendPoint[]
}

export interface ResponsibilityTrendsResponse {
  project_id: string
  generated_at: string
  group_by: ResponsibilityDimension
  days: number
  dates: string[]
  series: ResponsibilityTrendSeries[]
}

type ResponsibilityInsightOptions = {
  syncAlertState?: boolean
}

export function resolveResponsibilityWatchStatus(input: {
  rowStateLevel: ResponsibilityStateLevel
  currentStatus: ResponsibilityWatchStatus
  previousAlertLevel?: ResponsibilityStateLevel | null
}) {
  const previousAlertLevel = input.previousAlertLevel ?? null
  const currentStatus = input.currentStatus

  if (!currentStatus) {
    return {
      watchStatus: null,
      suggestRecoveryConfirmation: false,
    }
  }

  let nextStatus = currentStatus
  if (input.rowStateLevel === 'abnormal') {
    const reenteredAbnormal = previousAlertLevel !== null && previousAlertLevel !== 'abnormal'
    if (currentStatus === 'suggested_to_clear' || (currentStatus === 'cleared' && reenteredAbnormal)) {
      nextStatus = 'active'
    }
  }

  if ((input.rowStateLevel === 'recovered' || input.rowStateLevel === 'healthy') && currentStatus === 'active') {
    nextStatus = 'suggested_to_clear'
  }

  return {
    watchStatus: nextStatus,
    suggestRecoveryConfirmation: nextStatus === 'suggested_to_clear',
  }
}

type ResponsibilityTaskRow = Task & {
  assignee_id?: string | null
  assignee_user_id?: string | null
  participant_unit_name?: string | null
}

type ResponsibilityObstacleRow = Pick<TaskObstacle, 'id' | 'task_id' | 'status'>
  & Partial<Pick<TaskObstacle, 'severity' | 'created_at' | 'severity_escalated_at'>>

type ResponsibilityRiskRow = Pick<Risk, 'id' | 'task_id' | 'status'>
  & Partial<Pick<Risk, 'level' | 'created_at' | 'updated_at'>>

type SubjectAccumulator = {
  key: string
  label: string
  dimension: ResponsibilityDimension
  subject_user_id?: string | null
  subject_unit_id?: string | null
  primary_unit_key?: string | null
  primary_unit_label?: string | null
  tasks: ResponsibilityTaskDetail[]
  unitTally: Map<string, { label: string; count: number; unitId?: string | null }>
  riskCount: number
  obstacleCount: number
}

function normalizeText(value?: string | null, fallback = '') {
  const text = String(value ?? '').trim()
  return text || fallback
}

function normalizeStatus(value?: string | null) {
  return String(value ?? '').trim().toLowerCase()
}

function normalizeDimensionLabel(dimension: ResponsibilityDimension) {
  return dimension === 'person' ? '责任人' : '责任单位'
}

function uniqueRecipients(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map((value) => String(value ?? '').trim()).filter(Boolean)))
}

function parseDate(value?: string | null) {
  if (!value) return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function dateOnly(value?: string | null) {
  return getDateOnly(value)
}

function getPlannedEndDate(task: ResponsibilityTaskRow) {
  return dateOnly(task.planned_end_date ?? task.end_date)
}

function getActualEndDate(task: ResponsibilityTaskRow) {
  return dateOnly(task.actual_end_date)
}

function isTaskDelayed(task: ResponsibilityTaskRow, calendar?: ConstructionCalendarContext | null) {
  return isTaskDelayedAgainstPlan({
    ...task,
    planned_end_date: getPlannedEndDate(task),
    actual_end_date: getActualEndDate(task),
  }, new Date(), calendar)
}

function getWeekStart(input = new Date()) {
  const value = new Date(input)
  value.setHours(0, 0, 0, 0)
  const day = value.getDay()
  const offset = day === 0 ? 6 : day - 1
  value.setDate(value.getDate() - offset)
  return value
}

function addDays(input: Date, days: number) {
  const next = new Date(input)
  next.setDate(next.getDate() + days)
  return next
}

function toDateKey(input: Date) {
  const year = input.getFullYear()
  const month = String(input.getMonth() + 1).padStart(2, '0')
  const day = String(input.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function isTaskCompletedByDate(task: ResponsibilityTaskDetail, dateKey: string) {
  if (!task.completed) return false
  const actualDate = dateOnly(task.actual_end_date)
  if (!actualDate) return false
  return actualDate <= dateKey
}

function buildResponsibilityTrendPoints(tasks: ResponsibilityTaskDetail[], days: number) {
  const safeDays = Math.min(Math.max(Math.trunc(days), 7), 90)
  const endDate = new Date()
  endDate.setHours(0, 0, 0, 0)
  const startDate = addDays(endDate, -(safeDays - 1))

  const points: ResponsibilityTrendPoint[] = []
  for (let index = 0; index < safeDays; index += 1) {
    const day = addDays(startDate, index)
    const dateKey = toDateKey(day)
    let completedCount = 0
    let delayedCount = 0

    for (const task of tasks) {
      const plannedDate = dateOnly(task.planned_end_date)
      const completedByDate = isTaskCompletedByDate(task, dateKey)
      if (completedByDate) {
        // eslint-disable-next-line -- summary-service-aggregation-approved; ssot: service-owned-summary
        completedCount += 1
      }
      if (plannedDate && plannedDate <= dateKey && !completedByDate) {
        // eslint-disable-next-line -- summary-service-aggregation-approved; ssot: service-owned-summary
        delayedCount += 1
      }
    }

    const totalTasks = tasks.length
    points.push({
      date: dateKey,
      completion_rate: totalTasks > 0 ? Math.round((completedCount / totalTasks) * 100) : 0,
      delay_rate: totalTasks > 0 ? Math.round((delayedCount / totalTasks) * 100) : 0,
      completed_count: completedCount,
      delayed_count: delayedCount,
      active_count: Math.max(totalTasks - completedCount, 0),
    })
  }

  return points
}

function inDateRange(value: string | null | undefined, start: Date, end: Date) {
  if (!value) return false
  const parsed = parseDate(value)
  if (!parsed) return false
  return parsed.getTime() >= start.getTime() && parsed.getTime() < end.getTime()
}

function statusLabel(task: ResponsibilityTaskRow, delayed: boolean) {
  if (isCompletedTask(task)) {
    return delayed ? '延期完成' : '按时完成'
  }
  return delayed ? '进行中（逾期）' : normalizeText(task.status, '进行中')
}

function buildTaskDetail(
  task: ResponsibilityTaskRow,
  criticalTaskIds: Set<string>,
  unitNameMap: Map<string, string>,
  calendar?: ConstructionCalendarContext | null,
) {
  const delayed = isTaskDelayed(task, calendar)
  const unitId = normalizeText(task.participant_unit_id, '')
  const unitLabel = unitId
    ? normalizeText(unitNameMap.get(unitId) ?? task.participant_unit_name, '责任单位待确认')
    : '未分配责任单位'
  return {
    id: String(task.id),
    title: normalizeText(task.title, '未命名任务'),
    assignee: normalizeText(task.assignee_name ?? task.assignee, '未分配责任人'),
    assignee_user_id: task.assignee_user_id ?? task.assignee_id ?? null,
    unit: unitLabel,
    participant_unit_id: task.participant_unit_id ?? null,
    completed: isCompletedTask(task),
    status_label: statusLabel(task, delayed),
    planned_end_date: getPlannedEndDate(task),
    actual_end_date: getActualEndDate(task),
    is_delayed: delayed,
    is_critical_path: criticalTaskIds.has(task.id),
    is_milestone: Boolean(task.is_milestone),
  } satisfies ResponsibilityTaskDetail
}

function buildMemberLabel(member?: ProjectMember | null) {
  return normalizeText(member?.display_name ?? member?.user_id, '')
}

async function loadProjectMembers(projectId: string) {
  const members = await getMembers(projectId)
  const memberMap = new Map<string, ProjectMember>()
  for (const member of members) {
    if (member.user_id) {
      memberMap.set(String(member.user_id), member)
    }
  }
  return memberMap
}

async function loadParticipantUnitNameMap(projectId: string) {
  if (RESPONSIBILITY_DIRECT_SQL_ENABLED) {
    const result = await rawQuery(
      `SELECT id, unit_name
       FROM participant_units
       WHERE project_id = $1
       ORDER BY unit_name ASC`,
      [projectId],
    )
    const rows = (result.rows ?? []) as Array<{ id: string; unit_name: string | null }>

    return new Map(
      rows
        .map((row) => [String(row.id), normalizeText(row.unit_name)] as const)
        .filter((row) => row[1].length > 0),
    )
  }

  const { data, error } = await supabase
    .from('participant_units')
    .select('id, unit_name')
    .eq('project_id', projectId)
    .order('unit_name', { ascending: true })

  if (error) throw new Error(error.message)

  return new Map(
    ((data ?? []) as Array<{ id: string; unit_name: string | null }>)
      .map((row) => [String(row.id), normalizeText(row.unit_name)] as const)
      .filter((row) => row[1].length > 0),
  )
}

async function loadTasks(projectId: string) {
  if (RESPONSIBILITY_DIRECT_SQL_ENABLED) {
    const result = await rawQuery(
      `SELECT *
       FROM tasks
       WHERE project_id = $1`,
      [projectId],
    )
    return (result.rows ?? []) as ResponsibilityTaskRow[]
  }

  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .eq('project_id', projectId)

  if (error) throw new Error(error.message)
  return (data ?? []) as ResponsibilityTaskRow[]
}

async function loadRisks(projectId: string) {
  if (RESPONSIBILITY_DIRECT_SQL_ENABLED) {
    const result = await rawQuery(
      `SELECT id, task_id, status, project_id, level, created_at, updated_at
       FROM risks
       WHERE project_id = $1`,
      [projectId],
    )
    return (result.rows ?? []) as ResponsibilityRiskRow[]
  }

  const { data, error } = await supabase
    .from('risks')
    .select('id, task_id, status, project_id, level, created_at, updated_at')
    .eq('project_id', projectId)

  if (error) throw new Error(error.message)
  return (data ?? []) as ResponsibilityRiskRow[]
}

async function loadObstacles(projectId: string) {
  if (RESPONSIBILITY_DIRECT_SQL_ENABLED) {
    const result = await rawQuery(
      `SELECT o.id, o.task_id, o.status, o.severity, o.created_at, o.severity_escalated_at
       FROM task_obstacles o
       INNER JOIN tasks t ON t.id = o.task_id
       WHERE t.project_id = $1`,
      [projectId],
    )
    return (result.rows ?? []) as ResponsibilityObstacleRow[]
  }

  const { data, error } = await supabase
    .from('task_obstacles')
    .select('id, task_id, status, severity, created_at, severity_escalated_at, tasks!inner(project_id)')
    .eq('tasks.project_id', projectId)

  if (error) throw new Error(error.message)
  return (data ?? []) as unknown as ResponsibilityObstacleRow[]
}

async function loadWatchlist(projectId: string) {
  if (RESPONSIBILITY_DIRECT_SQL_ENABLED) {
    const result = await rawQuery(
      `SELECT *
       FROM responsibility_watchlist
       WHERE project_id = $1
       ORDER BY updated_at DESC`,
      [projectId],
    )
    return (result.rows ?? []) as ResponsibilityWatchlist[]
  }

  const { data, error } = await supabase
    .from('responsibility_watchlist')
    .select('*')
    .eq('project_id', projectId)
    .order('updated_at', { ascending: false })

  if (error) throw new Error(error.message)
  return (data ?? []) as ResponsibilityWatchlist[]
}

async function loadAlertStates(projectId: string) {
  if (RESPONSIBILITY_DIRECT_SQL_ENABLED) {
    const result = await rawQuery(
      `SELECT *
       FROM responsibility_alert_states
       WHERE project_id = $1`,
      [projectId],
    )
    return (result.rows ?? []) as ResponsibilityAlertState[]
  }

  const { data, error } = await supabase
    .from('responsibility_alert_states')
    .select('*')
    .eq('project_id', projectId)

  if (error) throw new Error(error.message)
  return (data ?? []) as ResponsibilityAlertState[]
}

function buildSubjectKey(dimension: ResponsibilityDimension, task: ResponsibilityTaskRow, memberMap: Map<string, ProjectMember>, unitNameMap: Map<string, string>) {
  if (dimension === 'person') {
    const subjectUserId = normalizeText(task.assignee_user_id ?? task.assignee_id, '')
    const memberLabel = subjectUserId ? buildMemberLabel(memberMap.get(subjectUserId)) : ''
    const label = normalizeText(task.assignee_name ?? task.assignee ?? memberLabel, '未分配责任人')
    return {
      key: subjectUserId ? `user:${subjectUserId}` : `name:${label}`,
      label,
      subject_user_id: subjectUserId || null,
      subject_unit_id: null,
    }
  }

  const unitId = normalizeText(task.participant_unit_id, '')
  const unitLabel = unitId
    ? normalizeText(unitNameMap.get(unitId) ?? task.participant_unit_name, '责任单位待确认')
    : '未分配责任单位'
  return {
    key: unitId ? `unit:${unitId}` : 'unassigned_unit',
    label: unitLabel,
    subject_user_id: null,
    subject_unit_id: unitId || null,
  }
}

function getTaskUnitInfo(task: ResponsibilityTaskRow, unitNameMap: Map<string, string>) {
  const unitId = normalizeText(task.participant_unit_id, '')
  const unitLabel = unitId
    ? normalizeText(unitNameMap.get(unitId) ?? task.participant_unit_name, '责任单位待确认')
    : '未分配责任单位'
  return {
    key: unitId ? `unit:${unitId}` : 'unassigned_unit',
    label: unitLabel,
    unitId: unitId || null,
  }
}

type TaskPressureSignal = {
  count: number
  severityWeights: string[]
  oldestSeenAt?: string | null
}

function addPressureSignal(map: Map<string, TaskPressureSignal>, taskId: string, severity?: string | null, seenAt?: string | null) {
  const current = map.get(taskId) ?? { count: 0, severityWeights: [], oldestSeenAt: null }
  current.count += 1
  current.severityWeights.push(normalizeStatus(severity) || 'medium')
  const normalizedSeenAt = normalizeText(seenAt, '')
  if (normalizedSeenAt && (!current.oldestSeenAt || new Date(normalizedSeenAt).getTime() < new Date(current.oldestSeenAt).getTime())) {
    current.oldestSeenAt = normalizedSeenAt
  }
  map.set(taskId, current)
}

function buildRiskTaskMap(risks: ResponsibilityRiskRow[]) {
  const map = new Map<string, TaskPressureSignal>()
  for (const risk of risks) {
    const taskId = normalizeText(risk.task_id, '')
    if (!taskId) continue
    const status = normalizeStatus(risk.status)
    if (status === 'closed' || status === 'resolved') continue
    addPressureSignal(map, taskId, risk.level, risk.created_at ?? risk.updated_at ?? null)
  }
  return map
}

function buildObstacleTaskMap(obstacles: ResponsibilityObstacleRow[]) {
  const map = new Map<string, TaskPressureSignal>()
  for (const obstacle of obstacles) {
    const taskId = normalizeText(obstacle.task_id, '')
    if (!taskId) continue
    const resolved = normalizeStatus(obstacle.status) === 'resolved'
      || normalizeStatus(obstacle.status) === '已解决'
    if (resolved) continue
    addPressureSignal(map, taskId, obstacle.severity, obstacle.severity_escalated_at ?? obstacle.created_at ?? null)
  }
  return map
}

function severityWeight(value: string, weights: Record<string, number>) {
  return weights[normalizeStatus(value)] ?? weights.medium ?? 1
}

function oldestDate(values: Array<string | null | undefined>) {
  const timestamps = values
    .map((value) => {
      const normalized = normalizeText(value, '')
      if (!normalized) return null
      const timestamp = new Date(normalized).getTime()
      return Number.isFinite(timestamp) ? { value: normalized, timestamp } : null
    })
    .filter((item): item is { value: string; timestamp: number } => Boolean(item))
    .sort((left, right) => left.timestamp - right.timestamp)
  return timestamps[0]?.value ?? null
}

function daysSince(value?: string | null, now = new Date()) {
  if (!value) return 0
  return Math.max(0, signedDurationDayDelta(value, now) ?? 0)
}

export function calculateResponsibilityRiskPressure(input: {
  openRiskCount: number
  openObstacleCount: number
  riskSeverityWeights?: string[]
  obstacleSeverityWeights?: string[]
  criticalPathPressureCount?: number
  milestonePressureCount?: number
  longestOpenDays?: number
}) {
  const weights = RESPONSIBILITY_HEALTH_RULES.pressureWeights
  // eslint-disable-next-line -- summary-service-aggregation-approved; ssot: service-owned-summary
  const riskScore = (input.riskSeverityWeights ?? []).reduce(
    (sum, severity) => sum + severityWeight(severity, weights.riskSeverity),
    0,
  )
  // eslint-disable-next-line -- summary-service-aggregation-approved; ssot: service-owned-summary
  const obstacleScore = (input.obstacleSeverityWeights ?? []).reduce(
    (sum, severity) => sum + severityWeight(severity, weights.obstacleSeverity),
    0,
  )
  const fallbackRiskScore = input.riskSeverityWeights?.length ? 0 : input.openRiskCount * weights.riskSeverity.medium
  const fallbackObstacleScore = input.obstacleSeverityWeights?.length ? 0 : input.openObstacleCount * weights.obstacleSeverity.medium
  const criticalPathBonus = (input.criticalPathPressureCount ?? 0) * weights.criticalPathImpact
  const milestoneBonus = (input.milestonePressureCount ?? 0) * weights.milestoneImpact
  const longOpenBonus = input.longestOpenDays && input.longestOpenDays >= weights.longOpenDaysThreshold
    ? weights.longOpenDaysBonus
    : 0
  const veryLongOpenBonus = input.longestOpenDays && input.longestOpenDays >= weights.veryLongOpenDaysThreshold
    ? weights.veryLongOpenDaysBonus
    : 0

  return Math.round((
    riskScore
    + obstacleScore
    + fallbackRiskScore
    + fallbackObstacleScore
    + criticalPathBonus
    + milestoneBonus
    + longOpenBonus
    + veryLongOpenBonus
  ) * 10) / 10
}

function calculateWeeklyRate(tasks: ResponsibilityTaskDetail[], start: Date, end: Date) {
  const completedInWeek = tasks.filter((task) => task.completed && inDateRange(task.actual_end_date, start, end))
  const total = completedInWeek.length
  const onTime = completedInWeek.filter((task) => !task.is_delayed).length
  return {
    total,
    rate: total > 0 ? Math.round((onTime / total) * 100) : 0,
  }
}

function finalizeRows(
  accumulators: SubjectAccumulator[],
  riskByTaskId: Map<string, TaskPressureSignal>,
  obstacleByTaskId: Map<string, TaskPressureSignal>,
) {
  const currentWeekStart = getWeekStart()
  const nextWeekStart = addDays(currentWeekStart, 7)
  const previousWeekStart = addDays(currentWeekStart, -7)

  const rows = accumulators.map((accumulator) => {
    let openRiskCount = 0
    let openObstacleCount = 0
    const riskSeverityWeights: string[] = []
    const obstacleSeverityWeights: string[] = []
    const openDates: Array<string | null | undefined> = []
    let criticalPathPressureCount = 0
    let milestonePressureCount = 0
    for (const task of accumulator.tasks) {
      const riskSignal = riskByTaskId.get(task.id)
      const obstacleSignal = obstacleByTaskId.get(task.id)
      const pressureCount = (riskSignal?.count ?? 0) + (obstacleSignal?.count ?? 0)
      openRiskCount += riskSignal?.count ?? 0
      openObstacleCount += obstacleSignal?.count ?? 0
      riskSeverityWeights.push(...(riskSignal?.severityWeights ?? []))
      obstacleSeverityWeights.push(...(obstacleSignal?.severityWeights ?? []))
      openDates.push(riskSignal?.oldestSeenAt, obstacleSignal?.oldestSeenAt)
      if (pressureCount > 0 && task.is_critical_path) criticalPathPressureCount += pressureCount
      if (pressureCount > 0 && task.is_milestone) milestonePressureCount += pressureCount
    }

    // eslint-disable-next-line -- summary-service-aggregation-approved; ssot: service-owned-summary
    const completedCount = accumulator.tasks.filter((task) => task.completed).length
    const onTimeCount = accumulator.tasks.filter((task) => task.completed && !task.is_delayed).length
    // eslint-disable-next-line -- summary-service-aggregation-approved; ssot: service-owned-summary
    const delayedCount = accumulator.tasks.filter((task) => task.is_delayed).length
    // eslint-disable-next-line -- summary-service-aggregation-approved; ssot: service-owned-summary
    const activeDelayedCount = accumulator.tasks.filter((task) => !task.completed && task.is_delayed).length
    const currentInHandCount = accumulator.tasks.filter((task) => !task.completed).length
    const keyCommitmentGapCount = accumulator.tasks.filter(
      (task) => !task.completed && task.is_delayed && (task.is_critical_path || task.is_milestone),
    ).length
    const currentWeek = calculateWeeklyRate(accumulator.tasks, currentWeekStart, nextWeekStart)
    const previousWeek = calculateWeeklyRate(accumulator.tasks, previousWeekStart, currentWeekStart)
    const trendDelta = currentWeek.rate - previousWeek.rate
    const primaryUnit = Array.from(accumulator.unitTally.values()).sort((left, right) => right.count - left.count)[0]
    const riskPressure = calculateResponsibilityRiskPressure({
      openRiskCount,
      openObstacleCount,
      riskSeverityWeights,
      obstacleSeverityWeights,
      criticalPathPressureCount,
      milestonePressureCount,
      longestOpenDays: daysSince(oldestDate(openDates)),
    })

    return {
      key: accumulator.key,
      label: accumulator.label,
      dimension: accumulator.dimension,
      insight_basis: RESPONSIBILITY_INSIGHT_SCOPE.taskOwnershipBasis,
      causal_attribution_policy: RESPONSIBILITY_INSIGHT_SCOPE.causalAttributionPolicy,
      causal_attribution_source: RESPONSIBILITY_INSIGHT_SCOPE.causalAttributionSource,
      subject_user_id: accumulator.subject_user_id ?? null,
      subject_unit_id: accumulator.subject_unit_id ?? null,
      primary_unit_key: primaryUnit?.label ? `unit:${primaryUnit.unitId ?? primaryUnit.label}` : null,
      primary_unit_label: primaryUnit?.label ?? null,
      total_tasks: accumulator.tasks.length,
      completed_count: completedCount,
      on_time_count: onTimeCount,
      delayed_count: delayedCount,
      active_delayed_count: activeDelayedCount,
      current_in_hand_count: currentInHandCount,
      open_risk_count: openRiskCount,
      open_obstacle_count: openObstacleCount,
      risk_pressure: riskPressure,
      key_commitment_gap_count: keyCommitmentGapCount,
      on_time_rate: completedCount > 0 ? Math.round((onTimeCount / completedCount) * 100) : 0,
      current_week_completed_count: currentWeek.total,
      current_week_on_time_rate: currentWeek.rate,
      previous_week_completed_count: previousWeek.total,
      previous_week_on_time_rate: previousWeek.rate,
      trend_delta: trendDelta,
      trend_direction: trendDelta > 0 ? 'up' : trendDelta < 0 ? 'down' : 'flat',
      alert_reasons: [],
      state_level: 'healthy' as ResponsibilityStateLevel,
      watch_status: null,
      watch_id: null,
      alert_state_id: null,
      last_message_id: null,
      suggest_recovery_confirmation: false,
      tasks: accumulator.tasks.sort((left, right) => {
        if (left.completed !== right.completed) return left.completed ? -1 : 1
        if (left.is_delayed !== right.is_delayed) return left.is_delayed ? -1 : 1
        return left.title.localeCompare(right.title, 'zh-Hans-CN')
      }),
    } satisfies ResponsibilitySubjectInsightRow
  })

  return rows.sort((left, right) => {
    if (right.risk_pressure !== left.risk_pressure) return right.risk_pressure - left.risk_pressure
    if (right.active_delayed_count !== left.active_delayed_count) return right.active_delayed_count - left.active_delayed_count
    if (right.total_tasks !== left.total_tasks) return right.total_tasks - left.total_tasks
    return left.label.localeCompare(right.label, 'zh-Hans-CN')
  })
}

async function buildRowsForDimension(
  projectId: string,
  dimension: ResponsibilityDimension,
  tasks: ResponsibilityTaskRow[],
  memberMap: Map<string, ProjectMember>,
  unitNameMap: Map<string, string>,
  risks: ResponsibilityRiskRow[],
  obstacles: ResponsibilityObstacleRow[],
  criticalTaskIds?: Set<string>,
  calendar?: ConstructionCalendarContext | null,
) {
  const accumulators = new Map<string, SubjectAccumulator>()
  const riskByTaskId = buildRiskTaskMap(risks)
  const obstacleByTaskId = buildObstacleTaskMap(obstacles)
  const resolvedCriticalTaskIds = criticalTaskIds ?? await getCriticalPathTaskIds(projectId)

  for (const task of tasks) {
    const subject = buildSubjectKey(dimension, task, memberMap, unitNameMap)
    const detail = buildTaskDetail(task, resolvedCriticalTaskIds, unitNameMap, calendar)
    const unitInfo = getTaskUnitInfo(task, unitNameMap)
    const existing = accumulators.get(subject.key) ?? {
      key: subject.key,
      label: subject.label,
      dimension,
      subject_user_id: subject.subject_user_id,
      subject_unit_id: subject.subject_unit_id,
      primary_unit_key: null,
      primary_unit_label: null,
      tasks: [],
      unitTally: new Map(),
      riskCount: 0,
      obstacleCount: 0,
    }

    existing.tasks.push(detail)
    if (dimension === 'person') {
      const current = existing.unitTally.get(unitInfo.key) ?? { label: unitInfo.label, count: 0, unitId: unitInfo.unitId }
      current.count += 1
      existing.unitTally.set(unitInfo.key, current)
    }
    accumulators.set(subject.key, existing)
  }

  return finalizeRows(Array.from(accumulators.values()), riskByTaskId, obstacleByTaskId)
}

export function isResponsibilityQualityBucket(row: Pick<ResponsibilitySubjectInsightRow, 'key' | 'dimension' | 'subject_unit_id'>) {
  return row.dimension === 'unit'
    && (!row.subject_unit_id || RESPONSIBILITY_QUALITY_BUCKET_KEYS.has(row.key))
}

export function buildAlertReasons(row: ResponsibilitySubjectInsightRow, lowOnTimeStreak: number) {
  if (isResponsibilityQualityBucket(row)) return []

  const reasons: string[] = []
  if (lowOnTimeStreak >= RESPONSIBILITY_HEALTH_RULES.lowOnTimeStreakThreshold) {
    reasons.push(`按时完成率连续 ${lowOnTimeStreak} 个统计周期低于 ${RESPONSIBILITY_HEALTH_RULES.lowOnTimeRateThreshold}%`)
  }
  if (row.active_delayed_count >= RESPONSIBILITY_HEALTH_RULES.activeDelayedTaskThreshold) {
    reasons.push(`当前延期任务 ${row.active_delayed_count} 项`)
  }
  if (row.key_commitment_gap_count >= RESPONSIBILITY_HEALTH_RULES.keyCommitmentGapThreshold) {
    reasons.push(`重点承诺缺口 ${row.key_commitment_gap_count} 项`)
  }
  return reasons
}

export function shouldBroadcastResponsibilityAlert(row: Pick<ResponsibilitySubjectInsightRow, 'active_delayed_count' | 'current_week_on_time_rate'>) {
  return row.active_delayed_count >= RESPONSIBILITY_HEALTH_RULES.criticalActiveDelayedTaskThreshold
    || row.current_week_on_time_rate < RESPONSIBILITY_HEALTH_RULES.criticalCurrentWeekOnTimeRateThreshold
}

function buildResponsibilityNotificationKey(row: ResponsibilitySubjectInsightRow) {
  return `${row.dimension}:${row.key}`
}

async function resolveResponsibilityNotificationState(projectId: string, row: ResponsibilitySubjectInsightRow, ownerRecipients: string[]) {
  const subjectNotificationKey = buildResponsibilityNotificationKey(row)
  if (row.state_level === 'abnormal') {
    const severity = shouldBroadcastResponsibilityAlert(row) ? 'critical' : 'warning'
    const notification = await persistNotification({
      project_id: projectId,
      type: 'responsibility_subject_alert',
      notification_type: 'business-warning',
      severity,
      title: `${normalizeDimensionLabel(row.dimension)}异常预警`,
      content: `${normalizeDimensionLabel(row.dimension)}“${row.label}”当前存在异常：${row.alert_reasons.join('；')}。`,
      is_read: false,
      is_broadcast: severity === 'critical',
      source_entity_type: 'responsibility_subject',
      source_entity_id: subjectNotificationKey,
      category: 'responsibility',
      recipients: ownerRecipients,
      created_at: new Date().toISOString(),
    })
    return notification?.id ?? null
  }

  try {
    await rawQuery(
      `UPDATE public.notifications
       SET status = 'resolved', resolved_at = NOW(), updated_at = NOW()
       WHERE project_id = $1
         AND source_entity_type = 'responsibility_subject'
         AND source_entity_id = $2
         AND status IS DISTINCT FROM 'resolved'`,
      [projectId, subjectNotificationKey],
    )
  } catch (error) {
    logger.warn('[responsibilityInsightService] resolve responsibility notification failed', {
      projectId,
      subjectNotificationKey,
      error: error instanceof Error ? error.message : String(error),
    })
  }

  return null
}

async function upsertAlertState(
  projectId: string,
  row: ResponsibilitySubjectInsightRow,
  previous: ResponsibilityAlertState | undefined,
  lowOnTimeStreak: number,
  ownerRecipients: string[],
) {
  const alertReasons = buildAlertReasons(row, lowOnTimeStreak)
  const abnormal = alertReasons.length > 0
  const healthyPeriods = abnormal ? 0 : ((previous?.current_level === 'abnormal' || previous?.current_level === 'recovered')
    ? (previous?.consecutive_healthy_periods ?? 0) + 1
    : 0)
  const nextLevel: ResponsibilityStateLevel = abnormal
    ? 'abnormal'
    : healthyPeriods > 0 && previous?.current_level === 'abnormal'
      ? 'recovered'
      : 'healthy'

  const notificationId = await resolveResponsibilityNotificationState(projectId, {
    ...row,
    alert_reasons: alertReasons,
    state_level: nextLevel,
  }, ownerRecipients)

  const lastMetrics = {
    on_time_rate: row.on_time_rate,
    current_week_on_time_rate: row.current_week_on_time_rate,
    active_delayed_count: row.active_delayed_count,
    key_commitment_gap_count: row.key_commitment_gap_count,
    risk_pressure: row.risk_pressure,
    alert_reasons: alertReasons,
  }
  const result = await rawQuery(
    `INSERT INTO public.responsibility_alert_states (
       project_id,
       dimension,
       subject_key,
       subject_label,
       subject_user_id,
       subject_unit_id,
       alert_type,
       current_level,
       consecutive_unhealthy_periods,
       consecutive_healthy_periods,
       last_snapshot_week,
       last_message_id,
       last_metrics,
       updated_at
     ) VALUES ($1, $2, $3, $4, $5, $6, 'responsibility_health', $7, $8, $9, $10::date, $11, $12::jsonb, NOW())
     ON CONFLICT (project_id, dimension, subject_key, alert_type)
     DO UPDATE SET
       subject_label = EXCLUDED.subject_label,
       subject_user_id = EXCLUDED.subject_user_id,
       subject_unit_id = EXCLUDED.subject_unit_id,
       current_level = EXCLUDED.current_level,
       consecutive_unhealthy_periods = EXCLUDED.consecutive_unhealthy_periods,
       consecutive_healthy_periods = EXCLUDED.consecutive_healthy_periods,
       last_snapshot_week = EXCLUDED.last_snapshot_week,
       last_message_id = EXCLUDED.last_message_id,
       last_metrics = EXCLUDED.last_metrics,
       updated_at = NOW()
     RETURNING *`,
    [
      projectId,
      row.dimension,
      row.key,
      row.label,
      row.subject_user_id ?? null,
      row.subject_unit_id ?? null,
      nextLevel,
      lowOnTimeStreak,
      healthyPeriods,
      getWeekStart().toISOString().slice(0, 10),
      notificationId ?? previous?.last_message_id ?? null,
      JSON.stringify(lastMetrics),
    ],
  )
  const alertState = result.rows?.[0] as ResponsibilityAlertState | undefined
  if (!alertState) {
    throw new Error(`Failed to persist responsibility alert state for ${projectId}:${row.dimension}:${row.key}`)
  }

  return {
    alertState,
    alertReasons,
    stateLevel: nextLevel,
  }
}

async function updateWatchlistState(
  row: ResponsibilitySubjectInsightRow,
  watch: ResponsibilityWatchlist | undefined,
  previousAlertLevel?: ResponsibilityStateLevel | null,
) {
  if (!watch) {
    return {
      watchStatus: null,
      watchId: null,
      suggestRecoveryConfirmation: false,
    }
  }

  const resolved = resolveResponsibilityWatchStatus({
    rowStateLevel: row.state_level,
    currentStatus: watch.status,
    previousAlertLevel,
  })
  const nextStatus = resolved.watchStatus

  if (nextStatus !== watch.status) {
    await rawQuery(
      `UPDATE public.responsibility_watchlist
       SET status = $1, updated_at = NOW()
       WHERE id = $2
         AND project_id = $3`,
      [nextStatus, watch.id, watch.project_id],
    )
  }

  return {
    watchStatus: nextStatus,
    watchId: watch.id,
    suggestRecoveryConfirmation: resolved.suggestRecoveryConfirmation,
  }
}

async function hydrateDimensionRows(
  projectId: string,
  rows: ResponsibilitySubjectInsightRow[],
  watchlist: ResponsibilityWatchlist[],
  alertStates: ResponsibilityAlertState[],
  ownerRecipients: string[],
  options: ResponsibilityInsightOptions = {},
) {
  const syncAlertState = options.syncAlertState !== false
  const watchMap = new Map<string, ResponsibilityWatchlist>(
    watchlist.map((item) => [`${item.dimension}:${item.subject_key}`, item] as const),
  )
  const alertMap = new Map<string, ResponsibilityAlertState>(
    alertStates.map((item) => [`${item.dimension}:${item.subject_key}`, item] as const),
  )

  const hydrated: ResponsibilitySubjectInsightRow[] = []
  for (const row of rows) {
    const mapKey = `${row.dimension}:${row.key}`
    const previousAlert = alertMap.get(mapKey)
    const lowOnTimeStreak = row.current_week_completed_count > 0 && row.current_week_on_time_rate < 60
      ? (previousAlert?.current_level === 'abnormal' ? (previousAlert.consecutive_unhealthy_periods ?? 0) + 1 : 1)
      : 0
    const watch = watchMap.get(mapKey)

    if (!syncAlertState) {
      const alertReasons = buildAlertReasons(row, lowOnTimeStreak)
      const abnormal = alertReasons.length > 0
      const healthyPeriods = abnormal ? 0 : ((previousAlert?.current_level === 'abnormal' || previousAlert?.current_level === 'recovered')
        ? (previousAlert?.consecutive_healthy_periods ?? 0) + 1
        : 0)
      const stateLevel: ResponsibilityStateLevel = abnormal
        ? 'abnormal'
        : healthyPeriods > 0 && previousAlert?.current_level === 'abnormal'
          ? 'recovered'
          : 'healthy'
      const watchState = resolveResponsibilityWatchStatus({
        rowStateLevel: stateLevel,
        currentStatus: watch?.status ?? null,
        previousAlertLevel: previousAlert?.current_level ?? null,
      })

      hydrated.push({
        ...row,
        alert_reasons: alertReasons,
        state_level: stateLevel,
        watch_status: watchState.watchStatus,
        watch_id: watch?.id ?? null,
        alert_state_id: previousAlert?.id ?? null,
        last_message_id: previousAlert?.last_message_id ?? null,
        suggest_recovery_confirmation: watchState.suggestRecoveryConfirmation,
      })
      continue
    }

    const alertState = await upsertAlertState(projectId, row, previousAlert, lowOnTimeStreak, ownerRecipients)
    const watchState = await updateWatchlistState({
      ...row,
      alert_reasons: alertState.alertReasons,
      state_level: alertState.stateLevel,
    }, watch, previousAlert?.current_level ?? null)

    hydrated.push({
      ...row,
      alert_reasons: alertState.alertReasons,
      state_level: alertState.stateLevel,
      watch_status: watchState.watchStatus,
      watch_id: watchState.watchId,
      alert_state_id: alertState.alertState.id,
      last_message_id: alertState.alertState.last_message_id ?? null,
      suggest_recovery_confirmation: watchState.suggestRecoveryConfirmation,
    })
  }

  return hydrated.sort((left, right) => {
    const severityScore = (value: ResponsibilityStateLevel) => {
      if (value === 'abnormal') return 3
      if (value === 'recovered') return 2
      return 1
    }
    const scoreDiff = severityScore(right.state_level) - severityScore(left.state_level)
    if (scoreDiff !== 0) return scoreDiff
    if (right.risk_pressure !== left.risk_pressure) return right.risk_pressure - left.risk_pressure
    return left.label.localeCompare(right.label, 'zh-Hans-CN')
  })
}

export class ResponsibilityInsightService {
  async getProjectInsights(projectId: string, options: ResponsibilityInsightOptions = {}): Promise<ResponsibilityInsightsResponse> {
    const normalizedProjectId = String(projectId ?? '').trim()
    const syncAlertState = options.syncAlertState !== false
    const cacheKey = `${normalizedProjectId}:${syncAlertState ? 'sync' : 'readonly'}`
    const inFlight = responsibilityInsightInFlight.get(cacheKey)
    if (inFlight) return inFlight

    const promise = this.computeProjectInsights(normalizedProjectId, { syncAlertState })
      .finally(() => {
        responsibilityInsightInFlight.delete(cacheKey)
      })

    responsibilityInsightInFlight.set(cacheKey, promise)
    return promise
  }

  private async computeProjectInsights(projectId: string, options: ResponsibilityInsightOptions = {}): Promise<ResponsibilityInsightsResponse> {
    const [memberMap, unitNameMap, tasks, risks, obstacles, watchlist, alertStates, criticalTaskIds, calendar] = await Promise.all([
      loadProjectMembers(projectId),
      loadParticipantUnitNameMap(projectId),
      loadTasks(projectId),
      loadRisks(projectId),
      loadObstacles(projectId),
      loadWatchlist(projectId),
      loadAlertStates(projectId),
      getCriticalPathTaskIds(projectId),
      resolveConstructionCalendarContext({
        projectId,
        onError: (error) => logger.warn('[responsibilityInsightService] construction calendar unavailable for delay status', {
          projectId,
          error: error instanceof Error ? error.message : String(error),
        }),
      }),
    ])
    const ownerRecipients = uniqueRecipients(
      Array.from(memberMap.values())
        .filter((member) => member.permission_level === 'owner')
        .map((member) => member.user_id),
    )

    const [personRowsBase, unitRowsBase] = await Promise.all([
      buildRowsForDimension(projectId, 'person', tasks, memberMap, unitNameMap, risks, obstacles, criticalTaskIds, calendar),
      buildRowsForDimension(projectId, 'unit', tasks, memberMap, unitNameMap, risks, obstacles, criticalTaskIds, calendar),
    ])

    const [personRows, unitRows] = await Promise.all([
      hydrateDimensionRows(projectId, personRowsBase, watchlist, alertStates, ownerRecipients, options),
      hydrateDimensionRows(projectId, unitRowsBase, watchlist, alertStates, ownerRecipients, options),
    ])

    const latestWatchlist = options.syncAlertState === false ? watchlist : await loadWatchlist(projectId)

    return {
      project_id: projectId,
      generated_at: new Date().toISOString(),
      analysis_scope: RESPONSIBILITY_INSIGHT_SCOPE,
      person_rows: personRows,
      unit_rows: unitRows,
      watchlist: latestWatchlist,
    }
  }

  async getProjectTrends(
    projectId: string,
    days = 30,
    groupBy: ResponsibilityDimension = 'person',
  ): Promise<ResponsibilityTrendsResponse> {
    const insights = await this.getProjectInsights(projectId, { syncAlertState: false })
    const sourceRows = groupBy === 'unit' ? insights.unit_rows : insights.person_rows
    const safeDays = Math.min(Math.max(Math.trunc(days), 7), 90)
    const series = sourceRows.slice(0, 6).map<ResponsibilityTrendSeries>((row) => {
      const points = buildResponsibilityTrendPoints(row.tasks, safeDays)
      const lastPoint = points[points.length - 1] ?? null
      return {
        key: row.key,
        label: row.label,
        dimension: row.dimension,
        subject_user_id: row.subject_user_id ?? null,
        subject_unit_id: row.subject_unit_id ?? null,
        total_tasks: row.total_tasks,
        latest_completion_rate: lastPoint?.completion_rate ?? 0,
        latest_delay_rate: lastPoint?.delay_rate ?? 0,
        points,
      }
    })

    return {
      project_id: projectId,
      generated_at: new Date().toISOString(),
      group_by: groupBy,
      days: safeDays,
      dates: series[0]?.points.map((point) => point.date) ?? [],
      series,
    }
  }

  // workspace-isolation-system-job-approved: responsibility alert synchronization is a scheduler-only fan-out; tenant routes use project-scoped methods.
  async syncAllProjects(projectIds?: string[] | null) {
    const scopedProjectIds = Array.isArray(projectIds)
      ? new Set(projectIds.map((projectId) => String(projectId ?? '').trim()).filter(Boolean))
      : null
    if (scopedProjectIds && scopedProjectIds.size === 0) {
      return {
        scanned: 0,
        failed: 0,
        total: 0,
        abnormalSubjects: 0,
        watchedSubjects: 0,
        recoveryPending: 0,
      }
    }

    const projectResult = await rawQuery(
      `SELECT id, name, status
       FROM public.projects
       WHERE ($1::uuid[] IS NULL OR id = ANY($1::uuid[]))`,
      [scopedProjectIds ? Array.from(scopedProjectIds) : null],
    )
    const projectRows = (projectResult.rows ?? []) as Array<{
      id: string
      name?: string | null
      status?: string | null
    }>

    const skippedStatuses = new Set(['archived', 'completed', '已完成', '已暂停'])
    const projects = projectRows
      .filter((project) => !skippedStatuses.has(normalizeText(project.status)))

    let scanned = 0
    let failed = 0
    let abnormalSubjects = 0
    let watchedSubjects = 0
    let recoveryPending = 0

    for (const project of projects) {
      try {
        const insights = await this.getProjectInsights(String(project.id))
        const allRows = [...insights.person_rows, ...insights.unit_rows]
        scanned += 1
        abnormalSubjects += allRows.filter((row) => row.state_level === 'abnormal').length
        watchedSubjects += allRows.filter((row) => row.watch_status === 'active').length
        recoveryPending += allRows.filter((row) => row.suggest_recovery_confirmation).length
      } catch (scanError) {
        failed += 1
        logger.error('[responsibilityInsightService] sync project failed', {
          projectId: project.id,
          projectName: project.name,
          error: scanError instanceof Error ? scanError.message : String(scanError),
        })
      }
    }

    return {
      scanned,
      failed,
      total: projects.length,
      abnormalSubjects,
      watchedSubjects,
      recoveryPending,
    }
  }

  async markWatch(
    projectId: string,
    input: {
      dimension: ResponsibilityDimension
      subject_key: string
      subject_label: string
      subject_user_id?: string | null
      subject_unit_id?: string | null
      actor_user_id?: string | null
    },
  ) {
    const result = await rawQuery(
      `INSERT INTO public.responsibility_watchlist (
         project_id,
         dimension,
         subject_key,
         subject_label,
         subject_user_id,
         subject_unit_id,
         created_by,
         status,
         updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'active', NOW())
       ON CONFLICT (project_id, dimension, subject_key)
       DO UPDATE SET
         subject_label = EXCLUDED.subject_label,
         subject_user_id = EXCLUDED.subject_user_id,
         subject_unit_id = EXCLUDED.subject_unit_id,
         created_by = EXCLUDED.created_by,
         status = 'active',
         updated_at = NOW()
       RETURNING *`,
      [
        projectId,
        input.dimension,
        input.subject_key,
        input.subject_label,
        input.subject_user_id ?? null,
        input.subject_unit_id ?? null,
        input.actor_user_id ?? null,
      ],
    )
    const watch = result.rows?.[0] as ResponsibilityWatchlist | undefined
    if (!watch) {
      throw new Error(`Failed to persist responsibility watch for ${projectId}:${input.dimension}:${input.subject_key}`)
    }
    return watch
  }

  async confirmRecovery(
    projectId: string,
    input: {
      dimension: ResponsibilityDimension
      subject_key: string
    },
  ) {
    const result = await rawQuery(
      `UPDATE public.responsibility_watchlist
       SET status = 'cleared', updated_at = NOW()
       WHERE project_id = $1
         AND dimension = $2
         AND subject_key = $3
         AND status IN ('suggested_to_clear', 'active')
       RETURNING *`,
      [projectId, input.dimension, input.subject_key],
    )
    const rows = result.rows ?? []
    if (rows.length === 0) {
      throw new Error(`No suggested responsibility watch found for ${projectId}:${input.dimension}:${input.subject_key}`)
    }
    return rows[0] as ResponsibilityWatchlist
  }

  async clearWatch(
    projectId: string,
    input: {
      dimension: ResponsibilityDimension
      subject_key: string
    },
  ) {
    const result = await rawQuery(
      `UPDATE public.responsibility_watchlist
       SET status = 'cleared', updated_at = NOW()
       WHERE project_id = $1
         AND dimension = $2
         AND subject_key = $3
       RETURNING *`,
      [projectId, input.dimension, input.subject_key],
    )
    const rows = result.rows ?? []
    if (rows.length === 0) {
      throw new Error(`No responsibility watch found for ${projectId}:${input.dimension}:${input.subject_key}`)
    }
    return rows[0] as ResponsibilityWatchlist
  }
}

export const responsibilityInsightService = new ResponsibilityInsightService()
