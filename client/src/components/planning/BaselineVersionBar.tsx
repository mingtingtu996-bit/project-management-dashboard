// v1.4.7.1: Baseline version info bar (§12.1)
// Shows version, confirm time, plan period, total duration + compare/diff buttons

import { memo } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { Clock, GitCompare, History } from 'lucide-react'

export interface BaselineVersionBarProps {
  versionLabel: string
  isDraft?: boolean
  confirmedAt?: string | null
  planStartDate?: string | null
  planEndDate?: string | null
  totalDurationDays?: number | string | null
  onCompareWithCurrent?: () => void
  onViewHistory?: () => void
  className?: string
}

export const BaselineVersionBar = memo(function BaselineVersionBar(props: BaselineVersionBarProps) {
  const {
    versionLabel,
    isDraft,
    confirmedAt,
    planStartDate,
    planEndDate,
    totalDurationDays,
    onCompareWithCurrent,
    onViewHistory,
    className,
  } = props

  const dateRange = planStartDate && planEndDate
    ? `${planStartDate} — ${planEndDate}`
    : null

  return (
    <div className={cn(
      'flex flex-wrap items-center gap-3 rounded-xl border px-4 py-2.5',
      isDraft ? 'border-amber-200 bg-amber-50/50' : 'border-slate-200 bg-slate-50/70',
      className,
    )} data-testid="baseline-version-bar">
      <div className="flex items-center gap-2">
        <Badge variant={isDraft ? 'secondary' : 'outline'} className="text-xs">
          {versionLabel}
        </Badge>
        {isDraft && (
          <span className="text-xs text-amber-700 font-medium">草案 — 系统自动生成，请复核</span>
        )}
      </div>

      {confirmedAt && (
        <div className="flex items-center gap-1.5 text-xs text-slate-500">
          <Clock className="h-3.5 w-3.5" />
          确认于 {confirmedAt.slice(0, 10)}
        </div>
      )}

      {dateRange && (
        <div className="flex items-center gap-1.5 text-xs text-slate-600">
          <span className="tabular-nums">计划周期: {dateRange}</span>
          {totalDurationDays != null && (
            <span className="tabular-nums text-slate-600">· {totalDurationDays} 天</span>
          )}
        </div>
      )}

      <div className="ml-auto flex items-center gap-2">
        {onCompareWithCurrent && (
          <Button
            variant="outline"
            size="sm"
            className="h-7 gap-1 text-xs"
            data-testid="baseline-compare-current"
            onClick={onCompareWithCurrent}
          >
            <GitCompare className="h-3.5 w-3.5" />
            对比当前生效版本
          </Button>
        )}
        {onViewHistory && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1 text-xs"
            data-testid="baseline-view-history"
            onClick={onViewHistory}
          >
            <History className="h-3.5 w-3.5" />
            版本记录
          </Button>
        )}
      </div>
    </div>
  )
})

export default BaselineVersionBar
