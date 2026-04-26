import { ArrowLeft, CalendarCheck, CalendarDays, FileText, GitBranch, Layers3, List, Plus } from 'lucide-react'

import { Breadcrumb } from '@/components/Breadcrumb'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/ui/button'
import { PROJECT_NAVIGATION_LABELS } from '@/config/navigation'

interface PlanningGovernanceSummary {
  activeCount?: number | null
  dashboardCloseoutOverdue?: boolean | null
  dashboardForceUnlockAvailable?: boolean | null
  governancePhase?: 'free_edit' | 'monthly_pending' | 'formal_execution' | 'pending_realign' | 'reordering' | 'closeout' | null
}

interface GanttViewHeaderProps {
  projectId: string
  projectName?: string | null
  planningGovernance?: PlanningGovernanceSummary | null
  viewMode: 'list' | 'timeline'
  canEdit: boolean
  onBack: () => void
  onViewModeChange: (mode: 'list' | 'timeline') => void
  onOpenCriticalPath: () => void
  onOpenTaskSummary: () => void
  onOpenScopeDimensions: () => void
  onCreateTask: () => void
  onOpenCloseout: () => void
  onScrollToToday?: () => void
}

export function GanttViewHeader({
  projectId,
  projectName,
  planningGovernance,
  viewMode,
  canEdit,
  onBack,
  onViewModeChange,
  onOpenCriticalPath,
  onOpenTaskSummary,
  onOpenScopeDimensions,
  onCreateTask,
  onOpenCloseout,
  onScrollToToday,
}: GanttViewHeaderProps) {
  const hasCloseoutGovernanceSignal = Boolean(
    planningGovernance?.dashboardCloseoutOverdue || planningGovernance?.dashboardForceUnlockAvailable,
  )
  const governancePhase = planningGovernance?.governancePhase ?? (hasCloseoutGovernanceSignal ? 'closeout' : null)

  const governanceBanner = (() => {
    switch (governancePhase) {
      case 'monthly_pending':
        return {
          testId: 'gantt-governance-banner-monthly-pending',
          badge: '月计划待确认',
          className: 'border-sky-200 bg-sky-50 text-sky-900',
          badgeClassName: 'bg-sky-100 text-sky-800',
          description: '当前月计划尚未确认，建议先完成确认再进入正式执行。',
        }
      case 'pending_realign':
        return {
          testId: 'gantt-governance-banner-pending-realign',
          badge: '基线待重定',
          className: 'border-amber-200 bg-amber-50 text-amber-900',
          badgeClassName: 'bg-amber-100 text-amber-800',
          description: '当前存在待重定的计划或基线调整，请先处理重定再继续推进。',
        }
      case 'reordering':
        return {
          testId: 'gantt-governance-banner-reordering',
          badge: '执行重排',
          className: 'border-violet-200 bg-violet-50 text-violet-900',
          badgeClassName: 'bg-violet-100 text-violet-800',
          description: '主动重排进行中，请在重排结束后再进行后续确认与关账。',
        }
      case 'closeout':
        return {
          testId: 'gantt-governance-banner-closeout',
          badge: '月末关账',
          className: 'border-rose-200 bg-rose-50 text-rose-900',
          badgeClassName: 'bg-rose-100 text-rose-800',
          description: '当前项目处于关账治理窗口，需要尽快完成关账处理。',
        }
      default:
        return null
    }
  })()

  return (
    <div data-testid="task-workspace-layer-l1" className="space-y-4">
      {projectName ? (
        <Breadcrumb
          items={[
            { label: PROJECT_NAVIGATION_LABELS.company, href: '/company' },
            { label: projectName || '当前项目', href: `/projects/${projectId}/dashboard` },
            { label: PROJECT_NAVIGATION_LABELS.tasks, href: `/projects/${projectId}/gantt` },
            { label: PROJECT_NAVIGATION_LABELS.taskList },
          ]}
        />
      ) : null}

      <PageHeader
        eyebrow={PROJECT_NAVIGATION_LABELS.tasks}
        title={`${PROJECT_NAVIGATION_LABELS.tasks} / ${PROJECT_NAVIGATION_LABELS.taskList}`}
      >
        <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1">
          <button
            type="button"
            data-testid="gantt-switch-list-view"
            onClick={() => onViewModeChange('list')}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition-colors ${viewMode === 'list' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
          >
            <List className="h-4 w-4" />
            列表视图
          </button>
          <button
            type="button"
            data-testid="gantt-switch-timeline-view"
            onClick={() => onViewModeChange('timeline')}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition-colors ${viewMode === 'timeline' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
          >
            <CalendarDays className="h-4 w-4" />
            横道图视图
          </button>
        </div>
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          {PROJECT_NAVIGATION_LABELS.dashboard}
        </Button>
        <Button variant="outline" onClick={onOpenCriticalPath} data-testid="gantt-open-critical-path-dialog">
          <GitBranch className="mr-2 h-4 w-4" />
          查看关键路径
        </Button>
        <Button variant="outline" onClick={onOpenTaskSummary} data-testid="gantt-open-task-summary">
          <FileText className="mr-2 h-4 w-4" />
          任务总结
        </Button>
        <Button variant="outline" onClick={onOpenScopeDimensions} data-testid="gantt-open-scope-dimensions">
          <Layers3 className="mr-2 h-4 w-4" />
          范围维度
        </Button>
        {onScrollToToday && (
          <Button variant="outline" onClick={onScrollToToday} data-testid="gantt-scroll-to-today">
            <CalendarCheck className="mr-2 h-4 w-4" />
            今天
          </Button>
        )}
        <Button onClick={onCreateTask} disabled={!canEdit}>
          <Plus className="mr-2 h-4 w-4" />
          新建任务
        </Button>
      </PageHeader>

      {governanceBanner ? (
        <div
          data-testid={governanceBanner.testId}
          className={`flex flex-col gap-3 rounded-2xl border px-5 py-4 text-sm md:flex-row md:items-center md:justify-between ${governanceBanner.className}`}
        >
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${governanceBanner.badgeClassName}`}>
                {governanceBanner.badge}
              </span>
              {planningGovernance?.activeCount ? (
                <span
                  data-testid="gantt-governance-marker"
                  className="inline-flex items-center rounded-full bg-white px-2.5 py-1 text-xs font-medium text-slate-700"
                >
                  治理信号 {planningGovernance.activeCount}
                </span>
              ) : null}
              {governancePhase === 'closeout' && planningGovernance?.dashboardForceUnlockAvailable ? (
                <span className="inline-flex items-center rounded-full bg-white px-2.5 py-1 text-xs font-medium text-amber-800">
                  已到第 7 天
                </span>
              ) : null}
            </div>
            <div className="text-sm font-medium">
              {governanceBanner.description}
            </div>
          </div>
          {governancePhase === 'closeout' ? (
            <Button
              data-testid="gantt-closeout-entry"
              variant="outline"
              onClick={onOpenCloseout}
              className="border-rose-300 bg-white text-rose-900 hover:bg-rose-100"
            >
              打开月末关账工作台
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
