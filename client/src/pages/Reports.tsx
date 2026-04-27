import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  ArrowLeft,
  BarChart3,
  CheckSquare,
  ClipboardList,
  Clock3,
  Download,
  FileSpreadsheet,
  Flag,
  LockKeyhole,
  RefreshCw,
  ArrowRight,
  ShieldAlert,
  type LucideIcon,
} from 'lucide-react'

import { Breadcrumb } from '@/components/Breadcrumb'
import { DataConfidenceBreakdown } from '@/components/DataConfidenceBreakdown'
import { EmptyState } from '@/components/EmptyState'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { LoadingState } from '@/components/ui/loading-state'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { toast } from '@/hooks/use-toast'
import { apiGet, getApiErrorMessage } from '@/lib/apiClient'
import {
  selectProjectScopeOrEmpty,
  useCurrentProject,
  useStore,
  type ScopeDimensionKey,
  type ScopeDimensionSection,
} from '@/hooks/useStore'
import type { Risk, Task, TaskCondition, TaskObstacle } from '@/lib/supabase'
import { DashboardApiService, type CriticalPathSummaryModel, type ProjectSummary } from '@/services/dashboardApi'
import { DataQualityApiService, type DataQualityProjectSummary } from '@/services/dataQualityApi'
import { MaterialsApiService, type MaterialReportSummary } from '@/services/materialsApi'
import { PROJECT_NAVIGATION_LABELS } from '@/config/navigation'
import { DeviationFocusHint, viewLabels } from './Reports/components/DeviationFocusHint'
import { BaselineSwitchMarker, type BaselineSwitchEvent } from './Reports/components/BaselineSwitchMarker'
import { DeviationDetailTable } from './Reports/components/DeviationDetailTable'
import { DeviationShell } from './Reports/components/DeviationShell'
import { DeviationTabs, type DeviationView } from './Reports/components/DeviationTabs'
import { ExecutionScatterChart } from './Reports/components/ExecutionScatterChart'
import { BaselineDumbbellChart } from './Reports/components/BaselineDumbbellChart'
import { MonthlyStackedBarChart } from './Reports/components/MonthlyStackedBarChart'

type XlsxModule = typeof import('xlsx')

type MetricItem = {
  title: string
  value: string | number
  hint?: string
  icon?: ReactNode
}

type AnalysisEntry = {
  view: AnalysisView
  title: string
  description: string
  moduleLabel: string
  actionLabel: string
  icon: LucideIcon
  to: string
}

type AnalysisView = 'progress' | 'progress_deviation' | 'risk' | 'change_log'

type DetailStat = {
  label: string
  value: string | number
  hint: string
  to?: string
  testId?: string
}

type ReportMetricKey =
  | 'overall_progress'
  | 'health_score'
  | 'delay_days'
  | 'active_risk_count'
  | 'active_obstacle_count'
  | 'active_delay_requests'

type ReportTimeRange = 'all' | '7d' | '30d' | '90d'
type ReportDimensionKey = 'none' | ScopeDimensionKey
type ReportGranularity = 'day' | 'week' | 'month'

type ReportTrendPoint = {
  date: string
  value: number | null
  group?: string | null
}

type ReportTrendResponse = {
  projectId: string
  metric: ReportMetricKey
  from: string
  to: string
  groupBy: ReportDimensionKey
  granularity: ReportGranularity
  points: ReportTrendPoint[]
}

type ProgressDeviationMainlineKey = 'baseline' | 'monthly_plan' | 'execution'

type ProgressDeviationRow = {
  id: string
  title: string
  mainline: ProgressDeviationMainlineKey
  source_task_id?: string | null
  planned_date?: string | null
  planned_progress?: number | null
  actual_progress?: number | null
  actual_date?: string | null
  deviation_days: number
  deviation_rate: number
  status: string
  reason?: string | null
  mapping_status?: 'mapped' | 'mapping_pending' | 'merged_into' | null
  merged_into?: { title: string; group_id?: string | null; item_ids?: string[] } | null
  child_group?: { parent_title: string; child_count: number; group_id?: string | null } | null
}

type ProgressDeviationMainline = {
  key: ProgressDeviationMainlineKey
  label: string
  summary: {
    total_items: number
    deviated_items: number
    delayed_items: number
    unresolved_items: number
  }
  rows: ProgressDeviationRow[]
}

type ProgressDeviationTrendEvent = BaselineSwitchEvent

type ProgressDeviationMonthlyBucket = {
  month: string
  on_track: number
  delayed: number
  carried_over: number
  revised: number
  unresolved: number
}

type ProgressDeviationResponsibilityContribution = {
  owner: string
  count: number
  percentage: number
  task_ids: string[]
}

type ProgressDeviationCauseSummary = {
  reason: string
  count: number
  percentage: number
}

type ProgressDeviationChartData = {
  baselineDeviation?: ProgressDeviationRow[]
  monthlyFulfillment?: ProgressDeviationMonthlyBucket[]
  executionDeviation?: ProgressDeviationRow[]
  monthly_buckets: ProgressDeviationMonthlyBucket[]
}

type ProgressDeviationAnalysisResponse = {
  project_id: string
  baseline_version_id: string
  monthly_plan_version_id?: string | null
  version_lock?: BaselineVersionLock | null
  summary: {
    total_items: number
    deviated_items: number
    carryover_items: number
    unresolved_items: number
    baseline_items: number
    monthly_plan_items: number
    execution_items: number
  }
  rows: ProgressDeviationRow[]
  mainlines: ProgressDeviationMainline[]
  trend_events: ProgressDeviationTrendEvent[]
  chart_data?: ProgressDeviationChartData | null
  responsibility_contribution?: ProgressDeviationResponsibilityContribution[]
  top_deviation_causes?: ProgressDeviationCauseSummary[]
}

type ReportMilestoneCard = {
  id: string
  name: string
  statusLabel: string
  progress: number
  plannedDate: string | null
  currentPlannedDate: string | null
  actualDate: string | null
}

type TaskBaselineListItem = {
  id: string
  project_id: string
  version: number
  status?: string | null
  title?: string | null
  source_version_label?: string | null
  confirmed_at?: string | null
  updated_at?: string | null
}

type BaselineVersionLock = {
  id: string
  project_id: string
  baseline_version_id: string
  resource_id: string
  locked_by?: string | null
  locked_at: string
  lock_expires_at: string
  is_locked: boolean
}

type ChangeLogRecord = {
  id: string
  project_id?: string | null
  entity_type: string
  entity_id: string
  field_name: string
  old_value?: string | null
  new_value?: string | null
  change_reason?: string | null
  changed_by?: string | null
  change_source?: string | null
  changed_at?: string | null
}

type IssueSummaryTrendPoint = {
  date: string
  newIssues: number
  resolvedIssues: number
  activeIssues: number
}

type IssueSummaryRecord = {
  id: string
  title: string
  description?: string | null
  status?: string | null
  source_type?: string | null
  created_at?: string | null
}

type IssueSummaryResponse = {
  project_id?: string
  total_issues: number
  active_issues: number
  status_counts: Record<string, number>
  severity_counts: Record<string, number>
  source_counts: Array<{ key: string; label: string; count: number }>
  trend: IssueSummaryTrendPoint[]
  recent_issues: IssueSummaryRecord[]
}

function normalizeIssueSummaryResponse(value: unknown, projectId?: string): IssueSummaryResponse {
  const record = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Partial<IssueSummaryResponse>
    : {}

  return {
    project_id: typeof record.project_id === 'string' ? record.project_id : projectId,
    total_issues: typeof record.total_issues === 'number' ? record.total_issues : 0,
    active_issues: typeof record.active_issues === 'number' ? record.active_issues : 0,
    status_counts: record.status_counts && typeof record.status_counts === 'object' && !Array.isArray(record.status_counts)
      ? record.status_counts
      : {},
    severity_counts: record.severity_counts && typeof record.severity_counts === 'object' && !Array.isArray(record.severity_counts)
      ? record.severity_counts
      : {},
    source_counts: Array.isArray(record.source_counts) ? record.source_counts : [],
    trend: Array.isArray(record.trend) ? record.trend : [],
    recent_issues: Array.isArray(record.recent_issues) ? record.recent_issues : [],
  }
}

function MetricCard({ title, value, hint, icon }: MetricItem) {
  void hint

  return (
    <Card className="border-slate-200 shadow-sm">
      <CardContent className="pt-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm text-muted-foreground">{title}</p>
            <div className="mt-2 text-2xl font-bold">{value}</div>
          </div>
          {icon ? <div className="rounded-lg bg-primary/10 p-2 text-primary">{icon}</div> : null}
        </div>
      </CardContent>
    </Card>
  )
}

function DetailStatCard({ label, value, hint, to, testId }: DetailStat) {
  void hint

  const content = (
    <>
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-slate-900">{value}</div>
    </>
  )
  const className = "rounded-2xl border border-slate-100 bg-slate-50 p-4 transition-colors"

  if (to) {
    return (
      <Link data-testid={testId} to={to} className={`block ${className} hover:border-blue-200 hover:bg-blue-50/60`}>
        {content}
      </Link>
    )
  }

  return (
    <div data-testid={testId} className={className}>
      {content}
    </div>
  )
}

function AnalysisEntryCard({
  title,
  description,
  moduleLabel,
  actionLabel,
  onClick,
  icon,
  testId,
}: {
  title: string
  description: string
  moduleLabel: string
  actionLabel: string
  onClick: () => void
  icon: ReactNode
  testId?: string
}) {
  void description

  return (
    <button
      data-testid={testId}
      onClick={onClick}
      className="group flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-3">
          <div className="inline-flex rounded-xl bg-blue-50 p-2 text-blue-600">{icon}</div>
          <div>
            <div className="text-xs font-medium uppercase tracking-[0.12em] text-slate-400">{moduleLabel}</div>
            <div className="text-base font-semibold text-slate-900">{title}</div>
          </div>
        </div>
      </div>
      <div className="mt-5 inline-flex items-center gap-2 text-sm font-medium text-blue-600 transition-colors group-hover:text-blue-700">
        {actionLabel}
        <span aria-hidden="true">→</span>
      </div>
    </button>
  )
}

function formatDateLabel(value?: string | null) {
  if (!value) return '未设置'
  return value
}

function parseStatusLabel(status?: string | null) {
  if (!status) return '未开始'
  switch (status) {
    case 'completed':
      return '已完成'
    case 'in_progress':
    case 'active':
      return '进行中'
    case 'paused':
      return '已暂停'
    case 'archived':
      return '已归档'
    case 'pending_realign':
      return '待重排'
    case 'pending':
      return '待处理'
    default:
      return status
  }
}

function formatDateTimeLabel(value?: string | null) {
  if (!value) return '未设置'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function getTaskDisplayName(task: Task) {
  return task.title || task.name || '未命名任务'
}

function getTaskStatus(task: Task) {
  return parseStatusLabel(task.status)
}

function buildReportMilestoneCard(
  milestone: {
    id?: string
    name?: string
    statusLabel?: string
    progress?: number
    targetDate?: string | null
    planned_date?: string | null
    current_planned_date?: string | null
    actual_date?: string | null
  },
  task?: Task | null,
): ReportMilestoneCard {
  const plannedDate = milestone.planned_date || milestone.targetDate || task?.end_date || task?.planned_end_date || null
  const currentPlannedDate = milestone.current_planned_date || task?.planned_end_date || plannedDate
  const actualDate = milestone.actual_date || task?.actual_end_date || null

  return {
    id: String(milestone.id || task?.id || ''),
    name: String(milestone.name || getTaskDisplayName(task || {} as Task) || '未命名里程碑'),
    statusLabel: milestone.statusLabel || (task ? getTaskStatus(task) : '未开始'),
    progress: Math.max(0, Math.min(100, Number(milestone.progress ?? task?.progress ?? 0))),
    plannedDate,
    currentPlannedDate,
    actualDate,
  }
}

function isCompletedTask(task: Task) {
  return ['已完成', 'completed'].includes(task.status || '')
}

function isDelayedTask(task: Task) {
  const plannedEnd = task.planned_end_date || task.end_date
  if (!plannedEnd || isCompletedTask(task)) return false
  const target = new Date(plannedEnd)
  return !Number.isNaN(target.getTime()) && target.getTime() < Date.now()
}

function summarizeRiskSource(risk: Risk) {
  return risk.risk_source || risk.risk_category || '未分类'
}

function getIssueSourceLabel(sourceType?: string | null) {
  switch (String(sourceType || '').trim()) {
    case 'manual':
      return '人工录入'
    case 'warning_converted':
      return '预警转问题'
    case 'risk_converted':
      return '风险转问题'
    case 'obstacle_escalated':
      return '阻碍上卷'
    case 'condition_expired':
      return '条件过期'
    default:
      return String(sourceType || '未分类')
  }
}

function getIssueStatusLabel(status?: string | null) {
  switch (String(status || '').trim()) {
    case 'open':
      return '待处理'
    case 'investigating':
      return '调查中'
    case 'resolved':
      return '已解决（待确认）'
    case 'closed':
      return '已关闭'
    default:
      return String(status || '待处理')
  }
}

function getIssueSeverityLabel(severity?: string | null) {
  switch (String(severity || '').trim()) {
    case 'critical':
      return '严重'
    case 'high':
      return '高'
    case 'medium':
      return '中'
    case 'low':
      return '低'
    default:
      return String(severity || '中')
  }
}

function getDeviationFocusLabel(value: 'all' | 'tasks' | 'risks' | 'conditions' | 'obstacles') {
  switch (value) {
    case 'tasks':
      return '任务'
    case 'risks':
      return '风险'
    case 'conditions':
      return '条件'
    case 'obstacles':
      return '阻碍'
    default:
      return '全部'
  }
}

function getDeviationStatusLabel(status?: string | null) {
  switch (String(status || '').trim()) {
    case 'on_track':
      return '正常'
    case 'delayed':
      return '延期'
    case 'carried_over':
      return '滚入'
    case 'revised':
      return '修订'
    case 'unresolved':
      return '未闭环'
    default:
      return String(status || '未知')
  }
}

function getObstacleSeverity(obstacle: TaskObstacle) {
  return obstacle.severity || '中'
}

function getObstacleTypeLabel(obstacle: TaskObstacle) {
  const raw = obstacle as Record<string, unknown>
  const label = raw.obstacle_type || raw.title || raw.name || '未分类'
  return String(label)
}

function getResponsibilityLabel(task?: Task | null) {
  const raw = task as Record<string, unknown> | null | undefined
  return String(raw?.participant_unit_name || raw?.responsible_unit || raw?.assignee_name || raw?.assignee || '未指定责任主体')
}

function getTaskBuildingLabel(task?: Task | null) {
  const raw = task as Record<string, unknown> | null | undefined
  return String(raw?.building_id || raw?.buildingId || raw?.building_type || raw?.buildingType || '未设置')
}

function getTaskSectionLabel(task?: Task | null) {
  const raw = task as Record<string, unknown> | null | undefined
  return String(raw?.section_id || raw?.sectionId || raw?.assignee_unit || raw?.responsible_unit || raw?.wbs_code || '未设置')
}

function getTaskSpecialtyLabel(task?: Task | null) {
  const raw = task as Record<string, unknown> | null | undefined
  return String(raw?.specialty_type || task?.specialty_type || '未设置')
}

function normalizeAnalysisView(value: string | null): AnalysisView {
  if (value === 'baseline' || value === 'monthly' || value === 'execution') {
    return 'progress_deviation'
  }

  if (value === 'progress' || value === 'progress_deviation' || value === 'risk' || value === 'change_log') {
    return value
  }

  return 'progress'
}

function normalizeDeviationView(value: string | null): DeviationView {
  if (value === 'baseline' || value === 'monthly' || value === 'execution') {
    return value
  }

  return 'execution'
}

function buildCountSummary<T>(
  items: readonly T[],
  getKey: (item: T) => string | null | undefined,
) {
  const counts = new Map<string, number>()

  for (const item of items) {
    const key = String(getKey(item) ?? '').trim()
    if (!key) continue
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }

  return Array.from(counts.entries()).sort((left, right) => right[1] - left[1])
}

function buildChangeLogTypeCounts(changeLogs: ChangeLogRecord[]) {
  const counts = {
    scopeRelated: 0,
    planningRelated: 0,
    executionRelated: 0,
  }

  for (const record of changeLogs) {
    if (['task', 'milestone', 'baseline'].includes(record.entity_type)) {
      counts.scopeRelated += 1
    }
    if (['delay_request', 'monthly_plan'].includes(record.entity_type)) {
      counts.planningRelated += 1
    }
    if (['risk', 'issue', 'task_condition', 'task_obstacle'].includes(record.entity_type)) {
      counts.executionRelated += 1
    }
  }

  return counts
}

function buildDelayObstacleCorrelationRows(delayedTasks: Task[], projectObstacles: TaskObstacle[]) {
  return delayedTasks
    .map((task) => {
      let activeObstacleCount = 0
      const obstacleTypeLabels = new Set<string>()

      for (const obstacle of projectObstacles) {
        if (obstacle.task_id !== task.id) continue

        const label = getObstacleTypeLabel(obstacle)
        if (label) obstacleTypeLabels.add(label)

        if (String(obstacle.status || '').trim() !== '已解决') {
          activeObstacleCount += 1
        }
      }

      return {
        id: String(task.id || ''),
        title: getTaskDisplayName(task),
        activeObstacleCount,
        obstacleTypes: Array.from(obstacleTypeLabels),
      }
    })
    .filter((row) => row.activeObstacleCount > 0)
}

const REPORT_METRIC_OPTIONS: Array<{ value: ReportMetricKey; label: string; description: string }> = [
  { value: 'overall_progress', label: '总体进度', description: '项目整体加权进度' },
  { value: 'health_score', label: '健康度', description: '项目综合健康分' },
  { value: 'delay_days', label: '延期天数', description: '累计延期时间' },
  { value: 'active_risk_count', label: '活跃风险数', description: '当前活跃风险数量' },
  { value: 'active_obstacle_count', label: '阻碍数', description: '当前活跃阻碍数量' },
  { value: 'active_delay_requests', label: '延期审批数', description: '活跃延期审批数量' },
]

const REPORT_TIME_RANGE_OPTIONS: Array<{ value: ReportTimeRange; label: string; granularity: ReportGranularity }> = [
  { value: '7d', label: '近 7 天', granularity: 'day' },
  { value: '30d', label: '近 30 天', granularity: 'week' },
  { value: '90d', label: '近 90 天', granularity: 'month' },
  { value: 'all', label: '全部时间', granularity: 'month' },
]

function formatReportDateKey(value: Date) {
  return value.toISOString().slice(0, 10)
}

function resolveReportTrendWindow(range: ReportTimeRange) {
  const now = new Date()
  const to = formatReportDateKey(now)
  if (range === 'all') {
    return {
      from: undefined as string | undefined,
      to: undefined as string | undefined,
      granularity: 'month' as ReportGranularity,
    }
  }

  const days = range === '7d' ? 6 : range === '30d' ? 29 : 89
  const fromDate = new Date(now)
  fromDate.setDate(fromDate.getDate() - days)

  const selectedGranularity = REPORT_TIME_RANGE_OPTIONS.find((item) => item.value === range)?.granularity ?? 'month'
  return {
    from: formatReportDateKey(fromDate),
    to,
    granularity: selectedGranularity,
  }
}

export default function Reports() {
  const navigate = useNavigate()
  const { id: routeProjectId } = useParams()
  const [searchParams] = useSearchParams()
  const currentProject = useCurrentProject()
  const [summaryData, setSummaryData] = useState<ProjectSummary | null>(null)
  const [dataQualitySummary, setDataQualitySummary] = useState<DataQualityProjectSummary | null>(null)
  const [materialSummary, setMaterialSummary] = useState<MaterialReportSummary | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastRefreshedAt, setLastRefreshedAt] = useState<string | null>(null)
  const [criticalPathSummary, setCriticalPathSummary] = useState<CriticalPathSummaryModel | null>(null)
  const [criticalPathLoading, setCriticalPathLoading] = useState(false)
  const [secondaryExpanded, setSecondaryExpanded] = useState(false)
  const [deviationFocus, setDeviationFocus] = useState<'all' | 'tasks' | 'risks' | 'conditions' | 'obstacles'>('all')
  const [selectedDeviationRow, setSelectedDeviationRow] = useState<ProgressDeviationRow | null>(null)
  const [deviationData, setDeviationData] = useState<ProgressDeviationAnalysisResponse | null>(null)
  const [deviationLoading, setDeviationLoading] = useState(false)
  const [deviationError, setDeviationError] = useState<string | null>(null)
  const [deviationLock, setDeviationLock] = useState<BaselineVersionLock | null>(null)
  const [deviationLockError, setDeviationLockError] = useState<string | null>(null)
  const [deviationTimeRange, setDeviationTimeRange] = useState<'all' | '7d' | '30d' | '90d'>('all')
  const [deviationBuildingFilter, setDeviationBuildingFilter] = useState('all')
  const [deviationSectionFilter, setDeviationSectionFilter] = useState('all')
  const [deviationSpecialtyFilter, setDeviationSpecialtyFilter] = useState('all')
  const [deviationLevelFilter, setDeviationLevelFilter] = useState('all')
  const [baselineLabel, setBaselineLabel] = useState('当前基线')
  const [changeLogs, setChangeLogs] = useState<ChangeLogRecord[]>([])
  const [changeLogLoading, setChangeLogLoading] = useState(false)
  const [changeLogError, setChangeLogError] = useState<string | null>(null)
  const [issueSummaryData, setIssueSummaryData] = useState<IssueSummaryResponse | null>(null)
  const [issueSummaryLoading, setIssueSummaryLoading] = useState(false)

  const activeView = normalizeAnalysisView(searchParams.get('view'))
  const deviationView = normalizeDeviationView(searchParams.get('view'))
  const projectId = routeProjectId || currentProject?.id || ''
  const projectName = summaryData?.name || currentProject?.name || '当前项目'

  const loadSummary = useCallback(async (signal?: AbortSignal) => {
    if (!projectId) {
      setSummaryData(null)
      setError('')
      return
    }

    setLoading(true)
    setError(null)
    try {
      const data = await DashboardApiService.getProjectSummary(projectId, { signal })
      setSummaryData(data)
      if (!data) {
        setError('当前项目暂无共享摘要数据')
      }
    } catch (err) {
      if (signal?.aborted) return
      console.error('[Reports] Failed to load project summary', err)
      setSummaryData(null)
      setError('分析数据加载失败，请稍后重试')
      toast({ title: '分析数据加载失败', description: '请稍后重试', variant: 'destructive' })
    } finally {
      setLoading(false)
      if (!signal?.aborted) setLastRefreshedAt(new Date().toISOString())
    }
  }, [projectId])

  const loadCriticalPathSummary = useCallback(async (signal?: AbortSignal) => {
    if (!projectId) {
      setCriticalPathSummary(null)
      return
    }

    setCriticalPathLoading(true)
    try {
      const nextCriticalPath = await DashboardApiService.getProjectCriticalPathSummary(projectId, { signal })
      setCriticalPathSummary(nextCriticalPath)
    } catch (err) {
      if (signal?.aborted) return
      console.error('[Reports] Failed to load critical path summary', err)
      setCriticalPathSummary(null)
    } finally {
      setCriticalPathLoading(false)
      if (!signal?.aborted) setLastRefreshedAt(new Date().toISOString())
    }
  }, [projectId])

  const loadDataQualitySummary = useCallback(async (signal?: AbortSignal) => {
    if (!projectId) {
      setDataQualitySummary(null)
      return
    }

    try {
      const summary = await DataQualityApiService.getProjectSummary(projectId, undefined, { signal })
      setDataQualitySummary(summary)
    } catch (err) {
      if (signal?.aborted) return
      console.error('[Reports] Failed to load data quality summary', err)
      setDataQualitySummary(null)
    } finally {
      if (!signal?.aborted) setLastRefreshedAt(new Date().toISOString())
    }
  }, [projectId])

  const loadMaterialSummary = useCallback(async (signal?: AbortSignal) => {
    if (!projectId) {
      setMaterialSummary(null)
      return
    }

    try {
      const summary = await MaterialsApiService.getSummary(projectId, { signal })
      setMaterialSummary(summary)
    } catch (err) {
      if (signal?.aborted) return
      console.error('[Reports] Failed to load material summary', err)
      setMaterialSummary(null)
    } finally {
      if (!signal?.aborted) setLastRefreshedAt(new Date().toISOString())
    }
  }, [projectId])

  useEffect(() => {
    const c = new AbortController()
    void loadSummary(c.signal)
    return () => { c.abort() }
  }, [loadSummary])

  useEffect(() => {
    const c = new AbortController()
    void loadCriticalPathSummary(c.signal)
    return () => { c.abort() }
  }, [loadCriticalPathSummary])

  useEffect(() => {
    const c = new AbortController()
    void loadDataQualitySummary(c.signal)
    return () => { c.abort() }
  }, [loadDataQualitySummary])

  useEffect(() => {
    const c = new AbortController()
    void loadMaterialSummary(c.signal)
    return () => { c.abort() }
  }, [loadMaterialSummary])

  const loadDeviationAnalysis = useCallback(async (signal?: AbortSignal) => {
    if (!projectId) {
      setDeviationData(null)
      setDeviationLock(null)
      setDeviationLockError(null)
      setDeviationError('请先进入项目后再查看偏差分析')
      return
    }

    setDeviationLoading(true)
    setDeviationError(null)
    setDeviationLockError(null)
    try {
      const baselines = await apiGet<TaskBaselineListItem[]>(
        `/api/task-baselines?project_id=${encodeURIComponent(projectId)}`,
        { signal },
      )
      const latestBaseline = [...(baselines ?? [])].sort((left, right) => {
        const leftConfirmed = left.confirmed_at ? 1 : 0
        const rightConfirmed = right.confirmed_at ? 1 : 0
        if (rightConfirmed !== leftConfirmed) return rightConfirmed - leftConfirmed
        return (right.version ?? 0) - (left.version ?? 0)
      })[0]

      if (!latestBaseline) {
        setDeviationData(null)
        setDeviationLock(null)
        setDeviationError('当前项目尚未建立基线，无法展示偏差分析')
        return
      }

      setBaselineLabel(latestBaseline.title || latestBaseline.source_version_label || `v${latestBaseline.version}`)
      const [analysis, lockResult] = await Promise.all([
        apiGet<ProgressDeviationAnalysisResponse>(
          `/api/progress-deviation?project_id=${encodeURIComponent(projectId)}&baseline_version_id=${encodeURIComponent(latestBaseline.id)}`,
          { signal },
        ),
        apiGet<{ lock: BaselineVersionLock | null }>(
          `/api/progress-deviation/lock?project_id=${encodeURIComponent(projectId)}&baseline_version_id=${encodeURIComponent(latestBaseline.id)}`,
          { signal },
        ).catch((lockError) => {
          if (signal?.aborted) return { lock: null }
          setDeviationLockError(getApiErrorMessage(lockError, '版本锁状态暂时不可用'))
          return { lock: null }
        }),
      ])
      setDeviationData(analysis)
      setDeviationLock(lockResult.lock ?? analysis.version_lock ?? null)
    } catch (err) {
      if (signal?.aborted) return
      console.error('[Reports] Failed to load deviation analysis', err)
      setDeviationData(null)
      setDeviationLock(null)
      setDeviationError(getApiErrorMessage(err, '偏差分析加载失败，请稍后重试'))
      toast({ title: '偏差分析加载失败', description: '请稍后重试', variant: 'destructive' })
    } finally {
      setDeviationLoading(false)
      if (!signal?.aborted) setLastRefreshedAt(new Date().toISOString())
    }
  }, [projectId])

  useEffect(() => {
    const c = new AbortController()
    void loadDeviationAnalysis(c.signal)
    return () => { c.abort() }
  }, [loadDeviationAnalysis])

  const loadChangeLogs = useCallback(async (signal?: AbortSignal) => {
    if (!projectId) {
      setChangeLogs([])
      setChangeLogError('请先进入项目后再查看变更记录')
      return
    }

    setChangeLogLoading(true)
    setChangeLogError(null)
    try {
      const nextLogs = await apiGet<ChangeLogRecord[]>(
        `/api/change-logs?projectId=${encodeURIComponent(projectId)}&limit=50`,
        { signal },
      )
      setChangeLogs(nextLogs ?? [])
    } catch (err) {
      if (signal?.aborted) return
      console.error('[Reports] Failed to load change logs', err)
      setChangeLogs([])
      setChangeLogError(getApiErrorMessage(err, '变更记录加载失败，请稍后重试'))
    } finally {
      setChangeLogLoading(false)
      if (!signal?.aborted) setLastRefreshedAt(new Date().toISOString())
    }
  }, [projectId])

  useEffect(() => {
    const c = new AbortController()
    void loadChangeLogs(c.signal)
    return () => { c.abort() }
  }, [loadChangeLogs])

  const loadIssueSummary = useCallback(async (signal?: AbortSignal) => {
    if (!projectId) {
      setIssueSummaryData(null)
      return
    }

    setIssueSummaryLoading(true)
    try {
      const summary = await apiGet<unknown>(
        `/api/issues/summary?projectId=${encodeURIComponent(projectId)}`,
        { signal },
      )
      setIssueSummaryData(normalizeIssueSummaryResponse(summary, projectId))
    } catch (err) {
      if (signal?.aborted) return
      console.error('[Reports] Failed to load issue summary', err)
      setIssueSummaryData(null)
    } finally {
      setIssueSummaryLoading(false)
      if (!signal?.aborted) setLastRefreshedAt(new Date().toISOString())
    }
  }, [projectId])

  useEffect(() => {
    const c = new AbortController()
    void loadIssueSummary(c.signal)
    return () => { c.abort() }
  }, [loadIssueSummary])

  const summary = summaryData
  const projectScope = useStore((state) => selectProjectScopeOrEmpty(state, projectId))
  const projectTasks = useMemo(() => projectScope?.tasks ?? [], [projectScope?.tasks])
  const projectRisks = useMemo(() => projectScope?.risks ?? [], [projectScope?.risks])
  const projectConditions = useMemo(() => projectScope?.conditions ?? [], [projectScope?.conditions])
  const projectObstacles = useMemo(() => projectScope?.obstacles ?? [], [projectScope?.obstacles])
  const scopeDimensions = useStore((state) => state.scopeDimensions)
  const [reportsScopeDimensions, setReportsScopeDimensions] = useState<ScopeDimensionSection[]>([])
  const [trendMetric, setTrendMetric] = useState<ReportMetricKey>('overall_progress')
  const [trendTimeRange, setTrendTimeRange] = useState<ReportTimeRange>('30d')
  const [trendDimension, setTrendDimension] = useState<ReportDimensionKey>('none')
  const [trendData, setTrendData] = useState<ReportTrendResponse | null>(null)
  const [trendLoading, setTrendLoading] = useState(false)
  const [trendError, setTrendError] = useState<string | null>(null)
  const deviationTaskLookup = useMemo(() => new Map(projectTasks.map((task) => [String(task.id || ''), task])), [projectTasks])
  const issueRows = useStore((state) => state.issueRows)
  const projectIssues = useMemo(() => issueRows, [issueRows])
  const activeProjectIssues = useMemo(() => projectIssues.filter((row) => row.status !== 'closed'), [projectIssues])
  const recentProjectIssues = useMemo(
    () =>
      [...projectIssues]
        .sort((left, right) => {
          const leftAt = new Date(left.createdAt || 0).getTime()
          const rightAt = new Date(right.createdAt || 0).getTime()
          return rightAt - leftAt
        })
        .slice(0, 6),
    [projectIssues],
  )
  const emptyIssueSummary = useMemo<IssueSummaryResponse>(() => normalizeIssueSummaryResponse(null, projectId || undefined), [projectId])
  const issueSummary = issueSummaryData ?? emptyIssueSummary
  useEffect(() => {
    if (!projectId) {
      setReportsScopeDimensions([])
      return
    }

    const controller = new AbortController()
    void (async () => {
      try {
        const response = await apiGet<{ project_id: string | null; sections: ScopeDimensionSection[] }>(
          `/api/scope-dimensions?projectId=${encodeURIComponent(projectId)}`,
          { signal: controller.signal },
        )
        if (!controller.signal.aborted) {
          setReportsScopeDimensions(Array.isArray(response.sections) ? response.sections : [])
        }
      } catch (err) {
        if (controller.signal.aborted) return
        console.error('[Reports] Failed to load scope dimensions', err)
        setReportsScopeDimensions([])
      }
    })()

    return () => {
      controller.abort()
    }
  }, [projectId])

  useEffect(() => {
    if (!projectId) {
      setTrendData(null)
      setTrendError(null)
      setTrendLoading(false)
      return
    }

    const controller = new AbortController()
    const window = resolveReportTrendWindow(trendTimeRange)
    const query = new URLSearchParams({
      projectId,
      metric: trendMetric,
      groupBy: trendDimension,
      granularity: window.granularity,
    })

    if (window.from) {
      query.set('from', window.from)
    }
    if (window.to) {
      query.set('to', window.to)
    }

    setTrendLoading(true)
    setTrendError(null)
    void (async () => {
      try {
        const data = await apiGet<ReportTrendResponse>(`/api/analytics/project-trend?${query.toString()}`, {
          signal: controller.signal,
        })
        if (!controller.signal.aborted) {
          setTrendData(data)
        }
      } catch (err) {
        if (controller.signal.aborted) return
        console.error('[Reports] Failed to load trend analytics', err)
        setTrendData(null)
        setTrendError(getApiErrorMessage(err, '趋势数据加载失败，请稍后重试'))
      } finally {
        if (!controller.signal.aborted) {
          setTrendLoading(false)
        }
      }
    })()

    return () => {
      controller.abort()
    }
  }, [projectId, trendDimension, trendMetric, trendTimeRange])

  const milestoneTasks = useMemo(
    () =>
      projectTasks
        .filter((task) => task.is_milestone)
        .sort((left, right) => (left.planned_end_date || '').localeCompare(right.planned_end_date || '')),
    [projectTasks],
  )
  const reportMilestoneCards = useMemo(() => {
    const milestoneTaskMap = new Map(milestoneTasks.map((task) => [String(task.id || ''), task]))
    const summaryItems = Array.isArray(summary?.milestoneOverview?.items) ? summary.milestoneOverview.items : []

    if (summaryItems.length > 0) {
      return summaryItems.slice(0, 5).map((item) => buildReportMilestoneCard(item as unknown as ReportMilestoneCard & {
        targetDate?: string | null
        planned_date?: string | null
        current_planned_date?: string | null
        actual_date?: string | null
      }, milestoneTaskMap.get(String(item.id || '')) ?? null))
    }

    return milestoneTasks.slice(0, 5).map((task) => buildReportMilestoneCard({
      id: String(task.id || ''),
      name: getTaskDisplayName(task),
      statusLabel: getTaskStatus(task),
      progress: Number(task.progress ?? 0),
      targetDate: task.end_date || task.planned_end_date || null,
      planned_date: task.end_date || null,
      current_planned_date: task.planned_end_date || task.end_date || null,
      actual_date: task.actual_end_date || null,
    }, task))
  }, [milestoneTasks, summary?.milestoneOverview?.items])
  const delayedTasks = useMemo(
    () => projectTasks.filter(isDelayedTask).slice(0, 6),
    [projectTasks],
  )
  const focusRisks = useMemo(
    () =>
      [...projectRisks]
        .sort((left, right) => {
          const score = (value?: string | null) => {
            switch (value) {
              case 'critical':
              case '严重':
                return 4
              case 'high':
              case '高':
                return 3
              case 'medium':
              case '中':
                return 2
              default:
                return 1
            }
          }
          return score(right.level) - score(left.level)
        })
        .slice(0, 6),
    [projectRisks],
  )
  const wbsFocusRows = useMemo(
    () =>
      [...projectTasks]
        .sort((left, right) => (left.wbs_code || '').localeCompare(right.wbs_code || ''))
        .slice(0, 8),
    [projectTasks],
  )
  const obstacleTypeSummary = useMemo(
    () => buildCountSummary(projectObstacles, (obstacle) => getObstacleTypeLabel(obstacle)),
    [projectObstacles],
  )
  const delayStatisticsRows = useMemo(
    () =>
      delayedTasks.map((task) => {
        const plannedEnd = task.planned_end_date || task.end_date
        const delayDays = plannedEnd
          ? Math.max(0, Math.ceil((Date.now() - new Date(plannedEnd).getTime()) / 86400000))
          : 0
        return {
          id: String(task.id || ''),
          title: getTaskDisplayName(task),
          delayDays,
          owner: getResponsibilityLabel(task),
          plannedEnd: plannedEnd || null,
        }
      }).sort((left, right) => right.delayDays - left.delayDays),
    [delayedTasks],
  )
  const delayObstacleCorrelationRows = useMemo(
    () => buildDelayObstacleCorrelationRows(delayedTasks, projectObstacles),
    [delayedTasks, projectObstacles],
  )

  const analysisEntries: AnalysisEntry[] = useMemo(
    () => [
      {
        view: 'progress',
        title: '项目进度总览分析',
        description: '集中查看整体进度、里程碑窗口、专项准备度与关键路径摘要。',
        moduleLabel: '里程碑',
        actionLabel: '进入项目进度总览',
        icon: Flag,
        to: `/projects/${projectId}/reports?view=progress`,
      },
      {
        view: 'progress_deviation',
        title: '进度偏差分析',
        description: '拆分基线偏差、月度兑现偏差和执行偏差三条主线，统一下钻查看。',
        moduleLabel: '进度偏差',
        actionLabel: '进入偏差分析',
        icon: BarChart3,
        to: `/projects/${projectId}/reports?view=execution`,
      },
      {
        view: 'risk',
        title: '风险与问题分析',
        description: '查看风险压力、问题聚合、条件未满足、阻碍类型与治理建议。',
        moduleLabel: '风险与问题',
        actionLabel: '进入风险分析',
        icon: ShieldAlert,
        to: `/projects/${projectId}/reports?view=risk`,
      },
      {
        view: 'change_log',
        title: '变更记录分析',
        description: '从任务管理进入，集中查看范围、计划和执行层面的变更记录入口。',
        moduleLabel: '任务管理 / 变更记录',
        actionLabel: '进入变更记录分析',
        icon: RefreshCw,
        to: `/projects/${projectId}/reports?view=change_log`,
      },
    ],
    [projectId],
  )

  const activeEntry = analysisEntries.find((entry) => entry.view === activeView)

  const changeLogSourceSummary = useMemo(
    () => buildCountSummary(changeLogs, (record) => record.change_source || 'manual_adjusted'),
    [changeLogs],
  )
  const changeLogTypeCounts = useMemo(() => buildChangeLogTypeCounts(changeLogs), [changeLogs])
  const recentChangeLogs = useMemo(() => changeLogs.slice(0, 8), [changeLogs])
  const deviationViewLabel = viewLabels[deviationView]

  const viewConfig = useMemo(() => {
    if (activeView === 'progress') {
      return {
        eyebrow: '里程碑分析',
        title: '项目进度总览分析',
        subtitle: '从里程碑、专项准备和关键路径三个维度查看项目推进态势。',
        backLabel: '返回里程碑',
        backTo: projectId ? `/projects/${projectId}/milestones` : undefined,
        metrics: [
          { title: '总体进度', value: `${summary?.overallProgress ?? '--'}%`, hint: `共享摘要口径 · 任务总数 ${summary?.totalTasks ?? 0}`, icon: <BarChart3 className="h-4 w-4" /> },
          { title: '里程碑完成', value: `${summary?.completedMilestones ?? 0}/${summary?.totalMilestones ?? 0}`, hint: `完成率 ${summary?.milestoneProgress ?? 0}%`, icon: <Flag className="h-4 w-4" /> },
          { title: '延期任务', value: summary?.delayedTaskCount ?? 0, hint: `延期天数 ${summary?.delayDays ?? 0} · 次数 ${summary?.delayCount ?? 0}`, icon: <ClipboardList className="h-4 w-4" /> },
          { title: 'WBS完成度', value: `${summary?.taskProgress ?? summary?.overallProgress ?? 0}%`, hint: `叶子任务 ${summary?.leafTaskCount ?? summary?.totalTasks ?? 0}`, icon: <BarChart3 className="h-4 w-4" /> },
        ] as MetricItem[],
      }
    }

    if (activeView === 'progress_deviation') {
      return {
        eyebrow: '偏差分析',
        title: '进度偏差分析',
        subtitle: '基线、月度兑现偏差和执行三视角联动，统一下钻偏差条目。',
        backLabel: '返回项目总览',
        backTo: projectId ? `/projects/${projectId}/dashboard` : undefined,
        metrics: [
          { title: '偏差任务', value: deviationData?.summary.deviated_items ?? 0, hint: `总条目 ${deviationData?.summary.total_items ?? 0}`, icon: <BarChart3 className="h-4 w-4" /> },
          { title: '待收口项', value: deviationData?.summary.unresolved_items ?? 0, hint: '基线/月度/执行链路未闭环条目', icon: <ClipboardList className="h-4 w-4" /> },
          { title: '滚入下月', value: deviationData?.summary.carryover_items ?? 0, hint: '影响月度兑现的跨月事项', icon: <RefreshCw className="h-4 w-4" /> },
          { title: '当前主线', value: deviationViewLabel, hint: '可切换基线 / 月度兑现偏差 / 执行三条视角', icon: <Flag className="h-4 w-4" /> },
        ] as MetricItem[],
      }
    }

    if (activeView === 'risk') {
      return {
        eyebrow: '风险分析',
        title: '风险与问题分析',
        subtitle: '风险、问题、条件和阻碍在同一页联动分析。',
        backLabel: '返回风险与问题',
        backTo: projectId ? `/projects/${projectId}/risks` : undefined,
        metrics: [
          { title: '活跃风险', value: summary?.activeRiskCount ?? 0, hint: `总风险 ${summary?.riskCount ?? 0}`, icon: <ShieldAlert className="h-4 w-4" /> },
          { title: '条件未满足', value: summary?.pendingConditionCount ?? 0, hint: `任务数 ${summary?.pendingConditionTaskCount ?? 0}`, icon: <CheckSquare className="h-4 w-4" /> },
          { title: '阻碍事项', value: summary?.activeObstacleCount ?? 0, hint: `任务数 ${summary?.activeObstacleTaskCount ?? 0}`, icon: <ClipboardList className="h-4 w-4" /> },
          { title: '健康度', value: summary?.healthScore ?? '--', hint: summary?.healthStatus || '共享摘要口径', icon: <BarChart3 className="h-4 w-4" /> },
        ] as MetricItem[],
      }
    }

    if (activeView === 'change_log') {
      return {
        eyebrow: '任务管理分析',
        title: '变更记录分析',
        subtitle: '范围、计划和执行层面的变更轨迹统一回溯。',
        backLabel: '返回任务管理',
        backTo: projectId ? `/projects/${projectId}/gantt` : undefined,
        metrics: [
          { title: '变更记录', value: changeLogs.length, hint: '项目级变更留痕总数', icon: <ClipboardList className="h-4 w-4" /> },
          { title: '延期相关', value: changeLogTypeCounts.planningRelated, hint: '计划调整与延期审批记录', icon: <RefreshCw className="h-4 w-4" /> },
          { title: '任务 / 里程碑', value: changeLogTypeCounts.scopeRelated, hint: '任务与关键节点变更', icon: <Flag className="h-4 w-4" /> },
          { title: '最近来源', value: changeLogSourceSummary[0]?.[0] || '暂无', hint: `最近 50 条共 ${changeLogs.length} 条`, icon: <BarChart3 className="h-4 w-4" /> },
        ] as MetricItem[],
      }
    }

    return {
      eyebrow: '里程碑分析',
      title: '项目进度总览分析',
      subtitle: '从里程碑、专项准备和关键路径三个维度查看项目推进态势。',
      backLabel: '返回里程碑',
      backTo: projectId ? `/projects/${projectId}/milestones` : undefined,
      metrics: [
        { title: '总体进度', value: `${summary?.overallProgress ?? '--'}%`, hint: `共享摘要口径 · 任务总数 ${summary?.totalTasks ?? 0}`, icon: <BarChart3 className="h-4 w-4" /> },
        { title: '里程碑完成', value: `${summary?.completedMilestones ?? 0}/${summary?.totalMilestones ?? 0}`, hint: `完成率 ${summary?.milestoneProgress ?? 0}%`, icon: <Flag className="h-4 w-4" /> },
        { title: '延期任务', value: summary?.delayedTaskCount ?? 0, hint: `延期天数 ${summary?.delayDays ?? 0} · 次数 ${summary?.delayCount ?? 0}`, icon: <ClipboardList className="h-4 w-4" /> },
        { title: 'WBS完成度', value: `${summary?.taskProgress ?? summary?.overallProgress ?? 0}%`, hint: `叶子任务 ${summary?.leafTaskCount ?? summary?.totalTasks ?? 0}`, icon: <BarChart3 className="h-4 w-4" /> },
      ] as MetricItem[],
    }

  }, [activeView, changeLogSourceSummary, changeLogTypeCounts, changeLogs, deviationData, deviationViewLabel, projectId, projectName, summary])

  const currentMetrics = viewConfig.metrics
  const reportScopeSections = reportsScopeDimensions.length > 0 ? reportsScopeDimensions : scopeDimensions
  const selectedTrendMetric = REPORT_METRIC_OPTIONS.find((option) => option.value === trendMetric) ?? REPORT_METRIC_OPTIONS[0]
  const selectedTrendRange = REPORT_TIME_RANGE_OPTIONS.find((option) => option.value === trendTimeRange) ?? REPORT_TIME_RANGE_OPTIONS[1]
  const selectedTrendDimension = reportScopeSections.find((section) => section.key === trendDimension) ?? null
  const trendPoints = trendData?.points ?? []
  const hasSummary = Boolean(summary)

  useEffect(() => {
    if (trendDimension !== 'none' && !reportScopeSections.some((section) => section.key === trendDimension)) {
      setTrendDimension('none')
    }
  }, [reportScopeSections, trendDimension])
  const deviationMainlineKey: Record<DeviationView, ProgressDeviationMainlineKey> = {
    baseline: 'baseline',
    monthly: 'monthly_plan',
    execution: 'execution',
  }
  const deviationMainline = deviationData?.mainlines.find((mainline) => mainline.key === deviationMainlineKey[deviationView]) ?? null
  const deviationRowDetails = useMemo(
    () => new Map((deviationData?.rows ?? []).map((row) => [row.id, row] as const)),
    [deviationData?.rows],
  )
  const deviationRows = useMemo(() => {
    const rows = deviationMainline?.rows ?? deviationData?.rows.filter((row) => row.mainline === deviationMainlineKey[deviationView]) ?? []
    return rows.map((row) => {
      const detail = deviationRowDetails.get(row.id)
      return detail ? { ...row, ...detail } : row
    })
  }, [deviationData?.rows, deviationMainline?.rows, deviationMainlineKey[deviationView], deviationRowDetails, deviationView])
  const deviationVersionEvents = deviationData?.trend_events ?? []
  const activeDeviationLock = deviationLock ?? deviationData?.version_lock ?? null
  const deviationRowMeta = useMemo(
    () =>
      deviationRows.map((row) => {
        const task = row.source_task_id ? deviationTaskLookup.get(row.source_task_id) ?? null : null
        return {
          row,
          task,
          buildingLabel: getTaskBuildingLabel(task),
          sectionLabel: getTaskSectionLabel(task),
          specialtyLabel: getTaskSpecialtyLabel(task),
          levelLabel: getDeviationStatusLabel(row.status),
          actualDateKey: row.actual_date ? row.actual_date.slice(0, 10) : '',
        }
      }),
    [deviationRows, deviationTaskLookup],
  )
  const deviationFilterOptions = useMemo(() => {
    const uniqueValues = (items: string[]) => [...new Set(items.map((value) => String(value || '').trim()).filter((value) => value && value !== '未设置'))].sort((left, right) => left.localeCompare(right, 'zh-CN'))
    const taskScopeOptions = (section?: { selected?: string[]; options?: string[] }) => section?.selected?.length ? section.selected : section?.options ?? []
    const buildingScope = scopeDimensions.find((section) => section.key === 'building')
    const specialtyScope = scopeDimensions.find((section) => section.key === 'specialty')
    const phaseScope = scopeDimensions.find((section) => section.key === 'phase')

    return {
      buildings: uniqueValues([
        ...deviationRowMeta.map((item) => item.buildingLabel),
        ...taskScopeOptions(buildingScope),
      ]),
      sections: uniqueValues([
        ...deviationRowMeta.map((item) => item.sectionLabel),
        ...taskScopeOptions(phaseScope),
      ]),
      specialties: uniqueValues([
        ...deviationRowMeta.map((item) => item.specialtyLabel),
        ...taskScopeOptions(specialtyScope),
      ]),
      levels: uniqueValues(deviationRowMeta.map((item) => String(item.row.status || '').trim())),
    }
  }, [deviationRowMeta, scopeDimensions])
  const filteredDeviationRows = useMemo(
    () =>
      deviationRowMeta
        .filter((item) => {
          if (deviationTimeRange !== 'all') {
            if (!item.actualDateKey) return false
            const now = new Date()
            const start = new Date(now)
            const days = deviationTimeRange === '7d' ? 7 : deviationTimeRange === '30d' ? 30 : 90
            start.setDate(start.getDate() - days)
            const current = new Date(`${item.actualDateKey}T00:00:00.000Z`)
            if (current < start) return false
          }

          if (deviationBuildingFilter !== 'all' && item.buildingLabel !== deviationBuildingFilter) return false
          if (deviationSectionFilter !== 'all' && item.sectionLabel !== deviationSectionFilter) return false
          if (deviationSpecialtyFilter !== 'all' && item.specialtyLabel !== deviationSpecialtyFilter) return false
          if (deviationLevelFilter !== 'all' && item.row.status !== deviationLevelFilter) return false
          return true
        })
        .map((item) => item.row),
    [deviationBuildingFilter, deviationLevelFilter, deviationRowMeta, deviationSectionFilter, deviationSpecialtyFilter, deviationTimeRange],
  )
  const deviationTableRows = useMemo(() => {
    if (deviationView !== 'execution') {
      return filteredDeviationRows
    }

    return [...filteredDeviationRows].sort((left, right) => {
      const leftLinked = left.source_task_id ? 1 : 0
      const rightLinked = right.source_task_id ? 1 : 0
      if (rightLinked !== leftLinked) return rightLinked - leftLinked
      return Math.abs(right.deviation_days) - Math.abs(left.deviation_days)
    })
  }, [deviationView, filteredDeviationRows])
  const filteredDeviationRowIds = useMemo(
    () => new Set(filteredDeviationRows.map((row) => row.id)),
    [filteredDeviationRows],
  )
  const baselineDeviationChartRows = useMemo(() => {
    const rows = deviationData?.chart_data?.baselineDeviation
    if (!rows?.length) return filteredDeviationRows
    return rows.filter((row) => filteredDeviationRowIds.has(row.id))
  }, [deviationData?.chart_data?.baselineDeviation, filteredDeviationRowIds, filteredDeviationRows])
  const executionDeviationChartRows = useMemo(() => {
    const rows = deviationData?.chart_data?.executionDeviation
    if (!rows?.length) return filteredDeviationRows
    return rows.filter((row) => filteredDeviationRowIds.has(row.id))
  }, [deviationData?.chart_data?.executionDeviation, filteredDeviationRowIds, filteredDeviationRows])
  const monthlyFulfillmentBuckets = deviationData?.chart_data?.monthlyFulfillment ?? deviationData?.chart_data?.monthly_buckets
  const responsibilityContribution = useMemo<ProgressDeviationResponsibilityContribution[]>(() => {
    return deviationData?.responsibility_contribution ?? []
  }, [deviationData?.responsibility_contribution])
  const topDeviationCauses = useMemo<ProgressDeviationCauseSummary[]>(() => {
    return deviationData?.top_deviation_causes ?? []
  }, [deviationData?.top_deviation_causes])
  useEffect(() => {
    if (activeView !== 'progress_deviation') {
      if (selectedDeviationRow !== null) {
        setSelectedDeviationRow(null)
      }
      return
    }

    if (selectedDeviationRow && !filteredDeviationRows.some((row) => row.id === selectedDeviationRow.id)) {
      setSelectedDeviationRow(null)
    }
  }, [activeView, filteredDeviationRows, selectedDeviationRow])

  const deviationChips = useMemo(
    () => [
      { key: 'tasks' as const, label: '任务', value: projectTasks.length },
      { key: 'risks' as const, label: '风险', value: projectRisks.length },
      { key: 'conditions' as const, label: '条件', value: projectConditions.length },
      { key: 'obstacles' as const, label: '阻碍', value: projectObstacles.length },
    ],
    [projectConditions.length, projectObstacles.length, projectRisks.length, projectTasks.length],
  )
  const secondarySummaryCards = useMemo(
    () => [
      {
        title: '基线偏差',
        value: `${summary?.completedMilestones ?? 0}/${summary?.totalMilestones ?? 0}`,
        description: '基线节点、版本切换和对应关系状态共同影响当前判断。',
        hint: '非主线摘要默认折叠',
      },
      {
        title: '月度兑现偏差',
        value: `${summary?.overallProgress ?? 0}%`,
        description: '月度兑现偏差受确认状态、延期与月末待处理事项共同影响。',
        hint: '非主线摘要默认折叠',
      },
      {
        title: '执行偏差',
        value: projectTasks.length,
        description: '执行偏差聚焦任务推进、条件阻碍与完成节奏。',
        hint: '默认主线聚焦执行偏差',
      },
    ],
    [projectTasks.length, summary?.completedMilestones, summary?.overallProgress, summary?.totalMilestones],
  )
  const pageHeaderConfig = {
    breadcrumbLabel: viewConfig.title,
    eyebrow: viewConfig.eyebrow,
    title: viewConfig.title,
    subtitle: viewConfig.subtitle,
    backLabel: viewConfig.backLabel,
    backTo: viewConfig.backTo,
  }

  const handleRefreshReports = () => {
    void loadSummary()
    void loadCriticalPathSummary()
    void loadDataQualitySummary()
    void loadMaterialSummary()
    void loadDeviationAnalysis()
    void loadChangeLogs()
    void loadIssueSummary()
  }

  const handleExportCurrentView = async (format: 'xlsx' | 'pdf') => {
    if (format === 'pdf') {
      window.print()
      return
    }

    const XLSX: XlsxModule = await import('xlsx')

    const buildSheet = (rows: Record<string, unknown>[], emptyLabel: string) =>
      XLSX.utils.json_to_sheet(rows.length > 0 ? rows : [{ 提示: emptyLabel }])

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const fileBase = `${projectName}-${pageHeaderConfig.title}-${timestamp}`
      .replace(/[\\/:*?"<>|]+/g, '-')
      .replace(/\s+/g, '_')

    const workbook = XLSX.utils.book_new()
    const overviewRows = currentMetrics.map((metric) => ({
      指标: metric.title,
      数值: typeof metric.value === 'number' ? metric.value : String(metric.value),
      说明: metric.hint || '',
    }))
    XLSX.utils.book_append_sheet(workbook, buildSheet(overviewRows, '当前视图暂无概览数据'), '概览')

    if (activeView === 'progress') {
      XLSX.utils.book_append_sheet(
        workbook,
        buildSheet(
          reportMilestoneCards.map((milestone) => ({
            里程碑: milestone.name,
            状态: milestone.statusLabel,
            进度: milestone.progress,
            计划日期: formatDateLabel(milestone.plannedDate),
            当前计划: formatDateLabel(milestone.currentPlannedDate),
            实际日期: formatDateLabel(milestone.actualDate),
          })),
          '当前视图暂无里程碑数据',
        ),
        '里程碑',
      )
      XLSX.utils.book_append_sheet(
        workbook,
        buildSheet(
          delayedTasks.map((task) => ({
            任务: getTaskDisplayName(task),
            状态: getTaskStatus(task),
            责任主体: getResponsibilityLabel(task),
            计划完成: formatDateLabel(task.planned_end_date || task.end_date || null),
            实际完成: formatDateLabel(task.actual_end_date || null),
          })),
          '当前视图暂无延期任务',
        ),
        '延期任务',
      )
    } else if (activeView === 'progress_deviation') {
      XLSX.utils.book_append_sheet(
        workbook,
        buildSheet(
          deviationRows.map((row) => ({
            条目: row.title,
            主线: deviationMainline?.label || row.mainline,
            计划进度: row.planned_progress ?? '',
            实际进度: row.actual_progress ?? '',
            实际日期: formatDateLabel(row.actual_date || null),
            偏差天数: row.deviation_days,
            偏差率: `${row.deviation_rate}%`,
            状态: row.status,
            原因: row.reason || '',
            映射状态: row.mapping_status || 'mapped',
            合并到: row.merged_into?.title || '',
            子项数: row.child_group?.child_count ?? '',
          })),
          '当前视图暂无偏差明细',
        ),
        '偏差明细',
      )
      XLSX.utils.book_append_sheet(
        workbook,
        buildSheet(
          deviationVersionEvents.map((event) => ({
            切换日期: event.switch_date,
            从版本: event.from_version,
            到版本: event.to_version,
            说明: event.explanation,
          })),
          '当前视图暂无切换事件',
        ),
        '切换事件',
      )
    } else if (activeView === 'risk') {
      XLSX.utils.book_append_sheet(
        workbook,
        buildSheet(
          focusRisks.map((risk) => ({
            风险: risk.title || '未命名风险',
            描述: risk.description || '',
            等级: risk.level || '',
            来源: summarizeRiskSource(risk),
            状态: parseStatusLabel(risk.status),
          })),
          '当前视图暂无风险清单',
        ),
        '风险清单',
      )
      XLSX.utils.book_append_sheet(
        workbook,
        buildSheet(
          activeProjectIssues.map((issue) => ({
            问题: issue.title,
            状态: getIssueStatusLabel(issue.status),
            来源: getIssueSourceLabel(issue.sourceType),
            严重度: getIssueSeverityLabel(issue.severity),
            创建时间: formatDateTimeLabel(issue.createdAt),
            描述: issue.description || '',
          })),
          '当前视图暂无问题清单',
        ),
        '问题清单',
      )
    } else if (activeView === 'change_log') {
      XLSX.utils.book_append_sheet(
        workbook,
        buildSheet(
          recentChangeLogs.map((record) => ({
            实体类型: record.entity_type,
            字段: record.field_name,
            来源: record.change_source || 'manual_adjusted',
            旧值: record.old_value || '',
            新值: record.new_value || '',
            原因: record.change_reason || '',
            时间: record.changed_at || '',
          })),
          '当前视图暂无变更记录',
        ),
        '变更记录',
      )
    }

    XLSX.writeFile(workbook, `${fileBase}.xlsx`)
  }

  const openEntry = (entry: AnalysisEntry) => {
    if (!projectId) return
    navigate(entry.to)
  }

  const renderProgressDetail = () => (
    <>
      <CriticalPathSummaryCard summary={criticalPathSummary} />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)]">
      <Card className="border-slate-200 shadow-sm">
        <CardHeader className="pb-4">
          <CardTitle className="text-base">工期偏差与执行判断</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <DetailStatCard label="整体完成率" value={`${summary?.overallProgress ?? 0}%`} hint={`任务总数 ${summary?.totalTasks ?? 0}`} />
            <DetailStatCard label="里程碑完成率" value={`${summary?.milestoneProgress ?? 0}%`} hint={`${summary?.completedMilestones ?? 0}/${summary?.totalMilestones ?? 0}`} />
            <DetailStatCard label="延期任务" value={summary?.delayedTaskCount ?? delayedTasks.length} hint={`累计延期 ${summary?.delayDays ?? 0} 天`} />
            <DetailStatCard
              label="验收通过"
              value={`${summary?.passedAcceptancePlanCount ?? 0}/${summary?.acceptancePlanCount ?? 0}`}
              hint={`进行中 ${summary?.inProgressAcceptancePlanCount ?? 0} · 需补充 ${summary?.failedAcceptancePlanCount ?? 0}`}
              to={projectId ? `/projects/${projectId}/acceptance?status=passed&phase=all` : '/acceptance?status=passed&phase=all'}
              testId="reports-acceptance-summary-link"
            />
          </div>
        </CardContent>
      </Card>

      <Card className="border-slate-200 shadow-sm">
        <CardHeader className="pb-4">
          <CardTitle className="text-base">里程碑窗口</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {reportMilestoneCards.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
              暂无里程碑任务
            </div>
          ) : (
            reportMilestoneCards.map((milestone) => (
              <div key={milestone.id} className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-medium text-slate-900">{milestone.name}</div>
                  <div className="text-xs text-slate-500">{milestone.statusLabel}</div>
                </div>
                <div className="mt-3 grid gap-2 text-[11px] text-slate-500 sm:grid-cols-3" data-testid="reports-milestone-three-time">
                  <div className="rounded-lg bg-white px-2 py-1.5">
                    <div className="text-[10px] uppercase tracking-wide text-slate-400">计划</div>
                    <div className="mt-0.5 font-medium text-slate-700">{formatDateLabel(milestone.plannedDate)}</div>
                  </div>
                  <div className="rounded-lg bg-white px-2 py-1.5">
                    <div className="text-[10px] uppercase tracking-wide text-slate-400">当前</div>
                    <div className="mt-0.5 font-medium text-slate-700">{formatDateLabel(milestone.currentPlannedDate)}</div>
                  </div>
                  <div className="rounded-lg bg-white px-2 py-1.5">
                    <div className="text-[10px] uppercase tracking-wide text-slate-400">实际</div>
                    <div className="mt-0.5 font-medium text-slate-700">{formatDateLabel(milestone.actualDate)}</div>
                  </div>
                </div>
                <div className="mt-2 text-xs text-slate-500">
                  当前进度 {milestone.progress}% · 主对比 {formatDateLabel(milestone.currentPlannedDate)} / {formatDateLabel(milestone.actualDate)}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card className="border-slate-200 shadow-sm">
        <CardHeader className="pb-4">
          <CardTitle className="text-base">专项与关键路径概览</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3">
          <DetailStatCard
            label="专项准备度"
            value={(summary?.completedPreMilestoneCount ?? 0) + (summary?.issuedConstructionDrawingCount ?? 0)}
            hint={`证照 ${summary?.completedPreMilestoneCount ?? 0}/${summary?.preMilestoneCount ?? 0} · 图纸 ${summary?.issuedConstructionDrawingCount ?? 0}/${summary?.constructionDrawingCount ?? 0}`}
          />
          <DetailStatCard
            label="验收通过"
            value={`${summary?.passedAcceptancePlanCount ?? 0}/${summary?.acceptancePlanCount ?? 0}`}
            hint={`进行中 ${summary?.inProgressAcceptancePlanCount ?? 0} · 需补充 ${summary?.failedAcceptancePlanCount ?? 0}`}
          />
          <DetailStatCard
            label="条件 / 阻碍压力"
            value={`${summary?.pendingConditionTaskCount ?? 0}/${summary?.activeObstacleTaskCount ?? 0}`}
            hint="条件未满足任务 / 受阻任务"
          />
        </CardContent>
      </Card>

      <Card className="border-slate-200 shadow-sm xl:col-span-2">
        <CardHeader className="pb-4">
          <CardTitle className="text-base">关键任务 / WBS 节点</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {wbsFocusRows.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
              暂无任务节点数据
            </div>
          ) : (
            wbsFocusRows.map((task) => (
              <div key={task.id} className="grid gap-3 rounded-2xl border border-slate-100 bg-white px-4 py-4 md:grid-cols-[minmax(0,1.2fr)_120px_140px_120px]">
                <div>
                  <div className="text-sm font-medium text-slate-900">{getTaskDisplayName(task)}</div>
                  <div className="mt-1 text-xs text-slate-500">WBS {task.wbs_code || '未编码'} · {getTaskStatus(task)}</div>
                </div>
                <div className="text-sm text-slate-700">进度 {task.progress ?? 0}%</div>
                <div className="text-sm text-slate-700">计划完成 {formatDateLabel(task.planned_end_date || task.end_date)}</div>
                <div className={`text-sm font-medium ${isDelayedTask(task) ? 'text-red-600' : 'text-slate-700'}`}>
                  {isDelayedTask(task) ? '存在延期' : '节奏正常'}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
      </div>
    </>
  )

  const renderProgressDeviationDetail = () => {
    const showTaskSections = deviationFocus === 'all' || deviationFocus === 'tasks'
    const showRiskSections = deviationFocus === 'all' || deviationFocus === 'risks'
    const showConditionSections = deviationFocus === 'all' || deviationFocus === 'conditions'
    const showObstacleSections = deviationFocus === 'all' || deviationFocus === 'obstacles'

    return (
      <>
      <CriticalPathSummaryCard summary={criticalPathSummary} />
      <DeviationFocusHint
        activeView={deviationView}
        defaultView="execution"
        secondaryExpanded={secondaryExpanded}
        onToggleSecondaryExpanded={() => setSecondaryExpanded((value) => !value)}
      />

      <DeviationTabs
        value={deviationView}
        onValueChange={(value) => {
          navigate(`/projects/${projectId}/reports?view=${value}`)
        }}
      />

      <div
        data-testid="deviation-filter-chips"
        className="flex flex-wrap gap-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
      >
        {deviationChips.map((chip) => (
          <button
            key={chip.label}
            type="button"
            onClick={() => setDeviationFocus(chip.key)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              deviationFocus === chip.key
                ? 'bg-slate-900 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {chip.label} {chip.value}
          </button>
        ))}
        <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
          当前聚焦 {getDeviationFocusLabel(deviationFocus)}
        </span>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard
          title="基线偏差"
          value={deviationData?.summary.baseline_items ?? 0}
          hint="聚焦基线节点、对应关系状态与版本切换影响"
          icon={<Flag className="h-4 w-4" />}
        />
        <MetricCard
          title="月度兑现偏差"
          value={deviationData?.summary.monthly_plan_items ?? 0}
          hint="聚焦月度计划兑现、延期与月末待处理事项"
          icon={<ClipboardList className="h-4 w-4" />}
        />
        <MetricCard
          title="执行偏差"
          value={deviationData?.summary.execution_items ?? projectTasks.length}
          hint="聚焦任务推进、条件阻碍与执行节奏"
          icon={<BarChart3 className="h-4 w-4" />}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <DetailStatCard
          label="验收通过"
          value={`${summary?.passedAcceptancePlanCount ?? 0}/${summary?.acceptancePlanCount ?? 0}`}
          hint={`进行中 ${summary?.inProgressAcceptancePlanCount ?? 0} · 需补充 ${summary?.failedAcceptancePlanCount ?? 0}`}
          to={projectId ? `/projects/${projectId}/acceptance?status=passed&phase=all` : '/acceptance?status=passed&phase=all'}
          testId="reports-acceptance-summary-link"
        />
      </div>

      <Card data-testid="reports-deviation-lock-card" className="border-slate-200 shadow-sm">
        <CardContent className="flex flex-wrap items-center justify-between gap-4 p-5">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-sm font-medium text-slate-900">
              <LockKeyhole className="h-4 w-4 text-slate-500" />
              版本锁状态
            </div>
            <div className="text-sm text-slate-600">
              {activeDeviationLock?.is_locked
                ? `${baselineLabel} 已锁定 · ${activeDeviationLock.locked_by || '系统'}`
                : `${baselineLabel} 未锁定`}
            </div>
            {deviationLockError ? (
              <div className="text-xs text-amber-700">{deviationLockError}</div>
            ) : null}
          </div>
          <div className="grid gap-2 text-right text-xs text-slate-500 sm:min-w-[220px]">
            <div>锁定时间：{formatDateTimeLabel(activeDeviationLock?.locked_at)}</div>
            <div>到期时间：{formatDateTimeLabel(activeDeviationLock?.lock_expires_at)}</div>
          </div>
        </CardContent>
      </Card>

      {deviationError ? (
        <Card className="border-slate-200 shadow-sm">
          <CardContent className="py-10 text-center text-sm text-red-600">
            {deviationError}
          </CardContent>
        </Card>
      ) : deviationLoading && !deviationData ? (
        <LoadingState
          label="偏差分析加载中"
          className="min-h-40"
        />
      ) : (
        <>
          {showTaskSections ? (
            <>
          <BaselineSwitchMarker events={deviationVersionEvents} baselineLabel={baselineLabel} />

          <Card data-testid="reports-deviation-filter-panel" className="border-slate-200 shadow-sm">
            <CardHeader className="pb-4">
              <CardTitle className="text-base">偏差筛选</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
              <label className="space-y-1 text-xs text-slate-500">
                <span>时间范围</span>
                <select
                  className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700"
                  value={deviationTimeRange}
                  onChange={(event) => setDeviationTimeRange(event.target.value as 'all' | '7d' | '30d' | '90d')}
                >
                  <option value="all">全部时间</option>
                  <option value="7d">近 7 天</option>
                  <option value="30d">近 30 天</option>
                  <option value="90d">近 90 天</option>
                </select>
              </label>
              <label className="space-y-1 text-xs text-slate-500">
                <span>楼栋</span>
                <select
                  className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700"
                  value={deviationBuildingFilter}
                  onChange={(event) => setDeviationBuildingFilter(event.target.value)}
                >
                  <option value="all">全部楼栋</option>
                  {deviationFilterOptions.buildings.map((value) => (
                    <option key={value} value={value}>{value}</option>
                  ))}
                </select>
              </label>
              <label className="space-y-1 text-xs text-slate-500">
                <span>标段</span>
                <select
                  className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700"
                  value={deviationSectionFilter}
                  onChange={(event) => setDeviationSectionFilter(event.target.value)}
                >
                  <option value="all">全部标段</option>
                  {deviationFilterOptions.sections.map((value) => (
                    <option key={value} value={value}>{value}</option>
                  ))}
                </select>
              </label>
              <label className="space-y-1 text-xs text-slate-500">
                <span>专业</span>
                <select
                  className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700"
                  value={deviationSpecialtyFilter}
                  onChange={(event) => setDeviationSpecialtyFilter(event.target.value)}
                >
                  <option value="all">全部专业</option>
                  {deviationFilterOptions.specialties.map((value) => (
                    <option key={value} value={value}>{value}</option>
                  ))}
                </select>
              </label>
              <label className="space-y-1 text-xs text-slate-500">
                <span>偏差等级</span>
                <select
                  className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700"
                  value={deviationLevelFilter}
                  onChange={(event) => setDeviationLevelFilter(event.target.value)}
                >
                  <option value="all">全部等级</option>
                  {deviationFilterOptions.levels.map((value) => (
                    <option key={value} value={value}>{getDeviationStatusLabel(value)}</option>
                  ))}
                </select>
              </label>
            </CardContent>
          </Card>

          {deviationView === 'baseline' ? (
            <BaselineDumbbellChart rows={baselineDeviationChartRows} mainlineLabel={deviationMainline?.label || deviationViewLabel} />
          ) : deviationView === 'monthly' ? (
            <MonthlyStackedBarChart
              rows={filteredDeviationRows}
              mainlineLabel={deviationMainline?.label || deviationViewLabel}
              buckets={monthlyFulfillmentBuckets}
            />
          ) : (
            <ExecutionScatterChart rows={executionDeviationChartRows} mainlineLabel={deviationMainline?.label || deviationViewLabel} />
          )}

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(380px,0.9fr)]">
            <DeviationDetailTable
              rows={deviationTableRows}
              mainlineLabel={deviationMainline?.label || deviationViewLabel}
              onSelectRow={(row) => setSelectedDeviationRow(row as ProgressDeviationRow)}
            />
          </div>

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.9fr)]">
            <Card data-testid="deviation-detail-panel" className="border-slate-200 shadow-sm">
              <CardHeader className="pb-4">
                <CardTitle className="text-base">下钻明细区</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {secondaryExpanded ? (
                  secondarySummaryCards.map((card) => (
                    <div key={card.title} className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                      <div className="text-sm font-medium text-slate-900">{card.title}</div>
                      <div className="mt-2 text-2xl font-semibold text-slate-900">{card.value}</div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-5" />
                )}
              </CardContent>
            </Card>

            <Card data-testid="reports-responsibility-analysis" className="border-slate-200 shadow-sm">
              <CardHeader className="pb-4">
                <CardTitle className="text-base">责任归因分析</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-3">
                  <div className="text-sm font-medium text-slate-700">责任贡献</div>
                  {responsibilityContribution.length > 0 ? (
                    responsibilityContribution.map((entry) => (
                      <div key={entry.owner} className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <div className="text-sm font-medium text-slate-900">{entry.owner}</div>
                            <div className="mt-1 text-xs text-slate-500">
                              {entry.task_ids.length} 个任务 · {entry.count} 项偏差
                            </div>
                          </div>
                          <div className="text-xs text-slate-500">{entry.percentage}%</div>
                        </div>
                        <div className="mt-2 h-2 rounded-full bg-white">
                          <div
                            className="h-2 rounded-full bg-blue-500"
                            style={{ width: `${Math.max(entry.percentage, entry.count > 0 ? 8 : 0)}%` }}
                          />
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
                      当前筛选条件下暂无责任贡献数据。
                    </div>
                  )}
                </div>
                <div className="space-y-3">
                  <div className="text-sm font-medium text-slate-700">TOP3 偏差原因</div>
                  {topDeviationCauses.length > 0 ? (
                    topDeviationCauses.map((cause) => (
                      <div key={cause.reason} className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-sm font-medium text-slate-900">{cause.reason}</div>
                          <div className="text-xs text-slate-500">{cause.count} 项 · {cause.percentage}%</div>
                        </div>
                        <div className="mt-2 h-2 rounded-full bg-white">
                          <div
                            className="h-2 rounded-full bg-rose-400"
                            style={{ width: `${Math.max(cause.percentage, cause.count > 0 ? 8 : 0)}%` }}
                          />
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
                      当前筛选条件下暂无偏差原因数据。
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <Card data-testid="reports-delay-statistics" className="border-slate-200 shadow-sm">
              <CardHeader className="pb-4">
                <CardTitle className="text-base">延期统计</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {delayStatisticsRows.length > 0 ? (
                  delayStatisticsRows.map((row) => (
                    <div key={row.id} className="flex items-center justify-between rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
                      <div>
                        <div className="text-sm font-medium text-slate-900">{row.title}</div>
                        <div className="mt-1 text-xs text-slate-500">
                          计划完成 {formatDateLabel(row.plannedEnd)} · 责任 {row.owner}
                        </div>
                      </div>
                      <div className="text-xs font-medium text-red-600">延期 {row.delayDays} 天</div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4" />
                )}
              </CardContent>
            </Card>

            <Card data-testid="reports-delay-obstacle-correlation" className="border-slate-200 shadow-sm">
              <CardHeader className="pb-4">
                <CardTitle className="text-base">延期与阻碍关联分析</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {delayObstacleCorrelationRows.length > 0 ? (
                  delayObstacleCorrelationRows.map((row) => (
                    <div key={row.id} className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-sm font-medium text-slate-900">{row.title}</div>
                        <div className="text-xs text-amber-700">{row.activeObstacleCount} 条活跃阻碍</div>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {row.obstacleTypes.map((type) => (
                          <span key={type} className="rounded-full bg-white px-2.5 py-1 text-[11px] text-slate-600">
                            {type}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
                    当前延期任务尚未与阻碍记录形成明显关联。
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <Dialog
            open={Boolean(selectedDeviationRow)}
            onOpenChange={(open) => {
              if (!open) setSelectedDeviationRow(null)
            }}
          >
            <DialogContent
              data-testid="reports-deviation-row-drawer"
              className="left-auto right-0 top-0 h-full max-h-none w-full max-w-3xl translate-x-0 translate-y-0 rounded-none border-l border-slate-200 bg-white p-0 shadow-2xl data-[state=open]:slide-in-from-right-0"
            >
              {selectedDeviationRow ? (
                <div className="flex h-full flex-col">
                  <div className="border-b border-slate-200 px-6 py-5">
                    <DialogHeader className="space-y-2 text-left">
                      <DialogTitle className="text-xl">{selectedDeviationRow.title}</DialogTitle>
                      <DialogDescription className="text-sm text-slate-500">
                        {deviationMainline?.label || deviationViewLabel} · 偏差 {selectedDeviationRow.deviation_days} 天
                      </DialogDescription>
                    </DialogHeader>
                  </div>
                  <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <DetailStatCard
                        label="计划进度"
                        value={`${selectedDeviationRow.planned_progress ?? 0}%`}
                        hint="计划口径"
                      />
                      <DetailStatCard
                        label="实际进度"
                        value={`${selectedDeviationRow.actual_progress ?? 0}%`}
                        hint={selectedDeviationRow.actual_date || '无实际日期'}
                      />
                      <DetailStatCard
                        label="偏差天数"
                        value={selectedDeviationRow.deviation_days}
                        hint={`${selectedDeviationRow.deviation_rate}% 偏差率`}
                      />
                      <DetailStatCard
                        label="主线"
                        value={deviationMainline?.label || deviationViewLabel}
                        hint={selectedDeviationRow.mainline}
                      />
                    </div>

                    {selectedDeviationRow.source_task_id ? (
                      <Button asChild variant="outline" className="w-full justify-between rounded-2xl border-slate-200 bg-white">
                        <Link
                          data-testid="reports-open-gantt-from-deviation"
                          to={`/projects/${projectId}/gantt?view=gantt&highlight=${encodeURIComponent(selectedDeviationRow.source_task_id)}`}
                        >
                          查看对应 Gantt
                          <ArrowRight className="h-4 w-4" />
                        </Link>
                      </Button>
                    ) : null}

                    <div className="grid gap-3 rounded-2xl border border-slate-100 bg-slate-50 p-4 text-sm text-slate-700 sm:grid-cols-2">
                      <div>
                        <div className="text-xs font-medium uppercase tracking-[0.08em] text-slate-400">状态</div>
                        <div className="mt-1 text-slate-900">{selectedDeviationRow.status}</div>
                      </div>
                      <div>
                        <div className="text-xs font-medium uppercase tracking-[0.08em] text-slate-400">映射状态</div>
                        <div className="mt-1 text-slate-900">{selectedDeviationRow.mapping_status || 'mapped'}</div>
                      </div>
                      <div>
                        <div className="text-xs font-medium uppercase tracking-[0.08em] text-slate-400">实际日期</div>
                        <div className="mt-1 text-slate-900">{formatDateLabel(selectedDeviationRow.actual_date || null)}</div>
                      </div>
                      <div>
                        <div className="text-xs font-medium uppercase tracking-[0.08em] text-slate-400">原因</div>
                        <div className="mt-1 text-slate-900">{selectedDeviationRow.reason || '暂无偏差原因'}</div>
                      </div>
                    </div>

                    {selectedDeviationRow.merged_into || selectedDeviationRow.child_group ? (
                      <div className="flex flex-wrap gap-2">
                        {selectedDeviationRow.merged_into ? (
                          <span className="rounded-full bg-blue-100 px-3 py-1 text-xs text-blue-700">
                            合并到 {selectedDeviationRow.merged_into.title}
                          </span>
                        ) : null}
                        {selectedDeviationRow.child_group ? (
                          <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs text-emerald-700">
                            子项组 {selectedDeviationRow.child_group.parent_title} · {selectedDeviationRow.child_group.child_count}
                          </span>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </DialogContent>
          </Dialog>

            </>
          ) : null}
        </>
      )}
      {showConditionSections ? (
        <Card data-testid="reports-condition-summary" className="border-slate-200 shadow-sm">
          <CardHeader className="pb-4">
            <CardTitle className="text-base">条件未满足分析</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-3">
            <DetailStatCard label="条件总数" value={projectConditions.length} hint="项目当前条件项总量" />
            <DetailStatCard label="未满足任务" value={summary?.pendingConditionTaskCount ?? 0} hint="仍受条件限制的任务" />
            <DetailStatCard label="活跃条件" value={summary?.pendingConditionCount ?? 0} hint="尚未满足的条件项" />
          </CardContent>
        </Card>
      ) : null}

      {showRiskSections ? (
        <Card data-testid="reports-risk-linkage-summary" className="border-slate-200 shadow-sm">
          <CardHeader className="pb-4">
            <CardTitle className="text-base">风险联动摘要</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-3">
            <DetailStatCard label="活跃风险" value={projectRisks.length} hint={`摘要口径 ${summary?.activeRiskCount ?? projectRisks.length}`} />
            <DetailStatCard label="活跃问题" value={issueSummary.active_issues} hint={`问题总数 ${issueSummary.total_issues}`} />
            <DetailStatCard label="问题来源" value={issueSummary.source_counts.length} hint="来源分布已接入后端摘要" />
          </CardContent>
        </Card>
      ) : null}

      {showObstacleSections ? (
        <div className="grid gap-6 xl:grid-cols-2">
          <MaterialArrivalSummaryCard summary={materialSummary} projectId={projectId} />

          <Card data-testid="reports-obstacle-type-summary" className="border-slate-200 shadow-sm">
            <CardHeader className="pb-4">
              <CardTitle className="text-base">阻碍类型汇总</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {obstacleTypeSummary.length > 0 ? (
                obstacleTypeSummary.map(([type, count]) => (
                  <div key={type} className="flex items-center justify-between rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
                    <div className="text-sm font-medium text-slate-900">{type}</div>
                    <div className="text-xs text-slate-500">{count} 条阻碍</div>
                  </div>
                ))
              ) : (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
                  当前暂无阻碍类型数据。
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      ) : null}
    </>
  )
  }

  const renderRiskDetail = () => {
    const riskSourceCounts = buildCountSummary(projectRisks, (risk) => summarizeRiskSource(risk))
    const issueTrend = issueSummary.trend.slice(-10)
    const issueOpenCount = issueSummary.status_counts.open ?? 0
    const issueInvestigatingCount = issueSummary.status_counts.investigating ?? 0
    const issueResolvedCount = issueSummary.status_counts.resolved ?? 0
    const issueClosedCount = issueSummary.status_counts.closed ?? 0
    const issueCriticalCount = issueSummary.severity_counts.critical ?? 0
    const issueSourceCounts = issueSummary.source_counts
    const trendMaxValue = Math.max(
      1,
      ...issueTrend.map((point) => Math.max(point.newIssues, point.resolvedIssues, point.activeIssues)),
    )

    return (
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(360px,0.9fr)]">
        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="pb-4">
            <CardTitle className="text-base">风险压力结构</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <DetailStatCard label="活跃风险" value={summary?.activeRiskCount ?? projectRisks.length} hint={`总风险 ${summary?.riskCount ?? projectRisks.length}`} />
              <DetailStatCard label="条件未满足" value={summary?.pendingConditionTaskCount ?? projectConditions.length} hint={`条件项 ${summary?.pendingConditionCount ?? projectConditions.length}`} />
              <DetailStatCard label="阻碍任务" value={summary?.activeObstacleTaskCount ?? projectObstacles.length} hint={`阻碍项 ${summary?.activeObstacleCount ?? projectObstacles.length}`} />
              <DetailStatCard label="健康度" value={summary?.healthScore ?? '--'} hint={summary?.healthStatus || '共享摘要口径'} />
            </div>
            <div className="flex flex-wrap gap-2">
              {riskSourceCounts.length > 0 ? (
                riskSourceCounts.map(([source, count]) => (
                  <span key={source} className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600">
                    {source} {count}
                  </span>
                ))
              ) : (
                <span className="text-sm text-slate-500">暂无风险来源分布</span>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="pb-4">
            <CardTitle className="text-base">处置入口</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm leading-6 text-slate-600">
            <Button
              type="button"
              variant="outline"
              className="w-full justify-between"
              onClick={() => navigate(projectId ? `/projects/${projectId}/risks` : '/company')}
            >
              风险与问题
              <ShieldAlert className="h-4 w-4" />
            </Button>
          </CardContent>
        </Card>

        <div className="xl:col-span-2">
          <MaterialArrivalSummaryCard summary={materialSummary} projectId={projectId} />
        </div>

        <Card className="border-slate-200 shadow-sm xl:col-span-2">
          <CardHeader className="pb-4">
            <CardTitle className="text-base">重点风险与问题清单</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {focusRisks.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                暂无重点风险与问题
              </div>
            ) : (
              focusRisks.map((risk) => {
                const normalizedStatus = String(risk.status ?? '').trim().toLowerCase()
                const normalizedLevel = String(risk.level ?? '').trim().toLowerCase()
                const riskHref = projectId
                  ? `/projects/${projectId}/risks?status=${['identified', 'mitigating', 'closed'].includes(normalizedStatus) ? normalizedStatus : 'all'}&level=${['critical', 'high', 'medium', 'low'].includes(normalizedLevel) ? normalizedLevel : 'all'}`
                  : '/risks'

                return (
                  <Link
                    key={risk.id}
                    data-testid={`reports-risk-drilldown-${risk.id}`}
                    to={riskHref}
                    className="grid gap-3 rounded-2xl border border-slate-100 bg-white px-4 py-4 transition-colors hover:border-blue-200 hover:bg-blue-50/40 md:grid-cols-[minmax(0,1.3fr)_140px_140px_140px]"
                  >
                    <div>
                      <div className="text-sm font-medium text-slate-900">{risk.title || '未命名风险'}</div>
                      <div className="mt-1 text-xs text-slate-500">{risk.description || '暂无备注'}</div>
                    </div>
                    <div className="text-sm text-slate-700">等级 {risk.level || '未分类'}</div>
                    <div className="text-sm text-slate-700">来源 {summarizeRiskSource(risk)}</div>
                    <div className="text-sm text-slate-700">状态 {parseStatusLabel(risk.status)}</div>
                  </Link>
                )
              })
            )}
          </CardContent>
        </Card>

        <Card data-testid="reports-issue-analysis" className="border-slate-200 shadow-sm xl:col-span-2">
          <CardHeader className="pb-4">
            <CardTitle className="text-base">问题独立分析</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-4">
              <DetailStatCard label="问题总数" value={issueSummary.total_issues} hint="后端汇总口径" />
              <DetailStatCard label="活跃问题" value={issueSummary.active_issues} hint={`open ${issueOpenCount} · investigating ${issueInvestigatingCount}`} />
              <DetailStatCard label="已解决 / 关闭" value={`${issueResolvedCount}/${issueClosedCount}`} hint={`严重问题 ${issueCriticalCount}`} />
              <DetailStatCard label="来源类型" value={issueSourceCounts.length} hint="后端 issues/summary" />
            </div>
            <div className="grid gap-4 xl:grid-cols-2">
              <div className="space-y-3">
                <div className="text-sm font-medium text-slate-700">近 30 天趋势</div>
                {issueSummaryLoading ? (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-500">
                    问题摘要加载中
                  </div>
                ) : issueTrend.length > 0 ? (
                  <div className="rounded-2xl border border-slate-100 bg-white p-4">
                    <div className="flex items-end gap-2">
                      {issueTrend.map((point) => (
                        <div key={point.date} className="flex-1 space-y-2 text-center">
                          <div className="flex h-40 items-end justify-center gap-1">
                            <div
                              className="w-2 rounded-full bg-blue-400"
                              style={{ height: `${Math.max(6, (point.newIssues / trendMaxValue) * 100)}%` }}
                              title={`${point.date} · 新增 ${point.newIssues}`}
                            />
                            <div
                              className="w-2 rounded-full bg-emerald-400"
                              style={{ height: `${Math.max(6, (point.resolvedIssues / trendMaxValue) * 100)}%` }}
                              title={`${point.date} · 已解决 ${point.resolvedIssues}`}
                            />
                            <div
                              className="w-2 rounded-full bg-slate-700"
                              style={{ height: `${Math.max(6, (point.activeIssues / trendMaxValue) * 100)}%` }}
                              title={`${point.date} · 活跃 ${point.activeIssues}`}
                            />
                          </div>
                          <div className="text-[10px] text-slate-500">{point.date.slice(5)}</div>
                        </div>
                      ))}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-500">
                      <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-blue-400" />新增</span>
                      <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-400" />已解决</span>
                      <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-slate-700" />活跃</span>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-500">
                    当前项目暂无问题趋势数据。
                  </div>
                )}
              </div>
              <div className="space-y-3">
                <div className="text-sm font-medium text-slate-700">来源分布</div>
                {issueSourceCounts.length > 0 ? (
                  issueSourceCounts.map((source) => (
                    <div key={source.key} className="flex items-center justify-between rounded-2xl border border-slate-100 bg-white px-4 py-3">
                      <div className="text-sm font-medium text-slate-900">{source.label}</div>
                      <div className="text-xs text-slate-500">{source.count} 条问题</div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-500">
                    当前项目暂无问题来源数据。
                  </div>
                )}
              </div>
            </div>
            <div className="grid gap-4 xl:grid-cols-2">
              <div className="space-y-3">
                <div className="text-sm font-medium text-slate-700">严重度分布</div>
                {Object.entries(issueSummary.severity_counts).length > 0 ? (
                  Object.entries(issueSummary.severity_counts)
                    .sort((left, right) => right[1] - left[1])
                    .map(([severity, count]) => (
                      <div key={severity} className="flex items-center justify-between rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
                        <div className="text-sm font-medium text-slate-900">{getIssueSeverityLabel(severity)}</div>
                        <div className="text-xs text-slate-500">{count} 条问题</div>
                      </div>
                    ))
                ) : (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-500">
                    当前项目暂无问题严重度数据。
                  </div>
                )}
              </div>
              <div className="space-y-3">
                <div className="text-sm font-medium text-slate-700">最近问题</div>
                {issueSummary.recent_issues.length > 0 ? (
                  issueSummary.recent_issues.map((row) => (
                    <div key={row.id} className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="text-sm font-medium text-slate-900">{row.title}</div>
                          <div className="mt-1 text-xs text-slate-500">
                            {getIssueStatusLabel(row.status)} · {getIssueSourceLabel(row.source_type)}
                          </div>
                        </div>
                        <div className="text-xs text-slate-500">{formatDateTimeLabel(row.created_at)}</div>
                      </div>
                      {row.description ? <div className="mt-2 text-xs leading-5 text-slate-500">{row.description}</div> : null}
                    </div>
                  ))
                ) : (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-500">
                    当前项目暂无问题记录。
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  const renderChangeLogDetail = () => (
    <Card data-testid="change-log-view" className="border-slate-200 shadow-sm">
      <CardHeader className="pb-4">
        <CardTitle className="text-base">变更记录分析</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-3">
          <DetailStatCard
            label="范围/结构相关"
            value={changeLogTypeCounts.scopeRelated}
            hint="任务、节点与基线层变更"
          />
          <DetailStatCard
            label="计划调整相关"
            value={changeLogTypeCounts.planningRelated}
            hint="延期审批与月计划修正"
          />
          <DetailStatCard
            label="执行/异常相关"
            value={changeLogTypeCounts.executionRelated}
            hint="风险、问题、条件与阻碍联动"
          />
        </div>
        {changeLogError ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm leading-6 text-red-700">
            {changeLogError}
          </div>
        ) : changeLogLoading ? (
          <LoadingState
            label="变更记录加载中"
            className="min-h-24 rounded-2xl border border-dashed border-slate-200 bg-slate-50"
          />
        ) : recentChangeLogs.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4" />
        ) : (
          <>
            <div className="flex flex-wrap gap-2">
              {changeLogSourceSummary.map(([source, count]) => (
                <span key={source} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
                  {source} {count}
                </span>
              ))}
            </div>
            <div className="space-y-3">
              {recentChangeLogs.map((record) => (
                <div
                  key={record.id}
                  className="grid gap-3 rounded-2xl border border-slate-100 bg-white px-4 py-4 md:grid-cols-[minmax(0,1.1fr)_140px_180px]"
                >
                  <div>
                    <div className="text-sm font-medium text-slate-900">
                      {record.entity_type} · {record.field_name}
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      {record.change_reason || '未填写变更原因'}
                    </div>
                    <div className="mt-2 text-xs text-slate-500">
                      {record.old_value || '空'} → {record.new_value || '空'}
                    </div>
                  </div>
                  <div className="text-sm text-slate-700">
                    来源 {record.change_source || 'manual_adjusted'}
                  </div>
                  <div className="text-sm text-slate-700">
                    {record.changed_at || '时间未知'}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )

  const renderActiveDetail = () => {
    switch (activeView) {
      case 'progress':
        return renderProgressDetail()
      case 'progress_deviation':
        return renderProgressDeviationDetail()
      case 'risk':
        return renderRiskDetail()
      case 'change_log':
        return renderChangeLogDetail()
      default:
        return null
    }
  }

  return (
    <div className="page-enter space-y-6 p-6">
      <div className="max-w-[1600px] space-y-6">
        <Breadcrumb
          showHome
          items={[
            { label: projectName, href: `/projects/${projectId}/dashboard` },
            { label: pageHeaderConfig.breadcrumbLabel },
          ]}
        />

        <PageHeader
          eyebrow={pageHeaderConfig.eyebrow}
          title={pageHeaderConfig.title}
          subtitle={pageHeaderConfig.subtitle}
        >
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate(pageHeaderConfig.backTo || `/projects/${projectId}/dashboard`)}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            {pageHeaderConfig.backLabel}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefreshReports}
            loading={loading || criticalPathLoading || deviationLoading || changeLogLoading}
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            刷新
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" type="button">
                <Download className="mr-2 h-4 w-4" />
                导出
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem onClick={() => { void handleExportCurrentView('xlsx') }}>
                <FileSpreadsheet className="mr-2 h-4 w-4" />
                导出 Excel
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => { void handleExportCurrentView('pdf') }}>
                <Download className="mr-2 h-4 w-4" />
                导出 PDF
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs text-slate-500">
            <Clock3 className="h-3.5 w-3.5" />
            最近刷新 {lastRefreshedAt ? formatDateTimeLabel(lastRefreshedAt) : '未刷新'}
          </div>
        </PageHeader>

        {activeView === 'progress_deviation' && dataQualitySummary ? (
          <Card data-testid="reports-data-quality-banner" className="border-sky-200 bg-sky-50 shadow-sm">
            <CardContent className="flex flex-col gap-3 p-5 md:flex-row md:items-center md:justify-between">
              <div className="space-y-1">
                <div className="text-base font-semibold text-sky-950">
                  本次分析基于数据置信度 {Math.round(dataQualitySummary.confidence.score)}% 的数据集
                </div>
                <div className="text-sm leading-6 text-sky-900">
                  {dataQualitySummary.confidence.note} · 活跃异常 {dataQualitySummary.confidence.activeFindingCount} 条
                </div>
              </div>
              <div className="w-full max-w-xl">
                <DataConfidenceBreakdown
                  confidence={dataQualitySummary.confidence}
                  title="本月置信度降分贡献"
                  compact
                  testId="reports-data-quality-breakdown"
                />
              </div>
            </CardContent>
          </Card>
        ) : null}

        {hasSummary ? (
          <DeviationShell>
            <Tabs
              data-testid="reports-module-tabs"
              value={activeView}
              onValueChange={(value) => {
                const entry = analysisEntries.find((e) => e.view === value)
                if (entry) openEntry(entry)
              }}
            >
              <TabsList className="w-full justify-start">
                {analysisEntries.map((entry) => (
                  <TabsTrigger
                    key={entry.view}
                    value={entry.view}
                    data-testid={`analysis-entry-${entry.view}`}
                  >
                    {entry.title}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>

            <div data-testid="reports-current-metrics" className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {currentMetrics.map((metric) => (
                <MetricCard
                  key={metric.title}
                  title={metric.title}
                  value={metric.value}
                  hint={metric.hint}
                  icon={metric.icon}
                />
              ))}
            </div>

            <Card data-testid="reports-trend-panel" className="border-slate-200 shadow-sm">
              <CardHeader className="pb-4">
                <CardTitle className="text-base">指标 / 时间 / 维度</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 md:grid-cols-3">
                  <label className="space-y-1 text-xs text-slate-500">
                    <span>指标选择器</span>
                    <Select value={trendMetric} onValueChange={(value) => setTrendMetric(value as ReportMetricKey)}>
                      <SelectTrigger className="h-10 rounded-xl border-slate-200 bg-white text-sm text-slate-700">
                        <SelectValue placeholder="选择指标" />
                      </SelectTrigger>
                      <SelectContent>
                        {REPORT_METRIC_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </label>

                  <label className="space-y-1 text-xs text-slate-500">
                    <span>时间范围</span>
                    <Select value={trendTimeRange} onValueChange={(value) => setTrendTimeRange(value as ReportTimeRange)}>
                      <SelectTrigger className="h-10 rounded-xl border-slate-200 bg-white text-sm text-slate-700">
                        <SelectValue placeholder="选择时间范围" />
                      </SelectTrigger>
                      <SelectContent>
                        {REPORT_TIME_RANGE_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </label>

                  <label className="space-y-1 text-xs text-slate-500">
                    <span>维度选择器</span>
                    <Select value={trendDimension} onValueChange={(value) => setTrendDimension(value as ReportDimensionKey)}>
                      <SelectTrigger className="h-10 rounded-xl border-slate-200 bg-white text-sm text-slate-700">
                        <SelectValue placeholder="选择维度" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">全部维度</SelectItem>
                        {reportScopeSections.map((section) => (
                          <SelectItem key={section.key} value={section.key}>
                            {section.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </label>
                </div>

                <div className="flex flex-wrap gap-2 text-xs text-slate-500">
                  <span className="rounded-full bg-slate-100 px-3 py-1">当前指标 {selectedTrendMetric.label}</span>
                  <span className="rounded-full bg-slate-100 px-3 py-1">时间范围 {selectedTrendRange.label}</span>
                  <span className="rounded-full bg-slate-100 px-3 py-1">
                    维度 {selectedTrendDimension?.label || '全部维度'}
                  </span>
                  <span className="rounded-full bg-slate-100 px-3 py-1">
                    维度切片 {selectedTrendDimension?.options.length ?? reportScopeSections.length} 项
                  </span>
                </div>

                {trendError ? (
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                    {trendError}
                  </div>
                ) : trendLoading && trendPoints.length === 0 ? (
                  <LoadingState label="趋势数据加载中" className="min-h-24 rounded-2xl border border-dashed border-slate-200 bg-slate-50" />
                ) : trendPoints.length > 0 ? (
                  <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                    {trendPoints.slice(0, 9).map((point) => (
                      <div key={`${point.date}-${point.group || 'none'}`} className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-sm font-medium text-slate-900">{point.date}</div>
                          <div className="text-lg font-semibold text-slate-900">{point.value ?? '--'}</div>
                        </div>
                        <div className="mt-2 flex items-center justify-between gap-2 text-xs text-slate-500">
                          <span>{selectedTrendMetric.label}</span>
                          <span>{point.group || '全量'}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-500">
                    暂无趋势数据。
                  </div>
                )}
              </CardContent>
            </Card>

            {renderActiveDetail()}
          </DeviationShell>
        ) : loading ? (
          <LoadingState
            label="偏差分析加载中"
            description=""
            className="min-h-32 rounded-2xl border border-slate-200 bg-white"
          />
        ) : (
          <EmptyState
            icon={BarChart3}
            title={error ? '偏差分析暂不可用' : '暂无偏差分析数据'}
            description={error || '当前项目还没有可展示的偏差分析结果。'}
            className="max-w-none rounded-2xl bg-white"
          />
        )}
      </div>
    </div>
  )
}

function CriticalPathSummaryCard({
  summary,
}: {
  summary: CriticalPathSummaryModel | null
}) {
  return (
    <Card data-testid="reports-critical-path-summary" className="border-slate-200 shadow-sm">
      <CardHeader className="pb-4">
        <CardTitle className="text-base">关键路径摘要</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {summary ? (
          <>
            <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
              <div className="text-xs text-slate-500">共享摘要口径</div>
              {summary.summaryText ? <div className="mt-2 text-sm leading-6 text-slate-700">{summary.summaryText}</div> : null}
            </div>
            <div className="flex flex-wrap gap-2">
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
                关键路径 {summary.primaryTaskCount}
              </span>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
                备选链 {summary.alternateChainCount}
              </span>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
                手动关注 {summary.manualAttentionCount}
              </span>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
                手动插链 {summary.manualInsertedCount}
              </span>
            </div>
          </>
        ) : (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-5" />
        )}
      </CardContent>
    </Card>
  )
}

function MaterialArrivalSummaryCard({
  summary,
  projectId,
}: {
  summary: MaterialReportSummary | null
  projectId?: string
}) {
  const overview = summary?.overview ?? {
    totalExpectedCount: 0,
    onTimeCount: 0,
    arrivalRate: 0,
  }
  const byUnit = Array.isArray(summary?.byUnit) ? summary.byUnit : []
  const monthlyTrend = Array.isArray(summary?.monthlyTrend) ? summary.monthlyTrend : []

  return (
    <Card data-testid="reports-material-arrival-summary" className="border-slate-200 shadow-sm">
      <CardHeader className="pb-4">
        <CardTitle className="text-base">材料到场率分析</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {summary ? (
          <>
            <div className="grid gap-3 md:grid-cols-3">
              <DetailStatCard label="预计到场总数" value={overview.totalExpectedCount} hint="按预计到场日期口径" />
              <DetailStatCard label="按时到场数" value={overview.onTimeCount} hint="实际到场 <= 预计到场" />
              <DetailStatCard label="整体到场率" value={`${overview.arrivalRate}%`} hint="近 6 个月与当前项目材料总览" />
            </div>
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
              <div className="space-y-3">
                <div className="text-sm font-medium text-slate-700">参建单位到场率</div>
                {byUnit.length > 0 ? (
                  byUnit.map((row) => (
                    <div key={row.participantUnitId ?? 'unassigned'} className="rounded-2xl border border-slate-100 bg-white px-4 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="text-sm font-medium text-slate-900">{row.participantUnitName || '无归属单位'}</div>
                          <div className="mt-1 flex flex-wrap gap-2 text-xs text-slate-500">
                            {row.specialtyTypes.map((type) => {
                              const specialtyHref = projectId ? `/projects/${projectId}/materials?specialty=${encodeURIComponent(type)}` : '/materials'
                              return (
                                <Link
                                  key={type}
                                  data-testid={`reports-material-specialty-link-${row.participantUnitId ?? 'unassigned'}-${type}`}
                                  to={specialtyHref}
                                  className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-600 transition-colors hover:bg-blue-50 hover:text-blue-700"
                                >
                                  {type}
                                </Link>
                              )
                            })}
                          </div>
                        </div>
                        <div className="text-right text-sm text-slate-700">
                          <div className="text-lg font-semibold text-slate-900">{row.arrivalRate}%</div>
                          <div>{row.onTimeCount} / {row.totalExpectedCount}</div>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-500">
                    当前项目还没有材料到场记录。
                  </div>
                )}
              </div>
              <div className="space-y-3">
                <div className="text-sm font-medium text-slate-700">近 6 个月趋势</div>
                {monthlyTrend.map((row) => (
                  <div key={row.month} className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-medium text-slate-900">{row.month}</div>
                      <div className="text-sm text-slate-700">{row.arrivalRate}%</div>
                    </div>
                    <div className="mt-2 h-2 rounded-full bg-slate-200">
                      <div className="h-2 rounded-full bg-emerald-500" style={{ width: `${Math.max(row.arrivalRate, row.totalExpectedCount > 0 ? 8 : 0)}%` }} />
                    </div>
                    <div className="mt-2 text-xs text-slate-500">
                      按时 {row.onTimeCount} / 预计 {row.totalExpectedCount}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        ) : (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-5" />
        )}
      </CardContent>
    </Card>
  )
}
