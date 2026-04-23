import type { ReactNode } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  SHARED_TREE_LAYOUT,
  TreeDiamondIcon,
  getTreeIndentPx,
  getTreeRowHeightClass,
  type SharedTreeRowKind,
} from '@/components/tree/SharedTreePrimitives'
import { cn } from '@/lib/utils'
import { Check, Circle, FileWarning, MoreHorizontal } from 'lucide-react'

export interface PlanningTreeRow {
  id: string
  title: string
  subtitle?: string
  depth: number
  rowType?: Extract<SharedTreeRowKind, 'structure' | 'leaf' | 'milestone'>
  statusLabel?: string
  isMilestone?: boolean
  isCritical?: boolean
  selected?: boolean
  locked?: boolean
  startDateLabel?: string
  endDateLabel?: string
  progressLabel?: string
  mappingStatus?: string | null
  titleCell?: ReactNode
  startCell?: ReactNode
  endCell?: ReactNode
  progressCell?: ReactNode
  extra?: ReactNode
}

interface PlanningTreeViewProps {
  title: string
  description?: string
  rows: PlanningTreeRow[]
  selectedCount?: number
  onToggleRow?: (id: string) => void
  onToggleAll?: (checked: boolean) => void
  emptyLabel?: string
  readOnly?: boolean
}

export function PlanningTreeView({
  title,
  description,
  rows,
  selectedCount = 0,
  onToggleRow,
  onToggleAll,
  emptyLabel = '暂无规划条目',
  readOnly = false,
}: PlanningTreeViewProps) {
  const allSelected = rows.length > 0 && rows.every((row) => row.selected)
  const someSelected = rows.some((row) => row.selected)
  const renderValue = (value?: string | null) => value?.trim() || '—'

  return (
    <Card className="overflow-hidden border-slate-200">
      <CardHeader className="space-y-2 border-b border-slate-100 bg-slate-50/80">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-xl">{title}</CardTitle>
            {description ? <CardDescription className="mt-1">{description}</CardDescription> : null}
          </div>
          <Badge variant="outline" className="shrink-0">
            {selectedCount} 已选
          </Badge>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500">
          {readOnly ? (
            <Badge variant="outline" className="border-slate-200 bg-white text-slate-500">
              只读查看态
            </Badge>
          ) : (
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
              onClick={() => onToggleAll?.(!allSelected)}
            >
              {allSelected ? <Check className="h-3.5 w-3.5" /> : someSelected ? <Circle className="h-3.5 w-3.5" /> : <Circle className="h-3.5 w-3.5" />}
              {allSelected ? '取消全选' : '全选当前视图'}
            </button>
          )}
          <span>树表行高、缩进和关键节点锚点已按统一规范对齐</span>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        {rows.length === 0 ? (
          <div className="flex min-h-[280px] items-center justify-center px-6 py-12 text-sm text-slate-500">
            {emptyLabel}
          </div>
        ) : (
          <ScrollArea className="max-h-[560px]">
            <div className="min-w-[980px]">
              <div className="grid grid-cols-[40px_minmax(280px,35%)_minmax(120px,15%)_minmax(120px,15%)_minmax(140px,15%)_minmax(180px,20%)] items-center gap-3 border-b border-slate-100 bg-slate-50 px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                <div className="text-center">选</div>
                <div>名称</div>
                <div>开始</div>
                <div>结束</div>
                <div>目标 / 进度</div>
                <div>标记</div>
              </div>

              <div className="divide-y divide-slate-100">
              {rows.map((row) => {
                const rowKind: SharedTreeRowKind =
                  row.rowType ?? (row.isMilestone ? 'milestone' : 'leaf')

                return (
                  <div
                    key={row.id}
                    className={cn(
                      'group grid grid-cols-[40px_minmax(280px,35%)_minmax(120px,15%)_minmax(120px,15%)_minmax(140px,15%)_minmax(180px,20%)] items-center gap-3 px-4 transition-colors hover:bg-slate-50',
                      getTreeRowHeightClass(rowKind),
                      row.selected && 'bg-cyan-50/60',
                      row.isCritical && rowKind !== 'milestone' && 'border-l-2 border-l-sky-400',
                      rowKind === 'milestone' && 'border-l-2 border-l-amber-400 bg-amber-50/30',
                    )}
                  >
                  <div className="flex w-7 items-center justify-center">
                    <button
                      type="button"
                      aria-label={`toggle-${row.id}`}
                      data-testid="planning-selection-checkbox"
                      onClick={() => {
                        if (readOnly) return
                        onToggleRow?.(row.id)
                      }}
                      disabled={readOnly}
                      className={cn(
                        'flex h-5 w-5 items-center justify-center rounded border transition',
                        row.selected ? 'border-cyan-600 bg-cyan-600 text-white' : 'border-slate-300 bg-white text-transparent',
                        readOnly && 'cursor-not-allowed opacity-70',
                      )}
                    >
                      <Check className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  <div
                    className={cn('min-w-0 shrink-0', SHARED_TREE_LAYOUT.firstColumnClass)}
                    style={{ paddingLeft: `${getTreeIndentPx(row.depth, 1)}px` }}
                  >
                    {row.titleCell ? (
                      row.titleCell
                    ) : (
                      <div className="flex items-center gap-2">
                        {rowKind === 'milestone' ? (
                          <TreeDiamondIcon className="text-amber-500" />
                        ) : row.isCritical ? (
                          <FileWarning className="h-4 w-4 text-rose-500" />
                        ) : (
                          <Circle className="h-4 w-4 text-slate-300" />
                        )}
                        <div className="min-w-0 leading-tight">
                          <div className="truncate text-sm font-medium text-slate-900">{row.title}</div>
                          {row.subtitle ? <div className="truncate text-xs text-slate-500">{row.subtitle}</div> : null}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="truncate text-sm text-slate-700">{row.startCell ?? renderValue(row.startDateLabel)}</div>

                  <div className="truncate text-sm text-slate-700">{row.endCell ?? renderValue(row.endDateLabel)}</div>

                  <div className="truncate text-sm text-slate-700">{row.progressCell ?? renderValue(row.progressLabel)}</div>

                  <div className="flex min-w-0 items-center justify-end gap-2">
                    <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
                      {row.statusLabel ? <Badge variant="secondary">{row.statusLabel}</Badge> : null}
                      {row.mappingStatus ? (
                        <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">
                          {row.mappingStatus}
                        </Badge>
                      ) : null}
                      {row.locked ? (
                        <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">
                          锁定
                        </Badge>
                      ) : null}
                      {row.extra}
                    </div>
                    <Button type="button" size="icon" variant="ghost" className="h-8 w-8 shrink-0" disabled={readOnly}>
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                )
              })}
              </div>
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  )
}
