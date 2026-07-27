import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'

import { Breadcrumb } from '@/components/Breadcrumb'
import { EmptyState } from '@/components/EmptyState'
import { Button } from '@/components/ui/button'
import { MetricCard } from '@/components/ui/metric-card'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useAsyncData } from '@/hooks/useAsyncData'
import { PROJECT_NAVIGATION_LABELS } from '@/config/navigation'
import { DashboardApiService } from '@/services/dashboardApi'
import { toast } from '@/hooks/use-toast'
import { formatDate } from '@/lib/utils'
import {
  formatDurationMetric,
  readAvailableDurationValue,
  type DurationMetricDto,
  type DurationMetricUnit,
} from '@/lib/durationMetric'
import { MilestonesSkeleton } from '@/components/ui/page-skeleton'
import { apiGet, getApiErrorMessage, isAbortError } from '@/lib/apiClient'
import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  Clock,
  Download,
  ExternalLink,
  Flag,
  GitMerge,
  RefreshCw,
  Search,
  TrendingDown,
  TrendingUp,
} from 'lucide-react'

import type { ProjectSummary } from '@/services/dashboardApi'
import type { MilestoneKpiComparisonMetric } from '@/lib/milestoneOverview'

type MilestoneStatus = 'completed' | 'soon' | 'overdue' | 'pending' | 'upcoming'
type MilestoneFilter = 'all' | MilestoneStatus

interface LinkedTaskItem {
  id: string
  title?: string | null
  name?: string | null
  status?: string | null
  progress?: number | null
}

interface MilestoneItem {
  id: string
  name: string
  description?: string
  targetDate?: string | null
  planned_date?: string | null
  current_planned_date?: string | null
  actual_date?: string | null
  planDateShift?: DurationMetricDto | null
  futureDueWindow?: DurationMetricDto | null
  actualOverdue?: DurationMetricDto | null
  actualScheduleVariance?: DurationMetricDto | null
  progress: number
  status: MilestoneStatus
  statusLabel: string
  updatedAt?: string
  wbs_code?: string | null
  wbs_level?: number | null
  milestone_level?: number | null
  parent_id?: string | null
  mapping_pending?: boolean
  merged_into?: string | null
  merged_into_name?: string | null
  non_base_labels?: string[]
}

interface MilestoneStats {
  total: number
  pending: number
  completed: number
  overdue: number
  upcomingSoon: number
  completionRate: number
}

interface MilestoneSummaryStats {
  shiftedCount: number
  baselineOnTimeCount: number
  dueSoon30dCount: number
  highRiskCount: number
}

function isCompleted(milestone: MilestoneItem): boolean {
  return milestone.status === 'completed'
}

function formatMilestoneDate(value?: string | null) {
  if (!value) return '未设置'
  return formatDate(value)
}

function getMilestoneTimeline(milestone: MilestoneItem) {
  return {
    baselineDate: milestone.planned_date ?? null,
    currentPlanDate: milestone.current_planned_date ?? null,
    actualDate: milestone.actual_date ?? null,
  }
}

type MilestoneLevel = 1 | 2 | 3

interface MilestoneLevelGroup {
  level: MilestoneLevel
  label: string
  items: MilestoneItem[]
}

const MILESTONE_LEVELS: MilestoneLevel[] = [1, 2, 3]

function getMilestoneLevel(milestone: MilestoneItem): MilestoneLevel {
  const value = Number(milestone.milestone_level ?? milestone.wbs_level ?? 3)
  if (value <= 1) return 1
  if (value === 2) return 2
  return 3
}

function getMilestoneLevelLabel(level: MilestoneLevel) {
  if (level === 1) return '一级里程碑'
  if (level === 2) return '二级里程碑'
  return '三级里程碑'
}

function getMilestoneStatusPriority(milestone: MilestoneItem) {
  if (milestone.status === 'overdue') return 0
  if (milestone.status === 'soon') return 1
  if (milestone.status === 'completed') return 3
  return 2
}

function getMilestoneSortDate(milestone: MilestoneItem) {
  return milestone.current_planned_date ?? milestone.planned_date ?? milestone.targetDate ?? ''
}

function compareMilestoneUrgency(left: MilestoneItem, right: MilestoneItem) {
  const statusDelta = getMilestoneStatusPriority(left) - getMilestoneStatusPriority(right)
  if (statusDelta !== 0) return statusDelta
  return getMilestoneSortDate(left).localeCompare(getMilestoneSortDate(right)) || left.name.localeCompare(right.name, 'zh-CN')
}

function buildMilestoneLevelGroups(items: MilestoneItem[]): MilestoneLevelGroup[] {
  return MILESTONE_LEVELS
    .map((level) => ({
      level,
      label: getMilestoneLevelLabel(level),
      items: items.filter((item) => getMilestoneLevel(item) === level).sort(compareMilestoneUrgency),
    }))
    .filter((group) => group.items.length > 0)
}

function matchesMilestoneFilter(item: MilestoneItem, filter: MilestoneFilter) {
  if (filter === 'all') return true
  if (filter === 'pending') {
    return item.status === 'pending' || item.status === 'upcoming'
  }
  return item.status === filter
}

function escapeCsvCell(value: string | number | boolean | null | undefined) {
  const normalized = String(value ?? '')
  if (!/[",\n]/.test(normalized)) return normalized
  return `"${normalized.replace(/"/g, '""')}"`
}

function getVarianceTextTone(value: number | null) {
  if (value === null || value === 0) return 'text-slate-500'
  return value > 0 ? 'text-red-600' : 'text-emerald-600'
}

function formatVarianceConclusionPart(
  metric: DurationMetricDto | null | undefined,
  label: '计划' | '实际',
  expectedUnit: DurationMetricUnit,
) {
  const value = readAvailableDurationValue(metric, expectedUnit)
  if (value === null) {
    return `${label}${formatDurationMetric(metric, {
      expectedUnit,
      unavailableLabel: expectedUnit === 'calendar_day' ? '日历天口径不可用' : '生产日口径不可用',
    })}`
  }
  if (value === 0) return `${label}无偏差`
  return `${label}偏差 ${formatDurationMetric(metric, { absolute: true, expectedUnit })}`
}

type NarrativeSegment = { text: string; className?: string }

function getMilestoneNarrative(milestone: MilestoneItem): NarrativeSegment[] {
  const { baselineDate, currentPlanDate, actualDate } = getMilestoneTimeline(milestone)
  const progress = Math.max(0, Math.min(100, Number(milestone.progress ?? 0)))
  const actualVariance = readAvailableDurationValue(milestone.actualScheduleVariance, 'construction_production_day')
  const currentVariance = readAvailableDurationValue(milestone.planDateShift, 'calendar_day')
  const daysToCurrent = readAvailableDurationValue(milestone.futureDueWindow, 'calendar_day')

  if (milestone.merged_into) {
    return [{ text: `已合并到 ${milestone.merged_into_name || milestone.merged_into}`, className: 'text-slate-400' }]
  }

  if (milestone.status === 'completed') {
    if (!actualDate) return [{ text: '完成时间缺失', className: 'text-red-500 font-medium' }]
    const datePart = { text: `实际 ${formatMilestoneDate(actualDate)}`, className: 'num-mono text-slate-500' }
    if (actualVariance === null) {
      return [datePart, { text: ' · ' }, {
        text: formatDurationMetric(milestone.actualScheduleVariance, {
          expectedUnit: 'construction_production_day',
          unavailableLabel: '生产日口径不可用',
        }),
        className: 'text-slate-400',
      }]
    }
    if (actualVariance === 0) return [datePart, { text: ' · ' }, { text: '按期完成', className: 'text-emerald-600' }]
    if (actualVariance > 0) return [datePart, { text: ' · ' }, { text: `延后 ${formatDurationMetric(milestone.actualScheduleVariance, { absolute: true })}`, className: 'text-amber-600' }]
    return [datePart, { text: ' · ' }, { text: `提前 ${formatDurationMetric(milestone.actualScheduleVariance, { absolute: true })}`, className: 'text-emerald-600' }]
  }

  if (milestone.status === 'overdue') {
    const overdueDays = readAvailableDurationValue(milestone.actualOverdue, 'construction_production_day')
    const overdueLabel = overdueDays !== null
      ? `已逾期 ${formatDurationMetric(milestone.actualOverdue, { absolute: true })}`
      : formatDurationMetric(milestone.actualOverdue, {
          expectedUnit: 'construction_production_day',
          unavailableLabel: '生产日口径不可用',
        })
    const overdueSeg: NarrativeSegment = { text: overdueLabel, className: 'text-red-500 font-medium' }
    if (progress === 0) return [overdueSeg, { text: ' · 尚未开始' }]
    return [overdueSeg, { text: ` · 进度 ${progress}%`, className: 'num-mono text-slate-500' }]
  }

  if (!baselineDate && currentPlanDate) {
    return [
      { text: '按当前计划推进' },
      { text: ' · 当前 ' },
      { text: formatMilestoneDate(currentPlanDate), className: 'num-mono text-slate-500' },
    ]
  }

  if (!baselineDate && !currentPlanDate) {
    return [
      { text: '待完成' },
      { text: ' · 日期待补齐', className: 'text-slate-400' },
    ]
  }

  if (baselineDate && !currentPlanDate) {
    return [
      { text: '按基线推进' },
      { text: ' · 基线 ' },
      { text: formatMilestoneDate(baselineDate), className: 'num-mono text-slate-500' },
    ]
  }

  if (daysToCurrent !== null && daysToCurrent >= 0 && daysToCurrent <= 7) {
    if (daysToCurrent === 0) {
      return [
        { text: '今日到期', className: 'text-amber-600 font-medium' },
        { text: ` · 进度 ${progress}%`, className: 'num-mono text-slate-500' },
      ]
    }
    const leftTone = daysToCurrent <= 3 ? 'text-amber-600 font-medium' : 'text-slate-500'
    return [
      { text: `还剩 ${formatDurationMetric(milestone.futureDueWindow, { absolute: true })}`, className: leftTone },
      { text: ` · 进度 ${progress}%`, className: 'num-mono text-slate-500' },
    ]
  }

  if (currentVariance === null) {
    return [
      { text: '日历天口径不可用', className: 'text-amber-600 font-medium' },
      { text: ' · 当前 ' },
      { text: formatMilestoneDate(currentPlanDate), className: 'num-mono text-slate-500' },
    ]
  }

  if (progress === 0) {
    if (currentVariance === 0) {
      return [
        { text: '按基线推进 · 当前 ' },
        { text: formatMilestoneDate(currentPlanDate), className: 'num-mono text-slate-500' },
      ]
    }
    if (currentVariance > 0) {
      return [
        { text: `较基线延后 ${formatDurationMetric(milestone.planDateShift, { absolute: true })}`, className: 'text-red-500 font-medium' },
        { text: ' · 当前 ' },
        { text: formatMilestoneDate(currentPlanDate), className: 'num-mono text-slate-500' },
      ]
    }
    return [
      { text: `较基线提前 ${formatDurationMetric(milestone.planDateShift, { absolute: true })}`, className: 'text-emerald-600' },
      { text: ' · 当前 ' },
      { text: formatMilestoneDate(currentPlanDate), className: 'num-mono text-slate-500' },
    ]
  }

  if (currentVariance && currentVariance > 0) {
    return [
      { text: `进度 ${progress}%`, className: 'num-mono text-slate-500' },
      { text: ' · ' },
      { text: `较基线延后 ${formatDurationMetric(milestone.planDateShift, { absolute: true })}`, className: 'text-red-500 font-medium' },
    ]
  }

  return [
    { text: `进度 ${progress}%`, className: 'num-mono text-slate-500' },
    { text: ' · 当前 ' },
    { text: formatMilestoneDate(currentPlanDate), className: 'num-mono text-slate-500' },
  ]
}

function getMilestoneStatusIcon(milestone: MilestoneItem) {
  if (milestone.merged_into) {
    return { Icon: GitMerge, className: 'text-slate-400', filled: false }
  }
  if (milestone.status === 'completed') {
    return { Icon: CheckCircle2, className: 'text-emerald-500', filled: true }
  }
  if (milestone.status === 'overdue') {
    return { Icon: AlertCircle, className: 'text-red-500', filled: true }
  }
  if (milestone.status === 'soon') {
    return { Icon: Clock, className: 'text-amber-500', filled: true }
  }
  return { Icon: Circle, className: 'text-blue-500', filled: false }
}

function getMilestoneRelationLabels(milestone: MilestoneItem) {
  const labels = new Set<string>()
  if (milestone.mapping_pending) {
    labels.add('计划未对齐')
  }

  for (const rawLabel of milestone.non_base_labels ?? []) {
    const label = String(rawLabel ?? '').trim()
    if (!label) continue
    if (label.includes('待补映射') || label.includes('未关联基线') || label.includes('缺基线') || label.includes('缺当前计划')) {
      labels.add('计划未对齐')
    } else {
      labels.add(label)
    }
  }

  return Array.from(labels)
}

function getMilestoneProgressClass(milestone: MilestoneItem) {
  if (milestone.status === 'overdue') return 'text-red-600'
  if (milestone.status === 'soon') return 'text-amber-600'
  if (milestone.status === 'completed') return 'text-emerald-600'
  return 'text-slate-700'
}

function formatMilestoneTrend(metric: MilestoneKpiComparisonMetric | undefined, invertTone = false) {
  const periodLabel = metric?.periodLabel ?? '较上月'
  if (!metric || metric.status !== 'ready' || metric.delta === null) {
    return { label: `待积累 ${periodLabel}`, className: 'text-slate-400', icon: null }
  }

  if (metric.delta === 0) {
    return { label: `持平 ${periodLabel}`, className: 'text-slate-400', icon: null }
  }

  const isPositive = metric.delta > 0
  const isGood = invertTone ? !isPositive : isPositive
  return {
    label: `${isPositive ? '+' : '-'}${Math.abs(metric.delta)} ${periodLabel}`,
    className: isGood ? 'text-emerald-700' : 'text-rose-700',
    icon: isPositive ? TrendingUp : TrendingDown,
  }
}

function getMilestoneSparkline(metric: MilestoneKpiComparisonMetric | undefined): number[] {
  const steadySparkline = [50, 50, 50, 50, 50]
  if (!metric || metric.status !== 'ready' || metric.delta === null || metric.previous === null) return steadySparkline
  if (metric.delta === 0) return steadySparkline
  const start = Number(metric.previous)
  const end = Number(metric.current)
  return [0, 0.25, 0.5, 0.75, 1].map((ratio) => Math.round(start + (end - start) * ratio))
}

function scrollMilestoneIntoView(milestoneId: string) {
  const target = document.getElementById(`milestone-${milestoneId}`)
  if (typeof target?.scrollIntoView === 'function') {
    target.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }
}

function getMilestoneHierarchyPath(milestone: MilestoneItem, items: MilestoneItem[]) {
  const itemMap = new Map(items.map((item) => [item.id, item]))
  const parents: string[] = []
  const visited = new Set<string>([milestone.id])
  let parentId = milestone.parent_id ?? ''

  while (parentId && !visited.has(parentId)) {
    visited.add(parentId)
    const parent = itemMap.get(parentId)
    if (!parent) break
    parents.unshift(parent.name)
    parentId = parent.parent_id ?? ''
  }

  return parents.join(' › ')
}

function isLinkedTaskCompleted(task: LinkedTaskItem) {
  const status = String(task.status ?? '').trim().toLowerCase()
  return status === 'completed' || status === 'done' || status === '已完成' || Number(task.progress ?? 0) >= 100
}

function MilestonesPageTitle({
  projectName,
  projectId,
  refreshing,
  exportDisabled,
  onRefresh,
  onExport,
  onGoToTaskList,
}: {
  projectName: string
  projectId: string
  refreshing: boolean
  exportDisabled: boolean
  onRefresh: () => void
  onExport: () => void
  onGoToTaskList: () => void
}) {
  return (
    <section data-testid="milestones-page-title" className="pb-2">
      <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0 space-y-3">
          <Breadcrumb
            items={[
              { label: projectName || '项目', href: `/projects/${projectId}/dashboard` },
              { label: '里程碑' },
            ]}
          />
          <div>
            <div className="text-xs font-medium text-slate-500">进度管控</div>
            <h1 className="dashboard-title truncate font-semibold tracking-tight text-slate-950">里程碑</h1>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3 xl:justify-end">
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
            data-testid="milestones-export"
            onClick={onExport}
            disabled={exportDisabled}
            className="h-8 rounded-lg border-slate-200 bg-white px-2.5 text-xs"
          >
            <Download className="mr-1.5 h-3.5 w-3.5" />
            导出节点表
          </Button>
          <Button size="sm" onClick={onGoToTaskList} className="h-8 rounded-lg px-3 text-xs">
            <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
            任务管理
          </Button>
        </div>
      </div>
    </section>
  )
}

function MilestoneNodeCard({
  milestone,
  onSelect,
  linkedTasks,
  linkedTasksLoading,
  allMilestones,
  onGoToTaskList,
  getTaskListHref,
  selected = false,
}: {
  milestone: MilestoneItem
  onSelect: (milestone: MilestoneItem) => void
  linkedTasks: LinkedTaskItem[]
  linkedTasksLoading: boolean
  allMilestones: MilestoneItem[]
  onGoToTaskList: (milestone?: MilestoneItem) => void
  getTaskListHref: (milestone?: MilestoneItem) => string
  selected?: boolean
}) {
  const completed = isCompleted(milestone)
  const statusTone =
    milestone.status === 'overdue'
      ? 'ring-red-200 bg-red-50 text-red-700'
      : milestone.status === 'soon'
        ? 'ring-amber-200 bg-amber-50 text-amber-700'
        : milestone.status === 'completed'
          ? 'ring-emerald-200 bg-emerald-50 text-emerald-700'
          : 'ring-slate-200 bg-slate-50 text-slate-700'

  const { baselineDate, currentPlanDate, actualDate } = getMilestoneTimeline(milestone)
  const planVariance = readAvailableDurationValue(milestone.planDateShift, 'calendar_day')
  const actualVariance = readAvailableDurationValue(milestone.actualScheduleVariance, 'construction_production_day')
  const progressValue = Math.max(0, Math.min(100, Number(milestone.progress ?? 0)))
  const timelineRows = [
    { key: 'baseline', label: '基线', date: baselineDate },
    { key: 'current', label: '当前计划', date: currentPlanDate },
    { key: 'actual', label: '实际', date: actualDate },
  ]
  const deviationRows = [
    { key: 'baseline', text: '', variance: null },
    { key: 'current', text: formatVarianceConclusionPart(milestone.planDateShift, '计划', 'calendar_day'), variance: planVariance },
    {
      key: 'actual',
      text: actualDate
        ? formatVarianceConclusionPart(milestone.actualScheduleVariance, '实际', 'construction_production_day')
        : '实际尚未完成',
      variance: actualVariance,
    },
  ]
  const linkedTaskCount = linkedTasks.length
  // eslint-disable-next-line -- frontend-bi-aggregation-approved
  const completedLinkedTaskCount = linkedTasks.filter(isLinkedTaskCompleted).length
  const hierarchyPath = getMilestoneHierarchyPath(milestone, allMilestones)
  const narrative = getMilestoneNarrative(milestone)
  const { Icon: StatusIcon, className: statusIconClass, filled: statusIconFilled } = getMilestoneStatusIcon(milestone)
  const progressClass = getMilestoneProgressClass(milestone)
  const relationLabels = getMilestoneRelationLabels(milestone)

  return (
    <div
      id={`milestone-${milestone.id}`}
      data-testid={`milestone-card-${milestone.id}`}
      className={`group border-b border-l-2 border-b-slate-100 border-l-transparent transition-colors duration-200 last:border-b-0 hover:bg-slate-50/70 ${selected ? 'bg-blue-50/40 border-l-blue-500' : ''}`}
    >
      <Button unstyled
        type="button"
        onClick={() => onSelect(milestone)}
        className="block w-full px-5 py-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
      >
        <div className="relative">
          <div className="flex items-center gap-3">
            <StatusIcon
              className={`shrink-0 ${statusIconClass}`}
              style={{ width: 16, height: 16, fill: statusIconFilled ? 'currentColor' : 'none' }}
              strokeWidth={statusIconFilled ? 0 : 2}
              aria-hidden="true"
            />
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
              <span className={`truncate text-sm font-medium ${completed ? 'text-slate-500' : 'text-slate-800'}`}>{milestone.name}</span>
              <span
                data-testid={`milestone-status-${milestone.id}`}
                className={`badge-micro inline-flex h-5 items-center rounded-full px-2 font-medium ring-1 ring-inset ${statusTone}`}
              >{milestone.statusLabel}</span>
              {relationLabels.map((label) => (
                <span
                  key={label}
                  data-testid={`milestone-relation-label-${milestone.id}`}
                  className="badge-micro inline-flex h-5 items-center rounded-full bg-orange-50 px-2 font-medium text-orange-700 ring-1 ring-inset ring-orange-200"
                >
                  {label}
                </span>
              ))}
            </div>
            <span className={`shrink-0 num-mono text-sm font-medium ${progressClass}`}>
              {progressValue}<span> %</span>
            </span>
            <ChevronRight
              className={`shrink-0 h-3.5 w-3.5 text-slate-300 transition-all duration-200 group-hover:text-slate-500 ${selected ? 'rotate-90 text-slate-500' : ''}`}
              strokeWidth={1.5}
            />
          </div>

          {!selected ? (
            <div data-testid="milestones-three-time" className="mt-1.5 pl-7 text-xs text-slate-500">
              {narrative.map((seg, idx) => (
                <span key={idx} className={seg.className}>{seg.text}</span>
              ))}
            </div>
          ) : null}
        </div>
      </Button>

      {selected ? (
        <div
          data-testid="milestone-detail-panel"
          className="mx-5 mb-5 border-t border-slate-100 pt-4 pb-1"
        >
          <div className="relative">
            <div className="grid grid-cols-3 gap-0 divide-x divide-slate-200/70" data-testid="milestone-detail-grid">
              <div className="space-y-1.5 pr-6" data-testid="milestone-detail-time">
                <div className="mb-2 text-xs font-medium text-slate-700">时间线</div>
                <div className="space-y-1.5">
                  {timelineRows.map((row) => (
                    <div
                      key={row.key}
                      data-testid={`milestone-detail-time-${row.key}`}
                      className={`flex min-h-5 items-baseline text-xs text-slate-600`}
                    >
                      <span data-testid={`milestone-detail-time-${row.key}-label`} className={`mr-2 min-w-14 text-xs ${row.date ? 'text-slate-600' : 'text-slate-300'}`}>{row.label}</span>
                      {row.date ? <span className="num-mono text-xs text-slate-600">{formatMilestoneDate(row.date)}</span> : null}
                    </div>
                  ))}
                </div>
              </div>
              <div
                data-testid="milestone-detail-deviation"
                className="space-y-2 px-6"
              >
                <div className="mb-2 text-xs font-medium text-slate-700">偏差分析</div>
                <div className="space-y-1.5">
                  {deviationRows.map((row) => (
                    <div
                      key={row.key}
                      data-testid={`milestone-detail-deviation-${row.key}`}
                      className={`num-mono min-h-5 text-xs ${getVarianceTextTone(row.variance)}`}
                    >
                      {row.text}
                    </div>
                  ))}
                </div>
              </div>
              <div className="space-y-2 pl-6">
                <div className="mb-2 text-xs font-medium text-slate-700">关联执行</div>
                <div data-testid="milestone-detail-hierarchy" className="min-h-5 text-xs text-slate-600">
                  {hierarchyPath}
                </div>
                <div data-testid="milestone-detail-linked-summary" className={`num-mono min-h-5 text-xs text-slate-600`}>
                  {linkedTasksLoading ? '加载中' : `关联任务 ${linkedTaskCount} 个 · 已完成 ${completedLinkedTaskCount} 个`}
                </div>
                <a
                  href={getTaskListHref(milestone)}
                  onClick={(event) => {
                    event.preventDefault()
                    onGoToTaskList(milestone)
                  }}
                  className="inline-flex text-xs text-blue-600 hover:underline"
                >
                  进入任务管理 →
                </a>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

export default function Milestones() {
  useEffect(() => {
    document.title = '里程碑 | WorkBuddy'
  }, [])

  const { id } = useParams<{ id: string }>()
  const location = useLocation()
  const navigate = useNavigate()
  const { data: summary, loading, error, refetch } = useAsyncData(
    async () => {
      if (!id) return null
      const projectSummary = await DashboardApiService.getProjectSummary(id)
      if (!projectSummary?.milestoneOverview) {
        throw new Error('里程碑共享摘要暂不可用')
      }
      return projectSummary as ProjectSummary
    },
    [id],
  )

  const milestoneOverview = summary?.milestoneOverview
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<MilestoneFilter>('all')
  const [selectedMilestoneId, setSelectedMilestoneId] = useState<string | null>(null)
  const [linkedTasks, setLinkedTasks] = useState<LinkedTaskItem[]>([])
  const [linkedTasksLoading, setLinkedTasksLoading] = useState(false)
  const highlightMilestoneId = useMemo(() => new URLSearchParams(location.search).get('highlight')?.trim() ?? '', [location.search])

  useEffect(() => {
    setSelectedMilestoneId(null)
    setLinkedTasks([])
    setLinkedTasksLoading(false)
  }, [id])

  useEffect(() => {
    if (!highlightMilestoneId || !milestoneOverview?.items?.length) return
    const highlighted = milestoneOverview.items.find((item) => item.id === highlightMilestoneId)
    if (!highlighted) return
    setSelectedMilestoneId((current) => (current === highlighted.id ? current : highlighted.id))
    window.setTimeout(() => {
      scrollMilestoneIntoView(highlighted.id)
    }, 0)
  }, [highlightMilestoneId, milestoneOverview?.items])

  useEffect(() => {
    if (!id || !selectedMilestoneId) {
      setLinkedTasks([])
      setLinkedTasksLoading(false)
      return
    }
    const controller = new AbortController()
    setLinkedTasksLoading(true)
    apiGet<LinkedTaskItem[]>(
      `/api/projects/${id}/milestones/${selectedMilestoneId}/linked-tasks`,
      { signal: controller.signal },
    )
      .then((payload) => {
        if (!controller.signal.aborted) {
          setLinkedTasks(Array.isArray(payload) ? payload : [])
        }
      })
      .catch((err) => {
        if (!isAbortError(err)) {
          setLinkedTasks([])
          toast({
            title: '关联执行加载失败',
            description: getApiErrorMessage(err, '无法加载关联执行'),
            variant: 'destructive',
          })
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLinkedTasksLoading(false)
      })
    return () => controller.abort()
  }, [id, selectedMilestoneId, toast])

  const getTaskListHref = (milestone?: MilestoneItem) => {
    if (!id) return '#'
    if (!milestone) return `/projects/${id}/gantt`
    const params = new URLSearchParams({
      milestoneId: milestone.id,
      milestoneName: milestone.name,
    })
    return `/projects/${id}/gantt?${params.toString()}`
  }

  const goToTaskList = (milestone?: MilestoneItem) => {
    const target = getTaskListHref(milestone)
    if (!target) return
    navigate(target)
  }

  const selectMilestone = (milestone: MilestoneItem) => {
    setSelectedMilestoneId((current) => (current === milestone.id ? null : milestone.id))
  }
  const filteredMilestones = useMemo(() => {
    const keyword = search.trim().toLowerCase()
    let items = milestoneOverview?.items || []

    return items
      .filter((item) => matchesMilestoneFilter(item, filter))
      .filter((item) => {
        if (!keyword) return true
        return [item.name, item.description, item.statusLabel]
          .map((v) => String(v || '').toLowerCase())
          .some((v) => v.includes(keyword))
      })
  }, [filter, milestoneOverview?.items, search])

  const kpiComparisons = milestoneOverview?.kpiComparisons?.monthly
  const milestoneSummaryStats = milestoneOverview?.summaryStats ?? {
    shiftedCount: 0,
    baselineOnTimeCount: 0,
    dueSoon30dCount: 0,
    highRiskCount: 0,
  }

  const filteredMilestoneGroups = useMemo(() => buildMilestoneLevelGroups(filteredMilestones), [filteredMilestones])

  const summaryCards = useMemo(
    () =>
      milestoneOverview
        ? [
            { key: 'shifted', eyebrow: 'SHIFTED', title: '当前已偏移数', value: milestoneSummaryStats.shiftedCount, tone: 'warning' as const, invertTrend: true, icon: <Clock className="h-3.5 w-3.5" strokeWidth={1.5} /> },
            { key: 'baselineOnTime', eyebrow: 'ONTIME', title: '按基线准时完成数', value: milestoneSummaryStats.baselineOnTimeCount, tone: 'success' as const, invertTrend: false, icon: <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={1.5} /> },
            { key: 'dueSoon30d', eyebrow: 'DUE', title: '近 30 个日历天到期数', value: milestoneSummaryStats.dueSoon30dCount, tone: 'primary' as const, invertTrend: true, icon: <Calendar className="h-3.5 w-3.5" strokeWidth={1.5} /> },
            { key: 'highRisk', eyebrow: 'RISK', title: '高风险里程碑数', value: milestoneSummaryStats.highRiskCount, tone: 'danger' as const, invertTrend: true, icon: <AlertCircle className="h-3.5 w-3.5" strokeWidth={1.5} /> },
          ]
        : [],
    [milestoneOverview, milestoneSummaryStats],
  )

  const exportMilestones = () => {
    if (!summary || filteredMilestones.length === 0) {
      toast({ title: '暂无可导出节点', variant: 'destructive' })
      return
    }
    const rows = filteredMilestones.map((item) => {
      const { baselineDate, currentPlanDate, actualDate } = getMilestoneTimeline(item)
      return [
        item.name, item.statusLabel, item.targetDate || '',
        baselineDate || '', currentPlanDate || '', actualDate || '',
        item.progress, item.wbs_code || '', item.parent_id || '',
        item.mapping_pending ? '是' : '否',
        item.merged_into_name || item.merged_into || '',
        item.description || '',
      ]
    })
    const header = ['节点名称', '状态', '目标日期', '基线日期', '当前计划', '实际日期', '进度(%)', 'WBS', 'parent_id', 'mapping_pending', 'merged_into', '备注']
    const csv = [header, ...rows].map((line) => line.map((cell) => escapeCsvCell(cell)).join(',')).join('\n')
    const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8;' })
    const url = window.URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `${summary.name}-里程碑节点-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(anchor)
    anchor.click()
    document.body.removeChild(anchor)
    window.URL.revokeObjectURL(url)
    toast({ title: '导出成功', description: `已导出 ${filteredMilestones.length} 条里程碑节点。` })
  }

  if (!id || loading) {
    return (
      <div className="page-shell">
        <MilestonesSkeleton />
      </div>
    )
  }

  if (error || !milestoneOverview) {
    return (
      <div className="page-shell page-enter">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="text-xs font-medium text-slate-500">进度管控</div>
            <h1 className="text-xl font-semibold tracking-tight text-slate-900">里程碑</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
              重试
            </Button>
            <Button size="sm" onClick={() => goToTaskList()}>
              <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
              任务管理
            </Button>
          </div>
        </div>
        <EmptyState
          icon={AlertCircle}
          title="里程碑共享摘要暂不可用"
          description="请稍后重试，或先进入任务管理查看节点数据。"
          className="rounded-2xl empty-state-frame border-slate-100 bg-white px-6 py-14 shadow-[var(--el-1)]"
          action={(
            <Button variant="outline" onClick={() => refetch()}>
              <RefreshCw className="mr-2 h-4 w-4" />
              重试
            </Button>
          )}
        />
      </div>
    )
  }

  const totalItems = milestoneOverview.items.length
  const hasAnyMilestones = totalItems > 0
  return (
    <div className="page-shell page-enter">
      <MilestonesPageTitle
        projectName={summary.name}
        projectId={id}
        refreshing={loading}
        exportDisabled={filteredMilestones.length === 0}
        onRefresh={() => refetch()}
        onExport={exportMilestones}
        onGoToTaskList={() => goToTaskList()}
      />

      {/* M10/M11: KPI cards with kpiComparisons */}
      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4" data-testid="milestones-summary-grid">
        {summaryCards.map((card, index) => {
          const comparison = kpiComparisons?.[card.key as keyof typeof kpiComparisons]
          const trend = formatMilestoneTrend(comparison, card.invertTrend)
          const TrendIcon = trend.icon
          return (
            <MetricCard
              key={card.key}
              eyebrow={card.eyebrow}
              title={card.title}
              value={card.value}
              tone={card.tone}
              density="compact"
              icon={card.icon}
              trend={(
                <span className={`inline-flex items-center gap-1 ${trend.className}`}>
                  {TrendIcon ? <TrendIcon className="h-3 w-3" strokeWidth={1.5} /> : null}
                  {trend.label}
                </span>
              )}
              sparkline={getMilestoneSparkline(comparison)}
              testId={`milestone-summary-card-${card.title}`}
              className="motion-safe:animate-fade-in"
              style={{ animationDelay: `${index * 60}ms` }}
            />
          )
        })}
      </div>
      {/* M13/M14/M15: Deviation table + detail panel */}
      {!hasAnyMilestones ? (
        <EmptyState
          icon={Flag}
          title="暂无里程碑数据"
          description="在任务列表中将关键节点标记为里程碑后，这里会自动展示。"
          className="rounded-2xl empty-state-frame border-slate-100 bg-white px-6 py-14 shadow-[var(--el-1)]"
          action={(
            <Button variant="outline" onClick={() => goToTaskList()}>
              <ExternalLink className="mr-2 h-4 w-4" />
              前往任务列表
            </Button>
          )}
        />
      ) : (
        <section className="space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-base font-semibold text-slate-900">节点偏差表</h2>
            <div className="relative w-full sm:w-72">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" strokeWidth={1.5} />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                aria-label="搜索里程碑节点"
                placeholder="搜索节点名称、描述、状态"
                className="h-8 border-slate-200 bg-white pl-8 text-xs text-slate-700 ring-1 ring-inset ring-slate-200/60 placeholder:text-slate-400 focus-visible:ring-blue-100"
              />
            </div>
          </div>

          <Tabs value={filter} onValueChange={(value) => setFilter(value as MilestoneFilter)}>
              <TabsList className="mt-3 flex h-auto w-full flex-wrap justify-start gap-4 rounded-none border-b border-slate-100 bg-transparent p-0 text-slate-500">
                <TabsTrigger value="all" className="relative rounded-none bg-transparent px-0 pb-2 pt-0 text-xs text-slate-500 shadow-none transition-colors after:absolute after:inset-x-0 after:-bottom-px after:h-[2px] after:rounded-full after:bg-transparent hover:text-slate-700 data-[state=active]:bg-transparent data-[state=active]:text-blue-600 data-[state=active]:shadow-none data-[state=active]:after:bg-blue-600">全部</TabsTrigger>
                <TabsTrigger value="pending" className="relative rounded-none bg-transparent px-0 pb-2 pt-0 text-xs text-slate-500 shadow-none transition-colors after:absolute after:inset-x-0 after:-bottom-px after:h-[2px] after:rounded-full after:bg-transparent hover:text-slate-700 data-[state=active]:bg-transparent data-[state=active]:text-blue-600 data-[state=active]:shadow-none data-[state=active]:after:bg-blue-600">待完成</TabsTrigger>
                <TabsTrigger value="soon" className="relative rounded-none bg-transparent px-0 pb-2 pt-0 text-xs text-slate-500 shadow-none transition-colors after:absolute after:inset-x-0 after:-bottom-px after:h-[2px] after:rounded-full after:bg-transparent hover:text-slate-700 data-[state=active]:bg-transparent data-[state=active]:text-blue-600 data-[state=active]:shadow-none data-[state=active]:after:bg-blue-600">7 个日历天内</TabsTrigger>
                <TabsTrigger value="overdue" className="relative rounded-none bg-transparent px-0 pb-2 pt-0 text-xs text-slate-500 shadow-none transition-colors after:absolute after:inset-x-0 after:-bottom-px after:h-[2px] after:rounded-full after:bg-transparent hover:text-slate-700 data-[state=active]:bg-transparent data-[state=active]:text-blue-600 data-[state=active]:shadow-none data-[state=active]:after:bg-blue-600">已逾期</TabsTrigger>
                <TabsTrigger value="completed" className="relative rounded-none bg-transparent px-0 pb-2 pt-0 text-xs text-slate-500 shadow-none transition-colors after:absolute after:inset-x-0 after:-bottom-px after:h-[2px] after:rounded-full after:bg-transparent hover:text-slate-700 data-[state=active]:bg-transparent data-[state=active]:text-blue-600 data-[state=active]:shadow-none data-[state=active]:after:bg-blue-600">已完成</TabsTrigger>
              </TabsList>

            <TabsContent value={filter} className="mt-2 pt-0">
              <div>
                {filteredMilestoneGroups.length === 0 ? (
                  <EmptyState
                    variant="filter"
                    icon={Flag}
                    title="暂无匹配的节点"
                    onClearFilter={() => { setSearch(''); setFilter('all') }}
                    className="max-w-none py-8"
                  />
                ) : (
                  <div className="surface-card p-2">
                    <div className="space-y-1">
                      {filteredMilestoneGroups.map((group) => (
                        <div
                          key={group.level}
                          data-testid={`milestone-level-group-${group.level}`}
                          className="border-t border-slate-100/80 pt-5 first:border-t-0 first:pt-2"
                        >
                          <div className="section-group-label px-3 pb-1">
                            {group.label}<span className="text-xs text-slate-400"> · {group.items.length}</span>
                          </div>
                          <div>
                            {group.items.map((milestone) => (
                              <MilestoneNodeCard
                                key={milestone.id}
                                milestone={milestone}
                                selected={selectedMilestoneId === milestone.id}
                                onSelect={selectMilestone}
                                linkedTasks={selectedMilestoneId === milestone.id ? linkedTasks : []}
                                linkedTasksLoading={selectedMilestoneId === milestone.id ? linkedTasksLoading : false}
                                allMilestones={milestoneOverview.items}
                                onGoToTaskList={goToTaskList}
                                getTaskListHref={getTaskListHref}
                              />
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </section>
      )}
    </div>
  )
}
