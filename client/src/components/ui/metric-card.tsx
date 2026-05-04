import type { CSSProperties, KeyboardEvent, ReactNode } from 'react'

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
  onClick?: () => void
  density?: 'regular' | 'compact'
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
  onClick,
  density = 'regular',
}: MetricCardProps) {
  const isCompact = density === 'compact'
  const toneClass = toneClassMap[tone]
  const sparklineData = normalizeSparkline(sparkline)
  const sparklineColor = isFlatSparkline(sparklineData) ? CHART_NEUTRAL.border : toneClass.sparkline
  const numericValue = typeof value === 'number' && Number.isFinite(value) ? value : null
  const countValue = useCountUp(numericValue ?? 0, { duration: 900 })
  const displayValue = numericValue !== null ? countValue : value
  const isZero = numericValue === 0
  const interactiveProps = onClick
    ? {
        role: 'button',
        tabIndex: 0,
        onClick,
        onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            onClick()
          }
        },
      }
    : {}

  return (
    <Card
      data-testid={testId}
      variant="surface"
      className={cn(
        'relative h-full overflow-hidden border-slate-200/60 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[var(--el-hover)]',
        onClick && 'cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-200 focus-visible:ring-offset-2',
        className,
      )}
      style={style}
      {...interactiveProps}
    >
      <CardContent padding="md" className={cn('flex h-full flex-col gap-4', isCompact ? 'min-h-[132px]' : 'min-h-[148px]')}>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 pr-2">
            {eyebrow ? <div className="eyebrow">{eyebrow}</div> : null}
            <p className="mt-0.5 truncate text-sm font-medium text-slate-500">{title}</p>
          </div>
          {icon ? (
            <div className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-slate-200/60 bg-white', toneClass.icon)}>
              {icon}
            </div>
          ) : null}
        </div>

        <div className="min-w-0">
          <div>
            <span className={cn('metric-value-2xl num-display font-semibold leading-none text-slate-900', isZero && 'text-slate-400')}>
              {formatMetricValue(displayValue, unit)}
            </span>
          </div>
        </div>

        {(trend || hint || sparklineData.length > 1) ? (
          <div className={cn('mt-auto flex min-w-0 items-end justify-between gap-3 pt-1', isCompact ? 'min-h-7' : 'min-h-8')}>
            <div className="min-w-0">
              {trend ? <div className="meta-muted truncate text-xs font-medium leading-4">{trend}</div> : null}
              {hint ? <div className="min-w-0 truncate text-xs leading-5 text-slate-500">{hint}</div> : null}
            </div>
            {sparklineData.length > 1 ? (
              <Sparkline data={sparklineData} color={sparklineColor} className={cn('shrink-0', isCompact ? 'h-6 w-20' : 'h-8 w-24')} />
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
