import { useState, useMemo, type ReactNode } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuCheckboxItem,
} from '@/components/ui/dropdown-menu'
import {
  TreeDiamondIcon,
  getTreeIndentPx,
  getTreeRowHeightClass,
  type SharedTreeRowKind,
} from '@/components/tree/SharedTreePrimitives'
import { cn } from '@/lib/utils'
import { ArrowUpDown, Check, Circle, Columns3, FileWarning, Filter, MoreHorizontal, Search, X } from 'lucide-react'

export interface PlanningTreeRow {
  id: string
  title: string
  subtitle?: string
  depth: number
  sequenceLabel?: string
  wbsCode?: string
  rowType?: Extract<SharedTreeRowKind, 'structure' | 'leaf' | 'milestone'>
  statusLabel?: string
  isMilestone?: boolean
  isCritical?: boolean
  selected?: boolean
  locked?: boolean
  startDateLabel?: string
  endDateLabel?: string
  durationLabel?: string
  progressLabel?: string
  assigneeLabel?: string
  parentLabel?: string
  notesLabel?: string
  mappingStatus?: string | null
  titleCell?: ReactNode
  startCell?: ReactNode
  endCell?: ReactNode
  progressCell?: ReactNode
  extra?: ReactNode
  onOpenDetail?: () => void
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
type ExtraColumnKey =
  | 'progress'
  | 'type'
  | 'mapping'
  | 'critical'
  | 'milestone'
  | 'parent'
  | 'level'
  | 'lock'
  | 'notes'
  | 'actions'

const BASE_COLUMNS = [
  { key: 'sequence', label: '序号', width: '4rem', className: 'text-center tabular-nums' },
  { key: 'wbs', label: 'WBS', width: '6rem' },
  { key: 'title', label: '任务名', width: '24rem' },
  { key: 'start', label: '开始', width: '10rem', className: 'text-right tabular-nums' },
  { key: 'end', label: '结束', width: '10rem', className: 'text-right tabular-nums' },
  { key: 'duration', label: '工期', width: '6rem', className: 'text-right tabular-nums' },
  { key: 'status', label: '状态', width: '10rem' },
  { key: 'assignee', label: '责任人', width: '10rem' },
] as const
const EXTRA_COLUMNS: Array<{ key: ExtraColumnKey; label: string; width: string }> = [
  { key: 'progress', label: '目标进度', width: '5.625rem' },
  { key: 'type', label: '类型', width: '6.25rem' },
  { key: 'mapping', label: '映射', width: '6.875rem' },
  { key: 'critical', label: '关键路径', width: '6.875rem' },
  { key: 'milestone', label: '里程碑', width: '5.625rem' },
  { key: 'parent', label: '父级', width: '8.75rem' },
  { key: 'level', label: '层级', width: '5rem' },
  { key: 'lock', label: '锁定', width: '5.625rem' },
  { key: 'notes', label: '备注', width: '11.25rem' },
  { key: 'actions', label: '操作', width: '8rem' },
]

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
  const [extraColumns, setExtraColumns] = useState<ExtraColumnKey[]>([])

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
  const visibleExtraColumns = EXTRA_COLUMNS.filter((column) => extraColumns.includes(column.key))
  const gridColumns = [...BASE_COLUMNS, ...visibleExtraColumns]
  const gridTemplateColumns = gridColumns.map((column) => column.width).join(' ')
  const gridMinWidth = `calc(${gridColumns.map((column) => column.width).join(' + ')})`
  const extraColumnLabels = Object.fromEntries(EXTRA_COLUMNS.map((column) => [column.key, column.label])) as Record<
    ExtraColumnKey,
    string
  >

  const toggleExtraColumn = (key: ExtraColumnKey, checked: boolean) => {
    setExtraColumns((current) => {
      if (checked) return current.includes(key) ? current : [...current, key]
      return current.filter((item) => item !== key)
    })
  }

  const renderRowActions = (row: PlanningTreeRow) => {
    if (
      readOnly ||
      (!row.onOpenDetail &&
        !row.onEdit &&
        !row.onDelete &&
        !row.onMoveUp &&
        !row.onMoveDown &&
        !row.onPromote &&
        !row.onDemote &&
        !row.onAddSibling)
    ) {
      return null
    }

    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" size="icon" variant="ghost" aria-label="打开计划任务操作菜单" className="h-8 w-8 shrink-0">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {row.onOpenDetail ? <DropdownMenuItem onClick={row.onOpenDetail}>查看详情</DropdownMenuItem> : null}
          {row.onEdit ? <DropdownMenuItem onClick={row.onEdit}>编辑</DropdownMenuItem> : null}
          {row.onAddSibling ? <DropdownMenuItem onClick={row.onAddSibling}>添加同级</DropdownMenuItem> : null}
          {row.onPromote ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuItem onClick={row.onPromote}>升级</DropdownMenuItem>
              </TooltipTrigger>
              <TooltipContent>将此任务提升一个层级</TooltipContent>
            </Tooltip>
          ) : null}
          {row.onDemote ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuItem onClick={row.onDemote}>降级</DropdownMenuItem>
              </TooltipTrigger>
              <TooltipContent>将此任务变为上方任务的子任务</TooltipContent>
            </Tooltip>
          ) : null}
          {row.onMoveUp ? <DropdownMenuItem onClick={row.onMoveUp}>上移</DropdownMenuItem> : null}
          {row.onMoveDown ? <DropdownMenuItem onClick={row.onMoveDown}>下移</DropdownMenuItem> : null}
          {row.onDelete ? <DropdownMenuItem onClick={row.onDelete}>删除</DropdownMenuItem> : null}
        </DropdownMenuContent>
      </DropdownMenu>
    )
  }

  const renderExtraColumnValue = (row: PlanningTreeRow, key: ExtraColumnKey) => {
    const rowKind: SharedTreeRowKind = row.rowType ?? (row.isMilestone ? 'milestone' : 'leaf')

    if (key === 'progress') {
      return <div className="truncate text-right text-sm text-slate-700 tabular-nums">{row.progressCell ?? renderValue(row.progressLabel)}</div>
    }
    if (key === 'type') {
      return <Badge variant="outline">{rowKind === 'structure' ? '结构层' : rowKind === 'milestone' ? '里程碑' : '执行项'}</Badge>
    }
    if (key === 'mapping') {
      return row.mappingStatus ? (
        <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">
          {row.mappingStatus}
        </Badge>
      ) : (
        <span className="text-sm text-slate-500">已映射</span>
      )
    }
    if (key === 'critical') {
      return <span className={cn('text-sm', row.isCritical ? 'font-medium text-rose-600' : 'text-slate-500')}>{row.isCritical ? '关键路径' : '普通'}</span>
    }
    if (key === 'milestone') {
      return <span className={cn('text-sm', row.isMilestone ? 'font-medium text-amber-700' : 'text-slate-500')}>{row.isMilestone ? '是' : '否'}</span>
    }
    if (key === 'parent') {
      return <span className="truncate text-sm text-slate-600">{renderValue(row.parentLabel)}</span>
    }
    if (key === 'level') {
      return <span className="text-sm text-slate-600 tabular-nums">L{row.depth}</span>
    }
    if (key === 'lock') {
      return <span className="text-sm text-slate-600">{row.locked ? '锁定' : readOnly ? '只读' : '可编辑'}</span>
    }
    if (key === 'notes') {
      return <span className="truncate text-sm text-slate-600">{renderValue(row.notesLabel ?? row.subtitle)}</span>
    }
    return <div className="flex justify-end">{renderRowActions(row)}</div>
  }

  return (
    <Card className="overflow-hidden border-slate-200">
      <CardHeader className="space-y-3 bg-slate-50/80">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-xl">{title}</CardTitle>
          </div>
          <Badge variant="outline" className="shrink-0">
            {selectedCount} 已选
          </Badge>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-52">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <Input
              type="text"
              aria-label="搜索计划任务"
              placeholder="搜索任务..."
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
              className="h-9 pl-9 pr-8"
            />
            {searchKeyword && (
              <Button variant="ghost"
                type="button"
                aria-label="清空计划任务搜索"
                onClick={() => setSearchKeyword('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-600"
              >
                <X className="h-4 w-4" />
              </Button>
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

          <Popover>
            <PopoverTrigger asChild>
              <Button type="button" variant="outline" size="sm" className="gap-2" data-testid="planning-more-columns-trigger">
                <Columns3 className="h-4 w-4" />
                更多列
                <Badge variant="secondary" className="ml-1 h-5 min-w-5 px-1">
                  {extraColumns.length}/10
                </Badge>
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" side="bottom" className="w-64 p-3">
              <div className="space-y-3" data-testid="planning-more-columns-popover">
                <div className="space-y-1">
                  <div className="text-sm font-medium text-slate-900">更多列</div>
                  <div className="text-xs text-slate-500">默认保留 8 列，其余字段按需打开。</div>
                </div>
                <div className="grid gap-2">
                  {EXTRA_COLUMNS.map((column) => (
                    <label key={column.key} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-slate-700 hover:bg-slate-50">
                      <input
                        type="checkbox"
                        checked={extraColumns.includes(column.key)}
                        onChange={(event) => toggleExtraColumn(column.key, event.target.checked)}
                        className="h-4 w-4 rounded border-slate-300 text-blue-600"
                      />
                      {column.label}
                    </label>
                  ))}
                </div>
              </div>
            </PopoverContent>
          </Popover>

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
              <Button variant="ghost"
                type="button"
                onClick={handleClearAll}
                className="text-sm text-slate-500 hover:text-slate-700 underline"
              >
                清除全部
              </Button>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 text-xs text-slate-500">
          {readOnly ? (
            <Badge variant="outline" className="border-slate-200 bg-white text-slate-500">
              只读查看态
            </Badge>
          ) : (
            <Button variant="ghost"
              type="button"
              className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
              onClick={() => onToggleAll?.(!allSelected)}
            >
              {allSelected ? <Check className="h-3.5 w-3.5" /> : someSelected ? <Circle className="h-3.5 w-3.5" /> : <Circle className="h-3.5 w-3.5" />}
              {allSelected ? '取消全选' : '全选当前视图'}
            </Button>
          )}
          <span className="text-slate-500">·</span>
          <span>当前视图 {filteredAndSortedRows.length} 项</span>
        </div>
      </CardHeader>
      <Separator />

      <CardContent className="p-0">
        {rows.length === 0 ? (
          <div className="flex min-h-72 items-center justify-center px-6 py-12 text-sm text-slate-500">
            {emptyLabel}
          </div>
        ) : (
          <ScrollArea className="max-h-[35rem] overflow-x-auto">
            <div style={{ minWidth: gridMinWidth }}>
              <div
                className="grid items-center gap-3 bg-slate-50 px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500"
                style={{ gridTemplateColumns }}
              >
                {BASE_COLUMNS.map((column) => (
                  <div key={column.key} className={cn('min-w-0', 'className' in column ? column.className : undefined)}>
                    {column.label}
                  </div>
                ))}
                {visibleExtraColumns.map((column) => (
                  <div key={column.key} className={cn('min-w-0', column.key === 'progress' && 'text-right tabular-nums')}>
                    {extraColumnLabels[column.key]}
                  </div>
                ))}
              </div>
              <Separator />

              <div className="divide-y divide-slate-100">
              {filteredAndSortedRows.map((row) => {
                const rowKind: SharedTreeRowKind =
                  row.rowType ?? (row.isMilestone ? 'milestone' : 'leaf')
                const rowHeightKind: SharedTreeRowKind =
                  row.titleCell || row.startCell || row.endCell || row.progressCell ? 'edit' : rowKind

                return (
                  <div
                    key={row.id}
                    className={cn(
                      'group grid items-center gap-3 px-4 transition-colors hover:bg-slate-50',
                      getTreeRowHeightClass(rowHeightKind),
                      row.selected && 'bg-blue-50/60',
                      row.isCritical && rowKind !== 'milestone' && 'border-l-2 border-l-sky-400',
                      rowKind === 'milestone' && 'border-l-2 border-l-amber-400 bg-amber-50/30',
                    )}
                    style={{ gridTemplateColumns }}
                  >
                  <div className="flex items-center justify-center gap-1 text-sm text-slate-500 tabular-nums">
                    <Button variant="ghost"
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
                        row.selected ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-300 bg-white text-transparent',
                        readOnly && 'cursor-not-allowed opacity-70',
                      )}
                    >
                      <Check className="h-3.5 w-3.5" />
                    </Button>
                    <span>{row.sequenceLabel ?? '—'}</span>
                  </div>

                  <div className="truncate text-sm font-medium text-slate-600 tabular-nums">
                    {renderValue(row.wbsCode)}
                  </div>

                  <div
                    className="min-w-0"
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

                  <div className="min-w-0 truncate text-right text-sm text-slate-700 tabular-nums">{row.startCell ?? renderValue(row.startDateLabel)}</div>

                  <div className="min-w-0 truncate text-right text-sm text-slate-700 tabular-nums">{row.endCell ?? renderValue(row.endDateLabel)}</div>

                  <div className="min-w-0 truncate text-right text-sm text-slate-700 tabular-nums">{renderValue(row.durationLabel)}</div>

                  <div className="flex min-w-0 items-center gap-2 overflow-hidden">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
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
                    {!extraColumns.includes('actions') ? renderRowActions(row) : null}
                  </div>

                  <div className="truncate text-sm text-slate-600">{renderValue(row.assigneeLabel)}</div>

                  {visibleExtraColumns.map((column) => (
                    <div key={column.key} className="min-w-0 truncate">
                      {renderExtraColumnValue(row, column.key)}
                    </div>
                  ))}
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
