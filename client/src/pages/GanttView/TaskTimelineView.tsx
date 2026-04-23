import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type UIEvent,
} from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

import type { Task, WBSNode } from '../GanttViewTypes'
import { TimelineDependencyLayer } from './TimelineDependencyLayer'
import { TimelineScaleHeader, type TimelineScaleSegment } from './TimelineScaleHeader'

export type GanttTimelineScale = 'day' | 'week' | 'month'
export type GanttTimelineCompareMode = 'plan' | 'baseline'

export interface TimelineBaselineOption {
  id: string
  version: number
  title: string
  status: string
}

export interface TaskTimelineViewHandle {
  scrollToToday: () => void
}

interface TaskTimelineViewProps {
  rows: WBSNode[]
  collapsed: Set<string>
  selectedTaskId?: string | null
  highlightTaskId?: string | null
  scale: GanttTimelineScale
  compareMode: GanttTimelineCompareMode
  baselineOptions: TimelineBaselineOption[]
  baselineVersionId: string
  baselineLoading?: boolean
  onScaleChange: (scale: GanttTimelineScale) => void
  onCompareModeChange: (mode: GanttTimelineCompareMode) => void
  onBaselineVersionIdChange: (baselineVersionId: string) => void
  onToggleCollapse: (taskId: string) => void
  onSelectTask: (task: Task) => void
  isOnCriticalPath: (taskId: string) => boolean
}

const DAY_MS = 24 * 60 * 60 * 1000
const BODY_HEIGHT = 560
const ROW_HEIGHT = 40
const OVERSCAN = 10
const VIRTUALIZE_AFTER = 200
const TIMELINE_LIMIT = 500
const PX_PER_DAY: Record<GanttTimelineScale, number> = {
  day: 24,
  week: 10,
  month: 4,
}

type TimelineLayout = {
  task: WBSNode
  index: number
  top: number
  centerY: number
  rowBottom: number
  mainStartX: number | null
  mainEndX: number | null
  compareStartX: number | null
  compareEndX: number | null
  mainDateLabel: string
  compareDateLabel: string
  missingBaseline: boolean
  mainTone: {
    fill: string
    progressFill: string
    stroke: string
    actualFill: string
  }
}

function parseDate(value?: string | null) {
  if (!value || typeof value !== 'string') return null
  const normalized = value.length === 10 ? `${value}T00:00:00` : value
  const next = new Date(normalized)
  if (Number.isNaN(next.getTime())) return null
  next.setHours(0, 0, 0, 0)
  return next
}

function addDays(date: Date, days: number) {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  next.setHours(0, 0, 0, 0)
  return next
}

function diffInDays(left: Date, right: Date) {
  return Math.round((left.getTime() - right.getTime()) / DAY_MS)
}

function clampProgress(value?: number | null) {
  const parsed = Number(value ?? 0)
  if (!Number.isFinite(parsed)) return 0
  return Math.max(0, Math.min(100, parsed))
}

function formatDateLabel(value?: string | null) {
  if (!value) return '未设置'
  return value
}

function formatMonthDay(date: Date) {
  return `${date.getMonth() + 1}/${date.getDate()}`
}

function formatWeekLabel(date: Date) {
  const end = addDays(date, 6)
  return `${formatMonthDay(date)} - ${formatMonthDay(end)}`
}

function formatMonthLabel(date: Date) {
  return `${date.getFullYear()}年${date.getMonth() + 1}月`
}

function getStartOfWeek(date: Date) {
  const next = new Date(date)
  const day = next.getDay()
  const diff = day === 0 ? -6 : 1 - day
  next.setDate(next.getDate() + diff)
  next.setHours(0, 0, 0, 0)
  return next
}

function getStartOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

function buildScaleSegments(
  scale: GanttTimelineScale,
  rangeStart: Date,
  rangeEnd: Date,
  pxPerDay: number,
) {
  const segments: TimelineScaleSegment[] = []

  if (scale === 'day') {
    for (let cursor = new Date(rangeStart); cursor <= rangeEnd; cursor = addDays(cursor, 1)) {
      const left = diffInDays(cursor, rangeStart) * pxPerDay
      segments.push({
        key: cursor.toISOString(),
        left,
        width: pxPerDay,
        label: formatMonthDay(cursor),
        hint: ['日', '一', '二', '三', '四', '五', '六'][cursor.getDay()],
      })
    }
    return segments
  }

  const stepper = scale === 'week' ? getStartOfWeek : getStartOfMonth
  const nextUnit = (date: Date) =>
    scale === 'week' ? addDays(date, 7) : new Date(date.getFullYear(), date.getMonth() + 1, 1)

  for (let cursor = stepper(rangeStart); cursor <= rangeEnd; cursor = nextUnit(cursor)) {
    const segmentStart = cursor < rangeStart ? rangeStart : cursor
    const segmentEndBase = addDays(nextUnit(cursor), -1)
    const segmentEnd = segmentEndBase > rangeEnd ? rangeEnd : segmentEndBase
    const left = diffInDays(segmentStart, rangeStart) * pxPerDay
    const width = Math.max(pxPerDay, (diffInDays(segmentEnd, segmentStart) + 1) * pxPerDay)
    segments.push({
      key: `${scale}-${cursor.toISOString()}`,
      left,
      width,
      label: scale === 'week' ? formatWeekLabel(segmentStart) : formatMonthLabel(segmentStart),
      hint: `${diffInDays(segmentEnd, segmentStart) + 1} 天`,
    })
  }

  return segments
}

function getTaskTone(task: WBSNode, critical: boolean) {
  const status = String(task.status ?? '').trim().toLowerCase()
  const overdue =
    status !== 'completed'
    && clampProgress(task.progress) < 100
    && Boolean(task.end_date)
    && parseDate(task.end_date) !== null
    && (parseDate(task.end_date)?.getTime() ?? 0) < Date.now()

  if (status === 'completed' || clampProgress(task.progress) >= 100) {
    return {
      fill: '#d1fae5',
      progressFill: '#10b981',
      stroke: critical ? '#047857' : '#6ee7b7',
      actualFill: '#047857',
    }
  }

  if (status === 'blocked') {
    return {
      fill: '#fef3c7',
      progressFill: '#f59e0b',
      stroke: critical ? '#d97706' : '#fbbf24',
      actualFill: '#b45309',
    }
  }

  if (overdue) {
    return {
      fill: '#fee2e2',
      progressFill: '#ef4444',
      stroke: critical ? '#dc2626' : '#fca5a5',
      actualFill: '#dc2626',
    }
  }

  return {
    fill: '#dbeafe',
    progressFill: '#2563eb',
    stroke: critical ? '#f97316' : '#93c5fd',
    actualFill: '#1d4ed8',
  }
}

function getUnitLabel(task: WBSNode) {
  return task.participant_unit_name || task.responsible_unit || task.assignee_unit || '未设置单位'
}

function getAssigneeLabel(task: WBSNode) {
  return task.assignee || task.assignee_name || '未设置责任人'
}

function getTimelineDateRange(rows: WBSNode[], compareMode: GanttTimelineCompareMode) {
  const dates: Date[] = []

  rows.forEach((task) => {
    const currentStart = parseDate(task.start_date || task.planned_start_date || null)
    const currentEnd = parseDate(task.end_date || task.planned_end_date || task.start_date || null)
    const actualStart = parseDate(task.actual_start_date)
    const actualEnd = parseDate(task.actual_end_date || task.actual_start_date)
    const baselineStart = parseDate(task.baseline_start)
    const baselineEnd = parseDate(task.baseline_end || task.baseline_start)

    if (compareMode === 'baseline') {
      if (baselineStart) dates.push(baselineStart)
      if (baselineEnd) dates.push(baselineEnd)
      if (currentStart) dates.push(currentStart)
      if (currentEnd) dates.push(currentEnd)
    } else {
      if (currentStart) dates.push(currentStart)
      if (currentEnd) dates.push(currentEnd)
      if (actualStart) dates.push(actualStart)
      if (actualEnd) dates.push(actualEnd)
    }
  })

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  dates.push(today)

  const sorted = dates.sort((left, right) => left.getTime() - right.getTime())
  const start = addDays(sorted[0] ?? today, -7)
  const end = addDays(sorted[sorted.length - 1] ?? today, 7)
  return { start, end }
}

export const TaskTimelineView = forwardRef<TaskTimelineViewHandle, TaskTimelineViewProps>(function TaskTimelineView(
  {
    rows,
    collapsed,
    selectedTaskId,
    highlightTaskId,
    scale,
    compareMode,
    baselineOptions,
    baselineVersionId,
    baselineLoading = false,
    onScaleChange,
    onCompareModeChange,
    onBaselineVersionIdChange,
    onToggleCollapse,
    onSelectTask,
    isOnCriticalPath,
  },
  ref,
) {
  const leftBodyRef = useRef<HTMLDivElement | null>(null)
  const rightBodyRef = useRef<HTMLDivElement | null>(null)
  const syncLockRef = useRef<'left' | 'right' | null>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [scrollLeft, setScrollLeft] = useState(0)
  const [screenWidth, setScreenWidth] = useState<number>(() => (
    typeof window !== 'undefined' ? window.innerWidth : 1440
  ))

  const isDesktop = screenWidth >= 1024
  const leftPaneWidth = screenWidth >= 1440 ? 360 : 300
  const pxPerDay = PX_PER_DAY[scale]
  const shouldVirtualize = rows.length > VIRTUALIZE_AFTER

  const dateRange = useMemo(
    () => getTimelineDateRange(rows, compareMode),
    [compareMode, rows],
  )

  const totalDays = Math.max(1, diffInDays(dateRange.end, dateRange.start) + 1)
  const timelineWidth = totalDays * pxPerDay
  const totalHeight = rows.length * ROW_HEIGHT
  const visibleStartIndex = shouldVirtualize
    ? Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN)
    : 0
  const visibleEndIndex = shouldVirtualize
    ? Math.min(rows.length - 1, Math.ceil((scrollTop + BODY_HEIGHT) / ROW_HEIGHT) + OVERSCAN)
    : rows.length - 1
  const visibleRows = rows.slice(visibleStartIndex, visibleEndIndex + 1)

  const xForDate = useMemo(
    () => (date: Date | null) => (date ? diffInDays(date, dateRange.start) * pxPerDay : null),
    [dateRange.start, pxPerDay],
  )

  const scaleSegments = useMemo(
    () => buildScaleSegments(scale, dateRange.start, dateRange.end, pxPerDay),
    [dateRange.end, dateRange.start, pxPerDay, scale],
  )

  const todayX = useMemo(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const x = xForDate(today)
    if (x === null) return null
    return x >= 0 && x <= timelineWidth ? x : null
  }, [timelineWidth, xForDate])

  const rowLayouts = useMemo<TimelineLayout[]>(() => (
    visibleRows.map((task, visibleIndex) => {
      const index = visibleStartIndex + visibleIndex
      const top = index * ROW_HEIGHT
      const currentStart = parseDate(task.start_date || task.planned_start_date || null)
      const currentEnd = parseDate(task.end_date || task.planned_end_date || task.start_date || null)
      const actualStart = parseDate(task.actual_start_date)
      const actualEnd = parseDate(task.actual_end_date || task.actual_start_date || null)
      const baselineStart = parseDate(task.baseline_start)
      const baselineEnd = parseDate(task.baseline_end || task.baseline_start || null)
      const missingBaseline = compareMode === 'baseline' && !baselineStart && !baselineEnd

      const mainStart = compareMode === 'baseline' ? (baselineStart || currentStart) : currentStart
      const mainEnd = compareMode === 'baseline' ? (baselineEnd || currentEnd || baselineStart) : (currentEnd || currentStart)
      const compareStart = compareMode === 'baseline' ? currentStart : actualStart
      const compareEnd = compareMode === 'baseline'
        ? (currentEnd || currentStart)
        : (actualEnd || actualStart)

      return {
        task,
        index,
        top,
        centerY: top + ROW_HEIGHT / 2,
        rowBottom: top + ROW_HEIGHT,
        mainStartX: xForDate(mainStart),
        mainEndX: xForDate(mainEnd),
        compareStartX: xForDate(compareStart),
        compareEndX: xForDate(compareEnd),
        mainDateLabel: `${formatDateLabel(compareMode === 'baseline' ? task.baseline_start : (task.start_date || task.planned_start_date))} → ${formatDateLabel(compareMode === 'baseline' ? task.baseline_end : (task.end_date || task.planned_end_date))}`,
        compareDateLabel: compareMode === 'baseline'
          ? `${formatDateLabel(task.start_date || task.planned_start_date)} → ${formatDateLabel(task.end_date || task.planned_end_date)}`
          : `${formatDateLabel(task.actual_start_date)} → ${formatDateLabel(task.actual_end_date || task.actual_start_date)}`,
        missingBaseline,
        mainTone: getTaskTone(task, isOnCriticalPath(task.id)),
      }
    })
  ), [compareMode, isOnCriticalPath, visibleRows, visibleStartIndex, xForDate])

  const layoutMap = useMemo(
    () => new Map(rowLayouts.map((layout) => [layout.task.id, layout])),
    [rowLayouts],
  )

  const dependencyEdges = useMemo(() => {
    const edges: Array<{ id: string; points: [number, number, number, number]; highlighted?: boolean }> = []

    rowLayouts.forEach((layout) => {
      const targetStart = layout.mainStartX
      if (targetStart === null) return

      for (const depId of layout.task.dependencies ?? []) {
        const sourceLayout = layoutMap.get(depId)
        if (!sourceLayout || sourceLayout.mainEndX === null) continue
        edges.push({
          id: `${depId}->${layout.task.id}`,
          points: [sourceLayout.mainEndX + 4, sourceLayout.centerY, targetStart - 4, layout.centerY],
          highlighted: isOnCriticalPath(depId) && isOnCriticalPath(layout.task.id),
        })
      }
    })

    return edges
  }, [isOnCriticalPath, layoutMap, rowLayouts])

  useEffect(() => {
    if (typeof window === 'undefined') return undefined

    const handleResize = () => {
      setScreenWidth(window.innerWidth)
    }

    handleResize()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  const scrollToToday = useMemo(
    () => () => {
      if (!rightBodyRef.current || todayX === null) return
      const containerWidth = rightBodyRef.current.clientWidth
      const nextLeft = Math.max(0, todayX - containerWidth * 0.35)
      rightBodyRef.current.scrollTo({ left: nextLeft, behavior: 'smooth' })
    },
    [todayX],
  )

  useImperativeHandle(ref, () => ({
    scrollToToday,
  }), [scrollToToday])

  useEffect(() => {
    if (!highlightTaskId || !rightBodyRef.current) return
    const targetIndex = rows.findIndex((task) => task.id === highlightTaskId)
    if (targetIndex < 0) return

    const nextTop = Math.max(0, targetIndex * ROW_HEIGHT - BODY_HEIGHT / 2 + ROW_HEIGHT / 2)
    rightBodyRef.current.scrollTo({ top: nextTop, behavior: 'smooth' })
    leftBodyRef.current?.scrollTo({ top: nextTop, behavior: 'smooth' })
  }, [highlightTaskId, rows])

  function syncScroll(source: 'left' | 'right', top: number) {
    const target = source === 'left' ? rightBodyRef.current : leftBodyRef.current
    if (!target) return
    syncLockRef.current = source
    target.scrollTop = top
    window.requestAnimationFrame(() => {
      syncLockRef.current = null
    })
  }

  function handleLeftScroll(event: UIEvent<HTMLDivElement>) {
    if (syncLockRef.current === 'right') return
    const nextTop = event.currentTarget.scrollTop
    setScrollTop(nextTop)
    syncScroll('left', nextTop)
  }

  function handleRightScroll(event: UIEvent<HTMLDivElement>) {
    if (syncLockRef.current === 'left') return
    const nextTop = event.currentTarget.scrollTop
    setScrollTop(nextTop)
    setScrollLeft(event.currentTarget.scrollLeft)
    syncScroll('right', nextTop)
  }

  if (!isDesktop) {
    return (
      <div
        data-testid="gantt-timeline-mobile-fallback"
        className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-6 text-sm text-amber-900"
      >
        横道图建议在桌面端查看。当前屏宽小于 1024px，已保留列表视图供移动端维护任务。
      </div>
    )
  }

  if (rows.length > TIMELINE_LIMIT) {
    return (
      <div
        data-testid="gantt-timeline-too-many"
        className="rounded-2xl border border-slate-200 bg-slate-50 px-5 py-6 text-sm text-slate-700"
      >
        当前筛选结果共 {rows.length} 条任务。为保证横道图性能，请先按楼栋、专业、责任单位或关键路径缩小到 500 条以内。
      </div>
    )
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-5 py-10 text-center text-sm text-slate-500">
        当前筛选条件下没有可展示的任务。
      </div>
    )
  }

  return (
    <div className="space-y-4" data-testid="gantt-timeline-view">
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-slate-700">
            只读横道图
          </span>
          <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1">
            {(['day', 'week', 'month'] as const).map((option) => (
              <button
                key={option}
                type="button"
                data-testid={`gantt-timeline-scale-${option}`}
                onClick={() => onScaleChange(option)}
                className={cn(
                  'rounded-lg px-3 py-1.5 text-sm transition-colors',
                  scale === option ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100',
                )}
              >
                {option === 'day' ? '天' : option === 'week' ? '周' : '月'}
              </button>
            ))}
          </div>
          <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1">
            <button
              type="button"
              data-testid="gantt-timeline-compare-plan"
              onClick={() => onCompareModeChange('plan')}
              className={cn(
                'rounded-lg px-3 py-1.5 text-sm transition-colors',
                compareMode === 'plan' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-100',
              )}
            >
              计划 / 实际
            </button>
            <button
              type="button"
              data-testid="gantt-timeline-compare-baseline"
              onClick={() => onCompareModeChange('baseline')}
              className={cn(
                'rounded-lg px-3 py-1.5 text-sm transition-colors',
                compareMode === 'baseline' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-100',
              )}
            >
              基线对比
            </button>
          </div>
          {compareMode === 'baseline' ? (
            <select
              data-testid="gantt-timeline-baseline-select"
              value={baselineVersionId}
              disabled={baselineLoading || baselineOptions.length === 0}
              onChange={(event) => onBaselineVersionIdChange(event.target.value)}
              className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 shadow-sm disabled:cursor-not-allowed disabled:bg-slate-100"
            >
              {baselineOptions.length === 0 ? (
                <option value="">暂无已确认基线</option>
              ) : (
                baselineOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    V{option.version} · {option.title}
                  </option>
                ))
              )}
            </select>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
          <span>当前共 {rows.length} 条任务</span>
          <span>左侧固定列 + 右侧时间轴</span>
          {shouldVirtualize ? <span>已启用行级虚拟滚动</span> : null}
        </div>
      </div>

      {compareMode === 'baseline' && baselineOptions.length === 0 ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-6 text-sm text-amber-900">
          当前还没有已确认的项目基线版本。请先到“项目基线”确认版本后，再查看基线横道图对比。
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="grid" style={{ gridTemplateColumns: `${leftPaneWidth}px minmax(0, 1fr)` }}>
            <div className="border-r border-slate-200">
              <div className="grid h-14 grid-cols-[minmax(0,1fr)_7rem_7rem] items-center gap-3 border-b border-slate-200 bg-slate-50 px-4 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <span>任务名称</span>
                <span>责任单位</span>
                <span>责任人</span>
              </div>
              <div
                ref={leftBodyRef}
                className="relative overflow-y-auto overflow-x-hidden"
                style={{ height: BODY_HEIGHT }}
                onScroll={handleLeftScroll}
              >
                <div className="relative" style={{ height: totalHeight }}>
                  {rowLayouts.map((layout) => {
                    const selected = selectedTaskId === layout.task.id
                    const highlighted = highlightTaskId === layout.task.id
                    const hasChildren = layout.task.children.length > 0

                    return (
                      <div
                        key={layout.task.id}
                        id={`gantt-task-row-${layout.task.id}`}
                        role="button"
                        tabIndex={0}
                        className={cn(
                          'absolute left-0 right-0 grid h-10 grid-cols-[minmax(0,1fr)_7rem_7rem] items-center gap-3 border-b border-slate-100 px-4 text-left transition-colors',
                          selected && 'bg-blue-50',
                          highlighted && 'bg-orange-50 ring-1 ring-inset ring-orange-300',
                          !selected && !highlighted && layout.index % 2 === 1 && 'bg-slate-50/70',
                        )}
                        style={{ top: layout.top }}
                        onClick={() => onSelectTask(layout.task)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault()
                            onSelectTask(layout.task)
                          }
                        }}
                      >
                        <div className="flex min-w-0 items-center gap-2" style={{ paddingLeft: layout.task.depth * 14 }}>
                          {hasChildren ? (
                            <button
                              type="button"
                              aria-label={collapsed.has(layout.task.id) ? '展开子任务' : '折叠子任务'}
                              className="inline-flex h-6 w-6 items-center justify-center rounded-md text-slate-500 hover:bg-slate-200"
                              onClick={(event) => {
                                event.stopPropagation()
                                onToggleCollapse(layout.task.id)
                              }}
                            >
                              {collapsed.has(layout.task.id) ? (
                                <ChevronRight className="h-4 w-4" />
                              ) : (
                                <ChevronDown className="h-4 w-4" />
                              )}
                            </button>
                          ) : (
                            <span className="h-6 w-6 shrink-0" />
                          )}
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium text-slate-900">
                              {layout.task.title || layout.task.name || '未命名任务'}
                            </div>
                            <div className="flex flex-wrap items-center gap-2 pt-0.5 text-[11px] text-slate-500">
                              {layout.task.wbs_code ? <span>WBS {layout.task.wbs_code}</span> : null}
                              {layout.task.is_milestone ? <span>里程碑</span> : null}
                              {layout.missingBaseline ? <span className="text-amber-600">未映射基线</span> : null}
                            </div>
                          </div>
                        </div>
                        <span className="truncate text-sm text-slate-600">{getUnitLabel(layout.task)}</span>
                        <span className="truncate text-sm text-slate-600">{getAssigneeLabel(layout.task)}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>

            <div className="min-w-0">
              <TimelineScaleHeader
                segments={scaleSegments}
                timelineWidth={timelineWidth}
                scrollLeft={scrollLeft}
                todayX={todayX}
              />
              <div
                ref={rightBodyRef}
                className="relative overflow-auto"
                style={{ height: BODY_HEIGHT }}
                onScroll={handleRightScroll}
              >
                <div className="relative" style={{ width: timelineWidth, height: totalHeight }}>
                  {rowLayouts.map((layout) => {
                    const selected = selectedTaskId === layout.task.id
                    const highlighted = highlightTaskId === layout.task.id
                    return (
                      <div
                        key={`timeline-row-bg-${layout.task.id}`}
                        className={cn(
                          'absolute inset-x-0 border-b border-slate-100',
                          selected && 'bg-blue-50/70',
                          highlighted && 'bg-orange-50/70',
                          !selected && !highlighted && layout.index % 2 === 1 && 'bg-slate-50/60',
                        )}
                        style={{ top: layout.top, height: ROW_HEIGHT }}
                      />
                    )
                  })}

                  <svg className="absolute inset-0" width={timelineWidth} height={totalHeight}>
                    {scaleSegments.map((segment) => (
                      <line
                        key={`grid-${segment.key}`}
                        x1={segment.left}
                        x2={segment.left}
                        y1={0}
                        y2={totalHeight}
                        stroke="#e2e8f0"
                        strokeWidth={1}
                      />
                    ))}
                    {todayX !== null ? (
                      <line x1={todayX} x2={todayX} y1={0} y2={totalHeight} stroke="#fb7185" strokeWidth={1.5} />
                    ) : null}

                    <TimelineDependencyLayer edges={dependencyEdges} />

                    {rowLayouts.map((layout) => {
                      const selected = selectedTaskId === layout.task.id
                      const critical = isOnCriticalPath(layout.task.id)
                      const mainWidth = layout.mainStartX !== null && layout.mainEndX !== null
                        ? Math.max(10, layout.mainEndX - layout.mainStartX + pxPerDay - 6)
                        : 0
                      const mainX = layout.mainStartX !== null ? layout.mainStartX + 3 : null
                      const compareWidth = layout.compareStartX !== null && layout.compareEndX !== null
                        ? Math.max(8, layout.compareEndX - layout.compareStartX + pxPerDay - 8)
                        : 0
                      const compareX = layout.compareStartX !== null ? layout.compareStartX + 4 : null
                      const progressWidth = Math.round(mainWidth * (clampProgress(layout.task.progress) / 100))
                      const milestoneX = layout.mainEndX !== null ? layout.mainEndX + pxPerDay / 2 : null
                      const tooltip = [
                        layout.task.title || layout.task.name || '未命名任务',
                        `主条：${layout.mainDateLabel}`,
                        compareMode === 'baseline' ? `对比：${layout.compareDateLabel}` : `实际：${layout.compareDateLabel}`,
                        `进度：${clampProgress(layout.task.progress)}%`,
                        `责任单位：${getUnitLabel(layout.task)}`,
                        `责任人：${getAssigneeLabel(layout.task)}`,
                      ].join('\n')

                      return (
                        <g
                          key={`timeline-task-${layout.task.id}`}
                          className="cursor-pointer"
                          onClick={() => onSelectTask(layout.task)}
                        >
                          <title>{tooltip}</title>
                          {mainX !== null && mainWidth > 0 && !layout.task.is_milestone ? (
                            <>
                              <rect
                                x={mainX}
                                y={layout.top + 8}
                                width={mainWidth}
                                height={14}
                                rx={7}
                                fill={layout.missingBaseline ? '#f8fafc' : layout.mainTone.fill}
                                stroke={critical ? '#f97316' : layout.mainTone.stroke}
                                strokeDasharray={layout.missingBaseline ? '4 3' : undefined}
                                strokeWidth={critical ? 2 : selected ? 1.8 : 1.2}
                              />
                              {progressWidth > 0 ? (
                                <rect
                                  x={mainX}
                                  y={layout.top + 8}
                                  width={progressWidth}
                                  height={14}
                                  rx={7}
                                  fill={layout.mainTone.progressFill}
                                  opacity={layout.missingBaseline ? 0.45 : 1}
                                />
                              ) : null}
                            </>
                          ) : null}

                          {layout.task.is_milestone && milestoneX !== null ? (
                            <polygon
                              points={`${milestoneX},${layout.top + 8} ${milestoneX + 8},${layout.top + 16} ${milestoneX},${layout.top + 24} ${milestoneX - 8},${layout.top + 16}`}
                              fill="#f59e0b"
                              stroke={critical ? '#f97316' : '#d97706'}
                              strokeWidth={critical ? 2 : 1.5}
                            />
                          ) : null}

                          {compareX !== null && compareWidth > 0 ? (
                            <rect
                              x={compareX}
                              y={compareMode === 'baseline' ? layout.top + 27 : layout.top + 26}
                              width={compareWidth}
                              height={compareMode === 'baseline' ? 5 : 6}
                              rx={compareMode === 'baseline' ? 2.5 : 3}
                              fill={compareMode === 'baseline' ? '#475569' : layout.mainTone.actualFill}
                              opacity={0.88}
                            />
                          ) : null}
                        </g>
                      )
                    })}
                  </svg>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500">
        <span>主条：{compareMode === 'baseline' ? '基线计划' : '当前计划'}</span>
        <span>细条：{compareMode === 'baseline' ? '当前计划' : '实际时间'}</span>
        <span>边框：关键路径高亮</span>
        <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={scrollToToday}>
          定位到今天
        </Button>
      </div>
    </div>
  )
})
