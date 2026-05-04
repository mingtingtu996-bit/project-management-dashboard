import { useMemo, useState, type ElementType } from 'react'
import { ArrowUpRight, AlertTriangle, ChevronDown, CircleCheckBig, Clock3, Layers3, ShieldCheck } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { MetricCard } from '@/components/ui/metric-card'
import { cn } from '@/lib/utils'

import type { DrawingBoardSummary } from '../types'

export interface DrawingDisciplineReadiness {
  disciplineType: string
  total: number
  ready: number
  overdue: number
  ratio: number
}

export interface DrawingReadinessMetrics {
  totalDrawings: number
  approvedDrawings: number
  pendingReviewDrawings: number
  overdueDrawings: number
  plannedSubmitThisMonthCount: number
  reviewingPackages: number
  scheduleImpactCount: number
  disciplineReadiness: DrawingDisciplineReadiness[]
}

function SummaryTile({
  label,
  value,
  hint,
  tone,
  icon: Icon,
}: {
  label: string
  value: string | number
  hint: string
  tone: 'blue' | 'amber' | 'red' | 'emerald' | 'slate'
  icon: ElementType
}) {
  const toneMap = {
    blue: 'primary',
    amber: 'warning',
    red: 'danger',
    emerald: 'success',
    slate: 'slate',
  } as const

  return (
    <MetricCard
      eyebrow="DRAWING"
      title={label}
      value={value}
      hint={hint}
      tone={toneMap[tone]}
      icon={<Icon className="h-5 w-5" />}
    />
  )
}

function ProgressBar({ value, tone = 'blue' }: { value: number; tone?: 'blue' | 'emerald' | 'amber' | 'red' }) {
  const toneClasses = {
    blue: 'bg-blue-600',
    emerald: 'bg-emerald-500',
    amber: 'bg-amber-500',
    red: 'bg-red-500',
  } as const

  return (
    <div className="h-2 overflow-hidden rounded-full bg-slate-100">
      <div
        className={cn('h-full rounded-full motion-safe:transition-[width] motion-safe:duration-700 motion-safe:ease-out', toneClasses[tone])}
        style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
      />
    </div>
  )
}

export function DrawingReadinessMetricGrid({
  summary,
  projectName,
  metrics,
}: {
  summary: DrawingBoardSummary
  projectName?: string
  metrics?: DrawingReadinessMetrics
}) {
  void projectName
  const [showDetails, setShowDetails] = useState(false)

  const fallbackMetrics = useMemo<DrawingReadinessMetrics>(
    () => ({
      totalDrawings: summary.totalPackages,
      approvedDrawings: summary.readyForConstructionCount,
      pendingReviewDrawings: summary.reviewingPackages,
      overdueDrawings: summary.scheduleImpactCount,
      plannedSubmitThisMonthCount: summary.plannedSubmitThisMonthCount ?? 0,
      reviewingPackages: summary.reviewingPackages,
      scheduleImpactCount: summary.scheduleImpactCount,
      disciplineReadiness: [],
    }),
    [summary],
  )

  const displayMetrics = metrics ?? fallbackMetrics
  const readinessRatio =
    displayMetrics.totalDrawings > 0
      ? Math.round((displayMetrics.approvedDrawings / displayMetrics.totalDrawings) * 100)
      : 0

  return (
    <section className="space-y-4">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">图纸准备度总览</h2>
        </div>
      </div>

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        <SummaryTile
          label="总图纸数"
          value={displayMetrics.totalDrawings}
          hint="按台账中单张图纸记录统计。"
          tone="blue"
          icon={Layers3}
        />
        <SummaryTile
          label="已审批"
          value={displayMetrics.approvedDrawings}
          hint="已通过审图或已出图可用。"
          tone="emerald"
          icon={CircleCheckBig}
        />
        <SummaryTile
          label="待审图"
          value={displayMetrics.pendingReviewDrawings}
          hint="仍需审图确认的图纸。"
          tone="amber"
          icon={ShieldCheck}
        />
        <SummaryTile
          label="逾期"
          value={displayMetrics.overdueDrawings}
          hint="计划通过或送审日期已超期。"
          tone="red"
          icon={Clock3}
        />
      </div>

      <Card variant="surface" data-testid="drawing-readiness-progress">
        <CardContent className="space-y-5 p-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-sm font-semibold text-slate-900">整体就绪度</div>
              <div className="text-xs text-slate-500">
                {readinessRatio}% 就绪，已审批 {displayMetrics.approvedDrawings} / {displayMetrics.totalDrawings}
              </div>
            </div>
            <div className="num-display text-2xl font-semibold text-slate-900">{readinessRatio}%</div>
          </div>
          <ProgressBar value={readinessRatio} tone={readinessRatio >= 80 ? 'emerald' : readinessRatio >= 60 ? 'blue' : 'amber'} />
          {displayMetrics.disciplineReadiness.length > 0 ? (
            <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
              {displayMetrics.disciplineReadiness.map((item) => (
                <div key={item.disciplineType} className="rounded-xl border border-slate-100 bg-slate-50/70 p-3">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-medium text-slate-700">{item.disciplineType}</span>
                    <span className="num-mono text-slate-500">{item.ratio}%</span>
                  </div>
                  <div className="mt-2">
                    <ProgressBar value={item.ratio} tone={item.overdue > 0 ? 'red' : item.ratio >= 80 ? 'emerald' : 'blue'} />
                  </div>
                  <div className="mt-2 text-xs text-slate-500">
                    {item.ready}/{item.total} 已就绪{item.overdue > 0 ? ` · ${item.overdue} 逾期` : ''}
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <div className="space-y-3">
        <Button
          type="button"
          variant="ghost"
          className="gap-2 px-0 text-sm text-blue-600 hover:bg-transparent hover:text-blue-500"
          aria-expanded={showDetails}
          data-testid="drawing-detailed-stats-toggle"
          onClick={() => setShowDetails((value) => !value)}
        >
          详细统计
          <ChevronDown className={cn('h-4 w-4 transition-transform duration-200', showDetails ? 'rotate-180' : '')} />
        </Button>
        {showDetails ? (
          <div className="grid gap-5 motion-safe:animate-expand-down md:grid-cols-3" data-testid="drawing-detailed-stats">
            <SummaryTile
              label="本月计划送审"
              value={displayMetrics.plannedSubmitThisMonthCount}
              hint="本月需要提交审查的图纸包。"
              tone="blue"
              icon={ArrowUpRight}
            />
            <SummaryTile
              label="送审 / 处理中"
              value={displayMetrics.reviewingPackages}
              hint="当前仍处在审查或修订链路。"
              tone="amber"
              icon={ShieldCheck}
            />
            <SummaryTile
              label="工期影响项"
              value={displayMetrics.scheduleImpactCount}
              hint="图纸状态已经影响任务推进。"
              tone="red"
              icon={AlertTriangle}
            />
          </div>
        ) : null}
        {summary.criticalBlockingDiscipline ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800" data-testid="drawing-critical-blocking-discipline">
            当前关键卡点专业：{summary.criticalBlockingDiscipline}
          </div>
        ) : null}
      </div>
    </section>
  )
}
