// v1.4.7.3 §8.3: Gantt chart thin wrapper
// Consumed by PlanningTreeView via ganttRenderer prop for task_list surface
// Actual rendering delegates to existing GanttView internal implementation

import { memo, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

export interface GanttChartRow {
  id: string
  title: string
  startDateLabel?: string
  endDateLabel?: string
  progressLabel?: string
  isCritical?: boolean
  isMilestone?: boolean
  depth: number
}

export interface GanttChartProps {
  rows: GanttChartRow[]
  selectedRowIds: string[]
  onRowClick: (rowId: string) => void
  scale?: 'day' | 'week' | 'month'
  readOnly?: boolean
  className?: string
  children?: ReactNode
}

export const GanttChart = memo(function GanttChart(props: GanttChartProps) {
  const { rows, selectedRowIds, onRowClick, scale = 'day', readOnly = true, className, children } = props

  if (children) {
    return (
      <div className={className} data-testid="gantt-chart" data-read-only={readOnly ? 'true' : 'false'} data-scale={scale}>
        {children}
      </div>
    )
  }

  if (rows.length === 0) {
    return (
      <div className={cn('flex items-center justify-center py-16 text-sm text-slate-400', className)}>
        暂无任务数据
      </div>
    )
  }

  const selectedSet = new Set(selectedRowIds)

  return (
    <div className={cn('overflow-x-auto', className)} data-testid="gantt-chart">
      {/* Time scale header */}
      <div className="sticky top-0 z-10 flex border-b border-slate-200 bg-white">
        <div className="flex shrink-0 items-center px-3 py-2" style={{ width: 240 }}>
          <span className="text-xs font-medium text-slate-500">任务名称</span>
        </div>
        <div className="flex flex-1">
          {Array.from({ length: scale === 'month' ? 12 : 30 }, (_, i) => (
            <div key={i} className="flex-1 border-l border-slate-100 px-1 py-2 text-center text-xs text-slate-400">
              {scale === 'month' ? `${i + 1}月` : `${i + 1}`}
            </div>
          ))}
        </div>
      </div>

      {/* Rows */}
      {rows.map((row) => (
        <div
          key={row.id}
          className={cn(
            'flex border-b border-slate-100 transition-colors hover:bg-blue-50/30',
            selectedSet.has(row.id) && 'bg-blue-50',
            row.isCritical && 'border-l-2 border-l-red-500',
          )}
          onClick={() => onRowClick(row.id)}
          style={{ paddingLeft: row.depth * 16 }}
        >
          {/* Task name */}
          <div className="flex shrink-0 items-center gap-2 px-3 py-2" style={{ width: 240 }}>
            {row.isMilestone && <span className="text-amber-500 text-xs">★</span>}
            <span className="truncate text-xs text-slate-700">{row.title}</span>
          </div>

          {/* Gantt bar area */}
          <div className="relative flex flex-1 items-center">
            {row.startDateLabel && row.endDateLabel && (
              <div
                className={cn(
                  'absolute h-4 rounded',
                  row.isCritical ? 'bg-red-400' : 'bg-blue-400',
                )}
                style={{
                  left: '10%',
                  width: '30%',
                }}
              />
            )}
          </div>
        </div>
      ))}
    </div>
  )
})

export default GanttChart
