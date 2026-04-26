import { AlertOctagon, CheckCircle2, GitBranch, Plus, ShieldCheck, Trash2 } from 'lucide-react'

import type { Task } from './GanttViewTypes'

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

  return (
    <>
      <div
        className="fixed inset-0 z-40"
        data-testid="gantt-task-context-menu-overlay"
        onClick={onClose}
        onContextMenu={(event) => {
          event.preventDefault()
          onClose()
        }}
      />
      <div
        className="fixed z-50 bg-white rounded-xl shadow-lg border border-gray-200 py-1 min-w-[160px] text-sm"
        data-testid="gantt-task-context-menu"
        role="menu"
        style={{ left: contextMenu.x, top: contextMenu.y }}
      >
        <button
          className="w-full text-left px-3 py-1.5 hover:bg-gray-50 text-gray-700 flex items-center gap-2"
          data-testid="gantt-task-context-menu-edit"
          onClick={() => {
            onOpenEditDialog(contextMenu.task)
            onClose()
          }}
        >
          <svg className="h-3.5 w-3.5 text-gray-400" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487zm0 0L19.5 7.125" />
          </svg>
          编辑任务
        </button>
        <button
          className="w-full text-left px-3 py-1.5 hover:bg-green-50 text-green-700 flex items-center gap-2"
          data-testid="gantt-task-context-menu-conditions"
          onClick={() => {
            onOpenConditionDialog(contextMenu.task)
            onClose()
          }}
        >
          <ShieldCheck className="h-3.5 w-3.5" />
          开工条件
        </button>
        <button
          className="w-full text-left px-3 py-1.5 hover:bg-amber-50 text-amber-700 flex items-center gap-2"
          data-testid="gantt-task-context-menu-obstacles"
          onClick={() => {
            onOpenObstacleDialog(contextMenu.task)
            onClose()
          }}
        >
          <AlertOctagon className="h-3.5 w-3.5" />
          进行中阻碍
        </button>
        <div className="my-1 border-t border-gray-100" />
        <button
          className="w-full text-left px-3 py-1.5 hover:bg-blue-50 text-blue-700 flex items-center gap-2"
          data-testid="gantt-task-context-menu-add-child"
          onClick={() => {
            onOpenEditChild(contextMenu.task.id)
            onClose()
          }}
        >
          <Plus className="h-3.5 w-3.5" />
          添加子任务
        </button>
        <button
          className="w-full text-left px-3 py-1.5 hover:bg-gray-50 text-gray-700 flex items-center gap-2"
          data-testid="gantt-task-context-menu-rename"
          onClick={() => {
            onStartInlineTitleEdit(contextMenu.task)
            onClose()
          }}
        >
          <svg className="h-3.5 w-3.5 text-gray-400" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487zm0 0L19.5 7.125" />
          </svg>
          快速改名
        </button>
        <div className="my-1 border-t border-gray-100" />
        {contextMenu.task.status !== 'completed' && (
          <button
            className="w-full text-left px-3 py-1.5 hover:bg-emerald-50 text-emerald-700 flex items-center gap-2"
            data-testid="gantt-task-context-menu-mark-completed"
            onClick={() => {
              onStatusChange(contextMenu.task.id, 'completed')
              onClose()
            }}
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            标记完成
          </button>
        )}
        <div className="my-1 border-t border-gray-100" />
        {onMarkCriticalPathAttention && (
          <button
            className="w-full text-left px-3 py-1.5 hover:bg-violet-50 text-violet-700 flex items-center gap-2"
            data-testid="gantt-task-context-menu-mark-critical"
            onClick={() => {
              onMarkCriticalPathAttention(contextMenu.task.id)
              onClose()
            }}
          >
            <GitBranch className="h-3.5 w-3.5" />
            标记关键路径关注
          </button>
        )}
        {(onInsertBeforeChain || onInsertAfterChain || onRemoveCriticalPathOverride) && (
          <div className="my-1 border-t border-gray-100" />
        )}
        {onInsertBeforeChain && (
          <button
            className="w-full text-left px-3 py-1.5 hover:bg-indigo-50 text-indigo-700 flex items-center gap-2"
            data-testid="gantt-task-context-menu-insert-before"
            onClick={() => {
              onInsertBeforeChain(contextMenu.task.id)
              onClose()
            }}
          >
            <GitBranch className="h-3.5 w-3.5" />
            插到主链前面
          </button>
        )}
        {onInsertAfterChain && (
          <button
            className="w-full text-left px-3 py-1.5 hover:bg-indigo-50 text-indigo-700 flex items-center gap-2"
            data-testid="gantt-task-context-menu-insert-after"
            onClick={() => {
              onInsertAfterChain(contextMenu.task.id)
              onClose()
            }}
          >
            <GitBranch className="h-3.5 w-3.5" />
            插到主链后面
          </button>
        )}
        {onRemoveCriticalPathOverride && !hasManualAttentionOverride && !hasManualInsertOverride && (
          <button
            className="w-full text-left px-3 py-1.5 hover:bg-slate-50 text-slate-600 flex items-center gap-2"
            data-testid="gantt-task-context-menu-remove-critical"
            onClick={() => {
              onRemoveCriticalPathOverride(contextMenu.task.id)
              onClose()
            }}
          >
            <GitBranch className="h-3.5 w-3.5" />
            取消手动标记
          </button>
        )}
        {onRemoveCriticalPathOverride && hasManualAttentionOverride && (
          <button
            className="w-full text-left px-3 py-1.5 hover:bg-slate-50 text-slate-600 flex items-center gap-2"
            data-testid="gantt-task-context-menu-remove-critical-attention"
            onClick={() => {
              onRemoveCriticalPathOverride(contextMenu.task.id, 'manual_attention')
              onClose()
            }}
          >
            <GitBranch className="h-3.5 w-3.5" />
            取消关注
          </button>
        )}
        {onRemoveCriticalPathOverride && hasManualInsertOverride && (
          <button
            className="w-full text-left px-3 py-1.5 hover:bg-slate-50 text-slate-600 flex items-center gap-2"
            data-testid="gantt-task-context-menu-remove-critical-insert"
            onClick={() => {
              onRemoveCriticalPathOverride(contextMenu.task.id, 'manual_insert')
              onClose()
            }}
          >
            <GitBranch className="h-3.5 w-3.5" />
            取消插链
          </button>
        )}
        <button
          className="w-full text-left px-3 py-1.5 hover:bg-red-50 text-red-600 flex items-center gap-2"
          data-testid="gantt-task-context-menu-delete"
          onClick={() => {
            onDeleteTaskFromContextMenu(contextMenu.task)
            onClose()
          }}
        >
          <Trash2 className="h-3.5 w-3.5" />
          删除任务
        </button>
      </div>
    </>
  )
}
