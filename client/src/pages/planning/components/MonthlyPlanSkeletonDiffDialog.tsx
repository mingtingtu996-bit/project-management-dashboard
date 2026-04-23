import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { Task } from '@/pages/GanttViewTypes'
import type { MonthlyPlanItem } from '@/types/planning'
import { formatDate } from '../planningShared'

interface MonthlyPlanSkeletonDiffDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  items: MonthlyPlanItem[]
  tasks: Task[]
}

interface DiffRow {
  id: string
  title: string
  before: string
  after: string
}

function buildDiffRows(items: MonthlyPlanItem[], tasks: Task[]): DiffRow[] {
  const taskMap = new Map(tasks.map((task) => [task.id, task]))

  return items
    .map((item) => {
      const task = item.source_task_id ? taskMap.get(item.source_task_id) : null
      if (!task) {
        return {
          id: item.id,
          title: item.title,
          before: '当前主骨架中暂无映射条目',
          after: `${item.title} · ${formatDate(item.planned_start_date) ?? '—'} - ${formatDate(item.planned_end_date) ?? '—'}`,
        }
      }

      const taskDateRange = `${formatDate(task.planned_start_date ?? task.start_date) ?? '—'} - ${formatDate(task.planned_end_date ?? task.end_date) ?? '—'}`
      const planDateRange = `${formatDate(item.planned_start_date) ?? '—'} - ${formatDate(item.planned_end_date) ?? '—'}`
      const taskProgress = typeof task.progress === 'number' ? `${task.progress}%` : '—'
      const planProgress = typeof item.target_progress === 'number' ? `${item.target_progress}%` : '—'

      const before = `${task.title ?? task.name ?? '未命名任务'} · ${taskDateRange} · 当前 ${taskProgress}`
      const after = `${item.title} · ${planDateRange} · 目标 ${planProgress}`

      if (before === after) return null
      return {
        id: item.id,
        title: item.title,
        before,
        after,
      }
    })
    .filter((row): row is DiffRow => Boolean(row))
}

export function MonthlyPlanSkeletonDiffDialog({
  open,
  onOpenChange,
  items,
  tasks,
}: MonthlyPlanSkeletonDiffDialogProps) {
  const rows = buildDiffRows(items, tasks)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="monthly-plan-skeleton-diff-dialog" className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>查看与主骨架差异</DialogTitle>
          <DialogDescription>
            对比当前月计划与主任务骨架的时间、标题和目标进度差异，方便在查看态快速确认偏移范围。
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Badge variant="outline">差异 {rows.length} 项</Badge>
          </div>
          {rows.length === 0 ? (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
              当前月计划与主骨架没有可见差异。
            </div>
          ) : (
            rows.map((row) => (
              <div key={row.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="text-sm font-medium text-slate-900">{row.title}</div>
                <div className="mt-3 grid gap-3 lg:grid-cols-2">
                  <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
                    <div className="text-xs text-slate-500">主骨架</div>
                    <div className="mt-1 text-sm leading-6 text-slate-700">{row.before}</div>
                  </div>
                  <div className="rounded-xl border border-cyan-100 bg-cyan-50 px-3 py-2">
                    <div className="text-xs text-cyan-700">当前月计划</div>
                    <div className="mt-1 text-sm leading-6 text-cyan-900">{row.after}</div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default MonthlyPlanSkeletonDiffDialog
