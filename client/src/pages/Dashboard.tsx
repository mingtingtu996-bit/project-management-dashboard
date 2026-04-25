import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useRef } from 'react'

import DashboardCompareCard from '@/components/DashboardCompareCard'
import { DataConfidenceBreakdown } from '@/components/DataConfidenceBreakdown'
import DashboardMilestoneCard from '@/components/DashboardMilestoneCard'
import { EmptyState } from '@/components/EmptyState'
import { PageHeader } from '@/components/PageHeader'
import ProjectInfoCard, { type ScopeDimensionSection } from '@/components/ProjectInfoCard'
import RecentTasksCard from '@/components/RecentTasksCard'
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
import { apiGet, getApiErrorMessage, isAbortError } from '@/lib/apiClient'
import { getStatusTheme } from '@/lib/statusTheme'
import { getTaskDisplayStatus, isCompletedTask, isDelayedTask } from '@/lib/dashboardStatus'
import { USER_FACING_TERMS } from '@/lib/userFacingTerms'
import { DashboardApiService, type CriticalPathSummaryModel, type ProjectSummary } from '@/services/dashboardApi'
import { DataQualityApiService, type DataQualityProjectSummary } from '@/services/dataQualityApi'
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Building2,
  Calendar,
  ClipboardCheck,
  Flag,
  FolderKanban,
  LayoutDashboard,
  RefreshCw,
  ShieldAlert,
  Target,
  TimerReset,
  Users,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

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

type EntryItem = {
  label: string
  to: string
  icon: LucideIcon
  description: string
  testId?: string
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
  const closeoutPlanningLink = currentProject.id ? `/projects/${currentProject.id}/planning/closeout` : '/company'
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

function CriticalPathSummaryCard({
  summary,
}: {
  summary: CriticalPathSummaryModel | null
}) {
  const mostDangerousTask = summary
    ? [...(summary.snapshot.tasks ?? [])]
        .filter((t) => t.isAutoCritical)
        .sort((a, b) => a.floatDays - b.floatDays)[0] ?? null
    : null

  return (
    <Card data-testid="dashboard-critical-path-summary" className="card-l2 border-slate-100">
      <CardHeader className="pb-3">
        <CardTitle className="text-xl text-slate-900">关键路径摘要</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {summary ? (
          <>
            <div className="rounded-2xl bg-slate-50 p-4">
              <div className="text-xs text-slate-500">共享摘要口径</div>
              <div className="mt-2 text-sm leading-6 text-slate-700">{summary.summaryText || '暂无可用摘要'}</div>
            </div>
            {mostDangerousTask && (
              <div className="rounded-2xl border border-red-100 bg-red-50/60 p-3">
                <div className="text-xs text-red-500">最危险节点</div>
                <div className="mt-1 truncate font-medium text-red-800" title={mostDangerousTask.title}>{mostDangerousTask.title}</div>
                <div className="mt-0.5 text-xs text-red-600">浮动时间 {mostDangerousTask.floatDays} 天</div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl border border-slate-100 bg-white p-3">
                <div className="text-xs text-slate-500">{USER_FACING_TERMS.criticalPath}任务</div>
                <div className="mt-1 text-xl font-semibold text-slate-900">{summary.primaryTaskCount}</div>
              </div>
              <div className="rounded-2xl border border-slate-100 bg-white p-3">
                <div className="text-xs text-slate-500">备选链</div>
                <div className="mt-1 text-xl font-semibold text-slate-900">{summary.alternateChainCount}</div>
              </div>
              <div className="rounded-2xl border border-slate-100 bg-white p-3">
                <div className="text-xs text-slate-500">手动关注</div>
                <div className="mt-1 text-xl font-semibold text-slate-900">{summary.manualAttentionCount}</div>
                {summary.manualAttentionCount > 0 && (
                  <div className="mt-0.5 text-xs text-amber-600">管理关注项</div>
                )}
              </div>
              <div className="rounded-2xl border border-slate-100 bg-white p-3">
                <div className="text-xs text-slate-500">手动插链</div>
                <div className="mt-1 text-xl font-semibold text-slate-900">{summary.manualInsertedCount}</div>
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
    let cancelled = false
    setLoading(true)
    apiGet<DigestData | null>(`/api/projects/${projectId}/weekly-digest/latest`)
      .then((data) => { if (!cancelled) setDigest(normalizeWeeklyDigestData(data)) })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [projectId])

  if (loading) return null

  if (!digest) {
    return (
      <div data-testid="dashboard-weekly-digest" className="flex h-12 w-full items-center justify-center rounded-2xl border border-slate-100 bg-slate-50 text-sm text-slate-400">
      </div>
    )
  }

  const genDate = digest.generated_at ? new Date(digest.generated_at).toLocaleDateString('zh-CN') : ''
  const progressChange = digest.progress_change
  const changeText = progressChange !== null && progressChange !== undefined
    ? `${progressChange >= 0 ? '+' : ''}${progressChange.toFixed(1)}%`
    : null

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
          <div className="rounded-xl bg-slate-50 p-4">
            <div className="text-xs font-medium text-slate-500">关键路径</div>
            <div className="mt-2 text-2xl font-semibold text-slate-900">关键任务 {digest.critical_tasks_count ?? 0} 个</div>
            <div className="mt-1 text-xs text-slate-500">
              <Link to={`/projects/${projectId}/gantt?filterCritical=true`} className="text-blue-600 hover:underline">受阻 {digest.critical_blocked_count ?? 0} 个</Link>
              {digest.critical_nearest_delay_days ? `　最近节点偏差 +${digest.critical_nearest_delay_days} 天` : ''}
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
  const [trendData, setTrendData] = useState<Array<{ month: string; total: number; on_time: number; delayed: number }>>([])
  const [loading, setLoading] = useState(true)
  const [tooltip, setTooltip] = useState<{ x: number; y: number; d: { month: string; total: number; on_time: number; delayed: number } } | null>(null)
  const monthlyLink = `/projects/${projectId}/planning/monthly`
  const closeoutLink = `/projects/${projectId}/planning/closeout`

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    apiGet<Array<{ month: string; total: number; on_time: number; delayed: number }>>(
      `/api/task-summaries/projects/${projectId}/task-summary/trend`,
    )
      .then((data) => { if (!cancelled) setTrendData(normalizeTrendRows(data)) })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [projectId])

  const W = 560, H = 120, PL = 36, PR = 16, PT = 12, PB = 28
  const innerW = W - PL - PR
  const innerH = H - PT - PB

  const months = trendData.length > 0 ? trendData : []
  const points = months.map((d, i) => {
    const rate = d.total > 0 ? d.on_time / d.total : null
    const x = PL + (months.length === 1 ? innerW / 2 : (i / (months.length - 1)) * innerW)
    const y = rate !== null ? PT + innerH * (1 - rate) : null
    return { x, y, d, rate }
  })
  const validPoints = points.filter(p => p.y !== null) as typeof points & { y: number }[]

  const monthLabel = (m: string) => {
    const [, mo] = m.split('-')
    return `${parseInt(mo)}月`
  }

  return (
    <Card data-testid="dashboard-monthly-trend" className="card-l2 border-slate-100">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-xl text-slate-900">月度趋势（近6个月）</CardTitle>
          <Badge variant="secondary">按时完成率趋势</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex h-32 items-center justify-center text-sm text-slate-400">加载中…</div>
        ) : months.length === 0 ? (
          <div className="flex h-32 items-center justify-center text-sm text-slate-400" />
        ) : (
          <div className="relative w-full overflow-hidden">
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
              {validPoints.length > 1 && (
                <polyline
                  points={validPoints.map(p => `${p.x},${p.y}`).join(' ')}
                  fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinejoin="round"
                />
              )}
              {points.map((p, i) => (
                <g key={i}>
                  <text x={p.x} y={H - 4} fontSize="9" fill="#94a3b8" textAnchor="middle">{monthLabel(p.d.month)}</text>
                  {p.y !== null && (
                    <circle
                      cx={p.x} cy={p.y} r={4}
                      fill="white" stroke="#3b82f6" strokeWidth="2"
                      onMouseEnter={e => {
                        const rect = (e.target as SVGCircleElement).closest('svg')!.getBoundingClientRect()
                        setTooltip({ x: p.x / W * rect.width, y: (p.y as number) / H * rect.height, d: p.d })
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
                <div className="font-medium text-slate-700">{tooltip.d.month}</div>
                <div className="text-slate-500">总完成 {tooltip.d.total} · 按时 {tooltip.d.on_time} · 延期 {tooltip.d.delayed}</div>
                <div className="font-semibold text-blue-600">
                  按时率 {tooltip.d.total > 0 ? Math.round(tooltip.d.on_time / tooltip.d.total * 100) : 0}%
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
      value: summaryData?.delayedTaskCount ?? 0,
      icon: AlertTriangle,
      bg: 'bg-red-50',
      iconColor: 'text-red-500',
      textColor: 'text-red-700',
      badgeBg: 'bg-red-100 text-red-700',
      to: `/projects/${projectId}/gantt`,
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
  const totalSignals = cells.reduce((total, cell) => total + cell.value, 0)

  return (
    <Card data-testid="dashboard-risk-snapshot" className="card-l2 border-slate-100">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-base text-slate-900">问题与风险快照</CardTitle>
          <Badge variant={totalSignals > 0 ? 'destructive' : 'secondary'}>
            {totalSignals > 0 ? `${totalSignals} 条需处理信号` : '当前无活跃信号'}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          {cells.map((cell) => (
            <Link key={cell.label} to={cell.to} className={`rounded-2xl p-4 ${cell.bg} hover:opacity-90 transition-opacity`}>
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

function DashboardSupport({
  currentProject,
  currentStatus,
  summaryData,
  criticalPathSummary,
  specialtyItems,
  quickLinks,
}: {
  currentProject: CurrentProjectEntity
  currentStatus: ProjectStatus
  summaryData: ProjectSummary | null
  criticalPathSummary: CriticalPathSummaryModel | null
  specialtyItems: PrepItem[]
  quickLinks: EntryItem[]
}) {
  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.9fr)]">
      <div className="space-y-6">
        <CriticalPathSummaryCard summary={criticalPathSummary} />

        <Card className="card-l2 border-slate-100">
          <CardHeader className="pb-3">
            <CardTitle className="text-xl text-slate-900">专项准备度</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {specialtyItems.map((item) => (
              <div key={item.label} className="rounded-2xl bg-slate-50 p-4">
                <div className="text-sm text-slate-500">{item.label}</div>
                <div className="mt-2 text-2xl font-semibold text-slate-900">{item.value}</div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="space-y-6">
        <Card className="card-l2 border-slate-100">
          <CardHeader>
            <CardTitle className="text-xl text-slate-900">快捷入口</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {quickLinks.map((item) => (
              <Button
                key={item.label}
                asChild
                variant="outline"
                className="h-auto w-full justify-between rounded-2xl border-slate-200 bg-white px-4 py-4 text-left"
              >
                <Link data-testid={item.testId} to={item.to}>
                  <span className="flex items-center gap-3">
                    <span className="rounded-2xl bg-slate-100 p-2 text-slate-700">
                      <item.icon className="h-4 w-4" />
                    </span>
                    <span className="flex flex-col">
                      <span className="text-sm font-medium text-slate-900">{item.label}</span>
                    </span>
                  </span>
                  <ArrowRight className="h-4 w-4 text-slate-400" />
                </Link>
              </Button>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

export default function Dashboard() {
  const { toast } = useToast()
  const currentProject = useStore((state) => state.currentProject)
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
  const [criticalPathSummary, setCriticalPathSummary] = useState<CriticalPathSummaryModel | null>(null)
  const [criticalPathLoading, setCriticalPathLoading] = useState(false)
  const [scopeSections, setScopeSections] = useState<ScopeDimensionSection[]>([])
  const [scopeLoading, setScopeLoading] = useState(false)
  const summaryAbortRef = useRef<AbortController | null>(null)
  const dataQualityAbortRef = useRef<AbortController | null>(null)
  const criticalPathAbortRef = useRef<AbortController | null>(null)
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

  const loadCriticalPathSummary = useCallback(async (options?: { signal?: AbortSignal }) => {
    if (!projectId) {
      setCriticalPathSummary(null)
      return
    }

    if (!options?.signal) {
      criticalPathAbortRef.current?.abort()
      criticalPathAbortRef.current = new AbortController()
      options = { signal: criticalPathAbortRef.current.signal }
    }

    setCriticalPathLoading(true)
    try {
      const nextCriticalPath = await DashboardApiService.getProjectCriticalPathSummary(projectId, { signal: options.signal })
      if (!options.signal?.aborted) {
        setCriticalPathSummary(nextCriticalPath)
      }
    } catch (error) {
      if (isAbortError(error)) return

      console.error('Failed to load project critical path summary:', error)
      setCriticalPathSummary(null)
    } finally {
      if (!options.signal?.aborted) {
        setCriticalPathLoading(false)
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

  const loadScopeSections = useCallback(async () => {
    if (!projectId) {
      setScopeSections([])
      return
    }

    setScopeLoading(true)
    try {
      const response = await apiGet<{ project_id: string | null; sections: ScopeDimensionSection[] }>(
        `/api/scope-dimensions?projectId=${encodeURIComponent(projectId)}`,
      )
      setScopeSections(response.sections ?? [])
    } catch (error) {
      console.error('Failed to load scope dimensions:', error)
      setScopeSections([])
      toast({
        title: '范围维度加载失败',
        description: getApiErrorMessage(error, '暂时无法加载楼栋、专业、阶段和区域配置。'),
        variant: 'destructive',
      })
    } finally {
      setScopeLoading(false)
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
    void loadCriticalPathSummary({ signal: controller.signal })

    return () => {
      controller.abort()
    }
  }, [loadCriticalPathSummary])

  useEffect(() => {
    const controller = new AbortController()
    void loadDataQualitySummary({ signal: controller.signal })

    return () => {
      controller.abort()
    }
  }, [loadDataQualitySummary])

  useEffect(() => {
    void loadScopeSections()
  }, [loadScopeSections])

  useEffect(() => {
    return () => {
      summaryAbortRef.current?.abort()
      criticalPathAbortRef.current?.abort()
    }
  }, [])

  const specialtyItems: PrepItem[] = [
    {
      label: '证照事项',
      value: `${summaryData?.completedPreMilestoneCount ?? 0}/${summaryData?.preMilestoneCount ?? 0}`,
      hint: `进行中 ${summaryData?.activePreMilestoneCount ?? 0} · 延期 ${summaryData?.overduePreMilestoneCount ?? 0}`,
    },
    {
      label: '验收计划',
      value: `${summaryData?.passedAcceptancePlanCount ?? 0}/${summaryData?.acceptancePlanCount ?? 0}`,
      hint: `进行中 ${summaryData?.inProgressAcceptancePlanCount ?? 0} · 未通过 ${summaryData?.failedAcceptancePlanCount ?? 0}`,
    },
    {
      label: '施工图纸',
      value: `${summaryData?.issuedConstructionDrawingCount ?? 0}/${summaryData?.constructionDrawingCount ?? 0}`,
      hint: `审图中 ${summaryData?.reviewingConstructionDrawingCount ?? 0}`,
    },
  ]

  const quickLinks: EntryItem[] = [
    {
      label: '月度计划',
      to: `/projects/${currentProject?.id}/planning/monthly`,
      icon: Calendar,
      description: '查看当前月份月计划状态摘要',
      testId: 'dashboard-open-monthly-plan-quick-link',
    },
    {
      label: '月末关账',
      to: `/projects/${currentProject?.id}/planning/closeout`,
      icon: TimerReset,
      description: '查看月末待处理事项摘要与确认回写',
      testId: 'dashboard-open-closeout-quick-link',
    },
    {
      label: '任务管理',
      to: `/projects/${currentProject?.id}/gantt`,
      icon: FolderKanban,
      description: '查看关键路径、WBS 和进度拆解',
      testId: 'dashboard-open-gantt-quick-link',
    },
    {
      label: '风险与问题',
      to: `/projects/${currentProject?.id}/risks`,
      icon: AlertTriangle,
      description: '继续处理风险、问题和预警信号',
    },
    {
      label: '里程碑',
      to: `/projects/${currentProject?.id}/milestones`,
      icon: Flag,
      description: '查看关键节点与计划偏差',
    },
    {
      label: '专项管理',
      to: `/projects/${currentProject?.id}/pre-milestones`,
      icon: LayoutDashboard,
      description: '查看证照、验收和图纸准备度',
    },
    {
      label: '任务总结',
      to: `/projects/${currentProject?.id}/task-summary`,
      icon: Activity,
      description: '查看任务复盘与结果摘要',
    },
    {
      label: PROJECT_NAVIGATION_LABELS.responsibility,
      to: `/projects/${currentProject?.id}/responsibility?dimension=unit`,
      icon: Users,
      description: '按责任单位默认进入，查看责任主体异常、关注名单与恢复确认',
    },
    {
      label: PROJECT_NAVIGATION_LABELS.acceptance,
      to: `/projects/${currentProject?.id}/acceptance`,
      icon: ClipboardCheck,
      description: '查看验收流程轴、节点状态与依赖链路',
    },
    {
      label: PROJECT_NAVIGATION_LABELS.reports,
      to: `/projects/${currentProject?.id}/reports`,
      icon: BarChart3,
      description: '查看项目进度、风险、证照、验收和 WBS 分析页面',
      testId: 'dashboard-open-reports-quick-link',
    },
  ]

  const taskStatusSummary = useMemo(() => {
    return scopedTasks.reduce(
      (acc, task) => {
        const displayStatus = getTaskDisplayStatus(task)
        if (displayStatus === 'completed') acc.completed += 1
        else if (displayStatus === 'in_progress') acc.inProgress += 1
        else acc.notStarted += 1

        if (isDelayedTask(task)) acc.delayed += 1
        return acc
      },
      { completed: 0, inProgress: 0, notStarted: 0, delayed: 0 },
    )
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
              void loadCriticalPathSummary()
            }}
            loading={summaryLoading || criticalPathLoading}
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
          scopeSections={scopeSections}
          scopeLoading={scopeLoading}
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

        <section data-testid="dashboard-live-panel" className="space-y-4">
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

          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">现场指标</div>
          </div>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
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
              upcoming={0}
              overdue={0}
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
                        relatedTasks: scopedTasks.filter((t) => t.milestone_id === summaryData.nextMilestone?.id).length || undefined,
                        onTimeRate: summaryData.totalMilestones > 0 && summaryData.completedMilestones > 0
                          ? Math.round((summaryData.completedMilestones / summaryData.totalMilestones) * 100)
                          : undefined,
                      },
                    ]
                  : []
              }
            />
          </div>
        </section>

        <section className="space-y-4">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">当下优先级信号区</div>
            <h2 className="mt-2 text-[26px] font-semibold tracking-tight text-slate-900">导流与变化快照</h2>
          </div>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
            <IssueRiskGrid summaryData={summaryData} projectId={projectId} />
            <DashboardCompareCard projectId={projectId} />
          </div>

          <RecentTasksCard projectId={projectId} tasks={recentScopedTasks} />
        </section>

        <section data-testid="dashboard-snapshot-panel" className="space-y-6">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">导流快照</div>
            <h2 className="mt-2 text-[26px] font-semibold tracking-tight text-slate-900">项目导流面</h2>
          </div>
          <DashboardSupport
            currentProject={currentProject}
            currentStatus={currentStatus}
            summaryData={summaryData}
            criticalPathSummary={criticalPathSummary}
            specialtyItems={specialtyItems}
            quickLinks={quickLinks}
          />
        </section>

        <div className="pb-2" />
      </div>
    </div>
  )
}
