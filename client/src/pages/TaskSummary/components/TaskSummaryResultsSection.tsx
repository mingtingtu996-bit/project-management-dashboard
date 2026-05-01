import { EmptyState } from '@/components/EmptyState'
import { Badge } from '@/components/ui/badge'
import { MetricCard } from '@/components/ui/metric-card'

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

export function TaskSummaryResultsSection({ stats, totalTasks }: TaskSummaryResultsSectionProps) {
  const completedTasks = stats?.total_completed ?? 0
  const completionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0
  const cards = stats
    ? [
        {
          label: '总任务数',
          value: String(totalTasks),
          hint: `已完成 ${completedTasks} 个任务`,
          tone: 'primary' as const,
        },
        {
          label: '完成率',
          value: `${completionRate}%`,
          hint: `按时 ${stats.on_time_count} · 延期 ${stats.delayed_count}`,
          tone: 'success' as const,
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
            <MetricCard key={card.label} title={card.label} value={card.value} hint={card.hint} tone={card.tone} />
          ))}
        </div>
      ) : (
        <EmptyState
          title="暂无结果摘要数据"
          description="完成任务汇总后会展示总任务数、完成率和延期情况。"
          className="rounded-card empty-state-frame border-slate-100 bg-slate-50 py-10 shadow-[var(--el-1)]"
        />
      )}
    </section>
  )
}

export default TaskSummaryResultsSection
