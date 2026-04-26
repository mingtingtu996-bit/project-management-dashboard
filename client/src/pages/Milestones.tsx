import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'

import { Breadcrumb } from '@/components/Breadcrumb'
import { EmptyState } from '@/components/EmptyState'
import { PageHeader } from '@/components/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useAsyncData } from '@/hooks/useAsyncData'
import { PROJECT_NAVIGATION_LABELS } from '@/config/navigation'
import { DashboardApiService } from '@/services/dashboardApi'
import { toast } from '@/hooks/use-toast'
import { formatDate } from '@/lib/utils'
import { MilestonesSkeleton } from '@/components/ui/page-skeleton'
import { apiGet, getApiErrorMessage, isAbortError } from '@/lib/apiClient'
import {
  AlertCircle,
  ArrowLeft,
  BarChart3,
  Calendar,
  CheckCircle2,
  Clock,
  Download,
  ExternalLink,
  Flag,
  RefreshCw,
  TrendingUp,
} from 'lucide-react'

type MilestoneStatus = 'completed' | 'soon' | 'overdue' | 'pending' | 'upcoming'

interface MilestoneItem {
  id: string
  name: string
  description?: string
  targetDate?: string
  planned_date?: string
  current_planned_date?: string
  actual_date?: string | null
  progress: number
  status: MilestoneStatus
  statusLabel: string
  updatedAt?: string
  wbs_code?: string
  parent_id?: string
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

interface MilestoneHealthSummary {
  status: 'normal' | 'needs_attention' | 'abnormal'
  needsAttentionCount: number
  mappingPendingCount: number
  mergedCount: number
  excessiveDeviationCount: number
  incompleteDataCount: number
}

interface ProjectMilestoneOverview {
  stats: MilestoneStats
  summaryStats?: MilestoneSummaryStats
  healthSummary?: MilestoneHealthSummary
  items: MilestoneItem[]
}

interface ProjectSummary {
  id: string
  name: string
  milestoneOverview?: ProjectMilestoneOverview
}

type MilestoneFilter = 'all' | MilestoneStatus

interface LinkedTaskItem {
  id: string
  title: string
  status?: string | null
  progress?: number | null
  assignee_name?: string | null
  planned_end_date?: string | null
}

function isCompleted(milestone: MilestoneItem): boolean {
  return milestone.status === 'completed'
}

function daysUntil(dateStr?: string): number {
  if (!dateStr) return Infinity
  const target = new Date(dateStr)
  const now = new Date()
  const diffMs = target.setHours(0, 0, 0, 0) - now.setHours(0, 0, 0, 0)
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24))
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

function getVarianceDays(left?: string | null, right?: string | null) {
  if (!left || !right) return null
  const leftTime = new Date(left).getTime()
  const rightTime = new Date(right).getTime()
  if (Number.isNaN(leftTime) || Number.isNaN(rightTime)) return null
  return Math.round((rightTime - leftTime) / (1000 * 60 * 60 * 24))
}

function buildMilestoneGroups(items: MilestoneItem[]) {
  const itemMap = new Map(items.map((item) => [item.id, item]))
  const roots = items.filter((item) => !item.parent_id || !itemMap.has(item.parent_id))

  return roots
    .map((root) => ({
      root,
      children: items.filter((item) => item.parent_id === root.id),
    }))
    .filter((group) => group.root)
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

function getMilestoneHealthTone(status: MilestoneHealthSummary['status']) {
  if (status === 'abnormal') {
    return {
      container: 'border-red-200 bg-red-50 text-red-800',
      badge: 'border-red-200 bg-red-100 text-red-700',
      title: '存在异常',
      accent: 'text-red-700',
    }
  }

  if (status === 'needs_attention') {
    return {
      container: 'border-amber-200 bg-amber-50 text-amber-800',
      badge: 'border-amber-200 bg-amber-100 text-amber-700',
      title: '需要关注',
      accent: 'text-amber-700',
    }
  }

  return {
    container: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    badge: 'border-emerald-200 bg-emerald-100 text-emerald-700',
    title: '状态正常',
    accent: 'text-emerald-700',
  }
}

function getLinkedTaskBadgeVariant(status?: string | null) {
  const normalized = String(status ?? '').trim().toLowerCase()
  if (normalized === 'completed' || normalized === 'done' || normalized === '已完成') return 'default' as const
  if (normalized === 'overdue' || normalized === 'delayed' || normalized === 'blocked') return 'destructive' as const
  if (normalized === 'in_progress' || normalized === 'active' || normalized === '进行中') return 'secondary' as const
  return 'outline' as const
}

function StatCard({
  title,
  value,
  hint,
  tone,
}: {
  title: string
  value: string | number
  hint: string
  tone: 'slate' | 'green' | 'amber' | 'red' | 'blue' | 'orange'
}) {
  void hint

  const textColorMap = {
    slate: 'text-slate-900',
    green: 'text-emerald-700',
    amber: 'text-amber-700',
    red: 'text-red-700',
    blue: 'text-blue-700',
    orange: 'text-orange-700',
  } as const

  return (
    <Card className="overflow-hidden border-slate-200 shadow-sm">
      <CardContent className="space-y-2 p-5">
        <p className="text-sm font-medium text-slate-500">{title}</p>
        <div className={`text-3xl font-semibold ${textColorMap[tone]}`}>{value}</div>
      </CardContent>
    </Card>
  )
}

function MilestoneDetailCard({
  title,
  rows,
}: {
  title: string
  rows: Array<{ label: string; value: string }>
}) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
      <div className="text-sm font-medium text-slate-900">{title}</div>
      <div className="mt-3 space-y-2">
        {rows.map((row) => (
          <div key={`${title}-${row.label}`} className="flex items-start justify-between gap-3 text-xs leading-5">
            <span className="text-slate-500">{row.label}</span>
            <span className="text-right font-medium text-slate-800">{row.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function LinkedTasksCard({
  tasks,
  loading,
}: {
  tasks: LinkedTaskItem[]
  loading: boolean
}) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
      <div className="text-sm font-medium text-slate-900">关联执行</div>
      <div className="mt-3 space-y-3">
        {loading ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-5 text-sm text-slate-400">
            关联执行加载中...
          </div>
        ) : tasks.length > 0 ? (
          tasks.map((task) => (
            <div key={task.id} className="rounded-2xl border border-white bg-white px-4 py-3 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-slate-900">{task.title}</div>
                  <div className="mt-1 text-xs text-slate-500">
                    {task.assignee_name || '未分配'}
                    {task.planned_end_date ? ` · 计划完成 ${formatMilestoneDate(task.planned_end_date)}` : ' · 未设置计划完成日'}
                  </div>
                </div>
                <Badge variant={getLinkedTaskBadgeVariant(task.status)} className="shrink-0">
                  {task.status || '状态待补充'}
                </Badge>
              </div>
              <div className="mt-3">
                <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-blue-500"
                    style={{ width: `${Math.max(0, Math.min(100, Number(task.progress ?? 0)))}%` }}
                  />
                </div>
                <div className="mt-1 text-[11px] text-slate-500">
                  进度 {Math.max(0, Math.min(100, Number(task.progress ?? 0)))}%
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-5 text-sm text-slate-400">
            暂无关联执行任务
          </div>
        )}
      </div>
    </div>
  )
}

function MilestoneNodeCard({
  milestone,
  onSelect,
}: {
  milestone: MilestoneItem
  onSelect: (milestone: MilestoneItem) => void
}) {
  const completed = isCompleted(milestone)
  const statusTone =
    milestone.status === 'overdue'
      ? 'border-red-200 bg-red-50 text-red-700'
      : milestone.status === 'soon'
        ? 'border-amber-200 bg-amber-50 text-amber-700'
        : milestone.status === 'completed'
          ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
          : 'border-slate-200 bg-slate-50 text-slate-700'

  const deviationConclusion =
    milestone.status === 'completed'
      ? '已兑现'
      : milestone.status === 'overdue'
        ? '偏差待处理'
        : milestone.status === 'soon'
          ? '临近节点'
          : '待跟踪'

  const { baselineDate, currentPlanDate, actualDate } = getMilestoneTimeline(milestone)
  const currentVariance = getVarianceDays(baselineDate, currentPlanDate)
  const actualVariance = getVarianceDays(baselineDate, actualDate)
  const mainCompare =
    baselineDate || currentPlanDate || actualDate
      ? `基线 ${formatMilestoneDate(baselineDate)} / 当前 ${formatMilestoneDate(currentPlanDate)} / 实际 ${formatMilestoneDate(actualDate)}`
      : '基线 / 当前计划 / 实际达成待补齐'
  const weakInfo = milestone.description || `进度 ${milestone.progress}%`
  const mergedTargetLabel = milestone.merged_into_name || milestone.merged_into || '已合并节点'

  return (
    <button
      type="button"
      onClick={() => onSelect(milestone)}
      id={`milestone-${milestone.id}`}
      data-testid={`milestone-card-${milestone.id}`}
      className={`w-full rounded-xl border p-4 text-left transition-colors ${completed ? 'opacity-80' : ''} ${
        milestone.status === 'overdue'
          ? 'border-red-200 bg-red-50'
          : milestone.status === 'soon'
            ? 'border-amber-200 bg-amber-50'
            : 'border-slate-200 bg-white'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`text-sm font-medium text-slate-900 ${completed ? 'line-through' : ''}`}>{milestone.name}</span>
            <Badge className={`text-xs ${statusTone}`}>{milestone.statusLabel}</Badge>
            {milestone.mapping_pending && (
              <span data-testid="milestone-mapping-pending" className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700">
                映射待确认
              </span>
            )}
            {milestone.merged_into && (
              <span data-testid="milestone-merged-into" className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-medium text-slate-600">
                已合并到 {mergedTargetLabel}
              </span>
            )}
          </div>
          {(milestone.non_base_labels?.length ?? 0) > 0 && (
            <div className="flex flex-wrap gap-2 pt-1">
              {milestone.non_base_labels?.map((label) => (
                <span
                  key={`${milestone.id}-${label}`}
                  className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-medium text-slate-600"
                >
                  {label}
                </span>
              ))}
            </div>
          )}
          <div data-testid="milestones-three-time" className="grid gap-2 pt-2 text-[11px] text-slate-500 sm:grid-cols-3">
            <div className="rounded-lg bg-slate-50 px-2 py-1.5">
              <div className="text-[10px] uppercase tracking-wide text-slate-400">基线</div>
              <div className="mt-0.5 font-medium text-slate-700">{formatMilestoneDate(baselineDate)}</div>
            </div>
            <div className="rounded-lg bg-slate-50 px-2 py-1.5">
              <div className="text-[10px] uppercase tracking-wide text-slate-400">当前计划</div>
              <div className="mt-0.5 font-medium text-slate-700">{formatMilestoneDate(currentPlanDate)}</div>
            </div>
            <div className="rounded-lg bg-slate-50 px-2 py-1.5">
              <div className="text-[10px] uppercase tracking-wide text-slate-400">实际</div>
              <div className="mt-0.5 font-medium text-slate-700">{formatMilestoneDate(actualDate)}</div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
            <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5">
              当前偏差 {currentVariance == null ? '待补齐' : currentVariance === 0 ? '0 天' : `${currentVariance > 0 ? '+' : ''}${currentVariance} 天`}
            </span>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5">
              实际偏差 {actualVariance == null ? '待补齐' : actualVariance === 0 ? '0 天' : `${actualVariance > 0 ? '+' : ''}${actualVariance} 天`}
            </span>
          </div>
          <div className="text-xs leading-5 text-slate-500">偏差结论：{deviationConclusion}</div>
          <div className="text-xs leading-5 text-slate-500">主对比：{mainCompare}</div>
          <div className="text-xs leading-5 text-slate-500">弱信息：{weakInfo}</div>
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="flex items-center gap-1 text-xs text-slate-500">
            <TrendingUp className="h-3 w-3" />
            {milestone.progress}%
          </div>
          <div className="flex items-center gap-1 text-xs text-slate-500">
            <Calendar className="h-3 w-3" />
            {milestone.targetDate ? formatDate(milestone.targetDate) : '未设置'}
          </div>
        </div>
      </div>
    </button>
  )
}

export default function Milestones() {
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
  const [selectedMilestone, setSelectedMilestone] = useState<MilestoneItem | null>(null)
  const [linkedTasks, setLinkedTasks] = useState<LinkedTaskItem[]>([])
  const [linkedTasksLoading, setLinkedTasksLoading] = useState(false)
  const highlightMilestoneId = useMemo(() => new URLSearchParams(location.search).get('highlight')?.trim() ?? '', [location.search])

  useEffect(() => {
    setSelectedMilestone(null)
    setLinkedTasks([])
    setLinkedTasksLoading(false)
  }, [id])

  useEffect(() => {
    if (!highlightMilestoneId || !milestoneOverview?.items?.length) {
      return
    }

    const highlighted = milestoneOverview.items.find((item) => item.id === highlightMilestoneId)
    if (!highlighted) {
      return
    }

    setSelectedMilestone((current) => (current?.id === highlighted.id ? current : highlighted))
    window.setTimeout(() => {
      document.getElementById(`milestone-${highlighted.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 0)
  }, [highlightMilestoneId, milestoneOverview?.items])

  useEffect(() => {
    if (!id || !selectedMilestone) {
      setLinkedTasks([])
      setLinkedTasksLoading(false)
      return
    }

    const controller = new AbortController()
    setLinkedTasksLoading(true)

    apiGet<LinkedTaskItem[]>(
      `/api/projects/${id}/milestones/${selectedMilestone.id}/linked-tasks`,
      { signal: controller.signal },
    )
      .then((payload) => {
        if (!controller.signal.aborted) {
          setLinkedTasks(Array.isArray(payload) ? payload : [])
        }
      })
      .catch((error) => {
        if (!isAbortError(error)) {
          setLinkedTasks([])
          toast({
            title: '关联执行加载失败',
            description: getApiErrorMessage(error, '无法加载关联执行'),
            variant: 'destructive',
          })
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLinkedTasksLoading(false)
        }
      })

    return () => controller.abort()
  }, [id, selectedMilestone, toast])

  const goToTaskList = (milestoneId?: string) => {
    if (!id) return
    const target = milestoneId ? `/projects/${id}/gantt?highlight=${encodeURIComponent(milestoneId)}` : `/projects/${id}/gantt`
    navigate(target)
  }

  const filteredMilestones = useMemo(() => {
    const keyword = search.trim().toLowerCase()
    const items = milestoneOverview?.items || []

    return items
      .filter((item) => matchesMilestoneFilter(item, filter))
      .filter((item) => {
        if (!keyword) return true
        return [item.name, item.description, item.statusLabel]
          .map((value) => String(value || '').toLowerCase())
          .some((value) => value.includes(keyword))
      })
  }, [filter, milestoneOverview?.items, search])

  const milestoneSummaryStats = milestoneOverview?.summaryStats ?? {
    shiftedCount: 0,
    baselineOnTimeCount: 0,
    dueSoon30dCount: 0,
    highRiskCount: 0,
  }

  const milestoneHealthSummary = milestoneOverview?.healthSummary ?? {
    status: 'normal' as const,
    needsAttentionCount: 0,
    mappingPendingCount: 0,
    mergedCount: 0,
    excessiveDeviationCount: 0,
    incompleteDataCount: 0,
  }

  const filteredMilestoneGroups = useMemo(() => buildMilestoneGroups(filteredMilestones), [filteredMilestones])
  const summaryCards = useMemo(
    () =>
      milestoneOverview
        ? [
            { title: '当前已偏移数', value: milestoneSummaryStats.shiftedCount, hint: '基线与当前计划不一致', tone: 'orange' as const },
            { title: '按基线准时完成数', value: milestoneSummaryStats.baselineOnTimeCount, hint: '按基线完成或未偏移', tone: 'green' as const },
            { title: '近 30 天到期数', value: milestoneSummaryStats.dueSoon30dCount, hint: '按当前计划未来 30 天内到期', tone: 'blue' as const },
            { title: '高风险里程碑数', value: milestoneSummaryStats.highRiskCount, hint: '偏差、缺失与异常场景', tone: 'red' as const },
          ]
        : [],
    [milestoneOverview, milestoneSummaryStats],
  )

  const exportMilestones = () => {
    if (!summary || filteredMilestones.length === 0) {
      toast({
        title: '暂无可导出节点',
        variant: 'destructive',
      })
      return
    }

    const rows = filteredMilestones.map((item) => {
      const { baselineDate, currentPlanDate, actualDate } = getMilestoneTimeline(item)
      return [
        item.name,
        item.statusLabel,
        item.targetDate || '',
        baselineDate || '',
        currentPlanDate || '',
        actualDate || '',
        item.progress,
        item.wbs_code || '',
        item.parent_id || '',
        item.mapping_pending ? '是' : '否',
        item.merged_into_name || item.merged_into || '',
        item.description || '',
      ]
    })

    const header = [
      '节点名称',
      '状态',
      '目标日期',
      '基线日期',
      '当前计划',
      '实际日期',
      '进度(%)',
      'WBS',
      'parent_id',
      'mapping_pending',
      'merged_into',
      '备注',
    ]

    const csv = [header, ...rows]
      .map((line) => line.map((cell) => escapeCsvCell(cell)).join(','))
      .join('\n')

    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' })
    const url = window.URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    const dateLabel = new Date().toISOString().slice(0, 10)
    anchor.href = url
    anchor.download = `${summary.name}-里程碑节点-${dateLabel}.csv`
    document.body.appendChild(anchor)
    anchor.click()
    document.body.removeChild(anchor)
    window.URL.revokeObjectURL(url)

    toast({
      title: '导出成功',
      description: `已导出 ${filteredMilestones.length} 条里程碑节点。`,
    })
  }

  if (!id || loading) {
    return (
      <div className="p-6">
        <MilestonesSkeleton />
      </div>
    )
  }

  if (error || !milestoneOverview) {
    return (
      <div className="space-y-6 p-6 page-enter">
        <PageHeader
          eyebrow="关键节点偏差与兑现"
          title="关键节点偏差与兑现页"
          subtitle=""
        >
          <Button variant="outline" size="sm" onClick={() => navigate(`/projects/${id}/dashboard`)}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            {PROJECT_NAVIGATION_LABELS.dashboard}
          </Button>
          <Button onClick={() => goToTaskList()}>
            <ExternalLink className="mr-2 h-4 w-4" />
            任务管理
          </Button>
        </PageHeader>
        <Card className="border-slate-200 shadow-sm">
          <CardContent className="flex flex-col items-center gap-4 p-10 text-center">
            <AlertCircle className="h-12 w-12 text-amber-500" />
            <p className="text-base font-medium text-slate-900">里程碑共享摘要暂不可用</p>
            <div className="flex flex-wrap justify-center gap-3">
              <Button variant="outline" onClick={() => refetch()}>
                <RefreshCw className="mr-2 h-4 w-4" />
                重试
              </Button>
              <Button onClick={() => goToTaskList()}>
                <ExternalLink className="mr-2 h-4 w-4" />
                任务管理
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  const totalItems = milestoneOverview.items.length
  const hasAnyMilestones = totalItems > 0
  const healthTone = getMilestoneHealthTone(milestoneHealthSummary.status)
  const healthSummaryText =
    milestoneHealthSummary.status === 'normal'
      ? '里程碑状态正常'
      : milestoneHealthSummary.status === 'needs_attention'
        ? `${milestoneHealthSummary.needsAttentionCount} 个里程碑需要关注`
        : `${milestoneHealthSummary.needsAttentionCount} 个里程碑存在异常`
  const countByLabel = (label: string) =>
    milestoneOverview.items.filter((item) => (item.non_base_labels ?? []).includes(label)).length
  const healthBreakdown = {
    mappingPending: milestoneHealthSummary.mappingPendingCount,
    pendingTakeover: countByLabel('待人工承接'),
    executionClosed: countByLabel('执行层已关闭'),
    baselineRemoved: countByLabel('基线已移除') + countByLabel('基线版本已移除'),
    incompleteData: milestoneHealthSummary.incompleteDataCount,
    deviationExcessive: milestoneHealthSummary.excessiveDeviationCount,
    noBaseline: countByLabel('未关联基线'),
  }
  const healthSummaryDetail = [
    `待补映射 ${healthBreakdown.mappingPending}`,
    `待承接 ${healthBreakdown.pendingTakeover}`,
    `执行层已关闭 ${healthBreakdown.executionClosed}`,
    `数据不完整 ${healthBreakdown.incompleteData}`,
    `偏差过大 ${healthBreakdown.deviationExcessive}`,
  ].join(' / ')

  return (
    <div className="page-enter space-y-6 p-6">
      <div className="max-w-[1600px] space-y-6">
        <Breadcrumb
          showHome
          items={[
            { label: summary.name, href: `/projects/${id}/dashboard` },
            { label: '关键节点偏差与兑现' },
          ]}
        />

        <PageHeader
          eyebrow="关键节点偏差与兑现"
          title="关键节点偏差与兑现页"
          subtitle=""
        >
          <Button variant="outline" size="sm" onClick={() => navigate(`/projects/${id}/dashboard`)}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            {PROJECT_NAVIGATION_LABELS.dashboard}
          </Button>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="mr-2 h-4 w-4" />
            刷新
          </Button>
          <Button
            variant="outline"
            size="sm"
            data-testid="milestones-export"
            onClick={exportMilestones}
            disabled={filteredMilestones.length === 0}
          >
            <Download className="mr-2 h-4 w-4" />
            导出节点表
          </Button>
          <Button onClick={() => goToTaskList()}>
            <ExternalLink className="mr-2 h-4 w-4" />
            任务管理
          </Button>
        </PageHeader>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          {summaryCards.map((card) => (
            <StatCard key={card.title} {...card} />
          ))}
        </div>

        <Card data-testid="milestone-health-summary" className={`border shadow-sm ${healthTone.container}`}>
          <CardContent className="flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full border px-3 py-1 text-xs font-medium ${healthTone.badge}`}>里程碑健康状态</span>
                <span className={`text-base font-semibold ${healthTone.accent}`}>{healthSummaryText}</span>
              </div>
              <div className="text-sm leading-6 text-slate-600">{healthSummaryDetail}</div>
              <div className="flex flex-wrap gap-2 text-xs text-slate-600">
                <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1">当前已偏移 {milestoneSummaryStats.shiftedCount}</span>
                <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1">按基线准时完成 {milestoneSummaryStats.baselineOnTimeCount}</span>
                <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1">近 30 天到期 {milestoneSummaryStats.dueSoon30dCount}</span>
                <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1">高风险 {milestoneSummaryStats.highRiskCount}</span>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={() => navigate(`/projects/${id}/reports?view=progress`)}>
              查看详情
            </Button>
          </CardContent>
        </Card>

        {!hasAnyMilestones ? (
          <Card className="border-dashed border-slate-200 shadow-sm">
            <CardContent className="flex flex-col items-center gap-4 py-14 text-center">
              <Flag className="h-12 w-12 text-slate-300" />
              <div className="space-y-2">
                <div className="text-lg font-semibold text-slate-900">暂无里程碑数据</div>
                <p className="max-w-xl text-sm leading-6 text-slate-500">
                  在任务列表中将关键节点标记为里程碑后，这里会自动展示。
                </p>
              </div>
              <Button variant="outline" onClick={() => goToTaskList()}>
                <ExternalLink className="mr-2 h-4 w-4" />
                前往任务列表
              </Button>
            </CardContent>
          </Card>
        ) : (
          <>
            <Card className="border-slate-200 shadow-sm">
              <CardContent className="flex flex-col gap-4 p-4 lg:flex-row lg:items-center lg:justify-between">
                <p className="text-sm font-medium text-slate-900">节点偏差表</p>
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="搜索节点名称、描述、状态"
                  className="w-full lg:w-[320px]"
                />
              </CardContent>
            </Card>

            <Tabs value={filter} onValueChange={(value) => setFilter(value as MilestoneFilter)}>
              <TabsList className="grid w-full grid-cols-5 bg-slate-100 p-1">
                <TabsTrigger value="all">全部 {totalItems}</TabsTrigger>
                <TabsTrigger value="pending">待完成 {milestoneOverview.stats.pending}</TabsTrigger>
                <TabsTrigger value="soon">7天内 {milestoneOverview.stats.upcomingSoon}</TabsTrigger>
                <TabsTrigger value="overdue">已逾期 {milestoneOverview.stats.overdue}</TabsTrigger>
                <TabsTrigger value="completed">已完成 {milestoneOverview.stats.completed}</TabsTrigger>
              </TabsList>

              <TabsContent value={filter} className="mt-6 space-y-6">
                <div className={`grid gap-6 ${selectedMilestone ? 'xl:grid-cols-[minmax(0,1.5fr)_minmax(320px,0.85fr)]' : ''}`}>
                  <Card className="border-slate-200 shadow-sm">
                    <CardHeader className="border-b border-slate-100 pb-4">
                      <CardTitle className="flex items-center gap-2 text-base">
                        <Flag className="h-4 w-4" />
                        节点偏差表
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3 pt-4">
                      {filteredMilestoneGroups.length === 0 ? (
                        <EmptyState
                          icon={Flag}
                          title="暂无匹配的节点"
                          action={<Button variant="outline" size="sm" onClick={() => { setSearch(''); setFilter('all') }}>重置筛选</Button>}
                          className="max-w-none py-8"
                        />
                      ) : (
                        filteredMilestoneGroups.map((group) => (
                          <div key={group.root.id} className="space-y-3">
                            <MilestoneNodeCard milestone={group.root} onSelect={setSelectedMilestone} />
                            {group.children.length > 0 && (
                              <div data-testid="milestone-child-group" className="ml-4 space-y-2 rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 p-3">
                                <div className="text-xs font-medium text-slate-500">子里程碑组 · {group.children.length} 项</div>
                                <div className="space-y-2">
                                  {group.children.map((child) => (
                                    <MilestoneNodeCard key={child.id} milestone={child} onSelect={setSelectedMilestone} />
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        ))
                      )}
                    </CardContent>
                  </Card>

                  {selectedMilestone && (
                    <Card className="border-slate-200 shadow-sm">
                      <CardHeader className="pb-4">
                        <div className="flex items-start justify-between gap-2">
                          <CardTitle className="text-base">{selectedMilestone.name}</CardTitle>
                          <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => setSelectedMilestone(null)}>
                            收起
                          </Button>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        {(() => {
                          const { baselineDate, currentPlanDate, actualDate } = getMilestoneTimeline(selectedMilestone)
                          const anomalyLabel = selectedMilestone.mapping_pending
                            ? '对应关系待确认'
                            : selectedMilestone.merged_into
                              ? `已合并到 ${selectedMilestone.merged_into_name || selectedMilestone.merged_into}`
                              : '当前未发现异常标记'
                          const currentVariance = getVarianceDays(baselineDate, currentPlanDate)
                          const actualVariance = getVarianceDays(baselineDate, actualDate)

                          return (
                            <div className="grid gap-3 sm:grid-cols-2">
                              <MilestoneDetailCard
                                title="三时间对比"
                                rows={[
                                  { label: '基线目标', value: formatMilestoneDate(baselineDate) },
                                  { label: '当前计划', value: formatMilestoneDate(currentPlanDate) },
                                  { label: '实际达成', value: formatMilestoneDate(actualDate) },
                                ]}
                              />
                              <MilestoneDetailCard
                                title="偏差结果"
                                rows={[
                                  { label: '当前状态', value: selectedMilestone.statusLabel },
                                  { label: '当前进度', value: `${selectedMilestone.progress}%` },
                                  {
                                    label: '当前计划偏差',
                                    value:
                                      currentVariance === null
                                        ? '待补齐日期'
                                        : currentVariance === 0
                                          ? '与基线一致'
                                          : currentVariance > 0
                                            ? `较基线延后 ${currentVariance} 天`
                                            : `较基线提前 ${Math.abs(currentVariance)} 天`,
                                  },
                                  {
                                    label: '实际达成偏差',
                                    value:
                                      actualVariance === null
                                        ? '待补齐日期'
                                        : actualVariance === 0
                                          ? '与基线一致'
                                          : actualVariance > 0
                                            ? `较基线延后 ${actualVariance} 天`
                                            : `较基线提前 ${Math.abs(actualVariance)} 天`,
                                  },
                                ]}
                              />
                              <MilestoneDetailCard
                                title="异常与对应关系"
                                rows={[
                                  { label: '对应关系', value: anomalyLabel },
                                  { label: '节点备注', value: selectedMilestone.description || '暂无备注' },
                                  {
                                    label: '最近更新',
                                    value: selectedMilestone.updatedAt ? formatMilestoneDate(selectedMilestone.updatedAt) : '待补充',
                                  },
                                ]}
                              />
                              <LinkedTasksCard tasks={linkedTasks} loading={linkedTasksLoading} />
                            </div>
                          )
                        })()}
                        <Button variant="outline" size="sm" className="w-full" onClick={() => goToTaskList(selectedMilestone.id)}>
                          <ExternalLink className="mr-2 h-3 w-3" />
                          进入任务管理
                        </Button>
                      </CardContent>
                    </Card>
                  )}
                </div>
              </TabsContent>
            </Tabs>
          </>
        )}
      </div>
    </div>
  )
}
