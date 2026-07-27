// v1.4.7.1 §8.6: Column config dialog
// Uses field registry to show available columns with drag-to-reorder

import { memo, useCallback, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { Check, GripVertical, X } from 'lucide-react'

export interface ColumnConfigItem {
  key: string
  label: string
  group?: string
  visible: boolean
  readonly?: boolean
}

export interface PlanningColumnConfigProps {
  open: boolean
  onClose: () => void
  columns: ColumnConfigItem[]
  onToggleColumn: (key: string, visible: boolean) => void
  onReorder?: (columns: ColumnConfigItem[]) => void
  availableColumns?: ColumnConfigItem[]
  maxColumns?: number
  className?: string
}

export const PlanningColumnConfig = memo(function PlanningColumnConfig(props: PlanningColumnConfigProps) {
  const {
    open,
    onClose,
    columns,
    onToggleColumn,
    availableColumns,
    maxColumns,
    className,
  } = props

  const visibleCount = columns.filter(c => c.visible).length
  const allVisible = columns.every(c => c.visible)

  const groupedColumns = useMemo(() => {
    const groups = new Map<string, ColumnConfigItem[]>()
    for (const col of columns) {
      const g = col.group ?? 'other'
      if (!groups.has(g)) groups.set(g, [])
      groups.get(g)!.push(col)
    }
    return groups
  }, [columns])

  const groupLabels: Record<string, string> = {
    basic_plan: '基础计划',
    progress_fact: '进度事实',
    engineering_object: '工程对象',
    engineering_category: '工程分类',
    responsibility: '责任主体',
    node_control: '节点控制',
    dependency: '依赖',
    acceptance_impact: '验收影响',
    quality_hint: '质量提示',
    template_source: '模板来源',
    other: '其他',
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className={cn('max-w-md rounded-2xl shadow-[var(--el-4)]', className)} data-testid="planning-more-columns-popover">
        <div data-testid="planning-column-config" className="contents">
        <DialogHeader>
          <DialogTitle className="text-base">字段配置</DialogTitle>
          <DialogDescription className="text-xs">
            选择要在当前视图中显示的字段。已显示 {visibleCount} 个
            {maxColumns ? `（最多 ${maxColumns} 个）` : ''}。
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-80 space-y-4 overflow-y-auto py-2">
          {/* Quick actions */}
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => columns.forEach(c => onToggleColumn(c.key, true))}>
              全选
            </Button>
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => columns.filter(c => !c.readonly).forEach(c => onToggleColumn(c.key, false))}>
              全部隐藏
            </Button>
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => columns.forEach(c => onToggleColumn(c.key, !c.visible))}>
              反选
            </Button>
          </div>

          {/* Grouped columns */}
          {Array.from(groupedColumns.entries()).map(([group, cols]) => (
            <div key={group} className="space-y-1.5">
              <p className="text-xs font-medium uppercase tracking-wider text-slate-400">{groupLabels[group] ?? group}</p>
              <div className="space-y-0.5">
                {cols.map((col) => (
                  <label
                    key={col.key}
                    className={cn(
                      'flex cursor-pointer items-center gap-3 rounded-lg px-2 py-1.5 transition-colors hover:bg-slate-50',
                      col.readonly && 'cursor-default opacity-60',
                    )}
                  >
                    {!col.readonly && (
                      <GripVertical className="h-3.5 w-3.5 shrink-0 text-slate-300" />
                    )}
                    <input
                      type="checkbox"
                      checked={col.visible}
                      disabled={col.readonly || (maxColumns != null && visibleCount >= maxColumns && !col.visible)}
                      onChange={(e) => onToggleColumn(col.key, e.target.checked)}
                      className="h-3.5 w-3.5 rounded border-slate-300 text-blue-600"
                    />
                    <span className="flex-1 text-sm text-slate-700">{col.label}</span>
                    {col.visible && <Check className="h-3.5 w-3.5 text-blue-500" />}
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" size="sm" onClick={onClose}>关闭</Button>
        </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  )
})

export default PlanningColumnConfig
