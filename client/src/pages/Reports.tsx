import { Fragment, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  ArrowLeft,
  BarChart3,
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
import { EmptyState } from '@/components/EmptyState'
import { V14231PageReadinessBoundary } from '@/components/governance/V14231PageReadinessBoundary'
import { PageHeader } from '@/components/PageHeader'
import { DurationBasisBadge } from '@/components/planning/DurationBasisBadge'
import { Sparkline } from '@/components/Sparkline'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { CardHead } from '@/components/ui/card-head'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { LoadingState } from '@/components/ui/loading-state'
import { MetricCard as SharedMetricCard } from '@/components/ui/metric-card'
import { Separator } from '@/components/ui/separator'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ChartTooltip, chartTooltipCursor } from '@/components/ui/chart-tooltip'
import { toast } from '@/hooks/use-toast'
import { apiGet, getApiErrorMessage, getAuthHeaders } from '@/lib/apiClient'
import { CHART_AXIS_COLORS, CHART_SERIES } from '@/lib/chartPalette'
import {
  formatDate as formatDisplayDate,
  formatDateTime as formatDisplayDateTime,
  formatWholePercent,
} from '@/lib/formatters'
import {
  selectProjectScopeOrEmpty,
  useCurrentProject,
  useStore,
} from '@/hooks/useStore'
import type { EngineeringObject, Risk, Task, TaskCondition, TaskObstacle } from '@/lib/supabase'
import { DashboardApiService, type CriticalPathSummaryModel, type ProjectSummary } from '@/services/dashboardApi'
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
import { SCurveChart } from './Reports/components/SCurveChart'
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts'

function ReportSectionHead({ eyebrow, title, action }: { eyebrow: string; title: string; action?: ReactNode }) {
  return (
    <CardContent padding="md" className="pb-0">
      <CardHead eyebrow={eyebrow} title={title} action={action} />
    </CardContent>
  )
}

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

// v1.4.14: audit trail view is no longer part of ordinary Reports.
type AnalysisView = 'progress' | 'progress_deviation' | 'risk'

type DetailStat = {
  label: string
  value: string | number
  hint: string
  to?: string
  testId?: string
}

type ReportMetricKey = string

type ReportTimeRange = 'all' | '7d' | '30d' | '90d'
type EngineeringObjectReportDimensionKey =
  | 'phase'
  | 'section'
  | 'building'
  | 'basement'
  | 'floor'
  | 'physical_zone'
  | 'functional_area'
type ReportDimensionKey = 'none' | EngineeringObjectReportDimensionKey
type ReportGranularity = 'day' | 'week' | 'month'

type EngineeringObjectReportSection = {
  key: EngineeringObjectReportDimensionKey
  label: string
  description?: string
  options: string[]
  selected: string[]
}

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

const REPORT_SCOPE_META: Record<EngineeringObjectReportDimensionKey, { label: string; description: string }> = {
  phase: { label: '分期', description: '项目分期 / 阶段性范围' },
  section: { label: '标段', description: '合同标段 / 施工段' },
  building: { label: '单体', description: '单体 / 楼栋' },
  basement: { label: '地下室', description: '地下室 / 地下车库 / 共用地下空间' },
  floor: { label: '楼层', description: '楼层 / 标高层' },
  physical_zone: { label: '工程区域', description: '屋面、外立面、室外、地下局部等实体区域' },
  functional_area: { label: '功能区', description: '手术部、ICU、设备机房等功能触发区' },
}

const REPORT_SCOPE_KEYS = Object.keys(REPORT_SCOPE_META) as EngineeringObjectReportDimensionKey[]

function buildScopeSectionsFromEngineeringObjects(objects: EngineeringObject[]): EngineeringObjectReportSection[] {
  return REPORT_SCOPE_KEYS.map((key) => {
    const options = objects
      .filter((object) => object.objectType === key && object.status !== 'inactive')
      .map((object) => String(object.objectName ?? '').trim())
      .filter(Boolean)
      .sort((left, right) => left.localeCompare(right, 'zh-CN'))
    const meta = REPORT_SCOPE_META[key]
    return {
      key,
      label: meta.label,
      description: meta.description,
      options,
      selected: options,
    }
  }).filter((section) => section.options.length > 0)
}

type ReportMetricOption = {
  value: ReportMetricKey
  label: string
  description: string
}

type MetricRegistryOptionResponse = {
  key: string
  label: string
  description: string
  frontendVisible?: boolean
}

type SCurveApiPoint = {
  date: string
  planned_cumulative: number
  actual_cumulative: number | null
}

type ProgressDeviationMainlineKey = 'baseline' | 'monthly_plan' | 'execution'

type ProgressDeviationCauseChainItem = {
  cause_type: string
  affected_task_id?: string | null
  upstream_task_id?: string | null
  impacted_owner?: string | null
  accountable_owner?: string | null
  responsibility_basis?: string | null
  evidence_source?: string | null
  evidence_id?: string | null
  impact_days?: number | null
  wait_days?: number | null
  confidence?: number | string | null
  evidence?: (Record<string, unknown> & { wait_days?: number | string | null }) | null
}

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
  merged_into?: { title: string; group_id?: string | null; item_ids?: string[] } | null
  child_group?: { parent_title: string; child_count: number; group_id?: string | null } | null
  attribution?: {
    cause_chain?: ProgressDeviationCauseChainItem[]
  } | null
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
  owner_id?: string | null
  count: number
  percentage: number
  task_ids: string[]
  causal_task_ids?: string[]
  basis?: string | null
  confidence?: number | null
  impact_days?: number | null
  weighted_count?: number | null
  weighted_percentage?: number | null
  evidence_sources?: string[]
  responsibility_role?: 'accountable_subject' | 'execution_owner' | 'impacted_subject' | string | null
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
  source_entity_type?: string | null
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
    <Button variant="ghost"
      data-testid={testId}
      onClick={onClick}
      className="group flex h-full flex-col rounded-2xl border border-slate-100 bg-white p-5 text-left shadow-[var(--el-1)] transition-all hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-[var(--el-2)]"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-3">
          <div className="inline-flex rounded-xl bg-blue-50 p-2 text-blue-600">{icon}</div>
          <div>
            <div className="text-xs font-medium uppercase tracking-wider text-slate-500">{moduleLabel}</div>
            <div className="text-base font-semibold text-slate-900">{title}</div>
          </div>
        </div>
      </div>
      <div className="mt-5 inline-flex items-center gap-2 text-sm font-medium text-blue-600 transition-colors group-hover:text-blue-700">
        {actionLabel}
        <span aria-hidden="true">→</span>
      </div>
    </Button>
  )
}

function formatDateLabel(value?: string | null) {
  return formatDisplayDate(value, '未设置')
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
      return '待编辑'
    case 'pending':
      return '待处理'
    default:
      return status
  }
}

function formatDateTimeLabel(value?: string | null) {
  return formatDisplayDateTime(value, '未设置')
}

function relationSummaryLabel(row: ProgressDeviationRow) {
  if (row.merged_into?.title) return `\u5df2\u5408\u5e76\u5230 ${row.merged_into.title}`
  if (row.child_group?.parent_title) return `\u5b50\u9879\u7ec4 ${row.child_group.parent_title} \u00b7 ${row.child_group.child_count}`
  return '\u5f53\u524d\u6267\u884c\u6761\u76ee'
}

function getResponsibilityRoleLabel(role?: string | null) {
  switch (role) {
    case 'accountable_subject':
      return '致因责任主体'
    case 'execution_owner':
      return '执行承办主体'
    case 'impacted_subject':
      return '受影响主体'
    default:
      return role || '责任主体'
  }
}

function getResponsibilityBasisLabel(basis?: string | null) {
  switch (basis) {
    case 'upstream_dependency':
      return '上游依赖'
    case 'blocking_condition':
      return '开工条件'
    case 'active_obstacle':
      return '活跃阻碍'
    case 'obstacle_owner':
      return '阻碍责任'
    case 'condition_owner':
      return '条件责任'
    case 'external_wait':
      return '外部等待'
    case 'site_capacity':
      return '现场产能'
    case 'workflow':
    case 'workflow_sequence':
      return '流程衔接'
    default:
      return basis || '未标注依据'
  }
}

function getCauseTypeLabel(causeType?: string | null) {
  switch (causeType) {
    case 'dependency_wait':
      return '上游依赖等待'
    case 'blocking_condition':
      return '开工条件未满足'
    case 'active_obstacle':
      return '阻碍未解除'
    default:
      return causeType || '未标注原因'
  }
}

function formatEvidenceConfidence(value?: number | string | null) {
  if (typeof value === 'string') {
    switch (value.trim().toLowerCase()) {
      case 'high':
        return '高'
      case 'medium':
        return '中'
      case 'low':
        return '低'
      default:
        return value.trim() || null
    }
  }

  if (!Number.isFinite(value ?? NaN)) return null
  const normalized = Math.abs(value ?? 0) <= 1 ? (value ?? 0) * 100 : value ?? 0
  return formatWholePercent(normalized)
}

function getCauseImpactDays(item: ProgressDeviationCauseChainItem) {
  const candidates = [item.impact_days, item.wait_days, item.evidence?.wait_days]
  for (const candidate of candidates) {
    const value = Number(candidate)
    if (Number.isFinite(value) && value > 0) return Math.round(value * 10) / 10
  }
  return null
}

function formatEvidenceIds(ids?: string[]) {
  const normalized = (ids ?? []).map((id) => String(id || '').trim()).filter(Boolean)
  if (normalized.length === 0) return null
  const visible = normalized.slice(0, 3).join('、')
  return normalized.length > 3 ? `${visible} 等 ${normalized.length} 项` : visible
}

function getCurrentMonthKey() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

function isCurrentMonth(value?: string | null) {
  if (!value) return false
  return String(value).slice(0, 7) === getCurrentMonthKey()
}

function isActiveRisk(risk: Risk) {
  const status = String(risk.status || '').trim().toLowerCase()
  return !['closed', 'resolved', 'archived', '已关闭', '已解决'].includes(status)
}

function getRiskLevelLabel(level?: string | null) {
  switch (String(level || '').trim().toLowerCase()) {
    case 'critical':
    case '严重':
      return '严重'
    case 'high':
    case '高':
      return '高'
    case 'medium':
    case '中':
      return '中'
    case 'low':
    case '低':
      return '低'
    default:
      return '未分级'
  }
}

function getRiskLevelRank(level?: string | null) {
  switch (getRiskLevelLabel(level)) {
    case '严重':
      return 4
    case '高':
      return 3
    case '中':
      return 2
    case '低':
      return 1
    default:
      return 0
  }
}

function getRiskLevelTone(level?: string | null) {
  switch (getRiskLevelLabel(level)) {
    case '严重':
    case '高':
      return {
        bar: 'bg-red-500',
        badge: 'border-red-200 bg-red-50 text-red-700',
      }
    case '中':
      return {
        bar: 'bg-amber-500',
        badge: 'border-amber-200 bg-amber-50 text-amber-700',
      }
    default:
      return {
        bar: 'bg-emerald-500',
        badge: 'border-emerald-200 bg-emerald-50 text-emerald-700',
      }
  }
}

function toRiskMatrixBucket(value?: number | null, fallback = 3) {
  if (!Number.isFinite(value ?? Number.NaN)) return fallback
  return Math.max(1, Math.min(5, Math.ceil(Number(value) / 20)))
}

function getRiskMatrixCellClass(count: number, impact: number, probability: number) {
  if (count === 0) return 'border-slate-100 bg-slate-50 text-slate-500'
  const score = impact * probability
  if (score >= 16) return 'border-red-200 bg-red-50 text-red-700'
  if (score >= 9) return 'border-amber-200 bg-amber-50 text-amber-700'
  return 'border-emerald-200 bg-emerald-50 text-emerald-700'
}

function getTaskDisplayName(task: Task) {
  return task.title || '未命名任务'
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

function readBackendDelayDays(task: Task): number {
  const rawDelayDays = (task as Task & { delayDays?: number | string | null }).delay_days
    ?? (task as Task & { delayDays?: number | string | null }).delayDays
  const parsedDelayDays = Number(rawDelayDays)
  if (Number.isFinite(parsedDelayDays) && parsedDelayDays > 0) {
    return Math.ceil(parsedDelayDays)
  }

  const dueStatus = task.dueStatus ?? task.statusDerivation?.dueStatus ?? null
  const daysUntilDue = Number(dueStatus?.daysUntilDue)
  if (Number.isFinite(daysUntilDue) && daysUntilDue < 0) {
    return Math.ceil(Math.abs(daysUntilDue))
  }

  return 0
}

function isDelayedTask(task: Task) {
  if (isCompletedTask(task)) return false
  const dueStatus = task.dueStatus ?? task.statusDerivation?.dueStatus ?? null
  const statusText = String(task.status || task.displayStatus || '').trim().toLowerCase()
  return readBackendDelayDays(task) > 0
    || dueStatus?.status === 'overdue'
    || statusText === 'delayed'
}

function summarizeRiskSource(risk: Risk) {
  return risk.risk_source || risk.risk_category || '未分类'
}

function getIssueSourceLabel(sourceType?: string | null, sourceEntityType?: string | null) {
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
      if (sourceEntityType === 'acceptance_plan') {
        return '验收逾期'
      }
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
  return String(raw?.participant_unit_name || raw?.assignee_name || raw?.assignee || '未指定责任主体')
}

type ReportEngineeringObjectRef = {
  objectName?: string | null
  objectType?: string | null
}

type ReportEngineeringObjectLookup = Map<string, ReportEngineeringObjectRef>

function readTaskText(raw: Record<string, unknown> | null | undefined, keys: string[]) {
  for (const key of keys) {
    const value = raw?.[key]
    if (value === undefined || value === null) continue
    const text = String(value).trim()
    if (text) return text
  }
  return ''
}

function getTaskScopeObjectLabel(
  task: Task | null | undefined,
  objectLookup: ReportEngineeringObjectLookup | undefined,
  objectIdKeys: string[],
  fallbackKeys: string[],
  expectedType?: string,
) {
  const raw = task as Record<string, unknown> | null | undefined
  for (const key of objectIdKeys) {
    const objectId = readTaskText(raw, [key])
    if (!objectId) continue
    const object = objectLookup?.get(objectId)
    if (object && (!expectedType || object.objectType === expectedType)) {
      const objectName = String(object.objectName ?? '').trim()
      if (objectName) return objectName
    }
  }

  return readTaskText(raw, fallbackKeys) || '未设置'
}

function getTaskBuildingLabel(task?: Task | null, objectLookup?: ReportEngineeringObjectLookup) {
  return getTaskScopeObjectLabel(
    task,
    objectLookup,
    ['building_object_id', 'buildingObjectId'],
    ['building_name', 'buildingName', 'building_id', 'buildingId', 'building_type', 'buildingType'],
    'building',
  )
}

function getTaskSectionLabel(task?: Task | null, objectLookup?: ReportEngineeringObjectLookup) {
  return getTaskScopeObjectLabel(
    task,
    objectLookup,
    ['section_object_id', 'sectionObjectId'],
    ['section_name', 'sectionName', 'section_id', 'sectionId', 'section_object_code', 'sectionObjectCode', 'wbs_code'],
    'section',
  )
}

function getTaskSpecialtyLabel(task?: Task | null, objectLookup?: ReportEngineeringObjectLookup) {
  return getTaskScopeObjectLabel(
    task,
    objectLookup,
    [],
    ['professional_name', 'professionalName', 'specialty_name', 'specialtyName', 'specialty_type', 'specialtyType'],
  )
}

function normalizeAnalysisView(value: string | null): AnalysisView {
  if (value === 'baseline' || value === 'monthly' || value === 'execution') {
    return 'progress_deviation'
  }

  if (value === 'progress' || value === 'progress_deviation' || value === 'risk') {
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
          // eslint-disable-next-line -- frontend-bi-aggregation-approved
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

const DEFAULT_REPORT_METRIC_OPTIONS: ReportMetricOption[] = [
  { value: 'overall_progress', label: '总体进度', description: '项目整体加权进度' },
  { value: 'health_score', label: '业务健康分', description: '项目业务健康评分' },
  { value: 'delay_days', label: '延期生产日', description: '累计延期施工生产日' },
  { value: 'schedule_deviation_days', label: '偏差生产日', description: '实际完成相对计划完成的签名施工生产日偏差' },
  { value: 'active_risk_count', label: '活跃风险数', description: '当前活跃风险数量' },
  { value: 'active_obstacle_count', label: '阻碍数', description: '当前活跃阻碍数量' },
  { value: 'active_delayed_tasks', label: '延期任务数', description: '自动识别的活跃延期任务数量' },
]

function normalizeMetricRegistryOptions(payload: MetricRegistryOptionResponse[] | null | undefined): ReportMetricOption[] {
  const rows = Array.isArray(payload) ? payload : []
  const options = rows
    .filter((item) => item.frontendVisible !== false)
    .map((item) => ({
      value: String(item.key ?? '').trim(),
      label: String(item.label ?? item.key ?? '').trim(),
      description: String(item.description ?? '').trim(),
    }))
    .filter((item) => item.value && item.label)

  return options.length > 0 ? options : DEFAULT_REPORT_METRIC_OPTIONS
}

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
  useEffect(() => {
    document.title = '分析报表 | WorkBuddy'
  }, [])

  const navigate = useNavigate()
  const { id: routeProjectId } = useParams()
  const [searchParams] = useSearchParams()
  const currentProject = useCurrentProject()
  const [summaryData, setSummaryData] = useState<ProjectSummary | null>(null)
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
  const [issueSummaryData, setIssueSummaryData] = useState<IssueSummaryResponse | null>(null)
  const [issueSummaryLoading, setIssueSummaryLoading] = useState(false)
  const [sCurvePoints, setSCurvePoints] = useState<SCurveApiPoint[]>([])
  const [sCurveLoading, setSCurveLoading] = useState(false)
  const [sCurveError, setSCurveError] = useState<string | null>(null)
  const [riskLevelFilter, setRiskLevelFilter] = useState('all')
  const [riskStatusFilter, setRiskStatusFilter] = useState('active')

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

  const loadSCurve = useCallback(async (signal?: AbortSignal) => {
    if (!projectId) {
      setSCurvePoints([])
      setSCurveError(null)
      return
    }

    setSCurveLoading(true)
    setSCurveError(null)
    try {
      const response = await apiGet<SCurveApiPoint[]>(`/api/projects/${encodeURIComponent(projectId)}/reports/s-curve`, { signal })
      if (!signal?.aborted) {
        setSCurvePoints(Array.isArray(response) ? response : [])
      }
    } catch (err) {
      if (signal?.aborted) return
      console.error('[Reports] Failed to load S-Curve', err)
      setSCurvePoints([])
      setSCurveError(getApiErrorMessage(err, 'S 曲线数据加载失败，已使用本地任务进度兜底'))
    } finally {
      setSCurveLoading(false)
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
    void loadMaterialSummary(c.signal)
    return () => { c.abort() }
  }, [loadMaterialSummary])

  useEffect(() => {
    const c = new AbortController()
    void loadSCurve(c.signal)
    return () => { c.abort() }
  }, [loadSCurve])

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
  const engineeringObjects = useStore((state) => state.engineeringObjects)
  const fetchEngineeringObjects = useStore((state) => state.fetchEngineeringObjects)
  const [metricOptions, setMetricOptions] = useState<ReportMetricOption[]>(DEFAULT_REPORT_METRIC_OPTIONS)
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
  const activeProjectRisks = useMemo(() => projectRisks.filter(isActiveRisk), [projectRisks])
  const activeRiskCount = summary?.activeRiskCount ?? activeProjectRisks.length
  const monthNewTaskCount = useMemo(
    () => projectTasks.filter((task) => isCurrentMonth(task.created_at)).length,
    [projectTasks],
  )
  const riskTrendData = useMemo(() => {
    const points = issueSummary.trend.slice(-7).map((point) => ({ value: point.activeIssues }))
    if (points.length > 0) return points
    return Array.from({ length: 7 }, (_, index) => ({
      value: index === 6 ? activeRiskCount : Math.max(0, activeRiskCount - (6 - index)),
    }))
  }, [activeRiskCount, issueSummary.trend])
  const riskMatrixCells = useMemo(() => {
    const matrix = Array.from({ length: 5 }, (_, impactIndex) =>
      Array.from({ length: 5 }, (_, probabilityIndex) => ({
        impact: 5 - impactIndex,
        probability: probabilityIndex + 1,
        count: 0,
      })),
    )

    for (const risk of activeProjectRisks) {
      const probability = toRiskMatrixBucket(risk.probability, getRiskLevelRank(risk.level) || 3)
      const impact = toRiskMatrixBucket(risk.impact, getRiskLevelRank(risk.level) || 3)
      matrix[5 - impact][probability - 1].count += 1
    }

    return matrix
  }, [activeProjectRisks])
  // eslint-disable-next-line -- frontend-bi-aggregation-approved; display-only local filter chips for already-loaded risk rows
  const riskLevelChips = useMemo(
    () => [
      { key: 'all', label: '全部', count: projectRisks.length },
      { key: 'critical', label: '严重', count: projectRisks.filter((risk) => getRiskLevelLabel(risk.level) === '严重').length },
      { key: 'high', label: '高', count: projectRisks.filter((risk) => getRiskLevelLabel(risk.level) === '高').length },
      { key: 'medium', label: '中', count: projectRisks.filter((risk) => getRiskLevelLabel(risk.level) === '中').length },
      { key: 'low', label: '低', count: projectRisks.filter((risk) => getRiskLevelLabel(risk.level) === '低').length },
    ],
    [projectRisks],
  )
  const riskStatusChips = useMemo(
    () => [
      { key: 'active', label: '活跃', count: activeProjectRisks.length },
      { key: 'all', label: '全部状态', count: projectRisks.length },
      { key: 'closed', label: '已关闭', count: projectRisks.length - activeProjectRisks.length },
    ],
    [activeProjectRisks.length, projectRisks.length],
  )
  const filteredRiskRows = useMemo(
    () =>
      [...projectRisks]
        .filter((risk) => {
          if (riskStatusFilter === 'active' && !isActiveRisk(risk)) return false
          if (riskStatusFilter === 'closed' && isActiveRisk(risk)) return false
          if (riskLevelFilter !== 'all' && getRiskLevelLabel(risk.level) !== getRiskLevelLabel(riskLevelFilter)) return false
          return true
        })
        .sort((left, right) => {
          const levelDelta = getRiskLevelRank(right.level) - getRiskLevelRank(left.level)
          if (levelDelta !== 0) return levelDelta
          return new Date(right.created_at || 0).getTime() - new Date(left.created_at || 0).getTime()
        }),
    [projectRisks, riskLevelFilter, riskStatusFilter],
  )
  const visibleRiskRows = filteredRiskRows.slice(0, 5)
  useEffect(() => {
    const controller = new AbortController()
    void (async () => {
      try {
        const payload = await apiGet<MetricRegistryOptionResponse[]>('/api/metrics/registry', {
          signal: controller.signal,
        })
        if (controller.signal.aborted) return
        const nextOptions = normalizeMetricRegistryOptions(payload)
        setMetricOptions(nextOptions)
        setTrendMetric((current) => (
          nextOptions.some((option) => option.value === current)
            ? current
            : nextOptions[0]?.value ?? 'overall_progress'
        ))
      } catch (err) {
        if (controller.signal.aborted) return
        console.error('[Reports] Failed to load metric registry', err)
        setMetricOptions(DEFAULT_REPORT_METRIC_OPTIONS)
      }
    })()

    return () => {
      controller.abort()
    }
  }, [])

  useEffect(() => {
    if (!projectId) return
    void fetchEngineeringObjects(projectId).catch((err) => {
      console.error('[Reports] Failed to load engineering objects', err)
    })
  }, [fetchEngineeringObjects, projectId])

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
        const data = await apiGet<ReportTrendResponse>(`/api/projects/${encodeURIComponent(projectId)}/metrics/trend?${query.toString()}`, {
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
        const delayDays = readBackendDelayDays(task)
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
        to: `/projects/${projectId}/reports?view=progress_deviation`,
      },
      {
        view: 'risk',
        title: '风险与问题分析',
        description: '查看风险、问题与阻碍的综合分析。',
        moduleLabel: '风险与问题',
        actionLabel: '进入风险分析',
        icon: ShieldAlert,
        to: `/projects/${projectId}/reports?view=risk`,
      },
    ],
    [projectId],
  )

  const activeEntry = analysisEntries.find((entry) => entry.view === activeView)

  const deviationViewLabel = viewLabels[deviationView]
  const moduleChips = useMemo(
    () => [
      { key: 'progress' as const, label: '进度总览', badge: null as number | null, color: 'blue' },
      { key: 'progress_deviation' as const, label: '进度偏差', badge: deviationData?.summary.deviated_items ?? 0, color: 'amber' },
      { key: 'risk' as const, label: `风险(${activeRiskCount} 活跃)`, badge: activeRiskCount, color: 'red' },
    ],
    [activeRiskCount, deviationData?.summary.deviated_items],
  )

  const viewConfig = useMemo(() => {
    if (activeView === 'progress') {
      return {
        eyebrow: '里程碑分析',
        title: '项目进度总览分析',
        subtitle: '从里程碑、专项准备和关键路径三个维度查看项目推进态势。',
        backLabel: '返回里程碑',
        backTo: projectId ? `/projects/${projectId}/milestones` : undefined,
        metrics: [
          { title: '总任务数', value: summary?.totalTasks ?? projectTasks.length, hint: `叶子任务 ${summary?.leafTaskCount ?? projectTasks.length}`, icon: <ClipboardList className="h-4 w-4" /> },
          {
            title: '完成率',
            value: formatWholePercent(summary?.overallProgress ?? 0),
            hint: `里程碑完成率 ${formatWholePercent(summary?.milestoneProgress ?? 0)}`,
            icon: <BarChart3 className="h-4 w-4" />,
          },
          { title: '本月新增', value: monthNewTaskCount, hint: `本月新增任务 · ${getCurrentMonthKey()}`, icon: <Flag className="h-4 w-4" /> },
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
          { title: '活跃风险', value: activeRiskCount, hint: `总风险 ${summary?.riskCount ?? projectRisks.length}`, icon: <Sparkline data={riskTrendData} color={CHART_SERIES.danger} /> },
          { title: '未关闭问题', value: issueSummary.active_issues || activeProjectIssues.length, hint: `问题总数 ${issueSummary.total_issues || projectIssues.length}`, icon: <Sparkline data={riskTrendData} color={CHART_SERIES.warning} /> },
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
        { title: '总任务数', value: summary?.totalTasks ?? projectTasks.length, hint: `叶子任务 ${summary?.leafTaskCount ?? projectTasks.length}`, icon: <ClipboardList className="h-4 w-4" /> },
        {
          title: '完成率',
          value: formatWholePercent(summary?.overallProgress ?? 0),
          hint: `里程碑完成率 ${formatWholePercent(summary?.milestoneProgress ?? 0)}`,
          icon: <BarChart3 className="h-4 w-4" />,
        },
        { title: '本月新增', value: monthNewTaskCount, hint: `本月新增任务 · ${getCurrentMonthKey()}`, icon: <Flag className="h-4 w-4" /> },
      ] as MetricItem[],
    }

  }, [activeProjectIssues.length, activeRiskCount, activeView, deviationData, deviationViewLabel, issueSummary.active_issues, issueSummary.total_issues, monthNewTaskCount, projectId, projectIssues.length, projectRisks.length, projectTasks.length, riskTrendData, summary])

  const currentMetrics = viewConfig.metrics
  const metricGridClass = activeView === 'progress'
    ? 'grid gap-4 md:grid-cols-2 xl:grid-cols-3'
    : activeView === 'risk'
      ? 'grid gap-4 md:grid-cols-2'
      : 'grid gap-5 md:grid-cols-2 xl:grid-cols-4'
  const reportEngineeringObjects = useMemo(
    () => engineeringObjects.filter((object) => !projectId || object.projectId === projectId),
    [engineeringObjects, projectId],
  )
  const reportScopeSections = useMemo(() => {
    return buildScopeSectionsFromEngineeringObjects(reportEngineeringObjects)
  }, [reportEngineeringObjects])
  const engineeringObjectLookup = useMemo<ReportEngineeringObjectLookup>(
    () => new Map(reportEngineeringObjects.map((object) => [
      object.id,
      { objectName: object.objectName, objectType: object.objectType },
    ])),
    [reportEngineeringObjects],
  )
  const engineeringObjectLabelsByType = useMemo(() => {
    const labels: Record<'building' | 'section' | 'specialty', string[]> = {
      building: [],
      section: [],
      specialty: [],
    }
    for (const object of reportEngineeringObjects) {
      if (object.status !== 'active') continue
      const label = String(object.objectName ?? '').trim()
      if (!label) continue
      if (object.objectType === 'building') labels.building.push(label)
      if (object.objectType === 'section') labels.section.push(label)
    }
    for (const task of projectTasks) {
      const label = getTaskSpecialtyLabel(task, engineeringObjectLookup)
      if (label) labels.specialty.push(label)
    }
    return labels
  }, [engineeringObjectLookup, projectTasks, reportEngineeringObjects])
  const selectedTrendMetric = metricOptions.find((option) => option.value === trendMetric) ?? metricOptions[0] ?? DEFAULT_REPORT_METRIC_OPTIONS[0]
  const selectedTrendRange = REPORT_TIME_RANGE_OPTIONS.find((option) => option.value === trendTimeRange) ?? REPORT_TIME_RANGE_OPTIONS[1]
  const selectedTrendDimension = reportScopeSections.find((section) => section.key === trendDimension) ?? null
  const trendPoints = trendData?.points ?? []
  const showReportModules = Boolean(projectId)

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
  // progress-deviation-ssot: this surface displays backend ProgressDeviationAnalysisResponse fields
  // (`planned_progress`, `actual_progress`, `deviation_days`, `deviation_rate`) and must not
  // recompute delay/progress deviation from task dates or raw task progress.
  const deviationRowMeta = useMemo(
    () =>
      deviationRows.map((row) => {
        const task = row.source_task_id ? deviationTaskLookup.get(row.source_task_id) ?? null : null
        return {
          row,
          task,
          buildingLabel: getTaskBuildingLabel(task, engineeringObjectLookup),
          sectionLabel: getTaskSectionLabel(task, engineeringObjectLookup),
          specialtyLabel: getTaskSpecialtyLabel(task, engineeringObjectLookup),
          levelLabel: getDeviationStatusLabel(row.status),
          actualDateKey: row.actual_date ? row.actual_date.slice(0, 10) : '',
        }
      }),
    [deviationRows, deviationTaskLookup, engineeringObjectLookup],
  )
  const deviationFilterOptions = useMemo(() => {
    const uniqueValues = (items: string[]) => [...new Set(items.map((value) => String(value || '').trim()).filter((value) => value && value !== '未设置'))].sort((left, right) => left.localeCompare(right, 'zh-CN'))
    const taskScopeOptions = (section?: { selected?: string[]; options?: string[] }) => section?.selected?.length ? section.selected : section?.options ?? []
    const buildingScope = reportScopeSections.find((section) => section.key === 'building')

    return {
      buildings: uniqueValues([
        ...deviationRowMeta.map((item) => item.buildingLabel),
        ...engineeringObjectLabelsByType.building,
        ...taskScopeOptions(buildingScope),
      ]),
      sections: uniqueValues([
        ...deviationRowMeta.map((item) => item.sectionLabel),
        ...engineeringObjectLabelsByType.section,
      ]),
      specialties: uniqueValues([
        ...deviationRowMeta.map((item) => item.specialtyLabel),
        ...engineeringObjectLabelsByType.specialty,
      ]),
      levels: uniqueValues(deviationRowMeta.map((item) => String(item.row.status || '').trim())),
    }
  }, [deviationRowMeta, engineeringObjectLabelsByType, reportScopeSections])
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
        value: formatWholePercent(summary?.overallProgress ?? 0),
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
    eyebrow: '数据分析',
    title: '报表分析',
    subtitle: '',
    backLabel: viewConfig.backLabel,
    backTo: viewConfig.backTo,
  }

  const reportConclusionCards = useMemo(() => [
    {
      title: '当前主结论',
      value: formatWholePercent(summary?.overallProgress ?? 0),
      hint: '整体进度与里程碑完成率的综合口径',
    },
    {
      title: '风险压力',
      value: activeRiskCount + issueSummary.active_issues,
      hint: '活跃风险与未闭环问题合计',
    },
    {
      title: '交付阻塞',
      value: (summary?.activeObstacleCount ?? projectObstacles.length) + (summary?.pendingConditionCount ?? projectConditions.length),
      hint: '条件未满足与阻碍项合并观察',
    },
  ], [activeRiskCount, issueSummary.active_issues, projectConditions.length, projectObstacles.length, summary?.activeObstacleCount, summary?.overallProgress, summary?.pendingConditionCount])

  const handleRefreshReports = () => {
    void loadSummary()
    void loadCriticalPathSummary()
    void loadMaterialSummary()
    void loadSCurve()
    void loadDeviationAnalysis()
    // v1.4.14: audit trail loading removed from ordinary Reports.
    void loadIssueSummary()
  }

  const downloadReportFile = async (url: string, fallbackFileName: string) => {
    const response = await fetch(url, {
      method: 'GET',
      credentials: 'include',
      headers: getAuthHeaders(),
    })

    if (!response.ok) {
      const message = await response.text().catch(() => '')
      throw new Error(message || `导出失败 ${response.status}`)
    }

    const blob = await response.blob()
    const disposition = response.headers.get('content-disposition') || ''
    const encodedFileName = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1]
    const quotedFileName = disposition.match(/filename="([^"]+)"/i)?.[1]
    const fileName = encodedFileName
      ? decodeURIComponent(encodedFileName)
      : quotedFileName || fallbackFileName

    const objectUrl = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = objectUrl
    anchor.download = fileName
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    URL.revokeObjectURL(objectUrl)
    toast({ title: '导出已生成', description: fileName })
  }

  const handleExportCurrentView = async (format: 'xlsx' | 'pdf') => {
    if (!projectId) return
    try {
      const query = new URLSearchParams({
        format,
        view: activeView,
      })
      await downloadReportFile(
        `/api/projects/${encodeURIComponent(projectId)}/reports/export?${query.toString()}`,
        `${projectName}-${pageHeaderConfig.title}.${format}`,
      )
    } catch (err) {
      console.error('[Reports] Failed to export current view', err)
      toast({
        title: '导出失败',
        description: getApiErrorMessage(err, '请稍后重试。'),
        variant: 'destructive',
      })
    }
  }

  const handleExportOwnerMonthly = async (format: 'xlsx' | 'pdf') => {
    if (!projectId) return
    try {
      const query = new URLSearchParams({
        format,
        period: new Date().toISOString().slice(0, 7),
      })
      await downloadReportFile(
        `/api/projects/${encodeURIComponent(projectId)}/reports/owner-monthly?${query.toString()}`,
        `${projectName}-业主月报.${format}`,
      )
    } catch (err) {
      console.error('[Reports] Failed to export owner monthly report', err)
      toast({
        title: '业主月报导出失败',
        description: getApiErrorMessage(err, '请稍后重试。'),
        variant: 'destructive',
      })
    }
  }

  const openEntry = (entry: AnalysisEntry) => {
    if (!projectId) return
    navigate(entry.to)
  }

  const renderProgressDetail = () => (
    <>
      <div className="content-sidebar-grid">
        <div className="space-y-3">
          {sCurveLoading && sCurvePoints.length === 0 ? (
            <LoadingState
              label="S 曲线加载中"
              className="min-h-64 rounded-2xl empty-state-frame border-slate-200 bg-slate-50"
            />
          ) : (
            <SCurveChart points={sCurvePoints} tasks={projectTasks} />
          )}
          {sCurveError ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              {sCurveError}
            </div>
          ) : null}
        </div>

        <Card data-testid="reports-key-node-list" variant="surface">
          <ReportSectionHead eyebrow="REPORT" title="关键节点列表" />
          <CardContent className="space-y-3">
            {reportMilestoneCards.length === 0 ? (
              <div className="rounded-xl empty-state-frame border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                暂无关键节点
              </div>
            ) : (
              reportMilestoneCards.map((milestone) => {
                const completed = milestone.statusLabel.includes('完成') || milestone.progress >= 100
                const delayed = milestone.currentPlannedDate && !completed && new Date(milestone.currentPlannedDate).getTime() < Date.now()
                const dotClass = completed ? 'bg-emerald-500' : delayed ? 'bg-red-500' : 'bg-amber-500'

                return (
                  <div
                    key={milestone.id}
                    className="grid grid-cols-[5.75rem_minmax(0,1fr)_0.625rem] items-center gap-4 rounded-xl border border-slate-100 bg-white px-3 py-3 transition-colors even:bg-slate-50/50 hover:bg-slate-100/60"
                  >
                    <div className="text-xs text-slate-500 num-mono">{formatDateLabel(milestone.currentPlannedDate)}</div>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-slate-900">{milestone.name}</div>
                      <div className="mt-1 text-xs text-slate-500">进度 {formatWholePercent(milestone.progress)} · {milestone.statusLabel}</div>
                    </div>
                    <span className={`h-2 w-2 rounded-full ${dotClass}`} aria-hidden="true" />
                  </div>
                )
              })
            )}
          </CardContent>
        </Card>
      </div>
      <CriticalPathSummaryCard summary={criticalPathSummary} />
      <div className="content-sidebar-grid">
      <Card className="surface-card">
        <ReportSectionHead eyebrow="REPORT" title="工期偏差与执行判断" />
        <CardContent className="space-y-4">
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
            <DetailStatCard label="整体完成率" value={formatWholePercent(summary?.overallProgress ?? 0)} hint={`任务总数 ${summary?.totalTasks ?? 0}`} />
            <DetailStatCard label="里程碑完成率" value={formatWholePercent(summary?.milestoneProgress ?? 0)} hint={`${summary?.completedMilestones ?? 0}/${summary?.totalMilestones ?? 0}`} />
            <DetailStatCard label="延期任务" value={summary?.delayedTaskCount ?? delayedTasks.length} hint={`累计延期 ${summary?.delayDays ?? 0} 个生产日`} />
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

      <Card className="surface-card">
        <ReportSectionHead eyebrow="REPORT" title="里程碑窗口" />
        <CardContent className="space-y-3">
          {reportMilestoneCards.length === 0 ? (
            <div className="rounded-2xl empty-state-frame border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
            </div>
          ) : (
            reportMilestoneCards.map((milestone) => (
              <div key={milestone.id} className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-medium text-slate-900">{milestone.name}</div>
                  <div className="text-xs text-slate-500">{milestone.statusLabel}</div>
                </div>
                <div className="mt-3 grid gap-2 text-xs text-slate-500 sm:grid-cols-3" data-testid="reports-milestone-three-time">
                  <div className="rounded-lg bg-white px-2 py-1.5">
                    <div className="text-xs uppercase tracking-wide text-slate-500">计划</div>
                    <div className="mt-0.5 font-medium text-slate-700">{formatDateLabel(milestone.plannedDate)}</div>
                  </div>
                  <div className="rounded-lg bg-white px-2 py-1.5">
                    <div className="text-xs uppercase tracking-wide text-slate-500">当前</div>
                    <div className="mt-0.5 font-medium text-slate-700">{formatDateLabel(milestone.currentPlannedDate)}</div>
                  </div>
                  <div className="rounded-lg bg-white px-2 py-1.5">
                    <div className="text-xs uppercase tracking-wide text-slate-500">实际</div>
                    <div className="mt-0.5 font-medium text-slate-700">{formatDateLabel(milestone.actualDate)}</div>
                  </div>
                </div>
                <div className="mt-2 text-xs text-slate-500">
                  当前进度 {formatWholePercent(milestone.progress)} · 主对比 {formatDateLabel(milestone.currentPlannedDate)} / {formatDateLabel(milestone.actualDate)}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card className="surface-card">
        <ReportSectionHead eyebrow="REPORT" title="专项与关键路径概览" />
        <CardContent className="grid gap-5 sm:grid-cols-3">
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

      <Card className="surface-card xl:col-span-2">
        <ReportSectionHead eyebrow="REPORT" title="关键任务 / WBS 节点" />
        <CardContent className="space-y-3">
          {wbsFocusRows.length === 0 ? (
            <div className="rounded-2xl empty-state-frame border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
              暂无任务节点数据
            </div>
          ) : (
            wbsFocusRows.map((task) => (
              <div key={task.id} className="grid gap-5 rounded-2xl border border-slate-100 bg-white px-4 py-4 md:grid-cols-[minmax(0,1.2fr)_7.5rem_8.75rem_7.5rem]">
                <div>
                  <div className="text-sm font-medium text-slate-900">{getTaskDisplayName(task)}</div>
                  <div className="mt-1 text-xs text-slate-500">WBS {task.wbs_code || '未编码'} · {getTaskStatus(task)}</div>
                </div>
                <div className="text-sm text-slate-700">进度 {formatWholePercent(task.progress ?? 0)}</div>
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
        className="flex flex-wrap gap-2 rounded-2xl border border-slate-100 bg-white p-4 shadow-[var(--el-1)]"
      >
        {deviationChips.map((chip) => (
          <Button variant="ghost"
            key={chip.label}
            type="button"
            onClick={() => setDeviationFocus(chip.key)}
            className={`gap-2 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              deviationFocus === chip.key
                ? 'bg-slate-900 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <span>{chip.label}</span>
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-semibold num-mono ${
                deviationFocus === chip.key ? 'bg-white/20 text-white' : 'bg-white text-slate-600'
              }`}
            >
              {chip.value}
            </span>
          </Button>
        ))}
        <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
          当前聚焦 {getDeviationFocusLabel(deviationFocus)}
        </span>
      </div>

      <div className="grid gap-5 md:grid-cols-3">
        <SharedMetricCard
          eyebrow="BASELINE"
          title="基线偏差"
          value={deviationData?.summary.baseline_items ?? 0}
          hint="聚焦基线节点、对应关系状态与版本切换影响"
          icon={<Flag className="h-4 w-4" />}
        />
        <SharedMetricCard
          eyebrow="MONTHLY"
          title="月度兑现偏差"
          value={deviationData?.summary.monthly_plan_items ?? 0}
          hint="聚焦月度计划兑现、延期与月末待处理事项"
          icon={<ClipboardList className="h-4 w-4" />}
        />
        <SharedMetricCard
          eyebrow="EXEC"
          title="执行偏差"
          value={deviationData?.summary.execution_items ?? projectTasks.length}
          hint="聚焦任务推进、条件阻碍与执行节奏"
          icon={<BarChart3 className="h-4 w-4" />}
        />
      </div>

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        <DetailStatCard
          label="验收通过"
          value={`${summary?.passedAcceptancePlanCount ?? 0}/${summary?.acceptancePlanCount ?? 0}`}
          hint={`进行中 ${summary?.inProgressAcceptancePlanCount ?? 0} · 需补充 ${summary?.failedAcceptancePlanCount ?? 0}`}
          to={projectId ? `/projects/${projectId}/acceptance?status=passed&phase=all` : '/acceptance?status=passed&phase=all'}
          testId="reports-acceptance-summary-link"
        />
      </div>

      <Card data-testid="reports-deviation-lock-card" className="surface-card">
        <CardContent className="flex flex-wrap items-center justify-between gap-4 p-5">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-sm font-medium text-slate-900">
              <LockKeyhole className="h-4 w-4 text-slate-500" />
              <span>版本锁状态</span>
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
          <div className="grid gap-2 text-right text-xs text-slate-500 sm:min-w-56">
            <div>锁定时间：{formatDateTimeLabel(activeDeviationLock?.locked_at)}</div>
            <div>到期时间：{formatDateTimeLabel(activeDeviationLock?.lock_expires_at)}</div>
          </div>
        </CardContent>
      </Card>

      {deviationError ? (
        <Card className="surface-card">
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

          <Card data-testid="reports-deviation-filter-panel" className="surface-card">
            <ReportSectionHead eyebrow="REPORT" title="偏差筛选" />
            <CardContent className="grid gap-5 md:grid-cols-2 xl:grid-cols-5">
              <label className="space-y-1 text-xs text-slate-500">
                <span>时间范围</span>
                <Select
                  value={deviationTimeRange}
                  onValueChange={(value) => setDeviationTimeRange(value as 'all' | '7d' | '30d' | '90d')}
                >
                  <SelectTrigger className="h-10 rounded-xl border-slate-200 bg-white text-sm text-slate-700">
                    <SelectValue placeholder="全部时间" />
                  </SelectTrigger>
                  <SelectContent align="start" side="bottom">
                    <SelectItem value="all">全部时间</SelectItem>
                    <SelectItem value="7d">近 7 天</SelectItem>
                    <SelectItem value="30d">近 30 天</SelectItem>
                    <SelectItem value="90d">近 90 天</SelectItem>
                  </SelectContent>
                </Select>
              </label>
              <label className="space-y-1 text-xs text-slate-500">
                <span>楼栋</span>
                <Select value={deviationBuildingFilter} onValueChange={setDeviationBuildingFilter}>
                  <SelectTrigger className="h-10 rounded-xl border-slate-200 bg-white text-sm text-slate-700">
                    <SelectValue placeholder="全部楼栋" />
                  </SelectTrigger>
                  <SelectContent align="start" side="bottom">
                    <SelectItem value="all">全部楼栋</SelectItem>
                    {deviationFilterOptions.buildings.map((value) => (
                      <SelectItem key={value} value={value}>{value}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
              <label className="space-y-1 text-xs text-slate-500">
                <span>标段</span>
                <Select value={deviationSectionFilter} onValueChange={setDeviationSectionFilter}>
                  <SelectTrigger className="h-10 rounded-xl border-slate-200 bg-white text-sm text-slate-700">
                    <SelectValue placeholder="全部标段" />
                  </SelectTrigger>
                  <SelectContent align="start" side="bottom">
                    <SelectItem value="all">全部标段</SelectItem>
                    {deviationFilterOptions.sections.map((value) => (
                      <SelectItem key={value} value={value}>{value}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
              <label className="space-y-1 text-xs text-slate-500">
                <span>专业</span>
                <Select value={deviationSpecialtyFilter} onValueChange={setDeviationSpecialtyFilter}>
                  <SelectTrigger className="h-10 rounded-xl border-slate-200 bg-white text-sm text-slate-700">
                    <SelectValue placeholder="全部专业" />
                  </SelectTrigger>
                  <SelectContent align="start" side="bottom">
                    <SelectItem value="all">全部专业</SelectItem>
                    {deviationFilterOptions.specialties.map((value) => (
                      <SelectItem key={value} value={value}>{value}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
              <label className="space-y-1 text-xs text-slate-500">
                <span>偏差等级</span>
                <Select value={deviationLevelFilter} onValueChange={setDeviationLevelFilter}>
                  <SelectTrigger className="h-10 rounded-xl border-slate-200 bg-white text-sm text-slate-700">
                    <SelectValue placeholder="全部等级" />
                  </SelectTrigger>
                  <SelectContent align="start" side="bottom">
                    <SelectItem value="all">全部等级</SelectItem>
                    {deviationFilterOptions.levels.map((value) => (
                      <SelectItem key={value} value={value}>{getDeviationStatusLabel(value)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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

          <div className="content-sidebar-grid">
            <DeviationDetailTable
              rows={deviationTableRows}
              mainlineLabel={deviationMainline?.label || deviationViewLabel}
              onSelectRow={(row) => setSelectedDeviationRow(row as ProgressDeviationRow)}
            />
          </div>

          <div className="content-sidebar-grid">
            <Card data-testid="deviation-detail-panel" className="surface-card">
              <ReportSectionHead eyebrow="REPORT" title="下钻明细区" />
              <CardContent className="space-y-3">
                {secondaryExpanded ? (
                  secondarySummaryCards.map((card) => (
                    <div key={card.title} className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                      <div className="text-sm font-medium text-slate-900">{card.title}</div>
                      <div className="mt-2 text-2xl font-semibold text-slate-900">{card.value}</div>
                    </div>
                  ))
                ) : (
                  <EmptyState
                    icon={BarChart3}
                    title="下钻明细已收起"
                    description="当前只展示主表和责任归因摘要。"
                    className="rounded-2xl empty-state-frame border-slate-200 bg-slate-50 p-5"
                  />
                )}
              </CardContent>
            </Card>

            <Card data-testid="reports-responsibility-analysis" className="surface-card">
              <ReportSectionHead eyebrow="REPORT" title="责任归因分析" />
              <CardContent className="space-y-8">
                <div className="space-y-3">
                  <div className="text-sm font-medium text-slate-700">责任贡献</div>
                  {responsibilityContribution.length > 0 ? (
                    responsibilityContribution.map((entry) => {
                      const affectedTaskIds = formatEvidenceIds(entry.task_ids)
                      const causalTaskIds = formatEvidenceIds(entry.causal_task_ids)
                      const evidenceSources = formatEvidenceIds(entry.evidence_sources)
                      const confidenceLabel = formatEvidenceConfidence(entry.confidence)
                      const impactDays =
                        typeof entry.impact_days === 'number' && Number.isFinite(entry.impact_days)
                          ? Math.round(entry.impact_days * 10) / 10
                          : null
                      const weightedCount =
                        typeof entry.weighted_count === 'number' && Number.isFinite(entry.weighted_count)
                          ? Math.round(entry.weighted_count * 10) / 10
                          : null

                      return (
                      <div
                        key={`${entry.owner}:${entry.responsibility_role || 'owner'}:${entry.basis || 'basis'}:${entry.task_ids.join('|')}`}
                        className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="mb-2 flex flex-wrap gap-2">
                              <Badge variant={entry.responsibility_role === 'accountable_subject' ? 'default' : 'secondary'}>
                                {getResponsibilityRoleLabel(entry.responsibility_role)}
                              </Badge>
                              <Badge variant="outline">{getResponsibilityBasisLabel(entry.basis)}</Badge>
                            </div>
                            <div className="text-sm font-medium text-slate-900">{entry.owner}</div>
                            <div className="mt-1 text-xs text-slate-500">
                              {entry.task_ids.length} 个任务 · {entry.count} 项偏差
                            </div>
                          </div>
                          <div className="text-xs text-slate-500">{formatWholePercent(entry.percentage)}</div>
                        </div>
                        <div className="mt-3 space-y-1 text-xs leading-5 text-slate-600">
                          {affectedTaskIds ? <div>受影响任务 {affectedTaskIds}</div> : null}
                          {causalTaskIds ? <div>上游致因任务 {causalTaskIds}</div> : null}
                          {entry.owner_id ? <div>主体ID {entry.owner_id}</div> : null}
                          {impactDays !== null ? <div>影响生产日 {impactDays}</div> : null}
                          {weightedCount !== null ? <div>权重贡献 {weightedCount}</div> : null}
                          {evidenceSources ? <div>证据来源 {evidenceSources}</div> : null}
                          {confidenceLabel ? <div>证据置信度 {confidenceLabel}</div> : null}
                        </div>
                        <div className="mt-2 h-[3px] rounded-full bg-white">
                          <div
                            className="h-[3px] rounded-full bg-blue-600"
                            style={{ width: `${Math.max(entry.percentage, entry.count > 0 ? 8 : 0)}%` }}
                          />
                        </div>
                      </div>
                    )})
                  ) : (
                    <div className="rounded-2xl empty-state-frame border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
                    </div>
                  )}
                </div>
                <div className="space-y-3">
                  <div className="text-sm font-medium text-slate-700">TOP3 偏差原因</div>
                  {topDeviationCauses.length > 0 ? (
                    topDeviationCauses.map((cause) => (
                      <div key={cause.reason} className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-sm font-medium text-slate-900">{getResponsibilityBasisLabel(cause.reason)}</div>
                          <div className="text-xs text-slate-500">{cause.count} 项 · {formatWholePercent(cause.percentage)}</div>
                        </div>
                        <div className="mt-2 h-[3px] rounded-full bg-white">
                          <div
                            className="h-[3px] rounded-full bg-rose-400"
                            style={{ width: `${Math.max(cause.percentage, cause.count > 0 ? 8 : 0)}%` }}
                          />
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-2xl empty-state-frame border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <Card data-testid="reports-delay-statistics" className="surface-card">
              <ReportSectionHead eyebrow="REPORT" title="延期统计" />
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
                      <div className="inline-flex items-center gap-1.5 text-xs font-medium text-red-600">
                        <DurationBasisBadge basis="production" compact variant="outline" />
                        延期 {row.delayDays} 个生产日
                      </div>
                    </div>
                  ))
                ) : (
                  <EmptyState
                    variant="filter"
                    title="暂无延期统计"
                    description="当前筛选条件下没有可展示的延期任务。"
                    className="rounded-2xl empty-state-frame border-slate-200 bg-slate-50 py-8"
                  />
                )}
              </CardContent>
            </Card>

            <Card data-testid="reports-delay-obstacle-correlation" className="surface-card">
              <ReportSectionHead eyebrow="REPORT" title="延期与阻碍关联" />
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
                          <span key={type} className="rounded-full bg-white px-2.5 py-1 text-xs text-slate-600">
                            {type}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-2xl empty-state-frame border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
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
              className="left-auto right-0 top-0 h-full max-h-none w-full max-w-[var(--dialog-lg-width)] translate-x-0 translate-y-0 rounded-none border-l border-slate-200 bg-white p-0 shadow-[var(--el-4)] data-[state=open]:slide-in-from-right-0"
            >
              {selectedDeviationRow ? (
                <div className="flex h-full flex-col">
                  <div className="px-6 py-5">
                    <DialogHeader className="space-y-2 text-left">
                      <DialogTitle className="text-xl">{selectedDeviationRow.title}</DialogTitle>
                      <DialogDescription className="text-sm text-slate-500">
                        {deviationMainline?.label || deviationViewLabel} · 偏差 {selectedDeviationRow.deviation_days} 个生产日
                      </DialogDescription>
                    </DialogHeader>
                  </div>
                  <Separator />
                  <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
                    <div className="grid gap-5 sm:grid-cols-2">
                      <DetailStatCard
                        label="计划进度"
                        value={formatWholePercent(selectedDeviationRow.planned_progress ?? 0)}
                        hint="计划口径"
                      />
                      <DetailStatCard
                        label="实际进度"
                        value={formatWholePercent(selectedDeviationRow.actual_progress ?? 0)}
                        hint={selectedDeviationRow.actual_date || '无实际日期'}
                      />
                      <DetailStatCard
                        label="偏差生产日"
                        value={selectedDeviationRow.deviation_days}
                        hint={`${formatWholePercent(selectedDeviationRow.deviation_rate)} 偏差率`}
                      />
                      <DetailStatCard
                        label="主线"
                        value={deviationMainline?.label || deviationViewLabel}
                        hint={selectedDeviationRow.mainline}
                      />
                    </div>

                    {selectedDeviationRow.source_task_id ? (
                      <Button asChild variant="outline" className="w-full justify-between border-slate-200 bg-white">
                        <Link
                          data-testid="reports-open-gantt-from-deviation"
                          to={`/projects/${projectId}/gantt?view=gantt&highlight=${encodeURIComponent(selectedDeviationRow.source_task_id)}`}
                        >
                          查看对应 Gantt
                          <ArrowRight className="h-4 w-4" />
                        </Link>
                      </Button>
                    ) : null}

                    {selectedDeviationRow.attribution?.cause_chain?.length ? (
                      <div
                        data-testid="reports-deviation-cause-chain"
                        className="space-y-3 rounded-2xl border border-blue-100 bg-blue-50/60 p-4"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="text-sm font-semibold text-slate-900">责任证据链</div>
                          <Badge variant="outline">
                            {selectedDeviationRow.attribution.cause_chain.length} 条证据
                          </Badge>
                        </div>
                        {selectedDeviationRow.attribution.cause_chain.map((item, index) => {
                          const confidenceLabel = formatEvidenceConfidence(item.confidence)
                          const impactDays = getCauseImpactDays(item)

                          return (
                            <div
                              key={`${item.cause_type}:${item.affected_task_id || index}:${item.upstream_task_id || 'cause'}`}
                              className="rounded-xl border border-blue-100 bg-white px-4 py-3 text-sm text-slate-700"
                            >
                              <div className="flex flex-wrap items-center gap-2">
                                <Badge>{getCauseTypeLabel(item.cause_type)}</Badge>
                                <Badge variant="outline">{getResponsibilityBasisLabel(item.responsibility_basis)}</Badge>
                              </div>
                              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                                <div>致因责任主体 {item.accountable_owner || '未明确'}</div>
                                <div>受影响主体 {item.impacted_owner || '未明确'}</div>
                                {item.affected_task_id ? <div>受影响任务 {item.affected_task_id}</div> : null}
                                {item.upstream_task_id ? <div>上游致因任务 {item.upstream_task_id}</div> : null}
                                {impactDays !== null ? <div>等待 {impactDays} 个生产日</div> : null}
                                {confidenceLabel ? <div>证据置信度 {confidenceLabel}</div> : null}
                              </div>
                              {item.evidence_source ? (
                                <div className="mt-3 break-words text-xs text-slate-500">
                                  证据来源 {item.evidence_source}
                                </div>
                              ) : null}
                            </div>
                          )
                        })}
                      </div>
                    ) : null}

                    <div className="grid gap-5 rounded-2xl border border-slate-100 bg-slate-50 p-4 text-sm text-slate-700 sm:grid-cols-2">
                      <div>
                        <div className="text-xs font-medium uppercase tracking-wider text-slate-500">状态</div>
                        <div className="mt-1 text-slate-900">{selectedDeviationRow.status}</div>
                      </div>
                      <div>
                        <div className="text-xs font-medium uppercase tracking-wider text-slate-500">{'\u5173\u7cfb\u8bf4\u660e'}</div>
                        <div className="mt-1 text-slate-900">{relationSummaryLabel(selectedDeviationRow)}</div>
                      </div>
                      <div>
                        <div className="text-xs font-medium uppercase tracking-wider text-slate-500">实际日期</div>
                        <div className="mt-1 text-slate-900">{formatDateLabel(selectedDeviationRow.actual_date || null)}</div>
                      </div>
                      <div>
                        <div className="text-xs font-medium uppercase tracking-wider text-slate-500">原因</div>
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
        <Card data-testid="reports-condition-summary" className="surface-card">
          <ReportSectionHead eyebrow="REPORT" title="条件未满足分析" />
          <CardContent className="grid gap-5 md:grid-cols-3">
            <DetailStatCard label="条件总数" value={projectConditions.length} hint="项目当前条件项总量" />
            <DetailStatCard label="未满足任务" value={summary?.pendingConditionTaskCount ?? 0} hint="仍受条件限制的任务" />
            <DetailStatCard label="活跃条件" value={summary?.pendingConditionCount ?? 0} hint="尚未满足的条件项" />
          </CardContent>
        </Card>
      ) : null}

      {showRiskSections ? (
        <Card data-testid="reports-risk-linkage-summary" className="surface-card">
          <ReportSectionHead eyebrow="REPORT" title="风险联动摘要" />
          <CardContent className="grid gap-5 md:grid-cols-3">
            <DetailStatCard label="活跃风险" value={projectRisks.length} hint={`摘要口径 ${summary?.activeRiskCount ?? projectRisks.length}`} />
            <DetailStatCard label="活跃问题" value={issueSummary.active_issues} hint={`问题总数 ${issueSummary.total_issues}`} />
            <DetailStatCard label="问题来源" value={issueSummary.source_counts.length} hint="来源分布已接入后端摘要" />
          </CardContent>
        </Card>
      ) : null}

      {showObstacleSections ? (
        <div className="grid gap-6 xl:grid-cols-2">
          <MaterialArrivalSummaryCard summary={materialSummary} projectId={projectId} />

          <Card data-testid="reports-obstacle-type-summary" className="surface-card">
            <ReportSectionHead eyebrow="REPORT" title="阻碍类型汇总" />
            <CardContent className="space-y-3">
              {obstacleTypeSummary.length > 0 ? (
                obstacleTypeSummary.map(([type, count]) => (
                  <div key={type} className="flex items-center justify-between rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
                    <div className="text-sm font-medium text-slate-900">{type}</div>
                    <div className="text-xs text-slate-500">{count} 条阻碍</div>
                  </div>
                ))
              ) : (
                <div className="rounded-2xl empty-state-frame border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
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
    return (
      <>
      <div className="content-sidebar-grid">
        <Card data-testid="reports-risk-matrix" variant="surface">
          <ReportSectionHead eyebrow="REPORT" title="风险矩阵热力图" />
          <CardContent className="space-y-4">
            <div className="grid grid-cols-[3.5rem_repeat(5,minmax(0,1fr))] gap-2 text-center text-xs">
              <div />
              {[1, 2, 3, 4, 5].map((probability) => (
                <div key={`probability-${probability}`} className="text-slate-500 num-mono">P{probability}</div>
              ))}
              {riskMatrixCells.map((row) => (
                <Fragment key={`impact-${row[0]?.impact}`}>
                  <div className="flex items-center justify-end pr-2 text-slate-500 num-mono">I{row[0]?.impact}</div>
                  {row.map((cell) => (
                    <div
                      key={`${cell.impact}-${cell.probability}`}
                      className={`flex aspect-square min-h-12 items-center justify-center rounded-lg border font-semibold num-mono ${getRiskMatrixCellClass(cell.count, cell.impact, cell.probability)}`}
                      aria-label={`影响 ${cell.impact} 概率 ${cell.probability} 风险 ${cell.count} 条`}
                    >
                      {cell.count}
                    </div>
                  ))}
                </Fragment>
              ))}
            </div>
            <div className="flex flex-wrap gap-3 text-xs text-slate-500">
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-500" />低</span>
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-500" />中</span>
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-red-500" />高</span>
            </div>
          </CardContent>
        </Card>

        <Card data-testid="reports-risk-list" variant="surface">
          <ReportSectionHead
            eyebrow="RISK"
            action={<Button asChild variant="outline" size="sm">
                <Link to={projectId ? `/projects/${projectId}/risks` : '/risks'}>
                  查看全部({filteredRiskRows.length})
                </Link>
              </Button>}
            title="最新风险列表"
          />
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {riskLevelChips.map((chip) => (
                <Button
                  key={chip.key}
                  type="button"
                  variant="ghost"
                  onClick={() => setRiskLevelFilter(chip.key)}
                  className={`gap-2 rounded-full px-3 py-1 text-xs font-medium ${
                    riskLevelFilter === chip.key ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {chip.label}
                  <span className={`rounded-full px-2 py-0.5 num-mono ${riskLevelFilter === chip.key ? 'bg-white/20 text-white' : 'bg-white text-slate-600'}`}>
                    {chip.count}
                  </span>
                </Button>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              {riskStatusChips.map((chip) => (
                <Button
                  key={chip.key}
                  type="button"
                  variant="ghost"
                  onClick={() => setRiskStatusFilter(chip.key)}
                  className={`gap-2 rounded-full px-3 py-1 text-xs font-medium ${
                    riskStatusFilter === chip.key ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {chip.label}
                  <span className={`rounded-full px-2 py-0.5 num-mono ${riskStatusFilter === chip.key ? 'bg-white/20 text-white' : 'bg-white text-slate-600'}`}>
                    {chip.count}
                  </span>
                </Button>
              ))}
            </div>

            <div className="space-y-3">
              {visibleRiskRows.length === 0 ? (
                <div className="rounded-xl empty-state-frame border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                </div>
              ) : (
                visibleRiskRows.map((risk) => {
                  const tone = getRiskLevelTone(risk.level)
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
                      className="grid grid-cols-[0.25rem_minmax(0,1fr)] gap-4 rounded-xl border border-slate-100 bg-white px-3 py-3 transition-colors even:bg-slate-50/50 hover:bg-slate-100/60"
                    >
                      <span className={`rounded-full ${tone.bar}`} aria-hidden="true" />
                      <div className="min-w-0">
                        <div className="flex items-center justify-between gap-3">
                          <div className="truncate text-sm font-medium text-slate-900">{risk.title || '未命名风险'}</div>
                          <span className={`rounded-full border px-2 py-0.5 text-xs ${tone.badge}`}>{getRiskLevelLabel(risk.level)}</span>
                        </div>
                        <div className="mt-1 flex flex-wrap gap-2 text-xs text-slate-500">
                          <span>{risk.assignee || risk.owner_id || '未指定责任人'}</span>
                          <span className="num-mono">{formatDateLabel(risk.created_at)}</span>
                        </div>
                      </div>
                    </Link>
                  )
                })
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="content-sidebar-grid">
        <Card className="surface-card">
          <ReportSectionHead eyebrow="REPORT" title="风险压力结构" />
          <CardContent className="space-y-4">
            <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
              <DetailStatCard label="活跃风险" value={summary?.activeRiskCount ?? projectRisks.length} hint={`总风险 ${summary?.riskCount ?? projectRisks.length}`} />
              <DetailStatCard label="条件未满足" value={summary?.pendingConditionTaskCount ?? projectConditions.length} hint={`条件项 ${summary?.pendingConditionCount ?? projectConditions.length}`} />
              <DetailStatCard label="阻碍任务" value={summary?.activeObstacleTaskCount ?? projectObstacles.length} hint={`阻碍项 ${summary?.activeObstacleCount ?? projectObstacles.length}`} />
              <DetailStatCard label="业务健康" value={summary?.businessHealthScore ?? '--'} hint={summary?.healthStatus || '共享摘要口径'} />
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

        <Card className="surface-card">
          <ReportSectionHead eyebrow="REPORT" title="处置入口" />
          <CardContent className="space-y-3 text-sm leading-6 text-slate-600">
            <Button
              type="button"
              variant="outline"
              className="w-full justify-between"
              onClick={() => navigate(projectId ? `/projects/${projectId}/risks` : '/workspace')}
            >
              <ShieldAlert className="h-4 w-4" />
            </Button>
          </CardContent>
        </Card>

        <div className="xl:col-span-2">
          <MaterialArrivalSummaryCard summary={materialSummary} projectId={projectId} />
        </div>

        <Card className="surface-card xl:col-span-2">
          <ReportSectionHead eyebrow="REPORT" title="重点风险与问题清单" />
          <CardContent className="space-y-3">
            {focusRisks.length === 0 ? (
              <div className="rounded-2xl empty-state-frame border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
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
                    className="grid gap-5 rounded-2xl border border-slate-100 bg-white px-4 py-4 transition-colors hover:border-blue-200 hover:bg-blue-50/40 md:grid-cols-[minmax(0,1.3fr)_8.75rem_8.75rem_8.75rem]"
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

        <Card data-testid="reports-issue-analysis" className="surface-card xl:col-span-2">
          <ReportSectionHead eyebrow="REPORT" title="问题独立分析" />
          <CardContent className="space-y-4">
            <div className="grid gap-5 md:grid-cols-4">
              <DetailStatCard label="问题总数" value={issueSummary.total_issues} hint="后端汇总口径" />
              <DetailStatCard label="活跃问题" value={issueSummary.active_issues} hint={`open ${issueOpenCount} · investigating ${issueInvestigatingCount}`} />
              <DetailStatCard label="已解决 / 关闭" value={`${issueResolvedCount}/${issueClosedCount}`} hint={`严重问题 ${issueCriticalCount}`} />
              <DetailStatCard label="来源类型" value={issueSourceCounts.length} hint="后端 issues/summary" />
            </div>
            <div className="grid gap-5 xl:grid-cols-2">
              <div className="space-y-3">
                <div className="text-sm font-medium text-slate-700">近 30 天趋势</div>
                {issueSummaryLoading ? (
                  <div className="rounded-2xl empty-state-frame border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-500">
                  </div>
                ) : issueTrend.length > 0 ? (
                  <div className="rounded-2xl bg-white p-3 ring-1 ring-inset ring-slate-100">
                    <div className="h-44">
                      <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1} initialDimension={{ width: 520, height: 176 }}>
                        <BarChart data={issueTrend} margin={{ top: 12, right: 16, bottom: 8, left: 0 }}>
                        <CartesianGrid stroke={CHART_AXIS_COLORS.neutralGrid} vertical={false} />
                        <XAxis
                          dataKey="date"
                          tickLine={false}
                          axisLine={false}
                          tick={{ fill: CHART_AXIS_COLORS.axisText, fontSize: 11 }}
                          tickFormatter={(value) => String(value).slice(5)}
                        />
                        <YAxis
                          allowDecimals={false}
                          tickLine={false}
                          axisLine={false}
                          tick={{ fill: CHART_AXIS_COLORS.axisText, fontSize: 11 }}
                        />
                        <RechartsTooltip content={<ChartTooltip />} cursor={chartTooltipCursor} />
                        <Bar dataKey="newIssues" name="新增" fill={CHART_SERIES.primary} radius={[6, 6, 0, 0]} animationDuration={800} />
                        <Bar dataKey="resolvedIssues" name="已解决" fill={CHART_SERIES.success} radius={[6, 6, 0, 0]} animationDuration={800} />
                        <Bar dataKey="activeIssues" name="活跃" fill={CHART_AXIS_COLORS.axisText} radius={[6, 6, 0, 0]} animationDuration={800} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-500">
                      <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-blue-400" />新增</span>
                      <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-400" />已解决</span>
                      <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-slate-700" />活跃</span>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-2xl empty-state-frame border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-500">
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
                  <div className="rounded-2xl empty-state-frame border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-500">
                  </div>
                )}
              </div>
            </div>
            <div className="grid gap-5 xl:grid-cols-2">
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
                  <div className="rounded-2xl empty-state-frame border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-500">
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
                            {getIssueStatusLabel(row.status)} · {getIssueSourceLabel(row.source_type, row.source_entity_type)}
                          </div>
                        </div>
                        <div className="text-xs text-slate-500">{formatDateTimeLabel(row.created_at)}</div>
                      </div>
                      {row.description ? <div className="mt-2 text-xs leading-5 text-slate-500">{row.description}</div> : null}
                    </div>
                  ))
                ) : (
                  <div className="rounded-2xl empty-state-frame border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-500">
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
      </>
    )
  }

  const renderActiveDetail = () => {
    switch (activeView) {
      case 'progress':
        return renderProgressDetail()
      case 'progress_deviation':
        return renderProgressDeviationDetail()
      case 'risk':
        return renderRiskDetail()
      default:
        return null
    }
  }

  return (
    <div className="page-shell page-enter">
        <Breadcrumb
          showHome
          items={[
            { label: projectName, href: `/projects/${projectId}/dashboard` },
            { label: '分析报表' },
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
            loading={loading || criticalPathLoading || deviationLoading}
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
              <DropdownMenuItem onClick={() => { void handleExportOwnerMonthly('xlsx') }}>
                <FileSpreadsheet className="mr-2 h-4 w-4" />
                业主月报 Excel
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => { void handleExportOwnerMonthly('pdf') }}>
                <Download className="mr-2 h-4 w-4" />
                业主月报 PDF
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs text-slate-500">
            <Clock3 className="h-3.5 w-3.5" />
            最近刷新 {lastRefreshedAt ? formatDateTimeLabel(lastRefreshedAt) : '未刷新'}
          </div>
        </PageHeader>

        {/* v1.4.16: data reliability removed from Reports; Dashboard is sole entry */}

        <V14231PageReadinessBoundary pageKey="Reports" className="mb-6 border-amber-200 bg-amber-50/80 text-amber-950" />

        {error ? (
          <div
            data-testid="reports-summary-fallback-alert"
            className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
          >
            {error}
          </div>
        ) : null}

        <div className="mb-6 grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(22rem,1fr)]">
          <Card className="surface-card border-slate-200/90 bg-white">
            <CardContent className="space-y-5 p-6 md:p-7">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary" className="rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
                  商业化分析报表中心
                </Badge>
                <Badge variant="secondary" className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600">
                  项目：{projectName}
                </Badge>
              </div>
              <div className="space-y-2">
                <h2 className="text-2xl font-semibold tracking-tight text-slate-900 md:text-[2rem]">先给结论，再给证据，再给动作</h2>
                <p className="max-w-3xl text-sm leading-6 text-slate-600 md:text-base">
                  当前报表页按三条主线收口：进度总览、进度偏差、风险与问题。首屏先输出判断和优先事项，再展开趋势证据、偏差来源和下钻入口，适合日常经营查看与对外汇报展示。
                </p>
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                  <div className="text-xs font-medium uppercase tracking-wider text-slate-500">当前判断</div>
                  <div className="mt-2 text-base font-semibold text-slate-900">
                    {(summary?.delayedTaskCount ?? delayedTasks.length) > 0 || activeRiskCount > 0 ? '项目存在偏差与风险压力，需要持续干预' : '项目整体可控，可按当前节奏推进'}
                  </div>
                  <div className="mt-2 text-sm leading-6 text-slate-600">
                    结合延期任务、活跃风险、未闭环问题和阻碍项形成当前经营判断。
                  </div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                  <div className="text-xs font-medium uppercase tracking-wider text-slate-500">优先关注</div>
                  <div className="mt-2 text-base font-semibold text-slate-900">
                    {(summary?.delayedTaskCount ?? delayedTasks.length) > 0 ? `优先处理 ${(summary?.delayedTaskCount ?? delayedTasks.length)} 个延期任务` : `优先消化 ${activeRiskCount} 个活跃风险`}
                  </div>
                  <div className="mt-2 text-sm leading-6 text-slate-600">
                    先看偏差，再定位责任主体、阻碍来源和风险联动对象。
                  </div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                  <div className="text-xs font-medium uppercase tracking-wider text-slate-500">推荐动作</div>
                  <div className="mt-2 text-base font-semibold text-slate-900">
                    进入{activeView === 'progress_deviation' ? '偏差分析' : activeView === 'risk' ? '风险与问题' : '进度总览'}主线继续下钻
                  </div>
                  <div className="mt-2 text-sm leading-6 text-slate-600">
                    当前页已保留导出、刷新、明细跳转和业务对象回链，适合直接形成复盘与汇报动作。
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
            {reportConclusionCards.map((card) => (
              <Card key={card.title} className="surface-card border-slate-200/90 bg-white">
                <CardContent className="p-5">
                  <div className="text-xs font-medium uppercase tracking-wider text-slate-500">{card.title}</div>
                  <div className="mt-2 text-2xl font-semibold text-slate-900">{card.value}</div>
                  <div className="mt-1 text-sm leading-6 text-slate-600">{card.hint}</div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {showReportModules ? (
          <DeviationShell>
            <Tabs
              data-testid="reports-module-tabs"
              value={activeView}
              onValueChange={(value) => {
                const entry = analysisEntries.find((e) => e.view === value)
                if (entry) openEntry(entry)
              }}
            >
              <TabsList className="flex h-auto w-full flex-wrap justify-start gap-6 rounded-none border-b border-slate-100 bg-transparent p-0 text-slate-500">
                {moduleChips.map((entry) => (
                  <TabsTrigger
                    key={entry.key}
                    value={entry.key}
                    data-testid={`analysis-entry-${entry.key}`}
                    className="relative gap-2 rounded-none bg-transparent px-0 pb-3 pt-0 text-sm font-medium text-slate-500 shadow-none transition-colors after:absolute after:inset-x-0 after:-bottom-px after:h-[2px] after:rounded-full after:bg-transparent hover:text-slate-700 data-[state=active]:bg-transparent data-[state=active]:text-blue-700 data-[state=active]:shadow-none data-[state=active]:after:bg-blue-600"
                  >
                    <span>{entry.label}</span>
                    {entry.badge != null ? (
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-semibold num-mono ${
                          activeView === entry.key
                            ? 'bg-white/20 text-white'
                            : entry.color === 'red'
                              ? 'bg-red-50 text-red-700'
                              : entry.color === 'amber'
                                ? 'bg-amber-50 text-amber-700'
                                : 'bg-blue-50 text-blue-700'
                        }`}
                      >
                        {entry.badge}
                      </span>
                    ) : null}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>

            <Card data-testid="reports-current-metrics-shell" className="surface-card border-slate-200/90 bg-white">
              <CardContent className="space-y-5 p-5 md:p-6">
                <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
                  <div>
                    <div className="text-xs font-medium uppercase tracking-widest text-slate-500">核心结论</div>
                    <h3 className="mt-1 text-lg font-semibold text-slate-900">本页最值得先看的经营指标</h3>
                    <p className="mt-1 text-sm leading-6 text-slate-600">先用结论型指标理解当前状态，再进入趋势、偏差和风险明细继续下钻。</p>
                  </div>
                  <div className="text-xs text-slate-500">当前主线：{activeEntry?.title || viewConfig.title}</div>
                </div>
                <div data-testid="reports-current-metrics" className={metricGridClass}>
                  {currentMetrics.map((metric) => (
                    <SharedMetricCard
                      key={metric.title}
                      eyebrow="REPORT"
                      title={metric.title}
                      value={metric.value}
                      hint={metric.hint}
                      icon={metric.icon}
                    />
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card data-testid="reports-trend-panel" className="surface-card border-slate-200/90 bg-white">
              <ReportSectionHead eyebrow="REPORT" title="趋势证据与口径筛选" />
              <CardContent className="space-y-4">
                <div className="grid gap-5 md:grid-cols-3">
                  <label className="space-y-1 text-xs text-slate-500">
                    <span>指标选择器</span>
                    <Select value={trendMetric} onValueChange={(value) => setTrendMetric(value as ReportMetricKey)}>
                      <SelectTrigger className="h-10 rounded-xl border-slate-200 bg-white text-sm text-slate-700">
                        <SelectValue placeholder="选择指标" />
                      </SelectTrigger>
                      <SelectContent>
                        {metricOptions.map((option) => (
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

                <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                  <div className="text-xs font-medium uppercase tracking-widest text-slate-500">当前筛选结论</div>
                  <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-600">
                    <span className="rounded-full bg-white px-3 py-1 ring-1 ring-slate-200">当前指标 {selectedTrendMetric.label}</span>
                    <span className="rounded-full bg-white px-3 py-1 ring-1 ring-slate-200">时间范围 {selectedTrendRange.label}</span>
                    <span className="rounded-full bg-white px-3 py-1 ring-1 ring-slate-200">
                      维度 {selectedTrendDimension?.label || '全部维度'}
                    </span>
                    <span className="rounded-full bg-white px-3 py-1 ring-1 ring-slate-200">
                      维度切片 {selectedTrendDimension?.options.length ?? reportScopeSections.length} 项
                    </span>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-slate-600">
                    当前趋势模块用于回答“最近一段时间是否在变好、变差，以及问题集中在哪个维度”。筛选后的结果可直接支撑汇报和复盘。
                  </p>
                </div>

                {trendError ? (
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                    {trendError}
                  </div>
                ) : trendLoading && trendPoints.length === 0 ? (
                  <LoadingState label="趋势数据加载中" className="min-h-24 rounded-2xl empty-state-frame border-slate-200 bg-slate-50" />
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
                  <div className="rounded-2xl empty-state-frame border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-500">
                  </div>
                )}
              </CardContent>
            </Card>

            <div key={`${activeView}-${deviationView}`} className="motion-safe:animate-fade-in duration-200">
              {renderActiveDetail()}
            </div>
          </DeviationShell>
        ) : loading ? (
          <LoadingState
            label="偏差分析加载中"
            description=""
            className="min-h-32 rounded-2xl border border-slate-200 bg-white"
          />
        ) : (
          <EmptyState
            variant={error ? 'error' : 'default'}
            icon={BarChart3}
            title={error ? '偏差分析暂不可用' : '暂无偏差分析数据'}
            description={error || '当前项目还没有可展示的偏差分析结果。'}
            className="max-w-none rounded-2xl bg-white"
          />
        )}
    </div>
  )
}

function CriticalPathSummaryCard({
  summary,
}: {
  summary: CriticalPathSummaryModel | null
}) {
  return (
    <Card data-testid="reports-critical-path-summary" className="surface-card">
      <ReportSectionHead eyebrow="REPORT" title="关键路径摘要" />
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
          <EmptyState
            icon={ShieldAlert}
            title="暂无关键路径摘要"
            description="当前项目还没有可展示的关键路径统计。"
            className="rounded-2xl empty-state-frame border-slate-200 bg-slate-50 px-4 py-5"
          />
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
    <Card data-testid="reports-material-arrival-summary" className="surface-card">
      <ReportSectionHead eyebrow="REPORT" title="材料到场率分析" />
      <CardContent className="space-y-4">
        {summary ? (
          <>
            <div className="grid gap-5 md:grid-cols-3">
              <DetailStatCard label="预计到场总数" value={overview.totalExpectedCount} hint="按预计到场日期口径" />
              <DetailStatCard label="按时到场数" value={overview.onTimeCount} hint="实际到场 <= 预计到场" />
              <DetailStatCard label="整体到场率" value={formatWholePercent(overview.arrivalRate)} hint="近 6 个月与当前项目材料总览" />
            </div>
            <div className="content-sidebar-grid">
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
                          <div className="text-lg font-semibold text-slate-900">{formatWholePercent(row.arrivalRate)}</div>
                          <div>{row.onTimeCount} / {row.totalExpectedCount}</div>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <EmptyState
                    icon={ClipboardList}
                    title="暂无单位到场记录"
                    description="当前项目还没有按参建单位汇总的材料到场数据。"
                    className="rounded-2xl empty-state-frame border-slate-200 bg-slate-50 px-4 py-5"
                  />
                )}
              </div>
              <div className="space-y-3">
                <div className="text-sm font-medium text-slate-700">近 6 个月趋势</div>
                {monthlyTrend.length > 0 ? (
                  monthlyTrend.map((row) => (
                    <div key={row.month} className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-sm font-medium text-slate-900">{row.month}</div>
                        <div className="text-sm text-slate-700">{formatWholePercent(row.arrivalRate)}</div>
                      </div>
                      <div className="mt-2 h-[3px] rounded-full bg-slate-200">
                        <div className="h-[3px] rounded-full bg-emerald-500" style={{ width: `${Math.max(row.arrivalRate, row.totalExpectedCount > 0 ? 8 : 0)}%` }} />
                      </div>
                      <div className="mt-2 text-xs text-slate-500">
                        按时 {row.onTimeCount} / 预计 {row.totalExpectedCount}
                      </div>
                    </div>
                  ))
                ) : (
                  <EmptyState
                    icon={BarChart3}
                    title="暂无趋势数据"
                    description="当前项目还没有形成材料到场月度趋势。"
                    className="rounded-2xl empty-state-frame border-slate-200 bg-slate-50 px-4 py-5"
                  />
                )}
              </div>
            </div>
          </>
        ) : (
          <EmptyState
            icon={ClipboardList}
            title="暂无材料到场摘要"
            description="当前项目还没有可展示的材料到场统计。"
            className="rounded-2xl empty-state-frame border-slate-200 bg-slate-50 px-4 py-5"
          />
        )}
      </CardContent>
    </Card>
  )
}
