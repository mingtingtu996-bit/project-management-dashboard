import { ArrowLeft, Building2, CalendarCheck, CalendarDays, GitBranch, List, Plus } from 'lucide-react'

import { Breadcrumb } from '@/components/Breadcrumb'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/ui/button'
import { PROJECT_NAVIGATION_LABELS } from '@/config/navigation'

interface PlanningGovernanceSummary {
  activeCount?: number | null
  dashboardCloseoutOverdue?: boolean | null
  dashboardForceUnlockAvailable?: boolean | null
}

interface GanttViewHeaderProps {
  projectId: string
  projectName?: string | null
  planningGovernance?: PlanningGovernanceSummary | null
  viewMode: 'list' | 'timeline'
  onBack: () => void
  onViewModeChange: (mode: 'list' | 'timeline') => void
  onOpenCriticalPath: () => void
  onOpenParticipantUnits: () => void
  onCreateTask: () => void
  onOpenCloseout: () => void
  onScrollToToday?: () => void
}

export function GanttViewHeader({
  projectId,
  projectName,
  planningGovernance,
  viewMode,
  onBack,
  onViewModeChange,
  onOpenCriticalPath,
  onOpenParticipantUnits,
  onCreateTask,
  onOpenCloseout,
  onScrollToToday,
}: GanttViewHeaderProps) {
  const hasCloseoutGovernanceSignal = Boolean(
    planningGovernance?.dashboardCloseoutOverdue || planningGovernance?.dashboardForceUnlockAvailable,
  )

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
        <Button variant="outline" onClick={onOpenParticipantUnits} data-testid="gantt-open-participant-units">
          <Building2 className="mr-2 h-4 w-4" />
          参建单位台账
        </Button>
        {onScrollToToday && (
          <Button variant="outline" onClick={onScrollToToday} data-testid="gantt-scroll-to-today">
            <CalendarCheck className="mr-2 h-4 w-4" />
            今天
          </Button>
        )}
        <Button onClick={onCreateTask}>
          <Plus className="mr-2 h-4 w-4" />
          新建任务
        </Button>
      </PageHeader>

      {hasCloseoutGovernanceSignal ? (
        <div
          data-testid="gantt-closeout-banner"
          className="flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-900 md:flex-row md:items-center md:justify-between"
        >
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">
                关账治理提醒
              </span>
              {planningGovernance?.activeCount ? (
                <span
                  data-testid="gantt-closeout-marker"
                  className="inline-flex items-center rounded-full bg-white px-2.5 py-1 text-xs font-medium text-amber-800"
                >
                  月末待处理事项 {planningGovernance.activeCount}
                </span>
              ) : null}
              {planningGovernance?.dashboardForceUnlockAvailable ? (
                <span className="inline-flex items-center rounded-full bg-white px-2.5 py-1 text-xs font-medium text-amber-800">
                  已到第 7 天
                </span>
              ) : null}
            </div>
          </div>
          <Button
            data-testid="gantt-closeout-entry"
            variant="outline"
            onClick={onOpenCloseout}
            className="border-amber-300 bg-white text-amber-900 hover:bg-amber-100"
          >
            打开月末关账工作台
          </Button>
        </div>
      ) : null}
    </div>
  )
}
