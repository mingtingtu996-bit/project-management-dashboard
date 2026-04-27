import { useState, type MouseEvent } from 'react'
import { AlertOctagon, Calendar, CheckCircle2, Plus, Search, ShieldCheck, Trash2 } from 'lucide-react'
import { memo, startTransition, useEffect } from 'react'
import { EmptyState } from '@/components/EmptyState'
import { Button } from '@/components/ui/button'
import { CardContent } from '@/components/ui/card'
import { getTreeIndentPx, getTreeRowHeightClass } from '@/components/tree/SharedTreePrimitives'
import type { CriticalTaskSnapshot } from '@/lib/criticalPath'
import type { ProjectTaskProgressSnapshot } from '@/lib/taskBusinessStatus'
import { getTaskLagLevel } from '@/lib/taskBusinessStatus'
import { SortableTaskRowWrapper } from './GanttViewComponents'
import { TaskRowConditionPanel, TaskRowDetailCells, TaskRowIdentityCell } from './GanttViewRowSections'
import { TaskContextMenu, type TaskContextMenuState } from './GanttViewTaskContextMenu'
import { type Task, type TaskCondition, type WBSNode } from './GanttViewTypes'

type BusinessStatusView = {
  label: string
  cls: string
  badge?: { text: string; cls: string }
}

type CriticalOverrideFlags = {
  hasManualAttentionOverride: boolean
  hasManualInsertOverride: boolean
}

const INITIAL_RENDERED_ROW_COUNT = 48
const RENDER_CHUNK_SIZE = 160

interface GanttTaskRowsProps {
  tasks: Task[]
  flatList: WBSNode[]
  filteredFlatList: WBSNode[]
  collapsed: Set<string>
  selectedIds: Set<string>
  expandedConditionTaskId: string | null
  inlineConditionsMap: Record<string, TaskCondition[]>
  taskProgressSnapshot: ProjectTaskProgressSnapshot
  inlineTitleTaskId: string | null
  inlineTitleValue: string
  onClearFilters: () => void
  onToggleCollapse: (nodeId: string) => void
  onToggleSelect: (nodeId: string) => void
  onSelectTask: (task: Task) => void
  onOpenMilestoneDialog: (task: Task) => void
  onOpenEditDialog: (task?: Task, parentId?: string) => void
  onOpenConditionDialog: (task: Task) => void
  onOpenObstacleDialog: (task: Task) => void
  onDeleteTask: (taskId: string) => void
  onStatusChange: (taskId: string, status: string) => void
  onToggleInlineConditions: (taskId: string, event: MouseEvent) => void
  onToggleCondition?: (condition: TaskCondition) => void
  onStartInlineTitleEdit: (task: Task) => void
  onInlineTitleValueChange: (value: string) => void
  onInlineTitleSave: (taskId: string) => void
  onCancelInlineTitleEdit: () => void
  onViewTaskSummary: (taskId: string) => void
  onDeleteTaskFromContextMenu: (task: Task) => void
  onMarkCriticalPathAttention?: (taskId: string) => void
  onInsertBeforeChain?: (taskId: string) => void
  onInsertAfterChain?: (taskId: string) => void
  onRemoveCriticalPathOverride?: (taskId: string, mode?: 'manual_attention' | 'manual_insert') => void
  getBusinessStatus: (task: Task) => BusinessStatusView
  getCriticalPathTask: (taskId: string) => CriticalTaskSnapshot | null
  criticalPathOverrideFlags?: Map<string, CriticalOverrideFlags>
  dependencyChainIds?: Set<string>
  onHoverTaskId?: (taskId: string | null) => void
}

function formatShortDate(value?: string | null) {
  if (!value) return null
  const date = new Date(value)
  return `${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}`
}

const TaskRow = memo(function TaskRow(
  props: Omit<GanttTaskRowsProps, 'tasks' | 'flatList' | 'filteredFlatList' | 'onClearFilters' | 'onDeleteTaskFromContextMenu'> & {
    node: WBSNode
    onOpenContextMenu: (event: MouseEvent, task: Task) => void
  },
) {
  const task = props.node
  const today = new Date().toISOString().slice(0, 10)
  const isActiveToday = Boolean(
    task.status !== 'completed' &&
    task.start_date && task.end_date &&
    task.start_date <= today && task.end_date >= today
  )
  const isOverdue = task.status !== 'completed' && task.end_date && new Date(task.end_date) < new Date()
  const hasChildren = props.node.children.length > 0
  const isMilestoneLeaf = Boolean(task.is_milestone && !hasChildren)
  const isCollapsed = props.collapsed.has(task.id)
  const indentPx = getTreeIndentPx(props.node.depth)
  const rowKind = hasChildren ? 'structure' : isMilestoneLeaf ? 'milestone' : 'leaf'
  const bizStatus = props.getBusinessStatus(task)
  const overdueDays = isOverdue && task.end_date
    ? Math.ceil((new Date().getTime() - new Date(task.end_date).getTime()) / 86400000)
    : 0
  const conditionSummary = props.taskProgressSnapshot.taskConditionMap[task.id]
  const obstacleCount = props.taskProgressSnapshot.obstacleCountMap[task.id] || 0
  const actualProgress = Number(task.progress ?? 0)
  const rolledProgress = actualProgress
  const criticalTask = props.getCriticalPathTask(task.id)
  const overrideFlags = props.criticalPathOverrideFlags?.get(task.id)
  const lagLevel = getTaskLagLevel(task)

  const isInDependencyChain = props.dependencyChainIds?.has(task.id) ?? false
  const criticalSourceClass = criticalTask
    ? criticalTask.isManualInserted
      ? 'border-l-4 border-l-orange-500 bg-orange-50/30'
      : criticalTask.isManualAttention
        ? 'border-l-4 border-l-amber-400 bg-amber-50/30'
        : criticalTask.isAutoCritical
          ? 'border-l-4 border-l-red-400 bg-red-50/30'
          : ''
    : ''

  return (
    <SortableTaskRowWrapper key={task.id} id={task.id}>
      <div
        id={`gantt-task-row-${task.id}`}
        data-today-active={isActiveToday ? 'true' : undefined}
        onMouseEnter={() => props.onHoverTaskId?.(task.id)}
        onMouseLeave={() => props.onHoverTaskId?.(null)}
        className={`group flex items-center px-4 transition-colors hover:bg-accent/30 ${getTreeRowHeightClass(rowKind)} ${
          criticalSourceClass ||
          (isInDependencyChain
            ? 'border-l-4 border-l-violet-400 bg-violet-50/30'
            : isActiveToday
            ? 'border-l-4 border-l-blue-400 bg-blue-50/30'
            : isMilestoneLeaf
            ? 'border-l-2 border-l-amber-400 bg-amber-50/30'
            : isOverdue
              ? 'border-l-4 border-l-red-400 bg-red-50/30'
              : lagLevel === 'severe'
              ? 'border-l-4 border-l-orange-500 bg-orange-50/40'
              : lagLevel === 'moderate'
              ? 'border-l-4 border-l-amber-400 bg-amber-50/40'
              : lagLevel === 'mild'
              ? 'border-l-2 border-l-yellow-300 bg-yellow-50/40'
              : '')
        }`}
        onContextMenu={(event) => props.onOpenContextMenu(event, task)}
      >
        <TaskRowIdentityCell
          task={task}
          node={props.node}
          indentPx={indentPx}
          hasChildren={hasChildren}
          isCollapsed={isCollapsed}
          isOverdue={!!isOverdue}
          overdueDays={overdueDays}
          selected={props.selectedIds.has(task.id)}
          bizStatus={bizStatus}
          conditionSummary={conditionSummary}
          obstacleCount={obstacleCount}
          criticalTask={criticalTask}
          inlineTitleTaskId={props.inlineTitleTaskId}
          inlineTitleValue={props.inlineTitleValue}
          expandedConditionTaskId={props.expandedConditionTaskId}
          onToggleSelect={props.onToggleSelect}
          onToggleCollapse={props.onToggleCollapse}
          onSelectTask={props.onSelectTask}
          onOpenMilestoneDialog={props.onOpenMilestoneDialog}
          onOpenEditDialog={props.onOpenEditDialog}
          onStartInlineTitleEdit={props.onStartInlineTitleEdit}
          onInlineTitleValueChange={props.onInlineTitleValueChange}
          onInlineTitleSave={props.onInlineTitleSave}
          onCancelInlineTitleEdit={props.onCancelInlineTitleEdit}
          onToggleInlineConditions={props.onToggleInlineConditions}
        />
        <TaskRowDetailCells
          task={task}
          hasChildren={hasChildren}
          isOverdue={!!isOverdue}
          actualProgress={actualProgress}
          rolledProgress={rolledProgress}
          bizStatus={bizStatus}
          criticalTask={criticalTask}
          onOpenEditDialog={props.onOpenEditDialog}
          onDeleteTask={props.onDeleteTask}
          onViewTaskSummary={props.onViewTaskSummary}
          onStatusChange={props.onStatusChange}
        />
      </div>

      <TaskRowConditionPanel
        task={task}
        taskId={task.id}
        expandedConditionTaskId={props.expandedConditionTaskId}
        inlineConditions={props.inlineConditionsMap[task.id]}
        onToggleInlineConditions={props.onToggleInlineConditions}
        onToggleCondition={props.onToggleCondition}
        indentPx={indentPx}
      />
    </SortableTaskRowWrapper>
  )
})

TaskRow.displayName = 'TaskRow'

export const GanttTaskRows = memo(function GanttTaskRows(props: GanttTaskRowsProps) {
  const [contextMenu, setContextMenu] = useState<TaskContextMenuState | null>(null)
  const [visibleCount, setVisibleCount] = useState(() =>
    Math.min(props.filteredFlatList.length, INITIAL_RENDERED_ROW_COUNT),
  )

  useEffect(() => {
    const totalRows = props.filteredFlatList.length
    if (totalRows <= INITIAL_RENDERED_ROW_COUNT) {
      setVisibleCount(totalRows)
      return undefined
    }

    let cancelled = false
    let timer: number | null = null
    setVisibleCount(INITIAL_RENDERED_ROW_COUNT)

    const scheduleNextChunk = () => {
      timer = window.setTimeout(() => {
        if (cancelled) return
        startTransition(() => {
          setVisibleCount((current) => {
            const next = Math.min(totalRows, current + RENDER_CHUNK_SIZE)
            if (next < totalRows) {
              scheduleNextChunk()
            }
            return next
          })
        })
      }, 0)
    }

    scheduleNextChunk()

    return () => {
      cancelled = true
      if (timer !== null) {
        window.clearTimeout(timer)
      }
    }
  }, [props.filteredFlatList])

  const visibleRows = props.filteredFlatList.slice(0, visibleCount)
  const hiddenRowCount = Math.max(0, props.filteredFlatList.length - visibleRows.length)

  return (
    <>
      <CardContent className="p-0" data-testid="gantt-task-rows">
        {props.tasks.length === 0 ? (
          <EmptyState
            icon={Calendar}
            title="暂无任务"
            className="max-w-none rounded-none border-0 bg-transparent py-12 shadow-none"
            action={
              <Button onClick={() => props.onOpenEditDialog()}>
                添加第一个任务
              </Button>
            }
          />
        ) : props.filteredFlatList.length === 0 ? (
          <EmptyState
            icon={Search}
            title="没有匹配的任务"
            className="max-w-none rounded-none border-0 bg-transparent py-10 shadow-none"
            action={
              <Button variant="outline" onClick={props.onClearFilters}>
                清空筛选条件
              </Button>
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <div className="min-w-[1160px] divide-y">
            {visibleRows.map((node) => (
              <TaskRow
                key={node.id}
                {...props}
                node={node}
                onOpenContextMenu={(event, task) => {
                  event.preventDefault()
                  const flags = props.criticalPathOverrideFlags?.get(task.id)
                  setContextMenu({
                    x: event.clientX,
                    y: event.clientY,
                    task,
                    hasManualAttentionOverride: flags?.hasManualAttentionOverride,
                    hasManualInsertOverride: flags?.hasManualInsertOverride,
                  })
                }}
              />
            ))}
            </div>
            {hiddenRowCount > 0 ? (
              <div
                data-testid="gantt-progressive-render-hint"
                className="border-t border-slate-100 px-4 py-2 text-xs text-slate-500"
              >
                正在继续加载剩余 {hiddenRowCount} 行任务...
              </div>
            ) : null}
          </div>
        )}
      </CardContent>

      {contextMenu && (
        <TaskContextMenu
          contextMenu={contextMenu}
          onClose={() => setContextMenu(null)}
          onOpenEditDialog={props.onOpenEditDialog}
          onOpenConditionDialog={props.onOpenConditionDialog}
          onOpenObstacleDialog={props.onOpenObstacleDialog}
          onStartInlineTitleEdit={props.onStartInlineTitleEdit}
          onStatusChange={props.onStatusChange}
          onOpenEditChild={(parentId) => props.onOpenEditDialog(undefined, parentId)}
          onDeleteTaskFromContextMenu={props.onDeleteTaskFromContextMenu}
          onMarkCriticalPathAttention={props.onMarkCriticalPathAttention}
          onInsertBeforeChain={props.onInsertBeforeChain}
          onInsertAfterChain={props.onInsertAfterChain}
          onRemoveCriticalPathOverride={props.onRemoveCriticalPathOverride}
        />
      )}
    </>
  )
})

GanttTaskRows.displayName = 'GanttTaskRows'
