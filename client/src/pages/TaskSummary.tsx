import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import { Breadcrumb } from '@/components/Breadcrumb'
import AssigneeProgressCard from '@/components/AssigneeProgressCard'
import DashboardCompareCard from '@/components/DashboardCompareCard'
import { PageHeader } from '@/components/PageHeader'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { LoadingState } from '@/components/ui/loading-state'
import { PROJECT_NAVIGATION_LABELS } from '@/config/navigation'
import { useCurrentProject } from '@/hooks/useStore'
import { toast } from '@/hooks/use-toast'
import { isAbortError } from '@/lib/apiClient'
import { CheckSquare, Download, RefreshCw } from 'lucide-react'

import TaskSummaryResultsSection from './TaskSummary/components/TaskSummaryResultsSection'

type ProjectSummaryStats = {
  total_completed: number
  on_time_count: number
  delayed_count: number
  completed_milestone_count: number
  avg_delay_days?: number
}

type TaskSummaryPayload = {
  stats?: ProjectSummaryStats | null
}

type AssigneeSummaryRow = {
  assignee: string
  total: number
  on_time: number
  delayed: number
  on_time_rate: number
}

async function fetchTaskSummarySection<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal })
  if (!response.ok) {
    throw new Error('任务总结数据加载失败')
  }

  const payload = await response.json()
  if (!payload?.success) {
    throw new Error(payload?.error?.message || '任务总结数据加载失败')
  }

  return (payload.data ?? null) as T
}

function escapeCsvCell(value: string | number | boolean | null | undefined) {
  const normalized = String(value ?? '')
  if (!/[",\n]/.test(normalized)) return normalized
  return `"${normalized.replace(/"/g, '""')}"`
}

export default function TaskSummary() {
  const { id: projectId } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const currentProject = useCurrentProject()

  const [stats, setStats] = useState<ProjectSummaryStats | null>(null)
  const [assignees, setAssignees] = useState<AssigneeSummaryRow[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [assigneeLoadError, setAssigneeLoadError] = useState<string | null>(null)
  const [assigneeKeyword, setAssigneeKeyword] = useState('')

  const loadData = useCallback(async (signal?: AbortSignal) => {
    if (!projectId) return

    try {
      setLoading(true)
      setLoadError(null)
      setAssigneeLoadError(null)

      let nextAssigneeError: string | null = null
      const [summaryData, assigneeData] = await Promise.all([
        fetchTaskSummarySection<TaskSummaryPayload>(
          `/api/task-summaries/projects/${projectId}/task-summary`,
          signal,
        ),
        fetchTaskSummarySection<AssigneeSummaryRow[]>(
          `/api/task-summaries/projects/${projectId}/task-summary/assignees`,
          signal,
        ).catch((error) => {
          if (isAbortError(error)) throw error
          nextAssigneeError = error instanceof Error ? error.message : '责任人分析加载失败'
          return []
        }),
      ])

      if (signal?.aborted) return

      setStats(summaryData.stats ?? null)
      setAssignees(Array.isArray(assigneeData) ? assigneeData : [])
      setAssigneeLoadError(nextAssigneeError)
    } catch (error) {
      if (isAbortError(error)) return

      const message = error instanceof Error ? error.message : '无法加载任务完成总结'
      setStats(null)
      setAssignees([])
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

  const assigneeRows = useMemo(
    () =>
      assignees.map((row) => ({
        id: row.assignee || '未分配',
        name: row.assignee || '未分配',
        progress: row.on_time_rate,
        taskCount: row.total,
        completedTasks: row.on_time,
      })),
    [assignees],
  )

  const filteredAssignees = useMemo(() => {
    const keyword = assigneeKeyword.trim().toLowerCase()
    if (!keyword) return assigneeRows
    return assigneeRows.filter((row) => row.name.toLowerCase().includes(keyword))
  }, [assigneeKeyword, assigneeRows])

  const exportTaskSummary = useCallback(() => {
    if (!stats && assignees.length === 0) {
      toast({
        title: '暂无可导出内容',
        description: '请先等待任务总结和责任人分析加载完成。',
        variant: 'destructive',
      })
      return
    }

    const projectLabel = currentProject?.name || projectId || 'task-summary'
    const lines: Array<Array<string | number>> = [
      ['指标', '值'],
      ['已完成任务', stats?.total_completed ?? 0],
      ['按时完成', stats?.on_time_count ?? 0],
      ['延期完成', stats?.delayed_count ?? 0],
      ['完成里程碑', stats?.completed_milestone_count ?? 0],
      ['平均延期天数', stats?.avg_delay_days ?? 0],
      [],
      ['责任人', '任务总数', '按时完成', '延期完成', '按时率(%)'],
      ...assignees.map((row) => [
        row.assignee || '未分配',
        row.total,
        row.on_time,
        row.delayed,
        row.on_time_rate,
      ]),
    ]

    const csv = lines.map((line) => line.map((cell) => escapeCsvCell(cell)).join(',')).join('\n')
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' })
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
      description: '任务汇总和责任人分析已导出为 CSV。',
    })
  }, [assignees, currentProject?.name, projectId, stats])

  if (!loading && !projectId) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Card className="border-slate-200 shadow-sm">
          <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <CheckSquare className="h-12 w-12 text-slate-300" />
            <div className="space-y-1">
              <h2 className="text-lg font-semibold text-slate-900">任务总结暂不可用</h2>
              <p className="text-sm text-slate-500">
                请先进入一个项目，再查看任务总结。
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <LoadingState
          label="任务总结加载中"
          description="正在读取任务结果摘要数据。"
          className="min-h-[320px]"
        />
      </div>
    )
  }

  return (
    <div data-testid="task-summary-page" className="container mx-auto space-y-6 px-4 py-8 page-enter">
      <Breadcrumb
        items={[
          { label: '公司驾驶舱', href: '/company' },
          { label: currentProject?.name || '项目', href: `/projects/${projectId}/dashboard` },
          { label: '任务管理', href: `/projects/${projectId}/gantt` },
          { label: '任务总结' },
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

      <TaskSummaryResultsSection stats={stats} />

      <section data-testid="task-summary-assignees-section" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">责任人分析区</div>
            <h2 className="mt-2 text-[22px] font-semibold tracking-tight text-slate-900">任务执行分析</h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              责任人完成结构来自真实汇总接口，可直接筛查高负荷或延期集中的责任主体。
            </p>
          </div>
          <div className="w-full sm:w-[280px]">
            <Input
              data-testid="task-summary-assignee-filter"
              value={assigneeKeyword}
              onChange={(event) => setAssigneeKeyword(event.target.value)}
              placeholder="筛选责任人"
            />
          </div>
        </div>

        {assigneeLoadError && (
          <Alert variant="destructive">
            <AlertDescription>{assigneeLoadError}</AlertDescription>
          </Alert>
        )}

        {filteredAssignees.length > 0 ? (
          <AssigneeProgressCard assignees={filteredAssignees} maxItems={10} />
        ) : (
          <Card className="border-slate-200 shadow-sm">
            <CardContent className="flex flex-col items-center justify-center gap-2 py-10 text-center">
              <div className="text-sm font-medium text-slate-900">
                {assignees.length === 0 ? '暂无责任人分析数据' : '没有匹配的责任人'}
              </div>
              <p className="text-sm text-slate-500">
                {assignees.length === 0
                  ? '接口返回为空时，这里会保留空态，便于真人核对。'
                  : '可以清空筛选词后重新查看全部责任人。'}
              </p>
            </CardContent>
          </Card>
        )}
      </section>

      <section data-testid="task-summary-compare-section" className="space-y-4">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">执行对比区</div>
          <h2 className="mt-2 text-[22px] font-semibold tracking-tight text-slate-900">任务执行与对比分析</h2>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            每日进度变化与多时段对比复用统一分析口径，便于真人核对执行波动和趋势差异。
          </p>
        </div>
        <DashboardCompareCard projectId={projectId} />
      </section>
    </div>
  )
}
