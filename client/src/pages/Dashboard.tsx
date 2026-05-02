import { Link } from 'react-router-dom'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Activity,
  AlertTriangle,
  CheckCircle,
  ChevronRight,
  Clock3,
  LayoutDashboard,
  RefreshCw,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
} from 'lucide-react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import { Breadcrumb } from '@/components/Breadcrumb'
import { ChartAccessibleWrapper } from '@/components/ChartAccessibleWrapper'
import DashboardCompareCard from '@/components/DashboardCompareCard'
import { DashboardHealthCards } from '@/components/DashboardHealthCards'
import DashboardMilestoneCard from '@/components/DashboardMilestoneCard'
import { DataConfidenceBreakdown } from '@/components/DataConfidenceBreakdown'
import { EmptyState } from '@/components/EmptyState'
import RecentTasksCard from '@/components/RecentTasksCard'
import { CardHead } from '@/components/ui/card-head'
import { ChartTooltip, chartTooltipCursor } from '@/components/ui/chart-tooltip'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { LoadingState } from '@/components/ui/loading-state'
import { LucideIcon } from '@/components/ui/lucide-icon'
import { MetricCard as SharedMetricCard } from '@/components/ui/metric-card'
import { Separator } from '@/components/ui/separator'
import { StatusBadge } from '@/components/ui/status-badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PROJECT_NAVIGATION_LABELS } from '@/config/navigation'
import { useStore } from '@/hooks/useStore'
import { useToast } from '@/hooks/use-toast'
import { apiGet, isAbortError } from '@/lib/apiClient'
import { CHART_NEUTRAL, CHART_SERIES } from '@/lib/chartPalette'
import { getTaskDisplayStatus, isCompletedTask } from '@/lib/taskBusinessStatus'
import { cn } from '@/lib/utils'
import { DashboardApiService, type ProjectSummary } from '@/services/dashboardApi'
import { DataQualityApiService, type DataQualityProjectSummary } from '@/services/dataQualityApi'

type ProjectStatus = '未开始' | '进行中' | '已完成' | '已暂停'
type CurrentProjectEntity = NonNullable<ReturnType<typeof useStore.getState>['currentProject']>

type DashboardWarningItem = {
  id: string
  title: string
  description: string
  warning_level: 'info' | 'warning' | 'critical'
  is_acknowledged?: boolean
  created_at?: string
  status?: string | null
}

type DashboardIssueItem = {
  id: string
  title: string
  description?: string | null
  severity?: 'critical' | 'high' | 'medium' | 'low'
  task_id?: string | null
  created_at?: string
  status?: string
}

type DashboardProblemItem = {
  id: string
  title?: string
  description?: string
  severity?: string
  task_id?: string | null
  created_at?: string
  status?: string
  is_resolved?: boolean | number | null
}

type DashboardChangeLogItem = {
  id: string
  entity_type: string
  field_name: string
  change_reason?: string | null
  changed_at?: string
}

type TodayLiveType = 'warning' | 'due_task' | 'change' | 'new_risk'

type TodayLiveItem = {
  id: string
  type: TodayLiveType
  priority: number
  title: string
  detail: string
  meta: string
  created_at?: string
}

type DashboardMilestoneStatus = 'completed' | 'pending' | 'delayed'

type DashboardMilestonePanelItem = {
  id: string
  name: string
  dueDate: string
  status: DashboardMilestoneStatus
  progress?: number
  projectId: string
}

function toDashboardMilestoneStatus(status: string, daysRemaining?: number): DashboardMilestoneStatus {
  if (status === 'completed') return 'completed'
  if (status === 'overdue' || (typeof daysRemaining === 'number' && daysRemaining < 0)) return 'delayed'
  return 'pending'
}

function normalizeWeeklyDigestData<T extends { project_id?: string | null }>(value: T | null | undefined): T | null {
  if (!value || typeof value !== 'object') return null
  const projectId = typeof value.project_id === 'string' ? value.project_id.trim() : ''
  return projectId ? value : null
}

function normalizeTrendRows<T extends { month: string; total: number; on_time: number; delayed: number }>(
  value: T[] | null | undefined,
): T[] {
  return Array.isArray(value) ? value : []
}

function normalizeProjectStatus(status?: string | null): ProjectStatus {
  switch (status) {
    case 'active':
    case 'in_progress':
    case '进行中':
      return '进行中'
    case 'completed':
    case '已完成':
      return '已完成'
    case 'paused':
    case 'archived':
    case '已暂停':
      return '已暂停'
    default:
      return '未开始'
  }
}

function getProjectStatusKey(status: ProjectStatus | string): string {
  switch (status) {
    case '已完成':
    case 'completed':
      return 'completed'
    case '进行中':
    case 'in_progress':
    case 'active':
      return 'in_progress'
    case '已暂停':
    case 'paused':
    case 'archived':
      return 'warning'
    default:
      return 'pending'
  }
}

function getHealthStatusKey(score: number): string {
  if (score >= 80) return 'completed'
  if (score >= 60) return 'in_progress'
  if (score >= 40) return 'warning'
  return 'critical'
}

function getConfidenceStatusKey(score: number): string {
  if (score >= 85) return 'completed'
  if (score >= 70) return 'in_progress'
  return 'warning'
}

function getCalendarDayKey(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function isSameCalendarDay(value: string | null | undefined, targetDayKey: string) {
  if (!value) return false
  return getCalendarDayKey(value) === targetDayKey
}

function formatLiveTime(value?: string | null) {
  if (!value) return '时间待补充'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '时间待补充'
  return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
}

function formatLiveTaskDate(value?: string | null) {
  if (!value) return '日期待补充'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '日期待补充'
  return date.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })
}

function formatProjectDate(value?: string | null) {
  if (!value) return '--'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' })
}

function getMinutesAgo(timestamp: number) {
  if (!timestamp) return '--'
  const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60000))
  return minutes <= 0 ? '刚刚' : `${minutes} 分钟前`
}

function normalizeWarningRows(value: unknown): DashboardWarningItem[] {
  if (!Array.isArray(value)) return []
  const rows: DashboardWarningItem[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object') continue
    const row = item as Record<string, unknown>
    rows.push({
      id: String(row.id ?? ''),
      title: String(row.title ?? '未命名预警'),
      description: String(row.description ?? ''),
      warning_level:
        (String(row.warning_level ?? 'info').trim().toLowerCase() as DashboardWarningItem['warning_level']) || 'info',
      is_acknowledged: Boolean(row.is_acknowledged),
      created_at: row.created_at ? String(row.created_at) : undefined,
      status: row.status ? String(row.status) : null,
    })
  }
  return rows.filter((row) => row.id)
}

function normalizeIssueRows(value: unknown): DashboardIssueItem[] {
  if (!Array.isArray(value)) return []
  const rows: DashboardIssueItem[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object') continue
    const row = item as Record<string, unknown>
    rows.push({
      id: String(row.id ?? ''),
      title: String(row.title ?? '未命名问题'),
      description: row.description ? String(row.description) : null,
      severity: row.severity ? (String(row.severity) as DashboardIssueItem['severity']) : undefined,
      task_id: row.task_id ? String(row.task_id) : null,
      created_at: row.created_at ? String(row.created_at) : undefined,
      status: row.status ? String(row.status) : undefined,
    })
  }
  return rows.filter((row) => row.id)
}

function normalizeProblemRows(value: unknown): DashboardProblemItem[] {
  if (!Array.isArray(value)) return []
  const rows: DashboardProblemItem[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object') continue
    const row = item as Record<string, unknown>
    rows.push({
      id: String(row.id ?? ''),
      title: row.title ? String(row.title) : undefined,
      description: row.description ? String(row.description) : undefined,
      severity: row.severity ? String(row.severity) : undefined,
      task_id: row.task_id ? String(row.task_id) : null,
      created_at: row.created_at ? String(row.created_at) : undefined,
      status: row.status ? String(row.status) : undefined,
      is_resolved: typeof row.is_resolved === 'boolean' || typeof row.is_resolved === 'number' ? row.is_resolved : null,
    })
  }
  return rows.filter((row) => row.id)
}

function normalizeChangeLogRows(value: unknown): DashboardChangeLogItem[] {
  if (!Array.isArray(value)) return []
  const rows: DashboardChangeLogItem[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object') continue
    const row = item as Record<string, unknown>
    rows.push({
      id: String(row.id ?? ''),
      entity_type: String(row.entity_type ?? '记录'),
      field_name: String(row.field_name ?? '字段'),
      change_reason: row.change_reason ? String(row.change_reason) : null,
      changed_at: row.changed_at ? String(row.changed_at) : undefined,
    })
  }
  return rows.filter((row) => row.id)
}

function normalizeApiTodayLiveItems(value: unknown): TodayLiveItem[] {
  if (!Array.isArray(value)) return []

  return value
    .map((item, index): TodayLiveItem | null => {
      if (!item || typeof item !== 'object') return null
      const row = item as Record<string, unknown>
      const type = String(row.type ?? '').trim() as TodayLiveType
      if (!['warning', 'due_task', 'change', 'new_risk'].includes(type)) return null
      const createdAt = row.created_at ? String(row.created_at) : undefined
      return {
        id: String(row.id ?? `${type}-${createdAt ?? index}-${row.title ?? index}`),
        type,
        priority: Number(row.priority ?? 99),
        title: String(row.title ?? '未命名事项'),
        detail: String(row.detail ?? ''),
        meta: formatLiveTime(createdAt),
        created_at: createdAt,
      }
    })
    .filter((item): item is TodayLiveItem => Boolean(item))
}

function sortTodayLiveItems(items: TodayLiveItem[]) {
  return [...items].sort((left, right) => {
    if (left.priority !== right.priority) return left.priority - right.priority
    return new Date(right.created_at ?? '').getTime() - new Date(left.created_at ?? '').getTime()
  })
}

function formatMetricTrend(value: number, invertTone = false) {
  if (value === 0) {
    return { label: '持平 较上周', className: 'text-slate-400', icon: null }
  }

  const isPositive = value > 0
  const isGood = invertTone ? !isPositive : isPositive
  return {
    label: `${isPositive ? '+' : '-'}${Math.abs(value)} 较上周`,
    className: isGood ? 'text-emerald-700' : 'text-rose-700',
    icon: isPositive ? TrendingUp : TrendingDown,
  }
}

function DashboardMetricCards({
  summaryData,
  todayTodoCount,
}: {
  summaryData: ProjectSummary | null
  todayTodoCount: number
}) {
  const overallProgress = Math.round(summaryData?.overallProgress ?? 0)
  const monthDeviation = Math.round(summaryData?.scheduleVarianceDays ?? summaryData?.delayDays ?? 0)
  const activeRisks = summaryData?.activeRiskCount ?? 0
  const noVerifiedSparkline: number[] = []

  const metrics = [
    {
      key: 'progress',
      eyebrow: 'PROGRESS',
      label: '整体进度',
      value: overallProgress,
      unit: '%',
      trend: formatMetricTrend(0),
      sparkline: noVerifiedSparkline,
      tone: 'primary' as const,
      icon: Activity,
    },
    {
      key: 'deviation',
      eyebrow: 'DEVIATION',
      label: '本月偏差',
      value: monthDeviation,
      unit: '天',
      trend: formatMetricTrend(monthDeviation, true),
      sparkline: noVerifiedSparkline,
      tone: monthDeviation > 0 ? 'warning' as const : 'success' as const,
      icon: Clock3,
    },
    {
      key: 'risks',
      eyebrow: 'RISKS',
      label: '活跃风险',
      value: activeRisks,
      unit: '',
      trend: formatMetricTrend(activeRisks, true),
      sparkline: noVerifiedSparkline,
      tone: activeRisks > 0 ? 'danger' as const : 'slate' as const,
      icon: AlertTriangle,
    },
    {
      key: 'todos',
      eyebrow: 'TODO',
      label: '今日待办',
      value: todayTodoCount,
      unit: '',
      trend: formatMetricTrend(0),
      sparkline: noVerifiedSparkline,
      tone: 'slate' as const,
      icon: ShieldCheck,
    },
  ]

  return (
    <div data-testid="dashboard-hero-cards" data-onboarding-target="dashboard-metrics" className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4">
      {metrics.map((metric, index) => {
        const TrendIcon = metric.trend.icon
        return (
          <SharedMetricCard
            key={metric.key}
            testId={`dashboard-hero-card-${metric.key}`}
            eyebrow={metric.eyebrow}
            title={metric.label}
            value={metric.value}
            unit={metric.unit}
            trend={
              <span className={cn('inline-flex items-center gap-1', metric.trend.className)}>
                {TrendIcon ? <LucideIcon icon={TrendIcon} className="h-3 w-3" /> : null}
                {metric.trend.label}
              </span>
            }
            icon={<LucideIcon icon={metric.icon} className="h-3.5 w-3.5" />}
            sparkline={metric.sparkline}
            tone={metric.tone}
            className="motion-safe:animate-fade-in"
            style={{ animationDelay: `${index * 60}ms` }}
          />
        )
      })}
    </div>
  )
}

const todayLiveTypeConfig: Record<TodayLiveType, { color: string; dot: string; label: string }> = {
  warning: { color: 'border-l-rose-500', dot: 'bg-rose-500', label: '预警' },
  due_task: { color: 'border-l-amber-500', dot: 'bg-amber-500', label: '到期' },
  change: { color: 'border-l-blue-500', dot: 'bg-blue-500', label: '变更' },
  new_risk: { color: 'border-l-slate-400', dot: 'bg-slate-400', label: '新增' },
}

function TodayLiveListPanel({
  projectId,
  loading,
  items,
  totalCount,
}: {
  projectId: string
  loading: boolean
  items: TodayLiveItem[]
  totalCount: number
}) {
  const previewItems = items.slice(0, 8)

  return (
    <section data-testid="dashboard-live-panel" className="surface-card p-5">
      <CardHead
        eyebrow="TODAY"
        title="今日动态"
        action={
          totalCount > 8 ? (
            <Link to={`/projects/${projectId}/notifications`} className="text-xs font-medium text-blue-600 hover:text-blue-800">
              全部
              <ChevronRight className="ml-1 inline h-3.5 w-3.5" />
            </Link>
          ) : null
        }
      />
      <div className="mt-5">
        {loading ? (
          <LoadingState label="今日动态加载中" description="" className="min-h-24 border-0 bg-transparent px-0 py-2 shadow-none" />
        ) : previewItems.length === 0 ? (
          <div className="flex min-h-56 flex-col items-center justify-center text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-500 ring-1 ring-inset ring-emerald-200/60">
              <CheckCircle className="h-7 w-7" />
            </div>
            <h3 className="mt-4 text-sm font-medium text-slate-900">今日待办均已完成</h3>
            <p className="mt-2 text-xs text-slate-500">保持节奏，继续推进剩余里程碑。</p>
          </div>
        ) : (
          <ul className="space-y-2.5">
            {previewItems.map((item) => {
              const config = todayLiveTypeConfig[item.type]
              return (
                <li
                  key={item.id}
                  className="group grid grid-cols-[4rem_minmax(0,1fr)_auto] items-center gap-3 rounded-xl border border-slate-100 bg-white px-3.5 py-3 shadow-[var(--el-1)] transition-all duration-200 hover:border-slate-200 hover:shadow-[var(--el-2)]"
                >
                  <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500">
                    <span className={cn('h-1.5 w-1.5 rounded-full', config.dot)} />
                    {config.label}
                  </span>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-slate-800">{item.title}</div>
                    {item.detail ? <div className="mt-0.5 truncate text-[11px] text-slate-400">{item.detail}</div> : null}
                  </div>
                  <span className="flex items-center justify-end gap-1.5">
                    <span className="num-mono text-right text-[11px] text-slate-400">{item.meta}</span>
                    <ChevronRight className="h-3.5 w-3.5 text-slate-300 transition-colors group-hover:text-slate-500" aria-hidden="true" />
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </section>
  )
}

function DashboardPageTitle({
  currentProject,
  currentStatus,
  summaryData,
  dataQualitySummary,
  summaryLoading,
  todayLiveLoading,
  fetchCompleteTime,
  onRefresh,
}: {
  currentProject: CurrentProjectEntity
  currentStatus: ProjectStatus
  summaryData: ProjectSummary | null
  dataQualitySummary: DataQualityProjectSummary | null
  summaryLoading: boolean
  todayLiveLoading: boolean
  fetchCompleteTime: number
  onRefresh: () => void
}) {
  const [confidenceDialogOpen, setConfidenceDialogOpen] = useState(false)
  const confidence = dataQualitySummary?.confidence
  const healthScore = summaryData?.healthScore ?? 0
  const progressValue = Math.round(summaryData?.overallProgress ?? 0)
  const plannedStart = currentProject.planned_start_date || null
  const plannedEnd = summaryData?.plannedEndDate || currentProject.planned_end_date || null
  const phaseLabel = currentProject.current_phase || summaryData?.statusLabel || currentStatus

  return (
    <section data-testid="dashboard-page-title" className="pb-2">
      <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0 space-y-3">
          <Breadcrumb
            items={[
              { label: currentProject.name || '项目', href: `/projects/${currentProject.id}/dashboard` },
              { label: PROJECT_NAVIGATION_LABELS.dashboard },
            ]}
          />
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <StatusBadge status={getProjectStatusKey(summaryData?.statusLabel || currentStatus)} fallbackLabel={summaryData?.statusLabel || currentStatus}>
              {summaryData?.statusLabel || currentStatus}
            </StatusBadge>
            <span className="num-mono rounded-full bg-slate-100/80 px-2.5 py-1 text-slate-500 ring-1 ring-inset ring-slate-200/60">
              {formatProjectDate(plannedStart)} - {formatProjectDate(plannedEnd)}
            </span>
          </div>
          <div>
            <h1 className="truncate text-[28px] font-semibold leading-tight tracking-tight text-slate-950">
              {currentProject.name || '项目'}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <span>{phaseLabel}</span>
              <span>·</span>
              <StatusBadge status={getHealthStatusKey(healthScore)} fallbackLabel={`健康度 ${healthScore}分`}>
                健康度 {healthScore}分
              </StatusBadge>
              <StatusBadge
                data-testid="dashboard-data-quality-detail-trigger"
                status={getConfidenceStatusKey(confidence?.score ?? 0)}
                fallbackLabel={confidence ? `数据可靠性 ${Math.round(confidence.score)}%` : '数据可靠性 --'}
                className={cn(confidence && 'cursor-pointer hover:ring-2 hover:ring-blue-100')}
                onClick={confidence ? () => setConfidenceDialogOpen(true) : undefined}
              >
                数据可靠性 {confidence ? `${Math.round(confidence.score)}%` : '--'}
              </StatusBadge>
              <span className="rounded-full bg-blue-50 px-2.5 py-1 text-blue-700 ring-1 ring-inset ring-blue-200/60">
                进度 {progressValue}%
              </span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 xl:justify-end">
          <span className="text-[11px] text-slate-400">更新于 {getMinutesAgo(fetchCompleteTime)}</span>
          <Button
            variant="outline"
            size="sm"
            onClick={onRefresh}
            loading={summaryLoading || todayLiveLoading}
            className="h-8 rounded-lg border-slate-200 bg-white px-2.5 text-xs"
          >
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
            刷新
          </Button>
          <Button asChild variant="outline" size="sm" className="h-8 rounded-lg border-slate-200 bg-white px-2.5 text-xs">
            <Link to="/company">
              <LayoutDashboard className="mr-1.5 h-3.5 w-3.5" />
              返回公司驾驶舱
            </Link>
          </Button>
        </div>
      </div>

      {confidence ? (
        <Dialog open={confidenceDialogOpen} onOpenChange={setConfidenceDialogOpen}>
          <DialogContent className="max-w-3xl" data-testid="dashboard-data-quality-detail-dialog" aria-describedby={undefined}>
            <DialogHeader>
              <DialogTitle>数据可靠性维度分解</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <DataConfidenceBreakdown confidence={confidence} title="本月各维度降分贡献" />
            </div>
          </DialogContent>
        </Dialog>
      ) : null}
    </section>
  )
}

function WeeklyDigestPanel({ projectId }: { projectId: string }) {
  type DigestData = {
    id: string
    project_id: string
    week_start: string
    generated_at: string
    overall_progress?: number | null
    health_score?: number | null
    progress_change?: number | null
    completed_tasks_count?: number | null
    completed_milestones_count?: number | null
    critical_tasks_count?: number | null
    critical_blocked_count?: number | null
    critical_nearest_milestone?: string | null
    critical_nearest_delay_days?: number | null
    top_delayed_tasks?: Array<{ task_id: string; title: string; assignee?: string; delay_days: number }> | null
    abnormal_responsibilities?: Array<{ subject_id: string; name: string; type: string }> | null
    new_risks_count?: number | null
    new_obstacles_count?: number | null
    max_risk_level?: string | null
  }
  const [digest, setDigest] = useState<DigestData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    apiGet<DigestData | null>(`/api/projects/${projectId}/weekly-digest/latest`, { signal: controller.signal })
      .then((data) => {
        if (!controller.signal.aborted) {
          setDigest(normalizeWeeklyDigestData(data))
        }
      })
      .catch((error) => {
        if (!isAbortError(error)) {
          console.error('Failed to load weekly digest:', error)
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false)
        }
      })
    return () => {
      controller.abort()
    }
  }, [projectId])

  return (
    <section data-testid="dashboard-weekly-digest" className="surface-card p-5">
      <CardHead eyebrow="WEEKLY" title="本周进度面板" action={<Link to={`/projects/${projectId}/reports`} className="text-xs font-medium text-blue-600 hover:text-blue-800">查看详情</Link>} />
      {loading ? (
        <LoadingState label="周报摘要加载中" description="" className="min-h-32 border-0 bg-transparent shadow-none" />
      ) : !digest ? (
        <EmptyState
          title="暂无本周进度面板"
          description="周报生成后会在这里展示关键指标。"
          className="rounded-2xl empty-state-frame border-slate-200 bg-slate-50 py-8"
        />
      ) : (
        <div className="mt-5 space-y-5">
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: '本周整体进度', value: `${digest.overall_progress ?? 0}%`, hint: '较上周持平' },
              { label: '目标达标', value: `${digest.completed_milestones_count ?? 0}`, hint: '本周关键节点' },
              { label: '关键任务', value: `${digest.critical_tasks_count ?? 0}`, hint: '需重点跟进' },
            ].map((item) => (
              <div key={item.label} className="rounded-xl border border-slate-200/60 bg-slate-50/60 p-5">
                <div className="text-[11px] text-slate-500">{item.label}</div>
                <div className="num-display mt-3 text-[26px] font-semibold text-slate-900">{item.value}</div>
                <div className="mt-2 text-[11px] text-slate-400">{item.hint}</div>
              </div>
            ))}
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <div>
                <div className="eyebrow">TOP DELAY</div>
                <h4 className="mt-0.5 text-sm font-medium text-slate-900">Top 5 偏差任务</h4>
              </div>
              <div className="text-[11px] text-slate-400">数据截止：{formatProjectDate(digest.generated_at)}</div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[420px] border-collapse">
                <thead>
                  <tr className="border-b border-gray-200">
                    {['任务名', '延期天数', '负责人'].map((label) => (
                      <th key={label} className="py-2 pr-3 text-left text-[10.5px] font-semibold uppercase tracking-[0.08em] text-slate-400">
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(digest.top_delayed_tasks ?? []).slice(0, 5).length === 0 ? (
                    <tr>
                      <td colSpan={3} className="py-6 text-center text-xs text-slate-400">暂无偏差任务</td>
                    </tr>
                  ) : (
                    (digest.top_delayed_tasks ?? []).slice(0, 5).map((task) => (
                      <tr key={task.task_id} className="border-b border-slate-100 hover:bg-slate-50/60">
                        <td className="max-w-[220px] truncate py-2.5 pr-3 text-sm text-slate-700">{task.title}</td>
                        <td className={cn('num-mono py-2.5 pr-3 text-sm text-rose-600', task.delay_days === 0 && 'text-slate-400')}>
                          {task.delay_days}
                        </td>
                        <td className="py-2.5 pr-3 text-xs text-slate-500">{task.assignee || '--'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

function DashboardMonthlyTrend({ projectId }: { projectId: string }) {
  type TaskTrendRow = { month: string; total: number; on_time: number; delayed: number }
  type FulfillmentTrendRow = { month: string; committedCount: number; fulfilledCount: number; rate: number }
  type CombinedTrendRow = {
    month: string
    total: number
    on_time: number
    delayed: number
    committedCount: number
    fulfilledCount: number
    taskOnTimeRate: number | null
    fulfillmentRate: number | null
  }

  const [trendData, setTrendData] = useState<CombinedTrendRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    Promise.all([
      apiGet<TaskTrendRow[]>(`/api/task-summaries/projects/${projectId}/task-summary/trend`, { signal: controller.signal }),
      apiGet<FulfillmentTrendRow[]>(`/api/monthly-plans/projects/${projectId}/fulfillment-trend?months=6`, { signal: controller.signal }),
    ])
      .then(([taskTrendRows, fulfillmentTrendRows]) => {
        if (controller.signal.aborted) return

        const taskRows = normalizeTrendRows(taskTrendRows)
        const fulfillmentMap = new Map(
          (Array.isArray(fulfillmentTrendRows) ? fulfillmentTrendRows : []).map((item) => [item.month, item]),
        )

        const merged = taskRows.map<CombinedTrendRow>((row) => {
          const fulfillment = fulfillmentMap.get(row.month)
          const taskOnTimeRate = row.total > 0 ? Math.round((row.on_time / row.total) * 100) : null
          return {
            month: row.month,
            total: row.total,
            on_time: row.on_time,
            delayed: row.delayed,
            committedCount: fulfillment?.committedCount ?? 0,
            fulfilledCount: fulfillment?.fulfilledCount ?? 0,
            taskOnTimeRate,
            fulfillmentRate: fulfillment ? fulfillment.rate : null,
          }
        })

        setTrendData(merged)
      })
      .catch((error) => {
        if (!isAbortError(error)) {
          console.error('Failed to load dashboard monthly trend:', error)
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false)
        }
      })

    return () => {
      controller.abort()
    }
  }, [projectId])

  const monthLabel = (value: string) => {
    const [, month] = value.split('-')
    return month ? `${Number(month)}月` : value
  }

  return (
    <section data-testid="dashboard-monthly-trend" className="surface-card p-5">
      <CardHead
        eyebrow="TREND"
        title="月度趋势（近6个月）"
        action={
          <div className="flex items-center gap-4 text-[11px] text-slate-500">
            <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-blue-600" />任务按时率</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-emerald-500" />月计划兑现率</span>
          </div>
        }
      />
      <div className="mt-5">
        {loading ? (
          <LoadingState label="月度趋势加载中" description="" className="min-h-60 border-0 bg-transparent px-0 py-0 shadow-none" />
        ) : trendData.length === 0 ? (
          <EmptyState
            title="暂无月度趋势"
            description="任务完成后会自动生成趋势数据。"
            className="rounded-2xl empty-state-frame border-slate-200 bg-slate-50 py-8"
          />
        ) : (
          <ChartAccessibleWrapper
            columns={['月份', '任务完成数', '按时完成数', '延期数', '月计划承诺数', '月计划兑现数', '按时完成率(%)', '月计划兑现率(%)']}
            rows={trendData.map((row) => [
              row.month,
              row.total,
              row.on_time,
              row.delayed,
              row.committedCount,
              row.fulfilledCount,
              row.taskOnTimeRate ?? '未设置',
              row.fulfillmentRate ?? '未设置',
            ])}
            summary="查看月度趋势图表数据"
          >
            <div className="h-[240px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trendData} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                  <defs>
                    <linearGradient id="dashboardTaskRate" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={CHART_SERIES.primary} stopOpacity={0.2} />
                      <stop offset="100%" stopColor={CHART_SERIES.primary} stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="dashboardFulfillmentRate" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={CHART_SERIES.success} stopOpacity={0.16} />
                      <stop offset="100%" stopColor={CHART_SERIES.success} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke={CHART_NEUTRAL.surface} strokeDasharray="4 4" vertical={false} />
                  <XAxis dataKey="month" tickFormatter={monthLabel} axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: CHART_NEUTRAL.muted }} />
                  <YAxis domain={[0, 100]} axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: CHART_NEUTRAL.muted }} />
                  <Tooltip content={<ChartTooltip labelFormatter={(label) => monthLabel(String(label))} />} cursor={chartTooltipCursor} />
                  <Area
                    type="monotone"
                    dataKey="taskOnTimeRate"
                    name="任务按时率"
                    stroke={CHART_SERIES.primary}
                    fill="url(#dashboardTaskRate)"
                    strokeWidth={2}
                    connectNulls
                    animationDuration={800}
                    animationEasing="ease-out"
                  />
                  <Area
                    type="monotone"
                    dataKey="fulfillmentRate"
                    name="月计划兑现率"
                    stroke={CHART_SERIES.success}
                    fill="url(#dashboardFulfillmentRate)"
                    strokeWidth={2}
                    connectNulls
                    animationDuration={800}
                    animationEasing="ease-out"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </ChartAccessibleWrapper>
        )}
      </div>
    </section>
  )
}

export default function Dashboard() {
  const { toast } = useToast()
  const currentProject = useStore((state) => state.currentProject)
  const tasks = useStore((state) => state.tasks)
  const risks = useStore((state) => state.risks)
  const warnings = useStore((state) => state.warnings)
  const issueRows = useStore((state) => state.issueRows)
  const problemRows = useStore((state) => state.problemRows)
  const changeLogs = useStore((state) => state.changeLogs)
  const sharedSliceStatus = useStore((state) => state.sharedSliceStatus)
  const [summary, setSummary] = useState<ProjectSummary | null>(null)
  const [dataQualitySummary, setDataQualitySummary] = useState<DataQualityProjectSummary | null>(null)
  const [summaryLoading, setSummaryLoading] = useState(false)
  const [summaryError, setSummaryError] = useState<string | null>(null)
  const [todayLiveItems, setTodayLiveItems] = useState<TodayLiveItem[]>([])
  const [todayLiveLoading, setTodayLiveLoading] = useState(false)
  const [todayLiveError, setTodayLiveError] = useState<string | null>(null)
  const [fetchCompleteTime, setFetchCompleteTime] = useState(0)
  const summaryAbortRef = useRef<AbortController | null>(null)
  const dataQualityAbortRef = useRef<AbortController | null>(null)
  const todayLiveAbortRef = useRef<AbortController | null>(null)
  const projectId = currentProject?.id ?? ''

  const currentStatus = normalizeProjectStatus(currentProject?.status)
  const summaryData = summary
  const scopedTasks = useMemo(
    () => tasks.filter((task) => task.project_id === currentProject?.id),
    [currentProject?.id, tasks],
  )
  const scopedRisks = useMemo(
    () => risks.filter((risk) => risk.project_id === currentProject?.id),
    [currentProject?.id, risks],
  )
  const focusTasks = useMemo(
    () => scopedTasks.filter((task) => Boolean(task.id)).map((task) => ({ ...task, id: task.id || '' })),
    [scopedTasks],
  )
  const milestonePanelData = useMemo(() => {
    const overview = summaryData?.milestoneOverview
    const items = overview?.items ?? []
    const recentMilestones: DashboardMilestonePanelItem[] = items
      .map((item) => ({
        id: item.id,
        name: item.name,
        dueDate: item.targetDate || item.current_planned_date || item.planned_date || '',
        status: toDashboardMilestoneStatus(item.status),
        progress: item.progress,
        projectId,
      }))
      .sort((left, right) => {
        if (left.status !== right.status) {
          const order: Record<DashboardMilestoneStatus, number> = { delayed: 0, pending: 1, completed: 2 }
          return order[left.status] - order[right.status]
        }
        return new Date(left.dueDate || 0).getTime() - new Date(right.dueDate || 0).getTime()
      })

    if (recentMilestones.length === 0 && summaryData?.nextMilestone) {
      recentMilestones.push({
        id: summaryData.nextMilestone.id,
        name: summaryData.nextMilestone.name,
        dueDate: summaryData.nextMilestone.targetDate,
        status: toDashboardMilestoneStatus(summaryData.nextMilestone.status, summaryData.nextMilestone.daysRemaining),
        progress: 0,
        projectId,
      })
    }

    return {
      completed: overview?.stats?.completed ?? summaryData?.completedMilestones ?? 0,
      total: overview?.stats?.total ?? summaryData?.totalMilestones ?? recentMilestones.length,
      upcoming: overview?.stats?.upcomingSoon ?? recentMilestones.filter((item) => item.status === 'pending').length,
      overdue: overview?.stats?.overdue ?? recentMilestones.filter((item) => item.status === 'delayed').length,
      recentMilestones,
    }
  }, [projectId, summaryData])
  const liveWarnings = useMemo(
    () =>
      normalizeWarningRows(warnings).filter(
        (item) => String(item.status ?? '').trim().toLowerCase() !== 'resolved',
      ),
    [warnings],
  )
  const liveIssues = useMemo(() => normalizeIssueRows(issueRows), [issueRows])
  const liveProblems = useMemo(() => normalizeProblemRows(problemRows), [problemRows])
  const liveChangeLogs = useMemo(() => normalizeChangeLogRows(changeLogs), [changeLogs])
  const livePanelLoading =
    Boolean(projectId) &&
    (sharedSliceStatus.warnings.loading ||
      sharedSliceStatus.issueRows.loading ||
      sharedSliceStatus.problemRows.loading ||
      sharedSliceStatus.changeLogs.loading)

  const loadSummary = useCallback(async (options?: { signal?: AbortSignal }) => {
    if (!projectId) return

    if (!options?.signal) {
      summaryAbortRef.current?.abort()
      summaryAbortRef.current = new AbortController()
      options = { signal: summaryAbortRef.current.signal }
    }

    setSummaryLoading(true)
    setSummaryError(null)
    try {
      const nextSummary = await DashboardApiService.getProjectSummary(projectId, { signal: options.signal })
      if (!options.signal?.aborted) {
        setSummary(nextSummary)
        setFetchCompleteTime(Date.now())
      }
    } catch (error) {
      if (isAbortError(error)) return

      console.error('Failed to load project dashboard summary:', error)
      setSummary(null)
      setSummaryError('项目摘要加载失败，请检查接口或稍后重试。')
      toast({
        title: '加载失败',
        description: '项目摘要暂时无法刷新，请稍后再试。',
        variant: 'destructive',
      })
    } finally {
      if (!options.signal?.aborted) {
        setSummaryLoading(false)
      }
    }
  }, [projectId, toast])

  const loadTodayLive = useCallback(async (options?: { signal?: AbortSignal }) => {
    if (!projectId) {
      setTodayLiveItems([])
      setTodayLiveError(null)
      return
    }

    if (!options?.signal) {
      todayLiveAbortRef.current?.abort()
      todayLiveAbortRef.current = new AbortController()
      options = { signal: todayLiveAbortRef.current.signal }
    }

    setTodayLiveLoading(true)
    setTodayLiveError(null)
    try {
      const response = await apiGet<unknown>(`/api/projects/${projectId}/dashboard/today-live`, {
        signal: options.signal,
        runtimeCache: 'off',
      })
      if (!options.signal?.aborted) {
        setTodayLiveItems(sortTodayLiveItems(normalizeApiTodayLiveItems(response)))
      }
    } catch (error) {
      if (isAbortError(error)) return
      console.error('Failed to load dashboard today-live items:', error)
      setTodayLiveItems([])
      setTodayLiveError('今日待处理接口暂时不可用，已使用本地共享数据兜底。')
    } finally {
      if (!options.signal?.aborted) {
        setTodayLiveLoading(false)
      }
    }
  }, [projectId])

  const loadDataQualitySummary = useCallback(async (options?: { signal?: AbortSignal }) => {
    if (!projectId) {
      setDataQualitySummary(null)
      return
    }

    if (!options?.signal) {
      dataQualityAbortRef.current?.abort()
      dataQualityAbortRef.current = new AbortController()
      options = { signal: dataQualityAbortRef.current.signal }
    }

    try {
      const nextSummary = await DataQualityApiService.getProjectSummary(projectId, undefined, { signal: options.signal })
      if (!options.signal?.aborted) {
        setDataQualitySummary(nextSummary)
      }
    } catch (error) {
      if (isAbortError(error)) return
      console.error('Failed to load project data quality summary:', error)
      setDataQualitySummary(null)
    }
  }, [projectId])

  useEffect(() => {
    const controller = new AbortController()
    void loadSummary({ signal: controller.signal })

    return () => {
      controller.abort()
    }
  }, [loadSummary])

  useEffect(() => {
    const controller = new AbortController()
    void loadTodayLive({ signal: controller.signal })

    return () => {
      controller.abort()
    }
  }, [loadTodayLive])

  useEffect(() => {
    const controller = new AbortController()
    void loadDataQualitySummary({ signal: controller.signal })

    return () => {
      controller.abort()
    }
  }, [loadDataQualitySummary])

  useEffect(() => {
    return () => {
      summaryAbortRef.current?.abort()
      dataQualityAbortRef.current?.abort()
      todayLiveAbortRef.current?.abort()
    }
  }, [])

  const todayKey = getCalendarDayKey(new Date())
  const todayDueTasks = useMemo(
    () =>
      scopedTasks
        .filter((task) => !isCompletedTask(task) && isSameCalendarDay(task.planned_end_date || task.end_date, todayKey))
        .sort((left, right) => String(left.planned_end_date || left.end_date || '').localeCompare(String(right.planned_end_date || right.end_date || '')))
        .slice(0, 4)
        .map<TodayLiveItem>((task) => ({
          id: String(task.id),
          type: 'due_task',
          priority: 2,
          title: task.title || task.name || '未命名任务',
          detail: `状态 ${getTaskDisplayStatus(task)} · 当前进度 ${task.progress ?? 0}%`,
          meta: `到期 ${formatLiveTaskDate(task.planned_end_date || task.end_date)}`,
          created_at: String(task.planned_end_date || task.end_date || ''),
        })),
    [scopedTasks, todayKey],
  )
  const todayWarnings = useMemo(
    () =>
      liveWarnings
        .filter((item) => item.is_acknowledged !== true && isSameCalendarDay(item.created_at, todayKey))
        .slice(0, 4)
        .map<TodayLiveItem>((item) => ({
          id: item.id,
          type: 'warning',
          priority: 1,
          title: item.title,
          detail: item.description,
          meta: `${formatLiveTime(item.created_at)} · ${item.warning_level === 'critical' ? '严重' : item.warning_level === 'warning' ? '关注' : '提示'}`,
          created_at: item.created_at,
        })),
    [liveWarnings, todayKey],
  )
  const todayChanges = useMemo(
    () =>
      liveChangeLogs
        .filter((item) => isSameCalendarDay(item.changed_at, todayKey))
        .slice(0, 4)
        .map<TodayLiveItem>((item) => ({
          id: item.id,
          type: 'change',
          priority: 3,
          title: `${item.entity_type} · ${item.field_name}`,
          detail: item.change_reason || '未填写变更原因',
          meta: formatLiveTime(item.changed_at),
          created_at: item.changed_at,
        })),
    [liveChangeLogs, todayKey],
  )
  const todayNewIssues = useMemo(
    () =>
      liveIssues
        .filter((item) => item.status !== 'closed' && isSameCalendarDay(item.created_at, todayKey))
        .slice(0, 4)
        .map<TodayLiveItem>((item) => ({
          id: item.id,
          type: 'new_risk',
          priority: 4,
          title: item.title,
          detail: item.description || (item.task_id ? `关联任务 ${item.task_id}` : '未填写备注'),
          meta: `${formatLiveTime(item.created_at)} · ${item.severity === 'critical' ? '严重' : item.severity === 'high' ? '高' : item.severity === 'low' ? '低' : '中'}`,
          created_at: item.created_at,
        })),
    [liveIssues, todayKey],
  )
  const todayNewProblems = useMemo(
    () =>
      liveProblems
        .filter((item) => item.is_resolved !== true && item.is_resolved !== 1 && isSameCalendarDay(item.created_at, todayKey))
        .slice(0, 4)
        .map<TodayLiveItem>((item) => ({
          id: item.id,
          type: 'new_risk',
          priority: 4,
          title: item.title || item.description || '未命名问题',
          detail: item.description || (item.task_id ? `关联任务 ${item.task_id}` : '现场新增问题'),
          meta: `${formatLiveTime(item.created_at)} · ${item.severity || '待分级'}`,
          created_at: item.created_at,
        })),
    [liveProblems, todayKey],
  )
  const todayRiskAndProblemItems = useMemo(
    () => [...todayNewIssues, ...todayNewProblems].slice(0, 4),
    [todayNewIssues, todayNewProblems],
  )
  const localTodayLiveItems = useMemo(
    () => sortTodayLiveItems([...todayWarnings, ...todayDueTasks, ...todayChanges, ...todayRiskAndProblemItems]),
    [todayChanges, todayDueTasks, todayRiskAndProblemItems, todayWarnings],
  )
  const effectiveTodayLiveItems = todayLiveError ? localTodayLiveItems : todayLiveItems
  const todayTodoCount = effectiveTodayLiveItems.length

  const refreshDashboard = useCallback(() => {
    void loadSummary()
    void loadTodayLive()
    void loadDataQualitySummary()
  }, [loadDataQualitySummary, loadSummary, loadTodayLive])

  if (!currentProject) {
    return (
      <div className="page-shell" data-testid="dashboard-empty-state">
        <Breadcrumb
          items={[
            { label: '公司驾驶舱', href: '/company' },
            { label: PROJECT_NAVIGATION_LABELS.dashboard },
          ]}
        />
        <EmptyState
          icon={LayoutDashboard}
          title="未选择项目"
          description={`请先进入一个项目，再查看项目${PROJECT_NAVIGATION_LABELS.dashboard}。`}
          action={
            <Button asChild>
              <Link to="/company">返回公司驾驶舱</Link>
            </Button>
          }
          className="max-w-none"
        />
      </div>
    )
  }

  return (
    <div data-testid="dashboard-page" className="page-shell page-enter space-y-6">
      <DashboardPageTitle
        currentProject={currentProject}
        currentStatus={currentStatus}
        summaryData={summaryData}
        dataQualitySummary={dataQualitySummary}
        summaryLoading={summaryLoading}
        todayLiveLoading={todayLiveLoading}
        fetchCompleteTime={fetchCompleteTime}
        onRefresh={refreshDashboard}
      />

      <DashboardMetricCards summaryData={summaryData} todayTodoCount={todayTodoCount} />

      {summaryError ? (
        <Alert variant="destructive">
          <AlertDescription>{summaryError}</AlertDescription>
        </Alert>
      ) : null}

      <Separator className="border-slate-100" />

      <section data-testid="dashboard-snapshot-panel">
        <Tabs defaultValue="trend">
          <TabsList className="h-auto w-full justify-start gap-6 overflow-x-auto rounded-none border-b border-slate-100 bg-transparent p-0 text-slate-500">
            <TabsTrigger value="trend" className="relative rounded-none bg-transparent px-0 py-3 text-sm font-medium text-slate-500 shadow-none after:absolute after:inset-x-0 after:-bottom-px after:h-[2px] after:rounded-full after:bg-transparent hover:text-slate-700 data-[state=active]:bg-transparent data-[state=active]:text-slate-900 data-[state=active]:shadow-none data-[state=active]:after:bg-blue-600">
              进度趋势
            </TabsTrigger>
            <TabsTrigger value="milestone" className="relative rounded-none bg-transparent px-0 py-3 text-sm font-medium text-slate-500 shadow-none after:absolute after:inset-x-0 after:-bottom-px after:h-[2px] after:rounded-full after:bg-transparent hover:text-slate-700 data-[state=active]:bg-transparent data-[state=active]:text-slate-900 data-[state=active]:shadow-none data-[state=active]:after:bg-blue-600">
              里程碑
            </TabsTrigger>
            <TabsTrigger value="execution" className="relative rounded-none bg-transparent px-0 py-3 text-sm font-medium text-slate-500 shadow-none after:absolute after:inset-x-0 after:-bottom-px after:h-[2px] after:rounded-full after:bg-transparent hover:text-slate-700 data-[state=active]:bg-transparent data-[state=active]:text-slate-900 data-[state=active]:shadow-none data-[state=active]:after:bg-blue-600">
              执行概况
            </TabsTrigger>
            <TabsTrigger value="today" className="relative rounded-none bg-transparent px-0 py-3 text-sm font-medium text-slate-500 shadow-none after:absolute after:inset-x-0 after:-bottom-px after:h-[2px] after:rounded-full after:bg-transparent hover:text-slate-700 data-[state=active]:bg-transparent data-[state=active]:text-slate-900 data-[state=active]:shadow-none data-[state=active]:after:bg-blue-600">
              今日动态
            </TabsTrigger>
          </TabsList>

          <div className="min-h-[25rem]">
            <TabsContent value="trend" className="pt-5">
              <div className="grid grid-cols-12 gap-5">
                <div className="col-span-12 xl:col-span-8">
                  <DashboardMonthlyTrend projectId={currentProject.id ?? ''} />
                </div>
                <div className="col-span-12 xl:col-span-4">
                  <WeeklyDigestPanel projectId={currentProject.id ?? ''} />
                </div>
                <div className="col-span-12">
                  <DashboardCompareCard projectId={projectId} />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="milestone" className="pt-5">
              <div className="grid grid-cols-12 gap-5">
                <div className="col-span-12">
                  <DashboardMilestoneCard
                    completed={milestonePanelData.completed}
                    total={milestonePanelData.total}
                    upcoming={milestonePanelData.upcoming}
                    overdue={milestonePanelData.overdue}
                    recentMilestones={milestonePanelData.recentMilestones}
                  />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="execution" className="pt-5">
              <div className="grid grid-cols-12 gap-5">
                <div className="col-span-12">
                  <DashboardHealthCards
                    summary={summaryData}
                    tasks={scopedTasks}
                    risks={scopedRisks}
                    projectId={projectId}
                  />
                </div>
                <div className="col-span-12">
                  <RecentTasksCard projectId={projectId} tasks={focusTasks} />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="today" className="pt-5">
              <div className="grid grid-cols-12 gap-5">
                <div className="col-span-12">
                  <TodayLiveListPanel
                    projectId={projectId}
                    loading={todayLiveLoading || (Boolean(todayLiveError) && livePanelLoading)}
                    items={effectiveTodayLiveItems}
                    totalCount={effectiveTodayLiveItems.length}
                  />
                </div>
              </div>
            </TabsContent>
          </div>
        </Tabs>
      </section>
    </div>
  )
}
