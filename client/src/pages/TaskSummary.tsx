import { useCallback, useEffect, useMemo, useState, type KeyboardEvent } from 'react'
import { useParams } from 'react-router-dom'

import { Breadcrumb } from '@/components/Breadcrumb'
import { EmptyState } from '@/components/EmptyState'
import { V14231PageReadinessBoundary } from '@/components/governance/V14231PageReadinessBoundary'
import { DurationBasisBadge } from '@/components/planning/DurationBasisBadge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { LoadingState } from '@/components/ui/loading-state'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useCurrentProject } from '@/hooks/useStore'
import { toast } from '@/hooks/use-toast'
import { apiGet, getApiErrorMessage, isAbortError } from '@/lib/apiClient'
import {
  formatDurationMetric,
  readAvailableDurationValue,
  type DurationMetricDto,
} from '@/lib/durationMetric'
import { cn, formatDate } from '@/lib/utils'
import {
  Building2,
  CheckSquare,
  ChevronRight,
  Download,
  Layers,
  Layers3,
  MapPin,
  RefreshCw,
  Search,
  User,
  Users,
  Wrench,
  X,
  type LucideIcon,
} from 'lucide-react'

import TaskSummaryResultsSection from './TaskSummary/components/TaskSummaryResultsSection'

type ProjectSummaryStats = {
  total_completed: number
  on_time_count: number
  delayed_count: number
  completed_milestone_count: number
  avg_delay?: DurationMetricDto | null
}

type TaskSummaryDelayRecord = {
  delay?: DurationMetricDto | null
  reason?: string | null
  recorded_at?: string | null
}

type TaskSummaryTaskRow = {
  id: string
  title: string
  assignee?: string | null
  assignee_user_id?: string | null
  participant_unit_name?: string | null
  participant_unit_id?: string | null
  planned_end_date?: string | null
  completed_at?: string | null
  actual_duration?: number | null
  planned_duration?: number | null
  actual_duration_metric?: DurationMetricDto | null
  planned_duration_metric?: DurationMetricDto | null
  status_label?: string | null
  delay_total?: DurationMetricDto | null
  delay_records?: TaskSummaryDelayRecord[]
  specialty_id?: string | null
  specialty_type?: string | null
  specialty_name?: string | null
  division_id?: string | null
  division_name?: string | null
  subdivision_id?: string | null
  subdivision_name?: string | null
  building_id?: string | null
  building_name?: string | null
  region_id?: string | null
  region_name?: string | null
  wbs_code?: string | null
  wbs_level?: number | null
  parent_id?: string | null
}

type TaskSummaryGroup = {
  id: string
  name: string
  status?: string | null
  completed_at?: string | null
  planned_end_date?: string | null
  tasks: TaskSummaryTaskRow[]
}

type TaskTimelineEventKind = 'task' | 'milestone' | 'condition' | 'obstacle'

type TaskTimelineEvent = {
  id: string
  kind: TaskTimelineEventKind
  title: string
  description: string
  occurredAt: string
  taskId?: string
  statusLabel?: string
}

type TaskSummaryPayload = {
  stats?: ProjectSummaryStats | null
  groups?: TaskSummaryGroup[]
  attribution_groups?: TaskAttributionOption[]
  attribution_totals?: AttributionTotalsMap
  timeline_events?: TaskTimelineEvent[]
  timeline_ready?: boolean
}

type TaskSummaryTrendRow = {
  month: string
  total: number
  on_time: number
  delayed: number
}

type ScopedDurationForecastDimension = 'division' | 'subdivision' | 'specialty'
type ScopedDurationForecastDataStatus = 'ready' | 'degraded' | 'insufficient_data'

type ScopedDurationForecastGroup = {
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
  confidenceLevel: string | null
  confidenceScore: number | null
  forecastCoverageRate: number
  probabilityCoverageRate: number
  forecastState: 'not_started' | 'in_progress' | 'completed'
  dataStatus: ScopedDurationForecastDataStatus
  degradationReasons: string[]
  governingTaskIds: string[]
}

type ScopedDurationForecastResponse = {
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

type TaskSummaryLedgerRow = TaskSummaryTaskRow & {
  groupId: string
  groupName: string
}

type NarrativeSegment = { text: string; className?: string }

type TaskAttributionDimension =
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

type TaskAttributionOption = {
  id: string
  dimension: TaskAttributionDimension
  dimensionLabel: string
  value: string
  source?: 'wbs' | 'engineering_object' | 'business_label' | 'participant_unit' | 'project_member' | 'invalid_unassigned' | 'unassigned'
  sourceId?: string | null
  taskIds: string[]
  taskCount: number
  onTimeCount: number
  delayedCount: number
  recentCompletedAt: string | null
  sortOrder?: number
}

type AttributionHealthLevel = 'healthy' | 'warning' | 'critical'

type AttributionTotal = {
  total: number
  completed: number
  on_time: number
  delayed: number
  on_time_rate: number
  completion_rate: number
  max_delay: DurationMetricDto
  avg_delay: DurationMetricDto
  recent_completed_at: string | null
  health_level: AttributionHealthLevel
}

type AttributionTotalsMap = Partial<Record<TaskAttributionDimension, Record<string, AttributionTotal>>>

type ProcessEvent = {
  id: string
  kind: TaskTimelineEventKind
  label: string
  title: string
  description: string
  occurredAt: string
  statusLabel?: string
}

type AttributionProcessEvent = ProcessEvent & {
  taskId: string
  taskTitle: string
}

type TaskAttributionProcessStage = {
  id: string
  kind: 'condition' | 'obstacle' | 'execution' | 'closeout'
  label: string
  dateStart: string | null
  dateEnd: string | null
  eventCount: number
  taskCount: number
  representativeTasks: string[]
  description: string
}

type TaskAttributionSummary = {
  option: TaskAttributionOption
  rows: TaskSummaryLedgerRow[]
  totalTaskCount: number
  completedCount: number
  onTimeCount: number
  delayedCount: number
  onTimeRate: number
  completionRate: number
  maxDelay: DurationMetricDto | null
  avgDelay: DurationMetricDto | null
  healthLevel: AttributionHealthLevel
  recentCompletedAt: string | null
  mainDelayedTask: TaskSummaryLedgerRow | null
  conditionEventCount: number
  obstacleEventCount: number
  processEvents: AttributionProcessEvent[]
  stages: TaskAttributionProcessStage[]
  conclusion: string
}

const DEFAULT_TASK_ATTRIBUTION_DIMENSION: TaskAttributionDimension = 'division'
const SCOPED_FORECAST_DIMENSIONS = new Set<TaskAttributionDimension>(['division', 'subdivision', 'specialty'])

const TASK_ATTRIBUTION_DIMENSIONS: Array<{ value: TaskAttributionDimension; label: string }> = [
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

const TASK_ATTRIBUTION_FOOTER_LABEL: Record<TaskAttributionDimension, string> = {
  division: '个分部工程',
  subdivision: '个分项工程',
  specialty: '个专项工程',
  building: '个楼栋',
  region: '个施工区域',
  phase: '个分期',
  section: '个标段',
  floor: '个楼层',
  participant_unit: '家责任单位',
  assignee: '名责任人',
}

const SCOPED_FORECAST_REASON_LABELS: Record<string, string> = {
  missing_current_forecast: '当前任务预测缺失',
  planned_finish_fallback: '使用计划完成日期降级',
  missing_probability_window: '概率区间不完整',
  missing_usable_finish: '缺少可用完成日期',
  unresolved_boundary_predecessor: '跨组前置时点未解析',
  duration_band_reordered: '概率带顺序已校正',
  task_forecasts_unavailable: '当前预测读取失败',
  critical_path_unavailable: '关键路径读取失败',
  construction_calendar_unavailable: '施工日历读取失败',
  construction_calendar_fallback: '使用自然日历降级',
  missing_division_attribution: '分部归属缺失',
  missing_subdivision_attribution: '分项归属缺失',
  missing_specialty_attribution: '专项归属缺失',
  specialty_business_label_fallback: '专项采用业务标签归属',
  wbs_parent_cycle: 'WBS 父子链存在循环',
}

const compactTabClass =
  'relative rounded-none bg-transparent px-0 pb-2 pt-0 text-xs text-slate-500 shadow-none transition-colors after:absolute after:inset-x-0 after:-bottom-px after:h-[2px] after:rounded-full after:bg-transparent hover:text-slate-700 data-[state=active]:bg-transparent data-[state=active]:text-blue-600 data-[state=active]:shadow-none data-[state=active]:after:bg-blue-600'

const TASK_ATTRIBUTION_ICON_MAP: Record<TaskAttributionDimension, LucideIcon> = {
  division: Layers3,
  subdivision: Layers,
  specialty: Wrench,
  building: Building2,
  region: MapPin,
  phase: Layers3,
  section: Layers,
  floor: Building2,
  participant_unit: Users,
  assignee: User,
}

async function fetchTaskSummarySection<T>(url: string, signal?: AbortSignal): Promise<T> {
  return apiGet<T>(url, { signal })
}

function escapeCsvCell(value: string | number | boolean | null | undefined) {
  const normalized = String(value ?? '')
  if (!/[",\n]/.test(normalized)) return normalized
  return `"${normalized.replace(/"/g, '""')}"`
}

function renderNarrative(segments: NarrativeSegment[]) {
  return segments.map((segment, index) => (
    <span key={`${segment.text}-${index}`} className={segment.className}>
      {segment.text}
    </span>
  ))
}

function getDateOnly(value?: string | null) {
  const normalized = String(value ?? '').slice(0, 10)
  return normalized || null
}

function getDateTime(value?: string | null) {
  const dateOnly = getDateOnly(value)
  if (!dateOnly) return 0
  const time = new Date(`${dateOnly}T00:00:00`).getTime()
  return Number.isFinite(time) ? time : 0
}

function formatDateLabel(value?: string | null) {
  const date = getDateOnly(value)
  return date ? formatDate(date) : '待补齐'
}

function formatDateRangeLabel(start?: string | null, end?: string | null) {
  const startDate = getDateOnly(start)
  const endDate = getDateOnly(end)
  if (!startDate && !endDate) return '时间待补齐'
  if (startDate && endDate && startDate !== endDate) return `${formatDate(startDate)} - ${formatDate(endDate)}`
  return formatDateLabel(startDate || endDate)
}

function isScopedForecastDimension(
  dimension: TaskAttributionDimension,
): dimension is ScopedDurationForecastDimension {
  return SCOPED_FORECAST_DIMENSIONS.has(dimension)
}

function formatScopedForecastDate(value?: string | null) {
  const date = getDateOnly(value)
  return date ? formatDate(date) : '待补齐'
}

function formatScopedForecastRate(value: number) {
  return `${Math.round(Math.max(0, Math.min(1, Number(value) || 0)) * 100)}%`
}

function getScopedForecastStatusMeta(status: ScopedDurationForecastDataStatus) {
  if (status === 'ready') {
    return { label: '数据就绪', className: 'bg-emerald-50 text-emerald-700 ring-emerald-200' }
  }
  if (status === 'degraded') {
    return { label: '数据降级', className: 'bg-amber-50 text-amber-700 ring-amber-200' }
  }
  return { label: '数据不足', className: 'bg-rose-50 text-rose-700 ring-rose-200' }
}

function getScopedForecastConfidenceLabel(level?: string | null) {
  const normalized = String(level ?? '').trim().toLowerCase()
  if (normalized === 'high') return '高'
  if (normalized === 'medium') return '中'
  if (normalized === 'low') return '低'
  return level || '待补齐'
}

function getScopedForecastReasonLabel(reason: string) {
  return SCOPED_FORECAST_REASON_LABELS[reason] ?? reason
}

function buildForecastAttributionOption(group: ScopedDurationForecastGroup): TaskAttributionOption {
  const dimensionLabel = TASK_ATTRIBUTION_DIMENSIONS.find((item) => item.value === group.dimension)?.label ?? '工程归属'
  return {
    id: group.id,
    dimension: group.dimension,
    dimensionLabel,
    value: group.name,
    source: group.sourceId ? (group.dimension === 'specialty' ? 'business_label' : 'wbs') : 'unassigned',
    sourceId: group.sourceId,
    taskIds: group.taskIds,
    taskCount: group.taskCount,
    onTimeCount: 0,
    delayedCount: 0,
    recentCompletedAt: null,
    sortOrder: group.sortOrder,
  }
}

function isTaskDelayed(task: TaskSummaryTaskRow) {
  const delayValue = readAvailableDurationValue(task.delay_total, 'construction_production_day')
  const statusToken = String(task.status_label ?? '').toLowerCase()
  if ((delayValue ?? 0) > 0 || /(delay|overdue|延期|逾期)/.test(statusToken)) return true
  const plannedEnd = getDateOnly(task.planned_end_date)
  const completedAt = getDateOnly(task.completed_at)
  return Boolean(plannedEnd && completedAt && completedAt > plannedEnd)
}

function isTaskOnTime(task: TaskSummaryTaskRow) {
  const statusToken = String(task.status_label ?? '').toLowerCase()
  if (isTaskDelayed(task)) return false
  if (/(on_time|按时)/.test(statusToken)) return true
  const plannedEnd = getDateOnly(task.planned_end_date)
  const completedAt = getDateOnly(task.completed_at)
  return Boolean(plannedEnd && completedAt && completedAt <= plannedEnd)
}

function getTaskDelayValue(task: TaskSummaryTaskRow) {
  const value = readAvailableDurationValue(task.delay_total, 'construction_production_day')
  return value === null ? null : Math.max(value, 0)
}

function isCompletedInCurrentMonth(task: TaskSummaryTaskRow) {
  const completedAt = getDateOnly(task.completed_at)
  if (!completedAt) return false
  const currentMonth = new Date().toISOString().slice(0, 7)
  return completedAt.slice(0, 7) === currentMonth
}

function appendAssigneeHint(task: TaskSummaryTaskRow, segments: NarrativeSegment[]) {
  if (task.assignee) return segments
  return [
    ...segments,
    { text: ' · ' },
    { text: '责任人待确认', className: 'text-slate-400' },
  ]
}

function getTaskCompletionNarrative(task: TaskSummaryTaskRow): NarrativeSegment[] {
  const delayValue = getTaskDelayValue(task)
  const completedAt = getDateOnly(task.completed_at)
  const plannedEnd = getDateOnly(task.planned_end_date)
  const completedLabel = completedAt ? formatDate(completedAt) : ''
  const plannedLabel = plannedEnd ? formatDate(plannedEnd) : ''

  if (delayValue !== null && delayValue > 0) {
    const delayLabel = formatDurationMetric(task.delay_total, { absolute: true })
    const base = completedAt
      ? [
          { text: '完成 ' },
          { text: completedLabel, className: 'num-mono text-slate-600 font-medium' },
          { text: ' · ' },
          { text: `延期 ${delayLabel}`, className: 'text-red-600 font-medium' },
        ]
      : [
          { text: `延期 ${delayLabel}`, className: 'text-red-600 font-medium' },
          { text: ' · ' },
          { text: '完成时间待补齐', className: 'text-slate-400' },
        ]
    return appendAssigneeHint(task, base)
  }

  if (plannedEnd && completedAt) {
    const datePart: NarrativeSegment[] = [
      { text: '完成 ' },
      { text: completedLabel, className: 'num-mono text-slate-600 font-medium' },
      { text: ' · ' },
    ]
    if (completedAt === plannedEnd) return appendAssigneeHint(task, [...datePart, { text: '按时完成', className: 'text-emerald-600 font-medium' }])
    if (completedAt > plannedEnd) return appendAssigneeHint(task, [...datePart, { text: '晚于计划完成', className: 'text-red-600 font-medium' }])
    return appendAssigneeHint(task, [...datePart, { text: '早于计划完成', className: 'text-emerald-600 font-medium' }])
  }

  if (completedAt && !plannedEnd) {
    return appendAssigneeHint(task, [
      { text: '完成 ' },
      { text: completedLabel, className: 'num-mono text-slate-600 font-medium' },
      { text: ' · ' },
      { text: '计划截止待补齐', className: 'text-slate-400' },
    ])
  }

  if (!completedAt && plannedEnd) {
    return appendAssigneeHint(task, [
      { text: '完成时间待补齐', className: 'text-slate-400' },
      { text: ' · 截止 ' },
      { text: plannedLabel, className: 'num-mono text-slate-600 font-medium' },
    ])
  }

  if (!task.assignee) return [{ text: '责任人待确认', className: 'text-slate-400' }]
  return [{ text: '完成信息待补齐', className: 'text-slate-400' }]
}

function flattenTaskSummaryRows(groups: TaskSummaryGroup[]) {
  const rowMap = new Map<string, TaskSummaryLedgerRow>()

  for (const group of groups) {
    for (const task of group.tasks ?? []) {
      if (!task.id || rowMap.has(task.id)) continue
      rowMap.set(task.id, {
        ...task,
        groupId: group.id,
        groupName: group.name,
      })
    }
  }

  return Array.from(rowMap.values()).sort((left, right) => {
    const rightTime = getDateTime(right.completed_at) || getDateTime(right.planned_end_date)
    const leftTime = getDateTime(left.completed_at) || getDateTime(left.planned_end_date)
    return rightTime - leftTime
  })
}

function filterAttributionOptions(
  options: TaskAttributionOption[],
  rows: TaskSummaryLedgerRow[],
  dimension: TaskAttributionDimension,
  keyword: string,
) {
  const normalized = keyword.trim().toLowerCase()
  return options
    .filter((option) => option.dimension === dimension)
    .filter((option) => {
      if (!normalized) return true
      if ([
        option.dimensionLabel,
        option.value,
        `${option.taskCount}`,
        `${option.onTimeCount}`,
        `${option.delayedCount}`,
        option.recentCompletedAt,
      ].some((value) => String(value ?? '').toLowerCase().includes(normalized))) {
        return true
      }
      return getAttributionRows(rows, option).some((row) => [
        row.title,
        row.assignee,
        row.participant_unit_name,
        row.status_label,
        row.completed_at,
        row.planned_end_date,
      ].map((value) => String(value ?? '').toLowerCase()).some((value) => value.includes(normalized)))
    })
}

function getAttributionRows(rows: TaskSummaryLedgerRow[], option: TaskAttributionOption) {
  const taskIds = new Set(option.taskIds ?? [])
  return rows.filter((row) => taskIds.has(row.id))
}

function getTaskAssigneeLabel(task: TaskSummaryTaskRow) {
  return task.assignee || '责任人待确认'
}

function getTaskAssigneeUnitLabel(task: TaskSummaryTaskRow) {
  return task.participant_unit_name || '责任单位待确认'
}

function getProcessEventTone(kind: TaskTimelineEventKind) {
  switch (kind) {
    case 'condition':
      return 'bg-blue-50 text-blue-700 ring-blue-100'
    case 'obstacle':
      return 'bg-red-50 text-red-700 ring-red-100'
    case 'milestone':
      return 'bg-amber-50 text-amber-700 ring-amber-100'
    case 'task':
    default:
      return 'bg-slate-50 text-slate-700 ring-slate-200/70'
  }
}

function getProcessEventLabel(kind: TaskTimelineEventKind) {
  switch (kind) {
    case 'condition':
      return '开工条件'
    case 'obstacle':
      return '阻碍处理'
    case 'milestone':
      return '关键节点'
    case 'task':
    default:
      return '过程推进'
  }
}

function getDelayReasonSummary(task: TaskSummaryTaskRow) {
  const reasons = (task.delay_records ?? [])
    .map((record) => String(record.reason ?? '').trim())
    .filter(Boolean)
  if (reasons.length > 0) return reasons.slice(0, 2).join('；')
  return isTaskDelayed(task) ? '延期原因待补齐' : ''
}

function getTaskProcessEvents(task: TaskSummaryTaskRow, timelineEvents: TaskTimelineEvent[]): ProcessEvent[] {
  const events: ProcessEvent[] = timelineEvents
    .filter((event) => event.taskId === task.id)
    .map((event) => ({
      id: event.id,
      kind: event.kind,
      label: getProcessEventLabel(event.kind),
      title: String(event.title ?? '').trim() || getProcessEventLabel(event.kind),
      description: String(event.description ?? '').trim() || '过程说明待补齐',
      occurredAt: event.occurredAt,
      statusLabel: event.statusLabel,
    }))

  for (const [index, record] of (task.delay_records ?? []).entries()) {
    const delayValue = readAvailableDurationValue(record.delay, 'construction_production_day')
    events.push({
      id: `${task.id}-delay-${index}`,
      kind: 'obstacle',
      label: getProcessEventLabel('obstacle'),
      title: '延期记录',
      description: String(record.reason ?? '').trim() || '延期原因待补齐',
      occurredAt: record.recorded_at || task.completed_at || task.planned_end_date || '',
      statusLabel: delayValue !== null && delayValue > 0
        ? `延期 ${formatDurationMetric(record.delay, { absolute: true })}`
        : '延期记录 · 生产日口径不可用',
    })
  }

  if (task.planned_end_date) {
    events.push({
      id: `${task.id}-planned-end`,
      kind: 'task',
      label: getProcessEventLabel('task'),
      title: '计划完成节点',
      description: `计划完成时间 ${formatDateLabel(task.planned_end_date)}`,
      occurredAt: task.planned_end_date,
      statusLabel: '计划完成',
    })
  }

  if (task.completed_at) {
    events.push({
      id: `${task.id}-completed`,
      kind: 'task',
      label: getProcessEventLabel('task'),
      title: '实际完成',
      description: isTaskDelayed(task) ? '已完成，纳入延期完成台账' : '已完成，纳入按时完成台账',
      occurredAt: task.completed_at,
      statusLabel: isTaskDelayed(task) ? '延期完成' : '按时完成',
    })
  }

  const unique = new Map(events.filter((event) => getDateOnly(event.occurredAt)).map((event) => [event.id, event]))
  return Array.from(unique.values()).sort((left, right) => getDateTime(left.occurredAt) - getDateTime(right.occurredAt))
}

function groupProcessEventsByDate(events: ProcessEvent[]) {
  const groups = new Map<string, ProcessEvent[]>()
  for (const event of events) {
    const date = getDateOnly(event.occurredAt)
    if (!date) continue
    const items = groups.get(date) ?? []
    items.push(event)
    groups.set(date, items)
  }
  return Array.from(groups.entries()).map(([date, items]) => ({ date, items }))
}

function getTaskProcessConclusion(task: TaskSummaryTaskRow, processEvents: ProcessEvent[]) {
  const hasConditionChange = processEvents.some((event) => event.kind === 'condition')
  const hasObstacleChange = processEvents.some((event) => event.kind === 'obstacle')
  const resultText = isTaskDelayed(task)
    ? `实际完成较计划延期 ${formatDurationMetric(task.delay_total, { absolute: true })}`
    : '实际完成满足计划要求'

  if (hasConditionChange && hasObstacleChange) {
    return `过程记录包含开工条件确认和阻碍处理，${resultText}。`
  }
  if (hasConditionChange) {
    return `过程记录包含开工条件确认，${resultText}。`
  }
  if (hasObstacleChange) {
    return `过程记录包含阻碍处理，${resultText}。`
  }
  return `过程记录待补齐，当前仅确认${resultText}。`
}

function uniqueTaskTitles(events: AttributionProcessEvent[], fallbackRows: TaskSummaryLedgerRow[] = []) {
  const titles = events.map((event) => event.taskTitle).filter(Boolean)
  if (titles.length === 0) titles.push(...fallbackRows.map((row) => row.title).filter(Boolean))
  return [...new Set(titles)].slice(0, 3)
}

function buildAttributionStage(
  kind: TaskAttributionProcessStage['kind'],
  label: string,
  events: AttributionProcessEvent[],
  rows: TaskSummaryLedgerRow[],
): TaskAttributionProcessStage | null {
  if (events.length === 0) return null

  const dates = events
    .map((event) => getDateOnly(event.occurredAt))
    .filter((date): date is string => Boolean(date))
    .sort((left, right) => getDateTime(left) - getDateTime(right))
  const dateStart = dates[0] ?? null
  const dateEnd = dates[dates.length - 1] ?? null
  // eslint-disable-next-line -- frontend-bi-aggregation-approved
  const taskCount = new Set(events.map((event) => event.taskId)).size || rows.length
  const representativeTasks = uniqueTaskTitles(events, rows)
  const taskText = representativeTasks.length > 0 ? `代表任务：${representativeTasks.join('、')}` : '代表任务待补齐'
  const rangeText = formatDateRangeLabel(dateStart, dateEnd)

  const description = (() => {
    if (kind === 'condition') return `${taskCount} 项任务的开工条件在 ${rangeText} 形成或补齐，${taskText}。`
    if (kind === 'obstacle') return `${events.length} 条阻碍或延期记录在 ${rangeText} 被记录或处理，${taskText}。`
    if (kind === 'execution') return `${taskCount} 项任务在 ${rangeText} 留有过程推进记录，${taskText}。`
    return `${rows.length} 项任务在 ${rangeText} 完成收口，${taskText}。`
  })()

  return {
    id: kind,
    kind,
    label,
    dateStart,
    dateEnd,
    eventCount: events.length,
    taskCount,
    representativeTasks,
    description,
  }
}

function getAttributionProcessStages(rows: TaskSummaryLedgerRow[], processEvents: AttributionProcessEvent[]) {
  const conditionEvents = processEvents.filter((event) => event.kind === 'condition')
  const obstacleEvents = processEvents.filter((event) => event.kind === 'obstacle')
  const executionEvents = processEvents.filter((event) => (
    (event.kind === 'task' || event.kind === 'milestone') && event.title !== '实际完成'
  ))
  const closeoutEvents: AttributionProcessEvent[] = rows
    .filter((row) => getDateOnly(row.completed_at))
    .map((row) => ({
      id: `${row.id}-attribution-closeout`,
      kind: 'task',
      label: '完成收口',
      title: '实际完成',
      description: isTaskDelayed(row) ? '纳入延期完成台账' : '纳入按时完成台账',
      occurredAt: row.completed_at || '',
      statusLabel: isTaskDelayed(row) ? '延期完成' : '按时完成',
      taskId: row.id,
      taskTitle: row.title,
    }))

  return [
    buildAttributionStage('condition', '开工条件形成', conditionEvents, rows),
    buildAttributionStage('obstacle', '阻碍演变', obstacleEvents, rows),
    buildAttributionStage('execution', '过程推进', executionEvents, rows),
    buildAttributionStage('closeout', '完成收口', closeoutEvents, rows),
  ].filter((stage): stage is TaskAttributionProcessStage => Boolean(stage))
}

function getAttributionProcessConclusion(summary: Omit<TaskAttributionSummary, 'conclusion'>) {
  const base = `${summary.option.dimensionLabel}「${summary.option.value}」共完成 ${summary.completedCount} 项任务，${summary.onTimeCount} 项按时、${summary.delayedCount} 项延期`
  if (summary.conditionEventCount > 0 && summary.obstacleEventCount > 0) {
    return `${base}；过程包含开工条件形成、阻碍处理和最终收口。`
  }
  if (summary.conditionEventCount > 0) {
    return `${base}；过程记录体现开工条件陆续形成，最终完成收口。`
  }
  if (summary.obstacleEventCount > 0) {
    return `${base}；过程记录体现阻碍处理和完成收口。`
  }
  return `${base}；当前以完成事实为主，过程记录仍待补齐。`
}

function buildAttributionSummary(
  option: TaskAttributionOption,
  rows: TaskSummaryLedgerRow[],
  timelineEvents: TaskTimelineEvent[],
  attributionTotals: AttributionTotalsMap,
): TaskAttributionSummary {
  const scopedRows = getAttributionRows(rows, option)
  const total = attributionTotals[option.dimension]?.[option.id]
  const processEvents: AttributionProcessEvent[] = scopedRows.flatMap((row) =>
    getTaskProcessEvents(row, timelineEvents).map((event) => ({
      ...event,
      taskId: row.id,
      taskTitle: row.title,
    })),
  )
  const recentCompletedAt = scopedRows
    .map((row) => getDateOnly(row.completed_at))
    .filter((date): date is string => Boolean(date))
    .sort((left, right) => getDateTime(right) - getDateTime(left))[0] ?? null
  const mainDelayedTask = scopedRows
    .filter(isTaskDelayed)
    .sort((left, right) => (getTaskDelayValue(right) ?? -1) - (getTaskDelayValue(left) ?? -1))[0] ?? null
  const stages = getAttributionProcessStages(scopedRows, processEvents)
  const completedCount = total?.completed ?? scopedRows.length
  const onTimeCount = total?.on_time ?? scopedRows.filter(isTaskOnTime).length
  // eslint-disable-next-line -- frontend-bi-aggregation-approved
  const delayedCount = total?.delayed ?? scopedRows.filter(isTaskDelayed).length
  const totalTaskCount = total?.total ?? option.taskCount ?? scopedRows.length
  const fallbackHealthLevel: AttributionHealthLevel = completedCount === 0
    ? 'warning'
    : onTimeCount === completedCount
      ? 'healthy'
      : delayedCount > completedCount / 2
        ? 'critical'
        : 'warning'
  const summaryWithoutConclusion = {
    option,
    rows: scopedRows,
    totalTaskCount,
    completedCount,
    onTimeCount,
    delayedCount,
    onTimeRate: total?.on_time_rate ?? (completedCount > 0 ? Math.round((onTimeCount / completedCount) * 100) : 0),
    completionRate: total?.completion_rate ?? (totalTaskCount > 0 ? Math.round((completedCount / totalTaskCount) * 100) : 0),
    maxDelay: total?.max_delay ?? mainDelayedTask?.delay_total ?? null,
    avgDelay: total?.avg_delay ?? null,
    healthLevel: total?.health_level ?? fallbackHealthLevel,
    recentCompletedAt: total?.recent_completed_at ?? recentCompletedAt,
    mainDelayedTask,
    // eslint-disable-next-line -- frontend-bi-aggregation-approved
    conditionEventCount: processEvents.filter((event) => event.kind === 'condition').length,
    // eslint-disable-next-line -- frontend-bi-aggregation-approved
    obstacleEventCount: processEvents.filter((event) => event.kind === 'obstacle').length,
    processEvents,
    stages,
  }

  return {
    ...summaryWithoutConclusion,
    conclusion: getAttributionProcessConclusion(summaryWithoutConclusion),
  }
}

function getLedgerSummary(rows: TaskSummaryLedgerRow[]) {
  const delayedRows = rows.filter(isTaskDelayed)

  return {
    total: rows.length,
    onTime: rows.filter(isTaskOnTime).length,
    delayed: delayedRows.length,
  }
}

function getAttributionLedgerSummary(summaries: TaskAttributionSummary[]) {
  // eslint-disable-next-line -- frontend-bi-aggregation-approved
  const delayedCount = summaries.reduce((sum, summary) => sum + summary.delayedCount, 0)
  return {
    total: summaries.length,
    // eslint-disable-next-line -- frontend-bi-aggregation-approved
    taskCount: summaries.reduce((sum, summary) => sum + summary.totalTaskCount, 0),
    // eslint-disable-next-line -- frontend-bi-aggregation-approved
    completed: summaries.reduce((sum, summary) => sum + summary.completedCount, 0),
    // eslint-disable-next-line -- frontend-bi-aggregation-approved
    onTime: summaries.reduce((sum, summary) => sum + summary.onTimeCount, 0),
    delayed: delayedCount,
  }
}

function getAttributionRowConclusion(option: TaskAttributionOption) {
  if (option.taskCount === 0) return '暂无完成任务'
  if (option.delayedCount > 0) {
    return `${option.dimensionLabel}「${option.value}」已完成 ${option.taskCount} 项，延期 ${option.delayedCount} 项，最近完成 ${formatDateLabel(option.recentCompletedAt)}。`
  }
  return `${option.dimensionLabel}「${option.value}」已完成 ${option.taskCount} 项，全部按时，最近完成 ${formatDateLabel(option.recentCompletedAt)}。`
}

function getAttributionHealthTone(level: AttributionHealthLevel) {
  switch (level) {
    case 'healthy':
      return {
        border: 'border-l-emerald-500',
        text: 'text-emerald-700',
      }
    case 'warning':
      return {
        border: 'border-l-amber-500',
        text: 'text-amber-700',
      }
    case 'critical':
    default:
      return {
        border: 'border-l-rose-500',
        text: 'text-rose-700',
      }
  }
}

function getAttributionNarrative(summary: TaskAttributionSummary): NarrativeSegment[] {
  const latest = formatDateLabel(summary.recentCompletedAt)
  const segments: NarrativeSegment[] = []

  if (summary.completedCount === 0) {
    return [
      { text: '尚无完成任务，', className: 'text-slate-500' },
      { text: `当前预测范围 ${summary.totalTaskCount} 项。`, className: 'text-slate-700' },
    ]
  }

  if (summary.delayedCount > 0) {
    segments.push({
      text: `延期 ${summary.delayedCount} 项（最大 ${formatDurationMetric(summary.maxDelay, { absolute: true })}），`,
      className: 'text-rose-600',
    })
  } else {
    segments.push({ text: '全部按时完成，', className: 'text-emerald-600' })
  }

  segments.push({ text: '最近完成 ' })
  segments.push({ text: latest, className: 'num-mono text-slate-700' })
  segments.push({ text: '。' })
  return segments
}

function TaskSummaryPageTitle({
  projectName,
  projectId,
  refreshing,
  exportDisabled,
  onRefresh,
  onExport,
}: {
  projectName: string
  projectId: string
  refreshing: boolean
  exportDisabled: boolean
  onRefresh: () => void
  onExport: () => void
}) {
  return (
    <section data-testid="task-summary-page-title" className="pb-2">
      <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0 space-y-3">
          <Breadcrumb
            items={[
              { label: projectName || '项目', href: `/projects/${projectId}/dashboard` },
              { label: '任务总结' },
            ]}
          />
          <div>
            <div className="text-xs font-medium text-slate-500">任务管控</div>
            <h1 className="dashboard-title truncate font-semibold tracking-tight text-slate-950">任务总结</h1>
          </div>
        </div>
        <div data-testid="task-summary-header-actions" className="flex flex-wrap items-center gap-3 xl:justify-end">
          <Button
            variant="outline"
            size="sm"
            onClick={onRefresh}
            loading={refreshing}
            className="h-8 rounded-lg border-slate-200 bg-white px-2.5 text-xs"
          >
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
            刷新
          </Button>
          <Button
            variant="outline"
            size="sm"
            data-testid="task-summary-export"
            onClick={onExport}
            disabled={exportDisabled}
            className="h-8 rounded-lg border-slate-200 bg-white px-2.5 text-xs"
          >
            <Download className="mr-1.5 h-3.5 w-3.5" />
            导出总结
          </Button>
        </div>
      </div>
    </section>
  )
}

function TaskProcessReplay({ task, timelineEvents }: { task: TaskSummaryLedgerRow; timelineEvents: TaskTimelineEvent[] }) {
  const processEvents = useMemo(() => getTaskProcessEvents(task, timelineEvents), [task, timelineEvents])
  const groupedEvents = useMemo(() => groupProcessEventsByDate(processEvents), [processEvents])
  const completionNarrative = getTaskCompletionNarrative(task)
  const delayReason = getDelayReasonSummary(task)
  // eslint-disable-next-line -- frontend-bi-aggregation-approved
  const conditionEventCount = processEvents.filter((event) => event.kind === 'condition').length
  // eslint-disable-next-line -- frontend-bi-aggregation-approved
  const obstacleEventCount = processEvents.filter((event) => event.kind === 'obstacle').length

  return (
    <div data-testid="task-summary-detail-panel" className="px-5 pb-5 pt-4">
      <div className="grid gap-5 xl:grid-cols-3">
        <div className="space-y-2">
          <div className="meta-muted mb-2">完成结果</div>
          <div className="space-y-1 text-xs text-slate-600">
            <div className="flex min-h-5 items-baseline">
              <span className="mr-2 min-w-16 text-slate-400">计划完成</span>
              <span className="num-mono">{formatDateLabel(task.planned_end_date)}</span>
            </div>
            <div className="flex min-h-5 items-baseline">
              <span className="mr-2 min-w-16 text-slate-400">实际完成</span>
              <span className="num-mono">{formatDateLabel(task.completed_at)}</span>
            </div>
            <div className="flex min-h-5 items-baseline">
              <span className="mr-2 min-w-16 text-slate-400">责任人</span>
              <span>{getTaskAssigneeLabel(task)}</span>
            </div>
            <div className="flex min-h-5 items-baseline">
              <span className="mr-2 min-w-16 text-slate-400">责任单位</span>
              <span>{getTaskAssigneeUnitLabel(task)}</span>
            </div>
            {delayReason ? (
              <div className="flex min-h-5 items-baseline">
                <span className="mr-2 min-w-16 text-slate-400">延期说明</span>
                <span className="text-slate-500">{delayReason}</span>
              </div>
            ) : null}
          </div>
        </div>

        <div className="space-y-2">
          <div className="meta-muted mb-2">变化摘要</div>
          <div className="space-y-1 text-xs text-slate-600">
            <div className="flex min-h-5 items-baseline justify-between gap-3">
              <span className="text-slate-400">开工条件</span>
              <span className="num-mono">{conditionEventCount} 条</span>
            </div>
            <div className="flex min-h-5 items-baseline justify-between gap-3">
              <span className="text-slate-400">阻碍记录</span>
              <span className="num-mono">{obstacleEventCount} 条</span>
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <div className="meta-muted mb-2">过程结论</div>
          <div className="space-y-2 text-xs text-slate-600">
            <div className="leading-5">{renderNarrative(completionNarrative)}</div>
            <div className="leading-5 text-slate-500">{getTaskProcessConclusion(task, processEvents)}</div>
          </div>
        </div>
      </div>

      <div className="mt-4 space-y-2" data-testid="task-summary-process-replay">
        <div className="meta-muted mb-2">完成过程</div>
        {groupedEvents.length > 0 ? (
          <div className="grid items-start gap-2 md:grid-cols-2 xl:grid-cols-3">
            {groupedEvents.map((group) => (
              <div key={group.date} className="rounded-lg border border-slate-100 bg-slate-50/50 p-3">
                <div className="mb-2 flex min-w-0 items-center justify-between gap-2">
                  <span className="num-mono text-xs font-medium text-slate-600">{formatDate(group.date)}</span>
                  {group.items.length > 1 ? (
                    <span className="badge-micro inline-flex h-5 items-center rounded-full bg-white px-2 font-medium text-slate-500 ring-1 ring-inset ring-slate-200">
                      并行 {group.items.length}
                    </span>
                  ) : null}
                </div>
                <div className="space-y-2">
                  {group.items.map((event) => (
                    <div key={event.id} className="rounded-md bg-white px-2.5 py-2 shadow-[var(--el-1)]">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className={cn('badge-micro inline-flex h-5 shrink-0 items-center rounded-full px-2 font-medium ring-1 ring-inset', getProcessEventTone(event.kind))}>
                          {event.label}
                        </span>
                        {event.statusLabel ? <span className="truncate text-xs text-slate-400">{event.statusLabel}</span> : null}
                      </div>
                      <div className="mt-1 truncate text-xs font-medium text-slate-700">{event.title}</div>
                      <div className="mt-0.5 line-clamp-2 text-xs text-slate-500">{event.description}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-4 text-xs text-slate-400">
            暂无过程事件，待开工条件、阻碍和完成动作进入时间线后展示。
          </div>
        )}
      </div>
    </div>
  )
}

function TaskSummarySearch({
  search,
  onSearchChange,
}: {
  search: string
  onSearchChange: (value: string) => void
}) {
  return (
    <div className="relative w-full sm:w-72">
      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" strokeWidth={1.5} />
      <Input
        value={search}
        onChange={(event) => onSearchChange(event.target.value)}
        aria-label="搜索任务总结"
        placeholder="搜索归属、任务、责任人..."
        className="h-8 border-slate-200 bg-white pl-8 text-xs text-slate-700 ring-1 ring-inset ring-slate-200/60 placeholder:text-slate-400 focus-visible:ring-blue-100"
      />
    </div>
  )
}

function TaskAttributionReplayPanel({
  summary,
  onClear,
}: {
  summary: TaskAttributionSummary
  onClear: () => void
}) {
  const delayTaskLabel = summary.mainDelayedTask
    ? `${summary.mainDelayedTask.title} · 延期 ${formatDurationMetric(summary.mainDelayedTask.delay_total, { absolute: true })}`
    : '无主要延期任务'

  return (
    <div data-testid="task-summary-attribution-panel" className="border-b border-slate-100 bg-blue-50/40 px-5 pb-4 pt-4">
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="meta-muted">归属完成复盘</div>
          <div className="mt-1 flex min-w-0 flex-wrap items-center gap-2">
            <h3 className="truncate text-sm font-medium text-slate-900">
              {summary.option.dimensionLabel} · {summary.option.value}
            </h3>
            <span className="badge-micro inline-flex h-5 items-center rounded-lg bg-blue-50 px-2 text-xs font-medium text-blue-700 ring-1 ring-inset ring-blue-100">
              {summary.completedCount}/{summary.totalTaskCount} 项任务
            </span>
          </div>
        </div>
        <Button unstyled
          type="button"
          onClick={onClear}
          className="inline-flex h-7 items-center gap-1 self-start rounded-md px-2 text-xs text-slate-500 hover:bg-slate-50 hover:text-slate-700"
        >
          <X className="h-3.5 w-3.5" strokeWidth={1.5} />
          清除归属
        </Button>
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        <div className="space-y-2">
          <div className="meta-muted mb-2">归属完成结果</div>
          <div className="space-y-1 text-xs text-slate-600">
            <div className="flex min-h-5 items-baseline justify-between gap-3">
              <span className="text-slate-400">完成任务</span>
              <span className="truncate text-right">
                <span className="num-mono">{summary.completedCount}/{summary.totalTaskCount} 项</span>
                <span className="text-slate-400">（完成率 </span>
                <span className="num-mono">{summary.completionRate}%</span>
                <span className="text-slate-400">）</span>
              </span>
            </div>
            <div className="flex min-h-5 items-baseline justify-between gap-3">
              <span className="text-slate-400">按时任务</span>
              <span className="truncate text-right">
                <span className="num-mono text-emerald-600">{summary.onTimeCount} 项</span>
                <span className="text-slate-400">（按时率 </span>
                <span className={cn('num-mono', getAttributionHealthTone(summary.healthLevel).text)}>{summary.onTimeRate}%</span>
                <span className="text-slate-400">）</span>
              </span>
            </div>
            <div className="flex min-h-5 items-baseline justify-between gap-3">
              <span className="text-slate-400">延期任务</span>
              <span className="truncate text-right">
                <span className="num-mono text-red-600">{summary.delayedCount} 项</span>
                {summary.delayedCount > 0 ? (
                  <>
                    <span className="text-slate-400"> · 最大延期 </span>
                    <span className="inline-flex items-center gap-1.5 num-mono text-red-600">
                      <DurationBasisBadge basis="production" compact variant="outline" />
                      {formatDurationMetric(summary.maxDelay, { absolute: true })}
                    </span>
                  </>
                ) : null}
              </span>
            </div>
            <div className="flex min-h-5 items-baseline justify-between gap-3">
              <span className="text-slate-400">最近完成</span>
              <span className="num-mono">{formatDateLabel(summary.recentCompletedAt)}</span>
            </div>
            <div className="flex min-h-5 items-baseline justify-between gap-3">
              <span className="text-slate-400">主要延期</span>
              <span className="truncate text-right">{delayTaskLabel}</span>
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <div className="meta-muted mb-2">变化摘要</div>
          <div className="space-y-1 text-xs text-slate-600">
            <div className="flex min-h-5 items-baseline justify-between gap-3">
              <span className="text-slate-400">开工条件</span>
              <span className="num-mono">{summary.conditionEventCount} 条</span>
            </div>
            <div className="flex min-h-5 items-baseline justify-between gap-3">
              <span className="text-slate-400">阻碍记录</span>
              <span className="num-mono">{summary.obstacleEventCount} 条</span>
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <div className="meta-muted mb-2">过程结论</div>
          <div className="text-xs leading-5 text-slate-500">{summary.conclusion}</div>
        </div>
      </div>

      <div className="mt-4 space-y-2" data-testid="task-summary-attribution-process">
        <div className="meta-muted mb-2">归属完成过程</div>
        {summary.stages.length > 0 ? (
          <div className="grid items-start gap-2 md:grid-cols-2 xl:grid-cols-4">
            {summary.stages.map((stage) => (
              <div key={stage.id} className="rounded-lg border border-slate-100 bg-slate-50/50 p-3">
                <div className="mb-2 flex min-w-0 items-center justify-between gap-2">
                  <span className="text-xs font-medium text-slate-700">{stage.label}</span>
                  <span className="num-mono shrink-0 text-xs text-slate-400">
                    {formatDateRangeLabel(stage.dateStart, stage.dateEnd)}
                  </span>
                </div>
                <div className="mb-2 flex flex-wrap items-center gap-1.5">
                  <span className="badge-micro inline-flex h-5 items-center rounded-full bg-white px-2 font-medium text-slate-500 ring-1 ring-inset ring-slate-200">
                    {stage.eventCount} 条
                  </span>
                  {stage.taskCount > 1 ? (
                    <span className="badge-micro inline-flex h-5 items-center rounded-full bg-white px-2 font-medium text-slate-500 ring-1 ring-inset ring-slate-200">
                      并行 {stage.taskCount}
                    </span>
                  ) : null}
                </div>
                <p className="line-clamp-3 text-xs leading-5 text-slate-500">{stage.description}</p>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-4 text-xs text-slate-400">
            暂无可压缩的归属过程，待所含任务进入时间线后展示。
          </div>
        )}
      </div>

    </div>
  )
}

function TaskSummaryLedgerRow({
  task,
  index,
  selected,
  onSelect,
  timelineEvents,
}: {
  task: TaskSummaryLedgerRow
  index: number
  selected: boolean
  onSelect: (taskId: string) => void
  timelineEvents: TaskTimelineEvent[]
}) {
  const delayed = isTaskDelayed(task)
  const statusLabel = delayed ? '延期' : isTaskOnTime(task) ? '按时' : '待确认'

  const handleKeyDown = (event: KeyboardEvent<HTMLTableRowElement>) => {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    onSelect(task.id)
  }

  return (
    <>
      <TableRow
        data-testid={`task-summary-row-${task.id}`}
        role="button"
        tabIndex={0}
        aria-expanded={selected}
        aria-selected={selected}
        onClick={() => onSelect(task.id)}
        onKeyDown={handleKeyDown}
        className={cn(
          'h-11 cursor-pointer border-b border-l-2 border-b-slate-100 border-l-transparent transition-colors duration-200 last:border-b-0 hover:bg-slate-50/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500',
          selected && 'border-l-blue-500 bg-blue-50/40 hover:bg-blue-50/40',
        )}
      >
        <TableCell className="relative h-11 px-3 py-2 text-right text-sm tabular-nums text-slate-400">
          {selected ? <span aria-hidden className="absolute inset-y-0 left-0 w-[2px] bg-blue-600" /> : null}
          {index}
        </TableCell>
        <TableCell className="h-11 whitespace-nowrap px-2 py-2 text-center">
          {delayed ? (
            <span className="inline-flex items-center rounded-lg bg-rose-50 px-1.5 py-0.5 text-xs font-medium leading-none text-rose-700 ring-1 ring-inset ring-rose-200/60">
              延期
            </span>
          ) : (
            <span className="sr-only">{statusLabel}</span>
          )}
        </TableCell>
        <TableCell className="h-11 px-4 py-2">
          <span className="block truncate text-sm font-medium text-slate-900">{task.title}</span>
        </TableCell>
        <TableCell className="h-11 truncate px-4 py-2 text-sm text-slate-600" title={getTaskAssigneeLabel(task)}>
          {getTaskAssigneeLabel(task)}
        </TableCell>
        <TableCell className="h-11 truncate px-4 py-2 text-sm text-slate-600" title={getTaskAssigneeUnitLabel(task)}>
          {getTaskAssigneeUnitLabel(task)}
        </TableCell>
        <TableCell className="h-11 whitespace-nowrap px-3 py-2 text-right text-sm tabular-nums text-slate-700">
          {formatDateLabel(task.completed_at)}
        </TableCell>
      </TableRow>
      {selected ? (
        <TableRow data-testid={`task-summary-row-${task.id}-detail`} className="border-b border-slate-100 bg-blue-50/40">
          <TableCell colSpan={6} className="p-0">
            <TaskProcessReplay task={task} timelineEvents={timelineEvents} />
          </TableCell>
        </TableRow>
      ) : null}
    </>
  )
}

function TaskSummaryTaskLedgerTable({
  rows,
  timelineEvents,
  selectedTaskId,
  onSelectTask,
}: {
  rows: TaskSummaryLedgerRow[]
  timelineEvents: TaskTimelineEvent[]
  selectedTaskId: string | null
  onSelectTask: (taskId: string) => void
}) {
  const ledgerSummary = useMemo(() => getLedgerSummary(rows), [rows])

  if (rows.length === 0) {
    return (
      <EmptyState
        variant="filter"
        title="暂无匹配的任务明细"
        description="请调整搜索条件后再试。"
        className="max-w-none py-8"
      />
    )
  }

  return (
    <>
      <Table className="table-fixed">
        <colgroup>
          <col style={{ width: 56 }} />
          <col style={{ width: 64 }} />
          <col />
          <col style={{ width: 96 }} />
          <col style={{ width: 160 }} />
          <col style={{ width: 120 }} />
        </colgroup>
        <TableHeader className="sticky top-0 z-10 border-b border-slate-100 bg-white text-xs font-medium text-slate-500">
          <TableRow>
            <TableHead className="h-8 whitespace-nowrap px-3 py-2 text-right">序号</TableHead>
            <TableHead className="h-8 whitespace-nowrap px-2 py-2 text-center">状态</TableHead>
            <TableHead className="h-8 whitespace-nowrap px-4 py-2 text-left">任务名称</TableHead>
            <TableHead className="h-8 whitespace-nowrap px-4 py-2 text-left">责任人</TableHead>
            <TableHead className="h-8 whitespace-nowrap px-4 py-2 text-left">责任单位</TableHead>
            <TableHead className="h-8 whitespace-nowrap px-3 py-2 text-right">完成日期</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((task, index) => (
            <TaskSummaryLedgerRow
              key={task.id}
              task={task}
              index={index + 1}
              selected={selectedTaskId === task.id}
              onSelect={onSelectTask}
              timelineEvents={timelineEvents}
            />
          ))}
        </TableBody>
      </Table>
      <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/70 px-4 py-2.5 text-xs text-slate-500">
        <span>
          共 <span className="tabular-nums font-medium text-slate-700">{ledgerSummary.total}</span> 条
        </span>
        <div className="flex items-center gap-3 tabular-nums">
          <span>
            按时 <span className="font-medium text-slate-700">{ledgerSummary.onTime}</span>
          </span>
          <span aria-hidden className="h-3 w-px bg-slate-200" />
          <span>
            延期 <span className="font-medium text-rose-700">{ledgerSummary.delayed}</span>
          </span>
          {ledgerSummary.delayed > 0 ? (
            <>
              <span aria-hidden className="h-3 w-px bg-slate-200" />
              <span className="inline-flex items-center gap-1.5">
                延期时长逐项显示服务端口径
              </span>
            </>
          ) : null}
        </div>
      </div>
    </>
  )
}

function ScopedDurationForecastStatus({ status }: { status: ScopedDurationForecastDataStatus }) {
  const meta = getScopedForecastStatusMeta(status)
  return (
    <span className={cn(
      'inline-flex h-5 shrink-0 items-center rounded-lg px-2 text-xs font-medium ring-1 ring-inset',
      meta.className,
    )}>
      {meta.label}
    </span>
  )
}

function ScopedDurationForecastCompact({
  forecast,
  loading,
  unavailable,
}: {
  forecast: ScopedDurationForecastGroup | null
  loading: boolean
  unavailable: boolean
}) {
  if (!forecast) {
    if (unavailable) return null
    return (
      <div className="mt-2 text-xs text-slate-400">
        {loading ? '工期预测加载中' : '工期预测数据待补齐'}
      </div>
    )
  }

  return (
    <div
      data-testid={`task-summary-scope-forecast-${forecast.id}`}
      className="mt-2 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500"
    >
      <span>
        预计完成 <span className="num-mono font-medium text-slate-800">{formatScopedForecastDate(forecast.expectedFinishDate)}</span>
      </span>
      <span className="inline-flex items-center gap-1">
        剩余 <DurationBasisBadge basis="production" compact variant="outline" />
        <span className="num-mono font-medium text-slate-700">{formatDurationMetric(forecast.remainingDuration)}</span>
      </span>
      <span className={cn((readAvailableDurationValue(forecast.delay, 'construction_production_day') ?? 0) > 0 ? 'text-rose-600' : 'text-slate-500')}>
        延期 {formatDurationMetric(forecast.delay, { absolute: true })}
      </span>
      <ScopedDurationForecastStatus status={forecast.dataStatus} />
    </div>
  )
}

function ScopedDurationForecastDetail({ forecast }: { forecast: ScopedDurationForecastGroup }) {
  const reasonLabels = forecast.degradationReasons.map(getScopedForecastReasonLabel)
  return (
    <div
      data-testid={`task-summary-scope-forecast-${forecast.id}-detail`}
      className="border-b border-slate-100 bg-slate-50/60 px-5 py-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-xs font-medium text-slate-800">工期预测</div>
          <div className="mt-0.5 text-xs text-slate-400">截至项目预测日期的只读聚合结果</div>
        </div>
        <ScopedDurationForecastStatus status={forecast.dataStatus} />
      </div>

      <div className="mt-3 grid gap-x-6 gap-y-3 text-xs sm:grid-cols-2 xl:grid-cols-4">
        <div>
          <div className="text-slate-400">预计完成</div>
          <div className="num-mono mt-1 font-medium text-slate-800">{formatScopedForecastDate(forecast.expectedFinishDate)}</div>
        </div>
        <div>
          <div className="text-slate-400">剩余工期</div>
          <div className="mt-1 inline-flex items-center gap-1 font-medium text-slate-800">
            <DurationBasisBadge basis="production" compact variant="outline" />
            <span className="num-mono">{formatDurationMetric(forecast.remainingDuration)}</span>
          </div>
        </div>
        <div>
          <div className="text-slate-400">目标偏差</div>
          <div className={cn(
            'num-mono mt-1 font-medium',
            (readAvailableDurationValue(forecast.delay, 'construction_production_day') ?? 0) > 0 ? 'text-rose-600' : 'text-slate-800',
          )}>
            {formatDurationMetric(forecast.delay, { absolute: true })}
          </div>
        </div>
        <div>
          <div className="text-slate-400">置信度</div>
          <div className="num-mono mt-1 font-medium text-slate-800">
            {getScopedForecastConfidenceLabel(forecast.confidenceLevel)}
            {forecast.confidenceScore !== null ? ` · ${forecast.confidenceScore}` : ''}
          </div>
        </div>
      </div>

      <div className="mt-3 border-t border-slate-200 pt-3 text-xs text-slate-500">
        <div className="flex flex-col gap-1.5 lg:flex-row lg:items-center lg:justify-between">
          <span>
            P20 / P50 / P80：
            <span className="num-mono font-medium text-slate-700">
              {formatScopedForecastDate(forecast.p20FinishDate)} / {formatScopedForecastDate(forecast.p50FinishDate)} / {formatScopedForecastDate(forecast.p80FinishDate)}
            </span>
          </span>
          <span>
            预测覆盖 <span className="num-mono font-medium text-slate-700">{formatScopedForecastRate(forecast.forecastCoverageRate)}</span>
            {' · '}概率覆盖 <span className="num-mono font-medium text-slate-700">{formatScopedForecastRate(forecast.probabilityCoverageRate)}</span>
          </span>
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1">
          <span>
            跨组前置 <span className="num-mono font-medium text-slate-700">{forecast.boundaryPredecessorCount}</span>
            {forecast.unresolvedBoundaryPredecessorCount > 0
              ? `（${forecast.unresolvedBoundaryPredecessorCount} 条未解析）`
              : ''}
          </span>
          <span title={forecast.governingTaskIds.join(', ')}>
            控制任务 <span className="num-mono font-medium text-slate-700">{forecast.governingTaskIds.length}</span>
          </span>
          <span>
            关键任务 <span className="num-mono font-medium text-slate-700">{forecast.criticalTaskCount}</span>
          </span>
        </div>
        {reasonLabels.length > 0 ? (
          <div className="mt-2 text-amber-700" role="status">
            降级原因：{reasonLabels.join('、')}
          </div>
        ) : null}
      </div>
    </div>
  )
}

function AttributionLedgerCard({
  option,
  summary,
  forecast,
  forecastLoading,
  forecastUnavailable,
  selected,
  onSelect,
  selectedTaskId,
  onSelectTask,
  timelineEvents,
}: {
  option: TaskAttributionOption
  summary: TaskAttributionSummary
  forecast: ScopedDurationForecastGroup | null
  forecastLoading: boolean
  forecastUnavailable: boolean
  selected: boolean
  onSelect: (optionId: string) => void
  selectedTaskId: string | null
  onSelectTask: (taskId: string) => void
  timelineEvents: TaskTimelineEvent[]
}) {
  const Icon = TASK_ATTRIBUTION_ICON_MAP[option.dimension]
  const tone = getAttributionHealthTone(summary.healthLevel)
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    onSelect(option.id)
  }

  return (
    <div className="bg-white">
      <div
        data-testid={`task-summary-attribution-row-${option.id}`}
        role="button"
        tabIndex={0}
        aria-expanded={selected}
        aria-selected={selected}
        onClick={() => onSelect(option.id)}
        onKeyDown={handleKeyDown}
        className={cn(
          'cursor-pointer border-b border-b-slate-100 px-5 py-3 transition-colors duration-200 last:border-b-0 hover:bg-slate-50/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500',
          selected && 'bg-blue-50/40 hover:bg-blue-50/40',
        )}
      >
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-50 text-slate-400 ring-1 ring-inset ring-slate-100">
            <Icon className="h-4 w-4" strokeWidth={1.5} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <span className="truncate text-sm font-medium text-slate-800">{option.value}</span>
              <span className="badge-micro inline-flex h-5 shrink-0 items-center rounded-full bg-slate-50 px-2 font-medium text-slate-600 ring-1 ring-inset ring-slate-200">
                任务 {summary.completedCount}/{summary.totalTaskCount}
              </span>
            </div>
            <div className="mt-1 text-xs leading-5 text-slate-500">
              {renderNarrative(getAttributionNarrative(summary))}
            </div>
            {isScopedForecastDimension(option.dimension) ? (
              <ScopedDurationForecastCompact
                forecast={forecast}
                loading={forecastLoading}
                unavailable={forecastUnavailable}
              />
            ) : null}
          </div>
          <div className="hidden shrink-0 items-center gap-3 text-xs text-slate-500 sm:flex">
            <span className={cn('shrink-0 num-mono text-sm font-medium', tone.text)}>
              按时率 {summary.onTimeRate}<span> %</span>
            </span>
            <ChevronRight
              className={cn('h-3.5 w-3.5 text-slate-300 transition-transform duration-200', selected && 'rotate-90 text-slate-500')}
              strokeWidth={1.5}
            />
          </div>
        </div>
      </div>
      {selected ? (
        <div data-testid={`task-summary-attribution-row-${option.id}-detail`} className="border-b border-slate-100 bg-white">
          {forecast ? <ScopedDurationForecastDetail forecast={forecast} /> : null}
          <TaskAttributionReplayPanel summary={summary} onClear={() => onSelect(option.id)} />
          <div className="flex items-center justify-between border-b border-slate-100 bg-white px-5 py-3">
            <div>
              <div className="text-xs font-medium text-slate-800">所含任务明细台账</div>
              <div className="mt-0.5 text-xs text-slate-400">以下任务继续按完成时间倒序展示</div>
            </div>
            <span className="num-mono text-xs text-slate-400">{summary.rows.length} 项</span>
          </div>
          <div className="max-h-[480px] overflow-y-auto">
            <TaskSummaryTaskLedgerTable
              rows={summary.rows}
              selectedTaskId={selectedTaskId}
              onSelectTask={onSelectTask}
              timelineEvents={timelineEvents}
            />
          </div>
        </div>
      ) : null}
    </div>
  )
}

function TaskSummaryLedgerSection({
  groups,
  attributionGroups,
  attributionTotals,
  timelineEvents,
  durationForecasts,
  forecastLoading,
  forecastError,
  onRetryForecast,
}: {
  groups: TaskSummaryGroup[]
  attributionGroups: TaskAttributionOption[]
  attributionTotals: AttributionTotalsMap
  timelineEvents: TaskTimelineEvent[]
  durationForecasts: ScopedDurationForecastResponse | null
  forecastLoading: boolean
  forecastError: string | null
  onRetryForecast: () => void
}) {
  const [search, setSearch] = useState('')
  const [activeDimension, setActiveDimension] = useState<TaskAttributionDimension>(DEFAULT_TASK_ATTRIBUTION_DIMENSION)
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const [activeAttribution, setActiveAttribution] = useState<TaskAttributionOption | null>(null)

  const rows = useMemo(() => flattenTaskSummaryRows(groups), [groups])
  const forecastGroups = useMemo(() => (
    durationForecasts
      ? Object.values(durationForecasts.dimensions).flat()
      : []
  ), [durationForecasts])
  const forecastByGroupId = useMemo(() => (
    new Map(forecastGroups.map((group) => [group.id, group] as const))
  ), [forecastGroups])
  const attributionOptions = useMemo(() => {
    const byId = new Map(attributionGroups.map((option) => [option.id, option] as const))
    for (const group of forecastGroups) {
      if (!byId.has(group.id)) byId.set(group.id, buildForecastAttributionOption(group))
    }
    return Array.from(byId.values()).sort((left, right) => {
      const leftDimension = TASK_ATTRIBUTION_DIMENSIONS.findIndex((item) => item.value === left.dimension)
      const rightDimension = TASK_ATTRIBUTION_DIMENSIONS.findIndex((item) => item.value === right.dimension)
      return leftDimension - rightDimension
        || Number(left.sortOrder ?? 0) - Number(right.sortOrder ?? 0)
        || left.value.localeCompare(right.value, 'zh-CN')
    })
  }, [attributionGroups, forecastGroups])
  const currentAttribution = activeAttribution
    ? attributionOptions.find((option) => option.id === activeAttribution.id) ?? null
    : null
  const activeAttributionStillAvailable = !activeAttribution || Boolean(currentAttribution)
  const visibleAttributionOptions = useMemo(() => (
    filterAttributionOptions(attributionOptions, rows, activeDimension, search)
  ), [activeDimension, attributionOptions, rows, search])
  const attributionSummaries = useMemo(() => (
    new Map(visibleAttributionOptions.map((option) => [
      option.id,
      buildAttributionSummary(option, rows, timelineEvents, attributionTotals),
    ]))
  ), [attributionTotals, rows, timelineEvents, visibleAttributionOptions])
  const visibleAttributionSummaries = useMemo(() => (
    visibleAttributionOptions
      .map((option) => attributionSummaries.get(option.id))
      .filter((summary): summary is TaskAttributionSummary => Boolean(summary))
  ), [attributionSummaries, visibleAttributionOptions])
  const attributionLedgerSummary = useMemo(() => (
    getAttributionLedgerSummary(visibleAttributionSummaries)
  ), [visibleAttributionSummaries])
  const selectedTaskStillVisible = currentAttribution
    ? getAttributionRows(rows, currentAttribution).some((row) => row.id === selectedTaskId)
    : true

  useEffect(() => {
    if (!selectedTaskStillVisible) setSelectedTaskId(null)
  }, [selectedTaskStillVisible])

  useEffect(() => {
    if (!activeAttributionStillAvailable) setActiveAttribution(null)
  }, [activeAttributionStillAvailable])

  const clearFilters = useCallback(() => {
    setSearch('')
    setActiveAttribution(null)
  }, [])

  return (
    <section data-testid="task-summary-summary-list-section" className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-base font-semibold text-slate-900">总结列表</h2>
        <TaskSummarySearch
          search={search}
          onSearchChange={setSearch}
        />
      </div>

      {forecastLoading ? (
        <div
          data-testid="task-summary-forecast-loading"
          className="flex items-center gap-2 border-l-2 border-blue-400 bg-blue-50/60 px-3 py-2 text-xs text-blue-700"
          role="status"
        >
          <RefreshCw className="h-3.5 w-3.5 animate-spin" aria-hidden />
          工期预测加载中，完成总结可继续查看
        </div>
      ) : null}

      {forecastError ? (
        <Alert data-testid="task-summary-forecast-error" variant="destructive">
          <AlertDescription className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <span>
              <span className="font-medium">工期预测暂不可用</span>
              <span className="ml-2">{forecastError}</span>
            </span>
            <Button
              data-testid="task-summary-forecast-retry"
              type="button"
              variant="outline"
              size="sm"
              onClick={onRetryForecast}
              className="h-8 shrink-0"
            >
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" aria-hidden />
              重试
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      <Tabs
        value={activeDimension}
        onValueChange={(value) => {
          setActiveDimension(value as TaskAttributionDimension)
          setActiveAttribution(null)
          setSelectedTaskId(null)
        }}
      >
        <TabsList className="mt-3 flex h-auto w-full flex-wrap justify-start gap-4 rounded-none border-b border-slate-100 bg-transparent p-0 text-slate-500">
          {TASK_ATTRIBUTION_DIMENSIONS.map((item) => (
            <TabsTrigger key={item.value} value={item.value} className={compactTabClass}>
              {item.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value={activeDimension} className="mt-2 pt-0">
          <div>
            {rows.length === 0 && forecastGroups.length === 0 ? (
              <EmptyState
                title="暂无总结列表数据"
                description="请先确认任务总结接口已返回完成任务。"
                className="py-10"
              />
            ) : visibleAttributionOptions.length === 0 ? (
              <EmptyState
                variant="filter"
                title="暂无匹配的归属对象"
                description="请调整搜索条件，或确认任务已补齐分部、分项、专项、楼栋、区域等归属字段。"
                onClearFilter={clearFilters}
                className="max-w-none py-8"
              />
            ) : (
              <div className="surface-card p-0">
                <div>
                  {visibleAttributionOptions.map((option) => {
                    const summary = attributionSummaries.get(option.id)
                    if (!summary) return null
                    return (
                      <AttributionLedgerCard
                        key={option.id}
                        option={option}
                        summary={summary}
                        forecast={forecastByGroupId.get(option.id) ?? null}
                        forecastLoading={forecastLoading}
                        forecastUnavailable={Boolean(forecastError)}
                        selected={currentAttribution?.id === option.id}
                        onSelect={(optionId) => {
                          setActiveAttribution((current) => (current?.id === optionId ? null : option))
                          setSelectedTaskId(null)
                        }}
                        selectedTaskId={selectedTaskId}
                        onSelectTask={(taskId) => setSelectedTaskId((current) => (current === taskId ? null : taskId))}
                        timelineEvents={timelineEvents}
                      />
                    )
                  })}
                </div>
                <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/70 px-4 py-2.5 text-xs text-slate-500">
                  <span>
                    涉及 <span className="tabular-nums font-medium text-slate-700">{attributionLedgerSummary.total}</span>
                    {' '}
                    {TASK_ATTRIBUTION_FOOTER_LABEL[activeDimension]}
                  </span>
                  <div className="flex items-center gap-3 tabular-nums">
                    {attributionLedgerSummary.taskCount === attributionLedgerSummary.completed ? (
                      <span>
                        完成任务 <span className="font-medium text-slate-700">{attributionLedgerSummary.completed}</span>
                      </span>
                    ) : (
                      <span>
                        任务 <span className="font-medium text-slate-700">{attributionLedgerSummary.taskCount}</span>
                        （完成 <span className="font-medium text-slate-700">{attributionLedgerSummary.completed}</span>）
                      </span>
                    )}
                    <span aria-hidden className="h-3 w-px bg-slate-200" />
                    <span>
                      按时 <span className="font-medium text-slate-700">{attributionLedgerSummary.onTime}</span>
                    </span>
                    <span aria-hidden className="h-3 w-px bg-slate-200" />
                    <span>
                      延期 <span className="font-medium text-slate-700">{attributionLedgerSummary.delayed}</span>
                    </span>
                    {attributionLedgerSummary.delayed > 0 ? (
                      <>
                        <span aria-hidden className="h-3 w-px bg-slate-200" />
                        <span className="inline-flex items-center gap-1.5">
                          延期时长按归属项逐项展示
                        </span>
                      </>
                    ) : null}
                  </div>
                </div>
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </section>
  )
}

export default function TaskSummary() {
  useEffect(() => {
    document.title = '任务总结 | WorkBuddy'
  }, [])

  const { id: projectId } = useParams<{ id: string }>()
  const currentProject = useCurrentProject()

  const [stats, setStats] = useState<ProjectSummaryStats | null>(null)
  const [groups, setGroups] = useState<TaskSummaryGroup[]>([])
  const [attributionGroups, setAttributionGroups] = useState<TaskAttributionOption[]>([])
  const [attributionTotals, setAttributionTotals] = useState<AttributionTotalsMap>({})
  const [timelineEvents, setTimelineEvents] = useState<TaskTimelineEvent[]>([])
  const [trendRows, setTrendRows] = useState<TaskSummaryTrendRow[]>([])
  const [durationForecasts, setDurationForecasts] = useState<ScopedDurationForecastResponse | null>(null)
  const [forecastLoading, setForecastLoading] = useState(false)
  const [forecastError, setForecastError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const loadData = useCallback(async (signal?: AbortSignal) => {
    if (!projectId) return

    try {
      setLoading(true)
      setLoadError(null)

      const [summaryData, nextTrendRows] = await Promise.all([
        fetchTaskSummarySection<TaskSummaryPayload>(
          `/api/task-summaries/projects/${projectId}/task-summary`,
          signal,
        ),
        fetchTaskSummarySection<TaskSummaryTrendRow[]>(
          `/api/task-summaries/projects/${projectId}/task-summary/trend`,
          signal,
        ).catch(() => []),
      ])

      if (signal?.aborted) return

      setStats(summaryData.stats ?? null)
      setGroups(summaryData.groups ?? [])
      setAttributionGroups(summaryData.attribution_groups ?? [])
      setAttributionTotals(summaryData.attribution_totals ?? {})
      setTimelineEvents(summaryData.timeline_events ?? [])
      setTrendRows(nextTrendRows ?? [])
    } catch (error) {
      if (isAbortError(error)) return

      const message = getApiErrorMessage(error, '无法加载任务完成总结')
      setStats(null)
      setGroups([])
      setAttributionGroups([])
      setAttributionTotals({})
      setTimelineEvents([])
      setTrendRows([])
      setLoadError(message)
      toast({
        title: '加载失败',
        description: message,
        variant: 'destructive',
      })
    } finally {
      if (!signal?.aborted) {
        setLoading(false)
      }
    }
  }, [projectId])

  const loadDurationForecasts = useCallback(async (signal?: AbortSignal) => {
    if (!projectId) return

    try {
      setForecastLoading(true)
      setForecastError(null)
      setDurationForecasts(null)
      const result = await fetchTaskSummarySection<ScopedDurationForecastResponse>(
        `/api/task-summaries/projects/${projectId}/duration-forecasts`,
        signal,
      )
      if (signal?.aborted) return
      setDurationForecasts(result)
    } catch (error) {
      if (isAbortError(error)) return
      if (signal?.aborted) return
      setDurationForecasts(null)
      setForecastError(getApiErrorMessage(error, '无法加载分部、分项和专项工期预测'))
    } finally {
      if (!signal?.aborted) setForecastLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    const controller = new AbortController()
    void loadData(controller.signal)
    void loadDurationForecasts(controller.signal)

    return () => controller.abort()
  }, [loadData, loadDurationForecasts])

  const exportTaskSummary = useCallback(() => {
    if (!stats) {
      toast({
        title: '暂无可导出内容',
        description: '请先等待任务总结加载完成。',
        variant: 'destructive',
      })
      return
    }

    const projectLabel = currentProject?.name || projectId || 'task-summary'
    const lines: Array<Array<string | number>> = [
      ['指标', '值'],
      ['已完成任务', stats.total_completed ?? 0],
      ['按时完成', stats.on_time_count ?? 0],
      ['延期完成', stats.delayed_count ?? 0],
      ['完成里程碑', stats.completed_milestone_count ?? 0],
      ['平均延期', formatDurationMetric(stats.avg_delay)],
    ]

    const csv = lines.map((line) => line.map((cell) => escapeCsvCell(cell)).join(',')).join('\n')
    const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8;' })
    const url = window.URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `${projectLabel}-任务总结-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(anchor)
    anchor.click()
    document.body.removeChild(anchor)
    window.URL.revokeObjectURL(url)

    toast({
      title: '导出成功',
    })
  }, [currentProject?.name, projectId, stats])

  const currentMonthCompleted = useMemo(() => (
    groups.flatMap((group) => group.tasks).filter(isCompletedInCurrentMonth).length
  ), [groups])

  if (!loading && !projectId) {
    return (
      <div className="page-shell">
        <Card className="surface-card">
          <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <CheckSquare className="h-12 w-12 text-slate-300" />
            <div className="space-y-1">
              <h2 className="text-lg font-semibold text-slate-900">任务总结暂不可用</h2>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="page-shell">
        <LoadingState
          label="任务总结加载中"
          className="min-h-80"
        />
      </div>
    )
  }

  return (
    <div data-testid="task-summary-page" className="page-shell">
      <TaskSummaryPageTitle
        projectName={currentProject?.name || '项目'}
        projectId={projectId || ''}
        refreshing={loading || forecastLoading}
        exportDisabled={!stats}
        onRefresh={() => {
          void loadData()
          void loadDurationForecasts()
        }}
        onExport={exportTaskSummary}
      />

      <V14231PageReadinessBoundary pageKey="TaskSummary" />

      {loadError && (
        <Alert variant="destructive">
          <AlertDescription>{loadError}</AlertDescription>
        </Alert>
      )}

      <TaskSummaryResultsSection
        stats={stats}
        currentMonthCompleted={currentMonthCompleted}
        trendRows={trendRows}
      />
      <TaskSummaryLedgerSection
        groups={groups}
        attributionGroups={attributionGroups}
        attributionTotals={attributionTotals}
        timelineEvents={timelineEvents}
        durationForecasts={durationForecasts}
        forecastLoading={forecastLoading}
        forecastError={forecastError}
        onRetryForecast={() => void loadDurationForecasts()}
      />
    </div>
  )
}
