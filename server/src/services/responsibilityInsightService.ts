import { persistNotification } from './warningChainService.js'
import { getMembers, supabase } from './dbService.js'
import { getCriticalPathTaskIds } from './criticalPathHelpers.js'
import { logger } from '../middleware/logger.js'
import { isCompletedTask } from '../utils/taskStatus.js'
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
  is_critical: boolean
  is_milestone: boolean
}

export interface ResponsibilitySubjectInsightRow {
  key: string
  label: string
  dimension: ResponsibilityDimension
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
  return normalizeText(value).slice(0, 10) || null
}

function getPlannedEndDate(task: ResponsibilityTaskRow) {
  return dateOnly(task.planned_end_date ?? task.end_date)
}

function getActualEndDate(task: ResponsibilityTaskRow) {
  return dateOnly(task.actual_end_date ?? task.updated_at)
}

function isTaskDelayed(task: ResponsibilityTaskRow) {
  const planned = parseDate(getPlannedEndDate(task))
  if (!planned) return false

  if (isCompletedTask(task)) {
    const actual = parseDate(getActualEndDate(task))
    return Boolean(actual && actual.getTime() > planned.getTime())
  }

  const now = new Date()
  now.setHours(0, 0, 0, 0)
  planned.setHours(0, 0, 0, 0)
  return planned.getTime() < now.getTime()
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
        completedCount += 1
      }
      if (plannedDate && plannedDate <= dateKey && !completedByDate) {
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

function buildTaskDetail(task: ResponsibilityTaskRow, criticalTaskIds: Set<string>) {
  const delayed = isTaskDelayed(task)
  return {
    id: String(task.id),
    title: normalizeText(task.title, '未命名任务'),
    assignee: normalizeText(task.assignee_name ?? task.assignee, '未分配责任人'),
    assignee_user_id: task.assignee_user_id ?? task.assignee_id ?? null,
    unit: normalizeText(task.participant_unit_name ?? task.responsible_unit ?? task.assignee_unit, '未���配责任单位'),
    participant_unit_id: task.participant_unit_id ?? null,
    completed: isCompletedTask(task),
    status_label: statusLabel(task, delayed),
    planned_end_date: getPlannedEndDate(task),
    actual_end_date: getActualEndDate(task),
    is_delayed: delayed,
    is_critical: criticalTaskIds.has(task.id),
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
  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .eq('project_id', projectId)

  if (error) throw new Error(error.message)
  return (data ?? []) as ResponsibilityTaskRow[]
}

async function loadRisks(projectId: string) {
  const { data, error } = await supabase
    .from('risks')
    .select('id, task_id, status, project_id')
    .eq('project_id', projectId)

  if (error) throw new Error(error.message)
  return (data ?? []) as Risk[]
}

async function loadObstacles(projectId: string) {
  const { data, error } = await supabase
    .from('task_obstacles')
    .select('id, task_id, status, tasks!inner(project_id)')
    .eq('tasks.project_id', projectId)

  if (error) throw new Error(error.message)
  return (data ?? []) as unknown as ResponsibilityObstacleRow[]
}

async function loadWatchlist(projectId: string) {
  const { data, error } = await supabase
    .from('responsibility_watchlist')
    .select('*')
    .eq('project_id', projectId)
    .order('updated_at', { ascending: false })

  if (error) throw new Error(error.message)
  return (data ?? []) as ResponsibilityWatchlist[]
}

async function loadAlertStates(projectId: string) {
  const { data, error } = await supabase
    .from('responsibility_alert_states')
    .select('*')
    .eq('project_id', projectId)

  if (error) throw new Error(error.message)
  return (data ?? []) as ResponsibilityAlertState[]
}

async function getOwnerRecipients(projectId: string) {
  const members = await getMembers(projectId)
  return uniqueRecipients(
    members
      .filter((member) => String(member.permission_level ?? member.role ?? '').trim().toLowerCase() === 'owner')
      .map((member) => member.user_id),
  )
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
  const unitLabel = normalizeText(
    unitId ? unitNameMap.get(unitId) : task.participant_unit_name ?? task.responsible_unit ?? task.assignee_unit,
    '未分配责任单位',
  )
  return {
    key: unitId ? `unit:${unitId}` : `unit-name:${unitLabel}`,
    label: unitLabel,
    subject_user_id: null,
    subject_unit_id: unitId || null,
  }
}

function getTaskUnitInfo(task: ResponsibilityTaskRow, unitNameMap: Map<string, string>) {
  const unitId = normalizeText(task.participant_unit_id, '')
  const unitLabel = normalizeText(
    unitId ? unitNameMap.get(unitId) : task.participant_unit_name ?? task.responsible_unit ?? task.assignee_unit,
    '未分配责任单位',
  )
  return {
    key: unitId ? `unit:${unitId}` : `unit-name:${unitLabel}`,
    label: unitLabel,
    unitId: unitId || null,
  }
}

function buildRiskTaskMap(risks: Risk[]) {
  const map = new Map<string, number>()
  for (const risk of risks) {
    const taskId = normalizeText(risk.task_id, '')
    if (!taskId) continue
    const status = normalizeStatus(risk.status)
    if (status === 'closed' || status === 'resolved') continue
    map.set(taskId, (map.get(taskId) || 0) + 1)
  }
  return map
}

function buildObstacleTaskMap(obstacles: ResponsibilityObstacleRow[]) {
  const map = new Map<string, number>()
  for (const obstacle of obstacles) {
    const taskId = normalizeText(obstacle.task_id, '')
    if (!taskId) continue
    const resolved = normalizeStatus(obstacle.status) === 'resolved'
      || normalizeStatus(obstacle.status) === '已解决'
    if (resolved) continue
    map.set(taskId, (map.get(taskId) || 0) + 1)
  }
  return map
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
  riskByTaskId: Map<string, number>,
  obstacleByTaskId: Map<string, number>,
) {
  const currentWeekStart = getWeekStart()
  const nextWeekStart = addDays(currentWeekStart, 7)
  const previousWeekStart = addDays(currentWeekStart, -7)

  const rows = accumulators.map((accumulator) => {
    let openRiskCount = 0
    let openObstacleCount = 0
    for (const task of accumulator.tasks) {
      openRiskCount += riskByTaskId.get(task.id) || 0
      openObstacleCount += obstacleByTaskId.get(task.id) || 0
    }

    const completedCount = accumulator.tasks.filter((task) => task.completed).length
    const onTimeCount = accumulator.tasks.filter((task) => task.completed && !task.is_delayed).length
    const delayedCount = accumulator.tasks.filter((task) => task.is_delayed).length
    const activeDelayedCount = accumulator.tasks.filter((task) => !task.completed && task.is_delayed).length
    const currentInHandCount = accumulator.tasks.filter((task) => !task.completed).length
    const keyCommitmentGapCount = accumulator.tasks.filter(
      (task) => !task.completed && task.is_delayed && (task.is_critical || task.is_milestone),
    ).length
    const currentWeek = calculateWeeklyRate(accumulator.tasks, currentWeekStart, nextWeekStart)
    const previousWeek = calculateWeeklyRate(accumulator.tasks, previousWeekStart, currentWeekStart)
    const trendDelta = currentWeek.rate - previousWeek.rate
    const primaryUnit = Array.from(accumulator.unitTally.values()).sort((left, right) => right.count - left.count)[0]

    return {
      key: accumulator.key,
      label: accumulator.label,
      dimension: accumulator.dimension,
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
      risk_pressure: openRiskCount + openObstacleCount,
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
  risks: Risk[],
  obstacles: ResponsibilityObstacleRow[],
) {
  const accumulators = new Map<string, SubjectAccumulator>()
  const riskByTaskId = buildRiskTaskMap(risks)
  const obstacleByTaskId = buildObstacleTaskMap(obstacles)
  const criticalTaskIds = await getCriticalPathTaskIds(projectId)

  for (const task of tasks) {
    const subject = buildSubjectKey(dimension, task, memberMap, unitNameMap)
    const detail = buildTaskDetail(task, criticalTaskIds)
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

function buildAlertReasons(row: ResponsibilitySubjectInsightRow, lowOnTimeStreak: number) {
  const reasons: string[] = []
  if (lowOnTimeStreak >= 2) {
    reasons.push(`按时完成率连续 ${lowOnTimeStreak} 个统计周期低于 60%`)
  }
  if (row.active_delayed_count >= 3) {
    reasons.push(`活跃延期任务 ${row.active_delayed_count} 项`)
  }
  if (row.key_commitment_gap_count >= 2) {
    reasons.push(`本月重点项未兑现 ${row.key_commitment_gap_count} 项`)
  }
  return reasons
}

function buildResponsibilityNotificationKey(row: ResponsibilitySubjectInsightRow) {
  return `${row.dimension}:${row.key}`
}

async function resolveResponsibilityNotificationState(projectId: string, row: ResponsibilitySubjectInsightRow, ownerRecipients: string[]) {
  const subjectNotificationKey = buildResponsibilityNotificationKey(row)
  if (row.state_level === 'abnormal') {
    const severity = row.active_delayed_count >= 5 || row.current_week_on_time_rate < 40 ? 'critical' : 'warning'
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

  const { error } = await supabase
    .from('notifications')
    .update({
      status: 'resolved',
      resolved_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('project_id', projectId)
    .eq('source_entity_type', 'responsibility_subject')
    .eq('source_entity_id', subjectNotificationKey)
    .neq('status', 'resolved')

  if (error) {
    logger.warn('[responsibilityInsightService] resolve responsibility notification failed', {
      projectId,
      subjectNotificationKey,
      error: error.message,
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

  const payload = {
    id: previous?.id,
    project_id: projectId,
    dimension: row.dimension,
    subject_key: row.key,
    subject_label: row.label,
    subject_user_id: row.subject_user_id ?? null,
    subject_unit_id: row.subject_unit_id ?? null,
    alert_type: 'responsibility_health',
    current_level: nextLevel,
    consecutive_unhealthy_periods: lowOnTimeStreak,
    consecutive_healthy_periods: healthyPeriods,
    last_snapshot_week: getWeekStart().toISOString().slice(0, 10),
    last_message_id: notificationId ?? previous?.last_message_id ?? null,
    last_metrics: {
      on_time_rate: row.on_time_rate,
      current_week_on_time_rate: row.current_week_on_time_rate,
      active_delayed_count: row.active_delayed_count,
      key_commitment_gap_count: row.key_commitment_gap_count,
      risk_pressure: row.risk_pressure,
      alert_reasons: alertReasons,
    },
    updated_at: new Date().toISOString(),
  }

  const { data, error } = await supabase
    .from('responsibility_alert_states')
    .upsert(payload, { onConflict: 'project_id,dimension,subject_key,alert_type', ignoreDuplicates: false })
    .select('*')
    .single()

  if (error) throw new Error(error.message)

  return {
    alertState: data as ResponsibilityAlertState,
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
    const { error } = await supabase
      .from('responsibility_watchlist')
      .update({
        status: nextStatus,
        updated_at: new Date().toISOString(),
      })
      .eq('id', watch.id)

    if (error) throw new Error(error.message)
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
) {
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
    const alertState = await upsertAlertState(projectId, row, previousAlert, lowOnTimeStreak, ownerRecipients)
    const watchState = await updateWatchlistState({
      ...row,
      alert_reasons: alertState.alertReasons,
      state_level: alertState.stateLevel,
    }, watchMap.get(mapKey), previousAlert?.current_level ?? null)

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
  async getProjectInsights(projectId: string): Promise<ResponsibilityInsightsResponse> {
    const [memberMap, unitNameMap, tasks, risks, obstacles, watchlist, alertStates, ownerRecipients] = await Promise.all([
      loadProjectMembers(projectId),
      loadParticipantUnitNameMap(projectId),
      loadTasks(projectId),
      loadRisks(projectId),
      loadObstacles(projectId),
      loadWatchlist(projectId),
      loadAlertStates(projectId),
      getOwnerRecipients(projectId),
    ])

    const [personRowsBase, unitRowsBase] = await Promise.all([
      buildRowsForDimension(projectId, 'person', tasks, memberMap, unitNameMap, risks, obstacles),
      buildRowsForDimension(projectId, 'unit', tasks, memberMap, unitNameMap, risks, obstacles),
    ])

    const [personRows, unitRows] = await Promise.all([
      hydrateDimensionRows(projectId, personRowsBase, watchlist, alertStates, ownerRecipients),
      hydrateDimensionRows(projectId, unitRowsBase, watchlist, alertStates, ownerRecipients),
    ])

    const latestWatchlist = await loadWatchlist(projectId)

    return {
      project_id: projectId,
      generated_at: new Date().toISOString(),
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
    const insights = await this.getProjectInsights(projectId)
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

  async syncAllProjects() {
    const { data, error } = await supabase
      .from('projects')
      .select('id, name, status')

    if (error) throw new Error(error.message)

    const skippedStatuses = new Set(['archived', 'completed', '已完成', '已暂停'])
    const projects = (data ?? []).filter((project) => !skippedStatuses.has(normalizeText(project.status)))

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
    const payload = {
      project_id: projectId,
      dimension: input.dimension,
      subject_key: input.subject_key,
      subject_label: input.subject_label,
      subject_user_id: input.subject_user_id ?? null,
      subject_unit_id: input.subject_unit_id ?? null,
      created_by: input.actor_user_id ?? null,
      status: 'active',
      updated_at: new Date().toISOString(),
    }

    const { data, error } = await supabase
      .from('responsibility_watchlist')
      .upsert(payload, { onConflict: 'project_id,dimension,subject_key', ignoreDuplicates: false })
      .select('*')
      .single()

    if (error) throw new Error(error.message)
    return data as ResponsibilityWatchlist
  }

  async confirmRecovery(
    projectId: string,
    input: {
      dimension: ResponsibilityDimension
      subject_key: string
    },
  ) {
    const { data, error } = await supabase
      .from('responsibility_watchlist')
      .update({
        status: 'cleared',
        updated_at: new Date().toISOString(),
      })
      .eq('project_id', projectId)
      .eq('dimension', input.dimension)
      .eq('subject_key', input.subject_key)
      .eq('status', 'suggested_to_clear')
      .select('*')
      .single()

    if (error) throw new Error(error.message)
    return data as ResponsibilityWatchlist
  }

  async clearWatch(
    projectId: string,
    input: {
      dimension: ResponsibilityDimension
      subject_key: string
    },
  ) {
    const { data, error } = await supabase
      .from('responsibility_watchlist')
      .update({
        status: 'cleared',
        updated_at: new Date().toISOString(),
      })
      .eq('project_id', projectId)
      .eq('dimension', input.dimension)
      .eq('subject_key', input.subject_key)
      .select('*')
      .single()

    if (error) throw new Error(error.message)
    return data as ResponsibilityWatchlist
  }
}

export const responsibilityInsightService = new ResponsibilityInsightService()
