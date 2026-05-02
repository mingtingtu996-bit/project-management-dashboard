import type { ReactNode } from 'react'
import type { TooltipContentProps } from 'recharts'

import { CHART_NEUTRAL, CHART_SERIES } from '@/lib/chartPalette'
import { cn } from '@/lib/utils'

type ChartTooltipProps = Partial<TooltipContentProps<number | string, string>> & {
  labelFormatter?: (label: unknown) => ReactNode
}

export const chartTooltipCursor = { stroke: CHART_NEUTRAL.muted, strokeDasharray: '4 4' }

export function ChartTooltip({ active, payload, label, labelFormatter }: ChartTooltipProps) {
  if (!active || !payload || payload.length === 0) return null

  return (
    <div
      className="rounded-lg border border-slate-200/60 bg-white p-3 text-xs shadow-[var(--el-2)]"
      style={{ animation: 'tooltip-in 160ms ease-out' }}
    >
      {label !== undefined ? (
        <div className="mb-2 font-medium text-slate-900">{labelFormatter ? labelFormatter(label) : String(label)}</div>
      ) : null}
      <div className="space-y-1.5">
        {payload.map((item, index) => (
          <div key={`${item.name ?? index}`} className="flex items-center justify-between gap-6">
            <span className="inline-flex items-center gap-1.5 text-slate-500">
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: item.color || item.stroke || CHART_SERIES.primary }}
              />
              {item.name}
            </span>
            <span className={cn('num-mono text-slate-900', Number(item.value) === 0 && 'text-slate-400')}>
              {item.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
