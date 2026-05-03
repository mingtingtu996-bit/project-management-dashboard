import type { CSSProperties, ReactNode } from 'react'

import { Sparkline } from '@/components/Sparkline'
import { Card, CardContent } from '@/components/ui/card'
import { useCountUp } from '@/hooks/useCountUp'
import { CHART_NEUTRAL, CHART_SERIES } from '@/lib/chartPalette'
import { formatMetricValue } from '@/lib/formatters'
import { cn } from '@/lib/utils'

type MetricTone = 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'slate'

const toneClassMap: Record<MetricTone, { accent: string; icon: string; sparkline: string }> = {
  primary: {
    accent: CHART_SERIES.primary,
    icon: 'text-blue-500',
    sparkline: CHART_SERIES.primary,
  },
  success: {
    accent: CHART_SERIES.success,
    icon: 'text-emerald-500',
    sparkline: CHART_SERIES.success,
  },
  warning: {
    accent: CHART_SERIES.warning,
    icon: 'text-amber-500',
    sparkline: CHART_SERIES.warning,
  },
  danger: {
    accent: CHART_SERIES.danger,
    icon: 'text-rose-500',
    sparkline: CHART_SERIES.danger,
  },
  info: {
    accent: CHART_SERIES.info,
    icon: 'text-sky-500',
    sparkline: CHART_SERIES.info,
  },
  slate: {
    accent: CHART_NEUTRAL.muted,
    icon: 'text-slate-400',
    sparkline: CHART_SERIES.primary,
  },
}

export interface MetricCardProps {
  eyebrow?: string
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

function isFlatSparkline(points: Array<{ value: number }>) {
  return points.length > 1 && points.every((point) => point.value === points[0].value)
}

export function MetricCard({
  eyebrow,
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
  const sparklineColor = isFlatSparkline(sparklineData) ? CHART_NEUTRAL.border : toneClass.sparkline
  const numericValue = typeof value === 'number' && Number.isFinite(value) ? value : null
  const countValue = useCountUp(numericValue ?? 0, { duration: 900 })
  const displayValue = numericValue !== null ? countValue : value
  const isZero = numericValue === 0

  return (
    <Card
      data-testid={testId}
      variant="surface"
      className={cn(
        'relative h-full cursor-pointer overflow-hidden border-slate-200/60 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[var(--el-hover)]',
        className,
      )}
      style={style}
    >
      <CardContent padding="md" className="flex h-full min-h-[132px] flex-col justify-between gap-3">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            {eyebrow ? <div className="eyebrow">{eyebrow}</div> : null}
            <p className="mt-0.5 truncate text-sm font-medium text-slate-500">{title}</p>
            <div className="mt-3 flex flex-wrap items-end gap-2">
              <span className={cn('num-display text-[34px] font-semibold leading-none text-slate-900', isZero && 'text-slate-400')}>
                {formatMetricValue(displayValue, unit)}
              </span>
              {trend ? <span className="pb-1 text-[11px] font-medium text-slate-400">{trend}</span> : null}
            </div>
          </div>
          {icon ? (
            <div className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-slate-200/60 bg-white', toneClass.icon)}>
              {icon}
            </div>
          ) : null}
        </div>
        {(hint || sparklineData.length > 1) ? (
          <div className="min-w-0 space-y-2">
            {hint ? <div className="min-w-0 text-xs leading-5 text-slate-500">{hint}</div> : <span />}
            {sparklineData.length > 1 ? (
              <Sparkline data={sparklineData} color={sparklineColor} className="h-8 w-full" />
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
