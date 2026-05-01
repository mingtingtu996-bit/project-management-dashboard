import type { CSSProperties, ReactNode } from 'react'

import { Sparkline } from '@/components/Sparkline'
import { Card, CardContent } from '@/components/ui/card'
import { CHART_SERIES } from '@/lib/chartPalette'
import { formatMetricValue } from '@/lib/formatters'
import { cn } from '@/lib/utils'

type MetricTone = 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'slate'

const toneClassMap: Record<MetricTone, { rail: string; icon: string; sparkline: string }> = {
  primary: {
    rail: 'border-l-blue-500',
    icon: 'bg-blue-50 text-blue-700',
    sparkline: CHART_SERIES.primary,
  },
  success: {
    rail: 'border-l-emerald-500',
    icon: 'bg-emerald-50 text-emerald-700',
    sparkline: CHART_SERIES.success,
  },
  warning: {
    rail: 'border-l-amber-500',
    icon: 'bg-amber-50 text-amber-700',
    sparkline: CHART_SERIES.warning,
  },
  danger: {
    rail: 'border-l-red-500',
    icon: 'bg-red-50 text-red-700',
    sparkline: CHART_SERIES.danger,
  },
  info: {
    rail: 'border-l-sky-500',
    icon: 'bg-sky-50 text-sky-700',
    sparkline: CHART_SERIES.info,
  },
  slate: {
    rail: 'border-l-slate-400',
    icon: 'bg-slate-50 text-slate-600',
    sparkline: CHART_SERIES.primary,
  },
}

export interface MetricCardProps {
  title: string
  value: string | number | null | undefined
  hint?: ReactNode
  trend?: ReactNode
  icon?: ReactNode
  unit?: string
  tone?: MetricTone
  sparkline?: Array<number | { value: number }>
  testId?: string
  className?: string
  style?: CSSProperties
}

function normalizeSparkline(points?: Array<number | { value: number }>) {
  if (!points || points.length === 0) return []
  return points
    .map((point) => (typeof point === 'number' ? { value: point } : point))
    .filter((point) => Number.isFinite(point.value))
}

export function MetricCard({
  title,
  value,
  hint,
  trend,
  icon,
  unit = '',
  tone = 'primary',
  sparkline,
  testId,
  className,
  style,
}: MetricCardProps) {
  const toneClass = toneClassMap[tone]
  const sparklineData = normalizeSparkline(sparkline)

  return (
    <Card data-testid={testId} variant="metric" className={cn(toneClass.rail, className)} style={style}>
      <CardContent padding="md" className="flex h-full flex-col gap-3">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-slate-500">{title}</p>
            <div className="mt-2 flex flex-wrap items-baseline gap-2">
              <span className="text-2xl font-bold tabular-nums text-slate-900">{formatMetricValue(value, unit)}</span>
              {trend ? <span className="text-sm font-medium text-slate-600">{trend}</span> : null}
            </div>
          </div>
          {icon ? <div className={cn('shrink-0 rounded-lg p-2', toneClass.icon)}>{icon}</div> : null}
        </div>
        {(hint || sparklineData.length > 1) ? (
          <div className="mt-auto flex min-w-0 items-end justify-between gap-3">
            {hint ? <div className="min-w-0 text-xs leading-5 text-slate-500">{hint}</div> : <span />}
            {sparklineData.length > 1 ? (
              <Sparkline data={sparklineData} color={toneClass.sparkline} className="shrink-0" />
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
