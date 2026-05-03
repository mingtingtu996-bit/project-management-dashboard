import { Link } from 'react-router-dom'
import { useEffect, useMemo, useState } from 'react'
import { PolarAngleAxis, RadialBar, RadialBarChart, ResponsiveContainer } from 'recharts'

import { CardHead } from '@/components/ui/card-head'
import { apiGet, isAbortError } from '@/lib/apiClient'
import { getTaskDisplayStatus, isDelayedTask } from '@/lib/taskBusinessStatus'
import { CHART_SERIES } from '@/lib/chartPalette'
import { cn } from '@/lib/utils'
import type { Task, Risk } from '@/lib/supabase'
import type { ProjectSummary } from '@/services/dashboardApi'

interface DashboardHealthCardsProps {
  summary: ProjectSummary | null
  tasks: Task[]
  risks: Risk[]
  projectId: string
  embedded?: boolean
}

interface BusinessHealthDetails {
  progressDeliveryScore?: number
  taskExecutionScore?: number
  milestoneDeliveryScore?: number
  riskControlScore?: number
  dataTrustScore?: number
  capReasons?: string[]
  totalScore?: number
}

const RISK_LEVEL_WEIGHT: Record<string, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
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
    <div className="relative h-[120px] w-[120px] shrink-0">
      <ResponsiveContainer width="100%" height="100%">
        <RadialBarChart
          innerRadius="75%"
          outerRadius="95%"
          barSize={10}
          data={[{ name: label, value: safeValue }]}
          startAngle={90}
          endAngle={-270}
        >
          <PolarAngleAxis angleAxisId={0} type="number" domain={[0, 100]} tick={false} />
          <RadialBar angleAxisId={0} dataKey="value" cornerRadius={10} fill={color} background={{ fill: '#E2E8F0' }} animationDuration={800} />
        </RadialBarChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
        <div className={cn('num-display text-[30px] font-semibold leading-none text-slate-900', safeValue === 0 && 'text-slate-400')}>
          {safeValue}%
        </div>
        <div className="eyebrow mt-1">{label}</div>
      </div>
    </div>
  )
}

function isActiveRisk(risk: Risk) {
  return !['closed', 'resolved'].includes(String(risk.status ?? '').toLowerCase())
}

function riskPriority(risk: Risk) {
  const level = RISK_LEVEL_WEIGHT[String(risk.level ?? '').toLowerCase()] ?? 0
  return level * 100 + Number(risk.impact ?? 0) * 10 + Number(risk.probability ?? 0)
}

export function DashboardHealthCards({ summary, tasks, risks, projectId, embedded = false }: DashboardHealthCardsProps) {
  const [healthDetails, setHealthDetails] = useState<BusinessHealthDetails | null>(null)

  useEffect(() => {
    if (!projectId) {
      setHealthDetails(null)
      return
    }

    const controller = new AbortController()
    apiGet<{ score: number; details?: BusinessHealthDetails }>(`/api/health-score/${projectId}`, {
      signal: controller.signal,
      runtimeCache: 'off',
    })
      .then((payload) => {
        if (!controller.signal.aborted) {
          setHealthDetails(payload?.details ?? null)
        }
      })
      .catch((error) => {
        if (!isAbortError(error) && !controller.signal.aborted) {
          console.error('Failed to load dashboard health details:', error)
          setHealthDetails(null)
        }
      })

    return () => {
      controller.abort()
    }
  }, [projectId])

  const completed = summary?.completedTaskCount ?? tasks.filter((task) => getTaskDisplayStatus(task) === 'completed').length
  const total = summary?.totalTasks ?? tasks.length
  const completedRate = total > 0 ? Math.round((completed / total) * 100) : 0
  const inProgress = tasks.filter((task) => getTaskDisplayStatus(task) === 'in_progress').length
  const delayed = summary?.delayedTaskCount ?? tasks.filter((task) => isDelayedTask(task)).length
  const notStarted = Math.max(0, total - completed - inProgress)

  const activeRiskRows = useMemo(
    () => risks.filter(isActiveRisk).sort((left, right) => riskPriority(right) - riskPriority(left)),
    [risks],
  )
  const activeRisks = summary?.activeRiskCount ?? activeRiskRows.length
  const activeIssues = summary?.activeIssueCount ?? 0
  const activeObstacles = summary?.activeObstacleCount ?? 0
  const pendingConditions = summary?.pendingConditionTaskCount ?? 0
  const totalSignals = activeRisks + activeIssues + activeObstacles + pendingConditions
  const primaryRiskName = activeRiskRows[0]?.title?.trim()
  const riskSuggestion = primaryRiskName ? `首要关注：${primaryRiskName}` : '暂无活跃风险'

  const overallProgress = clampPercent(summary?.overallProgress ?? 0)
  const healthScore = clampPercent(healthDetails?.totalScore ?? summary?.healthScore ?? 0)
  const milestoneRate =
    (summary?.totalMilestones ?? 0) > 0
      ? Math.round(((summary?.completedMilestones ?? 0) / (summary?.totalMilestones ?? 1)) * 100)
      : 0
  const columnClassName = embedded
    ? 'flex h-full min-w-0 flex-col border-b border-slate-100 pb-5 last:border-b-0 last:pb-0 md:border-b-0 md:pb-0 md:border-r md:border-slate-100 md:pr-5 md:last:border-r-0 md:last:pr-0'
    : 'surface-card flex h-full flex-col p-5'
  const donutContentClassName = 'mt-5 grid gap-5 lg:grid-cols-[120px_minmax(0,1fr)] lg:items-center xl:grid-cols-1 2xl:grid-cols-[120px_minmax(0,1fr)]'
  const businessScores = [
    { label: '进度兑现', value: healthDetails?.progressDeliveryScore ?? overallProgress, tone: 'bg-blue-600' },
    { label: '任务执行', value: healthDetails?.taskExecutionScore ?? completedRate, tone: 'bg-emerald-500' },
    { label: '里程碑交付', value: healthDetails?.milestoneDeliveryScore ?? milestoneRate, tone: 'bg-amber-500' },
    { label: '风险阻碍', value: healthDetails?.riskControlScore ?? Math.max(0, 100 - totalSignals * 10), tone: 'bg-rose-500' },
    { label: '数据可信度', value: healthDetails?.dataTrustScore ?? 100, tone: 'bg-slate-500' },
  ].map((item) => ({ ...item, value: clampPercent(item.value) }))

  return (
    <div className={cn('grid grid-cols-1 gap-5', embedded ? 'md:grid-cols-3' : 'xl:grid-cols-3')}>
      <section className={columnClassName}>
        <CardHead
          eyebrow="HEALTH"
          title="进度健康指标"
          pill={{ label: healthScore >= 70 ? '健康' : healthScore >= 50 ? '关注' : '预警', variant: healthScore >= 70 ? 'success' : healthScore >= 50 ? 'warning' : 'danger' }}
        />
        <div className={donutContentClassName}>
          <Donut label="健康度" value={healthScore} color={CHART_SERIES.success} />
          <div className="min-w-0 space-y-2.5">
            {businessScores.map((item) => (
              <div key={item.label} className="space-y-1.5">
                <div className="meta-text flex items-center justify-between">
                  <span>{item.label}</span>
                  <span className={valueClass(item.value)}>{item.value}%</span>
                </div>
                <ProgressBar value={item.value} tone={item.tone} />
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className={columnClassName}>
        <CardHead
          eyebrow="TASKS"
          title="任务执行情况"
          pill={{ label: delayed > 0 ? `${delayed} 延期` : '稳定', variant: delayed > 0 ? 'warning' : 'success' }}
        />
        <div className={donutContentClassName}>
          <Donut label="完成率" value={completedRate} color={CHART_SERIES.primary} />
          <div className="min-w-0">
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
      </section>

      <section className={columnClassName}>
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
          <span className="ml-1">{riskSuggestion}</span>
        </div>
      </section>
    </div>
  )
}
