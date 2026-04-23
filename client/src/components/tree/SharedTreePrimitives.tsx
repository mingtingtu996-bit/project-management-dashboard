import { cn } from '@/lib/utils'

export type SharedTreeRowKind = 'structure' | 'leaf' | 'milestone' | 'edit'

export const SHARED_TREE_LAYOUT = {
  indentPerLevelPx: 20,
  maxIndentLevel: 5,
  firstColumnClass: 'w-[35%] max-w-[35%] min-w-[320px]',
  rowHeightClass: {
    structure: 'h-9',
    leaf: 'h-10',
    milestone: 'h-10',
    edit: 'h-12',
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
        'inline-block h-4 w-4 shrink-0 rotate-45 rounded-[2px] border border-current bg-transparent',
        className,
      )}
    />
  )
}
