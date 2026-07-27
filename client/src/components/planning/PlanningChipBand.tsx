import type { ReactNode } from 'react'

import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

export interface PlanningChipBandOverflowItem {
  key: string
  label: string
}

interface PlanningChipBandProps {
  children?: ReactNode
  overflowItems?: PlanningChipBandOverflowItem[]
  actions?: ReactNode
  className?: string
}

export function PlanningChipBand({
  children,
  overflowItems = [],
  actions,
  className,
}: PlanningChipBandProps) {
  return (
    <span
      data-testid="planning-chip-band"
      className={cn('inline-flex min-w-0 items-center gap-1', className)}
    >
      {children}

      {overflowItems.length > 0 ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge
              variant="outline"
              className="h-5 shrink-0 cursor-help border-slate-200 bg-white px-1.5 text-xs text-slate-500"
            >
              +{overflowItems.length}
            </Badge>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-xs text-xs">
            {overflowItems.map((item) => item.label).join('、')}
          </TooltipContent>
        </Tooltip>
      ) : null}

      {actions}
    </span>
  )
}

export default PlanningChipBand
