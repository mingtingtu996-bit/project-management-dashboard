import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import { Breadcrumb } from '@/components/Breadcrumb'
import { EmptyState } from '@/components/EmptyState'
import { PageHeader } from '@/components/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useAsyncData } from '@/hooks/useAsyncData'
import { DashboardApiService } from '@/services/dashboardApi'
import { formatDate } from '@/lib/utils'
import { MilestonesSkeleton } from '@/components/ui/page-skeleton'
import {
  AlertCircle,
  ArrowLeft,
  BarChart3,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  ExternalLink,
  Flag,
  RefreshCw,
  TrendingUp,
} from 'lucide-react'

type MilestoneStatus = 'completed' | 'soon' | 'overdue' | 'pending'

interface MilestoneItem {
  id: string
  name: string
  description?: string
  targetDate?: string
  progress: number
  status: MilestoneStatus
  statusLabel: string
  updatedAt?: string
  wbs_code?: string
  parent_id?: string
}

interface MilestoneStats {
  total: number
  pending: number
  completed: number
  overdue: number
  upcomingSoon: number
  completionRate: number
}

interface ProjectMilestoneOverview {
  stats: MilestoneStats
  items: MilestoneItem[]
}

interface ProjectSummary {
  id: string
  name: string
  milestoneOverview?: ProjectMilestoneOverview
}

type MilestoneFilter = 'all' | MilestoneStatus

// ── 层级判断工具 ────────────────────────────────────────────────────────────
function getMilestoneLevel(milestone: MilestoneItem): 1 | 2 | 3 {
  if (milestone.wbs_code) {
    const segments = milestone.wbs_code.split('.').filter(Boolean)
    if (segments.length === 1) return 1
    if (segments.length === 2) return 2
    return 3
  }
  // parent_id 判断：如果有 parent_id 则为二级，否则一级（三级不可区分，统一二级）
  if (milestone.parent_id) return 2
  return 1
}

// 计算距今天数（负数=已过期）
function daysUntil(dateStr?: string): number {
  if (!dateStr) return Infinity
  const target = new Date(dateStr)
  const now = new Date()
  // 只比较日期部分
  const diffMs = target.setHours(0, 0, 0, 0) - now.setHours(0, 0, 0, 0)
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24))
}

function isCompleted(milestone: MilestoneItem): boolean {
  return milestone.status === 'completed'
}

// ── StatCard ────────────────────────────────────────────────────────────────
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
  const toneMap = {
    slate: 'border-slate-200 bg-slate-50 text-slate-900',
    green: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    amber: 'border-amber-200 bg-amber-50 text-amber-700',
    red: 'border-red-200 bg-red-50 text-red-700',
    blue: 'border-blue-200 bg-blue-50 text-blue-700',
    orange: 'border-orange-200 bg-orange-50 text-orange-700',
  } as const

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
        <div className={`rounded-2xl border px-3 py-2 text-xs ${toneMap[tone]}`}>{hint}</div>
      </CardContent>
    </Card>
  )
}

// ── 树形左列卡片 ─────────────────────────────────────────────────────────────
function MilestoneTreeItem({
  milestone,
  onOpenTaskList,
  collapsed,
  onToggleCollapse,
  hasChildren,
}: {
  milestone: MilestoneItem
  onOpenTaskList: (milestoneId?: string) => void
  collapsed: boolean
  onToggleCollapse: () => void
  hasChildren: boolean
}) {
  const level = getMilestoneLevel(milestone)
  const completed = isCompleted(milestone)

  // 层级左边框颜色
  const levelBorderClass =
    level === 1
      ? 'border-l-4 border-l-amber-500'
      : level === 2
        ? 'border-l-[3px] border-l-blue-500'
        : 'border-l-2 border-l-gray-400'

  // 缩进
  const indentClass =
    level === 1 ? 'pl-0' : level === 2 ? 'pl-4' : 'pl-8'

  // 背景/边框 tone
  const statusBg =
    completed
      ? 'bg-slate-50 border-slate-200'
      : milestone.status === 'overdue'
        ? 'bg-red-50 border-red-200'
        : milestone.status === 'soon'
          ? 'bg-amber-50 border-amber-200'
          : 'bg-slate-50 border-slate-200'

  const statusIcon =
    milestone.status === 'completed' ? (
      <CheckCircle2 className="h-4 w-4 text-emerald-600 flex-shrink-0" />
    ) : milestone.status === 'overdue' ? (
      <AlertCircle className="h-4 w-4 text-red-600 flex-shrink-0" />
    ) : (
      <Clock className="h-4 w-4 text-amber-600 flex-shrink-0" />
    )

  const labelTone =
    milestone.status === 'completed'
      ? 'bg-emerald-100 text-emerald-700'
      : milestone.status === 'overdue'
        ? 'bg-red-100 text-red-700'
        : milestone.status === 'soon'
          ? 'bg-amber-100 text-amber-700'
          : 'bg-slate-100 text-slate-600'

  return (
    <div className={indentClass}>
      <div
        className={`rounded-xl border p-3 transition-colors ${statusBg} ${levelBorderClass} ${completed ? 'opacity-50' : ''}`}
      >
        <div className="flex items-start gap-2">
          {/* 折叠/展开按钮 */}
          <button
            onClick={onToggleCollapse}
            className={`mt-0.5 flex-shrink-0 rounded p-0.5 text-slate-400 hover:text-slate-600 transition-colors ${hasChildren ? 'visible' : 'invisible'}`}
          >
            {collapsed ? (
              <ChevronRight className="h-3.5 w-3.5" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" />
            )}
          </button>

          {/* 状态图标 */}
          <div className="mt-0.5">{statusIcon}</div>

          {/* 内容 */}
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <p className={`text-sm font-medium text-slate-900 ${completed ? 'line-through' : ''}`}>
                {milestone.name}
              </p>
              <Badge className={`text-xs ${labelTone}`}>{milestone.statusLabel}</Badge>
            </div>

            <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
              <span className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                {milestone.targetDate ? formatDate(milestone.targetDate) : '未设置'}
              </span>
              <span className="flex items-center gap-1">
                <TrendingUp className="h-3 w-3" />
                {milestone.progress}%
              </span>
            </div>

            {milestone.description && (
              <p className="text-xs text-slate-500 line-clamp-1">{milestone.description}</p>
            )}

            {/* 进度条 */}
            <div className="h-1 w-32 overflow-hidden rounded-full bg-white/70">
              <div
                className={`h-full rounded-full ${
                  milestone.status === 'completed'
                    ? 'bg-emerald-500'
                    : milestone.status === 'overdue'
                      ? 'bg-red-500'
                      : milestone.status === 'soon'
                        ? 'bg-amber-500'
                        : 'bg-slate-400'
                }`}
                style={{ width: `${milestone.progress}%` }}
              />
            </div>
          </div>

          {/* 跳转按钮 */}
          <Button
            variant="ghost"
            size="sm"
            className="h-7 flex-shrink-0 px-2 text-xs"
            onClick={() => onOpenTaskList(milestone.id)}
          >
            <ExternalLink className="h-3 w-3" />
          </Button>
        </div>
      </div>
    </div>
  )
}

// ── 树形列表容器 ─────────────────────────────────────────────────────────────
function MilestoneTreeList({
  milestones,
  onOpenTaskList,
}: {
  milestones: MilestoneItem[]
  onOpenTaskList: (milestoneId?: string) => void
}) {
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set())

  const toggleCollapse = (id: string) => {
    setCollapsedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  // 判断哪些 id 有子项
  const parentIds = useMemo(() => {
    const ids = new Set<string>()
    milestones.forEach((m) => {
      if (m.parent_id) ids.add(m.parent_id)
      // wbs_code 判断：如果有 wbs_code，则其前缀的里程碑是父节点
      if (m.wbs_code && m.wbs_code.includes('.')) {
        const parentCode = m.wbs_code.split('.').slice(0, -1).join('.')
        const parent = milestones.find((p) => p.wbs_code === parentCode)
        if (parent) ids.add(parent.id)
      }
    })
    return ids
  }, [milestones])

  // 判断一个里程碑是否应该显示（父节点未折叠）
  const isVisible = (milestone: MilestoneItem): boolean => {
    if (milestone.wbs_code && milestone.wbs_code.includes('.')) {
      // 找到直接父节点
      const parentCode = milestone.wbs_code.split('.').slice(0, -1).join('.')
      const parent = milestones.find((p) => p.wbs_code === parentCode)
      if (parent && collapsedIds.has(parent.id)) return false
      if (parent) return isVisible(parent)
    } else if (milestone.parent_id) {
      if (collapsedIds.has(milestone.parent_id)) return false
      const parent = milestones.find((p) => p.id === milestone.parent_id)
      if (parent) return isVisible(parent)
    }
    return true
  }

  if (milestones.length === 0) {
    return (
      <EmptyState
        icon={Flag}
        title="暂无匹配的里程碑"
        description="换个关键词或切换状态筛选，再看当前项目的里程碑情况。"
        className="py-12"
      />
    )
  }

  return (
    <div className="space-y-2">
      {milestones.map((milestone) => {
        if (!isVisible(milestone)) return null
        return (
          <MilestoneTreeItem
            key={milestone.id}
            milestone={milestone}
            onOpenTaskList={onOpenTaskList}
            collapsed={collapsedIds.has(milestone.id)}
            onToggleCollapse={() => toggleCollapse(milestone.id)}
            hasChildren={parentIds.has(milestone.id)}
          />
        )
      })}
    </div>
  )
}

// ── 主页面 ───────────────────────────────────────────────────────────────────
export default function Milestones() {
  const { id } = useParams<{ id: string }>()
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

  const goToTaskList = (milestoneId?: string) => {
    if (!id) return
    const target = milestoneId ? `/projects/${id}/gantt?highlight=${encodeURIComponent(milestoneId)}` : `/projects/${id}/gantt`
    navigate(target)
  }

  const filteredMilestones = useMemo(() => {
    const keyword = search.trim().toLowerCase()
    const items = milestoneOverview?.items || []

    return items.filter((item) => {
      const statusMatch = filter === 'all' || item.status === filter
      const keywordMatch =
        !keyword ||
        [item.name, item.description, item.statusLabel]
          .map((value) => String(value || '').toLowerCase())
          .some((value) => value.includes(keyword))

      return statusMatch && keywordMatch
    })
  }, [filter, milestoneOverview?.items, search])

  // 7天内到期（前端计算）
  const dueIn7DaysCount = useMemo(() => {
    const items = milestoneOverview?.items || []
    return items.filter((m) => {
      if (isCompleted(m)) return false
      const days = daysUntil(m.targetDate)
      return days >= 0 && days <= 7
    }).length
  }, [milestoneOverview?.items])

  const summaryCards = useMemo(
    () =>
      milestoneOverview
        ? [
            { title: '待完成', value: milestoneOverview.stats.pending, hint: '来自共享摘要口径', tone: 'amber' as const },
            { title: '已完成', value: milestoneOverview.stats.completed, hint: `共 ${milestoneOverview.stats.total} 个里程碑`, tone: 'green' as const },
            { title: '即将到期(7天)', value: dueIn7DaysCount, hint: '7 天内到期·前端实时计算', tone: 'orange' as const },
            { title: '已逾期', value: milestoneOverview.stats.overdue, hint: '优先处理', tone: 'red' as const },
            { title: '完成率', value: `${milestoneOverview.stats.completionRate}%`, hint: '与 Dashboard 摘要分工清晰', tone: 'slate' as const },
          ]
        : [],
    [milestoneOverview, dueIn7DaysCount],
  )

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
          eyebrow="项目级主模块"
          title="里程碑"
          subtitle="里程碑的共享摘要当前不可用，先回到任务管理查看结构化任务列表。"
        >
          <Button variant="outline" size="sm" onClick={() => navigate(`/projects/${id}/dashboard`)}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            项目 Dashboard
          </Button>
          <Button onClick={() => goToTaskList()}>
            <ExternalLink className="mr-2 h-4 w-4" />
            去任务列表
          </Button>
        </PageHeader>
        <Card className="border-slate-200 shadow-sm">
          <CardContent className="flex flex-col items-center gap-4 p-10 text-center">
            <AlertCircle className="h-12 w-12 text-amber-500" />
            <div className="space-y-1">
              <p className="text-base font-medium text-slate-900">里程碑共享摘要暂不可用</p>
              <p className="text-sm text-slate-500">请稍后重试，或者直接跳转到任务列表查看里程碑相关任务。</p>
            </div>
            <div className="flex flex-wrap justify-center gap-3">
              <Button variant="outline" onClick={() => refetch()}>
                <RefreshCw className="mr-2 h-4 w-4" />
                重试
              </Button>
              <Button onClick={() => goToTaskList()}>
                <ExternalLink className="mr-2 h-4 w-4" />
                去任务列表
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  const totalItems = milestoneOverview.items.length
  const activeItems = filteredMilestones.length
  const completionRate = milestoneOverview.stats.completionRate

  return (
    <div className="page-enter space-y-6 p-6">
      <div className="max-w-[1600px] space-y-6">
        <Breadcrumb
          showHome
          items={[
            { label: summary.name, href: id ? `/projects/${id}/dashboard` : undefined },
            { label: '里程碑' },
          ]}
        />

        <PageHeader
          eyebrow="项目级主模块"
          title="里程碑"
          subtitle={`${summary.name} 的里程碑状态、临期情况和任务跳转都在这里承接。当前页只做展示和导航，不改动共享摘要口径。`}
        >
          <Button variant="outline" size="sm" onClick={() => navigate(`/projects/${id}/dashboard`)}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            项目 Dashboard
          </Button>
          <Button variant="outline" size="sm" onClick={() => navigate(`/projects/${id}/reports?view=progress`)}>
            <BarChart3 className="mr-2 h-4 w-4" />
            项目进度分析
          </Button>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="mr-2 h-4 w-4" />
            刷新
          </Button>
          <Button onClick={() => goToTaskList()}>
            <ExternalLink className="mr-2 h-4 w-4" />
            去任务列表
          </Button>
        </PageHeader>

        {/* 统计卡（含前端计算的7天到期） */}
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          {summaryCards.map((card) => (
            <StatCard key={card.title} {...card} />
          ))}
        </div>

        <Card className="border-slate-200 shadow-sm">
          <CardContent className="flex flex-col gap-4 p-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-1">
              <p className="text-sm font-medium text-slate-900">筛选</p>
              <p className="text-xs text-slate-500">按名称、描述或状态筛选里程碑，快速找到临期、延期和待完成事项。</p>
            </div>
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="搜索里程碑名称、描述、状态"
              className="w-full lg:w-[320px]"
            />
          </CardContent>
        </Card>

        <Tabs value={filter} onValueChange={(value) => setFilter(value as MilestoneFilter)}>
          <TabsList className="grid w-full grid-cols-5 bg-slate-100 p-1">
            <TabsTrigger value="all">全部 {totalItems}</TabsTrigger>
            <TabsTrigger value="pending">待完成 {milestoneOverview.stats.pending}</TabsTrigger>
            <TabsTrigger value="soon">即将到期 {milestoneOverview.stats.upcomingSoon}</TabsTrigger>
            <TabsTrigger value="overdue">已逾期 {milestoneOverview.stats.overdue}</TabsTrigger>
            <TabsTrigger value="completed">已完成 {milestoneOverview.stats.completed}</TabsTrigger>
          </TabsList>

          <TabsContent value={filter} className="mt-6 space-y-6">
            {/* 双列布局：左列树形列表 + 右列详情 */}
            <div className="grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(320px,0.85fr)]">
              {/* 左列：树形里程碑列表 */}
              <Card className="border-slate-200 shadow-sm">
                <CardHeader className="border-b border-slate-100 pb-4">
                  <div className="flex flex-col gap-1">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Flag className="h-4 w-4" />
                      里程碑主列表
                    </CardTitle>
                    <p className="text-xs text-slate-500">
                      当前显示 {activeItems} 条，完成率 {completionRate}%。
                      <span className="ml-2 text-slate-400">
                        · 层级色：
                        <span className="inline-block h-2 w-2 rounded-sm bg-amber-500 mx-0.5 align-middle" />一级
                        <span className="inline-block h-2 w-2 rounded-sm bg-blue-500 mx-0.5 align-middle" />二级
                        <span className="inline-block h-2 w-2 rounded-sm bg-gray-400 mx-0.5 align-middle" />三级
                      </span>
                    </p>
                  </div>
                </CardHeader>
                <CardContent className="pt-4">
                  <MilestoneTreeList
                    milestones={filteredMilestones}
                    onOpenTaskList={goToTaskList}
                  />
                </CardContent>
              </Card>

              {/* 右列：重点关注详情 */}
              <Card className="border-slate-200 shadow-sm">
                <CardHeader className="pb-4">
                  <CardTitle className="text-base">重点关注</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {milestoneOverview.items.filter((item) => item.status === 'overdue' || item.status === 'soon').slice(0, 3).length === 0 ? (
                    <EmptyState
                      icon={Clock}
                      title="暂时没有临期或延期里程碑"
                      description="当前项目的关键节点整体处于可控范围。"
                      className="py-10"
                    />
                  ) : (
                    milestoneOverview.items
                      .filter((item) => item.status === 'overdue' || item.status === 'soon')
                      .slice(0, 3)
                      .map((milestone) => (
                        <div key={milestone.id} className="rounded-2xl border border-slate-200 p-4">
                          <div className="flex items-center gap-2">
                            <Badge
                              className={
                                milestone.status === 'overdue'
                                  ? 'border-red-200 bg-red-50 text-red-700'
                                  : 'border-amber-200 bg-amber-50 text-amber-700'
                              }
                            >
                              {milestone.statusLabel}
                            </Badge>
                            <Badge variant="outline">{milestone.progress}%</Badge>
                          </div>
                          <p className="mt-3 font-medium text-slate-900">{milestone.name}</p>
                          <p className="mt-1 text-sm text-slate-500">
                            {milestone.targetDate ? formatDate(milestone.targetDate) : '未设置目标日期'}
                          </p>
                          <Button variant="outline" size="sm" className="mt-3" onClick={() => goToTaskList(milestone.id)}>
                            在任务列表打开
                          </Button>
                        </div>
                      ))
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
