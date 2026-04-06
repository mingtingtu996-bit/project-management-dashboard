import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { useStore } from '@/hooks/useStore'
import { toast } from '@/hooks/use-toast'
import { apiDelete, apiGet, apiPost, getApiErrorMessage, isBackendUnavailableError } from '@/lib/apiClient'
import type { Project } from '@/lib/localDb'
import { syncProjectCacheFromApi } from '@/lib/projectPersistence'
import { DashboardApiService, type ProjectSummary } from '@/services/dashboardApi'
import type { Risk } from '@/lib/supabase'
import { CompanyHealthHeatmap } from '@/pages/CompanyCockpit/components/CompanyHealthHeatmap'
import { DeliveryCountdown } from '@/pages/CompanyCockpit/components/DeliveryCountdown'
import { MilestoneAchievementChart } from '@/pages/CompanyCockpit/components/MilestoneAchievementChart'
import { ProjectMatrixMap } from '@/pages/CompanyCockpit/components/ProjectMatrixMap'
import { ProjectRanking } from '@/pages/CompanyCockpit/components/ProjectRanking'
import { RiskBubbleMatrix } from '@/pages/CompanyCockpit/components/RiskBubbleMatrix'
import {
  Activity,
  AlertTriangle,
  Flag,
  FolderKanban,
  LayoutDashboard,
  Plus,
  RefreshCw,
  Target,
  TimerReset,
  Trash2,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

type HealthHistory = {
  thisMonth: number | null
  lastMonth: number | null
  change: number | null
  lastMonthPeriod?: string | null
}

type ProjectFormStatus = '未开始' | '进行中' | '已完成' | '已暂停'
type CockpitTab = 'all' | 'in_progress' | 'completed' | 'paused'

type ProjectRow = {
  project: Project
  summary: ProjectSummary | null
  summaryStatus: string
  healthScore: number
  attentionCount: number
  hasNextMilestone: boolean
  milestoneName: string
  milestoneDate: string | null
  milestoneDaysRemaining: number | null
  deliveryDaysRemaining: number | null
}

type HeroStatItem = {
  label: string
  value: string
  hint: string
  icon: LucideIcon
  tone: string
}

const DEFAULT_FORM = {
  name: '',
  description: '',
  status: '未开始' as ProjectFormStatus,
}

const STATUS_OPTIONS: ProjectFormStatus[] = ['未开始', '进行中', '已完成', '已暂停']

function CompanyCockpitSkeleton() {
  return (
    <div className="space-y-6">
      <div className="shell-surface overflow-hidden">
        <div className="grid gap-px bg-slate-100 xl:grid-cols-[minmax(0,1.58fr)_400px]">
          <div className="space-y-6 bg-white p-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div className="space-y-3">
                <Skeleton className="h-5 w-28 rounded-full" />
                <Skeleton className="h-10 w-56 rounded-2xl" />
                <Skeleton className="h-4 w-[420px] max-w-full rounded-full" />
              </div>
              <div className="flex gap-3">
                <Skeleton className="h-11 w-52 rounded-2xl" />
                <Skeleton className="h-11 w-28 rounded-2xl" />
                <Skeleton className="h-11 w-32 rounded-2xl" />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              {[1, 2, 3].map((item) => (
                <Card key={item} className="card-l2">
                  <CardContent className="space-y-4 p-6">
                    <div className="flex items-center justify-between">
                      <Skeleton className="h-4 w-24 rounded-full" />
                      <Skeleton className="h-10 w-10 rounded-2xl" />
                    </div>
                    <Skeleton className="h-10 w-20 rounded-full" />
                    <Skeleton className="h-4 w-32 rounded-full" />
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          <div className="space-y-4 bg-slate-950 p-6">
            <Skeleton className="h-5 w-24 rounded-full bg-slate-800" />
            <Skeleton className="h-10 w-44 rounded-2xl bg-slate-800" />
            <Skeleton className="h-4 w-full rounded-full bg-slate-800" />
            <div className="grid gap-3">
              {[1, 2, 3].map((item) => (
                <Skeleton key={item} className="h-20 rounded-3xl bg-slate-800" />
              ))}
            </div>
          </div>
        </div>
      </div>

      <Card className="card-l2">
        <CardContent className="space-y-5 p-6">
          <div className="flex items-center justify-between gap-3">
            <Skeleton className="h-6 w-32 rounded-full" />
            <Skeleton className="h-4 w-40 rounded-full" />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            {[1, 2, 3, 4].map((item) => (
              <div key={item} className="rounded-[24px] border border-slate-100 bg-slate-50 p-5">
                <Skeleton className="h-4 w-28 rounded-full" />
                <Skeleton className="mt-4 h-9 w-16 rounded-full" />
                <Skeleton className="mt-3 h-2 rounded-full" />
                <Skeleton className="mt-3 h-4 w-40 rounded-full" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="card-l2">
        <CardContent className="space-y-5 p-6">
          <div className="flex flex-wrap gap-3">
            {[1, 2, 3, 4].map((item) => (
              <Skeleton key={item} className="h-10 w-24 rounded-full" />
            ))}
          </div>
          <Skeleton className="h-56 w-full rounded-[28px]" />
          <Skeleton className="h-56 w-full rounded-[28px]" />
        </CardContent>
      </Card>
    </div>
  )
}

function normalizeProjectFallbackStatus(status?: string | null) {
  switch (status) {
    case 'active':
    case 'in_progress':
      return '进行中'
    case 'completed':
      return '已完成'
    case 'paused':
    case 'archived':
      return '已暂停'
    default:
      return '未开始'
  }
}

function normalizeStatusLabel(summary?: ProjectSummary | null, project?: Project | null) {
  return summary?.statusLabel || normalizeProjectFallbackStatus(project?.status)
}

function mapSummaryStatusToTab(status?: string) {
  switch (status) {
    case '进行中':
    case 'in_progress':
    case 'active':
      return 'in_progress'
    case '已完成':
    case 'completed':
      return 'completed'
    case '已暂停':
    case 'paused':
    case 'archived':
      return 'paused'
    default:
      return 'all'
  }
}

function statusBadgeClass(status?: string) {
  switch (status) {
    case '已完成':
    case 'completed':
      return 'bg-emerald-50 text-emerald-700'
    case '进行中':
    case 'in_progress':
    case 'active':
      return 'bg-blue-50 text-blue-700'
    case '已暂停':
    case 'paused':
    case 'archived':
      return 'bg-amber-50 text-amber-700'
    default:
      return 'bg-slate-100 text-slate-700'
  }
}

function healthBadgeClass(score: number) {
  if (score >= 80) return 'bg-emerald-50 text-emerald-700'
  if (score >= 60) return 'bg-blue-50 text-blue-700'
  if (score >= 40) return 'bg-amber-50 text-amber-700'
  return 'bg-red-50 text-red-700'
}

function progressBarClass(progress: number) {
  if (progress >= 80) return 'bg-emerald-500'
  if (progress >= 40) return 'bg-blue-500'
  if (progress > 0) return 'bg-amber-500'
  return 'bg-slate-300'
}

function attentionPressure(summary?: ProjectSummary | null) {
  if (!summary) return 0

  return (
    (summary.activeRiskCount ?? 0) * 2 +
    (summary.delayedTaskCount ?? 0) * 2 +
    (summary.activeObstacleTaskCount ?? 0) * 2 +
    (summary.pendingConditionTaskCount ?? 0)
  )
}

function timelineTone(daysRemaining: number | null) {
  if (daysRemaining === null) return 'bg-slate-100 text-slate-600'
  if (daysRemaining < 0) return 'bg-red-50 text-red-700'
  if (daysRemaining <= 14) return 'bg-amber-50 text-amber-700'
  return 'bg-emerald-50 text-emerald-700'
}

function formatDelta(change: number | null) {
  if (change === null) return '较上月暂无对比'
  return `较上月 ${change > 0 ? '+' : ''}${change} 分`
}

function formatTimelineLabel(daysRemaining: number | null, fallback = '待排期') {
  if (daysRemaining === null) return fallback
  if (daysRemaining < 0) return `延期 ${Math.abs(daysRemaining)} 天`
  return `剩余 ${daysRemaining} 天`
}

function formatDeliveryHint(summary?: ProjectSummary | null) {
  if (!summary?.plannedEndDate) return '未设置计划交付日期'
  if (summary.daysUntilPlannedEnd === null) return `计划交付 ${summary.plannedEndDate}`

  return summary.daysUntilPlannedEnd < 0
    ? `计划交付 ${summary.plannedEndDate} · 已延期 ${Math.abs(summary.daysUntilPlannedEnd)} 天`
    : `计划交付 ${summary.plannedEndDate} · 剩余 ${summary.daysUntilPlannedEnd} 天`
}

function buildAttentionSummary(summary?: ProjectSummary | null) {
  if (!summary) return '当前暂无共享摘要数据'

  const parts: string[] = []

  if ((summary.delayedTaskCount ?? 0) > 0) parts.push(`延期 ${summary.delayedTaskCount}`)
  if ((summary.activeRiskCount ?? 0) > 0) parts.push(`风险 ${summary.activeRiskCount}`)
  if ((summary.activeObstacleTaskCount ?? 0) > 0) parts.push(`阻碍 ${summary.activeObstacleTaskCount}`)
  if ((summary.pendingConditionTaskCount ?? 0) > 0) parts.push(`条件未满足 ${summary.pendingConditionTaskCount}`)

  return parts.length > 0 ? parts.join(' · ') : '当前主链推进平稳'
}

function projectAvatarLabel(name: string) {
  const compact = name.trim().replace(/\s+/g, '')
  return compact.slice(0, Math.min(2, compact.length)) || '项目'
}

function CompanyHero({
  search,
  onSearchChange,
  onRefresh,
  onCreate,
  error,
  heroStats,
  healthHistory,
  stats,
  focusProjects,
  onNavigate,
}: {
  search: string
  onSearchChange: (value: string) => void
  onRefresh: () => void
  onCreate: () => void
  error: string | null
  heroStats: HeroStatItem[]
  healthHistory: HealthHistory
  stats: {
    inProgress: number
    completed: number
    attentionProjects: number
  }
  focusProjects: ProjectRow[]
  onNavigate: (path: string) => void
}) {
  const focusProject = focusProjects[0]

  return (
    <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px] xl:items-start">
      <div className="shell-surface px-6 py-6">
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
            <div className="space-y-3">
              <div>
                <h1 className="shell-section-title">公司驾驶舱</h1>
                <p className="shell-subtitle max-w-3xl">
                  聚合项目进展、关键风险、里程碑与专项准备度，先看最需要处理的事项，再进入具体项目推进。
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <Input
                value={search}
                onChange={(event) => onSearchChange(event.target.value)}
                placeholder="搜索项目"
                className="h-11 w-full rounded-2xl border-slate-200 bg-white sm:w-72"
              />
              <Button
                variant="outline"
                onClick={onRefresh}
                className="h-11 gap-2 rounded-2xl border-slate-200 bg-white px-5"
              >
                <RefreshCw className="h-4 w-4" />
                刷新
              </Button>
              <Button onClick={onCreate} className="h-11 gap-2 rounded-2xl px-5">
                <Plus className="h-4 w-4" />
                新建项目
              </Button>
            </div>
          </div>

          {error ? (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          <div className="grid gap-4 md:grid-cols-3">
            {heroStats.map((item) => (
              <Card key={item.label} className="card-l2 border-slate-100">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between gap-4">
                    <div className="text-sm text-slate-500">{item.label}</div>
                    <div className={`rounded-2xl p-2.5 ${item.tone}`}>
                      <item.icon className="h-5 w-5" />
                    </div>
                  </div>
                  <div className="mt-3 text-4xl font-semibold tracking-tight text-slate-900">{item.value}</div>
                  <p className="mt-2 text-xs text-slate-500">{item.hint}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>

      <Card className="card-l2 border-slate-100">
        <CardContent className="space-y-5 p-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="badge-base bg-amber-50 text-amber-700">当前优先关注</div>
              <h2 className="mt-3 text-xl font-semibold tracking-tight text-slate-900">先处理一项最紧的，再进入项目推进</h2>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                先看公司层面最需要协调的项目，再结合健康变化和推进状态做判断。
              </p>
            </div>
            <div className="rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-xs text-slate-500">
              按关注压力与时间窗口排序
            </div>
          </div>

          {focusProject ? (
            <div className="rounded-[26px] border border-amber-100 bg-amber-50/60 p-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="text-lg font-semibold text-slate-900">{focusProject.project.name}</div>
                    <span className={`badge-base ${healthBadgeClass(focusProject.healthScore)}`}>
                      健康 {focusProject.healthScore}
                    </span>
                    <span
                      className={`badge-base ${
                        focusProject.attentionCount > 0 ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'
                      }`}
                    >
                      {focusProject.attentionCount > 0 ? `${focusProject.attentionCount} 项关注` : '当前平稳'}
                    </span>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-slate-600">{buildAttentionSummary(focusProject.summary)}</p>
                  <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                    <span>下一关键节点：{focusProject.milestoneName}</span>
                    <span>{formatTimelineLabel(focusProject.milestoneDaysRemaining ?? focusProject.deliveryDaysRemaining, '待排期')}</span>
                    <span>{formatDeliveryHint(focusProject.summary)}</span>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button asChild className="h-10 gap-2 rounded-2xl px-4">
                    <Link to={`/projects/${focusProject.project.id}/dashboard`}>
                      <LayoutDashboard className="h-4 w-4" />
                      进入项目
                    </Link>
                  </Button>
                  <Button asChild variant="outline" className="h-10 gap-2 rounded-2xl border-slate-200 bg-white px-4">
                    <Link to={`/projects/${focusProject.project.id}/risks`}>
                      <AlertTriangle className="h-4 w-4" />
                      风险与问题
                    </Link>
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-[26px] border border-dashed border-slate-200 bg-slate-50 px-5 py-10 text-center text-sm text-slate-500">
              当前筛选范围内没有需要优先跟进的项目。
            </div>
          )}

          <div className="grid gap-3 border-t border-slate-100 pt-4 sm:grid-cols-3">
            <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-4">
              <div className="text-xs text-slate-500">本月健康均值</div>
              <div className="mt-2 text-2xl font-semibold text-slate-900">{healthHistory.thisMonth ?? heroStats[2]?.value ?? '0'}</div>
              <p className="mt-2 text-xs text-slate-500">{formatDelta(healthHistory.change)}</p>
            </div>
            <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-4">
              <div className="text-xs text-slate-500">需关注项目</div>
              <div className="mt-2 text-2xl font-semibold text-slate-900">{stats.attentionProjects}</div>
              <p className="mt-2 text-xs text-slate-500">公司层面需先协调的项目数量</p>
            </div>
            <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-4">
              <div className="text-xs text-slate-500">当前推进状态</div>
              <div className="mt-2 text-2xl font-semibold text-slate-900">
                {stats.inProgress}/{stats.inProgress + stats.completed}
              </div>
              <p className="mt-2 text-xs text-slate-500">进行中 {stats.inProgress} · 已完成 {stats.completed}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </section>
  )
}

function CompanyInsightSection({
  projectRows,
  healthHistory,
  stats,
  companyRisks,
  onNavigate,
}: {
  projectRows: ProjectRow[]
  healthHistory: HealthHistory
  stats: {
    total: number
    inProgress: number
    completed: number
    paused: number
    averageHealth: number
    averageProgress: number
    attentionProjects: number
  }
  companyRisks: Risk[]
  onNavigate: (path: string) => void
}) {
  const milestoneChartProjects = projectRows.map((row) => ({
    id: row.project.id,
    name: row.project.name,
    milestoneProgress: row.summary?.milestoneProgress ?? 0,
  }))
  const healthHeatmapItems = projectRows.map((row) => ({
    id: row.project.id,
    name: row.project.name,
    healthScore: row.healthScore,
    progress: row.summary?.overallProgress ?? 0,
    attentionCount: row.attentionCount,
    statusLabel: row.summaryStatus,
  }))
  const projectMatrixItems = projectRows.map((row) => ({
    id: row.project.id,
    name: row.project.name,
    healthScore: row.healthScore,
    progress: row.summary?.overallProgress ?? 0,
    attentionCount: row.attentionCount,
  }))

  const priorityRows = [...projectRows]
    .sort((left, right) => {
      if (right.attentionCount !== left.attentionCount) return right.attentionCount - left.attentionCount
      const leftDays = left.milestoneDaysRemaining ?? left.deliveryDaysRemaining ?? 9999
      const rightDays = right.milestoneDaysRemaining ?? right.deliveryDaysRemaining ?? 9999
      return leftDays - rightDays
    })
    .slice(0, 5)

  const deliveryRows = [...projectRows]
    .filter((row) => row.deliveryDaysRemaining !== null || row.milestoneDaysRemaining !== null)
    .sort((left, right) => {
      const leftDays = left.deliveryDaysRemaining ?? left.milestoneDaysRemaining ?? 9999
      const rightDays = right.deliveryDaysRemaining ?? right.milestoneDaysRemaining ?? 9999
      return leftDays - rightDays
    })
    .slice(0, 4)

  return (
    <section className="shell-surface overflow-hidden">
      <div className="border-b border-slate-100 px-6 py-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-2">
            <div className="badge-base bg-slate-100 text-slate-600">公司洞察</div>
            <div>
              <h2 className="text-2xl font-semibold tracking-tight text-slate-900">公司关注与趋势</h2>
              <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">
                集中查看健康趋势、优先跟进项目、交付窗口和风险分布，帮助公司层面快速判断重点。
              </p>
            </div>
          </div>
          <div className="text-xs text-slate-500">
            当前总览 {stats.total} 个项目，聚焦 {stats.attentionProjects} 个关注项
          </div>
        </div>
      </div>

      <div className="grid gap-5 p-6 xl:grid-cols-[minmax(0,1.08fr)_minmax(0,0.92fr)] xl:items-start">
        <div className="space-y-5">
          <div className="rounded-[24px] border border-slate-100 bg-slate-50 px-5 py-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-medium text-slate-900">趋势总览</div>
                <p className="mt-1 text-xs text-slate-500">先看健康变化，再看推进状态、交付压力和风险分布。</p>
              </div>
              <div className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-500">
                共览 {stats.total} 个项目
              </div>
            </div>

            <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1.12fr)_minmax(0,0.88fr)]">
              <div className="rounded-2xl border border-white bg-white px-4 py-4">
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span>本月健康均值</span>
                  <span>{healthHistory.change !== null ? formatDelta(healthHistory.change) : '暂无对比'}</span>
                </div>
                <div className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">
                  {healthHistory.thisMonth ?? stats.averageHealth}
                </div>
                <div className="mt-3 h-2 rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-emerald-500"
                    style={{ width: `${healthHistory.thisMonth ?? stats.averageHealth}%` }}
                  />
                </div>
                <p className="mt-3 text-xs text-slate-500">
                  {healthHistory.lastMonthPeriod ? `对比 ${healthHistory.lastMonthPeriod}` : '暂无历史对比'}
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border border-white bg-white px-4 py-4">
                    <div className="text-xs text-slate-500">需关注项目</div>
                    <div className="mt-2 text-2xl font-semibold text-slate-900">{stats.attentionProjects}</div>
                  </div>
                  <div className="rounded-2xl border border-white bg-white px-4 py-4">
                    <div className="text-xs text-slate-500">临近交付</div>
                    <div className="mt-2 text-2xl font-semibold text-slate-900">{deliveryRows.length}</div>
                  </div>
                  <div className="rounded-2xl border border-white bg-white px-4 py-4">
                    <div className="text-xs text-slate-500">进行中</div>
                    <div className="mt-2 text-2xl font-semibold text-slate-900">{stats.inProgress}</div>
                  </div>
                  <div className="rounded-2xl border border-white bg-white px-4 py-4">
                    <div className="text-xs text-slate-500">风险事项</div>
                    <div className="mt-2 text-2xl font-semibold text-slate-900">{companyRisks.length}</div>
                  </div>
                </div>
              </div>
          </div>

          <CompanyHealthHeatmap items={healthHeatmapItems} />
          <MilestoneAchievementChart projects={milestoneChartProjects} />
        </div>

        <div className="space-y-5">
          <div className="rounded-[24px] border border-slate-100 bg-slate-50 px-5 py-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-medium text-slate-900">优先跟进清单</div>
                <p className="mt-1 text-xs text-slate-500">把真正需要处理的项目集中到一处，不再拆成多种重复排行。</p>
              </div>
              <div className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-500">
                关注 {stats.attentionProjects}
              </div>
            </div>
            <div className="mt-4 space-y-3">
              {priorityRows.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-6 text-center text-sm text-slate-500">
                  当前没有需要重点跟进的项目
                </div>
              ) : (
                priorityRows.map((row) => (
                  <button
                    key={row.project.id}
                    onClick={() => onNavigate(`/projects/${row.project.id}/dashboard`)}
                    className="w-full rounded-2xl border border-white bg-white px-4 py-4 text-left transition hover:border-amber-200 hover:bg-amber-50/40"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="truncate text-sm font-semibold text-slate-900">{row.project.name}</div>
                          <span className={`badge-base ${healthBadgeClass(row.healthScore)}`}>健康 {row.healthScore}</span>
                        </div>
                        <div className="mt-2 text-xs text-slate-500">{buildAttentionSummary(row.summary)}</div>
                        <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                          <span>{row.milestoneName}</span>
                          <span>{formatTimelineLabel(row.milestoneDaysRemaining ?? row.deliveryDaysRemaining, '待排期')}</span>
                        </div>
                      </div>
                      <span className={`badge-base ${row.attentionCount > 0 ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'}`}>
                        {row.attentionCount > 0 ? `压力 ${row.attentionCount}` : '平稳'}
                      </span>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>

          <ProjectMatrixMap items={projectMatrixItems} />

          <div className="rounded-[24px] border border-slate-100 bg-slate-50 px-5 py-5">
            <div className="text-sm font-medium text-slate-900">交付窗口</div>
            <p className="mt-1 text-xs text-slate-500">把临近交付的项目单独收口，方便判断是否要从公司层面提前协调。</p>
            <div className="mt-4 space-y-3">
              {deliveryRows.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-6 text-center text-sm text-slate-500">
                  暂无临近交付项目
                </div>
              ) : (
                deliveryRows.map((row) => (
                  <button
                    key={row.project.id}
                    onClick={() => onNavigate(`/projects/${row.project.id}/dashboard`)}
                    className="w-full rounded-2xl border border-white bg-white px-4 py-4 text-left transition hover:border-slate-200 hover:bg-slate-50"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="truncate text-sm font-semibold text-slate-900">{row.project.name}</div>
                      <span className={`badge-base ${timelineTone(row.deliveryDaysRemaining ?? row.milestoneDaysRemaining)}`}>
                        {formatTimelineLabel(row.deliveryDaysRemaining ?? row.milestoneDaysRemaining)}
                      </span>
                    </div>
                    <div className="mt-2 text-xs text-slate-500">{formatDeliveryHint(row.summary)}</div>
                  </button>
                ))
              )}
            </div>
          </div>

          <RiskBubbleMatrix risks={companyRisks} />
        </div>
      </div>
    </section>
  )
}

function ProjectOverviewSection({
  projectRows,
  totalProjects,
  activeTab,
  tabItems,
  onTabChange,
  onCreate,
  onDelete,
  onNavigate,
}: {
  projectRows: ProjectRow[]
  totalProjects: number
  activeTab: CockpitTab
  tabItems: Array<{ key: CockpitTab; label: string; count: number }>
  onTabChange: (tab: CockpitTab) => void
  onCreate: () => void
  onDelete: (project: Project) => void
  onNavigate: (path: string) => void
}) {
  return (
    <Card className="card-l2 border-slate-100">
      <CardHeader className="space-y-4 pb-0">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <CardTitle className="text-2xl font-semibold tracking-tight text-slate-900">项目概览</CardTitle>
            <p className="mt-1 text-sm text-slate-500">
              从公司层面查看各项目的进度、专项推进、关键节点和常用入口。
            </p>
          </div>
          <div className="rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-xs text-slate-500">
            {projectRows.length === totalProjects ? `共 ${totalProjects} 个项目` : `当前筛出 ${projectRows.length} / ${totalProjects} 个项目`}
          </div>
        </div>

        <div className="flex flex-col gap-4 border-b border-slate-100 pb-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            {tabItems.map((tab) => (
              <button
                key={tab.key}
                onClick={() => onTabChange(tab.key)}
                className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                  activeTab === tab.key
                    ? 'bg-slate-950 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900'
                }`}
              >
                <span>{tab.label}</span>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs ${
                    activeTab === tab.key ? 'bg-white/15 text-white' : 'bg-white text-slate-500'
                  }`}
                >
                  {tab.count}
                </span>
              </button>
            ))}
          </div>

          <div className="text-xs text-slate-500">按项目状态快速切换</div>
        </div>
      </CardHeader>

      <CardContent className="pt-6">
        {projectRows.length === 0 ? (
          <div className="rounded-[28px] border border-slate-100 bg-white px-8 py-20 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 mb-4">
              <FolderKanban className="h-6 w-6 text-slate-500" />
            </div>
            <p className="text-base font-semibold text-slate-900 mb-1">暂无项目</p>
            <p className="text-sm text-slate-500 mb-5">先创建一个项目，再从公司视角查看主链推进、专项进展和关键节点。</p>
            <Button onClick={onCreate} className="gap-2 rounded-2xl px-5">
              <Plus className="h-4 w-4" />
              创建项目
            </Button>
          </div>
        ) : (
          <div className="grid gap-5 xl:grid-cols-2">
            {projectRows.map((row) => {
              const { project, summary, summaryStatus } = row

              return (
                <div
                  key={project.id}
                  className="rounded-[28px] border border-slate-100 bg-white p-6 shadow-[0_12px_32px_rgba(15,23,42,0.06)]"
                >
                  <div className="flex flex-col gap-5">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex min-w-0 gap-4">
                        <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-slate-950 text-sm font-semibold text-white">
                          {projectAvatarLabel(project.name)}
                        </div>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="truncate text-lg font-semibold text-slate-900">{project.name}</h3>
                            <span className={`badge-base ${statusBadgeClass(summaryStatus)}`}>{summaryStatus}</span>
                            <span className={`badge-base ${healthBadgeClass(row.healthScore)}`}>健康 {row.healthScore}</span>
                            {row.attentionCount > 0 ? (
                              <span className="badge-base bg-amber-50 text-amber-700">关注 {row.attentionCount}</span>
                            ) : null}
                          </div>
                          <p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-500">
                            {project.description || '暂无项目描述'}
                          </p>
                          <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                            <span>{formatDeliveryHint(summary)}</span>
                            <span>当前关注：{buildAttentionSummary(summary)}</span>
                          </div>
                        </div>
                      </div>

                      <Button
                        variant="ghost"
                        size="icon"
                        className="flex-shrink-0"
                        onClick={() => onDelete(project)}
                        title="删除项目"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>

                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                      <div className="rounded-2xl bg-slate-50 px-4 py-4">
                        <div className="text-xs text-slate-500">总体进度</div>
                        <div className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">
                          {summary?.overallProgress ?? 0}%
                        </div>
                        <div className="mt-3 h-2 rounded-full bg-slate-200">
                          <div
                            className={`h-full rounded-full ${progressBarClass(summary?.overallProgress ?? 0)}`}
                            style={{ width: `${summary?.overallProgress ?? 0}%` }}
                          />
                        </div>
                      </div>

                      <div className="rounded-2xl bg-slate-50 px-4 py-4">
                        <div className="text-xs text-slate-500">交付窗口</div>
                        <div className={`mt-2 inline-flex rounded-full px-3 py-1 text-xs font-medium ${timelineTone(row.deliveryDaysRemaining)}`}>
                          {formatTimelineLabel(row.deliveryDaysRemaining, '待排期')}
                        </div>
                        <p className="mt-3 text-xs text-slate-500">{formatDeliveryHint(summary)}</p>
                      </div>

                      <div className="rounded-2xl bg-slate-50 px-4 py-4">
                        <div className="text-xs text-slate-500">专项进展</div>
                        <div className="mt-2 space-y-2 text-xs text-slate-500">
                          <div className="flex items-center justify-between rounded-xl bg-white px-3 py-2">
                            <span>证照</span>
                            <span className="font-semibold text-slate-900">
                              {summary?.approvedLicenseCount ?? 0}/{summary?.licenseCount ?? 0}
                            </span>
                          </div>
                          <div className="flex items-center justify-between rounded-xl bg-white px-3 py-2">
                            <span>验收</span>
                            <span className="font-semibold text-slate-900">
                              {summary?.passedAcceptancePlanCount ?? 0}/{summary?.acceptancePlanCount ?? 0}
                            </span>
                          </div>
                          <div className="flex items-center justify-between rounded-xl bg-white px-3 py-2">
                            <span>图纸</span>
                            <span className="font-semibold text-slate-900">
                              {summary?.issuedConstructionDrawingCount ?? 0}/{summary?.constructionDrawingCount ?? 0}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="rounded-2xl bg-slate-50 px-4 py-4">
                        <div className="text-xs text-slate-500">下一个关键节点</div>
                        <div className="mt-2 text-sm font-semibold text-slate-900">{row.milestoneName}</div>
                        <p className="mt-3 text-xs text-slate-500">
                          {row.milestoneDate
                            ? `计划 ${row.milestoneDate} · ${formatTimelineLabel(row.milestoneDaysRemaining)}`
                            : '当前没有已识别的下一关键节点。'}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Button asChild className="h-11 gap-2 rounded-2xl px-5">
                        <Link to={`/projects/${project.id}/dashboard`}>
                          <LayoutDashboard className="h-4 w-4" />
                          进入项目
                        </Link>
                      </Button>
                      <Button asChild variant="outline" className="h-11 gap-2 rounded-2xl border-slate-200 bg-white px-5">
                        <Link to={`/projects/${project.id}/risks`}>
                          <AlertTriangle className="h-4 w-4" />
                          风险与问题
                        </Link>
                      </Button>
                      <Button asChild variant="outline" className="h-11 gap-2 rounded-2xl border-slate-200 bg-white px-5">
                        <Link to={`/projects/${project.id}/milestones`}>
                          <Flag className="h-4 w-4" />
                          里程碑
                        </Link>
                      </Button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function MilestoneSummarySection({
  milestoneRows,
  onNavigate,
}: {
  milestoneRows: ProjectRow[]
  onNavigate: (path: string) => void
}) {
  return (
    <Card className="card-l2 border-slate-100">
      <CardHeader className="pb-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-2xl text-slate-900">
              <Flag className="h-5 w-5 text-slate-700" />
              里程碑汇总
            </CardTitle>
            <p className="mt-1 text-sm text-slate-500">跨项目汇总关键里程碑，优先查看临期和已偏差的节点。</p>
          </div>
          <div className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm text-slate-500">
            共 {milestoneRows.length} 个里程碑
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {milestoneRows.length === 0 ? (
          <div className="rounded-[24px] border border-slate-100 bg-slate-50 px-8 py-16 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-white shadow-sm">
              <Flag className="h-5 w-5 text-emerald-500" />
            </div>
            <div className="mt-4 text-lg font-semibold text-slate-900">暂无里程碑数据</div>
            <div className="mt-2 text-sm text-slate-500">项目推进后，这里会汇总各项目的关键节点进展。</div>
          </div>
        ) : (
          <div className="grid gap-3 xl:grid-cols-2">
            {milestoneRows.map((row) => (
              <button
                key={row.project.id}
                onClick={() => onNavigate(`/projects/${row.project.id}/milestones`)}
                className="flex items-start justify-between gap-4 rounded-[22px] border border-slate-100 bg-white px-5 py-4 text-left shadow-[0_6px_24px_rgba(15,23,42,0.04)] transition hover:border-blue-200 hover:bg-blue-50/30"
              >
                <div className="min-w-0">
                  <div className="text-base font-semibold text-slate-900">{row.project.name}</div>
                  <div className="mt-1 text-sm text-slate-500">{row.milestoneName}</div>
                  <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                    <span>里程碑进度 {row.summary?.milestoneProgress ?? 0}%</span>
                    <span>待完成 {(row.summary?.totalMilestones ?? 0) - (row.summary?.completedMilestones ?? 0)}</span>
                    {row.milestoneDate ? <span>计划 {row.milestoneDate}</span> : null}
                  </div>
                </div>
                <span className={`badge-base ${timelineTone(row.milestoneDaysRemaining)}`}>
                  {formatTimelineLabel(row.milestoneDaysRemaining)}
                </span>
              </button>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function CompanyCockpitDialogs({
  dialogOpen,
  onDialogChange,
  form,
  onFormChange,
  submitting,
  onCreate,
  deleteTarget,
  onDeleteTargetChange,
  onDelete,
}: {
  dialogOpen: boolean
  onDialogChange: (open: boolean) => void
  form: { name: string; description: string; status: ProjectFormStatus }
  onFormChange: (next: { name: string; description: string; status: ProjectFormStatus }) => void
  submitting: boolean
  onCreate: () => void
  deleteTarget: Project | null
  onDeleteTargetChange: (project: Project | null) => void
  onDelete: () => void
}) {
  return (
    <>
      <Dialog open={dialogOpen} onOpenChange={onDialogChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>新建项目</DialogTitle>
            <DialogDescription>填写项目名称、当前状态和补充说明，创建后会自动同步到公司驾驶舱。</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="company-project-name">项目名称</Label>
              <Input
                id="company-project-name"
                value={form.name}
                onChange={(event) => onFormChange({ ...form, name: event.target.value })}
                placeholder="输入项目名称"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="company-project-status">项目状态</Label>
              <Select
                value={form.status}
                onValueChange={(value: ProjectFormStatus) => onFormChange({ ...form, status: value })}
              >
                <SelectTrigger id="company-project-status">
                  <SelectValue placeholder="选择项目状态" />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((status) => (
                    <SelectItem key={status} value={status}>
                      {status}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="company-project-description">项目描述</Label>
              <Textarea
                id="company-project-description"
                value={form.description}
                onChange={(event) => onFormChange({ ...form, description: event.target.value })}
                placeholder="补充项目范围、当前阶段或关键信息"
                rows={4}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => onDialogChange(false)} disabled={submitting}>
              取消
            </Button>
            <Button onClick={onCreate} disabled={submitting}>
              {submitting ? '创建中...' : '创建项目'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && onDeleteTargetChange(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>删除项目</DialogTitle>
            <DialogDescription>确认是否删除当前项目及其关联摘要数据。</DialogDescription>
          </DialogHeader>

          <div className="text-sm leading-6 text-slate-500">
            将删除 <span className="font-medium text-slate-900">{deleteTarget?.name}</span> 及其关联的摘要、任务、风险和专项数据。此操作不可撤销，请确认后继续。
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => onDeleteTargetChange(null)} disabled={submitting}>
              取消
            </Button>
            <Button variant="destructive" onClick={onDelete} disabled={submitting}>
              {submitting ? '删除中...' : '确认删除'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

export default function CompanyCockpit() {
  const navigate = useNavigate()
  const location = useLocation()
  const setProjects = useStore((state) => state.setProjects)

  const [projects, setLocalProjects] = useState<Project[]>([])
  const [summaries, setSummaries] = useState<ProjectSummary[]>([])
  const [healthHistory, setHealthHistory] = useState<HealthHistory>({
    thisMonth: null,
    lastMonth: null,
    change: null,
    lastMonthPeriod: null,
  })
  const [companyRisks, setCompanyRisks] = useState<Risk[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [search, setSearch] = useState('')
  const [activeTab, setActiveTab] = useState<CockpitTab>('all')
  const [form, setForm] = useState(DEFAULT_FORM)

  const refreshData = async (options: { allowEmptyReplace?: boolean } = {}) => {
    setLoading(true)
    setError(null)

    try {
      const [storedProjects, projectSummaries, history, risks] = await Promise.all([
        syncProjectCacheFromApi(options),
        DashboardApiService.getAllProjectsSummary(),
        apiGet<HealthHistory>('/api/health-score/avg-history').catch(() => ({
          thisMonth: null,
          lastMonth: null,
          change: null,
          lastMonthPeriod: null,
        })),
        apiGet<Risk[]>('/api/risks').catch(() => []),
      ])

      setLocalProjects(storedProjects)
      setProjects(storedProjects)
      setSummaries(projectSummaries)
      setHealthHistory(history)
      setCompanyRisks(risks)
    } catch (err) {
      console.error('Failed to load company cockpit data:', err)
      setError(
        isBackendUnavailableError(err)
          ? '公司驾驶舱依赖后端汇总接口，请先确认本地后端已启动（默认 3001），再刷新重试。'
          : getApiErrorMessage(err, '公司驾驶舱加载失败，请稍后重试。'),
      )
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void refreshData()
  }, [])

  useEffect(() => {
    const handleOpenCreate = () => setDialogOpen(true)
    window.addEventListener('open-create-project', handleOpenCreate)
    return () => window.removeEventListener('open-create-project', handleOpenCreate)
  }, [])

  useEffect(() => {
    const searchParams = new URLSearchParams(location.search)
    if (searchParams.get('create') !== '1') return

    setDialogOpen(true)
    navigate('/company', { replace: true })
  }, [location.search, navigate])

  const summaryMap = useMemo(() => new Map(summaries.map((summary) => [summary.id, summary])), [summaries])

  const filteredProjects = useMemo(() => {
    const keyword = search.trim().toLowerCase()
    const tabFiltered =
      activeTab === 'all'
        ? projects
        : projects.filter((project) => mapSummaryStatusToTab(summaryMap.get(project.id)?.statusLabel || project.status) === activeTab)

    if (!keyword) return tabFiltered

    return tabFiltered.filter((project) => {
      return (
        project.name.toLowerCase().includes(keyword) ||
        (project.description || '').toLowerCase().includes(keyword)
      )
    })
  }, [activeTab, projects, search, summaryMap])

  const projectRows = useMemo<ProjectRow[]>(() => {
    return filteredProjects.map((project) => {
      const summary = summaryMap.get(project.id) ?? null

      return {
        project,
        summary,
        summaryStatus: normalizeStatusLabel(summary, project),
        healthScore: summary?.healthScore ?? 0,
        attentionCount: attentionPressure(summary),
        hasNextMilestone: Boolean(summary?.nextMilestone?.name),
        milestoneName: summary?.nextMilestone?.name || '暂无关键节点',
        milestoneDate: summary?.nextMilestone?.targetDate || null,
        milestoneDaysRemaining: summary?.nextMilestone?.daysRemaining ?? null,
        deliveryDaysRemaining: summary?.daysUntilPlannedEnd ?? null,
      }
    })
  }, [filteredProjects, summaryMap])

  const stats = useMemo(() => {
    const total = projects.length
    const inProgress = summaries.filter((summary) => mapSummaryStatusToTab(summary.statusLabel) === 'in_progress').length
    const completed = summaries.filter((summary) => mapSummaryStatusToTab(summary.statusLabel) === 'completed').length
    const paused = summaries.filter((summary) => mapSummaryStatusToTab(summary.statusLabel) === 'paused').length
    const averageHealth =
      summaries.length > 0 ? Math.round(summaries.reduce((sum, item) => sum + item.healthScore, 0) / summaries.length) : 0
    const averageProgress =
      summaries.length > 0 ? Math.round(summaries.reduce((sum, item) => sum + item.overallProgress, 0) / summaries.length) : 0
    const attentionProjects = summaries.filter((summary) => attentionPressure(summary) > 0).length

    return { total, inProgress, completed, paused, averageHealth, averageProgress, attentionProjects }
  }, [projects.length, summaries])

  const milestoneRows = useMemo(() => {
    return projectRows
      .filter((row) => (row.summary?.totalMilestones ?? 0) > 0 || row.hasNextMilestone)
      .sort((left, right) => {
        const leftDays = left.milestoneDaysRemaining ?? 9999
        const rightDays = right.milestoneDaysRemaining ?? 9999
        return leftDays - rightDays
      })
  }, [projectRows])

  const focusProjects = useMemo(() => {
    return [...projectRows]
      .sort((left, right) => {
        if (right.attentionCount !== left.attentionCount) return right.attentionCount - left.attentionCount

        const leftDays = left.milestoneDaysRemaining ?? left.deliveryDaysRemaining ?? 9999
        const rightDays = right.milestoneDaysRemaining ?? right.deliveryDaysRemaining ?? 9999
        if (leftDays !== rightDays) return leftDays - rightDays

        return left.healthScore - right.healthScore
      })
      .slice(0, 3)
  }, [projectRows])

  const tabItems = useMemo(
    () => [
      { key: 'all' as const, label: '全部', count: stats.total },
      { key: 'in_progress' as const, label: '进行中', count: stats.inProgress },
      { key: 'completed' as const, label: '已完成', count: stats.completed },
      { key: 'paused' as const, label: '已暂停', count: stats.paused },
    ],
    [stats.completed, stats.inProgress, stats.paused, stats.total],
  )

  const heroStats = useMemo(
    () => [
      {
        label: '项目总数',
        value: String(stats.total),
        hint: `进行中 ${stats.inProgress} · 已完成 ${stats.completed}`,
        icon: FolderKanban,
        tone: 'bg-blue-50 text-blue-600',
      },
      {
        label: '平均总体进度',
        value: `${stats.averageProgress}%`,
        hint: projectRows.length === stats.total ? '公司层共享摘要平均值' : `当前筛出 ${projectRows.length} / ${stats.total} 个项目`,
        icon: Target,
        tone: 'bg-emerald-50 text-emerald-600',
      },
      {
        label: '平均健康度',
        value: String(stats.averageHealth),
        hint: formatDelta(healthHistory.change),
        icon: Activity,
        tone: 'bg-amber-50 text-amber-600',
      },
    ],
    [healthHistory.change, projectRows.length, stats.averageHealth, stats.averageProgress, stats.completed, stats.inProgress, stats.total],
  )

  const handleCreateProject = async () => {
    if (!form.name.trim()) {
      toast({ title: '请输入项目名称', variant: 'destructive' })
      return
    }

    setSubmitting(true)
    try {
      await apiPost('/api/projects', {
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        status: form.status,
      })

      setDialogOpen(false)
      setForm(DEFAULT_FORM)
      toast({ title: '项目已创建', description: form.name.trim() })
      await refreshData({ allowEmptyReplace: true })
    } catch (err: any) {
      console.error('Failed to create project:', err)
      toast({
        title: '创建失败',
        description: getApiErrorMessage(err, '请稍后重试。'),
        variant: 'destructive',
      })
    } finally {
      setSubmitting(false)
    }
  }

  const handleDeleteProject = async () => {
    if (!deleteTarget) return

    setSubmitting(true)
    try {
      await apiDelete(`/api/projects/${deleteTarget.id}`)
      toast({ title: '项目已删除', description: deleteTarget.name })
      setDeleteTarget(null)
      await refreshData({ allowEmptyReplace: true })
    } catch (err: any) {
      console.error('Failed to delete project:', err)
      toast({
        title: '删除失败',
        description: getApiErrorMessage(err, '请稍后重试。'),
        variant: 'destructive',
      })
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-6 p-6">
        <nav className="text-sm text-slate-500">公司驾驶舱</nav>
        <CompanyCockpitSkeleton />
      </div>
    )
  }

  return (
    <div className="page-enter bg-slate-50/70 p-6">
      <div className="mx-auto max-w-[1680px] space-y-6">
        <nav className="text-sm text-slate-500">公司驾驶舱</nav>

        <CompanyHero
          search={search}
          onSearchChange={setSearch}
          onRefresh={() => void refreshData({ allowEmptyReplace: true })}
          onCreate={() => setDialogOpen(true)}
          error={error}
          heroStats={heroStats}
          healthHistory={healthHistory}
          stats={{
            inProgress: stats.inProgress,
            completed: stats.completed,
            attentionProjects: stats.attentionProjects,
          }}
          focusProjects={focusProjects}
          onNavigate={navigate}
        />

        <CompanyInsightSection
          projectRows={projectRows}
          healthHistory={healthHistory}
          stats={{
            total: stats.total,
            inProgress: stats.inProgress,
            completed: stats.completed,
            paused: stats.paused,
            averageHealth: stats.averageHealth,
            averageProgress: stats.averageProgress,
            attentionProjects: stats.attentionProjects,
          }}
          companyRisks={companyRisks}
          onNavigate={navigate}
        />

        <ProjectOverviewSection
          projectRows={projectRows}
          totalProjects={stats.total}
          activeTab={activeTab}
          tabItems={tabItems}
          onTabChange={setActiveTab}
          onCreate={() => setDialogOpen(true)}
          onDelete={setDeleteTarget}
          onNavigate={navigate}
        />

        <MilestoneSummarySection milestoneRows={milestoneRows} onNavigate={navigate} />

        {/* 项目排名 + 交付倒计时 */}
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <ProjectRanking />
          <DeliveryCountdown />
        </div>

        <CompanyCockpitDialogs
          dialogOpen={dialogOpen}
          onDialogChange={setDialogOpen}
          form={form}
          onFormChange={setForm}
          submitting={submitting}
          onCreate={() => void handleCreateProject()}
          deleteTarget={deleteTarget}
          onDeleteTargetChange={setDeleteTarget}
          onDelete={() => void handleDeleteProject()}
        />
      </div>
    </div>
  )
}



