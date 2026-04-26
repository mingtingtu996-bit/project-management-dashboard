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
import { formatDate, type MonthlyPlanChangeSummary } from '../planningShared'

interface MonthlyPlanSkeletonDiffDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  items: MonthlyPlanItem[]
  tasks: Task[]
  summary?: MonthlyPlanChangeSummary | null
}

interface DiffRow {
  id: string
  title: string
  before: string
  after: string
  kind: 'added' | 'removed' | 'date' | 'progress'
}

interface DiffSection {
  key: 'added' | 'removed' | 'date' | 'progress'
  title: string
  description: string
  badge: string
  rows: DiffRow[]
}

function buildDiffSections(items: MonthlyPlanItem[], tasks: Task[]): DiffSection[] {
  const taskMap = new Map(tasks.map((task) => [task.id, task]))
  const mappedTaskIds = new Set<string>()
  const addedRows: DiffRow[] = []
  const removedRows: DiffRow[] = []
  const dateRows: DiffRow[] = []
  const progressRows: DiffRow[] = []

  for (const item of items) {
    const task = item.source_task_id ? taskMap.get(item.source_task_id) : null
    if (!task) {
      addedRows.push({
        id: item.id,
        title: item.title,
        before: '当前主骨架中暂无映射条目',
        after: `${item.title} · ${formatDate(item.planned_start_date) ?? '—'} - ${formatDate(item.planned_end_date) ?? '—'}`,
        kind: 'added',
      })
      continue
    }

    mappedTaskIds.add(task.id)

    const taskDateRange = `${formatDate(task.planned_start_date ?? task.start_date) ?? '—'} - ${formatDate(task.planned_end_date ?? task.end_date) ?? '—'}`
    const planDateRange = `${formatDate(item.planned_start_date) ?? '—'} - ${formatDate(item.planned_end_date) ?? '—'}`
    const taskProgress = typeof task.progress === 'number' ? `${task.progress}%` : '—'
    const planProgress = typeof item.target_progress === 'number' ? `${item.target_progress}%` : '—'

    const before = `${task.title ?? task.name ?? '未命名任务'} · ${taskDateRange} · 当前 ${taskProgress}`
    const after = `${item.title} · ${planDateRange} · 目标 ${planProgress}`

    if (taskDateRange !== planDateRange) {
      dateRows.push({
        id: `${item.id}:date`,
        title: item.title,
        before,
        after,
        kind: 'date',
      })
    }

    if (taskProgress !== planProgress) {
      progressRows.push({
        id: `${item.id}:progress`,
        title: item.title,
        before,
        after,
        kind: 'progress',
      })
    }
  }

  for (const task of tasks) {
    if (mappedTaskIds.has(task.id)) continue
    removedRows.push({
      id: `removed:${task.id}`,
      title: task.title ?? task.name ?? '未命名任务',
      before: `${task.title ?? task.name ?? '未命名任务'} · ${formatDate(task.planned_start_date ?? task.start_date) ?? '—'} - ${formatDate(task.planned_end_date ?? task.end_date) ?? '—'} · 当前 ${typeof task.progress === 'number' ? `${task.progress}%` : '—'}`,
      after: '已从月计划中移出',
      kind: 'removed',
    })
  }

  return [
    {
      key: 'added',
      title: '新增',
      description: '月计划中新增但主骨架里尚未映射的条目。',
      badge: String(addedRows.length),
      rows: addedRows,
    },
    {
      key: 'removed',
      title: '移出',
      description: '主骨架里存在但当前月计划已移出的条目。',
      badge: String(removedRows.length),
      rows: removedRows,
    },
    {
      key: 'date',
      title: '时间调整',
      description: '计划开始或结束日期与当前任务不同的条目。',
      badge: String(dateRows.length),
      rows: dateRows,
    },
    {
      key: 'progress',
      title: '进度调整',
      description: '目标进度与当前任务不同的条目。',
      badge: String(progressRows.length),
      rows: progressRows,
    },
  ]
}

export function MonthlyPlanSkeletonDiffDialog({
  open,
  onOpenChange,
  items,
  tasks,
  summary: summaryProp,
}: MonthlyPlanSkeletonDiffDialogProps) {
  const sections = buildDiffSections(items, tasks)
  const summary = summaryProp ?? {
    addedCount: sections.find((section) => section.key === 'added')?.rows.length ?? 0,
    removedCount: sections.find((section) => section.key === 'removed')?.rows.length ?? 0,
    dateShiftCount: sections.find((section) => section.key === 'date')?.rows.length ?? 0,
    progressAdjustmentCount: sections.find((section) => section.key === 'progress')?.rows.length ?? 0,
    milestoneAdjustCount: 0,
    totalChangeCount:
      (sections.find((section) => section.key === 'added')?.rows.length ?? 0) +
      (sections.find((section) => section.key === 'removed')?.rows.length ?? 0) +
      (sections.find((section) => section.key === 'date')?.rows.length ?? 0) +
      (sections.find((section) => section.key === 'progress')?.rows.length ?? 0),
    threshold: 0,
    isLargeScale: false,
  }

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
          <div className="grid gap-2 md:grid-cols-4">
            <Badge variant="outline" className="justify-start rounded-2xl px-3 py-2">
              新增 {summary.addedCount} 项
            </Badge>
            <Badge variant="outline" className="justify-start rounded-2xl px-3 py-2">
              移出 {summary.removedCount} 项
            </Badge>
            <Badge variant="outline" className="justify-start rounded-2xl px-3 py-2">
              时间调整 {summary.dateShiftCount} 项
            </Badge>
            <Badge variant="outline" className="justify-start rounded-2xl px-3 py-2">
              进度调整 {summary.progressAdjustmentCount} 项
            </Badge>
          </div>
          {sections.every((section) => section.rows.length === 0) ? (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
              当前月计划与主骨架没有可见差异。
            </div>
          ) : (
            sections.map((section) =>
              section.rows.length > 0 ? (
                <div key={section.key} className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="space-y-1">
                      <div className="text-sm font-semibold text-slate-900">{section.title}</div>
                      <div className="text-xs leading-5 text-slate-500">{section.description}</div>
                    </div>
                    <Badge variant="outline">{section.badge} 项</Badge>
                  </div>
                  <div className="space-y-3">
                    {section.rows.map((row) => (
                      <div key={row.id} className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                        <div className="text-sm font-medium text-slate-900">{row.title}</div>
                        <div className="mt-3 grid gap-3 lg:grid-cols-2">
                          <div className="rounded-xl border border-slate-100 bg-white px-3 py-2">
                            <div className="text-xs text-slate-500">主骨架</div>
                            <div className="mt-1 text-sm leading-6 text-slate-700">{row.before}</div>
                          </div>
                          <div className="rounded-xl border border-cyan-100 bg-cyan-50 px-3 py-2">
                            <div className="text-xs text-cyan-700">当前月计划</div>
                            <div className="mt-1 text-sm leading-6 text-cyan-900">{row.after}</div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null,
            )
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default MonthlyPlanSkeletonDiffDialog
