import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import { Breadcrumb } from '@/components/Breadcrumb'
import DashboardCompareCard from '@/components/DashboardCompareCard'
import { PageHeader } from '@/components/PageHeader'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { LoadingState } from '@/components/ui/loading-state'
import { PROJECT_NAVIGATION_LABELS } from '@/config/navigation'
import { useCurrentProject } from '@/hooks/useStore'
import { toast } from '@/hooks/use-toast'
import { apiGet, getApiErrorMessage, isAbortError } from '@/lib/apiClient'
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

async function fetchTaskSummarySection<T>(url: string, signal?: AbortSignal): Promise<T> {
  return apiGet<T>(url, { signal })
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
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

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
    } catch (error) {
      if (isAbortError(error)) return

      const message = getApiErrorMessage(error, '无法加载任务完成总结')
      setStats(null)
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
      <div className="container mx-auto px-4 py-8">
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
      <div className="container mx-auto px-4 py-8">
        <LoadingState
          label="任务总结加载中"
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

      <section data-testid="task-summary-compare-section" className="space-y-4">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">执行对比区</div>
          <h2 className="mt-2 text-[22px] font-semibold tracking-tight text-slate-900">任务执行与对比分析</h2>
        </div>
        <DashboardCompareCard projectId={projectId} />
      </section>
    </div>
  )
}
