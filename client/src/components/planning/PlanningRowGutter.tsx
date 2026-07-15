import type { MouseEvent, ReactNode } from 'react'
import { Check } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { getTreeBranchPrefix, type SharedTreeRowKind } from '@/components/tree/SharedTreePrimitives'
import { cn } from '@/lib/utils'

interface PlanningRowGutterProps {
  rowId: string
  label: ReactNode
  depth: number
  rowKind: SharedTreeRowKind
  selected?: boolean
  readOnly?: boolean
  isPlanEntryTable?: boolean
  mappingStatus?: string | null
  onToggle?: (event: MouseEvent<HTMLButtonElement>) => void
  className?: string
}

export function PlanningRowGutter({
  rowId,
  label,
  depth,
  rowKind,
  selected,
  readOnly,
  isPlanEntryTable,
  mappingStatus,
  onToggle,
  className,
}: PlanningRowGutterProps) {
  return (
    <div
      data-testid="planning-row-gutter"
      className={cn(
        'sticky left-0 z-20 flex min-w-0 items-center gap-2 bg-inherit pr-2 text-sm text-slate-500 num-mono',
        className,
      )}
    >
      {readOnly ? (
        <span
          className={cn(
            'h-5 w-1.5 shrink-0 rounded-full bg-slate-200',
            isPlanEntryTable && !selected && 'hidden',
            !isPlanEntryTable && rowKind === 'milestone' && 'bg-amber-400',
            !isPlanEntryTable && mappingStatus && 'bg-amber-500',
            selected && 'bg-blue-600',
          )}
        />
      ) : (
        <Button
          variant="ghost"
          type="button"
          aria-label={`toggle-${rowId}`}
          data-testid="planning-selection-checkbox"
          onClick={onToggle}
          className={cn(
            'flex h-5 w-5 items-center justify-center rounded border transition',
            selected ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-300 bg-white text-transparent',
          )}
        >
          <Check className="h-3.5 w-3.5" />
        </Button>
      )}
      <div className="flex min-w-0 items-center gap-1.5">
        {getTreeBranchPrefix(depth) ? (
          <span className="shrink-0 text-xs font-medium text-slate-300" aria-hidden="true">
            {getTreeBranchPrefix(depth)}
          </span>
        ) : null}
        <span
          className={cn(
            'rounded-md px-1.5 py-0.5 font-mono text-xs font-medium text-slate-500',
            isPlanEntryTable ? 'whitespace-nowrap' : 'truncate',
            rowKind === 'structure' && 'bg-white text-slate-800 shadow-sm ring-1 ring-inset ring-slate-200',
            rowKind === 'milestone' && 'bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200',
          )}
        >
          {label}
        </span>
      </div>
    </div>
  )
}

export default PlanningRowGutter
