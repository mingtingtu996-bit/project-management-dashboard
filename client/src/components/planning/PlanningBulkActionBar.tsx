// v1.4.7.1: Multi-select floating bulk action bar
// Replaces Excel fill handle with explicit batch actions

import { memo } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { Pencil, Trash2, X } from 'lucide-react'

export interface BulkAction {
  key: string
  label: string
  onClick: () => void
  disabled?: boolean
}

interface PlanningBulkActionBarProps {
  selectedCount: number
  actions: BulkAction[]
  onClose: () => void
  className?: string
}

export const PlanningBulkActionBar = memo(function PlanningBulkActionBar(props: PlanningBulkActionBarProps) {
  const { selectedCount, actions, onClose, className } = props

  if (selectedCount === 0) return null

  return (
    <div
      className={cn(
        'fixed bottom-4 left-1/2 z-40 flex -translate-x-1/2 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 shadow-[var(--el-3)]',
        'animate-[slideUp_150ms_ease-out]',
        className,
      )}
      style={{ animation: 'slideUp 150ms ease-out' } as React.CSSProperties}
    >
      <span className="text-sm font-medium text-slate-700">
        已选 {selectedCount} 项
      </span>
      <div className="h-4 w-px bg-slate-200" />
      {actions.map((action) => (
        <Button
          key={action.key}
          variant="ghost"
          size="sm"
          className="h-7 text-xs"
          disabled={action.disabled}
          onClick={action.onClick}
        >
          {action.label}
        </Button>
      ))}
      <div className="h-4 w-px bg-slate-200" />
      <Button variant="ghost" size="sm" className="h-7" onClick={onClose}>
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  )
})

export default PlanningBulkActionBar
