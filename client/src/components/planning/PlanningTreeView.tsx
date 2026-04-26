import { useState, useMemo, type ReactNode } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Input } from '@/components/ui/input'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuCheckboxItem,
} from '@/components/ui/dropdown-menu'
import {
  SHARED_TREE_LAYOUT,
  TreeDiamondIcon,
  getTreeIndentPx,
  getTreeRowHeightClass,
  type SharedTreeRowKind,
} from '@/components/tree/SharedTreePrimitives'
import { cn } from '@/lib/utils'
import { Check, Circle, FileWarning, MoreHorizontal, Plus, Search, Filter, X, ArrowUpDown } from 'lucide-react'

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
  onEdit?: () => void
  onDelete?: () => void
  onMoveUp?: () => void
  onMoveDown?: () => void
  onPromote?: () => void
  onDemote?: () => void
  onAddSibling?: () => void
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

type SortMode = 'default' | 'name' | 'date' | 'progress'
type FacetMode = 'all' | 'structure' | 'leaf' | 'milestone'

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
  void description

  const [searchKeyword, setSearchKeyword] = useState('')
  const [filterMilestone, setFilterMilestone] = useState(false)
  const [filterCritical, setFilterCritical] = useState(false)
  const [filterMappingAttention, setFilterMappingAttention] = useState(false)
  const [sortMode, setSortMode] = useState<SortMode>('default')
  const [facetMode, setFacetMode] = useState<FacetMode>('all')

  const filteredAndSortedRows = useMemo(() => {
    let result = [...rows]

    if (searchKeyword.trim()) {
      const keyword = searchKeyword.trim().toLowerCase()
      result = result.filter((row) => row.title.toLowerCase().includes(keyword))
    }

    if (filterMilestone) {
      result = result.filter((row) => row.isMilestone)
    }

    if (filterCritical) {
      result = result.filter((row) => row.isCritical)
    }

    if (filterMappingAttention) {
      result = result.filter((row) => row.mappingStatus)
    }

    if (facetMode !== 'all') {
      result = result.filter((row) => {
        const rowKind: SharedTreeRowKind = row.rowType ?? (row.isMilestone ? 'milestone' : 'leaf')
        return rowKind === facetMode
      })
    }

    if (sortMode === 'name') {
      result.sort((a, b) => a.title.localeCompare(b.title))
    } else if (sortMode === 'date') {
      result.sort((a, b) => {
        const aDate = a.startDateLabel || ''
        const bDate = b.startDateLabel || ''
        return aDate.localeCompare(bDate)
      })
    } else if (sortMode === 'progress') {
      result.sort((a, b) => {
        const aProgress = Number.parseInt(a.progressLabel || '0', 10)
        const bProgress = Number.parseInt(b.progressLabel || '0', 10)
        return bProgress - aProgress
      })
    }

    return result
  }, [rows, searchKeyword, filterMilestone, filterCritical, filterMappingAttention, facetMode, sortMode])

  const activeFilterCount = [filterMilestone, filterCritical, filterMappingAttention, facetMode !== 'all'].filter(Boolean).length

  const handleClearAll = () => {
    setSearchKeyword('')
    setFilterMilestone(false)
    setFilterCritical(false)
    setFilterMappingAttention(false)
    setFacetMode('all')
    setSortMode('default')
  }

  const allSelected = filteredAndSortedRows.length > 0 && filteredAndSortedRows.every((row) => row.selected)
  const someSelected = filteredAndSortedRows.some((row) => row.selected)
  const renderValue = (value?: string | null) => value?.trim() || '—'

  return (
    <Card className="overflow-hidden border-slate-200">
      <CardHeader className="space-y-3 border-b border-slate-100 bg-slate-50/80">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-xl">{title}</CardTitle>
          </div>
          <Badge variant="outline" className="shrink-0">
            {selectedCount} 已选
          </Badge>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              type="text"
              placeholder="搜索任务..."
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
              className="h-9 pl-9 pr-8"
            />
            {searchKeyword && (
              <button
                type="button"
                onClick={() => setSearchKeyword('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {(['all', 'structure', 'leaf', 'milestone'] as const).map((facet) => (
              <Button
                key={facet}
                type="button"
                variant={facetMode === facet ? 'default' : 'outline'}
                size="sm"
                className="gap-2 rounded-full"
                onClick={() => setFacetMode(facet)}
              >
                {facet === 'all' ? '全部层级' : facet === 'structure' ? '结构层' : facet === 'leaf' ? '执行项' : '里程碑'}
              </Button>
            ))}
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2">
                <Filter className="h-4 w-4" />
                筛选
                {activeFilterCount > 0 && (
                  <Badge variant="secondary" className="ml-1 h-5 min-w-5 px-1">
                    {activeFilterCount}
                  </Badge>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-48">
              <DropdownMenuCheckboxItem checked={filterMilestone} onCheckedChange={setFilterMilestone}>
                里程碑
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem checked={filterCritical} onCheckedChange={setFilterCritical}>
                关键路径
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem checked={filterMappingAttention} onCheckedChange={setFilterMappingAttention}>
                映射待确认
              </DropdownMenuCheckboxItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2">
                <ArrowUpDown className="h-4 w-4" />
                排序
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-40">
              <DropdownMenuItem onClick={() => setSortMode('default')}>
                {sortMode === 'default' && <Check className="mr-2 h-4 w-4" />}
                默认顺序
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSortMode('name')}>
                {sortMode === 'name' && <Check className="mr-2 h-4 w-4" />}
                按名称
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSortMode('date')}>
                {sortMode === 'date' && <Check className="mr-2 h-4 w-4" />}
                按日期
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSortMode('progress')}>
                {sortMode === 'progress' && <Check className="mr-2 h-4 w-4" />}
                按进度
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {(searchKeyword || activeFilterCount > 0 || sortMode !== 'default') && (
            <div className="flex flex-wrap items-center gap-2">
              {searchKeyword ? <Badge variant="secondary">搜索：{searchKeyword}</Badge> : null}
              {filterMilestone ? <Badge variant="secondary">里程碑</Badge> : null}
              {filterCritical ? <Badge variant="secondary">关键路径</Badge> : null}
              {filterMappingAttention ? <Badge variant="secondary">映射待确认</Badge> : null}
              {facetMode !== 'all' ? (
                <Badge variant="outline">
                  {facetMode === 'structure' ? '结构层' : facetMode === 'leaf' ? '执行项' : '里程碑'}
                </Badge>
              ) : null}
              <button
                type="button"
                onClick={handleClearAll}
                className="text-sm text-slate-500 hover:text-slate-700 underline"
              >
                清除全部
              </button>
            </div>
          )}
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
          <span className="text-slate-400">·</span>
          <span>当前视图 {filteredAndSortedRows.length} 项</span>
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
              {filteredAndSortedRows.map((row) => {
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
                    {!readOnly && rowKind !== 'structure' && (
                      <div className="flex items-center gap-1">
                        {row.onAddSibling ? (
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 shrink-0"
                            onClick={row.onAddSibling}
                            aria-label={`add-sibling-${row.id}`}
                            data-testid="planning-row-add-sibling"
                          >
                            <Plus className="h-4 w-4" />
                          </Button>
                        ) : null}
                        {(row.onEdit || row.onDelete || row.onMoveUp || row.onMoveDown || row.onPromote || row.onDemote || row.onAddSibling) ? (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button type="button" size="icon" variant="ghost" className="h-8 w-8 shrink-0">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              {row.onEdit && <DropdownMenuItem onClick={row.onEdit}>编辑</DropdownMenuItem>}
                              {row.onDelete && <DropdownMenuItem onClick={row.onDelete}>删除</DropdownMenuItem>}
                              {row.onPromote && <DropdownMenuItem onClick={row.onPromote}>升级层级</DropdownMenuItem>}
                              {row.onDemote && <DropdownMenuItem onClick={row.onDemote}>降级层级</DropdownMenuItem>}
                              {row.onMoveUp && <DropdownMenuItem onClick={row.onMoveUp}>上移</DropdownMenuItem>}
                              {row.onMoveDown && <DropdownMenuItem onClick={row.onMoveDown}>下移</DropdownMenuItem>}
                              {row.onAddSibling && <DropdownMenuItem onClick={row.onAddSibling}>添加同级</DropdownMenuItem>}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        ) : null}
                      </div>
                    )}
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
