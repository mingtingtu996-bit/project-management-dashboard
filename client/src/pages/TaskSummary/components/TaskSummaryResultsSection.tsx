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
  totalTasks: number
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
  return (
    <Card className={`border px-0 shadow-sm ${tone}`}>
      <CardContent className="space-y-2 p-5">
        <div className="text-xs font-medium uppercase tracking-wider opacity-70">{label}</div>
        <div className="text-3xl font-semibold tracking-tight text-slate-900">{value}</div>
        <div className="text-xs text-slate-500">{hint}</div>
      </CardContent>
    </Card>
  )
}

export function TaskSummaryResultsSection({ stats, totalTasks }: TaskSummaryResultsSectionProps) {
  const completedTasks = stats?.total_completed ?? 0
  const completionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0
  const cards = stats
    ? [
        {
          label: '总任务数',
          value: String(totalTasks),
          hint: `已完成 ${completedTasks} 个任务`,
          tone: 'bg-blue-50 border-blue-100',
        },
        {
          label: '完成率',
          value: `${completionRate}%`,
          hint: `按时 ${stats.on_time_count} · 延期 ${stats.delayed_count}`,
          tone: 'bg-emerald-50 border-emerald-100',
        },
      ]
    : []

  return (
    <section data-testid="task-summary-results-section" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">结果摘要区</div>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">结果摘要</h2>
        </div>
        <Badge variant="secondary">已收口</Badge>
      </div>

      {cards.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
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
