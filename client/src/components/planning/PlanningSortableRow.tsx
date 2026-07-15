// v1.4.7.1 §7.12: Drag-sort + parent-child folding
// Drag handle + indent/outdent + reorder with WBS recalculation trigger

import { memo, useCallback, useRef, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { GripVertical } from 'lucide-react'
import { Button } from '@/components/ui/button'

export interface SortableRowProps {
  rowId: string
  depth: number
  isCollapsed: boolean
  hasChildren: boolean
  canDrag?: boolean
  canIndent?: boolean
  canOutdent?: boolean
  onToggleCollapse: () => void
  onDragStart?: (rowId: string) => void
  onDragOver?: (rowId: string, position: 'before' | 'after' | 'child') => void
  onDragEnd?: (rowId: string, targetId: string, position: 'before' | 'after' | 'child') => void
  onIndent?: () => void
  onOutdent?: () => void
  children: ReactNode
  className?: string
}

export const PlanningSortableRow = memo(function PlanningSortableRow(props: SortableRowProps) {
  const {
    rowId,
    depth,
    isCollapsed,
    hasChildren,
    canDrag = false,
    canIndent = false,
    canOutdent = false,
    onToggleCollapse,
    onDragStart,
    onDragOver,
    onDragEnd,
    onIndent,
    onOutdent,
    children,
    className,
  } = props

  const rowRef = useRef<HTMLDivElement>(null)
  const dragHandleRef = useRef<HTMLDivElement>(null)

  const handleDragStart = useCallback((e: React.DragEvent) => {
    e.dataTransfer.setData('text/plain', rowId)
    e.dataTransfer.effectAllowed = 'move'
    onDragStart?.(rowId)
  }, [rowId, onDragStart])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const y = e.clientY - rect.top
    const height = rect.height
    // Top third = before, middle third = child (if depth >= dragged task depth), bottom third = after
    if (y < height * 0.25) {
      onDragOver?.(rowId, 'before')
    } else if (y > height * 0.75) {
      onDragOver?.(rowId, 'after')
    } else {
      onDragOver?.(rowId, 'child')
    }
  }, [rowId, onDragOver])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    const draggedId = e.dataTransfer.getData('text/plain')
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const y = e.clientY - rect.top
    const height = rect.height
    let position: 'before' | 'after' | 'child' = 'after'
    if (y < height * 0.25) position = 'before'
    else if (y > height * 0.75) position = 'after'
    else position = 'child'
    onDragEnd?.(draggedId, rowId, position)
  }, [rowId, onDragEnd])

  const indentPx = depth * 16 + 8

  return (
    <div
      ref={rowRef}
      data-row-id={rowId}
      data-depth={depth}
      draggable={canDrag}
      onDragStart={canDrag ? handleDragStart : undefined}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      className={cn(
        'group flex items-center border-b border-slate-100 transition-colors duration-100',
        'hover:bg-blue-50/40',
        className,
      )}
      style={{ paddingLeft: canDrag ? 4 : indentPx }}
    >
      {/* Drag handle (edit mode only, hover shows) */}
      {canDrag && (
        <div
          ref={dragHandleRef}
          className="mr-1 shrink-0 cursor-grab opacity-0 group-hover:opacity-100 active:cursor-grabbing"
          style={{ width: 20 }}
        >
          <GripVertical className="h-4 w-4 text-slate-300" />
        </div>
      )}

      {/* Collapse toggle */}
      {hasChildren ? (
        <Button unstyled
          type="button"
          className={cn(
            'mr-1 shrink-0 px-0.5 text-xs transition-transform duration-150',
            'text-slate-400 hover:text-slate-600',
            isCollapsed && 'rotate-0',
            !isCollapsed && 'rotate-90',
          )}
          onClick={onToggleCollapse}
          style={{ width: 16, height: 16 }}
        >
          ▸
        </Button>
      ) : (
        <span style={{ width: 16 }} className="mr-1 shrink-0" />
      )}

      {/* Row content */}
      <div className="flex-1 min-w-0" style={{ paddingLeft: canDrag ? indentPx - 24 : 0 }}>
        {children}
      </div>
    </div>
  )
})

export default PlanningSortableRow
