import { AlertOctagon, CheckCircle2, GitBranch, Pencil, Plus, ShieldCheck, Trash2 } from 'lucide-react'

import { Separator } from '@/components/ui/separator'
import type { Task } from './GanttViewTypes'
import { Button } from '@/components/ui/button'

export type TaskContextMenuState = {
  x: number
  y: number
  task: Task
  hasManualAttentionOverride?: boolean
  hasManualInsertOverride?: boolean
}

export function TaskContextMenu({
  contextMenu,
  onClose,
  onOpenEditDialog,
  onOpenConditionDialog,
  onOpenObstacleDialog,
  onStartInlineTitleEdit,
  onStatusChange,
  onOpenEditChild,
  onDeleteTaskFromContextMenu,
  onMarkCriticalPathAttention,
  onInsertBeforeChain,
  onInsertAfterChain,
  onRemoveCriticalPathOverride,
}: {
  contextMenu: TaskContextMenuState
  onClose: () => void
  onOpenEditDialog: (task?: Task, parentId?: string) => void
  onOpenConditionDialog: (task: Task) => void
  onOpenObstacleDialog: (task: Task) => void
  onStartInlineTitleEdit: (task: Task) => void
  onStatusChange: (taskId: string, status: string) => void
  onOpenEditChild: (parentId: string) => void
  onDeleteTaskFromContextMenu: (task: Task) => void
  onMarkCriticalPathAttention?: (taskId: string) => void
  onInsertBeforeChain?: (taskId: string) => void
  onInsertAfterChain?: (taskId: string) => void
  onRemoveCriticalPathOverride?: (taskId: string, mode?: 'manual_attention' | 'manual_insert') => void
}) {
  const hasManualAttentionOverride = Boolean(contextMenu.hasManualAttentionOverride)
  const hasManualInsertOverride = Boolean(contextMenu.hasManualInsertOverride)
  const menuWidth = 280
  const menuMaxHeight = 520
  const viewportWidth = typeof window === 'undefined' ? 1440 : window.innerWidth
  const viewportHeight = typeof window === 'undefined' ? 900 : window.innerHeight
  const left = Math.min(Math.max(contextMenu.x, 8), Math.max(8, viewportWidth - menuWidth - 8))
  const top = Math.min(Math.max(contextMenu.y, 8), Math.max(8, viewportHeight - menuMaxHeight - 8))
  const itemClass = 'h-auto w-full justify-start rounded-lg px-3 py-2 text-left transition-colors duration-150 hover:bg-slate-50'
  const itemBodyClass = 'flex min-w-0 flex-col items-start leading-5'
  const iconClass = 'mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-500'
  const groupLabelClass = 'px-3 pb-1 pt-2 text-xs font-semibold text-slate-500'

  return (
    <>
      <button
        type="button"
        aria-label="关闭任务操作菜单"
        className="fixed left-0 top-0 z-40 h-screen w-screen bg-transparent p-0"
        data-testid="gantt-task-context-menu-overlay"
        onClick={onClose}
        onContextMenu={(event) => {
          event.preventDefault()
          onClose()
        }}
      />
      <div
        className="fixed z-50 max-h-[32.5rem] w-72 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-2 text-sm shadow-[var(--el-3)]"
        data-testid="gantt-task-context-menu"
        role="menu"
        style={{ left, top }}
      >
        <div className={groupLabelClass}>编辑操作</div>
        <Button variant="ghost"
          className={`${itemClass} text-slate-700 flex items-start gap-2`}
          data-testid="gantt-task-context-menu-edit"
          onClick={() => {
            onOpenEditDialog(contextMenu.task)
            onClose()
          }}
        >
          <Pencil className={iconClass} />
          <span className={itemBodyClass}>编辑任务</span>
        </Button>
        <Button variant="ghost"
          className={`${itemClass} text-slate-700 flex items-start gap-2`}
          data-testid="gantt-task-context-menu-conditions"
          onClick={() => {
            onOpenConditionDialog(contextMenu.task)
            onClose()
          }}
        >
          <ShieldCheck className={iconClass} />
          <span className={itemBodyClass}>开工条件</span>
        </Button>
        <Button variant="ghost"
          className={`${itemClass} text-slate-700 flex items-start gap-2`}
          data-testid="gantt-task-context-menu-obstacles"
          onClick={() => {
            onOpenObstacleDialog(contextMenu.task)
            onClose()
          }}
        >
          <AlertOctagon className={iconClass} />
          <span className={itemBodyClass}>进行中阻碍</span>
        </Button>
        <Separator className="my-1" />
        <div className={groupLabelClass}>层级操作</div>
        <Button variant="ghost"
          className={`${itemClass} text-slate-700 flex items-start gap-2`}
          data-testid="gantt-task-context-menu-add-child"
          onClick={() => {
            onOpenEditChild(contextMenu.task.id)
            onClose()
          }}
        >
          <Plus className={iconClass} />
          <span className={itemBodyClass}>添加子任务</span>
        </Button>
        <Button variant="ghost"
          className={`${itemClass} text-slate-700 flex items-start gap-2`}
          data-testid="gantt-task-context-menu-rename"
          onClick={() => {
            onStartInlineTitleEdit(contextMenu.task)
            onClose()
          }}
        >
          <Pencil className={iconClass} />
          <span className={itemBodyClass}>快速改名</span>
        </Button>
        {contextMenu.task.status !== 'completed' && (
          <Button variant="ghost"
            className={`${itemClass} text-slate-700 flex items-start gap-2`}
            data-testid="gantt-task-context-menu-mark-completed"
            onClick={() => {
              onStatusChange(contextMenu.task.id, 'completed')
              onClose()
            }}
          >
            <CheckCircle2 className={iconClass} />
            <span className={itemBodyClass}>标记完成</span>
          </Button>
        )}
        <Separator className="my-1" />
        <div className={groupLabelClass}>关键路径操作</div>
        {onMarkCriticalPathAttention && (
          <Button variant="ghost"
            className={`${itemClass} text-slate-700 flex items-start gap-2`}
            data-testid="gantt-task-context-menu-mark-critical"
            onClick={() => {
              onMarkCriticalPathAttention(contextMenu.task.id)
              onClose()
            }}
          >
            <GitBranch className={iconClass} />
            <span className={itemBodyClass}>
              <span>标记关键路径关注</span>
              <span className="text-xs text-slate-500">纳入重点跟踪，不改变依赖关系</span>
            </span>
          </Button>
        )}
        {onInsertBeforeChain && (
          <Button variant="ghost"
            className={`${itemClass} text-slate-700 flex items-start gap-2`}
            data-testid="gantt-task-context-menu-insert-before"
            onClick={() => {
              onInsertBeforeChain(contextMenu.task.id)
              onClose()
            }}
          >
            <GitBranch className={iconClass} />
            <span className={itemBodyClass}>
              <span>插到主链前面</span>
              <span className="text-xs text-slate-500">以当前任务作为前置插链候选</span>
            </span>
          </Button>
        )}
        {onInsertAfterChain && (
          <Button variant="ghost"
            className={`${itemClass} text-slate-700 flex items-start gap-2`}
            data-testid="gantt-task-context-menu-insert-after"
            onClick={() => {
              onInsertAfterChain(contextMenu.task.id)
              onClose()
            }}
          >
            <GitBranch className={iconClass} />
            <span className={itemBodyClass}>
              <span>插到主链后面</span>
              <span className="text-xs text-slate-500">以当前任务作为后续插链候选</span>
            </span>
          </Button>
        )}
        {onRemoveCriticalPathOverride && !hasManualAttentionOverride && !hasManualInsertOverride && (
          <Button variant="ghost"
            className={`${itemClass} text-slate-700 flex items-start gap-2`}
            data-testid="gantt-task-context-menu-remove-critical"
            onClick={() => {
              onRemoveCriticalPathOverride(contextMenu.task.id)
              onClose()
            }}
          >
            <GitBranch className={iconClass} />
            <span className={itemBodyClass}>
              <span>取消手动标记</span>
              <span className="text-xs text-slate-500">移除该任务的关键路径人工覆盖</span>
            </span>
          </Button>
        )}
        {onRemoveCriticalPathOverride && hasManualAttentionOverride && (
          <Button variant="ghost"
            className={`${itemClass} text-slate-700 flex items-start gap-2`}
            data-testid="gantt-task-context-menu-remove-critical-attention"
            onClick={() => {
              onRemoveCriticalPathOverride(contextMenu.task.id, 'manual_attention')
              onClose()
            }}
          >
            <GitBranch className={iconClass} />
            <span className={itemBodyClass}>
              <span>取消关注</span>
              <span className="text-xs text-slate-500">保留自动计算结果，仅撤销关注</span>
            </span>
          </Button>
        )}
        {onRemoveCriticalPathOverride && hasManualInsertOverride && (
          <Button variant="ghost"
            className={`${itemClass} text-slate-700 flex items-start gap-2`}
            data-testid="gantt-task-context-menu-remove-critical-insert"
            onClick={() => {
              onRemoveCriticalPathOverride(contextMenu.task.id, 'manual_insert')
              onClose()
            }}
          >
            <GitBranch className={iconClass} />
            <span className={itemBodyClass}>
              <span>取消插链</span>
              <span className="text-xs text-slate-500">移除人工插链关系并恢复自动链路</span>
            </span>
          </Button>
        )}
        <Separator className="my-1" />
        <div className={groupLabelClass}>危险操作</div>
        <Button variant="ghost"
          className={`${itemClass} text-red-600 flex items-start gap-2 hover:bg-red-50`}
          data-testid="gantt-task-context-menu-delete"
          onClick={() => {
            onDeleteTaskFromContextMenu(contextMenu.task)
            onClose()
          }}
        >
          <Trash2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span className={itemBodyClass}>
            <span>删除任务</span>
            <span className="text-xs text-red-400">将进入删除确认与保护校验</span>
          </span>
        </Button>
      </div>
    </>
  )
}
