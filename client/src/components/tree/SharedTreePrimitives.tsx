import { cn } from '@/lib/utils'

export type SharedTreeRowKind = 'structure' | 'leaf' | 'milestone' | 'edit'

export const SHARED_TREE_LAYOUT = {
  indentPerLevelPx: 20,
  maxIndentLevel: 5,
  firstColumnClass: 'w-[42%] max-w-[42%] min-w-96 overflow-hidden',
  rowHeightClass: {
    structure: 'min-h-12 py-2',
    leaf: 'min-h-12 py-2',
    milestone: 'min-h-12 py-2',
    edit: 'min-h-16 py-2',
  } as const,
}

export function getTreeIndentPx(depth: number, baseDepth = 0) {
  const normalizedDepth = Math.max(0, depth - baseDepth)
  const clampedDepth = Math.min(normalizedDepth, SHARED_TREE_LAYOUT.maxIndentLevel)
  return clampedDepth * SHARED_TREE_LAYOUT.indentPerLevelPx
}

export function getTreeRowHeightClass(kind: SharedTreeRowKind) {
  return SHARED_TREE_LAYOUT.rowHeightClass[kind]
}

export function TreeDiamondIcon({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'inline-block h-4 w-4 shrink-0 rotate-45 rounded-sm border border-current bg-transparent',
        className,
      )}
    />
  )
}
