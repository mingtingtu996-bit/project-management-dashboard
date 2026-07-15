import { isCompletedTaskDelayedAgainstPlan } from '../utils/taskPerformance.js'
import { delayDayDelta } from '../utils/durationDays.js'
import {
  resolveConstructionCalendarContext,
  type ConstructionCalendarContext,
} from './constructionCalendar.js'

export type TaskSummaryAttributionDimension =
  | 'division'
  | 'subdivision'
  | 'specialty'
  | 'building'
  | 'region'
  | 'phase'
  | 'section'
  | 'floor'
  | 'participant_unit'
  | 'assignee'

export type TaskSummaryAttributionSource =
  | 'wbs'
  | 'engineering_object'
  | 'business_label'
  | 'participant_unit'
  | 'project_member'
  | 'invalid_unassigned'
  | 'unassigned'

export type TaskSummaryAttributionHealthLevel = 'healthy' | 'warning' | 'critical'

export type TaskSummaryAttributionTask = {
  id: string
  status_label?: string | null
  completed_at?: string | null
  planned_end_date?: string | null
  delay_total_days?: number | null
  division_id?: string | null
  division_name?: string | null
  division_sort_order?: number | null
  subdivision_id?: string | null
  subdivision_name?: string | null
  subdivision_sort_order?: number | null
  specialty_id?: string | null
  specialty_name?: string | null
  specialty_sort_order?: number | null
  building_id?: string | null
  building_name?: string | null
  building_sort_order?: number | null
  region_id?: string | null
  region_name?: string | null
  region_sort_order?: number | null
  phase_object_id?: string | null
  phase_name?: string | null
  phase_sort_order?: number | null
  participant_unit_id?: string | null
  participant_unit_name?: string | null
  assignee_user_id?: string | null
  assignee?: string | null
}

export type TaskSummaryAttributionGroup = {
  id: string
  dimension: TaskSummaryAttributionDimension
  dimensionLabel: string
  value: string
  source: TaskSummaryAttributionSource
  sourceId: string | null
  taskIds: string[]
  taskCount: number
  onTimeCount: number
  delayedCount: number
  recentCompletedAt: string | null
  sortOrder: number
}

export type TaskSummaryAttributionTotal = {
  total: number
  completed: number
  on_time: number
  delayed: number
  on_time_rate: number
  completion_rate: number
  max_delay_days: number
  avg_delay_days: number
  recent_completed_at: string | null
  health_level: TaskSummaryAttributionHealthLevel
}

export type TaskSummaryAttributionTotalsMap = Record<
  TaskSummaryAttributionDimension,
  Record<string, TaskSummaryAttributionTotal>
>

type AttributionBucketMeta = Omit<
  TaskSummaryAttributionGroup,
  'taskIds' | 'taskCount' | 'onTimeCount' | 'delayedCount' | 'recentCompletedAt'
>

type AttributionBucket = {
  meta: AttributionBucketMeta
  rows: TaskSummaryAttributionTask[]
}

export const HEALTH_THRESHOLDS = {
  healthy: 80,
  warning: 50,
} as const

export const TASK_SUMMARY_ATTRIBUTION_DIMENSIONS: Array<{
  value: TaskSummaryAttributionDimension
  label: string
}> = [
  { value: 'division', label: '分部工程' },
  { value: 'subdivision', label: '分项工程' },
  { value: 'specialty', label: '专项工程' },
  { value: 'building', label: '楼栋' },
  { value: 'region', label: '区域' },
  { value: 'phase', label: '分期' },
  { value: 'section', label: '标段' },
  { value: 'floor', label: '楼层' },
  { value: 'participant_unit', label: '责任单位' },
  { value: 'assignee', label: '责任人' },
]

function normalizeText(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function toDateOnly(value: unknown) {
  const normalized = normalizeText(value).slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : ''
}

function getDimensionLabel(dimension: TaskSummaryAttributionDimension) {
  return TASK_SUMMARY_ATTRIBUTION_DIMENSIONS.find((item) => item.value === dimension)?.label ?? '归属'
}

function getUnassignedLabel(dimension: TaskSummaryAttributionDimension) {
  switch (dimension) {
    case 'division':
      return '未关联分部工程'
    case 'subdivision':
      return '未关联分项工程'
    case 'specialty':
      return '未关联专项工程'
    case 'building':
      return '未关联楼栋'
    case 'region':
      return '未关联区域'
    case 'phase':
      return '未关联分期'
    case 'section':
      return '未关联标段'
    case 'floor':
      return '未关联楼层'
    case 'participant_unit':
      return '未关联责任单位'
    case 'assignee':
      return '未关联责任人'
    default:
      return '未关联归属'
  }
}

function isCompletedAttributionTask(task: TaskSummaryAttributionTask) {
  const status = normalizeText(task.status_label).toLowerCase()
  return Boolean(toDateOnly(task.completed_at)) || ['completed', 'done', 'finished', 'on_time', 'delayed'].includes(status)
}

export function isDelayedAttributionTask(
  task: TaskSummaryAttributionTask,
  calendar?: ConstructionCalendarContext | null,
) {
  if (!isCompletedAttributionTask(task)) return false
  return isCompletedTaskDelayedAgainstPlan(task, calendar) && getAttributionDelayDays(task, calendar) > 0
}

function getAttributionDelayDays(
  task: TaskSummaryAttributionTask,
  calendar?: ConstructionCalendarContext | null,
) {
  const plannedEnd = toDateOnly(task.planned_end_date)
  const completedAt = toDateOnly(task.completed_at)
  const computedDelay = delayDayDelta(plannedEnd, completedAt, calendar)
  if (computedDelay !== null) return Math.max(computedDelay, 0)
  return Math.max(Number(task.delay_total_days ?? 0), 0)
}

function getRecentCompletedAt(rows: TaskSummaryAttributionTask[]) {
  return rows
    .map((row) => toDateOnly(row.completed_at))
    .filter(Boolean)
    .sort((left, right) => right.localeCompare(left))[0] || null
}

function getHealthLevel(onTimeRate: number): TaskSummaryAttributionHealthLevel {
  if (onTimeRate >= HEALTH_THRESHOLDS.healthy) return 'healthy'
  if (onTimeRate >= HEALTH_THRESHOLDS.warning) return 'warning'
  return 'critical'
}

function getRate(part: number, total: number) {
  return total > 0 ? Math.round((part / total) * 100) : 0
}

function addAttributionBucket(
  buckets: Map<string, AttributionBucket>,
  dimension: TaskSummaryAttributionDimension,
  source: TaskSummaryAttributionSource,
  sourceId: string | null,
  value: string,
  sortOrder: number,
  task: TaskSummaryAttributionTask,
) {
  const key = `${dimension}-${sourceId ?? '__unassigned__'}`
  const current = buckets.get(key) ?? {
    meta: {
      id: key,
      dimension,
      dimensionLabel: getDimensionLabel(dimension),
      value,
      source,
      sourceId,
      sortOrder,
    },
    rows: [],
  }

  current.rows.push(task)
  buckets.set(key, current)
}

function addTaskToAttributionBuckets(buckets: Map<string, AttributionBucket>, task: TaskSummaryAttributionTask) {
  addAttributionBucket(
    buckets,
    'division',
    task.division_id ? 'wbs' : 'unassigned',
    task.division_id ?? null,
    normalizeText(task.division_name) || getUnassignedLabel('division'),
    Number(task.division_sort_order ?? 0),
    task,
  )
  addAttributionBucket(
    buckets,
    'subdivision',
    task.subdivision_id ? 'wbs' : 'unassigned',
    task.subdivision_id ?? null,
    normalizeText(task.subdivision_name) || getUnassignedLabel('subdivision'),
    Number(task.subdivision_sort_order ?? 0),
    task,
  )
  // Specialty remains a business label; engineering category is the canonical WBS path.
  const specialtySource: TaskSummaryAttributionSource =
    task.specialty_id ? 'business_label' : 'invalid_unassigned'
  addAttributionBucket(
    buckets,
    'specialty',
    specialtySource,
    task.specialty_id ?? null,
    normalizeText(task.specialty_name) || getUnassignedLabel('specialty'),
    Number(task.specialty_sort_order ?? 0),
    task,
  )
  const buildingSource: TaskSummaryAttributionSource =
    task.building_id ? 'engineering_object' : 'invalid_unassigned'
  addAttributionBucket(
    buckets,
    'building',
    buildingSource,
    task.building_id ?? null,
    normalizeText(task.building_name) || getUnassignedLabel('building'),
    Number(task.building_sort_order ?? 0),
    task,
  )
  const regionSource: TaskSummaryAttributionSource =
    task.region_id ? 'engineering_object' : 'invalid_unassigned'
  addAttributionBucket(
    buckets,
    'region',
    regionSource,
    task.region_id ?? null,
    normalizeText(task.region_name) || getUnassignedLabel('region'),
    Number(task.region_sort_order ?? 0),
    task,
  )
  const phaseSource: TaskSummaryAttributionSource =
    task.phase_object_id ? 'engineering_object' : 'invalid_unassigned'
  addAttributionBucket(
    buckets,
    'phase',
    phaseSource,
    task.phase_object_id ?? null,
    normalizeText(task.phase_name) || getUnassignedLabel('phase'),
    Number(task.phase_sort_order ?? 0),
    task,
  )
  const sectionSource: TaskSummaryAttributionSource =
    (task as any).section_object_id ? 'engineering_object' :
    'invalid_unassigned'
  addAttributionBucket(
    buckets,
    'section',
    sectionSource,
    (task as any).section_object_id ?? null,
    normalizeText((task as any).section_name) || getUnassignedLabel('section'),
    0,
    task,
  )
  const floorSource: TaskSummaryAttributionSource =
    (task as any).floor_object_id ? 'engineering_object' :
    'invalid_unassigned'
  addAttributionBucket(
    buckets,
    'floor',
    floorSource,
    (task as any).floor_object_id ?? null,
    normalizeText((task as any).floor_name) || getUnassignedLabel('floor'),
    0,
    task,
  )
  addAttributionBucket(
    buckets,
    'participant_unit',
    task.participant_unit_id ? 'participant_unit' : 'unassigned',
    task.participant_unit_id ?? null,
    normalizeText(task.participant_unit_name) || (task.participant_unit_id ? '责任单位待确认' : getUnassignedLabel('participant_unit')),
    0,
    task,
  )
  addAttributionBucket(
    buckets,
    'assignee',
    task.assignee_user_id ? 'project_member' : 'unassigned',
    task.assignee_user_id ?? null,
    normalizeText(task.assignee) || (task.assignee_user_id ? '责任人待确认' : getUnassignedLabel('assignee')),
    0,
    task,
  )
}

function buildAttributionBuckets(tasks: TaskSummaryAttributionTask[]) {
  const buckets = new Map<string, AttributionBucket>()
  for (const task of tasks) {
    if (!normalizeText(task.id)) continue
    addTaskToAttributionBuckets(buckets, task)
  }
  return Array.from(buckets.values())
}

function sortAttributionGroups(left: TaskSummaryAttributionGroup, right: TaskSummaryAttributionGroup) {
  const leftOrder = TASK_SUMMARY_ATTRIBUTION_DIMENSIONS.findIndex((item) => item.value === left.dimension)
  const rightOrder = TASK_SUMMARY_ATTRIBUTION_DIMENSIONS.findIndex((item) => item.value === right.dimension)
  if (leftOrder !== rightOrder) return leftOrder - rightOrder
  const leftUnassigned = left.source === 'unassigned' || left.source === 'invalid_unassigned'
  const rightUnassigned = right.source === 'unassigned' || right.source === 'invalid_unassigned'
  if (leftUnassigned && !rightUnassigned) return 1
  if (!leftUnassigned && rightUnassigned) return -1
  if (left.sortOrder !== right.sortOrder) return left.sortOrder - right.sortOrder
  if (left.taskCount !== right.taskCount) return right.taskCount - left.taskCount
  return left.value.localeCompare(right.value, 'zh-CN')
}

export function buildTaskSummaryAttributionGroups(
  tasks: TaskSummaryAttributionTask[],
  calendar?: ConstructionCalendarContext | null,
): TaskSummaryAttributionGroup[] {
  return buildAttributionBuckets(tasks.filter(isCompletedAttributionTask))
    .map(({ meta, rows }) => ({
      ...meta,
      taskIds: rows.map((row) => String(row.id)),
      taskCount: rows.length,
      onTimeCount: rows.filter((row) => !isDelayedAttributionTask(row, calendar)).length,
      // eslint-disable-next-line -- summary-service-aggregation-approved; ssot: service-owned-summary
      delayedCount: rows.filter((row) => isDelayedAttributionTask(row, calendar)).length,
      recentCompletedAt: getRecentCompletedAt(rows),
    }))
    .filter((group) => group.taskCount > 0)
    .sort(sortAttributionGroups)
}

export function createEmptyAttributionTotalsMap(): TaskSummaryAttributionTotalsMap {
  // eslint-disable-next-line -- summary-service-aggregation-approved; ssot: service-owned-summary
  return TASK_SUMMARY_ATTRIBUTION_DIMENSIONS.reduce((totals, item) => {
    totals[item.value] = {}
    return totals
  }, {} as TaskSummaryAttributionTotalsMap)
}

export function buildTaskSummaryAttributionTotals(
  tasks: TaskSummaryAttributionTask[],
  calendar?: ConstructionCalendarContext | null,
): TaskSummaryAttributionTotalsMap {
  const totals = createEmptyAttributionTotalsMap()

  for (const { meta, rows } of buildAttributionBuckets(tasks)) {
    const completedRows = rows.filter(isCompletedAttributionTask)
    const delayedRows = completedRows.filter((row) => isDelayedAttributionTask(row, calendar))
    const onTimeCount = completedRows.length - delayedRows.length
    const onTimeRate = getRate(onTimeCount, completedRows.length)
    // eslint-disable-next-line -- summary-service-aggregation-approved; ssot: service-owned-summary
    const delayDaysTotal = delayedRows.reduce((sum, row) => sum + getAttributionDelayDays(row, calendar), 0)
    // eslint-disable-next-line -- summary-service-aggregation-approved; ssot: service-owned-summary
    const maxDelayDays = delayedRows.reduce((max, row) => Math.max(max, getAttributionDelayDays(row, calendar)), 0)

    totals[meta.dimension][meta.id] = {
      total: rows.length,
      completed: completedRows.length,
      on_time: onTimeCount,
      delayed: delayedRows.length,
      on_time_rate: onTimeRate,
      completion_rate: getRate(completedRows.length, rows.length),
      max_delay_days: maxDelayDays,
      avg_delay_days: delayedRows.length > 0 ? Math.round((delayDaysTotal / delayedRows.length) * 10) / 10 : 0,
      recent_completed_at: getRecentCompletedAt(completedRows),
      health_level: getHealthLevel(onTimeRate),
    }
  }

  return totals
}

export class TaskAttributionSummaryService {
  async getAttributionTotals(
    projectId: string,
    tasks: TaskSummaryAttributionTask[] = [],
  ): Promise<TaskSummaryAttributionTotalsMap> {
    const calendar = await resolveConstructionCalendarContext({ projectId })
    return buildTaskSummaryAttributionTotals(tasks, calendar)
  }
}

export const taskAttributionSummaryService = new TaskAttributionSummaryService()
