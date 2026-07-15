import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'

import { CardHead } from '@/components/ui/card-head'
import { SegmentedControl } from '@/components/ui/segmented-control'
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
  embedded?: boolean
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

function deltaTone(value: number | null, inverse = false) {
  if (value == null || value === 0) return 'text-slate-400'
  const isPositive = value > 0
  const isGood = inverse ? !isPositive : isPositive
  return isGood ? 'text-emerald-600' : 'text-rose-600'
}

function formatNumberDelta(value: number | null, suffix = '') {
  if (value == null) return '--'
  if (value === 0) return '持平'
  return `${value > 0 ? '+' : ''}${value}${suffix}`
}

function formatProgressValue(value: number) {
  return `${value > 0 ? '+' : ''}${value.toFixed(1)}%`
}

export default function DashboardCompareCard({ projectId, embedded = false }: DashboardCompareCardProps) {
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
      summaryOnly: 'true',
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
  const currentRow = rows[rows.length - 1] ?? null
  const previousRow = rows.length > 1 ? rows[rows.length - 2] : null
  const hasCurrentSummary = Boolean(currentRow?.summary)
  const compareMetrics = useMemo(() => {
    const current = currentRow?.summary
    const previous = previousRow?.summary
    return [
      {
        label: '总进度变化',
        value: current ? formatProgressValue(current.total_progress_change ?? 0) : '--',
        delta: current && previous ? current.total_progress_change - previous.total_progress_change : null,
        suffix: '%',
      },
      {
        label: '更新任务数',
        value: current?.tasks_updated ?? '--',
        delta: current && previous ? current.tasks_updated - previous.tasks_updated : null,
      },
      {
        label: '完成任务数',
        value: current?.tasks_completed ?? '--',
        delta: current && previous ? current.tasks_completed - previous.tasks_completed : null,
      },
      {
        label: '延期任务数',
        value: current?.delayed ?? '--',
        delta: current && previous ? current.delayed - previous.delayed : null,
        inverse: true,
      },
    ]
  }, [currentRow, previousRow])
  const panelClassName = embedded ? '' : 'surface-card p-5'
  const previousPeriodLabel = granularity === 'day' ? '较昨日' : granularity === 'week' ? '较上周' : '较上月'

  return (
    <section className={panelClassName} aria-busy={loading}>
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
              to={projectId ? `/projects/${projectId}/reports?view=progress_deviation` : '/reports?view=progress_deviation'}
              className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 transition-colors hover:text-blue-800"
            >
              查看详情
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        }
      />

      {loading ? (
        <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-5 text-sm text-slate-600">
          对比数据加载中
        </div>
      ) : !hasCurrentSummary ? (
        <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-5">
          <div className="text-sm font-medium text-slate-900">暂无对比数据</div>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            当前周期还没有形成可比较的现场快照；录入进度或切换周期后再查看。
          </p>
          <Link
            to={projectId ? `/projects/${projectId}/reports?view=progress_deviation` : '/reports?view=progress_deviation'}
            className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-blue-600 transition-colors hover:text-blue-800"
          >
            查看报表
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      ) : (
        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {compareMetrics.map((item) => (
            <div key={item.label} className="rounded-xl border border-slate-200/60 bg-slate-50/60 px-4 py-3">
              <div className="meta-text">{item.label}</div>
              <div className={cn('num-mono mt-1 text-lg font-semibold text-slate-900', item.value === 0 && 'text-slate-400')}>
                {item.value}
              </div>
              <div className={cn('meta-muted mt-1', deltaTone(item.delta, item.inverse))}>
                {previousPeriodLabel} {formatNumberDelta(item.delta, item.suffix)}
              </div>
            </div>
          ))}
        </div>
      )}

      <span className="sr-only" aria-live="polite">
        {loading ? '对比数据加载中' : ''}
      </span>
    </section>
  )
}
