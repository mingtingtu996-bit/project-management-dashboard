import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { AssigneeProgressCard } from '@/components/AssigneeProgressCard'
import DashboardCompareCard from '@/components/DashboardCompareCard'
import DashboardHealthCard from '@/components/DashboardHealthCard'
import DashboardMilestoneCard from '@/components/DashboardMilestoneCard'
import { PageHeader } from '@/components/PageHeader'
import ProjectInfoCard from '@/components/ProjectInfoCard'
import RecentTasksCard from '@/components/RecentTasksCard'
import { TaskStatusCard } from '@/components/TaskStatusCard'
import { UnitProgressCard } from '@/components/UnitProgressCard'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useStore } from '@/hooks/useStore'
import { useToast } from '@/hooks/use-toast'
import { calculateHealthDetails } from '@/lib/healthScore'
import { getTaskDisplayStatus, isCompletedTask, isDelayedTask } from '@/lib/dashboardStatus'
import { DashboardApiService, type ProjectSummary } from '@/services/dashboardApi'
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Building2,
  Calendar,
  ChevronDown,
  ChevronUp,
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

function statusClass(status: ProjectStatus | string): string {
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

function progressToneClass(progress: number): string {
  if (progress >= 80) return 'bg-emerald-500'
  if (progress >= 45) return 'bg-blue-500'
  if (progress > 0) return 'bg-amber-500'
  return 'bg-slate-300'
}

function healthToneClass(score: number): string {
  if (score >= 80) return 'bg-emerald-50 text-emerald-700'
  if (score >= 60) return 'bg-blue-50 text-blue-700'
  if (score >= 40) return 'bg-amber-50 text-amber-700'
  return 'bg-red-50 text-red-700'
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
  if (!summary) return '等待摘要返回健康状态'
  return summary.healthStatus || '暂无健康状态说明'
}

function DashboardHero({
  currentProject,
  currentStatus,
  summaryData,
  nextMilestone,
  summaryLoading,
}: {
  currentProject: CurrentProjectEntity
  currentStatus: ProjectStatus
  summaryData: ProjectSummary | null
  nextMilestone: ProjectSummary['nextMilestone']
  summaryLoading: boolean
}) {
  const projectOverview = [
    {
      label: '项目健康',
      value: String(summaryData?.healthScore ?? 0),
      hint: buildHealthSummary(summaryData),
      icon: Activity,
      tone: 'bg-blue-50 text-blue-600',
    },
    {
      label: '执行进展',
      value: `${summaryData?.overallProgress ?? 0}%`,
      hint: `${summaryData?.completedTaskCount ?? 0}/${summaryData?.leafTaskCount ?? 0} 个末级任务已完成`,
      icon: Target,
      tone: 'bg-emerald-50 text-emerald-600',
    },
    {
      label: '关键节点',
      value: `${summaryData?.completedMilestones ?? 0}/${summaryData?.totalMilestones ?? 0}`,
      hint: formatMilestoneHint(summaryData),
      icon: Flag,
      tone: 'bg-amber-50 text-amber-600',
    },
  ]

  const recentChanges: ChangeItem[] = [
    {
      label: '延迟任务',
      value: summaryData?.delayedTaskCount ?? 0,
      hint: `累计偏差 ${summaryData?.delayDays ?? 0} 天`,
      tone: 'bg-red-50 text-red-700',
    },
    {
      label: '活跃风险',
      value: summaryData?.activeRiskCount ?? 0,
      hint: '当前需要持续跟进',
      tone: 'bg-amber-50 text-amber-700',
    },
    {
      label: '活跃阻碍',
      value: summaryData?.activeObstacleCount ?? 0,
      hint: '主链推进中的卡点',
      tone: 'bg-orange-50 text-orange-700',
    },
    {
      label: '待满足条件',
      value: summaryData?.pendingConditionTaskCount ?? 0,
      hint: '开工前要继续消化的项',
      tone: 'bg-blue-50 text-blue-700',
    },
  ]

  return (
    <section className="shell-surface overflow-hidden">
      <div className="grid gap-px bg-slate-100 xl:grid-cols-[minmax(0,1.55fr)_340px]">
        <div className="bg-white px-6 py-6">
          <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
              <div className="flex items-start gap-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-3xl bg-slate-950 shadow-lg shadow-slate-900/10">
                  <Building2 className="h-6 w-6 text-white" />
                </div>
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`badge-base ${statusClass(summaryData?.statusLabel || currentStatus)}`}>
                      {summaryData?.statusLabel || currentStatus}
                    </span>
                    <span className={`badge-base ${healthToneClass(summaryData?.healthScore ?? 0)}`}>
                      健康度 {summaryData?.healthScore ?? 0}
                    </span>
                    <span className="badge-base bg-slate-100 text-slate-700">
                      里程碑 {summaryData?.completedMilestones ?? 0}/{summaryData?.totalMilestones ?? 0}
                    </span>
                    <span className="badge-base bg-slate-100 text-slate-700">项目总览</span>
                  </div>
                  <div>
                    <h1 className="shell-section-title">{currentProject.name}</h1>
                    <p className="shell-subtitle max-w-3xl">
                      查看项目健康度、执行概况、关键节点和专项准备度的综合视图。
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              {projectOverview.map((item) => (
                <div key={item.label} className="rounded-[24px] bg-slate-50 px-5 py-5">
                  <div className="flex items-center justify-between">
                    <div className="text-sm text-slate-500">{item.label}</div>
                    <div className={`rounded-2xl p-2 ${item.tone}`}>
                      <item.icon className="h-4 w-4" />
                    </div>
                  </div>
                  <div className="mt-3 text-3xl font-semibold tracking-tight text-slate-900">{item.value}</div>
                  <p className="mt-2 text-xs text-slate-500">{item.hint}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="bg-slate-950 px-6 py-6 text-white">
          <div className="space-y-5">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">近期变化</div>
              <h2 className="mt-3 text-[26px] font-semibold tracking-tight text-white">项目脉冲</h2>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                集中查看延迟、风险、阻碍和条件等关键信号，及时发现需要跟进的变化。
              </p>
            </div>

            <div className="rounded-[28px] border border-white/10 bg-white/5 p-5">
              <div className="text-xs text-slate-400">当前交付压力</div>
              <div className="mt-3 text-4xl font-semibold tracking-tight text-white">
                {(summaryData?.activeRiskCount ?? 0) +
                  (summaryData?.delayedTaskCount ?? 0) +
                  (summaryData?.activeObstacleTaskCount ?? 0) +
                  (summaryData?.pendingConditionTaskCount ?? 0)}
              </div>
              <p className="mt-2 text-xs text-slate-400">风险、延期、阻碍和条件未满足的合计信号。</p>
            </div>

            <div className="space-y-3">
              {recentChanges.map((item) => (
                <div key={item.label} className="rounded-3xl border border-white/10 bg-white/5 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-xs text-slate-400">{item.label}</div>
                    <span className={`badge-base ${item.tone}`}>{item.value}</span>
                  </div>
                  <p className="mt-1 text-xs text-slate-400">{item.hint}</p>
                </div>
              ))}
            </div>

            <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
              <div className="text-xs text-slate-400">下一关键节点</div>
              <div className="mt-2 text-2xl font-semibold text-white">
                {nextMilestone?.name || '暂无待推进关键节点'}
              </div>
              <p className="mt-1 text-xs text-slate-400">{formatMilestoneHint(summaryData)}</p>
            </div>
          </div>
        </div>
      </div>

      {summaryLoading && (
        <div className="border-t border-slate-100 bg-white px-6 py-3 text-xs text-slate-500">
          摘要正在刷新中，当前保留已有页面内容。
        </div>
      )}
    </section>
  )
}

// 问题与风险 2×2 语义色网格
function IssueRiskGrid({ summaryData, projectId }: { summaryData: ProjectSummary | null; projectId: string }) {
  const [topRisksExpanded, setTopRisksExpanded] = useState(false)
  const [topRisks, setTopRisks] = useState<Array<{ id: string; title: string; level: string; status: string }>>([])
  const [topRisksLoading, setTopRisksLoading] = useState(false)

  // 展开时加载 Top-5 紧急问题
  const loadTopRisks = useCallback(async () => {
    if (topRisks.length > 0 || topRisksLoading) return
    setTopRisksLoading(true)
    try {
      const res = await fetch(`/api/dashboard/top-risks?limit=5&projectId=${projectId}`)
      if (res.ok) {
        const data = await res.json()
        if (data.success && Array.isArray(data.data)) {
          setTopRisks(data.data)
        }
      }
    } catch (err) {
      console.error('获取Top-5紧急问题失败:', err)
    } finally {
      setTopRisksLoading(false)
    }
  }, [projectId, topRisks.length, topRisksLoading])

  const handleToggleTopRisks = () => {
    const next = !topRisksExpanded
    setTopRisksExpanded(next)
    if (next) void loadTopRisks()
  }

  const riskLevelColor: Record<string, string> = {
    critical: 'border-l-red-500',
    high: 'border-l-orange-500',
    medium: 'border-l-amber-500',
    low: 'border-l-blue-400',
  }

  const cells = [
    {
      label: '延期任务',
      value: summaryData?.delayedTaskCount ?? 0,
      icon: AlertTriangle,
      bg: 'bg-red-50',
      iconColor: 'text-red-500',
      textColor: 'text-red-700',
      badgeBg: 'bg-red-100 text-red-700',
      to: `/projects/${projectId}/gantt`,
    },
    {
      label: '受阻任务',
      value: summaryData?.activeObstacleCount ?? 0,
      icon: ShieldAlert,
      bg: 'bg-orange-50',
      iconColor: 'text-orange-500',
      textColor: 'text-orange-700',
      badgeBg: 'bg-orange-100 text-orange-700',
      to: `/projects/${projectId}/gantt`,
    },
    {
      label: '开工条件',
      value: summaryData?.pendingConditionTaskCount ?? 0,
      icon: Flag,
      bg: 'bg-amber-50',
      iconColor: 'text-amber-500',
      textColor: 'text-amber-700',
      badgeBg: 'bg-amber-100 text-amber-700',
      to: `/projects/${projectId}/gantt`,
    },
    {
      label: '风险预警',
      value: summaryData?.activeRiskCount ?? 0,
      icon: Activity,
      bg: 'bg-purple-50',
      iconColor: 'text-purple-500',
      textColor: 'text-purple-700',
      badgeBg: 'bg-purple-100 text-purple-700',
      to: `/projects/${projectId}/risks`,
    },
  ]

  return (
    <Card className="card-l2 border-slate-100">
      <CardHeader className="pb-3">
        <CardTitle className="text-base text-slate-900">问题与风险</CardTitle>
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

        {/* Top-5 紧急问题可折叠展开区 */}
        <div className="border-t border-slate-100 pt-2">
          <button
            onClick={handleToggleTopRisks}
            className="flex w-full items-center justify-between text-sm font-medium text-slate-600 hover:text-slate-800 transition-colors py-1"
          >
            <span>Top-5 紧急问题</span>
            {topRisksExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
          {topRisksExpanded && (
            <div className="mt-2 space-y-2">
              {topRisksLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-10 rounded-lg bg-gray-100 animate-pulse" />
                  ))}
                </div>
              ) : topRisks.length > 0 ? (
                topRisks.map((risk) => (
                  <Link
                    key={risk.id}
                    to={`/projects/${projectId}/risks`}
                    className={`block p-2.5 bg-white border border-gray-100 rounded-lg hover:shadow-sm transition-shadow border-l-4 ${riskLevelColor[risk.level] || 'border-l-gray-300'}`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-800 truncate">{risk.title}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        risk.level === 'critical' ? 'bg-red-100 text-red-700' :
                        risk.level === 'high' ? 'bg-orange-100 text-orange-700' :
                        risk.level === 'medium' ? 'bg-amber-100 text-amber-700' :
                        'bg-blue-100 text-blue-700'
                      }`}>
                        {risk.level === 'critical' ? '严重' : risk.level === 'high' ? '高' : risk.level === 'medium' ? '中' : '低'}
                      </span>
                    </div>
                  </Link>
                ))
              ) : (
                <div className="text-center py-4 text-sm text-gray-400">
                  暂无紧急问题
                </div>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

function DashboardSupport({
  currentProject,
  currentStatus,
  summaryData,
  specialtyItems,
  quickLinks,
}: {
  currentProject: CurrentProjectEntity
  currentStatus: ProjectStatus
  summaryData: ProjectSummary | null
  specialtyItems: PrepItem[]
  quickLinks: EntryItem[]
}) {
  // key-value 组织感的项目基本信息
  const projectInfoRows = [
    { label: '项目名称', value: currentProject.name, icon: Building2 },
    { label: '当前阶段', value: summaryData?.statusLabel || currentStatus, icon: Activity },
    { label: '负责人', value: currentProject.owner_id || currentProject.created_by || '未设置', icon: Users },
    { label: '计划开始', value: currentProject.planned_start_date || '--', icon: Calendar },
    { label: '计划结束', value: currentProject.planned_end_date || '--', icon: TimerReset },
    { label: '下一节点', value: summaryData?.nextMilestone?.name || '暂无', icon: Flag },
  ]

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.9fr)]">
      <div className="space-y-6">
        {/* ProjectInfoCard — 项目基本信息 key-value 结构 */}
        <ProjectInfoCard
          projectName={currentProject.name}
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
        />

        <Card className="card-l2 border-slate-100">
          <CardHeader className="pb-3">
            <CardTitle className="text-xl text-slate-900">专项准备度</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {specialtyItems.map((item) => (
              <div key={item.label} className="rounded-2xl bg-slate-50 p-4">
                <div className="text-sm text-slate-500">{item.label}</div>
                <div className="mt-2 text-2xl font-semibold text-slate-900">{item.value}</div>
                <p className="mt-2 text-xs text-slate-500">{item.hint}</p>
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
                <Link to={item.to}>
                  <span className="flex items-center gap-3">
                    <span className="rounded-2xl bg-slate-100 p-2 text-slate-700">
                      <item.icon className="h-4 w-4" />
                    </span>
                    <span className="flex flex-col">
                      <span className="text-sm font-medium text-slate-900">{item.label}</span>
                      <span className="text-xs text-slate-500">{item.description}</span>
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
  const navigate = useNavigate()
  const [summary, setSummary] = useState<ProjectSummary | null>(null)
  const [summaryLoading, setSummaryLoading] = useState(false)

  const currentStatus = normalizeProjectStatus(currentProject?.status)
  const summaryData = summary
  const nextMilestone = summaryData?.nextMilestone ?? null
  const scopedTasks = useMemo(
    () => tasks.filter((task) => task.project_id === currentProject?.id),
    [currentProject?.id, tasks],
  )

  // 健康度详情（前端计算，用于 DashboardHealthCard）
  const healthDetails = useMemo(() => {
    if (!summaryData) return undefined
    const risks = Array.from({ length: summaryData.activeRiskCount }, () => ({ level: 'medium', status: 'open' }))
    return calculateHealthDetails({
      completedTasks: summaryData.completedTaskCount,
      completedMilestones: summaryData.completedMilestones,
      totalDelayDays: summaryData.delayDays ?? 0,
      risks,
    })
  }, [summaryData])

  const loadSummary = useCallback(async () => {
    if (!currentProject?.id) return

    setSummaryLoading(true)
    try {
      const nextSummary = await DashboardApiService.getProjectSummary(currentProject.id)
      setSummary(nextSummary)
    } catch (error) {
      console.error('Failed to load project dashboard summary:', error)
      toast({
        title: '加载失败',
        description: '项目摘要暂时无法刷新，请稍后再试。',
        variant: 'destructive',
      })
    } finally {
      setSummaryLoading(false)
    }
  }, [currentProject?.id, toast])

  useEffect(() => {
    void loadSummary()
  }, [loadSummary])

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
      label: '任务管理',
      to: `/projects/${currentProject?.id}/gantt`,
      icon: FolderKanban,
      description: '查看任务主链、WBS 和进度拆解',
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
      label: '证照管理',
      to: `/projects/${currentProject?.id}/pre-milestones`,
      icon: LayoutDashboard,
      description: '查看证照、验收和图纸准备度',
    },
    {
      label: '任务总结',
      to: `/projects/${currentProject?.id}/task-summary`,
      icon: Activity,
      description: '查看任务复盘、趋势与责任人分析',
    },
    {
      label: '模块分析',
      to: `/projects/${currentProject?.id}/reports`,
      icon: BarChart3,
      description: '查看项目进度、风险、证照、验收和 WBS 分析承接',
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

  const assigneeProgress = useMemo(() => {
    const grouped = new Map<string, { id: string; name: string; totalProgress: number; taskCount: number; completedTasks: number }>()

    scopedTasks.forEach((task) => {
      const name = task.assignee_name || task.assignee || '未分配'
      const current = grouped.get(name) || {
        id: name,
        name,
        totalProgress: 0,
        taskCount: 0,
        completedTasks: 0,
      }

      current.totalProgress += Math.max(0, Math.min(100, Number(task.progress ?? 0)))
      current.taskCount += 1
      if (isCompletedTask(task)) current.completedTasks += 1
      grouped.set(name, current)
    })

    return Array.from(grouped.values()).map((item) => ({
      id: item.id,
      name: item.name,
      progress: item.taskCount > 0 ? Math.round(item.totalProgress / item.taskCount) : 0,
      taskCount: item.taskCount,
      completedTasks: item.completedTasks,
    }))
  }, [scopedTasks])

  const unitProgress = useMemo(() => {
    const grouped = new Map<string, { id: string; name: string; totalProgress: number; taskCount: number; completedTasks: number }>()

    scopedTasks.forEach((task) => {
      const name = task.assignee_unit || task.responsible_unit || '未分配单位'
      const current = grouped.get(name) || {
        id: name,
        name,
        totalProgress: 0,
        taskCount: 0,
        completedTasks: 0,
      }

      current.totalProgress += Math.max(0, Math.min(100, Number(task.progress ?? 0)))
      current.taskCount += 1
      if (isCompletedTask(task)) current.completedTasks += 1
      grouped.set(name, current)
    })

    return Array.from(grouped.values()).map((item) => ({
      id: item.id,
      name: item.name,
      type: 'general' as const,
      progress: item.taskCount > 0 ? Math.round(item.totalProgress / item.taskCount) : 0,
      taskCount: item.taskCount,
      completedTasks: item.completedTasks,
    }))
  }, [scopedTasks])

  if (!currentProject) {
    return (
      <div className="space-y-6 p-6">
        <Alert>
          <Users className="h-4 w-4" />
          <AlertDescription>请先进入一个项目，再查看项目 Dashboard。</AlertDescription>
        </Alert>
        <Button asChild>
          <Link to="/company">返回公司驾驶舱</Link>
        </Button>
      </div>
    )
  }

  return (
    <div className="page-enter space-y-6 bg-slate-50/80 p-6">
      <div className="mx-auto max-w-[1680px] space-y-6">
        <PageHeader
          eyebrow="项目工作台"
          title={currentProject.name}
          subtitle="查看当前项目的健康度、执行概况、近期变化和专项准备度，并快速跳转到各管理模块。"
        >
          <Badge variant="secondary">{summaryData?.statusLabel || currentStatus}</Badge>
          <Button variant="outline" size="sm" onClick={() => void loadSummary()} disabled={summaryLoading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${summaryLoading ? 'animate-spin' : ''}`} />
            刷新摘要
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link to="/company">
              <LayoutDashboard className="mr-2 h-4 w-4" />
              返回公司驾驶舱
            </Link>
          </Button>
        </PageHeader>

        <DashboardHero
          currentProject={currentProject}
          currentStatus={currentStatus}
          summaryData={summaryData}
          nextMilestone={nextMilestone}
          summaryLoading={summaryLoading}
        />

        {/* 第一行：健康度卡 + 问题风险 2×2 + 里程碑摘要 */}
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
          <DashboardHealthCard
            healthScore={summaryData?.healthScore ?? 0}
            trend="stable"
            details={buildHealthSummary(summaryData)}
            healthDetails={healthDetails}
            projectId={currentProject.id}
          />
          <IssueRiskGrid summaryData={summaryData} projectId={currentProject.id} />
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
                      projectId: currentProject.id,
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

        <DashboardSupport
          currentProject={currentProject}
          currentStatus={currentStatus}
          summaryData={summaryData}
          specialtyItems={specialtyItems}
          quickLinks={quickLinks}
        />

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <TaskStatusCard
            completed={taskStatusSummary.completed}
            inProgress={taskStatusSummary.inProgress}
            notStarted={taskStatusSummary.notStarted}
            delayed={taskStatusSummary.delayed}
            projectId={currentProject.id}
          />
          <RecentTasksCard projectId={currentProject.id} tasks={scopedTasks} />
          <AssigneeProgressCard
            assignees={assigneeProgress}
            onViewAll={() => navigate(`/projects/${currentProject.id}/gantt`)}
          />
          <UnitProgressCard
            units={unitProgress}
            onViewAll={() => navigate(`/projects/${currentProject.id}/gantt`)}
          />
        </div>

        <DashboardCompareCard projectId={currentProject.id} />
      </div>
    </div>
  )
}
