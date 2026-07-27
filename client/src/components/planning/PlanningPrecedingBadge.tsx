import { GitBranch } from 'lucide-react'

import { cn } from '@/lib/utils'

interface PlanningPrecedingBadgeProps {
  count: number
  isCritical?: boolean
  readonly?: boolean
  className?: string
}

export function PlanningPrecedingBadge({
  count,
  isCritical,
  readonly,
  className,
}: PlanningPrecedingBadgeProps) {
  return (
    <span
      data-testid="planning-preceding-badge"
      className={cn(
        'inline-flex h-6 items-center gap-1 rounded-md px-1.5 text-xs font-medium',
        isCritical ? 'text-red-500' : 'text-slate-500',
        readonly && 'text-slate-500',
        className,
      )}
    >
      <GitBranch className="h-3 w-3" />
      {count > 0 ? `↩ ${count}` : '↩ 添加'}
    </span>
  )
}

export default PlanningPrecedingBadge
