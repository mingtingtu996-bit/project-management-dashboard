import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, ChevronsUpDown } from 'lucide-react'

import { CardHead } from '@/components/ui/card-head'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { EmptyState } from '@/components/EmptyState'
import { LoadingState } from '@/components/ui/loading-state'
import { apiGet, isAbortError } from '@/lib/apiClient'
import { cn } from '@/lib/utils'

type CompareGranularity = 'day' | 'week' | 'month'

interface ComparePeriod {
  label: string
  from: string
  to: string
}

interface CompareResult {
  period_label: string
  from: string
  to: string
  summary: {
    total_progress_change: number
    tasks_updated: number
    tasks_progressed: number
    tasks_completed: number
    total: number
    on_time: number
    delayed: number
    on_time_rate: number
  }
  task_ids: string[]
  task_details: Array<{
    id: string
    title: string
    progress: number
    progress_before: number
    progress_delta: number
    assignee: string
    end_date: string
    completed_at: string
    specialty_type: string
    is_on_time: boolean
  }>
}

interface DashboardCompareCardProps {
  projectId?: string
}

const GRANULARITY_OPTIONS = [
  { value: 'day', label: '日' },
  { value: 'week', label: '周' },
  { value: 'month', label: '月' },
] as const

const fmt = (date: Date) => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const fmtMonth = (value: string) => value.slice(0, 7)

function startOfWeek(input: Date) {
  const value = new Date(input)
  value.setHours(0, 0, 0, 0)
  const day = value.getDay()
  const offset = day === 0 ? 6 : day - 1
  value.setDate(value.getDate() - offset)
  return value
}

function createComparePeriods(granularity: CompareGranularity): ComparePeriod[] {
  const now = new Date()

  if (granularity === 'month') {
    const currentMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    const previousMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    return [
      { label: '上月', from: fmtMonth(fmt(previousMonth)), to: fmtMonth(fmt(previousMonth)) },
      { label: '本月', from: fmtMonth(fmt(currentMonth)), to: fmtMonth(fmt(currentMonth)) },
    ]
  }

  if (granularity === 'week') {
    const currentWeekStart = startOfWeek(now)
    const previousWeekStart = new Date(currentWeekStart)
    previousWeekStart.setDate(previousWeekStart.getDate() - 7)
    const currentWeekEnd = new Date(currentWeekStart)
    currentWeekEnd.setDate(currentWeekEnd.getDate() + 6)
    const previousWeekEnd = new Date(previousWeekStart)
    previousWeekEnd.setDate(previousWeekEnd.getDate() + 6)

    return [
      { label: '上周', from: fmt(previousWeekStart), to: fmt(previousWeekEnd) },
      { label: '本周', from: fmt(currentWeekStart), to: fmt(currentWeekEnd) },
    ]
  }

  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  return [
    { label: '昨天', from: fmt(yesterday), to: fmt(yesterday) },
    { label: '今天', from: fmt(now), to: fmt(now) },
  ]
}

function normalizeCompareResults(payload: CompareResult[] | null | undefined): CompareResult[] {
  return Array.isArray(payload) ? payload : []
}

function formatRange(result: CompareResult) {
  if (result.from.length === 7) return result.from
  return result.from === result.to ? result.from.slice(5) : `${result.from.slice(5)} - ${result.to.slice(5)}`
}

function progressTone(value: number) {
  if (value > 0) return 'text-emerald-600'
  if (value < 0) return 'text-rose-600'
  return 'text-slate-400'
}

export default function DashboardCompareCard({ projectId }: DashboardCompareCardProps) {
  const [granularity, setGranularity] = useState<CompareGranularity>('day')
  const [resultsByGranularity, setResultsByGranularity] = useState<Record<CompareGranularity, CompareResult[]>>({
    day: [],
    week: [],
    month: [],
  })
  const [loadingByGranularity, setLoadingByGranularity] = useState<Record<CompareGranularity, boolean>>({
    day: false,
    week: false,
    month: false,
  })

  useEffect(() => {
    if (!projectId) return

    const controller = new AbortController()
    const periods = createComparePeriods(granularity)
    const params = new URLSearchParams({
      periods: JSON.stringify(periods),
      granularity,
    })

    setLoadingByGranularity((current) => ({ ...current, [granularity]: true }))
    apiGet<CompareResult[]>(`/api/task-summaries/projects/${projectId}/task-summary/compare?${params}`, {
      signal: controller.signal,
    })
      .then((payload) => {
        if (!controller.signal.aborted) {
          setResultsByGranularity((current) => ({ ...current, [granularity]: normalizeCompareResults(payload) }))
        }
      })
      .catch((error) => {
        if (!isAbortError(error) && !controller.signal.aborted) {
          console.error(error)
          setResultsByGranularity((current) => ({ ...current, [granularity]: [] }))
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoadingByGranularity((current) => ({ ...current, [granularity]: false }))
        }
      })

    return () => {
      controller.abort()
    }
  }, [granularity, projectId])

  const rows = resultsByGranularity[granularity]
  const loading = loadingByGranularity[granularity]
  const totals = useMemo(
    () => rows.reduce(
      (acc, item) => {
        acc.tasksUpdated += item.summary?.tasks_updated ?? 0
        acc.tasksCompleted += item.summary?.tasks_completed ?? 0
        acc.delayed += item.summary?.delayed ?? 0
        return acc
      },
      { tasksUpdated: 0, tasksCompleted: 0, delayed: 0 },
    ),
    [rows],
  )

  return (
    <section className="surface-card p-5">
      <CardHead
        eyebrow="COMPARE"
        title="现场快照与对比"
        action={
          <div className="flex items-center gap-3">
            <SegmentedControl
              options={GRANULARITY_OPTIONS.map((option) => ({ value: option.value, label: option.label }))}
              value={granularity}
              onChange={(value) => setGranularity(value as CompareGranularity)}
            />
            <Link
              data-testid="dashboard-compare-reports-link"
              to={projectId ? `/projects/${projectId}/reports?view=change_log` : '/reports?view=change_log'}
              className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 transition-colors hover:text-blue-800"
            >
              查看详情
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        }
      />

      <div className="mt-5 grid grid-cols-3 gap-3">
        {[
          { label: '更新任务', value: totals.tasksUpdated },
          { label: '完成任务', value: totals.tasksCompleted },
          { label: '延期任务', value: totals.delayed },
        ].map((item) => (
          <div key={item.label} className="rounded-xl border border-slate-200/60 bg-slate-50/60 px-4 py-3">
            <div className="text-[11px] text-slate-500">{item.label}</div>
            <div className={cn('num-mono mt-1 text-lg font-semibold text-slate-900', item.value === 0 && 'text-slate-400')}>
              {item.value}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-5 overflow-x-auto">
        {loading ? (
          <LoadingState label="对比数据加载中" description="" className="min-h-32 border-0 bg-transparent shadow-none" />
        ) : rows.length === 0 ? (
          <EmptyState
            title="暂无对比数据"
            description="有任务快照后会自动补齐对比结果。"
            className="rounded-2xl empty-state-frame border-slate-200 bg-slate-50 py-8"
          />
        ) : (
          <table className="w-full min-w-[760px] border-collapse">
            <thead>
              <tr className="border-b border-gray-200">
                {['周期', '范围', '进度变化', '更新任务', '完成任务', '按时率', '延期'].map((label) => (
                  <th key={label} className="group py-2 pr-4 text-left text-[10.5px] font-semibold uppercase tracking-[0.08em] text-slate-400">
                    <span className="inline-flex items-center gap-1">
                      {label}
                      <ChevronsUpDown className="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-100" strokeWidth={1.5} />
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((result, index) => {
                const change = result.summary?.total_progress_change ?? 0
                const onTimeRate = result.summary?.on_time_rate ?? 0
                const delayed = result.summary?.delayed ?? 0
                return (
                  <tr key={`${result.period_label}-${index}`} className="border-b border-slate-100 transition-colors hover:bg-slate-50/60">
                    <td className="py-3 pr-4 text-sm font-medium text-slate-800">{result.period_label}</td>
                    <td className="num-mono py-3 pr-4 text-xs text-slate-500">{formatRange(result)}</td>
                    <td className={cn('num-mono py-3 pr-4 text-sm font-semibold', progressTone(change))}>
                      {change > 0 ? '+' : ''}{change.toFixed(1)}%
                    </td>
                    <td className={cn('num-mono py-3 pr-4 text-sm text-slate-700', (result.summary?.tasks_updated ?? 0) === 0 && 'text-slate-400')}>
                      {result.summary?.tasks_updated ?? 0}
                    </td>
                    <td className={cn('num-mono py-3 pr-4 text-sm text-slate-700', (result.summary?.tasks_completed ?? 0) === 0 && 'text-slate-400')}>
                      {result.summary?.tasks_completed ?? 0}
                    </td>
                    <td className={cn('num-mono py-3 pr-4 text-sm text-slate-700', onTimeRate === 0 && 'text-slate-400')}>
                      {onTimeRate}%
                    </td>
                    <td className={cn('num-mono py-3 pr-4 text-sm text-slate-700', delayed === 0 && 'text-slate-400')}>
                      {delayed}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </section>
  )
}
