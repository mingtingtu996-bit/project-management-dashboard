import type { ConstructionCalendarContext } from './constructionCalendar.js'
import { calculateProgressMetrics } from '../utils/progressCalculation.js'
import { delayDayDelta } from '../utils/durationDays.js'
import { isCompletedTask } from '../utils/taskStatus.js'
import { businessDateKey } from './durationMetricService.js'

export type TaskSummaryCompareGranularity = 'day' | 'week' | 'month'

export interface TaskSummaryComparePeriod {
  label: string
  from: string
  to: string
}

export type TaskSummaryCompareTask = Record<string, unknown> & { id: string }

export interface TaskSummaryProgressSnapshot {
  task_id: string
  progress: number
  snapshot_date?: string
  conditions_total_count?: number | null
  obstacles_active_count?: number | null
}

export const TASK_SUMMARY_COMPARE_METRIC_KEYS = {
  total_progress_change: 'task_summary_progress_change',
  tasks_updated: 'task_summary_tasks_updated',
  tasks_progressed: 'task_summary_tasks_progressed',
  tasks_completed: 'task_summary_tasks_completed',
  delayed: 'task_summary_delayed_count',
  on_time_rate: 'task_summary_on_time_rate',
} as const

const TASK_SUMMARY_DATE_KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/

function parseTaskSummaryDateKey(value: string) {
  const match = TASK_SUMMARY_DATE_KEY_PATTERN.exec(value)
  if (!match) throw new Error('TASK_SUMMARY_DAILY_DATE_INVALID')
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(Date.UTC(year, month - 1, day))
  if (
    date.getUTCFullYear() !== year
    || date.getUTCMonth() !== month - 1
    || date.getUTCDate() !== day
  ) {
    throw new Error('TASK_SUMMARY_DAILY_DATE_INVALID')
  }
  return { year, month, day }
}

function shiftTaskSummaryDateKey(value: string, days: number) {
  const { year, month, day } = parseTaskSummaryDateKey(value)
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10)
}

function readTimeZoneDateTimeParts(value: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(value)
  const part = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((item) => item.type === type)?.value)
  return {
    year: part('year'),
    month: part('month'),
    day: part('day'),
    hour: part('hour'),
    minute: part('minute'),
    second: part('second'),
  }
}

function businessMidnightUtc(dateKey: string, timezone: string) {
  const target = parseTaskSummaryDateKey(dateKey)
  const targetUtcMs = Date.UTC(target.year, target.month - 1, target.day)
  let candidateMs = targetUtcMs
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const candidate = new Date(candidateMs)
    const local = readTimeZoneDateTimeParts(candidate, timezone)
    const representedUtcMs = Date.UTC(
      local.year,
      local.month - 1,
      local.day,
      local.hour,
      local.minute,
      local.second,
    )
    const nextCandidateMs = targetUtcMs - (representedUtcMs - candidate.getTime())
    if (nextCandidateMs === candidateMs) break
    candidateMs = nextCandidateMs
  }
  const result = new Date(candidateMs)
  const local = readTimeZoneDateTimeParts(result, timezone)
  if (
    local.year !== target.year
    || local.month !== target.month
    || local.day !== target.day
    || local.hour !== 0
    || local.minute !== 0
    || local.second !== 0
  ) {
    throw new Error('TASK_SUMMARY_BUSINESS_DAY_BOUNDARY_UNRESOLVED')
  }
  return result.toISOString()
}

export function resolveDailyTaskProgressWindow(input: {
  date?: string | null
  timezone?: string | null
  now?: Date
}) {
  const timezone = String(input.timezone ?? '').trim() || 'Asia/Shanghai'
  const targetDate = String(input.date ?? '').trim() || businessDateKey(input.now ?? new Date(), timezone)
  parseTaskSummaryDateKey(targetDate)
  const previousDate = shiftTaskSummaryDateKey(targetDate, -1)
  const nextDate = shiftTaskSummaryDateKey(targetDate, 1)
  return {
    targetDate,
    previousDate,
    dayStartInclusive: businessMidnightUtc(targetDate, timezone),
    dayEndExclusive: businessMidnightUtc(nextDate, timezone),
  }
}

export function normalizeTaskSummaryCompareGranularity(raw?: string | null): TaskSummaryCompareGranularity {
  return raw === 'week' || raw === 'month' ? raw : 'day'
}

export function normalizeTaskSummaryComparePeriods(
  periods: TaskSummaryComparePeriod[],
  granularity: TaskSummaryCompareGranularity,
) {
  if (granularity !== 'month') {
    return periods
  }

  const pad = (value: number) => String(value).padStart(2, '0')

  const getMonthLastDay = (year: number, month: number) => {
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate()
    return `${year}-${pad(month)}-${pad(lastDay)}`
  }

  const normalizeMonthEdge = (value: string, edge: 'from' | 'to') => {
    if (/^\d{4}-\d{2}$/.test(value)) {
      if (edge === 'from') return `${value}-01`
      const [year, month] = value.split('-').map((item) => Number(item))
      return getMonthLastDay(year, month)
    }
    return value
  }

  return periods.map((period) => ({
    ...period,
    from: normalizeMonthEdge(period.from, 'from'),
    to: normalizeMonthEdge(period.to, 'to'),
  }))
}

function toDateOnly(value: unknown): string {
  return String(value ?? '').slice(0, 10)
}

export function getTaskPlannedEndDate(task: Record<string, unknown> | null | undefined): string {
  return toDateOnly(task?.planned_end_date || task?.end_date)
}

export function getTaskActualEndDate(task: Record<string, unknown> | null | undefined): string {
  return toDateOnly(task?.actual_end_date)
}

export function isTaskDelayedByPeriodEnd(
  task: Record<string, unknown> | null | undefined,
  periodEnd: string,
  calendar?: ConstructionCalendarContext | null,
): boolean {
  if (!task) return false
  const plannedEnd = getTaskPlannedEndDate(task)
  if (!plannedEnd || plannedEnd > periodEnd) return false

  if (isCompletedTask(task)) {
    const actualEnd = getTaskActualEndDate(task)
    if (!actualEnd) return false
    return Math.max(0, delayDayDelta(plannedEnd, actualEnd, calendar) ?? 0) > 0
  }

  return true
}

function buildSnapshotsByTask(snapshots: TaskSummaryProgressSnapshot[]) {
  const snapshotsByTask = new Map<string, TaskSummaryProgressSnapshot[]>()
  for (const snapshot of snapshots) {
    const rows = snapshotsByTask.get(snapshot.task_id) ?? []
    rows.push({
      ...snapshot,
      progress: Number(snapshot.progress ?? 0),
      snapshot_date: String(snapshot.snapshot_date ?? ''),
    })
    snapshotsByTask.set(snapshot.task_id, rows)
  }
  for (const rows of snapshotsByTask.values()) {
    rows.sort((left, right) => String(left.snapshot_date).localeCompare(String(right.snapshot_date)))
  }
  return snapshotsByTask
}

function getProgressBefore(
  snapshotsByTask: Map<string, TaskSummaryProgressSnapshot[]>,
  taskId: string,
  date: string,
) {
  let progress = 0
  for (const snapshot of snapshotsByTask.get(taskId) ?? []) {
    if (String(snapshot.snapshot_date) >= date) break
    progress = Number(snapshot.progress ?? 0)
  }
  return progress
}

function getProgressAtOrBefore(
  snapshotsByTask: Map<string, TaskSummaryProgressSnapshot[]>,
  taskId: string,
  date: string,
) {
  let progress = 0
  for (const snapshot of snapshotsByTask.get(taskId) ?? []) {
    if (String(snapshot.snapshot_date) > date) break
    progress = Number(snapshot.progress ?? 0)
  }
  return progress
}

export function buildTaskSummaryCompareResults(input: {
  periods: TaskSummaryComparePeriod[]
  tasks: TaskSummaryCompareTask[]
  snapshots: TaskSummaryProgressSnapshot[]
  resolveResponsibleLabel: (task: TaskSummaryCompareTask) => string
  workCalendar?: ConstructionCalendarContext | null
}) {
  const taskMap = new Map(input.tasks.map((task) => [task.id, task]))
  const snapshotsByTask = buildSnapshotsByTask(input.snapshots)
  const buildProjectProgressTasks = (date: string, mode: 'before' | 'at') => input.tasks.map((task) => ({
    id: task.id,
    parent_id: task.parent_id == null ? null : String(task.parent_id),
    status: task.status == null ? null : String(task.status),
    planned_start_date: task.planned_start_date == null ? null : String(task.planned_start_date),
    planned_end_date: task.planned_end_date == null ? null : String(task.planned_end_date),
    start_date: task.start_date == null ? null : String(task.start_date),
    end_date: task.end_date == null ? null : String(task.end_date),
    is_executable: typeof task.is_executable === 'boolean' ? task.is_executable : null,
    is_wbs_summary: typeof task.is_wbs_summary === 'boolean' ? task.is_wbs_summary : null,
    progress_method: task.progress_method == null ? null : String(task.progress_method),
    progress: mode === 'before'
      ? getProgressBefore(snapshotsByTask, task.id, date)
      : getProgressAtOrBefore(snapshotsByTask, task.id, date),
  }))

  return input.periods.map((period) => {
    const taskChanges = new Map<string, {
      task_id: string
      task_title: string
      assignee: string
      progress_before: number
      progress_after: number
      progress_delta: number
    }>()

    for (const snapshot of input.snapshots) {
      const snapshotDate = String(snapshot.snapshot_date ?? '')
      if (snapshotDate < period.from || snapshotDate > period.to) continue
      const task = taskMap.get(snapshot.task_id)
      if (!task) continue
      const progress = Number(snapshot.progress ?? 0)
      const existing = taskChanges.get(snapshot.task_id)
      if (existing) {
        existing.progress_after = progress
        existing.progress_delta = progress - existing.progress_before
        continue
      }
      const baselineProgress = getProgressBefore(snapshotsByTask, snapshot.task_id, period.from)
      taskChanges.set(snapshot.task_id, {
        task_id: snapshot.task_id,
        task_title: String(task.title ?? '').trim() || '\u672a\u547d\u540d\u4efb\u52a1',
        assignee: input.resolveResponsibleLabel(task),
        progress_before: baselineProgress,
        progress_after: progress,
        progress_delta: progress - baselineProgress,
      })
    }

    const taskDetails = [...taskChanges.values()]
    const baselineProjectProgress = calculateProgressMetrics(
      buildProjectProgressTasks(period.from, 'before'),
      new Date(`${period.from}T00:00:00.000Z`),
    ).currentProgress
    const currentProjectProgress = calculateProgressMetrics(
      buildProjectProgressTasks(period.to, 'at'),
      new Date(`${period.to}T00:00:00.000Z`),
    ).currentProgress
    const tasksUpdated = taskDetails.length
    // eslint-disable-next-line -- summary-service-aggregation-approved; ssot: task_progress_snapshots
    const tasksProgressed = taskDetails.filter((task) => task.progress_delta > 0).length
    // eslint-disable-next-line -- summary-service-aggregation-approved; ssot: task_progress_snapshots
    const tasksCompleted = taskDetails.filter((task) => task.progress_before < 100 && task.progress_after >= 100).length
    // eslint-disable-next-line -- summary-service-aggregation-approved; ssot: tasks-and-construction-calendar
    const delayedTasks = input.tasks.filter((task) => isTaskDelayedByPeriodEnd(task, period.to, input.workCalendar)).length
    // eslint-disable-next-line -- summary-service-aggregation-approved; ssot: tasks-and-construction-calendar
    const onTimeTasks = taskDetails.filter((task) => !isTaskDelayedByPeriodEnd(taskMap.get(task.task_id), period.to, input.workCalendar)).length

    return {
      period_label: period.label,
      from: period.from,
      to: period.to,
      summary: {
        total_progress_change: Number((currentProjectProgress - baselineProjectProgress).toFixed(2)),
        tasks_updated: tasksUpdated,
        tasks_progressed: tasksProgressed,
        tasks_completed: tasksCompleted,
        delayed: delayedTasks,
        on_time_rate: tasksUpdated > 0 ? Math.round((onTimeTasks / tasksUpdated) * 100) : 0,
      },
      metric_keys: TASK_SUMMARY_COMPARE_METRIC_KEYS,
      task_ids: taskDetails.map((task) => task.task_id),
      task_details: taskDetails.map((task) => {
        const sourceTask = taskMap.get(task.task_id)
        return {
          id: task.task_id,
          title: task.task_title,
          progress: task.progress_after,
          progress_before: task.progress_before,
          progress_delta: task.progress_delta,
          assignee: task.assignee,
          end_date: getTaskPlannedEndDate(sourceTask),
          completed_at: getTaskActualEndDate(sourceTask),
          specialty_type: '',
          is_on_time: !isTaskDelayedByPeriodEnd(sourceTask, period.to, input.workCalendar),
        }
      }),
    }
  })
}

export function buildDailyTaskProgressSummary(input: {
  targetDate: string
  previousDate: string
  tasks: TaskSummaryCompareTask[]
  todaySnapshots: Map<string, TaskSummaryProgressSnapshot>
  previousSnapshots: Map<string, TaskSummaryProgressSnapshot>
  delayedTaskCount: number | null
  resolveResponsibleLabel: (task: TaskSummaryCompareTask) => string
}) {
  const comparableTaskIds = new Set<string>()
  const insufficientTaskIds = new Set<string>()
  const allSnapshotTaskIds = new Set([
    ...input.todaySnapshots.keys(),
    ...input.previousSnapshots.keys(),
  ])
  let conditionsAdded = 0
  let conditionsClosed = 0
  let obstaclesAdded = 0
  let obstaclesClosed = 0

  for (const taskId of allSnapshotTaskIds) {
    const today = input.todaySnapshots.get(taskId)
    const previous = input.previousSnapshots.get(taskId)
    if (!today || !previous) {
      insufficientTaskIds.add(taskId)
      continue
    }
    comparableTaskIds.add(taskId)
    const conditionDelta = Number(today.conditions_total_count ?? 0) - Number(previous.conditions_total_count ?? 0)
    const obstacleDelta = Number(today.obstacles_active_count ?? 0) - Number(previous.obstacles_active_count ?? 0)
    if (conditionDelta > 0) conditionsAdded += conditionDelta
    if (conditionDelta < 0) conditionsClosed += Math.abs(conditionDelta)
    if (obstacleDelta > 0) obstaclesAdded += obstacleDelta
    if (obstacleDelta < 0) obstaclesClosed += Math.abs(obstacleDelta)
  }

  const details: Array<{
    task_id: string
    task_title: string
    progress_before: number
    progress_after: number
    progress_delta: number
    assignee: string
  }> = []
  let totalProgressChange = 0
  let tasksCompleted = 0

  for (const task of input.tasks) {
    const today = input.todaySnapshots.get(task.id)
    const previous = input.previousSnapshots.get(task.id)
    if (!today || !previous) {
      insufficientTaskIds.add(task.id)
      continue
    }
    const currentProgress = Number(today.progress ?? 0)
    const previousProgress = Number(previous.progress ?? 0)
    const progressDelta = currentProgress - previousProgress
    const completedToday = previousProgress < 100 && currentProgress >= 100
    if (completedToday) tasksCompleted += 1
    if (progressDelta === 0 && !completedToday) continue
    totalProgressChange += progressDelta
    details.push({
      task_id: task.id,
      task_title: String(task.title ?? '').trim() || '\u672a\u547d\u540d\u4efb\u52a1',
      progress_before: previousProgress,
      progress_after: currentProgress,
      progress_delta: progressDelta,
      assignee: input.resolveResponsibleLabel(task),
    })
  }

  if (input.delayedTaskCount == null) insufficientTaskIds.add('project_daily_snapshot:delayed_tasks')

  return {
    date: input.targetDate,
    previous_date: input.previousDate,
    progress_change: Number(totalProgressChange.toFixed(2)),
    tasks_updated: details.length,
    tasks_completed: tasksCompleted,
    evidence_status: insufficientTaskIds.size > 0 ? 'insufficient_data' as const : 'ready' as const,
    insufficient_task_ids: [...insufficientTaskIds].sort(),
    snapshot_summary: {
      conditions_added: conditionsAdded,
      conditions_closed: conditionsClosed,
      obstacles_added: obstaclesAdded,
      obstacles_closed: obstaclesClosed,
      delayed_tasks: input.delayedTaskCount,
    },
    details: details.sort((left, right) => Math.abs(right.progress_delta) - Math.abs(left.progress_delta)),
  }
}
