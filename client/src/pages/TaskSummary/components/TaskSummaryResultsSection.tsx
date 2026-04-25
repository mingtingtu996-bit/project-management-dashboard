import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'

type SummaryStats = {
  total_completed: number
  on_time_count: number
  delayed_count: number
  completed_milestone_count: number
  avg_delay_days?: number
}

interface TaskSummaryResultsSectionProps {
  stats: SummaryStats | null
}

function MetricCard({
  label,
  value,
  hint,
  tone,
}: {
  label: string
  value: string
  hint: string
  tone: string
}) {
  void hint

  return (
    <div className={`rounded-2xl border px-4 py-4 ${tone}`}>
      <div className="text-xs font-medium uppercase tracking-[0.18em] opacity-70">{label}</div>
      <div className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">{value}</div>
    </div>
  )
}

export function TaskSummaryResultsSection({ stats }: TaskSummaryResultsSectionProps) {
  const cards = stats
    ? [
        {
          label: '已完成任务',
          value: String(stats.total_completed),
          hint: '结果摘要数据来自任务总结接口',
          tone: 'bg-blue-50 border-blue-100',
        },
        {
          label: '按时完成',
          value: String(stats.on_time_count),
          hint: '用于观察兑现质量',
          tone: 'bg-emerald-50 border-emerald-100',
        },
        {
          label: '延期完成',
          value: String(stats.delayed_count),
          hint: '用于识别偏差积累',
          tone: 'bg-amber-50 border-amber-100',
        },
        {
          label: '完成里程碑',
          value: String(stats.completed_milestone_count),
          hint: '保持关键路径结果可读',
          tone: 'bg-violet-50 border-violet-100',
        },
      ]
    : []

  return (
    <section data-testid="task-summary-results-section" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">结果摘要区</div>
          <h2 className="mt-2 text-[26px] font-semibold tracking-tight text-slate-900">结果摘要</h2>
        </div>
        <Badge variant="secondary">已收口</Badge>
      </div>

      {cards.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          {cards.map((card) => (
            <MetricCard key={card.label} {...card} />
          ))}
        </div>
      ) : (
        <Card className="border-slate-200 shadow-sm">
          <CardContent className="flex flex-col items-center justify-center gap-2 py-10 text-center">
            <div className="text-sm font-medium text-slate-900">暂无结果摘要数据</div>
          </CardContent>
        </Card>
      )}
    </section>
  )
}

export default TaskSummaryResultsSection
