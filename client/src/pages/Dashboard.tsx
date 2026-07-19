import { Link } from 'react-router-dom'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle,
  ClipboardCheck,
  LayoutDashboard,
  RefreshCw,
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
import {
  DashboardHealthCards,
  type DashboardBusinessHealthDetails,
  type HealthDetailsStatus,
} from '@/components/DashboardHealthCards'
import { DataConfidenceBreakdown } from '@/components/DataConfidenceBreakdown'
import { EmptyState } from '@/components/EmptyState'
import { V14231PageReadinessBoundary } from '@/components/governance/V14231PageReadinessBoundary'
import { ProjectRemainingForecastCard } from '@/components/ProjectRemainingForecastCard'
import RecentTasksCard from '@/components/RecentTasksCard'
import {
  ConstructionOrganizationScenarioSummary,
  type ConstructionOrganizationUseCase,
} from '@/components/planning/ConstructionOrganizationScenarioSummary'
import { Card, CardContent } from '@/components/ui/card'
import { CardHead } from '@/components/ui/card-head'
import { chartTooltipCursor } from '@/components/ui/chart-tooltip'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { LoadingState } from '@/components/ui/loading-state'
import { LucideIcon } from '@/components/ui/lucide-icon'
import { MetricCard as SharedMetricCard } from '@/components/ui/metric-card'
import { Separator } from '@/components/ui/separator'
import { DurationBasisBadge } from '@/components/planning/DurationBasisBadge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PROJECT_NAVIGATION_LABELS } from '@/config/navigation'
import { usePermissions } from '@/hooks/usePermissions'
import { useStore } from '@/hooks/useStore'
import { useToast } from '@/hooks/use-toast'
import { ApiClientError, apiGet, isAbortError } from '@/lib/apiClient'
import { CHART_NEUTRAL, CHART_SERIES } from '@/lib/chartPalette'
import { inclusiveDurationDays } from '@/lib/durationDays'
import {
  formatDurationMetric,
  readAvailableDurationValue,
  type DurationMetricDto,
} from '@/lib/durationMetric'
import { getProjectDisplayName } from '@/lib/projectDisplay'
import { cn } from '@/lib/utils'
import { DashboardApiService, type ProjectSummary } from '@/services/dashboardApi'
import { DataQualityApiService, type DataQualityProjectSummary } from '@/services/dataQualityApi'
import type { WbsConstructionOrganizationScenarioSummary } from '@/services/wbsTemplateGenerationApi'

type ProjectStatus = '未开始' | '进行中' | '已完成' | '已暂停'
type CurrentProjectEntity = NonNullable<ReturnType<typeof useStore.getState>['currentProject']>

type TodayProgressItem = {
  id: string
  taskId: string
  title: string
  previousProgress: number
  currentProgress: number
  delta: number
  changedAt?: string
}

type BusinessHealthScorePayload = {
  score?: number
  details?: DashboardBusinessHealthDetails | null
  degraded?: boolean
  degradationReason?: string
  status?: string
}

const DASHBOARD_SECONDARY_READ_DELAY_MS = 2_800
const DASHBOARD_DEFAULT_SUPPORT_TAB_DELAY_MS = 2_600
const DASHBOARD_PROJECT_IDENTITY_FALLBACK = '当前项目'
const GENERIC_PROJECT_IDENTITY_LABELS = new Set(['项目', DASHBOARD_PROJECT_IDENTITY_FALLBACK, '未命名项目', '项目工作台'])

function readConstructionOrganizationScenarioFromProject(
  project: CurrentProjectEntity | null | undefined,
): WbsConstructionOrganizationScenarioSummary | null {
  const metadata = project?.metadata
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null
  const record = metadata as Record<string, unknown>
  const scenario = record.constructionOrganizationScenario ?? record.constructionOrganizationScenarioSummary
  if (!scenario || typeof scenario !== 'object' || Array.isArray(scenario)) return null
  return scenario as WbsConstructionOrganizationScenarioSummary
}

function readConstructionOrganizationUseCase(
  scenario: WbsConstructionOrganizationScenarioSummary | null,
): ConstructionOrganizationUseCase {
  if (!scenario || typeof scenario !== 'object') return 'newProjectPlanning'
  const projectLevelSnapshot = scenario.projectLevelSnapshot
  const snapshotRecord = projectLevelSnapshot && typeof projectLevelSnapshot === 'object' && !Array.isArray(projectLevelSnapshot)
    ? projectLevelSnapshot as Record<string, unknown>
    : null
  const mode = String(scenario.mode ?? snapshotRecord?.mode ?? '').trim()
  return mode === 'starting_line' ? 'startingLineOnboarding' : 'newProjectPlanning'
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

function getDashboardProjectStatusLabel(summaryData: ProjectSummary | null, currentStatus: ProjectStatus) {
  return summaryData?.statusLabel || currentStatus
}

function normalizeDashboardProjectIdentity(value?: string | null) {
  const displayName = getProjectDisplayName(value, '').trim()
  return displayName && !GENERIC_PROJECT_IDENTITY_LABELS.has(displayName) ? displayName : ''
}

function resolveDashboardProjectIdentity(currentProject: CurrentProjectEntity, summaryData: ProjectSummary | null) {
  return (
    normalizeDashboardProjectIdentity(summaryData?.name)
    || normalizeDashboardProjectIdentity(currentProject.name)
    || DASHBOARD_PROJECT_IDENTITY_FALLBACK
  )
}

function getMetricChipClass(score: number | null | undefined, fallbackTone: 'blue' | 'slate' = 'slate') {
  const base = 'dashboard-title-metric-chip inline-flex h-6 items-center rounded-full px-2.5 text-sm font-medium ring-1 ring-inset'
  if (score === null || score === undefined || !Number.isFinite(score)) {
    return cn(base, fallbackTone === 'blue'
      ? 'bg-blue-50 text-blue-700 ring-blue-200'
      : 'bg-slate-100 text-slate-600 ring-slate-200')
  }
  if (score >= 80) return cn(base, 'bg-emerald-50 text-emerald-700 ring-emerald-200')
  if (score >= 60) return cn(base, 'bg-blue-50 text-blue-700 ring-blue-200')
  if (score >= 40) return cn(base, 'bg-amber-50 text-amber-700 ring-amber-200')
  return cn(base, 'bg-rose-50 text-rose-700 ring-rose-200')
}

function formatProjectDate(value?: string | null) {
  if (!value) return '--'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' })
}

function diffCalendarDays(start?: string | null, end?: string | null) {
  return inclusiveDurationDays(start, end)
}

function getDashboardPlanTaskCount(summaryData: ProjectSummary | null) {
  return Math.max(0, Number(summaryData?.totalTasks ?? summaryData?.leafTaskCount ?? 0))
}

function getDashboardPlanPhaseCount(summaryData: ProjectSummary | null) {
  const value = Number(summaryData?.planPhaseCount ?? 0)
  return Number.isFinite(value) && value > 0 ? Math.round(value) : null
}

function hasDashboardExecutionData(summaryData: ProjectSummary | null, todayProgressItems: TodayProgressItem[]) {
  return (
    todayProgressItems.length > 0
    || Number(summaryData?.overallProgress ?? 0) > 0
    || Number(summaryData?.taskProgress ?? 0) > 0
    || Number(summaryData?.completedTaskCount ?? 0) > 0
    || Number(summaryData?.inProgressTaskCount ?? 0) > 0
  )
}

function getDashboardPlanDurationDays(summaryData: ProjectSummary | null, currentProject: CurrentProjectEntity) {
  const plannedStart = summaryData?.plannedStartDate ?? currentProject.planned_start_date ?? currentProject.start_date ?? null
  const plannedEnd = summaryData?.plannedEndDate ?? currentProject.planned_end_date ?? currentProject.end_date ?? null
  return diffCalendarDays(plannedStart, plannedEnd)
}

function getMinutesAgo(timestamp: number) {
  if (!timestamp) return '--'
  const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60000))
  return minutes <= 0 ? '刚刚' : `${minutes} 分钟前`
}

function clampProgress(value: unknown) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return 0
  return Math.max(0, Math.min(100, Math.round(numeric)))
}

function normalizeApiTodayProgressItems(value: unknown): TodayProgressItem[] {
  if (!Array.isArray(value)) return []

  return value
    .map((item, index): TodayProgressItem | null => {
      if (!item || typeof item !== 'object') return null
      const row = item as Record<string, unknown>
      const taskId = String(row.taskId ?? row.task_id ?? '').trim()
      const previousProgress = clampProgress(row.previousProgress ?? row.previous_progress)
      const currentProgress = clampProgress(row.currentProgress ?? row.current_progress)
      const rawDelta = Number(row.delta)
      return {
        id: String(row.id ?? `today-progress-${taskId || index}`),
        taskId,
        title: String(row.title ?? '未命名任务'),
        previousProgress,
        currentProgress,
        delta: Number.isFinite(rawDelta) ? rawDelta : currentProgress - previousProgress,
        changedAt: row.changedAt ? String(row.changedAt) : row.changed_at ? String(row.changed_at) : undefined,
      }
    })
    .filter((item): item is TodayProgressItem => item !== null && item.previousProgress !== item.currentProgress)
}

function sortTodayProgressItems(items: TodayProgressItem[]) {
  return [...items].sort((left, right) => {
    const dateDiff = new Date(right.changedAt ?? '').getTime() - new Date(left.changedAt ?? '').getTime()
    if (Number.isFinite(dateDiff) && dateDiff !== 0) return dateDiff
    return Math.abs(right.delta) - Math.abs(left.delta)
  })
}

type DashboardProgressSeverity = 'ahead' | 'normal' | 'warning' | 'danger' | 'unknown'

function readSummaryNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'string' && value.trim() === '') return null
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

function getDashboardProgressConclusion(summaryData: ProjectSummary | null) {
  const actual = readSummaryNumber(summaryData?.overallProgress)
  const planned = readSummaryNumber(summaryData?.plannedProgress)
  const deviation = readSummaryNumber(summaryData?.progressDeviation)

  if (actual === null || planned === null || deviation === null) {
    return {
      severity: 'unknown' as DashboardProgressSeverity,
      label: '等待计划进度口径',
      detail: `实际 ${actual === null ? '--' : Math.round(actual)}% / 计划 --`,
      actual,
      planned,
      deviation,
    }
  }

  // 计划应到与实际都接近 0：项目尚未产生有效进度。不得判成 'normal / 基本贴合计划'
  // （那会把"还没开始/该开工却零录入"误导成"在计划轨道上"）。改为显式提醒去录进展。
  if (planned < 1 && actual < 1) {
    return {
      severity: 'warning' as DashboardProgressSeverity,
      label: '计划已开始，暂无进展录入',
      detail: '录入现场进展后，偏差与完工预测才会更新',
      actual,
      planned,
      deviation,
    }
  }

  const roundedDeviation = Math.round(deviation)
  const severity: DashboardProgressSeverity =
    roundedDeviation <= -10
      ? 'danger'
      : roundedDeviation <= -3
        ? 'warning'
        : roundedDeviation >= 3
          ? 'ahead'
          : 'normal'
  const label = roundedDeviation < 0
    ? `进度偏差 ${roundedDeviation}%，落后计划`
    : roundedDeviation > 0
      ? `进度偏差 +${roundedDeviation}%，超前计划`
      : '基本按计划'

  return {
    severity,
    label,
    detail: `实际 ${Math.round(actual)}% / 计划应到 ${Math.round(planned)}%`,
    actual,
    planned,
    deviation,
  }
}

function getProgressSeverityTheme(severity: DashboardProgressSeverity) {
  switch (severity) {
    case 'danger':
      return {
        rail: 'border-slate-200 bg-white border-l-4 border-l-rose-500',
        text: 'text-rose-700',
        dot: 'bg-rose-500',
        pill: 'bg-white text-rose-700 ring-rose-200',
      }
    case 'warning':
      return {
        rail: 'border-amber-200 bg-amber-50/70',
        text: 'text-amber-700',
        dot: 'bg-amber-500',
        pill: 'bg-amber-100 text-amber-800 ring-amber-200',
      }
    case 'ahead':
      return {
        rail: 'border-emerald-200 bg-emerald-50/70',
        text: 'text-emerald-700',
        dot: 'bg-emerald-500',
        pill: 'bg-emerald-100 text-emerald-700 ring-emerald-200',
      }
    case 'normal':
      return {
        rail: 'border-slate-200 bg-slate-50/70',
        text: 'text-slate-700',
        dot: 'bg-slate-500',
        pill: 'bg-slate-100 text-slate-700 ring-slate-200',
      }
    default:
      return {
        rail: 'border-slate-200 bg-white',
        text: 'text-slate-700',
        dot: 'bg-slate-400',
        pill: 'bg-slate-100 text-slate-600 ring-slate-200',
      }
  }
}

function formatDashboardSummaryDate(value?: string | null) {
  if (!value) return null
  return `数据时点 ${formatProjectDate(value)}`
}

function DashboardDecisionOverview({
  summaryData,
  currentProject,
  summaryLoading,
}: {
  summaryData: ProjectSummary | null
  currentProject: CurrentProjectEntity
  summaryLoading: boolean
}) {
  const conclusion = getDashboardProgressConclusion(summaryData)
  const theme = getProgressSeverityTheme(conclusion.severity)
  const resolvedProjectId = currentProject.id ?? summaryData?.id ?? ''
  const ganttHref = resolvedProjectId ? `/projects/${encodeURIComponent(resolvedProjectId)}/gantt` : '/workspace'
  const showSummarySkeleton = summaryLoading && !summaryData
  const summaryDateLabel = formatDashboardSummaryDate(summaryData?.summaryAsOf)
  const plannedEnd = summaryData?.plannedEndDate ?? currentProject.planned_end_date ?? currentProject.end_date ?? null
  const daysUntilPlannedEnd = summaryData?.daysUntilPlannedEnd ?? null
  const hasForecastPlanWindow = Boolean(plannedEnd)
  const forecastMissingProgress = !summaryData || conclusion.actual === null
  const forecastNeedsProgress = !forecastMissingProgress && (conclusion.actual ?? 0) < 1
  const missingPlanProgressBasis = !forecastMissingProgress && !forecastNeedsProgress && (conclusion.planned === null || conclusion.deviation === null)
  const forecastLabel = forecastMissingProgress
    ? '进度数据待补'
    : forecastNeedsProgress
      ? '录入进展后可预测'
      : missingPlanProgressBasis
        ? '计划应到口径待补'
        : conclusion.severity === 'danger'
          ? '按当前偏差，完工存在晚于计划风险'
          : conclusion.severity === 'warning'
            ? '按当前偏差，需盯紧计划完工窗口'
            : conclusion.severity === 'ahead'
              ? '当前进度支撑计划完工窗口'
              : '当前进度基本贴合计划窗口'

  return (
    <section
      data-testid="dashboard-decision-overview"
      className={cn('grid grid-cols-1 gap-5 rounded-xl border p-5 shadow-[var(--el-1)] xl:grid-cols-[minmax(0,1fr)_22rem]', theme.rail)}
    >
      <Link
        to={ganttHref}
        data-testid="dashboard-decision-drilldown"
        aria-label="查看进度偏差根源"
        className="group min-w-0 space-y-5 rounded-lg outline-none transition-colors focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
      >
        {showSummarySkeleton ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <span className={cn('h-2.5 w-2.5 rounded-full', theme.dot)} />
              <span className="meta-muted">执行摘要读取中</span>
            </div>
            <div className="space-y-3">
              <div className="h-7 w-64 max-w-full animate-pulse rounded bg-slate-200" />
              <div className="h-4 w-48 max-w-full animate-pulse rounded bg-slate-100" />
            </div>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
              {['实际进度', '计划应到', '偏差'].map((label) => (
                <div key={label} className="rounded-lg border border-white/70 bg-white/80 px-4 py-3 shadow-[var(--el-1)]">
                  <div className="meta-text">{label}</div>
                  <div className="mt-2 h-6 w-16 animate-pulse rounded bg-slate-200" />
                </div>
              ))}
            </div>
          </>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <span className={cn('h-2.5 w-2.5 rounded-full', theme.dot)} />
              {summaryDateLabel ? <span className="meta-muted">{summaryDateLabel}</span> : null}
            </div>
            <div>
              <h2 className={cn('heading-2 font-semibold tracking-normal', theme.text)}>
                {conclusion.label}
              </h2>
              <p className="mt-2 text-sm text-slate-600">{conclusion.detail}</p>
            </div>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
              {[
                { label: '实际进度', value: conclusion.actual === null ? '--' : `${Math.round(conclusion.actual)}%`, emphasis: false },
                { label: '计划应到', value: conclusion.planned === null ? '--' : `${Math.round(conclusion.planned)}%`, emphasis: false },
                { label: '偏差', value: conclusion.deviation === null ? '--' : `${conclusion.deviation > 0 ? '+' : ''}${Math.round(conclusion.deviation)}%`, emphasis: true },
              ].map((item) => (
                <div key={item.label} className="rounded-lg border border-white/70 bg-white/80 px-4 py-3 shadow-[var(--el-1)]">
                  <div className="meta-text">{item.label}</div>
                  <div className={cn('num-display mt-1 text-xl font-semibold', item.emphasis ? theme.text : 'text-slate-900')}>{item.value}</div>
                </div>
              ))}
            </div>
          </>
        )}
        <span className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 group-hover:text-blue-800">
          查看进度根源
          <ArrowRight className="h-3.5 w-3.5" />
        </span>
      </Link>

      <Link
        to={ganttHref}
        data-testid="dashboard-forecast-summary"
        aria-label="查看关键路径和工期预测依据"
        className="rounded-xl border border-white/70 bg-white/85 p-4 shadow-[var(--el-1)] outline-none transition-colors hover:border-blue-200 hover:bg-white focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
      >
        <div className="flex items-center justify-between gap-3">
          <CardHead eyebrow="FORECAST" title="工期预测" />
        </div>
        <div className="mt-5 space-y-3">
          {showSummarySkeleton ? (
            <div className="space-y-3">
              <div className="h-5 w-48 max-w-full animate-pulse rounded bg-slate-200" />
              <div className="h-3 w-32 max-w-full animate-pulse rounded bg-slate-100" />
            </div>
          ) : (
            <>
              <div className="text-lg font-semibold leading-snug text-slate-900">{forecastLabel}</div>
              <div className="space-y-2 text-xs text-slate-600">
                <div className="flex items-center justify-between gap-3">
                  <span>计划完工</span>
                  <span className="num-mono text-slate-900">{hasForecastPlanWindow && !forecastNeedsProgress ? formatProjectDate(plannedEnd) : '--'}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span>距计划完工</span>
                  <span className="num-mono text-slate-900">{hasForecastPlanWindow && !forecastNeedsProgress && daysUntilPlannedEnd != null ? `${daysUntilPlannedEnd} 天` : '--'}</span>
                </div>
              </div>
            </>
          )}
        </div>
        <span className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-blue-600">
          查看关键路径
          <ArrowRight className="h-3.5 w-3.5" />
        </span>
      </Link>
    </section>
  )
}

function DashboardHealthWeaknessPanel({
  healthDetails,
  healthDetailsStatus,
  projectId,
}: {
  healthDetails: DashboardBusinessHealthDetails | null
  healthDetailsStatus: HealthDetailsStatus
  projectId: string
}) {
  const rows = [
    { key: 'progress', label: '进度兑现', value: healthDetails?.progressDeliveryScore, href: `/projects/${projectId}/gantt` },
    { key: 'execution', label: '执行稳定度', value: healthDetails?.executionStabilityScore ?? healthDetails?.taskExecutionScore, href: `/projects/${projectId}/gantt` },
    { key: 'target', label: '关键目标', value: healthDetails?.criticalTargetScore ?? healthDetails?.milestoneDeliveryScore, href: `/projects/${projectId}/milestones` },
    { key: 'exception', label: '业务异常', value: healthDetails?.businessExceptionScore ?? healthDetails?.riskControlScore, href: `/projects/${projectId}/risks` },
    { key: 'governance', label: '计划治理', value: healthDetails?.planGovernanceScore, href: `/projects/${projectId}/planning/baseline` },
  ]
    .map((item) => ({ ...item, value: readSummaryNumber(item.value) }))
    .filter((item): item is { key: string; label: string; value: number; href: string } => item.value !== null)
    .sort((left, right) => left.value - right.value)
    .slice(0, 5)
  const capReasons = (healthDetails?.capReasons ?? []).slice(0, 3)
  const isDegraded = healthDetailsStatus === 'degraded'
  const isUnavailable = healthDetailsStatus === 'unavailable' || isDegraded

  return (
    <section data-testid="dashboard-health-weakness-panel" className="surface-card p-5">
      <CardHead
        eyebrow="BREAKDOWN"
        title="掉在哪"
      />
      <div className="mt-5">
        {healthDetailsStatus === 'loading' ? (
          <div
            data-testid="dashboard-health-weakness-loading"
            className="space-y-2"
          >
            <div className="text-xs text-slate-500">健康指标加载中</div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {['进度兑现', '执行稳定度', '关键目标'].map((label) => (
                <div key={label} className="rounded-lg border border-slate-200/70 bg-slate-50/80 px-3 py-2.5">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs font-medium text-slate-500">{label}</span>
                    <span className="h-3 w-8 animate-pulse rounded bg-slate-200" />
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white">
                    <div className="h-full w-2/3 animate-pulse rounded-full bg-slate-200" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : isUnavailable || rows.length === 0 ? (
          <div className="rounded-lg border border-slate-200/70 bg-slate-50 px-4 py-3 text-sm text-slate-600">
            {isDegraded
              ? '健康指标暂不可用，先使用摘要健康参考；弱项明细稍后重试。'
              : '健康指标暂不可用，先以摘要进度和风险信号为准。'}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-5">
            {rows.map((item, index) => (
              <Link
                key={item.key}
                to={item.href}
                className={cn(
                  'rounded-lg border bg-white px-4 py-3 shadow-[var(--el-1)] transition-colors hover:border-blue-200 hover:bg-blue-50/40',
                  index === 0 ? 'border-rose-200 ring-1 ring-rose-100' : 'border-slate-200/70',
                )}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="truncate text-sm font-medium text-slate-800">{item.label}</span>
                  <span className={cn('num-mono text-sm font-semibold', item.value < 60 ? 'text-rose-700' : item.value < 80 ? 'text-amber-700' : 'text-slate-700')}>
                    {Math.round(item.value)}
                  </span>
                </div>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className={cn('h-full rounded-full', item.value < 60 ? 'bg-rose-500' : item.value < 80 ? 'bg-amber-500' : 'bg-slate-500')}
                    style={{ width: `${Math.max(4, Math.min(100, Math.round(item.value)))}%` }}
                  />
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
      {capReasons.length > 0 ? (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50/70 px-4 py-3">
          <div className="text-xs font-medium text-amber-800">影响健康分的原因</div>
          <div className="mt-2 text-sm leading-6 text-amber-900">
            {capReasons.join(' / ')}
          </div>
        </div>
      ) : null}
    </section>
  )
}

function DashboardActionPanel({
  summaryData,
  projectId,
}: {
  summaryData: ProjectSummary | null
  projectId: string
}) {
  const delayedCount = summaryData?.activeDelayedTasks ?? summaryData?.delayedTaskCount ?? 0
  const riskCount = summaryData?.activeRiskCount ?? 0
  const issueCount = summaryData?.activeIssueCount ?? 0
  const obstacleCount = summaryData?.activeObstacleTaskCount ?? summaryData?.activeObstacleCount ?? 0
  const conditionCount = summaryData?.pendingConditionTaskCount ?? 0
  const todayActionCount = summaryData?.projectTodayActionCount ?? summaryData?.todayTodoCount ?? 0
  const actions = [
    delayedCount > 0
      ? {
        key: 'delay',
        title: '先处理延期任务',
        meta: `${delayedCount} 个延期任务，偏差时长见任务明细`,
        href: `/projects/${projectId}/gantt`,
        tone: 'danger',
      }
      : null,
    riskCount + issueCount > 0
      ? {
        key: 'risk',
        title: '压住风险与问题',
        meta: `${riskCount} 个风险 / ${issueCount} 个问题`,
        href: `/projects/${projectId}/risks`,
        tone: 'warning',
      }
      : null,
    obstacleCount + conditionCount > 0
      ? {
        key: 'blocker',
        title: '解除阻碍与前置条件',
        meta: `${obstacleCount} 个阻碍任务 / ${conditionCount} 个待满足条件`,
        href: `/projects/${projectId}/gantt`,
        tone: 'slate',
      }
      : null,
    todayActionCount > 0
      ? {
        key: 'today',
        title: '收拢今日待办',
        meta: `${todayActionCount} 件今日待处理`,
        href: `/projects/${projectId}/gantt`,
        tone: 'slate',
      }
      : null,
  ].filter((item): item is { key: string; title: string; meta: string; href: string; tone: string } => Boolean(item)).slice(0, 3)
  const visibleActions = actions.length > 0
    ? actions
    : [{
      key: 'review',
      title: '复核今日计划',
      meta: '暂无突出异常，建议确认关键节点和现场进度',
      href: `/projects/${projectId}/gantt`,
      tone: 'slate',
    }]

  return (
    <section data-testid="dashboard-action-panel" className="surface-card p-5">
      <CardHead eyebrow="ACTION" title="今天干这件" />
      <div className="mt-5 grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1.35fr)_repeat(2,minmax(0,1fr))]">
        {visibleActions.map((item, index) => (
          <Link
            key={item.key}
            to={item.href}
            className={cn(
              'group rounded-lg border transition-colors hover:border-blue-200 hover:bg-blue-50/40',
              index === 0
                ? 'bg-white p-5 shadow-[var(--el-2)] ring-1 ring-blue-100'
                : 'bg-slate-50/70 p-3.5 shadow-none',
              index === 0 && item.tone === 'danger' && 'border-rose-200 bg-rose-50/60 ring-rose-100',
              index === 0 && item.tone === 'warning' && 'border-amber-200 bg-amber-50/60 ring-amber-100',
              index === 0 && item.tone === 'slate' && 'border-blue-200',
              index > 0 && 'border-slate-200/70',
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className={cn('font-semibold text-slate-900', index === 0 ? 'text-base' : 'text-sm')}>{item.title}</div>
                <div className={cn('mt-1 leading-5 text-slate-500', index === 0 ? 'text-sm' : 'text-xs')}>{item.meta}</div>
                {index === 0 ? (
                  <div className="mt-3 inline-flex items-center text-xs font-medium text-blue-700">
                    打开处理页
                    <ArrowRight className="ml-1 h-3.5 w-3.5" />
                  </div>
                ) : null}
              </div>
              <ArrowRight className={cn('shrink-0 text-slate-400 transition-colors group-hover:text-blue-600', index === 0 ? 'h-5 w-5' : 'h-4 w-4')} />
            </div>
          </Link>
        ))}
      </div>
    </section>
  )
}

function DashboardColdStartActivation({ projectId }: { projectId: string }) {
  const ganttHref = `/projects/${encodeURIComponent(projectId)}/gantt`

  return (
    <Card
      variant="surface"
      data-testid="dashboard-cold-start-activation"
      data-onboarding-target="dashboard-metrics"
      className="motion-safe:animate-fade-in"
    >
      <CardContent padding="md" className="flex flex-col gap-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 space-y-2">
            <div className="eyebrow">下一步</div>
            <h3 className="text-lg font-semibold text-slate-900">
              计划已生成，去录入第一条现场进展
            </h3>
            <p className="text-sm text-slate-500">
              录入进度后，健康/偏差/下一步会自动浮现——这就是少录多得。
            </p>
          </div>
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-slate-200/60 bg-white text-blue-600">
            <LucideIcon icon={ClipboardCheck} className="h-3.5 w-3.5" />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3 pt-1">
          <Button asChild>
            <Link data-testid="dashboard-activation-primary" to={ganttHref}>
              <LucideIcon icon={ArrowRight} className="mr-2 h-4 w-4" />
              去 Gantt 录进展
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link data-testid="dashboard-activation-secondary" to={ganttHref}>
              先看看计划
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function DashboardReadyFactCards({
  summaryData,
  currentProject,
}: {
  summaryData: ProjectSummary | null
  currentProject: CurrentProjectEntity
}) {
  const taskCount = getDashboardPlanTaskCount(summaryData)
  const phaseCount = getDashboardPlanPhaseCount(summaryData)
  const durationDays = getDashboardPlanDurationDays(summaryData, currentProject)
  const facts = [
    {
      key: 'tasks',
      eyebrow: '总任务',
      title: '计划任务',
      value: taskCount,
      unit: '',
      hint: '项目计划汇总',
    },
    {
      key: 'phases',
      eyebrow: '阶段',
      title: '计划阶段',
      value: phaseCount ?? '--',
      unit: phaseCount ? '个' : '',
      hint: '项目计划汇总',
    },
    {
      key: 'duration',
      eyebrow: '计划周期',
      title: '计划工期',
      value: durationDays ?? '--',
      unit: durationDays ? '天' : '',
      hint: '来自计划起止日期',
    },
  ]

  return (
    <div data-testid="dashboard-ready-fact-cards" className="grid grid-cols-1 gap-5 md:grid-cols-3">
      {facts.map((fact) => (
        <SharedMetricCard
          key={fact.key}
          testId={`dashboard-ready-fact-${fact.key}`}
          eyebrow={fact.eyebrow}
          title={fact.title}
          value={fact.value}
          unit={fact.unit}
          hint={fact.hint}
          tone="slate"
          density="compact"
          animateValue={false}
        />
      ))}
    </div>
  )
}

function DashboardPlanEmptyState({ projectId }: { projectId: string }) {
  return (
    <EmptyState
      testId="dashboard-plan-empty-state"
      icon={LayoutDashboard}
      title="先生成项目计划"
      description="几分钟建模 → 自动生成施工计划 → 开始管项目"
      action={
        <Button asChild>
          <Link
            data-testid="dashboard-plan-empty-action"
            to={`/projects/${encodeURIComponent(projectId)}/gantt?modelingWorkbench=generate`}
          >
            去快速建模
          </Link>
        </Button>
      }
      className="max-w-none"
    />
  )
}

function TodayProgressListPanel({
  loading,
  items,
  error,
  embedded = false,
}: {
  loading: boolean
  items: TodayProgressItem[]
  error?: string | null
  embedded?: boolean
}) {
  const previewItems = items.slice(0, 4)
  const panelClassName = embedded ? '' : 'surface-card h-full p-5'

  return (
    <section data-testid="dashboard-live-panel" className={panelClassName}>
      {!embedded ? (
        <CardHead
          eyebrow="TODAY"
          title="今日进展"
        />
      ) : null}
      <div className={cn(!embedded && 'mt-5')}>
        {loading ? (
          <LoadingState label="今日进展加载中" description="" className="min-h-24 border-0 bg-transparent px-0 py-2 shadow-none" />
        ) : error ? (
          <div className={cn('flex flex-col items-center justify-center text-center', embedded ? 'min-h-32' : 'min-h-56')}>
            <AlertTriangle className="h-8 w-8 text-amber-500" />
            <h3 className="mt-3 text-sm font-medium text-slate-900">今日进展暂不可用</h3>
            <p className="mt-2 max-w-xs text-xs text-slate-500">{error}</p>
          </div>
        ) : previewItems.length === 0 ? (
          <div className={cn('flex flex-col items-center justify-center text-center', embedded ? 'min-h-32' : 'min-h-56')}>
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-500 ring-1 ring-inset ring-emerald-200/60">
              <CheckCircle className="h-7 w-7" />
            </div>
            <h3 className="mt-4 text-sm font-medium text-slate-900">今日暂无进度变化</h3>
          </div>
        ) : (
          <ul className="max-h-72 space-y-2.5 overflow-y-auto overscroll-contain pr-1">
            {previewItems.map((item) => (
              <li
                key={item.id}
                className="rounded-lg border border-slate-100 bg-white px-3.5 py-3 shadow-[var(--el-1)]"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0 truncate text-sm font-medium text-slate-800">{item.title}</div>
                  <div className="num-mono shrink-0 text-xs text-slate-500">
                    <span>{item.previousProgress}%</span>
                    <span className="px-1 text-slate-300">→</span>
                    <span className={item.delta >= 0 ? 'text-blue-600' : 'text-rose-600'}>{item.currentProgress}%</span>
                  </div>
                </div>
                <div
                  className="relative mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100"
                  role="img"
                  aria-label={`${item.title}：${item.previousProgress}% 到 ${item.currentProgress}%`}
                >
                  {item.delta >= 0 ? (
                    <>
                      <span className="absolute inset-y-0 left-0 rounded-full bg-slate-300/80" style={{ width: `${item.previousProgress}%` }} />
                      <span
                        className="absolute inset-y-0 rounded-r-full bg-blue-600"
                        style={{ left: `${item.previousProgress}%`, width: `${item.currentProgress - item.previousProgress}%` }}
                      />
                    </>
                  ) : (
                    <>
                      <span className="absolute inset-y-0 left-0 rounded-l-full bg-blue-600" style={{ width: `${item.currentProgress}%` }} />
                      <span
                        className="absolute inset-y-0 rounded-r-full bg-rose-300"
                        style={{ left: `${item.currentProgress}%`, width: `${item.previousProgress - item.currentProgress}%` }}
                      />
                    </>
                  )}
                </div>
              </li>
            ))}
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
  healthDetails,
  healthDetailsStatus,
  summaryLoading,
  todayProgressLoading,
  fetchCompleteTime,
  onRefresh,
  canRunDataQualityGovernance,
  dataQualityActionLoading,
  onRecomputeDataQualitySnapshot,
  onResolveSourceDeletedFindings,
}: {
  currentProject: CurrentProjectEntity
  currentStatus: ProjectStatus
  summaryData: ProjectSummary | null
  dataQualitySummary: DataQualityProjectSummary | null
  healthDetails: DashboardBusinessHealthDetails | null
  healthDetailsStatus: HealthDetailsStatus
  summaryLoading: boolean
  todayProgressLoading: boolean
  fetchCompleteTime: number
  onRefresh: () => void
  canRunDataQualityGovernance: boolean
  dataQualityActionLoading: boolean
  onRecomputeDataQualitySnapshot: () => void
  onResolveSourceDeletedFindings: () => void
}) {
  const [confidenceDialogOpen, setConfidenceDialogOpen] = useState(false)
  const confidence = dataQualitySummary?.confidence
  const sourceDeletedFindings = useMemo(
    () => (dataQualitySummary?.findings ?? []).filter((item) => (
      item.status === 'active' &&
      (item.rule_code === 'SOURCE_DELETED_UNRESOLVED' || item.rule_type === 'source_deleted' || item.resolved_type === 'source_deleted')
    )),
    [dataQualitySummary?.findings],
  )
  const healthDetailsScore = healthDetailsStatus === 'ready'
    ? (healthDetails?.businessHealthScore ?? healthDetails?.totalScore)
    : undefined
  const businessHealthScoreValue = readSummaryNumber(healthDetailsScore) ?? readSummaryNumber(summaryData?.businessHealthScore)
  const businessHealthScore = businessHealthScoreValue === null ? null : Math.round(businessHealthScoreValue)
  const progressValue = readSummaryNumber(summaryData?.overallProgress)
  const healthProgressConflict = businessHealthScore !== null && businessHealthScore >= 60 && progressValue !== null && progressValue < 1
  const businessHealthLabel = businessHealthScore === null
    ? '业务健康 --'
    : `业务健康 ${businessHealthScore}分${healthProgressConflict ? ' · 低信' : ''}`
  const businessHealthChipScore = healthProgressConflict ? 40 : businessHealthScore
  const plannedStart = summaryData?.plannedStartDate ?? null
  const plannedEnd = summaryData?.plannedEndDate ?? null
  const projectStatusLabel = getDashboardProjectStatusLabel(summaryData, currentStatus)
  const projectDisplayName = resolveDashboardProjectIdentity(currentProject, summaryData)

  return (
    <section data-testid="dashboard-page-title" className="pb-2">
      <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0 space-y-3">
          <Breadcrumb
            items={[
              { label: projectDisplayName, href: `/projects/${currentProject.id}/dashboard` },
              { label: PROJECT_NAVIGATION_LABELS.dashboard },
            ]}
          />
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-slate-500">
            <span>{projectStatusLabel}</span>
            <span className="text-slate-300">/</span>
            <span>计划工期</span>
            <span className="num-mono text-slate-600">{formatProjectDate(plannedStart)} - {formatProjectDate(plannedEnd)}</span>
          </div>
          <div>
            <h1 className="dashboard-title truncate font-semibold tracking-tight text-slate-950">
              {projectDisplayName}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-500">
              <span
                data-testid="dashboard-business-health-chip"
                className={getMetricChipClass(businessHealthChipScore)}
                title={healthProgressConflict ? '进度尚未形成有效录入，业务健康分暂按低信号处理。' : undefined}
              >
                {businessHealthLabel}
              </span>
              <Button
                type="button"
                unstyled
                data-testid="dashboard-data-quality-detail-trigger"
                className={cn(
                  getMetricChipClass(confidence?.score),
                  'outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2',
                  confidence ? 'cursor-pointer hover:bg-white' : 'cursor-default',
                )}
                onClick={confidence ? () => setConfidenceDialogOpen(true) : undefined}
                disabled={!confidence}
              >
                数据可靠性 {confidence ? `${Math.round(confidence.score)}%` : '--'}
              </Button>
              <span data-testid="dashboard-progress-chip" className={cn(getMetricChipClass(progressValue, 'blue'), 'num-mono')}>
                进度 {progressValue === null ? '--' : `${Math.round(progressValue)}%`}
              </span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 xl:justify-end">
          <span className="meta-muted num-mono">更新于 {getMinutesAgo(fetchCompleteTime)}</span>
          <Button
            variant="outline"
            size="sm"
            onClick={onRefresh}
            loading={summaryLoading || todayProgressLoading}
            className="h-8 rounded-lg border-slate-200 bg-white px-2.5 text-xs"
          >
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
            刷新
          </Button>
          <Button asChild variant="outline" size="sm" className="h-8 rounded-lg border-slate-200 bg-white px-2.5 text-xs">
            <Link to="/workspace">
              <LayoutDashboard className="mr-1.5 h-3.5 w-3.5" />
              返回工作台
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
              {canRunDataQualityGovernance ? (
                <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 pt-4">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={onRecomputeDataQualitySnapshot}
                    loading={dataQualityActionLoading}
                  >
                    <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                    重算快照
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={onResolveSourceDeletedFindings}
                    loading={dataQualityActionLoading}
                    disabled={sourceDeletedFindings.length === 0 || dataQualityActionLoading}
                  >
                    <CheckCircle className="mr-1.5 h-3.5 w-3.5" />
                    标记来源已删除已处理
                  </Button>
                </div>
              ) : null}
            </div>
          </DialogContent>
        </Dialog>
      ) : null}
    </section>
  )
}

function WeeklyDigestPanel({
  projectId,
  embedded = false,
}: {
  projectId: string
  embedded?: boolean
}) {
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
    critical_nearest_delay?: DurationMetricDto | null
    top_delayed_tasks?: Array<{ task_id: string; title: string; assignee?: string; delay: DurationMetricDto }> | null
    abnormal_responsibilities?: Array<{ subject_id: string; name: string; type: string }> | null
    new_risks_count?: number | null
    new_obstacles_count?: number | null
    max_risk_level?: string | null
  }
  const [digest, setDigest] = useState<DigestData | null>(null)
  const [loading, setLoading] = useState(true)
  const panelClassName = embedded ? 'h-full' : 'surface-card h-full p-5'

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

  const nearestMilestoneName = digest?.critical_nearest_milestone || '--'
  const nearestMilestoneTiming = digest?.critical_nearest_delay ?? null
  const nearestMilestoneDelta = readAvailableDurationValue(nearestMilestoneTiming)
  const nearestMilestoneHint =
    !nearestMilestoneTiming
      ? '等待关键节点数据'
      : nearestMilestoneDelta == null
        ? formatDurationMetric(nearestMilestoneTiming)
      : nearestMilestoneDelta > 0
        ? `延期 ${formatDurationMetric(nearestMilestoneTiming, { absolute: true })}`
        : nearestMilestoneDelta === 0
          ? '今日到期'
          : `剩余 ${formatDurationMetric(nearestMilestoneTiming, { absolute: true })}`
  const focusItems = digest
    ? [
        ...(digest.top_delayed_tasks ?? []).slice(0, 3).map((task) => ({
          title: task.title,
          meta: `${formatDurationMetric(task.delay, { absolute: true })}延期${task.assignee ? ` · ${task.assignee}` : ''}`,
        })),
        (digest.critical_blocked_count ?? 0) > 0
          ? { title: '关键阻碍待解除', meta: `${digest.critical_blocked_count} 个阻碍影响关键路径` }
          : null,
        (digest.new_risks_count ?? 0) > 0
          ? { title: '本周新增风险', meta: `${digest.new_risks_count} 个新增${digest.max_risk_level ? ` · 最高 ${digest.max_risk_level}` : ''}` }
          : null,
        digest.abnormal_responsibilities?.[0]
          ? { title: '责任主体需关注', meta: digest.abnormal_responsibilities[0].name }
          : null,
      ].filter((item): item is { title: string; meta: string } => Boolean(item)).slice(0, 3)
    : []

  return (
    <section data-testid="dashboard-weekly-digest" className={panelClassName}>
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
        <div className="mt-5 space-y-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {[
              { label: '本周新增风险', value: `${digest.new_risks_count ?? 0}`, hint: digest.max_risk_level ? `最高等级 ${digest.max_risk_level}` : '暂无新增风险' },
              { label: '关键阻碍数', value: `${digest.critical_blocked_count ?? 0}`, hint: '关键路径未解除阻碍' },
              { label: '最近关键里程碑', value: nearestMilestoneName, hint: nearestMilestoneHint },
            ].map((item) => {
              const isTextValue = item.label === '最近关键里程碑'
              return (
                <div key={item.label} className="rounded-xl border border-slate-200/60 bg-slate-50/60 p-5">
                  <div className="meta-text">{item.label}</div>
                  <div
                    className={cn(
                      'mt-3 font-semibold text-slate-900',
                      isTextValue ? 'heading-3 line-clamp-2 leading-tight tracking-normal' : 'metric-value-lg num-display truncate',
                    )}
                    title={item.value}
                  >
                    {item.value}
                  </div>
                  <div className="meta-muted mt-2 inline-flex items-center gap-1.5">
                    {item.hint.includes('生产日') ? <DurationBasisBadge basis="production" compact variant="outline" /> : null}
                    <span>{item.hint}</span>
                  </div>
                </div>
              )
            })}
          </div>
          {focusItems.length > 0 ? (
            <div className="border-t border-slate-100 pt-3">
              <div className="meta-text mb-2 font-medium text-slate-500">重点关注事项</div>
              <div className="space-y-2">
                {focusItems.map((item) => (
                  <div key={`${item.title}-${item.meta}`} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-lg bg-slate-50/60 px-3 py-2">
                    <span className="truncate text-xs font-medium text-slate-700">{item.title}</span>
                    <span className="meta-muted inline-flex max-w-[12rem] items-center justify-end gap-1.5 truncate text-right">
                      {item.meta.includes('生产日') ? <DurationBasisBadge basis="production" compact variant="outline" /> : null}
                      <span className="truncate">{item.meta}</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      )}
    </section>
  )
}

function DashboardMonthlyTrend({ projectId, embedded = false }: { projectId: string; embedded?: boolean }) {
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
  const panelClassName = embedded ? '' : 'surface-card p-5'

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

  function MonthlyTrendTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ payload?: CombinedTrendRow }>; label?: unknown }) {
    if (!active || !payload?.length) return null

    const row = payload[0]?.payload
    if (!row) return null
    const taskRate = row.taskOnTimeRate == null ? '--' : `${row.taskOnTimeRate}%`
    const fulfillmentRate = row.fulfillmentRate == null ? '--' : `${row.fulfillmentRate}%`

    return (
      <div className="rounded-lg border border-slate-200/60 bg-white p-3 text-xs leading-5 shadow-[var(--el-2)]" style={{ animation: 'tooltip-in 160ms ease-out' }}>
        <div className="font-medium text-slate-900">{monthLabel(String(label))} 完成率 {taskRate}</div>
        <div className="text-slate-500">已完成 {row.on_time} · 已延期 {row.delayed}</div>
        <div className="text-slate-500">履约率 {fulfillmentRate}</div>
      </div>
    )
  }

  return (
    <section data-testid="dashboard-monthly-trend" className={panelClassName}>
      <CardHead
        eyebrow="TREND"
        title="月度趋势（近6个月）"
        action={
          <div className="meta-text flex items-center gap-4">
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
            detailsClassName="sr-only"
          >
            <div className="h-[240px] w-full">
              <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1} initialDimension={{ width: 640, height: 240 }}>
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
                  <Tooltip content={<MonthlyTrendTooltip />} cursor={chartTooltipCursor} />
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
  const updateProject = useStore((state) => state.updateProject)
  const [summary, setSummary] = useState<ProjectSummary | null>(null)
  const [dataQualitySummary, setDataQualitySummary] = useState<DataQualityProjectSummary | null>(null)
  const [healthDetails, setHealthDetails] = useState<DashboardBusinessHealthDetails | null>(null)
  const [healthDetailsStatus, setHealthDetailsStatus] = useState<HealthDetailsStatus>('unavailable')
  const [summaryLoading, setSummaryLoading] = useState(false)
  const [summaryError, setSummaryError] = useState<string | null>(null)
  const [todayProgressItems, setTodayProgressItems] = useState<TodayProgressItem[]>([])
  const [todayProgressLoading, setTodayProgressLoading] = useState(false)
  const [todayProgressError, setTodayProgressError] = useState<string | null>(null)
  const [fetchCompleteTime, setFetchCompleteTime] = useState(0)
  const summaryAbortRef = useRef<AbortController | null>(null)
  const dataQualityAbortRef = useRef<AbortController | null>(null)
  const healthDetailsAbortRef = useRef<AbortController | null>(null)
  const todayProgressAbortRef = useRef<AbortController | null>(null)
  type DashboardSupportTab = 'forecast' | 'trend' | 'execution'
  const [activeSupportTab, setActiveSupportTab] = useState<DashboardSupportTab | null>(null)
  const projectId = currentProject?.id ?? ''
  const { isOwner } = usePermissions({ projectId })
  const [dataQualityActionLoading, setDataQualityActionLoading] = useState(false)
  const currentStatus = normalizeProjectStatus(currentProject?.status)
  const constructionOrganizationScenario = useMemo(
    () => readConstructionOrganizationScenarioFromProject(currentProject),
    [currentProject],
  )
  const constructionOrganizationUseCase = useMemo(
    () => readConstructionOrganizationUseCase(constructionOrganizationScenario),
    [constructionOrganizationScenario],
  )
  const summaryData = summary
  useEffect(() => {
    if (!currentProject || !projectId || !summaryData) return
    const summaryProjectId = String(summaryData.id ?? '').trim()
    if (summaryProjectId && summaryProjectId !== projectId) return

    const summaryName = normalizeDashboardProjectIdentity(summaryData.name)
    if (!summaryName) return

    const currentName = normalizeDashboardProjectIdentity(currentProject.name)
    if (currentName === summaryName) return

    updateProject(projectId, { name: summaryName } as Partial<CurrentProjectEntity>)
  }, [currentProject, projectId, summaryData, updateProject])
  const hasSummaryData = Boolean(summaryData)
  const planTaskCount = getDashboardPlanTaskCount(summaryData)
  const hasExecutionData = hasDashboardExecutionData(summaryData, todayProgressItems)
  const shouldShowPlanEmptyState = hasSummaryData && planTaskCount === 0
  const shouldShowColdStartActivation = hasSummaryData && planTaskCount > 0 && !hasExecutionData
  const sourceDeletedFindingIds = useMemo(
    () => (dataQualitySummary?.findings ?? [])
      .filter((item) => (
        item.status === 'active' &&
        (item.rule_code === 'SOURCE_DELETED_UNRESOLVED' || item.rule_type === 'source_deleted' || item.resolved_type === 'source_deleted')
      ))
      .map((item) => item.id)
      .filter(Boolean),
    [dataQualitySummary?.findings],
  )
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
      const nextSummary = await DashboardApiService.getProjectSummary(projectId, {
        signal: options.signal,
      })
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

  const loadTodayProgress = useCallback(async (options?: { signal?: AbortSignal }) => {
    if (!projectId) {
      setTodayProgressItems([])
      setTodayProgressError(null)
      return
    }

    if (!options?.signal) {
      todayProgressAbortRef.current?.abort()
      todayProgressAbortRef.current = new AbortController()
      options = { signal: todayProgressAbortRef.current.signal }
    }

    setTodayProgressLoading(true)
    setTodayProgressError(null)
    try {
      const response = await apiGet<unknown>(`/api/projects/${projectId}/dashboard/today-progress`, {
        signal: options.signal,
        runtimeCache: 'off',
      })
      if (!options.signal?.aborted) {
        setTodayProgressItems(sortTodayProgressItems(normalizeApiTodayProgressItems(response)))
      }
    } catch (error) {
      if (isAbortError(error)) return
      console.error('Failed to load dashboard today progress items:', error)
      setTodayProgressItems([])
      setTodayProgressError('今日进展接口暂时不可用。')
    } finally {
      if (!options.signal?.aborted) {
        setTodayProgressLoading(false)
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

  const loadHealthDetails = useCallback(async (options?: { signal?: AbortSignal }) => {
    if (!projectId) {
      setHealthDetails(null)
      setHealthDetailsStatus('unavailable')
      return
    }

    if (!options?.signal) {
      healthDetailsAbortRef.current?.abort()
      healthDetailsAbortRef.current = new AbortController()
      options = { signal: healthDetailsAbortRef.current.signal }
    }

    setHealthDetails(null)
    setHealthDetailsStatus('loading')
    try {
      const payload = await apiGet<BusinessHealthScorePayload>(`/api/health-score/${projectId}`, {
        signal: options.signal,
        runtimeCache: 'off',
      })
      if (!options.signal?.aborted) {
        setHealthDetails(payload?.details ?? null)
        setHealthDetailsStatus(payload?.degraded ? 'degraded' : payload?.details ? 'ready' : 'unavailable')
      }
    } catch (error) {
      if (isAbortError(error)) return
      console.error('Failed to load dashboard health details:', error)
      setHealthDetails(null)
      setHealthDetailsStatus(error instanceof ApiClientError && error.status === 504 ? 'degraded' : 'unavailable')
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
    if (!summaryData || !projectId) return undefined

    const controller = new AbortController()
    setHealthDetails(null)
    setHealthDetailsStatus('loading')
    const timer = window.setTimeout(() => {
      void loadHealthDetails({ signal: controller.signal })
      void loadDataQualitySummary({ signal: controller.signal })
    }, DASHBOARD_SECONDARY_READ_DELAY_MS)
    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [loadDataQualitySummary, loadHealthDetails, projectId, summaryData?.id, fetchCompleteTime])

  useEffect(() => {
    if (activeSupportTab !== 'execution') return undefined
    const controller = new AbortController()
    void loadTodayProgress({ signal: controller.signal })

    return () => {
      controller.abort()
    }
  }, [activeSupportTab, loadTodayProgress])

  useEffect(() => {
    if (!summaryData || !projectId || summaryLoading || activeSupportTab !== null) return undefined

    const timer = window.setTimeout(() => {
      setActiveSupportTab((current) => current ?? 'forecast')
    }, DASHBOARD_DEFAULT_SUPPORT_TAB_DELAY_MS)

    return () => {
      window.clearTimeout(timer)
    }
  }, [activeSupportTab, projectId, summaryData?.id, summaryLoading])

  useEffect(() => {
    return () => {
      summaryAbortRef.current?.abort()
      dataQualityAbortRef.current?.abort()
      healthDetailsAbortRef.current?.abort()
      todayProgressAbortRef.current?.abort()
    }
  }, [])

  const refreshDashboard = useCallback(() => {
    void loadSummary()
    void loadTodayProgress()
    void loadDataQualitySummary()
    void loadHealthDetails()
  }, [loadDataQualitySummary, loadHealthDetails, loadSummary, loadTodayProgress])

  const handleRecomputeDataQualitySnapshot = useCallback(async () => {
    if (!projectId || dataQualityActionLoading) return
    setDataQualityActionLoading(true)
    try {
      const nextSummary = await DataQualityApiService.recomputeSnapshot(projectId)
      if (nextSummary) setDataQualitySummary(nextSummary)
      toast({ title: '数据质量快照已重算' })
    } catch (error) {
      if (!isAbortError(error)) {
        toast({
          title: '重算快照失败',
          description: '请稍后重试或检查数据质量接口。',
          variant: 'destructive',
        })
      }
    } finally {
      setDataQualityActionLoading(false)
    }
  }, [dataQualityActionLoading, projectId, toast])

  const handleResolveSourceDeletedFindings = useCallback(async () => {
    if (!projectId || dataQualityActionLoading) return
    if (sourceDeletedFindingIds.length === 0) {
      toast({ title: '暂无来源已删除待处理项' })
      return
    }

    setDataQualityActionLoading(true)
    try {
      const result = await DataQualityApiService.resolveSourceDeleted(projectId, { findingIds: sourceDeletedFindingIds })
      await loadDataQualitySummary()
      toast({
        title: '来源已删除项已处理',
        description: `已处理 ${result?.resolvedCount ?? sourceDeletedFindingIds.length} 条。`,
      })
    } catch (error) {
      if (!isAbortError(error)) {
        toast({
          title: '处理来源已删除失败',
          description: '请刷新后重试。',
          variant: 'destructive',
        })
      }
    } finally {
      setDataQualityActionLoading(false)
    }
  }, [dataQualityActionLoading, loadDataQualitySummary, projectId, sourceDeletedFindingIds, toast])

  if (!currentProject) {
    return (
      <div className="page-shell" data-testid="dashboard-empty-state">
        <Breadcrumb
          items={[
            { label: '工作台', href: '/workspace' },
            { label: PROJECT_NAVIGATION_LABELS.dashboard },
          ]}
        />
        <V14231PageReadinessBoundary pageKey="Dashboard 项目总览" />
        <EmptyState
          icon={LayoutDashboard}
          title="未选择项目"
          description={`请先进入一个项目，再查看项目${PROJECT_NAVIGATION_LABELS.dashboard}。`}
          action={
            <Button asChild>
              <Link to="/workspace">返回工作台</Link>
            </Button>
          }
          className="max-w-none"
        />
      </div>
    )
  }

  const dashboardIntro = (
    <>
      <DashboardPageTitle
        currentProject={currentProject}
        currentStatus={currentStatus}
        summaryData={summaryData}
        dataQualitySummary={dataQualitySummary}
        healthDetails={healthDetails}
        healthDetailsStatus={healthDetailsStatus}
        summaryLoading={summaryLoading}
        todayProgressLoading={todayProgressLoading}
        fetchCompleteTime={fetchCompleteTime}
        onRefresh={refreshDashboard}
        canRunDataQualityGovernance={isOwner}
        dataQualityActionLoading={dataQualityActionLoading}
        onRecomputeDataQualitySnapshot={handleRecomputeDataQualitySnapshot}
        onResolveSourceDeletedFindings={handleResolveSourceDeletedFindings}
      />
      <V14231PageReadinessBoundary pageKey="Dashboard 项目总览" />

      {constructionOrganizationScenario ? (
        <section data-testid="dashboard-construction-organization-scenario">
          <ConstructionOrganizationScenarioSummary
            scenario={constructionOrganizationScenario}
            activeUseCase={constructionOrganizationUseCase}
          />
        </section>
      ) : null}
    </>
  )

  if (shouldShowPlanEmptyState) {
    return (
      <div data-testid="dashboard-page" className="page-shell page-enter">
        {dashboardIntro}
        <DashboardPlanEmptyState projectId={projectId} />
        {summaryError ? (
          <Alert variant="destructive">
            <AlertDescription>{summaryError}</AlertDescription>
          </Alert>
        ) : null}
      </div>
    )
  }

  if (shouldShowColdStartActivation) {
    return (
      <div data-testid="dashboard-page" className="page-shell page-enter">
        {dashboardIntro}
        <DashboardColdStartActivation projectId={projectId} />
        <DashboardReadyFactCards summaryData={summaryData} currentProject={currentProject} />
        {summaryError ? (
          <Alert variant="destructive">
            <AlertDescription>{summaryError}</AlertDescription>
          </Alert>
        ) : null}
      </div>
    )
  }

  return (
    <div data-testid="dashboard-page" className="page-shell page-enter">
      <DashboardPageTitle
        currentProject={currentProject}
        currentStatus={currentStatus}
        summaryData={summaryData}
        dataQualitySummary={dataQualitySummary}
        healthDetails={healthDetails}
        healthDetailsStatus={healthDetailsStatus}
        summaryLoading={summaryLoading}
        todayProgressLoading={todayProgressLoading}
        fetchCompleteTime={fetchCompleteTime}
        onRefresh={refreshDashboard}
        canRunDataQualityGovernance={isOwner}
        dataQualityActionLoading={dataQualityActionLoading}
        onRecomputeDataQualitySnapshot={handleRecomputeDataQualitySnapshot}
        onResolveSourceDeletedFindings={handleResolveSourceDeletedFindings}
      />
      <V14231PageReadinessBoundary pageKey="Dashboard 项目总览" />

      {constructionOrganizationScenario ? (
        <section data-testid="dashboard-construction-organization-scenario">
          <ConstructionOrganizationScenarioSummary
            scenario={constructionOrganizationScenario}
            activeUseCase={constructionOrganizationUseCase}
          />
        </section>
      ) : null}

      <DashboardDecisionOverview
        summaryData={summaryData}
        currentProject={currentProject}
        summaryLoading={summaryLoading}
      />

      <DashboardHealthWeaknessPanel
        projectId={projectId}
        healthDetails={healthDetails}
        healthDetailsStatus={healthDetailsStatus}
      />

      <DashboardActionPanel summaryData={summaryData} projectId={projectId} />

      {summaryError ? (
        <Alert variant="destructive">
          <AlertDescription>{summaryError}</AlertDescription>
        </Alert>
      ) : null}

      <Separator className="border-slate-100" />

      <section data-testid="dashboard-snapshot-panel">
        <Tabs value={activeSupportTab ?? ''} onValueChange={(value) => setActiveSupportTab(value as DashboardSupportTab)}>
          <TabsList className="h-auto w-full justify-start gap-5 rounded-none border-b border-slate-100 bg-transparent p-0 text-slate-500">
            <TabsTrigger value="forecast" onClick={() => setActiveSupportTab('forecast')} className="relative rounded-none bg-transparent px-0 py-2.5 text-xs font-medium text-slate-500 shadow-none after:absolute after:inset-x-0 after:-bottom-px after:h-[2px] after:rounded-full after:bg-transparent hover:text-slate-700 data-[state=active]:bg-transparent data-[state=active]:text-slate-800 data-[state=active]:shadow-none data-[state=active]:after:bg-blue-600">
              预测详情
            </TabsTrigger>
            <TabsTrigger value="trend" onClick={() => setActiveSupportTab('trend')} className="relative rounded-none bg-transparent px-0 py-2.5 text-xs font-medium text-slate-500 shadow-none after:absolute after:inset-x-0 after:-bottom-px after:h-[2px] after:rounded-full after:bg-transparent hover:text-slate-700 data-[state=active]:bg-transparent data-[state=active]:text-slate-800 data-[state=active]:shadow-none data-[state=active]:after:bg-blue-600">
              趋势与周报
            </TabsTrigger>
            <TabsTrigger value="execution" onClick={() => setActiveSupportTab('execution')} className="relative rounded-none bg-transparent px-0 py-2.5 text-xs font-medium text-slate-500 shadow-none after:absolute after:inset-x-0 after:-bottom-px after:h-[2px] after:rounded-full after:bg-transparent hover:text-slate-700 data-[state=active]:bg-transparent data-[state=active]:text-slate-800 data-[state=active]:shadow-none data-[state=active]:after:bg-blue-600">
              执行明细
            </TabsTrigger>
          </TabsList>

          <div className={activeSupportTab === null ? 'min-h-0' : 'min-h-[25rem]'}>
            <TabsContent value="forecast" className="pt-5">
              {activeSupportTab === 'forecast' ? (
                <ProjectRemainingForecastCard
                  projectId={projectId}
                  targetEndDate={summaryData?.plannedEndDate ?? currentProject.planned_end_date ?? currentProject.end_date ?? null}
                  testId="dashboard-project-remaining-forecast"
                  title="预测依据"
                  onOpenAcceleration={() => {
                    window.location.href = `/projects/${projectId}/gantt`
                  }}
                />
              ) : null}
            </TabsContent>

            <TabsContent value="trend" className="pt-5">
              {activeSupportTab === 'trend' ? (
                <div className="surface-card p-5">
                  <div className="grid grid-cols-12 gap-5 border-b border-slate-100 pb-5">
                    <div className="col-span-12 h-full xl:col-span-8">
                      <DashboardMonthlyTrend projectId={currentProject.id ?? ''} embedded />
                    </div>
                    <div className="col-span-12 h-full xl:col-span-4">
                      <WeeklyDigestPanel
                        projectId={currentProject.id ?? ''}
                        embedded
                      />
                    </div>
                  </div>
                  <div className="pt-5">
                    <DashboardCompareCard projectId={projectId} embedded />
                  </div>
                </div>
              ) : null}
            </TabsContent>

            <TabsContent value="execution" className="pt-5">
              {activeSupportTab === 'execution' ? (
                <div className="space-y-5">
                  <section data-testid="dashboard-attention-panel" className="grid grid-cols-1 gap-5 xl:grid-cols-12">
                    <div className="xl:col-span-8">
                      <RecentTasksCard projectId={projectId} />
                    </div>
                    <div className="space-y-5 xl:col-span-4">
                      <TodayProgressListPanel
                        loading={todayProgressLoading}
                        items={todayProgressItems}
                        error={todayProgressError}
                      />
                    </div>
                  </section>
                  <div className="surface-card p-5">
                    <DashboardHealthCards
                      summary={summaryData}
                      projectId={projectId}
                      healthDetails={healthDetails}
                      healthDetailsStatus={healthDetailsStatus}
                      embedded
                    />
                  </div>
                </div>
              ) : null}
            </TabsContent>
          </div>
        </Tabs>
      </section>

    </div>
  )
}
