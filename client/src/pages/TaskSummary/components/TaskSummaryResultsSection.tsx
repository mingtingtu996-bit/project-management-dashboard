import { EmptyState } from '@/components/EmptyState'
import { MetricCard as SharedMetricCard } from '@/components/ui/metric-card'
import { cn } from '@/lib/utils'
import { CalendarCheck, CheckCircle2, CheckSquare, Clock, TrendingDown, TrendingUp } from 'lucide-react'

type SummaryStats = {
  total_completed: number
  on_time_count: number
  delayed_count: number
  completed_milestone_count: number
  avg_delay_days?: number
}

type TaskSummaryTrendRow = {
  month: string
  total: number
  on_time: number
  delayed: number
}

interface TaskSummaryResultsSectionProps {
  stats: SummaryStats | null
  currentMonthCompleted?: number
  trendRows?: TaskSummaryTrendRow[]
}

function getMonthKey(offset = 0) {
  const date = new Date()
  date.setMonth(date.getMonth() + offset)
  return date.toISOString().slice(0, 7)
}

function getTrendValue(row: TaskSummaryTrendRow | undefined, key: 'total' | 'on_time_rate' | 'delayed') {
  if (!row) return null
  if (key === 'on_time_rate') return row.total > 0 ? Math.round((row.on_time / row.total) * 100) : 0
  return Number(row[key] ?? 0)
}

function getTaskSummarySparkline(rows: TaskSummaryTrendRow[] | undefined, key: 'total' | 'on_time_rate' | 'delayed') {
  const values = (rows ?? [])
    .slice(-6)
    .map((row) => getTrendValue(row, key))
    .filter((value): value is number => Number.isFinite(value))
  return values.length > 1 ? values : [50, 50, 50, 50, 50]
}

function formatTaskSummaryTrend(
  rows: TaskSummaryTrendRow[] | undefined,
  key: 'total' | 'on_time_rate' | 'delayed',
  options: { invertTone?: boolean; unit?: string } = {},
) {
  const currentMonth = getMonthKey()
  const previousMonth = getMonthKey(-1)
  const current = getTrendValue((rows ?? []).find((row) => row.month === currentMonth), key)
  const previous = getTrendValue((rows ?? []).find((row) => row.month === previousMonth), key)
  const periodLabel = '较上月'

  if (current === null || previous === null) {
    return { label: `待积累 ${periodLabel}`, className: 'text-slate-400', icon: null }
  }

  const delta = current - previous
  if (delta === 0) {
    return { label: `持平 ${periodLabel}`, className: 'text-slate-400', icon: null }
  }

  const isPositive = delta > 0
  const isGood = options.invertTone ? !isPositive : isPositive
  const unit = options.unit ?? ''
  return {
    label: `${isPositive ? '+' : '-'}${Math.abs(delta)}${unit} ${periodLabel}`,
    className: isGood ? 'text-emerald-700' : 'text-rose-700',
    icon: isPositive ? TrendingUp : TrendingDown,
  }
}

export function TaskSummaryResultsSection({ stats, currentMonthCompleted = 0, trendRows = [] }: TaskSummaryResultsSectionProps) {
  const completedTasks = stats?.total_completed ?? 0
  const onTimeRate = completedTasks > 0 ? Math.round(((stats?.on_time_count ?? 0) / completedTasks) * 100) : 0
  const cards = stats
    ? [
        {
          eyebrow: 'COMPLETED',
          label: '完成任务',
          value: String(completedTasks),
          unit: '',
          trend: formatTaskSummaryTrend(trendRows, 'total'),
          sparkline: getTaskSummarySparkline(trendRows, 'total'),
          tone: 'primary' as const,
          icon: <CheckSquare className="h-3.5 w-3.5" strokeWidth={1.5} />,
        },
        {
          eyebrow: 'ONTIME',
          label: '按时完成率',
          value: onTimeRate,
          unit: '%',
          trend: formatTaskSummaryTrend(trendRows, 'on_time_rate', { unit: 'pp' }),
          sparkline: getTaskSummarySparkline(trendRows, 'on_time_rate'),
          tone: 'success' as const,
          icon: <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={1.5} />,
        },
        {
          eyebrow: 'DELAY',
          label: '延期任务',
          value: String(stats.delayed_count),
          unit: '',
          trend: formatTaskSummaryTrend(trendRows, 'delayed', { invertTone: true }),
          sparkline: getTaskSummarySparkline(trendRows, 'delayed'),
          tone: stats.delayed_count > 0 ? 'warning' as const : 'slate' as const,
          icon: <Clock className="h-3.5 w-3.5" strokeWidth={1.5} />,
        },
        {
          eyebrow: 'MONTH',
          label: '本月完成',
          value: String(currentMonthCompleted),
          unit: '',
          trend: formatTaskSummaryTrend(trendRows, 'total'),
          sparkline: getTaskSummarySparkline(trendRows, 'total'),
          tone: currentMonthCompleted > 0 ? 'info' as const : 'slate' as const,
          icon: <CalendarCheck className="h-3.5 w-3.5" strokeWidth={1.5} />,
        },
      ]
    : []

  return (
    <section data-testid="task-summary-results-section">
      {cards.length > 0 ? (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4">
          {cards.map((card, index) => {
            const TrendIcon = card.trend.icon
            return (
              <SharedMetricCard
                key={card.label}
                eyebrow={card.eyebrow}
                title={card.label}
                value={card.value}
                unit={card.unit}
                trend={(
                  <span className={cn('inline-flex items-center gap-1', card.trend.className)}>
                    {TrendIcon ? <TrendIcon className="h-3 w-3" strokeWidth={1.5} /> : null}
                    {card.trend.label}
                  </span>
                )}
                sparkline={card.sparkline}
                tone={card.tone}
                icon={card.icon}
                density="compact"
                className="motion-safe:animate-fade-in"
                style={{ animationDelay: `${index * 60}ms` }}
              />
            )
          })}
        </div>
      ) : (
        <EmptyState
          title="暂无任务总结指标"
          description="完成任务总结后会展示完成任务、按时完成率、延期任务和本月完成。"
          className="rounded-2xl empty-state-frame border-slate-100 bg-slate-50 py-10 shadow-[var(--el-1)]"
        />
      )}
    </section>
  )
}

export default TaskSummaryResultsSection
