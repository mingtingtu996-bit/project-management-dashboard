import { Link, useParams } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'

import { CardHead } from '@/components/ui/card-head'
import { cn } from '@/lib/utils'

interface MilestoneItem {
  id: string
  name: string
  dueDate: string
  status: 'completed' | 'pending' | 'delayed'
  progress?: number
  projectId: string
  assignee?: string
  relatedTasks?: number
  onTimeRate?: number
}

interface DashboardMilestoneCardProps {
  completed: number
  total: number
  upcoming: number
  overdue: number
  recentMilestones: MilestoneItem[]
  onViewAll?: () => void
  embedded?: boolean
}

function getDaysRemaining(dueDate: string): { text: string; isOverdue: boolean; isUrgent: boolean } {
  if (!dueDate || dueDate === 'Invalid Date') {
    return { text: '--', isOverdue: false, isUrgent: false }
  }

  const due = new Date(dueDate)
  if (Number.isNaN(due.getTime())) {
    return { text: '--', isOverdue: false, isUrgent: false }
  }

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  due.setHours(0, 0, 0, 0)
  const diffDays = Math.ceil((due.getTime() - today.getTime()) / 86400000)

  if (diffDays < 0) return { text: `延期 ${Math.abs(diffDays)}天`, isOverdue: true, isUrgent: false }
  if (diffDays === 0) return { text: '今天', isOverdue: false, isUrgent: true }
  if (diffDays === 1) return { text: '明天', isOverdue: false, isUrgent: true }
  if (diffDays <= 3) return { text: `${diffDays}天后`, isOverdue: false, isUrgent: true }
  return { text: `${diffDays}天后`, isOverdue: false, isUrgent: false }
}

function formatDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '--'
  return date.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' })
}

function milestoneHref(projectId: string, milestoneId?: string) {
  if (!projectId) return '/milestones'
  return `/projects/${projectId}/milestones${milestoneId ? `?highlight=${milestoneId}` : ''}`
}

export default function DashboardMilestoneCard({
  completed,
  total,
  upcoming,
  overdue,
  recentMilestones,
  onViewAll,
  embedded = false,
}: DashboardMilestoneCardProps) {
  const params = useParams<{ id?: string; projectId?: string }>()
  const urlProjectId = params.id || params.projectId || ''
  const projectId = recentMilestones[0]?.projectId || urlProjectId || ''
  const reportsHref = projectId ? `/projects/${projectId}/reports?view=progress_deviation` : '/reports?view=progress_deviation'
  const unfinishedMilestones = recentMilestones
    .filter((milestone) => milestone.status !== 'completed')
    .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
  const nextMilestone = unfinishedMilestones[0]
  const remaining = nextMilestone ? getDaysRemaining(nextMilestone.dueDate) : null
  const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0
  const panelClassName = embedded ? '' : 'surface-card p-5'
  const timelineMilestones = unfinishedMilestones
    .filter((milestone) => milestone.id !== nextMilestone?.id)
    .slice(0, 5)

  return (
    <section className={panelClassName}>
      <CardHead
        eyebrow="MILESTONE"
        title="里程碑追踪"
        pill={{ label: overdue > 0 ? `${overdue} 逾期` : `${completed}/${total}`, variant: overdue > 0 ? 'danger' : 'info' }}
        action={
          <Link
            data-testid="dashboard-milestone-reports-link"
            to={reportsHref}
            className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 transition-colors hover:text-blue-800"
          >
            查看详情
            <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        }
      />

      <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <Link
          to={milestoneHref(projectId, nextMilestone?.id)}
          onClick={onViewAll}
          className="rounded-xl border border-slate-200/60 bg-slate-50/60 p-5 outline-none transition-colors hover:bg-white focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          {nextMilestone && remaining ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="eyebrow">NEXT NODE</div>
                  <h4 className="mt-1 truncate text-base font-semibold text-slate-900">{nextMilestone.name}</h4>
                  <p className="mt-1 text-xs text-slate-500">计划节点 {formatDate(nextMilestone.dueDate)}</p>
                </div>
                <span
                  className={cn(
                    'inline-flex h-6 items-center rounded-full px-2.5 text-xs font-medium ring-1 ring-inset',
                    remaining.isOverdue
                      ? 'bg-rose-50 text-rose-700 ring-rose-200/70'
                      : remaining.isUrgent
                        ? 'bg-amber-50 text-amber-700 ring-amber-200/70'
                        : 'bg-blue-50 text-blue-700 ring-blue-200/70',
                  )}
                >
                  {remaining.text}
                </span>
              </div>

              <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
                <div className="rounded-lg bg-white px-3 py-3">
                  <div className="text-xs text-slate-500">责任人/单位</div>
                  <div className="mt-1 truncate font-medium text-slate-800">{nextMilestone.assignee || '未分配'}</div>
                </div>
                <div className="rounded-lg bg-white px-3 py-3">
                  <div className="text-xs text-slate-500">关联任务</div>
                  <div className={cn('num-mono mt-1 font-medium text-slate-800', !nextMilestone.relatedTasks && 'text-slate-400')}>
                    {nextMilestone.relatedTasks || 0} 项
                  </div>
                </div>
                <div className="rounded-lg bg-white px-3 py-3">
                  <div className="text-xs text-slate-500">准时率</div>
                  <div className={cn('num-mono mt-1 font-medium text-emerald-600', nextMilestone.onTimeRate == null && 'text-slate-400')}>
                    {nextMilestone.onTimeRate != null ? `${nextMilestone.onTimeRate}%` : '--'}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex min-h-32 flex-col items-center justify-center text-center">
              <div className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-200/60">
                已完成
              </div>
              <p className="mt-3 text-sm font-medium text-slate-700">所有里程碑已完成</p>
            </div>
          )}
        </Link>

        <div className="rounded-xl border border-slate-200/60 bg-white p-5">
          <div className="eyebrow">SUMMARY</div>
          <div className="mt-3 flex items-end gap-2">
            <span className={cn('metric-value-2xl num-display font-semibold leading-none text-slate-900', completionRate === 0 && 'text-slate-400')}>
              {completionRate}%
            </span>
            <span className="pb-1 text-xs text-slate-400">完成率</span>
          </div>
          <div className="mt-4 h-[3px] overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-blue-600" style={{ width: `${Math.max(completionRate, 4)}%` }} />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 text-xs text-slate-500">
            <div>
              <div>偏移</div>
              <div className={cn('num-mono mt-1 text-sm text-slate-800', upcoming === 0 && 'text-slate-400')}>{upcoming}</div>
            </div>
            <div>
              <div>逾期</div>
              <div className={cn('num-mono mt-1 text-sm text-slate-800', overdue === 0 && 'text-slate-400')}>{overdue}</div>
            </div>
          </div>
        </div>
      </div>

      {timelineMilestones.length > 0 ? (
        <div className="mt-5 border-t border-slate-100 pt-4">
          <div className="eyebrow mb-3">TIMELINE</div>
          <div className="space-y-2">
            {timelineMilestones.map((milestone, index) => (
              <Link
                key={milestone.id}
                to={milestoneHref(projectId, milestone.id)}
                onClick={onViewAll}
                className="group flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2 text-sm outline-none transition-colors hover:bg-white focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                <span className="min-w-0 truncate text-slate-700">{index + 2}. {milestone.name}</span>
                <span className="flex shrink-0 items-center gap-1.5">
                  <span className="num-mono text-xs text-slate-500">{getDaysRemaining(milestone.dueDate).text}</span>
                  <ChevronRight className="h-3.5 w-3.5 text-slate-200 transition-colors group-hover:text-slate-500" />
                </span>
              </Link>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  )
}
