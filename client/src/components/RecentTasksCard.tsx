import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertCircle, CheckCircle2, ChevronRight, ChevronsUpDown, Clock, UserRound } from 'lucide-react'

import { CardHead } from '@/components/ui/card-head'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { safeJsonParse, safeStorageGet } from '@/lib/browserStorage'
import { getTaskDisplayStatus, isCompletedTask } from '@/lib/taskBusinessStatus'
import { cn } from '@/lib/utils'

interface RawTask {
  id: string
  title?: string
  name?: string
  status?: string
  progress?: number
  assignee?: string
  assignee_name?: string
  assignee_unit?: string
  end_date?: string | null
  planned_end_date?: string | null
  project_id?: string
  updated_at?: string
}

interface TaskWithDue {
  id: string
  title: string
  status: 'pending' | 'in_progress' | 'blocked' | 'completed'
  progress: number
  assignee?: string
  assignee_unit?: string
  end_date?: string
  days_until_due: number | null
  due_status: 'overdue' | 'urgent' | 'approaching' | 'normal'
  due_label: string
  updated_at?: string
}

interface TaskStats {
  total: number
  overdue: number
  urgent: number
  approaching: number
  normal: number
}

type FilterType = 'all' | '7days' | 'overdue' | 'urgent'

interface RecentTasksCardProps {
  projectId: string
  tasks?: RawTask[]
  onViewAll?: () => void
}

const FILTER_OPTIONS = [
  { value: 'all', label: '全部' },
  { value: '7days', label: '7天内' },
  { value: 'overdue', label: '已延期' },
  { value: 'urgent', label: '紧急' },
] as const

function getProgressColorClass(dueStatus: TaskWithDue['due_status']) {
  switch (dueStatus) {
    case 'overdue':
      return 'bg-rose-500'
    case 'urgent':
      return 'bg-amber-500'
    case 'approaching':
      return 'bg-blue-600'
    default:
      return 'bg-emerald-500'
  }
}

function getPriorityDotClass(dueStatus: TaskWithDue['due_status']) {
  switch (dueStatus) {
    case 'overdue':
      return 'bg-rose-500'
    case 'urgent':
      return 'bg-amber-500'
    case 'approaching':
      return 'bg-blue-500'
    default:
      return 'bg-slate-300'
  }
}

function buildDueMeta(task: RawTask) {
  const rawEndDate = task.planned_end_date || task.end_date
  const endDate = rawEndDate ? rawEndDate.split('T')[0] : null

  if (!endDate) {
    return {
      endDate: undefined,
      daysUntilDue: null,
      dueStatus: 'normal' as const,
      dueLabel: '--',
    }
  }

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const target = new Date(endDate)
  target.setHours(0, 0, 0, 0)

  const diff = Math.ceil((target.getTime() - today.getTime()) / 86400000)
  if (diff < 0) {
    return {
      endDate,
      daysUntilDue: diff,
      dueStatus: 'overdue' as const,
      dueLabel: `延期 ${Math.abs(diff)}天`,
    }
  }

  if (diff === 0) {
    return {
      endDate,
      daysUntilDue: diff,
      dueStatus: 'urgent' as const,
      dueLabel: '今天截止',
    }
  }

  if (diff <= 3) {
    return {
      endDate,
      daysUntilDue: diff,
      dueStatus: 'urgent' as const,
      dueLabel: `${diff}天后`,
    }
  }

  if (diff <= 7) {
    return {
      endDate,
      daysUntilDue: diff,
      dueStatus: 'approaching' as const,
      dueLabel: `${diff}天后`,
    }
  }

  return {
    endDate,
    daysUntilDue: diff,
    dueStatus: 'normal' as const,
    dueLabel: `${diff}天后`,
  }
}

function buildTaskStats(tasks: TaskWithDue[]): TaskStats {
  return {
    total: tasks.length,
    overdue: tasks.filter((task) => task.due_status === 'overdue').length,
    urgent: tasks.filter((task) => task.due_status === 'urgent').length,
    approaching: tasks.filter((task) => task.due_status === 'approaching').length,
    normal: tasks.filter((task) => task.due_status === 'normal').length,
  }
}

function formatDate(value?: string) {
  if (!value) return '--'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })
}

function AssigneeAvatar({ name }: { name?: string }) {
  const initial = name?.trim().slice(0, 1) || '—'
  return (
    <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-[11px] font-medium text-slate-500">
      {initial}
    </span>
  )
}

export default function RecentTasksCard({ projectId, tasks: sourceTasks, onViewAll }: RecentTasksCardProps) {
  const [tasks, setTasks] = useState<TaskWithDue[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeFilter, setActiveFilter] = useState<FilterType>('all')

  const fetchPendingTasks = useCallback(async (prefetchedTasks?: RawTask[]) => {
    try {
      setLoading(true)
      setError(null)

      let rawTasks: RawTask[] = []
      if (prefetchedTasks !== undefined) {
        rawTasks = prefetchedTasks.filter((task) => task.project_id === projectId || !task.project_id)
      } else {
        try {
          const response = await fetch(`/api/tasks?projectId=${projectId}&limit=20`)
          const payload = await response.json().catch(() => ({}))
          if (!response.ok || !payload.success) {
            throw new Error(payload?.error?.message || `获取任务失败 (${response.status})`)
          }
          rawTasks = payload.data || []
        } catch {
          const stored = safeStorageGet(localStorage, 'pm_tasks')
          const allTasks = safeJsonParse<RawTask[]>(stored, [], 'pm_tasks')
          rawTasks = allTasks.filter((task) => task.project_id === projectId)
        }
      }

      const pendingTasks = rawTasks
        .filter((task) => !isCompletedTask(task))
        .map((task): TaskWithDue => {
          const dueMeta = buildDueMeta(task)

          return {
            id: task.id,
            title: task.title || task.name || '（无标题）',
            status: getTaskDisplayStatus(task),
            progress: Number(task.progress ?? 0),
            assignee: task.assignee_name || task.assignee,
            assignee_unit: task.assignee_unit,
            end_date: dueMeta.endDate,
            days_until_due: dueMeta.daysUntilDue,
            due_status: dueMeta.dueStatus,
            due_label: dueMeta.dueLabel,
            updated_at: task.updated_at,
          }
        })
        .sort((left, right) => {
          const order = { overdue: 0, urgent: 1, approaching: 2, normal: 3 }
          return order[left.due_status] - order[right.due_status]
        })
        .slice(0, 10)

      setTasks(pendingTasks)
    } catch (fetchError: unknown) {
      if (import.meta.env.DEV) {
        console.error('获取待完成任务失败', fetchError)
      }
      setError(fetchError instanceof Error ? fetchError.message : '获取任务失败')
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    void fetchPendingTasks(sourceTasks)
  }, [fetchPendingTasks, sourceTasks])

  const filteredTasks = useMemo(() => {
    switch (activeFilter) {
      case '7days':
        return tasks.filter((task) => task.days_until_due != null && task.days_until_due >= 0 && task.days_until_due <= 7)
      case 'overdue':
        return tasks.filter((task) => task.due_status === 'overdue')
      case 'urgent':
        return tasks.filter((task) => task.due_status === 'urgent' || task.due_status === 'overdue')
      default:
        return tasks
    }
  }, [activeFilter, tasks])

  const stats = useMemo(() => buildTaskStats(tasks), [tasks])
  const visibleTasks = filteredTasks.slice(0, 6)

  return (
    <section className="surface-card p-5">
      <CardHead
        eyebrow="FOCUS"
        title="一周重点关注任务"
        action={
          <Link
            to={projectId ? `/projects/${projectId}/gantt` : '/company'}
            className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 transition-colors hover:text-blue-800"
            onClick={onViewAll}
          >
            全部任务
            <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        }
      />

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <SegmentedControl
          options={FILTER_OPTIONS.map((option) => ({ value: option.value, label: option.label }))}
          value={activeFilter}
          onChange={(value) => setActiveFilter(value as FilterType)}
        />
        <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-500">
          {stats.overdue > 0 ? <span className="inline-flex items-center gap-1.5 text-rose-600"><span className="h-1.5 w-1.5 rounded-full bg-rose-500" />延期 {stats.overdue}</span> : null}
          {stats.urgent > 0 ? <span className="inline-flex items-center gap-1.5 text-amber-600"><span className="h-1.5 w-1.5 rounded-full bg-amber-500" />紧急 {stats.urgent}</span> : null}
          {stats.approaching > 0 ? <span className="inline-flex items-center gap-1.5 text-blue-600"><span className="h-1.5 w-1.5 rounded-full bg-blue-500" />7天内 {stats.approaching}</span> : null}
        </div>
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse">
          <thead>
            <tr className="border-b border-gray-200">
              {['优先级', '任务', '负责人', '截止', '进度', ''].map((label) => (
                <th key={label || 'action'} className="group py-2 pr-4 text-left text-[10.5px] font-semibold uppercase tracking-[0.08em] text-slate-400">
                  <span className="inline-flex items-center gap-1">
                    {label}
                    {label ? <ChevronsUpDown className="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-100" strokeWidth={1.5} /> : null}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              [0, 1, 2].map((item) => (
                <tr key={item} className="border-b border-slate-100">
                  <td colSpan={6} className="py-3">
                    <Skeleton className="h-7 w-full rounded-md bg-slate-100" />
                  </td>
                </tr>
              ))
            ) : null}

            {!loading && error ? (
              <tr>
                <td colSpan={6} className="py-8 text-center">
                  <p className="text-xs text-rose-600">{error}</p>
                  <Button variant="ghost" type="button" onClick={() => void fetchPendingTasks()} className="mt-2 text-xs text-blue-600">
                    重试
                  </Button>
                </td>
              </tr>
            ) : null}

            {!loading && !error && visibleTasks.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-10 text-center">
                  <CheckCircle2 className="mx-auto h-9 w-9 text-emerald-400" />
                  <p className="mt-3 text-sm font-medium text-slate-700">当前筛选下没有待处理任务</p>
                </td>
              </tr>
            ) : null}

            {!loading && !error
              ? visibleTasks.map((task) => {
                  const progress = Math.max(0, Math.min(task.progress, 100))
                  return (
                    <tr
                      key={task.id}
                      className="group border-b border-slate-100 transition-colors hover:bg-slate-50/60"
                    >
                      <td className="py-3 pr-4">
                        <span className={cn('block h-1.5 w-1.5 rounded-full', getPriorityDotClass(task.due_status))} />
                      </td>
                      <td className="max-w-[240px] py-3 pr-4">
                        <Link
                          to={projectId ? `/projects/${projectId}/gantt?task=${task.id}` : '/company'}
                          className="block truncate text-sm font-medium text-slate-800 hover:text-blue-600"
                        >
                          {task.title}
                        </Link>
                        <div className="mt-1 text-[11px] text-slate-400">{task.assignee_unit || task.due_label}</div>
                      </td>
                      <td className="py-3 pr-4">
                        <div className="flex items-center gap-2 text-xs text-slate-500">
                          <AssigneeAvatar name={task.assignee} />
                          <span className="max-w-[80px] truncate">{task.assignee || '未分配'}</span>
                        </div>
                      </td>
                      <td className="num-mono py-3 pr-4 text-xs text-slate-500">{formatDate(task.end_date)}</td>
                      <td className="py-3 pr-4">
                        <div className="flex items-center gap-2">
                          <div className="h-[3px] w-24 overflow-hidden rounded-full bg-slate-100">
                            <div
                              className={cn('h-full rounded-full transition-all duration-200 group-hover:h-1 group-hover:bg-blue-500', getProgressColorClass(task.due_status))}
                              style={{ width: `${Math.max(progress, 4)}%` }}
                            />
                          </div>
                          <span className={cn('num-mono w-9 text-right text-xs text-slate-600', progress === 0 && 'text-slate-400')}>
                            {progress}%
                          </span>
                        </div>
                      </td>
                      <td className="py-3 text-right">
                        <ChevronRight className="ml-auto h-3.5 w-3.5 text-slate-200 transition-colors group-hover:text-slate-500" />
                      </td>
                    </tr>
                  )
                })
              : null}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-slate-200/60 pt-3 text-xs text-slate-500">
        <span>共 {filteredTasks.length} 个</span>
        <span className="inline-flex items-center gap-1">
          {stats.overdue > 0 ? <AlertCircle className="h-3.5 w-3.5 text-rose-500" /> : stats.urgent > 0 ? <Clock className="h-3.5 w-3.5 text-amber-500" /> : <UserRound className="h-3.5 w-3.5 text-slate-400" />}
          按优先级与截止时间排序
        </span>
      </div>
    </section>
  )
}
