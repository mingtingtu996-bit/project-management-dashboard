import { useCallback, useEffect, useState } from 'react'
import * as Collapsible from '@radix-ui/react-collapsible'
import { Link, useNavigate, useParams } from 'react-router-dom'

import { Breadcrumb } from '@/components/Breadcrumb'
import { PageHeader } from '@/components/PageHeader'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { LoadingState } from '@/components/ui/loading-state'
import { PROJECT_NAVIGATION_LABELS } from '@/config/navigation'
import { useCurrentProject } from '@/hooks/useStore'
import { toast } from '@/hooks/use-toast'
import { apiGet, getApiErrorMessage, isAbortError } from '@/lib/apiClient'
import { cn, formatDate } from '@/lib/utils'
import { ArrowRight, CheckSquare, ChevronDown, Download, RefreshCw } from 'lucide-react'

import TaskSummaryResultsSection from './TaskSummary/components/TaskSummaryResultsSection'

type ProjectSummaryStats = {
  total_completed: number
  on_time_count: number
  delayed_count: number
  completed_milestone_count: number
  avg_delay_days?: number
}

type TaskSummaryTaskRow = {
  id: string
  title: string
  assignee?: string | null
  planned_end_date?: string | null
  completed_at?: string | null
  status_label?: string | null
  delay_total_days?: number | null
}

type TaskSummaryGroup = {
  id: string
  name: string
  status?: string | null
  completed_at?: string | null
  planned_end_date?: string | null
  tasks: TaskSummaryTaskRow[]
}

type MonthlyFulfillmentItem = {
  month: string
  committedCount: number
  fulfilledCount: number
  rate: number
}

type TaskSummaryPayload = {
  stats?: ProjectSummaryStats | null
  groups?: TaskSummaryGroup[]
  monthlyFulfillment?: MonthlyFulfillmentItem[]
}

async function fetchTaskSummarySection<T>(url: string, signal?: AbortSignal): Promise<T> {
  return apiGet<T>(url, { signal })
}

function escapeCsvCell(value: string | number | boolean | null | undefined) {
  const normalized = String(value ?? '')
  if (!/[",\n]/.test(normalized)) return normalized
  return `"${normalized.replace(/"/g, '""')}"`
}

function getTaskStatusTone(task: TaskSummaryTaskRow) {
  const delayDays = Number(task.delay_total_days ?? 0)
  const statusToken = String(task.status_label ?? '').toLowerCase()
  if (delayDays > 0 || /(delay|overdue|延期|逾期)/.test(statusToken)) {
    return 'bg-red-500'
  }
  if (/(done|complete|on_time|完成|按时)/.test(statusToken)) {
    return 'bg-emerald-500'
  }
  return 'bg-slate-400'
}

function TaskSummaryGroupsSection({
  groups,
  projectId,
}: {
  groups: TaskSummaryGroup[]
  projectId?: string
}) {
  const hasGroups = groups.length > 0
  const [showAllGroups, setShowAllGroups] = useState(false)
  const visibleGroups = showAllGroups ? groups : groups.slice(0, 3)
  const hiddenGroupCount = Math.max(groups.length - visibleGroups.length, 0)

  return (
    <section data-testid="task-summary-summary-list-section" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">总结列表区</div>
          <h2 className="mt-2 text-lg font-semibold tracking-tight text-slate-900">总结列表</h2>
        </div>
        <Button
          asChild
          variant="outline"
          size="sm"
          disabled={!projectId}
        >
          <Link to={`/projects/${projectId}/gantt`}>
            返回任务管理
          </Link>
        </Button>
      </div>

      {hasGroups ? (
        <div className="grid gap-4">
          {visibleGroups.map((group, groupIndex) => {
            const defaultOpen = groupIndex < 3

            return (
              <Collapsible.Root key={group.id} defaultOpen={defaultOpen}>
                <Card className="border-slate-200 shadow-sm">
                  <CardContent className="space-y-4 p-5">
                    <Collapsible.Trigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        className="group h-auto w-full justify-between rounded-none p-0 text-left hover:bg-transparent [&>span]:w-full [&>span]:justify-between"
                      >
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-lg font-semibold text-slate-900">{group.name}</h3>
                            <Badge variant={group.status === 'completed' ? 'default' : 'secondary'}>
                              {group.tasks.length} 个任务
                            </Badge>
                          </div>
                          <div className="mt-1 text-xs text-slate-500">
                            {group.status ? `状态 ${group.status}` : '状态待补充'}
                            {group.planned_end_date ? ` · 计划完成 ${formatDate(group.planned_end_date)}` : ''}
                          </div>
                        </div>
                        <ChevronDown className="h-4 w-4 shrink-0 text-slate-500 transition-transform duration-300 group-data-[state=open]:rotate-180" />
                      </Button>
                    </Collapsible.Trigger>

                    <Collapsible.Content className="overflow-hidden duration-300 data-[state=open]:animate-expand-down">
                      {group.tasks.length > 0 ? (
                        <div className="space-y-2">
                          {group.tasks.map((task, taskIndex) => {
                            const delayDays = Number(task.delay_total_days ?? 0)
                            const isDelayed = delayDays > 0

                            return (
                              <div
                                key={task.id}
                                className={cn(
                                  'grid gap-3 rounded-xl px-4 py-3 transition-colors hover:bg-blue-50/60 md:grid-cols-[minmax(0,1fr)_140px_140px_96px]',
                                  taskIndex % 2 === 0 ? 'bg-slate-50' : 'bg-white',
                                )}
                              >
                                <div className="min-w-0">
                                  <div className="flex min-w-0 items-center gap-2">
                                    <span className={cn('h-2.5 w-2.5 shrink-0 rounded-full', getTaskStatusTone(task))} />
                                    <div className="truncate text-sm font-medium text-slate-900">{task.title}</div>
                                  </div>
                                  <div className="mt-1 text-xs text-slate-500">{task.status_label || '状态待补充'}</div>
                                </div>
                                <div className="text-xs text-slate-500">
                                  <div className="font-medium text-slate-700">责任人</div>
                                  <div className="mt-1">{task.assignee || '未分配'}</div>
                                </div>
                                <div className={cn('text-xs tabular-nums', isDelayed ? 'text-red-600' : 'text-slate-500')}>
                                  <div className="font-medium text-slate-700">截止日期</div>
                                  <div className="mt-1">{task.planned_end_date ? formatDate(task.planned_end_date) : '未设置'}</div>
                                  {isDelayed ? <div className="mt-1">逾期 {delayDays} 天</div> : null}
                                </div>
                                <div className="flex items-center justify-start md:justify-end">
                                  <Button asChild variant="ghost" size="sm" disabled={!projectId}>
                                    <Link to={`/projects/${projectId}/gantt?taskId=${task.id}`}>
                                      查看
                                      <ArrowRight className="ml-1.5 h-4 w-4" />
                                    </Link>
                                  </Button>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      ) : (
                        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-500">
                          暂无任务明细
                        </div>
                      )}
                    </Collapsible.Content>
                  </CardContent>
                </Card>
              </Collapsible.Root>
            )
          })}
          {hiddenGroupCount > 0 ? (
            <Button type="button" variant="outline" className="justify-center" onClick={() => setShowAllGroups(true)}>
              {`展开更多(${hiddenGroupCount})`}
            </Button>
          ) : null}
        </div>
      ) : (
        <Card className="border-slate-200 shadow-sm">
          <CardContent className="flex flex-col items-center justify-center gap-2 py-10 text-center">
            <div className="text-sm font-medium text-slate-900">暂无总结列表数据</div>
            <div className="text-xs text-slate-500">请先确认任务总结接口已返回里程碑分组。</div>
          </CardContent>
        </Card>
      )}
    </section>
  )
}

function TaskSummaryFulfillmentSection({
  monthlyFulfillment,
}: {
  monthlyFulfillment: MonthlyFulfillmentItem[]
}) {
  const hasData = monthlyFulfillment.length > 0

  return (
    <section data-testid="task-summary-monthly-fulfillment-section" className="space-y-4">
      <div>
        <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">月度兑现区</div>
        <h2 className="mt-2 text-lg font-semibold tracking-tight text-slate-900">月度兑现</h2>
      </div>

      {hasData ? (
        <div className="space-y-3">
          {monthlyFulfillment.map((item) => (
            <Card key={item.month} className="border-slate-200 shadow-sm">
              <CardContent className="space-y-3 p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-slate-900">{item.month}</div>
                    <div className="mt-1 text-xs text-slate-500">
                      承诺 {item.committedCount} · 兑现 {item.fulfilledCount}
                    </div>
                  </div>
                  <Badge variant={item.rate >= 80 ? 'default' : item.rate >= 60 ? 'secondary' : 'destructive'}>
                    {item.rate}%
                  </Badge>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-blue-600"
                    style={{ width: `${Math.max(0, Math.min(100, item.rate))}%` }}
                  />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="border-slate-200 shadow-sm">
          <CardContent className="flex flex-col items-center justify-center gap-2 py-10 text-center">
            <div className="text-sm font-medium text-slate-900">暂无月度兑现数据</div>
            <div className="text-xs text-slate-500">请确认任务总结接口已返回最近月度兑现趋势。</div>
          </CardContent>
        </Card>
      )}
    </section>
  )
}

export default function TaskSummary() {
  useEffect(() => {
    document.title = '任务汇总 | WorkBuddy'
  }, [])

  const { id: projectId } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const currentProject = useCurrentProject()

  const [stats, setStats] = useState<ProjectSummaryStats | null>(null)
  const [groups, setGroups] = useState<TaskSummaryGroup[]>([])
  const [monthlyFulfillment, setMonthlyFulfillment] = useState<MonthlyFulfillmentItem[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const groupedTaskCount = groups.reduce((sum, group) => sum + group.tasks.length, 0)
  const totalTasks = Math.max(groupedTaskCount, stats?.total_completed ?? 0)

  const loadData = useCallback(async (signal?: AbortSignal) => {
    if (!projectId) return

    try {
      setLoading(true)
      setLoadError(null)

      const summaryData = await fetchTaskSummarySection<TaskSummaryPayload>(
        `/api/task-summaries/projects/${projectId}/task-summary`,
        signal,
      )

      if (signal?.aborted) return

      setStats(summaryData.stats ?? null)
      setGroups(summaryData.groups ?? [])
      setMonthlyFulfillment(summaryData.monthlyFulfillment ?? [])
    } catch (error) {
      if (isAbortError(error)) return

      const message = getApiErrorMessage(error, '无法加载任务完成总结')
      setStats(null)
      setGroups([])
      setMonthlyFulfillment([])
      setLoadError(message)
      toast({
        title: '加载失败',
        description: message,
        variant: 'destructive',
      })
    } finally {
      if (!signal?.aborted) {
        setLoading(false)
      }
    }
  }, [projectId])

  useEffect(() => {
    const controller = new AbortController()
    void loadData(controller.signal)

    return () => controller.abort()
  }, [loadData])

  const exportTaskSummary = useCallback(() => {
    if (!stats) {
      toast({
        title: '暂无可导出内容',
        description: '请先等待任务总结加载完成。',
        variant: 'destructive',
      })
      return
    }

    const projectLabel = currentProject?.name || projectId || 'task-summary'
    const lines: Array<Array<string | number>> = [
      ['指标', '值'],
      ['已完成任务', stats.total_completed ?? 0],
      ['按时完成', stats.on_time_count ?? 0],
      ['延期完成', stats.delayed_count ?? 0],
      ['完成里程碑', stats.completed_milestone_count ?? 0],
      ['平均延期天数', stats.avg_delay_days ?? 0],
    ]

    const csv = lines.map((line) => line.map((cell) => escapeCsvCell(cell)).join(',')).join('\n')
    const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8;' })
    const url = window.URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `${projectLabel}-任务汇总-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(anchor)
    anchor.click()
    document.body.removeChild(anchor)
    window.URL.revokeObjectURL(url)

    toast({
      title: '导出成功',
    })
  }, [currentProject?.name, projectId, stats])

  if (!loading && !projectId) {
    return (
      <div className="page-shell">
        <Card className="border-slate-200 shadow-sm">
          <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <CheckSquare className="h-12 w-12 text-slate-300" />
            <div className="space-y-1">
              <h2 className="text-lg font-semibold text-slate-900">任务总结暂不可用</h2>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="page-shell">
        <LoadingState
          label="任务总结加载中"
          className="min-h-[320px]"
        />
      </div>
    )
  }

  return (
    <div data-testid="task-summary-page" className="page-shell">
      <Breadcrumb
        items={[
          { label: currentProject?.name || '项目', href: `/projects/${projectId}/dashboard` },
          { label: '任务汇总' },
        ]}
      />

      <PageHeader title="任务管理 / 任务总结">
        <div data-testid="task-summary-header-actions" className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => projectId && navigate(`/projects/${projectId}/gantt`)}
            disabled={!projectId}
          >
            返回任务列表
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => projectId && navigate(`/projects/${projectId}/dashboard`)}
            disabled={!projectId}
          >
            {PROJECT_NAVIGATION_LABELS.dashboard}
          </Button>
          <Button variant="outline" size="sm" data-testid="task-summary-export" onClick={exportTaskSummary}>
            <Download className="mr-1.5 h-4 w-4" />
            导出
          </Button>
          <Button variant="ghost" size="sm" onClick={() => void loadData()}>
            <RefreshCw className="mr-1.5 h-4 w-4" />
            刷新
          </Button>
        </div>
      </PageHeader>

      {loadError && (
        <Alert variant="destructive">
          <AlertDescription>{loadError}</AlertDescription>
        </Alert>
      )}

      <TaskSummaryResultsSection stats={stats} totalTasks={totalTasks} />
      <TaskSummaryGroupsSection groups={groups} projectId={projectId} />

      <TaskSummaryFulfillmentSection monthlyFulfillment={monthlyFulfillment} />
    </div>
  )
}
