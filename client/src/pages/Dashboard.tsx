import { Link, useNavigate } from 'react-router-dom'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import DashboardCompareCard from '@/components/DashboardCompareCard'
import { DataConfidenceBreakdown } from '@/components/DataConfidenceBreakdown'
import DashboardMilestoneCard from '@/components/DashboardMilestoneCard'
import { EmptyState } from '@/components/EmptyState'
import { PageHeader } from '@/components/PageHeader'
import ProjectInfoCard, { type ProjectBasicInfoDraft, type ScopeDimensionSection } from '@/components/ProjectInfoCard'
import RecentTasksCard from '@/components/RecentTasksCard'
import { UnitProgressCard, type UnitProgress } from '@/components/UnitProgressCard'
import { TaskStatusCard } from '@/components/TaskStatusCard'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { LoadingState } from '@/components/ui/loading-state'
import { StatusBadge } from '@/components/ui/status-badge'
import { useStore } from '@/hooks/useStore'
import { useToast } from '@/hooks/use-toast'
import { PROJECT_NAVIGATION_LABELS } from '@/config/navigation'
import { apiGet, apiPut, getApiErrorMessage, isAbortError } from '@/lib/apiClient'
import { getTaskDisplayStatus, isCompletedTask, isDelayedTask } from '@/lib/taskBusinessStatus'
import { DashboardApiService, type ProjectSummary } from '@/services/dashboardApi'
import { DataQualityApiService, type DataQualityProjectSummary } from '@/services/dataQualityApi'
import type { Project } from '@/lib/supabase'
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Building2,
  Flag,
  FolderKanban,
  LayoutDashboard,
  RefreshCw,
  ShieldAlert,
  Target,
  Users,
} from 'lucide-react'

type ProjectStatus = '未开始' | '进行中' | '已完成' | '已暂停'

type PrepItem = {
  label: string
  value: string
  hint: string
}

type ChangeItem = {
  label: string
  value: number
  hint: string
  tone: string
}

type ResponsibilityUnitSummary = {
  key: string
  label: string
  total_tasks: number
  completed_count: number
  on_time_rate: number
}

type ResponsibilityInsightsResponse = {
  unit_rows?: ResponsibilityUnitSummary[]
}

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

type TodayLiveItem = {
  id: string
  title: string
  detail: string
  meta: string
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

type CurrentProjectEntity = NonNullable<ReturnType<typeof useStore.getState>['currentProject']>

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

function formatDaysLabel(days: number | null, pendingLabel = '待排期') {
  if (days === null) return pendingLabel
  if (days < 0) return `延期 ${Math.abs(days)} 天`
  return `剩余 ${days} 天`
}

function formatMilestoneHint(summary: ProjectSummary | null) {
  const nextMilestone = summary?.nextMilestone
  if (!nextMilestone?.targetDate) return '当前没有已识别的下一关键节点'
  return `计划 ${nextMilestone.targetDate} · ${formatDaysLabel(nextMilestone.daysRemaining)}`
}

function formatDeliveryHint(summary: ProjectSummary | null, plannedEndDate?: string | null) {
  const targetDate = summary?.plannedEndDate || plannedEndDate || null
  const days = summary?.daysUntilPlannedEnd ?? null

  if (!targetDate) return '未设置计划交付日期'
  if (days === null) return `计划交付 ${targetDate}`
  if (days < 0) return `计划交付 ${targetDate} · 已延期 ${Math.abs(days)} 天`
  return `计划交付 ${targetDate} · 剩余 ${days} 天`
}

function buildHealthSummary(summary: ProjectSummary | null) {
  if (!summary) return ''
  return summary.healthStatus || ''
}

function buildGovernanceSignalSummary(summary: ProjectSummary | null) {
  const governance = summary?.planningGovernance
  if (!governance || !governance.hasActiveGovernanceSignal) return null

  const items: string[] = []
  if (governance.dashboardCloseoutOverdue) {
    items.push('关账超期信号已触发')
  }
  if (governance.dashboardForceUnlockAvailable) {
    items.push('第 7 日强制发起关账权限可用')
  }
  if (governance.reorderSummaryCount > 0) {
    items.push(`重排摘要 ${governance.reorderSummaryCount} 条`)
  }

  return items.length > 0 ? items.join(' · ') : '治理信号已生成'
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

function inferUnitType(label: string): UnitProgress['type'] {
  const normalized = label.toLowerCase()
  if (normalized.includes('设计')) return 'design'
  if (normalized.includes('监理')) return 'supervision'
  if (normalized.includes('勘察')) return 'survey'
  if (normalized.includes('分包') || normalized.includes('劳务') || normalized.includes('专业')) return 'subcontract'
  return 'general'
}

function normalizeWarningRows(value: unknown): DashboardWarningItem[] {
  if (!Array.isArray(value)) return []
  const rows: DashboardWarningItem[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object') continue
    const row = item as Record<string, unknown>
    const normalized: DashboardWarningItem = {
      id: String(row.id ?? ''),
      title: String(row.title ?? '未命名预警'),
      description: String(row.description ?? ''),
      warning_level:
        (String(row.warning_level ?? 'info').trim().toLowerCase() as DashboardWarningItem['warning_level']) || 'info',
      is_acknowledged: Boolean(row.is_acknowledged),
      created_at: row.created_at ? String(row.created_at) : undefined,
      status: row.status ? String(row.status) : null,
    }
    if (normalized.id) rows.push(normalized)
  }
  return rows
}

function normalizeIssueRows(value: unknown): DashboardIssueItem[] {
  if (!Array.isArray(value)) return []
  const rows: DashboardIssueItem[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object') continue
    const row = item as Record<string, unknown>
    const normalized: DashboardIssueItem = {
      id: String(row.id ?? ''),
      title: String(row.title ?? '未命名问题'),
      description: row.description ? String(row.description) : null,
      severity:
        (String(row.severity ?? 'medium').trim().toLowerCase() as DashboardIssueItem['severity']) || 'medium',
      task_id: row.task_id ? String(row.task_id) : row.taskId ? String(row.taskId) : null,
      created_at: row.created_at ? String(row.created_at) : row.createdAt ? String(row.createdAt) : undefined,
      status: row.status ? String(row.status) : undefined,
    }
    if (normalized.id) rows.push(normalized)
  }
  return rows
}

function normalizeProblemRows(value: unknown): DashboardProblemItem[] {
  if (!Array.isArray(value)) return []
  const rows: DashboardProblemItem[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object') continue
    const row = item as Record<string, unknown>
    const status = row.status ? String(row.status) : undefined
    const normalized: DashboardProblemItem = {
      id: String(row.id ?? ''),
      title: row.title ? String(row.title) : undefined,
      description: row.description ? String(row.description) : undefined,
      severity: row.severity ? String(row.severity) : undefined,
      task_id: row.task_id ? String(row.task_id) : null,
      created_at: row.created_at ? String(row.created_at) : undefined,
      status,
      is_resolved:
        row.is_resolved === true ||
        row.is_resolved === 1 ||
        status === '已解决' ||
        String(status ?? '').trim().toLowerCase() === 'resolved',
    }
    if (normalized.id) rows.push(normalized)
  }
  return rows
}

function normalizeChangeLogRows(value: unknown): DashboardChangeLogItem[] {
  if (!Array.isArray(value)) return []
  const rows: DashboardChangeLogItem[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object') continue
    const row = item as Record<string, unknown>
    const normalized: DashboardChangeLogItem = {
      id: String(row.id ?? ''),
      entity_type: String(row.entity_type ?? ''),
      field_name: String(row.field_name ?? ''),
      change_reason: row.change_reason ? String(row.change_reason) : null,
      changed_at: row.changed_at ? String(row.changed_at) : undefined,
    }
    if (normalized.id) rows.push(normalized)
  }
  return rows
}

function TodayLiveCard({
  title,
  count,
  hint,
  emptyLabel,
  loading,
  items,
}: {
  title: string
  count: number
  hint: string
  emptyLabel: string
  loading: boolean
  items: TodayLiveItem[]
}) {
  const previewItems = items.slice(0, 2)
  void hint

  return (
    <Card variant="detail" className="rounded-[24px] border-slate-100">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base text-slate-900">{title}</CardTitle>
          </div>
          <Badge variant="secondary">{count}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-2 pt-0">
        {loading ? (
          <LoadingState
            label="今日动态加载中"
            description=""
            className="min-h-24 border-0 bg-transparent px-0 py-2 shadow-none"
          />
        ) : previewItems.length > 0 ? (
          previewItems.map((item) => (
            <div key={item.id} className="rounded-2xl border border-slate-100 bg-slate-50 px-3 py-3">
              <div className="text-sm font-medium text-slate-900">{item.title}</div>
              <div className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">{item.detail}</div>
              <div className="mt-2 text-[11px] font-medium uppercase tracking-[0.12em] text-slate-400">{item.meta}</div>
            </div>
          ))
        ) : (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-3 py-5 text-sm text-slate-500">
            {emptyLabel}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function DashboardHero({
  currentProject,
  currentStatus,
  summaryData,
  dataQualitySummary,
  nextMilestone,
  summaryLoading,
}: {
  currentProject: CurrentProjectEntity
  currentStatus: ProjectStatus
  summaryData: ProjectSummary | null
  dataQualitySummary: DataQualityProjectSummary | null
  nextMilestone: ProjectSummary['nextMilestone']
  summaryLoading: boolean
}) {
  const confidence = dataQualitySummary?.confidence
  const governanceSignalSummary = buildGovernanceSignalSummary(summaryData)
  const monthlyPlanningLink = currentProject.id ? `/projects/${currentProject.id}/planning/monthly` : '/company'
  const closeoutPlanningLink = currentProject.id ? `/projects/${currentProject.id}/tasks/closeout` : '/company'
  const [confidenceDialogOpen, setConfidenceDialogOpen] = useState(false)
  const projectOverview = [
    {
      key: 'project-health',
      label: '项目健康',
      value: String(summaryData?.healthScore ?? 0),
      hint: buildHealthSummary(summaryData),
      icon: Activity,
      tone: 'bg-blue-50 text-blue-600',
    },
    {
      key: 'execution-progress',
      label: '执行进展',
      value: `${summaryData?.overallProgress ?? 0}%`,
      hint: `${summaryData?.completedTaskCount ?? 0}/${summaryData?.leafTaskCount ?? 0} 个末级任务已完成`,
      icon: Target,
      tone: 'bg-emerald-50 text-emerald-600',
    },
    {
      key: 'key-milestones',
      label: '关键节点',
      value: `${summaryData?.completedMilestones ?? 0}/${summaryData?.totalMilestones ?? 0}`,
      hint: formatMilestoneHint(summaryData),
      icon: Flag,
      tone: 'bg-amber-50 text-amber-600',
    },
    {
      key: 'deviation-signal',
      label: '偏差信号',
      value: `${summaryData?.delayDays ?? 0} 天`,
      hint: `${summaryData?.delayCount ?? 0} 项延期任务·最大偏差`,
      icon: ShieldAlert,
      tone: 'bg-red-50 text-red-600',
    },
  ]

  return (
    <section className="shell-surface overflow-hidden">
      <div className="bg-white px-6 py-6">
        <div className="flex flex-col gap-6">
          <div data-testid="dashboard-global-summary" className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
            全局摘要
          </div>
          <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
            <div className="flex items-start gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-3xl bg-slate-950 shadow-lg shadow-slate-900/10">
                <Building2 className="h-6 w-6 text-white" />
              </div>
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge status={getProjectStatusKey(summaryData?.statusLabel || currentStatus)} fallbackLabel={summaryData?.statusLabel || currentStatus}>
                    {summaryData?.statusLabel || currentStatus}
                  </StatusBadge>
                  <StatusBadge status={getHealthStatusKey(summaryData?.healthScore ?? 0)} fallbackLabel={`健康度 ${summaryData?.healthScore ?? 0}`}>
                    健康度 {summaryData?.healthScore ?? 0}
                  </StatusBadge>
                  <StatusBadge
                    status={getConfidenceStatusKey(confidence?.score ?? 0)}
                    fallbackLabel={`数据置信度 ${Math.round(confidence?.score ?? 0)}%`}
                  >
                    数据置信度 {Math.round(confidence?.score ?? 0)}%
                  </StatusBadge>
                  <span className="badge-base bg-slate-100 text-slate-700">
                    里程碑 {summaryData?.completedMilestones ?? 0}/{summaryData?.totalMilestones ?? 0}
                  </span>
                  <span className="badge-base bg-slate-100 text-slate-700">项目总览</span>
                </div>
                <div>
                  <h1 className="shell-section-title">{currentProject.name}</h1>
                </div>
              </div>
            </div>
          </div>

          <div
            data-testid="dashboard-hero-cards"
            className="grid gap-4 md:grid-cols-2 xl:grid-cols-4"
          >
            {projectOverview.map((item) => (
              <div key={item.key} data-testid={`dashboard-hero-card-${item.key}`} className="rounded-[24px] bg-slate-50 px-5 py-5">
                <div className="flex items-center justify-between">
                  <div className="text-sm text-slate-500">{item.label}</div>
                  <div className={`rounded-2xl p-2 ${item.tone}`}>
                    <item.icon className="h-4 w-4" />
                  </div>
                </div>
                <div className="mt-3 text-3xl font-semibold tracking-tight text-slate-900">{item.value}</div>
              </div>
            ))}
          </div>

          {confidence ? (
            <>
              <div data-testid="dashboard-data-quality-breakdown" className="rounded-[24px] border border-slate-200 bg-slate-50 px-5 py-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <DataConfidenceBreakdown confidence={confidence} compact title="本月主要降分维度" />
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    data-testid="dashboard-data-quality-detail-trigger"
                    onClick={() => setConfidenceDialogOpen(true)}
                  >
                    查看详情
                  </Button>
                </div>
              </div>

              <Dialog open={confidenceDialogOpen} onOpenChange={setConfidenceDialogOpen}>
                <DialogContent
                  className="max-w-3xl"
                  data-testid="dashboard-data-quality-detail-dialog"
                  aria-describedby={undefined}
                >
                  <DialogHeader>
                    <DialogTitle>数据置信度维度分解</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <DataConfidenceBreakdown confidence={confidence} title="本月各维度降分贡献" />
                  </div>
                </DialogContent>
              </Dialog>
            </>
          ) : null}

          {governanceSignalSummary ? (
            <div
              data-testid="dashboard-governance-signal"
              className="rounded-[24px] border border-amber-200 bg-amber-50 px-5 py-5"
            >
              <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                <div className="space-y-2">
                  <span className="inline-flex items-center rounded-full bg-white px-3 py-1 text-xs font-semibold tracking-[0.12em] text-amber-800">
                    计划治理信号
                  </span>
                  <p className="text-sm leading-6 text-amber-950">{governanceSignalSummary}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    asChild
                    type="button"
                    variant="outline"
                    size="sm"
                    data-testid="dashboard-governance-open-monthly"
                    className="border-amber-300 bg-white text-amber-900 hover:bg-amber-100"
                  >
                    <Link to={monthlyPlanningLink}>进入月度计划</Link>
                  </Button>
                  <Button
                    asChild
                    type="button"
                    size="sm"
                    data-testid="dashboard-governance-open-closeout"
                    className="bg-amber-900 text-white hover:bg-amber-800"
                  >
                    <Link to={closeoutPlanningLink}>进入月末关账</Link>
                  </Button>
                </div>
              </div>
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <span className="badge-base bg-slate-100 text-slate-700">
              当前进度 {summaryData?.overallProgress ?? 0}%
            </span>
            <span className="badge-base bg-slate-100 text-slate-700">
              下一关键节点 {nextMilestone?.name || '暂无'}
            </span>
            <span className="badge-base bg-slate-100 text-slate-700">
              计划交付 {summaryData?.plannedEndDate || currentProject.planned_end_date || '--'}
            </span>
          </div>
        </div>
      </div>

      {summaryLoading && (
        <div className="border-t border-slate-100 bg-white px-6 py-3 text-xs text-slate-500">
        </div>
      )}
    </section>
  )
}
function WeeklyDigestPanel({ projectId }: { projectId: string }) {
  type DigestData = {
    id: string; project_id: string; week_start: string; generated_at: string
    overall_progress?: number | null; health_score?: number | null; progress_change?: number | null
    completed_tasks_count?: number | null; completed_milestones_count?: number | null
    critical_tasks_count?: number | null; critical_blocked_count?: number | null
    critical_nearest_milestone?: string | null; critical_nearest_delay_days?: number | null
    top_delayed_tasks?: Array<{ task_id: string; title: string; assignee?: string; delay_days: number }> | null
    abnormal_responsibilities?: Array<{ subject_id: string; name: string; type: string }> | null
    new_risks_count?: number | null; new_obstacles_count?: number | null; max_risk_level?: string | null
  }
  const [digest, setDigest] = useState<DigestData | null>(null)
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(true)

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

  if (loading) {
    return (
      <Card data-testid="dashboard-weekly-digest" className="card-l2 border-slate-100">
        <CardContent className="py-6">
          <LoadingState label="本周进度简报加载中" description="" className="min-h-24 border-0 bg-transparent px-0 py-0 shadow-none" />
        </CardContent>
      </Card>
    )
  }

  if (!digest) {
    return (
      <Card data-testid="dashboard-weekly-digest" className="card-l2 border-slate-100">
        <CardHeader className="pb-3">
          <CardTitle className="text-xl text-slate-900">本周进度简报</CardTitle>
        </CardHeader>
        <CardContent>
          <div
            data-testid="dashboard-critical-path-summary"
            className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-500"
          >
            周报将在每周一自动生成，当前暂无数据。
          </div>
        </CardContent>
      </Card>
    )
  }

  const genDate = digest.generated_at ? new Date(digest.generated_at).toLocaleDateString('zh-CN') : ''
  const progressChange = digest.progress_change
  const changeText = progressChange !== null && progressChange !== undefined
    ? `${progressChange >= 0 ? '+' : ''}${progressChange.toFixed(1)}%`
    : null
  const nearestDelayDays = typeof digest.critical_nearest_delay_days === 'number' ? digest.critical_nearest_delay_days : null
  const isSevereDelay = nearestDelayDays !== null && nearestDelayDays >= 20

  return (
    <Card data-testid="dashboard-weekly-digest" className="card-l2 border-slate-100">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-xl text-slate-900">本周进度简报</CardTitle>
          <Badge variant="secondary">{genDate} 生成</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 xl:grid-cols-3">
          <div className="rounded-xl bg-slate-50 p-4">
            <div className="text-xs font-medium text-slate-500">整体状态</div>
            <div className="mt-2 text-2xl font-semibold text-slate-900">
              {digest.overall_progress ?? '--'}%
              {changeText && <span className="ml-2 text-base font-normal text-emerald-600">({changeText})</span>}
            </div>
            <div className="mt-1 text-xs text-slate-500">健康度 {digest.health_score ?? '--'}</div>
          </div>
          <div className="rounded-xl bg-slate-50 p-4">
            <div className="text-xs font-medium text-slate-500">本周完成</div>
            <div className="mt-2 text-2xl font-semibold text-slate-900">{digest.completed_tasks_count ?? 0} 个任务</div>
            <div className="mt-1 text-xs text-slate-500">里程碑达成 {digest.completed_milestones_count ?? 0} 个</div>
          </div>
          <div data-testid="dashboard-critical-path-summary" className="rounded-xl bg-slate-50 p-4">
            <div className="text-xs font-medium text-slate-500">关键路径</div>
            <div className="mt-2 text-2xl font-semibold text-slate-900">关键任务 {digest.critical_tasks_count ?? 0} 个</div>
            <div className="mt-1 text-xs text-slate-500">
              <Link to={`/projects/${projectId}/gantt?filterCritical=true`} className="text-blue-600 hover:underline">受阻 {digest.critical_blocked_count ?? 0} 个</Link>
              {nearestDelayDays !== null ? (
                isSevereDelay ? (
                  <span className="ml-2 inline-flex rounded-full bg-red-50 px-2 py-0.5 text-red-700">
                    严重延期 +{nearestDelayDays} 天
                  </span>
                ) : (
                  <span className="ml-2 text-slate-500">最近节点偏差 +{nearestDelayDays} 天</span>
                )
              ) : null}
            </div>
          </div>
        </div>

        <button
          onClick={() => setExpanded(v => !v)}
          className="text-xs text-blue-600 hover:text-blue-800"
        >
          {expanded ? '收起' : '展开详情 ▾'}
        </button>

        {expanded && (
          <div className="space-y-4">
            <div className="grid gap-4 xl:grid-cols-2">
              <div>
                <div className="mb-2 text-xs font-medium text-slate-500">Top 5 偏差任务</div>
                {(digest.top_delayed_tasks || []).length === 0 ? (
                  <div className="text-xs text-slate-400">暂无偏差任务</div>
                ) : (
                  <ul className="space-y-1">
                    {(digest.top_delayed_tasks || []).map((t, i) => (
                      <li key={t.task_id} className="flex items-center gap-2 text-xs">
                        <span className="text-slate-400">{i + 1}.</span>
                        <Link to={`/projects/${projectId}/gantt?taskId=${t.task_id}`} className="text-blue-600 hover:underline">
                          {t.title}
                        </Link>
                        <span className="text-red-500">(+{t.delay_days}天)</span>
                        {t.assignee && <span className="text-slate-400">{t.assignee}</span>}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <div className="mb-2 text-xs font-medium text-slate-500">责任主体异常</div>
                {(digest.abnormal_responsibilities || []).length === 0 ? (
                  <div className="text-xs text-slate-400">暂无异常责任主体</div>
                ) : (
                  <ul className="space-y-1">
                    {(digest.abnormal_responsibilities || []).map(r => (
                      <Link key={r.subject_id} to={`/projects/${projectId}/responsibility`} className="block text-xs text-blue-600 hover:underline">
                        {r.name}（{r.type}）
                      </Link>
                    ))}
                  </ul>
                )}
              </div>
            </div>
            <div className="rounded-xl bg-slate-50 p-3 text-xs text-slate-600">
              本周新增风险 {digest.new_risks_count ?? 0} 条 / 阻碍 {digest.new_obstacles_count ?? 0} 条
              {digest.max_risk_level && <span className="ml-2 font-medium text-red-600">最高级别：{digest.max_risk_level}</span>}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
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
  const [tooltip, setTooltip] = useState<{ x: number; y: number; row: CombinedTrendRow } | null>(null)
  const monthlyLink = `/projects/${projectId}/planning/monthly`
  const closeoutLink = `/projects/${projectId}/tasks/closeout`

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

  const W = 560, H = 120, PL = 36, PR = 16, PT = 12, PB = 28
  const innerW = W - PL - PR
  const innerH = H - PT - PB

  const points = trendData.map((row, index) => {
    const x = PL + (trendData.length === 1 ? innerW / 2 : (index / (trendData.length - 1)) * innerW)
    const taskY = row.taskOnTimeRate !== null ? PT + innerH * (1 - row.taskOnTimeRate / 100) : null
    const fulfillmentY = row.fulfillmentRate !== null ? PT + innerH * (1 - row.fulfillmentRate / 100) : null
    return { x, taskY, fulfillmentY, row }
  })
  const taskPoints = points.filter((point) => point.taskY !== null) as Array<{ x: number; taskY: number; fulfillmentY: number | null; row: CombinedTrendRow }>
  const fulfillmentPoints = points.filter((point) => point.fulfillmentY !== null) as Array<{ x: number; taskY: number | null; fulfillmentY: number; row: CombinedTrendRow }>

  const monthLabel = (m: string) => {
    const [, mo] = m.split('-')
    return `${parseInt(mo)}月`
  }

  return (
    <Card data-testid="dashboard-monthly-trend" className="card-l2 border-slate-100">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-xl text-slate-900">月度趋势（近6个月）</CardTitle>
          <Badge variant="secondary">按时完成率 / 月计划兑现率</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex h-32 items-center justify-center text-sm text-slate-400">加载中…</div>
        ) : trendData.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-500">
            月度趋势将在任务完成后自动生成。
          </div>
        ) : (
          <div className="relative w-full overflow-hidden rounded-2xl border border-slate-100 bg-white p-3">
            <div className="mb-2 flex flex-wrap items-center gap-3 text-xs text-slate-500">
              <span className="inline-flex items-center gap-1">
                <span className="h-2.5 w-2.5 rounded-full bg-blue-500" />
                任务按时完成率
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                月计划兑现率
              </span>
            </div>
            <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: H }}>
              {[0, 0.25, 0.5, 0.75, 1].map(v => {
                const y = PT + innerH * (1 - v)
                return (
                  <g key={v}>
                    <line x1={PL} y1={y} x2={W - PR} y2={y} stroke="#e2e8f0" strokeWidth="1" strokeDasharray="3 3" />
                    <text x={PL - 4} y={y + 4} fontSize="9" fill="#94a3b8" textAnchor="end">{Math.round(v * 100)}%</text>
                  </g>
                )
              })}
              {taskPoints.length > 1 && (
                <polyline
                  points={taskPoints.map((point) => `${point.x},${point.taskY}`).join(' ')}
                  fill="none"
                  stroke="#3b82f6"
                  strokeWidth="2"
                  strokeLinejoin="round"
                />
              )}
              {fulfillmentPoints.length > 1 && (
                <polyline
                  points={fulfillmentPoints.map((point) => `${point.x},${point.fulfillmentY}`).join(' ')}
                  fill="none"
                  stroke="#10b981"
                  strokeWidth="2"
                  strokeLinejoin="round"
                />
              )}
              {points.map((p, i) => (
                <g key={i}>
                  <text x={p.x} y={H - 4} fontSize="9" fill="#94a3b8" textAnchor="middle">{monthLabel(p.row.month)}</text>
                  {p.taskY !== null && (
                    <circle
                      cx={p.x}
                      cy={p.taskY}
                      r={4}
                      fill="white"
                      stroke="#3b82f6"
                      strokeWidth="2"
                      onMouseEnter={(event) => {
                        const rect = (event.target as SVGCircleElement).closest('svg')!.getBoundingClientRect()
                        const taskY = p.taskY
                        if (taskY === null) return
                        setTooltip({ x: (p.x / W) * rect.width, y: (taskY / H) * rect.height, row: p.row })
                      }}
                      onMouseLeave={() => setTooltip(null)}
                      style={{ cursor: 'default' }}
                    />
                  )}
                  {p.fulfillmentY !== null && (
                    <circle
                      cx={p.x}
                      cy={p.fulfillmentY}
                      r={4}
                      fill="white"
                      stroke="#10b981"
                      strokeWidth="2"
                      onMouseEnter={(event) => {
                        const rect = (event.target as SVGCircleElement).closest('svg')!.getBoundingClientRect()
                        const fulfillmentY = p.fulfillmentY
                        if (fulfillmentY === null) return
                        setTooltip({ x: (p.x / W) * rect.width, y: (fulfillmentY / H) * rect.height, row: p.row })
                      }}
                      onMouseLeave={() => setTooltip(null)}
                      style={{ cursor: 'default' }}
                    />
                  )}
                </g>
              ))}
            </svg>
            {tooltip && (
              <div
                className="pointer-events-none absolute z-10 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-md"
                style={{ left: tooltip.x + 8, top: tooltip.y - 60 }}
              >
                <div className="font-medium text-slate-700">{tooltip.row.month}</div>
                <div className="text-slate-500">
                  任务完成 {tooltip.row.total} · 按时 {tooltip.row.on_time} · 延期 {tooltip.row.delayed}
                </div>
                <div className="font-semibold text-blue-600">
                  按时率 {tooltip.row.taskOnTimeRate ?? 0}%
                </div>
                <div className="font-semibold text-emerald-600">
                  月计划兑现率 {tooltip.row.fulfillmentRate ?? 0}%
                </div>
              </div>
            )}
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <Button asChild className="rounded-2xl">
            <Link data-testid="dashboard-open-monthly-plan" to={monthlyLink}>进入月度计划</Link>
          </Button>
          <Button asChild variant="outline" className="rounded-2xl border-slate-200 bg-white">
            <Link data-testid="dashboard-open-closeout" to={closeoutLink}>进入月末关账</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

// 问题与风险 2×2 语义色网格
function IssueRiskGrid({ summaryData, projectId }: { summaryData: ProjectSummary | null; projectId: string }) {
  const riskReportsHref = `/projects/${projectId}/reports?view=risk`
  const cells = [
    {
      label: '活跃风险数',
      value: summaryData?.activeRiskCount ?? 0,
      icon: Activity,
      bg: 'bg-purple-50',
      iconColor: 'text-purple-500',
      textColor: 'text-purple-700',
      badgeBg: 'bg-purple-100 text-purple-700',
      to: `/projects/${projectId}/risks`,
    },
    {
      label: '活跃问题数',
      value: summaryData?.activeIssueCount ?? 0,
      icon: AlertTriangle,
      bg: 'bg-red-50',
      iconColor: 'text-red-500',
      textColor: 'text-red-700',
      badgeBg: 'bg-red-100 text-red-700',
      to: `/projects/${projectId}/risks?tab=issues`,
    },
    {
      label: '活跃阻碍数',
      value: summaryData?.activeObstacleCount ?? 0,
      icon: ShieldAlert,
      bg: 'bg-orange-50',
      iconColor: 'text-orange-500',
      textColor: 'text-orange-700',
      badgeBg: 'bg-orange-100 text-orange-700',
      to: `/projects/${projectId}/gantt`,
    },
    {
      label: '待满足条件数',
      value: summaryData?.pendingConditionTaskCount ?? 0,
      icon: Flag,
      bg: 'bg-amber-50',
      iconColor: 'text-amber-500',
      textColor: 'text-amber-700',
      badgeBg: 'bg-amber-100 text-amber-700',
      to: `/projects/${projectId}/gantt`,
    },
  ]
  let totalSignals = 0
  for (const cell of cells) {
    totalSignals += Number(cell.value) || 0
  }

  return (
    <Card data-testid="dashboard-risk-snapshot" className="card-l2 border-slate-100">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-base text-slate-900">问题与风险快照</CardTitle>
          <div className="flex items-center gap-3">
            <Badge variant={totalSignals > 0 ? 'destructive' : 'secondary'}>
              {totalSignals > 0 ? `${totalSignals} 条需处理信号` : '当前无活跃信号'}
            </Badge>
            <Link
              data-testid="dashboard-risk-reports-link"
              to={riskReportsHref}
              className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 transition-colors hover:text-blue-800 hover:underline"
            >
              查看详细分析
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          {cells.map((cell) => (
            <Link
              key={cell.label}
              data-testid={cell.label === '活跃阻碍数' ? 'dashboard-open-gantt-quick-link' : undefined}
              to={cell.to}
              className={`rounded-2xl p-4 ${cell.bg} hover:opacity-90 transition-opacity`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-slate-600">{cell.label}</span>
                <cell.icon className={`h-4 w-4 ${cell.iconColor}`} />
              </div>
              <div className={`text-2xl font-bold ${cell.textColor}`}>{cell.value}</div>
              <span className={`mt-1 inline-block text-xs px-2 py-0.5 rounded-full ${cell.badgeBg}`}>
                {cell.value > 0 ? '需关注' : '正常'}
              </span>
            </Link>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

export default function Dashboard() {
  const { toast } = useToast()
  const navigate = useNavigate()
  const currentProject = useStore((state) => state.currentProject)
  const updateProject = useStore((state) => state.updateProject)
  const setCurrentProject = useStore((state) => state.setCurrentProject)
  const tasks = useStore((state) => state.tasks)
  const warnings = useStore((state) => state.warnings)
  const issueRows = useStore((state) => state.issueRows)
  const problemRows = useStore((state) => state.problemRows)
  const changeLogs = useStore((state) => state.changeLogs)
  const sharedSliceStatus = useStore((state) => state.sharedSliceStatus)
  const [summary, setSummary] = useState<ProjectSummary | null>(null)
  const [dataQualitySummary, setDataQualitySummary] = useState<DataQualityProjectSummary | null>(null)
  const [summaryLoading, setSummaryLoading] = useState(false)
  const [summaryError, setSummaryError] = useState<string | null>(null)
  const [scopeSections, setScopeSections] = useState<ScopeDimensionSection[]>([])
  const [scopeLoading, setScopeLoading] = useState(false)
  const [basicInfoSaving, setBasicInfoSaving] = useState(false)
  const [responsibilitySummary, setResponsibilitySummary] = useState<ResponsibilityInsightsResponse | null>(null)
  const [responsibilityLoading, setResponsibilityLoading] = useState(false)
  const summaryAbortRef = useRef<AbortController | null>(null)
  const dataQualityAbortRef = useRef<AbortController | null>(null)
  const responsibilityAbortRef = useRef<AbortController | null>(null)
  const projectId = currentProject?.id ?? ''

  const currentStatus = normalizeProjectStatus(currentProject?.status)
  const summaryData = summary
  const nextMilestone = summaryData?.nextMilestone ?? null
  const scopedTasks = useMemo(
    () => tasks.filter((task) => task.project_id === currentProject?.id),
    [currentProject?.id, tasks],
  )
  const recentScopedTasks = useMemo(
    () => scopedTasks.filter((task): task is typeof task & { id: string } => typeof task.id === 'string' && task.id.length > 0),
    [scopedTasks],
  )
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

  const loadResponsibilitySummary = useCallback(async (options?: { signal?: AbortSignal }) => {
    if (!projectId) {
      setResponsibilitySummary(null)
      return
    }

    if (!options?.signal) {
      responsibilityAbortRef.current?.abort()
      responsibilityAbortRef.current = new AbortController()
      options = { signal: responsibilityAbortRef.current.signal }
    }

    setResponsibilityLoading(true)
    try {
      const response = await apiGet<ResponsibilityInsightsResponse>(
        `/api/projects/${projectId}/responsibility`,
        { signal: options.signal },
      )
      if (!options.signal?.aborted) {
        setResponsibilitySummary(response ?? null)
      }
    } catch (error) {
      if (isAbortError(error)) return
      console.error('Failed to load responsibility summary:', error)
      setResponsibilitySummary(null)
    } finally {
      if (!options.signal?.aborted) {
        setResponsibilityLoading(false)
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

  const loadScopeSections = useCallback(async (options?: { signal?: AbortSignal }) => {
    if (!projectId) {
      setScopeSections([])
      return
    }

    if (!options?.signal) {
      options = {}
    }

    setScopeLoading(true)
    try {
      const response = await apiGet<{ project_id: string | null; sections: ScopeDimensionSection[] }>(
        `/api/scope-dimensions?projectId=${encodeURIComponent(projectId)}`,
        options.signal ? { signal: options.signal } : undefined,
      )
      if (!options.signal?.aborted) {
        setScopeSections(response.sections ?? [])
      }
    } catch (error) {
      if (isAbortError(error)) return
      console.error('Failed to load scope dimensions:', error)
      setScopeSections([])
      toast({
        title: '范围维度加载失败',
        description: getApiErrorMessage(error, '暂时无法加载楼栋、专业、阶段和区域配置。'),
        variant: 'destructive',
      })
    } finally {
      if (!options.signal?.aborted) {
        setScopeLoading(false)
      }
    }
  }, [projectId, toast])

  useEffect(() => {
    const controller = new AbortController()
    void loadSummary({ signal: controller.signal })

    return () => {
      controller.abort()
    }
  }, [loadSummary])

  useEffect(() => {
    const controller = new AbortController()
    void loadResponsibilitySummary({ signal: controller.signal })

    return () => {
      controller.abort()
    }
  }, [loadResponsibilitySummary])

  useEffect(() => {
    const controller = new AbortController()
    void loadDataQualitySummary({ signal: controller.signal })

    return () => {
      controller.abort()
    }
  }, [loadDataQualitySummary])

  useEffect(() => {
    const controller = new AbortController()
    void loadScopeSections({ signal: controller.signal })

    return () => {
      controller.abort()
    }
  }, [loadScopeSections])

  useEffect(() => {
    return () => {
      summaryAbortRef.current?.abort()
      dataQualityAbortRef.current?.abort()
      responsibilityAbortRef.current?.abort()
    }
  }, [])

  const handleSaveBasicInfo = useCallback(async (draft: ProjectBasicInfoDraft) => {
    if (!currentProject?.id) return

    setBasicInfoSaving(true)
    try {
      const updatedProject = await apiPut<Project>(`/api/projects/${currentProject.id}`, {
        name: draft.projectName.trim(),
        description: draft.projectDescription.trim() || null,
        location: draft.projectLocation.trim() || null,
        status: draft.projectStatus,
        current_phase: draft.projectPhase || null,
        planned_start_date: draft.plannedStartDate.trim() || null,
        planned_end_date: draft.plannedEndDate.trim() || null,
        actual_start_date: draft.actualStartDate.trim() || null,
        actual_end_date: draft.actualEndDate.trim() || null,
        version: currentProject.version ?? 1,
      })

      updateProject(currentProject.id, updatedProject)
      setCurrentProject(updatedProject)
      toast({
        title: '基础信息已更新',
        description: updatedProject.name || currentProject.name || '项目基础信息已保存',
      })
    } catch (error) {
      toast({
        title: '基础信息保存失败',
        description: getApiErrorMessage(error, '请稍后重试。'),
        variant: 'destructive',
      })
    } finally {
      setBasicInfoSaving(false)
    }
  }, [currentProject?.id, currentProject?.name, currentProject?.version, setCurrentProject, toast, updateProject])

  const unitProgressItems = useMemo<UnitProgress[]>(() => {
    const rows = responsibilitySummary?.unit_rows ?? []
    return rows.map((row) => {
      const taskCount = Number(row.total_tasks ?? 0)
      const completedTasks = Number(row.completed_count ?? 0)
      return {
        id: row.key,
        name: row.label,
        type: inferUnitType(row.label),
        progress: taskCount > 0 ? Math.round((completedTasks / taskCount) * 100) : 0,
        taskCount,
        completedTasks,
      }
    })
  }, [responsibilitySummary])

  const taskStatusSummary = useMemo(() => {
    const summary = { completed: 0, inProgress: 0, notStarted: 0, delayed: 0 }

    for (const task of scopedTasks) {
      const displayStatus = getTaskDisplayStatus(task)
      if (displayStatus === 'completed') summary.completed += 1
      else if (displayStatus === 'in_progress') summary.inProgress += 1
      else summary.notStarted += 1

      if (isDelayedTask(task)) summary.delayed += 1
    }

    return summary
  }, [scopedTasks])

  const todayKey = getCalendarDayKey(new Date())
  const todayDueTasks = useMemo(
    () =>
      scopedTasks
        .filter((task) => !isCompletedTask(task) && isSameCalendarDay(task.planned_end_date || task.end_date, todayKey))
        .sort((left, right) => String(left.planned_end_date || left.end_date || '').localeCompare(String(right.planned_end_date || right.end_date || '')))
        .slice(0, 4)
        .map<TodayLiveItem>((task) => ({
          id: String(task.id),
          title: task.title || task.name || '未命名任务',
          detail: `状态 ${getTaskDisplayStatus(task)} · 当前进度 ${task.progress ?? 0}%`,
          meta: `到期 ${formatLiveTaskDate(task.planned_end_date || task.end_date)}`,
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
          title: item.title,
          detail: item.description,
          meta: `${formatLiveTime(item.created_at)} · ${item.warning_level === 'critical' ? '严重' : item.warning_level === 'warning' ? '关注' : '提示'}`,
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
          title: `${item.entity_type} · ${item.field_name}`,
          detail: item.change_reason || '未填写变更原因',
          meta: formatLiveTime(item.changed_at),
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
          title: item.title,
          detail: item.description || (item.task_id ? `关联任务 ${item.task_id}` : '未填写备注'),
          meta: `${formatLiveTime(item.created_at)} · ${item.severity === 'critical' ? '严重' : item.severity === 'high' ? '高' : item.severity === 'low' ? '低' : '中'}`,
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
          title: item.title || item.description || '未命名问题',
          detail: item.description || (item.task_id ? `关联任务 ${item.task_id}` : '现场新增问题'),
          meta: `${formatLiveTime(item.created_at)} · ${item.severity || '待分级'}`,
        })),
    [liveProblems, todayKey],
  )
  const todayRiskAndProblemItems = useMemo(
    () => [...todayNewIssues, ...todayNewProblems].slice(0, 4),
    [todayNewIssues, todayNewProblems],
  )

  if (!currentProject) {
    return (
      <div className="space-y-6 p-6" data-testid="dashboard-empty-state">
        <EmptyState
          icon={Users}
          title="未选择项目"
          description={`请先进入一个项目，再查看项目 ${PROJECT_NAVIGATION_LABELS.dashboard}。`}
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
    <div data-testid="dashboard-page" className="page-enter space-y-6 bg-slate-50/80 p-6">
      <div className="mx-auto max-w-[1680px] space-y-6">
        <PageHeader
          eyebrow="项目工作台"
          title={currentProject.name || '项目'}
          subtitle=""
        >
          <Badge variant="secondary">{summaryData?.statusLabel || currentStatus}</Badge>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              void loadSummary()
              void loadResponsibilitySummary()
            }}
            loading={summaryLoading || responsibilityLoading}
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            刷新摘要
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link to="/company">
              <LayoutDashboard className="mr-2 h-4 w-4" />
              返回公司驾驶舱
            </Link>
          </Button>
        </PageHeader>

        <ProjectInfoCard
          projectName={currentProject.name || '项目'}
          projectDescription={currentProject.description}
          projectLocation={currentProject.location}
          projectType={currentProject.project_type}
          buildingType={currentProject.building_type}
          structureType={currentProject.structure_type}
          buildingCount={currentProject.building_count}
          aboveGroundFloors={currentProject.above_ground_floors}
          undergroundFloors={currentProject.underground_floors}
          supportMethod={currentProject.support_method}
          totalArea={currentProject.total_area}
          plannedStartDate={currentProject.planned_start_date}
          plannedEndDate={currentProject.planned_end_date}
          actualStartDate={currentProject.actual_start_date}
          actualEndDate={currentProject.actual_end_date}
          totalInvestment={currentProject.total_investment}
          healthScore={summaryData?.healthScore}
          healthStatus={summaryData?.healthStatus === '健康' ? 'excellent' : summaryData?.healthStatus === '亚健康' ? 'good' : summaryData?.healthStatus === '预警' ? 'warning' : summaryData?.healthStatus === '危险' ? 'critical' : undefined}
          status={currentProject.status}
          projectPhase={currentProject.current_phase}
          scopeSections={scopeSections}
          scopeLoading={scopeLoading}
          onSaveBasicInfo={handleSaveBasicInfo}
          basicInfoSaving={basicInfoSaving}
        />

        <DashboardHero
          currentProject={currentProject}
          currentStatus={currentStatus}
          summaryData={summaryData}
          dataQualitySummary={dataQualitySummary}
          nextMilestone={nextMilestone}
          summaryLoading={summaryLoading}
        />

        {summaryError && (
          <Alert variant="destructive">
            <AlertDescription>{summaryError}</AlertDescription>
          </Alert>
        )}

        <DashboardMonthlyTrend projectId={currentProject.id ?? ''} />

        <WeeklyDigestPanel projectId={currentProject.id ?? ''} />

        <section data-testid="dashboard-live-panel" className="space-y-6">
          <div className="space-y-4">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">今日现场</div>
              <h2 className="mt-2 text-[26px] font-semibold tracking-tight text-slate-900">当日摘要</h2>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
              <TodayLiveCard
                title="今日到期任务"
                count={todayDueTasks.length}
                hint="以计划完成日期（end_date）为准，未完成的当日任务"
                emptyLabel="今天没有到期任务。"
                loading={false}
                items={todayDueTasks}
              />
              <TodayLiveCard
                title="今日预警"
                count={todayWarnings.length}
                hint="今天触发且尚未确认的系统预警"
                emptyLabel="今天没有新增预警。"
                loading={livePanelLoading}
                items={todayWarnings}
              />
              <TodayLiveCard
                title="今日变更"
                count={todayChanges.length}
                hint="今天发生的计划、范围或执行变更"
                emptyLabel="今天没有新增变更。"
                loading={livePanelLoading}
                items={todayChanges}
              />
              <TodayLiveCard
                title="今日新增风险 / 问题"
                count={todayNewIssues.length + todayNewProblems.length}
                hint="今天进入跟踪链的新风险与问题"
                emptyLabel="今天没有新增风险或问题。"
                loading={livePanelLoading}
                items={todayRiskAndProblemItems}
              />
            </div>
          </div>
        </section>

        <section data-testid="dashboard-snapshot-panel" className="space-y-6">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">现场快照与对比</div>
            <h2 className="mt-2 text-[26px] font-semibold tracking-tight text-slate-900">现场快照与对比</h2>
          </div>

          {scopedTasks.length === 0 ? (
            <EmptyState
              icon={FolderKanban}
              title="还没有任务数据"
              description="先去任务列表创建第一个任务，再返回仪表盘查看现场摘要和趋势。"
              action={
                <Button asChild>
                  <Link data-testid="dashboard-open-gantt-quick-link" to={`/projects/${projectId}/gantt`}>前往任务列表</Link>
                </Button>
              }
              className="max-w-none"
            />
          ) : null}

          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
            <TaskStatusCard
              completed={taskStatusSummary.completed}
              inProgress={taskStatusSummary.inProgress}
              notStarted={taskStatusSummary.notStarted}
              delayed={taskStatusSummary.delayed}
              projectId={projectId}
            />
            <DashboardMilestoneCard
              completed={summaryData?.completedMilestones ?? 0}
              total={summaryData?.totalMilestones ?? 0}
              upcoming={summaryData?.shiftedMilestoneCount ?? 0}
              overdue={summaryData?.milestoneOverview?.stats?.overdue ?? 0}
              recentMilestones={
                summaryData?.nextMilestone
                  ? [
                      {
                        id: summaryData.nextMilestone.id,
                        name: summaryData.nextMilestone.name,
                        dueDate: summaryData.nextMilestone.targetDate,
                        status: summaryData.nextMilestone.daysRemaining < 0 ? 'delayed' : 'pending',
                        projectId,
                        assignee: scopedTasks.find((t) => t.milestone_id === summaryData.nextMilestone?.id)?.assignee_name || undefined,
                        relatedTasks: (() => {
                          let count = 0
                          for (const task of scopedTasks) {
                            if (task.milestone_id === summaryData.nextMilestone?.id) {
                              count += 1
                            }
                          }
                          return count || undefined
                        })(),
                        onTimeRate: summaryData.totalMilestones > 0 && summaryData.completedMilestones > 0
                          ? Math.round((summaryData.completedMilestones / summaryData.totalMilestones) * 100)
                          : undefined,
                      },
                    ]
                  : []
              }
            />
            {responsibilityLoading && unitProgressItems.length === 0 ? (
              <LoadingState label="责任单位加载中" className="min-h-[320px]" />
            ) : (
              <UnitProgressCard
                units={unitProgressItems}
                onViewAll={() => navigate(`/projects/${projectId}/responsibility?dimension=unit`)}
                maxItems={5}
              />
            )}
            <IssueRiskGrid summaryData={summaryData} projectId={projectId} />
            <RecentTasksCard projectId={projectId} tasks={recentScopedTasks} />
          </div>

          <DashboardCompareCard projectId={projectId} />
        </section>

        <div className="pb-2" />
      </div>
    </div>
  )
}
