// v1.4.7.1: Row-card hybrid renderer for shared planning tree
// Visual is a card, behavior is a table

import { cn } from '@/lib/utils'
import { getWbsNodeTypeLabel } from '@/lib/wbsLabels'
import { memo, type ReactNode } from 'react'
import { Badge } from '@/components/ui/badge'
import { DurationBasisBadge } from '@/components/planning/DurationBasisBadge'
import { Button } from '@/components/ui/button'

export type PlanningViewMode = 'list' | 'card' | 'detail'
export type PlanningRowMode = 'read' | 'edit'

export interface PlanningChipItem {
  key: string
  label: string
  count?: number
  severity?: 'red' | 'amber' | 'blue' | 'green' | 'slate'
  priority: number // 1=highest
  onClick?: () => void
}

export interface PlanningRowCardProps {
  id: string
  sequenceLabel?: string
  title: string
  subtitle?: string
  wbsCode?: string
  wbsNodeType?: string | null
  depth: number
  isMilestone?: boolean
  isCritical?: boolean
  hasChildren?: boolean
  collapsed?: boolean
  selected?: boolean
  focused?: boolean
  dirty?: boolean
  rowMode: PlanningRowMode
  viewMode: PlanningViewMode
  // Data band
  startDateLabel?: string
  endDateLabel?: string
  durationLabel?: string
  progressLabel?: string
  progressValue?: number
  assigneeLabel?: string
  unitLabel?: string
  // Chips
  chips?: PlanningChipItem[]
  maxVisibleChips?: number
  // Events
  onToggleCollapse?: () => void
  onSelect?: () => void
  onOpenDetail?: () => void
  onEdit?: () => void
  onRowMenu?: () => void
  onAddChild?: () => void
  // Render props for editable cells
  titleCell?: ReactNode
  startCell?: ReactNode
  endCell?: ReactNode
  progressCell?: ReactNode
  assigneeCell?: ReactNode
  unitCell?: ReactNode
  // v1.4.7.1: End links (§7.6 + §7.8)
  showAddBlockage?: boolean
  onAddBlockage?: () => void
  showAddCondition?: boolean
  onAddCondition?: () => void
  predecessorCount?: number
  onOpenPredecessors?: () => void
  // Dirty state
  dirtyFields?: Set<string>
  // Extra
  className?: string
}

const INDENT_PX = { list: 16, card: 20, detail: 24 } as const
const ROW_HEIGHT = { list: 'h-9', card: 'h-14', detail: 'h-[88px]' } as const
const TITLE_SIZE = { list: 'text-sm font-medium', card: 'text-sm font-medium', detail: 'text-sm font-semibold' } as const
const DATA_SIZE = { list: 'text-xs', card: 'text-xs', detail: 'text-sm' } as const
const CHIP_SIZE = { list: 'text-xs', card: 'text-xs', detail: 'text-xs' } as const

// v1.4.7.1 §7.11: WBS 5-type visual differentiation
const WBS_TYPE_STYLES: Record<string, { titleClass: string; bgClass: string; icon: string }> = {
  division:    { titleClass: 'text-sm font-semibold', bgClass: 'bg-slate-100', icon: '▾' },
  sub_division:{ titleClass: 'text-sm font-semibold', bgClass: 'bg-slate-50',  icon: '▾' },
  item_work:   { titleClass: 'text-sm font-medium',   bgClass: '',             icon: '' },
  process:     { titleClass: 'text-sm font-normal',   bgClass: '',             icon: '◆' },
  activity_step:{ titleClass: 'text-xs font-normal',      bgClass: '',             icon: '·' },
}

function getWbsStyle(wbsNodeType?: string | null) {
  return WBS_TYPE_STYLES[wbsNodeType ?? ''] ?? WBS_TYPE_STYLES.process
}

export const PlanningRowCard = memo(function PlanningRowCard(props: PlanningRowCardProps) {
  const {
    id,
    sequenceLabel = '',
    title,
    wbsNodeType,
    depth = 0,
    isMilestone,
    isCritical,
    hasChildren,
    collapsed,
    selected,
    focused,
    dirty,
    viewMode = 'card',
    startDateLabel,
    endDateLabel,
    durationLabel,
    progressLabel,
    progressValue,
    assigneeLabel,
    unitLabel,
    chips = [],
    maxVisibleChips = viewMode === 'list' ? 1 : viewMode === 'card' ? 3 : 5,
    onToggleCollapse,
    onSelect,
    onOpenDetail,
    onRowMenu,
    className,
  } = props

  const indentPx = INDENT_PX[viewMode]
  const rowHeight = ROW_HEIGHT[viewMode]
  const titleSize = TITLE_SIZE[viewMode]
  const dataSize = DATA_SIZE[viewMode]
  const chipSize = CHIP_SIZE[viewMode]

  // Sort chips by priority (1=highest) and slice to max visible
  const sortedChips = [...chips].sort((a, b) => a.priority - b.priority)
  const visibleChips = sortedChips.slice(0, maxVisibleChips)
  const hiddenCount = sortedChips.length - visibleChips.length

  const wbsStyle = getWbsStyle(wbsNodeType)

  const severityBorder = (severity?: string) => {
    switch (severity) {
      case 'red': return 'border-red-200 bg-red-50 text-red-700'
      case 'amber': return 'border-amber-200 bg-amber-50 text-amber-700'
      case 'blue': return 'border-blue-200 bg-blue-50 text-blue-700'
      case 'green': return 'border-emerald-200 bg-emerald-50 text-emerald-700'
      default: return 'border-slate-200 bg-slate-50 text-slate-600'
    }
  }

  const wbsLabel = wbsNodeType ? getWbsNodeTypeLabel(wbsNodeType) : ''
  const isSummary = hasChildren
  const planDurationBadge = <DurationBasisBadge basis="plan" compact variant="outline" className="bg-white/70" />

  if (viewMode === 'list') {
    // List view: single row, close to Excel
    return (
      <div
        data-row-id={id}
        data-view="list"
        className={cn(
          'flex items-center border-b border-slate-100 transition-colors duration-100',
          rowHeight,
          selected && 'bg-blue-100/60',
          focused && 'bg-blue-50 border-l-2 border-l-blue-500',
          dirty && 'border-l-2 border-l-amber-400',
          isMilestone && 'bg-amber-50/30',
          'hover:bg-blue-50/40',
          className,
        )}
        onClick={onSelect}
        onDoubleClick={onOpenDetail}
      >
        {/* Gutter: sequence + fold + +/- */}
        <div className="flex h-full shrink-0 items-center gap-1 px-1" style={{ width: 40 + depth * indentPx }}>
          <span className="text-xs tabular-nums text-slate-400">{sequenceLabel}</span>
          {hasChildren && (
            <Button unstyled type="button" className="p-0.5 text-slate-400 hover:text-slate-600" onClick={(e) => { e.stopPropagation(); onToggleCollapse?.() }}>
              {collapsed ? '▸' : '▾'}
            </Button>
          )}
        </div>

        {/* Title column */}
        <div className="flex min-w-[200px] flex-1 items-center gap-1.5 truncate px-2">
          {isCritical && <span className="shrink-0 text-xs font-bold text-red-500">━</span>}
          {isMilestone && <span className="shrink-0 text-amber-500">★</span>}
          <span className={cn('truncate', titleSize)}>{title}</span>
          {wbsLabel && <Badge variant="outline" className="ml-1 shrink-0 px-1 py-0 text-xs">{wbsLabel}</Badge>}
        </div>

        {/* Data columns - compact single line */}
        <div className="flex shrink-0 items-center gap-0">
          <span className={cn('w-[5.25rem] px-2 text-right tabular-nums', dataSize, 'text-slate-600')}>{startDateLabel || '—'}</span>
          <span className={cn('w-[5.25rem] px-2 text-right tabular-nums', dataSize, 'text-slate-600')}>{endDateLabel || '—'}</span>
          <span className={cn('flex w-[5.5rem] items-center justify-end gap-1 px-2 text-right tabular-nums', dataSize, 'text-slate-500')}>
            {durationLabel ? (
              <>
                {planDurationBadge}
                <span className="truncate">{durationLabel}</span>
              </>
            ) : '—'}
          </span>
          {progressLabel && (
            <span className={cn('w-[4.5rem] px-2 text-right tabular-nums', dataSize, 'text-slate-700')}>
              {progressLabel}
            </span>
          )}
          {assigneeLabel && (
            <span className={cn('w-[5.5rem] truncate px-2', dataSize, 'text-slate-600')}>{assigneeLabel || '—'}</span>
          )}
          {unitLabel && (
            <span className={cn('w-[6rem] truncate px-2', dataSize, 'text-slate-500')}>{unitLabel || '—'}</span>
          )}
        </div>

        {/* Chip summary: single chip + count */}
        {visibleChips.length > 0 && (
          <div className="flex shrink-0 items-center gap-1 px-2">
            <Badge variant="outline" className={cn('px-1.5 py-0', chipSize, severityBorder(visibleChips[0].severity))}>
              {visibleChips[0].count ? `${visibleChips[0].label} ${visibleChips[0].count}` : visibleChips[0].label}
            </Badge>
            {hiddenCount > 0 && (
              <span className="text-xs text-slate-400">+{hiddenCount}</span>
            )}
          </div>
        )}

        {/* Row menu trigger */}
        <Button unstyled type="button" className="shrink-0 px-1.5 text-slate-300 hover:text-slate-500" onClick={(e) => { e.stopPropagation(); onRowMenu?.() }}>
          …
        </Button>
      </div>
    )
  }

  // Card / Detail view: multi-band card layout
  return (
    <div
      data-row-id={id}
      data-view={viewMode}
      className={cn(
        'border-b border-slate-100 transition-colors duration-100',
        selected && 'bg-blue-100/60',
        focused && 'bg-blue-50 border-l-2 border-l-blue-500',
        dirty && 'border-l-2 border-l-amber-400',
        isMilestone && 'bg-amber-50/30',
        isSummary && 'bg-slate-50/80',
        wbsStyle.bgClass,
        'hover:bg-blue-50/40',
        className,
      )}
      style={{ paddingLeft: depth * indentPx + 12 }}
      onClick={onSelect}
      onDoubleClick={onOpenDetail}
    >
      <div className={cn('flex flex-col justify-center px-3 py-2', rowHeight === 'h-[88px]' ? 'gap-2' : 'gap-1')}>
        {/* Primary band: fold icon + title + badges + critical/milestone markers */}
        <div className="flex items-center gap-1.5">
          {hasChildren && (
            <Button unstyled type="button" className="shrink-0 p-0.5 text-slate-400 hover:text-slate-600" onClick={(e) => { e.stopPropagation(); onToggleCollapse?.() }}>
              {collapsed ? '▸' : '▾'}
            </Button>
          )}
          <span className="text-xs tabular-nums text-slate-400">{sequenceLabel}</span>
          {isCritical && <span className="shrink-0 text-xs font-bold text-red-500">━</span>}
          {isMilestone && <span className="shrink-0 text-amber-500">★</span>}
          {isCritical && !isMilestone && <span className="shrink-0 text-blue-500 text-xs">⬥</span>}
          {wbsStyle.icon && !isMilestone && <span className="shrink-0 text-slate-400 text-xs">{wbsStyle.icon}</span>}
          <span className={cn('truncate', wbsStyle.titleClass || titleSize, 'text-slate-900')}>{title}</span>
          {wbsLabel && <Badge variant="outline" className="ml-1 shrink-0 px-1 py-0 text-xs">{wbsLabel}</Badge>}
          {/* Spacer */}
          <div className="flex-1" />
          {/* Row menu */}
          <Button unstyled type="button" className="shrink-0 px-1 text-slate-300 hover:text-slate-500" onClick={(e) => { e.stopPropagation(); onRowMenu?.() }}>
            …
          </Button>
        </div>

        {/* Data band: dates + duration + progress + assignee + unit */}
        <div className={cn('flex flex-wrap items-center gap-x-4 gap-y-0.5', dataSize, 'text-slate-600')}>
          {startDateLabel != null && (
            <span className="tabular-nums">{startDateLabel || '—'}</span>
          )}
          {startDateLabel != null && endDateLabel != null && <span className="text-slate-300">—</span>}
          {endDateLabel != null && (
            <span className="tabular-nums">{endDateLabel || '—'}</span>
          )}
          {durationLabel && (
            <span className="inline-flex items-center gap-1 tabular-nums text-slate-500">
              {planDurationBadge}
              <span>{durationLabel}</span>
            </span>
          )}
          {progressLabel != null && (
            <span className="inline-flex items-center gap-1 tabular-nums text-slate-700">
              <span className="inline-block h-1.5 rounded-full bg-slate-200" style={{ width: 48 }}>
                <span className="inline-block h-full rounded-full bg-blue-600" style={{ width: `${Math.min(100, progressValue ?? 0)}%` }} />
              </span>
              {progressLabel}
            </span>
          )}
          {assigneeLabel && (
            <span className="tabular-nums">{assigneeLabel}</span>
          )}
          {unitLabel && (
            <span className="text-slate-500">{unitLabel}</span>
          )}
        </div>

        {/* Chip band: adaptive chip rendering */}
        {visibleChips.length > 0 && (
          <div className={cn('flex flex-wrap items-center gap-1', chipSize)}>
            {visibleChips.map((chip) => (
              <Badge
                key={chip.key}
                variant="outline"
                className={cn('cursor-pointer px-1.5 py-0 transition-opacity hover:opacity-80', severityBorder(chip.severity))}
                onClick={(e) => { e.stopPropagation(); chip.onClick?.() }}
              >
                {chip.count ? `${chip.label} ${chip.count}` : chip.label}
              </Badge>
            ))}
            {hiddenCount > 0 && (
              <span className="text-slate-400">+{hiddenCount}</span>
            )}
          </div>
        )}
        {/* v1.4.7.1: End links (§7.6) for business actions */}
        {(props.showAddBlockage || props.showAddCondition || props.predecessorCount != null) && (
          <div className={cn('flex items-center gap-2', chipSize, 'text-slate-400')}>
            {props.showAddBlockage && (
              <Button unstyled type="button" className="hover:text-slate-600 transition-colors" onClick={(e) => { e.stopPropagation(); props.onAddBlockage?.() }}>
                [+ 登记阻碍]
              </Button>
            )}
            {props.showAddCondition && (
              <Button unstyled type="button" className="hover:text-slate-600 transition-colors" onClick={(e) => { e.stopPropagation(); props.onAddCondition?.() }}>
                [+ 新增条件]
              </Button>
            )}
            {props.predecessorCount != null && props.predecessorCount > 0 && (
              <Button unstyled type="button" className={cn('hover:opacity-80 transition-colors', props.isCritical ? 'text-red-500 font-medium' : 'text-slate-500')} onClick={(e) => { e.stopPropagation(); props.onOpenPredecessors?.() }}>
                ↩ {props.predecessorCount}
              </Button>
            )}
            {props.predecessorCount === 0 && (
              <Button unstyled type="button" className="text-slate-300 hover:text-slate-500 transition-colors" onClick={(e) => { e.stopPropagation(); props.onOpenPredecessors?.() }}>
                ↩ 添加
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  )
})

export default PlanningRowCard
