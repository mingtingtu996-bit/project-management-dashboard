import { cn } from '@/lib/utils'

export type SharedTreeRowKind = 'structure' | 'leaf' | 'milestone' | 'edit'
export type SharedTreeViewMode = 'list' | 'card' | 'detail'
export type SharedTreeDensity = 'compact' | 'comfortable' | 'edit' | 'detail'

export const SHARED_TREE_DENSITY_TOKENS = {
  compact: {
    rowClass: 'min-h-9 py-1',
    headerClass: 'py-2',
    toolbarGapClass: 'space-y-2',
  },
  comfortable: {
    rowClass: 'min-h-12 py-2',
    headerClass: 'py-2.5',
    toolbarGapClass: 'space-y-2',
  },
  edit: {
    rowClass: 'min-h-16 py-2',
    headerClass: 'py-3',
    toolbarGapClass: 'space-y-3',
  },
  detail: {
    rowClass: 'min-h-[88px] py-3',
    headerClass: 'py-3',
    toolbarGapClass: 'space-y-3',
  },
} as const

export const SHARED_TREE_LAYOUT = {
  indentPerLevelPx: 28,
  maxIndentLevel: 4,
  firstColumnClass: 'w-[42%] max-w-[42%] min-w-96 overflow-hidden',
  rowHeightClass: {
    structure: SHARED_TREE_DENSITY_TOKENS.comfortable.rowClass,
    leaf: SHARED_TREE_DENSITY_TOKENS.comfortable.rowClass,
    milestone: SHARED_TREE_DENSITY_TOKENS.comfortable.rowClass,
    edit: SHARED_TREE_DENSITY_TOKENS.edit.rowClass,
  } as const,
  viewModeRowHeight: {
    list: SHARED_TREE_DENSITY_TOKENS.compact.rowClass,
    card: 'min-h-14 py-2',
    detail: SHARED_TREE_DENSITY_TOKENS.detail.rowClass,
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

export function getTreeViewModeRowHeight(viewMode: SharedTreeViewMode, isEditing?: boolean) {
  if (isEditing) return SHARED_TREE_LAYOUT.rowHeightClass.edit
  return SHARED_TREE_LAYOUT.viewModeRowHeight[viewMode]
}

export function getTreeDensityRowClass(density: SharedTreeDensity, isEditing?: boolean) {
  if (isEditing) return SHARED_TREE_DENSITY_TOKENS.edit.rowClass
  return SHARED_TREE_DENSITY_TOKENS[density].rowClass
}

export function getTreeBranchPrefix(depth: number, baseDepth = 1) {
  return Math.max(0, depth - baseDepth) > 0 ? '├' : ''
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
