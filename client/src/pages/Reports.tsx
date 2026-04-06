import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  ArrowLeft,
  BarChart3,
  CheckSquare,
  ClipboardList,
  FileCheck,
  Flag,
  RefreshCw,
  ShieldAlert,
  type LucideIcon,
} from 'lucide-react'

import { Breadcrumb } from '@/components/Breadcrumb'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { toast } from '@/hooks/use-toast'
import { useStore } from '@/hooks/useStore'
import type { AcceptancePlan, Risk, Task, TaskCondition, TaskObstacle } from '@/lib/supabase'
import { DashboardApiService, type ProjectSummary } from '@/services/dashboardApi'

type AnalysisView = 'overview' | 'progress' | 'risk' | 'license' | 'acceptance' | 'wbs'

type MetricItem = {
  title: string
  value: string | number
  hint?: string
  icon?: ReactNode
}

type AnalysisEntry = {
  view: Exclude<AnalysisView, 'overview'>
  title: string
  description: string
  moduleLabel: string
  actionLabel: string
  icon: LucideIcon
  to: string
}

type DetailStat = {
  label: string
  value: string | number
  hint: string
}

function MetricCard({ title, value, hint, icon }: MetricItem) {
  return (
    <Card className="border-slate-200 shadow-sm">
      <CardContent className="pt-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm text-muted-foreground">{title}</p>
            <div className="mt-2 text-2xl font-bold">{value}</div>
            {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
          </div>
          {icon ? <div className="rounded-lg bg-primary/10 p-2 text-primary">{icon}</div> : null}
        </div>
      </CardContent>
    </Card>
  )
}

function DetailStatCard({ label, value, hint }: DetailStat) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-slate-900">{value}</div>
      <div className="mt-2 text-xs leading-5 text-slate-500">{hint}</div>
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
}: {
  title: string
  description: string
  moduleLabel: string
  actionLabel: string
  onClick: () => void
  icon: ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className="group flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-3">
          <div className="inline-flex rounded-xl bg-blue-50 p-2 text-blue-600">{icon}</div>
          <div>
            <div className="text-xs font-medium uppercase tracking-[0.12em] text-slate-400">{moduleLabel}</div>
            <div className="text-base font-semibold text-slate-900">{title}</div>
            <p className="mt-1 text-sm leading-6 text-slate-500">{description}</p>
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
    case 'archived':
      return '已暂停'
    case 'pending':
      return '待处理'
    default:
      return status
  }
}

function getTaskDisplayName(task: Task) {
  return task.title || task.name || '未命名任务'
}

function getTaskStatus(task: Task) {
  return parseStatusLabel(task.status)
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

function normalizeView(value: string | null): AnalysisView {
  if (value === 'progress' || value === 'risk' || value === 'license' || value === 'acceptance' || value === 'wbs') {
    return value
  }

  return 'overview'
}

export default function Reports() {
  const navigate = useNavigate()
  const { id: routeProjectId } = useParams()
  const [searchParams] = useSearchParams()
  const { currentProject, tasks, risks, conditions, obstacles, acceptancePlans } = useStore()
  const [summaryData, setSummaryData] = useState<ProjectSummary | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const activeView = normalizeView(searchParams.get('view'))
  const projectId = routeProjectId || currentProject?.id || ''
  const projectName = summaryData?.name || currentProject?.name || '当前项目'

  const loadSummary = useCallback(async () => {
    if (!projectId) {
      setSummaryData(null)
      setError('')
      return
    }

    setLoading(true)
    setError(null)
    try {
      const data = await DashboardApiService.getProjectSummary(projectId)
      setSummaryData(data)
      if (!data) {
        setError('当前项目暂无共享摘要数据')
      }
    } catch (err) {
      console.error('[Reports] Failed to load project summary', err)
      setSummaryData(null)
      setError('分析承接数据加载失败，请稍后重试')
      toast({ title: '分析承接加载失败', description: '请稍后重试', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    void loadSummary()
  }, [loadSummary])

  const summary = summaryData
  const projectTasks = useMemo(
    () => tasks.filter((task) => task.project_id === projectId),
    [projectId, tasks],
  )
  const taskIdSet = useMemo(() => new Set(projectTasks.map((task) => task.id).filter(Boolean)), [projectTasks])
  const projectRisks = useMemo(
    () => risks.filter((risk) => risk.project_id === projectId),
    [projectId, risks],
  )
  const projectConditions = useMemo(
    () => conditions.filter((condition) => condition.task_id && taskIdSet.has(condition.task_id)),
    [conditions, taskIdSet],
  )
  const projectObstacles = useMemo(
    () => obstacles.filter((obstacle) => obstacle.task_id && taskIdSet.has(obstacle.task_id)),
    [obstacles, taskIdSet],
  )
  const projectAcceptancePlans = useMemo(
    () => acceptancePlans.filter((plan) => plan.project_id === projectId),
    [acceptancePlans, projectId],
  )
  const milestoneTasks = useMemo(
    () =>
      projectTasks
        .filter((task) => task.is_milestone)
        .sort((left, right) => (left.planned_end_date || '').localeCompare(right.planned_end_date || '')),
    [projectTasks],
  )
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
  const acceptanceFocusRows = useMemo(
    () =>
      [...projectAcceptancePlans]
        .sort((left, right) => (left.planned_date || '').localeCompare(right.planned_date || ''))
        .slice(0, 6),
    [projectAcceptancePlans],
  )
  const wbsFocusRows = useMemo(
    () =>
      [...projectTasks]
        .sort((left, right) => (left.wbs_code || '').localeCompare(right.wbs_code || ''))
        .slice(0, 8),
    [projectTasks],
  )

  const analysisEntries: AnalysisEntry[] = useMemo(
    () => [
      {
        view: 'progress',
        title: '项目进度总览分析',
        description: '从里程碑模块进入，查看项目整体进度、节点完成和交付偏差。',
        moduleLabel: '里程碑',
        actionLabel: '查看项目进度分析',
        icon: Flag,
        to: `/projects/${projectId}/reports?view=progress`,
      },
      {
        view: 'risk',
        title: '风险与问题分析',
        description: '从风险与问题模块进入，查看风险压力、问题聚合和条件阻碍。',
        moduleLabel: '风险与问题',
        actionLabel: '查看风险分析',
        icon: ShieldAlert,
        to: `/projects/${projectId}/reports?view=risk`,
      },
      {
        view: 'license',
        title: '前期证照状态分析',
        description: '从证照管理进入，查看前期证照、图纸审查和延期状态。',
        moduleLabel: '证照管理 / 前期证照',
        actionLabel: '查看证照状态分析',
        icon: CheckSquare,
        to: `/projects/${projectId}/reports?view=license`,
      },
      {
        view: 'acceptance',
        title: '验收进度分析',
        description: '从证照管理进入，查看验收通过率、进行中与补充项情况。',
        moduleLabel: '证照管理 / 验收时间轴',
        actionLabel: '查看验收进度分析',
        icon: FileCheck,
        to: `/projects/${projectId}/reports?view=acceptance`,
      },
      {
        view: 'wbs',
        title: 'WBS完成度分析',
        description: '从任务管理进入，正式承接 WBS 完成度、条件压力和阻碍压力。',
        moduleLabel: '任务管理 / 任务列表',
        actionLabel: '查看 WBS 完成度分析',
        icon: ClipboardList,
        to: `/projects/${projectId}/reports?view=wbs`,
      },
    ],
    [projectId],
  )

  const activeEntry = analysisEntries.find((entry) => entry.view === activeView)

  const viewConfig = useMemo(() => {
    if (activeView === 'progress') {
      return {
        eyebrow: '里程碑分析承接',
        title: '项目进度总览分析',
        subtitle: `${projectName} 的整体进度、里程碑完成率和交付偏差在这里集中查看。`,
        backLabel: '返回里程碑',
        backTo: projectId ? `/projects/${projectId}/milestones` : undefined,
        metrics: [
          { title: '总体进度', value: `${summary?.overallProgress ?? '--'}%`, hint: `共享摘要口径 · 任务总数 ${summary?.totalTasks ?? 0}`, icon: <BarChart3 className="h-4 w-4" /> },
          { title: '里程碑完成', value: `${summary?.completedMilestones ?? 0}/${summary?.totalMilestones ?? 0}`, hint: `完成率 ${summary?.milestoneProgress ?? 0}%`, icon: <Flag className="h-4 w-4" /> },
          { title: '延期任务', value: summary?.delayedTaskCount ?? 0, hint: `延期天数 ${summary?.delayDays ?? 0} · 次数 ${summary?.delayCount ?? 0}`, icon: <ClipboardList className="h-4 w-4" /> },
          { title: '下一个里程碑', value: summary?.nextMilestone?.name || '暂无', hint: summary?.nextMilestone ? `剩余 ${summary.nextMilestone.daysRemaining} 天` : '等待识别关键节点', icon: <Flag className="h-4 w-4" /> },
        ] as MetricItem[],
      }
    }

    if (activeView === 'risk') {
      return {
        eyebrow: '风险分析承接',
        title: '风险与问题分析',
        subtitle: `${projectName} 的风险压力、问题存量、条件未满足和阻碍事项在这里集中承接。`,
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

    if (activeView === 'license') {
      return {
        eyebrow: '证照分析承接',
        title: '前期证照状态分析',
        subtitle: `${projectName} 的前期证照、施工图纸状态和办理延期情况在这里集中查看。`,
        backLabel: '返回前期证照',
        backTo: projectId ? `/projects/${projectId}/pre-milestones` : undefined,
        metrics: [
          { title: '前期证照', value: `${summary?.completedPreMilestoneCount ?? 0}/${summary?.preMilestoneCount ?? 0}`, hint: `进行中 ${summary?.activePreMilestoneCount ?? 0} · 延期 ${summary?.overduePreMilestoneCount ?? 0}`, icon: <CheckSquare className="h-4 w-4" /> },
          { title: '施工图纸', value: `${summary?.issuedConstructionDrawingCount ?? 0}/${summary?.constructionDrawingCount ?? 0}`, hint: `审图中 ${summary?.reviewingConstructionDrawingCount ?? 0}`, icon: <FileCheck className="h-4 w-4" /> },
          { title: '专项准备度', value: (summary?.completedPreMilestoneCount ?? 0) + (summary?.issuedConstructionDrawingCount ?? 0), hint: '证照 + 图纸承接状态', icon: <BarChart3 className="h-4 w-4" /> },
        ] as MetricItem[],
      }
    }

    if (activeView === 'acceptance') {
      return {
        eyebrow: '验收分析承接',
        title: '验收进度分析',
        subtitle: `${projectName} 的验收完成、进行中与未通过项在这里统一查看。`,
        backLabel: '返回验收时间轴',
        backTo: projectId ? `/projects/${projectId}/acceptance` : undefined,
        metrics: [
          {
            title: '验收通过',
            value: `${summary?.passedAcceptancePlanCount ?? 0}/${summary?.acceptancePlanCount ?? 0}`,
            hint: `完成率 ${summary?.acceptancePlanCount ? Math.round(((summary.passedAcceptancePlanCount ?? 0) / summary.acceptancePlanCount) * 100) : 0}%`,
            icon: <FileCheck className="h-4 w-4" />,
          },
          { title: '验收中', value: summary?.inProgressAcceptancePlanCount ?? 0, hint: '正在推进中的验收计划', icon: <RefreshCw className="h-4 w-4" /> },
          { title: '需补充', value: summary?.failedAcceptancePlanCount ?? 0, hint: '未通过 / 待补充事项', icon: <ShieldAlert className="h-4 w-4" /> },
        ] as MetricItem[],
      }
    }

    if (activeView === 'wbs') {
      return {
        eyebrow: '任务管理分析承接',
        title: 'WBS完成度分析',
        subtitle: `${projectName} 的 WBS 完成度、条件压力和阻碍压力正式在任务管理体系内承接。`,
        backLabel: '返回任务列表',
        backTo: projectId ? `/projects/${projectId}/gantt` : undefined,
        metrics: [
          { title: 'WBS进度基数', value: summary?.leafTaskCount ?? 0, hint: `任务总数 ${summary?.totalTasks ?? 0}`, icon: <ClipboardList className="h-4 w-4" /> },
          { title: '已完成任务', value: summary?.completedTaskCount ?? 0, hint: `进行中 ${summary?.inProgressTaskCount ?? 0}`, icon: <CheckSquare className="h-4 w-4" /> },
          { title: 'WBS完成度', value: `${summary?.taskProgress ?? summary?.overallProgress ?? 0}%`, hint: '基于任务主链和共享摘要', icon: <BarChart3 className="h-4 w-4" /> },
          { title: '条件 / 阻碍压力', value: `${summary?.pendingConditionTaskCount ?? 0}/${summary?.activeObstacleTaskCount ?? 0}`, hint: '条件未满足任务 / 受阻任务', icon: <ShieldAlert className="h-4 w-4" /> },
        ] as MetricItem[],
      }
    }

    return {
      eyebrow: '模块分析承接',
      title: '模块分析',
      subtitle: `${projectName} 的分析能力按模块承接，集中在里程碑、风险、证照、验收和任务管理各入口。`,
      backLabel: '返回项目 Dashboard',
      backTo: projectId ? `/projects/${projectId}/dashboard` : undefined,
      metrics: [
        { title: '总体进度', value: `${summary?.overallProgress ?? '--'}%`, hint: '共享摘要口径', icon: <BarChart3 className="h-4 w-4" /> },
        { title: '健康度', value: summary?.healthScore ?? '--', hint: summary?.healthStatus || '共享摘要口径', icon: <ShieldAlert className="h-4 w-4" /> },
        { title: '活跃风险', value: summary?.activeRiskCount ?? 0, hint: `总风险 ${summary?.riskCount ?? 0}`, icon: <ShieldAlert className="h-4 w-4" /> },
        { title: '里程碑完成', value: `${summary?.completedMilestones ?? 0}/${summary?.totalMilestones ?? 0}`, hint: `完成率 ${summary?.milestoneProgress ?? 0}%`, icon: <Flag className="h-4 w-4" /> },
      ] as MetricItem[],
    }
  }, [activeView, projectId, projectName, summary])

  const currentMetrics = viewConfig.metrics
  const otherEntries = activeView === 'overview' ? analysisEntries : analysisEntries.filter((entry) => entry.view !== activeView)
  const hasSummary = Boolean(summary)
  const infoCardTitle = activeEntry ? `${activeEntry.moduleLabel} · 正式承接` : '分析入口说明'
  const infoCardDescription = activeEntry
    ? `${activeEntry.title} 的分析能力集中在对应业务模块。这里提供集中查看入口。`
    : '这里集中列出 5 类模块分析入口，可从各模块页直接进入对应分析视图。'

  const openEntry = (entry: AnalysisEntry) => {
    if (!projectId) return
    navigate(entry.to)
  }

  const renderProgressDetail = () => (
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
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-800">
            {delayedTasks.length > 0
              ? `当前共有 ${delayedTasks.length} 个延期任务，建议优先处理与“${summary?.nextMilestone?.name || '下一里程碑'}”直接相关的节点。`
              : '当前未发现明显延期任务，可以继续按现有节奏推进。'}
          </div>
        </CardContent>
      </Card>

      <Card className="border-slate-200 shadow-sm">
        <CardHeader className="pb-4">
          <CardTitle className="text-base">里程碑窗口</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {milestoneTasks.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
              暂无里程碑任务
            </div>
          ) : (
            milestoneTasks.slice(0, 5).map((task) => (
              <div key={task.id} className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-medium text-slate-900">{getTaskDisplayName(task)}</div>
                  <div className="text-xs text-slate-500">{getTaskStatus(task)}</div>
                </div>
                <div className="mt-2 text-xs text-slate-500">
                  计划日期 {formatDateLabel(task.planned_end_date || task.end_date)} · 当前进度 {task.progress ?? 0}%
                </div>
              </div>
            ))
          )}
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
            <CardTitle className="text-base">处置建议</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm leading-6 text-slate-600">
            <div className="rounded-2xl border border-red-200 bg-red-50 p-4">
              当前优先关注 {focusRisks.length > 0 ? `“${focusRisks[0].title || '最高风险事项'}”` : '风险与问题联动'}，
              先排查高等级风险，再同步确认条件与阻碍的解除节奏。
            </div>
            <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
              如果需要继续处置，请回到“风险与问题”主模块执行，不在本页直接写入业务数据。
            </div>
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
                    <div className="mt-1 text-xs text-slate-500">{risk.description || '暂无补充说明'}</div>
                  </div>
                  <div className="text-sm text-slate-700">等级 {risk.level || '未分类'}</div>
                  <div className="text-sm text-slate-700">来源 {summarizeRiskSource(risk)}</div>
                  <div className="text-sm text-slate-700">状态 {parseStatusLabel(risk.status)}</div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    )
  }

  const renderLicenseDetail = () => (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(360px,0.9fr)]">
      <Card className="border-slate-200 shadow-sm">
        <CardHeader className="pb-4">
          <CardTitle className="text-base">证照与图纸状态</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <DetailStatCard
            label="前期证照"
            value={`${summary?.completedPreMilestoneCount ?? 0}/${summary?.preMilestoneCount ?? 0}`}
            hint={`进行中 ${summary?.activePreMilestoneCount ?? 0} · 延期 ${summary?.overduePreMilestoneCount ?? 0}`}
          />
          <DetailStatCard
            label="施工图纸"
            value={`${summary?.issuedConstructionDrawingCount ?? 0}/${summary?.constructionDrawingCount ?? 0}`}
            hint={`审图中 ${summary?.reviewingConstructionDrawingCount ?? 0}`}
          />
          <DetailStatCard
            label="专项准备度"
            value={(summary?.completedPreMilestoneCount ?? 0) + (summary?.issuedConstructionDrawingCount ?? 0)}
            hint="证照与图纸已完成项合计"
          />
        </CardContent>
      </Card>

      <Card className="border-slate-200 shadow-sm">
        <CardHeader className="pb-4">
          <CardTitle className="text-base">当前缺口</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm leading-6 text-slate-600">
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
            {summary?.overduePreMilestoneCount
              ? `当前有 ${summary.overduePreMilestoneCount} 项前期证照存在延期，建议优先回到前期证照模块核对办理状态。`
              : '当前前期证照暂无明显延期，可继续关注图纸与验收准备度。'}
          </div>
          <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
            这里聚合展示专项状态，具体操作仍回到“前期证照”页面完成。
          </div>
        </CardContent>
      </Card>

      <Card className="border-slate-200 shadow-sm xl:col-span-2">
        <CardHeader className="pb-4">
          <CardTitle className="text-base">专项状态判断</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {[
            {
              title: '前期证照',
              value: `${summary?.completedPreMilestoneCount ?? 0}/${summary?.preMilestoneCount ?? 0}`,
              hint: `进行中 ${summary?.activePreMilestoneCount ?? 0} · 延期 ${summary?.overduePreMilestoneCount ?? 0}`,
            },
            {
              title: '施工图纸',
              value: `${summary?.issuedConstructionDrawingCount ?? 0}/${summary?.constructionDrawingCount ?? 0}`,
              hint: `审图中 ${summary?.reviewingConstructionDrawingCount ?? 0}`,
            },
          ].map((item) => (
            <div key={item.title} className="rounded-2xl border border-slate-100 bg-white px-4 py-4">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-medium text-slate-900">{item.title}</div>
                <div className="text-sm font-semibold text-slate-900">{item.value}</div>
              </div>
              <div className="mt-2 text-xs text-slate-500">{item.hint}</div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )

  const renderAcceptanceDetail = () => (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(360px,0.9fr)]">
      <Card className="border-slate-200 shadow-sm">
        <CardHeader className="pb-4">
          <CardTitle className="text-base">验收通过与补充情况</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <DetailStatCard
            label="验收通过"
            value={`${summary?.passedAcceptancePlanCount ?? 0}/${summary?.acceptancePlanCount ?? 0}`}
            hint={`完成率 ${summary?.acceptancePlanCount ? Math.round(((summary.passedAcceptancePlanCount ?? 0) / summary.acceptancePlanCount) * 100) : 0}%`}
          />
          <DetailStatCard label="验收中" value={summary?.inProgressAcceptancePlanCount ?? 0} hint="正在推进中的验收计划" />
          <DetailStatCard label="需补充" value={summary?.failedAcceptancePlanCount ?? 0} hint="未通过 / 待补充项" />
        </CardContent>
      </Card>

      <Card className="border-slate-200 shadow-sm">
        <CardHeader className="pb-4">
          <CardTitle className="text-base">当前判断</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm leading-6 text-slate-600">
          <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4">
            {projectAcceptancePlans.length > 0
              ? `当前验收记录共 ${projectAcceptancePlans.length} 项，建议优先检查未通过和验收中的节点。`
              : '当前没有本地验收计划明细，先以共享摘要的通过率与进行中数量做判断。'}
          </div>
        </CardContent>
      </Card>

      <Card className="border-slate-200 shadow-sm xl:col-span-2">
        <CardHeader className="pb-4">
          <CardTitle className="text-base">验收节点明细</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {acceptanceFocusRows.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
              暂无验收明细数据
            </div>
          ) : (
            acceptanceFocusRows.map((plan) => (
              <div key={plan.id} className="grid gap-3 rounded-2xl border border-slate-100 bg-white px-4 py-4 md:grid-cols-[minmax(0,1.3fr)_140px_140px_160px]">
                <div>
                  <div className="text-sm font-medium text-slate-900">{plan.acceptance_name || '未命名验收'}</div>
                  <div className="mt-1 text-xs text-slate-500">{plan.acceptance_type || '未分类验收'}</div>
                </div>
                <div className="text-sm text-slate-700">状态 {plan.status || '待验收'}</div>
                <div className="text-sm text-slate-700">计划 {formatDateLabel(plan.planned_date)}</div>
                <div className="text-sm text-slate-700">实际 {formatDateLabel(plan.actual_date)}</div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  )

  const renderWbsDetail = () => (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.12fr)_minmax(360px,0.88fr)]">
      <Card className="border-slate-200 shadow-sm">
        <CardHeader className="pb-4">
          <CardTitle className="text-base">WBS完成与压力概况</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <DetailStatCard label="WBS基数" value={summary?.leafTaskCount ?? projectTasks.length} hint={`任务总数 ${summary?.totalTasks ?? projectTasks.length}`} />
          <DetailStatCard label="已完成任务" value={summary?.completedTaskCount ?? projectTasks.filter(isCompletedTask).length} hint={`进行中 ${summary?.inProgressTaskCount ?? 0}`} />
          <DetailStatCard label="WBS完成度" value={`${summary?.taskProgress ?? summary?.overallProgress ?? 0}%`} hint="基于任务主链和共享摘要" />
          <DetailStatCard label="条件 / 阻碍压力" value={`${projectConditions.length}/${projectObstacles.length}`} hint="条件项 / 阻碍项" />
        </CardContent>
      </Card>

      <Card className="border-slate-200 shadow-sm">
        <CardHeader className="pb-4">
          <CardTitle className="text-base">条件与阻碍判断</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm leading-6 text-slate-600">
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
            {projectConditions.length > 0 || projectObstacles.length > 0
              ? `当前有 ${projectConditions.length} 项条件、${projectObstacles.length} 项阻碍需要关注，建议优先处理受阻任务。`
              : '当前条件与阻碍压力较低，可继续按 WBS 节点推进。'}
          </div>
          <div className="flex flex-wrap gap-2">
            {Array.from(
              projectObstacles.reduce((map, obstacle) => {
                const severity = getObstacleSeverity(obstacle)
                map.set(severity, (map.get(severity) || 0) + 1)
                return map
              }, new Map<string, number>()),
            ).map(([severity, count]) => (
              <span key={severity} className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600">
                {severity} {count}
              </span>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="border-slate-200 shadow-sm xl:col-span-2">
        <CardHeader className="pb-4">
          <CardTitle className="text-base">WBS节点明细</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {wbsFocusRows.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
              暂无 WBS 节点明细
            </div>
          ) : (
            wbsFocusRows.map((task) => {
              const taskConditionCount = projectConditions.filter((condition) => condition.task_id === task.id).length
              const taskObstacleCount = projectObstacles.filter((obstacle) => obstacle.task_id === task.id).length
              return (
                <div key={task.id} className="grid gap-3 rounded-2xl border border-slate-100 bg-white px-4 py-4 md:grid-cols-[minmax(0,1.25fr)_120px_120px_120px_120px]">
                  <div>
                    <div className="text-sm font-medium text-slate-900">{getTaskDisplayName(task)}</div>
                    <div className="mt-1 text-xs text-slate-500">WBS {task.wbs_code || '未编码'} · {getTaskStatus(task)}</div>
                  </div>
                  <div className="text-sm text-slate-700">进度 {task.progress ?? 0}%</div>
                  <div className="text-sm text-slate-700">条件 {taskConditionCount}</div>
                  <div className="text-sm text-slate-700">阻碍 {taskObstacleCount}</div>
                  <div className={`text-sm font-medium ${isDelayedTask(task) ? 'text-red-600' : 'text-slate-700'}`}>
                    {isDelayedTask(task) ? '延期' : '正常'}
                  </div>
                </div>
              )
            })
          )}
        </CardContent>
      </Card>
    </div>
  )

  const renderActiveDetail = () => {
    switch (activeView) {
      case 'progress':
        return renderProgressDetail()
      case 'risk':
        return renderRiskDetail()
      case 'license':
        return renderLicenseDetail()
      case 'acceptance':
        return renderAcceptanceDetail()
      case 'wbs':
        return renderWbsDetail()
      default:
        return null
    }
  }

  return (
    <div className="space-y-6">
      <Breadcrumb
        items={[
          { label: '公司驾驶舱', href: '/company' },
          ...(projectId ? [{ label: projectName, href: `/projects/${projectId}/dashboard` }] : []),
          { label: '模块分析' },
          ...(activeEntry ? [{ label: activeEntry.title }] : []),
        ]}
      />

      <PageHeader eyebrow={viewConfig.eyebrow} title={viewConfig.title} subtitle={viewConfig.subtitle}>
        {viewConfig.backTo && (
          <Button variant="outline" onClick={() => navigate(viewConfig.backTo!)}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            {viewConfig.backLabel}
          </Button>
        )}
        {activeView !== 'overview' && (
          <Button variant="outline" onClick={() => navigate(`/projects/${projectId}/reports`)}>
            <BarChart3 className="mr-2 h-4 w-4" />
            全部分析
          </Button>
        )}
        <Button onClick={loadSummary} disabled={loading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          刷新
        </Button>
      </PageHeader>

      {hasSummary ? (
        <Card className="border-slate-200 shadow-sm">
          <CardContent className="grid gap-4 pt-6 md:grid-cols-2 xl:grid-cols-4">
            {currentMetrics.map((card) => (
              <MetricCard key={card.title} {...card} />
            ))}
          </CardContent>
        </Card>
      ) : (
        <Card className="border-slate-200 shadow-sm">
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            {loading ? '分析承接加载中...' : error || '暂无分析承接数据'}
          </CardContent>
        </Card>
      )}

      {activeView === 'overview' ? (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,0.95fr)_minmax(360px,0.75fr)]">
          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="pb-4">
              <CardTitle className="text-base">{infoCardTitle}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm leading-6 text-slate-500">
              <p>{infoCardDescription}</p>
              <p>当前口径只做模块化分析展示与入口承接，不改动共享摘要、任务主链、风险问题链和证照/验收/图纸业务契约。</p>
              <div className="flex flex-wrap gap-2">
                <span className="badge-base bg-slate-100 text-slate-600">共 {analysisEntries.length} 类分析</span>
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="pb-4">
              <CardTitle className="text-base">承接规则</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm leading-6 text-slate-500">
              <p>分析能力按模块承接，各模块页都有对应的分析入口。</p>
              <p>里程碑、风险与问题、前期证照、验收时间轴、任务管理分别承接 5 类分析。</p>
              <p>这里保留集中查看与历史入口兼容，便于后续从各模块直达。</p>
            </CardContent>
          </Card>
        </div>
      ) : (
        <>
          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="pb-4">
              <CardTitle className="text-base">{infoCardTitle}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm leading-6 text-slate-500">
              <p>{infoCardDescription}</p>
              <p>当前分析以共享摘要和现有业务数据为准，只做读取与展示，不在此页直接改写业务数据。</p>
            </CardContent>
          </Card>
          {renderActiveDetail()}
        </>
      )}

      <Card className="border-slate-200 shadow-sm">
        <CardHeader className="border-b border-slate-100 pb-4">
          <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
            <div>
              <CardTitle className="text-base">{activeView === 'overview' ? '模块分析入口' : '切换其他分析'}</CardTitle>
              <p className="mt-1 text-sm text-slate-500">
                {activeView === 'overview' ? '按最新口径统一承接 5 类分析能力。' : '当前分析已就位，其他分析继续按模块切换承接。'}
              </p>
            </div>
            <div className="text-sm text-slate-400">
              {activeView === 'overview' ? `共 ${analysisEntries.length} 类分析` : `当前：${activeEntry?.title}`}
            </div>
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 pt-6 md:grid-cols-2 xl:grid-cols-3">
          {otherEntries.map((entry) => (
            <AnalysisEntryCard
              key={entry.view}
              title={entry.title}
              description={entry.description}
              moduleLabel={entry.moduleLabel}
              actionLabel={entry.actionLabel}
              icon={<entry.icon className="h-4 w-4" />}
              onClick={() => openEntry(entry)}
            />
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
