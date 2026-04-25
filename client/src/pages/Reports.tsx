import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  ArrowLeft,
  BarChart3,
  CheckSquare,
  ClipboardList,
  Flag,
  LockKeyhole,
  RefreshCw,
  ShieldAlert,
  type LucideIcon,
} from 'lucide-react'

import { Breadcrumb } from '@/components/Breadcrumb'
import { DataConfidenceBreakdown } from '@/components/DataConfidenceBreakdown'
import { EmptyState } from '@/components/EmptyState'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { LoadingState } from '@/components/ui/loading-state'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { toast } from '@/hooks/use-toast'
import { apiGet, getApiErrorMessage } from '@/lib/apiClient'
import {
  selectProjectScopeOrEmpty,
  useCurrentProject,
  useStore,
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
import { SCurveChart } from './Reports/components/SCurveChart'

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
}

type ProgressDeviationMainlineKey = 'baseline' | 'monthly_plan' | 'execution'

type ProgressDeviationRow = {
  id: string
  title: string
  mainline: ProgressDeviationMainlineKey
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

function DetailStatCard({ label, value, hint }: DetailStat) {
  void hint

  return (
    <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-slate-900">{value}</div>
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

function getObstacleSeverity(obstacle: TaskObstacle) {
  return obstacle.severity || '中'
}

function getObstacleTypeLabel(obstacle: TaskObstacle) {
  const raw = obstacle as Record<string, unknown>
  const label = raw.obstacle_type || raw.title || raw.name || '未分类'
  return String(label)
}

function getResponsibilityLabel(task: Task) {
  const raw = task as Record<string, unknown>
  return String(raw.participant_unit_name || raw.responsible_unit || raw.assignee_name || raw.assignee || '未指定责任主体')
}

function normalizeAnalysisView(value: string | null): AnalysisView {
  if (value === 'baseline' || value === 'monthly' || value === 'execution') {
    return 'progress_deviation'
  }

  if (value === 'license' || value === 'acceptance' || value === 'wbs') {
    return 'progress'
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
  const [criticalPathSummary, setCriticalPathSummary] = useState<CriticalPathSummaryModel | null>(null)
  const [criticalPathLoading, setCriticalPathLoading] = useState(false)
  const [secondaryExpanded, setSecondaryExpanded] = useState(false)
  const [deviationData, setDeviationData] = useState<ProgressDeviationAnalysisResponse | null>(null)
  const [deviationLoading, setDeviationLoading] = useState(false)
  const [deviationError, setDeviationError] = useState<string | null>(null)
  const [deviationLock, setDeviationLock] = useState<BaselineVersionLock | null>(null)
  const [deviationLockError, setDeviationLockError] = useState<string | null>(null)
  const [baselineLabel, setBaselineLabel] = useState('当前基线')
  const [changeLogs, setChangeLogs] = useState<ChangeLogRecord[]>([])
  const [changeLogLoading, setChangeLogLoading] = useState(false)
  const [changeLogError, setChangeLogError] = useState<string | null>(null)

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
    }
  }, [projectId])

  useEffect(() => {
    const c = new AbortController()
    void loadChangeLogs(c.signal)
    return () => { c.abort() }
  }, [loadChangeLogs])

  const summary = summaryData
  const projectScope = useStore((state) => selectProjectScopeOrEmpty(state, projectId))
  const projectTasks = useMemo(() => projectScope?.tasks ?? [], [projectScope?.tasks])
  const projectRisks = useMemo(() => projectScope?.risks ?? [], [projectScope?.risks])
  const projectConditions = useMemo(() => projectScope?.conditions ?? [], [projectScope?.conditions])
  const projectObstacles = useMemo(() => projectScope?.obstacles ?? [], [projectScope?.obstacles])
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
    () =>
      Array.from(
        projectObstacles.reduce((map, obstacle) => {
          const key = getObstacleTypeLabel(obstacle)
          map.set(key, (map.get(key) || 0) + 1)
          return map
        }, new Map<string, number>()),
      ).sort((left, right) => right[1] - left[1]),
    [projectObstacles],
  )
  const responsibilityAttribution = useMemo(
    () =>
      Array.from(
        [...delayedTasks, ...projectTasks.filter((task) => !isCompletedTask(task) && isDelayedTask(task) === false)]
          .slice(0, Math.max(delayedTasks.length, 6))
          .reduce((map, task) => {
            const key = getResponsibilityLabel(task)
            map.set(key, (map.get(key) || 0) + 1)
            return map
          }, new Map<string, number>()),
      ).sort((left, right) => right[1] - left[1]),
    [delayedTasks, projectTasks],
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
    () =>
      delayedTasks.map((task) => {
        const relatedObstacles = projectObstacles.filter((obstacle) => obstacle.task_id === task.id)
        const activeObstacleCount = relatedObstacles.filter((obstacle) => String(obstacle.status || '').trim() !== '已解决').length
        return {
          id: String(task.id || ''),
          title: getTaskDisplayName(task),
          activeObstacleCount,
          obstacleTypes: Array.from(new Set(relatedObstacles.map((obstacle) => getObstacleTypeLabel(obstacle)))).filter(Boolean),
        }
      }).filter((row) => row.activeObstacleCount > 0),
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
        description: '拆分基线偏差、月度完成情况和执行偏差三条主线，统一下钻查看。',
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
    () =>
      Array.from(
        changeLogs.reduce((map, record) => {
          const key = record.change_source || 'manual_adjusted'
          map.set(key, (map.get(key) || 0) + 1)
          return map
        }, new Map<string, number>()),
      ).sort((left, right) => right[1] - left[1]),
    [changeLogs],
  )
  const recentChangeLogs = useMemo(() => changeLogs.slice(0, 8), [changeLogs])
  const deviationViewLabel = viewLabels[deviationView]

  const viewConfig = useMemo(() => {
    if (activeView === 'progress') {
      return {
        eyebrow: '里程碑分析',
        title: '项目进度总览分析',
        subtitle: '',
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
        subtitle: '',
        backLabel: '返回项目总览',
        backTo: projectId ? `/projects/${projectId}/dashboard` : undefined,
        metrics: [
          { title: '偏差任务', value: deviationData?.summary.deviated_items ?? 0, hint: `总条目 ${deviationData?.summary.total_items ?? 0}`, icon: <BarChart3 className="h-4 w-4" /> },
          { title: '待收口项', value: deviationData?.summary.unresolved_items ?? 0, hint: '基线/月度/执行链路未闭环条目', icon: <ClipboardList className="h-4 w-4" /> },
          { title: '滚入下月', value: deviationData?.summary.carryover_items ?? 0, hint: '影响月度兑现的跨月事项', icon: <RefreshCw className="h-4 w-4" /> },
          { title: '当前主线', value: deviationViewLabel, hint: '可切换基线 / 月度 / 执行三条视角', icon: <Flag className="h-4 w-4" /> },
        ] as MetricItem[],
      }
    }

    if (activeView === 'risk') {
      return {
        eyebrow: '风险分析',
        title: '风险与问题分析',
        subtitle: '',
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
        subtitle: '',
        backLabel: '返回任务管理',
        backTo: projectId ? `/projects/${projectId}/gantt` : undefined,
        metrics: [
          { title: '变更记录', value: changeLogs.length, hint: '项目级变更留痕总数', icon: <ClipboardList className="h-4 w-4" /> },
          { title: '延期相关', value: changeLogs.filter((record) => record.entity_type === 'delay_request').length, hint: '计划调整与延期审批记录', icon: <RefreshCw className="h-4 w-4" /> },
          { title: '任务 / 里程碑', value: changeLogs.filter((record) => record.entity_type === 'task' || record.entity_type === 'milestone').length, hint: '任务与关键节点变更', icon: <Flag className="h-4 w-4" /> },
          { title: '最近来源', value: changeLogSourceSummary[0]?.[0] || '暂无', hint: `最近 50 条共 ${changeLogs.length} 条`, icon: <BarChart3 className="h-4 w-4" /> },
        ] as MetricItem[],
      }
    }

    return {
      eyebrow: '里程碑分析',
      title: '项目进度总览分析',
      subtitle: '',
      backLabel: '返回里程碑',
      backTo: projectId ? `/projects/${projectId}/milestones` : undefined,
      metrics: [
        { title: '总体进度', value: `${summary?.overallProgress ?? '--'}%`, hint: `共享摘要口径 · 任务总数 ${summary?.totalTasks ?? 0}`, icon: <BarChart3 className="h-4 w-4" /> },
        { title: '里程碑完成', value: `${summary?.completedMilestones ?? 0}/${summary?.totalMilestones ?? 0}`, hint: `完成率 ${summary?.milestoneProgress ?? 0}%`, icon: <Flag className="h-4 w-4" /> },
        { title: '延期任务', value: summary?.delayedTaskCount ?? 0, hint: `延期天数 ${summary?.delayDays ?? 0} · 次数 ${summary?.delayCount ?? 0}`, icon: <ClipboardList className="h-4 w-4" /> },
        { title: 'WBS完成度', value: `${summary?.taskProgress ?? summary?.overallProgress ?? 0}%`, hint: `叶子任务 ${summary?.leafTaskCount ?? summary?.totalTasks ?? 0}`, icon: <BarChart3 className="h-4 w-4" /> },
      ] as MetricItem[],
    }

  }, [activeView, changeLogSourceSummary, changeLogs, deviationData, deviationViewLabel, projectId, projectName, summary])

  const currentMetrics = viewConfig.metrics
  const hasSummary = Boolean(summary)
  const deviationMainlineKey: Record<DeviationView, ProgressDeviationMainlineKey> = {
    baseline: 'baseline',
    monthly: 'monthly_plan',
    execution: 'execution',
  }
  const deviationMainline = deviationData?.mainlines.find((mainline) => mainline.key === deviationMainlineKey[deviationView]) ?? null
  const deviationRows = deviationMainline?.rows ?? deviationData?.rows.filter((row) => row.mainline === deviationMainlineKey[deviationView]) ?? []
  const deviationVersionEvents = deviationData?.trend_events ?? []
  const activeDeviationLock = deviationLock ?? deviationData?.version_lock ?? null
  const deviationChips = useMemo(
    () => [
      { label: '任务', value: projectTasks.length },
      { label: '风险', value: projectRisks.length },
      { label: '条件', value: projectConditions.length },
      { label: '阻碍', value: projectObstacles.length },
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
        title: '月度完成情况',
        value: `${summary?.overallProgress ?? 0}%`,
        description: '月度完成情况受确认状态、延期与月末待处理事项共同影响。',
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
            <DetailStatCard label="下一里程碑" value={summary?.nextMilestone?.daysRemaining ?? '--'} hint={summary?.nextMilestone?.name || '待识别关键节点'} />
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

  const renderProgressDeviationDetail = () => (
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
          <span key={chip.label} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
            {chip.label} {chip.value}
          </span>
        ))}
        <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
          当前聚焦 {deviationViewLabel}
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
          title="月度完成情况"
          value={deviationData?.summary.monthly_plan_items ?? 0}
          hint="聚焦当月完成情况、延期与月末待处理事项"
          icon={<ClipboardList className="h-4 w-4" />}
        />
        <MetricCard
          title="执行偏差"
          value={deviationData?.summary.execution_items ?? projectTasks.length}
          hint="聚焦任务推进、条件阻碍与执行节奏"
          icon={<BarChart3 className="h-4 w-4" />}
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
          <BaselineSwitchMarker events={deviationVersionEvents} baselineLabel={baselineLabel} />

          <SCurveChart tasks={projectTasks} />

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(380px,0.9fr)]">
            <ExecutionScatterChart rows={deviationRows} mainlineLabel={deviationMainline?.label || deviationViewLabel} />
            <DeviationDetailTable rows={deviationRows} mainlineLabel={deviationMainline?.label || deviationViewLabel} />
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

            <Card data-testid="reports-responsibility-attribution" className="border-slate-200 shadow-sm">
              <CardHeader className="pb-4">
                <CardTitle className="text-base">责任归因分析</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {responsibilityAttribution.length > 0 ? (
                  responsibilityAttribution.map(([owner, count]) => (
                    <div key={owner} className="flex items-center justify-between rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
                      <div className="text-sm font-medium text-slate-900">{owner}</div>
                      <div className="text-xs text-slate-500">{count} 项偏差相关任务</div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4" />
                )}
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
        </>
      )}
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
    </>
  )

  const renderRiskDetail = () => {
    const riskSourceCounts = Array.from(
      projectRisks.reduce((map, risk) => {
        const source = summarizeRiskSource(risk)
        map.set(source, (map.get(source) || 0) + 1)
        return map
      }, new Map<string, number>()),
    ).sort((left, right) => right[1] - left[1])

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
              focusRisks.map((risk) => (
                <div key={risk.id} className="grid gap-3 rounded-2xl border border-slate-100 bg-white px-4 py-4 md:grid-cols-[minmax(0,1.3fr)_140px_140px_140px]">
                  <div>
                    <div className="text-sm font-medium text-slate-900">{risk.title || '未命名风险'}</div>
                    <div className="mt-1 text-xs text-slate-500">{risk.description || '暂无备注'}</div>
                  </div>
                  <div className="text-sm text-slate-700">等级 {risk.level || '未分类'}</div>
                  <div className="text-sm text-slate-700">来源 {summarizeRiskSource(risk)}</div>
                  <div className="text-sm text-slate-700">状态 {parseStatusLabel(risk.status)}</div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card data-testid="reports-material-arrival-summary" className="border-slate-200 shadow-sm xl:col-span-2">
          <CardHeader className="pb-4">
            <CardTitle className="text-base">材料到场率分析</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {materialSummary ? (
              <>
                <div className="grid gap-3 md:grid-cols-3">
                  <DetailStatCard
                    label="预计到场总数"
                    value={materialSummary.overview.totalExpectedCount}
                    hint="按预计到场日期口径"
                  />
                  <DetailStatCard
                    label="按时到场数"
                    value={materialSummary.overview.onTimeCount}
                    hint="实际到场 <= 预计到场"
                  />
                  <DetailStatCard
                    label="整体到场率"
                    value={`${materialSummary.overview.arrivalRate}%`}
                    hint="近 6 个月与当前项目材料总览"
                  />
                </div>
                <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
                  <div className="space-y-3">
                    <div className="text-sm font-medium text-slate-700">参建单位到场率</div>
                    {materialSummary.byUnit.length > 0 ? (
                      materialSummary.byUnit.map((row) => (
                        <div key={row.participantUnitId ?? 'unassigned'} className="rounded-2xl border border-slate-100 bg-white px-4 py-3">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <div className="text-sm font-medium text-slate-900">{row.participantUnitName || '无归属单位'}</div>
                              <div className="mt-1 flex flex-wrap gap-2 text-xs text-slate-500">
                                {row.specialtyTypes.map((type) => (
                                  <span key={type} className="rounded-full bg-slate-100 px-2 py-1">{type}</span>
                                ))}
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
                    {materialSummary.monthlyTrend.map((row) => (
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
            value={changeLogs.filter((record) => ['task', 'milestone', 'baseline'].includes(record.entity_type)).length}
            hint="任务、节点与基线层变更"
          />
          <DetailStatCard
            label="计划调整相关"
            value={changeLogs.filter((record) => ['delay_request', 'monthly_plan'].includes(record.entity_type)).length}
            hint="延期审批与月计划修正"
          />
          <DetailStatCard
            label="执行/异常相关"
            value={changeLogs.filter((record) => ['risk', 'issue', 'task_condition', 'task_obstacle'].includes(record.entity_type)).length}
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
            onClick={() => {
              void loadSummary()
              void loadCriticalPathSummary()
              void loadDataQualitySummary()
            }}
            loading={loading || criticalPathLoading}
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            刷新
          </Button>
        </PageHeader>

        {dataQualitySummary ? (
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
