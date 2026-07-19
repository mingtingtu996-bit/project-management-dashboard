import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertCircle, CheckCircle2, ChevronRight, ChevronsUpDown, Clock, UserRound } from 'lucide-react'

import { CardHead } from '@/components/ui/card-head'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { apiGet, isAbortError } from '@/lib/apiClient'
import type { DurationMetricDto } from '@/lib/durationMetric'
import { cn } from '@/lib/utils'

interface TaskWithDue {
  id: string
  title: string
  status: 'pending' | 'in_progress' | 'blocked' | 'completed'
  statusLabel?: string
  progress: number
  assignee?: string
  assigneeUnit?: string
  endDate?: string
  dueDuration: DurationMetricDto
  dueStatus: 'overdue' | 'urgent' | 'approaching' | 'normal'
  dueLabel: string
  updatedAt?: string
}

interface TaskStats {
  total: number
  overdue: number
  urgent: number
  approaching: number
  normal: number
}

type FilterType = 'today' | '3days' | 'week' | 'urgent'

interface RecentTasksCardProps {
  projectId: string
  onViewAll?: () => void
  embedded?: boolean
}

interface FocusTasksPayload {
  filter: FilterType
  stats: TaskStats
  items: TaskWithDue[]
  totalCount: number
}

const FILTER_OPTIONS = [
  { value: 'today', label: '今日' },
  { value: '3days', label: '3天内' },
  { value: 'week', label: '本周' },
  { value: 'urgent', label: '紧急' },
] as const

function getProgressColorClass(dueStatus: TaskWithDue['dueStatus']) {
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

function getPriorityDotClass(dueStatus: TaskWithDue['dueStatus']) {
  switch (dueStatus) {
    case 'overdue':
      return 'bg-rose-500'
    case 'urgent':
      return 'bg-amber-500'
    case 'approaching':
      return 'bg-blue-600'
    default:
      return 'bg-slate-300'
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
    <span className="meta-text inline-flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 font-medium">
      {initial}
    </span>
  )
}

export default function RecentTasksCard({ projectId, onViewAll, embedded = false }: RecentTasksCardProps) {
  const [tasks, setTasks] = useState<TaskWithDue[]>([])
  const [stats, setStats] = useState<TaskStats>({ total: 0, overdue: 0, urgent: 0, approaching: 0, normal: 0 })
  const [totalCount, setTotalCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeFilter, setActiveFilter] = useState<FilterType>('today')
  const [userSelectedFilter, setUserSelectedFilter] = useState(false)

  const fetchPendingTasks = useCallback(async () => {
    if (!projectId) {
      setTasks([])
      setStats({ total: 0, overdue: 0, urgent: 0, approaching: 0, normal: 0 })
      setTotalCount(0)
      setLoading(false)
      return
    }

    try {
      setLoading(true)
      setError(null)

      const payload = await apiGet<FocusTasksPayload>(
        `/api/projects/${encodeURIComponent(projectId)}/dashboard/focus-tasks?filter=${activeFilter}&limit=6`,
        { runtimeCache: 'off' },
      )

      setTasks(Array.isArray(payload?.items) ? payload.items : [])
      setStats(payload?.stats ?? { total: 0, overdue: 0, urgent: 0, approaching: 0, normal: 0 })
      setTotalCount(Number(payload?.totalCount ?? payload?.items?.length ?? 0))
      if (
        activeFilter === 'today'
        && !userSelectedFilter
        && Number(payload?.totalCount ?? payload?.items?.length ?? 0) === 0
      ) {
        setActiveFilter('week')
      }
    } catch (fetchError: unknown) {
      if (isAbortError(fetchError)) return
      if (import.meta.env.DEV) {
        console.error('获取待完成任务失败', fetchError)
      }
      setTasks([])
      setStats({ total: 0, overdue: 0, urgent: 0, approaching: 0, normal: 0 })
      setTotalCount(0)
      setError(fetchError instanceof Error ? fetchError.message : '获取任务失败')
    } finally {
      setLoading(false)
    }
  }, [activeFilter, projectId, userSelectedFilter])

  useEffect(() => {
    void fetchPendingTasks()
  }, [fetchPendingTasks])

  const visibleTasks = tasks
  const panelClassName = embedded ? '' : 'surface-card h-full p-5'

  return (
    <section data-testid="dashboard-focus-tasks-panel" className={panelClassName}>
      {!embedded ? (
        <CardHead
          eyebrow="FOCUS"
          title="一周重点关注任务"
          action={
            <Link
              to={projectId ? `/projects/${projectId}/gantt` : '/workspace'}
              className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 transition-colors hover:text-blue-800"
              onClick={onViewAll}
            >
              全部任务
              <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          }
        />
      ) : null}

      <div className={cn('flex flex-wrap items-center justify-between gap-3', !embedded && 'mt-4')}>
        <SegmentedControl
          options={FILTER_OPTIONS.map((option) => ({ value: option.value, label: option.label }))}
          value={activeFilter}
          onChange={(value) => {
            setUserSelectedFilter(true)
            setActiveFilter(value as FilterType)
          }}
        />
        <div className="meta-text flex flex-wrap items-center gap-3">
          {stats.overdue > 0 ? <span className="inline-flex items-center gap-1.5 text-rose-600"><span className="h-1.5 w-1.5 rounded-full bg-rose-500" />延期 {stats.overdue}</span> : null}
          {stats.urgent > 0 ? <span className="inline-flex items-center gap-1.5 text-amber-600"><span className="h-1.5 w-1.5 rounded-full bg-amber-500" />紧急 {stats.urgent}</span> : null}
          {stats.approaching > 0 ? <span className="inline-flex items-center gap-1.5 text-blue-600"><span className="h-1.5 w-1.5 rounded-full bg-blue-600" />7天内 {stats.approaching}</span> : null}
        </div>
      </div>

      <div className="mt-4 overflow-x-auto">
        <Table className="min-w-[720px] border-collapse">
          <TableHeader>
            <TableRow className="border-b border-slate-200">
              {['优先级', '任务', '负责人', '截止', '进度', ''].map((label) => (
                <TableHead key={label || 'action'} className="eyebrow group h-auto px-0 py-2 pr-4 text-left">
                  <span className="inline-flex items-center gap-1">
                    {label}
                    {label ? <ChevronsUpDown className="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-100" strokeWidth={1.5} /> : null}
                  </span>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              [0, 1, 2].map((item) => (
                <TableRow key={item} className="border-b border-slate-100">
                  <TableCell colSpan={6} className="px-0 py-3">
                    <Skeleton className="h-7 w-full rounded-md bg-slate-100" />
                  </TableCell>
                </TableRow>
              ))
            ) : null}

            {!loading && error ? (
              <TableRow>
                <TableCell colSpan={6} className="px-0 py-8 text-center">
                  <p className="text-xs text-rose-600">{error}</p>
                  <Button variant="ghost" type="button" onClick={() => void fetchPendingTasks()} className="mt-2 text-xs text-blue-600">
                    重试
                  </Button>
                </TableCell>
              </TableRow>
            ) : null}

            {!loading && !error && visibleTasks.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="px-0 py-10 text-center">
                  <CheckCircle2 className="mx-auto h-9 w-9 text-emerald-400" />
                  <p className="mt-3 text-sm font-medium text-slate-700">
                    {activeFilter === 'today' ? '今日暂无待处理事项' : '当前筛选下没有待处理任务'}
                  </p>
                </TableCell>
              </TableRow>
            ) : null}

            {!loading && !error
              ? visibleTasks.map((task) => {
                  const progress = Math.max(0, Math.min(task.progress, 100))
                  return (
                    <TableRow
                      key={task.id}
                      className="group border-b border-slate-100 transition-colors hover:bg-slate-50/60"
                    >
                      <TableCell className="px-0 py-3 pr-4">
                        <span className={cn('block h-1.5 w-1.5 rounded-full', getPriorityDotClass(task.dueStatus))} />
                      </TableCell>
                      <TableCell className="max-w-[240px] px-0 py-3 pr-4">
                        <Link
                          to={projectId ? `/projects/${projectId}/gantt?task=${task.id}` : '/workspace'}
                          className="block truncate text-sm font-medium text-slate-800 hover:text-blue-600"
                        >
                          {task.title}
                        </Link>
                        <div className="meta-muted mt-1">{task.assigneeUnit || task.dueLabel}</div>
                      </TableCell>
                      <TableCell className="px-0 py-3 pr-4">
                        <div className="flex items-center gap-2 text-xs text-slate-500">
                          <AssigneeAvatar name={task.assignee} />
                          <span className="max-w-[80px] truncate">{task.assignee || '未分配'}</span>
                        </div>
                      </TableCell>
                      <TableCell className="num-mono px-0 py-3 pr-4 text-xs text-slate-500">{formatDate(task.endDate)}</TableCell>
                      <TableCell className="px-0 py-3 pr-4">
                        <div className="flex items-center gap-2">
                          <div className="h-[3px] w-24 overflow-hidden rounded-full bg-slate-100">
                            <div
                              className={cn('h-full rounded-full transition-all duration-200 group-hover:h-1 group-hover:bg-blue-600', getProgressColorClass(task.dueStatus))}
                              style={{ width: `${Math.max(progress, 4)}%` }}
                            />
                          </div>
                          <span className={cn('num-mono w-9 text-right text-xs text-slate-600', progress === 0 && 'text-slate-400')}>
                            {progress}%
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="px-0 py-3 text-right">
                        <ChevronRight className="ml-auto h-3.5 w-3.5 text-slate-200 transition-colors group-hover:text-slate-500" />
                      </TableCell>
                    </TableRow>
                  )
                })
              : null}
          </TableBody>
        </Table>
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-slate-200/60 pt-3 text-xs text-slate-500">
        <span>共 {totalCount} 个</span>
        <span className="inline-flex items-center gap-1">
          {stats.overdue > 0 ? <AlertCircle className="h-3.5 w-3.5 text-rose-500" /> : stats.urgent > 0 ? <Clock className="h-3.5 w-3.5 text-amber-500" /> : <UserRound className="h-3.5 w-3.5 text-slate-400" />}
          按优先级与截止时间排序
        </span>
      </div>
    </section>
  )
}
