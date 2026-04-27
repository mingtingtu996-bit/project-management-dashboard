import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertCircle, Building2, CheckCircle2, ChevronRight, Clock, Filter, User } from 'lucide-react'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { StatusBadge } from '@/components/ui/status-badge'
import { safeJsonParse, safeStorageGet } from '@/lib/browserStorage'
import { getTaskDisplayStatus, isCompletedTask } from '@/lib/taskBusinessStatus'
import { getStatusTheme } from '@/lib/statusTheme'

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

function getDueColorClass(dueStatus: TaskWithDue['due_status']) {
  switch (dueStatus) {
    case 'overdue':
      return getStatusTheme('overdue').className
    case 'urgent':
      return getStatusTheme('medium').className
    case 'approaching':
      return getStatusTheme('info').className
    default:
      return getStatusTheme('open').className
  }
}

function getBorderColorClass(dueStatus: TaskWithDue['due_status']) {
  switch (dueStatus) {
    case 'overdue':
      return 'border-l-red-500'
    case 'urgent':
      return 'border-l-amber-500'
    case 'approaching':
      return 'border-l-blue-500'
    default:
      return 'border-l-slate-300'
  }
}

function getProgressColorClass(dueStatus: TaskWithDue['due_status']) {
  switch (dueStatus) {
    case 'overdue':
      return 'bg-red-500'
    case 'urgent':
      return 'bg-amber-500'
    case 'approaching':
      return 'bg-blue-500'
    default:
      return 'bg-emerald-500'
  }
}

function getStatusLabel(status: TaskWithDue['status']) {
  switch (status) {
    case 'completed':
      return '已完成'
    case 'blocked':
      return '受阻'
    case 'in_progress':
      return '进行中'
    default:
      return '待开始'
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
      dueLabel: '未设置截止日期',
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
      dueLabel: `已延期 ${Math.abs(diff)} 天`,
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
      dueLabel: `${diff} 天后截止`,
    }
  }

  if (diff <= 7) {
    return {
      endDate,
      daysUntilDue: diff,
      dueStatus: 'approaching' as const,
      dueLabel: `${diff} 天后截止`,
    }
  }

  return {
    endDate,
    daysUntilDue: diff,
    dueStatus: 'normal' as const,
    dueLabel: `${diff} 天后截止`,
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

function FilterButton({
  activeFilter,
  count,
  label,
  onClick,
}: {
  activeFilter: boolean
  count: number
  label: string
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-2.5 py-1 text-xs font-medium transition-all ${
        activeFilter ? 'bg-blue-500 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
      }`}
      type="button"
    >
      {label}
      {count > 0 ? (
        <span className={`ml-1 ${activeFilter ? 'text-blue-100' : 'text-slate-400'}`}>{count}</span>
      ) : null}
    </button>
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
        console.error('获取待完成任务失败:', fetchError)
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

  if (!loading && !error && tasks.length === 0) {
    return (
      <Card variant="metric" className="h-full">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium text-slate-700">最近待完成任务</CardTitle>
            <Link
              to={`/projects/${projectId}/gantt`}
              className="flex items-center text-xs text-blue-600 hover:text-blue-800"
              onClick={onViewAll}
            >
              查看全部
              <ChevronRight className="ml-1 h-3 w-3" />
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50">
              <CheckCircle2 className="h-8 w-8 text-emerald-500" />
            </div>
            <p className="text-sm font-medium text-slate-700">太棒了</p>
            <p className="mt-1 text-xs text-slate-400">当前没有待完成任务</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card variant="metric" className="h-full">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium text-slate-700">最近待完成任务</CardTitle>
          <Link
            to={projectId ? `/projects/${projectId}/gantt` : '/company'}
            className="flex items-center text-xs text-blue-600 hover:text-blue-800"
            onClick={onViewAll}
          >
            查看全部
            <ChevronRight className="ml-1 h-3 w-3" />
          </Link>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Filter className="h-3 w-3 text-slate-400" />
          <FilterButton activeFilter={activeFilter === 'all'} count={stats.total} label="全部" onClick={() => setActiveFilter('all')} />
          <FilterButton activeFilter={activeFilter === '7days'} count={stats.overdue + stats.urgent} label="7天内" onClick={() => setActiveFilter('7days')} />
          <FilterButton activeFilter={activeFilter === 'overdue'} count={stats.overdue} label="已延期" onClick={() => setActiveFilter('overdue')} />
          <FilterButton activeFilter={activeFilter === 'urgent'} count={stats.overdue + stats.urgent} label="紧急" onClick={() => setActiveFilter('urgent')} />
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center space-x-3">
              {stats.overdue > 0 ? (
                <span className="flex items-center text-red-600">
                  <span className="mr-1 h-2 w-2 rounded-full bg-red-500" />
                  已延期 {stats.overdue}
                </span>
              ) : null}
              {stats.urgent > 0 ? (
                <span className="flex items-center text-amber-600">
                  <span className="mr-1 h-2 w-2 rounded-full bg-amber-500" />
                  紧急 {stats.urgent}
                </span>
              ) : null}
              {stats.approaching > 0 ? (
                <span className="flex items-center text-blue-600">
                  <span className="mr-1 h-2 w-2 rounded-full bg-blue-500" />
                  即将到期 {stats.approaching}
                </span>
              ) : null}
              {stats.normal > 0 ? (
                <span className="flex items-center text-slate-500">
                  <span className="mr-1 h-2 w-2 rounded-full bg-slate-400" />
                  正常 {stats.normal}
                </span>
              ) : null}
            </div>
            <span className="text-slate-400">共 {filteredTasks.length} 个</span>
          </div>

          <div className="max-h-[320px] space-y-2 overflow-y-auto pr-1">
            {loading ? (
              <>
                {[1, 2, 3].map((item) => (
                  <div key={item} className="rounded-lg bg-slate-50 p-3">
                    <Skeleton className="mb-2 h-4 w-3/4 rounded-full bg-slate-200" />
                    <Skeleton className="h-3 w-1/2 rounded-full bg-slate-200" />
                  </div>
                ))}
              </>
            ) : null}

            {!loading && error ? (
              <div className="py-4 text-center">
                <p className="text-xs text-red-600">{error}</p>
                <button type="button" onClick={() => void fetchPendingTasks()} className="mt-2 text-xs text-blue-600 hover:underline">
                  重试
                </button>
              </div>
            ) : null}

            {!loading && !error && filteredTasks.length === 0 ? (
              <div className="py-6 text-center text-slate-400">
                <Filter className="mx-auto mb-2 h-8 w-8 opacity-50" />
                <p className="text-xs">该筛选条件下没有任务</p>
              </div>
            ) : null}

            {!loading && !error
              ? filteredTasks.slice(0, 5).map((task) => (
                  <Link
                    key={task.id}
                    to={projectId ? `/projects/${projectId}/gantt?task=${task.id}` : '/company'}
                    className={`block rounded-xl border border-slate-100 border-l-4 bg-white p-3 transition-shadow hover:shadow-sm ${getBorderColorClass(task.due_status)}`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="min-w-0 flex-1">
                        <h4 className="truncate text-sm font-medium text-slate-900">{task.title}</h4>
                        <div className="mt-1 flex items-center text-xs text-slate-400">
                          {task.assignee ? (
                            <span className="mr-3 flex items-center">
                              <User className="mr-1 h-3 w-3" />
                              {task.assignee}
                            </span>
                          ) : null}
                          {task.assignee_unit ? (
                            <span className="flex items-center">
                              <Building2 className="mr-1 h-3 w-3" />
                              {task.assignee_unit}
                            </span>
                          ) : null}
                        </div>
                        <div className="mt-2">
                          <div className="mb-1 flex items-center justify-between text-xs">
                            <span className="text-slate-400">进度</span>
                            <span className="font-medium text-slate-700">{task.progress}%</span>
                          </div>
                          <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                            <div className={`h-full rounded-full ${getProgressColorClass(task.due_status)}`} style={{ width: `${Math.max(0, Math.min(task.progress, 100))}%` }} />
                          </div>
                        </div>
                      </div>

                      <div className="ml-3 flex flex-col items-end space-y-1">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${getDueColorClass(task.due_status)}`}>
                          {task.due_label}
                        </span>
                        <StatusBadge status={task.status} className="px-2 py-0.5 text-xs">
                          {getStatusLabel(task.status)}
                        </StatusBadge>
                      </div>
                    </div>
                  </Link>
                ))
              : null}
          </div>

          {!loading && !error ? (
            <div className="border-t border-slate-100 pt-2 text-xs text-slate-400">
              {stats.overdue > 0 ? (
                <p className="flex items-center text-red-600">
                  <AlertCircle className="mr-1 h-3 w-3" />
                  当前有 {stats.overdue} 个任务已延期，需要尽快处理
                </p>
              ) : stats.urgent > 0 ? (
                <p className="flex items-center text-amber-600">
                  <Clock className="mr-1 h-3 w-3" />
                  当前有 {stats.urgent} 个任务即将到期
                </p>
              ) : (
                <p className="flex items-center text-emerald-600">
                  <CheckCircle2 className="mr-1 h-3 w-3" />
                  当前任务进度整体正常
                </p>
              )}
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  )
}
