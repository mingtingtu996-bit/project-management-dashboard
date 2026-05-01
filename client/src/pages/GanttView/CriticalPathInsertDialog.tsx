import { useEffect, useMemo, useState } from 'react'

import { EmptyState } from '@/components/EmptyState'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import type { CriticalPathOverrideInput, CriticalPathSnapshot } from '@/lib/criticalPath'

import type { Task } from '../GanttViewTypes'

type InsertDirection = 'before' | 'after'

interface CriticalPathInsertDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  anchorTask: Task | null
  direction: InsertDirection
  tasks: Task[]
  snapshot: CriticalPathSnapshot | null
  actionLoading?: boolean
  onCreateOverride: (input: CriticalPathOverrideInput) => void | Promise<void>
}

function getTaskLabel(task: Task | null | undefined) {
  if (!task) return '未知任务'
  return task.title || task.name || task.id
}

export function CriticalPathInsertDialog({
  open,
  onOpenChange,
  anchorTask,
  direction,
  tasks,
  snapshot,
  actionLoading,
  onCreateOverride,
}: CriticalPathInsertDialogProps) {
  const [searchText, setSearchText] = useState('')
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)

  const eligibleTasks = useMemo(() => {
    const displayTaskIds = new Set(snapshot?.displayTaskIds ?? [])
    const anchorTaskId = anchorTask?.id ?? null
    return tasks.filter((task) => task.id !== anchorTaskId && !displayTaskIds.has(task.id))
  }, [anchorTask?.id, snapshot?.displayTaskIds, tasks])

  const filteredTasks = useMemo(() => {
    const query = searchText.trim().toLowerCase()
    if (!query) return eligibleTasks

    return eligibleTasks.filter((task) => {
      const haystack = [task.title, task.name, task.id]
        .filter((value): value is string => Boolean(value))
        .join(' ')
        .toLowerCase()
      return haystack.includes(query)
    })
  }, [eligibleTasks, searchText])

  useEffect(() => {
    if (!open) return
    setSearchText('')
    setSelectedTaskId(eligibleTasks[0]?.id ?? null)
  }, [eligibleTasks, open, anchorTask?.id, direction])

  useEffect(() => {
    if (!open) return
    if (filteredTasks.length === 0) {
      setSelectedTaskId(null)
      return
    }
    if (!selectedTaskId || !filteredTasks.some((task) => task.id === selectedTaskId)) {
      setSelectedTaskId(filteredTasks[0].id)
    }
  }, [filteredTasks, open, selectedTaskId])

  const selectedTask = filteredTasks.find((task) => task.id === selectedTaskId) ?? null
  const isBefore = direction === 'before'
  const anchorLabel = getTaskLabel(anchorTask)
  const submitLabel = isBefore ? '插到锚点前面' : '插到锚点后面'

  const handleSubmit = async () => {
    if (!anchorTask || !selectedTask) return
    await onCreateOverride({
      taskId: selectedTask.id,
      mode: 'manual_insert',
      anchorType: isBefore ? 'before' : 'after',
      leftTaskId: isBefore ? null : anchorTask.id,
      rightTaskId: isBefore ? anchorTask.id : null,
      reason: `来自任务右键菜单：${anchorLabel}`,
    })
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto rounded-2xl shadow-[var(--el-4)]" data-testid="critical-path-insert-dialog">
        <DialogHeader>
          <DialogTitle>选择要插入主链的任务</DialogTitle>
          <DialogDescription className="sr-only">
            为当前锚点任务选择一个非主链任务，并提交手动插链覆盖
          </DialogDescription>
          <div className="text-xs text-muted-foreground">
            锚点任务：{anchorLabel}，方向：{isBefore ? '插到前面' : '插到后面'}
          </div>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Input
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              aria-label="搜索要插入关键路径的任务"
              placeholder="搜索要插入的任务名、责任人或编号"
              data-testid="critical-path-insert-search"
            />
            <div className="text-xs text-muted-foreground">
              仅展示不在当前显示链中的任务，方便直接挑选要插入的对象。
            </div>
          </div>

          <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
            {filteredTasks.length === 0 ? (
              <EmptyState
                variant="filter"
                title="没有找到可插入的任务"
                description="当前筛选下没有未展示在链路中的可选任务。"
                className="rounded-xl empty-state-frame border-slate-200 bg-slate-50 py-8"
              />
            ) : (
              filteredTasks.map((task) => {
                const active = selectedTaskId === task.id
                return (
                  <Button variant="ghost"
                    key={task.id}
                    type="button"
                    onClick={() => setSelectedTaskId(task.id)}
                    data-testid={`critical-path-insert-task-${task.id}`}
                    className={`w-full rounded-2xl border px-4 py-3 text-left transition-colors ${
                      active
                        ? 'border-blue-400 bg-blue-50'
                        : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-slate-900">{getTaskLabel(task)}</div>
                        <div className="mt-0.5 text-xs text-slate-500">任务 ID：{task.id}</div>
                      </div>
                      <span className="max-w-44 shrink-0 truncate text-xs text-slate-500" title={task.status || '未设置状态'}>
                        {task.status ? `状态：${task.status}` : '未设置状态'}
                      </span>
                    </div>
                  </Button>
                )
              })
            )}
          </div>

          <div className="flex items-center justify-between gap-2">
            <div className="text-xs text-slate-500">
              当前已选：{selectedTask ? getTaskLabel(selectedTask) : '未选择'}
            </div>
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={actionLoading}>
                取消
              </Button>
              <Button
                type="button"
                onClick={() => void handleSubmit()}
                disabled={!anchorTask || !selectedTask}
                loading={actionLoading}
                data-testid="critical-path-insert-submit"
              >
                {submitLabel}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
