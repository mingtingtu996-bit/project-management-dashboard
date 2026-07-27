// v1.4.7.1 §10.6: Acceptance impact summary chip
// Read-only display of acceptance plans affected by a task

import { memo } from 'react'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { CheckCircle2 } from 'lucide-react'

export interface AcceptanceImpactItem {
  id: string
  name: string
  status?: string
  statusLabel?: string
}

export interface AcceptanceImpactChipProps {
  items: AcceptanceImpactItem[]
  onOpenDrawer?: () => void
  maxVisible?: number
  className?: string
}

export const AcceptanceImpactChip = memo(function AcceptanceImpactChip(props: AcceptanceImpactChipProps) {
  const { items, onOpenDrawer, maxVisible = 3, className } = props

  if (items.length === 0) return null

  const label = items.length === 1
    ? `影响${items[0].name}`
    : `影响 ${items.length} 项验收`

  const visibleTooltipItems = items.slice(0, maxVisible)
  const tooltipContent = visibleTooltipItems.map(i => i.name).join('、')
    + (items.length > visibleTooltipItems.length ? ` 等${items.length}项` : '')

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge
          variant="outline"
          className={cn(
            'flex items-center gap-1 border-blue-200 bg-blue-50 px-1.5 py-0 text-xs text-blue-700',
            onOpenDrawer && 'cursor-pointer hover:bg-blue-100',
            className,
          )}
          onClick={(e) => { e.stopPropagation(); onOpenDrawer?.() }}
        >
          <CheckCircle2 className="h-3 w-3" />
          {label}
        </Badge>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs text-xs">
        {tooltipContent}
      </TooltipContent>
    </Tooltip>
  )
})

export default AcceptanceImpactChip
