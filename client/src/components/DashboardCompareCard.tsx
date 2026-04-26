import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Activity,
  ArrowRight,
  BarChart3,
  CalendarDays,
  ChevronDown,
  ChevronUp,
  TrendingUp,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { LoadingState } from '@/components/ui/loading-state'
import { apiGet, isAbortError } from '@/lib/apiClient'

type CompareGranularity = 'day' | 'week' | 'month'

interface SnapshotSummary {
  conditions_added: number
  conditions_closed: number
  obstacles_added: number
  obstacles_closed: number
  delayed_tasks: number
}

interface DailyProgress {
  date: string
  progress_change: number
  tasks_updated: number
  tasks_completed: number
  snapshot_summary?: SnapshotSummary | null
  details: Array<{
    task_id: string
    task_title: string
    progress_before: number
    progress_after: number
    progress_delta: number
    assignee: string
  }>
}

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

function normalizeDailyProgress(payload: DailyProgress | null | undefined): DailyProgress | null {
  if (!payload || typeof payload !== 'object') return null

  return {
    date: String(payload.date ?? ''),
    progress_change: Number(payload.progress_change ?? 0),
    tasks_updated: Number(payload.tasks_updated ?? 0),
    tasks_completed: Number(payload.tasks_completed ?? 0),
    snapshot_summary:
      payload.snapshot_summary && typeof payload.snapshot_summary === 'object'
        ? {
            conditions_added: Number(payload.snapshot_summary.conditions_added ?? 0),
            conditions_closed: Number(payload.snapshot_summary.conditions_closed ?? 0),
            obstacles_added: Number(payload.snapshot_summary.obstacles_added ?? 0),
            obstacles_closed: Number(payload.snapshot_summary.obstacles_closed ?? 0),
            delayed_tasks: Number(payload.snapshot_summary.delayed_tasks ?? 0),
          }
        : null,
    details: Array.isArray(payload.details) ? payload.details : [],
  }
}

function normalizeCompareResults(payload: CompareResult[] | null | undefined): CompareResult[] {
  return Array.isArray(payload) ? payload : []
}

type CompareBlockConfig = {
  granularity: CompareGranularity
  title: string
  subtitle: string
}

const COMPARE_BLOCKS: CompareBlockConfig[] = [
  { granularity: 'day', title: '日对比', subtitle: '昨日 / 今日' },
  { granularity: 'week', title: '周对比', subtitle: '上周 / 本周' },
  { granularity: 'month', title: '月对比', subtitle: '上月 / 本月' },
]

function DailyProgressSection({ projectId }: { projectId?: string }) {
  const [data, setData] = useState<DailyProgress | null>(null)
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    if (!projectId) return

    const controller = new AbortController()
    setLoading(true)

    apiGet<DailyProgress | null>(`/api/task-summaries/projects/${projectId}/daily-progress?date=${fmt(new Date())}`, {
      signal: controller.signal,
    })
      .then((payload) => {
        if (!controller.signal.aborted) {
          setData(normalizeDailyProgress(payload))
        }
      })
      .catch((error) => {
        if (!isAbortError(error)) {
          console.error(error)
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false)
        }
      })

    return () => {
      controller.abort()
    }
  }, [projectId])

  if (loading) {
    return <LoadingState label="每日进度加载中" description="" className="min-h-20" />
  }

  if (!data) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-500">
        今天暂无进度更新，周边变化会在有快照后自动出现。
      </div>
    )
  }

  const progressTone =
    data.progress_change > 0
      ? 'text-emerald-600 bg-emerald-50'
      : data.progress_change < 0
        ? 'text-red-600 bg-red-50'
        : 'text-slate-600 bg-slate-50'

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50 to-indigo-50 p-3">
          <div className="mb-1 flex items-center gap-2">
            <Activity className="h-4 w-4 text-blue-500" />
            <span className="text-xs text-slate-500">进度变化</span>
          </div>
          <p className={`text-2xl font-bold ${progressTone.split(' ')[0]}`}>
            {data.progress_change > 0 ? '+' : ''}{data.progress_change.toFixed(1)}%
          </p>
        </div>
        <div className="rounded-2xl border border-emerald-100 bg-gradient-to-br from-emerald-50 to-teal-50 p-3">
          <div className="mb-1 flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-emerald-500" />
            <span className="text-xs text-slate-500">更新任务</span>
          </div>
          <p className="text-2xl font-bold text-emerald-600">{data.tasks_updated}</p>
        </div>
        <div className="rounded-2xl border border-violet-100 bg-gradient-to-br from-violet-50 to-purple-50 p-3">
          <div className="mb-1 flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-violet-500" />
            <span className="text-xs text-slate-500">完成任务</span>
          </div>
          <p className="text-2xl font-bold text-violet-600">{data.tasks_completed}</p>
        </div>
      </div>

      {data.snapshot_summary && (
        <div className="rounded-2xl border border-slate-100 bg-slate-50/80 p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="text-sm font-medium text-slate-900">状态变化指标摘要</div>
            <div className="text-xs text-slate-500">基于当日快照差值</div>
          </div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <div className="rounded-lg bg-white px-3 py-2">
              <div className="text-[11px] text-slate-500">条件新增</div>
              <div className="mt-1 text-lg font-semibold text-slate-900">{data.snapshot_summary.conditions_added}</div>
            </div>
            <div className="rounded-lg bg-white px-3 py-2">
              <div className="text-[11px] text-slate-500">条件关闭</div>
              <div className="mt-1 text-lg font-semibold text-slate-900">{data.snapshot_summary.conditions_closed}</div>
            </div>
            <div className="rounded-lg bg-white px-3 py-2">
              <div className="text-[11px] text-slate-500">阻碍新增</div>
              <div className="mt-1 text-lg font-semibold text-slate-900">{data.snapshot_summary.obstacles_added}</div>
            </div>
            <div className="rounded-lg bg-white px-3 py-2">
              <div className="text-[11px] text-slate-500">阻碍关闭</div>
              <div className="mt-1 text-lg font-semibold text-slate-900">{data.snapshot_summary.obstacles_closed}</div>
            </div>
            <div className="rounded-lg bg-white px-3 py-2">
              <div className="text-[11px] text-slate-500">延期任务</div>
              <div className="mt-1 text-lg font-semibold text-slate-900">{data.snapshot_summary.delayed_tasks}</div>
            </div>
          </div>
        </div>
      )}

      {data.details.length > 0 && (
        <div className="border-t border-slate-100 pt-3">
          <button
            className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700"
            onClick={() => setExpanded((value) => !value)}
          >
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            {expanded ? '收起详情' : `查看 ${data.details.length} 个任务详情`}
          </button>

          {expanded && (
            <div className="mt-3 space-y-2">
              {data.details.map((item) => (
                <div key={item.task_id} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm">
                  <div className="min-w-0 flex-1 truncate">
                    <span className="font-medium text-slate-700">{item.task_title}</span>
                    <span className="ml-2 text-xs text-slate-400">{item.assignee}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-400">
                      {item.progress_before}% → {item.progress_after}%
                    </span>
                    <span className={`font-bold ${item.progress_delta > 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                      {item.progress_delta > 0 ? '+' : ''}{item.progress_delta}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function ComparePeriodCard({
  result,
  expanded,
  onToggle,
  showTaskDetails = true,
}: {
  result: CompareResult
  expanded: boolean
  onToggle: () => void
  showTaskDetails?: boolean
}) {
  const progressChange = result.summary?.total_progress_change ?? 0
  const changeTone =
    progressChange > 0
      ? 'text-emerald-600 bg-emerald-50 border-emerald-100'
      : progressChange < 0
        ? 'text-red-600 bg-red-50 border-red-100'
        : 'text-slate-600 bg-slate-50 border-slate-200'

  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-medium text-slate-900">{result.period_label}</div>
          <div className="mt-1 text-xs text-slate-500">
            {result.from.length === 7 ? result.from : `${result.from.slice(5)} ~ ${result.to.slice(5)}`}
          </div>
        </div>
        <div className={`rounded-2xl border px-3 py-2 text-right ${changeTone}`}>
          <div className="text-lg font-semibold">
            {progressChange > 0 ? '+' : ''}{progressChange.toFixed(1)}%
          </div>
          <div className="text-[11px]">进度变化</div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 text-xs md:grid-cols-4">
        <div className="rounded-xl bg-slate-50 px-3 py-2">
          <div className="text-slate-500">更新任务</div>
          <div className="mt-1 text-base font-semibold text-slate-900">{result.summary?.tasks_updated ?? 0}</div>
        </div>
        <div className="rounded-xl bg-slate-50 px-3 py-2">
          <div className="text-slate-500">正向进展</div>
          <div className="mt-1 text-base font-semibold text-slate-900">{result.summary?.tasks_progressed ?? 0}</div>
        </div>
        <div className="rounded-xl bg-slate-50 px-3 py-2">
          <div className="text-slate-500">完成任务</div>
          <div className="mt-1 text-base font-semibold text-slate-900">{result.summary?.tasks_completed ?? 0}</div>
        </div>
        <div className="rounded-xl bg-slate-50 px-3 py-2">
          <div className="text-slate-500">按时率</div>
          <div className="mt-1 text-base font-semibold text-slate-900">{result.summary?.on_time_rate ?? 0}%</div>
        </div>
      </div>

      {showTaskDetails && result.task_details.length > 0 && (
        <div className="mt-4 border-t border-slate-100 pt-3">
          <button
            className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700"
            onClick={onToggle}
          >
            {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            {expanded ? '收起任务明细' : `展开 ${result.task_details.length} 条任务明细`}
          </button>

          {expanded && (
            <div className="mt-3 space-y-2">
              {result.task_details.slice(0, 4).map((task) => (
                <div key={task.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-xs">
                  <div className="min-w-0 flex-1 truncate">
                    <span className="font-medium text-slate-700">{task.title}</span>
                    <span className="ml-2 text-slate-400">{task.assignee}</span>
                  </div>
                  <span className={task.progress_delta > 0 ? 'text-emerald-600' : 'text-red-500'}>
                    {task.progress_delta > 0 ? '+' : ''}{task.progress_delta}%
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

interface DashboardCompareCardProps {
  projectId?: string
}

export default function DashboardCompareCard({ projectId }: DashboardCompareCardProps) {
  const [blocks, setBlocks] = useState<Record<CompareGranularity, { loading: boolean; results: CompareResult[] }>>({
    day: { loading: true, results: [] },
    week: { loading: true, results: [] },
    month: { loading: true, results: [] },
  })

  useEffect(() => {
    if (!projectId) return

    const controller = new AbortController()
    setBlocks({
      day: { loading: true, results: [] },
      week: { loading: true, results: [] },
      month: { loading: true, results: [] },
    })

    for (const block of COMPARE_BLOCKS) {
      const periods = createComparePeriods(block.granularity)
      const params = new URLSearchParams({
        periods: JSON.stringify(periods),
        granularity: block.granularity,
      })

      apiGet<CompareResult[]>(`/api/task-summaries/projects/${projectId}/task-summary/compare?${params}`, {
        signal: controller.signal,
      })
        .then((payload) => {
          if (!controller.signal.aborted) {
            const nextResults = normalizeCompareResults(payload)
            setBlocks((current) => ({
              ...current,
              [block.granularity]: {
                loading: false,
                results: nextResults,
              },
            }))
          }
        })
        .catch((error) => {
          if (!isAbortError(error) && !controller.signal.aborted) {
            console.error(error)
            setBlocks((current) => ({
              ...current,
              [block.granularity]: {
                loading: false,
                results: [],
              },
            }))
          }
        })
    }

    return () => {
      controller.abort()
    }
  }, [projectId])

  return (
    <Card className="border-slate-100 shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-lg font-semibold">
            <TrendingUp className="h-5 w-5 text-blue-500" />
            现场快照与对比
          </CardTitle>

          <div className="flex items-center gap-2">
            <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-600">
              日 / 周 / 月固定对比
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        <div className="space-y-3 rounded-2xl border border-slate-100 bg-slate-50/80 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">当日进度</div>
              <div className="mt-1 text-sm text-slate-600">今日进度与状态变化指标</div>
            </div>
          </div>
          <DailyProgressSection projectId={projectId} />
        </div>

        <div className="space-y-4">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">固定对比</div>
            <h3 className="mt-2 text-[22px] font-semibold tracking-tight text-slate-900">日 / 周 / 月对比</h3>
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            {COMPARE_BLOCKS.map((block) => {
              const blockState = blocks[block.granularity]
              return (
                <Card key={block.granularity} className="border-slate-100 bg-white shadow-sm">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <CardTitle className="flex items-center gap-2 text-base font-semibold text-slate-900">
                          <CalendarDays className="h-4 w-4 text-slate-400" />
                          {block.title}
                        </CardTitle>
                        <div className="mt-1 text-xs text-slate-500">{block.subtitle}</div>
                      </div>
                      <div className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] text-slate-500">
                        固定
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {blockState.loading ? (
                      <LoadingState label={`${block.title}加载中`} description="" className="min-h-24" />
                    ) : blockState.results.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-500">
                        暂无{block.title}数据，稍后有任务快照后会自动补齐。
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {blockState.results.map((result, index) => (
                          <ComparePeriodCard
                            key={`${block.granularity}-${result.period_label}-${index}`}
                            result={result}
                            expanded={false}
                            onToggle={() => undefined}
                            showTaskDetails={false}
                          />
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-white px-4 py-3 text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-blue-500" />
            <span>日 / 周 / 月对比与状态变化已固定收口</span>
          </div>
          <Button asChild variant="outline" size="sm" className="h-8 rounded-full border-slate-200 bg-white px-3">
            <Link to={projectId ? `/projects/${projectId}/reports?view=progress&tab=project_review` : '/reports'}>
              查看详情
              <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
