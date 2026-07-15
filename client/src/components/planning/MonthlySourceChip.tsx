// v1.4.7.1: Monthly plan source chip (§12.2)
// Shows how each row entered the monthly plan: carryover/baseline/field/manual

import { memo, type ReactNode } from 'react'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { ArrowRightLeft, Calendar, MapPin, Plus } from 'lucide-react'

// v1.4.7.3 §12.4: aligned with plan spec — rolling_in/baseline/site/new
export type MonthlySourceMode = 'rolling_in' | 'baseline' | 'site' | 'new'

const SOURCE_CONFIG: Record<MonthlySourceMode, { label: string; icon: ReactNode; className: string; tooltip: string }> = {
  rolling_in: {
    label: '滚入',
    icon: <ArrowRightLeft className="h-3 w-3" />,
    className: 'border-sky-200 bg-sky-50 text-sky-700',
    tooltip: '上月未完成项滚入本月',
  },
  baseline: {
    label: '基线',
    icon: <Calendar className="h-3 w-3" />,
    className: 'border-slate-200 bg-slate-50 text-slate-600',
    tooltip: '当前生效基线本月应执行项',
  },
  site: {
    label: '现场',
    icon: <MapPin className="h-3 w-3" />,
    className: 'border-blue-200 bg-blue-50 text-blue-700',
    tooltip: '当前任务列表当月排期',
  },
  new: {
    label: '新增',
    icon: <Plus className="h-3 w-3" />,
    className: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    tooltip: '用户在编辑态手动新增',
  },
}

export interface MonthlySourceChipProps {
  sourceMode: MonthlySourceMode
  reasonSummary?: string
  className?: string
}

export const MonthlySourceChip = memo(function MonthlySourceChip({
  sourceMode,
  reasonSummary,
  className,
}: MonthlySourceChipProps) {
  const config = SOURCE_CONFIG[sourceMode] ?? SOURCE_CONFIG.new
  const tooltip = reasonSummary ?? config.tooltip

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge
          variant="outline"
          className={cn('flex cursor-default items-center gap-1 px-1.5 py-0 text-xs', config.className, className)}
        >
          {config.icon}
          {config.label}
        </Badge>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs text-xs">
        {tooltip}
      </TooltipContent>
    </Tooltip>
  )
})

export default MonthlySourceChip
