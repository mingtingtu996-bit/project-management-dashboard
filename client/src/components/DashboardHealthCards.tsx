import { Link } from 'react-router-dom'
import { RadialBar, RadialBarChart, ResponsiveContainer } from 'recharts'

import { CardHead } from '@/components/ui/card-head'
import { ChartTooltip } from '@/components/ui/chart-tooltip'
import { Tooltip } from 'recharts'
import { getTaskDisplayStatus, isDelayedTask } from '@/lib/taskBusinessStatus'
import { CHART_NEUTRAL, CHART_SERIES } from '@/lib/chartPalette'
import { cn } from '@/lib/utils'
import type { Task, Risk } from '@/lib/supabase'
import type { ProjectSummary } from '@/services/dashboardApi'

interface DashboardHealthCardsProps {
  summary: ProjectSummary | null
  tasks: Task[]
  risks: Risk[]
  projectId: string
}

function clampPercent(value: number | null | undefined) {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(100, Math.round(Number(value))))
}

function valueClass(value: number) {
  return cn('num-mono text-slate-900', value === 0 && 'text-slate-400')
}

function ProgressBar({ value, tone = 'bg-blue-600' }: { value: number; tone?: string }) {
  const width = Math.max(clampPercent(value), 4)
  return (
    <div className="h-[3px] overflow-hidden rounded-full bg-slate-100">
      <div className={cn('h-full rounded-full', tone)} style={{ width: `${width}%` }} />
    </div>
  )
}

function Donut({
  label,
  value,
  color,
}: {
  label: string
  value: number
  color: string
}) {
  const safeValue = clampPercent(value)
  return (
    <div className="relative h-32 w-32 shrink-0">
      <ResponsiveContainer width="100%" height="100%">
        <RadialBarChart innerRadius="80%" outerRadius="100%" data={[{ name: label, value: safeValue }]} startAngle={90} endAngle={-270}>
          <RadialBar dataKey="value" cornerRadius={20} fill={color} background={{ fill: CHART_NEUTRAL.softSurface }} />
          <Tooltip content={<ChartTooltip />} />
        </RadialBarChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
        <div className={cn('num-display text-[24px] font-semibold text-slate-900', safeValue === 0 && 'text-slate-400')}>
          {safeValue}%
        </div>
        <div className="eyebrow mt-0.5">{label}</div>
      </div>
    </div>
  )
}

export function DashboardHealthCards({ summary, tasks, risks, projectId }: DashboardHealthCardsProps) {
  const completed = summary?.completedTaskCount ?? tasks.filter((task) => getTaskDisplayStatus(task) === 'completed').length
  const total = summary?.totalTasks ?? tasks.length
  const completedRate = total > 0 ? Math.round((completed / total) * 100) : 0
  const inProgress = tasks.filter((task) => getTaskDisplayStatus(task) === 'in_progress').length
  const delayed = summary?.delayedTaskCount ?? tasks.filter((task) => isDelayedTask(task)).length
  const notStarted = Math.max(0, total - completed - inProgress)
  const onTimeCount = Math.max(0, completed - delayed)
  const onTimeRate = completed > 0 ? Math.round((onTimeCount / completed) * 100) : 0

  const activeRisks = summary?.activeRiskCount ?? risks.filter((risk) => !['closed', 'resolved'].includes(String(risk.status ?? '').toLowerCase())).length
  const activeIssues = summary?.activeIssueCount ?? 0
  const activeObstacles = summary?.activeObstacleCount ?? 0
  const pendingConditions = summary?.pendingConditionTaskCount ?? 0
  const totalSignals = activeRisks + activeIssues + activeObstacles + pendingConditions

  const overallProgress = clampPercent(summary?.overallProgress ?? 0)
  const healthScore = clampPercent(summary?.healthScore ?? 0)
  const milestoneRate =
    (summary?.totalMilestones ?? 0) > 0
      ? Math.round(((summary?.completedMilestones ?? 0) / (summary?.totalMilestones ?? 1)) * 100)
      : 0

  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
      <section className="surface-card p-5">
        <CardHead
          eyebrow="TASKS"
          title="任务执行情况"
          pill={{ label: delayed > 0 ? `${delayed} 延期` : '稳定', variant: delayed > 0 ? 'warning' : 'success' }}
        />
        <div className="mt-5 flex flex-col gap-5 sm:flex-row sm:items-center">
          <Donut label="完成率" value={completedRate} color={CHART_SERIES.primary} />
          <div className="min-w-0 flex-1">
            {[
              { label: '已完成', value: completed, dot: 'bg-emerald-500' },
              { label: '进行中', value: inProgress, dot: 'bg-blue-500' },
              { label: '未开始', value: notStarted, dot: 'bg-slate-400' },
              { label: '已延期', value: delayed, dot: 'bg-rose-500' },
            ].map((item) => (
              <div key={item.label} className="flex items-center justify-between border-b border-slate-100 py-2 text-sm last:border-b-0">
                <span className="inline-flex items-center gap-2 text-slate-500">
                  <span className={cn('h-1.5 w-1.5 rounded-full', item.dot)} />
                  {item.label}
                </span>
                <span className={valueClass(item.value)}>{item.value}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="mt-5 space-y-2">
          <div className="flex items-center justify-between text-[11.5px] text-slate-500">
            <span>按时完成率</span>
            <span className={valueClass(onTimeRate)}>{onTimeRate}%</span>
          </div>
          <ProgressBar value={onTimeRate} tone="bg-emerald-500" />
        </div>
      </section>

      <section className="surface-card p-5">
        <CardHead
          eyebrow="RISKS"
          title="风险与异常追踪"
          pill={{ label: totalSignals > 0 ? `${totalSignals} 待处理` : '正常', variant: totalSignals > 0 ? 'danger' : 'success' }}
        />
        <div className="mt-5 grid grid-cols-3 gap-2">
          {[
            { label: '活跃风险', value: activeRisks, dot: 'bg-rose-500', href: `/projects/${projectId}/risks` },
            { label: '问题', value: activeIssues, dot: 'bg-amber-500', href: `/projects/${projectId}/risks?tab=issues` },
            { label: '阻碍', value: activeObstacles, dot: 'bg-slate-400', href: `/projects/${projectId}/gantt` },
          ].map((item) => (
            <Link
              key={item.label}
              to={item.href}
              className="rounded-xl border border-slate-200/60 bg-slate-50/60 px-3 py-3 transition-colors hover:bg-white"
            >
              <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
                <span className={cn('h-1.5 w-1.5 rounded-full', item.dot)} />
                {item.label}
              </div>
              <div className={cn('mt-2 text-[22px] font-semibold tabular-nums', item.value === 0 ? 'text-slate-400' : 'text-slate-900')}>
                {item.value}
              </div>
            </Link>
          ))}
        </div>
        <div className="mt-5 rounded-xl bg-slate-50/70 p-4 text-[11.5px] leading-5 text-slate-500">
          待满足条件 <span className={valueClass(pendingConditions)}>{pendingConditions}</span> 项。
          {totalSignals > 0 ? ' 建议优先收敛延期、阻碍与高等级风险。' : ' 当前风险与异常信号处于可控范围。'}
        </div>
      </section>

      <section className="surface-card p-5">
        <CardHead
          eyebrow="HEALTH"
          title="进度健康指标"
          pill={{ label: healthScore >= 70 ? '健康' : healthScore >= 50 ? '关注' : '预警', variant: healthScore >= 70 ? 'success' : healthScore >= 50 ? 'warning' : 'danger' }}
        />
        <div className="mt-5 flex flex-col gap-5 sm:flex-row sm:items-center">
          <Donut label="整体进度" value={overallProgress} color={CHART_SERIES.success} />
          <div className="min-w-0 flex-1 space-y-3">
            {[
              { label: '整体进度', value: overallProgress, tone: 'bg-blue-600' },
              { label: '健康度', value: healthScore, tone: 'bg-emerald-500' },
              { label: '里程碑完成率', value: milestoneRate, tone: 'bg-amber-500' },
            ].map((item) => (
              <div key={item.label} className="space-y-1.5 border-b border-slate-100 pb-3 last:border-b-0 last:pb-0">
                <div className="flex items-center justify-between text-[11.5px] text-slate-500">
                  <span>{item.label}</span>
                  <span className={valueClass(item.value)}>{item.value}%</span>
                </div>
                <ProgressBar value={item.value} tone={item.tone} />
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}
